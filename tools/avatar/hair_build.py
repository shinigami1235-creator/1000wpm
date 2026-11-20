"""Build the hairstyles from MakeHuman hair proxies and Sketchfab models (CC0 and CC BY, see
LICENSES.md). MakeHuman styles are alpha cards fitted to the neutral hm08 head through their
.mhclo binding. Sketchfab styles come from hair_sketchfab.py (.npz in SF_HAIR) and are warped
onto the head by surface_fit: from the head they were made on (crop, messy, side swept,
undercut, mohawk) or from their hair cap (curly, afro). Then every style is cleaned up:
  - cards pushed clear of the skin, the ears and the outfit, and cut at the bust line
  - optional squash toward the scalp (buzz, the hair under the hood) or trims (mohawk)
  - a scalp layer: the head's own skin under the hair, faded out at the hairline, so no
    skin shows between cards and the hairline blends into the skin
  - per vertex: shading normal (card normal blended with the head's round shape), strand
    direction (from the texture's strand axis), ambient occlusion and root-to-tip value
  - the texture turned into grey strand detail with alpha, colour bled into the clear
    parts so edges keep no grey halo, saved as WebP
Output: assets/avatar/items/hair-<id>.glb.raw (packed later by pack_all.mjs) and
assets/avatar/tex/hair-<id>.webp.
The runtime (js/app/avatar-hair.js) binds every vertex to the nearest head vertices when
the file loads, so hair follows the face and head sliders.
Usage: python3 hair_build.py HEAD_NPZ NEU_NPY OUT_DIR [ids,...]
Sketchfab sources first: see hair_sketchfab.py (SF_HAIR, default /home/claude/hairwork/sf2/src)."""
import os, sys, math, json, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from collections import Counter, defaultdict
from PIL import Image, ImageFilter
from geom import Surface, Scalp, smooth, table, C, Part
from gltf_writer import GLB, FLOAT, U8, U16
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import hair_mh

PACKS = os.environ.get('MH_PACKS', '/home/claude/mhpacks')
SYS = PACKS + '/makehuman_system_assets_cc0/hair/'
H1 = PACKS + '/hair01_cc0/hair/'
H2 = PACKS + '/hair02_ccby/hair/'
H3 = PACKS + '/hair03_ccby/hair/'
CUT_Y = 4.62
SF = os.environ.get('SF_HAIR', '/home/claude/hairwork/sf2/src') + '/'   # hair_sketchfab.py outputs

# id: source and adjustments.
#   squash: pull cards toward the scalp (1 = as made, 0 = on the skin)
#   puff: push cards out from the scalp by this factor (more volume)
#   keep(p): cards whose centre fails are dropped
#   scalp: how far the scalp layer reaches past the hair (dm, negative = stays inside)
#   dens: scalp layer opacity under the cards
#   tex: texture size
UC_TOP = lambda p: p[1] > 7.74 or (p[2] > 0.45 and p[1] > 7.6)
STYLES = {
    # short: a solid scalp base, the cards doubled closer in so no skin shows, calmer strand contrast
    # crop, messy, side swept, undercut, mohawk: sculpted Sketchfab clumps (hair_sketchfab.py slot),
    # warped onto our head, smooth volume shading, a men's hairline and a clipper layer for the sides
    'buzz':        dict(src=SYS + 'short01', no_cards=True, dens=0.96, off=0.012, fade=0.06, tex=64),
    'crop':        dict(src=SF + 'c01_2.npz', keep=lambda p: not (p[2] > 0.5 and p[1] < 7.93), fit='surface', dens=1.0, tex=512, nsmooth=(0.3, 0.85), contrast=0.4, ao_k=0.6, rnd_k=0.4, hl_kind='men', hl_raise=0.3, fade=0.14, buzz_sides=0.9, sides_fade=0.08, sides_off=0.012, off=0.012, drop_shell=0.035, fine=True),
    'messy':       dict(src=SF + 'c01_1.npz', fit='surface', dens=1.0, tex=512, nsmooth=(0.3, 0.85), contrast=0.4, ao_k=0.6, rnd_k=0.4, hl_kind='men', hl_raise=0.3, fade=0.14, buzz_sides=0.9, sides_fade=0.08, sides_off=0.012, off=0.012, drop_shell=0.035, fine=True),
    'sidepart':    dict(src=SF + 'c01_11.npz', fit='surface', dens=1.0, tex=512, nsmooth=(0.3, 0.85), contrast=0.4, ao_k=0.6, rnd_k=0.4, hl_kind='men', hl_raise=0.3, fade=0.14, buzz_sides=0.9, sides_fade=0.08, sides_off=0.012, off=0.012, drop_shell=0.035, fine=True),
    'slick':       dict(src=SYS + 'short04', layers=(0.75, 1.0), contrast=0.7, dens=1.0, tex=1024),
    'undercut':    dict(src=SF + 'c01_3.npz', fit='surface', dens=1.0, tex=512, nsmooth=(0.3, 0.85), contrast=0.4, ao_k=0.6, rnd_k=0.4, hl_kind='men', hl_raise=0.3, fade=0.14, buzz_sides=0.9, sides_fade=0.08, sides_off=0.012, off=0.012, drop_shell=0.035, fine=True),
    'mohawk':      dict(src=SF + 'c08_0.npz', keep=lambda p: abs(p[0]) < 0.5, region=lambda p: abs(p[0]) < 0.3, puff=1.8,
                        fit='surface', dens=1.0, tex=512, nsmooth=(0.3, 0.85), contrast=0.4, ao_k=0.6, rnd_k=0.4, hl_kind='men', hl_raise=0.3, fade=0.14, buzz_sides=0.85, sides_fade=0.08, sides_off=0.012, off=0.012, drop_shell=0.035, fine=True),
    'bob':         dict(puff=1.15, src=H1 + 'toigo_blunt_bob', dens=1.0, tex=1024),
    'wavybob':     dict(src=H2 + 'elvs_wavy_bob', dens=1.0, tex=1024),
    'curtain':     dict(puff=1.15, src=H2 + 'elvs_short_daisy_hair', dens=1.0, tex=1024),
    'longstraight': dict(puff=1.3, src=SYS + 'long01', dens=1.0, tex=1024),
    'longlayered': dict(puff=1.2, src=H2 + 'elvs_daisy_hair', dens=1.0, tex=1024),
    'wavy':        dict(puff=0.92, mirror=True, src=H2 + 'elvs_adrienne_hair', dens=1.0, tex=1024),
    'wavyends':    dict(puff=1.15, src=H2 + 'elvs_that_80s_babe_hair', dens=1.0, tex=1024),
    'curly':       dict(src=SF + 'curly_bea.npz', fit='surface', fit_mode='cap', thin=0.7, dens=1.0, tex=512),
    'afro':        dict(src=SF + 'afro_msa.npz', fit='surface', fit_mode='cap', thin=0.24, dome=dict(thick=0.78, below=0.4), shell=(0.36, 1.0),
                        tangent='random', dens=1.0, tex=384, gap=0.0, fine=True, hl_kind='men', off=0.012, fade=0.08),
    'braids':      dict(src=H2 + 'elvs_braided_rows', dens=1.0, tex=512),
    'bun':         dict(src=H1 + 'rehmanpolanski_hair_bun_brown', dens=1.0, tex=1024),
    'ponytail':    dict(src=SYS + 'ponytail01', dens=1.0, tex=1024),
    'updo':        dict(src=H2 + 'elvs_50s_updo', dens=1.0, tex=1024),
    'long':        dict(puff=1.15, contrast=0.6, src=H2 + 'elvs_keylth_hair', dens=1.0, tex=1024),
    # hood: a short tidy fringe from the textured crop, pressed flat so it tucks under the rim
    'hood':        dict(src=SF + 'c01_2.npz', fit='surface', keep=lambda p: p[2] > 0.62 and p[1] > 7.75, keep_tris=True, squash=0.45,
                        nsmooth=(0.3, 0.85), contrast=0.4, ao_k=0.6, rnd_k=0.4, dens=0.0, tex=256, hood=True),
}


