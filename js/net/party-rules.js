// Co-op party runs: up to 4 typists fight a chain of bosses through Keyspace areas.
// Each player has their own HP, a role and a handle: a short word made from their name
// that teammates type to help them. The team shares one team combo. The combat layer
// (js/app/combat/) gives each player their own combo, accuracy and spells. No DOM: the
// sim backend runs this as the server, the same as DuelRules.
//
// Roles
//   striker  words deal 1.3 times damage
//   guard    types the counter word that blocks a boss attack (anyone can when no guard is up),
//            and types a teammate's handle to shield them: their next hit does a quarter damage
//   support  clean words fill the team meter faster; types a teammate's handle to heal them,
//            and at a full meter types patch (everyone +20), overclock (1.5 times damage for 8 s)
//            or firewall (blocks the next attack)
//   anyone   types a downed teammate's handle to bring them back. A downed player reboots by
//            themselves after 12 s, and each clean word they type takes a second off that.
//            The run is lost when the whole team is down at once.
//
// Fight kinds, one per area
//   hydra   three heads, each named. Your words hit the head you aim at; type a head's name to aim
//           at it. A head that falls grows back at half HP after 12 s unless the others fall too.
//   swarm   the Cache Wraith sends mites at the team, each carrying a word and flying at one player.
//           Type a mite's word to pop it, which also hurts the wraith. A mite that arrives bites.
//   snake   the Null Conductor drags a chain of cars, each with a word. Your words wear down the
//           last car; type one of the last two cars' words to cut it off at once. Shorter is weaker.
//           A car grows back every 14 s. When no cars are left the head takes the hits.
//   golem   one big target. Its core opens now and then: 6 s of double damage.
//   mixed   the Mixed run's areas add mites to a golem, a train and the twins.
//   twins   Syntax and Echo. Type a name to aim. When one falls, the other must fall within 10 s
//           or the first comes back at half HP.
//
//   const run = PartyRules.run({ seed, run: 'relay', difficulty: 'normal', players, words, counters, foeWords, art, config });
//   run.input(playerId, k, t), run.advance(t), run.state(), run.on(fn), run.result()
//   players: [{ id, name, role, bot, division?, rank? }]   division and rank: the CTRL perks (CTRL.md)
//   words(playerId, fight) -> [word]   counters(fight) -> [word]   foeWords(fight) -> [word] (mites, cars; counters if missing)
//   fights: ['golem', ...] replaces the run's areas (tests)
//   art: { fight, ms } or null         when Art drops in (simulated now; the server decides later). While he is
//                                      in, team damage is 1.2 times, attacks warn 1.5 s earlier, he calls them out
//                                      and the run pays 1.5 times the coins. His lines are placeholders until Art writes his own.
//   PartyRules.view(state, id, words) -> what a bot sees (NetBot.step's view), shared by the sim and the tests
(function (root) {
  const AREAS = {
    relay: { kind: 'hydra', area: 'Chat relay', boss: 'Spam Hydra', look: 0, hp: 1200, every: [6500, 9000], dmg: 18, windup: 4600, heads: ['spam', 'scam', 'bait'], regrow: 15000, regrowK: 0.35,
      chip: { every: [2800, 4200], dmg: 9, what: 'spit' } },
    market: { kind: 'swarm', area: 'Market net', boss: 'Cache Wraith', look: 1, hp: 1500, every: [9000, 12500], dmg: 18, windup: 4800,
      mite: { every: [2200, 3500], travel: [8000, 10500], bite: 12, popX: 5, max: 6 } },
    transit: { kind: 'snake', area: 'Line 2 control', boss: 'Null Conductor', look: 2, hp: 2300, every: [7000, 9500], dmg: 24, windup: 4400, cars: 12, regrow: 11000,
      chip: { every: [3200, 4600], dmg: 9, what: 'whip' } },
    firmware: { kind: 'golem', area: 'Firmware line', boss: 'Patch Golem', look: 3, hp: 2250, every: [7000, 9500], dmg: 22, windup: 4400, weakEvery: [20000, 26000], weakMs: 6000, weakX: 2,
      chip: { every: [5000, 6500], dmg: 6, what: 'quake', team: true } },
    core: { kind: 'twins', area: 'Fixword core', boss: 'Syntax and Echo', look: 4, hp: 2400, every: [6500, 9000], dmg: 22, windup: 4200, names: ['syntax', 'echo'], relink: 12000,
      chip: { every: [2800, 4200], dmg: 9, what: 'beam' } },
  };
  // mixed fights: a main kind plus mites, which any kind can carry
  Object.assign(AREAS, {
    foundry: { kind: 'golem', area: 'Foundry floor', boss: 'Kiln Golem', look: 5, hp: 2100, every: [8000, 10500], dmg: 22, windup: 4600, weakEvery: [22000, 28000], weakMs: 6000, weakX: 2,
      chip: { every: [6000, 7500], dmg: 6, what: 'quake', team: true }, mite: { every: [4200, 6200], travel: [9000, 11500], bite: 10, popX: 4, max: 4 } },
    mirror: { kind: 'twins', area: 'Mirror stack', boss: 'Syntax and Echo', look: 6, hp: 2300, every: [7500, 10000], dmg: 22, windup: 4400, names: ['syntax', 'echo'], relink: 12000,
      chip: { every: [3600, 5000], dmg: 8, what: 'beam' }, mite: { every: [4500, 6500], travel: [9000, 11500], bite: 10, popX: 4, max: 4 } },
    junction: { kind: 'snake', area: 'Junction yard', boss: 'Null Conductor', look: 7, hp: 2200, every: [7500, 10000], dmg: 22, windup: 4400, cars: 10, regrow: 13000,
      chip: { every: [4000, 5500], dmg: 8, what: 'whip' }, mite: { every: [5000, 7000], travel: [9500, 12000], bite: 10, popX: 4, max: 3 } },
  });
  const RUNS = {
    relay: { id: 'relay', name: 'Relay run', fights: ['relay', 'market', 'transit'] },
    deep: { id: 'deep', name: 'Deep run', fights: ['relay', 'market', 'transit', 'firmware', 'core'] },
    mixed: { id: 'mixed', name: 'Mixed run', fights: ['relay', 'foundry', 'junction', 'mirror'] },
  };
  const DIFF = { easy: { hp: 0.7, dmg: 0.7 }, normal: { hp: 1, dmg: 1 }, hard: { hp: 1.35, dmg: 1.4 } };
  const ROLES = {
    striker: { name: 'Attacker', mult: 1.3, meter: 2, text: 'Your words deal 1.3 times damage.' },
    guard: { name: 'Guard', mult: 1, meter: 2, text: 'Type the counter word to block a boss attack. Type a teammate\'s name to shield them.' },
    support: { name: 'Support', mult: 0.85, meter: 7, text: 'Type a teammate\'s name to heal them. Type a buff when the team meter is full.' },
  };
  const BUFFS = {
    patch: { word: 'patch', text: 'Everyone +20 HP' },
    overclock: { word: 'overclock', text: 'Team damage 1.5 times for 8 s', ms: 8000, mult: 1.5 },
    firewall: { word: 'firewall', text: 'Blocks the next attack' },
  };
  const TEAM_TIERS = [{ at: 0, mult: 1 }, { at: 15, mult: 1.1 }, { at: 40, mult: 1.2 }, { at: 80, mult: 1.35 }, { at: 150, mult: 1.5 }];
  const CONFIG = {
    hp: 100, startMs: 3000, clearMs: 6000, artMult: 1.2, artWarn: 1500, counterX: 4, slamEvery: 3, slamK: 0.6,
    heal: 22, healLow: 10, healCd: 4500, shieldCd: 8000, shieldK: 0.25, downMs: 12000, clearHeal: 25, reviveHp: 40, rebootHp: 25, rebootStep: 1000,
  };
  const KINDS = { hydra: 'Hydra', swarm: 'Swarm', snake: 'Snake', golem: 'Golem', twins: 'Twins' };
  const Cb = () => root.Combat;

  // a handle teammates can type: the first 4+ letter run of the name, at most 7 letters
  function handles(players, avoid) {
    const used = new Set(avoid);
    const out = {};
    players.forEach((p, i) => {
      const runs = String(p.name || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).map(x => x.slice(0, 7));
      const pick = [...runs.filter(x => x.length >= 4), ...runs.filter(x => x.length === 3)];
      let h = pick.find(x => !used.has(x)) || pick[0] || '';
      if (h.length < 3) h = 'ally' + 'abcd'[i];
      let k = 0;
      while (used.has(h)) h = h.slice(0, 6) + 'xyzqw'[k++ % 5];
      used.add(h); out[p.id] = h;
    });
    return out;
  }

  function run(o) {
    const cfg = { ...CONFIG, ...(o.config || {}) };
    if (o.config && o.config.teamHp) cfg.hp = o.config.teamHp;
    const R = o.fights ? { id: o.run || 'test', name: 'Test run', fights: o.fights } : RUNS[o.run] || RUNS.relay;
    const D = DIFF[o.difficulty] || DIFF.normal;
    const bus = root.NetCore.emitter();
    const emit = ev => bus.emit('ev', ev);
    const r = root.NetCore.rng(o.seed + ':party');
    const n = o.players.length;
    const sizeK = 0.4 + 0.15 * n;           // 1 player 0.55, 4 players 1.0
    const smallK = [0, 0.7, 0.85, 0.95, 1][Math.min(4, n)];   // hits on a small team land softer
    const reserved = ['patch', 'overclock', 'firewall', ...Object.values(AREAS).flatMap(a => a.heads || a.names || [])];
    const H = handles(o.players, reserved);
    let clock = 0, phase = 'count', f = -1, nextAt = cfg.startMs;
    let boss = null, foes = [], teamCombo = 0, teamBest = 0, meter = 0, buffOffer = null;
    let overUntil = 0, buffN = 0, lowSaid = false, firewall = false, art = false, artAt = null, attack = null, atkN = 0, result = null;
    let weakUntil = 0, relinkAt = 0, foeN = 0, carWordN = 0;
    const recent = new Map();   // foe words popped in the last moments: a late finish is not a mistake
    const queue = [];
    const fights = [];
    const P = new Map();

    const tierOf = c => TEAM_TIERS.reduce((t, x, i) => (c >= x.at ? i : t), 0);
    function schedule(at, fn) { let k = queue.length; while (k > 0 && queue[k - 1].at > at) k--; queue.splice(k, 0, { at, fn }); }
    const live = () => [...P.values()].filter(p => !p.down);
    const has = role => [...P.values()].some(p => p.role === role);
    const hasUp = role => live().some(p => p.role === role);

    const blank = () => ({ keys: 0, good: 0, words: 0, wrong: 0, typos: 0, chars: 0, dmg: 0, blocks: 0, buffs: 0, bestCombo: 0, spells: [], ms: 0, heals: 0, healed: 0, shields: 0, revives: 0, pops: 0, cuts: 0, downs: 0, taken: 0 });
    const teamK = 1 + Math.max(0, ...o.players.map(p => (root.Combat && root.Combat.Perks && p.division ? root.Combat.Perks.team(p.division, p.rank || 1) : 0)));
    o.players.forEach((p, i) => P.set(p.id, { ...p, i, handle: H[p.id], hp: cfg.hp, down: false, downUntil: 0, shield: 0, healAt: 0, shieldAt: 0, target: null, stats: blank(), fightStats: [] }));

    // ---------- foes ----------
    const alive = () => foes.filter(x => x.alive);
    const foeWordList = () => (o.foeWords ? o.foeWords(f) : o.counters(f)) || ['packet'];
    function nextFoeWord() {
      const list = foeWordList();
      const busy = new Set(foes.filter(x => x.alive && x.word).map(x => x.word));
      for (let k = 0; k < list.length; k++) { const w = list[carWordN++ % list.length]; if (!busy.has(w) && !Object.values(H).includes(w)) return w; }
      return 'packet' + (carWordN % 9);
    }
    function addFoe(x) { const foe = { id: 'f' + (foeN++), alive: true, ...x }; foes.push(foe); return foe; }
    const tail = () => foes.filter(x => x.alive && x.kind === 'car');
    function aimable(p) {
      if (boss.kind === 'hydra' || boss.kind === 'twins') return alive();
      return [];
    }
    // where a player's stream words land
    function streamTarget(p) {
      if (boss.kind === 'hydra' || boss.kind === 'twins') {
        let t = foes.find(x => x.id === p.target && x.alive);
        if (!t) { const a = alive(); t = a.length ? a[p.i % a.length] : null; if (t) p.target = t.id; }
        return t;
      }
      if (boss.kind === 'snake') { const c = tail(); return c.length ? c[c.length - 1] : foes.find(x => x.kind === 'head' && x.alive); }
      return foes.find(x => (x.kind === 'queen' || x.kind === 'golem') && x.alive);
    }
    const bossHp = () => foes.reduce((s, x) => s + (x.alive && x.kind !== 'mite' ? x.hp : 0), 0);

    function setupPlayer(p) {
      p.list = o.words(p.id, f) || [];
      p.idx = 0; p.target = null; p.shield = 0;
      if (p.down) { p.down = false; p.hp = Math.max(p.hp, cfg.rebootHp); }
      // CTRL division perks (js/app/combat/perks.js): each player's own, plus an Architect's bonus for the whole team
      p.eng = Cb().create({ rng: root.NetCore.rng(`${o.seed}:${f}:${p.id}`), now: () => clock,
        perks: p.division ? { division: p.division, rank: p.rank || 1 } : null,
        targetHp: () => (boss.maxHp ? bossHp() / boss.maxHp : null), teamMult: () => teamK });
      p.eng.on('spellOffer', x => emit({ type: 'offer', id: p.id, spells: x.spells.map(s => s.id), until: x.until, at: clock }));
      p.eng.on('offerEnd', x => emit({ type: 'offerEnd', id: p.id, reason: x.reason, at: clock }));
      p.eng.on('combo', c => { p.stats.bestCombo = Math.max(p.stats.bestCombo, c.combo); });
      p.ty = root.NetTypist.create({ stream: () => p.list[p.idx % Math.max(1, p.list.length)] || '', extras: () => extrasFor(p) });
    }

    // the words a player may type besides the stream, most urgent first
    function extrasFor(p) {
      const ex = [];
      if (phase !== 'fight') return ex;
      if (p.down) return ex;
      if (attack && !attack.done && (p.role === 'guard' || !hasUp('guard'))) ex.push({ id: 'counter:' + attack.id, word: attack.word, kind: 'counter' });
      for (const x of foes) {
        if (!x.alive) continue;
        if (x.kind === 'mite') ex.push({ id: 'foe:' + x.id, word: x.word, kind: 'foe', foe: x.id });
      }
      if (boss.kind === 'snake') for (const x of tail().slice(-2)) ex.push({ id: 'foe:' + x.id, word: x.word, kind: 'foe', foe: x.id });
      for (const x of aimable(p)) ex.push({ id: 'aim:' + x.id, word: x.name, kind: 'aim', foe: x.id });
      for (const q of P.values()) {
        if (q.down && q !== p) ex.push({ id: 'revive:' + q.id, word: q.handle, kind: 'revive', who: q.id });
        else if (!q.down && canHeal(p, q)) ex.push({ id: 'heal:' + q.id, word: q.handle, kind: 'heal', who: q.id });
        else if (!q.down && canShield(p, q)) ex.push({ id: 'shield:' + q.id, word: q.handle, kind: 'shield', who: q.id });
      }
      if (buffOffer && p.role === 'support') for (const b of buffOffer) ex.push({ id: 'buff:' + b, word: BUFFS[b].word, kind: 'buff', buff: b });
      const off = p.eng.offer();
      if (off) for (const id of off.spells) ex.push({ id: 'spell:' + id, word: Cb().spell(id).word, kind: 'spell', spell: id });
      return ex;
    }
    const healer = p => p.role === 'support' || !has('support');
    function canHeal(p, q) { return healer(p) && q.hp < cfg.hp && clock >= p.healAt; }
    function canShield(p, q) { return p.role === 'guard' && q !== p && !q.shield && clock >= p.shieldAt; }

    function startFight(at) {
      clock = at; f++;
      const A = AREAS[R.fights[f]];
      const hp = Math.round(A.hp * sizeK * D.hp * (root.Combat && root.Combat.hpScale ? root.Combat.hpScale('party') : 1));   // Combat.HP_SCALE: Art's combo levels hit harder
      boss = { key: R.fights[f], ...A, hp, maxHp: hp, dmg: Math.round(A.dmg * D.dmg) };
      phase = 'fight'; attack = null; queue.length = 0; foes = []; weakUntil = 0; relinkAt = 0; recent.clear();
      if (A.kind === 'hydra') A.heads.forEach((h, i) => addFoe({ kind: 'head', name: h, slot: i, hp: Math.round(hp / 3), maxHp: Math.round(hp / 3), regrowAt: 0 }));
      else if (A.kind === 'twins') A.names.forEach((h, i) => addFoe({ kind: 'twin', name: h, slot: i, hp: Math.round(hp / 2), maxHp: Math.round(hp / 2) }));
      else if (A.kind === 'swarm') addFoe({ kind: 'queen', name: 'wraith', hp, maxHp: hp });
      else if (A.kind === 'golem') addFoe({ kind: 'golem', name: 'golem', hp, maxHp: hp });
      else if (A.kind === 'snake') {
        const headHp = Math.round(hp * 0.3), carHp = Math.round(hp * 0.7 / A.cars);
        addFoe({ kind: 'head', name: 'conductor', hp: headHp, maxHp: headHp });
        for (let k = 0; k < A.cars; k++) addFoe({ kind: 'car', name: 'car', word: nextFoeWord(), hp: carHp, maxHp: carHp });
        boss.carHp = carHp;
      }
      boss.maxHp = bossHp();
      fights.push({ fight: f, key: boss.key, kind: A.kind, area: A.area, boss: A.boss, startedAt: at, endedAt: null, won: false });
      for (const p of P.values()) setupPlayer(p);
      schedule(at + 6000 + r() * 3000, nextAttack);
      if (A.mite) schedule(at + (A.kind === 'swarm' ? 2500 : 7000), nextMite);
      if (A.chip) schedule(at + 5000 + r() * 2000, chip);
      if (A.kind === 'snake') schedule(at + A.regrow * (1 + 0.4 * (4 - n)), regrowCar);
      if (A.kind === 'golem') schedule(at + A.weakEvery[0] * 0.6, openCore);
      if (o.art && o.art.fight === f) schedule(at + (o.art.ms || 4000), artJoin);
      emit({ type: 'fight', phase: 'start', fight: f, of: R.fights.length, key: boss.key, kind: A.kind, adds: A.mite && A.kind !== 'swarm' ? 'mites' : null, area: A.area, boss: A.boss, look: A.look, hp: boss.maxHp, foes: foes.map(foeView), at });
    }
    const foeView = x => ({ id: x.id, kind: x.kind, name: x.name, word: x.word || null, hp: Math.max(0, Math.round(x.hp)), maxHp: x.maxHp, alive: x.alive, slot: x.slot, lane: x.lane || null, born: x.born || 0, land: x.land || 0, path: x.path || 0, regrowAt: x.regrowAt || 0 });

    function artJoin() {
      if (art) return;
      art = true; artAt = clock;
      emit({ type: 'art', on: true, at: clock });
      emit({ type: 'callout', text: "I'm in. Let's clear this one.", at: clock });
    }

    // ---------- the boss acts ----------
    function nextAttack() {
      if (phase !== 'fight') return;
      const list = o.counters(f) || ['block'];
      const word = list[atkN % list.length];
      const id = `a${f}-${atkN++}`;
      const a = alive().filter(x => x.kind !== 'car' && x.kind !== 'mite');
      const from = a.length ? a[atkN % a.length] : null;
      const slam = boss.kind !== 'swarm' && atkN % cfg.slamEvery === 0;
      const ups = live();
      const target = slam || !ups.length ? 'team' : ups[Math.floor(r() * ups.length)].id;
      let dmg = Math.round(boss.dmg * smallK);
      if (boss.kind === 'snake') dmg = Math.round(dmg * (0.45 + 0.55 * tail().length / boss.cars));
      if (boss.kind === 'twins' && alive().length === 1) dmg = Math.round(dmg * 1.25);
      if (slam) dmg = Math.round(dmg * cfg.slamK);
      let windup = boss.windup + (art ? cfg.artWarn : 0);
      if (boss.kind === 'hydra') windup *= 0.85 + 0.15 * (3 - alive().length);
      attack = { id, word, start: clock, land: clock + windup, done: false, dmg, target, from: from ? from.id : null };
      emit({ type: 'attack', id, word, start: clock, land: attack.land, dmg, target, from: attack.from, at: clock });
      if (art) {
        const who = target === 'team' ? 'everyone' : P.get(target).name;
        emit({ type: 'callout', text: hasUp('guard') ? `Hit coming at ${who}. Guard, type ${word}.` : `Hit coming at ${who}. Type ${word}.`, at: clock });
      }
      schedule(attack.land, () => landAttack(id));
      let gap = boss.every[0] + r() * (boss.every[1] - boss.every[0]);
      if (boss.kind === 'hydra') gap *= [1, 1, 0.85, 0.7][alive().length] || 1;
      if (boss.kind === 'twins' && alive().length === 1) gap *= 0.75;
      schedule(clock + gap, nextAttack);
    }

    function hurt(p, dmg, kind, extra = {}) {
      if (p.down || phase !== 'fight') return 0;
      const ward = p.eng.hurt('boss');
      if (ward.blocked) { emit({ type: 'ward', id: p.id, kind, at: clock }); return 0; }
      let shielded = false;
      if (p.shield) { dmg = Math.round(dmg * cfg.shieldK); p.shield = 0; shielded = true; }
      p.hp -= dmg; p.stats.taken += dmg;
      emit({ type: 'hurt', id: p.id, dmg, kind, shielded, hp: Math.max(0, p.hp), ...extra, at: clock });
      if (p.hp <= 0) {
        p.hp = 0; p.down = true; p.downUntil = clock + cfg.downMs; p.stats.downs++;
        if (p.ty) p.ty.reset();
        emit({ type: 'down', id: p.id, until: p.downUntil, at: clock });
        schedule(p.downUntil, () => reboot(p));
        if (art) emit({ type: 'callout', text: `${p.name} is down. Type ${p.handle} to get them back.`, at: clock });
        if (!live().length) { over(false); return dmg; }
      }
      if (art && !lowSaid && live().every(q => q.hp <= cfg.hp * 0.4)) {
        lowSaid = true;
        emit({ type: 'callout', text: has('support') ? "We can't take many more of those. Support, heal us up." : "We can't take many more of those.", at: clock });
      }
      return dmg;
    }
    function reboot(p) {
      if (!p.down || phase !== 'fight') return;
      if (clock < p.downUntil) { schedule(p.downUntil, () => reboot(p)); return; }
      up(p, cfg.rebootHp, null);
    }
    function up(p, hp, by) {
      p.down = false; p.hp = hp; p.downUntil = 0;
      emit({ type: 'up', id: p.id, by, hp, at: clock });
    }

    function landAttack(id) {
      if (!attack || attack.id !== id || attack.done || phase !== 'fight') return;
      attack.done = true;
      if (firewall) { firewall = false; emit({ type: 'block', id, by: 'firewall', at: clock }); return; }
      const targets = attack.target === 'team' ? live() : [P.get(attack.target)].filter(p => p && !p.down);
      const from = teamCombo;
      teamCombo = tierOf(teamCombo) ? TEAM_TIERS[tierOf(teamCombo) - 1].at : 0;
      emit({ type: 'impact', id, dmg: attack.dmg, target: attack.target, teamCombo, from, at: clock });
      for (const p of targets) { hurt(p, attack.dmg, attack.target === 'team' ? 'slam' : 'aimed'); if (phase !== 'fight') return; }
    }

    // small hits nobody can block: spit, whip, quake, beam. Only heals answer these.
    function chip() {
      if (phase !== 'fight' || !boss.chip) return;
      const C = boss.chip;
      const src = alive().filter(x => x.kind !== 'car' && x.kind !== 'mite');
      const from = src.length ? src[Math.floor(r() * src.length)] : null;
      const ups = live();
      if (from && ups.length) {
        const dmg = Math.max(1, Math.round(C.dmg * D.dmg * smallK));
        const who = C.team ? ups : [ups[Math.floor(r() * ups.length)]];
        emit({ type: 'chip', what: C.what, from: from.id, targets: who.map(p => p.id), dmg, at: clock });
        for (const p of who) { hurt(p, dmg, 'chip', { what: C.what, from: from.id }); if (phase !== 'fight') return; }
      }
      let gap = (C.every[0] + r() * (C.every[1] - C.every[0])) * (1 + 0.3 * (4 - n));   // a smaller team gets fewer
      if (boss.kind === 'hydra') gap *= [1, 1.4, 1.15, 1][alive().length] || 1;   // fewer heads, fewer spits
      schedule(clock + gap, chip);
    }

    // swarm: mites fly at one player each
    function nextMite() {
      if (phase !== 'fight' || !boss.mite) return;
      const M = boss.mite;
      const ups = live();
      if (alive().filter(x => x.kind === 'mite').length < M.max && ups.length) {
        const lane = ups[Math.floor(r() * ups.length)];
        const travel = (M.travel[0] + r() * (M.travel[1] - M.travel[0])) + (art ? cfg.artWarn : 0);
        const x = addFoe({ kind: 'mite', name: 'mite', word: nextFoeWord(), hp: 1, maxHp: 1, lane: lane.id, born: clock, land: clock + travel, path: r() });
        emit({ type: 'foe', foe: foeView(x), at: clock });
        schedule(x.land, () => miteLands(x));
      }
      const fill = 1 - bossHp() / boss.maxHp;     // the wraith sends them faster as it weakens
      schedule(clock + (M.every[0] + r() * (M.every[1] - M.every[0])) * (1 - 0.35 * fill), nextMite);
    }
    function miteLands(x) {
      if (!x.alive || phase !== 'fight') return;
      x.alive = false;
      emit({ type: 'foeGone', id: x.id, how: 'bite', lane: x.lane, at: clock });
      let p = P.get(x.lane);
      if (!p || p.down) { const ups = live(); p = ups.length ? ups[Math.floor(r() * ups.length)] : null; }
      if (p) hurt(p, Math.round(boss.mite.bite * D.dmg * smallK), 'bite', { foe: x.id });
    }

    // snake: a car grows back behind the head
    function regrowCar() {
      if (phase !== 'fight' || boss.kind !== 'snake') return;
      const head = foes.find(x => x.kind === 'head' && x.alive);
      if (head && tail().length && tail().length < boss.cars) {
        const x = { id: 'f' + (foeN++), alive: true, kind: 'car', name: 'car', word: nextFoeWord(), hp: boss.carHp, maxHp: boss.carHp };
        foes.splice(foes.indexOf(head) + 1, 0, x);
        emit({ type: 'foe', foe: foeView(x), front: true, at: clock });
      }
      schedule(clock + boss.regrow * (1 + 0.4 * (4 - n)), regrowCar);
    }

    // golem: the core opens
    function openCore() {
      if (phase !== 'fight' || boss.kind !== 'golem') return;
      weakUntil = clock + boss.weakMs;
      emit({ type: 'weak', on: true, until: weakUntil, at: clock });
      if (art) emit({ type: 'callout', text: 'Core is open. Everything you have, now.', at: clock });
      schedule(weakUntil, () => { if (phase === 'fight') emit({ type: 'weak', on: false, at: clock }); });
      schedule(clock + boss.weakEvery[0] + r() * (boss.weakEvery[1] - boss.weakEvery[0]), openCore);
    }

    function teamClean(p, add = 1) {
      teamCombo += add; teamBest = Math.max(teamBest, teamCombo);
      meter = Math.min(100, meter + ROLES[p.role].meter);
      if (meter >= 100 && !buffOffer && has('support')) {
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
    const dmgMult = () => TEAM_TIERS[tierOf(teamCombo)].mult * (overUntil > clock ? BUFFS.overclock.mult : 1) * (art ? cfg.artMult : 1) * (weakUntil > clock ? boss.weakX : 1);

    function damage(p, foe, amount, kind, extra = {}) {
      if (phase !== 'fight' || !foe || !foe.alive) return;
      const d = Math.max(1, Math.round(amount));
      foe.hp -= d; p.stats.dmg += d;
      emit({ type: 'hit', id: p.id, foe: foe.id, dmg: d, kind, foeHp: Math.max(0, Math.round(foe.hp)), bossHp: Math.max(0, bossHp()), ...extra, at: clock });
      if (foe.hp <= 0) foeDown(foe, p);
    }

    function foeDown(x, p) {
      x.alive = false; x.hp = 0;
      emit({ type: 'foeGone', id: x.id, how: 'kill', by: p ? p.id : null, at: clock });
      if (x.word) recent.set(x.word, clock);
      if (boss.kind === 'hydra') {
        if (!alive().length) return clearFight();
        // each head grows back twice at most, slower each time
        x.regrows = (x.regrows || 0) + 1;
        if (x.regrows > 2) { emit({ type: 'headGone', id: x.id, at: clock }); return; }
        x.regrowAt = clock + boss.regrow + 5000 * (x.regrows - 1);
        emit({ type: 'regrowing', id: x.id, at: x.regrowAt });
        schedule(x.regrowAt, () => { if (phase === 'fight' && !x.alive && alive().length) { x.alive = true; x.hp = Math.round(x.maxHp * boss.regrowK); x.regrowAt = 0; emit({ type: 'regrow', id: x.id, hp: x.hp, at: clock }); } });
        if (art) emit({ type: 'callout', text: 'Head down. Drop the others before it grows back.', at: clock });
      } else if (boss.kind === 'twins') {
        if (!alive().length) return clearFight();
        relinkAt = clock + boss.relink;
        emit({ type: 'relink', id: x.id, until: relinkAt, at: clock });
        schedule(relinkAt, () => { if (phase === 'fight' && !x.alive && alive().length && relinkAt && clock >= relinkAt) { x.alive = true; x.hp = Math.round(x.maxHp / 2); relinkAt = 0; emit({ type: 'regrow', id: x.id, hp: x.hp, at: clock }); } });
        if (art) emit({ type: 'callout', text: `${x.name} is down. Ten seconds to drop the other one.`, at: clock });
      } else if (boss.kind === 'snake') {
        if (x.kind === 'head') return clearFight();
        if (p) p.stats.cuts++;
      } else if (x.kind === 'queen' || x.kind === 'golem') return clearFight();
    }

    function clearFight() {
      phase = 'clear'; queue.length = 0;
      const fx = fights[fights.length - 1]; fx.endedAt = clock; fx.won = true;
      attack = null; buffOffer = null; weakUntil = 0; relinkAt = 0;
      for (const x of foes) x.alive = false;
      for (const p of P.values()) { p.eng.closeOffer('fight'); p.fightStats.push({ fight: f, dmg: p.stats.dmg }); if (p.down) up(p, cfg.rebootHp, null); else p.hp = Math.min(cfg.hp, p.hp + cfg.clearHeal); }
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
        won, fights: fights.map(x => ({ ...x })), cleared: fights.filter(x => x.won).length, of: R.fights.length, ms, art, artAt, teamBest,
        players: [...P.values()].map(p => ({
          id: p.id, name: p.name, role: p.role, bot: !!p.bot, handle: p.handle, hp: Math.max(0, p.hp), ...p.stats, spells: p.stats.spells.slice(),
          wpm: ms > 0 ? Math.round(p.stats.chars / 5 / (ms / 60000)) : 0,
          acc: p.stats.keys ? Math.round(1000 * p.stats.good / p.stats.keys) / 10 : 100,
        })),
      };
      emit({ type: 'end', ...result, at: clock });
    }

    function onSubmit(p, s, t) {
      const st = p.stats;
      const slip = () => { st.typos++; teamSlip(); };
      if (p.down) {
        // typing while down speeds up the reboot
        p.idx++;
        if (s.ok && s.clean) { p.downUntil = Math.max(clock, p.downUntil - cfg.rebootStep); st.chars += s.word.length + 1; emit({ type: 'rebootStep', id: p.id, until: p.downUntil, at: t }); }
        return;
      }
      if (s.kind === 'counter') {
        if (!attack || attack.done || s.word !== attack.word) return;
        if (!s.ok) { slip(); p.eng.miss('wrong'); emit({ type: 'counterMiss', id: p.id, at: t }); return; }
        attack.done = true; st.blocks++; st.chars += s.word.length + 1;
        p.eng.word({ letters: 0, clean: s.clean });
        teamClean(p);
        emit({ type: 'block', id: attack.id, by: p.id, target: attack.target, at: t });
        const back = (boss.kind !== 'snake' && foes.find(x => x.id === attack.from && x.alive)) || streamTarget(p);
        damage(p, back, s.letters * cfg.counterX * dmgMult(), 'counter');
        return;
      }
      if (s.kind === 'foe') {
        const x = foes.find(y => 'foe:' + y.id === s.id);
        if (!x || !x.alive) return;
        if (!s.ok) { slip(); p.eng.miss('wrong'); emit({ type: 'miss', id: p.id, word: s.word, typed: s.typed, at: t }); return; }
        st.chars += s.word.length + 1; st.words++;
        p.eng.word({ letters: 0, clean: s.clean });
        if (s.clean) teamClean(p); else slip();
        if (x.kind === 'mite') {
          x.alive = false; st.pops++; recent.set(x.word, t);
          emit({ type: 'foeGone', id: x.id, how: 'pop', by: p.id, at: t });
          const q = foes.find(y => y.kind === 'queen' && y.alive) || streamTarget(p);
          damage(p, q, s.letters * boss.mite.popX * dmgMult(), 'pop', { from: x.id });
        } else damage(p, x, x.hp, 'cut');
        return;
      }
      if (s.kind === 'aim') {
        const x = foes.find(y => 'aim:' + y.id === s.id);
        if (!x || !x.alive) return;
        if (!s.ok) { slip(); return; }
        p.target = x.id;
        emit({ type: 'aim', id: p.id, foe: x.id, at: t });
        // the name counts as a word aimed at that head
        st.words++; st.chars += s.word.length + 1;
        if (s.clean) teamClean(p); else slip();
        const w = p.eng.word({ letters: s.letters, clean: s.clean, ms: s.ms });
        damage(p, x, w.amount * ROLES[p.role].mult * dmgMult(), 'word', { tier: w.tier, combo: w.combo });
        return;
      }
      if (s.kind === 'revive' || s.kind === 'heal' || s.kind === 'shield') {
        const q = P.get(s.id.split(':')[1]);
        if (!q) return;
        if (!s.ok) { slip(); return; }
        st.chars += s.word.length + 1;
        if (s.clean) teamClean(p); else slip();
        if (s.kind === 'revive' && q.down) { st.revives++; up(q, cfg.reviveHp, p.id); }
        else if (s.kind === 'heal' && !q.down && canHeal(p, q)) {
          const add = Math.min(cfg.hp - q.hp, cfg.heal + (q.hp < cfg.hp * 0.35 ? cfg.healLow : 0));
          q.hp += add; p.healAt = t + cfg.healCd * (p.role === 'support' ? 1 : 2); st.heals++; st.healed += add;
          emit({ type: 'heal', id: q.id, by: p.id, amount: add, hp: q.hp, ready: p.healAt, at: t });
        } else if (s.kind === 'shield' && !q.down && canShield(p, q)) {
          q.shield = 1; p.shieldAt = t + cfg.shieldCd; st.shields++;
          emit({ type: 'shield', id: q.id, by: p.id, ready: p.shieldAt, at: t });
        }
        return;
      }
      if (s.kind === 'buff') {
        if (!buffOffer || !s.ok) { if (!s.ok) slip(); return; }
        const b = Object.keys(BUFFS).find(k => BUFFS[k].word === s.word);
        buffOffer = null; meter = 0; st.buffs++; st.chars += s.word.length + 1;
        if (b === 'patch') for (const q of live()) q.hp = Math.min(cfg.hp, q.hp + 20);
        if (b === 'overclock') overUntil = t + BUFFS.overclock.ms;
        if (b === 'firewall') firewall = true;
        teamClean(p);
        emit({ type: 'buff', buff: b, by: p.id, until: b === 'overclock' ? overUntil : 0, at: t });
        return;
      }
      if (s.kind === 'spell') {
        const res = p.eng.cast(s.word, { clean: s.clean });
        if (!res) return;
        if (res.fizzled) { slip(); emit({ type: 'fizzle', id: p.id, spell: res.spell.id, at: t }); return; }
        st.spells.push(res.spell.id); st.chars += s.word.length + 1;
        teamClean(p);
        const m = dmgMult();
        const tg = streamTarget(p);
        emit({ type: 'cast', id: p.id, spell: res.spell.id, foe: tg ? tg.id : null, hits: res.hits.map(h => ({ at: t + h.at, dmg: Math.round(h.amount * m) })), effect: res.effect, at: t });
        for (const h of res.hits) schedule(t + h.at, () => damage(p, streamTarget(p), h.amount * m, 'spell', { spell: res.spell.id }));
        return;
      }
      p.idx++;
      if (!s.ok) {
        // finishing a mite or car word a teammate took a moment ago is not a mistake
        const late = recent.get(s.typed);
        if (late != null && t - late < 2500) { emit({ type: 'late', id: p.id, word: s.typed, at: t }); return; }
        st.wrong++; p.eng.miss('wrong'); teamSlip(); emit({ type: 'miss', id: p.id, word: s.word, typed: s.typed, at: t }); return;
      }
      if (!s.clean) slip(); else teamClean(p);
      st.words++; st.chars += s.word.length + 1;
      const w = p.eng.word({ letters: s.letters, clean: s.clean, ms: s.ms });
      const tg = streamTarget(p);
      const k = boss.kind === 'swarm' ? 0.7 : 1;    // the wraith hides behind its mites
      damage(p, tg, w.amount * ROLES[p.role].mult * dmgMult() * (w.crit ? 1.5 : 1) * k, 'word', { tier: w.tier, crit: w.crit, combo: w.combo });
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
      if (res.key) { p.stats.keys++; if (res.good) p.stats.good++; else emit({ type: 'typo', id: p.id, at: clock }); p.eng.key(res.good); }
      if (res.submit) { p.stats.keys++; if (res.submit.ok) p.stats.good++; onSubmit(p, res.submit, t); }
      return res;
    }

    function state() {
      const head = boss && boss.kind;
      return {
        phase, fight: f, of: R.fights.length, run: R.id, clock,
        boss: boss && { key: boss.key, kind: head, adds: boss.mite && head !== 'swarm' ? 'mites' : null, name: boss.boss, area: boss.area, look: boss.look, hp: Math.max(0, bossHp()), maxHp: boss.maxHp },
        foes: foes.filter(x => x.alive || x.regrowAt).map(foeView),
        weak: Math.max(0, weakUntil - clock), relink: relinkAt ? Math.max(0, relinkAt - clock) : 0,
        teamCombo, teamTier: tierOf(teamCombo), teamMult: +dmgMult().toFixed(2), meter, buffOffer: buffOffer && buffOffer.slice(), buffN,
        overclock: Math.max(0, overUntil - clock), firewall, art, maxHp: cfg.hp,
        attack: attack && !attack.done ? { id: attack.id, word: attack.word, land: attack.land, start: attack.start, target: attack.target, from: attack.from, dmg: attack.dmg } : null,
        players: [...P.values()].map(p => ({
          id: p.id, name: p.name, role: p.role, bot: !!p.bot, handle: p.handle, hp: Math.max(0, Math.round(p.hp)), down: p.down, downLeft: p.down ? Math.max(0, p.downUntil - clock) : 0,
          shield: !!p.shield, target: p.target, healIn: Math.max(0, p.healAt - clock), shieldIn: Math.max(0, p.shieldAt - clock),
          typed: p.ty ? p.ty.state().typed : '', idx: p.idx || 0,
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
      extras: id => { const p = P.get(id); return p ? extrasFor(p) : []; },
      debug: {
        bossHp: v => { for (const x of foes) if (x.alive && x.kind !== 'mite') x.hp = Math.max(1, Math.round(v * x.maxHp / boss.maxHp)); },
        hp: (id, v) => { const p = P.get(id); if (p) p.hp = v; },
        teamHp: v => { for (const p of P.values()) p.hp = v; },
        artJoin: () => artJoin(), meter: v => { meter = v; teamClean({ role: 'striker' }, 0); },
      },
    };
  }

  // What a bot sees and wants to do. Tasks are the extra words it might type, most urgent first;
  // each has an id so the bot rolls for it once, and a chance.
  function view(st, id, words) {
    const p = st.players.find(x => x.id === id);
    if (!p) return { phase: 'none' };
    const list = words || [];
    const v = { phase: st.phase, stream: list[p.idx % Math.max(1, list.length)] || '', typed: p.typed, locked: 0, fog: 0, tasks: [] };
    if (st.phase !== 'fight') return v;
    const offers = (p.offer || []).slice().sort((a, b) => root.Combat.spell(b).rarity - root.Combat.spell(a).rarity).map(x => root.Combat.spell(x).word);
    v.offers = p.down ? [] : offers; v.offerId = p.offerUntil;
    const guardUp = st.players.some(x => x.role === 'guard' && !x.down);
    v.counter = st.attack && !p.down && (p.role === 'guard' || !guardUp) ? st.attack.word : null; v.counterId = st.attack && st.attack.id;
    v.buffs = p.role === 'support' && !p.down && st.buffOffer ? st.buffOffer.map(b => BUFFS[b].word) : null; v.buffId = st.buffN;
    if (p.down) return v;
    const slot = Math.floor(st.clock / 2500);
    const T = v.tasks;
    for (const q of st.players) if (q.down && q.id !== id) T.push({ id: `r:${q.id}:${slot}`, word: q.handle, kind: 'revive', chance: 0.75 });
    const healer = p.role === 'support' || !st.players.some(x => x.role === 'support');
    if (healer && p.healIn <= 0) {
      const hurt = st.players.filter(q => !q.down && q.hp < st.maxHp * 0.8).sort((a, b) => a.hp - b.hp);
      if (hurt.length) T.push({ id: `h:${hurt[0].id}:${slot}`, word: hurt[0].handle, kind: 'heal', chance: p.role === 'support' ? 0.85 : 0.4 });
    }
    if (p.role === 'guard' && p.shieldIn <= 0 && st.attack && st.attack.target !== 'team' && st.attack.target !== id) {
      const q = st.players.find(x => x.id === st.attack.target);
      if (q && !q.shield && !q.down) T.push({ id: `s:${st.attack.id}`, word: q.handle, kind: 'shield', chance: 0.55 });
    }
    const kind = st.boss && st.boss.kind;
    {
      const mites = st.foes.filter(x => x.kind === 'mite' && x.alive).sort((a, b) => a.land - b.land);
      for (const m of mites) T.push({ id: `m:${m.id}`, word: m.word, kind: 'foe', chance: m.lane === id ? 0.9 : 0.3 });
    }
    if (kind === 'snake') {
      const cars = st.foes.filter(x => x.kind === 'car' && x.alive);
      const c = cars[cars.length - 1 - (st.players.findIndex(x => x.id === id) % 2)];
      if (c) T.push({ id: `c:${c.id}`, word: c.word, kind: 'foe', chance: 0.5 });
    }
    if (kind === 'hydra' || kind === 'twins') {
      const live = st.foes.filter(x => x.alive);
      const mine = live.find(x => x.id === p.target);
      // hydra: everyone on the weakest head; twins: keep them even
      const want = kind === 'hydra' ? live.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] : live.slice().sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0];
      if (want && (!mine || (want.id !== mine.id && Math.abs(want.hp / want.maxHp - mine.hp / mine.maxHp) > 0.12))) T.push({ id: `a:${want.id}:${Math.floor(st.clock / 4000)}`, word: want.name, kind: 'aim', chance: 0.7 });
    }
    return v;
  }

  root.PartyRules = { AREAS, RUNS, DIFF, ROLES, BUFFS, TEAM_TIERS, CONFIG, KINDS, run, view, handles };
})(globalThis);
