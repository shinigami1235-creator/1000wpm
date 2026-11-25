"""Geometry helpers for the avatar props. All coordinates are MakeHuman decimetres:
Y up, +Z is the front of the face, +X is the character's left."""
import math, numpy as np
import bpy  # noqa: F401  (makes mathutils importable)
from mathutils import Vector
from mathutils.bvhtree import BVHTree

C = np.array([0.0, 7.72, 0.28])      # skull centre used for hair rays


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def table(t, x):
    if x <= t[0][0]: return t[0][1]
    for i in range(1, len(t)):
        if x <= t[i][0]:
            a, b = t[i - 1], t[i]
            return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
    return t[-1][1]


class Part:
    """One prop part: vertices, triangles, a material name and the edges that glow.
    col: per-vertex colour multiplier (baked shading), dens: per-vertex hair density
    (stubble fades to skin where it is low), morph: extra shape deltas such as brow
    thickness. Glow lines are only the ones listed in extra_lines unless crease is set."""
    def __init__(self, mat, crease=None):
        self.v, self.t, self.mat, self.crease, self.extra_lines = [], [], mat, crease, []
        self.col, self.dens, self.morph, self.uv, self.strand = [], [], {}, [], []
        self.bound = None        # optional surface the part binds to instead of the default

    def add(self, p, col=1.0, dens=1.0, uv=(0.0, 0.0), strand=(0.0, 0.0, 0.0)):
        self.v.append(np.asarray(p, float)); self.col.append(col); self.dens.append(dens)
        self.uv.append(tuple(uv)); self.strand.append(tuple(strand)); return len(self.v) - 1

    def line(self, pts, closed=False):
        """A glow polyline through pts (its own vertices, bound like the rest of the part)."""
        ids = [self.add(p) for p in pts]
        self.extra_lines += list(zip(ids, ids[1:]))
        if closed: self.extra_lines.append((ids[-1], ids[0]))
        return ids

    def tri(self, a, b, c):
        if a != b and b != c and a != c: self.t.append((a, b, c))

    def quad(self, a, b, c, d):
        self.tri(a, b, c); self.tri(a, c, d)

    def merge(self, o):
        k = len(self.v); n0 = len(self.v)
        self.v += o.v; self.t += [(a + k, b + k, c + k) for a, b, c in o.t]
        self.col += o.col or [1.0] * len(o.v); self.dens += o.dens or [1.0] * len(o.v)
        self.uv += o.uv or [(0.0, 0.0)] * len(o.v); self.strand += o.strand or [(0.0, 0.0, 0.0)] * len(o.v)
        self.extra_lines += [(a + k, b + k) for a, b in o.extra_lines]
        for name in set(self.morph) | set(o.morph):
            a = self.morph.get(name, np.zeros((n0, 3))); b = o.morph.get(name, np.zeros((len(o.v), 3)))
            self.morph[name] = np.concatenate([np.asarray(a).reshape(-1, 3), np.asarray(b).reshape(-1, 3)])
        return self


class Surface:
    """Ray casts and nearest-point queries against the neutral head (skin only)."""
    def __init__(self, verts, tris):
        self.V = np.asarray(verts, float); self.T = np.asarray(tris)
        self.tree = BVHTree.FromPolygons([Vector(p) for p in self.V], [list(map(int, t)) for t in self.T])
        n = np.cross(self.V[self.T[:, 1]] - self.V[self.T[:, 0]], self.V[self.T[:, 2]] - self.V[self.T[:, 0]])
        self.fn = n / (np.linalg.norm(n, axis=1)[:, None] + 1e-12)
        vn = np.zeros_like(self.V)
        for k in range(3): np.add.at(vn, self.T[:, k], n)
        self.vn = vn / (np.linalg.norm(vn, axis=1)[:, None] + 1e-12)

    def ray(self, origin, direction, dist=50):
        loc, no, fi, d = self.tree.ray_cast(Vector(origin), Vector(direction), dist)
        return None if loc is None else (np.array(loc), fi, d)

    def out_ray(self, origin, direction):
        """First surface crossed going outward from a point inside the head."""
        h = self.ray(origin, direction)
        return h[0] if h else None

    def in_ray(self, origin, direction):
        """First surface hit coming in from outside along -direction."""
        d = np.asarray(direction, float); d = d / np.linalg.norm(d)
        h = self.ray(np.asarray(origin) + d * 20, -d, 40)
        return h[0] if h else None

    def nearest(self, p):
        loc, no, fi, d = self.tree.find_nearest(Vector(p))
        return np.array(loc), fi, d

    def normal_at(self, p):
        loc, fi, d = self.nearest(p)
        a, b, c = self.T[fi]; w = bary(self.V[a], self.V[b], self.V[c], loc)
        n = w[0] * self.vn[a] + w[1] * self.vn[b] + w[2] * self.vn[c]
        return n / np.linalg.norm(n)

    def bind(self, p):
        loc, fi, d = self.nearest(p)
        a, b, c = self.T[fi]
        return (int(a), int(b), int(c)), bary(self.V[a], self.V[b], self.V[c], loc)


