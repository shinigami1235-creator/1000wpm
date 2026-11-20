"""Turn a hair model downloaded from Sketchfab (exported from Blender as GLB) into an .npz the
hair build reads: vertices in MakeHuman decimetres (Y up, +Z front), per-vertex UVs, triangles,
the base colour texture saved next to it as PNG, and, when the model has one, the surface the
hair was made on (H, HT: a head or a hair cap) so hair_build.py can warp it onto our head.

Two kinds of source:
  single  one hairstyle, maybe with its cap (a mesh or material named with cap, sclup or scalp).
          python3 hair_sketchfab.py single MODEL.glb OUT.npz [decimate ratio]
  slot    one hairstyle out of a collection of heads in a grid, untextured sculpted clumps.
          The heads are the same mesh in every slot, so a vertex that repeats at the same
          place in most other slots is head; islands that are mostly not head are hair.
          python3 hair_sketchfab.py slot MODEL.glb OUT.npz SPEC.json SLOT
          SPEC: a name in SPECS (vf01, vf08) or a JSON file
          {"offs": [[x, y, z] eye centre of every slot, Blender coords], "ipd": eye spacing}
          The hair is decimated to MAX_TRIS and gets strand UVs: along each clump's long axis,
          or combed down from the crown for the cap-like pieces. Its texture is 'proc:strands'.
"""
import sys, os, json, numpy as np
import bpy

TARGET_EYE = np.array([0.0, 7.42, 0.78])     # hm08 eye centre (between the eyes)
# the collections used, as exported from Blender after the Sketchfab import (target size 5 m):
# eye centre of every slot (Blender coordinates) and the eye spacing
SPECS = {
    'vf01': {'offs': [[-4.2643 + 0.7108 * i, y, 5.7565] for y in (-0.2324, -2.0095) for i in range(7)], 'ipd': 0.1982},
    'vf08': {'offs': [[0.586 * i, y, 3.1636] for y in (-0.1277, 0.8489) for i in range(6)], 'ipd': 0.1089},
}
TARGET_IPD = 0.66


def load_all(src):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        me = o.data; M = o.matrix_world; me.calc_loop_triangles()
        uvl = me.uv_layers.active.data if me.uv_layers else None
        P, UV, T = [], [], []
        for tri in me.loop_triangles:
            ids = []
            for li in tri.loops:
                w = M @ me.vertices[me.loops[li].vertex_index].co
                P.append((w.x, w.y, w.z)); UV.append(tuple(uvl[li].uv) if uvl else (0.0, 0.0)); ids.append(len(P) - 1)
            T.append(ids)
        tex = None
        for m in me.materials:
            if not (m and m.node_tree): continue
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and tex is None and 'normal' not in n.image.name.lower() and 'specular' not in n.image.name.lower():
                    tex = n.image
        mats = ' '.join(m.name for m in me.materials if m)
        out.append(dict(name=o.name + ' ' + mats, P=np.array(P), UV=np.array(UV), T=np.array(T), tex=tex))
    return out


def weld(P, UV, T, uv=True):
    key = {}; remap = np.zeros(len(P), int); kp, ku = [], []
    for i, (p, u) in enumerate(zip(np.round(P, 6), np.round(UV, 5))):
        k = (tuple(p), tuple(u)) if uv else tuple(p)
        if k not in key: key[k] = len(kp); kp.append(P[i]); ku.append(UV[i])
        remap[i] = key[k]
    return np.array(kp), np.array(ku), remap[T]


def islands(n, T):
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    r = np.concatenate([T[:, 0], T[:, 1], T[:, 2]]); c = np.concatenate([T[:, 1], T[:, 2], T[:, 0]])
    return connected_components(coo_matrix((np.ones(len(r)), (r, c)), shape=(n, n)), directed=False)[1]


def to_mh(P):
    """Blender world (Z up, front -Y) to MakeHuman axes (Y up, front +Z)."""
    return np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1)


def decimate(P, T, max_tris):
    if len(T) <= max_tris: return P, T
    me = bpy.data.meshes.new('d'); me.from_pydata(P.tolist(), [], T.tolist()); me.update()
    ob = bpy.data.objects.new('d', me); bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new('dec', 'DECIMATE'); md.ratio = max_tris / len(T); md.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); m2.calc_loop_triangles()
    P2 = np.array([tuple(v.co) for v in m2.vertices]); T2 = np.array([tuple(t.vertices) for t in m2.loop_triangles])
    ev.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return P2, T2


def decimate_uv(P, UV, T, ratio):
    """Collapse-decimate a textured mesh, keeping its UVs (seams kept as they were)."""
    me = bpy.data.meshes.new('d'); me.from_pydata(P.tolist(), [], T.tolist()); me.update()
    uvl = me.uv_layers.new(name='UV')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices): uvl.data[li].uv = UV[vi]
    ob = bpy.data.objects.new('d', me); bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new('dec', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); m2.calc_loop_triangles()
    uv2 = m2.uv_layers.active.data
    P2, UV2, T2 = [], [], []
    for tri in m2.loop_triangles:
        ids = []
        for li in tri.loops:
            P2.append(tuple(m2.vertices[m2.loops[li].vertex_index].co)); UV2.append(tuple(uv2[li].uv)); ids.append(len(P2) - 1)
        T2.append(ids)
    ev.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return weld(np.array(P2), np.array(UV2), np.array(T2))


