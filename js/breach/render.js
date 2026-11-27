// Breach in 3D. game.js runs the rules and the HUD, and this file draws cyberspace:
// grid platforms built along the rail, data streams, floating code, hologram
// enemies, the five boss programs, particles and a glitch pass on top of bloom.
window.Breach3D = (() => {
  let THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass;
  let renderer = null, scene, camera, composer, bloom, post;
  let ready = false;
  const BOSS_FOV = 82;
  const W = 960, H = 540;

  async function init(canvas) {
    try {
      THREE = await import('three');
      ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
      ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
      ({ UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'));
      ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
      ({ ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js'));
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch (e) { console.warn('Breach: WebGL unavailable', e); return false; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.NoToneMapping;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#010403');
    camera = new THREE.PerspectiveCamera(66, W / H, 0.05, 400);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.42, 0.28, 0.42);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    post = new ShaderPass(POST);
    composer.addPass(post);
    buildPools();
    scene.add(camera);
    buildGun();
    resize(canvas.clientWidth || W, canvas.clientHeight || H);
    ready = true;
    return true;
  }
  function resize(w, h) {
    if (!renderer) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // ---------- shaders ----------
  const POST = {
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 }, glitch: { value: 0 }, slow: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float hurt; uniform float glitch; uniform float slow; varying vec2 vUv;
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        float g = glitch;
        float row = floor(uv.y * 34.0);
        float r = rnd(vec2(row, floor(time * 12.0)));
        if (r < g * 0.35) uv.x += (rnd(vec2(row, time)) - 0.5) * 0.03 * g;
        float ab = 0.0003 + hurt * 0.0025 + g * 0.002;
        vec3 c = vec3(texture2D(tDiffuse, uv + vec2(ab, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ab, 0.0)).b);
        c *= 0.985 + 0.015 * sin(vUv.y * 1100.0);
        float v = smoothstep(1.1, 0.4, distance(vUv, vec2(0.5)));
        c *= mix(0.78, 1.0, v);
        c += (rnd(vUv * 900.0 + time) - 0.5) * 0.008;
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(lum), c, 1.18);
        c = mix(c, c * vec3(0.8, 0.95, 1.15), slow * 0.5);
        gl_FragColor = vec4(c, 1.0);
      }`,
  };
  const GRID_V = `varying vec3 vW; varying vec3 vN;
    void main(){
      vec4 lp = vec4(position, 1.0); vec3 ln = normal;
      #ifdef USE_INSTANCING
        lp = instanceMatrix * lp; ln = mat3(instanceMatrix) * ln;
      #endif
      vec4 w = modelMatrix * lp; vW = w.xyz; vN = normalize(mat3(modelMatrix) * ln);
      gl_Position = projectionMatrix * viewMatrix * w; }`;
  const GRID_F = `uniform vec3 uCol; uniform vec3 uCol2; uniform vec3 uBase; uniform vec3 uCam; uniform float uTime; uniform float uCell; uniform float uLine; uniform float uFog; uniform float uPulse; uniform float uDark; uniform vec3 uShot; uniform float uShotI; uniform vec3 uFogCol;
    varying vec3 vW; varying vec3 vN;
    float gl(vec2 p, float w){ vec2 d = fwidth(p); vec2 g = abs(fract(p - 0.5) - 0.5) / max(d, vec2(1e-4)); return 1.0 - smoothstep(w - 0.5, w + 0.6, min(g.x, g.y)); }
    void main(){
      vec3 n = abs(normalize(vN));
      vec2 p = n.y > 0.6 ? vW.xz : (n.x > n.z ? vW.zy : vW.xy);
      float minor = gl(p / uCell, 0.7);
      float major = gl(p / (uCell * 4.0), 1.1);
      float dc = length(vW - uCam);
      float pulse = smoothstep(2.0, 0.0, abs(mod(dc - uTime * 11.0, 48.0) - 24.0)) * uPulse;
      float side = (n.y > 0.6 ? 1.0 : 0.45) * (1.0 - uDark * 0.85);
      float shot = uShotI * smoothstep(7.0, 0.0, distance(vW, uShot));
      vec3 c = uBase;
      c += uCol * minor * 0.2 * uLine * side;
      c += mix(uCol, uCol2, step(0.5, fract(floor(p.x / (uCell * 4.0)) * 0.5 + floor(p.y / (uCell * 4.0)) * 0.5)) * 0.35) * major * 0.95 * uLine * side;
      c += mix(uCol, uCol2, 0.5) * (major + minor * 0.4) * pulse * 0.9 * (1.0 - uDark * 0.8);
      c += uCol * (major * 1.2 + minor * 0.5) * shot;
      float fog = 1.0 - exp(-uFog * dc);
      c = mix(c, uFogCol, clamp(fog, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`;
  const HOLO_V = `varying vec3 vN; varying vec3 vV; varying vec3 vW;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal);
    vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`;
  const HOLO_F = `uniform vec3 uCol; uniform float uFlash; uniform float uTime; uniform float uBand; uniform float uAlpha;
    varying vec3 vN; varying vec3 vV; varying vec3 vW;
    void main(){
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float band = step(0.82, fract(vW.y * 5.0 - uTime * 1.7)) * uBand;
      vec3 c = (uCol * (0.035 + f * 0.8 + band) + vec3(uFlash)) * uAlpha;
      gl_FragColor = vec4(c, 1.0);
    }`;
  function gridMat(col, col2, o = {}) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uCol: { value: new THREE.Color(col) }, uCol2: { value: new THREE.Color(col2) }, uBase: { value: new THREE.Color(o.base || '#020905') },
        uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uCell: { value: o.cell || 1 }, uLine: { value: o.line ?? 1 },
        uFog: { value: o.fog ?? 0.017 }, uPulse: { value: o.pulse ?? 1 }, uDark: { value: 0 }, uShot: { value: new THREE.Vector3() }, uShotI: { value: 0 }, uFogCol: { value: new THREE.Color(o.fogCol || '#010403') },
      },
      vertexShader: GRID_V, fragmentShader: GRID_F,
    });
  }
  function holoMat(col, band = 0.25) {
    return new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(col) }, uFlash: { value: 0 }, uTime: { value: 0 }, uBand: { value: band }, uAlpha: { value: 1 } },
      vertexShader: HOLO_V, fragmentShader: HOLO_F, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }
  const bright = (col, k) => new THREE.Color(col).multiplyScalar(k);
  const basic = (col, k = 1, o = {}) => new THREE.MeshBasicMaterial({ color: bright(col, k), toneMapped: false, ...o });
  const addMat = (col, k = 1, o = {}) => basic(col, k, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...o });
  const lineMat = (col, k = 1.6, o = {}) => new THREE.LineBasicMaterial({ color: bright(col, k), toneMapped: false, ...o });

  // ---------- canvas textures ----------
  function ctex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer ? Math.min(window.BREACH_ANISO || 8, renderer.capabilities.getMaxAnisotropy()) : 1;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }
  const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';
  const glyphs = {};
  function glyph(ch) {
    if (glyphs[ch]) return glyphs[ch];
    return (glyphs[ch] = ctex(128, 128, (g, w, h) => {
      g.font = `700 92px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(ch, w / 2, h / 2 + 4);
    }));
  }
  function linesTex(lines, o = {}) {
    const { w = 512, h = 256, col = Theme.hex('accent'), col2 = Theme.hex('ink-2'), size = 22, title = null, frame = true } = o;
    return ctex(w * 2, h * 2, (g) => {
      g.scale(2, 2);
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
      if (frame) { g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8); g.globalAlpha = 1; }
      let y = 16 + size;
      if (title) { g.fillStyle = col; g.font = `700 ${size + 4}px ${MONO}`; g.fillText(title, 18, y); y += size + 14; }
      g.font = `500 ${size}px ${MONO}`;
      lines.forEach((l, i) => { g.fillStyle = i % 3 === 1 ? col2 : col; g.fillText(l, 18, y); y += size + 8; });
    });
  }
  function streamTex() {
    return ctex(128, 2048, (g, w, h) => {
      g.scale(2, 2); w = 64; h = 1024;
      g.font = `700 22px ${MONO}`; g.textAlign = 'center';
      const chars = '01アイウエオカキクケコサシスセ<>{}[]#$%&*+=abcdefxyz';
      for (let y = 0; y < h; y += 24) {
        const a = Math.random();
        g.fillStyle = `rgba(255,255,255,${a < 0.15 ? 1 : a * 0.45})`;
        g.fillText(chars[Math.floor(Math.random() * chars.length)], w / 2, y + 20);
      }
    });
  }
  function signTex(text, col, o = {}) {
    const { w = 1024, h = 256, size = 150 } = o;
    return ctex(w, h, (g) => {
      g.font = `700 ${size}px "Chakra Petch", ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = col; g.fillText(text, w / 2, h / 2 + 6);
      g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.65; g.fillText(text, w / 2, h / 2 + 6);
    });
  }
  function iconTex(kind) {
    return ctex(256, 256, (g, w) => {
      g.scale(2, 2);
      g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
      const x = 64, y = 64, s = 100;
      g.beginPath();
      if (kind === 'plus') { g.moveTo(x - s * 0.32, y); g.lineTo(x + s * 0.32, y); g.moveTo(x, y - s * 0.32); g.lineTo(x, y + s * 0.32); g.stroke(); }
      else if (kind === 'clock') { g.arc(x, y, s * 0.36, 0, 7); g.moveTo(x, y); g.lineTo(x, y - s * 0.24); g.moveTo(x, y); g.lineTo(x + s * 0.18, y); g.stroke(); }
      else if (kind === 'burst') { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.moveTo(x + Math.cos(a) * s * 0.12, y + Math.sin(a) * s * 0.12); g.lineTo(x + Math.cos(a) * s * 0.38, y + Math.sin(a) * s * 0.38); } g.stroke(); }
      else if (kind === 'shield') { g.moveTo(x, y - s * 0.38); g.lineTo(x + s * 0.32, y - s * 0.24); g.lineTo(x + s * 0.27, y + s * 0.12); g.lineTo(x, y + s * 0.38); g.lineTo(x - s * 0.27, y + s * 0.12); g.lineTo(x - s * 0.32, y - s * 0.24); g.closePath(); g.stroke(); }
      else if (kind === 'pause') { g.fillRect(x - 24, y - 30, 16, 60); g.fillRect(x + 8, y - 30, 16, 60); }
      else { g.font = `700 64px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x2', x, y + 4); }
    });
  }

  // ---------- geometry cache ----------
  const G = {};
  const geo = (k, make) => G[k] || (G[k] = make());
  const edges = (k, g) => geo('e:' + k, () => new THREE.EdgesGeometry(g, 25));

  // ---------- pools: particles, rings, beams ----------
  let TMPV = null;
  let vox = null, voxData = [], letters = [], rings = [], beams = [];
  const VOX_N = 700;
  function buildPools() {
    vox = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), addMat('#ffffff', 1), VOX_N);
    vox.frustumCulled = false; vox.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < VOX_N; i++) { vox.setMatrixAt(i, hidden); vox.setColorAt(i, new THREE.Color(0, 0, 0)); voxData.push({ life: 0 }); }
    scene.add(vox);
    for (let i = 0; i < 140; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyph('a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.visible = false; scene.add(s); letters.push({ s, life: 0 });
    }
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), addMat(Theme.hex('accent'), 2, { side: THREE.DoubleSide }));
      m.visible = false; scene.add(m); rings.push({ m, life: 0 });
    }
    // a comet: thin at the tail, full at the head, so perspective doesn't make the near end a wall of light
    const coreG = new THREE.CylinderGeometry(0.02, 0.003, 1, 6, 1, true), glowG = new THREE.CylinderGeometry(0.05, 0.005, 1, 8, 1, true);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(glowG, addMat(Theme.hex('accent'), 1.8));
      m.visible = false; scene.add(m);
      const core = new THREE.Mesh(coreG, addMat('#f2fff8', 3.2)); core.visible = false; scene.add(core);
      const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright('#bfffd9', 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      tip.visible = false; scene.add(tip);
      beams.push({ m, core, tip, life: 0 });
    }
    // flashes: a bright sprite that blooms and fades (muzzle, impacts, kills)
    for (let i = 0; i < 28; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      sp.visible = false; scene.add(sp); flashes.push({ s: sp, life: 0 });
    }
    // shock rings that run along the floor under a kill
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), addMat(Theme.hex('accent'), 2, { side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); shocks.push({ m, life: 0 });
    }
  }
  const flashes = [], shocks = [];
  function flash(p, col, size = 1, life = 0.12, grow = 1.6) {
    if (!ready) return;
    const F = flashes.find(f => f.life <= 0) || flashes[0];
    F.life = F.max = life; F.size = size; F.grow = grow;
    F.s.material.color = bright(col, 1.6); F.s.position.set(p.x, p.y, p.z); F.s.visible = true;
  }
  function shock(p, col, size = 1) {
    if (!ready) return;
    const fy = floorFn ? floorFn(p) : null;
    if (fy === null || fy === undefined) return;
    const S = shocks.find(r => r.life <= 0) || shocks[0];
    S.life = S.max = 0.5; S.size = size;
    S.m.material.color = bright(col, 1.6); S.m.position.set(p.x, fy + 0.07, p.z); S.m.visible = true;
  }
  // a few fast sparks off an impact
  function sparks(p, col, n = 5, speed = 1) {
    if (!ready) return;
    const c = new THREE.Color(col);
    let k = 0;
    for (let i = 0; i < VOX_N && k < n; i++) {
      const d = voxData[i];
      if (d.life > 0) continue;
      d.life = d.max = 0.18 + Math.random() * 0.2;
      d.floor = -1e9;
      d.p = new THREE.Vector3(p.x, p.y, p.z);
      d.v = new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 6 - 1, (Math.random() - 0.5) * 9).multiplyScalar(speed);
      d.c = (Math.random() < 0.5 ? new THREE.Color('#ffffff') : c.clone()).multiplyScalar(1.4);
      d.s = 0.35 + Math.random() * 0.35;
      k++;
    }
  }

  // ---------- the player's blaster ----------
  // A hologram gun at the lower right of the view, built like the typos (dark core, holo shell,
  // bright edges). It kicks back on every shot, a key on its side lights for each letter, and its
  // rings spin faster and its cell glows whiter as the combo grows. It draws over the world but under
  // the HUD canvas, so it never covers a word.
  let gun = null;
  function buildGun() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const acc = Theme.hex('accent');
    const holo = holoMat(acc, 0.1); holo.depthTest = false; holo.uniforms.uAlpha.value = 0.42;
    const dark = basic('#020a06', 1, { depthTest: false, transparent: true, opacity: 0.6 });
    const lm = lineMat(acc, 1.1, { depthTest: false, transparent: true, opacity: 0.75 });
    const piece = (geom, x, y, z, rx = 0, rz = 0) => {
      const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.set(rx, 0, rz);
      const i = new THREE.Mesh(geom, dark); i.scale.setScalar(0.96); h.add(i);
      h.add(new THREE.Mesh(geom, holo));
      h.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), lm));
      body.add(h); return h;
    };
    piece(new THREE.BoxGeometry(0.1, 0.085, 0.44), 0, 0, 0);
    piece(new THREE.BoxGeometry(0.064, 0.04, 0.3), 0, 0.062, -0.03);
    piece(new THREE.BoxGeometry(0.055, 0.15, 0.075), 0, -0.1, 0.12, 0.38);
    piece(new THREE.BoxGeometry(0.11, 0.03, 0.12), 0, -0.05, -0.12);
    piece(new THREE.CylinderGeometry(0.02, 0.028, 0.28, 10), 0, 0.006, -0.34, Math.PI / 2);
    const rings = [];
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.04 - k * 0.004, 0.0055, 6, 20), basic(acc, 2.2, { depthTest: false, transparent: true }));
      r.position.set(0, 0.006, -0.27 - k * 0.065); body.add(r); rings.push(r);
    }
    // the energy cell on top and a row of keys on the side
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), basic(acc, 2, { depthTest: false, transparent: true }));
    cell.rotation.x = Math.PI / 2; cell.position.set(0, 0.092, 0.02); body.add(cell);
    const keys = [];
    const kg = new THREE.BoxGeometry(0.012, 0.022, 0.022);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(kg, basic(acc, 0.35, { depthTest: false, transparent: true }));
      m.position.set(-0.056, 0.012 - r * 0.028, 0.13 - k * 0.032 - r * 0.012); body.add(m); keys.push({ m, glow: 0 });
    }
    const tip = new THREE.Object3D(); tip.position.set(0, 0.006, -0.5); body.add(tip);
    const mf = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright(acc, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
    mf.position.copy(tip.position); mf.scale.setScalar(0.001); body.add(mf);
    g.position.set(0.36, -0.27, -0.66); g.rotation.set(0.05, 0.17, 0); g.scale.setScalar(0.55);
    g.traverse(o => { o.renderOrder = 20; o.frustumCulled = false; });
    camera.add(g);
    gun = { g, body, holo, lm, rings, cell, keys, tip, mf, kick: 0, flash: 0, heat: 0, spin: 0, base: g.position.clone() };
  }
  const _tipV = { v: null };
  function gunTip() {
    _tipV.v ||= new THREE.Vector3();
    if (!gun) return camera.localToWorld(_tipV.v.set(0.42, -0.5, -0.8));
    camera.updateMatrixWorld(); gun.tip.updateWorldMatrix(true, false);
    return gun.tip.getWorldPosition(_tipV.v);
  }
  function updateGun(st, dt) {
    if (!gun) return;
    const G2 = gun, show = st.mode === 'play';
    G2.g.visible = show && !st.boss?.dying;
    if (!show) return;
    G2.kick = Math.max(0, G2.kick - dt * 9);
    G2.flash = Math.max(0, G2.flash - dt);
    const heat = Math.min(1, (st.combo || 0) / 40);
    G2.heat += (heat - G2.heat) * Math.min(1, dt * 4);
    const t = st.t;
    // idle sway, then the kick: back and up, with a little roll
    const k = G2.kick * G2.kick;
    // it drops out of the way while a prompt panel sits over the bottom of the view
    G2.low = (G2.low || 0) + ((st.prompt ? 1 : 0) - (G2.low || 0)) * Math.min(1, dt * 6);
    G2.g.position.set(G2.base.x + Math.sin(t * 1.3) * 0.006, G2.base.y + Math.sin(t * 2.1) * 0.005 + k * 0.012 - G2.low * 0.2, G2.base.z + k * 0.07);
    G2.g.rotation.set(0.05 + k * 0.16, 0.13, -k * 0.05);
    G2.spin += dt * (2 + G2.heat * 14 + G2.kick * 10);
    G2.rings.forEach((r, i) => { r.rotation.z = G2.spin * (i % 2 ? -1 : 1); r.material.color.copy(bright(G2.heat > 0.6 ? '#bff8ff' : Theme.hex('accent'), 1.6 + G2.heat * 1.6 + G2.kick)); });
    G2.cell.material.color.copy(bright(G2.heat > 0.5 ? '#3ee6ff' : Theme.hex('accent'), 1.2 + G2.heat * 2 + Math.sin(t * 6) * 0.2));
    G2.holo.uniforms.uTime.value = t; G2.holo.uniforms.uFlash.value = G2.kick * 0.12;
    for (const K of G2.keys) { K.glow = Math.max(0, K.glow - dt * 5); K.m.material.color.copy(bright(K.glow > 0.05 ? '#ffffff' : Theme.hex('accent'), 0.35 + K.glow * 2.6)); }
    const f = G2.flash > 0 ? G2.flash / 0.06 : 0;
    G2.mf.scale.setScalar(f > 0 ? 0.14 + f * 0.22 : 0.001);
  }
  let _dot = null;
  function dotTex() {
    return _dot || (_dot = ctex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }));
  }
  const _v = () => new THREE.Vector3();
  let floorFn = null;
  function setFloor(fn) { floorFn = fn; }
  function burst(p, text, col, big = 1) {
    if (!ready) return;
    const fy = floorFn ? floorFn(p) : null, floorY = fy === null || fy === undefined ? -1e9 : fy + 0.06;
    // a burst right in front of the lens would fill the screen, so close ones shrink and dim
    const near = Math.min(1, camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) / 6);
    if (near < 0.35) return;
    big *= near;
    const c = new THREE.Color(col).multiplyScalar(near);
    const n = Math.round(26 * big);
    let k = 0;
    for (let i = 0; i < VOX_N && k < n; i++) {
      const d = voxData[i];
      if (d.life > 0) continue;
      d.life = d.max = 0.6 + Math.random() * 0.6;
      d.floor = floorY;
      d.p = new THREE.Vector3(p.x, p.y, p.z).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6));
      d.v = new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 6 + 1, (Math.random() - 0.5) * 7).multiplyScalar(0.6 + big * 0.4);
      d.c = (Math.random() < 0.25 ? new THREE.Color('#ffffff').multiplyScalar(near * 0.7) : c.clone()).multiplyScalar(1.15);
      d.s = 0.6 + Math.random() * (0.9 + big * 0.4);
      k++;
    }
    // loose letters stay small, dim and short-lived, so nobody mistakes them for a target
    const chars = (text || '').replace(/ /g, '').slice(0, Math.round(4 * Math.min(2, big)) + 2);
    for (const ch of chars) {
      const L = letters.find(l => l.life <= 0);
      if (!L) break;
      L.life = L.max = 0.45 + Math.random() * 0.15;
      L.s.material.map = glyph(ch); L.s.material.color = bright(col, 0.75);
      L.s.position.set(p.x, p.y + 0.2, p.z);
      L.v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5 + 0.8, (Math.random() - 0.5) * 3);
      L.floor = floorY + 0.15;
      L.size = 0.14 + Math.random() * 0.06 * Math.min(2, big);
      L.rot = (Math.random() - 0.5) * 8;
      L.s.visible = true;
    }
    ring(p, col, 0.6 * big);
    // kept small so a kill near the middle never washes out the words beside it
    flash(p, '#ffffff', 0.5 * big, 0.07, 1); flash(p, col, 1.1 * big, 0.24, 1.3);
    shock(p, col, big);
    if (!CALM) sparks(p, '#ffffff', Math.round(10 * big), 1.3);
    shotPos ||= new THREE.Vector3(); shotPos.set(p.x, p.y - 1.2, p.z); shotI = 1.8;
  }
  function ring(p, col, size = 1) {
    if (!ready) return;
    const R = rings.find(r => r.life <= 0) || rings[0];
    R.life = R.max = 0.45; R.size = size;
    R.m.material.color = bright(col, 1.3);
    R.m.position.set(p.x, p.y, p.z); R.m.visible = true;
  }
  const BOLT_T = 0.08, BOLT_FADE = 0.08;
  function beam(to, col) {
    if (!ready) return;
    shotPos ||= new THREE.Vector3();
    const B = beams.find(b => b.life <= 0) || beams[0];
    B.life = BOLT_T + BOLT_FADE; B.to = new THREE.Vector3(to.x, to.y, to.z); B.hit = false;
    B.from = gunTip().clone();
    B.col = col || Theme.hex('accent');
    B.m.material.color = bright(B.col, 1.15);
    B.m.visible = true; B.core.visible = true; B.tip.visible = true;
    muzzle = 0.07;
    if (gun) {
      gun.kick = 1; gun.flash = 0.06;
      const K = gun.keys[Math.floor(Math.random() * gun.keys.length)]; K.glow = 1;
    }
  }
  let muzzle = 0, shotI = 0, DARK = 0, train = null;
  let shotPos = null;
  function updateParticles(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let dirty = false;
    for (let i = 0; i < VOX_N; i++) {
      const d = voxData[i];
      if (d.life <= 0) continue;
      d.life -= dt; dirty = true;
      d.v.y -= 9 * dt; d.v.multiplyScalar(1 - dt * 0.8); d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.floor) { d.p.y = d.floor; d.v.y = Math.abs(d.v.y) * 0.3; d.v.x *= 0.6; d.v.z *= 0.6; }
      const k = Math.max(0, d.life / d.max);
      q.setFromEuler(new THREE.Euler(d.life * 7, d.life * 5, 0));
      sc.setScalar(d.life > 0 ? d.s * (0.3 + k) : 0);
      m.compose(d.p, q, sc); vox.setMatrixAt(i, m);
      vox.setColorAt(i, d.c.clone().multiplyScalar(k));
    }
    if (dirty) { vox.instanceMatrix.needsUpdate = true; vox.instanceColor.needsUpdate = true; }
    for (const L of letters) {
      if (L.life <= 0) continue;
      L.life -= dt;
      L.v.y -= 7 * dt; L.s.position.addScaledVector(L.v, dt);
      if (L.s.position.y < L.floor) { L.s.position.y = L.floor; L.v.y = Math.abs(L.v.y) * 0.25; L.v.x *= 0.6; L.v.z *= 0.6; }
      const k = Math.max(0, L.life / L.max);
      // and never over the HUD: the title band at the top, the score and comms panels at the left, the input line
      const q = (TMPV ||= new THREE.Vector3()).copy(L.s.position).project(camera);
      const inHud = q.y > 0.6 || (q.x < -0.45 && q.y > 0.2) || (q.y < -0.78 && Math.abs(q.x) < 0.35);
      L.s.material.opacity = inHud ? 0 : 0.6 * k; L.s.material.rotation += L.rot * dt;
      L.s.scale.setScalar(L.size * (0.7 + k * 0.3));
      if (L.life <= 0) L.s.visible = false;
    }
    for (const R of rings) {
      if (R.life <= 0) continue;
      R.life -= dt;
      const k = 1 - Math.max(0, R.life / R.max);
      R.m.scale.setScalar((0.3 + k * 3.2) * R.size);
      R.m.material.opacity = 1 - k;
      R.m.lookAt(camera.position);
      if (R.life <= 0) R.m.visible = false;
    }
    for (const B of beams) {
      if (B.life <= 0) continue;
      B.life -= dt;
      // the bolt runs from the muzzle to the target, its tail catching up after it lands
      const k = 1 - Math.max(0, B.life - BOLT_FADE) / BOLT_T, fade = B.life < BOLT_FADE ? B.life / BOLT_FADE : 1;
      const dir = B.to.clone().sub(B.from);
      const head = Math.min(1, k), tail = B.life < BOLT_FADE ? 1 - fade : Math.max(0, k - 0.55);
      const a = B.from.clone().addScaledVector(dir, tail), b = B.from.clone().addScaledVector(dir, head);
      const seg = b.clone().sub(a), len = Math.max(0.001, seg.length());
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), seg.clone().normalize());
      for (const m of [B.m, B.core]) { m.position.copy(a).addScaledVector(seg, 0.5); m.quaternion.copy(q); }
      B.m.scale.set(1, len, 1); B.core.scale.set(1, len, 1);
      B.m.material.opacity = fade * 0.75; B.core.material.opacity = fade;
      B.tip.position.copy(b); B.tip.scale.setScalar(0.8 + (1 - fade) * 0.5); B.tip.material.opacity = fade;
      if (!B.hit && k >= 1) {
        B.hit = true;
        shotPos.copy(B.to); shotPos.y -= 1.2; shotI = Math.max(shotI, 1);
        flash(B.to, B.col, CALM ? 0.8 : 1.3, 0.14, 1.4);
        if (!CALM) sparks(B.to, B.col, 5, 0.8);
      }
      if (B.life <= 0) { B.m.visible = false; B.core.visible = false; B.tip.visible = false; }
    }
    for (const F of flashes) {
      if (F.life <= 0) continue;
      F.life -= dt;
      const k = Math.max(0, F.life / F.max);
      F.s.scale.setScalar(F.size * (1 + (1 - k) * F.grow));
      F.s.material.opacity = k * k;
      if (F.life <= 0) F.s.visible = false;
    }
    for (const S of shocks) {
      if (S.life <= 0) continue;
      S.life -= dt;
      const k = 1 - Math.max(0, S.life / S.max);
      S.m.scale.setScalar((0.4 + (1 - Math.pow(1 - k, 2)) * 3.4) * S.size);
      S.m.material.opacity = (1 - k) * 0.9;
      if (S.life <= 0) S.m.visible = false;
    }
  }

  // ---------- level ----------
  let lv = null;     // { src, group, mats, streams, panels, gates, props }
  const THEME_TEXT = {
    chat: { title: '> CHAT', lines: ['hlelo art', 'frist', 'waht wpm is that', 'teh keybaord sound', 'gg wp', 'definately 200+', 'fixword_otto: update ready', 'how r u so fats', 'lol', 'ur typing is insaen'] },
    market: { title: '> LISTINGS', lines: ['NODLES  open', 'FRIDE RICE', 'MASAGE 1hr', 'PHONE REPIAR', 'COFEE to go', 'KARAOKEE room', 'DUMPLINS x6', 'OPEN 24 HOURES'] },
    transit: { title: '> LINE 2', lines: ['NXET TRAIN  02 min', 'STAION 4    held', 'DELAYD      --', 'MIND TEH GAP', 'platfrom 1', 'servcie stopped', 'NXET STOP: NOWERE'] },
    factory: { title: '> FIRMWARE', lines: ['0x3F 0xA1 0x00 0x7C', 'keymap[12] = "Q" -> "W"', 'stamp(cap, letter)', 'ERR: wrong legend', '0xDE 0xAD 0xBE 0xEF', 'line_speed = 120', 'legend: TYPO'] },
    core: { title: '> FIXWORD', lines: ['canal -> coral', 'fix(word)', 'send()', 'autocorrect: on', 'body(wrong_word)', 'target = sender', 'rollback: locked', 'update 9:00 pm'] },
  };
  const SIGNS = ['NODLES', 'FRIDE RICE', 'MASAGE', 'COFEE', 'KARAOKEE', 'DUMPLINS'];

  function setLevel(L) {
    if (!ready || !L || (lv && lv.src === L)) return;
    clearLevel();
    const group = new THREE.Group(); scene.add(group);
    const col = L.color, col2 = L.color2;
    const fogCol = L.fog || '#010403';
    scene.fog = new THREE.FogExp2(fogCol, 0.011);
    scene.background = new THREE.Color(fogCol);
    const mats = [];
    const floorMat = gridMat(col, col2, { cell: L.cell || 1, line: 1, base: L.base, fogCol }); mats.push(floorMat);
    const voidMat = gridMat(col, col2, { cell: 6 * (L.cell || 1), line: 0.55, fog: 0.012, pulse: 0.6, base: fogCol, fogCol }); mats.push(voidMat);
    const towerMat = gridMat(col2, col, { cell: 1.5, line: 0.35, fog: 0.016, pulse: 0.3, base: L.base || '#020604', fogCol }); mats.push(towerMat);
    const edgeM = lineMat(col, 2.2), edgeM2 = lineMat(col2, 1.8);
    let minY = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    const archs = [], tiles = [];
    for (const s of L.slabs) {
      minY = Math.min(minY, s.y); minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
      if (s.kind === 'disc') {
        const g = new THREE.CylinderGeometry(s.r, s.r * 0.97, 0.6, 64);
        const m = new THREE.Mesh(g, floorMat); m.position.set(s.x, s.y - 0.3, s.z); group.add(m);
        for (const [rr, yy, cc] of [[s.r, 0.01, edgeM], [s.r * 0.55, 0.02, edgeM2], [s.r + 1.2, -0.6, edgeM2]]) {
          const ringG = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2) * rr, 0, Math.sin(i / 96 * Math.PI * 2) * rr)));
          const l = new THREE.Line(ringG, cc); l.position.set(s.x, s.y + yy, s.z); group.add(l);
        }
        // pylons around the arena
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2 + 0.3;
          const px = s.x + Math.cos(a) * (s.r + 0.6), pz = s.z + Math.sin(a) * (s.r + 0.6);
          if (L.rails.some(r => r.dense.some(d => Math.hypot(d.x - px, d.z - pz) < 2.5 && Math.abs(d.y - s.y) < 6))) continue;
          archs.push({ x: px, y: s.y, z: pz, w: 0.22, h: 0.6 + (i % 3) * 0.5, d: 0.22, c: i % 2 ? col2 : col });
        }
        continue;
      }
      if (s.lift) continue;
      const L2 = Math.hypot(s.len, s.rise);
      const g = new THREE.BoxGeometry(s.wid, 0.5, L2);
      const m = new THREE.Mesh(g, floorMat);
      m.rotation.order = 'YXZ'; m.rotation.y = -s.dir * Math.PI / 2; m.rotation.x = Math.atan2(s.rise, s.len);
      m.position.set(s.x, s.y - 0.25, s.z); group.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeM); e.rotation.copy(m.rotation); e.position.copy(m.position); group.add(e);
      if (s.tile) { tiles.push({ s, parts: [m, e], vy: 0, spin: (Math.random() - 0.5) * 2, delay: 0 }); continue; }
      // portal frames along straight pieces
      if (!s.rise && s.len >= 8) {
        const n = Math.floor(s.len / 8);
        for (let k = 0; k < n; k++) {
          const along = -s.len / 2 + (k + 0.5) * s.len / n;
          const yaw = -s.dir * Math.PI / 2, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
          const cx = s.x - fx * along, cz = s.z - fz * along, hw = s.wid / 2, c = (k + s.dir) % 2 ? col2 : col;
          const tall = 4.6 + ((k * 7 + s.dir) % 3) * 0.8;
          // a frame whose post stands on the camera's path would cut through the middle of the view
          if ([1, -1].some(sd => L.rails.some(r => r.dense.some(d => Math.hypot(d.x - (cx + sd * rx * hw), d.z - (cz + sd * rz * hw)) < 3 && Math.abs(d.y - s.y) < 10)))) continue;
          archs.push({ x: cx + rx * hw, y: s.y, z: cz + rz * hw, w: 0.09, h: tall, d: 0.09, c });
          archs.push({ x: cx - rx * hw, y: s.y, z: cz - rz * hw, w: 0.09, h: tall, d: 0.09, c });
          archs.push({ x: cx, y: s.y + tall, z: cz, w: Math.abs(rx) * s.wid + 0.09, h: 0.09, d: Math.abs(rz) * s.wid + 0.09, c, top: true });
        }
      }
    }
    // portal frames and pylons in one draw call
    if (archs.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), basic('#ffffff', 1), archs.length);
      const mm = new THREE.Matrix4();
      archs.forEach((a, i) => {
        mm.compose(new THREE.Vector3(a.x, a.y + (a.top ? 0 : a.h / 2), a.z), new THREE.Quaternion(), new THREE.Vector3(a.w, a.h, a.d));
        im.setMatrixAt(i, mm); im.setColorAt(i, bright(a.c, a.top ? 0.95 : 0.7));
      });
      group.add(im);
    }
    // the grid far below everything
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const vp = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), voidMat); vp.rotation.x = -Math.PI / 2; vp.position.set(cx, minY - 26, cz); group.add(vp);
    // towers of light all around
    const towers = [];
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 130;
      const x = cx + Math.cos(a) * r * 1.2, z = cz + Math.sin(a) * r;
      if (L.slabs.some(s => Math.hypot(s.x - x, s.z - z) < (s.kind === 'disc' ? s.r + 20 : 22))) continue;
      towers.push({ x, z, w: 3 + Math.random() * 7, h: 14 + Math.random() * Math.random() * 70, d: 3 + Math.random() * 7 });
    }
    const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), towerMat, towers.length);
    const tEdge = [];
    towers.forEach((tw, i) => {
      const y0 = minY - 26;
      tm.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(tw.x, y0 + tw.h / 2, tw.z), new THREE.Quaternion(), new THREE.Vector3(tw.w, tw.h, tw.d)));
      // bright top edges
      const hx = tw.w / 2, hz = tw.d / 2, y = y0 + tw.h;
      tEdge.push(tw.x - hx, y, tw.z - hz, tw.x + hx, y, tw.z - hz, tw.x + hx, y, tw.z - hz, tw.x + hx, y, tw.z + hz, tw.x + hx, y, tw.z + hz, tw.x - hx, y, tw.z + hz, tw.x - hx, y, tw.z + hz, tw.x - hx, y, tw.z - hz);
      for (const [ex, ez] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) tEdge.push(tw.x + ex, y0, tw.z + ez, tw.x + ex, y, tw.z + ez);
    });
    group.add(tm);
    const teg = new THREE.BufferGeometry(); teg.setAttribute('position', new THREE.Float32BufferAttribute(tEdge, 3));
    const tel = new THREE.LineSegments(teg, lineMat(col2, 0.7, { fog: true })); group.add(tel);
    // data streams: falling code columns beside the path
    const sTex = streamTex(); sTex.wrapT = THREE.RepeatWrapping; sTex.repeat.set(1, 1.5);
    const streamMats = [0.22, 0.35, 0.5].map((sp, i) => { const m = addMat(i === 1 ? col2 : col, 0.75, { map: sTex.clone(), side: THREE.DoubleSide, fog: true }); m.map.wrapT = THREE.RepeatWrapping; m.map.repeat.set(1, 1.5); m.map.needsUpdate = true; m.userData.sp = sp; return m; });
    const streams = [];
    const rail = L.rail.dense;
    for (let i = 0; i < rail.length; i += 6) {
      for (const side of [-1, 1]) {
        if (Math.random() < 0.45) continue;
        const p = rail[i], q = rail[Math.min(rail.length - 1, i + 1)];
        const fx = q.x - p.x, fz = q.z - p.z, l = Math.hypot(fx, fz) || 1;
        const off = 7 + Math.random() * 9;
        const x = p.x + (-fz / l) * side * off, z = p.z + (fx / l) * side * off;
        if (L.slabs.some(s => s.kind === 'disc' && Math.hypot(s.x - x, s.z - z) < s.r + 1)) continue;
        if (L.rails.some(r => r.dense.some(d => Math.hypot(d.x - x, d.z - z) < 9))) continue;
        const h = 14 + Math.random() * 22;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, h), streamMats[Math.floor(Math.random() * 3)]);
        m.position.set(x, p.y - 8 + Math.random() * 6, z); group.add(m); streams.push(m);
      }
    }
    // floating code panels in the theme of the chapter
    const tt = THEME_TEXT[L.theme] || THEME_TEXT.chat;
    const panels = [], faceCam = [];
    for (let i = 0; i < 9; i++) {
      const lines = TTshuffle(tt.lines).slice(0, 5);
      const tex = linesTex(lines, { col: i % 3 === 2 ? col2 : col, col2: Theme.hex('ink'), title: tt.title });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), addMat('#ffffff', 1.0, { map: tex, side: THREE.DoubleSide, fog: true }));
      const p = rail[Math.floor((i + 0.5) / 9 * (rail.length - 1))], q = rail[Math.min(rail.length - 1, Math.floor((i + 0.5) / 9 * (rail.length - 1)) + 2)];
      const fx = q.x - p.x, fz = q.z - p.z, l = Math.hypot(fx, fz) || 1, side = i % 2 ? 1 : -1;
      m.position.set(p.x + (-fz / l) * side * (6.5 + Math.random() * 2) + fx / l * 6, p.y + 2.5 + Math.random() * 2.5, p.z + (fx / l) * side * (6.5 + Math.random() * 2) + fz / l * 6);
      if (L.rails.some(r => r.dense.some(d => Math.hypot(d.x - m.position.x, d.z - m.position.z) < 6))) { m.geometry.dispose(); m.material.dispose(); continue; }
      m.lookAt(p.x + fx / l * 12, m.position.y, p.z + fz / l * 12);
      m.userData.base = m.position.y; m.userData.seed = Math.random() * 6;
      group.add(m); panels.push(m); faceCam.push(m);
    }
    // gates with a password
    const gates = L.gates.map(gt => {
      const g = new THREE.Group(); g.position.set(gt.x, gt.y, gt.z); g.rotation.y = -gt.dir * Math.PI / 2;
      const red = '#ff4d5e';
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(12.4, 5.4, 0.6)), lineMat(red, 2.2)); frame.position.y = 2.7; g.add(frame);
      const hexT = ctex(256, 256, (c, w, h) => {
        c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3;
        for (let y = 0; y < 9; y++) for (let x = 0; x < 7; x++) {
          const cx2 = x * 40 + (y % 2) * 20, cy = y * 34;
          c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.lineTo(cx2 + Math.cos(a) * 18, cy + Math.sin(a) * 18); } c.closePath(); c.stroke();
        }
      });
      const panelsG = [];
      for (const s of [-1, 1]) {
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 5.2), addMat(red, 0.9, { map: hexT, side: THREE.DoubleSide }));
        pm.position.set(s * 3.05, 2.6, 0); g.add(pm); panelsG.push({ m: pm, s });
      }
      const lock = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), addMat('#ffffff', 1, { map: signTex('LOCKED', red, { size: 120 }), side: THREE.DoubleSide }));
      lock.position.set(0, 4.5, 0.05); lock.scale.setScalar(0.7); g.add(lock);
      group.add(g);
      return { src: gt, g, panels: panelsG, lock, frame };
    });
    // signature pieces for each theme
    const props = buildThemeProps(L, group, col, col2, rail, faceCam);
    // elevator: a moving disc inside a shaft of falling code
    const lifts = (L.elevators || []).map(e => {
      const g = new THREE.Group(); g.position.set(e.x, e.top, e.z); group.add(g);
      const dg = new THREE.CylinderGeometry(e.r - 0.3, e.r - 0.6, 0.5, 48);
      const d = new THREE.Mesh(dg, floorMat); d.position.y = -0.25; g.add(d);
      const de = new THREE.LineSegments(new THREE.EdgesGeometry(dg, 20), edgeM2); de.position.y = -0.25; g.add(de);
      const fwdA = Math.atan2([[0, -1], [1, 0], [0, 1], [-1, 0]][e.dir || 0][1], [[0, -1], [1, 0], [0, 1], [-1, 0]][e.dir || 0][0]);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + Math.PI / 8, h = e.top - e.bottom + 14;
        const off = Math.abs(Math.atan2(Math.sin(a - fwdA), Math.cos(a - fwdA)));
        if (off < 0.8 || off > Math.PI - 0.8) continue;   // keep the way ahead and behind open
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, h), streamMats[k % 3]);
        w.position.set(e.x + Math.cos(a) * (e.r + 1.6), e.bottom - 2 + h / 2, e.z + Math.sin(a) * (e.r + 1.6));
        w.lookAt(e.x, w.position.y, e.z); group.add(w);
      }
      for (const yy of [e.top + 4, e.bottom - 0.3]) {
        const rg = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2) * (e.r + 1.6), 0, Math.sin(i / 64 * Math.PI * 2) * (e.r + 1.6)))), edgeM2);
        rg.position.set(e.x, yy, e.z); group.add(rg);
      }
      return { e, g };
    });
    // branch: a wall of code between the two lanes and a frame over each lane
    for (const br of L.branches || []) {
      const a = br.wall.from, b = br.wall.to, len = Math.hypot(b.x - a.x, b.z - a.z);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, 7), addMat(col2, 0.55, { map: sTex.clone(), side: THREE.DoubleSide }));
      wall.material.map.wrapS = wall.material.map.wrapT = THREE.RepeatWrapping; wall.material.map.repeat.set(len / 2, 1); wall.material.map.needsUpdate = true;
      wall.position.set((a.x + b.x) / 2, a.y + 3.5, (a.z + b.z) / 2); wall.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x); group.add(wall);
      const we = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(len, 7, 0.3)), lineMat(col2, 1.6)); we.position.copy(wall.position); we.rotation.copy(wall.rotation); group.add(we);
      L.rails.forEach(r => {
        const p = r.at(br.choiceS + 10), f = r.fwd(br.choiceS + 10);
        const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(9, 5, 0.3)), lineMat(col, 2));
        fr.position.set(p.x, p.y - 1.7 + 2.5, p.z); fr.rotation.y = Math.atan2(f.x, f.z); group.add(fr);
      });
    }
    // chase track: two light rails along it
    for (const s of L.slabs.filter(x => x.track)) {
      for (const side of [-1.4, 1.4]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, s.len), basic(col2, 1.6));
        r.rotation.y = -s.dir * Math.PI / 2; const [fx, fz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][s.dir];
        r.position.set(s.x - fz * side, s.y + 0.05, s.z + fx * side); group.add(r);
      }
    }
    // a sky: dark at the top, the chapter's colour glowing along the horizon, faint stars of data
    const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color('#000000') }, uHor: { value: new THREE.Color(fogCol) }, uGlow: { value: bright(col2, 0.32) }, uGlow2: { value: bright(col, 0.18) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uGlow2; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          float y = vD.y;
          vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.55, y));
          c += uGlow * exp(-abs(y - 0.03) * 14.0) + uGlow2 * exp(-abs(y - 0.12) * 5.0) * 0.6;
          vec3 cell = floor(vD * 220.0);
          float st = step(0.996, h(cell)) * smoothstep(0.08, 0.5, y);
          c += vec3(st) * 0.55 * (0.5 + 0.5 * h(cell + 3.1));
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.sky = true;
    group.add(sky);
    lv = { src: L, group, mats, streams, streamMats, panels, gates, props, tiles, lifts, faceCam, sky };
    buildMotes(col, col2);
  }
  function TTshuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function buildThemeProps(L, group, col, col2, rail, faceCam) {
    const props = { spin: [], move: [] };
    const end = L.arenas[L.arenas.length - 1] || rail[rail.length - 1];
    const ef = end.dir !== undefined ? [[0, -1], [1, 0], [0, 1], [-1, 0]][end.dir] : [0, -1];
    const sight = [0, 6, 12.5, 19].map(k => ({ x: end.x + ef[0] * k, z: end.z + ef[1] * k }));
    // props stay out of the boss's line of sight and at least 8 m from every rail
    const clear = (x, z) => sight.every(q => Math.hypot(q.x - x, q.z - z) > 11) && L.rails.every(r => r.dense.every(d => Math.hypot(d.x - x, d.z - z) > 8));
    const _add = group.add.bind(group);
    group = { add: o => { if (o.position && !clear(o.position.x, o.position.z) && !o.userData.keep) return; _add(o); } };
    const along = k => rail[Math.floor(k * (rail.length - 1))];
    if (L.theme === 'chat') {
      // a giant LIVE sign and floating chat bubbles
      const live = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), addMat('#ffffff', 1.2, { map: signTex('● LIVE', '#ff4d5e'), side: THREE.DoubleSide, fog: true }));
      const p = along(0.12); live.position.set(p.x, p.y + 9, p.z - 16); group.add(live); faceCam.push(live); props.spin.push({ m: live, bob: 0.4 });
      for (let i = 0; i < 14; i++) {
        const q = along(Math.random());
        const b = new THREE.Group();
        const shape = new THREE.Shape(); const w = 2.4 + Math.random() * 2, h = 1;
        shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w, h); shape.lineTo(0.5, h); shape.lineTo(0, h + 0.4); shape.lineTo(0.15, h); shape.lineTo(0, h); shape.closePath();
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(shape.getPoints()), lineMat(i % 2 ? col2 : col, 1.8));
        b.add(ln);
        const tx = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, h - 0.2), addMat('#ffffff', 0.9, { map: linesTex([TTshuffle(THEME_TEXT.chat.lines)[0]], { w: 512, h: 96, size: 40, frame: false, col: Theme.hex('ink') }) }));
        tx.position.set(w / 2, h / 2, 0.01); b.add(tx);
        b.position.set(q.x + (Math.random() - 0.5) * 30, q.y + 3 + Math.random() * 8, q.z + (Math.random() - 0.5) * 30);
        b.lookAt(q.x, b.position.y, q.z);
        group.add(b); faceCam.push(b); props.spin.push({ m: b, bob: 0.6 });
      }
    } else if (L.theme === 'market') {
      for (let i = 0; i < 10; i++) {
        const q = along((i + 0.5) / 10), side = i % 2 ? 1 : -1;
        const word = SIGNS[i % SIGNS.length];
        const s = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.4), addMat('#ffffff', 1.1, { map: signTex(word, i % 3 ? col2 : '#ff5f9e'), side: THREE.DoubleSide, fog: true }));
        s.position.set(q.x + side * (9 + Math.random() * 4), q.y + 4 + Math.random() * 4, q.z + (Math.random() - 0.5) * 6);
        s.lookAt(q.x, s.position.y, q.z); group.add(s); faceCam.push(s); props.spin.push({ m: s, bob: 0.3, flicker: true });
        // wireframe stall cubes under each sign
        const cube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3, 2, 2)), lineMat(col2, 1.2));
        cube.position.set(s.position.x, q.y - 3, s.position.z); group.add(cube); props.spin.push({ m: cube, rot: 0.2 });
      }
    } else if (L.theme === 'transit') {
      // packet trains running on light tracks below the platforms
      for (let i = 0; i < 6; i++) {
        const y = -10 - i * 3, z0 = (Math.random() - 0.5) * 120, x0 = (Math.random() - 0.5) * 80;
        const dir = i % 2;
        const track = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(dir ? -200 : x0, y, dir ? z0 : -200), new THREE.Vector3(dir ? 200 : x0, y, dir ? z0 : 200)]), lineMat(i % 2 ? col2 : col, 0.8, { fog: true }));
        track.position.set(rail[0].x, rail[0].y, rail[0].z); track.userData.keep = true; group.add(track);
        const train = new THREE.Mesh(new THREE.BoxGeometry(dir ? 18 : 0.6, 0.6, dir ? 0.6 : 18), basic(i % 2 ? col2 : col, 2.2, { fog: true }));
        train.position.copy(track.position).add(new THREE.Vector3(dir ? 0 : x0, y, dir ? z0 : 0)); train.userData.keep = true; group.add(train);
        props.move.push({ m: train, axis: dir ? 'x' : 'z', base: dir ? train.position.x : train.position.z, sp: 28 + Math.random() * 20 });
      }
      for (let i = 0; i < 6; i++) {
        const q = along((i + 0.3) / 6), side = i % 2 ? 1 : -1;
        const tex = linesTex([THEME_TEXT.transit.lines[i % 7]], { w: 768, h: 128, size: 56, frame: true, col: i % 2 ? '#ff7a4d' : col });
        const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), addMat('#ffffff', 1, { map: tex, side: THREE.DoubleSide, fog: true }));
        s.position.set(q.x + side * 6, q.y + 3.6, q.z); s.lookAt(q.x, s.position.y, q.z); group.add(s); faceCam.push(s);
      }
    } else if (L.theme === 'factory') {
      for (let i = 0; i < 8; i++) {
        const q = along((i + 0.5) / 8), side = i % 2 ? 1 : -1;
        const gear = new THREE.Group();
        const r = 2.5 + Math.random() * 2;
        gear.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(r, r, 0.6, 16)), lineMat(i % 2 ? col2 : col, 1.6)));
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.6), basic(i % 2 ? col2 : col, 0.7)); tooth.position.set(Math.cos(a) * (r + 0.3), 0, Math.sin(a) * (r + 0.3)); tooth.rotation.y = -a; gear.add(tooth); }
        gear.rotation.x = Math.PI / 2;
        const holder = new THREE.Group(); holder.add(gear);
        holder.position.set(q.x + side * (10 + Math.random() * 3), q.y + 1 + Math.random() * 4, q.z);
        holder.lookAt(q.x, holder.position.y, q.z);
        group.add(holder); props.spin.push({ m: gear, rotY: (i % 2 ? 1 : -1) * 0.6 });
      }
      // keycaps riding light conveyors
      for (let i = 0; i < 4; i++) {
        const q = along((i + 0.5) / 4);
        for (let k = 0; k < 6; k++) {
          const cap = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 0.5, 0.8)), lineMat(k % 2 ? col2 : Theme.hex('ink'), 1.5));
          cap.position.set(q.x + (i % 2 ? 7 : -7), q.y - 1.2, q.z); group.add(cap);
          props.move.push({ m: cap, axis: 'z', base: q.z, sp: 3, off: k * 4, wrap: 24 });
        }
      }
    } else if (L.theme === 'core') {
      // giant rings around the last arena and a red core far behind it
      for (let i = 0; i < 4; i++) {
        const r = 22 + i * 7;
        const ringG = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, k) => new THREE.Vector3(Math.cos(k / 128 * Math.PI * 2) * r, Math.sin(k / 128 * Math.PI * 2) * r, 0)));
        const l = new THREE.Line(ringG, lineMat(i % 2 ? col2 : col, 1.4));
        const holder = new THREE.Group(); holder.position.set(end.x, end.y + 6, end.z); holder.add(l); holder.userData.keep = true;
        l.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        group.add(holder); props.spin.push({ m: l, rotX: 0.05 + i * 0.03, rotY: 0.08 - i * 0.02 });
      }
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 2), holoMat(col2, 0.4));
      const f = end.dir !== undefined ? [[0, -1], [1, 0], [0, 1], [-1, 0]][end.dir] : [0, -1];
      core.position.set(end.x + f[0] * 70, end.y + 14, end.z + f[1] * 70); group.add(core);
      const coreLines = new THREE.LineSegments(new THREE.EdgesGeometry(core.geometry), lineMat(col2, 1.5)); coreLines.position.copy(core.position); group.add(coreLines);
      props.spin.push({ m: core, rotY: 0.1 }, { m: coreLines, rotY: 0.1 });
      props.holo = [core.material];
      // server towers with blinking lights
      for (let i = 0; i < 12; i++) {
        const q = along(Math.random()), side = Math.random() < 0.5 ? -1 : 1;
        const rack = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.6, 7, 1.6)), lineMat(col, 0.9));
        rack.position.set(q.x + side * (8 + Math.random() * 8), q.y - 2, q.z + (Math.random() - 0.5) * 10); group.add(rack);
        for (let k = 0; k < 6; k++) {
          const led = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.05), basic(k % 3 ? col : col2, 2));
          led.position.set(rack.position.x, rack.position.y - 3 + k * 1.1, rack.position.z + 0.82); group.add(led); props.spin.push({ m: led, blink: Math.random() * 6 });
        }
      }
    }
    return props;
  }
  // drifting motes of light around the camera: 500 points in a box that wraps as the camera moves
  let motes = null;
  function buildMotes(col, col2) {
    if (motes) { scene.remove(motes); motes.geometry.dispose(); motes.material.dispose(); motes = null; }
    const N = 500, pos = new Float32Array(N * 3), cl = new Float32Array(N * 3), c1 = new THREE.Color(col), c2 = new THREE.Color(col2);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = Math.random() * 44; pos[i * 3 + 1] = Math.random() * 44; pos[i * 3 + 2] = Math.random() * 44;
      const c = Math.random() < 0.5 ? c1 : c2; cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: `uniform vec3 uCam; uniform float uTime; uniform float uPx; attribute vec3 color; varying vec3 vC; varying float vA;
        void main(){
          vec3 p = mod(position + vec3(sin(uTime * 0.2 + position.z) * 0.6, uTime * 0.35, cos(uTime * 0.15 + position.x) * 0.6) - uCam + 22.0, 44.0) - 22.0 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = smoothstep(22.0, 8.0, d) * smoothstep(0.6, 2.5, d);
          vC = color;
          gl_PointSize = uPx * 34.0 / max(d, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r) * vA; gl_FragColor = vec4(vC * a * 0.7, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    motes = new THREE.Points(g, m); motes.frustumCulled = false; scene.add(motes);
  }
  function updateMotes(t) {
    if (!motes) return;
    motes.material.uniforms.uCam.value.copy(camera.position);
    motes.material.uniforms.uTime.value = t;
    motes.visible = !CALM || true;
  }
  function clearLevel() {
    if (!lv) return;
    scene.remove(lv.group);
    disposeTree(lv.group);
    lv = null;
  }
  function disposeTree(o) {
    o.traverse(n => {
      if (n.geometry && !Object.values(G).includes(n.geometry)) n.geometry.dispose();
      if (n.material) [].concat(n.material).forEach(m => { if (m.map && !Object.values(glyphs).includes(m.map)) m.map.dispose(); m.dispose(); });
    });
  }

  // ---------- enemies ----------
  const actors = new Map();
  const FOE_COL = '#c8f7dc';
  function part(g, mat, darkMat, lm, parent, x = 0, y = 0, z = 0) {
    const holder = new THREE.Group(); holder.position.set(x, y, z);
    const inner = new THREE.Mesh(g, darkMat); inner.scale.setScalar(0.96); holder.add(inner);
    const shell = new THREE.Mesh(g, mat); holder.add(shell);
    const e = new THREE.LineSegments(edges(g.uuid, g), lm); holder.add(e);
    parent.add(holder);
    return holder;
  }
  function makeFoe(f, col2) {
    const type = f.type;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const shellCol = type === 'node' ? '#3ee6ff' : FOE_COL;
    const mat = holoMat(shellCol, 0.2), dark = basic('#020a06', 1), lm = lineMat(shellCol, 0.85);
    const red = basic('#ff4d5e', 3.2);
    const P = {};
    const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
    const oct = r => geo('o' + r, () => new THREE.OctahedronGeometry(r));
    const ico = r => geo('i' + r, () => new THREE.IcosahedronGeometry(r, 0));
    const core = (r, y, z = 0) => { const c = new THREE.Mesh(geo('s' + r, () => new THREE.SphereGeometry(r, 12, 8)), red); c.position.set(0, y, z); body.add(c); return c; };
    if (type === 'drone' || type === 'shielded' || type === 'shooter') {
      const torso = part(oct(0.42), mat, dark, lm, body, 0, 0.05); torso.scale.set(0.95, 1.45, 0.6);
      P.head = part(type === 'shooter' ? geo('tor', () => new THREE.TorusGeometry(0.2, 0.06, 6, 12)) : ico(0.2), mat, dark, lm, body, 0, 0.78);
      const eye = new THREE.Mesh(box(0.22, 0.04, 0.04), red); eye.position.set(0, 0, 0.17); P.head.add(eye);
      const ant = new THREE.Mesh(box(0.02, 0.32, 0.02), basic(col2, 1.4)); ant.position.set(0.1, 0.3, -0.04); ant.rotation.z = -0.3; P.head.add(ant);
      const seam = new THREE.Mesh(box(0.5, 0.025, 0.42), basic(col2, 1.2)); seam.position.set(0, 0.32, 0); body.add(seam);
      for (const s of [-1, 1]) {
        const sh = part(box(0.22, 0.12, 0.22), mat, dark, lm, body, s * 0.42, 0.42);
        const arm = new THREE.Group(); arm.position.set(s * 0.44, 0.38, 0); body.add(arm);
        part(box(0.08, 0.62, 0.08), mat, dark, lm, arm, 0, -0.34);
        P['arm' + s] = arm;
        const leg = new THREE.Group(); leg.position.set(s * 0.16, -0.42, 0); body.add(leg);
        part(geo('leg', () => new THREE.CylinderGeometry(0.07, 0.03, 0.78, 4)), mat, dark, lm, leg, 0, -0.39);
        P['leg' + s] = leg;
        sh.rotation.y = 0.6;
      }
      P.core = core(0.11, 0.12, 0.12);
      if (type === 'shielded') {
        const hex = new THREE.Group(); hex.position.set(0, 0.2, 0.75);
        const hg = geo('hex', () => new THREE.CylinderGeometry(0.8, 0.8, 0.04, 6));
        const hm = new THREE.Mesh(hg, addMat('#3ee6ff', 0.12)); hm.rotation.x = Math.PI / 2; hex.add(hm);
        const he = new THREE.LineSegments(edges('hex', hg), lineMat('#3ee6ff', 1.6)); he.rotation.x = Math.PI / 2; hex.add(he);
        body.add(hex); P.shield = hex;
      }
      if (type === 'shooter') { P.orb = new THREE.Mesh(geo('s0.16', () => new THREE.SphereGeometry(0.16, 12, 8)), basic('#ff4d5e', 3)); P.orb.position.set(0, 0.78, 0.3); body.add(P.orb); }
    } else if (type === 'runner') {
      const torso = part(geo('cone', () => new THREE.ConeGeometry(0.32, 1.1, 4)), mat, dark, lm, body, 0, 0.05); torso.rotation.x = Math.PI / 2 + 0.25; P.torso = torso;
      P.head = part(oct(0.16), mat, dark, lm, body, 0, 0.25, 0.6);
      for (let k = 0; k < 4; k++) {
        const s = k % 2 ? 1 : -1, z = k < 2 ? 0.25 : -0.3;
        const leg = new THREE.Group(); leg.position.set(s * 0.22, -0.05, z); body.add(leg);
        const blade = part(box(0.04, 0.9, 0.12), mat, dark, lm, leg, s * 0.12, -0.42); blade.rotation.z = s * 0.3;
        P['leg' + k] = leg;
      }
      P.core = core(0.09, 0.1, 0.1);
    } else if (type === 'glitcher') {
      P.slices = [];
      for (let k = 0; k < 6; k++) {
        const s = part(box(0.75 - Math.abs(k - 2.5) * 0.09, 0.26, 0.45), mat, dark, lm, body, 0, -0.65 + k * 0.28);
        P.slices.push(s);
      }
      P.head = part(box(0.3, 0.3, 0.3), mat, dark, lm, body, 0, 1.05); P.head.rotation.set(0.6, 0.8, 0);
      P.core = core(0.12, 0.1, 0.24);
    } else if (type === 'splitter' || type === 'shard') {
      const r = type === 'shard' ? 0.3 : 0.42;
      P.a = part(ico(r), mat, dark, lm, body, type === 'shard' ? 0 : -0.24, 0.05);
      if (type === 'splitter') {
        P.b = part(ico(r), mat, dark, lm, body, 0.24, 0.05);
        const crack = new THREE.Mesh(box(0.04, 0.9, 0.5), basic('#ff4d5e', 2.5)); body.add(crack); P.crack = crack;
      }
      for (let k = 0; k < 3; k++) { const sp = part(geo('spike', () => new THREE.ConeGeometry(0.06, 0.4, 4)), mat, dark, lm, body, Math.cos(k * 2.1) * r, Math.sin(k * 2.1) * r + 0.05); sp.rotation.z = k * 2.1 - Math.PI / 2; }
      P.core = core(type === 'shard' ? 0.08 : 0.12, 0.05, r * 0.8);
    } else if (type === 'flyer') {
      part(oct(0.3), mat, dark, lm, body).scale.set(0.7, 0.5, 1.6);
      for (const s of [-1, 1]) {
        const wing = new THREE.Group(); wing.position.set(s * 0.15, 0, 0); body.add(wing);
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(s * 1.5, 0.15); sh.lineTo(s * 1.1, -0.35); sh.lineTo(s * 0.5, -0.5); sh.closePath();
        const wg = new THREE.ShapeGeometry(sh);
        const wm = new THREE.Mesh(wg, addMat(FOE_COL, 0.18, { side: THREE.DoubleSide })); wm.rotation.x = -Math.PI / 2; wing.add(wm);
        const we = new THREE.LineSegments(new THREE.EdgesGeometry(wg), lm); we.rotation.x = -Math.PI / 2; wing.add(we);
        P['wing' + s] = wing;
      }
      P.core = core(0.1, 0, 0.3);
    } else if (type === 'bug') {
      part(geo('tet', () => new THREE.TetrahedronGeometry(0.22)), mat, dark, lm, body);
      const legs = [];
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; legs.push(0, 0, 0, Math.cos(a) * 0.38, -0.25, Math.sin(a) * 0.38); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(legs, 3));
      body.add(new THREE.LineSegments(lg, lm));
      P.core = core(0.07, 0, 0.12);
    } else if (type === 'mimic' && !f.revealed) {
      // disguised: a hex chip with a question mark, close to a real power-up
      const g = geo('chip', () => new THREE.CylinderGeometry(0.55, 0.55, 0.12, 6));
      const m = new THREE.Mesh(g, basic('#021a1d', 1)); m.rotation.x = Math.PI / 2; body.add(m);
      const e = new THREE.LineSegments(edges('chip', g), lineMat('#3ee6ff', 2.4)); e.rotation.x = Math.PI / 2; body.add(e);
      const q = new THREE.Mesh(geo('icp', () => new THREE.PlaneGeometry(0.62, 0.62)), addMat('#3ee6ff', 1.8, { map: glyph('?') })); q.position.z = 0.07; body.add(q);
      P.disguise = true;
    } else if (type === 'mimic') {
      // shown: a spiked shell with jaws
      part(ico(0.42), mat, dark, lm, body, 0, 0);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, sp = part(geo('mspk', () => new THREE.ConeGeometry(0.08, 0.5, 4)), mat, dark, lm, body, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
        sp.rotation.z = a - Math.PI / 2;
      }
      P.jawT = part(box(0.6, 0.08, 0.3), mat, dark, lm, body, 0, 0.12, 0.35); P.jawB = part(box(0.6, 0.08, 0.3), mat, dark, lm, body, 0, -0.12, 0.35);
      P.core = core(0.12, 0, 0.3);
    } else if (type === 'burrower') {
      // a segmented worm; under the grid only a ring on the floor shows
      P.segs = [];
      for (let k = 0; k < 6; k++) { const sg = part(geo('bw' + k, () => new THREE.CylinderGeometry(0.3 - k * 0.03, 0.32 - k * 0.03, 0.34, 8)), mat, dark, lm, body, 0, -k * 0.3, -k * 0.12); P.segs.push(sg); }
      const jaw = new THREE.Group(); jaw.position.set(0, 0.2, 0.05); body.add(jaw);
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2, f2 = part(geo('bwf', () => new THREE.ConeGeometry(0.06, 0.35, 4)), mat, dark, lm, jaw, Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2); f2.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      P.core = core(0.1, 0.1, 0.22);
      P.ring = new THREE.Mesh(geo('bring', () => new THREE.RingGeometry(0.5, 0.62, 24)), addMat('#ff4d5e', 1.2, { side: THREE.DoubleSide })); P.ring.rotation.x = -Math.PI / 2;
      root.add(P.ring);
    } else if (type === 'carrier') {
      // a hive with pods; the pods are the bugs it lets out
      part(geo('carb', () => new THREE.IcosahedronGeometry(0.62, 1)), mat, dark, lm, body);
      P.pods = [];
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, pd = part(geo('tet', () => new THREE.TetrahedronGeometry(0.22)), mat, dark, lm, body, Math.cos(a) * 0.95, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.95); P.pods.push(pd); }
      const rg = new THREE.Mesh(geo('carr', () => new THREE.TorusGeometry(0.95, 0.025, 6, 48)), basic(col2, 1.4)); rg.rotation.x = Math.PI / 2; body.add(rg); P.hoop = rg;
      P.core = core(0.16, 0, 0.5);
    } else if (type === 'reflector') {
      // a tall mirror panel on a stalk; it turns its back to show the word mirrored
      const pan = part(geo('refl', () => new THREE.BoxGeometry(0.9, 1.3, 0.08)), mat, dark, lm, body, 0, 0.2);
      const face = new THREE.Mesh(geo('reflf', () => new THREE.PlaneGeometry(0.8, 1.2)), addMat('#3ee6ff', 0.35)); face.position.z = 0.05; pan.add(face);
      part(geo('refls', () => new THREE.CylinderGeometry(0.05, 0.12, 1.0, 6)), mat, dark, lm, body, 0, -0.85);
      P.core = core(0.1, 0.2, -0.08);
      P.turn = body;
    } else if (type === 'link') {
      part(geo('lnk', () => new THREE.DodecahedronGeometry(0.34)), mat, dark, lm, body);
      const rg = new THREE.Mesh(geo('lnkr', () => new THREE.TorusGeometry(0.5, 0.03, 6, 32)), basic('#3ee6ff', 1.6)); body.add(rg); P.lring = rg;
      P.core = core(0.09, 0, 0.3);
    } else if (type === 'cloaked') {
      const torso = part(oct(0.38), mat, dark, lm, body, 0, 0.05); torso.scale.set(0.8, 1.6, 0.55);
      P.head = part(geo('clh', () => new THREE.ConeGeometry(0.2, 0.42, 5)), mat, dark, lm, body, 0, 0.8);
      for (const sx of [-1, 1]) { const cape = part(geo('clc', () => new THREE.BoxGeometry(0.05, 1.1, 0.5)), mat, dark, lm, body, sx * 0.36, 0, -0.05); cape.rotation.z = sx * 0.15; }
      P.core = core(0.09, 0.15, 0.16);
    } else if (type === 'heavy') {
      // a slab-built golem carrying a phrase
      part(box(1.1, 1.0, 0.7), mat, dark, lm, body, 0, 0.2);
      part(box(0.8, 0.45, 0.6), mat, dark, lm, body, 0, -0.5);
      P.head = part(box(0.36, 0.3, 0.36), mat, dark, lm, body, 0, 0.9);
      const visor = new THREE.Mesh(box(0.3, 0.05, 0.05), red); visor.position.set(0, 0, 0.19); P.head.add(visor);
      for (const sx of [-1, 1]) {
        part(box(0.42, 0.3, 0.5), mat, dark, lm, body, sx * 0.78, 0.55);
        const arm = new THREE.Group(); arm.position.set(sx * 0.8, 0.4, 0); body.add(arm);
        part(box(0.3, 0.95, 0.3), mat, dark, lm, arm, 0, -0.5); part(box(0.4, 0.3, 0.4), mat, dark, lm, arm, 0, -1.05);
        P['arm' + sx] = arm;
        const leg = new THREE.Group(); leg.position.set(sx * 0.3, -0.72, 0); body.add(leg);
        part(box(0.32, 0.9, 0.36), mat, dark, lm, leg, 0, -0.45); P['leg' + sx] = leg;
      }
      P.core = core(0.16, 0.25, 0.36);
    } else if (type === 'healer') {
      // a cross of light inside two turning rings
      part(box(0.18, 0.9, 0.18), mat, dark, lm, body); part(box(0.6, 0.18, 0.18), mat, dark, lm, body, 0, 0.12);
      P.rings = [];
      for (let k = 0; k < 2; k++) { const rg = new THREE.Mesh(geo('hr' + k, () => new THREE.TorusGeometry(0.62 + k * 0.14, 0.025, 6, 40)), basic(k ? '#3ee6ff' : col2, 1.5)); body.add(rg); P.rings.push(rg); }
      P.core = core(0.11, 0.12, 0.12);
    } else if (type === 'sniper') {
      // a tripod with a long rifle and a scope; its red lens is the core
      part(oct(0.3), mat, dark, lm, body, 0, 0.25).scale.set(0.9, 1.1, 0.8);
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2 + Math.PI / 2, leg = new THREE.Group(); leg.position.set(0, 0.05, 0); body.add(leg);
        const l = part(geo('snl', () => new THREE.CylinderGeometry(0.04, 0.02, 1.5, 4)), mat, dark, lm, leg, Math.cos(a) * 0.34, -0.66, Math.sin(a) * 0.34);
        l.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42);
        P['tleg' + k] = leg;
      }
      const gunG = new THREE.Group(); gunG.position.set(0, 0.42, 0); body.add(gunG); P.rifle = gunG;
      part(box(0.1, 0.1, 1.5), mat, dark, lm, gunG, 0, 0, 0.35);
      part(box(0.06, 0.06, 0.5), mat, dark, lm, gunG, 0, 0, 1.3);
      const scope = part(geo('scp', () => new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8)), mat, dark, lm, gunG, 0, 0.13, 0.2); scope.rotation.x = Math.PI / 2;
      P.core = new THREE.Mesh(geo('s0.06', () => new THREE.SphereGeometry(0.06, 10, 6)), red); P.core.position.set(0, 0.13, 0.44); gunG.add(P.core);
      P.muzzle = new THREE.Object3D(); P.muzzle.position.set(0, 0, 1.56); gunG.add(P.muzzle);
    } else if (type === 'node') {
      part(oct(0.38), mat, dark, lm, body);
      P.rings = [];
      for (let k = 0; k < 2; k++) {
        const r = new THREE.Mesh(geo('nr', () => new THREE.TorusGeometry(0.6, 0.02, 6, 32)), basic('#3ee6ff', 2)); body.add(r); P.rings.push(r);
      }
    }
    // orbiting code fragments: letters of the word and a few voxels
    P.orbit = [];
    const word = f.words.join('') || 'x';
    if (type !== 'bug') {
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyph(word[k % word.length]), color: bright(col2, 0.9), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        s.scale.setScalar(0.17); root.add(s); P.orbit.push({ o: s, a: k * 2.1, r: 0.75, y: 0.2 + k * 0.25 });
      }
      for (let k = 0; k < 4; k++) {
        const v = new THREE.Mesh(box(0.09, 0.09, 0.09), basic(k % 2 ? col2 : FOE_COL, 1.6));
        root.add(v); P.orbit.push({ o: v, a: k * 1.6 + 0.5, r: 0.55 + k * 0.1, y: -0.3 + k * 0.3, spin: true });
      }
    }
    scene.add(root);
    const base = { drone: 1.3, shielded: 1.35, shooter: 1.35, glitcher: 1.3, splitter: 1.3, runner: 1.2, flyer: 1.3, bug: 1.2, shard: 1.15, node: 1.2,
      mimic: f.revealed ? 0.95 : 1.2, burrower: 1.3, carrier: 1.35, reflector: 1.4, link: 1.2, cloaked: 1.35, heavy: 1.55, healer: 1.3, sniper: 1.35 }[type] || 1;
    return { root, body, P, mat, lm, dark, type, base, seed: Math.random() * 10, disguised: !!P.disguise };
  }
  function animateFoe(a, f, t, camPos, isTarget) {
    const P = a.P, ph = f.phase || 0;
    a.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    a.root.lookAt(camPos.x, f.pos.y, camPos.z);
    a.mat.uniforms.uTime.value = t;
    a.mat.uniforms.uFlash.value = f.flash > 0 ? 0.25 : 0;
    a.lm.color.copy(bright(isTarget ? '#ffffff' : a.type === 'node' ? '#3ee6ff' : FOE_COL, (isTarget ? 2.2 : 0.85) * (1 - DARK * 0.55)));
    const sw = Math.sin(ph);
    if (P.leg1) {
      if (a.type === 'runner') for (let k = 0; k < 4; k++) P['leg' + k].rotation.x = Math.sin(ph * 1.2 + k * 1.6) * 0.7;
      else { P['leg-1'].rotation.x = sw * 0.6; P['leg1'].rotation.x = -sw * 0.6; }
    }
    if (P.arm1) {
      const reach = a.type === 'shooter' && f.windup ? -1.5 : -0.9;
      P['arm-1'].rotation.x = reach + Math.sin(ph * 0.5) * 0.2; P['arm1'].rotation.x = reach - Math.sin(ph * 0.5) * 0.2;
    }
    if (P.orb) { const k = f.windup || 0; P.orb.scale.setScalar(0.4 + k * 1.6); }
    const shielded = f.words.length - f.wi > 1;
    if (shielded && !P.shield && !P.disguise) {
      const hex = new THREE.Group(); hex.position.set(0, 0.2, 0.75);
      const hg = geo('hex', () => new THREE.CylinderGeometry(0.8, 0.8, 0.04, 6));
      const hm = new THREE.Mesh(hg, addMat('#3ee6ff', 0.12)); hm.rotation.x = Math.PI / 2; hex.add(hm);
      const he = new THREE.LineSegments(edges('hex', hg), lineMat('#3ee6ff', 1.6)); he.rotation.x = Math.PI / 2; hex.add(he);
      a.body.add(hex); P.shield = hex;
    }
    if (P.shield) P.shield.visible = shielded;
    // cloaked typos fade out and back in
    // and every typo fades out in its last metres before it reaches the camera
    const dc = Math.hypot(camPos.x - f.pos.x, camPos.z - f.pos.z), near = Math.min(1, Math.max(0, (dc - 2.4) / (1.4 + Math.max(0, a.base - 1.25) * 6)));
    a.root.visible = dc > 2.45;
    const vis = (f.cloakVis === undefined ? 1 : f.cloakVis) * (0.15 + 0.85 * near);
    a.mat.uniforms.uAlpha.value = 0.06 + 0.94 * vis;
    a.lm.transparent = true; a.lm.opacity = 0.08 + 0.92 * vis;
    if (P.disguise) { a.body.rotation.set(0, t * 1.2, 0); a.body.position.y = Math.sin(t * 3 + a.seed) * 0.1; }
    if (a.type === 'burrower') {
      const under = !f.surfaced;
      a.body.visible = !under;
      P.orbit.forEach(o => { o.o.visible = !under; });
      P.ring.visible = under;
      P.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
      P.segs.forEach((sg, i) => { sg.position.x = Math.sin(t * 4 - i * 0.7) * 0.08; });
    }
    if (P.turn) P.turn.rotation.y += ((f.mirror ? Math.PI : 0) - P.turn.rotation.y) * 0.15;
    if (P.pods) P.pods.forEach((pd, i) => { pd.rotation.set(t * 2 + i, t, 0); });
    if (P.hoop) P.hoop.rotation.z = t * 0.8;
    if (P.lring) P.lring.rotation.set(t * 1.5, t, 0);
    if (P.jawT) { const o = 0.06 + Math.abs(Math.sin(t * 5)) * 0.08; P.jawT.position.y = 0.06 + o; P.jawB.position.y = -0.06 - o; }
    if (P.slices) P.slices.forEach((s, i) => { s.position.x = CALM ? Math.sin(t * 2 + i) * 0.08 : (Math.random() < 0.05 + (f.glitch > 0 ? 0.3 : 0) ? (Math.random() - 0.5) * 0.3 : s.position.x * 0.8); });
    if (P.crack) P.crack.scale.y = 0.8 + Math.sin(t * 20) * 0.2;
    if (P['wing-1']) { P['wing-1'].rotation.z = Math.sin(ph * 2.2) * 0.6; P['wing1'].rotation.z = -Math.sin(ph * 2.2) * 0.6; }
    if (P.rings) { P.rings[0].rotation.set(t * 2, t, 0); P.rings[1].rotation.set(-t, t * 1.7, 1); }
    if (a.type === 'bug') a.body.rotation.set(Math.sin(t * 13 + a.seed) * 0.3, t * 3, 0);
    a.body.position.y = Math.abs(Math.cos(ph)) * (a.type === 'runner' ? 0.08 : 0.05);
    for (const o of P.orbit) {
      o.a += 0.03; o.o.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(o.a * 1.3) * 0.1, Math.sin(o.a) * o.r);
      if (o.spin) o.o.rotation.set(o.a * 2, o.a, 0);
    }
    // glitch in: jitter and scale up when spawned or teleporting
    let s = 1;
    if (f.glitch > 0) { s = 1 - f.glitch * 0.6; if (!CALM) a.root.position.x += (Math.random() - 0.5) * 0.3 * f.glitch; }
    if (f.dying) {
      // the hologram comes apart: every piece flies out from the middle, spinning, and fades
      const k = 1 - Math.max(0, f.dying) / 0.35;
      if (!a.shards) {
        a.shards = a.body.children.map(c => {
          const d = c.position.clone(); if (d.lengthSq() < 0.01) d.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5);
          d.normalize().multiplyScalar(3.2 + Math.random() * 3.2); d.y += 1.2;
          return { c, p0: c.position.clone(), v: d, r: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16) };
        });
      }
      const e = k * 0.35;
      for (const sh of a.shards) {
        sh.c.position.set(sh.p0.x + sh.v.x * e, sh.p0.y + sh.v.y * e - 4 * e * e, sh.p0.z + sh.v.z * e);
        sh.c.rotation.set(sh.r.x * e, sh.r.y * e, sh.r.z * e);
      }
      s = 1 + k * 0.12;
      a.mat.uniforms.uFlash.value = (1 - k) * 0.28;
      a.mat.uniforms.uAlpha.value *= 1 - k * 0.85;
      a.lm.opacity *= 1 - k;
    } else if (f.flash > 0) {
      // each hit knocks it back a little and lights it up
      const k = f.flash / 0.06;
      a.body.position.z = -0.14 * k; a.body.rotation.x = -0.12 * k;
      a.mat.uniforms.uFlash.value = 0.12 + 0.16 * k;
    } else if (a.body.rotation.x) { a.body.rotation.x *= 0.7; a.body.position.z *= 0.7; }
    if (a.type === 'sniper') {
      const k = f.windup || 0;
      P.rifle.rotation.x = -0.08 - k * 0.05 + Math.sin(t * 1.7 + a.seed) * 0.02 * (1 - k);
      if (!a.extra) {
        const line = new THREE.Mesh(geo('sight', () => new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true)), addMat('#ff2a3c', 2.4));
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright('#ff4d5e', 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        scene.add(line); scene.add(dot); a.extra = [line, dot];
      }
      const [line, dot] = a.extra;
      const on = k > 0 && !f.dying;
      line.visible = dot.visible = on;
      if (on) {
        a.root.updateMatrixWorld(true);
        const from = P.muzzle.getWorldPosition(new THREE.Vector3());
        // it paints the blaster, so the line crosses the view instead of pointing straight at the lens
        const to = gun && gun.g.visible ? gunTip().clone() : camPos.clone().add(new THREE.Vector3(0.4, -0.5, 0)), dir = to.clone().sub(from), full = dir.length();
        const len = Math.max(0.1, full - 0.15); dir.normalize();
        line.position.copy(from).addScaledVector(dir, len / 2);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const pulse = CALM ? 1 : 0.7 + 0.3 * Math.sin(t * (10 + k * 30));
        line.scale.set(1 + k * 1.5, len, 1 + k * 1.5);
        line.material.opacity = (0.25 + k * 0.75) * pulse;
        dot.position.copy(from); dot.scale.setScalar(0.3 + k * 0.6); dot.material.opacity = 0.5 + k * 0.5;
      }
    }
    if (P.orb) {
      const k = f.windup || 0;
      if (!P.orbGlow) { P.orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright('#ff4d5e', 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); P.orbGlow.position.copy(P.orb.position); a.body.add(P.orbGlow); }
      P.orbGlow.scale.setScalar(0.2 + k * 1.3 + (k > 0.6 ? Math.sin(t * 40) * 0.15 : 0));
      P.orbGlow.material.opacity = 0.3 + k * 0.7;
    }
    a.root.scale.setScalar(Math.max(0.01, s) * a.base);
    if (P.ring) P.ring.position.y = ((f.floor ?? f.pos.y) + 0.04 - f.pos.y) / a.root.scale.y;
  }

  // ---------- set piece actors ----------
  function makeBarrier() {
    const root = new THREE.Group(), red = '#ff4d5e';
    const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(11.6, 4.6, 0.3)), lineMat(red, 1.8)); fr.position.y = 2.3; root.add(fr);
    const tex = ctex(256, 128, (c, w, h) => {
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) { const cx = x * 30 + (y % 2) * 15, cy = y * 26 + 10; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.lineTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13); } c.closePath(); c.stroke(); }
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 4.2), addMat(red, 0.55, { map: tex, side: THREE.DoubleSide }));
    panel.position.y = 2.3; root.add(panel);
    scene.add(root);
    return { root, panel };
  }
  function makeTrain() {
    const g = new THREE.Group(), col = lv ? lv.src.color2 : '#4d7cff';
    const body = new THREE.BoxGeometry(3.6, 3.6, 10);
    const m = new THREE.Mesh(body, basic('#020a06', 1)); m.position.set(0, 1.9, -5); g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(body), lineMat(col, 1.8)); e.position.copy(m.position); g.add(e);
    for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.06, 0.06), basic(col, 1.4)); st.position.set(0, 0.6 + k * 0.9, 0.02); g.add(st); }
    for (const x of [-1.1, 1.1]) {
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright('#fff4c8', 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      l.position.set(x, 1.0, 0.2); l.scale.setScalar(1.4); g.add(l);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), addMat('#ffffff', 1, { map: signTex('2-14', '#ff7a4d', { size: 180 }) }));
    sign.position.set(0, 3.2, 0.05); g.add(sign);
    scene.add(g);
    return g;
  }

  // ---------- packets, power-ups and sparks ----------
  function makeProj() {
    const root = new THREE.Group();
    const g = geo('o0.22', () => new THREE.OctahedronGeometry(0.22));
    root.add(new THREE.Mesh(g, basic('#2a0006', 1)));
    const shell = new THREE.Mesh(g, holoMat('#ff4d5e', 0)); shell.scale.setScalar(1.05); root.add(shell);
    root.add(new THREE.LineSegments(edges('o0.22', g), lineMat('#ff6b78', 2.4)));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright('#ff4d5e', 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.setScalar(1.1); root.add(glow);
    const trail = new THREE.Mesh(geo('trail', () => { const c = new THREE.ConeGeometry(0.12, 1.6, 6, 1, true); c.translate(0, -0.8, 0); c.rotateX(-Math.PI / 2); return c; }), addMat('#ff4d5e', 1.2));
    trail.rotation.y = Math.PI; root.add(trail);
    scene.add(root);
    return { root, shell, spin: Math.random() * 6 };
  }
  function makePickup(p) {
    const root = new THREE.Group(), chip = new THREE.Group(); root.add(chip);
    const g = geo('chip', () => new THREE.CylinderGeometry(0.55, 0.55, 0.12, 6));
    const m = new THREE.Mesh(g, basic('#021a1d', 1)); m.rotation.x = Math.PI / 2; chip.add(m);
    const e = new THREE.LineSegments(edges('chip', g), lineMat('#3ee6ff', 3)); e.rotation.x = Math.PI / 2; chip.add(e);
    const kinds = { health: 'plus', debounce: 'clock', macro: 'burst', shield: 'shield', double: 'x2', freeze: 'pause' };
    const ic = new THREE.Mesh(geo('icp', () => new THREE.PlaneGeometry(0.62, 0.62)), addMat('#3ee6ff', 2.2, { map: iconTex(kinds[p.pick]) }));
    ic.position.z = 0.07; chip.add(ic);
    const ic2 = ic.clone(); ic2.position.z = -0.07; ic2.rotation.y = Math.PI; chip.add(ic2);
    const halo = new THREE.Mesh(geo('halo', () => new THREE.RingGeometry(0.78, 0.83, 6)), addMat('#3ee6ff', 2, { side: THREE.DoubleSide })); root.add(halo);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright('#3ee6ff', 0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.setScalar(2.4); root.add(glow);
    scene.add(root);
    return { root, chip, halo };
  }
  function makeSpark() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright(Theme.hex('accent'), 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(0.8); scene.add(s);
    return { root: s };
  }

  // ---------- bosses ----------
  let bossA = null;
  function bossBase() {
    const mats = { holo: [], lines: [] };
    const H = (col, band = 0.3) => { const m = holoMat(col, band); mats.holo.push(m); return m; };
    const Lm = (col, k) => { const m = lineMat(col, k); m.userData.base = m.color.clone(); mats.lines.push(m); return m; };
    return { mats, H, Lm };
  }
  function holoPart(g, holo, lm, parent, x = 0, y = 0, z = 0) {
    const h = new THREE.Group(); h.position.set(x, y, z);
    const inner = new THREE.Mesh(g, basic('#020a06', 1)); inner.scale.setScalar(0.97); h.add(inner);
    h.add(new THREE.Mesh(g, holo));
    h.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), lm));
    parent.add(h); return h;
  }
  function makeBoss(b, col, col2) {
    const root = new THREE.Group(), P = {};
    const { mats, H, Lm } = bossBase();
    const red = basic('#ff4d5e', 3);
    if (b.art === 'spam') {
      P.segs = [];
      const bubbleTexts = ['FREE FOLLOWERS', 'clik here', 'u won!!', 'subscirbe', 'cheap views', 'DM me', 'gift card', 'follwo back'];
      for (let i = 0; i < 13; i++) {
        const s = new THREE.Group();
        const w = 1.9 - i * 0.07;
        holoPart(new THREE.BoxGeometry(w, 0.95, 0.5), H(col2), Lm(col2, 1.8), s);
        const tx = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, 0.7), addMat('#ffffff', 1, { map: linesTex([bubbleTexts[i % bubbleTexts.length]], { w: 512, h: 160, size: 54, frame: false, col: '#ffe6ff' }) }));
        tx.position.z = 0.27; s.add(tx);
        root.add(s); P.segs.push(s);
      }
      const head = P.segs[0];
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), red); e.position.set(sx * 0.5, 0.25, 0.3); head.add(e); }
      const jaw = new THREE.Group(); jaw.position.set(0, -0.55, 0.2); head.add(jaw);
      for (let k = 0; k < 6; k++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), red); tooth.position.set(-0.6 + k * 0.24, 0, 0); tooth.rotation.x = Math.PI; jaw.add(tooth); }
      P.jaw = jaw; head.scale.setScalar(1.5);
    } else if (b.art === 'sign') {
      const board = new THREE.Group(); board.position.y = 4.4; root.add(board); P.board = board;
      holoPart(new THREE.BoxGeometry(7.4, 2.8, 0.4), H(col2, 0.15), Lm(col2, 2), board);
      P.face = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.2), addMat('#ffffff', 1.3, { map: signTex('NODLES', col2, { size: 190 }) })); P.face.position.z = 0.22; board.add(P.face);
      for (let k = 0; k < 14; k++) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), basic(k % 2 ? col2 : '#ffffff', 2.5)); const u = k / 13; bulb.position.set(-3.6 + u * 7.2, 1.48, 0.15); board.add(bulb); }
      P.legs = [];
      for (let k = 0; k < 4; k++) {
        const sx = k < 2 ? -1 : 1, sz = k % 2 ? -1 : 1;
        const hip = new THREE.Group(); hip.position.set(sx * 2.8, 3.2, sz * 0.4); root.add(hip);
        const upper = holoPart(new THREE.CylinderGeometry(0.14, 0.1, 2.2, 6), H(col), Lm(col, 1.6), hip, sx * 0.6, 0.5); upper.rotation.z = sx * -1.0;
        const knee = new THREE.Group(); knee.position.set(sx * 1.6, 1.1, 0); hip.add(knee);
        const lower = holoPart(new THREE.CylinderGeometry(0.1, 0.03, 4.4, 6), H(col), Lm(col, 1.6), knee, sx * 0.3, -2.2); lower.rotation.z = sx * 0.15;
        P.legs.push(hip);
      }
      P.eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), red); P.eye.position.set(0, 2.7, 0.3); root.add(P.eye);
    } else if (b.art === 'announcer') {
      const core = holoPart(new THREE.IcosahedronGeometry(1.1, 1), H(col2), Lm(col2, 1.8), root, 0, 3.6); P.core = core;
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), red); heart.position.y = 3.6; root.add(heart); P.heart = heart;
      const ring = new THREE.Group(); ring.position.y = 3.6; root.add(ring); P.ring = ring;
      ring.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 8, 64), basic(col, 2)));
      P.cones = [];
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2;
        const cone = holoPart(new THREE.CylinderGeometry(0.75, 0.25, 0.7, 16, 1, true), H(col), Lm(col, 1.6), ring, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.2);
        cone.rotation.x = Math.PI / 2; P.cones.push(cone);
      }
      const tick = signTex('NXET STOP: NOWERE   DELAYD   MIND TEH GAP   ', '#ff7a4d', { w: 2048, h: 128, size: 90 });
      tick.wrapS = THREE.RepeatWrapping;
      P.ticker = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.45, 48, 1, true), addMat('#ffffff', 1.2, { map: tick, side: THREE.DoubleSide }));
      P.ticker.position.y = 5.2; root.add(P.ticker);
      for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 64), addMat(col2, 2)); w.position.y = 3.6; w.visible = false; root.add(w); (P.waves ||= []).push(w); }
    } else if (b.art === 'press') {
      for (const sx of [-1, 1]) holoPart(new THREE.BoxGeometry(0.8, 8, 0.9), H(col), Lm(col, 1.6), root, sx * 4, 4);
      holoPart(new THREE.BoxGeometry(9, 0.9, 1.1), H(col), Lm(col, 1.6), root, 0, 8.2);
      const head = new THREE.Group(); head.position.y = 4.6; root.add(head); P.head = head;
      holoPart(new THREE.BoxGeometry(6.6, 1.5, 1.6), H(col2, 0.4), Lm(col2, 2.2), head);
      const stripe = ctex(512, 64, (g, w, h) => { for (let x = -64; x < w; x += 48) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 56, 0); g.lineTo(x + 32, 0); g.fill(); } });
      const st = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.5), addMat(col2, 1.6, { map: stripe })); st.position.set(0, 0.35, 0.82); head.add(st);
      const caps = 'TYPOERROR';
      for (let k = 0; k < 9; k++) {
        const cap = holoPart(new THREE.BoxGeometry(0.55, 0.45, 0.55), H('#d9ffe9', 0.1), Lm('#d9ffe9', 1.4), head, -2.8 + k * 0.7, -1.05, 0.2);
        const lt = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), addMat('#ffffff', 1.5, { map: glyph(caps[k]) })); lt.position.z = 0.29; cap.add(lt);
      }
      for (const sx of [-1, 1]) { const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3, 8), basic(col, 1.2)); piston.position.set(sx * 2, 2.3, 0); head.add(piston); }
      P.eyes = [];
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.05), basic('#ff4d5e', 3)); e.position.set(sx * 1.4, -0.1, 0.82); head.add(e); P.eyes.push(e); }
      const belt = holoPart(new THREE.BoxGeometry(10, 0.5, 2.2), H(col, 0.6), Lm(col, 1.4), root, 0, 0.25);
    } else if (b.art === 'correction') {
      const slab = new THREE.Group(); slab.position.y = 4.4; root.add(slab); P.slab = slab;
      holoPart(new THREE.BoxGeometry(5.6, 7.6, 0.7), H(col2, 0.2), Lm(col2, 1.8), slab);
      P.screens = [];
      const src = THEME_TEXT.core.lines;
      for (let k = 0; k < 12; k++) {
        const cx = -1.9 + (k % 3) * 1.9, cy = 2.7 - Math.floor(k / 3) * 1.8;
        const tex = linesTex(TTshuffle(src).slice(0, 4), { w: 256, h: 200, size: 18, col: k % 4 ? col : col2, col2: Theme.hex('ink') });
        const s = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), addMat('#ffffff', 1, { map: tex })); s.position.set(cx, cy, 0.37); slab.add(s); P.screens.push(s);
      }
      P.eye = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 0.1), red); P.eye.position.set(0, 0.9, 0.45); slab.add(P.eye);
      P.rings = [];
      for (let k = 0; k < 3; k++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(4.4 + k * 0.7, 0.04, 6, 96), basic(k === 1 ? col : col2, 2)); r.position.y = 4.4; r.rotation.order = 'YXZ'; root.add(r); P.rings.push(r);
      }
      P.cables = [];
      for (let c = 0; c < 4; c++) {
        const chain = [];
        for (let k = 0; k < 11; k++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.2 - k * 0.012, 8, 6), k % 3 === 0 ? red : basic(col2, 1.4));
          root.add(s); chain.push(s);
        }
        P.cables.push(chain);
      }
    }
    // shield dome used by every boss
    P.dome = new THREE.Group();
    const dg = new THREE.IcosahedronGeometry(1, 2);
    const domeMat = holoMat('#3ee6ff', 0.12); domeMat.uniforms.uCol.value.multiplyScalar(0.45);
    P.dome.add(new THREE.Mesh(dg, domeMat));
    P.dome.add(new THREE.LineSegments(new THREE.EdgesGeometry(dg, 1), lineMat('#3ee6ff', 0.9)));
    P.dome.visible = false; root.add(P.dome);
    // charge orb shown during an attack wind-up
    P.charge = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: bright('#ff4d5e', 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    P.charge.visible = false; root.add(P.charge);
    // stun halo of spinning glyphs
    P.stun = new THREE.Group(); root.add(P.stun);
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyph('?!#*?!%&'[k]), color: bright(Theme.hex('accent'), 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.scale.setScalar(0.5); P.stun.add(s);
    }
    scene.add(root);
    return { root, P, mats, art: b.art, src: b, col2 };
  }
  const BOSS_SCALE = { spam: 1.9, sign: 1.45, announcer: 1.6, press: 1.4, correction: 1.15 };
  const DOME = { spam: [0, 2.8, 2.6], sign: [0, 4.2, 3.4], announcer: [0, 3.9, 3.0], press: [0, 4.2, 3.5], correction: [0, 5.0, 4.4] };
  function animateBoss(a, b, t, dt, camPos) {
    const R = a.root, P = a.P;
    R.position.set(b.pos.x, b.pos.y, b.pos.z);
    R.lookAt(camPos.x, b.pos.y, camPos.z);
    let s = BOSS_SCALE[a.art];
    if (b.state === 'intro') s *= Math.min(1, 1.1 - b.introT / 2.6);
    if (b.state === 'dying') s *= 1 + (1 - b.dying / 2.2) * 0.2;
    R.scale.setScalar(Math.max(0.05, s));
    const windK = b.state === 'windup' ? 1 - b.timer / b.timerMax : 0;
    const stun = b.state === 'stun';
    for (const m of a.mats.holo) { m.uniforms.uTime.value = t; m.uniforms.uFlash.value = b.flash > 0 ? 0.15 : 0; }
    for (const m of a.mats.lines) {
      if (b.flash > 0) m.color.copy(m.userData.base).multiplyScalar(1.5);
      else if (stun) m.color.copy(m.userData.base).multiplyScalar(0.6);
      else if (windK > 0) m.color.copy(m.userData.base).lerp(new THREE.Color(3, 0.5, 0.6), windK * (CALM ? 0.8 : 0.65 + 0.35 * Math.sin(t * 6)));
      else m.color.copy(m.userData.base);
    }
    // jitter while hit, stunned, glitching or dying
    const jit = CALM ? 0 : (b.hitAnim > 0 ? 0.08 : 0) + (b.glitch > 0 ? 0.25 : 0) + (b.dying ? 0.12 : 0);
    if (jit) R.position.add(new THREE.Vector3((Math.random() - 0.5) * jit, (Math.random() - 0.5) * jit, 0));
    if (stun) R.rotateZ(Math.sin(t * 3) * 0.12);
    const atk = b.attackAnim > 0 ? b.attackAnim / 0.6 : 0;
    if (a.art === 'spam') {
      P.segs.forEach((g, i) => {
        const u = i / 12;
        const sway = Math.sin(t * 2.2 - i * 0.55) * (0.4 + u * 1.6);
        g.position.set(sway, 0.7 + Math.pow(1 - u, 1.6) * 2.4 + Math.sin(t * 1.5 - i * 0.4) * 0.2 + (i === 0 ? windK * 0.35 : 0), i * 0.85 * -1 + (i === 0 ? atk * 2 : 0));
        g.rotation.set(-0.2 * (1 - u) - (i === 0 ? windK * 0.6 : 0), Math.cos(t * 2.2 - i * 0.55) * 0.3, Math.sin(t * 2 - i) * 0.1);
      });
      P.jaw.rotation.x = windK * 0.8 + atk * 0.9 + (b.state === 'barrage' ? Math.abs(Math.sin(t * 10)) * 0.5 : 0);
    } else if (a.art === 'sign') {
      P.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 2.6 + i * 1.6) * 0.25; l.rotation.z = Math.sin(t * 2.6 + i * 1.6 + 1) * 0.08; });
      P.board.position.y = 4.4 + Math.sin(t * 5.2) * 0.12 + windK * 0.6 - atk * 2.2;
      P.board.rotation.x = -windK * 0.35 + atk * 0.6;
      P.face.material.opacity = 1;
      const want = b.state === 'fixsign' && b.signText ? b.signText : 'NODLES';
      if (P.faceText !== want) { P.faceText = want; P.face.material.map.dispose(); P.face.material.map = signTex(want, a.col2 || '#ff5f9e', { size: want.length > 8 ? 120 : 190 }); P.face.material.needsUpdate = true; }
      P.eye.scale.setScalar(1 + windK * 1.5);
    } else if (a.art === 'announcer') {
      P.ring.rotation.z = t * (0.6 + windK * 6);
      const pulse = 1 + Math.sin(t * 14) * 0.06 + windK * 0.25;
      P.cones.forEach((c, i) => { const m = b.speakers && b.speakers[i] && b.speakers[i].muted; c.scale.setScalar(m ? 0.6 : pulse); c.visible = true; c.children.forEach(ch => { if (ch.material && ch.material.uniforms) ch.material.uniforms.uAlpha.value = m ? 0.25 : 1; }); });
      P.core.rotation.set(t * 0.4, t * 0.7, 0);
      P.heart.scale.setScalar(1 + windK * 0.8 + Math.sin(t * 8) * 0.08);
      P.ticker.material.map.offset.x = -t * 0.08;
      P.ticker.position.y = 5.2 + Math.sin(t * 2) * 0.15;
      R.position.y += Math.sin(t * 1.3) * 0.4 + 0.6;
      P.waves.forEach((w, i) => {
        const k = ((t * 1.2 + i / 3) % 1);
        w.visible = windK > 0 || b.state === 'barrage';
        w.scale.setScalar(1 + k * 5); w.material.opacity = 1 - k;
      });
    } else if (a.art === 'press') {
      P.head.position.y = 4.6 + windK * 1.8 - atk * 3.4 + (b.state === 'stun' ? -2.2 : 0) + Math.sin(t * 2) * 0.1;
      P.eyes.forEach(e => e.material.color.copy(bright((b.heat || 0) >= 2 ? '#f2c230' : '#ff4d5e', 2 + (b.heat || 0) * 0.5)));
      P.eyes.forEach(e => e.scale.x = 1 + windK);
    } else if (a.art === 'correction') {
      P.slab.position.y = 4.4 + Math.sin(t * 0.9) * 0.25;
      P.eye.visible = true; P.eye.material.color.copy(bright('#ff4d5e', stun ? 1.2 : 3));
      P.eye.scale.x = 1 + windK * 0.6;
      // tilted orbits that stay low enough to keep clear of the boss bar
      P.rings.forEach((r, i) => { r.rotation.set(1.15 + i * 0.12 + Math.sin(t * 0.35 + i * 2) * 0.22, t * (0.3 + i * 0.2) + i * 2, 0); });
      
      P.cables.forEach((chain, c) => {
        const sx = c < 2 ? -1 : 1, hi = c % 2;
        chain.forEach((s, k) => {
          const u = k / 10;
          const reach = windK * 1.5 + atk * 3;
          s.position.set(sx * (2.9 + u * (2.5 + Math.sin(t * 1.4 + c + u * 3) * 0.8)), 6 - hi * 2.8 - u * 3 + Math.sin(t * 2 + c * 2 + u * 5) * 0.5, u * (1.5 + reach));
        });
      });
    }
    // shield, charge orb, stun halo
    const [dx, dy, dr] = DOME[a.art];
    P.dome.visible = !!b.shield; P.dome.position.set(dx, dy, 0); P.dome.scale.setScalar(dr * (1 + Math.sin(t * 6) * 0.015)); P.dome.rotation.y = t * 0.3;
    P.charge.visible = windK > 0;
    if (windK > 0) { P.charge.position.set(0, dy, 1.6); P.charge.scale.setScalar(0.6 + windK * 3 + Math.sin(t * 40) * 0.2); }
    P.stun.visible = stun;
    if (stun) P.stun.children.forEach((s, i) => { const ang = t * 2.5 + i / 8 * Math.PI * 2; s.position.set(Math.cos(ang) * 2.2, dy + 1.8 + Math.sin(ang * 2) * 0.2, Math.sin(ang) * 2.2); });
    R.visible = true;
  }

  // Hits, attacks and the death of a boss as events: a hit lights the core with sparks and a ring,
  // an attack going off throws a red flash and a floor shock, and a dying boss breaks up in a chain
  // of blasts across its body that ends in one big one.
  function bossFx(a, b, core, dt, col, col2) {
    if (!core) core = b.pos;
    const S = a.fx || (a.fx = { flash: 0, atk: 0, boomT: 0, last: false });
    if (b.flash > S.flash + 0.01) {
      flash(core, '#ffffff', 2.2, 0.1, 1); flash(core, col, 3.6, 0.25, 1.2);
      if (!CALM) sparks(core, col2, 10, 1.6);
      ring(core, col, 1.2);
    }
    S.flash = b.flash || 0;
    const atk = b.attackAnim || 0;
    if (atk > S.atk + 0.01 && atk > 0.3) {
      flash(core, '#ff4d5e', 4.5, 0.3, 1.5);
      shock(b.pos, '#ff4d5e', 3);
    }
    S.atk = atk;
    if (b.state === 'dying' && b.dying > 0) {
      S.boomT -= dt;
      const sc = BOSS_SCALE[a.art] || 1;
      if (S.boomT <= 0) {
        S.boomT = 0.13 + Math.random() * 0.1;
        const p = { x: core.x + (Math.random() - 0.5) * 6 * sc, y: core.y + (Math.random() - 0.6) * 5 * sc, z: core.z + (Math.random() - 0.5) * 3 * sc };
        burst(p, '', Math.random() < 0.5 ? col : col2, 1.2);
      }
      if (b.dying < 0.25 && !S.last) {
        S.last = true;
        flash(core, '#ffffff', 9, 0.5, 1.6); flash(core, col, 14, 0.9, 1.3);
        shock(b.pos, col, 5); shock(b.pos, col2, 3.4);
        if (!CALM) sparks(core, '#ffffff', 40, 2.6);
      }
    }
  }

  // ---------- per frame ----------
  const tmpV = () => new THREE.Vector3();
  let lastT = 0;
  let CALM = true;
  function frame(st) {
    if (!ready) return;
    CALM = !!st.calm;

    bloom.strength = CALM ? 0.34 : 0.42;
    const { t, dt } = st;
    DARK = st.dark || 0;
    shotPos ||= new THREE.Vector3();
    shotI = Math.max(0, shotI - dt * 1.6);
    if (scene.fog) scene.fog.density = 0.011 + 0.03 * DARK;
    lastT = t;
    // camera
    const sh = st.shake * 0.35;
    camera.position.set(st.cam.pos.x + (Math.random() - 0.5) * sh, st.cam.pos.y + (Math.random() - 0.5) * sh, st.cam.pos.z + (Math.random() - 0.5) * sh);
    camera.lookAt(st.cam.look.x, st.cam.look.y, st.cam.look.z);
    // a wider lens in boss fights keeps the boss under the title and the boss bar
    const wantFov = st.boss ? BOSS_FOV : 66;
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 2.5 || 1); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    // level animation
    if (lv) {
      for (const m of lv.mats) {
        m.uniforms.uTime.value = t; m.uniforms.uCam.value.copy(camera.position);
        m.uniforms.uDark.value = DARK; m.uniforms.uShot.value.copy(shotPos); m.uniforms.uShotI.value = shotI * (0.3 + 0.7 * DARK);
      }
      lv.streamMats.forEach(m => { m.opacity = 1 - DARK * 0.85; });
      lv.sky.position.copy(camera.position);
      // bridge tiles fall away one after another, the far end last
      for (const [i, tl] of lv.tiles.entries()) {
        if (!tl.s.bridge.fallen) continue;
        tl.delay += dt;
        if (tl.delay < i * 0.12) continue;
        tl.vy -= 14 * dt;
        for (const m of tl.parts) { m.position.y += tl.vy * dt; m.rotation.x += tl.spin * dt; m.rotation.z += tl.spin * 0.6 * dt; m.visible = tl.delay < i * 0.12 + 2.5; }
      }
      // the elevator disc rides with the camera
      for (const lf of lv.lifts) {
        const near = Math.hypot(camera.position.x - lf.e.x, camera.position.z - lf.e.z) < lf.e.r;
        const want = near ? Math.max(lf.e.bottom, Math.min(lf.e.top, st.cam.pos.y - 1.7)) : (st.cam.pos.y > lf.e.top - 1 ? lf.e.top : lf.e.bottom);
        lf.g.position.y = want;
      }
      lv.streamMats.forEach(m => { m.map.offset.y = t * m.userData.sp; });
      lv.streams.forEach(m => { m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z); });
      // every sign and text panel turns to the camera so its text never reads backwards
      lv.faceCam.forEach(m => m.rotation.set(0, Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z), 0));
      lv.panels.forEach(m => { m.position.y = m.userData.base + Math.sin(t * 0.8 + m.userData.seed) * 0.25; m.material.opacity = 0.9; });
      for (const g of lv.gates) {
        const open = g.src.open || 0;
        g.panels.forEach(p => { p.m.position.x = p.s * (3.05 + open * 6.2); p.m.material.opacity = g.src.state === 'forced' ? 0.45 : 0.85; });
        g.lock.visible = open < 0.9;
        g.lock.material.opacity = CALM ? 0.9 : 0.75 + Math.sin(t * 4) * 0.2;
      }
      const P = lv.props;
      for (const p of P.spin) {
        if (p.bob) p.m.position.y += Math.sin(t * 1.2 + p.m.id) * 0.004 * p.bob;
        if (p.rot) p.m.rotation.y += dt * p.rot;
        if (p.rotY) p.m.rotation.y += dt * p.rotY;
        if (p.rotX) p.m.rotation.x += dt * p.rotX;
        if (p.flicker) p.m.material.opacity = CALM ? 0.95 : 0.85 + Math.sin(t * 2 + p.m.id) * 0.12;
        if (p.blink !== undefined) p.m.visible = Math.sin(t * 3 + p.blink) > -0.3;
      }
      for (const p of P.move) {
        const wrap = p.wrap || 400;
        p.m.position[p.axis] = p.base + (((t * p.sp + (p.off || 0)) % wrap) - wrap / 2);
      }
      if (P.holo) P.holo.forEach(m => { m.uniforms.uTime.value = t; });
    }
    // actors
    const live = new Set();
    const camPos = camera.position;
    const col2 = lv ? lv.src.color2 : Theme.hex('accent');
    for (const f of st.foes) {
      live.add(f);
      let a = actors.get(f);
      if (a && a.disguised && f.revealed) { scene.remove(a.root); disposeTree(a.root); a = null; }
      if (!a) {
        a = makeFoe(f, col2); actors.set(f, a);
        // it beams in: a flash where it lands and a ring on the floor under it
        if (!f.revealed && f.type !== 'burrower' && t - (f.born || 0) < 0.5) { flash(f.pos, col2, 1.6, 0.3, 1.2); shock(f.pos, col2, 0.45); }
      }
      f.cloakVis = st.cloak ? st.cloak(f) : 1;
      animateFoe(a, f, t, camPos, st.target === f);
    }
    for (const b of st.barriers || []) {
      if (b.done) continue;
      live.add(b);
      let a = actors.get(b);
      if (!a) { a = makeBarrier(); actors.set(b, a); }
      a.root.position.set(b.pos.x, b.pos.y - 2.4, b.pos.z);
      a.root.lookAt(camPos.x, b.pos.y - 2.4, camPos.z);
      a.panel.material.opacity = CALM ? 0.8 : 0.7 + Math.sin(t * 3) * 0.1;
    }
    if (st.train) {
      if (!train) train = makeTrain();
      const p = st.train.pos, f = st.train.fwd;
      train.position.set(p.x, p.y - 1.7, p.z); train.rotation.y = Math.atan2(f.x, f.z);
    } else if (train) { scene.remove(train); disposeTree(train); train = null; }
    for (const p of st.projs) {
      live.add(p);
      let a = actors.get(p);
      if (!a) {
        a = makeProj(); actors.set(p, a);
        // a new enemy shot: a red muzzle flash where it left
        flash(p.pos, '#ff4d5e', 1.4, 0.22, 1.2); ring(p.pos, '#ff4d5e', 0.5);
      }
      a.root.position.set(p.pos.x, p.pos.y, p.pos.z);
      a.root.lookAt(camPos);
      a.root.children[0].rotation.z = a.root.children[1].rotation.z = a.root.children[2].rotation.z = t * 6 + a.spin;
      a.shell.material.uniforms.uTime.value = t;
      a.shell.material.uniforms.uFlash.value = st.target === p ? 0.4 : 0;
    }
    for (const p of st.pickups) {
      live.add(p);
      let a = actors.get(p);
      if (!a) { a = makePickup(p); actors.set(p, a); }
      a.root.position.set(p.pos.x, p.pos.y + Math.sin(t * 3 + p.seed) * 0.12, p.pos.z);
      a.root.lookAt(camPos);
      a.chip.rotation.y = Math.sin(t * 2 + p.seed) * 0.5;
      a.halo.rotation.z = t * 1.5;
      a.root.visible = p.life > 2 || Math.floor(t * 8) % 2 === 0;
    }
    for (const r of st.rush) {
      live.add(r);
      let a = actors.get(r);
      if (!a) { a = makeSpark(); actors.set(r, a); }
      a.root.position.set(r.pos.x, r.pos.y, r.pos.z);
      a.root.scale.setScalar(0.6 + Math.sin(t * 12 + r.pos.x) * 0.2);
    }
    for (const [obj, a] of actors) {
      if (!live.has(obj)) {
        scene.remove(a.root);
        if (a.extra) a.extra.forEach(o => { scene.remove(o); if (o.material) o.material.dispose(); });
        a.root.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.dispose()); if (o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); });
        actors.delete(obj);
      }
    }
    // boss
    if (st.boss) {
      if (!bossA || bossA.src !== st.boss) { removeBoss(); bossA = makeBoss(st.boss, lv ? lv.src.color : Theme.hex('accent'), col2); }
      animateBoss(bossA, st.boss, t, dt, camPos);
      bossFx(bossA, st.boss, st.bossCore, dt, lv ? lv.src.color : Theme.hex('accent'), col2);
    } else removeBoss();
    // muzzle light and particles
    muzzle = Math.max(0, muzzle - dt);
    updateGun(st, dt);
    updateMotes(t);
    updateParticles(dt);
    post.uniforms.time.value = t;
    post.uniforms.hurt.value = Math.min(1, st.hurt * 1.4);
    post.uniforms.glitch.value = Math.min(1, st.glitch * 1.6);
    post.uniforms.slow.value = st.slow || st.freeze ? 1 : 0;
    composer.render(dt);
  }
  function removeBoss() {
    if (!bossA) return;
    scene.remove(bossA.root); disposeTree(bossA.root); bossA = null;
  }

  // Screen position of a world point on the 960 x 540 HUD canvas.
  const pv = { v: null };
  function project(p) {
    if (!ready) return { x: W / 2, y: H / 2, behind: false };
    pv.v ||= new THREE.Vector3();
    const v = pv.v.set(p.x, p.y, p.z);
    const camSpace = v.clone().applyMatrix4(camera.matrixWorldInverse);
    v.project(camera);
    let x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
    const behind = camSpace.z > -0.2;
    if (behind) { x = W - x; y = H - 60; }
    return { x, y, behind };
  }

  function dispose() {
    if (!renderer) return;
    for (const [, a] of actors) { scene.remove(a.root); disposeTree(a.root); }
    actors.clear();
    removeBoss(); clearLevel();
    disposeTree(scene);
    Object.values(G).forEach(g => g.dispose()); for (const k in G) delete G[k];
    Object.values(glyphs).forEach(t => t.dispose()); for (const k in glyphs) delete glyphs[k];
    if (_dot) { _dot.dispose(); _dot = null; }
    bloom.dispose(); composer.dispose && composer.dispose();
    renderer.dispose(); renderer.forceContextLoss();
    renderer = null; ready = false; lv = null;
    voxData = []; letters = []; rings = []; beams = []; flashes.length = 0; shocks.length = 0; gun = null; motes = null;
  }

  return { init, resize, setLevel, frame, project, burst, beam, ring, setFloor, dispose, get ready() { return ready; }, get _dbg() { return { beams, flashes, gun, info: renderer && renderer.info }; } };
})();
