// The titans' attack effects in Boss Rush: floor telegraphs, charge glows, impact flashes, shockwave
// rings, sparks, dust and steam, debris that bounces, swing trails and beams. Everything is pooled and
// built once per arena: one point cloud for every particle, one instanced mesh for every chunk of
// debris, eight rings, two floor decals, two trails, one beam and one light, so a fight builds no new
// shader after the first frame. js/app/rush/scene.js drives it from the titans' attacks.
//
//   const tfx = RushTitanFX.create(THREE, scene, { glowTex, calm, reduce })
//   tfx.tele(slot, shape, at, to, k, col, o)   a floor telegraph: shape 'ring' | 'lane' | 'fan' | 'mark'; k 0..1 fills it
//                                              (o.width for a lane, o.angle for a fan, o.r for a ring or a mark)
//   tfx.teleOff(slot)
//   tfx.burst(at, n, o)       particles: { col, speed, up, size, life, grav, drag, spread, dir, kind: 'spark' | 'dust' | 'steam' | 'ember' }
//   tfx.debris(at, n, o)      chunks that fly and bounce: { col, speed, up, size, life, dir, spread }
//   tfx.ring(at, r0, r1, secs, col, o)   a shockwave ring on the floor (o.y, o.thick, o.tilt)
//   tfx.flash(at, col, k)     a light pulse
//   tfx.beam(from, to, k, col)   tfx.beamOff()
//   tfx.trail(slot, p, col, on)  feed a swing trail one point a frame while on; off lets it fade
//   tfx.update(dt)  tfx.clear()  tfx.dispose()  tfx.info()
window.RushTitanFX = (() => {
  function create(THREE, scene, o = {}) {
    const V = THREE.Vector3;
    const keep = [];
    const own = x => (keep.push(x), x);
    const calm = !!o.calm, reduce = !!o.reduce;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const root = new THREE.Group(); scene.add(root);
    let detailK = 1;   // adaptive quality: fewer particles and chunks on a slow machine (setDetail)

    // ---------- particles: one point cloud ----------
    const NP = reduce ? 360 : 720;
    const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pSize = new Float32Array(NP), pA = new Float32Array(NP);
    const pv = Array.from({ length: NP }, () => ({ v: new V(), life: 0, max: 1, grav: 0, drag: 0, s0: 1, s1: 1, a0: 1, kind: 0 }));
    const pGeo = own(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('alpha', new THREE.BufferAttribute(pA, 1).setUsage(THREE.DynamicDrawUsage));
    const pMat = own(new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = size * uScale / max(0.5, -mv.z); }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
          float a = vA * (1.0 - r) * (1.0 - r); gl_FragColor = vec4(vC * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; root.add(points);
    // steam and dust are not additive: a second cloud with normal blending, sharing the arrays' layout
    const NS = reduce ? 90 : 180;
    const sPos = new Float32Array(NS * 3), sCol = new Float32Array(NS * 3), sSize = new Float32Array(NS), sA = new Float32Array(NS);
    const sv = Array.from({ length: NS }, () => ({ v: new V(), life: 0, max: 1, grav: 0, drag: 0, s0: 1, s1: 1, a0: 1, kind: 1 }));
    const sGeo = own(new THREE.BufferGeometry());
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
    sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
    sGeo.setAttribute('size', new THREE.BufferAttribute(sSize, 1).setUsage(THREE.DynamicDrawUsage));
    sGeo.setAttribute('alpha', new THREE.BufferAttribute(sA, 1).setUsage(THREE.DynamicDrawUsage));
    const sMat = own(new THREE.ShaderMaterial({
      uniforms: { uScale: pMat.uniforms.uScale },
      vertexShader: pMat.vertexShader,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
          float a = vA * pow(1.0 - r, 1.6) * 0.9; gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false,
    }));
    const smoke = new THREE.Points(sGeo, sMat); smoke.frustumCulled = false; root.add(smoke);
    let pNext = 0, sNext = 0, pLive = 0;
    const KIND = { spark: 0, ember: 1, dust: 2, steam: 3, glow: 4 };
    function burst(at, n, b = {}) {
      const kind = KIND[b.kind || 'spark'], soft = kind === 2 || kind === 3;
      n = Math.round(n * (reduce ? 0.5 : calm ? 0.8 : 1) * detailK);
      const col = C(b.col || '#ffffff', soft ? 1 : (b.k || 2));
      for (let i = 0; i < n; i++) {
        const P = soft ? sv : pv, idx = soft ? (sNext = (sNext + 1) % NS) : (pNext = (pNext + 1) % NP);
        const p = P[idx], pos = soft ? sPos : pPos, cl = soft ? sCol : pCol;
        const sp = (b.speed || 6) * rnd(0.35, 1);
        if (b.dir) {
          p.v.copy(b.dir).normalize();
          p.v.x += rnd(-1, 1) * (b.spread ?? 0.5); p.v.y += rnd(-1, 1) * (b.spread ?? 0.5); p.v.z += rnd(-1, 1) * (b.spread ?? 0.5);
          p.v.normalize().multiplyScalar(sp);
        } else { p.v.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(sp); }
        p.v.y += b.up || 0;
        const r = b.radius || 0;
        pos[idx * 3] = at.x + rnd(-r, r); pos[idx * 3 + 1] = at.y + rnd(-r, r) * 0.5; pos[idx * 3 + 2] = at.z + rnd(-r, r);
        const jit = soft ? 1 : rnd(0.75, 1.15);
        cl[idx * 3] = col.r * jit; cl[idx * 3 + 1] = col.g * jit; cl[idx * 3 + 2] = col.b * jit;
        p.max = p.life = (b.life || 0.7) * rnd(0.6, 1.2);
        p.grav = b.grav ?? (kind === 0 ? -14 : kind === 3 ? 1.5 : kind === 2 ? -1 : -4);
        p.drag = b.drag ?? (soft ? 2.2 : 1.2);
        p.s0 = (b.size || (soft ? 1.4 : 0.22)) * rnd(0.7, 1.3); p.s1 = soft ? p.s0 * (b.grow || 2.6) : p.s0 * 0.4;
        p.a0 = b.alpha ?? (soft ? 0.55 : 1);
        p.kind = kind;
      }
    }
    function stepCloud(P, pos, size, alpha, N, dt, geo) {
      let live = 0;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
        live++;
        p.life -= dt;
        const k = 1 - Math.max(0, p.life) / p.max;
        p.v.y += p.grav * dt; p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        pos[i * 3] += p.v.x * dt; pos[i * 3 + 1] += p.v.y * dt; pos[i * 3 + 2] += p.v.z * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; p.v.y = Math.abs(p.v.y) * 0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
        size[i] = p.s0 + (p.s1 - p.s0) * k;
        alpha[i] = p.a0 * (p.kind === 3 || p.kind === 2 ? Math.sin(Math.min(1, k * 1.2) * Math.PI) : 1 - k * k);
      }
      if (live || geo.userData.live) { for (const a of ['position', 'size', 'alpha', 'color']) geo.attributes[a].needsUpdate = true; }
      geo.userData.live = live;
      return live;
    }

    // ---------- debris: instanced chunks with lit edges ----------
    const ND = reduce ? 40 : 90;
    const dGeo = own(new THREE.BoxGeometry(1, 1, 1));
    const dMat = own(new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec2 vUv; varying vec3 vC; varying float vN;
        void main(){ vUv = uv; vC = instanceColor; vN = normal.y * 0.5 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vC; varying float vN;
        void main(){ vec2 e = min(vUv, 1.0 - vUv); float d = min(e.x, e.y);
          float edge = smoothstep(0.12, 0.02, d);
          gl_FragColor = vec4(vec3(0.05, 0.055, 0.06) * (0.6 + 0.8 * vN) + vC * edge * 1.6, 1.0); }`,
    }));
    const debrisMesh = new THREE.InstancedMesh(dGeo, dMat, ND);
    debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ND * 3), 3);
    debrisMesh.frustumCulled = false; debrisMesh.count = 0; root.add(debrisMesh);
    const dv = Array.from({ length: ND }, () => ({ p: new V(), v: new V(), r: new V(), w: new V(), s: 1, life: 0, max: 1 }));
    let dNext = 0;
    const _o = new THREE.Object3D();
    function debris(at, n, b = {}) {
      n = Math.round(n * (reduce ? 0.5 : 1) * detailK);
      const col = C(b.col || '#ffb020', 1.4);
      for (let i = 0; i < n; i++) {
        const d = dv[dNext = (dNext + 1) % ND];
        d.p.copy(at); d.p.x += rnd(-1, 1) * (b.radius || 0.3); d.p.z += rnd(-1, 1) * (b.radius || 0.3);
        const sp = (b.speed || 7) * rnd(0.4, 1);
        if (b.dir) { d.v.copy(b.dir).normalize(); d.v.x += rnd(-1, 1) * (b.spread ?? 0.6); d.v.z += rnd(-1, 1) * (b.spread ?? 0.6); d.v.y += rnd(0, 1) * (b.spread ?? 0.6); d.v.normalize().multiplyScalar(sp); }
        else d.v.set(rnd(-1, 1), rnd(0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(sp);
        d.v.y += b.up ?? 3;
        d.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); d.w.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
        d.s = (b.size || 0.35) * rnd(0.5, 1.4);
        d.max = d.life = (b.life || 1.15) * rnd(0.7, 1.15);
        debrisMesh.instanceColor.setXYZ(dNext, col.r, col.g, col.b);
      }
      debrisMesh.instanceColor.needsUpdate = true;
    }
    function stepDebris(dt) {
      let n = 0;
      for (let i = 0; i < ND; i++) {
        const d = dv[i];
        if (d.life <= 0) { _o.scale.setScalar(0); _o.updateMatrix(); debrisMesh.setMatrixAt(i, _o.matrix); continue; }
        n++;
        d.life -= dt;
        d.v.y -= 22 * dt;
        d.p.addScaledVector(d.v, dt);
        // a chunk that lands bounces once or twice and burns out fast, so no rubble lies round the titan's feet
        if (d.p.y < d.s * 0.5) { d.p.y = d.s * 0.5; d.v.y = Math.abs(d.v.y) * 0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); d.life = Math.min(d.life, d.max * 0.35); }
        d.r.addScaledVector(d.w, dt);
        const k = d.life / d.max;
        _o.position.copy(d.p); _o.rotation.set(d.r.x, d.r.y, d.r.z); _o.scale.setScalar(d.s * Math.min(1, k * 4));
        _o.updateMatrix(); debrisMesh.setMatrixAt(i, _o.matrix);
      }
      debrisMesh.count = n ? ND : 0;   // nothing drawn while no debris is flying
      if (n || debrisMesh.userData.n) debrisMesh.instanceMatrix.needsUpdate = true;
      debrisMesh.userData.n = n;
      return n;
    }

    // ---------- shockwave rings ----------
    const ringGeo = own(new THREE.RingGeometry(0.72, 1, 72, 1));
    const ringMat = () => own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color() }, uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA; varying vec3 vP;
        void main(){ float r = length(vP.xy); float k = smoothstep(0.72, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r)) + smoothstep(0.72, 1.0, r) * 0.15;
          gl_FragColor = vec4(uCol * k * uA, k * uA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const rings = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(ringGeo, ringMat()); m.rotation.x = -Math.PI / 2; m.visible = false; root.add(m);
      return { m, t: 0, secs: 1, r0: 0, r1: 1, on: false, k: 2 };
    });
    let ringNext = 0;
    function ring(at, r0, r1, secs, col, b = {}) {
      const r = rings[ringNext = (ringNext + 1) % rings.length];
      r.m.position.set(at.x, b.y ?? 0.06, at.z); r.m.rotation.set(-Math.PI / 2 + (b.tilt || 0), 0, 0);
      r.m.material.uniforms.uCol.value.copy(C(col, b.k || 2.2));
      Object.assign(r, { t: 0, secs, r0, r1, on: true, thick: b.thick || 1 });
      r.m.visible = true;
    }

    // ---------- scorch and cracks where a blow lands ----------
    // One canvas of jagged cracks round a burn: red channel the cracks (they glow in the titan's colour and
    // cool down), green the burn (it darkens the floor and fades). Premultiplied blending does both in one pass.
    const crackTex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const g = cv.getContext('2d');
      const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      rg.addColorStop(0, 'rgba(0,200,0,1)'); rg.addColorStop(0.45, 'rgba(0,120,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgb(255,0,0)'; g.lineCap = 'round';
      for (let i = 0; i < 11; i++) {
        let a = i / 11 * Math.PI * 2 + Math.random() * 0.4, r = 8, x = 128, y = 128;
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(x, y);
        while (r < 120) { r += 10 + Math.random() * 14; a += (Math.random() - 0.5) * 0.7; x = 128 + Math.cos(a) * r; y = 128 + Math.sin(a) * r; g.lineTo(x, y); g.lineWidth = Math.max(1.5, 5 - r / 30); }
        g.stroke();
        if (Math.random() < 0.6) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a + 1) * 20, y + Math.sin(a + 1) * 20); g.stroke(); }
      }
      const t = own(new THREE.CanvasTexture(cv)); return t;
    })();
    const scGeo = own(new THREE.PlaneGeometry(2, 2));
    const scorches = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(scGeo, own(new THREE.ShaderMaterial({
        uniforms: { uMap: { value: crackTex }, uCol: { value: new THREE.Color() }, uGlow: { value: 0 }, uA: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; uniform float uGlow, uA; varying vec2 vUv;
          void main(){ vec4 tx = texture2D(uMap, vUv); float a = tx.g * uA * 0.75; gl_FragColor = vec4(uCol * tx.r * uGlow, a); }`,
        transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      })));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; root.add(m);
      return { m, t: 0, on: false };
    });
    let scNext = 0;
    function scorch(at, r, col) {
      const S = scorches[scNext = (scNext + 1) % scorches.length];
      S.m.position.set(at.x, 0.03, at.z); S.m.scale.setScalar(r); S.m.rotation.z = Math.random() * 6.3;
      S.m.material.uniforms.uCol.value.copy(C(col, 2.4)); S.t = 0; S.on = true; S.m.visible = true;
    }

    // ---------- floor telegraphs ----------
    // One shader draws four shapes on a floor quad: a filling disc (ring), a lane from the titan to you,
    // a fan of a given angle, and a target mark that tightens on you. Stripes crawl toward you and the
    // edge brightens as k nears 1, so a long wind-up reads from across the arena.
    const teleGeo = own(new THREE.PlaneGeometry(2, 2));
    const teleMat = () => own(new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uCol: { value: new THREE.Color() }, uShape: { value: 0 }, uT: { value: 0 }, uAng: { value: 1 }, uW: { value: 0.2 }, uA: { value: 1 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uK, uShape, uT, uAng, uW, uA; uniform vec3 uCol; varying vec2 vP;
        void main(){
          float a = 0.0; vec2 p = vP;
          if (uShape < 0.5) {                     // ring: a disc whose fill grows out to the edge
            float r = length(p); float edge = smoothstep(0.035, 0.0, abs(r - 0.97)) * step(r, 1.0);
            float fill = step(r, uK) * 0.22 + smoothstep(0.05, 0.0, abs(r - uK)) * 0.9;
            float stripe = 0.12 * step(0.5, fract(r * 7.0 - uT * 1.6)) * step(r, 1.0);
            a = max(edge * (0.35 + 0.65 * uK), fill) + stripe * (0.4 + uK);
          } else if (uShape < 1.5) {              // lane: x across, y from the titan (-1) to you (1)
            float side = smoothstep(0.03, 0.0, abs(abs(p.x) - uW)) * step(abs(p.y), 1.0);
            float inside = step(abs(p.x), uW);
            float y = p.y * 0.5 + 0.5;
            float fill = inside * (step(y, uK) * 0.25 + smoothstep(0.04, 0.0, abs(y - uK)) * 0.9);
            float chev = inside * 0.25 * step(0.6, fract(y * 6.0 - abs(p.x) * 2.0 - uT * 1.4));
            a = side * (0.4 + 0.6 * uK) + fill + chev * (0.4 + uK);
          } else if (uShape < 2.5) {              // fan: angle uAng either side of the way to you (+y)
            float r = length(p); float ang = abs(atan(p.x, p.y));
            float inA = step(ang, uAng) * step(r, 1.0);
            float edge = (smoothstep(0.03, 0.0, abs(r - 0.97)) + smoothstep(0.02, 0.0, abs(ang - uAng)) * step(0.12, r)) * inA;
            float fill = inA * (step(r, uK) * 0.2 + smoothstep(0.04, 0.0, abs(r - uK)) * 0.85);
            a = edge * (0.4 + 0.6 * uK) + fill + inA * 0.1 * step(0.5, fract(r * 6.0 - uT * 1.5));
          } else {                                // mark: rings close in on you
            float r = length(p);
            float rr = mix(1.0, 0.32, uK);
            float ring = smoothstep(0.04, 0.0, abs(r - rr)) + smoothstep(0.03, 0.0, abs(r - 0.3)) * 0.7;
            float cross = (smoothstep(0.025, 0.0, abs(p.x)) + smoothstep(0.025, 0.0, abs(p.y))) * step(0.36, r) * step(r, rr);
            a = ring + cross * 0.6 + step(r, 0.3) * 0.18 * uK;
          }
          a *= uA;
          gl_FragColor = vec4(uCol * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const SHAPE = { ring: 0, lane: 1, fan: 2, mark: 3 };
    const teles = [0, 1].map(() => { const m = new THREE.Mesh(teleGeo, teleMat()); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; root.add(m); return { m, fade: 0, on: false }; });
    const dir2 = new V();
    function tele(slot, shape, at, to, k, col, b = {}) {
      const T = teles[slot], u = T.m.material.uniforms;
      T.on = true; T.fade = 1; T.m.visible = true;
      u.uShape.value = SHAPE[shape] ?? 0; u.uK.value = k; u.uCol.value.copy(C(col, 1.6)); u.uA.value = 1;
      dir2.set(to.x - at.x, 0, to.z - at.z);
      const len = Math.max(0.5, dir2.length());
      const yaw = Math.atan2(dir2.x, dir2.z);
      T.m.rotation.set(-Math.PI / 2, 0, yaw + Math.PI);   // the quad's local +y now points from the titan to you
      if (shape === 'lane') {
        T.m.position.set((at.x + to.x) / 2, 0.05 + slot * 0.01, (at.z + to.z) / 2);
        T.m.scale.set(1, len / 2, 1); u.uW.value = b.width || 0.25;
      } else if (shape === 'fan') {
        T.m.position.set(at.x, 0.05 + slot * 0.01, at.z); T.m.scale.set(len, len, 1); u.uAng.value = b.angle || 0.8;
      } else if (shape === 'mark') {
        T.m.position.set(to.x, 0.05 + slot * 0.01, to.z); T.m.scale.setScalar(b.r || 1.8);
      } else {
        T.m.position.set(at.x, 0.05 + slot * 0.01, at.z); T.m.scale.setScalar(b.r || len);
      }
    }
    function teleOff(slot) { const T = teles[slot]; T.on = false; }

    // ---------- swing trails ----------
    const TN = 18;
    const trails = [0, 1].map(() => {
      const pos = new Float32Array(TN * 2 * 3), al = new Float32Array(TN * 2);
      const g = own(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('alpha', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
      const idx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = own(new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color() } },
        vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA, vA); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.visible = false; root.add(mesh);
      return { mesh, g, pos, al, pts: [], on: false, fade: 0 };
    });
    function trail(slot, a, b, col, on = true) {
      const T = trails[slot];
      if (on) {
        if (!T.on) { T.pts.length = 0; T.mesh.material.uniforms.uCol.value.copy(C(col, 2.2)); }
        T.on = true; T.fade = 1; T.mesh.visible = true;
        T.pts.unshift([a.clone(), b.clone()]); if (T.pts.length > TN) T.pts.pop();
      } else T.on = false;
    }
    function stepTrails(dt) {
      for (const T of trails) {
        if (!T.mesh.visible) continue;
        if (!T.on) { T.fade -= dt / 0.25; if (T.fade <= 0) { T.mesh.visible = false; T.pts.length = 0; continue; } }
        for (let i = 0; i < TN; i++) {
          const q = T.pts[Math.min(i, T.pts.length - 1)];
          if (!q) continue;
          T.pos.set([q[0].x, q[0].y, q[0].z], i * 6); T.pos.set([q[1].x, q[1].y, q[1].z], i * 6 + 3);
          const k = i < T.pts.length ? (1 - i / TN) * T.fade : 0;
          T.al[i * 2] = k * 0.15; T.al[i * 2 + 1] = k * 0.9;
        }
        T.g.attributes.position.needsUpdate = true; T.g.attributes.alpha.needsUpdate = true;
      }
    }

    // ---------- beam ----------
    const beamGeo = own(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)); beamGeo.translate(0, 0.5, 0); beamGeo.rotateX(Math.PI / 2);
    const beamMat = own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color() }, uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uT, uA; varying vec2 vUv; varying vec3 vN;
        void main(){ float rim = pow(abs(vN.z), 1.5); float n = 0.7 + 0.3 * sin(vUv.y * 40.0 - uT * 30.0);
          float a = uA * (0.25 + rim * 0.9) * n; gl_FragColor = vec4(mix(uCol, vec3(1.0), rim * 0.5) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const beamMesh = new THREE.Mesh(beamGeo, beamMat); beamMesh.visible = false; beamMesh.frustumCulled = false; root.add(beamMesh);
    let beamOn = false;
    function beam(from, to, k, col) {
      beamOn = true; beamMesh.visible = true;
      beamMesh.position.copy(from); beamMesh.lookAt(to);
      const len = from.distanceTo(to), w = 0.25 + 0.6 * k;
      beamMesh.scale.set(w, w, len);
      beamMat.uniforms.uCol.value.copy(C(col, 2)); beamMat.uniforms.uA.value = Math.min(1, k * 1.4);
    }
    function beamOff() { beamOn = false; }

    // ---------- a blast shell: a bright sphere that swells and thins out ----------
    const novaGeo = own(new THREE.IcosahedronGeometry(1, 3));
    const novaMat = own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color() }, uA: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA; varying vec3 vN; varying vec3 vV;
        void main(){ float f = 1.0 - abs(dot(vN, vV)); float a = uA * (0.15 + pow(f, 2.0) * 0.85); gl_FragColor = vec4(mix(vec3(1.0), uCol, f) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const novaMesh = new THREE.Mesh(novaGeo, novaMat); novaMesh.visible = false; root.add(novaMesh);
    let novaT = 1, novaSecs = 0.7, novaR = 6;
    function nova(at, r, col, secs = 0.7) { novaMesh.position.copy(at); novaMat.uniforms.uCol.value.copy(C(col, 2)); novaT = 0; novaSecs = secs; novaR = r; novaMesh.visible = true; }

    // ---------- light pulses ----------
    // a soft glow at the spot, and the caller's lights lifted for a moment (o.onFlash), instead of a point
    // light: one more light in every lit material cost a quarter of the frame on slow machines
    const flashSpr = o.glowTex ? new THREE.Sprite(own(new THREE.SpriteMaterial({ map: o.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))) : null;
    if (flashSpr) { flashSpr.visible = false; root.add(flashSpr); }
    let lightK = 0, flashCol = new THREE.Color();
    function flash(at, col, k = 1) { lightK = Math.max(lightK, k * (calm ? 0.6 : 1)); flashCol.set(col); if (flashSpr) { flashSpr.position.copy(at); flashSpr.material.color.copy(flashCol).multiplyScalar(1.6); } }

    let clock = 0;
    function update(dt) {
      clock += dt;
      const a = stepCloud(pv, pPos, pSize, pA, NP, dt, pGeo), b = stepCloud(sv, sPos, sSize, sA, NS, dt, sGeo);
      points.visible = a > 0; smoke.visible = b > 0; pLive = a + b;
      stepDebris(dt);
      for (const r of rings) {
        if (!r.on) continue;
        r.t += dt / r.secs;
        if (r.t >= 1) { r.on = false; r.m.visible = false; continue; }
        const e = 1 - Math.pow(1 - r.t, 2.2);
        r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
        r.m.material.uniforms.uA.value = (1 - r.t) * (1 - r.t) * 1.4;
      }
      for (const T of teles) {
        if (!T.m.visible) continue;
        T.m.material.uniforms.uT.value = clock;
        if (!T.on) { T.fade -= dt / 0.3; T.m.material.uniforms.uA.value = Math.max(0, T.fade); if (T.fade <= 0) T.m.visible = false; }
      }
      stepTrails(dt);
      if (novaMesh.visible) { novaT += dt / novaSecs; const e = 1 - Math.pow(1 - Math.min(1, novaT), 3); novaMesh.scale.setScalar(0.3 + novaR * e); novaMat.uniforms.uA.value = (1 - Math.min(1, novaT)) * (calm ? 0.8 : 1.3); if (novaT >= 1) novaMesh.visible = false; }
      for (const S of scorches) {
        if (!S.on) continue;
        S.t += dt;
        const u = S.m.material.uniforms;
        u.uGlow.value = Math.max(0, 1 - S.t / 1.1) ** 1.5; u.uA.value = Math.min(1, S.t * 12) * Math.max(0, 1 - Math.max(0, S.t - 1.2) / 1.4);
        if (S.t > 2.6) { S.on = false; S.m.visible = false; }
      }
      if (beamMesh.visible) { beamMat.uniforms.uT.value = clock; if (!beamOn) { beamMat.uniforms.uA.value -= dt / 0.25; if (beamMat.uniforms.uA.value <= 0) beamMesh.visible = false; } }
      if (lightK > 0) {
        lightK = Math.max(0, lightK - dt * 4);
        if (flashSpr) { flashSpr.visible = lightK > 0; flashSpr.material.opacity = Math.min(1, lightK); flashSpr.scale.setScalar(2.5 + 3.5 * lightK); }
        if (o.onFlash) o.onFlash(flashCol, lightK);
      }
    }
    function setScale(px) { pMat.uniforms.uScale.value = px * 0.5; }
    function clear() {
      for (const p of pv) p.life = 0; for (const p of sv) p.life = 0; for (const d of dv) d.life = 0;
      rings.forEach(r => { r.on = false; r.m.visible = false; }); scorches.forEach(S => { S.on = false; S.m.visible = false; }); teles.forEach(T => { T.on = false; T.m.visible = false; });
      trails.forEach(T => { T.on = false; T.mesh.visible = false; T.pts.length = 0; }); beamOn = false; beamMesh.visible = false;
      lightK = 0; if (flashSpr) flashSpr.visible = false; if (o.onFlash) o.onFlash(flashCol, 0); novaMesh.visible = false;
    }
    function dispose() { scene.remove(root); keep.forEach(x => x.dispose && x.dispose()); }
    return { setDetail: k => { detailK = k; }, root, tele, teleOff, burst, debris, ring, scorch, nova, flash, beam, beamOff, trail, update, clear, dispose, setScale, info: () => ({ particles: pLive, debris: dv.filter(d => d.life > 0).length }) };
  }
  return { create };
})();