def strand_uvs(P, T, crown, k=7.0):
    """UVs in decimetres times k: v along each island's long axis (pointing away from the
    crown), u across it. Islands that are not long (caps, wide sheets) get a round projection
    about the crown so the strands run from the crown down."""
    lab = islands(len(P), T); UV = np.zeros((len(P), 2))
    for i in np.unique(lab):
        m = np.where(lab == i)[0]; Q = P[m]; c = Q.mean(0)
        if len(m) >= 3:
            w, V = np.linalg.eigh(np.cov((Q - c).T)); w = np.maximum(w, 1e-12)
            ax, ac = V[:, 2], V[:, 1]
            long_ = w[2] / w[1] > 4.0 and np.sqrt(w[2]) < 0.6
        else:
            long_ = False
        if long_:
            if (c - crown) @ ax < 0: ax = -ax
            UV[m, 0] = (Q - c) @ ac * k + (i * 0.37) % 1.0
            UV[m, 1] = (Q - c) @ ax * k * 0.35 + (i * 0.61) % 1.0
        else:
            d = Q - crown; th = np.arctan2(d[:, 0], d[:, 2]); ph = np.arctan2(np.hypot(d[:, 0], d[:, 2]), d[:, 1])
            UV[m, 0] = th * 1.0 * k; UV[m, 1] = ph * 1.2 * k * 0.35
    return UV


def main_single(src, out, ratio=1.0):
    parts = load_all(src)
    hair = [p for p in parts if not any(s in p['name'].lower() for s in ('cap', 'sclup', 'scalp'))]
    cap = [p for p in parts if p not in hair]
    P = np.concatenate([p['P'] for p in hair]); UV = np.concatenate([p['UV'] for p in hair])
    T = np.concatenate([p['T'] + sum(len(q['P']) for q in hair[:k]) for k, p in enumerate(hair)])
    P, UV, T = weld(to_mh(P) * 10, UV, T)
    if ratio < 1.0: P, UV, T = decimate_uv(P, UV, T, ratio)
    extra = {}
    if cap:
        H = np.concatenate([p['P'] for p in cap]); HT = np.concatenate([p['T'] + sum(len(q['P']) for q in cap[:k]) for k, p in enumerate(cap)])
        H, _, HT = weld(to_mh(H) * 10, np.zeros((len(H), 2)), HT, uv=False)
        extra = dict(H=H, HT=HT)
    c = (P.min(0) + P.max(0)) / 2; P -= c
    if extra: extra['H'] = extra['H'] - c
    tex = next(p['tex'] for p in hair if p['tex'])
    png = os.path.abspath(os.path.splitext(out)[0] + '_diffuse.png')
    tex.filepath_raw = png; tex.file_format = 'PNG'; tex.save()
    np.savez(out, P=P, UV=UV, T=T, diffuse=png, **extra)
    print('verts', len(P), 'tris', len(T), 'size', (P.max(0) - P.min(0)).round(3), 'tex', tex.size[:], 'cap', len(extra.get('H', [])))


def main_slot(src, out, spec, slot, max_tris=16000):
    from scipy.spatial import cKDTree
    S = SPECS[spec] if spec in SPECS else json.load(open(spec)); offs = np.array(S['offs']); ipd = S['ipd']
    parts = load_all(src)
    P = np.concatenate([p['P'] for p in parts]); T = np.concatenate([p['T'] + sum(len(q['P']) for q in parts[:k]) for k, p in enumerate(parts)])
    P, _, T = weld(P, np.zeros((len(P), 2)), T, uv=False)
    lab = islands(len(P), T); nl = lab.max() + 1; cnt = np.bincount(lab, minlength=nl)
    cen = np.zeros((nl, 3)); np.add.at(cen, lab, P); cen /= cnt[:, None]
    isl_slot = np.linalg.norm(cen[:, None, :2] - offs[None, :, :2], axis=2).argmin(1); vs = isl_slot[lab]
    m = np.where(vs == slot)[0]; Q = P[m] - offs[slot]
    hits = np.zeros(len(m)); tol = 0.01 * ipd
    for t in range(len(offs)):
        if t == slot: continue
        d, _ = cKDTree(P[vs == t] - offs[t]).query(Q, distance_upper_bound=tol); hits += d < tol
    body = np.zeros(len(P), bool); body[m] = hits >= (len(offs) - 1) * S.get('body', 0.9)   # hair caps shared by a few styles stay hair
    bf = np.bincount(lab, weights=body, minlength=nl) / np.maximum(cnt, 1)
    hair_v = (vs == slot) & (bf[lab] < 0.5)
    head_v = (vs == slot) & (bf[lab] >= 0.5)
    k = TARGET_IPD / ipd
    X = to_mh(P - offs[slot]) * k + TARGET_EYE
    def sub(mask):
        tm = mask[T].all(1); Ts = T[tm]; used = np.unique(Ts); rm = -np.ones(len(P), int); rm[used] = np.arange(len(used))
        return X[used], rm[Ts]
    Hp, Ht = sub(hair_v); Gp, Gt = sub(head_v)
    n0 = len(Ht)
    Hp, Ht = decimate(Hp, Ht, max_tris)
    crown = TARGET_EYE + np.array([0, 0.95, -0.85])
    UV = strand_uvs(Hp, Ht, crown)
    np.savez(out, P=Hp, UV=UV, T=Ht, diffuse='proc:strands', H=Gp, HT=Gt, eye=TARGET_EYE)
    print('slot', slot, 'hair tris', n0, '->', len(Ht), 'verts', len(Hp), 'head verts', len(Gp))


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'single': main_single(sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 1.0)
    elif mode == 'slot': main_slot(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), int(sys.argv[6]) if len(sys.argv) > 6 else 16000)
    else:  # old form: MODEL.glb OUT.npz
        main_single(sys.argv[1], sys.argv[2])
