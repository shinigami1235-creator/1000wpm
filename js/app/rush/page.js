// #/play/rush: Boss Rush. The entry screen with the scoreboard, the fights one after
// another with a breather between them and the end screen. Mounted by js/app/play.js.
//   RushPage.mount(host, pageEl) -> { destroy() }
// The fight rules are in fight.js, the internal monitor in director.js, the 3D in
// scene.js, the music in audio.js and the scoreboard in board.js. RUSH.md has the rules.
// The layout reuses the World Boss page's calm styles (.page-boss in css/site.css) and
// css/rush.css adds what the rush needs on top.
window.RushPage = (() => {
  if (window.WPM && WPM.events) WPM.events.register('rush_boss', 'rush_run');
  const D = () => window.RushData;
  const MOVE = {
    gifts: { name: 'Free gifts', how: 'Type each gift before it reaches you.', text: 'Throws three gifts. Type them all to stun it.' },
    fixsign: { name: 'Fix the sign', how: 'Type the sign spelled right.', text: 'Puts up a misspelled sign. Type it spelled right to stun it.' },
    speakers: { name: 'Mute the speakers', how: 'Type them in order, one to six.', text: 'Turns on six speakers. Mute them in order to stun it.' },
    press: { name: 'Double press', how: 'Block both wind-ups.', text: 'Winds up twice in a row. Three blocks in a row overheat it.' },
    spell: { name: 'Which one is spelled right?', how: 'Type the right spelling.', text: 'Asks which word is spelled right. The right one stuns it.' },
    volley: { name: 'Packets', how: 'Type each packet to send it back.', text: 'Fires packets. Type them to send them back for triple damage.' },
  };
  const LABEL = { block: 'Block', gift: 'Gift', fix: 'Spell it right', speaker: 'Mute', answer: 'Spelled right?', packet: 'Send back', boost: 'Boost from Art', weak: 'Weak point' };
  const CLS = { block: 'block', gift: 'add', speaker: 'add', packet: 'return', fix: 'fix', answer: 'fix', boost: 'boost', weak: 'weak' };
  const ORDER = { block: 0, answer: 1, fix: 1, speaker: 2, packet: 3, gift: 4, boost: 5, spell: 6, weak: 7, sign: 2, page: 2, byte: 2, decoy: 9, popup: 3, mute: 3 };
  // the signature move's words live in the arena, on the thing they belong to, not in the chip row
  const ARENA = new Set(['popup', 'sign', 'mute', 'page', 'byte', 'decoy']);
  const TAG_LABEL = { sign: 'Sign', page: 'Page', byte: 'Packet', decoy: 'Fake', mute: 'Speaker' };
  // the titans' throws are named for what they are: rubble, data blocks, pistons; the King's pop-ups are decrees
  const TITAN_TAG = { siege: { sign: 'Rubble' }, colossus: { byte: 'Data block' }, brute: { page: 'Piston' } };
  // where the King's decrees land, as [left %, top %] of the arena: right, left, right, left, right
  const KING_SLOTS = [[76, 7], [3, 25], [76, 36], [3, 52], [76, 63]];
  const DECREES = ['ROYAL DECREE', 'BY ORDER', 'EDICT', 'PROCLAMATION', 'THE KING SAYS', 'BY DECREE'];
  const TIPS = {
    start: 'Type the highlighted word and press Space to hit the boss.',
    block: 'Type the red lit words before their timer runs out to block.',
    weak: 'The amber lit word is the weak point: 5% of the boss\'s HP.',
    combo: 'Words with no typo raise your combo and make your shots bigger. A typo drops it one tier.',
    spell: 'Type a spell\'s lit words with no typo to cast it.',
    stun: 'Your words deal double damage while the boss is stunned.',
  };
  if (window.RushData) for (const [id, sg] of Object.entries(RushData.SIG)) TIPS['sig-' + id] = sg.text;
  const fmt = n => UI.fmt(Math.round(n)), esc = UI.esc;
  const now = () => performance.now();
  const secs = ms => (ms / 1000).toFixed(1) + ' s';

  function mount(host, pageEl) {
    TT.useWeaponSound();
    let view = '', scene = null, keys = null, me = null, f = null, dir = null, run = null, plan = null;
    let typed = '', target = null, clean = true, wordT0 = 0, hist = [], over = null;
    let timers = [], offs = [], later = [], hiddenAt = 0, pausedAt = 0, comboShown = false, popT = 0, tintT = 0, chipKey = '';
    let tipQ = [], tipUntil = 0, seen = new Set(), lastBlocks = 0, tagRaf = 0, tagKey = '';
    const tags = new Map();   // signature id -> its word tag or pop-up window
    const ghostAt = new Map();
    let flow = null;
    // the one line (js/app/combat/inline.js): every special goes into your own words past the middle line
    let line = null, earned = [], liveCps = 0, lastWordAt = 0;
    try { seen = new Set(JSON.parse(localStorage.getItem('wpm-rush-tips') || '[]')); } catch (e) {}
    const q = k => host.querySelector(`[data-k="${k}"]`);
    const A = window.RushAudio;
    const cSfx = (n, a) => { const c = A.combat(); if (c) c.play(n, a); };
    const wait = (ms, fn) => { const id = setTimeout(() => { later = later.filter(x => x !== id); fn(); }, ms); later.push(id); return id; };

    // ---------- entry screen ----------
    function menu() {
      teardownFight();
      view = 'menu';
      pageEl.classList.remove('rush-live');
      const b = RushBoard.load();
      const best = b.best.bosses !== undefined ? `Best run: ${b.best.bosses} ${b.best.bosses === 1 ? 'boss' : 'bosses'} beaten. Best score: ${fmt(b.best.score)}.` : '';
      host.innerHTML = `
        <div class="rush page-boss" data-view="menu">
          <section class="rush-menu">
            <div class="rush-lead">
              <h1>Boss rush</h1>
              <p>Every boss Art has beaten, one after another, each harder than the last. You get one retry per run. The run ends when a boss beats you.</p>
              <div class="rush-go"><button class="btn" type="button" data-k="start">Start run</button><span>or press Enter</span></div>
              ${best ? `<p class="rush-best">${best}</p>` : ''}
            </div>
            <ol class="rush-roster" aria-label="Bosses">
              ${D().ROSTER.map((x, i) => `<li style="--c:${x.color};--c2:${x.color2}"><span class="rr-n">${i + 1}</span><b>${esc(x.name)}</b><span>${esc(D().SIG[x.id].name)}</span></li>`).join('')}
              <li class="rr-more"><span class="rr-n">7</span><b>Mark II</b><span>The six again with more HP and a firewall</span></li>
            </ol>
          </section>
          <section class="rush-board" aria-label="Scoreboard">
            <div class="rush-bhead"><h2>Scoreboard</h2><span>This device only until the server is live</span><a class="green" href="#/leaderboard" data-lb>Open the leaderboard</a></div>
            ${b.runs.length ? RushBoard.bests(b.best) + RushBoard.table(b.runs, 5) : '<p class="empty">No runs yet.</p>'}
          </section>
        </div>`;
      q('start').addEventListener('click', startRun);
      host.querySelectorAll('[data-lb]').forEach(a => a.addEventListener('click', () => TT.store.set('wpm-lb-tab', 'rush')));
    }

    // ---------- the fight view ----------
    function fightView() {
      view = 'fight';
      pageEl.classList.add('rush-live');
      host.innerHTML = `
        <div class="rush page-boss" data-view="fight">
          <div class="wb rush-fight">
            <section class="boss-hpbox" aria-label="Boss HP">
              <div class="wb-hp-row">
                <h1 class="wb-name" data-k="name"></h1>
                <span class="boss-state" data-k="state"></span>
                <span class="wb-phase" data-k="num"></span>
                <span class="wb-hpnum"><b data-k="hp">0</b><span class="wb-left"><span data-k="left">100%</span> left</span></span>
              </div>
              <div class="boss-bar" role="meter" aria-label="Boss HP" aria-valuemin="0" data-k="meter"><i data-k="fill"></i><em class="wb-shieldbar" data-k="sbar" hidden></em><b class="rush-pmark" style="left:${D().STAGES[1] * 100}%"></b><b class="rush-pmark" style="left:${D().STAGES[0] * 100}%"></b></div>
              <div class="rush-you"><span>You</span><div class="rush-ibar" role="meter" aria-label="Your integrity" aria-valuemin="0" aria-valuemax="100" data-k="imeter"><i data-k="ifill"></i></div><b data-k="ihp">100</b></div>
            </section>
            <section class="boss-stage" data-k="stage" aria-label="The boss">
              <div class="kb-loading" data-k="loading">Loading</div>
              <div class="wb-tint" data-k="tint" aria-hidden="true"></div>
              <div class="rush-tags" data-k="tags" aria-hidden="true"></div>
              <div class="rush-pops" data-k="pops" aria-hidden="true"></div>
              <div class="rush-vol" data-k="vol" hidden><span>Volume</span><i><i data-k="volfill"></i></i></div>
              <div class="dmg-layer" data-k="nums" aria-hidden="true"></div>
              <div class="wb-status"><span class="wb-me" data-k="flags"></span></div>
              <div class="wb-combo" data-k="cbox" data-t="0" hidden aria-live="off">
                <b data-k="cnum">0</b>
                <span class="wb-combo-l"><span>Combo</span><em data-k="ctier">Bolt</em></span>
                <i class="wb-cbar"><i data-k="cbar"></i><small data-k="cnext"></small></i>
              </div>
              <p class="wb-tip" data-k="tip" aria-live="polite"></p>
              <div class="wb-pop" data-k="pop" aria-hidden="true"></div>
              <div class="wb-banner" data-k="banner" hidden></div>
              <div class="rush-over" data-k="over" hidden></div>
            </section>
            <section class="boss-type" aria-label="Your words">
              <div class="wb-mech"><div class="wb-chips" data-k="chips"></div></div>
              <div class="typebox boss-words" data-k="box" tabindex="-1">
                <div class="boss-queue" data-k="queue"></div>
                <div class="focus-note"><span class="fn-key">Click here or press any key to type</span><span class="fn-tap">Tap here to type</span></div>
              </div>
            </section>
            <div class="wb-strip">
              <span class="wb-stat mine"><b data-k="s-score">0</b> score</span>
              <span class="wb-stat"><b data-k="s-beaten">0</b> beaten</span>
              <span class="wb-stat"><b data-k="s-wpm">0</b> wpm</span>
              <span class="wb-stat"><b data-k="s-acc">100%</b> accuracy</span>
              <button class="wb-boardbtn" type="button" data-k="quit">End run</button>
            </div>
          </div>
        </div>`;
      scene = RushScene.mount(q('stage'), { onImpact, sfx: (n, a) => A.titan(n, a) });
      scene.ready.then(ok => { const l = q('loading'); if (ok && l) l.remove(); })
        .catch(() => { const l = q('loading'); if (l) l.textContent = "The bosses can't load without an internet connection."; });
      q('quit').addEventListener('click', () => GameGuard.confirm());
      q('over').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
      keys = TT.captureKeys(q('box'), {
        label: 'Type the words to attack the boss.',
        onChar, onBack,
        onKey(k) {
          if (k === 'Enter') { if (over) act(over.primary); else submit(); }
        },
      });
      if (matchMedia('(pointer: fine)').matches) keys.focus();
    }

    // ---------- the run ----------
    function startRun() {
      A.unlock();
      run = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), n: 1, score: 0, retryUsed: false, fights: [], coins: 0, xp: 0, done: false };
      dir = RushDirector.create({ model: RushBoard.director(), prior: priorWpm(), say: e => { if (debugLog()) console.debug('[rush director]', e); } });
      dir.startRun();
      me = Combat.create({ earn: true, perks: window.Ops ? Ops.perks() : null, targetHp: () => { const S = f && f.state(now()); return S && S.max ? S.hp / S.max : null; } });
      wireCombat();
      comboShown = false;
      fightView();
      nextFight(false);
      // leaving mid-run asks first, Esc pauses, and a run ended by leaving shows its result (js/app/game-guard.js)
      GameGuard.start({
        name: 'run',
        live: () => !!(run && !run.done && view === 'fight' && (run.fights.length || (f && f.summary().keys))),
        pause: on => {
          if (on) { pausedAt = now(); if (scene) scene.pause(true); A.titanStop(); return; }
          if (!pausedAt) return;
          const ms = now() - pausedAt; pausedAt = 0;
          if (f && (f.phase === 'fight' || f.phase === 'intro')) f.shift(ms);
          if (me && me.shift) me.shift(ms);
          if (scene) scene.pause(false);
        },
        end: leaving => { pausedAt = 0; const x = endRun('quit'); return leaving ? runSummary(x) : null; },
      });
    }
    // the first guess at the player's speed: their recent typing on this device
    function priorWpm() { try { const s = WPM.stats(); return s.avgWpm ? Math.max(15, s.avgWpm) : 35; } catch (e) { return 35; } }
    const debugLog = () => { try { return localStorage.getItem('wpm-rush-log') === '1'; } catch (e) { return false; } };

    function nextFight(retry) {
      hideOver();
      typed = ''; target = null; clean = true; hist = [];
      if (flow) flow.clear();
      plan = dir.plan(run.n, { retry });
      if (me) me.closeOffer('next');
      if (!line) line = InlineLine.create({ cps: speed });
      line.clear(); earned = [];
      f = RushFight.create({ plan, me, now, emit: onFight, lead: () => (line ? line.reach(f ? f.stack() : []) : 0) });
      scene.setBoss(plan.slot);
      // a titan's entrance plays out before the count, with only its name card over the arena
      const entrance = scene.entrance ? scene.entrance() : 0;
      f.start(now(), entrance);
      paintHead(); paintYou(); paintStrip();
      A.quiet(false);
      A.music(D().musicFor(plan.boss.id, 1));
      A.preload(D().musicFor(plan.boss.id, 2)); A.preload(D().musicFor(plan.boss.id, 3));
      A.play('roar');
      clearTags();
      const s = plan.slot, sg = D().SIG[plan.boss.id];
      const tw = s.mark > 1 && s.i === 0 ? D().TWISTS.find(x => x.mark === s.mark) : null;
      banner(retry ? `Retry, boss ${s.n}` : `Boss ${s.n}`, s.title, tw ? `Mark ${D().markName(s.mark)}: ${tw.text}` : sg.text, entrance ? entrance + 2200 : 2400, !!entrance);
      // only this boss's signature tip; another boss's still waiting in the queue would be wrong now
      tipQ = tipQ.filter(x => !x.startsWith('sig-'));
      const tn = q('tip'); if (tn && tn.dataset.id && tn.dataset.id.startsWith('sig-')) { tn.textContent = ''; tn.classList.remove('on'); tipUntil = 0; }
      if (s.n === 1 && !retry) tip('start');
      tip('sig-' + plan.boss.id);
      renderQueue(); paintChips(true);
      if (!timers.length) {
        timers.push(setInterval(tick, 50));
        const vis = () => {
          if (document.hidden) hiddenAt = now();
          else if (hiddenAt && !pausedAt && f && (f.phase === 'fight' || f.phase === 'intro')) { f.shift(now() - hiddenAt); hiddenAt = 0; }
        };
        document.addEventListener('visibilitychange', vis);
        offs.push(() => document.removeEventListener('visibilitychange', vis));
        const fwd = e => {
          A.unlock();
          const a = document.activeElement;
          if (a && a !== document.body && a.id !== 'view') return;
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (e.key === 'Enter' && over) { e.preventDefault(); act(over.primary); return; }
          if (e.key.length !== 1 || !keys) return;
          e.preventDefault();
          keys.focus();
          keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
        };
        document.addEventListener('keydown', fwd);
        offs.push(() => document.removeEventListener('keydown', fwd));
        const snd = e => A.setOn(!!(e.detail && e.detail.on));
        addEventListener('wpm-sound', snd);
        offs.push(() => removeEventListener('wpm-sound', snd));
      }
    }

    // ---------- typing: one line ----------
    // what each fight chip looks like in the line (the World Boss's colours, wordflow.js)
    const LOOK = { block: 'block', gift: 'add', speaker: 'add', popup: 'add', packet: 'return', byte: 'return', fix: 'fix', answer: 'fix', sign: 'fix', page: 'fix', mute: 'add', boost: 'boost', weak: 'weak' };
    // your speed in letters a second: the last few words, leaning on your usual speed
    function speed() { const base = priorWpm() * 5 / 60; return 0.9 * Math.max(1.2, liveCps ? 0.8 * liveCps + 0.2 * base : base); }
    const LABEL = { block: 'BLOCK', gift: 'GIFT', speaker: 'MUTE', popup: 'CLOSE', packet: 'SEND BACK', byte: 'PACKET', fix: 'FIX', answer: 'FIX', sign: 'FIX', page: 'PAGE', mute: 'MUTE', boost: 'BOOST', weak: 'WEAK POINT' };
    // the titans' throws keep their own names in the line too
    const TITAN_LABEL = { siege: { sign: 'RUBBLE' }, colossus: { byte: 'DATA BLOCK' }, brute: { page: 'PISTON' }, king: { popup: 'DECREE' } };
    // the specials live now, in the order they light words; decoys stay bait in the arena, and of the
    // spelled-right choices only the right one lights a word
    function specials(t) {
      if (!f || f.phase !== 'fight') return [];
      const list = f.chips(t).filter(c => c.kind !== 'decoy' && !(c.kind === 'answer' && !c.right))
        .sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || ((a.order || 0) - (b.order || 0)) || ((a.due || 0) - (b.due || 0)));
      const tl = TITAN_LABEL[plan.boss.id] || {};
      const out = list.map(c => ({ id: c.id, kind: LOOK[c.kind] || 'add', label: c.label || tl[c.kind] || LABEL[c.kind] || '', due: c.due, total: c.total, chip: c.kind }));
      for (const sp of earned) out.push({ id: sp.key, kind: 'spell', n: sp.word.split(' ').length, label: sp.word.toUpperCase(), color: sp.color, spell: sp });
      return out;
    }
    function syncLine() {
      if (!line || !f) return;
      const before = line.items().length;
      const fresh = line.sync(specials(now()), f.stack());
      if (fresh.length || line.items().length !== before) renderQueue();
    }
    const head = () => (line && f ? line.view(f.stack()).head : null);
    const top = () => (f ? f.stack()[0] || '' : '');
    function onChar(ch) {
      A.unlock();
      if (!f || f.phase !== 'fight' || over) return;
      const w = top();
      if (ch === ' ') { if (typed) submit(); return; }
      if (!typed) { wordT0 = now(); if (line) line.hold(); }
      typed += ch;
      const good = typed.length <= w.length && ch === w[typed.length - 1];
      if (!good) clean = false;
      f.key(good);
      TT.click(false);
      renderQueue();
    }
    function onBack(whole) {
      if (!typed) return;
      typed = whole ? '' : typed.slice(0, -1);
      if (!typed && line) line.release();
      renderQueue();
    }
    function heard(word) {
      const tw = performance.now();
      if (lastWordAt && tw - lastWordAt < 4000) { const c = 1000 * (word.length + 1) / (tw - lastWordAt); liveCps = liveCps ? liveCps * 0.75 + c * 0.25 : c; }
      lastWordAt = tw;
    }
    function submit() {
      if (!typed || !f || f.phase !== 'fight') return;
      const t = now(), h = head(), sent = typed, word = top(), wasClean = clean;
      heard(sent);
      typed = ''; target = null; clean = true;
      if (line) line.release();
      let r = null;
      if (h) {
        // a lit word: every word of the run typed right, the last one fires it
        const it = h.item;
        it.ok = it.ok && sent === word && (it.kind !== 'spell' || wasClean);
        if (h.last) {
          line.done(it.id);
          if (it.kind === 'spell') {
            earned = earned.filter(x => x.key !== it.id);
            r = f.submit(sent, { clean: wasClean, ms: t - wordT0, t });
            castSpell(it.x.spell, it.ok);
          } else if (it.ok) {
            r = f.fire(it.id, sent, { clean: wasClean, ms: t - wordT0, t });
            if (r && r.kind === 'sig' && r.ok) { scene.hit({ amount: r.amount, tier: r.tier, crit: r.crit, kind: 'word' }); if (r.tier >= 1) cSfx('shot' + Math.min(4, r.tier)); }
            else if (r && r.kind === 'weak') { scene.hit({ amount: r.amount, tier: Math.max(1, r.tier), crit: true, kind: 'weak' }); A.play('weak'); }
            if (r && r.kind !== 'word' && r.kind !== 'miss' && r.kind !== 'pen') { line.shift(); if (flow) flow.push(word, sent, true, it.kind); TT.click(true); renderQueue(); paintChips(true); paintStrip(); return; }
          } else r = f.submit(sent, { clean: wasClean, ms: t - wordT0, t });
        } else r = f.submit(sent, { clean: wasClean, ms: t - wordT0, t });
      } else r = f.submit(sent, { clean: wasClean, ms: t - wordT0, t });
      if (r && (r.kind === 'word' || r.kind === 'miss' || r.kind === 'pen')) {
        line.shift();
        if (flow) flow.push(word, sent, r.kind === 'word', h ? h.item.kind : false);
      }
      if (r && r.kind === 'word') {
        scene.hit({ amount: r.amount, tier: r.tier, crit: r.crit, kind: 'word', color: me.status('hyper') ? '#ffb066' : me.status('root') ? '#ffc46b' : null });
        if (r.tier >= 1) cSfx('shot' + Math.min(4, r.tier));
        TT.click(true);
        hist.push({ word, ok: true });
      } else if (r && r.kind === 'miss') hist.push({ word, ok: false });
      else if (r && r.kind === 'pen') hist.push({ word: sent, ok: false });
      if (hist.length > 3) hist.shift();
      renderQueue(); paintChips(true); paintStrip();
    }
    function castSpell(sp, ok) {
      typed = ''; target = null; clean = true;
      const r = me.cast(sp.word, { clean: ok, shield: !!(f && f.state().shield) });
      if (!r) { renderQueue(); paintChips(true); return; }
      if (r.fizzled) { cSfx('fizzle'); pop('FIZZLED', 'red'); renderQueue(); paintChips(true); return; }
      const out = f.cast(r, now());
      WPM.track('spell_cast', { spell: sp.id, mode: 'rush' });
      cSfx(sp.id);
      if (sp.rarity >= 3) { A.duck(0.5, sp.rarity >= 4 ? 3.2 : 2.4); document.dispatchEvent(new CustomEvent('buddy', { detail: 'fast' })); }
      scene.cast(sp.id, { hits: r.hits, effect: r.effect });
      if (r.effect && r.effect.debuff === 'stun') scene.react('stun', r.effect.ms);
      if (r.effect && r.effect.debuff === 'freeze') scene.react('freeze', r.effect.ms);
      if (sp.strike && out) out.hits.forEach(h => wait(h.at, () => cSfx(sp.strike, 20)));
      pop(sp.word, 'spell');
      renderQueue(); paintChips(true); paintStrip();
    }

    // ---------- the fight's events ----------
    function onFight(name, p) {
      if (!f && name !== 'intro') return;
      const S = f ? f.state(now()) : null;
      switch (name) {
        case 'intro': { const go = () => { const st = q('stage'); if (st && f && f.phase === 'intro') TT.countdown(st, null, { step: p.ms / 3 }); }; if (p.delay) wait(p.delay, go); else go(); break; }
        case 'fight': renderQueue(); paintChips(true); if (plan.slot.n > 1) tip('weak'); break;
        case 'windup':
          scene.windup(p.ms, p.atk);
          if (!p.atk) A.play('windup', Math.min(2.5, p.ms / 1000));
          tip('block');
          break;
        case 'move': {
          const m = plan.boss.mv || MOVE[p.move];
          if (p.move !== 'press') { banner('Its own move', m.name, m.how, 1800); scene.windupEnd(); A.titanStop(); }
          A.play('warn');
          const chips = f.chips(now());
          if (p.move === 'gifts') scene.gifts(chips.filter(c => c.kind === 'gift').map(c => c.id), p.due);
          if (p.move === 'speakers') scene.speakers(true);
          if (p.move === 'fixsign') scene.setSign(p.shown);
          break;
        }
        case 'blockWord': A.play('blockOk'); break;
        case 'block': scene.windupEnd(); scene.react('stagger'); pop('BLOCKED', 'cyan'); A.play('stagger'); break;
        case 'slam': scene.slam(); flashTint(); pop('HIT', 'red'); A.play('blockFail'); break;
        case 'stun': scene.stun(p.ms); tip('stun'); break;
        case 'overheat': pop('OVERHEATED', 'amber'); A.play('shieldBreak'); break;
        case 'moveDone': scene.moveEnd(); scene.moveDone(); pop('STUNNED', 'green'); A.play('stagger'); if (plan.boss.move === 'fixsign') scene.setSign('NODLES'); break;
        case 'shield': scene.setShield(1); banner('Half HP', 'Firewall up', 'Your hits go into the firewall until it breaks.', 1800); A.play('shieldUp'); break;
        case 'shieldBreak': scene.setShield(null); pop('FIREWALL DOWN', 'cyan'); A.play('shieldBreak'); break;
        case 'enrage': scene.enrage(true); pop('ENRAGED', 'red'); A.play('roar'); break;
        case 'stage': {
          const sg = D().SIG[plan.boss.id];
          scene.stage(p.n);
          A.music(D().musicFor(plan.boss.id, p.n));
          A.play('roar');
          banner(`Phase ${p.n} of 3`, plan.slot.title, p.n === 3 ? `${sg.name}, twice as many. Faster attacks.` : 'Faster attacks from here.', 1800);
          paintHead();
          break;
        }
        case 'sig':
          scene.sig(p.id, p.kind, p.due);
          addTag(p);
          A.play(p.kind === 'popup' ? 'addSpawn' : p.kind === 'mute' ? 'warn' : 'launch');
          break;
        case 'sigDone': scene.sigDone(p.id); dropTag(p.id, 'done'); A.play('addKill'); break;
        case 'sigHit': scene.sigHit(p.id); dropTag(p.id, 'hit'); break;
        case 'sigGone': scene.sigGone(p.id); dropTag(p.id, 'gone'); break;
        case 'bite': p.ids.forEach(id => dropTag(id, 'hit')); scene.slam(); pop('BITTEN', 'red'); A.play('blockFail'); break;
        case 'shout': scene.slam(); pop('SHOUT', 'red'); A.play('roar'); break;
        case 'pen': scene.lunge(); renderQueue(); A.play('warn'); break;
        case 'penBeat': pop('NICE CATCH', 'green'); break;
        case 'penHit': pop('RED PEN', 'red'); renderQueue(); break;
        case 'decoyHit': dropTag(p.id, 'hit'); scene.sigHit(p.id); pop('FAKE', 'red'); break;
        case 'damage':
          paintHead();
          if (p.kind && p.kind !== 'word' && p.kind !== 'weak' && p.kind !== 'debug') number({ amount: p.amount, big: p.kind === 'spell' || p.kind === 'boost' || p.kind === 'block', kind: p.kind, shield: p.shield });
          if (p.shield && S && S.shield) scene.setShield(S.shield.hp / S.shield.max);
          break;
        case 'hurt':
          paintYou();
          if (p.blocked) { pop(me.status('stunned-target') ? 'MISSED' : 'BLOCKED', 'cyan'); A.play('impact', true); break; }
          if (p.kind !== 'typo') { scene.hurt(); flashTint(); A.play(p.kind === 'packet' ? 'projHit' : 'impact', false); }
          break;
        case 'heal': paintYou(); pop(`+${p.amount} HP`, 'cyan'); break;
        case 'typo': TT.click(true); break;
        case 'packet': scene.packet(p.id, p.due); A.play('launch'); break;
        case 'packetHit': scene.packetHit(p.id); break;
        case 'returned': scene.returnShot(p.id); A.play('returned'); break;
        case 'speaker': scene.speakerOff(p.order); A.play('addKill'); break;
        case 'wrongAnswer': pop('WRONG', 'red'); break;
        case 'boostOffer': pop('Art sent you a boost', 'boost'); A.play('milestone'); break;
        case 'boost': scene.cast('glitch-blade', { hits: [{ at: 230, power: 70 }], effect: {} }); cSfx('glitch-blade'); break;
        case 'won': wait(0, () => won(p)); break;
        case 'lost': A.titanStop(); wait(0, () => lost(p)); break;
      }
      if (name === 'move' || name === 'windup' || name === 'block' || name === 'slam' || name === 'moveDone') paintChips(true);
    }

    function fightRecord(sum, won) {
      const s = plan.slot;
      const score = won ? D().bossScore({ n: s.n, secs: sum.secs, sizedSecs: sum.sizedSecs, acc: sum.acc, hpLeft: sum.hpLeft, bestCombo: sum.combo, casts: sum.casts, retry: plan.retry }) : 0;
      const rec = { n: s.n, boss: plan.boss.id, title: s.title, mark: s.mark, won, retry: plan.retry, secs: +sum.secs.toFixed(1), wpm: sum.wpm, acc: sum.acc, combo: sum.combo, casts: sum.casts, dmg: sum.dmg, score, left: +sum.left.toFixed(3), keys: sum.keys, good: sum.good, letters: sum.letters, words: sum.words || 0, blocks: sum.blocks || 0 };
      run.fights.push(rec);
      return rec;
    }
    function won(sum) {
      if (!f) return;
      const rec = fightRecord(sum, true);
      dir.report(plan, sum);
      RushBoard.saveDirector(dir.model());
      run.score += rec.score;
      const R = (window.REWARDS && REWARDS.rush) || { boss: { coins: 5, xp: 8, perMark: 2 } };
      run.coins += R.boss.coins + R.boss.perMark * (plan.mark - 1);
      run.xp += R.boss.xp;
      WPM.track('rush_boss', { n: rec.n, boss: rec.boss, mark: rec.mark, secs: rec.secs, wpm: rec.wpm, acc: rec.acc, combo: rec.combo, retry: rec.retry });
      if (sum.combo >= 5) WPM.track('combo', { n: sum.combo, mode: 'rush' });
      scene.defeat();
      A.play('defeat');
      A.sting();
      document.dispatchEvent(new CustomEvent('buddy', { detail: 'boss-down' }));
      typed = ''; target = null;
      renderQueue(); paintChips(true); paintStrip();
      wait(plan.boss.art === 'kit' && plan.boss.kit !== 'syntax' ? 3000 : 1500, () => breather(rec, sum));   // a titan's death runs about 3 s
    }
    function lost(sum) {
      if (!f) return;
      const rec = fightRecord(sum, false);
      dir.report(plan, sum);
      RushBoard.saveDirector(dir.model());
      A.play('roar');
      typed = ''; target = null;
      renderQueue(); paintChips(true); paintStrip();
      wait(900, () => lostScreen(rec));
    }

    // ---------- overlays ----------
    function showOver(html, primary, secondary) {
      const o = q('over'); if (!o) return;
      o.innerHTML = html; o.hidden = false;
      q('stage').classList.add('has-over');
      over = { primary, secondary };
      q('box').classList.add('locked');
      const b = o.querySelector(`button[data-act="${primary}"]`);
      if (b && matchMedia('(pointer: fine)').matches) keys.focus();
    }
    function hideOver() { const o = q('over'); if (o) { o.hidden = true; o.innerHTML = ''; q('stage').classList.remove('has-over'); } over = null; const b = q('box'); if (b) b.classList.remove('locked'); }
    function act(a) {
      if (a === 'next') { hideOver(); run.n++; nextFight(false); }
      else if (a === 'retry') { hideOver(); run.retryUsed = true; nextFight(true); }
      else if (a === 'end') endRun('lost');
    }
    function statsHtml(rows) { return `<dl class="rush-dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`; }
    function runTotals() {
      const fs = run.fights;
      const keys = fs.reduce((a, x) => a + x.keys, 0), good = fs.reduce((a, x) => a + x.good, 0);
      const letters = fs.reduce((a, x) => a + x.letters, 0), sec = fs.reduce((a, x) => a + x.secs, 0);
      const wonF = fs.filter(x => x.won);
      const fast = wonF.slice().sort((a, b) => a.secs - b.secs)[0];
      return {
        keys, good, letters, secs: sec,
        avgWpm: sec > 0 ? Math.round(letters / 5 / (sec / 60)) : 0,
        peak: fs.filter(x => x.secs >= 5).reduce((a, x) => Math.max(a, x.wpm), 0),
        acc: keys ? Math.round(1000 * good / keys) / 10 : 0,
        combo: fs.reduce((a, x) => Math.max(a, x.combo), 0),
        spells: fs.reduce((a, x) => a + x.casts, 0),
        dmg: fs.reduce((a, x) => a + x.dmg, 0),
        beaten: wonF.length,
        words: fs.reduce((a, x) => a + (x.words || 0), 0), blocks: fs.reduce((a, x) => a + (x.blocks || 0), 0),
        fastest: fast ? { ms: Math.round(fast.secs * 1000), n: fast.n, boss: fast.boss, title: fast.title } : null,
      };
    }
    function breather(rec) {
      const T = runTotals();
      const nx = D().slot(run.n + 1);
      const tw = nx.mark > 1 && nx.i === 0 ? D().TWISTS.find(x => x.mark === nx.mark) : null;
      A.quiet(true);
      showOver(`<div class="ro-in">
          <p class="ro-head">Boss ${rec.n} down in ${secs(rec.secs * 1000)}<span>+${fmt(rec.score)} score</span></p>
          ${statsHtml([['Score', fmt(run.score)], ['Bosses beaten', T.beaten], ['wpm', T.avgWpm], ['Accuracy', T.acc + '%'], ['Best combo', T.combo], ['Spells cast', T.spells]])}
          <div class="ro-next" style="--c:${nx.boss.color}"><span>Next, boss ${nx.n}</span><b>${esc(nx.title)}</b><em>${esc(tw ? tw.text : D().SIG[nx.boss.id].text)}</em></div>
          <div class="ro-act"><button class="btn" type="button" data-act="next">Next boss <kbd>Enter</kbd></button><button class="btn out" type="button" data-act="end">End run</button></div>
        </div>`, 'next', 'end');
    }
    function lostScreen(rec) {
      const left = rec.left * 100;
      const can = !run.retryUsed;
      A.quiet(true);
      showOver(`<div class="ro-in lost">
          <p class="ro-head">${esc(rec.title)} beat you with ${left < 1 ? left.toFixed(1) : Math.round(left)}% of its HP left</p>
          ${can ? '<p class="ro-sub">You have one retry this run.</p>' : '<p class="ro-sub">Your retry for this run is used.</p>'}
          <div class="ro-act">${can ? '<button class="btn" type="button" data-act="retry">Retry this boss <kbd>Enter</kbd></button><button class="btn out" type="button" data-act="end">End run</button>'
            : '<button class="btn" type="button" data-act="end">See the results <kbd>Enter</kbd></button>'}</div>
        </div>`, can ? 'retry' : 'end', can ? 'end' : null);
    }

    // ---------- the end of a run ----------
    function finishRun() {
      if (!run || run.done) return null;
      run.done = true;
      const T = runTotals();
      const out = {
        id: run.id, at: run.at, name: WPM.profile().name,
        bosses: T.beaten, reached: run.n, score: run.score, ms: Math.round(T.secs * 1000),
        wpm: T.peak, avgWpm: T.avgWpm, acc: T.acc, bestCombo: T.combo, spells: T.spells, dmg: T.dmg, words: T.words, blocks: T.blocks,
        fastest: T.fastest, retry: run.retryUsed, fights: run.fights.map(({ keys, good, letters, words, blocks, ...x }) => x),
      };
      if (!T.keys) return { out, res: null, rec: null, coins: 0, xp: 0 };
      const res = RushBoard.add(out);
      const rec = WPM.record({ mode: 'rush', wpm: T.avgWpm, acc: Math.round(T.acc), correct: T.letters, keys: T.keys, ms: out.ms, score: out.score });
      WPM.track('rush_run', { bosses: out.bosses, score: out.score, wpm: T.avgWpm, acc: T.acc, combo: T.combo, spells: T.spells });
      const R = (window.REWARDS && REWARDS.rush) || { run: { coins: 10, xp: 20, minBosses: 3 }, newBest: { coins: 25 }, maxPerRun: 250 };
      let coins = run.coins, xp = run.xp;
      if (out.bosses >= R.run.minBosses) { coins += R.run.coins; xp += R.run.xp; }
      if (res.best.bosses) coins += R.newBest.coins;
      coins = Math.min(R.maxPerRun, coins);
      if (coins) WPM.addCoins(coins, 'boss rush');
      if (xp) WPM.addXP(xp);
      if (dir) RushBoard.saveDirector(dir.model());
      return { out, res, rec, coins: coins + (rec ? rec.coins : 0), xp: xp + (rec ? rec.xp : 0) };
    }
    function endRun(why) {
      if (!run) return;
      if (f && (f.phase === 'fight' || f.phase === 'intro') && why === 'quit') {
        // a fight left half way counts toward the totals and not toward the director
        const sum = f.summary();
        if (sum.keys) fightRecord({ ...sum, secs: Math.max(0.5, (now() - f.state(now()).fightAt) / 1000) }, false);
      }
      const T = runTotals();
      const r = finishRun();
      const last = run.fights[run.fights.length - 1];
      teardownFight();
      endView(r, last, why);
      return { r, last, T };
    }
    // the result window when a run is ended by leaving the page (Gid, 28 Nov 2026)
    function runSummary(x) {
      if (!x || !x.r) return null;
      const o = x.r.out, T = x.T;
      return {
        label: 'RUN OVER', title: `${o.bosses} ${o.bosses === 1 ? 'boss' : 'bosses'} beaten`,
        sub: x.last ? `You ended the run at boss ${x.last.n}, ${x.last.title}.` : '',
        stats: [['Time played', UI.clock(o.ms / 1000)], ['Damage dealt', o.dmg], ['Words typed right', T.words], ['Score', o.score],
          ['wpm', o.avgWpm], ['Accuracy', o.acc + '%'], ['Best combo', o.bestCombo], ['Blocks', T.blocks], ['Spells cast', o.spells]],
        xp: x.r.xp, coins: x.r.coins, share: runShare(o),
      };
    }
    const runShare = o => o.bosses ? `I beat ${o.bosses} ${o.bosses === 1 ? 'boss' : 'bosses'} in a row in Boss Rush on Stormtyper: ${fmt(o.score)} score, ${o.avgWpm} wpm, ${o.bestCombo} best combo. Can you beat it?`
      : `I dealt ${fmt(o.dmg)} damage in Boss Rush on Stormtyper at ${o.avgWpm} wpm. Can you beat it?`;
    function endView(r, last, why) {
      view = 'end';
      pageEl.classList.remove('rush-live');
      const o = r ? r.out : null;
      const best = r && r.res ? r.res.best : {};
      const callout = !r || !r.res ? '' : best.bosses ? `New best run: ${o.bosses} ${o.bosses === 1 ? 'boss' : 'bosses'}`
        : best.score ? `New best score: ${fmt(o.score)}` : r.res.first ? 'Your first run on this device' : '';
      const how = !last ? '' : last.won ? `You ended the run after boss ${last.n}.` : why === 'quit' ? `You ended the run at boss ${last.n}.` : `${esc(last.title)} beat you at boss ${last.n}.`;
      host.innerHTML = `
        <div class="rush page-boss" data-view="end">
          <section class="rush-end" aria-label="Run results">
            <h1>Run over</h1>
            <p class="re-how">${how}</p>
            ${callout ? `<p class="re-best">${callout}</p>` : ''}
            <div class="re-hero">
              <div><b>${o ? o.bosses : 0}</b><span>${o && o.bosses === 1 ? 'boss beaten' : 'bosses beaten'}</span></div>
              <div><b>${o ? fmt(o.score) : 0}</b><span>score</span></div>
            </div>
            ${o ? statsHtml([
              ['wpm', o.avgWpm + (o.wpm > o.avgWpm ? ` <small>peak ${o.wpm}</small>` : '')], ['Accuracy', o.acc + '%'], ['Best combo', o.bestCombo],
              ['Spells cast', o.spells], ['Damage dealt', fmt(o.dmg)], ['Time', UI.time(o.ms)], ['Words typed right', o.words || 0], ['Blocks', o.blocks || 0],
              ['Fastest kill', o.fastest ? `${secs(o.fastest.ms)} <small>${esc(o.fastest.title)}</small>` : '-'],
            ]) : ''}
            ${r && (r.coins || r.xp) ? `<p class="re-coins">${UI.coin()}<span><b>+${fmt(r.coins)}</b> coins and <b>+${fmt(r.xp)}</b> XP</span></p>` : ''}
            <div class="re-act"><button class="btn" type="button" data-k="again">New run <kbd>Enter</kbd></button><a class="btn out" href="#/leaderboard" data-lb>Scoreboard</a></div>
            ${o && (o.bosses || o.dmg) ? `<div class="re-share">${GameGuard.shareHtml(runShare(o))}</div>` : ''}
            ${o && o.fights.length ? `<details class="re-fights"><summary>Every boss in this run</summary>
              <table class="board"><thead><tr><th>#</th><th>Boss</th><th class="num-col">Time</th><th class="num-col">wpm</th><th class="num-col hide-sm">Accuracy</th><th class="num-col hide-sm">Combo</th><th class="num-col">Score</th></tr></thead>
              <tbody>${o.fights.map(x => `<tr class="${x.won ? '' : 'lost'}"><td class="rank">${x.n}</td><td>${esc(x.title)}${x.retry ? ' <span class="tag">Retry</span>' : ''}${x.won ? '' : ' <span class="tag">Lost</span>'}</td>
                <td class="n num-col">${x.secs.toFixed(1)} s</td><td class="n num-col">${x.wpm}</td><td class="n num-col hide-sm">${x.acc}%</td><td class="n num-col hide-sm">${x.combo}</td><td class="w num-col">${fmt(x.score)}</td></tr>`).join('')}</tbody></table>
            </details>` : ''}
          </section>
        </div>`;
      q('again').addEventListener('click', startRun);
      if (o) GameGuard.wire(host, runShare(o));
      host.querySelectorAll('[data-lb]').forEach(a => a.addEventListener('click', () => TT.store.set('wpm-lb-tab', 'rush')));
      if (matchMedia('(pointer: fine)').matches) q('again').focus({ preventScroll: true });
      // the game cards stack above the results on narrow screens
      const head = document.querySelector('header.top');
      const top = host.querySelector('.rush-end').getBoundingClientRect().top + scrollY - (head ? head.getBoundingClientRect().bottom : 0) - 12;
      scrollTo({ top: matchMedia('(max-width: 1000px)').matches ? Math.max(0, top) : 0 });
    }
    // Enter starts a run from the entry and end screens
    const enter = e => {
      if (e.key !== 'Enter' || (view !== 'menu' && view !== 'end')) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'A' || a.tagName === 'INPUT' || a.tagName === 'SUMMARY' || (a.tagName === 'BUTTON' && !a.matches('[data-k="start"], [data-k="again"]')))) return;
      e.preventDefault(); startRun();
    };
    document.addEventListener('keydown', enter);

    // ---------- the clock ----------
    let frozen = false;   // tests: _rush.freeze(true) holds the fight still for review shots
    function tick() {
      if (!f || view !== 'fight' || pausedAt || frozen) return;
      const t = now();
      f.tick(t);
      if (!f) return;
      // the camera director keeps to the game shot while anything is coming at you (scene.js, camdir.js)
      // a thrown word counts from when it lands, not from when it is thrown: its word is lit in your line with
      // its own timer, so a short cutaway may play while it falls and must end before it gets close (camdir's lock)
      { const S = f.state(t); scene.threat(S.phase !== 'fight' ? Infinity : S.action ? 0 : Math.min(S.nextAttack, S.timed ? S.nextDue : Infinity, S.sig === 'mute' ? S.nextSig : Infinity)); }
      syncLine();
      paintChips(false);
      paintFlags(t);
      if (f.phase === 'fight') paintTip(t);   // the intro keeps the arena clear for the entrance
    }

    // ---------- painting ----------
    function paintHead() {
      if (!f || !q('name')) return;
      const S = f.state(now()), s = plan.slot;
      q('name').textContent = s.title;
      q('state').textContent = plan.retry ? `Boss ${s.n}, retry` : `Boss ${s.n}`;
      q('state').dataset.s = Math.min(5, s.mark);
      q('num').textContent = `Phase ${S.stage} of 3`;
      q('num').dataset.p = S.stage;
      const fr = S.hp / S.max;
      q('hp').innerHTML = `${fmt(Math.ceil(S.hp))}<small> / ${fmt(S.max)} HP</small>`;
      q('fill').style.width = (100 * fr) + '%';
      q('meter').setAttribute('aria-valuemax', S.max); q('meter').setAttribute('aria-valuenow', Math.ceil(S.hp));
      q('left').textContent = (fr > 0 && fr < 0.01 ? (100 * fr).toFixed(1) : Math.ceil(100 * fr)) + '%';
      const sb = q('sbar');
      if (S.shield) { sb.hidden = false; sb.style.width = (100 * fr) + '%'; sb.style.setProperty('--s', S.shield.hp / S.shield.max); } else sb.hidden = true;
      scene.setFrac(fr);
    }
    function paintYou() {
      if (!f || !q('ifill')) return;
      const p = f.state(now()).player;
      const k = p.hp / p.max;
      q('ifill').style.width = (100 * k) + '%';
      q('ifill').parentElement.dataset.low = k <= 0.3 ? '1' : '';
      q('ihp').textContent = Math.ceil(p.hp);
      q('imeter').setAttribute('aria-valuenow', Math.ceil(p.hp));
    }
    function paintStrip() {
      if (!run || !q('s-score')) return;
      const T = runTotals();
      const cur = f ? f.summary() : null;
      const keys = T.keys + (cur && f.phase === 'fight' ? cur.keys : 0), good = T.good + (cur && f.phase === 'fight' ? cur.good : 0);
      q('s-score').textContent = fmt(run.score);
      q('s-beaten').textContent = T.beaten;
      q('s-wpm').textContent = cur && f.phase === 'fight' ? cur.wpm : T.avgWpm;
      q('s-acc').textContent = (keys ? Math.round(100 * good / keys) : 100) + '%';
    }
    function paintFlags(t) {
      const box = q('flags'); if (!box || !f) return;
      const S = f.state(t), bits = [];
      if (S.stunned) bits.push(`<span class="wb-flag stun">Stunned <b>${(S.stunLeft / 1000).toFixed(1)}s</b> <small>damage x2</small></span>`);
      if (S.shield) bits.push(`<span class="wb-flag shield">Firewall <b>${fmt(Math.max(0, S.shield.hp))}</b></span>`);
      if (S.enraged) bits.push('<span class="wb-flag jam">Enraged</span>');
      if (S.action && S.action.type === 'windup' && S.action.shown && S.action.name) bits.push(`<span class="wb-flag jam">${esc(S.action.name)} <b>${(Math.max(0, S.action.due - t) / 1000).toFixed(1)}s</b></span>`);
      if (plan.boss.move === 'press' && S.heat) bits.push(`<span class="wb-flag weak">Blocks <b>${S.heat}</b><small> of 3</small></span>`);
      if (S.pageHeatMax && S.pageHeat) bits.push(`<span class="wb-flag weak">Heat <b>${S.pageHeat}</b><small> of ${S.pageHeatMax}</small></span>`);
      if (S.sig === 'popup') { const n = f.chips(t).filter(c => c.kind === 'popup').length; if (n) bits.push(`<span class="wb-flag ${n >= S.popCap ? 'jam' : 'weak'}">Pop-ups <b>${n}</b><small> of ${S.popCap}</small></span>`); }
      const vol = q('vol');
      if (vol) {
        vol.hidden = S.sig !== 'mute';
        if (S.sig === 'mute') { q('volfill').style.height = (100 * S.volume).toFixed(0) + '%'; vol.dataset.l = S.volume >= 0.8 ? '2' : S.volume >= 0.5 ? '1' : ''; }
        const box = q('box'); if (box) { box.classList.toggle('loud', S.sig === 'mute' && S.volume >= 0.5); box.classList.toggle('louder', S.sig === 'mute' && S.volume >= 0.8); }
      }
      const pn = performance.now();
      for (const x of me.statuses()) {
        const left = x.until ? Math.max(0, Math.ceil((x.until - pn) / 1000)) + 's' : '';
        const txt = { ward: 'Safe mode', hyper: `Hyper thread x2 <b>${left}</b>`, root: `Root access x2 <b>${left}</b>`, split: `Quantum split <b>${x.charges}</b>`, cshield: `Combo shield <b>${left}</b>`, frenzy: `Frenzy x3 <b>${left}</b>`, purge: `Purge <b>${left}</b>`, 'stunned-target': `Kernel panic <b>${left}</b>`, crits: `Crits <b>${x.charges}</b>` }[x.name];
        if (txt) bits.push(`<span class="wb-flag buff ${x.name}">${txt}</span>`);
      }
      const html = bits.join('');
      if (box.innerHTML !== html) box.innerHTML = html;
      scene.heat(S.heat);
    }
    function lettersHtml(word, t, caret) {
      let s = '';
      for (let i = 0; i < word.length; i++) {
        const a = t[i], c = word[i], ch = c === ' ' ? '&nbsp;' : esc(c);
        if (a === undefined) s += `<span class="c${caret && i === t.length ? ' at' : ''}">${ch}</span>`;
        else s += `<span class="c ${a === c ? 'ok' : 'bad'}">${ch}</span>`;
      }
      return s;
    }
    // the corner row only says when the next attack comes; everything to type is in the line
    function paintChips(force) {
      const row = q('chips'); if (!row) return;
      const t = now();
      const live = f && f.phase === 'fight';
      const S = live ? f.state(t) : null;
      const show = live && !S.action && S.nextAttack > 0 && !S.stunned;
      const key = show ? 'next' : '';
      if (force || key !== chipKey) { chipKey = key; row.innerHTML = show ? `<span class="wb-next">Next attack in <b data-k="nexts">${Math.ceil(S.nextAttack / 1000)}s</b></span>` : ''; }
      const ns = row.querySelector('[data-k="nexts"]');
      if (ns && show) ns.textContent = Math.ceil(S.nextAttack / 1000) + 's';
    }
    // the words as a block of lines, the same as the World Boss (js/app/wordflow.js); the specials sit
    // lit in their colours with a label and a timer
    function renderQueue() {
      const box = q('queue'); if (!box) return;
      if (!flow) flow = WordFlow.create(box, { lines: 3 });
      const st = f ? f.stack() : [];
      const v = line ? line.view(st, now()) : { cur: st[0] || '', next: st.slice(1, 50), tags: null };
      const pens = {};
      if (f) for (const m of f.marks()) if (m.i >= 0 && m.i < 50) pens[m.i] = m.fake;
      flow.render({ cur: v.cur, typed, mine: true, next: v.next, pens, tags: v.tags });
      layLabels(box);
      paintTags();
    }
    // The small labels over lit words (WEAK POINT, BLOCK SLAM) are wider than short words, so two lit words
    // side by side ran their labels together ("WEAK POINTFIX"). On each line, a label that would touch the
    // next one first takes its short name, then the next label slides right along its own word, and if
    // they still meet the next one goes up a row.
    const SHORT_LABEL = { 'WEAK POINT': 'WEAK', 'SEND BACK': 'SEND', 'DATA BLOCK': 'DATA', 'BOOST': 'BOOST' };
    const shortOf = t => SHORT_LABEL[t] || (t.startsWith('BLOCK ') ? 'BLOCK' : null);
    function layLabels(box) {
      const ls = box.querySelectorAll('.fw-lbl');
      if (ls.length < 2) return;
      const it = [...ls].map(l => { const w = l.parentElement.getBoundingClientRect(), r = l.getBoundingClientRect(); return { l, wl: w.left, ww: w.width, row: Math.round(w.top), x: r.left, w: r.width }; })
        .sort((a, b) => a.row - b.row || a.x - b.x);
      const GAP = 8;
      for (let i = 1; i < it.length; i++) {
        const a = it[i - 1], b = it[i];
        if (a.row !== b.row || a.x + a.w + GAP <= b.x) continue;
        const sh = shortOf(a.l.textContent);
        if (sh && sh !== a.l.textContent) { a.l.textContent = sh; a.w = a.l.getBoundingClientRect().width; }
        if (a.x + a.w + GAP <= b.x) continue;
        const room = Math.max(0, Math.max(b.ww - b.w, b.ww * 0.5) - (b.x - b.wl));
        const move = Math.min(room, a.x + a.w + GAP - b.x);
        if (move > 0) { b.l.style.left = (b.x - b.wl + move).toFixed(1) + 'px'; b.x += move; }
        if (a.x + a.w + GAP > b.x) {
          const bs = shortOf(b.l.textContent);
          if (bs && bs !== b.l.textContent) { b.l.textContent = bs; b.w = b.l.getBoundingClientRect().width; }
          b.l.classList.add('up'); b.x = a.x + a.w + GAP;   // lifted: the next label measures from here
        }
      }
    }
    function paintCombo(drop) {
      const box = q('cbox'); if (!box || !me) return;
      const c = me.state();
      if (c.combo > 0) comboShown = true;
      box.hidden = !comboShown;
      q('cnum').textContent = c.combo;
      q('ctier').textContent = c.name;
      box.dataset.t = c.tier;
      q('cbar').style.width = (100 * Math.min(1, c.progress)).toFixed(1) + '%';
      q('cnext').textContent = c.next ? c.next : '';
      if (drop) { box.classList.remove('drop'); void box.offsetWidth; box.classList.add('drop'); }
    }
    function wireCombat() {
      me.on('combo', c => { paintCombo(['hurt', 'typo', 'wrong', 'fizzle'].includes(c.reason)); if (c.combo && c.combo % 5 === 0 && c.reason === 'word') WPM.track('combo', { n: c.combo, mode: 'rush' }); });
      me.on('tierUp', e => { if (!q('cbox')) return; cSfx('tierUp', e.tier); pop(e.name.toUpperCase(), 'green'); tip('combo'); const b = q('cbox'); b.classList.remove('up'); void b.offsetWidth; b.classList.add('up'); });
      me.on('miss', e => { if (e.from >= 10) cSfx('break'); });
      // a combo milestone earns a spell: its words go into your line past the middle line and wait there
      me.on('spellEarned', e => { const sp = e.spell; earned.push({ ...sp, key: 'spell:' + sp.id + ':' + Math.round(performance.now()) }); cSfx('offer'); tip('spell'); syncLine(); });
      me.on('ward', () => { cSfx('ward'); scene && scene.fxEvent('ward'); });
      me.on('perk', e => pop(e.name.toUpperCase(), 'white'));
      me.on('guard', g => { cSfx('guard'); if (scene && !g.shield) scene.fxEvent('guard'); pop('COMBO KEPT', 'white'); });
      me.on('status', e => { if (scene && ['ward', 'hyper', 'root', 'split', 'cshield', 'frenzy'].includes(e.name)) scene.aura(e.name, !!e.on); });
    }

    // ---------- the signature's words in the arena ----------
    // Signs, pages, packets and speakers get a tag that follows them; pop-ups are windows
    // over the arena. Positions move every frame; letters change only on a key.
    function addTag(p) {
      if (p.kind === 'popup') {
        const box = q('pops'); if (!box) return;
        const el = document.createElement('div');
        el.className = 'rp';
        const n = [...tags.values()].filter(x => x.kind === 'popup').length;
        const king = plan.boss.id === 'king', ads = king ? DECREES : ['FREE GIFT!!', 'u won', 'CLICK NOW', 'hot deal', 'DM me', 'last chance'];
        let slot = -1;
        if (king) {
          // the King's decrees land in the columns either side of him, clear of his body, the attack flags
          // (top left) and the next-attack timer (bottom right)
          const used = new Set([...tags.values()].filter(x => x.kind === 'popup').map(x => x.slot));
          slot = KING_SLOTS.findIndex((_, i) => !used.has(i));
          if (slot < 0) slot = n % KING_SLOTS.length;
          const [lx, ty] = KING_SLOTS[slot];
          el.style.left = (lx + Math.random() * 3).toFixed(1) + '%';
          el.style.top = (ty + Math.random() * 3).toFixed(1) + '%';
        } else {
          el.style.left = (8 + ((n * 31 + Math.random() * 18) % 64)).toFixed(1) + '%';
          el.style.top = (10 + ((n * 23 + Math.random() * 14) % 42)).toFixed(1) + '%';
        }
        if (king) el.classList.add('rp-king');
        el.innerHTML = `<div class="rp-bar"><span>${esc(ads[Math.floor(Math.random() * ads.length)])}</span><i>x</i></div><b class="w"></b>`;
        box.append(el);
        tags.set(p.id, { kind: 'popup', el, word: p.word, due: p.due, total: p.total, typed: null, slot });
      } else {
        const box = q('tags'); if (!box) return;
        const el = document.createElement('div');
        el.className = 'rt rt-' + p.kind;
        el.innerHTML = `<small>${((TITAN_TAG[plan.boss.id] || {})[p.kind]) || TAG_LABEL[p.kind] || ''}</small><b class="w"></b>${p.due ? '<i class="rt-bar"><i></i></i>' : ''}`;
        el.style.opacity = '0';
        box.append(el);
        tags.set(p.id, { kind: p.kind, el, word: p.word, due: p.due, total: p.total, typed: null, bar: el.querySelector('.rt-bar i') });
      }
      paintTags(true);
      if (!tagRaf) tagRaf = requestAnimationFrame(moveTags);
    }
    function dropTag(id, how) {
      const x = tags.get(id); if (!x) return;
      tags.delete(id);
      x.el.classList.add('gone', how || 'done');
      setTimeout(() => x.el.remove(), 320);
    }
    function clearTags() { for (const x of tags.values()) x.el.remove(); tags.clear(); }
    // the arena's tags and pop-ups show the word in your line that each one lit
    function paintTags(force) {
      const st = f ? f.stack() : [], h = head(), items = line ? line.items() : [];
      for (const [id, x] of tags) {
        const it = items.find(y => y.id === id);
        const word = it && it.pos >= 0 ? st.slice(it.pos, it.pos + it.n).join(' ') : x.word;
        const t = h && h.item.id === id ? typed : '';
        const key = word + '|' + t;
        if (!force && x.typed === key) continue;
        x.typed = key;
        x.el.querySelector('.w').innerHTML = lettersHtml(word, t, !!t);
        x.el.classList.toggle('on', !!t);
      }
    }
    const pt = { x: 0, y: 0 };
    function moveTags() {
      tagRaf = 0;
      if (!scene || !tags.size) return;
      const pn = now();
      // a cutaway hides the arena's tags for its second or two; the words stay lit in your line with their timers
      const tl = q('tags'); if (tl) tl.classList.toggle('cut', !!scene.cutaway());
      // where each tag wants to be (its thing in the arena), then the ones that would overlap are stacked
      // upward, nearest to the floor first, so two tags never cover each other's word
      const boxes = [];
      for (const [id, x] of tags) {
        if (x.kind === 'popup') continue;
        const at = scene.screen('sig:' + id, pt);
        if (!at) continue;
        if (!x.w || x.wordKey !== x.typed) { x.w = x.el.offsetWidth; x.h = x.el.offsetHeight; x.wordKey = x.typed; }
        boxes.push({ x, cx: at.x, by: at.y });
      }
      boxes.sort((a, b) => b.by - a.by);
      const stageH = tl ? tl.clientHeight : 9999;
      const placed = [];
      for (const b of boxes) {
        let by = b.by;
        const l = b.cx - b.x.w / 2 - 4, r = b.cx + b.x.w / 2 + 4;
        for (let k = 0; k < 6; k++) {
          const hit = placed.find(o => l < o.r && r > o.l && by > o.t && by - b.x.h < o.b);
          if (!hit) break;
          by = hit.t - 4;
        }
        by = Math.min(Math.max(b.x.h + 2, by), stageH - 2);
        b.x.dy = b.x.dy === undefined ? by - b.by : b.x.dy + (by - b.by - b.x.dy) * 0.35;
        const y = b.by + b.x.dy;
        placed.push({ l, r, t: y - b.x.h, b: y });
        b.x.el.style.transform = `translate(${b.cx.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`; b.x.el.style.opacity = '1';
      }
      for (const [, x] of tags) {
        if (x.due) {
          const left = Math.max(0, x.due - pn);
          if (x.bar) x.bar.style.width = (100 * left / x.total).toFixed(1) + '%';
          x.el.classList.toggle('late', left < 1500);
        }
      }
      tagRaf = requestAnimationFrame(moveTags);
    }

    // ---------- feedback ----------
    function onImpact(h, x, y) { number({ amount: h.amount, big: h.crit || h.tier >= 3 || h.kind === 'weak', kind: h.kind }, x, y); A.play(h.kind === 'weak' ? 'crit' : h.crit ? 'crit' : 'hit', 0); }
    function number(h, x, y) {
      const layer = q('nums'); if (!layer) return;
      if (x === null || x === undefined) {
        const pt = scene && scene.screen('core', { x: 0, y: 0 });
        const stg = q('stage');
        x = pt ? pt.x : stg.clientWidth / 2; y = pt ? pt.y : stg.clientHeight * 0.4;
      }
      const s = document.createElement('span');
      s.className = 'dmg you' + (h.big ? ' big' : '') + (h.shield ? ' sh' : '') + (h.kind === 'spell' ? ' spell' : '') + (h.amount >= 1000 ? ' huge' : '');
      s.textContent = '-' + fmt(h.amount);
      s.style.left = (x + (Math.random() - 0.5) * 80) + 'px';
      s.style.top = (y + (Math.random() - 0.5) * 50) + 'px';
      layer.append(s);
      while (layer.children.length > 24) layer.firstElementChild.remove();
      setTimeout(() => s.remove(), 1200);
    }
    function pop(text, cls) {
      const p = q('pop'); if (!p) return;
      const t = now();
      if (t - popT < 350 && cls !== 'boost') return;
      popT = t;
      p.className = 'wb-pop ' + cls;
      p.textContent = text;
      void p.offsetWidth; p.classList.add('go');
    }
    function flashTint() {
      const n = q('tint'); if (!n) return;
      if (now() - tintT < 400) return;
      tintT = now();
      n.classList.remove('go'); void n.offsetWidth; n.classList.add('go');
    }
    // card: the titan's name in the arena's top left with no band behind it, so its entrance stays clear
    function banner(small, big, line, ms = 2400, card = false) {
      const b = q('banner'); if (!b) return;
      b.hidden = false;
      b.classList.toggle('card', card);
      b.style.setProperty('--bms', ms + 'ms');
      b.innerHTML = `<div class="in"><small>${esc(small)}</small><b>${esc(big)}</b>${line ? `<span>${esc(line)}</span>` : ''}</div>`;
      b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
      clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, ms);
    }
    function tip(id) { if (!seen.has(id) && !tipQ.includes(id)) tipQ.push(id); }
    function paintTip(t) {
      const n = q('tip'); if (!n || t < tipUntil) return;
      const id = tipQ.shift();
      if (!id) { if (n.textContent) { n.textContent = ''; n.classList.remove('on'); } return; }
      seen.add(id);
      try { localStorage.setItem('wpm-rush-tips', JSON.stringify([...seen])); } catch (e) {}
      n.textContent = TIPS[id]; n.dataset.id = id; n.classList.add('on');
      tipUntil = t + 6000;
    }

    // ---------- leaving ----------
    function teardownFight() {
      if (tagRaf) cancelAnimationFrame(tagRaf); tagRaf = 0;
      clearTags();
      later.forEach(clearTimeout); later = [];
      timers.forEach(clearInterval); timers = [];
      offs.forEach(fn => fn()); offs = [];
      if (scene) { scene.dispose(); scene = null; }
      if (me) { me.bus.clear(); }
      A.stop();
      f = null; keys = null; over = null;
    }
    function destroy() {
      GameGuard.stop();
      if (run && !run.done && run.fights.length + (f ? 1 : 0) > 0) {
        if (f && (f.phase === 'fight' || f.phase === 'intro')) { const sum = f.summary(); if (sum.keys) fightRecord(sum, false); }
        finishRun();
      }
      document.removeEventListener('keydown', enter);
      teardownFight();
      me = null; run = null;
      pageEl.classList.remove('rush-live');
      delete window._rush;
    }
    const leave = () => { if (run && !run.done && (run.fights.length || f)) { if (f && (f.phase === 'fight' || f.phase === 'intro')) { const sum = f.summary(); if (sum.keys) fightRecord(sum, false); } finishRun(); } };
    addEventListener('pagehide', leave);

    // ---------- test hooks ----------
    window._rush = {
      view: () => view,
      start: () => { if (view !== 'fight') startRun(); },
      jump: n => { if (!run) startRun(); later.forEach(clearTimeout); later = []; run.n = n; nextFight(false); },
      plan: () => plan && { n: plan.n, boss: plan.boss.id, mark: plan.mark, S: plan.S, knobs: plan.knobs, floor: plan.floor, help: plan.help, boost: plan.boost },
      state: () => f && f.state(now()),
      summary: () => f && f.summary(),
      chips: () => (f ? f.chips(now()).map(c => ({ kind: c.kind, word: c.word, id: c.id, next: c.next })) : []),
      stack: () => (f ? f.stack().slice(0, 6) : []),
      line: () => (f && line ? line.view(f.stack()) : null),
      items: () => (line ? line.items().map(x => ({ id: x.id, kind: x.kind, word: x.word, pos: x.pos })) : []),
      win: () => f && f.debug.win(now()),
      lose: left => f && f.debug.lose(now(), left === undefined ? 0.4 : left),
      setHp: x => f && (f.debug.setHp(x, now()), paintHead()),
      sig: () => f && f.debug.sig(now()),
      tags: () => [...tags].map(([id, x]) => ({ id, kind: x.kind, word: x.word })),
      marks: () => (f ? f.marks() : []),
      attack: id => f && f.debug.attack(now(), id),
      move: () => f && f.debug.move(now()),
      act: a => act(a),
      end: () => endRun('quit'),
      type: w => { for (const ch of w) onChar(ch); onChar(' '); },
      setCombo: n => me && me.debug.setCombo(n),
      cast: id => { const sp = Combat.spell(id); if (!sp || !me) return false; me.debug.offer([id]); typed = ''; target = null; castSpell(sp, true); return true; },
      boost: () => { if (!f) return false; f.plan.boost = { word: 'overclock', at: 0, dmg: Math.round(f.state(now()).max * 0.1) }; return true; },
      log: () => (dir ? dir.log() : []),
      board: () => RushBoard.load(),
      scene: () => scene && scene.info(),
      sceneCtl: () => scene,
      freeze: on => { frozen = !!on; },
      audio: () => A.state(),
    };

    menu();
    return {
      destroy() { removeEventListener('pagehide', leave); destroy(); },
    };
  }

  return { mount };
})();
