// Your bot in Boss Rush (28 Nov 2026, Gid: "the bots do battle with the boss, so I need them inside").
// The player's own bot from the hangar (BotKit.mine(), the look World Boss and Duel use) fights each rush
// boss through js/app/bot-fighter.js, flying round the boss's front while typing drives it:
//   each correct key        key(frac)       the orb charges with the word
//   a finished word         shoot(tier)     the strike; the shot leaves its muzzle (ms returned) and flies to the boss
//   a typo                  typo()          a glitch
//   a wind-up at you        brace(on)       it stops roaming, squares up to the boss and holds still
//   a counter word typed    guard()         the shield flickers up
//   the block               block()         the shield braces full as the blow bounces off
//   a blow lands            hit(power)      knocked back from the boss, sparks; it rights itself and flies back
//   a spell                 spell()         rises, the orb swells and drives forward
//   the boss dies / you lose  victory() / ko()
// Where it flies: a post on an arc in front of the boss, on your side of the arena, left of the line
// from the boss to the camera so it never stands in front of the boss's body. Every 2.5 to 4.5 s while
// nothing is coming at you it darts to a new post (closer in as your live wpm climbs, the stance from
// bot-fighter), banking into the turn. A combo strike makes a short attack run at the boss.
//   const b = RushBot.create(THREE, scene, { RoundedBoxGeometry, sound, reduce })
//   b.update(t, dt, { boss: V3 feet, core: V3, H: boss height, threat: s to the next hit, winding })
//   b.at (V3: the body, world, where the boss aims) b.muzzle(out) b.aim(out) b.home(v) b.reset() b.dispose()
window.RushBot = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function create(THREE, scene, o = {}) {
    if (!window.BotFighter || !window.BotKit) return null;
    const V = THREE.Vector3, rnd = (a, b) => a + Math.random() * (b - a);
    const mine = BotKit.mine();
    const SC = o.scale || 0.8;
    const f = BotFighter.create({ ...THREE, RoundedBoxGeometry: o.RoundedBoxGeometry }, mine.id, mine.look, { gap: 7, scale: 1, lite: true, roam: true, sound: o.sound });
    const g = f.group; g.scale.setScalar(SC); scene.add(g);
    const HOV = BotKit.HOVER * SC;
    const pos = new V(), vel = new V(), post = new V(), base = new V(), tmp = new V(), tmp2 = new V(), knock = new V(), knockV = new V();
    let started = false, nextDart = 0, braced = false, runAt = -9, runK = 0, side = -1, yaw = 0, bank = 0, last = 0, ko = false, won = false;
    let homeAt = new V(0, 1.1, 8.6), ang = -0.32, alt = 0.5, flitT = 0, pinned = null;
    // the post on the arc: angle a from the boss toward you (0 is straight at the camera's side), radius r, height y
    function postAt(c, a, r, y, out) {
      const bx = c.boss.x, bz = c.boss.z;
      const dx = homeAt.x - bx, dz = homeAt.z - bz, d0 = Math.atan2(dx, dz);
      return out.set(bx + Math.sin(d0 + a) * r, y, bz + Math.cos(d0 + a) * r);
    }
    const reach = () => Math.hypot(homeAt.x, homeAt.z);
    function pick(c) {
      // closer in as you type faster; mostly on the left of the line from the boss to you
      const st = f.stance, R = reach();
      const r = R * (0.98 - 0.07 * st) + rnd(-0.5, 0.4);
      ang = side * rnd(0.2, 0.42) - (st >= 2 ? rnd(0, 0.06) : 0);
      if (Math.random() < 0.22) side = -side;
      if (side > 0) ang = Math.min(ang, 0.22);   // to the right it stays close to the line, clear of the boss's body
      alt = rnd(0.5, 1.6) + (st >= 2 ? 0.3 : 0);
      postAt(c, ang, r, alt, post);
    }
    const api = {
      f, group: g, at: new V(), id: mine.id, cheat: 0.55,
      home(v) { homeAt.copy(v); },
      key(frac, wpm) { if (ko) return; if (wpm) f.setWpm(wpm); f.key(frac); },
      typo() { if (!ko) f.typo(); },
      // the strike: ms until the shot leaves the muzzle; a combo tier makes a short run at the boss
      shoot(tier = 0) { if (ko) return 0; if (tier >= 2) { runAt = last; runK = tier >= 3 ? 1 : 0.7; } return f.attack(clamp(tier, 0, 3)); },
      brace(on) { braced = !!on; if (on) nextDart = last + 0.6; },
      guard() { if (!ko) f.block(); },
      block() { if (!ko) { f.block(); knockV.addScaledVector(tmp.copy(pos).sub(base).setY(0).normalize(), 2.2); } },
      // a blow lands: thrown back away from the boss and up, sparks are the scene's
      hit(power = 1, from) {
        if (ko) return;
        // thrown back from the boss, up, and off to the left (the camera sits back and to the right of it,
        // so a blow never throws the bot into the lens)
        tmp.copy(pos).sub(from || base).setY(0); if (tmp.lengthSq() < 1e-4) tmp.set(0, 0, 1); tmp.normalize();
        tmp2.set(-tmp.z, 0, tmp.x);   // the bot's left, seen from the camera
        knockV.addScaledVector(tmp, 3.2 * power).addScaledVector(tmp2, 3.6 * power).add(tmp2.set(0, 2.4 * power, 0));
        f.hurt(power > 0.8 ? 'knock' : 'jolt', { k: power, side: Math.random() < 0.5 ? -1 : 1 });
        f.hit(tmp2.set(0, 0, -1), Math.min(1.5, power));
        nextDart = last + 1.0;
      },
      spell() { if (!ko) f.spell(); },
      dodge(s) { if (!ko) f.dodge(s || (Math.random() < 0.5 ? -1 : 1)); },
      ko() { ko = true; f.ko(); },
      victory() { won = true; f.victory(); },
      reset() { ko = false; won = false; braced = false; f.rise(); f.clear(); started = false; },
      muzzle: out => f.muzzle(out),
      pin(p) { pinned = p || null; },   // tests: hold a post [angle, share of the reach, height]
      aim: out => f.bot.body.getWorldPosition(out),
      update, dispose() { scene.remove(g); f.dispose(); },
    };

    function update(t, dt, c) {
      last = t; dt = clamp(dt || 0, 0, 0.1);
      base.copy(c.boss);
      if (!started) { started = true; pick(c); pos.copy(post); vel.set(0, 0, 0); nextDart = t + rnd(2.5, 4); }
      // a new post now and then, only when nothing is about to land on you
      const calm = !braced && !ko && c.threat > 1.4;
      if (pinned) postAt(c, pinned[0], reach() * pinned[1], pinned[2], post);
      else if (calm && t > nextDart) { pick(c); nextDart = t + rnd(2.5, 4.5); flitT = t; }
      // squared up during a wind-up: a guard post a little nearer the camera, still on its side
      if (braced) postAt(c, side < 0 ? -0.3 : 0.18, reach() * 0.96, 0.6, post);
      // the boss's arena moves (it sways): the post follows it
      tmp.copy(post);
      // an attack run: in toward the boss's core and back out
      const ru = (t - runAt) / 0.55;
      if (ru >= 0 && ru < 1) { const k = Math.sin(Math.PI * smooth(ru)) * runK; tmp2.copy(c.core).sub(tmp); tmp.addScaledVector(tmp2, 0.42 * k); }
      // a lazy figure-eight round the post so it never hangs dead still (smaller when braced)
      const w = braced ? 0.08 : 0.32;
      tmp.x += Math.sin(t * 0.9) * w * 1.4; tmp.y += Math.sin(t * 1.7 + 1) * w * 0.6; tmp.z += Math.sin(t * 0.6 + 2) * w;
      // spring toward it: quicker on a dart, stiff when braced
      const om = braced ? 7 : t - flitT < 0.8 ? 5.5 : 3.2;
      const k2 = om * om, d2 = 2 * om * 0.9;
      vel.addScaledVector(tmp.sub(pos), k2 * dt).addScaledVector(vel, -d2 * dt);
      // knockback decays on its own
      knock.addScaledVector(knockV, dt); knockV.multiplyScalar(Math.max(0, 1 - dt * 5)); knock.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      pos.addScaledVector(vel, dt);
      pos.y = Math.max(-0.4, pos.y);
      g.position.copy(pos).add(knock);
      g.position.y = Math.max(-0.6 * SC, g.position.y);
      // face the boss's chest; bank into sideways moves
      tmp.copy(c.core).sub(g.position);
      // turned a little toward the game shot's camera (behind it and to its right), so you see the side of its face
      const want = Math.atan2(tmp.x, tmp.z) - api.cheat;
      let dy = want - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw += dy * Math.min(1, dt * (braced ? 10 : 6));
      tmp2.set(Math.cos(yaw), 0, -Math.sin(yaw));   // the bot's right
      const lat = vel.dot(tmp2);
      bank += (clamp(-lat * 0.07, -0.5, 0.5) - bank) * Math.min(1, dt * 6);
      g.rotation.set(0, yaw, bank, 'YXZ');
      f.update(dt);
      // where the boss aims: the bot's body
      f.bot.body.getWorldPosition(api.at);
    }
    return api;
  }
  return { create };
})();
