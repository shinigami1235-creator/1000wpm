// The Superboss arenas in three.js. Each boss is built from glowing blocks in one instanced
// mesh and moves from a small rig: the Kernel Hydra's body, necks and heads, the Compiler's
// tower of screens with its assembler rings, and the Packet Leviathan's segments on a loop.
// The scene reads only fight snapshots and fight events, so the streamer's page and a viewer's
// mirror draw the same thing.
//   const sc = SuperScene.mount(host, { boss, onPop(amount, x, y, o), reduceShake })
//   sc.ready                 a promise, true once three.js loaded
//   sc.apply(snapshot)       every snapshot (state message)
//   sc.event(name, data)     every fight event: hit, hurt, sever, cast, phase, windup, ...
//   sc.anchor(key, out)      host pixels of 'head:fork', 'core', 'body', 'art', 'seg:front', 'seg:far', 'head', 'packet:<id>'
//   sc.screenRect()          the Compiler's screen in host pixels, where the page lays the code lines
//   sc.setBoss(id), sc.setReduce(on), sc.pause(on), sc.info(), sc.dispose()
// Hitstop, flashes, shake and damage popups follow the action-juice ladder. Shake is moderate,
// and Reduce shake (or reduced motion) cuts it to a quarter. Flashes go through one gate, 3 a second.
window.SuperScene = (() => {
  let libs = null;
  function load() {
    libs ||= Promise.all([
      import('three'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  function mount(host, opts = {}) {
    let impl = null, gone = false, last = null, boss = opts.boss || 'hydra', reduce = !!opts.reduceShake;
    const ctl = {
      ready: load().then(L => {
        if (gone) return false;
        impl = build(host, { ...opts, boss, reduceShake: reduce }, L[0], L[1].EffectComposer, L[2].RenderPass, L[3].UnrealBloomPass, L[4].OutputPass, L[5].ShaderPass);
        if (last) impl.apply(last);
        return true;
      }),
      apply: s => { last = s; if (s && s.boss && s.boss !== boss) { boss = s.boss; if (impl) impl.setBoss(boss); } if (impl) impl.apply(s); },
      event: (n, d) => { if (impl) impl.event(n, d); },
      anchor: (k, out) => (impl ? impl.anchor(k, out) : null),
      screenRect: () => (impl ? impl.screenRect() : null),
      setBoss: id => { boss = id; if (impl) impl.setBoss(id); },
      setReduce: on => { reduce = on; if (impl) impl.setReduce(on); },
      pause: on => impl && impl.pause(on),
      slow: k => impl && impl.slow(k),
      info: () => (impl ? impl.info() : null),
      dispose: () => { gone = true; if (impl) impl.dispose(); },
    };
    return ctl;
  }

  function build(host, opts, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass) {
    const V = THREE.Vector3;
    const motionOff = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let reduceShake = !!opts.reduceShake;
    const shakeK = () => (motionOff ? 0.15 : reduceShake ? 0.25 : 1);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const nowS = () => performance.now() / 1000;
    const keep = [];
    const own = x => (keep.push(x), x);

    const flashes = [];
    function canFlash() {
      const t = performance.now();
      while (flashes.length && t - flashes[0] > 1000) flashes.shift();
      if (flashes.length >= 3) return false;
      flashes.push(t); return true;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.25, devicePixelRatio || 1));
    renderer.toneMapping = THREE.NoToneMapping;
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#010503');
    scene.fog = new THREE.Fog('#010503', 40, 110);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);

    // ---------- palette ----------
    let bossId = opts.boss || 'hydra', B = SuperData.boss(bossId);
    const pal = { bg: C('#010503'), a: C('#39ff88'), b: C('#1f9e57'), c: C('#3ee6ff'), bloom: 0.6 };
    let palTo = null, palFrom = null, palT = 1;
    function palette(i, instant) {
      const p = B.pal[clamp(i, 0, 2)];
      palFrom = { bg: pal.bg.clone(), a: pal.a.clone(), b: pal.b.clone(), c: pal.c.clone(), bloom: pal.bloom };
      palTo = { bg: C(p.bg), a: C(p.a), b: C(p.b), c: C(p.c), bloom: p.bloom };
      palT = instant ? 1 : 0;
      if (instant) applyPal(1);
    }
    function applyPal(k) {
      pal.bg.lerpColors(palFrom.bg, palTo.bg, k); pal.a.lerpColors(palFrom.a, palTo.a, k);
      pal.b.lerpColors(palFrom.b, palTo.b, k); pal.c.lerpColors(palFrom.c, palTo.c, k);
      pal.bloom = palFrom.bloom + (palTo.bloom - palFrom.bloom) * k;
    }

    // ---------- backdrop: a wall of code and a floor that differs per arena ----------
    const codeCv = document.createElement('canvas'); codeCv.width = codeCv.height = 512;
    {
      const c = codeCv.getContext('2d'); c.font = '20px monospace';
      const CH = '01{}[]<>/=+*#$abcdef;()';
      for (let x = 0; x < 512; x += 16) for (let y = 0; y < 512; y += 22) if (Math.random() < 0.5) { c.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.9).toFixed(2)})`; c.fillText(CH[Math.floor(Math.random() * CH.length)], x, y); }
    }
    const codeTex = own(new THREE.CanvasTexture(codeCv));
    codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping; codeTex.repeat.set(8, 3);
    const wallMat = own(new THREE.MeshBasicMaterial({ map: codeTex, color: pal.a.clone(), transparent: true, opacity: 0.12, depthWrite: false, fog: false }));
    const wall = new THREE.Mesh(own(new THREE.PlaneGeometry(190, 70)), wallMat);
    wall.position.set(0, 24, -48); scene.add(wall);
    const floorMat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uA: { value: pal.a.clone() }, uB: { value: pal.b.clone() }, uBg: { value: pal.bg.clone() }, uPulse: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform float uMode; uniform vec3 uA; uniform vec3 uB; uniform vec3 uBg; uniform float uPulse; varying vec3 vW;
        float ln(float x, float s, float w){ float f = abs(fract(x / s + 0.5) - 0.5) * s; return 1.0 - smoothstep(0.0, w, f); }
        void main(){
          vec2 p = vW.xz;
          float g = max(ln(p.x, 3.0, 0.06), ln(p.y, 3.0, 0.06));
          vec3 c = uBg + uB * g * 0.55;
          if (uMode < 0.5) {
            float r = length(p - vec2(0.0, -6.0));
            float rip = smoothstep(0.82, 1.0, sin(r * 1.3 - uTime * 2.2)) * exp(-r * 0.045);
            c = uBg * 1.4 + uB * g * 0.25 + uA * rip * 0.55 + vec3(0.0, 0.02, 0.025);
          } else if (uMode < 1.5) {
            float lane = ln(p.x, 9.0, 0.12) * step(-40.0, p.y);
            float run = smoothstep(0.7, 1.0, sin(p.y * 0.6 + uTime * 4.0)) * ln(p.x, 9.0, 0.5);
            c += uA * (lane * 0.35 + run * 0.4);
          } else {
            float w = smoothstep(0.75, 1.0, sin(p.x * 0.35 + p.y * 0.55 + uTime * 1.6)) * 0.5 + smoothstep(0.85, 1.0, sin(p.x * -0.5 + p.y * 0.3 - uTime * 1.1)) * 0.35;
            c = uBg * 1.2 + uB * g * 0.3 + uA * w * 0.45;
          }
          c += uA * uPulse * 0.25 * exp(-length(p - vec2(0.0, 8.0)) * 0.06);
          float d = length(p - vec2(0.0, 0.0));
          c = mix(c, uBg, smoothstep(30.0, 85.0, d));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(240, 200)), floorMat);
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    // ---------- blocks: every boss part, prop and piece of debris is one of these ----------
    const N = 700;
    const blockMat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uFog: { value: pal.bg.clone() }, uFar: { value: 95 } },
      vertexShader: `varying vec2 vUv; varying vec3 vCol; varying float vDepth;
        void main(){ vUv = uv; vCol = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
          #endif
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uHit; uniform vec3 uFog; uniform float uFar; varying vec2 vUv; varying vec3 vCol; varying float vDepth;
        void main(){
          vec2 d = min(vUv, 1.0 - vUv); float e = min(d.x, d.y);
          float edge = 1.0 - smoothstep(0.0, 0.1, e);
          float scan = 0.5 + 0.5 * sin(vUv.y * 32.0 + uTime * 5.0);
          vec3 c = vec3(0.003, 0.01, 0.008) + vCol * (0.05 + 0.07 * scan) + vCol * edge * (0.95 + uHit * 0.8);
          c = mix(c, vec3(1.0), uHit * 0.3 * edge);
          c = mix(c, uFog, smoothstep(uFar * 0.5, uFar, vDepth));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    const blocks = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), blockMat, N);
    blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blocks.setColorAt(0, new THREE.Color());
    blocks.frustumCulled = false;
    scene.add(blocks);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new V(), col = new THREE.Color();
    const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V();
    let nB = 0;
    function put(p, sx, sy, sz, rx, ry, rz, c, k = 1) {
      if (nB >= N) return;
      e3.set(rx, ry, rz); q.setFromEuler(e3); sc.set(sx, sy, sz);
      m4.compose(p, q, sc); blocks.setMatrixAt(nB, m4);
      col.copy(c).multiplyScalar(k); blocks.setColorAt(nB, col);
      nB++;
    }

    // debris: blocks knocked off a boss, falling with gravity
    const debris = [];
    function shed(at, n, c, power = 1, size = 0.7) {
      for (let i = 0; i < n && debris.length < 120; i++) {
        debris.push({ p: at.clone().add(v4.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))), v: new V(rnd(-6, 6), rnd(2, 9), rnd(-3, 7)).multiplyScalar(power),
          r: new V(rnd(0, 6), rnd(0, 6), 0), w: new V(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), s: size * rnd(0.6, 1.3), c: c.clone(), life: rnd(1.2, 2.2), t: 0 });
      }
    }

    // glowing flares at impacts
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    { const c = glowCv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
    const glowTex = own(new THREE.CanvasTexture(glowCv));
    const flares = Array.from({ length: 16 }, () => {
      const m = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false })));
      m.visible = false; scene.add(m); return { m, t: 0, life: 0.3, size: 1 };
    });
    function flare(at, c, size, life = 0.25) { const f = flares.find(x => !x.m.visible) || flares[0]; f.m.visible = true; f.m.position.copy(at); f.m.material.color.copy(c); f.t = 0; f.life = life; f.size = size; }
    const rings = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(own(new THREE.RingGeometry(0.92, 1, 64)), own(new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
      m.visible = false; scene.add(m); return { m, t: 0, life: 0.5, r0: 1, r1: 6, flat: true };
    });
    function wave(at, c, r0, r1, life = 0.5, flat = true) { const w = rings.find(x => !x.m.visible) || rings[0]; w.m.visible = true; w.m.position.copy(at); w.m.material.color.copy(c); w.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0); Object.assign(w, { t: 0, life, r0, r1 }); }

    // ---------- post ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.38, 0.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const post = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uTint: { value: C('#ff4d5e') }, uTintAmt: { value: 0 }, uGlitch: { value: 0 }, uDim: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec3 uTint; uniform float uTintAmt; uniform float uGlitch; uniform float uDim; uniform float uFlash; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv; float row = floor(uv.y * 34.0);
          if (h(vec2(row, floor(uTime * 10.0))) < uGlitch * 0.3) uv.x += (h(vec2(row, uTime)) - 0.5) * 0.03 * uGlitch;
          float ab = 0.0006 + uGlitch * 0.003;
          vec3 c = vec3(texture2D(tDiffuse, uv + vec2(ab, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ab, 0.0)).b);
          vec2 q = vUv - 0.5;
          c = mix(c, uTint, smoothstep(0.38, 0.8, length(q * vec2(1.0, 1.25))) * uTintAmt);
          c *= 1.0 - smoothstep(0.45, 0.95, length(q)) * 0.5;
          c *= 1.0 - uDim * (0.35 + 0.65 * smoothstep(0.05, 0.5, length(q)));
          c += uFlash * 0.35;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    composer.addPass(post);

    // ---------- juice ----------
    let shake = 0, stopUntil = 0, hitGlow = 0, tintAmt = 0, glitchK = 0, glitchUntil = 0, dimK = 0, dimUntil = 0, dimCur = 0, flashAmt = 0, kick = 0;
    const juice = {
      shake: k => { shake = Math.max(shake, k); },
      stop: ms => { stopUntil = Math.max(stopUntil, performance.now() + ms); },
      glitch: (k, secs) => { glitchK = Math.max(glitchK, k); glitchUntil = Math.max(glitchUntil, nowS() + secs); },
      dim: (k, secs) => { dimK = k; dimUntil = nowS() + secs; },
      tint: (hex, k) => { post.uniforms.uTint.value.set(hex); tintAmt = Math.max(tintAmt, k); },
      canFlash,
    };
    // the shake cap keeps the camera from moving more than about 1% of the frame
    const SHAKE_MAX = 0.55;

    // ---------- Art: the caster, at the front of the arena ----------
    const artPos = new V(0, 0.9, 15);
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, { glowTex, calm: false, reduce: motionOff, pixelHeight: () => renderer.domElement.height, juice }) : null;
    const caster = { pos: out => out.copy(artPos).setY(artPos.y + 0.6) };

    // ---------- the bosses ----------
    const clock = { t: 0 };
    let snap = null, phase = 1, dead = false, deadT = 0, lost = false, finishing = false, enraged = false;
    const anchors = { core: new V(0, 7, -6), body: new V(0, 7, -6), head: new V(0, 8, 0) };
    const target = {
      size: 5,
      pos: out => out.copy(anchors.core),
      top: out => out.copy(anchors.core).setY(anchors.core.y + 4),
      base: out => out.set(anchors.core.x, 0, anchors.core.z),
      react: (k, p) => { if (k === 'flash' || k === 'flinch') hitGlow = Math.max(hitGlow, 0.6); if (k === 'stagger' || k === 'break') { hitGlow = 1; recoil = 1; } },
    };
    let recoil = 0;

    // Kernel Hydra
    const HEADS = [
      { id: 'fork', base: new V(-8.5, 9, -2), c: C('#39ff88'), dir: -1 },
      { id: 'root', base: new V(0, 12.5, -3.5), c: C('#3ee6ff'), dir: 0 },
      { id: 'patch', base: new V(8.5, 9, -2), c: C('#f2c230'), dir: 1 },
    ];
    const hstate = Object.fromEntries(HEADS.map(h => [h.id, { up: true, grow: 1, lunge: -9, charge: 0, chargeUntil: 0, flash: 0, pos: h.base.clone(), hpk: 1 }]));
    const DOME = [];
    for (let r = 0; r < 4; r++) { const n = 14 - r * 3, rad = 6.2 - r * 1.3; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + r * 0.4; DOME.push({ x: Math.cos(a) * rad, y: 1 + r * 1.7, z: Math.sin(a) * rad * 0.7 - 6, s: 2.2 - r * 0.3, a }); } }
    let neckOpen = 0;
    function hydra(t, dt) {
      const body = pal.b;
      const breathe = Math.sin(t * 1.4) * 0.15;
      const rec = recoil * 0.6;
      for (const d of DOME) put(v1.set(d.x, d.y + breathe - (dead ? deadT * 2 : 0), d.z - rec), d.s, d.s * 0.8, d.s, 0, d.a + t * 0.05, 0, neckOpen ? pal.a : body, neckOpen ? 1.4 + Math.sin(t * 12) * 0.3 : 0.9);
      // core glow, visible when the neck is open
      anchors.core.set(0, 6.5 + breathe, -6);
      put(v1.copy(anchors.core), 2.4, 2.4, 2.4, t, t * 1.3, 0, neckOpen ? C('#ffffff') : pal.c, neckOpen ? 2.2 : 0.8);
      for (const h of HEADS) {
        const s = hstate[h.id];
        s.flash = Math.max(0, s.flash - dt * 4);
        const growT = s.up ? s.grow : 0;
        s.grow = s.up ? Math.min(1, s.grow + dt * 1.6) : 0;
        const lungeU = clamp((t - s.lunge) / 0.45, 0, 1), lunge = Math.sin(lungeU * Math.PI);
        const ch = s.chargeUntil > t ? 1 - (s.chargeUntil - t) / Math.max(0.1, s.chargeLen) : 0;
        const sway = Math.sin(t * (1.1 + h.dir * 0.2) + h.dir) * 1.1;
        v2.copy(h.base).add(v3.set(sway * 0.8, Math.sin(t * 1.7 + h.dir) * 0.6 + ch * 2.2, lunge * 9 - rec));
        if (dead) v2.y -= deadT * 6;
        s.pos.lerp(v2, Math.min(1, dt * 8));
        // neck: a curve from the body to the head
        const start = v3.set(h.dir * 2.4, 6, -6);
        const segs = 11, shown = Math.max(2, Math.round(segs * (s.up ? 0.2 + 0.8 * growT : 0.18)));
        for (let i = 0; i < shown; i++) {
          const u = i / segs;
          v1.lerpVectors(start, s.pos, u);
          v1.y += Math.sin(u * Math.PI) * 3.2;
          v1.x += Math.sin(u * Math.PI) * h.dir * 1.6;
          const w = 1.5 - u * 0.5;
          put(v1, w, w, w, t * 0.3 + i, u * 2, 0, h.c, s.up ? 0.75 + s.flash * 1.2 : 0.5);
        }
        if (!s.up || growT < 0.85) continue;
        // head: skull, snout, jaws, eyes, horns
        const yaw = Math.atan2(artPos.x - s.pos.x, artPos.z - s.pos.z);
        const k = 1 + s.flash * 1.5 + ch * 1.2;
        const fw = v4.set(Math.sin(yaw), 0, Math.cos(yaw));
        put(s.pos, 2.6, 2.1, 2.6, 0, yaw, 0, h.c, k);
        put(v1.copy(s.pos).addScaledVector(fw, 2.1).setY(s.pos.y - 0.3), 1.8, 1.1, 2.0, 0, yaw, 0, h.c, k);
        const jaw = 0.3 + lunge * 0.9 + ch * 0.6;
        put(v1.copy(s.pos).addScaledVector(fw, 1.9).setY(s.pos.y - 1.1 - jaw * 0.5), 1.6, 0.4, 1.9, jaw * 0.4, yaw, 0, h.c, k * 0.8);
        for (const sd of [-1, 1]) {
          v1.copy(s.pos).addScaledVector(fw, 1.3).add(v3.set(Math.cos(yaw) * sd * 0.8, 0.55, -Math.sin(yaw) * sd * 0.8));
          put(v1, 0.42, 0.3, 0.3, 0, yaw, 0, h.id === 'root' && ch > 0 ? C('#ffffff') : C('#ff4d5e'), 2.4);
          v1.copy(s.pos).add(v3.set(Math.cos(yaw) * sd * 0.9, 1.4, -Math.sin(yaw) * sd * 0.9));
          put(v1, 0.35, 1.3, 0.35, -0.4, yaw, sd * 0.3, h.c, k * 0.9);
        }
        if (ch > 0 && h.id === 'root') put(v1.copy(s.pos).addScaledVector(fw, 3.2).setY(s.pos.y - 0.6), 0.6 + ch * 1.6, 0.6 + ch * 1.6, 0.6 + ch * 1.6, t * 4, t * 5, 0, C('#bfefff'), 1.5 + ch * 2);
      }
      // drowned server racks around the pit
      for (let i = 0; i < 8; i++) { const sd = i % 2 ? 1 : -1, z = -22 + Math.floor(i / 2) * 7; put(v1.set(sd * (19 + (i % 3)), 2.5, z), 2.2, 5 + (i % 3), 2.2, 0, 0.2 * sd, 0.08 * sd, pal.b, 0.35); }
    }

    // The Compiler
    const TOWER = { x: 0, y: 10, z: -7, w: 23, h: 12.5 };
    const towerLost = new Set();
    let towerCharge = 0, towerChargeUntil = 0, screenPulse = 0;
    function compiler(t, dt) {
      const { x, y, z, w, h } = TOWER;
      const rec = recoil * 0.5;
      const k0 = 0.9 + hitGlow * 0.8;
      const ch = towerChargeUntil > t ? 1 - (towerChargeUntil - t) / Math.max(0.1, towerCharge) : 0;
      let id = 0;
      const frame = (px, py, s, c, kk) => { id++; if (towerLost.has(id)) return; put(v1.set(px, py - (dead ? deadT * deadT * 4 * ((id % 5) + 1) / 3 : 0), z - rec), s, s, s * 1.4, 0, 0, dead ? deadT * (id % 3) : 0, c, kk); };
      for (let i = 0; i <= 18; i++) { const px = x - w / 2 + i * w / 18; frame(px, y + h / 2 + 0.6, 1.1, pal.a, k0 + ch); frame(px, y - h / 2 - 0.6, 1.1, pal.a, k0 + ch); }
      for (let j = 0; j <= 10; j++) { const py = y - h / 2 + j * h / 10; frame(x - w / 2 - 0.6, py, 1.1, pal.a, k0 + ch); frame(x + w / 2 + 0.6, py, 1.1, pal.a, k0 + ch); }
      // pedestal and cables
      for (let i = 0; i < 8; i++) put(v1.set(x + (i - 3.5) * 2.6, 1.2 + (i % 2) * 0.4, z + 0.5), 2.2, 2.4, 3, 0, 0, 0, pal.b, 0.9);
      for (let i = 0; i < 5; i++) put(v1.set(x + (i - 2) * 3, 2.6, z), 0.4, 1.6 + i % 2, 0.4, 0, 0, 0, pal.b, 0.8);
      // the screen itself: a dark slab behind the DOM code lines
      put(v1.set(x, y, z - 0.8 - rec), w + 0.4, h + 0.4, 0.3, 0, 0, 0, C('#0a1f18'), 0.25 + screenPulse * 1.5);
      screenPulse = Math.max(0, screenPulse - dt * 2);
      // assembler rings
      for (let r = 0; r < 2; r++) {
        const n = 18, rad = 14 + r * 2.5, sp = (r ? -0.35 : 0.5) * (1 + (phase - 1) * 0.35) * (enraged ? 1.5 : 1);
        for (let i = 0; i < n; i++) {
          const a = t * sp + i / n * Math.PI * 2;
          v1.set(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.62, z + 1.5 + Math.sin(a * 2) * 0.8);
          if (dead) v1.y -= deadT * deadT * 6;
          put(v1, 0.9, 0.9, 0.9, a, a * 2, 0, r ? pal.c : pal.a, 1.8 + ch * 1.5);
        }
      }
      // build pillars down the hall
      for (let i = 0; i < 10; i++) { const sd = i % 2 ? 1 : -1, zz = -30 + Math.floor(i / 2) * 9; const hh = 9 + Math.sin(t * 0.8 + i) * 1.5; put(v1.set(sd * 21, hh / 2, zz), 2.5, hh, 2.5, 0, 0, 0, pal.b, 0.45); }
      // the core sits on top of the tower, so word hits land above the code and not on it
      anchors.core.set(x, y + h / 2 + 3.2 + Math.sin(t * 1.3) * 0.3, z + 0.5);
      anchors.body.copy(anchors.core);
      if (!dead) {
        put(anchors.core, 2.2, 2.2, 2.2, t * 0.7, t, Math.PI / 4, pal.c, 1.6 + hitGlow * 1.5 + ch * 2);
        put(anchors.core, 3.4, 0.25, 0.25, 0, t * 1.4, 0, pal.a, 1.4);
        put(anchors.core, 0.25, 0.25, 3.4, 0, t * 1.4, 0, pal.a, 1.4);
      }
    }
    function screenRect() {
      if (bossId !== 'compiler') return null;
      const { x, y, z, w, h } = TOWER;
      const a = proj(v1.set(x - w / 2 + 0.3, y + h / 2 - 0.3, z), {}), b = proj(v2.set(x + w / 2 - 0.3, y - h / 2 + 0.3, z), {});
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    }

    // Packet Leviathan
    const SEG = 22, GAPU = 0.24;
    let serpS = 0, frontI = 0, weakI = -1, decoyI = -1, segFlash = new Float32Array(SEG), diveK = 0, diveUntil = 0, diveLen = 1, lungeAt = -9;
    const segPos = Array.from({ length: SEG }, () => new V());
    const pathAt = (u, out) => out.set(Math.cos(u) * 18, 6 + Math.sin(u * 3) * 3, -9 + Math.sin(u) * 14);
    const packets = new Map();
    function leviathan(t, dt) {
      const speed = [0, 0.32, 0.4, 0.5][phase] * (enraged ? 1.3 : 1) * (dead ? Math.max(0, 1 - deadT) : 1);
      serpS += dt * speed;
      const diving = diveUntil > t ? 1 - (diveUntil - t) / Math.max(0.1, diveLen) : 0;
      diveK += ((diving > 0 ? 1 : 0) - diveK) * Math.min(1, dt * 3);
      const lu = clamp((t - lungeAt) / 0.6, 0, 1), lunge = Math.sin(lu * Math.PI);
      let best = -1e9;
      for (let i = 0; i < SEG; i++) {
        const u = serpS - i * GAPU;
        pathAt(u, v1);
        v1.y -= diveK * 6 * (i / SEG);
        if (dead) v1.y -= deadT * deadT * 5;
        segPos[i].copy(v1);
        if (i > 1 && v1.z > best) { best = v1.z; frontI = i; }
        segFlash[i] = Math.max(0, segFlash[i] - dt * 3);
        pathAt(u + 0.05, v2);
        const yaw = Math.atan2(v2.x - v1.x, v2.z - v1.z);
        const taper = (i < 3 ? 1.1 : 1.25 - i / SEG * 0.7) * 1.35;
        const weak = i === weakI, decoy = i === decoyI;
        const c = weak ? C('#ffffff') : decoy ? C('#ff4d5e') : (i % 3 === 0 ? pal.c : pal.a);
        const k = (weak ? 1.6 + Math.sin(t * 20) * 0.4 : decoy ? 1.6 : 0.85) + segFlash[i] * 1.5 + hitGlow * 0.4;
        if (i === 0) continue;
        put(v1, 2.6 * taper, 2.2 * taper, 2.6 * taper, Math.sin(t * 2 + i) * 0.15, yaw, 0, c, k);
        put(v3.copy(v1).setY(v1.y + 1.6 * taper), 0.35, 1.3 * taper, 1.5 * taper, 0, yaw, 0, c, k * 0.9);
        // the spine joins each segment to the one in front, so the body reads as one serpent
        const prev = segPos[i - 1];
        if (i > 1) {
          v2.subVectors(prev, v1); const len = v2.length();
          v3.addVectors(prev, v1).multiplyScalar(0.5);
          put(v3, 0.7 * taper, 0.7 * taper, len, -Math.asin(v2.y / Math.max(0.01, len)), Math.atan2(v2.x, v2.z), 0, pal.b, 1.1);
        }
      }
      // the head leads the body, rising toward the camera when it lunges
      const hp = segPos[0];
      pathAt(serpS, hp);
      hp.y += diving * 5 + lunge * 2; hp.z += lunge * 12 + diving * 4;
      if (dead) hp.y -= deadT * deadT * 5;
      anchors.head.copy(hp);
      const yaw = Math.atan2(artPos.x - hp.x, artPos.z - hp.z);
      const fw = v4.set(Math.sin(yaw), 0, Math.cos(yaw));
      const hk = 1.2 + hitGlow + diving * 1.2;
      put(hp, 4.4, 3.2, 4.4, 0, yaw, 0, pal.a, hk);
      const jaw = 0.4 + diving * 0.8 + lunge;
      put(v1.copy(hp).addScaledVector(fw, 3).setY(hp.y + 0.7 + jaw * 0.4), 3.6, 0.8, 3.4, -jaw * 0.35, yaw, 0, pal.a, hk);
      put(v1.copy(hp).addScaledVector(fw, 3).setY(hp.y - 1.1 - jaw * 0.4), 3.3, 0.7, 3.1, jaw * 0.35, yaw, 0, pal.a, hk * 0.8);
      for (const sd of [-1, 1]) {
        put(v1.copy(hp).addScaledVector(fw, 1.6).add(v3.set(Math.cos(yaw) * sd * 1.6, 1.2, -Math.sin(yaw) * sd * 1.6)), 0.8, 0.55, 0.55, 0, yaw, 0, C('#ff4d5e'), 2.8);
        put(v1.copy(hp).addScaledVector(fw, -1).add(v3.set(Math.cos(yaw) * sd * 1.9, 2.2, -Math.sin(yaw) * sd * 1.9)), 0.4, 2.2, 0.4, -0.6, yaw, sd * 0.5, pal.c, 1.4);
      }
      anchors.core.copy(weakI >= 0 ? segPos[weakI] : segPos[frontI]);
      anchors.body.copy(segPos[Math.floor(SEG / 2)]);
      // packets in the air: from the head to Art
      for (const [id, pk] of packets) {
        const u = clamp(1 - pk.left / pk.total, 0, 1);
        pk.pos.lerpVectors(hp, artPos, ease(u) * 0.92);
        pk.pos.y += Math.sin(u * Math.PI) * 3;
        put(pk.pos, 0.9, 0.9, 0.9, t * 4, t * 3, 0, C('#3ee6ff'), 2);
        if (pk.gone && t - pk.gone > 0.4) packets.delete(id);
      }
      // network nodes floating over the sea
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + t * 0.03; put(v1.set(Math.cos(a) * 32, 6 + Math.sin(t + i) * 1.2, -20 + Math.sin(a) * 14), 1.2, 1.2, 1.2, t, t, 0, pal.b, 0.6); }
    }

    // ---------- camera ----------
    const camBase = new V(0, 6.4, 31), camLook = new V(0, 7.6, -3), lookCur = camLook.clone();
    function fit() {
      const w = host.clientWidth || 800, h = host.clientHeight || 600;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      const half = THREE.MathUtils.degToRad(42 / 2);
      camBase.z = Math.max(31, 19 / (Math.tan(half) * camera.aspect));
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);
    fit();

    // ---------- projection to host pixels ----------
    function proj(p, out = {}) {
      v3.copy(p).project(camera);
      const w = host.clientWidth, h = host.clientHeight;
      out.x = (v3.x * 0.5 + 0.5) * w; out.y = (-v3.y * 0.5 + 0.5) * h; out.z = v3.z;
      return out;
    }
    function anchor(key, out = {}) {
      if (key === 'art') return proj(v1.copy(artPos).setY(artPos.y + 1), out);
      if (key.startsWith('head:')) { const s = hstate[key.slice(5)]; return s ? proj(v1.copy(s.pos).setY(s.pos.y + 3.2), out) : null; }
      if (key === 'seg:front') return proj(v1.copy(segPos[weakI >= 0 ? weakI : frontI]).setY(segPos[weakI >= 0 ? weakI : frontI].y + 3.4), out);
      if (key === 'seg:far') return proj(v1.copy(segPos[decoyI >= 0 ? decoyI : 12]).setY(segPos[decoyI >= 0 ? decoyI : 12].y + 3.4), out);
      if (key.startsWith('packet:')) { const pk = packets.get(key.slice(7)); return pk ? proj(v1.copy(pk.pos).setY(pk.pos.y + 1.3), out) : null; }
      if (key === 'head') return proj(v1.copy(anchors.head).setY(anchors.head.y + 2.6), out);
      if (key === 'core' || key === 'body') return proj(anchors[key], out);
      return null;
    }
    function worldOf(at, out) {
      if (!at) return out.copy(anchors.core);
      if (at.startsWith('head:')) { const s = hstate[at.slice(5)]; return out.copy(s ? s.pos : anchors.core); }
      if (at === 'seg:front') return out.copy(segPos[weakI >= 0 ? weakI : frontI]);
      if (at === 'head') return out.copy(anchors.head);
      if (at.startsWith('line:')) return out.copy(anchors.core).add(v4.set(rnd(-4, 4), rnd(-2, 3), 1));
      return out.copy(anchors[at] || anchors.core);
    }

    // ---------- snapshots ----------
    function apply(s) {
      snap = s;
      if (s.phase !== phase) { phase = s.phase; palette(phase - 1, false); }
      enraged = !!s.enraged;
      finishing = s.status === 'finish';
      if (s.status === 'won' && !dead) { dead = true; deadT = 0; }
      if (s.status !== 'won' && dead && s.status !== 'lost') { dead = false; }
      lost = s.status === 'lost';
      if (s.b && s.b.heads) for (const h of s.b.heads) { const st = hstate[h.id]; if (st) { if (h.up && !st.up) st.grow = 0; st.up = h.up; st.hpk = h.max ? h.hp / h.max : 1; } }
      neckOpen = s.b && s.b.neck ? 1 : 0;
      if (bossId === 'leviathan') {
        const weak = s.targets.find(x => x.kind === 'weak'), decoy = s.targets.find(x => x.kind === 'decoy');
        if (weak && weakI < 0) weakI = clamp(frontI, 2, SEG - 3);
        if (!weak) weakI = -1;
        if (decoy && decoyI < 0) decoyI = (weakI + 9) % SEG < 2 ? 12 : (weakI + 9) % SEG;
        if (!decoy) decoyI = -1;
        const live = new Set();
        for (const x of s.targets.filter(x => x.kind === 'packet')) {
          live.add(x.id);
          const pk = packets.get(x.id);
          if (pk) { pk.left = x.left; pk.total = x.total; } else packets.set(x.id, { left: x.left, total: x.total, pos: anchors.head.clone(), gone: 0 });
        }
        for (const [id, pk] of packets) if (!live.has(id) && !pk.gone) pk.gone = clock.t;
      }
    }

    // ---------- events ----------
    const hitCol = tier => tier >= 3 ? C('#ffffff') : tier === 2 ? C('#3ee6ff') : C('#39ff88');
    function event(n, d = {}) {
      const t = clock.t;   // the scene's own clock, which the rigs read
      if (n === 'hit') {
        const crit = !!d.crit, big = d.src === 'sever' || d.src === 'weak' || (d.src === 'spell' && d.last);
        const land = () => {
          worldOf(d.at, v1);
          hitGlow = Math.max(hitGlow, crit ? 1 : 0.45);
          if (d.at && d.at.startsWith('head:') && hstate[d.at.slice(5)]) hstate[d.at.slice(5)].flash = 1;
          if (bossId === 'leviathan' && weakI >= 0 && d.src === 'weak') segFlash[weakI] = 1;
          flare(v1, crit ? C('#ffffff') : hitCol(d.tier || 0), crit ? 5 : 2.6, 0.22);
          if (crit || big) { juice.shake(big ? 0.45 : 0.22); juice.stop(big ? 85 : 50); recoil = Math.max(recoil, big ? 1 : 0.5); }
          if (big && canFlash()) flashAmt = 0.5;
          if (opts.onPop) { const p = proj(v1, {}); opts.onPop(d.amount, p.x, p.y, { crit, src: d.src, big }); }
        };
        if (d.src === 'spell' || d.src === 'sever' || !fx) land();
        else { const tier = Math.max(1, Math.min(4, d.tier || 1)); fx.shot(tier, v2.copy(artPos).setY(artPos.y + 0.8), out => worldOf(d.at, out), land, { color: d.src === 'weak' ? '#ffffff' : d.src === 'packet' ? '#3ee6ff' : null }); }
      }
      if (n === 'cast' && fx) {
        const tg = { ...target };
        if (bossId === 'leviathan') { tg.pos = out => out.copy(segPos[frontI]); tg.top = out => out.copy(segPos[frontI]).setY(segPos[frontI].y + 4); tg.base = out => out.set(segPos[frontI].x, 0, segPos[frontI].z); }
        fx.cast(d.spell, { caster, target: tg, hits: d.hits, effect: d.effect || {} });
        if (d.rarity >= 3) juice.glitch(0.4, 0.6);
      }
      if (n === 'hurt') {
        juice.shake(d.amount >= 12 ? 0.5 : 0.2); juice.tint('#ff4d5e', d.amount >= 12 ? 0.7 : 0.35); kick = 1;
        if (d.amount >= 12) juice.glitch(0.5, 0.35);
        flare(v1.copy(artPos).setY(1.5), C('#ff4d5e'), 4, 0.3);
      }
      if (n === 'block' || n === 'shielded' || n === 'warded') { wave(v1.copy(artPos).setY(0.15), C(n === 'shielded' ? '#f2c230' : '#3ee6ff'), 1, 7, 0.45); flare(v1.copy(artPos).setY(1.6), C('#bfefff'), 4, 0.25); }
      if (n === 'sever') {
        const s = hstate[d.head], h = HEADS.find(x => x.id === d.head);
        if (s && h) { shed(s.pos, 14, h.c, 1.2, 0.9); s.up = false; s.grow = 0; wave(v1.copy(s.pos), h.c, 1, 8, 0.5, false); }
        juice.shake(0.5); juice.stop(90);
      }
      if (n === 'regrow') { const s = hstate[d.head]; if (s) { s.up = true; s.grow = 0; } }
      if (n === 'neck') { if (d.on) { juice.shake(0.4); wave(v1.copy(anchors.core), C('#ffffff'), 1, 14, 0.7, false); } }
      if (n === 'windup') {
        if (d.kind === 'breath' || d.kind === 'mend') { const s = hstate[d.owner]; if (s) { s.chargeUntil = t + d.ms / 1000; s.chargeLen = d.ms / 1000; } }
        if (d.kind === 'overflow') { towerChargeUntil = t + d.ms / 1000; towerCharge = d.ms / 1000; }
        if (d.kind === 'lunge' || d.kind === 'sweep') { diveUntil = t + d.ms / 1000; diveLen = d.ms / 1000; }
      }
      if (n === 'attack' && d.kind === 'bite') { const s = hstate.fork; if (s) s.lunge = t; }
      if (n === 'blockFail' || n === 'cancel') {
        if (d.attack === 'breath' || d.owner === 'root') hstate.root.chargeUntil = 0;
        if (d.attack === 'overflow') towerChargeUntil = 0;
        if (d.attack === 'lunge' || d.attack === 'sweep') { diveUntil = 0; if (n === 'blockFail') lungeAt = t; }
      }
      if (n === 'block') { if (d.attack === 'breath') hstate.root.chargeUntil = 0; if (d.attack === 'overflow') towerChargeUntil = 0; if (d.attack === 'lunge' || d.attack === 'sweep') diveUntil = 0; }
      if (n === 'compile') { screenPulse = 1; juice.tint('#ff4d5e', 0.5); wave(v1.copy(anchors.core), C('#ff4d5e'), 2, 16, 0.6, false); }
      if (n === 'fix') screenPulse = Math.max(screenPulse, 0.4);
      if (n === 'phase') {
        juice.shake(0.6); juice.glitch(0.7, 0.8); juice.stop(120); recoil = 1;
        if (canFlash()) flashAmt = 0.6;
        if (bossId === 'compiler') for (let i = 0; i < 6; i++) { const id = 1 + Math.floor(Math.random() * 50); towerLost.add(id); }
        shed(anchors.core, 18, pal.a, 1.4, 0.8);
      }
      if (n === 'enrage') { juice.tint('#ff4d5e', 1); juice.glitch(0.6, 1); }
      if (n === 'finish') { juice.dim(0.45, d.ms / 1000); juice.glitch(0.3, 0.5); }
      if (n === 'finishFail') { juice.shake(0.5); juice.tint('#ff4d5e', 1); }
      if (n === 'win') { dead = true; deadT = 0; juice.shake(0.9); juice.stop(160); if (canFlash()) flashAmt = 1; shed(anchors.core, 40, C('#ffffff'), 2, 1); juice.dim(0, 0.1); }
      if (n === 'lose') { juice.tint('#ff4d5e', 1); juice.glitch(1, 1.5); juice.dim(0.5, 3); }
      if (n === 'support') { const c = d.kind === 'chaos' ? C('#ff4da6') : C('#f2c230'); wave(v1.copy(artPos).setY(0.2), c, 1, 9, 0.6); flare(v1.copy(artPos).setY(2.4), c, 5, 0.35); }
      if (n === 'decoy') { if (decoyI >= 0) segFlash[decoyI] = 1; juice.tint('#ff4d5e', 0.6); }
      if (n === 'weak' && !d.hit) weakI = -1;
      if (n === 'packet' && d.returned) { const pk = packets.get(d.id); if (pk) { pk.gone = clock.t; flare(pk.pos, C('#3ee6ff'), 3, 0.25); } }
      if (n === 'tier' && d.tier >= 3) { wave(v1.copy(artPos).setY(0.15), C('#eafff2'), 1, 10, 0.6); }
    }

    // ---------- the frame ----------
    let paused = false, slowK = 1, lastT = performance.now();
    renderer.setAnimationLoop(() => {
      const nowMs = performance.now();
      // rdt is real time for fades, so a slow frame never leaves a tint or a flash on screen
      const rdt = Math.min(0.5, (nowMs - lastT) / 1000);
      let dt = Math.min(0.05, rdt); lastT = nowMs;
      if (!visible || document.hidden) return;
      if (paused) dt = 0;
      dt *= slowK;
      const stopped = nowMs < stopUntil;
      const adt = stopped ? 0 : dt * (finishing ? 0.55 : 1);
      clock.t += adt;
      const t = clock.t;
      if (palT < 1) { palT = Math.min(1, palT + dt / 1.6); applyPal(ease(palT)); }
      scene.background.copy(pal.bg); scene.fog.color.copy(pal.bg);
      wallMat.color.copy(pal.a); codeTex.offset.y -= adt * (0.05 + phase * 0.03);
      floorMat.uniforms.uTime.value = t; floorMat.uniforms.uA.value.copy(pal.a); floorMat.uniforms.uB.value.copy(pal.b); floorMat.uniforms.uBg.value.copy(pal.bg);
      floorMat.uniforms.uPulse.value = Math.max(0, floorMat.uniforms.uPulse.value - dt * 2);
      blockMat.uniforms.uTime.value = t; blockMat.uniforms.uFog.value.copy(pal.bg);
      bloom.strength = pal.bloom + (enraged ? 0.12 : 0) + flashAmt * 0.4;
      hitGlow = Math.max(0, hitGlow - rdt * 4);
      blockMat.uniforms.uHit.value = hitGlow;
      recoil = Math.max(0, recoil - dt * 3);
      if (dead) deadT = Math.min(3, deadT + dt);
      nB = 0;
      if (bossId === 'hydra') hydra(t, adt);
      else if (bossId === 'compiler') compiler(t, adt);
      else leviathan(t, adt);
      // Art's marker
      put(v1.copy(artPos).setY(artPos.y + Math.sin(t * 2) * 0.15), 0.9, 0.9, 0.9, Math.PI / 4, t * 1.5, Math.PI / 4, C('#39ff88'), 2 + kick);
      put(v1.copy(artPos).setY(0.08), 3.2, 0.06, 0.18, 0, t * 0.6, 0, C('#39ff88'), 1.3);
      put(v1.copy(artPos).setY(0.08), 0.18, 0.06, 3.2, 0, t * 0.6, 0, C('#39ff88'), 1.3);
      if (snap && snap.art.shield) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t; put(v2.copy(artPos).add(v3.set(Math.cos(a) * 1.8, 1.2, Math.sin(a) * 1.8)), 0.5, 0.9, 0.12, 0, -a, 0, C('#f2c230'), 1.8); }
      kick = Math.max(0, kick - dt * 3);
      // debris
      for (let i = debris.length - 1; i >= 0; i--) {
        const b = debris[i];
        b.t += adt; b.v.y -= 16 * adt; b.p.addScaledVector(b.v, adt);
        if (b.p.y < 0.2) { b.p.y = 0.2; b.v.y *= -0.3; b.v.x *= 0.7; b.v.z *= 0.7; }
        b.r.addScaledVector(b.w, adt);
        if (b.t > b.life) { debris.splice(i, 1); continue; }
        put(b.p, b.s, b.s, b.s, b.r.x, b.r.y, 0, b.c, 1.2 * (1 - b.t / b.life));
      }
      blocks.count = nB;
      blocks.instanceMatrix.needsUpdate = true;
      if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
      for (const f of flares) { if (!f.m.visible) continue; f.t += rdt; const u = f.t / f.life; if (u >= 1) { f.m.visible = false; continue; } f.m.scale.setScalar(f.size * (0.6 + 0.6 * ease(u))); f.m.material.opacity = (1 - u) * 0.9; }
      for (const w of rings) { if (!w.m.visible) continue; w.t += rdt; const u = w.t / w.life; if (u >= 1) { w.m.visible = false; continue; } w.m.scale.setScalar(w.r0 + (w.r1 - w.r0) * ease(u)); w.m.material.opacity = (1 - u) * 0.9; }
      // camera: a slow drift, a moderate shake and a push in on the finish
      shake = Math.max(0, shake - rdt * 1.8);
      const sh = Math.min(SHAKE_MAX, shake) * shakeK();
      const push = finishing ? 4 : 0;
      camera.position.set(camBase.x + Math.sin(t * 0.21) * 0.5 + Math.sin(nowMs * 0.041) * sh, camBase.y + Math.sin(t * 0.17) * 0.25 + Math.sin(nowMs * 0.037 + 1) * sh * 0.7 + kick * 0.15 * shakeK(), camBase.z - push);
      lookCur.lerp(v1.set(anchors.core.x * 0.25, camLook.y, camLook.z), Math.min(1, dt * 2));
      camera.lookAt(lookCur);
      // post
      tintAmt = Math.max(0, tintAmt - rdt * 1.6); post.uniforms.uTintAmt.value = Math.max(tintAmt, enraged ? 0.22 + Math.sin(nowMs / 300) * 0.06 : 0);
      if (enraged && tintAmt < 0.01) post.uniforms.uTint.value.set('#ff4d5e');
      let gl = nowS() < glitchUntil ? glitchK : (glitchK = 0);
      if (motionOff) gl *= 0.3;
      post.uniforms.uGlitch.value = gl + (lost ? 0.3 : 0);
      dimCur += ((nowS() < dimUntil ? dimK : 0) - dimCur) * Math.min(1, dt * 3);
      post.uniforms.uDim.value = dimCur;
      flashAmt = Math.max(0, flashAmt - rdt * 5);
      post.uniforms.uFlash.value = flashAmt;
      post.uniforms.uTime.value = nowMs / 1000;
      if (fx) fx.update(adt);
      composer.render();
      if (opts.onFrame) opts.onFrame();
    });

    function setBoss(id) {
      bossId = id; B = SuperData.boss(id);
      floorMat.uniforms.uMode.value = id === 'hydra' ? 0 : id === 'compiler' ? 1 : 2;
      phase = snap && snap.boss === id ? snap.phase : 1;
      dead = false; deadT = 0; debris.length = 0; towerLost.clear(); packets.clear(); weakI = decoyI = -1;
      for (const h of HEADS) Object.assign(hstate[h.id], { up: true, grow: 1, chargeUntil: 0 });
      if (fx) fx.clear();
      palette(phase - 1, true);
    }
    setBoss(bossId);
    palFrom = { bg: pal.bg.clone(), a: pal.a.clone(), b: pal.b.clone(), c: pal.c.clone(), bloom: pal.bloom };

    function dispose() {
      renderer.setAnimationLoop(null);
      if (fx) fx.dispose();
      ro.disconnect(); io.disconnect();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
      keep.forEach(x => x.dispose && x.dispose());
      bloom.dispose(); if (composer.dispose) composer.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }
    function info() { return { boss: bossId, phase, blocks: nB, debris: debris.length, dead, weakI, frontI, packets: packets.size, fx: fx ? fx.info() : null }; }
    return { apply, event, anchor, screenRect, setBoss, setReduce: on => { reduceShake = on; }, pause: on => { paused = !!on; }, slow: k => { slowK = k; }, info, dispose };
  }

  return { mount };
})();
