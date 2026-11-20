"""Build the outfits and jewellery from MakeHuman clothes proxies (CC0 and CC-BY, see
assets/avatar/LICENSES.md, "Clothing").
Each garment is fitted to the neutral hm08 body through its .mhclo binding, cut at the bust
line, pushed clear of the skin and of the layer under it, given baked ambient occlusion
and its own fabric textures (cloth_tex.py). Necklaces carry a lift per outfit so they lie
on top of the tee or sweater and under an open shirt, jacket or hood.
Output: assets/avatar/items/fit-<id>.glb.raw and acc-<id>.glb.raw (packed later by
pack_all.mjs) and assets/avatar/tex/cloth_*.webp.
The runtime (js/app/avatar-cloth.js) binds every vertex to the nearest head vertices when
the file loads, so clothes follow the head, neck and body sliders.
Usage: python3 cloth_build.py HEAD_NPZ NEU_NPY OUT_DIR [ids,...]"""
import os, sys, math, json, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from collections import defaultdict
from geom import Surface, smooth, torus, lathe, tube, Part
from gltf_writer import GLB, FLOAT, U8, U16
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import hair_mh, cloth_tex as CT

PACKS = os.environ.get('MH_PACKS', '/home/claude/mhpacks')
CUT_Y, SIDE_X = 4.62, 1.72


def find(name):
    for pack in sorted(os.listdir(PACKS)):
        d = os.path.join(PACKS, pack, 'clothes', name)
        if os.path.isdir(d): return d
    raise FileNotFoundError(name)


# ---------- mesh helpers ----------
def compact(P, T, *per_vertex):
    used = np.unique(T); remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
    return (P[used], remap[T]) + tuple(a[used] for a in per_vertex)


def vnormals(P, T):
    n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]); N = np.zeros_like(P)
    for k in range(3): np.add.at(N, T[:, k], n)
    return N / (np.linalg.norm(N, axis=1)[:, None] + 1e-12)


def weld_ids(P, eps=1e-4):
    key = {}; return np.array([key.setdefault(tuple(np.round(p / eps).astype(int)), len(key)) for p in P])


def neighbours(T, W):
    nb = defaultdict(set)
    for t in T:
        a, b, c = W[t]
        nb[a] |= {b, c}; nb[b] |= {a, c}; nb[c] |= {a, b}
    return nb


def islands(P, T, src=None):
    par = np.arange(len(P))
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    if src is not None:
        first = {}
        for i, s in enumerate(src):
            if s in first: par[f(i)] = f(first[s])
            else: first[s] = i
    for t in T: par[f(t[1])] = f(t[0]); par[f(t[2])] = f(t[0])
    return np.array([f(i) for i in range(len(P))])


class Body:
    """The neutral head and bust (skin only), for nearest-point pushes and AO."""
    def __init__(self, head_npz):
        h = np.load(head_npz)
        self.V, self.T = h['verts'], h['faces']
        self.S = Surface(self.V, self.T)

    def signed(self, p):
        loc, fi, d = self.S.nearest(p)
        n = self.S.normal_at(loc)
        return loc, n, float((p - loc) @ n)


def push_out(P, T, surf, gap, ymin=CUT_Y + 0.06, xmax=SIDE_X - 0.04, smooth_iters=4, normal_of=None):
    """Move vertices that sit closer than gap (or inside) out along the surface normal,
    then spread the moves over the neighbours so the cloth keeps a smooth shape."""
    disp = np.zeros_like(P)
    for i, p in enumerate(P):
        if p[1] < ymin or abs(p[0]) > xmax: continue
        loc, n, d = surf.signed(p)
        g = gap(p) if callable(gap) else gap
        if d < g: disp[i] = n * (g - d)
    W = weld_ids(P); nb = neighbours(T, W)
    dw = np.zeros((W.max() + 1, 3)); np.add.at(dw, W, disp); cnt = np.bincount(W); dw /= cnt[:, None]
    for _ in range(smooth_iters):
        new = dw.copy()
        for w, ns in nb.items():
            avg = dw[list(ns)].mean(0)
            # never shrink a push, only spread it
            m = 0.5 * dw[w] + 0.5 * avg
            new[w] = np.where(np.abs(m) > np.abs(dw[w]), m, dw[w])
        dw = new
    return P + dw[W]


class MeshSurf:
    """Nearest-point and normal on another garment layer (for layer-over-layer pushes)."""
    def __init__(self, P, T):
        self.P, self.T = P, T
        self.tree = BVHTree.FromPolygons([Vector(p) for p in P], [list(map(int, t)) for t in T])
        self.vn = vnormals(P, T)

    def signed(self, p):
        loc, no, fi, d = self.tree.find_nearest(Vector(p))
        loc = np.array(loc); a, b, c = self.T[fi]
        n = self.vn[a] + self.vn[b] + self.vn[c]; n /= np.linalg.norm(n) + 1e-12
        return loc, n, float((p - loc) @ n)


def outward(P, T, body):
    """Vertex normals turned to face away from the body."""
    N = vnormals(P, T)
    for i, p in enumerate(P):
        loc, fi, d = body.S.nearest(p)
        if N[i] @ (p - loc) < 0: N[i] = -N[i]
    return N


def hemi(n=24):
    out = []
    for k in range(n):
        z = 1 - (k + 0.5) / n; r = math.sqrt(max(0.0, 1 - z * z)); a = k * 2.39996
        out.append((r * math.cos(a), r * math.sin(a), z))
    return np.array(out)
