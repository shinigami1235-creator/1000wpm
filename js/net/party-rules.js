// Co-op party runs: up to 4 typists fight a chain of bosses through Keyspace areas.
// Each player has a role, the team shares one HP bar and one team combo, and the
// combat layer (js/app/combat/) gives each player their own combo, accuracy and
// spells. No DOM: the sim backend runs this as the server, the same as DuelRules.
//
// Roles
//   striker  words deal 1.3 times damage
//   guard    only guards can type the counter word that blocks a boss attack for the whole
//            team (anyone can when the party has no guard); a block hits back for 4 per letter
//   support  clean words fill the team meter faster; when it is full the support types
//            patch (team HP +20), overclock (team damage 1.5 times for 8 s) or firewall (blocks the next attack)
//
//   const run = PartyRules.run({ seed, run: 'relay', difficulty: 'normal', players, words, counters, art, config });
//   run.input(playerId, k, t), run.advance(t), run.state(), run.on(fn), run.result()
//   players: [{ id, name, role, bot }]
//   words(playerId, fight) -> [word]   counters(fight) -> [word]
//   art: { fight, ms } or null         when Art drops in (simulated now; the server decides later). While he is
//                                      in, team damage is 1.2 times, attacks warn 1.5 s earlier, he calls them out
//                                      and the run pays 1.5 times the coins. His lines are placeholders until Art writes his own.
(function (root) {
  const AREAS = {
    relay: { area: 'Chat relay', boss: 'Spam Hydra', look: 0, hp: 1200, every: [9000, 12500], dmg: 16, windup: 5000 },
    market: { area: 'Market net', boss: 'Cache Wraith', look: 1, hp: 1500, every: [8500, 12000], dmg: 17, windup: 4800 },
    transit: { area: 'Line 2 control', boss: 'Null Conductor', look: 2, hp: 1850, every: [8000, 11000], dmg: 18, windup: 4600 },
    firmware: { area: 'Firmware line', boss: 'Patch Golem', look: 3, hp: 2250, every: [7500, 10500], dmg: 19, windup: 4400 },
    core: { area: 'Fixword core', boss: 'Syntax Echo', look: 4, hp: 2700, every: [7000, 10000], dmg: 20, windup: 4200 },
  };
  const RUNS = {
    relay: { id: 'relay', name: 'Relay run', fights: ['relay', 'market', 'transit'] },
    deep: { id: 'deep', name: 'Deep run', fights: ['relay', 'market', 'transit', 'firmware', 'core'] },
  };
  const DIFF = { easy: { hp: 0.7, dmg: 0.75 }, normal: { hp: 1, dmg: 1 }, hard: { hp: 1.35, dmg: 1.5 } };
  const ROLES = {
    striker: { name: 'Striker', mult: 1.3, meter: 2, text: 'Your words deal 1.3 times damage.' },
    guard: { name: 'Guard', mult: 1, meter: 2, text: 'Type the counter word to block a boss attack for the whole team.' },
    support: { name: 'Support', mult: 0.85, meter: 7, text: 'Fill the team meter and type a buff when it is full.' },
  };
  const BUFFS = {
    patch: { word: 'patch', text: 'Team HP +20' },
    overclock: { word: 'overclock', text: 'Team damage 1.5 times for 8 s', ms: 8000, mult: 1.5 },
    firewall: { word: 'firewall', text: 'Blocks the next attack' },
  };
  const TEAM_TIERS = [{ at: 0, mult: 1 }, { at: 15, mult: 1.1 }, { at: 40, mult: 1.2 }, { at: 80, mult: 1.35 }, { at: 150, mult: 1.5 }];
  const CONFIG = { teamHp: 100, startMs: 3000, clearMs: 5000, artMult: 1.2, artWarn: 1500, counterX: 4 };

  const Cb = () => root.Combat;

  function run(o) {
    const cfg = { ...CONFIG, ...(o.config || {}) };
    const R = RUNS[o.run] || RUNS.relay;
    const D = DIFF[o.difficulty] || DIFF.normal;
    const bus = root.NetCore.emitter();
    const emit = ev => bus.emit('ev', ev);
    const r = root.NetCore.rng(o.seed + ':party');
    const n = o.players.length;
    const sizeK = 0.4 + 0.15 * n;           // 1 player 0.55, 4 players 1.0
    const hasGuard = o.players.some(p => p.role === 'guard');

    let clock = 0, phase = 'count', f = -1, nextAt = cfg.startMs;
    let boss = null, teamHp = cfg.teamHp, teamCombo = 0, teamBest = 0, meter = 0, buffOffer = null;
    let overUntil = 0, buffN = 0, lowSaid = false, firewall = false, art = false, artAt = null, attack = null, atkN = 0, result = null;
    const queue = [];
    const fights = [];
    const P = new Map();

    const tierOf = c => TEAM_TIERS.reduce((t, x, i) => (c >= x.at ? i : t), 0);
    function schedule(at, fn) { let k = queue.length; while (k > 0 && queue[k - 1].at > at) k--; queue.splice(k, 0, { at, fn }); }

    const blank = () => ({ keys: 0, good: 0, words: 0, wrong: 0, typos: 0, chars: 0, dmg: 0, blocks: 0, buffs: 0, bestCombo: 0, spells: [], ms: 0 });
    for (const p of o.players) P.set(p.id, { ...p, stats: blank(), fightStats: [] });

    function setupPlayer(p) {
      p.list = o.words(p.id, f) || [];
      p.idx = 0;
      p.eng = Cb().create({ rng: root.NetCore.rng(`${o.seed}:${f}:${p.id}`), now: () => clock });
      p.eng.on('spellOffer', x => emit({ type: 'offer', id: p.id, spells: x.spells.map(s => s.id), until: x.until, at: clock }));
      p.eng.on('offerEnd', x => emit({ type: 'offerEnd', id: p.id, reason: x.reason, at: clock }));
      p.eng.on('combo', c => { p.stats.bestCombo = Math.max(p.stats.bestCombo, c.combo); });
      p.ty = root.NetTypist.create({
        stream: () => p.list[p.idx % Math.max(1, p.list.length)] || '',
        extras: () => {
          const ex = [];
          if (attack && !attack.done && (p.role === 'guard' || !hasGuard)) ex.push({ id: 'counter:' + attack.id, word: attack.word, kind: 'counter' });
          if (buffOffer && p.role === 'support') for (const b of buffOffer) ex.push({ id: 'buff:' + b, word: BUFFS[b].word, kind: 'buff', buff: b });
          const off = p.eng.offer();
          if (off) for (const id of off.spells) ex.push({ id: 'spell:' + id, word: Cb().spell(id).word, kind: 'spell', spell: id });
          return ex;
        },
      });
    }

    function startFight(at) {
      clock = at; f++;
      const A = AREAS[R.fights[f]];
      const hp = Math.round(A.hp * sizeK * D.hp);
      boss = { key: R.fights[f], ...A, hp, maxHp: hp, dmg: Math.round(A.dmg * D.dmg) };
      phase = 'fight'; attack = null; queue.length = 0;
      fights.push({ fight: f, key: boss.key, area: A.area, boss: A.boss, startedAt: at, endedAt: null, won: false });
      for (const p of P.values()) setupPlayer(p);
      schedule(at + 6000 + r() * 3000, nextAttack);
      if (o.art && o.art.fight === f) schedule(at + (o.art.ms || 4000), artJoin);
      emit({ type: 'fight', phase: 'start', fight: f, of: R.fights.length, key: boss.key, area: A.area, boss: A.boss, look: A.look, hp, at });
    }

    function artJoin() {
      if (art) return;
      art = true; artAt = clock;
      emit({ type: 'art', on: true, at: clock });
      emit({ type: 'callout', text: "I'm in. Let's clear this one.", at: clock });
    }

    function nextAttack() {
      if (phase !== 'fight') return;
      const list = o.counters(f) || ['block'];
      const word = list[atkN % list.length];
      const id = `a${f}-${atkN++}`;
      const windup = boss.windup + (art ? cfg.artWarn : 0);
      attack = { id, word, start: clock, land: clock + windup, done: false, dmg: boss.dmg };
      emit({ type: 'attack', id, word, start: clock, land: attack.land, dmg: boss.dmg, at: clock });
      if (art) emit({ type: 'callout', text: hasGuard ? `Big hit coming. Guard, type ${word}.` : `Big hit coming. Type ${word}.`, at: clock });
      schedule(attack.land, () => landAttack(id));
      schedule(clock + boss.every[0] + r() * (boss.every[1] - boss.every[0]), nextAttack);
    }

    function landAttack(id) {
      if (!attack || attack.id !== id || attack.done || phase !== 'fight') return;
      attack.done = true;
      if (firewall) { firewall = false; emit({ type: 'block', id, by: 'firewall', at: clock }); return; }
      teamHp -= attack.dmg;
      if (art && !lowSaid && teamHp > 0 && teamHp <= cfg.teamHp * 0.4) lowSaid = true, emit({ type: 'callout', text: o.players.some(x => x.role === 'support') ? "We can't take many more of those. Support, patch us up." : "We can't take many more of those.", at: clock });
      for (const p of P.values()) p.eng.hurt('boss');
      const from = teamCombo;
      teamCombo = tierOf(teamCombo) ? TEAM_TIERS[tierOf(teamCombo) - 1].at : 0;
      emit({ type: 'impact', id, dmg: attack.dmg, teamHp: Math.max(0, teamHp), teamCombo, from, at: clock });
      if (teamHp <= 0) over(false);
    }

    function teamClean(p, add = 1) {
      teamCombo += add; teamBest = Math.max(teamBest, teamCombo);
      meter = Math.min(100, meter + ROLES[p.role].meter);
      if (meter >= 100 && !buffOffer && o.players.some(x => x.role === 'support')) {
        buffOffer = ['patch', 'overclock', 'firewall']; buffN++;
        emit({ type: 'buffOffer', buffs: buffOffer.slice(), at: clock });
        if (art) emit({ type: 'callout', text: 'Support, your buff is ready.', at: clock });
      }
    }
    function teamSlip() {
      const from = teamCombo, t = tierOf(teamCombo);
      teamCombo = t ? TEAM_TIERS[t - 1].at : 0;
      if (from !== teamCombo) emit({ type: 'teamCombo', combo: teamCombo, from, reason: 'typo', at: clock });
    }
    const dmgMult = () => TEAM_TIERS[tierOf(teamCombo)].mult * (overUntil > clock ? BUFFS.overclock.mult : 1) * (art ? cfg.artMult : 1);

    function damage(p, amount, kind, extra = {}) {
      if (phase !== 'fight') return;
      const d = Math.max(1, Math.round(amount));
      boss.hp -= d; p.stats.dmg += d;
      emit({ type: 'hit', id: p.id, dmg: d, kind, bossHp: Math.max(0, boss.hp), ...extra, at: clock });
      if (boss.hp <= 0) clearFight();
    }

    function clearFight() {
      phase = 'clear'; queue.length = 0;
      const fx = fights[fights.length - 1]; fx.endedAt = clock; fx.won = true;
      attack = null; buffOffer = null;
      for (const p of P.values()) { p.eng.closeOffer('fight'); p.fightStats.push({ fight: f, dmg: p.stats.dmg }); }
      emit({ type: 'fight', phase: 'clear', fight: f, at: clock });
      if (art) emit({ type: 'callout', text: f >= R.fights.length - 1 ? 'That was all of them. Good run.' : 'Nice. On to the next one.', at: clock });
      if (f >= R.fights.length - 1) over(true);
      else nextAt = clock + cfg.clearMs;
    }

    function over(won) {
      phase = 'over';
      if (!won && fights.length) fights[fights.length - 1].endedAt = clock;
      const ms = clock - (fights[0] ? fights[0].startedAt : 0);
      result = {
        won, fights: fights.map(x => ({ ...x })), cleared: fights.filter(x => x.won).length, of: R.fights.length, ms, art, artAt, teamBest, teamHp: Math.max(0, teamHp),
        players: [...P.values()].map(p => ({
          id: p.id, name: p.name, role: p.role, bot: !!p.bot, ...p.stats, spells: p.stats.spells.slice(),
          wpm: ms > 0 ? Math.round(p.stats.chars / 5 / (ms / 60000)) : 0,
          acc: p.stats.keys ? Math.round(1000 * p.stats.good / p.stats.keys) / 10 : 100,
        })),
      };
      emit({ type: 'end', ...result, at: clock });
    }

    function onSubmit(p, s, t) {
      const st = p.stats;
      if (s.kind === 'counter') {
        if (!attack || attack.done || s.word !== attack.word) return;
        if (!s.ok) { st.typos++; teamSlip(); p.eng.miss('wrong'); emit({ type: 'counterMiss', id: p.id, at: t }); return; }
        attack.done = true; st.blocks++; st.chars += s.word.length + 1;
        p.eng.word({ letters: 0, clean: s.clean });
        teamClean(p);
        emit({ type: 'block', id: attack.id, by: p.id, at: t });
        damage(p, s.letters * cfg.counterX * dmgMult(), 'counter');
        return;
      }
      if (s.kind === 'buff') {
        if (!buffOffer || !s.ok) { if (!s.ok) { st.typos++; teamSlip(); } return; }
        const b = Object.keys(BUFFS).find(k => BUFFS[k].word === s.word);
        buffOffer = null; meter = 0; st.buffs++; st.chars += s.word.length + 1;
        if (b === 'patch') teamHp = Math.min(cfg.teamHp, teamHp + 20);
        if (b === 'overclock') overUntil = t + BUFFS.overclock.ms;
        if (b === 'firewall') firewall = true;
        teamClean(p);
        emit({ type: 'buff', buff: b, by: p.id, teamHp, until: b === 'overclock' ? overUntil : 0, at: t });
        return;
      }
      if (s.kind === 'spell') {
        const res = p.eng.cast(s.word, { clean: s.clean });
        if (!res) return;
        if (res.fizzled) { st.typos++; teamSlip(); emit({ type: 'fizzle', id: p.id, spell: res.spell.id, at: t }); return; }
        st.spells.push(res.spell.id); st.chars += s.word.length + 1;
        teamClean(p);
        const m = dmgMult();
        emit({ type: 'cast', id: p.id, spell: res.spell.id, hits: res.hits.map(h => ({ at: t + h.at, dmg: Math.round(h.amount * m) })), effect: res.effect, at: t });
        for (const h of res.hits) schedule(t + h.at, () => damage(p, h.amount * m, 'spell', { spell: res.spell.id }));
        return;
      }
      p.idx++;
      if (!s.ok) { st.wrong++; p.eng.miss('wrong'); teamSlip(); emit({ type: 'miss', id: p.id, word: s.word, typed: s.typed, at: t }); return; }
      if (!s.clean) { st.typos++; teamSlip(); } else teamClean(p);
      st.words++; st.chars += s.word.length + 1;
      const w = p.eng.word({ letters: s.letters, clean: s.clean, ms: s.ms });
      damage(p, w.amount * ROLES[p.role].mult * dmgMult() * (w.crit ? 1.5 : 1), 'word', { tier: w.tier, crit: w.crit, combo: w.combo });
    }

    function advance(t) {
      for (let g = 0; g < 10000; g++) {
        if (phase === 'over') break;
        let next = Infinity, kind = '';
        if (phase === 'count' || phase === 'clear') { next = nextAt; kind = 'start'; }
        else if (queue.length) { next = queue[0].at; kind = 'q'; }
        if (next > t) break;
        if (kind === 'start') startFight(next);
        else { const q = queue.shift(); clock = Math.max(clock, q.at); q.fn(); }
      }
      clock = Math.max(clock, t);
      if (phase === 'fight') for (const p of P.values()) p.eng.tick();
    }

    function input(id, k, t) {
      const p = P.get(id);
      if (!p || phase === 'over') return null;
      t = Math.max(t, clock);
      advance(t);
      if (phase !== 'fight') return null;
      const res = p.ty.key(k, t);
      if (!res) return null;
      if (res.key) { p.stats.keys++; if (res.good) p.stats.good++; else { teamSlipSoft(p); } p.eng.key(res.good); }
      if (res.submit) { p.stats.keys++; if (res.submit.ok) p.stats.good++; onSubmit(p, res.submit, t); }
      return res;
    }
    // a wrong key shows at once; the combo only drops when the word is finished
    function teamSlipSoft(p) { emit({ type: 'typo', id: p.id, at: clock }); }

    function state() {
      return {
        phase, fight: f, of: R.fights.length, run: R.id, clock,
        boss: boss && { key: boss.key, name: boss.boss, area: boss.area, look: boss.look, hp: Math.max(0, boss.hp), maxHp: boss.maxHp },
        teamHp: Math.max(0, teamHp), teamMax: cfg.teamHp, teamCombo, teamTier: tierOf(teamCombo), teamMult: +dmgMult().toFixed(2), meter, buffOffer: buffOffer && buffOffer.slice(), buffN,
        overclock: Math.max(0, overUntil - clock), firewall, art,
        attack: attack && !attack.done ? { id: attack.id, word: attack.word, land: attack.land, start: attack.start } : null,
        players: [...P.values()].map(p => ({
          id: p.id, name: p.name, role: p.role, bot: !!p.bot,
          typed: p.ty ? p.ty.state().typed : '', target: p.ty ? p.ty.state().target : null, idx: p.idx || 0,
          combo: p.eng ? p.eng.state().combo : 0, tier: p.eng ? p.eng.state().tier : 0, acc: p.eng ? Math.round(p.eng.acc() * 1000) / 10 : 100,
          offer: p.eng && p.eng.offer() ? p.eng.offer().spells.slice() : [], offerUntil: p.eng && p.eng.offer() ? p.eng.offer().until : 0,
          statuses: p.eng ? p.eng.statuses().map(x => x.name) : [],
          stats: { ...p.stats, spells: p.stats.spells.slice() },
        })),
      };
    }

    return {
      input, advance, state, on: fn => bus.on('ev', fn), result: () => result,
      words: id => { const p = P.get(id); return p && p.list ? p.list : []; },
      debug: { bossHp: v => { if (boss) boss.hp = v; }, teamHp: v => { teamHp = v; }, artJoin: () => artJoin(), meter: v => { meter = v; teamClean({ role: 'striker' }, 0); } },
    };
  }

  root.PartyRules = { AREAS, RUNS, DIFF, ROLES, BUFFS, TEAM_TIERS, CONFIG, run };
})(globalThis);
