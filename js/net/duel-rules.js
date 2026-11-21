// PvP duel rules. Two typists type the same seeded word stream and every correct word
// fires a shot at the other one. The combat layer (js/app/combat/) keeps each side's
// combo, accuracy and spell offers; this file turns its numbers into PvP damage and
// gives each spell its PvP version. No DOM: the sim backend runs it as the "server",
// and a real server runs the same file to rebuild every match from the two key logs.
//
//   const m = DuelRules.match({ seed, words: round => [...], config });
//   m.input(side, k, t)    side 0 or 1, k a character, 'Backspace' or 'CtrlBackspace', t ms on the match clock
//   m.advance(t)           runs hits, statuses, round ends and breaks up to t
//   m.state()              both sides, the round, the phase and the clock
//   m.on(fn)               fn(event) for every event, see NET.md "Duel events"
//   m.result()             null until the match is over, then { winner, wins, rounds, sides }
//   m.log                  [[{ t, k, n }], [{ t, k, n }]] every key each side sent; n is the arrival order across both
//
//   DuelRules.replay({ seed, words, logs, config }) -> result   the server's check
//   DuelRules.CONFIG, DuelRules.PVP                              the numbers, also shown on the help card
(function (root) {
  const CONFIG = {
    hp: 200,            // per round
    winRounds: 2,       // best of 3
    maxRounds: 5,       // drawn rounds can stretch it to 5
    startMs: 3000,      // countdown before round 1
    breakMs: 4000,      // between rounds
    roundMs: 90000,     // a round that runs out of time goes to the side with more HP
    shotMs: 380,        // a word's shot takes this long to land: long enough to read the word in flight
    multCap: 3.5,       // tier x accuracy x speed x buffs, capped lower than the boss's 6
    critX: 1.5,
    offerMs: 12000,
    // spells come sooner than on the boss since a duel round is short: combo 6, 15, 25, 40, 50, then every 25
    offerAt: [6, 15, 25, 40, 50],
  };

  // Each spell's PvP version. hits: [ms after the cast, power]. Power is scaled by the
  // caster's accuracy and buffs like a PvE spell, without the combo tier.
  const PVP = {
    'data-spike': { hits: [[320, 9], [470, 9], [620, 9]], text: '3 hits of 9.' },
    'safe-mode': { hits: [], ward: true, text: 'Blocks the next shot or spell aimed at you.' },
    'binary-rain': { hits: [[450, 4], [750, 4], [1050, 4], [1350, 4], [1650, 4], [1950, 4]], fog: 4, text: '6 hits of 4 and blurs the next 4 words on their screen.' },
    'echo-pulse': { hits: [], echo: 0.5, text: 'Sends half the damage of your last 8 words again.' },
    'glitch-blade': { hits: [[230, 30]], wardBreak: true, corrupt: { ms: 6000, tick: 2 }, text: '30, goes through a shield and deals double when it breaks one. Then corrupts them: 2 a second for 6 seconds.' },
    'cryo-lock': { hits: [[600, 12]], freeze: 4000, text: '12 and halves their word damage for 4 seconds.' },
    'electro-storm': { hits: [[800, 5], [1180, 5], [1560, 5], [1940, 5], [2320, 5], [2700, 5], [3080, 5]], text: '7 hits of 5.' },
    'hyper-thread': { hits: [], hyper: { ms: 6000, mult: 1.5 }, text: 'Your words deal 1.5 times damage for 6 seconds.' },
    'packet-storm': { hits: Array.from({ length: 16 }, (_, i) => [1000 + i * 85, 2]), reflect: { ms: 5000, k: 0.5 }, text: '16 hits of 2. For 5 seconds half of every shot that hits you goes back.' },
    'neon-nova': { hits: [[480, 45]], dispel: true, text: '45 and removes their shield and buffs.' },
    'system-purge': { hits: [[700, 25]], cleanse: 6000, text: '25, clears blur, freeze, lock and corruption from you and keeps them off for 6 seconds.' },
    'void-sphere': { hits: [[1000, 3], [1260, 3], [1520, 3], [1780, 3], [2040, 3], [2300, 3], [2900, 70]], text: '6 hits of 3, then 70.' },
    'kernel-panic': { hits: [[380, 20]], lock: 1500, crits: 3, text: '20, locks their keys for 1.5 seconds and your next 3 words crit.' },
    'root-access': { hits: [[500, 10]], root: { ms: 5000, mult: 1.5 }, text: '10, then your hits go through shields and deal 1.5 times damage for 5 seconds.' },
    'quantum-split': { hits: [], text: 'Your next 2 typos keep your combo.' },
    'zero-day': { hits: [[2000, 250]], pierce: true, text: '250, through shields.' },
  };

  const Cb = () => root.Combat;
  const R = s => root.NetCore.rng(s);

  function match({ seed, words, config = {} }) {
    const cfg = { ...CONFIG, ...config };
    const bus = root.NetCore.emitter();
    const emit = ev => bus.emit('ev', ev);
    let clock = 0, phase = 'count', round = 0, roundAt = cfg.startMs, roundEnd = 0, breakUntil = 0;
    let result = null;
    const wins = [0, 0], rounds = [], queue = [];   // queue: { at, fn } sorted by at
    const log = [[], []];
    let S = [null, null], seq = 0;

    const blankStats = () => ({ keys: 0, good: 0, words: 0, wrong: 0, typos: 0, chars: 0, dmg: 0, taken: 0, blocks: 0, bestCombo: 0, spells: [], fizzles: 0, ms: 0 });

    function side(i, r) {
      const list = words(r) || [];
      const s = { i, hp: cfg.hp, list, idx: 0, stats: blankStats(), recent: [], fog: 0, frozen: 0, locked: 0, corrupt: 0, corruptN: 0, immune: 0, reflect: 0 };
      s.eng = Cb().create({ rng: R(`${seed}:${r}:${i}`), now: () => clock, offerMs: cfg.offerMs,
        offerAt: n => cfg.offerAt.includes(n) || (n > 50 && n % 25 === 0), offerSize: n => (n < 15 ? 2 : 3) });
      s.ty = root.NetTypist.create({
        stream: () => s.list[s.idx % Math.max(1, s.list.length)] || '',
        extras: () => { const o = s.eng.offer(); return o ? o.spells.map(id => ({ id: 'spell:' + id, word: Cb().spell(id).word, kind: 'spell', spell: id })) : []; },
      });
      s.eng.on('spellOffer', o => emit({ type: 'offer', side: i, spells: o.spells.map(x => x.id), until: o.until, at: clock }));
      s.eng.on('offerEnd', o => emit({ type: 'offerEnd', side: i, reason: o.reason, at: clock }));
      s.eng.on('combo', c => { s.stats.bestCombo = Math.max(s.stats.bestCombo, c.combo); emit({ type: 'combo', side: i, combo: c.combo, tier: c.tier, from: c.from, reason: c.reason, at: clock }); });
      s.eng.on('status', st => { if (st.name !== 'stunned-target' && st.name !== 'frozen-target' && st.name !== 'cleanse') emit({ type: 'status', side: i, name: st.name, on: st.on, until: st.until || 0, at: clock }); });
      s.eng.on('guard', () => emit({ type: 'guard', side: i, at: clock }));
      return s;
    }

    function schedule(at, fn) {
      let k = queue.length;
      while (k > 0 && queue[k - 1].at > at) k--;
      queue.splice(k, 0, { at, fn });
    }

    function startRound(at) {
      clock = at;
      round++;
      queue.length = 0;
      S = [side(0, round), side(1, round)];
      phase = 'fight'; roundAt = at;
      emit({ type: 'round', phase: 'start', round, at });
    }

    function endRound(at) {
      if (phase !== 'fight') return;
      clock = at;
      const [a, b] = S;
      let winner = -1;
      if (a.hp !== b.hp) winner = a.hp > b.hp ? 0 : 1;
      if (winner >= 0) wins[winner]++;
      const ms = at - roundAt;
      const rs = S.map(s => {
        s.stats.ms = ms;
        s.eng.closeOffer('round');
        return { ...s.stats, spells: s.stats.spells.slice(), hp: Math.max(0, s.hp), wpm: ms > 0 ? Math.round(s.stats.chars / 5 / (ms / 60000)) : 0, acc: s.stats.keys ? Math.round(1000 * s.stats.good / s.stats.keys) / 10 : 100 };
      });
      rounds.push({ round, winner, ms, sides: rs });
      phase = 'break'; roundEnd = at; queue.length = 0;
      emit({ type: 'round', phase: 'end', round, winner, wins: wins.slice(), at, sides: rs });
      if (wins[0] >= cfg.winRounds || wins[1] >= cfg.winRounds || round >= cfg.maxRounds) finish(at);
      else breakUntil = at + cfg.breakMs;
    }

    function finish(at) {
      phase = 'over';
      const tot = i => rounds.reduce((n, r) => n + r.sides[i].dmg, 0);
      let winner = wins[0] === wins[1] ? (tot(0) === tot(1) ? -1 : tot(0) > tot(1) ? 0 : 1) : wins[0] > wins[1] ? 0 : 1;
      result = { winner, wins: wins.slice(), rounds: rounds.map(r => ({ ...r })), sides: [0, 1].map(i => summarize(i)), at };
      emit({ type: 'end', ...result });
    }

    function summarize(i) {
      const rs = rounds.map(r => r.sides[i]);
      const sum = k => rs.reduce((n, r) => n + (r[k] || 0), 0);
      const ms = sum('ms'), keys = sum('keys'), good = sum('good');
      return {
        wpm: ms > 0 ? Math.round(sum('chars') / 5 / (ms / 60000)) : 0,
        acc: keys ? Math.round(1000 * good / keys) / 10 : 100,
        bestCombo: rs.reduce((m, r) => Math.max(m, r.bestCombo), 0),
        dmg: sum('dmg'), taken: sum('taken'), words: sum('words'), wrong: sum('wrong'), typos: sum('typos'), blocks: sum('blocks'),
        spells: rs.flatMap(r => r.spells), keys, good, chars: sum('chars'), ms,
      };
    }

    // ---------- damage ----------
    const other = i => S[1 - i];
    function land(from, dmg, kind, extra = {}) {
      const a = S[from], b = other(from);
      if (phase !== 'fight') return;
      if (b.eng.status('ward') && !extra.pierce && kind !== 'reflect') {
        b.eng.consume('ward'); b.stats.blocks++;
        emit({ type: 'block', side: b.i, from, kind, spell: extra.spell || null, at: clock });
        return;
      }
      b.hp -= dmg; b.stats.taken += dmg; a.stats.dmg += dmg;
      emit({ type: 'hit', side: from, to: b.i, dmg, kind, spell: extra.spell || null, crit: !!extra.crit, tier: extra.tier || 0, hp: b.hp, at: clock });
      if (kind === 'word' && b.reflect > clock) {
        const back = Math.max(1, Math.round(dmg * PVP['packet-storm'].reflect.k));
        schedule(clock + cfg.shotMs, () => land(b.i, back, 'reflect'));
      }
      if (b.hp <= 0) endRound(clock);
    }

    function debuff(target, name, val, o = {}) {
      const t = S[target];
      if (t.immune > clock) { emit({ type: 'effect', side: target, name, resisted: true, at: clock }); return; }
      if (name === 'fog') t.fog = Math.max(t.fog, val);
      if (name === 'frozen') t.frozen = clock + val;
      if (name === 'locked') t.locked = clock + val;
      // corruption: damage every second; a new one replaces the old, and a cleanse stops it
      if (name === 'corrupt') {
        t.corrupt = clock + val;
        const n = ++t.corruptN, from = 1 - target;
        for (let k = 1; k * 1000 <= val; k++) schedule(clock + k * 1000, () => { if (t.corruptN === n && t.corrupt >= clock) land(from, o.tick, 'dot', { pierce: true }); });
      }
      emit({ type: 'effect', side: target, name, ms: name === 'fog' ? 0 : val, n: name === 'fog' ? val : 0, until: name === 'fog' ? 0 : clock + val, at: clock });
    }

    function onWord(s, sub, t) {
      const st = s.stats;
      if (sub.kind === 'spell') {
        const res = s.eng.cast(sub.word, { clean: sub.clean });
        if (!res) return;
        if (res.fizzled) { st.fizzles++; st.typos++; emit({ type: 'fizzle', side: s.i, spell: res.spell.id, at: t }); return; }
        st.chars += sub.word.length + 1;
        cast(s, res.spell.id, t);
        return;
      }
      // the stream: right or wrong, the stream moves on
      s.idx++;
      if (s.fog > 0) s.fog--;
      if (!sub.ok) {
        st.wrong++;
        s.eng.miss('wrong');
        emit({ type: 'miss', side: s.i, word: sub.word, typed: sub.typed, at: t });
        return;
      }
      if (!sub.clean) st.typos++;
      st.words++; st.chars += sub.word.length + 1;
      const r = s.eng.word({ letters: sub.letters, clean: sub.clean, ms: sub.ms });
      let dmg = sub.letters * Math.min(r.mult, cfg.multCap);
      if (s.frozen > t) dmg *= 0.5;
      if (r.crit) dmg *= cfg.critX;
      dmg = Math.max(1, Math.round(dmg));
      s.recent.push(dmg); if (s.recent.length > 8) s.recent.shift();
      const pierce = !!s.eng.status('root');
      emit({ type: 'shot', side: s.i, to: 1 - s.i, dmg, tier: r.tier, combo: r.combo, crit: r.crit, word: sub.word, landAt: t + cfg.shotMs, at: t });
      schedule(t + cfg.shotMs, () => land(s.i, dmg, 'word', { crit: r.crit, tier: r.tier, pierce }));
    }

    function cast(s, id, t) {
      const P = PVP[id] || { hits: [] };
      const e = s.eng;
      s.stats.spells.push(id);
      // the combat layer started its PvE statuses; swap in the PvP numbers
      e.end('stunned-target'); e.end('frozen-target'); e.end('purge');
      if (P.hyper) e.start('hyper', P.hyper);
      if (P.root) e.start('root', { ...P.root, pierce: true });
      if (P.crits) e.start('crits', { charges: P.crits, ms: 20000 });
      const D = Cb().Damage;
      const sm = Math.min(2.25, (e.status('hyper') ? e.status('hyper').mult : 1) * (e.status('root') ? e.status('root').mult : 1));
      const k = D.accMult(e.acc()) * sm;
      let hits = P.hits.map(([at, p]) => ({ at, dmg: Math.max(1, Math.round(p * k)) }));
      if (P.echo) hits = s.recent.slice(-8).map((d, n) => ({ at: 500 + n * 120, dmg: Math.max(1, Math.round(d * P.echo)) }));
      const b = other(s.i);
      const pierce = !!P.pierce || !!e.status('root');
      let blocked = false, broke = false;
      if (hits.length && b.eng.status('ward')) {
        if (P.wardBreak) { b.eng.consume('ward'); broke = true; hits = hits.map(h => ({ ...h, dmg: h.dmg * 2 })); emit({ type: 'effect', side: b.i, name: 'shieldBroken', at: t }); }
        else if (!pierce) { b.eng.consume('ward'); blocked = true; b.stats.blocks++; emit({ type: 'block', side: b.i, from: s.i, kind: 'spell', spell: id, at: t }); }
      }
      emit({ type: 'cast', side: s.i, to: b.i, spell: id, hits: hits.map(h => ({ at: t + h.at, dmg: h.dmg })), blocked, broke, at: t });
      if (blocked) return;
      for (const h of hits) schedule(t + h.at, () => land(s.i, h.dmg, 'spell', { spell: id, pierce: true }));
      const when = t + (P.hits[0] ? P.hits[0][0] : 250);
      if (P.fog) schedule(when, () => debuff(b.i, 'fog', P.fog));
      if (P.freeze) schedule(when, () => debuff(b.i, 'frozen', P.freeze));
      if (P.lock) schedule(when, () => debuff(b.i, 'locked', P.lock));
      if (P.corrupt) schedule(when, () => debuff(b.i, 'corrupt', P.corrupt.ms, { tick: P.corrupt.tick }));
      if (P.reflect) { s.reflect = t + P.reflect.ms; emit({ type: 'effect', side: s.i, name: 'reflect', until: s.reflect, at: t }); }
      if (P.cleanse) { s.fog = 0; s.frozen = 0; s.locked = 0; s.corrupt = 0; s.immune = t + P.cleanse; emit({ type: 'effect', side: s.i, name: 'cleanse', until: s.immune, at: t }); }
      if (P.dispel) schedule(when, () => {
        for (const n of ['ward', 'hyper', 'root', 'split', 'crits']) b.eng.end(n);
        b.reflect = 0;
        emit({ type: 'effect', side: b.i, name: 'dispel', at: clock });
      });
    }

    // ---------- the clock ----------
    function advance(t) {
      for (let guard = 0; guard < 10000; guard++) {
        if (phase === 'over') break;
        let next = Infinity, kind = '';
        if (phase === 'count' || phase === 'break') { next = phase === 'count' ? roundAt : breakUntil; kind = 'start'; }
        if (phase === 'fight') {
          next = roundAt + cfg.roundMs; kind = 'timeout';
          if (queue.length && queue[0].at <= next) { next = queue[0].at; kind = 'q'; }
        }
        if (next > t) break;
        if (kind === 'start') startRound(next);
        else if (kind === 'timeout') endRound(next);
        else { const q = queue.shift(); clock = Math.max(clock, q.at); q.fn(); }
      }
      clock = Math.max(clock, t);
      if (phase === 'fight') for (const s of S) s.eng.tick();
    }

    function input(i, k, t) {
      if (phase === 'over') return null;
      t = Math.max(t, clock);
      advance(t);
      log[i].push({ t, k, n: seq++ });
      if (phase !== 'fight') return null;
      const s = S[i];
      if (s.locked > t) { emit({ type: 'locked', side: i, at: t }); return null; }
      const r = s.ty.key(k, t);
      if (!r) return null;
      if (r.key) {
        s.stats.keys++;
        if (r.good) s.stats.good++;
        else { emit({ type: 'typo', side: i, at: t }); }
        s.eng.key(r.good);
      }
      if (r.submit) { s.stats.keys++; s.stats.good += r.submit.ok ? 1 : 0; onWord(s, r.submit, t); }
      return r;
    }

    function state() {
      return {
        phase, round, clock, roundAt, roundMs: cfg.roundMs, breakUntil, wins: wins.slice(), hpMax: cfg.hp,
        sides: S.map((s, i) => s ? {
          hp: Math.max(0, s.hp), idx: s.idx, typed: s.ty.state().typed, target: s.ty.state().target, clean: s.ty.state().clean,
          combo: s.eng.state().combo, tier: s.eng.state().tier, acc: Math.round(s.eng.acc() * 1000) / 10,
          offer: s.eng.offer() ? s.eng.offer().spells.slice() : [], offerUntil: s.eng.offer() ? s.eng.offer().until : 0,
          statuses: s.eng.statuses().filter(x => !['stunned-target', 'frozen-target', 'cleanse', 'purge'].includes(x.name)).map(x => ({ name: x.name, until: x.until, charges: x.charges })),
          fog: s.fog, frozen: Math.max(0, s.frozen - clock), locked: Math.max(0, s.locked - clock), corrupt: Math.max(0, s.corrupt - clock), immune: Math.max(0, s.immune - clock), reflect: Math.max(0, s.reflect - clock),
          stats: { ...s.stats, spells: s.stats.spells.slice() },
          liveWpm: clock > roundAt ? Math.round(s.stats.chars / 5 / ((clock - roundAt) / 60000)) : 0,
        } : { hp: cfg.hp, idx: 0, typed: '', combo: 0, tier: 0, acc: 100, offer: [], statuses: [], fog: 0, frozen: 0, locked: 0, corrupt: 0, stats: blankStats(), liveWpm: 0 }),
      };
    }

    return {
      input, advance, state, log, cfg,
      on: fn => bus.on('ev', fn),
      result: () => result,
      words: r => (S[0] && round === r ? S[0].list : words(r)),
      // for tests: end the current round with side i ahead
      debug: { hp: (i, v) => { if (S[i]) S[i].hp = v; }, side: i => S[i] },
    };
  }

  // The server's check: rebuild the match from the two key logs alone.
  function replay({ seed, words, logs, config, until }) {
    const m = match({ seed, words, config });
    const all = [];
    logs.forEach((l, side) => l.forEach(e => all.push({ ...e, side })));
    // n is the order the server received the keys in; logs without it fall back to time, then side
    all.sort((a, b) => (a.n != null && b.n != null ? a.n - b.n : a.t - b.t || a.side - b.side));
    for (const e of all) m.input(e.side, e.k, e.t);
    m.advance(until != null ? until : (all.length ? all[all.length - 1].t : 0) + 600000);
    return m;
  }

  root.DuelRules = { CONFIG, PVP, match, replay };
})(globalThis);