DIRS = hemi(24)


def bake_ao(parts, body, dist=0.7):
    V = [Vector(p) for p in body.V]; T = [list(map(int, t)) for t in body.T]
    for pt in parts:
        o = len(V); V += [Vector(p) for p in pt['P']]; T += [[int(a) + o, int(b) + o, int(c) + o] for a, b, c in pt['T']]
    tree = BVHTree.FromPolygons(V, T)
    for pt in parts:
        P = pt['P']; N = outward(P, pt['T'], body); ao = np.ones(len(P))
        for i, (p, n) in enumerate(zip(P, N)):
            a = np.cross(n, [0, 1.0, 0]) if abs(n[1]) < 0.9 else np.cross(n, [1.0, 0, 0])
            a /= np.linalg.norm(a); b = np.cross(n, a); org = Vector(p + n * 0.008); hit = tot = 0.0
            for dx, dy, dz in DIRS:
                loc, no, fi, dd = tree.ray_cast(org, Vector(a * dx + b * dy + n * dz), dist)
                tot += dz
                if loc is not None: hit += dz * (1 - dd / dist) ** 0.7
            ao[i] = 1 - hit / tot
        # hems, collar edges and openings read as a fold: a touch darker right at the edge
        W = weld_ids(P); from collections import Counter
        ec = Counter()
        for t in pt['T']:
            for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): ec[tuple(sorted((W[e[0]], W[e[1]])))] += 1
        edge_w = {w for e, k in ec.items() if k == 1 for w in e}
        ring = set()
        for t in pt['T']:
            ws = set(W[t])
            if ws & edge_w: ring |= ws
        k = np.array([0.72 if W[i] in edge_w else 0.88 if W[i] in ring else 1.0 for i in range(len(P))]) if pt.get('edges', True) else 1.0
        pt['ao'] = np.clip(ao * k, 0, 1)


def subdivide(g, levels=1):
    """Split every triangle in four, with the new points moved onto a smooth surface through
    the old ones, so silhouettes and collars stay round. UVs are carried along."""
    import bmesh
    for _ in range(levels):
        P, T, UV = g['P'], g['T'], g['UV']
        bm = bmesh.new(); vs = [bm.verts.new(Vector(p)) for p in P]; bm.verts.index_update()
        uvl = bm.loops.layers.uv.new()
        for t in T:
            try: f = bm.faces.new([vs[i] for i in t])
            except ValueError: continue
            for loop, i in zip(f.loops, t): loop[uvl].uv = (float(UV[i][0]), float(UV[i][1]))
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=1.0)
        bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.verts.index_update()
        # one vertex per (position, uv) pair, as the source meshes have
        key, outP, outUV, tris = {}, [], [], []
        for f in bm.faces:
            ids = []
            for loop in f.loops:
                k = (loop.vert.index if loop.vert.index >= 0 else id(loop.vert), round(loop[uvl].uv[0], 5), round(loop[uvl].uv[1], 5))
                if k not in key: key[k] = len(outP); outP.append(tuple(loop.vert.co)); outUV.append(tuple(loop[uvl].uv))
                ids.append(key[k])
            tris.append(ids)
        bm.free()
        g['P'], g['UV'], g['T'] = np.array(outP), np.array(outUV), np.array(tris)
        g['src'] = weld_ids(g['P'])
    return g


# ---------- sources ----------
def garment(name, keep_island=None, keep_tri=None, subdiv=1):
    r = hair_mh.fit(find(name), NEU)
    P, UV, T, src = r['P'], r['UV'], r['T'], r['src']
    if keep_island is not None:
        isl = islands(P, T, src)
        ok = set()
        for k in np.unique(isl):
            sel = isl == k
            if keep_island(P[sel]): ok.add(k)
        T = T[[isl[t[0]] in ok for t in T]]
    cen = P[T].mean(1)
    keep = (P[T][:, :, 1].max(1) > CUT_Y - 0.02) & (np.abs(cen[:, 0]) < 1.86)
    if keep_tri is not None: keep &= np.array([keep_tri(c) for c in cen])
    T = T[keep]
    P, T, UV, src = compact(P, T, UV, src)
    g = dict(P=P, T=T, UV=UV, src=src, dir=find(name), mat=r['mat'], diffuse=r['diffuse'], normal=r['normal'])
    return subdivide(g, subdiv) if subdiv else g


def tex_path(g, key):
    m = g['mat']
    if key in m and os.path.exists(os.path.join(g['dir'], m[key])): return os.path.join(g['dir'], m[key])
    return None


