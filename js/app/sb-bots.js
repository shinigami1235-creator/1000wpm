// SuperBots (28 Nov 2026): the bots in a Superboss fight, drawn for sb-scene.js. Gid: "the bots do battle with
// the boss, so I need them inside", and "Art just types. The audience watches a performance." Typing decides
// everything; this only shows it:
//   Art's bot   never stands still. It flits round its side of the arena between beats, closer in and wider the
//               faster Art types, and hangs back when he slows. Every finished word fires a shot and jinks it aside;
//               a block typed in time braces the hex shield and then weaves past the attack (ducks a lunge, hops a
//               sweep, rolls off a beam, threads a volley); a hit knocks it back across the arena with sparks.
//               Its power shows: a glow, a ring and embers grow with the combo tier, and a new tier flares.
//   drops       a viewer's support item falls into the arena with the viewer's name on it, and the bot flies to it,
//               weaving on the way; the item works when the bot grabs it (sb-fight.js times the trip, 1 to 4 s)
//   allies      the viewer's own bot flies in beside Art's with the drop, hands the item over with a stream of
//               light when it's picked up, fights for a while with shots in the item's colour and flies off
//               (4 at most, lite bots, so frame time holds)
//   the crowd   distant bots circling behind the boss, more as the hype meter fills
// Purely visual: no rule here changes.
//   const B = SuperBots.create(THREE, scene, K, { artPos, fx, host, focus(out), target(out, i), sfx(name, arg), reduce })
//   B.art              Art's BotFighter (or null)
//   B.aim(out)         the middle of Art's bot: attacks that land on Art aim here
//   B.shieldAt(out)    where a blocked attack stops: in front of the bot, toward the boss
//   B.muzzle(out)      where Art's shots and spells leave
//   B.yaw()            the way the bot faces (radians)
//   B.subject(out)     a smoothed point on Art's bot, for the camera
//   B.chase()          { to: V3, left } while the bot is on its way to a drop, else null
//   B.power()          0..1, how charged the bot is (the combo tier)
//   B.event(n, d, snap)    B.update(t, dt, { snap, threatIn, dead, lost, finishing })    B.info()   B.clear()   B.dispose()
window.SuperBots = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const ITEM = { shield: '#f2c230', heal: '#39ff88', overclock: '#ff8a3d', slowmo: '#9fd8ff', hype: '#ffd84a' };
  // the bot's patch of the arena (world units): Art's side, well clear of every boss
  const ZONE = { x: 7.5, zNear: 10.8, zFar: 18.6, lo: 0.5, hi: 3.0 };
  // where drops land (spot from the rules picks one; the scene skips a spot right under the bot)
  const SPOTS = [[-6.4, 12.4], [6.3, 12.0], [-4.6, 17.6], [5.0, 17.8], [-1.6, 11.2], [2.6, 15.4]];
  // ally posts beside Art, in his frame: across (+ is his right), up, back
  const POSTS = [[-3.9, 0.8, 1.6], [3.7, 1.5, 1.0], [-6.6, 2.3, 3.0], [6.4, 2.8, 2.6]];
  const CAP = 4;
  // how each kind of attack is dodged when the block word is in: a weave
  const WEAVE_V = { lunge: 'lunge3', volley: 'thread', wave: 'leap', beam: 'roll' };
  const WEAVE = { bite: 'duck', lunge: 'duck', breach: 'leap', sweep: 'leap', slam: 'leap', overflow: 'roll', breath: 'roll', laser: 'roll', beam: 'roll', bomb: 'thread', spit: 'thread', packet: 'thread' };

  function create(THREE, scene, K, o) {
    const V = THREE.Vector3, C = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
    const T3 = o.three || THREE;
    const art = o.artPos;
    const keep = [], own = x => (keep.push(x), x);
    const v1 = new V(), v2 = new V(), v3 = new V(), fwd = new V(), right = new V(), foc = new V();
    let t = 0;

    // ---------- Art's bot ----------
    let bot = null;
    if (window.BotFighter && window.BotKit) {
      try {
        const b = BotKit.random('art');
        bot = BotFighter.create(T3, b.id, { ...b.look, color: '#3ee6ff', name: 'Art' }, { gap: 8, scale: 1.15, lite: true, roam: true });
        scene.add(bot.group);
      } catch (e) { bot = null; }
    }
    // the flight: a spring toward a goal that keeps moving
    const M = { p: new V(art.x, 0, art.z), v: new V(), lift: 1.4, liftV: 0, goal: new V(art.x, 0, art.z), goalLift: 1.4, nextAt: 0, side: 1, yaw: Math.PI, sway: Math.random() * 10 };
    const cam = { p: new V(art.x, 4, art.z), v: new V() };   // the camera's smoothed subject
    const variants = {};   // the look each boss attack takes this time (sb-hydra.js tells it)
    let wpm = 0, combo = 0, tier = 0, keys = 0, mode = 'flit', chase = null, holdUntil = 0, weaveQ = null, lastBlockT = -9;
    const bodyAt = out => (bot ? bot.bot.body.getWorldPosition(out) : out.set(M.p.x, M.lift + 2.3, M.p.z));
    function faceVecs(yaw) { fwd.set(Math.sin(yaw), 0, Math.cos(yaw)); right.set(-fwd.z, 0, fwd.x); }

    // a new spot to flit to: nearer and wider when Art types fast, crossing over most of the time
    function pickGoal() {
      const s = window.BotFighter ? BotFighter.stanceOf(wpm) : 1;
      if (Math.random() < 0.72) M.side = -M.side;
      const ln = o.lane && o.lane();
      M.goal.x = ln ? (ln[0] + ln[1]) / 2 + M.side * rnd(0.3, (ln[1] - ln[0]) / 2) : M.side * rnd(1.2, 2.6 + s * 1.3);
      M.goal.z = ZONE.zFar - 1.3 - s * 1.6 + rnd(-1.4, 1.4);
      M.goalLift = rnd(0.7, 1.9) + s * 0.25 + o.liftK();
      M.nextAt = t + rnd(1.0, 2.1) / (0.85 + s * 0.18);
    }
    pickGoal();
    // a jink: a quick push through the air
    const jink = (x, z, up = 0) => { M.v.x += x; M.v.z += z; M.liftV += up; };

    // ---------- the power aura: a glow, a ring and embers that grow with the combo tier ----------
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
    { const c = glowCv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
    const glowTex = own(new THREE.CanvasTexture(glowCv));
    const aura = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: C('#3ee6ff'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false })));
    aura.renderOrder = 5; scene.add(aura);
    const ringMat = own(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const ringGeo = own(new THREE.TorusGeometry(1.75, 0.035, 6, 64));
    const rings = [0, 1].map(i => { const m = new THREE.Mesh(ringGeo, ringMat); m.visible = false; scene.add(m); return m; });
    let pow = 0, powTo = 0, flareAt = -9;
    // the bot's shell is read against the dark arena by the glow behind it (no extra light: one more light in every lit
    // material cost about a tenth of the frame in the software renderer)

    // ---------- drops: the item on the floor ----------
    const dropGeo = own(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 6));
    const capGeo = own(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 6));
    const beaconGeo = own(new THREE.CylinderGeometry(0.22, 0.9, 16, 12, 1, true).translate(0, 8, 0));
    const beaconMat = () => own(new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color() }, uA: { value: 0 }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; uniform float uA; uniform float uT; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.6 + 0.4 * sin(vUv.y * 40.0 - uT * 9.0)); gl_FragColor = vec4(uC * a * uA, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const drops = [];   // { n, item, name, at, spot: V3, g, core, beacon, t0, ms, got, label }
    function makeDrop(d) {
      const col = ITEM[d.id] || '#f2c230';
      const g = new THREE.Group();
      const core = new THREE.Mesh(dropGeo, own(new THREE.MeshStandardMaterial({ color: '#141a1f', emissive: C(col), emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 })));
      const capM = own(new THREE.MeshBasicMaterial({ color: C(col, 2.2), toneMapped: false }));
      const c1 = new THREE.Mesh(capGeo, capM), c2 = new THREE.Mesh(capGeo, capM); c1.position.y = 0.62; c2.position.y = -0.62;
      const halo = new THREE.Mesh(ringGeo, own(new THREE.MeshBasicMaterial({ color: C(col, 2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
      halo.rotation.x = Math.PI / 2; halo.scale.setScalar(0.75);
      const beacon = new THREE.Mesh(beaconGeo, beaconMat()); beacon.material.uniforms.uC.value.copy(C(col));
      g.add(core, c1, c2, halo);
      scene.add(g, beacon);
      return { g, core, halo, beacon };
    }
    function spotFor(i) {
      for (let k = 0; k < SPOTS.length; k++) {
        const s = SPOTS[(i + k) % SPOTS.length].slice(), ln = o.lane && o.lane();
        if (ln) s[0] = clamp(s[0] * 0.4 + (ln[0] + ln[1]) / 2, ln[0] - 1.5, ln[1] + 1.5);
        if (Math.hypot(s[0] - M.p.x, s[1] - M.p.z) > 4.5) return new V(s[0], 0, s[1]);
      }
      return new V(SPOTS[i % SPOTS.length][0], 0, SPOTS[i % SPOTS.length][1]);
    }
    function removeDrop(dp) { scene.remove(dp.g, dp.beacon); dp.beacon.material.dispose(); dp.core.material.dispose(); if (dp.label) dp.label.remove(); const i = drops.indexOf(dp); if (i >= 0) drops.splice(i, 1); }

    // ---------- allies: the viewers' bots ----------
    const allies = [];   // { f, name, item, col, slot, state, at, p, v, lift, shotAt, keyAt, keyN, leaveAt, label }
    function spawnAlly(name, item) {
      if (!window.BotFighter || !window.BotKit) return null;
      const live = allies.filter(a => a.state !== 'out');
      if (live.length >= CAP) leave(live[0]);
      const used = new Set(allies.filter(a => a.state !== 'out').map(a => a.slot));
      let slot = 0; while (used.has(slot) && slot < POSTS.length - 1) slot++;
      let f;
      try { const b = BotKit.random(name); f = BotFighter.create(T3, b.id, { ...b.look, color: ITEM[item] || '#f2c230' }, { gap: 8, scale: 0.86, lite: true, roam: true }); } catch (e) { return null; }
      const sd = POSTS[slot][0] < 0 ? -1 : 1;
      faceVecs(M.yaw);
      // down out of the sky on its side of Art
      const p = new V().copy(M.p).addScaledVector(right, sd * 12).addScaledVector(fwd, 3); p.y = 17;
      f.group.position.copy(p);
      scene.add(f.group);
      const a = { f, name, item, col: ITEM[item] || '#f2c230', slot, state: 'in', at: t, p, from: p.clone(), v: new V(), shotAt: t + 1.6, keyAt: t + 0.8, keyN: 0, leaveAt: t + 12, label: label(name, ITEM[item]) };
      allies.push(a);
      return a;
    }
    function leave(a) { if (a.state === 'out') return; a.state = 'out'; a.at = t; }
    const postOf = (a, out) => {
      const P = POSTS[a.slot]; faceVecs(M.yaw);
      out.copy(M.p).addScaledVector(right, P[0]).addScaledVector(fwd, -P[2]);
      out.y = M.lift + P[1] + Math.sin(t * 1.3 + a.slot * 2) * 0.35;
      out.x += Math.sin(t * 0.9 + a.slot) * 0.7; out.z += Math.cos(t * 0.7 + a.slot * 1.7) * 0.5;
      return out;
    };
    // an ally's shot at the boss, in the item's colour
    function allyShot(a) {
      const tier = a.item === 'overclock' ? 2 : 1;
      a.f.attack(tier - 1);
      const from = a.f.muzzle(new V());
      const jit = new V(rnd(-1.6, 1.6), rnd(-1, 1.6), rnd(-1, 1));
      const k = a.slot;
      setTimeout(() => {
        if (!o.fx) return;
        o.fx.shot(tier, from, out => o.target(out, k).add(jit), at => {
          if (a.item === 'slowmo') K.fx.shock(at, C(a.col), 0.3, 3.2, 0.5, { flat: false, face: cam.p });
          else K.fx.burst(at, a.item === 'hype' ? 22 : 12, a.col, { speed: 7, g: 4, life: 0.45, size: 0.26 });
        }, { color: a.col, flash: 0.55, dur: 0.2 });
        if (o.sfx) o.sfx('ally');
      }, 75);
    }
    // the hand-over: a stream of light in the item's colour from the ally into Art's bot
    function handOver(a) {
      const from = a.f.muzzle(new V()), to = bodyAt(new V());
      for (let i = 0; i < 40; i++) {
        v1.lerpVectors(from, to, Math.random() * 0.3).add(v2.set(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4)));
        K.fx.spark(v1, new V(), C(a.col, 1.4), { size: rnd(0.2, 0.38), end: 0.08, life: rnd(0.35, 0.7), drag: 0, to: to.clone() });
      }
      a.f.attack(0);
    }

    // ---------- names: small labels over the drops and the allies, kept off the HUD ----------
    const layer = document.createElement('div'); layer.className = 'sb-allies'; layer.setAttribute('aria-hidden', 'true');
    if (o.host) o.host.append(layer);
    function label(name, col) { const e = document.createElement('span'); e.className = 'sb-ally'; e.textContent = name; e.style.setProperty('--c', col || '#f2c230'); layer.append(e); return e; }
    let hud = [], hudAt = -9;
    function hudRects() {
      if (!o.host) return [];
      const r0 = o.host.getBoundingClientRect();
      return [...o.host.querySelectorAll('.sb-type, .sb-top, .sb-artbox, .sb-ticker, .sb-dps, .sb-alerts > *, .sb-banner:not([hidden]), .sb-code:not([hidden])')]
        .map(e => e.getBoundingClientRect()).filter(r => r.width > 0).map(r => ({ x0: r.left - r0.left - 6, y0: r.top - r0.top - 6, x1: r.right - r0.left + 6, y1: r.bottom - r0.top + 6 }));
    }
    function place(el, world, cam3) {
      if (!el || !o.host) return;
      v3.copy(world).project(cam3);
      const w = o.host.clientWidth, h = o.host.clientHeight, x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
      const lw = el.offsetWidth || 60, lh = el.offsetHeight || 18;
      const off = v3.z > 1 || x - lw / 2 < 0 || x + lw / 2 > w || y - lh < h * 0.13 || y > h || hud.some(r => x + lw / 2 > r.x0 && x - lw / 2 < r.x1 && y > r.y0 && y - lh < r.y1);
      el.style.opacity = off ? 0 : '';
      if (!off) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }

    // ---------- the crowd: distant bots circling behind the boss ----------
    const CROWD = 12;
    let crowd = null;
    try { if (window.BotKit && BotKit.crowd) { crowd = BotKit.crowd(THREE, CROWD); crowd.meshes.forEach(m => { m.count = CROWD; scene.add(m); }); } } catch (e) { crowd = null; }
    const crowdSeed = Array.from({ length: CROWD }, (_, i) => ({ a: i / CROWD * Math.PI * 2 + rnd(-0.2, 0.2), r: rnd(24, 34), y: rnd(9, 16), w: rnd(0.1, 0.18) * (i % 3 ? 1 : -1), c: new THREE.Color(['#8cff58', '#5cc8ff', '#ffb000', '#b48cff', '#ff7ad9', '#3effc8'][i % 6]).multiplyScalar(2.2) }));
    if (crowd) crowdSeed.forEach((s, i) => crowd.meshes[2].setColorAt(i, s.c));
    let crowdN = 4;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V(), up = new V(0, 1, 0);
    function updateCrowd(snap) {
      if (!crowd) return;
      const hype = snap && snap.hype ? clamp(snap.hype.n / Math.max(1, snap.hype.goal), 0, 1) : 0;
      const want = snap && (snap.status === 'fight' || snap.status === 'finish') ? Math.round(4 + hype * 8) : snap && snap.status === 'won' ? CROWD : 4;
      crowdN += clamp(want - crowdN, -0.02, 0.02);
      o.focus(v2);
      crowdSeed.forEach((s, i) => {
        const a = s.a + t * s.w, on = i < crowdN ? 1 : clamp(1 - (i - crowdN), 0, 1);
        v1.set(v2.x + Math.cos(a) * s.r, s.y + Math.sin(t * 0.8 + i) * 0.8, v2.z - 10 + Math.sin(a) * s.r * 0.42);
        q.setFromAxisAngle(up, Math.atan2(-Math.sin(a) * Math.sign(s.w), 0.42 * Math.cos(a) * Math.sign(s.w)));
        sc.setScalar(0.7 * on);
        m4.compose(v1.setY(v1.y - 2.3 * 0.7), q, sc);
        crowd.meshes.forEach(m => m.setMatrixAt(i, m4));
      });
      crowd.meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }

    // ---------- events ----------
    function event(n, d = {}, snap) {
      if (n === 'key' && bot) { if (d.good) { keys++; bot.key(d.finish ? 1 : keys / (keys + 4)); } else { bot.typo(); jink(rnd(-1, 1) * 1.5, 1.5); } }
      if (n === 'hit' && bot && d.src !== 'spell' && d.src !== 'sever') {
        bot.attack(clamp((d.tier || 1) - 1, 0, 3)); keys = 0;
        // every word jinks the bot: a flit to the side, a little forward on big hits
        if (mode !== 'chase') { faceVecs(M.yaw); const s = Math.random() < 0.5 ? -1 : 1; jink(right.x * s * 3.2, right.z * s * 3.2 + (d.crit ? -1.5 : 0), rnd(-0.6, 1)); }
        if ((d.tier || 1) >= 4 || d.crit) flareAt = t;
      }
      if (n === 'cast' && bot) { bot.spell(); keys = 0; M.liftV += 2.4; }
      if (n === 'hurt' && bot) {
        // knocked back across the arena: harder for heavy hits, sparks off the bot
        const heavy = d.amount >= 12;
        o.focus(v1); v2.set(M.p.x - v1.x, 0, M.p.z - v1.z).normalize();
        const k = heavy ? 11 : d.amount >= 6 ? 6.5 : 3.5;
        jink(v2.x * k + rnd(-3, 3), v2.z * k, heavy ? -2.5 : -1);
        bot.hit(new V(0, 0, -1), heavy ? 1.3 : 0.7);
        bodyAt(v3);
        K.fx.burst(v3, heavy ? 46 : 18, '#ff6b78', { speed: heavy ? 15 : 9, g: 9, life: 0.6, size: 0.3 });
        K.fx.burst(v3, heavy ? 22 : 8, '#ffffff', { speed: heavy ? 18 : 11, g: 6, life: 0.3, size: 0.2 });
        holdUntil = t + (heavy ? 0.9 : 0.4);
      }
      if ((n === 'miss' || n === 'comboDrop') && bot) { o.focus(v1); v2.set(M.p.x - v1.x, 0, M.p.z - v1.z).normalize(); jink(v2.x * 2.6, v2.z * 2.6, -0.5); if (n === 'comboDrop' && pow > 0.2) { bodyAt(v3); K.fx.burst(v3, 30, '#3ee6ff', { speed: 6, g: 3, life: 0.5, size: 0.25 }); } }
      if (n === 'block' && bot) {
        // braced in the hex shield, then weaves past the attack
        bot.block(); lastBlockT = t;
        const tg = snap && snap.targets && snap.targets.find(x => x.id === d.id);
        weaveQ = { at: t + 0.16, kind: WEAVE_V[variants[d.attack]] || WEAVE[d.attack] || 'roll', early: tg && tg.total ? tg.left / tg.total : 0.5 };
      }
      if (n === 'shielded' && bot) bot.block();
      if (n === 'tier' && bot && d.tier > tier) { flareAt = t; bodyAt(v3); K.fx.shock(v3, C('#3ee6ff'), 0.5, 3.4, 0.45, { flat: false, face: cam.p, w: 0.25 }); K.fx.burst(v3, 40, '#bff6ff', { speed: 8, g: 1, life: 0.6, size: 0.28 }); if (o.sfx) o.sfx('powerup', d.tier); }
      if (n === 'win' && bot) { bot.victory(); allies.forEach(a => a.f.victory()); }
      if (n === 'lose' && bot) { bot.ko(); allies.forEach(leave); }
      if (n === 'go' || n === 'countdown') { if (bot) { bot.rise(); bot.clear(); } }
      // a viewer's item drops into the arena, and the viewer's bot flies in with it
      if (n === 'drop' && d.kind === 'support') {
        const a = spawnAlly(d.buyer, d.id);
        if (d.ms > 0) {
          const spot = spotFor(d.spot || 0), vis = makeDrop(d);
          const dp = { n: d.drop, item: d.id, name: d.buyer, spot, t0: t, ms: d.ms / 1000, got: false, ally: a, ...vis, label: label(d.buyer, ITEM[d.id]) };
          dp.g.position.copy(spot).setY(16); dp.beacon.position.copy(spot);
          drops.push(dp);
          // the bot sets off for it: the rules time the trip, so it lands on the pickup
          chase = { dp, from: M.p.clone(), t0: t, len: Math.max(0.35, dp.ms - 0.12), side: Math.random() < 0.5 ? -1 : 1 };
          mode = 'chase';
        }
      }
      if (n === 'support' && d.drop) {
        const dp = drops.find(x => x.n === d.drop);
        if (dp) {
          v1.copy(dp.g.position);
          K.fx.burst(v1, 34, ITEM[dp.item] || '#f2c230', { speed: 9, g: 4, life: 0.6, size: 0.26 });
          K.fx.shock(v2.copy(dp.spot).setY(0.12), C(ITEM[dp.item] || '#f2c230'), 0.5, 7, 0.55);
          K.fx.light(v1, ITEM[dp.item] || '#f2c230', 30, 6);
          if (dp.ally && dp.ally.state !== 'out') { handOver(dp.ally); dp.ally.leaveAt = t + 9; }
          removeDrop(dp);
        }
        if (chase && chase.dp === dp) { chase = null; mode = 'flit'; M.nextAt = t + 0.5; }
        flareAt = t;
      }
    }

    // ---------- the frame ----------
    function update(time, dt, c = {}) {
      t = time;
      const snap = c.snap;
      if (snap && snap.art) { wpm = snap.art.wpm || 0; combo = snap.art.combo || 0; tier = snap.art.tier || 0; }
      if (bot) bot.setWpm(wpm);
      const fight = snap && (snap.status === 'fight' || snap.status === 'finish');
      o.focus(foc); v1.copy(foc);
      // ---------- where the bot wants to be ----------
      let w = 3.0, gx = M.goal.x, gz = M.goal.z, gl = M.goalLift;
      const threat = c.threatIn != null && c.threatIn < 1.6;
      if (c.lost) { gl = -1.4; w = 2; }
      else if (c.dead) { gx = o.lane && o.lane() ? (o.lane()[0] + o.lane()[1]) / 2 : 0; gz = 13.5; gl = 1.6 + o.liftK(); w = 1.6; }
      else if (c.finishing) { gx = Math.sin(t * 0.7) * 1.2 + (o.lane && o.lane() ? (o.lane()[0] + o.lane()[1]) / 2 : 0); gz = 12.2; gl = 1.5 + o.liftK(); w = 2.2; }
      else if (chase) {
        // the drop chase: along a curve to the item, weaving, arriving as the rules hand it over
        const u = clamp((t - chase.t0) / chase.len, 0, 1), e = sm(u);
        faceVecs(M.yaw);
        gx = chase.from.x + (chase.dp.spot.x - chase.from.x) * e;
        gz = chase.from.z + (chase.dp.spot.z - chase.from.z) * e;
        const bow = Math.sin(u * Math.PI) * 2.2 * chase.side + Math.sin(u * Math.PI * 3) * 0.6;
        v2.set(chase.dp.spot.z - chase.from.z, 0, -(chase.dp.spot.x - chase.from.x)).normalize();
        gx += v2.x * bow; gz += v2.z * bow;
        gl = 0.25 + Math.sin(u * Math.PI) * 1.3;
        w = 7;
      } else {
        if (t >= M.nextAt && t >= holdUntil) pickGoal();
        // never still: a sway on top of the goal, wider the faster he types
        const s = window.BotFighter ? BotFighter.stanceOf(wpm) : 1, k = (threat ? 0.45 : 1) * (0.6 + s * 0.2) * (o.lane && o.lane() ? 0.6 : 1);
        gx += Math.sin(t * 1.15 + M.sway) * 1.1 * k + Math.sin(t * 2.7) * 0.35 * k;
        gz += Math.sin(t * 0.83 + M.sway * 2) * 0.8 * k;
        gl += Math.sin(t * 1.6 + M.sway) * 0.45 * k;
        w = threat ? 2.2 : 3.0;
      }
      // a queued weave past an attack that was blocked
      if (weaveQ && t >= weaveQ.at && bot) {
        const sd = Math.random() < 0.5 ? -1 : 1, k = weaveQ.kind;
        faceVecs(M.yaw);
        if (k === 'duck') { bot.move('duck', { len: 0.42 }); jink(right.x * sd * 4, right.z * sd * 4, -3); }
        else if (k === 'leap') { bot.move('leap', { len: 0.5 }); jink(right.x * sd * 2, right.z * sd * 2, 5); }
        else if (k === 'thread') { bot.move('sidestep', { len: 0.34, side: sd }); jink(right.x * sd * 6, right.z * sd * 6, 1.5); weaveQ = { at: t + 0.28, kind: 'thread2', side: -sd }; }
        else if (k === 'lunge3') { bot.move('duck', { len: 0.4 }); jink(right.x * sd * 3, right.z * sd * 3, -3.5); weaveQ = { at: t + 0.2, kind: 'roll2', side: -sd }; }
        else if (k === 'roll2') { bot.dodge(weaveQ.side); jink(right.x * weaveQ.side * 8, right.z * weaveQ.side * 8, 2.5); weaveQ = { at: t + 0.22, kind: 'thread2', side: sd }; }
        else if (k === 'thread2') { bot.move('sidestep', { len: 0.34, side: weaveQ.side }); jink(right.x * weaveQ.side * 7, right.z * weaveQ.side * 7, -1); }
        else { bot.dodge(sd); jink(right.x * sd * 7.5, right.z * sd * 7.5, sd > 0 ? 2 : -1); }
        if (o.sfx) o.sfx('whoosh', 1);
        if (!weaveQ || weaveQ.at <= t) weaveQ = null;
      }
      // the spring (slightly loose, so a jink overshoots and settles)
      const z = 0.82;
      M.v.x += ((gx - M.p.x) * w * w - 2 * z * w * M.v.x) * dt;
      M.v.z += ((gz - M.p.z) * w * w - 2 * z * w * M.v.z) * dt;
      M.liftV += ((gl - M.lift) * w * w - 2 * z * w * M.liftV) * dt;
      M.p.x += M.v.x * dt; M.p.z += M.v.z * dt; M.lift += M.liftV * dt;
      // the walls of its patch: soft, so a knock-back slides along them
      const ln = o.lane && o.lane(), xl = ln ? ln[0] - 1.5 : -ZONE.x, xh = ln ? ln[1] + 1.5 : ZONE.x;
      if (M.p.x < xl || M.p.x > xh) { M.p.x = clamp(M.p.x, xl, xh); M.v.x *= -0.3; }
      if (M.p.z < ZONE.zNear) { M.p.z = ZONE.zNear; M.v.z = Math.abs(M.v.z) * 0.3; }
      if (M.p.z > ZONE.zFar) { M.p.z = ZONE.zFar; M.v.z = -Math.abs(M.v.z) * 0.3; }
      if (!c.lost) M.lift = clamp(M.lift, ZONE.lo - (chase ? 0.4 : 0), ZONE.hi + 1 + o.liftK());
      art.set(M.p.x, 0.9, M.p.z);
      // it faces the boss, turning smoothly
      const yawTo = Math.atan2(v1.x - M.p.x, v1.z - M.p.z);
      let dy = yawTo - M.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      M.yaw += dy * Math.min(1, dt * 6);
      if (bot) { bot.group.position.set(M.p.x, Math.max(-1.2, M.lift), M.p.z); bot.group.rotation.y = M.yaw; bot.update(dt); }
      bodyAt(v2);
      // the camera's subject trails the bot a little, so the frame breathes instead of locking on
      const cw = 2.6;
      cam.v.addScaledVector(v3.copy(v2).sub(cam.p), cw * cw * dt).addScaledVector(cam.v, -2 * cw * dt);
      cam.p.addScaledVector(cam.v, dt);

      // ---------- the power aura ----------
      powTo = fight ? clamp(tier / 3, 0, 1) * (0.55 + 0.45 * clamp(combo / 60, 0, 1)) : 0;
      pow += (powTo - pow) * Math.min(1, dt * 3);
      const fl = Math.max(0, 1 - (t - flareAt) / 0.5);
      aura.position.copy(v2);
      aura.material.opacity = clamp(0.1 + pow * 0.22 + fl * 0.35, 0, 0.6) * (c.lost ? 0 : 1);
      aura.material.color.copy(C('#3ee6ff')).lerp(new THREE.Color(1, 1, 1), clamp(pow * 0.25 + fl * 0.3, 0, 1));
      aura.scale.setScalar(2.8 + pow * 1.5 + fl * 1.6 + Math.sin(t * 9) * 0.12 * pow);
      aura.visible = aura.material.opacity > 0.01;
      ringMat.opacity = clamp((pow - 0.3) * 1.2 + fl * 0.4, 0, 0.85);
      rings.forEach((r, i) => {
        r.visible = ringMat.opacity > 0.01;
        if (!r.visible) return;
        r.position.copy(v2);
        r.rotation.set(Math.PI / 2 + Math.sin(t * 1.3 + i * 2) * 0.5, t * (i ? -2.1 : 1.7), Math.cos(t * 1.1 + i) * 0.4);
        r.scale.setScalar(1 + pow * 0.35 + i * 0.18 + fl * 0.5);
      });
      if (pow > 0.6 && Math.random() < dt * 30 * pow) K.fx.spark(v3.copy(v2).add(v1.set(rnd(-1, 1), rnd(-1, 0.5), rnd(-1, 1))), v1.set(rnd(-0.3, 0.3), rnd(2.5, 4.5), rnd(-0.3, 0.3)), C(pow > 0.9 ? '#ffffff' : '#7ff0ff', 1.4), { size: 0.22, end: 0.04, life: 0.7, drag: 1 });

      // ---------- drops ----------
      for (const dp of drops.slice()) {
        const u = clamp((t - dp.t0) / 0.55, 0, 1);
        const y = 16 - 14.2 * u * u;
        dp.g.position.set(dp.spot.x, u < 1 ? y : 1.8 + Math.sin(t * 3 + dp.n) * 0.18, dp.spot.z);
        dp.g.rotation.y = t * 2.2;
        dp.halo.rotation.z = t * 3; dp.halo.scale.setScalar(0.75 + Math.sin(t * 6) * 0.06);
        dp.beacon.material.uniforms.uA.value = u < 1 ? u * 0.6 : 0.6 + Math.sin(t * 5) * 0.15; dp.beacon.material.uniforms.uT.value = t;
        if (u >= 1 && !dp.landed) { dp.landed = true; K.fx.shock(v1.copy(dp.spot).setY(0.12), C(ITEM[dp.item] || '#f2c230'), 0.4, 4.5, 0.5); K.fx.burst(v1.setY(0.5), 20, ITEM[dp.item] || '#f2c230', { speed: 6, up: 2, g: 8, life: 0.6, size: 0.25 }); }
        // a fight that ended clears what is left on the floor
        if (t - dp.t0 > dp.ms + 3) removeDrop(dp);
      }

      // ---------- allies ----------
      for (const a of allies.slice()) {
        const f = a.f;
        if (a.state === 'in') {
          // a swoop in: fast, then easing into its post
          const u = clamp((t - a.at) / 1.3, 0, 1), e = 1 - Math.pow(1 - u, 3);
          postOf(a, v1); v3.copy(a.p);
          a.p.lerpVectors(a.from, v1, e); a.p.y += Math.sin(u * Math.PI) * 2.5;
          a.v.copy(a.p).sub(v3).divideScalar(Math.max(1e-3, dt));
          if (u >= 1) { a.state = 'fight'; a.v.set(0, 0, 0); }
          f.group.position.copy(a.p);
        } else if (a.state === 'fight') {
          postOf(a, v1);
          a.v.addScaledVector(v3.copy(v1).sub(a.p), 9 * dt).multiplyScalar(Math.max(0, 1 - 4 * dt));
          a.p.addScaledVector(a.v, dt);
          f.group.position.copy(a.p);
          // it types too: its orb fills, then a shot
          if (fight && t >= a.keyAt) { a.keyN++; f.key(clamp(a.keyN / 5, 0, 1)); a.keyAt = t + rnd(0.1, 0.2); }
          if (fight && t >= a.shotAt) { allyShot(a); a.keyN = 0; a.shotAt = t + (a.item === 'overclock' ? rnd(0.7, 1.1) : rnd(1.1, 1.8)); a.keyAt = t + 0.3; }
          if (t >= a.leaveAt || (snap && snap.status === 'lost')) leave(a);
        } else {
          // off and away: up and out the side it came in
          const u = (t - a.at) / 1.2;
          faceVecs(M.yaw);
          a.v.addScaledVector(right, (POSTS[a.slot][0] < 0 ? -1 : 1) * 22 * dt).add(v3.set(0, 30 * dt, 0)).addScaledVector(fwd, 6 * dt);
          a.p.addScaledVector(a.v, dt); f.group.position.copy(a.p);
          if (u >= 1) { scene.remove(f.group); f.dispose(); if (a.label) a.label.remove(); allies.splice(allies.indexOf(a), 1); continue; }
        }
        // allies face the boss when fighting, their way of travel otherwise
        const ay = a.state === 'fight' ? Math.atan2(foc.x - a.p.x, foc.z - a.p.z) : Math.atan2(a.v.x, a.v.z) || M.yaw;
        let dd = ay - f.group.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        f.group.rotation.y += dd * Math.min(1, dt * 5);
        f.update(dt);
      }
      updateCrowd(snap);
    }
    // labels need the camera after it moves for the frame
    function labels(cam3) {
      if (t - hudAt > 0.5) { hud = hudRects(); hudAt = t; }
      for (const dp of drops) place(dp.label, v1.copy(dp.g.position).setY(dp.g.position.y + 1.4), cam3);
      for (const a of allies) place(a.label, a.f.bot.body.getWorldPosition(v1).setY(v1.y + 1.5), cam3);
    }

    function clear() {
      for (const dp of drops.slice()) removeDrop(dp);
      for (const a of allies.splice(0)) { scene.remove(a.f.group); a.f.dispose(); if (a.label) a.label.remove(); }
      chase = null; mode = 'flit'; weaveQ = null;
    }
    function dispose() {
      clear();
      if (bot) { scene.remove(bot.group); bot.dispose(); bot = null; }
      scene.remove(aura, ...rings);
      if (crowd) { crowd.meshes.forEach(m => scene.remove(m)); crowd.dispose(); }
      layer.remove();
      keep.forEach(x => x.dispose && x.dispose());
    }
    return {
      get art() { return bot; },
      aim: out => bodyAt(out),
      // a blocked attack stops a little in front of the bot, toward the boss
      shieldAt: out => { bodyAt(out); faceVecs(M.yaw); return out.addScaledVector(fwd, 3.2).setY(out.y - 0.4); },
      muzzle: out => (bot ? bot.muzzle(out) : out.set(M.p.x, M.lift + 3, M.p.z)),
      yaw: () => M.yaw,
      subject: out => out.copy(cam.p),
      chase: () => (chase ? { to: chase.dp.spot, left: chase.len - (t - chase.t0) } : null),
      power: () => pow,
      event, update, labels, clear, dispose, variant: (attack, v) => { variants[attack] = v; },
      info: () => ({ variants: { ...variants }, mode, p: [+M.p.x.toFixed(2), +M.lift.toFixed(2), +M.p.z.toFixed(2)], pow: +pow.toFixed(2), allies: allies.map(a => ({ name: a.name, item: a.item, state: a.state })), drops: drops.map(d => d.item), crowd: Math.round(crowdN) }),
    };
  }
  return { create, ITEM };
})();