def load_head(head_npz):
    h = np.load(head_npz)
    hv, hf = h['verts'], h['faces']
    S = Surface(hv, hf)
    ear_v = [i for i in range(len(hv)) if abs(hv[i][0]) > 0.66 and 6.78 < hv[i][1] < 7.62 and -0.3 < hv[i][2] < 0.75]
    ear_out = np.abs(hv[ear_v][:, 0]).max(); ear_top = hv[ear_v][:, 1].max()
    ear_z = (hv[ear_v][:, 2].min(), hv[ear_v][:, 2].max())
    def ear_box(p): return abs(p[0]) > 0.62 and 6.75 < p[1] < ear_top + 0.04 and ear_z[0] - 0.05 < p[2] < ear_z[1] + 0.05
    th_ear = lambda z: math.degrees(math.atan2(ear_out, z - C[2]))
    class K: pass
    K.hv, K.hf, K.S, K.ear_box, K.ear_top, K.ear_out, K.EAR_TH = hv, hf, S, ear_box, ear_top, ear_out, (th_ear(ear_z[1]), th_ear(ear_z[0]))
    # the ear itself (the part standing off the head), for the men's hairline
    ear_rim = hv[ear_v][np.abs(hv[ear_v][:, 0]) > ear_out - 0.06]
    K.ear_top_real = float(ear_rim[:, 1].max())
    K.tree = BVHTree.FromPolygons([Vector(p) for p in hv], [list(map(int, t)) for t in hf])
    return K


def hairline(K, a):
    """Height of the natural hairline round the head (a = degrees from the front)."""
    f0, f1 = K.EAR_TH; top = K.ear_top - 0.01
    HL = [(0, 8.0), (18, 7.98), (32, 7.93), (44, 7.82), (54, 7.62), (f0 - 9, 7.38), (f0 - 3, 7.22), (f0 + 1, 7.26),
          (f0 + 5, top), (f1 - 6, top), (f1 + 2, 7.4), (f1 + 12, 7.14), (150, 6.98), (166, 6.92), (180, 6.9)]
    return table(HL, abs(a))


def hairline_men(K, a):
    """A men's short-cut hairline: square temples, sideburns down in front of the ear,
    a tight line over the ear and a low nape."""
    f0, f1 = K.EAR_TH; top = K.ear_top_real + 0.03
    HL = [(0, 8.0), (20, 7.97), (34, 7.9), (44, 7.74), (50, 7.5), (f0 - 6, 7.2), (f0 - 1, 7.12), (f0 + 3, top - 0.02),
          (f0 + 8, top), (f1 - 8, top), (f1 - 2, top - 0.08), (f1 + 6, 7.18), (130, 6.98), (155, 6.86), (180, 6.82)]
    return table(HL, abs(a))


def ang(p): return math.degrees(math.atan2(p[0], p[2] - C[2]))


def nearest_all(S, P):
    Q = np.zeros_like(P); N = np.zeros_like(P); D = np.zeros(len(P))
    for i, p in enumerate(P):
        loc, no, fi, d = S.tree.find_nearest(Vector(p))
        a, b, c = S.T[fi]
        from geom import bary
        w = bary(S.V[a], S.V[b], S.V[c], np.array(loc))
        n = w[0] * S.vn[a] + w[1] * S.vn[b] + w[2] * S.vn[c]; n /= np.linalg.norm(n)
        Q[i] = loc; N[i] = n; D[i] = (p - np.array(loc)) @ n
    return Q, N, D


def ao_bake(P, N, tree, dist=0.5, n_dirs=20, lift=0.006):
    dirs = []
    for k in range(n_dirs):
        zz = 1 - (k + 0.5) / n_dirs; r = math.sqrt(max(0.0, 1 - zz * zz)); a = k * 2.39996
        dirs.append((r * math.cos(a), r * math.sin(a), zz))
    out = np.ones(len(P))
    for i, (p, n) in enumerate(zip(P, N)):
        a = np.cross(n, [0, 1.0, 0]) if abs(n[1]) < 0.9 else np.cross(n, [1.0, 0, 0])
        a /= np.linalg.norm(a); b = np.cross(n, a)
        o = Vector(p + n * lift); hit = tot = 0.0
        for dx, dy, dz in dirs:
            d = a * dx + b * dy + n * dz
            loc, no, fi, dd = tree.ray_cast(o, Vector(d), dist)
            tot += dz
            if loc is not None: hit += dz * (1 - dd / dist) ** 0.7
        out[i] = 1 - hit / tot
    return out


def strand_axis(img):
    """0 if the strands run along the texture's v (vertical), 1 if along u."""
    a = np.asarray(img.convert('LA').resize((256, 256)), float)
    L, A = a[..., 0], a[..., 1] / 255
    gx = np.abs(np.diff(L, axis=1))[:-1, :]; gy = np.abs(np.diff(L, axis=0))[:, :-1]
    m = (A[:-1, :-1] > 0.5)
    ex, ey = (gx * m).sum(), (gy * m).sum()
    return (0 if ex > ey else 1), float(ex / max(ey, 1e-6))


def open_image(path):
    """PIL, or ImageMagick for the few PNGs PIL refuses (a bad iCCP chunk)."""
    try:
        im = Image.open(path); im.load(); return im
    except Exception:
        import subprocess, tempfile
        tmp = tempfile.mktemp(suffix='.png')
        subprocess.run(['convert', path, '-strip', tmp], check=True, capture_output=True)
        im = Image.open(tmp); im.load(); return im


def make_texture(path, size, out_path, gamma=1.0, contrast=1.0):
    """Grey strand detail with alpha: luminance normalised so every style tints the same
    way, colour bled into the clear texels so card edges never pick up a dark halo."""
    im = open_image(path).convert('RGBA')
    if max(im.size) > size: im = im.resize((size, size), Image.LANCZOS)
    a = np.asarray(im, float) / 255
    rgb, A = a[..., :3], a[..., 3]
    if A.min() > 0.98: A = np.ones_like(A)
    L = rgb @ [0.299, 0.587, 0.114]
    m = A > 0.5
    if m.sum() < 100: m = A > 0.05
    lo, hi = np.percentile(L[m], 3), np.percentile(L[m], 97)
    G = np.clip((L - lo) / max(hi - lo, 1e-3), 0, 1)
    G = 0.34 + 0.66 * G ** (0.9 * gamma)
    G = 1 - (1 - G) * contrast                   # keep strand contrast without crushing
    # bleed: fill clear texels with the nearest solid value, by repeated blurs
    g = G * (A > 0.3); w = (A > 0.3).astype(float)
    gi, wi = Image.fromarray((g * 255).astype(np.uint8)), Image.fromarray((w * 255).astype(np.uint8))
    acc_g, acc_w = g.copy(), w.copy()
    for r in (2, 4, 8, 16, 32):
        bg = np.asarray(gi.filter(ImageFilter.GaussianBlur(r)), float) / 255
        bw = np.asarray(wi.filter(ImageFilter.GaussianBlur(r)), float) / 255
        fill = (acc_w < 0.5) & (bw > 1e-3)
        acc_g[fill] = bg[fill] / bw[fill]; acc_w[fill] = 1
    acc_g[acc_w < 0.5] = G[m].mean()
    out = np.where(A > 0.3, G, acc_g)
    o = np.dstack([out, out, out, A]) * 255
    Image.fromarray(o.astype(np.uint8), 'RGBA').save(out_path, 'WEBP', quality=82, method=6, alpha_quality=90)
    return os.path.getsize(out_path), Image.fromarray((A * 255).astype(np.uint8))


