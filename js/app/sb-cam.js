// The Superboss broadcast camera: the shots CamDirector (js/app/camdir.js) plays for sb-scene.js.
// The game shot is home and frames each boss from its own size. Cutaways are requested by events
// and the director turns them down whenever an attack Art has to answer is coming:
//   intro    on the countdown: a low hero shot looking up at the boss, then a crane down to the game
//   phase    a phase break: a hard cut to its face from below in slow motion, then a cut to the wide
//   sever    a head cut off (Hydra): a side close-up of it flying, in slow motion
//   neck     the Hydra's neck opens: a slow push toward the exposed core
//   weak     a Leviathan weak point hit: a quick side angle on the segment
//   kill     the finish phrase typed: a close-up on the core in slow motion, then an orbit as it dies
//   lev*     the Leviathan's own: levRise (intro), levRoar (phase), levBreach, levKill
// Every shot fits the boss by its height (fitD), so a tall Compiler and a wide Hydra both stay framed.
// A boss model can replace any of these with its own (model.shots[name], the same shape as below).
//   const cam = SuperCam.create(THREE, camera, { reduce, model: () => model, art, setSlow(k) })
//   cam.want(name, x)   cam.update(tReal, dt, threatAt, finishing, enraged)   cam.shot()   cam.log()
window.SuperCam = (() => {
  function create(THREE, camera, o) {
    const V = THREE.Vector3;
    const D2R = Math.PI / 180;
    const fitD = (h, share, fov) => (h / share) / (2 * Math.tan(fov * D2R / 2));
    const v1 = new V(), v2 = new V();
    const M = () => o.model();
    const sub = k => { const m = M(); return m && m.subj ? m.subj()[k] : null; };
    // the game shot (28 Nov 2026): over Art's shoulder. Gid: "the bots do battle with the boss" and "Art just types. The
    // audience watches a performance." The camera sits behind his bot and off its right shoulder, far enough back to
    // fit the boss's width, low enough to look up at it, and follows the bot as it flits (a trailing point, so the
    // frame breathes). The bot is held in the lower left third, clear of the word line under it.
    const game = { pos: new V(), look: new V(), fov: 42, push: 0, threat: 0 };
    const tmp = camera.clone(), fw = new V(), rt = new V(), ndc = new V(), A = new V(), Ag = new V();
    const artBody = out => (o.art ? o.art(out) : out.set(0, 3.2, 15));
    // forward on the ground from the bot toward the boss, and the bot's right
    function axes(a, f) { fw.set(f.x - a.x, 0, f.z - a.z); const L = fw.length() || 1; fw.divideScalar(L); rt.set(-fw.z, 0, fw.x); return L; }
    // nudge the look point so a subject lands at (x, y) on screen, or inside a box [x0, x1, y0, y1]
    function hold(out, p, box, fov) {
      tmp.position.copy(out.pos); tmp.fov = fov; tmp.aspect = camera.aspect || 1.6; tmp.updateProjectionMatrix();
      for (let k = 0; k < 2; k++) {
        tmp.lookAt(out.look); tmp.updateMatrixWorld();
        ndc.copy(p).project(tmp);
        // sideways it only nudges (a quarter of the frame at most), so a bot at the edge of its patch never swings the boss out
        const ex = Math.max(-0.25, Math.min(0.25, ndc.x < box[0] ? ndc.x - box[0] : ndc.x > box[1] ? ndc.x - box[1] : 0));
        const ey = ndc.y < box[2] ? ndc.y - box[2] : ndc.y > box[3] ? ndc.y - box[3] : 0;
        if (!ex && !ey) return;
        const d = out.pos.distanceTo(out.look), th = Math.tan(fov * D2R / 2);
        tmp.getWorldDirection(v1); v2.crossVectors(v1, tmp.up).normalize();
        out.look.addScaledVector(v2, ex * d * th * tmp.aspect);
        v1.crossVectors(v2, v1);
        out.look.addScaledVector(v1, ey * d * th);
      }
    }
    function gamePose(c, out) {
      const m = M(), f = m && m.focus ? m.focus : v1.set(0, 7.6, -3), w = (m && m.width) || 38;
      // a longer lens from further back than the old front view: the boss keeps its size, Art's bot in the
      // foreground shrinks to something the boss towers over, and its effects stop filling the frame
      const aspect = camera.aspect || 1.6, FOV = 36;
      const half = Math.tan(FOV / 2 * D2R);
      const need = Math.max(36, (w / 2) / (half * aspect) * 0.92) + (m && m.camBack || 0);
      game.push += ((c.finishing ? 1 : 0) - game.push) * Math.min(1, (c.dt || 0.016) * 1.5);
      // an attack winding up at Art: the camera eases up and back a touch, so the whole line of it reads
      const th = c.threatAt - c.t;
      game.threat += ((th > 0 && th < 2.2 ? 1 : 0) - game.threat) * Math.min(1, (c.dt || 0.016) * 2);
      artBody(A); Ag.set(A.x, 0, A.z);
      const fx = f.x, fz = f.z;
      const L = axes(A, { x: fx, z: fz });
      if (m && m.botLane) {
        // a boss with a lane for the bot (the Compiler): the camera stays square on the boss and the bot keeps to its side
        out.pos.set(f.x + 1.5 + Math.sin(c.t * 0.21) * 0.5, Math.max(4, A.y + 0.8) + game.threat * 0.8 - game.push * 1.2, f.z + need + 4 - game.push * 6);
        out.look.set(f.x + 1.2, f.y - 1.5 - game.push * 0.6, f.z);
        out.fov = FOV - game.push * 3 + game.threat * 2;
        return;
      }
      const back = Math.max(11, need - L + 2) - game.push * 5 + game.threat * 1.5;
      const t = c.t;
      // the camera takes half the bot's sideways moves, so its patch of the arena stays in the frame
      out.pos.copy(Ag).addScaledVector(fw, -back).addScaledVector(rt, 3.2 + Math.sin(t * 0.21) * 0.4);
      out.pos.x -= A.x * 0.45;
      // about level with the bot, so the boss towers over it and the bot sits high enough to clear the word line
      out.pos.y = Math.max(2.4, A.y + 0.5) + game.threat * 0.8 - game.push * 0.6 + Math.sin(t * 0.17) * 0.2;
      out.look.set(fx, f.y - game.push * 0.6, fz).lerp(A, 0.12);
      out.fov = FOV - game.push * 3 + game.threat * 2;
      // the bot stays in the lower left third, above the word line (a boss may say where else: the Compiler's screen)
      hold(out, A, [-0.55, 0.05, -0.06, 0.2], out.fov);
    }
    const H = () => (M() && M().height) || 16;
    const shots = {
      game: { pose: gamePose, omega: 6 },
      intro: { pri: 4, free: true, parts: [
        { len: 1.5, cut: 1, fov: 34, pose: (c, out) => { const f = M().focus, h = H(); out.look.set(f.x, f.y + h * 0.25, f.z); out.pos.set(f.x - 12 + c.u * 6, 1.2 + c.u * 0.8, f.z + fitD(h, 0.85, 34) * 0.55 - c.u * 2); } },
        { len: 1.3, cut: 1, fov: 46, pose: (c, out) => { const f = M().focus, h = H(); out.look.set(f.x, f.y, f.z); out.pos.set(f.x + 8 - c.u * 8, f.y + h * 0.9 - c.u * h * 0.45, f.z + fitD(h, 0.7, 46) + 4); } },
      ] },
      phase: { pri: 3, parts: [
        { len: 1.3, cut: 1, slow: 0.55, fov: 30, hand: 0.05, pose: (c, out) => { const p = sub(c.x || 'core') || M().focus; out.look.copy(p); out.pos.set(p.x + 5 - c.u * 1.5, Math.max(1, p.y - 5), p.z + 13 - c.u * 2); } },
        { len: 1.1, cut: 1, fov: 48, pose: (c, out) => { const f = M().focus, h = H(); out.look.set(f.x, f.y + 1, f.z); out.pos.set(f.x - 6 + c.u * 3, f.y + h * 0.35, f.z + fitD(h, 0.75, 48)); } },
      ] },
      sever: { pri: 2, parts: [
        { len: 1.2, cut: 1, slow: 0.4, fov: 36, pose: (c, out) => { const p = sub(c.x) || M().focus; out.look.copy(p); out.pos.set(p.x + (p.x < 0 ? -9 : 9), p.y + 2.5, p.z + 12); } },
      ] },
      neck: { pri: 2, len: 2.6, fov: 36, omega: 2.5, pose: (c, out) => { const p = sub('core') || M().focus; out.look.copy(p).y += 2; out.pos.set(p.x + 3, p.y + 4, p.z + 22 - c.u * 6); } },
      weak: { pri: 2, parts: [
        { len: 0.9, cut: 1, slow: 0.45, fov: 38, pose: (c, out) => { const p = sub('core') || M().focus; out.look.copy(p); out.pos.set(p.x + (p.x < 0 ? -10 : 10), p.y + 3, p.z + 14); } },
      ] },
      // the Leviathan's own shots (sb-leviathan.js asks for them; a higher priority wins the beat over the generic ones)
      // levRise: the countdown, low on the water looking up at the head, then a crane down over the coils
      levRise: { pri: 4.5, free: true, parts: [
        { len: 1.7, cut: 1, fov: 36, pose: (c, out) => { const p = sub('head') || M().focus; out.look.set(p.x, p.y + 1.5 - c.u, p.z); out.pos.set(p.x + 11 - c.u * 4, 0.9 + c.u * 0.5, p.z + 13 - c.u * 1.5); } },
        { len: 1.3, cut: 1, fov: 50, pose: (c, out) => { const f = M().focus; out.look.set(f.x, f.y - 1, f.z); out.pos.set(f.x - 10 + c.u * 6, f.y + 16 - c.u * 7, f.z + 30 - c.u * 2); } },
      ] },
      // levRoar: a phase break, from the water under its jaw in slow motion, then a high wide of the whole coil
      levRoar: { pri: 3.5, parts: [
        { len: 1.4, cut: 1, slow: 0.5, fov: 32, hand: 0.05, pose: (c, out) => { const p = sub('head') || M().focus; out.look.set(p.x, p.y + 1.5, p.z); out.pos.set(p.x + (p.x < 0 ? -5 : 5), Math.max(4, p.y - 2.5) + c.u * 0.5, p.z + 15 - c.u * 2); } },
        { len: 1.3, cut: 1, fov: 50, pose: (c, out) => { const f = M().focus; out.look.set(f.x, f.y - 1.5, f.z); out.pos.set(f.x + 20 - c.u * 4, f.y + 13, f.z + 27); } },
      ] },
      // levBreach: the breach bursting out of the sea, side on at the waterline, in slow motion
      levBreach: { pri: 2, parts: [
        { len: 1.0, cut: 1, slow: 0.5, fov: 44, pose: (c, out) => { const p = sub('head') || M().focus; out.look.set(p.x, Math.max(4, p.y), p.z); out.pos.set(p.x + 10 - c.u * 2, 1.5, p.z + 15); } },
      ] },
      // levKill: its last roar up close in slow motion, then wide and low on the water as it bursts and falls
      levKill: { pri: 5.5, free: true, parts: [
        { len: 0.8, cut: 1, slow: 0.5, fov: 34, hand: 0.04, pose: (c, out) => { const p = sub('head') || M().focus; out.look.set(p.x, p.y + 1, p.z); out.pos.set(p.x * 0.4 + (p.x < 0 ? -6 : 6), Math.max(2, p.y - 1), Math.max(p.z + 16, 12) - c.u * 2); } },
        { len: 4.4, cut: 1, slow: 0.9, fov: 46, omega: 3, pose: (c, out) => { const f = M().focus, a = -0.35 + c.u * 0.5, r = 38; out.look.set(f.x, 4, f.z); out.pos.set(f.x + Math.sin(a) * r, 2.2 + c.u * 2, f.z + Math.cos(a) * r); } },
      ] },
      kill: { pri: 5, free: true, parts: [
        { len: 1.4, cut: 1, slow: 0.25, fov: 34, hand: 0.04, pose: (c, out) => { const p = sub('core') || M().focus, h = H(); out.look.copy(p); out.pos.set(p.x + h * 0.4, p.y + h * 0.12 + 1.5, p.z + h * 0.9 + 4 - c.u * 2); } },
        { len: 3.6, cut: 1, slow: 0.7, fov: 50, omega: 3, pose: (c, out) => { const f = M().focus, h = H(), a = -0.6 + c.u * 1.2, r = fitD(h, 0.8, 50) + 6; out.look.set(f.x, f.y * 0.7, f.z); out.pos.set(f.x + Math.sin(a) * r, f.y * 0.7 + 3 + c.u * 3, f.z + Math.cos(a) * r); } },
      ] },
    };
    // ---------- the bots (28 Nov 2026): Art's bot and the boss framed together ----------
    // Gid: "good cinematography and action ... The audience watches a performance." Each shot is built from where
    // the bot and the boss are this frame, on the game shot's side of the line between them.
    const B = new V(), Bg = new V(), P = new V();
    function pair(out) { artBody(B); Bg.set(B.x, 0, B.z); const m = M(), f = m && m.focus ? m.focus : v1.set(0, 7.6, -3); out.copy(f); return axes(B, f); }
    Object.assign(shots, {
      // a block: a close side look at the weave in slow motion, then side on to the counter shot flying at the boss
      dodge: { pri: 3, parts: [
        { len: 0.7, cut: 1, slow: 0.45, fov: 42, omega: 9, pose: (c, out) => { pair(P); out.pos.copy(B).addScaledVector(rt, 15).addScaledVector(fw, -1 + c.u * 0.8); out.pos.y = B.y + 2; out.look.copy(B).addScaledVector(fw, 4); } },
        { len: 1.1, cut: 1, fov: 44, omega: 6, pose: (c, out) => { const L = pair(P), d = (L * 0.62) / (Math.tan(22 * D2R) * (camera.aspect || 1.6)) + 4; v2.copy(Bg).lerp(v1.set(P.x, 0, P.z), 0.45); out.pos.copy(v2).addScaledVector(rt, d).addScaledVector(fw, -c.u * 1.5); out.pos.y = 3.5 + c.u * 0.5; out.look.copy(v2).setY((B.y + P.y) * 0.5); } },
      ] },
      // a new combo tier: a low push in on the bot as it flares, from in front and to its right
      power: { pri: 2, parts: [
        { len: 0.75, cut: 1, slow: 0.5, fov: 38, omega: 10, hand: 0.03, pose: (c, out) => { pair(P); out.pos.copy(B).addScaledVector(fw, 5.5 - c.u * 1.6).addScaledVector(rt, 3.2); out.pos.y = B.y - 0.5; out.look.copy(B).setY(B.y + 0.2); } },
      ] },
      // a big hit: low behind the bot, looking up past it at the boss as the shot lands
      hero: { pri: 1.5, parts: [
        { len: 0.55, cut: 1, slow: 0.45, fov: 50, omega: 10, pose: (c, out) => { pair(P); out.pos.copy(Bg).addScaledVector(fw, -4.2 + c.u * 0.8).addScaledVector(rt, 2.6); out.pos.y = Math.max(0.9, B.y - 2.2); out.look.copy(P).setY(P.y + 1.5); } },
        { len: 0.7, omega: 4, fov: 46, pose: (c, out) => { pair(P); out.pos.copy(Bg).addScaledVector(fw, -5 - c.u).addScaledVector(rt, 3.4); out.pos.y = Math.max(1.2, B.y - 1.6); out.look.copy(P).setY(P.y + 1); } },
      ] },
      // the drop chase: a tracking shot from the side that keeps the bot and the item in frame
      chase: { pri: 2, len: 2, fov: 44, omega: 5, pose: (c, out) => {
        pair(P); const ch = o.chase ? o.chase() : null, to = ch ? ch.to : Bg;
        v2.copy(Bg).lerp(to, 0.5); const span = Math.max(4, Bg.distanceTo(to));
        out.pos.copy(v2).addScaledVector(rt, 9 + span * 0.7).addScaledVector(fw, -3); out.pos.y = 3.6;
        out.look.copy(v2).setY(Math.max(1.6, B.y * 0.7));
      } },
    });
    // ---------- Art's spells (spell-fx, 28 Nov 2026) ----------
    // Gid: the spell shot follows the cast to the landing. Low behind Art's bot as the spell leaves it, then
    // a hard cut to three-quarters on the boss from the right as it lands. Sized from the spell's hits by
    // spell(lead, land); a fizzle gets the same two beats for the boss's block or dodge.
    const artAt = out => (o.art ? o.art(out) : out.set(0, 0.9, 15));
    function spellShot(a, b) {
      const name = `spell_${a}_${b}`;
      shots[name] ||= { pri: 3, parts: [
        { len: a, cut: 1, fov: 46, omega: 12, pose: (c, out) => { const at = artAt(v2), f = M().focus; out.pos.set(at.x + 2.4, at.y + 2.6 + c.u * 0.3, at.z + 6 - c.u * 0.8); out.look.copy(f).lerp(at, 0.22); } },
        { len: b, cut: 1, fov: 42, omega: 9, pose: (c, out) => { const p = sub('core') || M().focus, h = H(), d = fitD(h, 0.8, 42); out.look.copy(p); out.pos.set(p.x + d * 0.52, Math.max(1.5, p.y * 0.65) + c.u * 0.6, p.z + d * 0.86 - c.u * 1.2); } },
      ] };
      return name;
    }
    const dir = window.CamDirector ? CamDirector.create(THREE, camera, {
      reduce: o.reduce, gap: 4, budget: 3, lockBefore: 3.0, shots,
      onPart: (name, i, part) => o.setSlow(part.slow || 1, part.len || 1),
    }) : null;
    // no cutaway puts the camera inside the space round Art's bot, where his shield barrier and the block flashes are
    const keepOut = { c: new V(), r: 6.6 };
    const ctx = { threatAt: Infinity, t: 0, dt: 0, finishing: false, occluders: [keepOut] };
    function update(t, dt, threatAt, finishing) {
      ctx.threatAt = threatAt; ctx.t = t; ctx.dt = dt; ctx.finishing = finishing; artBody(keepOut.c);
      if (dir) {
        // the director's springs are explicit: on a slow frame step them in small pieces so they never overshoot
        const n = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 40))));
        let s;
        for (let i = 1; i <= n; i++) { ctx.t = t - dt + dt * i / n; s = dir.update(ctx.t, dt / n, ctx); }
        if (s === 'game') o.setSlow(1, 0);
        return s;
      }
      const out = { pos: v1, look: v2, fov: 42 }; gamePose(ctx, out);
      camera.position.copy(out.pos); camera.lookAt(out.look);
      return 'game';
    }
    return {
      // a boss model may bring its own version of a shot (model.shots.intro, .phase, .kill): it plays in place of the stock one
      want: (name, x, len) => { if (!dir) return false; const m = M(), own = m && m.shots && m.shots[name]; if (own) { shots['own:' + name] = own; name = 'own:' + name; } const w = x != null ? { x } : {}; if (len) w.len = len; return dir.want(name, w); },
      spell: (a, b, pri) => dir && dir.want(spellShot(a, b), { pri }),
      update, shot: () => (dir ? dir.shot() : 'game'), log: () => (dir ? dir.log() : []), reset: () => dir && dir.reset(),
    };
  }
  return { create };
})();
