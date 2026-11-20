"""Hair volumes for fitting the hats. The hairstyles players see are built by hair_build.py
from MakeHuman hair (see assets/avatar/LICENSES.md); these smooth shells are
only what parts_gear.py measures to size the visor, goggles, headset, cap and bandana tiers.
build_assets.py does not write them as items. hood() is
the knit hood, which hair_build.py also uses."""
import math, numpy as np
from geom import Part, smooth, table, hair_shell, dir_tp, C


def hairline_fn(K, drop=0.0):
    f0, f1 = K.EAR_TH
    top = K.ear_top + 0.07
    HL = [(0, 8.04), (18, 8.02), (32, 7.97), (44, 7.86), (54, 7.66), (f0 - 9, 7.4), (f0 - 3, 7.24), (f0 + 1, 7.28),
          (f0 + 5, top), (f1 - 6, top), (f1 + 2, 7.42), (f1 + 12, 7.18), (150, 7.02), (166, 6.96), (180, 6.93)]
    return lambda a: table(HL, a) - drop


def make_clear(K):
    """Radius from the head's vertical axis that hanging hair must keep at angle a and
    height y: outside the ears, neck, shoulders and chest."""
    S = K.S_all
    def clear(a, y):
        d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
        o = np.array([0, y, C[2]])
        h = S.ray(o + d * 4, -d, 8)
        r = (4 - h[2]) if h is not None else 0.0
        if 6.7 < y < K.ear_top + 0.12:
            f0, f1 = K.EAR_TH; aa = abs(a)
            if f0 - 18 < aa < f1 + 22: r = max(r, math.hypot(K.ear_out, 0.15) + 0.04)
        return r + 0.03 + 0.12 * smooth(6.45, 6.05, y)
    return clear


def tube(path, radii, sides, mat, u_tiles=2.0, star=0.0, twist=0.0, tip=True):
    """A hair tube: u round the tube, v from the root (1) to the tip (0)."""
    part = Part(mat)
    path = [np.asarray(p, float) for p in path]
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]); L /= L[-1]
    rings = []
    for i, p in enumerate(path):
        tan = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]; tan /= np.linalg.norm(tan)
        a = np.cross(tan, [0, 0, 1.0])
        if np.linalg.norm(a) < 1e-4: a = np.cross(tan, [1.0, 0, 0])
        a /= np.linalg.norm(a); b = np.cross(tan, a)
        ring = []
        for s in range(sides + 1):
            ang = 2 * math.pi * s / sides + twist * i
            r = radii[i] * (1 - star * (0.5 + 0.5 * math.cos(ang * 4)))
            ring.append(part.add(p + (a * math.cos(ang) + b * math.sin(ang)) * r, 0.92 + 0.12 * (0.5 + 0.5 * math.cos(ang * 4)), 1.0,
                                 (u_tiles * s / sides, 1 - L[i] * 0.97), tan))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(sides):
            part.quad(rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s])
    c0 = part.add(path[0], 0.8, 1.0, (0.5, 1.0), (0, 1.0, 0))
    for s in range(sides): part.tri(c0, rings[0][s + 1], rings[0][s])
    if tip:
        tan = path[-1] - path[-2]; tan /= np.linalg.norm(tan)
        c1 = part.add(path[-1] + tan * radii[-1] * 1.5, 0.9, 1.0, (0.5, 0.0), tan)
        for s in range(sides): part.tri(c1, rings[-1][s], rings[-1][s + 1])
    return part


def band(c, axis, r, h, sides, mat):
    """A plain ring band (hair ties)."""
    part = Part(mat)
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    a = np.cross(axis, [0, 1.0, 0])
    if np.linalg.norm(a) < 1e-4: a = np.cross(axis, [1.0, 0, 0])
    a /= np.linalg.norm(a); b = np.cross(axis, a)
    rows = []
    for e, rr in ((-0.5, r), (0.5, r)):
        rows.append([part.add(c + axis * h * e + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * rr, 1, 1, (k / sides, e + 0.5)) for k in range(sides + 1)])
    for k in range(sides): part.quad(rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k])
    return part


