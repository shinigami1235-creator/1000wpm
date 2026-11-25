"""Fabric textures for the outfits (tools/avatar/cloth_build.py).
Each garment gets two WebP files cut from its MakeHuman texture set and repacked to the
part of the UV atlas the bust uses:
  cloth_<name>_d.webp  grey fabric detail (folds, seams, knit), multiplied by the outfit
                       colour at runtime; alpha, when present, is a roughness scale
  cloth_<name>_n.webp  tangent-space normal map (OpenGL green)
plus small tiling detail normals shared by every garment (cloth_detail_<kind>.webp),
which js/app/avatar-cloth.js lays over the garment normal at fabric scale."""
import os, math, numpy as np
from PIL import Image, ImageFilter


def load(path, size=None, mode='RGB'):
    im = Image.open(path)
    if im.mode == 'P': im = im.convert('RGBA')
    im = im.convert(mode)
    if size and im.size != size: im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, float) / 255


def lum(a):
    return a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11


def crop_box(UV, pad=0.02):
    """The atlas rectangle (u0, v0, u1, v1) the kept triangles use, padded."""
    lo = np.clip(UV.min(0) - pad, 0, 1); hi = np.clip(UV.max(0) + pad, 0, 1)
    return lo[0], lo[1], hi[0], hi[1]


def crop(a, box):
    """Crop an image array (rows top-down) to an OBJ UV box (v up)."""
    H, W = a.shape[:2]; u0, v0, u1, v1 = box
    x0, x1 = int(u0 * W), int(math.ceil(u1 * W)); y0, y1 = int((1 - v1) * H), int(math.ceil((1 - v0) * H))
    return a[y0:y1, x0:x1]


def out_size(box, base=2048, cap=1024):
    w, h = (box[2] - box[0]) * base, (box[3] - box[1]) * base
    s = min(1.0, cap / max(w, h))
    return max(64, int(round(w * s / 4)) * 4), max(64, int(round(h * s / 4)) * 4)


def resize(a, size):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize(size, Image.LANCZOS), float) / 255


def blur(a, r):
    if a.ndim == 2: return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), float) / 255
    return np.stack([blur(a[..., k], r) for k in range(a.shape[2])], 2)


def height_to_normal(h, strength, wrap=False):
    if wrap: gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2
    else: gy, gx = np.gradient(h)
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2)[..., None]
    return n * 0.5 + 0.5


def blend_normals(a, b, kb=1.0):
    """Whiteout blend of two normal maps (0..1 encoded)."""
    A = a * 2 - 1; B = b * 2 - 1
    B[..., :2] *= kb
    n = np.dstack([A[..., 0] + B[..., 0], A[..., 1] + B[..., 1], A[..., 2] * B[..., 2]])
    n /= np.linalg.norm(n, axis=2)[..., None] + 1e-9
    return n * 0.5 + 0.5


def bleed(a, mask, n=6):
    """Fill texels outside mask with nearby values so mipmaps keep no dark borders."""
    out = a.copy(); m = mask.astype(float)
    for k in range(n):
        r = 2 ** k
        b = blur(out * m[..., None] if out.ndim == 3 else out * m, r)
        w = blur(m, r)
        fill = b / np.maximum(w[..., None] if out.ndim == 3 else w, 1e-4)
        sel = (m < 0.5) & (w > 0.02)
        out[sel] = fill[sel]; m = np.maximum(m, (w > 0.02).astype(float))
    return out


def uv_mask(UV, T, box, size):
    """Coverage of the kept triangles in the cropped image (True where used)."""
    from PIL import ImageDraw
    im = Image.new('L', size, 0); d = ImageDraw.Draw(im)
    u0, v0, u1, v1 = box; W, H = size
    for t in T:
        pts = [((UV[i][0] - u0) / (u1 - u0) * W, (1 - (UV[i][1] - v0) / (v1 - v0)) * H) for i in t]
        d.polygon(pts, fill=255)
    return np.asarray(im.filter(ImageFilter.MaxFilter(5)), float) / 255 > 0.5


def save_rgb(a, path, q=82):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(path, 'WEBP', quality=q, method=6)
    return os.path.getsize(path)


