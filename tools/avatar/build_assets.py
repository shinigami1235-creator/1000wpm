"""Build assets/avatar/avatar.glb: the faceted head and bust with slider morph targets,
the crease lines, and every prop bound to the head surface.
Usage: python3 build_assets.py HEAD_NPZ OUT_GLB [preview_npz]"""
import os, sys, math, json, heapq, numpy as np
from collections import defaultdict, Counter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from mhlib import load_obj, load_target
from morphs import SLIDERS, dense_deltas
from geom import *
from gltf_writer import GLB, FLOAT, U8, U16

HEAD, OUT = sys.argv[1], sys.argv[2]
CUT_Y, SIDE_X = 4.62, 1.72
GAIN = {'jawW': 2.2, 'jawA': 1.2, 'cheekH': 3.2, 'eyeD': 3.0, 'chinW-': 1.8, 'chinW+': 1.5, 'cheekW-': 1.6, 'cheekW+': 1.2, 'eyeS': 2.2, 'eyeT': 3.4,
        'noseB': 1.8, 'noseT-': 1.1, 'noseT+': 3.0, 'browD-': 1.6, 'browD+': 0.45, 'browH': 1.2,
        'lips-': 1.2, 'lips+': 1.4, 'neck': 2.0, 'noseW': 1.4, 'noseL': 1.3, 'ears': 1.2}

V, F, G = load_obj(); NB = len(V)
SEX_EXTRA = {
    '-': [('chin/chin-bones-incr', 0.6), ('eyebrows/eyebrows-trans-forward', 0.35), ('chin/chin-width-incr', 0.5), ('nose/nose-scale-horiz-incr', 0.3),
          ('neck/neck-scale-horiz-incr', 0.6), ('neck/neck-scale-depth-incr', 0.4), ('head/head-square', 0.35)],
    '+': [('chin/chin-bones-decr', 0.5), ('eyebrows/eyebrows-trans-backward', 0.5), ('mouth/mouth-upperlip-volume-incr', 0.5), ('mouth/mouth-lowerlip-volume-incr', 0.5),
          ('nose/nose-scale-horiz-decr', 0.4), ('nose/nose-point-up', 0.4), ('l-eye-scale-incr', 0), ('neck/neck-scale-horiz-decr', 0.6), ('chin/chin-width-decr', 0.4)],
}
SEX_EXTRA['+'] = [x for x in SEX_EXTRA['+'] if x[1]] + [('eyes/l-eye-scale-incr', 0.8), ('eyes/r-eye-scale-incr', 0.8)]
neu = np.load(os.path.join(HERE, 'neu.npy')); male = np.load(os.path.join(HERE, 'male.npy')); fem = np.load(os.path.join(HERE, 'fem.npy'))
h = np.load(HEAD)
hv, hf, bidx, bw = list(h['verts']), [tuple(t) for t in h['faces']], h['bidx'], h['bw']
n_skin = len(hv)

# ---------- caps over the three cuts ----------
ec = Counter()
for a, b, c in hf:
    for e in ((a, b), (b, c), (c, a)): ec[tuple(sorted(e))] += 1
bnd = [e for e, k in ec.items() if k == 1]
bverts = sorted({v for e in bnd for v in e})
cap_tris, cap_src = [], []          # cap_src: for each new centre vertex, the loop it averages
edge_dir = {}
for a, b, c in hf:
    for x, y in ((a, b), (b, c), (c, a)):
        if tuple(sorted((x, y))) in set(bnd): edge_dir[(x, y)] = True
bset = set(bnd)
for plane in ('bottom', 'left', 'right'):
    if plane == 'bottom': on = lambda p: abs(p[1] - CUT_Y) < 2e-3
    elif plane == 'left': on = lambda p: abs(p[0] - SIDE_X) < 2e-3
    else: on = lambda p: abs(p[0] + SIDE_X) < 2e-3
    loop_edges = [(x, y) for (x, y) in edge_dir if on(hv[x]) and on(hv[y])]
    vs = sorted({v for e in loop_edges for v in e})
    if not vs: continue
    cen = np.mean([hv[v] for v in vs], 0)
    ci = len(hv); hv.append(cen); cap_src.append((ci, vs))
    for x, y in loop_edges:          # boundary edge x->y belongs to a face wound x,y,..; cap uses y,x
        cap_tris.append((y, x, ci))
# close the chord where the bottom cap meets each shoulder cap
def oriented(a, b, c, want):
    n = np.cross(np.asarray(hv[b]) - hv[a], np.asarray(hv[c]) - hv[a])
    return (a, b, c) if n @ want > 0 else (a, c, b)
bottom = next((ci, vs) for ci, vs in cap_src if abs(hv[ci][1] - CUT_Y) < 1e-3)
for ci, vs in cap_src:
    if ci == bottom[0]: continue
    corners = sorted(set(vs) & set(bottom[1]))
    if len(corners) != 2: print('corner count', len(corners)); continue
    a, b = corners
    cap_tris.append(oriented(a, b, bottom[0], np.array([0, -1.0, 0])))
    cap_tris.append(oriented(a, b, ci, np.array([np.sign(hv[ci][0]), 0, 0])))
print('caps', len(cap_tris), 'boundary edges', len(bnd))

# ---------- eyes ----------
def group_faces(name):
    return [f for f, g in zip(F, G) if g == name]
eye_tris, eye_orig = {'sclera': [], 'iris': []}, []
eye_map = {}
for side in ('l', 'r'):
    fs = group_faces(f'helper-{side}-eye')
    idx = sorted({i for f in fs for i in f})
    for i in idx:
        eye_map[i] = len(hv); hv.append(neu[i].copy()); eye_orig.append(i)
    cen = neu[idx].mean(0)
    for f in fs:
        q = [eye_map[i] for i in f]
        fc = np.mean([hv[i] for i in q], 0)
        d = (fc - cen); d /= np.linalg.norm(d)
        fwd = np.array([0.08 if side == 'l' else -0.08, 0, 1.0]); fwd /= np.linalg.norm(fwd)
        mat = 'iris' if d @ fwd > 0.86 else 'sclera'
        for t in ((q[0], q[1], q[2]), (q[0], q[2], q[3])):
            eye_tris[mat].append(t)