def textures(g, name, recipe, out_dir, cap=1024):
    """Writes cloth_<name>_d/_n.webp from the garment's texture set; remaps g['UV'] to the
    cropped atlas. recipe: albedo ('lum' | 'flat'), contrast, ao (path or None), normal
    (path, 'bump:<path>' or None), nstrength, rough (path or None)."""
    UV = g['UV']; box = CT.crop_box(UV)
    base = 2048
    size = CT.out_size(box, base, cap)
    mask = CT.uv_mask(UV, g['T'], box, size)
    def get(path, mode='RGB'):
        a = CT.load(path, mode=mode)
        a = CT.resize(CT.crop(a, box) if a.ndim == 3 else CT.crop(a, box), size)
        return a
    # albedo detail, grey
    if recipe.get('albedo', 'lum') == 'lum' and g['diffuse']:
        L = CT.lum(get(g['diffuse']))
        med = np.median(L[mask]) if mask.any() else 0.5
        grey = 0.9 + (L - med) / max(med, 0.05) * 0.9 * recipe.get('contrast', 0.6)
    else:
        grey = np.full(size[::-1], 0.9)
    if recipe.get('ao'):
        ao = CT.lum(get(recipe['ao']))
        grey *= np.clip(ao, 0, 1) ** recipe.get('ao_pow', 0.6)
    grey = np.clip(grey, 0.05, 1.0)
    grey = CT.bleed(grey, mask)
    # normal
    nsrc = recipe.get('normal', 'auto')
    if nsrc == 'auto': nsrc = g['normal']
    if nsrc and nsrc.startswith('bump:'):
        h = CT.lum(get(nsrc[5:]))
        h = CT.blur(h, 1.0)
        nrm = CT.height_to_normal(h, recipe.get('bump', 6.0) * size[0] / 1024)
    elif nsrc:
        nrm = get(nsrc)
        if recipe.get('nflip_g'): nrm[..., 1] = 1 - nrm[..., 1]
        k = recipe.get('nstrength', 1.0)
        if k != 1.0:
            n = nrm * 2 - 1; n[..., :2] *= k; n /= np.linalg.norm(n, axis=2)[..., None]; nrm = n * 0.5 + 0.5
    else:
        nrm = np.dstack([np.full(size[::-1], 0.5), np.full(size[::-1], 0.5), np.ones(size[::-1])])
    nrm = CT.bleed(nrm, mask)
    out = {}
    rgb = np.dstack([grey] * 3)
    pd = os.path.join(out_dir, 'tex', f'cloth_{name}_d.webp'); pn = os.path.join(out_dir, 'tex', f'cloth_{name}_n.webp')
    if recipe.get('rough'):
        r_ = CT.lum(get(recipe['rough'])); r_ = CT.bleed(r_, mask)
        r_ = r_ / max(np.median(r_[mask]), 0.05)            # a scale on the material roughness
        out['d'] = CT.save_rgba(rgb, np.clip(r_ * 0.5, 0, 1), pd)
    else:
        out['d'] = CT.save_rgb(rgb, pd)
    out['n'] = CT.save_rgb(nrm, pn, q=86)
    u0, v0, u1, v1 = box
    g['UV'] = np.stack([(UV[:, 0] - u0) / (u1 - u0), (UV[:, 1] - v0) / (v1 - v0)], 1)
    # world size of one UV unit, for the detail normal's tiling
    P, T, U = g['P'], g['T'], g['UV']
    aw = np.linalg.norm(np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]), axis=1)
    du1, du2 = U[T[:, 1]] - U[T[:, 0]], U[T[:, 2]] - U[T[:, 0]]
    au = np.abs(du1[:, 0] * du2[:, 1] - du1[:, 1] * du2[:, 0])
    ok = au > 1e-9
    g['uvworld'] = float(np.median(np.sqrt(aw[ok] / au[ok])))
    out['size'] = size
    return out


# ---------- writing ----------
def write(pid, parts, out_dir, extras=None):
    g = GLB(); meta = []
    for pt in parts:
        P, T = np.asarray(pt['P'], float), np.asarray(pt['T'])
        assert len(P) < 65536, (pid, len(P))
        pa, qo, qs = g.qvec3(P)
        uv = np.asarray(pt.get('UV', np.zeros((len(P), 2))), np.float32)
        col = np.ones((len(P), 4)); col[:, :3] = np.asarray(pt.get('ao', np.ones(len(P))))[:, None]
        attrs = {'POSITION': pa, 'TEXCOORD_0': g.accessor(uv, FLOAT, 'VEC2', target=34962),
                 'COLOR_0': g.accessor(np.round(np.clip(col, 0, 1) * 255).astype(np.uint8), U8, 'VEC4', target=34962, normalized=True)}
        if 'path' in pt: attrs['_PATH'] = g.accessor(np.asarray(pt['path'], np.uint16).reshape(-1, 1).repeat(2, 1), U16, 'VEC2', target=34962)
        prim = {'attributes': attrs, 'indices': g.accessor(T.astype(np.uint16).reshape(-1), U16, 'SCALAR', target=34963), 'material': g.material(pt['mat'])}
        ex = {'q': [qo, qs], 'mat': pt['mat']}
        for k in ('tex', 'detail', 'dscale', 'layer', 'tint', 'stripe', 'rough', 'nscale', 'sheen', 'ralpha', 'under', 'hide'):
            if k in pt: ex[k] = pt[k]
        g.mesh(pt['name'], [prim], extras=ex)
        meta.append([pt['name'], pt['mat'], int(len(P)), int(len(T))])
    ex = {'cloth': pid, 'parts': meta}
    if extras: ex.update(extras)
    size = g.save(f'{out_dir}/items/{pid}.glb.raw', extras=ex)
    return size


DETAIL_PERIOD = {'jersey': 0.05, 'pique': 0.05, 'rib': 0.1, 'fleece': 0.14, 'weave': 0.035, 'leather': 0.16}


def part(name, g, mat, texname, detail, **kw):
    d = dict(name=name, P=g['P'], T=g['T'], UV=g['UV'], mat=mat, tex=texname, detail=detail,
             dscale=round(g.get('uvworld', 3.0) / DETAIL_PERIOD.get(detail, 0.08), 2))
    d.update(kw)
    return d


