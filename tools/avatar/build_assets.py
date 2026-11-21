"""Build the avatar assets:
  assets/avatar/avatar.glb   the smooth head and bust with UVs, eyes, slider morph targets,
                             brows, lashes and facial hair
  assets/avatar/items/*.glb  one file per hairstyle, outfit and accessory, loaded when worn
  assets/avatar/tex/*.webp   skin tone, AO, makeup masks, iris, brow, lash, hair and fabric textures
Usage: python3 build_assets.py HEAD_NPZ OUT_DIR [only]   (OUT_DIR is assets/avatar)
GLBs are written as *.raw and packed by meshopt_pack.mjs."""
import os, sys, math, json, numpy as np
from collections import defaultdict, Counter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from mhlib import load_obj, load_target
from morphs import SLIDERS, dense_deltas, GAIN, SEX_EXTRA, BASE, landmarks
from geom import *
from gltf_writer import GLB, FLOAT, U8, U16, I16
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import textures

HEAD, OUT = sys.argv[1], sys.argv[2]
ONLY = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None     # e.g. base,tex or single item ids
os.makedirs(OUT + '/items', exist_ok=True); os.makedirs(OUT + '/tex', exist_ok=True)
CUT_Y, SIDE_X = 4.62, 1.72
V, F, G = load_obj(); NB = len(V)
neu = np.load(os.path.join(HERE, 'neu.npy')); male = np.load(os.path.join(HERE, 'male.npy')); fem = np.load(os.path.join(HERE, 'fem.npy'))
h = np.load(HEAD)
import face_src
hv, hf, huv, weld = list(h['verts']), [tuple(t) for t in h['faces']], list(map(tuple, h['uv'])), list(h['weld'])
bidx, bw, dense_v, dense_f = h['bidx'], h['bw'], h['dense_verts'], h['dense_faces']
n_skin = len(hv)
next_weld = int(max(weld)) + 1

# ---------- caps over the three cuts (dark, never textured) ----------
ec = Counter()
for t in hf:
    w = [weld[i] for i in t]
    for e in ((w[0], w[1]), (w[1], w[2]), (w[2], w[0])): ec[tuple(sorted(e))] += 1
edge_dir = {}
for t in hf:
    for x, y in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
        if ec[tuple(sorted((weld[x], weld[y])))] == 1: edge_dir[(x, y)] = True
cap_tris, cap_src = [], []
for plane in ('bottom', 'left', 'right'):
    if plane == 'bottom': on = lambda p: abs(p[1] - CUT_Y) < 2e-3
    elif plane == 'left': on = lambda p: abs(p[0] - SIDE_X) < 2e-3
    else: on = lambda p: abs(p[0] + SIDE_X) < 2e-3
    loop_edges = [(x, y) for (x, y) in edge_dir if on(hv[x]) and on(hv[y])]
    vs = sorted({v for e in loop_edges for v in e})
    if not vs: continue
    ci = len(hv); hv.append(np.mean([hv[v] for v in vs], 0)); huv.append((0.995, 0.995)); weld.append(next_weld); next_weld += 1
    cap_src.append((ci, vs))
    for x, y in loop_edges: cap_tris.append((y, x, ci))
n_cap = len(hv)

# ---------- eyeballs and corneas: the MakeHuman high-poly eye proxy (face_src.Eyes) ----------
# eye_info keeps the eye helper's centre and size, which the glasses and goggles are fitted to
eye_info = []
for side, sx in (('l', 1), ('r', -1)):
    idx = sorted({i for f, g in zip(F, G) if g == f'helper-{side}-eye' for i in f})
    c = neu[idx].mean(0); R = float(np.linalg.norm(neu[idx] - c, axis=1).mean())
    eye_info.append({'side': side, 'c': c, 'R': R})
EYES = face_src.Eyes(neu)
eP, eUV, eMats = EYES.mesh()
eye_start = len(hv); wkey = {}
for p, u in zip(eP, eUV):
    k = tuple(np.round(p, 5))
    if k not in wkey: wkey[k] = next_weld; next_weld += 1
    hv.append(p); huv.append(tuple(u)); weld.append(wkey[k])
eye_tris = [(a + eye_start, b + eye_start, c + eye_start) for a, b, c in eMats['eye']]
cornea_tris = [(a + eye_start, b + eye_start, c + eye_start) for a, b, c in eMats['cornea']]
hv = np.array(hv); huv = np.array(huv); weld = np.array(weld)
NV = len(hv)
print('head verts', NV, 'skin tris', len(hf), 'cap', len(cap_tris), 'eye', len(eye_tris), 'cornea', len(cornea_tris))

