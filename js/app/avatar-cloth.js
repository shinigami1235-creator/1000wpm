// Outfits and jewellery for the 3D avatars. Each outfit (fit-<id>) and piece of jewellery
// (acc-<id>) is a file of garment meshes made from MakeHuman clothes by
// tools/avatar/cloth_build.py, with its own fabric textures. Nothing here imports three.js:
// avatar3d.js passes it in through create(), like avatar-hair.js.
//
// How it draws:
// - each garment has a grey fabric texture (folds, seams, knit) that the outfit colour
//   tints, a normal map, and a small tiling fabric normal laid over it at thread scale
// - baked occlusion sits in the vertex colours; the inside of a garment is darker
// - tees and polos can carry horizontal stripes, drawn in the shader so they stay level
// How it follows the sliders: when a file loads, every vertex is tied to the six nearest
// head vertices and moves with them. Garments that sit close to the skin are then pushed
// back out along the skin normal wherever a slider (neck, head width, masculine to
// feminine) would bring the skin through them.
// Necklaces carry a lift per outfit, so they lie on a tee or sweater and under an open
// shirt, a jacket or a hood.
window.AvatarCloth = (() => {
  // ---------- nearest head vertices: a small k-d tree (as in avatar-hair.js) ----------
  function kdBuild(P, ids) {
    const n = ids.length, node = new Int32Array(n), axis = new Uint8Array(n);
    const work = Int32Array.from(ids);
    (function build(lo, hi) {
      if (lo >= hi) return;
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let i = lo; i < hi; i++) for (let a = 0; a < 3; a++) { const v = P[work[i] * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
      const ax = [0, 1, 2].reduce((b, a) => (mx[a] - mn[a] > mx[b] - mn[b] ? a : b), 0);
      const mid = (lo + hi) >> 1;
      const seg = Array.from(work.subarray(lo, hi)).sort((x, y) => P[x * 3 + ax] - P[y * 3 + ax]);
      work.set(seg, lo);
      axis[mid] = ax;
      build(lo, mid); build(mid + 1, hi);
    })(0, n);
    node.set(work);
    return { P, node, axis, n };
  }
  function kdNearest(t, x, y, z, k, idx, d2) {
    let cnt = 0;
    const visit = (lo, hi) => {
      if (lo >= hi) return;
      const mid = (lo + hi) >> 1, v = t.node[mid], ax = t.axis[mid], P = t.P;
      const dx = P[v * 3] - x, dy = P[v * 3 + 1] - y, dz = P[v * 3 + 2] - z, dd = dx * dx + dy * dy + dz * dz;
      if (cnt < k || dd < d2[cnt - 1]) {
        let j = cnt < k ? cnt++ : k - 1;
        while (j > 0 && d2[j - 1] > dd) { d2[j] = d2[j - 1]; idx[j] = idx[j - 1]; j--; }
        d2[j] = dd; idx[j] = v;
      }
      const diff = (ax === 0 ? x : ax === 1 ? y : z) - P[v * 3 + ax];
      const [a0, a1, b0, b1] = diff < 0 ? [lo, mid, mid + 1, hi] : [mid + 1, hi, lo, mid];
      visit(a0, a1);
      if (cnt < k || diff * diff < d2[cnt - 1]) visit(b0, b1);
    };
    visit(0, t.n);
    return cnt;
  }
  // smooth vertex normals over a triangle index, welded by a canonical id per vertex
  function normals(pos, index, canon, out) {
    let maxC = 0; for (let i = 0; i < canon.length; i++) if (canon[i] > maxC) maxC = canon[i];
    const acc = new Float32Array((maxC + 1) * 3);
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (let k = 0; k < 3; k++) { const w = canon[index[i + k]] * 3; acc[w] += nx; acc[w + 1] += ny; acc[w + 2] += nz; }
    }
    for (let i = 0; i < canon.length; i++) {
      const w = canon[i] * 3, x = acc[w], y = acc[w + 1], z = acc[w + 2], l = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }
    return out;
  }
  function weldMap(pos) {
    const map = new Map(), canon = new Uint32Array(pos.length / 3);
    for (let i = 0; i < canon.length; i++) {
      const k = `${Math.round(pos[i * 3] * 2e3)},${Math.round(pos[i * 3 + 1] * 2e3)},${Math.round(pos[i * 3 + 2] * 2e3)}`;
      if (!map.has(k)) map.set(k, i);
      canon[i] = map.get(k);
    }
    return canon;
  }

  // the colour under an open shirt or jacket: a light tee under a dark top and the other
  // way round, as people dress
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11) / 255; };
  const UNDER_DARK = '#232528', UNDER_LIGHT = '#e6e4de';
  let LEATHER_LIFT = null;

  function create({ THREE, loader, root, prep }) {
    const files = new Map();          // pid -> Promise<boolean>
    const data = new Map();           // pid -> { parts, extras }
    const texs = new Map();           // file -> Promise<Texture>
    const trees = new WeakMap();      // head base array -> { tree, nrm }
    const binds = new WeakMap();      // head base array -> Map(pid -> binds per part)
    const K = 6;
    const texLoader = new THREE.TextureLoader();
    LEATHER_LIFT = new THREE.Color('#5a5650');

    function loadTex(name, srgb, repeat) {
      if (!texs.has(name)) {
        texs.set(name, texLoader.loadAsync(root + 'tex/' + name).then(t => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
          if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
          return t;
        }).catch(e => { texs.delete(name); throw e; }));
      }
      return texs.get(name);
    }

    function read(gltf) {
      const parts = [];
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry, ud = o.userData, [qo, qs] = ud.q;
        const pa = g.attributes.position, n = pa.count;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { pos[i * 3] = qo[0] + pa.getX(i) * qs; pos[i * 3 + 1] = qo[1] + pa.getY(i) * qs; pos[i * 3 + 2] = qo[2] + pa.getZ(i) * qs; }
        const C = g.attributes.color, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = C.getX(i);
        const PT = g.attributes._path;
        const path = PT ? Uint16Array.from({ length: n }, (_, i) => PT.getX(i)) : null;
        parts.push({ name: o.name, ex: ud, pos, col, path, uv: new Float32Array(g.attributes.uv.array), index: new Uint16Array(g.index.array), canon: weldMap(pos) });
        g.dispose();
      });
      let extras = {};
      gltf.scene.traverse(o => { if (o.userData && o.userData.cloth) extras = o.userData; });
      return { parts, extras };
    }

    function load(pid) {
      if (files.has(pid)) return files.get(pid);
      const p = loader.loadAsync(`${root}items/${pid}.glb`).then(gltf => {
        const d = read(gltf);
        const need = [];
        for (const pt of d.parts) {
          const ex = pt.ex;
          if (ex.tex) {
            need.push(loadTex(ex.tex + '_d.webp', true).then(t => { pt.map = t; }));
            need.push(loadTex(ex.tex + '_n.webp', false).then(t => { pt.nmap = t; }));
          }
          if (ex.detail) need.push(loadTex(`cloth_detail_${ex.detail}.webp`, false, true).then(t => { pt.dmap = t; }));
        }
        return Promise.all(need).then(() => { data.set(pid, d); return true; });
      }).catch(e => { console.warn('avatar cloth', pid, e); files.delete(pid); return false; });
      files.set(pid, p);
      return p;
    }
    const has = pid => data.has(pid);

    // ties every vertex to its nearest head vertices (rest shape), once per item
    function headInfo(A, rig) {
      let h = trees.get(A.base);
      if (!h) {
        const nv = A.base.length / 3, ids = [];
        for (let i = 0; i < nv; i++) ids.push(i);
        const nrm = normals(A.base, rig.allIndex, A.weld, new Float32Array(nv * 3));
        h = { tree: kdBuild(A.base, ids), nrm };
        trees.set(A.base, h);
      }
      return h;
    }
    function bind(A, rig, pid) {
      let m = binds.get(A.base);
      if (!m) { m = new Map(); binds.set(A.base, m); }
      if (m.has(pid)) return m.get(pid);
      const { tree, nrm } = headInfo(A, rig);
      const idx = new Int32Array(K + 1), d2 = new Float64Array(K + 1);
      const out = data.get(pid).parts.map(p => {
        const n = p.pos.length / 3, bi = new Uint32Array(n * K), bw = new Float32Array(n * K), gap = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = p.pos[i * 3], y = p.pos[i * 3 + 1], z = p.pos[i * 3 + 2];
          const c = kdNearest(tree, x, y, z, K + 1, idx, d2);
          const far = Math.sqrt(d2[c - 1]) * 1.0001 + 1e-6;
          let sum = 0;
          for (let j = 0; j < K; j++) { const w = (1 - Math.sqrt(d2[j]) / far) ** 2 + 1e-6; bw[i * K + j] = w; sum += w; bi[i * K + j] = idx[j]; }
          for (let j = 0; j < K; j++) bw[i * K + j] /= sum;
          // how far out from the skin it sits at rest, along the nearest skin normal
          const b = idx[0] * 3;
          gap[i] = (x - A.base[b]) * nrm[b] + (y - A.base[b + 1]) * nrm[b + 1] + (z - A.base[b + 2]) * nrm[b + 2];
        }
        return { bi, bw, gap };
      });
      m.set(pid, out);
      return out;
    }

    // ---------- materials ----------
    const nrmChunk = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;',
      'mapN.xy *= normalScale;\n\tvec3 clD = texture2D( uDetail, vNormalMapUv * uDScale ).xyz * 2.0 - 1.0; mapN.xy += clD.xy * uDStr;');
    function fabric(pt, opts) {
      const ex = pt.ex;
      const m = prep(new THREE.MeshStandardMaterial({
        map: pt.map || null, normalMap: pt.nmap || null, roughness: ex.rough ?? 0.85, metalness: 0, vertexColors: true,
        side: THREE.DoubleSide, envMap: opts.env, envMapIntensity: ex.mat === 'leather' ? 0.18 : 0.12,
        normalScale: new THREE.Vector2(ex.nscale ?? 1, ex.nscale ?? 1),
      }), { rim: 0.45, name: 'cloth-' + (ex.detail || 'plain') });
      const u = m.userData.u = {
        uDetail: { value: pt.dmap || null }, uDScale: { value: ex.dscale || 30 }, uDStr: { value: { leather: 0.35, rib: 0.55, pique: 0.5, jersey: 0.35, fleece: 0.3, weave: 0.4 }[ex.detail] ?? 0.35 },
        uStripe: { value: 0 }, uStripeCol: { value: new THREE.Color('#f2f0ea') }, uStripeFreq: { value: 3.4 },
        uSheen: { value: ex.mat === 'leather' ? 0.0 : 0.22 }, uRAlpha: { value: ex.ralpha ? 1 : 0 },
      };
      const base = m.onBeforeCompile;
      m.onBeforeCompile = sh => {
        base(sh);
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vClY; varying float vClX;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClY = transformed.y; vClX = transformed.x;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying float vClY; varying float vClX; uniform sampler2D uDetail; uniform float uDScale; uniform float uDStr; uniform float uStripe; uniform vec3 uStripeCol;
            uniform float uStripeFreq; uniform float uSheen; uniform float uRAlpha; float clRough = 1.0;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            #ifdef USE_MAP
              clRough = mix( 1.0, sampledDiffuseColor.a * 2.0, uRAlpha );
              // level stripes: a triangle wave on height, anti-aliased by its own slope
              float clS = abs( fract( vClY * uStripeFreq ) - 0.5 ) * 2.0; float clW = fwidth( vClY * uStripeFreq ) * 1.5;
              float clM = smoothstep( 0.5 - clW, 0.5 + clW, clS ) * uStripe;
              diffuseColor.rgb = mix( diffuse, uStripeCol, clM ) * sampledDiffuseColor.rgb;
            #endif
            diffuseColor.a = opacity;`)
          // the inside shows only round the neck: through a cut sleeve or the bottom edge there is
          // only background, as through the cut bust itself
          .replace('#include <color_fragment>', `#include <color_fragment>
            if ( !gl_FrontFacing && ( abs( vClX ) > 1.25 || vClY < 5.45 ) ) discard;
            diffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.45;`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp( roughnessFactor * clRough, 0.04, 1.0 );')
          .replace('#include <normal_fragment_maps>', nrmChunk)
          // soft fabric sheen: knit and cotton catch a little light at grazing angles
          .replace('#include <opaque_fragment>', `{
            float clV = 1.0 - clamp( abs( dot( normal, normalize( vViewPosition ) ) ), 0.0, 1.0 );
            outgoingLight += diffuseColor.rgb * uSheen * pow( clV, 2.5 ) * ( 0.6 + 0.4 * clamp( dot( normal, uKeyDir ), 0.0, 1.0 ) );
          }
          #include <opaque_fragment>`);
      };
      const key = m.customProgramCacheKey;
      m.customProgramCacheKey = () => key() + '-cl' + (pt.nmap ? 'n' : '') + (pt.dmap ? 'd' : '');
      return m;
    }

    // ---------- one rig's clothes ----------
    function attach(rig, { env }) {
      const group = new THREE.Group();
      rig.group.add(group);
      const inst = new Map();
      // glasses frames (black acetate) and the stones in pendants and studs (glow colour)
      const own = {
        frame: prep(new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.28, metalness: 0, vertexColors: true, envMap: env, envMapIntensity: 0.8 }), { rim: 0.4, name: 'frame' }),
        gem: prep(new THREE.MeshStandardMaterial({ color: '#39ff88', roughness: 0.08, metalness: 0.4, vertexColors: true, envMap: env, envMapIntensity: 1.6, emissive: '#000000' }), { rim: 0, name: 'gem' }),
      };

      const OWN = own;
      function build(pid) {
        const d = data.get(pid), A = rig.A, B = bind(A, rig, pid);
        const grp = new THREE.Group(); grp.visible = false; group.add(grp);
        const recs = d.parts.map((p, k) => {
          const pos = new Float32Array(p.pos), nrm = new Float32Array(p.pos.length);
          const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
          const nattr = new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage);
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', attr); g.setAttribute('normal', nattr);
          g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
          g.setIndex(new THREE.BufferAttribute(p.index, 1));
          g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6.2, 0.1), 5);
          const own = !!(p.ex.tex || p.ex.detail);
          const mat = own ? fabric(p, { env }) : (OWN[p.ex.mat] || rig.M[p.ex.mat] || rig.M.gear);
          const mesh = new THREE.Mesh(g, mat);
          if (p.ex.mat && p.ex.mat.startsWith('lens')) mesh.renderOrder = 3;
          grp.add(mesh);
          return { p, B: B[k], pos, nrm, attr, nattr, mesh, own };
        });
        const out = { grp, recs, stamp: -1, outfit: null };
        inst.set(pid, out);
        return out;
      }

      // positions: rest shape (plus a necklace's lift for the outfit) moved by the head's
      // slider deltas, then pushed back out of the skin where a slider brought it through
      function update(r, outfit) {
        const dl = rig.delta, P = rig.pos, N = rig.nrm;
        const fit = inst.get('fit-' + outfit);
        const under = r.pid.startsWith('acc-') && fit && fit.grp.visible ? fit.recs.filter(x => x.p.ex.layer === 'base') : null;
        const lift = r.recs[0] && r.recs[0].p.path ? (data.get(r.pid).extras.lift || {})[outfit] : null;
        const dirs = lift ? data.get(r.pid).extras.pdir : null;
        for (const rec of r.recs) {
          const { bi, bw, gap } = rec.B, src = rec.p.pos, out = rec.pos, n = src.length / 3, path = rec.p.path;
          for (let i = 0; i < n; i++) {
            let dx = 0, dy = 0, dz = 0;
            for (let j = 0; j < K; j++) { const b = bi[i * K + j] * 3, w = bw[i * K + j]; dx += w * dl[b]; dy += w * dl[b + 1]; dz += w * dl[b + 2]; }
            let x = src[i * 3] + dx, y = src[i * 3 + 1] + dy, z = src[i * 3 + 2] + dz;
            if (lift && path) { const k = path[i], l = lift[k] || 0; x += dirs[k * 3] * l; y += dirs[k * 3 + 1] * l; z += dirs[k * 3 + 2] * l; }
            const g0 = gap[i];
            if (g0 < 0.09) {
              const b = bi[i * K] * 3, nx = N[b], ny = N[b + 1], nz = N[b + 2];
              const d = (x - P[b]) * nx + (y - P[b + 1]) * ny + (z - P[b + 2]) * nz;
              const want = Math.max(0.004, g0 * 0.7);
              if (d < want) { const s = want - d; x += nx * s; y += ny * s; z += nz * s; }
            }
            out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
          }
          if (path && under) settle(rec, under);
          normals(out, rec.p.index, rec.p.canon, rec.nrm);
          rec.attr.needsUpdate = true; rec.nattr.needsUpdate = true;
        }
        r.stamp = rig.shapeStamp; r.outfit = outfit;
      }
      // a necklace's built-in lift is for the neutral body: on a fuller chest the garment may
      // stand further out, so each link (all the vertices of one path point) is lifted onto it
      function settle(rec, under) {
        const pos = rec.pos, path = rec.p.path, n = path.length;
        const groups = rec.groups || (rec.groups = (() => { const g = new Map(); for (let i = 0; i < n; i++) { if (!g.has(path[i])) g.set(path[i], []); g.get(path[i]).push(i); } return [...g.values()]; })());
        for (const vs of groups) {
          let cx = 0, cy = 0, cz = 0;
          for (const i of vs) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
          cx /= vs.length; cy /= vs.length; cz /= vs.length;
          let best = 1e9, bp = null, bi = 0;
          for (const u of under) {
            const P = u.pos;
            for (let j = 0; j < P.length; j += 3) { const dx = P[j] - cx, dy = P[j + 1] - cy, dz = P[j + 2] - cz, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bp = u; bi = j; } }
          }
          if (!bp || best > 0.09) continue;
          const N = bp.nrm, nx = N[bi], ny = N[bi + 1], nz = N[bi + 2];
          const d = (cx - bp.pos[bi]) * nx + (cy - bp.pos[bi + 1]) * ny + (cz - bp.pos[bi + 2]) * nz;
          const want = 0.016;
          if (d >= want) continue;
          const sx = nx * (want - d), sy = ny * (want - d), sz = nz * (want - d);
          for (const i of vs) { pos[i * 3] += sx; pos[i * 3 + 1] += sy; pos[i * 3 + 2] += sz; }
        }
      }

      // colours: the outfit colour on the main fabric, the tee under a shirt or jacket in a
      // colour that sets it off, stripes on tees and polos
      function colour(r, L) {
        const D = window.AvatarData, main = D.OUTFIT_COLORS[L.oc].hex, light = lum(main) > 0.42;
        const stripe = L.op === 'stripe' && D.PATTERN_OUTFITS.includes(L.o);
        for (const rec of r.recs) {
          if (!rec.own) continue;
          const m = rec.mesh.material, ex = rec.p.ex, u = m.userData.u;
          const tint = ex.tint || 'main';
          // leather: a near-black leather still shows its folds, so the darkest colours lift a little
          if (tint === 'main') { m.color.set(main); if (ex.mat === 'leather' && lum(main) < 0.2) m.color.lerp(LEATHER_LIFT, 0.0); }
          else if (tint === 'under') m.color.set(ex.under === 'light' ? (light ? UNDER_DARK : UNDER_LIGHT) : (lum(main) < 0.2 ? UNDER_LIGHT : UNDER_DARK));
          else if (tint === 'trim') m.color.set(stripe ? (light ? '#24262a' : '#efede6') : main);
          else m.color.set(tint);
          u.uStripe.value = stripe && ex.stripe ? 1 : 0;
          u.uStripeCol.value.set(light ? '#24262a' : '#efede6');
        }
      }

      // show the listed items (when loaded) and hide the rest
      function set(L, pids) {
        const want = new Set(pids);
        const glow = window.AvatarData.part('gl', L.gl).hex;
        own.gem.color.set(glow); own.gem.emissive.set(glow).multiplyScalar(0.18);
        for (const [k, r] of inst) r.grp.visible = want.has(k);
        for (const pid of want) {
          if (!data.has(pid)) continue;
          const r = inst.get(pid) || build(pid);
          r.pid = pid;
          r.grp.visible = true;
          const fitStamp = (inst.get('fit-' + L.o) || {}).stamp;
          if (r.stamp !== rig.shapeStamp || r.outfit !== L.o || r.fitStamp !== fitStamp) { update(r, L.o); r.fitStamp = fitStamp; }
          for (const rec of r.recs) rec.mesh.visible = rec.p.ex.hide !== L.h;
          colour(r, L);
        }
      }
      return { set, group };
    }

    return { load, has, attach };
  }

  return { create };
})();
