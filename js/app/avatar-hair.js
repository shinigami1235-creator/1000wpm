// Hair for the 3D avatars. Each hairstyle is a file of alpha cards (from MakeHuman hair
// proxies, fitted to our head by tools/avatar/hair_build.py) plus a scalp layer that fades
// into the skin at the hairline, and its own strand texture. Nothing here imports three.js:
// avatar3d.js passes it in through create(), so this file costs nothing before the 3D view
// is wanted.
//
// How it draws:
// - the cards go out twice: an alpha-tested pass that writes depth, then a blended pass for
//   the soft card edges only, its triangles sorted back to front whenever the view turns
// - the texture is grey strand detail; the hair colour tints it, darker at the roots
// - two Kajiya-Kay highlights run across the strands, shifted by the strand detail
// - baked occlusion darkens the inner layers and where the hair meets the scalp
// How it follows the face sliders: when a style loads, every vertex is tied to the six
// nearest head vertices, so it moves with whatever the sliders do to that part of the head.
// Under a cap or bandana the hair above the band is pressed down onto the scalp.
window.AvatarHair = (() => {
  // gear tier (which size of visor, goggles, headset, cap and bandana sits over the hair)
  // and extra camera room for styles that stand up
  const STYLES = {
    // shine: the narrow white highlight; the sculpted short cuts take less so black stays black
    buzz: { tier: '' }, crop: { tier: '-mid', shine: 0.4 }, messy: { tier: '-mid', shine: 0.4 }, sidepart: { tier: '-mid', shine: 0.4 },
    slick: { tier: '' }, undercut: { tier: '-mid', shine: 0.4 }, mohawk: { tier: '', tall: 0.3, shine: 0.4 },
    bob: { tier: '-mid' }, wavybob: { tier: '-loose' }, curtain: { tier: '-loose' },
    longstraight: { tier: '-mid' }, longlayered: { tier: '-loose' }, wavy: { tier: '-loose' }, curly: { tier: '-loose' }, wavyends: { tier: '-loose' },
    afro: { tier: '-xl', tall: 0.3, aniso: 0 }, braids: { tier: '-mid' }, bun: { tier: '-mid', tall: 0.3 }, ponytail: { tier: '-mid', tall: 0.15 },
    updo: { tier: '-mid', tall: 0.2 }, long: { tier: '-mid' }, hood: { tier: '' },
  };
  const tier = id => (STYLES[id] || {}).tier ?? '';
  const tall = id => (STYLES[id] || {}).tall || 0;

  // ---------- nearest head vertices: a small k-d tree ----------
  function kdBuild(P, ids) {
    const n = ids.length, node = new Int32Array(n), axis = new Uint8Array(n);
    const work = Int32Array.from(ids);
    (function build(lo, hi, depth) {
      if (lo >= hi) return;
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let i = lo; i < hi; i++) for (let a = 0; a < 3; a++) { const v = P[work[i] * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
      const ax = [0, 1, 2].reduce((b, a) => (mx[a] - mn[a] > mx[b] - mn[b] ? a : b), 0);
      const mid = (lo + hi) >> 1;
      const seg = Array.from(work.subarray(lo, hi)).sort((x, y) => P[x * 3 + ax] - P[y * 3 + ax]);
      work.set(seg, lo);
      axis[mid] = ax;
      build(lo, mid, depth + 1); build(mid + 1, hi, depth + 1);
    })(0, n, 0);
    node.set(work);
    return { P, node, axis, n };
  }
  // the k nearest points to (x, y, z): fills idx and d2 (sorted, nearest first)
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

  function create({ THREE, loader, root, prep }) {
    const files = new Map();          // pid -> Promise<boolean>
    const data = new Map();           // pid -> { parts, tex }
    const trees = new WeakMap();      // head base array -> k-d tree
    const binds = new WeakMap();      // head base array -> Map(pid -> binds per part)
    const K = 6;
    let scalpTex = null;

    const texLoader = new THREE.TextureLoader();
    const loadTex = (name, repeat) => texLoader.loadAsync(root + 'tex/' + name).then(t => {
      t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    });

    function read(gltf) {
      const parts = [];
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry, ud = o.userData, [qo, qs] = ud.q;
        const pa = g.attributes.position, n = pa.count;
        const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), st = new Float32Array(n * 3);
        const N = g.attributes._nrm, S = g.attributes._strand;
        for (let i = 0; i < n; i++) {
          pos[i * 3] = qo[0] + pa.getX(i) * qs; pos[i * 3 + 1] = qo[1] + pa.getY(i) * qs; pos[i * 3 + 2] = qo[2] + pa.getZ(i) * qs;
          nrm[i * 3] = N.getX(i); nrm[i * 3 + 1] = N.getY(i); nrm[i * 3 + 2] = N.getZ(i);
          st[i * 3] = S.getX(i); st[i * 3 + 1] = S.getY(i); st[i * 3 + 2] = S.getZ(i);
        }
        const hc = new Float32Array(n * 4), H = g.attributes._hc;
        for (let i = 0; i < n; i++) { hc[i * 4] = H.getX(i); hc[i * 4 + 1] = H.getY(i); hc[i * 4 + 2] = H.getZ(i); hc[i * 4 + 3] = H.getW(i); }
        parts.push({ name: o.name, mat: ud.mat, pos, nrm, st, hc, uv: new Float32Array(g.attributes.uv.array), index: new Uint16Array(g.index.array) });
        g.dispose();
      });
      return parts;
    }

    function load(pid) {
      if (files.has(pid)) return files.get(pid);
      const id = pid.slice(5);
      const p = Promise.all([
        loader.loadAsync(`${root}items/${pid}.glb`),
        loadTex(`${pid}.webp`, true),
        scalpTex ? null : loadTex('hair-scalp.webp', true).then(t => { scalpTex = t; }),
      ]).then(([gltf, tex]) => {
        data.set(pid, { id, parts: read(gltf), tex });
        return true;
      }).catch(e => { console.warn('avatar hair', pid, e); files.delete(pid); return false; });
      files.set(pid, p);
      return p;
    }
    const has = pid => data.has(pid);

    // ties every vertex to its nearest head vertices (rest shape), once per style
    function bind(A, pid) {
      let m = binds.get(A.base);
      if (!m) { m = new Map(); binds.set(A.base, m); }
      if (m.has(pid)) return m.get(pid);
      let tree = trees.get(A.base);
      if (!tree) {
        const nv = A.base.length / 3, skip = new Uint8Array(nv);
        for (const e of A.meta.eyes || []) skip.fill(1, e.start, e.start + e.count);
        const ids = []; for (let i = 0; i < nv; i++) if (!skip[i]) ids.push(i);
        tree = kdBuild(A.base, ids); trees.set(A.base, tree);
      }
      const idx = new Int32Array(K + 1), d2 = new Float64Array(K + 1);
      const out = data.get(pid).parts.map(p => {
        const n = p.pos.length / 3, bi = new Uint32Array(n * K), bw = new Float32Array(n * K), anchor = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const c = kdNearest(tree, p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2], K + 1, idx, d2);
          const far = Math.sqrt(d2[c - 1]) * 1.0001 + 1e-6;
          let sum = 0;
          for (let j = 0; j < K; j++) { const w = (1 - Math.sqrt(d2[j]) / far) ** 2 + 1e-6; bw[i * K + j] = w; sum += w; bi[i * K + j] = idx[j]; }
          for (let j = 0; j < K; j++) {
            const w = bw[i * K + j] /= sum, b = bi[i * K + j] * 3;
            anchor[i * 3] += w * A.base[b]; anchor[i * 3 + 1] += w * A.base[b + 1]; anchor[i * 3 + 2] += w * A.base[b + 2];
          }
        }
        return { bi, bw, anchor };
      });
      m.set(pid, out);
      return out;
    }

    // ---------- materials ----------
    const noFlip = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
    function hairMaterial(tex, pass) {
      const m = prep(new THREE.MeshStandardMaterial({
        map: tex, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, envMapIntensity: 0,
        alphaTest: pass === 'cut' ? 0.5 : 0, transparent: pass === 'edge', depthWrite: pass === 'cut',
      }), { rim: 0.25 });
      m.userData.u = { uRoot: { value: 0.72 }, uTip: { value: 1.08 }, uSpec: { value: new THREE.Color(1, 1, 1) }, uSpecStr: { value: 1 }, uAniso: { value: 1 }, uShine: { value: 1 } };
      const base = m.onBeforeCompile;
      m.onBeforeCompile = sh => {
        base(sh);
        Object.assign(sh.uniforms, m.userData.u);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec4 _hc; attribute vec3 _strand; varying vec4 vHC; varying vec3 vStrand;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHC = _hc; vStrand = normalize(mat3(modelViewMatrix) * _strand + vec3(1e-5));');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec4 vHC; varying vec3 vStrand; uniform float uRoot; uniform float uTip; uniform vec3 uSpec; uniform float uSpecStr; uniform float uAniso; uniform float uShine;')
          .replace('#include <normal_fragment_begin>', noFlip)
          .replace('#include <map_fragment>', `#include <map_fragment>
            float hDet = texture2D(map, vMapUv).r;
            diffuseColor.rgb *= (hDet * 0.85 + 0.15) * 0.76;   // strands read deeper than the texture alone
            // a touch less saturated than the swatch, so browns stay brown under the bright key light
            diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 0.8);
            diffuseColor.rgb *= mix(uRoot, uTip, vHC.g) * (0.9 + 0.2 * vHC.b);
            diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 0.85, vHC.r));`)
          .replace('#include <alphatest_fragment>', pass === 'cut'
            ? '#include <alphatest_fragment>\ndiffuseColor.a = 1.0;'
            : 'if (diffuseColor.a >= 0.5 || diffuseColor.a < 0.03) discard; diffuseColor.a = smoothstep(0.03, 0.5, diffuseColor.a);')
          .replace('#include <opaque_fragment>', `{
            // keep the hair's own hue: the coloured fill and rim lights only change how bright it is
            float lo = dot(outgoingLight, vec3(0.299, 0.587, 0.114)), ld = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            outgoingLight = mix(outgoingLight, diffuseColor.rgb * (lo / max(ld, 1e-4)), 0.3);
            vec3 T = normalize(vStrand - normal * dot(vStrand, normal));
            vec3 Vd = normalize(vViewPosition); vec3 H = normalize(uKeyDir + Vd);
            float sh = (hDet - 0.62) * 0.7;
            vec3 T1 = normalize(T + normal * (sh + 0.1)); float d1 = dot(T1, H);
            vec3 T2 = normalize(T + normal * (sh - 0.22)); float d2 = dot(T2, H);
            float s1 = pow(sqrt(max(0.0, 1.0 - d1 * d1)), 120.0); float s2 = pow(sqrt(max(0.0, 1.0 - d2 * d2)), 36.0);
            // the broad soft band across the crown
            vec3 T3 = normalize(T + normal * (sh * 0.3)); float d3 = dot(T3, H); float s3 = pow(sqrt(max(0.0, 1.0 - d3 * d3)), 9.0);
            float lit = clamp(dot(normal, uKeyDir) * 0.55 + 0.45, 0.0, 1.0) * smoothstep(0.15, 0.9, vHC.r) * smoothstep(0.35, 0.8, hDet);
            vec3 hc = diffuseColor.rgb / max(1e-3, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
            // curls have no single strand direction: a soft round sheen instead of bands
            float iso = pow(max(dot(normal, H), 0.0), 12.0);
            s1 = mix(iso * 0.3, s1, uAniso); s2 = mix(iso, s2, uAniso); s3 = mix(iso, s3, uAniso);
            outgoingLight += (uShine * (uSpec * 0.12 * s1 + hc * mix(0.1, 0.14, uSpecStr - 0.75) * s2) + hc * diffuseColor.rgb * 1.5 * s3) * lit * uKeyCol;
          }
          #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => 'avh-' + pass;
      return m;
    }
    function scalpMaterial() {
      const m = prep(new THREE.MeshStandardMaterial({
        map: scalpTex, roughness: 0.75, metalness: 0, envMapIntensity: 0, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
      }), { rim: 0.3 });
      const base = m.onBeforeCompile;
      m.onBeforeCompile = sh => {
        base(sh);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec4 _hc; varying vec4 vHC;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHC = _hc;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec4 vHC;')
          .replace('#include <opaque_fragment>', `{
            float lo = dot(outgoingLight, vec3(0.299, 0.587, 0.114)), ld = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            outgoingLight = mix(outgoingLight, diffuseColor.rgb * (lo / max(ld, 1e-4)), 0.3);
          }
          #include <opaque_fragment>`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            float sDet = texture2D(map, vMapUv).r;
            // a solid hair-coloured base with fine strand noise; the hairline fades evenly,
            // with only a light break-up along the strands at the very edge
            float sa = smoothstep(0.0, 1.0, vHC.a);
            diffuseColor.a = clamp(sa * (1.0 + 0.35 * (sDet - 0.7) * (1.0 - sa)), 0.0, 1.0) * opacity;
            diffuseColor.rgb = diffuse * 0.82 * (0.86 + 0.14 * sDet);`);
      };
      m.customProgramCacheKey = () => 'avh-scalp';
      return m;
    }

    // ---------- one rig's hair ----------
    function attach(rig) {
      const group = new THREE.Group();
      rig.group.add(group);
      const inst = new Map();
      let colour = new THREE.Color();

      function build(pid) {
        const d = data.get(pid), A = rig.A, B = bind(A, pid);
        const grp = new THREE.Group(); grp.visible = false; group.add(grp);
        const cut = hairMaterial(d.tex, 'cut'), edge = hairMaterial(d.tex, 'edge'), scalp = scalpMaterial();
        const recs = d.parts.map((p, k) => {
          const pos = new Float32Array(p.pos), attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', attr); g.setAttribute('normal', new THREE.BufferAttribute(p.nrm, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2)); g.setAttribute('_hc', new THREE.BufferAttribute(p.hc, 4));
          g.setAttribute('_strand', new THREE.BufferAttribute(p.st, 3));
          g.setIndex(new THREE.BufferAttribute(p.index, 1));
          g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6.6, 0.2), 5);
          const meshes = [];
          if (p.mat === 'hair') {
            const m1 = new THREE.Mesh(g, cut); meshes.push(m1);
            // the soft edges: same triangles, blended, sorted back to front
            const g2 = new THREE.BufferGeometry();
            for (const [k2, a] of Object.entries(g.attributes)) g2.setAttribute(k2, a);
            const order = new THREE.BufferAttribute(new Uint16Array(p.index), 1).setUsage(THREE.DynamicDrawUsage);
            g2.setIndex(order); g2.boundingSphere = g.boundingSphere;
            const m2 = new THREE.Mesh(g2, edge); m2.renderOrder = 2; meshes.push(m2);
            const sort = { key: '', order, tris: p.index.length / 3, cen: new Float32Array(p.index.length), keys: new Uint16Array(p.index.length / 3), tmp: new Uint16Array(p.index.length) };
            m2.onBeforeRender = (r, s, cam) => sortEdges(m2, cam, sort, pos, p.index);
            meshes.sorter = sort;
          } else if (p.mat === 'scalp') {
            const m1 = new THREE.Mesh(g, scalp); m1.renderOrder = 1; meshes.push(m1);
          } else {
            const col = new Float32Array(p.pos.length);
            for (let i = 0; i < col.length / 3; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = p.hc[i * 4];
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            meshes.push(new THREE.Mesh(g, rig.M[p.mat] || rig.M.gear));
          }
          meshes.forEach(m => grp.add(m));
          return { p, B: B[k], pos, attr, meshes, sort: meshes.sorter };
        });
        const out = { grp, recs, mats: [cut, edge, scalp], stamp: -1, hat: null };
        inst.set(pid, out);
        return out;
      }

      const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
      function sortEdges(mesh, cam, s, pos, index) {
        _m.copy(mesh.matrixWorld).invert();
        _v.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_m);
        const key = `${_v.x.toFixed(2)},${_v.y.toFixed(2)},${_v.z.toFixed(2)},${s.stamp}`;
        if (key === s.key) return;
        s.key = key;
        const n = s.tris, keys = s.keys, cx = _v.x, cy = _v.y, cz = _v.z;
        let lo = 1e9, hi = -1e9;
        const dist = s.dist || (s.dist = new Float32Array(n));
        for (let t = 0; t < n; t++) {
          const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
          const x = (pos[a] + pos[b] + pos[c]) / 3 - cx, y = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3 - cy, z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 - cz;
          const d = x * x + y * y + z * z; dist[t] = d; if (d < lo) lo = d; if (d > hi) hi = d;
        }
        // counting sort on 2048 depth buckets, far first
        const NB = 2048, cnt = s.cnt || (s.cnt = new Uint32Array(NB + 1)), sc = (NB - 1) / Math.max(hi - lo, 1e-9);
        cnt.fill(0);
        for (let t = 0; t < n; t++) { keys[t] = NB - 1 - Math.floor((dist[t] - lo) * sc); cnt[keys[t] + 1]++; }
        for (let i = 0; i < NB; i++) cnt[i + 1] += cnt[i];
        const out = s.order.array;
        for (let t = 0; t < n; t++) { const j = cnt[keys[t]]++; out[j * 3] = index[t * 3]; out[j * 3 + 1] = index[t * 3 + 1]; out[j * 3 + 2] = index[t * 3 + 2]; }
        s.order.needsUpdate = true;
      }

      // positions: rest shape plus the head's slider deltas, then the hat press
      function update(r, hat) {
        const dl = rig.delta;
        for (const rec of r.recs) {
          const { bi, bw, anchor } = rec.B, src = rec.p.pos, out = rec.pos, n = src.length / 3;
          for (let i = 0; i < n; i++) {
            let dx = 0, dy = 0, dz = 0;
            for (let j = 0; j < K; j++) { const b = bi[i * K + j] * 3, w = bw[i * K + j]; dx += w * dl[b]; dy += w * dl[b + 1]; dz += w * dl[b + 2]; }
            let x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
            if (hat) {
              const ax = anchor[i * 3], ay = anchor[i * 3 + 1], az = anchor[i * 3 + 2];
              // the band runs lower at the back; above it hair lies flat under the hat
              const fz = Math.max(-1, Math.min(1, (az - 0.28) / 0.9));
              const band = 7.42 - 0.16 * (1 - fz) * 0.5 + (hat === 'bandana' ? 0.04 : 0);
              const t = Math.min(1, Math.max(0, (ay - band + 0.12) / 0.2)), k = t * t * (3 - 2 * t);
              if (k > 0) {
                const ox = x - ax, oy = y - ay, oz = z - az, L = Math.hypot(ox, oy, oz) || 1;
                const want = Math.min(L, 0.012 + L * 0.12);
                const s = 1 + (want / L - 1) * k;
                x = ax + ox * s; y = ay + oy * s; z = az + oz * s;
              }
            }
            out[i * 3] = x + dx; out[i * 3 + 1] = y + dy; out[i * 3 + 2] = z + dz;
          }
          rec.attr.needsUpdate = true;
          if (rec.sort) rec.sort.stamp = (rec.sort.stamp || 0) + 1;
        }
        r.stamp = rig.shapeStamp; r.hat = hat;
      }

      // show hair-<L.h> (when loaded) and hide the rest
      function set(L, { bare = false, hat = null } = {}) {
        const pid = bare ? null : 'hair-' + L.h;
        for (const [k, r] of inst) r.grp.visible = k === pid;
        if (!pid || !data.has(pid)) return;
        const r = inst.get(pid) || build(pid);
        r.grp.visible = true;
        if (r.stamp !== rig.shapeStamp || r.hat !== hat) update(r, hat);
        const hex = window.AvatarData.HAIR_COLORS[L.hc].hex;
        colour.set(hex);
        const [cut, edge, scalp] = r.mats;
        // light colours lose less at the roots and get a softer highlight
        const lum = colour.r * 0.3 + colour.g * 0.55 + colour.b * 0.15;
        for (const m of [cut, edge]) {
          m.color.copy(colour);
          m.userData.u.uRoot.value = 0.74 + 0.14 * Math.min(1, lum * 2);
          m.userData.u.uSpecStr.value = 0.75 + 0.5 * (1 - Math.min(1, lum * 1.6));
          m.userData.u.uSpec.value.copy(colour).lerp(new THREE.Color(1, 1, 1), 0.55);
          m.userData.u.uAniso.value = (STYLES[L.h] || {}).aniso ?? 1;
          m.userData.u.uShine.value = (STYLES[L.h] || {}).shine ?? 1;
        }
        scalp.color.copy(colour);
      }
      return { set, group };
    }

    return { load, has, attach, tier, tall };
  }

  return { STYLES, tier, tall, create };
})();
