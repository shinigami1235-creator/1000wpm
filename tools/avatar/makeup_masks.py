"""Makeup masks in the MakeHuman hm08 UV layout, all original work generated here.
Each texel of the face area gets its 3D point on the neutral hm08 mesh, so a mask is any
function of a point on the face: distance to the upper lid margin, a cheek, the lips. The
masks follow the UVs, so they stay on the eyes and lips whatever the face sliders do.
The lip shape comes from the average lip colour of the MakeHuman CC0 skins, so lipstick
lands on the lips those skins paint.

Writes into OUT_DIR (assets/avatar/tex):
  mk-eyes.webp   R thin liner, G winged liner, B heavy liner (upper and lower)
  mk-lids.webp   R soft shadow, G smoky shadow, B brow fill
  mk-face.webp   R blush, G contour, B highlight
  mk-lips.webp   R lips, G lip line (a band on the lip border), B gloss
  mk.json        each image's rectangle in hm08 UV (u0, v0, u1, v1; v up)
All masks are greyscale in RGB (no alpha, so canvas premultiplying never touches them),
lossless WebP.
When HEAD_NPZ holds both the runtime UVs (uv) and the hm08 UVs (uv_mh), the masks are
baked across into the runtime layout and mk.json gives their rectangle there.
Usage: python3 makeup_masks.py OUT_DIR [HEAD_NPZ] [PREVIEW_PNG]
Needs neu.npy (the neutral hm08 vertex positions) next to this file or in $AVATAR_SHAPES."""
import os, sys, json, glob, numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from mhlib import load_obj
from textures import rasterize, smoothstep

SKINS = '/home/claude/mhpacks/makehuman_system_assets_cc0/skins'
SHAPES = [HERE, os.environ.get('AVATAR_SHAPES', ''), '/home/claude/face4build/tools', '/home/claude/avatar-build']
FULL = 2048                          # texels per UV unit the masks are drawn at
# one rectangle for every mask: the front of the face, forehead to chin (hm08 UV, v up)
RECT = (0.74, 0.30, 0.96, 0.66)


_SHAPE = []


def shape():
    """The neutral hm08 mesh with the always-on 'base' morph (morphs.BASE: bigger eyes, lower
    lids, raised brows), so the lid masks sit on the lid line the site actually shows."""
    if _SHAPE: return _SHAPE[0]
    from mhlib import load_target
    from morphs import BASE
    for d in SHAPES:
        p = os.path.join(d, 'neu.npy')
        if d and os.path.exists(p):
            P = np.load(p)
            _SHAPE.append(P + sum(load_target(t, len(P)) * g for t, g in BASE))
            return _SHAPE[0]
    raise SystemExit('neu.npy not found')


def face_points():
    """Per texel of RECT: the 3D point on the neutral mesh, and coverage."""
    V, F, G, VT, FT = load_obj(uv=True)
    P = shape()
    u0, v0, u1, v1 = RECT
    W, H = int(round((u1 - u0) * FULL)), int(round((v1 - v0) * FULL))
    pos = np.zeros((len(VT), 3)); tris = []
    for f, ft, g in zip(F, FT, G):
        if g != 'body': continue
        for i, t in zip(f, ft): pos[t] = P[i]
        if not all(u0 - 0.02 < VT[t][0] < u1 + 0.02 and v0 - 0.02 < VT[t][1] < v1 + 0.02 for t in ft): continue
        for a, b in (((1, 2), (2, 3)) if len(f) == 4 else ((1, 2),)): tris.append((ft[0], ft[a], ft[b]))
    N = max(W, H)
    uvq = np.stack([(VT[:, 0] - u0) * FULL / N, 1 - (v1 - VT[:, 1]) * FULL / N], 1)
    R, mask = rasterize(uvq, pos, np.array(tris), N)
    eyes = []
    for side in ('l', 'r'):
        idx = sorted({i for f, g in zip(F, G) if g == f'helper-{side}-eye' for i in f})
        c = P[idx].mean(0); eyes.append((c, float(np.linalg.norm(P[idx] - c, axis=1).mean())))
    return R[:H, :W], mask[:H, :W], eyes


