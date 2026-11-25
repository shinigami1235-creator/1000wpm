"""Brows placed by the brows-and-hairline rules, drawn as painted hair on cards that hug the skin.

The site builds the brow cards itself, live, on whatever head the sliders and sculpt points
make (js/app/avatar-brows.js). This file supplies what that needs, in the glb meta as 'brow':
  marks    skin vertex ids per side ('l' is the character's left, +x): medial canthus, lateral
           canthus, ala (the nostril wing's outer point)
  presets  the female and male numbers below; the sex slider blends them
  styles   each style as changes to the preset (add, mul, set, peak_low relative to head_low)
  tiles    each style's tile in brow_atlas.webp
and paints brow_atlas.webp (2 x 4 tiles of 1024 x 256, linear): R hair brightness (gamma 2.2),
G the shadow under the hairs, A hair coverage.

The rules. Positions are on the front view, in mm out from the facial midline and mm above
the line through the two canthi of that eye; the scale comes from an interpupillary distance
of 63 mm, the eye centre being the midpoint of the canthi. Three guide lines start at the ala's
outer edge (ala_out 2 mm outside the ala landmark):
  head on the line through the medial canthus, at head_low
  peak on the line through the lateral limbus (the eye centre plus 5.85 mm towards the lateral
       canthus), moved towards the lateral canthus line by peak_at, at peak_low
  tail on the line through the lateral canthus, at head_low + tail_lift
The lower edge is a hermite curve from the head up to the peak (flat there) and down to the
tail. Thickness runs from head_thick to peak_thick, then tapers to tail_thick with exponent 1.4.
Hairs: almost straight up at the head (82 degrees, first 15%), in the body the lower rows grow
out and up (+28 at the bottom) and the upper rows out and down (-18 at the top), meeting along
the middle; the tail (last 20%) lies along the brow. The head starts soft and sparse and the
edges are a little ragged.

The card: the brow's centre line with the card running KT times the half thickness either side
of it, and MARGIN (a share of the brow's length) past each end for hair tips. The texture is
drawn in that card's own frame, in mm, so the live card and the atlas line up."""
import math, numpy as np
from PIL import Image, ImageDraw, ImageFilter

COMMON = dict(ipd_mm=63.0, ala_out_mm=2.0, iris_radius_mm=5.85)
PRESETS = {
    'female': dict(head_low=14.0, peak_low=18.0, tail_lift=1.5, head_thick=9.0, peak_thick=7.0, tail_thick=1.2,
                   peak_at=0.0, density=110.0, len_head=5.0, len_body=8.5, len_tail=7.0),
    'male': dict(head_low=12.0, peak_low=13.5, tail_lift=0.5, head_thick=12.0, peak_thick=10.0, tail_thick=3.0,
                 peak_at=0.35, density=130.0, len_head=6.0, len_body=10.0, len_tail=8.0),
}
# shape extras every style can change: k_in and k_out the hermite slopes leaving the head and
# arriving at the tail, sharp the slope kept through the peak (0 a smooth top, 1 a corner),
# up extra upward growth in the body (degrees), groom how tightly the hairs follow the rule
SHAPE = dict(k_in=1.3, k_out=1.6, sharp=0.0, taper=1.4, up=0.0, groom=0.0, lens=1.0, op=0.85, under=0.85)
STYLES = {
    'straight': dict(rel=dict(peak_low=1.0), set=dict(k_in=1.0, k_out=1.2)),
    'soft':     dict(),
    'arched':   dict(add=dict(peak_low=3.0), set=dict(peak_at=0.2)),
    'rounded':  dict(add=dict(peak_low=1.0), set=dict(k_in=0.55, k_out=0.7)),
    'angled':   dict(add=dict(peak_low=1.5), set=dict(k_in=1.7, k_out=2.2, sharp=1.0)),
    'full':     dict(mul=dict(head_thick=1.25, peak_thick=1.25, tail_thick=1.3, density=1.1, lens=1.1), set=dict(up=12.0)),
    'thin':     dict(mul=dict(head_thick=0.55, peak_thick=0.55, tail_thick=0.6, lens=0.75), set=dict(groom=0.7, under=0.6)),
    'sparse':   dict(mul=dict(density=0.5), set=dict(op=0.78, under=0.35)),
}
ORDER = list(STYLES)
KT, MARGIN = 2.0, 0.07
TW, TH, COLS, ROWS = 1024, 256, 2, 4
VIS = 3.0            # painted hairs per real hair: ours are thicker than real ones and blur at avatar sizes


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)