# ---------- outfits ----------
SYS = 'makehuman_system_assets_cc0/clothes/'
def sysclo(name, f): return os.path.join(PACKS, SYS, name, f)


def tee(body, out_dir, gap=0.012):
    g = garment('male_casualsuit06')
    g['P'] = push_out(g['P'], g['T'], body, gap)
    tx = textures(g, 'tee', dict(albedo='flat', ao=sysclo('male_casualsuit06', 'male_casualsuit06_ao.png'), ao_pow=0.8), out_dir)
    return g, tx


def open_front(g, body, opening, ymax=5.95):
    """Unbutton a shirt: split the front down the middle and spread the two panels."""
    P, T, UV = g['P'], g['T'], g['UV']
    cen = P[T].mean(1)
    front = lambda c: c[2] > 0.2 and c[1] < ymax
    side_t = np.where(cen[:, 0] >= 0, 1, -1)
    # vertices used by both sides of the split get a copy for each side
    owner = {}; newP, newUV, T2 = list(P), list(UV), T.copy()
    for k, t in enumerate(T):
        if not front(cen[k]): continue
        for j, v in enumerate(t):
            if abs(P[v][0]) > 0.2: continue
            key = (v, side_t[k])
            if v not in owner: owner[v] = side_t[k]
            if owner[v] != side_t[k]:
                if key not in owner:
                    owner[key] = len(newP); newP.append(P[v].copy()); newUV.append(UV[v].copy())
                T2[k][j] = owner[key]
    P = np.array(newP); UV = np.array(newUV)
    # the new open edges follow the triangles, so they zigzag: move them onto the middle line
    from collections import Counter
    ec = Counter()
    for t in T2:
        for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): ec[tuple(sorted(e))] += 1
    on_edge = set()
    for t in T2:
        for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if ec[tuple(sorted(e))] == 1: on_edge |= {e[0], e[1]}
    for v in on_edge:
        p = P[v]
        if p[2] > 0.2 and p[1] < ymax - 0.05 and abs(p[0]) < 0.2: P[v][0] = 0.0
    side = np.zeros(len(P))
    for k, t in enumerate(T2):
        if front(cen[k]): side[t] = side_t[k]
    off0 = np.array([body.signed(p)[2] if p[1] > 4.7 else 0.0 for p in P])
    for i, p in enumerate(P):
        if side[i] == 0 or p[2] < 0.1: continue
        w = 1 - smooth(0.08, 1.0, abs(p[0]))
        q = p.copy()
        q[0] = side[i] * max(0.0, side[i] * q[0])        # a point just over the middle belongs to its own side
        q[0] += side[i] * opening(p[1]) * w
        if q[1] > 4.7:
            loc, n, d = body.signed(q)
            q = loc + n * max(off0[i], 0.02) + n * 0.012 * w      # the placket edge sits a little proud
        P[i] = q
    g['P'], g['T'], g['UV'], g['src'] = P, T2, UV, np.zeros(len(P), int)
    return g


def layer_push(g, under, gap):
    """Push a garment out of the one under it."""
    ms = MeshSurf(under['P'], under['T'])
    g['P'] = push_out(g['P'], g['T'], ms, gap, smooth_iters=6)
    return g


def plates_part(base):
    """Cyber shoulder plates over the tee: three overlapping metal shells a side, each with a
    thin glowing trim, fitted to the top of the tee."""
    tree = BVHTree.FromPolygons([Vector(p) for p in base['P']], [list(map(int, t)) for t in base['T']])
    def top_y(x, z):
        loc, no, fi, d = tree.ray_cast(Vector((x, 7.0, z)), Vector((0, -1.0, 0)), 4)
        return loc[1] if loc is not None else 4.8
    metal = Part('metal'); trim = Part('glow')
    for sx in (1, -1):
        for cx, cz, rx, rz, lift in [(0.98, 0.0, 0.3, 0.42, 0.08), (1.24, 0.02, 0.3, 0.46, 0.1), (1.48, 0.04, 0.24, 0.46, 0.11)]:
            rings, segs = 6, 28
            pts = []
            for i in range(rings + 1):
                for k in range(segs if i else 1):
                    u = i / rings; a = 2 * math.pi * k / segs
                    x = cx + rx * u * math.cos(a); z = cz + rz * u * math.sin(a)
                    pts.append((x * sx, z, u, top_y(x * sx, z)))
            A = np.array([[1, p[0], p[1]] for p in pts]); yv = np.array([p[3] for p in pts])
            coef = np.linalg.lstsq(A, yv, rcond=None)[0]
            raise_by = max(0.0, float((yv - A @ coef).max())) + 0.035
            grid, n = [], 0
            for i in range(rings + 1):
                row = []
                for k in range(segs if i else 1):
                    x, z, u, _ = pts[n]; n += 1
                    y = coef[0] + coef[1] * x + coef[2] * z + raise_by + lift * (1 - u * u)
                    row.append(metal.add(np.array([x, y, z]), 1.0, 1, (x, z)))
                grid.append(row)
            for k in range(segs): metal.tri(grid[0][0], grid[1][k], grid[1][(k + 1) % segs])
            for i in range(1, rings):
                for k in range(segs):
                    j = (k + 1) % segs; metal.quad(grid[i][k], grid[i + 1][k], grid[i + 1][j], grid[i][j])
            rim = grid[-1]; c = np.array([cx * sx, 0, cz])
            bev = [metal.add(metal.v[i] + (metal.v[i] - np.array([c[0], metal.v[i][1], c[2]])) * 0.05 + np.array([0, -0.025, 0])) for i in rim]
            low = [metal.add(metal.v[i] + np.array([0, -0.07, 0])) for i in bev]
            for k in range(segs):
                j = (k + 1) % segs; metal.quad(rim[k], bev[k], bev[j], rim[j]); metal.quad(bev[k], low[k], low[j], bev[j])
            # glowing trim: a thin strip just inside the rim
            t0 = [trim.add(metal.v[grid[-2][k]] * 0.25 + metal.v[rim[k]] * 0.75 + np.array([0, 0.006, 0])) for k in range(segs)]
            t1 = [trim.add(metal.v[grid[-2][k]] * 0.12 + metal.v[rim[k]] * 0.88 + np.array([0, 0.006, 0])) for k in range(segs)]
            for k in range(segs):
                j = (k + 1) % segs; trim.quad(t0[k], t1[k], t1[j], t0[j])
    out = []
    for pt in (metal, trim):
        P = np.array(pt.v); T = np.array(pt.t)
        out.append(dict(name=pt.mat, P=P, T=T, UV=np.zeros((len(P), 2)), mat=pt.mat, edges=False))
    return out


