"""Brows, lashes and facial hair as textured cards and shells. MakeHuman decimetres:
Y up, +Z front, +X the character's left. Stubble is a face texture layer, not a mesh."""
import math, numpy as np
from geom import Part, smooth, table

# brow shapes: centre line height and half-thickness from the inner end (u=0) to the tail (u=1)
BROWS = {
    'straight': dict(y=[(0, 7.525), (0.5, 7.575), (1.0, 7.585)], w=[(0, 0.04), (0.55, 0.034), (1.0, 0.018)]),
    'arched':   dict(y=[(0, 7.52), (0.4, 7.6), (0.64, 7.64), (1.0, 7.575)], w=[(0, 0.038), (0.55, 0.03), (1.0, 0.015)]),
    'soft':     dict(y=[(0, 7.54), (0.4, 7.6), (0.66, 7.625), (1.0, 7.585)], w=[(0, 0.03), (0.5, 0.024), (1.0, 0.012)]),
    'thick':    dict(y=[(0, 7.525), (0.5, 7.58), (1.0, 7.585)], w=[(0, 0.058), (0.55, 0.052), (1.0, 0.028)]),
    'thin':     dict(y=[(0, 7.535), (0.45, 7.6), (0.66, 7.625), (1.0, 7.58)], w=[(0, 0.02), (0.5, 0.017), (1.0, 0.009)]),
    'angled':   dict(y=[(0, 7.515), (0.68, 7.655), (1.0, 7.585)], w=[(0, 0.039), (0.68, 0.032), (1.0, 0.015)]),
    'bushy':    dict(y=[(0, 7.525), (0.5, 7.58), (1.0, 7.58)], w=[(0, 0.064), (0.5, 0.06), (1.0, 0.036)], lift=0.018),
    'slit':     dict(y=[(0, 7.525), (0.5, 7.585), (1.0, 7.59)], w=[(0, 0.042), (0.55, 0.036), (1.0, 0.018)], gaps=[(0.5, 0.56), (0.66, 0.72)]),
}
N_U = 17


def brow_rows(S, sx, spec, wscale=1.0, tilt=0.0):
    us = np.linspace(0, 1, N_U); rows = []
    for u in us:
        x = sx * (0.085 + 0.47 * u)
        y = table(spec['y'], u) + tilt * 0.1 * u ** 1.2
        p = S.in_ray(np.array([x, y, 0.3]), np.array([0, 0.05, 1.0]))
        n = S.normal_at(p)
        up = np.array([0, 1.0, 0]); up = up - n * (up @ n); up /= np.linalg.norm(up)
        w = table(spec['w'], u) * wscale
        lift = spec.get('lift', 0.01)
        rows.append([p - up * w + n * 0.005, p + n * (0.005 + lift), p + up * w + n * 0.005])
    return us, rows


def brow_part(S, spec):
    part = Part('brow')
    mt, ma = [], []
    for sx in (1, -1):
        us, R0 = brow_rows(S, sx, spec)
        _, RT = brow_rows(S, sx, spec, wscale=1.6)
        _, RA = brow_rows(S, sx, spec, tilt=1.0)
        ids = []
        for k, u in enumerate(us):
            row = []
            for j in range(3):
                row.append(part.add(R0[k][j], 1.0, 1.0, (u, j / 2)))
                mt.append(RT[k][j] - R0[k][j]); ma.append(RA[k][j] - R0[k][j])
            ids.append(row)
        gaps = spec.get('gaps', [])
        for k in range(len(us) - 1):
            um = (us[k] + us[k + 1]) / 2
            if any(g0 <= um <= g1 for g0, g1 in gaps): continue
            a, b = ids[k], ids[k + 1]
            for j in range(2):
                if sx > 0: part.quad(a[j], b[j], b[j + 1], a[j + 1])
                else: part.quad(a[j + 1], b[j + 1], b[j], a[j])
    part.morph = {'browT': np.array(mt), 'browA': np.array(ma)}
    part.noao = True
    return part


def lash_part(K, length, lower=False):
    """A curled card along the lid line: root on the lid edge (v=0), tips out and up."""
    part = Part('lash')
    for sx in (1, -1):
        pts = (K.low_lines if lower else K.lid_lines)[sx]
        if len(pts) < 4: continue
        n = len(pts); rows = []
        c = K.eyeL * [sx, 1, 1]
        for k, p in enumerate(pts):
            u = k / (n - 1)
            out = p - c; out[1] = 0; out /= np.linalg.norm(out)
            L = length * (0.35 + 0.65 * math.sin(math.pi * min(1, 0.15 + u * 0.95)) ** 0.6)
            up = np.array([0, -1.0 if lower else 1.0, 0])
            fwd = np.array([0, 0, 1.0]) * 0.6 + out * 0.4
            root = p + fwd * 0.004 + up * -0.002
            mid = root + fwd * L * 0.55 + up * L * 0.3
            tip = root + fwd * L * 0.55 + up * L * 0.85 + out * L * 0.25 * (u if sx > 0 else u)
            rows.append([part.add(root, 1, 1, (u, 0.02)), part.add(mid, 1, 1, (u, 0.5)), part.add(tip, 1, 1, (u, 0.98))])
        for a, b in zip(rows, rows[1:]):
            for j in range(2): part.quad(a[j], b[j], b[j + 1], a[j + 1])
    part.noao = True
    return part


