// The Superboss fight engine. It holds the rules and nothing else: no DOM, no three.js and
// no sound, and it reads time only from opts.now, so the same code runs on the streamer's page,
// in a node balance test and later on a server. SUPERBOSS.md describes the rules.
//
//   const f = SuperFight.create({ boss: 'hydra', dial: 'typemaster', now, rng });
//   f.start()                  a 3 second countdown, then the fight
//   f.char(ch), f.back(whole)  typing; space or Enter sends a word
//   f.tick()                   call 10 to 60 times a second
//   f.support(id, buyer)       a viewer's item -> { ok, reason }
//   f.state()                  a snapshot, the stream's fight.state message (SUPERBOSS.md)
//   f.result()                 the numbers for the results card
//   f.on(name, fn)             events, listed in SUPERBOSS.md
//   f.debug                    test hooks: phase(n), hp(frac), finish(), enrage(), artHp(n), combo(n), offer(ids), crowd()
//
// opts.inline = {} turns on the one line (Gid, 27 Nov 2026; js/app/combat/inline.js): Art types only
// his stack. Blocks, packets, weak points, bug fixes, the crowd spell and earned spells light up stack
// words two or more ahead, and typing a lit word right in time does the thing. The words never change.
// The Hydra keeps its stack on, and each stack word belongs to a head: typing it hits that head.
// state().line has the tags.
//
// Every typeable thing is a target: { id, kind, word, due }. Kinds, in the order a shared
// first letter is matched: finish, block, packet, decoy, weak, crowd, fix, spell, head, stack.
window.SuperFight = (() => {
  const PRIO = { finish: 0, block: 1, packet: 2, decoy: 3, weak: 3, crowd: 4, fix: 5, spell: 6, head: 7, stack: 8 };
  const OK = /^[a-z]+$/;
  const BAD = new Set(['anal']);
  const FALLBACK = 'signal vector kernel packet socket buffer thread router switch matrix binary cipher module script daemon portal'.split(' ');

  function create(o = {}) {
    const S = window.SuperData;
    const now = o.now || (() => performance.now());
    const rng = o.rng || Math.random;
    const B = S.boss(o.boss);
    const T = S.tune(o.dial);
    const R = S.R();
    const bus = Combat.Bus();
    const emit = (n, p = {}) => bus.emit(n, p);
    // the streamer has no HP to heal here, so Binary rain stays out of the offers
    const IL = o.inline && window.InlineLine ? InlineLine.create({ flow: o.inline.flow, cps: () => Math.max(T.wpm * 0.8, wpmNow()) * 5 / 60 }) : null;
    const me = Combat.create({ now, rng, earn: !!IL, spells: Combat.SPELLS().map(s => s.id).filter(id => id !== 'binary-rain') });
    const maxHp = Math.round(T.wpm * 26 * B.hpK * (typeof Combat !== 'undefined' && Combat.hpScale ? Combat.hpScale('superboss') : 1));   // Combat.HP_SCALE: Art's combo levels hit harder
    const ART_MAX = 100;

    let hp = maxHp, phase = 1, status = 'ready', t0 = 0, endAt = 0, enraged = false, lastTick = 0;
    const art = { hp: ART_MAX, max: ART_MAX };
    let targets = [], stack = [], stackOn = B.id !== 'hydra' || !!IL;
    let stackOwn = [], earned = [], modRef = null;   // the one line: which head owns each stack word (Hydra), spells earned into the line
    let typed = '', cur = null, clean = true, wordT0 = 0, idN = 0;
    let sched = [];
    const sup = { shield: 0, overUntil: 0, slowUntil: 0, healAt: -1e9 };
    const chaos = { fogUntil: 0, speedUntil: 0, lastEnd: -1e9, perPhase: [0, 0, 0, 0], live: '' };
    const hypeGoal = R.hypeGoal || 300, hypeK = R.hypeItemK || 3;
    let hype = 0, finish = null, usedPhrases = [];
    const stats = { keys: 0, good: 0, letters: 0, words: 0, missed: 0, casts: 0, spells: [], blocks: 0, fails: 0, dmg: 0, taken: 0, support: [], chaos: 0, hits: 0, crits: 0 };

    const t = () => now();
    const fightMs = () => Math.max(0, (endAt || t()) - t0);
    const slowK = () => (t() < sup.slowUntil ? 1.2 : 1) * (t() < chaos.speedUntil ? 0.85 : 1);
    const enrageK = () => (enraged ? 0.6 : 1);
    const win = (n, slack) => Math.round(T.ms(n, slack) * slowK());
    const gap = ms => T.gap(ms) * enrageK();
    const later = (ms, fn) => sched.push({ at: t() + ms, fn });

    // ---------- words ----------
    function first() {
      const s = new Set();
      for (const x of typeables()) if (x.word) s.add(x.word[0]);
      return s;
    }
    function pick(theme, len = [3, 9], avoid = first(), diff = T.diff) {
      if (window.WordBank) {
        for (let k = 0; k < 4; k++) {
          const w = WordBank.pick({ count: 6, theme, difficulty: diff, minLen: len[0], maxLen: len[1], avoidFirstLetters: k < 3 ? avoid : [], rng });
          const g = w.find(x => OK.test(x) && !BAD.has(x) && !avoid.has(x[0])) || (k === 3 && w.find(x => OK.test(x) && !BAD.has(x)));
          if (g) return g;
        }
      }
      const f = FALLBACK.filter(x => !avoid.has(x[0]));
      return (f.length ? f : FALLBACK)[Math.floor(rng() * (f.length || FALLBACK.length))];
    }
    function phrase(avoid = first()) {
      const a = pick(['common', 'cyber'], [3, 6], avoid);
      return a + ' ' + pick(['common', 'cyber'], [3, 6], new Set());
    }
    const STACK_THEME = B.id === 'compiler' ? ['cyber', 'common'] : B.id === 'hydra' ? ['cyber'] : ['mix'];
    function refill() {
      while (stack.length < (IL ? 36 : 8)) {
        const avoid = stack.length && !IL ? new Set() : IL ? new Set() : first();
        const own = IL && modRef && modRef.owner ? modRef.owner() : null;
        const h = own && B.heads ? B.heads.find(x => x.id === own) : null;
        stack.push(h ? pick(h.theme, h.len, new Set()) : pick(STACK_THEME, [3, 9], avoid));
        stackOwn.push(own);
      }
    }
    function shiftStack() { stack.shift(); stackOwn.shift(); if (IL) IL.shift(); refill(); fixStack(); }
    // a stack word may not share a first letter with a live target, so the first key picks one
    // (with the one line only the front word can be typed, so nothing to fix)
    function fixStack() {
      if (!stack.length || IL) return;
      const live = new Set(targets.map(x => x.word[0]).concat(spellTargets().map(x => x.word[0])));
      if (!live.has(stack[0][0])) return;
      const j = stack.findIndex((w, i) => i > 0 && !live.has(w[0]));
      if (j > 0) [stack[0], stack[j]] = [stack[j], stack[0]];
      else stack[0] = pick(STACK_THEME, [3, 9], live);
    }

    // ---------- targets ----------
    function addTarget(kind, word, ms, extra = {}) {
      const at = t();
      if (IL && isFinite(ms) && kind !== 'crowd' && kind !== 'head' && kind !== 'decoy' && kind !== 'fix') ms += IL.reach(stack);
      const tg = { id: kind[0] + (++idN), kind, word, born: at, due: ms === Infinity ? Infinity : at + ms, total: ms, ...extra };
      targets.push(tg);
      if (stackOn && cur !== 'stack') fixStack();
      emit('target', pub(tg));
      return tg;
    }
    function drop(id) { targets = targets.filter(x => x.id !== id); if (cur === id) { cur = null; } }
    const get = id => targets.find(x => x.id === id);
    function spellTargets() {
      const of = me.offer();
      if (!of || status !== 'fight') return [];
      return of.spells.map(id => { const sp = Combat.spell(id); return { id: 'spell:' + id, kind: 'spell', word: sp.word, spell: id, due: of.until, total: of.until - of.at, born: of.at }; });
    }
    // the one line: what goes in it, in order
    const LINE_KINDS = new Set(['block', 'packet', 'weak', 'fix', 'crowd']);
    const LABEL = { block: 'BLOCK', packet: 'SEND BACK', weak: 'WEAK POINT', fix: 'FIX', crowd: 'CROWD SPELL' };
    const lineList = () => [...targets.filter(x => LINE_KINDS.has(x.kind)).map(x => ({ ...x, n: x.word.split(' ').length, label: LABEL[x.kind] })),
      ...earned.map(e => ({ ...e, n: e.word.split(' ').length, label: e.word.toUpperCase() }))];
    function typeables() {
      if (IL && status === 'fight') return stack.length ? [{ id: 'stack', kind: 'stack', word: stack[0], due: Infinity }] : [];
      const out = status === 'finish' && finish ? [{ id: 'finish', kind: 'finish', word: finish.phrase, due: finish.due }] : [...targets, ...spellTargets()];
      if (status === 'fight' && stackOn && stack.length) out.push({ id: 'stack', kind: 'stack', word: stack[0], due: Infinity });
      return out;
    }
    const wordOf = id => { const x = typeables().find(y => y.id === id); return x ? x.word : null; };
    function retarget() {
      const w = cur && wordOf(cur);
      if (w && w.startsWith(typed)) return;
      const m = typeables().filter(x => x.word.startsWith(typed)).sort((a, b) => PRIO[a.kind] - PRIO[b.kind] || a.due - b.due)[0];
      if (m) cur = m.id;
      else if (!w) cur = null;
    }
    const pub = x => ({ id: x.id, kind: x.kind, word: x.word, left: x.due === Infinity ? null : Math.max(0, Math.round(x.due - t())), total: x.total === Infinity ? null : x.total, owner: x.owner, attack: x.attack, slot: x.slot, spell: x.spell, line: x.line });

    // ---------- typing ----------
    function char(ch) {
      if (status !== 'fight' && status !== 'finish') return;
      const at = t();
      if (status === 'finish') {
        if (typed.length >= finish.phrase.length) return;
        if (!typed) wordT0 = at;
        typed += ch;
        stats.keys++;
        const good = finish.phrase[typed.length - 1] === ch;
        if (good) stats.good++; else clean = false;
        me.key(good);
        emit('key', { good, finish: true });
        if (typed === finish.phrase) winFight();
        return;
      }
      if (ch === ' ') {
        const w = cur && wordOf(cur);
        if (w && typed && w.startsWith(typed + ' ')) { typed += ' '; stats.keys++; stats.good++; return; }
        if (typed) submit();
        return;
      }
      stats.keys++;
      if (!typed) { wordT0 = at; clean = true; if (IL) IL.hold(); }
      typed += ch;
      retarget();
      const w = cur && wordOf(cur);
      const good = !!w && typed.length <= w.length && w[typed.length - 1] === ch;
      if (good) stats.good++; else clean = false;
      me.key(good);
      emit('key', { good });
    }
    function back(whole) {
      if (!typed) return;
      typed = whole ? '' : typed.slice(0, -1);
      if (status === 'finish') return;
      if (IL && !typed) IL.release();
      if (!typed) cur = null; else retarget();
    }
    function submit() {
      if (!typed || status !== 'fight') return;
      const all = typeables();
      const exact = all.filter(x => x.word === typed).sort((a, b) => PRIO[a.kind] - PRIO[b.kind] || a.due - b.due)[0];
      const tg = IL ? all[0] : exact || (cur && all.find(x => x.id === cur));
      const text = typed, wasClean = clean;
      stats.keys++;
      typed = ''; cur = null; clean = true;
      // a lit stack word: every word of the run typed right, and the last one fires its special
      if (IL && tg && tg.kind === 'stack') {
        const h = IL.view(stack).head;
        if (h) {
          const it = h.item;
          it.ok = it.ok && tg.word === text && (it.kind !== 'spell' || wasClean);
          if (h.last) {
            IL.done(it.id);
            if (it.ok) { stats.good++; return fireLit(it, text, wasClean); }
            if (it.kind === 'spell') earned = earned.filter(e => e.id !== it.id);
          }
        }
      }
      if (!tg || tg.word !== text) {
        if (tg && tg.kind === 'spell' && tg.word.length === text.length) return castSpell(tg, false);
        stats.missed++;
        me.miss('wrong');
        emit('miss', { typed: text, word: tg ? tg.word : null });
        if (tg && tg.kind === 'stack') shiftStack();
        return;
      }
      stats.good++;
      switch (tg.kind) {
        case 'spell': return castSpell(tg, wasClean);
        case 'crowd': return castCrowd(tg);
        case 'stack': return hitStack(text, wasClean);
        case 'block': {
          me.word({ letters: 0, clean: wasClean });
          drop(tg.id);
          stats.blocks++;
          emit('block', { id: tg.id, attack: tg.attack, owner: tg.owner });
          return;
        }
        case 'decoy': {
          drop(tg.id); if (tg.pair) drop(tg.pair);
          me.miss('decoy');
          hurtArt(8, 'decoy');
          emit('decoy', { id: tg.id });
          return;
        }
        default: return mod.typed && mod.typed(tg, text, wasClean);
      }
    }
    function fireLit(it, text, wasClean) {
      if (it.kind === 'spell') {
        const sp = earned.find(e => e.id === it.id);
        earned = earned.filter(e => e.id !== it.id);
        hitStack(text, wasClean);
        if (sp) castSpell(sp, true);
        return;
      }
      const x = get(it.id);
      if (!x) return hitStack(text, wasClean);   // its moment passed: a plain word
      shiftStack();
      if (x.kind === 'block') { me.word({ letters: 0, clean: wasClean }); drop(x.id); stats.blocks++; emit('block', { id: x.id, attack: x.attack, owner: x.owner }); return; }
      if (x.kind === 'crowd') return castCrowd(x);
      return mod.typed && mod.typed(x, text, wasClean);
    }
    // damage for a typed word from the combat layer: tier, accuracy, speed and spell buffs
    function wordHit(letters, wasClean) {
      const w = me.word({ letters, clean: wasClean, ms: t() - wordT0 });
      stats.words++; stats.letters += letters;
      return { amount: w.amount * (t() < sup.overUntil ? 1.5 : 1), tier: w.tier, crit: w.crit, mult: w.mult, combo: w.combo };
    }
    function hitStack(text, wasClean) {
      const own = stackOwn[0];
      shiftStack();
      // the Hydra's line: a word that belongs to a head hits that head
      if (own && mod.typed) { const h = targets.find(x => x.kind === 'head' && x.owner === own); if (h) return mod.typed(h, text, wasClean); }
      const x = wordHit(text.length, wasClean);
      const k = mod.stackK ? mod.stackK() : 1;
      deal(x.amount * k * (x.crit ? 2 : 1), { src: 'word', word: text, tier: x.tier, crit: x.crit || k > 1, at: mod.stackAt ? mod.stackAt() : 'body' });
    }

    // ---------- damage ----------
    function deal(amount, info = {}) {
      if (status !== 'fight' || amount <= 0) return 0;
      amount = Math.max(1, Math.round(amount));
      hp = Math.max(0, hp - amount);
      stats.dmg += amount; stats.hits++;
      if (info.crit) stats.crits++;
      emit('hit', { amount, ...info, hp, frac: hp / maxHp });
      checkPhase();
      if (hp <= 0) startFinish();
      return amount;
    }
    function heal(amount) { hp = Math.min(maxHp, hp + Math.round(amount)); }
    // an attack that reached Art: support shield, then safe mode, then the hit, which breaks the combo
    function hurtArt(amount, src) {
      if (status !== 'fight') return false;
      if (sup.shield > 0) { sup.shield--; emit('shielded', { src }); return false; }
      const r = me.hurt(src);
      if (r.blocked) { emit('warded', { src }); return false; }
      return chip(amount, src);
    }
    // damage that skips the shields and keeps the combo (packets, fixing out of order)
    function chip(amount, src) {
      if (status !== 'fight') return false;
      amount = Math.round(amount * (enraged ? 1.5 : 1));
      art.hp = Math.max(0, art.hp - amount);
      stats.taken += amount;
      emit('hurt', { amount, src, hp: art.hp });
      if (src !== 'packet' && src !== 'order' && src !== 'bite') stats.fails++;
      if (art.hp <= 0) loseFight();
      return true;
    }

    // ---------- phases, enrage, finish ----------
    function checkPhase() {
      const f = hp / maxHp;
      if (phase === 1 && f <= 2 / 3) setPhase(2);
      if (phase === 2 && f <= 1 / 3) setPhase(3);
    }
    function setPhase(n) {
      phase = n;
      // attacks winding up when the phase breaks are called off; the banner gets 2.5 seconds
      for (const x of targets.filter(x => ['block', 'packet', 'weak', 'decoy'].includes(x.kind))) drop(x.id);
      if (mod.phase) mod.phase(n);
      emit('phase', { n, line: B.phases[n - 1] });
    }
    function startFinish() {
      status = 'finish'; phase = 3;
      targets = []; cur = 'finish'; typed = ''; clean = true;
      me.closeOffer('finish');
      const left = B.finish.filter(p => !usedPhrases.includes(p));
      const p = (left.length ? left : B.finish)[Math.floor(rng() * (left.length || B.finish.length))];
      usedPhrases.push(p);
      const ms = T.ms(p.length, 1.7) + 1500;
      finish = { phrase: p, due: t() + ms, total: ms };
      emit('finish', { phrase: p, ms });
    }
    function finishFail() {
      status = 'fight';
      hp = Math.round(maxHp * 0.12);
      finish = null; typed = ''; cur = null; clean = true;
      if (mod.resume) mod.resume();
      emit('finishFail', { hp });
      chip(10, 'finish');
    }
    function winFight() {
      status = 'won'; endAt = t(); hp = 0;
      finish = null; typed = ''; targets = [];
      emit('win', result());
    }
    function loseFight() {
      status = 'lost'; endAt = t();
      finish = null; typed = ''; targets = [];
      me.closeOffer('lost');
      emit('lose', result());
    }

    // ---------- spells ----------
    function castSpell(tg, ok) {
      const r = me.cast(tg.word, { clean: ok });
      if (!r) return;
      if (r.fizzled) { stats.missed++; emit('fizzle', { spell: tg.spell }); return; }
      runCast(r.spell, r.hits, r.effect, false);
    }
    function runCast(sp, hits, e, crowd) {
      stats.casts++; stats.spells.push(sp.id);
      emit('cast', { spell: sp.id, word: sp.word, rarity: sp.rarity, hits: hits.map(h => ({ at: h.at, amount: h.amount, power: h.power })), effect: e, crowd });
      const over = t() < sup.overUntil ? 1.5 : 1;
      hits.forEach((h, i) => later(h.at, () => deal(h.amount * over, { src: 'spell', spell: sp.id, i, last: i === hits.length - 1, at: mod.spellAt ? mod.spellAt() : 'body', crit: sp.rarity >= 3 && i === hits.length - 1 })));
      if (e.debuff === 'freeze') for (const x of targets) if (x.kind === 'block' || x.kind === 'packet') { x.due += e.ms; x.total += e.ms; }
      if (e.cleanse) { chaos.fogUntil = 0; chaos.speedUntil = 0; emit('cleanse', {}); }
      if (e.clearAdds && mod.clearAdds) mod.clearAdds();
      if (e.returnShots && mod.returnShots) mod.returnShots();
    }
    function castCrowd(tg) {
      drop(tg.id);
      const sp = Combat.spell(tg.spell);
      const acc = me.acc();
      const hits = Combat.hitsFor(sp, { recent: [] }).map(h => ({ at: h.at, power: h.power, amount: Combat.Damage.spell(h.power, { acc }).amount }));
      const e = sp.effect || {};
      if (e.status) me.start(e.status, e);
      runCast(sp, hits, e, true);
    }
    me.on('tierUp', e => emit('tier', { up: true, ...e }));
    me.on('miss', e => emit('comboDrop', e));
    me.on('spellEarned', e => { if (IL) earned.push({ id: 'spell:' + e.spell.id + ':' + (++idN), kind: 'spell', word: e.spell.word, spell: e.spell.id, due: Infinity, total: null }); });
    me.on('spellOffer', o2 => { if (stackOn) fixStack(); emit('offer', { spells: o2.spells.map(s => s.id), until: o2.until }); });
    me.on('offerEnd', e => emit('offerEnd', { reason: e.reason }));
    me.on('ward', () => emit('ward', {}));
    me.on('guard', () => emit('guard', {}));
    me.on('status', e => emit('status', { name: e.name, on: e.on }));

    // ---------- support and chaos ----------
    function chaosBlock() {
      const at = t();
      if (status === 'finish') return 'Chaos is off during the finish.';
      if (status !== 'fight') return 'The fight is not running.';
      if (at - t0 < S.CHAOS.quietStartMs) return 'Chaos opens 8 seconds into the fight.';
      if (art.hp / art.max < S.CHAOS.minArtHp) return 'Art is under 30% HP.';
      if (at < chaos.fogUntil || at < chaos.speedUntil) return 'Another chaos item is running.';
      if (at - chaos.lastEnd < S.CHAOS.gapMs) return 'Chaos is cooling down.';
      if (chaos.perPhase[phase] >= S.CHAOS.perPhase) return 'Two chaos items already hit this phase.';
      return null;
    }
    function support(id, buyer = 'viewer', opts = {}) {
      const it = S.item(id);
      if (!it) return { ok: false, reason: 'No such item.' };
      if (status !== 'fight' && status !== 'finish' && status !== 'countdown') return { ok: false, reason: 'The fight is over.' };
      const at = t(), price = S.price(id);
      if (it.kind === 'chaos') {
        const why = chaosBlock();
        if (why) return { ok: false, reason: why };
        chaos.perPhase[phase]++; stats.chaos++;
        if (id === 'fog') { chaos.fogUntil = at + 5000; chaos.lastEnd = at + 5000; chaos.live = 'fog'; }
        if (id === 'speed') { chaos.speedUntil = at + 8000; chaos.lastEnd = at + 8000; chaos.live = 'speed'; }
        if (id === 'shuffle') { chaos.lastEnd = at; shuffle(); }
      } else {
        if (id === 'shield') { if (sup.shield >= 2) return { ok: false, reason: 'Art already has 2 shields.' }; sup.shield++; }
        if (id === 'overclock') sup.overUntil = at + 10000;
        if (id === 'heal') {
          if (at - sup.healAt < 8000) return { ok: false, reason: 'A heal landed in the last 8 seconds.' };
          if (art.hp >= art.max) return { ok: false, reason: 'Art is at full HP.' };
          sup.healAt = at; art.hp = Math.min(art.max, art.hp + art.max * 0.05);
        }
        if (id === 'slowmo') {
          if (at >= sup.slowUntil) for (const x of targets) if (x.kind === 'block' || x.kind === 'packet') { const l = x.due - at; x.due += l * 0.2; x.total += l * 0.2; }
          sup.slowUntil = at + 10000;
        }
      }
      const rec = { id, kind: it.kind, buyer, price, at: fightMs(), you: !!opts.you };
      stats.support.push(rec);
      emit('support', rec);
      if (it.kind === 'support') {
        hype += price * (id === 'hype' ? hypeK : 1);
        if (hype >= hypeGoal) { hype = 0; crowdSpell(); }
      }
      return { ok: true };
    }
    function shuffle() {
      if (mod.shuffle && mod.shuffle()) { emit('shuffle', {}); return; }
      if (!stack.length) return;
      const i = cur === 'stack' && typed ? 1 : 0;
      const avoid = i === 0 ? new Set(targets.map(x => x.word[0])) : new Set();
      stack[i] = pick(STACK_THEME, [5, 9], avoid, [T.diff[0] + 1, T.diff[1] + 2]);
      emit('shuffle', {});
    }
    function crowdSpell() {
      const pool = Combat.SPELLS().filter(s => s.rarity >= 2 && s.rarity <= 3 && s.hits.length);
      const live = first();
      const ok = pool.filter(s => !live.has(s.word[0]));
      const sp = (ok.length ? ok : pool)[Math.floor(rng() * (ok.length || pool.length))];
      if (status === 'fight') addTarget('crowd', sp.word, 15000, { spell: sp.id });
      emit('hype', { full: true, spell: sp.id });
    }

    // ---------- boss mechanics ----------
    const F = { T, B, me, rng, now: t, emit, addTarget, drop, get, deal, heal, hurtArt, chip, wordHit, pick, phrase, win, gap, later, first,
      get phase() { return phase; }, get hp() { return hp; }, maxHp, get targets() { return targets; }, get typed() { return typed; }, get cur() { return cur; },
      setStack(on) { if (IL) on = true; stackOn = on; if (on) { refill(); fixStack(); } else if (cur === 'stack') { cur = null; typed = ''; } },
      lead: () => (IL ? IL.reach(stack) : 0), inline: !!IL,
      stunned: () => !!me.status('stunned-target'),
    };
    const mod = (MODS[B.id] || MODS.hydra)(F);
    modRef = mod;

    // ---------- clock ----------
    function start() {
      if (status !== 'ready') return;
      status = 'countdown'; t0 = t() + 3000;
      if (stackOn) refill();
      emit('countdown', { ms: 3000 });
    }
    function tick() {
      const at = t();
      const dt = lastTick ? Math.min(0.25, (at - lastTick) / 1000) : 0;
      lastTick = at;
      me.tick();
      if (status === 'countdown' && at >= t0) { status = 'fight'; if (mod.init) mod.init(); if (stackOn) { refill(); fixStack(); } emit('go', {}); }
      if (status === 'finish' && finish && at >= finish.due) finishFail();
      if (status !== 'fight') return;
      if (!enraged && at - t0 >= B.enrageS * 1000) { enraged = true; emit('enrage', {}); }
      if (chaos.live === 'fog' && at >= chaos.fogUntil) { chaos.live = ''; emit('chaosEnd', { id: 'fog' }); }
      if (chaos.live === 'speed' && at >= chaos.speedUntil) { chaos.live = ''; emit('chaosEnd', { id: 'speed' }); }
      for (const x of targets.filter(x => x.due <= at)) {
        drop(x.id);
        if (x.kind === 'block') { emit('blockFail', { id: x.id, attack: x.attack, owner: x.owner }); hurtArt(x.dmg || 12, x.attack || 'attack'); }
        else if (x.kind === 'crowd') emit('crowdGone', {});
        else if (mod.expire) mod.expire(x);
        if (status !== 'fight') return;
      }
      if (cur && cur !== 'stack' && cur !== 'finish' && !wordOf(cur)) { cur = null; if (typed) retarget(); }
      const due = sched.filter(s => s.at <= at);
      if (due.length) { sched = sched.filter(s => s.at > at); due.forEach(s => s.fn()); }
      if (status === 'fight' && mod.tick) mod.tick(at, dt);
      if (IL && status === 'fight') IL.sync(lineList(), stack);
    }
    // the line for the page and the stream: the specials' tags, and each Hydra word's head
    function lineSnap() {
      if (!IL || status !== 'fight') return null;
      const v = IL.view(stack, t());
      const tags = v.tags.map((g, i) => { if (g) return g; const own = stackOwn[i]; return own ? { kind: 'head', own, first: true, last: true } : null; });
      return { cur: v.cur, next: v.next, tags, head: v.head ? { id: v.head.item.id, kind: v.head.item.kind } : null };
    }

    // ---------- reading ----------
    function state() {
      const at = t(), c = me.state();
      const tg = typeables().filter(x => x.kind !== 'stack' && x.kind !== 'finish').map(pub);
      return {
        v: 1, t: Math.round(fightMs()), status, boss: B.id, dial: T.id, phase, hp, maxHp,
        enrageIn: status === 'countdown' ? B.enrageS * 1000 : Math.round(B.enrageS * 1000 - fightMs()), enraged,
        countdown: status === 'countdown' ? Math.max(0, Math.round(t0 - at)) : 0,
        art: {
          hp: Math.round(art.hp), max: art.max, combo: c.combo, best: c.best, tier: c.tier, tierName: c.name, next: c.next, progress: +c.progress.toFixed(3),
          acc: +(stats.keys ? stats.good / stats.keys : 1).toFixed(3), wpm: wpmNow(),
          shield: sup.shield, over: Math.max(0, Math.round(sup.overUntil - at)), slow: Math.max(0, Math.round(sup.slowUntil - at)),
          buffs: c.statuses.map(s => ({ name: s.name, left: s.until ? Math.max(0, Math.round(s.until - at)) : null, charges: s.charges || 0 })),
        },
        typed, cur, stack: stackOn ? stack.slice(0, 6) : [], targets: tg, line: lineSnap(),
        finish: finish ? { phrase: finish.phrase, left: Math.max(0, Math.round(finish.due - at)), total: finish.total } : null,
        chaos: { fog: Math.max(0, Math.round(chaos.fogUntil - at)), speed: Math.max(0, Math.round(chaos.speedUntil - at)), block: chaosBlock() },
        hype: { n: Math.round(hype), goal: hypeGoal },
        b: mod.snap ? mod.snap(at) : null,
      };
    }
    function wpmNow() {
      const ms = fightMs();
      return ms > 2000 ? Math.round(stats.good / 5 / (ms / 60000)) : 0;
    }
    function result() {
      const by = {};
      for (const s of stats.support) { const b = (by[s.buyer] ||= { name: s.buyer, coins: 0, items: 0, you: false }); b.coins += s.price; b.items++; b.you ||= s.you; }
      const top = Object.values(by).sort((a, b) => b.coins - a.coins || b.items - a.items).slice(0, 3);
      const sup2 = stats.support.filter(s => s.kind === 'support');
      return {
        boss: B.id, bossName: B.name, dial: T.id, dialName: T.name, won: status === 'won', ms: Math.round(fightMs()), phase,
        wpm: wpmNow(), acc: stats.keys ? Math.round(1000 * stats.good / stats.keys) / 10 : 0, keys: stats.keys, correct: stats.good,
        bestCombo: me.state().best, words: stats.words, casts: stats.casts, spells: [...stats.spells], dmg: stats.dmg, taken: stats.taken, blocks: stats.blocks,
        support: sup2.length, supportCoins: sup2.reduce((a, s) => a + s.price, 0), chaos: stats.chaos, top, hpLeft: hp,
      };
    }

    return {
      start, tick, char, back, support, state, result, on: bus.on, off: bus.off,
      get status() { return status; }, boss: B, tune: T, me,
      debug: {
        phase: n => { if (status !== 'fight') return; const f = n === 2 ? 0.66 : n === 3 ? 0.33 : 1; hp = Math.floor(maxHp * f) - 1; checkPhase(); },
        hp: f => { hp = Math.max(1, Math.round(maxHp * f)); checkPhase(); },
        finish: ms => { if (status === 'fight') { hp = 0; phase = 3; startFinish(); if (ms) { finish.due = t() + ms; finish.total = ms; } } },
        enrage: () => { t0 = t() - B.enrageS * 1000; },
        artHp: n => { art.hp = n; },
        combo: n => me.debug.setCombo(n),
        offer: ids => me.debug.offer(ids),
        crowd: () => crowdSpell(),
        sched: () => sched.length,
      },
    };
  }

  // ---------- the three bosses ----------
  const MODS = {
    // Kernel Hydra: three heads, each with its own word stream. Typing a head's word hits it and
    // the body. A head left alone for 2.5 s heals. A cut head grows back. All three down opens
    // the neck: core words for 5 s at triple damage.
    hydra(F) {
      const { T, B } = F;
      const AVG = { fork: 4, root: 7, patch: 6 }, WORDS = { fork: 5, root: 7, patch: 6 };
      const heads = B.heads.map((h, i) => ({ ...h, i, max: 1, hp: 1, up: true, downUntil: 0, lastHit: 0, tid: null, word: '' }));
      const REGROW = [0, 9000, 7500, 6000], REGEN = [0, 0.08, 0.1, 0.13];
      let neckUntil = 0, nextBite = 0, nextBreath = 0, nextMend = 0, biteWarn = false, mendAt = 0;
      const head = id => heads.find(h => h.id === id);
      // in the one line a head can't be picked to focus on, so heads are a little smaller there
      const size = h => Math.round(WORDS[h.id] * AVG[h.id] * 1.6 * (1 + 0.15 * (F.phase - 1)) * (T.wpm / 150 * 0.5 + 0.5) * (F.inline ? 0.8 : 1));
      function newWord(h) {
        if (h.tid) F.drop(h.tid);
        h.word = F.pick(h.theme, h.len);
        h.tid = F.addTarget('head', h.word, Infinity, { owner: h.id }).id;
      }
      function sever(h) {
        h.up = false; h.hp = 0; h.downUntil = F.now() + F.gap(REGROW[F.phase]) / (F.phase > 1 ? 1 : 1);
        if (h.tid) { F.drop(h.tid); h.tid = null; }
        // cutting a head stops its attack
        for (const x of F.targets.filter(x => x.owner === h.id && x.kind === 'block')) { F.drop(x.id); F.emit('cancel', { id: x.id, attack: x.attack }); }
        F.emit('sever', { head: h.id });
        F.deal(F.maxHp * 0.015, { src: 'sever', at: 'head:' + h.id, crit: true });
        if (heads.every(x => !x.up) && !neckUntil) {
          neckUntil = F.now() + 5000;
          F.setStack(true);
          F.emit('neck', { on: true, ms: 5000 });
        }
      }
      function regrow(h, frac) {
        h.max = size(h); h.up = true; h.hp = Math.round(h.max * frac); h.lastHit = F.now();
        newWord(h);
        F.emit('regrow', { head: h.id, frac });
      }
      return {
        init() {
          const at = F.now();
          heads.forEach(h => { h.max = size(h); h.hp = h.max; h.lastHit = at; newWord(h); });
          nextBite = at + F.gap(4500); nextBreath = at + F.gap(9000); nextMend = at + F.gap(7000);
        },
        typed(tg, text, ok) {
          const h = head(tg.owner);
          if (!h || !h.up) return;
          const x = F.wordHit(text.length, ok);
          const amt = x.amount * (x.crit ? 2 : 1);
          h.hp -= amt; h.lastHit = F.now();
          F.deal(amt, { src: 'head', word: text, tier: x.tier, crit: x.crit, at: 'head:' + h.id, head: h.id });
          if (F.hp <= 0) return;
          if (h.hp <= 0) sever(h); else newWord(h);
        },
        tick(at, dt) {
          for (const h of heads) {
            if (!h.up && !neckUntil && at >= h.downUntil) regrow(h, 1);
            if (h.up && at - h.lastHit > 2500 && h.hp < h.max) h.hp = Math.min(h.max, h.hp + h.max * REGEN[F.phase] * dt);
          }
          if (neckUntil && at >= neckUntil) {
            neckUntil = 0; F.setStack(false);
            F.emit('neck', { on: false });
            heads.forEach(h => { if (!h.up) regrow(h, 1); });
          }
          if (neckUntil || F.stunned()) { nextBite = Math.max(nextBite, at + 900); return; }
          const fork = head('fork'), root = head('root'), patch = head('patch');
          // Fork bites on a timer; a 0.9 s warning gives time to finish cutting it
          if (!biteWarn && at >= nextBite - 900 && fork.up) { biteWarn = true; F.emit('windup', { kind: 'bite', owner: 'fork', ms: 900 }); }
          if (at >= nextBite) {
            // a bite chips HP and keeps the combo; only cutting Fork stops them
            if (fork.up) { F.emit('attack', { kind: 'bite', owner: 'fork' }); F.chip([0, 3, 4, 5][F.phase], 'bite'); }
            biteWarn = false; nextBite = at + F.gap([0, 6500, 5500, 4500][F.phase]);
          }
          // Root breathes: block it, or cut Root before it lands
          if (at >= nextBreath && root.up && !F.targets.some(x => x.attack === 'breath')) {
            const w = F.phase >= 3 ? F.phrase() : F.pick(['cyber', 'common'], [4, 8]);
            const ms = F.win(w.length, 1.7) + 400;
            F.addTarget('block', w, ms, { owner: 'root', attack: 'breath', dmg: [0, 14, 16, 18][F.phase] });
            F.emit('windup', { kind: 'breath', owner: 'root', ms });
            nextBreath = at + ms + F.gap([0, 11000, 9500, 8000][F.phase]);
          } else if (at >= nextBreath && !root.up) nextBreath = at + 1500;
          // Patch mends the other heads, and from phase 2 puts cut heads back on
          if (!mendAt && at >= nextMend && patch.up) { mendAt = at + 1200; F.emit('windup', { kind: 'mend', owner: 'patch', ms: 1200 }); }
          if (mendAt && at >= mendAt) {
            mendAt = 0; nextMend = at + F.gap([0, 7500, 6500, 6000][F.phase]);
            if (patch.up) {
              heads.forEach(h => { if (h.up && h !== patch) h.hp = Math.min(h.max, h.hp + h.max * 0.25); });
              F.heal(F.maxHp * 0.006);
              if (F.phase >= 2) heads.forEach(h => { if (!h.up && !neckUntil) regrow(h, 0.5); });
              F.emit('attack', { kind: 'mend', owner: 'patch' });
            }
          } else if (!patch.up && at >= nextMend) nextMend = at + 1500;
        },
        phase() { const at = F.now(); nextBreath = Math.max(nextBreath, at + 3500); nextBite = Math.max(nextBite, at + 3000); nextMend = Math.max(nextMend, at + 3000); biteWarn = false; mendAt = 0; heads.forEach(h => { const k = h.hp / h.max; h.max = size(h); h.hp = Math.round(h.max * k); }); },
        resume() { const at = F.now(); if (neckUntil) { neckUntil = 0; F.setStack(false); } heads.forEach(h => regrow(h, 0.6)); nextBreath = at + 3000; nextBite = at + 2500; nextMend = at + 3000; },
        stackK: () => 3,
        stackAt: () => 'core',
        spellAt: () => 'core',
        clearAdds() { const h = heads.filter(x => x.up).sort((a, b) => a.hp - b.hp)[0]; if (h) sever(h); },
        shuffle() {
          const up = heads.filter(h => h.up && h.tid !== F.cur);
          if (!up.length) return false;
          const h = up[Math.floor(F.rng() * up.length)];
          if (h.tid) F.drop(h.tid);
          h.word = F.pick(h.theme, [h.len[0] + 1, h.len[1] + 2], F.first(), [T.diff[0] + 1, T.diff[1] + 2]);
          h.tid = F.addTarget('head', h.word, Infinity, { owner: h.id }).id;
          return true;
        },
        // the one line: who owns the next stack word. Heads that are up take turns, so each one keeps
        // taking hits; with every head down (the neck open) the words belong to no one and hit x3
        owner() {
          const up = heads.filter(h => h.up);
          if (!up.length) return null;
          // most words go to the head worth cutting first (Fork stops the bites; from phase 2 Patch,
          // since it reattaches heads), the rest to the others so they still take some hits
          const order = F.phase >= 2 ? ['patch', 'fork', 'root'] : ['fork', 'root', 'patch'];
          const first = order.map(head).find(h => h && h.up);
          if (first && F.rng() < 0.65) return first.id;
          return up[Math.floor(F.rng() * up.length)].id;
        },
        snap(at) {
          return {
            heads: heads.map(h => ({ id: h.id, name: h.name, role: h.role, hp: Math.max(0, Math.round(h.hp)), max: h.max, up: h.up, tid: h.tid, regrowIn: h.up ? 0 : Math.max(0, Math.round((neckUntil || h.downUntil) - at)) })),
            neck: neckUntil ? Math.max(0, Math.round(neckUntil - at)) : 0,
            bite: Math.max(0, Math.round(nextBite - at)), mend: mendAt ? Math.max(0, Math.round(mendAt - at)) : 0,
          };
        },
      };
    },

    // The Compiler: writes code lines with a bug in each. Type the fixed word before the line
    // compiles. Fixing the oldest line first doubles the damage; any other order costs 3 HP.
    compiler(F) {
      const { T, B } = F;
      const TWO = ['{w}.send({w2});', 'if ({w}) {w2}();', 'const {w} = {w2}(cfg);', 'return {w} + {w2};', '{w}.merge({w2});', 'emit({w}, {w2});'];
      let lines = [], nextLine = 0, nextOverflow = 0, lid = 0;
      function mutate(w) {
        for (let k = 0; k < 12; k++) {
          const r = F.rng(), n = w.length;
          let out;
          if (r < 0.45) { const i = 1 + Math.floor(F.rng() * (n - 2)); out = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); }
          else if (r < 0.75) { const i = 1 + Math.floor(F.rng() * (n - 1)); out = w.slice(0, i) + w.slice(i + 1); }
          else { const i = 1 + Math.floor(F.rng() * (n - 1)); out = w.slice(0, i) + w[i] + w.slice(i); }
          if (out !== w) return out;
        }
        return w + w[w.length - 1];
      }
      function spawn() {
        const at = F.now();
        const two = F.phase >= 2 && F.rng() < 0.4;
        const tpl = two ? TWO[Math.floor(F.rng() * TWO.length)] : B.lines[Math.floor(F.rng() * B.lines.length)];
        const avoid = F.first();
        const good = [F.pick(['cyber', 'common'], [5, 9], avoid)];
        if (two) good.push(F.pick(['cyber', 'common'], [4, 7], new Set([...avoid, good[0][0]])));
        const letters = good.reduce((a, w) => a + w.length, 0);
        const lastDue = lines.filter(l => l.state === 'live').reduce((m, l) => Math.max(m, l.due), 0);
        const ms = F.win(letters, 1.9) + F.gap([0, 2800, 2200, 1700][F.phase]) + F.lead();
        const due = Math.max(at + ms, lastDue + 700);
        const line = { id: 'L' + (++lid), tpl, fixes: good.map(g => ({ good: g, bad: mutate(g), done: false })), k: 0, born: at, due, total: due - at, state: 'live', endAt: 0, tid: null };
        lines.push(line);
        line.tid = F.addTarget('fix', good[0], due - at, { owner: line.id, line: line.id }).id;
        F.emit('line', { id: line.id });
      }
      function oldest() { return lines.filter(l => l.state === 'live').sort((a, b) => a.born - b.born)[0]; }
      function done(line, how) { line.state = how; line.endAt = F.now(); if (line.tid) F.drop(line.tid); line.tid = null; }
      return {
        init() { const at = F.now(); nextLine = at + 1200; nextOverflow = at + F.gap(12000); },
        typed(tg, text, ok) {
          const line = lines.find(l => l.id === tg.owner);
          if (!line || line.state !== 'live') return;
          const inOrder = line === oldest();
          const x = F.wordHit(text.length, ok);
          F.deal(x.amount * (inOrder ? 2 : 1) * (x.crit ? 2 : 1), { src: 'fix', word: text, tier: x.tier, crit: x.crit || inOrder, at: 'line:' + line.id, line: line.id });
          if (!inOrder) { F.me.miss('order'); F.emit('order', { line: line.id }); F.chip(3, 'order'); }
          line.fixes[line.k].done = true; line.k++;
          F.drop(tg.id); line.tid = null;
          if (line.k < line.fixes.length && F.inline) line.due = Math.max(line.due, F.now() + F.lead() + F.win(line.fixes[line.k].good.length, 1.2));
          if (line.k < line.fixes.length) line.tid = F.addTarget('fix', line.fixes[line.k].good, Math.max(300, line.due - F.now()), { owner: line.id, line: line.id }).id;
          else { done(line, 'fixed'); F.emit('fix', { line: line.id, inOrder }); }
        },
        expire(x) {
          if (x.kind !== 'fix') return;
          const line = lines.find(l => l.id === x.owner);
          if (!line || line.state !== 'live') return;
          done(line, 'compiled');
          F.emit('compile', { line: line.id });
          F.hurtArt([0, 9, 11, 13][F.phase], 'compile');
        },
        tick(at) {
          lines = lines.filter(l => l.state === 'live' || at - l.endAt < 1400).slice(-8);
          if (F.stunned()) { nextLine = Math.max(nextLine, at + 400); return; }
          if (at >= nextLine && lines.filter(l => l.state === 'live').length < 5) {
            spawn();
            if (F.phase >= 3 && F.rng() < 0.3) spawn();
            nextLine = at + F.gap([0, 4600, 4000, 3400][F.phase]);
          }
          if (at >= nextOverflow && !F.targets.some(x => x.attack === 'overflow')) {
            const w = F.phase >= 3 ? F.phrase() : F.pick(['cyber', 'common'], [4, 8]);
            const ms = F.win(w.length, 1.7) + 400;
            F.addTarget('block', w, ms, { owner: 'tower', attack: 'overflow', dmg: [0, 14, 15, 16][F.phase] });
            F.emit('windup', { kind: 'overflow', ms });
            nextOverflow = at + ms + F.gap([0, 13000, 11000, 9000][F.phase]);
          }
        },
        phase() { const at = F.now(); nextLine = Math.max(nextLine, at + 2500); nextOverflow = Math.max(nextOverflow, at + 4000); },
        resume() { const at = F.now(); lines = []; nextLine = at + 1200; nextOverflow = at + 4000; },
        stackAt: () => 'core',
        spellAt: () => 'core',
        clearAdds() { for (const l of lines.filter(l => l.state === 'live')) { done(l, 'fixed'); F.emit('fix', { line: l.id, inOrder: true, auto: true }); } },
        snap(at) {
          return {
            lines: lines.map(l => {
              const tg = l.tid && F.get(l.tid), due = tg ? tg.due : l.due;
              return { id: l.id, tpl: l.tpl, fixes: l.fixes.map(f => ({ bad: f.bad, good: T.hint ? f.good : null, done: f.done })), k: l.k, left: Math.max(0, Math.round(due - at)), total: tg ? tg.total : l.total, state: l.state, tid: l.tid };
            }),
            hint: T.hint,
          };
        },
      };
    },

    // Packet Leviathan: a weak point word shows on the segment facing you for a split second.
    // It lunges (block word), spits packets (send them back) and from phase 2 shows a red decoy.
    leviathan(F) {
      let nextWeak = 0, nextLunge = 0, nextSpit = 0, dive = 0;
      return {
        init() { const at = F.now(); nextWeak = at + 1800; nextLunge = at + F.gap(10000); nextSpit = at + F.gap(6500); },
        typed(tg, text, ok) {
          const x = F.wordHit(text.length, ok);
          if (tg.kind === 'weak') {
            F.drop(tg.id); if (tg.pair) F.drop(tg.pair);
            F.deal(x.amount * 3.5, { src: 'weak', word: text, tier: x.tier, crit: true, at: 'seg:front' });
            F.emit('weak', { hit: true, id: tg.id });
          } else if (tg.kind === 'packet') {
            F.drop(tg.id);
            F.deal(x.amount * 3 * (x.crit ? 2 : 1), { src: 'packet', word: text, tier: x.tier, crit: x.crit, at: 'head' });
            F.emit('packet', { returned: true, id: tg.id });
          }
        },
        expire(x) {
          if (x.kind === 'weak') { if (x.pair) F.drop(x.pair); F.emit('weak', { hit: false, id: x.id }); }
          if (x.kind === 'packet') { F.emit('packet', { returned: false, id: x.id }); F.chip(4, 'packet'); }
        },
        tick(at) {
          if (F.stunned()) { nextWeak = Math.max(nextWeak, at + 300); return; }
          if (at >= nextWeak && !F.targets.some(x => x.kind === 'weak')) {
            const w = F.pick(['mix'], F.phase >= 3 ? [4, 6] : [4, 7]);
            const ms = F.win(w.length, [0, 1.25, 1.15, 1.05][F.phase]) + 250;
            const weak = F.addTarget('weak', w, ms, { slot: 'front' });
            if (F.phase >= 2 && F.rng() < 0.55) {
              const d = F.addTarget('decoy', F.pick(['mix'], [4, 7]), ms, { slot: 'far', pair: weak.id });
              weak.pair = d.id;
            }
            F.emit('weakOpen', { id: weak.id, ms });
            nextWeak = at + ms + F.gap([0, 2300, 2000, 1700][F.phase]);
          }
          if (at >= nextLunge && !F.targets.some(x => x.kind === 'block')) {
            const sweep = F.phase >= 3;
            const w = sweep ? F.phrase() : F.pick(['cyber', 'common'], [4, 8]);
            const ms = F.win(w.length, 1.6) + 500;
            F.addTarget('block', w, ms, { owner: 'serpent', attack: sweep ? 'sweep' : 'lunge', dmg: sweep ? 16 : 14 });
            dive = at + ms;
            F.emit('windup', { kind: sweep ? 'sweep' : 'lunge', ms });
            nextLunge = at + ms + F.gap([0, 11000, 9000, 7500][F.phase]);
          }
          if (at >= nextSpit && !F.targets.some(x => x.kind === 'packet')) {
            const n = [0, 2, 3, 3][F.phase];
            for (let i = 0; i < n; i++) {
              const w = F.pick(['common'], [3, 5]);
              F.addTarget('packet', w, F.win(w.length, 1.6) + 600 + i * 500, { i });
            }
            F.emit('windup', { kind: 'spit', n });
            nextSpit = at + F.gap([0, 9000, 8000, 7000][F.phase]);
          }
        },
        phase() { const at = F.now(); nextWeak = Math.max(nextWeak, at + 2500); nextLunge = Math.max(nextLunge, at + 4500); nextSpit = Math.max(nextSpit, at + 3500); },
        resume() { const at = F.now(); nextWeak = at + 1500; nextLunge = at + 4000; nextSpit = at + 3000; },
        spellAt: () => 'seg:front',
        stackAt: () => 'body',
        returnShots() { for (const x of F.targets.filter(x => x.kind === 'packet')) { F.drop(x.id); F.emit('packet', { returned: true, id: x.id, auto: true }); F.deal(30, { src: 'packet', at: 'head' }); } },
        clearAdds() { this.returnShots(); },
        snap(at) { return { dive: dive > at ? Math.round(dive - at) : 0 }; },
      };
    },
  };

  return { create, PRIO };
})();
