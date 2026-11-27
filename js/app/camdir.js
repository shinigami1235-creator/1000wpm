// CamDirector: picks and moves the camera in a three.js fight the way a director calls shots
// (Gid, 27 Nov 2026: "like there's a cinematographic director guiding it").
//
// The scene owns the shots: each one is a function that writes where the camera sits and what it
// looks at, from wherever the fighters are this frame. The director decides which shot plays and
// how it gets there:
//   - the game shot is home. Others are requested by events and play only when they won't hide an
//     attack you have to answer: never from 1.6 s before a hit at you until 0.4 s after it
//   - a request can be turned down: too soon after the last cutaway, too many in the last 20 s, or
//     lower priority than what's playing. Every decision goes in log() with its reason
//   - a change of shot cuts when the view turns 30 degrees or more or the framing changes a lot,
//     and glides on a spring when it's a small move, so there are no jump cuts and no whip pans
//   - the 180-degree rule: shots stay on the game shot's side of the line from the boss to you, so
//     you keep the same side of the screen across cuts. A shot marked free (the kill) may cross it
//   - occluders (spheres) that hide the subject swing the shot round until it's clear, and the
//     camera is never let inside one
//   - a frame target puts a subject on a thirds point instead of dead centre
//   - reduce motion keeps the game shot only
//
//   - a shot can be a sequence of parts, the way Final Fantasy XVI cuts a big hit: a hard cut to a
//     close-up in slow motion, then a hard cut to the wide as it lands. Each part says how it starts
//     (cut: 1 for a hard cut, else a glide), how long it runs and how much slow motion it asks for
//
//   const dir = CamDirector.create(THREE, camera, { reduce, shots, gap, budget, lockBefore, onPart })
//   lockBefore: seconds before a hit at you that only the game shot plays (1.6; longer when wind-ups are long)
//   shots: { game: (c, out) => {...}, name: { pose(c, out), len, pri, free, fov, frame:[subject, x, y], omega, hand, duringThreat } }
//     or     name: { pri, free, parts: [{ pose, len, cut, slow, fov, frame, omega, hand }, ...] }
//     pose writes out.pos, out.look, out.fov (optional); c is whatever the scene passes to update(),
//     plus c.u (0 to 1 through the shot or part), c.x and c.t
//   onPart(name, index, part) runs as each part starts (the scene starts its slow motion there)
//   duringThreat: the shot may play while an attack at you winds up (a slow-motion dodge of it)
//   dir.want(name, { len, pri, x })      ask for a shot; x is handed to its pose as c.x
//   dir.update(t, dt, c)                 c: { threatAt: seconds of the next hit at you or Infinity,
//                                         line: [bossV3, youV3], occluders: [{ c: V3, r }], subjects: { name: V3 } }
//   dir.shot() / dir.log() / dir.reset()
window.CamDirector = (() => {
  function create(THREE, camera, o = {}) {
    const V = THREE.Vector3;
    const GAP = o.gap ?? 3.5, BUDGET = o.budget ?? 3, WINDOW = 20, LOCK_BEFORE = o.lockBefore ?? 1.6;
    const shots = o.shots || {};
    const cur = { name: 'game', at: 0, len: Infinity, pri: -1, x: null };
    const pose = { pos: new V(), look: new V(), fov: camera.fov };
    const sp = { pos: new V(), vel: new V(), look: new V(), lvel: new V(), fov: camera.fov, fvel: 0 };
    const recent = [];      // start times of cutaways
    let lastEnd = -99, started = false, pending = null;
    const events = [];
    const log = (t, what, why) => { events.push({ t: +t.toFixed(2), what, why }); if (events.length > 200) events.shift(); };
    const tmpCam = camera.clone();
    const v1 = new V(), v2 = new V(), v3 = new V(), fw = new V(), rt = new V();

    function def(name) { const s = shots[name]; return typeof s === 'function' ? { pose: s } : s; }
    const lenOf = s => s.parts ? s.parts.reduce((a, p) => a + p.len, 0) : s.len;
    // the part of a sequence playing at time e into it: { part, idx, u }
    function partAt(s, e) {
      if (!s.parts) return { part: s, idx: 0, u: Number.isFinite(cur.len) ? e / cur.len : 0 };
      let acc = 0;
      for (let i = 0; i < s.parts.length; i++) { const p = s.parts[i]; if (e < acc + p.len || i === s.parts.length - 1) return { part: p, idx: i, u: Math.min(1, (e - acc) / p.len) }; acc += p.len; }
    }

    // the next hit at you is far enough away for a shot of this length (plus the way back)
    const clearFor = (t, len, c) => (c.threatAt ?? Infinity) - t > len + LOCK_BEFORE;

    // requests wait a beat (0.25 s) and the highest priority among them wins, so two events in a row
    // (the last phase's roar, then the kill) make one cut instead of a flash of the first shot
    function want(name, w = {}) {
      const s = def(name); if (!s) return false;
      const r = { name, len: s.parts ? lenOf(s) : (w.len ?? s.len ?? 1.5), pri: w.pri ?? s.pri ?? 1, x: w.x ?? null, at: null };
      if (!pending || r.pri >= pending.pri) { r.at = pending ? pending.at : null; pending = r; }
      return true;
    }

    function accept(t, c, r) {
      if (o.reduce) { log(t, r.name, 'no: reduce motion'); return false; }
      if (!def(r.name).duringThreat && !clearFor(t, r.len, c)) { log(t, r.name, 'no: an attack at you lands too soon'); return false; }
      if (cur.name !== 'game' && r.pri <= cur.pri) { log(t, r.name, `no: ${cur.name} is playing`); return false; }
      if (r.pri < 3) {
        if (t - lastEnd < GAP) { log(t, r.name, 'no: too soon after the last one'); return false; }
        while (recent.length && t - recent[0] > WINDOW) recent.shift();
        if (recent.length >= BUDGET) { log(t, r.name, `no: ${BUDGET} in the last ${WINDOW} s`); return false; }
      }
      return true;
    }

    // the side of the line (boss -> you) a point is on, in the ground plane
    const sideOf = (p, a, b) => Math.sign((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) || 1;

    function solve(name, t, c, out) {
      const whole = def(name), pa = name === cur.name ? partAt(whole, t - cur.at) : partAt(whole, 0), s = pa.part;
      s.free = s.free ?? whole.free;
      out.fov = s.fov ?? whole.fov ?? (shots.game && def('game').fov) ?? camera.fov;
      s.pose({ ...c, x: cur.x, t, u: name === 'game' ? 0 : pa.u }, out);
      if (s.hand) { out.pos.x += Math.sin(t * 2.3) * s.hand; out.pos.y += Math.sin(t * 1.9 + 1) * s.hand * 0.8; }
      // 180-degree rule: mirror a shot that strays across the line, unless it may
      if (c.line && !s.free && name !== 'game') {
        const [a, b] = c.line, home = c.homeSide;
        if (home && sideOf(out.pos, a, b) !== home) {
          // reflect the camera across the line in the ground plane
          v1.set(b.x - a.x, 0, b.z - a.z).normalize();
          v2.set(out.pos.x - a.x, 0, out.pos.z - a.z);
          const along = v2.dot(v1); v3.copy(v1).multiplyScalar(along * 2).sub(v2);
          out.pos.x = a.x + v3.x; out.pos.z = a.z + v3.z;
        }
      }
      // occluders: swing round the look point until the subject can be seen
      const subj = s.see && c.subjects ? c.subjects[s.see] : null;
      if (subj && c.occluders) {
        for (let k = 0; k < 8 && blocked(out.pos, subj, c.occluders); k++) {
          v1.copy(out.pos).sub(out.look); v1.applyAxisAngle(new V(0, 1, 0), (c.homeSide || 1) * 0.26);
          out.pos.copy(out.look).add(v1);
        }
      }
      // never inside an occluder: push the camera out to its surface
      if (c.occluders) for (const oc of c.occluders) {
        v1.copy(out.pos).sub(oc.c); const L = v1.length();
        if (L < oc.r) out.pos.copy(oc.c).addScaledVector(v1.normalize(), oc.r);
      }
      // frame target: nudge the look point so the subject lands on a thirds point
      if (s.frame && c.subjects && c.subjects[s.frame[0]]) {
        tmpCam.position.copy(out.pos); tmpCam.fov = out.fov; tmpCam.aspect = camera.aspect;
        tmpCam.updateProjectionMatrix();
        for (let k = 0; k < 2; k++) {
          tmpCam.lookAt(out.look); tmpCam.updateMatrixWorld();
          v1.copy(c.subjects[s.frame[0]]).project(tmpCam);
          const d = out.pos.distanceTo(out.look), th = Math.tan(THREE.MathUtils.degToRad(out.fov / 2));
          tmpCam.getWorldDirection(fw); rt.crossVectors(fw, tmpCam.up).normalize(); v2.crossVectors(rt, fw);
          out.look.addScaledVector(rt, (v1.x - s.frame[1]) * d * th * camera.aspect);
          out.look.addScaledVector(v2, (v1.y - s.frame[2]) * d * th);
        }
      }
      return out;
    }

    function blocked(from, to, occ) {
      v2.copy(to).sub(from); const L = v2.length(); v2.divideScalar(L);
      return occ.some(s => { v3.copy(s.c).sub(from); const tt = v3.dot(v2); if (tt < 0 || tt > L) return false; return v3.addScaledVector(v2, -tt).length() < s.r; });
    }

    // a hard cut, or a glide when the new view is close to the old one (no jump cuts)
    function cutOrGlide(t, to) {
      const a = v1.copy(sp.look).sub(sp.pos).normalize(), b = v2.copy(to.look).sub(to.pos).normalize();
      const turn = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)));
      const dA = sp.pos.distanceTo(sp.look), dB = to.pos.distanceTo(to.look);
      const size = Math.max(dA / dB, dB / dA) * Math.max(sp.fov / to.fov, to.fov / sp.fov);
      const cut = turn >= 30 || size >= 1.6 || sp.pos.distanceTo(to.pos) > 12;
      if (cut) { sp.pos.copy(to.pos); sp.look.copy(to.look); sp.fov = to.fov; sp.vel.set(0, 0, 0); sp.lvel.set(0, 0, 0); sp.fvel = 0; }
      return cut ? 'cut' : 'glide';
    }

    function start(t, c, r) {
      if (cur.name !== 'game') lastEnd = t;
      Object.assign(cur, { name: r.name, at: t, len: r.len, pri: r.pri, x: r.x, idx: 0 });
      recent.push(t);
      const p0 = partAt(def(r.name), 0).part;
      const how = p0.cut ? (snap(solve(r.name, t, c, pose)), 'cut') : cutOrGlide(t, solve(r.name, t, c, pose));
      if (o.onPart) o.onPart(r.name, 0, p0);
      log(t, r.name, how);
    }
    function snap(to) { sp.pos.copy(to.pos); sp.look.copy(to.look); sp.fov = to.fov; sp.vel.set(0, 0, 0); sp.lvel.set(0, 0, 0); sp.fvel = 0; }

    function back(t, c, why) {
      Object.assign(cur, { name: 'game', at: t, len: Infinity, pri: -1, x: null });
      lastEnd = t;
      const how = cutOrGlide(t, solve('game', t, c, pose));
      log(t, 'game', `${how}: ${why}`);
    }

    // critically damped spring toward the target, per axis
    function spring(x, v, target, w, dt) {
      const k = w * w, d = 2 * w;
      v.addScaledVector(v3.copy(target).sub(x), k * dt).addScaledVector(v, -d * dt);
      x.addScaledVector(v, dt);
    }

    function update(t, dt, c = {}) {
      dt = Math.min(dt, 0.1);
      if (!started) { solve('game', t, c, pose); sp.pos.copy(pose.pos); sp.look.copy(pose.look); sp.fov = pose.fov; started = true; }
      if (c.line && !c.homeSide) {
        // the side the game shot sits on is home for the 180-degree rule
        solve('game', t, { ...c, line: null }, pose);
        c.homeSide = sideOf(pose.pos, c.line[0], c.line[1]);
      }
      if (pending) {
        if (pending.at === null) pending.at = t;
        if (t - pending.at >= 0.25) { const r = pending; pending = null; if (accept(t, c, r)) start(t, c, r); }
      }
      if (cur.name !== 'game') {
        const d = def(cur.name);
        if (t - cur.at >= cur.len) back(t, c, 'shot over');
        else if (!d.free && !d.duringThreat && (c.threatAt ?? Infinity) - t < LOCK_BEFORE) back(t, c, 'an attack at you is coming');
        else if (d.parts) {
          // the next part of a sequence: a hard cut or a glide, as the part says
          const pa = partAt(d, t - cur.at);
          if (pa.idx !== cur.idx) {
            cur.idx = pa.idx; solve(cur.name, t, c, pose);
            if (pa.part.cut) snap(pose);
            if (o.onPart) o.onPart(cur.name, pa.idx, pa.part);
            log(t, `${cur.name} ${pa.idx}`, pa.part.cut ? 'cut' : 'glide');
          }
        }
      }
      const s = cur.name === 'game' ? def('game') : partAt(def(cur.name), t - cur.at).part;
      solve(cur.name, t, c, pose);
      const w = s.omega ?? def(cur.name).omega ?? (cur.name === 'game' ? 6 : 4);
      // the springs step at most 1/60 s at a time: in one step of 1/20 s (a slow device) the look spring
      // (omega over 10) overshoots more each frame and the camera swings away (found 28 Nov 2026)
      const nSub = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / nSub;
      for (let i = 0; i < nSub; i++) {
        spring(sp.pos, sp.vel, pose.pos, w, h);
        spring(sp.look, sp.lvel, pose.look, w * 1.4, h);
        sp.fvel += ((pose.fov - sp.fov) * w * w - 2 * w * sp.fvel) * h; sp.fov += sp.fvel * h;
      }
      camera.position.copy(sp.pos);
      camera.lookAt(sp.look);
      if (Math.abs(camera.fov - sp.fov) > 0.01) { camera.fov = sp.fov; camera.updateProjectionMatrix(); }
      return cur.name;
    }

    return {
      want, update,
      shot: () => cur.name,
      since: t => t - cur.at,
      log: () => events.slice(),
      reset() { started = false; Object.assign(cur, { name: 'game', at: 0, len: Infinity, pri: -1, x: null }); recent.length = 0; lastEnd = -99; pending = null; },
    };
  }
  return { create };
})();