# ---------- morphs ----------
morph_names, morph_data = [], []
for sid, label, grp, neg, pos in SLIDERS + [('base', '', '', [], [])]:
    for sign, spec in ((('+', pos),) if sid == 'base' else (('-', neg), ('+', pos))):
        D = 0 * neu if sid == 'base' else dense_deltas(spec, V, F, G, neu, male, fem) * GAIN.get(sid + sign, GAIN.get(sid, 1.0))
        if sid == 'jawA': D = D * np.array([smooth(7.2, 6.8, y) for y in neu[:, 1]])[:, None]
        if sid == 'sex':
            for t, gn in SEX_EXTRA[sign]: D = D + load_target(t, NB) * gn
        if sid == 'base': D = sum(load_target(t, NB) * gn for t, gn in BASE)
        out = np.zeros((NV, 3))
        out[:n_skin] = (D[bidx] * bw[:, :, None]).sum(1)
        for ci, vs in cap_src: out[ci] = out[vs].mean(0)
        out[eye_start:] = EYES.delta(neu + D)
        out[np.abs(out).max(1) < 0.0015] = 0
        morph_names.append(sid + sign); morph_data.append(out)

skin_tris = np.array(hf)
S = Surface(hv[:n_skin], skin_tris)
S_all = Surface(hv[:n_cap], np.array(hf + cap_tris))
eyeL, eyeR, EYE_R = eye_info[0]['c'], eye_info[1]['c'], eye_info[0]['R']

# ---------- landmarks ----------
ear_v = [i for i in range(n_skin) if hv[i][0] > 0.66 and 6.78 < hv[i][1] < 7.62 and -0.3 < hv[i][2] < 0.75]
ear_c = hv[ear_v].mean(0); lobe = hv[ear_v[int(np.argmin(hv[ear_v][:, 1]))]]
ear_out = hv[ear_v][:, 0].max(); ear_top = hv[ear_v][:, 1].max()
ear_z = (hv[ear_v][:, 2].min(), hv[ear_v][:, 2].max())
def ear_box(p): return abs(p[0]) > 0.62 and 6.75 < p[1] < ear_top + 0.04 and ear_z[0] - 0.05 < p[2] < ear_z[1] + 0.05
ear_tri = {i for i, t in enumerate(hf) if ear_box(hv[list(t)].mean(0)) and abs(hv[list(t)].mean(0)[0]) > 0.66}
S_noear = Surface(hv[:n_skin], np.array([t for i, t in enumerate(hf) if i not in ear_tri]))
th_ear = lambda z: math.degrees(math.atan2(ear_out, z - C[2]))
EAR_TH = (th_ear(ear_z[1]), th_ear(ear_z[0]))
SC = Scalp(S, ear_box)
print('eye', eyeL.round(3), 'R', round(EYE_R, 3), 'ear', ear_c.round(3), 'top', round(ear_top, 3), 'ear theta', np.round(EAR_TH, 1))

def lid_curve(sx, up=True):
    """Points along the upper (or lower) lid edge: where rays from the front stop seeing the eyeball."""
    c = eyeL * [sx, 1, 1]; R = EYE_R; pts = []
    for dx in np.linspace(-0.92, 0.92, 15):
        x = c[0] + dx * R * sx
        y = c[1] + (-0.15 if up else 0.15) * R; edge = None
        for _ in range(140):
            h_ = S.ray(np.array([x, y, 4.0]), np.array([0, 0, -1.0]), 6)
            dd = R * R - (x - c[0]) ** 2 - (y - c[1]) ** 2
            ze = c[2] + math.sqrt(dd) if dd > 0 else -9
            if h_ is not None and h_[0][2] >= ze - 0.003:
                edge = h_[0]; break
            y += 0.003 if up else -0.003
        if edge is not None: pts.append(edge)
    return pts
LID = {s: lid_curve(s, True) for s in (1, -1)}
LOW = {s: lid_curve(s, False) for s in (1, -1)}
print('lid points', len(LID[1]), len(LOW[1]))

def lip_mask(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x)
    wv = np.clip(1 - (ax / 0.245) ** 2, 0, 1)
    top = 6.672 + 0.07 * wv ** 0.55 - 0.014 * np.exp(-(x / 0.045) ** 2) + 0.008 * np.exp(-((ax - 0.07) / 0.04) ** 2)
    bot = 6.665 - 0.088 * wv ** 0.5
    inside = textures.smoothstep(top + 0.006, top - 0.006, y) * textures.smoothstep(bot - 0.006, bot + 0.006, y)
    return inside * textures.smoothstep(0.255, 0.225, ax) * textures.smoothstep(0.95, 1.08, z)