def build(K):
    SC = K.SC
    HL = hairline_fn(K)
    clear = make_clear(K)
    front = lambda a: max(0.0, math.cos(math.radians(a)))
    def shell(*a, **k):
        p = hair_shell(SC, *a, **k); p.bound = K.S_noear; return p
    def bumps(scale, amp):
        return lambda a, t: amp * (math.sin(a * 0.31 * scale + t * 23 * scale) * math.sin(a * 0.19 * scale - t * 17 * scale + 1.3)
                                   + 0.5 * math.sin(a * 0.73 * scale + t * 41 * scale + 0.4))

    # short styles: they end at the hairline and thin into the scalp
    K.prop('hair-buzz', shell(HL, lambda a, t: 0.03, n_mer=96, rings=14, fade=0.2, u_tiles=16, dens=lambda a, t: 0.92))
    sides = shell(HL, lambda a, t: 0.02, n_mer=96, rings=14, fade=0.2, u_tiles=18, dens=lambda a, t: 0.62)
    top_end = lambda a: table([(0, 7.99), (35, 8.02), (70, 8.18), (110, 8.22), (150, 8.14), (180, 8.06)], a)
    top = shell(top_end, lambda a, t: 0.09 + 0.24 * front(a) ** 2 * math.sin(math.pi * min(1, t * 1.1)) ** 0.7 + 0.07 * (1 - t),
                n_mer=72, rings=14, fade=0.35, edge_off=0.024, clumps=14, clump_amp=lambda a, t: 0.03, u_tiles=8)
    K.prop('hair-undercut', sides, top)
    K.prop('hair-slick', shell(lambda a: HL(a) - 0.01, lambda a, t: 0.09 + 0.24 * front(a) ** 1.5 * math.sin(math.pi * min(1, t * 1.15)) ** 0.8 + 0.06 * (1 - t),
                               n_mer=80, rings=16, fade=0.22, clumps=18, clump_amp=lambda a, t: 0.025, u_tiles=10))
    part_x = 0.22
    K.prop('hair-sidepart', shell(lambda a: HL(a) - 0.01, lambda a, t: 0.1 + 0.12 * front(a) * math.sin(math.pi * min(1, t * 1.1)) + 0.05 * (1 - t),
                                  n_mer=80, rings=16, fade=0.22, clumps=16, clump_amp=lambda a, t: 0.022, u_tiles=10,
                                  extra=lambda p: -0.09 * math.exp(-((p[0] - part_x) / 0.05) ** 2) * smooth(7.95, 8.25, p[1]) + 0.09 * smooth(0.2, -0.4, p[0]) * smooth(7.7, 8.2, p[1])))
    # bob: a fringe with pointed ends over the brow; sides and back fall to the jaw over the ears
    bob_end = lambda a: table([(0, 7.74), (22, 7.73), (34, 7.5), (50, 7.0), (65, 6.62), (180, 6.55)], a)
    K.prop('hair-bob', shell(bob_end, lambda a, t: (0.11 + 0.05 * (1 - t)) * (1 - 0.8 * smooth(0.85, 1.0, t) * smooth(40, 15, a)) + 0.012,
                             n_mer=96, rings=18, fade=0, hang_y=7.45, flare=0.08, clear=clear, clumps=20, clump_amp=lambda a, t: 0.025,
                             tips=lambda a: (0.02 + 0.08 * smooth(20, 60, a)) * smooth(18, 34, a), u_tiles=12, tip_wall=0.05))
    # long straight: a centre part, a curtain beside the face, ends over the chest and back
    def long_style(end_front, end_back, layered=False):
        def edge(a):
            if a < 36: return HL(a) - 0.01
            # the front falls over the chest, the sides rest on the shoulders, the back falls long
            e = table([(36, end_front + 0.5), (44, end_front + 0.12), (58, end_front), (68, 6.05), (112, 6.05), (125, end_back + 0.1), (180, end_back)], a)
            return e
        return shell(edge, lambda a, t: 0.11 + 0.06 * (1 - t) + (0.03 * math.sin(t * 9) if layered else 0), n_mer=112, rings=22,
                     fade=lambda a: 0.2 if a < 38 else 0, hang_y=7.5, flare=0.06, clear=clear, clumps=22 if not layered else 16,
                     clump_amp=lambda a, t: 0.022 if not layered else 0.03, tips=(lambda a: (0.14 + 0.2 * smooth(40, 90, a)) * smooth(38, 46, a)) if layered else (lambda a: 0.05 * smooth(38, 46, a)),
                     u_tiles=14, tip_wall=0.04,
                     extra=lambda p: -0.03 * math.exp(-(p[0] / 0.035) ** 2) * smooth(8.0, 8.4, p[1]))
    K.prop('hair-longstraight', long_style(5.55, 5.25))
    K.prop('hair-longlayered', long_style(5.75, 5.4, layered=True))
    # curly: a big soft volume to the neck with curl bumps, in the curly texture
    curly_end = lambda a: table([(0, 7.8), (25, 7.72), (40, 7.3), (60, 6.7), (180, 6.4)], a)
    K.prop('hair-curly', shell(curly_end, lambda a, t: 0.24 + 0.08 * math.sin(math.pi * t) + 0.02, n_mer=96, rings=18, fade=0, hang_y=7.5, flare=0.18,
                               clear=clear, clumps=26, clump_amp=lambda a, t: 0.05, wave=bumps(1.0, 0.035), tips=lambda a: 0.08 * smooth(22, 40, a),
                               mat='hair-curly', u_tiles=10, tip_wall=0.08))
    # afro: a round volume, hairline at the front and sides
    K.prop('hair-afro', shell(lambda a: HL(a) - 0.01, lambda a, t: 0.62 * (0.55 + 0.45 * math.sin(math.pi * min(1.0, 0.25 + t * 0.85))) * (1 - 0.25 * front(a) * smooth(0.6, 0.95, t)) + 0.04, n_mer=96, rings=20,
                              fade=0.07, edge_off=0.02, clumps=30, clump_amp=lambda a, t: 0.035 * math.sin(math.pi * t), wave=bumps(1.6, 0.03),
                              mat='hair-curly', u_tiles=12))
    # tight styles with a tie: long tied back, ponytail, bun
    def tight(): return shell(lambda a: HL(a) - 0.01, lambda a, t: 0.05 + 0.035 * (1 - t), n_mer=96, rings=16, fade=0.2, clumps=24,
                              clump_amp=lambda a, t: 0.016, u_tiles=12)
    tie_lo = SC.point(180, 30, 0.07)
    low_path = [tie_lo + [0, 0.0, 0.04], tie_lo + [0, 0.04, -0.12], tie_lo + [0, -0.12, -0.26], tie_lo + [0, -0.55, -0.3], tie_lo + [0, -1.0, -0.26], tie_lo + [0, -1.45, -0.2], tie_lo + [0, -1.8, -0.14]]
    pony_lo = tube(low_path, [0.1, 0.15, 0.19, 0.18, 0.15, 0.1, 0.04], 16, 'hair', u_tiles=3, star=0.12, twist=0.12)
    K.prop('hair-long', tight(), pony_lo, band(tie_lo + [0, 0.03, -0.07], np.array(low_path[1]) - np.array(low_path[0]), 0.12, 0.07, 14, 'gear'))
    tie_hi = SC.point(180, 58, 0.08)
    hi_path = [tie_hi + [0, 0, 0.03], tie_hi + [0, 0.1, -0.15], tie_hi + [0, 0.02, -0.32], tie_hi + [0, -0.35, -0.42], tie_hi + [0, -0.8, -0.4], tie_hi + [0, -1.25, -0.34], tie_hi + [0, -1.6, -0.28]]
    pony_hi = tube(hi_path, [0.1, 0.16, 0.2, 0.19, 0.15, 0.09, 0.03], 16, 'hair', u_tiles=3, star=0.14, twist=0.15)
    for i, v in enumerate(pony_hi.v):                       # keep the tail off the back of the neck
        need = clear(180, v[1])
        r = math.hypot(v[0], v[2] - C[2])
        if v[2] < C[2] and r < need: pony_hi.v[i] = np.array([v[0], v[1], C[2] - math.sqrt(max(0, need ** 2 - v[0] ** 2))])
    K.prop('hair-ponytail', tight(), pony_hi, band(tie_hi + [0, 0.04, -0.08], np.array(hi_path[1]) - np.array(hi_path[0]), 0.12, 0.07, 14, 'gear'))
    # bun: wound round, the strands follow the wrap
    bc = SC.point(180, 62, 0.2); axis = (bc - SC.c); axis /= np.linalg.norm(axis)
    bun = Part('hair')
    a1 = np.cross(axis, [1.0, 0, 0]); a1 /= np.linalg.norm(a1); a2 = np.cross(axis, a1)
    prof = [(-0.12, 0.12), (-0.05, 0.25), (0.06, 0.29), (0.16, 0.25), (0.23, 0.15), (0.26, 0.0)]
    rows = []
    for k, (hh, rr) in enumerate(prof):
        row = []
        for s in range(33):
            ang = 2 * math.pi * s / 32
            swirl = ang + k * 0.5
            p = bc + axis * hh + (a1 * math.cos(ang) + a2 * math.sin(ang)) * rr * (1 + 0.05 * math.cos(ang * 6 + k))
            row.append(bun.add(p, 0.95 + 0.08 * math.cos(ang * 6), 1.0, (k / (len(prof) - 1) * 1.5, (s / 32) * 3), -a1 * math.sin(swirl) + a2 * math.cos(swirl)))
        rows.append(row)
    for i in range(len(rows) - 1):
        for s in range(32): bun.quad(rows[i][s], rows[i][s + 1], rows[i + 1][s + 1], rows[i + 1][s])
    K.prop('hair-bun', tight(), bun, band(bc - axis * 0.1, axis, 0.15, 0.05, 16, 'gear'))
    # mohawk: shaved sides and a fin of spikes along the middle of the scalp
    shaved = shell(HL, lambda a, t: 0.02, n_mer=96, rings=14, fade=0.2, u_tiles=18, dens=lambda a, t: 0.55)
    fin = Part('hair')
    alphas = np.linspace(55, 205, 41); rows = []
    for k, al in enumerate(alphas):
        th, ph = (0, al) if al <= 90 else (180, 180 - al)
        base = SC.point(th, ph, -0.01)
        d = SC.point(th, ph, 1.0) - SC.point(th, ph, 0.0); d /= np.linalg.norm(d)
        tang = np.array([0, math.cos(math.radians(al)), -math.sin(math.radians(al))])
        s = math.sin(math.pi * (al - 55) / 150)
        hgt = (0.32 + 0.42 * s ** 0.6) * (1.0 if k % 4 in (1, 2) else 0.8)
        w = 0.14 * (0.6 + 0.4 * s)
        tip = base + d * hgt + tang * 0.1
        u = k / (len(alphas) - 1) * 5
        rows.append((fin.add(base + [-w, 0, 0], 0.9, 1, (u, 1.0), d), fin.add(tip, 1.0, 1, (u + 0.1, 0.02), d), fin.add(base + [w, 0, 0], 0.9, 1, (u + 0.2, 1.0), d)))
    for (l0, t0, r0), (l1, t1, r1) in zip(rows, rows[1:]):
        fin.quad(l0, l1, t1, t0); fin.quad(t0, t1, r1, r0)
    fin.bound = K.S_noear
    K.prop('hair-mohawk', shaved, fin)
    # braids: cornrow ridges and two braids from behind the ears over the shoulders
    rows_ = shell(HL, lambda a, t: 0.035, n_mer=104, rings=16, fade=0.2, clumps=26, clump_amp=lambda a, t: 0.035, u_tiles=13)
    braids = Part('hair')
    f1 = K.EAR_TH[1]
    for sx in (1, -1):
        p0 = SC.point((f1 + 8) * sx, 0, 0.05)
        pts = [p0, p0 + [0.08 * sx, -0.35, 0.0], p0 + [0.18 * sx, -0.75, 0.12], p0 + [0.28 * sx, -1.15, 0.26], p0 + [0.33 * sx, -1.5, 0.36], p0 + [0.35 * sx, -1.85, 0.4]]
        for k, p in enumerate(pts):
            q, fi, d = K.S_all.nearest(p); n = K.S_all.normal_at(p)
            if (p - q) @ n < 0.13: pts[k] = q + n * 0.13
        seg = 0
        for k in range(len(pts) - 1):
            a, b = pts[k], pts[k + 1]; ax = b - a; L = np.linalg.norm(ax)
            nlob = max(2, int(L / 0.1)); side = np.cross(ax, [0, 0, 1.0]); side /= np.linalg.norm(side)
            for j in range(nlob):
                c = a + ax * (j + 0.5) / nlob; r = 0.1 * (1 - 0.35 * (k + j / nlob) / len(pts))
                sgn = 1 if seg % 2 else -1
                lob_axis = ax / L + side * 0.55 * sgn; lob_axis /= np.linalg.norm(lob_axis)
                pth = [c - lob_axis * 0.11 + side * r * 0.3 * sgn, c + side * r * 0.3 * sgn, c + lob_axis * 0.11 + side * r * 0.3 * sgn]
                braids.merge(tube(pth, [r * 0.55, r, r * 0.5], 10, 'hair', u_tiles=1.5, tip=True))
                seg += 1
        braids.merge(band(pts[-1], pts[-1] - pts[-2], 0.055, 0.06, 10, 'gear'))
    braids.bound = K.S_all
    K.prop('hair-braids', rows_, braids)
    # hood up: opaque knit cloth with a thickness and a rolled hem, a short fringe at the front
    fringe = shell(lambda a: table([(0, 7.86), (20, 7.85), (40, 7.74), (60, 7.56), (75, 7.3)], a) if abs(a) <= 90 else HL(a),
                   lambda a, t: 0.05, n_mer=80, rings=12, fade=0.2, clumps=16, clump_amp=lambda a, t: 0.02, tips=lambda a: 0.06 * smooth(60, 10, a), u_tiles=10)
    K.prop('hair-hood', hood(K), fringe)


