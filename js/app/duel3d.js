// The duel arena in three.js: two operators on hex pedestals in a night stadium (duel-arena.js),
// fighting like a fighting game broadcast. Each finished word flies over as its own letters; the
// operator throws it with a move that grows with the combo tier (fight-moves.js): a flick, a jab,
// a two-hand blast, a dashing smash. Spells are cast with both arms and a circle at the feet, a
// block raises a hex shield, heavy hits stagger, the KO blows the loser off their feet in slow
// motion. A camera director (camdir.js) frames both fighters like a broadcast and cuts away only
// when no spell is on its way to you: the face-off before a round, big strikes, casts, the KO and
// the winner. Without operators each side is a portrait card (the older 2.5D look).
//
//   const sc = DuelScene.mount(host, { sides: [{ look, color, preset, name }, ...], me, audio });
//     me: the side you play (-1 when watching), audio: an ArenaAudio for the sounds
//   sc.ready                          Promise, true once three.js loaded
//   sc.shot(from, tier, onLand, { color, crit, word, combo, ms })   a word's shot from side `from`:
//                                     the typed word flies over as glowing letters and lands in ms
//   sc.cast(from, spellId, hits, effect)           hits: [{ at: ms after now, dmg }]
//   sc.react(side, kind, power)       'typo' | 'hit' | 'block' | 'stun' | 'freeze' | 'flash' | 'fog' | 'poison' | 'poisonTick' | 'cleanse'
//   sc.aura(side, name, on)           'ward' | 'hyper' | 'root' | 'split'
//   sc.setLook(side, look), sc.setHp(side, frac), sc.ko(side), sc.revive()
//   sc.screen(side, out)              host pixels above a fighter, for numbers and labels
//   sc.warm(chars) -> Promise<bool>     before the countdown: letters, portraits, shaders, one frame of every effect
//   sc.phase(name, round)             'count' | 'fight' | 'break': the face-off, the bell, the pause between rounds
//   sc.result(winner)                 the match is over: the winner celebrates, the camera circles them
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
      import('three/addons/geometries/RoundedBoxGeometry.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  function mount(host, opts = {}) {
    let impl = null, gone = false;
    const pend = { looks: opts.sides.map(s => s.look), hp: [1, 1], auras: [] };
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP, RB]) => {
        opts = { ...opts, RoundedBoxGeometry: RB.RoundedBoxGeometry };
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
      rise: () => impl && impl.rise(),
      phase: (name, round) => impl && impl.phase(name, round),
      result: w => impl && impl.result(w),
      director: () => (impl ? impl.director() : null),
      debugPose: (i, name, t) => impl && impl.debugPose(i, name, t),
      _impl: () => impl,   // tests
      screen: (side, out) => (impl ? impl.screen(side, out) : null),
      // resolves true once the arena has loaded and played every effect once (false if it failed)
      warm: chars => ctl.ready.then(ok => (ok && impl ? impl.warm(chars) : false)).catch(() => false),
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

    // ---------- the arena (js/app/duel-arena.js), or the old ring floor without it ----------
    const OPS = !!(window.Operator && window.FightMoves && opts.sides.every(s => s.preset));
    const POS = OPS ? [new V(-5.2, 0, 0.4), new V(5.2, 0, 0.4)] : [new V(-6.2, 0, 0.6), new V(6.2, 0, 0.6)];
    const sideCol = i => C(opts.sides[i].color || (i ? '#f29d30' : Theme.hex('accent')));
    let arena = null;
    if (window.DuelArena) {
      try { arena = DuelArena.build(THREE, scene, { cols: [0, 1].map(i => '#' + sideCol(i).getHexString()), names: opts.sides.map(x => x.name || ''), pos: POS, lite: phone, pixelHeight: () => renderer.domElement.height }); }
      catch (e) { console.warn('Duel arena', e); arena = null; }
    }
    if (!arena) {
      const floorMat = own(new THREE.LineBasicMaterial({ color: C(Theme.hex('accent'), 0.55), transparent: true, opacity: 0.55 }));
      const pts = [];
      for (const r of [2, 4, 6.5, 9, 12]) for (let i = 0; i < 96; i++) {
        const a = i / 96 * Math.PI * 2, b = (i + 1) / 96 * Math.PI * 2;
        pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
      }
      const fg = own(new THREE.BufferGeometry()); fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.LineSegments(fg, floorMat));
    }

    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    { const c = glowCv.getContext('2d'); const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }
    const glowTex = own(new THREE.CanvasTexture(glowCv));
    const shCv = document.createElement('canvas'); shCv.width = shCv.height = 64;
    { const c = shCv.getContext('2d'); const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }
    const shadowTex = own(new THREE.CanvasTexture(shCv));

    // ---------- fighters ----------
    const CARD_W = 3.1, CARD_H = 3.6;
    const YAW = [0.34, -0.34];
    const loader = new THREE.TextureLoader();
    // the card starts with a plain white map, so the portrait arriving later swaps a texture
    // instead of building a new shader mid-countdown
    const blank = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
    blank.colorSpace = THREE.SRGBColorSpace; blank.needsUpdate = true;
    const F = opts.sides.map((s, i) => {
      const g = new THREE.Group();
      g.position.copy(POS[i]);
      g.rotation.y = YAW[i];
      scene.add(g);
      const col = sideCol(i);
      // hex pad and the light column under the card (the arena brings its own pedestals)
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
      const mat = own(new THREE.MeshBasicMaterial({ color: '#d8d8d8', transparent: true, map: blank }));
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
      if (arena) { pad.visible = false; ring.visible = false; beam.visible = false; }
      return { g, card, plane, mat, tintMat, brMat, beam, ring, col, base: card.position.clone(), kick: 0, kickDir: i ? 1 : -1, flash: 0, flashCol: new THREE.Color('#ffffff'), stun: 0, freeze: 0, fog: 0, hp: 1, ko: 0, koT: 0, tex: null, seq: 0, looked: Promise.resolve(), glitch: 0, lt: 9, lp: 0, recoil: 0, drop: 0, broken: null };
    });

    // ---------- operators (js/app/operator3d.js) ----------
    // When both sides bring a preset, each pedestal holds that player's operator instead of the
    // portrait card. The operator stands in its own rig, turned three quarters to the camera and
    // facing the other side; its moves (js/app/fight-moves.js) lunge it toward the other fighter,
    // stagger it back or knock it down, and the card group (hidden) follows its chest so the status
    // effects still sit on the body.
    const OS = 2.3;   // operator scale: about 4.2 units tall
    if (OPS) {
      const TH = { ...THREE, RoundedBoxGeometry: opts.RoundedBoxGeometry };
      if (!arena) {
        scene.add(new THREE.HemisphereLight('#c9d3da', '#08090a', 0.9));
        const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(0, 8, 10); scene.add(key);
      }
      F.forEach((f, i) => {
        if (!arena) { const rim = new THREE.DirectionalLight(f.col, 1.2); rim.position.set(f.g.position.x * 1.4, 4, -6); scene.add(rim); }
        const op = Operator.create(TH, opts.sides[i].preset, {});
        const rig = new THREE.Group(); rig.position.copy(POS[i]).setY(arena ? arena.PAD_TOP : 0.22); scene.add(rig);
        op.group.scale.setScalar(OS);
        op.group.rotation.order = 'YXZ';
        op.group.rotation.y = (i ? -1 : 1) * (Math.PI / 2 - 0.5);   // facing the other side, three quarters to the camera
        rig.add(op.group);
        f.card.children.forEach(ch => { ch.visible = false; });
        f.card.scale.set(0.62, 1.12, 1);
        f.op = op; f.rig = rig; f.mv = FightMoves.create(THREE, op); f.typeAt = -9; f.won = false; f.dir = i ? -1 : 1; f.yaw = op.group.rotation.y;
        f.root = { x: 0, y: 0, rx: 0 }; f.wasLanded = false;
        f.kb = (opts.sides[i].preset.kb && opts.sides[i].preset.kb.style) || 'slab';
        // a soft contact shadow that follows the feet
        const sh = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ map: shadowTex, color: '#000000', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false })));
        sh.rotation.x = -Math.PI / 2; sh.renderOrder = 2; scene.add(sh); f.shadow = sh;
      });
    }
    // where a fighter's chest, head and hands are this frame
    const _cb = new V();
    function chest(i, out) {
      const f = F[i];
      if (f.op) { const B = f.op.bones; if (B && B.Spine2) return B.Spine2.getWorldPosition(out); return f.rig.getWorldPosition(out).setY(2.8); }
      return f.card.getWorldPosition(out);
    }
    function headOf(i, out) { const f = F[i]; if (f.op && f.op.bones && f.op.bones.Head) return f.op.bones.Head.getWorldPosition(out); return chest(i, out).setY(f.base.y + CARD_H / 2 + 0.2); }
    function handOf(i, out) { const f = F[i]; if (f.op && f.op.bones && f.op.bones.RightHand) return f.op.bones.RightHand.getWorldPosition(out); return chest(i, out).add(_cb.set(i ? -1.8 : 1.8, 0.1, 0.5)); }
    function feetOf(i, out) { const f = F[i]; if (f.rig) return out.copy(f.rig.position).add(_cb.set(f.dir * f.root.x * OS, 0, 0)); return out.copy(POS[i]); }

    // ---------- combat effects ----------

    let shake = 0, stopUntil = 0, flashGate = [];
    const canFlash = () => { const t = performance.now(); flashGate = flashGate.filter(x => t - x < 1000); if (flashGate.length >= (reduce ? 2 : 3)) return false; flashGate.push(t); return true; };
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm: reduce, reduce, pixelHeight: () => renderer.domElement.height,
      juice: { shake: k => { shake = Math.max(shake, k * 0.6); }, stop: ms => { stopUntil = Math.max(stopUntil, performance.now() + ms); }, glitch: () => {}, dim: () => {}, tint: () => {}, canFlash },
    }) : null;
    const tmp = new V(), tmp2 = new V();
    const centre = (i, out) => chest(i, out);
    const adapters = F.map((f, i) => ({
      size: f.op ? 1.9 : 1.6,
      pos: out => centre(i, out),
      top: out => (f.op ? headOf(i, out).add(tmp2.set(0, 0.7, 0)) : centre(i, out).setY(f.base.y + CARD_H / 2 + 0.4)),
      base: out => feetOf(i, out).setY(0.36),
      react: (kind, power) => react(i, kind === 'stun' ? 'stun' : kind === 'freeze' ? 'freeze' : 'hit', power),
    }));
    // shots and spells leave from the thrower's hand (the card's edge without operators)
    const casterOf = i => ({ pos: out => (F[i].op ? handOf(i, out).add(tmp2.set(F[i].dir * 0.3, 0.1, 0.2)) : centre(i, out).add(tmp2.set(i ? -1.8 : 1.8, 0.1, 0.5))) });
    // sounds go through opts.audio (an ArenaAudio); none while warming up
    let warming = false;
    const snd = (name, arg) => { if (!warming && opts.audio) opts.audio.play(name, arg); };
    const csnd = (name, arg) => { if (!warming && opts.audio) opts.audio.combat(name, arg); };
    // one light that flashes where a hit lands, so the hit lights the bodies and the floor round it
    // (a real light here cost a light on every lit surface; the flare sprites carry the flash instead)
    let hitLightK = 0;
    function flashLight(at, col, k) { hitLightK = Math.max(hitLightK, Math.min(6, k)); }

    // ---------- the word as the weapon ----------
    // Each finished word leaves the attacker's card as its own letters. They fly an arc,
    // land one after another as quick ticks, and the last one carries the hit.
    const glyphTex = new Map();
    let fontOk = !document.fonts;
    if (document.fonts) document.fonts.load('600 96px "JetBrains Mono"').then(() => { fontOk = true; for (const [k, x] of glyphTex) if (k.endsWith('~')) { x.dispose(); glyphTex.delete(k); } }, () => { fontOk = true; });
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
    const glyphs = Array.from({ length: GN }, () => ({ s: sprite(glowTex),   // a map from the start: swapping null for a texture recompiles the shader
      tr: [sprite(glowTex, 0.5, 7), sprite(glowTex, 0.25, 7)], on: false, t: 0, delay: 0, dur: 0.2, a: new V(), c: new V(), b: new V(), size: 0.6, spin: 0, cb: null }));
    let gI = 0;
    const bez = (out, g, u) => {
      const v = 1 - u;
      return out.set(v * v * g.a.x + 2 * v * u * g.c.x + u * u * g.b.x, v * v * g.a.y + 2 * v * u * g.c.y + u * u * g.b.y, v * v * g.a.z + 2 * v * u * g.c.z + u * u * g.b.z);
    };

    // sparks and shards: one pool of sprites with velocity, gravity and spin
    const shardCv = document.createElement('canvas'); shardCv.width = shardCv.height = 32;
    { const c = shardCv.getContext('2d'); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(16, 1); c.lineTo(30, 27); c.lineTo(5, 22); c.closePath(); c.fill(); }
    const shardTex = own(new THREE.CanvasTexture(shardCv));
    const PN = 280;
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

    // smoke and dust: soft grey puffs drawn normally (not as light), so they read as dust and not as glow
    const smokeTex = shadowTex;
    const SN = 60;
    const puffs = Array.from({ length: SN }, () => { const m = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: smokeTex, color: '#8a9599', transparent: true, depthWrite: false, opacity: 0 }))); m.visible = false; m.renderOrder = 5; scene.add(m); return { s: m, v: new V(), life: 0, max: 1, size: 1 }; });
    let sI = 0;
    function smoke(at, n, speed, o = {}) {
      if (reduce) n = Math.ceil(n / 2);
      for (let k = 0; k < n; k++) {
        const p = puffs[sI = (sI + 1) % SN];
        p.s.position.copy(at).add(tmp2.set(rnd(-0.4, 0.4), rnd(0, 0.2), rnd(-0.4, 0.4)));
        p.v.set(rnd(-1, 1), rnd(0.1, 0.6) + (o.up || 0), rnd(-0.6, 0.6)).normalize().multiplyScalar(speed * rnd(0.4, 1));
        p.size = (o.size || 1.2) * rnd(0.7, 1.3); p.max = p.life = (o.life || 1.2) * rnd(0.7, 1.2);
        p.s.material.color.set(o.col || '#7d888c'); p.op = o.op || 0.55; p.s.visible = true;
      }
    }
    // impact flares: a sharp four-point star with a soft core, for the instant a hit lands
    const flCv = document.createElement('canvas'); flCv.width = flCv.height = 128;
    {
      const c = flCv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.8)'); g.addColorStop(0.35, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      c.globalCompositeOperation = 'lighter';
      for (const [w, h] of [[128, 5], [5, 128], [70, 3], [3, 70]]) { const lg = c.createRadialGradient(64, 64, 0, 64, 64, Math.max(w, h) / 2); lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = lg; c.save(); c.translate(64, 64); if (w === 70 || h === 70) c.rotate(Math.PI / 4); c.fillRect(-w / 2, -h / 2, w, h); c.restore(); }
    }
    const flareTex = own(new THREE.CanvasTexture(flCv));
    const flares = Array.from({ length: 6 }, () => ({ s: sprite(flareTex, 1, 9), t: 9, life: 0.2, size: 2 }));
    let flI = 0;
    function flare(at, col, size = 2, life = 0.2) { const f = flares[flI = (flI + 1) % flares.length]; f.s.position.copy(at); f.s.material.color.copy(col).lerp(WHITE, 0.4).multiplyScalar(2); f.t = 0; f.life = life; f.size = size; f.s.visible = true; f.s.material.rotation = rnd(0, 0.6); }
    // shockwave rings on the floor under a fighter
    const rings = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(own(new THREE.RingGeometry(0.92, 1, 64)), own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      return { m, t: 0, life: 0.5, r: 3 };
    });
    let rI = 0;
    function ringAt(i, col, r = 3, life = 0.5) {
      const w = rings[rI = (rI + 1) % rings.length];
      feetOf(i, w.m.position).setY(arena ? 0.36 : 0.05); w.m.material.color.copy(col).multiplyScalar(2);
      w.r = r; w.life = life; w.t = 0; w.m.visible = true;
    }

    // beams for the top combo tiers, named after them: Twin beam (2) fires two thin beams,
    // Rail shot (3) one strong beam, Overload (4) a thick one that pulses. A beam grows out of
    // the attacker with the lead letter, holds through the hit and fades.
    const beamCv = document.createElement('canvas'); beamCv.width = 4; beamCv.height = 64;
    { const c = beamCv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 4, 64); }
    const beamTex = own(new THREE.CanvasTexture(beamCv)), beamGeo = own(new THREE.PlaneGeometry(1, 1));
    const beamMesh = () => {
      const m = new THREE.Mesh(beamGeo, own(new THREE.MeshBasicMaterial({ map: beamTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })));
      m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m;
    };
    const beams = Array.from({ length: 6 }, () => ({ core: beamMesh(), glow: beamMesh(), on: false, t: 0, grow: 0.3, hold: 0.4, fade: 0.35, a: new V(), b: new V(), off: new V(), w: 0.3, col: new THREE.Color(), pulse: false }));
    let bI = 0;
    function beam(a, b, col, w, grow, hold, off, pulse) {
      const B = beams[bI = (bI + 1) % beams.length];
      B.a.copy(a); B.b.copy(b); B.off.copy(off); B.col.copy(col); B.w = w; B.grow = grow; B.hold = hold; B.pulse = pulse;
      B.t = -0.04; B.on = true;
      B.core.material.color.copy(col).lerp(WHITE, 0.55).multiplyScalar(2.2);
      B.glow.material.color.copy(col).multiplyScalar(1.5);
    }
    const _bx = new V(), _by = new V(), _bz = new V(), _bm = new THREE.Matrix4(), _mid = new V();
    // a flat strip from a to b, turned to face the camera
    function strip(mesh, a, b, width, op) {
      _bx.subVectors(b, a);
      const len = _bx.length();
      if (len < 1e-3 || width <= 0 || op <= 0) { mesh.visible = false; return; }
      _bx.divideScalar(len);
      _mid.addVectors(a, b).multiplyScalar(0.5);
      _bz.subVectors(camera.position, _mid).normalize();
      _by.crossVectors(_bz, _bx).normalize(); _bz.crossVectors(_bx, _by);
      _bm.makeBasis(_bx, _by, _bz); mesh.quaternion.setFromRotationMatrix(_bm);
      mesh.position.copy(_mid); mesh.scale.set(len, width, 1);
      mesh.material.opacity = op; mesh.visible = true;
    }
    const _ba = new V(), _bb = new V();
    function drawBeams(dt) {
      for (const B of beams) {
        if (!B.on) continue;
        B.t += dt;
        if (B.t < 0) continue;
        const u = Math.min(1, B.t / B.grow);
        const tf = B.t - B.grow - B.hold, k = tf > 0 ? 1 - tf / B.fade : 1;
        if (k <= 0) { B.on = false; B.core.visible = B.glow.visible = false; continue; }
        _ba.copy(B.a).add(B.off);
        _bb.copy(B.a).lerp(B.b, Math.pow(u, 1.35)).add(B.off);
        const fl = B.pulse ? 1 + Math.sin(B.t * 42) * 0.18 : 1 + Math.sin(B.t * 25) * 0.06;
        strip(B.core, _ba, _bb, B.w * 0.4 * fl * (0.5 + 0.5 * k), Math.min(1, k * 1.5));
        strip(B.glow, _ba, _bb, B.w * 1.7 * fl * k, 0.5 * k);
        // sparks peel off the beam while it holds
        if (u >= 1 && k > 0.3 && Math.random() < dt * (B.pulse ? 60 : 30)) {
          const at = tmp.copy(_ba).lerp(_bb, Math.random());
          burst(at, 1, 2.5, B.col, { size: 0.22, life: 0.35, grav: -1 });
        }
      }
    }

    // ---------- status effects on the cards ----------
    // Frozen: frost over the card and ice crystals round its edge that shatter when it ends.
    // Locked (stun): electric arcs crawl over the card and sparks circle above it.
    // Corrupted (poison): the card pulses toxic green and bubbles rise off it; each tick puffs.
    // Blurred: smoke drifts across the face.
    const frostCv = document.createElement('canvas'); frostCv.width = 256; frostCv.height = 298;
    {
      const c = frostCv.getContext('2d'), W = 256, H = 298;
      const g = c.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.75);
      g.addColorStop(0, 'rgba(220,245,255,0.05)'); g.addColorStop(1, 'rgba(230,250,255,0.85)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineCap = 'round';
      const branch = (x, y, a, len, w, d) => {
        if (d > 4 || len < 4) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
        branch(x2, y2, a + rnd(-0.5, 0.5), len * 0.72, w * 0.7, d + 1);
        if (Math.random() < 0.7) branch(x + (x2 - x) * 0.5, y + (y2 - y) * 0.5, a + (Math.random() < 0.5 ? -1 : 1) * rnd(0.6, 1.1), len * 0.5, w * 0.6, d + 1);
      };
      for (let k = 0; k < 26; k++) {
        const side = k % 4, p = Math.random();
        const [x, y, a] = side === 0 ? [p * W, 0, Math.PI / 2] : side === 1 ? [p * W, H, -Math.PI / 2] : side === 2 ? [0, p * H, 0] : [W, p * H, Math.PI];
        branch(x, y, a + rnd(-0.6, 0.6), rnd(22, 46), 2.4, 0);
      }
    }
    const frostTex = own(new THREE.CanvasTexture(frostCv));
    const iceGeo = own(new THREE.ConeGeometry(0.13, 1, 5));
    const iceMat = own(new THREE.MeshBasicMaterial({ color: C('#cff4ff', 1.15), transparent: true, opacity: 0.85, depthWrite: false }));
    const arcMat = own(new THREE.LineBasicMaterial({ color: C('#d4eeff', 4), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const ARCS = 6, ARC_SEG = 9;
    F.forEach(f => {
      const frost = new THREE.Mesh(own(new THREE.PlaneGeometry(CARD_W + 0.1, CARD_H + 0.1)), own(new THREE.MeshBasicMaterial({ map: frostTex, color: '#e6f8ff', transparent: true, opacity: 0, depthWrite: false })));
      frost.position.z = 0.035; frost.visible = false; f.card.add(frost);
      const ice = new THREE.Group(); f.card.add(ice);
      const spikes = [];
      for (let k = 0; k < 16; k++) {
        const m = new THREE.Mesh(iceGeo, iceMat);
        // along the bottom and up the sides, pointing outwards
        const t = k / 15, onSide = k % 3 !== 0;
        let x, y, ang;
        if (!onSide) { x = (t - 0.5) * CARD_W; y = -CARD_H / 2; ang = Math.PI + rnd(-0.5, 0.5); }
        else { const sx = k % 2 ? 1 : -1; x = sx * CARD_W / 2; y = -CARD_H / 2 + t * CARD_H * 0.85; ang = -sx * Math.PI / 2 + rnd(-0.6, 0.6); }
        m.position.set(x, y, 0.05); m.rotation.z = ang; m.userData.len = rnd(0.5, 1.2);
        m.scale.set(1, 0.001, 1); ice.add(m); spikes.push(m);
      }
      const arcGeo = new THREE.BufferGeometry();
      arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ARCS * ARC_SEG * 6), 3));
      own(arcGeo);
      const arcs = new THREE.LineSegments(arcGeo, arcMat); arcs.position.z = 0.06; arcs.visible = false; arcs.frustumCulled = false; f.card.add(arcs);
      const stars = Array.from({ length: 3 }, () => sprite(glowTex, 1, 8));
      // on an operator the crystals grow up out of the floor round the feet, a prison of ice to the knees
      if (f.op) spikes.forEach((m, k) => { const a = k / spikes.length * Math.PI * 2; m.position.set(Math.cos(a) * 1.5, -2.55 + rnd(0, 0.25), Math.sin(a) * 0.9); m.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); m.userData.len *= 1.3; });
      Object.assign(f, { iceGroup: ice, frost, spikes, arcs, stars, ice: 0, wasFrozen: false, arcT: 0, poison: 0, bubbleT: 0, smokeT: 0 });
    });
    const _sp = new V();
    function zigzag(f) {
      const pos = f.arcs.geometry.attributes.position, A = pos.array;
      const edge = () => {
        const s = Math.random() * 4 | 0, p = Math.random();
        return s === 0 ? [(p - 0.5) * CARD_W, CARD_H / 2] : s === 1 ? [(p - 0.5) * CARD_W, -CARD_H / 2] : s === 2 ? [-CARD_W / 2, (p - 0.5) * CARD_H] : [CARD_W / 2, (p - 0.5) * CARD_H];
      };
      let o = 0;
      for (let a = 0; a < ARCS; a++) {
        const [x0, y0] = edge(), [x1, y1] = edge();
        let px = x0, py = y0;
        for (let k = 1; k <= ARC_SEG; k++) {
          const u = k / ARC_SEG, j = k === ARC_SEG ? 0 : 0.36;
          const nx = x0 + (x1 - x0) * u + rnd(-j, j), ny = y0 + (y1 - y0) * u + rnd(-j, j);
          A[o++] = px; A[o++] = py; A[o++] = 0; A[o++] = nx; A[o++] = ny; A[o++] = 0;
          px = nx; py = ny;
        }
      }
      pos.needsUpdate = true;
    }
    const TOXIC = new THREE.Color('#7dff4f'), VIRUS = new THREE.Color('#c06bff'), ICE = new THREE.Color('#bfefff'), SMOKE = new THREE.Color('#7f9c90');
    function drawStatus(dt) {
      F.forEach((f, i) => {
        // frozen: frost and crystals grow in, then shatter
        const frozen = f.freeze > 0 && !f.broken;
        f.ice += ((frozen ? 1 : 0) - f.ice) * Math.min(1, dt * (frozen ? 6 : 20));
        if (f.wasFrozen && !frozen && !f.broken) {
          burst(centre(i, tmp), 22, 6, ICE, { shard: true, size: 0.3, life: 0.8, grav: 9 });
          f.ice = 0;
        }
        f.wasFrozen = frozen;
        f.frost.visible = f.ice > 0.01 && !f.op; f.frost.material.opacity = f.ice * 0.75;
        for (const m of f.spikes) m.scale.set(1, Math.max(0.001, f.ice * m.userData.len), 1);
        f.iceGroup.visible = f.ice > 0.01;   // flattened spikes still showed as white specks round the body
        if (frozen && Math.random() < dt * 8) burst(centre(i, tmp).add(tmp2.set(rnd(-1.5, 1.5), rnd(-1.6, 1.6), 0.3)), 1, 0.4, ICE, { size: 0.16, life: 0.6, grav: 1 });
        // locked: arcs and circling sparks
        const stunned = f.stun > 0 && !f.broken;
        f.arcs.visible = stunned;
        if (stunned) { f.arcT -= dt; if (f.arcT <= 0) { zigzag(f); f.arcT = 0.06; } f.arcs.material.opacity = 0.6 + Math.random() * 0.4; }
        f.stars.forEach((st, k) => {
          st.visible = stunned;
          if (!stunned) return;
          const a = t * 5 + k * Math.PI * 2 / 3;
          centre(i, _sp);
          st.position.set(_sp.x + Math.cos(a) * 0.9, f.card.position.y + CARD_H / 2 + 0.4 + Math.sin(a * 2) * 0.08, _sp.z + Math.sin(a) * 0.5);
          st.scale.setScalar(0.45); st.material.color.set('#fff3a8').multiplyScalar(2);
        });
        // corrupted: bubbles rise off the card
        f.poison = Math.max(0, f.poison - dt);
        if (f.poison > 0 && !f.broken) {
          f.bubbleT -= dt;
          if (f.bubbleT <= 0) {
            f.bubbleT = 0.05;
            const at = centre(i, tmp).add(tmp2.set(rnd(-1.4, 1.4), -CARD_H / 2 + rnd(0, 1.2), 0.3));
            burst(at, 1, 0.5, Math.random() < 0.7 ? TOXIC : VIRUS, { size: rnd(0.14, 0.3), life: 1.3, grav: -2.2, up: 1.5 });
          }
        }
        // blurred: smoke across the face
        if (f.fog > 0 && !f.broken) {
          f.smokeT -= dt;
          if (f.smokeT <= 0) {
            f.smokeT = 0.04;
            burst(centre(i, tmp).add(tmp2.set(rnd(-1.2, 1.2), rnd(-0.6, 1), 0.4)), 1, 0.5, SMOKE, { size: rnd(1.3, 2.1), life: 1.6, grav: -0.3, k: 1.1 });
          }
        }
      });
    }

    let punch = 0, slowUntil = 0, slowK = 1;
    const WHITE = new THREE.Color('#ffffff');
    // the move a shot is thrown with, by combo tier
    const MOVE = ['flick', 'flick', 'jab', 'blast', 'smash'];
    function tick(to, col) {
      const f = F[to];
      f.kick = Math.min(1, f.kick + 0.08);
      burst(centre(to, tmp).add(tmp2.set(0, rnd(-0.5, 0.5), 0.3)), 2, 4, col, { size: 0.18, life: 0.25, grav: 0 });
    }
    function impact(to, tier, crit, col, onLand) {
      const f = F[to], p = tier + (crit ? 1.6 : 0);
      react(to, 'hit', 0.35 + p * 0.18, p);
      f.recoil = Math.min(1.4, 0.5 + p * 0.22);
      const at = centre(to, new V()).add(tmp.set(0, 0.2, 0.3));
      const away = to ? 1 : -1;
      burst(at, 8 + p * 5, 6 + p * 1.5, col, { shard: true, size: 0.32, life: 0.7, dir: away * 0.8, up: 0.4, grav: 9 });
      burst(at, 3 + p, 2.5 + p * 0.6, WHITE, { size: 0.3, life: 0.18, grav: 0, k: 1 });
      if (p >= 2) smoke(at, 3 + p, 1.4, { size: 1.3, life: 0.9, op: 0.35 });
      ringAt(to, col, 2.6 + p * 0.6, 0.45 + p * 0.05);
      flare(at, col, 1.6 + p * 0.7, 0.14 + p * 0.03);
      flashLight(at, col, 2 + p * 2.5);
      if (!reduce) {
        stopUntil = Math.max(stopUntil, performance.now() + (crit ? 110 : 20 + tier * 18));
        shake = Math.max(shake, 0.12 + p * 0.07);
        punch = Math.max(punch, crit ? 1 : Math.min(0.8, tier * 0.22));
      }
      snd(p >= 3 ? 'heavy' : 'jab'); if (tier >= 1) csnd('shot' + Math.min(4, tier));
      if (p >= 3) { snd('ooh'); if (opts.audio) opts.audio.swell(0.6); if (arena) arena.hype(1 - to, 0.8); }
      if (onLand) onLand();
    }
    const TIER_COL = [null, null, '#3ee6ff', '#f2c230', '#ff5ce1'];

    function shot(from, tier, onLand, o = {}) {
      const to = 1 - from, f = F[from];
      tier = Math.max(0, Math.min(4, tier | 0));
      if (f.op) { f.typeAt = t; f.mv.act(o.crit && tier < 4 ? (tier >= 2 ? 'smash' : 'jab') : MOVE[tier]); }
      const word = String(o.word || '').replace(/\s+/g, '').slice(0, 16) || '>>>';
      const T = Math.max(0.16, Math.min(0.7, (o.ms || 260) / 1000));
      const base = new THREE.Color(o.color || (from ? '#f29d30' : Theme.hex('accent')));
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
      // the shooter's keyboard (js/app/combat/fx3d.js, keyboard signatures): Compact splits the word
      // into three lanes, Split sends it from both halves, Arc rides a lightning bolt
      const kb = f.kb || 'slab';
      const side = new V(0, 0, 1).cross(tmp2.subVectors(end, start)).normalize();
      for (let k = 0; k < n; k++) {
        const g = glyphs[gI = (gI + 1) % GN];
        if (g.on && g.cb) { const cb = g.cb; g.cb = null; cb(); }   // pool wrapped: land the oldest now
        const order = from === 0 ? n - 1 - k : k;                   // 0 leads
        g.delay = 0.04 + order * step;
        g.dur = Math.max(0.08, T - (n - 1) * step - 0.04);
        g.a.copy(start);
        g.b.copy(end).add(tmp.set(rnd(-0.12, 0.12), rnd(-0.12, 0.12), 0));
        g.c.copy(ctrl);
        if (kb === 'compact') g.c.addScaledVector(side, ((k % 3) - 1) * 0.9).y += ((k % 3) - 1) * 0.5;
        else if (kb === 'split') { const s = k % 2 ? 1 : -1; g.a.addScaledVector(side, s * 0.45); g.c.addScaledVector(side, s * 1.6); }
        const map = glyph(word[k]);
        g.s.material.map = map; g.s.material.color.copy(col).multiplyScalar(2.2);
        g.tr.forEach(x => { x.material.color.copy(col).multiplyScalar(1.2); });
        g.size = size; g.spin = 0; g.t = 0; g.on = true;
        g.cb = order === n - 1 ? () => impact(to, tier, o.crit, col, onLand) : () => tick(to, col);
      }
      burst(start, 4 + tier * 2, 3, col, { size: 0.3, life: 0.3, grav: 0 });
      if (tier >= 2) flashLight(start, col, 1 + tier);
      snd('whoosh', Math.min(1, 0.2 + tier * 0.2 + (o.crit ? 0.3 : 0)));
      if (tier >= 3 || o.crit) snd('step');
      if (kb !== 'slab' && fx) { const at = end.clone(); fx.shot(1, start, out => out.copy(at), null, { color: '#' + col.getHexString(), kb, w: 0.6, dur: Math.max(0.15, T - 0.04) }); }
      if (tier >= 2) {
        const grow = T - (n - 1) * step - 0.04, hold = (n - 1) * step + (tier >= 4 ? 0.55 : 0.4);
        const w = (tier === 2 ? 0.16 : tier === 3 ? 0.34 : 0.55) * (o.crit ? 1.3 : 1);
        if (tier === 2) for (const dy of [-0.24, 0.24]) beam(start, end, col, w, grow, hold, tmp2.set(0, dy, 0), false);
        else beam(start, end, col, w, grow, hold, tmp2.set(0, 0, 0), tier >= 4);
      }
      // the big ones get the FF16 cut: over the thrower's shoulder in slow motion, then the wide as it lands
      if ((tier >= 4 || (o.crit && tier >= 3)) && !warming) want('strike', { x: from, pri: 2 });
    }

    // spells: the caster gathers it with both arms over a circle at the feet, then throws it
    const runeCv = document.createElement('canvas'); runeCv.width = runeCv.height = 256;
    {
      const c = runeCv.getContext('2d'); c.translate(128, 128); c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff';
      c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 120, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 104, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 58, 0, Math.PI * 2); c.stroke();
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); c.lineTo(Math.cos(a + Math.PI * 2 / 3) * 104, Math.sin(a + Math.PI * 2 / 3) * 104); c.stroke(); }
      c.font = '600 15px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const CH = '01{}<>#$%&*=+/abcdef';
      for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; c.save(); c.rotate(a); c.fillText(CH[k % CH.length], 0, -112); c.restore(); }
    }
    const runeTex = own(new THREE.CanvasTexture(runeCv));
    const runes = [0, 1].map(() => { const m = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }))); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3; scene.add(m); return { m, t: 9, col: new THREE.Color() }; });
    function cast(from, id, hits, effect) {
      const f = F[from], sp = window.Combat && Combat.spell ? Combat.spell(id) : null;
      const col = new THREE.Color(sp && sp.color ? sp.color : '#9ff5ff');
      if (f.op) f.mv.act('cast');
      const R = runes[from]; R.t = 0; R.col.copy(col); R.m.visible = true;
      snd('charge', 0.55); csnd(id);
      const now = performance.now();
      const self = id === 'binary-rain';
      // hits on you from the other side are the threat the camera must not cut away from
      if (!self && 1 - from === opts.me) for (const h of hits) threats.push(h.at / 1000);
      if (!warming) want('spell', { x: from, pri: 2 });
      if (!fx) return;
      // a self spell (Binary rain's heal) centres on the caster, not in front of them
      const caster = self ? { pos: out => centre(from, out) } : casterOf(from);
      fx.cast(id, { caster, target: adapters[1 - from], hits: hits.map(h => ({ at: Math.max(0, h.at - now), amount: h.dmg })), effect: effect || {} });
      setTimeout(() => { if (alive) { snd('release'); flashLight(casterOf(from).pos(new V()), col, 4); } }, reduce ? 0 : 520);
    }
    const threats = [];

    // a block: the hex shield flares between the blocker and the hit
    const hexCv = document.createElement('canvas'); hexCv.width = hexCv.height = 256;
    {
      const c = hexCv.getContext('2d'); c.strokeStyle = '#ffffff'; c.lineWidth = 2.2;
      const hs = 22;
      for (let y = 0; y < 300; y += hs * 1.5) for (let x = 0; x < 300; x += hs * Math.sqrt(3)) { const ox = (Math.round(y / (hs * 1.5)) % 2) * hs * Math.sqrt(3) / 2; c.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(x + ox + Math.cos(a) * hs * 0.92, y + Math.sin(a) * hs * 0.92); } c.stroke(); }
      const g = c.createRadialGradient(128, 128, 30, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    }
    const hexTex = own(new THREE.CanvasTexture(hexCv));
    const shields = [0, 1].map(() => { const m = new THREE.Mesh(own(new THREE.CircleGeometry(1, 6)), own(new THREE.MeshBasicMaterial({ map: hexTex, color: C('#7dffc4', 1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }))); m.visible = false; m.renderOrder = 6; scene.add(m); return { m, t: 9 }; });

    function react(i, kind, power = 0.4, p = 0) {
      const f = F[i];
      if (f.op && !f.ko) {
        if (kind === 'hit') f.mv.act(p >= 3 || power > 0.9 ? 'stagger' : 'flinch');
        if (kind === 'stun') f.mv.act('flinch');
        if (kind === 'block') f.mv.act('block');
      }
      if (kind === 'hit') { f.kick = Math.min(1, f.kick + 0.35 + power * 0.4); f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#ffffff'); }
      if (kind === 'typo') { f.flash = Math.max(f.flash, 0.6); f.flashCol.set('#ff4d5e'); f.glitch = 0.35; burst(casterOf(i).pos(new V()), 7, 3.5, RED, { shard: true, size: 0.2, life: 0.45, grav: 7 }); if (i === opts.me) csnd('fizzle'); }
      if (kind === 'block') {
        f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#7dffc4');
        const S = shields[i]; S.t = 0; S.m.visible = true;
        snd('block'); flashLight(centre(i, new V()), C('#7dffc4'), 3);
        burst(centre(i, new V()).add(tmp2.set(f.dir ? f.dir * 1.2 : 0, 0, 0.4)), 12, 5, C('#7dffc4'), { size: 0.22, life: 0.4, grav: 2 });
        if (fx && !f.op) fx.event('ward', { caster: adapters[i] });
      }
      if (kind === 'stun') { f.stun = Math.max(f.stun, power > 10 ? power / 1000 : 1.5); csnd('zap'); }
      if (kind === 'freeze') { f.freeze = Math.max(f.freeze, power > 10 ? power / 1000 : 2); csnd('ice'); }
      if (kind === 'fog') { f.fog = 4; }
      if (kind === 'poison') { f.poison = Math.max(f.poison, power > 10 ? power / 1000 : 6); burst(centre(i, new V()), 16, 4, TOXIC, { size: 0.3, life: 0.7, grav: -1 }); }
      if (kind === 'poisonTick') { f.kick = Math.min(1, f.kick + 0.12); f.flash = Math.max(f.flash, 0.3); f.flashCol.set('#7dff4f'); burst(centre(i, new V()).add(tmp2.set(rnd(-0.6, 0.6), rnd(-0.6, 0.6), 0.3)), 6, 2.5, TOXIC, { size: 0.25, life: 0.5, grav: -2 }); }
      if (kind === 'cleanse') { f.freeze = 0; f.stun = 0; f.poison = 0; f.fog = 0; burst(centre(i, new V()), 24, 5, C('#c8ffe0'), { size: 0.3, life: 0.7, grav: -1.5 }); snd('heal'); }
      if (kind === 'flash') { f.flash = 1; f.flashCol.set('#ffffff'); }
    }
    function aura(i, name, on) { if (fx) fx.aura(name, on, { caster: adapters[i], target: adapters[1 - i] }); }

    // Art has no avatar look yet, so his card shows the laurel mark in his colour
    function artTexture() {
      const cv = document.createElement('canvas'); cv.width = cv.height = 512;
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(256, 220, 20, 256, 256, 360);
      g.addColorStop(0, '#0b2a30'); g.addColorStop(1, Theme.hex('bg'));
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

    // f.looked settles once the final portrait is on the card (or failed), for warm() to wait on
    function setLook(i, look) {
      const f = F[i], seq = ++f.seq;
      if (f.op) { f.looked = Promise.resolve(); return; }   // the operator is the look; no portrait to render
      const put = tex => { if (f.tex) f.tex.dispose(); f.tex = tex; f.mat.map = tex; };
      if (look && look.art) { f.plane.scale.x = 1; put(artTexture()); f.looked = Promise.resolve(); return; }
      if (!look || !window.Avatar) { f.looked = Promise.resolve(); return; }
      if (!f.tex) loader.load(Avatar.fallback(look, 256), tex => { if (!alive || seq !== f.seq || f.tex) { tex.dispose(); return; } tex.colorSpace = THREE.SRGBColorSpace; put(tex); });
      f.looked = Avatar.thumb(look, 512, 512).then(url => new Promise(res => {
        if (seq !== f.seq || !alive) return res();
        loader.load(url, tex => {
          if (!alive || seq !== f.seq) { tex.dispose(); return res(); }
          tex.colorSpace = THREE.SRGBColorSpace;
          f.plane.scale.x = i ? -1 : 1;
          put(tex); res();
        }, undefined, () => res());
      })).catch(() => {});
    }
    function setHp(i, frac) {
      const was = F[i].hp; F[i].hp = Math.max(0, Math.min(1, frac));
      // the crowd gasps when someone drops into the danger zone
      if (was >= 0.25 && F[i].hp < 0.25 && F[i].hp > 0) { snd('gasp'); if (arena) arena.hype(1 - i, 0.5); }
    }
    const koGeo = [];
    // the KO: the loser is blown off their feet in slow motion and stays down; without operators
    // the card breaks into pieces of the portrait
    function ko(i) {
      const f = F[i], w = F[1 - i];
      f.ko = 1; f.koT = 0;
      const at = centre(i, new V());
      burst(at, 26, 9, f.col, { shard: true, size: 0.4, life: 1.1, up: 0.5, grav: 8 });
      burst(at, 6, 4, WHITE, { size: 0.4, life: 0.25, grav: 0, k: 1 });
      ringAt(i, f.col, 6, 0.9);
      flashLight(at, WHITE, 8);
      shake = Math.max(shake, reduce ? 0 : 0.6);
      if (!warming) {
        snd('ko'); snd('cheer', 1); if (opts.audio) opts.audio.swell(1);
        if (arena) { arena.hype(1 - i, 1.4); arena.board({ text: 'K.O.', hot: 1 - i, sub: (opts.sides[1 - i].name || '').toUpperCase() + ' TAKES THE ROUND' }); }
        want('ko', { x: i, pri: 4 });
        if (reduce) slowUntil = 0;
      }
      if (f.op) { f.mv.act('knock'); f.landT = 0; if (w.op) { w.won = true; w.mv.release(); } return; }
      if (!reduce && !warming) { slowUntil = performance.now() + 1500; slowK = 0.3; }
      if (f.broken) return;
      const cols = 6, rows = 7, cw = CARD_W / cols, ch = CARD_H / rows;
      const grp = new THREE.Group(); grp.scale.x = f.plane.scale.x; f.card.add(grp);
      const list = [];
      // the pieces' shapes are made once and reused, so a KO uploads nothing new
      if (!koGeo.length) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const geo = own(new THREE.PlaneGeometry(cw * 0.98, ch * 0.98)), uv = geo.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k)) / cols, (r + uv.getY(k)) / rows);
        koGeo.push(geo);
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const m = new THREE.Mesh(koGeo[r * cols + c], f.mat);
        const x = -CARD_W / 2 + (c + 0.5) * cw, y = -CARD_H / 2 + (r + 0.5) * ch;
        m.position.set(x, y, 0.02);
        list.push({ m, v: new V(x * rnd(1.4, 2.8) + rnd(-0.6, 0.6), y * rnd(0.5, 1.2) + rnd(0.3, 1.8), rnd(0.2, 2.5)), r: new V(rnd(-5, 5), rnd(-5, 5), rnd(-7, 7)) });
        grp.add(m);
      }
      f.card.children.forEach(c => { if (c !== grp) c.visible = false; });
      f.broken = { grp, list, t: 0 };
    }
    // a knocked fighter gets up before the next round starts
    function rise() { F.forEach(f => { if (f.op && f.mv.down() && !f.lost) { f.mv.act('getup'); snd('getup'); } }); }
    // a new round: knocked fighters get up, cards come back together and drop onto their pads
    function revive() {
      F.forEach((f, i) => {
        if (f.broken) { f.card.remove(f.broken.grp); f.broken = null; f.card.children.forEach(ch => { ch.visible = true; }); }
        if (f.op) { if (f.mv.down()) { f.mv.act('getup'); snd('getup'); } }
        else { f.drop = reduce ? 0 : 1; if (reduce) ringAt(i, f.col, 3, 0.5); }
        f.ko = 0; f.koT = 0; f.stun = 0; f.freeze = 0; f.recoil = 0; f.poison = 0; f.fog = 0; f.ice = 0; f.wasFrozen = false; f.won = false;
      });
    }
    // the phase of the match: the face-off before a round, the bell, the pause after one
    let phaseNow = '';
    function phase(name, round = 1) {
      if (name === phaseNow) return;
      const was = phaseNow; phaseNow = name;
      if (name === 'count' || name === 'break') {
        F.forEach(f => { if (f.op && !f.mv.down() && !f.won) f.mv.hold('ready'); });
        if (name === 'count') {
          if (arena) arena.board({ text: `ROUND ${round}`, sub: 'GET READY' });
          if (!warming) { want('faceoff', { pri: 3 }); setTimeout(() => { if (alive && F[1].op && phaseNow === 'count') F[1].mv.act('taunt'); }, 1300); }
        }
      }
      if (name === 'fight') {
        F.forEach(f => { if (f.op) f.mv.release(); });
        if (arena) arena.board({ text: 'FIGHT', sub: `ROUND ${round}` });
        if (was && !warming) { snd('bell'); snd('go'); if (arena) arena.hype(-1, 0.7); if (opts.audio) opts.audio.swell(0.7); }
        setTimeout(() => { if (alive && arena && phaseNow === 'fight') arena.board({ text: `ROUND ${round}`, sub: (opts.sides[0].name || '') + ' VS ' + (opts.sides[1].name || '') }); }, 1800);
      }
    }
    // the match is over: the winner celebrates under the lights and the camera circles them
    function result(win) {
      if (win < 0) { F.forEach(f => { if (f.op && !f.mv.down()) f.mv.release(); }); return; }
      const w = F[win], l = F[1 - win];
      w.won = true; if (w.op) { w.mv.release(); if (w.mv.down()) w.mv.act('getup'); }
      if (l.op && !l.mv.down()) l.lost = true;
      if (arena) { arena.board({ text: 'WINNER', hot: win, sub: (opts.sides[win].name || '').toUpperCase() }); arena.hype(win, 1.4); }
      snd(win === opts.me || opts.me < 0 ? 'fanfare' : 'lose');
      if (opts.audio) opts.audio.swell(1);
      want('victory', { x: win, pri: 5 });
    }

    const _s = new V();
    function screen(i, out = {}) {
      if (F[i].op) headOf(i, _s).add(tmp2.set(0, 0.9, 0)); else centre(i, _s).setY(F[i].base.y + CARD_H / 2 + 0.2);
      _s.project(camera);
      out.x = (_s.x * 0.5 + 0.5) * host.clientWidth; out.y = (-_s.y * 0.5 + 0.5) * host.clientHeight;
      return out;
    }

    // ---------- size ----------
    let W = 600, H = 360;
    function fit() {
      const w = host.clientWidth || 600, h = host.clientHeight || 360;
      W = w; H = h;
      renderer.setSize(w, h, false); composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    fit();
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);

    // ---------- the camera director (js/app/camdir.js) ----------
    // The home shot is a broadcast two-shot from the side: wide enough for both fighters and their
    // lunges, as close as the strip allows. Cutaways: the face-off before a round, a big strike
    // (over the shoulder in slow motion, then the wide as it lands), a cast, the KO (slow motion on
    // the fall, then the wide past the winner) and the winner's circle. None plays while a spell is
    // on its way to you.
    const GFOV = 30;
    const tanV = d => Math.tan(THREE.MathUtils.degToRad(d / 2));
    // distance that fits a span of w wide and h high in the strip
    const fitD = (w, h, fov) => Math.max(w / 2 / (tanV(fov) * camera.aspect), h / 2 / tanV(fov));
    const fp = [new V(), new V()], fc = [new V(), new V()], vv = new V(), vw = new V();
    const fh = [new V(), new V()];
    function subj() { for (let i = 0; i < 2; i++) { feetOf(i, fp[i]); chest(i, fc[i]); headOf(i, fh[i]); } }
    let drift = 0;
    const shots = {
      game: { fov: GFOV, omega: 3.2, pose(c, out) {
        const x0 = Math.min(fp[0].x, fp[1].x, fh[0].x, fh[1].x) - 2.4, x1 = Math.max(fp[0].x, fp[1].x, fh[0].x, fh[1].x) + 2.4, cx = (x0 + x1) / 2;
        const D = Math.min(30, fitD(x1 - x0, 6.4, GFOV) + 1.4);
        const sw = reduce ? 0 : Math.sin(drift * 0.16) * 0.06;   // a slow sway round the stage, a few degrees
        out.pos.set(cx + Math.sin(sw) * D, 3.1 + D * 0.06, Math.cos(sw) * D + 0.4);
        out.look.set(cx, 2.35, 0.4);
      } },
      faceoff: { pri: 3, parts: [
        // a crane down over the stage, then each fighter in a close three-quarter shot
        { len: 1.0, cut: 1, fov: 40, omega: 3, pose(c, out) { const u = c.u; out.pos.set(0, 11 - 6 * u, 21 - 4 * u); out.look.set(0, 2 + u * 0.4, 0); } },
        { len: 1.05, cut: 1, fov: 28, omega: 4, pose(c, out) { const f = F[0]; const yaw = f.yaw - 0.45; out.pos.set(fp[0].x + Math.sin(yaw) * 7.6, 3.4, fp[0].z + Math.cos(yaw) * 7.6); out.look.set(fc[0].x + 0.4, fc[0].y + 0.3 + c.u * 0.15, fc[0].z); } },
        { len: 1.05, cut: 1, fov: 28, omega: 4, pose(c, out) { const f = F[1]; const yaw = f.yaw + 0.45; out.pos.set(fp[1].x + Math.sin(yaw) * 7.6, 3.4, fp[1].z + Math.cos(yaw) * 7.6); out.look.set(fc[1].x - 0.4, fc[1].y + 0.3 + c.u * 0.15, fc[1].z); } },
      ] },
      strike: { pri: 2, parts: [
        { len: 0.5, cut: 1, slow: 0.3, fov: 34, pose(c, out) { const i = c.x, j = 1 - i, d = F[i].dir; out.pos.set(fp[i].x - d * 3.4, 4.3, fp[i].z + 3.2); out.look.set(fc[j].x, fc[j].y, fc[j].z); } },
        { len: 0.75, cut: 1, slow: 0.65, fov: 38, pose(c, out) { const j = 1 - c.x; out.pos.set((fp[0].x + fp[1].x) / 2 + F[j].dir * -2, 1.5, 12.5); out.look.set(fc[j].x * 0.7, 2.4, 0.4); } },
      ] },
      spell: { pri: 2, parts: [
        { len: 0.8, cut: 1, slow: 0.55, fov: 32, pose(c, out) { const i = c.x, f = F[i], yaw = f.yaw - f.dir * 0.2; out.pos.set(fp[i].x + Math.sin(yaw) * 6.5, 1.3 + c.u * 0.4, fp[i].z + Math.cos(yaw) * 6.5); out.look.set(fc[i].x, fc[i].y + 0.9, fc[i].z); } },
        { len: 0.8, cut: 1, fov: 40, omega: 3, pose(c, out) { const i = c.x, d = F[i].dir; out.pos.set(fp[i].x - d * 5, 4.6, 13); out.look.set(fp[1 - i].x * 0.6, 2.4, 0); } },
      ] },
      ko: { pri: 4, free: true, parts: [
        { len: 1.5, cut: 1, slow: 0.28, fov: 44, pose(c, out) { const i = c.x, d = F[i].dir; out.pos.set(fp[i].x + d * 4.2, 1.5, fp[i].z + 6.6); out.look.set(fp[i].x - d * 1.4, 2.0, fp[i].z); } },
        { len: 1.7, cut: 1, slow: 0.7, fov: 40, omega: 2.5, pose(c, out) { const i = c.x, j = 1 - i, d = F[j].dir; out.pos.set(fp[j].x - d * 3.2, 3.2 + c.u * 0.6, fp[j].z + 6.5 - c.u * 1.2); out.look.set((fp[i].x + fp[j].x) / 2, 1.8, 0); } },
      ] },
      victory: { pri: 5, free: true, len: 3.6, fov: 34, omega: 3, pose(c, out) {
        const i = c.x, a = (F[i].op ? 0 : 0) + (i ? -1 : 1) * (0.5 - c.u * 1.0);
        out.pos.set(fp[i].x + Math.sin(a) * 9.5, 3.1 + c.u * 0.8, fp[i].z + Math.cos(a) * 9.5); out.look.set(fc[i].x, fc[i].y + 0.4, fc[i].z);
      } },
    };
    const dir = window.CamDirector ? CamDirector.create(THREE, camera, {
      reduce, shots, lockBefore: 1.2, gap: 3.2, budget: 3,
      onPart(name, idx, part) { if (part.slow && !reduce) { slowK = part.slow; slowUntil = performance.now() + part.len * 1000; } else if (!part.slow) slowUntil = 0; },
    }) : null;
    function want(name, w) { if (dir && !warming) dir.want(name, w); }
    const lineA = new V(), lineB = new V();

    // ---------- frame ----------
    let alive = true, last = performance.now(), t = 0, rt = 0;
    const camAt = new V(), lookAt = new V();
    const ease = u => 1 - Math.pow(1 - u, 3);
    // compile every shader now, hidden pooled effects included, so the first hit, spell or status
    // effect in a fight doesn't stall a frame while its shader compiles
    try { renderer.compile(scene, camera); } catch (e) {}
    let loopErr = 0, perfAcc = 0, perfN = 0, qLevel = 2;
    renderer.setAnimationLoop(() => { try { frame(); } catch (e) { if (loopErr++ < 3) console.error('arena frame', e); } });
    function frame() {
      if (!alive || document.hidden || !visible) { last = performance.now(); return; }
      const nowT = performance.now();
      const real = Math.min(0.05, (nowT - last) / 1000); last = nowT;
      rt = nowT / 1000;
      let dt = frozen ? 0 : real;
      if (nowT < stopUntil) dt *= 0.08;            // hit stop
      else if (nowT < slowUntil) dt *= slowK;      // slow motion from the director's shot
      t += dt; drift += real;
      F.forEach((f, i) => {
        const toMid = -f.kickDir;
        f.kick = Math.max(0, f.kick - dt * 3.2);
        f.recoil = Math.max(0, f.recoil - dt * 2.6);
        f.flash = Math.max(0, f.flash - dt * 7);
        f.stun = Math.max(0, f.stun - dt); f.freeze = Math.max(0, f.freeze - dt); f.fog = Math.max(0, f.fog - dt);
        f.glitch = Math.max(0, f.glitch - dt);
        f.lt += dt;
        if (f.op) {
          // the operator: its own animation underneath, the fight move on top, the root motion on the rig
          f.op.play(f.won ? 'victory' : f.lost ? 'defeat' : t - f.typeAt < 2.5 ? 'type' : 'idle');
          const odt = f.freeze > 0 ? dt * 0.15 : f.stun > 0 ? dt * 0.05 : dt;
          f.op.update(odt);
          if (frozen && f.hold) f.mv.seek(f.hold[0], f.hold[1]);
          const r = f.mv.update(odt);
          f.root.x = r.x; f.root.y = r.y; f.root.rx = r.rx;
          const jitter = (f.stun > 0 || f.glitch > 0) && !reduce ? (Math.random() - 0.5) * 0.08 : 0;
          // standing on the pedestal, or a step down onto the stage when a lunge or a fall goes past its edge
          const off = Math.abs(r.x * OS), padY = arena ? arena.PAD_TOP * (1 - smoothU(Math.min(1, Math.max(0, (off - arena.PAD_R + 0.35) / 0.5)))) : 0.22;
          f.rig.position.y = padY;
          f.op.group.position.set((f.dir * r.x * OS) + jitter, r.y * OS, 0);
          f.op.group.rotation.x = r.rx;
          // the winner turns to the crowd and the camera
          const yawTo = f.won ? 0 : f.yaw;
          f.op.group.rotation.y += (yawTo - f.op.group.rotation.y) * Math.min(1, dt * 3);
          // the KO landing: a thud of dust where the body hits the floor
          if (f.mv.landed() && !f.wasLanded) { feetOf(i, tmp).add(tmp2.set(-f.dir * 2.2, 0.3, 0)); smoke(tmp, 14, 2.6, { size: 1.6, life: 1.4, op: 0.6 }); ringAt(i, SMOKE, 3.5, 0.7); snd('knock'); shake = Math.max(shake, reduce ? 0 : 0.45); }
          f.wasLanded = f.mv.landed();
          f.shadow.position.set(f.rig.position.x + f.dir * r.x * OS - (r.rx < -0.2 ? f.dir * 1.9 * Math.min(1, -r.rx / 1.5) : 0), f.rig.position.y + 0.012, f.rig.position.z);
          const sw = 2.6 + Math.min(1, -r.rx / 1.5) * 2.4;
          f.shadow.scale.set(sw, 2.2, 1); f.shadow.material.opacity = 0.75 - Math.min(0.35, r.y * 0.6);
          // the hidden card follows the chest, so frost, arcs and stars sit on the body
          chest(i, f.card.position); f.card.position.y -= 0.2;
        } else {
          // lunge: pull back for 70 ms, strike forward, settle back
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
          if (f.stun > 0) { op = Math.max(op, 0.12 + Math.sin(t * 30) * 0.06); c = tmpCol.set('#3d7bff'); }
          else if (f.freeze > 0) { op = Math.max(op, 0.22); c = tmpCol.set('#bfefff'); }
          else if (f.poison > 0) { op = Math.max(op, 0.07 + 0.05 * Math.sin(t * 7)); c = tmpCol.set('#5cff6a'); }
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
        }
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
      for (const f of flares) {
        if (!f.s.visible) continue;
        f.t += dt; const u = f.t / f.life;
        if (u >= 1) { f.s.visible = false; continue; }
        f.s.scale.setScalar(f.size * (0.6 + 0.6 * u)); f.s.material.opacity = 1 - u * u;
      }
      for (const p of puffs) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.v.multiplyScalar(1 - dt * 2.2); p.s.position.addScaledVector(p.v, dt);
        const k = p.life / p.max;
        p.s.scale.setScalar(p.size * (1.6 - k * 0.8)); p.s.material.opacity = p.op * Math.min(1, (1 - k) * 6) * k;
      }
      for (const w of rings) {
        if (!w.m.visible) continue;
        w.t += dt;
        const u = w.t / w.life;
        if (u >= 1) { w.m.visible = false; continue; }
        w.m.scale.setScalar(0.3 + w.r * ease(u)); w.m.material.opacity = 0.85 * (1 - u);
      }
      // the cast circles at the feet and the block shields
      runes.forEach((R, i) => {
        if (!R.m.visible) return;
        R.t += dt;
        const u = R.t / 1.2;
        if (u >= 1) { R.m.visible = false; return; }
        feetOf(i, R.m.position).setY((arena ? 0.36 : 0.05) + 0.01);
        R.m.scale.setScalar(1.2 + 3.4 * ease(Math.min(1, u * 2.5)));
        R.m.rotation.z = t * 1.6 * (i ? -1 : 1);
        R.m.material.color.copy(R.col).multiplyScalar(1.8);
        R.m.material.opacity = Math.min(1, u * 6) * (1 - smoothU(Math.max(0, (u - 0.55) / 0.45)));
        if (u < 0.45 && Math.random() < dt * 30) burst(tmp.copy(R.m.position).add(tmp2.set(rnd(-1.4, 1.4), 0.1, rnd(-1.4, 1.4))), 1, 2, R.col, { size: 0.2, life: 0.8, grav: -4, up: 2 });
      });
      shields.forEach((S, i) => {
        if (!S.m.visible) return;
        S.t += dt;
        const u = S.t / 0.55;
        if (u >= 1) { S.m.visible = false; return; }
        centre(i, S.m.position).add(tmp2.set(F[i].dir ? F[i].dir * 1.3 : (i ? -1.3 : 1.3), 0.2, 0.3));
        S.m.lookAt(tmp.copy(S.m.position).add(tmp2.set(F[i].dir ? F[i].dir : (i ? -1 : 1), 0, 0.35)));
        S.m.scale.setScalar(1.3 + 0.5 * ease(Math.min(1, u * 3)));
        S.m.material.opacity = (u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88) * 0.95;
      });
      drawBeams(dt);
      drawStatus(dt);
      hitLightK = Math.max(0, hitLightK - real * 14);
      if (arena) arena.update(t, dt, camera);
      // steady slow frames step the detail down (beams and haze, then the crowd lights, dust and pixel ratio)
      perfAcc += real; perfN++;
      if (perfAcc > 2.5) { const ms = perfAcc / perfN * 1000; perfAcc = 0; perfN = 0;
        if (ms > 30 && !warming && qLevel > 0 && !window.__fullQuality) { qLevel--; if (arena) arena.quality(qLevel); if (qLevel === 0) { renderer.setPixelRatio(1); fit(); } } }
      // the camera: the director picks the shot, then shake and the punch-in on big hits on top
      shake = Math.max(0, shake - real * 2.5);
      punch = Math.max(0, punch - real * 2.2);
      if (dir) {
        subj();
        while (threats.length && threats[0] < rt) threats.shift();
        threats.sort((a, b) => a - b);
        lineA.copy(fp[1]); lineB.copy(fp[0]);
        dir.update(rt, real, { threatAt: threats.length ? threats[0] : Infinity, line: [lineA, lineB], subjects: { a: fc[0], b: fc[1] } });
        // camera test probe (tests set window.__camProbe): the shot, a spell on its way to you, both fighters on screen
        if (window.__camProbe) {
          const P2 = v => { tmp.copy(v).project(camera); return Math.abs(tmp.x) <= 1 && Math.abs(tmp.y) <= 1 && tmp.z < 1; };
          (window.__camLog ||= []).push({ t: +rt.toFixed(3), shot: dir.shot(), wind: threats.length > 0, both: P2(fc[0]) && P2(fc[1]), q: camera.quaternion.toArray().map(x => +x.toFixed(4)), cam: camera.position.toArray().map(x => +x.toFixed(2)) });
        }
      } else {
        camera.position.set(0, 4.8, Math.max(17, 8.6 / (tanV(camera.fov) * camera.aspect) + 1.5)); camera.lookAt(0, 2.5, 0);
      }
      if (shake > 0 && !reduce) camera.position.add(tmp.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
      const zoom = 1 + punch * 0.07;
      if (Math.abs(camera.zoom - zoom) > 0.001) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
      if (fx) fx.update(dt);
      composer.render();
    }
    const smoothU = x => x * x * (3 - 2 * x);
    // tests: hold fighter i in a move at time t (frozen), or let go
    let frozen = false;
    function debugPose(i, name, tt) { if (name == null) { frozen = false; F.forEach(f => { f.hold = null; if (f.mv) f.mv.reset(); }); return; } frozen = true; F[i].hold = [name, tt]; }
    const tmpCol = new THREE.Color(), RED = new THREE.Color('#ff4d5e');

    // ---------- warm-up before the countdown ----------
    // Everything that is slow the first time it happens is done here, behind the loading cover:
    // the letter textures, both portraits, every shader, and one real frame of every effect.
    // compile() alone isn't enough on Windows, where the graphics driver finishes some shaders
    // only on their first draw, so each effect is played once and then cleared.
    const frames = n => new Promise(res => { let k = 0; const f = () => (++k >= n || !alive ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    async function warm(chars = '') {
      warming = true;
      try { return await rehearse(chars); } finally { warming = false; }
    }
    async function rehearse(chars) {
      if (document.fonts) { try { await document.fonts.load('600 96px "JetBrains Mono"'); } catch (e) {} }
      fontOk = true;
      const set = new Set(('abcdefghijklmnopqrstuvwxyz0123456789-\'.,>' + chars).replace(/\s/g, ''));
      for (const ch of set) renderer.initTexture(glyph(ch));
      for (const x of [blank, glowTex, shardTex, beamTex, frostTex, flareTex, runeTex, hexTex, shadowTex]) renderer.initTexture(x);
      await Promise.race([Promise.all(F.map(f => f.looked)), new Promise(r => setTimeout(r, 8000))]);
      if (!alive) return false;
      F.forEach(f => { if (f.tex) renderer.initTexture(f.tex); });
      try { await renderer.compileAsync(scene, camera); } catch (e) {}
      if (!alive) return false;
      // the rehearsal: every shot tier from both sides, the reactions, statuses, spells and a KO
      const word = [...set].join('').slice(0, 16);
      for (let tier = 0; tier <= 4; tier++) for (const side of [0, 1]) shot(side, tier, null, { word, crit: tier === 4, ms: 300 });
      F.forEach((f, i) => { ['typo', 'block', 'poison', 'poisonTick', 'flash'].forEach(k => react(i, k)); react(i, i ? 'freeze' : 'stun', 1); react(1 - i, 'fog', 1); });
      if (fx) {
        for (const name of ['ward', 'hyper', 'root', 'split']) aura(0, name, true);
        for (const id of fx.SPELLS) { const sp = window.Combat && Combat.spell(id); cast(0, id, [{ at: performance.now() + 120, dmg: 1 }], (sp && sp.effect) || {}); }
      }
      await frames(40);
      F.forEach((f, i) => { react(i, i ? 'stun' : 'freeze', 1); react(i, 'cleanse'); });
      ko(0); ko(1);
      await frames(20);
      // put everything back as it was
      if (fx) { for (const name of ['ward', 'hyper', 'root', 'split']) aura(0, name, false); fx.clear(); }
      for (const g of glyphs) { g.on = false; g.cb = null; g.s.visible = false; g.tr.forEach(x => { x.visible = false; }); }
      for (const p of parts) { p.s.visible = false; p.life = 0; }
      for (const p of puffs) { p.s.visible = false; p.life = 0; }
      for (const f of flares) f.s.visible = false;
      for (const w of rings) w.m.visible = false;
      for (const B of beams) { B.on = false; B.core.visible = B.glow.visible = false; }
      revive();
      F.forEach(f => { f.drop = 0; f.kick = f.recoil = f.flash = f.glitch = f.lt = 0; f.lt = 9; f.ice = 0; f.frost.visible = false; f.arcs.visible = false; });
      stopUntil = slowUntil = 0; shake = punch = 0; hitLightK = 0;
      F.forEach(f => { if (f.mv) f.mv.reset(); f.won = false; f.lost = false; });
      runes.forEach(R => { R.m.visible = false; }); shields.forEach(S => { S.m.visible = false; });
      threats.length = 0;
      if (dir) dir.reset();
      await frames(2);
      return alive;
    }

    function dispose() {
      alive = false;
      F.forEach(f => { if (f.op) f.op.dispose(); });
      renderer.setAnimationLoop(null);
      if (arena) arena.dispose();
      ro.disconnect(); io.disconnect();
      if (fx) fx.dispose();
      F.forEach(f => { if (f.tex) f.tex.dispose(); });
      glyphTex.forEach(x => x.dispose());
      keep.forEach(x => { try { x.dispose(); } catch (e) {} });
      composer.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    }

    return { shot, cast, react, aura, setLook, setHp, ko, revive, rise, phase, result, screen, warm, dispose, director: () => dir, debugPose,
      arena: () => arena, renderer: () => renderer, bloom: () => bloom, info: () => ({ warming, quality: qLevel, fx: fx ? fx.info() : null, letters: glyphs.filter(g => g.on).length, shot: dir ? dir.shot() : 'game', log: dir ? dir.log().slice(-12) : [], moves: F.map(f => (f.mv ? f.mv.name() : '')) }) };
  }

  return { mount };
})();
