"""Procedural textures for the avatar, all original work generated here.
Face textures are painted in the head's UV layout from a map of 3D positions, so any
function of a point on the head (a cheek, the upper lid line, the lips) becomes a
texture. Everything is written as WebP into assets/avatar/tex/."""
import math, os, numpy as np
from PIL import Image

RNG = np.random.default_rng(1729)


def rasterize(uv, attrs, tris, size):
    """Per texel: the barycentric blend of attrs (n, k) over the triangle that covers it.
    Returns (size, size, k) and a coverage mask. Image row 0 is v = 1."""
    out = np.zeros((size, size, attrs.shape[1]), np.float32); mask = np.zeros((size, size), bool)
    px = np.stack([uv[:, 0] * size - 0.5, (1 - uv[:, 1]) * size - 0.5], 1)
    for t in tris:
        a, b, c = px[t[0]], px[t[1]], px[t[2]]
        x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        v0, v1 = b - a, c - a; den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12: continue
        dx, dy = X - a[0], Y - a[1]
        w1 = (dx * v1[1] - v1[0] * dy) / den; w2 = (v0[0] * dy - dx * v0[1]) / den; w0 = 1 - w1 - w2
        ins = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not ins.any(): continue
        val = w0[..., None] * attrs[t[0]] + w1[..., None] * attrs[t[1]] + w2[..., None] * attrs[t[2]]
        ys, xs = Y[ins], X[ins]
        out[ys, xs] = val[ins]; mask[ys, xs] = True
    return out, mask


def dilate(img, mask, n=6):
    """Bleed colour past the island edges so filtering never picks up the background."""
    img = img.copy(); m = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(img); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(m, (dy, dx), (0, 1)); si = np.roll(img, (dy, dx), (0, 1))
            acc += si * sm[..., None]; cnt += sm
        new = (~m) & (cnt > 0)
        img[new] = acc[new] / cnt[new][:, None]; m = m | new
    return img


def noise2(size, scale, seed):
    """Smooth value noise, tileable, in [0, 1]."""
    r = np.random.default_rng(seed)
    g = r.random((scale, scale))
    x = np.linspace(0, scale, size, endpoint=False)
    i0 = np.floor(x).astype(int); f = x - i0; f = f * f * (3 - 2 * f); i1 = (i0 + 1) % scale
    a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
    b = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


def save(arr, path, mode=None, q=90, lossless=False):
    arr = np.clip(arr, 0, 1)
    im = Image.fromarray(np.round(arr * 255).astype(np.uint8), mode)
    im.save(path, 'WEBP', quality=q, lossless=lossless, method=6)
    return os.path.getsize(path)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def dist_to_polyline(P, pts):
    """Distance from each point (n, 3) to a polyline, and the 0..1 position along it."""
    best = np.full(len(P), 1e9); along = np.zeros(len(P))
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]); tot = L[-1]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ab = b - a; l2 = ab @ ab
        t = np.clip(((P - a) @ ab) / l2, 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        sel = d < best; best[sel] = d[sel]; along[sel] = (L[i] + t[sel] * np.sqrt(l2)) / tot
    return best, along


def strands(out_dir, name, w, h, n, seed, curl=0.0, taper=True, tip_rag=0.25, dens=1.0, alpha_body=1.0):
    """Hair strokes: rows of thin dark-light strands along v. RGB is grey detail (tinted by
    the hair colour), alpha cuts the ragged tips at the bottom (v near 0)."""
    r = np.random.default_rng(seed)
    img = np.zeros((h, w)); alpha = np.zeros((h, w))
    yy = np.arange(h)
    for i in range(int(n * dens)):
        x0 = r.random() * w; width = 0.6 + r.random() * 1.6
        ln = h * (0.965 - tip_rag * r.random())   # ragged ends, none reaching the last rows
        bright = 0.55 + 0.45 * r.random()
        ph = r.random() * 6.28; amp = curl * (2 + 4 * r.random())
        xs = x0 + amp * np.sin(yy / h * 6.28 * (2 + 3 * curl) + ph) + (r.random() - 0.5) * 6 * yy / h
        for yi in range(h):
            if yi > ln: continue                  # row 0 is the root (v = 1), the tip is at the bottom
            t = (yi) / h
            wv = width * (1 - 0.7 * t ** 3 if taper else 1)
            xa = xs[yi]
            for dx in range(-2, 3):
                xi = int(xa + dx) % w
                f = max(0.0, 1 - abs(xi + 0.5 - (xa % w)) / (wv + 0.01)) if abs(dx) <= 2 else 0
                if f <= 0: continue
                img[yi, xi] = max(img[yi, xi], bright * f)
                alpha[yi, xi] = max(alpha[yi, xi], min(1, f * 1.6))
    col = np.clip(0.55 + img * 0.45, 0, 1)
    body = smoothstep(h * (1 - tip_rag) - 4, h * (1 - tip_rag) * 0.75, np.arange(h)[:, None]) * alpha_body
    a = np.clip(np.maximum(alpha, body), 0, 1)
    out = np.dstack([col, col, col, a])
    Image.fromarray(np.round(out * 255).astype(np.uint8), 'RGBA').save(f'{out_dir}/{name}.webp', 'WEBP', quality=88, method=6)
    return os.path.getsize(f'{out_dir}/{name}.webp')


def fabric(out_dir, name, kind, size=256):
    yy, xx = np.mgrid[0:size, 0:size]
    if kind == 'knit':
        g = 0.82 + 0.1 * np.sin(xx / size * 2 * np.pi * 64) ** 2 * (0.6 + 0.4 * np.sin(yy / size * 2 * np.pi * 128) ** 2)
        g += 0.05 * (noise2(size, 16, 11) - 0.5)
    elif kind == 'weave':
        g = 0.86 + 0.06 * np.sin(xx / size * 2 * np.pi * 96) * np.sin(yy / size * 2 * np.pi * 96) + 0.06 * (noise2(size, 32, 12) - 0.5)
    elif kind == 'leather':
        g = 0.8 + 0.18 * (noise2(size, 64, 13) - 0.5) + 0.08 * (noise2(size, 16, 14) - 0.5)
        g -= 0.08 * (np.abs(noise2(size, 24, 15) - 0.5) < 0.03)
    else:
        g = 0.9 + 0.08 * (noise2(size, 32, 16) - 0.5)
    g = np.clip(g, 0, 1)
    return save(np.repeat(g[..., None], 3, 2), f'{out_dir}/{name}.webp', q=85)


def all_small(out_dir):
    sizes = {}
    sizes['hair-straight.webp'] = strands(out_dir, 'hair-straight', 256, 512, 520, 5, tip_rag=0.22)
    sizes['hair-curly.webp'] = strands(out_dir, 'hair-curly', 256, 512, 420, 6, curl=1.0, tip_rag=0.3)
    sizes['hair-sparse.webp'] = strands(out_dir, 'hair-sparse', 256, 256, 700, 7, tip_rag=0.35, alpha_body=0.0)
    for name, kind in (('knit', 'knit'), ('weave', 'weave'), ('leather', 'leather')):
        sizes[f'{name}.webp'] = fabric(out_dir, name, kind)
    return sizes