def bary(a, b, c, p):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    out = np.clip(np.array([1 - v - w, v, w]), 0, 1)
    return out / out.sum()


def dir_tp(theta, phi):
    t, p = math.radians(theta), math.radians(phi)
    return np.array([math.cos(p) * math.sin(t), math.sin(p), math.cos(p) * math.cos(t)])


def meridian_end(S, theta, y_end, centre=C):
    """Elevation on meridian theta where the head surface reaches height y_end."""
    lo, hi = -75.0, 89.0
    for _ in range(40):
        mid = (lo + hi) / 2
        p = S.out_ray(centre, dir_tp(theta, mid))
        if p is None or p[1] > y_end: hi = mid
        else: lo = mid
    return (lo + hi) / 2


def shell(S, n_mer, rings, end_y, offset, hang_y=None, flare=0.0, close=True, centre=C, theta_range=None, mat='hair', crease=None, end_fn=None):
    """Hair-like shell around the skull. Each meridian runs from the crown to the height
    end_y(theta) (or to where end_fn says to stop), so the bottom edge is a clean line.
    offset(theta, t, p) pushes the point out along the ray. Below hang_y the shell
    falls straight down instead of following the jaw and neck."""
    part = Part(mat, crease)
    full = theta_range is None
    thetas = [360.0 * j / n_mer for j in range(n_mer)] if full else list(np.linspace(theta_range[0], theta_range[1], n_mer))
    grid = []
    hang_r = {}
    for th in thetas:
        a = ((th + 180) % 360) - 180
        pe = meridian_end(S, a, end_y(abs(a)), centre)
        col = []
        for i in range(1, rings + 1):
            t = i / rings
            phi = 89.5 - t * (89.5 - pe)
            d = dir_tp(a, phi)
            p = S.out_ray(centre, d)
            if p is None: p = centre + d * 0.8
            if end_fn is not None:
                stop = end_fn(a, t, p)
                if stop: col.append(None); continue
            q = p + d * offset(abs(a), t, p)
            if hang_y is not None:
                if q[1] >= hang_y: hang_r[th] = math.hypot(q[0] - centre[0], q[2] - centre[2])
                else:
                    r0 = hang_r.get(th, math.hypot(q[0] - centre[0], q[2] - centre[2]))
                    rs = math.hypot(p[0] - centre[0], p[2] - centre[2]) + offset(abs(a), t, p)
                    r = max(r0 * (1 + flare * (hang_y - q[1])), rs)
                    q = np.array([centre[0] + math.sin(math.radians(a)) * r, q[1], centre[2] + math.cos(math.radians(a)) * r])
            col.append(q)
        grid.append(col)
    top = part.add(S.out_ray(centre, np.array([0, 1, 0])) + np.array([0, offset(0, 0, None), 0]))
    idx = [[part.add(q) if q is not None else None for q in col] for col in grid]
    m = len(thetas)
    pairs = range(m) if full else range(m - 1)
    for j in pairs:
        k = (j + 1) % m
        a0, b0 = idx[j][0], idx[k][0]
        if a0 is not None and b0 is not None: part.tri(top, b0, a0)
        for i in range(rings - 1):
            a, b, c, d = idx[j][i], idx[k][i], idx[k][i + 1], idx[j][i + 1]
            if None in (a, b, c, d):
                if a is not None and b is not None and d is not None and c is None: part.tri(a, b, d)
                elif a is not None and b is not None and c is not None and d is None: part.tri(a, b, c)
                continue
            part.quad(a, b, c, d)
    if close:
        # a thin wall along the bottom edge so the shell reads as a solid
        last = []
        for j in range(m):
            col = [x for x in idx[j] if x is not None]
            last.append(col[-1] if col else None)
        inner = []
        for j, li in enumerate(last):
            if li is None: inner.append(None); continue
            q = part.v[li]; p, fi, d = S.nearest(q)
            inner.append(part.add(p + (q - p) * 0.15))
        for j in pairs:
            k = (j + 1) % m
            if None in (last[j], last[k], inner[j], inner[k]): continue
            part.quad(last[j], last[k], inner[k], inner[j])
    return part


