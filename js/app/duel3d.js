// The duel arena in three.js: two bots (BotKit, driven by bot-fighter.js) over hex pedestals in a
// night stadium (duel-arena.js), fighting like a fighting game broadcast (Gid, 28 Nov 2026: duels are
// bot vs bot; operators stay on the profile page). Every key a side types sends a spark into its bot's
// orb, a finished word is a strike, a word finished while the other side's shot is coming is a dodge.
// The older operator and portrait-card fighters below still work for a side without a bot. Each finished word flies over as its own letters; the
// operator throws it with a move that grows with the combo tier (fight-moves.js): a flick, a jab,
// a two-hand blast, a dashing smash. Spells are cast with both arms and a circle at the feet, a
// block raises a hex shield, heavy hits stagger, the KO blows the loser off their feet in slow
// motion. A camera director (camdir.js) frames both fighters like a broadcast and cuts away only
// when no spell is on its way to you: the face-off before a round, big strikes, casts, the KO and
// the winner. Without operators each side is a portrait card (the older 2.5D look).
//
//   const sc = DuelScene.mount(host, { sides: [{ look, color, bot: { id, look }, kb, name }, ...], me, audio });
//     bot: a BotKit bot (BotKit.mine() or BotKit.random(seed)); kb: the shooter's keyboard style
//     ('slab' | 'compact' | 'split' | 'arc'), which only changes how its shots fly
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
//   sc.key(side, frac)                a correct key: a spark into the orb, frac = share of the word typed
//   sc.wpm(side, w)                   live wpm, which sets the bot's stance
//   sc.hold(side, frac)               Showdown: a finished word, the spark stays and the orb holds at frac
//   sc.strike(from, words, o)         Showdown: the round's attack from `words` finished words
//                                     o: { crit, dodge, onLand }; 1-3 a shot, 4-6 a double, 7-9 the dash, 10 the finisher
//   sc.clear()                        Showdown: both orbs empty for a new round
//   sc.exchange(attacks, o)           Showdown: the round's attacks (ShowdownRules.resolve) as one directed
//                                     scene; o: { acc: [a, b], close, onLand(attack), onDone() } -> seconds
//   sc.deflect(side)                  Clash: the next shot at side is batted back (safe mode blocked it)
//   sc.ricochet(side, to)             Clash: packet storm sends a hit from side back to to
//   sc.fizzle(side, spellId)          Clash: a spell word with a typo flies broken and is dodged or blocked
//   sc.cast(..., { blocked })         a spell stopped by safe mode flies and is batted back
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
      key: (side, frac) => impl && impl.key(side, frac),
      wpm: (side, w) => impl && impl.wpm(side, w),
      hold: (side, frac) => impl && impl.hold(side, frac),
      strike: (from, words, o = {}) => { if (impl) impl.strike(from, words, o); else if (o.onLand) o.onLand(); },
      clear: () => impl && impl.clear(),
      cast: (from, id, hits, effect, o) => impl && impl.cast(from, id, hits, effect, o),
      // the duel's choreography (28 Nov 2026): Showdown's round as one directed scene, and Clash's
      // batted-back blocks, packet storm's returns and fizzled spells
      exchange: (attacks, o = {}) => { if (impl) return impl.exchange(attacks, o); attacks.forEach(a => o.onLand && o.onLand(a)); if (o.onDone) setTimeout(o.onDone, 300); return 0.3; },
      deflect: side => !!(impl && impl.deflect(side)),
      ricochet: (side, to) => impl && impl.ricochet(side, to),
      fizzle: (side, id) => impl && impl.fizzle(side, id),
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
    const FAR = 0.42;   // the stadium behind the fighters is drawn at 0.42 of the canvas size (see drawFar)

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
    const BOTS = !!(window.BotFighter && window.BotKit && opts.sides.every(s => s.bot));
    const OPS = !BOTS && !!(window.Operator && window.FightMoves && opts.sides.every(s => s.preset));
    const POS = OPS || BOTS ? [new V(-5.2, 0, 0.4), new V(5.2, 0, 0.4)] : [new V(-6.2, 0, 0.6), new V(6.2, 0, 0.6)];
    const sideCol = i => C(opts.sides[i].color || (i ? '#f29d30' : Theme.hex('accent')));
    let arena = null;
    if (window.DuelArena) {
      try { arena = DuelArena.build(THREE, scene, { cols: [0, 1].map(i => '#' + sideCol(i).getHexString()), names: opts.sides.map(x => x.name || ''), pos: POS, lite: phone, farScale: FAR, pixelHeight: () => renderer.domElement.height }); }
      catch (e) { console.warn('Duel arena', e); arena = null; }
    }
    // the far set (arena layer 1) is drawn at FAR of the canvas size into a picture that becomes the
    // background of the main pass, where only the fighters, their pedestals and the effects are drawn
    const farRT = arena ? own(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })) : null;
    const bgCol = scene.background;
    function drawFar() {
      if (!farRT) return;
      scene.background = bgCol; camera.layers.set(1);
      renderer.setRenderTarget(farRT); renderer.render(scene, camera);
      renderer.setRenderTarget(null); camera.layers.set(0); scene.background = farRT.texture;
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
        // the operator's own one-shots (dodge, cover, heal, attack) sound through the combat bank
        const op = Operator.create(TH, opts.sides[i].preset, { onAct: k => { if (k !== 'cast') csnd('op-' + k); } });
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
    // ---------- bots (js/app/botkit.js, moved by js/app/bot-fighter.js) ----------
    // Each bot hovers over its pedestal, its group turned so local +z points at the other bot and
    // the bot itself a little toward the camera, so its face and orb read from the broadcast side.
    const BS = 1.3, TURN = 0.55;
    if (BOTS) {
      const TH = { ...THREE, RoundedBoxGeometry: opts.RoundedBoxGeometry };
      if (!arena) {
        scene.add(new THREE.HemisphereLight('#c9d3da', '#08090a', 0.9));
        const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(0, 8, 10); scene.add(key);
      }
      const gap = POS[1].x - POS[0].x;
      F.forEach((f, i) => {
        const s = opts.sides[i];
        f.dir = i ? -1 : 1;
        // the orb's sounds: yours full, the other side's softer, both even when watching; none while warming up
        const sound = opts.audio ? { ctx: opts.audio.ctx, vol: opts.me < 0 ? 0.7 : i === opts.me ? 0.9 : 0.45, pan: i ? 0.35 : -0.35, on: () => !warming && alive } : null;
        const bf = BotFighter.create(TH, s.bot.id, s.bot.look || {}, { gap, scale: BS, lite: phone, sound, roam: true });
        bf.group.position.set(POS[i].x, arena ? arena.PAD_TOP : 0.22, POS[i].z);
        bf.group.rotation.y = f.dir * Math.PI / 2;
        bf.group.children[0].rotation.y = -f.dir * TURN;
        scene.add(bf.group);
        f.bf = bf; f.yaw = f.dir * (Math.PI / 2 - TURN); f.typeAt = -9; f.won = false; f.dodgeAt = -9; f.koLand = 0;
        f.kb = s.kb || 'slab';
        // the card (hidden) rides with the bot in world space, so frost, arcs and stars sit on it
        scene.add(f.card); f.card.rotation.set(0, 0, 0);
        f.card.children.forEach(ch => { ch.visible = false; });
        f.card.scale.set(0.8, 0.72, 1);
        // a soft shadow on the floor under the hovering bot
        const sh = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ map: shadowTex, color: '#000000', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })));
        sh.rotation.x = -Math.PI / 2; sh.renderOrder = 2; scene.add(sh); f.shadow = sh;
      });
    }
    const inbound = [[], []];   // when each shot in flight at a side lands (scene time)

    // ---------- the stage: both bots use the whole arena (28 Nov 2026) ----------
    // Gid: "they can move around the arena as well". The two bots stand on a line through a centre.
    // Every finished word turns the line a little the attacker's way (they circle each other) and
    // shifts the centre toward the side being pushed; the gap closes with the live wpm stance and
    // opens when nobody types; each bot rises and dips from word to word; every key steps it along
    // its own sway. A move's reach or a hit's knockback carries a bot along the line (MOVES and
    // HURTS in bot-fighter.js). Nothing here runs on a clock of its own: it all follows the typing.
    // The game shot always looks across the line, so the left bot stays on the left.
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const GAP0 = POS[1].x - POS[0].x;
    const STG = { cx: 0, cz: POS[0].z, cxT: 0, th: 0, thT: 0, sep: GAP0, close: [0, 0], alt: [0, 0], altT: [0, 0], ph: [0, 0], amp: [0, 0], words: [0, 0], xClose: 0, xCloseT: 0, a: new V(1, 0, 0), n: new V(0, 0, 1), yaw: [Math.PI / 2, -Math.PI / 2], turn: [TURN, TURN], lift: [0, 0] };
    const CLOSE = [0, 0.6, 1.2, 1.7], AMP = [0.3, 0.55, 0.85, 1.1], ALT = [0, 0.8, 0.3, 1.2, 0.55, 0.1, 0.95];
    const _ga = new V();
    const angTo = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
    // a finished word (or a Showdown spark): the attacker circles its way, presses in, rises or dips
    function stageWord(i, k = 1) {
      if (!BOTS) return;
      const d = i ? -1 : 1;
      STG.words[i]++;
      STG.altT[i] = ALT[STG.words[i] % ALT.length];
      STG.thT = clamp(STG.thT * 0.92 + d * 0.075 * k, -0.5, 0.5);
      STG.cxT = clamp(STG.cxT * 0.9 + d * 0.22 * k, -2.6, 2.6);
    }
    function stage(dt) {
      if (!BOTS) return;
      const k = Math.min(1, dt * 1.6);
      F.forEach((f, i) => {
        const s = f.ko ? 0 : f.bf.stance, idle = t - f.typeAt > 2.2;
        if (idle) STG.altT[i] *= Math.max(0, 1 - dt * 0.8);
        STG.close[i] += (CLOSE[s] - STG.close[i]) * k;
        STG.amp[i] += (AMP[s] * (idle ? 0.4 : 1) - STG.amp[i]) * k;
        STG.alt[i] += (STG.altT[i] + STG.lift[i] - STG.alt[i]) * Math.min(1, dt * 2.4);
      });
      STG.xClose += (STG.xCloseT - STG.xClose) * Math.min(1, dt * 3);
      STG.sep += (clamp(GAP0 - STG.close[0] - STG.close[1] - STG.xClose, 5.4, GAP0 + 0.6) - STG.sep) * Math.min(1, dt * 1.4);
      STG.th += (STG.thT - STG.th) * Math.min(1, dt * 0.9);
      STG.cx += (STG.cxT - STG.cx) * Math.min(1, dt * 0.8);
      const a = STG.a.set(Math.cos(STG.th), 0, Math.sin(STG.th)), n = STG.n.set(-Math.sin(STG.th), 0, Math.cos(STG.th));
      const half = STG.sep / 2, lim = 9.8 - half;
      STG.cx = clamp(STG.cx, -lim, lim);
      const span = Math.max(0, STG.sep - 3.5);   // how far a move carries a bot before it meets the other
      let passing = false;
      F.forEach((f, i) => {
        const m = f.bf.motion(), d = i ? -1 : 1;
        if (m.lane) passing = true;
        const along = -d * half + d * (m.reach * span - m.push);
        const lane = Math.sin(STG.ph[i] + i * 2.1) * STG.amp[i] - m.lane;
        f.bf.group.position.set(STG.cx, (arena ? arena.PAD_TOP : 0.22) + STG.alt[i], STG.cz).addScaledVector(a, along).addScaledVector(n, lane);
      });
      const g0 = F[0].bf.group.position, g1 = F[1].bf.group.position;
      _ga.subVectors(g1, g0); _ga.y = 0;
      const dd = _ga.length();
      if (dd < 2.7 && !passing && dd > 1e-3) { _ga.multiplyScalar((2.7 - dd) / 2 / dd); g0.sub(_ga); g1.add(_ga); }
      // inside the stage's rim
      for (const g of [g0, g1]) { const r = Math.hypot(g.x, g.z); if (r > 10.6) { g.x *= 10.6 / r; g.z *= 10.6 / r; } }
      // each turns to face the other; a bot driving in squares up to it, the rest stay turned a little to the camera
      F.forEach((f, i) => {
        const o = F[1 - i].bf.group.position, p = f.bf.group.position, m = f.bf.motion();
        STG.yaw[i] = angTo(STG.yaw[i], Math.atan2(o.x - p.x, o.z - p.z), Math.min(1, dt * (m.lane ? 14 : 8)));
        f.bf.group.rotation.y = STG.yaw[i];
        const sq = m.move && m.move !== 'volley' && m.move !== 'sidestep' && m.move !== 'hop' && m.reach > 0.25;
        STG.turn[i] += ((sq ? 0.12 : TURN) - STG.turn[i]) * Math.min(1, dt * 10);
        f.bf.group.children[0].rotation.y = -f.dir * STG.turn[i];
      });
    }

    // where a fighter's chest, head and hands are this frame
    const _cb = new V();
    function chest(i, out) {
      const f = F[i];
      if (f.bf) return f.bf.bot.body.getWorldPosition(out);
      if (f.op) { const B = f.op.bones; if (B && B.Spine2) return B.Spine2.getWorldPosition(out); return f.rig.getWorldPosition(out).setY(2.8); }
      return f.card.getWorldPosition(out);
    }
    function headOf(i, out) { const f = F[i]; if (f.bf) return chest(i, out).add(_cb.set(0, 1.15 * BS, 0)); if (f.op && f.op.bones && f.op.bones.Head) return f.op.bones.Head.getWorldPosition(out); return chest(i, out).setY(f.base.y + CARD_H / 2 + 0.2); }
    function handOf(i, out) { const f = F[i]; if (f.bf) return f.bf.muzzle(out); if (f.op && f.op.bones && f.op.bones.RightHand) return f.op.bones.RightHand.getWorldPosition(out); return chest(i, out).add(_cb.set(i ? -1.8 : 1.8, 0.1, 0.5)); }
    function feetOf(i, out) { const f = F[i]; if (f.bf) return chest(i, out).setY(0); if (f.rig) return out.copy(f.rig.position).add(_cb.set(f.dir * f.root.x * OS, 0, 0)); return out.copy(POS[i]); }

    // ---------- combat effects ----------

    let shake = 0, stopUntil = 0, flashGate = [];
    const canFlash = () => { const t = performance.now(); flashGate = flashGate.filter(x => t - x < 1000); if (flashGate.length >= (reduce ? 2 : 3)) return false; flashGate.push(t); return true; };
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm: reduce, reduce, pixelHeight: () => renderer.domElement.height,
      juice: { shake: k => { shake = Math.max(shake, k * 0.6); }, stop: ms => { stopUntil = Math.max(stopUntil, clockMs() + ms); }, glitch: () => {}, dim: () => {}, tint: () => {}, canFlash },
    }) : null;
    const tmp = new V(), tmp2 = new V();
    const centre = (i, out) => chest(i, out);
    const adapters = F.map((f, i) => ({
      size: f.op ? 1.9 : f.bf ? 1.5 : 1.6,
      pos: out => centre(i, out),
      top: out => (f.op || f.bf ? headOf(i, out).add(tmp2.set(0, 0.7, 0)) : centre(i, out).setY(f.base.y + CARD_H / 2 + 0.4)),
      base: out => feetOf(i, out).setY(0.36),
      react: (kind, power) => spellHit(i, kind, power),
    }));
    // shots and spells leave from the thrower's hand (the card's edge without operators)
    const casterOf = i => ({ pos: out => (F[i].bf ? handOf(i, out) : F[i].op ? handOf(i, out).add(tmp2.set(F[i].dir * 0.3, 0.1, 0.2)) : centre(i, out).add(tmp2.set(i ? -1.8 : 1.8, 0.1, 0.5))) });
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
    function flare(at, col, size = 2, life = 0.2) { const f = flares[flI = (flI + 1) % flares.length]; f.s.position.copy(at); f.s.material.color.copy(col).lerp(WHITE, 0.3).multiplyScalar(1.1); f.t = 0; f.life = life; f.size = size; f.s.visible = true; f.s.material.rotation = rnd(0, 0.6); }
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
      // a bright core and a coloured glow round it, kept below white so the beam never fills the frame
      B.core.material.color.copy(col).lerp(WHITE, 0.4).multiplyScalar(1.35);
      B.glow.material.color.copy(col).multiplyScalar(0.55);
      return B;
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
        strip(B.glow, _ba, _bb, B.w * 1.05 * fl * k, 0.4 * k);
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
    // ---------- choreography (28 Nov 2026) ----------
    // Gid: "different attack animations so it doesn't feel too boring... depending on the results it can
    // be scenes like an attack and dodge and counter, or like reflecting the hit back... It may deal the
    // same damage but it gives variety." What happened is decided first (by the rules, from the typing);
    // the moves below only choose how to show it, and never the same way twice in a row.
    // Timings run on scene time (slowed by hit stop and slow motion), not on timers.
    const due = [];
    function after(sec, fn) { due.push({ at: t + Math.max(0, sec), fn }); }
    function runDue() {
      for (let k = 0; k < due.length; k++) if (due[k].at <= t) { const d = due.splice(k--, 1)[0]; try { d.fn(); } catch (e) { console.error('duel choreography', e); } }
    }
    // the new moves' sounds (js/app/duel-sfx.js), panned to the side they happen on
    const dsfx = window.DuelSfx && opts.audio ? DuelSfx.create(opts.audio, { on: () => !warming && alive }) : null;
    const xs = (name, k = 1, side = -1) => { if (dsfx) dsfx.play(name, k, side < 0 ? 0 : side ? 0.35 : -0.35); };
    // pick from a pool, turning through it by a count of the side's own moves and never repeating the last
    const lastPick = {}, nPick = {};
    function pick(key, pool) {
      const n = nPick[key] = (nPick[key] || 0) + 1;
      let k = (n * 3 + key.length) % pool.length;
      if (pool[k] === lastPick[key] && pool.length > 1) k = (k + 1) % pool.length;
      return (lastPick[key] = pool[k]);
    }

    // a slash: a bright crescent swept through the hit, core and glow, gone in a third of a second
    const ARCN = 10;
    const arcFx = Array.from({ length: 4 }, () => ({ core: Array.from({ length: ARCN }, () => beamMesh()), glow: Array.from({ length: ARCN }, () => beamMesh()), on: false, t: 0, c: new V(), u: new V(), v: new V(), r: 1, a0: 0, a1: 0, w: 0.2, col: new THREE.Color() }));
    let arcI = 0;
    // at: centre of the cut, dir: the way the cut faces (from the attacker), roll: the cut's tilt
    function slashArc(at, dirV, roll, r, col, w = 0.24, sweep = 2.6) {
      const A = arcFx[arcI = (arcI + 1) % arcFx.length];
      A.c.copy(at); A.r = r; A.w = w; A.t = 0; A.on = true; A.col.copy(col);
      // the cut's plane: across the attacker's line of attack, tilted by roll
      _bx.copy(dirV).setY(0).normalize(); _by.set(0, 1, 0);
      A.u.crossVectors(_by, _bx).normalize();   // sideways
      A.v.copy(_by).multiplyScalar(Math.cos(roll)).addScaledVector(A.u, Math.sin(roll));
      A.u.multiplyScalar(Math.cos(roll)).addScaledVector(_by, -Math.sin(roll));
      A.c.addScaledVector(_bx, -r * 0.35);
      A.a0 = Math.PI * 0.5 + sweep / 2; A.a1 = Math.PI * 0.5 - sweep / 2;
      A.core.forEach(m => m.material.color.copy(col).lerp(WHITE, 0.55).multiplyScalar(1.5));
      A.glow.forEach(m => m.material.color.copy(col).multiplyScalar(0.7));
    }
    const _p1 = new V(), _p2 = new V();
    function drawArcs(dt) {
      for (const A of arcFx) {
        if (!A.on) continue;
        A.t += dt;
        const head = ease(Math.min(1, A.t / 0.08)), tail = Math.min(1, Math.max(0, (A.t - 0.04) / 0.26)), k = 1 - Math.max(0, (A.t - 0.1) / 0.22);
        if (k <= 0) { A.on = false; A.core.forEach(m => { m.visible = false; }); A.glow.forEach(m => { m.visible = false; }); continue; }
        for (let j = 0; j < ARCN; j++) {
          const f0 = tail + (head - tail) * j / ARCN, f1 = tail + (head - tail) * (j + 1) / ARCN;
          const g0 = A.a0 + (A.a1 - A.a0) * f0, g1 = A.a0 + (A.a1 - A.a0) * f1;
          _p1.copy(A.c).addScaledVector(A.u, Math.cos(g0) * A.r).addScaledVector(A.v, Math.sin(g0) * A.r);
          _p2.copy(A.c).addScaledVector(A.u, Math.cos(g1) * A.r).addScaledVector(A.v, Math.sin(g1) * A.r);
          const taper = Math.sin(Math.PI * (j + 0.5) / ARCN);   // thick in the middle, sharp at both ends
          strip(A.core[j], _p1, _p2, A.w * 0.38 * taper, Math.min(1, k * 1.4));
          strip(A.glow[j], _p1, _p2, A.w * 1.2 * taper, 0.45 * k);
        }
      }
    }

    // a hit landing: what it looks like depends on what happened (how):
    //   how.graze  a low-accuracy hit that clips the edge: sparks to the side, a twist, no ring
    //   how.heavy  a 100% round or a crit: hit stop, a white flash, two shockwaves, the bot thrown
    //   how.frag   the leftovers of two shots that met in the middle: a smaller hit
    //   how.hurt   the reaction, else one picked by power (never the same twice in a row)
    function impact(to, tier, crit, col, onLand, how = {}) {
      const f = F[to], p = tier + (crit ? 1.6 : 0) - (how.frag ? 1 : 0) - (how.graze ? 1.2 : 0);
      const at = centre(to, new V()).add(tmp.set(0, 0.2, 0.3));
      const away = to ? 1 : -1;
      if (how.graze) {
        react(to, 'hit', 0.25, 0);
        if (f.bf) f.bf.hurt('graze', { side: how.side || (to ? -1 : 1) });
        const off = tmp2.copy(STG.n).multiplyScalar(-(how.side || 1) * 0.9);
        burst(at.clone().add(off), 9, 6, col, { shard: true, size: 0.24, life: 0.45, dir: away * 0.5, up: 0.3, grav: 7, k: 1.2 });
        flare(at.clone().add(off), col, 0.7, 0.07);
        flashLight(at, col, 1.5);
        xs('graze', 0.8, to); snd('jab');
        if (!reduce) { stopUntil = Math.max(stopUntil, clockMs() + 25); shake = Math.max(shake, 0.1); }
        if (onLand) onLand();
        return;
      }
      react(to, 'hit', 0.35 + Math.max(0, p) * 0.18, Math.max(0, p));
      f.recoil = Math.min(1.4, 0.5 + p * 0.22);
      if (f.bf) {
        const H = how.hurt || (how.heavy ? pick('hh' + to, ['launch', 'knock', 'spinout']) : p >= 2.2 ? pick('hb' + to, ['knock', 'spinout', 'launch', 'knock']) : p >= 1 ? pick('hm' + to, ['knock', 'jolt', 'spinout']) : pick('hl' + to, ['jolt', 'stiff']));
        f.bf.hurt(H, { k: Math.min(1.6, 0.55 + Math.max(0, p) * 0.18) * (how.heavy ? 1.25 : 1), side: (f.hurtSide = -(f.hurtSide || 1)) });
        if (H === 'launch') xs('launch', 0.9, to); else if (H !== 'jolt' && H !== 'stiff') xs('thump', 0.7, to);
      }
      const board = F[1 - to].kb && F[1 - to].kb !== 'slab';
      burst(at, 8 + p * 5, 6 + p * 1.5, col, { shard: true, size: 0.32, life: 0.7, dir: away * 0.8, up: 0.4, grav: 9, k: board ? 1.1 : 1.4 });
      // a short, small white flash for feel; a bought keyboard's own landing carries the rest (polish 28 Nov)
      burst(at, board ? 2 : 3 + p, 2.5 + p * 0.6, WHITE, { size: board ? 0.16 : 0.2, life: 0.1, grav: 0, k: 0.5 });
      if (p >= 2) smoke(at, 3 + p, 1.4, { size: 1.3, life: 0.9, op: 0.35 });
      ringAt(to, col, 2.6 + p * 0.6, 0.45 + p * 0.05);
      flare(at, col, (board ? 0.6 : 0.9) + p * 0.2, 0.08 + p * 0.015);
      flashLight(at, col, 2 + p * 2.5);
      if (!reduce) {
        stopUntil = Math.max(stopUntil, clockMs() + (crit ? 110 : 20 + tier * 18));
        shake = Math.max(shake, 0.12 + p * 0.07);
        punch = Math.max(punch, crit ? 1 : Math.min(0.8, tier * 0.22));
      }
      if (how.heavy) {
        // the heavy crit: everything stops for a beat, the bot is thrown, a second shockwave follows the first
        burst(at, 10, 9, WHITE, { size: 0.5, life: 0.18, grav: 0, k: 0.9 });
        burst(at, 22, 11, col, { shard: true, size: 0.4, life: 0.9, dir: away * 1.2, up: 0.6, grav: 10, k: 1.5 });
        smoke(at, 8, 2.2, { size: 1.8, life: 1.2, op: 0.4 });
        flare(at, WHITE, 3.2, 0.16);
        after(0.09, () => { ringAt(to, WHITE, 6.5, 0.6); flare(centre(to, new V()), col, 2.4, 0.14); });
        xs('crit', 1, to);
        if (!reduce) { stopUntil = Math.max(stopUntil, clockMs() + 170); shake = Math.max(shake, 0.55); punch = 1; }
      }
      snd(p >= 3 ? 'heavy' : 'jab'); if (tier >= 1) csnd('shot' + Math.min(4, tier));
      if (p >= 3 || how.heavy) { snd('ooh'); if (opts.audio) opts.audio.swell(0.6); if (arena) arena.hype(1 - to, 0.8); }
      if (onLand) onLand();
    }
    // a dodged shot flies on through where the bot was and bursts on the far side
    function whiff(to, col, onLand) {
      const at = centre(to, new V()).addScaledVector(STG.a, -F[to].dir * 1.6).add(tmp.set(0, -0.6, 0)).addScaledVector(STG.n, -0.6);
      burst(at, 8, 4, col, { size: 0.22, life: 0.35, grav: 2 });
      flare(at, col, 0.9, 0.1);
      snd('whoosh', 0.5);
      if (onLand) onLand();
    }
    // a shot batted back: the blocker swats it with its shield, it flies home and dies on the
    // thrower's own shield in a crackle (Clash: the target's safe mode blocked it; Showdown: a dodge)
    function deflectAt(to, col, onLand, o = {}) {
      const f = F[to], from = 1 - to;
      const at = centre(to, new V()).addScaledVector(STG.a, -f.dir * 1.1);
      if (f.bf && f.bf.motion().move !== 'parry') f.bf.move('parry', { side: to ? -1 : 1, len: 0.45 });
      react(to, 'block', 0.4, 0, !o.ward);   // the big safe-mode dome only when safe mode really took it
      if (o.how && o.how.beams) for (const B of o.how.beams) if (B.on) { B.hold = 0; B.t = Math.max(B.t, B.grow); }
      burst(at, 14, 7, C('#7dffc4'), { size: 0.24, life: 0.4, grav: 3, dir: -f.dir });
      flare(at, C('#bfffe6'), 1.6, 0.12);
      xs('clang', 1, to); xs('ricochet', 0.8, to);
      if (!reduce) stopUntil = Math.max(stopUntil, clockMs() + 60);
      // the shot goes home, smaller and redder, and fizzles on the thrower's shield
      const back = col.clone().lerp(RED, 0.35);
      shot(to, 1, null, { orb: true, noMove: true, plain: true, ms: o.ms || 320, color: '#' + back.getHexString(), size: 1.0, start: at, land: () => fizzleOn(from, back) });
      if (onLand) onLand();
    }
    function fizzleOn(i, col) {
      const f = F[i];
      if (f.bf && !f.ko) f.bf.block();
      const at = centre(i, new V()).addScaledVector(STG.a, f.dir * 1.1);
      burst(at, 12, 3.5, col, { size: 0.18, life: 0.5, grav: 4 });
      burst(at, 8, 2.5, C('#9aa3a6'), { shard: true, size: 0.16, life: 0.6, grav: 6, k: 0.8 });
      smoke(at, 4, 0.8, { size: 0.9, life: 0.8, op: 0.35 });
      flare(at, C('#7dffc4'), 1.1, 0.1);
      xs('fizzleShield', 0.9, i);
    }
    // two shots meeting in the middle: a burst where they meet, and what's left flies on to both
    function clashBurst(at, colA, colB) {
      burst(at, 20, 9, colA, { shard: true, size: 0.34, life: 0.7, grav: 6, k: 1.5 });
      burst(at, 20, 9, colB, { shard: true, size: 0.34, life: 0.7, grav: 6, k: 1.5 });
      burst(at, 8, 6, WHITE, { size: 0.5, life: 0.16, grav: 0, k: 0.9 });
      smoke(at, 6, 1.8, { size: 1.6, life: 1.0, op: 0.35 });
      flare(at, WHITE, 3.0, 0.16);
      flashLight(at, WHITE, 6);
      const R = rings[rI = (rI + 1) % rings.length];
      R.m.position.set(at.x, arena ? 0.36 : 0.05, at.z); R.m.material.color.copy(colA).lerp(colB, 0.5).multiplyScalar(2); R.r = 5; R.life = 0.55; R.t = 0; R.m.visible = true;
      xs('clash', 1);
      if (!reduce) { stopUntil = Math.max(stopUntil, clockMs() + 90); shake = Math.max(shake, 0.4); punch = Math.max(punch, 0.7); }
      if (arena) arena.hype(-1, 0.6);
    }
    const TIER_COL = [null, null, '#3ee6ff', '#f2c230', '#ff5ce1'];
    const tails = Array.from({ length: 8 }, () => ({ core: beamMesh(), glow: beamMesh() }));
    let tI = 0;
    const lastTier = [0, 0];   // the tier of the last shot thrown at each side
    const flying = [[], []];   // shots in flight at each side: { at (scene time it lands), launched, how, from }

    // Clash: a finished word is a strike. The move it's thrown with is picked from a pool for its combo
    // tier, never the same twice in a row, and every one is 0.3 s so the bot keeps up with 150 wpm.
    const CPOOL = { lo: ['sig', 'jab', 'sidestep', 'hop'], mid: ['sig', 'slash', 'spin', 'uppercut', 'sidestep'], hi: ['sig', 'dive', 'slam', 'spin', 'slash', 'uppercut'] };
    const MOVE_SND = { slash: 'slash', uppercut: 'uppercut', spin: 'spin', slam: 'slam', dive: 'dive' };
    function clashMove(i, tier, crit, force) {
      const f = F[i], T = Math.min(3, tier + (crit ? 1 : 0));
      const m = force || pick('c' + i, T >= 3 ? CPOOL.hi : T >= 2 ? CPOOL.mid : CPOOL.lo);
      if (m === 'sig') return f.bf.attack(T) / 1000;
      const ms = f.bf.move(m, { len: 0.3, side: (f.mvSide = -(f.mvSide || 1)), reach: T >= 2 ? 0.3 : 0.12, strike: true, power: T / 3 });
      if (MOVE_SND[m]) xs(MOVE_SND[m], 0.45, i);
      return Math.min(0.09, ms / 1000);
    }

    function shot(from, tier, onLand, o = {}) {
      const to = 1 - from, f = F[from];
      tier = Math.max(0, Math.min(4, tier | 0));
      if (f.op) { f.typeAt = t; if (tier === 1 && !o.crit) f.mv.play('attack'); else f.mv.act(o.crit && tier < 4 ? (tier >= 2 ? 'smash' : 'jab') : MOVE[tier]); }
      // a bot strikes at once (the wind-up happened while the word was typed) with a move picked for its tier
      const T = Math.max(0.16, Math.min(0.9, (o.ms || 260) / 1000));
      let rel = 0;
      const how = { ...(o.how || {}) };
      if (f.bf && !o.noMove && !f.ko) {
        f.typeAt = t;
        rel = clashMove(from, tier, o.crit, o.move);   // o.move: tests pick the move
        if (!warming) {
          // their shot just left too: the two meet in the middle and burst
          const meet = flying[from].find(x => x.at > t && t - x.launched < 0.16 && !x.how.clash);
          if (meet) {
            meet.how.clash = how.clash = true; meet.how.frag = how.frag = true;
            const when = Math.max(0.1, (Math.min(meet.at, t + rel + T) - t) * 0.5);
            const ca = new THREE.Color(o.color || '#ffffff'), cb = (meet.col || WHITE).clone();
            after(when, () => { const m = new V().addVectors(fc[0], fc[1]).multiplyScalar(0.5); clashBurst(m, ca, cb); });
            if (!warming) want('xclash', { pri: 2 });
          } else if (flying[from].some(x => x.at > t + 0.09) && t - f.dodgeAt > 0.9) {
            // their shot is on its way and this word landed first: dodge it (it only grazes) and counter
            f.dodgeAt = t;
            const dv = pick('d' + from, ['roll', 'duck', 'leap']);
            if (dv === 'roll') f.bf.dodge((f.mvSide = -(f.mvSide || 1))); else f.bf.move(dv, { len: 0.4 });
            for (const x of flying[from]) if (x.at > t) { x.how.graze = true; x.how.side = f.mvSide || 1; }
            csnd('op-dodge'); xs('dodge', 0.7, from); xs('counter', 0.5, from);
          }
        }
        csnd('op-attack');
        stageWord(from);
      }
      lastTier[to] = tier + (o.crit ? 1 : 0);
      const word = o.orb ? '*' : String(o.word || '').replace(/\s+/g, '').slice(0, 16) || '>>>';
      inbound[to] = inbound[to].filter(x => x > t); inbound[to].push(t + rel + T);
      const base = new THREE.Color(o.color || (from ? '#f29d30' : Theme.hex('accent')));
      const col = TIER_COL[tier] && !o.orb ? new THREE.Color(TIER_COL[tier]) : base.clone().lerp(WHITE, tier ? 0.25 : 0);
      if (!o.plain) { flying[to] = flying[to].filter(x => x.at > t); flying[to].push({ at: t + rel + T, launched: t, how, from, col }); }
      if (o.graze) how.graze = true;
      if (o.heavy) how.heavy = true;
      // the attacker winds up and lunges; the letters leave on the lunge
      f.lt = 0; f.lp = 0.6 + tier * 0.12 + (o.crit ? 0.25 : 0);
      const start = o.start ? o.start.clone() : casterOf(from).pos(new V());
      const size = (0.82 + tier * 0.1) * (o.crit ? 1.25 : 1) * (o.size || 1);
      // the whole word follows one arc, one letter behind the other, and reads left to right
      // either way it flies: going right the last letter leads, going left the first one does
      const end = o.to ? o.to.clone() : centre(to, new V()).add(tmp.set(rnd(-0.2, 0.2), rnd(-0.1, 0.5), 0.3));
      const ctrl = new V().lerpVectors(start, end, 0.5).add(tmp.set(0, (tier >= 3 ? 0.5 : 1) * rnd(1.4, 2.2) * (o.arc || 1), 0)).addScaledVector(STG.n, rnd(0, 1.2));
      const n = word.length, step = Math.min(0.013, (T - 0.12) / Math.max(1, n));
      // the shooter's keyboard (js/app/combat/fx3d.js, keyboard signatures): Compact splits the word
      // into three lanes, Split sends it from both halves, Arc rides a lightning bolt, Grid packs it
      // into a block; the newer boards' shots fly just under the word
      const kb = o.plain ? 'slab' : f.kb || 'slab', kst = window.KbShots ? KbShots.resolve(kb).style : kb;
      const side = new V(0, 0, 1).cross(tmp2.subVectors(end, start)).normalize();
      const landFn = o.land ? () => { o.land(); if (onLand) onLand(); } : o.dodge ? () => whiff(to, col, onLand) : () => impact(to, tier, o.crit, col, onLand, how);
      for (let k = 0; k < n; k++) {
        const g = glyphs[gI = (gI + 1) % GN];
        if (g.on && g.cb) { const cb = g.cb; g.cb = null; cb(); }   // pool wrapped: land the oldest now
        const order = from === 0 ? n - 1 - k : k;                   // 0 leads
        g.delay = 0.04 + rel + order * step;
        g.to = F[to].bf && !o.dodge && !o.to && !o.land ? to : -1;   // bots move, so the shot follows the one it was thrown at
        g.dur = Math.max(0.08, T - (n - 1) * step - 0.04);
        g.a.copy(start);
        g.b.copy(end).add(tmp.set(rnd(-0.12, 0.12), rnd(-0.12, 0.12), 0));
        g.c.copy(ctrl);
        g.how = how;
        if (kb === 'compact') g.c.addScaledVector(side, ((k % 3) - 1) * 0.9).y += ((k % 3) - 1) * 0.5;
        else if (kb === 'split') { const s2 = k % 2 ? 1 : -1; g.a.addScaledVector(side, s2 * 0.45); g.c.addScaledVector(side, s2 * 1.6); }
        else if (kst === 'grid') { g.c.addScaledVector(side, ((k % 3) - 1) * 0.45); g.b.y += ((k % 3) - 1) * 0.25; }
        const map = o.orb ? glowTex : glyph(word[k]);
        g.s.material.map = map; g.s.material.color.copy(col).multiplyScalar(o.orb ? 2.4 : 1.7);
        // the trails are soft dots; a long word stacks them, so each stays faint or they pile up to white
        g.tr.forEach(x => { x.material.color.copy(col).multiplyScalar(n > 8 ? 0.45 : 0.7); });
        g.size = o.orb ? size * (1.1 + tier * 0.25) : size; g.spin = 0; g.t = 0; g.on = true; g.flick = !!o.flick;
        if (g.tail) { g.tail.core.visible = g.tail.glow.visible = false; g.tail = null; }
        if (o.orb && k === 0) { const T2 = tails[tI = (tI + 1) % tails.length]; for (const x of glyphs) if (x.tail === T2) x.tail = null; g.tail = T2; T2.core.material.color.copy(col).lerp(WHITE, 0.5).multiplyScalar(1.4); T2.glow.material.color.copy(col).multiplyScalar(0.8); }
        g.cb = order === n - 1 ? () => { if (how.deflect) deflectAt(to, col, onLand, { how, ward: how.ward }); else landFn(); } : () => { if (!how.deflect && !o.land) tick(to, col); };
      }
      if (o.dodge && F[to].bf) {
        // the target gets out of the way just before it arrives: a barrel roll, a duck under it or a hop over it
        const dv = o.dodgeMove || pick('d' + to, ['roll', 'duck', 'leap']);
        after(Math.max(0, rel + T - 0.3), () => { if (alive && !F[to].ko) { if (dv === 'roll') F[to].bf.dodge((F[to].mvSide = -(F[to].mvSide || 1))); else F[to].bf.move(dv, { len: 0.45 }); csnd('op-dodge'); xs('dodge', 0.7, to); } });
      }
      burst(start, 4 + tier * 2, 3, col, { size: 0.3, life: 0.3, grav: 0 });
      if (tier >= 2) flashLight(start, col, 1 + tier);
      if (!o.plain) snd('whoosh', Math.min(1, 0.2 + tier * 0.2 + (o.crit ? 0.3 : 0)));
      if (!o.plain && (tier >= 3 || o.crit)) snd('step');
      // the board's shot leaves with the letters (after the bot's wind-up)
      if (kb !== 'slab' && fx) {
        const old = ['compact', 'split', 'arc'].includes(kst);   // the first three boards keep their size; the newer ones fly under the word
        const at = end.clone(), from3 = start.clone(), hx = '#' + col.getHexString(), go = () => { if (alive) fx.shot(1, from3, out => out.copy(at), null, { color: hx, kb, w: old ? 0.6 : 0.9, lane: old ? 0 : -1.1, dur: Math.max(0.15, T - 0.04), flash: 0.35 }); };
        if (rel > 0.02 && !warming) after(rel, go); else go();
      }
      // the board's own switch and shot sound (js/app/kb-shots.js); the other side's a little quieter
      if (kb !== 'slab' && !warming && window.KbShots) after(rel, () => { if (alive) KbShots.play(kb, { ctx: opts.audio && opts.audio.ctx, vol: opts.me < 0 || from === opts.me ? 0.9 : 0.55, pan: from ? 0.35 : -0.35, big: tier >= 3 || !!o.crit, gap: 25 }); });
      if (tier >= 2 && !o.plain) {
        const grow = T - (n - 1) * step - 0.04, hold = (n - 1) * step + (tier >= 4 ? 0.55 : 0.4);
        const w = (tier === 2 ? 0.14 : tier === 3 ? 0.28 : 0.42) * (o.crit ? 1.3 : 1);
        how.beams = [];
        if (tier === 2) for (const dy of [-0.24, 0.24]) how.beams.push(beam(start, end, col, w, grow, hold, tmp2.set(0, dy, 0), false));
        else how.beams.push(beam(start, end, col, w, grow, hold, tmp2.set(0, 0, 0), tier >= 4));
      }
      // the big ones get the FF16 cut: over the thrower's shoulder in slow motion, then the wide as it lands
      if ((tier >= 4 || (o.crit && tier >= 3)) && !warming && !o.noCut) want('strike', { x: from, pri: 2 });
      return rel + T;
    }
    // Clash: a word blocked by safe mode is batted back (duel.js calls this on the rules' block)
    function deflect(side) {
      const x = flying[side].filter(y => y.at > t - 0.05).sort((a, b) => a.at - b.at)[0];
      if (x) { x.how.deflect = true; x.how.ward = true; return true; }
      return false;
    }
    // Clash: packet storm sends a hit back: a bolt from the one reflecting to the one who threw it
    function ricochet(side, to) {
      const col = C('#3ee6ff');
      xs('ricochet', 0.9, side);
      shot(side, 1, null, { orb: true, noMove: true, plain: true, ms: 200, color: '#3ee6ff', size: 0.8, land: () => impact(to, 1, false, col, null, { hurt: 'jolt' }) });
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
    // A spell (Gid, 28 Nov 2026: "proper effects and animation when landing a hit on the enemy, not just
    // a close-up of the caster"): the caster rises and casts, the spell (Combat.FX) flies and lands,
    // the target reacts the spell's own way (adapters above: knocked back, frozen stiff, pulled in,
    // stunned and slumped, thrown up), and the camera goes with it from the caster to the target.
    // o.blocked: the target's safe mode stops it, so it flies, is batted back and dies on the caster's shield.
    function cast(from, id, hits, effect, o = {}) {
      const f = F[from], sp = window.Combat && Combat.spell ? Combat.spell(id) : null;
      const col = new THREE.Color(sp && sp.color ? sp.color : '#9ff5ff');
      if (f.op) f.mv.act('cast');
      if (f.bf && !f.ko) { f.bf.move('cast', { strike: true, power: 1, len: 0.95 }); xs('rise', 0.8, from); }
      const R = runes[from]; R.t = 0; R.col.copy(col); R.m.visible = true;
      snd('charge', 0.55); csnd(id);
      const now = performance.now();
      const self = id === 'binary-rain' || !hits.length;
      // hits on you from the other side are the threat the camera must not cut away from
      if (!self && 1 - from === opts.me) for (const h of hits) threats.push(h.at / 1000);
      // the target raises its guard behind the hex plate just before the first hit arrives
      const tgt = F[1 - from];
      if (!self && tgt.op && hits.length && !warming) setTimeout(() => { if (alive && !tgt.ko && !tgt.mv.down()) tgt.mv.play('cover'); }, Math.max(0, hits[0].at - now - 650));
      if (BOTS) { stageWord(from, 0.6); STG.lift[from] = 0.6; after(1.6, () => { STG.lift[from] = 0; }); }
      if (!warming) {
        if (self) want('spell', { x: from, pri: 2 });
        else {
          // the shot follows the spell: on the caster while it rises (when there's time), along its way, then on the target
          const first = Math.max(0.2, (hits[0].at - now) / 1000), last = Math.max(first, (hits[hits.length - 1].at - now) / 1000);
          const P3 = shots.spell.parts, big = hits.length === 1 || last - first > 1.2;
          P3[0].len = first >= 0.9 ? 0.5 : 0.01;
          P3[1].len = Math.max(0.3, first - 0.25 - P3[0].len - 0.08);
          P3[2].len = clamp(last - first + 1.0, 1.1, 2.6); P3[2].slow = big && hits.length === 1 ? 0.55 : 0;
          want('spell', { x: from, pri: 2 });
        }
      }
      setTimeout(() => { if (alive) { snd('release'); flashLight(casterOf(from).pos(new V()), col, 4); } }, reduce ? 0 : 520);
      if (o.blocked && !self) {
        // stopped by safe mode: the spell flies as a bolt and is batted back off the shield
        after(0.55, () => shot(from, 2, null, { orb: true, noMove: true, plain: true, noCut: true, ms: 560, color: '#' + col.getHexString(), size: 1.5, arc: 0.6, how: { deflect: true, ward: true } }));
        return;
      }
      if (!fx) { if (!self) for (const h of hits) after(Math.max(0, h.at - now) / 1000, () => spellHit(1 - from, 'flinch', h.dmg)); return; }
      // a self spell (Binary rain's heal) centres on the caster, not in front of them
      const caster = self ? { pos: out => centre(from, out) } : casterOf(from);
      fx.cast(id, { caster, target: adapters[1 - from], hits: hits.map(h => ({ at: Math.max(0, h.at - now), amount: h.dmg })), effect: effect || {} });
    }
    // what a spell's hit does to the bot it lands on (Combat.FX calls the target adapter's react)
    function spellHit(i, kind, power) {
      const f = F[i];
      if (!f.bf || f.ko) { react(i, kind === 'stun' ? 'stun' : kind === 'freeze' ? 'freeze' : 'hit', power); return; }
      const side = (f.hurtSide = -(f.hurtSide || 1));
      if (kind === 'stun') { react(i, 'stun', power); f.bf.hurt('crumple', { side }); xs('thump', 0.8, i); }
      else if (kind === 'freeze') { react(i, 'freeze', power); f.bf.hurt('stiff', { side }); }
      else if (kind === 'pull') { f.bf.hurt('pulled', { k: 0.8 }); if (!f.pullAt || t - f.pullAt > 0.6) { xs('pull', 0.7, i); f.pullAt = t; } }
      else if (kind === 'break') { react(i, 'hit', 1.2, 4); f.bf.hurt('launch', { k: 1.2, side }); xs('launch', 1, i); }
      else if (kind === 'stagger') { react(i, 'hit', 0.9, 2); f.bf.hurt(pick('sh' + i, ['knock', 'spinout']), { k: 1, side }); xs('thump', 0.8, i); }
      else { react(i, 'hit', 0.35); f.bf.hurt('jolt', { k: 0.7, side }); }
    }
    // a spell word with a typo (the rules' fizzle): it still leaves, broken and sputtering, and the target
    // gets out of its way: a dodge when the target was moving (typing), a block when it stood still
    function fizzle(from, id) {
      const f = F[from], to = 1 - from, sp = window.Combat && Combat.spell ? Combat.spell(id) : null;
      if (!f.bf || f.ko || F[to].ko) return;
      const col = new THREE.Color(sp && sp.color ? sp.color : '#9ff5ff').lerp(C('#8a8f92'), 0.45);
      f.bf.move('cast', { len: 0.7, strike: true, power: 0.2 });
      after(0.2, () => { if (alive && !f.ko) { f.bf.typo(); f.glitch = 0.35; } });
      xs('sputter', 0.9, from);
      burst(casterOf(from).pos(new V()), 10, 3, RED, { shard: true, size: 0.2, life: 0.5, grav: 6 });
      const dodge = t - F[to].typeAt < 1.2;
      after(0.42, () => {
        if (!alive) return;
        const hx = '#' + col.getHexString();
        if (dodge) shot(from, 1, null, { orb: true, noMove: true, plain: true, noCut: true, ms: 560, color: hx, size: 1.2, flick: true, arc: 1.3, dodge: true,
          land: () => { const at = centre(to, new V()).addScaledVector(STG.a, -F[to].dir * 2).addScaledVector(STG.n, -0.8); smoke(at, 6, 1.2, { size: 1.2, life: 1.0, op: 0.45 }); burst(at, 10, 3, col, { size: 0.2, life: 0.5, grav: 3 }); xs('fizzleShield', 0.6, to); } });
        else shot(from, 1, null, { orb: true, noMove: true, plain: true, noCut: true, ms: 560, color: hx, size: 1.2, flick: true, arc: 1.3, how: { deflect: true } });
      });
    }
    const threats = [];

    // ---------- typing on the bots ----------
    function key(i, frac) { const f = F[i]; if (f.bf && !f.ko) { f.bf.key(frac); f.typeAt = t; STG.ph[i] += 0.12; } }
    function wpm(i, w) { if (F[i].bf) F[i].bf.setWpm(w); }
    function hold(i, frac) { const f = F[i]; if (f.bf && !f.ko) { f.bf.hold(frac); f.typeAt = t; STG.ph[i] += 0.5; stageWord(i, 0.5); if (!warming) csnd('blip'); } }
    function clear() { F.forEach(f => { if (f.bf) f.bf.clear(); }); }
    // Showdown: the round's attack. 1-3 words a shot, 4-6 a double, 7-9 the dash strike, all 10 the
    // finisher: the bot rises, flares and drives in under a cutaway, and a thick beam carries the hit
    function strike(from, words, o = {}) {
      const f = F[from], to = 1 - from;
      if (!f.bf || words <= 0) { if (o.onLand) o.onLand(); return; }
      const col = opts.sides[from].color;
      const fire = (tier, land, extra = {}) => shot(from, tier, land, { orb: true, color: col, ms: 360, crit: o.crit, dodge: o.dodge, noMove: true, ...extra });
      if (words >= 10) {
        f.bf.spell(); csnd('ultimate'); snd('charge', 0.7);
        if (!warming) want('finisher', { x: from, pri: 3 });
        setTimeout(() => { if (!alive) return; snd('release'); fire(4, o.onLand, { ms: 420 }); }, reduce ? 0 : 620);
      } else if (words >= 7) {
        const rel = f.bf.attack(3); csnd('op-attack');
        setTimeout(() => { if (alive) fire(3, o.onLand); }, rel);
      } else if (words >= 4) {
        const rel = f.bf.attack(1); csnd('op-attack');
        setTimeout(() => { if (!alive) return; fire(1, null, { ms: 330 }); }, rel);
        setTimeout(() => { if (!alive) return; f.bf.attack(1); fire(1, o.onLand); }, rel + 200);
      } else {
        const rel = f.bf.attack(0); csnd('op-attack');
        setTimeout(() => { if (alive) fire(0, o.onLand); }, rel);
      }
    }

    // ---------- Showdown: the round's exchange as a short directed scene ----------
    // The rules (showdown-rules.js) have already decided everything: who strikes first, each attack's
    // tier, damage, crit and whether it was dodged. This turns that into one scene of about 4 s,
    // built from pieces in the order the rules give, and never the same scene twice in a row:
    //   trade    the first attack lands, the other bot recovers and answers
    //   dodge    the defender (who finished all 10 early) dodges and counters at once
    //   reflect  the same outcome shown as the defender batting the attack back onto the attacker's shield
    //   clash    both struck at nearly the same moment: the two shots meet in the middle and burst,
    //            and what's left of each still lands, in the rules' order
    // Inside each, the attack is a move for its tier: a shot, a lob or a volley for 1-3 words, a volley,
    // a twin shot or a dash slash for 4-6, a dash slash, an uppercut, a spin strike or a pass for 7-9,
    // a dive or a slam for the finisher. Below 90% accuracy a hit only grazes; a clean round is a heavy crit.
    //   exchange(attacks, { acc: [a, b], close, onLand(attack), onDone() }) -> seconds it takes
    const SD_POOL = [[], ['bolt', 'lob', 'volley'], ['volley', 'twin', 'slash'], ['slash', 'uppercut', 'spin', 'pass'], ['dive', 'slam']];
    const MELEE = { slash: 1, uppercut: 1, spin: 1, pass: 1, dive: 1, slam: 1 };
    let lastScene = '';
    function exchange(attacks, o = {}) {
      const onLand = o.onLand || (() => {}), st = o.onStart || (() => {}), done = () => { STG.xCloseT = 0; if (o.onDone) o.onDone(); };
      if (!BOTS || !attacks.length || F.some(f => !f.bf)) {
        attacks.forEach((a2, k) => after(k * 1.1, () => { st(a2); strike(a2.from, a2.words, { crit: a2.crit, dodge: a2.dodged, onLand: () => onLand(a2) }); }));
        const d = attacks.length ? 1.2 * attacks.length : 0.3; after(d, done); return d;
      }
      const [A, B] = attacks;
      let kind = 'trade';
      if (A.dodged && B) kind = (A.tier >= 3 || lastScene === 'dodge') && lastScene !== 'reflect' ? 'reflect' : 'dodge';
      else if (A.dodged) kind = lastScene === 'dodge' ? 'reflect' : 'dodge';
      else if (B && o.close && !B.dodged && A.tier <= 2 && B.tier <= 2 && lastScene !== 'clash') kind = 'clash';
      lastScene = kind;
      STG.xCloseT = 1.2;   // they close in for the exchange
      const acc = o.acc || [1, 1];
      const howOf = a2 => ({ graze: !a2.crit && acc[a2.from] < 0.9, heavy: !!a2.crit && a2.tier >= 2 });
      let end;
      if (kind === 'clash') {
        // both at once: the two shots meet in the middle, burst, and the leftovers land in the rules' order
        want('xclash', { pri: 3 }); st(A); st(B);
        const ta = attackVariant(A.from, A.tier, 'proj'), tb = attackVariant(B.from, B.tier, 'proj');
        const meet = 0.32 + 0.45;
        const m = new V().addVectors(fc[0], fc[1]).multiplyScalar(0.5).setY(Math.max(fc[0].y, fc[1].y) + 0.3);
        for (const [a2, v] of [[A, ta], [B, tb]]) {
          const f = F[a2.from];
          f.bf.move(v === 'lob' ? 'hop' : v === 'volley' ? 'volley' : 'jab', { len: 0.42, strike: true, power: a2.tier / 4 });
          after(0.32, () => shot(a2.from, a2.tier, null, { orb: true, noMove: true, plain: true, noCut: true, ms: 450, color: opts.sides[a2.from].color, to: m, arc: v === 'lob' ? 1.6 : 0.6, size: 1.1, land: () => {} }));
        }
        after(meet, () => clashBurst(m, C(opts.sides[0].color || '#8cff58'), C(opts.sides[1].color || '#f29d30')));
        [A, B].forEach((a2, k) => after(meet + 0.05 + k * 0.12, () => shot(a2.from, a2.tier, () => onLand(a2), { orb: true, noMove: true, plain: true, noCut: true, ms: 200, start: m, color: opts.sides[a2.from].color, size: 0.7, how: { ...howOf(a2), frag: true } })));
        end = meet + 0.5 + 0.9;
      } else {
        // the first attack
        const r1 = attackBeat(A, 0, howOf(A), onLand, kind === 'trade' ? null : kind, st);
        end = r1.contact + 0.9;
        if (B) {
          // the answer: right off the dodge or the parry, or once the hit bot has recovered
          const t2 = kind === 'trade' ? r1.contact + (A.tier >= 3 ? 0.75 : 0.6) : r1.contact + 0.28;
          if (kind !== 'trade') after(t2 - 0.05, () => xs('counter', 0.9, B.from));
          const r2 = attackBeat(B, t2, howOf(B), onLand, B.dodged ? 'dodge' : null, st);
          end = r2.contact + (B.tier >= 4 ? 1.2 : 0.9);
        }
      }
      after(end, done);
      return end;
    }
    function attackVariant(i, tier, only) {
      let pool = SD_POOL[Math.max(1, Math.min(4, tier))];
      if (only === 'proj') pool = pool.filter(v => !MELEE[v]);
      if (!pool.length) pool = ['bolt'];
      return pick('sd' + i + tier + (only || ''), pool);
    }
    // one attack starting at t0 (seconds from now); returns { contact } in seconds from now.
    // out: null when it lands, 'dodge' or 'reflect' when the rules said it was dodged
    function attackBeat(a2, t0, how, onLand, out, st) {
      const i = a2.from, j = a2.to, f = F[i], col = C(opts.sides[i].color || (i ? '#f29d30' : '#8cff58'));
      const v = attackVariant(i, a2.tier), land = () => onLand(a2);
      const sideS = (f.mvSide = -(f.mvSide || 1));
      const camAt = Math.max(0, t0 - 0.3);
      after(t0, () => st && st(a2));
      // the camera: the finisher has its own cut; a dodge or a parry gets the slow look at the defender
      if (a2.tier >= 4) after(camAt, () => want('finisher', { x: i, pri: 3.5 }));
      else if (out) after(camAt, () => want('xdodge', { x: j, pri: 3 }));
      else if (MELEE[v] || t0 === 0) after(camAt, () => want('xtrack', { x: i, pri: 3 }));
      let contact;
      if (a2.tier >= 4) {
        // the finisher: rise and charge, then come down on the other bot with a beam behind it
        after(t0, () => { f.bf.move('cast', { len: 0.9 }); csnd('ultimate'); snd('charge', 0.7); xs('rise', 1, i); STG.lift[i] = 0.8; });
        const mv = v, len = mv === 'slam' ? 0.85 : 0.8, hit = BotFighter.MOVES[mv].hit;
        contact = t0 + 0.8 + len * hit;
        after(t0 + 0.8, () => { STG.lift[i] = 0; f.bf.move(mv, { len, strike: true, power: 1, side: sideS }); xs(mv, 1, i); snd('release'); });
        after(contact - 0.12, () => { const a3 = handOf(i, new V()), b3 = centre(j, new V()); beam(a3, b3, col, a2.crit ? 0.55 : 0.42, 0.1, 0.35, tmp2.set(0, 0, 0), true); });
      } else if (MELEE[v]) {
        const len = v === 'pass' ? 0.9 : v === 'slam' ? 0.8 : v === 'dive' ? 0.75 : 0.6;
        contact = t0 + len * BotFighter.MOVES[v].hit;
        after(t0, () => { f.bf.move(v, { len, strike: true, power: a2.tier / 4, side: sideS }); xs(v === 'pass' ? 'pass' : v, 0.9, i); });
      } else {
        // a shot: a jab and a bolt, a hop and a lob, a sidestep and a twin shot, or a volley
        const body = v === 'lob' ? 'hop' : v === 'twin' ? 'sidestep' : v === 'volley' ? 'volley' : 'jab', blen = v === 'volley' ? 0.7 : 0.45;
        const rel = blen * BotFighter.MOVES[body].hit, T = v === 'lob' ? 0.6 : 0.42;
        contact = t0 + rel + T;
        after(t0, () => f.bf.move(body, { len: blen, strike: true, power: a2.tier / 4, side: sideS }));
        const fire = (dt2, cb, extra) => after(t0 + dt2, () => shot(i, a2.tier, cb, { orb: true, noMove: true, plain: true, noCut: true, ms: T * 1000, color: opts.sides[i].color, crit: a2.crit, arc: v === 'lob' ? 2.2 : 1, ...extra }));
        const final = out === 'dodge' ? { dodge: true } : out === 'reflect' ? { how: { deflect: true } } : { how };
        if (out === 'reflect') after(contact - 0.15, () => F[j].bf.move('parry', { len: 0.45, side: j ? -1 : 1 }));
        if (v === 'volley') {
          const n = Math.max(2, Math.min(4, a2.words));
          for (let k = 0; k < n; k++) { const at2 = blen * (0.12 + 0.18 * k); after(t0 + at2, () => xs('volley', 0.8, i)); if (k < n - 1) fire(at2, null, { size: 0.6, land: () => tick(j, col) }); else { contact = t0 + at2 + T; fire(at2, out ? null : land, { size: 0.9, ...final }); } }
        } else if (v === 'twin') {
          fire(rel, null, { size: 0.75, land: () => tick(j, col), arc: 1.6 });
          fire(rel + 0.12, out ? null : land, { size: 0.9, arc: 0.5, ...final });
          contact += 0.12;
        } else fire(rel, out ? null : land, final);
        if (out) after(contact, land);
        return { contact };
      }
      // a melee strike connecting (or the finisher arriving)
      after(contact, () => {
        const at = centre(j, new V()), dirV = tmp.subVectors(at, centre(i, new V()));
        if (out === 'dodge') {
          slashArc(at.clone().addScaledVector(STG.n, 0.4), dirV, sideS * 0.6, 1.6, col, 0.26);
          whiff(j, col, null); xs('slash', 0.6, i);
        } else if (out === 'reflect') {
          // the parry: the strike rings off the shield and the attacker is thrown back off it
          slashArc(at.clone().addScaledVector(STG.a, -F[j].dir * 0.8), dirV, sideS * 0.6, 1.4, C('#7dffc4'), 0.24);
          deflectAtMelee(j, i);
        } else {
          slashArc(at, dirV, v === 'uppercut' ? 1.45 : v === 'spin' ? 0.1 : v === 'slam' || v === 'dive' ? 1.2 : sideS * 0.7, a2.tier >= 4 ? 2.2 : 1.6, col, a2.tier >= 4 ? 0.4 : 0.28);
          if (a2.tier >= 4) { ringAt(j, col, 7, 0.7); smoke(feetOf(j, new V()).setY(0.4), 10, 2.4, { size: 1.6, life: 1.2, op: 0.5 }); }
          impact(j, a2.tier, a2.crit, col, null, { ...how, hurt: how.graze ? null : v === 'uppercut' || (v === 'slam' && !how.heavy) ? 'launch' : v === 'spin' ? 'spinout' : undefined });
        }
        land();
      });
      // the defender's dodge or parry, timed to the strike
      if (out === 'dodge') after(contact - 0.2, () => { const dv = pick('d' + j, ['roll', 'duck', 'leap']); if (dv === 'roll') F[j].bf.dodge((F[j].mvSide = -(F[j].mvSide || 1))); else F[j].bf.move(dv, { len: 0.45 }); xs('dodge', 0.8, j); csnd('op-dodge'); });
      if (out === 'reflect') after(contact - 0.15, () => { F[j].bf.move('parry', { len: 0.45, side: j ? -1 : 1 }); });
      return { contact };
    }
    // a melee strike stopped by the shield: a clang and the attacker knocked back off it
    function deflectAtMelee(j, i) {
      const at = centre(j, new V()).addScaledVector(STG.a, -F[j].dir * 1.0);
      react(j, 'block', 0.4, 0, true);
      burst(at, 18, 8, C('#7dffc4'), { size: 0.26, life: 0.45, grav: 3 });
      flare(at, C('#bfffe6'), 2, 0.14);
      xs('clang', 1, j);
      if (F[i].bf) { F[i].bf.hurt('knock', { k: 0.9, side: i ? -1 : 1 }); F[i].bf.block(); }
      if (!reduce) { stopUntil = Math.max(stopUntil, clockMs() + 80); shake = Math.max(shake, 0.3); }
    }

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

    function react(i, kind, power = 0.4, p = 0, noDome = false) {
      const f = F[i];
      if (f.op && !f.ko) {
        if (kind === 'hit') f.mv.act(p >= 3 || power > 0.9 ? 'stagger' : 'flinch');
        if (kind === 'stun') f.mv.act('flinch');
        // a light word is side-stepped, a heavy one taken behind crossed arms
        if (kind === 'block') { if (lastTier[i] >= 3 || !f.mv.play('dodge')) f.mv.act('block'); }
        if (kind === 'cleanse') f.mv.play('heal');
      }
      if (f.bf && !f.ko) {
        if (kind === 'hit') { f.bf.hit(new V((Math.random() - 0.5) * 0.8, 0, -1), Math.min(1.5, power + p * 0.12)); csnd('op-hit'); }
        if (kind === 'block') f.bf.block();
        if (kind === 'typo') f.bf.typo();
        if (kind === 'miss') f.bf.miss();
      }
      if (kind === 'hit') { f.kick = Math.min(1, f.kick + 0.35 + power * 0.4); f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#ffffff'); }
      if (kind === 'typo') { f.flash = Math.max(f.flash, 0.6); f.flashCol.set('#ff4d5e'); f.glitch = 0.35; burst(casterOf(i).pos(new V()), 7, 3.5, RED, { shard: true, size: 0.2, life: 0.45, grav: 7 }); if (i === opts.me) csnd('fizzle'); }
      if (kind === 'block') {
        f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#7dffc4');
        const S = shields[i]; if (!f.bf) { S.t = 0; S.m.visible = true; }
        snd('block'); flashLight(centre(i, new V()), C('#7dffc4'), 3);
        burst(centre(i, new V()).add(tmp2.set(f.dir ? f.dir * 1.2 : 0, 0, 0.4)), 12, 5, C('#7dffc4'), { size: 0.22, life: 0.4, grav: 2 });
        if (fx && !f.op && !noDome) fx.event('ward', { caster: adapters[i] });
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
      if (f.bf) { f.bf.ko(); f.koLand = t + 0.8; csnd('op-down'); return; }
      if (!reduce && !warming) { slowUntil = clockMs() + 1500; slowK = 0.3; }
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
    function rise() { F.forEach((f, i) => {
      if (f.op && f.mv.down() && !f.lost) { f.mv.act('getup'); snd('getup'); }
      if (f.bf && f.ko && !f.lost) { f.bf.rise(); f.ko = 0; snd('getup'); ringAt(i, f.col, 3, 0.5); }
    }); }
    // a new round: knocked fighters get up, cards come back together and drop onto their pads
    function revive() {
      F.forEach((f, i) => {
        if (f.broken) { f.card.remove(f.broken.grp); f.broken = null; f.card.children.forEach(ch => { ch.visible = true; }); }
        if (f.op) { if (f.mv.down()) { f.mv.act('getup'); snd('getup'); } }
        else if (f.bf) { if (f.ko) snd('getup'); f.bf.rise(); f.bf.clear(); f.koLand = 0; f.lost = false; }
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
      if (w.bf) { w.bf.rise(); w.bf.victory(); csnd('op-victory'); }
      if (l.bf) l.lost = true;
      if (l.op && !l.mv.down()) l.lost = true;
      if (arena) { arena.board({ text: 'WINNER', hot: win, sub: (opts.sides[win].name || '').toUpperCase() }); arena.hype(win, 1.4); }
      snd(win === opts.me || opts.me < 0 ? 'fanfare' : 'lose');
      if (opts.audio) opts.audio.swell(1);
      want('victory', { x: win, pri: 5 });
    }

    const _s = new V();
    function screen(i, out = {}) {
      if (F[i].op || F[i].bf) headOf(i, _s).add(tmp2.set(0, F[i].bf ? 0.5 : 0.9, 0)); else centre(i, _s).setY(F[i].base.y + CARD_H / 2 + 0.2);
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
      const pr = renderer.getPixelRatio();
      if (farRT) farRT.setSize(Math.max(2, Math.round(w * pr * FAR)), Math.max(2, Math.round(h * pr * FAR)));
      // the glow is worked out from a quarter-size picture (the pass's own default is half): it is
      // soft anyway, and this halves what the bloom costs
      bloom.setSize(Math.round(w * pr / 2), Math.round(h * pr / 2));
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
    function subj() { for (let i = 0; i < 2; i++) { feetOf(i, fp[i]); chest(i, fc[i]); headOf(i, fh[i]); } frame0(); }
    let drift = 0;
    // every shot is placed in the pair's own frame: along the line between the bots (A, or Ai from
    // fighter i toward the other), across it toward the camera side (N) and up, so the shots follow
    // the bots wherever they move on the stage
    const AX = new V(1, 0, 0), NX = new V(0, 0, 1), CEN = new V(), MID = new V();
    const Ai = i => (i ? -1 : 1);
    function fr(out, base, i, al, up, dp) { return out.set(base.x + AX.x * Ai(i) * al + NX.x * dp, up, base.z + AX.z * Ai(i) * al + NX.z * dp); }
    function frame0() {
      if (BOTS) { AX.copy(STG.a); NX.copy(STG.n); CEN.set(STG.cx, 0, STG.cz); } else { AX.set(1, 0, 0); NX.set(0, 0, 1); CEN.set(0, 0, 0.4); }
      MID.addVectors(fp[0], fp[1]).multiplyScalar(0.5).setY(0);
    }
    const along = p => (p.x - CEN.x) * AX.x + (p.z - CEN.z) * AX.z;
    const across = p => (p.x - CEN.x) * NX.x + (p.z - CEN.z) * NX.z;
    // where a spell is on its way (for the shot that follows it): set by cast()
    const spellCam = { from: 0, at: 0, len: 1, p: new V() };
    const shots = {
      game: { fov: GFOV, omega: 3.2, pose(c, out) {
        let s0 = Infinity, s1 = -Infinity, top = 0, dep = 0;
        for (const q of [fp[0], fp[1], fh[0], fh[1]]) { const s2 = along(q); s0 = Math.min(s0, s2); s1 = Math.max(s1, s2); }
        for (let i = 0; i < 2; i++) { top = Math.max(top, fh[i].y); dep += across(fp[i]) / 2; }
        const x0 = s0 - 2.4, x1 = s1 + 2.4, sc = (x0 + x1) / 2;
        const lift = Math.max(0, top - 4.4);   // a bot up high: frame taller and look up with it
        const D = Math.min(32, fitD(x1 - x0, 6.4 + lift * 1.1, GFOV) + 1.4);
        const sw = reduce ? 0 : Math.sin(drift * 0.16) * 0.06;   // a slow sway round the stage, a few degrees
        const bx = CEN.x + AX.x * sc + NX.x * dep, bz = CEN.z + AX.z * sc + NX.z * dep;
        out.pos.set(bx + (NX.x * Math.cos(sw) + AX.x * Math.sin(sw)) * D, 3.1 + D * 0.06 + lift * 0.35, bz + (NX.z * Math.cos(sw) + AX.z * Math.sin(sw)) * D);
        out.look.set(bx, 2.35 + lift * 0.5, bz);
      } },
      faceoff: { pri: 3, parts: [
        // a crane down over the stage, then each fighter in a close three-quarter shot, set off to their
        // own side of the frame so the countdown in the middle never sits on a face
        { len: 1.0, cut: 1, fov: 40, omega: 3, pose(c, out) { const u = c.u; fr(out.pos, CEN, 0, 0, 11 - 6 * u, 21 - 4 * u); out.look.set(CEN.x, 2 + u * 0.4, CEN.z); } },
        { len: 1.05, cut: 1, fov: 28, omega: 4, pose(c, out) { fr(out.pos, fp[0], 0, 0.54 * 7.6, 3.4, 0.84 * 7.6); fr(out.look, fc[0], 0, 1.9, fc[0].y + 0.3 + c.u * 0.15, 0); } },
        { len: 1.05, cut: 1, fov: 28, omega: 4, pose(c, out) { fr(out.pos, fp[1], 1, 0.54 * 7.6, 3.4, 0.84 * 7.6); fr(out.look, fc[1], 1, 1.9, fc[1].y + 0.3 + c.u * 0.15, 0); } },
      ] },
      strike: { pri: 2, parts: [
        { len: 0.5, cut: 1, slow: 0.3, fov: 34, pose(c, out) { const i = c.x, j = 1 - i; fr(out.pos, fp[i], i, -3.4, 4.3 + Math.max(0, fc[i].y - 3.4), 3.2); out.look.copy(fc[j]); } },
        { len: 0.75, cut: 1, slow: 0.65, fov: 38, pose(c, out) { const i = c.x, j = 1 - i; fr(out.pos, MID, i, 2, 1.5, 12.5); out.look.lerpVectors(MID, fc[j], 0.7).setY(2.4 + Math.max(0, fc[j].y - 3.4) * 0.5); } },
      ] },
      // a spell from the caster to where it lands (Gid, 28 Nov 2026: "not just a close-up of the caster"):
      // low on the caster as it rises, along the spell's way, then on the target as it lands
      spell: { pri: 2, parts: [
        { len: 0.55, cut: 1, fov: 32, pose(c, out) { const i = c.x; fr(out.pos, fp[i], i, 0.3 * 12, fc[i].y - 0.6 + c.u * 0.5, 0.95 * 12); fr(out.look, fc[i], i, 1.2, fc[i].y + 0.4, 0); } },
        { len: 0.6, cut: 1, fov: 36, omega: 5, pose(c, out) { const i = c.x, j = 1 - i; out.look.lerpVectors(fc[i], fc[j], 0.3 + 0.55 * c.u); fr(out.pos, out.look, i, -1.4, 3.0 + Math.max(0, fc[i].y - 3.6) * 0.4, 10.5); } },
        { len: 1.2, cut: 1, slow: 0.6, fov: 36, omega: 4, pose(c, out) { const j = 1 - c.x; fr(out.pos, fp[j], j, -0.42 * 10.5 - c.u * 0.5, 2.2 + Math.max(0, fc[j].y - 3.4) * 0.7, 0.9 * 10.5); fr(out.look, fc[j], j, 1.4, fc[j].y + 0.2, 0); } },
      ] },
      // Showdown's finisher: low in front of the bot as it rises and flares, then wide as it drives in
      finisher: { pri: 3, parts: [
        // over the attacker's shoulder, low, onto the target as the orb swells; then wide from the side as it drives in
        { len: 0.8, cut: 1, slow: 0.5, fov: 36, pose(c, out) { const i = c.x; fr(out.pos, fp[i], i, -(3.4 + c.u * 0.6), fc[i].y + 0.6 + c.u * 0.3, 11.5); fr(out.look, MID, i, 0.3, 2.8 + Math.max(0, fc[i].y - 3.6) * 0.6, 0); } },
        { len: 1.1, cut: 1, slow: 0.7, fov: 40, omega: 3, pose(c, out) { const i = c.x, hi = Math.max(0, fc[i].y - 3.6); fr(out.pos, MID, i, -1.5, 1.6 + c.u * 0.4 + hi * 0.5, 12.5 + hi); fr(out.look, MID, i, 1.5, 2.4 + hi * 0.75, 0); } },
      ] },
      // an exchange in Showdown: low and wide from the side, centred between them, slowly tracking the attacker
      xtrack: { pri: 3, len: 1.4, fov: 34, omega: 4, pose(c, out) { const i = c.x; const m = out.look.lerpVectors(fc[0], fc[1], 0.5); m.lerp(fc[i], 0.15); fr(out.pos, m, i, -1.2 + c.u * 1.6, 1.7, 11.5); out.look.y = 2.6 + Math.max(0, Math.max(fc[0].y, fc[1].y) - 3.6) * 0.5; } },
      // the dodge and the counter: close on the defender in slow motion as the attack goes past
      xdodge: { pri: 3, parts: [
        { len: 0.75, cut: 1, slow: 0.4, fov: 34, pose(c, out) { const j = c.x; fr(out.pos, fp[j], j, -0.3 * 11, 2.3 + Math.max(0, fc[j].y - 3.4) * 0.6, 0.95 * 11); fr(out.look, fc[j], j, 2.2, fc[j].y + 0.1, 0); } },
        { len: 0.8, cut: 1, slow: 0.8, fov: 38, pose(c, out) { const j = c.x; fr(out.pos, MID, j, -2.4, 1.8, 12); fr(out.look, MID, j, 0.8, 2.5, 0); } },
      ] },
      // two shots meeting in the middle: low and centred, slow as they burst
      xclash: { pri: 3, len: 1.3, slow: 0.45, fov: 38, omega: 5, pose(c, out) { fr(out.pos, MID, 0, 0, 1.4 + c.u * 0.5, 10.5 - c.u * 1.2); out.look.copy(MID).setY(2.7); } },
      ko: { pri: 4, free: true, parts: [
        { len: 1.5, cut: 1, slow: 0.28, fov: 44, pose(c, out) { const i = c.x; fr(out.pos, fp[i], i, 4.2, 1.5, 6.6); fr(out.look, fp[i], i, -1.4, 2.0, 0); } },
        { len: 1.7, cut: 1, slow: 0.7, fov: 40, omega: 2.5, pose(c, out) { const i = c.x, j = 1 - i; fr(out.pos, fp[j], j, -3.2, 3.2 + c.u * 0.6, 6.5 - c.u * 1.2); out.look.copy(MID).setY(1.8); } },
      ] },
      victory: { pri: 5, free: true, len: 3.6, fov: 34, omega: 3, pose(c, out) {
        const i = c.x, a = (i ? -1 : 1) * (0.5 - c.u * 1.0);
        out.pos.set(fp[i].x + (AX.x * Math.sin(a) + NX.x * Math.cos(a)) * 9.5, 3.1 + c.u * 0.8, fp[i].z + (AX.z * Math.sin(a) + NX.z * Math.cos(a)) * 9.5); out.look.set(fc[i].x, fc[i].y + 0.4, fc[i].z);
      } },
    };
    const dir = window.CamDirector ? CamDirector.create(THREE, camera, {
      reduce, shots, lockBefore: 1.2, gap: 3.2, budget: 3,
      onPart(name, idx, part) { if (part.slow && !reduce) { slowK = part.slow; slowUntil = clockMs() + part.len * 1000; } else if (!part.slow) slowUntil = 0; },
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
    let loopErr = 0, perfAcc = 0, perfN = 0, qLevel = 2, testHold = false, testStep = 0, testClock = 0, frameN = 0;
    const clockMs = () => (testHold ? testClock * 1000 : performance.now());
    renderer.setAnimationLoop(() => { try { frame(); } catch (e) { if (loopErr++ < 3) console.error('arena frame', e); } });
    function frame() {
      if (!alive || document.hidden || !visible) { last = performance.now(); return; }
      const nowT = performance.now();
      const real = Math.min(0.05, (nowT - last) / 1000); last = nowT;
      rt = nowT / 1000;
      let dt = frozen ? 0 : real;
      // tests: time stands still except for _step, which moves the camera's clock as if that much real time
      // had passed (hit stop and slow motion still slow the scene inside it), so frame sheets match play
      let creal = real;
      if (testHold) { dt = creal = testStep; testStep = 0; testClock += creal; }
      const cms = clockMs();
      if (cms < stopUntil) dt *= 0.08;            // hit stop
      else if (cms < slowUntil) dt *= slowK;      // slow motion from the director's shot
      t += dt; drift += creal; frameN++;
      F.forEach((f, i) => {
        const toMid = -f.kickDir;
        f.kick = Math.max(0, f.kick - dt * 3.2);
        f.recoil = Math.max(0, f.recoil - dt * 2.6);
        f.flash = Math.max(0, f.flash - dt * 7);
        f.stun = Math.max(0, f.stun - dt); f.freeze = Math.max(0, f.freeze - dt); f.fog = Math.max(0, f.fog - dt);
        f.glitch = Math.max(0, f.glitch - dt);
        f.lt += dt;
        if (f.bf) {
          // the bot: its fighter moves on the typing events; freeze and lock slow it to a crawl
          const odt = f.freeze > 0 ? dt * 0.15 : f.stun > 0 ? dt * 0.05 : dt;
          f.bf.update(odt);
          if (f.stun > 0 || f.glitch > 0) f.bf.bot.group.position.x += reduce ? 0 : (Math.random() - 0.5) * 0.08;
        } else if (f.op) {
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
      // the bots' places in the arena, then what rides on them
      if (BOTS) {
        stage(dt);
        F.forEach((f, i) => {
          // the KO landing: a thud of dust where it hits the floor
          if (f.koLand && t >= f.koLand) { f.koLand = 0; chest(i, tmp).setY(0.4); smoke(tmp, 14, 2.6, { size: 1.6, life: 1.4, op: 0.6 }); ringAt(i, SMOKE, 3.5, 0.7); snd('knock'); shake = Math.max(shake, reduce ? 0 : 0.45); }
          chest(i, f.card.position);
          // the shadow under it, smaller and fainter the higher it hovers; on a pedestal or on the stage floor
          const over = POS.some(P0 => Math.hypot(f.card.position.x - P0.x, f.card.position.z - P0.z) < (arena ? arena.PAD_R : 1.8));
          const fy = over ? (arena ? arena.PAD_TOP : 0.22) : 0.02, hgt = Math.max(0, f.card.position.y - fy);
          f.shadow.position.set(f.card.position.x, fy + 0.012, f.card.position.z);
          f.shadow.scale.setScalar(Math.max(1.2, 3.4 - hgt * 0.45));
          f.shadow.material.opacity = Math.max(0.12, 0.75 - hgt * 0.12);
        });
      }
      runDue();
      // letters in flight, each with two fading copies behind it
      for (const g of glyphs) {
        if (!g.on) continue;
        g.t += dt;
        const u0 = (g.t - g.delay) / g.dur;
        if (u0 < 0) continue;
        const u = Math.min(1, u0), e = Math.pow(u, 1.35);
        if (g.to >= 0) { centre(g.to, tmp).add(tmp2.set(0, 0.1, 0.2)); g.b.lerp(tmp, Math.min(1, dt * 14)); }
        bez(g.s.position, g, e); g.s.visible = true;
        const sc = g.size * (0.5 + 0.5 * Math.min(1, u * 5));
        g.s.scale.setScalar(g.flick ? sc * (0.7 + Math.random() * 0.5) : sc); g.s.material.rotation = g.spin * (g.t - g.delay) * 0.3;
        g.s.material.opacity = g.flick && Math.random() < 0.35 ? 0.25 : 1;   // a fizzled spell sputters on its way
        if (g.flick && u < 1 && Math.random() < dt * 40) { burst(g.s.position, 1, 2.5, Math.random() < 0.5 ? RED : SMOKE, { shard: true, size: 0.16, life: 0.4, grav: 6, k: 1.2 }); if (Math.random() < 0.3) smoke(g.s.position, 1, 0.4, { size: 0.7, life: 0.6, op: 0.3 }); }
        g.tr.forEach((x, k) => { bez(x.position, g, Math.max(0, e - 0.05 * (k + 1))); x.scale.setScalar(sc * (0.55 - k * 0.15)); x.visible = u > 0.05; });
        // an orb's comet tail: a bright streak back along its path
        if (g.tail) { bez(_p1, g, Math.max(0, e - 0.26)); const fl = g.flick ? (Math.random() < 0.4 ? 0.3 : 1) : 1; strip(g.tail.core, _p1, g.s.position, sc * 0.2, fl * Math.min(1, u * 6)); strip(g.tail.glow, _p1, g.s.position, sc * 0.62, 0.45 * fl * Math.min(1, u * 6)); }
        if (u >= 1) { g.on = false; g.s.visible = false; g.tr.forEach(x => { x.visible = false; }); if (g.tail) { g.tail.core.visible = g.tail.glow.visible = false; g.tail = null; } if (g.cb) { const cb = g.cb; g.cb = null; cb(); } }
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
      drawArcs(dt);
      drawStatus(dt);
      hitLightK = Math.max(0, hitLightK - creal * 14);
      if (arena) arena.update(t, dt, camera);
      // steady slow frames step the detail down (beams and haze, then the crowd lights, dust and pixel ratio)
      perfAcc += real; perfN++;
      if (perfAcc > 2.5) { const ms = perfAcc / perfN * 1000; perfAcc = 0; perfN = 0;
        if (ms > 30 && !warming && qLevel > 0 && !window.__fullQuality) { qLevel--; if (arena) arena.quality(qLevel); if (qLevel === 0) { renderer.setPixelRatio(1); fit(); } } }
      // the camera: the director picks the shot, then shake and the punch-in on big hits on top
      shake = Math.max(0, shake - creal * 2.5);
      punch = Math.max(0, punch - creal * 2.2);
      if (dir) {
        subj();
        while (threats.length && threats[0] < rt) threats.shift();
        threats.sort((a, b) => a - b);
        lineA.copy(fp[1]); lineB.copy(fp[0]);
        const ct = testHold ? testClock : rt;
        dir.update(ct, creal, { threatAt: threats.length ? threats[0] - rt + ct : Infinity, line: [lineA, lineB], subjects: { a: fc[0], b: fc[1] } });
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
      drawFar();
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
      for (const side of [0, 1]) { shot(side, 2, null, { orb: true, ms: 300, noMove: true }); key(side, 0.5); hold(side, 0.5); slashArc(centre(side, new V()), STG.a, 0.6, 1.5, WHITE); }
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
      for (const g of glyphs) { g.on = false; g.cb = null; g.s.visible = false; g.tr.forEach(x => { x.visible = false; }); if (g.tail) { g.tail.core.visible = g.tail.glow.visible = false; g.tail = null; } }
      for (const p of parts) { p.s.visible = false; p.life = 0; }
      for (const p of puffs) { p.s.visible = false; p.life = 0; }
      for (const f of flares) f.s.visible = false;
      for (const w of rings) w.m.visible = false;
      for (const B of beams) { B.on = false; B.core.visible = B.glow.visible = false; }
      revive();
      F.forEach(f => { f.drop = 0; f.kick = f.recoil = f.flash = f.glitch = f.lt = 0; f.lt = 9; f.ice = 0; f.frost.visible = false; f.arcs.visible = false; });
      stopUntil = slowUntil = 0; shake = punch = 0; hitLightK = 0;
      F.forEach(f => { if (f.mv) f.mv.reset(); if (f.bf) { f.bf.rise(); f.bf.clear(); f.koLand = 0; f.ko = 0; } f.won = false; f.lost = false; });
      inbound[0].length = inbound[1].length = 0;
      runes.forEach(R => { R.m.visible = false; }); shields.forEach(S => { S.m.visible = false; });
      threats.length = 0; due.length = 0; flying[0].length = flying[1].length = 0;
      arcFx.forEach(A => { A.on = false; A.core.forEach(m => { m.visible = false; }); A.glow.forEach(m => { m.visible = false; }); });
      STG.thT = STG.th = 0; STG.cxT = STG.cx = 0; STG.altT = [0, 0]; STG.alt = [0, 0]; STG.lift = [0, 0]; STG.xCloseT = STG.xClose = 0; STG.words = [0, 0]; lastScene = '';
      if (dir) dir.reset();
      await frames(2);
      return alive;
    }

    function dispose() {
      alive = false;
      F.forEach(f => { if (f.op) f.op.dispose(); if (f.bf) f.bf.dispose(); });
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

    return { shot, key, wpm, hold, strike, exchange, deflect, ricochet, fizzle, clear, cast, react, aura, setLook, setHp, ko, revive, rise, phase, result, screen, warm, dispose, director: () => dir, debugPose,
      _kb: (i, kb) => { F[i].kb = kb; }, _scene: () => scene, _cam: () => camera, _hold: on => { if (on && !testHold) testClock = performance.now() / 1000; testHold = !!on; }, _step: s => { testStep += s; }, _frames: () => frameN, _stg: () => STG,   // tests: a side's keyboard, stepping time by hand
      arena: () => arena, renderer: () => renderer, bloom: () => bloom, info: () => ({ warming, quality: qLevel, fx: fx ? fx.info() : null, letters: glyphs.filter(g => g.on).length, shot: dir ? dir.shot() : 'game', log: dir ? dir.log().slice(-12) : [], moves: F.map(f => (f.mv ? f.mv.name() : '')) }) };
  }

  return { mount };
})();
