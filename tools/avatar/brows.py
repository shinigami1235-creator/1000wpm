"""Brows: one card per side for each brow style, laid on the brow ridge, with painted hairs.

The card is a strip that follows the head surface: NS stations along the brow (inner end to
tail) and NR rows across it, a hair's breadth off the skin. Its centre line is drawn in a front
"chart" (x across the face, y up) relative to the brow ridge (the most forward line above the
eye), projected onto the neutral hm08 head and re-spaced by arc length, so the texture keeps
its proportions where the brow wraps round to the temple. Rows are offset across the brow in
the tangent plane and snapped back to the skin.

Placement (neutral head, MakeHuman decimetres): the inner end sits a little inside the inner
eye corner (x 0.15), the tail ends on the line from the nose wing (0.17, 6.96) through the outer
eye corner (0.43, 7.34), and the body straddles the ridge (y about 7.53 over the eye).

Every slider is a prop morph: the card built with one parameter moved, minus the card as it
is, so its ends still land on the skin. Morph names are the slider ids; ids with a '-'
variant use it for negative values (avatar3d.js updateProp).

The texture (brow_atlas.webp, 2 x 4 tiles of 1024 x 256, linear, not sRGB) is painted hair by
hair in the card's own chart, in physical units, so hairs keep their length and angle:
R  hair brightness (gamma 2.2 encoded; the shader decodes it)
G  a soft shadow under the hairs (the skin under a brow is darker), plus where brow powder goes
A  hair coverage
Hairs grow upward at the inner head, fan to a herringbone in the body (lower rows rise, upper
rows lie down and out) and run along the tail. The head and tail are sparser and finer."""
import math, numpy as np
from PIL import Image, ImageDraw, ImageFilter

NS, NR = 24, 6            # stations along, rows across
LIFT = 0.0035             # off the skin
MARGIN = 0.022            # card runs this far past each end of the brow, for hair tips
ALA = np.array([0.17, 6.96]); CANTHUS = np.array([0.43, 7.34])
TW, TH = 1024, 256        # one tile
COLS, ROWS = 2, 4

# Style -> shape. xi inner end x, di/dt the centre's height over the ridge at the inner end and
# tail, ap arch position (0 inner, 1 tail), ah arch height, p arch roundness (1 a corner, 2 round),
# w half widths at (inner end, body, tail). Hair: dens density, hl hair length, hw hair width,
# feather (upright, longer hairs at the head and top edge), groom (hairs laid along the brow),
# under (shadow under the hairs), op hair opacity.
STYLES = {
    'straight': dict(di=-0.042, dt=0.002, ap=0.58, ah=0.008, p=2.0, w=(0.034, 0.032, 0.012), dens=1.0, hl=0.050, hw=1.0, feather=0.2, groom=0.2, under=0.9, op=0.85),
    'soft':     dict(di=-0.058, dt=0.008, ap=0.62, ah=0.046, p=1.8, w=(0.031, 0.029, 0.010), dens=1.0, hl=0.048, hw=0.95, feather=0.25, groom=0.3, under=0.85, op=0.82),
    'arched':   dict(di=-0.062, dt=0.012, ap=0.64, ah=0.068, p=1.35, w=(0.029, 0.026, 0.009), dens=1.0, hl=0.046, hw=0.9, feather=0.2, groom=0.45, under=0.8, op=0.82),
    'rounded':  dict(di=-0.058, dt=-0.022, ap=0.48, ah=0.056, p=2.2, w=(0.031, 0.030, 0.011), dens=1.0, hl=0.048, hw=0.95, feather=0.25, groom=0.3, under=0.85, op=0.82),
    'angled':   dict(di=-0.062, dt=0.014, ap=0.67, ah=0.060, p=1.05, w=(0.033, 0.029, 0.008), dens=1.05, hl=0.048, hw=1.0, feather=0.15, groom=0.5, under=0.9, op=0.85),
    'full':     dict(di=-0.056, dt=0.004, ap=0.60, ah=0.022, p=1.8, w=(0.044, 0.039, 0.015), dens=1.1, hl=0.058, hw=1.05, feather=0.8, groom=0.1, under=0.9, op=0.82),
    'thin':     dict(di=-0.046, dt=0.012, ap=0.64, ah=0.040, p=1.6, w=(0.018, 0.015, 0.006), dens=1.15, hl=0.034, hw=0.8, feather=0.0, groom=0.85, under=0.7, op=0.85),
    'sparse':   dict(di=-0.050, dt=0.004, ap=0.60, ah=0.020, p=1.8, w=(0.029, 0.026, 0.009), dens=0.45, hl=0.046, hw=0.9, feather=0.3, groom=0.2, under=0.35, op=0.75),
}
ORDER = list(STYLES)
XI = 0.128               # every style's inner end