def style_params(name, fem):
    """The preset blended for femininity fem (0 male, 1 female), then the style's changes."""
    p = {k: PRESETS['male'][k] + (PRESETS['female'][k] - PRESETS['male'][k]) * fem for k in PRESETS['female']}
    p.update(SHAPE); p.update(COMMON)
    st = STYLES[name]
    for k, v in st.get('add', {}).items(): p[k] += v
    for k, v in st.get('mul', {}).items(): p[k] *= v
    for k, v in st.get('set', {}).items(): p[k] = v
    for k, v in st.get('rel', {}).items(): p[k] = p['head_low'] + v
    return p


def hermite(p0, p1, m0, m1, t):
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1


def line_x_at(a, b, v):
    if abs(b[1] - a[1]) < 1e-6: return b[0]
    return a[0] + (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1])


def design(p, ala, mc, lc):
    """The brow in one eye's plane (mm): ala, mc, lc are (out from the midline, above the canthal line)."""
    ala = (ala[0] + p['ala_out_mm'], ala[1])
    ec = ((mc[0] + lc[0]) / 2, (mc[1] + lc[1]) / 2)
    ln = math.hypot(lc[0] - mc[0], lc[1] - mc[1])
    ll = (ec[0] + (lc[0] - mc[0]) / ln * p['iris_radius_mm'], ec[1] + (lc[1] - mc[1]) / ln * p['iris_radius_mm'])
    hb, pb = p['head_low'], p['peak_low']; tb = hb + p['tail_lift']
    hx = line_x_at(ala, mc, hb)
    px = (1 - p['peak_at']) * line_x_at(ala, ll, pb) + p['peak_at'] * line_x_at(ala, lc, pb)
    tx = line_x_at(ala, lc, tb)
    return dict(ala=ala, mc=mc, lc=lc, ll=ll, hx=hx, px=px, tx=tx, hb=hb, pb=pb, tb=tb, p=p)


def lower(d, u):
    p, hx, px, tx, hb, pb, tb = d['p'], d['hx'], d['px'], d['tx'], d['hb'], d['pb'], d['tb']
    if u <= px:
        t = min(1, max(0, (u - hx) / (px - hx)))
        return hermite(hb, pb, (pb - hb) * p['k_in'], (pb - hb) * p['sharp'] * 0.9, t)
    t = min(1, max(0, (u - px) / (tx - px)))
    return hermite(pb, tb, (tb - pb) * p['sharp'] * 0.9, (tb - pb) * p['k_out'], t)


def thick(d, u):
    p, hx, px, tx = d['p'], d['hx'], d['px'], d['tx']
    if u <= px:
        t = min(1, max(0, (u - hx) / (px - hx)))
        return p['head_thick'] + (p['peak_thick'] - p['head_thick']) * t
    t = min(1, max(0, (u - px) / (tx - px)))
    return p['peak_thick'] + (p['tail_thick'] - p['peak_thick']) * t ** p['taper']


# ---------------------------------------------------------------- landmarks
def find_marks(K):
    """Skin vertex ids per side: medial canthus, lateral canthus (morphs.landmarks) and the ala,
    the nostril wing's outermost point in the front view, just inside where it drops to the cheek."""
    from morphs import landmarks
    eyes = [{'c': K.eyeL, 'R': K.EYE_R}, {'c': K.eyeR, 'R': K.EYE_R}]
    lm = landmarks(K.hv_skin, eyes)
    P = K.hv_skin; S = K.S
    out = {}
    for side, sx in (('l', 1), ('r', -1)):
        best = None
        for y in np.arange(6.90, 7.04, 0.005):
            prev = None
            for x in np.arange(0.09, 0.26, 0.003):
                h = S.ray(np.array([sx * x, y, 4.0]), np.array([0, 0, -1.0]), 6)
                if h is None: continue
                z = h[0][2]
                if prev is not None:
                    drop = (prev[1] - z) / 0.003
                    if drop > 6 and (best is None or prev[0] > best[0]): best = (prev[0], y, prev[2])
                    if drop > 6: break
                prev = (x, z, h[0])
        # the ala landmark sits ala_out_mm inside the edge (the design adds it back)
        mmpu = COMMON['ipd_mm'] / np.linalg.norm(K.eyeL - K.eyeR)
        q = np.array(best[2]); q[0] -= sx * COMMON['ala_out_mm'] / mmpu
        front = np.where((P[:, 2] > 1.2) & (np.abs(P[:, 1] - 7.0) < 0.15) & (P[:, 0] * sx > 0))[0]
        ala = int(front[np.argmin(np.linalg.norm(P[front] - q, axis=1))])
        out[side] = [int(lm[side][0]), int(lm[side][1]), ala]
    return out


