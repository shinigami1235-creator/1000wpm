// Showdown, the turn-based duel (#/duel/showdown/...). The rules are in js/app/showdown-rules.js; this
// is the page and the match. Both bots fight in the duel arena (js/app/duel3d.js): each finished word
// adds a spark to its bot's orb, and you see the other bot's orb fill as they type. When the 20 seconds
// are up (or both are done) the two attacks play, the round's result shows and the next words appear.
// The opponent is a simulated player near your Showdown MMR, Art's ghost, or a player from the online
// list, typed by a NetBot (js/net/bot.js) at their wpm and accuracy, as in the Clash duel.
//
//   Showdown.start(el, { mode: 'quick' | 'art' | 'watch' | 'vs', opponent })   -> { stop() }
//   Showdown.record()      this device's Showdown record: { rating, games, wins, losses, draws, bestStreak, vsArt, history }
//   Showdown.botFor(player, mine)   the bot a player brings: { id, look }, Art's in his cyan
//   Showdown.kbStyle()     the shot style of the keyboard you have equipped: 'slab' | 'compact' | 'split' | 'arc'
window.Showdown = (() => {
  const KEY = 'wpm-showdown-v1';
  const ART_COL = '#3ee6ff';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const e = s => UI.esc(s);
  const SR = () => window.ShowdownRules;

  // ---------- the record, kept apart from Clash so the two ratings never mix ----------
  const blank = () => ({ rating: null, games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, vsArt: { w: 0, l: 0 }, history: [] });
  function load() { try { return { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (err) { return blank(); } }
  function save(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (err) {} }
  function level() {
    const st = WPM.stats(), recent = WPM.sessions().filter(s => s.wpm && s.acc).slice(-20);
    const acc = recent.length ? recent.reduce((a, s) => a + s.acc, 0) / recent.length / 100 : 0.94;
    return { wpm: st.avgWpm || 45, acc: clamp(acc || 0.94, 0.85, 0.99) };
  }
  // a first Showdown starts from the MMR your typing stands for, as Clash does
  function record() {
    const r = load();
    if (r.rating == null) { const L = level(); r.rating = clamp(NetRating.ofBot(L.wpm, L.acc), 800, 1800); save(r); }
    return r;
  }

  // ---------- who brings which bot ----------
  // a simulated player's bot glows in its side's colour (amber, Art cyan), so the two sides never mix up
  function botFor(p, mine, color = '#f29d30') {
    if (mine && window.BotKit) return BotKit.mine();
    if (p.bot && p.bot.id && p.bot.look) return p.bot;   // a real player's own bot, when the match data carries it
    const b = BotKit.random(p.art ? 'art' : p.lookSeed || p.name || p.id);
    b.look = { ...b.look, color: p.art ? ART_COL : color, ...(p.art ? { name: 'Art' } : {}) };
    return b;
  }
  // the colour a side shows in the arena: your bot's own glow, amber for the other side, Art's cyan
  function sideColor(p, k, bot) {
    if (p.art) return ART_COL;
    if (bot && /^#[0-9a-f]{6}$/i.test(bot.look.color || '') && k === 0) return bot.look.color;
    return k ? '#f29d30' : Theme.hex('accent');
  }
  const KB = ['slab', 'compact', 'split', 'arc'];
  function kbStyle() {
    let st = 'slab';
    try { const p = TT.store.get('wpm-operator', null); if (p && p.kb && KB.includes(p.kb.style)) st = p.kb.style; } catch (err) {}
    // a keyboard sold in the shop counts only once it's bought
    const g = ((window.REWARDS && REWARDS.shop && REWARDS.shop.gear) || []).find(x => x.kb === st);
    if (g && window.WPM && WPM.owns && !WPM.owns(g.id)) st = 'slab';
    return st;
  }
  const kbOf = seed => { let h = 7; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return KB[h % KB.length]; };

  async function opponent(mode, id, salt = '') {
    if (mode === 'art') return { id: 'art', name: 'Art', art: true, bot: true, rating: NetRating.ART, typing: { wpm: 204, acc: 0.985 } };
    if (mode === 'vs' && id) {
      const p = await Net.profiles.get(id);
      const t = p.typing || { wpm: (p.stats && p.stats.avgWpm) || 60, acc: ((p.stats && p.stats.acc) || 95) / 100 };
      return { id: p.id, name: p.name, bot: !!p.bot, art: !!p.art, rating: p.art ? NetRating.ART : (p.duel && p.duel.rating) || NetRating.ofBot(t.wpm, t.acc), typing: t, lookSeed: p.lookSeed };
    }
    // matchmaking by Showdown MMR: a typist within about 100 of yours
    const r = NetCore.rng('sd:' + Date.now() + salt), L = level();
    const target = Math.max(600, record().rating + Math.round((r() - 0.5) * 200));
    const acc = clamp(L.acc + (r() - 0.5) * 0.03, 0.86, 0.99);
    const wpm = clamp(Math.round(NetRating.wpmFor(target, acc)), 20, 230);
    const p = NetSim.simProfile(NetSim.handle(r), { wpm });
    return { id: p.id, name: p.name, bot: true, rating: NetRating.ofBot(wpm, acc), typing: { wpm, acc }, lookSeed: p.lookSeed };
  }

  // ---------- the match ----------
  function start(el, o = {}) {
    const C = SR().CONFIG, N = C.words;
    let alive = true, scene = null, snd = null, keys = null, onDoc = null, raf = 0, paused = false;
    const timers = new Set();
    const later = (ms, f) => { const id = setTimeout(() => { timers.delete(id); if (alive) f(); }, ms); timers.add(id); return id; };
    const ctl = { stop };
    el.innerHTML = `<div class="du-wait panel"><div class="loading-state">${o.mode === 'art' ? 'Loading Art\'s ghost' : o.mode === 'watch' ? 'Finding two bots' : 'Finding a typist at your level'}</div><a class="btn out" href="#/duel/showdown">Cancel</a></div>`;
    const meP = () => ({ id: 'me', name: (WPM.profile && WPM.profile().name) || 'You', bot: false, rating: record().rating });
    const pick = o.mode === 'watch'
      ? Promise.all([opponent('quick', null, ':a'), opponent('quick', null, ':b')])
      : opponent(o.mode, o.opponent).then(p => [meP(), p]);
    Promise.all([pick, new Promise(r => setTimeout(r, 500))]).then(([P]) => { if (alive) fight(P); })
      .catch(err => { if (alive) el.innerHTML = `<div class="panel du-wait"><p>${e(err.message)}</p><a class="btn out" href="#/duel/showdown">Back to duels</a></div>`; });

    let P = null, me = 0, words = [], seed = '', rng = null, bots = [null, null], m = null;
    function fight(players) {
      P = players; me = o.mode === 'watch' ? -1 : 0;
      seed = 'SD:' + Date.now();
      rng = NetCore.rng(seed);
      const slow = Math.min(...P.map(p => (p.typing ? p.typing.wpm : level().wpm)));
      const difficulty = slow > 110 ? [3, 7] : slow > 70 ? [2, 6] : [1, 5];
      words = Array.from({ length: C.rounds + 1 }, (_, r) => (r ? pickWords(`${seed}:${r}`, difficulty) : []));
      bots = P.map((p, i) => (i === me ? null : NetBot.create(p.art ? { ...NetBot.ART, seed: seed + ':b' + i } : { wpm: p.typing.wpm, acc: p.typing.acc, seed: seed + ':b' + i, pause: 0.03 })));
      const blankSide = () => ({ idx: 0, typed: '', good: 0, bad: 0, words: 0, wrong: 0, doneAt: null, lastAt: 0, clean: true });
      m = { phase: 'load', round: 0, hp: [C.hp, C.hp], wins: [0, 0], at: 0, clock: 0, sides: [blankSide(), blankSide()], blankSide, rounds: [],
        tot: [0, 1].map(() => ({ good: 0, bad: 0, words: 0, dmg: 0, taken: 0, crits: 0, dodges: 0, fin: 0, ms: 0 })), ended: false };
      const bot = P.map((p, i) => botFor(p, i === me, p.art ? ART_COL : i ? '#f29d30' : Theme.hex('accent')));
      const cols = P.map((p, i) => sideColor(p, i, bot[i]));
      const side = (k, cls) => `<div class="du-side ${cls}">
          <div class="du-id"><span class="du-botname" style="--c:${cols[k]}">${e(BotKit.BOTS[bot[k].id].name)}</span><span class="mu-who">${MultiUI.name(P[k])}</span><span class="num dim">${P[k].rating} MMR</span></div>
          <div class="du-hp" data-hp="${k}"><i></i><b class="num">${C.hp}</b></div>
          <div class="du-pips" data-pips="${k}" aria-label="Rounds won">${'<i></i>'.repeat(C.winRounds)}</div>
        </div>`;
      el.innerHTML = `
        <div class="du sd" data-mode="showdown">
          <header class="du-top">${side(0, 'l')}
            <div class="du-mid"><span class="label" data-round>Showdown</span><b class="num" data-clock>0:20</b></div>
            ${side(1, 'r')}</header>
          <section class="du-stage" data-stage aria-label="Arena">
            <div class="du-nums" data-nums aria-hidden="true"></div>
            ${[0, 1].map(k => `<div class="du-acc sd-prog ${k ? 'r' : 'l'}" data-prog="${k}">${MultiUI.ring(0, { color: cols[k], label: 'Words' })}<span>of ${N} words</span><em class="num" data-wa="${k}">100%</em></div>`).join('')}
            <div class="du-banner" data-banner aria-live="polite"></div>
            <div class="du-load" data-load role="status"><p class="label">Loading the arena</p>
              <ul>${[0, 1].map(k => `<li><span>${MultiUI.name(P[k])}</span><em>${e(BotKit.BOTS[bot[k].id].name)}</em></li>`).join('')}</ul></div>
          </section>
          <section class="du-type" aria-label="${me >= 0 ? 'Your words' : 'Words'}">
            <div class="typebox du-words sd-words" data-box tabindex="-1">
              <div class="sd-line" data-line></div>
              ${me >= 0 ? '<div class="focus-note"><span class="fn-key">Click here or press any key to type</span><span class="fn-tap">Tap here to type</span></div>' : ''}
            </div>
          </section>
          <div class="du-strip">
            <span><b class="num" data-s="words">0</b> words</span><span><b class="num" data-s="acc">100%</b> accuracy</span>
            <span><b class="num" data-s="dmg">0</b> damage</span><span><b class="num" data-s="hp">${C.hp}</b> HP left</span>
            <button class="btn out sm" type="button" data-leave>${me >= 0 ? 'Leave duel' : 'Stop watching'}</button>
          </div>
          <p class="du-note">${P.some(p => p.art) ? 'Art is a ghost on his race pace until his live matches are on the server.' : 'Bots are simulated players until the server is live.'}</p>
          <div class="du-end" data-end hidden></div>
        </div>`;
      UI.play('duel', true);
      hpTo(0, C.hp, true); hpTo(1, C.hp, true);
      snd = window.ArenaAudio ? ArenaAudio.create() : null;
      const stage = el.querySelector('[data-stage]');
      scene = DuelScene.mount(stage, { me, audio: snd, sides: [0, 1].map(k => ({ color: cols[k], bot: bot[k], kb: k === me ? kbStyle() : kbOf(P[k].id), name: P[k].name })) });
      window._sd = { scene: () => scene, m: () => m, words: () => words[m.round] || [], key: k => key(k), skip: () => { if (m.phase === 'type') m.at = m.clock - C.roundMs; }, ctl };   // tests
      const chars = [...new Set(words.flat().join(''))].join('');
      Promise.race([scene.warm(chars), new Promise(r => setTimeout(r, 12000))]).then(() => { if (alive) countIn(1); });
      el.querySelector('[data-leave]').addEventListener('click', () => { if (me < 0) { location.hash = '#/duel/showdown'; return; } GameGuard.confirm(); });
      if (me >= 0) {
        const box = el.querySelector('[data-box]');
        keys = TT.captureKeys(box, { label: 'Type the words to charge your bot', onChar: ch => key(ch), onBack: whole => key(whole ? 'CtrlBackspace' : 'Backspace'), onKey: k => { if (k === 'Escape') keys.el.blur(); } });
        onDoc = ev => {
          if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.length !== 1) return;
          const a = document.activeElement;
          if (a && a !== document.body && a.id !== 'view' && a !== keys.el) return;
          if (a === keys.el) return;
          ev.preventDefault(); keys.focus(); key(ev.key);
        };
        document.addEventListener('keydown', onDoc);
        setTimeout(() => keys && keys.focus(), 60);
        GameGuard.start({
          name: 'duel',
          live: () => alive && !m.ended && m.phase !== 'load',
          pause: on => { paused = on; },
          end: leaving => { forfeit(); return leaving ? summary(1 - me, true) : null; },
          after: () => {},
        });
      }
      paintWords();
      let last = performance.now();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const now = performance.now(), dt = Math.min(100, now - last); last = now;
        if (!paused) { m.clock += dt; step(); }
        paint();
      };
      raf = requestAnimationFrame(tick);
    }

    function pickWords(s, difficulty) {
      let list = [];
      if (window.WordBank) list = WordBank.pick({ count: N, difficulty, theme: 'common', seed: s, minLen: 2, maxLen: 8 }).map(w => (typeof w === 'string' ? w : w.text || w.word || String(w)));
      if (list.length < N) { const r = NetCore.rng(s); while (list.length < N) list.push(NetCore.pick(r, ['type', 'fast', 'word', 'key', 'storm', 'spark', 'orb', 'bolt'])); }
      return list.slice(0, N);
    }

    // ---------- phases: count, type, clash, result ----------
    function countIn(round) {
      m.round = round; m.phase = 'count'; m.at = m.clock;
      m.sides = [m.blankSide(), m.blankSide()];
      bots.forEach(b => { if (b) b.reset(); });
      el.querySelector('[data-load]')?.remove();
      if (round === 1) scene.phase('count', 1); else { scene.revive(); scene.clear(); }
      banner(`Round ${round}`, 'round', 1400);
      paintWords();
    }
    const countMs = () => (m.round === 1 ? 3000 : 2200);
    let countWas = 0;
    function step() {
      const t = m.clock - m.at;
      if (m.phase === 'count') {
        const n = Math.ceil((countMs() - t) / 1000);
        if (n !== countWas && n > 0 && n <= 3) { if (snd) snd.play('tick'); if (m.round > 1 || n < 3) banner(String(n), 'count', 900); }
        countWas = n;
        if (t >= countMs()) {
          m.phase = 'type'; m.at = m.clock; countWas = 0;
          scene.phase('fight', m.round);
          banner('Type', 'tier', 700);
          if (snd) snd.crowd(true, 1);
        }
      } else if (m.phase === 'type') {
        bots.forEach((b, i) => {
          if (!b) return;
          const s = m.sides[i];
          for (let g = 0; g < 8; g++) { const ks = b.step(m.clock, { phase: 'fight', stream: words[m.round][s.idx] || '', typed: s.typed }); if (!ks.length) break; ks.forEach(k => sideKey(i, k.k)); }
        });
        [0, 1].forEach(i => { const s = m.sides[i]; scene.wpm(i, t > 800 ? Math.round(s.good / 5 / (t / 60000)) : 0); });
        if (t >= C.roundMs || m.sides.every(s => s.idx >= N)) clash();
      }
    }

    function key(k) {
      if (!m || me < 0 || m.phase !== 'type' || paused) return;
      const r = sideKey(me, k);
      if (r === 'good' || r === 'word') TT.click(false);
      paintWords();
    }
    // one key from either side; returns 'good' | 'bad' | 'word' | 'miss' | null
    function sideKey(i, k) {
      if (m.phase !== 'type') return null;
      const s = m.sides[i], w = words[m.round][s.idx], t = m.clock - m.at;
      if (w == null) return null;
      if (k === 'Backspace') { s.typed = s.typed.slice(0, -1); return null; }
      if (k === 'CtrlBackspace') { s.typed = ''; return null; }
      if (k === ' ') return s.typed ? submit(i, t) : null;
      s.typed += k;
      const good = s.typed.length <= w.length && k === w[s.typed.length - 1];
      if (good) s.good++;
      else { s.bad++; s.clean = false; scene.react(i, 'typo'); }
      if (s.typed === w && s.idx === N - 1) return submit(i, t);   // the last word needs no space
      return good ? 'good' : 'bad';
    }
    function submit(i, t) {
      const s = m.sides[i], w = words[m.round][s.idx];
      const ok = s.typed === w;
      s.idx++; s.typed = '';
      if (ok) { s.words++; s.lastAt = t; scene.hold(i, s.words / N); }
      else { (s.miss ||= []).push(s.idx - 1); s.wrong++; s.clean = false; scene.react(i, 'miss'); num(i, 'Miss', 'miss'); }
      if (s.idx >= N) { s.doneAt = t; num(i, `Done, ${(t / 1000).toFixed(1)} s`, 'buff'); if (snd) snd.combat('tierUp', 2); }
      if (i === me) paintWords();
      return ok ? 'word' : 'miss';
    }
    const accOf = s => (s.good + s.bad ? s.good / (s.good + s.bad) : 0);

    // time is up, or both are done: the two attacks, the first finisher first
    function clash() {
      m.phase = 'clash'; m.at = m.clock;
      if (snd) snd.play('bell');
      banner('Time', 'round', 800);
      const sides = m.sides.map((s, i) => ({ words: s.words, acc: accOf(s), clean: s.clean && s.words > 0, doneAt: s.doneAt, lastAt: s.lastAt, hp: m.hp[i] }));
      const res = SR().resolve(sides, rng);
      const row = { round: m.round, sides: m.sides.map((s, i) => ({ words: s.words, acc: Math.round(accOf(s) * 100), dmg: res.dealt[i], doneAt: s.doneAt })), winner: res.winner };
      m.rounds.push(row);
      m.sides.forEach((s, i) => { const T = m.tot[i]; T.good += s.good; T.bad += s.bad; T.words += s.words; T.ms += s.doneAt != null ? s.doneAt : C.roundMs; });
      let at = 700;
      if (!res.attacks.length) later(at, () => num(0, 'No attack', 'miss'));
      res.attacks.forEach((a, n) => {
        later(at, () => {
          const name = SR().TIERS[a.tier];
          num(a.from, n === 0 && res.attacks.length > 1 ? `${name}, first` : name, a.tier >= 4 ? 'tier' : 'buff');
          scene.strike(a.from, a.words, { crit: a.crit, dodge: a.dodged, onLand: () => land(a) });
        });
        at += a.tier >= 4 ? 2300 : a.tier >= 3 ? 1300 : 1100;
      });
      const after = at + (res.ko >= 0 ? 200 : 0);
      later(after, () => {
        if (res.ko >= 0) scene.ko(res.ko);
        if (res.winner >= 0) m.wins[res.winner]++;
        paintPips();
        m.phase = 'result'; m.at = m.clock;
        const t = res.ko >= 0 ? 'K.O.' : res.winner < 0 ? 'Drawn round' : res.winner === me ? 'You take the round' : me < 0 ? `${P[res.winner].name} takes the round` : `${P[res.winner].name} takes the round`;
        banner(t, res.winner < 0 ? 'round' : res.winner === me || (me < 0 && res.winner === 0) ? 'won' : 'lost', 2000);
        const ov = SR().over({ hp: m.hp, wins: m.wins, round: m.round });
        if (ov.done) later(res.ko >= 0 ? 2400 : 1400, () => finish(ov.winner));
        else later(1900, () => { scene.phase('break', m.round + 1); countIn(m.round + 1); });
      });
    }
    function land(a) {
      const T = m.tot[a.from];
      if (a.dodged) { num(a.to, 'Dodged', 'block'); m.tot[a.to].dodges++; return; }
      m.hp[a.to] = Math.max(0, m.hp[a.to] - a.dmg);
      T.dmg += a.dmg; m.tot[a.to].taken += a.dmg; if (a.crit) T.crits++; if (a.tier >= 4) T.fin++;
      num(a.to, (a.crit ? 'Crit ' : '') + a.dmg, `${a.to === me ? 'in' : 'out'}${a.crit ? ' crit' : ''}`);
      hpTo(a.to, m.hp[a.to]);
    }

    // ---------- the end ----------
    function finish(winner, forfeitBy = -1) {
      if (m.ended) return;
      m.ended = true; m.phase = 'over';
      UI.play('duel', false);
      GameGuard.stop();
      if (forfeitBy < 0) scene.result(winner);
      let rt = null, reward = null;
      if (me >= 0) {
        const opp = P[1 - me], r = load();
        if (r.rating == null) r.rating = record().rating;
        const score = winner < 0 ? 0.5 : winner === me ? 1 : 0, before = r.rating;
        const u = NetRating.update(before, opp.art ? NetRating.ART : opp.rating, score, r.games);
        r.rating = u.rating; r.games++;
        if (score === 1) { r.wins++; r.streak = Math.max(0, r.streak) + 1; r.bestStreak = Math.max(r.bestStreak, r.streak); } else if (score === 0) { r.losses++; r.streak = 0; } else r.draws++;
        if (opp.art) { if (score === 1) r.vsArt.w++; else if (score === 0) r.vsArt.l++; }
        const T = m.tot[me], acc = T.good + T.bad ? Math.round(T.good / (T.good + T.bad) * 1000) / 10 : 0, wpm = T.ms ? Math.round(T.good / 5 / (T.ms / 60000)) : 0;
        r.history.push({ at: new Date().toISOString(), mode: 'showdown', opp: { id: opp.id, name: opp.name, bot: !!opp.bot, art: !!opp.art, rating: opp.rating }, score, wins: m.wins.slice(), delta: r.rating - before, rating: r.rating, wpm, acc, forfeit: forfeitBy >= 0 });
        if (r.history.length > 60) r.history.shift();
        save(r);
        rt = { after: r.rating, delta: r.rating - before };
        if (T.good) {
          const accF = Math.max(0, (acc - 50) / 50);
          reward = WPM.record({ mode: opp.art ? 'showdown-art' : 'showdown', wpm, acc, correct: T.good, keys: T.good + T.bad, ms: Math.round(T.ms), won: winner === me,
            coins: Math.round(T.good / 10 * accF) + (winner === me ? 40 : 10) });
        }
        WPM.track('pvp_match', { mode: 'showdown', won: winner === me, opp: opp.id, art: !!opp.art, wpm, acc, rating: r.rating });
        if (winner === me) WPM.track('pvp_win', { mode: 'showdown', opp: opp.id, art: !!opp.art });
      }
      m.result = { winner, rt, reward, forfeitBy };
      if (forfeitBy >= 0) paintEnd(); else later(3400, paintEnd);
    }
    function forfeit() { if (m && !m.ended && me >= 0) { finish(1 - me, me); } }
    function summary(winner, left) {
      const T = m.tot[me];
      return { label: 'SHOWDOWN', title: left ? 'You left the duel' : winner === me ? 'You won' : 'You lost', sub: `Counts as a loss against ${P[1 - me].name}.`,
        stats: [['Rounds', m.rounds.length], ['Words', T.words], ['Damage', T.dmg]], coins: m.result && m.result.reward ? m.result.reward.coins : 0, xp: m.result && m.result.reward ? m.result.reward.xp : 0 };
    }
    function paintEnd() {
      if (!alive) return;
      if (snd) snd.crowd(false);
      const box = el.querySelector('[data-end]');
      if (!box) return;
      const { winner, rt, reward, forfeitBy } = m.result;
      const won = me >= 0 && winner === me, lost = me >= 0 && winner === 1 - me;
      const title = forfeitBy >= 0 ? 'You left the duel' : me < 0 ? (winner >= 0 ? `${P[winner].name} wins ${m.wins[winner]}-${m.wins[1 - winner]}` : 'Draw')
        : won ? `You won ${m.wins[me]}-${m.wins[1 - me]}` : lost ? `${P[1 - me].name} won ${m.wins[1 - me]}-${m.wins[me]}` : 'Draw';
      const T = m.tot, accT = k => (T[k].good + T[k].bad ? Math.round(T[k].good / (T[k].good + T[k].bad) * 100) : 0);
      const row = (label, f) => `<tr><th scope="row">${label}</th>${[0, 1].map(k => `<td class="num">${f(k)}</td>`).join('')}</tr>`;
      const share = me >= 0 ? `${won ? 'I won' : 'I played'} a Showdown on Stormtyper against ${P[1 - me].art ? 'Art' : P[1 - me].name}, ${m.wins[me]}-${m.wins[1 - me]}, ${T[me].words} words at ${accT(me)}%.` : '';
      box.hidden = false;
      box.innerHTML = `<div class="panel hot du-end-card" role="dialog" aria-labelledby="sd-end-t">
        <h2 id="sd-end-t" class="${won ? 'green' : lost ? 'red' : ''}">${e(title)}</h2>
        ${rt ? `<p class="du-end-rt"><span class="label">Showdown MMR</span><b class="num">${rt.after}</b><em class="${rt.delta >= 0 ? 'green' : 'red'}">${rt.delta >= 0 ? '+' : ''}${rt.delta}</em></p>` : ''}
        ${reward ? `<p class="dim">You earned ${reward.coins} coins and ${reward.xp} XP.</p>` : ''}
        <div class="du-tw"><table class="du-sum"><thead><tr><th></th>${[0, 1].map(k => `<th scope="col">${MultiUI.name(P[k])}</th>`).join('')}</tr></thead><tbody>
          ${row('Words', k => T[k].words)}${row('Accuracy', k => accT(k) + '%')}${row('Damage', k => T[k].dmg)}${row('HP left', k => m.hp[k])}
          ${row('Crits', k => T[k].crits)}${row('Finishers', k => T[k].fin)}${row('Dodges', k => T[k].dodges)}
        </tbody></table></div>
        ${m.rounds.length ? `<div class="du-tw"><table class="du-rounds"><thead><tr><th scope="col">Round</th><th scope="col">Winner</th>${[0, 1].map(k => `<th scope="col" class="r">${e(P[k].name)}</th>`).join('')}</tr></thead>
          <tbody>${m.rounds.map(x => `<tr><td class="num">${x.round}</td><td>${x.winner >= 0 ? e(x.winner === me ? 'You' : P[x.winner].name) : 'Draw'}</td>${[0, 1].map(k => `<td class="num r">${x.sides[k].words} words, ${x.sides[k].acc}%, ${x.sides[k].dmg} dmg</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
        ${share ? GameGuard.shareHtml(share) : ''}
        <div class="row">
          ${me >= 0 ? `<a class="btn" href="#/duel/showdown/${o.mode === 'art' ? 'art' : o.mode === 'vs' ? 'vs/' + encodeURIComponent(P[1].id) : 'quick'}" data-again>${o.mode === 'art' ? 'Challenge Art again' : o.mode === 'vs' ? 'Rematch' : 'Next match'}</a>` : '<a class="btn" href="#/duel/showdown/watch" data-again>Watch another</a>'}
          <a class="btn out" href="#/duel/showdown">Back to duels</a>
        </div></div>`;
      if (share) GameGuard.wire(box, share);
      const again = box.querySelector('[data-again]');
      if (again) again.addEventListener('click', ev => { if (location.hash === again.getAttribute('href') && o.again) { ev.preventDefault(); o.again(); } });
      const h = box.querySelector('h2'); h.tabIndex = -1; h.focus({ preventScroll: true });
    }

    // ---------- drawing ----------
    function screenOf(k) { const p = scene && scene.screen(k, {}); return p || { x: k ? el.clientWidth * 0.7 : el.clientWidth * 0.3, y: 120 }; }
    function num(k, text, cls) { const p = screenOf(k); MultiUI.pop(el.querySelector('[data-nums]'), p.x, p.y, text, cls); }
    let bannerT = 0;
    function banner(text, cls, ms) {
      const b = el.querySelector('[data-banner]');
      if (!b) return;
      b.className = 'du-banner on ' + cls; b.textContent = text;
      clearTimeout(bannerT); bannerT = setTimeout(() => { if (b.isConnected) b.className = 'du-banner'; }, ms);
    }
    function hpTo(k, hp, first) {
      const bar = el.querySelector(`[data-hp="${k}"]`);
      if (!bar) return;
      const f = clamp(hp / C.hp, 0, 1);
      bar.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
      bar.querySelector('b').textContent = Math.round(hp);
      bar.classList.toggle('low', f < 0.3);
      if (!first) scene.setHp(k, f);
    }
    function paintPips() { [0, 1].forEach(k => el.querySelectorAll(`[data-pips="${k}"] i`).forEach((p, n) => p.classList.toggle('on', n < m.wins[k]))); }
    let lastPaint = 0;
    function paint() {
      const now = performance.now();
      if (now - lastPaint < 60 || !m) return;
      lastPaint = now;
      const t = m.clock - m.at;
      const left = m.phase === 'type' ? C.roundMs - t : m.phase === 'count' ? C.roundMs : 0;
      el.querySelector('[data-clock]').textContent = UI.clock ? UI.clock(Math.max(0, Math.ceil(left / 1000))) : String(Math.ceil(left / 1000));
      el.querySelector('[data-clock]').classList.toggle('red', m.phase === 'type' && left < 5000);
      el.querySelector('[data-round]').textContent = m.phase === 'load' ? 'Loading' : m.phase === 'count' ? `Round ${m.round}, get ready` : `Round ${m.round} of ${C.rounds}`;
      m.sides.forEach((s, k) => {
        const a = el.querySelector(`[data-prog="${k}"]`);
        const svg = a.querySelector('svg');
        MultiUI.setRing(svg, s.words / N * 100);
        svg.querySelector('.mu-ring-t').textContent = s.words; svg.setAttribute('aria-label', `${s.words} of ${N} words`);
        a.querySelector(`[data-wa="${k}"]`).textContent = s.good + s.bad ? Math.round(accOf(s) * 100) + '%' : '';
        a.classList.toggle('done', s.idx >= N);
      });
      const k = me >= 0 ? me : 0, s = m.sides[k];
      el.querySelector('[data-s="words"]').textContent = m.tot[k].words + (m.phase === 'type' ? s.words : 0);
      el.querySelector('[data-s="acc"]').textContent = (s.good + s.bad ? Math.round(accOf(s) * 100) : 100) + '%';
      el.querySelector('[data-s="dmg"]').textContent = m.tot[k].dmg;
      el.querySelector('[data-s="hp"]').textContent = m.hp[k];
      if (me < 0) paintWords();
    }
    function letters(w, typed) {
      let out = '';
      for (let i = 0; i < Math.max(w.length, typed.length); i++) {
        const c = w[i], t = typed[i];
        if (t == null) out += `<i class="${i === typed.length ? 'at' : ''}">${e(c)}</i>`;
        else if (t === c) out += `<i class="ok">${e(c)}</i>`;
        else out += `<i class="bad">${e(c || t)}</i>`;
      }
      return out;
    }
    let lineHtml = '';
    function paintWords() {
      const line = el.querySelector('[data-line]');
      if (!line || !m) return;
      const k = me >= 0 ? me : 0, s = m.sides[k], list = words[m.round] || [];
      const live = m.phase === 'type';
      const html = list.map((w, n) => {
        if (n < s.idx) return `<span class="sd-w done${s.miss && s.miss.includes(n) ? ' wrong' : ''}">${e(w)}</span>`;
        if (n === s.idx && live) return `<span class="sd-w cur">${letters(w, s.typed)}</span>`;
        return `<span class="sd-w${live ? '' : ' wait'}">${e(w)}</span>`;
      }).join('');
      if (html !== lineHtml) { lineHtml = html; line.innerHTML = html; }
      line.classList.toggle('locked', !live);
    }

    function stop() {
      if (!alive) return;
      if (m && !m.ended && me >= 0 && m.phase !== 'load') forfeit();
      alive = false;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout); timers.clear(); clearTimeout(bannerT);
      GameGuard.stop();
      UI.play('duel', false);
      if (scene) { scene.dispose(); scene = null; }
      if (snd) { snd.dispose(); snd = null; }
      if (onDoc) { document.removeEventListener('keydown', onDoc); onDoc = null; }
      keys = null;
    }
    return ctl;
  }

  return { start, record, botFor, sideColor, kbStyle, kbOf };
})();
