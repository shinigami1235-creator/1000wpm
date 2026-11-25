// #/profile: name, avatar, level, coins, stats, wpm chart, recent sessions,
// the daily loop from js/app/progress-ui.js and the progress reset.
Router.register('profile', (() => {
  let el, off = [], host = null, creator = false, jump = false, stats = null, pickOff = null;

  function mount(root, params) {
    el = root; host = root;
    // the faceted avatar creator was replaced by the Operator page
    if (params && params[0] === 'avatar') { location.replace('#/lab'); return; }
    jump = !!(params && params[0] === 'progress');
    paint();
    off.push(WPM.on('profile', paint), WPM.on('session', paint), WPM.on('coins', paint));
    addEventListener('wpm-ops', paint); off.push(() => removeEventListener('wpm-ops', paint));
    if (window.Progress) off.push(Progress.on('ready', paint), Progress.on('achievements', paint), Progress.on('many', paint));
  }

  function paint() {
    if (!el) return;
    const p = WPM.profile(), st = WPM.stats(), lv = WPM.levelInfo();
    const achs = WPM.achievements(), got = achs.filter(a => a.unlocked).length;
    const recent = WPM.sessions().slice(-8).reverse();
    const e = UI.esc;
    el.innerHTML = `
      <div class="prof">
        <div class="col">
          <section class="panel hot">
            ${window.OpsUI ? OpsUI.card({ name: p.name, img: UI.meImg(280, 140, 'class="av" alt="Your operator"'), editBtn: `<button class="icon-btn" type="button" data-edit aria-label="Edit name">${UI.icon('edit')}</button>` }) : `
            <div class="ph">// PROFILE</div>
            <div class="who-card">
              ${UI.meImg(280, 140, 'class="av" alt="Your operator"')}
              <div class="name-row" data-name><h2>${e(p.name)}</h2><button class="icon-btn" type="button" data-edit aria-label="Edit name">${UI.icon('edit')}</button></div>
            </div>`}
            <dl class="kv op-kv">
              <dt>Joined</dt><dd>${e(UI.date(p.joined + 'T12:00:00', false))}, ${e(p.joined.slice(0, 4))}</dd>
              <dt>Runs</dt><dd>${UI.fmt(st.sessions)}</dd>
            </dl>
          </section>
          ${window.OpsUI ? '<section class="panel" data-ops-pick aria-label="Division"></section>' : ''}
          <section class="panel" aria-labelledby="theme-h">
            <div class="ph" id="theme-h">// THEME</div>
            <div class="theme-pick" role="group" aria-labelledby="theme-h">
              ${Theme.list.map(t => `<button type="button" class="theme-sw" data-theme-id="${t.id}" aria-pressed="${t.id === Theme.id()}" style="--sw-bg:${t.bg};--sw-a:${t.accent};--sw-ink:${t.ink}">
                <span class="theme-prev" aria-hidden="true"><i>&gt; ${e(t.name.toLowerCase())}_</i><b></b></span>
                <span class="theme-name">${e(t.name)}</span><span class="theme-note">${e(t.note)}</span></button>`).join('')}
            </div>
          </section>
          <section class="panel trio">
            <div><span class="label">Coins</span><b class="mid gold">${UI.fmt(WPM.coins())}</b></div>
            <div><span class="label">Items</span><b class="mid">${WPM.owned().length}</b></div>
            <div><span class="label">Achievements</span><b class="mid">${got}</b></div>
          </section>
          <section class="panel">
            <div class="ph">// OPERATOR</div>
            <a class="btn out" href="#/lab" style="width:100%">Edit operator</a>
          </section>
        </div>

        <div class="col mid-col">
          <div class="stats-host" data-stats></div>
          <section class="panel">
            <div class="ph">// RECENT SESSIONS</div>
            ${recent.length ? `<table class="sessions">
              <thead><tr><th>Date</th><th>Mode</th><th class="r">WPM</th><th class="r">Acc</th><th class="r hide-sm">Words</th><th class="r hide-sm">Time</th></tr></thead>
              <tbody>${recent.map(s => `<tr><td>${e(UI.date(s.at))}</td><td>${e(UI.modeName(s.mode))}</td><td class="r w">${s.wpm ?? ''}</td>
                <td class="r">${s.acc != null ? s.acc + '%' : ''}</td><td class="r hide-sm">${UI.fmt((s.correct || 0) / 5)}</td><td class="r hide-sm">${UI.time(s.ms)}</td></tr>`).join('')}</tbody>
            </table>` : `<p class="empty">No runs yet. <a class="green" href="#/type">Take a typing test</a> to start your history.</p>`}
          </section>
        </div>

        <div class="col">
          ${window.ProgressUI ? '<div class="prof-side" data-prog-side></div>' : ''}
          ${window.MultiUI ? '<section class="panel" data-multi-prof aria-label="Duels and party"></section>' : ''}
          <section class="panel">
            <div class="ph">// PROGRESS</div>
            <p class="dim" style="margin-bottom:12px">Coins, XP, runs and items are saved in this browser.</p>
            <button class="btn danger" type="button" data-reset>Reset progress</button>
          </section>
          ${window.Buddy ? `<section class="panel">
            <div class="ph">// ${e(Buddy.NAME.toUpperCase())}</div>
            <button class="btn out" type="button" data-buddy-toggle>${Buddy.hidden() ? 'Show' : 'Hide'} ${e(Buddy.NAME)}</button>
          </section>` : ''}
        </div>
      </div>
      ${window.ProgressUI ? '<div data-prog-wide></div>' : ''}
      <dialog class="confirm" data-dialog aria-labelledby="reset-title">
        <form method="dialog">
          <h2 id="reset-title">Reset progress?</h2>
          <p>Resetting deletes your name, coins, XP, runs, achievements and room items on this device.</p>
          <div class="row"><button class="btn out" value="cancel" autofocus>Cancel</button><button class="btn danger" value="reset">Reset progress</button></div>
        </form>
      </dialog>`;

    el.querySelector('[data-edit]').addEventListener('click', editName);
    const dlg = el.querySelector('[data-dialog]');
    el.querySelector('[data-reset]').addEventListener('click', () => dlg.showModal());
    const bt = el.querySelector('[data-buddy-toggle]');
    if (bt) bt.addEventListener('click', () => { Buddy.setHidden(!Buddy.hidden()); paint(); });
    dlg.addEventListener('close', () => { if (dlg.returnValue === 'reset') WPM.reset(); });
    // the stats block from js/app/stats-view.js, the same one the public profile shows
    if (stats) stats.destroy();
    stats = window.StatsView ? StatsView.render(el.querySelector('[data-stats]'), { sessions: WPM.sessions(), keyStats: WPM.keyStats(), totals: st }) : null;
    if (window.ProgressUI) { off.push(ProgressUI.profile(el, jump)); jump = false; }
    if (window.MultiUI) MultiUI.profilePanel(el.querySelector('[data-multi-prof]'));
    if (window.OpsUI) { if (pickOff) pickOff(); pickOff = OpsUI.picker(el.querySelector('[data-ops-pick]')); }
    // a new theme reloads the page, since canvases and 3D scenes read their colours when they load
    el.querySelectorAll('[data-theme-id]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.themeId === Theme.id()) return;
      Theme.set(b.dataset.themeId);
      location.reload();
    }));
  }

  function editName() {
    const row = el.querySelector('[data-name]');
    const old = WPM.profile().name;
    row.innerHTML = `<label class="sr-only" for="name-in">Name</label><input class="field" id="name-in" maxlength="20" autocomplete="off" spellcheck="false">`;
    const inp = row.querySelector('input');
    inp.value = old;
    inp.focus(); inp.select();
    let done = false;
    const save = keep => {
      if (done) return; done = true;
      const v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 20);
      // other players see this name, so it goes through the same filter as chat (js/net/filter.js)
      const bad = keep && v && v !== old && window.NetFilter ? NetFilter.nameOk(v, 1) : null;
      if (bad && !bad.ok) { if (window.Toast) Toast('t-err', `<span>${UI.esc(bad.why)}</span>`); paint(); return; }
      if (keep && v && v !== old) WPM.setProfile({ name: v }); else paint();
    };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') save(true); if (ev.key === 'Escape') save(false); });
    inp.addEventListener('blur', () => save(true));
  }

  function unmount() {
    off.forEach(f => f()); off = [];
    if (stats) { stats.destroy(); stats = null; }
    if (pickOff) { pickOff(); pickOff = null; }
    el = null;
  }
  // #/profile and #/profile/avatar share this page
  function update(params) { const h = host; unmount(); h.innerHTML = ''; scrollTo(0, 0); mount(h, params); }

  return { title: 'Profile', mount, unmount, update };
})());