def tube(path, radii, sides=6, mat='hair', cap=True, twist=0.0, crease=None):
    part = Part(mat, crease)
    path = [np.asarray(p, float) for p in path]
    rings = []
    up = np.array([0.0, 0, 1])
    for i, p in enumerate(path):
        tan = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]); tan /= np.linalg.norm(tan)
        a = np.cross(tan, up)
        if np.linalg.norm(a) < 1e-4: a = np.cross(tan, np.array([1.0, 0, 0]))
        a /= np.linalg.norm(a); b = np.cross(tan, a)
        ring = []
        for s in range(sides):
            ang = 2 * math.pi * s / sides + twist * i
            ring.append(part.add(p + (a * math.cos(ang) + b * math.sin(ang)) * radii[i]))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(sides):
            t = (s + 1) % sides
            part.quad(rings[i][s], rings[i][t], rings[i + 1][t], rings[i + 1][s])
    if cap:
        for ring, p in ((rings[0], path[0]), (rings[-1], path[-1])):
            if radii[path.index(p) if False else 0] == 0: pass
            c = part.add(p)
            for s in range(sides): part.tri(c, ring[s], ring[(s + 1) % sides])
    return part


def slab(points, half, normals, offset, thick, mat, crease=None):
    """A strip along surface points: points[i] with in-surface half-width vector half[i].
    Built as a closed slab between offset-thick and offset along the normal."""
    part = Part(mat, crease)
    top, bot = [], []
    for p, h, n, o, th in zip(points, half, normals, offset, thick):
        row = []
        for s in (-1, 1):
            for lift in (o, o - th):
                row.append(part.add(p + h * s + n * lift))
        top.append(row)
    for i in range(len(top) - 1):
        a, b = top[i], top[i + 1]
        # rows: [-outer, -inner, +outer, +inner]
        part.quad(a[0], a[2], b[2], b[0])      # outer face
        part.quad(a[1], b[1], b[3], a[3])      # inner face
        part.quad(a[0], b[0], b[1], a[1])      # side -
        part.quad(a[2], a[3], b[3], b[2])      # side +
    for r in (top[0], top[-1]):
        part.quad(r[0], r[1], r[3], r[2])
    return part


def region_shell(S, pred, offset, mat, wall=True, crease=None):
    """Copy the skin triangles whose centroid passes pred, pushed out along the vertex
    normals by offset(p), with a wall around the edge down to the skin."""
    sel = [i for i, t in enumerate(S.T) if pred(S.V[t].mean(0))]
    part = Part(mat, crease)
    vmap = {}
    for i in sel:
        ids = []
        for v in S.T[i]:
            if v not in vmap: vmap[v] = part.add(S.V[v] + S.vn[v] * offset(S.V[v]))
            ids.append(vmap[v])
        part.tri(*ids)
    if wall:
        from collections import Counter
        ec = Counter()
        for a, b, c in part.t:
            for e in ((a, b), (b, c), (c, a)): ec[tuple(sorted(e))] += 1
        inv = {v: k for k, v in vmap.items()}
        low = {}
        def lo(k):
            if k not in low: low[k] = part.add(S.V[inv[k]] + S.vn[inv[k]] * 0.004)
            return low[k]
        for a, b, c in list(part.t):
            for x, y in ((a, b), (b, c), (c, a)):
                if ec[tuple(sorted((x, y)))] == 1: part.quad(y, x, lo(x), lo(y))
    return part