# slider id -> (parameter, step at +100, step at -100 or None for a single linear morph)
MORPHS = {
    'browT': ('thick', 0.55, None),        # thickness: rows spread 55% more at +100
    'browA': ('angle', 0.075, None),       # angle: the brow turns about its inner end
    'browSp': ('xi', 0.045, None),         # spacing: inner ends apart (+) or together (-)
    'browIn': ('lift_in', 0.05, None),    # inner height
    'browTl': ('lift_tail', 0.06, None),  # tail height
    'browAp': ('ap', 0.22, -0.24),         # arch position: towards the tail (+) or the nose (-)
    'browAh': ('ah', 0.034, None),         # arch height
    'browLn': ('tail', 0.055, -0.06),      # tail length
    'browTi': ('thick_in', 0.55, None),    # inner thickness
    'browTo': ('thick_tail', 0.9, None),   # tail thickness
}
MORPH_NAMES = []
for _k, (_p, _a, _b) in MORPHS.items():
    MORPH_NAMES += [_k] if _b is None else [_k + '+', _k + '-']


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


class Brows:
    def __init__(self, K):
        self.S = K.S
        # the ridge: for each x, the height where the forehead is most forward
        xs = np.arange(0.04, 0.58, 0.02); ys = np.arange(7.36, 7.68, 0.004); ry = []
        for x in xs:
            best = None
            for y in ys:
                h = self.S.ray(np.array([x, y, 4.0]), np.array([0, 0, -1.0]), 6)
                if h is not None and (best is None or h[0][2] > best[1]): best = (y, h[0][2])
            ry.append(best[0])
        # a smooth curve through it, so the brow never picks up the mesh's small bumps
        ok = xs <= 0.54
        ry = np.polyval(np.polyfit(xs[ok], np.array(ry)[ok], 3), xs)
        self.rx, self.ry = xs, ry
        self.cache = {}

    def ridge(self, x):
        x = np.asarray(x, float); s = (self.ry[-1] - self.ry[-4]) / (self.rx[-1] - self.rx[-4])
        return np.where(x > self.rx[-1], self.ry[-1] + (x - self.rx[-1]) * s, np.interp(x, self.rx, self.ry))

    def tail_x(self, st):
        """Where the tail ends: on the line from the nose wing through the outer eye corner."""
        x = 0.52
        for _ in range(6):
            y = self.ridge(x) + st['dt']
            x = ALA[0] + (y - ALA[1]) * (CANTHUS[0] - ALA[0]) / (CANTHUS[1] - ALA[1])
        return float(x)

    def params(self, style):
        st = dict(STYLES[style]); st.update(xi=XI, xt=self.tail_x(st), angle=0.0, lift_in=0.0, lift_tail=0.0, tail=0.0,
                                            thick=0.0, thick_in=0.0, thick_tail=0.0)
        return st

    # ---------- the centre line and the card ----------
    def chart(self, P, u):
        """Front chart point (x, y) of the centre line at u (0 inner end, 1 tail; may run past)."""
        ap = float(np.clip(P['ap'], 0.25, 0.88))
        x = P['xi'] + (P['xt'] - P['xi']) * u + P['tail'] * smoothstep(ap, 1.0, u)
        f = lambda q: 1 - (1 - np.clip(q, 0, 1)) ** P['p']
        bump = np.where(u < ap, f(u / ap), f((1 - u) / (1 - ap)))
        bump = np.where((u < 0) | (u > 1), 0, bump)
        g_in = np.where(u < ap, (1 - np.clip(u, 0, 1) / ap) ** 1.5, 0)
        g_t = np.where(u > ap, (np.clip(u, 0, 1.2) - ap) / (1 - ap), 0) ** 1.2
        y = self.ridge(x) + P['di'] * (1 - u) + P['dt'] * u + P['ah'] * bump + P['angle'] * np.clip(u, 0, 1.2) ** 1.2 \
            + P['lift_in'] * g_in + P['lift_tail'] * g_t
        return np.stack([x, y], -1)

    def hit(self, x, y):
        h = self.S.ray(np.array([x, y, 4.0]), np.array([0, 0, -1.0]), 6)
        return h[0] if h is not None else self.S.nearest(np.array([x, y, 1.0]))[0]

    def width(self, P, u):
        w0, w1, w2 = P['w']; ap = P['ap']
        w = np.interp(u, [0, 0.07, 0.3, ap, 0.92, 1.0], [w0 * 0.85, w0, (w0 + w1) / 2 + 0.0015, w1, (w1 + w2) / 2 * 0.95, w2])
        return w

    def half(self, P, u):
        """Card half height at u: room for the brow, its hair tips and its shadow."""
        u = np.clip(u, 0, 1)
        return self.width(P, u) * 1.45 + 0.016

    def card(self, P):
        """Vertex grid (NS, NR, 3) for the left brow (+x), and the chart info the texture needs."""
        u = np.linspace(-0.12, 1.12, 160)
        C = self.chart(P, u)
        Q = np.array([self.hit(x, y) for x, y in C])
        s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))])
        s0, s1 = np.interp(0, u, s), np.interp(1, u, s); L = s1 - s0
        ss = np.linspace(s0 - MARGIN, s1 + MARGIN, NS)
        us = (ss - s0) / L
        pts = np.stack([np.interp(ss, s, Q[:, k]) for k in range(3)], 1)
        pts = np.array([self.S.nearest(p)[0] for p in pts])
        T = self.half(P, us)
        ui = np.clip(us, 0, 1)
        T = T * (1 + P['thick']) * (1 + P['thick_in'] * (1 - smoothstep(0.0, 0.55, ui))) * (1 + P['thick_tail'] * smoothstep(0.45, 1.0, ui))
        V = np.zeros((NS, NR, 3))
        for i in range(NS):
            a, b = pts[max(0, i - 1)], pts[min(NS - 1, i + 1)]
            t = b - a; t /= np.linalg.norm(t)
            n = self.S.normal_at(pts[i]); t = t - n * (t @ n); t /= np.linalg.norm(t)
            bn = np.cross(n, t); bn /= np.linalg.norm(bn)
            for k in range(NR):
                q = pts[i] + bn * T[i] * (-1 + 2 * k / (NR - 1))
                q = self.S.nearest(q)[0]
                V[i, k] = q + self.S.normal_at(q) * LIFT
        return V, dict(L=L, us=us, T=T, ss=ss - s0)

    def style(self, name):
        if name in self.cache: return self.cache[name]
        P = self.params(name)
        V, info = self.card(P)
        # a morph is the card with one parameter moved, minus the card as it is. Sliders with a
        # '-' variant use it for negative values, applied with the slider's magnitude
        morphs = {}
        for sid, (key, plus, minus) in MORPHS.items():
            base = V
            if key == 'ap':      # a straight brow still gets an arch to move
                base = self.card(dict(P, ah=max(P['ah'], 0.03)))[0]
            for sign, step in (('+', plus), ('-', minus)):
                if step is None: continue
                Q = dict(P, **{key: P[key] + step})
                if key == 'ap': Q['ah'] = max(P['ah'], 0.03)
                morphs[sid if minus is None else sid + sign] = self.card(Q)[0] - base
        self.cache[name] = (P, V, info, morphs)
        return self.cache[name]

    # ---------- the texture ----------
    def tile(self, name, seed):
        P, V, info, _ = self.style(name)
        rng = np.random.default_rng(seed)
        L, us, T = info['L'], info['us'], info['T']
        S0, S1 = -MARGIN, L + MARGIN
        SW, SH = TW * 4, TH * 4
        Tof = lambda s: np.interp(s, info['ss'], T)
        def px(s, t):
            return (s - S0) / (S1 - S0) * SW, (1 - (t / Tof(s) + 1) / 2) * SH
        sx = SW / (S1 - S0); sy_mid = SH / (2 * np.median(T)); scale = float(sx + sy_mid) / 2
        dens, hl, hw, feather, groom = P['dens'], P['hl'], P['hw'], P['feather'], P['groom']
        # roots: a jittered grid thinned by the density field, so there are no clumps or holes
        area_w = self.width(P, np.linspace(0, 1, 50)).mean() * 2 * L
        n_target = int(900 * dens * area_w / 0.026)
        roots = []
        tries = 0
        while len(roots) < n_target and tries < n_target * 12:
            tries += 1
            u = rng.uniform(-0.02, 1.0); s = u * L
            w = self.width(P, np.clip(u, 0, 1))
            tn = rng.uniform(-1.2, 1.2)
            d = smoothstep(-0.03, 0.16, u) * (0.45 + 0.55 * smoothstep(0.0, 0.2, u))     # sparse inner head
            d *= 1 - 0.45 * smoothstep(0.72, 1.0, u)                                       # thinner tail
            edge = 0.86 + 0.14 * rng.random()
            d *= smoothstep(1.08, 0.72, abs(tn) / edge) if tn > 0 else smoothstep(1.02, 0.78, abs(tn) / edge)
            if rng.random() < d: roots.append((u, s, tn * w, tn))
        layers = [Image.new('L', (SW, SH), 0) for _ in range(6)]
        draws = [ImageDraw.Draw(l) for l in layers]
        bright = Image.new('L', (SW, SH), 0); bd = ImageDraw.Draw(bright)
        deg = math.radians
        for (u, s, t, tn) in roots:
            uc = float(np.clip(u, 0, 1))
            # direction, from the brow's own axis (positive is up)
            head = deg(82 - 25 * uc / 0.14 + feather * 6)
            low, high = deg(38 + 12 * feather - 22 * groom), deg(-4 + 22 * feather - 4 * groom)
            body = low + (high - low) * float(smoothstep(-0.7, 0.75, tn))
            tail = deg(-6 + 8 * float(smoothstep(-1, 1, tn)) * (1 - groom))
            th = head + (body - head) * float(smoothstep(0.05, 0.28 + 0.15 * feather, uc))
            th = th + (tail - th) * float(smoothstep(0.62, 0.95, uc))
            th += rng.normal(0, deg(7 + 4 * (1 - groom)))
            ln = hl * (0.55 + 0.7 * rng.random()) * (0.45 + 0.55 * float(smoothstep(0.0, 0.25, uc))) * (1 - 0.3 * float(smoothstep(0.8, 1.0, uc)))
            ln *= 1 + 0.4 * feather * float(smoothstep(0.3, 1.0, tn)) * (1 - uc) * float(smoothstep(0.3, 0.6, feather))
            bend = -(th - deg(-8)) * (0.35 + 0.2 * rng.random())
            fine = 0.7 + 0.3 * float(smoothstep(0.0, 0.25, uc)) * (1 - 0.35 * float(smoothstep(0.8, 1.0, uc)))
            w0 = 0.0022 * hw * fine * (0.8 + 0.4 * rng.random())
            a = P['op'] * (0.6 + 0.4 * rng.random()) * (0.6 + 0.4 * float(smoothstep(0.0, 0.2, uc)))
            br = 0.68 + 0.2 * rng.random()
            K = 9; pts = [(s, t)]
            for j in range(1, K):
                ang = th + bend * j / (K - 1)
                ps, pt = pts[-1]
                pts.append((ps + ln / (K - 1) * math.cos(ang), pt + ln / (K - 1) * math.sin(ang)))
            dr = draws[rng.integers(0, len(draws))]
            for j in range(K - 1):
                (s_a, t_a), (s_b, t_b) = pts[j], pts[j + 1]
                if not (S0 < s_b < S1) or abs(t_b) > Tof(s_b) * 0.97: break
                f = j / (K - 1)
                wd = max(1, int(round(w0 * (1 - 0.75 * f) * scale)))
                al = int(255 * a * (1 - 0.35 * f))
                A = px(s_a, t_a); B = px(s_b, t_b)
                dr.line([A, B], fill=al, width=wd)
                bd.line([A, B], fill=int(255 * min(1, br + 0.1 * f)), width=wd)
                if wd > 2:      # round joints, so a hair never shows its segments
                    rr = wd / 2; dr.ellipse([B[0] - rr, B[1] - rr, B[0] + rr, B[1] + rr], fill=al)
        A = np.ones((SH, SW))
        for l in layers: A *= 1 - np.asarray(l, np.float32) / 255
        A = 1 - A
        Br = np.asarray(bright, np.float32) / 255
        # the shadow under the hairs: their coverage, blurred, strongest in the body
        R = np.asarray(Image.fromarray(np.round(A * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.007 * scale)), np.float32) / 255
        G = np.clip(R / max(1e-3, float(np.percentile(R[R > 0.05], 80))), 0, 1) ** 1.2 * P['under']
        down = lambda a: np.asarray(Image.fromarray(np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)).reduce(4), np.float32) / 255
        a4 = down(A); g4 = down(G)
        # brightness where there are hairs, their mean elsewhere, so filtering never darkens edges
        cov = down((A > 0.02).astype(np.float32)); bsum = down(Br * (A > 0.02))
        mean_b = float((Br[A > 0.02]).mean()) if (A > 0.02).any() else 0.8
        b4 = np.where(cov > 0.05, bsum / np.maximum(cov, 1e-3), mean_b)
        return np.dstack([b4 ** (1 / 2.2), g4, np.full_like(a4, mean_b ** (1 / 2.2)), a4])

    def atlas(self, path=None):
        """The atlas array, the tiles' places {style: (col, row)}; saved as lossless webp."""
        at = np.zeros((TH * ROWS, TW * COLS, 4), np.float32); tiles = {}
        for k, name in enumerate(ORDER):
            c, r = k % COLS, k // COLS
            at[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = self.tile(name, 101 + k)
            tiles[name] = (c, r)
        return at, tiles

    def part(self, name, Part, tiles):
        """The brow as a prop Part (both sides) with its morphs."""
        P, V, info, morphs = self.style(name)
        c, r = tiles[name]
        part = Part('brow'); part.noao = True
        idx = {}
        for side in (1, -1):
            for i in range(NS):
                for k in range(NR):
                    p = V[i, k] * [side, 1, 1]
                    uv = ((c + i / (NS - 1)) / COLS, 1 - (r + 1 - k / (NR - 1)) / ROWS)
                    idx[side, i, k] = part.add(p, 1.0, 1.0, uv)
            for i in range(NS - 1):
                for k in range(NR - 1):
                    a, b, cc, d = idx[side, i, k], idx[side, i + 1, k], idx[side, i + 1, k + 1], idx[side, i, k + 1]
                    if side > 0: part.quad(a, b, cc, d)
                    else: part.quad(a, d, cc, b)
        n = len(part.v)
        part.morph = {}
        for mname, D in morphs.items():
            M = np.zeros((n, 3))
            for side in (1, -1):
                for i in range(NS):
                    for k in range(NR):
                        M[idx[side, i, k]] = D[i, k] * [side, 1, 1]
            part.morph[mname] = M
        return part
