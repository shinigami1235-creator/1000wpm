"""Cut the head and bust out of the MakeHuman hm08 neutral mesh, decimate it to a
faceted low-poly mesh in Blender and bind every low-poly vertex to the dense mesh,
so any MakeHuman target can be carried across by barycentric interpolation.
Usage: python3 build_head.py OUT_PREFIX [ratio]"""
import os, sys, json, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mhlib import load_obj

out = sys.argv[1]; ratio = float(sys.argv[2]) if len(sys.argv) > 2 else 0.2
CUT_Y, SIDE_X, MARGIN = 4.62, 1.72, 0.35          # decimetres, MakeHuman space
V, F, G = load_obj()
neu = np.load(os.path.join(HERE, 'neu.npy'))

def region(margin):
    out = []
    for f, g in zip(F, G):
        if g != 'body': continue
        p = neu[f]
        if (p[:, 1] > CUT_Y - margin).all() and (np.abs(p[:, 0]) < SIDE_X + margin).all():
            out.append(f)
    return out

def to_b(p):   # MakeHuman dm (Y up, +Z front) -> Blender m (Z up, -Y front)
    return Vector((p[0] * .1, -p[2] * .1, p[1] * .1))

def make(name, faces):
    used = sorted({i for f in faces for i in f}); remap = {o: k for k, o in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_b(neu[i]) for i in used], [], [[remap[i] for i in f] for f in faces])
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob, np.array(used)

bpy.ops.wm.read_factory_settings(use_empty=True)
dense_faces = region(MARGIN)
dense, dense_idx = make('Dense', dense_faces)
low, _ = make('Head', region(MARGIN))

# cut: flat bottom across the upper chest, straight cuts through the shoulders
bm = bmesh.new(); bm.from_mesh(low.data)
for co, no in [((0, 0, CUT_Y * .1), (0, 0, -1)), ((SIDE_X * .1, 0, 0), (1, 0, 0)), ((-SIDE_X * .1, 0, 0), (-1, 0, 0))]:
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
bm.to_mesh(low.data); bm.free()

# detail weight: the face keeps more triangles than the back of the head and the shoulders
vg = low.vertex_groups.new(name='detail')
for v in low.data.vertices:
    x, y, z = v.co.x / .1, -v.co.y / .1, v.co.z / .1   # back to MakeHuman dm
    face = (z > 0.55) and (6.25 < y < 7.85) and abs(x) < 0.85
    ear = (0.62 < abs(x) < 0.9) and (6.85 < y < 7.6) and (-0.2 < z < 0.6)
    w = 1.0 if face else 0.55 if ear else (0.25 if y > 6.0 else 0.0)
    vg.add([v.index], w, 'REPLACE')
m = low.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio
m.use_symmetry = True; m.symmetry_axis = 'X'; m.vertex_group = 'detail'; m.vertex_group_factor = 4.0; m.invert_vertex_group = True
m.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = low; low.select_set(True)
bpy.ops.object.modifier_apply(modifier='dec')
bm = bmesh.new(); bm.from_mesh(low.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(low.data); bm.free()

# bind low verts to dense triangles (original MakeHuman vertex indices)
bm = bmesh.new(); bm.from_mesh(dense.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.verts.ensure_lookup_table()
tris = [[v.index for v in f.verts] for f in bm.faces]
dv = [v.co.copy() for v in bm.verts]
tree = BVHTree.FromPolygons(dv, tris)
bidx, bw = [], []
for v in low.data.vertices:
    loc, no, fi, d = tree.find_nearest(v.co)
    a, b, c = (dv[i] for i in tris[fi])
    from mathutils.geometry import barycentric_transform
    # barycentric weights of loc in triangle abc
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den; wu = 1 - wv - ww
    bidx.append([int(dense_idx[i]) for i in tris[fi]]); bw.append([wu, wv, ww])
lv = np.array([[v.co.x / .1, v.co.z / .1, -v.co.y / .1] for v in low.data.vertices])
lf = np.array([[i for i in p.vertices] for p in low.data.polygons])
np.savez(out + '.npz', verts=lv, faces=lf, bidx=np.array(bidx), bw=np.array(bw))
dense.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=out + '.blend')
print(json.dumps({'tris': len(lf), 'verts': len(lv), 'dense_tris': len(tris)}))
