"""Read a MakeHuman hair proxy (.mhclo + .obj + .mhmat) and place it on an hm08 mesh.
The .mhclo binds every hair vertex to three base-mesh vertices with weights and an offset,
so the hair lands on whatever shape the base mesh has (our neutral avatar head)."""
import os, re, numpy as np


def read_mhclo(path):
    meta, refs, w, off, scale = {}, [], [], [], {}
    in_verts = False
    for line in open(path, encoding='utf-8', errors='replace'):
        s = line.strip()
        if not s or s.startswith('#'): continue
        t = s.split()
        if in_verts:
            if re.match(r'^-?\d', t[0]) and len(t) in (1, 9):
                if len(t) == 1: refs.append([int(t[0])] * 3); w.append([1.0, 0, 0]); off.append([0.0, 0, 0])
                else: refs.append([int(x) for x in t[:3]]); w.append([float(x) for x in t[3:6]]); off.append([float(x) for x in t[6:9]])
                continue
        k = t[0]
        if k == 'verts': in_verts = True; continue
        if k in ('x_scale', 'y_scale', 'z_scale'): scale[k[0]] = (int(t[1]), int(t[2]), float(t[3])); continue
        meta.setdefault(k, []).append(' '.join(t[1:]))
    return meta, np.array(refs), np.array(w), np.array(off), scale


def read_obj(path):
    V, VT, F, FT = [], [], [], []
    for line in open(path, encoding='utf-8', errors='replace'):
        if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            ids = [p.split('/') for p in line.split()[1:]]
            F.append([int(p[0]) - 1 for p in ids])
            FT.append([int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in ids])
    return np.array(V), np.array(VT) if VT else np.zeros((0, 2)), F, FT


def read_mhmat(path):
    out = {}
    for line in open(path, encoding='utf-8', errors='replace'):
        t = line.strip().split(None, 1)
        if len(t) == 2 and not t[0].startswith('#'): out[t[0]] = t[1]
    return out


def fit(folder, base):
    """Hair placed on base (N x 3 hm08 positions). Returns dict with the hair's vertices,
    triangles (fan of each face), per-corner UVs and the diffuse/normal texture paths."""
    clo = [f for f in os.listdir(folder) if f.endswith('.mhclo')][0]
    meta, refs, w, off, sc = read_mhclo(os.path.join(folder, clo))
    obj = os.path.join(folder, meta['obj_file'][0])
    V, VT, F, FT = read_obj(obj)
    assert len(V) == len(refs), (folder, len(V), len(refs))
    s = np.ones(3)
    for i, ax in enumerate('xyz'):
        if ax in sc:
            a, b, d = sc[ax]; s[i] = abs(base[a][i] - base[b][i]) / d
    P = (base[refs] * w[:, :, None]).sum(1) + off * s
    mat = read_mhmat(os.path.join(folder, meta['material'][0])) if 'material' in meta else {}
    tex = lambda k: os.path.join(folder, mat[k]) if k in mat and os.path.exists(os.path.join(folder, mat[k])) else None
    # one vertex per (position, uv) corner pair, so UV seams keep their own UVs
    key, outP, outUV, src, tris = {}, [], [], [], []
    for f, ft in zip(F, FT):
        ids = []
        for v, t in zip(f, ft):
            k = (v, t)
            if k not in key:
                key[k] = len(outP); outP.append(P[v]); outUV.append(VT[t] if t >= 0 else (0, 0)); src.append(v)
            ids.append(key[k])
        for j in range(1, len(ids) - 1): tris.append((ids[0], ids[j], ids[j + 1]))
    return {'P': np.array(outP), 'UV': np.array(outUV, float), 'T': np.array(tris), 'src': np.array(src),
            'diffuse': tex('diffuseTexture'), 'normal': tex('normalmapTexture'), 'mat': mat, 'meta': meta}
