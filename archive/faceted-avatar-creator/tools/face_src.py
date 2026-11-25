"""Face parts made from MakeHuman CC0 assets: skins, eyes, brows and lashes.

Skins  three MakeHuman skins (light, medium, dark) baked from the hm08 UVs into the head's
       own UV layout, plus a pore normal map, and an ORM map (R ambient occlusion, G
       roughness). The site tints between the three for its ten skin tones.
Eyes   the MakeHuman high-poly eye proxy (eyeball and cornea), turned a little down so the
       face looks relaxed. The irises are resampled from MakeHuman eye textures into one
       polar layout: the eye's axis at the texture centre, 90 degrees off axis at radius 0.5.
Brows  placed by rule from the canthi and the ala; the site builds the cards (brows.py).
Lashes the MakeHuman eyelashes01 (shortened, for men) and eyelashes02 cards.

Every proxy is fitted to the neutral hm08 mesh through its .mhclo, and refitted to each
morphed mesh for the morph targets, so it follows every slider exactly.
Sources: /home/claude/mhpacks (see assets/avatar/LICENSES.md, "Face")."""
import os, math, json, numpy as np
from PIL import Image, ImageFilter
from mhclo import Proxy, PACKS
from textures import rasterize, dilate, smoothstep, noise2

SYS = PACKS + 'makehuman_system_assets_cc0/'
SKINS = {
    'light': SYS + 'skins/young_caucasian_female2/young_lightskinned_female_diffuse2.png',
    'medium': PACKS + 'skins01_cc0/skins/callharvey3d_midtoned_female/harvey_midtoned_female_diffuse.png',
    'dark': SYS + 'skins/young_african_female/young_darkskinned_female_diffuse.png',
}
PORES = PACKS + 'skins02_cc0/skins/mindfront_skin_male_african_middleage/skin_male_african_middleage_NRM.png'
PORE_SPEC = PACKS + 'skins02_cc0/skins/mindfront_skin_male_african_middleage/skin_male_african_middleage_SPEC.png'
GAZE_DOWN, GAZE_IN = -1.5, 1.5    # degrees, on top of the MakeHuman eye's own lowered gaze (about 3.5 down)
IRIS_R = 0.225                     # iris edge radius in the polar eye texture (about 25 degrees off axis)