def drawstrings(g):
    """Two cords with metal tips, hanging from the neck of the hood."""
    tree = BVHTree.FromPolygons([Vector(p) for p in g['P']], [list(map(int, t)) for t in g['T']])
    cords = Part('cord'); tips = Part('silver')
    for s in (-1, 1):
        # the cords come out of the hood's edge, just outside the opening, and hang straight
        def edge_x(y):
            for x in np.arange(0.1, 0.9, 0.01):
                loc, no, fi, d = tree.ray_cast(Vector((s * x, y, 3.0)), Vector((0, 0, -1.0)), 5)
                if loc is not None and loc[2] > 0.5: return x, loc[2]
            return None
        top = edge_x(5.95)
        x0 = (top[0] if top else 0.3) + 0.06
        pts = []
        for k, y in enumerate(np.linspace(5.95, 5.25, 9)):
            loc, no, fi, d = tree.ray_cast(Vector((s * x0, y, 3.0)), Vector((0, 0, -1.0)), 5)
            if loc is None: continue
            pts.append(np.array([s * x0, y, loc[2] + 0.026]))
        cords.merge(tube(pts, [0.017] * len(pts), 8, 'cord'))
        d = pts[-1] - pts[-2]; d /= np.linalg.norm(d)
        tips.merge(lathe(pts[-1], d, [(0.0, 0.019), (0.02, 0.022), (0.1, 0.021), (0.11, 0.0)], 8, 'silver'))
    out = []
    for pt, mat in ((cords, 'cord'), (tips, 'silver')):
        P = np.array(pt.v); T = np.array(pt.t)
        d = dict(name=mat, P=P, T=T, UV=np.zeros((len(P), 2)), mat=mat, edges=False)
        if mat == 'cord': d.update(detail='jersey', dscale=1.0, tint='under', under='light', rough=0.9)
        out.append(d)
    return out


LAYERS = {}     # outfit id -> the garment meshes a necklace lies on