def plane(P, marks):
    """Per side: (ala, mc, lc) in mm on that eye's plane, and the frame (mid_x, base_y, mmpu)."""
    E = {s: (P[marks[s][0]] + P[marks[s][1]]) / 2 for s in 'lr'}
    mmpu = COMMON['ipd_mm'] / np.linalg.norm(E['l'] - E['r'])
    mid = (P[marks['l'][0], 0] + P[marks['r'][0], 0]) / 2
    out = {}
    for s, sx in (('l', 1), ('r', -1)):
        base = (P[marks[s][0], 1] + P[marks[s][1], 1]) / 2
        f = lambda q: ((q[0] - mid) * sx * mmpu, (q[1] - base) * mmpu)
        out[s] = (f(P[marks[s][2]]), f(P[marks[s][0]]), f(P[marks[s][1]]), (mid, base, mmpu))
    return out


# ---------------------------------------------------------------- the atlas
def tile(d, seed):
    """One style's tile, painted in the card's frame: x the centre line's length in the front
    plane, y across it, both in mm."""
    rng = np.random.default_rng(seed)
    p = d['p']; hx, tx = d['hx'], d['tx']; m = MARGIN * (tx - hx)
    us = np.linspace(hx - m, tx + m, 400)
    cy = np.array([lower(d, u) + thick(d, u) / 2 for u in us])
    s = np.concatenate([[0], np.cumsum(np.hypot(np.diff(us), np.diff(cy)))]); Ltot = s[-1]
    s_of = lambda u: np.interp(u, us, s)
    sh, st = s_of(hx), s_of(tx)
    half = lambda u: thick(d, u) / 2
    Tof = lambda u: KT * half(u)
    SW, SH = TW * 4, TH * 4
    def px(u, t):
        return float(s_of(u) / Ltot * SW), float((1 - (t / Tof(u) + 1) / 2) * SH)
    T_med = float(np.median([Tof(u) for u in us]))
    scale = float(SW / Ltot + SH / (2 * T_med)) / 2   # px per mm, about
    # roots: area under the brow, at the style's density
    area = sum(thick(d, (us[i] + us[i + 1]) / 2) * (us[i + 1] - us[i]) for i in range(len(us) - 1) if hx <= us[i] <= tx)
    n = int(area / 100 * p['density'] * VIS)
    roots, tries = [], 0
    while len(roots) < n and tries < n * 60:
        tries += 1
        u = rng.uniform(hx, tx); lo, th = -half(u), half(u)
        v = rng.uniform(lo - 1.2, th + 1.2)
        e = rng.normal(0, 0.35)                                     # ragged, not stencilled
        if not (lo + e <= v <= th + e): continue
        t = (u - hx) / (tx - hx)
        if t < 0.12 and rng.random() > 0.45 + 4.5 * t: continue     # the head starts soft and sparse
        roots.append((u, v, t, (v - lo) / max(th - lo, 0.1)))
    layers = [Image.new('L', (SW, SH), 0) for _ in range(6)]
    draws = [ImageDraw.Draw(l) for l in layers]
    bright = Image.new('L', (SW, SH), 0); bd = ImageDraw.Draw(bright)
    groom = p['groom']
    for (u, v, t, w) in roots:
        # the slope of the centre line here: hairs are drawn in the card's frame, where it is 0
        body = (28 * (0.5 - w) / 0.5 if w < 0.5 else -18 * (w - 0.5) / 0.5) * (1 - 0.35 * groom) + p['up'] * (1 - t)
        if t < 0.15:
            k = t / 0.15; ang = 82 * (1 - k) + body * k
        elif t > 0.8:
            k = (t - 0.8) / 0.2; ang = body * (1 - k) - 6 * k
        else:
            ang = body
        ang = math.radians(ang + rng.normal(0, 6 * (1 - 0.5 * groom)))
        if t < 0.15: ln = p['len_head'] + (p['len_body'] - p['len_head']) * t / 0.15
        elif t > 0.7: ln = p['len_body'] + (p['len_tail'] - p['len_body']) * (t - 0.7) / 0.3
        else: ln = p['len_body']
        ln *= p['lens'] * rng.uniform(0.85, 1.15) * 0.8        # hairs lie on the skin at a slant: their front-view length
        bend = -ang * (0.2 + 0.15 * rng.random())
        w0 = 0.24 * (0.8 + 0.4 * rng.random()) * (0.75 + 0.25 * smoothstep(0, 0.2, t)) * (1 - 0.3 * smoothstep(0.8, 1, t)) * (0.85 if groom > 0.5 else 1)
        a = p['op'] * (0.6 + 0.4 * rng.random()) * (0.6 + 0.4 * smoothstep(0.0, 0.2, t))
        br = 0.68 + 0.2 * rng.random()
        # positions along the brow are in u (mm out from the midline); a step of ds along the
        # centre line moves u by about ds * cos(slope)
        K = 9; pts = [(u, v)]
        for j in range(1, K):
            an = ang + bend * j / (K - 1)
            pu, pv = pts[-1]
            pts.append((pu + ln / (K - 1) * math.cos(an), pv + ln / (K - 1) * math.sin(an)))
        dr = draws[rng.integers(0, len(draws))]
        for j in range(K - 1):
            (ua, va), (ub, vb) = pts[j], pts[j + 1]
            if not (hx - m < ub < tx + m) or abs(vb) > Tof(ub) * 0.97: break
            f = j / (K - 1)
            wd = max(1, int(round(w0 * (1 - 0.75 * f) * scale)))
            al = int(255 * a * (1 - 0.35 * f))
            A_, B_ = px(ua, va), px(ub, vb)
            dr.line([A_, B_], fill=al, width=wd)
            bd.line([A_, B_], fill=int(255 * min(1, br + 0.1 * f)), width=wd)
            if wd > 2:
                rr = wd / 2; dr.ellipse([B_[0] - rr, B_[1] - rr, B_[0] + rr, B_[1] + rr], fill=al)
    A = np.ones((SH, SW))
    for l in layers: A *= 1 - np.asarray(l, np.float32) / 255
    A = 1 - A
    Br = np.asarray(bright, np.float32) / 255
    R = np.asarray(Image.fromarray(np.round(A * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8 * scale)), np.float32) / 255
    G = np.clip(R / max(1e-3, float(np.percentile(R[R > 0.05], 80))), 0, 1) ** 1.2 * p['under'] if (R > 0.05).any() else R
    down = lambda a: np.asarray(Image.fromarray(np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)).reduce(4), np.float32) / 255
    a4, g4 = down(A), down(G)
    cov = down((A > 0.02).astype(np.float32)); bsum = down(Br * (A > 0.02))
    mean_b = float(Br[A > 0.02].mean()) if (A > 0.02).any() else 0.8
    b4 = np.where(cov > 0.05, bsum / np.maximum(cov, 1e-3), mean_b)
    return np.dstack([b4 ** (1 / 2.2), g4, np.full_like(a4, mean_b ** (1 / 2.2)), a4])


