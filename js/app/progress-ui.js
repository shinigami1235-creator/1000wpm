// Draws the daily loop: the streak button in the nav with today's tasks, the profile
// sections (streak, tasks, visual bonuses, achievements), the toasts and coin burst for
// rewards, the gift crate and Tilde's once-a-day streak line.
window.ProgressUI = (() => {
  if (!window.Progress) return null;
  const P = window.Progress, e = UI.esc, fmt = UI.fmt;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const GROUP_ICON = { Speed: 'bolt', Accuracy: 'target', Typing: 'key', Streak: 'flame', Tasks: 'cal', 'World boss': 'crown',
    Combo: 'bolt', Breach: 'target', Race: 'flag', Academy: 'key', Combat: 'bolt', Room: 'cube', Collecting: 'cube', Hidden: 'lock' };
  const TIER = ['', 'I', 'II', 'III'];
  const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;
  function left(to) {
    const ms = Math.max(0, to - WPM.now());
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  const rewardLine = (coins, xp) => `<span class="pr-pay">${UI.coin()}<b>+${fmt(coins)}</b><b class="xp">+${fmt(xp)} XP</b></span>`;

  // ---------- pieces ----------
  function streakHTML(compact) {
    const s = P.streak();
    const next = P.dayReward(s.n + 1);
    const nextDay = s.n + 1;
    return `
      <div class="sk${compact ? ' sk-compact' : ''}">
        <div class="sk-head">
          ${UI.icon('flame', 'sk-flame')}
          <div><b class="sk-n">${fmt(s.n)}</b><span class="label">${s.n === 1 ? 'Day' : 'Days'} in a row</span></div>
          <dl class="sk-meta"><dt>Best</dt><dd>${fmt(s.best)}</dd><dt>Shield</dt><dd class="${s.shieldReady ? 'green' : 'dim'}">${s.shieldReady ? 'Ready' : 'Used'}</dd></dl>
        </div>
        <ol class="sk-cycle" aria-label="This week of your streak">
          ${s.cycle.map(c => `<li class="${c.done ? 'done' : ''}${c.today ? ' today' : ''}" title="Day ${c.day}: ${fmt(c.coins)} coins${c.gift ? ' and a room gift' : ''}">
            <span>D${c.day}</span><b>${fmt(c.coins)}</b>${c.gift ? UI.icon('cube', 'sk-gift') : '<i></i>'}</li>`).join('')}
        </ol>
        <p class="sk-next">${s.signedToday
          ? `Tomorrow is day ${nextDay} and pays ${fmt(next.coins)} coins${next.gift ? ' and a room gift' : ''}.`
          : 'Sign in today to keep your streak.'}</p>
        ${compact ? '' : `<p class="sk-note dim">A shield covers one missed day each week. Days 3 and 7 bring a room gift.</p>`}
      </div>`;
  }

  function taskRow(t) {
    const pct = Math.round(100 * t.v / t.n);
    const shown = t.unit === 'min' ? `${Math.floor(t.v)} / ${t.n} min` : `${fmt(Math.floor(t.v))} / ${fmt(t.n)}`;
    return `<li class="pr-task${t.done ? ' done' : ''}">
      <div class="pr-top"><span class="pr-text">${e(t.text)}</span><span class="pr-v num">${t.done ? 'Done' : shown}</span></div>
      <div class="pr-bar" role="progressbar" aria-label="${e(t.text)}" aria-valuemin="0" aria-valuemax="${t.n}" aria-valuenow="${Math.floor(t.v)}"><i style="width:${pct}%"></i></div>
      <div class="pr-foot">${t.hint ? `<small class="dim">${e(t.hint)}</small>` : '<span></span>'}${rewardLine(t.coins, t.xp)}</div>
    </li>`;
  }
  function tasksHTML(which) {
    const T = P.tasks();
    const list = which === 'weekly' ? T.weekly : T.daily;
    const all = which === 'weekly' ? T.allWeekly : T.allDaily;
    const n = list.filter(t => t.done).length;
    return `<ul class="pr-tasks">${list.map(taskRow).join('')}</ul>
      <p class="pr-all${n === list.length ? ' done' : ''}">${n === list.length ? 'All three done' : `Finish all three for ${fmt(all.coins)} more coins`}<span class="dim">${n} / ${list.length}</span></p>`;
  }
  const resets = which => { const T = P.tasks(); return `New in ${left(which === 'weekly' ? T.weeklyEnds : T.dailyEnds)}`; };

  function bonusesHTML() {
    return `<ul class="fx-list">${P.bonuses().map(b => `<li class="${b.unlocked ? 'got' : ''}">
      <div class="fx-info"><b>${e(b.name)}</b><small>${e(b.text)}</small></div>
      ${b.unlocked ? `<div class="fx-ctl">
          ${b.colors ? `<div class="fx-sw" role="group" aria-label="${e(b.name)}">${b.colors.map(([n, c]) => `<button type="button" data-fx-color="${b.id}" data-c="${c}" aria-pressed="${c === b.color}" aria-label="${n}" title="${n}" style="--c:${c}"></button>`).join('')}</div>` : ''}
          <button class="fx-tog" type="button" role="switch" data-fx="${b.id}" aria-checked="${b.on}" aria-label="${e(b.name)}"><i></i></button>
        </div>`
      : `<span class="fx-lock">${UI.icon('lock')}${b.days}-day streak</span>`}
    </li>`).join('')}</ul>`;
  }

  // Next is the default so the profile isn't a wall of 100 locked cards: the 8 locked ones
  // you're closest to, then Earned and All
  let achFilter = 'next';
  function achHTML() {
    const list = P.achievements();
    const got = list.filter(a => a.unlocked).length;
    const show = achFilter === 'next'
      ? list.filter(a => !a.unlocked && !a.hidden).sort((a, b) => b.v / b.goal - a.v / a.goal).slice(0, 8).map(a => ({ ...a, group: 'Closest to earning' }))
      : list.filter(a => achFilter === 'all' || (achFilter === 'got' ? a.unlocked : !a.unlocked));
    const groups = [...new Set(show.map(a => a.group))];
    return {
      got, total: list.length,
      html: groups.map(g => `<div class="ach-g"><h3 class="label">${e(g)}</h3><ul class="ach-grid">${show.filter(a => a.group === g).map(a => {
        const secret = a.hidden && !a.unlocked;
        const pct = Math.round(100 * a.v / a.goal);
        const val = a.unit === 'min' ? `${fmt(a.v)} / ${fmt(a.goal)} min` : `${fmt(a.v)} / ${fmt(a.goal)}`;
        return `<li class="ach2${a.unlocked ? ' on' : ''} t${a.tier}">
          <div class="hex">${UI.icon(secret ? 'lock' : GROUP_ICON[a.group] || 'crown')}</div>
          <div class="ach2-body">
            <b>${secret ? 'Hidden' : e(a.name)}<span class="tier" aria-label="Tier ${a.tier}">${TIER[a.tier]}</span></b>
            <small>${secret ? 'Shows once you earn it.' : e(a.text)}</small>
            ${a.unlocked ? `<span class="ach2-date">${e(UI.date(a.unlocked + 'T12:00:00', false))}</span>`
              : !secret && a.bar && a.v > 0 ? `<div class="pr-bar sm"><i style="width:${pct}%"></i></div><span class="ach2-v num">${val}</span>` : ''}
          </div></li>`;
      }).join('')}</ul></div>`).join('') || `<p class="empty">None yet.</p>`,
    };
  }

  // ---------- nav button and today panel ----------
  let chip, pop;
  function navButton() {
    const right = document.querySelector('.top-right');
    if (!right || chip) return;
    chip = UI.el(`<button class="streak-chip" id="nav-streak" type="button" popovertarget="today-pop" aria-label="Streak and daily tasks">
      ${UI.icon('flame')}<b class="num">0</b><i class="dot" hidden></i></button>`);
    right.insertBefore(chip, document.getElementById('nav-coins'));
    pop = UI.el(`<div class="panel hot today-pop" id="today-pop" popover aria-label="Today"></div>`);
    document.body.append(pop);
    pop.addEventListener('toggle', ev => { if (ev.newState === 'open') paintPop(); });
    pop.addEventListener('click', ev => { if (ev.target.closest('a')) pop.hidePopover(); });
    paintChip();
  }
  function paintChip() {
    if (!chip || !P.ready()) return;
    const s = P.streak(), T = P.tasks();
    chip.querySelector('b').textContent = s.n;
    const open = T.daily.filter(t => !t.done).length;
    chip.setAttribute('aria-label', `${plural(s.n, 'day')} in a row, ${open} daily ${open === 1 ? 'task' : 'tasks'} left`);
    chip.querySelector('.dot').hidden = !open;
    chip.classList.toggle('cold', !s.signedToday);
  }
  function paintPop() {
    if (!pop || !P.ready() || !pop.matches(':popover-open')) return;
    pop.innerHTML = `
      <div class="ph">// STREAK</div>
      ${streakHTML(true)}
      <div class="ph pr-ph">// DAILY TASKS<span class="meta">${resets('daily')}</span></div>
      ${tasksHTML('daily')}
      <div class="ph pr-ph">// WEEKLY TASKS<span class="meta">${resets('weekly')}</span></div>
      ${tasksHTML('weekly')}
      <a class="btn out sm pr-more" href="#/profile/progress">Achievements and visual bonuses</a>`;
  }
  const repaint = () => { paintChip(); paintPop(); paintProfile(); };

  // ---------- profile ----------
  let prof = null, jumpTo = false;
  // jump scrolls to the achievements once they are drawn, for #/profile/progress
  function profile(root, jump) {
    prof = root;
    if (jump) jumpTo = true;
    paintProfile();
    return () => { if (prof === root) prof = null; };
  }
  function paintProfile() {
    if (!prof || !prof.isConnected || !P.ready()) return;
    const side = prof.querySelector('[data-prog-side]'), wide = prof.querySelector('[data-prog-wide]');
    if (side) side.innerHTML = `
      <section class="panel hot"><div class="ph">// SIGN-IN STREAK</div>${streakHTML(false)}</section>
      <section class="panel" id="visual-bonuses"><div class="ph">// VISUAL BONUSES</div>${bonusesHTML()}</section>`;
    if (wide) {
      const A = achHTML();
      wide.innerHTML = `
        <div class="pr-wide">
          <section class="panel" id="daily-tasks"><div class="ph">// DAILY TASKS<span class="meta">${resets('daily')}</span></div>${tasksHTML('daily')}</section>
          <section class="panel"><div class="ph">// WEEKLY TASKS<span class="meta">${resets('weekly')}</span></div>${tasksHTML('weekly')}</section>
        </div>
        <section class="panel ach-panel" id="achievements">
          <div class="ph">// ACHIEVEMENTS<span class="meta">${A.got} / ${A.total}</span>
            <div class="seg" role="group" aria-label="Show">
              ${[['next', 'Next'], ['got', 'Earned'], ['all', 'All']].map(([v, l]) => `<button type="button" data-ach-f="${v}" aria-pressed="${v === achFilter}">${l}</button>`).join('')}
            </div>
          </div>
          ${A.html}
        </section>`;
      if (jumpTo) {
        // the profile may redraw again before the next frame, so the target is looked up then
        jumpTo = false;
        requestAnimationFrame(() => { const t = prof && prof.querySelector('#achievements'); if (t) t.scrollIntoView({ block: 'start', behavior: 'instant' }); });
      }
    }
  }
  document.addEventListener('click', ev => {
    const f = ev.target.closest('[data-ach-f]');
    if (f) { achFilter = f.dataset.achF; paintProfile(); return; }
    const t = ev.target.closest('[data-fx]');
    if (t) { P.setBonus(t.dataset.fx, { on: t.getAttribute('aria-checked') !== 'true' }); return; }
    const c = ev.target.closest('[data-fx-color]');
    if (c) P.setBonus(c.dataset.fxColor, { color: c.dataset.c, on: true });
  });

  // ---------- coin burst ----------
  function burst(from, n = 10) {
    if (reduce.matches) return;
    const to = document.getElementById('nav-coins');
    if (!to || !from) return;
    const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
    const b = to.getBoundingClientRect();
    if (!b.width) return;
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + 16, y1 = b.top + b.height / 2;
    for (let i = 0; i < n; i++) {
      const c = UI.el(`<span class="coin-fly" aria-hidden="true">${UI.coin()}</span>`);
      document.body.append(c);
      const sx = (Math.random() - .5) * 90, sy = -30 - Math.random() * 50;
      c.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${x0 + sx}px, ${y0 + sy}px) scale(1)`, opacity: 1, offset: .3 },
        { transform: `translate(${x1}px, ${y1}px) scale(.7)`, opacity: .9 },
      ], { duration: 620 + i * 25, delay: i * 30, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' }).onfinish = () => c.remove();
    }
  }
  const toastBox = () => document.getElementById('toasts');

  // ---------- gift crate ----------
  let dlg = null, lastKey = 0, revealing = false;
  addEventListener('keydown', () => { lastKey = Date.now(); }, true);
  const SOURCE = { streak: n => `Gift for day ${n} of your streak`, month: () => 'Gift for the new month', run: () => 'Gift after your run', drop: () => 'Surprise drop' };
  function canReveal() {
    const r = window.Router && Router.current();
    if (revealing || (window.UI && UI.playing && UI.playing()) || ['play', 'boss', 'type', 'superboss', 'duel', 'party'].includes(r)) return false;  // typing pages: the gift waits for the next page
    if (document.documentElement.classList.contains('intro') || document.querySelector('dialog[open]')) return false;
    return Date.now() - lastKey > 2500;
  }
  function tryReveal() {
    const g = P.nextGift();
    if (!g || !canReveal()) return;
    reveal(g);
  }
  async function reveal(g) {
    revealing = true;
    const it = g.id && window.RoomItems ? RoomItems.get(g.id) : null;
    if (!dlg) {
      dlg = UI.el(`<dialog class="gift-dlg" aria-labelledby="gift-title"></dialog>`);
      document.body.append(dlg);
      dlg.addEventListener('close', () => { revealing = false; setTimeout(tryReveal, 600); });
    }
    const from = g.jackpot ? 'Jackpot drop' : (SOURCE[g.source] || SOURCE.run)(P.streak().n);
    const bo = g.boost, title = it ? e(it.name) : bo ? `Coin boost x${bo.mult}` : `${fmt(g.coins)} coins`;
    const sub = it ? e(it.desc || '') + (it.gift ? ' It only comes as a gift.' : '')
      : bo ? `Coins you earn by playing are x${bo.mult} for the next ${bo.mins} minutes.`
      : g.source === 'drop' ? '' : 'You own every item a gift can bring.';
    dlg.innerHTML = `
      <div class="gift-stage">
        <div class="crate" aria-hidden="true"><i class="lid"></i><i class="body"></i></div>
        <div class="gift-item">${it ? '<span class="ph-text">LOADING</span>' : bo ? `<b class="gift-boost">x${bo.mult}</b>` : `${UI.coin()}`}</div>
      </div>
      <p class="label${g.jackpot ? ' gold' : ''}">${e(from)}</p>
      <h2 id="gift-title">${title}</h2>
      ${sub ? `<p class="dim">${sub}</p>` : ''}
      <form method="dialog" class="row">
        ${it ? `<a class="btn" href="#/room" data-go-room>Place it in your room</a>` : ''}
        <button class="btn out" value="close">Close</button>
      </form>`;
    dlg.showModal();
    const stage = dlg.querySelector('.gift-stage');
    const thumb = it ? Promise.race([RoomItems.thumbnail(g.id).catch(() => null), new Promise(r => setTimeout(() => r(null), 2500))]) : Promise.resolve(null);
    const go = dlg.querySelector('[data-go-room]');
    if (go) go.addEventListener('click', () => dlg.close());
    if (!reduce.matches) { stage.classList.add('shake'); await new Promise(r => setTimeout(r, 420)); }
    const url = await thumb;
    const box = dlg.querySelector('.gift-item');
    if (it) box.innerHTML = url ? `<img src="${url}" alt="">` : UI.icon('cube');
    stage.classList.remove('shake'); stage.classList.add('open');
    const opened = P.openGift();
    if (opened && opened.coins) burst(box, 12);
  }
  setInterval(tryReveal, 1500);

  // ---------- reactions ----------
  P.on('checkin', r => {
    repaint();
    let lead = '';
    if (r.shield) lead = 'Your shield covered the missed day. ';
    else if (r.lost > 1) lead = `Your ${r.lost}-day streak ended. `;
    Toast('t-streak', `${UI.icon('flame', 'green')}<span>${lead}Day <b>${r.n}</b> in a row: <b class="gold">+${fmt(r.coins)}</b> coins, +${fmt(r.xp)} XP</span>`, 4500);
    setTimeout(() => burst(chip, 8), 300);
    announce(r);
  });
  P.on('task', t => {
    repaint();
    Toast('t-task', `${UI.icon('cal', 'green')}<span>${t.weekly ? 'Weekly task' : 'Task'} done: ${e(t.text)}. <b class="gold">+${fmt(t.coins)}</b> coins, +${fmt(t.xp)} XP</span>`, 4500);
    setTimeout(() => burst(toastBox().lastElementChild || chip, 8), 250);
  });
  P.on('alldone', a => {
    Toast('t-task', `${UI.icon('crown', 'gold')}<span>All ${a.weekly ? 'weekly' : 'daily'} tasks done: <b class="gold">+${fmt(a.coins)}</b> coins, +${fmt(a.xp)} XP</span>`, 4500);
  });
  P.on('bonus', list => {
    repaint();
    for (const b of list) Toast('t-streak', `${UI.icon('bolt', 'green')}<span>Visual bonus unlocked: <b>${e(b.name)}</b>. Switch it off on your profile.</span>`, 5000);
  });
  P.on('many', list => Toast('t-ach', `${UI.icon('crown', 'gold')}<span><b>${list.length}</b> achievements: ${e(list.slice(0, 3).map(a => a.name).join(', '))}${list.length > 3 ? ` and ${list.length - 3} more` : ''}</span>`, 5500));
  P.on('backfill', list => Toast('t-ach', `${UI.icon('crown', 'gold')}<span><b>${list.length}</b> achievements unlocked from your past runs</span>`, 5000));
  ['tasks', 'change', 'fx', 'achievements', 'gift'].forEach(ev => P.on(ev, repaint));
  P.on('gift', () => setTimeout(tryReveal, 400));
  WPM.on('session', () => setTimeout(repaint, 0));
  addEventListener('wpm-route', () => { setTimeout(tryReveal, 800); });

  // Tilde says the streak once a day, after the page has settled.
  function announce(r) {
    const day = WPM.day();
    if (P.said() === day) return;
    setTimeout(() => {
      if (!window.Buddy || !Buddy.say || Buddy.hidden()) return;
      const r2 = window.Router && Router.current();
      if (r2 === 'play' || r2 === 'boss' || r2 === 'superboss') return;
      P.setSaid(day);
      Buddy.say(r.n === 1 ? 'Your three tasks for today are under the flame.' : `${r.n} days in a row now.`, 2);
    }, 4200);
  }

  navButton();
  if (P.ready()) { repaint(); const s = P.streak(); if (s.signedToday) announce(s); }
  P.on('ready', repaint);

  return { profile, burst, repaint };
})();
