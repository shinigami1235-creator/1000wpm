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
//   freezeAttack(id)                   cryo lock: that attack's hit shows as held off for you
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
      act: (who, kind) => impl && impl.act(who, kind),
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
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
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
    codeTex.repeat.set(7, 3);
    const wallMat = keep(new THREE.MeshBasicMaterial({ map: codeTex, color: pal.a, transparent: true, opacity: 0.09, depthWrite: false, fog: false }));
    const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(150, 60)), wallMat);
    wall.position.set(0, 20, -40);
    scene.add(wall);
    const grid = new THREE.GridHelper(160, 80, '#ffffff', '#ffffff');
    grid.material.transparent = true; grid.material.opacity = 0.32; grid.material.color = pal.b.clone();
    keep(grid.geometry); keep(grid.material);
    scene.add(grid);
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
    const PIL = 22;
    const pilMat = edgeMat(pal.b, pal.a, 130);
    const pillars = new THREE.InstancedMesh(seededBox(PIL, i => (i % 5 === 0 ? 1 : 0)), pilMat, PIL);
    const pilData = Array.from({ length: PIL }, (_, i) => {
      const a = Math.PI * (0.05 + 0.9 * i / (PIL - 1)) + rnd(-0.04, 0.04);
      const r = rnd(34, 46);
      return { x: -Math.cos(a) * r, z: -Math.sin(a) * r * 0.75 + 4, w: rnd(1.6, 3.2), h: rnd(6, 22), k: rnd(0.3, 1), s: rnd(0.2, 0.6) };
    });
    pillars.frustumCulled = false;
    scene.add(pillars);
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
      for (const m of set) {
        if (m.userData.home) continue;
        m.userData.home = { parent: m.parent, pos: m.position.clone(), quat: m.quaternion.clone(), scale: m.scale.clone() };
        if (instant) { m.visible = false; kit.shed.push(m); continue; }
        scene.attach(m);
        const out = m.getWorldPosition(vF).sub(root.position).setY(0).normalize();
        m.userData.vel = new V(out.x * rnd(4, 7), rnd(6, 10), out.z * rnd(2, 4) + rnd(2, 5));
        m.userData.spin = new V(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4));
        m.userData.life = rnd(3, 4.5);
        kit.shed.push(m);
        burst(vF.copy(m.position), 40, 12, GREEN, 1.4, 9);
        burst(vF, 20, 8, WHITE, 1, 9);
        flare(vF, GREEN, 5, 0.25, canFlash() ? 1.1 : 0.5);
      }
      if (!instant) { shake = Math.max(shake, 0.7); stopUntil = Math.max(stopUntil, performance.now() + 90); }
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
        if (u.life < 0) { m.position.y -= dt * 1.2; if (m.position.y < -3) m.visible = false; }
      }
    }
    function unshed() {
      if (!kit) return;
      for (const m of kit.shed) { const h = m.userData.home; h.parent.add(m); m.position.copy(h.pos); m.quaternion.copy(h.quat); m.scale.copy(h.scale); m.visible = true; m.userData = {}; }
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
    function placeRaid(halfW) {
      const w = Math.min(15, halfW * 0.86);
      for (let i = 0; i < RAID; i++) {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) + 1;
        const x = side * (1.6 + (k / (RAID / 2)) * (w - 1.6));
        raidPos[i].set(x, 0.55, raidZ - Math.abs(x) * 0.18 + (k % 2) * 0.6);
      }
      raidPos[RAID].set(0, 0.7, raidZ + 0.6);
      youRing.position.set(0, 0.04, raidZ + 0.6);
      // with operators standing there, shots leave from their chests
      if (OPS) for (const p of raidPos) p.y = 1.9;
    }

    // ---------- operators (js/app/operator3d.js) ----------
    // You and your squad stand in the raid as full characters, facing the boss; everyone else is one
    // instanced crowd. They type while words land, cast on a release, flinch when hit, kneel when down.
    const OPS = window.Operator ? 1.7 : 0;    // about 3 units tall against the 16-unit titan
    const TH = { ...THREE, RoundedBoxGeometry: opts.RoundedBoxGeometry };
    const crew = [];                          // { id, op, slot, typeAt, down }
    let crowd = null, won = false;
    const crowdCol = new THREE.Color(), crowdTint = [];
    function addOp(id, preset, slot) {
      const op = Operator.create(TH, preset, { lite: id !== 'you' });   // full detail for you only
      op.group.scale.setScalar(OPS); op.group.rotation.y = Math.PI;
      scene.add(op.group);
      const c = { id, op, slot, typeAt: -9, down: false, beat: Math.random() * 3 };
      crew.push(c); return c;
    }
    if (OPS) {
      if (!kit) scene.add(new THREE.HemisphereLight('#c9d3da', '#08090a', 0.9));
      addOp('you', Operator.mine(), RAID);
      crowd = Operator.crowd(TH, RAID);
      crowd.meshes.forEach(m => scene.add(m));
      for (let i = 0; i < RAID; i++) crowdTint.push(new THREE.Color('#ffffff').lerp(raidCol(i), 0.32));
      marks.visible = false;
    }
    // the squad mates take the three spots nearest you
    function setCrew(list) {
      if (!OPS) return;
      for (let i = crew.length - 1; i > 0; i--) { scene.remove(crew[i].op.group); crew[i].op.dispose(); crew.splice(i, 1); }
      (list || []).slice(0, 3).forEach((m, i) => addOp(m.id, m.preset, i));
    }
    function act(who, kind) {
      const c = crew.find(x => x.id === who);
      if (!c) return;
      if (kind === 'type') c.typeAt = nowS();
      else if (kind === 'cast' || kind === 'hit') { if (!c.down) c.op.once(kind); }
      else if (kind === 'down') c.down = true;
      else if (kind === 'up') c.down = false;
    }
    const opM = new THREE.Matrix4(), opQ = new THREE.Quaternion(), opS = new V(), opP = new V(), opE = new THREE.Euler();
    function opsTick(t, dt) {
      if (!OPS) return;
      for (const c of crew) {
        const p = raidPos[c.slot];
        c.op.group.position.set(p.x, 0, p.z);
        // mates keep typing; you type while your words are landing
        if (c.id !== 'you' && t - c.typeAt > 1.6 && Math.random() < dt * 2) c.typeAt = t;
        const anim = c.down ? 'defeat' : won ? 'victory' : t - c.typeAt < 1.3 ? 'type' : 'idle';
        c.op.play(anim);
        c.op.update(dt);
      }
      // the rest of the raid: two instanced crowds, male and female, mixed along both sides
      const used = new Set(crew.map(c => c.slot));
      const n = [0, 0];
      for (let i = 0; i < RAID; i++) {
        if (used.has(i) || i >= SHOWN) continue;
        const k = Math.floor(i / 2) % 2, m = crowd.meshes[k], p = raidPos[i];   // spots alternate sides, so pair them up for the base
        opP.set(p.x, Math.max(0, Math.sin(t * 9 + i) * 0.06 * markGlow[i]), p.z);
        opQ.setFromEuler(opE.set(0, Math.PI + Math.sin(i * 1.7) * 0.25, 0));
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
          float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
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
            float band = exp(-pow((r - front) * 9.0, 2.0)) * uWaveK;
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
    const caster = { pos: out => out.copy(raidPos[RAID]).setY(raidPos[RAID].y + 0.9) };
    const bossTarget = {
      size: 6,
      pos: out => out.copy(anchorCore),
      top: out => out.copy(anchorHead).setY(anchorHead.y + 1),
      base: out => out.set(root.position.x, 0, root.position.z + 1),
      react: (k, p, x) => react(k, p, x),
    };

    const camBase = new V(0, 5.5, 30), camLook = new V(0, 7.4, 0), lookCur = new V(0, 7.4, 0);
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
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);
    fit();

    // ---------- state ----------
    let frac = 1, stage = 0, phase = 0, dead = false, deadT = 0, deadAt = 0;
    let shake = 0, hitGlow = 0, stopUntil = 0, slowUntil = 0, tintAmt = 0, glitch = 0;
    let recoil = 0, recoilV = 0, recoilSide = 0, headJerk = 0, weakOn = false, weakK = 0;
    let roarAt = -9, charge = 0;
    const STAGE_AT = [0.75, 0.5, 0.25, 0.1];
    const coreGreen = C(Theme.hex('accent'), 1.2), coreRed = C('#ff4d5e', 0.95), coreAmber = C('#f29d30', 1.0), coreWeak = C('#ffb347', 1.15);
    const evs = [];            // attacks on the scene clock
    const blocked = new Set();
    const anchors = new Map();
    const mv = { x: 0, z: 0, tx: 0, tz: 0, y: 0, face: 0, spin: 0, spinV: 0, next: 0, lungeAt: -9, blinkAt: -9 };

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V(), sc = new V(), e3 = new THREE.Euler();
    const v1 = new V(), v2 = new V(), v3 = new V();

    function attachPos(b, out) { return b.km ? out.copy(b.kl).applyMatrix4(b.km.matrixWorld) : out.copy(b.local).applyMatrix4(partG[b.part].matrixWorld); }
    function knock(b, permanent, power = 1) {
      if (b.mode >= 3) return;
      if (b.mode === 0) attachPos(b, b.wp);
      const out = v1.copy(b.wp).sub(root.position).setY(0).normalize();
      if (permanent) {
        b.mode = 3; b.grav = 1;
        b.vel.set(out.x * rnd(2, 6), rnd(2, 7), out.z * rnd(1, 3) + rnd(-1, 1.5)).multiplyScalar(power);
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
        roarAt = nowS();
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
      pilMat.uniforms.uColA.value.copy(pal.b); pilMat.uniforms.uColC.value.copy(pal.a);
      shardMat.color.copy(pal.a);
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
      const x = { id: ev.id, type: ev.type, kind: ev.kind, s: off(ev.start), e: off(ev.end), started: false, hitDone: false };
      if (ev.type === 'slam') { x.h = off(ev.hit); x.warned = 0; }
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
        if (x.type === 'slam' && t >= x.h && !x.hitDone) { x.hitDone = true; impact(x); }
        if (x.type === 'volley') for (const s of x.shots) if (!s.fired && t >= s.l) {
          s.fired = true;
          if (t >= s.a) continue;
          const sh = freeShot();
          sh.on = true; sh.id = s.id; sh.launch = s.l; sh.arrive = s.a; sh.ret = -1; sh.lane = s.lane;
          partG[3].updateMatrixWorld();
          sh.from.set(2.1, -6.8, 0.8).applyMatrix4(armRG.matrixWorld).add(v1.set((s.lane - 1.5) * 1.4, (s.lane % 2) * 1.6, 0));
          sh.to.copy(raidPos[RAID]).add(v1.set((s.lane - 1.5) * 1.6, 1.6 + (s.lane % 2) * 0.8, 0.5));
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
    function current(t, type) { for (const x of evs) if (x.type === type && t >= x.s && t <= x.e) return x; return null; }
    function impact(x) {
      const you = blocked.has(x.id) || frozen.has(x.id);
      const at = raidPos[RAID];
      shake = Math.max(shake, you ? 0.35 : 0.9);
      act('you', you ? 'cast' : 'hit');
      if (kit) {
        // the blow lands where the fists are: rings and dust from each fist, chunks of armour
        // shaken loose, a flash, a held frame and a short slow-motion beat for the big ones
        kit.group.updateMatrixWorld(true);
        const which = x.kind === 'slam' ? [0, 1] : x.kind === 'beam' ? [] : [1];
        const col = you ? CYAN : RED;
        for (const i of which) {
          kit.fists[i].at.getWorldPosition(vF); vF.y = 0.2;
          wave(vF, 0.5, x.kind === 'slam' ? 26 : 16, 1.0, col, 0.95);
          wave(vF, 0.3, x.kind === 'slam' ? 11 : 8, 0.5, WHITE, 0.85);
          burst(vF, 46, 15, WHITE, 1.7, 14);
          burst(vF, 26, 10, col, 1.3, 9);
          flare(vG.copy(vF).setY(1.2), col, x.kind === 'slam' ? 6 : 4.5, 0.22, canFlash() ? 1.2 : 0.6);
        }
        let n = 0;
        for (const b of blocks) { if (n >= (x.kind === 'slam' ? 10 : 5)) break; if (b.mode === 0 && (b.part >= 2 || x.kind === 'slam') && Math.random() < 0.2) { knock(b, false, 1.7); n++; } }
        if (x.kind === 'slam') { shake = Math.max(shake, you ? 0.5 : 1.35); if (!reduce) slowUntil = performance.now() + 380; }
        if (x.kind === 'lunge' || x.kind === 'sweep') shake = Math.max(shake, you ? 0.45 : 1.05);
        if (x.kind === 'beam') { flare(vG.copy(at).setY(2), col, 7, 0.28, canFlash() ? 1.2 : 0.6); burst(vG, 60, 16, col, 1.5, 9); }
        stopUntil = Math.max(stopUntil, performance.now() + (x.kind === 'slam' ? 120 : 80));
      }
      if (!kit && (x.kind === 'slam' || x.kind === 'lunge')) wave(root.position, 2, 34, 1.3, you ? CYAN : RED, 0.9);
      if (you) { burst(v1.copy(at).setY(2), 30, 9, CYAN, 1.2, 6); flare(v1, CYAN, 6, 0.3, canFlash() ? 1.2 : 0.6); }
      else burst(v1.copy(at).setY(1), 24, 7, RED, 1, 9);
      if (x.kind === 'beam') { beamUntil = nowS() + 0.55; }
      if (x.kind === 'sweep') { sweepT0 = nowS(); }
      stopUntil = Math.max(stopUntil, performance.now() + (you ? 80 : 50));
    }
    let beamUntil = 0, sweepT0 = -9;

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
    function raiderIndex(id) { const n = /^sim(\d+)$/.exec(id || ''); return n ? +n[1] % RAID : Math.floor(Math.random() * RAID); }
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
        const from = new V().copy(raidPos[RAID]).setY(raidPos[RAID].y + 0.6);
        fx.shot(Math.min(4, h.tier), from, out => aimAt(ti, sh, from, out), at => land(h, at, ti), { color: h.color });
        markGlow[RAID] = 1;
        return;
      }
      const ri = you ? RAID : raiderIndex(h.id);
      const b = bolts[boltI = (boltI + 1) % BOLTS];
      b.on = true; b.h = h; b.t = 0;
      b.from.copy(raidPos[ri]).setY(raidPos[ri].y + 0.4);
      b.target = h.weak && !shieldF ? -2 : pickBlock(you);
      b.shield = !!h.shield && shieldF !== null;
      b.dur = you ? 0.17 : rnd(0.16, 0.24);
      const big = h.crit || h.weak || h.kind === 'block';
      b.w = you ? (big ? 0.34 : 0.22) : 0.055;
      b.tail = you ? 0.4 : 0.16;
      b.col.copy(you ? (big ? WHITE : youCol) : raidCol(ri)).multiplyScalar(you ? 2.2 : 1.05);
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
          recoilV -= Math.min(0.9, 0.18 + h.dmg * 0.025) * (big ? 1.8 : 1);
          recoilSide = clamp((at.x - root.position.x) / 6, -1, 1);
          if (big && canFlash()) hitGlow = calm ? 0.5 : 1;
          shake = Math.max(shake, Math.min(0.5, 0.08 + h.dmg * 0.012) * (big ? 1.6 : 1));
          if (big) stopUntil = Math.max(stopUntil, performance.now() + (h.kind === 'block' ? 90 : 60));
        } else recoilV -= 0.015;
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
      const at = v1.copy(raidPos[RAID]).setY(2.2);
      burst(at, 26, 8, CYAN, 1.4, 4);
      flare(at, CYAN, 7, 0.32, canFlash() ? 1.3 : 0.6);
      wave(raidPos[RAID], 0.5, 6, 0.6, CYAN, 0.9);
    }
    function stagger() {
      recoilV -= 2.6; headJerk = 1;
      shake = Math.max(shake, 0.7);
      stopUntil = Math.max(stopUntil, performance.now() + 120);
      scatter(28, 1.2);
      v1.copy(CORE).sub(HIP).applyMatrix4(hip.matrixWorld);
      burst(v1, 40, 10, WHITE);
      wave(root.position, 1, 14, 0.9, WHITE, 0.7);
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
    function setWeak(on) { weakOn = on; }

    function defeat(instant) {
      if (dead) return;
      if (fx) fx.clear();
      dead = true; deadAt = nowS(); deadT = instant ? 9 : 0; won = true;
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
      dead = false; deadT = 0; frac = 1; stage = 0;
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
      palFrom = palTo = phase = 0; applyPal(1); pilHT = 0.35;
      setFrac(1, true);
    }

    const _s = { x: 0, y: 0 };
    function screen(key, out = _s) {
      let w = anchors.get(key);
      if (!w) {
        if (key.startsWith('shot:')) { const s = shots.find(x => x.on && x.id === key.slice(5)); if (s) w = s.pos; }
        else if (key.startsWith('add:')) { const a = adds.find(x => x.on && x.id === key.slice(4)); if (a && a.dying < 0) w = a.pos; }
      }
      if (!w) return null;
      v3.copy(w).project(camera);
      if (v3.z > 1) return null;
      out.x = (v3.x * 0.5 + 0.5) * host.clientWidth; out.y = (-v3.y * 0.5 + 0.5) * host.clientHeight;
      return out;
    }
    const anchorHead = new V(), anchorCore = new V();
    anchors.set('head', anchorHead); anchors.set('core', anchorCore); anchors.set('you', raidPos[RAID]);

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
    const KIND = { slam: ['raise', 'slam', 0.1], sweep: ['pull', 'sweep', 0.2], lunge: ['coil', 'punch', 0.12], beam: ['beam', 'beam', 0.15] };
    function titanPose(t) {
      const L = [];
      let busy = 0, tremble = 0, gl = 0, gr = 0, trail = 0;
      const sl = current(t, 'slam');
      if (sl) {
        const K = sl.kind === 'lunge' && kit.POSES.reach ? ['coil', 'reach', 0.12] : KIND[sl.kind] || KIND.slam;
        // the strike swings in over the last K[2] seconds, so the blow has landed at the hit
        // time and the hit-stop holds the landed pose
        const sAt = sl.h - K[2], w = clamp((t - sl.s) / (sAt - sl.s), 0, 1), after = t - sl.h;
        const rec = after > 0.5 ? smooth((after - 0.5) / 0.9) : 0;
        if (t < sAt) { L.push([K[0], ease(w)]); busy = w; tremble = w > 0.75 ? (w - 0.75) * 4 : 0; }
        else { L.push([K[0], 1 - rec]); L.push([K[1], (1 - rec) * easeIn(clamp((t - sAt) / K[2], 0, 1))]); busy = 1 - rec; }
        // the fists that strike glow red as the wind-up fills, flash on the hit, then cool
        const g = after < 0 ? w * w : Math.max(0, 1 - after / 0.6);
        if (sl.kind !== 'beam') { gr = g; if (sl.kind === 'slam') gl = g; }
        if (after >= 0 && after < (sl.kind === 'sweep' ? 0.3 : 0.14)) trail = sl.kind === 'slam' ? 3 : 2;
      }
      const vo = current(t, 'volley');
      if (vo) { const w = clamp((t - vo.s) / 1.0, 0, 1) * clamp((vo.e - t) / 0.8, 0, 1); L.push(['point', ease(w)]); busy = Math.max(busy, w); }
      const ad = current(t, 'adds');
      if (ad && t - ad.s < 2.4) { const w = Math.sin(clamp((t - ad.s) / 2.4, 0, 1) * Math.PI); L.push(['roar', w]); busy = Math.max(busy, w); }
      const shx = current(t, 'shield');
      if (shx) { const w = Math.sin(clamp((t - shx.s) / 2.4, 0, 1) * Math.PI); L.push(['guard', w]); busy = Math.max(busy, w); }
      const ru = t - roarAt;
      if (ru < 2.6) { const w = Math.sin(clamp(ru / 2.6, 0, 1) * Math.PI); L.push(['roar', w]); busy = Math.max(busy, w); }
      const bu = t - breakAt;
      if (bu < 1.5) { const w = Math.sin(clamp(bu / 1.5, 0, 1) * Math.PI); L.push(['reel', w]); busy = Math.max(busy, w); }
      if (t < stunUntil) { L.push(['reel', 0.55]); tremble = Math.max(tremble, 0.5); }
      if (dead) { L.push(['reel', clamp(deadT / 0.4, 0, 1)]); L.push(['fall', ease((deadT - 0.25) / 0.9)]); tremble = 1; }
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
      kit.fists[0].g.scale.setScalar(2 + gl * 2.2); kit.fists[1].g.scale.setScalar(2 + gr * 2.2);
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
      kit.group.visible = !(dead && deadBoom);
      kit.update(at, dt);
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
      for (const [i, g] of [[0, gl], [1, gr]]) {
        if (g < 0.25 || reduce) continue;
        if (Math.random() < g * 0.9) {
          kit.fists[i].at.getWorldPosition(vA);
          vB.copy(vA).add(new V((Math.random() - 0.5) * 6, (Math.random() - 0.3) * 5, (Math.random() - 0.5) * 6));
          kit.arcs.add(vA, vB, 0.08 + Math.random() * 0.08, 0.5 + g * 0.6, 7);
        }
      }
      const ln = current(t, 'slam');
      if (ln && ln.kind === 'lunge' && t >= ln.h - 0.12 && t < ln.h + 0.45 && !reduce) {
        kit.fists[1].at.getWorldPosition(vA);
        root.localToWorld(vB.copy(raidPos[RAID])); vB.y += 0.8;
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
      const sl = current(t, 'slam');
      if (sl) {
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
        } else if (sl.kind === 'beam') {
          if (after < 0) { pose.lz = -1.6 * ease(w); pose.rz = 1.6 * ease(w); pose.headX = -0.25 * w; pose.y += 1 * w; }
          else { pose.lz = -1.6 * rec; pose.rz = 1.6 * rec; pose.hx = -0.2 * rec; }
          tx *= 1 - w * 0.8;
        }
        charge = after < 0 ? (sl.kind === 'beam' ? w : w * 0.5) : 0;
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
      const strike = sl && sl.kind === 'lunge' && t > sl.h && t < sl.h + 0.4;
      mv.x += (tx - mv.x) * Math.min(1, dt * rate);
      mv.z += (tz - mv.z) * Math.min(1, dt * (strike ? 12 : rate));
      // phase 2: a full turn now and then
      const su = t - mv.spin;
      mv.face = su < 1.3 && M.spin ? smooth(su / 1.3) * Math.PI * 2 : 0;
      if (phase >= 4 && !reduce) { pose.lx += Math.sin(at * 3.1) * 0.3; pose.rx += Math.sin(at * 2.7 + 1) * 0.3; pose.headY += Math.sin(at * 5) * 0.05; }
    }

    // ---------- loop ----------
    let at = 0, last = nowS();
    // compile every shader now, hidden pooled effects included, so the first hit, spell or status
    // effect in a fight doesn't stall a frame while its shader compiles
    try { renderer.compile(scene, camera); } catch (e) {}
    renderer.setAnimationLoop(() => {
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
      tethMat.uniforms.uTime.value = reduce ? 0 : at;
      shieldMat.uniforms.uTime.value = at;

      // pose and movement
      if (!dead) motion(t, at, bdt);
      const k = Math.min(1, bdt * 7);
      for (const key in pose) cur[key] += (pose[key] - cur[key]) * k;
      recoilV += (-recoil * 40 - recoilV * 9) * adt; recoil += recoilV * adt;
      recoil = clamp(recoil, -0.5, 0.3);
      headJerk = Math.max(0, headJerk - adt * 2.5);
      root.position.set(mv.x, cur.y, mv.z);
      root.rotation.y = mv.face + Math.sin(at * 0.3) * 0.05 * still;
      hip.rotation.set(cur.hx + recoil, cur.hy + recoil * recoilSide * 0.4, cur.hz + recoil * recoilSide * 0.3 + (stunned && !reduce ? Math.sin(t * 47) * 0.025 : 0));
      tintMix += ((iced ? 0.6 : stunned ? 0.5 : 0) - tintMix) * Math.min(1, dt * 6);
      if (iced) boxMat.uniforms.uTintC.value.set('#bfefff').multiplyScalar(1.3);
      else if (stunned) boxMat.uniforms.uTintC.value.set('#3d7bff').multiplyScalar(1.4);
      boxMat.uniforms.uTintMix.value = tintMix;
      headG.rotation.set(cur.headX + recoil * 0.6 - headJerk * 0.4, cur.headY, Math.sin(at * 13) * headJerk * 0.3 * still);
      armLG.rotation.set(cur.lx, 0, cur.lz);
      armRG.rotation.set(cur.rx, cur.ry, cur.rz);
      if (kit) driveKit(t, at, adt);
      opsTick(t, adt);
      root.updateMatrixWorld(true);
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
        if (deadT > 1.35 && !deadBoom) {
          deadBoom = true;
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
      if (sl && t < sl.h) {
        const w = clamp((t - sl.s) / (sl.h - sl.s), 0, 1);
        tele.visible = teleFill.visible = true;
        // the ring marks the danger zone, and the fill grows to meet it at the moment of the hit
        const R = 5.6, blink = w > 0.8 && !reduce ? 0.5 + 0.5 * Math.sin(t * 40) : 1;
        tele.position.set(raidPos[RAID].x, 0.06, raidPos[RAID].z); tele.scale.setScalar(R + Math.sin(t * (6 + 14 * w)) * 0.1 * still);
        teleFill.position.copy(tele.position); teleFill.scale.setScalar(Math.max(0.05, R * 0.97 * ease(w)));
        tele.material.opacity = (0.5 + 0.45 * w) * blink;
        teleFill.material.opacity = 0.14 + 0.3 * w;
        tele.material.color.copy(blocked.has(sl.id) ? CYAN : RED);
        teleFill.material.color.copy(blocked.has(sl.id) ? CYAN : RED).multiplyScalar(0.4);
        if (sl.kind === 'beam') {
          beam.visible = true;
          setBeam(anchorCore, raidPos[RAID], 0.06 + 0.05 * w);
          beamMat.opacity = 0.25 + 0.35 * w;
        }
      } else { tele.visible = teleFill.visible = false; }
      if (t < beamUntil) {
        beam.visible = true;
        const u = (beamUntil - t) / 0.55;
        setBeam(anchorCore, raidPos[RAID], 0.9 * u + 0.2);
        beamMat.opacity = 0.9 * u;
      } else if (!(sl && sl.kind === 'beam' && t < sl.h)) beam.visible = false;
      const su = t - sweepT0;
      if (su < 0.45) {
        sweepBar.visible = true;
        sweepBar.position.set(16 - 32 * ease(su / 0.35), 0.8, raidPos[RAID].z);
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
            recoilV -= 0.7;
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
        sc.setScalar(you ? 1.5 : i >= SHOWN ? 0 : 0.9 + markGlow[i] * 0.3);
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

      // camera: follows the boss a little, shakes on big moments, leans in on a roar
      shake = Math.max(0, shake - adt * 2);
      const sh = shake * shakeK;
      const roarK = Math.sin(clamp((t - roarAt) / 2.6, 0, 1) * Math.PI) * (reduce ? 0.3 : 1);
      camera.position.set(
        camBase.x + root.position.x * 0.12 + Math.sin(at * 0.21) * 0.6 * still + Math.sin(t * 41) * sh * 0.5,
        camBase.y + Math.sin(at * 0.17) * 0.25 * still + Math.sin(t * 37 + 1) * sh * 0.4,
        camBase.z - roarK * 3);
      v1.set(root.position.x * 0.45, camLook.y + (cur.y - 0.4) * 0.5, root.position.z * 0.3);
      lookCur.lerp(v1, Math.min(1, dt * 2));
      camera.lookAt(lookCur);

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
      if (fx) fx.update(adt);
      composer.render();
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
    function feed() { if (fx && !dead) fx.feed(v2.copy(raidPos[RAID]).setY(raidPos[RAID].y + 0.4), orbPos(orbAt)); }
    // onLand(x, y): the impact's place on screen, for the damage number
    function release(tier, power, onLand) {
      if (!fx || dead) { if (onLand) onLand(null, null); return; }
      const from = orbPos(new V());
      act('you', 'cast');
      const ti = -2, sh = shieldF !== null;   // a release always goes for the core
      fx.release(tier, power, from, out => aimAt(ti, sh, from, out), at => {
        recoilV -= 0.3 + 1.4 * power;
        recoilSide = clamp((at.x - root.position.x) / 6, -1, 1);
        for (let k = 0; k < 2 + power * 12; k++) { const j = pickBlock(true); if (j >= 0) knock(blocks[j], false, 0.6 + power); }
        if (power > 0.6 && canFlash()) hitGlow = calm ? 0.5 : 1;
        markGlow[RAID] = 1;
        if (onLand) { v3.copy(at).project(camera); onLand((v3.x * 0.5 + 0.5) * host.clientWidth, (-v3.y * 0.5 + 0.5) * host.clientHeight); }
      });
    }
    // tests only: hold every animation still so a capture shows one exact moment
    let paused = false;
    function pause(on) { paused = !!on; }
    function info() { return { phase, palTo, stage, dead, shots: shots.filter(s => s.on).length, adds: adds.filter(a => a.on).length, evs: evs.length, x: mv.x, z: mv.z, fx: fx ? fx.info() : null }; }

    setFrac(1, true);
    applyPal(1);
    return { wave, live, setPhase, setFrac, event, hit, returnShot, killAdd, block, stagger, hurt, setShield, setWeak, defeat, revive, screen, info, dispose, cast, aura, fxEvent, react, freezeAttack, pause, charge: chargeOrb, feed, release, crew: setCrew, act };
  }

  return { mount };
})();