def lip_redness(H, W):
    """Average lip colour of the MakeHuman skins over RECT: (R - G) / R, so dark and light skins weigh alike."""
    u0, v0, u1, v1 = RECT
    acc, n = 0, 0
    for p in sorted(glob.glob(f'{SKINS}/*/*diffuse*.png')):
        if 'toon' in p or 'suit' in p: continue
        im = Image.open(p).convert('RGB')
        if im.size[0] != FULL: im = im.resize((FULL, FULL), Image.LANCZOS)
        a = np.asarray(im).astype(np.float32) / 255
        c = a[int(round((1 - v1) * FULL)):, int(round(u0 * FULL)):][:H, :W]
        acc = acc + (c[..., 0] - c[..., 1]) / (c[..., 0] + 1e-3); n += 1
    return acc / n


def bake(M, head_npz, res=2048):
    """Resample the hm08 masks into the runtime UV layout of the head in head_npz."""
    h = np.load(head_npz)
    if 'uv_mh' not in h.files: return M, list(RECT), 'hm08'
    uv, um, T = h['uv'], h['uv_mh'], h['faces']
    u0, v0, u1, v1 = RECT
    c = um[T].mean(1)
    keep = T[(c[:, 0] > u0) & (c[:, 0] < u1) & (c[:, 1] > v0) & (c[:, 1] < v1)]
    lo = uv[keep].min((0, 1)); hi = uv[keep].max((0, 1))
    W, H = int(np.ceil((hi[0] - lo[0]) * res)), int(np.ceil((hi[1] - lo[1]) * res))
    N = max(W, H)
    uvq = np.stack([(uv[:, 0] - lo[0]) * res / N, 1 - (hi[1] - uv[:, 1]) * res / N], 1)
    S, cov = rasterize(uvq, um, keep, N)
    S, cov = S[:H, :W], cov[:H, :W]
    h0, w0 = next(iter(M.values())).shape
    # hm08 uv -> texel of the mask images (row 0 is v1)
    rows = (v1 - S[..., 1]) * FULL - 0.5; cols = (S[..., 0] - u0) * FULL - 0.5
    out = {k: ndimage.map_coordinates(v, [rows, cols], order=1, mode='constant') * cov for k, v in M.items()}
    return out, [float(lo[0]), float(lo[1]), float(lo[0] + W / res), float(lo[1] + H / res)], 'runtime'


