// #/boss: the world boss. Every correctly typed word deals one point of damage
// per letter. The fight runs through window.WorldBossNet (LocalDemo for now).
Router.register('boss', (() => {
  const STATES = [[0.1, 'Core critical'], [0.25, 'Core exposed'], [0.5, 'Rings broken'], [0.75, 'Shell cracked'], [1, 'Shell intact']];
  const stateName = f => f <= 0 ? 'Down' : STATES.find(([t]) => f <= t)[1];

  let el, scene, offs = [], timers = [], keys = null;
  let st = null;                 // last state from the net
  let stack = [], hist = [], typed = '', clean = true, combo = 0, best = 0;
  let sess = null, recorded = false, feed = [], others = [], lastOther = 0, lastNum = 0, lastStage = -1;

  const q = k => el && el.querySelector(`[data-k="${k}"]`);
  const fmt = UI.fmt;
  const pct = (a, b) => b ? (100 * a / b) : 0;

  function newSession() { sess = { keys: 0, good: 0, letters: 0, words: 0, missed: 0, first: 0, last: 0, active: 0 }; recorded = false; }

  function mount(root) {
    el = root;
    newSession();
    feed = []; hist = []; typed = ''; combo = 0; best = 0; clean = true; lastStage = -1;
    stack = TT.randomWords(80);
    el.innerHTML = `
      <div class="boss-top">
        <div class="title-block"><h1><span class="pre">&gt;</span>World boss_</h1><p>// OVERFLOW · ${fmt(WorldBossNet.MAX_HP)} HP</p></div>
        <p class="boss-demo" role="note">DEMO: other raiders are simulated until the server is live.</p>
      </div>
      <div class="boss-grid">
        <div class="boss-main">
          <section class="panel hot boss-hpbox" aria-label="Boss HP">
            <div class="boss-hp-row">
              <span class="label">&gt; OVERFLOW</span>
              <b class="num" data-k="hp">0 / 0 HP</b>
            </div>
            <div class="boss-bar" role="meter" aria-label="Boss HP" aria-valuemin="0" aria-valuemax="${WorldBossNet.MAX_HP}" data-k="meter">
              <i data-k="fill"></i><s style="left:75%"></s><s style="left:50%"></s><s style="left:25%"></s><s style="left:10%"></s>
            </div>
            <div class="boss-hp-sub">
              <span><b data-k="left">0%</b> left</span>
              <span><b data-k="dealt">0</b> letters dealt</span>
              <span class="boss-state" data-k="state">Shell intact</span>
            </div>
          </section>
          <section class="panel boss-stage" data-k="stage" aria-label="The boss">
            <div class="kb-loading" data-k="loading">Loading</div>
            <div class="dmg-layer" data-k="nums" aria-hidden="true"></div>
            <div class="boss-down" data-k="down" hidden></div>
          </section>
          <section class="panel hot boss-type" aria-label="Your word stack">
            <div class="ph">&gt; YOUR WORD STACK<span class="meta" data-k="combo">COMBO 0</span></div>
            <div class="typebox boss-words" data-k="box" tabindex="-1">
              <div class="boss-queue" data-k="queue"></div>
              <div class="focus-note">CLICK HERE OR PRESS ANY KEY TO TYPE</div>
            </div>
            <p class="type-help">Type the highlighted word and press <kbd>Space</kbd>. Each correct word deals one damage per letter.</p>
          </section>
        </div>
        <aside class="boss-side">
          <section class="panel boss-you">
            <div class="ph">// YOU</div>
            <div class="boss-you-grid">
              <div><span class="label">Your damage</span><b class="mid green" data-k="mydmg">0</b></div>
              <div><span class="label">Rank</span><b class="mid" data-k="rank">-</b></div>
              <div><span class="label">WPM</span><b class="mid" data-k="wpm">0</b></div>
              <div><span class="label">Accuracy</span><b class="mid" data-k="acc">100%</b></div>
            </div>
          </section>
          <section class="panel">
            <div class="ph">// DAMAGE SCOREBOARD<span class="meta" data-k="count"></span></div>
            <table class="boss-board"><thead><tr><th>#</th><th>Raider</th><th class="r">Damage</th><th class="r">Share</th></tr></thead><tbody data-k="board"></tbody></table>
          </section>
          <section class="panel">
            <div class="ph">// LIVE FEED</div>
            <ol class="boss-feed" data-k="feed"></ol>
          </section>
        </aside>
      </div>`;

    renderQueue();
    scene = BossScene.mount(q('stage'));
    scene.ready.then(ok => { const l = q('loading'); if (ok && l) l.remove(); })
      .catch(() => { const l = q('loading'); if (l) l.textContent = 'The boss needs an internet connection to draw.'; });

    offs.push(WorldBossNet.onState(onState));
    offs.push(WorldBossNet.onHit(onHit));
    WorldBossNet.connect({ id: 'you', name: WPM.profile().name }).then(s => { onState(s, true); });

    const box = q('box');
    keys = TT.captureKeys(box, {
      label: 'Type the words to attack the boss',
      onChar, onBack,
      onKey(k) { if (k === 'Enter') submit(); },
    });
    if (matchMedia('(pointer: fine)').matches) keys.focus();
    const forward = e => {
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'view') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      keys.focus();
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    };
    document.addEventListener('keydown', forward);
    offs.push(() => document.removeEventListener('keydown', forward));
    const leave = () => record(false);
    addEventListener('pagehide', leave);
    offs.push(() => removeEventListener('pagehide', leave));
    timers.push(setInterval(paintFeed, 300));
  }

  // ---------- typing ----------
  function onChar(ch) {
    if (!st || st.defeatedAt) return;
    const now = performance.now();
    if (!sess.first) sess.first = now;
    else if (now - sess.last < 5000) sess.active += now - sess.last;
    sess.last = now;
    if (ch === ' ') { if (typed) submit(); return; }
    sess.keys++;
    const word = stack[0];
    if (typed.length < word.length && ch === word[typed.length]) sess.good++;
    else clean = false;
    typed += ch;
    TT.click(false);
    renderQueue();
  }
  function onBack(whole) {
    if (!typed) return;
    typed = whole ? '' : typed.slice(0, -1);
    renderQueue();
  }
  function submit() {
    if (!typed || !st || st.defeatedAt) return;
    const word = stack.shift();
    sess.keys++;                      // the space
    const ok = typed === word;
    if (ok) {
      sess.good++;
      sess.letters += word.length;
      sess.words++;
      combo = clean ? combo + 1 : 0;
      best = Math.max(best, combo);
      WorldBossNet.sendDamage(word.length);
      TT.click(true);
    } else {
      sess.missed++;
      combo = 0;
    }
    hist.push({ word, ok });
    if (hist.length > 3) hist.shift();
    typed = ''; clean = true;
    if (stack.length < 40) stack.push(...TT.randomWords(60));
    renderQueue();
    paintYou();
  }

  function renderQueue() {
    const box = q('queue'); if (!box) return;
    const e = UI.esc;
    const w = stack[0];
    let cur = '';
    for (let i = 0; i < Math.max(w.length, typed.length); i++) {
      const t = typed[i], c = w[i];
      if (t === undefined) cur += `<span class="c${i === typed.length ? ' at' : ''}">${e(c)}</span>`;
      else if (c === undefined) cur += `<span class="c bad extra">${e(t)}</span>`;
      else cur += `<span class="c ${t === c ? 'ok' : 'bad'}">${e(c)}</span>`;
    }
    if (typed.length >= w.length) cur += '<span class="c at">&nbsp;</span>';
    box.innerHTML =
      hist.map(h => `<span class="bw done ${h.ok ? 'hit' : 'miss'}">${e(h.word)}${h.ok ? `<small>-${h.word.length}</small>` : ''}</span>`).join('') +
      `<span class="bw cur" aria-current="true">${cur}</span>` +
      stack.slice(1, 13).map((x, i) => `<span class="bw next" style="opacity:${Math.max(0.3, 1 - i * 0.06).toFixed(2)}">${e(x)}</span>`).join('');
    q('combo').textContent = `COMBO ${combo}${best > 1 ? ` · BEST ${best}` : ''}`;
  }

  // ---------- state from the net ----------
  function onState(s, first) {
    if (!el) return;
    const wasDown = st && st.defeatedAt;
    st = s;
    const f = s.hp / s.maxHp;
    q('hp').textContent = `${fmt(s.hp)} / ${fmt(s.maxHp)} HP`;
    q('fill').style.width = (100 * f) + '%';
    q('meter').setAttribute('aria-valuenow', s.hp);
    q('left').textContent = (f > 0 && f < 0.01 ? (100 * f).toFixed(2) : (100 * f).toFixed(1)) + '%';
    q('dealt').textContent = fmt(s.dealt);
    q('state').textContent = stateName(f);
    q('state').dataset.s = STATES.length - STATES.findIndex(([t]) => f <= t);
    const stg = [0.75, 0.5, 0.25, 0.1].filter(t => f <= t).length;
    if (scene) {
      scene.setFrac(f, first || lastStage < 0);
      if (lastStage >= 0 && stg > lastStage) pushFeed({ sys: true, text: `Overflow: ${stateName(f).toLowerCase()}` });
    }
    lastStage = stg;
    q('count').textContent = `${s.raiders.length} RAIDERS`;
    paintBoard();
    paintYou();
    if (s.defeatedAt && !wasDown) down(first);
  }

  function onHit(h) {
    if (!el) return;
    const now = performance.now();
    if (h.you) {
      pushFeed(h);
      scene && scene.hit(h.letters, true);
      number(h.letters, true);
    } else {
      scene && scene.hit(h.letters, false);
      if (now - lastNum > 140) { lastNum = now; number(h.letters, false); }
      others.push(h); if (others.length > 60) others.shift();
      if (now - lastOther > 700) { lastOther = now; pushFeed(others[Math.floor(Math.random() * others.length)]); others = []; }
    }
  }

  function number(n, you) {
    const layer = q('nums'); if (!layer || !scene) return;
    const p = scene.point(); if (!p) return;
    const s = document.createElement('span');
    s.className = 'dmg' + (you ? ' you' : '');
    s.textContent = '-' + n;
    s.style.left = (p.x + (Math.random() - 0.5) * 30) + 'px';
    s.style.top = (p.y + (Math.random() - 0.5) * 20) + 'px';
    layer.append(s);
    while (layer.children.length > 28) layer.firstElementChild.remove();
    setTimeout(() => s.remove(), 1200);
  }

  function pushFeed(h) {
    const t = new Date();
    feed.unshift({ ...h, time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    if (feed.length > 30) feed.length = 30;
    feedDirty = true;
  }
  let feedDirty = false;
  function paintFeed() {
    if (!feedDirty || !el) return;
    feedDirty = false;
    q('feed').innerHTML = feed.slice(0, 9).map(h => h.sys
      ? `<li class="sys"><span class="t">[${h.time}]</span> ${UI.esc(h.text)}</li>`
      : `<li class="${h.you ? 'you' : ''}"><span class="t">[${h.time}]</span> ${UI.esc(h.name)} hit for <b>${h.letters}</b></li>`).join('');
  }

  function rows(list, max) {
    const me = st.raiders.findIndex(r => r.you);
    const top = list.slice(0, max).map((r, i) => [r, i]);
    if (me >= max) top.push(null, [st.raiders[me], me]);
    return top.map(x => {
      if (!x) return `<tr class="gap"><td colspan="4">…</td></tr>`;
      const [r, i] = x;
      return `<tr class="${r.you ? 'you' : ''}"><td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td>
        <td class="who">${r.you ? `<img src="${UI.avatar(WPM.profile().avatar, 48)}" alt="" width="20" height="20">` : ''}${UI.esc(r.name)}${r.you ? ' <span class="tag">You</span>' : ''}</td>
        <td class="r num">${fmt(r.damage)}</td><td class="r num dim">${pct(r.damage, st.maxHp).toFixed(2)}%</td></tr>`;
    }).join('');
  }
  function paintBoard() { q('board').innerHTML = rows(st.raiders, 10); }

  function paintYou() {
    if (!st || !el) return;
    const i = st.raiders.findIndex(r => r.you);
    const me = st.raiders[i];
    q('mydmg').textContent = fmt(me ? me.damage : 0);
    q('rank').innerHTML = me && me.damage ? `#${i + 1}<small class="dim"> / ${st.raiders.length}</small>` : '-';
    const min = sess.active / 60000;
    q('wpm').textContent = min > 0.05 ? Math.round(((sess.letters + sess.words) / 5) / min) : 0;
    q('acc').textContent = (sess.keys ? Math.round(100 * sess.good / sess.keys) : 100) + '%';
  }

  // ---------- defeat ----------
  function down(instant) {
    if (scene) scene.defeat();
    const r = record(true);
    const me = st.raiders.findIndex(x => x.you);
    const mine = st.raiders[me];
    const box = q('down');
    box.hidden = false;
    q('stage').classList.add('is-down');
    box.innerHTML = `
      <div class="panel hot boss-down-in">
        <h2>&gt; Overflow is down</h2>
        <p class="dim">Final hit by ${UI.esc(st.lastHit || 'a raider')}. ${fmt(st.maxHp)} letters in total from ${st.raiders.length} raiders.</p>
        <div class="boss-share">
          <div><span class="label">Your damage</span><b class="mid green">${fmt(mine ? mine.damage : 0)}</b></div>
          <div><span class="label">Your share</span><b class="mid">${pct(mine ? mine.damage : 0, st.maxHp).toFixed(2)}%</b></div>
          <div><span class="label">Your rank</span><b class="mid">#${me + 1}</b></div>
          ${r ? `<div><span class="label">Earned</span><b class="mid gold">+${r.coins}</b><span class="dim">coins, +${r.xp} XP</span></div>` : ''}
        </div>
        <table class="boss-board">${rows(st.raiders, 3)}</table>
        <button class="btn" type="button" data-k="again">New demo boss</button>
      </div>`;
    q('again').addEventListener('click', () => {
      box.hidden = true; box.innerHTML = '';
      q('stage').classList.remove('is-down');
      newSession(); combo = 0; best = 0; hist = []; typed = ''; lastStage = -1;
      if (scene) scene.revive();
      WorldBossNet.newBoss().then(s => onState(s, true));
      renderQueue();
      if (keys) keys.focus();
    });
    if (instant) q('again').focus({ preventScroll: true });
  }

  // One WPM.record per session: when the boss falls or when the player leaves.
  function record(quiet) {
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
      score: sess.letters,
    });
    if (!quiet && window.Toast) Toast('t-level', `${UI.icon('bolt', 'green')}<span>World boss: <b>${fmt(sess.letters)}</b> damage, <b>+${r.xp}</b> XP</span>`, 4500);
    return r;
  }

  function unmount() {
    record(false);
    offs.forEach(f => f()); offs = [];
    timers.forEach(clearInterval); timers = [];
    WorldBossNet.disconnect();
    if (scene) scene.dispose();
    scene = null; keys = null; el = null; st = null;
  }

  return { title: 'World boss', mount, unmount };
})());
