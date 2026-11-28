// The world boss in three.js: a giant program built from glowing blocks around
// a core, standing in an arena with the raid in an arc in front of it.
// BossScene.mount(host, { onImpact, onFrame, raid }) returns a controller right away (raid: raider markers shown, default 40)
// and draws once three.js has loaded.
//   setPhase(p, instant)  roar, reform and shift the arena to phase p's look
//   setFrac(f, instant)   knocks off the shell, arm, rings and chest as HP drops
//   event(ev, netNow)     plays an attack from WorldBossRules on the shared clock
//   hit(h)                a bolt from the raider's spot to the boss; onImpact(h, x, y) when it lands
//   returnShot(id), killAdd(id, you), block(id), stagger(), hurt(), setShield(f), setWeak(on)
//   cast(spellId, { hits, effect })   a spell from the combat layer, aimed from your marker at the boss
//   aura(name, on), fxEvent(kind)     statuses that stay on screen, safe mode used up, a split copy lost
//   react(kind, power, extra)          flinch, stagger, flash, break (the phase-break pose), stun, freeze, pull
//   setHit(power)                      a finished set of words: the boss reels and moves to a new spot
//   breakCharge(id)                    the raid broke a charged punch: the charge shatters and it staggers
// A charged punch arrives as an event of type 'charge' and plays as a slam of kind 'charge'; the
// laser is a slam of kind 'laser'.
//   opts.onBoom()                      the moment the dead boss blows apart, for the sound
//   opts.onMenace(kind)                a swing, jab, stomp or lean at the raid between attacks lands
//                                      (swipe, jab, stomp, lean), for the sound
//   freezeAttack(id)                   cryo lock: that attack's hit shows as held off for you
//   lock(who, ms)                      the boss aims at a squad member; act(who, 'dodge' | 'covered', byId) settles it
//   defeat(instant) / revive()
//   screen(key, out)      host pixels of 'head', 'core', 'you', 'shot:<id>' or 'add:<id>'
//   dispose()
// Flashes go through one gate that allows 3 a second (2 with Reduce flashing on).
window.BossScene = (() => {
  let libs = null;
  function load() {
    libs ||= Promise.all([
      import('three'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  function mount(host, opts = {}) {
    let impl = null, gone = false;
    const pending = { frac: 1, phase: 0, defeated: false, shield: null, weak: false };
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP, SP, RB]) => {
        if (gone) return false;
        impl = build(host, { ...opts, RoundedBoxGeometry: RB.RoundedBoxGeometry }, THREE, EC.EffectComposer, RP.RenderPass, UB.UnrealBloomPass, OP.OutputPass, SP.ShaderPass);
        impl.setFrac(pending.frac, true);
        impl.setPhase(pending.phase, true);
        impl.setShield(pending.shield);
        impl.setWeak(pending.weak);
        if (pending.crew) impl.crew(pending.crew);
        if (pending.defeated) impl.defeat(true);
        return true;
      }),
      setPhase: (p, instant) => { pending.phase = p; if (impl) impl.setPhase(p, instant); },
      setFrac: (f, instant) => { pending.frac = f; if (impl) impl.setFrac(f, instant); },
      setShield: f => { pending.shield = f; if (impl) impl.setShield(f); },
      setWeak: on => { pending.weak = on; if (impl) impl.setWeak(on); },
      event: (ev, now) => impl && impl.event(ev, now),
      hit: h => { if (impl && impl.live()) impl.hit(h); else if (opts.onImpact) opts.onImpact(h, null, null); },
      returnShot: id => impl && impl.returnShot(id),
      killAdd: (id, you) => impl && impl.killAdd(id, you),
      block: id => impl && impl.block(id),
      stagger: () => impl && impl.stagger(),
      breakCharge: id => impl && impl.breakCharge(id),
      setHit: p => impl && impl.setHit(p),
      hurt: k => impl && impl.hurt(k),
      cast: (id, c) => impl && impl.cast(id, c),
      aura: (name, on) => impl && impl.aura(name, on),
      wave: k => impl && impl.wave(null, k),
      fxEvent: k => impl && impl.fxEvent(k),
      react: (k, p, x) => impl && impl.react(k, p, x),
      freezeAttack: id => impl && impl.freezeAttack(id),
      pause: on => impl && impl.pause(on),
      charge: (level, tier) => impl && impl.charge(level, tier),
      feed: () => impl && impl.feed(),
      crew: list => { pending.crew = list; if (impl) impl.crew(list); },
      act: (who, kind, by) => impl && impl.act(who, kind, by),
      lock: (who, ms) => impl && impl.lock(who, ms),
      sideAttack: (k, kind, outcome) => impl && impl.sideAttack(k, kind, outcome),   // test hook
      orbitInfo: () => impl && impl.orbitInfo(),
      director: () => impl && impl.director && impl.director(),
      dbg: () => impl && impl.dbg(),   // tests: the scene, camera, renderer and the dress
      raidInfo: () => impl && impl.raidInfo(),
      // with no scene (WebGL off or still loading) the release lands at once
      release: (tier, power, onLand) => { if (impl && impl.live()) impl.release(tier, power, onLand); else if (onLand) onLand(null, null); },
      defeat: instant => { pending.defeated = true; if (impl) impl.defeat(!!instant); },
      revive: () => { pending.defeated = false; pending.frac = 1; pending.phase = 0; if (impl) impl.revive(); },
      screen: (k, out) => (impl ? impl.screen(k, out) : null),
      info: () => (impl ? impl.info() : null),
      dispose: () => { gone = true; if (impl) impl.dispose(); impl = null; },
    };
    return ctl;
  }

  function build(host, opts, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass) {
    const V = THREE.Vector3;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let calmSet = true;
    try { const s = JSON.parse(localStorage.getItem('wpm-breach-settings') || '{}'); calmSet = s.reduceFlash !== false; } catch (e) {}
    const calm = reduce || calmSet;
    const still = reduce ? 0.35 : 1;           // movement scale
    const pulseK = reduce ? 0 : 1;             // breathing glows stop with reduced motion
    const shakeK = reduce ? 0.12 : calm ? 0.6 : 1;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    const easeIn = x => Math.pow(clamp(x, 0, 1), 2);
    const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const nowS = () => performance.now() / 1000;

    // one gate for every flash: at most 3 a second, 2 with Reduce flashing on
    const flashes = [];
    function canFlash() {
      const t = performance.now();
      while (flashes.length && t - flashes[0] > 1000) flashes.shift();
      if (flashes.length >= (calm ? 2 : 3)) return false;
      flashes.push(t); return true;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.info.autoReset = false;
    let lastCalls = 0, lastTris = 0;
    const basePR = Math.min(1.5, devicePixelRatio || 1);
    renderer.setPixelRatio(basePR);
    renderer.toneMapping = THREE.NoToneMapping;
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(Theme.hex('bg-0'));
    scene.fog = new THREE.Fog(Theme.hex('bg-0'), 36, 95);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
    const disposables = [];
    const keep = x => (disposables.push(x), x);

    // ---------- arena palettes, one per phase plus the quiet one after the fight ----------
    const PAL = [
      { bg: Theme.hex('bg-0'), a: Theme.hex('accent'), b: Theme.hex('accent-dim'), c: '#3ee6ff', bloom: 0.55, wall: 0.06 },
      { bg: '#01060a', a: '#3ee6ff', b: '#147d8f', c: Theme.hex('accent'), bloom: 0.6, wall: 0.09 },
      { bg: '#070401', a: '#f29d30', b: '#8f5513', c: Theme.hex('accent'), bloom: 0.62, wall: 0.12 },
      { bg: '#0a0302', a: '#ff6a3d', b: '#97361c', c: '#f29d30', bloom: 0.66, wall: 0.16 },
      { bg: '#0b0103', a: '#ff4d5e', b: '#9c1f2c', c: '#f29d30', bloom: 0.7, wall: 0.22 },
      { bg: '#010302', a: Theme.hex('accent-dim'), b: '#0d4a29', c: '#3ee6ff', bloom: 0.4, wall: 0.02 },
    ].map(p => ({ bg: C(p.bg), a: C(p.a), b: C(p.b), c: C(p.c), bloom: p.bloom, wall: p.wall }));
    const pal = { bg: PAL[0].bg.clone(), a: PAL[0].a.clone(), b: PAL[0].b.clone(), c: PAL[0].c.clone(), bloom: 0.55, wall: 0.06 };
    let palFrom = 0, palTo = 0, palT = 1, palAt = 0;

    // ---------- backdrop: a wall of falling code, a grid floor, pillars and rings ----------
    // The fight happens in its own frame: boss at the centre, your squad toward +z, the camera behind
    // it. The view orbits the arena (Gid, 27 Nov 2026) by turning this backdrop the other way, so the
    // fight's own maths stays front-on while the player sees it from every side.
    const env = new THREE.Group(); scene.add(env);
    const codeCv = document.createElement('canvas'); codeCv.width = codeCv.height = 512;
    {
      const c = codeCv.getContext('2d');
      c.font = '20px monospace';
      const CH = '01{}[]<>/=+*#$abcdef';
      for (let x = 0; x < 512; x += 16) for (let y = 0; y < 512; y += 22) {
        if (Math.random() < 0.55) { c.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.9).toFixed(2)})`; c.fillText(CH[Math.floor(Math.random() * CH.length)], x, y); }
      }
    }
    const codeTex = keep(new THREE.CanvasTexture(codeCv));
    codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping;
    codeTex.repeat.set(18, 3);
    // the wall of code is a ring all the way round the arena
    const wallMat = keep(new THREE.MeshBasicMaterial({ map: codeTex, color: pal.a, transparent: true, opacity: 0.09, depthWrite: false, fog: false, side: THREE.BackSide }));
    const wall = new THREE.Mesh(keep(new THREE.CylinderGeometry(58, 58, 60, 64, 1, true)), wallMat);
    wall.position.set(0, 20, 0);
    env.add(wall);
    const grid = new THREE.GridHelper(160, 80, '#ffffff', '#ffffff');
    grid.material.transparent = true; grid.material.opacity = 0.32; grid.material.color = pal.b.clone();
    keep(grid.geometry); keep(grid.material);
    env.add(grid);
    // the arena's atmosphere (28 Nov 2026): dust motes hanging in the air (a lit floor and low haze were
    // tried: the floor read as a grey slab with a hard edge, the haze washed the floor green)
    const DUST = 220, dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) { dustPos.set([rnd(-34, 34), rnd(0.5, 22), rnd(-28, 20)], i * 3); dustSeed[i] = rnd(0, 6.28); }
    const dustGeo = keep(new THREE.BufferGeometry()); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
    const dustMat = keep(new THREE.PointsMaterial({ size: 0.13, color: pal.a.clone().multiplyScalar(0.7), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; env.add(dust);
    function airTick(t, dt) {
      if (reduce) return;
      for (let i = 0; i < DUST; i++) {
        const k = i * 3; dustPos[k + 1] += dt * (0.25 + 0.2 * Math.sin(dustSeed[i])); dustPos[k] += Math.sin(t * 0.3 + dustSeed[i]) * dt * 0.3;
        if (dustPos[k + 1] > 22) dustPos[k + 1] = 0.5;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    const floorRings = [[6.5, 6.8, 1.1], [9.5, 9.6, 0.8], [14, 14.08, 0.5]].map(([a, b, k]) => {
      const m = new THREE.Mesh(keep(new THREE.RingGeometry(a, b, 96)), keep(new THREE.MeshBasicMaterial({ color: pal.a.clone(), side: THREE.DoubleSide, transparent: true, opacity: k })));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.userData.k = k;
      scene.add(m); return m;
    });

    // block shader: glowing edges and a faint scan line, shared by the boss, pillars and adds
    const edgeVert = `
      attribute float aSeed; attribute float aAlt;
      varying vec2 vUv; varying float vSeed; varying float vAlt; varying float vDepth;
      void main() {
        vUv = uv; vSeed = aSeed; vAlt = aAlt;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`;
    const edgeFrag = `
      uniform float uTime; uniform float uHit; uniform vec3 uColA; uniform vec3 uColC; uniform vec3 uHurt; uniform float uHurtMix; uniform float uFar;
      uniform vec3 uTintC; uniform float uTintMix;
      varying vec2 vUv; varying float vSeed; varying float vAlt; varying float vDepth;
      void main() {
        vec2 d = min(vUv, 1.0 - vUv);
        float e = min(d.x, d.y);
        float edge = 1.0 - smoothstep(0.0, 0.075, e);
        float scan = 0.5 + 0.5 * sin(vUv.y * 36.0 + uTime * 5.0 + vSeed * 30.0);
        vec3 col = mix(uColA, uColC, vAlt);
        col = mix(col, uHurt, uHurtMix * step(0.45, fract(vSeed * 7.31)));
        col = mix(col, uTintC, uTintMix);
        vec3 c = vec3(0.003, 0.012, 0.008) + col * 0.035 * scan + col * edge * (0.9 + uHit * 0.9) + uTintC * uTintMix * 0.05;
        c = mix(c, vec3(0.0, 0.006, 0.004), smoothstep(uFar * 0.5, uFar, vDepth));
        gl_FragColor = vec4(c, 1.0);
      }`;
    function edgeMat(colA, colC, far = 80) {
      return keep(new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uColA: { value: colA.clone() }, uColC: { value: colC.clone() }, uHurt: { value: C('#ff4d5e', 1.2) }, uHurtMix: { value: 0 }, uFar: { value: far }, uTintC: { value: C('#bfefff', 1.3) }, uTintMix: { value: 0 } },
        vertexShader: edgeVert, fragmentShader: edgeFrag,
      }));
    }
    function seededBox(n, alt) {
      const g = keep(new THREE.BoxGeometry(1, 1, 1));
      const s = new Float32Array(n), a = new Float32Array(n);
      for (let i = 0; i < n; i++) { s[i] = Math.random(); a[i] = alt ? alt(i) : 0; }
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s, 1));
      g.setAttribute('aAlt', new THREE.InstancedBufferAttribute(a, 1));
      return g;
    }

    // pillars of data around the arena rise with each phase
    const PIL = 36;
    const pilMat = edgeMat(pal.b, pal.a, 130);
    const pillars = new THREE.InstancedMesh(seededBox(PIL, i => (i % 5 === 0 ? 1 : 0)), pilMat, PIL);
    // all the way round, past the camera's distance so none stand between it and the fight
    const pilData = Array.from({ length: PIL }, (_, i) => {
      const a = Math.PI * 2 * i / PIL + rnd(-0.06, 0.06);
      const r = rnd(42, 52);
      return { x: -Math.cos(a) * r, z: -Math.sin(a) * r, w: rnd(1.6, 3.2), h: rnd(6, 22), k: rnd(0.3, 1), s: rnd(0.2, 0.6) };
    });
    pillars.frustumCulled = false;
    env.add(pillars);
    let pilH = 0.35, pilHT = 0.35;

    // ---------- the body: blocks laid out on a grid in the shape of a giant ----------
    const S = 0.95;
    const HIP = new V(0, 4, 0), NECK = new V(0, 10.2, 0), SHL = new V(-6.3, 9.2, 0), SHR = new V(6.3, 9.2, 0);
    const PARTS = ['torso', 'head', 'armL', 'armR'];
    const blocks = [];
    const add = (x, y, z, region, extra = {}) => blocks.push({ base: new V(x, y, z), region, size: S * rnd(0.72, 0.98), ...extra });
    for (let x = -2.4; x <= 2.4; x += S) for (let y = 10.8; y <= 14.6; y += S) for (let z = -1.9; z <= 1.9; z += S) {
      if ((x / 2.6) ** 2 + ((y - 12.6) / 2.1) ** 2 + (z / 2.2) ** 2 > 1) continue;
      if (Math.abs(x) > 1.5 || Math.abs(z) > 1.1 || y > 13.5 || y < 11.3) add(x, y, z, 'head');
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) add(sx * (1.7 + i * 0.45), 14.4 + i * 0.75, -0.3, 'head', { size: S * (0.7 - i * 0.1) });
    for (let x = -0.95; x <= 0.95; x += S) for (let z = -0.95; z <= 0.95; z += S) add(x, 9.9, z, 'neck');
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
    for (const sx of [-1, 1]) {
      const a = new V(sx * 6.6, 9.2, 0), b = new V(sx * 8.4, 2.4, 0.8);
      for (let t = 0; t <= 1.001; t += 0.12) {
        const p = a.clone().lerp(b, t);
        for (const [ox, oz] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) add(p.x + ox, p.y, p.z + oz, sx < 0 ? 'armL' : 'armR');
      }
      for (let k = -1; k <= 1; k++) for (let i = 0; i < 3; i++) add(b.x + k * 0.7, b.y - 1 - i * 0.8, b.z + 0.6, sx < 0 ? 'armL' : 'clawR', { size: S * (0.6 - i * 0.12) });
    }
    for (let i = 0; i < 16; i++) {
      const x = rnd(-2.3, 2.3), z = rnd(-1.3, 1.3), n = Math.floor(rnd(1, 4));
      for (let k = 0; k < n; k++) add(Math.round(x / S) * S, 3.3 - S * (k + 1) * 1.1, Math.round(z / S) * S, 'drip', { size: S * (0.6 - k * 0.12) });
    }
    // which part carries each block, its spot in that part and which damage state knocks it off
    for (const b of blocks) {
      const r = Math.random();
      b.part = b.region === 'head' || b.region === 'neck' ? 1 : b.region === 'armL' ? 2 : b.region === 'armR' || b.region === 'clawR' ? 3 : 0;
      const pivot = [HIP, NECK, SHL, SHR][b.part];
      b.local = b.base.clone().sub(pivot);
      b.breakAt = b.region === 'armL' ? 0.5 : b.region === 'chest' ? 0.25 : b.region === 'clawR' ? 0.1
        : b.region === 'drip' ? (r < 0.5 ? 0.75 : 0.5)
        : r < 0.16 ? 0.75 : r < 0.3 ? 0.5 : r < 0.4 ? 0.25 : r < 0.5 ? 0.1 : 0;
      // 0 attached, 1 chipped and flying, 2 flying back, 3 falling for good, 4 resting on the floor
      b.mode = 0; b.wp = new V(); b.vel = new V(); b.rot = new THREE.Euler(); b.spin = new V(); b.life = 0; b.ret = 0; b.from = new V();
      b.grav = 1; b.jx = 0; b.jt = 0; b.delay = 0;
    }
    const N = blocks.length;
    const boxMat = edgeMat(pal.a, pal.c, 80);
    const body = new THREE.InstancedMesh(seededBox(N, () => (Math.random() < 0.08 ? 1 : 0)), boxMat, N);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.frustumCulled = false;
    scene.add(body);

    // the skeleton the blocks hang on
    const root = new THREE.Group(); scene.add(root);
    const hip = new THREE.Group(); hip.position.copy(HIP); root.add(hip);
    const headG = new THREE.Group(); headG.position.copy(NECK).sub(HIP); hip.add(headG);
    const armLG = new THREE.Group(); armLG.position.copy(SHL).sub(HIP); hip.add(armLG);
    const armRG = new THREE.Group(); armRG.position.copy(SHR).sub(HIP); hip.add(armRG);
    const partG = [hip, headG, armLG, armRG];
    const partQ = PARTS.map(() => new THREE.Quaternion());

    const eyeMat = keep(new THREE.MeshBasicMaterial({ color: C(Theme.hex('ink'), 2) }));
    const eyeGeo = keep(new THREE.BoxGeometry(1.25, 0.28, 0.2));
    const eyes = [-0.95, 0.95].map(x => { const m = new THREE.Mesh(eyeGeo, eyeMat); m.position.set(x, 12.7 - NECK.y, 2.15); m.rotation.z = x < 0 ? -0.18 : 0.18; headG.add(m); return m; });

    const CORE = new V(0, 7.2, 0.3);
    const core = new THREE.Group(); core.position.copy(CORE).sub(HIP); hip.add(core);
    const coreMat = keep(new THREE.MeshBasicMaterial({ color: C(Theme.hex('accent'), 1.8) }));
    const coreMesh = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(1.35, 2)), coreMat);
    core.add(coreMesh);
    const cageMat = keep(new THREE.LineBasicMaterial({ color: C(Theme.hex('ink'), 1.4), transparent: true, opacity: 0.8 }));
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
    const glowMat = keep(new THREE.SpriteMaterial({ map: glowTex, color: C(Theme.hex('accent')), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
    const glow = new THREE.Sprite(glowMat); glow.scale.set(7.5, 7.5, 1);
    core.add(glow);
    const rings = [3.2, 4.1, 5.0].map((r, i) => {
      const m = new THREE.Mesh(keep(new THREE.TorusGeometry(r, 0.045, 6, 120)), keep(new THREE.MeshBasicMaterial({ color: C(i === 1 ? '#3ee6ff' : Theme.hex('accent'), 1.8), transparent: true, opacity: 0.85 })));
      m.rotation.set(rnd(0, 3), rnd(0, 3), 0);
      m.userData = { spin: new V(rnd(-0.6, 0.6), rnd(0.3, 0.9) * (i % 2 ? -1 : 1), rnd(-0.3, 0.3)), vel: new V(), fall: false, gone: false, alt: i === 1 };
      core.add(m);
      return m;
    });
    // weak point reticle around the core
    const retMat = keep(new THREE.MeshBasicMaterial({ color: C('#ffc46b', 2.2), transparent: true, opacity: 0, depthWrite: false }));
    const reticle = new THREE.Group(); core.add(reticle);
    [2.7, 3.3].forEach((r, i) => {
      const m = new THREE.Mesh(keep(new THREE.RingGeometry(r, r + 0.12, 64, 1, i * 0.4, Math.PI * 1.6)), retMat);
      reticle.add(m);
    });

    // ---------- the titan body (js/app/bosskit.js, design/bosses/) ----------
    // The armoured titan replaces the block giant. The old blocks stay as hit points and
    // debris: each one is pinned to a spot on a titan armour piece, hidden while attached,
    // and shown when a hit or a phase knocks it off, so chunks fly off the titan.
    const kit = window.BossKit && opts.titan !== false
      ? BossKit.create({ ...THREE, RoundedBoxGeometry: opts.RoundedBoxGeometry }, opts.bossId || 'siege', { scale: 1.08 }) : null;
    if (kit) {
      root.add(kit.group);
      // the arena glows on its own, so the armour gets its own light: a cold key from the
      // front left, a lime rim from behind to cut the silhouette out of the dark, and a dim fill
      kit.lights = [
        new THREE.HemisphereLight('#b8c4cc', '#06080a', 0.4),
        new THREE.DirectionalLight('#f2f6ff', 2.6),
        new THREE.DirectionalLight(kit.tips ? kit.glowColor : Theme.hex('accent'), kit.tips ? 2.2 : 1.5),   // Syntax Error: a red rim
        new THREE.DirectionalLight('#9fe8ff', 1.0),
      ];
      kit.lights[1].position.set(-8, 16, 14);
      kit.lights[2].position.set(0, 8, -14);
      // Syntax Error's metal reflects its own studio (js/app/syntax-dress.js), so its red rim comes in lower
      // and softer, catching the edges instead of washing the tops of the plates red
      if (kit.tips) { kit.lights[2].intensity = 1.1; kit.lights[2].position.set(0, 3, -14); kit.lights[0].intensity = 0.25; }
      kit.lights[3].position.set(12, 6, -6);
      kit.lights.forEach(l => scene.add(l));
      // the fists: where slams land, and a red glow that builds in them through a wind-up
      kit.fists = ['handL', 'handR'].map(bn => {
        let best = null, bv = 0;
        kit.bones[bn].children.forEach(o => { if (o.isMesh && o.geometry.boundingBox) { const z = o.geometry.boundingBox.getSize(new V()); if (z.x * z.y * z.z > bv) { bv = z.x * z.y * z.z; best = o; } } });
        const at = new THREE.Object3D();
        (best || kit.bones[bn]).add(at);
        if (best) best.geometry.boundingBox.getCenter(at.position);
        const g = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: C('#ff3a2e', 1.8), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
        g.scale.setScalar(7); at.add(g);
        return { at, g };
      });
      // armour that breaks off as the titan drops through each health stage:
      // the left pauldron, the right pauldron, the chest plates, then the plates beside the core
      const B0 = kit.bones;
      const own = b => b.children.filter(o => o.isMesh && kit.meshes.includes(o));
      const front = (b, top) => own(b).filter(o => o.position.z > 0.5 && (top ? o.position.y > 0 : o.position.y <= 0));
      kit.shedSets = [own(B0.shL), own(B0.shR), front(B0.chest, true), front(B0.chest, false)];
      // the torso half of each attack pose, so the hips and chest can lead and the arm follow
      for (const n of ['raise', 'slam', 'pull', 'sweep', 'coil', 'punch', 'reach', 'beam']) {
        const P = kit.POSES[n]; if (!P) continue;
        const T = { _only: true };
        for (const k of ['spine', 'chest', 'neck', 'head']) if (P[k]) T[k] = P[k];
        kit.POSES[n + '_body'] = T;
      }
      if (opts.bossId === 'syntax') {
        // Syntax Error (Gid, 26 Nov 2026): full armour to 50%, then the plates come off its arms and
        // shoulders, then at 25% the rest goes and it fights as a bare wireframe
        const deep = b => { const out = []; if (b) b.traverse(o => { if (o.isMesh && kit.meshes.includes(o)) out.push(o); }); return out; };
        const arms = ['shL', 'shR', 'armL', 'armR', 'foreL', 'foreR'].flatMap(k => own(B0[k]));
        const rest = ['chest', 'spine', 'hips', 'neck', 'head', 'handL', 'handR'].flatMap(k => own(B0[k])).concat(kit.tail ? deep(kit.tail) : []);
        kit.shedSets = [[], arms, rest, []];
        // the new attacks, the kneel, the brace before a phase roar and the slump of the death, written in
        // body terms with joint-check's bend() and checked (no joint past its range, no fist through the
        // chest), 28 Nov 2026. Each strike twists the body the other way to its wind-up.
        //   hunch     segfault wind-up: both arms up and back, fists behind the head (shoulders 160°, elbows 65°)
        //   pound     segfault strike: arms straight down in front, bent over at the waist
        //   scanwind  arms flung out and back (out 70°, back 25°), head thrown back as the visor charges
        //   scan      arms wide to brace, head down at the floor; the head's sweep is added on top
        //   summon    right arm straight up (170°), left out low
        //   cast      right arm thrown forward at the squad (95°), left pulled back
        //   grabwind  right arm up and out behind (120°, out 60°, elbow 70°), claw open, chest turned away
        //   grab      right arm thrust straight at the squad, claw shut, chest turned into it
        //   kneel     sunk low, bent over, right claw down on the floor, left arm hanging
        //   brace     forearms up in front of the face, hunched, before it roars
        //   slump     hanging forward, arms limp, for the death
        Object.assign(kit.POSES, {
          hunch: { armR: [-2.793, 0, 0.087], foreR: [-1.134, 0, 0], armL: [-2.793, 0, -0.087], foreL: [-1.134, 0, 0], chest: [-0.35, 0, 0], spine: [-0.15, 0, 0], head: [-0.3, 0, 0], clawL: [1.5, 0, 0], clawR: [1.5, 0, 0], _hips: 0.8 },
          pound: { armR: [-0.611, 0, 0.175], foreR: [-0.175, 0, 0], armL: [-0.611, 0, -0.175], foreL: [-0.175, 0, 0], chest: [0.65, 0, 0], spine: [0.38, 0, 0], head: [-0.5, 0, 0], clawL: [1.5, 0, 0], clawR: [1.5, 0, 0], _hips: -1.8 },
          scanwind: { armR: [0.436, 0, 1.222], foreR: [-0.524, 0, 0], armL: [0.436, 0, -1.222], foreL: [-0.524, 0, 0], chest: [-0.3, 0, 0], spine: [-0.1, 0, 0], head: [-0.45, 0, 0], clawL: [-0.3, 0, 0], clawR: [-0.3, 0, 0] },
          scan: { armR: [0.175, 0, 1.309], foreR: [-0.349, 0, 0], armL: [0.175, 0, -1.309], foreL: [-0.349, 0, 0], chest: [0.2, 0, 0], neck: [0.2, 0, 0], head: [0.45, 0, 0], clawL: [-0.3, 0, 0], clawR: [-0.3, 0, 0], _hips: -0.4 },
          summon: { armR: [-2.967, 0, 0.14], foreR: [-0.175, 0, 0], armL: [-0.349, 0, -0.698], foreL: [-0.698, 0, 0], chest: [-0.25, -0.15, 0], head: [-0.4, 0.1, 0], clawR: [-0.3, 0, 0], clawL: [0.8, 0, 0], _hips: 0.4 },
          cast: { armR: [-1.658, 0, 0.087], foreR: [-0.087, 0, 0], armL: [0.349, 0, -0.611], foreL: [-0.873, 0, 0], chest: [0.25, 0.2, 0], spine: [0.1, 0.1, 0], head: [-0.1, -0.2, 0], clawR: [-0.3, 0, 0], clawL: [1, 0, 0], _hips: -0.4 },
          grabwind: { armR: [-2.094, 0, 1.047], foreR: [-1.222, 0, 0], armL: [-0.698, 0, -0.349], foreL: [-1.396, 0, 0], chest: [-0.15, -0.45, 0], spine: [-0.05, -0.25, 0], head: [0, 0.3, 0], clawR: [-0.4, 0, 0], clawL: [1.2, 0, 0], _hips: 0.2 },
          grab: { armR: [-1.396, 0, 0], foreR: [-0.175, 0, 0], armL: [0.349, 0, -0.524], foreL: [-1.047, 0, 0], chest: [0.3, 0.45, 0], spine: [0.12, 0.25, 0], head: [-0.15, -0.3, 0], clawR: [1.5, 0, 0], clawL: [1.2, 0, 0], _hips: -0.7 },
          kneel: { armR: [-1.047, 0, 0.436], foreR: [-0.349, 0, 0], armL: [-0.175, 0, -0.262], foreL: [-0.524, 0, 0], chest: [0.6, 0, 0], spine: [0.45, 0, 0], head: [0.35, 0, 0], clawR: [-0.2, 0, 0], clawL: [0.8, 0, 0], _hips: -2.6 },
          brace: { armR: [-1.222, 0, -0.349], foreR: [-1.92, 0, 0], armL: [-1.222, 0, 0.349], foreL: [-1.92, 0, 0], chest: [0.35, 0, 0], spine: [0.2, 0, 0], head: [0.3, 0, 0], clawL: [1.5, 0, 0], clawR: [1.5, 0, 0], _hips: -0.8 },
          slump: { armR: [-0.087, 0, 0.14], foreR: [-0.349, 0, 0], armL: [-0.087, 0, -0.14], foreL: [-0.436, 0, 0], chest: [0.6, 0, 0.1], spine: [0.5, 0, 0], neck: [0.3, 0, 0], head: [0.5, 0.2, 0], clawL: [0.5, 0, 0], clawR: [0.3, 0, 0], _hips: -3.4 },
        });
        for (const n of ['hunch', 'pound', 'scanwind', 'scan', 'summon', 'cast', 'grabwind', 'grab']) {
          const P = kit.POSES[n], T = { _only: true };
          for (const k of ['spine', 'chest', 'neck', 'head']) if (P[k]) T[k] = P[k];
          kit.POSES[n + '_body'] = T;
        }
      }
      // a glowing hologram twin of every plate that can come off, shown where the plate was: its hard
      // edges as lines over a faint shell that glows at the edges and has scan lines running up it
      // (it was a triangle wireframe, which read as a tangle). Each bone's twins are merged into one
      // lines mesh and one shell, so a bare boss costs two draw calls a bone; each plate keeps an empty
      // stand-in where it was, for the hit points pinned to it.
      const ghostCol = C(kit.glowColor || '#ff3a2e', 1.7);
      const ghostLine = keep(new THREE.LineBasicMaterial({ color: ghostCol.clone(), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const ghostFill = keep(new THREE.ShaderMaterial({
        uniforms: { uCol: { value: ghostCol.clone().multiplyScalar(0.7) }, uT: { value: 0 }, uK: { value: 1 } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
          void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uT; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vY;
          void main(){ float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.0); float scan = smoothstep(0.82, 1.0, sin(vY * 9.0 - uT * 5.0));
            float a = (0.03 + f * 0.3 + scan * 0.08) * uK; gl_FragColor = vec4(uCol * a, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const ghostBy = new Map(), gm4 = new THREE.Matrix4(), gs = new V();
      for (const set of kit.shedSets) for (const m of set) {
        if (m.userData.detail) continue;
        const g = new THREE.Object3D();
        g.position.copy(m.position); g.quaternion.copy(m.quaternion); g.scale.copy(m.scale).multiplyScalar(0.94);
        g.visible = false; m.parent.add(g); m.userData.ghost = g;
        if (!ghostBy.has(m.parent)) ghostBy.set(m.parent, []);
        const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
        geo.applyMatrix4(gm4.compose(m.position, m.quaternion, gs.copy(m.scale).multiplyScalar(0.94)));
        ghostBy.get(m.parent).push({ m, geo });
      }
      const cat = (geos, attr) => { let n = 0; for (const g of geos) n += g.attributes[attr].array.length; const a = new Float32Array(n); let i = 0; for (const g of geos) { a.set(g.attributes[attr].array, i); i += g.attributes[attr].array.length; } return a; };
      for (const [bone, list] of ghostBy) {
        const fill = keep(new THREE.BufferGeometry()), edges = list.map(x => new THREE.EdgesGeometry(x.geo, 28));
        fill.setAttribute('position', new THREE.BufferAttribute(cat(list.map(x => x.geo), 'position'), 3));
        fill.setAttribute('normal', new THREE.BufferAttribute(cat(list.map(x => x.geo), 'normal'), 3));
        const line = keep(new THREE.BufferGeometry()); line.setAttribute('position', new THREE.BufferAttribute(cat(edges, 'position'), 3));
        list.forEach(x => x.geo.dispose()); edges.forEach(e => e.dispose());
        const vis = new THREE.Group(); vis.visible = false;
        vis.add(new THREE.Mesh(fill, ghostFill)); vis.add(new THREE.LineSegments(line, ghostLine));
        bone.add(vis);
        for (const x of list) x.m.userData.ghostVis = vis;
      }
      kit.ghostMat = ghostLine; kit.ghostFill = ghostFill;
      kit.shed = [];
      // Syntax Error's lightning: short arcs that crackle round a gauntlet through a wind-up, and a
      // stream from the open claw to the raid on the reach (Art's Data Erasure); redrawn jagged each
      // frame so it flickers, all in one line mesh
      if (kit.tips) {
        const MAXSEG = 900, arcPos = new Float32Array(MAXSEG * 6);
        const arcGeo = keep(new THREE.BufferGeometry()); arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
        const arcMat = keep(new THREE.LineBasicMaterial({ color: C(kit.glowColor, 2.4), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const arcLines = new THREE.LineSegments(arcGeo, arcMat); arcLines.frustumCulled = false; scene.add(arcLines);
        const hot = keep(new THREE.LineBasicMaterial({ color: C('#ffffff', 1.6), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const core2 = new THREE.LineSegments(arcGeo, hot); core2.frustumCulled = false; core2.scale.setScalar(1); scene.add(core2);
        const live = [], a0 = new V(), d = new V(), side = new V(), up = new V(0, 1, 0), p0 = new V(), p1 = new V();
        kit.arcs = {
          add(a, b, life, jit = 0.6, segs = 10) { if (live.length < 60) live.push({ a: a.clone(), b: b.clone(), life, left: life, jit, segs }); },
          tick(dt) {
            let n = 0;
            for (let i = live.length - 1; i >= 0; i--) { live[i].left -= dt; if (live[i].left <= 0) live.splice(i, 1); }
            for (const r of live) {
              d.subVectors(r.b, r.a); side.crossVectors(d, up).normalize(); if (side.lengthSq() < 0.1) side.set(1, 0, 0);
              const up2 = new V().crossVectors(side, d).normalize();
              p0.copy(r.a);
              for (let k = 1; k <= r.segs && n < MAXSEG; k++) {
                const f = k / r.segs, j = k === r.segs ? 0 : r.jit * Math.sin(f * Math.PI);
                p1.copy(r.a).addScaledVector(d, f).addScaledVector(side, (Math.random() - 0.5) * 2 * j).addScaledVector(up2, (Math.random() - 0.5) * 2 * j);
                arcPos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], n * 6); n++;
                // a fork now and then
                if (Math.random() < 0.12 && n < MAXSEG) { a0.copy(p1).addScaledVector(side, (Math.random() - 0.5) * r.jit * 3).addScaledVector(up2, (Math.random() - 0.5) * r.jit * 3); arcPos.set([p1.x, p1.y, p1.z, a0.x, a0.y, a0.z], n * 6); n++; }
                p0.copy(p1);
              }
            }
            arcGeo.setDrawRange(0, n * 2); arcGeo.attributes.position.needsUpdate = true;
            arcLines.visible = core2.visible = n > 0;
          },
        };
        kit.glitchAt = 0;
      }
    }
    const vF = new V(), vG = new V();
    function shedArmour(i, instant) {
      const set = kit && kit.shedSets[i];
      if (!set) return;
      for (const m of set) shedOne(m, instant);
      if (!instant) { shake = Math.max(shake, 0.7); stopUntil = Math.max(stopUntil, performance.now() + 90); snd('plates'); }
    }
    // one plate comes off: it flies, and its hologram twin shows where it was
    function shedOne(m, instant, power = 1) {
      if (m.userData.home) return false;
      // the fist anchors and the hit points stay on the body: the anchor moves to the bone, the
      // hit points move to the wireframe twin
      for (const f of kit.fists) if (f.at.parent === m) m.parent.attach(f.at);
      const gh = m.userData.ghost;
      if (gh) { gh.visible = true; for (const b of blocks) if (b.km === m) b.km = gh; }
      if (m.userData.ghostVis) m.userData.ghostVis.visible = true;
      m.userData.home = { parent: m.parent, pos: m.position.clone(), quat: m.quaternion.clone(), scale: m.scale.clone(), ghost: gh };
      if (instant) { m.visible = false; kit.shed.push(m); return true; }
      scene.attach(m);
      const out = m.getWorldPosition(vF).sub(root.position).setY(0).normalize();
      // out to the sides and away from the view (the fight's frame always has the camera toward +z), so
      // the plates never land over the squad or in front of the camera
      m.userData.vel = new V(out.x * rnd(4, 7) + rnd(-1.5, 1.5), rnd(6, 10), rnd(-7, -2.5)).multiplyScalar(power);
      m.userData.spin = new V(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)).multiplyScalar(power);
      m.userData.life = rnd(1.6, 2.6);
      kit.shed.push(m);
      if (m.userData.detail) return true;
      // Syntax Error's plates spark red and white, not the arena's green
      const sc = kit.tips ? RED : GREEN;
      burst(vF.copy(m.position), kit.tips ? 16 : 40, 12, sc, 1.4, 9);
      burst(vF, kit.tips ? 8 : 20, 8, WHITE, 1, 9);
      flare(vF, sc, 5, 0.25, canFlash() ? 1.1 : 0.5);
      return true;
    }
    function shedTick(dt) {
      for (const m of kit.shed) {
        const u = m.userData;
        if (!u.vel || !m.visible) continue;
        u.vel.y -= 22 * dt;
        m.position.addScaledVector(u.vel, dt);
        m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt; m.rotation.z += u.spin.z * dt;
        if (m.position.y < 0.9 && u.vel.y < 0) {
          if (u.vel.y < -4) { burst(vF.copy(m.position).setY(0.3), 14, 6, WHITE, 0.8, 9); }
          m.position.y = 0.9; u.vel.multiplyScalar(0.35); u.vel.y = Math.abs(u.vel.y) * 0.4; u.spin.multiplyScalar(0.5);
        }
        u.life -= dt;
        if (u.life < 0) { m.position.y -= dt * 2.2; if (m.position.y < -3) m.visible = false; }
      }
    }
    function unshed() {
      if (!kit) return;
      for (const m of kit.shed) {
        const h = m.userData.home; h.parent.add(m); m.position.copy(h.pos); m.quaternion.copy(h.quat); m.scale.copy(h.scale); m.visible = true;
        if (h.ghost) { h.ghost.visible = false; for (const b of blocks) if (b.km === h.ghost) b.km = m; }
        if (m.userData.ghostVis) m.userData.ghostVis.visible = false;
        m.userData = { ghost: h.ghost, detail: m.userData.detail, ghostVis: m.userData.ghostVis };
      }
      kit.shed.length = 0;
    }
    if (kit) {
      eyes.forEach(e => { e.visible = false; });
      coreMesh.visible = false; cage.visible = false;
      rings.forEach(r => { r.visible = false; r.userData.gone = true; });
      const byPart = [['torso', 'legs'], ['head'], ['armL'], ['armR']];
      const _bb = new V();
      for (const b of blocks) {
        const pool = byPart[b.part].flatMap(k => kit.parts[k]).filter(Boolean);
        const m = pool.length ? pool[Math.floor(Math.random() * pool.length)] : kit.meshes[0];
        const bb = m.geometry.boundingBox;
        // a point on the surface of the piece's box, on a random face
        _bb.set(rnd(bb.min.x, bb.max.x), rnd(bb.min.y, bb.max.y), rnd(bb.min.z, bb.max.z));
        const ax = Math.floor(rnd(0, 3)), side = Math.random() < 0.5 ? 'min' : 'max';
        _bb.setComponent(ax, bb[side].getComponent(ax));
        b.km = m; b.kl = _bb.clone(); b.size *= 0.7;
      }
    }

    // Syntax Error's detail pass (js/app/syntax-dress.js): real metal, more parts, a halo, the core's
    // light, damage that builds through the phases, smoke, error codes floating round it
    const dress = kit && kit.tips && window.SyntaxDress ? SyntaxDress.dress(THREE, kit, { scene, renderer, glowTex, RoundedBoxGeometry: opts.RoundedBoxGeometry, reduce, calm }) : null;
    if (dress) {
      kit.shedSets[1].push(...dress.arms);
      kit.shedSets[2].push(...dress.body);
      // BossKit's glowing bands and chest lines go with the plates they sit on, or they hang in the
      // air as red squares once the armour is off (the visor stays: it's the face)
      const glowsOf = b => b.children.filter(o => o.isMesh && !kit.meshes.includes(o) && !o.userData.detail && o.material.isMeshBasicMaterial && !o.material.wireframe);
      for (const [i, bs] of [[1, [kit.bones.foreL, kit.bones.foreR]], [2, [kit.bones.chest]]]) for (const b of bs) for (const m of glowsOf(b)) { m.userData.detail = true; kit.shedSets[i].push(m); }
      disposables.push(dress);
      mergeArmour();
    }
    // Every armour piece and detail part that moves with the same bone, has the same material and comes off
    // at the same health stage becomes one mesh: about 110 draw calls for the boss down to about 45
    // (28 Nov 2026). The hit points pinned to a piece move onto the merged mesh, the fist anchors onto
    // the bone, and a merged piece still comes off whole at its stage with its hologram twin left behind.
    function mergeArmour() {
      const B0 = kit.bones, nodes = new Set([...Object.values(B0), kit.core, kit.tail].filter(Boolean));
      const nodeOf = o => { let p = o.parent; while (p && !nodes.has(p)) p = p.parent; return p; };
      for (const f of kit.fists) { const n = nodeOf(f.at); if (n && f.at.parent !== n) n.attach(f.at); }
      const setOf = new Map(); kit.shedSets.forEach((set, i) => set.forEach(m => setOf.set(m, i)));
      const gl = dress.glow, near = (a, b2) => Math.abs(a.r - b2.r) + Math.abs(a.g - b2.g) + Math.abs(a.b - b2.b) < 0.02;
      kit.group.updateMatrixWorld(true);
      const groups = new Map();
      kit.group.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible || !o.geometry || !o.geometry.attributes.normal) return;
        let mat = o.material;
        if (mat.wireframe || mat.transparent || mat.map || !(mat.isMeshStandardMaterial || mat.isMeshBasicMaterial)) return;
        if (mat.isMeshBasicMaterial && mat !== gl && near(mat.color, gl.color)) mat = gl;   // BossKit's glow pieces share the dress's glow
        const n = nodeOf(o); if (!n) return;
        const si = setOf.has(o) ? setOf.get(o) : -1, k = n.uuid + '|' + mat.uuid + '|' + si;
        if (!groups.has(k)) groups.set(k, { n, mat, si, list: [] });
        groups.get(k).list.push(o);
      });
      const inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), byOld = new Map();
      for (const g of groups.values()) {
        if (g.list.length < 2 && g.list[0].parent === g.n) continue;
        inv.copy(g.n.matrixWorld).invert();
        let count = 0; const parts = [];
        for (const m of g.list) {
          rel.multiplyMatrices(inv, m.matrixWorld);
          const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
          geo.applyMatrix4(rel); parts.push(geo); count += geo.attributes.position.count;
          byOld.set(m, rel.clone());
        }
        const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3); let i = 0;
        for (const geo of parts) { pos.set(geo.attributes.position.array, i * 3); nor.set(geo.attributes.normal.array, i * 3); i += geo.attributes.position.count; geo.dispose(); }
        const mg = keep(new THREE.BufferGeometry()); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        mg.computeBoundingBox(); mg.computeBoundingSphere();
        const M = new THREE.Mesh(mg, g.mat); g.n.add(M);
        M.userData.detail = g.list.every(m => m.userData.detail);
        const gv = g.list.map(m => m.userData.ghostVis).find(Boolean);
        if (gv) M.userData.ghostVis = gv;
        if (g.si >= 0) { const gh = new THREE.Object3D(); gh.visible = false; g.n.add(gh); M.userData.ghost = gh; }
        for (const m of g.list) { m.parent.remove(m); m.userData.mergedInto = M; }
        if (g.si >= 0) {
          const set = kit.shedSets[g.si];
          for (let j = set.length - 1; j >= 0; j--) if (set[j].userData.mergedInto === M) set.splice(j, 1);
          set.push(M);
        }
      }
      // hit points pinned to a merged piece: same spot, now in the merged mesh's space
      for (const b of blocks) { const r = b.km && byOld.get(b.km); if (r) { b.kl = b.kl.clone().applyMatrix4(r); b.km = b.km.userData.mergedInto; } }
    }

    // shards that orbit the boss
    const SH = 36;
    const shardMat = keep(new THREE.MeshBasicMaterial({ color: pal.a.clone(), wireframe: true }));
    const shards = new THREE.InstancedMesh(keep(new THREE.TetrahedronGeometry(0.42)), shardMat, SH);
    const shardData = Array.from({ length: SH }, () => ({ r: rnd(10, 16), a: rnd(0, Math.PI * 2), y: rnd(1.5, 17), s: rnd(0.08, 0.25) * (Math.random() < 0.5 ? -1 : 1), k: rnd(0.6, 1.6) }));
    shards.frustumCulled = false;
    scene.add(shards);

    // ---------- the raid: one marker per raider in an arc in front of the boss ----------
    const RAID = 40;
    // opts.raid: how many raider markers to show (a party shows its 1 to 3 teammates); all 40 by default
    const SHOWN = opts.raid != null ? Math.max(0, Math.min(RAID, opts.raid)) : RAID;
    const raidPos = Array.from({ length: RAID + 1 }, () => new V());   // last one is you
    // with the bots flying (js/app/raid-flight.js), raidPos is where each one is right now, homePos its
    // post in the formation, and aim the centre of the target zone the boss's attacks land on
    const homePos = Array.from({ length: RAID + 1 }, () => new V()), aim = new V();
    let flight = null;
    const markMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const marks = new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(0.32)), markMat, RAID + 1);
    marks.frustumCulled = false;
    scene.add(marks);
    const markGlow = new Float32Array(RAID + 1);
    const RAID_COLS = ['#3ee6ff', '#f29d30', '#8fb8ff', '#ff8a5c', '#cfe3d8'].map(h => C(h));
    const raidCol = i => RAID_COLS[i % RAID_COLS.length];
    const youCol = C(Theme.hex('accent'));
    const youRing = new THREE.Mesh(keep(new THREE.RingGeometry(0.9, 1.0, 48)), keep(new THREE.MeshBasicMaterial({ color: C(Theme.hex('accent'), 1.6), side: THREE.DoubleSide, transparent: true, opacity: 0.9 })));
    youRing.rotation.x = -Math.PI / 2;
    scene.add(youRing);
    let raidZ = 8;
    // The raid on screen is three squads of four (Gid, 25 Nov): yours in the middle, two more on the
    // flanks, a little forward, so the arena reads as teams at their posts instead of a line of 41.
    // Slots: RAID is you, 0-2 your squad mates, 3-10 the two flank squads (instanced crowd), 11 and up
    // the raiders off screen, whose shots come in from past the edges of the arena.
    const SQUAD_AT = [[0, 0], [-1.7, -0.7], [1.7, -0.7], [0, 1.5]];   // you or the leader, then three around
    const squadRings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(keep(new THREE.RingGeometry(2.55, 2.7, 64)), keep(new THREE.MeshBasicMaterial({ color: i ? raidCol(i * 2 - 1) : C(Theme.hex('accent')), side: THREE.DoubleSide, transparent: true, opacity: i ? 0.35 : 0.25 })));
      r.rotation.x = -Math.PI / 2; scene.add(r); squadRings.push(r);
    }
    function placeRaid(halfW) {
      const w = Math.min(15, halfW * 0.86);
      const centres = [[0, raidZ + 0.6], [-w * 0.62, raidZ - 2.6], [w * 0.62, raidZ - 2.6]];
      raidPos[RAID].set(centres[0][0], 0.7, centres[0][1]);
      for (let i = 0; i < 3; i++) raidPos[i].set(centres[0][0] + SQUAD_AT[i + 1][0], 0.55, centres[0][1] + SQUAD_AT[i + 1][1]);
      for (let s = 1; s <= 2; s++) for (let j = 0; j < 4; j++) {
        const [cx, cz] = centres[s], [dx, dz] = SQUAD_AT[j];
        raidPos[3 + (s - 1) * 4 + j].set(cx + dx * (s === 1 ? 1 : -1) * 0.9, 0.55, cz + dz * 0.9);
      }
      for (let i = 11; i < RAID; i++) {
        const side = i % 2 ? 1 : -1, k = (i - 11) / (RAID - 11);
        raidPos[i].set(side * (w + 4 + k * 6), 0.55, raidZ + 3 + k * 6);
      }
      centres.forEach(([x, z], i) => squadRings[i].position.set(x, 0.05, z + (i ? 0.2 : -0.2)));
      youRing.position.set(raidPos[RAID].x, 0.04, raidPos[RAID].z);
      // with operators standing there, shots leave from their chests
      if (OPS) for (const p of raidPos) p.y = BOT ? BotKit.HOVER : 1.9;
      raidPos.forEach((p, i) => { homePos[i].copy(p); if (flight) flight.home(i, p); });
      aim.copy(homePos[RAID]);
    }
    const ONSCREEN = 11;   // slots below this are drawn; the rest of the raid is off screen
    // raiders a blow knocks flat: knockAt[i] is when, and they get up again 1.4 s later
    const knockAt = new Float32Array(ONSCREEN).fill(-9);
    let flinchAt = -9;

    // ---------- the raid's bots (js/app/botkit.js), or operators (js/app/operator3d.js) without it ----------
    // Operators fight through their bots (Art, 27 Nov 2026): you and your squad hover in the raid as full
    // bots facing the boss; everyone else is one instanced crowd of simple bots. They type while words
    // land, dart forward on a release, spin when hit and drop with an X on the screen when down.
    // Operators themselves now show only in the profile, room, leaderboard and victory scene.
    const BOT = !!window.BotKit;
    const OPS = BOT ? 1 : window.Operator ? 1.7 : 0;    // an operator is about 3 units tall against the 16-unit titan
    const TH = { ...THREE, RoundedBoxGeometry: opts.RoundedBoxGeometry };
    const crew = [];                          // { id, op, slot, typeAt, down }
    let crowd = null, won = false;
    const crowdCol = new THREE.Color(), crowdTint = [];
    function addOp(id, preset, slot) {
      let op;
      if (BOT) { const b = id === 'you' ? BotKit.mine() : BotKit.random(id); op = BotKit.actor(TH, b.id, b.look, { scale: 0.78 }); }
      else { op = Operator.create(TH, preset, { lite: id !== 'you' }); op.group.scale.setScalar(OPS); }   // full detail for you only
      op.group.rotation.y = Math.PI;
      scene.add(op.group);
      const c = { id, op, slot, typeAt: -9, down: false, beat: Math.random() * 3, kb: (preset && preset.kb && preset.kb.style) || 'slab' };
      crew.push(c); return c;
    }
    if (OPS) {
      if (!kit) scene.add(new THREE.HemisphereLight('#c9d3da', '#08090a', 0.9));
      addOp('you', window.Operator ? Operator.mine() : null, RAID);   // the operator's preset still carries the keyboard
      crowd = BOT ? BotKit.crowd(TH, RAID) : Operator.crowd(TH, RAID);
      crowd.meshes.forEach(m => scene.add(m));
      for (let i = 0; i < RAID; i++) crowdTint.push(BOT ? raidCol(i).clone().multiplyScalar(1.5) : new THREE.Color('#ffffff').lerp(raidCol(i), 0.32));
      marks.visible = false;
      if (BOT && window.RaidFlight) {
        flight = RaidFlight.create(THREE, scene, { slots: RAID + 1, you: RAID, squads: [[RAID, 0, 1, 2], [3, 4, 5, 6], [7, 8, 9, 10]], hover: BotKit.HOVER, animated: Math.min(ONSCREEN, SHOWN),
          onSortie: k => { if (k === 0) cutaway('dive', 1.8); } });
        homePos.forEach((p, i) => { if (p.lengthSq()) flight.home(i, p); });
      }
    }
    // the squad mates take the three spots nearest you
    function setCrew(list) {
      if (!OPS) return;
      for (let i = crew.length - 1; i > 0; i--) { scene.remove(crew[i].op.group); crew[i].op.dispose(); crew.splice(i, 1); }
      (list || []).slice(0, 3).forEach((m, i) => addOp(m.id, m.preset, i));
    }
    function act(who, kind, by) {
      const c = crew.find(x => x.id === who);
      if (!c) return;
      if (kind === 'dodge' || kind === 'covered') {
        const l = lockFor(c.slot); if (!l) return;
        l.outcome = kind === 'dodge' ? 'dodge' : 'cover'; l.coverAt = nowS();
        // the squad's own moves (operator3d.js / botkit.js once): the one covering braces behind its shield
        const g = kind === 'covered' ? crew.find(x => x.id === by) : null;
        if (g && !g.down) g.op.once('cover');
        if (kind === 'covered' && flight) { if (g && g.slot !== c.slot) flight.guard(g.slot, c.slot, l.h + 0.35); }
        return;
      }
      // a squad mate heals or revives someone, or swings in to attack
      if (kind === 'heal' || kind === 'revive' || kind === 'attack' || kind === 'cover') { if (!c.down) c.op.once(kind); return; }
      if (kind === 'type') c.typeAt = nowS();
      else if (kind === 'cast' || kind === 'hit') { if (!c.down) c.op.once(kind); if (flight && kind === 'cast' && c.id !== 'you') flight.run(c.slot, nowS()); }
      else if (kind === 'down') { c.down = true; if (flight) flight.setDown(c.slot, true); }
      else if (kind === 'up') { c.down = false; if (flight) flight.setDown(c.slot, false); }
    }
    const opM = new THREE.Matrix4(), opQ = new THREE.Quaternion(), opS = new V(), opP = new V(), opE = new THREE.Euler(), spn = [0, 0];
    const faceBoss = p => Math.atan2(root.position.x - p.x, root.position.z - p.z);
    function opsTick(t, dt) {
      if (!OPS) return;
      for (const c of crew) {
        const p = raidPos[c.slot];
        c.op.group.position.set(p.x, BOT ? p.y - BotKit.HOVER : 0, p.z);
        if (flight) { flight.spinOf(c.slot, t, spn); c.op.group.rotation.set(spn[0], faceBoss(p), spn[1], 'YXZ'); }
        // mates keep typing; you type while your words are landing
        if (c.id !== 'you' && t - c.typeAt > 1.6 && Math.random() < dt * 2) c.typeAt = t;
        const dn = c.down || (flight && flight.isDown(c.slot));
        const anim = dn ? 'defeat' : won ? 'victory' : t - c.typeAt < 1.3 ? 'type' : 'idle';
        c.op.play(anim);
        c.op.update(dt, flight ? { vel: flight.vel(c.slot) } : undefined);
      }
      const used = new Set(crew.map(c => c.slot));
      if (BOT) {   // the rest of the raid: simple bots, every part sharing one matrix
        let n = 0;
        for (let i = 0; i < Math.min(ONSCREEN, SHOWN); i++) {
          if (used.has(i)) continue;
          const p = raidPos[i];
          const ku = t - knockAt[i], kk = ku < 0.15 ? ease(ku / 0.15) : ku < 0.8 ? 1 : ku < 1.4 ? 1 - smooth((ku - 0.8) / 0.6) : 0;
          const fu = t - flinchAt, fk = fu < 0.35 ? Math.sin(fu / 0.35 * Math.PI) * (0.5 + 0.5 * Math.sin(i * 2.3)) : 0;
          opP.set(p.x, (flight ? p.y - BotKit.HOVER : 0) + Math.sin(t * 2.1 + i * 1.3) * 0.12 + Math.sin(t * 9 + i) * 0.06 * markGlow[i] + fk * 0.35, p.z + (flight ? 0 : kk * 1.8));
          const fv = flight ? flight.vel(i) : opP, dn = flight && flight.isDown(i) ? 1 : 0;
          const kd = Math.max(kk, dn);
          if (flight) flight.spinOf(i, t, spn);
          opQ.setFromEuler(opE.set(-kd * 0.9 + (flight ? clamp(-fv.z * 0.05, -0.4, 0.4) + spn[0] : 0), (flight ? faceBoss(p) : Math.PI) + Math.sin(i * 1.7) * 0.25, kd * (i % 2 ? 1.2 : -1.2) + (flight ? clamp(fv.x * 0.05, -0.45, 0.45) + spn[1] : 0), 'YXZ'));
          const bs = 0.62 + (i % 5) * 0.02; opS.setScalar(bs);
          opP.y += BotKit.HOVER * (1 - bs);   // the hover height is in the geometry, so scaling would lower it
          opM.compose(opP, opQ, opS);
          crowdCol.copy(crowdTint[i]).multiplyScalar(1 + markGlow[i] * 1.2);
          crowd.meshes.forEach((m, k) => { m.setMatrixAt(n, opM); if (k) m.setColorAt(n, crowdCol); });
          n++;
        }
        crowd.meshes.forEach(m => { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
        return;
      }
      // the rest of the raid: two instanced crowds, male and female, mixed along both sides
      const n = [0, 0];
      for (let i = 0; i < Math.min(ONSCREEN, SHOWN); i++) {
        if (used.has(i)) continue;
        const k = i % 2, m = crowd.meshes[k], p = raidPos[i];   // squads mix male and female
        const ku = t - knockAt[i], kk = ku < 0.15 ? ease(ku / 0.15) : ku < 0.8 ? 1 : ku < 1.4 ? 1 - smooth((ku - 0.8) / 0.6) : 0;
        const fu = t - flinchAt, fk = fu < 0.35 ? Math.sin(fu / 0.35 * Math.PI) * (0.5 + 0.5 * Math.sin(i * 2.3)) : 0;
        opP.set(p.x, Math.max(0, Math.sin(t * 9 + i) * 0.06 * markGlow[i]) + fk * 0.35, p.z + kk * 1.8);
        opQ.setFromEuler(opE.set(-kk * 1.25, Math.PI + Math.sin(i * 1.7) * 0.25, 0));
        opS.setScalar(OPS * (0.92 + (i % 5) * 0.03));
        m.setMatrixAt(n[k], opM.compose(opP, opQ, opS));
        m.setColorAt(n[k], crowdCol.copy(crowdTint[i]).multiplyScalar(1 + markGlow[i] * 1.2));
        n[k]++;
      }
      crowd.meshes.forEach((m, k) => { m.count = n[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }

    // ---------- pooled effects ----------
    // bolts: thin glowing boxes flying from a raider to the boss
    const BOLTS = 72;
    const boltMesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff' })), BOLTS);
    boltMesh.frustumCulled = false;
    scene.add(boltMesh);
    const bolts = Array.from({ length: BOLTS }, () => ({ on: false, from: new V(), to: new V(), t: 0, dur: 0.2, w: 0.1, target: -1, h: null, col: new THREE.Color(), shield: false }));
    let boltI = 0;

    // sparks with their own colours
    const SP = 700;
    const spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spLife = new Float32Array(SP), spCol = new Float32Array(SP * 3), spGrav = new Float32Array(SP);
    const spGeo = keep(new THREE.BufferGeometry());
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
    const spMat = keep(new THREE.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sparks = new THREE.Points(spGeo, spMat);
    sparks.frustumCulled = false;
    scene.add(sparks);
    let spI = 0;
    for (let i = 0; i < SP; i++) spPos[i * 3 + 1] = -100;
    const tmpV = new V();
    function burst(at, n, speed, col, up = 1, grav = 9, dir = null) {
      for (let k = 0; k < n; k++) {
        const i = spI = (spI + 1) % SP;
        spPos[i * 3] = at.x; spPos[i * 3 + 1] = at.y; spPos[i * 3 + 2] = at.z;
        tmpV.set(rnd(-1, 1), rnd(-0.4, 1.2) * up, rnd(-0.6, 1.4));
        if (dir) tmpV.addScaledVector(dir, 1.2);
        tmpV.normalize().multiplyScalar(speed * rnd(0.35, 1));
        spVel[i * 3] = tmpV.x; spVel[i * 3 + 1] = tmpV.y; spVel[i * 3 + 2] = tmpV.z;
        spLife[i] = rnd(0.45, 1.1); spGrav[i] = grav;
        spCol[i * 3] = col.r; spCol[i * 3 + 1] = col.g; spCol[i * 3 + 2] = col.b;
      }
    }

    // local glows where hits land
    const FL = 24;
    const flares = Array.from({ length: FL }, () => {
      const m = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
      m.visible = false; scene.add(m);
      return { m, t: 0, life: 0.25, size: 1 };
    });
    let flI = 0;
    function flare(at, col, size, life = 0.22, k = 1) {
      const f = flares[flI = (flI + 1) % FL];
      f.m.position.copy(at); f.m.material.color.copy(col).multiplyScalar(k); f.size = size; f.life = life; f.t = 0; f.m.visible = true;
    }

    // shock rings on the floor
    const waves = Array.from({ length: 12 }, () => {
      const m = new THREE.Mesh(keep(new THREE.RingGeometry(0.92, 1, 96)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      return { m, t: 0, life: 1, r0: 1, r1: 10 };
    });
    let wvI = 0;
    function wave(at, r0, r1, life, col, op = 0.9) {
      const w = waves[wvI = (wvI + 1) % waves.length];
      w.m.position.set(at.x, 0.05, at.z); w.r0 = r0; w.r1 = r1; w.life = life; w.t = 0; w.op = op;
      w.m.material.color.copy(col); w.m.visible = true;
    }

    // telegraph ring on the raid and the attack beam
    const RED = C('#ff4d5e', 1.6), CYAN = C('#3ee6ff', 1.6), AMBER = C('#f29d30', 1.6), WHITE = C(Theme.hex('ink'), 1.4), GREEN = C(Theme.hex('accent'), 1.6);
    const tele = new THREE.Mesh(keep(new THREE.RingGeometry(0.86, 1, 96)), keep(new THREE.MeshBasicMaterial({ color: RED, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })));
    tele.rotation.x = -Math.PI / 2; tele.visible = false; scene.add(tele);
    const teleFill = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 64)), keep(new THREE.MeshBasicMaterial({ color: C('#ff4d5e', 0.5), side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    teleFill.rotation.x = -Math.PI / 2; teleFill.visible = false; scene.add(teleFill);
    const beamMat = keep(new THREE.MeshBasicMaterial({ color: C('#ff6a3d', 1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const beam = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)), beamMat);
    beam.visible = false; scene.add(beam);
    const sweepMat = keep(new THREE.MeshBasicMaterial({ color: C('#ff4d5e', 1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sweepBar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 1.6, 4)), sweepMat);
    sweepBar.visible = false; scene.add(sweepBar);

    // the shield: a soft shell with ripples where hits land
    const shieldMat = keep(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: C('#3ee6ff') }, uAmt: { value: 0 }, uTime: { value: 0 }, uRip: { value: [new THREE.Vector4(0, 0, 0, -9), new THREE.Vector4(0, 0, 0, -9), new THREE.Vector4(0, 0, 0, -9), new THREE.Vector4(0, 0, 0, -9)] } },
      vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uCol; uniform float uAmt; uniform float uTime; uniform vec4 uRip[4]; varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main(){
          float f = pow(clamp(1.0 - abs(dot(normalize(vN), vV)), 0.0, 1.0), 2.2);
          float hex = smoothstep(0.92, 1.0, max(abs(sin(vW.x * 1.6 + vW.y * 0.9)), abs(sin(vW.y * 1.8 - vW.z * 0.7))));
          float r = 0.0;
          for (int i = 0; i < 4; i++) { float age = uTime - uRip[i].w; float d = distance(vW, uRip[i].xyz); r += smoothstep(0.6, 0.0, abs(d - age * 9.0)) * smoothstep(0.7, 0.0, age); }
          float a = (f * 0.55 + hex * 0.12 + r * 0.6) * uAmt;
          gl_FragColor = vec4(uCol * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const shield = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 40, 24)), shieldMat);
    shield.visible = false; scene.add(shield);
    let shieldF = null, shieldShow = 0, shieldBreakT = -1, ripI = 0;

    // thrown words: glowing blocks that fly at you
    const SHOTS = 10;
    const shotMat = keep(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 1.7) }));
    const shotGeo = keep(new THREE.OctahedronGeometry(0.7));
    const shotWire = keep(new THREE.LineBasicMaterial({ color: C(Theme.hex('ink'), 1.5) }));
    const shotEdges = keep(new THREE.EdgesGeometry(keep(new THREE.BoxGeometry(1.4, 1.4, 1.4))));
    const shots = Array.from({ length: SHOTS }, () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(shotGeo, shotMat));
      g.add(new THREE.LineSegments(shotEdges, shotWire));
      g.visible = false; scene.add(g);
      return { g, on: false, id: '', launch: 0, arrive: 0, from: new V(), to: new V(), ret: -1, retFrom: new V(), lane: 0, pos: new V() };
    });

    // adds: small block drones that feed the boss through a tether
    const ADDS = 6, ADD_CUBES = 7;
    const addMat = edgeMat(C('#f29d30'), C('#ffd08a'), 90);
    const addCubes = new THREE.InstancedMesh(seededBox(ADDS * ADD_CUBES, i => (i % ADD_CUBES === 0 ? 1 : 0)), addMat, ADDS * ADD_CUBES);
    addCubes.frustumCulled = false;
    scene.add(addCubes);
    const addCoreMat = keep(new THREE.MeshBasicMaterial({ color: C('#f29d30', 2) }));
    const addCoreGeo = keep(new THREE.IcosahedronGeometry(0.7, 1));
    const tethPos = new Float32Array(ADDS * 6), tethT = new Float32Array(ADDS * 2);
    for (let i = 0; i < ADDS; i++) { tethT[i * 2] = 0; tethT[i * 2 + 1] = 1; }
    const tethGeo = keep(new THREE.BufferGeometry());
    tethGeo.setAttribute('position', new THREE.BufferAttribute(tethPos, 3));
    tethGeo.setAttribute('aT', new THREE.BufferAttribute(tethT, 1));
    const tethMat = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCol: { value: C('#f29d30', 1.6) } },
      vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uCol; varying float vT; void main(){ float p = 0.35 + 0.65 * smoothstep(0.6, 1.0, fract(vT * 6.0 - uTime * 1.6)); gl_FragColor = vec4(uCol * p, p); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const tethers = new THREE.LineSegments(tethGeo, tethMat);
    tethers.frustumCulled = false;
    scene.add(tethers);
    const ADD_SLOTS = [new V(-11, 6, 3), new V(11, 7, 2), new V(-7.5, 14, 0), new V(7.5, 14.5, 0), new V(-13, 11, -2), new V(13, 11.5, -2)];
    const adds = Array.from({ length: ADDS }, (_, i) => {
      const m = new THREE.Mesh(addCoreGeo, addCoreMat); m.visible = false; scene.add(m);
      return { m, on: false, id: '', spawn: 0, until: 0, slot: i, k: 0, dying: -1, pos: new V(), seed: rnd(0, 6) };
    });

    // ---------- post: bloom, then edge tint, vignette and glitch ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.22, 0.78);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const post = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uTint: { value: C('#ff4d5e') }, uTintAmt: { value: 0 }, uGlitch: { value: 0 }, uAb: { value: 0 }, uDim: { value: 0 },
        uWave: { value: new THREE.Vector3(0.5, 0.5, 9) }, uWaveK: { value: 0 }, uAsp: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec3 uTint; uniform float uTintAmt; uniform float uGlitch; uniform float uAb; uniform float uDim; varying vec2 vUv;
        uniform vec3 uWave; uniform float uWaveK; uniform float uAsp;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          // ZERO LIMIT: a ring of bent space running out from the hit (uWave: centre, age in s)
          if (uWaveK > 0.0) {
            vec2 d = (uv - uWave.xy) * vec2(uAsp, 1.0); float r = length(d), front = uWave.z * 1.35;
            float bx = (r - front) * 9.0; float band = exp(-bx * bx) * uWaveK;   // pow() of a negative number is undefined in GLSL
            uv -= normalize(d + 1e-5) / vec2(uAsp, 1.0) * band * 0.045 * sin((r - front) * 40.0 + 1.57);
          }
          float row = floor(uv.y * 30.0);
          if (h(vec2(row, floor(uTime * 9.0))) < uGlitch * 0.3) uv.x += (h(vec2(row, uTime)) - 0.5) * 0.025 * uGlitch;
          vec3 c = vec3(texture2D(tDiffuse, uv + vec2(uAb, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(uAb, 0.0)).b);
          vec2 q = vUv - 0.5;
          float edge = smoothstep(0.32, 0.72, length(q * vec2(1.0, 1.3)));
          c = mix(c, uTint, edge * uTintAmt);
          c *= 1.0 - smoothstep(0.45, 0.95, length(q)) * 0.45;
          c *= 1.0 - uDim * (0.3 + 0.7 * smoothstep(0.06, 0.5, length(q)));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    composer.addPass(post);

    // ---------- combat effects: tier shots and spells from js/app/combat/fx3d.js ----------
    let glitchK = 0, glitchUntil = 0, dimK = 0, dimUntil = 0, dimCur = 0, freezeUntil = 0, stunUntil = 0, breakAt = -9, tintMix = 0;
    const frozen = new Set();
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm, reduce,
      pixelHeight: () => renderer.domElement.height,
      juice: {
        shake: k => { shake = Math.max(shake, k); },
        stop: ms => { stopUntil = Math.max(stopUntil, performance.now() + ms); },
        glitch: (k, secs) => { glitchK = Math.max(glitchK, k); glitchUntil = Math.max(glitchUntil, nowS() + secs); },
        dim: (k, secs) => { dimK = k; dimUntil = nowS() + secs; },
        tint: (hex, k) => { post.uniforms.uTint.value.set(hex); tintAmt = Math.max(tintAmt, (calm ? 0.6 : 1) * k); },
        wave: (pos, k) => wave(pos, k),
        canFlash,
      },
    }) : null;
    // ZERO LIMIT's distortion wave: one at a time, from a world point (or the screen centre)
    let waveAt = -9, waveK = 0;
    function wave(pos, k = 1) {
      if (reduce) return;
      const v = pos ? pos.clone().project(camera) : new V(0, 0, 0);
      post.uniforms.uWave.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, 0);
      post.uniforms.uAsp.value = (host.clientWidth || 1) / (host.clientHeight || 1);
      waveAt = nowS(); waveK = Math.min(1.6, k) * (calm ? 0.5 : 1);
    }
    // your shots leave from your keyboard, the operator's weapon (js/app/operator3d.js kbWorld)
    const gun = out => { const c = crew.find(x => x.id === 'you'); return (c && c.op.kbWorld(out)) || null; };
    // ...and carry that keyboard's signature (js/app/combat/fx3d.js, keyboard signatures)
    const youKb = () => { const c = crew.find(x => x.id === 'you'); return c ? c.kb : 'slab'; };
    const caster = { pos: out => gun(out) || out.copy(raidPos[RAID]).setY(raidPos[RAID].y + 0.9) };
    const bossTarget = {
      size: 6,
      pos: out => out.copy(anchorCore),
      top: out => out.copy(anchorHead).setY(anchorHead.y + 1),
      base: out => out.set(root.position.x, 0, root.position.z + 1),
      react: (k, p, x) => react(k, p, x),
    };

    const camBase = new V(0, 5.5, 30), camLook = new V(0, 7.4, 0), lookCur = new V(0, 7.4, 0);
    // the orbit: every so often your squad swings round to a new side of the boss, and the view goes
    // with it at a capped speed; it holds still through a wind-up. Reduce motion keeps the fixed view.
    // Gid, 27 Nov 2026: "at times the boss stays in place. the party rotates to the back or to the
    // side. the camera follows so it looks like everything moves along". Every 7 to 12 s the party
    // swings round the boss in one arc of 60 to 150 degrees over 2 to 3 s, picked so it ends up off
    // the boss's side or behind it; the boss holds still and keeps its facing through the swing, the
    // camera pulls back and banks, and the other squads trail and catch up. In between, a slow drift.
    // It won't start a swing into an attack at your squad, and drifting stops for the last second
    // before one lands.
    const orbit = { phi: 0, w: 0, drift: 0.07, next: 5, sw: null, lag: 0, k: 0 };
    function orbitTick(t, dt) {
      if (reduce || !BOT) { orbit.w = 0; orbit.k = 0; return; }
      const sl = own(t), lk = locks.find(l => l.slot === RAID && t > l.h - 1.0 && t < l.h + 0.4);
      const hold = !!(sl && !sl.cut && t > sl.h - 1.0 && t < sl.h + 0.4) || !!lk || dead;
      const prev = orbit.phi;
      if (orbit.sw) {
        const u = (t - orbit.sw.t0) / orbit.sw.dur;
        if (u >= 1) { orbit.phi = orbit.sw.to; orbit.sw = null; orbit.k = 0; }
        else { orbit.phi = orbit.sw.from + (orbit.sw.to - orbit.sw.from) * smooth(u); orbit.k = Math.sin(u * Math.PI); }
      } else {
        const soon = evs.some(x => x.type === 'slam' && !x.side && !x.cut && x.h > t - 0.3 && x.h < t + 3.4) || locks.some(l => l.slot === RAID && t < l.h + 0.3);
        if (!hold && !soon && t > orbit.next) {
          // end up off its side or behind it: where its facing sits against the view afterwards
          const rel = (Math.random() < 0.5 ? -1 : 1) * rnd(1.4, 2.9);
          let d = bossYaw - rel - orbit.phi; d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < 1.0) d += Math.sign(d || 1) * 1.0;
          d = clamp(d, -2.6, 2.6);
          orbit.sw = { from: orbit.phi, to: orbit.phi + d, t0: t, dur: 1.1 + Math.abs(d) * 0.45 };
          orbit.next = t + orbit.sw.dur + rnd(6, 10);
          if (Math.random() < 0.3) orbit.drift = -orbit.drift;
        } else if (!hold) orbit.phi += orbit.drift * dt;
      }
      orbit.w = (orbit.phi - prev) / Math.max(dt, 1e-3);
      // the other squads fall behind the swing and fly to catch up
      orbit.lag = (orbit.lag - (orbit.phi - prev) * 0.75) * Math.exp(-dt * 0.9);
      env.rotation.y = -orbit.phi;
    }
    // ---------- the camera director (Gid, 27 Nov 2026: Final Fantasy XVI and Asura's Wrath) ----------
    // Big moments play a short sequence of shots instead of one cutaway: a hard cut to a close-up of
    // your bot in slow motion, then a hard cut to a wide shot as the hit lands; a low shot from behind
    // the boss's back as the squad charges it, then over your bot's shoulder as the blast goes in; a
    // crane up from the floor to show the boss's size on a phase change; a slow-motion pass as your bot
    // rolls out of a lock-on. Each shot is a moving camera (it dollies, cranes or orbits), not a still.
    // Nothing plays while an attack winds up at your squad, and a sequence running when one starts
    // cuts straight back. Reduce motion keeps the fixed view.
    // The shots and their sequences are played by js/app/camdir.js, which adds the rules a director
    // keeps (Gid, 27 Nov 2026): at most 3 sequences in 20 s and 3.5 s apart (block, dodge, the phase
    // and the kill can break that); nothing from 1.6 s before a hit at your squad, except the dodge,
    // which is the slow-motion pass of that hit; two calls within 0.25 s make one cut, so the last
    // phase's crane doesn't flash before the kill; you keep your side of the screen across cuts
    // unless a shot is meant to reverse (behind the boss's back, the kill); the camera never goes
    // inside the boss; each shot stands far enough back to fit the boss, measured from its meshes;
    // and the way back to the game shot is a cut when it's a big move, not a whip pan.
    const bF = new V(), bS = new V(), tB = new V(), dY = new V(0, 1, 0), dD = new V();
    function bossFrame() { const a = root.rotation.y; bF.set(Math.sin(a), 0, Math.cos(a)); bS.set(bF.z, 0, -bF.x); }
    function toBoss(y) { return tB.copy(root.position).sub(y).setY(0).normalize(); }
    // how far back to stand so a thing h tall fills size of the frame's height
    const fitD = (h, size, fov) => (h * 0.5 / size) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    let bossHt = 0; const bossBox = new THREE.Box3();
    const bossH = () => { if (!bossHt) { bossBox.setFromObject(root); bossHt = Math.max(6, bossBox.max.y); } return bossHt; };
    const gamePos = new V(), gameLook = new V(); let gameFov = 40;
    // Gid, 28 Nov 2026: the whole boss stays in frame in normal play, and a cut-in can come closer but
    // never crops its head. keepHead pulls a camera back along its line of sight until the top of the
    // head (horns included) sits under 88% of the frame's height; shots on your bot's face opt out (face: 1).
    const kCam = new THREE.PerspectiveCamera(40, 1, 0.1, 400), kTop = new V(), kV = new V();
    function keepHead(o, l, fov, lim = 0.88) {
      if (dead && deadBoom) return;
      kTop.copy(anchorHead); kTop.y += 1.3;
      kCam.fov = fov; kCam.aspect = camera.aspect; kCam.updateProjectionMatrix();
      for (let i = 0; i < 4; i++) {
        kCam.position.copy(o); kCam.lookAt(l); kCam.updateMatrixWorld(); kCam.matrixWorldInverse.copy(kCam.matrixWorld).invert();
        kV.copy(kTop).project(kCam);
        const behind = kV.z > 1;
        if (!behind && kV.y <= lim) return;
        const f = behind ? 1.8 : Math.min(1.8, 1 + (kV.y - lim) / lim * 1.1 + 0.02);
        o.sub(l).multiplyScalar(f).add(l);
      }
    }
    const P = (pose, more = {}) => Object.assign({ pose: (c, o) => { pose(c.u, o.pos, o.look, c); if (!more.face) keepHead(o.pos, o.look, o.fov || 40); } }, more);
    const CLOSE = P((u, o, l) => {                                     // your bot's face, pushing in
      const y = raidPos[RAID]; toBoss(y);
      // side on to your bot, the boss beyond it: never between the two, since it dives in right next to the boss
      const sd = (tB.z * (gamePos.x - y.x) - tB.x * (gamePos.z - y.z)) > 0 ? 1 : -1;
      o.copy(y).addScaledVector(tB, 1.5); o.x += tB.z * sd * (3.2 - 0.6 * ease(u)); o.z -= tB.x * sd * (3.2 - 0.6 * ease(u)); o.y = y.y + 0.5; l.copy(y); l.y += 0.3; },
      { len: 0.6, slow: 0.6, cut: 1, omega: 12, fov: 34, frame: ['face', -0.3, 0.05], face: 1 });   // the face a third in from the left
    const WIDE_HIT = P((u, o, l) => {                                  // side on to the boss as it's hit
      bossFrame(); const H = bossH(), d = fitD(H, 0.55, 40) * (1 - 0.12 * u), sd = bS.dot(tB.copy(gamePos).sub(root.position)) > 0 ? 1 : -1;
      o.copy(root.position).addScaledVector(bS, sd * d).addScaledVector(bF, d * 0.2); o.y = H * 0.35 + 1.2 * u; l.copy(anchorCore); },
      { len: 1.05, slow: 0.35, cut: 1, omega: 10 });
    const BACK_LOW = P((u, o, l) => {                                  // low behind its back, craning up, the squad coming at it
      bossFrame(); const H = bossH(), d = fitD(H, 0.8, 40) * (1 - 0.1 * u);
      o.copy(root.position).addScaledVector(bF, -d).addScaledVector(bS, d * 0.35); o.y = 1 + H * 0.3 * smooth(u); l.copy(anchorHead); l.y -= H * 0.15; },
      { len: 1.25, cut: 1, omega: 10, free: true });
    const SHOULDER = P((u, o, l) => {                                  // over your bot's shoulder as the blast goes in
      const y = raidPos[RAID], b = root.position, H = bossH(); toBoss(y); const gap = Math.hypot(b.x - y.x, b.z - y.z);
      const d = Math.max(gap + 3.2, fitD(H, 0.62, 44)) - 1.2 * u; dD.crossVectors(dY, tB);
      o.set(b.x, 0, b.z).addScaledVector(tB, -d).addScaledVector(dD, 1.5); o.y = y.y + 2.2; l.copy(anchorCore).lerp(anchorHead, 0.4); },
      { len: 0.95, slow: 0.5, cut: 1, fov: 44, omega: 10 });
    const CLASH = P((u, o, l) => {                                     // low behind your barrier as the blow smashes into it
      o.copy(aim); o.x += 6; o.y = 2 + 0.8 * u; o.z += 9 - 1.5 * u; l.copy(aim); l.y = 5; l.z -= 5; },
      { len: 0.7, slow: 0.5, cut: 1, omega: 12 });
    const director = window.CamDirector ? CamDirector.create(THREE, camera, {
      reduce: reduce || !BOT, lockBefore: 3.5,   // the punch and the lock-on wind up for 3 to 4.5 s
      onPart: (name, i, p) => { if (p.slow && !reduce) slowUntil = Math.max(slowUntil, performance.now() + p.slow * 1000); },
      shots: {
        game: { pose: (c, o) => { o.pos.copy(gamePos); o.look.copy(gameLook); o.fov = gameFov; keepHead(o.pos, o.look, o.fov, 0.84); }, omega: 8 },
        strike: { pri: 2, parts: [CLOSE, WIDE_HIT] },
        back: { pri: 2, parts: [BACK_LOW, SHOULDER] },
        block: { pri: 3, parts: [CLASH, WIDE_HIT] },
        // beside your bot as the shot passes: the dodge of the hit that's coming, so it may play during it
        dodge: { pri: 3, duringThreat: true, parts: [P((u, o, l) => {
          const y = raidPos[RAID]; toBoss(y);
          o.copy(y).addScaledVector(tB, -1.2 - 0.8 * u); o.x += tB.z * 3.2; o.z -= tB.x * 3.2; o.y = y.y + 0.4; l.copy(y).lerp(anchorCore, 0.15); },
          { len: 0.8, slow: 0.8, cut: 1, omega: 12, fov: 36, frame: ['face', 0.3, 0], face: 1 })] },
        // from the floor in front of it, craning up and back
        scale: { pri: 3, parts: [P((u, o, l) => {
          bossFrame(); const H = bossH(), d = fitD(H, 1.5, 40) + (fitD(H, 0.85, 40) - fitD(H, 1.5, 40)) * smooth(u);
          o.copy(root.position).addScaledVector(bF, d).addScaledVector(bS, 2.5); o.y = 0.6 + H * 0.35 * smooth(u); l.copy(anchorHead); l.y -= H * 0.08; },
          { len: 2.4, omega: 6 })] },
        // side on to the boss and the squad it's going after, both in frame
        over: { pri: 1, parts: [P((u, o, l, c) => {
          const b = root.position, a = c.x ? c.x.at : b, H = bossH(); v4.set(a.x - b.x, 0, a.z - b.z); const span = v4.length() + H * 0.6; v4.normalize(); dD.crossVectors(dY, v4);
          const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) * camera.aspect), d = Math.max(fitD(H, 0.5, 40), span * 0.7 / Math.tan(half)) * (1 - 0.06 * u);
          l.set((a.x + b.x) / 2, H * 0.4, (a.z + b.z) / 2); o.copy(l).addScaledVector(dD, d); o.y = H * 0.5; },
          { len: 1.3, cut: 1, omega: 8 })] },
        // riding behind your bot as your squad dives in
        dive: { pri: 1, parts: [P((u, o, l) => {
          const y = raidPos[RAID], b = root.position; v4.set(y.x - b.x, 0, y.z - b.z).normalize(); dD.crossVectors(dY, v4);
          o.copy(y).addScaledVector(v4, 9).addScaledVector(dD, -2.2); o.y = y.y + 3; l.copy(y).lerp(anchorCore, 0.6); },
          { len: 1.8, fov: 60, omega: 6, hand: 0.06 })] },
        // high and wide at the start: the whole raid round the boss
        wide: { pri: 2, parts: [P((u, o, l) => {
          const b = root.position, H = bossH(), d = fitD(H, 0.6, 42) * (1 + 0.08 * u); dD.set(gamePos.x - b.x, 0, gamePos.z - b.z).normalize(); const sx = new V().crossVectors(dY, dD);
          l.copy(b).addScaledVector(dD, 5); l.y = H * 0.45; o.copy(l).addScaledVector(dD, d * 0.9).addScaledVector(sx, d * 0.25); o.y = l.y + d * 0.32; },
          { len: 2.4, fov: 42, omega: 3 })] },
        // the kill (28 Nov 2026): a close-up on the core as it overloads, in slow motion, then a slow orbit
        // pulling back as it comes apart and blows
        kill: { pri: 4, free: true, parts: [P((u, o, l) => {
          bossFrame(); const H = bossH(), d = fitD(H * 0.6, 0.9, 34) * (1 - 0.1 * u);
          l.copy(anchorCore).lerp(anchorHead, 0.45); o.copy(l).addScaledVector(bF, d).addScaledVector(bS, d * 0.3); o.y = anchorCore.y - 1 + 0.8 * u; },
          { len: 1.5, slow: 0.55, cut: 1, omega: 9, fov: 34 }), P((u, o, l) => {
          const r = fitD(bossH(), 0.75, 40) * (1 + 0.25 * u), a = ease(u) * 1.2 + 0.5; o.set(root.position.x + Math.sin(a) * r, 5.5 + 3 * u, root.position.z + Math.cos(a) * r); l.copy(anchorCore); l.y -= 2 * u; },
          { len: 3.4, cut: 1, slow: 0.4, omega: 4 })] },
        // the kernel open: low in front of it as it drops onto one claw, looking up at the bared core
        kneel: { pri: 3, anySide: true, parts: [P((u, o, l) => {
          bossFrame(); const H = bossH(), d = fitD(H * 0.7, 0.85, 38) * (1 - 0.08 * u);
          o.copy(root.position).addScaledVector(bF, d).addScaledVector(bS, d * 0.5); o.y = 1.0 + 0.6 * u; l.copy(anchorCore); l.y += 0.5; },
          { len: 1.7, slow: 0.45, cut: 1, omega: 9, fov: 38 })] },
        // a phase change: up close on its head as it curls up and the power surges, then the crane
        // from the floor as it roars (the scale shot)
        roar: { pri: 3, anySide: true, parts: [P((u, o, l) => {
          bossFrame(); const H = bossH(), d = fitD(H * 0.35, 0.8, 34) * (1 - 0.12 * u);
          o.copy(anchorHead).addScaledVector(bF, d).addScaledVector(bS, -d * 0.35); o.y = anchorHead.y - 2.4 - 0.4 * u; l.copy(anchorHead); l.y -= 2.2; },
          { len: 0.85, slow: 0.6, cut: 1, omega: 10, fov: 34 }), P((u, o, l) => {
          bossFrame(); const H = bossH(), d = fitD(H, 1.5, 40) + (fitD(H, 0.85, 40) - fitD(H, 1.5, 40)) * smooth(u);
          o.copy(root.position).addScaledVector(bF, d).addScaledVector(bS, 2.5); o.y = 0.6 + H * 0.35 * smooth(u); l.copy(anchorHead); l.y -= H * 0.08; },
          { len: 2.0, cut: 1, omega: 6 })] },
        // the fight's opening: low on the visor, then rising to the whole arena
        intro: { pri: 2, anySide: true, parts: [P((u, o, l) => {
          bossFrame(); const H = bossH(), d = fitD(H * 0.3, 0.75, 32);
          o.copy(anchorHead).addScaledVector(bF, d * (1 - 0.1 * u)).addScaledVector(bS, d * 0.25); o.y = anchorHead.y - 2.6 + 0.5 * u; l.copy(anchorHead); l.y -= 2.3; },
          { len: 1.2, cut: 1, omega: 8, fov: 32 }), P((u, o, l) => {
          const b = root.position, H = bossH(), d = fitD(H, 0.6, 42) * (0.85 + 0.25 * u); dD.set(gamePos.x - b.x, 0, gamePos.z - b.z).normalize();
          l.copy(b).addScaledVector(dD, 4); l.y = H * 0.45; o.copy(l).addScaledVector(dD, d * 0.9); o.y = 1.5 + d * 0.3 * smooth(u); },
          { len: 1.8, cut: 1, fov: 42, omega: 4 })] },
      } }) : null;
    // the next hit at your squad still to come: an attack or a lock-on on you
    function threatAt(t) {
      let h = Infinity;
      // an attack at you counts from its start, however long its wind-up (the charged punch winds up for
      // 6.5 s, longer than the director's lock), so no cutaway covers any of a wind-up
      for (const x of evs) if (x.type === 'slam' && !x.side && !x.cut && x.h > t) h = Math.min(h, x.h, t >= x.s ? t + 1 : x.h);
      // a lock-on on you counts as coming from the moment it shows (its dodge word is up the whole time),
      // so a cutaway already playing cuts straight back instead of covering its first second
      for (const l of locks) if (l.slot === RAID && !l.fired && l.h > t) h = Math.min(h, l.h, t + 1);
      return h;
    }
    function play(kind, x = null, pri) {
      if (!director) return false;
      return director.want(kind, pri === undefined ? { x } : { x, pri });
    }
    const cutaway = (kind, len, x) => play(kind, x);
    const faceV = new V();
    const dirCtx = { threatAt: Infinity, line: null, homeSide: 0, occluders: null, subjects: null };
    let dirOpened = false; const bornAt = nowS();
    let baseFov = 40;
    function fit() {
      const w = host.clientWidth || 600, h = host.clientHeight || 400;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      const half = THREE.MathUtils.degToRad(baseFov / 2);
      // fit the boss's height on wide screens and its arm span on narrow ones
      const dist = Math.max(28, 11.5 / (Math.tan(half) * camera.aspect));
      camBase.set(0, 5.5, dist);
      camera.position.copy(camBase);
      camera.fov = baseFov;
      camera.lookAt(camLook);
      camera.updateProjectionMatrix();
      // the raid stands on the nearest strip of floor the camera can see
      const pitch = Math.atan2(camLook.y - camBase.y, dist);
      const down = half - pitch;
      raidZ = clamp(dist - camBase.y / Math.tan(down) - 4.2, 3, 11);
      placeRaid((dist - raidZ) * Math.tan(half) * camera.aspect);
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    // adaptive quality (js/room/aq.js, as the Superboss does it): the resolution goes down first, then the
    // heavy extras (smoke and embers, the floating hex codes, dust, light pulses, scorch marks), so a
    // slow machine stays smooth. window.__wbFull keeps everything for tests
    let detail = 1;
    function setDetail(d) {
      detail = d;
      if (dress) dress.setDetail(d);
      dust.visible = d > 0.55;
      decals.visible = d > 0.45;
    }
    const aq = window.AdaptiveQuality && !window.__wbFull ? AdaptiveQuality.create({ key: 'wpm-wb', fps: 60, minScale: 0.6, minDetail: 0.4,
      onScale: s2 => { renderer.setPixelRatio(basePR * s2); fit(); }, onDetail: setDetail }) : null;
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);
    fit();

    // ---------- state ----------
    let frac = 1, stage = 0, phase = 0, dead = false, deadT = 0, deadAt = 0;
    let shake = 0, hitGlow = 0, stopUntil = 0, slowUntil = 0, tintAmt = 0, glitch = 0;
    let recoil = 0, recoilV = 0, recoilSide = 0, headJerk = 0, weakOn = false, weakK = 0;
    // jolt: a short reel from your hits; reelAt: the big reel after a stagger or a blocked attack
    let jolt = 0, reelAt = -9;
    const cutK = (x, t) => x.cut ? 1 - smooth(clamp((t - x.cut) / 0.3, 0, 1)) : 1;
    const easeOut = x => 1 - (1 - x) * (1 - x);
    let roarAt = -9, charge = 0, kneelAt = -9, kneelW = 0, roarFx = 0, deathStep = 0, popAt = 0;
    const STAGE_AT = [0.75, 0.5, 0.25, 0.1];
    const coreGreen = C(Theme.hex('accent'), 1.2), coreRed = C('#ff4d5e', 0.95), coreAmber = C('#f29d30', 1.0), coreWeak = C('#ffb347', 1.15);
    const evs = [];            // attacks on the scene clock
    const blocked = new Set();
    const anchors = new Map();
    const mv = { x: 0, z: 0, tx: 0, tz: 0, y: 0, face: 0, spin: 0, spinV: 0, next: 0, lungeAt: -9, blinkAt: -9, dashUntil: 0 };
    // threatK: 0 to 1 as an attack comes at the camera (the zoom and the step forward)
    let threatK = 0, chargeK = 0;
    // Between attacks it never just stands there (Gid, 26 Nov 2026: "all it does is shuffle left
    // and right then stagger"). Every 1.1 to 2.2 s it swings, jabs, stomps or leans at the raid,
    // and it walks in on the raid the whole time: adv goes from 0 at its spot to 1 right in front
    // of the raid in about 15 s, and your sets of words and blocks knock it back.
    // MEN: wind-up pose, strike pose, wind-up seconds, weight
    const MEN = { swipe: ['pull', 'sweep', 0.34, 0.62], jab: ['coil', 'punch', 0.26, 0.58], stomp: ['raise', 'slam', 0.4, 0.5], lean: ['coil', 'coil', 0.45, 0.7],
      // Syntax Error (28 Nov 2026): a snatch of the claw at the raid that crackles, and a taunt: it curls up
      // and throws its head back with its mouth lit
      claw: ['grabwind', 'grab', 0.3, 0.5], taunt: ['brace', 'roar', 0.5, 0.42] };
    const SYN_MEN = !!(kit && kit.POSES.brace);
    const MEN_BY_PHASE = SYN_MEN
      ? [['swipe', 'jab', 'lean', 'stomp', 'taunt'], ['swipe', 'jab', 'stomp', 'claw', 'taunt'], ['jab', 'swipe', 'stomp', 'claw', 'taunt'], ['jab', 'swipe', 'stomp', 'claw', 'swipe'], ['jab', 'swipe', 'claw', 'jab', 'swipe', 'taunt']]
      : [['swipe', 'jab', 'lean', 'stomp'], ['swipe', 'jab', 'stomp', 'lean'], ['jab', 'swipe', 'stomp', 'jab'], ['jab', 'swipe', 'stomp', 'jab', 'swipe'], ['jab', 'swipe', 'stomp', 'jab', 'swipe']];
    const men = { at: -9, kind: 'swipe', next: 2, fired: false };
    let adv = 0, prevX = 0, leanZ = 0;

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V(), sc = new V(), e3 = new THREE.Euler();
    const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V();

    function attachPos(b, out) { return b.km ? out.copy(b.kl).applyMatrix4(b.km.matrixWorld) : out.copy(b.local).applyMatrix4(partG[b.part].matrixWorld); }
    function knock(b, permanent, power = 1) {
      if (b.mode >= 3) return;
      if (b.mode === 0) attachPos(b, b.wp);
      const out = v1.copy(b.wp).sub(root.position).setY(0).normalize();
      if (permanent) {
        b.mode = 3; b.grav = 1;
        // away from the view (the camera is always toward +z), so the chunks don't pile up in front of the squad
        b.vel.set(out.x * rnd(2, 6), rnd(2, 7), rnd(-5, -0.5)).multiplyScalar(power);
      } else {
        if (b.mode !== 0) return;
        b.mode = 1; b.life = rnd(0.5, 1.2); b.grav = rnd(0.15, 0.5);
        b.vel.set(out.x * rnd(2, 5) + rnd(-1, 1), rnd(0.5, 4), out.z * 2 + rnd(1, 5)).multiplyScalar(power);
      }
      b.spin.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
    }
    function setFrac(f, instant) {
      frac = Math.max(0, f);
      const ns = STAGE_AT.filter(t => frac <= t).length;
      for (const b of blocks) if (b.breakAt && frac <= b.breakAt) {
        if (instant) b.mode = 5;
        else knock(b, true);
      }
      if (ns > stage && !instant) shake = Math.max(shake, 0.8);
      if (kit) for (let i = stage; i < ns; i++) shedArmour(i, instant);
      stage = ns;
      rings.forEach((r, i) => {
        const breakAt = i === 2 ? 0.5 : i === 0 ? 0.1 : -1;
        if (frac <= breakAt && !r.userData.fall && !r.userData.gone) {
          if (instant) { r.userData.gone = true; r.visible = false; }
          else { r.userData.fall = true; r.userData.vel.set(rnd(-2, 2), -1, rnd(1, 3)); }
        }
      });
      boxMat.uniforms.uHurtMix.value = [0, 0.12, 0.25, 0.42, 0.6][stage];
      if (kit) kit.plates(frac);
    }

    // ---------- phases ----------
    function setPhase(np, instant) {
      if (np === phase && !instant) return;
      const up = np > phase;
      phase = np;
      palFrom = palTo; palTo = np; palT = instant ? 1 : 0; palAt = nowS();
      if (instant) applyPal(1);
      pilHT = [0.35, 0.55, 0.75, 0.95, 1.15][np];
      // a phase change ends the attacks in flight
      evs.length = 0;
      for (const s of shots) if (s.on && s.ret < 0) { s.on = false; s.g.visible = false; burst(s.pos, 10, 4, CYAN); }
      for (const a of adds) if (a.on && a.dying < 0) a.dying = nowS();
      tele.visible = teleFill.visible = false; beam.visible = false; sweepBar.visible = false; charge = 0;
      if (!instant && up) {
        roarAt = nowS(); play(kit && kit.POSES.brace ? 'roar' : 'scale'); snd('transform');
        shake = Math.max(shake, 0.9);
        wave(root.position, 2, 30, 1.6, pal.a, 0.8);
        scatter(70, 1.4);
      }
    }
    function applyPal(k) {
      const A = PAL[palFrom], B = PAL[palTo];
      pal.bg.copy(A.bg).lerp(B.bg, k); pal.a.copy(A.a).lerp(B.a, k); pal.b.copy(A.b).lerp(B.b, k); pal.c.copy(A.c).lerp(B.c, k);
      pal.bloom = A.bloom + (B.bloom - A.bloom) * k; pal.wall = A.wall + (B.wall - A.wall) * k;
      scene.background.copy(pal.bg); scene.fog.color.copy(pal.bg);
      grid.material.color.copy(pal.b).multiplyScalar(0.9);
      wallMat.color.copy(pal.a);
      floorRings.forEach(r => r.material.color.copy(pal.a).multiplyScalar(1.1));
      boxMat.uniforms.uColA.value.copy(pal.a); boxMat.uniforms.uColC.value.copy(pal.c);
      // Syntax Error's chips are its own red and white, not the arena's colour
      if (kit && kit.tips) { boxMat.uniforms.uColA.value.set('#ff2a3a').multiplyScalar(1.3); boxMat.uniforms.uColC.value.set('#ffd2c8'); }
      pilMat.uniforms.uColA.value.copy(pal.b); pilMat.uniforms.uColC.value.copy(pal.a);
      shardMat.color.copy(pal.a);
      dustMat.color.copy(pal.a).multiplyScalar(0.7);
      rings.forEach(r => { if (!r.userData.gone) r.material.color.copy(r.userData.alt ? pal.c : pal.a).multiplyScalar(1.8); });
      bloom.strength = pal.bloom * 0.75;
    }
    function scatter(n, power) {
      for (let k = 0; k < n; k++) { const b = blocks[Math.floor(Math.random() * N)]; if (b.mode === 0) knock(b, false, power); }
    }

    // ---------- attacks on the shared clock ----------
    function event(ev, netNow) {
      if (dead || evs.some(x => x.id === ev.id)) return;
      const t = nowS(), off = ms => t + (ms - netNow) / 1000;
      const x = { id: ev.id, type: ev.type === 'charge' ? 'slam' : ev.type, kind: ev.kind, s: off(ev.start), e: off(ev.end), started: false, hitDone: false };
      if (ev.type === 'slam' || ev.type === 'charge') { x.h = off(ev.hit); x.warned = 0; }
      if (ev.type === 'volley') x.shots = ev.shots.map(s => ({ id: s.id, l: off(s.launch), a: off(s.arrive), lane: s.lane, fired: false }));
      if (ev.type === 'adds') x.adds = ev.adds.map(a => ({ id: a.id, s: off(a.spawn), u: off(a.until), slot: a.slot, done: false }));
      if (ev.type === 'shield') x.u = off(ev.up);
      evs.push(x);
    }
    function freeShot() { return shots.find(s => !s.on) || shots[0]; }
    function runEvents(t) {
      for (let i = evs.length - 1; i >= 0; i--) {
        const x = evs[i];
        if (t > x.e + 0.5) { evs.splice(i, 1); continue; }
        if (x.side && !x.hitDone && flight) {
          if (t < x.h - 0.55) { flight.centre(x.side, x.at); x.at.y = 0; }
          if (!x.cutDone && t >= x.h - 0.4) { x.cutDone = true; if (Math.random() < 0.55) cutaway('over', 1.3, x); }
        }
        // a new attack at your squad cuts short one on another squad still winding up
        if (x.type === 'slam' && !x.side && !x.cutSide) { x.cutSide = true; for (const z of evs) if (z.side && !z.cut && t < z.h && x.s < z.e) z.cut = t; }
        if (x.type === 'slam' && t >= x.h && !x.hitDone) { x.hitDone = true; if (!x.cut || !x.side) impact(x); }
        if (x.type === 'volley') for (const s of x.shots) if (!s.fired && t >= s.l) {
          s.fired = true;
          if (t >= s.a) continue;
          const sh = freeShot();
          sh.on = true; sh.id = s.id; sh.launch = s.l; sh.arrive = s.a; sh.ret = -1; sh.lane = s.lane;
          partG[3].updateMatrixWorld();
          sh.from.set(2.1, -6.8, 0.8).applyMatrix4(armRG.matrixWorld).add(v1.set((s.lane - 1.5) * 1.4, (s.lane % 2) * 1.6, 0));
          sh.to.copy(aim).add(v1.set((s.lane - 1.5) * 1.6, 1.6 + (s.lane % 2) * 0.8, 0.5));
          sh.g.visible = true; sh.pos.copy(sh.from);
          burst(sh.from, 8, 5, CYAN);
        }
        if (x.type === 'adds') for (const a of x.adds) if (!a.done && t >= a.s) {
          a.done = true;
          if (t >= a.u) continue;
          const d = adds.find(z => !z.on) || adds[a.slot % ADDS];
          d.on = true; d.id = a.id; d.spawn = a.s; d.until = a.u; d.slot = a.slot % ADDS; d.dying = -1; d.k = 0;
          d.pos.copy(ADD_SLOTS[d.slot]).add(root.position);
          d.m.visible = true;
          v1.copy(CORE).add(root.position);
          for (let k = 0; k < 4; k++) burst(v1, 4, 6, AMBER, 1, 2, v2.copy(d.pos).sub(v1).normalize());
          scatter(6, 0.8);
        }
        if (x.type === 'shield' && !x.hitDone && t >= x.u) { x.hitDone = true; }
      }
    }
    function current(t, type) {
      let alt = null;
      for (const x of evs) if (x.type === type && t >= x.s && t <= x.e) { if (!x.side) return x; alt = alt || x; }
      return alt;
    }
    // an attack at your squad only
    function own(t) { for (const x of evs) if (x.type === 'slam' && !x.side && t >= x.s && t <= x.e) return x; return null; }

    // ---------- the boss goes after the other squads (Gid, 27 Nov 2026) ----------
    // Between your attacks it turns on a flank squad: it rushes them, fires the laser at them, sweeps
    // them or slams them. Each one ends one of three ways, and each looks different: they put a barrier
    // up and it smashes into it (the boss is thrown back), they scatter and it hits the floor, or it
    // lands and they're thrown, some down for a repair. These are their fight, so nothing here touches
    // your integrity or your words.
    const side = { next: 9, k: 2, seq: 0 };
    const SIDE_KINDS = ['lunge', 'laser', 'sweep', 'slam', 'lunge', 'laser', 'quake', 'scan', 'rain', 'grab'];
    function sideTick(t) {
      if (!flight || reduce || dead || SHOWN < ONSCREEN || t < side.next) return;
      const busy = evs.some(x => x.type === 'slam' && (x.side ? t < x.e : x.e > t - 0.5 && x.s < t + 4.5)) ||
        current(t, 'adds') || current(t, 'shield') || current(t, 'volley') || locks.some(l => t < l.h + 0.5) || t - roarAt < 2.6;
      if (busy) { side.next = t + 0.8; return; }
      side.k = side.k === 1 ? 2 : 1;
      const r = Math.random();
      sideAttack(side.k, SIDE_KINDS[Math.floor(Math.random() * SIDE_KINDS.length)], r < 0.36 ? 'block' : r < 0.7 ? 'dodge' : 'hit');
      side.next = t + rnd(6.5, 11) * (1 - phase * 0.07);
    }
    function sideAttack(k, kind, outcome) {
      if (!flight || dead) return;
      const t = nowS(), wind = kind === 'laser' ? 1.7 : kind === 'lunge' || kind === 'grab' ? 1.3 : kind === 'quake' || kind === 'rain' ? 1.7 : 1.5;
      const x = { id: 'side' + (++side.seq), type: 'slam', kind, side: k, s: t, h: t + wind, e: t + wind + 1.7, started: false, hitDone: false,
        at: flight.centre(k, new V()), outcome, cutDone: false };
      if (outcome === 'block') x.blocked = t + wind * rnd(0.35, 0.6);
      x.at.y = 0;
      evs.push(x);
    }
    function sideImpact(x) {
      const t = nowS(), at = x.at, col = x.outcome === 'block' ? CYAN : RED;
      if (x.outcome === 'block') {
        // it smashes into their barrier and is thrown back
        sideHitAt = t;
        v2.copy(root.position).sub(at).setY(0).normalize().multiplyScalar(3).add(at).setY(3);
        burst(v2, 60, 16, CYAN, 1.2, 4); burst(v2, 30, 12, WHITE, 1.4, 6);
        flare(v2, CYAN, 8, 0.3, canFlash() ? 1.1 : 0.5);
        wave(v1.copy(at).setY(0.3), 0.4, 12, 0.7, CYAN, 0.85);
        recoilV -= 1.6; jolt = Math.min(0.9, jolt + 0.5); headJerk = 1;
        shake = Math.max(shake, 0.35);
        if (flight) setTimeout(() => { if (!dead && flight) flight.sortie(x.side, nowS()); }, 250);   // and they hit back
      } else if (x.outcome === 'dodge') {
        // it hits the floor where they were
        burst(v1.copy(at).setY(0.6), 50, 12, RED, 1.5, 12); burst(v1, 24, 8, WHITE, 1.2, 10);
        wave(v1.copy(at).setY(0.2), 0.5, 15, 0.9, RED, 0.9);
        shake = Math.max(shake, 0.45);
      } else {
        // it lands: the squad is thrown and the hard ones flip; some go down for a repair
        const hard = x.kind !== 'sweep';
        for (const i of flight ? flight.members[x.side] : []) if (i < ONSCREEN) { knockAt[i] = t + Math.random() * 0.06; flight.knock(i, t, hard); }
        burst(v1.copy(at).setY(1.4), 70, 15, RED, 1.4, 9); burst(v1, 30, 10, WHITE, 1.4, 12);
        flare(v1, RED, 7, 0.26, canFlash() ? 1.1 : 0.5);
        wave(v1.copy(at).setY(0.2), 0.5, 18, 1.0, RED, 0.95);
        shake = Math.max(shake, 0.7); stopUntil = Math.max(stopUntil, performance.now() + 70);
      }
      if (x.kind === 'laser') { beamTo.copy(at).setY(1.6); beamLen = 0.8; beamW = 1.8; beamUntil = t + beamLen; }
      if (x.kind === 'sweep') { sweepT0 = t; sweepAt.copy(at); }
      if (kit && MOVE_KINDS.has(x.kind)) moveImpact(x, x.outcome === 'block');
      if (kit && (x.kind === 'slam' || x.kind === 'lunge')) {
        kit.group.updateMatrixWorld(true);
        for (const i of x.kind === 'slam' ? [0, 1] : [1]) { kit.fists[i].at.getWorldPosition(vF); vF.y = 0.2; wave(vF, 0.5, 16, 0.9, col, 0.9); burst(vF, 30, 12, WHITE, 1.6, 14); }
      }
    }

    // ---------- lock-ons: the boss aims at one bot in your squad (js/app/boss-squad.js) ----------
    // A red sight line from its eyes to the bot builds over the 4.5 s; then it fires. The bot either
    // rolls out of it (a dodge), a squad mate flies in front with a shield (a cover), or it's hit.
    const locks = [];
    function lock(who, ms) {
      const c = crew.find(x => x.id === who); if (!c || dead) return;
      const t = nowS();
      locks.push({ slot: c.slot, t0: t, h: t + Math.max(0.6, ms / 1000), outcome: null, by: -1, fired: false, rolled: false, at: new V() });
    }
    function lockFor(slot) { const t = nowS(); return locks.find(l => l.slot === slot && !l.fired && t < l.h + 0.2); }
    function impact(x) {
      if (x.side) { sideImpact(x); return; }
      const you = blocked.has(x.id) || frozen.has(x.id);
      const at = aim;
      if (x.cut) { act('you', 'cast'); return; }   // a broken charge: nothing lands
      shake = Math.max(shake, you ? 0.8 : 1.1);
      stopUntil = Math.max(stopUntil, performance.now() + (you ? 150 : 110));
      act('you', you ? 'cast' : 'hit');
      if (you) {
        // the blow hits your barrier: a cyan crack across it, sparks, and the boss thrown back
        const bt = nowS();
        barrierHitAt = bt;
        v2.copy(aim); v2.z -= 3; v2.y = 3;
        burst(v2, 70, 18, CYAN, 1.2, 4); burst(v2, 40, 14, WHITE, 1.4, 6);
        flare(v2, CYAN, 9, 0.3, canFlash() ? 1.3 : 0.6);
        wave(v1.copy(aim).setY(0.3), 0.4, 14, 0.7, CYAN, 0.9);
        if (!reduce) slowUntil = Math.max(slowUntil, performance.now() + 260);
        setTimeout(() => { if (!dead) stagger(); }, 90);
        play('block');
      }
      // the ones who didn't block it go flat
      { const t = nowS(), pk = (x.kind === 'charge' ? 0.8 : x.kind === 'slam' || x.kind === 'laser' ? 0.35 : 0.25) * (you ? 0.3 : 1);
        // with the bots flying, the ones too slow to dodge (decided when the hit got close) are the ones hit
        const late = flight ? flight.lateFor(x.id, pk) : null;
        for (let i = 0; i < ONSCREEN; i++) if (late ? late.has(i) : Math.random() < pk) { knockAt[i] = t + Math.random() * 0.08; if (flight) flight.knock(i, t, x.kind === 'charge' || x.kind === 'slam' || x.kind === 'laser'); }
        if (flight && !you) flight.knock(RAID, t, false); }
      if (kit) {
        // the blow lands where the fists are: rings and dust from each fist, chunks of armour
        // shaken loose, a flash, a held frame and a short slow-motion beat for the big ones
        kit.group.updateMatrixWorld(true);
        const which = x.kind === 'slam' || x.kind === 'quake' ? [0, 1] : x.kind === 'beam' || x.kind === 'laser' || x.kind === 'scan' || x.kind === 'rain' ? [] : [1];
        const col = you ? CYAN : RED;
        for (const i of which) {
          kit.fists[i].at.getWorldPosition(vF); vF.y = 0.2;
          wave(vF, 0.5, x.kind === 'slam' || x.kind === 'quake' ? 26 : 16, 1.0, col, 0.95);
          wave(vF, 0.3, x.kind === 'slam' ? 11 : 8, 0.5, WHITE, 0.85);
          burst(vF, 46, 15, WHITE, 1.7, 14);
          burst(vF, 26, 10, col, 1.3, 9);
          flare(vG.copy(vF).setY(1.2), col, x.kind === 'slam' ? 6 : 4.5, 0.22, canFlash() ? 1.2 : 0.6);
        }
        let n = 0;
        for (const b of blocks) { if (n >= (x.kind === 'slam' ? 10 : 5)) break; if (b.mode === 0 && (b.part >= 2 || x.kind === 'slam') && Math.random() < 0.2) { knock(b, false, 1.7); n++; } }
        if (x.kind === 'slam') { shake = Math.max(shake, you ? 0.5 : 1.35); if (!reduce) slowUntil = performance.now() + 380; }
        if (x.kind === 'lunge' || x.kind === 'sweep') shake = Math.max(shake, you ? 0.45 : 1.05);
        if (x.kind === 'beam' || x.kind === 'laser') { flare(vG.copy(at).setY(2), col, 7, 0.28, canFlash() ? 1.2 : 0.6); burst(vG, 60, 16, col, 1.5, 9); }
        if (MOVE_KINDS.has(x.kind)) moveImpact(x, you);
        stopUntil = Math.max(stopUntil, performance.now() + (x.kind === 'slam' ? 120 : 80));
      }
      if (!kit && (x.kind === 'slam' || x.kind === 'lunge')) wave(root.position, 2, 34, 1.3, you ? CYAN : RED, 0.9);
      if (you) { burst(v1.copy(at).setY(2), 30, 9, CYAN, 1.2, 6); flare(v1, CYAN, 6, 0.3, canFlash() ? 1.2 : 0.6); }
      else burst(v1.copy(at).setY(1), 24, 7, RED, 1, 9);
      if (x.kind === 'beam' || x.kind === 'laser') beamTo.copy(aim);
      if (x.kind === 'sweep') sweepAt.copy(aim);
      if (x.kind === 'beam') { beamLen = 0.55; beamW = 0.9; beamUntil = nowS() + beamLen; }
      if (x.kind === 'laser') { beamLen = 0.9; beamW = 2.2; beamUntil = nowS() + beamLen; shake = Math.max(shake, you ? 0.5 : 1.2); }
      if (x.kind === 'charge') { shake = Math.max(shake, 1.7); stopUntil = Math.max(stopUntil, performance.now() + 160); if (!reduce) slowUntil = performance.now() + 500; }
      if (x.kind === 'sweep') { sweepT0 = nowS(); }
      stopUntil = Math.max(stopUntil, performance.now() + (you ? 80 : 50));
    }
    let beamUntil = 0, sweepT0 = -9, beamLen = 0.55, beamW = 0.9, barrierHitAt = -9, sideHitAt = -9;
    const beamTo = new V(), sweepAt = new V();
    // a second barrier for a flank squad's block, and the lock-on's sight line, shot and cover shield
    const barrier2Mat = keep(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const barrier2 = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 6)), barrier2Mat);
    barrier2.add(new THREE.Mesh(keep(new THREE.RingGeometry(0.92, 1, 6)), barrier2Mat));
    barrier2.visible = false; scene.add(barrier2);
    const sightGeo = keep(new THREE.BufferGeometry()); sightGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const sightMat = keep(new THREE.LineBasicMaterial({ color: C('#ff4d5e', 2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const sight = new THREE.Line(sightGeo, sightMat); sight.frustumCulled = false; sight.visible = false; scene.add(sight);
    const sightRing = new THREE.Mesh(keep(new THREE.RingGeometry(0.75, 0.9, 40)), keep(new THREE.MeshBasicMaterial({ color: C('#ff4d5e', 2), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    sightRing.visible = false; scene.add(sightRing);
    const zapMat = keep(new THREE.MeshBasicMaterial({ color: C('#ff6a3d', 2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const zap = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)), zapMat); zap.visible = false; scene.add(zap);
    const zapFrom = new V(), zapTo = new V(); let zapAt = -9;
    const bubbleMat = keep(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 1.4), transparent: true, opacity: 0, wireframe: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const bubble = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(1, 1)), bubbleMat); bubble.visible = false; scene.add(bubble);
    function lockTick(t, dt) {
      let shown = null;
      for (let i = locks.length - 1; i >= 0; i--) {
        const l = locks[i], p = raidPos[l.slot];
        if (t > l.h + 0.7) { locks.splice(i, 1); continue; }
        if (!l.fired) {
          if (t < l.h - 0.3) l.at.copy(p);
          if (l.outcome === 'dodge' && !l.rolled && t >= l.h - 0.28 && flight) { l.rolled = true; flight.roll(l.slot, t); const dc = crew.find(x => x.slot === l.slot); if (dc) dc.op.once('dodge'); if (l.slot === RAID) play('dodge'); }
          if (t >= l.h) {
            l.fired = true; zapAt = t; zapFrom.copy(anchorHead);
            if (l.outcome === 'cover') {
              // into the shield: it stops short and splashes
              zapTo.copy(p).lerp(root.position, 0.16); zapTo.y = p.y;
              burst(zapTo, 40, 12, CYAN, 1.2, 4); flare(zapTo, CYAN, 5, 0.25, canFlash() ? 1 : 0.5);
            } else if (l.outcome === 'dodge') {
              // where it was a moment ago: the floor behind takes it
              zapTo.copy(l.at); zapTo.y = 0.3;
              burst(zapTo, 30, 10, RED, 1.4, 12); wave(v1.copy(zapTo).setY(0.15), 0.4, 6, 0.6, RED, 0.8);
            } else {
              zapTo.copy(p);
              burst(zapTo, 40, 13, RED, 1.3, 9); flare(zapTo, RED, 5, 0.24, canFlash() ? 1.1 : 0.5);
              if (flight) flight.knock(l.slot, t, true);
              if (l.slot < ONSCREEN) knockAt[l.slot] = t;
              shake = Math.max(shake, l.slot === RAID ? 0.6 : 0.3);
            }
          }
        }
        if (!shown || l.h < shown.h) shown = l;
      }
      // the sight line on the nearest lock-on
      const l = shown && !shown.fired ? shown : null;
      sight.visible = sightRing.visible = !!l;
      if (l) {
        const p = raidPos[l.slot], u = clamp((t - l.t0) / (l.h - l.t0), 0, 1);
        const a = sightGeo.attributes.position.array;
        a[0] = anchorHead.x; a[1] = anchorHead.y - 1.2; a[2] = anchorHead.z; a[3] = p.x; a[4] = p.y; a[5] = p.z;
        sightGeo.attributes.position.needsUpdate = true;
        sightMat.opacity = (0.25 + 0.65 * u) * (u > 0.75 && !reduce ? 0.55 + 0.45 * Math.sin(t * 38) : 1);
        sightRing.position.copy(p); sightRing.quaternion.copy(camera.quaternion);
        sightRing.scale.setScalar(2.4 - 1.3 * ease(u)); sightRing.rotateZ(t * 3);
        sightRing.material.opacity = 0.4 + 0.5 * u;
      }
      // the shot: a quick thick beam that thins out
      const zu = (t - zapAt) / 0.28;
      zap.visible = zu >= 0 && zu < 1;
      if (zap.visible) {
        v1.copy(zapTo).sub(zapFrom); const len = v1.length();
        zap.position.copy(zapFrom).addScaledVector(v1, 0.5); zap.quaternion.setFromUnitVectors(v2.set(0, 1, 0), v1.normalize());
        const r = 0.45 * (1 - zu) + 0.05; zap.scale.set(r, len, r); zapMat.opacity = 0.95 * (1 - zu);
      }
      // the cover shield round a covered bot, from the cover until just after the shot
      const cv = locks.find(z => z.outcome === 'cover' && t < z.h + 0.35);
      bubble.visible = !!cv;
      if (cv) {
        const p = raidPos[cv.slot], hu = t - cv.h;
        bubble.position.copy(p); bubble.rotation.set(t * 0.7, t * 1.1, 0);
        bubble.scale.setScalar(1.9 + (hu > 0 ? 0.8 * hu / 0.35 : 0.08 * Math.sin(t * 9)));
        bubbleMat.opacity = hu > 0 ? 0.9 * (1 - hu / 0.35) : Math.min(0.55, (t - cv.coverAt) * 3);
      }
    }
    // ---------- Syntax Error's new attacks (Gid, 28 Nov 2026: "more actions and attacks that are properly animated") ----------
    // Four more block attacks, each with its own wind-up, telegraph, strike, effects and sound. They are
    // kinds of the slam (boss-rules.js), so each one is a real attack: a red lit word in your line with its
    // timer, the barrier when you block it, the integrity pip when it lands, and the flank squads get them too.
    //   quake  segfault:    it rises into the air with both fists cocked behind its head, then drops and
    //                       pounds the floor; a wall of red light runs out across the arena; rings ripple
    //                       out from under it through the wind-up
    //   scan   scan line:   arms flung back, the visor charges, a red line traces across the floor in front of
    //                       the squad; then a beam from the visor sweeps along it and burns a streak
    //   rain   code rain:   one claw raised, red code gathers in the air above the squad and targets light up
    //                       on the floor round them one by one; the claw drops and it rains down on them
    //   grab   memory grab: it rears back with the claw thrown wide and red lines run from its talons to the
    //                       squad; then it lunges in and the claw closes on them, crushing, crackling red
    const MOVE_KINDS = new Set(['quake', 'scan', 'rain', 'grab']);
    const snd = (n, a) => { if (opts.onSfx) opts.onSfx(n, a); };
    // floor scorch and cracks: one instanced mesh, glowing red when fresh and cooling to a dark mark
    const decalCv = document.createElement('canvas'); decalCv.width = decalCv.height = 256;
    {
      const g = decalCv.getContext('2d'), c = 128;
      const sc = g.createRadialGradient(c, c, 0, c, c, c); sc.addColorStop(0, 'rgba(0,0,0,0.9)'); sc.addColorStop(0.55, 'rgba(0,0,0,0.5)'); sc.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sc; g.fillRect(0, 0, 256, 256);
      // cracks in the red channel: jagged lines out from the middle, with forks
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,0,0,1)'; g.lineCap = 'round';
      const arm = (x, y, a, len, w, depth) => {
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { a += rnd(-0.5, 0.5); x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; g.lineTo(x, y); if (depth && Math.random() < 0.3) arm(x, y, a + rnd(-1, 1), len * 0.45, w * 0.6, depth - 1); }
        g.stroke();
      };
      for (let i = 0; i < 9; i++) arm(c, c, i / 9 * Math.PI * 2 + rnd(-0.2, 0.2), rnd(70, 118), 3.2, 2);
    }
    const decalTex = keep(new THREE.CanvasTexture(decalCv));
    const DEC = 16, decalGeo = keep(new THREE.PlaneGeometry(1, 1));
    decalGeo.rotateX(-Math.PI / 2);
    const decHeat = new THREE.InstancedBufferAttribute(new Float32Array(DEC), 1), decFade = new THREE.InstancedBufferAttribute(new Float32Array(DEC), 1);
    decHeat.setUsage(THREE.DynamicDrawUsage); decFade.setUsage(THREE.DynamicDrawUsage);
    decalGeo.setAttribute('aHeat', decHeat); decalGeo.setAttribute('aFade', decFade);
    const decalMat = keep(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: decalTex }, uCol: { value: C('#ff3322', 3) } },
      vertexShader: `attribute float aHeat; attribute float aFade; varying vec2 vUv; varying float vH; varying float vF;
        void main(){ vUv = uv; vH = aHeat; vF = aFade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; varying vec2 vUv; varying float vH; varying float vF;
        void main(){ vec4 t = texture2D(uMap, vUv); float glow = t.r * vH; float a = clamp(t.a * 0.75 + glow, 0.0, 1.0) * vF; if (a < 0.01) discard;
          gl_FragColor = vec4(uCol * glow * (0.6 + 0.4 * vH) + vec3(0.02, 0.004, 0.004) * (1.0 - glow), a); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    const decals = new THREE.InstancedMesh(decalGeo, decalMat, DEC); decals.frustumCulled = false; decals.renderOrder = -1;
    scene.add(decals);
    const decData = Array.from({ length: DEC }, () => ({ at: new V(), t: -99, size: 1, rot: 0, sx: 1, life: 7 }));
    let decI = 0;
    function decal(at, size, rot = rnd(0, 6.28), stretch = 1, life = 7) { if (detail <= 0.45) return; const d = decData[decI = (decI + 1) % DEC]; d.at.set(at.x, 0.04 + decI * 0.002, at.z); d.t = nowS(); d.size = size; d.rot = rot; d.sx = stretch; d.life = life; }
    function decalTick(t) {
      for (let i = 0; i < DEC; i++) {
        const d = decData[i], u = t - d.t;
        if (u > d.life || u < 0) { m4.makeScale(0, 0, 0); decals.setMatrixAt(i, m4); decHeat.array[i] = 0; decFade.array[i] = 0; continue; }
        q.setFromAxisAngle(dY, d.rot); sc.set(d.size * d.sx, 1, d.size);
        m4.compose(d.at, q, sc); decals.setMatrixAt(i, m4);
        decHeat.array[i] = Math.max(0, 1 - u / 2.2) ** 1.5 * (0.85 + 0.15 * Math.sin(t * 30 + i));
        decFade.array[i] = Math.min(1, u * 12) * (u > d.life - 1.5 ? (d.life - u) / 1.5 : 1);
      }
      decals.instanceMatrix.needsUpdate = true; decHeat.needsUpdate = true; decFade.needsUpdate = true;
    }
    // the segfault's wall of light: an open cylinder that runs out across the floor, bright at the bottom
    const wallsMat = keep(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: C('#ff3322', 2.4) }, uA: { value: 0 }, uT: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA; uniform float uT; varying vec2 vUv; varying vec3 vW;
        void main(){ float f = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2); float n = 0.65 + 0.35 * sin(vUv.x * 120.0 + uT * 20.0) * sin(vUv.x * 37.0 - uT * 9.0);
          float a = f * n * uA; gl_FragColor = vec4(uCol * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const wallGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 72, 1, true)); wallGeo.translate(0, 0.5, 0);
    const qWalls = [0, 1].map(() => { const m = new THREE.Mesh(wallGeo, wallsMat.clone()); keep(m.material); m.visible = false; scene.add(m); return { m, t: -9, at: new V(), col: RED, r1: 30, life: 1.1 }; });
    let qwI = 0;
    function quakeWall(at, col, r1 = 32, life = 1.1) { const w = qWalls[qwI = (qwI + 1) % 2]; w.at.set(at.x, 0, at.z); w.t = nowS(); w.col = col; w.r1 = r1; w.life = life; w.m.material.uniforms.uCol.value.copy(col).multiplyScalar(1.5); }
    // code rain: streaks that fall on the targets, and the targets on the floor
    const RS = 28;
    const rainMat = keep(new THREE.MeshBasicMaterial({ color: C('#ff3a3a', 2.6), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const rainMesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.24, 3.6, 0.24)), rainMat, RS); rainMesh.frustumCulled = false; scene.add(rainMesh);
    const retMesh = new THREE.InstancedMesh(keep(new THREE.RingGeometry(0.8, 1.0, 40)), keep(new THREE.MeshBasicMaterial({ color: C('#ff4d5e', 1.8), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })), 10);
    retMesh.frustumCulled = false; scene.add(retMesh);
    // guide lines: the scan line's path across the floor, and the grab's lines from its talons to the squad
    const guideGeo = keep(new THREE.BufferGeometry()); guideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const guideMat = keep(new THREE.LineBasicMaterial({ color: C('#ff4d5e', 2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const guide = new THREE.LineSegments(guideGeo, guideMat); guide.frustumCulled = false; scene.add(guide);
    // the scan line's beam from the visor, and the hot spot where it touches the floor
    const scanMat = keep(new THREE.MeshBasicMaterial({ color: C('#ff4a3a', 2.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const scanBeam = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)), scanMat); scanBeam.visible = false; scene.add(scanBeam);
    const scanCore = new THREE.Mesh(scanBeam.geometry, keep(new THREE.MeshBasicMaterial({ color: C('#ffffff', 2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    scanBeam.add(scanCore); scanCore.scale.set(0.35, 1, 0.35);
    const scanHot = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: C('#ff5a3a', 2.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false })));
    scanHot.visible = false; scene.add(scanHot);
    const mvD = new V(), mvP = new V(), mvA = new V(), mvB = new V(), mvC = new V();
    // the squad's side of the attack: the target, the direction from the boss to it, and across it
    function frameOf(x) { const ta = x.at || aim; mvD.set(ta.x - root.position.x, 0, ta.z - root.position.z).normalize(); mvP.set(mvD.z, 0, -mvD.x); return ta; }
    function scanPoint(x, u, out) { const ta = frameOf(x); return out.copy(ta).addScaledVector(mvD, -1.2).addScaledVector(mvP, -13 + 26 * u).setY(0.15); }
    // where each code-rain streak lands: seeded on the attack so a replay looks the same
    function rainPts(x) {
      if (x.pts) return x.pts;
      const ta = frameOf(x), r = WorldBossRules.rng(String(x.id)), pts = [];
      for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = i === 0 ? 0 : 2 + r() * 5.5; pts.push(new V(ta.x + Math.cos(a) * d * 1.3, 0.1, ta.z + Math.sin(a) * d * 0.8)); }
      return (x.pts = pts);
    }
    // the visor's world position, and the talons of the right claw
    function visorAt(out) { kit.bones.head.updateWorldMatrix(true, false); return out.set(0, 1.0, 1.4).applyMatrix4(kit.bones.head.matrixWorld); }
    let liftY = 0, headSweep = 0;
    function movesTick(t, dt) {
      let gi = 0, rn = 0, rt = 0, scanOn = false;
      const ga = guideGeo.attributes.position.array;
      const line = (a, b) => { if (gi >= 12) return; ga.set([a.x, a.y, a.z, b.x, b.y, b.z], gi * 6); gi++; };
      let gOp = 0;
      liftY = 0; headSweep = 0;
      for (const x of evs) {
        if (x.type !== 'slam' || !MOVE_KINDS.has(x.kind) || dead) continue;
        const w = clamp((t - x.s) / Math.max(0.3, x.h - x.s), 0, 1), after = t - x.h, cutk = x.cut ? 0 : 1;
        // the wind-up sound is for attacks at you; a flank squad's fight only gets its landing
        if (!x.sndWind && t >= x.s) { x.sndWind = true; if (!x.side) snd(x.kind + 'Wind', Math.max(0.5, x.h - t)); }
        if (!x.sndHit && t >= x.h - (x.kind === 'scan' ? 0.25 : x.kind === 'rain' ? 0.12 : 0) && !x.cut) { x.sndHit = true; snd(x.kind + 'Hit', !!(x.side ? x.outcome === 'block' : blocked.has(x.id))); }
        const ta = frameOf(x), mine = !x.side;
        if (x.kind === 'quake') {
          // up into the air through the wind-up, then down onto the floor in a tenth of a second
          if (after < 0) liftY = Math.max(liftY, 4.2 * ease(w) * cutk + Math.sin(t * 9) * 0.08 * w);
          else liftY = Math.max(liftY, after < 0.1 ? 4.2 * (1 - easeIn(after / 0.1)) - 1.4 * easeIn(after / 0.1) : -1.4 * (1 - smooth(clamp((after - 0.5) / 0.9, 0, 1))));
          // rings ripple out from under it, faster as the drop gets close
          if (after < 0 && !x.cut) { const every = 0.55 - 0.3 * w; if (t - (x.ripAt || 0) > every) { x.ripAt = t; wave(root.position, 1.5, 10 + 12 * w, 0.9, RED, 0.25 + 0.4 * w); } }
        } else if (x.kind === 'scan') {
          // the path across the floor, with a spark running along it, then the beam sweeping it
          const u0 = x.h - 0.25, su = (t - u0) / 0.6;
          if (after < 0.4 && !x.cut) {
            scanPoint(x, 0, mvA); scanPoint(x, 1, mvB); line(mvA, mvB);
            gOp = Math.max(gOp, (0.25 + 0.6 * w) * (w > 0.8 && !reduce ? 0.6 + 0.4 * Math.sin(t * 40) : 1) * (su < 0 ? 1 : Math.max(0, 1 - su)));
            if (su < 0 && Math.random() < dt * 14) burst(scanPoint(x, (t * 0.8) % 1, mvC), 2, 3, RED, 0.6, 4);
          }
          headSweep = su < 0 ? -0.65 * ease(w) : su < 1 ? -0.65 + 1.3 * smooth(su) : 0.65 * (1 - smooth(clamp((su - 1) / 1.5, 0, 1)));
          if (su >= 0 && su < 1 && !x.cut) {
            scanOn = true;
            const blk = x.side ? x.outcome === 'block' : blocked.has(x.id) || frozen.has(x.id);
            const at = scanPoint(x, smooth(su), mvC);
            visorAt(mvA);
            if (blk) { mvB.copy(at).sub(mvA); const dd = mvB.length(); at.copy(mvA).addScaledVector(mvB.normalize(), dd * 0.86); }
            v1.copy(at).sub(mvA); const len = v1.length();
            scanBeam.position.copy(mvA).addScaledVector(v1, 0.5); scanBeam.quaternion.setFromUnitVectors(v2.set(0, 1, 0), v1.normalize());
            const r = 0.32 + 0.12 * Math.sin(t * 50);
            scanBeam.scale.set(r, len, r); scanMat.opacity = 0.85; scanCore.material.opacity = 0.9;
            scanMat.color.copy(blk ? CYAN : RED).multiplyScalar(1.6);
            scanHot.position.copy(at); scanHot.scale.setScalar(4 + Math.random()); scanHot.material.opacity = 0.9; scanHot.material.color.copy(blk ? CYAN : RED);
            if (Math.random() < 0.8) burst(at, 3, 7, Math.random() < 0.4 ? WHITE : (blk ? CYAN : RED), 1.4, 9);
            if (!blk && t - (x.decAt || 0) > 0.07) { x.decAt = t; decal(at, 2.6, Math.atan2(mvP.x, mvP.z) + Math.PI / 2, 1.6, 6); }
          }
        } else if (x.kind === 'rain') {
          // targets light up one by one; streaks gather overhead; at the hit they fall in a quick barrage
          const pts = rainPts(x);
          if (after < 0.7 && !x.cut) for (let i = 0; i < pts.length && rt < 10; i++) {
            const on = clamp((w - i / pts.length * 0.7) * 4, 0, 1);
            const fallAt = x.h - 0.12 + i * 0.05, gone = t > fallAt + 0.15;
            if (on <= 0 || gone) continue;
            m4.compose(v1.copy(pts[i]).setY(0.08), q.setFromEuler(e3.set(-Math.PI / 2, 0, t * 2 + i)), sc.setScalar((1.8 - 0.6 * w) * ease(on) + (w > 0.85 && !reduce ? 0.15 * Math.sin(t * 30) : 0)));
            retMesh.setMatrixAt(rt++, m4);
          }
          if (!x.cut) for (let i = 0; i < pts.length; i++) {
            const fallAt = x.h - 0.12 + i * 0.05, fu = (t - fallAt) / 0.16;
            if (fu > 1 && !x['r' + i]) {
              x['r' + i] = true;
              const blk = x.side ? x.outcome === 'block' : blocked.has(x.id) || frozen.has(x.id);
              const p = v1.copy(pts[i]); if (blk && mine) { p.lerp(v2.copy(aim).setY(3.2), 0.0); p.y = 5; }
              burst(p, 10, 9, blk ? CYAN : RED, 1.4, 10); burst(p, 4, 6, WHITE, 1.2, 10);
              wave(p, 0.3, 3.5, 0.45, blk ? CYAN : RED, 0.8);
              if (!blk) decal(p, 2.2, rnd(0, 6.28), 1, 5);
            }
            if (rn >= RS) break;
            const gather = w > 0.3 && fu < 1, hi = 13 + (i % 3) * 1.6;
            if (!gather) continue;
            const y = fu < 0 ? hi + Math.sin(t * 3 + i) * 0.8 : hi + (0.6 - hi) * easeIn(fu);
            const blk = x.side ? x.outcome === 'block' : blocked.has(x.id);
            const yy = blk && mine ? Math.max(y, 5.5) : y;
            m4.compose(v1.set(pts[i].x + Math.sin(i * 7.1) * (fu < 0 ? 0.5 : 0), yy, pts[i].z), q.identity(), sc.set(1, fu < 0 ? 0.5 + 0.5 * w : 1.4, 1));
            rainMesh.setMatrixAt(rn++, m4);
          }
        } else if (x.kind === 'grab') {
          // lines from the open talons to the squad through the wind-up
          if (after < 0 && !x.cut && w > 0.15) {
            kit.fists[1].at.getWorldPosition(mvA);
            for (let k = 0; k < 4; k++) { mvB.copy(mvA).add(v1.set((k - 1.5) * 0.9, -0.8 + (k % 2) * 0.6, 0.4)); mvC.copy(ta).add(v2.set((k - 1.5) * 0.7, 1.2, 0)); line(mvB, mvC); }
            gOp = Math.max(gOp, (0.15 + 0.6 * w) * (w > 0.8 && !reduce ? 0.55 + 0.45 * Math.sin(t * 36) : 1));
          }
          // the crush: red arcs crackle in the closed claw for half a second after it lands
          if (after > 0 && after < 0.6 && !x.cut && kit.arcs && !reduce && Math.random() < 0.7) {
            kit.fists[1].at.getWorldPosition(mvA);
            kit.arcs.add(mvA, v1.copy(mvA).add(v2.set(rnd(-3, 3), rnd(-3, 1), rnd(-3, 3))), 0.08, 0.7, 7);
          }
        }
      }
      for (let i = gi; i < 12; i++) ga.fill(0, i * 6, i * 6 + 6);
      guideGeo.attributes.position.needsUpdate = true; guideGeo.setDrawRange(0, gi * 2);
      guideMat.opacity = gOp; guide.visible = gi > 0 && gOp > 0.01;
      for (let i = rn; i < RS; i++) { m4.makeScale(0, 0, 0); rainMesh.setMatrixAt(i, m4); }
      for (let i = rt; i < 10; i++) { m4.makeScale(0, 0, 0); retMesh.setMatrixAt(i, m4); }
      rainMesh.instanceMatrix.needsUpdate = true; retMesh.instanceMatrix.needsUpdate = true;
      rainMesh.visible = rn > 0; retMesh.visible = rt > 0;
      if (!scanOn) { scanMat.opacity = Math.max(0, scanMat.opacity - dt * 6); scanCore.material.opacity = scanMat.opacity; scanHot.material.opacity = scanMat.opacity; }
      scanBeam.visible = scanHot.visible = scanMat.opacity > 0.01;
      // the segfault's walls
      for (const w of qWalls) {
        const u = (t - w.t) / w.life;
        w.m.visible = u >= 0 && u < 1;
        if (!w.m.visible) continue;
        const r = 2 + (w.r1 - 2) * ease(u);
        w.m.position.copy(w.at); w.m.scale.set(r, 6 * (1 - u * 0.55), r);
        w.m.material.uniforms.uA.value = (1 - u) * 1.3; w.m.material.uniforms.uT.value = t;
      }
      decalTick(t);
    }
    // the strike landing, for the new kinds: on top of what impact() does for every attack
    function moveImpact(x, you) {
      const col = you ? CYAN : RED, ta = frameOf(x);
      if (x.kind === 'quake') {
        kit.group.updateMatrixWorld(true);
        quakeWall(root.position, col, you ? 14 : 34, you ? 0.7 : 1.15);
        for (const i of [0, 1]) {
          kit.fists[i].at.getWorldPosition(vF); vF.y = 0.2;
          if (!you) decal(vF, 11, rnd(0, 6.28), 1, 8);
          if (dress) dress.puff(vF, 14, 1.4);
          flare(vG.copy(vF).setY(1.5), col, 9, 0.3, canFlash() ? 1.3 : 0.6);
        }
        lightPulse(vF.setY(2.5), col, 1.2);
        scatter(36, 1.7);
        shake = Math.max(shake, you ? 0.7 : 1.5);
        if (!reduce) slowUntil = Math.max(slowUntil, performance.now() + 300);
        if (!x.side) wave(null, you ? 0.5 : 1.1);
      } else if (x.kind === 'grab') {
        kit.fists[1].at.getWorldPosition(vF);
        if (!you) { decal(v1.copy(ta), 7, rnd(0, 6.28), 1, 7); if (dress) dress.puff(v1.copy(ta).setY(0.5), 8, 0.9); }
        burst(vF, 50, 14, col, 1.3, 8);
        shake = Math.max(shake, you ? 0.5 : 1.1);
      } else if (x.kind === 'rain') {
        shake = Math.max(shake, you ? 0.35 : 0.8);
      } else if (x.kind === 'scan') {
        shake = Math.max(shake, you ? 0.3 : 0.7);
      }
    }
    // your block's barrier: a cyan disc in front of the raid from the block until the blow lands on it
    const barrierMat = keep(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const barrier = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 6)), barrierMat);
    barrier.visible = false; scene.add(barrier);
    const barrierRim = new THREE.Mesh(keep(new THREE.RingGeometry(0.92, 1, 6)), barrierMat);
    barrier.add(barrierRim);

    // ---------- hits ----------
    const hitQueue = [];
    function pickBlock(region) {
      for (let k = 0; k < 16; k++) {
        const i = Math.floor(Math.random() * N), b = blocks[i];
        if (b.mode !== 0) continue;
        if (region && b.part !== 0 && Math.random() < 0.6) continue;
        return i;
      }
      return -1;
    }
    function raiderIndex(id) { const n = /^sim(\d+)$/.exec(id || ''); if (n) return +n[1] % RAID; let h = 7; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % RAID; }
    function hit(h) {
      if (dead) { if (opts.onImpact) opts.onImpact(h, null, null); return; }
      const you = h.you;
      if (!you && h.id) { act(h.id, 'type'); if (Math.random() < 0.25) act(h.id, 'cast'); }
      if (you && h.kind === 'return') {
        // the returned word itself is the bolt, so this only lands a little later
        hitQueue.push({ h, at: nowS() + 0.45 });
        return;
      }
      if (h.kind === 'spell') {
        // the spell's own effect shows the hit, so only the number appears, near the core
        if (opts.onImpact) {
          v3.copy(anchorCore).add(v1.set(rnd(-3, 3), rnd(-2, 3.5), 1)).project(camera);
          opts.onImpact(h, (v3.x * 0.5 + 0.5) * host.clientWidth, (-v3.y * 0.5 + 0.5) * host.clientHeight);
        }
        return;
      }
      if (you && fx && h.tier >= 1 && h.kind === 'word') {
        // combo tiers fire their own shot: charged bolt, twin beam, rail shot, overload
        const ti = h.weak && !shieldF ? -2 : pickBlock(true);
        const sh = !!h.shield && shieldF !== null;
        const from = gun(new V()) || new V().copy(raidPos[RAID]).setY(raidPos[RAID].y + 0.6);
        fx.shot(Math.min(4, h.tier), from, out => aimAt(ti, sh, from, out), at => land(h, at, ti), { color: h.color, kb: youKb() });
        markGlow[RAID] = 1;
        return;
      }
      const ri = you ? RAID : raiderIndex(h.id);
      const b = bolts[boltI = (boltI + 1) % BOLTS];
      b.on = true; b.h = h; b.t = 0;
      b.from.copy(raidPos[ri]).setY(raidPos[ri].y + 0.4);
      if (flight && !you && ri < ONSCREEN && Math.random() < (h.tier >= 1 ? 0.5 : 0.12)) flight.strafe(ri, nowS());
      b.target = h.weak && !shieldF ? -2 : pickBlock(you);
      b.shield = !!h.shield && shieldF !== null;
      b.dur = you ? 0.17 : rnd(0.16, 0.24);
      const big = h.crit || h.weak || h.kind === 'block';
      const ot = !you && h.tier >= 1 && window.Combat ? Combat.TIERS[Math.min(h.tier, Combat.TIERS.length - 1)] : null;
      b.w = you ? (big ? 0.34 : 0.22) : 0.055 + (ot ? 0.03 * h.tier : 0);
      b.tail = you ? 0.4 : 0.16 + (ot ? 0.05 * h.tier : 0);
      if (ot && ot.color) b.col.set(ot.color).multiplyScalar(1.6 + 0.15 * h.tier);
      else b.col.copy(you ? (big ? WHITE : youCol) : raidCol(ri)).multiplyScalar(you ? 2.2 : 1.05);
      markGlow[ri] = 1;
    }
    // where a tier shot lands: its block, the core, or the shield's shell in front of them
    function aimAt(ti, sh, from, out) {
      if (ti >= 0 && blocks[ti].mode === 0) attachPos(blocks[ti], out); else out.copy(anchorCore);
      if (sh && shieldF !== null) clipShell(from, out);
      return out;
    }
    function clipShell(from, to) {
      v1.copy(to).sub(from);
      const len = v1.length(); v1.divideScalar(len);
      const c0 = shield.position;
      let lo = 0, hi = len;
      for (let it = 0; it < 12; it++) {
        const m = (lo + hi) / 2;
        p.copy(from).addScaledVector(v1, m).sub(c0);
        ((p.x / 11.5) ** 2 + (p.y / 10.5) ** 2 + (p.z / 7.5) ** 2 > 1) ? (lo = m) : (hi = m);
      }
      return to.copy(from).addScaledVector(v1, lo);
    }
    // the boss's reaction to big hits and spells
    function react(kind, power = 0, extra) {
      if (dead) return;
      const t = nowS();
      if (kind === 'flinch') {
        recoilV -= Math.min(0.8, 0.12 + power * 0.008);
        hitGlow = Math.max(hitGlow, calm ? 0.25 : 0.45);
        scatter(Math.min(6, 1 + Math.floor(power / 15)), 0.8);
      } else if (kind === 'stagger') {
        stagger();
        if (canFlash()) hitGlow = calm ? 0.5 : 1;
      } else if (kind === 'flash') {
        if (canFlash()) hitGlow = calm ? 0.5 : 1;
        recoilV -= 0.3;
      } else if (kind === 'break') {
        // the phase-break pose: thrown back with its arms flung out and blocks flying
        breakAt = t; recoilV -= 3.2; headJerk = 1;
        scatter(90, 1.8);
        shake = Math.max(shake, 1);
        if (canFlash()) hitGlow = 1;
        burst(anchorCore, 60, 14, WHITE);
        wave(root.position, 1, 26, 1.2, WHITE, 0.8);
      } else if (kind === 'stun') {
        stunUntil = t + power / 1000; headJerk = 1;
      } else if (kind === 'freeze') {
        freezeUntil = t + power / 1000;
      } else if (kind === 'pull' && extra) {
        // blocks torn off toward the black hole, then they fly back into place
        for (let k = 0; k < 12; k++) {
          const b = blocks[Math.floor(Math.random() * N)];
          if (b.mode !== 0) continue;
          knock(b, false, 0.5);
          b.vel.copy(extra).sub(b.wp).normalize().multiplyScalar(rnd(6, 12));
          b.grav = 0.05; b.life = rnd(0.5, 0.9);
        }
        recoilV -= 0.25;
      }
    }
    function targetPos(b, out) {
      if (b.target === -2 || b.target < 0) return out.copy(anchorCore);
      return attachPos(blocks[b.target], out);
    }
    function land(h, at, target) {
      const you = h.you;
      const big = h.crit || h.weak || h.kind === 'block' || h.kind === 'return';
      if (h.shield) {
        shieldMat.uniforms.uRip.value[ripI = (ripI + 1) % 4].set(at.x, at.y, at.z, shieldMat.uniforms.uTime.value);
        burst(at, you ? 8 : 2, you ? 5 : 3, CYAN);
      } else {
        const col = you ? (big ? WHITE : GREEN) : raidCol(raiderIndex(h.id));
        burst(at, you ? 10 + Math.min(20, h.dmg) : 3, you ? 8 : 4, col);
        flare(at, col, you ? (big ? 5 : 3) : 1.1, you ? 0.22 : 0.14, you ? 1 : 0.45);
        if (target >= 0) {
          const bb = blocks[target];
          if (you || Math.random() < 0.18) knock(bb, false, you ? 1 : 0.6);
          if (you && h.dmg >= 10) for (let k = 0; k < Math.min(5, h.dmg / 8); k++) { const j = pickBlock(true); if (j >= 0) knock(blocks[j], false, 0.9); }
        }
        if (you) {
          recoilV -= Math.min(1.4, 0.3 + h.dmg * 0.035) * (big ? 1.8 : 1);
          recoilSide = clamp((at.x - root.position.x) / 6, -1, 1);
          jolt = Math.min(0.9, jolt + Math.min(0.5, 0.14 + h.dmg * 0.015) * (big ? 1.6 : 1));
          if (!reduce) mv.z -= Math.min(0.5, 0.08 + h.dmg * 0.012) * (big ? 2 : 1);
          if (big && canFlash()) hitGlow = calm ? 0.5 : 1;
          if (dress) dress.flash(big ? 0.9 : 0.3);
          shake = Math.max(shake, Math.min(0.5, 0.08 + h.dmg * 0.012) * (big ? 1.6 : 1));
          if (big) stopUntil = Math.max(stopUntil, performance.now() + (h.kind === 'block' ? 90 : 60));
        } else { recoilV -= 0.04; jolt = Math.min(0.9, jolt + 0.015); }
      }
      if (opts.onImpact) {
        v3.copy(at).project(camera);
        const w = host.clientWidth, hh = host.clientHeight;
        opts.onImpact(h, (v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * hh);
      }
    }
    function returnShot(id) {
      const s = shots.find(x => x.on && x.id === id);
      if (!s) return;
      s.ret = nowS(); s.retFrom.copy(s.pos);
      burst(s.pos, 14, 6, GREEN);
    }
    function killAdd(id, you) {
      const a = adds.find(x => x.on && x.id === id);
      if (!a || a.dying >= 0) return;
      a.dying = nowS();
      const from = you ? raidPos[RAID] : raidPos[Math.floor(Math.random() * RAID)];
      const b = bolts[boltI = (boltI + 1) % BOLTS];
      b.on = true; b.h = null; b.t = 0; b.from.copy(from); b.target = -3; b.addRef = a; b.dur = 0.18; b.w = you ? 0.3 : 0.14; b.tail = 0.4; b.col.copy(you ? GREEN : AMBER).multiplyScalar(2);
      a.dying = nowS() + 0.18;
    }
    function block(id) {
      blocked.add(id);
      // Gid, 26 Nov 2026: "the punches feel like taps". A block no longer breaks the attack off:
      // a barrier goes up in front of the raid, the boss still throws the whole blow, and at the
      // hit it smashes into the barrier and is thrown back (impact). Only a broken charge stops early.
      const t = nowS(), x = evs.find(e => e.id === id && e.type === 'slam');
      if (x && !x.cut && t < x.h + 0.05 && !dead) x.blocked = t;
      const yc = crew.find(c => c.id === 'you'); if (yc && !yc.down) yc.op.once('cover');
      const at = v1.copy(raidPos[RAID]).setY(2.2);
      burst(at, 26, 8, CYAN, 1.4, 4);
      flare(at, CYAN, 7, 0.32, canFlash() ? 1.3 : 0.6);
      wave(raidPos[RAID], 0.5, 6, 0.6, CYAN, 0.9);
    }
    function stagger() {
      if (flight) flight.strike(nowS());
      if (!director || director.shot() !== 'block') play(Math.random() < 0.5 ? 'strike' : 'back');
      recoilV -= 2.6; headJerk = 1; reelAt = nowS(); jolt = 0;
      adv = Math.max(0, adv - 0.45);
      if (!reduce) mv.z -= 1.6;
      shake = Math.max(shake, 0.7);
      stopUntil = Math.max(stopUntil, performance.now() + 120);
      scatter(28, 1.2);
      v1.copy(CORE).sub(HIP).applyMatrix4(hip.matrixWorld);
      burst(v1, 40, 10, WHITE);
      wave(root.position, 1, 14, 0.9, WHITE, 0.7);
    }
    function menaceTick(t, dt) {
      const quiet = dead || Math.abs(bossTurn) > 0.8 || current(t, 'slam') || current(t, 'adds') || current(t, 'shield') || current(t, 'volley') ||
        t - roarAt < 2.6 || t - reelAt < 1.0 || t < stunUntil || t - breakAt < 1.5 || t - kneelAt < 2.9;
      if (!dead) adv = Math.min(1, adv + dt * (0.055 + 0.012 * phase));
      if (quiet) { men.next = Math.max(men.next, t + 0.6); return; }
      if (t > men.next) {
        const list = MEN_BY_PHASE[phase] || MEN_BY_PHASE[0];
        men.at = t; men.kind = list[Math.floor(Math.random() * list.length)]; men.fired = false;
        men.next = t + rnd(1.1, 2.2) * (1 - phase * 0.08) + MEN[men.kind][2];
      }
      const u = t - men.at, K = MEN[men.kind];
      if (!men.fired && u >= K[2]) {
        men.fired = true;
        if (men.kind === 'stomp') {
          shake = Math.max(shake, reduce ? 0.15 : 0.45);
          flinchAt = t;
          wave(root.position, 0.6, 16, 0.8, pal.a, 0.6);
          burst(v1.copy(root.position).setY(0.3), 30, 8, WHITE, 0.8, 6);
        } else if (men.kind === 'taunt') snd('glitchRoar');
        else if (men.kind !== 'lean') shake = Math.max(shake, reduce ? 0.08 : 0.22);
        if (men.kind === 'claw' && kit && kit.arcs && !reduce) { kit.group.updateMatrixWorld(true); kit.fists[1].at.getWorldPosition(vA); for (let k = 0; k < 4; k++) kit.arcs.add(vA, v1.copy(vA).add(v2.set(rnd(-4, 4), rnd(-3, 2), rnd(-1, 4))), 0.12, 0.8, 8); }
        if (opts.onMenace) opts.onMenace(men.kind);
      }
    }
    // the menace pose: wind up, strike in 0.12 s, hold 0.12 s, recover over 0.5 s (lean holds 0.8 s)
    function menaceK(t) {
      const u = t - men.at, K = MEN[men.kind];
      if (u < 0 || u > K[2] + 1.3) return null;
      const hold = men.kind === 'lean' ? 0.8 : men.kind === 'taunt' ? 0.6 : 0.12;
      if (u < K[2]) return { a: ease(u / K[2]), b: 0, surge: 0 };
      const s = u - K[2];
      if (s < 0.12) return { a: 1 - easeIn(s / 0.12) * (men.kind === 'lean' ? 0 : 1), b: easeIn(s / 0.12), surge: easeIn(s / 0.12) };
      if (s < 0.12 + hold) return { a: men.kind === 'lean' ? 1 : 0, b: 1, surge: 1 };
      const r = 1 - smooth(clamp((s - 0.12 - hold) / 0.5, 0, 1));
      return { a: men.kind === 'lean' ? r : 0, b: r, surge: r };
    }
    // a finished set of words (boss.js): reel back for about a second, then dash to a new spot
    // 4 to 8 units across, which is 0.2 to 0.4 of the screen
    function setHit(power = 1) {
      if (dead) return;
      const t = nowS();
      adv = Math.max(0, adv - 0.3 * power);
      men.next = Math.max(men.next, t + 1.2);
      recoilV -= 1.6 * power; headJerk = 1; reelAt = t; jolt = 0;
      if (!reduce) mv.z -= 0.9 * power;
      shake = Math.max(shake, 0.4 * power);
      stopUntil = Math.max(stopUntil, performance.now() + 70);
      scatter(Math.round(16 * power), 1.1);
      burst(anchorCore, 30, 9, WHITE);
      if (canFlash()) hitGlow = Math.max(hitGlow, calm ? 0.4 : 0.8);
      let s = SPOTS[0];
      for (let k = 0; k < 8; k++) { s = SPOTS[Math.floor(Math.random() * SPOTS.length)]; if (Math.abs(s[0] - mv.tx) >= 4) break; }
      mv.tx = s[0]; mv.tz = s[1]; mv.next = t + 3 + Math.random() * 2; mv.dashUntil = t + 1.1;
    }
    function breakCharge(id) {
      const x = evs.find(z => z.id === id);
      if (!x || x.cut || dead) return;
      const t = nowS();
      x.cut = t;
      if (kit) { kit.fists[1].at.getWorldPosition(vF); burst(vF, 120, 22, WHITE, 1.4, 6); burst(vF, 60, 14, RED, 1.2, 6); flare(vF, WHITE, 9, 0.35, canFlash() ? 1.3 : 0.6); wave(vF.setY(0.2), 0.5, 20, 0.8, WHITE, 0.8); }
      stagger();
      recoilV -= 1.5; adv = 0;
      shake = Math.max(shake, reduce ? 0.4 : 1.2);
      stopUntil = Math.max(stopUntil, performance.now() + 180);
      if (!reduce) slowUntil = performance.now() + 450;
    }
    function hurt() {
      if (!canFlash()) return;
      post.uniforms.uTint.value.set('#ff4d5e');
      tintAmt = calm ? 0.22 : 0.32;
      shake = Math.max(shake, 0.5);
    }
    function setShield(f) {
      if (f === null || f === undefined) {
        if (shieldF !== null && !dead) {
          shieldBreakT = nowS();
          v1.copy(root.position).setY(8);
          burst(v1, 80, 14, CYAN, 1, 6);
          wave(root.position, 4, 22, 1, CYAN, 0.9);
          shake = Math.max(shake, 0.6);
          if (canFlash()) hitGlow = calm ? 0.4 : 0.8;
        }
        shieldF = null;
      } else {
        if (shieldF === null) shieldShow = 0;
        shieldF = f;
      }
    }
    function setWeak(on) {
      if (on && !weakOn) {
        if (flight) flight.strike(nowS());
        // the kernel opens: it drops to the floor on one claw, unless an attack at you is under way
        if (kit && kit.POSES.kneel && !dead && !own(nowS())) { kneelAt = nowS(); snd('kneel'); play('kneel'); }
        else play('back');
      }
      weakOn = on;
    }
    // the kneel landing, the roar, the death: the moments in their timelines, each frame
    let kneelLanded = -9;
    const flashLight = new THREE.PointLight('#ff5a3a', 0, 40, 1.4); scene.add(flashLight);
    let flashLAt = -9, flashLK = 0;
    function lightPulse(at, col, k = 1) { if (detail < 0.7) return; flashLight.position.copy(at); flashLight.color.copy(col); flashLAt = nowS(); flashLK = k; }
    function actsTick(t, dt) {
      // the light from big blows and blasts, a sharp flash that dies away
      const lu = t - flashLAt;
      flashLight.intensity = lu < 0.6 ? 180 * flashLK * Math.pow(1 - lu / 0.6, 2) : 0;
      if (!kit) return;
      // the claw hits the floor as it kneels
      const ku = t - kneelAt;
      if (ku > 0.33 && kneelLanded !== kneelAt && !dead) {
        kneelLanded = kneelAt;
        kit.fists[1].at.getWorldPosition(vF); vF.y = 0.2;
        decal(vF, 8, rnd(0, 6.28), 1, 7); wave(vF, 0.5, 14, 0.8, WHITE, 0.6); burst(vF, 40, 10, WHITE, 1.4, 12);
        if (dress) dress.puff(vF, 12, 1.1);
        lightPulse(vF.setY(2), WHITE, 0.5);
        shake = Math.max(shake, 0.6);
      }
      // a phase change: lightning crawls over it as it curls up, then the roar blasts out
      const ru = t - roarAt;
      if (ru >= 0 && ru < 0.7 && kit.arcs && !reduce && Math.random() < 0.7) {
        v1.copy(anchorCore).add(v2.set(rnd(-5, 5), rnd(-3, 5), rnd(-1, 2)));
        kit.arcs.add(anchorCore, v1, 0.07, 0.8, 8);
      }
      if (ru >= 0.68 && roarFx !== roarAt && !dead) {
        roarFx = roarAt;
        snd('glitchRoar');
        quakeWall(root.position, RED, 26, 0.95);
        burst(anchorHead, 70, 16, RED, 1, 4); burst(anchorHead, 30, 12, WHITE, 1, 4);
        if (canFlash()) flare(anchorHead, RED, 10, 0.35, 1.2);
        if (dress) dress.flash(1);
        lightPulse(anchorHead, RED, 0.8);
        wave(anchorHead, 0.9);
        shake = Math.max(shake, 0.9);
      }
      // the death
      if (dead && deadT < 9) {
        if (deathStep < 1 && deadT > 0.15) { deathStep = 1; snd('deathBuild'); }
        if (deadT > 0.2 && deadT < 2.2) {
          if (kit.arcs && !reduce && Math.random() < 0.85) { v1.copy(anchorCore).add(v2.set(rnd(-6, 6), rnd(-6, 4), rnd(-2, 2))); kit.arcs.add(anchorCore, v1, 0.06 + Math.random() * 0.06, 1, 9); }
          // plates pop off one at a time, faster as it gets close
          if (t - popAt > 0.26 - deadT * 0.09) {
            popAt = t;
            const all = kit.shedSets.flat().filter(m => !m.userData.home && !m.userData.detail);
            if (all.length) { const m = all[Math.floor(Math.random() * all.length)]; shedOne(m, false, 0.7); }
          }
          if (Math.random() < dt * 6 && dress) { v1.copy(anchorCore).add(v2.set(rnd(-3, 3), rnd(-3, 3), 0)); dress.puff(v1, 2, 0.5); }
        }
        if (deathStep < 2 && deadT > 2.0) { deathStep = 2; snd('implode'); if (dress) dress.flash(1.2); wave(anchorCore, 1.2); }
      }
    }

    function defeat(instant) {
      if (dead) return;
      if (fx) fx.clear();
      dead = true; deadAt = nowS(); deadT = instant ? 9 : 0; won = true;
      if (!instant) play('kill');
      if (!instant && !reduce) slowUntil = performance.now() + 450;
      threatK = 0;
      evs.length = 0; tele.visible = teleFill.visible = beam.visible = sweepBar.visible = false;
      for (const s of shots) { s.on = false; s.g.visible = false; }
      for (const a of adds) if (a.on) a.dying = nowS();
      shieldF = null;
      if (instant) {
        for (const b of blocks) { b.mode = 4; b.life = 99; b.wp.set(rnd(-12, 12), b.size / 2, rnd(-8, 2)); b.rot.set(0, rnd(0, 3), 0); }
        rings.forEach(r => { r.visible = false; r.userData.gone = true; });
        eyes.forEach(e => { e.visible = false; });
        palFrom = palTo = 5; applyPal(1);
      } else {
        for (const b of blocks) b.delay = rnd(0, 1.3);
      }
    }
    function revive() {
      if (fx) fx.clear();
      frozen.clear(); stunUntil = freezeUntil = 0; breakAt = -9;
      dead = false; deadT = 0; frac = 1; stage = 0; deathStep = 0; kneelAt = -9; kneelW = 0;
      for (const b of blocks) { b.mode = 0; b.vel.set(0, 0, 0); b.rot.set(0, 0, 0); b.delay = 0; }
      rings.forEach(r => { r.visible = true; r.userData.fall = false; r.userData.gone = false; r.position.set(0, 0, 0); r.material.opacity = 0.85; });
      eyes.forEach(e => { e.visible = !kit; });
      if (kit) rings.forEach(r => { r.visible = false; r.userData.gone = true; });
      unshed();
      won = false; crew.forEach(c => { c.down = false; });
      core.scale.setScalar(1); glowMat.opacity = 0.5;
      blocked.clear(); evs.length = 0; hitQueue.length = 0;
      for (const s of shots) { s.on = false; s.g.visible = false; }
      for (const a of adds) { a.on = false; a.m.visible = false; a.boomed = false; }
      mv.x = mv.z = mv.tx = mv.tz = 0; roarAt = -9; shieldF = null; weakOn = false;
      adv = 0; men.at = -9; men.next = nowS() + 2;
      palFrom = palTo = phase = 0; applyPal(1); pilHT = 0.35;
      setFrac(1, true);
    }

    const _s = { x: 0, y: 0 };
    function screen(key, out = _s) {
      let w = anchors.get(key);
      if (!w) {
        if (key.startsWith('shot:')) { const s = shots.find(x => x.on && x.id === key.slice(5)); if (s) w = s.pos; }
        else if (key.startsWith('add:')) { const a = adds.find(x => x.on && x.id === key.slice(4)); if (a && a.dying < 0) w = a.pos; }
        else if (key.startsWith('raider:')) w = raiderSpot(key.slice(7));
      }
      if (!w) return null;
      v3.copy(w).project(camera);
      if (v3.z > 1) return null;
      out.x = (v3.x * 0.5 + 0.5) * host.clientWidth; out.y = (-v3.y * 0.5 + 0.5) * host.clientHeight;
      return out;
    }
    const anchorHead = new V(), anchorCore = new V();
    anchors.set('head', anchorHead); anchors.set('core', anchorCore); anchors.set('you', raidPos[RAID]);
    // 'raider:<id>' is a raider's spot in the crowd, for the name tags on big hits (js/app/boss.js)
    const tagAt = new V();
    function raiderSpot(id) { const i = raiderIndex(id); if (i >= ONSCREEN) return null; return tagAt.copy(raidPos[i]).setY(raidPos[i].y + 2.1); }

    // ---------- movement: every phase moves differently ----------
    const SPOTS = [[0, 0], [-4, 0], [4, 0], [-7, -2], [7, -2], [-3, 2], [3, 2], [0, -3]];
    const MOVE = [
      { every: 9, spots: 3, speed: 0.9, bob: 0.35, sway: 0.12, arms: 0.12 },
      { every: 6, spots: 5, speed: 1.6, bob: 0.4, sway: 0.2, arms: 0.2, spin: 13 },
      { every: 5, spots: 7, speed: 2.2, bob: 0.5, sway: 0.25, arms: 0.35, lunge: 8 },
      { every: 4, spots: 8, speed: 3.2, bob: 0.45, sway: 0.3, arms: 0.45, blink: 4.5 },
      { every: 0, spots: 8, speed: 4.5, bob: 0.6, sway: 0.4, arms: 0.7, blink: 6 },
    ];
    // pose targets, smoothed each frame
    const pose = { hx: 0, hy: 0, hz: 0, headX: 0, headY: 0, lx: 0, lz: 0, rx: 0, ry: 0, rz: 0, y: 0 };
    const cur = { ...pose };
    // ---------- the titan's poses ----------
    // Each attack has a wind-up pose and a strike pose (bone rotations in radians, x y z), on top
    // of the kit's idle. The attack clock decides the blend: the wind-up eases in over the whole
    // telegraph, the strike snaps in within about a tenth of a second, holds, then settles back.
    const KIND = { slam: ['raise', 'slam', 0.1], sweep: ['pull', 'sweep', 0.2], lunge: ['coil', 'punch', 0.12], beam: ['beam', 'beam', 0.15],
      charge: ['coil', 'punch', 0.16], laser: ['beam', 'beam', 0.15],
      quake: ['hunch', 'pound', 0.1], scan: ['scanwind', 'scan', 0.2], rain: ['summon', 'cast', 0.16], grab: ['grabwind', 'grab', 0.14] };
    function titanPose(t) {
      const L = [];
      let busy = 0, tremble = 0, gl = 0, gr = 0, trail = 0;
      chargeK = 0;
      const sl = current(t, 'slam');
      if (sl) {
        const K = sl.kind === 'lunge' && kit.POSES.reach ? ['coil', 'reach', 0.12] : KIND[sl.kind] || KIND.slam;
        // Wind-up, hold, strike, follow-through (Gid, 26 Nov 2026: "barely any wind up, hit and
        // follow through"). It winds up into the pose and a little past it, holds there cocked for
        // HOLD s, throws the strike in the last K[2] s so it lands on the hit, overshoots 15%,
        // holds the landed pose for 0.45 s and only then recovers over 0.9 s.
        const HOLD = sl.kind === 'charge' ? 0.55 : 0.32;
        // how far past each pose it goes: the overhead wind-up already sits at the shoulder's limit,
        // and the punch's rear arm and chest twist run out of room past 6% (joint-check, 26 Nov 2026)
        const WX = sl.kind === 'slam' || sl.kind === 'sweep' || MOVE_KINDS.has(sl.kind) ? 1 : 1.08, OV = sl.kind === 'charge' ? 1.06 : MOVE_KINDS.has(sl.kind) ? 1.08 : 1.15;
        const sAt = sl.h - K[2], holdAt = sAt - HOLD;
        const w = clamp((t - sl.s) / Math.max(0.2, holdAt - sl.s), 0, 1), after = t - sl.h;
        const rec = after > 0.45 ? smooth((after - 0.45) / 0.9) : 0;
        const ck = cutK(sl, t);
        if (sl.cut && sl.cut < sAt) { L.push([K[0], ease(clamp((sl.cut - sl.s) / (holdAt - sl.s), 0, 1)) * ck]); busy = ck; }
        // The body leads and the arm follows, in the wind-up and in the strike: the chest turns
        // into the blow about 0.08 s before the arm comes through, and keeps turning 20% past its
        // pose after the contact while the arm settles (references Gid asked for, 26 Nov 2026:
        // hips and trunk give most of a punch's power, "move the shoulder first, have the arm lag
        // behind", and the follow-through carries one step past the hit)
        else if (t < holdAt) { L.push([K[0], ease(w) * WX], [K[0] + '_body', ease(Math.min(1, w * 1.35))]); busy = w; tremble = sl.kind === 'charge' ? w * w * 1.1 : w > 0.75 ? (w - 0.75) * 3 : 0; }
        else if (t < sAt - 0.08) { L.push([K[0], WX]); busy = 1; tremble = sl.kind === 'charge' ? 1.6 : 1.1; }
        else {
          const sk = clamp((t - sAt) / K[2], 0, 1), over = after < 0 ? easeIn(sk) * OV : after < 0.12 ? OV - (OV - 1) * (after / 0.12) : 1;
          const bk = clamp((t - sAt + 0.08) / K[2], 0, 1), bover = after < 0 ? easeIn(bk) * 1.2 : after < 0.2 ? 1.2 - 0.2 * (after / 0.2) : 1;
          L.push([K[0], (1 - rec) * ck * (after < 0 ? WX * (1 - sk) + 1e-3 : 0)]);
          L.push([K[1], (1 - rec) * ck * over]);
          L.push([K[1] + '_body', (1 - rec) * ck * bover]);
          busy = (1 - rec) * ck;
          if (!sl.whoosh && sk > 0) { sl.whoosh = true; if (opts.onMenace && sl.kind !== 'beam' && sl.kind !== 'laser' && sl.kind !== 'scan') opts.onMenace('strike'); }
        }
        // the fists that strike glow red as the wind-up fills, flash on the hit, then cool
        const g = (sl.cut ? (sl.cut < sAt ? w * w : 1) : after < 0 ? w * w : Math.max(0, 1 - after / 0.6)) * ck;
        if (sl.kind !== 'beam' && sl.kind !== 'laser' && sl.kind !== 'scan') { gr = g; if (sl.kind === 'slam' || sl.kind === 'quake') gl = g; }
        chargeK = sl.kind === 'charge' ? (sl.cut ? 0 : after < 0 ? w : Math.max(0, 1 - after / 0.4)) : 0;
        if (!sl.cut && sl.kind !== 'scan' && after >= -K[2] && after < (sl.kind === 'sweep' ? 0.35 : 0.22)) trail = sl.kind === 'slam' || sl.kind === 'charge' || sl.kind === 'quake' ? 3 : 2;
      }
      const mk = !dead ? menaceK(t) : null;
      if (mk) {
        const K = MEN[men.kind], f = K[3] * (1 - busy);
        if (mk.a > 0.01) L.push([K[0], mk.a * f]);
        if (mk.b > 0.01 && K[1] !== K[0]) L.push([K[1], mk.b * f]);
        if (men.kind !== 'lean' && mk.b > 0.5 && t - men.at - K[2] < 0.2) trail = Math.max(trail, men.kind === 'stomp' ? 3 : 2);
      }
      const vo = current(t, 'volley');
      if (vo) { const w = clamp((t - vo.s) / 1.0, 0, 1) * clamp((vo.e - t) / 0.8, 0, 1); L.push(['point', ease(w)]); busy = Math.max(busy, w); }
      const ad = current(t, 'adds');
      if (ad && t - ad.s < 2.4) { const w = Math.sin(clamp((t - ad.s) / 2.4, 0, 1) * Math.PI); L.push(['roar', w]); busy = Math.max(busy, w); }
      const shx = current(t, 'shield');
      if (shx) { const w = Math.sin(clamp((t - shx.s) / 2.4, 0, 1) * Math.PI); L.push(['guard', w]); busy = Math.max(busy, w); }
      const ru = t - roarAt;
      if (ru < 2.6) {
        // a phase change: it curls up behind its forearms for 0.7 s while the power surges, then throws
        // its arms wide and roars (Syntax Error; the other kits roar straight away)
        if (kit.POSES.brace) {
          const bw = ru < 0.7 ? ease(ru / 0.7) : Math.max(0, 1 - smooth((ru - 0.7) / 0.25)), rw = ru < 0.6 ? 0 : Math.sin(clamp((ru - 0.6) / 2.0, 0, 1) * Math.PI);
          if (bw > 0.01) L.push(['brace', bw]);
          if (rw > 0.01) L.push(['roar', rw]);
          busy = Math.max(busy, bw, rw); if (ru < 0.7) tremble = Math.max(tremble, ru / 0.7 * 1.3);
        } else { const w = Math.sin(clamp(ru / 2.6, 0, 1) * Math.PI); L.push(['roar', w]); busy = Math.max(busy, w); }
      }
      // the kernel open: it sinks to the floor on one claw for about 2.5 s, core bared, then rises
      const ku = t - kneelAt;
      kneelW = 0;
      if (ku < 3.0 && !dead && kit.POSES.kneel) {
        kneelW = (ku < 0.35 ? easeIn(ku / 0.35) : ku < 2.3 ? 1 : 1 - smooth((ku - 2.3) / 0.7)) * (1 - (sl ? Math.min(1, busy) : 0));
        L.push(['kneel', kneelW]); busy = Math.max(busy, kneelW);
        if (ku > 0.33 && ku < 0.7) tremble = Math.max(tremble, 0.9 * (1 - (ku - 0.33) / 0.37));
      }
      const bu = t - breakAt;
      if (bu < 1.5) { const w = Math.sin(clamp(bu / 1.5, 0, 1) * Math.PI); L.push(['reel', w]); busy = Math.max(busy, w); }
      if (t < stunUntil) { L.push(['reel', 0.55]); tremble = Math.max(tremble, 0.5); }
      // knocked back: a blocked attack or a stagger throws it into the reel, your hits jolt it
      const rk = t - reelAt, rw = Math.max(rk < 1.1 ? Math.sin(clamp(rk / 1.1, 0, 1) * Math.PI) * 0.9 : 0, jolt);
      if (rw > 0.02 && !dead) { L.push(['reel', rw * still + (1 - still) * Math.min(rw, 0.3)]); busy = Math.max(busy, rw); if (rk < 0.5) tremble = Math.max(tremble, 0.6); }
      if (dead && kit.POSES.slump) {
        // the death (Syntax Error): thrown back, sinks to the floor, slumps forward as the core overloads, and blows
        L.push(['reel', clamp(deadT / 0.3, 0, 1) * (1 - smooth(clamp((deadT - 0.45) / 0.4, 0, 1)))]);
        L.push(['kneel', smooth(clamp((deadT - 0.45) / 0.5, 0, 1))]);
        L.push(['slump', smooth(clamp((deadT - 1.1) / 0.9, 0, 1))]);
        tremble = 0.6 + Math.min(1.4, deadT * 0.7);
        kneelW = smooth(clamp((deadT - 0.45) / 0.5, 0, 1));
      } else if (dead) { L.push(['reel', clamp(deadT / 0.4, 0, 1)]); L.push(['fall', ease((deadT - 0.25) / 0.9)]); tremble = 1; }
      kit.mix(L);
      return { busy, tremble, gl, gr, trail };
    }
    // the bones are set from the blend each frame, plus the small living motions: sway, the head
    // tracking the camera, recoil from hits, and a shiver in the arms at the top of a wind-up
    function driveKit(t, at, dt) {
      const Bn = kit.bones;
      kit.group.position.y = -cur.y;                       // the feet stay on the floor
      // a hit-stop freezes the body mid-strike, so the impact frame holds on screen
      if (performance.now() < stopUntil && !dead) { kit.update(at, dt); return; }
      const { busy, tremble, gl, gr, trail } = titanPose(t);
      kit.fists[0].g.material.opacity = gl * (calm ? 0.6 : 0.85);
      kit.fists[1].g.material.opacity = gr * (calm ? 0.6 : 0.85);
      kit.fists[0].g.scale.setScalar(2 + gl * 2.2);
      // a charged punch: the fist's glow swells to the size of the boss's chest and pulses faster
      kit.fists[1].g.scale.setScalar(2 + gr * 2.2 + chargeK * (9 + Math.sin(t * (8 + 22 * chargeK)) * 1.5));
      if (chargeK > 0.05 && Math.random() < chargeK * 0.6) { kit.fists[1].at.getWorldPosition(vF); burst(vF, 3, 4 + 6 * chargeK, Math.random() < 0.5 ? WHITE : RED, 0.4, 0); }
      kitBusy = busy;
      const calmK = 1 - busy * 0.7;
      Bn.chest.rotation.y += Math.sin(at * 0.3) * 0.1 * still * calmK + recoil * recoilSide * 0.4;
      Bn.chest.rotation.x += recoil * 0.7 + Math.sin(at * 0.7) * 0.03 * still * calmK;
      Bn.head.rotation.x += recoil * 0.6 - headJerk * 0.4;
      Bn.head.rotation.y += cur.headY * calmK;
      Bn.head.rotation.z += Math.sin(at * 13) * headJerk * 0.3 * still;
      Bn.armL.rotation.z -= Math.abs(Math.sin(at * 0.6)) * 0.06 * still * calmK;
      Bn.armR.rotation.z += Math.abs(Math.sin(at * 0.6 + 2)) * 0.06 * still * calmK;
      if (tremble && !reduce) {
        const j = tremble * 0.04;
        Bn.armL.rotation.x += Math.sin(t * 61) * j; Bn.armR.rotation.x += Math.sin(t * 57 + 1) * j;
        Bn.chest.rotation.z += Math.sin(t * 43) * j * 0.5;
      }
      if (phase >= 4 && !reduce && !busy) { Bn.armL.rotation.x += Math.sin(at * 3.1) * 0.12; Bn.armR.rotation.x += Math.sin(at * 2.7 + 1) * 0.12; }
      // the scan line: the head turns along the sweep and the chest follows a little
      Bn.head.rotation.y += headSweep; Bn.chest.rotation.y += headSweep * 0.3;
      kit.group.visible = !(dead && deadBoom);
      kit.update(at, dt);
      kit.group.position.y += liftY;
      // kneeling, the shard tail swings back out of the floor
      if (kit.tail && kneelW > 0) kit.tail.rotation.x += 0.95 * kneelW;
      if (kit.arcs) syntaxFx(t, dt, gl, gr, trail);
      // sparks streak off the striking fist so the arc of the blow stays on screen
      if (trail) {
        kit.group.updateMatrixWorld(true);
        if (trail === 3) kit.fists[0].at.getWorldPosition(vG), burst(vG, 3, 2, RED, 0.3, 2);
        kit.fists[1].at.getWorldPosition(vG); burst(vG, 5, 2.5, RED, 0.3, 2); burst(vG, 2, 1.5, WHITE, 0.3, 1);
      }
      shedTick(dt);
    }
    // Syntax Error's own effects: lightning round a charging gauntlet, the Data Erasure stream from
    // the open claw to the raid on the reach, and red glitch bits shed from the shard tips
    const vA = new V(), vB = new V();
    function syntaxFx(t, dt, gl, gr, trail) {
      kit.group.updateMatrixWorld(true);
      const sq = current(t, 'slam'), arcK = sq && (sq.kind === 'quake' || sq.kind === 'grab') ? 0.3 : 0.9;
      for (const [i, g] of [[0, gl], [1, gr]]) {
        if (g < 0.25 || reduce) continue;
        if (Math.random() < g * arcK) {
          kit.fists[i].at.getWorldPosition(vA);
          vB.copy(vA).add(new V((Math.random() - 0.5) * 6, (Math.random() - 0.3) * 5, (Math.random() - 0.5) * 6));
          kit.arcs.add(vA, vB, 0.08 + Math.random() * 0.08, 0.5 + g * 0.6, 7);
        }
      }
      const ln = current(t, 'slam');
      if (ln && ln.kind === 'lunge' && t >= ln.h - 0.12 && t < ln.h + 0.45 && !reduce) {
        kit.fists[1].at.getWorldPosition(vA);
        if (ln.side) vB.copy(ln.at).setY(1.6); else { root.localToWorld(vB.copy(aim)); vB.y += 0.8; }
        for (let k = 0; k < 3; k++) kit.arcs.add(vA, vB, 0.06, 1.4, 16);
        if (Math.random() < 0.5) burst(vB, 6, 6, RED, 1, 6);
      }
      kit.glitchAt -= dt;
      if (kit.glitchAt <= 0 && !reduce) {
        kit.glitchAt = 0.07;
        const tip = kit.tips[Math.floor(Math.random() * kit.tips.length)];
        kit.tail.localToWorld(vA.copy(tip));
        burst(vA, 2, 1.2, RED, -0.3, 1.5);
      }
      kit.arcs.tick(dt);
    }
    function motion(t, at, dt) {
      const M = MOVE[phase];
      // pick a new spot now and then
      if (M.every && t > mv.next) {
        const s = SPOTS[Math.floor(Math.random() * M.spots)];
        mv.tx = s[0]; mv.tz = s[1]; mv.next = t + M.every * rnd(0.7, 1.3) / Math.max(0.5, still);
        mv.dashUntil = t + 0.55;                         // it doesn't stroll to a new spot, it lunges there
      }
      if (!M.every) { mv.tx = Math.sin(at * 0.55) * 7; mv.tz = Math.cos(at * 0.55) * 2.2 - 1; }
      if (M.blink && t - mv.blinkAt > M.blink && !reduce) {
        mv.blinkAt = t;
        const s = SPOTS[Math.floor(Math.random() * SPOTS.length)];
        mv.tx = s[0]; mv.tz = s[1];
        scatter(18, 0.9);
      }
      if (M.spin && t - mv.spin > M.spin && !reduce) mv.spin = t;
      if (M.lunge && t - mv.lungeAt > M.lunge && !reduce) mv.lungeAt = t;
      // idle pose
      const sw = M.sway * still, ar = M.arms * still;
      pose.y = Math.sin(at * 0.9) * M.bob * still + 0.4;
      pose.hx = Math.sin(at * 0.7) * 0.03 * still;
      pose.hy = Math.sin(at * 0.3) * sw;
      pose.hz = Math.sin(at * 0.45) * sw * 0.3;
      pose.lx = Math.sin(at * 0.8 + 1) * ar * 0.6; pose.lz = -0.1 - Math.abs(Math.sin(at * 0.6)) * ar;
      pose.rx = Math.sin(at * 0.8) * ar * 0.6; pose.ry = 0; pose.rz = 0.1 + Math.abs(Math.sin(at * 0.6 + 2)) * ar;
      // the head follows the camera with a little lag and looks around now and then
      pose.headY = clamp(Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z) - root.rotation.y, -0.7, 0.7) + Math.sin(at * 0.37) * 0.15 * still;
      pose.headX = -0.08 + Math.sin(at * 0.5) * 0.05 * still;
      let tx = mv.tx, tz = mv.tz;
      // phase 3: feints toward the raid
      if (M.lunge) {
        const u = (t - mv.lungeAt);
        if (u < 1.6) { const k = u < 0.5 ? -easeIn(u / 0.5) : u < 0.75 ? -1 + 2.4 * ease((u - 0.5) / 0.25) : 1.4 * (1 - smooth((u - 0.75) / 0.85)); tz += k * 2.5 * still; pose.hx += k * 0.15; }
      }
      // attack poses on the shared clock
      const sl = current(t, 'slam'), sx0 = tx, sz0 = tz;
      if (sl && !sl.cut) {
        const w = clamp((t - sl.s) / (sl.h - sl.s), 0, 1), after = t - sl.h;
        const rec = after > 0 ? 1 - smooth(after / 1.2) : 1;
        if (sl.kind === 'slam') {
          if (after < 0) { pose.lz = -0.3 - 2.3 * ease(w); pose.rz = 0.3 + 2.3 * ease(w); pose.lx = pose.rx = 0.4 * w; pose.y += 2 * ease(w); pose.hx = -0.25 * w; pose.headX = -0.3 * w; }
          else { const d = ease(after / 0.14) * rec; pose.lz = -0.3 * d - 2.6 * (1 - d) * rec; pose.rz = 0.3 * d + 2.6 * (1 - d) * rec; pose.lx = pose.rx = -1.3 * d; pose.hx = 0.35 * d; pose.y -= 1.2 * d; }
          tx *= 1 - w * 0.6; tz = tz * (1 - w) + 1.5 * w;
        } else if (sl.kind === 'sweep') {
          if (after < 0) { pose.rz = 1.5 * ease(w); pose.hy = -0.6 * ease(w); pose.rx = 0.3 * w; pose.headY -= 0.3 * w; }
          else { const d = ease(after / 0.3); pose.rz = 1.5 * (1 - d * 0.4) * rec; pose.hy = (-0.6 + 1.5 * d) * rec; pose.rx = -1.3 * d * rec; }
        } else if (sl.kind === 'lunge') {
          if (after < 0) { tz = tz * (1 - w) - 4 * ease(w); pose.hx = -0.3 * w; pose.lx = pose.rx = 0.8 * w; pose.y -= 0.8 * w; }
          else { const d = ease(after / 0.18), lz = -4 + 10 * d; tz = mv.tz + (lz - mv.tz) * rec; pose.hx = 0.5 * d * rec; pose.lx = pose.rx = -1.4 * d * rec; }
          tx *= 1 - w;
        } else if (sl.kind === 'charge') {
          // rears back as the fist charges, then the punch carries it into the raid (threatK)
          if (after < 0) { tz = tz * (1 - w) - 3 * ease(w); pose.hx = -0.25 * w; pose.y -= 0.6 * w; }
          tx *= 1 - w * 0.7;
        } else if (sl.kind === 'laser') {
          // backs off into the far end of the arena and fires from there
          const bw = ease(clamp(w * 2.2, 0, 1));
          tz = tz * (1 - bw) - 13 * bw * (after < 0 ? 1 : rec > 0 ? 1 - rec : 1); tx *= 1 - bw;
          if (after < 0) { pose.lz = -1.6 * ease(w); pose.rz = 1.6 * ease(w); pose.headX = -0.25 * w; pose.y += 1 * w; }
          else { pose.lz = -1.6 * rec; pose.rz = 1.6 * rec; pose.hx = -0.2 * rec; }
        } else if (sl.kind === 'quake') {
          // over the squad as it rises, so the drop lands in front of them (the height is liftY)
          tx *= 1 - w * 0.7; tz = tz * (1 - w) + 1.2 * w;
        } else if (sl.kind === 'scan') {
          // hangs back a little and rises to sweep from above
          if (after < 0) { tz -= 2.5 * ease(w); pose.y += 0.8 * w; } else tz -= 2.5 * rec;
          tx *= 1 - w * 0.8;
        } else if (sl.kind === 'rain') {
          if (after < 0) { tz -= 1.5 * ease(w); pose.y += 1.2 * w; }
          tx *= 1 - w * 0.6;
        } else if (sl.kind === 'grab') {
          // rears back, then lunges in to the squad and holds there crushing for half a second
          if (after < 0) { tz = tz * (1 - w) - 3.5 * ease(w); }
          else { const d = ease(after / 0.16), hold = after < 0.65 ? 1 : 1 - smooth((after - 0.65) / 0.8), lz = -3.5 + 10.5 * d; tz = mv.tz + (lz - mv.tz) * hold; }
          tx *= 1 - w;
        } else if (sl.kind === 'beam') {
          if (after < 0) { pose.lz = -1.6 * ease(w); pose.rz = 1.6 * ease(w); pose.headX = -0.25 * w; pose.y += 1 * w; }
          else { pose.lz = -1.6 * rec; pose.rz = 1.6 * rec; pose.hx = -0.2 * rec; }
          tx *= 1 - w * 0.8;
        }
        charge = after < 0 ? (sl.kind === 'beam' || sl.kind === 'laser' ? w : w * 0.5) : 0;
        if (sl.side) {
          // the moves above are written toward your squad (+z): turn them toward the squad it's after
          const ya = Math.atan2(sl.at.x - mv.x, sl.at.z - mv.z), dx = tx - sx0, dz = tz - sz0 + (sl.kind === 'lunge' ? 2.5 * Math.sin(clamp((t - sl.h + 0.3) / 0.9, 0, 1) * Math.PI) : 0);
          tx = sx0 + dx * Math.cos(ya) + dz * Math.sin(ya); tz = sz0 - dx * Math.sin(ya) + dz * Math.cos(ya);
        }
      } else charge = Math.max(0, charge - dt * 2);
      const vo = current(t, 'volley');
      if (vo) { const w = clamp((t - vo.s) / 1.2, 0, 1) * clamp((vo.e - t) / 0.8, 0, 1); pose.rx = -1.2 * w; pose.rz = 0.6 * w; }
      const ad = current(t, 'adds');
      if (ad && t - ad.s < 2.4) { const w = Math.sin(clamp((t - ad.s) / 2.4, 0, 1) * Math.PI); pose.lz = -2 * w; pose.rz = 2 * w; pose.headX = -0.3 * w; }
      const shx = current(t, 'shield');
      if (shx) { const w = Math.sin(clamp((t - shx.s) / 2.4, 0, 1) * Math.PI); pose.lx = pose.rx = -1.0 * w; pose.lz = 0.7 * w; pose.rz = -0.7 * w; pose.y -= 0.8 * w; }
      // the phase-break pose after a big spell
      const bu = t - breakAt;
      if (bu < 1.5) {
        const w = Math.sin(clamp(bu / 1.5, 0, 1) * Math.PI) * still;
        pose.headX = -0.75 * w; pose.hx = -0.45 * w; pose.lz = -2.5 * w; pose.rz = 2.5 * w; pose.lx = pose.rx = -0.7 * w; pose.y += 1.2 * w;
        tx *= 1 - w; tz = tz * (1 - w) - 3 * w;
      }
      // roar after a phase change
      const ru = t - roarAt;
      if (ru < 2.6) {
        const w = Math.sin(clamp(ru / 2.6, 0, 1) * Math.PI);
        pose.headX = -0.55 * w; pose.hx = -0.3 * w; pose.lz = -2.2 * w; pose.rz = 2.2 * w; pose.lx = pose.rx = 0.3 * w;
        tx *= 1 - w; tz *= 1 - w;
      }
      // move
      const rate = (0.6 + M.speed * 0.5) * (reduce ? 0.5 : 1);
      const strike = sl && !sl.cut && (sl.kind === 'lunge' || sl.kind === 'grab') && t > sl.h && t < sl.h + 0.4;
      // pressure: it closes on the raid until your typing knocks it back
      const front = Math.min(4, raidZ - 3.4);
      tz += (front - tz) * adv * 0.85 * still; tx *= 1 - 0.45 * adv;
      const tk = Math.max(0, threatK);
      const mk = menaceK(t);
      if (mk && men.kind !== 'stomp') tz += (men.kind === 'lean' ? 2.6 : 1.8) * mk.surge * still;
      const slK = current(t, 'slam');
      if (!slK || (slK.kind !== 'laser' && !(slK.kind in { quake: 1, scan: 1, rain: 1 }))) tz += (front + 1 - tz) * tk * still;   // every attack but the laser comes right up to the raid
      // and rears back through the wind-up first
      if (slK && !slK.side && !slK.cut && slK.kind !== 'laser' && slK.kind !== 'beam' && slK.kind !== 'scan' && slK.kind !== 'quake' && nowS() < slK.h - 0.12) tz -= 2.4 * ease(clamp((nowS() - slK.s) / Math.max(0.3, slK.h - 0.5 - slK.s), 0, 1)) * still;
      const dash = t < mv.dashUntil ? 7 : 0;            // a dash to a new spot takes about half a second
      const hold = orbit.sw && !own(t) ? 0.08 : 1;   // it stays put while the party swings round it
      mv.x += (tx - mv.x) * Math.min(1, dt * (rate + dash) * hold);
      mv.z += (tz - mv.z) * Math.min(1, dt * (strike ? 12 : rate + dash) * hold);
      // phase 2: a full turn now and then
      const su = t - mv.spin;
      mv.face = su < 1.3 && M.spin ? smooth(su / 1.3) * Math.PI * 2 : 0;
      if (phase >= 4 && !reduce) { pose.lx += Math.sin(at * 3.1) * 0.3; pose.rx += Math.sin(at * 2.7 + 1) * 0.3; pose.headY += Math.sin(at * 5) * 0.05; }
    }

    // ---------- loop ----------
    let at = 0, last = nowS(), bossTurn = 0, bossYaw = 0;
    // compile every shader now, hidden pooled effects included, so the first hit, spell or status
    // effect in a fight doesn't stall a frame while its shader compiles
    try { renderer.compile(scene, camera); } catch (e) {}
    if (aq) { aq.watch(renderer.domElement); aq.apply(); }
    renderer.setAnimationLoop(() => {
      if (aq && !paused && visible && !document.hidden) aq.frame(performance.now());
      const t = nowS();
      let dt = Math.min(0.05, t - last); last = t;
      if (paused) dt = 0;
      if (!visible || document.hidden) return;
      // hit-stop slows everything but the shared clock for a few frames
      const pnow = performance.now();
      const adt = pnow < stopUntil ? dt * 0.08 : pnow < slowUntil ? dt * 0.35 : dt;
      // kernel panic stops the body, cryo lock slows it
      const stunned = t < stunUntil, iced = t < freezeUntil;
      const bdt = adt * (stunned ? 0 : iced ? 0.25 : 1);
      at += bdt;
      runEvents(t);
      for (let i = hitQueue.length - 1; i >= 0; i--) if (t >= hitQueue[i].at) {
        const { h } = hitQueue[i]; hitQueue.splice(i, 1);
        land(h, v2.copy(anchorCore).add(v1.set(rnd(-1, 1), rnd(-1, 1), 1)), -2);
      }

      // palette
      // the arena shifts on the wall clock so a slow frame rate cannot stall it
      if (palT < 1) { palT = Math.min(1, (t - palAt) / 1.6); applyPal(smooth(palT)); }
      boxMat.uniforms.uTime.value = at * still;
      pilMat.uniforms.uTime.value = at * still;
      addMat.uniforms.uTime.value = at * still;
      codeTex.offset.y -= adt * pal.wall * (reduce ? 0.3 : 1);
      airTick(at, adt);
      tethMat.uniforms.uTime.value = reduce ? 0 : at;
      shieldMat.uniforms.uTime.value = at;

      // an attack comes at the camera: the zoom builds over the last 0.7 s before the hit, holds
      // 0.15 s and lets go over 0.7 s; a blocked attack lets go at once (The Typing of the Dead:
      // the boss goes from 40% to 85% of the screen in half a second)
      {
        let k = 0;
        const sl = own(t);
        if (sl && !dead && sl.kind !== 'laser' && sl.kind !== 'quake' && sl.kind !== 'scan' && sl.kind !== 'rain') {
          const st = sl.h - 0.22;
          if (sl.cut) k = 0;
          else if (t < st) k = -0.1 * ease(clamp((t - sl.s) / Math.max(0.3, st - sl.s), 0, 1));
          else if (t < sl.h) k = -0.1 + 1.1 * easeOut(clamp((t - st) / 0.22, 0, 1));
          else k = 1 - smooth(clamp((t - sl.h - 0.3) / 0.7, 0, 1));
        }
        threatK = k * (reduce ? 0.35 : 1);
      }
      menaceTick(t, bdt);
      sideTick(t);
      // pose and movement
      if (!dead) motion(t, at, bdt);
      const k = Math.min(1, bdt * 7);
      for (const key in pose) cur[key] += (pose[key] - cur[key]) * k;
      recoilV += (-recoil * 40 - recoilV * 9) * adt; recoil += recoilV * adt;
      recoil = clamp(recoil, -0.9, 0.3);
      headJerk = Math.max(0, headJerk - adt * 2.5);
      jolt = Math.max(0, jolt - adt * 2.6);
      root.position.set(mv.x, cur.y, mv.z);
      {
        // an attack faces its target, a lock-on faces its bot, and in between it turns to whoever
        // is diving at it
        // Gid, 27 Nov 2026: the boss keeps its own facing in the arena while your squad flies round
        // it, so the view shows its side or its back until it turns on someone. bossYaw is where it
        // faces in the arena; the view has turned by orbit.phi, so on screen that's bossYaw - phi.
        // at your squad it swings round only for the last stretch of the wind-up, so the turn itself is
        // the warning; at a flank squad it turns from the start. With two attacks going, yours wins.
        let sl = null;
        for (const x of evs) if (x.type === 'slam' && !x.cut && t >= x.s && t < x.h + 0.6 && (x.side || t > x.h - (x.kind === 'laser' ? 2.2 : 1.8)))
          if (!sl || (sl.side && !x.side) || (!!sl.side === !!x.side && x.h < sl.h)) sl = x;
        const lk = !sl && locks.find(l => t < l.h + 0.3);
        let want = null, rate = 2.2;
        if (sl) { const a = sl.at || aim; want = Math.atan2(a.x - root.position.x, a.z - root.position.z); rate = sl.side ? 4 : 6; }
        else if (lk) { const p = raidPos[lk.slot]; want = Math.atan2(p.x - root.position.x, p.z - root.position.z); rate = 4; }
        else if (flight && !reduce && !orbit.sw) { const f = flight.focus(t); if (f) { want = Math.atan2(f.x - root.position.x, f.z - root.position.z); rate = 1.8; } }
        if (orbit.sw && sl && sl.side) want = null;
        if (reduce || !BOT) bossYaw = orbit.phi;
        else if (want !== null) { const d = want + orbit.phi - bossYaw; bossYaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * rate); }
        const r = bossYaw - orbit.phi; bossTurn = Math.atan2(Math.sin(r), Math.cos(r));
      }
      root.rotation.y = mv.face + bossTurn + Math.sin(at * 0.3) * 0.05 * still;
      // it leans into a dash
      const vx = (mv.x - prevX) / Math.max(dt, 1e-3); prevX = mv.x;
      leanZ += (clamp(-vx * 0.025, -0.22, 0.22) * still - leanZ) * Math.min(1, dt * 8);
      root.rotation.z = leanZ;
      hip.rotation.set(cur.hx + recoil, cur.hy + recoil * recoilSide * 0.4, cur.hz + recoil * recoilSide * 0.3 + (stunned && !reduce ? Math.sin(t * 47) * 0.025 : 0));
      tintMix += ((iced ? 0.6 : stunned ? 0.5 : 0) - tintMix) * Math.min(1, dt * 6);
      if (iced) boxMat.uniforms.uTintC.value.set('#bfefff').multiplyScalar(1.3);
      else if (stunned) boxMat.uniforms.uTintC.value.set('#3d7bff').multiplyScalar(1.4);
      boxMat.uniforms.uTintMix.value = tintMix;
      headG.rotation.set(cur.headX + recoil * 0.6 - headJerk * 0.4, cur.headY, Math.sin(at * 13) * headJerk * 0.3 * still);
      armLG.rotation.set(cur.lx, 0, cur.lz);
      armRG.rotation.set(cur.rx, cur.ry, cur.rz);
      if (kit) driveKit(t, at, adt);
      if (kit && kit.ghostFill) { kit.ghostFill.uniforms.uT.value = at; kit.ghostFill.uniforms.uK.value = phase >= 4 && !reduce && Math.random() < 0.08 ? 0.35 : 1; }
      const tauntK = men.kind === 'taunt' && !dead ? (menaceK(t) || { b: 0 }).b : 0;
      if (dress) dress.update(t, adt, { phase, stage, charge: Math.max(chargeK, charge), roar: Math.sin(clamp((t - roarAt) / 2.6, 0, 1) * Math.PI), mouth: tauntK, dead, deadT, weak: weakK > 0.5 });
      if (flight) {
        const sl = dead ? null : own(t), sx = dead ? null : evs.find(z => z.side && !z.cut && t >= z.s && t <= z.e);
        const calm = !dead && !evs.some(z => !z.side && z.type === 'slam' && z.e > t && z.s < t + 3) && !locks.some(l => t < l.h + 0.4) && !current(t, 'volley');
        flight.update(t, adt, { boss: root.position, aim, spin: orbit.w, lag: orbit.lag, calm: calm && !orbit.sw,
          threat: sl && !sl.cut ? { id: sl.id, kind: sl.kind, h: sl.h, blocked: !!sl.blocked } : null,
          side: sx ? { id: sx.id, k: sx.side, kind: sx.kind, h: sx.h, at: sx.at, outcome: sx.outcome } : null }, raidPos);
        youRing.position.set(raidPos[RAID].x, 0.04, raidPos[RAID].z);
      }
      opsTick(t, adt);
      root.updateMatrixWorld(true);
      lockTick(t, adt);
      if (kit) movesTick(t, adt);
      actsTick(t, adt);
      partG.forEach((g, i) => g.getWorldQuaternion(partQ[i]));
      if (kit) {
        kit.bones.head.getWorldPosition(anchorHead).y += 2.2;
        kit.core.getWorldPosition(anchorCore);
        core.position.copy(anchorCore); hip.worldToLocal(core.position);
      } else {
        anchorHead.set(0, 4.6, 0).applyMatrix4(headG.matrixWorld);
        anchorCore.copy(CORE).sub(HIP).applyMatrix4(hip.matrixWorld);
      }

      // blocks
      const glitchRate = (phase >= 4 ? 0.22 : [0.01, 0.03, 0.06, 0.12, 0.22][stage]) * (reduce ? 0 : 1);
      if (dead) deadT += adt;
      for (let i = 0; i < N; i++) {
        const b = blocks[i];
        if (dead && b.mode === 0 && deadT > b.delay) knock(b, true, deadT > 1.3 ? 2.2 : 1);
        if (b.mode === 0) {
          attachPos(b, p);
          if (glitchRate) {
            if (b.jt > 0) { b.jt -= adt; p.x += b.jx; }
            else if (Math.random() < glitchRate * adt * 4) { b.jt = rnd(0.06, 0.18); b.jx = rnd(-1, 1) * (0.3 + stage * 0.2); }
          }
          sc.setScalar(kit ? 0 : b.size);
          m4.compose(p, partQ[b.part], sc);
        } else {
          if (b.mode === 1 || b.mode === 3) {
            b.vel.y -= 18 * b.grav * adt;
            b.wp.addScaledVector(b.vel, adt);
            b.rot.x += b.spin.x * adt; b.rot.y += b.spin.y * adt; b.rot.z += b.spin.z * adt;
            if (b.mode === 1) { b.life -= adt; if (b.life <= 0) { b.mode = 2; b.ret = 0; b.from.copy(b.wp); } }
            if (b.mode === 3 && b.wp.y < b.size / 2) { b.wp.y = b.size / 2; b.mode = 4; b.rot.x = b.rot.z = 0; b.life = dead ? rnd(5, 9) : rnd(2.5, 4.5); }
            if (b.mode === 1 && b.wp.y < b.size / 2) { b.wp.y = b.size / 2; b.vel.y = Math.abs(b.vel.y) * 0.3; }
          }
          if (b.mode === 2) {
            // flying back into place: the boss reforms
            b.ret += adt / 0.45;
            attachPos(b, p);
            const u = ease(b.ret);
            b.wp.lerpVectors(b.from, p, u);
            b.rot.x *= 0.85; b.rot.y *= 0.85; b.rot.z *= 0.85;
            if (b.ret >= 1) { b.mode = dead ? 3 : 0; }
          }
          // debris on the floor sinks away so the raid stays clear
          if (b.mode === 4) { b.life -= adt; if (b.life < 0) b.wp.y -= adt * 0.8; if (b.wp.y < -1) b.mode = 5; }
          if (b.mode === 5) { m4.makeScale(0, 0, 0); body.setMatrixAt(i, m4); continue; }
          q.setFromEuler(b.rot);
          sc.setScalar(b.size * (b.mode === 4 ? 0.85 : 1));
          m4.compose(b.wp, q, sc);
        }
        body.setMatrixAt(i, m4);
      }
      body.instanceMatrix.needsUpdate = true;

      // core, eyes, rings, weak point
      hitGlow = Math.max(0, hitGlow - adt * 5);
      boxMat.uniforms.uHit.value = hitGlow;
      weakK += ((weakOn && !dead ? 1 : 0) - weakK) * Math.min(1, dt * 6);
      const critPulse = stage >= 4 && !calm ? 0.06 * Math.sin(at * 2 * Math.PI * 1.5) * still : 0;
      if (dead) {
        const kk = Math.max(0, 1 - deadT / 1.6);
        core.scale.setScalar(Math.max(0.001, kk * (1 + Math.sin(deadT * 20) * 0.05 * pulseK)));
        glowMat.opacity = 0.6 * kk;
        if (deadT > (kit && kit.POSES.slump ? 2.25 : 1.35) && !deadBoom) {
          deadBoom = true;
          if (opts.onBoom) opts.onBoom();
          if (kit && kit.POSES.slump) {
            // everything left flies apart, two walls of light run out, the floor is scorched under it
            for (const m of kit.shedSets.flat()) shedOne(m, false, 1.7);
            quakeWall(root.position, WHITE, 40, 1.3); quakeWall(root.position, RED, 30, 1.8);
            decal(v2.copy(root.position), 16, rnd(0, 6.28), 1, 12);
            if (dress) { dress.puff(anchorCore, 40, 2.4); dress.puff(v2.copy(root.position).setY(1), 20, 1.6); }
            lightPulse(anchorCore, WHITE, 1.6);
            scatter(N, 2.4);
          }
          v1.copy(anchorCore);
          burst(v1, 260, 18, pal.a, 1.2, 4);
          burst(v1, 120, 10, WHITE, 1, 2);
          wave(root.position, 1, 45, 2.4, pal.a, 1);
          wave(root.position, 1, 30, 1.6, WHITE, 0.6);
          shake = Math.max(shake, 1.2);
          if (canFlash()) flare(v1, pal.a, 18, 0.6, 1.4);
          eyes.forEach(e => { e.visible = false; });
          rings.forEach(r => { if (!r.userData.gone) { r.userData.fall = true; r.userData.vel.set(rnd(-3, 3), rnd(1, 4), rnd(1, 4)); } });
        }
        if (deadT > 1.6 && palTo !== 5) { palFrom = palTo; palTo = 5; palT = 0; palAt = t; }
      } else {
        deadBoom = false;
        core.scale.setScalar(1 + (0.05 * Math.sin(at * 3) * pulseK) + critPulse + charge * 0.35);
        glowMat.opacity = 0.3 + hitGlow * 0.2 + charge * 0.35 + weakK * 0.15;
        glow.scale.setScalar((6.5 + charge * 5 + weakK * 1.5) * (kit ? 0.45 : 1));
      }
      const coreBase = stage >= 3 ? coreRed : stage >= 2 ? coreAmber : coreGreen;
      coreMat.color.copy(coreBase).lerp(coreWeak, Math.max(weakK, charge * 0.7));
      glowMat.color.copy(coreMat.color).multiplyScalar(0.45);
      eyeMat.color.copy(stage >= 3 || phase >= 3 ? coreRed : WHITE).lerp(coreWeak, charge);
      retMat.opacity = weakK * 0.95;
      reticle.visible = weakK > 0.02;
      reticle.quaternion.copy(partQ[0]).invert().multiply(camera.quaternion);
      reticle.rotateZ(at * 0.8 * still);
      reticle.scale.setScalar(1 + (1 - weakK) * 0.6);
      coreMesh.rotation.y += adt * 0.6 * still;
      cage.rotation.x -= adt * 0.35 * still; cage.rotation.y += adt * (0.5 + phase * 0.2) * still;
      rings.forEach(r => {
        const u = r.userData;
        if (u.gone) return;
        const sp = 1 + phase * 0.35;
        r.rotation.x += u.spin.x * adt * still * sp; r.rotation.y += u.spin.y * adt * still * sp;
        if (u.fall) {
          u.vel.y -= 12 * adt; r.position.addScaledVector(u.vel, adt);
          r.material.opacity = Math.max(0, r.material.opacity - adt * 0.5);
          if (r.material.opacity <= 0) { u.gone = true; r.visible = false; }
        }
      });
      eyes.forEach(e => { e.scale.y = stunned ? (Math.sin(t * 23) > 0 ? 0.15 : 1) : phase >= 4 && !calm && Math.sin(at * 3) > 0.92 && still === 1 ? 0.3 : 1; });

      // telegraph, beam and sweep
      const sl = dead ? null : current(t, 'slam');
      if (sl && t < sl.h && !sl.cut) {
        const w = clamp((t - sl.s) / (sl.h - sl.s), 0, 1);
        tele.visible = teleFill.visible = true;
        // the ring marks the danger zone, and the fill grows to meet it at the moment of the hit
        const R = 5.6, blink = w > 0.8 && !reduce ? 0.5 + 0.5 * Math.sin(t * 40) : 1;
        const ta = sl.at || aim;
        tele.position.set(ta.x, 0.06, ta.z); tele.scale.setScalar(R + Math.sin(t * (6 + 14 * w)) * 0.1 * still);
        teleFill.position.copy(tele.position); teleFill.scale.setScalar(Math.max(0.05, R * 0.97 * ease(w)));
        tele.material.opacity = (0.5 + 0.45 * w) * blink;
        teleFill.material.opacity = 0.14 + 0.3 * w;
        const blk = sl.side ? !!(sl.blocked && t >= sl.blocked) : blocked.has(sl.id);
        tele.material.color.copy(blk ? CYAN : RED);
        teleFill.material.color.copy(blk ? CYAN : RED).multiplyScalar(0.4);
        if (sl.kind === 'beam' || sl.kind === 'laser') {
          beam.visible = true;
          setBeam(anchorCore, v3.copy(ta).setY(sl.side ? 1.6 : ta.y), sl.kind === 'laser' ? 0.05 + 0.25 * w * w : 0.06 + 0.05 * w);
          beamMat.opacity = 0.25 + 0.35 * w;
        }
      } else { tele.visible = teleFill.visible = false; }
      if (t < beamUntil) {
        beam.visible = true;
        const u = (beamUntil - t) / beamLen;
        setBeam(anchorCore, beamTo, beamW * u + 0.2);
        beamMat.opacity = 0.9 * u;
      } else if (!(sl && !sl.cut && (sl.kind === 'beam' || sl.kind === 'laser') && t < sl.h)) beam.visible = false;
      const su = t - sweepT0;
      if (su < 0.45) {
        sweepBar.visible = true;
        // across the target, side to side as the boss sees it
        const yaw = Math.atan2(sweepAt.x - root.position.x, sweepAt.z - root.position.z), d = 16 - 32 * ease(su / 0.35);
        sweepBar.position.set(sweepAt.x + Math.cos(yaw) * d, 0.8, sweepAt.z - Math.sin(yaw) * d);
        sweepBar.rotation.y = yaw;
        sweepMat.opacity = 0.85 * (1 - su / 0.45);
      } else sweepBar.visible = false;

      // shield
      if (shieldF !== null) {
        shieldShow = Math.min(1, shieldShow + dt * 1.6);
        shield.visible = true;
        shield.position.copy(root.position).setY(8.4);
        const g = ease(shieldShow);
        shield.scale.set(11.5 * g, 10.5 * g, 7.5 * g);
        shieldMat.uniforms.uAmt.value = 0.35 + 0.65 * shieldF;
        shieldMat.uniforms.uCol.value.copy(CYAN);
      } else if (t - shieldBreakT < 0.5) {
        const u = (t - shieldBreakT) / 0.5;
        shield.visible = true;
        shield.scale.set(11.5 * (1 + u * 0.4), 10.5 * (1 + u * 0.4), 7.5 * (1 + u * 0.4));
        shieldMat.uniforms.uAmt.value = 1 - u;
      } else shield.visible = false;

      // shots
      for (const s of shots) {
        if (!s.on) continue;
        if (s.ret >= 0) {
          const u = (t - s.ret) / 0.45;
          s.pos.lerpVectors(s.retFrom, anchorCore, ease(u));
          if (u >= 1) {
            s.on = false; s.g.visible = false;
            burst(anchorCore, 24, 9, GREEN); flare(anchorCore, GREEN, 5, 0.25, 1);
            recoilV -= 1.4; jolt = Math.min(0.9, jolt + 0.55); headJerk = 1;
            shake = Math.max(shake, 0.35); stopUntil = Math.max(stopUntil, performance.now() + 70);
          }
        } else {
          const u = (t - s.launch) / (s.arrive - s.launch);
          if (u >= 1) {
            s.on = false; s.g.visible = false;
            burst(s.to, 16, 6, RED);
            continue;
          }
          s.pos.lerpVectors(s.from, s.to, u);
          s.pos.y += Math.sin(u * Math.PI) * 4;
          s.pos.x += Math.sin(u * Math.PI * 2 + s.lane) * 1.2 * still;
        }
        s.g.position.copy(s.pos);
        s.g.rotation.set(at * 2 * still, at * 3 * still, 0);
        const sz = 0.8 + 0.6 * clamp((t - s.launch) / Math.max(0.1, s.arrive - s.launch), 0, 1);
        s.g.scale.setScalar(sz);
        if (Math.random() < adt * 20) burst(s.pos, 1, 1, s.ret >= 0 ? GREEN : CYAN, 0.2, 0);
      }

      // adds
      let ti = 0;
      for (let i = 0; i < ADDS; i++) {
        const a = adds[i];
        for (let c = 0; c < ADD_CUBES; c++) { m4.makeScale(0, 0, 0); addCubes.setMatrixAt(i * ADD_CUBES + c, m4); }
        if (!a.on) continue;
        if (t >= a.until && a.dying < 0) a.dying = t;
        let k2 = clamp((t - a.spawn) / 0.5, 0, 1);
        if (a.dying >= 0 && t >= a.dying) {
          const u = (t - a.dying) / 0.35;
          if (u >= 0 && !a.boomed) { a.boomed = true; burst(a.pos, 34, 9, AMBER); flare(a.pos, AMBER, 4, 0.25, 0.9); }
          k2 *= Math.max(0, 1 - u);
          if (u >= 1) { a.on = false; a.boomed = false; a.m.visible = false; continue; }
        }
        v1.copy(ADD_SLOTS[a.slot]).add(root.position);
        v1.y += Math.sin(at * 1.4 + a.seed) * 0.6 * still;
        a.pos.lerp(v1, Math.min(1, adt * 3));
        a.m.position.copy(a.pos); a.m.scale.setScalar(k2); a.m.rotation.y += adt * 2 * still;
        for (let c = 0; c < ADD_CUBES; c++) {
          const ang = at * 1.6 * (still || 0.3) + c * Math.PI * 2 / ADD_CUBES + a.seed;
          p.set(Math.cos(ang) * 1.5, Math.sin(ang * 2) * 0.5, Math.sin(ang) * 1.5).multiplyScalar(k2).add(a.pos);
          e3.set(ang, ang * 0.5, 0); q.setFromEuler(e3); sc.setScalar(0.55 * k2);
          m4.compose(p, q, sc); addCubes.setMatrixAt(i * ADD_CUBES + c, m4);
        }
        if (a.dying < 0 && k2 > 0.5) {
          tethPos[ti * 6] = a.pos.x; tethPos[ti * 6 + 1] = a.pos.y; tethPos[ti * 6 + 2] = a.pos.z;
          tethPos[ti * 6 + 3] = anchorCore.x; tethPos[ti * 6 + 4] = anchorCore.y; tethPos[ti * 6 + 5] = anchorCore.z;
          ti++;
        }
      }
      for (let i = ti; i < ADDS; i++) for (let j = 0; j < 6; j++) tethPos[i * 6 + j] = 0;
      tethGeo.attributes.position.needsUpdate = true;
      tethGeo.setDrawRange(0, ti * 2);
      addCubes.instanceMatrix.needsUpdate = true;

      // bolts
      for (let i = 0; i < BOLTS; i++) {
        const b = bolts[i];
        if (!b.on) { m4.makeScale(0, 0, 0); boltMesh.setMatrixAt(i, m4); continue; }
        b.t += dt / b.dur;
        if (b.target === -3) v2.copy(b.addRef.pos);
        else targetPos(b, v2);
        if (b.shield && b.h) clipShell(b.from, v2);   // stop on the shell, along the line to the target
        if (b.t >= 1) {
          b.on = false;
          if (b.h) land(b.h, v2, b.target);
          else if (b.target === -3) { burst(v2, 20, 8, b.col); }
          m4.makeScale(0, 0, 0); boltMesh.setMatrixAt(i, m4);
          continue;
        }
        const hd = ease(b.t), tl = ease(Math.max(0, b.t - b.tail));
        v1.lerpVectors(b.from, v2, hd); p.lerpVectors(b.from, v2, tl);
        const len = Math.max(0.05, v1.distanceTo(p));
        v3.copy(v1).sub(p).normalize();
        q.setFromUnitVectors(v1.set(0, 0, 1), v3);
        p.add(v1.copy(v3).multiplyScalar(len / 2));
        sc.set(b.w, b.w, len);
        m4.compose(p, q, sc);
        boltMesh.setMatrixAt(i, m4);
        boltMesh.setColorAt(i, b.col);
      }
      boltMesh.instanceMatrix.needsUpdate = true;
      if (boltMesh.instanceColor) boltMesh.instanceColor.needsUpdate = true;

      // raid markers
      for (let i = 0; i <= RAID; i++) {
        const you = i === RAID;
        markGlow[i] = Math.max(0, markGlow[i] - adt * 4);
        p.copy(raidPos[i]); p.y += Math.sin(at * 2 + i) * 0.12 * still;
        e3.set(0, at * (you ? 1.5 : 0.8) * still + i, 0); q.setFromEuler(e3);
        sc.setScalar(you ? 1.5 : i >= SHOWN || i >= ONSCREEN ? 0 : 0.9 + markGlow[i] * 0.3);
        m4.compose(p, q, sc); marks.setMatrixAt(i, m4);
        if (you) tmpCol.copy(youCol).multiplyScalar(1.8);
        else tmpCol.copy(raidCol(i)).multiplyScalar(0.35 + markGlow[i] * 0.9);
        marks.setColorAt(i, tmpCol);
      }
      marks.instanceMatrix.needsUpdate = true;
      if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
      youRing.rotation.z = at * still;

      // pillars
      pilH += (pilHT - pilH) * Math.min(1, adt * 0.8);
      for (let i = 0; i < PIL; i++) {
        const d = pilData[i];
        const h = d.h * pilH * (0.75 + 0.25 * Math.sin(at * d.s + i) * pulseK);
        p.set(d.x, h / 2, d.z); q.identity(); sc.set(d.w, h, d.w);
        m4.compose(p, q, sc); pillars.setMatrixAt(i, m4);
      }
      pillars.instanceMatrix.needsUpdate = true;

      // shards
      for (let i = 0; i < SH; i++) {
        const d = shardData[i];
        d.a += d.s * adt * still * (dead ? 0.2 : 1 + phase * 0.3);
        const y = dead ? Math.max(0.3, d.y - deadT * 3) : d.y + Math.sin(at * d.k + i) * 0.4 * still;
        p.set(Math.cos(d.a) * d.r + root.position.x * 0.5, y, Math.sin(d.a) * d.r * 0.6);
        e3.set(at * d.k * still, at * still, 0); q.setFromEuler(e3);
        sc.setScalar(d.k * 0.55);
        m4.compose(p, q, sc);
        shards.setMatrixAt(i, m4);
      }
      shards.instanceMatrix.needsUpdate = true;

      // sparks, flares, waves
      for (let i = 0; i < SP; i++) {
        if (spLife[i] <= 0) continue;
        spLife[i] -= adt;
        spVel[i * 3 + 1] -= spGrav[i] * adt;
        spPos[i * 3] += spVel[i * 3] * adt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * adt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * adt;
        if (spLife[i] <= 0) spPos[i * 3 + 1] = -100;
      }
      spGeo.attributes.position.needsUpdate = true;
      spGeo.attributes.color.needsUpdate = true;
      for (const f of flares) {
        if (!f.m.visible) continue;
        f.t += adt;
        const u = f.t / f.life;
        if (u >= 1) { f.m.visible = false; continue; }
        f.m.scale.setScalar(f.size * (0.6 + 0.6 * ease(u)));
        f.m.material.opacity = (1 - u) * 0.9;
      }
      for (const w of waves) {
        if (!w.m.visible) continue;
        w.t += adt;
        const u = w.t / w.life;
        if (u >= 1) { w.m.visible = false; continue; }
        w.m.scale.setScalar(w.r0 + (w.r1 - w.r0) * ease(u));
        w.m.material.opacity = (1 - u) * w.op;
      }
      if (phase >= 4 && !dead && Math.random() < adt * 8) burst(v1.set(rnd(-20, 20), 0.2, rnd(-10, 6)), 1, 3, pal.a, 1.5, -1);

      orbitTick(t, dt);
      // camera: follows the boss a little, shakes on big moments, leans in on a roar
      shake = Math.max(0, shake - adt * 2);
      const sh = shake * shakeK;
      const roarK = Math.sin(clamp((t - roarAt) / 2.6, 0, 1) * Math.PI) * (reduce ? 0.3 : 1);
      gamePos.set(
        camBase.x + root.position.x * 0.12 + Math.sin(at * 0.21) * 0.6 * still,
        camBase.y + Math.sin(at * 0.17) * 0.25 * still,
        camBase.z - roarK * 3);
      // the view follows your bot a little as it flies
      if (flight) gamePos.x += (raidPos[RAID].x - homePos[RAID].x) * 0.35;
      // through a swing round the boss: back and up, trailing the turn
      if (orbit.k) { gamePos.z += 4 * orbit.k; gamePos.y += 1.6 * orbit.k; gamePos.x -= clamp(orbit.w, -1.6, 1.6) * 2.2; }
      v1.set(root.position.x * 0.45, camLook.y + (cur.y - 0.4) * 0.5 + adv * 1.6 * still, root.position.z * 0.3);
      lookCur.lerp(v1, Math.min(1, dt * 2));
      if (threatK > 0.001) { v2.copy(anchorCore); v2.y += 1.5; gameLook.copy(lookCur).lerp(v2, threatK * 0.4); }
      else gameLook.copy(lookCur);
      gameFov = baseFov * (1 - 0.12 * adv * still) * (1 - 0.3 * threatK) * (1 + 0.1 * orbit.k);
      // the segfault lifts it high: the view tilts up with it and pulls back a little so it stays in frame
      if (liftY > 0) { gameLook.y += liftY * 0.85; gamePos.y += liftY * 0.35; gameFov *= 1 + liftY * 0.035; }
      let shotNow = 'game';
      if (director) {
        if (!dirOpened && t - bornAt > 1.0 && BOT) { dirOpened = true; play('intro'); }
        dirCtx.threatAt = threatAt(t);
        dirCtx.line = [root.position, raidPos[RAID]]; dirCtx.homeSide = 0;
        dirCtx.occluders = [{ c: anchorCore, r: bossH() * 0.3 }];
        faceV.copy(raidPos[RAID]); faceV.y += 0.3;   // your bot's face, a little above its centre
        dirCtx.subjects = { head: anchorHead, core: anchorCore, you: raidPos[RAID], face: faceV };
        shotNow = director.update(t, dt, dirCtx);
      } else { keepHead(gamePos, gameLook, gameFov, 0.84); camera.position.copy(gamePos); camera.lookAt(gameLook); }
      // shake on top of whichever shot plays
      camera.position.x += Math.sin(t * 41) * sh * 0.5; camera.position.y += Math.sin(t * 37 + 1) * sh * 0.4;
      // banking into a swing, and a slow hand-held roll, on the game shot
      if (!reduce && shotNow === 'game') camera.rotateZ(clamp(-orbit.w * 0.13, -0.15, 0.15) + Math.sin(t * 0.53) * 0.006 + Math.sin(t * 1.7) * 0.003);
      // the barrier in front of the raid while your block waits for the blow, cracking when it lands
      {
        const bx = blocked.size ? evs.find(z => z.type === 'slam' && !z.side && z.blocked && t < z.h + 0.35 && !z.cut) : null;
        const hu = t - barrierHitAt;
        const a = bx ? (t < bx.h ? Math.min(1, (t - bx.blocked) / 0.15) * (0.22 + 0.06 * Math.sin(t * 20)) : Math.max(0, 0.9 * (1 - hu / 0.35))) : 0;
        barrier.visible = a > 0.01;
        if (barrier.visible) {
          barrierMat.opacity = a;
          barrier.position.copy(aim); barrier.position.z -= 3; barrier.position.y = 3.2;
          barrier.scale.setScalar(5.5 + (hu < 0.35 ? 1.2 * (1 - hu / 0.35) : 0));
          barrier.rotation.set(0, 0, t * 0.4);
        }
      }
      // a flank squad's barrier, from their block until the blow lands on it
      {
        const bx = evs.find(z => z.side && z.outcome === 'block' && !z.cut && t >= z.blocked && t < z.h + 0.35);
        const hu = t - sideHitAt;
        const a = bx ? (t < bx.h ? Math.min(1, (t - bx.blocked) / 0.15) * (0.24 + 0.06 * Math.sin(t * 20)) : Math.max(0, 0.9 * (1 - hu / 0.35))) : 0;
        barrier2.visible = a > 0.01;
        if (barrier2.visible) {
          barrier2Mat.opacity = a;
          v1.copy(root.position).sub(bx.at).setY(0).normalize();
          barrier2.position.copy(bx.at).addScaledVector(v1, 3); barrier2.position.y = 3.2;
          barrier2.lookAt(root.position.x, 3.2, root.position.z);
          barrier2.scale.setScalar(5 + (hu < 0.35 && hu >= 0 ? 1.1 * (1 - hu / 0.35) : 0));
          barrier2.rotateZ(t * 0.4);
        }
      }
      if (!director && Math.abs(camera.fov - gameFov) > 0.01) { camera.fov = gameFov; camera.updateProjectionMatrix(); }

      // post
      tintAmt = Math.max(0, tintAmt - dt * 1.4);
      post.uniforms.uTintAmt.value = tintAmt;
      glitch = !calm && !reduce ? (phase >= 4 && !dead ? 0.35 : 0) + Math.max(0, roarK * 0.5) : 0;
      if (t < glitchUntil && !reduce) glitch += glitchK * (calm ? 0.5 : 1); else glitchK = 0;
      if (stunned && !reduce) glitch += calm ? 0.15 : 0.3;
      dimCur += ((t < dimUntil ? dimK : 0) - dimCur) * Math.min(1, dt * (t < dimUntil ? 3 : 2));
      post.uniforms.uDim.value = dimCur * (reduce ? 0.6 : 1);
      post.uniforms.uGlitch.value = glitch;
      post.uniforms.uTime.value = t;
      { const age = t - waveAt; post.uniforms.uWave.value.z = age; post.uniforms.uWaveK.value = age < 0.9 ? waveK * (1 - age / 0.9) : 0; }
      post.uniforms.uAb.value = calm ? 0 : sh * 0.002;
      if (window.__camProbe) {   // camera test probe: tools/camera logs where the camera and the fighters are each frame
        const P2 = (v, n) => { v1.copy(v).project(camera); return [n, +v1.x.toFixed(3), +v1.y.toFixed(3), +v1.z.toFixed(3)]; };
        const feet = new V(root.position.x, 0, root.position.z);
        const sl = own(t), lk = locks.find(l => l.slot === RAID && t < l.h + 0.3);
        const ds = director ? director.shot() : 'game';
        window.__camLog.push({ t: +t.toFixed(3), fov: +camera.fov.toFixed(2), cam: camera.position.toArray().map(x => +x.toFixed(2)),
          q: camera.quaternion.toArray().map(x => +x.toFixed(4)), cut: ds === 'game' ? '' : ds,
          wind: !!(sl && !sl.cut && t > sl.s && t < sl.h + 0.3) || !!lk, windH: sl && !sl.cut ? +(sl.h - t).toFixed(2) : null, dead,
          pts: [P2(anchorHead, 'head'), P2(anchorCore, 'core'), P2(feet, 'feet'), P2(raidPos[RAID], 'you'), P2(aim, 'aim'),
                P2(raidPos[0], 'm0'), P2(raidPos[3], 'fl1'), P2(raidPos[7], 'fl2')] });
      }
      if (fx) fx.update(adt);
      renderer.info.reset();
      composer.render();
      lastCalls = renderer.info.render.calls; lastTris = renderer.info.render.triangles;
      if (opts.onFrame) opts.onFrame();
    });
    const tmpCol = new THREE.Color();
    let deadBoom = false;

    function setBeam(a, b, r) {
      v1.copy(b).sub(a);
      const len = v1.length();
      beam.position.copy(a).addScaledVector(v1, 0.5);
      beam.quaternion.setFromUnitVectors(v2.set(0, 1, 0), v1.normalize());
      beam.scale.set(r, len, r);
    }

    function dispose() {
      renderer.setAnimationLoop(null);
      crew.forEach(c => c.op.dispose()); crew.length = 0;
      if (flight) flight.dispose();
      if (crowd) crowd.dispose();
      if (fx) fx.dispose();
      ro.disconnect(); io.disconnect();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
      disposables.forEach(d => d.dispose && d.dispose());
      bloom.dispose();
      composer.dispose && composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    function live() { return visible && !document.hidden; }
    function cast(id, c = {}) { if (fx && !dead) fx.cast(id, { caster, target: bossTarget, hits: c.hits, effect: c.effect }); }
    function aura(name, on) { if (fx) fx.aura(name, on, { caster, target: bossTarget }); }
    function fxEvent(kind) { if (fx) fx.event(kind, { caster }); }
    function freezeAttack(id) { frozen.add(id); }
    // ---------- the charge orb (js/app/combat/fx3d.js): words feed it, the release fires one attack ----------
    const orbAt = new V();
    // the orb hangs in front of the camera, low in the middle of the frame, between you and the boss
    const orbPos = out => { camera.getWorldDirection(v1); out.copy(camera.position).addScaledVector(v1, 11); out.y -= 1.7; return out; };
    function chargeOrb(level, tier) { if (fx && !dead) fx.charge(orbPos(orbAt), level, tier); }
    function feed() { if (fx && !dead) fx.feed(gun(v2) || v2.copy(raidPos[RAID]).setY(raidPos[RAID].y + 0.4), orbPos(orbAt), youKb()); }
    // onLand(x, y): the impact's place on screen, for the damage number
    function release(tier, power, onLand) {
      if (!fx || dead) { if (onLand) onLand(null, null); return; }
      const from = orbPos(new V());
      act('you', tier >= 3 && power >= 0.6 ? 'attack' : 'cast');
      if (flight) { if (tier >= 3 && power >= 0.6) flight.strike(nowS()); else if (tier >= 1) flight.strafe(RAID, nowS()); }
      if (tier >= 3 && power >= 0.6) play(Math.random() < 0.6 ? 'strike' : 'back');
      const ti = -2, sh = shieldF !== null;   // a release always goes for the core
      fx.release(tier, power, from, out => aimAt(ti, sh, from, out), at => {
        recoilV -= 0.3 + 1.4 * power;
        recoilSide = clamp((at.x - root.position.x) / 6, -1, 1);
        for (let k = 0; k < 2 + power * 12; k++) { const j = pickBlock(true); if (j >= 0) knock(blocks[j], false, 0.6 + power); }
        if (power > 0.6 && canFlash()) hitGlow = calm ? 0.5 : 1;
        markGlow[RAID] = 1;
        if (onLand) { v3.copy(at).project(camera); onLand((v3.x * 0.5 + 0.5) * host.clientWidth, (-v3.y * 0.5 + 0.5) * host.clientHeight); }
      }, youKb());
    }
    // tests only: hold every animation still so a capture shows one exact moment
    let paused = false;
    function pause(on) { paused = !!on; }
    function info() { return { phase, palTo, stage, dead, shots: shots.filter(s => s.on).length, adds: adds.filter(a => a.on).length, evs: evs.length, x: mv.x, z: mv.z, fx: fx ? fx.info() : null, calls: lastCalls, tris: lastTris }; }

    setFrac(1, true);
    applyPal(1);
    // for tests: where the raid's bots are, the target zone's centre, who is down
    const raidInfo = () => ({ crew: crew.map(c => c.id), locks: locks.map(l => ({ slot: l.slot, out: l.outcome, fired: l.fired })), side: evs.filter(z => z.side).map(z => ({ k: z.side, kind: z.kind, out: z.outcome, cut: !!z.cut, hit: z.hitDone })), st: flight ? [0, 1, 2].map(i => { const s = flight.S[i]; return { run: !!s.run, down: s.downAt, rep: s.repairOf, by: s.repairBy }; }) : null, threat: (() => { const x = own(nowS()); return x ? { id: x.id, toHit: +(x.h - nowS()).toFixed(2), cut: !!x.cut } : null; })(), aim: aim.toArray(), pos: raidPos.slice(0, ONSCREEN).concat([raidPos[RAID]]).map(p => p.toArray().map(x => +x.toFixed(2))), down: flight ? raidPos.map((_, i) => flight.isDown(i) ? i : -1).filter(i => i >= 0) : [] });
    return { raidInfo, breakCharge, setHit, wave, live, setPhase, setFrac, event, hit, returnShot, killAdd, block, stagger, hurt, setShield, setWeak, defeat, revive, screen, info, dispose, cast, aura, fxEvent, react, freezeAttack, pause, charge: chargeOrb, feed, release, crew: setCrew, act, lock, sideAttack, orbitInfo: () => ({ phi: orbit.phi, w: orbit.w, turn: bossTurn }), director: () => director,
      aq: () => (aq ? aq.state() : null),
      dbg: () => ({ THREE, scene, camera, renderer, dress, kit, root, extras: [dust, decals, rainMesh, retMesh, guide, scanBeam, scanHot, ...qWalls.map(w => w.m)], liftY, gameLook: gameLook.clone(), lookCur: lookCur.clone(), adv, curY: cur.y }) };
  }

  return { mount };
})();