def build_outfits(body, out_dir, only=None):
    stats = {}
    def want(pid): return only is None or pid in only or 'acc' in only
    def done(pid, parts, tex):
        LAYERS[pid[4:]] = [(p['P'], p['T']) for p in parts if p.get('layer') == 'base']
        if only is not None and pid not in only: return
        bake_ao(parts, body)
        stats[pid] = dict(raw=write(pid, parts, out_dir), tex=tex, verts=sum(len(p['P']) for p in parts), tris=sum(len(p['T']) for p in parts))
    tee_g = tx_tee = None
    if any(want(p) for p in ('fit-crew', 'fit-shirt', 'fit-jacket', 'fit-plates')):
        tee_g, tx_tee = tee(body, out_dir)
    def tee_part(tint='main', stripe=1):
        return part('tee', tee_g, 'fabric', 'cloth_tee', 'jersey', tint=tint, stripe=stripe, rough=0.85, layer='base')
    if want('fit-crew'):
        done('fit-crew', [tee_part()], tx_tee)
    if want('fit-tank'):
        g = garment('toigo_camisole_top')
        g['P'] = push_out(g['P'], g['T'], body, 0.01)
        tx = textures(g, 'tank', dict(albedo='flat'), out_dir)
        done('fit-tank', [part('tank', g, 'fabric', 'cloth_tank', 'jersey', rough=0.85, layer='base')], tx)
    if want('fit-shirt'):
        g = garment('male_casualsuit03', keep_island=lambda V: np.abs(V[:, 0]).max() > 3)
        g = open_front(g, body, lambda y: 0.26 * smooth(5.95, 5.45, y) + 0.05 * smooth(5.4, 4.7, y))
        g = layer_push(g, tee_g, 0.03)
        tx = textures(g, 'shirt', dict(albedo='flat', nstrength=1.3), out_dir)
        done('fit-shirt', [tee_part('under', 0), part('shirt', g, 'fabric', 'cloth_shirt', 'weave', rough=0.8, layer='outer')], {'tee': tx_tee, 'shirt': tx})
    if want('fit-jacket'):
        g = garment('male_casualsuit05', keep_island=lambda V: np.abs(V[:, 0]).max() > 4)
        g = layer_push(g, tee_g, 0.04)
        tx = textures(g, 'jacket', dict(albedo='flat', nstrength=1.6), out_dir)
        jp = part('jacket', g, 'leather', 'cloth_jacket', 'leather', rough=0.5, layer='outer')
        tp = tee_part('under', 0); tp['under'] = 'light'
        done('fit-jacket', [tp, jp], {'tee': tx_tee, 'jacket': tx})
    if want('fit-hoodie'):
        g = garment('elvs_hooded_sweat_jacket1', subdiv=0)
        g['P'] = push_out(g['P'], g['T'], body, 0.02)
        d = find('elvs_hooded_sweat_jacket1')
        tx = textures(g, 'hoodie', dict(albedo='flat', normal=os.path.join(d, 'normalshoodie.png'), nstrength=1.0), out_dir)
        # the hood lying behind the neck is its own part, hidden when the hood is up (hair 'hood')
        cen = g['P'][g['T']].mean(1)
        def in_hood(c):
            if c[1] > 6.35: return True
            if c[1] < 5.85 or c[2] > 0.55: return False
            loc, n, d = body.signed(c)
            return d > 0.16
        hood_t = np.array([in_hood(c) for c in cen])
        parts = []
        for nm, sel, kw in (('hoodie', ~hood_t, dict(layer='base')), ('hood', hood_t, dict(hide='hood', layer='outer'))):
            P, T, UV = compact(g['P'], g['T'][sel], g['UV'])
            parts.append(part(nm, dict(P=P, T=T, UV=UV, uvworld=g['uvworld']), 'fabric', 'cloth_hoodie', 'fleece', rough=0.92, **kw))
        done('fit-hoodie', parts + drawstrings(g), tx)
    if want('fit-collar'):
        g = garment('mindfront_knitted_sweater_01')
        g['P'] = push_out(g['P'], g['T'], body, 0.015)
        tx = textures(g, 'collar', dict(albedo='lum', contrast=0.5), out_dir, cap=768)
        done('fit-collar', [part('collar', g, 'fabric', 'cloth_collar', 'rib', rough=0.9, layer='base')], tx)
    if want('fit-polo'):
        d = find('namuhekam_male_polo_shirt')
        g = garment('namuhekam_male_polo_shirt')
        g['P'] = push_out(g['P'], g['T'], body, 0.012)
        tx = textures(g, 'polo', dict(albedo='lum', contrast=0.4, normal=os.path.join(d, 'Polo_Normal_OpenGL.png'), rough=os.path.join(d, 'Polo_Roughness.png')), out_dir, cap=768)
        # the collar and placket buttons are their own islands: plain, in the trim colour
        isl = islands(g['P'], g['T'], weld_ids(g['P'])); sizes = np.bincount(isl)
        body_isl = np.argmax(sizes)
        main_t = np.array([isl[t[0]] == body_isl for t in g['T']])
        parts = []
        for nm, sel, kw in (('polo', main_t, dict(stripe=1, tint='main', layer='base')), ('collar', ~main_t, dict(tint='trim', layer='outer'))):
            P, T, UV = compact(g['P'], g['T'][sel], g['UV'])
            gg = dict(P=P, T=T, UV=UV, uvworld=g['uvworld'])
            parts.append(part(nm, gg, 'fabric', 'cloth_polo', 'pique', rough=0.85, ralpha=1, **kw))
        done('fit-polo', parts, tx)
    if want('fit-sweater'):
        d = find('toigo_fisherman_sweater')
        g = garment('toigo_fisherman_sweater')
        g['P'] = push_out(g['P'], g['T'], body, 0.018)
        tx = textures(g, 'sweater', dict(albedo='lum', contrast=0.45, normal=os.path.join(d, 'shirt-knit-NORM.png')), out_dir)
        done('fit-sweater', [part('sweater', g, 'fabric', 'cloth_sweater', 'rib', rough=0.92, layer='base')], tx)
    if want('fit-plates'):
        done('fit-plates', [tee_part()] + plates_part(tee_g), tx_tee)
    return stats


# ---------- jewellery and glasses ----------
NECK_C = np.array([0.0, 0.0, 0.08])        # the neck's axis (x, z) for necklace rays


def ring_surface(Ls, body):
    """outer(theta, y): distance from the neck axis to the outside of the skin and the
    given garment layers, along a level ray."""
    V = [Vector(p) for p in body.V]; T = [list(map(int, t)) for t in body.T]
    for P, Tt in Ls:
        o = len(V); V += [Vector(p) for p in P]; T += [[int(a) + o, int(b) + o, int(c) + o] for a, b, c in Tt]
    tree = BVHTree.FromPolygons(V, T)
    def outer(th, y):
        d = np.array([math.sin(th), 0, math.cos(th)]); o = np.array([NECK_C[0], y, NECK_C[2]]) + d * 3
        loc, no, fi, dist = tree.ray_cast(Vector(o), Vector(-d), 4)
        return 3 - dist if loc is not None else 0.5
    return outer


