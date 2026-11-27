// The six titans' choreography in Boss Rush: each attack's wind-up (anticipation pose, floor telegraph,
// charging glow, rising sound), its strike (a fast blend into the strike pose, the impact's flash, ring,
// debris and dust, a swing trail, the hit on you or the clash on your block) and the recovery, plus each
// titan's entrance and death. scene.js builds one per titan and calls it every frame.
//
//   const T = RushTitans.create({ THREE, id, kit, root, mover, tfx, you, col, col2, juice, sfx, cam })
//   T.anim(t, dt, s)     s from the scene: wind (0..1, eased), stun, move, reel
//   T.windup(atk, ms)    T.strike(landed)   T.sig(kind)   T.stage(n)   T.enter()   T.die()   T.mode()
//   T.preview(list)      hold a pose mix for review shots (tests)
window.RushTitans = (() => {
  const RED = '#ff4d5e', CYAN = '#3ee6ff', WHITE = '#ffffff';

  function create(c) {
    const { THREE, id, kit, root, mover, tfx, you } = c;
    const V = THREE.Vector3;
    const B = kit.bones, POSES = kit.POSES, ATK = (window.BossKit && BossKit.ATTACKS[id]) || {};
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    const easeIn = x => Math.pow(clamp(x, 0, 1), 2);
    const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V();
    const col = c.col, col2 = c.col2 || c.col;
    const J = c.juice, sfx = (n, a) => c.sfx && c.sfx(n, a), cam = (n, x) => c.cam && c.cam(n, x);
    const S = BossKit.BOSSES[id];

    // ---------- where things are ----------
    const scaleOf = () => root.scale.x || 1;
    const at = (bone, x = 0, y = 0, z = 0, out = v1) => { kit.bones[bone].updateWorldMatrix(true, false); return kit.bones[bone].localToWorld(out.set(x, y, z)); };
    const fist = (k, out) => at('hand' + k, 0, -S.fist * 0.6, 0, out);
    const foot = (k, out) => at('foot' + k, 0, 0, 0.5, out);
    const core = out => { kit.core.updateWorldMatrix(true, false); return kit.core.getWorldPosition(out); };
    const front = (d, out) => out.set(root.position.x, 0.05, root.position.z + d * 0.1);   // a floor point d tenths of a unit in front of it
    const bladeTip = (out, k = 9.1) => { const bl = kit.blade; if (!bl) return fist('R', out); bl.updateWorldMatrix(true, false); return bl.localToWorld(out.set(0, k, 0)); };
    const tailTip = out => { const t = kit.tail; if (!t || !t.children.length) return core(out); const m = t.children[t.children.length - 1]; m.updateWorldMatrix(true, false); return m.getWorldPosition(out); };
    const youFloor = out => out.set(you.x, 0.05, you.z);

    // ---------- a small clock for timed effects ----------
    let clock = 0;
    const timers = [];
    const later = (s, fn) => timers.push({ at: clock + s, fn });
    function runTimers() { for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    // something flying at you: a glowing bolt with a trail of sparks
    const flyers = [];
    function fly(from, to, secs, colr, onHit, arc = 1) { flyers.push({ a: from.clone(), b: to.clone(), t: 0, secs, col: colr, onHit, arc }); }
    function runFlyers(dt) {
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i]; f.t += dt / f.secs;
        const k = Math.min(1, f.t);
        v4.lerpVectors(f.a, f.b, k); v4.y += Math.sin(k * Math.PI) * f.arc;
        tfx.burst(v4, 3, { col: f.col, speed: 1.2, size: 0.35, life: 0.35, grav: 0, kind: 'glow' });
        tfx.burst(v4, 1, { col: WHITE, speed: 0.4, size: 0.6, life: 0.12, grav: 0, kind: 'glow' });
        if (f.t >= 1) { flyers.splice(i, 1); if (f.onHit) f.onHit(v4.clone()); }
      }
    }

    // ---------- shared effects ----------
    function quake(p, big = 1, colr = col) {
      const d = Math.max(4, Math.hypot(you.x - p.x, you.z - p.z) + 1);
      tfx.ring(p, 0.4, d * big, 0.6, colr, { k: 2.4 });
      tfx.ring(p, 0.2, 3.2 * big, 0.35, WHITE, { k: 1.4 });
      tfx.debris(p, Math.round(18 * big), { col: colr, speed: 8 * big, up: 5, size: 0.38, radius: 0.9 });
      tfx.burst(p, Math.round(18 * big), { kind: 'dust', col: '#a39d94', speed: 5.5, size: 2.2, life: 1.5, up: 1.5, radius: 1.2, alpha: 0.7 });
      tfx.scorch(p, 2.6 * big, colr);
      tfx.burst(p, Math.round(30 * big), { col: colr, speed: 9, up: 3, life: 0.6, size: 0.18 });
      tfx.flash(v3.copy(p).setY(1.2), colr, 1.1 * big);
      J.shake(0.55 + 0.35 * big); J.stop(70);
    }
    // the blow reaches you: red sparks and a ring at your marker (the page flashes the screen)
    function hitYou(colr = RED) {
      youFloor(v2);
      tfx.ring(v2, 0.2, 2.6, 0.45, colr, { k: 2.6 });
      tfx.burst(v3.copy(you).setY(1), 26, { col: colr, speed: 8, up: 2, life: 0.55, size: 0.2 });
      tfx.burst(v2, 8, { kind: 'dust', col: '#7d8288', speed: 3, size: 1.2, life: 1 });
      tfx.flash(v3.copy(you).setY(1.5), colr, 0.9);
    }
    // your block: a cyan barrier ring stands up in front of you and the blow throws sparks off it
    function blockYou(p) {
      v2.copy(you); v2.z -= 1.2; v2.y = 1.6;
      tfx.ring(v2, 0.3, 2.8, 0.5, CYAN, { tilt: Math.PI / 2, y: 1.6, k: 2.6 });
      tfx.ring(v2, 0.2, 1.6, 0.3, WHITE, { tilt: Math.PI / 2, y: 1.6, k: 1.5 });
      v3.set(0, 0.4, -1);
      tfx.burst(v2, 34, { col: CYAN, speed: 9, dir: v3, spread: 0.9, life: 0.5, size: 0.2 });
      tfx.flash(v2, CYAN, 0.8);
      if (p) tfx.burst(p, 16, { col: col, speed: 6, life: 0.5, size: 0.2 });
    }
    // charge glow: sparks drawn in toward a point
    function charge(p, k, colr = col) {
      if (Math.random() < 0.3 + k * 0.7) {
        v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(1.6 + k);
        v4.copy(p).add(v3); v3.negate().multiplyScalar(2.2);
        tfx.burst(v4, 1, { col: k > 0.75 ? WHITE : colr, speed: 3, dir: v3, spread: 0.05, life: 0.4, grav: 0, drag: 0, size: 0.16 + k * 0.1 });
      }
      if (Math.random() < 0.25 + k * 0.5) tfx.burst(p, 1, { col: colr, speed: 0.2, size: 0.2 + k * 0.32, life: 0.14, grav: 0, kind: 'glow', k: 1 });
    }

    // ---------- each attack ----------
    // tele: the floor telegraph (shape, where it starts, width or angle); charge(k) runs every frame of the
    // wind-up; hit(landed) runs at contact, 0.13 s into the strike; trail picks the swinging part
    const own = {
      siege: {
        fists: { tele: ['ring'], lunge: 0.4, charge: k => { charge(fist('L', v1), k); charge(fist('R', v2), k); },
          hit: L => { front(26, v1); quake(v1, 1.25); later(0.06, () => { front(26, v1); tfx.ring(v1, 1, 9, 0.8, col, { k: 1.4 }); }); }, snd: ['siegeCharge', 'siegeSlam'] },
        hook: { tele: ['fan', 0.85], lunge: 0.3, trail: 'handR', charge: k => charge(fist('R', v1), k),
          hit: L => { fist('R', v1); tfx.burst(v1, 26, { col, speed: 10, dir: v3.set(-1, 0.2, 0.6), spread: 0.6, life: 0.5 }); tfx.debris(v1.setY(1), 6, { col, speed: 8, dir: v3.set(-1, 0.4, 0.8) }); J.shake(0.6); J.stop(60); }, snd: ['siegeCharge', 'swing'] },
        stomp: { tele: ['lane', 1.1], lunge: 0.1, charge: k => charge(foot('R', v1), k),
          hit: L => { foot('R', v1); quake(v1, 0.85); const a = v1.clone(); for (let i = 1; i <= 6; i++) later(i * 0.05, () => { v2.lerpVectors(a, youFloor(v3), i / 6.5); tfx.debris(v2, 3, { col, speed: 6, up: 5, size: 0.3 }); tfx.burst(v2, 3, { kind: 'dust', col: '#8a8f96', speed: 2.5, size: 1.3, life: 1 }); tfx.burst(v2, 6, { col, speed: 6, up: 4, life: 0.4 }); }); }, snd: ['stompCharge', 'quake'] },
      },
      warden: {
        bash: { tele: ['lane', 1.3], lunge: 2.4, charge: k => { at('foreL', -2.1, -2.4, 0.15, v1); charge(v1, k, CYAN); },
          hit: L => { at('foreL', -2.1, -2.4, 0.15, v1); tfx.ring(v1, 0.3, 3.5, 0.4, col, { tilt: Math.PI / 2, y: v1.y, k: 2.4 }); tfx.burst(v1, 30, { col, speed: 9, dir: v3.set(0, 0.2, 1), spread: 0.8, life: 0.45 }); tfx.flash(v1, col, 1); J.shake(0.7); J.stop(80); }, snd: ['shieldCharge', 'shieldBash'] },
        sweep: { tele: ['fan', 1.0], lunge: 0.6, trail: 'blade', charge: k => charge(bladeTip(v1, 7), k),
          hit: L => { bladeTip(v1, 6); tfx.burst(v1, 30, { col, speed: 10, dir: v3.set(-1, 0, 0.4), spread: 0.4, life: 0.5 }); front(30, v2); tfx.ring(v2, 1, 7, 0.45, col, { k: 1.8 }); J.shake(0.5); J.stop(60); }, snd: ['bladeCharge', 'bladeSweep'] },
        cleave: { tele: ['lane', 0.7], lunge: 0.8, trail: 'blade', charge: k => { charge(bladeTip(v1, 8.5), k); charge(bladeTip(v2, 4), k * 0.7); },
          hit: L => { bladeTip(v1, 8); v1.y = 0.05; quake(v1, 0.9); const a = v1.clone(); for (let i = 1; i <= 7; i++) later(i * 0.045, () => { v2.lerpVectors(a, youFloor(v3), i / 7.5); tfx.burst(v2, 10, { col, speed: 5, up: 7, dir: v3.set(0, 1, 0), spread: 0.25, life: 0.55, size: 0.22 }); tfx.burst(v2, 2, { col: WHITE, speed: 1, size: 1.4, life: 0.2, kind: 'glow', grav: 0 }); }); }, snd: ['bladeCharge', 'cleave'] },
      },
      colossus: {
        storm: { tele: ['mark', 2.8], lunge: 0.2, charge: k => { kit.orbitK = 1 + k * 4; core(v1); charge(v1, k); },
          hit: L => { for (let i = 0; i < 12; i++) later(i * 0.03, () => { v2.set(you.x + rnd(-3, 3), 7 + rnd(0, 2.5), you.z - rnd(2, 5)); tfx.debris(v2, 2, { col, speed: 3, dir: v3.set(0, -1, 0.35), spread: 0.15, up: -12, size: 0.65, life: 1.4 }); tfx.burst(v2, 3, { col, speed: 1, size: 0.5, life: 0.3, grav: -20, kind: 'glow' }); }); later(0.32, () => { v2.set(you.x, 0.05, you.z - 3.2); tfx.ring(v2, 0.3, 5, 0.5, col, { k: 2.2 }); tfx.scorch(v2, 3.2, col); tfx.burst(v2, 16, { kind: 'dust', col: '#8f8aa0', speed: 4.5, size: 2, life: 1.2, alpha: 0.7 }); J.shake(0.7); }); }, snd: ['blockCharge', 'blockStorm'] },
        lash: { tele: ['fan', 1.25], lunge: 0.2, trail: 'tail', charge: k => charge(tailTip(v1), k),
          hit: L => { tailTip(v1); tfx.burst(v1, 28, { col, speed: 10, life: 0.5 }); front(18, v2); tfx.ring(v2, 1, 8, 0.5, col, { k: 1.6 }); J.shake(0.6); J.stop(50); }, snd: ['tailCharge', 'tailLash'] },
        beam: { tele: ['lane', 0.6], lunge: -0.3, charge: k => { core(v1); charge(v1, k); charge(v1, k); },
          hit: L => { beamT = 0.55; J.shake(0.5); }, snd: ['beamCharge', 'beamFire'] },
      },
      king: {
        shock: { tele: ['ring'], lunge: 0, charge: k => { charge(fist('L', v1), k); charge(fist('R', v2), k); },
          hit: L => { at('chest', 0, -6, 0, v1); v1.y = 0.05; quake(v1, 1.1); later(0.1, () => { tfx.ring(v1, 2, 12, 0.9, col2, { k: 1.6 }); tfx.ring(v1.setY(2.5), 1, 7, 0.6, col, { k: 1.4 }); }); }, snd: ['throneCharge', 'throneShock'] },
        decree: { tele: ['mark', 1.8], lunge: 0.2, charge: k => charge(fist('R', v1), k, col2),
          hit: L => { fist('R', v1); fly(v1, v2.copy(you).setY(1.2), 0.28, col2, p => { tfx.burst(p, 30, { col: col2, speed: 7, life: 0.5 }); tfx.ring(youFloor(v3), 0.2, 2.4, 0.4, col2, { k: 2.2 }); J.shake(0.4); }, 0.6); }, snd: ['decreeCharge', 'decreeCast'] },
        crush: { tele: ['lane', 1.2], lunge: 0.4, trail: 'handR', charge: k => charge(fist('R', v1), k),
          hit: L => { fist('R', v1); v1.y = 0.05; quake(v1, 1.2); }, snd: ['siegeCharge', 'crush'] },
      },
      half: {
        split: { tele: ['fan', 1.1], lunge: 0.6, charge: k => { core(v1); charge(v1, k, col2); },
          hit: L => { core(v1); tfx.burst(v1, 40, { col: col2, speed: 11, life: 0.5 }); tfx.burst(v1, 30, { col, speed: 9, life: 0.5 }); tfx.debris(v1, 10, { col: col2, speed: 9, size: 0.25 }); J.glitch(1, 0.35); J.shake(0.6); front(20, v2); tfx.ring(v2, 1, 8, 0.45, col2, { k: 2 }); }, snd: ['glitchCharge', 'glitchSplit'] },
        lash: { tele: ['lane', 0.55], lunge: 0.5, trail: 'handR', charge: k => charge(fist('R', v1), k),
          hit: L => { fist('R', v1); tfx.burst(v1, 26, { col, speed: 9, life: 0.45 }); J.shake(0.45); J.stop(50); }, snd: ['wireCharge', 'wireLash'] },
        crash: { tele: ['ring'], lunge: 0.4, charge: k => { charge(fist('L', v1), k, col2); charge(fist('R', v2), k); },
          hit: L => { front(24, v1); quake(v1, 1.1); tfx.debris(v1, 10, { col: col2, speed: 8, size: 0.28 }); J.glitch(0.7, 0.25); }, snd: ['glitchCharge', 'siegeSlam'] },
      },
      brute: {
        piston: { tele: ['lane', 0.9], lunge: 1.6, trail: 'handR', charge: k => { charge(fist('R', v1), k); if (Math.random() < k * 0.6) tfx.burst(at('foreR', 0, -1, -0.8, v2), 1, { kind: 'steam', col: '#c7c2bb', speed: 1.5, size: 1, life: 0.9, up: 1 }); },
          hit: L => { fist('R', v1); tfx.ring(v1, 0.3, 4, 0.35, col, { tilt: Math.PI / 2, y: v1.y, k: 2.6 }); tfx.burst(v1, 34, { col, speed: 11, dir: v3.set(0, 0, 1), spread: 0.6, life: 0.5 }); tfx.burst(v1, 10, { kind: 'steam', col: '#c9c4bd', speed: 5, size: 1.6, life: 1.1, dir: v3, spread: 0.6 }); tfx.flash(v1, col, 1.2); J.shake(0.75); J.stop(90); }, snd: ['pistonCharge', 'pistonPunch'] },
        vent: { tele: ['fan', 0.7], lunge: 0, charge: k => { steamK = 1 + k * 5; kit.heat(k * 0.8); },
          hit: L => { steamK = 9; at('chest', 0, S.chestH / 2 + 1.6, -S.chestD * 0.3, v1); for (let i = 0; i < 6; i++) later(i * 0.05, () => { v2.copy(v1); tfx.burst(v2, 8, { kind: 'steam', col: '#d8d2ca', speed: 12, dir: v3.set(rnd(-0.4, 0.4), 0.15, 1), spread: 0.3, size: 2, life: 1.3, grow: 3.4 }); tfx.burst(v2, 10, { col, speed: 10, dir: v3, spread: 0.4, life: 0.5 }); }); J.shake(0.5); }, snd: ['steamBuild', 'steamBlast'] },
        pound: { tele: ['ring'], lunge: 0.5, charge: k => { charge(fist('L', v1), k); charge(fist('R', v2), k); kit.heat(k); },
          hit: L => { front(24, v1); quake(v1, 1.35); later(0.12, () => tfx.ring(v1, 1, 10, 0.9, col, { k: 1.5 })); }, snd: ['siegeCharge', 'pound'] },
      },
    }[id] || {};
    // the titans' own moves (between attacks): the pose they hold while it runs
    const MOVE = { siege: 'fistsUp', warden: 'cleaveWind', colossus: 'stormWind', king: 'decreeStrike', half: 'splitStrike', brute: 'ventStrike' };
    // the gesture for each signature throw
    const SIGP = { siege: ['hookWind', 'hookStrike'], warden: ['bashWind', 'bashStrike'], colossus: ['lashWind', 'lashStrike'], king: ['decreeWind', 'decreeStrike'], half: ['lashWind', 'lashStrike'], brute: ['pistonWind', 'pistonStrike'] };
    let beamT = 0, steamK = 1;

    // ---------- state ----------
    let mode = 'idle', atk = null, atkId = '', strikeT = -1, landed = false, hitDone = false, windMs = 1, windK = 0;
    let sigT = -1, roarT = -1, enterT = -1, dieT = -1, lastTrail = null, preview = null, wobble = 0;
    const lungeV = { z: 0 };

    // anything the fight does ends an entrance that is still running (on a slow device it can outlast the count)
    function endEnter() { if (mode === 'enter') { mode = 'idle'; mover.position.set(0, 0, 0); clipOff(); } }
    function windup(a, ms) {
      endEnter();
      atkId = a && own[a] ? a : Object.keys(own)[0];
      atk = own[atkId]; windMs = ms; mode = 'wind'; strikeT = -1; hitDone = false; windK = 0;
      if (atk && atk.snd) sfx(atk.snd[0], Math.min(4, ms / 1000));
    }
    function strike(isLanded) {
      endEnter();
      if (!atk) return;
      landed = isLanded; mode = 'strike'; strikeT = 0; hitDone = false;
      tfx.teleOff(0);
      kit.charge(0);
      if (!landed) {
        // blocked: the blow starts and is thrown back off your barrier
        blockYou(null);
        sfx('clang');
      }
    }
    function sig() { sigT = 0; }
    // the wind-up stopped without a strike (its own move took over): drop the telegraph
    function cancel() { if (mode === 'wind') { mode = 'idle'; tfx.teleOff(0); kit.charge(0); } }
    function stage() { roarT = 0; sfx('titanRoar'); }

    // ---------- reveal and dissolve with a clipping plane ----------
    const mats = kit.materials();
    const plane = new THREE.Plane(new V(0, -1, 0), 1e4);
    function clip(on) { for (const m of mats) { m.clippingPlanes = on ? [plane] : null; m.needsUpdate = true; } }
    let clipOn = false;
    // keep the plane in world space: everything below y (top-down reveal uses dir -1)
    function clipAt(y, dir) { if (!clipOn) { clip(true); clipOn = true; } plane.normal.set(0, dir, 0); plane.constant = -dir * y; }
    function clipOff() { if (clipOn) { clip(false); clipOn = false; } }
    const H = () => S.height * scaleOf();
    // Half-Compiled glitches between its halves: for a frame or two the armour drops out and only the
    // wire body is left, then it snaps back
    let bareT = 0;
    function bare(secs) { bareT = Math.max(bareT, secs); }
    function stepBare(dt) { if (id !== 'half') return; bareT -= dt; const on = bareT <= 0; for (let i = 0; i < 4; i++) if (mats[i].visible !== on) mats[i].visible = on; }

    // ---------- entrance ----------
    const ENTER = { siege: 2.4, warden: 2.6, colossus: 2.6, king: 2.6, half: 2.6, brute: 2.5 };
    function enter() { mode = 'enter'; enterT = 0; return ENTER[id] || 2.4; }
    function stepEnter(t, dt) {
      const e = enterT, L = [];
      mover.position.set(0, 0, 0); mover.rotation.set(0, 0, 0);
      if (id === 'siege') {
        // drops out of the sky and lands in a crouch that shakes the arena
        const fallT = 0.55, land = 0.35;
        if (e < land) { mover.position.y = 40 / scaleOf(); }
        else if (e < land + fallT) { const k = (e - land) / fallT; mover.position.y = 40 * (1 - k * k) / scaleOf(); L.push(['fistsUp', 0.6]); }
        else { if (!flags.landed) { flags.landed = true; front(5, v1); quake(v1, 1.4); sfx('quake'); tfx.debris(v1, 16, { col, speed: 9, up: 5 }); } const k = (e - land - fallT); L.push(['fistsDown', 1 - smooth(k / 1.2)]); if (k > 0.8) L.push(['roar', Math.sin(clamp((k - 0.8) / 0.7, 0, 1) * Math.PI) * 0.8]); }
      } else if (id === 'warden') {
        // a firewall of light sweeps down and leaves the knight standing behind it, blade raised
        const k = clamp(e / 1.5, 0, 1), y = H() * 1.05 * (1 - smooth(k));
        clipAt(y, 1);   // keep what is above y
        if (k < 1) { v1.set(root.position.x, y, root.position.z + 0.5); tfx.burst(v1, 4, { col, speed: 2.5, radius: 2.5, life: 0.5, grav: 0, size: 0.2 }); if (!flags.scan) { flags.scan = true; sfx('materialize'); } }
        else clipOff();
        L.push(['cleaveWind', 0.6 * (1 - smooth((e - 1.6) / 0.8))]);
      } else if (id === 'colossus') {
        // assembles from blocks pulled in from all round the arena
        const k = clamp(e / 1.6, 0, 1);
        clipAt(H() * 1.1 * smooth(k) - 0.2, -1);   // keep what is below y
        if (k < 1 && Math.random() < 0.9) { core(v2); v1.set(rnd(-14, 14), rnd(0, 12), rnd(-12, 4)); v3.copy(v2).sub(v1); tfx.debris(v1, 1, { col, speed: v3.length() * 1.3, dir: v3, spread: 0.05, up: 0, size: 0.45, life: 0.7 }); }
        if (k >= 1) clipOff();
        if (!flags.s1) { flags.s1 = true; sfx('assemble'); }
        L.push(['beamStrike', 0.8 * Math.sin(clamp((e - 1.2) / 1.2, 0, 1) * Math.PI)]);
      } else if (id === 'king') {
        // rises out of the floor on his throne, then strikes the armrests
        const k = clamp(e / 1.5, 0, 1);
        mover.position.y = -S.height * 1.05 * (1 - smooth(k));
        if (k < 1) clipAt(0.02, 1); else clipOff();   // nothing shows below the floor
        if (k < 1 && Math.random() < 0.6) { v1.set(root.position.x + rnd(-4, 4), 0.1, root.position.z + rnd(-3, 2)); tfx.burst(v1, 2, { kind: 'dust', col: '#8f8a7a', speed: 2, size: 1.4, life: 1, up: 1 }); tfx.debris(v1, 1, { col, speed: 4, up: 4, size: 0.3 }); }
        if (!flags.s1) { flags.s1 = true; sfx('rise'); }
        if (e > 1.55 && e < 2.0) L.push(['shockWind', smooth((e - 1.55) / 0.3)]);
        if (e >= 2.0) { L.push(['shockWind', 1], ['shockStrike', ease((e - 2.0) / 0.12)]); if (!flags.hit) { flags.hit = true; at('chest', 0, -6, 0, v1); v1.y = 0.05; quake(v1, 1); sfx('throneShock'); } }
      } else if (id === 'half') {
        // compiles from the feet up, the line where it stops flickering
        const k = clamp(e / 1.7, 0, 1), y = H() * 1.1 * smooth(k);
        clipAt(y, -1);
          if (k < 1) { v1.set(root.position.x, y, root.position.z + 0.6); tfx.burst(v1, 3, { col: Math.random() < 0.5 ? col : col2, speed: 3, radius: 2, life: 0.35, grav: 0, size: 0.2 }); if (Math.random() < 0.15) { J.glitch(0.5, 0.1); bare(0.1); } }
        else clipOff();
        if (!flags.s1) { flags.s1 = true; sfx('compile'); }
        L.push(['splitStrike', 0.7 * Math.sin(clamp((e - 1.6) / 0.9, 0, 1) * Math.PI)]);
      } else if (id === 'brute') {
        // charges in from the back of the arena and skids to a stop roaring, the vents blowing
        const run = 1.0, k = clamp(e / run, 0, 1);
        mover.position.z = -26 * (1 - ease(k)) / scaleOf();
        mover.position.y = k < 1 ? Math.abs(Math.sin(e * 14)) * 0.5 : 0;
        if (k < 1) { L.push(['pistonWind', 0.5 + 0.3 * Math.sin(e * 14)]); if (Math.random() < 0.5) { foot(Math.random() < 0.5 ? 'L' : 'R', v1); tfx.burst(v1.setY(0.1), 2, { kind: 'dust', col: '#8a8178', speed: 2, size: 1.2, life: 0.9 }); } if (!flags.s1) { flags.s1 = true; sfx('charge'); } }
        else { if (!flags.skid) { flags.skid = true; front(6, v1); tfx.debris(v1, 12, { col, speed: 7, dir: v3.set(0, 0.4, 1), up: 3 }); tfx.burst(v1, 12, { kind: 'dust', col: '#8a8178', speed: 4, size: 1.8, life: 1.2 }); J.shake(0.7); sfx('quake'); steamK = 8; } L.push(['ventStrike', Math.sin(clamp((e - run) / 1.3, 0, 1) * Math.PI)]); }
      }
      if (e > (ENTER[id] || 2.4) - 0.9 && !flags.roar && id !== 'king') { flags.roar = true; sfx('titanRoar'); }
      return L;
    }

    // ---------- death ----------
    const loose = [];
    function die() {
      mode = 'die'; dieT = 0; flags.die = {};
      tfx.teleOff(0); tfx.beamOff(); kit.charge(0.6, new THREE.Color(WHITE));
      sfx('titanFall');
      return 2.9;
    }
    // armour that comes off as it falls: the pauldrons and the head's plates fly loose
    function shed() {
      const want = ['shL', 'shR', 'head'];
      for (const bn of want) {
        const b = kit.bones[bn]; if (!b) continue;
        for (const m of b.children.slice()) {
          if (!m.isMesh || m.material === mats[4]) continue;
          root.attach(m);
          const vel = new V(rnd(-1, 1) * 5, rnd(4, 8), rnd(0, 1) * 4).divideScalar(scaleOf());
          loose.push({ m, v: vel, w: new V(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)) });
        }
      }
    }
    function stepLoose(dt) {
      const g = 22 / scaleOf();
      for (const l of loose) {
        l.v.y -= g * dt; l.m.position.addScaledVector(l.v, dt);
        if (l.m.position.y < 0.5) { l.m.position.y = 0.5; l.v.y = Math.abs(l.v.y) * 0.3; l.v.x *= 0.6; l.v.z *= 0.6; l.w.multiplyScalar(0.5); }
        l.m.rotation.x += l.w.x * dt; l.m.rotation.y += l.w.y * dt; l.m.rotation.z += l.w.z * dt;
      }
    }
    function stepDie(t, dt) {
      const e = dieT, D = flags.die, L = [];
      const dieP = POSES.die ? 'die' : 'fall';
      // 0 to 0.6: the last hit throws it back, sparks pour from the core
      L.push(['reel', Math.sin(clamp(e / 0.7, 0, 1) * Math.PI * 0.5) * (1 - smooth((e - 0.6) / 0.6))]);
      if (e < 1.6 && Math.random() < 0.6) { core(v1); tfx.burst(v1, 3, { col: Math.random() < 0.5 ? col : WHITE, speed: 7, life: 0.5, size: 0.18 }); }
      // 0.5 to 1.6: it falls to its knees (or slumps on the throne) and the armour comes off
      L.push([dieP, smooth((e - 0.5) / 0.9)]);
      if (e > 0.85 && !D.shed) { D.shed = true; shed(); core(v1); tfx.burst(v1, 30, { col, speed: 9, life: 0.6 }); tfx.debris(v1, 10, { col, speed: 8, up: 3 }); J.shake(0.6); sfx('armourOff'); }
      if (e > 1.25 && !D.knees && S.legs && id !== 'king') { D.knees = true; front(4, v1); tfx.burst(v1, 16, { kind: 'dust', col: '#8a8f96', speed: 4, size: 1.8, life: 1.3 }); tfx.debris(v1, 8, { col, speed: 6 }); J.shake(0.7); sfx('quake'); }
      // 1.4 to 2.0: the core overloads
      if (e > 1.4 && e < 2.05) { const k = (e - 1.4) / 0.65; kit.coreGlow.scale.setScalar(4.2 * (1 + k * 3)); kit.charge(0.6 + k, new THREE.Color(WHITE)); core(v1); charge(v1, k, WHITE); if (!D.hum) { D.hum = true; sfx('overload'); } }
      // 2.0: it blows apart and the rest dissolves into the floor
      if (e > 2.0 && !D.boom) {
        D.boom = true; core(v1);
        tfx.flash(v1, WHITE, 2); tfx.ring(v3.copy(v1).setY(0.06), 0.5, 16, 1.0, col, { k: 2.4 }); tfx.ring(v1, 0.3, 9, 0.6, WHITE, { tilt: Math.PI / 2, y: v1.y, k: 1.6 });
        tfx.burst(v1, 80, { col, speed: 14, life: 0.9, size: 0.22, up: 2 }); tfx.burst(v1, 40, { col: WHITE, speed: 10, life: 0.5, size: 0.2 });
        tfx.debris(v1, id === 'colossus' ? 40 : 24, { col, speed: 12, up: 5, size: 0.4 });
        tfx.nova(v1, 7, col, 0.7); tfx.scorch(v3.copy(v1).setY(0.05), 5, col);
        kit.blocks.mesh.visible = false;   // the plates and floating blocks go with the blast (the dissolve can't clip instanced blocks)
        tfx.burst(v1, 18, { kind: 'dust', col: '#80858c', speed: 5, size: 2.2, life: 1.6 });
        J.shake(1.1); J.glitch(1, 0.5); J.stop(110); sfx('titanBoom');
        kit.coreGlow.visible = false;
      }
      if (e > 2.0) { const k = smooth((e - 2.0) / 0.85); clipAt(H() * (1.1 - k * 1.2), -1); }
      // each titan's own touch
      if (id === 'brute') { kit.heat(Math.min(2, e)); steamK = 6; }
      if (id === 'half' && e < 2.0) { const g = Math.random() < 0.25; mover.position.x = g ? rnd(-1.2, 1.2) / scaleOf() : 0; if (g) { J.glitch(0.6, 0.06); bare(0.08); } }
      if (id === 'colossus' && e > 0.5 && e < 2 && Math.random() < 0.7) { at('hips', rnd(-2, 2), rnd(-4, 0), rnd(-1, 1), v1); tfx.debris(v1, 1, { col, speed: 3, up: 1, size: 0.45 }); }
      if (id === 'king' && e > 0.9 && !D.crown) { D.crown = true; at('head', 0, S.head * 1.3, 0, v1); tfx.burst(v1, 20, { col: col, speed: 6, life: 0.7 }); }
      return L;
    }

    // ---------- every frame ----------
    const flags = {};
    function anim(t, dt, s, rdt = dt) {
      clock += dt; runTimers(); runFlyers(dt);
      kit.orbitK = kit.orbitK ? kit.orbitK + (1 - kit.orbitK) * Math.min(1, dt * 2) : 1;
      let L = [];
      if (preview) { mode = 'idle'; mover.position.set(0, 0, 0); clipOff(); kit.mix(preview); kit.update(t, 0); return; }
      if (mode === 'enter') {
        enterT += Math.min(0.1, rdt);   // real time, so it ends inside the 3-2-1 count however slow the frames
        L = stepEnter(t, dt);
        if (enterT >= (ENTER[id] || 2.4)) { mode = 'idle'; mover.position.set(0, 0, 0); clipOff(); }
      } else if (mode === 'die') {
        dieT += dt;
        L = stepDie(t, dt);
        stepLoose(dt);
      } else {
        if (mode !== 'strike') lungeV.z *= Math.max(0, 1 - dt * 6);
        if (s.move && MOVE[id]) L.push([MOVE[id], 0.7 + 0.15 * Math.sin(t * 4)]);
        // the wind-up: anticipation, slow at first and coiling hard at the end, with a tremble in the last fifth
        if (mode === 'wind' && atk) {
          windK = s.wind;
          const w = ATK[atkId];
          if (w) L.push([w[0], easeIn(Math.min(1, windK * 1.15)) * 0.85 + 0.15 * smooth(windK)]);
          if (windK > 0.8) { const tr = (windK - 0.8) * 5 * 0.025; B.chest.rotation.y += rnd(-tr, tr); }
          if (atk.charge) atk.charge(windK);
          kit.charge(windK * 0.9);
          // the floor telegraph from the titan to you
          const tl = atk.tele;
          if (tl) {
            front(12, v1); youFloor(v2);
            const sh = tl[0];
            if (sh === 'ring') tfx.tele(0, 'ring', v1, v2, windK, RED, { r: Math.hypot(v2.x - v1.x, v2.z - v1.z) + 1.4 });
            else if (sh === 'lane') tfx.tele(0, 'lane', v1, v2, windK, RED, { width: tl[1] || 1 });
            else if (sh === 'fan') tfx.tele(0, 'fan', v1, v2.set(v2.x, v2.y, v2.z + 1.2), windK, RED, { angle: tl[1] || 0.9 });
            else if (sh === 'mark') tfx.tele(0, 'mark', v1, v2, windK, RED, { r: tl[1] || 2 });
          }
          if (id === 'half' && windK > 0.25 && Math.random() < windK * (atkId === 'split' ? 0.3 : 0.08)) { bare(rnd(0.04, 0.12)); if (atkId === 'split') { mover.position.x = rnd(-1, 1) * 1.6 / scaleOf(); J.glitch(0.4, 0.05); } }
          else if (id === 'half') mover.position.x *= 0.5;
        }
        // the strike: 0.13 s into the strike pose, a hold, then back over 0.7 s
        if (mode === 'strike' && atk) {
          strikeT += dt;
          const w = ATK[atkId], tS = strikeT;
          const into = landed ? ease(tS / 0.13) : ease(tS / 0.13) * 0.55;
          const back = 1 - smooth((tS - (landed ? 0.45 : 0.22)) / 0.7);
          if (w) L.push([w[0], back], [w[1], into * back]);
          lungeV.z = (atk.lunge || 0) * into * back * (landed ? 1 : 0.5);
          if (tS >= 0.13 && !hitDone) {
            hitDone = true;
            if (atk.hit) atk.hit(landed);
            if (atk.snd) sfx(atk.snd[1]);
            if (landed) later(0.12, () => hitYou());
            else { v2.copy(you); v2.z -= 1.2; v2.y = 1.6; tfx.burst(v2, 24, { col: CYAN, speed: 8, life: 0.4 }); }
          }
          // swing trail on the striking part
          const tr = atk.trail;
          if (tr && tS < 0.5) {
            if (tr === 'blade') { bladeTip(v1, 9); bladeTip(v2, 3.5); }
            else if (tr === 'tail') { tailTip(v1); v2.copy(v1); v2.y += 1.2; }
            else { fist(tr.slice(-1), v1); v2.copy(v1); v2.y += S.fist * 0.6 * scaleOf(); }
            tfx.trail(0, v1, v2, col, true);
          } else tfx.trail(0, v1, v2, col, false);
          if (beamT > 0) { beamT -= dt; core(v1); v2.copy(you).setY(1.2); tfx.beam(v1, v2, beamT / 0.55, col); if (Math.random() < 0.8) tfx.burst(v2, 4, { col, speed: 6, life: 0.3 }); if (beamT <= 0) tfx.beamOff(); }
          if (id === 'colossus' && atkId === 'lash' && kit.tail) kit.tail.rotation.y = -1.1 * into * back;
          if (id === 'half' && atkId === 'lash') B.foreR.scale.y = 1 + 1.3 * into * back;
          if (tS > 1.3) { mode = 'idle'; atk = null; lungeV.z = 0; B.foreR.scale.y = 1; mover.position.x = 0; }
        }
        // a signature throw: a quick gesture
        if (sigT >= 0) { sigT += dt; const g = SIGP[id]; const k = Math.sin(clamp(sigT / 0.6, 0, 1) * Math.PI); if (g) L.push([g[0], k * 0.6], [g[1], k * clamp((sigT - 0.2) / 0.2, 0, 1) * 0.5]); if (sigT > 0.6) sigT = -1; }
        if (roarT >= 0) { roarT += dt; L.push(['roar', Math.sin(clamp(roarT / 1.5, 0, 1) * Math.PI) * 0.9]); if (roarT > 1.5) roarT = -1; }
        mover.position.z = lungeV.z / scaleOf(); mover.position.y *= 0.8;
      }
      if (s.stun && mode !== 'die') L.push(['reel', 0.45]);
      if (s.reel > 0.01 && mode !== 'die') L.push(['reel', s.reel]);
      kit.mix(L);
      kit.update(t, dt);
      // steam from the Brute's vents, more as it builds
      if (id === 'brute' && mode !== 'enter') {
        steamK += (1 - steamK) * Math.min(1, dt * 1.5);
        if (Math.random() < 0.25 * steamK) for (const sx of [-1, 1]) { at('chest', sx * 1.6, S.chestH / 2 + 1.7, -S.chestD * 0.3 - 0.3, v1); tfx.burst(v1, 1, { kind: 'steam', col: '#cfc9c1', speed: 1.5 + steamK * 0.4, dir: v3.set(0, 1, -0.3), spread: 0.25, size: 1.1, life: 1.3, grow: 3 }); }
        if (mode !== 'die' && mode !== 'wind') kit.heat(Math.max(0, (steamK - 1) * 0.1));
      }
      if (id === 'half' && mode !== 'die' && mode !== 'enter' && Math.random() < 0.015) bare(0.06);
      stepBare(Math.min(0.1, rdt));
    }

    return {
      anim, windup, strike, cancel, sig, stage, enter, die,
      id, mode: () => mode, attack: () => atkId,
      preview(list) { preview = list || null; },
      dispose() { clipOff(); bareT = 0; stepBare(0); for (const l of loose) { if (l.m.parent) l.m.parent.remove(l.m); } },
    };
  }
  return { create };
})();