def octa(c, axis, r_axis, r_side, mat, twist=0.0):
    """An elongated octahedron, the bead used for braids and glow tips."""
    part = Part(mat)
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    a = np.cross(axis, [0, 0, 1.0])
    if np.linalg.norm(a) < 1e-4: a = np.cross(axis, [1.0, 0, 0])
    a /= np.linalg.norm(a); b = np.cross(axis, a)
    top = part.add(c + axis * r_axis); bot = part.add(c - axis * r_axis)
    ring = [part.add(c + (a * math.cos(twist + k * math.pi / 2) + b * math.sin(twist + k * math.pi / 2)) * r_side) for k in range(4)]
    for k in range(4):
        part.tri(top, ring[k], ring[(k + 1) % 4]); part.tri(bot, ring[(k + 1) % 4], ring[k])
    return part


def cylinder(c, axis, r, length, sides, mat, cap_mat=None, crease=30):
    part = Part(mat, crease)
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    a = np.cross(axis, [0, 1.0, 0])
    if np.linalg.norm(a) < 1e-4: a = np.cross(axis, [1.0, 0, 0])
    a /= np.linalg.norm(a); b = np.cross(axis, a)
    rings = []
    for e in (-0.5, 0.5):
        rings.append([part.add(c + axis * length * e + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for k in range(sides):
        part.quad(rings[0][k], rings[0][(k + 1) % sides], rings[1][(k + 1) % sides], rings[1][k])
    capp = Part(cap_mat or mat, crease)
    for ring, e in ((rings[0], -0.5), (rings[1], 0.5)):
        cc = capp.add(c + axis * length * e)
        ids = [capp.add(part.v[i]) for i in ring]
        for k in range(sides): capp.tri(cc, ids[k], ids[(k + 1) % sides])
    return part, capp


def torus(c, axis, R, r, n_major, n_minor, mat, phase=0.0):
    """A faceted ring, for hoops, padding and rims."""
    part = Part(mat)
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    a = np.cross(axis, [0, 1.0, 0])
    if np.linalg.norm(a) < 1e-4: a = np.cross(axis, [1.0, 0, 0])
    a /= np.linalg.norm(a); b = np.cross(axis, a)
    grid = []
    for i in range(n_major):
        u = 2 * math.pi * i / n_major
        radial = a * math.cos(u) + b * math.sin(u)
        grid.append([part.add(c + radial * (R + r * math.cos(2 * math.pi * k / n_minor + phase)) + axis * r * math.sin(2 * math.pi * k / n_minor + phase)) for k in range(n_minor)])
    for i in range(n_major):
        j = (i + 1) % n_major
        for k in range(n_minor):
            l = (k + 1) % n_minor
            part.quad(grid[i][k], grid[j][k], grid[j][l], grid[i][l])
    return part


def ring_pts(c, axis, r, n, start=None):
    """n points on a circle (for glow lines around round parts)."""
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    a = np.cross(axis, [0, 1.0, 0])
    if np.linalg.norm(a) < 1e-4: a = np.cross(axis, [1.0, 0, 0])
    a /= np.linalg.norm(a); b = np.cross(axis, a)
    return [c + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r for k in range(n)]


def lathe(c, axis, profile, sides, mat, phase=0.0, cap0=False, cap1=False):
    """Revolve profile [(height, radius), ...] around axis: canisters, cups, buttons."""
    part = Part(mat)
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    a = np.cross(axis, [0, 1.0, 0])
    if np.linalg.norm(a) < 1e-4: a = np.cross(axis, [1.0, 0, 0])
    a /= np.linalg.norm(a); b = np.cross(axis, a)
    rings = []
    for h, r in profile:
        rings.append([part.add(c + axis * h + (a * math.cos(2 * math.pi * k / sides + phase) + b * math.sin(2 * math.pi * k / sides + phase)) * r) for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            l = (k + 1) % sides
            part.quad(rings[i][k], rings[i][l], rings[i + 1][l], rings[i + 1][k])
    for flag, ring, h in ((cap0, rings[0], profile[0][0]), (cap1, rings[-1], profile[-1][0])):
        if flag:
            cc = part.add(c + axis * h)
            for k in range(sides):
                if ring is rings[0]: part.tri(cc, ring[(k + 1) % sides], ring[k])
                else: part.tri(cc, ring[k], ring[(k + 1) % sides])
    return part


class Scalp:
    """The skull's radius from a centre point on a theta/phi grid, with the ears left
    out, so hair can follow the head without catching on the ears. theta 0 is the
    front, 90 the character's left; phi 90 is straight up."""
    def __init__(self, S, ear_box, centre=C, th_step=2.0, ph_step=1.5):
        self.c = np.asarray(centre, float)
        self.ths = np.arange(0, 360 + th_step / 2, th_step); self.phs = np.arange(-70, 90 + ph_step / 2, ph_step)
        self.tstep, self.pstep = th_step, ph_step
        R = np.full((len(self.ths), len(self.phs)), np.nan)
        for i, th in enumerate(self.ths):
            for j, ph in enumerate(self.phs):
                h = S.ray(self.c, dir_tp(th, ph), 30)
                if h is None: continue
                p = h[0]
                if ear_box(p): continue
                R[i, j] = h[2]
        for i in range(len(self.ths)):              # fill the ear holes up and down each meridian
            row = R[i]; ok = ~np.isnan(row)
            if ok.sum() >= 2: R[i] = np.interp(np.arange(len(row)), np.nonzero(ok)[0], row[ok])
        sm = R.copy()
        for _ in range(2):
            sm = (np.roll(sm, 1, 0) + np.roll(sm, -1, 0) + sm * 2) / 4
            sm[:, 1:-1] = (sm[:, :-2] + sm[:, 2:] + sm[:, 1:-1] * 2) / 4
        self.R = np.maximum(sm, R)                # never inside the real skin

    def r(self, th, ph):
        th = th % 360; ph = min(max(ph, self.phs[0]), self.phs[-1])
        x = th / self.tstep; y = (ph - self.phs[0]) / self.pstep
        i0, j0 = int(x), int(y); i1, j1 = min(i0 + 1, len(self.ths) - 1), min(j0 + 1, len(self.phs) - 1)
        fx, fy = x - i0, y - j0
        R = self.R
        return (R[i0, j0] * (1 - fx) * (1 - fy) + R[i1, j0] * fx * (1 - fy) + R[i0, j1] * (1 - fx) * fy + R[i1, j1] * fx * fy)

    def point(self, th, ph, off=0.0):
        d = dir_tp(th, ph)
        return self.c + d * (self.r(th, ph) + off)

    def phi_at_y(self, th, y):
        lo, hi = self.phs[0], 89.5
        for _ in range(36):
            mid = (lo + hi) / 2
            if self.point(th, mid)[1] > y: hi = mid
            else: lo = mid
        return (lo + hi) / 2


def hair_shell(SC, edge_y, thick, *, n_mer=72, rings=16, mat='hair', theta_range=None, fade=0.2, edge_off=0.012,
               sink=0.035, hang_y=None, flare=0.0, clear=None, dens=None, clumps=0, clump_amp=None, tips=None,
               u_tiles=6.0, tip_wall=0.05, v_root=1.0, wave=None, extra=None, v_hairline=0.18):
    """Smooth hair over the scalp with UVs for a strand texture. Meridians run from the
    crown to edge_y(theta); u runs round the head, v from the root (1) to the tip (0),
    so the ragged tip rows of the texture land on the hairline and the hanging ends.
    clumps > 0 swells the surface in that many soft chunks round the head; tips(theta)
    lets the chunk centres hang lower than the gaps. With fade the hair thins down to
    edge_off at the hairline and a wall runs under the skin, so no gap shows."""
    part = Part(mat)
    full = theta_range is None
    thetas = [360.0 * j / n_mer for j in range(n_mer + 1)] if full else list(np.linspace(theta_range[0], theta_range[1], n_mer))
    m = len(thetas)
    grid = []
    for j, th in enumerate(thetas):
        a = ((th + 180) % 360) - 180
        cl = 0.5 - 0.5 * math.cos(2 * math.pi * clumps * th / 360.0) if clumps else 0.0
        fd = fade(abs(a)) if callable(fade) else fade
        ey = edge_y(abs(a))
        if tips is not None: ey -= tips(abs(a)) * cl
        pe = SC.phi_at_y(a, ey)
        col, hang_r, pts = [], None, []
        hanging = hang_y is not None and ey < hang_y - 0.05
        if hanging:
            ph_h = SC.phi_at_y(a, hang_y)
            n_s = max(5, int(rings * 0.45)); n_h = rings - n_s
        for i in range(0, rings + 1):
            t = max(i / rings, 0.04)
            if hanging and i > n_s:
                y = hang_y - (hang_y - ey) * (i - n_s) / n_h
                ph = ph_h
            elif hanging:
                ph = 89.5 - max(i / n_s, 0.04) * (89.5 - ph_h); y = None
            else:
                ph = 89.5 - t * (89.5 - pe); y = None
            off = thick(abs(a), t)
            if clump_amp is not None: off += clump_amp(abs(a), t) * cl
            if wave is not None: off += wave(abs(a), t)
            if extra is not None: off += extra(SC.point(a, ph, 0.0))
            if fd:
                k = smooth(1 - fd, 1.0, t)
                off = off * (1 - k) + edge_off * k
            if y is None:
                q = SC.point(a, ph, off)
                if hang_y is not None:
                    rr = math.hypot(q[0] - SC.c[0], q[2] - SC.c[2])
                    if q[1] >= hang_y or hang_r is None: hang_r = rr
                    else:
                        r_need = hang_r * (1 + flare * (hang_y - q[1]))
                        if clear is not None: r_need = max(r_need, clear(a, q[1]) + off)
                        q = np.array([SC.c[0] + math.sin(math.radians(a)) * r_need, q[1], SC.c[2] + math.cos(math.radians(a)) * r_need])
            else:
                if hang_r is None: hang_r = math.hypot(*(SC.point(a, ph_h, off)[[0, 2]] - SC.c[[0, 2]]))
                r_need = hang_r * (1 + flare * (hang_y - y))
                if clear is not None: r_need = max(r_need, clear(a, y) + off)
                q = np.array([SC.c[0] + math.sin(math.radians(a)) * r_need, y, SC.c[2] + math.cos(math.radians(a)) * r_need])
            pts.append(q)
        for i, q in enumerate(pts):
            nxt = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]; nxt = nxt / (np.linalg.norm(nxt) + 1e-9)
            t = i / rings
            dv = dens(abs(a), t) if dens else 1.0
            v_end = v_hairline if fd else 0.0       # hairlines stop above the ragged tip rows
            col.append(part.add(q, 0.96 + 0.08 * cl, dv, (u_tiles * j / max(1, m - 1), v_end + (v_root - v_end) * (1 - t)), nxt))
        if fd:
            q = SC.point(a, pe, -sink)
            col.append(part.add(q, 0.6, 0.0, (u_tiles * j / max(1, m - 1), v_hairline), (0, -1.0, 0)))
        else:
            qe = pts[-1]; inward = np.array([qe[0] - SC.c[0], 0, qe[2] - SC.c[2]]); inward /= (np.linalg.norm(inward) + 1e-9)
            col.append(part.add(qe - inward * tip_wall + np.array([0, 0.03, 0]), 0.6, 0.0, (u_tiles * j / max(1, m - 1), 0.0), (0, -1.0, 0)))
        grid.append(col)
    pairs = range(m - 1)
    rows = len(grid[0])
    for j in pairs:
        k = j + 1
        for i in range(rows - 1):
            part.quad(grid[j][i], grid[k][i], grid[k][i + 1], grid[j][i + 1])
    # the crown: a small fan closing the hole at the top
    top = part.add(SC.point(0, 89.9, thick(0, 0)), 1.0, dens(0, 0) if dens else 1.0, (u_tiles * 0.5, v_root), (0, 0, -1.0))
    if full:
        for j in pairs: part.tri(top, grid[j + 1][0], grid[j][0])
    return part