def necklace_path(body, front_y, back_y, n):
    """A closed loop round the neck that hangs from back_y to front_y, following the length
    and shape of the MakeHuman pearl necklace scaled to that drop."""
    g = garment('toigo_pearl_necklace', subdiv=0)
    isl = islands(g['P'], g['T'], g['src'])
    cs = np.array([g['P'][isl == k].mean(0) for k in np.unique(isl)])
    th = np.arctan2(cs[:, 0] - NECK_C[0], cs[:, 2] - NECK_C[2]); y = cs[:, 1]
    order = np.argsort(th); th, y = th[order], y[order]
    y0, y1 = y.min(), y.max()
    drop = (y - y1) / (y0 - y1)                         # 0 at the back, 1 at the front
    ths = np.linspace(-math.pi, math.pi, n, endpoint=False)
    d = np.interp(ths, np.concatenate([th - 2 * math.pi, th, th + 2 * math.pi]), np.concatenate([drop] * 3))
    ys = back_y + (front_y - back_y) * d
    return ths, ys


def chain_links(pts, R, r, mat, n_major=8, n_minor=4):
    part = Part(mat); idx = []
    for k in range(len(pts)):
        p = pts[k]; q = pts[(k + 1) % len(pts)]; ax = q - p; ax /= np.linalg.norm(ax)
        nrm = np.cross(ax, [0, 1.0, 0]); nrm /= np.linalg.norm(nrm)
        link_axis = nrm if k % 2 else np.cross(ax, nrm)
        t = torus(p, link_axis, R, r, n_major, n_minor, mat)
        # stretch the ring along the chain so the links meet
        c = p; P_ = np.array(t.v); along = (P_ - c) @ ax
        P_ = P_ + np.outer(along, ax) * 0.45
        t.v = [v for v in P_]
        part.merge(t); idx += [k] * len(P_)
    return part, idx


def lifts(path_pts, ths, thick, body, outfits):
    """Per outfit, how far each path point moves out so it lies on that outfit."""
    bare = ring_surface([], body)
    r0 = np.array([bare(t, p[1]) for t, p in zip(ths, path_pts)])
    out = {}
    for o in outfits:
        f = ring_surface(LAYERS.get(o, []), body)
        r = np.array([f(t, p[1]) for t, p in zip(ths, path_pts)])
        l = np.maximum(0, r - r0)
        # a chain does not dip into gaps: smooth along the loop, keeping the higher value
        for _ in range(3):
            l = np.maximum(l, (np.roll(l, 1) + np.roll(l, -1) + 2 * l) / 4 * 0.98)
        out[o] = [round(float(x), 4) for x in l]
    return out


def to_part(pt, name=None, **kw):
    P = np.array(pt.v); T = np.array(pt.t)
    d = dict(name=name or pt.mat, P=P, T=T, UV=np.zeros((len(P), 2)), mat=pt.mat, edges=False); d.update(kw)
    return d


def glasses_parts(name, frame_mat):
    g = garment(name, subdiv=0)
    P, T = g['P'], g['T']
    isl = islands(P, T, g['src'])
    lens_t = np.zeros(len(T), bool)
    for k in np.unique(isl):
        sel = isl == k; Q = P[sel]
        if Q[:, 2].min() < 1.2 or np.ptp(Q[:, 0]) < 0.25 or np.ptp(Q[:, 1]) < 0.22: continue
        tk = np.array([isl[t[0]] == k for t in T]); tt = T[tk]
        area = 0.5 * np.abs(np.cross(P[tt[:, 1]] - P[tt[:, 0]], P[tt[:, 2]] - P[tt[:, 0]])[:, 2]).sum()
        if area > 0.45 * np.ptp(Q[:, 0]) * np.ptp(Q[:, 1]) * 0.785 and np.ptp(Q[:, 2]) < 0.12:   # fills its outline: a lens, not a rim
            lens_t |= np.array([isl[t[0]] == k for t in T])
    out = []
    for nm, sel, mat in (('frame', ~lens_t, frame_mat), ('lens', lens_t, 'lens-clear')):
        if not sel.any(): continue
        P2, T2 = compact(P, T[sel])
        out.append(dict(name=nm, P=P2, T=T2, UV=np.zeros((len(P2), 2)), mat=mat, edges=False))
    return out