hv = np.array(hv)
NV = len(hv)
print('head verts', NV, 'skin tris', len(hf), 'cap', len(cap_tris), 'eyes', sum(len(v) for v in eye_tris.values()))

# ---------- morphs ----------
morph_names, morph_data = [], []
for sid, label, grp, neg, pos in SLIDERS:
    for sign, spec in (('-', neg), ('+', pos)):
        D = dense_deltas(spec, V, F, G, neu, male, fem) * GAIN.get(sid + sign, GAIN.get(sid, 1.0))
        if sid == 'jawA':          # keep head-square and head-round to the jaw
            D = D * np.array([smooth(7.2, 6.8, y) for y in neu[:, 1]])[:, None]
        if sid == 'sex':           # push the face shapes that read as masculine or feminine
            extra = SEX_EXTRA[sign]
            for t, gn in extra: D = D + load_target(t, NB) * gn
        out = np.zeros((NV, 3))
        out[:n_skin] = (D[bidx] * bw[:, :, None]).sum(1)
        for ci, vs in cap_src: out[ci] = out[vs].mean(0)
        for o, k in eye_map.items(): out[k] = D[o]
        out[np.abs(out).max(1) < 0.002] = 0
        morph_names.append(sid + sign); morph_data.append(out)

skin_tris = np.array(hf)
S = Surface(hv[:n_skin], skin_tris)
# a second surface including the caps, for binding props that reach the cut
S_all = Surface(hv[:n_skin + len(cap_src)], np.array(hf + cap_tris))

# ---------- crease lines on the face ----------
adj = defaultdict(list)
face_of_edge = defaultdict(list)
for fi, (a, b, c) in enumerate(hf):
    for x, y in ((a, b), (b, c), (c, a)): face_of_edge[tuple(sorted((x, y)))].append(fi)
def dihedral(e):
    fs = face_of_edge[e]
    if len(fs) != 2: return 0.0
    return math.degrees(math.acos(np.clip(S.fn[fs[0]] @ S.fn[fs[1]], -1, 1)))
for e in face_of_edge:
    a, b = e; L = np.linalg.norm(hv[a] - hv[b]); s = min(1.0, dihedral(e) / 30.0)
    cost = L * (1 + 1.6 * (1 - s))
    adj[a].append((b, cost)); adj[b].append((a, cost))
def nearest_v(p):
    d = np.linalg.norm(hv[:n_skin] - np.asarray(p), axis=1); return int(np.argmin(d))
