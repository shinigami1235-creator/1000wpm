// BotFighter (28 Nov 2026): a BotKit bot that fights from the keyboard, for Duel and Party.
// Gid: "on duel i think it's bot vs bot... they fly around and attack and dodge." Every move hangs off a
// typing event, never a timer:
//   each correct key   key(frac)   the bot winds up: pulls back, its glow and signature part charge with the word
//   word finished      attack(tier) the strike leaves at once, since the wind-up happened while typing (75 ms in)
//   combo tier         tier 0 a shot, 1 a double, 2 a dashing strike, 3 the dash with a flurry
//   spell              spell()     rises, flares, then drives at the other bot (the one cutaway in a fight)
//   your word lands while a shot comes at you   dodge(side)   a barrel roll aside
//   block              block()     braces into the hex shield
//   typo               typo()      a glitch: jitter, flicker, dizzy face, a short drop
//   miss               miss()      a head shake
//   no keys for 2 s    (automatic) drifts back to its spot and calms down
// Live wpm sets a stance (setWpm): under 40 it hangs back and lobs, 40-80 circles mid range, 80-120 strafes in
// close, over 120 stays in the other bot's face. Every move is 0.3 s or less and the next one cancels it, so a
// 150 wpm typist (about 2.5 words a second) never sees the bot fall behind the keyboard.
//
//   const f = BotFighter.create(THREE, 'nova', look, { gap: 14 })   gap: the distance to the other bot
//   scene.add(f.group)   place f.group at the bot's spot, turned so local +z points at the other bot
//   f.update(dt)         every frame
//   f.muzzle(out)        where a shot leaves from (world)
//   f.hold(frac)         Showdown: a finished word adds a spark that stays, the orb holds at frac until attack()
//   f.clear()            drops the charge and every spark (a new round)
//   f.pose(name, u)      a frozen frame for stills: 'ready' | 'charge' | 'attack' | 'combo' | 'dodge' | 'block' | 'typo' | 'spell' | 'ko'
window.BotFighter = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const ramp = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const env = (u, a, b, c) => (u < a || u > c ? 0 : u < b ? sm(ramp(u, a, b)) : 1 - sm(ramp(u, b, c)));   // up a to b, down b to c
  const snap = (u, a, b, c) => (u < a || u > c ? 0 : u < b ? Math.sin(ramp(u, a, b) * Math.PI / 2) : 1 - sm(ramp(u, b, c)));   // a fast out, a slow return
  const TAU = Math.PI * 2;
  const STANCE = [   // advance (share of the gap), strafe width, strafe speed
    { adv: 0.0, sw: 0.5, sp: 0.6 }, { adv: 0.12, sw: 1.1, sp: 0.9 }, { adv: 0.24, sw: 1.6, sp: 1.3 }, { adv: 0.33, sw: 1.9, sp: 1.8 }];
  const stanceOf = w => (w < 40 ? 0 : w < 80 ? 1 : w < 120 ? 2 : 3);
  const LEN = { attack: 0.3, combo: 0.34, dodge: 0.3, block: 0.42, miss: 0.4, spell: 0.95 };
  const RELEASE = 0.25;   // the share of an attack at which the shot leaves

  // each bot's strike, written into P at u (0..1); A grows with the combo tier, dash is tier 2 and up
  const STRIKE = {
    // Orbit, the shield: a bash, the halo flaring wide on the hit
    orbit(u, P, A, dash) { const s = snap(u, 0.08, 0.3, 1); P.z += (dash ? 1.9 : 1.0) * A * s - 0.3 * env(u, 0, 0.08, 0.3); P.rx += 0.5 * s; P.halo += 0.8 * s; P.glow += 1.2 * s; },
    // Pixel, precision: holds still, fires, kicks back off the shot; a combo fires twice
    pixel(u, P, A, dash) { const k = snap(u, 0.2, 0.28, 0.75) + (A > 1.1 ? 0.8 * snap(u, 0.5, 0.58, 1) : 0); P.z -= 0.45 * A * k - (dash ? 1.2 * env(u, 0, 0.2, 0.9) : 0); P.rx -= 0.35 * k; P.y += 0.12 * env(u, 0, 0.2, 0.8); P.glow += 1.6 * k; P.ant += k; },
    // Nova, the striker: its four blades whirl like a saw as it darts in
    nova(u, P, A, dash) { const s = snap(u, 0.05, 0.35, 1); P.z += (dash ? 2.2 : 1.1) * A * s; P.spinZ -= TAU * (dash ? 2 : 1) * sm(ramp(u, 0.02, 0.6)); P.rx += 0.3 * s; P.glow += 1.4 * s; },
    // Kite, the ghost: a blink, a streak forward and to the side, a cut on the way back
    kite(u, P, A, dash) { const b = env(u, 0.05, 0.2, 0.4), out = snap(u, 0.2, 0.3, 1); P.sx -= 0.75 * b; P.sy += 0.5 * b; P.z += (dash ? 2.2 : 1.3) * A * out; P.x += 0.7 * out; P.rz -= 0.7 * env(u, 0.25, 0.4, 0.8); P.hat += 0.4 * out; P.glow += 2 * b; },
    // Beep, the architect: a hop, then the pod fires with the ears flat back
    beep(u, P, A, dash) { const hop = env(u, 0, 0.22, 0.7), k = snap(u, 0.22, 0.3, 0.9); P.y += 0.45 * hop; P.z -= 0.35 * k * A - (dash ? 1.3 * env(u, 0.1, 0.3, 0.95) : 0); P.rx -= 0.3 * k; P.ears += 1.2 * hop; P.glow += 1.4 * k; },
    // Raze, the hunter: rears up on its legs and pounces
    raze(u, P, A, dash) { const up = env(u, 0, 0.14, 0.35), s = snap(u, 0.14, 0.32, 1); P.y += 0.6 * up - 0.35 * s; P.z += (dash ? 2.1 : 1.2) * A * s; P.rx += -0.5 * up + 0.55 * s; P.legs += -1 * up + 0.8 * s; P.glow += 1.2 * s; },
  };

  // the core: white in the middle through the glow colour to clear
  function coreTex(THREE) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // a soft dot for the sparks, or a small rounded keycap
  function radialTex(THREE, kind) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    if (kind === 'cap') {
      const gr = c.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(19, 19, 26, 26, 6); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.roundRect(24, 22, 16, 14, 4); c.fill();
    } else {
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function create(THREE, id, look = {}, o = {}) {
    const bot = BotKit.create(THREE, id, { ...look, scale: o.scale || 1, lite: o.lite, color: look.color || o.color });
    const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig); rig.add(bot.group);
    const HOVER = BotKit.HOVER, gap = o.gap || 12, V = THREE.Vector3, parts = bot.parts || {};
    const strike = STRIKE[id] || STRIKE.orbit;
    let t = Math.random() * 10, lastKey = -9, charge = 0, chargeTo = 0, kick = 0;
    let act = null, react = null, hitAt = -9, hitPow = 0, koAt = null, winAt = null, wpm = 0, stance = 0, sNow = 0, held = 0;
    const P = {}, S = {}, KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'glow', 'halo', 'ant', 'hat', 'ears', 'legs', 'spinZ', 'orb', 'flash', 'shield'];
    const zero = () => KEYS.forEach(k => { P[k] = 0; });
    zero(); KEYS.forEach(k => { S[k] = 0; });
    const vel = new V(), prev = new V(), wv = new V();
    // the charge: a ball of the bot's glow at its front that grows with the word and flashes as the shot leaves,
    // with a ring turning round it. The block: a hex shield in front of it.
    const fxc = (BotKit.FX[look.color] && BotKit.FX[look.color].base) || look.color || o.color || '#8cff58';
    const add = (c, k, op) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const keep = [];
    const own = x => (keep.push(x), x);
    // the charge (Gid: gradients, transparent and glowing in turns): a white-hot gradient core in front of the bot,
    // below its face, inside two shells that are clear in the middle and glow at the edge, one brightening as the
    // other fades. Sparks gather from the air round the bot into it as the word fills.
    const sparkCol = new THREE.Color(o.sparkColor || fxc);
    const CORE = new V(0, -0.45, 1.6);
    const orb = new THREE.Group(); orb.position.copy(CORE); bot.group.add(orb);
    const gradTex = own(coreTex(THREE));
    const core = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: gradTex, color: sparkCol.clone().lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    const shellMat = k => own(new THREE.ShaderMaterial({
      uniforms: { col: { value: sparkCol.clone().multiplyScalar(k) }, op: { value: 1 }, pw: { value: 2.2 } },
      vertexShader: 'varying vec3 n; varying vec3 v; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); n = normalize(normalMatrix * normal); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 col; uniform float op; uniform float pw; varying vec3 n; varying vec3 v; void main(){ float f = pow(1.0 - abs(dot(normalize(n), normalize(v))), pw); gl_FragColor = vec4(col * (f * 1.6 + 0.06), (f + 0.06) * op); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const shellA = new THREE.Mesh(own(new THREE.SphereGeometry(1, 24, 16)), shellMat(2.2)), shellB = new THREE.Mesh(own(new THREE.SphereGeometry(1, 24, 16)), shellMat(1.6));
    shellB.material.uniforms.pw.value = 1.4;
    orb.add(shellB, shellA, core);
    const sTex = own(radialTex(THREE, o.spark || 'dot'));
    const NS = 14, sparks = Array.from({ length: NS }, (_, i) => {
      const m = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: sTex, color: sparkCol.clone().multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
      m.visible = false; m.renderOrder = 7; bot.group.add(m);
      return { m, st: 0, at: 0, from: new V(), slot: i, pop: 0 };
    });
    let nLive = 0, sparkSeq = 0;
    const _a = new V();
    // where an orbit slot sits round the core: a ring that tightens as the word fills
    function slotPos(sp, out, ch) {
      const a = sp.slot * 2.399 + t * (2.2 + 3 * ch), r = 0.85 - 0.2 * ch, tilt = 0.5;
      return out.set(Math.cos(a) * r, Math.sin(a) * r * Math.cos(tilt), Math.sin(a) * r * Math.sin(tilt) * 0.6).add(CORE);
    }
    // a spark appears in the air round the bot and flies into its slot round the core
    function launch(born) {
      const sp = sparks[sparkSeq++ % NS]; if (sp.st === 1 || sp.st === 2) nLive--;
      const a = sparkSeq * 2.1 + 0.7, e = Math.sin(sparkSeq * 1.37) * 0.8;
      sp.from.set(Math.cos(a) * 1.9, e, Math.sin(a) * 1.4 + 0.4);
      sp.st = 1; sp.at = born; sp.pop = 0; nLive++;
    }
    function drawSparks(dt, ch) {
      for (const sp of sparks) {
        if (!sp.st) { sp.m.visible = false; continue; }
        const u = t - sp.at;
        sp.m.visible = true;
        if (sp.st === 1) {   // rising from the key into its slot
          const k = sm(u / 0.18); slotPos(sp, _a, ch);
          sp.m.position.lerpVectors(sp.from, _a, k); sp.m.position.y += Math.sin(k * Math.PI) * 0.25;
          sp.m.scale.setScalar(0.3 * Math.min(1, u / 0.05) + 0.1 * (1 - k)); sp.m.material.opacity = Math.min(1, u / 0.05);
          if (k >= 1) sp.st = 2;
        } else if (sp.st === 2) { slotPos(sp, sp.m.position, ch); sp.m.scale.setScalar(0.28 + 0.08 * ch); sp.m.material.opacity = 0.95; }
        else if (sp.st === 3) {   // released: pulled into the core and thrown forward with the shot
          const k = u / 0.18; if (k >= 1) { sp.st = 0; continue; }
          if (k < 0.3) sp.m.position.lerp(CORE, 0.5); else sp.m.position.z += dt * 30;
          sp.m.material.opacity = 1 - k; sp.m.scale.setScalar(0.32 * (1 - k * 0.5));
        } else if (sp.st === 4) {   // a typo: this one fizzles out
          const k = u / 0.25; if (k >= 1) { sp.st = 0; continue; }
          sp.m.scale.setScalar(0.3 + 0.5 * k); sp.m.material.opacity = (1 - k) * (Math.sin(u * 90) > 0 ? 1 : 0.3); sp.m.position.y -= dt * 0.8;
        }
      }
    }
    const releaseSparks = () => { for (const sp of sparks) if (sp.st === 1 || sp.st === 2) { sp.st = 3; sp.at = t; } nLive = 0; };
    const fizzle = () => { let last = null; for (const sp of sparks) if ((sp.st === 1 || sp.st === 2) && (!last || sp.at > last.at)) last = sp; if (last) { last.st = 4; last.at = t; nLive--; } };
    const shield = new THREE.Group(); bot.group.add(shield);
    const cap = (seg, ring) => { const g = own(new THREE.SphereGeometry(1, seg, ring, 0, TAU, 0, 1.05)); g.rotateX(Math.PI / 2); return g; };
    const hexFill = new THREE.Mesh(cap(24, 10), own(add(fxc, 0.8, 0.22))); hexFill.material.side = THREE.DoubleSide;
    const hexEdge = new THREE.Mesh(cap(6, 3), own(add(fxc, 2.4, 0.9))); hexEdge.material.wireframe = true;
    const rimG = own(new THREE.TorusGeometry(Math.sin(1.05), 0.03, 6, 48)); rimG.translate(0, 0, Math.cos(1.05));
    const hexIn = new THREE.Mesh(rimG, own(add(fxc, 2.6, 0.95)));
    shield.add(hexFill, hexEdge, hexIn);
    let face = '', strafe = 0;

    const start = (kind, extra = {}) => { act = { kind, at: t, len: LEN[kind] || 0.3, ...extra }; };
    const api = {
      group, bot, id,
      // a correct key: frac is how much of the word is typed
      key(frac = 0) { chargeTo = clamp(frac, 0, 1); kick = 1; lastKey = t; launch(t); },
      // Showdown: a finished word adds a spark that stays, and the orb holds at frac (0..1) until attack()
      hold(frac = 0, spark = true) { held = clamp(frac, 0, 1); kick = 1; lastKey = t; if (spark) launch(t); },
      // the word is done: strike now. Returns the ms until the shot leaves
      attack(tier = 0) { const combo = tier >= 2; start(combo ? 'combo' : 'attack', { A: [1, 1.2, 1.45, 1.7][clamp(tier, 0, 3)], dash: combo }); chargeTo = 0; held = 0; charge *= 0.3; lastKey = t; bot.fire(t + LEN.attack * RELEASE); releaseSparks(); return Math.round(LEN.attack * RELEASE * 1000); },
      dodge(side = Math.random() < 0.5 ? -1 : 1) { start('dodge', { side }); },
      block() { start('block'); },
      miss() { start('miss'); },
      spell() { start('spell'); chargeTo = 0; held = 0; charge = 0; releaseSparks(); },
      typo() { react = { kind: 'typo', at: t, len: 0.36 }; chargeTo *= 0.6; fizzle(); },
      hit(dir, power = 0.5) { bot.hit(dir || new V(0, 0, -1), t); hitAt = t; hitPow = clamp(power, 0.2, 1.5); },
      ko() { koAt = t; act = null; react = null; },
      rise() { koAt = null; winAt = null; },
      // drops the charge and every spark at once (a new round)
      clear() { held = 0; chargeTo = 0; charge = 0; act = null; react = null; sparks.forEach(sp => { sp.st = 0; sp.m.visible = false; }); nLive = 0; },
      victory() { winAt = t; },
      setWpm(w) { wpm = w || 0; },
      get stance() { return stance; },
      update, pose, muzzle: out => bot.body.localToWorld(out.set(0, 0, 1.15)),
      dispose: () => { keep.forEach(x => x.dispose()); bot.dispose(); },
    };

    function compute(dt) {
      zero(); face = '';
      // the stance: how far in and how wide it circles, from the live wpm; idle drifts back home
      const idle = t - lastKey > 2;
      stance = idle ? 0 : stanceOf(wpm);
      sNow += (stance - sNow) * Math.min(1, dt * 1.6);
      const lo = STANCE[Math.floor(sNow)], hi = STANCE[Math.min(3, Math.ceil(sNow))], f = sNow - Math.floor(sNow);
      const adv = lo.adv + (hi.adv - lo.adv) * f, sw = lo.sw + (hi.sw - lo.sw) * f, sp = lo.sp + (hi.sp - lo.sp) * f;
      strafe += dt * sp;
      rig.position.set(Math.sin(strafe) * sw, Math.sin(strafe * 1.7) * 0.25 * (sNow / 3), adv * gap);
      if (idle && !act) face = 'calm';

      // the charge: the word being typed winds the bot up
      charge += (chargeTo - charge) * Math.min(1, dt * 18); kick = Math.max(0, kick - dt * 9);
      if (t - lastKey > 1.2) chargeTo = 0;
      if (held > chargeTo) chargeTo = held;
      const c = charge;
      P.z += -0.45 * c + 0.08 * kick; P.rx += -0.22 * c; P.y += 0.12 * c; P.glow += 1.4 * c + 0.4 * kick;
      P.orb += c; P.halo += 0.35 * c; P.ant += 0.6 * c; P.hat += 0.15 * c; P.ears += 0.7 * c; P.legs += -0.55 * c;
      if (c > 0.65) { P.x += Math.sin(t * 61) * 0.02 * c; P.y += Math.sin(t * 53) * 0.02 * c; }   // straining
      if (c > 0.05) face = 'focus';

      if (act) {
        const u = (t - act.at) / act.len;
        if (u >= 1) act = null;
        else if (act.kind === 'attack' || act.kind === 'combo') { strike(u, P, act.A, act.dash); P.flash += snap(u, 0.12, RELEASE, 0.55) * act.A; P.orb += 0.6 * (1 - ramp(u, 0, RELEASE)); face = 'angry'; }
        else if (act.kind === 'dodge') { const s = snap(u, 0, 0.3, 1); P.x += 1.2 * act.side * s; P.y += (act.side > 0 ? 1.25 : -0.85) * s; P.z -= 0.3 * s; P.spinZ -= act.side * TAU * sm(ramp(u, 0.02, 0.7)); face = 'focus'; }
        else if (act.kind === 'block') { const b = snap(u, 0, 0.18, 1); P.rx += 0.45 * b; P.z -= 0.45 * b; P.y -= 0.15 * b; P.sy -= 0.12 * b; P.sx += 0.08 * b; P.glow += 1 * b; P.shield += b; P.halo += 0.4 * b; P.legs += 0.4 * b; face = 'focus'; }
        else if (act.kind === 'miss') { const w = env(u, 0, 0.15, 1); P.ry += Math.sin(u * TAU * 2) * 0.32 * w; P.rx -= 0.12 * w; face = 'hurt'; }
        else if (act.kind === 'spell') {
          const rise = env(u, 0, 0.45, 0.95), drive = snap(u, 0.62, 0.72, 1);
          P.y += 1.2 * rise; P.orb += 2.2 * rise * (1 - drive); P.flash += 2.2 * snap(u, 0.6, 0.68, 0.9); P.rx += -0.45 * env(u, 0, 0.45, 0.65) + 0.55 * drive; P.z += 1.4 * drive - 0.4 * env(u, 0, 0.4, 0.65);
          P.sx += 0.15 * rise; P.sy += 0.15 * rise; P.glow += 2.6 * rise + 1.5 * drive; P.halo += 1.2 * rise; P.ears += 1 * rise; P.legs -= 0.8 * rise; P.ant += rise; P.hat += 0.3 * rise;
          P.spinZ += id === 'nova' ? -TAU * 3 * sm(ramp(u, 0.1, 0.7)) : 0;
          face = 'angry';
        }
      }
      if (react) {
        const u = (t - react.at) / react.len;
        if (u >= 1) react = null;
        else {   // a typo: the bot glitches
          const w = 1 - u, j = n => Math.sin(t * (97 + n * 13) + n) * w;
          P.x += 0.18 * j(1); P.y += 0.12 * j(2) - 0.4 * env(u, 0, 0.2, 1); P.rz += 0.16 * j(3) + 0.3 * env(u, 0, 0.15, 1); P.sx += 0.12 * j(4); P.sy -= 0.12 * j(4); P.glow -= (Math.sin(t * 173) > 0 ? 1.4 : 0) * w;
          P.orb *= Math.sin(t * 131) > 0 ? 0.1 : 1; face = 'dizzy';
        }
      }
      const hu = t - hitAt;
      if (hu < 0.6) { const k = snap(hu / 0.6, 0, 0.15, 1) * hitPow; P.z -= 1.1 * k; P.y += 0.2 * k; }
      if (koAt != null) {   // knocked out of the air: tumbles down onto the floor and stays there, dark
        const k = sm((t - koAt) / 0.9);
        const raze = id === 'raze';   // Raze lands on its back with its legs in the air; the round ones on their side
        P.y += -(HOVER - (raze ? 1.25 : 1.05)) * k + Math.sin(Math.min(1, (t - koAt) / 0.9) * Math.PI) * 0.8; P.z -= 1.3 * k; P.rz += (raze ? Math.PI : id === 'kite' ? 0.75 : 1.35) * k; P.rx -= 0.3 * k; P.glow -= 1.3 * k; P.legs += raze ? 0.9 * k : 0; face = 'x';
      }
    }

    function apply(dt, now) {
      const a = now ? 1 : 1 - Math.exp(-dt * 30);
      for (const k of KEYS) S[k] = k === 'spinZ' ? P[k] : S[k] + (P[k] - S[k]) * a;
      bot.group.position.set(S.x, HOVER + S.y, S.z);
      bot.group.rotation.set(S.rx, S.ry, S.rz);
      bot.group.scale.set(1 + S.sx, 1 + S.sy, 1 + S.sx);
      // the bot leans into how it's moving through the arena
      bot.group.getWorldPosition(wv); vel.copy(wv).sub(prev).divideScalar(Math.max(1e-3, dt)); prev.copy(wv);
      if (!now) vel.applyAxisAngle(new V(0, 1, 0), -group.rotation.y); else vel.set(0, 0, 0);
      if (winAt != null) { const VP = {}; BotKit.victoryPose(look.victory || 'hop', t - winAt, VP); bot.group.position.y += VP.y; bot.group.rotation.y += VP.turn; bot.group.rotation.z += VP.tilt; bot.group.rotation.x += VP.flip; face = VP.face; bot.cheer(t, look.victory || 'hop'); }
      bot.update(t, now ? 0.016 : dt, { vel: now ? null : vel, face: face || undefined });
      bot.body.rotation.z += S.spinZ;
      // the signature parts take the charge and the strike
      if (parts.halo) { parts.halo.rotation.y += t * 6 * S.halo; parts.halo.scale.setScalar(1 + 0.45 * Math.max(0, S.halo)); }
      if (parts.ants) parts.ants.forEach(({ a, sx }) => { a.rotation.z -= sx * 0.45 * S.ant; });
      if (parts.hat) parts.hat.rotation.x += 0.5 * S.hat;
      if (parts.ribbon) parts.ribbon.rotation.x -= 1.2 * S.hat;
      if (parts.ears) parts.ears.forEach(e => { e.rotation.x -= 0.9 * S.ears; });
      if (parts.legs) parts.legs.forEach(L => { L.hip.rotation.x += 0.6 * S.legs; L.knee.rotation.x -= 0.5 * S.legs; });
      if (parts.arm) parts.arm.rotation.x -= 0.4 * clamp(S.glow, 0, 2);
      bot.glowMat.color.multiplyScalar(clamp(1 + S.glow * 0.55, 0.15, 3.5));
      const ob = Math.max(0, S.orb), fl = Math.max(0, S.flash), r0 = 0.08 + 0.34 * ob + 0.5 * fl;
      orb.visible = r0 > 0.08;
      if (orb.visible) {
        const w = Math.sin(t * 7), hot = Math.min(1, fl);   // the two shells take turns: one glows as the other clears
        core.scale.setScalar(r0 * (1.5 + 0.12 * Math.sin(t * 31)));
        shellA.scale.setScalar(r0 * (0.9 + 0.1 * w)); shellA.material.uniforms.op.value = 0.08 + 1.1 * Math.pow(0.5 + 0.5 * w, 2) + hot;
        shellB.scale.setScalar(r0 * (1.45 - 0.1 * w)); shellB.material.uniforms.op.value = 0.06 + 0.95 * Math.pow(0.5 - 0.5 * w, 2) + hot;
      }
      drawSparks(now ? 0 : dt, Math.max(0, S.orb));
      const sh = Math.max(0, S.shield); shield.visible = sh > 0.03;
      if (shield.visible) { shield.scale.setScalar(1.9 * (0.7 + 0.3 * sh)); hexFill.material.opacity = 0.22 * sh; hexEdge.material.opacity = 0.9 * sh; hexIn.material.opacity = 0.95 * sh; hexEdge.rotation.z = t * 0.8; }
    }

    function update(dt) { t += dt; compute(dt); apply(dt, false); }

    // a frozen frame for the pose sheet
    function pose(name, u = 0.5, o2 = {}) {
      act = react = null; koAt = winAt = null; hitAt = -9; charge = chargeTo = 0; kick = 0; lastKey = t;
      sNow = stance = 0; strafe = 0; wpm = 0;
      sparks.forEach(sp => { sp.st = 0; }); nLive = 0; sparkSeq = 0;
      const word = o2.word || 'keyboard', typed = name === 'charge' || name === 'typo' ? Math.round(u * word.length) : name === 'attack' || name === 'combo' ? word.length : 0;
      for (let i = 0; i < typed; i++) launch(t - 1 - (typed - i) * 0.01);
      if (o2.phase != null) t += o2.phase;
      if (name === 'charge') { charge = chargeTo = u; kick = 0.5; }
      if (name === 'typo') { charge = chargeTo = u * 0.6; fizzle(); sparks.forEach(sp => { if (sp.st === 4) sp.at = t - 0.07; }); }
      if (name === 'attack' || name === 'combo') { releaseSparks(); sparks.forEach(sp => { if (sp.st === 3) { sp.at = t - 0.07; slotPos(sp, sp.m.position, 1); sp.m.position.lerp(CORE, 0.3).z += 0.9 + sp.slot * 0.12; } }); }
      if (name === 'attack' || name === 'combo') { act = { kind: name, at: t - u * LEN[name], len: LEN[name], A: name === 'combo' ? 1.7 : 1, dash: name === 'combo' }; }
      else if (['dodge', 'block', 'miss', 'spell'].includes(name)) act = { kind: name, at: t - u * LEN[name], len: LEN[name], side: o2.side || 1 };
      if (name === 'typo') react = { kind: 'typo', at: t - 0.1, len: 0.36 };
      else if (name === 'ko') koAt = t - 2;
      compute(0); rig.position.set(0, 0, 0); apply(0, true);
    }
    return api;
  }
  return { create, STANCE, stanceOf, LEN };
})();