# ---------- ambient occlusion (per vertex) and crease cavity ----------
def hemi_dirs(n=40):
    out = []
    for k in range(n):
        zz = 1 - (k + 0.5) / n; r = math.sqrt(max(0.0, 1 - zz * zz)); a = k * 2.39996
        out.append((r * math.cos(a), r * math.sin(a), zz))
    return np.array(out)
DIRS = hemi_dirs(40); DIRS16 = hemi_dirs(16)
def ao_bake(P, N, tree, dist=0.9, lift=0.012, dirs=None):
    out = np.ones(len(P)); dirs = DIRS if dirs is None else dirs
    for i, (p, n) in enumerate(zip(P, N)):
        a = np.cross(n, [0, 1.0, 0]) if abs(n[1]) < 0.9 else np.cross(n, [1.0, 0, 0])
        a /= np.linalg.norm(a); b = np.cross(n, a)
        o = Vector(p + n * lift); hit, tot = 0.0, 0.0
        for dx, dy, dz in dirs:
            d = a * dx + b * dy + n * dz
            loc, no, fi, dd = tree.ray_cast(o, Vector(d), dist)
            tot += dz
            if loc is not None: hit += dz * (1 - dd / dist) ** 0.5
        out[i] = 1 - hit / tot
    return out
def welded_normals(P, T, W):
    n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    acc = np.zeros((W.max() + 1, 3))
    for k in range(3): np.add.at(acc, W[T[:, k]], n)
    acc /= np.linalg.norm(acc, axis=1)[:, None] + 1e-12
    return acc[W]
occ_v = [Vector(p) for p in dense_v]; occ_tris = [list(map(int, t)) for t in dense_f]
o0 = len(occ_v); occ_v += [Vector(p) for p in hv]; occ_tris += [[a + o0, b + o0, c + o0] for a, b, c in eye_tris]
HEAD_TREE = BVHTree.FromPolygons(occ_v, occ_tris)
NRM = welded_normals(hv[:n_skin], skin_tris, weld[:n_skin])
want_tex = ONLY is None or 'tex' in ONLY
ao_v = ao_bake(hv[:n_skin], NRM, HEAD_TREE) if want_tex else np.ones(n_skin)
nb = defaultdict(set)
for t in skin_tris:
    for a_ in t:
        for b_ in t:
            if a_ != b_: nb[weld[a_]].add(weld[b_])
wpos = {weld[i]: hv[i] for i in range(n_skin)}
cav_w = {w: np.mean([wpos[k] for k in ns], 0) - wpos[w] for w, ns in nb.items()}
cav_v = np.clip(np.array([max(0.0, cav_w[weld[i]] @ NRM[i]) for i in range(n_skin)]) / 0.02, 0, 1)
eye_n = hv[n_cap:] - np.where(hv[n_cap:, :1] > 0, eyeL, eyeR)
eye_n /= np.linalg.norm(eye_n, axis=1)[:, None]
ao_eye = ao_bake(hv[n_cap:], eye_n, BVHTree.FromPolygons([Vector(p) for p in dense_v], [list(map(int, t)) for t in dense_f]), dist=0.5, lift=0.004)
col_head = np.ones((NV, 4))
col_head[n_cap:, :3] = ((0.3 + 0.7 * ao_eye ** 1.4) * face_src.eye_lid_shade(hv[n_cap:], LID))[:, None]
print('ao head', round(float(ao_v.mean()), 3), 'eye', round(float(ao_eye.min()), 3), round(float(ao_eye.mean()), 3))

class Ctx: pass
K = Ctx()
K.S, K.S_all, K.S_noear, K.SC, K.hv, K.n_skin = S, S_all, S_noear, SC, hv, n_skin
K.eyeL, K.eyeR, K.EYE_R, K.ear_c, K.lobe, K.ear_out, K.ear_top, K.EAR_TH, K.ear_z = eyeL, eyeR, EYE_R, ear_c, lobe, ear_out, ear_top, EAR_TH, ear_z
K.uv, K.hv_skin, K.skin_tris, K.ao_v, K.cav_v = huv[:n_skin], hv[:n_skin], skin_tris, ao_v, cav_v
K.lid_lines, K.low_lines, K.lip_mask = LID, LOW, lip_mask
K.weld = weld
K.uv_mh, K.neu, K.eyes = h['uv_mh'], neu, EYES
K.brow_tiles = face_src.brow_atlas(OUT + '/tex' if ONLY is None or 'tex' in ONLY else None, neu)

