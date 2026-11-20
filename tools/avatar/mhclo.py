"""Read MakeHuman proxies (.mhclo plus their .obj) and fit them to any hm08 vertex set.
A proxy vertex is either one base vertex or three base vertices with weights plus an
offset scaled by the base mesh's own size, so a proxy fitted to a morphed mesh follows
the morph. The proxies used here are CC0 (MakeHuman system assets and community packs)."""
import numpy as np

PACKS = '/home/claude/mhpacks/'


def load_clo(path):
    """Returns (scales, refs, obj file name). refs: (idx[3], weights[3], offset[3]) per vertex."""
    sc, refs, obj, on = {}, [], None, False
    num = lambda x: x.lstrip('-').replace('.', '', 1).isdigit()
    for line in open(path):
        t = line.split()
        if not t or t[0].startswith('#'): continue
        if t[0] in ('x_scale', 'y_scale', 'z_scale'): sc[t[0][0]] = (int(t[1]), int(t[2]), float(t[3]))
        elif t[0] == 'obj_file': obj = t[1]
        elif t[0] == 'verts': on = True
        elif t[0] == 'delete_verts': on = False
        elif on and num(t[0]):
            if len(t) == 1: refs.append(([int(t[0])] * 3, [1.0, 0, 0], [0.0, 0, 0]))
            elif len(t) == 9: refs.append(([int(x) for x in t[:3]], [float(x) for x in t[3:6]], [float(x) for x in t[6:9]]))
    return sc, refs, obj


def load_obj(path):
    """Vertices, UVs, faces (vertex ids) and face UV ids of a proxy .obj."""
    V, VT, F, FT = [], [], [], []
    for line in open(path):
        t = line.split()
        if not t: continue
        if t[0] == 'v': V.append([float(x) for x in t[1:4]])
        elif t[0] == 'vt': VT.append([float(x) for x in t[1:3]])
        elif t[0] == 'f':
            F.append([int(x.split('/')[0]) - 1 for x in t[1:]])
            FT.append([int(x.split('/')[1]) - 1 for x in t[1:]])
    return np.array(V), np.array(VT), F, FT


class Proxy:
    def __init__(self, clo_path):
        import os
        self.sc, refs, obj = load_clo(clo_path)
        self.dir = os.path.dirname(clo_path)
        self.V, self.VT, self.F, self.FT = load_obj(os.path.join(self.dir, obj))
        self.I = np.array([r[0] for r in refs]); self.W = np.array([r[1] for r in refs]); self.O = np.array([r[2] for r in refs])
        assert len(self.I) == len(self.V), (clo_path, len(self.I), len(self.V))

    def fit(self, X):
        """Proxy vertex positions on the base vertex set X (n, 3)."""
        s = np.array([abs(X[self.sc[k][0], i] - X[self.sc[k][1], i]) / self.sc[k][2] for i, k in enumerate('xyz')])
        return (X[self.I] * self.W[:, :, None]).sum(1) + self.O * s

    def split(self):
        """Faces as triangles with one output vertex per (vertex, uv) pair: (src vertex ids, uvs, tris)."""
        key, src, uv, tris = {}, [], [], []
        for f, ft in zip(self.F, self.FT):
            ids = []
            for v, t in zip(f, ft):
                if (v, t) not in key: key[(v, t)] = len(src); src.append(v); uv.append(self.VT[t])
                ids.append(key[(v, t)])
            for k in range(1, len(ids) - 1): tris.append((ids[0], ids[k], ids[k + 1]))
        return np.array(src), np.array(uv), np.array(tris)