def build_style(K, neu, sid, cfg, out_dir, audit=None):
    S = K.S
    if cfg['src'] == 'proc:mohawk':
        r = mohawk_cards(K, neu)
    elif cfg['src'] == 'proc:afro':
        r = afro_cards(K, out_dir)
    elif cfg['src'].endswith('.npz'):
        # a Sketchfab model converted by hair_sketchfab.py, placed by scale and offset
        z = np.load(cfg['src']); xf = cfg.get('xf', (1.0, (0, 0, 0))); sc, off = xf[:2]
        rot = math.radians(xf[2] if len(xf) > 2 else 0)
        R = np.array([[math.cos(rot), 0, math.sin(rot)], [0, 1, 0], [-math.sin(rot), 0, math.cos(rot)]])
        P0 = z['P']
        if cfg.get('upright'): P0 = np.stack([P0[:, 0], -P0[:, 2], P0[:, 1]], 1)   # model lay along z: stand it up
        r = {'P': (P0 @ R.T) * np.array(sc) + np.array(off), 'UV': z['UV'], 'T': z['T'], 'diffuse': str(z['diffuse'])}
        if 'H' in z.files and cfg.get('fit') == 'surface':
            r['P'] = surface_fit(K, z['P'], z['H'], cfg)
        if r['diffuse'] == 'proc:strands':
            import tempfile
            r['diffuse'] = strand_texture(os.path.join(tempfile.gettempdir(), f'strands_{sid}.png'), **cfg.get('strands', {}))
    else:
        r = hair_mh.fit(cfg['src'], neu)
    P, UV, T = r['P'].copy(), r['UV'].copy(), r['T'].copy()
    # ---- drop cards (trims) ----
    if 'keep' in cfg and not cfg.get('thin'):
        cen = P[T].mean(1)
        # whole connected islands are kept or dropped, so no card is cut in half
        parent = list(range(len(P)))
        def find(x):
            while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
            return x
        for t in T:
            parent[find(t[0])] = find(t[1]); parent[find(t[1])] = find(t[2])
        isl = np.array([find(i) for i in range(len(P))])
        ok_isl = defaultdict(list)
        for t, c in zip(T, cen): ok_isl[isl[t[0]]].append(cfg['keep'](c))
        keep_isl = {k for k, v in ok_isl.items() if np.mean(v) > 0.5}
        if cfg.get('keep_tris'): T = np.array([t for t, c in zip(T, cen) if cfg['keep'](c)])
        else: T = np.array([t for t in T if isl[t[0]] in keep_isl])
    if cfg.get('thin'):
        # very dense sources: keep a share of the strand clumps (whole islands)
        parent = np.arange(len(P))
        def find(x):
            while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
            return x
        for t in T:
            a_, b_, c_ = find(t[0]), find(t[1]), find(t[2]); parent[b_] = a_; parent[c_] = a_
        isl = np.array([find(i) for i in range(len(P))])
        ids, cnt = np.unique(isl, return_counts=True)
        rng = np.random.default_rng(5); keep = set()
        for i, c in zip(ids, cnt):
            cen = P[isl == i].mean(0)
            if abs(cen[0]) > 1.5: continue                      # a stray piece off to the side
            if 'keep' in cfg and not all(cfg['keep'](q) for q in P[isl == i]): continue
            if rng.random() < cfg['thin']: keep.add(i)
        T = T[[isl[t[0]] in keep for t in T]]
    if cfg.get('dome'):
        P, T = dome_remap(K, P, T, cfg['dome'])
    if cfg.get('mirror'):
        # keep the side with the big fall and mirror it, so it falls on both sides
        cen = P[T].mean(1); T = T[cen[:, 0] > -0.02]
        n0 = len(P); P = np.concatenate([P, P * [-1, 1, 1]]); UV = np.concatenate([UV, UV])
        T = np.concatenate([T, T[:, ::-1] + n0])
    Q, N, D = nearest_all(S, P)
    if cfg.get('drop_shell'):
        # a sculpted source's skin-tight cap (its painted fade) would cover our scalp layer:
        # islands lying within drop_shell of the head are dropped, the scalp layer does the sides
        from scipy.sparse import coo_matrix
        from scipy.sparse.csgraph import connected_components
        r_ = np.concatenate([T[:, 0], T[:, 1], T[:, 2]]); c_ = np.concatenate([T[:, 1], T[:, 2], T[:, 0]])
        lab = connected_components(coo_matrix((np.ones(len(r_)), (r_, c_)), shape=(len(P), len(P))), directed=False)[1]
        med = {i: np.median(D[lab == i]) for i in np.unique(lab[T[:, 0]])}
        T = T[[med[lab[t[0]]] > cfg['drop_shell'] for t in T]]
    if 'layers' in cfg:
        # extra copies of the cards at other heights fill the gaps in a big volume
        n0 = len(P); Ps, UVs, Ts = [], [], []
        for k, f in enumerate(cfg['layers']):
            Ps.append(Q + (P - Q) * f); UVs.append(UV); Ts.append(T + k * n0)
        P, UV, T = np.concatenate(Ps), np.concatenate(UVs), np.concatenate(Ts)
        Q, N, D = nearest_all(S, P)
    # ---- squash or puff relative to the scalp ----
    if 'squash' in cfg or 'puff' in cfg:
        k = cfg.get('squash', 1.0) * cfg.get('puff', 1.0)
        top = np.array([smooth(hairline(K, ang(q)) - 1.3, hairline(K, ang(q)) - 0.1, q[1]) for q in Q])
        P = Q + (P - Q) * (1 + (k - 1) * top[:, None])
        Q, N, D = nearest_all(S, P)
    if 'sides' in cfg:
        # clipper sides: everything below the line lies close to the skin
        y0, ks = cfg['sides']
        f = np.array([smooth(y0 + 0.08, y0 - 0.1, q[1]) if abs(q[0]) > 0.25 or q[2] < 0.0 else 0.0 for q in Q])
        P = Q + (P - Q) * (1 + (ks - 1) * f[:, None])
        Q, N, D = nearest_all(S, P)
    # ---- keep clear of the skin and ears ----
    gap = cfg.get('gap', 0.012)
    for i in range(len(P)):
        g = gap
        if K.ear_box(Q[i]): g = 0.035
        if P[i][1] < 6.4: g = max(g, 0.06 + 0.1 * smooth(6.4, 5.8, P[i][1]))   # neck, shoulders: clothes sit there
        if D[i] < g: P[i] = Q[i] + N[i] * g
    Q, N, D = nearest_all(S, P)
    # ---- cut at the bust line ----
    keep = [t for t in T if P[t, 1].max() > CUT_Y + 0.02]
    T = np.array(keep)
    P[:, 1] = np.maximum(P[:, 1], CUT_Y + 0.01)
    used = np.unique(T); remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
    P, UV, Q, N, D, T = P[used], UV[used], Q[used], N[used], D[used], remap[T]
    # ---- texture ----
    tex_name = f'hair-{sid}.webp'
    tsize, alpha_img = make_texture(r['diffuse'], cfg.get('tex', 1024), os.path.join(out_dir, 'tex', tex_name), cfg.get('gamma', 1.0), cfg.get('contrast', 1.0))
    axis, ratio = strand_axis(open_image(r['diffuse']))
    # ---- strand direction: the 3D direction of the texture's strand axis ----
    Tn = np.zeros_like(P); Fn = np.zeros_like(P)
    for t in T:
        p0, p1, p2 = P[t]; u0, u1, u2 = UV[t]
        e1, e2 = p1 - p0, p2 - p0; d1, d2 = u1 - u0, u2 - u0
        det = d1[0] * d2[1] - d1[1] * d2[0]
        fn = np.cross(e1, e2)
        Fn[t] += fn
        if abs(det) < 1e-12: continue
        dPdu = (e1 * d2[1] - e2 * d1[1]) / det; dPdv = (e2 * d1[0] - e1 * d2[0]) / det
        s = dPdv if axis == 0 else dPdu
        s = s / (np.linalg.norm(s) + 1e-9) * np.linalg.norm(fn)
        Tn[t] += s
    Tn /= np.linalg.norm(Tn, axis=1)[:, None] + 1e-9
    Fn /= np.linalg.norm(Fn, axis=1)[:, None] + 1e-9
    if cfg.get('tangent') == 'random':
        # curls: no single strand direction, so the sheen breaks up instead of banding
        rng_t = np.random.default_rng(3); Tn = rng_t.normal(size=P.shape)
        Tn -= N * (Tn * N).sum(1)[:, None]; Tn /= np.linalg.norm(Tn, axis=1)[:, None] + 1e-9
    elif cfg.get('flow', 0.6 < ratio < 1.5):
        # cap-shaped textures with strands in every direction: comb from the crown instead
        crown = np.array([0.0, 8.35, -0.2]) + np.array(cfg.get('crown', (0, 0, 0)))
        Tn = P - crown
        Tn -= N * (Tn * N).sum(1)[:, None]
        Tn /= np.linalg.norm(Tn, axis=1)[:, None] + 1e-9
    # ---- shading normal: card normal turned outward, blended with the head's round shape ----
    cy = np.clip(P[:, 1], 6.3, 7.75)
    R = P - np.stack([np.zeros(len(P)), cy, np.full(len(P), C[2])], 1)
    R /= np.linalg.norm(R, axis=1)[:, None] + 1e-9
    Fn *= np.sign((Fn * R).sum(1) + 1e-6)[:, None]
    Ns = 0.35 * Fn + 0.65 * R; Ns /= np.linalg.norm(Ns, axis=1)[:, None]
    if cfg.get('nsmooth'):
        # sculpted clumps: shade the volume, not each ribbon, with normals averaged over a
        # small neighbourhood of the hair surface (Sims-style soft clumps)
        from scipy.spatial import cKDTree
        rad, wf = cfg['nsmooth']
        An = np.zeros_like(P)
        for t in T:
            fn = np.cross(P[t[1]] - P[t[0]], P[t[2]] - P[t[0]])
            for v in t: An[v] += fn
        An *= np.sign((An * R).sum(1) + 1e-9)[:, None]
        An /= np.linalg.norm(An, axis=1)[:, None] + 1e-9
        tr = cKDTree(P); Sm = np.zeros_like(P)
        for i, nb in enumerate(tr.query_ball_point(P, rad)): Sm[i] = An[nb].sum(0)
        Sm /= np.linalg.norm(Sm, axis=1)[:, None] + 1e-9
        Ns = wf * Sm + (1 - wf) * R + 0.15 * Fn; Ns /= np.linalg.norm(Ns, axis=1)[:, None]
        # strand directions smoothed the same way (pointed away from the crown first), so the
        # highlight runs as one band across the clumps instead of breaking into patches
        crown = np.array([0.0, 8.35, -0.2])
        Tn *= np.sign(((P - crown) * Tn).sum(1) + 1e-9)[:, None]
        Ts = np.zeros_like(Tn)
        for i, nb in enumerate(tr.query_ball_point(P, rad)): Ts[i] = Tn[nb].sum(0)
        Ts = Ts / (np.linalg.norm(Ts, axis=1)[:, None] + 1e-9)
        Ts = 0.55 * Ts + 0.45 * Tn                     # each clump keeps a little of its own turn
        Ts -= Ns * (Ts * Ns).sum(1)[:, None]
        Tn = Ts / (np.linalg.norm(Ts, axis=1)[:, None] + 1e-9)
    # ---- AO against the head and the hair itself ----
    hv, hf = K.hv, K.hf
    tree = BVHTree.FromPolygons([Vector(p) for p in hv] + [Vector(p) for p in P],
                                [list(map(int, t)) for t in hf] + [[int(a) + len(hv), int(b) + len(hv), int(c) + len(hv)] for a, b, c in T])
    ao = ao_bake(P, Ns, tree, dist=0.45)
    # ---- root to tip ----
    rt = np.clip(0.55 * np.clip((D - 0.02) / 0.4, 0, 1) + 0.6 * np.clip((7.5 - P[:, 1]) / 2.6, 0, 1), 0, 1)
    # random value per card island, for gentle variation
    parent = list(range(len(P)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for t in T: parent[find(t[0])] = find(t[1]); parent[find(t[1])] = find(t[2])
    rng = np.random.default_rng(7)
    rv = {}
    rnd = np.array([rv.setdefault(find(i), rng.random()) for i in range(len(P))])
    # sculpted sources: calmer layer-to-layer steps, so the clumps read as one soft volume
    ao = 1 - (1 - ao) * cfg.get('ao_k', 1.0)
    rnd = 0.5 + (rnd - 0.5) * cfg.get('rnd_k', 1.0)
    parts = [] if cfg.get('no_cards') else [('cards', 'hair', P, T, UV, Ns, Tn, np.stack([ao, rt, rnd, np.ones(len(P))], 1))]
    # ---- scalp layer ----
    if cfg.get('dens', 0.85) > 0:
        parts.append(scalp_fine(K, cfg, levels=1) if cfg.get('fine') else scalp_layer(K, P, T, cfg))   # mostly under the cards
    if 'base' in r:
        parts.append(r['base'])
    if 'shell' in cfg:
        off, d = cfg['shell']
        sl = scalp_layer(K, P, T, dict(cfg, dens=d, off=off, cover=cfg.get('cover', 0.5) + off))
        parts.append(('shell',) + sl[1:])
    if cfg.get('buzz_sides'):
        sc = dict(dens=float(cfg['buzz_sides']), fade=cfg.get('sides_fade', 0.06), off=cfg.get('sides_off', 0.004), hl_kind=cfg.get('hl_kind'))
        if 'sides_region' in cfg: sc['region'] = cfg['sides_region']
        if 'sides_raise' in cfg: sc['hl_raise'] = cfg['sides_raise']
        sl = scalp_fine(K, sc) if cfg.get('fine') else scalp_layer(K, None, None, sc)
        parts.append(('sides',) + sl[1:])
    if cfg.get('hood'):
        parts.append(hood_part(K))
    stats = write(sid, parts, out_dir)
    stats.update(tex=tsize, tex_name=tex_name, axis=axis, axis_ratio=round(ratio, 2), verts=int(len(P)), tris=int(len(T)),
                 extent=extent(P), src=os.path.basename(cfg['src']))
    return stats


def surface_fit(K, P, H, cfg):
    """Warp hair made on another head onto ours. The source skull is first scaled to ours
    (width, front to back, eye line to crown), then every hair vertex moves by the smoothed
    offset that carries the nearby source head surface onto our head, so the hair keeps its
    thickness over the scalp and nothing folds."""
    from scipy.spatial import cKDTree
    hv = K.hv; EY = 7.42
    if cfg.get('fit_mode') == 'cap':
        # the source is a hair cap, not a head: its box goes onto our scalp's box (the head
        # above the hairline), keeping the cap's own proportions up and down
        sel = np.array([p[1] > hairline(K, ang(p)) - 0.05 and abs(p[0]) < 1.2 for p in hv])
        tgt = hv[sel]
        mt = np.array([tgt[:, 1].max(), np.abs(tgt[:, 0]).max(), tgt[:, 2].max(), tgt[:, 2].min()])
        ms = np.array([H[:, 1].max(), np.abs(H[:, 0]).max(), H[:, 2].max(), H[:, 2].min()])
        EY = mt[0] - (mt[0] - tgt[:, 1].min()) * 0.0   # pivot at the crown
        sx = mt[1] / ms[1]; sz = (mt[2] - mt[3]) / (ms[2] - ms[3]); sy = (sx + sz) / 2
        ms = ms.copy(); EY_s = ms[0]
    else:
        H = H[H[:, 1] > 6.2]
        def marks(V):
            s = V[V[:, 1] > 7.75]
            return np.array([s[:, 1].max(), np.abs(s[:, 0]).max(), s[:, 2].max(), s[:, 2].min()])
        mt, ms = marks(hv[(np.abs(hv[:, 0]) < 1.6)]), marks(H)
        EY_s = EY
        sy = (mt[0] - EY) / (ms[0] - EY); sx = mt[1] / ms[1]; sz = (mt[2] - mt[3]) / (ms[2] - ms[3])
    sx, sy, sz = (np.array([sx, sy, sz]) * np.array(cfg.get('fit_scale', (1, 1, 1)))).tolist()
    def aff(V):
        return np.stack([V[:, 0] * sx, EY + (V[:, 1] - EY_s) * sy, mt[3] + (V[:, 2] - ms[3]) * sz], 1)
    Ha, Pa = aff(H), aff(P)
    D = np.zeros_like(Ha)
    for i, p in enumerate(Ha):
        loc = K.tree.find_nearest(Vector(p))[0]
        D[i] = np.array(loc) - p
    tr = cKDTree(Ha)
    _, nb = tr.query(Ha, 12)
    for _ in range(4): D = 0.5 * D + 0.5 * D[nb].mean(1)
    d, nb = tr.query(Pa, 10)
    w = 1 / (d + 0.02) ** 2; w /= w.sum(1)[:, None]
    print('  fit scale', round(sx, 3), round(sy, 3), round(sz, 3), 'mean move', round(float(np.linalg.norm(D, axis=1).mean()), 3))
    return Pa + (D[nb] * w[..., None]).sum(1) + np.array(cfg.get('fit_off', (0, 0, 0)))


def dome_remap(K, P, T, opt):
    """Re-seat a curly source in a round afro: every vertex keeps its direction from the skull
    centre and its place between the scalp and the source's outer surface, but the outer
    surface becomes a round dome, thinner at the front hairline so there is no hard front edge.
    Clumps whose roots sit below the hairline (curls hanging past the ears) are dropped."""
    O = np.array([0.0, 7.7, 0.12])
    D = P - O; r = np.linalg.norm(D, axis=1); U = D / r[:, None]
    rs = np.zeros(len(P)); ys = np.zeros(len(P))
    for i, u in enumerate(U):
        hit = K.tree.ray_cast(Vector(O), Vector(u), 5.0)[0]
        if hit is None: hit = K.tree.find_nearest(Vector(O + u * 1.0))[0]
        rs[i] = (np.array(hit) - O) @ u; ys[i] = hit[1]
    th = np.degrees(np.arctan2(U[:, 0], U[:, 2])); el = np.degrees(np.arcsin(np.clip(U[:, 1], -1, 1)))
    bt, be = np.round(th / 12).astype(int), np.round(el / 12).astype(int)
    h = r - rs; outer = {}
    for k in set(zip(bt, be)):
        m = (bt == k[0]) & (be == k[1]); outer[k] = max(np.percentile(h[m], 95), 0.05)
    t = np.clip(h / np.array([outer[k] for k in zip(bt, be)]), 0, 1.15)
    hl = np.array([hairline(K, a) for a in th])
    front = np.array([smooth(45, 10, abs(a)) * (1 - smooth(h0, h0 + opt.get('ramp', 0.5), y)) for a, h0, y in zip(th, hl, ys)])
    thick = opt.get('thick', 0.55) * (1 - 0.7 * front)
    thick *= 1 - 0.35 * np.array([smooth(120, 180, abs(a)) * smooth(7.6, 7.0, y) for a, y in zip(th, ys)])   # tucked in at the nape
    want = O + U * (rs + 0.02 + t * thick)[:, None]
    # each curl moves as one rigid piece (by its mean move), so the curls keep their shape
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    r_ = np.concatenate([T[:, 0], T[:, 1], T[:, 2]]); c_ = np.concatenate([T[:, 1], T[:, 2], T[:, 0]])
    lab = connected_components(coo_matrix((np.ones(len(r_)), (r_, c_)), shape=(len(P), len(P))), directed=False)[1]
    n_l = np.maximum(np.bincount(lab), 1)
    mv = np.stack([np.bincount(lab, weights=(want - P)[:, k]) / n_l for k in range(3)], 1)
    P2 = P + mv[lab]
    # drop clumps rooted below the hairline
    # roots may sit a little below the hairline over the ears and at the back, never on the face
    below = np.array([0.02 + opt.get('below', 0.35) * smooth(105, 130, abs(a)) for a in th])
    low = (ys < hl - below) | ((np.abs(th) > 45) & (np.abs(th) < 105) & (ys < opt.get('ear_y', 7.6)))   # nothing over the ears
    bad = np.bincount(lab, weights=low) / np.maximum(np.bincount(lab), 1) > 0.4
    T = T[~bad[lab[T[:, 0]]]]
    return P2, T


def strand_texture(path, size=512, seed=2, n=900, soft=1.2, clump=0.35):
    """Tiling grey strand texture for untextured sculpted hair: soft strands along v with broad
    clump bands, fully opaque (the geometry is the clump, the texture only the strands)."""
    rng = np.random.default_rng(seed)
    a = np.zeros((size, size))
    xs = np.arange(size)
    for _ in range(n):
        x = rng.random() * size; w = 0.6 + rng.random() * 1.6; v = rng.random()
        d = np.minimum(np.abs(xs - x), size - np.abs(xs - x))
        prof = np.exp(-(d / w) ** 2) * v
        a = np.maximum(a, prof[None, :] * (0.75 + 0.25 * np.sin(np.linspace(0, 2 * np.pi, size)[:, None] * rng.integers(1, 3) + rng.random() * 6)))
    band = np.zeros(size)
    for _ in range(9):
        x = rng.random() * size; w = 8 + rng.random() * 26
        d = np.minimum(np.abs(xs - x), size - np.abs(xs - x)); band += np.exp(-(d / w) ** 2) * (rng.random() - 0.4)
    a = a * (1 - clump) + clump * (0.5 + 0.5 * np.tanh(band))[None, :]
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(soft))
    im.convert('RGBA').save(path)
    return path


def mohawk_cards(K, neu):
    """A ridge of standing clumps along the middle of the scalp, each two crossed cards
    textured with strands from the MakeHuman long01 texture (tips at the bottom)."""
    S = K.S; rng = np.random.default_rng(11)
    tex = hair_mh.fit(SYS + 'long01', neu)['diffuse']
    P, UV, T = [], [], []
    def base(sd):
        d = np.array([0, math.sin(math.radians(sd)), math.cos(math.radians(sd))])
        return S.out_ray(C, d)
    n_cl = 46
    for k in range(n_cl):
        t = k / (n_cl - 1); sd = 52 + t * 150
        b = base(sd); b2 = base(sd + 2)
        tan = (b2 - b); tan /= np.linalg.norm(tan)
        n = S.normal_at(b); side = np.cross(n, tan); side /= np.linalg.norm(side)
        h = 0.3 + 0.8 * math.sin(math.pi * min(1, 0.12 + t * 1.0)) ** 0.8 + rng.uniform(-0.05, 0.05)    # about 11 cm at the crown
        for cross in (0, 1, 2):
            ang = rng.uniform(-0.3, 0.3) + (0, 1.0, -1.0)[cross]
            ax = tan * math.cos(ang) + side * math.sin(ang)
            w = 0.3 + 0.08 * rng.random(); u0 = rng.uniform(0.04, 0.5); us = 0.1
            rows = 5; ids = []
            for i in range(rows + 1):
                f = i / rows
                c = b - n * 0.02 + n * h * f + tan * (0.3 * h * f ** 1.5) + side * rng.uniform(-0.01, 0.01)
                ww = w * (1 - 0.65 * f)
                for e in (-1, 1):
                    P.append(c + ax * ww * e * 0.5); UV.append((u0 + us * (e + 1) / 2, 0.96 - 0.9 * f)); ids.append(len(P) - 1)
            for i in range(rows):
                a0, a1, b0, b1 = ids[i * 2], ids[i * 2 + 1], ids[i * 2 + 2], ids[i * 2 + 3]
                T += [(a0, a1, b1), (a0, b1, b0)]
    return {'P': np.array(P), 'UV': np.array(UV), 'T': np.array(T), 'diffuse': tex}


def curl_texture(path, size=1024, seed=4, squash=0.4):
    """Curl atlas with alpha. Top half: dense curls, squashed vertically by `squash` because
    the dome stretches them back, tiling left to right (the dome wraps it round the head).
    Bottom half: loose ringlets on clear ground for the standing cards."""
    from PIL import ImageDraw
    rng = np.random.default_rng(seed)
    h = size // 2
    top = Image.new('LA', (size * 3, h), (0, 0)); d = ImageDraw.Draw(top)
    for _ in range(9000):
        cx, cy = rng.random() * size, rng.random() * h
        r = 4 + rng.random() * 7; w = 2 + int(rng.random() * 2); v = int(90 + rng.random() * 165)
        a0 = rng.random() * 360; span = 220 + rng.random() * 200
        for dx in (0, size, 2 * size):
            d.arc([cx + dx - r, cy - r * squash, cx + dx + r, cy + r * squash], a0, a0 + span, fill=(v, 255), width=w)
    top = top.crop((size, 0, 2 * size, h))
    bot = Image.new('LA', (size, h), (0, 0)); d = ImageDraw.Draw(bot)
    for _ in range(700):
        cx, cy = rng.random() * size, rng.random() * h
        r = 5 + rng.random() * 8; w = 2 + int(rng.random() * 2); v = int(110 + rng.random() * 145)
        for t in range(3):
            d.arc([cx - r, cy - r + t * r * 0.8, cx + r, cy + r + t * r * 0.8], rng.random() * 90, 300 + rng.random() * 60, fill=(v, 255), width=w)
    im = Image.new('LA', (size, size), (0, 0)); im.paste(top, (0, 0)); im.paste(bot, (0, h))
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.convert('RGBA').save(path)
    return path


def afro_cards(K, out_dir):
    """A round afro: a curl-textured dome over a solid base, with standing curl cards round
    the outside so the silhouette is soft. Shape from the skull radius on a theta/phi grid."""
    S = K.S
    SC = Scalp(S, K.ear_box)
    import tempfile
    tex = curl_texture(os.path.join(tempfile.gettempdir(), 'afro_curls.png'))
    def off(th, ph, ph0):
        a = abs(((th + 180) % 360) - 180)
        lift = smooth(ph0, ph0 + 22, ph)                         # meets the hairline
        size = 0.62 - 0.12 * smooth(110, 180, a) * smooth(40, 0, ph)   # a little flatter at the nape
        return 0.02 + size * lift ** 0.7
    ths = np.arange(0, 360, 4.0); rows = 26
    grid, ph0s = [], []
    for th in ths:
        ph0 = SC.phi_at_y(th, hairline(K, th if th <= 180 else th - 360)); ph0s.append(ph0)
        col = []
        for i in range(rows + 1):
            ph = ph0 + (89.0 - ph0) * (i / rows) ** 0.9
            col.append((th, ph, ph0))
        grid.append(col)
    def surf(extra, k_scale=1.0):
        P, UV = [], []
        for j, col in enumerate(grid):
            for th, ph, ph0 in col:
                o = off(th, ph, ph0) * k_scale + extra
                P.append(SC.point(th, ph, o)); UV.append((th / 360 * 4, 0.52 + 0.46 * (ph - ph0) / (89.0 - ph0)))
        return np.array(P), np.array(UV)
    m, n = len(grid), rows + 1
    T = []
    for j in range(m):
        k = (j + 1) % m
        for i in range(rows):
            a, b, c, d = j * n + i, k * n + i, k * n + i + 1, j * n + i + 1
            T += [(a, b, c), (a, c, d)]
    T = np.array(T)
    # the seam where theta wraps: copies of the first column with u one period on
    P1, UV1 = surf(0.0)
    P0, UV0 = surf(-0.05, 0.97)
    def unwrap(P_, UV_, T_):
        P_, UV_ = list(P_), list(UV_); T2 = []
        for t in T_:
            us = [UV_[v][0] for v in t]
            if max(us) - min(us) > 2:
                nt = []
                for v in t:
                    if UV_[v][0] < 2: P_.append(P_[v]); UV_.append((UV_[v][0] + 4, UV_[v][1])); nt.append(len(P_) - 1)
                    else: nt.append(v)
                T2.append(nt)
            else: T2.append(list(t))
        return np.array(P_), np.array(UV_), np.array(T2)
    P1, UV1, T1 = unwrap(P1, UV1, T)
    P0, UV0, T0 = unwrap(P0, UV0, T)
    # standing curl cards round the dome
    rng = np.random.default_rng(9)
    Pc, UVc, Tc = [P1], [UV1], [T1]
    nv = len(P1)
    for _ in range(int(afro_cards.n_cards)):
        j = rng.integers(m); i = rng.integers(3, rows)
        th, ph, ph0 = grid[j][i]
        c = SC.point(th, ph, off(th, ph, ph0) - 0.02)
        nrm = SC.point(th, ph, 1.0) - SC.point(th, ph, 0.0); nrm /= np.linalg.norm(nrm)
        t1 = np.cross(nrm, [0, 1.0, 0]); t1 /= np.linalg.norm(t1) + 1e-9
        ang = rng.random() * math.pi; ax = t1 * math.cos(ang) + np.cross(nrm, t1) * math.sin(ang)
        w = 0.07 + rng.random() * 0.05; h = 0.1 + rng.random() * 0.06
        u0, v0 = rng.random() * 0.8, 0.02 + rng.random() * 0.3; us, vs = 0.16, 0.14
        up = nrm * 0.45 + np.cross(nrm, ax) * 0.9; up /= np.linalg.norm(up)       # lean over, like curls lying on the volume
        quad = [c - ax * w, c + ax * w, c + ax * w + up * h, c - ax * w + up * h]
        uvq = [(u0, v0), (u0 + us, v0), (u0 + us, v0 + vs), (u0, v0 + vs)]
        Pc.append(np.array(quad)); UVc.append(np.array(uvq)); Tc.append(np.array([(nv, nv + 1, nv + 2), (nv, nv + 2, nv + 3)])); nv += 4
    N0 = P0 - C; N0 /= np.linalg.norm(N0, axis=1)[:, None]
    base = ('shell', 'scalp', P0, T0, UV0 * 0.0 + 0.5, N0, np.zeros_like(P0), np.stack([np.full(len(P0), 0.55), np.zeros(len(P0)), np.zeros(len(P0)), np.ones(len(P0))], 1))
    return {'P': np.concatenate(Pc), 'UV': np.concatenate(UVc), 'T': np.concatenate(Tc), 'diffuse': tex, 'base': base}


afro_cards.n_cards = 500


def extent(P):
    """How far the hair stands off the skull above the ears (decides cap/visor sizes)."""
    sel = P[(P[:, 1] > 7.3)]
    if not len(sel): return 0
    r = np.linalg.norm(sel - C, axis=1)
    return round(float(np.percentile(r, 98)), 3)


def scalp_layer(K, P, T, cfg):
    """The head's own skin triangles under the hair, raised a hair's width, with a density
    that fades to nothing at the hairline. Strand UVs come from a round projection so the
    shared scalp texture runs back and down like combed hair."""
    S, hv, hf = K.S, K.hv, K.hf
    cover = np.zeros(len(hv))
    if 'region' in cfg:
        cover = np.array([1.0 if cfg['region'](p) else 0.0 for p in hv])
    elif P is not None and cfg.get('ray_cover'):
        htree = BVHTree.FromPolygons([Vector(p) for p in P], [list(map(int, t)) for t in T])
        reach = cfg.get('cover', 0.5)
        for i, (p, n) in enumerate(zip(hv, S.vn)):
            if p[1] < 6.6 or (p[2] > 0.55 and p[1] < 7.55 and abs(p[0]) < 0.7): continue
            loc = htree.ray_cast(Vector(p + n * 0.002), Vector(n), reach)[0]
            if loc is None: loc = htree.ray_cast(Vector(p + n * 0.002), Vector(n * 0.6 + np.array([0, -0.8, 0])), reach)[0]
            cover[i] = 1.0 if loc is not None else 0.0
    else:
        cover[:] = 1.0     # hair covers the whole scalp: a solid base up to the hairline
    # natural hairline: nothing below it
    # hl_drop: men's short cuts with full temples and sideburns sit lower than the natural
    # hairline at the temples and over the ears
    # men's short cuts: their own hairline, raised by hl_raise at the sides for the solid
    # layer so a softer clipper layer fades out below it
    hlf = hairline_men if cfg.get('hl_kind') == 'men' else hairline
    raise_ = cfg.get('hl_raise', 0.0)
    bump = lambda a: smooth(30, 55, abs(a)) * smooth(175, 140, abs(a))
    hl = np.array([p[1] - (hlf(K, ang(p)) + raise_ * bump(ang(p))) for p in hv])
    cover *= np.clip((hl + 0.02) / cfg.get('fade', 0.1), 0, 1)
    for i, p in enumerate(hv):
        if (K.ear_box(p) and abs(p[0]) > K.ear_out - 0.05 and p[1] < K.ear_top - 0.03) or p[1] < 6.5: cover[i] = 0
    # smooth over the mesh, then shrink so the faded edge stays under the cards
    nb = defaultdict(set)
    for a, b, c in hf: nb[a] |= {b, c}; nb[b] |= {a, c}; nb[c] |= {a, b}
    # weld positions (UV seams split vertices)
    key = {}; wid = np.array([key.setdefault(tuple(np.round(p, 4)), len(key)) for p in hv])
    for _ in range(6):
        acc = np.zeros(len(key)); cnt = np.zeros(len(key))
        np.add.at(acc, wid, cover); np.add.at(cnt, wid, 1); cw = acc / cnt
        cover = np.array([0.5 * cw[wid[i]] + 0.5 * np.mean([cw[wid[j]] for j in nb[i]]) for i in range(len(hv))])
    dens = np.clip((cover - 0.25) / 0.6, 0, 1) ** 1.2 * cfg.get('dens', 0.85)
    sel = [t for t in hf if dens[list(t)].max() > 0.01]
    used = sorted({v for t in sel for v in t}); remap = {v: k for k, v in enumerate(used)}
    # normals averaged across the head's UV seams, so the copies of a seam vertex move together
    vnw = np.zeros((len(key), 3)); np.add.at(vnw, wid, S.vn); vnw /= np.linalg.norm(vnw, axis=1)[:, None] + 1e-9
    vn = vnw[wid]
    off = cfg.get('off', 0.004)
    Pc = np.array([hv[v] + vn[v] * (0.004 + (off - 0.004) * min(1.0, dens[v] / max(cfg.get('dens', 0.85), 1e-3)) ** 0.6) for v in used])
    Tc = np.array([[remap[v] for v in t] for t in sel])
    th = np.array([math.atan2(p[0], p[2] - C[2]) for p in Pc]); ph = np.array([math.atan2(p[1] - C[1], math.hypot(p[0], p[2] - C[2])) for p in Pc])
    UVc = np.stack([th / math.pi * 10.0, ph / math.pi * 7.0], 1)
    Nc = np.array([vn[v] for v in used])
    # the round projection wraps at the back: triangles across the wrap get their own copies
    # of the vertices with u moved one period on, so no strip of squeezed texture shows
    per = 20.0
    extra = []
    for k, t in enumerate(Tc):
        us = UVc[t, 0]
        if us.max() - us.min() > per / 2:
            nt = []
            for v in t:
                if UVc[v, 0] < 0:
                    Pc = np.vstack([Pc, Pc[v]]); UVc = np.vstack([UVc, UVc[v] + [per, 0]]); Nc = np.vstack([Nc, Nc[v]]); used.append(used[v]); nt.append(len(Pc) - 1)
                else: nt.append(v)
            Tc[k] = nt
    # strands run from the crown down the head
    down = np.array([0, -1.0, 0]) - Nc * (Nc @ np.array([0, -1.0, 0]))[:, None]
    down /= np.linalg.norm(down, axis=1)[:, None] + 1e-9
    col = np.stack([np.full(len(used), 0.55), np.zeros(len(used)), np.zeros(len(used)), dens[used]], 1)
    return ('scalp', 'scalp', Pc, Tc, UVc, Nc, down, col)


def scalp_fine(K, cfg, levels=2):
    """The scalp layer on a finer mesh: the head's scalp triangles split twice and put back on
    the head surface, with the density worked out per vertex from the hairline, so a men's
    hairline, sideburns and a clipper fade come out crisp instead of following the head's
    coarse triangles."""
    S, hv, hf = K.S, K.hv, K.hf
    hlf = hairline_men if cfg.get('hl_kind') == 'men' else hairline
    raise_ = cfg.get('hl_raise', 0.0); fade = cfg.get('fade', 0.1); dmax = cfg.get('dens', 0.85)
    bump = lambda a: smooth(30, 55, abs(a)) * smooth(175, 140, abs(a))
    ear_pts = np.array([p for p in hv if K.ear_box(p) and abs(p[0]) > K.ear_out - 0.035])
    from scipy.spatial import cKDTree
    ear_tree = cKDTree(ear_pts)
    def dens_of(P):
        a = np.array([ang(p) for p in P])
        hl = np.array([hlf(K, x) + raise_ * bump(x) for x in a])
        d = np.clip((P[:, 1] - hl + 0.01) / fade, 0, 1); d = d * d * (3 - 2 * d)
        ed, _ = ear_tree.query(P); d *= np.clip((ed - 0.01) / 0.03, 0, 1)
        d[P[:, 1] < 6.5] = 0
        if 'region' in cfg: d *= np.array([1.0 if cfg['region'](p) else 0.0 for p in P])
        return d * dmax
    # weld the head (UV seams split vertices) and keep the triangles near the hair
    key = {}; wid = np.array([key.setdefault(tuple(np.round(p, 4)), len(key)) for p in hv])
    V = np.zeros((len(key), 3)); V[wid] = hv
    F = wid[hf]; F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    dv = dens_of(V)
    cen = V[F].mean(1)
    near = np.array([dv[f].max() > 0 or (c[1] > hlf(K, ang(c)) - 0.25 and c[1] > 6.6) for f, c in zip(F, cen)])
    face = (cen[:, 2] > 0.55) & (cen[:, 1] < 7.55) & (np.abs(cen[:, 0]) < 0.56)
    F = F[near & ~face]
    for _ in range(levels):
        mid = {}; Vl = list(V); F2 = []
        def m(a, b):
            k = (min(a, b), max(a, b))
            if k not in mid: mid[k] = len(Vl); Vl.append((V[a] + V[b]) / 2)
            return mid[k]
        for a, b, c in F:
            ab, bc, ca = m(a, b), m(b, c), m(c, a)
            F2 += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
        V = np.array(Vl); F = np.array(F2)
        for i in range(len(V)):
            V[i] = np.array(K.tree.find_nearest(Vector(V[i]))[0])
    used = np.unique(F); rm = -np.ones(len(V), int); rm[used] = np.arange(len(used)); V = V[used]; F = rm[F]
    Nn = np.zeros_like(V)
    for t in F:
        n = np.cross(V[t[1]] - V[t[0]], V[t[2]] - V[t[0]])
        for v in t: Nn[v] += n
    Nn /= np.linalg.norm(Nn, axis=1)[:, None] + 1e-9
    Nn *= np.sign(((V - C) * Nn).sum(1) + 1e-9)[:, None]
    dens = dens_of(V)
    F = F[dens[F].max(1) > 0.01]
    used = np.unique(F); rm = -np.ones(len(V), int); rm[used] = np.arange(len(used))
    V, Nn, dens, F = V[used], Nn[used], dens[used], rm[F]
    off = cfg.get('off', 0.004)
    Pc = V + Nn * (0.004 + (off - 0.004) * np.clip(dens / max(dmax, 1e-3), 0, 1) ** 0.6)[:, None]
    th = np.arctan2(Pc[:, 0], Pc[:, 2] - C[2]); ph = np.arctan2(Pc[:, 1] - C[1], np.hypot(Pc[:, 0], Pc[:, 2] - C[2]))
    UVc = np.stack([th / math.pi * 10.0, ph / math.pi * 7.0], 1)
    per = 20.0; Tc = F.copy(); extra_P, extra_UV, extra_N, extra_d = [], [], [], []
    nP = len(Pc)
    for k, t in enumerate(Tc):
        us = UVc[t, 0]
        if us.max() - us.min() > per / 2:
            nt = []
            for v in t:
                if UVc[v, 0] < 0:
                    extra_P.append(Pc[v]); extra_UV.append(UVc[v] + [per, 0]); extra_N.append(Nn[v]); extra_d.append(dens[v]); nt.append(nP); nP += 1
                else: nt.append(v)
            Tc[k] = nt
    if extra_P:
        Pc = np.vstack([Pc, extra_P]); UVc = np.vstack([UVc, extra_UV]); Nn = np.vstack([Nn, extra_N]); dens = np.concatenate([dens, extra_d])
    down = np.array([0, -1.0, 0]) - Nn * (Nn @ np.array([0, -1.0, 0]))[:, None]
    down /= np.linalg.norm(down, axis=1)[:, None] + 1e-9
    col = np.stack([np.full(len(Pc), 0.55), np.zeros(len(Pc)), np.zeros(len(Pc)), dens], 1)
    return ('scalp', 'scalp', Pc, Tc, UVc, Nn, down, col)


def hood_part(K):
    """The knit hood from the earlier procedural set, carried over."""
    import parts_hair
    class KK: pass
    KK.S_all = K.S
    p = parts_hair.hood(KK)
    P = np.array(p.v); T = np.array(p.t); UV = np.array(p.uv)
    N = np.zeros_like(P)
    for t in T:
        n = np.cross(P[t[1]] - P[t[0]], P[t[2]] - P[t[0]])
        for v in t: N[v] += n
    N /= np.linalg.norm(N, axis=1)[:, None] + 1e-9
    col = np.stack([np.array(p.col), np.zeros(len(P)), np.zeros(len(P)), np.ones(len(P))], 1)
    return ('hood', 'knit', P, T, UV, N, np.zeros_like(P), col)


def write(sid, parts, out_dir):
    g = GLB(); meta = []
    for name, mat, P, T, UV, N, ST, COL in parts:
        assert len(P) < 65536
        pa, qo, qs = g.qvec3(P)
        n4 = np.zeros((len(P), 4), np.int8); n4[:, :3] = np.round(np.clip(N, -1, 1) * 127)
        s4 = np.zeros((len(P), 4), np.int8); s4[:, :3] = np.round(np.clip(ST, -1, 1) * 127)
        attrs = {'POSITION': pa, 'TEXCOORD_0': g.accessor(np.asarray(UV, np.float32), FLOAT, 'VEC2', target=34962),
                 '_NRM': g.accessor(n4, 5120, 'VEC4', target=34962, normalized=True),
                 '_STRAND': g.accessor(s4, 5120, 'VEC4', target=34962, normalized=True),
                 '_HC': g.accessor(np.round(np.clip(COL, 0, 1) * 255).astype(np.uint8), U8, 'VEC4', target=34962, normalized=True)}
        prim = {'attributes': attrs, 'indices': g.accessor(np.asarray(T, np.uint16).reshape(-1), U16, 'SCALAR', target=34963), 'material': g.material(mat)}
        g.mesh(name, [prim], extras={'q': [qo, qs], 'mat': mat})
        meta.append([name, mat, int(len(P)), int(len(T))])
    size = g.save(f'{out_dir}/items/hair-{sid}.glb.raw', extras={'hair': sid, 'parts': meta})
    return {'raw': size}


def scalp_texture(out_dir, size=256):
    """Tiling short-strand texture for the scalp layer: fine strands along v."""
    rng = np.random.default_rng(3)
    a = np.zeros((size, size))
    for _ in range(2600):
        x = rng.random() * size; y = rng.random() * size; ln = 10 + rng.random() * 26; w = 0.6 + rng.random() * 0.8
        v = 0.45 + rng.random() * 0.55; dx = (rng.random() - 0.5) * 0.25
        for k in range(int(ln)):
            yy = int(y + k) % size; xx = int(x + dx * k) % size
            a[yy, xx] = max(a[yy, xx], v * (1 - 0.4 * k / ln))
            if w > 1: a[yy, (xx + 1) % size] = max(a[yy, (xx + 1) % size], v * 0.5)
    im = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    g = np.asarray(im, float) / 255
    g = 0.45 + 0.55 * g / max(g.max(), 1e-3)
    o = np.dstack([g, g, g, np.ones_like(g)]) * 255
    p = os.path.join(out_dir, 'tex', 'hair-scalp.webp')
    Image.fromarray(o.astype(np.uint8), 'RGBA').convert('RGB').save(p, 'WEBP', quality=80, method=6)
    return os.path.getsize(p)


if __name__ == '__main__':
    head, neu_p, out = sys.argv[1], sys.argv[2], sys.argv[3]
    only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 and not sys.argv[4].startswith('-') else None
    K = load_head(head); neu = np.load(neu_p)
    os.makedirs(out + '/items', exist_ok=True); os.makedirs(out + '/tex', exist_ok=True)
    stats = {}
    if not only or 'scalp' in only: print('scalp tex', scalp_texture(out))
    for sid, cfg in STYLES.items():
        if only and sid not in only: continue
        stats[sid] = build_style(K, neu, sid, cfg, out)
        print(sid, json.dumps(stats[sid]), flush=True)