def _img(path, size=None):
    im = Image.open(path).convert('RGBA')
    if size: im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def sample(img, uv):
    """Bilinear sample of img (h, w, c) at uv (n, 2), v up."""
    h, w = img.shape[:2]
    x = np.clip(uv[:, 0] * w - 0.5, 0, w - 1.001); y = np.clip((1 - uv[:, 1]) * h - 0.5, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    a, b, c, d = img[y0, x0], img[y0, x0 + 1], img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def srgb_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def save_webp(arr, path, q=88, lossless=False):
    arr = np.clip(arr, 0, 1); mode = 'RGBA' if arr.shape[-1] == 4 else 'RGB'
    Image.fromarray(np.round(arr * 255).astype(np.uint8), mode).save(path, 'WEBP', quality=q, lossless=lossless, method=6)
    return os.path.getsize(path)


# ---------------------------------------------------------------- skins
def skin_textures(K, out_dir, size=1024):
    """skin_<base>.webp diffuse, skin_nrm.webp pores, skin_orm.webp (R AO, G roughness).
    Returns (sizes, meta) where meta['skins'] lists each base and its mean face colour."""
    attrs = np.concatenate([K.uv_mh, K.hv_skin, K.ao_v[:, None]], 1)
    R, mask = rasterize(K.uv, attrs, K.skin_tris, size)
    R = dilate(R, mask, 8); m2 = R[..., 0] != 0
    uvm = R[..., :2].reshape(-1, 2); pos = R[..., 2:5].reshape(-1, 3); ao = R[..., 5]
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]; ax = np.abs(x)
    # the cheeks, forehead and chin: where the mean colour is measured
    cheek = (z > 0.75) & (((y > 6.8) & (y < 7.15) & (ax > 0.25) & (ax < 0.55)) | ((y > 7.65) & (y < 7.95) & (ax < 0.35)))
    sizes, meta = {}, {'skins': []}
    # the upper lash line, the lid above it and the lower waterline, darkened in every base so
    # the eyes have a defined edge without makeup
    from textures import dist_to_polyline
    shade = np.ones(len(pos)); lash = np.zeros(len(pos))
    for side in (1, -1):
        up, lo = np.array(K.lid_lines[side]), np.array(K.low_lines[side])
        du, uu = dist_to_polyline(pos, up); dl, _ = dist_to_polyline(pos, lo)
        above = y - np.interp(np.clip(uu, 0, 1), np.linspace(0, 1, len(up)), up[:, 1]) > -0.006
        front = smoothstep(0.6, 0.9, z)
        line = smoothstep(0.02 + 0.008 * np.sin(np.pi * uu), 0.003, du) * above
        lid = smoothstep(0.06, 0.0, du) * above
        # the upper-lid crease: a soft fold shadow following the lid, a little above it
        crease = np.exp(-((du - 0.05 - 0.008 * np.sin(np.pi * uu)) / 0.013) ** 2) * above * smoothstep(0.0, 0.25, uu) * smoothstep(1.0, 0.8, uu)
        water = smoothstep(0.009, 0.002, dl)
        shade *= 1 - front * (0.6 * line + 0.1 * lid + 0.22 * crease + 0.25 * water)
        # a heavier lash line the shader adds on top (ORM blue), stronger on women
        lash = np.maximum(lash, front * smoothstep(0.03 + 0.012 * np.sin(np.pi * uu) * smoothstep(0.2, 0.9, uu), 0.004, du) * above)
    # lips: the line where they meet, darker corners, a slightly darker upper lip and a soft
    # highlight on the lower lip
    lm = K.lip_mask(pos)
    meet = smoothstep(0.013, 0.0, np.abs(y - 6.669 - 0.006 * smoothstep(0.1, 0.24, ax))) * smoothstep(0.26, 0.2, ax) * smoothstep(0.9, 1.05, z)
    corner = np.exp(-(((ax - 0.235) / 0.03) ** 2 + ((y - 6.672) / 0.025) ** 2)) * smoothstep(0.9, 1.05, z)
    upper = lm * (y > 6.669)
    shade *= 1 - 0.38 * meet - 0.3 * corner - 0.1 * upper
    gloss = np.exp(-((x / 0.085) ** 2 + ((y - 6.622) / 0.018) ** 2)) * lm
    shade *= 1 + 0.14 * gloss
    lids = shade.reshape(size, size)
    # where the skins paint scalp stubble: above a hairline that runs round the head
    C = np.array([0.0, 7.72, 0.28]); d = pos - C
    theta = np.degrees(np.arctan2(np.abs(d[:, 0]), d[:, 2])); elev = np.degrees(np.arctan2(d[:, 1], np.hypot(d[:, 0], d[:, 2])))
    hl = np.interp(theta, [0, 30, 60, 85, 110, 140, 180], [16, 15, 9, -6, -14, -28, -38])
    scalp = smoothstep(hl - 3, hl + 4, elev).reshape(size, size)
    forehead = (z > 0.85) & (y > 7.6) & (y < 7.85) & (ax < 0.3)
    neck = smoothstep(6.42, 6.12, y).reshape(size, size)
    neckref = (y > 5.6) & (y < 6.0) & (z > 0.3)
    lipm = K.lip_mask(pos).reshape(size, size)
    for name, path in SKINS.items():
        src = _img(path)[..., :3]
        col = sample(src, uvm).reshape(size, size, 3)
        col = dilate(col, mask, 10)
        # scalp: the forehead's colour with its own fine detail, so a thin hairstyle shows skin
        blur = np.asarray(Image.fromarray(np.round(col * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(12))) / 255.0
        fmean = col.reshape(-1, 3)[forehead].mean(0)
        detail = np.clip(col.mean(-1, keepdims=True) / np.maximum(blur.mean(-1, keepdims=True), 1e-3), 0.85, 1.15)
        fill = fmean * (1 + 0.6 * (detail - 1))
        col = col * (1 - scalp[..., None]) + np.clip(fill, 0, 1) * scalp[..., None]
        # neck and under the chin: one smooth tone with the skin's own fine detail, so the seam
        # between the face and neck islands disappears
        nmean = col.reshape(-1, 3)[neckref].mean(0)
        col = col * (1 - neck[..., None]) + np.clip(nmean * detail, 0, 1) * neck[..., None]
        col = col * lids[..., None]
        # lip colour feathered into the skin at the border
        edge = (4 * lm * (1 - lm)).reshape(size, size)[..., None]
        lblur = np.asarray(Image.fromarray(np.round(np.clip(col, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))) / 255.0
        col = col * (1 - 0.7 * edge) + lblur * 0.7 * edge
        # the female MakeHuman lips are pink; take them halfway to a lip tone made from the skin
        lip = lipm[..., None]; sk = col * np.array([0.86, 0.66, 0.64])
        col = col * (1 - 0.45 * lip) + np.minimum(col, sk) * 0.45 * lip
        # the mean is measured before the forehead is matched, so the site's tone calibration
        # (avatar-face.js CAL) still fits
        mean = srgb_lin(col.reshape(-1, 3)[cheek]).mean(0)
        col = balance_forehead(col, pos, m2.reshape(-1))
        sizes[f'skin_{name}.webp'] = save_webp(col, f'{out_dir}/skin_{name}.webp', q=86)
        meta['skins'].append({'id': name, 'file': f'skin_{name}.webp', 'mean': [round(float(v), 5) for v in mean]})
    # pores: the high-frequency part of a MakeHuman normal map (wrinkles and big forms removed)
    nsrc = _img(PORES)[..., :3]
    nb = np.asarray(Image.fromarray(np.round(nsrc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))) / 255.0
    hp = (nsrc - nb)
    n = sample(np.concatenate([hp, np.zeros_like(hp[..., :1])], -1), uvm)[:, :3]
    n = n * 2.0; n[:, 2] = 0
    face_only = smoothstep(0.1, 0.5, z) * smoothstep(5.3, 5.8, y)
    n *= face_only[:, None]
    n[:, 2] = np.sqrt(np.clip(1 - (n[:, :2] ** 2).sum(1), 0.2, 1))
    n /= np.linalg.norm(n, axis=1)[:, None]
    nrm = dilate((n * 0.5 + 0.5).reshape(size, size, 3), mask, 10)
    sizes['skin_nrm.webp'] = save_webp(nrm, f'{out_dir}/skin_nrm.webp', q=90)
    # roughness: oilier T-zone and lips, drier cheeks and neck, pore detail from a spec map
    spec = _img(PORE_SPEC)[..., 0]
    sb = np.asarray(Image.fromarray(np.round(spec * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))) / 255.0
    sp = sample((spec - sb)[..., None], uvm)[:, 0]
    tzone = np.exp(-((x / 0.16) ** 2 + ((y - 7.8) / 0.25) ** 2)) + np.exp(-((x / 0.11) ** 2 + ((y - 7.05) / 0.3) ** 2)) * smoothstep(1.2, 1.5, z) \
        + 0.6 * np.exp(-((x / 0.15) ** 2 + ((y - 6.3) / 0.12) ** 2))
    lips = K.lip_mask(pos)
    rough = 0.62 - 0.12 * np.clip(tzone, 0, 1) - 0.18 * lips - 0.15 * gloss - 0.9 * sp + 0.05 * (noise2(size, 64, 21).reshape(-1) - 0.5)
    rough = np.clip(rough, 0.3, 0.8)
    a = np.clip(0.35 + 0.65 * ao.reshape(-1), 0, 1)
    orm = np.stack([a, rough, lash], 1).reshape(size, size, 3)
    orm = dilate(orm, mask, 10)
    orm[..., 0] = np.asarray(Image.fromarray(np.round(orm[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))) / 255.0
    sizes['skin_orm.webp'] = save_webp(orm, f'{out_dir}/skin_orm.webp', q=90)
    return sizes, meta


def balance_forehead(col, pos, valid, sigma=None, keep=0.15):
    """Brings the forehead and scalp to the cheeks' colour. The MakeHuman skins have pink cheeks
    and a paler, yellower forehead; on a light tone the forehead then reads lighter than the
    cheeks. The broad colour above the brows is pulled to the cheeks' (a touch lighter), the fine
    detail stays. col is sRGB (size, size, 3), pos the texel positions (size * size, 3)."""
    from scipy import ndimage
    size = col.shape[0]; sigma = sigma or size / 64
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]; ax = np.abs(x)
    lin = srgb_lin(np.clip(col, 0, 1)).reshape(-1, 3)
    cheek = valid & (z > 0.75) & (y > 6.8) & (y < 7.15) & (ax > 0.25) & (ax < 0.55)
    target = lin[cheek].mean(0) * 1.04
    m = valid.reshape(size, size).astype(np.float64)
    den = np.maximum(ndimage.gaussian_filter(m, sigma), 1e-4)
    low = np.stack([ndimage.gaussian_filter(lin[:, k].reshape(size, size) * m, sigma) / den for k in range(3)], -1).reshape(-1, 3)
    w = (smoothstep(7.3, 7.55, y) * valid)[:, None]
    gain = np.clip(target / np.maximum(low, 1e-4), 0.5, 1.6) ** (1 - keep)
    out = lin * gain ** w
    srgb = np.where(out <= 0.0031308, out * 12.92, 1.055 * np.power(np.clip(out, 0, None), 1 / 2.4) - 0.055)
    return np.clip(srgb, 0, 1).reshape(size, size, 3)


# ---------------------------------------------------------------- eyes
def _lid_y(lid, x):
    L = np.array(lid); o = np.argsort(L[:, 0]); return np.interp(x, L[o, 0], L[o, 1])


def eye_lid_shade(P, lids):
    """Per eye vertex brightness: a soft shadow on the eyeball under the upper lid, the way
    the lid and lashes shade a real eye. lids: {+1: upper lid points, -1: ...} (neutral head)."""
    out = np.ones(len(P))
    for i, p in enumerate(P):
        ly = _lid_y(lids[1 if p[0] > 0 else -1], p[0])
        out[i] = 1 - 0.5 * smoothstep(ly - 0.045, ly + 0.004, p[1])
    return out


def _rot(axis, deg):
    a = np.asarray(axis, float); a /= np.linalg.norm(a); t = math.radians(deg)
    K_ = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * K_ + (1 - math.cos(t)) * K_ @ K_


def sphere_fit(Q):
    A = np.c_[2 * Q, np.ones(len(Q))]; b = (Q ** 2).sum(1); x = np.linalg.lstsq(A, b, rcond=None)[0]
    c = x[:3]; return c, float(np.sqrt(x[3] + c @ c))


class Eyes:
    """The MakeHuman high-poly eyes: per side an eyeball (276 vertices) and a cornea (256)."""
    PARTS = {'l': ((256, 532), (0, 256)), 'r': ((788, 1064), (532, 788))}

    def __init__(self, neu):
        self.px = Proxy(SYS + 'eyes/high-poly/high-poly.mhclo')
        self.src, self.uv_mh, self.tris = self.px.split()
        P = self.px.fit(neu)
        self.sides = {}
        for side, ((b0, b1), (c0, c1)) in self.PARTS.items():
            sx = 1 if side == 'l' else -1
            c, R = sphere_fit(P[b0:b1])
            # rotate down and slightly inward about the eyeball centre
            Rm = _rot([1, 0, 0], GAZE_DOWN) @ _rot([0, 1, 0], -sx * GAZE_IN)
            self.sides[side] = dict(c=c, R=R, Rm=Rm, ball=(b0, b1), cornea=(c0, c1), sx=sx)
        self.P0 = self.place(neu)

    def place(self, X):
        """Proxy vertex positions (per source vertex) for base vertex set X, gaze applied."""
        P = self.px.fit(X)
        for s in self.sides.values():
            b0, b1 = s['ball']; c0, c1 = s['cornea']
            c, _ = sphere_fit(P[b0:b1])
            for a0, a1 in ((b0, b1), (c0, c1)): P[a0:a1] = c + (P[a0:a1] - c) @ s['Rm'].T
        return P

    def axis(self, side, P):
        """Eyeball centre and the direction through the pupil the MakeHuman texture paints."""
        s = self.sides[side]; b0, b1 = s['ball']; c, _ = sphere_fit(P[b0:b1])
        if 'pupil_uv' not in s:
            img = _img(SYS + 'eyes/materials/blue_eye.png')[..., :3].mean(-1)
            sel = (self.src >= b0) & (self.src < b1); uvs = self.uv_mh[sel]
            lo, hi = uvs.min(0), uvs.max(0); h, w = img.shape
            ys, xs = np.mgrid[0:h, 0:w]; u = (xs + 0.5) / w; v = 1 - (ys + 0.5) / h
            m = (img < 0.06) & (u > lo[0]) & (u < hi[0]) & (v > lo[1]) & (v < hi[1])
            s['pupil_uv'] = np.array([u[m].mean(), v[m].mean()])
        sel = np.where((self.src >= b0) & (self.src < b1))[0]
        d = np.linalg.norm(self.uv_mh[sel] - s['pupil_uv'], axis=1); k = sel[np.argsort(d)[:4]]; w = 1 / (np.sort(d)[:4] + 1e-5)
        p = (P[self.src[k]] * w[:, None]).sum(0) / w.sum()
        fwd = (p - c) / np.linalg.norm(p - c)
        return c, fwd

    def mesh(self):
        """Output vertices (split at UV seams) with the polar iris UVs, and the triangles of
        each material: {'eye': tris, 'cornea': tris} over the output vertex list."""
        P = self.P0; out_src = self.src
        uv = np.zeros((len(out_src), 2)); mats = {'eye': [], 'cornea': []}; side_of = np.zeros(len(out_src), int)
        for side, s in self.sides.items():
            c, fwd = self.axis(side, P)
            ax = np.cross([0, 1.0, 0], fwd); ax /= np.linalg.norm(ax); ay = np.cross(fwd, ax)
            s['frame'] = (c, fwd, ax, ay)
            b0, b1 = s['ball']
            sel = (out_src >= b0) & (out_src < b1)
            d = P[out_src[sel]] - c; d /= np.linalg.norm(d, axis=1)[:, None]
            ang = np.arccos(np.clip(d @ fwd, -1, 1)); az = np.arctan2(d @ ay, (d @ ax) * s['sx'])
            r = 0.5 * np.sin(np.minimum(ang, math.pi / 2))
            uv[sel] = np.stack([0.5 + r * np.cos(az), 0.5 + r * np.sin(az)], 1)
            side_of[sel] = 1 if side == 'l' else 2
        for t in self.tris:
            v = out_src[t[0]]
            is_cornea = any(s['cornea'][0] <= v < s['cornea'][1] for s in self.sides.values())
            mats['cornea' if is_cornea else 'eye'].append(tuple(int(i) for i in t))
        return P[out_src], uv, mats

    def delta(self, X):
        """Per output vertex offsets for the morphed base vertex set X."""
        return (self.place(X) - self.P0)[self.src]


def eye_textures(eyes, out_dir, size=512):
    """eye_iris.webp, one texture for every eye colour, in the polar layout of the eyeball UVs
    (axis at the centre, iris edge at IRIS_R). Outside the iris it holds a clean sclera taken
    from the MakeHuman blue eye; inside, grey iris fibres (0.5 is average, higher is a lighter
    fibre). The eye shader (avatar-face.js) colours the fibres, draws the pupil and the limbal
    ring itself, so every colour stays clear and saturated."""
    P, uvp, mats = eyes.mesh()
    s = eyes.sides['l']; b0, b1 = s['ball']
    keep = np.where((eyes.src >= b0) & (eyes.src < b1))[0]; kset = set(keep.tolist())
    tris = np.array([t for t in mats['eye'] if t[0] in kset])
    HI = 512
    R, mask = rasterize(uvp, eyes.uv_mh, tris, HI)
    uvm = dilate(R, mask, 16).reshape(-1, 2)
    yy, xx = np.mgrid[0:size, 0:size]; dx, dy = (xx + 0.5) / size - 0.5, (yy + 0.5) / size - 0.5
    rr = np.hypot(dx, dy); th = np.arctan2(dy, dx)
    def polar(path, radius):
        col0 = sample(_img(path), uvm)[:, :3].reshape(HI, HI, 3)
        suv = np.stack([0.5 + radius * np.cos(th), 0.5 - radius * np.sin(th)], -1).reshape(-1, 2)
        return sample(col0, suv).reshape(size, size, 3)
    # sclera: the source's own, from outside its limbal ring, pulled most of the way to a clean
    # warm white so it never reads grey or muddy; a faint pink towards the corners
    rsc = 0.235 + np.maximum(rr - IRIS_R, 0) * (0.5 - 0.235) / (0.5 - IRIS_R)
    scl = polar(SYS + 'eyes/materials/blue_eye.png', rsc)
    g = scl.mean(-1, keepdims=True)
    white = np.array([0.93, 0.915, 0.895])
    scl = white * (0.8 + 0.2 * np.clip(scl / np.maximum(scl.mean(), 1e-3), 0.6, 1.3))
    scl = scl * (1 - 0.1 * smoothstep(0.3, 0.46, rr)[..., None] * np.array([0.2, 1.0, 1.0]))
    # iris fibres: the MakeHuman grey iris (real crypts and fibres), high-passed, plus fine
    # radial streaks so the fibres read as spokes from the pupil
    SRC_R = 0.155
    src = polar(SYS + 'eyes/materials/grey_eye.png', np.minimum(rr, IRIS_R) * SRC_R / IRIS_R).mean(-1)
    t = np.clip(rr / IRIS_R, 0, 1)
    ring_mean = np.array([src[(np.abs(t - k / 64) < 1 / 64) & (rr < IRIS_R)].mean() if ((np.abs(t - k / 64) < 1 / 64) & (rr < IRIS_R)).any() else 0.5 for k in range(65)])
    hp = src - np.interp(t, np.linspace(0, 1, 65), ring_mean)
    hp = hp / max(1e-3, np.abs(hp[rr < IRIS_R]).std() * 2.2)
    rng = np.random.default_rng(7)
    streak = np.zeros_like(rr)
    for _ in range(26):
        n = int(rng.integers(30, 150)); ph = rng.uniform(0, 2 * math.pi); wob = rng.uniform(0.5, 3)
        streak += np.cos(n * th + ph + wob * np.sin(t * 9 + ph)) / 26 ** 0.5
    streak = np.tanh(streak * 0.9)
    fib = 0.5 + 0.22 * np.clip(hp, -1.4, 1.4) + 0.2 * streak
    # the collarette: a lighter, wavy ring about a third of the way out from the pupil
    rc = 0.47 + 0.035 * np.sin(th * 11 + 1.3) + 0.02 * np.sin(th * 23)
    fib += 0.14 * np.exp(-((t - rc) / 0.06) ** 2)
    fib = np.clip(fib, 0, 1)[..., None] * np.ones(3)
    edge = smoothstep(IRIS_R + 0.008, IRIS_R + 0.002, rr)[..., None]
    out = fib * edge + scl * (1 - edge)
    return {'eye_iris.webp': save_webp(out, f'{out_dir}/eye_iris.webp', q=90)}


# ---------------------------------------------------------------- brows and lashes
# The brows are placed by rule and built live by the site (js/app/avatar-brows.js); brows.py
# paints their atlas and supplies the landmarks, presets and styles in the glb meta.
import brows as _brows


def brow_atlas(out_dir, K):
    """brow_atlas.webp (see brows.py); sets K.brow_meta for the glb. Returns (sizes, tiles)."""
    at, tiles, K.brow_meta = _brows.build(K)
    if out_dir is None: return {}, tiles
    arr = np.round(np.clip(at, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(arr, 'RGBA').save(f'{out_dir}/brow_atlas.webp', 'WEBP', quality=85, alpha_quality=60, method=6)
    return {'brow_atlas.webp': os.path.getsize(f'{out_dir}/brow_atlas.webp')}, tiles


def lash_atlas(out_dir):
    """eye_lash.webp: eyelashes01 (left half) and eyelashes02 (right half)."""
    a1 = _img(SYS + 'eyelashes/eyelashes01/eyelashes01.png', 512)
    a2 = _img(SYS + 'eyelashes/eyelashes02/eyelashes02.png', 512)
    at = np.concatenate([a1, a2], 1)
    at[..., :3] = 0.9
    at = np.asarray(Image.fromarray(np.round(at * 255).astype(np.uint8), 'RGBA').resize((512, 256), Image.LANCZOS)) / 255.0
    return {'eye_lash.webp': save_webp(at, f'{out_dir}/eye_lash.webp', q=90)}


def lash_parts(K, Part, neu):
    out = {}
    for pid, name, half, short in (('lash', 'eyelashes01', 0, 0.72), ('lash-long', 'eyelashes02', 1, 1.0)):
        px = Proxy(SYS + f'eyelashes/{name}/{name}.mhclo'); P = px.fit(neu); src, uv, tris = px.split()
        Q = P[src].copy()
        c = K.eyeL
        for i, q in enumerate(Q):
            k = short * (0.55 if q[1] < c[1] - 0.01 else 1.0)    # lower lashes stay short
            if k < 1:
                root = K.S_all.nearest(q)[0]
                Q[i] = root + (q - root) * k
        part = Part('lash')
        ids = [part.add(q, 1.0, 1.0, ((half + t[0]) / 2, t[1])) for q, t in zip(Q, uv)]
        for a, b, c in tris: part.tri(ids[a], ids[b], ids[c])
        part.noao = True
        out[pid] = part
    return out


# ---------------------------------------------------------------- facial hair
def _table(pts, x):
    xs, ys = zip(*pts); return np.interp(x, xs, ys)


def fh_density(P, lip_mask):
    """Facial hair areas for points P (n, 3) on the neutral head: moustache, chin (goatee) and
    the full beard, each 0-1 with soft edges."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x)
    lips = np.clip(lip_mask(P) * 1.6, 0, 1)
    front = smoothstep(0.85, 1.0, z)
    top = 6.862 - 0.13 * (ax / 0.3) ** 2
    bot = 6.705 + 0.02 * (1 - smoothstep(0.0, 0.2, ax)) - 0.11 * smoothstep(0.17, 0.29, ax)
    m = smoothstep(top + 0.012, top - 0.01, y) * smoothstep(bot - 0.012, bot + 0.008, y) * smoothstep(0.31, 0.27, ax) * front
    w = 0.12 + 0.06 * smoothstep(6.15, 6.5, y)
    c = smoothstep(w + 0.02, w - 0.02, ax) * smoothstep(6.6, 6.56, y) * smoothstep(6.04, 6.14, y) * smoothstep(0.5, 0.75, z)
    cheek = _table([(0.0, 6.8), (0.24, 6.8), (0.42, 6.86), (0.58, 6.98), (0.66, 7.15), (0.75, 7.3), (2, 7.3)], ax)
    # the neckline: under the chin it sits low, towards the ears it climbs to the jaw angle, so
    # the sides of the neck stay clear
    neck = _table([(-0.3, 6.82), (0.1, 6.74), (0.35, 6.56), (0.6, 6.3), (0.85, 6.13), (2, 6.1)], z)
    b = smoothstep(cheek + 0.03, cheek - 0.11, y) * smoothstep(neck - 0.04, neck + 0.1, y) * smoothstep(-0.25, 0.05, z)
    b *= 1 - smoothstep(0.24, 0.18, ax) * smoothstep(6.84, 6.9, y)          # not on the nose
    b *= 1 - smoothstep(0.58, 0.64, ax) * smoothstep(0.76, 0.66, z) * smoothstep(6.8, 6.88, y)   # not on the ear
    return [np.clip(v * (1 - lips), 0, 1) for v in (m, c, b)]


def fh_strands(out_dir, w=256, h=128, n=420, seed=31):
    """fh_strands.webp: short, slightly wavy beard hairs for the fringe cards. Greyscale in
    RGB (the material colour gives the hair colour), the hairs in alpha; roots at the top."""
    r = np.random.default_rng(seed)
    a = np.zeros((h, w)); g = np.zeros((h, w))
    for _ in range(n):
        # hairs start at different depths and fade in, so the card's root edge never shows as a line
        x0 = r.random() * w; y0 = int(r.random() * 0.3 * h); ln = h * (0.4 + 0.45 * r.random()); lean = (r.random() - 0.5) * 18; br = 0.6 + 0.4 * r.random()
        for k in range(int(min(ln, h - y0))):
            yi = y0 + k; t = k / ln; x = x0 + lean * t * t + 1.5 * np.sin(t * 6 + x0)
            wd = 1.3 * (1 - 0.8 * t)
            for dx in (-1, 0, 1):
                xi = int(x + dx) % w; f = max(0.0, 1 - abs(xi + 0.5 - x % w) / (wd + 0.01))
                if f > 0: a[yi, xi] = max(a[yi, xi], f * (1 - 0.4 * t) * min(1, t / 0.15)); g[yi, xi] = max(g[yi, xi], br)
    col = np.clip(0.6 + 0.4 * g, 0, 1)
    out = np.dstack([col, col, col, np.clip(a * 1.2, 0, 1)])
    return {'fh_strands.webp': save_webp(out, f'{out_dir}/fh_strands.webp', q=88)}


def fh_masks(K, out_dir, size=512):
    """fh_masks.webp: R moustache, G goatee (chin), B full beard, in the head UV layout.
    The site paints facial hair from these with strand noise (avatar-face.js)."""
    R, mask = rasterize(K.uv, K.hv_skin, K.skin_tris, size)
    R = dilate(R, mask, 6)
    m, c, b = fh_density(R.reshape(-1, 3), K.lip_mask)
    img = np.stack([m, c, b], 1).reshape(size, size, 3) * (R[..., :1] != 0)
    img = np.asarray(Image.fromarray(np.round(img * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))) / 255.0
    return {'fh_masks.webp': save_webp(img, f'{out_dir}/fh_masks.webp', q=88)}


def beard_fringe(K, Part, length, spacing, seed):
    """Short strand cards along the jaw and under the chin, where the beard turns under: the
    painted beard reads flat at the silhouette without them. Material 'beard' (hair strands)."""
    rng = np.random.default_rng(seed)
    P, N = K.S.V, K.S.vn
    _, _, b = fh_density(P, K.lip_mask)
    # roots on the jaw's lower edge as seen from the front and side, not on the neck below it
    pick = np.where((b > 0.6) & (N[:, 1] < -0.15) & (N[:, 1] > -0.75) & (N[:, 2] + np.abs(N[:, 0]) > 0.45)
                    & (P[:, 1] > 6.16) & (P[:, 1] < 6.5) & (P[:, 2] > -0.1))[0]
    seen, roots = set(), []
    for i in rng.permutation(pick):
        k = tuple(np.floor(P[i] / spacing).astype(int))
        if k in seen: continue
        seen.add(k); roots.append(i)
    part = Part('fringe')
    for i in roots:
        p, n = P[i], N[i]
        g = n * 0.55 + np.array([0, -1.0, 0]) * 0.45 + rng.normal(0, 0.1, 3); g /= np.linalg.norm(g)
        t = np.cross(g, n); t /= np.linalg.norm(t) + 1e-9
        L = length * (0.7 + 0.6 * rng.random()); w = spacing * 1.6
        r0 = p - n * 0.004
        a = part.add(r0 - t * w / 2, 1.0, 1.0, (0.0, 1.0), g); b_ = part.add(r0 + t * w / 2, 1.0, 1.0, (1.0, 1.0), g)
        c = part.add(r0 + g * L + t * w * 0.15, 1.0, 1.0, (0.65, 0.0), g); d = part.add(r0 + g * L - t * w * 0.15, 1.0, 1.0, (0.35, 0.0), g)
        part.quad(a, b_, c, d)
    return part
