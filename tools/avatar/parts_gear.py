"""Accessories: visor, goggles, respirator, headset, cyber eye implant, cap, bandana, earrings,
glasses, a chain necklace, a pendant necklace and a spiked choker.
Anything that wraps round the head comes in four fits, measured against the hair it
has to sit on: '' (buzz, undercut, mohawk), '-mid' (tied and short styles), '-loose'
(slick, bob, long and curly) and '-xl' (afro).
Glow lines run only along lens rims and clean outer edges."""
import math, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from geom import Part, smooth, table, tube, octa, lathe, torus, ring_pts, dir_tp, C

TIERS = {'': [('hair-buzz', None), ('hair-undercut', [0]), ('hair-mohawk', [0])],
         '-mid': [('hair-long', [0]), ('hair-braids', [0]), ('hair-ponytail', [0]), ('hair-bun', [0]), ('hair-sidepart', None)],
         '-loose': [('hair-slick', None), ('hair-bob', None), ('hair-longstraight', None), ('hair-longlayered', None), ('hair-curly', None)],
         '-xl': [('hair-afro', None)]}


def make_outer(K):
    """outer[tier](d, centre) -> distance from centre along d to the outside of skin or hair."""
    S = K.S_all
    trees = {}
    for tier, lst in TIERS.items():
        V = [Vector(p) for p in S.V]; T = [list(map(int, t)) for t in S.T]
        for pid, keep in lst:
            for k, p in enumerate(K.PROPS[pid]):
                if keep is not None and k not in keep: continue
                o = len(V); V += [Vector(v) for v in p.v]; T += [[a + o, b + o, c + o] for a, b, c in p.t]
        trees[tier] = BVHTree.FromPolygons(V, T)
    def outer(tier, d, centre=C):
        d = np.asarray(d, float); d = d / np.linalg.norm(d)
        o = np.asarray(centre) + d * 6
        loc, no, fi, dist = trees[tier].ray_cast(Vector(o), Vector(-d), 12)
        return 6 - dist if loc is not None else 0.9
    return outer


