"""Cut the head and bust out of the MakeHuman hm08 mesh (with its UVs), subdivide the head
and neck once for a smooth surface, and bind every vertex
to the dense MakeHuman mesh so any MakeHuman target can be carried across.
UV islands are repacked so the face gets most of the texture.
Usage: python3 build_head.py OUT_PREFIX"""
import os, sys, json, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mhlib import load_obj

out = sys.argv[1]
CUT_Y, SIDE_X, MARGIN = 4.62, 1.72, 0.35
V, F, G, VT, FT = load_obj(uv=True)
neu = np.load(os.path.join(HERE, 'neu.npy'))

def region(margin):
    return [k for k, (f, g) in enumerate(zip(F, G)) if g == 'body' and (neu[f][:, 1] > CUT_Y - margin).all() and (np.abs(neu[f][:, 0]) < SIDE_X + margin).all()]
def to_b(p): return Vector((p[0] * .1, -p[2] * .1, p[1] * .1))
def make(name, fids, with_uv):
    used = sorted({i for k in fids for i in F[k]}); remap = {o: j for j, o in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_b(neu[i]) for i in used], [], [[remap[i] for i in F[k]] for k in fids])
    if with_uv:
        uvl = me.uv_layers.new(name='UV')
        li = 0
        for k in fids:
            for t in FT[k]: uvl.data[li].uv = (VT[t][0], VT[t][1]); li += 1
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob, np.array(used)

def detail(x, y, z):
    eye = ((abs(x) - 0.33) / 0.32) ** 2 + ((y - 7.42) / 0.22) ** 2 < 1 and z > 0.7
    nose = abs(x) < 0.3 and 6.85 < y < 7.5 and z > 1.0
    mouth = abs(x) < 0.45 and 6.42 < y < 6.92 and z > 0.85
    face = (z > 0.35) and (6.15 < y < 7.9) and abs(x) < 0.85
    ear = (0.6 < abs(x) < 0.98) and (6.75 < y < 7.7) and (-0.3 < z < 0.7)
    return eye or nose or mouth

bpy.ops.wm.read_factory_settings(use_empty=True)
fids = region(MARGIN)
dense, dense_idx = make('Dense', fids, False)
low, _ = make('Head', fids, True)
for p in low.data.polygons: p.use_smooth = True
bpy.context.view_layer.objects.active = low; low.select_set(True)
bm = bmesh.new(); bm.from_mesh(low.data)
for co, no in [((0, 0, CUT_Y * .1), (0, 0, -1)), ((SIDE_X * .1, 0, 0), (1, 0, 0)), ((-SIDE_X * .1, 0, 0), (-1, 0, 0))]:
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=True)
# one smoothed subdivision of the head and neck only; the bust stays at base resolution
sel = [e for e in bm.edges if all(detail(v.co.x / .1, v.co.z / .1, -v.co.y / .1) for v in e.verts)]
bmesh.ops.subdivide_edges(bm, edges=sel, cuts=1, smooth=1.0, use_grid_fill=True, use_smooth_even=True)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
for v in bm.verts:
    if not v.is_boundary: continue
    if abs(v.co.z - CUT_Y * .1) < 0.003: v.co.z = CUT_Y * .1
    for sx in (1, -1):
        if abs(v.co.x - sx * SIDE_X * .1) < 0.003: v.co.x = sx * SIDE_X * .1
bm.to_mesh(low.data); bm.free()

# split vertices at UV seams: one output vertex per (position, uv) pair, plus a weld id
me = low.data; uvl = me.uv_layers.active.data
key2out, out_pos, out_uv, weld, tris = {}, [], [], [], []
for p in me.polygons:
    tri = []
    for li, vi in zip(p.loop_indices, p.vertices):
        u = tuple(np.round(uvl[li].uv, 5))
        k = (vi, u)
        if k not in key2out:
            key2out[k] = len(out_pos); co = me.vertices[vi].co
            out_pos.append([co.x / .1, co.z / .1, -co.y / .1]); out_uv.append(u); weld.append(vi)
        tri.append(key2out[k])
    tris.append(tri)
out_pos, out_uv, weld, tris = np.array(out_pos), np.array(out_uv), np.array(weld), np.array(tris)

# repack the UV islands: face big on the left, bust top right, ears and the rest below it
from collections import defaultdict
parent = list(range(len(out_uv)))
def find(a):
    while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
    return a
for t in tris:
    for a, b in ((t[0], t[1]), (t[1], t[2])): parent[find(a)] = find(b)
isl = defaultdict(list)
for i in range(len(out_uv)): isl[find(i)].append(i)
new_uv = out_uv.copy(); info = []
islands = sorted(isl.values(), key=len, reverse=True)
slots = {'face': (0.005, 0.005, 0.6, 0.99), 'bust': (0.61, 0.62, 0.385, 0.37)}
small_x = 0.61
for ids in islands:
    uv = out_uv[ids]; lo, hi = uv.min(0), uv.max(0); y3 = out_pos[ids][:, 1].mean()
    if len(ids) < 12:                 # slivers left at the cuts: park them in a corner
        new_uv[ids] = 0.995; info.append(('sliver', len(ids))); continue
    if lo[0] > 0.6 and hi[1] - lo[1] > 0.5: slot = 'face'
    elif lo[1] > 0.6: slot = 'bust'
    else: slot = None
    if slot:
        x0, y0, w, h = slots[slot]
    else:
        sc = 1.5 if (hi - lo).max() < 0.2 else 1.0
        w, h = (hi - lo) * sc
        if (hi - lo).max() < 0.2:        # ears, side by side along the bottom
            x0, y0 = small_x, 0.01; small_x += w + 0.02
        else:                            # under the chin and the neck
            x0, y0 = 0.61, 0.24
    s = min(w / (hi[0] - lo[0]), h / (hi[1] - lo[1]))
    new_uv[ids] = (uv - lo) * s + [x0, y0]
    info.append((slot, len(ids), round(float(y3), 2), round(float(s), 2)))
print('islands', info)

# bind to the dense MakeHuman triangles
bm = bmesh.new(); bm.from_mesh(dense.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.verts.ensure_lookup_table()
dtris = [[v.index for v in f.verts] for f in bm.faces]
dv = [v.co.copy() for v in bm.verts]
tree = BVHTree.FromPolygons(dv, dtris)
bidx, bw = [], []
for p in out_pos:
    loc, no, fi, d = tree.find_nearest(to_b(p))
    a, b, c = (dv[i] for i in dtris[fi])
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den
    bidx.append([int(dense_idx[i]) for i in dtris[fi]]); bw.append([1 - wv - ww, wv, ww])
dvm = np.array([[p.x / .1, p.z / .1, -p.y / .1] for p in dv])
# uv_mh keeps the MakeHuman hm08 UVs, so skin textures made for MakeHuman can be baked across
np.savez(out + '.npz', verts=out_pos, faces=tris, uv=new_uv, uv_mh=out_uv, weld=weld, bidx=np.array(bidx), bw=np.array(bw), dense_verts=dvm, dense_faces=np.array(dtris))
print(json.dumps({'tris': len(tris), 'verts': len(out_pos), 'welded': int(weld.max() + 1), 'dense_tris': len(dtris)}))
