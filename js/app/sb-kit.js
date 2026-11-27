// SuperKit: the shared parts of the Superboss arenas (sb-scene.js) and the three boss models
// (sb-hydra.js, sb-compiler.js, sb-leviathan.js): armour materials with glowing panel seams and a rim
// light, geometry builders (tapered boxes, bent horns, teeth, rocks), an environment map for the
// metal to reflect, and the pooled effects every attack is drawn with:
//   sparks   one point cloud for every spark, ember, droplet and mote (burst, suck toward a point)
//   beams    breath, lasers and the packet stream: a hot core and a soft shell, scrolling
//   shocks   rings that roll over the floor or stand in the air
//   marks    telegraphs on the floor: a red ring that fills as the attack winds up
//   orbs     charging balls of light with a fresnel rim
//   lights   a few point lights for flashes, so a hit lights the armour around it
// Everything is made once and reused; nothing is allocated per frame.
//   const K = SuperKit.create(THREE, scene, renderer)
//   K.armor({ color, seam, metal, rough }) K.glow(color, k)  K.geo.*   K.fx.*   K.update(dt, camera)  K.dispose()
window.SuperKit = (() => {
  function create(THREE, scene, renderer, ext = {}) {
    const V = THREE.Vector3;
    const keep = [];
    const own = x => (keep.push(x), x);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const rnd = (a, b) => a + Math.random() * (b - a);
    let seed = 7;
    const srnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };

    // ---------- materials ----------
    // Armour: metal with panel seams drawn in the piece's own space, a rim light in the seam colour
    // so the silhouette reads on a dark stage, a hit flash and a heat value that cracks it open
    // with light when it dies. Every armour material shares one set of uniforms per boss.
    const mats = [];
    function armor(o = {}) {
      const m = own(new THREE.MeshStandardMaterial({ color: o.color || '#2b333b', metalness: o.metal ?? 0.75, roughness: o.rough ?? 0.36, flatShading: o.flat !== false, envMapIntensity: o.env ?? 1 }));
      const u = {
        uSeam: { value: C(o.seam || '#39ff88', o.seamK ?? 1.4) }, uRim: { value: C(o.rim || o.seam || '#39ff88', o.rimK ?? 0.55) },
        uFlash: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 }, uScale: { value: o.scale ?? 0.55 }, uSeed: { value: srnd(0, 40) },
        uDensity: { value: o.density ?? 0.5 },
      };
      m.userData.u = u;
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vSN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSP = position; vSN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vSP; varying vec3 vSN; uniform vec3 uSeam; uniform vec3 uRim; uniform float uFlash; uniform float uHeat; uniform float uTime; uniform float uScale; uniform float uSeed; uniform float uDensity;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
          float seamAt(vec2 u, float w){
            vec2 g = u * uScale + vec2(uSeed * 0.37, uSeed * 0.11); vec2 c = floor(g); vec2 f = fract(g);
            float r = h21(c);
            float lx = (1.0 - smoothstep(w, w * 2.2, abs(f.x - 0.3 - 0.4 * h21(c + 3.1)))) * step(1.0 - uDensity * 0.75, r);
            float ly = (1.0 - smoothstep(w, w * 2.2, abs(f.y - 0.3 - 0.4 * h21(c + 5.7)))) * step(r, uDensity * 0.6);
            float dot2 = (1.0 - smoothstep(0.03, 0.06, length(f - vec2(0.5 + 0.3 * h21(c + 9.0), 0.5)))) * step(0.82, h21(c + 1.7));
            return max(max(lx, ly), dot2);
          }`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 n = abs(normalize(vSN)); vec2 u = n.x > n.y && n.x > n.z ? vSP.yz : n.y > n.z ? vSP.xz : vSP.xy;
            float w = 0.016 + uHeat * 0.05;
            float s = seamAt(u, w);
            float run = 0.75 + 0.25 * sin(uTime * 3.0 + (vSP.x + vSP.y * 1.3 + vSP.z) * 1.7);
            vec3 hot = mix(uSeam, vec3(1.0, 0.95, 0.85) * 2.2, uHeat);
            totalEmissiveRadiance += hot * s * run * (1.0 + uFlash * 1.5 + uHeat * 1.5);
            float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 4.0);
            totalEmissiveRadiance += uRim * fr * (1.0 + uFlash * 1.5);
            totalEmissiveRadiance += vec3(1.0) * uFlash * 0.12;
            diffuseColor.rgb *= 1.0 - uHeat * 0.5;
          }`);
      };
      m.customProgramCacheKey = () => 'sbArmor';
      mats.push(m);
      return m;
    }
    const glow = (c, k = 2.2, o = {}) => own(new THREE.MeshBasicMaterial({ color: C(c, k), toneMapped: false, fog: o.fog ?? false, transparent: !!o.add || o.opacity != null, opacity: o.opacity ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add, side: o.side || THREE.FrontSide }));
    // a fresnel shell: bright at the edges, see-through in the middle (energy, shields, eyes' glow)
    function shellMat(c, k = 1.5) {
      return own(new THREE.ShaderMaterial({
        uniforms: { uC: { value: C(c, k) }, uA: { value: 1 }, uT: { value: 0 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
        fragmentShader: `uniform vec3 uC; uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
            float band = 0.6 + 0.4 * sin(vP.y * 9.0 - uT * 6.0);
            gl_FragColor = vec4(uC * (0.15 + f * 1.4) * band * uA, 1.0); }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    }

    // ---------- geometry ----------
    const RB = ext.RoundedBox;
    function cbox(w, h, d, r = 0.15, top = 1, bot = 1, seg = 1) {
      let g = RB ? new RB(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.45)) : new THREE.BoxGeometry(w, h, d);
      if (g.index) g = g.toNonIndexed();
      if (top !== 1 || bot !== 1) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const k = bot + (top - bot) * (p.getY(i) / h + 0.5); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      }
      g.computeVertexNormals();
      return g;
    }
    // taper along z: the front (z = +d/2) scaled by f in x and y; drop lowers the front
    function taperZ(g, len, fx, fy = fx, drop = 0) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = clamp(p.getZ(i) / len + 0.5, 0, 1), kx = 1 + (fx - 1) * u, ky = 1 + (fy - 1) * u; p.setX(i, p.getX(i) * kx); p.setY(i, p.getY(i) * ky - drop * u * u); }
      g.computeVertexNormals();
      return g;
    }
    // a horn or spike: a cone swept along a bend, from radius r0 at the root to a point
    function horn(len, r0, bend = 0.4, sides = 6, segs = 6, twist = 0) {
      const pos = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs, r = r0 * Math.pow(1 - u, 0.9) + 0.005;
        const a = u * bend;
        const cy = bend ? (1 - Math.cos(a)) / bend * len : 0, cz = bend ? Math.sin(a) / bend * len : u * len;
        for (let j = 0; j < sides; j++) {
          const t = j / sides * Math.PI * 2 + u * twist;
          // the ring stands across the bent axis: rotate the circle by the bend angle
          const lx = Math.cos(t) * r, ly = Math.sin(t) * r;
          pos.push(lx, cy + ly * Math.cos(a), cz - ly * Math.sin(a));
        }
      }
      for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) {
        const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const n = g.toNonIndexed(); n.computeVertexNormals();
      return n;
    }
    // a rock or hull: an icosphere pushed in and out by layered noise
    function rock(r, detail = 2, amp = 0.18, sx = 1, sy = 1, sz = 1, s0 = 1) {
      const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, v = new V();
      const n3 = (x, y, z) => Math.sin(x * 1.7 + s0) * Math.cos(y * 2.3 - s0 * 0.7) + Math.sin(z * 1.9 + x * 0.6) * 0.6 + Math.sin(y * 4.1 + z * 3.3) * 0.25;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + amp * n3(v.x / r * 2, v.y / r * 2, v.z / r * 2); p.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz); }
      g.computeVertexNormals();
      return g;
    }
    function tooth(h = 0.45, r = 0.09) { const g = new THREE.ConeGeometry(r, h, 4); g.rotateX(Math.PI); return g; }
    // merge pieces: [geo, [x,y,z], [rx,ry,rz], [sx,sy,sz]]
    const mrg = (list) => {
      const out = list.map(([g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]]) => {
        let x = g.index ? g.toNonIndexed() : g.clone();
        for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal') x.deleteAttribute(k);
        const m = new THREE.Matrix4().compose(new V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] || 0, r[1] || 0, r[2] || 0, r[3] || 'XYZ')), new V(...s));
        x.applyMatrix4(m); return x;
      });
      const BG = ext.BGU;
      const g = BG ? BG.mergeGeometries(out, false) : out[0];
      out.forEach(x => x !== g && x.dispose());
      return own(g);
    };
    const geo = { cbox: (...a) => own(cbox(...a)), taperZ, horn: (...a) => own(horn(...a)), rock: (...a) => own(rock(...a)), tooth: (...a) => own(tooth(...a)), merge: mrg, own };

    // ---------- an environment for the metal to reflect: dark room, coloured light strips ----------
    let envTex = null;
    function environment(cols) {
      const pm = new THREE.PMREMGenerator(renderer);
      const s = new THREE.Scene();
      s.background = new THREE.Color(0x040608);
      const box = new THREE.BoxGeometry(1, 1, 1);
      const strip = (c, k, p, sz) => { const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: C(c, k) })); m.position.set(...p); m.scale.set(...sz); s.add(m); };
      strip('#cfd8e0', 1.6, [0, 9, 0], [14, 0.4, 14]);
      strip(cols[1], 1.6, [-9, 2, -4], [0.5, 6, 12]);
      strip('#9fb0c0', 1.4, [9, 3, 2], [0.5, 4, 10]);
      strip('#ffffff', 1.0, [0, 4, 10], [12, 3, 0.3]);
      strip(cols[0], 0.25, [0, -6, 0], [30, 0.4, 30]);
      if (envTex) envTex.dispose();
      envTex = pm.fromScene(s, 0.02).texture;
      s.traverse(o => { if (o.material) o.material.dispose(); });
      box.dispose(); pm.dispose();
      return envTex;
    }

    // ---------- sparks: one point cloud for every small glowing thing ----------
    const NP = 1400;
    const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pSize = new Float32Array(NP);
    const P = [];   // live particles: { p, v, c, s0, s1, life, t, g, drag, to, k }
    const pGeo = own(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pGeo.setDrawRange(0, 0);
    const pMat = own(new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 600 } },
      vertexShader: `attribute float size; varying vec3 vC; uniform float uPx;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * uPx / max(0.5, -mv.z), 1.0, 96.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); float a = smoothstep(0.5, 0.0, d); a = a * a + smoothstep(0.16, 0.0, d) * 0.8; gl_FragColor = vec4(vC * a, 1.0); }`,
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false; points.renderOrder = 6;
    scene.add(points);
    const pool = [];
    function spark(p, v, c, o = {}) {
      if (P.length >= NP) return null;
      const s = pool.pop() || { p: new V(), v: new V(), c: new THREE.Color(), to: null };
      s.p.copy(p); s.v.copy(v); s.c.copy(c);
      s.s0 = o.size ?? 0.25; s.s1 = o.end ?? 0; s.life = o.life ?? 0.8; s.t = 0; s.g = o.g ?? 0; s.drag = o.drag ?? 1.5; s.to = o.to || null; s.k = o.k ?? 1; s.floor = o.floor ?? -99;
      P.push(s); return s;
    }
    const tv = new V();
    function burst(at, n, c, o = {}) {
      const sp = o.speed ?? 8, col = c.isColor ? c : C(c);
      for (let i = 0; i < n; i++) {
        tv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (tv.lengthSq() > 1) tv.normalize();
        if (o.up) tv.y = Math.abs(tv.y) * o.up + 0.2;
        if (o.dir) tv.addScaledVector(o.dir, o.dirK ?? 1);
        tv.multiplyScalar(sp * rnd(0.35, 1));
        spark(o.spread ? tv.clone().multiplyScalar(o.spread / sp).add(at) : at, tv, col, { size: (o.size ?? 0.3) * rnd(0.6, 1.3), end: o.end ?? 0, life: (o.life ?? 0.7) * rnd(0.6, 1.3), g: o.g ?? 6, drag: o.drag ?? 2, k: o.k ?? 1, floor: o.floor });
      }
    }
    // particles drawn in from a shell around a point (an attack charging)
    function suck(at, r, n, c, life = 0.5, size = 0.22) {
      const col = c.isColor ? c : C(c);
      for (let i = 0; i < n; i++) {
        tv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(r * rnd(0.7, 1.2)).add(at);
        spark(tv, new V(), col, { size, end: size * 0.3, life, drag: 0, to: at.clone() });
      }
    }
    function updateSparks(dt) {
      let n = 0;
      for (let i = P.length - 1; i >= 0; i--) {
        const s = P[i]; s.t += dt;
        if (s.t >= s.life) { P[i] = P[P.length - 1]; P.pop(); pool.push(s); continue; }
        if (s.to) { const u = s.t / s.life; s.p.lerp(s.to, Math.min(1, dt * (2 + u * 14))); }
        else {
          s.v.y -= s.g * dt; s.v.multiplyScalar(Math.max(0, 1 - s.drag * dt)); s.p.addScaledVector(s.v, dt);
          if (s.p.y < s.floor) { s.p.y = s.floor; s.v.y *= -0.3; s.v.x *= 0.6; s.v.z *= 0.6; }
        }
      }
      for (const s of P) {
        const u = s.t / s.life, f = u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9;
        pPos[n * 3] = s.p.x; pPos[n * 3 + 1] = s.p.y; pPos[n * 3 + 2] = s.p.z;
        pCol[n * 3] = s.c.r * f * s.k; pCol[n * 3 + 1] = s.c.g * f * s.k; pCol[n * 3 + 2] = s.c.b * f * s.k;
        pSize[n] = s.s0 + (s.s1 - s.s0) * u;
        n++;
      }
      pGeo.setDrawRange(0, n);
      pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.size.needsUpdate = true;
    }

    // ---------- beams: breath, lasers, streams ----------
    const beamGeo = own(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5));
    const beamMat = () => own(new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color() }, uT: { value: 0 }, uA: { value: 0 }, uCore: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uC; uniform float uT; uniform float uA; uniform float uCore; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
          float n = 0.65 + 0.35 * sin(vUv.y * 40.0 - uT * 38.0 + sin(vUv.x * 6.283 * 3.0) * 2.0);
          float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          vec3 c = mix(uC, vec3(1.0), uCore * f * f) * (0.2 + 1.3 * pow(f, 1.5 - uCore)) * n;
          gl_FragColor = vec4(c * uA * edge, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const beams = Array.from({ length: 5 }, () => {
      const g = new THREE.Group(), core = new THREE.Mesh(beamGeo, beamMat()), shell = new THREE.Mesh(beamGeo, beamMat());
      core.material.uniforms.uCore.value = 1;
      g.add(shell, core); g.visible = false; scene.add(g);
      return { g, core, shell, t: 0, life: 0, w: 1, from: new V(), to: new V(), grow: 0.08, follow: null };
    });
    function beam(from, to, c, w = 1, life = 0.6, o = {}) {
      const b = beams.find(x => !x.g.visible) || beams[0];
      b.g.visible = true; b.from.copy(from); b.to.copy(to); b.t = 0; b.life = life; b.w = w; b.grow = o.grow ?? 0.08; b.follow = o.follow || null;
      b.core.material.uniforms.uC.value.copy(C(c)); b.shell.material.uniforms.uC.value.copy(C(c));
      return b;
    }
    function updateBeams(dt, t) {
      for (const b of beams) {
        if (!b.g.visible) continue;
        b.t += dt; const u = b.t / b.life;
        if (u >= 1) { b.g.visible = false; continue; }
        if (b.follow) b.follow(b.from, b.to);
        const len = b.from.distanceTo(b.to), reach = clamp(b.t / Math.max(0.01, b.grow), 0, 1);
        b.g.position.copy(b.from); b.g.lookAt(b.to);
        const fade = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25, wob = 1 + Math.sin(t * 60) * 0.06;
        b.core.scale.set(b.w * 0.32 * wob * fade, b.w * 0.32 * wob * fade, len * reach);
        b.shell.scale.set(b.w * wob * (0.7 + 0.3 * fade), b.w * wob * (0.7 + 0.3 * fade), len * reach);
        for (const m of [b.core, b.shell]) { m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = fade; }
      }
    }

    // ---------- shocks: rings on the floor or in the air ----------
    const ringGeo = own(new THREE.RingGeometry(0.6, 1, 64, 1));
    const ringMat = () => own(new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color() }, uA: { value: 0 }, uW: { value: 0.3 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uC; uniform float uA; uniform float uW; varying vec2 vP;
        void main(){ float r = length(vP); float x = (r - 0.6) / 0.4; float a = smoothstep(0.0, 1.0 - uW, x) * smoothstep(1.0, 0.92, x); a = pow(a, 1.6);
          float hot = smoothstep(0.75, 0.97, x) * smoothstep(1.0, 0.95, x);
          gl_FragColor = vec4((uC * a + vec3(1.0) * hot * 0.6) * uA, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const shocks = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(ringGeo, ringMat()); m.visible = false; m.renderOrder = 4; scene.add(m); return { m, t: 0, life: 1, r0: 1, r1: 5 }; });
    function shock(at, c, r0, r1, life = 0.6, o = {}) {
      const s = shocks.find(x => !x.m.visible) || shocks[0];
      s.m.visible = true; s.m.position.copy(at); s.t = 0; s.life = life; s.r0 = r0; s.r1 = r1; s.speedPow = o.pow ?? 3;
      s.m.rotation.set(o.flat === false ? 0 : -Math.PI / 2, o.ry || 0, 0);
      if (o.face) s.m.lookAt(o.face);
      s.m.material.uniforms.uC.value.copy(c.isColor ? c : C(c)); s.m.material.uniforms.uW.value = o.w ?? 0.4; s.k = o.k ?? 1;
      return s;
    }
    function updateShocks(dt) {
      for (const s of shocks) {
        if (!s.m.visible) continue;
        s.t += dt; const u = s.t / s.life;
        if (u >= 1) { s.m.visible = false; continue; }
        const e = 1 - Math.pow(1 - u, s.speedPow);
        s.m.scale.setScalar(s.r0 + (s.r1 - s.r0) * e);
        s.m.material.uniforms.uA.value = (1 - u) * s.k;
      }
    }

    // ---------- telegraphs on the floor ----------
    const markMat = () => own(new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color() }, uU: { value: 0 }, uA: { value: 0 }, uT: { value: 0 }, uKind: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uC; uniform float uU; uniform float uA; uniform float uT; uniform float uKind; varying vec2 vP;
        void main(){ float r = length(vP); float ang = atan(vP.y, vP.x);
          float rim = smoothstep(0.9, 0.96, r) * smoothstep(1.0, 0.97, r);
          float fill = step(r, uU) * (0.18 + 0.5 * smoothstep(uU - 0.08, uU, r));
          float ticks = step(0.5, fract(ang * 6.0 / 3.14159 + uT * 0.6)) * smoothstep(0.8, 0.84, r) * smoothstep(0.88, 0.84, r);
          float cross = (1.0 - smoothstep(0.015, 0.03, abs(vP.x))) + (1.0 - smoothstep(0.015, 0.03, abs(vP.y)));
          cross *= step(r, 0.75) * 0.5 * uKind;
          float a = rim + fill + ticks * 0.8 + cross;
          float pulse = 0.75 + 0.25 * sin(uT * (8.0 + uU * 18.0));
          gl_FragColor = vec4(uC * a * uA * pulse * smoothstep(1.0, 0.98, r), 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const markGeo = own(new THREE.CircleGeometry(1, 64));
    const marks = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(markGeo, markMat()); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3; scene.add(m); return { m, a: 0, on: false, u: 0 }; });
    function mark(at, r, c, kind = 1) {
      const k = marks.find(x => !x.m.visible) || marks[0];
      k.m.visible = true; k.on = true; k.u = 0; k.a = 0; k.m.position.copy(at); k.m.scale.setScalar(r);
      k.m.material.uniforms.uC.value.copy(c.isColor ? c : C(c)); k.m.material.uniforms.uKind.value = kind;
      return { set: u => { k.u = u; }, off: () => { k.on = false; }, at: k.m.position, mesh: k.m };
    }
    function updateMarks(dt, t) {
      for (const k of marks) {
        if (!k.m.visible) continue;
        k.a += ((k.on ? 1 : 0) - k.a) * Math.min(1, dt * (k.on ? 10 : 6));
        if (!k.on && k.a < 0.02) { k.m.visible = false; continue; }
        const U = k.m.material.uniforms; U.uU.value = k.u; U.uA.value = k.a; U.uT.value = t;
      }
    }

    // ---------- orbs: charging energy ----------
    const orbGeo = own(new THREE.IcosahedronGeometry(1, 3));
    const orbs = Array.from({ length: 4 }, () => {
      const g = new THREE.Group(), shell = new THREE.Mesh(orbGeo, shellMat('#ffffff', 1.4)), core = new THREE.Mesh(orbGeo, glow('#ffffff', 2.5));
      core.scale.setScalar(0.45); g.add(shell, core); g.visible = false; scene.add(g);
      return { g, shell, core, size: 0, want: 0, follow: null };
    });
    function orb(c, follow) {
      const o = orbs.find(x => !x.g.visible) || orbs[0];
      o.g.visible = true; o.size = 0; o.want = 0; o.follow = follow;
      o.shell.material.uniforms.uC.value.copy(C(c, 1.6)); o.core.material.color.copy(C(c).lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(2.5));
      return { grow: s => { o.want = s; }, pop: () => { o.want = 0; o.dying = true; }, pos: o.g.position, o };
    }
    function updateOrbs(dt, t) {
      for (const o of orbs) {
        if (!o.g.visible) continue;
        o.size += (o.want - o.size) * Math.min(1, dt * (o.dying ? 14 : 5));
        if (o.dying && o.size < 0.03) { o.g.visible = false; o.dying = false; continue; }
        if (o.follow) o.follow(o.g.position);
        const j = 1 + Math.sin(t * 31) * 0.06 + Math.sin(t * 17) * 0.05;
        o.g.scale.setScalar(Math.max(0.001, o.size * j));
        o.g.rotation.set(t * 2, t * 3, 0);
        o.shell.material.uniforms.uT.value = t;
      }
    }

    // ---------- lights for flashes ----------
    // one light, always in the scene (a changing light count would recompile every lit material): the newest flash wins
    const lights = Array.from({ length: 1 }, () => { const l = new THREE.PointLight(0xffffff, 0, 30, 1.6); scene.add(l); return { l, k: 0, decay: 6 }; });
    function lightAt(at, c, k = 40, decay = 6, range = 30) {
      const L = lights[0];
      if (k < L.k * 0.6) return;
      L.l.position.copy(at); L.l.color.copy(c.isColor ? c : C(c)); L.k = k; L.decay = decay; L.l.distance = range;
    }
    function updateLights(dt) { for (const L of lights) { L.k *= Math.exp(-L.decay * dt); if (L.k < 0.05) L.k = 0; L.l.intensity = L.k; } }

    function update(dt, t, px) {
      pMat.uniforms.uPx.value = px;
      updateSparks(dt); updateBeams(dt, t); updateShocks(dt); updateMarks(dt, t); updateOrbs(dt, t); updateLights(dt);
      for (const m of mats) m.userData.u.uTime.value = t;
    }
    function clear() {
      for (const s of P) pool.push(s); P.length = 0;
      beams.forEach(b => { b.g.visible = false; }); shocks.forEach(s => { s.m.visible = false; });
      marks.forEach(k => { k.m.visible = false; k.on = false; }); orbs.forEach(o => { o.g.visible = false; o.dying = false; });
      lights.forEach(L => { L.k = 0; L.l.intensity = 0; });
    }
    function dispose() {
      clear();
      for (const g of [points, ...beams.map(b => b.g), ...shocks.map(s => s.m), ...marks.map(k => k.m), ...orbs.map(o => o.g)]) scene.remove(g);
      lights.forEach(L => scene.remove(L.l));
      keep.forEach(x => x.dispose && x.dispose());
      if (envTex) envTex.dispose();
    }
    // everything made after scope() is disposed by the function it returns (a boss's model and props)
    function scope() {
      const k0 = keep.length, m0 = mats.length;
      return () => { keep.splice(k0).forEach(x => x.dispose && x.dispose()); mats.splice(m0); };
    }
    return {
      armor, glow, shellMat, geo, environment, own, scope, C, rnd, srnd, clamp,
      fx: { spark, burst, suck, beam, shock, mark, orb, light: lightAt },
      update, clear, dispose, info: () => ({ sparks: P.length }),
    };
  }
  return { create };
})();
