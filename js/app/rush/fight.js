// One Boss Rush fight: the boss's HP, its attacks and own move, the player's integrity,
// the word stack and every chip to type. It has no DOM or three.js, which lets node run
// whole fights with a simulated player (tools/rush/sim.js). The page draws it and
// feeds it the typing.
//
//   const f = RushFight.create({ plan, me, now, rng, pick, emit })
//     plan   from RushDirector.plan()
//     me     the player's Combat engine (js/app/combat/engine.js)
//     pick   WordBank.pick or a stand-in in tests
//     emit   (name, payload) for the page: intro fight windup move block slam stun shield
//            shieldBreak overheat damage hurt typo packet boost enrage weak won lost,
//            stage (a new phase), sig sigDone sigHit sigGone bite shout pen penBeat penHit decoyHit
//            (the signature move, see RushData.SIG)
//   f.start(t)  f.tick(t)
//   f.stack()                     the stack words, current first
//   f.chips(t)                    what else there is to type: block, gift, fix, speaker, answer, packet, boost, weak,
//                                 and the signature's popup, sign, mute, page, byte, decoy
//   f.marks()                     the red pen's marks on the stack: [{ i, fake }], i counted from the current word
//   f.key(ok)                     every key press
//   f.submit(text, { clean, ms, target })   a finished word; target is the chip id the page aimed at
//   f.fire(id, text, { clean, ms })         the stack word that chip id lit up was typed right: it fires
//   f.cast(result, t)             a spell the engine cast; its hits land on time
//     lead   () => ms (optional): how long the player needs to reach a word put past their middle line
//            (js/app/combat/inline.js). Every attack and move waits that much longer, and a wind-up
//            shows for its usual length at the end of it, so the words arrive first
//   f.state(t)  f.summary()  f.shift(ms)  f.debug
window.RushFight = (() => {
  const INTRO_MS = 3000;   // the page counts 3, 2, 1 over it and the fight starts on GO

  function create(o) {
    const D = window.RushData;
    const { plan, me } = o;
    const now = o.now || (() => performance.now());
    const rng = o.rng || Math.random;
    const emit = o.emit || (() => {});
    const pick = o.pick || (opts => (window.WordBank ? WordBank.pick(opts) : []));
    const B = plan.boss, K = plan.knobs, tw = new Set(plan.twists);
    const max = Math.round(K.hp * (typeof Combat !== 'undefined' && Combat.hpScale ? Combat.hpScale('rush') : 1));   // Combat.HP_SCALE: Art's combo levels hit harder
    const rnd = (a, b) => a + rng() * (b - a);
    const leadOf = () => (o.lead ? Math.max(0, Math.min(15000, o.lead() || 0)) : 0);

    let phase = 'new', fightAt = 0, endAt = 0, idN = 0, lastCounter = '', fightBest = 0;
    const boss = { hp: max, max, shield: null, shieldDone: false, stunUntil: 0, stunLong: false, panicUntil: 0, enraged: false, heat: 0, action: null, attackAt: 0, cycle: 0 };
    const player = { hp: D.PLAYER_HP, max: D.PLAYER_HP };
    let mech = [], stack = [], weak = null, weakAt = 0, boost = null, boostDone = false, queue = [], frost = 0;
    const stats = { keys: 0, good: 0, letters: 0, words: 0, missed: 0, blocks: 0, hurts: 0, casts: 0, dmg: 0, reacts: [], moves: 0, movesDone: 0, boosts: 0, sigs: 0, sigsDone: 0, sigHits: 0 };
    // phases and the signature move
    const SG = D.SIG[B.id] || D.SIG.spam;
    const sigHit = Math.min(14, D.SIG_HIT + 2 * (plan.mark - 1));
    let stage = 1, stageUntil = 0, sigs = [], sigAt = 0, volume = 0, pageHeat = 0, pageHeatAt = 0, lastT = 0;
    let stackBase = 0;
    const marks = new Map();   // absolute stack index -> the red pen's wrong word
    const nid = p => p + (++idN);

    // ---------- words ----------
    function glitch(w) {
      const at = [...w].map((c, i) => (D.GLITCH[c] ? i : -1)).filter(i => i >= 0);
      if (!at.length) return w;
      const i = at[Math.floor(rng() * at.length)];
      const opts = D.GLITCH[w[i]];
      return w.slice(0, i) + opts[Math.floor(rng() * opts.length)] + w.slice(i + 1);
    }
    function shiftStack() { marks.delete(stackBase); stackBase++; const w = stack.shift(); refill(); return w; }
    function refill() {
      if (stack.length >= 14) return;
      let more = pick({ count: 24, theme: B.theme || 'mix', difficulty: K.diff, minLen: K.minLen, maxLen: K.maxLen });
      if (!more.length) more = pick({ count: 24, theme: 'common', minLen: K.minLen, maxLen: K.maxLen });
      if (tw.has('glitch')) more = more.map(w => (rng() < 0.2 ? glitch(w) : w));
      stack.push(...more);
    }
    function counterWords(n) {
      const fit = B.counters.filter(w => w.length <= K.maxLen + 5 && w !== lastCounter);
      const pool = fit.length ? fit : B.counters.slice().sort((a, b) => a.length - b.length).slice(0, 2);
      const first = pool[Math.floor(rng() * pool.length)];
      lastCounter = first;
      const out = [first];
      if (n > 1) out.push(...pick({ count: n - 1, theme: 'cyber', difficulty: K.diff, minLen: K.minLen, maxLen: Math.max(K.minLen + 2, K.maxLen - 1), distinctFirst: true, avoidFirstLetters: [first[0]] }));
      return out;
    }
    function newWeak(t) {
      const w = pick({ count: 1, theme: B.theme || 'mix', difficulty: [K.diff[1] - 0.5, K.diff[1] + 1.5], minLen: Math.max(5, K.minLen), maxLen: Math.max(9, K.maxLen), exclude: stack.slice(0, 6) })[0];
      weak = w ? { id: nid('weak'), kind: 'weak', word: w, at: t } : null;
    }

    // ---------- damage ----------
    const stunK = t => (t < boss.stunUntil ? D.STUN_MULT : 1);
    function hitBoss(amount, t, o2 = {}) {
      if (phase !== 'fight' || amount <= 0) return 0;
      amount = Math.round(amount);
      if (boss.shield && !o2.pierce) {
        boss.shield.hp -= amount;
        stats.dmg += amount;
        emit('damage', { amount, shield: true, kind: o2.kind, spell: o2.spell, crit: o2.crit, tier: o2.tier });
        if (boss.shield.hp <= 0) {
          boss.shield = null;
          emit('shieldBreak', {});
          stun(t, D.STUN_MS, false);
        }
        return amount;
      }
      const dealt = Math.min(boss.hp, amount);
      boss.hp = Math.max(0, boss.hp - amount);
      stats.dmg += dealt;
      emit('damage', { amount, kind: o2.kind, spell: o2.spell, crit: o2.crit, tier: o2.tier, stunned: t < boss.stunUntil });
      if (boss.hp <= 0) { finish(t, true); return dealt; }
      const want = boss.hp <= max * D.STAGES[1] ? 3 : boss.hp <= max * D.STAGES[0] ? 2 : 1;
      if (want > stage) setStage(t, want);
      if (tw.has('shield') && !boss.shieldDone && boss.hp <= max * 0.5) {
        boss.shieldDone = true;
        boss.shield = { hp: Math.round(max * D.SHIELD_FRAC), max: Math.round(max * D.SHIELD_FRAC) };
        emit('shield', { hp: boss.shield.hp });
      }
      if (tw.has('enrage') && !boss.enraged && boss.hp <= max * 0.3) enrage();
      return dealt;
    }
    // an attack reached the player
    function hurt(dmg, kind, t) {
      const r = me.hurt(kind);
      if (r.blocked) { emit('hurt', { blocked: true, kind }); return false; }
      player.hp = Math.max(0, player.hp - dmg);
      stats.hurts++;
      boss.heat = 0;
      emit('hurt', { dmg, kind, hp: player.hp });
      if (player.hp <= 0) finish(t, false);
      return true;
    }
    function stun(t, ms, long) {
      boss.stunUntil = Math.max(boss.stunUntil, t + ms);
      boss.stunLong = !!long;
      boss.attackAt = Math.max(boss.attackAt, boss.stunUntil + K.interval * 0.45);
      emit('stun', { ms, long: !!long });
    }
    function enrage() {
      if (boss.enraged) return;
      boss.enraged = true;
      emit('enrage', {});
    }
    const interval = () => K.interval * D.PACE[stage - 1] * (boss.enraged ? 0.6 : 1);
    const after = (t, k = 1) => { boss.attackAt = Math.max(boss.attackAt, t + 700 + interval() * rnd(0.7, 0.95) * k); };

    // ---------- phases ----------
    function setStage(t, n) {
      stage = n;
      stageUntil = t + D.STAGE_PAUSE;
      boss.attackAt = Math.max(boss.attackAt, stageUntil + 900);
      sigAt = Math.max(sigAt, stageUntil + 500);
      emit('stage', { n, ms: D.STAGE_PAUSE });
    }

    // ---------- the signature move ----------
    const wordMs = () => 12000 / Math.max(8, plan.S) * 5.5;
    const sigGap = () => Math.max(1700, Math.min(9000, SG.gap * wordMs())) * D.PACE[stage - 1] * (boss.enraged ? 0.8 : 1);
    const flyMs = w => (K.react + K.perChar * w.length * 1.5 + 900) * (stage === 3 ? 0.9 : 1);
    const sigOpen = kind => sigs.filter(x => (kind ? x.kind === kind : true));
    function sigWord() {
      const avoid = [...sigs.map(x => x.word[0]), ...mech.map(x => x.word[0]), ...(stack[0] ? [stack[0][0]] : [])];
      const pickOne = theme => pick({ count: 1, theme, difficulty: [1, Math.max(1.5, K.diff[0] + 0.5)], minLen: 2, maxLen: Math.max(3, Math.min(6, K.maxLen)), avoidFirstLetters: avoid, exclude: sigs.map(x => x.word) })[0];
      return pickOne(B.theme || 'mix') || pickOne('common') || 'stop';
    }
    // a believable wrong version: two letters swapped, a letter doubled or a vowel changed
    function misspell(w) {
      const V = 'aeiou';
      for (let n = 0; n < 8; n++) {
        const r = rng(), i = 1 + Math.floor(rng() * Math.max(1, w.length - 2));
        let out = w;
        if (r < 0.4 && i < w.length - 1 && w[i] !== w[i + 1]) out = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
        else if (r < 0.65) out = w.slice(0, i) + w[i] + w.slice(i);
        else if (V.includes(w[i])) out = w.slice(0, i) + V[(V.indexOf(w[i]) + 1 + Math.floor(rng() * 4)) % 5] + w.slice(i + 1);
        if (out !== w && !stack.includes(out)) return out;
      }
      return null;
    }
    function spawnSig(t) {
      const two = stage === 3 && ['popup', 'sign', 'pen', 'byte'].includes(SG.kind);
      for (let k = 0; k < (two ? 2 : 1); k++) {
        if (SG.kind === 'popup') {
          if (sigOpen('popup').length >= SG.cap) { bite(t); return; }
          addSig(t, { kind: 'popup' });
        } else if (SG.kind === 'mute') {
          if (sigOpen('mute').length < SG.cap + (stage > 1 ? 1 : 0)) addSig(t, { kind: 'mute' });
        } else if (SG.kind === 'pen') {
          const free = [1, 2, 3].filter(j => j < stack.length && !marks.has(stackBase + j) && stack[j].length >= 3);
          if (!free.length) continue;
          const j = free[Math.floor(rng() * free.length)], fake = misspell(stack[j]);
          if (!fake) continue;
          marks.set(stackBase + j, fake);
          stats.sigs++;
          emit('pen', { i: j, word: stack[j], fake });
        } else if (SG.kind === 'byte') {
          addSig(t, { kind: two && k === 1 ? 'decoy' : 'byte', timed: true });
        } else addSig(t, { kind: SG.kind, timed: true });
      }
    }
    function addSig(t, o2) {
      const word = sigWord();
      const c = { id: nid(o2.kind), kind: o2.kind, word, born: t };
      if (o2.timed) { c.total = flyMs(word) + leadOf(); c.due = t + c.total; }
      sigs.push(c);
      if (o2.kind !== 'decoy') stats.sigs++;
      emit('sig', { id: c.id, kind: c.kind, word, due: c.due, total: c.total, n: sigs.length });
    }
    // an attack the player let through: integrity only, the combo stays
    function lightHurt(dmg, kind, t) {
      player.hp = Math.max(0, player.hp - dmg);
      stats.sigHits++;
      emit('hurt', { dmg, kind, hp: player.hp, light: true });
      if (player.hp <= 0) finish(t, false);
    }
    function bite(t) {
      const ids = sigOpen('popup').map(x => x.id);
      sigs = sigs.filter(x => x.kind !== 'popup');
      emit('bite', { ids });
      hurt(Math.round(K.hit * 0.7), 'bite', t);
    }
    function updateSigs(t, dt) {
      const quiet = t < boss.stunUntil || t < stageUntil || t < boss.panicUntil;
      for (const c of sigs.slice()) {
        if (!c.due || t < c.due) continue;
        sigs = sigs.filter(x => x !== c);
        if (c.kind === 'decoy') { emit('sigGone', { id: c.id, kind: c.kind }); continue; }
        emit('sigHit', { id: c.id, kind: c.kind });
        lightHurt(sigHit, c.kind, t);
        if (phase !== 'fight') return;
      }
      if (SG.kind === 'mute' && !quiet) {
        volume = Math.min(1, volume + SG.rise[stage - 1] * dt / 1000);
        if (volume >= 1) { volume = 0.35; emit('shout', {}); hurt(Math.round(K.hit * 0.8), 'shout', t); if (phase !== 'fight') return; }
      }
      if (SG.kind === 'page' && pageHeat > 0 && t - pageHeatAt > 5000) { pageHeat--; pageHeatAt = t; }
      if (!quiet && t >= sigAt) { spawnSig(t); sigAt = t + sigGap(); }
    }
    function onSig(c, clean, ms, t) {
      sigs = sigs.filter(x => x.id !== c.id);
      if (c.kind === 'decoy') {
        me.miss('wrong'); stats.missed++;
        emit('decoyHit', { id: c.id });
        lightHurt(Math.round(sigHit * 1.5), 'decoy', t);
        return { kind: 'decoy', ok: false };
      }
      stats.sigsDone++;
      const w = me.word({ letters: c.word.length, clean, ms });
      track(w);
      const amount = Math.round(w.amount * D.UNIT * stunK(t) * (w.crit ? 2 : 1) * (c.kind === 'byte' ? 2 : 1));
      emit('sigDone', { id: c.id, kind: c.kind, amount });
      hitBoss(amount, t, { kind: 'sig', pierce: w.pierce, crit: w.crit, tier: w.tier });
      const out = { kind: 'sig', ok: true, amount, tier: w.tier, crit: w.crit, id: c.id, sig: c.kind };
      if (phase !== 'fight') return out;
      if (c.kind === 'mute') volume = Math.max(0, volume - SG.drop);
      if (c.kind === 'page') {
        pageHeat++; pageHeatAt = t;
        if (pageHeat >= SG.heat) { pageHeat = 0; emit('overheat', {}); if (boss.action) endAction(t); stun(t, D.LONG_STUN_MS, true); }
      }
      return out;
    }

    // ---------- attacks ----------
    function startAttack(t) {
      boss.cycle++;
      const every = tw.has('twice') ? 2 : 3;
      if (boss.cycle % every === 0) startMove(t); else windup(t, 0);
    }
    // a titan's own attack for this wind-up (RushData.ATTACKS): never the same one twice in a row; the
    // double slam's two wind-ups are its plain slam
    const atkList = (D.ATTACKS && D.ATTACKS[B.id]) || null;
    // its own small random stream, so the choice leaves the fight's other dice (and the director tests) as they were
    let lastAtk = '', aSeed = ((plan.n || 1) * 2654435761 + 0) >>> 0;
    const arng = () => { aSeed = (aSeed * 1664525 + 1013904223) >>> 0; return aSeed / 4294967296; };
    let forceAtk = '';
    function pickAttack(chain) {
      if (!atkList) return null;
      if (chain) return { ...atkList[0], wind: 1, hit: 1 };
      if (forceAtk) { const f = atkList.find(a => a.id === forceAtk); forceAtk = ''; if (f) { lastAtk = f.id; return f; } }
      const pool = atkList.filter(a => a.id !== lastAtk);
      const a = pool[Math.floor(arng() * pool.length)];
      lastAtk = a.id;
      return a;
    }
    function windup(t, chain) {
      const words = counterWords(K.counters + (chain === 2 ? 0 : 0));
      const letters = words.join(' ').length;
      const atk = pickAttack(chain);
      let dur = (K.react + K.perChar * letters) * (atk ? atk.wind : 1) + frost;
      if (chain === 2) dur *= 0.85;
      if (boss.enraged) dur *= 0.85;
      const grace = frost; frost = 0;
      const lead = leadOf();
      const a = { type: 'windup', start: t, due: t + lead + dur, total: lead + dur, words, chain, ids: [], grace, showAt: t + lead, shown: false, atk };
      for (const w of words) { const id = nid('block'); a.ids.push(id); mech.push({ id, kind: 'block', word: w, due: a.due, total: a.total, frozen: grace > 0, label: atk ? 'BLOCK ' + atk.short : '' }); }
      boss.action = a;
      if (!lead) { a.shown = true; emit('windup', { due: a.due, words, chain, ms: dur, atk: atk && atk.id, name: atk && atk.name }); }
    }
    function startMove(t) {
      stats.moves++;
      const m = B.move, lead = leadOf();
      const L = (n, lo, hi) => pick({ count: n, theme: B.theme || 'mix', difficulty: [Math.max(1, K.diff[0] - 0.5), K.diff[1]], minLen: lo, maxLen: hi, distinctFirst: true });
      if (m === 'press') { emit('move', { move: m }); windup(t, 1); return; }
      const a = { type: m, start: t, ids: [] };
      if (m === 'gifts') {
        const ws = L(3, K.minLen, Math.min(8, K.maxLen));
        const letters = ws.join(' ').length;
        a.due = t + lead + K.react + K.perChar * letters * 0.85 + 1200; a.total = a.due - t;
        ws.forEach(w => { const id = nid('gift'); a.ids.push(id); mech.push({ id, kind: 'gift', word: w, due: a.due, total: a.total }); });
      } else if (m === 'fixsign') {
        const [shown, answer] = D.SIGNS[Math.floor(rng() * D.SIGNS.length)];
        a.due = t + lead + K.react + 900 + K.perChar * answer.length * 1.3; a.total = a.due - t; a.shown = shown;
        const id = nid('fix'); a.ids.push(id);
        mech.push({ id, kind: 'fix', word: answer, shown, due: a.due, total: a.total });
      } else if (m === 'speakers') {
        const ws = L(6, 2, 4);
        const letters = ws.join(' ').length;
        a.due = t + lead + K.react + K.perChar * letters * 1.1 + 1500; a.total = a.due - t;
        ws.forEach((w, i) => { const id = nid('spk'); a.ids.push(id); mech.push({ id, kind: 'speaker', word: w, order: i + 1, due: a.due, total: a.total }); });
      } else if (m === 'spell') {
        const set = D.SPELL[Math.floor(rng() * D.SPELL.length)];
        const opts = set.slice().sort(() => rng() - 0.5);
        const len = Math.max(...set.map(x => x.length));
        a.due = t + lead + Math.min(11000, Math.max(4500, K.react + 2600 + K.perChar * len * 1.2)); a.total = a.due - t; a.right = set[0];
        opts.forEach(w => { const id = nid('ans'); a.ids.push(id); mech.push({ id, kind: 'answer', word: w, right: w === set[0], due: a.due, total: a.total }); });
      } else if (m === 'volley') {
        const ws = L(4, K.minLen, Math.min(6, Math.max(K.minLen + 1, K.maxLen)));
        a.packets = ws.map((w, i) => {
          const launch = t + 500 + i * 700, fly = K.react + K.perChar * w.length * 1.25 + 700 + lead;
          return { id: nid('pkt'), word: w, launch, due: launch + fly, total: fly, done: false };
        });
        a.returned = 0;
        a.due = Math.max(...a.packets.map(p => p.due));
        a.ids = a.packets.map(p => p.id);
      }
      boss.action = a;
      emit('move', { move: m, shown: a.shown, due: a.due });
    }
    function endAction(t, k = 1) {
      const a = boss.action;
      if (!a) return;
      mech = mech.filter(c => !a.ids.includes(c.id));
      boss.action = null;
      after(t, k);
    }
    function blocked(t) {
      const a = boss.action;
      stats.blocks++;
      hitBoss(max * 0.04, t, { kind: 'block' });
      if (phase !== 'fight') return;
      emit('block', { chain: a.chain, atk: a.atk && a.atk.id });
      if (B.move === 'press') {
        boss.heat++;
        if (boss.heat >= 3) { boss.heat = 0; emit('overheat', {}); endAction(t); stun(t, D.LONG_STUN_MS, true); stats.movesDone++; return; }
      }
      if (a.chain === 1) { mech = mech.filter(c => !a.ids.includes(c.id)); boss.action = null; windup(t + 300, 2); return; }
      if (a.chain === 2) stats.movesDone++;
      endAction(t);
      stun(t, D.STUN_MS, false);
    }
    function moveDone(t, frac) {
      stats.movesDone++;
      if (frac) hitBoss(max * frac, t, { kind: 'move' });
      if (phase !== 'fight') return;
      endAction(t);
      stun(t, D.LONG_STUN_MS, true);
      emit('moveDone', { move: B.move });
    }
    function updateAction(t) {
      const a = boss.action;
      if (!a) return;
      if (a.type === 'volley') {
        for (const p of a.packets) {
          if (p.done) continue;
          if (t >= p.launch && !p.live) { p.live = true; mech.push({ id: p.id, kind: 'packet', word: p.word, due: p.due, total: p.total }); emit('packet', { id: p.id, word: p.word, due: p.due }); }
          if (t >= p.due) {
            p.done = true;
            mech = mech.filter(c => c.id !== p.id);
            emit('packetHit', { id: p.id });
            hurt(6, 'packet', t);
            if (phase !== 'fight') return;
          }
        }
        if (a.packets.every(p => p.done)) {
          const all = a.returned === a.packets.length;
          endAction(t);
          if (all) { stats.movesDone++; stun(t, D.STUN_MS, false); }
        }
        return;
      }
      // the wind-up shows once the player is about to reach its words
      if (a.type === 'windup' && !a.shown && t >= a.showAt) { a.shown = true; emit('windup', { due: a.due, words: a.words, chain: a.chain, ms: a.due - t, atk: a.atk && a.atk.id, name: a.atk && a.atk.name }); }
      if (t < a.due) return;
      // time ran out on the attack or the move
      if (a.type === 'windup') {
        mech = mech.filter(c => !a.ids.includes(c.id));
        boss.action = null;
        emit('slam', { chain: a.chain, atk: a.atk && a.atk.id });
        hurt(Math.round(K.hit * (a.atk ? a.atk.hit : 1)), 'slam', t);
        if (phase !== 'fight') return;
        if (a.chain === 1) { windup(t + 500, 2); return; }
        after(t);
      } else if (a.type === 'gifts') {
        const left = mech.filter(c => a.ids.includes(c.id)).length;
        endAction(t);
        hurt(8 * left, 'gift', t);
      } else if (a.type === 'speakers') {
        const left = mech.filter(c => a.ids.includes(c.id)).length;
        endAction(t);
        hurt(5 * left, 'speakers', t);
      } else {
        endAction(t);
        hurt(K.hit, a.type, t);
      }
    }

    // ---------- the clock ----------
    function start(t = now()) {
      phase = 'intro';
      fightAt = t + INTRO_MS;
      boss.attackAt = fightAt + K.interval * 0.55;
      refill();
      emit('intro', { title: plan.slot.title, ms: INTRO_MS });
    }
    function tick(t = now()) {
      if (me.tick) me.tick();
      if (phase === 'intro' && t >= fightAt) {
        phase = 'fight';
        newWeak(t);
        sigAt = t + Math.min(2600, sigGap() * 0.6);
        lastT = t;
        emit('fight', {});
      }
      if (phase !== 'fight') return;
      const dt = Math.max(0, Math.min(250, t - lastT)); lastT = t;
      // spell hits land on their own clock
      if (queue.length) {
        const due = queue.filter(h => h.at <= t);
        if (due.length) {
          queue = queue.filter(h => h.at > t);
          for (const h of due) { hitBoss(h.amount, t, { kind: 'spell', spell: h.spell, pierce: h.pierce }); if (phase !== 'fight') return; }
        }
      }
      if (!boss.enraged && t - fightAt > K.T * 1000 * 2.2) enrage();
      if (!weak && t >= weakAt) newWeak(t);
      if (plan.boost && !boostDone && !boost && t >= fightAt + plan.boost.at) {
        boost = { id: nid('boost'), kind: 'boost', word: plan.boost.word, due: t + 15000, total: 15000, dmg: plan.boost.dmg };
        emit('boostOffer', { word: boost.word });
      }
      if (boost && t >= boost.due) { boost = null; boostDone = true; }
      updateAction(t);
      if (phase !== 'fight') return;
      updateSigs(t, dt);
      if (phase !== 'fight') return;
      if (!boss.action && t >= boss.attackAt && t >= boss.stunUntil && t >= boss.panicUntil && t >= stageUntil) startAttack(t);
    }

    // ---------- typing ----------
    function chips(t = now()) {
      const out = mech.slice();
      const a = boss.action;
      if (a && a.type === 'speakers') {
        const next = out.filter(c => c.kind === 'speaker').sort((x, y) => x.order - y.order)[0];
        for (const c of out) if (c.kind === 'speaker') c.next = c === next;
      }
      out.push(...sigs);
      if (boost) out.push(boost);
      if (weak && !(a && a.type === 'spell')) out.push(weak);
      return out;
    }
    // which chips a typed prefix could be heading for
    function accepts(c) { return !(c.kind === 'speaker' && !c.next); }
    function key(ok) { stats.keys++; if (ok) stats.good++; me.key(ok); }
    function track(w) { if (w && w.combo > fightBest) fightBest = w.combo; }
    function submit(text, o2 = {}) {
      const t = o2.t !== undefined ? o2.t : now();
      if (phase !== 'fight' || !text) return null;
      const clean = o2.clean !== false;
      const list = chips(t);
      const c = list.find(x => x.word === text && accepts(x)) || (o2.target ? null : null);
      if (c) return onChip(c, clean, o2.ms || 0, t);
      const aimed = o2.target && list.find(x => x.id === o2.target);
      const fake = marks.get(stackBase);
      // the red pen's word: typing it hurts and uses up the word
      if (!aimed && fake && text === fake && text !== stack[0]) {
        shiftStack();
        stats.missed++; stats.keys++;
        me.miss('wrong');
        emit('penHit', { word: text });
        lightHurt(sigHit, 'pen', t);
        return { kind: 'pen', ok: false };
      }
      if (!aimed && text === stack[0]) {
        shiftStack();
        const w = me.word({ letters: text.length, clean, ms: o2.ms || 0 });
        track(w);
        stats.good++; stats.keys++;
        stats.letters += text.length + 1; stats.words++;
        const amount = Math.round(w.amount * D.UNIT * stunK(t) * (w.crit ? 2 : 1) * (fake ? 1.5 : 1));
        if (fake) { stats.sigsDone++; emit('penBeat', { word: text, amount }); }
        hitBoss(amount, t, { kind: 'word', pierce: w.pierce, crit: w.crit, tier: w.tier });
        return { kind: 'word', ok: true, amount, tier: w.tier, crit: w.crit, pierce: w.pierce, combo: w.combo, pen: !!fake };
      }
      // a wrong word: it drops a tier and costs integrity
      stats.missed++; stats.keys++;
      me.miss('wrong');
      if (!aimed) { const gone = shiftStack(); emit('typo', { word: gone, typed: text }); }
      else emit('typo', { word: aimed.word, typed: text, chip: aimed.kind });
      if (K.typo) {
        player.hp = Math.max(0, player.hp - K.typo);
        emit('hurt', { dmg: K.typo, kind: 'typo', hp: player.hp });
        if (player.hp <= 0) finish(t, false);
      }
      return { kind: 'miss', ok: false, chip: aimed ? aimed.kind : null };
    }
    // a lit word (js/app/combat/inline.js): the player typed the stack word that chip c lit up, so the
    // stack moves on and the chip does its thing. If the chip has gone meanwhile it's a plain word.
    function fire(id, text, o2 = {}) {
      const t = o2.t !== undefined ? o2.t : now();
      if (phase !== 'fight' || !text) return null;
      const c = chips(t).find(x => x.id === id);
      if (!c) return submit(text, o2);
      shiftStack();
      return onChip(c, o2.clean !== false, o2.ms || 0, t);
    }
    function onChip(c, clean, ms, t) {
      if (sigs.includes(c)) {
        stats.keys++;
        const r = onSig(c, clean, ms, t);
        if (r.ok) { stats.good++; stats.letters += c.word.length + 1; stats.words++; }
        return r;
      }
      const a = boss.action;
      stats.keys++; stats.good++;
      stats.letters += c.word.length + 1; stats.words++;
      const gone = () => { mech = mech.filter(x => x.id !== c.id); };
      if (c.kind === 'block') {
        gone();
        track(me.word({ letters: 0, clean }));
        if (a && a.type === 'windup' && !a.reacted) {
          a.reacted = true;
          const r = t - (a.showAt || a.start) - (ms || 0);
          if (r > 0 && r < 8000) stats.reacts.push(r);
        }
        emit('blockWord', { id: c.id, word: c.word });
        if (a && a.type === 'windup' && !mech.some(x => a.ids.includes(x.id))) blocked(t);
        return { kind: 'block', ok: true };
      }
      if (c.kind === 'weak') {
        const w = me.word({ letters: c.word.length, clean, ms });
        track(w);
        weak = null; weakAt = t + 1200;
        const amount = Math.round(max * D.WEAK_FRAC * w.mult * stunK(t) * (w.crit ? 2 : 1));
        hitBoss(amount, t, { kind: 'weak', pierce: w.pierce, crit: w.crit, tier: w.tier });
        emit('weak', { amount });
        return { kind: 'weak', ok: true, amount, tier: w.tier, crit: w.crit };
      }
      if (c.kind === 'boost') {
        boost = null; boostDone = true; stats.boosts++;
        track(me.word({ letters: 0, clean }));
        emit('boost', { amount: c.dmg });
        hitBoss(c.dmg, t, { kind: 'boost', pierce: true });
        return { kind: 'boost', ok: true, amount: c.dmg };
      }
      if (c.kind === 'gift') {
        gone();
        const w = me.word({ letters: c.word.length, clean, ms }); track(w);
        hitBoss(max * 0.015 * w.mult, t, { kind: 'gift', tier: w.tier });
        if (phase === 'fight' && a && a.type === 'gifts' && !mech.some(x => a.ids.includes(x.id))) moveDone(t, 0);
        return { kind: 'gift', ok: true };
      }
      if (c.kind === 'speaker') {
        gone();
        const w = me.word({ letters: c.word.length, clean, ms }); track(w);
        hitBoss(max * 0.015 * w.mult, t, { kind: 'speaker', tier: w.tier });
        emit('speaker', { order: c.order });
        if (phase === 'fight' && a && a.type === 'speakers' && !mech.some(x => a.ids.includes(x.id))) moveDone(t, 0);
        return { kind: 'speaker', ok: true };
      }
      if (c.kind === 'fix') {
        track(me.word({ letters: 0, clean }));
        moveDone(t, 0.08);
        return { kind: 'fix', ok: true };
      }
      if (c.kind === 'answer') {
        if (c.right) { track(me.word({ letters: 0, clean })); moveDone(t, 0.12); return { kind: 'answer', ok: true }; }
        stats.good--;
        endAction(t);
        emit('wrongAnswer', { word: c.word });
        hurt(K.hit, 'answer', t);
        return { kind: 'answer', ok: false };
      }
      if (c.kind === 'packet') {
        gone();
        const p = a && a.packets && a.packets.find(x => x.id === c.id);
        if (p) { p.done = true; a.returned++; }
        const w = me.word({ letters: c.word.length, clean, ms }); track(w);
        emit('returned', { id: c.id });
        hitBoss(Math.round(c.word.length * D.UNIT * 3 * w.mult * stunK(t)), t, { kind: 'return', tier: w.tier });
        return { kind: 'packet', ok: true };
      }
      return null;
    }

    // a spell from the combat engine: damage scaled to this boss, with the effects
    function cast(r, t = now()) {
      if (!r || r.fizzled || phase !== 'fight') return null;
      stats.casts++;
      const scale = max / D.SPELL_REF;
      const cap = max * (r.spell.rarity >= 4 ? D.SPELL_CAP_ULT : D.SPELL_CAP);
      const raw = r.total * scale;
      const k = raw > cap ? cap / raw : 1;
      const hits = r.hits.map(h => ({ at: t + h.at, amount: Math.max(1, Math.round(h.amount * scale * k)), spell: r.spell.id, pierce: r.pierce }));
      queue.push(...hits);
      const e = r.effect || {};
      const a = boss.action;
      if (e.debuff === 'freeze') {
        if (a && a.type === 'windup') { a.due += e.ms; a.total += e.ms; for (const c of mech) if (a.ids.includes(c.id)) { c.due = a.due; c.total = a.total; c.frozen = true; } }
        else frost = e.ms;
      }
      if (e.debuff === 'stun') { boss.panicUntil = t + e.ms; boss.attackAt = Math.max(boss.attackAt, t + e.ms); }
      if (e.returnShots && a && a.type === 'volley') {
        for (const p of a.packets) if (p.live && !p.done) { p.done = true; a.returned++; mech = mech.filter(c => c.id !== p.id); emit('returned', { id: p.id }); hitBoss(p.word.length * D.UNIT * 3, t, { kind: 'return' }); }
      }
      if (e.clearAdds && a && a.type === 'gifts') moveDone(t, 0);
      if (e.heal) { const add = Math.min(Math.round(player.max * e.heal), player.max - player.hp); if (add > 0) { player.hp += add; emit('heal', { amount: add, hp: player.hp }); } }
      return { total: hits.reduce((s, h) => s + h.amount, 0), hits: hits.map(h => ({ at: h.at - t, amount: h.amount })) };
    }

    function finish(t, won) {
      if (phase === 'won' || phase === 'lost') return;
      phase = won ? 'won' : 'lost';
      endAt = t;
      mech = []; boss.action = null; weak = null; boost = null; queue = []; sigs = []; marks.clear();
      if (me.closeOffer) me.closeOffer('end');
      emit(won ? 'won' : 'lost', summary());
    }
    function summary() {
      const end = endAt || now();
      const secs = Math.max(0.5, (end - fightAt) / 1000);
      const reacts = stats.reacts;
      return {
        won: phase === 'won', left: boss.hp / max, hpLeft: player.hp / player.max, secs,
        wpm: Math.round(stats.letters / 5 / (secs / 60)),
        acc: stats.keys ? Math.round(1000 * stats.good / stats.keys) / 10 : 100,
        react: reacts.length ? Math.round(reacts.reduce((a, b) => a + b, 0) / reacts.length) : 0,
        combo: fightBest, dmg: Math.round(stats.dmg), casts: stats.casts, blocks: stats.blocks, hurts: stats.hurts,
        missed: stats.missed, words: stats.words, letters: stats.letters, keys: stats.keys, good: stats.good,
        moves: stats.moves, movesDone: stats.movesDone, boosts: stats.boosts, max, sizedSecs: K.T,
        sigs: stats.sigs, sigsDone: stats.sigsDone, sigHits: stats.sigHits, stage,
      };
    }
    function state(t = now()) {
      const a = boss.action;
      return {
        phase, t, fightAt,
        hp: boss.hp, max, shield: boss.shield && { ...boss.shield },
        stunned: t < boss.stunUntil, stunLong: boss.stunLong && t < boss.stunUntil, stunLeft: Math.max(0, boss.stunUntil - t),
        panic: t < boss.panicUntil, enraged: boss.enraged, heat: boss.heat,
        action: a && { type: a.type, start: a.start, due: a.due, total: a.total, shown: a.shown, chain: a.chain, atk: a.atk && a.atk.id, name: a.atk && a.atk.name },
        player: { ...player }, nextAttack: Math.max(0, boss.attackAt - t), nextSig: Math.max(0, sigAt - t), timed: sigs.some(x => x.due),
        stage, stageLeft: Math.max(0, stageUntil - t), sig: SG.kind, volume, pageHeat, pageHeatMax: SG.heat || 0, popCap: SG.cap || 0,
      };
    }
    // moves every clock forward, for a pause
    function shift(ms) {
      fightAt += ms; boss.attackAt += ms; boss.stunUntil += ms; boss.panicUntil += ms; weakAt += ms;
      const a = boss.action;
      if (a) { a.start += ms; a.due += ms; if (a.packets) a.packets.forEach(p => { p.launch += ms; p.due += ms; }); }
      mech.forEach(c => { c.due += ms; });
      sigs.forEach(c => { if (c.due) c.due += ms; c.born += ms; });
      sigAt += ms; stageUntil += ms; pageHeatAt += ms; lastT += ms;
      if (boost) boost.due += ms;
      queue.forEach(h => { h.at += ms; });
    }

    return {
      start, tick, chips, stack: () => stack.slice(), key, submit, fire, cast, state, summary, shift,
      marks: () => [...marks].map(([abs, fake]) => ({ i: abs - stackBase, fake })).filter(x => x.i >= 0),
      get phase() { return phase; }, plan,
      debug: {
        win: t => { boss.hp = 1; hitBoss(5, t === undefined ? now() : t, { kind: 'debug', pierce: true }); },
        lose: (t, left) => { if (left !== undefined) boss.hp = Math.max(1, Math.round(max * left)); player.hp = 0; finish(t === undefined ? now() : t, false); },
        setHp: (f, t) => { boss.hp = Math.max(1, Math.round(max * f)); const want = boss.hp <= max * D.STAGES[1] ? 3 : boss.hp <= max * D.STAGES[0] ? 2 : 1; if (want > stage) setStage(t === undefined ? now() : t, want); },
        sig: t => { sigAt = 0; tick(t === undefined ? now() : t); },
        setVolume: v => { volume = v; },
        // the next attack now; id picks a titan's attack (tests), and skips the turn of its own move
        attack: (t, id) => { if (id) { forceAtk = id; if ((boss.cycle + 1) % (tw.has('twice') ? 2 : 3) === 0) boss.cycle++; } boss.attackAt = 0; boss.stunUntil = 0; tick(t === undefined ? now() : t); },
        // drops any attack under way and starts the boss's own move
        move: t => { t = t === undefined ? now() : t; if (boss.action) { mech = mech.filter(c => !boss.action.ids.includes(c.id)); boss.action = null; } boss.cycle = (tw.has('twice') ? 2 : 3) - 1; boss.attackAt = 0; boss.stunUntil = 0; boss.panicUntil = 0; tick(t); },
        boss, player,
      },
    };
  }

  return { create, INTRO_MS };
})();
