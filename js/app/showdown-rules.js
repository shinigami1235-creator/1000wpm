// Showdown, the turn-based duel (Gid, 28 Nov 2026). Both sides get the same 10 words and 20 seconds a
// round. Each finished word adds a spark to the bot's orb; when time is up (or both are done) both
// attacks play: 1-3 words a shot, 4-6 a double, 7-9 the dash strike, all 10 the finisher. Accuracy sets
// the damage and a clean round (no wrong key) crits. Whoever finished first strikes first, and finishing
// all 10 early gives a chance to dodge the other attack. First to 3 rounds, or empty the other's HP.
// No DOM, so the same file can run on a server later.
//
//   ShowdownRules.CONFIG
//   ShowdownRules.tierOf(words)            0 none, 1 shot, 2 double, 3 dash strike, 4 finisher
//   ShowdownRules.damage(words, acc, clean)
//   ShowdownRules.resolve(sides, rng)      sides: [{ words, acc, clean, doneAt (ms or null), hp }]
//                                          -> { attacks: [{ from, to, words, tier, dmg, crit, dodged, chance }], hp: [a, b], ko: side | -1, winner: side | -1 }
//   ShowdownRules.over(state)              state: { hp, wins, round } -> { done, winner } after a round
(function (root) {
  const CONFIG = {
    hp: 120,          // for the whole match
    words: 10,        // per round, the same for both
    roundMs: 20000,
    rounds: 5,        // best of 5
    winRounds: 3,
    perWord: 2.6,     // damage per finished word before accuracy
    finBonus: 6,      // all 10: the finisher adds this
    critX: 1.5,       // a clean round
    dodgeMax: 0.25,   // Gid, 28 Nov 2026: fast typists must not get an overwhelming advantage
  };
  const TIERS = ['No attack', 'Shot', 'Double shot', 'Dash strike', 'Finisher'];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const tierOf = n => (n >= 10 ? 4 : n >= 7 ? 3 : n >= 4 ? 2 : n >= 1 ? 1 : 0);
  // 100% accuracy keeps the full damage, 90% about 70%, 80% and below 40%
  const accK = acc => 0.4 + 0.6 * clamp((acc - 0.8) / 0.2, 0, 1);
  function damage(words, acc, clean) {
    if (!words) return 0;
    const base = words * CONFIG.perWord + (words >= CONFIG.words ? CONFIG.finBonus : 0);
    return Math.round(base * accK(acc) * (clean ? CONFIG.critX : 1));
  }
  // only a side that finished all its words can dodge, more likely the more time it had left
  function dodgeChance(s) {
    if (s.words < CONFIG.words || s.doneAt == null) return 0;
    const left = clamp((CONFIG.roundMs - s.doneAt) / CONFIG.roundMs, 0, 1);
    return Math.min(CONFIG.dodgeMax, 0.05 + 0.3 * left);
  }
  // who strikes first: the first to finish; otherwise the one with more words, then the faster last word
  const rank = s => (s.doneAt != null ? s.doneAt : CONFIG.roundMs + (CONFIG.words - s.words) * 1000 - Math.min(999, (s.lastAt || 0) / 100));
  function resolve(sides, rng = Math.random) {
    const hp = sides.map(s => s.hp);
    let first = rank(sides[0]) < rank(sides[1]) ? 0 : rank(sides[1]) < rank(sides[0]) ? 1 : (rng() < 0.5 ? 0 : 1);
    const attacks = [];
    let ko = -1;
    for (const from of [first, 1 - first]) {
      const to = 1 - from, s = sides[from];
      if (ko >= 0) break;
      const tier = tierOf(s.words);
      if (!tier) continue;
      const crit = !!s.clean && s.words > 0;
      const chance = dodgeChance(sides[to]);
      const dodged = chance > 0 && rng() < chance;
      const dmg = dodged ? 0 : damage(s.words, s.acc, crit);
      hp[to] = Math.max(0, hp[to] - dmg);
      attacks.push({ from, to, words: s.words, tier, dmg, crit, dodged, chance });
      if (hp[to] <= 0) ko = to;
    }
    const dealt = [0, 1].map(i => attacks.filter(a => a.from === i).reduce((n, a) => n + a.dmg, 0));
    const winner = ko >= 0 ? 1 - ko : dealt[0] > dealt[1] ? 0 : dealt[1] > dealt[0] ? 1 : -1;
    return { attacks, hp, ko, winner, dealt, first };
  }
  function over({ hp, wins, round }) {
    if (hp[0] <= 0 || hp[1] <= 0) return { done: true, winner: hp[0] <= 0 && hp[1] <= 0 ? -1 : hp[0] <= 0 ? 1 : 0 };
    if (wins[0] >= CONFIG.winRounds) return { done: true, winner: 0 };
    if (wins[1] >= CONFIG.winRounds) return { done: true, winner: 1 };
    if (round >= CONFIG.rounds) {
      const w = wins[0] !== wins[1] ? (wins[0] > wins[1] ? 0 : 1) : hp[0] !== hp[1] ? (hp[0] > hp[1] ? 0 : 1) : -1;
      return { done: true, winner: w };
    }
    return { done: false, winner: -1 };
  }
  root.ShowdownRules = { CONFIG, TIERS, tierOf, damage, dodgeChance, resolve, over, accK };
})(globalThis);