def path(a, b):
    dist = {a: 0}; prev = {}; pq = [(0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b: break
        if d > dist[u]: continue
        for v, c in adj[u]:
            nd = d + c
            if nd < dist.get(v, 1e9): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    out = [b]
    while out[-1] != a: out.append(prev[out[-1]])
    return out[::-1]
CHAINS = {
    'jaw': [(0.66, 6.9, 0.36), (0.63, 6.7, 0.42), (0.58, 6.5, 0.55), (0.5, 6.4, 0.78), (0.36, 6.32, 1.02), (0.18, 6.28, 1.2), (0.0, 6.27, 1.28)],
    'cheek': [(0.42, 7.08, 1.1), (0.55, 7.12, 0.95), (0.64, 7.2, 0.75), (0.69, 7.3, 0.55)],
    'nose': [(0.07, 7.36, 1.25), (0.08, 7.2, 1.33), (0.1, 7.06, 1.4)],
}
head_lines = set()
for e in bnd: head_lines.add(e)
head_lines = sorted(head_lines)
print('head line edges', len(head_lines))

# ---------- landmarks ----------
eyeL = neu[[i for i in eye_orig if neu[i][0] > 0]].mean(0); eyeR = eyeL * [-1, 1, 1]
ear_v = [i for i in range(n_skin) if hv[i][0] > 0.7 and 6.8 < hv[i][1] < 7.55 and 0.05 < hv[i][2] < 0.75]
ear_c = hv[ear_v].mean(0); lobe = hv[ear_v[int(np.argmin(hv[ear_v][:, 1]))]]
ear_out = hv[ear_v][:, 0].max()
print('eye', eyeL.round(3), 'ear', ear_c.round(3), 'lobe', lobe.round(3), 'ear x', round(ear_out, 3))

# ---------- props ----------
def push_out(part, gap, surf=None):
    surf = surf or S_all
    for i, v in enumerate(part.v):
        q, fi, d = surf.nearest(v)
        n = surf.normal_at(v)
        side = (v - q) @ n
        if side < gap: part.v[i] = q + n * gap
    return part

PROPS = {}
def prop(pid, *parts): PROPS[pid] = [p for p in parts if p is not None and (len(p.t) or p.extra_lines)]

HL = [(0, 8.04), (15, 8.02), (30, 7.98), (45, 7.86), (60, 7.48), (75, 7.62), (90, 7.62), (105, 7.56), (120, 7.42), (135, 7.22), (150, 7.05), (165, 6.97), (180, 6.95)]
hairline = lambda a: table(HL, a)

# brows: a short faceted strip over each brow ridge
def brow(sx, fem=False):
    us = np.linspace(0, 1, 7)
    BY = [(0, 7.53), (0.35, 7.6), (0.65, 7.64), (1.0, 7.57)] if fem else [(0, 7.515), (0.35, 7.585), (0.65, 7.615), (1.0, 7.56)]
    BW = [(0, 0.022), (0.5, 0.017), (1.0, 0.008)] if fem else [(0, 0.032), (0.5, 0.028), (1.0, 0.013)]
    pts, half, nor = [], [], []
    for u in us:
        x = sx * (0.085 + 0.47 * u); y = table(BY, u)
        p = S.in_ray(np.array([x, y, 0.3]), np.array([0, 0.05, 1.0]))
        n = S.normal_at(p)
        up = np.array([0, 1.0, 0]); up = up - n * (up @ n); up /= np.linalg.norm(up)
        pts.append(p); half.append(up * table(BW, u)); nor.append(n)
    return slab(pts, half, nor, [0.016] * 7, [0.012] * 7, 'brow')
PROPS['brows'] = [brow(1).merge(brow(-1))]
PROPS['brows-f'] = [brow(1, True).merge(brow(-1, True))]
def lashes(sx):
    pts, half, nor = [], [], []
    for u in np.linspace(0, 1, 6):
        x = sx * (0.165 + 0.27 * u)
        y = 7.5
        while y > 7.25:
            h = S.ray(np.array([x, y, 3.0]), np.array([0, 0, -1.0]), 5)
            if h is None or h[0][2] < 1.12: break
            y -= 0.004
        p = np.array([x, y + 0.01 + 0.02 * u ** 3, 0.0]); h = S.ray(np.array([x, y + 0.012, 3.0]), np.array([0, 0, -1.0]), 5)
        p = h[0] if h else np.array([x, y + 0.012, 1.15])
        p = p + np.array([0, 0.012 * u ** 2, 0.008])
        n = np.array([0, 0.15, 1.0]); n /= np.linalg.norm(n)
        pts.append(p); half.append(np.array([0, 0.011 + 0.006 * u, 0])); nor.append(n)
    return slab(pts, half, nor, [0.012] * 6, [0.01] * 6, 'brow')
PROPS['lashes'] = [lashes(1).merge(lashes(-1))]
PROPS['lashes'][0].nolines = True
def surf_curve(wps, step=0.05, lift=0.012):
    W = [np.asarray(w, float) for w in wps]
    W = [W[0] * 2 - W[1]] + W + [W[-1] * 2 - W[-2]]
    pts = []
    for i in range(1, len(W) - 2):
        p0, p1, p2, p3 = W[i - 1], W[i], W[i + 1], W[i + 2]
        n = max(2, int(np.linalg.norm(p2 - p1) / step))
        for k in range(n):
            t = k / n
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            pts.append(q)
    pts.append(W[-2])
    part = Part('line')
    ids = []
    for q in pts:
        p, fi, d = S.nearest(q)
        ids.append(part.add(p + S.normal_at(p) * lift))
    part.extra_lines = list(zip(ids, ids[1:]))
    return part
JAW = [(0.67, 6.92, 0.34), (0.62, 6.62, 0.45), (0.5, 6.42, 0.76), (0.3, 6.31, 1.08), (0.0, 6.265, 1.29)]
face_lines = surf_curve(JAW + [(-x, y, z) for x, y, z in JAW[::-1][1:]])
faint = Part('line2')
for sx in (1, -1):
    m = lambda pts: [(sx * x, y, z) for x, y, z in pts]
    faint.merge(surf_curve(m([(0.41, 7.03, 1.13), (0.52, 7.07, 1.02), (0.63, 7.14, 0.84)]), step=0.07))
    faint.merge(surf_curve(m([(0.5, 7.63, 1.13), (0.6, 7.56, 0.95), (0.66, 7.44, 0.76)]), step=0.07))
faint.merge(surf_curve([(0, 7.38, 1.32), (0, 7.24, 1.38), (0, 7.1, 1.45)], step=0.1, lift=0.012))
faint.mat = 'line2'
PROPS['face-lines'] = [face_lines, faint]

# --- hair ---
prop('hair-buzz', shell(S, 24, 7, hairline, lambda a, t, p: 0.045, mat='hair'))
und_end = lambda a: table([(0, 7.99), (40, 8.0), (90, 8.02), (140, 7.88), (180, 7.8)], a)
prop('hair-undercut',
     shell(S, 24, 7, hairline, lambda a, t, p: 0.038, mat='stubble'),
     shell(S, 24, 5, und_end, lambda a, t, p: 0.1 + 0.1 * (1 - t) ** 0.7 + 0.1 * max(0, math.cos(math.radians(a))) ** 3 * (1 - abs(t - 0.75) * 1.5), mat='hair', crease=None))
prop('hair-slick', shell(S, 24, 7, lambda a: hairline(a) - 0.02, lambda a, t, p: 0.06 + 0.2 * max(0, math.cos(math.radians(a))) ** 1.5 * math.sin(math.pi * min(1, t * 1.15)) ** 0.8 + 0.05 * (1 - t) + 0.02 * (round(a / 15) % 2), mat='hair', crease=None))
bob_end = lambda a: table([(0, 7.74), (25, 7.72), (40, 7.3), (55, 6.7), (180, 6.62)], a)
prop('hair-bob', shell(S, 24, 8, bob_end, lambda a, t, p: 0.09 + 0.05 * (1 - t), hang_y=7.4, flare=0.12, mat='hair', crease=None))
# long hair tied back: a tight shell and a ponytail
pony_path = [(0, 8.12, -0.5), (0, 8.2, -0.7), (0, 7.98, -0.88), (0, 7.55, -0.9), (0, 7.1, -0.86), (0, 6.65, -0.8), (0, 6.25, -0.74)]
pony = tube(pony_path, [0.12, 0.19, 0.22, 0.21, 0.17, 0.11, 0.04], sides=7, mat='hair', twist=0.35, crease=None)
for sx in (1, -1):
    strand = [np.array([sx * 0.6, 7.86, 0.78]), np.array([sx * 0.7, 7.45, 0.8]), np.array([sx * 0.7, 7.05, 0.78]), np.array([sx * 0.64, 6.75, 0.8])]
    st = tube(strand, [0.1, 0.095, 0.075, 0.03], sides=5, mat='hair', crease=None)
    pony.merge(push_out(st, 0.06))
tie, tie_cap = cylinder(np.array(pony_path[0]) * 0.55 + np.array(pony_path[1]) * 0.45, np.array(pony_path[1]) - np.array(pony_path[0]), 0.13, 0.05, 6, 'glow', 'glow', crease=None)
prop('hair-long', shell(S, 24, 6, lambda a: hairline(a) - 0.01, lambda a, t, p: 0.06 + 0.05 * (1 - t), mat='hair'), pony, tie.merge(tie_cap))
# mohawk: shaved sides and a crest of spikes along the middle of the scalp
def crest():
    part = Part('hair', crease=None)
    alphas = np.linspace(58, 205, 15)
    rows = []
    for k, al in enumerate(alphas):
        d = np.array([0, math.sin(math.radians(al)), math.cos(math.radians(al))])
        p = S.out_ray(C, d)
        n = d
        tang = np.cross(np.array([1.0, 0, 0]), n)
        spike = (k % 2 == 1)
        hgt = (0.56 if spike else 0.3) * (0.5 + 0.5 * math.sin(math.pi * (al - 58) / 147))
        w = 0.13 * (0.6 + 0.4 * math.sin(math.pi * (al - 58) / 147))
        tip = p + n * hgt - tang * (0.08 if spike else 0.0)
        rows.append((part.add(p + n * 0.01 + np.array([w, 0, 0])), part.add(p + n * 0.01 - np.array([w, 0, 0])), part.add(tip)))
    for (l0, r0, t0), (l1, r1, t1) in zip(rows, rows[1:]):
        part.quad(l0, l1, t1, t0); part.quad(r0, t0, t1, r1)
    l, r, t = rows[0]; part.tri(l, t, r)
    l, r, t = rows[-1]; part.tri(l, r, t)
    return part
prop('hair-mohawk', shell(S, 24, 7, hairline, lambda a, t, p: 0.036, mat='stubble'), crest())
# braids: tight shell, two braids of beads from behind the ears down over the shoulders
def braid(sx):
    pts = [(0.56, 7.2, -0.32), (0.66, 6.85, -0.26), (0.76, 6.45, -0.1), (0.86, 6.05, 0.1), (0.92, 5.7, 0.26), (0.94, 5.38, 0.36), (0.95, 5.12, 0.4)]
    part = Part('hair', crease=None)
    prev = None
    for k, p in enumerate(pts):
        p = np.array([p[0] * sx, p[1], p[2]])
        q, fi, d = S_all.nearest(p)
        n = S_all.normal_at(p) if True else None
        if d < 0.11 or (p - q) @ n < 0: p = q + n * 0.11
        pts[k] = p
    for k in range(len(pts) - 1):
        a, b = pts[k], pts[k + 1]
        for j in range(2):
            c = a + (b - a) * (0.25 + 0.5 * j)
            r = 0.11 * (1 - 0.35 * k / len(pts))
            part.merge(octa(c, b - a, np.linalg.norm(b - a) * 0.34, r, 'hair', twist=0.6 * (j + k)))
    end = octa(pts[-1], pts[-1] - pts[-2], 0.05, 0.045, 'glow')
    return part, end
b1, e1 = braid(1); b2, e2 = braid(-1)
prop('hair-braids', shell(S, 24, 7, hairline, lambda a, t, p: 0.05, mat='hair'), b1.merge(b2), e1.merge(e2))
# hood: rings around the face direction, so the opening is one clean curve
def hood():
    d0 = dir_tp(0, -10); e1 = np.array([1.0, 0, 0]); e2 = np.cross(d0, e1); e2 /= np.linalg.norm(e2)
    oms = np.linspace(-126, 126, 25)
    po_t = [(0, 41), (50, 46), (95, 52), (126, 60)]
    rings = 9
    part = Part('cloth', crease=None)
    grid, lip = [], []
    for om0 in oms:
        po = table(po_t, abs(om0)); col = []
        for i in range(rings + 1):
            t = i / rings
            psi = po + (172 - po) * t ** 0.85
            om = om0 * (126 + 54 * smooth(70, 150, psi)) / 126
            dv = math.cos(math.radians(psi)) * d0 + math.sin(math.radians(psi)) * (math.cos(math.radians(om)) * e2 + math.sin(math.radians(om)) * e1)
            p = S_all.out_ray(C, dv)
            if p is None: p = C + dv * 0.9
            off = 0.29 + 0.09 * math.sin(math.pi * t) + 0.12 * math.exp(-(om / 22) ** 2) * math.exp(-((t - 0.28) / 0.14) ** 2)
            q = p + dv * off
            if q[1] < 7.15:
                r = math.hypot(q[0], q[2] - 0.15); need = 0.98 + 0.25 * smooth(7.15, 6.3, q[1])
                if r < need:
                    k = need / max(r, 1e-6); q = np.array([q[0] * k, q[1], 0.15 + (q[2] - 0.15) * k])
            col.append(part.add(q))
        grid.append(col)
        # rolled hem along the opening
        q0 = part.v[col[0]]
        om = om0; psi = po
        dv = math.cos(math.radians(psi)) * d0 + math.sin(math.radians(psi)) * (math.cos(math.radians(om)) * e2 + math.sin(math.radians(om)) * e1)
        lip.append(part.add(q0 - dv * 0 + (C - q0) * 0.06 + d0 * 0.03))
    for j in range(len(oms) - 1):
        for i in range(rings):
            part.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1])
        part.quad(lip[j], lip[j + 1], grid[j + 1][0], grid[j][0])
    # the two ends of the hood meet behind the neck, so close the gap there
    for i in range(rings):
        t = i / rings
        if 106 <= table(po_t, 126) + (172 - table(po_t, 126)) * t ** 0.85:
            part.quad(grid[-1][i], grid[0][i], grid[0][i + 1], grid[-1][i + 1])
    back = -d0; pb = S_all.out_ray(C, back)
    pole = part.add(pb + back * 0.32)
    for j in range(len(oms) - 1): part.tri(grid[j][-1], grid[j + 1][-1], pole)
    part.tri(grid[-1][-1], grid[0][-1], pole)
    return part