def build(K):
    S, S_all, SC = K.S, K.S_all, K.SC
    outer = make_outer(K)
    eyeL, eyeR, R = K.eyeL, K.eyeR, K.EYE_R

    # ---- visor: one wrap-round lens between two rails, arms back to the ears ----
    def visor(tier):
        lens = Part('lens'); rails = Part('gear')
        angs = np.linspace(-78, 78, 25); ys = [7.2, 7.31, 7.43, 7.55]
        def at(a, y, extra=0.0):
            ax = 0.86 - 0.025 * (y - 7.2) / 0.35; bz = 1.26 - 0.05 * (y - 7.2) / 0.35
            return np.array([ax * math.sin(math.radians(a)) * (1 + extra), y, 0.28 + bz * math.cos(math.radians(a)) * (1 + extra)])
        g = [[lens.add(at(a, y), 0.75 + 0.35 * (k / 3)) for a in angs] for k, y in enumerate(ys)]
        for i in range(len(ys) - 1):
            for j in range(len(angs) - 1): lens.quad(g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j])
        for y, s in ((ys[0] - 0.012, -1), (ys[-1] + 0.012, 1)):
            path = [at(a, y, 0.008) for a in angs]
            rails.merge(tube(path, [0.024] * len(path), 6, 'gear', cap=True))
        rails.line([at(a, ys[0] - 0.035, 0.012) for a in angs])
        for s in (-1, 1):
            p0 = at(78 * s, 7.37, 0.0)
            d = np.array([math.sin(math.radians(100 * s)), 0, math.cos(math.radians(100 * s))])
            p1 = np.array([0, 7.38, 0.28]) + d * (outer(tier, d, np.array([0, 7.38, 0.28])) + 0.015)
            rails.merge(tube([p0, p0 * 0.5 + p1 * 0.5 + d * 0.02, p1], [0.03, 0.028, 0.026], 6, 'gear'))
        return [lens, rails]

    # ---- goggles: two cups sealed to the face, lenses, a bridge and a strap ----
    def goggles(tier):
        cups = Part('gear'); lenses = Part('lens'); strap = Part('cloth2')
        fronts = []
        for c, sx in ((eyeL, 1), (eyeR, -1)):
            ax = np.array([0.18 * sx, 0.02, 1.0]); ax /= np.linalg.norm(ax)
            a = np.cross(ax, [0, 1.0, 0]); a /= np.linalg.norm(a); b = np.cross(ax, a)
            n = 12; back, front, lip = [], [], []
            for k in range(n):
                u = 2 * math.pi * k / n
                rad = (a * math.cos(u) * 1.12 + b * math.sin(u)) * 0.21
                p = c + rad + ax * 0.6
                h = S.ray(p, -ax, 1.5)
                base = h[0] + ax * 0.012 if h else c + rad + ax * 0.15
                back.append(cups.add(base - ax * 0.02, 0.7))
            cf = c + ax * 0.42
            for k in range(n):
                u = 2 * math.pi * k / n
                rad = (a * math.cos(u) * 1.12 + b * math.sin(u))
                front.append(cups.add(cf + rad * 0.205, 1.0)); lip.append(cups.add(cf + rad * 0.165 + ax * 0.012, 1.05))
            for k in range(n):
                l = (k + 1) % n
                cups.quad(back[k], back[l], front[l], front[k]); cups.quad(front[k], front[l], lip[l], lip[k])
            inner = [lenses.add(cf + (a * math.cos(2 * math.pi * k / n) * 1.12 + b * math.sin(2 * math.pi * k / n)) * 0.168 - ax * 0.02, 0.8) for k in range(n)]
            cc = lenses.add(cf - ax * 0.01, 1.2)
            for k in range(n): lenses.tri(cc, inner[k], inner[(k + 1) % n])
            cups.line([cf + (a * math.cos(2 * math.pi * k / 24) * 1.12 + b * math.sin(2 * math.pi * k / 24)) * 0.186 + ax * 0.016 for k in range(24)], closed=True)
            fronts.append((cf, a, sx))
        cups.merge(tube([fronts[0][0] + [-0.2, 0.0, -0.02], (fronts[0][0] + fronts[1][0]) / 2 + [0, 0.02, -0.03], fronts[1][0] + [0.2, 0.0, -0.02]], [0.03, 0.03, 0.03], 6, 'gear'))
        # strap round the back of the head over the hair
        yc = np.array([0, eyeL[1] + 0.02, 0.28])
        angs = np.linspace(58, 302, 30)
        rows = []
        for y in (-0.05, 0.05):
            row = []
            for a in angs:
                d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
                row.append(strap.add(yc + [0, y, 0] + d * (outer(tier, d, yc + [0, y, 0]) + 0.012), 0.9))
            rows.append(row)
        for j in range(len(angs) - 1): strap.quad(rows[0][j], rows[0][j + 1], rows[1][j + 1], rows[1][j])
        return [cups, lenses, strap]

    # ---- respirator: a ridged mask with two filter canisters ----
    def respirator():
        mask = Part('gear'); cans = Part('metal'); strap = Part('cloth2')
        angs = np.linspace(-62, 62, 17); ys = [6.24, 6.38, 6.52, 6.66, 6.8, 6.94, 7.06]
        grid = []
        for i, y in enumerate(ys):
            row = []
            for a in angs:
                d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
                cen = np.array([0, y, 0.15])
                p = S.in_ray(cen, d)        # from outside: the mouth cavity must not catch the ray
                r = np.linalg.norm((p - cen)[[0, 2]]) + 0.1
                beak = 0.18 * math.exp(-(a / 26) ** 2) * math.sin(math.pi * (i / (len(ys) - 1)) ** 0.9)
                rib = 0.02 * (i % 2) * math.exp(-(a / 40) ** 2)
                row.append(mask.add(cen + d * (r + beak + rib), 0.85 + 0.25 * (i % 2)))
            grid.append(row)
        for i in range(len(ys) - 1):
            for j in range(len(angs) - 1): mask.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
        # seal: the edge folds back to the skin
        loop = [grid[0][j] for j in range(len(angs))] + [grid[i][-1] for i in range(1, len(ys))] + [grid[-1][j] for j in range(len(angs) - 2, -1, -1)] + [grid[i][0] for i in range(len(ys) - 2, 0, -1)]
        seal = []
        for k in loop:
            q = mask.v[k]; p, fi, d = S.nearest(q); seal.append(mask.add(p - S.normal_at(p) * 0.01, 0.5))
        for k in range(len(loop)):
            l = (k + 1) % len(loop); mask.quad(loop[k], loop[l], seal[l], seal[k])
        mask.line([mask.v[k] * 1.0 for k in loop[:len(angs)]] + [mask.v[k] for k in loop[len(angs):len(angs) + len(ys) - 1]])
        for s in (-1, 1):
            a = 44 * s; d = np.array([math.sin(math.radians(a)), -0.18, math.cos(math.radians(a))]); d /= np.linalg.norm(d)
            base = mask.v[grid[2][8 + 6 * s]] - d * 0.03
            cans.merge(lathe(base, d, [(0.0, 0.1), (0.05, 0.13), (0.07, 0.15), (0.11, 0.15), (0.12, 0.135), (0.15, 0.135), (0.16, 0.15), (0.2, 0.15), (0.215, 0.13)], 10, 'metal', cap1=True))
            cans.line(ring_pts(base + d * 0.222, d, 0.11, 18), closed=True)
            grill = lathe(base + d * 0.222, d, [(0.0, 0.1), (0.004, 0.0)], 10, 'glow')
            cans.merge(grill)
            p0 = mask.v[grid[4][-1 if s > 0 else 0]]
            p1 = np.array([(K.ear_c[0] - 0.06) * s, K.ear_c[1] - 0.06, K.ear_c[2] + 0.22])
            q1, fi, dd = S.nearest(p1); p1 = q1 + S.normal_at(q1) * 0.03
            mid = (p0 + p1) / 2; qm, fi, dd = S.nearest(mid); mid = qm + S.normal_at(qm) * 0.035
            strap.merge(tube([p0, mid, p1], [0.025, 0.025, 0.025], 5, 'cloth2'))
        return [mask, cans, strap]

    # ---- headset: padded cups over the ears, a band over the head, a mic ----
    def headset(tier):
        cups = Part('gear'); pads = Part('pad'); band = Part('gear')
        cc = {}
        for s in (1, -1):
            d = np.array([s * 0.96, 0.0, (K.ear_c[2] - C[2]) * 0.3]); d /= np.linalg.norm(d)
            cen = np.array([0, K.ear_c[1], K.ear_c[2]])
            r = max(outer(tier, d, cen), abs(K.ear_out) + 0.02)
            c = cen + d * r
            ax = np.array([s, 0, 0.0])
            pads.merge(lathe(c - ax * 0.01, ax, [(0.0, 0.2), (0.03, 0.27), (0.07, 0.27), (0.08, 0.24)], 14, 'pad'))
            cups.merge(lathe(c, ax, [(0.07, 0.25), (0.12, 0.27), (0.18, 0.25), (0.21, 0.19), (0.215, 0.0)], 14, 'gear'))
            cups.line(ring_pts(c + ax * 0.2, ax, 0.205, 28), closed=True)
            cc[s] = c
        cen = np.array([0, K.ear_c[1], K.ear_c[2]])
        pts = []
        for b in np.linspace(-80, 80, 21):
            d = np.array([math.sin(math.radians(b)), math.cos(math.radians(b)), 0])
            pts.append(cen + d * (outer(tier, d, cen) + 0.045))
        pts = [cc[-1] + np.array([0.04, 0.24, 0])] + pts + [cc[1] + np.array([-0.04, 0.24, 0])]
        band.merge(tube(pts, [0.04] * len(pts), 6, 'gear'))
        m0 = cc[1] + np.array([0.12, -0.12, 0.16])
        mouth = np.array([0.3, 6.66, 1.32])
        mic = tube([m0, m0 + np.array([0.0, -0.12, 0.35]), mouth + np.array([0.18, 0.0, -0.12]), mouth], [0.026] * 4, 6, 'gear')
        tip = lathe(mouth, mouth - (mouth + np.array([0.18, 0.0, -0.12])), [(-0.03, 0.04), (0.0, 0.05), (0.05, 0.045), (0.06, 0.0)], 8, 'glow')
        return [cups, pads, band, mic, tip]

    # ---- cyber eye implant: a hex plate round the left eye, a lens ring, studs ----
    def implant():
        plate = Part('metal'); lens = Part('lens'); trim = Part('gear')
        c = eyeL
        ax = np.array([0.12, 0.0, 1.0]); ax /= np.linalg.norm(ax)
        rings = []
        for rad, lift in ((0.17, 0.05), (0.3, 0.045), (0.34, 0.012)):
            row = []
            for k in range(6):
                a = 2 * math.pi * (k + 0.5) / 6
                q = np.array([c[0] + rad * math.cos(a) * 1.08, c[1] + rad * math.sin(a) * 0.95, c[2] + 0.4])
                h = S.ray(q, -ax, 1.5)
                p = h[0] if h else q - ax * 0.3
                row.append(plate.add(p + S.normal_at(p) * lift, 1.0 if lift > 0.04 else 0.7))
            rings.append(row)
        for i in range(2):
            for k in range(6):
                j = (k + 1) % 6; plate.quad(rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k])
        plate.line([plate.v[i] + (plate.v[i] - c) * 0.02 for i in rings[1]], closed=True)
        fc = c + ax * (R + 0.04)
        trim.merge(lathe(fc - ax * 0.05, ax, [(0.0, 0.17), (0.06, 0.165), (0.08, 0.13), (0.06, 0.12)], 16, 'gear'))
        trim.line(ring_pts(fc + ax * 0.03, ax, 0.145, 24), closed=True)
        n = 16; rr = [lens.add(fc + p - ax * 0.0, 0.8) for p in [x - fc for x in ring_pts(fc, ax, 0.125, n)]]
        cc = lens.add(fc + ax * 0.02, 1.3)
        for k in range(n): lens.tri(cc, rr[k], rr[(k + 1) % n])
        studs = Part('glow')
        for k in (0, 2, 4):
            p = plate.v[rings[1][k]]
            studs.merge(octa(p + (p - c) * 0.0 + S.normal_at(p) * 0.012, S.normal_at(p), 0.025, 0.022, 'glow'))
        return [plate, trim, lens, studs]

    # ---- cap: a six panel dome, a curved brim, a button ----
    def cap(tier):
        dome = Part('cloth2'); brim = Part('cloth2')
        cend = lambda a: table([(0, 7.97), (60, 7.8), (100, 7.66), (180, 7.5)], a)
        n_mer, rings = 36, 8
        grid = []
        for j in range(n_mer):
            th = 360.0 * j / n_mer; a = ((th + 180) % 360) - 180
            pe = SC.phi_at_y(a, cend(abs(a)))
            col = []
            for i in range(rings + 1):
                t = i / rings
                ph = 89.5 - t * (89.5 - pe)
                d = dir_tp(a, ph)
                r = max(outer(tier, d), SC.r(a, ph) + 0.03) + 0.025
                seam = 0.78 if j % 6 == 0 else 1.0
                col.append(dome.add(SC.c + d * r, seam))
            grid.append(col)
        top = dome.add(SC.c + np.array([0, 1.0, 0]) * (outer(tier, [0, 1, 0]) + 0.03))
        for j in range(n_mer):
            k = (j + 1) % n_mer
            dome.tri(top, grid[k][0], grid[j][0])
            for i in range(rings):
                dome.quad(grid[j][i], grid[k][i], grid[k][i + 1], grid[j][i + 1])
        # rolled band at the bottom edge
        band = []
        for j in range(n_mer):
            q = dome.v[grid[j][-1]]; dd = q - SC.c; dd[1] = 0; dd /= np.linalg.norm(dd)
            band.append(dome.add(q + dd * 0.015 - np.array([0, 0.04, 0]), 0.7))
        for j in range(n_mer):
            k = (j + 1) % n_mer; dome.quad(grid[j][-1], grid[k][-1], band[k], band[j])
        btn = lathe(dome.v[top], [0, 1, 0], [(0.0, 0.055), (0.02, 0.05), (0.03, 0.0)], 8, 'cloth2')
        # brim: a curved slab with a thickness
        angs = np.linspace(-72, 72, 17)
        rows = []
        for a in angs:
            j = int(round(((a % 360) / 360) * n_mer)) % n_mer
            fwd = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
            p = dome.v[band[j]] + np.array([0, 0.02, 0])
            L = 0.66 * math.cos(math.radians(a) * 1.2) ** 0.55
            curve = 0.07 * (abs(a) / 72) ** 2
            o = p + fwd * L + np.array([0, -0.06 - 0.12 * L - curve, 0])
            rows.append([brim.add(p, 0.9), brim.add(o, 1.0), brim.add(o - np.array([0, 0.04, 0]), 0.6), brim.add(p - np.array([0, 0.04, 0]), 0.5)])
        for a, b in zip(rows, rows[1:]):
            brim.quad(a[0], b[0], b[1], a[1]); brim.quad(a[1], b[1], b[2], a[2]); brim.quad(a[2], b[2], b[3], a[3])
        brim.quad(*rows[0][::-1]); brim.quad(*rows[-1])
        brim.line([brim.v[r[1]] + np.array([0, 0.004, 0.006]) for r in rows])
        return [dome, brim, btn]

    # ---- bandana: a rolled band, a knot and two tails ----
    def bandana(tier):
        b = Part('band')
        angs = np.linspace(0, 360, 49)[:-1]
        rows = []
        for y, lift in ((7.74, 0.0), (7.84, 0.022), (7.94, 0.0)):
            row = []
            for a in angs:
                d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
                cen = np.array([0, y, 0.28])
                r = max(outer(tier, d, cen), np.linalg.norm((S.out_ray(cen, d) - cen)[[0, 2]]) + 0.02) + 0.012 + lift
                row.append(b.add(cen + d * r, 0.85 + 0.25 * (lift > 0)))
            rows.append(row)
        m = len(angs)
        for i in range(2):
            for j in range(m):
                k = (j + 1) % m; b.quad(rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j])
        knot = b.v[rows[1][m // 2]] + np.array([0, 0, -0.04])
        b.merge(octa(knot, [1, 0, 0], 0.09, 0.07, 'band'))
        for s in (-1, 1):
            pts = [knot + [0.02 * s, -0.02, -0.02], knot + [0.08 * s, -0.24, -0.08], knot + [0.15 * s, -0.5, -0.1]]
            tail = Part('band')
            ids = []
            for k, p in enumerate(pts):
                w = 0.07 - 0.015 * k
                ids.append((tail.add(p + [-w * 0.7, 0, -0.01]), tail.add(p + [w * 0.7, 0, 0.01])))
            for (a0, b0), (a1, b1) in zip(ids, ids[1:]): tail.quad(a0, b0, b1, a1)
            b.merge(tail)
        return [b]

    def earrings():
        part = Part('gold')
        for s in (1, -1):
            c = np.array([K.lobe[0] * s + 0.015 * s, K.lobe[1] - 0.075, K.lobe[2]])
            part.merge(torus(c, [1, 0, 0], 0.07, 0.014, 14, 6, 'gold'))
            part.merge(octa(np.array([K.lobe[0] * s + 0.012 * s, K.lobe[1] + 0.005, K.lobe[2]]), [1, 0, 0], 0.018, 0.018, 'gold'))
        return [part]

    def neck_path(y_back, y_front, off, n=90, cz=0.12):
        pts = []
        for k in range(n):
            a = 2 * math.pi * k / n
            y = y_back + (y_front - y_back) * (0.5 + 0.5 * math.cos(a)) ** 2
            d = np.array([math.sin(a), 0, math.cos(a)]); o = np.array([0, y, cz])
            h = S_all.ray(o + d * 4, -d, 8)
            r = (4 - h[2]) if h else 0.6
            pts.append(o + d * (r + off))
        return pts

    def chain(pts, mat='silver', R=0.016, r=0.0045):
        part = Part(mat)
        for k in range(0, len(pts)):
            p = pts[k]; q = pts[(k + 1) % len(pts)]; ax = q - p; ax /= np.linalg.norm(ax)
            nrm = np.cross(ax, [0, 1.0, 0]); nrm /= np.linalg.norm(nrm)
            link_axis = nrm if k % 2 else np.cross(ax, nrm)
            part.merge(torus(p, link_axis, R, r, 8, 4, mat))
        return part

    def glasses_frame():
        fr = Part('gear'); lenses = Part('lens-clear')
        fronts = []
        for c, sx in ((eyeL, 1), (eyeR, -1)):
            cf = c + np.array([0.02 * sx, 0.01, R + 0.16])
            loop = []
            for k in range(40):
                a = 2 * math.pi * k / 40
                x, y = math.cos(a), math.sin(a)
                sq = (abs(x) ** 4 + abs(y) ** 4) ** -0.25          # a rounded rectangle
                loop.append(cf + np.array([x * sq * 0.17 * sx, y * sq * 0.115, -0.03 * (x * sx) ** 2]))
            fr.merge(tube(loop + [loop[0]], [0.016] * 41, 6, 'gear', cap=False))
            cc = lenses.add(cf); ids = [lenses.add(p) for p in loop]
            for k in range(40): lenses.tri(cc, ids[k], ids[(k + 1) % 40])
            fronts.append((cf, sx, loop))
        bl = fronts[0][2][20]; br = fronts[1][2][20]
        mid = (bl + br) / 2 + np.array([0, 0.03, 0.01])
        fr.merge(tube([fronts[0][2][20], mid, fronts[1][2][20]], [0.014] * 3, 6, 'gear'))
        return [fr, lenses], fronts

    def glasses_arms(tier, fronts):
        arms = Part('gear')
        for cf, sx, loop in fronts:
            p0 = loop[0]
            d = np.array([math.sin(math.radians(100 * sx)), 0, math.cos(math.radians(100 * sx))])
            yc = np.array([0, p0[1], 0.28])
            p1 = yc + d * (outer(tier, d, yc) + 0.01)
            p2 = p1 + np.array([0, -0.08, -0.12])
            arms.merge(tube([p0, p0 * 0.4 + p1 * 0.6 + d * 0.01, p1, p2], [0.016] * 4, 6, 'gear'))
        return [arms]

    gl_parts, gl_fronts = glasses_frame()
    K.prop('gear-glasses', *gl_parts)
    chain_pts = neck_path(6.02, 5.55, 0.1, 70)
    K.prop('gear-chain', chain(chain_pts, 'gold', 0.018, 0.005))
    pend = chain(neck_path(6.02, 5.62, 0.1, 64), 'silver')
    low = min(range(64), key=lambda k: neck_path(6.02, 5.62, 0.1, 64)[k][1])
    pc = neck_path(6.02, 5.62, 0.1, 64)[0] + np.array([0, -0.075, 0.02])
    pend.merge(torus(pc, [0, 0, 1.0], 0.05, 0.012, 20, 6, 'silver'))
    K.prop('gear-pendant', pend)
    ch = Part('leather'); spikes = Part('silver')
    ring = neck_path(6.24, 6.2, 0.035, 48, cz=0.1)
    rows = [[ch.add(p + np.array([0, dy, 0]) + (p - np.array([0, p[1], 0.1])) / np.linalg.norm((p - np.array([0, p[1], 0.1]))) * lift) for p in ring] for dy, lift in ((-0.07, 0.0), (-0.06, 0.02), (0.06, 0.02), (0.07, 0.0))]
    for i in range(3):
        for k in range(48):
            j = (k + 1) % 48; ch.quad(rows[i][k], rows[i][j], rows[i + 1][j], rows[i + 1][k])
    for k in range(0, 48, 4):
        p = ring[k]; d = p - np.array([0, p[1], 0.1]); d /= np.linalg.norm(d)
        if d[2] < -0.3: continue
        spikes.merge(lathe(p + d * 0.015, d, [(0.0, 0.035), (0.01, 0.035), (0.09, 0.0)], 10, 'silver'))
    K.prop('gear-choker', ch, spikes)

    for tier in ('', '-mid', '-loose', '-xl'):
        K.prop('gear-glasses-fit' + tier, *glasses_arms(tier, gl_fronts))
        K.prop('gear-visor' + tier, *visor(tier))
        K.prop('gear-goggles' + tier, *goggles(tier))
        K.prop('gear-headset' + tier, *headset(tier))
        K.prop('gear-cap' + tier, *cap(tier))
        K.prop('gear-bandana' + tier, *bandana(tier))
    K.prop('gear-respirator', *respirator())
    K.prop('gear-implant', *implant())
    K.prop('gear-earrings', *earrings())
