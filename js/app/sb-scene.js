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
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/utils/BufferGeometryUtils.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  function mount(host, opts = {}) {
    let impl = null, gone = false, last = null, boss = opts.boss || 'hydra', reduce = !!opts.reduceShake;
    const ctl = {
      ready: load().then(L => {
        if (gone) return false;
        impl = build(host, { ...opts, boss, reduceShake: reduce }, L[0], L[1].EffectComposer, L[2].RenderPass, L[3].UnrealBloomPass, L[4].OutputPass, L[5].ShaderPass, { RoundedBox: L[6].RoundedBoxGeometry, BGU: L[7] });
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
      bench: n => (impl ? impl.bench(n) : null),
      cam: (p, l, f) => impl && impl.cam(p, l, f),
      step: (s2, f) => impl && impl.step(s2, f),
      model: () => impl && impl.model(),
      artBot: () => impl && impl.artBot(),
      dispose: () => { gone = true; if (impl) impl.dispose(); },
      cameraAt: () => impl && impl.cameraAt(),
    };
    window.__sbLast = ctl;   // test hook: the newest arena, the lobby preview included
    return ctl;
  }

  function build(host, opts, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, ext) {
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
    scene.background = new THREE.Color(Theme.hex('bg-0'));
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
    scene.fog = new THREE.FogExp2(Theme.hex('bg-0'), 0.011);
    // light: a cool key from high front, a coloured rim from behind and a fill from the floor, so the
    // armour has a lit side, a dark side and an edge that reads against the dark
    const hemi = new THREE.HemisphereLight(0xa8b8c8, 0x06080a, 0.5); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xe8f2ff, 2.4); key.position.set(-8, 22, 18); scene.add(key);
    const rim = new THREE.DirectionalLight(0x39ff88, 1.5); rim.position.set(10, 12, -24); scene.add(rim);
    const K = SuperKit.create(THREE, scene, renderer, ext);

    // ---------- palette ----------
    let bossId = opts.boss || 'hydra', B = SuperData.boss(bossId);
    const pal = { bg: C(Theme.hex('bg-0')), a: C(Theme.hex('accent')), b: C(Theme.hex('accent-dim')), c: C('#3ee6ff'), bloom: 0.6 };
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
    const wallMat = own(new THREE.MeshBasicMaterial({ map: codeTex, color: pal.a.clone(), transparent: true, opacity: 0.07, depthWrite: false, fog: false }));
    const wall = new THREE.Mesh(own(new THREE.PlaneGeometry(190, 70)), wallMat);
    wall.position.set(0, 24, -48); scene.add(wall);
    // the floor: flooded pit (hydra), build hall (compiler) or open sea (leviathan). Lights above it
    // (each head, the core, the wave) leave a pool and a streak on it, the way neon reflects on water
    const LP = 6;
    const floorMat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uA: { value: pal.a.clone() }, uB: { value: pal.b.clone() }, uBg: { value: pal.bg.clone() }, uPulse: { value: 0 },
        uLP: { value: Array.from({ length: LP }, () => new THREE.Vector4(0, 0, 0, 0)) }, uLC: { value: Array.from({ length: LP }, () => new THREE.Color()) }, uCam: { value: new V() } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform float uMode; uniform vec3 uA; uniform vec3 uB; uniform vec3 uBg; uniform float uPulse; uniform vec4 uLP[${LP}]; uniform vec3 uLC[${LP}]; uniform vec3 uCam; varying vec3 vW;
        float ln(float x, float s, float w){ float f = abs(fract(x / s + 0.5) - 0.5) * s; return 1.0 - smoothstep(0.0, w, f); }
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec2 p = vW.xz;
          float g = max(ln(p.x, 3.0, 0.06), ln(p.y, 3.0, 0.06));
          vec3 c = uBg + uB * g * 0.55;
          float wet = 0.0;
          if (uMode < 0.5) {
            // black water over a sunken grid: slow ripples, glints and the grid seen through it
            float r = length(p - vec2(0.0, -8.0));
            float rip = smoothstep(0.82, 1.0, sin(r * 1.3 - uTime * 2.2)) * exp(-r * 0.05);
            float n = vn(p * 0.35 + vec2(uTime * 0.12, uTime * 0.05)) * 0.6 + vn(p * 1.1 - vec2(uTime * 0.3, 0.0)) * 0.4;
            float glint = smoothstep(0.78, 0.95, n) * 0.35;
            c = uBg * 0.9 + uB * g * 0.18 * (0.6 + 0.4 * n) + uA * rip * 0.16 + uA * glint * 0.25;
            wet = 1.0;
          } else if (uMode < 1.5) {
            // polished floor of the build hall: lanes of light running to the tower
            float lane = ln(p.x, 9.0, 0.12) * step(-40.0, p.y);
            float run = smoothstep(0.7, 1.0, sin(p.y * 0.6 + uTime * 4.0)) * ln(p.x, 9.0, 0.5);
            float tile = max(ln(p.x, 4.5, 0.03), ln(p.y, 4.5, 0.03));
            c = uBg * 1.1 + uB * tile * 0.25 + uA * (lane * 0.35 + run * 0.4);
            wet = 0.55;
          } else {
            // the open sea: long swells and foam lines
            float sw = sin(p.x * 0.18 + p.y * 0.35 + uTime * 1.2) * 0.5 + sin(p.x * -0.31 + p.y * 0.17 - uTime * 0.8) * 0.5;
            float n = vn(p * 0.5 + vec2(uTime * 0.2, -uTime * 0.1));
            float n2 = vn(p * 0.18 + vec2(-uTime * 0.05, uTime * 0.07));
            float foam = smoothstep(0.62, 0.9, n * 0.6 + n2 * 0.6 + sw * 0.15) * 0.5;
            c = uBg * (1.05 + sw * 0.18) + uB * g * 0.06 + uA * foam * 0.22 + uB * smoothstep(0.3, 1.0, sw) * 0.25;
            wet = 1.0;
          }
          // reflections of the lights above: a pool under each and a streak toward the camera
          vec2 toCam = normalize(uCam.xz - p);
          for (int i = 0; i < ${LP}; i++) {
            vec4 L = uLP[i]; if (L.w <= 0.0) continue;
            vec2 d = p - L.xz;
            float pool = exp(-dot(d, d) / (6.0 + L.y * 0.8));
            float along = dot(d, normalize(uCam.xz - L.xz)); float across = length(d - along * normalize(uCam.xz - L.xz));
            float wob = 1.0 + 0.35 * sin(along * 2.2 - uTime * 3.0 + across * 3.0);
            float streak = exp(-across * across / (0.9 * wob)) * smoothstep(-2.0, 2.0, along) * exp(-max(0.0, along) / (6.0 + L.y));
            c += uLC[i] * L.w * (pool * 0.35 + streak * 0.55 * wet);
          }
          c += uA * uPulse * 0.25 * exp(-length(p - vec2(0.0, 8.0)) * 0.06);
          float d = length(p - vec2(0.0, -2.0));
          c = mix(c, uBg, smoothstep(34.0, 90.0, d));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    const pools = floorMat.uniforms.uLP.value, poolC = floorMat.uniforms.uLC.value;
    function lightPool(i, at, c, k) { if (i >= LP) return; pools[i].set(at.x, Math.max(0, at.y), at.z, k); poolC[i].copy(c.isColor ? c : C(c)); }
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(240, 200)), floorMat);
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    // ---------- atmosphere: low mist, shafts of light from above and dust in the air ----------
    const mistMat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Color() }, uA: { value: 0.28 }, uFog: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform vec3 uC; uniform float uA; uniform float uFog; varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec2 p = vW.xz * 0.07 + vec2(uTime * 0.02, uTime * 0.008) + vW.y * 0.3;
          float n = vn(p) * 0.6 + vn(p * 2.3 - uTime * 0.03) * 0.4;
          float edge = smoothstep(40.0, 18.0, length(vW.xz - vec2(0.0, -6.0)));
          float a = smoothstep(0.35, 0.85, n) * edge * (uA + uFog);
          gl_FragColor = vec4(uC * a, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const mistGeo = own(new THREE.PlaneGeometry(90, 70));
    const mists = [1.2].map((y, i) => { const m = new THREE.Mesh(mistGeo, mistMat); m.rotation.x = -Math.PI / 2; m.position.set(0, y, -8 + i * 3); m.renderOrder = 2; scene.add(m); return m; });
    const shaftMat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Color() }, uA: { value: 0.13 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uC; uniform float uA; varying vec2 vUv;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0; float a = (1.0 - x * x) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          a *= 0.7 + 0.3 * sin(vUv.y * 9.0 + uTime * 0.7 + vUv.x * 4.0);
          gl_FragColor = vec4(uC * a * uA, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const shaftGeo = own(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0));
    const shafts = [[-16, 30, -20, 9, 0.35], [-4, 32, -26, 6, 0.12], [12, 30, -22, 8, -0.3], [24, 28, -12, 6, -0.4]].map(([x, y, z, w, tilt]) => {
      const m = new THREE.Mesh(shaftGeo, shaftMat); m.position.set(x, y, z); m.scale.set(w, 40, 1); m.rotation.set(0, 0, tilt); m.renderOrder = 1; scene.add(m); return m;
    });
    // dust: drifts on its own in the vertex shader, so the CPU never touches it
    const DUST = 320, dPos = new Float32Array(DUST * 3), dSeed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) { dPos[i * 3] = rnd(-34, 34); dPos[i * 3 + 1] = rnd(0, 22); dPos[i * 3 + 2] = rnd(-30, 22); dSeed[i] = Math.random() * 100; }
    const dGeo = own(new THREE.BufferGeometry()); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dGeo.setAttribute('seed', new THREE.BufferAttribute(dSeed, 1));
    const dustMat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Color() }, uPx: { value: 600 }, uRise: { value: 0.3 } },
      vertexShader: `attribute float seed; uniform float uTime; uniform float uPx; uniform float uRise; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y + uTime * uRise * (0.5 + fract(seed) ), 22.0); p.x += sin(uTime * 0.3 + seed) * 1.5; p.z += cos(uTime * 0.23 + seed * 1.3) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = (0.4 + 0.6 * sin(uTime * 1.5 + seed * 7.0) * 0.5 + 0.3) * smoothstep(0.0, 2.0, p.y) * smoothstep(22.0, 17.0, p.y);
          gl_PointSize = clamp((0.08 + fract(seed * 3.7) * 0.1) * uPx / max(0.5, -mv.z), 1.0, 8.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform vec3 uC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uC * smoothstep(0.5, 0.0, d) * vA, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const dust = new THREE.Points(dGeo, dustMat); dust.frustumCulled = false; scene.add(dust);
    // adaptive quality (js/room/aq.js): resolution first, then the extras (mist, shafts, dust, light
    // pools on the floor), so a slow machine stays smooth. window.__sbFull keeps everything for tests
    const basePR = Math.min(1.25, devicePixelRatio || 1);
    let detail = 1;
    function setDetail(d) {
      detail = d;
      mists.forEach(m => { m.visible = d > 0.8; });
      shafts.forEach(m => { m.visible = d > 0.62; });
      dust.visible = d > 0.48;
    }
    const aq = window.AdaptiveQuality && !window.__sbFull ? AdaptiveQuality.create({ key: 'wpm-sb', fps: 60, minScale: 0.6, minDetail: 0.4,
      onScale: s2 => { renderer.setPixelRatio(basePR * s2); fit(); }, onDetail: setDetail }) : null;
    function atmosphere(t, px, fogK) {
      mistMat.uniforms.uTime.value = t; mistMat.uniforms.uC.value.copy(pal.c).lerp(pal.a, 0.4).multiplyScalar(0.18); mistMat.uniforms.uFog.value = fogK;
      shaftMat.uniforms.uTime.value = t; shaftMat.uniforms.uC.value.copy(pal.c).lerp(new THREE.Color(1, 1, 1), 0.35);
      dustMat.uniforms.uTime.value = t; dustMat.uniforms.uPx.value = px; dustMat.uniforms.uC.value.copy(pal.a).lerp(new THREE.Color(1, 1, 1), 0.4).multiplyScalar(0.9);
    }

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
      if (model) { K.fx.burst(at, Math.min(60, n * 3), c, { speed: 9 * power, g: 9, life: 0.8, size: 0.3 }); return; }
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.42, 0.52);
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
          // grade: a touch less saturation in the mids and more contrast, so colour is kept for light
          c = clamp(c, 0.0, 1.0);
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, 0.86 + 0.14 * smoothstep(0.5, 1.0, l));
          c = c * c * (3.0 - 2.0 * c) * 0.32 + c * 0.68;
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
    const SHAKE_MAX = 0.9;
    // kb: the boss knocked back by hits, a spring so it snaps back; slowUntil: the slow-motion beat on a block
    let kb = 0, kbV = 0, slowUntil = 0;
    const knock = imp => { kbV += imp; };

    // ---------- Art: the caster, at the front of the arena ----------
    const artPos = new V(0, 0.9, 15);
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, { glowTex, calm: false, reduce: motionOff, pixelHeight: () => renderer.domElement.height, juice }) : null;
    const caster = { pos: out => artFrom(out) };   // spell-fx: spells leave Art's bot, where his shots do
    // Art fights through his bot (Gid, 27 Nov 2026), the one he brings to a Duel: the bot seeded from 'art', in his
    // cyan. sb-bots.js flies it round his side of the arena on his typing (28 Nov 2026: "Art's bot is flitting around
    // as well, not stationary"), and brings in the viewers' bots and the items they drop. artPos follows it on the floor,
    // so every boss's aim, floor marks and support effects track where it is.
    let bots = null, artBot = null;
    // where Art's shots leave: his bot's muzzle, or just above his spot
    const artFrom = out => (bots ? bots.muzzle(out) : out.copy(artPos).setY(artPos.y + 0.8));
    // ---------- the bosses ----------
    const clock = { t: 0 };
    let snap = null, phase = 1, dead = false, deadT = 0, lost = false, finishing = false, enraged = false;
    const anchors = { core: new V(0, 7, -6), body: new V(0, 7, -6), head: new V(0, 8, 0) };
    const target = {
      size: 5,
      pos: out => out.copy(anchors.core),
      top: out => out.copy(anchors.core).setY(anchors.core.y + 4),
      base: out => out.set(anchors.core.x, 0, anchors.core.z),
      react: (k, p, x) => { if (k === 'flash' || k === 'flinch') hitGlow = Math.max(hitGlow, 0.6); if (k === 'stagger' || k === 'break') { hitGlow = 1; recoil = 1; } spellReact(k, p, x); },
    };
    let recoil = 0;

    // the boss models (sb-hydra.js, ...): each builds its body, props and actions with the kit
    let model = null, release = null, neckOpen = 0;
    const mctx = {
      artPos, pal, lightPool, camPos: camera.position,
      juice: { shake: k => juice.shake(k), stop: ms => juice.stop(ms), flash: k => { if (canFlash()) flashAmt = Math.max(flashAmt, k); }, tint: (h, k) => juice.tint(h, k), glitch: (k, s2) => juice.glitch(k, s2) },
      shed: (at, n, c, p, sz) => shed(at, n, c, p, sz),
      put: (p, sx, sy, sz, rx, ry, rz, c, k) => put(p, sx, sy, sz, rx, ry, rz, c, k),
      sfx: (n, a) => { if (opts.sfx !== false && window.SuperAudio) SuperAudio.play(n, a); },
      // where a blocked attack stops: Art's barrier, a little in front of him
      shieldAt: out => (bots ? bots.shieldAt(out) : out.set(artPos.x, 2.2, artPos.z - 3.2)),
      // where an attack that lands should hit: the middle of Art's bot (it hovers about 2.6 up), or chest height
      // on the old marker. Gid, 28 Nov 2026: the hydra's beam was hitting the floor under the bot
      artAim: out => (bots ? bots.aim(out) : out.copy(artPos).setY(1.4)),
      // a boss can ask the broadcast camera for its own shots (sb-cam.js); the director still turns down any that would hide an attack
      want: (n, x) => cam.want(n, x),
      // a boss tells the bots which look an attack takes (a beam or a volley, a slam or a lunge), so the bot weaves to fit
      variant: (attack, v) => { if (bots) bots.variant(attack, v); },
    };
    const sup = SuperSupport.create(THREE, scene, K, { artPos, yaw: () => (bots ? bots.yaw() : Math.PI), glitch: (k, s2) => juice.glitch(k, s2), tint: (h, k) => juice.tint(h, k), now: () => clock.t });
    if (window.SuperBots) {
      try {
        bots = SuperBots.create(THREE, scene, K, { three: { ...THREE, RoundedBoxGeometry: ext && ext.RoundedBox }, artPos, fx, host,
          focus: out => out.copy(model && model.focus ? model.focus : anchors.core),
          // a tall boss (the Compiler) has the bots fly higher, so the camera can look up at both
          lane: () => (model && model.botLane) || null,
          liftK: () => Math.max(0, ((model && model.height) || 16) - 16) * 0.25,
          target: (out, i) => worldOf(i % 3 === 2 ? 'body' : 'core', out),
          sfx: (n, a) => mctx.sfx(n, a) });
        artBot = bots.art;
      } catch (e) { bots = null; }
    }
    function mountModel(id) {
      if (model) { scene.remove(model.group, model.props); model.dispose(); }
      if (release) release();
      model = null; release = null;
      const make = window.SuperModels && SuperModels[id];
      if (!make) return;
      release = K.scope();
      model = make(THREE, K, mctx);
      scene.add(model.group, model.props);
    }

    // The Compiler
    const TOWER = { x: 0, y: 10, z: -7, w: 23, h: 12.5 };
    const towerLost = new Set();
    let towerCharge = 0, towerChargeUntil = 0, screenPulse = 0;
    function compiler(t, dt) {
      const { x, y, z, w, h } = TOWER;
      const rec = recoil * 0.5 + kb * 1.6;
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
    let serpS = 0, frontI = 0, weakI = -1, decoyI = -1, segFlash = new Float32Array(SEG), segKick = new Float32Array(SEG), diveK = 0, diveUntil = 0, diveLen = 1, lungeAt = -9;
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
        segKick[i] = Math.max(0, segKick[i] - dt * 2.2);
        v1.z -= segKick[i] * 3 + kb * 1.2; v1.y += segKick[i] * 1.5;
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
      hp.y += diving * 5 + lunge * 2 + kb * 1.4; hp.z += lunge * 12 + diving * 4 - kb * 3.5;
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
    // the broadcast camera: CamDirector plays the shots in sb-cam.js. dirSlow is the slow motion a shot asks for
    let dirSlow = 1, dirSlowUntil = 0, snapAt = 0, dirT = 0;
    const cam = SuperCam.create(THREE, camera, { reduce: motionOff, model: () => model, art: out => (bots ? bots.subject(out) : out.copy(artPos).setY(3.2)), chase: () => (bots ? bots.chase() : null), setSlow: (k, len) => { dirSlow = k; dirSlowUntil = dirT + len; } });
    // the next moment an attack at Art lands, in real seconds: no cutaway may hide one
    const THREAT = new Set(['block', 'packet', 'weak', 'decoy', 'fix']);
    function threatAt(nowMs) {
      if (!snap || !snap.targets) return Infinity;
      let m = Infinity;
      for (const x of snap.targets) if (THREAT.has(x.kind) && x.left != null) m = Math.min(m, x.left - (nowMs - snapAt));
      // the streamer's page fights on one line (InlineLine): its specials are in line.tags, not in targets
      if (snap.line && snap.line.tags) for (const g of snap.line.tags) if (g && g.first && THREAT.has(g.kind) && g.ms) m = Math.min(m, g.ms - g.el - (nowMs - snapAt));
      return m === Infinity ? Infinity : dirT + Math.max(0, m) / 1000;
    }
    const threatIn = nowMs => { const a = threatAt(nowMs); return a === Infinity ? Infinity : a - dirT; };
    function fit() {
      const w = host.clientWidth || 800, h = host.clientHeight || 600;
      renderer.setSize(w, h, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
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
      if (key === 'art') return proj(bots ? bots.aim(v1).setY(v1.y + 1.4) : v1.copy(artPos).setY(artPos.y + 1), out);
      if (model) { const w = model.anchor(key, v1); if (w) return proj(w, out); if (key.startsWith('head:')) return null; }
      if (key === 'seg:front') return proj(v1.copy(segPos[weakI >= 0 ? weakI : frontI]).setY(segPos[weakI >= 0 ? weakI : frontI].y + 3.4), out);
      if (key === 'seg:far') return proj(v1.copy(segPos[decoyI >= 0 ? decoyI : 12]).setY(segPos[decoyI >= 0 ? decoyI : 12].y + 3.4), out);
      if (key.startsWith('packet:')) { const pk = packets.get(key.slice(7)); return pk ? proj(v1.copy(pk.pos).setY(pk.pos.y + 1.3), out) : null; }
      if (key === 'head') return proj(v1.copy(anchors.head).setY(anchors.head.y + 2.6), out);
      if (key === 'core' || key === 'body') return proj(anchors[key], out);
      return null;
    }
    function worldOf(at, out) {
      if (!at) return out.copy(anchors.core);
      if (model) return model.worldOf(at, out);
      if (at === 'seg:front') return out.copy(segPos[weakI >= 0 ? weakI : frontI]);
      if (at === 'head') return out.copy(anchors.head);
      if (at.startsWith('line:')) return out.copy(anchors.core).add(v4.set(rnd(-4, 4), rnd(-2, 3), 1));
      return out.copy(anchors[at] || anchors.core);
    }

    // ---------- snapshots ----------
    function apply(s) {
      snap = s; snapAt = performance.now();
      if (s.phase !== phase) { phase = s.phase; palette(phase - 1, false); }
      enraged = !!s.enraged;
      finishing = s.status === 'finish';
      if (s.status === 'won' && !dead) { dead = true; deadT = 0; }
      if (s.status !== 'won' && dead && s.status !== 'lost') { dead = false; }
      lost = s.status === 'lost';
      neckOpen = s.b && s.b.neck ? 1 : 0;
      if (model && model.apply) model.apply(s);
      if (model && model.packets) model.packets(s.targets.filter(x => x.kind === 'packet').map((x, i) => ({ id: x.id, left: x.left, total: x.total, i })), clock.t);
      if (bossId === 'leviathan' && !model) {
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
    const hitCol = tier => tier >= 3 ? C('#ffffff') : tier === 2 ? C('#3ee6ff') : C(Theme.hex('accent'));
    // where an attack comes from, for the shots and bursts on a block, a miss or an interrupt
    function attackerPos(attack, owner, out) {
      if (model) return model.attacker(attack, owner, out);
      if (bossId === 'leviathan') return out.copy(anchors.head);
      return out.copy(anchors.core);
    }
    // ---------- spell-fx (28 Nov 2026): fizzles, statuses, the spell shot and the boss's guard ----------
    // A fizzled spell still leaves Art's bot and the boss blocks it, swats it away or sways out of its way
    // (fx.fizzle in js/app/combat/fx3d.js); the buffs stay on his bot while they last; the camera follows a
    // spell from his bot to the landing (sb-cam.js spell). Purely visual: no rule here changes.
    let gSnd = null, dodgeAt = -9, dodgeSide = 1, dodgeOff = 0, spellCamAt = -9;
    function guardSnd(k) {
      if (opts.sfx === false || !window.SuperAudio || !window.Combat || !Combat.Audio) return;
      try { gSnd ||= Combat.Audio.create({ ctx: () => SuperAudio.combat().ac, out: () => SuperAudio.combat().bus, on: () => SuperAudio.on }); gSnd.play(k === 'dodge' ? 'whiff' : 'parry'); } catch (e) {}
    }
    function spellReact(k, p, x) {
      if (k === 'block') { hitGlow = Math.max(hitGlow, 0.35); knock(0.6); guardSnd('block'); }
      else if (k === 'dodge') { dodgeAt = clock.t; dodgeSide = (x && x.side) || 1; guardSnd('dodge'); }
      else if (k === 'pull') knock(-0.5);
      else if (k === 'freeze' || k === 'stun') { hitGlow = Math.max(hitGlow, 0.5); recoil = Math.max(recoil, 0.6); }
    }
    // the boss sways out of a dodged bolt's way and back: an offset on its group, added after the model moves it
    function spellDodge() {
      if (!model) return;
      const du = clock.t - dodgeAt, k = du < 1.2 ? (du < 0.22 ? 1 - Math.pow(1 - du / 0.22, 3) : Math.max(0, 1 - (du - 0.45) / 0.75)) : 0;
      const off = k * 3.2 * dodgeSide * (motionOff ? 0.4 : 1);
      model.group.position.x += off - dodgeOff; dodgeOff = off;
    }
    function spellCam(id, hits, fizz) {
      if (motionOff || !cam.spell) return;
      const sp = window.Combat && Combat.spell(id);
      if (!sp || (!fizz && !sp.strike)) return;
      const f = hits && hits.length ? hits[0].at / 1000 : 0.5, last = hits && hits.length ? hits[hits.length - 1].at / 1000 : f;
      const a = Math.round(clamp(f - 0.4, 0.2, 0.6) * 20) / 20, b = Math.round(clamp(f - 0.25 - a + Math.min(1.6, last - f) + 0.85, 0.8, 2.6) * 20) / 20;
      if (clock.t - spellCamAt < 4) return;
      if (cam.spell(a, b, 3)) spellCamAt = clock.t;
    }
    function spellEvent(n, d) {
      if (!fx) return;
      if (n === 'fizzle' && d.spell) {
        const tg = { ...target };
        if (bossId === 'leviathan' && !model) { tg.pos = out => out.copy(segPos[frontI]); tg.base = out => out.set(segPos[frontI].x, 0, segPos[frontI].z); }
        fx.fizzle(d.spell, { caster, target: tg });
        spellCam(d.spell, null, true);
      }
      if (n === 'status' && !d.on && ['ward', 'hyper', 'root', 'split', 'cshield', 'frenzy'].includes(d.name)) fx.aura(d.name, false);
      if (n === 'warded') fx.event('ward', { caster });
      if (n === 'guard') fx.event('guard', { caster });
    }

    function event(n, d = {}) {
      const t = clock.t;   // the scene's own clock, which the rigs read
      if (model) model.event(n, d, t);
      sup.event(n, d);
      if (bots) bots.event(n, d, snap);
      if (n === 'key' && d.finish && d.good && model) { model.anchor('core', v1); K.fx.beam(artFrom(v2), v1, '#ffffff', 0.18, 0.12, { grow: 0.06 }); K.fx.burst(v1, 8, '#ffffff', { speed: 6, g: 2, life: 0.35, size: 0.3 }); }
      if (n === 'countdown') { cam.want('intro'); if (bots) bots.clear(); }
      if (n === 'phase') cam.want('phase', model && model.face ? model.face : 'core');
      if (n === 'sever') cam.want('sever', d.head);
      if (n === 'neck' && d.on) cam.want('neck');
      if (n === 'weak' && d.hit) cam.want('weak');
      if (n === 'win') cam.want('kill');
      // the bots' shots: the weave past a blocked attack, a new combo tier, a big hit, the run to a dropped item
      if (n === 'block') cam.want('dodge');
      if (n === 'tier' && d.tier >= 2) cam.want('power');
      if (n === 'hit' && d.src !== 'spell' && ((d.crit && (d.tier || 0) >= 3) || d.src === 'counter')) cam.want('hero');
      if (n === 'drop' && d.kind === 'support' && d.ms >= 1400) cam.want('chase', null, Math.min(2.6, d.ms / 1000 - 0.15));
      if (n === 'hit') {
        const crit = !!d.crit, big = d.src === 'sever' || d.src === 'weak' || (d.src === 'spell' && d.last);
        const land = () => {
          worldOf(d.at, v1);
          hitGlow = Math.max(hitGlow, crit ? 1 : 0.45);
          if (bossId === 'leviathan' && weakI >= 0 && d.src === 'weak') segFlash[weakI] = 1;
          flare(v1, crit ? C('#ffffff') : hitCol(d.tier || 0), (crit ? 5 : 2.6) * (model ? 0.6 : 1), 0.22);
          if (crit || big) { juice.shake(big ? 0.6 : 0.3); juice.stop(big ? 95 : 55); recoil = Math.max(recoil, big ? 1 : 0.5); }
          else juice.shake(0.07);
          // every hit knocks it back: the body on a spring, the head that was hit thrown up and back
          const imp = Math.min(2.4, 0.35 + (d.amount || 0) * 0.012) * (crit ? 1.5 : 1) * (big ? 1.7 : 1);
          knock(imp);
          if (bossId === 'leviathan') { const i = d.src === 'weak' && weakI >= 0 ? weakI : frontI; for (let k = -2; k <= 2; k++) { const j = i + k; if (j > 0 && j < SEG) segKick[j] = Math.max(segKick[j], imp * (1 - Math.abs(k) * 0.3)); } }
          if (big && canFlash()) flashAmt = 0.5;
          if (opts.onPop) { const p = proj(v1, {}); opts.onPop(d.amount, p.x, p.y, { crit, src: d.src, big }); }
        };
        if (d.src === 'spell' || d.src === 'sever' || !fx) land();
        else { const tier = Math.max(1, Math.min(4, d.tier || 1)); fx.shot(tier, artFrom(v2), out => worldOf(d.at, out), land, { color: d.src === 'weak' ? '#ffffff' : d.src === 'packet' ? '#3ee6ff' : null }); }
      }
      if (n === 'cast' && fx) {
        const tg = { ...target };
        if (bossId === 'leviathan' && !model) { tg.pos = out => out.copy(segPos[frontI]); tg.top = out => out.copy(segPos[frontI]).setY(segPos[frontI].y + 4); tg.base = out => out.set(segPos[frontI].x, 0, segPos[frontI].z); }
        fx.cast(d.spell, { caster, target: tg, hits: d.hits, effect: d.effect || {} });
        if (d.rarity >= 3) juice.glitch(0.4, 0.6);
        spellCam(d.spell, d.hits, false);
      }
      spellEvent(n, d);
      if (n === 'hurt') {
        // an attack that lands on Art hurts: a hard shake, a held frame, red in the picture, sparks off him
        const heavy = d.amount >= 12;
        juice.shake(heavy ? 0.9 : 0.4); juice.stop(heavy ? 120 : 60); juice.tint('#ff4d5e', heavy ? 0.9 : 0.5); kick = heavy ? 2.4 : 1.2;
        juice.glitch(heavy ? 0.6 : 0.25, heavy ? 0.4 : 0.2);
        if (heavy && canFlash()) flashAmt = 0.35;
        flare((bots ? bots.aim(v1) : v1.copy(artPos).setY(1.5)), C('#ff4d5e'), heavy ? 4.5 : 2.6, 0.3);
        wave(v1.copy(artPos).setY(0.15), C('#ff4d5e'), 1, heavy ? 13 : 7, 0.55);
        shed((bots ? bots.aim(v1) : v1.copy(artPos).setY(1.5)), heavy ? 22 : 8, C('#ff4d5e'), heavy ? 1.6 : 1, 0.5);
      }
      if (n === 'block' || n === 'shielded' || n === 'warded') { wave(v1.copy(artPos).setY(0.15), C(n === 'shielded' ? '#f2c230' : '#3ee6ff'), 1, 7, 0.45); flare((bots ? bots.aim(v1) : v1.copy(artPos).setY(1.5)), C('#bfefff'), 2.2, 0.22); }
      if (n === 'sever') { juice.shake(0.5); juice.stop(90); }
      if (n === 'neck') { if (d.on) { juice.shake(0.4); wave(v1.copy(anchors.core), C('#ffffff'), 1, 14, 0.7, false); } }
      if (n === 'windup') {
        if (d.kind === 'overflow') { towerChargeUntil = t + d.ms / 1000; towerCharge = d.ms / 1000; }
        if (d.kind === 'lunge' || d.kind === 'sweep') { diveUntil = t + d.ms / 1000; diveLen = d.ms / 1000; }
      }
      // a missed block: the attack flies from the boss and lands on Art
      if (n === 'blockFail' && fx && !model) {
        attackerPos(d.attack, d.owner, v4);
        fx.shot(4, new V().copy(v4), out => artFrom(out), () => {}, { color: '#ff4d5e', dur: 0.16 });
      }
      // a block is a parry: a beat of slow motion, a cyan burst on Art and a counter shot that throws the boss back
      if (n === 'block') {
        slowUntil = performance.now() + 320;
        juice.shake(0.35); juice.stop(70);
        if (canFlash()) flashAmt = Math.max(flashAmt, 0.3);
        wave(v1.copy(artPos).setY(0.15), C('#3ee6ff'), 1, 14, 0.6);
        wave((bots ? bots.aim(v1) : v1.copy(artPos).setY(1.5)), C('#bfefff'), 0.4, 3.2, 0.35, false);
        shed((bots ? bots.aim(v1) : v1.copy(artPos).setY(1.5)), 16, C('#3ee6ff'), 1.4, 0.45);
        attackerPos(d.attack, d.owner, v4);
        const tgt = new V().copy(v4), back = () => { knock(2.6); recoil = 1; hitGlow = 1; flare(tgt, C('#ffffff'), 7, 0.3); shed(tgt, 18, C('#3ee6ff'), 1.5, 0.6); if (bossId === 'leviathan') segKick.fill(1.2, 1, 6); };
        // the counter leaves once the bot has weaved clear (sb-bots.js), so the close look at the weave isn't a streak
        if (fx) after(bots ? 0.5 : 0, () => fx.shot(model ? 2 : 4, artFrom(new V()), out => out.copy(tgt), back, { color: '#3ee6ff', dur: 0.2, flash: 0.7 })); else back();
      }
      // an interrupt: the charge shatters in the boss's face and it reels
      if (n === 'cancel') {
        attackerPos(d.attack, d.owner, v4);
        shed(v4, 30, C('#ffffff'), 1.8, 0.6);
        wave(v1.copy(v4), C('#ffffff'), 1, 12, 0.55, false);
        flare(v4, C('#bfefff'), 9, 0.35);
        knock(2.2); hitGlow = 1; juice.shake(0.5); juice.stop(100);
      }
      if (n === 'blockFail' || n === 'cancel') {
        if (d.attack === 'overflow') towerChargeUntil = 0;
        if (d.attack === 'lunge' || d.attack === 'sweep') { diveUntil = 0; if (n === 'blockFail') lungeAt = t; }
      }
      if (n === 'block') { if (d.attack === 'overflow') towerChargeUntil = 0; if (d.attack === 'lunge' || d.attack === 'sweep') diveUntil = 0; }
      if (n === 'compile') { screenPulse = 1; juice.tint('#ff4d5e', 0.5); if (!model) wave(v1.copy(anchors.core), C('#ff4d5e'), 2, 16, 0.6, false); }
      if (n === 'fix') screenPulse = Math.max(screenPulse, 0.4);
      if (n === 'phase') {
        juice.shake(0.6); juice.glitch(0.7, 0.8); juice.stop(120); recoil = 1;
        if (canFlash()) flashAmt = 0.6;
        if (bossId === 'compiler') for (let i = 0; i < 6; i++) { const id = 1 + Math.floor(Math.random() * 50); towerLost.add(id); }
        shed(anchors.core, 18, pal.a, 1.4, 0.8);
      }
      if (n === 'enrage') { juice.tint('#ff4d5e', 1); juice.glitch(0.6, 1); }
      if (n === 'finish') { juice.dim(model ? 0.25 : 0.45, d.ms / 1000); juice.glitch(0.3, 0.5); }
      if (n === 'finishFail') { juice.shake(0.5); juice.tint('#ff4d5e', 1); }
      if (n === 'win') { dead = true; deadT = 0; juice.shake(0.9); juice.stop(160); if (canFlash()) flashAmt = 1; shed(anchors.core, 40, C('#ffffff'), 2, 1); juice.dim(0, 0.1); }
      if (n === 'lose') { juice.tint('#ff4d5e', 1); juice.glitch(1, 1.5); juice.dim(0.5, 3); }
      if (n === 'support') { const c = d.kind === 'chaos' ? C('#ff4da6') : C('#f2c230'); wave(v1.copy(artPos).setY(0.2), c, 1, 9, 0.6); flare((bots ? bots.aim(v1) : v1.copy(artPos).setY(1.5)), c, 2, 0.25); }
      if (n === 'decoy') { if (decoyI >= 0) segFlash[decoyI] = 1; juice.tint('#ff4d5e', 0.6); }
      if (n === 'weak' && !d.hit) weakI = -1;
      if (n === 'packet' && d.returned) { const pk = packets.get(d.id); if (pk) { pk.gone = clock.t; flare(pk.pos, C('#3ee6ff'), 3, 0.25); } }
      if (n === 'tier' && d.tier >= 3) { wave(v1.copy(artPos).setY(0.15), C(Theme.hex('ink-hi')), 1, 10, 0.6); }
    }

    // things that happen a moment later on the scene's clock (it slows and stops with the hit feel)
    const laters = [];
    const after = (secs, fn) => { if (secs <= 0) fn(); else laters.push({ at: clock.t + secs, fn }); };
    // ---------- the frame ----------
    let paused = false, slowK = 1, lastT = performance.now(), debugCam = null;
    // compile every shader now, hidden pooled effects included, so the first hit, spell or status
    // effect in a fight doesn't stall a frame while its shader compiles
    try { renderer.compile(scene, camera); } catch (e) {}
    function frameStep(nowMs) {
      // rdt is real time for fades, so a slow frame never leaves a tint or a flash on screen
      const rdt = Math.max(0, Math.min(0.5, (nowMs - lastT) / 1000));
      let dt = Math.min(0.05, rdt); lastT = nowMs;
      if (!visible || document.hidden) return;
      if (paused) dt = 0;
      dt *= slowK * (nowMs < slowUntil ? 0.3 : 1) * (dirT < dirSlowUntil ? dirSlow : 1);
      const stopped = nowMs < stopUntil;
      const adt = stopped ? 0 : dt * (finishing ? 0.55 : 1);
      clock.t += adt;
      const t = clock.t;
      for (let i = laters.length - 1; i >= 0; i--) if (laters[i].at <= t) { const f = laters[i].fn; laters.splice(i, 1); f(); }
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
      kbV += (-kb * 55 - kbV * 9) * adt; kb = clamp(kb + kbV * adt, -0.5, 3);
      if (dead) deadT = Math.min(3, deadT + dt);
      nB = 0;
      for (const pl of pools) pl.w = 0;
      if (model) { model.update(t, adt * sup.timeScale(), { phase, enraged, dead, deadT, finishing, lost, kb, recoil, hit: hitGlow, neck: neckOpen }); spellDodge(); if (model.props.userData.tick) model.props.userData.tick(t, pal); model.anchor('core', anchors.core); model.anchor('body', anchors.body); model.anchor('head', anchors.head); }
      else if (bossId === 'compiler') compiler(t, adt);
      else leviathan(t, adt);
      // Art's bot, or the old marker cube when the bot kit isn't there; his spot on the floor
      if (bots) bots.update(t, adt, { snap, threatIn: threatIn(nowMs), dead, lost, finishing });
      if (!artBot) put(v1.copy(artPos).setY(artPos.y + Math.sin(t * 2) * 0.15), 0.9, 0.9, 0.9, Math.PI / 4, t * 1.5, Math.PI / 4, C(Theme.hex('accent')), 2 + kick);
      put(v1.copy(artPos).setY(0.08), 3.2, 0.06, 0.18, 0, t * 0.6, 0, C(Theme.hex('accent')), 1.3);
      put(v1.copy(artPos).setY(0.08), 0.18, 0.06, 3.2, 0, t * 0.6, 0, C(Theme.hex('accent')), 1.3);
      sup.update(t, adt, snap);
      if (false) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t; put(v2.copy(artPos).add(v3.set(Math.cos(a) * 1.8, 1.2, Math.sin(a) * 1.8)), 0.5, 0.9, 0.12, 0, -a, 0, C('#f2c230'), 1.8); }
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
      // the director picks the shot (sb-cam.js); shake goes on top of whatever it chose
      if (!paused) dirT += rdt;
      cam.update(dirT, paused ? 0 : rdt, threatAt(nowMs), finishing);
      camera.position.x += Math.sin(nowMs * 0.041) * sh;
      camera.position.y += Math.sin(nowMs * 0.037 + 1) * sh * 0.7 + kick * 0.15 * shakeK();
      if (bots) { camera.updateMatrixWorld(); bots.labels(camera); }
      if (debugCam) { camera.position.copy(debugCam.p); camera.lookAt(debugCam.l); if (camera.fov !== debugCam.f) { camera.fov = debugCam.f; camera.updateProjectionMatrix(); } }
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
      const pxK = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      K.update(adt, t, pxK);
      atmosphere(t, pxK, snap && snap.chaos && snap.chaos.fog ? 0.8 : 0);
      floorMat.uniforms.uCam.value.copy(camera.position);
      hemi.intensity = 0.5 + (mctx.skyFlash || 0) * 1.6;
      composer.render();
      if (opts.onFrame) opts.onFrame();
    }
    if (aq) { aq.watch(renderer.domElement); aq.apply(); }
    renderer.setAnimationLoop(() => { const n = performance.now(); frameStep(n); if (aq && !paused && visible && !document.hidden) aq.frame(n); });
    // test hook: n frames back to back, ms per frame (the min of three tries) and the draw calls of one frame
    function bench(n = 20) {
      let best = 1e9;
      const gl = renderer.getContext(), px = new Uint8Array(4);
      for (let k = 0; k < 3; k++) { const a = performance.now(); for (let i = 0; i < n; i++) { lastT = performance.now() - 16.7; frameStep(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } best = Math.min(best, (performance.now() - a) / n); }
      renderer.info.autoReset = false; renderer.info.reset(); frameStep(performance.now()); renderer.info.autoReset = true;
      const i = renderer.info.render;
      return { ms: +best.toFixed(1), calls: i.calls, tris: i.triangles };
    }

    function setBoss(id) {
      bossId = id; B = SuperData.boss(id);
      floorMat.uniforms.uMode.value = id === 'hydra' ? 0 : id === 'compiler' ? 1 : 2;
      phase = snap && snap.boss === id ? snap.phase : 1;
      dead = false; deadT = 0; debris.length = 0; towerLost.clear(); packets.clear(); weakI = decoyI = -1;
      mountModel(id);
      if (bots) bots.clear();
      scene.environment = K.environment([B.pal[0].a, B.pal[0].c, B.pal[0].b]);
      K.clear();
      if (fx) fx.clear();
      palette(phase - 1, true);
    }
    setBoss(bossId);
    palFrom = { bg: pal.bg.clone(), a: pal.a.clone(), b: pal.b.clone(), c: pal.c.clone(), bloom: pal.bloom };

    function dispose() {
      renderer.setAnimationLoop(null); if (aq) aq.dispose();
      if (fx) fx.dispose();
      if (bots) { bots.dispose(); bots = null; artBot = null; }
      if (release) release();
      sup.dispose();
      K.dispose();
      ro.disconnect(); io.disconnect();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
      keep.forEach(x => x.dispose && x.dispose());
      bloom.dispose(); if (composer.dispose) composer.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }
    function info() { return { bots: bots ? bots.info() : null, kit: K.info(), acts: model && model.info ? model.info() : null, aq: aq ? aq.state() : null, shot: cam.shot(), camlog: cam.log().slice(-12), boss: bossId, phase, blocks: nB, debris: debris.length, dead, weakI, frontI, packets: packets.size, fx: fx ? fx.info() : null }; }
    return { cameraAt: () => ({ p: camera.position.toArray(), fov: camera.fov, model: !!model, boss: bossId, shot: cam.shot(), log: cam.log() }), apply, event, anchor, screenRect, setBoss, bench, step: (secs, fps = 30) => { const was = paused; paused = false; for (let i = 0; i < Math.round(secs * fps); i++) frameStep(lastT + 1000 / fps); paused = was; lastT = performance.now(); }, artBot: () => artBot, cam: (p, l, f) => { debugCam = p ? { p: new V(...p), l: new V(...l), f: f || 42 } : null; }, model: () => model, setReduce: on => { reduceShake = on; }, pause: on => { paused = !!on; }, slow: k => { slowK = k; }, info, dispose };
  }

  return { mount };
})();
