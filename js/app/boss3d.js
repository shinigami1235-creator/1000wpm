// The world boss in three.js: a giant program built from glowing blocks around
// a core. BossScene.mount(host) returns a controller right away and draws once
// three.js has loaded.
//   hit(letters, you)   spark, shake and a core pulse (pulses at most 3 a second)
//   setFrac(f, instant) damage states at 75%, 50%, 25% and 10% HP
//   defeat() / revive()
//   point()             a random spot on the boss in host pixels, for damage numbers
//   dispose()
window.BossScene = (() => {
  let libs = null;
  function load() {
    libs ||= Promise.all([
      import('three'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  function mount(host) {
    let impl = null, gone = false, pending = { frac: 1, instant: true, defeated: false };
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP]) => {
        if (gone) return false;
        impl = build(host, THREE, EC.EffectComposer, RP.RenderPass, UB.UnrealBloomPass, OP.OutputPass);
        impl.setFrac(pending.frac, true);
        if (pending.defeated) impl.defeat(true);
        return true;
      }),
      hit: (n, you) => impl && impl.hit(n, you),
      setFrac: (f, instant) => { pending.frac = f; if (impl) impl.setFrac(f, instant); },
      defeat: () => { pending.defeated = true; if (impl) impl.defeat(false); },
      revive: () => { pending.defeated = false; pending.frac = 1; if (impl) impl.revive(); },
      point: () => impl ? impl.point() : null,
      dispose: () => { gone = true; if (impl) impl.dispose(); impl = null; },
    };
    return ctl;
  }

  function build(host, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
    renderer.toneMapping = THREE.NoToneMapping;
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#010503');
    scene.fog = new THREE.Fog('#010503', 34, 80);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const target = new THREE.Vector3(0, 8.2, 0);
    const disposables = [];
    const keep = x => (disposables.push(x), x);

    // ---------- backdrop: a wall of falling code, a grid floor and a ring of light ----------
    const codeCv = document.createElement('canvas'); codeCv.width = codeCv.height = 512;
    {
      const c = codeCv.getContext('2d');
      c.font = '20px monospace';
      const CH = '01{}[]<>/=+*#$abcdef';
      for (let x = 0; x < 512; x += 16) for (let y = 0; y < 512; y += 22) {
        if (Math.random() < 0.55) { c.fillStyle = `rgba(57,255,136,${rnd(0.15, 0.9).toFixed(2)})`; c.fillText(CH[Math.floor(Math.random() * CH.length)], x, y); }
      }
    }
    const codeTex = keep(new THREE.CanvasTexture(codeCv));
    codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping;
    codeTex.repeat.set(7, 3);
    const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(130, 56)), keep(new THREE.MeshBasicMaterial({ map: codeTex, transparent: true, opacity: 0.22, depthWrite: false, fog: false })));
    wall.position.set(0, 18, -34);
    scene.add(wall);
    const grid = new THREE.GridHelper(140, 70, '#1f9e57', '#0a2a18');
    grid.material.transparent = true; grid.material.opacity = 0.5;
    keep(grid.geometry); keep(grid.material);
    scene.add(grid);
    const ringFloor = new THREE.Mesh(keep(new THREE.RingGeometry(6.5, 6.8, 96)), keep(new THREE.MeshBasicMaterial({ color: C('#39ff88', 1.1), side: THREE.DoubleSide })));
    ringFloor.rotation.x = -Math.PI / 2; ringFloor.position.y = 0.02;
    scene.add(ringFloor);
    const ringFloor2 = new THREE.Mesh(keep(new THREE.RingGeometry(9.5, 9.6, 96)), keep(new THREE.MeshBasicMaterial({ color: C('#1f9e57', 1.2), side: THREE.DoubleSide })));
    ringFloor2.rotation.x = -Math.PI / 2; ringFloor2.position.y = 0.02;
    scene.add(ringFloor2);

    // ---------- the body: blocks laid out on a grid in the shape of a giant ----------
    const S = 0.95;
    const blocks = [];
    const add = (x, y, z, part, extra = {}) => blocks.push({ base: new THREE.Vector3(x, y, z), part, size: S * rnd(0.72, 0.98), ...extra });
    // head
    for (let x = -2.4; x <= 2.4; x += S) for (let y = 10.8; y <= 14.6; y += S) for (let z = -1.9; z <= 1.9; z += S) {
      if ((x / 2.6) ** 2 + ((y - 12.6) / 2.1) ** 2 + (z / 2.2) ** 2 > 1) continue;
      const surf = Math.abs(x) > 1.5 || Math.abs(z) > 1.1 || y > 13.5 || y < 11.3;
      if (surf) add(x, y, z, 'head');
    }
    // horns
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) add(sx * (1.7 + i * 0.45), 14.4 + i * 0.75, -0.3, 'head', { size: S * (0.7 - i * 0.1) });
    // neck
    for (let x = -0.95; x <= 0.95; x += S) for (let z = -0.95; z <= 0.95; z += S) add(x, 9.9, z, 'neck');
    // torso: a shell that is wide at the shoulders and narrow at the waist
    for (let y = 3.3; y <= 9.6; y += S) {
      const w = 2.4 + (y - 3.3) / 6.3 * 3.6, d = 1.5 + (y - 3.3) * 0.12;
      for (let x = -w; x <= w + 0.01; x += S) for (let z = -d; z <= d + 0.01; z += S) {
        const edge = Math.abs(x) > w - S || Math.abs(z) > d - S || y > 9.6 - S || y < 3.3 + S;
        if (!edge) continue;
        const front = z > d - S;
        const chest = front && Math.abs(x) < 3 && y > 5 && y < 9.3;
        if (front && Math.abs(x) < 0.6 && y > 5.6 && y < 8.8) continue;   // slit over the core
        add(x, y, z, chest ? 'chest' : 'torso');
      }
    }
    // arms hang from the shoulders and end in claws
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * 6.6, 9.2, 0), b = new THREE.Vector3(sx * 8.4, 2.4, 0.8);
      for (let t = 0; t <= 1.001; t += 0.12) {
        const p = a.clone().lerp(b, t);
        for (const [ox, oz] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) add(p.x + ox, p.y, p.z + oz, sx < 0 ? 'armL' : 'armR');
      }
      for (let k = -1; k <= 1; k++) for (let i = 0; i < 3; i++) add(b.x + k * 0.7, b.y - 1 - i * 0.8, b.z + 0.6, sx < 0 ? 'armL' : 'clawR', { size: S * (0.6 - i * 0.12) });
    }
    // data dripping out under the waist
    for (let i = 0; i < 16; i++) {
      const x = rnd(-2.3, 2.3), z = rnd(-1.3, 1.3), n = Math.floor(rnd(1, 4));
      for (let k = 0; k < n; k++) add(Math.round(x / S) * S, 3.3 - S * (k + 1) * 1.1, Math.round(z / S) * S, 'drip', { size: S * (0.6 - k * 0.12) });
    }
    // which damage state knocks each block off
    for (const b of blocks) {
      const r = Math.random();
      b.breakAt = b.part === 'armL' ? 0.5 : b.part === 'chest' ? 0.25 : b.part === 'clawR' ? 0.1
        : b.part === 'drip' ? (r < 0.5 ? 0.75 : 0.5)
        : r < 0.16 ? 0.75 : r < 0.3 ? 0.5 : r < 0.4 ? 0.25 : r < 0.5 ? 0.1 : 0;
      b.seed = Math.random();
      b.off = new THREE.Vector3(); b.vel = new THREE.Vector3(); b.rot = new THREE.Euler(); b.spin = new THREE.Vector3();
      b.fall = false; b.gone = false; b.glitch = 0; b.gx = 0;
    }
    const N = blocks.length;
    const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1));
    const seeds = new Float32Array(N); blocks.forEach((b, i) => { seeds[i] = b.seed; });
    boxGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const boxMat = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uHurt: { value: C('#ff4d5e', 1.2) }, uHurtMix: { value: 0 } },
      vertexShader: `
        attribute float aSeed;
        varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vDepth;
        void main() {
          vUv = uv; vSeed = aSeed;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(0.1, 1.0, 0.4);
          #endif
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; uniform float uHit; uniform vec3 uHurt; uniform float uHurtMix;
        varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vDepth;
        void main() {
          vec2 d = min(vUv, 1.0 - vUv);
          float e = min(d.x, d.y);
          float edge = 1.0 - smoothstep(0.0, 0.075, e);
          float scan = 0.5 + 0.5 * sin(vUv.y * 36.0 + uTime * 5.0 + vSeed * 30.0);
          vec3 col = mix(vColor, uHurt, uHurtMix * step(0.45, fract(vSeed * 7.31)));
          vec3 c = vec3(0.003, 0.014, 0.009) + col * 0.03 * scan + col * edge * (0.85 + uHit * 1.1);
          c = mix(c, vec3(0.0, 0.01, 0.006), smoothstep(34.0, 70.0, vDepth));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    const body = new THREE.InstancedMesh(boxGeo, boxMat, N);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const green = C('#39ff88'), cyan = C('#3ee6ff');
    blocks.forEach((b, i) => body.setColorAt(i, Math.random() < 0.08 ? cyan : green));
    body.frustumCulled = false;
    const rig = new THREE.Group();
    rig.add(body);
    scene.add(rig);

    // eyes
    const eyeMat = keep(new THREE.MeshBasicMaterial({ color: C('#d7f5e3', 2) }));
    const eyeGeo = keep(new THREE.BoxGeometry(1.25, 0.28, 0.2));
    const eyes = [-0.95, 0.95].map(x => { const m = new THREE.Mesh(eyeGeo, eyeMat); m.position.set(x, 12.7, 2.15); m.rotation.z = x < 0 ? -0.18 : 0.18; rig.add(m); return m; });

    // core, its wire cage, glow and rings
    const corePos = new THREE.Vector3(0, 7.2, 0.3);
    const core = new THREE.Group(); core.position.copy(corePos); rig.add(core);
    const coreMat = keep(new THREE.MeshBasicMaterial({ color: C('#39ff88', 1.8) }));
    const coreMesh = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(1.35, 2)), coreMat);
    core.add(coreMesh);
    const cageMat = keep(new THREE.LineBasicMaterial({ color: C('#d7f5e3', 1.4), transparent: true, opacity: 0.8 }));
    const cage = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.IcosahedronGeometry(2.05, 1)))), cageMat);
    core.add(cage);
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    {
      const c = glowCv.getContext('2d');
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    }
    const glowTex = keep(new THREE.CanvasTexture(glowCv));
    const glowMat = keep(new THREE.SpriteMaterial({ map: glowTex, color: C('#39ff88', 1), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
    const glow = new THREE.Sprite(glowMat); glow.scale.set(7.5, 7.5, 1);
    core.add(glow);
    const rings = [3.2, 4.1, 5.0].map((r, i) => {
      const m = new THREE.Mesh(keep(new THREE.TorusGeometry(r, 0.045, 6, 120)), keep(new THREE.MeshBasicMaterial({ color: C(i === 1 ? '#3ee6ff' : '#39ff88', 1.8), transparent: true, opacity: 0.85 })));
      m.rotation.set(rnd(0, 3), rnd(0, 3), 0);
      m.userData = { spin: new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.3, 0.9) * (i % 2 ? -1 : 1), rnd(-0.3, 0.3)), vel: new THREE.Vector3(), fall: false, gone: false };
      core.add(m);
      return m;
    });

    // shards that orbit the boss
    const SH = 36;
    const shardMat = keep(new THREE.MeshBasicMaterial({ color: C('#39ff88', 1.0), wireframe: true }));
    const shards = new THREE.InstancedMesh(keep(new THREE.TetrahedronGeometry(0.42)), shardMat, SH);
    const shardData = Array.from({ length: SH }, () => ({ r: rnd(8.5, 14), a: rnd(0, Math.PI * 2), y: rnd(1.5, 16), s: rnd(0.08, 0.25) * (Math.random() < 0.5 ? -1 : 1), k: rnd(0.6, 1.6) }));
    shards.frustumCulled = false;
    scene.add(shards);

    // sparks
    const SP = 360;
    const spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spLife = new Float32Array(SP);
    const spGeo = keep(new THREE.BufferGeometry());
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    const spMat = keep(new THREE.PointsMaterial({ color: C('#b9ffd6', 2), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sparks = new THREE.Points(spGeo, spMat);
    sparks.frustumCulled = false;
    scene.add(sparks);
    let spI = 0;
    for (let i = 0; i < SP; i++) spPos[i * 3 + 1] = -100;
    function burst(at, n, speed) {
      for (let k = 0; k < n; k++) {
        const i = spI = (spI + 1) % SP;
        spPos[i * 3] = at.x; spPos[i * 3 + 1] = at.y; spPos[i * 3 + 2] = at.z;
        const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1.2), rnd(0.2, 1.4)).normalize().multiplyScalar(speed * rnd(0.4, 1));
        spVel[i * 3] = v.x; spVel[i * 3 + 1] = v.y; spVel[i * 3 + 2] = v.z;
        spLife[i] = rnd(0.5, 1.1);
      }
    }

    // ---------- post: bloom ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 0.32);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    function fit() {
      const w = host.clientWidth || 600, h = host.clientHeight || 400;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      // keep the whole boss in frame on narrow screens
      // fit the boss's height on wide screens and its arm span on narrow ones
      const dist = Math.max(27, 10.5 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      camera.position.set(0, 7.2, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);
    fit();

    // ---------- state ----------
    let frac = 1, stage = 0, dead = false, deadT = 0;
    let shake = 0, pulse = 0, hitGlow = 0, lastFlash = 0;
    const STAGE_AT = [0.75, 0.5, 0.25, 0.1];
    const hurtCol = C('#ff4d5e', 2.2), coreGreen = C('#39ff88', 1.8), coreRed = C('#ff4d5e', 2), coreAmber = C('#f29d30', 1.8);

    function knock(b, instant) {
      if (b.fall || b.gone) return;
      if (instant) { b.gone = true; return; }
      b.fall = true;
      const out = b.base.clone().sub(corePos).setY(0).normalize();
      b.vel.set(out.x * rnd(2, 6), rnd(2, 7), Math.abs(out.z) * rnd(1, 5) + rnd(0, 3));
      b.spin.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
    }
    function setFrac(f, instant) {
      frac = Math.max(0, f);
      const ns = STAGE_AT.filter(t => frac <= t).length;
      for (const b of blocks) if (b.breakAt && frac <= b.breakAt) knock(b, instant);
      if (ns > stage && !instant) {
        burst(corePos.clone().add(rig.position), 60, 9);
        shake = Math.max(shake, 0.8);
      }
      stage = ns;
      rings.forEach((r, i) => {
        const breakAt = i === 2 ? 0.5 : i === 0 ? 0.1 : -1;
        if (frac <= breakAt && !r.userData.fall && !r.userData.gone) {
          if (instant) { r.userData.gone = true; r.visible = false; }
          else { r.userData.fall = true; r.userData.vel.set(rnd(-2, 2), -1, rnd(1, 3)); }
        }
      });
      boxMat.uniforms.uHurtMix.value = [0, 0.15, 0.3, 0.5, 0.7][stage];
      eyeMat.color.copy(stage >= 3 ? coreRed : C('#d7f5e3', 2));
      coreMat.color.copy(stage >= 3 ? coreRed : stage >= 2 ? coreAmber : coreGreen);
      glowMat.color.set(stage >= 3 ? '#ff4d5e' : stage >= 2 ? '#f29d30' : '#39ff88');
    }
    function hit(n, you) {
      if (dead) return;
      const b = randomBlock();
      const at = b ? b.base.clone().add(rig.position) : corePos.clone();
      burst(at, you ? 10 + Math.min(14, n * 2) : 3, you ? 7 : 4);
      if (!you) return;
      shake = Math.max(shake, reduce ? 0 : Math.min(0.45, 0.12 + n * 0.03));
      pulse = 1;
      // a brighter core counts as a flash, so it happens at most 3 times a second
      const now = performance.now();
      if (!reduce && now - lastFlash > 340) { hitGlow = 1; lastFlash = now; }
    }
    function randomBlock() {
      for (let k = 0; k < 12; k++) { const b = blocks[Math.floor(Math.random() * N)]; if (!b.fall && !b.gone) return b; }
      return null;
    }
    function defeat(instant) {
      if (dead) return;
      dead = true; deadT = instant ? 9 : 0;
      for (const b of blocks) knock(b, instant);
      rings.forEach(r => { if (instant) r.visible = false; else { r.userData.fall = true; r.userData.vel.set(rnd(-2, 2), -1, rnd(1, 3)); } });
      if (!instant) burst(corePos.clone(), 120, 12);
      eyes.forEach(e => { e.visible = false; });
    }
    function revive() {
      dead = false; deadT = 0; frac = 1; stage = 0;
      for (const b of blocks) { b.fall = false; b.gone = false; b.off.set(0, 0, 0); b.rot.set(0, 0, 0); b.vel.set(0, 0, 0); }
      rings.forEach(r => { r.visible = true; r.userData.fall = false; r.userData.gone = false; r.position.set(0, 0, 0); r.material.opacity = 0.85; });
      eyes.forEach(e => { e.visible = true; });
      core.scale.setScalar(1); glowMat.opacity = 0.5;
      setFrac(1, true);
    }
    const v3 = new THREE.Vector3();
    function point() {
      const b = stage >= 3 && Math.random() < 0.5 ? null : randomBlock();
      v3.copy(b ? b.base : corePos);
      rig.localToWorld(v3);
      v3.project(camera);
      if (v3.z > 1) return null;
      return { x: (v3.x * 0.5 + 0.5) * host.clientWidth, y: (-v3.y * 0.5 + 0.5) * host.clientHeight };
    }

    // ---------- loop ----------
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const clock = new THREE.Clock();
    let t = 0;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(0.05, clock.getDelta());
      if (!visible || document.hidden) return;
      t += dt;
      const still = reduce ? 0 : 1;
      boxMat.uniforms.uTime.value = t * still;
      codeTex.offset.y -= dt * 0.06 * still;
      // body sway, bob and shake
      shake = Math.max(0, shake - dt * 2.2);
      rig.position.set((Math.random() - 0.5) * shake, Math.sin(t * 0.8) * 0.25 * still, 0);
      rig.rotation.y = Math.sin(t * 0.3) * 0.12 * still;
      const glitchRate = [0.01, 0.03, 0.06, 0.12, 0.22][stage] * still;
      for (let i = 0; i < N; i++) {
        const b = blocks[i];
        if (b.gone) { m4.makeScale(0, 0, 0); body.setMatrixAt(i, m4); continue; }
        if (b.fall) {
          b.vel.y -= 18 * dt;
          b.off.addScaledVector(b.vel, dt);
          b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt; b.rot.z += b.spin.z * dt;
          if (b.base.y + b.off.y < -1) { b.gone = true; }
        } else if (glitchRate) {
          if (b.glitch > 0) b.glitch -= dt;
          else if (Math.random() < glitchRate * dt * 4) { b.glitch = rnd(0.06, 0.18); b.gx = rnd(-1, 1) * (0.3 + stage * 0.25); }
        }
        p.copy(b.base).add(b.off);
        if (!b.fall && b.glitch > 0) p.x += b.gx;
        q.setFromEuler(b.rot);
        const s = b.size * (b.fall ? Math.max(0.2, 1 - b.off.length() * 0.02) : 1);
        sc.set(s, s, s);
        m4.compose(p, q, sc);
        body.setMatrixAt(i, m4);
      }
      body.instanceMatrix.needsUpdate = true;
      // core
      pulse = Math.max(0, pulse - dt * 4);
      hitGlow = Math.max(0, hitGlow - dt * 6);
      boxMat.uniforms.uHit.value = hitGlow;
      const crit = stage >= 4 ? 0.08 * Math.sin(t * 2 * Math.PI * 2) * still : 0;   // 2 pulses a second at under 10% HP
      if (dead) {
        deadT += dt;
        const k = Math.max(0, 1 - deadT / 2.2);
        core.scale.setScalar(Math.max(0.001, k));
        glowMat.opacity = 0.5 * k;
      } else {
        core.scale.setScalar(1 + (0.05 * Math.sin(t * 3) * still) + pulse * 0.18 + crit);
        glowMat.opacity = 0.45 + hitGlow * 0.3;
      }
      coreMesh.rotation.y += dt * 0.6 * still;
      cage.rotation.x -= dt * 0.35 * still; cage.rotation.y += dt * 0.5 * still;
      rings.forEach(r => {
        const u = r.userData;
        if (u.gone) return;
        r.rotation.x += u.spin.x * dt * still; r.rotation.y += u.spin.y * dt * still;
        if (u.fall) {
          u.vel.y -= 12 * dt; r.position.addScaledVector(u.vel, dt);
          r.material.opacity = Math.max(0, r.material.opacity - dt * 0.5);
          if (r.material.opacity <= 0) { u.gone = true; r.visible = false; }
        }
      });
      eyes.forEach(e => { e.scale.y = stage >= 4 && Math.sin(t * 9) > 0.7 && still ? 0.3 : 1; });
      // shards
      for (let i = 0; i < SH; i++) {
        const d = shardData[i];
        d.a += d.s * dt * still * (dead ? 0.2 : 1);
        const y = dead ? Math.max(0.3, d.y - deadT * 3) : d.y + Math.sin(t * d.k + i) * 0.4 * still;
        p.set(Math.cos(d.a) * d.r, y, Math.sin(d.a) * d.r * 0.6);
        q.setFromEuler(new THREE.Euler(t * d.k * still, t * still, 0));
        sc.setScalar(d.k * 0.55);
        m4.compose(p, q, sc);
        shards.setMatrixAt(i, m4);
      }
      shards.instanceMatrix.needsUpdate = true;
      // sparks
      for (let i = 0; i < SP; i++) {
        if (spLife[i] <= 0) continue;
        spLife[i] -= dt;
        spVel[i * 3 + 1] -= 9 * dt;
        spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
        if (spLife[i] <= 0) spPos[i * 3 + 1] = -100;
      }
      spGeo.attributes.position.needsUpdate = true;
      if (stage >= 4 && !dead && Math.random() < dt * 6) burst(corePos.clone().add(rig.position), 2, 5);
      composer.render();
    });

    function dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect(); io.disconnect();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
      disposables.forEach(d => d.dispose && d.dispose());
      bloom.dispose();
      composer.dispose && composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }

    setFrac(1, true);
    return { hit, setFrac, defeat, revive, point, dispose };
  }

  return { mount };
})();
