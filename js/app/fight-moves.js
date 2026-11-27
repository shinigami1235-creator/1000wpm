// Fight moves for the operators in the Duel and Party scenes: strikes, casts, blocks, hit
// reactions, a knockdown and the get-up, laid over whatever the operator itself is playing
// (typing, idle, victory). Each move is a pose in body terms (the operator's own joint names and
// degrees, so the elbows and knees bend the way real ones do) plus a root motion the scene adds
// to where the operator stands: a lunge, a step back, a fall.
//
//   const mv = FightMoves.create(THREE, op)      op from Operator.create
//   mv.act('jab', { power })                     a one-shot; a stronger move cuts in over a weaker one
//   mv.hold('ready' | 'down')  mv.release()      a held pose (the guard before a round, lying after a KO)
//   mv.update(dt) -> root { x, y, z, rx, ry }    x: toward the other fighter, z: toward the camera side,
//                                                rx: the fall backward (radians), in the operator's own scale
//   mv.busy()  mv.name()  mv.down()
//
// Moves: flick (a word shot), jab, blast, smash (the big one), cast, block, flinch, stagger, knock
// (blown off the feet, then held lying down until getup), getup, ready (held guard), taunt
window.FightMoves = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = x => Math.pow(clamp(x, 0, 1), 2);
  const P = o => o;   // a pose: any of lean side twist nod turn tilt armL armR elbowL elbowR wristL wristR proL proR legL legR kneeL kneeR

  // a pose blended part way to another, key by key (numbers and {flex, abd, twist} limbs)
  function mix(a, b, w) {
    if (w <= 0) return a; if (w >= 1) return b;
    const o = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[k], y = b[k];
      if (typeof x === 'object' || typeof y === 'object') {
        const X = x || {}, Y = y || {}; o[k] = {};
        for (const j of new Set([...Object.keys(X), ...Object.keys(Y)])) o[k][j] = (X[j] || 0) + ((Y[j] || 0) - (X[j] || 0)) * w;
      } else o[k] = (x || 0) + ((y || 0) - (x || 0)) * w;
    }
    return o;
  }
  // keyframes [time, pose] played through with smooth steps; returns the pose at t
  function keys(list, t) {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) if (t < list[i][0]) { const [t0, a] = list[i - 1], [t1, b] = list[i]; return mix(a, b, (list[i][2] || smooth)((t - t0) / (t1 - t0))); }
    return list[list.length - 1][1];
  }

  // ---------- the poses ----------
  // the fighting guard: fists up near the chin, weight low, front foot forward
  const GUARD = P({ lean: 7, twist: 8, nod: 6, armL: { flex: 52, abd: 14, twist: 38 }, elbowL: 118, wristL: 8, armR: { flex: 40, abd: 18, twist: 38 }, elbowR: 126, wristR: 8,
    legL: { flex: 16, abd: 7 }, kneeL: 22, legR: { flex: -8, abd: 7 }, kneeR: 12 });
  const STANCE = P({ lean: 5, nod: 4, armL: { flex: 30, abd: 16, twist: 30 }, elbowL: 80, armR: { flex: 24, abd: 16, twist: 30 }, elbowR: 86,
    legL: { flex: 12, abd: 7 }, kneeL: 14, legR: { flex: -6, abd: 7 }, kneeR: 8 });
  const M = {
    // a word leaves the keyboard: the right hand flicks out toward the other side and comes back
    flick: { len: 0.34, pri: 0, f(t) {
      const w = t < 0.07 ? smooth(t / 0.07) : 1 - smooth((t - 0.12) / 0.22);
      return { w, pose: P({ lean: 4, twist: 10, turn: -6, armR: { flex: 62, abd: 10, twist: 10 }, elbowR: 22, wristR: -12, armL: { flex: 18, abd: 16, twist: 36 }, elbowL: 84 }), root: { x: 0.05 * w } };
    } },
    // a straight punch from the guard, the off hand stays up
    jab: { len: 0.5, pri: 1, f(t) {
      const p = keys([[0, GUARD], [0.06, mix(GUARD, { ...GUARD, twist: -6, armR: { flex: 30, abd: 20, twist: 30 }, elbowR: 132 }, 1)],
        [0.14, { ...GUARD, lean: 10, twist: 24, turn: -10, armR: { flex: 86, abd: 8, twist: 10 }, elbowR: 6, wristR: -6, legL: { flex: 22, abd: 7 }, kneeL: 26, legR: { flex: -14, abd: 7 }, kneeR: 10 }, ease],
        [0.3, GUARD]], t);
      const w = t < 0.05 ? smooth(t / 0.05) : 1 - smooth((t - 0.3) / 0.2);
      return { w, pose: p, root: { x: 0.22 * Math.sin(clamp(t / 0.36, 0, 1) * Math.PI) } };
    } },
    // both palms drive forward from a pulled-back load, with a lunge
    blast: { len: 0.78, pri: 2, f(t) {
      const load = { lean: -6, twist: -4, nod: -4, armL: { flex: -8, abd: 32, twist: 20 }, elbowL: 104, wristL: 10, armR: { flex: -8, abd: 32, twist: 20 }, elbowR: 104, wristR: 10,
        legL: { flex: 14, abd: 8 }, kneeL: 26, legR: { flex: -6, abd: 8 }, kneeR: 20 };
      const drive = { lean: 16, nod: 4, armL: { flex: 88, abd: 12, twist: 0 }, elbowL: 6, wristL: -32, armR: { flex: 88, abd: 12, twist: 0 }, elbowR: 6, wristR: -32,
        legL: { flex: 30, abd: 8 }, kneeL: 34, legR: { flex: -18, abd: 8 }, kneeR: 8 };
      const p = keys([[0, STANCE], [0.2, load], [0.31, drive, ease], [0.5, drive], [0.78, STANCE]], t);
      const w = t < 0.08 ? smooth(t / 0.08) : 1 - smooth((t - 0.55) / 0.23);
      const lunge = t < 0.2 ? -0.1 * smooth(t / 0.2) : t < 0.32 ? -0.1 + 0.62 * ease((t - 0.2) / 0.12) : 0.52 * (1 - smooth((t - 0.45) / 0.33));
      return { w, pose: p, root: { x: lunge } };
    } },
    // the big one: the right arm loads overhead and smashes down and through, with a dash in
    smash: { len: 1.0, pri: 3, f(t) {
      const load = { lean: -10, twist: -18, nod: -10, turn: 10, armR: { flex: 158, abd: 26, twist: 30 }, elbowR: 64, wristR: 10, armL: { flex: 56, abd: 22, twist: 30 }, elbowL: 44,
        legL: { flex: 10, abd: 8 }, kneeL: 22, legR: { flex: -12, abd: 8 }, kneeR: 16 };
      const hit = { lean: 30, twist: 24, nod: 12, turn: -14, armR: { flex: 70, abd: 8, twist: 0 }, elbowR: 10, wristR: 8, armL: { flex: 8, abd: 28, twist: 10 }, elbowL: 52,
        legL: { flex: 44, abd: 8 }, kneeL: 56, legR: { flex: -24, abd: 8 }, kneeR: 12 };
      const p = keys([[0, STANCE], [0.26, load], [0.38, hit, ease], [0.62, hit], [1.0, STANCE]], t);
      const w = t < 0.1 ? smooth(t / 0.1) : 1 - smooth((t - 0.7) / 0.3);
      const dash = t < 0.26 ? -0.15 * smooth(t / 0.26) : t < 0.4 ? -0.15 + 1.05 * ease((t - 0.26) / 0.14) : 0.9 * (1 - smooth((t - 0.55) / 0.45));
      return { w, pose: p, root: { x: dash, y: t > 0.18 && t < 0.38 ? 0.12 * Math.sin((t - 0.18) / 0.2 * Math.PI) : 0 } };
    } },
    // a spell: both arms rise and gather, then thrust it out
    cast: { len: 1.15, pri: 2, f(t) {
      const gather = { lean: -8, nod: -14, armL: { flex: 118, abd: 42, twist: 30 }, elbowL: 46, wristL: 12, armR: { flex: 118, abd: 42, twist: 30 }, elbowR: 46, wristR: 12,
        legL: { flex: 8, abd: 9 }, kneeL: 14, legR: { flex: -4, abd: 9 }, kneeR: 10 };
      const thrust = { lean: 14, nod: 2, armL: { flex: 84, abd: 8, twist: 0 }, elbowL: 4, wristL: -36, armR: { flex: 84, abd: 8, twist: 0 }, elbowR: 4, wristR: -36,
        legL: { flex: 26, abd: 8 }, kneeL: 30, legR: { flex: -16, abd: 8 }, kneeR: 8 };
      const p = keys([[0, STANCE], [0.42, gather], [0.56, thrust, ease], [0.8, thrust], [1.15, STANCE]], t);
      const w = t < 0.12 ? smooth(t / 0.12) : 1 - smooth((t - 0.82) / 0.33);
      return { w, pose: p, root: { x: t > 0.42 ? 0.3 * Math.sin(clamp((t - 0.42) / 0.6, 0, 1) * Math.PI) : 0, y: t < 0.42 ? 0.06 * smooth(t / 0.42) : 0.06 * (1 - smooth((t - 0.42) / 0.2)) } };
    } },
    // forearms crossed in front of the face, chin down, braced
    block: { len: 0.62, pri: 2, f(t) {
      const pose = { lean: 12, nod: 14, side: 0, armL: { flex: 74, abd: -12, twist: 46 }, elbowL: 112, wristL: 6, armR: { flex: 66, abd: -12, twist: 46 }, elbowR: 118, wristR: 6,
        legL: { flex: 22, abd: 9 }, kneeL: 30, legR: { flex: -10, abd: 9 }, kneeR: 22 };
      const w = t < 0.07 ? smooth(t / 0.07) : 1 - smooth((t - 0.4) / 0.22);
      return { w, pose, root: { x: -0.12 * Math.sin(clamp(t / 0.3, 0, 1) * Math.PI) } };
    } },
    // a light hit: the head snaps back and the hands come up
    flinch: { len: 0.42, pri: 1, f(t) {
      const w = Math.sin(clamp(t / 0.42, 0, 1) * Math.PI) * (t < 0.06 ? smooth(t / 0.06) * 0.4 + 0.6 : 1);
      return { w, pose: P({ lean: -12, side: 4, nod: -16, turn: 10, armL: { flex: 30, abd: 22, twist: 20 }, elbowL: 64, armR: { flex: 34, abd: 18, twist: 20 }, elbowR: 70, legL: { flex: 6, abd: 7 }, kneeL: 12, legR: { flex: -6, abd: 7 }, kneeR: 10 }),
        root: { x: -0.1 * Math.sin(clamp(t / 0.3, 0, 1) * Math.PI) } };
    } },
    // a heavy hit: knocked back a step, arms thrown out, then recovers into the guard
    stagger: { len: 1.0, pri: 3, f(t) {
      const rock = { lean: -24, twist: -16, nod: -22, side: -4, armL: { flex: 44, abd: 52, twist: 10 }, elbowL: 36, armR: { flex: 36, abd: 58, twist: 10 }, elbowR: 30,
        legL: { flex: 20, abd: 9 }, kneeL: 16, legR: { flex: -24, abd: 9 }, kneeR: 34 };
      const catchP = { lean: 14, nod: 6, armL: { flex: 30, abd: 26, twist: 20 }, elbowL: 60, armR: { flex: 26, abd: 26, twist: 20 }, elbowR: 64,
        legL: { flex: 28, abd: 9 }, kneeL: 46, legR: { flex: -6, abd: 9 }, kneeR: 30 };
      const p = keys([[0, rock], [0.16, rock], [0.5, catchP], [1.0, STANCE]], t);
      const w = t < 0.04 ? smooth(t / 0.04) : 1 - smooth((t - 0.7) / 0.3);
      const back = t < 0.3 ? -0.7 * ease(t / 0.3) : -0.7 * (1 - smooth((t - 0.45) / 0.55));
      return { w, pose: p, root: { x: back, y: t < 0.24 ? 0.08 * Math.sin(t / 0.24 * Math.PI) : 0 } };
    } },
    // blown off the feet onto the back; holds there until getup
    knock: { len: 1.0, pri: 5, hold: true, f(t) {
      const air = { lean: -26, nod: -30, twist: -10, armL: { flex: 120, abd: 58, twist: 10 }, elbowL: 30, armR: { flex: 108, abd: 64, twist: 10 }, elbowR: 26,
        legL: { flex: 34, abd: 12 }, kneeL: 50, legR: { flex: 8, abd: 12 }, kneeR: 22 };
      const lie = { lean: 4, nod: -6, turn: 18, tilt: 6, armL: { flex: 100, abd: 70, twist: 10 }, elbowL: 34, wristL: 10, armR: { flex: 60, abd: 64, twist: 10 }, elbowR: 48, wristR: 10,
        legL: { flex: 30, abd: 12 }, kneeL: 46, legR: { flex: 8, abd: 14 }, kneeR: 12 };
      const p = keys([[0, air], [0.22, air], [0.6, lie], [1, lie]], t);
      // the body tips back about the feet, slides back, and bounces once on landing
      const fall = t < 0.18 ? 0.35 * easeIn(t / 0.18) : t < 0.52 ? 0.35 + 1.15 * easeIn((t - 0.18) / 0.34) : 1.5 - 0.1 * Math.sin(clamp((t - 0.52) / 0.2, 0, 1) * Math.PI);
      const slide = -0.75 * ease(t / 0.6);
      const lift = t < 0.3 ? 0.35 * Math.sin(t / 0.3 * Math.PI * 0.5) : 0.35 * (1 - smooth((t - 0.3) / 0.22)) + 0.12;
      return { w: t < 0.05 ? smooth(t / 0.05) : 1, pose: p, root: { x: slide, y: lift, rx: -Math.min(1.5, fall) }, land: t >= 0.52 };
    } },
    // from lying on the back: sit up, kneel, stand into the guard
    getup: { len: 1.3, pri: 4, f(t) {
      const lie = M.knock.f(1).pose;
      const sit = { lean: 50, nod: 10, armL: { flex: 30, abd: 40, twist: 10 }, elbowL: 20, armR: { flex: 20, abd: 40, twist: 10 }, elbowR: 30,
        legL: { flex: 70, abd: 10 }, kneeL: 110, legR: { flex: 20, abd: 12 }, kneeR: 30 };
      const kneel = { lean: 22, nod: 6, armL: { flex: 20, abd: 22, twist: 10 }, elbowL: 50, armR: { flex: 40, abd: 18, twist: 10 }, elbowR: 80,
        legL: { flex: 80, abd: 8 }, kneeL: 100, legR: { flex: -10, abd: 8 }, kneeR: 110 };
      const p = keys([[0, lie], [0.4, sit], [0.75, kneel], [1.1, GUARD], [1.3, GUARD]], t);
      const rx = t < 0.4 ? -1.5 + 1.0 * smooth(t / 0.4) : t < 0.75 ? -0.5 + 0.5 * smooth((t - 0.4) / 0.35) : 0;
      const w = 1 - smooth((t - 1.1) / 0.2);
      return { w, pose: p, root: { x: -0.75 * (1 - smooth(t / 1.1)), y: 0.12 * (1 - smooth(t / 0.4)), rx } };
    } },
    // the held guard before a round, with a small bounce on the toes
    ready: { len: 0.4, pri: 1, hold: true, f(t) {
      const b = Math.sin(t * 5.2), p = { ...GUARD, kneeL: GUARD.kneeL + b * 4, kneeR: GUARD.kneeR + b * 4, lean: GUARD.lean + b * 1.2, turn: Math.sin(t * 0.9) * 6 };
      return { w: smooth(t / 0.3), pose: p, root: { y: 0 } };
    } },
    // a taunt at the face-off: a beckoning hand, then back to the guard
    taunt: { len: 1.4, pri: 1, f(t) {
      const beck = { ...GUARD, lean: -2, nod: -6, armR: { flex: 70, abd: 30, twist: -20 }, elbowR: 40 + Math.max(0, Math.sin(t * 14)) * 50, wristR: -30 };
      const w = t < 0.2 ? smooth(t / 0.2) : 1 - smooth((t - 1.1) / 0.3);
      return { w, pose: keys([[0, GUARD], [0.2, beck], [1.1, beck], [1.4, GUARD]], t), root: {} };
    } },
  };

  function create(THREE, op) {
    const qa = [], qb = new THREE.Quaternion(), ha = new THREE.Vector3();
    let cur = null, holdName = '', fade = null, bones = null, names = null;
    const root = { x: 0, y: 0, z: 0, rx: 0, ry: 0 };
    function prep() {
      const B = op.bones;
      if (B !== bones) { bones = B; names = Object.keys(B).filter(n => B[n] && B[n].quaternion); qa.length = 0; for (let i = 0; i < names.length; i++) qa.push(new THREE.Quaternion()); }
      return B;
    }
    function act(name, o = {}) {
      const m = M[name]; if (!m) return false;
      if (cur && cur.name === 'knock' && name !== 'getup') return false;          // lying down until getup
      if (cur && cur.name === 'knock' && name === 'getup') { cur = { name, t: 0, o, done: false }; fade = null; return true; }
      if (cur && !cur.done && M[cur.name].pri > m.pri && cur.t < M[cur.name].len * 0.6) return false;
      if (cur && cur.name === name && name === 'flick' && cur.t < 0.12) return false;
      cur = { name, t: 0, o, done: false }; fade = null;
      return true;
    }
    function hold(name) { holdName = name; if (!cur || cur.done || M[cur.name].pri <= M[name].pri) act(name); }
    function release() { holdName = ''; if (cur && M[cur.name].hold && cur.name !== 'knock') { fade = { from: cur, t: 0 }; cur = null; } }
    function update(dt) {
      root.x = root.y = root.z = root.rx = root.ry = 0;
      if (cur) { cur.t += dt; if (cur.t >= M[cur.name].len && !M[cur.name].hold) { cur.done = true; cur = null; if (holdName && M[holdName]) act(holdName); } }
      if (!cur && holdName && holdName !== 'knock') act(holdName);
      let r = null, w = 0;
      if (cur) { r = M[cur.name].f(cur.t, cur.o); w = r.w; }
      else if (fade) { fade.t += dt; r = M[fade.from.name].f(fade.from.t, fade.from.o); w = r.w * (1 - smooth(fade.t / 0.25)); if (fade.t >= 0.25) fade = null; }
      if (!r || w <= 0.001 || !op._pose) return root;
      const B = prep();
      for (let i = 0; i < names.length; i++) qa[i].copy(B[names[i]].quaternion);
      ha.copy(B.Hips.position);
      op._pose(r.pose);
      if (w < 0.999) {
        for (let i = 0; i < names.length; i++) { const b = B[names[i]]; qb.copy(b.quaternion); b.quaternion.copy(qa[i]).slerp(qb, w); }
        B.Hips.position.lerp(ha, 1 - w);
        // lerp(ha, 1 - w) moves the posed hips back toward the operator's own by (1 - w)
      }
      const k = r.root || {};
      root.x = (k.x || 0) * w; root.y = (k.y || 0) * w; root.z = (k.z || 0) * w; root.rx = (k.rx || 0) * w; root.ry = (k.ry || 0) * w;
      return root;
    }
    return {
      act, hold, release, update,
      busy: () => !!(cur && !M[cur.name].hold),
      name: () => (cur ? cur.name : ''),
      down: () => !!(cur && cur.name === 'knock'),
      landed: () => !!(cur && cur.name === 'knock' && cur.t >= 0.52),
      reset() { cur = null; holdName = ''; fade = null; },
      // tests: hold a move at time t
      seek(name, t) { cur = { name, t, o: {}, done: false }; fade = null; holdName = ''; },
    };
  }
  return { create, MOVES: M, mix };
})();