prop('hair-hood', hood())

# --- facial hair ---
mouth = lambda p: ((p[0] / 0.235) ** 2 + ((p[1] - 6.665) / 0.075) ** 2 < 1) and p[2] > 1.05
cheek_line = lambda x: table([(0.0, 6.8), (0.24, 6.8), (0.45, 7.02), (0.66, 7.3), (2, 7.3)], abs(x))
def beard_area(p, low=6.12):
    under = p[1] < 6.5 and p[2] < 0.55 + 0.6 * smooth(6.5, 6.2, p[1]) * 0
    return p[1] < cheek_line(p[0]) and p[1] > low and p[2] > 0.3 and not mouth(p) and not (abs(p[0]) < 0.2 and p[1] > 6.86) and not (p[1] < 6.55 and p[2] < 0.5)
prop('fh-stubble', region_shell(S, lambda p: beard_area(p) and (p[2] > 0.5 or p[1] > 6.45), lambda p: 0.012, 'stubble', wall=False))
PROPS['fh-stubble'][0].nolines = True
def moustache():
    pts, half, nor = [], [], []
    for u in np.linspace(-1, 1, 7):
        x = 0.27 * u; y = 6.755 - 0.07 * abs(u) ** 2.2
        p = S.in_ray(np.array([x, y, 0.4]), np.array([0, 0, 1.0])); n = S.normal_at(p)
        up = np.array([0, 1.0, 0]); up = up - n * (up @ n); up /= np.linalg.norm(up)
        pts.append(p); half.append(up * (0.04 - 0.012 * abs(u))); nor.append(n)
    return slab(pts, half, nor, [0.04] * 7, [0.035] * 7, 'hair', crease=None)