def welded_shell(K, pred, off, mat, uvfn, densfn):
    """Copy the skin triangles whose centre passes pred, pushed out along welded normals
    by off(p). UV seams in the head are merged, so the shell has no cracks."""
    S = K.S; W = K.weld
    sel = [i for i, t in enumerate(S.T) if pred(S.V[t].mean(0))]
    part = Part(mat); vmap = {}
    wn = {}
    for i in sel:
        for v in S.T[i]: wn.setdefault(W[v], np.zeros(3));
    for i, t in enumerate(S.T):
        n = np.cross(S.V[t[1]] - S.V[t[0]], S.V[t[2]] - S.V[t[0]])
        for v in t:
            if W[v] in wn: wn[W[v]] += n
    for i in sel:
        ids = []
        for v in S.T[i]:
            w = W[v]
            if w not in vmap:
                n = wn[w] / np.linalg.norm(wn[w]); p = S.V[v]
                vmap[w] = part.add(p + n * off(p), 1.0, densfn(p), uvfn(p), (0, -1.0, 0))
            ids.append(vmap[w])
        part.tri(*ids)
    return part


def build(K):
    S = K.S
    for name, spec in BROWS.items():
        K.prop('brow-' + name, brow_part(S, spec))
    K.prop('lash', lash_part(K, 0.055), lash_part(K, 0.025, lower=True))
    K.prop('lash-long', lash_part(K, 0.085), lash_part(K, 0.032, lower=True))

    mouth = lambda p: ((p[0] / 0.25) ** 2 + ((p[1] - 6.665) / 0.095) ** 2 < 1) and p[2] > 1.0
    cheek_line = lambda x: table([(0.0, 6.8), (0.24, 6.8), (0.42, 6.86), (0.58, 6.98), (0.7, 7.16), (2, 7.2)], abs(x))
    def beard_area(p, low):
        return p[1] < cheek_line(p[0]) + 0.02 and p[1] > low and p[2] > 0.2 and not mouth(p) and not (abs(p[0]) < 0.2 and p[1] > 6.86)
    def uvf(top, bot):
        return lambda p: (p[0] * 2.4 + 0.5, float(np.clip((p[1] - bot) / (top - bot), 0, 1)) * 0.9 + 0.08)
    def fade(p, low):
        return smooth(cheek_line(p[0]) + 0.02, cheek_line(p[0]) - 0.12, p[1]) * smooth(low, low + 0.1, p[1])

    # moustache: a band over the upper lip
    def stache_area(p): return abs(p[0]) < 0.3 and 6.7 < p[1] < 6.86 + 0.04 * (abs(p[0]) < 0.1) and p[2] > 1.0 and not mouth(p)
    stache = welded_shell(K, stache_area, lambda p: 0.022 + 0.018 * smooth(0.3, 0.05, abs(p[0])), 'beard', uvf(6.88, 6.68),
                          lambda p: smooth(0.31, 0.24, abs(p[0])) * smooth(6.88, 6.82, p[1]))
    K.prop('fh-moustache', stache)
    chin = lambda p: (abs(p[0]) < 0.24 and 6.12 < p[1] < 6.62 and p[2] > 0.75 and not mouth(p)) or (0.17 < abs(p[0]) < 0.3 and 6.55 < p[1] < 6.8 and p[2] > 1.0 and not mouth(p))
    goatee = welded_shell(K, chin, lambda p: 0.025 + 0.04 * smooth(6.5, 6.2, p[1]), 'beard', uvf(6.8, 6.1),
                          lambda p: 0.72 * smooth(0.27, 0.18, abs(p[0])) * smooth(6.1, 6.2, p[1]))
    K.prop('fh-goatee', goatee, welded_shell(K, stache_area, lambda p: 0.02 + 0.014 * smooth(0.3, 0.05, abs(p[0])), 'beard', uvf(6.88, 6.68),
                                              lambda p: smooth(0.31, 0.24, abs(p[0])) * smooth(6.88, 6.82, p[1])))
    short = welded_shell(K, lambda p: beard_area(p, 6.0), lambda p: 0.014 + 0.016 * smooth(6.7, 6.2, p[1]), 'beard', uvf(7.3, 5.95),
                         lambda p: 0.62 * fade(p, 6.0))
    K.prop('fh-shortbeard', short, welded_shell(K, stache_area, lambda p: 0.016, 'beard', uvf(6.88, 6.68), lambda p: 0.68 * smooth(0.31, 0.24, abs(p[0]))))
    full = welded_shell(K, lambda p: beard_area(p, 5.92),
                        lambda p: 0.03 + 0.11 * smooth(6.75, 6.15, p[1]) * smooth(0.0, 0.8, p[2]), 'beard', uvf(7.3, 5.9),
                        lambda p: 0.4 + 0.6 * fade(p, 5.92))
    K.prop('fh-beard', full, welded_shell(K, stache_area, lambda p: 0.026 + 0.018 * smooth(0.3, 0.05, abs(p[0])), 'beard', uvf(6.88, 6.68),
                                          lambda p: smooth(0.31, 0.24, abs(p[0]))))
