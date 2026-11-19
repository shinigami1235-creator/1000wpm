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
  ];
  const LOGO = `<svg class="green" viewBox="0 0 64 64" style="width:34px;height:34px;border:1px solid var(--line);padding:3px;background:var(--bg)" aria-hidden="true"><use href="#i-logo"/></svg>`;
  let el, tab = '60', chapter = 0, off = [];

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
    sub.innerHTML = T.id === 'breach'
      ? `<div class="seg" style="margin-bottom:10px" role="group" aria-label="Chapter">${[0, 1, 2, 3, 4, 5].map(c => `<button type="button" data-c="${c}" aria-pressed="${c === chapter}">${c ? 'Ch. ' + c : 'All chapters'}</button>`).join('')}</div>`
      : '';
    sub.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { chapter = +b.dataset.c; paint(); }));

    const modes = T.id === 'breach' && chapter ? [`horde-${chapter}`] : T.modes;
    const metric = s => T.score ? (s.score || 0) : (s.wpm || 0);
    const p = WPM.profile();
    const runs = WPM.sessions().filter(s => modes.includes(s.mode)).sort((a, b) => metric(b) - metric(a)).slice(0, 20)
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
      return `<td class="who-td"><div class="who"><img src="${UI.avatar(p.avatar, 68)}" alt="" width="34" height="34"><span>${UI.esc(p.name)}</span><span class="tag" style="color:var(--green);border-color:var(--line)">You</span></div></td>
        <td class="w num-col">${UI.fmt(r.v)}</td><td class="n num-col hide-sm">${s.acc != null ? s.acc + '%' : ''}</td>
        <td class="hide-sm">${UI.esc(UI.modeName(s.mode) + extra)}</td><td class="n hide-sm">${UI.esc(UI.date(s.at))}</td>`;
    };
    el.querySelector('[data-board]').innerHTML = `
      <table class="board">
        <thead><tr><th>#</th><th>Typist</th><th class="num-col">${T.score ? 'Score' : 'WPM'}</th><th class="num-col hide-sm">Accuracy</th><th class="hide-sm">Mode</th><th class="hide-sm">Date</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${r.kind === 'art' ? 'art' : r === bestMine ? 'mine-best' : ''}">
          <td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td>${cell(r)}</tr>`).join('')}</tbody>
      </table>
      ${runs.length ? '' : `<p class="empty">No runs in this mode yet. ${T.id === 'breach' ? '<a class="green" href="#/play/breach">Play Breach</a>' : T.id === 'race' ? '<a class="green" href="#/play/race">Start a race</a>' : '<a class="green" href="#/type">Take a typing test</a>'} to get on the board.</p>`}`;
  }

  function unmount() { off.forEach(f => f()); off = []; el = null; }

  return { title: 'Leaderboard', mount, unmount };
})());
