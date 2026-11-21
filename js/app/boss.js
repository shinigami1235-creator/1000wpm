// #/boss: the world boss. Every correctly typed word deals one point of damage
// per letter. The boss attacks on a schedule every raider shares
// (WorldBossRules), and the words those attacks carry show in their own slot
// above the word stack: block, send back or destroy. The fight runs through
// window.WorldBossNet (LocalDemo for now).
Router.register('boss', (() => {
  // the rules, the boss and the audio are read in mount, so the order the scripts load in never matters
  let R, B, A, NAME, TIPS;
  const BANNER = [
    '',
    'It puts up a firewall and fires packets at you now.',
    'It spawns bugs that patch it.',
    'Block words are two words long now.',
    'It is enraged and attacks twice as often.',
  ];
  const tipsFor = name => ({
    slam: 'Type the red word before its timer runs out to block the attack.',
    phrase: 'Type both words with the space between them to block.',
    volley: 'Type a cyan packet before it reaches you to send it back for triple damage.',
    shield: 'Hits go into the firewall until the raid breaks it, then the kernel opens.',
    adds: `Type an amber word to delete that bug since each one patches ${name}.`,
    weak: 'Hits on the open kernel deal double damage.',
    weak3: 'Hits on the open kernel deal triple damage.',
    stagger: `Six quick words in a row stagger ${name} and make your next three hits crits.`,
    start: 'Type the highlighted word and press Space. Each correct word deals one damage per letter.',
  });
  const KIND = { block: 'Block', return: 'Send back', add: 'Debug' };
  const STREAK_N = 6, STREAK_MS = 4500, STAGGER_CD = 8000, CRITS = 3, JAM_MS = 5000, ACTIVE_MS = 20000, LOCK_MS = 1200;
  const DMG_MILESTONES = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05];
  const BLOCK_MILESTONES = [1, 5, 10, 25, 50];
  const COMBO_MILESTONES = [25, 50, 100, 200];

  let el, scene, offs = [], timers = [], keys = null;
  let st = null;
  let stack = [], hist = [], typed = '', target = null, clean = true, combo = 0, best = 0;
  let sess = null, recorded = false, feed = [], others = [], lastOther = 0, lastNum = 0, lastStage = -1, lastPhase = -1;
  let mech = [], mechKey = '', sent = new Set(), done = new Set(), mine = new Set(), warned = {};
  let wordTimes = [], staggerAt = 0, critLeft = 0, jamUntil = 0, lockUntil = 0, lastKeyAt = 0, weakWas = false, shieldWas = false;
  let tipQ = [], tipUntil = 0, seenTips = new Set(), miles = new Set(), downTimer = 0, feedDirty = false;
  let labels = new Map(), misses = [], gone = new Map();

  const q = k => el && el.querySelector(`[data-k="${k}"]`);
  const fmt = UI.fmt, esc = UI.esc;
  const pct = (a, b) => b ? (100 * a / b) : 0;
  const share = (a, b) => { const p = pct(a, b); return p > 0 && p < 0.01 ? '<0.01%' : (p > 0 && p < 1 ? p.toFixed(2) : p.toFixed(1)) + '%'; };
  const now = () => WorldBossNet.now();
  const active = () => now() - lastKeyAt < ACTIVE_MS;
  const sfx = (n, a) => A.play(n, a);

  function newSession() {
    sess = { keys: 0, good: 0, letters: 0, words: 0, missed: 0, first: 0, last: 0, active: 0, blocks: 0, fails: 0, returns: 0, adds: 0, dmg: 0 };
    recorded = false;
  }
  function resetFight() {
    newSession();
    feed = []; hist = []; typed = ''; target = null; combo = 0; best = 0; clean = true; lastStage = -1; lastPhase = -1;
    mech = []; mechKey = ''; sent = new Set(); done = new Set(); mine = new Set(); warned = {};
    wordTimes = []; staggerAt = 0; critLeft = 0; jamUntil = 0; lockUntil = 0; weakWas = false; shieldWas = false; miles = new Set();
  }

  function mount(root) {
    el = root;
    R = window.WorldBossRules; B = R.BOSS; A = window.BossAudio; NAME = B.name; TIPS = tipsFor(NAME);
    resetFight();
    try { seenTips = new Set(JSON.parse(localStorage.getItem('wpm-boss-tips') || '[]')); } catch (e) { seenTips = new Set(); }
    stack = TT.randomWords(80);
    // One centred column: HP, the arena, the attack slots, the word stack and a slim
    // strip with your numbers. The scoreboard, the live feed and the rest of your
    // stats sit in a drawer that Tab or the Scoreboard button opens.
    el.innerHTML = `
      <div class="wb" data-k="wb">
        <section class="boss-hpbox" aria-label="Boss HP" data-k="hpbox">
          <div class="wb-hp-row">
            <h1 class="wb-name">${esc(NAME)}</h1>
            <span class="boss-state" data-k="state"></span>
            <span class="wb-phase" data-k="phase"></span>
            <span class="wb-hpnum"><b data-k="hp">0</b><span class="wb-left"><span data-k="left">0%</span> left</span></span>
          </div>
          <div class="boss-bar" role="meter" aria-label="Boss HP" aria-valuemin="0" aria-valuemax="${B.maxHp}" data-k="meter">
            <i data-k="fill"></i><em class="wb-shieldbar" data-k="sbar" hidden></em>
            ${R.PHASES.slice(1).map(ph => `<s style="left:${ph.at * 100}%"></s>`).join('')}
          </div>
        </section>
        <section class="boss-stage" data-k="stage" aria-label="The boss">
          <div class="kb-loading" data-k="loading">Loading</div>
          <div class="wb-tint" data-k="tint" aria-hidden="true"></div>
          <div class="wb-labels" data-k="labels" aria-hidden="true"></div>
          <div class="dmg-layer" data-k="nums" aria-hidden="true"></div>
          <div class="wb-status">
            <span class="wb-flag shield" data-k="shield" hidden></span>
            <span class="wb-flag weak" data-k="weak" hidden></span>
            <span class="wb-me" data-k="mestat"></span>
          </div>
          <ol class="wb-mini" data-k="mini" aria-label="Top raiders"></ol>
          <p class="wb-tip" data-k="tip" aria-live="polite"></p>
          <div class="wb-pop" data-k="pop" aria-hidden="true"></div>
          <div class="wb-banner" data-k="banner" hidden></div>
          <div class="boss-down" data-k="down" hidden></div>
        </section>
        <section class="boss-type" aria-label="Your word stack">
          <div class="wb-mech" data-k="mechrow"><div class="wb-chips" data-k="chips"></div></div>
          <div class="typebox boss-words" data-k="box" tabindex="-1">
            <div class="boss-queue" data-k="queue"></div>
            <div class="focus-note"><span class="fn-key">Click here or press any key to type</span><span class="fn-tap">Tap here to type</span></div>
          </div>
          <div class="wb-over" data-k="over"><button class="btn" type="button" data-k="again">New demo boss</button></div>
        </section>
        <div class="wb-strip">
          <span class="wb-stat mine"><b data-k="s-dmg">0</b> damage</span>
          <span class="wb-stat"><b data-k="s-rank">-</b><span data-k="s-of"></span></span>
          <span class="wb-stat"><b data-k="s-wpm">0</b> wpm</span>
          <span class="wb-stat"><b data-k="s-blocks">0</b> blocked</span>
          <button class="wb-boardbtn" type="button" data-k="boardbtn" aria-expanded="false" aria-controls="wb-drawer">Scoreboard <kbd>Tab</kbd></button>
        </div>
        <p class="wb-demo" data-k="demo">Demo: the other raiders are simulated until the server is live.
          <span class="wb-skip" data-k="skip">Skip to phase ${[2, 3, 4, 5].map(n => `<button type="button" data-p="${n - 1}">${n}</button>`).join('')}</span></p>
      </div>
      <aside class="wb-drawer" id="wb-drawer" data-k="drawer" aria-label="Scoreboard" inert>
        <div class="wb-dhead">
          <h2>Scoreboard</h2><span data-k="count"></span>
          <button class="wb-x" type="button" data-k="close" aria-label="Close the scoreboard"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg></button>
        </div>
        <section class="boss-you">
          <h3>You</h3>
          <div class="wb-you">
            <div><span>Damage</span><b class="green" data-k="mydmg">0</b></div>
            <div><span>Rank</span><b data-k="rank">-</b></div>
            <div><span>wpm</span><b data-k="wpm">0</b></div>
            <div><span>Accuracy</span><b data-k="acc">100%</b></div>
            <div><span>Combo</span><b data-k="combo">0</b></div>
            <div><span>Best combo</span><b data-k="best">0</b></div>
            <div><span>Blocks</span><b data-k="blocks">0</b></div>
            <div><span>Packets sent back</span><b data-k="returns">0</b></div>
            <div><span>Bugs deleted</span><b data-k="adds">0</b></div>
          </div>
        </section>
        <section>
          <h3>Damage</h3>
          <table class="boss-board"><thead><tr><th>#</th><th>Raider</th><th class="r">Damage</th><th class="r">Blocks</th><th class="r">Share</th></tr></thead><tbody data-k="board"></tbody></table>
        </section>
        <section>
          <h3>Live feed</h3>
          <ol class="boss-feed" data-k="feed"></ol>
        </section>
      </aside>`;

    renderQueue();
    tip('start');
    scene = BossScene.mount(q('stage'), { onImpact, onFrame: placeLabels });
    scene.ready.then(ok => { const l = q('loading'); if (ok && l) l.remove(); })
      .catch(() => { const l = q('loading'); if (l) l.textContent = 'The boss needs an internet connection to draw.'; });

    offs.push(WorldBossNet.onState(onState));
    offs.push(WorldBossNet.onHit(onHit));
    offs.push(WorldBossNet.onEvent(onEvent));
    WorldBossNet.connect({ id: 'you', name: WPM.profile().name }).then(s => { onState(s, true); });

    q('skip').addEventListener('click', e => {
      const b = e.target.closest('button[data-p]');
      const d = WorldBossNet.demo();
      if (b && d) { d.jumpTo(+b.dataset.p); if (keys) keys.focus(); }
    });
    q('again').addEventListener('click', again);
    q('boardbtn').addEventListener('click', () => { drawer(); if (keys) keys.focus(); });
    q('close').addEventListener('click', () => { drawer(false); if (keys) keys.focus(); });
    q('drawer').addEventListener('keydown', e => { if (e.key === 'Escape') { drawer(false); if (keys) keys.focus(); } });

    const box = q('box');
    keys = TT.captureKeys(box, {
      label: 'Type the words to attack the boss. Tab opens the scoreboard.',
      onChar, onBack,
      onKey(k) {
        if (k === 'Enter') submit();
        else if (k === 'Tab') drawer();
        else if (k === 'Escape') drawer(false);
      },
    });
    if (matchMedia('(pointer: fine)').matches) keys.focus();
    const forward = e => {
      A.unlock();
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'view') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      keys.focus();
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    };
    document.addEventListener('keydown', forward);
    offs.push(() => document.removeEventListener('keydown', forward));
    const unlock = () => A.unlock();
    el.addEventListener('pointerdown', unlock);
    const snd = e => { A.setOn(!!(e.detail && e.detail.on)); if (st && !st.defeatedAt && e.detail.on) A.phase(st.phase); };
    addEventListener('wpm-sound', snd);
    offs.push(() => removeEventListener('wpm-sound', snd));
    A.setOn(TT.soundOn());
    const leave = () => { record(!!(st && st.defeatedAt)); payOwed(); };
    addEventListener('pagehide', leave);
    offs.push(() => removeEventListener('pagehide', leave));
    timers.push(setInterval(paintFeed, 300));
    timers.push(setInterval(tick, 100));
    debugHook();
  }

  // ---------- typing ----------
  // A word goes to the first attack slot it matches, otherwise to the stack.
  function wordOf(t) { return t && t.kind ? t.word : stack[0]; }
  function retarget() {
    if (target && target.kind && !mech.some(m => m.id === target.id)) target = null;
    if (target && wordOf(target).startsWith(typed)) return;
    const m = mech.find(x => x.word.startsWith(typed));
    if (m) { target = m; return; }
    if (stack[0].startsWith(typed)) { target = { stack: true }; return; }
    if (!target) target = { stack: true };
  }
  function onChar(ch) {
    if (!st || st.defeatedAt) return;
    const t = performance.now();
    lastKeyAt = now();
    if (now() < lockUntil) return;
    if (!sess.first) sess.first = t;
    else if (t - sess.last < 5000) sess.active += t - sess.last;
    sess.last = t;
    if (ch === ' ') {
      // a two-word block keeps its space
      if (target && target.kind && target.word.startsWith(typed + ' ')) { typed += ' '; renderQueue(); return; }
      if (typed) submit();
      return;
    }
    sess.keys++;
    typed += ch;
    retarget();
    const w = wordOf(target);
    if (typed.length <= w.length && ch === w[typed.length - 1]) sess.good++;
    else clean = false;
    TT.click(false);
    renderQueue();
    paintChips(true);
  }
  function onBack(whole) {
    if (!typed) return;
    typed = whole ? '' : typed.slice(0, -1);
    if (!typed) target = null; else retarget();
    renderQueue();
    paintChips(true);
  }
  function submit() {
    if (!typed || !st || st.defeatedAt) return;
    // an exact match wins, so a stack word that starts an attack word still counts
    const exact = mech.find(m => m.word === typed);
    if (exact) target = exact;
    else if (typed === stack[0]) target = { stack: true };
    else if (gone.has(typed) && performance.now() - gone.get(typed) < 3000) {
      // an attack word that just left the row: clear it without spending the stack word
      typed = ''; target = null; clean = true;
      pop('TOO LATE', 'white');
      renderQueue(); paintChips(true);
      return;
    } else if (!target) retarget();
    sess.keys++;                      // the space
    const t = now();
    if (target && target.kind) {
      const m = target, ok = typed === m.word && t < m.due;
      if (!ok) misses.push({ typed, word: m.word, late: t >= m.due });
      typed = ''; target = null;
      if (ok) {
        sess.good++;
        combo = clean ? combo + 1 : 0; best = Math.max(best, combo);
        streak(t);
        mine.add(m.id);
        if (m.kind === 'block') {
          sess.blocks++;
          WorldBossNet.sendBlock(m.id, m.word);
          if (scene) scene.block(m.id);
          sfx('blockOk');
          pop('BLOCKED', 'cyan');
          pushFeed({ text: `You blocked the ${R.ATTACK_NAME[m.ev.kind]}`, cls: 'you' });
          milestone('blocks', sess.blocks);
        } else if (m.kind === 'return') {
          sess.returns++;
          WorldBossNet.sendReturn(m.id, m.word);
          if (scene) scene.returnShot(m.id);
          sfx('returned');
          pop('SENT BACK', 'cyan');
        } else if (m.kind === 'add') {
          sess.adds++;
          WorldBossNet.sendAddKill(m.id, m.word);
          if (scene) scene.killAdd(m.id, true);
          sfx('addKill');
        }
      } else {
        sess.missed++; combo = 0;
        TT.click(true);
      }
      clean = true;
      tick(); renderQueue(); paintYou();
      return;
    }
    const word = stack.shift();
    const ok = typed === word;
    if (ok) {
      sess.good++;
      sess.letters += word.length;
      sess.words++;
      combo = clean ? combo + 1 : 0;
      best = Math.max(best, combo);
      const crit = critLeft > 0;
      if (crit) critLeft--;
      WorldBossNet.sendDamage(word.length, { crit, jam: t < jamUntil });
      TT.click(true);
      streak(t);
      milestone('combo', combo);
      if (combo && combo % 5 === 0) WPM.track('combo', { n: combo, mode: 'boss' });
    } else {
      sess.missed++;
      combo = 0;
      misses.push({ typed, word });
    }
    hist.push({ word, ok });
    if (hist.length > 3) hist.shift();
    typed = ''; target = null; clean = true;
    if (stack.length < 40) stack.push(...TT.randomWords(60));
    renderQueue();
    paintYou();
  }
  // six quick words in a row stagger the boss and the next three hits crit
  function streak(t) {
    wordTimes.push(t);
    while (wordTimes.length && t - wordTimes[0] > STREAK_MS) wordTimes.shift();
    if (wordTimes.length >= STREAK_N && combo >= STREAK_N && t - staggerAt > STAGGER_CD) {
      staggerAt = t; critLeft = CRITS; wordTimes = [];
      if (scene) scene.stagger();
      sfx('stagger');
      pop('STAGGER', 'white');
      pushFeed({ text: `You staggered ${NAME}`, cls: 'you' });
      tip('stagger');
    }
  }

  function renderQueue() {
    const box = q('queue'); if (!box) return;
    const w = stack[0];
    const mineNow = !target || target.stack;
    const t = mineNow ? typed : '';
    let cur = '';
    for (let i = 0; i < Math.max(w.length, t.length); i++) {
      const a = t[i], c = w[i];
      if (a === undefined) cur += `<span class="c${i === t.length && mineNow ? ' at' : ''}">${esc(c)}</span>`;
      else if (c === undefined) cur += `<span class="c bad extra">${esc(a)}</span>`;
      else cur += `<span class="c ${a === c ? 'ok' : 'bad'}">${esc(c)}</span>`;
    }
    if (mineNow && t.length >= w.length) cur += '<span class="c at">&nbsp;</span>';
    // The current word sits alone on the first line and the word just typed fades
    // out beside it. The fade keeps its own clock since the page redraws on every key.
    const last = hist[hist.length - 1];
    let ghost = '';
    if (last) {
      if (!ghostAt.has(last)) { ghostAt.clear(); ghostAt.set(last, performance.now()); }
      const age = performance.now() - ghostAt.get(last);
      if (age < GHOST_MS) ghost = `<span class="bw done ${last.ok ? 'hit' : 'miss'}" style="animation-delay:-${Math.round(age)}ms">${esc(last.word)}</span>`;
    }
    box.innerHTML =
      `<div class="bq-line"><span class="bq-at">${ghost}<span class="bw cur${mineNow ? '' : ' wait'}" aria-current="${mineNow}">${cur}</span></span></div>` +
      `<div class="bq-next">${stack.slice(1, 13).map((x, i) => `<span class="bw next" style="opacity:${Math.max(0.35, 1 - i * 0.09).toFixed(2)}">${esc(x)}</span>`).join('')}</div>`;
    q('combo').textContent = combo;
    q('box').classList.toggle('locked', now() < lockUntil);
  }
  const GHOST_MS = 700, ghostAt = new Map();
  function lettersHtml(word, t, caret) {
    let s = '';
    for (let i = 0; i < word.length; i++) {
      const a = t[i], c = word[i];
      const ch = c === ' ' ? '&nbsp;' : esc(c);
      if (a === undefined) s += `<span class="c${caret && i === t.length ? ' at' : ''}">${ch}</span>`;
      else s += `<span class="c ${a === c ? 'ok' : 'bad'}">${ch}</span>`;
    }
    return s;
  }

  // ---------- attacks on the shared clock ----------
  function tick() {
    if (!el || !st) return;
    const t = now();
    const evs = R.eventsAt(st, t, 800);
    const list = [];
    for (const e of evs) {
      if (!sent.has(e.id)) {
        sent.add(e.id);
        if (scene) scene.event(e, t);
        if (e.type === 'slam') { sfx('windup', Math.min(2.5, (e.hit - t) / 1000)); tip(R.PHASES[st.phase].phrase ? 'phrase' : 'slam'); }
        if (e.type === 'volley') tip('volley');
        if (e.type === 'adds') tip('adds');
      }
      if (e.type === 'slam') {
        if (t < e.hit && !mine.has(e.id)) {
          list.push({ kind: 'block', id: e.id, word: e.word, due: e.hit, total: e.hit - e.start, ev: e });
          const left = Math.ceil((e.hit - t) / 1000);
          if (left <= 3 && warned[e.id] !== left) { warned[e.id] = left; sfx('warn'); }
        }
        if (t >= e.hit && !done.has(e.id)) {
          done.add(e.id);
          if (mine.has(e.id)) sfx('impact', true);
          else if (active()) {
            jamUntil = t + JAM_MS; combo = 0; sess.fails++;
            if (scene) scene.hurt();
            flashTint();
            sfx('blockFail');
            pop('HIT', 'red');
            pushFeed({ text: `The ${R.ATTACK_NAME[e.kind]} hit you and halved your damage for 5s`, cls: 'alert' });
          } else sfx('impact', false);
        }
      } else if (e.type === 'volley') {
        for (const s of e.shots) {
          if (t >= s.launch && t < s.arrive && !mine.has(s.id)) list.push({ kind: 'return', id: s.id, word: s.word, due: s.arrive, total: s.arrive - s.launch });
          if (t >= s.launch && !sent.has('l:' + s.id)) { sent.add('l:' + s.id); if (t < s.launch + 600) sfx('launch'); }
          if (t >= s.arrive && !done.has(s.id)) {
            done.add(s.id);
            if (!mine.has(s.id) && active()) {
              if (combo > 0) pushFeed({ text: 'A packet hit you and broke your combo', cls: 'alert' });
              combo = 0;
              if (scene) scene.hurt();
              sfx('projHit');
            }
          }
        }
      } else if (e.type === 'adds') {
        for (const a of e.adds) {
          const live = t >= a.spawn && t < a.until && !st.addsDown[a.id] && !mine.has(a.id);
          if (live) list.push({ kind: 'add', id: a.id, word: a.word, due: a.until, total: R.ADD_LIFE });
          if (st.addsDown[a.id] && !done.has('k:' + a.id)) { done.add('k:' + a.id); if (!mine.has(a.id) && scene) scene.killAdd(a.id, false); }
        }
      }
    }
    const order = { block: 0, return: 1, add: 2 };
    list.sort((a, b) => order[a.kind] - order[b.kind] || a.due - b.due);
    for (const m of mech) if (!list.some(x => x.id === m.id)) gone.set(m.word, performance.now());
    if (gone.size > 40) gone.clear();
    mech = list;
    if (target && target.kind && !mech.some(m => m.id === target.id)) { target = null; typed = ''; renderQueue(); }
    // weak point and shield
    const weak = R.weakMult(st, t) > 1 && !st.defeatedAt;
    if (weak !== weakWas) {
      weakWas = weak;
      if (scene) scene.setWeak(weak);
      if (weak) { sfx('weakOpen'); pop(`KERNEL OPEN x${st.weak.mult}`, 'amber'); tip(st.weak.mult > 2 ? 'weak3' : 'weak'); }
    }
    const wf = q('weak');
    wf.hidden = !weak;
    if (weak) {
      const html = `Kernel open x${st.weak.mult} <b>${Math.ceil((st.weak.until - t) / 1000)}s</b>`;
      if (wf.innerHTML !== html) wf.innerHTML = html;
    }
    if (now() >= lockUntil && q('box').classList.contains('locked')) renderQueue();
    paintChips(false);
    paintMe(t);
    paintTip(t);
  }

  function paintChips(force) {
    const row = q('chips'); if (!row || !st) return;
    const t = now();
    const show = mech.slice(0, 5);
    const key = show.map(m => m.id).join('|') + '#' + (target && target.kind ? target.id + ':' + typed : '');
    if (force || key !== mechKey) {
      mechKey = key;
      if (!show.length) {
        const nx = st.defeatedAt ? null : R.nextEventAt(st, t);
        row.innerHTML = nx ? `<span class="wb-next">Next attack in <b data-k="nexts">${Math.max(0, Math.ceil((nx - t) / 1000))}s</b></span>` : '';
      } else {
        row.innerHTML = show.map((m, i) => {
          const on = target && target.kind && target.id === m.id;
          return `<span class="wb-chip ${m.kind}${i === 0 ? ' first' : ''}${on ? ' on' : ''}" data-id="${esc(m.id)}">
            <small>${KIND[m.kind]}</small><span class="w">${lettersHtml(m.word, on ? typed : '', on)}</span>
            <i class="bar"><i></i></i><em class="secs"></em></span>`;
        }).join('') + (mech.length > 5 ? `<span class="wb-more">+${mech.length - 5}</span>` : '');
      }
      paintLabels();
    }
    if (!show.length) {
      const n = row.querySelector('[data-k="nexts"]');
      const nx = st.defeatedAt ? null : R.nextEventAt(st, t);
      if (n && nx) n.textContent = Math.max(0, Math.ceil((nx - t) / 1000)) + 's';
    }
    for (const m of show) {
      const c = row.querySelector(`[data-id="${CSS.escape(m.id)}"]`);
      if (!c) continue;
      const left = Math.max(0, m.due - t);
      c.querySelector('.bar i').style.width = (100 * left / m.total).toFixed(1) + '%';
      c.querySelector('.secs').textContent = (left / 1000).toFixed(left < 10000 ? 1 : 0) + 's';
      c.classList.toggle('late', m.kind !== 'add' && left < 1500);
    }
  }
  function paintMe(t) {
    const box = q('mestat'); if (!box) return;
    const bits = [];
    if (t < jamUntil) bits.push(`<span class="wb-flag jam">Damage halved <b>${Math.ceil((jamUntil - t) / 1000)}s</b></span>`);
    if (critLeft > 0) bits.push(`<span class="wb-flag crit">Crit x2 on the next <b>${critLeft}</b> ${critLeft === 1 ? 'hit' : 'hits'}</span>`);
    const html = bits.join('');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ---------- labels over the 3D scene ----------
  function paintLabels() {
    const layer = q('labels'); if (!layer) return;
    const want = new Map();
    const firstBlock = mech.find(m => m.kind === 'block');
    for (const m of mech) {
      if (m.kind === 'block' && m !== firstBlock) continue;
      want.set(m.id, m);
    }
    for (const [id, n] of labels) if (!want.has(id)) { n.remove(); labels.delete(id); }
    for (const [id, m] of want) {
      let n = labels.get(id);
      if (!n) {
        n = document.createElement('span');
        n.className = 'wb-label ' + m.kind;
        n.dataset.key = m.kind === 'block' ? 'head' : m.kind === 'return' ? 'shot:' + id : 'add:' + id;
        layer.append(n); labels.set(id, n);
      }
      const on = target && target.kind && target.id === id;
      const html = lettersHtml(m.word, on ? typed : '', on);
      if (n._h !== html) { n._h = html; n.innerHTML = html; n._w = 0; }
    }
  }
  const pt = { x: 0, y: 0 }, placed = [];
  function placeLabels() {
    if (!scene) return;
    placed.length = 0;
    if (!labels.size) return;
    const W = q('stage').clientWidth;
    for (const n of labels.values()) {
      const p = scene.screen(n.dataset.key, pt);
      if (!p) { n.style.visibility = 'hidden'; continue; }
      if (!n._w) { n._w = n.offsetWidth; n._hh = n.offsetHeight; }
      // labels sit above their anchor and step up past any label they would cover
      let x = Math.max(4, Math.min(W - n._w - 4, p.x - n._w / 2)), y = Math.max(4, p.y - n._hh * (n.classList.contains('block') ? 1 : 1.5));
      for (let k = 0; k < 4; k++) {
        const hit = placed.find(r => x < r.x + r.w + 4 && x + n._w + 4 > r.x && y < r.y + r.h + 3 && y + n._hh + 3 > r.y);
        if (!hit) break;
        y = hit.y - n._hh - 4;
      }
      placed.push({ x, y, w: n._w, h: n._hh });
      n.style.visibility = '';
      n.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  // ---------- state from the net ----------
  function onState(s, first) {
    if (!el) return;
    const wasDown = st && st.defeatedAt;
    st = s;
    const f = s.hp / s.maxHp;
    q('hp').innerHTML = `${fmt(Math.ceil(s.hp))}<small> / ${fmt(s.maxHp)} HP</small>`;
    q('fill').style.width = (100 * f) + '%';
    q('meter').setAttribute('aria-valuenow', Math.ceil(s.hp));
    q('left').textContent = (f > 0 && f < 0.01 ? (100 * f).toFixed(2) : (100 * f).toFixed(1)) + '%';
    const ph = s.phase || 0;
    q('state').textContent = s.defeatedAt ? 'Down' : R.PHASES[ph].name;
    q('state').dataset.s = s.defeatedAt ? 5 : ph + 1;
    q('phase').textContent = `Phase ${ph + 1} of ${R.PHASES.length}`;
    q('phase').dataset.p = ph;
    q('demo').hidden = !s.demo;
    el.querySelectorAll('[data-p]').forEach(b => { if (b.tagName === 'BUTTON') b.disabled = +b.dataset.p <= ph || !!s.defeatedAt; });
    // shield over the HP bar
    const sb = q('sbar'), sf = q('shield');
    if (s.shield) {
      sb.hidden = false; sb.style.width = (100 * f) + '%'; sb.style.setProperty('--s', s.shield.hp / s.shield.max);
      sf.hidden = false; sf.innerHTML = `Firewall <b>${fmt(s.shield.hp)}</b><small> / ${fmt(s.shield.max)}</small>`;
    } else { sb.hidden = true; sf.hidden = true; }
    if (scene) {
      scene.setFrac(f, first || lastStage < 0);
      scene.setShield(s.shield ? s.shield.hp / s.shield.max : null);
    }
    if (!!s.shield !== shieldWas) { shieldWas = !!s.shield; if (s.shield && !first) tip('shield'); }
    lastStage = [0.75, 0.5, 0.25, 0.1].filter(t => f <= t).length;
    if (ph !== lastPhase) {
      const fresh = lastPhase < 0 || first;
      if (!fresh && ph > lastPhase) transition(ph);
      else { if (scene) scene.setPhase(ph, true); }
      if (!s.defeatedAt) A.phase(ph);
      lastPhase = ph;
      sent = new Set(); done = new Set(); mine = new Set(); warned = {};
    }
    q('count').textContent = `${s.raiders.length} raiders`;
    paintBoard();
    paintYou();
    if (s.defeatedAt && !wasDown) down(first);
  }

  function transition(ph) {
    lockUntil = now() + LOCK_MS;
    if (target && target.kind) { typed = ''; target = null; }
    if (scene) scene.setPhase(ph, false);
    sfx('roar');
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'phase' }));
    const b = q('banner');
    b.hidden = false;
    b.innerHTML = `<div class="in"><small>Phase ${ph + 1} of ${R.PHASES.length}</small><b>${esc(R.PHASES[ph].name)}</b>${BANNER[ph] ? `<span>${esc(BANNER[ph])}</span>` : ''}</div>`;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, 2800);
    pushFeed({ sys: true, text: `Phase ${ph + 1}: ${R.PHASES[ph].name}` });
    renderQueue();
    setTimeout(renderQueue, LOCK_MS + 30);
  }

  function onHit(h) {
    if (!el) return;
    const t = performance.now();
    if (h.you) {
      sess.dmg += h.dmg;
      WPM.track('boss_hit', { dmg: h.dmg, kind: h.kind || 'word', crit: !!h.crit });
      if (h.kind === 'return') pushFeed({ text: `You sent back a packet for ${h.dmg}`, cls: 'you' });
      else if (h.kind === 'block') pushFeed({ text: `You hit back for ${h.dmg}`, cls: 'you' });
      else if (h.kind === 'add') pushFeed({ text: `You deleted a bug and hit for ${h.dmg}`, cls: 'you' });
      else pushFeed(h);
      if (scene) scene.hit(h); else onImpact(h, null, null);
      milestone('dmg', meDamage());
    } else {
      if (scene) scene.hit(h);
      others.push(h); if (others.length > 60) others.shift();
      if (t - lastOther > 900) { lastOther = t; pushFeed(others[Math.floor(Math.random() * others.length)]); others = []; }
    }
  }
  // a bolt landed: the number and the sound go where and when it hits
  function onImpact(h, x, y) {
    if (!el) return;
    if (h.you) {
      if (h.shield) sfx('shieldHit');
      else if (h.weak) sfx('weak');
      else if (h.crit || h.kind === 'block' || h.kind === 'return') sfx('crit');
      else sfx('hit', combo);
      number(h, x, y);
    } else {
      if (h.shield) sfx('shieldHit');
      else if (Math.random() < 0.3) sfx('raid');
      const t = performance.now();
      if (t - lastNum > 160) { lastNum = t; number(h, x, y); }
    }
  }

  function onEvent(e) {
    if (!el) return;
    if (e.type === 'shieldUp') { sfx('shieldUp'); pushFeed({ sys: true, text: `${NAME} put up a firewall` }); }
    if (e.type === 'shieldBreak') {
      sfx('shieldBreak'); pop('FIREWALL DOWN', 'cyan');
      pushFeed({ text: `${e.you ? 'You' : e.by} broke the firewall`, cls: e.you ? 'you' : 'shield' });
    }
    if (e.type === 'adds') { sfx('addSpawn'); pushFeed({ sys: true, text: `${NAME} spawned ${e.n} bugs` }); }
    if (e.type === 'addDown') pushFeed({ text: `${e.you ? 'You' : e.by} deleted a bug`, cls: e.you ? 'you' : 'add' });
    if (e.type === 'impact') {
      pushFeed({ text: `${e.blocks} of ${e.of} raiders blocked the ${R.ATTACK_NAME[e.kind]}${e.stun ? `. Kernel open for ${R.WEAK_MS / 1000}s` : ''}`, cls: e.stun ? 'shield' : 'alert' });
    }
    if (e.type === 'defeat') pushFeed({ sys: true, text: `${NAME} is down. Last hit by ${e.you ? 'you' : e.by}` });
  }

  function number(h, x, y) {
    const layer = q('nums'); if (!layer) return;
    if (x === null || x === undefined) {
      const stg = q('stage');
      x = stg.clientWidth * (0.42 + Math.random() * 0.16); y = stg.clientHeight * (0.35 + Math.random() * 0.2);
    }
    const s = document.createElement('span');
    const big = h.crit || h.weak || h.kind === 'block' || h.kind === 'return';
    s.className = 'dmg' + (h.you ? ' you' : '') + (h.you && big ? ' big' : '') + (h.shield ? ' sh' : '') + (h.kind === 'return' && h.you ? ' ret' : '');
    const tag = h.weak ? ` x${st && st.weak ? st.weak.mult : 2}` : h.crit ? ' crit' : '';
    s.textContent = '-' + h.dmg + (h.you ? tag : '');
    s.style.left = (x + (Math.random() - 0.5) * 70) + 'px';
    s.style.top = (y + (Math.random() - 0.5) * 44) + 'px';
    layer.append(s);
    while (layer.children.length > 28) layer.firstElementChild.remove();
    setTimeout(() => s.remove(), 1200);
  }
  let popT = 0;
  function pop(text, cls) {
    const p = q('pop'); if (!p) return;
    const t = performance.now();
    if (t - popT < 350) return;
    popT = t;
    p.className = 'wb-pop ' + cls;
    p.textContent = text;
    void p.offsetWidth; p.classList.add('go');
  }
  let tintT = 0;
  function flashTint() {
    const n = q('tint'); if (!n) return;
    const t = performance.now();
    if (t - tintT < 400) return;
    tintT = t;
    n.classList.remove('go'); void n.offsetWidth; n.classList.add('go');
  }
  function tip(id) {
    if (seenTips.has(id) || tipQ.includes(id)) return;
    tipQ.push(id);
  }
  function paintTip(t) {
    const n = q('tip'); if (!n) return;
    if (t < tipUntil) return;
    const id = tipQ.shift();
    if (!id) { if (n.textContent) { n.textContent = ''; n.classList.remove('on'); } return; }
    seenTips.add(id);
    try { localStorage.setItem('wpm-boss-tips', JSON.stringify([...seenTips])); } catch (e) {}
    n.textContent = TIPS[id];
    n.classList.add('on');
    tipUntil = t + 6500;
  }

  function meDamage() { const me = st && st.raiders.find(r => r.you); return me ? me.damage : 0; }
  function milestone(kind, v) {
    if (kind === 'dmg') {
      for (const m of DMG_MILESTONES) {
        const k = 'd' + m;
        if (v >= m * B.maxHp && !miles.has(k)) {
          miles.add(k);
          pushFeed({ text: `You've dealt ${+(m * 100).toFixed(2)}% of ${NAME}'s HP`, cls: 'mile' });
          sfx('milestone');
        }
      }
    } else if (kind === 'blocks') {
      if (BLOCK_MILESTONES.includes(v) && v > 1 && !miles.has('b' + v)) { miles.add('b' + v); pushFeed({ text: `You blocked ${v} attacks`, cls: 'mile' }); sfx('milestone'); }
    } else if (kind === 'combo') {
      if (COMBO_MILESTONES.includes(v) && !miles.has('c' + v)) { miles.add('c' + v); pushFeed({ text: `Combo ${v}`, cls: 'mile' }); sfx('milestone'); pop(`COMBO ${v}`, 'green'); }
    }
  }

  function pushFeed(h) {
    const t = new Date();
    feed.unshift({ ...h, time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    if (feed.length > 30) feed.length = 30;
    feedDirty = true;
  }
  function paintFeed(force) {
    if ((!feedDirty && force !== true) || !el) return;
    feedDirty = false;
    q('feed').innerHTML = feed.slice(0, 10).map(h => {
      const tm = `<span class="t">[${h.time}]</span> `;
      if (h.sys) return `<li class="sys">${tm}${esc(h.text)}</li>`;
      if (h.text) return `<li class="${h.cls || ''}">${tm}${esc(h.text)}</li>`;
      const tag = h.weak ? ` x${st && st.weak ? st.weak.mult : 2}` : h.crit ? ' crit' : '';
      return `<li class="${h.you ? 'you' : ''}">${tm}${esc(h.you ? 'You' : h.name)} hit ${h.shield ? 'the firewall ' : ''}for <b>${h.dmg}</b>${h.you ? tag : ''}</li>`;
    }).join('');
  }

  // a share is the part of all the raid's damage so far, so the whole board adds up to 100%
  function raidTotal() { return st.raiders.reduce((a, r) => a + r.damage, 0); }
  function rows(list, max, cols = 5) {
    const me = st.raiders.findIndex(r => r.you);
    const total = raidTotal();
    const top = list.slice(0, max).map((r, i) => [r, i]);
    if (me >= max) top.push(null, [st.raiders[me], me]);
    return top.map(x => {
      if (!x) return `<tr class="gap"><td colspan="${cols}">…</td></tr>`;
      const [r, i] = x;
      return `<tr class="${r.you ? 'you' : ''}"><td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td>
        <td class="who">${window.Avatar ? Avatar.img(r.you ? Avatar.mine() : Avatar.bot(r.name), 48, 20) : r.you ? `<img src="${UI.avatar(WPM.profile().avatar, 48)}" alt="" width="20" height="20">` : ''}${esc(r.name)}${r.you ? ' <span class="tag">You</span>' : ''}</td>
        <td class="r num">${fmt(r.damage)}</td><td class="r num dim">${fmt(r.blocks || 0)}</td><td class="r num dim">${share(r.damage, total)}</td></tr>`;
    }).join('');
  }
  function paintBoard() {
    q('board').innerHTML = rows(st.raiders, 10);
    // the corner board in the arena: the top three and you
    const me = st.raiders.findIndex(r => r.you);
    const list = st.raiders.slice(0, 3).map((r, i) => [r, i]);
    if (me >= 3) list.push([st.raiders[me], me]);
    q('mini').innerHTML = list.map(([r, i]) => `<li class="${i < 3 ? 'top' : ''}${r.you ? ' you' : ''}"><span class="r">${i + 1}</span><span class="n">${r.you ? 'You' : esc(r.name)}</span><b>${fmt(r.damage)}</b></li>`).join('');
  }
  // the scoreboard drawer: no argument toggles it
  function drawer(open) {
    const d = q('drawer'); if (!d) return;
    const on = open === undefined ? !d.classList.contains('open') : !!open;
    d.classList.toggle('open', on);
    d.inert = !on;
    q('boardbtn').setAttribute('aria-expanded', on);
    if (on) paintFeed(true);
  }

  function paintYou() {
    if (!st || !el) return;
    const i = st.raiders.findIndex(r => r.you);
    const me = st.raiders[i];
    const dmg = fmt(me ? me.damage : 0), ranked = me && me.damage;
    q('mydmg').textContent = dmg;
    q('rank').innerHTML = ranked ? `#${i + 1}<small> of ${st.raiders.length}</small>` : '-';
    const min = sess.active / 60000;
    const wpm = min > 0.05 ? Math.round(((sess.letters + sess.words) / 5) / min) : 0;
    q('wpm').textContent = wpm;
    q('acc').textContent = (sess.keys ? Math.round(100 * sess.good / sess.keys) : 100) + '%';
    q('blocks').textContent = sess.blocks;
    q('returns').textContent = sess.returns;
    q('adds').textContent = sess.adds;
    q('best').textContent = best;
    // the slim strip under the stack
    q('s-dmg').textContent = dmg;
    q('s-rank').textContent = ranked ? `#${i + 1}` : '-';
    q('s-of').textContent = ranked ? ` of ${st.raiders.length}` : ' rank';
    q('s-wpm').textContent = wpm;
    q('s-blocks').textContent = sess.blocks;
  }

  // ---------- defeat ----------
  function down(instant) {
    mech = []; target = null; typed = '';
    el.querySelector('.boss-type').classList.add('is-done');
    paintChips(true); renderQueue();
    for (const n of labels.values()) n.remove();
    labels.clear();
    if (scene) { scene.setWeak(false); scene.defeat(instant); }
    if (!instant) { sfx('defeat'); A.victory(); }
    else A.stop();
    if (!instant) document.dispatchEvent(new CustomEvent('buddy', { detail: 'boss-kill' }));
    clearTimeout(downTimer);
    downTimer = setTimeout(() => showResult(instant), instant ? 0 : 3200);
  }
  // The rewards are recorded when the result opens rather than at the kill, and
  // the block bonus follows a little later, so the site toasts don't all land at once.
  function showResult(instant) {
    if (!el) return;
    const r = record(true, true);
    const me = st.raiders.findIndex(x => x.you);
    const mineR = st.raiders[me];
    const mvp = st.raiders[0];
    const lastYou = !!(mineR && st.lastHit && st.lastHit === mineR.name);
    const who = (you, name) => (you ? 'You' : esc(name));
    let line = '';
    if (st.lastHit && mvp && (lastYou ? mvp.you : !mvp.you && st.lastHit === mvp.name)) {
      line = `${who(lastYou, st.lastHit)} landed the last hit and dealt the most damage with ${fmt(mvp.damage)}.`;
    } else {
      if (st.lastHit) line += `${who(lastYou, st.lastHit)} landed the last hit. `;
      if (mvp) line += `${who(mvp.you, mvp.name)} dealt the most damage with ${fmt(mvp.damage)}.`;
    }
    const box = q('down');
    box.hidden = false;
    q('stage').classList.add('is-down');
    const bonus = r ? r.bonus : 0;
    box.innerHTML = `
      <div class="boss-down-in" data-k="result">
        <h2>${esc(NAME)} is down</h2>
        <p class="wb-res-line">${line}</p>
        <div class="wb-res-main">
          <div><span>Your damage</span><b class="green">${fmt(mineR ? mineR.damage : 0)}</b></div>
          <div><span>Share</span><b>${share(mineR ? mineR.damage : 0, raidTotal())}</b></div>
          <div><span>Rank</span><b>#${me + 1}<small> of ${st.raiders.length}</small></b></div>
          ${r ? `<div><span>Coins</span><b class="gold">+${fmt(r.coins + bonus)}</b></div>
          <div><span>XP</span><b>+${fmt(r.xp + r.bonusXp)}</b></div>` : ''}
        </div>
        <div class="wb-res-more">
          <span><b>${sess.blocks}</b> blocked</span>
          <span><b>${sess.returns}</b> sent back</span>
          <span><b>${sess.adds}</b> bugs deleted</span>
          <span><b>${best}</b> best combo</span>
        </div>
        ${r && bonus ? `<p class="wb-bonus">Coins include ${[
          r.blockCoins ? `${r.blockCoins} for ${sess.blocks} ${sess.blocks === 1 ? 'block' : 'blocks'}` : '',
          r.killCoins ? `${r.killCoins} for being there at the end` : '',
        ].filter(Boolean).join(' and ')}.</p>` : ''}
        <table class="boss-board"><thead><tr><th>#</th><th>Raider</th><th class="r">Damage</th><th class="r">Blocks</th><th class="r">Share</th></tr></thead><tbody>${rows(st.raiders, 3)}</tbody></table>
      </div>`;
    if (instant) q('again').focus({ preventScroll: true });
    requestAnimationFrame(showWhole);
  }
  // The result and the New demo boss button below it must both be on screen.
  // If they aren't, the page scrolls the top of the fight, or the result itself
  // on a phone, to just under the site header.
  function showWhole() {
    if (!el) return;
    const res = q('result'), btn = q('over');
    if (!res || !btn) return;
    const head = document.querySelector('header.top');
    const hb = head ? head.getBoundingClientRect().bottom : 0;
    const top = res.getBoundingClientRect().top, bottom = btn.getBoundingClientRect().bottom;
    if (top >= hb && bottom <= innerHeight) return;
    const hp = Math.min(q('hpbox').getBoundingClientRect().top, q('stage').getBoundingClientRect().top);
    const to = bottom - (hp - hb - 8) <= innerHeight ? hp : top;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: scrollY + to - hb - 8, behavior: smooth ? 'smooth' : 'auto' });
  }
  function again() {
    clearTimeout(downTimer);
    if (st && st.defeatedAt && !recorded) record(true);
    const box = q('down');
    box.hidden = true; box.innerHTML = '';
    q('stage').classList.remove('is-down');
    el.querySelector('.boss-type').classList.remove('is-done');
    resetFight();
    if (scene) scene.revive();
    WorldBossNet.newBoss().then(s => onState(s, true));
    renderQueue();
    if (keys) keys.focus();
  }

  // One WPM.record per session: when the boss falls or when the player leaves.
  // Blocks earn 3 coins and 6 XP each (up to 60 coins) and being there at the end earns 20 coins.
  // With spaced set, the block bonus coins and XP follow 1.6s apart.
  let owed = [], owedT = [];
  function record(atKill, spaced) {
    if (recorded || !sess || !sess.keys) return null;
    recorded = true;
    const min = Math.max(sess.active, 1000) / 60000;
    const r = WPM.record({
      mode: 'world-boss',
      wpm: Math.round(((sess.letters + sess.words) / 5) / min),
      acc: Math.round(100 * sess.good / sess.keys),
      correct: sess.letters + sess.words,
      keys: sess.keys,
      ms: Math.round(Math.max(sess.active, 1000)),
      score: Math.round(sess.dmg || sess.letters),
    });
    if (atKill && sess.words > 0) WPM.track('boss_win', { dmg: Math.round(sess.dmg || 0) });
    r.blockCoins = Math.min(60, sess.blocks * 3);
    r.killCoins = atKill && sess.words > 0 ? 20 : 0;
    r.bonus = r.blockCoins + r.killCoins;
    r.bonusXp = sess.blocks * 6;
    const give = [];
    if (r.bonus) give.push(() => WPM.addCoins(r.bonus, 'world boss'));
    if (r.bonusXp) give.push(() => WPM.addXP(r.bonusXp));
    if (spaced) {
      give.forEach((f, i) => {
        owed.push(f);
        owedT.push(setTimeout(() => { owed = owed.filter(x => x !== f); f(); }, 1600 * (i + 1)));
      });
    } else give.forEach(f => f());
    if (!atKill && window.Toast) Toast('t-level', `${UI.icon('bolt', 'green')}<span>World boss: <b>${fmt(sess.dmg || sess.letters)}</b> damage, <b>+${r.xp + r.bonusXp}</b> XP</span>`, 4500);
    return r;
  }
  // pays a bonus still waiting on its timer, when the page goes away first
  function payOwed() {
    owedT.forEach(clearTimeout); owedT = [];
    const list = owed; owed = [];
    list.forEach(f => f());
  }

  function debugHook() {
    window._wb = {
      state: () => st,
      phase: () => st && st.phase,
      mech: () => mech.map(m => ({ kind: m.kind, id: m.id, word: m.word, due: m.due - now() })),
      stack: () => stack[0],
      typed: () => typed,
      me: () => ({ ...sess, combo, best, critLeft, jam: Math.max(0, jamUntil - now()), lock: Math.max(0, lockUntil - now()) }),
      scene: () => scene && scene.info(),
      events: () => (st ? R.eventsAt(st, now()) : []),
      next: () => (st ? R.nextEventAt(st, now()) - now() : null),
      setFrac: f => { const d = WorldBossNet.demo(); if (d) d.setFrac(f); },
      jump: p => { const d = WorldBossNet.demo(); if (d) d.jumpTo(p); },
      simScale: x => { const d = WorldBossNet.demo(); if (d) d.simScale(x); },
      renderFx: (n, a, s) => A.renderFx(n, a, s),
      feed: () => feed.slice(0, 12).map(f => f.text || `${f.name} hit for ${f.dmg}`),
      misses: () => misses.slice(-20),
    };
  }

  function unmount() {
    record(!!(st && st.defeatedAt));
    payOwed();
    offs.forEach(f => f()); offs = [];
    timers.forEach(clearInterval); timers = [];
    clearTimeout(downTimer);
    WorldBossNet.disconnect();
    A.stop();
    if (scene) scene.dispose();
    labels.clear();
    delete window._wb;
    scene = null; keys = null; el = null; st = null;
  }

  return { title: 'World boss', mount, unmount };
})());
