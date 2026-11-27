// CannonFX: the Syntax Error's arm-cannon shot (27 Nov 2026). Light streaks spiral in from all round
// and feed an orb at the muzzle that swells, spins rings and throws arcs as it charges; a target ring
// tightens on the floor; then the orb collapses into a beam with a muzzle flash, shock rings and an
// impact burst. Shared by the attack editor (tools/pose-editor) and the game (boss3d).
//
//   const fx = CannonFX.create(THREE, { color: '#ff2e4d', scale: 1 })
//   scene.add(fx.group)                 world space: it doesn't ride on the hand
//   fx.update({ phase, u, t, at, dir, target, reduce })
//     phase   null | 'spark' (raising the arm) | 'grow' (charging) | 'fire' (the shot) | 'beam' (after it)
//     u       0..1 through that phase
//     t       seconds, any clock that keeps running (drives the swirl and flicker)
//     at      THREE.Vector3, the muzzle in world space
//     dir     THREE.Vector3, the way the cannon points (unit)
//     target  THREE.Vector3 on the floor where the shot lands (optional: else where dir meets y = 0)
//     reduce  true for Reduce flashing (smaller, dimmer flashes)
//   fx.dispose()
// Colours are pushed past 1 so a bloom pass picks them up (the game's bloom threshold is 0.78).
window.CannonFX = (() => {
  const N = 420;   // light streaks drawn in while it charges

  function create(THREE, opts = {}) {
    const V = THREE.Vector3, sc = opts.scale || 1;
    const COL = new THREE.Color(opts.color || '#ff2e4d'), HOT = new THREE.Color('#ffd6de'), WHITE = new THREE.Color('#ffffff');
    const hdr = (c, k) => c.clone().multiplyScalar(k);
    const keep = [], own = x => (keep.push(x), x);
    const group = new THREE.Group(); group.name = 'cannon-fx';
    const add = (o, order = 5) => { o.renderOrder = order; o.frustumCulled = false; group.add(o); return o; };
    const addMat = (extra = {}) => own(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...extra }));

    // a soft round glow for sprites and points
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    const glowTex = own(new THREE.CanvasTexture(cv)); glowTex.colorSpace = THREE.SRGBColorSpace;
    const sprite = (c, k, order) => add(new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: hdr(c, k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }))), order);

    // ---------- the orb: a swirling shell, a white-hot core and two halos ----------
    const NOISE = `
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
    const shellMat = own(new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0 }, uCol: { value: hdr(COL, 2.2) }, uHot: { value: hdr(HOT, 3.0) } },
      vertexShader: `uniform float uT, uK; varying vec3 vN, vV, vP; ${NOISE}
        void main(){ vec3 p = position; float w = n3(p * 2.5 + uT * 2.0) - 0.5; p += normal * w * 0.16 * uK;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uT, uK; uniform vec3 uCol, uHot; varying vec3 vN, vV, vP; ${NOISE}
        void main(){ float f = 1.0 - abs(dot(vN, vV)); float rim = pow(f, 1.6);
          float a = atan(vP.z, vP.x); vec3 q = vec3(cos(a + uT * 3.0), vP.y * 2.0 - uT * 0.7, sin(a + uT * 3.0)) * 2.2;
          float sw = smoothstep(0.45, 0.85, n3(q + vec3(0.0, uT * 1.3, 0.0)) * 0.7 + n3(q * 2.3 - uT) * 0.45);
          vec3 c = mix(uCol, uHot, pow(1.0 - f, 3.0) * 0.8) * (0.35 + rim * 1.2 + sw * 0.9);
          gl_FragColor = vec4(c, (0.35 + rim * 0.65) * (0.55 + 0.45 * uK)); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    const orb = add(new THREE.Mesh(own(new THREE.SphereGeometry(1, 48, 32)), shellMat), 6);
    const core = add(new THREE.Mesh(own(new THREE.SphereGeometry(1, 24, 16)), addMat({ color: hdr(WHITE, 3.2) })), 7);
    const halo = sprite(COL, 1.4, 4), haloBig = sprite(COL, 0.3, 3), flash = sprite(HOT, 2, 9);

    // rings spinning round the orb, and a flat swirl (an accretion disc) facing the way it aims
    const rings = [[1.55, 0.035, 1], [1.95, 0.025, -1.4], [2.45, 0.02, 0.8]].map(([r, tube, spin], i) => {
      const m = add(new THREE.Mesh(own(new THREE.TorusGeometry(r, tube, 6, 96)), addMat({ color: hdr(i === 1 ? HOT : COL, 2.4) })), 6);
      m.userData = { spin, tilt: new V(Math.sin(i * 2.1), Math.cos(i * 1.7), Math.sin(i * 0.9 + 1)).normalize() };
      return m;
    });
    const discMat = own(new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0 }, uCol: { value: hdr(COL, 2.0) }, uHot: { value: hdr(HOT, 2.4) } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uT, uK; uniform vec3 uCol, uHot; varying vec2 vU;
        void main(){ vec2 p = vU * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
          float arms = pow(0.5 + 0.5 * sin(a * 3.0 + log(r + 0.05) * 7.0 + uT * 9.0), 4.0);
          float band = smoothstep(0.28, 0.42, r) * (1.0 - smoothstep(0.7, 1.0, r));
          vec3 c = mix(uHot, uCol, smoothstep(0.35, 0.9, r)) * arms * band;
          gl_FragColor = vec4(c, arms * band * uK); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    }));
    const disc = add(new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)), discMat), 5);

    // ---------- the streaks of light drawn in ----------
    const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const ptPos = new Float32Array(N * 3), ptCol = new Float32Array(N * 3), ptSize = new Float32Array(N);
    const ptGeo = own(new THREE.BufferGeometry());
    ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3)); ptGeo.setAttribute('color', new THREE.BufferAttribute(ptCol, 3)); ptGeo.setAttribute('size', new THREE.BufferAttribute(ptSize, 1));
    const ptMat = own(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTex }, uScale: { value: 300 } },
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 280.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D uMap; varying vec3 vC; void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vC * a, a); }',
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    const points = add(new THREE.Points(ptGeo, ptMat), 8);
    const lnPos = new Float32Array(N * 6), lnCol = new Float32Array(N * 6), lnGeo = own(new THREE.BufferGeometry());
    lnGeo.setAttribute('position', new THREE.BufferAttribute(lnPos, 3)); lnGeo.setAttribute('color', new THREE.BufferAttribute(lnCol, 3));
    const streaks = add(new THREE.LineSegments(lnGeo, own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))), 8);

    // ---------- arcs crackling off the orb ----------
    const ARCS = 5, ARC_PTS = 9;
    const arcs = Array.from({ length: ARCS }, (_, i) => {
      const geo = own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_PTS * 3), 3));
      return add(new THREE.Line(geo, own(new THREE.LineBasicMaterial({ color: hdr(i % 2 ? HOT : WHITE, 2.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))), 8);
    });

    // ---------- the target on the floor ----------
    const flat = (inner, outer, c, k, seg = 64) => { const m = add(new THREE.Mesh(own(new THREE.RingGeometry(inner, outer, seg)), addMat({ color: hdr(c, k), side: THREE.DoubleSide })), 2); m.rotation.x = -Math.PI / 2; return m; };
    const mark = new THREE.Group(); group.add(mark);
    const markOuter = flat(0.92, 1.0, COL, 1.8), markInner = flat(0.42, 0.47, HOT, 1.6), markFill = flat(0, 1, COL, 0.35);
    const ticks = Array.from({ length: 4 }, () => { const m = add(new THREE.Mesh(own(new THREE.PlaneGeometry(0.08, 0.32)), addMat({ color: hdr(HOT, 2), side: THREE.DoubleSide })), 2); m.rotation.x = -Math.PI / 2; return m; });
    [markOuter, markInner, markFill, ...ticks].forEach(m => { group.remove(m); mark.add(m); });

    // ---------- the shot ----------
    const beamGeo = own(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true)); beamGeo.translate(0, 0.5, 0);
    const beamShader = (c, k, edge) => own(new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uLen: { value: 10 }, uA: { value: 0 }, uCol: { value: hdr(c, k) } },
      vertexShader: 'varying vec2 vU; varying vec3 vN, vV; void main(){ vU = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uT, uLen, uA; uniform vec3 uCol; varying vec2 vU; varying vec3 vN, vV;
        void main(){ float side = pow(abs(dot(vN, vV)), ${edge.toFixed(1)});
          float flow = 0.65 + 0.35 * sin(vU.y * uLen * 1.4 - uT * 60.0) * sin(vU.x * 6.2832 * 3.0 + uT * 20.0);
          float ends = smoothstep(0.0, 0.02, vU.y) * (1.0 - smoothstep(0.96, 1.0, vU.y));
          gl_FragColor = vec4(uCol * side * flow * ends * uA, side * uA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    }));
    const beamOuter = add(new THREE.Mesh(beamGeo, beamShader(COL, 2.2, 1.5)), 7), beamCore = add(new THREE.Mesh(beamGeo, beamShader(WHITE, 3.5, 0.8)), 8);
    const shocks = [0, 1].map(i => add(new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.025, 6, 64)), addMat({ color: hdr(i ? HOT : COL, 2.0) })), 7));
    const hitFlash = sprite(HOT, 2, 9), hitRing = flat(0.86, 1.0, COL, 2.2), hitRing2 = flat(0.94, 1.0, HOT, 2.0);

    // ---------- per frame ----------
    const all = () => group.children;
    const tmp = new V(), tmp2 = new V(), axis = new V(), side1 = new V(), side2 = new V(), q = new THREE.Quaternion(), UP = new V(0, 1, 0);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const hideAll = () => all().forEach(o => { o.visible = false; });

    // a streak's place on its way in: p 0 (far) .. 1 (at the orb), spiralling round the aim axis
    function streakAt(i, cyc, p, at, rOrb, out) {
      const h1 = hash(i * 7.13 + cyc * 3.71), h2 = hash(i * 1.91 + cyc * 9.17), h3 = hash(i * 4.37 + cyc * 1.33);
      const z = h1 * 2 - 1, a0 = h2 * Math.PI * 2, rr = Math.sqrt(1 - z * z);
      const far = (5.5 + h3 * 4.5) * sc, r = rOrb * 0.7 + (far - rOrb * 0.7) * Math.pow(1 - p, 1.7);
      const a = a0 + p * p * (2.2 + h3 * 1.5);   // the swirl tightens as it nears
      out.copy(axis).multiplyScalar(z * r).addScaledVector(side1, Math.cos(a) * rr * r).addScaledVector(side2, Math.sin(a) * rr * r).add(at);
      return out;
    }

    function update(s) {
      if (!s || !s.phase) { hideAll(); return; }
      const t = s.t || 0, u = clamp(s.u || 0, 0, 1), at = s.at, dir = tmp2.copy(s.dir || new V(0, 0, 1)).normalize(), calm = !!s.reduce;
      hideAll();
      axis.copy(dir); side1.copy(Math.abs(axis.y) < 0.9 ? UP : new V(1, 0, 0)).cross(axis).normalize(); side2.copy(axis).cross(side1).normalize();
      // charge level 0..1 and the orb's radius
      const K = s.phase === 'spark' ? 0.12 * u : s.phase === 'grow' ? 0.12 + 0.88 * sm(u) : 1;
      const full = s.phase === 'grow' ? clamp((u - 0.85) / 0.15, 0, 1) : 0;   // the last moment before the shot
      let rOrb = (0.25 + 1.25 * K) * sc * (1 + 0.06 * Math.sin(t * 22) * K + 0.08 * full * Math.sin(t * 60));
      const firing = s.phase === 'fire' || s.phase === 'beam';
      if (s.phase === 'fire') rOrb *= 1 - sm(u) * 0.75; else if (s.phase === 'beam') rOrb *= 0.25 * (1 - u);

      // where it lands
      let end;
      if (s.target) end = s.target.clone();
      else { const k = dir.y < -0.02 ? at.y / -dir.y : 60; end = at.clone().addScaledVector(dir, Math.min(60, k)); if (end.y < 0) end.y = 0; }

      if (rOrb > 0.02) {
        orb.visible = core.visible = halo.visible = haloBig.visible = true;
        orb.position.copy(at); orb.scale.setScalar(rOrb); orb.rotation.set(t * 0.7, t * 1.3, 0);
        shellMat.uniforms.uT.value = t; shellMat.uniforms.uK.value = K;
        core.position.copy(at); core.scale.setScalar(rOrb * (0.42 + 0.08 * Math.sin(t * 31)));
        const pulse = 1 + 0.12 * Math.sin(t * 14) + 0.25 * full;
        halo.position.copy(at); halo.scale.setScalar(rOrb * 4.2 * pulse); halo.material.opacity = 0.75;
        haloBig.position.copy(at); haloBig.scale.setScalar(rOrb * 6.5 * pulse); haloBig.material.opacity = 0.3 + 0.3 * K;
      }
      // rings and disc while charging
      if (!firing && K > 0.15) {
        const show = sm((K - 0.15) / 0.4);
        rings.forEach((m, i) => {
          m.visible = true; m.position.copy(at);
          const sp = (1.2 + 5 * K) * m.userData.spin;
          q.setFromAxisAngle(m.userData.tilt, t * sp * 0.6); m.quaternion.setFromUnitVectors(new V(0, 0, 1), axis).multiply(q);
          m.rotateZ(t * sp); m.scale.setScalar(rOrb * (1 + 0.15 * Math.sin(t * 3 + i)) * (1 - 0.25 * full));
          m.material.opacity = show * (0.55 + 0.45 * Math.sin(t * 9 + i * 2) ** 2);
        });
        disc.visible = true; disc.position.copy(at); disc.quaternion.setFromUnitVectors(new V(0, 0, 1), axis); disc.scale.setScalar(rOrb * 2.8);
        discMat.uniforms.uT.value = t; discMat.uniforms.uK.value = show * 0.45;
      }
      // streaks of light pulled in
      if (!firing || (s.phase === 'fire' && u < 0.5)) {
        const dens = s.phase === 'spark' ? 0.08 + 0.15 * u : s.phase === 'grow' ? 0.35 + 0.65 * sm(u * 1.4) : 0.6;
        const speed = s.phase === 'grow' ? 1 + 1.6 * K : 0.8;
        let n = 0;
        for (let i = 0; i < N; i++) {
          if (hash(i * 3.3) > dens) { ptSize[i] = 0; lnPos.fill(0, i * 6, i * 6 + 6); continue; }
          const life = (0.55 + hash(i * 5.7) * 0.5) / speed, ph = t / life + hash(i * 9.1), cyc = Math.floor(ph), p = ph - cyc;
          const head = streakAt(i, cyc, p, at, rOrb, tmp), j = i * 3;
          ptPos[j] = head.x; ptPos[j + 1] = head.y; ptPos[j + 2] = head.z;
          const fade = sm(p / 0.18) * (1 - sm((p - 0.92) / 0.08)), hot = p * p;
          const c = COL.clone().lerp(HOT, hot).multiplyScalar((2.2 + 2.8 * hot) * fade);
          ptCol[j] = c.r; ptCol[j + 1] = c.g; ptCol[j + 2] = c.b; ptSize[i] = (0.2 + 0.3 * hash(i * 2.9)) * sc * (1.25 - 0.6 * p);
          const tail = streakAt(i, cyc, Math.max(0, p - 0.08 - 0.1 * p), at, rOrb, tmp2.clone()), k6 = i * 6;
          lnPos[k6] = head.x; lnPos[k6 + 1] = head.y; lnPos[k6 + 2] = head.z; lnPos[k6 + 3] = tail.x; lnPos[k6 + 4] = tail.y; lnPos[k6 + 5] = tail.z;
          lnCol[k6] = c.r; lnCol[k6 + 1] = c.g; lnCol[k6 + 2] = c.b; lnCol[k6 + 3] = lnCol[k6 + 4] = lnCol[k6 + 5] = 0;
          n++;
        }
        ptGeo.attributes.position.needsUpdate = ptGeo.attributes.color.needsUpdate = ptGeo.attributes.size.needsUpdate = true;
        lnGeo.attributes.position.needsUpdate = lnGeo.attributes.color.needsUpdate = true;
        points.visible = streaks.visible = n > 0;
        dir.copy(axis);
      }
      // arcs once it's well charged
      if (!firing && K > 0.35) {
        const tick = Math.floor(t * 18);
        arcs.forEach((ln, a) => {
          if (hash(a * 13.1 + tick * 0.77) > 0.25 + 0.6 * K) return;
          ln.visible = true; const arr = ln.geometry.attributes.position.array;
          const h1 = hash(a + tick * 1.31), h2 = hash(a * 2.7 + tick * 0.53), z = h1 * 2 - 1, an = h2 * Math.PI * 2, rr = Math.sqrt(1 - z * z);
          const d = new V().copy(axis).multiplyScalar(z).addScaledVector(side1, Math.cos(an) * rr).addScaledVector(side2, Math.sin(an) * rr);
          const len = rOrb * (1.6 + 1.6 * hash(a * 9 + tick));
          for (let k = 0; k < ARC_PTS; k++) {
            const f = k / (ARC_PTS - 1), jit = k && k < ARC_PTS - 1 ? 0.35 * rOrb : 0;
            const pnt = new V().copy(d).multiplyScalar(rOrb * 0.9 + len * f).add(at)
              .add(new V(hash(k + tick * 3.1 + a) - 0.5, hash(k * 2.3 + tick + a) - 0.5, hash(k * 5.1 + tick * 1.7 + a) - 0.5).multiplyScalar(jit * 2));
            arr[k * 3] = pnt.x; arr[k * 3 + 1] = pnt.y; arr[k * 3 + 2] = pnt.z;
          }
          ln.geometry.attributes.position.needsUpdate = true;
          ln.material.opacity = 0.6 + 0.4 * hash(a + tick * 7);
        });
      }
      // the target tightens on the floor while it charges
      if (s.phase === 'grow' || s.phase === 'spark' || (s.phase === 'fire' && u < 0.6)) {
        const k = s.phase === 'spark' ? u * 0.4 : s.phase === 'grow' ? 0.4 + 0.6 * u : 1;
        mark.visible = true; mark.children.forEach(m => { m.visible = true; });
        mark.position.set(end.x, 0.06, end.z);
        const r = (4.2 - 1.8 * sm(k)) * sc; mark.scale.setScalar(r); mark.rotation.y = t * (0.8 + 2 * k);
        markOuter.material.opacity = 0.4 + 0.6 * k * (0.75 + 0.25 * Math.sin(t * 12));
        markInner.material.opacity = 0.6 * k; markFill.material.opacity = 0.18 * k * (0.6 + 0.4 * Math.sin(t * 8));
        ticks.forEach((m, i) => { const a = i * Math.PI / 2; m.position.set(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72); m.rotation.z = -a + Math.PI / 2; m.material.opacity = k; });
      }
      // the shot
      if (firing) {
        const len = at.distanceTo(end);
        const w = s.phase === 'fire' ? 0.2 + 1.2 * sm(u) : 1.4 * (1 - sm(u)) * (0.85 + 0.15 * Math.sin(t * 70));
        if (w > 0.01) {
          [beamOuter, beamCore].forEach((m, i) => {
            m.visible = true; m.position.copy(at); m.quaternion.setFromUnitVectors(UP, tmp.copy(end).sub(at).normalize());
            const rw = (i ? 0.42 : 1.2) * w * sc; m.scale.set(rw, len, rw);
            m.material.uniforms.uT.value = t; m.material.uniforms.uLen.value = len; m.material.uniforms.uA.value = i ? 1 : 0.85;
          });
        }
        // the flash at the muzzle and the impact, the shock rings
        const fk = s.phase === 'fire' ? sm(u * 2) : 1 - sm(u / 0.6);
        const fl = calm ? 0.5 : 1;
        if (fk > 0.01) {
          flash.visible = true; flash.position.copy(at); flash.scale.setScalar((2.6 + 2.2 * fk) * sc * fl); flash.material.opacity = 0.8 * fk * fl;
          hitFlash.visible = true; hitFlash.position.copy(end).setY(Math.max(0.6, end.y)); hitFlash.scale.setScalar(5 * fk * sc * fl); hitFlash.material.opacity = 0.9 * fk * fl;
        }
        const life = s.phase === 'fire' ? u * 0.25 : 0.25 + 0.75 * u;   // 0..1 across the shot and the beam
        shocks.forEach((m, i) => {
          const g = clamp(life * 1.3 - i * 0.2, 0, 1); if (g <= 0 || g >= 1) return;
          m.visible = true; m.position.copy(at).addScaledVector(axis, (1 + 4 * g + 1.5 * i) * sc);
          m.quaternion.setFromUnitVectors(new V(0, 0, 1), axis); m.scale.setScalar((0.8 + 1.8 * sm(g)) * sc); m.material.opacity = (1 - g) * 0.85;
        });
        [hitRing, hitRing2].forEach((m, i) => {
          const g = clamp(life * 1.2 - i * 0.15, 0, 1); if (g <= 0 || g >= 1) return;
          m.visible = true; m.position.set(end.x, 0.07, end.z); m.scale.setScalar((1 + 5 * sm(g)) * sc); m.material.opacity = (1 - g) * 0.9;
        });
      }
    }

    function dispose() { group.parent && group.parent.remove(group); keep.forEach(x => x.dispose && x.dispose()); }
    hideAll();
    return { group, update, dispose };
  }
  return { create };
})();
