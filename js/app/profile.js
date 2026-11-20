// #/profile: name, avatar, level, coins, stats, wpm chart, recent sessions,
// streak, achievements and the progress reset.
Router.register('profile', (() => {
  const ACH_ICON = {
    first: 'flag', wpm60: 'bolt', wpm100: 'bolt', wpm150: 'bolt', beatart: 'crown', clean: 'target',
    streak7: 'cal', streak30: 'flame', words10k: 'key', horde1: 'target', horde5: 'target',
    racewin: 'flag', collector: 'cube', level10: 'crown',
  };
  const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  let el, off = [], span = 30, onResize = null;

  function mount(root) {
    el = root;
    paint();
    off.push(WPM.on('profile', paint), WPM.on('session', paint), WPM.on('coins', paint));
    onResize = () => drawChart();
    addEventListener('resize', onResize);
  }

  function paint() {
    if (!el) return;
    const p = WPM.profile(), st = WPM.stats(), lv = WPM.levelInfo(), sk = WPM.streak();
    const achs = WPM.achievements(), got = achs.filter(a => a.unlocked).length;
    const typed = WPM.sessions().filter(s => s.wpm != null);
    const recent = WPM.sessions().slice(-8).reverse();
    const today = UI.day();
    const e = UI.esc;
    el.innerHTML = `
      <div class="prof">
        <div class="col">
          <section class="panel hot">
            <div class="ph">// PROFILE</div>
            <div class="who-card">
              <img class="av" src="${UI.avatar(p.avatar, 280)}" alt="Your avatar" width="140" height="140">
              <div>
                <div class="name-row" data-name>
                  <h2>${e(p.name)}</h2>
                  <button class="icon-btn" type="button" data-edit aria-label="Edit name">${UI.icon('edit')}</button>
                </div>
                <dl class="kv">
                  <dt>Joined</dt><dd>${e(UI.date(p.joined + 'T12:00:00', false))}, ${e(p.joined.slice(0, 4))}</dd>
                  <dt>Runs</dt><dd>${UI.fmt(st.sessions)}</dd>
                </dl>
              </div>
            </div>
            <div class="level">
              <div class="row"><span class="label">Level</span><b>${lv.level}</b></div>
              <div class="xpbar"><i style="width:${Math.round(100 * lv.into / lv.next)}%"></i></div>
              <small>${UI.fmt(lv.into)} / ${UI.fmt(lv.next)} XP</small>
            </div>
          </section>
          <section class="panel trio">
            <div><span class="label">Coins</span><b class="mid gold">${UI.fmt(WPM.coins())}</b></div>
            <div><span class="label">Items</span><b class="mid">${WPM.owned().length}</b></div>
            <div><span class="label">Achievements</span><b class="mid">${got}</b></div>
          </section>
          <section class="panel">
            <div class="ph">// AVATAR</div>
            <div class="avatars" role="group" aria-label="Avatar">
              ${UI.AVATARS.map((a, i) => `<button type="button" data-av="${i}" aria-pressed="${i === p.avatar}" aria-label="${e(a.name)} avatar"><img src="${UI.avatar(i, 120)}" alt="" width="60" height="60"></button>`).join('')}
            </div>
          </section>
        </div>

        <div class="col mid-col">
          <section class="panel hot">
            <div class="ph">// TYPING PERFORMANCE
              <div class="seg" data-span role="group" aria-label="Runs shown">
                ${[[10, 'Last 10'], [30, 'Last 30'], [0, 'All']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === span}">${l}</button>`).join('')}
              </div>
            </div>
            <div class="perf-nums">
              <div><span class="label">Best wpm</span><b class="mid">${st.bestWpm}</b></div>
              <div><span class="label">Best accuracy</span><b class="mid">${st.bestAcc}%</b></div>
              <div><span class="label">Avg wpm, last 20</span><b class="mid">${st.avgWpm}</b></div>
            </div>
            <canvas class="chart" data-chart></canvas>
          </section>
          <section class="panel">
            <div class="ph">// TYPING STATS<span class="meta">ALL TIME</span></div>
            <div class="totals">
              <div><span class="label">Keystrokes</span><b class="mid">${UI.fmt(st.keys)}</b></div>
              <div><span class="label">Words typed</span><b class="mid">${UI.fmt(st.words)}</b></div>
              <div><span class="label">Accuracy</span><b class="mid">${st.accuracy}%</b></div>
              <div><span class="label">Time typing</span><b class="mid">${UI.time(st.ms)}</b></div>
            </div>
          </section>
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
          <section class="panel hot">
            <div class="ph">// TYPING STREAK</div>
            <div class="streak-top">${UI.icon('cal', 'green').replace('<svg', '<svg style="width:40px;height:40px"')}<div><b>${sk.days} ${sk.days === 1 ? 'DAY' : 'DAYS'}</b><div class="label">Current streak</div></div></div>
            <div class="week">${sk.week.map(d => {
              const wd = new Date(d.date + 'T12:00:00').getDay();
              return `<div><span>${DAY[wd]}</span><i class="${d.played ? 'on' : ''} ${d.date === today ? 'today' : ''}" title="${e(d.date)}">${d.played ? '✓' : ''}</i></div>`;
            }).join('')}</div>
          </section>
          <section class="panel">
            <div class="ph">// ACHIEVEMENTS<span class="meta">${got} / ${achs.length}</span></div>
            <div class="achs">${achs.map(a => `<div class="ach ${a.unlocked ? 'on' : ''}" title="${e(a.text)}${a.unlocked ? ' Unlocked ' + e(a.unlocked) + '.' : ''}">
              <div class="hex">${UI.icon(a.unlocked ? ACH_ICON[a.id] || 'crown' : 'lock')}</div><span>${e(a.name)}</span></div>`).join('')}</div>
          </section>
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
      <dialog class="confirm" data-dialog aria-labelledby="reset-title">
        <form method="dialog">
          <h2 id="reset-title">Reset progress?</h2>
          <p>Resetting deletes your name, coins, XP, runs, achievements and room items on this device.</p>
          <div class="row"><button class="btn out" value="cancel" autofocus>Cancel</button><button class="btn danger" value="reset">Reset progress</button></div>
        </form>
      </dialog>`;

    el.querySelector('[data-edit]').addEventListener('click', editName);
    el.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => WPM.setProfile({ avatar: +b.dataset.av })));
    el.querySelector('[data-span]').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      span = +b.dataset.v;
      el.querySelectorAll('[data-span] button').forEach(x => x.setAttribute('aria-pressed', x === b));
      drawChart();
    });
    const dlg = el.querySelector('[data-dialog]');
    el.querySelector('[data-reset]').addEventListener('click', () => dlg.showModal());
    const bt = el.querySelector('[data-buddy-toggle]');
    if (bt) bt.addEventListener('click', () => { Buddy.setHidden(!Buddy.hidden()); paint(); });
    dlg.addEventListener('close', () => { if (dlg.returnValue === 'reset') WPM.reset(); });
    drawChart(typed);
  }

  function drawChart() {
    if (!el) return;
    const cv = el.querySelector('[data-chart]');
    if (!cv) return;
    let runs = WPM.sessions().filter(s => s.wpm != null);
    if (span) runs = runs.slice(-span);
    UI.lineChart(cv, runs.map(s => s.wpm), {
      labels: runs.map((s, i) => { const d = UI.date(s.at, false); return i && d === UI.date(runs[i - 1].at, false) ? '' : d; }),
      empty: 'Your wpm shows here after your first run',
      tag: runs.length ? `${runs[runs.length - 1].wpm} WPM` : '',
    });
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
      if (keep && v && v !== old) WPM.setProfile({ name: v }); else paint();
    };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') save(true); if (ev.key === 'Escape') save(false); });
    inp.addEventListener('blur', () => save(true));
  }

  function unmount() {
    off.forEach(f => f()); off = [];
    removeEventListener('resize', onResize);
    el = null;
  }

  return { title: 'Profile', mount, unmount };
})());