def build_acc(body, out_dir, only=None):
    stats = {}
    def want(pid): return only is None or pid in only or 'acc' in only
    outfits = list(LAYERS.keys())
    def done(pid, parts, extras=None):
        bake_ao(parts, body, dist=0.4)
        stats[pid] = dict(raw=write(pid, parts, out_dir, extras), verts=sum(len(p['P']) for p in parts))
    bare = ring_surface([], body)
    def loop(front_y, back_y, n, off):
        ths, ys = necklace_path(body, front_y, back_y, n)
        pts = [np.array([NECK_C[0], y, NECK_C[2]]) + np.array([math.sin(t), 0, math.cos(t)]) * (bare(t, y) + off) for t, y in zip(ths, ys)]
        return ths, pts
    def pack(ths, pts, extra=None):
        dirs = np.array([[math.sin(t), 0, math.cos(t)] for t in ths])
        return {'lift': lifts(pts, ths, 0, body, outfits), 'pdir': [round(float(x), 4) for x in dirs.reshape(-1)]}
    if want('acc-chain'):
        ths, pts = loop(5.6, 6.08, 64, 0.022)
        ch, idx = chain_links(pts, 0.022, 0.0065, 'silver')
        done('acc-chain', [to_part(ch, path=idx)], pack(ths, pts))
    if want('acc-pendant'):
        ths, pts = loop(5.38, 6.06, 96, 0.014)
        ch, idx = chain_links(pts, 0.012, 0.0035, 'gold', 6, 3)
        k0 = int(np.argmin([p[1] for p in pts]))
        top = pts[k0]; fwd = np.array([math.sin(ths[k0]), 0, math.cos(ths[k0])])
        bail = torus(top + np.array([0, -0.035, 0.01]), [1, 0, 0], 0.022, 0.006, 12, 5, 'gold')
        c = top + np.array([0, -0.13, 0.03])
        # a pear-cut stone in a gold setting
        prof = [(-0.075, 0.0), (-0.06, 0.03), (-0.02, 0.05), (0.02, 0.048), (0.05, 0.03), (0.07, 0.0)]
        gem = lathe(c, [0, 1.0, 0], prof, 10, 'gem')
        setting = lathe(c + np.array([0, 0, -0.012]), [0, 1.0, 0], [(-0.08, 0.0), (-0.065, 0.036), (-0.02, 0.056), (0.02, 0.054), (0.055, 0.035), (0.075, 0.0)], 12, 'gold')
        n0 = len(ch.v); ch.merge(bail); ch.merge(setting)
        idx += [k0] * (len(ch.v) - n0)
        done('acc-pendant', [to_part(ch, path=idx), to_part(gem, path=[k0] * len(gem.v))], pack(ths, pts))
    if want('acc-choker'):
        n = 72; ths = np.linspace(-math.pi, math.pi, n, endpoint=False)
        band = Part('leather'); spikes = Part('silver'); idx_b, idx_s = [], []
        rows = []
        for dy, lift in ((-0.06, 0.012), (-0.05, 0.026), (0.05, 0.026), (0.06, 0.012)):
            row = []
            for k, t in enumerate(ths):
                y = 6.24 + dy; d = np.array([math.sin(t), 0, math.cos(t)])
                row.append(band.add(np.array([NECK_C[0], y, NECK_C[2]]) + d * (bare(t, y) + lift))); idx_b.append(k)
            rows.append(row)
        for i in range(3):
            for k in range(n):
                j = (k + 1) % n; band.quad(rows[i][k], rows[i][j], rows[i + 1][j], rows[i + 1][k])
        for k in range(0, n, 4):
            t = ths[k]
            if math.cos(t) < -0.35: continue
            d = np.array([math.sin(t), 0, math.cos(t)]); p = np.array([NECK_C[0], 6.24, NECK_C[2]]) + d * (bare(t, 6.24) + 0.026)
            sp = lathe(p, d, [(0.0, 0.03), (0.012, 0.03), (0.075, 0.0)], 8, 'silver')
            spikes.merge(sp); idx_s += [k] * len(sp.v)
        pts = [np.array([NECK_C[0], 6.24, NECK_C[2]]) + np.array([math.sin(t), 0, math.cos(t)]) * bare(t, 6.24) for t in ths]
        bp = to_part(band, path=idx_b, tint='#16171a', detail='leather', dscale=14.0, rough=0.5)
        done('acc-choker', [bp, to_part(spikes, path=idx_s)], pack(ths, pts))
    if want('acc-earrings'):
        g = garment('ews_hoop_earrings', subdiv=0)
        P = g['P'].copy()
        for s in (1, -1):
            sel = np.sign(P[:, 0]) == s; Q = P[sel]
            top = Q[np.argmax(Q[:, 1])]
            anchor = np.array([0.765 * s, 6.955, 0.52])
            P[sel] = anchor + (Q - top) * 0.32
        done('acc-earrings', [dict(name='hoops', P=P, T=g['T'], UV=np.zeros((len(P), 2)), mat='gold', edges=False)])
    if want('acc-studs'):
        g = garment('toigo_pearl_earrings', subdiv=0)
        st = Part('silver'); gems = Part('gem')
        isl = islands(g['P'], g['T'], g['src'])
        for k in np.unique(isl):
            c = g['P'][isl == k].mean(0); s = np.sign(c[0]); ax = np.array([s, 0, 0.25]); ax /= np.linalg.norm(ax)
            st.merge(lathe(c - ax * 0.01, ax, [(0.0, 0.0), (0.0, 0.034), (0.012, 0.036), (0.02, 0.03), (0.022, 0.0)], 12, 'silver'))
            gems.merge(lathe(c + ax * 0.012, ax, [(0.0, 0.027), (0.012, 0.022), (0.02, 0.0)], 8, 'gem'))
        done('acc-studs', [to_part(st), to_part(gems)])
    if want('acc-glasses'):
        done('acc-glasses', glasses_parts('kwnet_at_optical_glasses', 'frame'))
    if want('acc-roundglasses'):
        done('acc-roundglasses', glasses_parts('toigo_round_glasses_leopard', 'gold'))
    return stats



if __name__ == '__main__':
    head, neu_p, out = sys.argv[1], sys.argv[2], sys.argv[3]
    only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else None
    NEU = np.load(neu_p)
    os.makedirs(out + '/items', exist_ok=True); os.makedirs(out + '/tex', exist_ok=True)
    body = Body(head)
    if only is None or 'detail' in only: print('detail', CT.write_details(out))
    st = build_outfits(body, out, only)
    st.update(build_acc(body, out, only))
    for k, v in st.items(): print(k, json.dumps(v))