def build(out_dir, head_npz=None, preview=None):
    R, cover, eyes = face_points()
    H, W = cover.shape
    x, y, z = R[..., 0], R[..., 1], R[..., 2]; ax = np.abs(x)
    flat = R.reshape(-1, 3)
    M = {}
    def blob(cx, cy, cz, rx, ry, rz):
        return np.exp(-(((ax - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2))

    # ---------- eyes: the lid margin is the edge of the skin that tucks in behind the eyeball ----------
    keys = ['liner-thin', 'liner-winged', 'liner-heavy', 'shadow-soft', 'shadow-smoky']
    E = {k: np.zeros((H, W)) for k in keys}
    for (c, r), sx in zip(eyes, (1, -1)):
        dx, dy = x - c[0], y - c[1]
        dd = r * r - dx * dx - dy * dy
        zf = np.where(dd > 0, c[2] + np.sqrt(np.maximum(dd, 0)), -9)
        hid = ndimage.binary_fill_holes((dd > 0) & (z < zf + 0.004) & cover)
        hid = ndimage.binary_opening(hid, iterations=1)
        lab, n = ndimage.label(hid)
        if n > 1: hid = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
        edge = hid & ~ndimage.binary_erosion(hid)
        ep = R[edge]
        inner = ep[np.argmin(ep[:, 0] * sx)]; outer = ep[np.argmax(ep[:, 0] * sx)]
        # the line between the corners splits the margin into the upper and lower lid
        def corner_y(px):
            t = np.clip((px - inner[0]) / (outer[0] - inner[0]), 0, 1)
            return inner[1] + (outer[1] - inner[1]) * t, t
        cy_e, _ = corner_y(ep[:, 0])
        up_pts, lo_pts = ep[ep[:, 1] >= cy_e], ep[ep[:, 1] < cy_e]
        d_up, i_up = cKDTree(up_pts).query(flat); d_lo, _ = cKDTree(lo_pts).query(flat)
        d_up = d_up.reshape(H, W); d_lo = d_lo.reshape(H, W)
        line_y, t = corner_y(x)
        tu = np.clip((x - inner[0]) / (outer[0] - inner[0]), -0.3, 1.6)     # 0 inner corner, 1 outer
        near = (np.abs(dx) < 2.2 * r) & (np.abs(dy) < 1.6 * r) & (z > c[2] - 0.05) & cover
        above = (y > line_y - 0.004) & near
        below = (y < line_y + 0.004) & near
        hid_up = hid & (y >= line_y); hid_lo = hid & (y < line_y)
        fade_in = smoothstep(-0.08, 0.12, tu)                                # liners start thin at the inner corner
        # thin liner: hugs the lashes, thickest towards the outer corner
        w = 0.008 + 0.012 * np.clip(tu, 0, 1) ** 1.3
        thin = np.maximum(smoothstep(w + 0.006, w - 0.003, d_up) * above * fade_in, hid_up * 1.0)
        thin *= smoothstep(1.12, 0.98, tu)
        # wings are drawn in the front view (x, y), so they stay one stroke from the corner however
        # far the temple curves back; they run out from the corner along the lid line, then lift
        near_w = (np.abs(dx) < 2.8 * r) & (np.abs(dy) < 1.6 * r) & (z > c[2] - 0.4) & cover
        def wing_xy(length, lift, w0):
            a = np.array([oc[0] - 0.025 * sx, oc[1] + 0.004]); b = np.array([oc[0] + length * sx, oc[1] + lift])
            seg = b - a; q = np.stack([x, y], -1) - a
            s = np.clip((q @ seg) / (seg @ seg), 0, 1)
            d = np.linalg.norm(q - s[..., None] * seg, axis=-1)
            ww = w0 * (1 - s) ** 0.85 + 0.0015
            return smoothstep(ww + 0.003, ww - 0.0015, d) * near_w * (s < 0.999) * (y > line_y - 0.002 - 0.01 * smoothstep(0.9, 1.1, tu))
        oc = outer
        wing = wing_xy(0.125, 0.055, 0.017)
        winged = np.maximum(np.maximum(thin, wing), smoothstep(0.026, 0.012, d_up) * above * smoothstep(0.55, 0.95, tu) * smoothstep(1.25, 1.05, tu))
        # heavy, the graphic liner: a line that thickens to the outer corner, a long sharp wing
        # that runs well past the corner, and a fine line under the outer half of the lower lashes
        wing2 = wing_xy(0.18, 0.08, 0.024)
        wh = 0.012 + 0.016 * np.clip(tu, 0, 1) ** 1.2
        heavy = np.maximum(smoothstep(wh + 0.004, wh - 0.002, d_up) * above * smoothstep(-0.1, 0.06, tu) * smoothstep(1.2, 1.02, tu), hid_up * 1.0)
        heavy = np.maximum(heavy, smoothstep(0.009, 0.003, d_lo) * below * smoothstep(0.2, 0.6, tu) * smoothstep(1.15, 1.0, tu) * 0.9)
        heavy = np.maximum(heavy, hid_lo * smoothstep(0.2, 0.6, tu) * 0.9)
        heavy = np.maximum(heavy, wing2)
        # The brows sit about 0.1 above the lash line (3D distance), the crease about half way.
        # Shadows are dense on the moving lid by the lashes, fade up to the crease, and leave
        # only a faint haze on the brow bone.
        crease = 0.05 + 0.012 * np.clip(tu, 0, 1)
        hz = smoothstep(-0.25, 0.15, tu) * smoothstep(1.5, 1.08, tu)
        haze = smoothstep(0.1, 0.055, d_up) * above * hz
        # soft: the lid only, a little deeper at the outer corner
        lid = smoothstep(crease + 0.005, crease - 0.03, d_up) * above * hz
        soft = np.maximum(lid * (0.7 + 0.3 * np.clip(tu, 0, 1)), haze * 0.12)
        # smoky: solid on the lid, softening through the crease, smoked out past the outer corner
        # (kept under the brow) and smudged under the outer lower lashes
        lid2 = smoothstep(crease + 0.02, crease - 0.012, d_up) * above * hz
        crease_band = np.exp(-((d_up - crease) / 0.013) ** 2) * above * hz * smoothstep(0.2, 0.6, tu) * 0.3
        outer_v = np.exp(-((tu - 1.06) / 0.26) ** 2) * smoothstep(crease + 0.03, crease - 0.015, d_up) * near_w * 0.9 \
            * smoothstep(line_y - 0.02, line_y + 0.005, y)                     # stays above the lower lid
        lower = np.maximum(smoothstep(0.05, 0.004, d_lo) * below, hid_lo * 1.0) * smoothstep(-0.1, 0.5, tu) * smoothstep(1.4, 1.02, tu)
        smoky = np.maximum.reduce([lid2 * (0.85 + 0.15 * np.clip(tu, 0, 1.2)) + crease_band, outer_v, lower * 0.92, haze * 0.24])
        smoky = np.maximum(smoky, hid_up * 1.0)
        for k, v in zip(keys, (thin, winged, heavy, soft, smoky)): E[k] = np.maximum(E[k], v * cover)
    # soften: liners a little, shadows a lot, so every edge blends into the skin
    blur = lambda a, s: ndimage.gaussian_filter(a, s)
    M['liner-thin'] = blur(E['liner-thin'], 0.8)
    M['liner-winged'] = blur(E['liner-winged'], 0.8)
    M['liner-heavy'] = blur(E['liner-heavy'], 0.7)
    M['shadow-soft'] = np.clip(blur(E['shadow-soft'], 3.6) * 1.1, 0, 1)
    M['shadow-smoky'] = np.clip(blur(np.clip(E['shadow-smoky'], 0, 1), 2.6) * 1.05, 0, 1)

    # ---------- brows: where the MakeHuman brow cards sit, for a powder fill under the hairs ----------
    brow = np.zeros((H, W))
    try:
        from mhclo import Proxy, PACKS
        names = ('eyebrow004', 'eyebrow002', 'eyebrow010', 'eyebrow011')
        bc = np.array([(a, b, 1 - a - b) for a in np.linspace(0, 1, 7) for b in np.linspace(0, 1, 7) if a + b <= 1])
        for nm in names:
            px = Proxy(f'{PACKS}makehuman_system_assets_cc0/eyebrows/{nm}/{nm}.mhclo')
            Q = px.fit(shape()); src, uv, tris = px.split()
            tex = np.asarray(Image.open(f'{px.dir}/{nm}.png').convert('RGBA')).astype(np.float32) / 255
            th, tw = tex.shape[:2]
            # points over every card triangle, kept where the brow texture has hairs
            pts = np.einsum('kj,tjd->tkd', bc, Q[src][tris]).reshape(-1, 3)
            puv = np.einsum('kj,tjd->tkd', bc, uv[tris]).reshape(-1, 2)
            al = tex[np.clip(((1 - puv[:, 1]) * th).astype(int), 0, th - 1), np.clip((puv[:, 0] * tw).astype(int), 0, tw - 1), 3]
            pts = pts[al > 0.3]
            d, _ = cKDTree(pts).query(flat)
            brow += smoothstep(0.014, 0.004, d.reshape(H, W)) / len(names)
    except (ImportError, OSError) as e:
        print('brow fill skipped:', e)
    M['brow'] = blur(np.clip(brow * 1.3, 0, 1) * cover, 2.0)

    # ---------- cheeks: blush on the apples, contour under the cheekbones and down the nose ----------
    M['blush'] = blur(blob(0.48, 7.05, 1.0, 0.2, 0.13, 0.5) ** 1.3 * smoothstep(0.6, 0.9, z) * cover, 7)
    M['blush'] /= M['blush'].max()                                          # full strength at the middle of the cheek
    # contour: a soft shadow under the cheekbone, from the ear down towards the mouth corner
    hollow_t = np.clip((ax - 0.42) / 0.36, 0, 1)                           # 0 under the apple, 1 at the ear
    hollow_y = 6.97 + 0.12 * hollow_t
    hollow = np.exp(-((y - hollow_y) / 0.075) ** 2) * smoothstep(0.4, 0.62, ax) * smoothstep(0.9, 0.76, ax)
    nose_side = np.exp(-((ax - (0.095 + 0.03 * smoothstep(7.4, 7.1, y))) / 0.022) ** 2) * smoothstep(7.02, 7.12, y) * smoothstep(7.5, 7.38, y) * (z > 1.1)
    temple = np.exp(-((ax - 0.7) / 0.08) ** 2 - ((y - 7.62) / 0.12) ** 2) * 0.5
    M['contour'] = blur((hollow * 0.8 + nose_side * 0.7 + temple) * cover, 6)
    bridge = np.exp(-(x / 0.018) ** 2) * smoothstep(7.1, 7.2, y) * smoothstep(7.48, 7.36, y) * 0.6
    # the top of the cheekbone: a short stroke angled up towards the temple
    ct = np.clip((ax - 0.44) / 0.2, 0, 1)
    cheek_top = np.exp(-((ax - 0.53) / 0.08) ** 2 - ((y - (7.16 + 0.05 * ct)) / 0.045) ** 2) * smoothstep(0.4, 0.48, ax) * 0.8
    bow = np.exp(-(x / 0.035) ** 2 - ((y - 6.77) / 0.018) ** 2) * 0.6
    browbone = np.exp(-((ax - 0.42) / 0.06) ** 2 - ((y - 7.5) / 0.022) ** 2) * 0.4
    M['highlight'] = blur((bridge + cheek_top + bow + browbone) * cover, 5)

    # ---------- lips: the red of the MakeHuman lips, inside a box round the mouth ----------
    # the lips' outer edge sits low on the redness: the bright middle is the wet inner lip
    red = ndimage.gaussian_filter(lip_redness(H, W), 2.5)
    box = smoothstep(0.34, 0.27, ax) * smoothstep(6.45, 6.52, y) * smoothstep(6.88, 6.8, y) * smoothstep(0.85, 0.95, z)
    base = np.percentile(red[box > 0.5], 40); top = np.percentile(red[box > 0.5], 97)
    lips = (red > base + 0.2 * (top - base)) * (box > 0.5) * cover
    lips = ndimage.binary_fill_holes(lips) * 1.0
    lab, n = ndimage.label(lips)
    if n > 1: lips = (lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)) * 1.0
    lips = ndimage.binary_closing(lips > 0.5, iterations=3) * 1.0
    # a soft edge a few texels wide, so the colour fades into the skin like a blotted lipstick
    M['lips'] = np.clip(blur(lips, 2.6) * 1.15 - 0.05, 0, 1)
    # lip line: a band centred on the border, a touch outside it so it frames the colour
    dist_in = ndimage.distance_transform_edt(lips > 0.5); dist_out = ndimage.distance_transform_edt(lips < 0.5)
    sd = np.where(lips > 0.5, -dist_in, dist_out)                        # texels, + outside
    M['lipline'] = blur(np.exp(-((sd - 0.8) / 2.6) ** 2) * box, 1.2)
    # gloss: the middle of the lower lip and a smaller patch on the upper lip
    seam3 = np.median(y[lips > 0.5])
    core = blur(np.clip(-sd / 6.0, 0, 1), 2.0)                           # 0 at the border, 1 deep inside
    lower = smoothstep(seam3 + 0.005, seam3 - 0.03, y)
    upper = smoothstep(seam3 - 0.005, seam3 + 0.025, y)
    M['gloss'] = np.clip(core * (lower * np.exp(-(x / 0.13) ** 2) + 0.55 * upper * np.exp(-((ax - 0.05) / 0.08) ** 2)), 0, 1)
    M['gloss'] = blur(M['gloss'], 2.0)

    packs = {
        'mk-eyes': ('liner-thin', 'liner-winged', 'liner-heavy'),
        'mk-lids': ('shadow-soft', 'shadow-smoky', 'brow'),
        'mk-face': ('blush', 'contour', 'highlight'),
        'mk-lips': ('lips', 'lipline', 'gloss'),
    }
    if preview: write_preview(M, preview)
    rect, layout = list(RECT), 'hm08'
    if head_npz: M, rect, layout = bake(M, head_npz)
    meta = {'rect': rect, 'layout': layout, 'files': {}}
    sizes = {}
    for name, ch in packs.items():
        rgb = np.stack([np.clip(M[k], 0, 1) for k in ch], -1)
        Image.fromarray(np.round(rgb * 255).astype(np.uint8), 'RGB').save(f'{out_dir}/{name}.webp', 'WEBP', lossless=True, method=6)
        meta['files'][name] = list(ch)
        sizes[name] = os.path.getsize(f'{out_dir}/{name}.webp')
    json.dump(meta, open(f'{out_dir}/mk.json', 'w'), indent=1)
    return sizes


def write_preview(M, path):
    """The masks over a MakeHuman skin, upright, for a quick look."""
    u0, v0, u1, v1 = RECT
    p = glob.glob(f'{SKINS}/young_caucasian_female/*diffuse*.png')[0]
    im = Image.open(p).convert('RGB').resize((FULL, FULL))
    H, W = M['lips'].shape
    a = np.asarray(im).astype(np.float32)[int(round((1 - v1) * FULL)):, int(round(u0 * FULL)):][:H, :W] / 255
    out = a.copy()
    mul = lambda o, m, c, s: o * (1 - m[..., None] * s + m[..., None] * s * np.array(c))
    out = mul(out, M['shadow-soft'], [0.62, 0.48, 0.42], 0.6)
    out = mul(out, M['liner-winged'], [0.08, 0.06, 0.07], 0.9)
    out = mul(out, M['contour'], [0.8, 0.7, 0.65], 0.4)
    out = out + (1 - out) * M['highlight'][..., None] * 0.15
    out = out * (1 - M['blush'][..., None] * 0.35) + M['blush'][..., None] * 0.35 * np.array([0.85, 0.45, 0.5]) * out / np.maximum(out.mean(-1, keepdims=True), 1e-3) * 0.75
    lum = out.mean(-1, keepdims=True); lm = (lum * M['lips'][..., None]).sum() / M['lips'].sum()
    out = out * (1 - M['lips'][..., None] * 0.7) + M['lips'][..., None] * 0.7 * np.array([0.72, 0.2, 0.3]) * lum / lm
    out = np.clip(out + M['gloss'][..., None] * 0.15, 0, 1)
    img = Image.fromarray(np.round(out * 255).astype(np.uint8)).transpose(Image.ROTATE_270)
    masks = [Image.fromarray(np.round(np.clip(M[k], 0, 1) * 255).astype(np.uint8)).transpose(Image.ROTATE_270).convert('RGB')
             for k in ('liner-thin', 'liner-winged', 'liner-heavy', 'shadow-soft', 'shadow-smoky', 'brow', 'blush', 'contour', 'highlight', 'lips', 'lipline', 'gloss')]
    w, h = img.size
    sheet = Image.new('RGB', (w * 2 + (w // 2) * 6, h * 2), (20, 20, 20))
    sheet.paste(img.resize((w * 2, h * 2)), (0, 0))
    for k, m in enumerate(masks):
        sheet.paste(m.resize((w // 2, h // 2)) if False else m.resize((w // 2, h)), (w * 2 + (k % 6) * (w // 2), (k // 6) * h))
    sheet.save(path)


if __name__ == '__main__':
    a = sys.argv[1:] + [None, None]
    print(build(a[0], a[1], a[2]))