def save_rgba(rgb, alpha, path, q=82):
    o = np.dstack([rgb, alpha[..., None] if alpha.ndim == 2 else alpha])
    Image.fromarray((np.clip(o, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(path, 'WEBP', quality=q, alpha_quality=85, method=6)
    return os.path.getsize(path)


# ---------- tiling detail normals ----------
def _noise(size, freq, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((freq, freq))
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
    # make it tile: wrap by averaging with a rolled copy
    a = np.asarray(im, float) / 255
    return a


def tile_noise(size, cells, seed, octaves=3):
    """Smooth tiling value noise."""
    rng = np.random.default_rng(seed); out = np.zeros((size, size)); amp = 1.0; tot = 0
    for o in range(octaves):
        c = cells * 2 ** o
        g = rng.random((c, c))
        y = np.arange(size) * c / size; x = y
        i0 = np.floor(y).astype(int); f = y - i0; f = f * f * (3 - 2 * f)
        i1 = (i0 + 1) % c; i0 %= c
        row = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
        row1 = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
        out += amp * (row * (1 - f)[:, None] + row1 * f[:, None]); tot += amp; amp *= 0.5
    return out / tot


def detail(kind, size=256):
    """A tiling height pattern for one kind of fabric, returned as a normal map."""
    y, x = np.mgrid[0:size, 0:size] / size * 2 * math.pi
    if kind == 'jersey':
        # knit jersey: columns of small V loops
        h = 0.5 + 0.5 * np.sin(x * 32) * 0.6 + 0.25 * np.abs(np.sin(y * 32 + np.sin(x * 32) * 1.2))
        h = h * 0.7 + tile_noise(size, 16, 3) * 0.3; s = 2.2
    elif kind == 'pique':
        # polo pique: a fine honeycomb of raised cells
        h = np.abs(np.sin(x * 24) * np.sin(y * 24)) ** 0.6 + 0.2 * tile_noise(size, 32, 4); s = 3.0
    elif kind == 'rib':
        # sweater knit: vertical ribs of chained loops
        h = np.abs(np.sin(x * 12)) ** 0.7 * (0.75 + 0.25 * np.abs(np.sin(y * 24 + np.sign(np.sin(x * 12)) * 0.8))) + 0.15 * tile_noise(size, 16, 5); s = 3.2
    elif kind == 'fleece':
        h = tile_noise(size, 24, 6, 4) * 0.7 + 0.3 * np.abs(np.sin(x * 40) * np.sin(y * 40)) ** 0.5; s = 1.6
    elif kind == 'weave':
        # plain cotton weave: over-under threads
        wx = np.abs(np.sin(x * 40)); wy = np.abs(np.sin(y * 40))
        chk = (np.sin(x * 20) * np.sin(y * 20)) > 0
        h = np.where(chk, wx * 0.8 + 0.2 * wy, wy * 0.8 + 0.2 * wx) + 0.2 * tile_noise(size, 32, 7); s = 2.0
    elif kind == 'leather':
        # pebbled grain: cells from cellular noise, with fine creases
        rng = np.random.default_rng(8); n = 900
        pts = rng.random((n, 2)) * size
        yy, xx = np.mgrid[0:size, 0:size]
        d1 = np.full((size, size), 1e9); d2 = np.full((size, size), 1e9)
        for px, py in pts:
            dx = np.abs(xx - px); dx = np.minimum(dx, size - dx); dy = np.abs(yy - py); dy = np.minimum(dy, size - dy)
            d = np.sqrt(dx * dx + dy * dy)
            d2 = np.where(d < d1, d1, np.minimum(d2, d)); d1 = np.minimum(d1, d)
        h = np.clip((d2 - d1) / 7.0, 0, 1)
        h = h * h * (3 - 2 * h)
        h = blur_wrap(h, 1.2) + 0.3 * tile_noise(size, 48, 9); s = 1.8
    else:
        raise ValueError(kind)
    h = (h - h.min()) / (h.max() - h.min() + 1e-9)
    return height_to_normal(h, s, wrap=True)


def blur_wrap(a, r):
    n = a.shape[0]; t = np.tile(a, (3, 3))
    return blur(t, r)[n:2 * n, n:2 * n]


def write_details(out_dir, kinds=('jersey', 'pique', 'rib', 'fleece', 'weave', 'leather')):
    sizes = {}
    for k in kinds:
        p = os.path.join(out_dir, 'tex', f'cloth_detail_{k}.webp')
        sizes[k] = save_rgb(detail(k), p, q=88)
    return sizes