def hood(K):
    S_all = K.S_all
    d0 = dir_tp(0, -8); e1 = np.array([1.0, 0, 0]); e2 = np.cross(d0, e1); e2 /= np.linalg.norm(e2)
    oms = np.linspace(-132, 132, 45)
    po_t = [(0, 36), (45, 41), (90, 50), (132, 64)]
    rings = 14; TH = 0.06
    part = Part('knit')
    outer, inner = [], []
    def dirv(psi, om):
        return math.cos(math.radians(psi)) * d0 + math.sin(math.radians(psi)) * (math.cos(math.radians(om)) * e2 + math.sin(math.radians(om)) * e1)
    for j, om0 in enumerate(oms):
        po = table(po_t, abs(om0)); co, ci = [], []
        for i in range(rings + 1):
            t = i / rings
            psi = po + (176 - po) * t ** 0.85
            om = om0 * (132 + 48 * smooth(70, 150, psi)) / 132
            dv = dirv(psi, om)
            p = S_all.out_ray(C, dv)
            if p is None: p = C + dv * 0.9
            off = 0.2 + 0.07 * math.sin(math.pi * t) + 0.1 * math.exp(-(om / 22) ** 2) * math.exp(-((t - 0.3) / 0.15) ** 2)
            q = p + dv * off
            if q[1] < 7.2:
                r = math.hypot(q[0], q[2] - 0.1); need = 0.92 + 0.32 * smooth(7.2, 6.1, q[1])
                if r < need:
                    k = need / max(r, 1e-6); q = np.array([q[0] * k, q[1], 0.1 + (q[2] - 0.1) * k])
            fold = 0.9 + 0.1 * math.cos(om0 / 132 * math.pi * 3) * smooth(0.2, 0.7, t)
            uv = (j / (len(oms) - 1) * 6, t * 4)
            co.append(part.add(q, fold, 1, uv))
            n_in = q - C; n_in /= np.linalg.norm(n_in)
            ci.append(part.add(q - n_in * TH, 0.5, 1, uv))
        outer.append(co); inner.append(ci)
    m = len(oms)
    for j in range(m - 1):
        for i in range(rings):
            part.quad(outer[j][i], outer[j + 1][i], outer[j + 1][i + 1], outer[j][i + 1])
            part.quad(inner[j][i + 1], inner[j + 1][i + 1], inner[j + 1][i], inner[j][i])
    hem = []
    for j in range(m):
        a, b = part.v[outer[j][0]], part.v[inner[j][0]]
        hem.append(part.add((a + b) / 2 + d0 * 0.035 + (C - (a + b) / 2) * 0.02, 0.95, 1, (j / (m - 1) * 6, -0.1)))
    for j in range(m - 1):
        part.quad(outer[j + 1][0], outer[j][0], hem[j], hem[j + 1])
        part.quad(hem[j + 1], hem[j], inner[j][0], inner[j + 1][0])
    for i in range(rings):
        t = i / rings
        if 104 <= table(po_t, 132) + (176 - table(po_t, 132)) * t ** 0.85:
            part.quad(outer[-1][i], outer[0][i], outer[0][i + 1], outer[-1][i + 1])
            part.quad(inner[-1][i + 1], inner[0][i + 1], inner[0][i], inner[-1][i])
    back = -d0; pb = S_all.out_ray(C, back)
    po_ = part.add(pb + back * 0.32, 0.8, 1, (3, 4)); pi_ = part.add(pb + back * 0.26, 0.5, 1, (3, 4))
    for j in range(m - 1):
        part.tri(outer[j][-1], outer[j + 1][-1], po_); part.tri(inner[j + 1][-1], inner[j][-1], pi_)
    for j in (0, m - 1):
        for i in range(rings):
            if j == 0: part.quad(outer[j][i], outer[j][i + 1], inner[j][i + 1], inner[j][i])
            else: part.quad(outer[j][i + 1], outer[j][i], inner[j][i], inner[j][i + 1])
    return part