if want_tex:
    sizes = face_src.fh_masks(K, OUT + '/tex'); sizes.update(face_src.fh_strands(OUT + '/tex')); sizes.update(textures.all_small(OUT + '/tex'))
    fs, K.face_meta = face_src.skin_textures(K, OUT + '/tex'); sizes.update(fs)
    json.dump(K.face_meta, open(HEAD.replace('.npz', '_face.json'), 'w'))
    sizes.update(face_src.eye_textures(EYES, OUT + '/tex')); sizes.update(face_src.lash_atlas(OUT + '/tex'))
    print('textures', sizes, 'total', sum(sizes.values()))

# ---------- props ----------
PROPS = {}
def prop(pid, *parts): PROPS[pid] = [p for p in parts if p is not None and (len(p.t) or p.extra_lines)]
K.prop = prop; K.PROPS = PROPS
import parts_face, parts_hair, parts_gear, parts_outfit
parts_face.build(K)
parts_hair.build(K)
parts_gear.build(K)
parts_outfit.build(K)

def part_ao(parts):
    allv, allt = [], []
    for p in parts:
        k = len(allv); allv += [Vector(v) for v in p.v]; allt += [[a + k, b + k, c + k] for a, b, c in p.t]
    tree = BVHTree.FromPolygons(occ_v + allv, occ_tris + [[a + len(occ_v), b + len(occ_v), c + len(occ_v)] for a, b, c in allt]) if allt else HEAD_TREE
    out = {}
    for p in parts:
        P = np.array(p.v)
        if not p.t or getattr(p, 'noao', False): out[id(p)] = np.ones(len(P)); continue
        Tn = np.array(p.t)
        n = np.cross(P[Tn[:, 1]] - P[Tn[:, 0]], P[Tn[:, 2]] - P[Tn[:, 0]]); N = np.zeros_like(P)
        for k in range(3): np.add.at(N, Tn[:, k], n)
        N /= np.linalg.norm(N, axis=1)[:, None] + 1e-12
        for i, q in enumerate(P):
            nq = S_all.nearest(q)[0]
            if np.linalg.norm(N[i]) < 0.5: N[i] = (q - nq) / (np.linalg.norm(q - nq) + 1e-9)
            elif N[i] @ (q - nq) < -1e-4: N[i] = -N[i]
        out[id(p)] = ao_bake(P, N, tree, dist=0.6, lift=0.01, dirs=DIRS16)
    return out

def write_props(g, plist, name='props'):
    """All parts in one vertex set; node extras list each part's slice."""
    allP, allB, allW, allC, allUV, allS, allT, allL, meta, allM = [], [], [], [], [], [], [], [], [], defaultdict(list)
    MORPHS = ['browT', 'browA']
    aos = part_ao([p for _, ps in plist for p in ps])
    for pid, parts in plist:
        for part in parts:
            P = np.array(part.v, np.float64); v0 = sum(len(x) for x in allP)
            surf = part.bound or S_all
            binds = [surf.bind(p) for p in P]
            bi = np.array([list(b[0]) + [0] for b in binds], np.uint16)
            bwt = np.array([list(np.round(b[1] * 255)) + [0] for b in binds]); bwt[:, 0] = 255 - bwt[:, 1] - bwt[:, 2]
            t0 = sum(len(x) for x in allT); l0 = sum(len(x) for x in allL)
            tris = (np.array(part.t, np.int64).reshape(-1) + v0) if part.t else np.zeros(0, np.int64)
            lines = (np.array(part.extra_lines, np.int64).reshape(-1) + v0) if part.extra_lines else np.zeros(0, np.int64)
            tint = np.asarray(part.col, float) * aos[id(part)] ** 1.1
            C4 = np.stack([tint, tint, tint, np.asarray(part.dens, float)], 1)
            st = np.asarray(part.strand, float).reshape(-1, 3)
            S4 = np.zeros((len(P), 4), np.int8); S4[:, :3] = np.round(np.clip(st, -1, 1) * 127)
            allP.append(P); allB.append(bi); allW.append(bwt.astype(np.uint8)); allT.append(tris); allL.append(lines)
            allC.append(np.round(np.clip(C4, 0, 1) * 255).astype(np.uint8)); allUV.append(np.asarray(part.uv, np.float32).reshape(-1, 2)); allS.append(S4)
            for mname in MORPHS: allM[mname].append(np.asarray(part.morph.get(mname, np.zeros((len(P), 3))), np.float64).reshape(-1, 3))
            meta.append([pid, part.mat, int(v0), len(P), int(t0), len(tris), int(l0), len(lines)])
    P = np.concatenate(allP); assert len(P) < 65536, len(P)
    pa, qo, qs = g.qvec3(P)
    attrs = {'POSITION': pa, 'TEXCOORD_0': g.accessor(np.concatenate(allUV), FLOAT, 'VEC2', target=34962),
             '_BIND': g.accessor(np.concatenate(allB), U16, 'VEC4', target=34962),
             '_BINDW': g.accessor(np.concatenate(allW), U8, 'VEC4', target=34962, normalized=True),
             'COLOR_0': g.accessor(np.concatenate(allC), U8, 'VEC4', target=34962, normalized=True),
             '_STRAND': g.accessor(np.concatenate(allS), 5120, 'VEC4', target=34962, normalized=True)}
    extras = {'q': [qo, qs]}
    prim = {'attributes': attrs, 'indices': g.accessor(np.concatenate(allT).astype(np.uint16), U16, 'SCALAR', target=34963), 'material': g.material('prop')}
    prims = [prim]
    has_m = any(np.abs(np.concatenate(allM[m])).max() > 0 for m in MORPHS)
    if has_m:
        acc, scales = g.sparse_q([np.concatenate(allM[m]) for m in MORPHS], len(P))
        prim['targets'] = [{'POSITION': a} for a in acc]; extras['targetNames'] = MORPHS; extras['morphScale'] = scales
    L = np.concatenate(allL)
    if len(L):
        lp = {'attributes': attrs, 'indices': g.accessor(L.astype(np.uint16), U16, 'SCALAR', target=34963), 'mode': 1, 'material': g.material('line')}
        if has_m: lp['targets'] = prim['targets']
        prims.append(lp)
    g.mesh(name, prims, extras=extras, node_extras={'parts': meta})
    return {pid: sum(len(p.t) for p in ps) for pid, ps in plist}

