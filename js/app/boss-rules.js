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
  const BOSS = { name: 'Syntax Error', maxHp: 1000000 };

  // at:      the phase starts when HP left drops to this share
  // cycle:   ms between attacks
  // wind:    ms from the start of a block attack to its hit
  // flight:  ms a thrown word takes to reach the raid
  // pool:    weights for the attack drawn each cycle
  // intro:   attacks forced on the first cycles of the phase so each new one is seen early
  // kinds:   which block attacks the boss uses (they look different and play the same)
  // phrase:  block words are two words long
  // heal:    HP a second each add heals while it lives
  const PHASES = [
    { at: 1.00, name: 'Online',        cycle: 12000, wind: 5600, flight: 6500, shots: 3, adds: 0, heal: 0,
      pool: { slam: 1 }, intro: ['slam'], kinds: ['slam'], phrase: false, weakMult: 2 },
    { at: 0.75, name: 'Corrupted',     cycle: 11000, wind: 5000, flight: 6000, shots: 3, adds: 0, heal: 0,
      pool: { slam: 4, volley: 4, shield: 2 }, intro: ['volley', 'shield'], kinds: ['slam', 'sweep'], phrase: false, weakMult: 2 },
    { at: 0.50, name: 'Memory leak',   cycle: 10000, wind: 4700, flight: 5600, shots: 4, adds: 3, heal: 60,
      pool: { slam: 3, volley: 3, adds: 3, shield: 1 }, intro: ['adds'], kinds: ['sweep', 'lunge'], phrase: false, weakMult: 2 },
    { at: 0.25, name: 'Kernel exposed', cycle: 9000,  wind: 5200, flight: 5000, shots: 4, adds: 3, heal: 80,
      pool: { slam: 4, volley: 3, adds: 2, shield: 2 }, intro: ['slam'], kinds: ['lunge', 'beam'], phrase: true, weakMult: 2 },
    { at: 0.10, name: 'Kernel panic',  cycle: 7500,  wind: 4600, flight: 4400, shots: 5, adds: 4, heal: 100,
      pool: { volley: 3, adds: 2, shield: 1 }, intro: [], kinds: ['slam', 'sweep', 'lunge', 'beam'], phrase: true, weakMult: 3, enrage: true },
  ];
  const ATTACK_NAME = { slam: 'crash', sweep: 'packet flood', lunge: 'fork bomb', beam: 'overload' };

  const FIRST_LEAD = 4000;      // ms from the fight starting to the first attack
  const LEAD = 3500;            // ms from a phase change to its first attack, for the roar
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
  let pools = null;
  // names, places and short forms that slipped into the shared word list
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
  // words in one attack start with different letters so the first key picks one
  function pickWords(r, n, min, max, used = new Set()) {
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
    if (type === 'slam') {
      const kind = P.kinds[Math.floor(r() * P.kinds.length)];
      const word = P.phrase ? pickWords(r, 2, 3, 5).join(' ') : pickWords(r, 1, 5, 7)[0];
      return { id, type, kind, word, start: c0, hit: c0 + P.wind, end: c0 + P.wind + 1400 };
    }
    if (type === 'volley') {
      const n = P.shots, words = pickWords(r, n, 3, 5);
      const shots = words.map((word, i) => {
        const launch = c0 + 1300 + i * 700;
        return { id: id + '.' + i, word, launch, arrive: launch + P.flight, lane: i };
      });
      return { id, type, start: c0, shots, end: shots[n - 1].arrive + 400 };
    }
    if (type === 'adds') {
      const n = P.adds || 3, words = pickWords(r, n, 5, 8);
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
  function base(s, p) { return phaseStart(s, p) + (p ? LEAD : FIRST_LEAD); }

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

  // ---------- damage ----------
  function weakMult(s, now) { return s.weak && now < s.weak.until ? s.weak.mult : 1; }
  function multiplier(s, now, opts = {}) {
    let m = weakMult(s, now) * (opts.crit ? CRIT_X : 1);
    m = Math.min(MAX_X, m);
    return opts.jam ? m * 0.5 : m;
  }

  return {
    BOSS, PHASES, ATTACK_NAME, FIRST_LEAD, LEAD, ADD_LIFE, WEAK_MS, STAGGER_SHARE, RETURN_X, BLOCK_X, CRIT_X, MAX_X,
    phaseOf, ceiling, phaseStart, shieldMax, rng, hash, eventsAt, nextEventAt, multiplier, weakMult,
  };
})();
