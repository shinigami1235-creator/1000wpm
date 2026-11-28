// RaidFlight: how the raid's bots move in the World Boss (Gid, 27 Nov 2026). Typing still decides the
// fight; this only makes it look like one. Each bot springs toward a target that changes with what is
// happening:
//   at rest      it weaves round its post and every few seconds darts to a new spot near it, and each
//                squad's posts arc slowly round the boss, so the raid circles it
//   attack run   a bot that casts flies in at the boss's side, fires and peels back to its post
//   strike       on a stagger, an open weak point or a big release, the squads dive in together in a
//                staggered wave
//   dodge        once an attack's hit is near, bots in the target zone scatter out of it (up and over
//                a sweep, sideways off a beam); the late ones stay and get hit
//   shield       when the attack is blocked, your squad clumps behind the barrier instead
//   down         a hard hit drops a bot to the floor; the nearest squad mate flies over and repairs it
//                with a beam until it gets back up
//   sortie       squads take turns: all four dive at the boss one after another, then spread wide and
//                drift back to their posts (Gid, 27 Nov: "fly in and do attacks. fly out, spread")
//   side attack  the boss goes after a flank squad: they put up a barrier and clump, scatter, or get hit
//   roll, flip   a dodge is a barrel roll sideways and a hard hit a backflip, so each result reads apart
//   guard        a squad mate flies in front of a locked-on bot to cover it
//
//   const f = RaidFlight.create(THREE, scene, { slots, you, squads, hover })
//   f.home(i, v)                   the formation post for slot i (call when the raid is laid out)
//   f.update(t, dt, ctx, out)      ctx: { boss: V3, aim: V3 (the target zone's centre), threat }
//                                  threat: { id, kind, h (hit time), blocked } or null; out: positions to write
//   f.run(i, t) / f.strafe(i, t)   an attack run / a short one
//   f.strike(t)                    a coordinated dive by every squad
//   f.lateFor(id, pk) -> Set       the slots too slow to dodge this attack (decided once per attack)
//   f.knock(i, t, hard)            a hit; hard ones may put the bot down for a repair
//   f.setDown(i, on)               hold a bot down (your bot when you're out) until set back
//   f.sortie(k, t)                 squad k dives in and spreads out
//   f.roll(i, t, dir) / f.guard(i, target, until)
//   f.spinOf(i, t) -> [x, z]       the flip and roll to add to the bot's rotation
//   f.centre(k, out)               where squad k is now
//   ctx.form: { at: V3, toward: V3, k: 0..1 } the beam face-off (boss-rules.js FACEOFF): every squad regroups
//                                  into one wedge at `at` facing `toward` (the boss), you at its point; knocks still land
//   ctx also takes spin (the orbit's turn rate), calm (true when your squad is free to sortie) and
//   side: { id, k, kind, h, at, outcome: 'block'|'dodge'|'hit' } for an attack on another squad
//   f.isDown(i), f.vel(i), f.dispose()
window.RaidFlight = (() => {
  function create(THREE, scene, o) {
    const V = THREE.Vector3, N = o.slots, YOU = o.you, HOVER = o.hover || 2.3;
    const squadOf = new Int8Array(N).fill(-1);
    (o.squads || []).forEach((sq, k) => sq.forEach(i => { squadOf[i] = k; }));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const S = Array.from({ length: N }, (_, i) => ({
      pos: new V(), vel: new V(), home: new V(), init: false, ph: Math.random() * 6.28, flit: new V(), flitAt: rnd(0, 2.5),
      run: null, downAt: -1, downUntil: -1, held: false, repairOf: -1, repairBy: -1, knockedAt: -9,
      fv: new V(), spread: null, rollAt: -9, rollDir: 1, flipAt: -9, rolledFor: null, guard: null,
    }));
    const members = [0, 1, 2].map(k => (o.squads || [])[k] || []);
    const lateSets = new Map();
    // repair beams: a green line from the repairing bot to the downed one, and a ring under it
    const BEAMS = 6, beams = [];
    for (let k = 0; k < BEAMS; k++) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color('#5dff9a').multiplyScalar(2.2), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5dff9a').multiplyScalar(1.8), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; line.frustumCulled = ring.frustumCulled = false; line.visible = ring.visible = false;
      scene.add(line); scene.add(ring); beams.push({ line, ring });
    }
    const tmp = new V(), tmp2 = new V(), tgt = new V();
    const isAct = i => i === YOU || i < (o.animated || N);

    function home(i, v) { const s = S[i]; s.home.copy(v); if (!s.init) { s.pos.copy(v); s.init = true; } }
    function busy(s, t) { return (s.run && t < s.run.t0 + s.run.dur) || s.downAt >= 0 || s.repairOf >= 0; }
    let lastRun = -1, lastRunT = -9;
    // who the boss should turn toward: the last bot to start a run at it, for a moment
    const fpos = new V();
    let sortieK = -1, sortieT = -9;
    const focus = t => {
      // it turns on a flank squad diving at it; your squad's dives catch it facing them, side or back on
      if (sortieK > 0 && t - sortieT < 1.6 && t >= sortieT) return centre(sortieK, fpos);
      return lastRun >= 0 && t - lastRunT < 1.3 && t >= lastRunT ? S[lastRun].pos : null;
    };
    function centre(k, out) {
      out.set(0, 0, 0); let n = 0;
      for (const i of members[k]) if (S[i] && S[i].init) { out.add(S[i].pos); n++; }
      return n ? out.multiplyScalar(1 / n) : out;
    }
    // a squad's turn: each bot dives in a beat after the last, then they spread wide and drift back
    function sortie(k, t) {
      const m = members[k].filter(i => isAct(i) && S[i].downAt < 0 && S[i].repairOf < 0);
      if (!m.length) return false;
      sortieK = k; sortieT = t;
      m.forEach((i, n) => {
        const reach = i === YOU ? 0.7 : 0.95, d = n * 0.13;
        S[i].run = null;
        run(i, t, { delay: d, dur: 1.05, side: n % 2 ? 1 : -1, reach, lift: 2.5 + (n % 3) * 0.8 });
        S[i].spread = { t0: t + d + 0.85, dur: 1.7, fan: (n - (m.length - 1) / 2) * 0.55 };
      });
      if (o.onSortie) o.onSortie(k, t);
      return true;
    }
    let nextSortie = 4, turnK = 0;
    function roll(i, t, dir) { const s = S[i]; if (!s || t - s.rollAt < 0.6) return; s.rollAt = t; s.rollDir = dir || (Math.random() < 0.5 ? -1 : 1); }
    function guard(i, target, until) { const s = S[i]; if (!s || !isAct(i)) return; s.run = null; s.spread = null; s.guard = { target, until }; }
    // the flip and roll on top of the bot's own lean: a barrel roll for a dodge, a backflip for a hard hit
    function spinOf(i, t, out) {
      const s = S[i]; out[0] = 0; out[1] = 0; if (!s) return out;
      const ru = (t - s.rollAt) / 0.5; if (ru >= 0 && ru < 1) out[1] = s.rollDir * Math.PI * 2 * (1 - Math.pow(1 - ru, 3));
      const fu = (t - s.flipAt) / 0.6; if (fu >= 0 && fu < 1) out[0] = -Math.PI * 2 * (1 - Math.pow(1 - fu, 2.4));
      return out;
    }
    function run(i, t, o2 = {}) {
      const s = S[i]; if (!s || busy(s, t)) return;
      if (i !== YOU && squadOf[i] > 0) { lastRun = i; lastRunT = t + (o2.delay || 0); }
      const side = o2.side || (Math.random() < 0.5 ? -1 : 1);
      s.run = { t0: t + (o2.delay || 0), dur: o2.dur || 0.95, side, reach: o2.reach || 1, lift: o2.lift == null ? rnd(2.2, 4) : o2.lift };
    }
    const strafe = (i, t) => run(i, t, { dur: 0.7, reach: 0.45, lift: rnd(0.8, 1.8) });
    function strike(t) {
      for (let i = 0; i < N; i++) {
        if (!isAct(i) || S[i].downAt >= 0) continue;
        const k = squadOf[i] < 0 ? 0 : squadOf[i];
        run(i, t, { delay: 0.05 + (i % 4) * 0.08 + k * 0.12, dur: 1.15, side: k === 1 ? 1 : k === 2 ? -1 : (i % 2 ? 1 : -1), reach: 0.85, lift: 3.5 + (i % 3) });
      }
    }
    function lateFor(id, pk) {
      if (!lateSets.has(id)) { const s = new Set(); for (let i = 0; i < N; i++) if (i !== YOU && isAct(i) && Math.random() < pk) s.add(i); lateSets.set(id, s); if (lateSets.size > 12) lateSets.delete(lateSets.keys().next().value); }
      return lateSets.get(id);
    }
    function pickRepairer(i, t) {
      let best = -1, bd = 1e9;
      for (let j = 0; j < N; j++) {
        if (j === i || j === YOU || !isAct(j) || S[j].downAt >= 0 || S[j].repairOf >= 0) continue;
        const same = squadOf[j] === squadOf[i] ? 0 : 6, d = S[j].pos.distanceTo(S[i].pos) + same;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { S[best].repairOf = i; S[best].run = null; S[i].repairBy = best; }
    }
    function knock(i, t, hard) {
      const s = S[i]; if (!s || !isAct(i)) return;
      s.knockedAt = t; s.run = null;
      if (s.repairOf >= 0) { S[s.repairOf].repairBy = -1; s.repairOf = -1; }
      if (hard) s.flipAt = t;
      s.spread = null; s.guard = null;
      if (hard && s.downAt < 0 && i !== YOU && Math.random() < 0.45) { s.downAt = t + 0.35; s.downUntil = t + rnd(3.4, 4.4); pickRepairer(i, t); }
    }
    function setDown(i, on) {
      const s = S[i]; if (!s) return;
      if (on && s.downAt < 0) { s.downAt = 0; s.held = true; s.downUntil = Infinity; pickRepairer(i, 0); }
      if (!on && s.held) { s.held = false; s.downAt = -1; s.downUntil = -1; if (s.repairBy >= 0) S[s.repairBy].repairOf = -1; s.repairBy = -1; }
    }

    let lastT = 0;
    const formIdx = {};   // each bot's place in the face-off wedge, kept from the first one
    function update(t, dt, ctx, out) {
      lastT = t;
      const boss = ctx.boss, aim = ctx.aim, th = ctx.threat, sd = ctx.side;
      const lead = th ? th.h - t : 99, slead = sd ? sd.h - t : 99;
      const sdodge = sd && slead < 1.0 && slead > -0.5;
      // the squads take turns diving in; yours only while nothing is coming at it
      if (t > nextSortie && !ctx.form) {
        turnK = (turnK + 1) % 3;
        let k = turnK;
        if ((k === 0 && !ctx.calm) || (sd && sd.k === k)) k = (k + 1) % 3;
        if ((k === 0 && !ctx.calm) || (sd && sd.k === k)) k = (k + 1) % 3;
        if (!(k === 0 && !ctx.calm) && !(sd && sd.k === k)) sortie(k, t);
        nextSortie = t + rnd(2.8, 4.2);
      }
      const dodging = th && lead < 1.0 && lead > -0.5;
      const late = th && lateSets.get(th.id) || null;
      const R = 5.6;
      let bi = 0;
      for (let i = 0; i < N; i++) {
        const s = S[i]; if (!s.init) continue;
        if (!isAct(i)) { out[i].copy(s.home); continue; }
        // where it would be at rest: its post arcing round the boss, a weave, and the spot it last darted to
        const k = squadOf[i] < 0 ? 0 : squadOf[i];
        // your squad holds the front (the view follows it round); the others swing out to the boss's
        // sides and round behind it, slowly, each on its own side
        let a = k === 0 ? 0.2 * Math.sin(t * 0.19) : (k === 1 ? 1 : -1) * (0.6 + 1.9 * (0.5 + 0.5 * Math.sin(t * 0.11 + k * 2.3)));   // out to its side and round behind it
        // when your squad swings round the boss, the others trail it and fly to catch up (never into your spot)
        if (k && ctx.lag) a = k === 1 ? Math.max(0.45, a + ctx.lag) : Math.min(-0.45, a + ctx.lag);
        tmp.copy(s.home).sub(boss); const c = Math.cos(a), sn = Math.sin(a);
        tgt.set(tmp.x * c - tmp.z * sn, tmp.y, tmp.x * sn + tmp.z * c).add(boss);
        const calm = i === YOU ? 0.45 : 1;
        if (t > s.flitAt) { s.flitAt = t + rnd(1.4, 3.2); s.flit.set(rnd(-2.2, 2.2) * calm, rnd(-0.4, 1.4) * calm, rnd(-1.2, 1.2) * calm); }
        tgt.x += Math.sin(t * 0.9 + s.ph) * 0.8 * calm + s.flit.x;
        tgt.y += Math.sin(t * 1.3 + s.ph * 2) * 0.35 + s.flit.y;
        tgt.z += Math.cos(t * 0.7 + s.ph) * 0.5 * calm + s.flit.z;
        let stiff = 26;
        // spreading out after a dive: away from the boss and fanned sideways, then back to the post
        if (s.spread) {
          const u = (t - s.spread.t0) / s.spread.dur;
          if (u >= 1) s.spread = null;
          else if (u >= 0) {
            const w = Math.sin(u * Math.PI);
            tmp2.copy(s.pos).sub(boss); tmp2.y = 0; if (tmp2.lengthSq() < 0.01) tmp2.set(0, 0, 1); tmp2.normalize();
            tgt.addScaledVector(tmp2, 3.6 * w);
            tgt.x += -tmp2.z * s.spread.fan * 5 * w; tgt.z += tmp2.x * s.spread.fan * 5 * w;
            tgt.y += 1.4 * w; stiff = 34;
          }
        }
        // an attack run: out to the boss's side, a beat there, back
        if (s.run && t >= s.run.t0) {
          const u = (t - s.run.t0) / s.run.dur;
          if (u >= 1) s.run = null;
          else {
            const w = Math.sin(Math.min(1, u) * Math.PI), r = s.run;
            tmp2.copy(boss).add(tmp.set(r.side * 4.8, 4.5 + r.lift, (s.home.z - boss.z) * 0.35));   // past the boss's shoulder
            tgt.lerp(tmp2, w * r.reach); tgt.y += w * r.lift * (1 - r.reach);
            stiff = 60;
          }
        }
        // dodging the hit that's coming, or clumping behind the barrier if it's blocked
        if (dodging && s.downAt < 0 && s.repairOf < 0) {
          if (th.blocked && (k === 0 || i === YOU)) {
            const n = bi++, ang = n * 2.1;
            tgt.set(aim.x + Math.cos(ang) * 1.1, HOVER + 0.3 + (n % 2) * 0.9, aim.z + 1.2 + Math.sin(ang) * 0.5);
            stiff = 70;
          } else if (!(late && late.has(i)) && i !== YOU) {
            tmp.copy(s.pos).sub(aim); tmp.y = 0;
            if (th.kind === 'sweep') { tgt.y = HOVER + 3.4; stiff = 160; }
            else if (th.kind === 'beam' || th.kind === 'laser') { const sx = tmp.x >= 0 ? 1 : -1; if (Math.abs(tmp.x) < 4) { tgt.x = aim.x + sx * 5; stiff = 160; } }
            else if (tmp.length() < R + 0.6) {
              if (tmp.lengthSq() < 0.01) tmp.set(Math.sin(s.ph), 0, Math.cos(s.ph));
              tmp.normalize();
              tgt.set(aim.x + tmp.x * (R + 2.4), HOVER + 1.4, aim.z + tmp.z * (R + 2.4));
              stiff = 160;
              if (s.rolledFor !== th.id && lead < 0.5 && Math.random() < 0.6) { s.rolledFor = th.id; roll(i, t, tmp.x >= 0 ? 1 : -1); }
            } else if (lead < 0.1) tgt.y += 1;
          } else if (i === YOU && !th.blocked && th.kind !== 'sweep') { stiff = 40; }   // you stay in the zone: your words decide the block
        }
        // the boss is going after another squad: a barrier and a clump, a scatter, or they take it
        if (sdodge && k === sd.k && s.downAt < 0 && s.repairOf < 0) {
          tmp2.copy(boss).sub(sd.at); tmp2.y = 0; tmp2.normalize();               // toward the boss
          const n = members[k].indexOf(i);
          if (sd.outcome === 'block') {
            tgt.copy(sd.at).addScaledVector(tmp2, -0.6); tgt.x += Math.cos(n * 2.1) * 1.1; tgt.z += Math.sin(n * 2.1) * 0.6; tgt.y = HOVER + 0.3 + (n % 2) * 0.9; stiff = 70;
          } else if (sd.outcome === 'dodge') {
            if (sd.kind === 'sweep') { tgt.y = HOVER + 3.6; stiff = 160; }
            else { const sx = n % 2 ? 1 : -1; tgt.copy(sd.at); tgt.x += -tmp2.z * sx * (R + 2); tgt.z += tmp2.x * sx * (R + 2); tgt.y = HOVER + 1.2; stiff = 160; }
            if (s.rolledFor !== sd.id && slead < 0.45) { s.rolledFor = sd.id; roll(i, t, n % 2 ? 1 : -1); }
          } else { tgt.lerp(sd.at, 0.4); stiff = 40; }
        }
        // covering a locked-on squad mate: between it and the boss
        if (s.guard) {
          if (t > s.guard.until || !S[s.guard.target]) s.guard = null;
          else { const g = S[s.guard.target].pos; tgt.copy(g).lerp(boss, 0.18); tgt.y = g.y + 0.3; stiff = 120; }
        }
        // the beam face-off: one wedge across the arena from the boss, every bot feeding the team's beam
        if (ctx.form && ctx.form.k > 0 && s.downAt < 0 && s.repairOf < 0) {
          const F = ctx.form, slot = i === YOU ? 0 : 1 + (formIdx[i] ?? (formIdx[i] = Object.keys(formIdx).length)), row = Math.ceil(slot / 2), side = slot % 2 ? -1 : 1;
          tmp2.copy(F.toward).sub(F.at).setY(0).normalize();                    // toward the boss
          const lx = -tmp2.z, lz = tmp2.x;                                       // across
          tgt.lerp(tmp.set(F.at.x + lx * side * row * 1.55 - tmp2.x * row * 0.85, HOVER + 0.6 + (row % 2) * 0.9 + Math.sin(t * 2.1 + i) * 0.12,
            F.at.z + lz * side * row * 1.55 - tmp2.z * row * 0.85), F.k);
          stiff = Math.max(stiff, 55);
        }
        // a barrel roll throws it sideways
        { const ru = (t - s.rollAt) / 0.5; if (ru >= 0 && ru < 1) { tgt.x += s.rollDir * 3.2 * Math.sin(Math.min(1, ru * 1.4) * Math.PI / 2); stiff = Math.max(stiff, 140); } }
        // knocked back for a moment
        const ku = t - s.knockedAt;
        if (ku < 0.6) { tgt.z += (1 - ku / 0.6) * 3; tgt.y += Math.sin(ku / 0.6 * Math.PI) * 1.2; }
        // down: on the floor until it's repaired
        if (s.downAt >= 0 && (s.held || t >= s.downAt)) {
          if (!s.held && t > s.downUntil) { s.downAt = -1; if (s.repairBy >= 0) S[s.repairBy].repairOf = -1; s.repairBy = -1; }
          else { tgt.copy(s.pos); tgt.y = 0.75; stiff = 30; if (i === YOU) tgt.y = s.pos.y; }
        }
        // repairing a downed squad mate: hover above it
        if (s.repairOf >= 0) {
          const d = S[s.repairOf];
          if (d.downAt < 0) s.repairOf = -1;
          else { tgt.copy(d.pos); tgt.y = Math.max(d.pos.y, 0.75) + 2.6; tgt.z += 0.9; stiff = 45; }
        }
        // a spring toward the target, quick for dodges and runs
        const damp = 2 * Math.sqrt(stiff);
        s.vel.addScaledVector(tmp.copy(tgt).sub(s.pos), stiff * dt).addScaledVector(s.vel, -damp * dt);
        s.pos.addScaledVector(s.vel, dt);
        if (s.pos.y < 0.6) { s.pos.y = 0.6; s.vel.y = Math.max(0, s.vel.y); }
        out[i].copy(s.pos);
        // what the bot feels for its lean: its own velocity plus the orbit carrying the raid round
        s.fv.copy(s.vel); if (ctx.spin) s.fv.x += ctx.spin * 9;
      }
      // the repair beams
      let b = 0;
      for (let i = 0; i < N && b < BEAMS; i++) {
        const s = S[i]; if (s.repairOf < 0) continue;
        const d = S[s.repairOf]; if (d.downAt < 0 || s.pos.distanceTo(d.pos) > 4.5) continue;
        const { line, ring } = beams[b++], arr = line.geometry.attributes.position.array;
        arr[0] = s.pos.x; arr[1] = s.pos.y - 0.6; arr[2] = s.pos.z; arr[3] = d.pos.x + Math.sin(t * 30) * 0.08; arr[4] = d.pos.y; arr[5] = d.pos.z;
        line.geometry.attributes.position.needsUpdate = true; line.visible = true; line.material.opacity = 0.6 + 0.4 * Math.sin(t * 25 + i);
        ring.visible = true; ring.position.set(d.pos.x, 0.08, d.pos.z); ring.scale.setScalar(1 + 0.25 * Math.sin(t * 6 + i));
      }
      for (; b < BEAMS; b++) { beams[b].line.visible = beams[b].ring.visible = false; }
    }
    const isDown = i => !!S[i] && S[i].downAt >= 0 && (S[i].held || lastT >= S[i].downAt);
    const vel = i => S[i] ? S[i].fv : tmp.set(0, 0, 0);
    function dispose() { beams.forEach(({ line, ring }) => { scene.remove(line); scene.remove(ring); line.geometry.dispose(); line.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); }); }
    return { home, update, run, strafe, strike, sortie, roll, guard, spinOf, centre, members, lateFor, knock, setDown, isDown, vel, focus, dispose, S };
  }
  return { create };
})();