BASE = [k for k in PROPS if k.startswith(('brow-', 'lash'))]
stats = {}
if ONLY is None or 'base' in ONLY:
    g = GLB()
    pos_acc = g.accessor(hv.astype(np.float32), FLOAT, 'VEC3', target=34962, minmax=True)
    col_acc = g.accessor(np.round(np.clip(col_head, 0, 1) * 255).astype(np.uint8), U8, 'VEC4', target=34962, normalized=True)
    uv_acc = g.accessor(huv.astype(np.float32), FLOAT, 'VEC2', target=34962)
    W2 = np.zeros((NV, 2), np.uint16); W2[:, 0] = weld
    weld_acc = g.accessor(W2, U16, 'VEC2', target=34962)
    macc, mscale = g.sparse_q(morph_data, NV)
    targets = [{'POSITION': a} for a in macc]
    # the lips are part of the skin: their colour lives in the face texture with a soft border
    skin_t = list(hf)
    prims = []
    for mat, tris in (('skin', skin_t), ('cut', cap_tris), ('eye', eye_tris), ('cornea', cornea_tris)):
        ia = g.accessor(np.array(tris, np.uint16).reshape(-1), U16, 'SCALAR', target=34963)
        prims.append({'attributes': {'POSITION': pos_acc, 'COLOR_0': col_acc, 'TEXCOORD_0': uv_acc, '_WELD': weld_acc}, 'indices': ia, 'material': g.material(mat), 'targets': targets})
    g.mesh('head', prims, extras={'targetNames': morph_names, 'morphScale': mscale})
    stats['base'] = write_props(g, [(k, PROPS[k]) for k in BASE])
    meta = {'eyes': [{'c': e['c'].tolist(), 'R': e['R']} for e in eye_info], 'face': getattr(K, 'face_meta', None) or json.load(open(HEAD.replace('.npz', '_face.json'))),
            'items': sorted(k for k in PROPS if k not in BASE), 'units': 'MakeHuman decimetres', 'marks': landmarks(hv[:n_skin], eye_info),
            'source': 'MakeHuman hm08 base mesh and targets via MPFB 2, CC0 1.0; textures and props generated by tools/avatar'}
    size = g.save(OUT + '/avatar.glb.raw', extras=meta)
    print('base glb raw', size, 'head tris', len(hf) + len(cap_tris) + len(eye_tris) + len(cornea_tris))
for pid in PROPS:
    if pid in BASE: continue
    # hair-* here are only the volumes parts_gear.py sizes the hats to; the hairstyles
    # themselves are built by hair_build.py, so never overwrite them
    if pid.startswith('hair-'): continue
    if ONLY is not None and pid not in ONLY and 'items' not in ONLY: continue
    g = GLB()
    stats[pid] = write_props(g, [(pid, PROPS[pid])])[pid]
    g.save(f'{OUT}/items/{pid}.glb.raw')
print(json.dumps(stats))
