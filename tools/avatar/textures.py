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


def face_textures(K, out_dir, size=1024):
    """Skin tone map, AO, and the makeup and stubble masks, in the head UV layout."""
    uv, P, T, ao_v = K.uv, K.hv_skin, K.skin_tris, K.ao_v
    attrs = np.concatenate([P, ao_v[:, None], K.cav_v[:, None]], 1)
    R, mask = rasterize(uv, attrs, T, size)
    pos = R[..., :3].reshape(-1, 3); ao = R[..., 3]; cav = R[..., 4]
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]; ax = np.abs(x)
    def blob(cx, cy, cz, rx, ry, rz, sym=True):
        xx = ax if sym else x
        return np.exp(-(((xx - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2))
    lips = K.lip_mask(pos)
    # skin tone: a multiplier on the chosen skin colour (all <= 1 so the canvas can multiply it)
    tone = np.ones((len(pos), 3))
    warm = np.clip(blob(0.5, 7.0, 0.95, 0.24, 0.18, 0.3) * 0.9 + blob(0, 7.1, 1.42, 0.13, 0.15, 0.2) * 0.7
                   + blob(K.ear_out - 0.05, K.ear_c[1], K.ear_c[2], 0.14, 0.3, 0.3) * 0.9 + blob(0, 6.42, 1.25, 0.2, 0.1, 0.2) * 0.3, 0, 1)
    tone *= 1 - np.array([0.0, 0.1, 0.12])[None] * warm[:, None]
    under = blob(0.3, 7.25, 1.1, 0.16, 0.06, 0.2)
    tone *= 1 - np.array([0.06, 0.07, 0.04])[None] * under[:, None]
    lid = blob(0.3, 7.45, 1.15, 0.17, 0.05, 0.2)
    tone *= 1 - np.array([0.04, 0.08, 0.07])[None] * lid[:, None]
    tone *= 1 - np.array([0.1, 0.32, 0.3])[None] * lips[:, None]
    jaw = smoothstep(6.5, 6.05, y) * smoothstep(-0.2, 0.7, z)
    tone *= 1 - 0.05 * jaw[:, None]
    n1 = noise2(size, 48, 3).reshape(-1); n2 = noise2(size, 180, 4).reshape(-1)
    tone *= (1 - 0.04 * n1 - 0.025 * n2)[:, None]
    tone *= 0.96
    tone = dilate(tone.reshape(size, size, 3), mask)
    sizes = {'skin.webp': save(tone, f'{out_dir}/skin.webp', q=92)}
    # ambient occlusion and crease cavity
    a = np.clip(0.3 + 0.7 * ao, 0, 1) * np.clip(1 - 0.35 * cav, 0.6, 1)
    a = dilate(a.reshape(size, size, 1), mask, 10)[..., 0]
    from PIL import ImageFilter
    a = np.asarray(Image.fromarray(np.round(a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))) / 255.0
    sizes['ao.webp'] = save(np.repeat(a[..., None], 3, 2), f'{out_dir}/ao.webp', q=88)
    # makeup and stubble masks, each a white image with the mask in alpha, cropped to the face
    M = {}
    for side in (1, -1):
        lid_pts = np.array(K.lid_lines[side])
        lower_pts = np.array(K.low_lines[side])
        d, u = dist_to_polyline(pos, lid_pts); dl, ul = dist_to_polyline(pos, lower_pts)
        front = smoothstep(0.7, 0.95, z) * (y > 7.1)
        above = (y - np.interp(np.clip(u, 0, 1), np.linspace(0, 1, len(lid_pts)), lid_pts[:, 1])) > -0.012
        wthin = 0.018 + 0.012 * u
        thin = smoothstep(wthin + 0.006, wthin - 0.002, d) * above * front
        heavy = (smoothstep(0.05, 0.03, d) * above + smoothstep(0.026, 0.012, dl) * 0.9) * front
        # the wing: a tapered line from the outer corner up and out
        oc = lid_pts[-1]; tip = oc + np.array([0.12 * side, 0.07, -0.08])
        dw, uw = dist_to_polyline(pos, np.array([lid_pts[-3], oc, tip]))
        wing = smoothstep(0.024 * (1.2 - uw) + 0.006, 0.006, dw) * front + thin
        brow_y = 7.6
        shadow = smoothstep(0.0, 0.03, (y - (lid_pts[:, 1].min() - 0.01))) * smoothstep(brow_y - 0.02, brow_y - 0.12, y) * \
                 np.exp(-((ax - 0.33) / 0.2) ** 2) * front * (1 + 0.4 * smoothstep(0.3, 0.55, ax))
        for k, v in (('liner-thin', thin), ('liner-winged', wing), ('liner-heavy', heavy), ('shadow', shadow)):
            M[k] = np.maximum(M.get(k, 0), v)
    M['blush'] = blob(0.5, 7.0, 1.0, 0.2, 0.14, 0.4) * smoothstep(0.6, 0.9, z)
    M['lips'] = lips
    beard_area = (y < 7.05 + 0.25 * smoothstep(0.25, 0.65, ax)) & (y > 6.0) & ~(lips > 0.3) & (z > -0.1)
    st = np.where(beard_area, 1.0, 0.0) * smoothstep(7.0 + 0.25 * smoothstep(0.25, 0.65, ax), 6.85 + 0.25 * smoothstep(0.25, 0.65, ax), y)
    st *= smoothstep(6.0, 6.2, y) * (1 - 0.5 * smoothstep(1.2, 1.4, z) * smoothstep(6.9, 7.1, y))
    st *= np.clip(1 - 1.4 * lips, 0, 1)
    grain = (RNG.random(len(pos)) * 0.6 + 0.4)
    M['stubble'] = st * grain
    # crop box: the face island holds everything but the stubble, which reaches the neck island too
    meta = {}
    for k, v in M.items():
        img = (v.reshape(size, size) * mask).astype(np.float32)
        a8 = np.clip(img, 0, 1)
        rgba = np.ones((size, size, 4)); rgba[..., 3] = a8
        im = Image.fromarray(np.round(rgba * 255).astype(np.uint8), 'RGBA').resize((512, 512), Image.LANCZOS)
        im.save(f'{out_dir}/m-{k}.webp', 'WEBP', quality=90, method=6)
        sizes[f'm-{k}.webp'] = os.path.getsize(f'{out_dir}/m-{k}.webp')
    return sizes


def iris(out_dir, size=256):
    """Grey iris detail in RGB (tinted by eye colour) and the iris mask in alpha.
    The texture maps the front of the eyeball: radius 0.5 is the iris edge."""
    yy, xx = np.mgrid[0:size, 0:size]; X = (xx + 0.5) / size * 2 - 1; Y = (yy + 0.5) / size * 2 - 1
    r = np.sqrt(X * X + Y * Y) / 1.0; th = np.arctan2(Y, X)
    R_IRIS, R_PUP = 0.62, 0.2
    fib = np.zeros_like(r)
    for k, (f, a) in enumerate([(55, 0.5), (110, 0.3), (23, 0.4)]):
        ph = RNG.random() * 6.28
        fib += a * np.sin(th * f + ph + 3 * np.sin(r * 9 + k))
    fib = 0.5 + 0.18 * fib / 1.2
    rr = r / R_IRIS
    base = 0.62 + 0.38 * smoothstep(0.95, 0.45, rr)        # lighter towards the pupil
    collar = np.exp(-((rr - 0.52) / 0.07) ** 2) * 0.22       # a light ring round the pupil
    limbal = smoothstep(0.78, 1.0, rr) * 0.75
    g = np.clip(base * fib * 1.25 + collar - limbal, 0, 1)
    g = np.where(r < R_PUP, 0.02, g)
    g = np.where(np.abs(r - R_PUP) < 0.012, g * 0.5, g)
    alpha = smoothstep(1.02, 0.97, rr)
    rgb = np.repeat(g[..., None], 3, 2)
    # outside the iris: sclera, white with a faint warm edge
    scl = 0.97 - 0.12 * smoothstep(0.75, 1.0, r)
    rgb = np.where(alpha[..., None] > 0, rgb, np.stack([scl, scl * 0.97, scl * 0.96], -1))
    out = np.concatenate([rgb, alpha[..., None]], -1)
    Image.fromarray(np.round(np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA').save(f'{out_dir}/iris.webp', 'WEBP', quality=92, method=6)
    return os.path.getsize(f'{out_dir}/iris.webp')


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


def cards(out_dir):
    """Brow and lash strokes on transparent cards."""
    sizes = {}
    # brow: 256 x 64, u along the brow (inner to tail), v across (0 bottom)
    W, H = 256, 64; r = np.random.default_rng(77)
    a = np.zeros((H, W)); c = np.zeros((H, W))
    for i in range(1100):
        u = r.random(); x0 = u * W; y0 = H * (0.12 + 0.76 * r.random())
        ang = math.radians(25 + 40 * (1 - u) * r.random() + (10 if u > 0.6 else 0)) * (1 if r.random() > 0.15 else -1)
        L = 10 + 14 * r.random()
        for s in np.linspace(0, 1, 24):
            x = x0 + math.cos(ang) * L * s; y = y0 + math.sin(ang) * L * s * 0.55
            xi, yi = int(x), int(y)
            for dy in (0, 1):
                if 0 <= xi < W and 0 <= yi + dy < H:
                    v = (1 - 0.6 * s) * (1 if dy == 0 else 0.6)
                    a[H - 1 - yi - dy, xi] = max(a[H - 1 - yi - dy, xi], v); c[H - 1 - yi - dy, xi] = max(c[H - 1 - yi - dy, xi], 0.4 + 0.6 * r.random())
    edge = smoothstep(0.0, 0.18, np.linspace(0, 1, H))[:, None] * smoothstep(1.0, 0.82, np.linspace(0, 1, H))[:, None]
    a = np.clip(a * 0.85, 0, 1) * edge * smoothstep(0.0, 0.06, np.linspace(0, 1, W))[None] * smoothstep(1.0, 0.9, np.linspace(0, 1, W))[None]
    a = np.maximum(a, 0.5 * edge * smoothstep(0.0, 0.1, np.linspace(0, 1, W))[None] * smoothstep(1.0, 0.75, np.linspace(0, 1, W))[None])
    col = np.clip(0.35 + 0.5 * c, 0, 1)
    out = np.dstack([col, col, col, a])
    Image.fromarray(np.round(out * 255).astype(np.uint8), 'RGBA').save(f'{out_dir}/brow.webp', 'WEBP', quality=90, method=6)
    sizes['brow.webp'] = os.path.getsize(f'{out_dir}/brow.webp')
    # lashes: 256 x 64, root at the bottom (v=0), curling up
    W, H = 256, 64; a = np.zeros((H, W))
    for i in range(140):
        x0 = (i + r.random() * 0.6) / 140 * W; L = H * (0.55 + 0.4 * r.random()) * (0.6 + 0.4 * math.sin(math.pi * x0 / W))
        lean = (x0 / W - 0.35) * 18
        for s in np.linspace(0, 1, 40):
            x = x0 + lean * s * s; y = L * s
            xi, yi = int(x), int(y)
            if 0 <= xi < W and 0 <= yi < H:
                w = 1.4 * (1 - 0.75 * s)
                for dx in (-1, 0, 1):
                    if 0 <= xi + dx < W:
                        a[H - 1 - yi, xi + dx] = max(a[H - 1 - yi, xi + dx], max(0, 1 - abs(dx) / (w + 0.01)) * (1 - 0.3 * s))
    a[H - 4:, :] = np.maximum(a[H - 4:, :], 0.9)
    out = np.dstack([np.full((H, W), 0.08)] * 3 + [a])
    Image.fromarray(np.round(np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA').save(f'{out_dir}/lash.webp', 'WEBP', quality=90, method=6)
    sizes['lash.webp'] = os.path.getsize(f'{out_dir}/lash.webp')
    return sizes


def all_small(out_dir):
    sizes = {}
    sizes['iris.webp'] = iris(out_dir)
    sizes.update(cards(out_dir))
    sizes['hair-straight.webp'] = strands(out_dir, 'hair-straight', 256, 512, 520, 5, tip_rag=0.22)
    sizes['hair-curly.webp'] = strands(out_dir, 'hair-curly', 256, 512, 420, 6, curl=1.0, tip_rag=0.3)
    sizes['hair-sparse.webp'] = strands(out_dir, 'hair-sparse', 256, 256, 700, 7, tip_rag=0.35, alpha_body=0.0)
    for name, kind in (('knit', 'knit'), ('weave', 'weave'), ('leather', 'leather')):
        sizes[f'{name}.webp'] = fabric(out_dir, name, kind)
    return sizes
