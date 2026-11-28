// Showdown, the turn-based duel (Gid, 28 Nov 2026). Both sides get the same 10 words and 20 seconds a
// round. Each finished word adds a spark to the bot's orb; when time is up (or both are done) both
// attacks play: 1-3 words a shot, 4-6 a double, 7-9 the dash strike, all 10 the finisher. Accuracy sets
// the damage and a clean round (no wrong key) crits. Whoever finished first strikes first, and finishing
// all 10 early gives a chance to dodge the other attack. First to 3 rounds, or empty the other's HP.
// No DOM, so the same file can run on a server later.
//
// Spells (28 Nov 2026): about every other round (the match seed picks odd or even rounds) one of the 10
// words is a spell word, the same spell in the same place for both sides. It is picked the way a Clash
// picks its offer: from the duel's PvP spells, the top rarity open at that point (rounds 1-2 common,
// 3-4 rare, 5 epic). Typed with no wrong key, it casts in the exchange after both strikes, in the same
// strike order; a typo in it is a fizzle, which still flies and deals nothing. Its damage is the Clash
// spell's total power brought to Showdown's scale and set by accuracy like a strike.
//
// The beam struggle (Gid, 28 Nov 2026): when both sides strike with 4 or more words in the same tier
// (or a word apart) and nobody dodged, the exchange can be shown as a beam struggle. It only changes the
// picture: the attacks and their damage are the rules' own, and BEAM_EXTRA (0) is the extra damage the
// struggle's loser takes. At most one exchange in four, never two in a row.
//
// Overdrive (Gid, 28 Nov 2026: "if I finish all my words fast, it gets boring waiting... how about we can
// continue typing for more damage? It can even add the special words if accurate and fast enough"). A side
// that finishes all 10 before the round ends keeps typing an overdrive stream (the same words for both)
// until the round ends; overdrive never makes a round longer. Each clean overdrive word adds a share of
// that side's strike damage, less for each word in a row (OD.steps), and a typo breaks the chain back to
// the first step without taking anything away. It counts only when the overdrive keys were at least
// OD.minAcc accurate, and the whole bonus is capped at CONFIG.OVERDRIVE_CAP of the strike. After
// OD.specialAfter clean words in a row, each typed within OD.specialMs, the next word is a special: a spell
// word that casts after the strikes (typed clean) or fizzles (any typo). One a round, and its damage counts inside the same cap.
// The bonus rides on the strike, so a dodged strike loses it too. Gid's standing rule holds: fast typists
// must not run away with it, so the steps are small and tuned with tools/bots/showdown-sim.js.
//
//   ShowdownRules.CONFIG, ShowdownRules.SPELLS
//   ShowdownRules.tierOf(words)            0 none, 1 shot, 2 double, 3 dash strike, 4 finisher
//   ShowdownRules.damage(words, acc, clean)
//   ShowdownRules.spellFor(seed, round)    -> { id, slot } or null: the round's spell word (slot 0..9)
//   ShowdownRules.spellDamage(id, acc)
//   ShowdownRules.resolve(sides, rng)      sides: [{ words, acc, clean, doneAt (ms or null), hp, spell: { id, ok } | null }]
//                                          spell.ok: typed with no wrong key; a spell word typed wrong (or with a
//                                          typo) is { id, ok: false }; leave spell null when it was never reached
//                                          -> { attacks: [{ from, to, kind: 'strike' | 'spell', words, tier, dmg, crit, dodged, chance, spell, fizzled }],
//                                               hp: [a, b], ko: side | -1, winner: side | -1, dealt, first }
//   ShowdownRules.beam(res, sides, rng, recent)   recent: earlier exchanges, true where one was a struggle
//                                          -> { winner, loser } or null
//   ShowdownRules.over(state)              state: { hp, wins, round } -> { done, winner } after a round
//   ShowdownRules.OD                       overdrive's numbers
//   ShowdownRules.odState()                a side's overdrive for one round: { words, clean, chain, run, frac, good, bad, due, special }
//   ShowdownRules.odWord(st, clean, ms)    an overdrive word finished (clean: no wrong key; ms: since the last one)
//                                          -> the share it added; st.due turns true when the next word is the special
//   ShowdownRules.odSpecial(st, ok, id)    the special word (spell id) finished: ok typed with no wrong key
//   ShowdownRules.odTier(st)               0 to 3 (OD1 at 2 clean words, OD2 at 4, OD3 at 6)
//   ShowdownRules.odSpellFor(seed, round)  the round's special spell id, the same for both sides
//   resolve: a side may carry od: odState() (with good/bad keys); its strike gets { od: tier, odDmg } and a
//            clean special adds a spell attack with od: true
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
    // spells: base + perPower x the Clash spell's total power, times the accuracy factor. Tuned with
    // tools/bots/showdown-sim.js so match length and win rates stay where they were without spells
    spellBase: 4,
    spellPerPower: 0.12,
    spellSlots: [2, 7],   // the spell word sits somewhere from the 3rd to the 8th word
    beamChance: 0.6,      // an exchange that qualifies becomes a beam struggle this often
    BEAM_EXTRA: 0,        // extra damage the struggle's loser takes: 0, so the struggle never changes balance
    // the most overdrive adds in a round (clean words and the special together), as a share of the strike.
    // Started at 0.25; the sim showed it never binds below Art's pace, so 0.15 keeps it a real ceiling
    OVERDRIVE_CAP: 0.15,
  };
  // the duel's PvP spells that hit the other bot (js/net/duel-rules.js PVP): rarity, total power, hits
  const SPELLS = {
    'data-spike': { rarity: 1, power: 27, hits: 3 }, 'glitch-blade': { rarity: 1, power: 30, hits: 1 }, 'cryo-lock': { rarity: 1, power: 12, hits: 1 },
    'electro-storm': { rarity: 2, power: 35, hits: 7 }, 'packet-storm': { rarity: 2, power: 32, hits: 16 }, 'neon-nova': { rarity: 2, power: 45, hits: 1 }, 'system-purge': { rarity: 2, power: 25, hits: 1 },
    'void-sphere': { rarity: 3, power: 88, hits: 7 }, 'kernel-panic': { rarity: 3, power: 20, hits: 1 }, 'root-access': { rarity: 3, power: 10, hits: 1 },
  };
  // overdrive: the share of the strike each clean word in a row adds (the last step repeats), the accuracy
  // it needs, and the special word's terms; the cap is CONFIG.OVERDRIVE_CAP. Tuned with
  // node tools/bots/showdown-sim.js od 3000 so no pairing's win rate moves more than about 5 points (Gid's
  // rule: fast typists must not run away with it). Even a +1 decides tied rounds, so the steps are small;
  // overdrive's real payoff is the bigger exchange it buys (duel3d.js)
  const OD = {
    steps: [0.015, 0.012, 0.009, 0.007, 0.0055, 0.0045, 0.003],
    minAcc: 0.9,         // overdrive keys under 90% accurate add nothing
    specialAfter: 4,     // clean words in a row before the special word comes up
    specialMs: 1200,     // each of them typed within this long
    specialK: 0.35,      // the special's damage, as a share of the same spell cast from the main words
    tiers: [2, 4, 6],    // OD1, OD2, OD3 by clean overdrive words
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
  // a seeded number from a string, the same on every device (FNV-1a, then a little mixing)
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  // the round's spell word: odd or even rounds by the match seed, the top rarity open by then, the slot by the round
  function spellFor(seed, round) {
    if (!round) return null;
    const parity = hash(seed + ':sd-spell') < 0.5 ? 1 : 0;
    if (round % 2 !== parity) return null;
    const rar = round >= 5 ? 3 : round >= 3 ? 2 : 1;
    const pool = Object.keys(SPELLS).filter(id => SPELLS[id].rarity === rar);
    const id = pool[Math.floor(hash(`${seed}:${round}:id`) * pool.length)];
    const [a, b] = CONFIG.spellSlots;
    return { id, slot: a + Math.floor(hash(`${seed}:${round}:slot`) * (b - a + 1)) };
  }
  function spellDamage(id, acc) {
    const s = SPELLS[id];
    if (!s) return 0;
    return Math.max(1, Math.round((CONFIG.spellBase + CONFIG.spellPerPower * s.power) * accK(acc)));
  }
  // only a side that finished all its words can dodge, more likely the more time it had left
  function dodgeChance(s) {
    if (s.words < CONFIG.words || s.doneAt == null) return 0;
    const left = clamp((CONFIG.roundMs - s.doneAt) / CONFIG.roundMs, 0, 1);
    return Math.min(CONFIG.dodgeMax, 0.05 + 0.3 * left);
  }
  // ---------- overdrive ----------
  const odState = () => ({ words: 0, clean: 0, chain: 0, run: 0, frac: 0, good: 0, bad: 0, due: false, special: null });
  const odStep = k => OD.steps[Math.min(k, OD.steps.length - 1)];
  const odAcc = st => (st && st.good + st.bad ? st.good / (st.good + st.bad) : 1);
  function odWord(st, clean, ms) {
    st.words++;
    if (!clean) { st.chain = 0; st.run = 0; return 0; }
    const add = odStep(st.chain);
    st.frac += add; st.chain++; st.clean++;
    st.run = ms <= OD.specialMs ? st.run + 1 : 0;
    if (!st.special && st.run >= OD.specialAfter) st.due = true;
    return add;
  }
  function odSpecial(st, ok, id) {
    st.words++; st.due = false; st.special = { id, ok: !!ok };
    if (!ok) { st.chain = 0; st.run = 0; }
  }
  // the tier counts the clean words; under the accuracy floor it shows nothing
  function odTier(st) {
    if (!st || odAcc(st) < OD.minAcc) return 0;
    const n = st.clean + (st.special && st.special.ok ? 1 : 0);
    return n >= OD.tiers[2] ? 3 : n >= OD.tiers[1] ? 2 : n >= OD.tiers[0] ? 1 : 0;
  }
  function odSpellFor(seed, round) {
    const rar = round >= 5 ? 3 : round >= 3 ? 2 : 1, main = spellFor(seed, round);
    const pool = Object.keys(SPELLS).filter(id => SPELLS[id].rarity === rar && (!main || main.id !== id));
    return pool[Math.floor(hash(`${seed}:${round}:od`) * pool.length)];
  }
  // what a side's overdrive adds to its strike (the word bonus) and its special spell, both inside the cap
  function odDamage(s, base) {
    const st = s.od;
    if (!st || s.words < CONFIG.words || !base || odAcc(st) < OD.minAcc) return { word: 0, spell: 0 };
    const cap = Math.round(base * CONFIG.OVERDRIVE_CAP);
    const spell = st.special && st.special.ok && st.special.id ? Math.min(cap, Math.max(1, Math.round(spellDamage(st.special.id, odAcc(st)) * OD.specialK))) : 0;
    const word = Math.max(0, Math.min(Math.round(Math.min(st.frac, CONFIG.OVERDRIVE_CAP) * base), cap - spell));
    return { word, spell };
  }

  // who strikes first: the first to finish; otherwise the one with more words, then the faster last word
  const rank = s => (s.doneAt != null ? s.doneAt : CONFIG.roundMs + (CONFIG.words - s.words) * 1000 - Math.min(999, (s.lastAt || 0) / 100));
  function resolve(sides, rng = Math.random) {
    const hp = sides.map(s => s.hp);
    const first = rank(sides[0]) < rank(sides[1]) ? 0 : rank(sides[1]) < rank(sides[0]) ? 1 : (rng() < 0.5 ? 0 : 1);
    const attacks = [];
    let ko = -1;
    const hit = (to, dmg) => { hp[to] = Math.max(0, hp[to] - dmg); if (hp[to] <= 0) ko = to; };
    const odd = [null, null];
    for (const from of [first, 1 - first]) {
      const to = 1 - from, s = sides[from];
      if (ko >= 0) break;
      const tier = tierOf(s.words);
      if (!tier) continue;
      const crit = !!s.clean && s.words > 0;
      const chance = dodgeChance(sides[to]);
      const dodged = chance > 0 && rng() < chance;
      const base = damage(s.words, s.acc, crit), o = odd[from] = odDamage(s, base);
      const dmg = dodged ? 0 : base + o.word;
      attacks.push({ from, to, kind: 'strike', words: s.words, tier, dmg, crit, dodged, chance, od: odTier(s.od), odDmg: dodged ? 0 : o.word });
      hit(to, dmg);
    }
    // the spells, after both strikes, in the same order: the round's spell word, then an overdrive special
    for (const from of [first, 1 - first]) {
      const to = 1 - from, s = sides[from], sp = s.spell, os = s.od && s.od.special;
      if (ko >= 0) break;
      if (sp && SPELLS[sp.id]) {
        const dmg = sp.ok ? spellDamage(sp.id, s.acc) : 0;
        attacks.push({ from, to, kind: 'spell', spell: sp.id, fizzled: !sp.ok, words: 0, tier: 0, dmg, crit: false, dodged: false, chance: 0 });
        hit(to, dmg);
      }
      if (ko >= 0) break;
      if (os && SPELLS[os.id]) {
        const dmg = odd[from] ? odd[from].spell : 0;
        attacks.push({ from, to, kind: 'spell', spell: os.id, od: true, fizzled: !dmg, words: 0, tier: 0, dmg, crit: false, dodged: false, chance: 0 });
        hit(to, dmg);
      }
    }
    const dealt = [0, 1].map(i => attacks.filter(a => a.from === i).reduce((n, a) => n + a.dmg, 0));
    const winner = ko >= 0 ? 1 - ko : dealt[0] > dealt[1] ? 0 : dealt[1] > dealt[0] ? 1 : -1;
    return { attacks, hp, ko, winner, dealt, first };
  }
  // the side the round favours for a beam struggle: more words, then accuracy, then the first to finish
  function favoured(sides, res) {
    const [a, b] = sides;
    if (a.words !== b.words) return a.words > b.words ? 0 : 1;
    if (Math.abs(a.acc - b.acc) > 1e-9) return a.acc > b.acc ? 0 : 1;
    const da = a.doneAt == null ? Infinity : a.doneAt, db = b.doneAt == null ? Infinity : b.doneAt;
    if (da !== db) return da < db ? 0 : 1;
    return res.first;
  }
  function beam(res, sides, rng = Math.random, recent = []) {
    const st = [0, 1].map(i => res.attacks.find(a => a.kind !== 'spell' && a.from === i));
    if (!st[0] || !st[1] || st[0].dodged || st[1].dodged) return null;
    if (st[0].tier < 2 || st[1].tier < 2) return null;
    if (st[0].tier !== st[1].tier && Math.abs(st[0].words - st[1].words) > 1) return null;
    // at most one in four exchanges, never two in a row
    if (recent.slice(-3).some(Boolean)) return null;
    if (rng() >= CONFIG.beamChance) return null;
    const winner = favoured(sides, res), loser = 1 - winner;
    if (res.ko >= 0 && res.ko !== loser) return null;   // the struggle's winner is never the one knocked out
    return { winner, loser };
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
  root.ShowdownRules = { CONFIG, TIERS, SPELLS, OD, tierOf, damage, dodgeChance, spellFor, spellDamage, resolve, beam, favoured, over, accK, hash,
    odState, odStep, odAcc, odWord, odSpecial, odTier, odSpellFor, odDamage };
})(globalThis);
