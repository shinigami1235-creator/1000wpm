// The party run in three.js: one creature set per fight kind, all built from glowing
// blocks in code. hydra (three necks on a mound), swarm (the Cache Wraith and its mites),
// snake (the Null Conductor's train of word cars), golem (a block giant with a core
// that opens) and twins (Syntax, a crystal, and Echo, its wire ghost).
// Each area is dressed by js/app/party-arena.js (its floor, light and set). The team's bots hover at
// the front, each over their card under the canvas (lane(id) says where), and fight with the moves in
// js/app/bot-fighter.js, driven by their players' typing. The boss winds up with a charge you can see and hear, lands with a
// shockwave, and a camera director (js/app/camdir.js) cuts to the boss's big moments and the kill
// only while no attack is on its way to the team.
//
//   const sc = PartyScene.mount(host, { lane: id => ({ x, y }) | null, now: () => netMs, color: id => '#hex', onImpact(h, x, y), audio })
//   sc.setFight({ kind, look, foes })   build the creatures for a fight
//   sc.sync(state)                      every paint: foes, HP, the attack being wound up, the core, relink clock
//   sc.key(id, frac)                    a right key from a player (frac: share of the word typed): a spark into their bot's orb
//   sc.typo(id)                         a wrong key: their bot glitches
//   sc.shot({ id, foe, dmg, tier, crit, you })   a word from a player's bot to a foe; onImpact on landing
//   sc.cast(spellId, { from, foe, hits, effect })  a spell from the combat layer
//   sc.fizzle(spellId, { from, foe })   a spell lost to a typo: it still flies and the foe blocks or dodges it
//   sc.attackLands({ id, target }) / sc.block({ id, by }) / sc.chip({ from, targets, what })
//   sc.foeGone(id, how)  how: kill | pop | bite | cut     sc.regrow(id)   sc.down(id)   sc.up(id)   sc.heal(id, by)   sc.shield(id, by)
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
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  // your keyboard's style, saved with your Character Lab look; a board you don't own fires as the Slab
  const kbStyle = () => (window.KbShots ? KbShots.mine() : 'slab');

  function mount(host, opts = {}) {
    let impl = null, gone = false, fight = null, last = null;
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP, RB, RE]) => {
        if (gone) return false;
        impl = build(host, { ...opts, RoundedBoxGeometry: RB.RoundedBoxGeometry, RoomEnvironment: RE.RoomEnvironment }, THREE, EC.EffectComposer, RP.RenderPass, UB.UnrealBloomPass, OP.OutputPass);
        if (fight) impl.setFight(fight);
        if (last) impl.sync(last);
        return true;
      }),
      setFight: f => { fight = f; if (impl) impl.setFight(f); },
      sync: st => { last = st; if (impl) impl.sync(st); },
      shot: h => { if (impl && impl.live()) impl.shot(h); else if (opts.onImpact) opts.onImpact(h, null, null); },
      key: (id, frac) => impl && impl.key(id, frac),
      typo: id => impl && impl.typo(id),
      cast: (id, c) => impl && impl.cast(id, c),
      fizzle: (id, c) => impl && impl.fizzle(id, c),
      attackLands: a => impl && impl.attackLands(a),
      block: b => impl && impl.block(b),
      chip: c => impl && impl.chip(c),
      foeGone: (id, how) => impl && impl.foeGone(id, how),
      regrow: id => impl && impl.regrow(id),
      down: id => impl && impl.down(id),
      heal: (id, by) => impl && impl.heal(id, by),
      shield: (id, by) => impl && impl.shield(id, by),
      up: (id, by) => impl && impl.up(id, by),
      director: () => (impl ? impl.director() : null),
      _impl: () => impl,   // tests
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
    const basePR = Math.min(1.5, devicePixelRatio || 1);
    renderer.setPixelRatio(basePR);
    // draw calls are counted over the whole frame (every pass), for tests
    renderer.info.autoReset = false;
    const gl = renderer.info;
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(Theme.hex('bg-0'));
    scene.fog = new THREE.Fog(Theme.hex('bg-0'), 34, 80);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // threshold 0.6: only the lit edges, sparks and cores glow; at 0.16 every face bloomed and a hit or
    // the open core washed the boss out to white, and at 0.38 the bots' pale shells bloomed under the
    // arena's lights (Kite's wide hat turned into a white ball, brightest as its spell lifts it)
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.4, 0.6);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---------- palettes, one per area ----------
    const PALS = [
      { bg: Theme.hex('bg-0'), a: Theme.hex('accent'), b: Theme.hex('accent-dim'), c: '#3ee6ff', eye: '#ff4d5e' },   // relay: the hydra
      { bg: '#070401', a: '#f2b330', b: '#8f5f13', c: '#ff6a3d', eye: '#fff2c4' },   // market: the wraith
      { bg: '#01060a', a: '#3ee6ff', b: '#147d8f', c: Theme.hex('accent'), eye: '#ffffff' },   // transit: the train
      { bg: '#0a0402', a: '#ff7a3d', b: '#8f3a13', c: '#ffd24d', eye: '#ffd24d' },   // firmware: the golem
      { bg: '#07010a', a: '#ff4dd8', b: '#7a1f6e', c: '#3ee6ff', eye: '#ffffff' },   // core: the twins
      { bg: '#0a0300', a: '#ffb02e', b: '#8a4a0c', c: '#ff5a2e', eye: '#fff2c4' },   // foundry: golem and mites
      { bg: '#04020b', a: '#a98bff', b: '#4b3a8f', c: '#5dffd2', eye: '#ffffff' },   // mirror: twins and mites
      { bg: '#030801', a: '#b6ff3d', b: '#4f7a12', c: '#3ee6ff', eye: '#ffffff' },   // junction: train and mites
    ];
    let pal = PALS[0];

    // ---------- shared pieces ----------
    const T = { value: 0 };
    // the creatures' skin: a dark armoured block lit from above, a bright edge on every face, panel
    // lines inside each face, a rim of light where the surface turns away from the camera, a scan
    // running over it, and a white flash when it's hit
    const EDGE_V = `varying vec2 vUv; varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
    const EDGE_F = `uniform vec3 uCol; uniform float uHit; uniform float uTime; uniform float uOp; uniform float uFill; uniform float uSeed;
      varying vec2 vUv; varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){
        vec2 d = min(vUv, 1.0 - vUv);
        float edge = 1.0 - smoothstep(0.0, 0.07, min(d.x, d.y));
        vec2 q = abs(fract(vUv * 2.0) - 0.5);
        float panel = (1.0 - smoothstep(0.0, 0.035, min(q.x, q.y))) * (1.0 - edge);
        float scan = 0.5 + 0.5 * sin(vUv.y * 28.0 + uTime * 4.0 + uSeed * 20.0);
        vec3 n = normalize(vN);
        float lit = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.3, 1.0, 0.55))), 0.0);
        float rim = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
        float hk = min(uHit, 1.0);
        vec3 col = mix(uCol, vec3(1.0), hk * 0.22);
        vec3 c = vec3(0.012, 0.016, 0.02) * lit + col * uFill * (0.05 + 0.05 * scan) * lit + col * edge * (0.95 + hk * 0.45)
          + col * panel * 0.16 * uFill + col * rim * 0.42 * uFill + vec3(hk * 0.04);
        c = mix(c, vec3(0.0), smoothstep(45.0, 85.0, vD) * 0.7);
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

    // ---------- the arena (js/app/party-arena.js), or the old code wall and grid without it ----------
    let arena = null;
    if (window.PartyArena) { try { arena = PartyArena.build(THREE, scene, { lite: matchMedia('(max-width: 720px)').matches }); } catch (e) { console.warn('Party arena', e); arena = null; } }
    let wall = null, grid = null, floorRing = null;
    const pillarMat = edgeMat(Theme.hex('accent-dim'), 0.35);
    if (!arena) {
      const codeCv = document.createElement('canvas'); codeCv.width = codeCv.height = 512;
      {
        const c = codeCv.getContext('2d'); c.font = '20px monospace';
        const CH = '01{}[]<>/=+*#$abcdef';
        for (let x = 0; x < 512; x += 16) for (let y = 0; y < 512; y += 22) if (Math.random() < 0.5) { c.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.9).toFixed(2)})`; c.fillText(CH[Math.floor(Math.random() * CH.length)], x, y); }
      }
      const codeTex = new THREE.CanvasTexture(codeCv); codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping; codeTex.repeat.set(7, 3);
      wall = new THREE.Mesh(new THREE.PlaneGeometry(150, 60), new THREE.MeshBasicMaterial({ map: codeTex, transparent: true, opacity: 0.16, depthWrite: false, fog: false }));
      wall.position.set(0, 20, -42); scene.add(wall);
      grid = new THREE.GridHelper(160, 80, '#ffffff', '#ffffff');
      grid.material.transparent = true; grid.material.opacity = 0.28; scene.add(grid);
      for (let k = 0; k < 18; k++) {
        const side = k % 2 ? 1 : -1, h = rnd(6, 22);
        box(scene, rnd(1.6, 3.2), h, rnd(1.6, 3.2), pillarMat, side * rnd(16, 40), h / 2, -rnd(20, 44));
      }
      floorRing = new THREE.Mesh(new THREE.RingGeometry(9, 9.12, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      floorRing.rotation.x = -Math.PI / 2; floorRing.position.set(0, 0.02, -3); scene.add(floorRing);
    }

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
      if (!col.isColor) col = C(col);   // a hex string here once turned every spark NaN and blacked out the frame
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
    // word streaks: a bright thin core and a soft glow running along an arc from a player's hand to a foe
    const streaks = Array.from({ length: 16 }, () => ({ core: mkStrip(), glow: mkStrip(), on: false, t: 0, dur: 0.25, a: new V(), c: new V(), to: null, col: new THREE.Color(), cb: null, k: 1 }));
    let stI = 0;
    const _h = new V(), _tl = new V(), _bt = new V();
    function streak(a, to, col, dur, cb, k = 1) {
      const S = streaks[stI = (stI + 1) % streaks.length];
      if (S.on && S.cb) { const f = S.cb; S.cb = null; f(); }
      S.a.copy(a); to(_bt); S.c.lerpVectors(a, _bt, 0.5).add(v4.set(rnd(-1.5, 1.5), 2.2 + rnd(0, 1.2), 0));
      S.to = to; S.col.copy(col); S.dur = dur; S.t = 0; S.on = true; S.cb = cb; S.k = k;
      S.core.material.color.copy(col).lerp(WHITE, 0.6).multiplyScalar(1.8); S.glow.material.color.copy(col).multiplyScalar(1.2);
    }
    function drawStreaks(dt) {
      for (const S of streaks) {
        if (!S.on) { S.core.visible = S.glow.visible = false; continue; }
        S.t += dt; const u = S.t / S.dur;
        S.to(_bt);
        bez(S.a, S.c, _bt, Math.min(1, ease(u)), _h); bez(S.a, S.c, _bt, Math.max(0, Math.min(1, ease(u - 0.3))), _tl);
        strip(S.core, _tl, _h, 0.09 * S.k, 1); strip(S.glow, _tl, _h, 0.42 * S.k, 0.45);
        if (u >= 1) { S.on = false; S.core.visible = S.glow.visible = false; if (S.cb) { const f = S.cb; S.cb = null; f(); } }
      }
    }
    function bolt(a, b, col, life = 0.32, w = 0.35) { const x = bolts[boI = (boI + 1) % bolts.length]; x.a.copy(a); x.b.copy(b); x.col.copy(col); x.t = 0; x.life = life; x.w = w; x.m.material.color.copy(col); }

    // ---------- combat effects (tier shots and spells) ----------
    let shake = 0, hitStop = 0;
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm, reduce, pixelHeight: () => renderer.domElement.height,
      juice: { shake: k => { shake = Math.max(shake, k); }, stop: ms => { hitStop = Math.max(hitStop, performance.now() + ms); }, glitch: () => {}, dim: () => {}, tint: () => {}, canFlash },
    }) : null;

    // ---------- camera and the team line ----------
    const camBase = new V(0, 6.2, 23), camLook = new V(0, 4.6, -1);
    // the team's places are worked out from the home view, so a cutaway never moves them
    const homeCam = camera.clone();
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
      homeCam.aspect = camera.aspect; homeCam.position.copy(camBase); homeCam.lookAt(camLook); homeCam.updateProjectionMatrix(); homeCam.updateMatrixWorld();
      teamZ = clamp(dist - 12, 7, 14);
      // resizing the canvas clears it: draw again now, so a resize never shows a blank frame
      if (drawn) composer.render();
    }
    let drawn = false;
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
      ray.setFromCamera(ndc, homeCam);
      plane.constant = -teamZ;
      if (!ray.ray.intersectPlane(plane, out)) out.set(0, 0.5, teamZ);
      out.y = Math.max(0.4, out.y);
      laneCache.set(id, out.clone());
      return out;
    }
    const colorOf = id => C(opts.color ? opts.color(id) : Theme.hex('accent'));

    // ---------- the team's bots (js/app/botkit.js, js/app/bot-fighter.js) ----------
    // Gid, 28 Nov 2026: Party fights are bots, the same as Duel. Each player's bot hovers over their card,
    // turned to the creature it is hitting, and moves only when its player types: a spark flies into its
    // orb on every right key, the strike leaves when the word is done, a typo glitches it, a spell lifts
    // it. Yours is BotKit.mine() (your division's bot as dressed in the hangar, owned parts only); the
    // others are seeded from their names, or wear their own look when the match carries one (botLook).
    // Your keyboard only changes how your shots look (Compact, Split, Arc, Slab), as in Duel.
    const team = new Map();   // id -> { f, ring, pool, typed, keys, down, yaw }
    let teamWon = false, teamLit = false;
    const TB = window.BotFighter && window.BotKit ? { ...THREE, RoundedBoxGeometry: opts.RoundedBoxGeometry } : null;
    const myKb = kbStyle();
    // the bots' size follows the room between the cards: about a fifth of the gap, so wide stages
    // (where the cards sit far apart in the world) get bigger bots and none overlap its neighbour
    let bsc = 1;
    // a soft studio for the bots' shells and clear coat to reflect (the hangar's), on their own materials only
    let envTex = null;
    if (TB && opts.RoomEnvironment) { try { const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new opts.RoomEnvironment(), 0.04).texture; pm.dispose(); } catch (e) { envTex = null; } }
    function shine(obj) { if (envTex) obj.traverse(o => { for (const mt of [].concat(o.material || [])) if (mt.isMeshStandardMaterial) { mt.envMap = envTex; mt.envMapIntensity = 0.25; mt.needsUpdate = true; } }); }
    // Gid, 28 Nov 2026: under the arena's lights a pale shell (Kite's wide hat most of all) came out brighter
    // than white and bloomed into a glowing ball. The bots' lit surfaces roll off softly toward 0.58, under
    // the bloom threshold, so only their glowing trim, eyes and orbs bloom, as in Duel.
    const KNEE = 'float kl = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\nif (kl > 0.4) outgoingLight *= (0.4 + (kl - 0.4) / (1.0 + (kl - 0.4) / 0.18)) / kl;\n#include <opaque_fragment>';
    function soften(obj) {
      obj.traverse(o => { for (const mt of [].concat(o.material || [])) if (mt.isMeshStandardMaterial && !mt.userData.knee) {
        mt.userData.knee = true;
        const ob = mt.onBeforeCompile, ck = mt.customProgramCacheKey;
        mt.onBeforeCompile = (sh, r) => { if (ob) ob.call(mt, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', KNEE); };
        mt.customProgramCacheKey = () => ck.call(mt) + '|knee';
        mt.needsUpdate = true;
      } });
    }
    const lookFor = p => (p.id === 'me' ? BotKit.mine() : p.botLook && p.botLook.id ? p.botLook : BotKit.random(p.name || p.id));
    const tsnd = (k, arg) => { if (opts.audio) opts.audio.combat('op-' + k, arg); };
    function teamSync(players) {
      if (!TB || !players) return;
      if (!teamLit) {
        teamLit = true;
        if (!arena) {
          scene.add(new THREE.HemisphereLight('#c9d3da', '#08090a', 0.8));
          const key = new THREE.DirectionalLight('#ffffff', 2); key.position.set(0, 9, 16); scene.add(key);
        }
      }
      for (const p of players) if (!team.has(p.id)) {
        const L = lookFor(p);
        // gap: how far a fast typist's bot presses in toward the boss, kept short so it stays over its card
        // the orb's sounds: yours full, everyone else's soft
        const sound = opts.audio ? { ctx: opts.audio.ctx, vol: p.id === 'me' ? 0.85 : 0.35 } : null;
        const f = BotFighter.create(TB, L.id, L.look, { gap: 6, lite: p.id !== 'me', sound });
        f.group.rotation.order = 'YXZ'; f.group.rotation.y = Math.PI;
        shine(f.group); soften(f.group); scene.add(f.group);
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.25, 48), new THREE.MeshBasicMaterial({ color: colorOf(p.id).multiplyScalar(1.4), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; scene.add(ring);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: glowTex, color: colorOf(p.id).multiplyScalar(0.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        pool.rotation.x = -Math.PI / 2; scene.add(pool);
        team.set(p.id, { f, rig: f.group.children[0], ring, pool, typed: '', keys: [], down: false, yaw: Math.PI, kx: 1, won: false });
      }
      for (const [id, m] of team) if (!players.some(p => p.id === id)) { scene.remove(m.f.group, m.ring, m.pool); m.f.dispose(); m.ring.geometry.dispose(); m.ring.material.dispose(); m.pool.geometry.dispose(); m.pool.material.dispose(); team.delete(id); }
      for (const p of players) {
        const m = team.get(p.id); if (!m) continue;
        // a teammate's typing reaches us with the state: each new letter is a spark. Their word's length
        // isn't sent, so the charge is a guess that fills as the word grows. Your own keys come from key().
        if (p.id !== 'me') {
          const ty = p.typed || '';
          if (ty.length > m.typed.length && ty.startsWith(m.typed) && !p.down) {
            const n = Math.min(4, ty.length - m.typed.length);
            for (let k = n; k >= 1; k--) teamKey(p.id, (ty.length - k + 1) / Math.max(6, ty.length + 2));
          }
          m.typed = ty;
        }
        if (p.down && !m.down) { m.f.ko(); }
        else if (!p.down && m.down) m.f.rise();
        m.down = !!p.down;
      }
    }
    function teamKey(id, frac) {
      const m = team.get(id); if (!m || m.down) return;
      m.f.key(frac); m.keys.push(nowS());
    }
    // a word from this player is done: the strike leaves at once. Returns the ms until its shot leaves.
    function teamStrike(id, tier) {
      const m = team.get(id); if (!m || m.down) return 0;
      m.typed = '';
      // the word lands while the boss's blow is about to hit them: a barrel roll aside, firing on the way
      const now = opts.now ? opts.now() : 0;
      if (atk && st && (atk.target === id || atk.target === 'team') && atk.land - now < 650 && atk.land - now > 0) { m.f.dodge(); tsnd('dodge'); return 70; }
      return m.f.attack(tier);
    }
    const tv = new V(), tw = new V(), lanesX = [];
    function teamTick(t, dt) {
      // how wide each bot may strafe: half the room to its neighbour, less its own width
      lanesX.length = 0;
      for (const id of team.keys()) lanesX.push(laneAt(id, tv).x);
      let gapMin = 9;
      for (let i = 0; i < lanesX.length; i++) for (let j = 0; j < i; j++) gapMin = Math.min(gapMin, Math.abs(lanesX[i] - lanesX[j]));
      const want = clamp(gapMin * 0.22, 0.85, 1.4);
      bsc += (want - bsc) * (bsc === 1 ? 1 : Math.min(1, dt * 4));
      for (const [id, m] of team) {
        laneAt(id, tv);
        let half = 6;
        for (const x of lanesX) if (Math.abs(x - tv.x) > 0.01) half = Math.min(half, Math.abs(x - tv.x) / 2);
        m.kx = clamp((half - 1.3 * bsc) / (2.2 * bsc), 0.1, 1);
        m.f.group.scale.setScalar(bsc);
        const p = st && st.players ? st.players.find(x => x.id === id) : null;
        const down = m.down;
        // live wpm from the last 4 s of keys sets the stance: slow typists hang back, fast ones press in
        while (m.keys.length && t - m.keys[0] > 4) m.keys.shift();
        m.f.setWpm(m.keys.length * 3);
        if (teamWon && !down && !m.won) { m.won = true; m.f.victory(); }
        // turned to the creature it is hitting, or the middle of the boss; to the camera to celebrate a clear
        const foe = p && p.target && foes.get(p.target);
        if (teamWon && !down) tw.copy(homeCam.position);
        else if (cre && foe && foe.alive) cre.hitPos(foe.id, tw); else tw.copy(bossAt);
        let yw = Math.atan2(tw.x - tv.x, tw.z - (tv.z - 2.4));
        // in the fight a bot turns at most 20 degrees off straight ahead, so a dash or a combo runs up its
        // own lane and never through its neighbour's
        if (!(teamWon && !down)) yw = Math.PI + clamp(Math.atan2(Math.sin(yw - Math.PI), Math.cos(yw - Math.PI)), -0.35, 0.35);
        let d = yw - m.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        m.yaw += d * Math.min(1, dt * 5);
        m.f.group.position.set(tv.x, 0, tv.z - 2.4);
        m.f.group.rotation.y = m.yaw;
        m.f.update(dt);
        m.rig.position.x *= m.kx;
        // the ring and its glow follow the bot over the floor
        m.f.bot.group.getWorldPosition(tw);
        m.ring.position.set(tw.x, 0.03, tw.z); m.pool.position.set(tw.x, 0.02, tw.z);
        const aimed = !!(atk && st && (atk.target === id || atk.target === 'team') && !down);
        m.ring.material.color.copy(aimed ? RED : colorOf(id)).multiplyScalar(aimed ? 1.6 + Math.sin(t * 14) * 0.5 : 1.4);
        m.ring.material.opacity = down ? 0.3 : 0.85;
        // a downed bot smokes where it lies, so the knock-out reads from behind
        if (down && !reduce && t > (m.smokeAt || 0)) { m.smokeAt = t + 0.35; smoke(tw.setY(0.9 * bsc), 1, 0.8, { up: 1.2, size: 1.1, life: 1.4, op: 0.3, col: '#3b4246' }); }
      }
    }
    // where a shot leaves a player: the front of their bot, or over their card
    function handAt(id, out) {
      const m = team.get(id);
      if (m) return m.f.muzzle(out);
      return laneAt(id, out).add(v4.set(0, 2.4, -2.4));
    }
    // a move that waits for the bot's wind-up (a shot leaves a strike's ms after the word), on the real clock
    const later = [];
    function after(ms, fn) { if (ms <= 0) fn(); else later.push({ at: nowS() + ms / 1000, fn }); }
    function runLater() {
      if (!later.length) return;
      const t = nowS();
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= t) { const x = later.splice(i, 1)[0]; x.fn(); }
    }

    // ---------- creatures ----------
    let cre = null, kind = '', foes = new Map(), st = null, deadAt = -9, feintAt = 0;
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
        // swept-back horns, a brow ridge and two rows of teeth
        for (const sx of [-1, 1]) {
          const h1 = box(head, 0.22, 0.22, 1.3, mat, sx * 0.62, 0.62, -0.95); h1.rotation.set(0.55, sx * 0.35, 0);
          const h2 = box(head, 0.16, 0.16, 0.8, mat, sx * 0.78, 0.98, -1.6); h2.rotation.set(0.95, sx * 0.45, 0);
          const brow = box(head, 0.5, 0.14, 0.3, mat, sx * 0.5, 0.52, 0.95); brow.rotation.z = sx * -0.35;
        }
        const toothMat = glowMatFor('#ffffff'); toothMat.opacity = 0.55;
        for (let k = 0; k < 5; k++) { const tx = -0.42 + k * 0.21; box(head, 0.08, 0.18, 0.08, toothMat, tx, -0.28, 1.9); box(jaw, 0.08, 0.16, 0.08, toothMat, tx, 0.14, 2.2); }
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
        lunge(id, at, k = 1) { const h = byFoe(id); if (h && (k >= 1 || h.lunge < 0.3)) { h.lunge = 1; h.lk = k; h.lungeTo.copy(at); } },
        gone(id) { const h = byFoe(id); if (h) { h.alive = false; burst(h.head.position, 30, 8, C(pal.a), { up: 0.5 }); } },
        regrow(id) { const h = byFoe(id); if (h) { h.alive = true; h.mat.uniforms.uHit.value = 1.5; } },
        update(dt, t) {
          tail.forEach((m, k) => { m.position.x = Math.sin(t * 1.6 - k * 0.6) * 0.5 * k * 0.3 * still; });
          for (const h of heads) {
            const f = [...foes.values()].find(x => x.slot === h.i);
            if (f) { h.gone = !f.alive && !f.regrowAt; if (f.alive) h.alive = true; }
            h.fall += ((h.alive ? 0 : 1) - h.fall) * Math.min(1, dt * (h.alive ? 3 : 2.2));
            h.lunge = Math.max(0, h.lunge - dt * ((h.lk || 1) < 1 ? 3.6 : 2.4));
            h.bite = Math.max(0, h.bite - dt * 3);
            const sway = still * (1 - h.fall);
            h.pos.set(h.rest.x + Math.sin(t * 1.7 + h.i * 2.1) * 1.0 * sway, h.rest.y + Math.sin(t * 2.3 + h.i) * 0.6 * sway - h.charge * -1.2, h.rest.z + Math.cos(t * 1.3 + h.i) * 0.6 * sway - h.charge * 1.6);
            h.pos.x += Math.sin(t * 47 + h.i) * 0.16 * h.charge * still;   // trembles while it winds up
            if (h.lunge > 0) h.pos.lerp(h.lungeTo, Math.sin(h.lunge * Math.PI) * 0.88 * (h.lk || 1));
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
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const sp = box(queen, 0.18, 1.4, 0.18, qMat, Math.cos(a) * 1.2, 3.1, Math.sin(a) * 1.2); sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      const qRing = new THREE.Mesh(new THREE.TorusGeometry(3, 0.05, 4, 64), glowMatFor(pal.c)); qRing.rotation.x = Math.PI / 2; qRing.position.y = -1.4; queen.add(qRing);
      const tailPts = Array.from({ length: 26 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(pal.a), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); queen.add(s); return { s, k: Math.random() }; });
      holder.add(g);
      const qPos = new V();
      let qHit = 0;
      return {
        g,
        anchor(id, out) { return out.copy(queen.position).add(v4.set(0, 5.2, 0)); },
        hitPos(id, out) { return out.copy(queen.position); },
        source(out) { return out.copy(qPos).add(v4.set(0, -1, 1)); },
        hit(id) { qHit = Math.min(1, qHit + 0.5); },
        charge() {},
        lunge() { for (const a of arms) a.rotation.x = -0.9; },
        gone() {},
        regrow() {},
        update(dt, t) {
          qPos.set(Math.sin(t * 0.9) * 3.2 * still, 7.4 + Math.sin(t * 1.7) * 0.8 * still, -6 + Math.sin(t * 0.6) * 1.2 * still);
          queen.position.copy(qPos);
          queen.rotation.y = Math.sin(t * 0.5) * 0.25 * still;
          hood.rotation.y += dt * 0.3;
          qRing.rotation.z += dt * 0.8; qRing.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
          cache.forEach((c, k) => { const a = t * 1.5 + k / cache.length * Math.PI * 2; c.position.set(Math.cos(a) * 3.8, Math.sin(a * 2 + k) * 0.5, Math.sin(a) * 2.2); c.rotation.set(a, a * 0.7, 0); });
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
      // the headlight: a cone of light thrown ahead of the train onto the track
      const beamG = new THREE.ConeGeometry(1.6, 7, 20, 1, true); beamG.translate(0, -3.5, 0); beamG.rotateX(-Math.PI / 2 + 0.12);
      const beamM = new THREE.MeshBasicMaterial({ map: glowTex, color: C(pal.eye, 0.35), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const headBeam = new THREE.Mesh(beamG, beamM); headBeam.position.set(0, 1.15, 1.5); head.add(headBeam);
      for (const sx of [-1, 1]) for (const z of [-0.8, 0.8]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 14), hMat); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.2, 0.35, z); head.add(w); }
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
      const pathAt = trainPath;
      let tt = 0, charge = 0, lunge = 0, lk = 1, whip = 0, hHit = 0;
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
        lunge(id, at, k = 1) { if (k >= 1 || lunge < 0.3) { lunge = 1; lk = k; lungeTo.copy(at); } },
        chip() { whip = 1; },
        gone(id, how) {
          const x = cars.get(id); if (!x) return;
          x.dead = 0.001;
          x.vel.set(rnd(-1, 1) * 5, 6, rnd(2, 5)); x.spin = rnd(-6, 6);
          burst(x.m.position, how === 'cut' ? 30 : 18, 7, C(pal.c), { up: 0.6 }); shake = Math.max(shake, 0.3);
        },
        regrow() {},
        update(dt, t) {
          tt += dt * (1.4 + 0.4 * (1 - order().length / 12)) * still;
          pathAt(tt, hp);
          charge = Math.max(0, charge);
          lunge = Math.max(0, lunge - dt * (lk < 1 ? 3.6 : 2.4)); whip = Math.max(0, whip - dt * 2);
          if (lunge > 0) hp.lerp(lungeTo, Math.sin(lunge * Math.PI) * 0.88 * lk);
          hp.x += Math.sin(t * 50) * 0.18 * charge * still;
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
      box(head, 2.1, 0.3, 1.9, mat, 0, 1.45, 0); box(head, 0.3, 0.9, 1.5, mat, 0, 1.9, -0.1);   // crest
      // vents on the chest and two exhaust stacks on the back that glow with the charge
      const vent = glowMatFor(pal.c); vent.opacity = 0.6;
      for (let k = 0; k < 3; k++) for (const sx of [-1, 1]) box(torso, 0.9, 0.12, 0.08, vent, sx * 1.8, 2.3 - k * 0.35, 1.58);
      const stacks = [-1, 1].map(sx => { const st = box(torso, 0.7, 2.4, 0.7, dark, sx * 1.4, 4.4, -1.4); const glowTop = box(torso, 0.5, 0.15, 0.5, glowMatFor(pal.c), sx * 1.4, 5.65, -1.4); return glowTop; });
      const arms = [-1, 1].map(s => {
        const a = new THREE.Group(); a.position.set(s * 3.3, 3.2, 0); torso.add(a);
        box(a, 2, 1.5, 2.1, mat, 0, 0.2, 0);
        box(a, 1.2, 2.6, 1.3, dark, 0, -1.6, 0);
        const fore = new THREE.Group(); fore.position.set(0, -3, 0); a.add(fore);
        box(fore, 1.5, 2.4, 1.6, mat, 0, -1.1, 0);
        box(fore, 1.9, 1.5, 1.9, mat, 0, -2.8, 0.1);
        // a pauldron over the shoulder, a knuckle row and a lit band on the forearm
        const pd = box(a, 2.5, 0.7, 2.6, dark, s * 0.25, 1.1, 0); pd.rotation.z = -s * 0.3;
        for (let k = 0; k < 4; k++) box(fore, 0.34, 0.34, 0.4, dark, -0.6 + k * 0.4, -3.45, 0.85);
        const band = glowMatFor(pal.c); band.opacity = 0.7; box(fore, 1.56, 0.14, 1.66, band, 0, -0.4, 0);
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
        lunge(id, at, k = 1) { if (k < 1) { stomp = 1; shake = Math.max(shake, 0.25); } else { slam = 1; v1.copy(at); } },
        chip() { stomp = 1; },
        weak(on) { weakOn = on; },
        gone() { burst(v1.set(0, 6, -3), 60, 10, C(pal.a), { up: 0.6, size: 0.4 }); },
        regrow() {},
        update(dt, t) {
          slam = Math.max(0, slam - dt * 2.2); stomp = Math.max(0, stomp - dt * 3);
          if (slam > 0.85 && slam - dt * 2.2 <= 0.85) { ring(v2.set(0, 0, 0), C(pal.a), 12, 0.6); shake = Math.max(shake, 0.7); }
          weakK += ((weakOn ? 1 : 0) - weakK) * Math.min(1, dt * 5);
          const breathe = Math.sin(t * 2.4) * 0.16 * still;
          torso.position.y = 4.1 + breathe - stomp * 0.3;
          torso.position.x = Math.sin(t * 45) * 0.09 * charge * still;
          g.position.x = Math.sin(t * 0.8) * 1.6 * still;
          g.rotation.y = Math.sin(t * 0.8 + 1) * 0.12 * still;
          torso.rotation.x = -charge * 0.25 + Math.sin(slam * Math.PI) * 0.35;
          for (const A of arms) {
            const up = charge * 2.6 - Math.sin(slam * Math.PI) * 1.2;
            A.a.rotation.x = -up + Math.sin(t * 1.1 + A.s) * 0.08 * still;
            A.a.rotation.z = A.s * (0.12 + charge * 0.25);
            A.fore.rotation.x = -0.3 - charge * 0.8;
          }
          plates.forEach((p, k) => { p.position.x = (k ? 1 : -1) * (0.52 + weakK * 0.95); });
          core.scale.setScalar(1 + weakK * (0.35 + Math.sin(t * 10) * 0.08));
          core.rotation.y += dt * (1 + weakK * 5);
          core.material.color.copy(C(pal.c, 1.3)).lerp(GOLD, weakK * 0.8);
          head.rotation.y = Math.sin(t * 1.1) * 0.35 * still;
          visor.material.color.copy(C(pal.eye, 1.6)).lerp(RED, charge);
          stacks.forEach(gt => { gt.material.color.copy(C(pal.c, 1.4)).lerp(RED, charge); gt.scale.y = 1 + charge * 3; });
          if (charge > 0.3 && Math.random() < dt * 20 * charge) for (const sx of [-1, 1]) smoke(v3.set(g.position.x + sx * 1.4, 10.6, g.position.z - 1.4), 1, 1.5, { up: 1.5, size: 1.4, life: 1.2, op: 0.35, col: '#4a4f52' });
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
        const orbits = [0, 1].map(k => { const r = new THREE.Mesh(new THREE.TorusGeometry(2.4 + k * 0.6, 0.035, 4, 64), glowMatFor(col)); r.material.opacity = 0.7; grp.add(r); return r; });
        return { orbits, i, grp, fill, wire, parts, shards, eye, home: new V(i ? 4.8 : -4.8, 5.2, -3), alive: true, k: 0, charge: 0, lunge: 0, lungeTo: new V(), hit: 0 };
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
        lunge(id, at, k = 1) { const s = bySlot(id); if (s && (k >= 1 || s.lunge < 0.3)) { s.lunge = 1; s.lk = k; s.lungeTo.copy(at); } },
        gone(id) { const s = bySlot(id); if (s) { s.alive = false; burst(s.grp.position, 36, 9, C(s.i ? pal.c : pal.a), { up: 0.3 }); } },
        regrow(id) { const s = bySlot(id); if (s) { s.alive = true; s.hit = 1.5; } },
        update(dt, t) {
          for (const s of sides) {
            const f = [...foes.values()].find(x => x.slot === s.i);
            if (f) s.alive = f.alive;
            s.k += ((s.alive ? 0 : 1) - s.k) * Math.min(1, dt * 3);
            s.lunge = Math.max(0, s.lunge - dt * ((s.lk || 1) < 1 ? 3.6 : 2.4));
            const ph = t * 1.5 + (s.i ? 0.5 : 0);
            s.grp.position.set(s.home.x + Math.sin(ph) * 1.3 * still * (s.i ? -1 : 1) + Math.sin(t * 46 + s.i) * 0.15 * s.charge * still, s.home.y + Math.sin(ph * 1.3) * 0.8 * still + s.charge * 0.8, s.home.z + Math.cos(ph * 0.7) * 0.8 * still);
            if (s.lunge > 0) s.grp.position.lerp(s.lungeTo, Math.sin(s.lunge * Math.PI) * 0.7 * (s.lk || 1));
            s.grp.rotation.y += dt * (0.6 + s.charge * 3) * (s.i ? -1 : 1);
            // a fallen twin comes apart into a slow ring of pieces
            s.parts.forEach((p, k) => {
              const a = t * 0.5 + k * 2.1;
              p.m.position.set(Math.cos(a) * 2.6 * s.k, p.home.y * (1 - s.k) - s.k * 3 + Math.sin(a) * s.k, Math.sin(a) * 2.6 * s.k);
              p.m.rotation.x = s.k * a;
            });
            s.orbits.forEach((r, k) => { r.rotation.set(t * (0.8 + k * 0.5) + k, t * (0.5 - k * 0.3), 0.4 * k); r.material.opacity = (0.7 - s.k * 0.6) * (1 + s.charge); r.scale.setScalar(1 - s.charge * 0.3); });
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
    // the snake's route, shared with the arena so the track is laid where the train runs
    const trainPath = (tt, out) => out.set(Math.sin(tt * 0.36) * 10.5, 0, -6.2 + Math.sin(tt * 0.72) * 4.2);
    function applyPal(look, k) {
      pal = PALS[look] || PALS[0];
      if (arena) { arena.set(pal, k, trainPath); return; }
      scene.background.set(pal.bg); scene.fog.color.set(pal.bg);
      wall.material.color.copy(C(pal.a));
      grid.material.color.copy(C(pal.b));
      pillarMat.uniforms.uCol.value.copy(C(pal.b, 0.55));
      floorRing.material.color.copy(C(pal.a));
    }
    function setFight(f) {
      clearCreature();
      teamWon = false;
      for (const m of team.values()) { m.won = false; if (!m.down) m.f.rise(); }
      kind = f.kind; applyPal(f.look || 0, f.kind);
      foes = new Map((f.foes || []).map(x => [x.id, x]));
      deadAt = -9;
      cre = (BUILD[kind] || golem)();
      if (kind === 'swarm') mites = miteLayer(out => cre.source(out));
      else if (f.adds === 'mites') { const main = (f.foes || [])[0]; mites = miteLayer(out => cre.hitPos(main && main.id, out).add(v4.set(0, 1, 1))); }
      if (fx) fx.clear();
      teamWon = false; frags.count = 0; fragS.forEach(f => { f.life = 0; });
      dieT = 0; holder.visible = true; holder.position.y = 0; holder.scale.set(1, 1, 1);
      if (dir) dir.reset();
      want('reveal', { pri: 3 });
      snd('reveal'); roarT = 2.2;
      // the new creature's shaders compile before its first frame, not during the fight
      try { renderer.compile(scene, camera); } catch (e) {}
    }

    // ---------- the attack being wound up ----------
    let atk = null, weakWas = false;
    const aimV = new V(), fromV = new V();
    function sync(s) {
      st = s;
      teamSync(s.players);
      if (s.foes) { const m = new Map(); for (const x of s.foes) m.set(x.id, x); for (const [id, x] of foes) if (!m.has(id) && x.kind === 'mite') m.set(id, { ...x, alive: false }); foes = m; }
      atk = s.attack || null;
      if (cre && cre.weak) { const on = s.weak > 0; if (on && !weakWas) want('weak', { pri: 2 }); weakWas = on; cre.weak(on); }
    }
    // the charge: a ball of light gathers at the attacker as sparks stream into it, its colour turning
    // to red, while the aim lines and target rings tighten on whoever it will hit
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff4d5e', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    orb.visible = false; orb.renderOrder = 6; scene.add(orb);
    const orbCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    orbCore.visible = false; orbCore.renderOrder = 7; scene.add(orbCore);
    let atkK = 0, sparkT = 0, roarT = 0;
    function drawAttack(t, dt) {
      for (const a of aims) a.visible = false;
      for (const r of aimRings) r.visible = false;
      orb.visible = orbCore.visible = false; atkK = 0;
      if (!cre) return;
      for (const f of foes.values()) if (cre.charge) cre.charge(f.id, 0);
      // the roar as a fight starts: every part of the boss rears up together
      if (roarT > 0 && cre.charge) { roarT -= dt; const rk = Math.sin(Math.min(1, (2.2 - roarT) / 2.2) * Math.PI) * 0.75; for (const f of foes.values()) if (f.alive && f.kind !== 'mite') cre.charge(f.id, rk); }
      if (!atk || !st) return;
      const now = opts.now ? opts.now() : 0;
      const s0 = atk.show || atk.start;   // the counter word comes first; the wind-up shows after the lead
      const k = clamp((now - s0) / Math.max(1, atk.land - s0), 0, 1);
      atkK = k;
      if (atk.from && cre.charge) cre.charge(atk.from, smooth(k));
      cre.hitPos(atk.from, fromV);
      if (k > 0) {
        const pulse = 1 + Math.sin(t * (10 + k * 30)) * 0.12;
        orb.visible = orbCore.visible = true;
        orb.position.copy(fromV).add(v4.set(0, 0.4, 1.2)); orbCore.position.copy(orb.position);
        orb.scale.setScalar((1.2 + k * 4.2) * pulse); orbCore.scale.setScalar((0.4 + k * 1.6) * pulse);
        orb.material.opacity = 0.25 + k * 0.55; orbCore.material.opacity = 0.35 + k * 0.65;
        orb.material.color.copy(C(pal.c)).lerp(RED, smooth(k)).multiplyScalar(1.6);
        sparkT -= dt;
        if (sparkT <= 0 && !reduce) {
          sparkT = 0.05 - k * 0.03;
          // sparks start out round the orb and fly into it
          v1.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(3.5 + k * 2.5);
          const p = parts[pI = (pI + 1) % PN];
          p.s.material.color.copy(C(pal.c)).lerp(RED, k).multiplyScalar(1.8);
          p.s.position.copy(orb.position).add(v1); p.v.copy(v1).multiplyScalar(-1.6); p.size = 0.22; p.max = p.life = 0.55; p.grav = 0; p.s.visible = true;
        }
        if (arena) arena.bossLight.intensity = 40 + k * 60;
      }
      const ids = atk.target === 'team' ? st.players.filter(p => !p.down).map(p => p.id) : [atk.target];
      ids.slice(0, 4).forEach((id, i) => {
        laneAt(id, aimV);
        const pulse = 0.5 + 0.5 * Math.sin(t * (8 + k * 18));
        aims[i].material.color.copy(RED);
        strip(aims[i], orb.visible ? orb.position : fromV, v2.copy(aimV).add(v4.set(0, 1.2, -2.4)), 0.1 + k * 0.35, (0.12 + k * 0.5) * (0.6 + 0.4 * pulse));
        const r = aimRings[i];
        r.visible = true; r.position.set(aimV.x, 0.06, aimV.z - 2.4);
        r.scale.setScalar(2.4 - k * 1.2); r.material.opacity = 0.3 + k * 0.6 * pulse;
      });
    }

    // smoke and dust, drawn normally so they read as dust and not as light
    const SN = 50;
    const puffs = Array.from({ length: SN }, () => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#7d888c', transparent: true, depthWrite: false, opacity: 0 })); m.visible = false; m.renderOrder = 4; scene.add(m); return { s: m, v: new V(), life: 0, max: 1, size: 1, op: 0.5 }; });
    let sI = 0;
    let smokeK = 1;   // adaptive quality halves the smoke on a slow device
    function smoke(at, n, speed, o = {}) {
      if (reduce) n = Math.ceil(n / 2);
      n = Math.ceil(n * smokeK);
      for (let k = 0; k < n; k++) {
        const p = puffs[sI = (sI + 1) % SN];
        p.s.position.copy(at).add(v4.set(rnd(-0.6, 0.6), rnd(0, 0.3), rnd(-0.6, 0.6)));
        p.v.set(rnd(-1, 1), rnd(0.1, 0.5) + (o.up || 0), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.4, 1));
        p.size = (o.size || 1.6) * rnd(0.7, 1.3); p.max = p.life = (o.life || 1.3) * rnd(0.7, 1.2);
        p.s.material.color.set(o.col || '#6f7a7e'); p.op = o.op || 0.5; p.s.visible = true;
      }
    }
    // pieces of the boss: glowing blocks that fly off when a part of it falls or it dies
    const FN = 70;
    const fragMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const frags = new THREE.InstancedMesh(boxGeo(1, 1, 1), fragMat, FN);
    frags.instanceMatrix.setUsage(THREE.DynamicDrawUsage); frags.count = 0; frags.frustumCulled = false; scene.add(frags);
    const fragS = Array.from({ length: FN }, () => ({ p: new V(), v: new V(), r: new V(), w: new V(), s: 0.3, life: 0 }));
    let fI = 0;
    const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _sc = new V();
    function shatter(at, n, speed, size = 0.5) {
      if (reduce) n = Math.ceil(n / 2);
      fragMat.color.copy(C(pal.a, 1.3));
      for (let k = 0; k < n; k++) {
        const f = fragS[fI = (fI + 1) % FN];
        f.p.copy(at).add(v4.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)));
        f.v.set(rnd(-1, 1), rnd(0.4, 1.4), rnd(-1, 0.25)).normalize().multiplyScalar(speed * rnd(0.4, 1));
        f.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); f.w.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
        f.s = size * rnd(0.4, 1.2); f.life = rnd(1.2, 2.2);
      }
      frags.count = FN;
    }
    function drawFrags(dt) {
      if (!frags.count) return;
      let live = 0;
      fragS.forEach((f, i) => {
        if (f.life > 0) {
          f.life -= dt; live++;
          f.v.y -= 16 * dt; f.p.addScaledVector(f.v, dt);
          if (f.p.y < f.s / 2) { f.p.y = f.s / 2; f.v.y *= -0.35; f.v.x *= 0.7; f.v.z *= 0.7; }
          f.r.addScaledVector(f.w, dt);
        }
        const k = f.life > 0 ? Math.min(1, f.life * 2) : 0;
        _m4.compose(f.p, _q.setFromEuler(_e.set(f.r.x, f.r.y, f.r.z)), _sc.setScalar(Math.max(0.0001, f.s * k)));
        frags.setMatrixAt(i, _m4);
      });
      frags.instanceMatrix.needsUpdate = true;
      if (!live) frags.count = 0;
    }

    // ---------- events ----------
    const hitAt = new V();
    function shot(h) {
      const ms = teamStrike(h.id, Math.min(3, (h.tier || 0) + (h.crit ? 1 : 0)));
      if (!h.you && (h.tier || 0) >= 2) tsnd('attack');
      if (!cre) { if (opts.onImpact) opts.onImpact(h, null, null); return; }
      // the shot leaves the bot's orb as the strike releases, a few frames after the word
      after(ms, () => { if (cre) fire(h); });
    }
    function fire(h) {
      const from = handAt(h.id, new V());
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
      // plain words fly as a thin streak on an arc (the combat layer's basic bolt is drawn for a far
      // camera and filled the near screen here); your combo shots and keyboard signatures use the combat layer
      const tier = h.you ? Math.min(3, h.tier || 0) : 0;
      if (fx && (tier >= 2 || (h.you && myKb && myKb !== 'slab'))) fx.shot(tier, from, to, land, { color: col, kb: h.you ? myKb : null, w: 0.5 });
      // your board's switch and shot sound (js/app/kb-shots.js)
      if (h.you && myKb !== 'slab' && window.KbShots) KbShots.play(myKb, { ctx: opts.audio && opts.audio.ctx, vol: 0.8, big: tier >= 3 || !!h.crit });
      else {
        const sc = col ? C(col) : h.you ? C('#eafff4') : colorOf(h.id);
        streak(from, to, sc, h.crit ? 0.3 : 0.26, land, h.you ? 1 : 0.7);
        // a double (tier 1): a second, thinner bolt right behind the first
        if ((h.tier || 0) === 1) after(70, () => { if (cre) streak(handAt(h.id, new V()), to, sc, 0.26, null, h.you ? 0.6 : 0.45); });
      }
    }
    // the spell's target: a foe, its hit glow, and (spell-fx, 28 Nov 2026) the guard and the sidestep of a fizzle
    function spellTarget(foe) {
      return {
        size: kind === 'swarm' ? 3 : 4,
        pos: out => foePos(foe, out),
        top: out => foePos(foe, out).add(v4.set(0, 2.5, 0)),
        base: out => foePos(foe, out).setY(0),
        react: (k, p, x) => {
          if (!cre) return;
          if (k === 'dodge') { dodgeAt = nowS(); dodgeSide = (x && x.side) || 1; if (opts.onGuard) opts.onGuard('dodge'); return; }
          cre.hit(foe, k === 'block' ? 0.6 : 1);
          if (k === 'block') { punch = Math.max(punch, 0.25); if (opts.onGuard) opts.onGuard('block'); }
        },
      };
    }
    let dodgeAt = -9, dodgeSide = 1;
    function cast(id, c = {}) {
      const m = team.get(c.from || 'me');
      if (m && !m.down) m.f.spell();
      if (!fx || !cre) { if ((c.from || 'me') === 'me') want('spell', { pri: 2 }); return; }
      const caster = { pos: out => handAt(c.from || 'me', out) };
      fx.cast(id, { caster, target: spellTarget(c.foe), hits: c.hits, effect: c.effect });
      // your own spell: the shot follows it from your bot to the foe (spellCam)
      if ((c.from || 'me') === 'me') spellCam(id, c.hits, c.foe, false);
    }
    function fizzle(id, c = {}) {
      const m = team.get(c.from || 'me');
      if (m && !m.down) m.f.typo();
      if (!fx || !cre) return;
      fx.fizzle(id, { caster: { pos: out => handAt(c.from || 'me', out) }, target: spellTarget(c.foe), how: c.how });
      if ((c.from || 'me') === 'me') spellCam(id, null, c.foe, true);
    }
    // sounds go through opts.audio (an ArenaAudio on the run's audio context)
    const snd = (name, arg) => { if (opts.audio) opts.audio.play(name, arg); };
    let punch = 0;
    function attackLands(a) {
      if (!cre) return;
      const ids = a.target === 'team' ? (st ? st.players.filter(p => !p.down).map(p => p.id) : []) : [a.target];
      ids.forEach(id => {
        const m = team.get(id), p = st && st.players.find(x => x.id === id);
        if (!m || m.down) return;
        if (p && p.shield) { m.f.block(); tsnd('cover'); } else { m.f.hit(v3.set(rnd(-0.5, 0.5), 0.2, -1), 1); tsnd('hit'); }
      });
      const from = a.from || (st && st.foes[0] && st.foes[0].id);
      // the lunge stops above and in front of the player, so it never covers them on screen
      if (ids.length === 1) { laneAt(ids[0], v1).add(v4.set(0, 3.8, -5.5)); cre.lunge(from, v1); }
      else cre.lunge(from, v1.set(0, 4.5, teamZ - 7.5));
      for (const id of ids) {
        laneAt(id, v2); v2.z -= 2.4;
        burst(v2.clone().add(v4.set(0, 1.4, 0)), 18, 8, RED, { up: 0.6 }); ring(v2, RED, 3.2, 0.5); ring(v2, C('#ffffff'), 1.8, 0.3);
        smoke(v2, 5, 2.4, { size: 2, life: 1.2, op: 0.45 });
      }
      if (arena) arena.pulse(a.target === 'team' ? 1 : 0.6);
      shake = Math.max(shake, a.target === 'team' ? 0.8 : 0.5); punch = Math.max(punch, a.target === 'team' ? 1 : 0.6);
      hitStop = Math.max(hitStop, performance.now() + (reduce ? 0 : 90));
      snd('bossLunge'); snd('bossSlam');
    }
    function block(b) {
      if (!cre || !atk) return;
      cre.hitPos(atk.from, v1);
      const by = b.by === 'firewall' ? (atk.target === 'team' ? 'me' : atk.target) : b.by;
      const bm = team.get(by);
      if (bm && !bm.down) { bm.f.block(); tsnd('cover'); }
      handAt(by, v2);
      bolt(v2.clone(), orb.visible ? orb.position.clone() : v1, SHIELD, 0.45, 0.7);
      burst(v1, 24, 7, SHIELD, {});
      // the gathered charge bursts apart
      if (orb.visible) { burst(orb.position, 30, 9, C(pal.c), { size: 0.3 }); ring(v3.copy(orb.position).setY(0.1), SHIELD, 6, 0.5); }
      if (cre.charge && atk.from) cre.charge(atk.from, 0);
      cre.hit(atk.from, 1.2);
      snd('block'); snd('shatter', 0.6);
    }
    const CHIP_SND = { spit: 'spit', whip: 'whip', quake: 'quake', beam: 'beam' };
    function chip(c) {
      if (!cre) return;
      if (cre.chip) cre.chip();
      cre.hitPos(c.from, v1);
      for (const id of c.targets || []) { laneAt(id, v2); v2.z -= 2.4; v2.y += 1.6; bolt(v1, v2, c.what === 'spit' ? C(pal.c) : RED, c.what === 'beam' ? 0.5 : 0.3, c.what === 'quake' ? 0.2 : c.what === 'beam' ? 0.6 : 0.32); burst(v2, 8, 4, RED, {}); const m = team.get(id); if (m && !m.down) m.f.hit(v4.set(rnd(-0.6, 0.6), 0, -1), 0.4); }
      if (c.what === 'quake') { ring(v1.set(0, 0, -2), RED, 14, 0.7); smoke(v1.set(0, 0.2, -1), 8, 5, { size: 2.2, life: 1.4, op: 0.4 }); shake = Math.max(shake, 0.4); if (arena) arena.pulse(0.8); }
      snd(CHIP_SND[c.what] || 'teamHit');
    }
    function foeGone(id, how) {
      if (!cre) return;
      if (isMite(id)) {
        mites.gone(id, how);
        const f = foes.get(id), m = f && f.lane && team.get(f.lane);
        if (how === 'bite' && m && !m.down) m.f.hit(v4.set(rnd(-0.5, 0.5), 0.3, -1), 0.6);
        return;
      }
      const f = foes.get(id);
      cre.hitPos(id, v1);
      cre.gone(id, how);
      if (how === 'kill' || how === 'cut') {
        shatter(v1, how === 'cut' ? 8 : 16, 7, how === 'cut' ? 0.3 : 0.42); burst(v1, 30, 10, C('#ffffff'), { size: 0.35, life: 0.5, grav: 2 });
        snd('sever'); hitStop = Math.max(hitStop, performance.now() + (reduce ? 0 : 120));
        // a head or a twin falls: a slow close look at it, if nothing is coming at the team
        if (f && (f.kind === 'head' || f.kind === 'twin')) want('sever', { x: v1.clone(), pri: 3 });
      }
    }
    function regrow(id) { if (cre) cre.regrow(id); const f = foes.get(id); if (f && cre) { cre.hitPos(id, v1); burst(v1, 26, 6, C(pal.c), { up: 0.8 }); ring(v3.copy(v1).setY(0.05), C(pal.c), 5, 0.6); snd('bossRoar'); } }
    function down(id) { const m = team.get(id); if (m && !m.down) { m.f.ko(); m.down = true; tsnd('down'); } laneAt(id, v1); v1.z -= 2.4; burst(v1.clone().setY(1.5), 24, 8, RED, { up: 1 }); ring(v1, RED, 3, 0.6); smoke(v1, 5, 2, { size: 1.8, op: 0.4 }); snd('knock'); }
    // a heal, a shield or a revive from one bot to another: the giver strikes and a beam of light joins them
    function giveBeam(id, by, col) {
      const g = team.get(by); if (!g || g.down || by === id) return;
      const ms = g.f.attack(0);
      after(ms, () => { handAt(by, v2); handAt(id, v3); if (!team.get(id)) return; v3.y = Math.max(1.6, v3.y); bolt(v2.clone(), v3.clone(), col, 0.4, 0.55); });
    }
    function heal(id, by) { laneAt(id, v1); v1.z -= 2.4; burst(v1.clone().setY(1.6), 22, 4, HEAL, { up: 1.4, grav: -2, life: 0.9 }); ring(v1, HEAL, 2.2, 0.5); giveBeam(id, by, HEAL); tsnd('heal'); snd('heal'); }
    function shield(id, by) { laneAt(id, v1); v1.z -= 2.4; ring(v1, SHIELD, 2.6, 0.6); burst(v1.clone().setY(1.8), 16, 3, SHIELD, { up: 1, grav: -1 }); giveBeam(id, by, SHIELD); const m = team.get(id); if (m && !m.down) m.f.block(); snd('shield'); }
    function up(id, by) { const m = team.get(id); if (m) { m.f.rise(); m.down = false; } if (by) giveBeam(id, by, HEAL); laneAt(id, v1); v1.z -= 2.4; ring(v1, HEAL, 3, 0.6); burst(v1.clone().setY(1), 20, 5, HEAL, { up: 1.6, grav: -2 }); tsnd('revive'); snd('revive'); }
    // the boss dies: it bursts into pieces, slow motion, and the camera circles where it stood
    function clear() {
      teamWon = true; deadAt = nowS(); atk = null;
      setTimeout(() => tsnd('victory'), 700);
      const at = cre ? cre.hitPos(null, new V()) : new V(0, 5, -3);
      for (const f of foes.values()) { if (cre && f.alive) cre.gone(f.id, 'kill'); f.alive = false; }
      shake = Math.max(shake, 1); punch = 1;
      burst(at, 80, 12, C(pal.a), { up: 0.5, size: 0.4, life: 1.2 });
      burst(at, 30, 6, C('#ffffff'), { size: 0.5, life: 0.4, grav: 0 });
      shatter(at, 60, 14, 0.6); smoke(v1.copy(at).setY(0.5), 12, 6, { size: 3, life: 2, op: 0.45 });
      ring(v1.copy(at).setY(0.05), C(pal.a), 16, 1); ring(v1.copy(at).setY(0.05), C('#ffffff'), 9, 0.6);
      if (arena) arena.pulse(1.4);
      killAt.copy(at); dieT = 0.001;
      if (!reduce) { slowUntil = performance.now() + 1400; slowK = 0.3; }
      want('kill', { pri: 5 });
      snd('shatter', 1);
    }
    const killAt = new V();
    let slowUntil = 0, slowK = 1, dieT = 0, dieSpawn = 0;
    // the dead boss glitches, sinks and comes apart into pieces over a second and a half
    function drawDeath(dt) {
      if (!dieT) return;
      dieT += dt;
      const u = Math.min(1, dieT / 1.5);
      holder.position.y = -Math.pow(u, 2) * 4;
      holder.scale.set(1 + u * 0.08, 1 - 0.6 * Math.pow(u, 1.5), 1 + u * 0.08);
      holder.visible = u < 1 && !(u > 0.45 && Math.random() < u * 0.5);
      dieSpawn -= dt;
      if (u < 1 && dieSpawn <= 0) { dieSpawn = 0.12; shatter(v3.set(killAt.x + rnd(-3, 3), rnd(1, 8) * (1 - u), killAt.z + rnd(-2, 2)), 6, 8, 0.4); burst(v3, 6, 5, C(pal.a), { size: 0.3 }); }
      if (u >= 1) { dieT = 0; holder.visible = false; }
    }

    const _s = new V();
    function screen(p) {
      const w = W, h = H;
      _s.copy(p).project(camera);
      if (_s.z > 1) return null;
      return { x: (_s.x + 1) / 2 * w, y: (1 - _s.y) / 2 * h };
    }
    function anchors() {
      const out = new Map();
      if (!cre || lineupNow()) return out;
      for (const f of foes.values()) {
        if (!f.alive) continue;
        const p = f.kind === 'mite' ? (mites ? mites.anchor(f.id, v3) : null) : cre.anchor(f.id, v3);
        if (!p) continue;
        const s = screen(p);
        if (s) out.set(f.id, { x: s.x, y: s.y, on: true });
      }
      return out;
    }

    // ---------- the camera director (js/app/camdir.js) ----------
    // Home is the wide view over the team at the boss. While the boss winds up, the home view leans
    // a little toward it. Cutaways: the boss rising at the start of a fight, a head or a twin falling,
    // the core opening, and the kill. None plays while an attack is winding up at the team or a mite
    // is about to land, so the counter word, the aim lines and the mites stay in view.
    const bossAt = new V(), lookTo = new V(), myAt = new V();
    function bossCentre(out) { if (!cre) return out.set(0, 5, -4); return cre.hitPos(atk ? atk.from : null, out); }
    const shots = {
      game: { fov: 42, omega: 4, pose(c, out) {
        const t = c.t, lean = smooth(atkK) * 0.18;
        out.pos.set(camBase.x + Math.sin(t * 0.21) * 0.5 * still, camBase.y + Math.sin(t * 0.17) * 0.2 * still, camBase.z - lean * 2.5);
        out.look.copy(camLook).lerp(bossAt, lean);
        out.fov = 42 - lean * 8;
      } },
      reveal: { pri: 3, free: true, parts: [
        // the team from the boss's side, low, every bot turned to the camera as it squares up; then low
        // between the team and the boss, looking up as it rises; then a three-quarter from its side
        { len: 1.3, cut: 1, fov: 50, omega: 3, pose(c, out) {
          // far enough back that the outer bots and their parts stay in frame on any stage shape; the
          // boss isn't drawn yet in this part (it rises in the next), so it never stands in the way
          const z = teamZ - 2.4, u = c.u;
          let wide = 0; for (const id of team.keys()) wide = Math.max(wide, Math.abs(laneAt(id, myAt).x));
          const far = Math.max(7.5, (wide + 3 * bsc) / (Math.tan(THREE.MathUtils.degToRad(25)) * camera.aspect), (2.2 * bsc) / Math.tan(THREE.MathUtils.degToRad(25)));
          out.pos.set(Math.sin(u * 0.8 - 0.4) * 2, 1.9 + u * 0.4, z - far - 1 + u * 0.8); out.look.set(0, 2.5 * bsc, z);
        } },
        { len: 1.2, cut: 1, fov: 46, omega: 3, pose(c, out) { const u = c.u; out.pos.set(-8 + u * 4, 0.9 + u * 1.6, 2.2); out.look.set(bossAt.x, 3.5 + u * 2.5, bossAt.z); } },
        { len: 1.0, cut: 1, fov: 38, omega: 3, pose(c, out) { out.pos.set(9, 5 + c.u * 1.5, 3.5); out.look.set(bossAt.x, bossAt.y + 1, bossAt.z); } },
      ] },
      sever: { pri: 3, parts: [
        { len: 1.25, cut: 1, slow: 0.4, fov: 36, pose(c, out) { const x = c.x || bossAt; out.pos.set(x.x * 0.6 + 4, x.y + 1.2, x.z + 11 - c.u * 1.5); out.look.copy(x); } },
      ] },
      // your spell: from behind your bot's shoulder, low, as it rises and drives in at the boss
      spell: { pri: 2, parts: [
        { len: 1.05, cut: 1, slow: 0.6, fov: 44, pose(c, out) {
          const m = team.get('me'); if (m) m.f.group.getWorldPosition(myAt); else laneAt('me', myAt);
          const side = myAt.x > 0 ? 1 : -1;
          out.pos.set(myAt.x + side * (4.6 - c.u * 0.8), 3 + c.u * 0.9, myAt.z + 9.5 - c.u * 1.5);
          out.look.copy(myAt).setY(3.4).lerp(bossAt, 0.55);
        } },
      ] },
      weak: { pri: 2, len: 1.5, fov: 34, pose(c, out) { out.pos.set(3.5, 6.5, 8.5 - c.u * 1.2); out.look.copy(bossAt); } },
      kill: { pri: 5, free: true, duringThreat: true, parts: [
        { len: 1.4, cut: 1, slow: 0.3, fov: 40, pose(c, out) { out.pos.set(killAt.x + 6, 2.2, killAt.z + 10); out.look.set(killAt.x, killAt.y, killAt.z); } },
        { len: 2.0, cut: 1, fov: 44, omega: 2.5, pose(c, out) { const a = -0.7 + c.u * 1.2; out.pos.set(killAt.x + Math.sin(a) * 15, 6.5 + c.u * 2, killAt.z + Math.cos(a) * 15); out.look.set(killAt.x, 3, killAt.z); } },
      ] },
    };
    // your spell, two beats (spell-fx, 28 Nov 2026; Gid: not just a close-up on the bot): behind your bot's
    // shoulder as it leaves, then three-quarters on the foe it's going for as it lands. Sized from its hits.
    const foeAt = new V();
    let spellCamAt = -9;
    function spellCam(id, hits, foe, fizz) {
      if (reduce || !dir) return;
      const sp = window.Combat && Combat.spell(id);
      if (!fizz && sp && !sp.strike) { want('spell', { pri: 2 }); return; }
      const f = hits && hits.length ? hits[0].at / 1000 : 0.5, last = hits && hits.length ? hits[hits.length - 1].at / 1000 : f;
      const a = Math.round(clamp(f - 0.4, 0.2, 0.6) * 20) / 20, b = Math.round(clamp(f - 0.25 - a + Math.min(1.6, last - f) + 0.85, 0.8, 2.6) * 20) / 20;
      const name = `spell_${a}_${b}`, t = nowS();
      if (t - spellCamAt < 4) return;
      shots[name] ||= { pri: 3, parts: [
        { ...shots.spell.parts[0], len: a, slow: 0 },
        { len: b, cut: 1, fov: 40, omega: 9, pose(c, out) {
          const p = c.x ? foePos(c.x, foeAt) : bossCentre(foeAt);
          out.look.copy(p); out.pos.set(p.x * 0.5 + 7.5 - c.u * 0.8, Math.max(2.2, p.y * 0.6 + 1.6), p.z + 12 - c.u * 1.2);
        } },
      ] };
      if (dir.want(name, { pri: 3, x: foe || null }) ) spellCamAt = t;
    }
    const dir = window.CamDirector ? CamDirector.create(THREE, camera, {
      reduce, shots, lockBefore: 5.5, gap: 6, budget: 3,
      onPart(name, idx, part) { partNow = name + idx; if (part.slow && !reduce) { slowK = part.slow; slowUntil = performance.now() + part.len * 1000; } },
    }) : null;
    function want(name, w) { if (dir) dir.want(name, w); }
    let partNow = '';
    const lineupNow = () => (window.__camHold ? window.__camHold.name === 'reveal' && !window.__camHold.part : !!dir && dir.shot() === 'reveal' && partNow === 'reveal0');

    // ---------- the frame ----------
    let lastT = nowS();
    // compile every shader now, hidden pooled effects included, so the first hit, spell or status
    // effect in a fight doesn't stall a frame while its shader compiles
    try { renderer.compile(scene, camera); } catch (e) {}
    // adaptive quality (28 Nov 2026 lag check: Party dipped to 48 fps on Intel graphics): resolution drops
    // first, then the bloom and half the smoke, and they come back once frames are fast again
    const aq = window.AdaptiveQuality && !window.__partyFull ? AdaptiveQuality.create({ key: 'wpm-party', fps: 60, minScale: 0.6, minDetail: 0.4,
      onScale: k => { renderer.setPixelRatio(basePR * k); composer.setPixelRatio(basePR * k); fit(); },
      onDetail: d => { bloom.enabled = d > 0.55 && aq.level !== 'low'; smokeK = d > 0.7 ? 1 : 0.5; } }) : null;
    if (aq) { aq.loading(); aq.watch(renderer.domElement); aq.apply(); if (aq.level === 'low') bloom.enabled = false; }
    let aqLoaded = false;
    let loopErr = 0;
    renderer.setAnimationLoop(() => { try { frame(); } catch (e) { if (loopErr++ < 3) console.error('arena frame', e); } });
    function frame() {
      if (!visible || document.hidden) { lastT = nowS(); return; }
      const t = nowS();
      const real = Math.min(0.05, t - lastT); lastT = t;
      let dt = real;
      if (performance.now() < hitStop) dt *= 0.15;
      else if (performance.now() < slowUntil) dt *= slowK;
      T.value = t;
      laneCache.clear();
      if (gl) { gl.reset(); }
      runLater();
      teamTick(t, dt);
      drawn = true;
      // the boss never just waits: every 1.6 to 3 s one of them makes a small feint toward a player,
      // stopping well short of them
      if (cre && cre.lunge && st && st.players && !reduce && t > feintAt) {
        feintAt = t + 1.6 + Math.random() * 1.4;
        const up = st.players.filter(p => !p.down);
        const foe = [...foes.values()].filter(f => f.alive && f.kind !== 'mite' && !(atk && atk.from === f.id));
        if (up.length && foe.length) { laneAt(up[Math.floor(Math.random() * up.length)].id, v1).add(v4.set(0, 4, -6)); cre.lunge(foe[Math.floor(Math.random() * foe.length)].id, v1, 0.3); }
      }
      if (cre) cre.update(dt, t);
      if (mites) mites.update(dt, t);
      drawAttack(t, dt);
      for (const p of parts) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.v.y -= p.grav * dt; p.s.position.addScaledVector(p.v, dt);
        const k = p.life / p.max;
        p.s.scale.setScalar(p.size * (0.4 + k)); p.s.material.opacity = k;
      }
      for (const p of puffs) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.v.multiplyScalar(1 - dt * 2); p.s.position.addScaledVector(p.v, dt);
        const k = p.life / p.max;
        p.s.scale.setScalar(p.size * (1.7 - k * 0.9)); p.s.material.opacity = p.op * Math.min(1, (1 - k) * 6) * k;
      }
      drawFrags(dt);
      drawStreaks(dt);
      drawDeath(dt);
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
      if (arena) { arena.update(t, dt, camera); if (!atkK) arena.bossLight.intensity += (40 - arena.bossLight.intensity) * Math.min(1, real * 3); }
      if (wall) wall.material.map.offset.y = (wall.material.map.offset.y + dt * 0.03) % 1;
      // the camera
      shake = Math.max(0, shake - real * 2.2);
      punch = Math.max(0, punch - real * 2.4);
      bossCentre(bossAt);
      if (dir) {
        const now = opts.now ? opts.now() : 0;
        let thr = Infinity;
        if (atk && st && st.phase === 'fight') thr = t + Math.max(0, (atk.land - now) / 1000);
        for (const f of foes.values()) if (f.kind === 'mite' && f.alive && f.land) thr = Math.min(thr, t + Math.max(0, (f.land - now) / 1000));
        dir.update(t, real, { threatAt: thr });
        // camera test probe (tests set window.__camProbe): the shot and whether an attack was winding up at the team
        if (window.__camProbe) (window.__camLog ||= []).push({ t: +t.toFixed(3), shot: dir.shot(), wind: !!(atk && st && st.phase === 'fight'), thr: Number.isFinite(thr) ? +(thr - t).toFixed(2) : null });
      } else { camera.position.copy(camBase); camera.lookAt(camLook); }
      // tests: hold one moment of a shot (window.__camHold = { name, part, u }) to photograph it
      const hold = window.__camHold;
      if (hold && shots[hold.name]) {
        const sh0 = shots[hold.name], pt = sh0.parts ? sh0.parts[hold.part || 0] : sh0, o = { pos: new V(), look: new V(), fov: pt.fov || 42 };
        pt.pose({ t, u: hold.u || 0.5, x: hold.x }, o);
        camera.position.copy(o.pos); camera.fov = o.fov; camera.lookAt(o.look); camera.updateProjectionMatrix();
      }
      const sh = shake * (reduce ? 0.12 : calm ? 0.6 : 1);
      if (sh > 0) camera.position.add(v4.set(Math.sin(t * 41) * sh * 0.5, Math.sin(t * 37 + 1) * sh * 0.4, 0));
      const zoom = 1 + punch * 0.05 * (reduce ? 0 : 1);
      if (Math.abs(camera.zoom - zoom) > 0.001) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
      if (!dieT && cre && !teamWon) holder.visible = !lineupNow();
      // a dodged fizzle: the creature sways aside and back (spell-fx)
      { const du = nowS() - dodgeAt; holder.position.x = du < 1.2 ? (du < 0.22 ? ease(du / 0.22) : Math.max(0, 1 - (du - 0.45) / 0.75)) * 2.4 * dodgeSide * still : 0; }
      composer.render();
      if (aq) { if (!aqLoaded) { aqLoaded = true; aq.loaded(); } aq.frame(performance.now()); }
      if (opts.onFrame) opts.onFrame();
    }

    function dispose() {
      renderer.setAnimationLoop(null); if (aq) aq.dispose();
      for (const m of team.values()) m.f.dispose(); team.clear(); later.length = 0;
      if (fx) fx.dispose();
      ro.disconnect(); io.disconnect();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
      geoCache.forEach(g => g.dispose());
      glowTex.dispose(); stripTex.dispose(); if (envTex) envTex.dispose();
      if (arena) arena.dispose();
      bloom.dispose(); composer.dispose && composer.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }
    const live = () => visible && !document.hidden;
    const info = () => ({ kind, foes: foes.size, cre: !!cre, fx: fx ? fx.info() : null });
    function key(id, frac) { teamKey(id, frac); }
    function typo(id) { const m = team.get(id); if (m && !m.down) m.f.typo(); }
    return { setFight, sync, shot, key, typo, cast, fizzle, attackLands, block, chip, foeGone, regrow, down, heal, shield, up, clear, anchors, live, info, dispose, director: () => dir,
      renderInfo: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }),
      test: { shatter: () => shatter(new V(0, 5, -3), 16, 7, 0.42), want: n => want(n, { x: new V(0, 5, -3), pri: 3 }), cam: () => ({ p: camera.position.toArray(), fov: camera.fov, zoom: camera.zoom }), dbg: () => ({ THREE, scene, camera, team, bloom }) } };
  }

  return { mount };
})();
