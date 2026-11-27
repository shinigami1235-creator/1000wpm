// World boss rules shared by the page, LocalDemo and a future server.
// Everything here is a pure function of the boss state and the clock:
//   phaseOf(frac)            the phase for a share of HP left
//   eventsAt(state, now)     the attacks running at that moment
//   nextEventAt(state, now)  when the next attack starts
// The attack schedule comes from a seeded random generator keyed on the boss
// id, the phase and the cycle number, so every client sees the same attacks
// with the same words at the same time without any extra messages.
window.WorldBossRules = (() => {
  // The boss and phase names. Change them here.
  const BOSS = { name: 'Syntax Error', maxHp: Math.round(1000000 * (typeof Combat !== 'undefined' && Combat.hpScale ? Combat.hpScale('boss') : 1)) };

  // at:      the phase starts when HP left drops to this share
  // cycle:   ms between attacks
  // wind:    ms from the start of a block attack to its hit
  // flight:  ms a thrown word takes to reach the raid
  // pool:    weights for the attack drawn each cycle
  // intro:   attacks forced on the first cycles of the phase so each new one is seen early
  // kinds:   which block attacks the boss uses (they look different and play the same)
  // phrase:  block words are two words long
  // heal:    HP a second each add heals while it lives
  // diff:    word bank difficulty for the attack words (WordBank.meta score, 1 to 10)
  // Attack timing follows The Typing of the Dead (Gid's footage, 26 Nov 2026): the warning comes
  // 2 to 3.5 s before the hit and the next attack is 5 to 9 s away. The counter phrase shows in
  // each raider's word line later than the wind-up, as late as their own speed allows (boss.js).
  // lead:    ms from this phase starting to its first attack, longer where the armour breaks off
  // Gid, 26 Nov 2026: big wound-up attacks on top of the quick slam, and the armour coming off.
  //   charge   it pulls back a glowing fist for about 6 s while a break bar fills from the whole
  //            raid's damage; break it and the boss staggers with its kernel open, miss it and the
  //            punch takes two pips from everyone
  //   laser    it backs off into the arena and charges a beam at its core for 4.4 s; a two-word
  //            red phrase in your line blocks it
  // Phases 1 and 2 it's in full armour, from 50% the plates are off its arms and its wireframe
  // shows, and from 25% it's bare and faster.
  const PHASES = [
    { at: 1.00, name: 'Online',        cycle: 9000,  wind: 3600, flight: 6500, shots: 3, adds: 0, heal: 0,
      pool: { slam: 3, charge: 2 }, intro: ['slam', 'charge'], kinds: ['slam'], phrase: false, weakMult: 2, diff: [2, 4] },
    { at: 0.75, name: 'Corrupted',     cycle: 8500,  wind: 3400, flight: 6000, shots: 3, adds: 0, heal: 0,
      pool: { slam: 3, charge: 2, volley: 3, shield: 2 }, intro: ['volley', 'shield'], kinds: ['slam', 'sweep'], phrase: false, weakMult: 2, diff: [3, 5] },
    { at: 0.50, name: 'Memory leak',   cycle: 8000,  wind: 3200, flight: 5600, shots: 4, adds: 3, heal: 60, lead: 5000,
      pool: { slam: 2, laser: 3, charge: 1, volley: 2, adds: 2 }, intro: ['laser', 'adds'], kinds: ['sweep', 'lunge'], phrase: false, weakMult: 2, diff: [3, 6] },
    { at: 0.25, name: 'Kernel exposed', cycle: 7000, wind: 3200, flight: 5000, shots: 5, adds: 3, heal: 80, lead: 5000,
      pool: { slam: 2, laser: 2, charge: 2, volley: 3, shield: 2, adds: 1 }, intro: ['charge', 'volley'], kinds: ['lunge', 'beam'], phrase: true, weakMult: 2, diff: [4, 6] },
    { at: 0.10, name: 'Kernel panic',  cycle: 4500,  wind: 2800, flight: 4400, shots: 5, adds: 4, heal: 100,
      pool: { volley: 3, adds: 2, shield: 1 }, intro: [], kinds: ['slam', 'sweep', 'lunge', 'beam'], phrase: true, weakMult: 3, enrage: true, diff: [4, 7] },
  ];
  const ATTACK_NAME = { slam: 'crash', sweep: 'packet flood', lunge: 'fork bomb', beam: 'overload', laser: 'kernel laser', charge: 'overflow punch' };
  const CHARGE_WIND = 6500, CHARGE_OPEN = 700, LASER_WIND = 4400;
  const BREAK_PER_RAIDER = 28;  // break bar for each raider: a full raid breaks it in the last second or so

  const FIRST_LEAD = 4000;      // ms from the fight starting to the first attack
  const LEAD = 3500;            // ms from a phase change to its first attack, for the roar
  // At 50% and 25% the boss's armour breaks off (boss.js and boss3d.js): it's thrown back as the
  // plates fly, then roars into the next phase, so those phases start a little later.
  const ARMOUR_PHASES = [2, 3];
  const ADD_LIFE = 20000;       // an add heals for this long unless someone destroys it
  const WEAK_MS = 6000;         // weak point window after a stagger or a shield break
  const STAGGER_SHARE = 0.5;    // share of raiders who must block for the boss to be stunned
  const SHIELD_PER_RAIDER = 90; // shield HP for each raider in the fight
  const RETURN_X = 3;           // a word sent back deals this many times its letters
  const BLOCK_X = 4;            // a blocked attack hits back for this many times its letters
  const CRIT_X = 2;
  const MAX_X = 3;              // weak point and crit together never pass x3

  const phaseOf = f => PHASES.reduce((p, ph, i) => (i && f <= ph.at ? i : p), 0);
  const ceiling = (p, maxHp) => Math.floor(PHASES[p].at * maxHp);
  const phaseStart = (s, p) => (s.phaseAt && s.phaseAt[p]) || s.startedAt;
  const shieldMax = raiders => SHIELD_PER_RAIDER * Math.max(5, raiders);
  const breakMax = raiders => BREAK_PER_RAIDER * Math.max(5, raiders);

  // ---------- seeded random ----------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(key) {
    let a = hash(key);
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- words ----------
  // Attack words come from the word bank: common words and the cyber pack, at the
  // phase's difficulty. The pick is seeded by the attack's rng, so every raider gets
  // the same words. Words in one attack start with different letters so the first
  // key picks one. Without the word bank the old list in words.js is used.
  const THEME = ['common', 'cyber'];
  let pools = null;
  const SKIP = new Set(['henry', 'harry', 'smith', 'frank', 'luke', 'miller', 'ford', 'ireland', 'wales', 'turkey', 'asia', 'angeles', 'sydney', 'dallas',
    'zealand', 'kong', 'hong', 'san', 'jews', 'muslims', 'catholic', 'bbc', 'fbi', 'ceo', 'dna', 'ltd', 'pre', 'haha', 'thats', 'dude', 'kinda']);
  function pool(min, max) {
    pools ||= {};
    const k = min + '-' + max;
    if (!pools[k]) {
      const src = (window.WORDS && WORDS.common) || ['error', 'stack', 'crash', 'flush', 'patch', 'debug', 'merge', 'cache', 'parse', 'fetch'];
      pools[k] = src.filter(w => /^[a-z]+$/.test(w) && w.length >= min && w.length <= max && !SKIP.has(w));
    }
    return pools[k];
  }
  function pickWords(r, n, min, max, used = new Set(), p = 0) {
    if (window.WordBank) {
      const out = WordBank.pick({ count: n, rng: r, minLen: min, maxLen: max, theme: THEME, difficulty: PHASES[p].diff, avoidFirstLetters: used, distinctFirst: true })
        .filter(w => /^[a-z]+$/.test(w));
      if (out.length === n) { out.forEach(w => used.add(w[0])); return out; }
    }
    const list = pool(min, max), out = [];
    for (let i = 0; i < n; i++) {
      let w = list[Math.floor(r() * list.length)];
      for (let k = 0; k < 20 && (used.has(w[0]) || out.includes(w)); k++) w = list[Math.floor(r() * list.length)];
      used.add(w[0]); out.push(w);
    }
    return out;
  }
  function pickType(r, weights) {
    const ks = Object.keys(weights), tot = ks.reduce((a, k) => a + weights[k], 0);
    let x = r() * tot;
    for (const k of ks) { x -= weights[k]; if (x < 0) return k; }
    return ks[0];
  }

  // ---------- schedule ----------
  function make(s, p, type, id, c0, r) {
    const P = PHASES[p];
    if (type === 'laser') {
      // a block attack like the slam, with its own look, a longer wind-up and a two-word phrase
      const word = pickWords(r, 2, 4, 6, new Set(), p).join(' ');
      return { id, type: 'slam', kind: 'laser', word, start: c0, hit: c0 + LASER_WIND, end: c0 + LASER_WIND + 1600 };
    }
    if (type === 'charge') {
      const wind = Math.min(CHARGE_WIND, P.cycle - 1900);
      return { id, type: 'charge', kind: 'charge', start: c0, open: c0 + CHARGE_OPEN, hit: c0 + wind, end: c0 + wind + 1400 };
    }
    if (type === 'slam') {
      const kind = P.kinds[Math.floor(r() * P.kinds.length)];
      const word = P.phrase ? pickWords(r, 2, 3, 5, new Set(), p).join(' ') : pickWords(r, 1, 5, 7, new Set(), p)[0];
      return { id, type, kind, word, start: c0, hit: c0 + P.wind, end: c0 + P.wind + 1400 };
    }
    if (type === 'volley') {
      const n = P.shots, words = pickWords(r, n, 3, 5, new Set(), p);
      const shots = words.map((word, i) => {
        const launch = c0 + 1300 + i * 700;
        return { id: id + '.' + i, word, launch, arrive: launch + P.flight, lane: i };
      });
      return { id, type, start: c0, shots, end: shots[n - 1].arrive + 400 };
    }
    if (type === 'adds') {
      const n = P.adds || 3, words = pickWords(r, n, 5, 8, new Set(), p);
      const adds = words.map((word, i) => {
        const spawn = c0 + 1600 + i * 350;
        return { id: id + '.' + i, word, slot: i, spawn, until: spawn + ADD_LIFE };
      });
      return { id, type, start: c0, adds, heal: P.heal, end: adds[n - 1].until };
    }
    return { id, type: 'shield', start: c0, up: c0 + 1600, end: c0 + 2400 };
  }
  function cycle(s, p, k, base) {
    const P = PHASES[p];
    const r = rng(`${s.bossId}|${p}|${k}`);
    const c0 = base + k * P.cycle;
    const out = [];
    if (P.enrage) {
      // enraged: a block attack every cycle and a second attack halfway through it
      out.push(make(s, p, 'slam', `${p}.${k}`, c0, r));
      out.push(make(s, p, pickType(r, P.pool), `${p}.${k}b`, c0 + P.cycle / 2, r));
    } else {
      out.push(make(s, p, P.intro[k] || pickType(r, P.pool), `${p}.${k}`, c0, r));
    }
    return out;
  }
  function base(s, p) { return phaseStart(s, p) + (p ? PHASES[p].lead || LEAD : FIRST_LEAD); }

  // every attack whose time span includes now
  function eventsAt(s, now, slack = 0) {
    if (!s || s.defeatedAt) return [];
    const p = s.phase || 0, P = PHASES[p], b = base(s, p);
    if (now < b) return [];
    const k1 = Math.floor((now - b) / P.cycle);
    const back = Math.ceil((ADD_LIFE + 4000) / P.cycle);
    const out = [];
    for (let k = Math.max(0, k1 - back); k <= k1; k++) {
      for (const e of cycle(s, p, k, b)) if (e.start <= now && e.end + slack >= now) out.push(e);
    }
    return out;
  }
  function nextEventAt(s, now) {
    if (!s || s.defeatedAt) return null;
    const p = s.phase || 0, P = PHASES[p], b = base(s, p);
    if (now < b) return b;
    const k = Math.floor((now - b) / P.cycle) + 1;
    if (P.enrage) {
      const half = b + (k - 1) * P.cycle + P.cycle / 2;
      return half > now ? half : b + k * P.cycle;
    }
    return b + k * P.cycle;
  }

  // ---------- words sized to the typist ----------
  // A block attack hits every raider at the same moment, so a slower typist gets a
  // shorter word in the same window instead of more time (Art and Gid, 24 Nov 2026).
  // The pick is seeded on the attack and the tier, so a server can check it.
  //   tierOf(wpm)        0 under 30 wpm, 1 under 60, 2 under 100, 3 from 100 (the full attack word)
  //   blockWord(e, tier) the word that tier types to block attack e
  const TIERS = [{ upTo: 30, min: 2, max: 4 }, { upTo: 60, min: 3, max: 5 }, { upTo: 100, min: 4, max: 6 }];
  const tierOf = wpm => { const i = TIERS.findIndex(t => (wpm || 0) < t.upTo); return i < 0 ? 3 : i; };
  function blockWord(e, tier) {
    if (!e || !e.word || tier >= 3 || tier == null) return e && e.word;
    const T = TIERS[tier];
    return pickWords(rng(`${e.id}|t${tier}`), 1, T.min, T.max, new Set(), 0)[0];
  }

  // ---------- covering a teammate (Art, 27 Nov 2026: "yay it's team work") ----------
  // Each raider has one segment of the raid's shield for a block attack and locks it by typing their
  // own block word. Once theirs is done, anyone can lock a teammate's segment for them by typing that
  // segment's cover word, a short word seeded on the attack and the raider, so a server can check it.
  // Every segment locked before the hit is a full team block.
  //   coverWord(e, raiderId)  the word that covers raiderId against attack e
  //   COVER_AFTER             ms after an attack starts before anyone can cover someone else
  const COVER_AFTER = 800;
  function coverWord(e, raiderId) { return pickWords(rng(`${e.id}|c|${raiderId}`), 1, 3, 5, new Set(), 0)[0]; }

  // ---------- damage ----------
  function weakMult(s, now) { return s.weak && now < s.weak.until ? s.weak.mult : 1; }
  // ---------- the team firewall (Gid, 25 Nov 2026: try it first) ----------
  // The raid's teamwork fills one meter, 0 to 100. Blocks, packets sent back and bugs
  // deleted fill it, it drains a little every second, and an attack most of the raid
  // failed to block knocks a chunk off.
  //   50  Hardened     boss attacks do half damage to operators
  //   75  Overclocked  every raider's hits deal x1.2
  //   100 Root access  10 s of x1.5 hits that go through the boss's firewall, then the meter drops to 40
  const TEAM = { block: 0.5, stun: 8, ret: 1, add: 2, drain: 0.5, miss: 12, root: 10000, after: 40,
    tiers: [{ at: 50, id: 'hardened', name: 'Hardened', text: 'Boss attacks do half damage to operators' },
            { at: 75, id: 'overclock', name: 'Overclocked', text: 'Every hit deals x1.2' },
            { at: 100, id: 'root', name: 'Root access', text: 'x1.5 hits through the firewall for 10 s' }] };
  const teamOf = s => s.team || { fw: 0, rootUntil: 0 };
  function teamRoot(s, now) { return teamOf(s).rootUntil > now; }
  function teamMult(s, now) { const T = teamOf(s); return T.rootUntil > now ? 1.5 : T.fw >= 75 ? 1.2 : 1; }
  function teamGuard(s, now) { const T = teamOf(s); return T.rootUntil > now || T.fw >= 50 ? 0.5 : 1; }
  function multiplier(s, now, opts = {}) {
    let m = weakMult(s, now) * (opts.crit ? CRIT_X : 1) * teamMult(s, now);
    m = Math.min(MAX_X, m);
    return opts.jam ? m * 0.5 : m;
  }

  return {
    BOSS, PHASES, ATTACK_NAME, FIRST_LEAD, LEAD, ARMOUR_PHASES, CHARGE_WIND, LASER_WIND, breakMax, ADD_LIFE, WEAK_MS, STAGGER_SHARE, RETURN_X, BLOCK_X, CRIT_X, MAX_X,
    phaseOf, ceiling, phaseStart, shieldMax, rng, hash, eventsAt, nextEventAt, multiplier, weakMult,
    TEAM, teamMult, teamGuard, teamRoot,
    TIERS, tierOf, blockWord, pickWords, coverWord, COVER_AFTER,
  };
})();