prop('fh-moustache', moustache())
PROPS['fh-moustache'][0].nolines = True
chin_area = lambda p: (abs(p[0]) < 0.22 - 0.25 * max(0, 6.45 - p[1]) and 6.2 < p[1] < 6.6 and p[2] > 0.95 and not mouth(p)) or (0.15 < abs(p[0]) < 0.27 and 6.55 < p[1] < 6.78 and p[2] > 1.0 and not mouth(p))
prop('fh-goatee', region_shell(S, chin_area, lambda p: 0.03 + 0.03 * smooth(6.55, 6.25, p[1]), 'hair'), moustache())
for _p in PROPS['fh-goatee']: _p.nolines = True
prop('fh-beard', region_shell(S, lambda p: beard_area(p, 6.05), lambda p: 0.035 + 0.08 * smooth(6.75, 6.2, p[1]) * smooth(0.0, 0.8, p[2]), 'hair', crease=None), moustache())
for _p in PROPS['fh-beard']: _p.nolines = True

# --- gear ---
def horiz(y, a, off, centre_z=0.28):
    d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
    p = S.out_ray(np.array([0, y, centre_z]), d)
    return p + d * off
def band(ys, a0, a1, n, off, mat, crease=None, closed=False):
    part = Part(mat, crease)
    angs = list(np.linspace(a0, a1, n, endpoint=not closed))
    grid = [[part.add(horiz(y, a, off(a, y) if callable(off) else off)) for a in angs] for y in ys]
    m = len(angs)
    for i in range(len(ys) - 1):
        for j in range(m if closed else m - 1):
            k = (j + 1) % m
            part.quad(grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j])
    return part
def visor():
    lens = Part('lens', crease=None); frame = Part('gear', crease=20)
    rows = [7.2, 7.36, 7.54]
    angs = np.linspace(-80, 80, 13)
    g = []
    for k, y in enumerate(rows):
        a_ax, b_ax = 0.84 - 0.02 * k, 1.24 - 0.04 * k
        g.append([lens.add(np.array([a_ax * math.sin(math.radians(a)), y, 0.28 + b_ax * math.cos(math.radians(a))])) for a in angs])
    for i in range(len(rows) - 1):
        for j in range(len(angs) - 1): lens.quad(g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j])
    for row, dy in ((g[0], -0.035), (g[-1], 0.035)):
        top = [frame.add(lens.v[i]) for i in row]; out = [frame.add(lens.v[i] + np.array([0, dy, 0])) for i in row]
        for j in range(len(row) - 1): frame.quad(top[j], top[j + 1], out[j + 1], out[j])
    # temple arms back to the head
    arm = []
    for s in (-1, 1):
        a = 80 * s
        p0 = np.array([0.84 * math.sin(math.radians(a)), 7.37, 0.28 + 1.24 * math.cos(math.radians(a))])
        p1 = horiz(7.38, 95 * s, 0.02)
        arm.append(tube([p0, (p0 + p1) / 2, p1], [0.03, 0.03, 0.03], 4, 'gear', crease=None))
    return [lens, frame] + arm
prop('gear-visor', *visor())
def goggles():
    parts = []
    for c in (eyeL, eyeR):
        cc = c + np.array([0.0, 0.01, 0.2])
        ring, cap = cylinder(cc, np.array([0.12 * np.sign(c[0]), 0, 1.0]), 0.17, 0.13, 8, 'gear', 'lens', crease=30)
        parts += [ring, cap]
    bridge = tube([eyeL + [-0.13, 0.03, 0.27], eyeR + [0.13, 0.03, 0.27]], [0.025, 0.025], 4, 'gear')
    strap = band([7.34, 7.46], 52, 308, 15, 0.025, 'gear', crease=None)
    return parts + [bridge, strap]
prop('gear-goggles', *goggles())
def respirator():
    mask = Part('gear', crease=28)
    angs = np.linspace(-58, 58, 9); ys = [6.28, 6.48, 6.68, 6.88, 7.06]
    grid = []
    for y in ys:
        row = []
        for a in angs:
            d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
            p = S.out_ray(np.array([0, y, 0.15]), d)
            r = np.linalg.norm((p - [0, y, 0.15])[[0, 2]]) + 0.14
            r = max(r, 1.62 * math.cos(math.radians(a)) ** 3 * (0.75 + 0.25 * smooth(6.3, 6.95, y)))
            row.append(mask.add(np.array([0, y, 0.15]) + d * r))
        grid.append(row)
    for i in range(len(ys) - 1):
        for j in range(len(angs) - 1): mask.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
    push_out(mask, 0.09)
    parts = [mask]
    for s in (-1, 1):
        a = 38 * s; d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
        base = mask.v[grid[2][4 + 2 * s]]
        cyl, cap = cylinder(base + d * 0.06, d + np.array([0, -0.15, 0.25]), 0.12, 0.16, 8, 'gear', 'glow', crease=30)
        parts += [cyl, cap]
    parts.append(band([6.78, 6.86], 66, 294, 13, 0.02, 'gear', crease=None))
    return parts
