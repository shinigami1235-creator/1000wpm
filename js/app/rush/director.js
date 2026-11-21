// Boss Rush director: the internal monitor. It keeps a rolling model of the player
// (wpm, accuracy, reaction to wind-ups, combo held, losses per boss and how close
// each loss was) and sets every fight from the boss number and that model.
//
//   const d = RushDirector.create({ model, rng, prior })   model: what d.model() saved last time
//   d.startRun()               a new run; the lift from the last run carries over at half strength
//   d.plan(n, { retry })       the numbers for boss n -> plan (see below)
//   d.report(plan, result)     after the fight: { won, left, wpm, acc, react, combo, hpLeft, secs }
//   d.model()                  plain object to save
//   d.log()                    the decisions so far, newest last
//
// A plan: { n, slot, boss, mark, twists, S, knobs, floor, help, boost, why }
//   S       the speed in wpm the fight is sized for
//   knobs   hp, diff [lo, hi], minLen, maxLen, interval, react, perChar, counters, typo, hit, T
//   help    null or what the loss streak help changed
//   boost   null or { word, at, dmg } for a near miss
// Nothing in a plan is shown to the player except the boost word, which reads "Art sent you a boost".
window.RushDirector = (() => {
  const D = () => window.RushData;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r10 = x => Math.round(x / 10) * 10;
  const half = x => Math.round(x * 2) / 2;

  // ---------- the curve ----------
  // demand(n): the speed the rush asks for at boss n when nothing else applies.
  // 18 wpm at boss 1, about 37 at boss 10, 85 at boss 20, 190 at boss 30.
  const demand = n => 18 * Math.pow(1.085, n - 1);
  // pressure(n): the share of the player's own measured speed the fight may ask for.
  // The first three bosses ask 55% to 65% so the run opens with easy wins, then it
  // rises to 110% by boss 13 and on to 130% by boss 33.
  const pressure = n => (n <= 3 ? 0.5 + 0.05 * n : n <= 13 ? 0.62 + 0.04 * (n - 1) : Math.min(1.3, 1.1 + 0.01 * (n - 13)));

  // The fight's numbers for a speed S. The floors table in data.js holds these at each floor speed.
  function knobs(S, b, mark) {
    const T = Math.min(56, 34 + 4 * (mark - 1));        // seconds the fight is sized to last at S
    const c = clamp(1.2 + S / 28, 1.5, 8.5);
    const slack = clamp(2.2 - S / 100, 1.25, 2);
    return {
      T,
      hp: r10(S * 5 * T / 60 * 0.8 * b.hpK * D().UNIT),
      diff: [half(clamp(c - 1, 1, 9)), half(clamp(c + 1, 2, 10))],
      minLen: clamp(2 + Math.floor(S / 50), 2, 5),
      maxLen: clamp(5 + Math.floor(S / 22), 5, 13),
      interval: Math.round(clamp(10500 - S * 40, 4200, 10000) * b.intervalK),
      react: Math.round(clamp(1500 - S * 5, 600, 1400)),
      perChar: Math.round(12000 / S * slack * b.windK),
      counters: Math.min(4, (S < 40 ? 1 : S < 80 ? 2 : 3) + (mark >= 6 ? 1 : 0)),
      typo: clamp(Math.round(S / 20), 0, 8),
      hit: Math.min(40, 22 + 3 * (mark - 1)),
    };
  }

  // the floor row for a boss and mark; past mark V the V row climbs by FLOOR_STEP wpm a mark
  function floorFor(b, mark) {
    const rows = D().FLOORS[b.id];
    if (rows[mark]) return { ...rows[mark] };
    const top = rows.length - 1;
    const wpm = rows[top].wpm + D().FLOOR_STEP * (mark - top);
    const k = knobs(wpm, b, mark);
    return { wpm, hp: k.hp, diff: k.diff[0], minLen: k.minLen, interval: k.interval, react: k.react, perChar: k.perChar, counters: k.counters, typo: k.typo };
  }
  // pull every knob back inside the floor
  function hold(k, f) {
    k.hp = Math.max(k.hp, f.hp);
    k.diff = [Math.max(k.diff[0], f.diff), Math.max(k.diff[1], f.diff + 1)];
    k.minLen = Math.max(k.minLen, f.minLen);
    k.maxLen = Math.max(k.maxLen, k.minLen + 2);
    k.interval = Math.min(k.interval, f.interval);
    k.react = Math.min(k.react, f.react);
    k.perChar = Math.min(k.perChar, f.perChar);
    k.counters = Math.max(k.counters, f.counters);
    k.typo = Math.max(k.typo, f.typo);
    return k;
  }

  function blank(prior) {
    return {
      v: 1, wpm: prior || 35, acc: 94, react: 1100, combo: 12, samples: 0,
      lift: 1, winStreak: 0, lossStreak: 0, stuck: {}, runs: 0, log: [],
    };
  }

  function create(o = {}) {
    const rng = o.rng || Math.random;
    const m = { ...blank(o.prior), ...(o.model || {}) };
    m.stuck = { ...(m.stuck || {}) };
    m.log = (m.log || []).slice(-120);
    const say = o.say || (() => {});

    function startRun() {
      m.runs++;
      m.lift = 1 + (m.lift - 1) * 0.5;
      m.winStreak = 0;
    }

    function plan(n, opt = {}) {
      const s = D().slot(n), b = s.boss, mark = s.mark;
      const floor = floorFor(b, mark);
      const why = [];
      // the speed: the curve, lifted by easy wins, held under the player's own speed
      const curve = demand(n) * m.lift;
      const cap = m.wpm * pressure(n);
      let S = Math.min(curve, cap);
      why.push(`curve ${curve.toFixed(1)} (demand ${demand(n).toFixed(1)} x lift ${m.lift.toFixed(2)}), cap ${cap.toFixed(1)} (${m.wpm.toFixed(0)} wpm x ${pressure(n).toFixed(2)})`);
      // loss streak help on this boss, with odds that rise each loss
      const st = m.stuck[n] || { fails: 0, near: 0, left: 1 };
      let help = null;
      const chance = st.fails >= 2 ? Math.min(0.95, 0.4 + 0.2 * (st.fails - 2)) : st.fails === 1 ? 0.15 : 0;
      if (chance && rng() < chance) {
        const k = Math.min(0.3, 0.08 * Math.max(1, st.fails));
        help = { k, chance, fails: st.fails };
        S *= 1 - k;
        why.push(`help: ${st.fails} losses here, odds ${(chance * 100).toFixed(0)}%, eased ${(k * 100).toFixed(0)}%`);
      } else if (chance) why.push(`no help this time (odds ${(chance * 100).toFixed(0)}%)`);
      const raw = S;
      S = Math.max(S, floor.wpm);
      if (S > raw) why.push(`floor ${floor.wpm} wpm`);
      const k = knobs(S, b, mark);
      // accuracy and combo shape the words; reaction shapes the wind-up
      if (m.acc < 92) { k.diff = [k.diff[0] - 0.5, k.diff[1] - 0.5]; k.typo = Math.max(0, k.typo - 1); why.push(`accuracy ${m.acc.toFixed(0)}%: easier words, lighter typo cost`); }
      else if (m.acc >= 97 && m.combo >= 30) { k.diff = [k.diff[0] + 0.5, k.diff[1] + 0.5]; why.push(`accuracy ${m.acc.toFixed(0)}% and combo ${m.combo.toFixed(0)}: harder words`); }
      if (m.react > k.react) { k.react = Math.round(Math.min(m.react * 1.1, k.react + 500)); why.push(`reaction ${m.react.toFixed(0)} ms: wind-ups allow ${k.react} ms`); }
      if (help) {
        k.diff = [k.diff[0] - 1, k.diff[1] - 1];
        k.maxLen -= 1;
        k.react = Math.round(k.react * (1 + help.k));
        k.perChar = Math.round(k.perChar * (1 + help.k * 0.6));
        k.hp = r10(k.hp * (1 - help.k * 0.4));
      }
      k.diff = [Math.max(1, k.diff[0]), Math.max(2, k.diff[1])];
      hold(k, floor);
      // the near-miss boost: the closest loss here left the boss under 15% of its HP.
      // The odds start at 45% and rise 25% with each loss since that near miss.
      let boost = null;
      if (st.left < 0.15 && st.near > 0) {
        const bc = Math.min(1, 0.45 + 0.25 * (st.near - 1));
        if (rng() < bc) {
          const words = D().BOOST_WORDS;
          const dmg = r10(clamp(st.left * k.hp * 0.9, 0.06 * k.hp, 0.15 * k.hp));
          boost = { word: words[Math.floor(rng() * words.length)], at: Math.round(5000 + rng() * 6000), dmg };
          why.push(`boost: closest loss had ${(st.left * 100).toFixed(1)}% left, odds ${(bc * 100).toFixed(0)}%, ${dmg} damage`);
        } else why.push(`no boost this time (odds ${(bc * 100).toFixed(0)}%)`);
      }
      const p = { n, slot: s, boss: b, mark, twists: D().twistsFor(mark), S: Math.round(S * 10) / 10, knobs: k, floor, help, boost, retry: !!opt.retry, why };
      const entry = { at: Date.now(), n, boss: b.id, mark, S: p.S, floor: floor.wpm, hp: k.hp, diff: k.diff, interval: k.interval, wind: [k.react, k.perChar], counters: k.counters, typo: k.typo, help: help ? +help.k.toFixed(2) : 0, boost: boost ? boost.dmg : 0, retry: p.retry, why: why.join('; ') };
      m.log.push(entry);
      if (m.log.length > 120) m.log.shift();
      say(entry);
      return p;
    }

    // what the fight showed about the player
    function report(p, r) {
      const a = m.samples < 2 ? 0.6 : 0.35;
      if (r.wpm > 0) m.wpm += (r.wpm - m.wpm) * a;
      if (r.acc > 0) m.acc += (r.acc - m.acc) * a;
      if (r.react > 0) m.react += (r.react - m.react) * a;
      if (r.combo >= 0) m.combo += (r.combo - m.combo) * a;
      m.samples++;
      const key = p.n;
      if (r.won) {
        delete m.stuck[key];
        m.winStreak++; m.lossStreak = 0;
        // easy wins lift the curve, close ones hold it
        const easy = r.hpLeft >= 0.8 && r.secs < p.knobs.T * 0.75;
        const fine = r.hpLeft >= 0.55;
        const before = m.lift;
        m.lift = clamp(m.lift * (easy ? 1.12 : fine ? 1.05 : 1), 0.75, 2.2);
        if (m.winStreak >= 4 && easy) m.lift = clamp(m.lift * 1.04, 0.75, 2.2);
        m.log.push({ at: Date.now(), n: key, result: 'won', hpLeft: +r.hpLeft.toFixed(2), secs: Math.round(r.secs), wpm: Math.round(r.wpm), lift: [+before.toFixed(2), +m.lift.toFixed(2)], model: snap() });
      } else {
        const st = m.stuck[key] || { fails: 0, near: 0, left: 1 };
        st.fails++;
        // the closest margin on this boss; every loss after the first near miss counts toward the boost odds
        st.left = Math.min(st.left, r.left);
        if (st.left < 0.15) st.near++;
        m.stuck[key] = st;
        m.lossStreak++; m.winStreak = 0;
        m.lift = clamp(m.lift * 0.92, 0.75, 2.2);
        m.log.push({ at: Date.now(), n: key, result: 'lost', left: +r.left.toFixed(3), fails: st.fails, near: st.near, lift: +m.lift.toFixed(2), model: snap() });
      }
      if (m.log.length > 120) m.log.splice(0, m.log.length - 120);
      // old stuck entries go after a while so the save stays small
      const keys = Object.keys(m.stuck);
      if (keys.length > 40) delete m.stuck[keys[0]];
    }
    const snap = () => ({ wpm: Math.round(m.wpm), acc: Math.round(m.acc), react: Math.round(m.react), combo: Math.round(m.combo) });

    return {
      startRun, plan, report,
      model: () => JSON.parse(JSON.stringify(m)),
      log: () => m.log.slice(),
      stuck: n => (m.stuck[n] ? { ...m.stuck[n] } : null),
    };
  }

  return { create, knobs, floorFor, demand, pressure, hold };
})();
