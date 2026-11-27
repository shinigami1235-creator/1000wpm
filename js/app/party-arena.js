// The party run's arenas: Keyspace areas a team walks into to fight a boss. One build that
// re-dresses itself for each area: a circuit floor whose traces glow in the area's colour, the
// boss's ring, light shafts and drifting data, and a set for each kind of boss:
//   relay (hydra)        server towers with blinking racks and cables slung between them
//   market (swarm)       strings of lanterns over market stalls and a sign
//   transit, junction    the train's track laid along its route, and gantries over it
//   firmware, foundry    pipes, smokestacks with fire in them, cracks of molten light, embers
//   core, mirror         a reactor ring turning overhead and energy pillars
//
//   const A = PartyArena.build(THREE, scene, { lite })
//   A.set(pal, kind, path)   pal: { bg, a, b, c, eye }, kind: the boss kind, path(tt, out) the train's route
//   A.update(t, dt, cam)     A.pulse(k) flares the traces (a slam), A.dispose()
window.PartyArena = (() => {
  function build(THREE, scene, o = {}) {
    const V = THREE.Vector3, keep = [], lite = !!o.lite;
    const own = x => (keep.push(x), x);
    const C = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
    let seed = 11;
    const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
    const root = new THREE.Group(); scene.add(root);
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
    { const c = glowCv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
    const glow = own(new THREE.CanvasTexture(glowCv));

    // ---------- the floor: dark tiles, and a separate layer of traces that glow in the area's colour ----------
    const tcv = document.createElement('canvas'); tcv.width = tcv.height = lite ? 256 : 512;
    {
      const c = tcv.getContext('2d'), W = tcv.width, s = W / 512;
      c.fillStyle = '#0a0e11'; c.fillRect(0, 0, W, W);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = rnd(8, 16) | 0; c.fillStyle = `rgb(${v},${v + 3},${v + 5})`; c.fillRect(x * 64 * s + 2, y * 64 * s + 2, 64 * s - 4, 64 * s - 4); }
      c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 3 * s;
      for (let k = 0; k <= 8; k++) { c.beginPath(); c.moveTo(k * 64 * s, 0); c.lineTo(k * 64 * s, W); c.stroke(); c.beginPath(); c.moveTo(0, k * 64 * s); c.lineTo(W, k * 64 * s); c.stroke(); }
      for (let i = 0; i < 1800 * s; i++) { c.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.04).toFixed(3)})`; c.fillRect(rnd(0, W), rnd(0, W), rnd(1, 3), 1); }
    }
    const tileTex = own(new THREE.CanvasTexture(tcv)); tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping; tileTex.repeat.set(10, 10); tileTex.colorSpace = THREE.SRGBColorSpace; tileTex.anisotropy = 4;
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(140, 140)), own(new THREE.MeshLambertMaterial({ map: tileTex })));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; root.add(floor);
    // circuit traces: right-angle runs with pads at their ends, white on black, drawn as light
    const ccv = document.createElement('canvas'); ccv.width = ccv.height = lite ? 512 : 1024;
    {
      const c = ccv.getContext('2d'), W = ccv.width, g = W / 64;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
      c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = 0; k < 120; k++) {
        let x = Math.floor(rnd(0, 64)), y = Math.floor(rnd(0, 64));
        c.lineWidth = rnd() < 0.2 ? g * 0.42 : g * 0.2; c.globalAlpha = rnd(0.35, 1);
        c.beginPath(); c.moveTo(x * g, y * g);
        let dir = Math.floor(rnd(0, 4));
        const steps = 3 + Math.floor(rnd(0, 7));
        for (let st = 0; st < steps; st++) {
          const len = 1 + Math.floor(rnd(0, 5));
          const d = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]][dir];
          x += d[0] * len; y += d[1] * len; c.lineTo(x * g, y * g);
          dir = (dir + (rnd() < 0.5 ? 1 : 3) + (rnd() < 0.3 ? 4 : 0)) % 6;
        }
        c.stroke();
        c.beginPath(); c.arc(x * g, y * g, g * 0.45, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }
    const traceTex = own(new THREE.CanvasTexture(ccv)); traceTex.wrapS = traceTex.wrapT = THREE.RepeatWrapping; traceTex.repeat.set(3, 3);
    // the traces fade out with distance from the middle, and a light runs along them
    const traceMat = own(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: traceTex }, uCol: { value: new THREE.Color('#39ff88') }, uT: { value: 0 }, uK: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec2 vP; void main(){ vUv = uv * 3.0; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; uniform float uT; uniform float uK; varying vec2 vUv; varying vec2 vP;
        void main(){ float m = texture2D(uMap, vUv).r; float r = length(vP - vec2(0.0, 4.0));
          float fade = smoothstep(46.0, 8.0, r); float run = 0.55 + 0.45 * sin(r * 0.7 - uT * 2.4);
          float ring = exp(-pow((r - uK * 40.0) * 0.35, 2.0)) * uK * 2.5;
          gl_FragColor = vec4(uCol * m * fade * (0.22 + 0.25 * run + ring), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const traces = new THREE.Mesh(own(new THREE.PlaneGeometry(100, 100)), traceMat);
    traces.rotation.x = -Math.PI / 2; traces.position.y = 0.005; traces.renderOrder = 1; root.add(traces);

    // the boss's ring: an engraved circle round where it fights, with a slow rune band
    const rcv = document.createElement('canvas'); rcv.width = rcv.height = 512;
    {
      const c = rcv.getContext('2d'); c.translate(256, 256); c.strokeStyle = '#fff'; c.fillStyle = '#fff';
      c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 248, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 226, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 150, 0, Math.PI * 2); c.stroke();
      c.font = '600 18px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const CH = 'KEYSPACE 0x1F BREACH WARD ';
      for (let k = 0; k < 64; k++) { c.save(); c.rotate(k / 64 * Math.PI * 2); c.fillText(CH[k % CH.length], 0, -237); c.restore(); }
      for (let k = 0; k < 12; k++) { c.save(); c.rotate(k / 12 * Math.PI * 2); c.fillRect(-3, -226, 6, 30); c.restore(); }
    }
    const ringTex = own(new THREE.CanvasTexture(rcv));
    const bossRing = new THREE.Mesh(own(new THREE.PlaneGeometry(19, 19)), own(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    bossRing.rotation.x = -Math.PI / 2; bossRing.position.set(0, 0.012, -4); bossRing.renderOrder = 1; root.add(bossRing);
    const bossPool = new THREE.Mesh(own(new THREE.PlaneGeometry(26, 26)), own(new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    bossPool.rotation.x = -Math.PI / 2; bossPool.position.set(0, 0.008, -4); root.add(bossPool);

    // ---------- light: a cool fill, a key from over the team, the area's colour from behind ----------
    const hemi = new THREE.HemisphereLight('#9fb4c2', '#07090b', 0.7); scene.add(hemi); keep.push(hemi);
    const key = new THREE.DirectionalLight('#f1f5ff', 1.8); key.position.set(3, 12, 18); scene.add(key); keep.push(key);
    const back = new THREE.DirectionalLight('#ffffff', 1.5); back.position.set(-6, 9, -20); scene.add(back); keep.push(back);
    const bossLight = new THREE.PointLight('#ffffff', 40, 26, 1.6); bossLight.position.set(0, 7, 2); scene.add(bossLight); keep.push(bossLight);

    // shafts of light down into the haze
    const coneGeo = own(new THREE.CylinderGeometry(0.4, 3.2, 30, 24, 1, true)); coneGeo.translate(0, -15, 0);
    const shaftMat = c => own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(c) }, uOp: { value: 0.1 } },
      vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = -position.y / 30.0; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uOp; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 2.4); float a = e * (1.0 - vH) * smoothstep(0.0, 0.08, vH) * uOp; gl_FragColor = vec4(uCol * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const shafts = [];
    for (let k = 0; k < (lite ? 3 : 5); k++) {
      const m = new THREE.Mesh(coneGeo, shaftMat('#ffffff'));
      m.position.set(-18 + k * 9 + rnd(-2, 2), 30, -16 + rnd(-6, 4)); m.rotation.set(rnd(-0.12, 0.12), 0, rnd(-0.2, 0.2)); m.renderOrder = 2; root.add(m);
      shafts.push({ m, ph: rnd(0, 9) });
    }
    // drifting data motes
    const DN = lite ? 140 : 320, dpos = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) { dpos[i * 3] = rnd(-30, 30); dpos[i * 3 + 1] = rnd(0, 18); dpos[i * 3 + 2] = rnd(-30, 8); }
    const dGeo = own(new THREE.BufferGeometry()); dGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    const motes = new THREE.Points(dGeo, own(new THREE.PointsMaterial({ map: glow, color: '#ffffff', size: 0.22, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
    motes.frustumCulled = false; root.add(motes);

    // ---------- the sets, one per kind of boss ----------
    const darkMat = own(new THREE.MeshStandardMaterial({ color: '#141a1e', metalness: 0.6, roughness: 0.5 }));
    const lamb = own(new THREE.MeshLambertMaterial({ color: '#12181b' }));
    const accentMats = [];   // materials that take the area's colour (set() recolours them)
    const amat = (k = 1, op = 1, add = false) => { const m = own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: op < 1 || add, opacity: op, toneMapped: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add })); m.userData.k = k; accentMats.push([m, 'a']); return m; };
    const cmat = (k = 1, op = 1, add = false) => { const m = amat(k, op, add); accentMats[accentMats.length - 1][1] = 'c'; return m; };
    const boxG = own(new THREE.BoxGeometry(1, 1, 1));
    const sets = {};
    const mk = name => { const g = new THREE.Group(); g.visible = false; root.add(g); sets[name] = { g, tick: null }; return sets[name]; };

    // relay: server towers in an arc, their racks blinking, cables slung between them
    {
      const S = mk('hydra');
      const lcv = document.createElement('canvas'); lcv.width = 64; lcv.height = 256;
      { const c = lcv.getContext('2d'); c.fillStyle = '#05080a'; c.fillRect(0, 0, 64, 256); for (let y = 6; y < 256; y += 9) { c.fillStyle = '#10161a'; c.fillRect(4, y, 56, 6); for (let x = 8; x < 58; x += 6) if (rnd() < 0.55) { c.fillStyle = rnd() < 0.15 ? '#ff4d5e' : '#ffffff'; c.globalAlpha = rnd(0.3, 1); c.fillRect(x, y + 2, 2, 2); c.globalAlpha = 1; } } }
      const rackTex = own(new THREE.CanvasTexture(lcv)); rackTex.wrapS = rackTex.wrapT = THREE.RepeatWrapping;
      const rackMat = amat(1.0); rackMat.map = rackTex; rackMat.userData.k = 0.9;
      const N = lite ? 10 : 16, pts = [];
      for (let k = 0; k < N; k++) {
        const a = Math.PI * (1.12 + 0.76 * k / (N - 1)), r = 30 + rnd(-3, 3), h = rnd(10, 22), w = rnd(2.4, 3.6);
        const x = Math.cos(a) * r, z = Math.sin(a) * r - 4;
        const t = new THREE.Mesh(boxG, lamb); t.scale.set(w, h, w); t.position.set(x, h / 2, z); t.lookAt(0, h / 2, -4); S.g.add(t);
        const face = new THREE.Mesh(own(new THREE.PlaneGeometry(w * 0.8, h * 0.92)), rackMat); face.position.set(x, h / 2, z); face.lookAt(0, h / 2, -4); face.translateZ(w / 2 + 0.02); S.g.add(face);
        rackTex.repeat.set(1, Math.round(h / 6));
        pts.push(new V(x, h - 0.5, z));
      }
      // cables: sagging curves between neighbouring towers
      const cab = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        for (const dy of [0, -2.5]) for (let s = 0; s < 16; s++) {
          const u0 = s / 16, u1 = (s + 1) / 16, sag = u => -Math.sin(u * Math.PI) * 3.5 + dy;
          cab.push(a.x + (b.x - a.x) * u0, a.y + (b.y - a.y) * u0 + sag(u0), a.z + (b.z - a.z) * u0, a.x + (b.x - a.x) * u1, a.y + (b.y - a.y) * u1 + sag(u1), a.z + (b.z - a.z) * u1);
        }
      }
      const cg = own(new THREE.BufferGeometry()); cg.setAttribute('position', new THREE.Float32BufferAttribute(cab, 3));
      S.g.add(new THREE.LineSegments(cg, own(new THREE.LineBasicMaterial({ color: '#050708' }))));
      S.tick = t => { rackTex.offset.y = Math.floor(t * 3) * 0.031; };
    }
    // market: lantern strings over stalls, and a sign
    {
      const S = mk('swarm');
      const lanterns = [];
      for (let k = 0; k < 7; k++) {
        const x0 = -26 + k * 8.5, z0 = -18 - rnd(0, 6);
        // a stall: posts and an awning
        for (const dx of [-2.6, 2.6]) { const p = new THREE.Mesh(boxG, darkMat); p.scale.set(0.25, 4.2, 0.25); p.position.set(x0 + dx, 2.1, z0); S.g.add(p); }
        const aw = new THREE.Mesh(boxG, k % 2 ? amat(0.35) : cmat(0.3)); aw.scale.set(6, 0.18, 2.4); aw.position.set(x0, 4.3, z0 + 0.4); aw.rotation.x = 0.25; S.g.add(aw);
        const cnt = new THREE.Mesh(boxG, lamb); cnt.scale.set(5, 1.1, 1.4); cnt.position.set(x0, 0.55, z0); S.g.add(cnt);
        for (let s = 0; s < 9; s++) lanterns.push(new V(x0 - 4 + s, 7.6 - Math.sin(s / 8 * Math.PI) * 1.4, z0 + 2));
      }
      const lg = own(new THREE.SphereGeometry(0.22, 8, 6));
      const lm = amat(1.4); const inst = new THREE.InstancedMesh(lg, lm, lanterns.length);
      const m4 = new THREE.Matrix4(); lanterns.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
      S.g.add(inst); keep.push(inst);
      const halo = new THREE.Points(own(new THREE.BufferGeometry().setFromPoints(lanterns)), own(new THREE.PointsMaterial({ map: glow, size: 1.6, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd9a0' })));
      S.g.add(halo);
      const sign = new THREE.Mesh(boxG, amat(1.2)); sign.scale.set(9, 0.3, 0.3); sign.position.set(0, 14, -30); S.g.add(sign);
      const sign2 = new THREE.Mesh(boxG, cmat(1.2)); sign2.scale.set(0.3, 4, 0.3); sign2.position.set(-4.3, 12, -30); S.g.add(sign2);
      S.tick = t => { halo.material.opacity = 0.42 + 0.1 * Math.sin(t * 3.1); };
    }
    // transit and junction: the train's track along its route, gantries over it
    {
      const S = mk('snake');
      S.track = new THREE.Group(); S.g.add(S.track);
      for (let k = 0; k < 4; k++) {
        const x = -14 + k * 9.3, z = -12 - k % 2 * 3;
        for (const dx of [-3.4, 3.4]) { const p = new THREE.Mesh(boxG, darkMat); p.scale.set(0.4, 9, 0.4); p.position.set(x + dx, 4.5, z); S.g.add(p); }
        const beam = new THREE.Mesh(boxG, darkMat); beam.scale.set(7.4, 0.5, 0.5); beam.position.set(x, 9, z); S.g.add(beam);
        const sig = new THREE.Mesh(boxG, k % 2 ? amat(1.3) : cmat(1.3)); sig.scale.set(1.6, 0.4, 0.1); sig.position.set(x, 8.3, z + 0.3); S.g.add(sig);
      }
    }
    // firmware and foundry: pipes, smokestacks with fire, molten cracks, embers
    {
      const S = mk('golem');
      const pipeG = own(new THREE.CylinderGeometry(0.6, 0.6, 1, 12));
      for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(pipeG, darkMat); p.scale.set(1, 60, 1); p.rotation.z = Math.PI / 2; p.position.set(0, 2 + k * 1.6, -26 - k * 0.8); S.g.add(p); }
      const stacks = [];
      for (let k = 0; k < 5; k++) {
        const x = -24 + k * 12, z = -24 - rnd(0, 6), h = rnd(14, 22);
        const st = new THREE.Mesh(own(new THREE.CylinderGeometry(1.4, 1.9, 1, 14)), darkMat); st.scale.y = h; st.position.set(x, h / 2, z); S.g.add(st);
        const fire = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glow, color: '#ff8a3d', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })));
        fire.position.set(x, h + 0.6, z); fire.scale.set(4, 4, 1); S.g.add(fire); stacks.push(fire);
      }
      // cracks of molten light across the floor
      const crk = [];
      for (let k = 0; k < 9; k++) {
        let x = rnd(-22, 22), z = rnd(-22, -2), a = rnd(0, Math.PI * 2);
        for (let s = 0; s < 7; s++) { const nx = x + Math.cos(a) * rnd(1, 2.5), nz = z + Math.sin(a) * rnd(1, 2.5); crk.push(x, 0.02, z, nx, 0.02, nz); x = nx; z = nz; a += rnd(-0.8, 0.8); }
      }
      const cg = own(new THREE.BufferGeometry()); cg.setAttribute('position', new THREE.Float32BufferAttribute(crk, 3));
      const crackMat = own(new THREE.LineBasicMaterial({ color: '#ff7a2e', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      S.g.add(new THREE.LineSegments(cg, crackMat));
      S.tick = t => { stacks.forEach((f, i) => { const k = 0.8 + 0.2 * Math.sin(t * 9 + i * 2) + 0.1 * Math.sin(t * 23 + i); f.scale.set(4 * k, 4.6 * k, 1); }); crackMat.opacity = 0.55 + 0.25 * Math.sin(t * 1.3); };
      S.embers = true;
    }
    // core and mirror: a reactor ring turning overhead, energy pillars
    {
      const S = mk('twins');
      const ring = new THREE.Mesh(own(new THREE.TorusGeometry(13, 0.5, 8, 64)), darkMat); ring.position.set(0, 15, -10); ring.rotation.x = Math.PI / 2.3; S.g.add(ring);
      const ringGlow = new THREE.Mesh(own(new THREE.TorusGeometry(13, 0.14, 6, 96)), amat(1.6)); ringGlow.position.copy(ring.position); ringGlow.rotation.copy(ring.rotation); ringGlow.position.y -= 0.35; S.g.add(ringGlow);
      const ring2 = new THREE.Mesh(own(new THREE.TorusGeometry(9, 0.08, 6, 96)), cmat(1.6)); ring2.position.set(0, 17, -10); S.g.add(ring2);
      const pil = [];
      for (let k = 0; k < 6; k++) {
        const a = Math.PI * (1.15 + 0.7 * k / 5), x = Math.cos(a) * 20, z = Math.sin(a) * 20 - 6;
        const p = new THREE.Mesh(boxG, darkMat); p.scale.set(1.4, 14, 1.4); p.position.set(x, 7, z); S.g.add(p);
        const e = new THREE.Mesh(own(new THREE.CylinderGeometry(0.22, 0.22, 13, 8)), k % 2 ? amat(1.5, 0.9) : cmat(1.5, 0.9)); e.position.set(x, 7, z + 0.9); S.g.add(e); pil.push(e);
      }
      S.tick = t => { ring2.rotation.z = t * 0.4; ring2.rotation.x = Math.PI / 2 + Math.sin(t * 0.3) * 0.2; pil.forEach((e, i) => { e.material.opacity = 0.6 + 0.4 * Math.sin(t * 2.4 + i); }); };
    }
    // embers for the foundry (pooled points that rise)
    const EN = lite ? 60 : 140, epos = new Float32Array(EN * 3);
    for (let i = 0; i < EN; i++) { epos[i * 3] = rnd(-24, 24); epos[i * 3 + 1] = rnd(0, 14); epos[i * 3 + 2] = rnd(-26, 4); }
    const eGeo = own(new THREE.BufferGeometry()); eGeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const embers = new THREE.Points(eGeo, own(new THREE.PointsMaterial({ map: glow, color: '#ff8a3d', size: 0.3, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
    embers.frustumCulled = false; embers.visible = false; root.add(embers);

    // the train's track, laid along the route it runs: two lit rails and dark sleepers, as flat ribbons
    function layTrack(path) {
      const S = sets.snake, g = S.track;
      while (g.children.length) { const c = g.children.pop(); if (c.geometry && c.geometry !== boxG) c.geometry.dispose(); }
      if (!path) return;
      const p = new V(), q = new V(), rails = [], ties = [];
      const N = 300;
      const quad = (arr, ax, az, bx, bz, cx, cz, dx, dz, y) => arr.push(ax, y, az, bx, y, bz, cx, y, cz, ax, y, az, cx, y, cz, dx, y, dz);
      for (let k = 0; k < N; k++) {
        path(k / N * Math.PI * 2 / 0.36, p); path((k + 1) / N * Math.PI * 2 / 0.36, q);
        const d = new V().subVectors(q, p); const L = d.length(); if (L < 1e-4) continue; d.divideScalar(L);
        const sx = -d.z, sz = d.x;
        for (const off of [-1.05, 1.05]) {
          const a0 = off - 0.09, a1 = off + 0.09;
          quad(rails, p.x + sx * a0, p.z + sz * a0, p.x + sx * a1, p.z + sz * a1, q.x + sx * a1, q.z + sz * a1, q.x + sx * a0, q.z + sz * a0, 0.05);
        }
        if (k % 2 === 0) { const w = 0.16; quad(ties, p.x + sx * 1.5 - d.x * w, p.z + sz * 1.5 - d.z * w, p.x - sx * 1.5 - d.x * w, p.z - sz * 1.5 - d.z * w, p.x - sx * 1.5 + d.x * w, p.z - sz * 1.5 + d.z * w, p.x + sx * 1.5 + d.x * w, p.z + sz * 1.5 + d.z * w, 0.03); }
      }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rails, 3));
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(ties, 3));
      g.add(new THREE.Mesh(tg, tieMat), new THREE.Mesh(rg, railMat));
    }
    const railMat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, side: THREE.DoubleSide }));
    const tieMat = own(new THREE.MeshBasicMaterial({ color: '#1c2428', side: THREE.DoubleSide }));

    // ---------- the area ----------
    let pal = null, kind = '', cur = null, pulseK = 0;
    function set(p, k, path) {
      pal = p; kind = k;
      const bg = new THREE.Color(p.bg);
      scene.background = bg.clone();
      scene.fog = new THREE.FogExp2(bg.clone().lerp(new THREE.Color(p.b), 0.12), 0.016);
      traceMat.uniforms.uCol.value.set(p.a);
      bossRing.material.color.set(p.a).multiplyScalar(1.3);
      bossPool.material.color.set(p.b);
      back.color.set(p.a); bossLight.color.set(p.c);
      motes.material.color.set(p.c);
      for (const [m, w] of accentMats) m.color.set(w === 'c' ? p.c : p.a).multiplyScalar(m.userData.k || 1);
      shafts.forEach((s, i) => { s.m.material.uniforms.uCol.value.set(i % 2 ? p.a : '#dfe9ff'); });
      for (const n in sets) sets[n].g.visible = n === k;
      cur = sets[k] || null;
      if (k === 'snake') { railMat.color.set(p.c).multiplyScalar(0.9); layTrack(path); }
      embers.visible = !!(cur && cur.embers);
    }
    function pulse(k = 1) { pulseK = Math.max(pulseK, 0.001); pulseAmp = k; }
    let pulseAmp = 1;
    function update(t, dt) {
      traceMat.uniforms.uT.value = t;
      if (pulseK > 0) { pulseK += dt * 1.1; if (pulseK > 1) pulseK = 0; }
      traceMat.uniforms.uK.value = pulseK > 0 ? Math.min(1, pulseK) * pulseAmp : 0;
      bossRing.rotation.z = t * 0.05;
      shafts.forEach(s => { s.m.material.uniforms.uOp.value = 0.075 + 0.03 * Math.sin(t * 0.5 + s.ph); });
      const dp = dGeo.attributes.position.array;
      for (let i = 0; i < DN; i++) { dp[i * 3 + 1] += dt * (0.25 + (i % 5) * 0.06); if (dp[i * 3 + 1] > 18) dp[i * 3 + 1] = 0; }
      dGeo.attributes.position.needsUpdate = true;
      if (embers.visible) { const ep = eGeo.attributes.position.array; for (let i = 0; i < EN; i++) { ep[i * 3 + 1] += dt * (1.2 + (i % 4) * 0.4); ep[i * 3] += Math.sin(t + i) * dt * 0.3; if (ep[i * 3 + 1] > 15) ep[i * 3 + 1] = 0; } eGeo.attributes.position.needsUpdate = true; }
      if (cur && cur.tick) cur.tick(t, dt);
    }
    function dispose() { scene.remove(root); layTrack(null); keep.forEach(x => { try { x.dispose(); } catch (e) {} }); }
    return { set, update, pulse, dispose, root, bossLight };
  }
  return { build };
})();