prop('gear-respirator', *respirator())
def headset():
    parts = []
    for s in (1, -1):
        c = np.array([ear_c[0] * s + 0.13 * s, ear_c[1], ear_c[2]])
        cup, cap = cylinder(c, np.array([s, 0, 0]), 0.27, 0.16, 8, 'gear', 'gear', crease=30)
        ring, rcap = cylinder(c + np.array([0.09 * s, 0, 0]), np.array([s, 0, 0]), 0.18, 0.03, 8, 'glow', 'glow', crease=None)
        parts += [cup, cap, ring, rcap]
    pts, half, nor = [], [], []
    for b in np.linspace(-78, 78, 11):
        d = np.array([math.sin(math.radians(b)), math.cos(math.radians(b)), 0]); o = np.array([0, 7.45, ear_c[2]])
        p = S.out_ray(o, d); pts.append(p); half.append(np.array([0, 0, 0.065])); nor.append(d)
    parts.append(slab(pts, half, nor, [0.07] * 11, [0.035] * 11, 'gear', crease=20))
    m0 = np.array([ear_c[0] + 0.2, ear_c[1] - 0.12, ear_c[2] + 0.18])
    mic = tube([m0, (0.78, 6.78, 0.95), (0.55, 6.66, 1.24), (0.33, 6.64, 1.38)], [0.024] * 4, 5, 'gear')
    parts += [mic, octa(np.array([0.3, 6.64, 1.4]), [-1, 0, 0.3], 0.06, 0.04, 'glow')]
    return parts
prop('gear-headset', *headset())
def implant():
    c2 = eyeL[[0, 1]]
    plate = Part('gear', crease=None)
    rings = []
    for rad in (0.15, 0.27):
        row = []
        for k in range(10):
            a = 2 * math.pi * k / 10
            q = np.array([c2[0] + rad * math.cos(a) * 1.05, c2[1] + rad * math.sin(a) * 0.9, 0.3])
            p = S.in_ray(q, np.array([0.25, 0, 1.0]))
            row.append(plate.add(p + S.normal_at(p) * 0.045))
        rings.append(row)
    for k in range(10):
        j = (k + 1) % 10; plate.quad(rings[0][k], rings[0][j], rings[1][j], rings[1][k])
    push_out(plate, 0.035, S)
    lens, cap = cylinder(eyeL + np.array([0.01, 0, 0.09]), np.array([0.1, 0, 1.0]), 0.105, 0.05, 8, 'gear', 'glow', crease=None)
    stud = [octa(eyeL + np.array([0.27 * math.cos(a), 0.22 * math.sin(a), 0.0]) + [0, 0, -0.12 + 0.06 * math.cos(a)], [0, 0, 1], 0.03, 0.025, 'glow') for a in (0.6, 2.4, 4.4)]
    st = stud[0].merge(stud[1]).merge(stud[2])
    for p in st.v: pass
    return [plate, lens, cap, st]
prop('gear-implant', *implant())
def bandana(off):
    b = band([7.76, 7.88, 8.0], 0, 360, 24, lambda a, y: off + 0.01 * (y > 7.85), 'cloth2', crease=None, closed=True)
    knot = horiz(7.88, 180, off + 0.03)
    tails = []
    for s in (-1, 1):
        pts = [knot, knot + np.array([0.08 * s, -0.25, -0.07]), knot + np.array([0.16 * s, -0.55, -0.1])]
        tails.append(slab(pts, [np.array([0, 0.05, 0.0]), np.array([0.0, 0.0, 0.07]), np.array([0, 0, 0.09])], [np.array([0, 0, -1.0])] * 3, [0.0] * 3, [0.02] * 3, 'cloth2'))
    return [b] + tails + [octa(knot + [0, 0, -0.03], [0, 1, 0], 0.07, 0.07, 'cloth2')]
prop('gear-bandana', *bandana(0.035))
prop('gear-bandana-loose', *bandana(0.15))
def cap(off):
    cend = lambda a: table([(0, 7.98), (60, 7.78), (100, 7.62), (180, 7.48)], a)
    dome = shell(S, 24, 5, cend, lambda a, t, p: off, mat='cloth2', crease=None, close=True)
    brim = Part('cloth2', crease=None)
    angs = np.linspace(-70, 70, 9)
    inner, outer = [], []
    for a in angs:
        pe = meridian_end(S, a, cend(abs(a)))
        d = dir_tp(a, pe); p = S.out_ray(C, d) + d * off
        fwd = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
        L = 0.62 * math.cos(math.radians(a) * 1.25) ** 0.6
        inner.append(p); outer.append(p + fwd * L + np.array([0, -0.1 - 0.12 * L, 0]))
    pts = [(a + b) / 2 for a, b in zip(inner, outer)]
    brim = slab(pts, [(b - a) / 2 for a, b in zip(inner, outer)], [np.array([0, 1.0, 0])] * len(pts), [0.0] * len(pts), [0.04] * len(pts), 'cloth2', crease=None)
    top = S.out_ray(C, np.array([0, 1.0, 0])) + [0, off + 0.02, 0]
    return [dome, brim, octa(top, [0, 1, 0], 0.04, 0.05, 'glow')]
prop('gear-cap', *cap(0.06))
prop('gear-cap-loose', *cap(0.17))
def earrings():
    part = Part('gold', crease=None)
    for s in (1, -1):
        c = np.array([lobe[0] * s + 0.01 * s, lobe[1] - 0.095, lobe[2] + 0.0])
        ring = [c + np.array([0.0, 0.09 * math.sin(2 * math.pi * k / 8), 0.09 * math.cos(2 * math.pi * k / 8)]) for k in range(9)]
        part.merge(tube(ring, [0.02] * 9, 4, 'gold', cap=False))
    return part
prop('gear-earrings', earrings())

