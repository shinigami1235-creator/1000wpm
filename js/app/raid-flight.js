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
    }));
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
    function run(i, t, o2 = {}) {
      const s = S[i]; if (!s || busy(s, t)) return;
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
      if (hard && s.downAt < 0 && i !== YOU && Math.random() < 0.45) { s.downAt = t + 0.35; s.downUntil = t + rnd(3.4, 4.4); pickRepairer(i, t); }
    }
    function setDown(i, on) {
      const s = S[i]; if (!s) return;
      if (on && s.downAt < 0) { s.downAt = 0; s.held = true; s.downUntil = Infinity; pickRepairer(i, 0); }
      if (!on && s.held) { s.held = false; s.downAt = -1; s.downUntil = -1; if (s.repairBy >= 0) S[s.repairBy].repairOf = -1; s.repairBy = -1; }
    }

    let lastT = 0;
    function update(t, dt, ctx, out) {
      lastT = t;
      const boss = ctx.boss, aim = ctx.aim, th = ctx.threat;
      const lead = th ? th.h - t : 99;
      const dodging = th && lead < 1.0 && lead > -0.5;
      const late = th && lateSets.get(th.id) || null;
      const R = 5.6;
      let bi = 0;
      for (let i = 0; i < N; i++) {
        const s = S[i]; if (!s.init) continue;
        if (!isAct(i)) { out[i].copy(s.home); continue; }
        // where it would be at rest: its post arcing round the boss, a weave, and the spot it last darted to
        const k = squadOf[i] < 0 ? 0 : squadOf[i];
        const a = 0.2 * Math.sin(t * 0.19 + k * 2.1) + (k ? 0.06 * Math.sin(t * 0.37 + k) : 0);
        tmp.copy(s.home).sub(boss); const c = Math.cos(a), sn = Math.sin(a);
        tgt.set(tmp.x * c - tmp.z * sn, tmp.y, tmp.x * sn + tmp.z * c).add(boss);
        const calm = i === YOU ? 0.45 : 1;
        if (t > s.flitAt) { s.flitAt = t + rnd(1.4, 3.2); s.flit.set(rnd(-2.2, 2.2) * calm, rnd(-0.4, 1.4) * calm, rnd(-1.2, 1.2) * calm); }
        tgt.x += Math.sin(t * 0.9 + s.ph) * 0.8 * calm + s.flit.x;
        tgt.y += Math.sin(t * 1.3 + s.ph * 2) * 0.35 + s.flit.y;
        tgt.z += Math.cos(t * 0.7 + s.ph) * 0.5 * calm + s.flit.z;
        let stiff = 26;
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
            } else if (lead < 0.1) tgt.y += 1;
          } else if (i === YOU && !th.blocked && th.kind !== 'sweep') { stiff = 40; }   // you stay in the zone: your words decide the block
        }
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
    const vel = i => S[i] ? S[i].vel : tmp.set(0, 0, 0);
    function dispose() { beams.forEach(({ line, ring }) => { scene.remove(line); scene.remove(ring); line.geometry.dispose(); line.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); }); }
    return { home, update, run, strafe, strike, lateFor, knock, setDown, isDown, vel, dispose, S };
  }
  return { create };
})();
