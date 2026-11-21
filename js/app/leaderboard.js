// #/leaderboard: Art's real record and this device's runs, one tab per mode.
// The global board needs the server so nothing here comes from other players.
Router.register('leaderboard', (() => {
  const TABS = [
    { id: '60', name: '60s', modes: ['time-60'], art: true },
    { id: '30', name: '30s', modes: ['time-30'], art: true },
    { id: '15', name: '15s', modes: ['time-15'], art: true },
    { id: '120', name: '120s', modes: ['time-120'], art: true },
    { id: 'words', name: 'Words', modes: ['words-25', 'words-50', 'words-100'], art: true },
    { id: 'quote', name: 'Quote', modes: ['quote', 'custom'], art: true },
    { id: 'breach', name: 'Breach', modes: ['horde-1', 'horde-2', 'horde-3', 'horde-4', 'horde-5'], score: true },
    { id: 'race', name: 'Race', modes: ['race-art', 'race-best', 'race-duo'], art: true },
    { id: 'boss', name: 'World boss', modes: ['world-boss'], score: true, label: 'Damage' },
    { id: 'endless', name: 'Breach endless', custom: true },
    { id: 'rush', name: 'Boss rush', custom: true },
    { id: 'rooms', name: 'Rooms', custom: true },
  ];
  const LOGO = `<svg class="green" viewBox="0 0 64 64" style="width:34px;height:34px;border:1px solid var(--line);padding:3px;background:var(--bg)" aria-hidden="true"><use href="#i-logo"/></svg>`;
  let el, tab = '60', chapter = 0, diff = 'all', endKind = 'endless', off = [], poll = 0;
  const DIFFS = [['all', 'All'], ['easy', 'Easy x0.6'], ['normal', 'Normal x1.0'], ['hard', 'Hard x1.5']];
  const diffSeg = (cur, opts = DIFFS) => `<div class="seg" style="margin-bottom:10px" role="group" aria-label="Difficulty">${opts.map(([k, n]) => `<button type="button" data-d="${k}" aria-pressed="${k === cur}">${n}</button>`).join('')}</div>`;
  // runs saved before difficulty existed count as Normal
  const diffOf = s => s.difficulty || 'normal';

  function mount(root) {
    el = root;
    tab = TT.store.get('wpm-lb-tab', '60');
    const st = WPM.stats();
    const today = UI.day();
    const todayRuns = WPM.sessions().filter(s => s.at && UI.day(new Date(s.at)) === today).length;
    el.innerHTML = `
      <div class="lb-head">
        <div class="title-block">
          <h1><span class="pre">&gt;</span>Leaderboard</h1>
          <p>// ART'S RECORD AND THE RUNS ON THIS DEVICE</p>
        </div>
        <aside class="panel">
          <div class="ph">[ GLOBAL BOARD ]</div>
          <p class="dim" style="margin-bottom:12px">The global board goes live with the server. Until then this board shows Art's record and the runs on this device.</p>
          <div class="status-list">
            <div><i></i><span>Runs on this device</span><b>${UI.fmt(st.sessions)}</b></div>
            <div><i class="off"></i><span>Global board</span><b>Offline</b></div>
          </div>
        </aside>
      </div>
      <div class="lb">
        <div class="lb-side">
          <div class="panel">
            <div class="ph">// ART</div>
            <div class="stat"><span class="label">Top speed</span><b class="mid">${TT.ART_WPM} <small class="dim">WPM</small></b><span class="dim">Highest score on screen in his reels</span></div>
            <div class="stat"><span class="label">Followers</span><b class="mid">25.5K</b></div>
          </div>
          <div class="panel">
            <div class="ph">// THIS DEVICE</div>
            <div class="stat"><span class="label">Best wpm</span><b class="mid">${st.bestWpm || 0}</b></div>
            <div class="stat"><span class="label">Runs today</span><b class="mid">${todayRuns}</b></div>
            <div class="stat"><span class="label">Best accuracy</span><b class="mid">${st.bestAcc || 0}%</b></div>
          </div>
        </div>
        <section class="panel hot" aria-label="Board">
          <div class="lb-tabs seg" role="tablist" aria-label="Mode">
            ${TABS.map(t => `<button type="button" role="tab" data-t="${t.id}">${t.name}</button>`).join('')}
          </div>
          <div data-sub></div>
          <div class="board-wrap" data-board></div>
        </section>
      </div>`;
    el.querySelector('.lb-tabs').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      tab = b.dataset.t; chapter = 0;
      TT.store.set('wpm-lb-tab', tab);
      paint();
    });
    off.push(WPM.on('session', paint));
    paint();
  }

  function paint() {
    if (!el) return;
    const T = TABS.find(t => t.id === tab) || TABS[0];
    el.querySelectorAll('.lb-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === T.id));
    const sub = el.querySelector('[data-sub]');
    clearInterval(poll); poll = 0;
    if (T.id === 'rooms') return rooms(sub, el.querySelector('[data-board]'));
    if (T.id === 'endless') return endless(sub, el.querySelector('[data-board]'));
    if (T.id === 'rush') { if (window.RushBoard) RushBoard.render(sub, el.querySelector('[data-board]')); return; }
    if (T.id === 'boss') {
      const runs = WPM.sessions().filter(s => s.mode === 'world-boss');
      const total = runs.reduce((a, s) => a + (s.score || 0), 0);
      const bestD = runs.reduce((a, s) => Math.max(a, s.score || 0), 0);
      sub.innerHTML = `<div class="lb-boss"><div><span class="label">Best damage in one session</span><b class="mid">${UI.fmt(bestD)}</b></div>
        <div><span class="label">Total damage</span><b class="mid">${UI.fmt(total)}</b></div>
        <div><span class="label">Sessions</span><b class="mid">${runs.length}</b></div></div>`;
    } else sub.innerHTML = T.id === 'breach'
      ? `<div class="seg" style="margin-bottom:10px" role="group" aria-label="Chapter">${[0, 1, 2, 3, 4, 5].map(c => `<button type="button" data-c="${c}" aria-pressed="${c === chapter}">${c ? 'Ch. ' + c : 'All chapters'}</button>`).join('')}</div>${diffSeg(diff)}`
      : '';
    sub.querySelectorAll('button[data-c]').forEach(b => b.addEventListener('click', () => { chapter = +b.dataset.c; paint(); }));
    sub.querySelectorAll('button[data-d]').forEach(b => b.addEventListener('click', () => { diff = b.dataset.d; paint(); }));

    const modes = T.id === 'breach' && chapter ? [`horde-${chapter}`] : T.modes;
    const metric = s => T.score ? (s.score || 0) : (s.wpm || 0);
    const p = WPM.profile();
    const runs = WPM.sessions().filter(s => modes.includes(s.mode) && (T.id !== 'breach' || diff === 'all' || diffOf(s) === diff)).sort((a, b) => metric(b) - metric(a)).slice(0, 20)
      .map(s => ({ kind: 'me', s, v: metric(s) }));
    const rows = [...runs];
    if (T.art) rows.push({ kind: 'art', v: TT.ART_WPM });
    rows.sort((a, b) => b.v - a.v);
    const bestMine = runs[0];

    const cell = r => {
      if (r.kind === 'art') {
        return `<td class="who-td"><div class="who">${LOGO}<span>Art</span><span class="tag">@10000wpm</span></div></td>
          <td class="w num-col">${TT.ART_WPM}</td><td class="n num-col hide-sm">n/a</td>
          <td class="hide-sm">From his reels</td><td class="n hide-sm">Instagram</td>`;
      }
      const s = r.s;
      const extra = s.mode.startsWith('race') && s.won !== undefined ? (s.won ? ', won' : ', lost') : s.mode.startsWith('horde') && s.cleared ? ', cleared' : '';
      return `<td class="who-td"><div class="who">${UI.meImg(68, 34)}<span>${UI.esc(p.name)}</span><span class="tag" style="color:var(--green);border-color:var(--line)">You</span></div></td>
        <td class="w num-col">${UI.fmt(r.v)}</td><td class="n num-col hide-sm">${s.acc != null ? s.acc + '%' : ''}</td>
        <td class="hide-sm">${UI.esc(UI.modeName(s.mode, s.mode.startsWith('horde') ? diffOf(s) : null) + extra)}</td><td class="n hide-sm">${UI.esc(UI.date(s.at))}</td>`;
    };
    el.querySelector('[data-board]').innerHTML = `
      <table class="board">
        <thead><tr><th>#</th><th>Typist</th><th class="num-col">${T.label || (T.score ? 'Score' : 'WPM')}</th><th class="num-col hide-sm">Accuracy</th><th class="hide-sm">Mode</th><th class="hide-sm">Date</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${r.kind === 'art' ? 'art' : r === bestMine ? 'mine-best' : ''}">
          <td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td>${cell(r)}</tr>`).join('')}</tbody>
      </table>
      ${runs.length ? '' : `<p class="empty">No runs in this mode yet. ${T.id === 'boss' ? '<a class="green" href="#/boss">Attack the world boss</a>' : T.id === 'breach' ? '<a class="green" href="#/play/breach">Play Breach</a>' : T.id === 'race' ? '<a class="green" href="#/play/race">Start a race</a>' : '<a class="green" href="#/type">Take a typing test</a>'} to get on the board.</p>`}`;
  }

  // Waits for another agent's script to finish loading, then draws.
  function when(test, draw, board) {
    if (test()) return draw();
    board.innerHTML = '<div class="loading-state">Loading</div>';
    let n = 0;
    poll = setInterval(() => {
      if (test()) { clearInterval(poll); poll = 0; draw(); }
      else if (++n > 40) { clearInterval(poll); poll = 0; draw(); }
    }, 250);
  }

  function rooms(sub, board) {
    sub.innerHTML = '<p class="dim lb-note">Rooms from other players show here once the server is live.</p>';
    when(() => window.Room && typeof window.Room.summary === 'function' && window.RoomItems, () => {
      if (!el) return;
      let r = null;
      try { r = window.Room && window.Room.summary ? window.Room.summary() : null; } catch (e) { console.warn(e); }
      if (!r) { board.innerHTML = '<p class="empty">My Room did not load.</p>'; return; }
      const p = WPM.profile();
      // a floor plan drawn to scale against the largest room size
      const k = 34 / 8;
      const plan = `<svg class="room-plan" viewBox="0 0 40 34" aria-hidden="true"><rect x="${(40 - r.w * k) / 2}" y="${(34 - r.d * k) / 2}" width="${r.w * k}" height="${r.d * k}" fill="rgba(57,255,136,.12)" stroke="#39ff88" stroke-width="1"/></svg>`;
      board.innerHTML = `
        <table class="board">
          <thead><tr><th>#</th><th>Owner</th><th>Room</th><th class="num-col">Floor</th><th class="num-col hide-sm">Items placed</th><th class="num-col">Value</th></tr></thead>
          <tbody><tr class="mine-best">
            <td class="rank top">1</td>
            <td><div class="who">${UI.meImg(68, 34)}<span>${UI.esc(p.name)}</span><span class="tag" style="color:var(--green);border-color:var(--line)">You</span></div></td>
            <td><div class="who">${plan}<span>Size ${UI.esc(r.label)}<span class="hide-sm">, ${r.w} × ${r.d} m</span></span></div></td>
            <td class="n num-col">${r.area} m²</td>
            <td class="n num-col hide-sm">${UI.fmt(r.items)}</td>
            <td class="num-col"><span class="price">${UI.coin()}${UI.fmt(r.value)}</span></td>
          </tr></tbody>
        </table>
        <p class="empty"><a class="green" href="#/room">Open My Room</a> to add items or change its size.</p>`;
    }, board);
  }

  function endless(sub, board) {
    const d = diff === 'all' ? 'normal' : diff;
    sub.innerHTML = `<div class="seg" style="margin-bottom:10px" role="group" aria-label="Run type">${[['endless', 'Endless'], ['daily', 'Daily run']].map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${k === endKind}">${n}</button>`).join('')}</div>${diffSeg(d, DIFFS.slice(1))}`;
    sub.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => { endKind = b.dataset.k; paint(); }));
    sub.querySelectorAll('button[data-d]').forEach(b => b.addEventListener('click', () => { diff = b.dataset.d; paint(); }));
    const has = () => window.Breach && typeof window.Breach.endlessScores === 'function';
    when(has, () => {
      if (!el) return;
      let list = [];
      try {
        if (has()) list = endKind === 'daily'
          ? Object.values((window.Breach.dailyScores && window.Breach.dailyScores(d)) || {})
          : (window.Breach.endlessScores(d) || []);
      } catch (e) { console.warn(e); }
      list = list.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
      const p = WPM.profile();
      board.innerHTML = list.length ? `
        <table class="board">
          <thead><tr><th>#</th><th>Typist</th><th class="num-col">Score</th><th class="num-col">Level</th><th class="num-col hide-sm">WPM</th><th class="hide-sm">Date</th></tr></thead>
          <tbody>${list.map((r, i) => `<tr class="${i === 0 ? 'mine-best' : ''}">
            <td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td>
            <td><div class="who">${UI.meImg(68, 34)}<span>${UI.esc(p.name)}</span></div></td>
            <td class="w num-col">${UI.fmt(r.score)}</td><td class="n num-col">${UI.fmt(r.level)}</td>
            <td class="n num-col hide-sm">${r.wpm != null ? UI.fmt(r.wpm) : ''}</td><td class="n hide-sm">${UI.esc(UI.date(/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date + 'T12:00' : r.date, false))}</td></tr>`).join('')}</tbody>
        </table>`
        : `<p class="empty">No ${endKind === 'daily' ? 'daily' : 'endless'} runs on ${d === 'easy' ? 'Easy' : d === 'hard' ? 'Hard' : 'Normal'} on this device yet. <a class="green" href="#/play/breach">Play Breach</a> and pick ${endKind === 'daily' ? 'Daily run' : 'Endless'} to get on the board.</p>`;
    }, board);
  }

  function unmount() { clearInterval(poll); poll = 0; off.forEach(f => f()); off = []; el = null; }

  return { title: 'Leaderboard', mount, unmount };
})());