# --- outfits: shells of the bust, cut along a neckline plane ---
def bust_shell(off, front_y, back_y, mat):
    import bmesh
    from mathutils import Vector as Vc
    Fp = np.array([0, front_y, 1.2]); Bp = np.array([0, back_y, -0.8])
    nrm = np.cross(np.array([1.0, 0, 0]), Bp - Fp); nrm /= np.linalg.norm(nrm)
    if nrm[1] > 0: nrm = -nrm          # points down, so 'below the neckline' is the positive side
    allV = S_all.V; allT = S_all.T
    vn = S_all.vn
    keep = [i for i, t in enumerate(allT) if ((allV[t] - Fp) @ nrm).max() > -0.05]
    bm = bmesh.new(); vm = {}
    for i in keep:
        vs = []
        for v in allT[i]:
            if v not in vm:
                o = off
                if v >= n_skin: o = off            # cap centres
                vm[v] = bm.verts.new(Vc(allV[v] + vn[v] * o))
            vs.append(vm[v])
        try: bm.faces.new(vs)
        except ValueError: pass
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vc(Fp), plane_no=Vc(-nrm), clear_outer=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    part = Part(mat, crease=None)
    bm.verts.index_update()
    for v in bm.verts: part.add(np.array(v.co))
    for f in bm.faces: part.tri(*[v.index for v in f.verts])
    bm.free()
    return part, Fp, nrm
def neck_ring(rows, mat, a0=0, a1=360, n=24, closed=True, crease=None):
    """rows: list of (y_fn(a), offset_fn(a)) from bottom to top around the neck axis."""
    part = Part(mat, crease)
    angs = list(np.linspace(a0, a1, n, endpoint=not closed))
    grid = []
    for yf, of in rows:
        row = []
        for a in angs:
            y = yf(a); cz = 0.05 + 0.15 * smooth(6.3, 5.6, y)
            d = np.array([math.sin(math.radians(a)), 0, math.cos(math.radians(a))])
            p = S.out_ray(np.array([0, y, cz]), d)
            row.append(part.add(p + d * of(a)))
        grid.append(row)
    m = len(angs)
    for i in range(len(rows) - 1):
        for j in range(m if closed else m - 1):
            k = (j + 1) % m
            part.quad(grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j])
    return part
def neckline_y(Fp, nrm, a, r=0.62):
    # height of the neckline plane at angle a on a circle of radius r around the neck
    x, z = r * math.sin(math.radians(a)), 0.1 + r * math.cos(math.radians(a))
    # plane: (p - Fp) . nrm = 0 -> solve for y
    return Fp[1] - ((x - Fp[0]) * nrm[0] + (z - Fp[2]) * nrm[2]) / nrm[1]
crew, Fp, nrm = bust_shell(0.03, 5.78, 6.12, 'cloth')
rib = neck_ring([(lambda a: neckline_y(Fp, nrm, a) - 0.03, lambda a: 0.07), (lambda a: neckline_y(Fp, nrm, a) + 0.06, lambda a: 0.06)], 'cloth2')
prop('fit-crew', crew, rib)
hc, Fp2, nrm2 = bust_shell(0.035, 5.86, 6.12, 'cloth')
collar = neck_ring([(lambda a: neckline_y(Fp2, nrm2, a) - 0.05, lambda a: 0.1), (lambda a: 6.18 + 0.12 * smooth(30, 160, a) - 0.0 * a, lambda a: 0.12),
                    (lambda a: 6.32 + 0.14 * smooth(30, 160, a), lambda a: 0.14)], 'cloth2', crease=50)
prop('fit-collar', hc, collar)
hd, Fp3, nrm3 = bust_shell(0.07, 5.74, 6.08, 'cloth')
lump = neck_ring([(lambda a: neckline_y(Fp3, nrm3, a) - 0.04, lambda a: 0.1), (lambda a: 5.98 + 0.06 * smooth(90, 180, a), lambda a: 0.3 * smooth(40, 120, a) + 0.1),
                  (lambda a: 6.22 + 0.06 * smooth(90, 180, a), lambda a: 0.34 * smooth(40, 120, a) + 0.08), (lambda a: 6.36 + 0.04 * smooth(90, 180, a), lambda a: 0.16 * smooth(40, 120, a) + 0.04)],
                 'cloth2', a0=40, a1=320, n=17, closed=False)
strings = []
for s in (-1, 1):
    top = S_all.in_ray(np.array([0.17 * s, 5.78, 0.3]), np.array([0, 0, 1.0])) + [0, 0, 0.1]
    strings.append(tube([top, top + [0.01 * s, -0.3, 0.03], top + [0.02 * s, -0.62, 0.05]], [0.018] * 3, 4, 'glow', crease=None))
prop('fit-hoodie', hd, lump, strings[0].merge(strings[1]))
pl, Fp4, nrm4 = bust_shell(0.03, 5.8, 6.12, 'cloth')
rib4 = neck_ring([(lambda a: neckline_y(Fp4, nrm4, a) - 0.03, lambda a: 0.07), (lambda a: neckline_y(Fp4, nrm4, a) + 0.06, lambda a: 0.06)], 'cloth2')
def plate(sx, cx, cz, rx, rz, lift):
    part = Part('metal', crease=None)
    rings, segs = 3, 8
    pts = []
    for i in range(rings + 1):
        for k in range(segs if i else 1):
            u = i / rings; ang = 2 * math.pi * k / segs
            x = cx + rx * u * math.cos(ang); z = cz + rz * u * math.sin(ang)
            h = S_all.ray(np.array([x * sx, 6.0, z]), np.array([0, -1.0, 0]), 3)
            pts.append((x * sx, z, u, h[0][1] if h else 4.8))
    # a plane fitted to the shoulder under the plate keeps the rim straight
    A = np.array([[1, p[0], p[1]] for p in pts]); yv = np.array([p[3] for p in pts])
    coef = np.linalg.lstsq(A, yv, rcond=None)[0]
    raise_by = max(0.0, float((yv - A @ coef).max())) + 0.04
    grid, n = [], 0
    for i in range(rings + 1):
        row = []
        for k in range(segs if i else 1):
            x, z, u, _ = pts[n]; n += 1
            y = coef[0] + coef[1] * x + coef[2] * z + raise_by + lift * (1 - u * u)
            row.append(part.add(np.array([x, y, z])))
        grid.append(row)
    for k in range(segs): part.tri(grid[0][0], grid[1][k], grid[1][(k + 1) % segs])
    for i in range(1, rings):
        for k in range(segs):
            j = (k + 1) % segs
            part.quad(grid[i][k], grid[i + 1][k], grid[i + 1][j], grid[i][j])
    rim = grid[-1]; low = [part.add(part.v[i] + np.array([0, -0.07, 0])) for i in rim]
    for k in range(segs):
        j = (k + 1) % segs; part.quad(rim[k], low[k], low[j], rim[j])
    return part
