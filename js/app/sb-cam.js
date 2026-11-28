// The Superboss broadcast camera: the shots CamDirector (js/app/camdir.js) plays for sb-scene.js.
// The game shot is home and frames each boss from its own size. Cutaways are requested by events
// and the director turns them down whenever an attack Art has to answer is coming:
//   intro    on the countdown: a low hero shot looking up at the boss, then a crane down to the game
//   phase    a phase break: a hard cut to its face from below in slow motion, then a cut to the wide
//   sever    a head cut off (Hydra): a side close-up of it flying, in slow motion
//   neck     the Hydra's neck opens: a slow push toward the exposed core
//   weak     a Leviathan weak point hit: a quick side angle on the segment
//   kill     the finish phrase typed: a close-up on the core in slow motion, then an orbit as it dies
// Every shot fits the boss by its height (fitD), so a tall Compiler and a wide Hydra both stay framed.
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
    // the game shot: the boss's focus point, at a distance that fits its width in the frame
    const game = { pos: new V(), look: new V(), fov: 42, push: 0 };
    function gamePose(c, out) {
      const m = M(), f = m && m.focus ? m.focus : v1.set(0, 7.6, -3), w = (m && m.width) || 38;
      const aspect = camera.aspect || 1.6;
      const half = Math.tan(21 * D2R);
      const dist = Math.max(31, (w / 2) / (half * aspect)) + (m && m.camBack || 0);
      game.push += ((c.finishing ? 1 : 0) - game.push) * Math.min(1, (c.dt || 0.016) * 1.5);
      const t = c.t;
      out.pos.set(f.x + Math.sin(t * 0.21) * 0.5, (m && m.camY || 6.4) + Math.sin(t * 0.17) * 0.25 - game.push * 1.2, f.z + dist - game.push * 6);
      out.look.set(f.x, f.y - game.push * 0.6, f.z);
      out.fov = 42 - game.push * 3;
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
      kill: { pri: 5, free: true, parts: [
        { len: 1.4, cut: 1, slow: 0.25, fov: 34, hand: 0.04, pose: (c, out) => { const p = sub('core') || M().focus, h = H(); out.look.copy(p); out.pos.set(p.x + h * 0.4, p.y + h * 0.12 + 1.5, p.z + h * 0.9 + 4 - c.u * 2); } },
        { len: 3.6, cut: 1, slow: 0.7, fov: 50, omega: 3, pose: (c, out) => { const f = M().focus, h = H(), a = -0.6 + c.u * 1.2, r = fitD(h, 0.8, 50) + 6; out.look.set(f.x, f.y * 0.7, f.z); out.pos.set(f.x + Math.sin(a) * r, f.y * 0.7 + 3 + c.u * 3, f.z + Math.cos(a) * r); } },
      ] },
    };
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
    const ctx = { threatAt: Infinity, t: 0, dt: 0, finishing: false };
    function update(t, dt, threatAt, finishing) {
      ctx.threatAt = threatAt; ctx.t = t; ctx.dt = dt; ctx.finishing = finishing;
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
      want: (name, x) => dir && dir.want(name, x != null ? { x } : {}),
      spell: (a, b, pri) => dir && dir.want(spellShot(a, b), { pri }),
      update, shot: () => (dir ? dir.shot() : 'game'), log: () => (dir ? dir.log() : []), reset: () => dir && dir.reset(),
    };
  }
  return { create };
})();
