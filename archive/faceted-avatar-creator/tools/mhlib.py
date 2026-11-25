"""Read the MakeHuman hm08 base mesh and its .target files (CC0, from MPFB 2)."""
import gzip, json, os
import numpy as np
MH = '/home/claude/mh/mpfb2/src/mpfb/data'

def load_obj(path=MH + '/3dobjs/base.obj', uv=False):
    V, F, G, VT, FT = [], [], [], [], []
    g = None
    for line in open(path):
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            g = line.split()[1]
        elif line.startswith('f '):
            F.append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
            FT.append([int(t.split('/')[1]) - 1 for t in line.split()[1:]])
            G.append(g)
    if uv: return np.array(V, np.float64), F, G, np.array(VT), FT
    return np.array(V, np.float64), F, G

def load_target(rel, n):
    p = os.path.join(MH, 'targets', rel)
    if not p.endswith('.gz'): p += '.target.gz'
    d = np.zeros((n, 3))
    for line in gzip.open(p, 'rt'):
        if not line.strip() or line.startswith('#'): continue
        t = line.split()
        d[int(t[0])] = [float(t[1]), float(t[2]), float(t[3])]
    return d
