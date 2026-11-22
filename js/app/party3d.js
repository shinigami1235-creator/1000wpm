// The party run in three.js: one creature set per fight kind, all built from glowing
// blocks in code. hydra (three necks on a mound), swarm (the Cache Wraith and its mites),
// snake (the Null Conductor's train of word cars), golem (a block giant with a core
// that opens) and twins (Syntax, a crystal, and Echo, its wire ghost).
// The team is not drawn here: the team cards sit under the canvas and lane(id) says
// where each one is, so shots leave from a card and attacks land on one.
//
//   const sc = PartyScene.mount(host, { lane: id => ({ x, y }) | null, now: () => netMs, color: id => '#hex', onImpact(h, x, y) })
//   sc.setFight({ kind, look, foes })   build the creatures for a fight
//   sc.sync(state)                      every paint: foes, HP, the attack being wound up, the core, relink clock
//   sc.shot({ id, foe, dmg, tier, crit, you })   a word from a player's card to a foe; onImpact on landing
//   sc.cast(spellId, { from, foe, hits, effect })  a spell from the combat layer
//   sc.attackLands({ id, target }) / sc.block({ id, by }) / sc.chip({ from, targets, what })
//   sc.foeGone(id, how)  how: kill | pop | bite | cut     sc.regrow(id)   sc.down(id)   sc.heal(id)   sc.shield(id)
//   sc.clear()  the fight is won     sc.anchors() -> Map(foeId -> { x, y, on }) in host pixels, for word labels
//   sc.dispose()
window.PartyScene = (() => {
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

  function mount(host, opts = {}) {
    let impl = null, gone = false, fight = null, last = null;
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP]) => {
        if (gone) return false;
        impl = build(host, opts, THREE, EC.EffectComposer, RP.RenderPass, UB.UnrealBloomPass, OP.OutputPass);
        if (fight) impl.setFight(fight);
        if (last) impl.sync(last);
        return true;
      }),
      setFight: f => { fight = f; if (impl) impl.setFight(f); },
      sync: st => { last = st; if (impl) impl.sync(st); },
      shot: h => { if (impl && impl.live()) impl.shot(h); else if (opts.onImpact) opts.onImpact(h, null, null); },
      cast: (id, c) => impl && impl.cast(id, c),
      attackLands: a => impl && impl.attackLands(a),
      block: b => impl && impl.block(b),
      chip: c => impl && impl.chip(c),
      foeGone: (id, how) => impl && impl.foeGone(id, how),
      regrow: id => impl && impl.regrow(id),
      down: id => impl && impl.down(id),
      heal: id => impl && impl.heal(id),
      shield: id => impl && impl.shield(id),
      clear: () => impl && impl.clear(),
      anchors: () => (impl ? impl.anchors() : new Map()),
      info: () => (impl ? impl.info() : null),
      dispose: () => { gone = true; if (impl) impl.dispose(); impl = null; },
    };
    return ctl;
  }

  function build(host, opts, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
    const V = THREE.Vector3;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let calm = true;
    try { const s = JSON.parse(localStorage.getItem('wpm-breach-settings') || '{}'); calm = reduce || s.reduceFlash !== false; } catch (e) {}
    const still = reduce ? 0.3 : 1;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const nowS = () => performance.now() / 1000;
    const RED = C('#ff4d5e'), WHITE = C('#ffffff'), GOLD = C('#ffd24d'), HEAL = C('#7dffb0'), SHIELD = C('#7ad7ff');

    const flashes = [];
    function canFlash() {
      const t = performance.now();
      while (flashes.length && t - flashes[0] > 1000) flashes.shift();
      if (flashes.length >= (calm ? 2 : 3)) return false;
      flashes.push(t); return true;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#010503');
    scene.fog = new THREE.Fog('#010503', 34, 80);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.16);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---------- palettes, one per area ----------
    const PALS = [
      { bg: '#010503', a: '#39ff88', b: '#1f9e57', c: '#3ee6ff', eye: '#ff4d5e' },   // relay: the hydra
      { bg: '#070401', a: '#f2b330', b: '#8f5f13', c: '#ff6a3d', eye: '#fff2c4' },   // market: the wraith
      { bg: '#01060a', a: '#3ee6ff', b: '#147d8f', c: '#39ff88', eye: '#ffffff' },   // transit: the train
      { bg: '#0a0402', a: '#ff7a3d', b: '#8f3a13', c: '#ffd24d', eye: '#ffd24d' },   // firmware: the golem
      { bg: '#07010a', a: '#ff4dd8', b: '#7a1f6e', c: '#3ee6ff', eye: '#ffffff' },   // core: the twins
      { bg: '#0a0300', a: '#ffb02e', b: '#8a4a0c', c: '#ff5a2e', eye: '#fff2c4' },   // foundry: golem and mites
      { bg: '#04020b', a: '#a98bff', b: '#4b3a8f', c: '#5dffd2', eye: '#ffffff' },   // mirror: twins and mites
      { bg: '#030801', a: '#b6ff3d', b: '#4f7a12', c: '#3ee6ff', eye: '#ffffff' },   // junction: train and mites
    ];
    let pal = PALS[0];

    // ---------- shared pieces ----------
    const T = { value: 0 };
    const EDGE_V = 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }';
    const EDGE_F = `uniform vec3 uCol; uniform float uHit; uniform float uTime; uniform float uOp; uniform float uFill; uniform float uSeed;
      varying vec2 vUv; varying float vD;
      void main(){
        vec2 d = min(vUv, 1.0 - vUv);
        float edge = 1.0 - smoothstep(0.0, 0.085, min(d.x, d.y));
        float scan = 0.5 + 0.5 * sin(vUv.y * 28.0 + uTime * 4.0 + uSeed * 20.0);
        vec3 col = mix(uCol, vec3(1.0), uHit * 0.55);
        vec3 c = vec3(0.004, 0.008, 0.007) + col * uFill * (0.05 + 0.06 * scan) + col * edge * (1.0 + uHit * 1.4);
        c = mix(c, vec3(0.0), smoothstep(45.0, 85.0, vD) * 0.8);
        gl_FragColor = vec4(c, uOp);
      }`;
    function edgeMat(col, fill = 1, op = 1) {
      return new THREE.ShaderMaterial({
        uniforms: { uCol: { value: C(col) }, uHit: { value: 0 }, uTime: T, uOp: { value: op }, uFill: { value: fill }, uSeed: { value: Math.random() } },
        vertexShader: EDGE_V, fragmentShader: EDGE_F, transparent: true, depthWrite: op >= 1,
      });
    }
    const geoCache = new Map();
    function boxGeo(w, h, d) { const k = `${w}|${h}|${d}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); }
    function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(boxGeo(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
    const glowMatFor = col => new THREE.MeshBasicMaterial({ color: C(col, 1.6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
    { const c = glowCv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
    const glowTex = new THREE.CanvasTexture(glowCv);

    // ---------- the arena ----------
    const codeCv = document.createElement('canvas'); codeCv.width = codeCv.height = 512;
    {
      const c = codeCv.getContext('2d'); c.font = '20px monospace';
      const CH = '01{}[]<>/=+*#$abcdef';
      for (let x = 0; x < 512; x += 16) for (let y = 0; y < 512; y += 22) if (Math.random() < 0.5) { c.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.9).toFixed(2)})`; c.fillText(CH[Math.floor(Math.random() * CH.length)], x, y); }
    }
    const codeTex = new THREE.CanvasTexture(codeCv); codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping; codeTex.repeat.set(7, 3);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(150, 60), new THREE.MeshBasicMaterial({ map: codeTex, transparent: true, opacity: 0.16, depthWrite: false, fog: false }));
    wall.position.set(0, 20, -42); scene.add(wall);
    const grid = new THREE.GridHelper(160, 80, '#ffffff', '#ffffff');
    grid.material.transparent = true; grid.material.opacity = 0.28; scene.add(grid);
    const pillarMat = edgeMat('#1f9e57', 0.35);
    const pillars = [];
    for (let k = 0; k < 18; k++) {
      const side = k % 2 ? 1 : -1, h = rnd(6, 22);
      const m = box(scene, rnd(1.6, 3.2), h, rnd(1.6, 3.2), pillarMat, side * rnd(16, 40), h / 2, -rnd(20, 44));
      pillars.push(m);
    }
    const floorRing = new THREE.Mesh(new THREE.RingGeometry(9, 9.12, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    floorRing.rotation.x = -Math.PI / 2; floorRing.position.set(0, 0.02, -3); scene.add(floorRing);

    // ---------- particles, rings and strips ----------
    const PN = 260;
    const parts = Array.from({ length: PN }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false; scene.add(s);
      return { s, v: new V(), life: 0, max: 1, size: 0.3, grav: 6 };
    });
    let pI = 0;
    function burst(at, n, speed, col, o = {}) {
      if (reduce) n = Math.ceil(n / 3);
      for (let k = 0; k < n; k++) {
        const p = parts[pI = (pI + 1) % PN];
        p.s.material.color.copy(col).multiplyScalar(o.k || 1.6);
        p.s.position.copy(at);
        p.v.set(rnd(-1, 1), rnd(-0.5, 1) + (o.up || 0), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.3, 1));
        p.size = (o.size || 0.28) * rnd(0.6, 1.4); p.max = p.life = (o.life || 0.6) * rnd(0.7, 1.2); p.grav = o.grav ?? 6;
        p.s.visible = true;
      }
    }
    const rings = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      return { m, t: 0, life: 0.5, r: 3 };
    });
    let rI = 0;
    function ring(at, col, r = 3, life = 0.5) {
      const w = rings[rI = (rI + 1) % rings.length];
      w.m.position.set(at.x, 0.05, at.z); w.m.material.color.copy(col); w.t = 0; w.life = life; w.r = r; w.m.visible = true;
    }
    const _bx = new V(), _by = new V(), _bz = new V(), _mid = new V(), _bm = new THREE.Matrix4();
    function strip(mesh, a, b, width, op) {
      _bx.subVectors(b, a);
      const len = _bx.length();
      if (len < 1e-3 || width <= 0 || op <= 0.01) { mesh.visible = false; return; }
      _bx.divideScalar(len);
      _mid.addVectors(a, b).multiplyScalar(0.5);
      _bz.subVectors(camera.position, _mid).normalize();
      _by.crossVectors(_bz, _bx).normalize(); _bz.crossVectors(_bx, _by);
      _bm.makeBasis(_bx, _by, _bz); mesh.quaternion.setFromRotationMatrix(_bm);
      mesh.position.copy(_mid); mesh.scale.set(len, width, 1);
      mesh.material.opacity = op; mesh.visible = true;
    }
    const stripCv = document.createElement('canvas'); stripCv.width = 4; stripCv.height = 32;
    { const c = stripCv.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 4, 32); }
    const stripTex = new THREE.CanvasTexture(stripCv);
    const mkStrip = () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: stripTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.visible = false; scene.add(m); return m; };
    // aim lines for the attack being wound up, one per target
    const aims = Array.from({ length: 4 }, mkStrip);
    const aimRings = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m;
    });
    // short bolts for chip hits and heals
    const bolts = Array.from({ length: 10 }, () => ({ m: mkStrip(), t: 1, life: 0.3, a: new V(), b: new V(), col: new THREE.Color(), w: 0.3 }));
    let boI = 0;
    function bolt(a, b, col, life = 0.32, w = 0.35) { const x = bolts[boI = (boI + 1) % bolts.length]; x.a.copy(a); x.b.copy(b); x.col.copy(col); x.t = 0; x.life = life; x.w = w; x.m.material.color.copy(col); }

    // ---------- combat effects (tier shots and spells) ----------
    let shake = 0, hitStop = 0;
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm, reduce, pixelHeight: () => renderer.domElement.height,
      juice: { shake: k => { shake = Math.max(shake, k); }, stop: ms => { hitStop = Math.max(hitStop, performance.now() + ms); }, glitch: () => {}, dim: () => {}, tint: () => {}, canFlash },
    }) : null;

    // ---------- camera and the team line ----------
    const camBase = new V(0, 6.2, 23), camLook = new V(0, 4.6, -1);
    let teamZ = 9;
    let W = 600, H = 400;
    const laneCache = new Map();
    function fit() {
      const w = host.clientWidth || 600, h = host.clientHeight || 400;
      W = w; H = h; laneCache.clear();
      renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      const half = THREE.MathUtils.degToRad(21);
      const dist = Math.max(21, 11 / (Math.tan(half) * camera.aspect));
      camBase.set(0, 6.2, dist);
      camera.position.copy(camBase); camera.lookAt(camLook); camera.updateProjectionMatrix();
      teamZ = clamp(dist - 12, 7, 14);
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);
    fit();
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new V(0, 0, 1), 0);
    // a player's card on the floor line in front of the camera
    // the host's size comes from fit(), and each lane is worked out once a frame: reading the
    // page's layout here, several times a frame, made the browser lay the page out again each time
    function laneAt(id, out) {
      const hit = laneCache.get(id);
      if (hit) return out.copy(hit);
      const L = opts.lane ? opts.lane(id) : null;
      const w = W, h = H;
      const x = L ? L.x : w / 2, y = h * 0.96;
      ndc.set(x / w * 2 - 1, -(y / h * 2 - 1));
      ray.setFromCamera(ndc, camera);
      plane.constant = -teamZ;
      if (!ray.ray.intersectPlane(plane, out)) out.set(0, 0.5, teamZ);
      out.y = Math.max(0.4, out.y);
      laneCache.set(id, out.clone());
      return out;
    }
    const colorOf = id => C(opts.color ? opts.color(id) : '#39ff88');

    // ---------- creatures ----------
    let cre = null, kind = '', foes = new Map(), st = null, deadAt = -9;
    const holder = new THREE.Group(); scene.add(holder);
    const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V();
    const bez = (a, c, b, u, out) => out.set(
      (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
      (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
      (1 - u) * (1 - u) * a.z + 2 * (1 - u) * u * c.z + u * u * b.z);

    function hydra() {
      const g = new THREE.Group();
      const bodyMat = edgeMat(pal.b, 1);
      const body = new THREE.Group(); body.position.set(0, 0, -3.2); g.add(body);
      box(body, 6, 2.2, 4.6, bodyMat, 0, 1.1, 0);
      box(body, 4.2, 1.6, 3.4, bodyMat, 0, 2.9, -0.2);
      box(body, 2.4, 1.6, 2.2, bodyMat, -3.4, 0.8, 0.6);
      box(body, 2.4, 1.6, 2.2, bodyMat, 3.4, 0.8, 0.6);
      for (let k = 0; k < 5; k++) { const s = box(body, 0.5, 1.4, 0.5, bodyMat, -2 + k, 4, -1.2); s.rotation.z = (k - 2) * 0.18; s.rotation.x = -0.4; }
      const tail = []; for (let k = 0; k < 7; k++) tail.push(box(body, 1 - k * 0.1, 0.8 - k * 0.07, 1.1, bodyMat, 0, 0.6, -3 - k));
      const REST = [new V(-5.4, 6.2, 0.6), new V(0, 8.3, -0.6), new V(5.4, 6.2, 0.6)];
      const heads = [0, 1, 2].map(i => {
        const mat = edgeMat(pal.a, 1);
        const base = new V(-1.6 + 1.6 * i, 3.4, -2.6);
        const neck = Array.from({ length: 13 }, (_, k) => box(g, 1.3 - k * 0.03, 1.3 - k * 0.03, 1.3 - k * 0.03, mat));
        const head = new THREE.Group(); head.scale.setScalar(1.45); g.add(head);
        box(head, 1.6, 1.1, 2.1, mat, 0, 0.1, 0);
        box(head, 1.15, 0.6, 1.1, mat, 0, 0.05, 1.45);
        const jaw = new THREE.Group(); jaw.position.set(0, -0.35, -0.6); head.add(jaw);
        box(jaw, 1.25, 0.35, 2.3, mat, 0, -0.1, 1.15);
        const eyeMat = glowMatFor(pal.eye);
        box(head, 0.28, 0.18, 0.2, eyeMat, -0.5, 0.35, 0.95); box(head, 0.28, 0.18, 0.2, eyeMat, 0.5, 0.35, 0.95);
        for (let k = 0; k < 3; k++) { const c = box(head, 0.18, 0.7, 0.5, mat, 0, 0.8, -0.6 + k * 0.5); c.rotation.x = -0.5; }
        return { i, mat, base, neck, head, jaw, eyeMat, pos: new V().copy(REST[i]), rest: REST[i], alive: true, fall: 0, charge: 0, lunge: 0, lungeTo: new V(), bite: 0, gone: false };
      });
      holder.add(g);
      const byFoe = id => { const f = foes.get(id); return f ? heads[f.slot] : null; };
      return {
        g, heads,
        anchor(id, out) { const h = byFoe(id); if (!h) return null; return out.copy(h.head.position).add(v4.set(0, 1.5, 0)); },
        hitPos(id, out) { const h = byFoe(id); return h ? out.copy(h.head.position) : out.set(0, 4, -3); },
        hit(id, k) { const h = byFoe(id); if (h) h.mat.uniforms.uHit.value = Math.min(1.5, h.mat.uniforms.uHit.value + k); },
        charge(id, k) { const h = byFoe(id); if (h) h.charge = k; },
        lunge(id, at) { const h = byFoe(id); if (h) { h.lunge = 1; h.lungeTo.copy(at); } },
        gone(id) { const h = byFoe(id); if (h) { h.alive = false; burst(h.head.position, 30, 8, pal.a, { up: 0.5 }); } },
        regrow(id) { const h = byFoe(id); if (h) { h.alive = true; h.mat.uniforms.uHit.value = 1.5; } },
        update(dt, t) {
          tail.forEach((m, k) => { m.position.x = Math.sin(t * 1.6 - k * 0.6) * 0.5 * k * 0.3 * still; });
          for (const h of heads) {
            const f = [...foes.values()].find(x => x.slot === h.i);
            if (f) { h.gone = !f.alive && !f.regrowAt; if (f.alive) h.alive = true; }
            h.fall += ((h.alive ? 0 : 1) - h.fall) * Math.min(1, dt * (h.alive ? 3 : 2.2));
            h.lunge = Math.max(0, h.lunge - dt * 2.6);
            h.bite = Math.max(0, h.bite - dt * 3);
            const sway = still * (1 - h.fall);
            h.pos.set(h.rest.x + Math.sin(t * 0.9 + h.i * 2.1) * 0.7 * sway, h.rest.y + Math.sin(t * 1.3 + h.i) * 0.4 * sway - h.charge * -1.2, h.rest.z + Math.cos(t * 0.7 + h.i) * 0.4 * sway - h.charge * 1.6);
            if (h.lunge > 0) h.pos.lerp(h.lungeTo, Math.sin(h.lunge * Math.PI) * 0.55);
            // a fallen head lies on the floor in front of the body
            v1.set(h.rest.x * 0.9, 0.7, 1.6 + h.i % 2);
            h.pos.lerp(v1, smooth(h.fall));
            h.head.position.copy(h.pos);
            v2.set(h.pos.x * 0.3, h.fall > 0.5 ? 0 : 2, 20);
            h.head.lookAt(v2);
            h.head.rotation.z += Math.sin(t * 2 + h.i) * 0.06 * sway;
            h.jaw.rotation.x = 0.15 + h.charge * 0.6 + Math.sin(h.lunge * Math.PI) * 0.5 + h.fall * 0.5;
            v3.set((h.base.x + h.pos.x) / 2, h.pos.y + 1.4 - h.fall * 2, (h.base.z + h.pos.z) / 2 - 0.6);
            h.neck.forEach((m, k) => { bez(h.base, v3, h.pos, (k + 1) / (h.neck.length + 1), m.position); m.visible = !h.gone || k < 4; });
            h.head.visible = !h.gone;
            h.mat.uniforms.uOp.value = 1;
            h.mat.uniforms.uFill.value = 1 - h.fall * 0.7;
            h.mat.uniforms.uCol.value.set(pal.a).lerp(RED, h.charge);
            if (!h.alive) h.mat.uniforms.uCol.value.multiplyScalar(0.35);
            h.mat.uniforms.uHit.value = Math.max(0, h.mat.uniforms.uHit.value - dt * 4);
            h.eyeMat.opacity = h.alive ? 1 : 0.15;
          }
        },
      };
    }

    function swarm() {
      const g = new THREE.Group();
      const qMat = edgeMat(pal.a, 0.8), qGlow = glowMatFor(pal.c);
      const queen = new THREE.Group(); queen.scale.setScalar(1.7); queen.position.set(0, 7, -6); g.add(queen);
      const hood = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.8, 6, 1, true), new THREE.MeshBasicMaterial({ color: C(pal.a, 1.2), wireframe: true, transparent: true, opacity: 0.8 }));
      hood.position.y = 0.4; queen.add(hood);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.4, 6, 1, true), new THREE.MeshBasicMaterial({ color: C(pal.b, 0.6), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      inner.position.y = 0.4; queen.add(inner);
      const face = box(queen, 1.6, 1.1, 0.4, qMat, 0, -0.4, 1.3);
      const eyes = [box(queen, 0.36, 0.14, 0.1, qGlow, -0.4, -0.3, 1.55), box(queen, 0.36, 0.14, 0.1, qGlow, 0.4, -0.3, 1.55)];
      const arms = [-1, 1].map(s => {
        const a = new THREE.Group(); a.position.set(s * 1.9, -1, 0.6); queen.add(a);
        for (let k = 0; k < 4; k++) box(a, 0.4, 0.4, 0.9, qMat, s * k * 0.35, -k * 0.45, k * 0.7);
        return a;
      });
      const cache = Array.from({ length: 12 }, (_, k) => box(queen, 0.7, 0.7, 0.7, qMat));
      const tailPts = Array.from({ length: 26 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(pal.a), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); queen.add(s); return { s, k: Math.random() }; });
      holder.add(g);
      const qPos = new V();
      let qHit = 0;
      return {
        g,
        anchor(id, out) { return out.copy(queen.position).add(v4.set(0, 5.2, 0)); },
        hitPos(id, out) { return out.copy(queen.position); },
        source(out) { return out.copy(qPos).add(v4.set(0, -1, 1)); },
        hit(id) { qHit = 1.4; },
        charge() {},
        lunge() { for (const a of arms) a.rotation.x = -0.9; },
        gone() {},
        regrow() {},
        update(dt, t) {
          qPos.set(Math.sin(t * 0.4) * 2.2 * still, 7.4 + Math.sin(t * 0.9) * 0.5 * still, -6);
          queen.position.copy(qPos);
          queen.rotation.y = Math.sin(t * 0.5) * 0.25 * still;
          hood.rotation.y += dt * 0.3;
          cache.forEach((c, k) => { const a = t * 0.8 + k / cache.length * Math.PI * 2; c.position.set(Math.cos(a) * 3.8, Math.sin(a * 2 + k) * 0.5, Math.sin(a) * 2.2); c.rotation.set(a, a * 0.7, 0); });
          tailPts.forEach(p => { p.k = (p.k + dt * 0.35) % 1; p.s.position.set(Math.sin(p.k * 9 + t) * 0.6 * p.k, -1.8 - p.k * 4.2, -p.k * 1.4); p.s.material.opacity = (1 - p.k) * 0.7; p.s.scale.setScalar(0.9 * (1 - p.k * 0.6)); });
          arms.forEach((a, k) => { a.rotation.x += (Math.sin(t * 1.5 + k) * 0.25 - a.rotation.x) * Math.min(1, dt * 3); });
          qHit = Math.max(0, qHit - dt * 4);
          qMat.uniforms.uHit.value = qHit;
        },
      };
    }

    function snake() {
      const g = new THREE.Group();
      const hMat = edgeMat(pal.a, 1), cMat = edgeMat(pal.b, 0.8), tMat = edgeMat(pal.c, 1);
      const S = 1.45;
      const head = new THREE.Group(); head.scale.setScalar(S); g.add(head);
      box(head, 2.3, 1.7, 2.7, hMat, 0, 0.9, 0);
      const lamp = glowMatFor(pal.eye); lamp.opacity = 0.75;
      box(head, 0.45, 0.32, 0.2, lamp, -0.62, 1.15, 1.38); box(head, 0.45, 0.32, 0.2, lamp, 0.62, 1.15, 1.38);
      box(head, 1.9, 0.22, 0.12, glowMatFor(pal.c), 0, 1.55, 1.36);
      const cow = box(head, 2.2, 0.8, 0.8, hMat, 0, 0.3, 1.6); cow.rotation.x = 0.6;
      box(head, 1.9, 0.14, 1.9, hMat, 0, 1.85, 0);
      box(head, 1.15, 0.75, 1.15, hMat, 0, 2.3, 0);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 40), glowMatFor(pal.c)); halo.rotation.x = Math.PI / 2; halo.position.y = 3.1; head.add(halo);
      const cars = new Map();
      function car(f) {
        const m = new THREE.Group();
        const mat = cMat.clone(); mat.uniforms.uTime = T; mat.uniforms.uSeed.value = Math.random();
        box(m, 1.8, 1.3, 2.1, mat, 0, 0.85, 0);
        const win = glowMatFor(pal.c); win.opacity = 0.5;
        box(m, 1.84, 0.28, 1.5, win, 0, 1.1, 0);
        for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) box(m, 0.2, 0.4, 0.4, mat, s * 0.85, 0.1, z);
        holder.add(m);
        const x = { m, mat, win, f, pos: new V(), dead: 0, vel: new V(), spin: 0 };
        cars.set(f.id, x);
        return x;
      }
      holder.add(g);
      const hist = []; let travel = 0;
      const pathAt = (tt, out) => out.set(Math.sin(tt * 0.36) * 10.5, 0, -4.5 + Math.sin(tt * 0.72) * 4.2);
      let tt = 0, charge = 0, lunge = 0, whip = 0, hHit = 0;
      // lay the trail the train has already run, so the cars start strung out behind the head
      for (let k = -400; k <= 0; k++) { const p = pathAt(k * 0.05, new V()); const l = hist[hist.length - 1]; travel += l ? l.p.distanceTo(p) : 0; hist.push({ p, at: travel }); }
      const lungeTo = new V(), hp = new V();
      const order = () => [...foes.values()].filter(f => f.kind === 'car' && f.alive).map(f => f.id);
      return {
        g,
        anchor(id, out) {
          const f = foes.get(id); if (!f) return null;
          if (f.kind === 'head') return out.copy(head.position).add(v4.set(0, 5, 0));
          const x = cars.get(id); if (!x || x.dead) return null;
          // the last two cars are next to each other, so their tags sit at two heights
          const live = order();
          const lift = live[live.length - 2] === id ? 4.6 : 2.8;
          return out.copy(x.m.position).add(v4.set(0, lift, 0));
        },
        hitPos(id, out) { const x = cars.get(id); return x && !x.dead ? out.copy(x.m.position).add(v4.set(0, 0.9, 0)) : out.copy(head.position).add(v4.set(0, 1, 0)); },
        hit(id) { const x = cars.get(id); if (x) x.mat.uniforms.uHit.value = 1.3; else hHit = 1.3; },
        charge(id, k) { charge = k; },
        lunge(id, at) { lunge = 1; lungeTo.copy(at); },
        chip() { whip = 1; },
        gone(id, how) {
          const x = cars.get(id); if (!x) return;
          x.dead = 0.001;
          x.vel.set(rnd(-1, 1) * 5, 6, rnd(2, 5)); x.spin = rnd(-6, 6);
          burst(x.m.position, how === 'cut' ? 30 : 18, 7, C(pal.c), { up: 0.6 }); shake = Math.max(shake, 0.3);
        },
        regrow() {},
        update(dt, t) {
          tt += dt * (0.9 + 0.25 * (1 - order().length / 12)) * still;
          pathAt(tt, hp);
          charge = Math.max(0, charge);
          lunge = Math.max(0, lunge - dt * 2.4); whip = Math.max(0, whip - dt * 2);
          if (lunge > 0) hp.lerp(lungeTo, Math.sin(lunge * Math.PI) * 0.6);
          const prev = head.position.clone();
          head.position.copy(hp);
          head.position.y = 0.05 + charge * 1.2 + Math.abs(Math.sin(t * 4)) * 0.08;
          if (prev.distanceToSquared(hp) > 1e-5) { v1.copy(hp).add(v2.subVectors(hp, prev).normalize()); v1.y = head.position.y; head.lookAt(v1); }
          head.rotation.z = Math.sin(t * 3) * 0.04;
          halo.rotation.z += dt * 2;
          hHit = Math.max(0, hHit - dt * 4); hMat.uniforms.uHit.value = hHit;
          hMat.uniforms.uCol.value.copy(C(pal.a)).lerp(RED, charge);
          // follow the leader: cars sit at fixed distances back along the head's trail
          const last = hist[hist.length - 1];
          const d = last ? last.p.distanceTo(hp) : 0;
          travel += d;
          if (!last || d > 0.05) hist.push({ p: hp.clone(), at: travel });
          while (hist.length > 2 && travel - hist[0].at > 60) hist.shift();
          const first = !cars.size;
          for (const f of foes.values()) if (f.kind === 'car' && f.alive && !cars.has(f.id)) { const x = car(f); x.m.position.copy(hp); x.m.scale.setScalar(first ? S : 0.01); x.snap = first; }
          const ids = order();
          ids.forEach((id, k) => {
            const x = cars.get(id); if (!x) return;
            const want = travel - (k + 1) * 2.45 * S;
            let j = hist.length - 1; while (j > 0 && hist[j].at > want) j--;
            const a = hist[j], b = hist[Math.min(hist.length - 1, j + 1)];
            const u = b && b.at > a.at ? clamp((want - a.at) / (b.at - a.at), 0, 1) : 0;
            v1.copy(a.p).lerp(b ? b.p : a.p, u);
            const tail = ids.length - k;   // 1 for the last car
            if (whip > 0 && tail <= 3) v1.x += Math.sin(whip * Math.PI * 3) * (4 - tail) * 0.5;
            if (x.snap) { x.m.position.copy(v1); x.snap = false; } else x.m.position.lerp(v1, Math.min(1, dt * 12));
            v2.copy(j > 0 ? hist[j - 1].p : v1); v2.y = 0;
            const dir = v3.subVectors(x.m.position, v2); if (dir.lengthSq() > 1e-4) { v3.copy(x.m.position).add(dir.normalize()); x.m.lookAt(v3); }
            x.m.scale.setScalar(Math.min(S, x.m.scale.x + dt * 3));
            const typeable = tail <= 2;
            x.mat.uniforms.uCol.value.copy(C(typeable ? pal.c : pal.b, typeable ? 1.3 : 1));
            x.win.opacity = typeable ? 0.95 : 0.4;
            x.mat.uniforms.uHit.value = Math.max(0, x.mat.uniforms.uHit.value - dt * 4);
          });
          for (const [id, x] of cars) {
            const f = foes.get(id);
            if (!x.dead && (!f || !f.alive)) { x.dead = 0.001; x.vel.set(rnd(-1, 1) * 4, 5, rnd(2, 4)); x.spin = rnd(-6, 6); }
            if (!x.dead) continue;
            x.dead += dt;
            x.vel.y -= 14 * dt; x.m.position.addScaledVector(x.vel, dt); x.m.rotation.x += x.spin * dt; x.m.rotation.z += x.spin * 0.6 * dt;
            x.mat.uniforms.uOp.value = Math.max(0, 1 - x.dead * 1.2); x.win.opacity = Math.max(0, 0.9 - x.dead);
            if (x.dead > 1) { holder.remove(x.m); x.mat.dispose(); x.win.dispose(); cars.delete(id); }
          }
        },
      };
    }

    function golem() {
      const g = new THREE.Group(); g.position.set(0, 0, -4.5);
      const mat = edgeMat(pal.a, 1), dark = edgeMat(pal.b, 1);
      for (const s of [-1, 1]) { box(g, 1.5, 3.2, 1.7, dark, s * 1.5, 1.6, 0); box(g, 1.9, 0.6, 2.3, dark, s * 1.5, 0.3, 0.3); }
      box(g, 3.9, 1.1, 2.4, dark, 0, 3.6, 0);
      const torso = new THREE.Group(); torso.position.set(0, 4.1, 0); g.add(torso);
      box(torso, 5.2, 1.2, 3.1, mat, 0, 3.4, 0);
      box(torso, 1.6, 2.8, 3.1, mat, -1.8, 1.4, 0); box(torso, 1.6, 2.8, 3.1, mat, 1.8, 1.4, 0);
      box(torso, 2.0, 0.8, 3.1, mat, 0, 0.4, 0); box(torso, 2.0, 2.8, 1.4, mat, 0, 1.4, -0.85);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), glowMatFor(pal.c)); core.position.set(0, 1.6, 0.4); torso.add(core);
      const plates = [-1, 1].map(s => box(torso, 1.05, 2.1, 0.45, mat, s * 0.52, 1.55, 1.35));
      const head = new THREE.Group(); head.position.set(0, 4.6, 0.2); torso.add(head);
      box(head, 1.9, 1.5, 1.7, mat, 0, 0.6, 0);
      const visor = box(head, 1.5, 0.28, 0.1, glowMatFor(pal.eye), 0, 0.75, 0.88);
      const arms = [-1, 1].map(s => {
        const a = new THREE.Group(); a.position.set(s * 3.3, 3.2, 0); torso.add(a);
        box(a, 2, 1.5, 2.1, mat, 0, 0.2, 0);
        box(a, 1.2, 2.6, 1.3, dark, 0, -1.6, 0);
        const fore = new THREE.Group(); fore.position.set(0, -3, 0); a.add(fore);
        box(fore, 1.5, 2.4, 1.6, mat, 0, -1.1, 0);
        box(fore, 1.9, 1.5, 1.9, mat, 0, -2.8, 0.1);
        return { a, fore, s };
      });
      holder.add(g);
      let charge = 0, slam = 0, weakK = 0, weakOn = false, hit = 0, stomp = 0;
      return {
        g,
        anchor(id, out) { return out.set(g.position.x, g.position.y + 10.6, g.position.z); },
        hitPos(id, out) { return weakOn ? core.getWorldPosition(out) : out.set(g.position.x, 6, g.position.z + 1); },
        hit(id, k) { hit = Math.min(1.5, hit + k); },
        charge(id, k) { charge = k; },
        lunge(id, at) { slam = 1; v1.copy(at); },
        chip() { stomp = 1; },
        weak(on) { weakOn = on; },
        gone() { burst(v1.set(0, 6, -3), 60, 10, C(pal.a), { up: 0.6, size: 0.4 }); },
        regrow() {},
        update(dt, t) {
          slam = Math.max(0, slam - dt * 2.2); stomp = Math.max(0, stomp - dt * 3);
          if (slam > 0.85 && slam - dt * 2.2 <= 0.85) { ring(v2.set(0, 0, 0), C(pal.a), 12, 0.6); shake = Math.max(shake, 0.7); }
          weakK += ((weakOn ? 1 : 0) - weakK) * Math.min(1, dt * 5);
          const breathe = Math.sin(t * 1.4) * 0.12 * still;
          torso.position.y = 4.1 + breathe - stomp * 0.3;
          torso.rotation.x = -charge * 0.25 + Math.sin(slam * Math.PI) * 0.35;
          for (const A of arms) {
            const up = charge * 2.6 - Math.sin(slam * Math.PI) * 1.2;
            A.a.rotation.x = -up + Math.sin(t * 1.1 + A.s) * 0.08 * still;
            A.a.rotation.z = A.s * (0.12 + charge * 0.25);
            A.fore.rotation.x = -0.3 - charge * 0.8;
          }
          plates.forEach((p, k) => { p.position.x = (k ? 1 : -1) * (0.52 + weakK * 0.95); });
          core.scale.setScalar(1 + weakK * (0.5 + Math.sin(t * 10) * 0.12));
          core.rotation.y += dt * (1 + weakK * 5);
          core.material.color.copy(C(pal.c, 1.6)).lerp(GOLD, weakK);
          head.rotation.y = Math.sin(t * 0.5) * 0.3 * still;
          visor.material.color.copy(C(pal.eye, 1.6)).lerp(RED, charge);
          hit = Math.max(0, hit - dt * 4); mat.uniforms.uHit.value = hit; dark.uniforms.uHit.value = hit * 0.6;
          mat.uniforms.uCol.value.copy(C(pal.a)).lerp(RED, charge * 0.6);
          if (stomp > 0.9 && stomp - dt * 3 <= 0.9) ring(v2.set(0, 0, -2), C(pal.a), 8, 0.5);
        },
      };
    }

    function twins() {
      const g = new THREE.Group();
      const sides = [0, 1].map(i => {
        const col = i ? pal.c : pal.a;
        const grp = new THREE.Group(); g.add(grp);
        const fill = new THREE.MeshBasicMaterial({ color: C(col, i ? 0.25 : 0.55), transparent: true, opacity: i ? 0.2 : 0.85 });
        const wire = new THREE.MeshBasicMaterial({ color: C(col, 1.5), wireframe: true, transparent: true, opacity: 1 });
        const parts = [];
        const mk = (r, y, sx = 1) => { const geo = new THREE.OctahedronGeometry(r, 0); const a = new THREE.Mesh(geo, fill); const b = new THREE.Mesh(geo, wire); b.scale.setScalar(1.02); a.add(b); a.position.y = y; a.scale.set(sx, 1.5, sx); grp.add(a); parts.push({ m: a, home: a.position.clone(), r }); return a; };
        mk(1.5, 0); mk(0.8, 2.9); mk(0.6, -2.6, 0.8);
        const shards = Array.from({ length: 7 }, (_, k) => { const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.35), wire); grp.add(m); return { m, k }; });
        const eye = box(grp, 0.9, 0.16, 0.1, glowMatFor(pal.eye), 0, 3.0, 0.75);
        return { i, grp, fill, wire, parts, shards, eye, home: new V(i ? 4.8 : -4.8, 5.2, -3), alive: true, k: 0, charge: 0, lunge: 0, lungeTo: new V(), hit: 0 };
      });
      const link = mkStrip(); link.material.color.copy(C(pal.a)).lerp(C(pal.c), 0.5);
      const timer = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.8, 64, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      timer.visible = false; g.add(timer);
      holder.add(g);
      const bySlot = id => { const f = foes.get(id); return f ? sides[f.slot] : null; };
      return {
        g,
        anchor(id, out) { const s = bySlot(id); return s ? out.copy(s.grp.position).add(v4.set(0, 4.4, 0)) : null; },
        hitPos(id, out) { const s = bySlot(id); return s ? out.copy(s.grp.position) : out.set(0, 5, -3); },
        hit(id, k) { const s = bySlot(id); if (s) s.hit = Math.min(1.5, s.hit + k); },
        charge(id, k) { const s = bySlot(id); if (s) s.charge = k; },
        lunge(id, at) { const s = bySlot(id); if (s) { s.lunge = 1; s.lungeTo.copy(at); } },
        gone(id) { const s = bySlot(id); if (s) { s.alive = false; burst(s.grp.position, 36, 9, C(s.i ? pal.c : pal.a), { up: 0.3 }); } },
        regrow(id) { const s = bySlot(id); if (s) { s.alive = true; s.hit = 1.5; } },
        update(dt, t) {
          for (const s of sides) {
            const f = [...foes.values()].find(x => x.slot === s.i);
            if (f) s.alive = f.alive;
            s.k += ((s.alive ? 0 : 1) - s.k) * Math.min(1, dt * 3);
            s.lunge = Math.max(0, s.lunge - dt * 2.5);
            const ph = t * 0.8 + (s.i ? 0.5 : 0);
            s.grp.position.set(s.home.x + Math.sin(ph) * 0.6 * still * (s.i ? -1 : 1), s.home.y + Math.sin(ph * 1.3) * 0.5 * still + s.charge * 0.8, s.home.z);
            if (s.lunge > 0) s.grp.position.lerp(s.lungeTo, Math.sin(s.lunge * Math.PI) * 0.35);
            s.grp.rotation.y += dt * (0.6 + s.charge * 3) * (s.i ? -1 : 1);
            // a fallen twin comes apart into a slow ring of pieces
            s.parts.forEach((p, k) => {
              const a = t * 0.5 + k * 2.1;
              p.m.position.set(Math.cos(a) * 2.6 * s.k, p.home.y * (1 - s.k) - s.k * 3 + Math.sin(a) * s.k, Math.sin(a) * 2.6 * s.k);
              p.m.rotation.x = s.k * a;
            });
            s.shards.forEach(x => { const a = t * (1.2 + x.k * 0.1) + x.k; x.m.position.set(Math.cos(a) * (2.4 + s.k), Math.sin(a * 1.7) * 2, Math.sin(a) * (2.4 + s.k)); x.m.rotation.set(a, a, 0); });
            s.hit = Math.max(0, s.hit - dt * 4);
            const base = C(s.i ? pal.c : pal.a);
            s.wire.color.copy(base).multiplyScalar(1.5 + s.hit).lerp(RED, s.charge * 0.7);
            s.wire.opacity = 1 - s.k * 0.6;
            s.fill.opacity = (s.i ? 0.2 : 0.85) * (1 - s.k * 0.8);
            s.eye.visible = s.k < 0.5;
          }
          const a = sides[0].grp.position, b = sides[1].grp.position;
          const both = sides[0].alive && sides[1].alive;
          strip(link, a, b, both ? 0.25 + Math.sin(t * 8) * 0.06 : 0.1, both ? 0.7 : 0.25 + Math.sin(t * 20) * 0.2);
          const rl = st ? st.relink : 0;
          const dead = sides.find(s => !s.alive);
          timer.visible = !!(rl > 0 && dead);
          if (timer.visible) {
            timer.position.copy(dead.grp.position).sub(g.position);
            timer.lookAt(camera.position);
            const frac = clamp(rl / 12000, 0, 1);
            timer.geometry.dispose();
            timer.geometry = new THREE.RingGeometry(2.6, 2.85, 64, 1, Math.PI / 2, Math.PI * 2 * frac);
          }
        },
      };
    }


    // mites: small fliers that carry a word each, from a source to one player's card.
    // The swarm sends them; in the Mixed run a golem, a train or the twins send them too.
    function miteLayer(source) {
      const miteMat = edgeMat(pal.c, 1);
      const mites = new Map();
      function mite(f) {
        const m = new THREE.Group();
        box(m, 0.62, 0.42, 0.8, miteMat, 0, 0, 0);
        box(m, 0.42, 0.34, 0.36, miteMat, 0, 0.04, 0.55);
        const eye = box(m, 0.3, 0.1, 0.06, glowMatFor(pal.eye), 0, 0.1, 0.75);
        const wings = [-1, 1].map(s => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ color: C(pal.c, 1.4), transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); w.position.set(s * 0.5, 0.25, 0); m.add(w); return w; });
        for (let k = 0; k < 3; k++) for (const s of [-1, 1]) { const l = box(m, 0.06, 0.06, 0.45, miteMat, s * 0.35, -0.22, -0.25 + k * 0.25); l.rotation.y = s * 0.9; }
        holder.add(m);
        const x = { m, wings, eye, f, pos: new V(), start: new V(), ctrl: new V(), end: new V(), dead: 0, how: '' };
        mites.set(f.id, x);
        return x;
      }
      return {
        has: id => mites.has(id),
        anchor(id, out) { const x = mites.get(id); return x && !x.dead ? out.copy(x.pos).add(v4.set(0, 0.9, 0)) : null; },
        hitPos(id, out) { const x = mites.get(id); return x ? out.copy(x.pos) : null; },
        gone(id, how) {
          const x = mites.get(id);
          if (!x) return;
          x.dead = 0.001; x.how = how;
          if (how === 'pop') burst(x.pos, 22, 7, C(pal.c), { up: 0.4, size: 0.3 });
          if (how === 'bite') { burst(x.pos, 14, 6, RED, { up: 0.5 }); shake = Math.max(shake, 0.25); }
        },
        update(dt, t) {
          const qPos = source(new V());
          const now = opts.now ? opts.now() : 0;
          // new mites from the state, drawn along a curve from the wraith to their player's card
          for (const f of foes.values()) if (f.kind === 'mite' && f.alive && !mites.has(f.id)) mite(f);
          for (const [id, x] of mites) {
            const f = foes.get(id);
            if (!x.dead && (!f || !f.alive)) x.dead = 0.001;
            if (x.dead) {
              x.dead += dt;
              if (x.how === 'bite') x.m.position.y -= dt * 4;
              x.m.scale.setScalar(Math.max(0.01, 1 - x.dead * 3));
              if (x.dead > 0.4) { holder.remove(x.m); drop(x.m, miteMat); mites.delete(id); }
              continue;
            }
            const u = clamp((now - x.f.born) / Math.max(1, x.f.land - x.f.born), 0, 1);
            x.start.copy(qPos);
            laneAt(x.f.lane, x.end); x.end.y += 1;
            const side = (((x.f.path ?? (parseInt(id.slice(1), 10) * 0.37 % 1)) - 0.5)) * 16;
            x.ctrl.set((x.start.x + x.end.x) / 2 + side, 8 + Math.sin(parseInt(id.slice(1), 10)) * 2, (x.start.z + x.end.z) / 2);
            bez(x.start, x.ctrl, x.end, smooth(u * 0.92 + u * u * 0.08), x.pos);
            x.pos.y += Math.sin(t * 6 + parseInt(id.slice(1), 10)) * 0.15 * still;
            x.m.position.copy(x.pos);
            bez(x.start, x.ctrl, x.end, Math.min(1, u + 0.02), v1);
            x.m.lookAt(v1);
            x.m.scale.setScalar(0.8 + u * 0.6);
            const flap = Math.sin(t * 40 + parseInt(id.slice(1), 10)) * 0.9;
            x.wings[0].rotation.z = flap; x.wings[1].rotation.z = -flap;
            x.eye.material.color.copy(u > 0.75 ? RED : C(pal.eye)).multiplyScalar(1.6);
          }
          miteMat.uniforms.uHit.value = Math.max(0, miteMat.uniforms.uHit.value - dt * 3);
        },
      };
    }

    const BUILD = { hydra, swarm, snake, golem, twins };
    const cachedGeo = new Set();
    // frees what a creature made for itself; the box shapes are shared and stay
    function drop(obj, keepMat) {
      if (!cachedGeo.size) geoCache.forEach(g => cachedGeo.add(g));
      geoCache.forEach(g => cachedGeo.add(g));
      obj.traverse(o => {
        if (o.geometry && !cachedGeo.has(o.geometry)) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach(m => { if (m !== keepMat && m !== pillarMat) m.dispose(); });
      });
    }
    function clearCreature() {
      for (const o of [...holder.children]) { holder.remove(o); drop(o); }
      cre = null; mites = null;
    }
    let mites = null;
    const isMite = id => !!(mites && mites.has(id));
    const foePos = (id, out) => (isMite(id) ? mites.hitPos(id, out) : cre.hitPos(id, out));
    function applyPal(look) {
      pal = PALS[look] || PALS[0];
      scene.background.set(pal.bg); scene.fog.color.set(pal.bg);
      wall.material.color.copy(C(pal.a));
      grid.material.color.copy(C(pal.b));
      pillarMat.uniforms.uCol.value.copy(C(pal.b, 0.55));
      floorRing.material.color.copy(C(pal.a));
    }
    function setFight(f) {
      clearCreature();
      kind = f.kind; applyPal(f.look || 0);
      foes = new Map((f.foes || []).map(x => [x.id, x]));
      deadAt = -9;
      cre = (BUILD[kind] || golem)();
      if (kind === 'swarm') mites = miteLayer(out => cre.source(out));
      else if (f.adds === 'mites') { const main = (f.foes || [])[0]; mites = miteLayer(out => cre.hitPos(main && main.id, out).add(v4.set(0, 1, 1))); }
      if (fx) fx.clear();
      // the new creature's shaders compile before its first frame, not during the fight
      try { renderer.compile(scene, camera); } catch (e) {}
    }

    // ---------- the attack being wound up ----------
    let atk = null;
    const aimV = new V(), fromV = new V();
    function sync(s) {
      st = s;
      if (s.foes) { const m = new Map(); for (const x of s.foes) m.set(x.id, x); for (const [id, x] of foes) if (!m.has(id) && x.kind === 'mite') m.set(id, { ...x, alive: false }); foes = m; }
      atk = s.attack || null;
      if (cre && cre.weak) cre.weak(s.weak > 0);
    }
    function drawAttack(t) {
      for (const a of aims) a.visible = false;
      for (const r of aimRings) r.visible = false;
      if (!cre) return;
      for (const f of foes.values()) if (cre.charge) cre.charge(f.id, 0);
      if (!atk || !st) return;
      const now = opts.now ? opts.now() : 0;
      const k = clamp((now - atk.start) / Math.max(1, atk.land - atk.start), 0, 1);
      if (atk.from && cre.charge) cre.charge(atk.from, smooth(k));
      cre.hitPos(atk.from, fromV);
      const ids = atk.target === 'team' ? st.players.filter(p => !p.down).map(p => p.id) : [atk.target];
      ids.slice(0, 4).forEach((id, i) => {
        laneAt(id, aimV);
        const pulse = 0.5 + 0.5 * Math.sin(t * (8 + k * 18));
        aims[i].material.color.copy(RED);
        strip(aims[i], fromV, aimV, 0.12 + k * 0.4, (0.15 + k * 0.6) * (0.6 + 0.4 * pulse));
        const r = aimRings[i];
        r.visible = true; r.position.set(aimV.x, 0.06, aimV.z);
        r.scale.setScalar(2.4 - k * 1.4); r.material.opacity = 0.3 + k * 0.6 * pulse;
      });
    }

    // ---------- events ----------
    const hitAt = new V();
    function shot(h) {
      if (!cre) { if (opts.onImpact) opts.onImpact(h, null, null); return; }
      const from = laneAt(h.id, new V()).add(v4.set(0, 0.6, 0));
      const foe = h.foe;
      const to = out => foePos(foe, out);
      const col = h.you ? null : (opts.color ? opts.color(h.id) : null);
      const land = () => {
        cre.hit(foe, h.crit ? 1.2 : 0.7);
        to(hitAt);
        burst(hitAt, h.crit ? 16 : 7, h.crit ? 9 : 5, h.you ? WHITE : colorOf(h.id), { size: 0.22 });
        if (h.crit) shake = Math.max(shake, 0.35);
        const p = screen(hitAt);
        if (opts.onImpact) opts.onImpact(h, p ? p.x : null, p ? p.y : null);
      };
      // teammates' shots stay small so four streams don't wash the boss out
      if (fx) fx.shot(h.you ? Math.min(3, h.tier || 0) : Math.min(1, h.tier || 0), from, to, land, { color: col });
      else land();
    }
    function cast(id, c = {}) {
      if (!fx || !cre) return;
      const caster = { pos: out => laneAt(c.from || 'me', out).add(v4.set(0, 0.8, 0)) };
      const foe = c.foe;
      const target = {
        size: kind === 'swarm' ? 3 : 4,
        pos: out => foePos(foe, out),
        top: out => foePos(foe, out).add(v4.set(0, 2.5, 0)),
        base: out => foePos(foe, out).setY(0),
        react: () => cre.hit(foe, 1),
      };
      fx.cast(id, { caster, target, hits: c.hits, effect: c.effect });
    }
    function attackLands(a) {
      if (!cre) return;
      const ids = a.target === 'team' ? (st ? st.players.filter(p => !p.down).map(p => p.id) : []) : [a.target];
      const from = a.from || (st && st.foes[0] && st.foes[0].id);
      if (ids.length === 1) { laneAt(ids[0], v1); cre.lunge(from, v1); }
      else cre.lunge(from, v1.set(0, 1, teamZ));
      for (const id of ids) { laneAt(id, v2); burst(v2, 14, 7, RED, { up: 0.6 }); ring(v2, RED, 2.2, 0.4); }
      shake = Math.max(shake, a.target === 'team' ? 0.8 : 0.5);
    }
    function block(b) {
      if (!cre || !atk) return;
      cre.hitPos(atk.from, v1);
      laneAt(b.by === 'firewall' ? (atk.target === 'team' ? 'me' : atk.target) : b.by, v2);
      bolt(v2.clone().add(v4.set(0, 0.6, 0)), v1, SHIELD, 0.4, 0.6);
      burst(v1, 18, 6, SHIELD, {});
      if (cre.charge && atk.from) cre.charge(atk.from, 0);
    }
    function chip(c) {
      if (!cre) return;
      if (cre.chip) cre.chip();
      cre.hitPos(c.from, v1);
      for (const id of c.targets || []) { laneAt(id, v2); bolt(v1, v2.clone().add(v4.set(0, 0.6, 0)), RED, 0.28, c.what === 'quake' ? 0.2 : 0.3); burst(v2, 6, 4, RED, {}); }
      if (c.what === 'quake') { ring(v1.set(0, 0, -2), RED, 14, 0.7); shake = Math.max(shake, 0.4); }
    }
    function foeGone(id, how) {
      if (!cre) return;
      if (isMite(id)) mites.gone(id, how); else cre.gone(id, how);
    }
    function regrow(id) { if (cre) cre.regrow(id); const f = foes.get(id); if (f && cre) { cre.hitPos(id, v1); burst(v1, 20, 5, C(pal.c), { up: 0.8 }); } }
    function down(id) { laneAt(id, v1); burst(v1, 24, 8, RED, { up: 1 }); ring(v1, RED, 3, 0.6); }
    function heal(id) { laneAt(id, v1); burst(v1, 18, 4, HEAL, { up: 1.4, grav: -2, life: 0.9 }); ring(v1, HEAL, 1.8, 0.5); }
    function shield(id) { laneAt(id, v1); ring(v1, SHIELD, 2.2, 0.6); burst(v1, 12, 3, SHIELD, { up: 1, grav: -1 }); }
    function clear() { deadAt = nowS(); for (const f of foes.values()) if (cre && f.alive) cre.gone(f.id, 'kill'); shake = Math.max(shake, 1); burst(v1.set(0, 5, -3), 80, 12, C(pal.a), { up: 0.5, size: 0.4, life: 1.2 }); }

    const _s = new V();
    function screen(p) {
      const w = W, h = H;
      _s.copy(p).project(camera);
      if (_s.z > 1) return null;
      return { x: (_s.x + 1) / 2 * w, y: (1 - _s.y) / 2 * h };
    }
    function anchors() {
      const out = new Map();
      if (!cre) return out;
      for (const f of foes.values()) {
        if (!f.alive) continue;
        const p = f.kind === 'mite' ? (mites ? mites.anchor(f.id, v3) : null) : cre.anchor(f.id, v3);
        if (!p) continue;
        const s = screen(p);
        if (s) out.set(f.id, { x: s.x, y: s.y, on: true });
      }
      return out;
    }

    // ---------- the frame ----------
    let lastT = nowS();
    // compile every shader now, hidden pooled effects included, so the first hit, spell or status
    // effect in a fight doesn't stall a frame while its shader compiles
    try { renderer.compile(scene, camera); } catch (e) {}
    renderer.setAnimationLoop(() => {
      if (!visible || document.hidden) { lastT = nowS(); return; }
      const t = nowS();
      let dt = Math.min(0.05, t - lastT); lastT = t;
      if (performance.now() < hitStop) dt *= 0.15;
      T.value = t;
      laneCache.clear();
      if (cre) cre.update(dt, t);
      if (mites) mites.update(dt, t);
      drawAttack(t);
      for (const p of parts) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.v.y -= p.grav * dt; p.s.position.addScaledVector(p.v, dt);
        const k = p.life / p.max;
        p.s.scale.setScalar(p.size * (0.4 + k)); p.s.material.opacity = k;
      }
      for (const w of rings) {
        if (!w.m.visible) continue;
        w.t += dt; const k = w.t / w.life;
        if (k >= 1) { w.m.visible = false; continue; }
        w.m.scale.setScalar(0.2 + ease(k) * w.r); w.m.material.opacity = (1 - k) * 0.9;
      }
      for (const b of bolts) {
        if (b.t >= 1) { b.m.visible = false; continue; }
        b.t += dt / b.life;
        const u = ease(Math.min(1, b.t * 1.6));
        v1.copy(b.a).lerp(b.b, Math.max(0, u - 0.35)); v2.copy(b.a).lerp(b.b, u);
        strip(b.m, v1, v2, b.w, 1 - b.t);
      }
      if (fx) fx.update(dt);
      shake = Math.max(0, shake - dt * 2.2);
      const sh = shake * (reduce ? 0.12 : calm ? 0.6 : 1);
      camera.position.set(camBase.x + Math.sin(t * 0.21) * 0.5 * still + Math.sin(t * 41) * sh * 0.5, camBase.y + Math.sin(t * 0.17) * 0.2 * still + Math.sin(t * 37 + 1) * sh * 0.4, camBase.z);
      camera.lookAt(camLook);
      wall.material.map.offset.y = (wall.material.map.offset.y + dt * 0.03) % 1;
      composer.render();
      if (opts.onFrame) opts.onFrame();
    });

    function dispose() {
      renderer.setAnimationLoop(null);
      if (fx) fx.dispose();
      ro.disconnect(); io.disconnect();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
      geoCache.forEach(g => g.dispose());
      glowTex.dispose(); stripTex.dispose(); codeTex.dispose();
      bloom.dispose(); composer.dispose && composer.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }
    const live = () => visible && !document.hidden;
    const info = () => ({ kind, foes: foes.size, cre: !!cre, fx: fx ? fx.info() : null });
    return { setFight, sync, shot, cast, attackLands, block, chip, foeGone, regrow, down, heal, shield, clear, anchors, live, info, dispose };
  }

  return { mount };
})();