def build(K):
    """(atlas array, tiles, meta for the glb). The atlas is painted on the neutral head with the
    preset halfway between female and male; the live card scales it to the look's shape."""
    marks = find_marks(K)
    pl = plane(K.hv_skin, marks)
    at = np.zeros((TH * ROWS, TW * COLS, 4), np.float32); tiles = {}
    for k, name in enumerate(ORDER):
        c, r = k % COLS, k // COLS
        ala, mc, lc, _ = pl['l']
        d = design(style_params(name, 0.5), ala, mc, lc)
        at[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = tile(d, 101 + k)
        tiles[name] = [c, r]
    for side in 'lr':
        ala, mc, lc, fr = pl[side]
        d = design(style_params('soft', 0.5), ala, mc, lc)
        print('brow', side, 'marks', marks[side], 'mm/unit %.1f' % fr[2], 'ala', np.round(ala, 1), 'mc', np.round(mc, 1), 'lc', np.round(lc, 1),
              'head', round(d['hx'], 1), 'peak', round(d['px'], 1), 'tail', round(d['tx'], 1))
    meta = dict(marks=marks, presets=PRESETS, common=COMMON, shape=SHAPE, styles=STYLES, tiles=tiles,
                grid=[COLS, ROWS], kt=KT, margin=MARGIN)
    return at, tiles, meta
