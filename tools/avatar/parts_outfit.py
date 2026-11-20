"""Outfits: tee (crew neck), tank top, open shirt over a tee, hoodie, leather jacket, high
collar and shoulder plates. Each is a shell of the bust cut along a neckline plane, with
UVs for a tiling fabric texture. The main fabric ('knit', 'weave', 'leather') takes the
outfit colour; 'under' is the dark tee under the shirt and the jacket."""
import math, numpy as np
from geom import Part, smooth, table, tube, lathe


def cyl_uv(p):
    return (math.atan2(p[0], p[2] - 0.1) / (2 * math.pi) * 8 + 4, p[1] * 3.0)


def build(K):
    S, S_all = K.S, K.S_all

    def bust_shell(off, front_y, back_y, mat, keep=None, fold=0.012, cuts=()):
        import bmesh
        from mathutils import Vector as Vc
        Fp = np.array([0, front_y, 1.2]); Bp = np.array([0, back_y, -0.8])
        nrm = np.cross(np.array([1.0, 0, 0]), Bp - Fp); nrm /= np.linalg.norm(nrm)
        if nrm[1] > 0: nrm = -nrm
        allV, allT = S_all.V, S_all.T
        W = list(K.weld[:K.n_skin]) + list(range(10 ** 6, 10 ** 6 + len(allV) - K.n_skin))
        # welded normals, so UV seams in the head do not split the cloth
        acc = {}
        for t in allT:
            n = np.cross(allV[t[1]] - allV[t[0]], allV[t[2]] - allV[t[0]])
            for v in t: acc[W[v]] = acc.get(W[v], 0) + n
        sel = [i for i, t in enumerate(allT) if ((allV[t] - Fp) @ nrm).max() > -0.05 and (keep is None or keep(allV[t].mean(0)))]
        bm = bmesh.new(); vm = {}
        for i in sel:
            vs = []
            for v in allT[i]:
                w = W[v]
                if w not in vm:
                    p = allV[v]; n = acc[w] / np.linalg.norm(acc[w])
                    f = fold * math.sin(p[0] * 7.0 + p[1] * 3.0) * smooth(6.0, 5.2, p[1])
                    vm[w] = bm.verts.new(Vc(p + n * (off + f)))
                vs.append(vm[w])
            try: bm.faces.new(vs)
            except ValueError: pass
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vc(Fp), plane_no=Vc(-nrm), clear_outer=True)
        # clean edges where the bust is cut, then any extra cuts such as armholes
        cuts = [((0, 4.64, 0), (0, -1.0, 0)), ((1.71, 0, 0), (1.0, 0, 0)), ((-1.71, 0, 0), (-1.0, 0, 0))] + list(cuts)
        for co, no in cuts:
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vc(co), plane_no=Vc(no), clear_outer=True)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        part = Part(mat)
        bm.verts.index_update()
        for v in bm.verts:
            p = np.array(v.co); part.add(p, 0.94 + 0.06 * smooth(5.0, 6.0, p[1]), 1, cyl_uv(p))
        for f in bm.faces: part.tri(*[v.index for v in f.verts])
        bm.free()
        return part, Fp, nrm

    def snap_edge(part, sel, target_x):
        """Move the open-edge vertices picked by sel(p) onto x = target_x(p), back on the
        cloth surface, so a cut that followed triangles becomes a clean curve."""
        from collections import Counter
        ec = Counter()
        for a, b, c in part.t:
            for e in ((a, b), (b, c), (c, a)): ec[tuple(sorted(e))] += 1
        bv = {v for e, k in ec.items() if k == 1 for v in e}
        for v in bv:
            p = part.v[v]
            if not sel(p): continue
            x = math.copysign(target_x(p), p[0])
            h = S_all.ray(np.array([x, p[1], 3.0]), np.array([0, 0, -1.0]), 5) if p[2] > 0 else S_all.ray(np.array([x, p[1], -3.0]), np.array([0, 0, 1.0]), 5)
            if h is None: continue
            off = np.linalg.norm(p - S_all.nearest(p)[0])
            part.v[v] = h[0] + S_all.normal_at(h[0]) * off
            part.uv[v] = cyl_uv(part.v[v])
        return part

    def neckline_y(Fp, nrm, a, r=0.62):
        x, z = r * math.sin(math.radians(a)), 0.1 + r * math.cos(math.radians(a))
        return Fp[1] - ((x - Fp[0]) * nrm[0] + (z - Fp[2]) * nrm[2]) / nrm[1]

    def ring_rows(rows, mat, a0=0, a1=360, n=48, closed=True, rib=0.0, shade=None):
        part = Part(mat)
        angs = list(np.linspace(a0, a1, n + (0 if closed else 0), endpoint=not closed))
        grid = []
        for i, (yf, of) in enumerate(rows):
            row = []
            for j, a in enumerate(angs):
                y = yf(a); cz = 0.05 + 0.15 * smooth(6.3, 5.6, y)
                d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
                p = S.out_ray(np.array([0, y, cz]), d)
                r = of(a) + rib * (j % 2)
                row.append(part.add(p + d * r, (shade[i] if shade else 1.0), 1, (j / max(1, len(angs) - 1) * 12, i * 0.3)))
            grid.append(row)
        m = len(angs)
        for i in range(len(rows) - 1):
            for j in range(m if closed else m - 1):
                k = (j + 1) % m
                part.quad(grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j])
        return part, grid, angs
    wrap = lambda a: abs(((a + 180) % 360) - 180)
    def rib_collar(Fp, nrm, mat, off=0.0):
        return ring_rows([(lambda a: neckline_y(Fp, nrm, a) - 0.035, lambda a: 0.07 + off), (lambda a: neckline_y(Fp, nrm, a) + 0.03, lambda a: 0.085 + off),
                          (lambda a: neckline_y(Fp, nrm, a) + 0.075, lambda a: 0.06 + off), (lambda a: neckline_y(Fp, nrm, a) + 0.07, lambda a: 0.0)],
                         mat, n=64, shade=[0.85, 1.0, 1.0, 0.6])[0]

    # tee
    tee, Fp, nrm = bust_shell(0.03, 5.78, 6.12, 'knit')
    K.prop('fit-crew', tee, rib_collar(Fp, nrm, 'knit'))

    # tank top: a scoop neck and bare shoulders
    def tank_keep(p):
        lim = 1.05 - 0.4 * smooth(5.45, 5.85, p[1])
        return abs(p[0]) < lim
    arm = [((s * 0.68, 6.1, 0.0), tuple(np.array([s * 0.85, 0.53, 0.0]) / np.linalg.norm([0.85, 0.53]))) for s in (1, -1)]
    tank, Fpt, nrmt = bust_shell(0.025, 5.55, 6.08, 'knit', cuts=arm)
    K.prop('fit-tank', tank)

    # open shirt over a dark tee: an open front, a collar that stands at the back and lapels
    under, Fpu, nrmu = bust_shell(0.025, 5.78, 6.12, 'under')
    open_w = lambda y: 0.16 + 0.24 * smooth(6.0, 5.1, y)
    shirt, _, _ = bust_shell(0.07, 5.86, 6.14, 'weave', keep=lambda p: not (p[2] > 0.2 and abs(p[0]) < open_w(p[1])), fold=0.02)
    snap_edge(shirt, lambda p: p[2] > 0.3 and abs(p[0]) < 0.75 and p[1] < 6.0, lambda p: open_w(p[1]))
    col, grid, angs = ring_rows([(lambda a: 5.93 + 0.2 * smooth(30, 150, wrap(a)), lambda a: 0.12), (lambda a: 6.1 + 0.18 * smooth(30, 150, wrap(a)), lambda a: 0.14),
                                 (lambda a: 6.18 + 0.16 * smooth(30, 150, wrap(a)), lambda a: 0.19), (lambda a: 6.02 + 0.14 * smooth(30, 150, wrap(a)), lambda a: 0.27)],
                                'weave', a0=28, a1=332, n=40, closed=False, shade=[0.75, 0.95, 1.05, 0.9])
    lapels = Part('weave')
    for sx in (1, -1):
        rows = []
        for y in np.linspace(5.95, 5.0, 10):
            x0 = open_w(y) * sx; x1 = (open_w(y) + 0.11 * smooth(4.9, 5.9, y) + 0.02) * sx
            row = []
            for x, lift in ((x0, 0.09), (x1, 0.08)):
                h = S_all.ray(np.array([x, y, 3.0]), np.array([0, 0, -1.0]), 5)
                p = h[0] + np.array([0, 0, lift]) if h else np.array([x, y, 1.0])
                row.append(lapels.add(p, 1.05, 1, cyl_uv(p)))
            rows.append(row)
        for a, b in zip(rows, rows[1:]):
            if sx > 0: lapels.quad(a[0], b[0], b[1], a[1])
            else: lapels.quad(a[1], b[1], b[0], a[0])
    buttons = Part('silver')
    for y in np.linspace(5.75, 5.0, 4):
        x = -(open_w(y) + 0.03)
        h = S_all.ray(np.array([x, y, 3.0]), np.array([0, 0, -1.0]), 5)
        if h: buttons.merge(lathe(h[0] + np.array([0, 0, 0.085]), [0, 0, 1.0], [(0, 0.022), (0.012, 0.02), (0.016, 0.0)], 10, 'silver'))
    K.prop('fit-shirt', under, shirt, col, lapels, buttons)

    # hoodie: the hood bunched behind the neck and drawstrings
    hd, Fp3, nrm3 = bust_shell(0.07, 5.74, 6.08, 'knit', fold=0.02)
    bunch = lambda a: smooth(40, 120, wrap(a))
    lump = ring_rows([(lambda a: neckline_y(Fp3, nrm3, a) - 0.04, lambda a: 0.1),
                      (lambda a: 5.98 + 0.06 * smooth(90, 180, wrap(a)), lambda a: 0.3 * bunch(a) + 0.11),
                      (lambda a: 6.18 + 0.06 * smooth(90, 180, wrap(a)), lambda a: 0.36 * bunch(a) + 0.1),
                      (lambda a: 6.34 + 0.05 * smooth(90, 180, wrap(a)), lambda a: 0.24 * bunch(a) + 0.07),
                      (lambda a: 6.3 + 0.05 * smooth(90, 180, wrap(a)), lambda a: 0.06 * bunch(a) + 0.02)],
                     'knit', a0=34, a1=326, n=48, closed=False, shade=[0.75, 0.95, 1.05, 0.95, 0.5])[0]
    strings = Part('knit'); tips = Part('silver')
    for s in (-1, 1):
        top = S_all.in_ray(np.array([0.17 * s, 5.8, 0.3]), np.array([0, 0, 1.0])) + [0, 0, 0.1]
        path = [top, top + [0.01 * s, -0.3, 0.03], top + [0.02 * s, -0.58, 0.05]]
        strings.merge(tube(path, [0.02] * 3, 8, 'knit'))
        tips.merge(lathe(path[-1], np.array([0, -1.0, 0]), [(0.0, 0.024), (0.07, 0.024), (0.08, 0.0)], 8, 'silver'))
    K.prop('fit-hoodie', hd, lump, strings, tips)

    # leather jacket over a dark tee: a wide open front, broad lapels and a zip
    under2, _, _ = bust_shell(0.025, 5.78, 6.12, 'under')
    jopen = lambda y: 0.2 + 0.3 * smooth(6.0, 5.0, y)
    jacket, _, _ = bust_shell(0.1, 5.9, 6.16, 'leather', keep=lambda p: not (p[2] > 0.2 and abs(p[0]) < jopen(p[1])), fold=0.025)
    snap_edge(jacket, lambda p: p[2] > 0.3 and abs(p[0]) < 0.85 and p[1] < 6.0, lambda p: jopen(p[1]))
    jcol = ring_rows([(lambda a: 5.96 + 0.2 * smooth(30, 150, wrap(a)), lambda a: 0.15), (lambda a: 6.14 + 0.16 * smooth(30, 150, wrap(a)), lambda a: 0.17),
                      (lambda a: 6.2 + 0.14 * smooth(30, 150, wrap(a)), lambda a: 0.24), (lambda a: 6.0 + 0.12 * smooth(30, 150, wrap(a)), lambda a: 0.34)],
                     'leather', a0=32, a1=328, n=40, closed=False, shade=[0.7, 0.95, 1.08, 0.9])[0]
    jl = Part('leather'); zip_ = Part('silver')
    for sx in (1, -1):
        rows = []
        for y in np.linspace(6.0, 5.0, 11):
            w = 0.2 * smooth(4.95, 5.6, y) * (1 + 0.6 * smooth(5.7, 5.95, y))
            x0 = jopen(y) * sx; x1 = (jopen(y) + w + 0.02) * sx
            row = []
            for x, lift in ((x0, 0.125), (x1, 0.115)):
                h = S_all.ray(np.array([x, y, 3.0]), np.array([0, 0, -1.0]), 5)
                p = h[0] + np.array([0, 0, lift]) if h else np.array([x, y, 1.0])
                row.append(jl.add(p, 1.05, 1, cyl_uv(p)))
            rows.append(row)
        for a, b in zip(rows, rows[1:]):
            if sx > 0: jl.quad(a[0], b[0], b[1], a[1])
            else: jl.quad(a[1], b[1], b[0], a[0])
        zp = []
        for y in np.linspace(5.6, 4.7, 8):
            x = (jopen(y) + 0.015) * sx
            h = S_all.ray(np.array([x, y, 3.0]), np.array([0, 0, -1.0]), 5)
            if h: zp.append(h[0] + np.array([0, 0, 0.11]))
        if len(zp) > 2: zip_.merge(tube(zp, [0.012] * len(zp), 6, 'silver'))
    K.prop('fit-jacket', under2, jacket, jcol, jl, zip_)

    # high collar: a tall band that folds over at the top
    hc, Fp2, nrm2 = bust_shell(0.035, 5.86, 6.12, 'knit')
    col2 = ring_rows([(lambda a: neckline_y(Fp2, nrm2, a) - 0.05, lambda a: 0.1),
                      (lambda a: 6.18 + 0.12 * smooth(30, 160, wrap(a)), lambda a: 0.13),
                      (lambda a: 6.36 + 0.14 * smooth(30, 160, wrap(a)), lambda a: 0.16),
                      (lambda a: 6.4 + 0.14 * smooth(30, 160, wrap(a)), lambda a: 0.1),
                      (lambda a: 6.33 + 0.14 * smooth(30, 160, wrap(a)), lambda a: 0.02)],
                     'knit', a0=14, a1=346, n=48, closed=False, shade=[0.8, 0.95, 1.08, 0.9, 0.45])[0]
    K.prop('fit-collar', hc, col2)

    # shoulder plates over the tee, with a glow edge (armour counts as gear)
    pl, Fp4, nrm4 = bust_shell(0.03, 5.8, 6.12, 'knit')
    def plate(sx, cx, cz, rx, rz, lift):
        part = Part('metal')
        rings, segs = 5, 24
        pts = []
        for i in range(rings + 1):
            for k in range(segs if i else 1):
                u = i / rings; ang = 2 * math.pi * k / segs
                x = cx + rx * u * math.cos(ang); z = cz + rz * u * math.sin(ang)
                h = S_all.ray(np.array([x * sx, 6.2, z]), np.array([0, -1.0, 0]), 3)
                pts.append((x * sx, z, u, h[0][1] if h else 4.8))
        A = np.array([[1, p[0], p[1]] for p in pts]); yv = np.array([p[3] for p in pts])
        coef = np.linalg.lstsq(A, yv, rcond=None)[0]
        raise_by = max(0.0, float((yv - A @ coef).max())) + 0.06
        grid, n = [], 0
        for i in range(rings + 1):
            row = []
            for k in range(segs if i else 1):
                x, z, u, _ = pts[n]; n += 1
                y = coef[0] + coef[1] * x + coef[2] * z + raise_by + lift * (1 - u * u)
                row.append(part.add(np.array([x, y, z]), 1.05 - 0.2 * u, 1, (x, z)))
            grid.append(row)
        for k in range(segs): part.tri(grid[0][0], grid[1][k], grid[1][(k + 1) % segs])
        for i in range(1, rings):
            for k in range(segs):
                j = (k + 1) % segs
                part.quad(grid[i][k], grid[i + 1][k], grid[i + 1][j], grid[i][j])
        rim = grid[-1]
        bev = [part.add(part.v[i] + (part.v[i] - np.array([cx * sx, part.v[i][1], cz])) * 0.04 + np.array([0, -0.03, 0]), 0.9) for i in rim]
        low = [part.add(part.v[i] + np.array([0, -0.1, 0]), 0.45) for i in bev]
        for k in range(segs):
            j = (k + 1) % segs; part.quad(rim[k], bev[k], bev[j], rim[j]); part.quad(bev[k], low[k], low[j], bev[j])
        part.line([part.v[i] + np.array([0, 0.004, 0]) for i in bev], closed=True)
        return part
    plates = Part('metal')
    for sx in (1, -1):
        for cx, cz, rx, rz, lift in [(1.0, 0.0, 0.3, 0.42, 0.1), (1.26, 0.02, 0.3, 0.46, 0.12), (1.5, 0.04, 0.24, 0.46, 0.13)]:
            plates.merge(plate(sx, cx, cz, rx, rz, lift))
    K.prop('fit-plates', pl, rib_collar(Fp4, nrm4, 'knit'), plates)
