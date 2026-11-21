// The duel arena in three.js: two fighters on hex pads facing each other across a
// round floor. Each fighter is the player's 3D avatar, rendered once by avatar3d.js
// into a portrait card (the lighter 2.5D style), so the arena never runs two live
// avatar rigs. Shots and spells come from the combat layer (Combat.FX) with each card
// as the target adapter.
//
//   const sc = DuelScene.mount(host, { sides: [{ look, color }, { look, color }], onImpact(side, dmg, x, y, extra) });
//   sc.ready                          Promise, true once three.js loaded
//   sc.shot(from, tier, onLand, { color, crit, word, combo, ms })   a word's shot from side `from`:
//                                     the typed word flies over as glowing letters and lands in ms
//   sc.cast(from, spellId, hits, effect)           hits: [{ at: ms after now, dmg }]
//   sc.react(side, kind, power)       'typo' | 'hit' | 'block' | 'stun' | 'freeze' | 'flash' | 'fog'
//   sc.aura(side, name, on)           'ward' | 'hyper' | 'root' | 'split'
//   sc.setLook(side, look), sc.setHp(side, frac), sc.ko(side), sc.revive()
//   sc.screen(side, out)              host pixels above a fighter, for numbers and labels
//   sc.dispose()
window.DuelScene = (() => {
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
    let impl = null, gone = false;
    const pend = { looks: opts.sides.map(s => s.look), hp: [1, 1], auras: [] };
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP]) => {
        if (gone) return false;
        impl = build(host, opts, THREE, EC.EffectComposer, RP.RenderPass, UB.UnrealBloomPass, OP.OutputPass);
        pend.looks.forEach((l, i) => impl.setLook(i, l));
        pend.hp.forEach((f, i) => impl.setHp(i, f));
        return true;
      }).catch(e => { console.warn('Duel arena did not load', e); return false; }),
      shot: (from, tier, onLand, o) => { if (impl) impl.shot(from, tier, onLand, o); else if (onLand) onLand(); },
      cast: (from, id, hits, effect) => impl && impl.cast(from, id, hits, effect),
      react: (side, kind, p) => impl && impl.react(side, kind, p),
      aura: (side, name, on) => impl && impl.aura(side, name, on),
      setLook: (side, look) => { pend.looks[side] = look; if (impl) impl.setLook(side, look); },
      setHp: (side, f) => { pend.hp[side] = f; if (impl) impl.setHp(side, f); },
      ko: side => impl && impl.ko(side),
      revive: () => impl && impl.revive(),
      screen: (side, out) => (impl ? impl.screen(side, out) : null),
      info: () => (impl ? impl.info() : null),
      dispose() { gone = true; if (impl) impl.dispose(); impl = null; },
    };
    return ctl;
  }

  function build(host, opts, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
    const V = THREE.Vector3;
    const keep = [];
    const own = x => (keep.push(x), x);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phone = matchMedia('(max-width: 720px)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, phone ? 1.5 : 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'du-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = C('#020604');
    scene.fog = new THREE.Fog('#020604', 18, 44);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 120);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.45, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---------- the floor: a round pad of rings and spokes ----------
    const floorMat = own(new THREE.LineBasicMaterial({ color: C('#39ff88', 0.55), transparent: true, opacity: 0.55 }));
    const pts = [];
    for (const r of [2, 4, 6.5, 9, 12]) for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2, b = (i + 1) / 96 * Math.PI * 2;
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
    }
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(Math.cos(a) * 2, 0, Math.sin(a) * 2, Math.cos(a) * 12, 0, Math.sin(a) * 12); }
    const fg = own(new THREE.BufferGeometry()); fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(fg, floorMat));
    const disc = new THREE.Mesh(own(new THREE.CircleGeometry(12.2, 64)), own(new THREE.MeshBasicMaterial({ color: '#03100a' })));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.01; scene.add(disc);

    // background towers of glowing blocks, far back
    const towerMat = own(new THREE.MeshBasicMaterial({ color: C('#1f9e57', 0.5), wireframe: true, transparent: true, opacity: 0.35 }));
    const towerGeo = own(new THREE.BoxGeometry(1, 1, 1));
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (0.12 + 0.76 * i / 25) + Math.PI;
      const r = rnd(20, 30), h = rnd(4, 16);
      const m = new THREE.Mesh(towerGeo, towerMat);
      m.scale.set(rnd(1.2, 2.6), h, rnd(1.2, 2.6));
      m.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r);
      scene.add(m);
    }

    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    { const c = glowCv.getContext('2d'); const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }
    const glowTex = own(new THREE.CanvasTexture(glowCv));

    // ---------- fighters ----------
    const CARD_W = 3.1, CARD_H = 3.6;
    const POS = [new V(-4.1, 0, 0.6), new V(4.1, 0, 0.6)];
    const YAW = [0.42, -0.42];
    const loader = new THREE.TextureLoader();
    const F = opts.sides.map((s, i) => {
      const g = new THREE.Group();
      g.position.copy(POS[i]);
      g.rotation.y = YAW[i];
      scene.add(g);
      const col = C(s.color || (i ? '#f29d30' : '#39ff88'));
      // hex pad and the light column under the card
      const pad = new THREE.Mesh(own(new THREE.CylinderGeometry(1.7, 1.85, 0.22, 6)), own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.35) })));
      pad.position.y = 0.11; g.add(pad);
      const ring = new THREE.Mesh(own(new THREE.RingGeometry(1.95, 2.08, 6)), own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), side: THREE.DoubleSide, transparent: true, opacity: 0.9 })));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.24; g.add(ring);
      // a soft glow behind the card in the side's colour
      const beam = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: col.clone().multiplyScalar(0.55), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })));
      beam.scale.set(6.5, 6.5, 1); beam.position.set(0, 2.4, -0.6); g.add(beam);
      // the portrait card
      const card = new THREE.Group(); card.position.y = 0.45 + CARD_H / 2; g.add(card);
      // the hooded figure stands in until the 3D portrait is rendered
      const mat = own(new THREE.MeshBasicMaterial({ color: '#d8d8d8', transparent: true }));
      const plane = new THREE.Mesh(own(new THREE.PlaneGeometry(CARD_W, CARD_H)), mat);
      if (i === 1) plane.scale.x = -1;            // mirrored so both fighters face the middle
      card.add(plane);
      // corner brackets in the side's colour
      const br = [];
      const bw = CARD_W / 2 + 0.12, bh = CARD_H / 2 + 0.12, L = 0.55;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) br.push(sx * bw, sy * bh, 0.02, sx * (bw - L), sy * bh, 0.02, sx * bw, sy * bh, 0.02, sx * bw, sy * (bh - L), 0.02);
      const bg = own(new THREE.BufferGeometry()); bg.setAttribute('position', new THREE.Float32BufferAttribute(br, 3));
      const brMat = own(new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.2) }));
      card.add(new THREE.LineSegments(bg, brMat));
      // a tint panel over the card for flashes, stun, freeze and the KO
      const tintMat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      const tint = new THREE.Mesh(own(new THREE.PlaneGeometry(CARD_W, CARD_H)), tintMat); tint.position.z = 0.01; card.add(tint);
      return { g, card, plane, mat, tintMat, brMat, beam, ring, col, base: card.position.clone(), kick: 0, kickDir: i ? 1 : -1, flash: 0, flashCol: new THREE.Color('#ffffff'), stun: 0, freeze: 0, fog: 0, hp: 1, ko: 0, koT: 0, tex: null, seq: 0, glitch: 0, lt: 9, lp: 0, recoil: 0, drop: 0, broken: null };
    });

    // ---------- combat effects ----------

    let shake = 0, stopUntil = 0, flashGate = [];
    const canFlash = () => { const t = performance.now(); flashGate = flashGate.filter(x => t - x < 1000); if (flashGate.length >= (reduce ? 2 : 3)) return false; flashGate.push(t); return true; };
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm: reduce, reduce, pixelHeight: () => renderer.domElement.height,
      juice: { shake: k => { shake = Math.max(shake, k * 0.6); }, stop: ms => { stopUntil = Math.max(stopUntil, performance.now() + ms); }, glitch: () => {}, dim: () => {}, tint: () => {}, canFlash },
    }) : null;
    const tmp = new V(), tmp2 = new V();
    const centre = (i, out) => { F[i].card.getWorldPosition(out); return out; };
    const adapters = F.map((f, i) => ({
      size: 1.6,
      pos: out => centre(i, out),
      top: out => centre(i, out).setY(f.base.y + CARD_H / 2 + 0.4),
      base: out => out.copy(POS[i]).setY(0.25),
      react: (kind, power) => react(i, kind === 'stun' ? 'stun' : kind === 'freeze' ? 'freeze' : 'hit', power),
    }));
    const casterOf = i => ({ pos: out => centre(i, out).add(tmp2.set(i ? -1.8 : 1.8, 0.1, 0.5)) });

    // ---------- the word as the weapon ----------
    // Each finished word leaves the attacker's card as its own letters. They fly an arc,
    // land one after another as quick ticks, and the last one carries the hit.
    const glyphTex = new Map();
    let fontOk = !document.fonts;
    if (document.fonts) document.fonts.load('600 96px "JetBrains Mono"').then(() => { fontOk = true; glyphTex.forEach(t => t.dispose()); glyphTex.clear(); }, () => { fontOk = true; });
    function glyph(ch) {
      const key = ch + (fontOk ? '' : '~');
      if (!glyphTex.has(key)) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const c = cv.getContext('2d');
        c.font = '600 100px "JetBrains Mono", ui-monospace, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffffff'; c.shadowColor = '#ffffff'; c.shadowBlur = 16; c.fillText(ch, 64, 70);
        c.shadowBlur = 0; c.fillText(ch, 64, 70);
        glyphTex.set(key, new THREE.CanvasTexture(cv));
      }
      return glyphTex.get(key);
    }
    const sprite = (map, op = 1, order = 8) => {
      const m = new THREE.Sprite(own(new THREE.SpriteMaterial({ map, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op, fog: false })));
      m.visible = false; m.renderOrder = order; scene.add(m); return m;
    };
    const GN = 56;
    const glyphs = Array.from({ length: GN }, () => ({ s: sprite(null), tr: [sprite(glowTex, 0.5, 7), sprite(glowTex, 0.25, 7)], on: false, t: 0, delay: 0, dur: 0.2, a: new V(), c: new V(), b: new V(), size: 0.6, spin: 0, cb: null }));
    let gI = 0;
    const bez = (out, g, u) => {
      const v = 1 - u;
      return out.set(v * v * g.a.x + 2 * v * u * g.c.x + u * u * g.b.x, v * v * g.a.y + 2 * v * u * g.c.y + u * u * g.b.y, v * v * g.a.z + 2 * v * u * g.c.z + u * u * g.b.z);
    };

    // sparks and shards: one pool of sprites with velocity, gravity and spin
    const shardCv = document.createElement('canvas'); shardCv.width = shardCv.height = 32;
    { const c = shardCv.getContext('2d'); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(16, 1); c.lineTo(30, 27); c.lineTo(5, 22); c.closePath(); c.fill(); }
    const shardTex = own(new THREE.CanvasTexture(shardCv));
    const PN = 160;
    const parts = Array.from({ length: PN }, () => ({ s: sprite(glowTex, 1, 7), v: new V(), life: 0, max: 1, size: 0.3, spin: 0, grav: 0 }));
    let pI = 0;
    function burst(at, n, speed, col, o = {}) {
      if (reduce) n = Math.ceil(n / 3);
      for (let k = 0; k < n; k++) {
        const p = parts[pI = (pI + 1) % PN];
        p.s.material.map = o.shard ? shardTex : glowTex;
        p.s.material.color.copy(col).multiplyScalar(o.k || 1.8);
        p.s.position.copy(at);
        p.v.set(rnd(-1, 1) + (o.dir || 0), rnd(-0.6, 1) + (o.up || 0), rnd(-0.4, 1)).normalize().multiplyScalar(speed * rnd(0.35, 1));
        p.size = (o.size || 0.25) * rnd(0.6, 1.4); p.max = p.life = (o.life || 0.6) * rnd(0.7, 1.2);
        p.spin = o.shard ? rnd(-12, 12) : 0; p.grav = o.grav ?? 6;
        p.s.visible = true;
      }
    }

    // shockwave rings on the floor under a fighter
    const rings = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(own(new THREE.RingGeometry(0.92, 1, 64)), own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      return { m, t: 0, life: 0.5, r: 3 };
    });
    let rI = 0;
    function ringAt(i, col, r = 3, life = 0.5) {
      const w = rings[rI = (rI + 1) % rings.length];
      w.m.position.copy(POS[i]).setY(0.05); w.m.material.color.copy(col).multiplyScalar(2);
      w.r = r; w.life = life; w.t = 0; w.m.visible = true;
    }

    // a straight rail of light along the shot for the top combo tiers
    const rail = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })));
    rail.visible = false; rail.renderOrder = 7; scene.add(rail);
    let railT = 0;
    function railShot(from, to, col) {
      const a = casterOf(from).pos(new V()), b = centre(to, new V());
      rail.position.lerpVectors(a, b, 0.5); rail.scale.set(a.distanceTo(b), 0.16, 1);
      rail.lookAt(camera.position); rail.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      rail.material.color.copy(col).multiplyScalar(1.5); railT = 0.14; rail.visible = true;
    }

    let punch = 0, slowUntil = 0, koCam = -1, koCamT = 0;
    const WHITE = new THREE.Color('#ffffff');
    function tick(to, col) {
      const f = F[to];
      f.kick = Math.min(1, f.kick + 0.08);
      burst(centre(to, tmp).add(tmp2.set(0, rnd(-0.5, 0.5), 0.3)), 2, 4, col, { size: 0.18, life: 0.25, grav: 0 });
    }
    function impact(to, tier, crit, col, onLand) {
      const f = F[to], p = tier + (crit ? 1.6 : 0);
      react(to, 'hit', 0.35 + p * 0.18);
      f.recoil = Math.min(1.4, 0.5 + p * 0.22);
      const at = centre(to, new V()).add(tmp.set(0, 0.2, 0.3));
      const away = to ? 1 : -1;
      burst(at, 8 + p * 5, 6 + p * 1.5, col, { shard: true, size: 0.32, life: 0.7, dir: away * 0.8, up: 0.4, grav: 9 });
      burst(at, 3 + p, 2.5 + p * 0.6, WHITE, { size: 0.3, life: 0.18, grav: 0, k: 1 });
      ringAt(to, col, 2.6 + p * 0.6, 0.45 + p * 0.05);
      if (!reduce) {
        stopUntil = Math.max(stopUntil, performance.now() + (crit ? 110 : 20 + tier * 18));
        shake = Math.max(shake, 0.12 + p * 0.07);
        punch = Math.max(punch, crit ? 1 : Math.min(0.8, tier * 0.22));
      }
      if (onLand) onLand();
    }
    const TIER_COL = [null, null, '#3ee6ff', '#f2c230', '#ff5ce1'];

    function shot(from, tier, onLand, o = {}) {
      const to = 1 - from, f = F[from];
      tier = Math.max(0, Math.min(4, tier | 0));
      const word = String(o.word || '').replace(/\s+/g, '').slice(0, 16) || '>>>';
      const T = Math.max(0.16, Math.min(0.7, (o.ms || 260) / 1000));
      const base = new THREE.Color(o.color || (from ? '#f29d30' : '#39ff88'));
      const col = TIER_COL[tier] ? new THREE.Color(TIER_COL[tier]) : base.clone().lerp(WHITE, tier ? 0.25 : 0);
      // the attacker winds up and lunges; the letters leave on the lunge
      f.lt = 0; f.lp = 0.6 + tier * 0.12 + (o.crit ? 0.25 : 0);
      const start = casterOf(from).pos(new V());
      const size = (0.82 + tier * 0.1) * (o.crit ? 1.25 : 1);
      // the whole word follows one arc, one letter behind the other, and reads left to right
      // either way it flies: going right the last letter leads, going left the first one does
      const end = centre(to, new V()).add(tmp.set(rnd(-0.2, 0.2), rnd(-0.1, 0.5), 0.3));
      const ctrl = new V().lerpVectors(start, end, 0.5).add(tmp.set(0, (tier >= 3 ? 0.5 : 1) * rnd(1.4, 2.2), rnd(0, 1.2)));
      const n = word.length, step = Math.min(0.013, (T - 0.12) / Math.max(1, n));
      for (let k = 0; k < n; k++) {
        const g = glyphs[gI = (gI + 1) % GN];
        if (g.on && g.cb) { const cb = g.cb; g.cb = null; cb(); }   // pool wrapped: land the oldest now
        const order = from === 0 ? n - 1 - k : k;                   // 0 leads
        g.delay = 0.04 + order * step;
        g.dur = Math.max(0.08, T - (n - 1) * step - 0.04);
        g.a.copy(start);
        g.b.copy(end).add(tmp.set(rnd(-0.12, 0.12), rnd(-0.12, 0.12), 0));
        g.c.copy(ctrl);
        const map = glyph(word[k]);
        g.s.material.map = map; g.s.material.color.copy(col).multiplyScalar(2.2);
        g.tr.forEach(x => { x.material.color.copy(col).multiplyScalar(1.2); });
        g.size = size; g.spin = 0; g.t = 0; g.on = true;
        g.cb = order === n - 1 ? () => { if (tier >= 3) railShot(from, to, col); impact(to, tier, o.crit, col, onLand); } : () => tick(to, col);
      }
      burst(start, 4 + tier * 2, 3, col, { size: 0.3, life: 0.3, grav: 0 });
    }

    function cast(from, id, hits, effect) {
      if (!fx) return;
      const now = performance.now();
      fx.cast(id, { caster: casterOf(from), target: adapters[1 - from], hits: hits.map(h => ({ at: Math.max(0, h.at - now), amount: h.dmg })), effect: effect || {} });
    }

    function react(i, kind, power = 0.4) {
      const f = F[i];
      if (kind === 'hit') { f.kick = Math.min(1, f.kick + 0.35 + power * 0.4); f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#ffffff'); }
      if (kind === 'typo') { f.flash = Math.max(f.flash, 0.6); f.flashCol.set('#ff4d5e'); f.glitch = 0.35; burst(casterOf(i).pos(new V()), 7, 3.5, RED, { shard: true, size: 0.2, life: 0.45, grav: 7 }); }
      if (kind === 'block') { f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#7dffc4'); if (fx) fx.event('ward', { caster: adapters[i] }); }
      if (kind === 'stun') { f.stun = Math.max(f.stun, power > 10 ? power / 1000 : 1.5); }
      if (kind === 'freeze') { f.freeze = Math.max(f.freeze, power > 10 ? power / 1000 : 2); }
      if (kind === 'fog') { f.fog = 1.5; }
      if (kind === 'flash') { f.flash = 1; f.flashCol.set('#ffffff'); }
    }
    function aura(i, name, on) { if (fx) fx.aura(name, on, { caster: adapters[i], target: adapters[1 - i] }); }

    // Art has no avatar look yet, so his card shows the laurel mark in his colour
    function artTexture() {
      const cv = document.createElement('canvas'); cv.width = cv.height = 512;
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(256, 220, 20, 256, 256, 360);
      g.addColorStop(0, '#0b2a30'); g.addColorStop(1, '#040806');
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      c.save(); c.translate(256 - 32 * 6.2, 236 - 34 * 6.2); c.scale(6.2, 6.2);
      c.strokeStyle = '#3ee6ff'; c.lineCap = 'round'; c.lineJoin = 'round'; c.shadowColor = '#3ee6ff'; c.shadowBlur = 6;
      c.lineWidth = 2.4; c.stroke(new Path2D('M20 47 L32 13 L44 47')); c.stroke(new Path2D('M27 41 L32 28 L37 41'));
      c.lineWidth = 1.6; c.stroke(new Path2D('M29 58 C17 54 9 44 10 20')); c.stroke(new Path2D('M35 58 C47 54 55 44 54 20'));
      c.fillStyle = '#3ee6ff';
      for (const [x, y, a] of [[23, 55, -25], [17, 51, -45], [13, 45, -62], [10.5, 38, -75], [9.5, 31, -85], [9.8, 24, -95]]) {
        for (const m of [1, -1]) { c.save(); c.translate(m === 1 ? x : 64 - x, y); c.rotate(m * a * Math.PI / 180); c.beginPath(); c.ellipse(0, 0, 4, 1.6, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
      }
      c.restore();
      c.fillStyle = '#3ee6ff'; c.font = '600 44px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.shadowBlur = 0;
      c.fillText('204 WPM', 256, 470);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function setLook(i, look) {
      const f = F[i], seq = ++f.seq;
      if (look && look.art) { f.plane.scale.x = 1; if (f.tex) f.tex.dispose(); f.tex = artTexture(); f.mat.map = f.tex; f.mat.needsUpdate = true; return; }
      if (!look || !window.Avatar) return;
      if (!f.tex) loader.load(Avatar.fallback(look, 256), tex => { if (!alive || seq !== f.seq || f.tex) { tex.dispose(); return; } tex.colorSpace = THREE.SRGBColorSpace; f.tex = tex; f.mat.map = tex; f.mat.needsUpdate = true; });
      Avatar.thumb(look, 512, 512).then(url => {
        if (seq !== f.seq || !alive) return;
        loader.load(url, tex => {
          if (!alive) { tex.dispose(); return; }
          tex.colorSpace = THREE.SRGBColorSpace;
          if (f.tex) f.tex.dispose();
          f.plane.scale.x = i ? -1 : 1;
          f.tex = tex; f.mat.map = tex; f.mat.needsUpdate = true;
        });
      }).catch(() => {});
    }
    function setHp(i, frac) { F[i].hp = Math.max(0, Math.min(1, frac)); }
    // the KO: slow motion, the camera leans in and the card breaks into pieces of the portrait
    function ko(i) {
      const f = F[i];
      f.ko = 1; f.koT = 0;
      if (!reduce) { slowUntil = performance.now() + 1500; koCam = i; koCamT = 0; }
      const at = centre(i, new V());
      burst(at, 26, 9, f.col, { shard: true, size: 0.4, life: 1.1, up: 0.5, grav: 8 });
      burst(at, 6, 4, WHITE, { size: 0.4, life: 0.25, grav: 0, k: 1 });
      ringAt(i, f.col, 6, 0.9);
      shake = Math.max(shake, reduce ? 0 : 0.6);
      if (f.broken) return;
      const cols = 6, rows = 7, w = CARD_W / cols, h = CARD_H / rows;
      const grp = new THREE.Group(); grp.scale.x = f.plane.scale.x; f.card.add(grp);
      const list = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const geo = new THREE.PlaneGeometry(w * 0.98, h * 0.98), uv = geo.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k)) / cols, (r + uv.getY(k)) / rows);
        const m = new THREE.Mesh(geo, f.mat);
        const x = -CARD_W / 2 + (c + 0.5) * w, y = -CARD_H / 2 + (r + 0.5) * h;
        m.position.set(x, y, 0.02);
        list.push({ m, v: new V(x * rnd(1.4, 2.8) + rnd(-0.6, 0.6), y * rnd(0.5, 1.2) + rnd(0.3, 1.8), rnd(0.2, 2.5)), r: new V(rnd(-5, 5), rnd(-5, 5), rnd(-7, 7)) });
        grp.add(m);
      }
      f.card.children.forEach(ch => { if (ch !== grp) ch.visible = false; });
      f.broken = { grp, list, t: 0 };
    }
    // a new round: the cards come back together and drop onto their pads
    function revive() {
      F.forEach((f, i) => {
        if (f.broken) { f.broken.list.forEach(x => x.m.geometry.dispose()); f.card.remove(f.broken.grp); f.broken = null; f.card.children.forEach(ch => { ch.visible = true; }); }
        f.ko = 0; f.koT = 0; f.stun = 0; f.freeze = 0; f.recoil = 0;
        f.drop = reduce ? 0 : 1;
        if (reduce) ringAt(i, f.col, 3, 0.5);
      });
      koCam = -1;
    }

    const _s = new V();
    function screen(i, out = {}) {
      centre(i, _s).setY(F[i].base.y + CARD_H / 2 + 0.2).project(camera);
      out.x = (_s.x * 0.5 + 0.5) * host.clientWidth; out.y = (-_s.y * 0.5 + 0.5) * host.clientHeight;
      return out;
    }

    // ---------- size and camera ----------
    const camPos = new V(0, 4.4, 15), look = new V(0, 2.5, 0);
    function fit() {
      const w = host.clientWidth || 600, h = host.clientHeight || 360;
      renderer.setSize(w, h, false); composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      // keep both cards in view on narrow screens
      const half = THREE.MathUtils.degToRad(camera.fov / 2);
      const need = 6.4 / (Math.tan(half) * camera.aspect);
      camPos.set(0, 4.2, Math.max(13.5, need + 1.5));
      camera.position.copy(camPos); camera.lookAt(look); camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    fit();
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);

    // ---------- frame ----------
    let alive = true, last = performance.now(), t = 0;
    const camAt = new V(), lookAt = new V();
    const ease = u => 1 - Math.pow(1 - u, 3);
    renderer.setAnimationLoop(() => {
      if (!alive || document.hidden || !visible) { last = performance.now(); return; }
      const nowT = performance.now();
      const real = Math.min(0.05, (nowT - last) / 1000); last = nowT;
      let dt = real;
      if (nowT < stopUntil) dt *= 0.08;            // hit stop
      else if (nowT < slowUntil) dt *= 0.3;        // KO slow motion
      t += dt;
      F.forEach((f, i) => {
        const toMid = -f.kickDir;
        f.kick = Math.max(0, f.kick - dt * 3.2);
        f.recoil = Math.max(0, f.recoil - dt * 2.6);
        f.flash = Math.max(0, f.flash - dt * 7);
        f.stun = Math.max(0, f.stun - dt); f.freeze = Math.max(0, f.freeze - dt); f.fog = Math.max(0, f.fog - dt);
        f.glitch = Math.max(0, f.glitch - dt);
        // lunge: pull back for 70 ms, strike forward, settle back
        f.lt += dt;
        let lx = 0, sq = 0;
        if (f.lt < 0.07) { lx = -0.3 * (f.lt / 0.07); sq = -0.4 * (f.lt / 0.07); }
        else if (f.lt < 0.16) { const u = (f.lt - 0.07) / 0.09; lx = -0.3 + (1.3 * f.lp + 0.3) * ease(u); sq = 1 - u * 0.4; }
        else if (f.lt < 0.55) { const u = (f.lt - 0.16) / 0.39; lx = 1.3 * f.lp * (1 - ease(u)); sq = 0.6 * (1 - u); }
        // drop back in at a new round, with a bounce and a ring on landing
        let dy = 0;
        if (f.drop > 0) {
          const before = f.drop;
          f.drop = Math.max(0, f.drop - dt * 2.2);
          const u = 1 - f.drop;
          dy = u < 0.75 ? (1 - Math.pow(u / 0.75, 2)) * 6 : Math.sin((u - 0.75) / 0.25 * Math.PI) * 0.35;
          if (before >= 0.25 && f.drop < 0.25) ringAt(i, f.col, 3.2, 0.5);
        }
        const bob = reduce ? 0 : Math.sin(t * 1.6 + i * 2) * 0.06;
        const jitter = (f.stun > 0 || f.glitch > 0) && !reduce ? (Math.random() - 0.5) * 0.12 : 0;
        if (f.ko) f.koT = Math.min(1, f.koT + dt * 1.6);
        f.card.position.set(f.base.x + toMid * lx * 0.9 + f.kickDir * f.kick * 0.5 + jitter, f.base.y + bob + dy, f.base.z + lx * 0.35 - f.kick * 0.25);
        f.card.rotation.set(-f.recoil * 0.15, f.kickDir * f.recoil * 0.45 + toMid * lx * 0.12, f.kickDir * (f.kick * 0.18 + f.recoil * 0.12));
        f.card.scale.set(1 + sq * 0.08 + f.recoil * 0.04, 1 - sq * 0.06 - f.recoil * 0.03, 1);
        // tint: flash colour, then stun blue, frozen ice
        let op = f.flash * 0.22, c = f.flashCol;
        if (f.stun > 0) { op = Math.max(op, 0.35 + Math.sin(t * 30) * 0.1); c = tmpCol.set('#3d7bff'); }
        else if (f.freeze > 0) { op = Math.max(op, 0.32); c = tmpCol.set('#bfefff'); }
        f.tintMat.opacity = op; f.tintMat.color.copy(c);
        // the broken card's pieces fly apart and shrink away
        if (f.broken) {
          const b = f.broken; b.t += dt;
          for (const x of b.list) {
            x.v.y -= 7 * dt;
            x.m.position.addScaledVector(x.v, dt);
            x.m.rotation.x += x.r.x * dt; x.m.rotation.y += x.r.y * dt; x.m.rotation.z += x.r.z * dt;
            x.m.scale.setScalar(Math.max(0.001, 1 - Math.max(0, b.t - 0.9) / 1.2));
          }
        }
        // low HP: the column fades and the brackets turn red
        const low = f.hp < 0.3 ? 1 - f.hp / 0.3 : 0;
        f.brMat.color.copy(f.col).lerp(RED, low * (0.6 + 0.4 * Math.sin(t * 8))).multiplyScalar(2.2);
        f.beam.material.opacity = 0.22 * (0.4 + 0.6 * f.hp) * (f.ko ? 0.2 : 1) + f.recoil * 0.12;
        f.ring.rotation.z = t * (0.4 + f.lp * (f.lt < 0.6 ? 3 : 0)) * (i ? -1 : 1);
      });
      // letters in flight, each with two fading copies behind it
      for (const g of glyphs) {
        if (!g.on) continue;
        g.t += dt;
        const u0 = (g.t - g.delay) / g.dur;
        if (u0 < 0) continue;
        const u = Math.min(1, u0), e = Math.pow(u, 1.35);
        bez(g.s.position, g, e); g.s.visible = true;
        const sc = g.size * (0.5 + 0.5 * Math.min(1, u * 5));
        g.s.scale.setScalar(sc); g.s.material.rotation = g.spin * (g.t - g.delay) * 0.3;
        g.tr.forEach((x, k) => { bez(x.position, g, Math.max(0, e - 0.05 * (k + 1))); x.scale.setScalar(sc * (0.55 - k * 0.15)); x.visible = u > 0.05; });
        if (u >= 1) { g.on = false; g.s.visible = false; g.tr.forEach(x => { x.visible = false; }); if (g.cb) { const cb = g.cb; g.cb = null; cb(); } }
      }
      for (const p of parts) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.v.y -= p.grav * dt; p.v.multiplyScalar(1 - dt * 1.5);
        p.s.position.addScaledVector(p.v, dt);
        const k = p.life / p.max;
        p.s.scale.setScalar(p.size * (0.3 + 0.7 * k)); p.s.material.opacity = Math.min(1, k * 1.6);
        p.s.material.rotation += p.spin * dt;
      }
      for (const w of rings) {
        if (!w.m.visible) continue;
        w.t += dt;
        const u = w.t / w.life;
        if (u >= 1) { w.m.visible = false; continue; }
        w.m.scale.setScalar(0.3 + w.r * ease(u)); w.m.material.opacity = 0.85 * (1 - u);
      }
      if (railT > 0) { railT -= real; rail.material.opacity = Math.max(0, railT / 0.14); if (railT <= 0) rail.visible = false; }
      // camera: a slow drift, a punch in on big hits, a lean towards the fighter who fell
      shake = Math.max(0, shake - real * 2.5);
      punch = Math.max(0, punch - real * 2.2);
      if (koCam >= 0) koCamT = Math.min(1, koCamT + real * 1.2);
      const kc = koCam >= 0 ? ease(koCamT) : 0;
      camAt.copy(camPos);
      if (!reduce) camAt.add(tmp.set(Math.sin(t * 0.23) * 0.6, Math.sin(t * 0.17) * 0.2, 0));
      if (kc) camAt.lerp(tmp.copy(POS[koCam]).multiplyScalar(0.35).add(tmp2.set(0, 3.6, camPos.z * 0.82)), kc * 0.8);
      lookAt.copy(look);
      if (kc) lookAt.lerp(tmp.copy(POS[koCam]).setY(2.2), kc * 0.3);
      camera.position.copy(camAt);
      if (shake > 0 && !reduce) camera.position.add(tmp.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
      const fov = 36 - punch * 3.5;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(lookAt);
      if (fx) fx.update(dt);
      composer.render();
    });
    const tmpCol = new THREE.Color(), RED = new THREE.Color('#ff4d5e');

    function dispose() {
      alive = false;
      renderer.setAnimationLoop(null);
      ro.disconnect(); io.disconnect();
      if (fx) fx.dispose();
      F.forEach(f => { if (f.tex) f.tex.dispose(); if (f.broken) f.broken.list.forEach(x => x.m.geometry.dispose()); });
      glyphTex.forEach(x => x.dispose());
      keep.forEach(x => { try { x.dispose(); } catch (e) {} });
      composer.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    }

    return { shot, cast, react, aura, setLook, setHp, ko, revive, screen, dispose, info: () => ({ fx: fx ? fx.info() : null, letters: glyphs.filter(g => g.on).length }) };
  }

  return { mount };
})();