plates = []
for sx in (1, -1):
    for k, (cx, cz, rx, rz, lift) in enumerate([(1.02, 0.0, 0.3, 0.42, 0.1), (1.28, 0.02, 0.3, 0.46, 0.12), (1.52, 0.04, 0.24, 0.46, 0.13)]):
        plates.append(plate(sx, cx, cz, rx, rz, lift))
pp = plates[0]
for p in plates[1:]: pp.merge(p)
prop('fit-plates', pl, rib4, pp)

# ---------- write ----------
def edges_of(part):
    if getattr(part, 'nolines', False): return []
    if not part.t: return part.extra_lines
    tris = np.array(part.t); P = np.array(part.v)
    ecount = defaultdict(list)
    for fi, (a, b, c) in enumerate(tris):
        for x, y in ((a, b), (b, c), (c, a)): ecount[tuple(sorted((x, y)))].append(fi)
    n = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]]); n /= np.linalg.norm(n, axis=1)[:, None] + 1e-12
    out = []
    for e, fs in ecount.items():
        if len(fs) == 1: out.append(e)
        elif part.crease is not None and len(fs) == 2:
            if math.degrees(math.acos(np.clip(abs(n[fs[0]] @ n[fs[1]]), -1, 1))) > part.crease: out.append(e)
    return out + part.extra_lines

g = GLB()
pos_acc = g.accessor(hv.astype(np.float32), FLOAT, 'VEC3', target=34962, minmax=True)
targets = [{'POSITION': a} for a in g.sparse_many([d.astype(np.float32) for d in morph_data], NV)]
prims = []
lipmask = lambda p: ((p[0] / 0.25) ** 2 + ((p[1] - 6.665) / 0.085) ** 2 < 1) and p[2] > 1.08
lip_t = [t for t in hf if lipmask(hv[list(t)].mean(0))]
skin_t = [t for t in hf if not lipmask(hv[list(t)].mean(0))]
print('lip tris', len(lip_t))
for mat, tris in (('skin', skin_t), ('lips', lip_t), ('cut', cap_tris), ('sclera', eye_tris['sclera']), ('iris', eye_tris['iris'])):
    ia = g.accessor(np.array(tris, np.uint16).reshape(-1), U16, 'SCALAR', target=34963)
    prims.append({'attributes': {'POSITION': pos_acc}, 'indices': ia, 'material': g.material(mat), 'targets': targets})
la = g.accessor(np.array(head_lines, np.uint16).reshape(-1), U16, 'SCALAR', target=34963)
prims.append({'attributes': {'POSITION': pos_acc}, 'indices': la, 'mode': 1, 'material': g.material('line'), 'targets': targets})
g.mesh('head', prims, extras={'targetNames': morph_names})

# every prop part in one vertex set; extras say which slice belongs to which part
allP, allB, allW, allT, allL, parts_meta = [], [], [], [], [], []
stats = {}
for pid, parts in PROPS.items():
    for k, part in enumerate(parts):
        P = np.array(part.v, np.float32); v0 = sum(len(x) for x in allP)
        binds = [S_all.bind(p) for p in P]
        bi = np.array([list(b[0]) + [0] for b in binds], np.uint16)
        bwt = np.array([list(np.round(b[1] * 255)) + [0] for b in binds])
        bwt[:, 0] = 255 - bwt[:, 1] - bwt[:, 2]
        t0 = sum(len(x) for x in allT); l0 = sum(len(x) for x in allL)
        tris = (np.array(part.t, np.int64).reshape(-1) + v0) if part.t else np.zeros(0, np.int64)
        es = edges_of(part)
        lines = (np.array(es, np.int64).reshape(-1) + v0) if es else np.zeros(0, np.int64)
        allP.append(P); allB.append(bi); allW.append(bwt.astype(np.uint8)); allT.append(tris); allL.append(lines)
        parts_meta.append([pid, part.mat, int(v0), len(P), int(t0), len(tris), int(l0), len(lines)])
        stats[pid] = stats.get(pid, 0) + len(part.t)
P = np.concatenate(allP); assert len(P) < 65536
pa = g.accessor(P, FLOAT, 'VEC3', target=34962, minmax=True)
ba = g.accessor(np.concatenate(allB), U16, 'VEC4', target=34962)
wa = g.accessor(np.concatenate(allW), U8, 'VEC4', target=34962, normalized=True)
attrs = {'POSITION': pa, '_BIND': ba, '_BINDW': wa}
ta = g.accessor(np.concatenate(allT).astype(np.uint16), U16, 'SCALAR', target=34963)
lla = g.accessor(np.concatenate(allL).astype(np.uint16), U16, 'SCALAR', target=34963)
g.mesh('props', [{'attributes': attrs, 'indices': ta, 'material': g.material('prop')},
                 {'attributes': attrs, 'indices': lla, 'mode': 1, 'material': g.material('line')}],
       node_extras={'parts': parts_meta})
meta = {'sliders': [{'id': s[0], 'label': s[1], 'group': s[2]} for s in SLIDERS], 'eyes': [eyeL.tolist(), eyeR.tolist()],
        'units': 'MakeHuman decimetres', 'source': 'MakeHuman hm08 base mesh and targets via MPFB 2, CC0 1.0'}
size = g.save(OUT, extras=meta)
skin_n = len(hf) + len(cap_tris) + sum(len(v) for v in eye_tris.values())
print(json.dumps({'glb_bytes': size, 'head_tris': skin_n, 'props': stats}, indent=0))
np.savez(OUT.replace('.glb', '_preview.npz'), verts=hv, faces=np.array(hf + cap_tris))
