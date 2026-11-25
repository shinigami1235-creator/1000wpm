// The parts of the page that stay put between routes: nav coins and avatar, the
// sound toggle, the mobile menu, toasts and the falling-code background.
(() => {
  // ---------- nav ----------
  const coinsEl = document.getElementById('nav-coins');
  const coinsNum = coinsEl.querySelector('span');
  const me = document.getElementById('nav-me');
  function paintMe() {
    const p = WPM.profile();
    const im = me.querySelector('img');
    if (window.Avatar) { Avatar.apply(im, Avatar.mine(), 68); drawMeSoon(im); } else im.src = UI.avatar(p.avatar, 68);
    me.querySelector('span').textContent = p.name;
  }
  // the nav picture is the player's operator; on a page that doesn't load 3D it's drawn once,
  // when the browser is idle and nobody is mid-fight, then kept in localStorage
  let meTimer = 0;
  function drawMeSoon(im) {
    clearTimeout(meTimer);
    if (Avatar.src(Avatar.mine(), 68, 34)) return;
    meTimer = setTimeout(function go() {
      if (UI.playing && UI.playing()) { meTimer = setTimeout(go, 5000); return; }
      (window.requestIdleCallback || (f => setTimeout(f, 0)))(() => Avatar.thumb(Avatar.mine(), 68, 34).then(u => { if (u) im.src = u; }));
    }, 2500);
  }
  function paintCoins(bump) {
    coinsNum.textContent = UI.fmt(WPM.coins());
    if (bump) { coinsEl.classList.remove('bump'); void coinsEl.offsetWidth; coinsEl.classList.add('bump'); }
  }
  paintMe(); paintCoins();
  WPM.on('profile', paintMe);
  WPM.on('coins', () => paintCoins(true));
  WPM.on('reset', () => { paintMe(); paintCoins(); Router.reload(); });

  // ---------- sound ----------
  const sb = document.getElementById('sound');
  sb.setAttribute('aria-pressed', TT.soundOn());
  sb.addEventListener('click', () => {
    const v = !TT.soundOn();
    TT.setSound(v);
    sb.setAttribute('aria-pressed', v);
    dispatchEvent(new CustomEvent('wpm-sound', { detail: { on: v } }));
  });

  // ---------- mobile menu ----------
  const mb = document.getElementById('menu'), nav = document.getElementById('nav');
  const closeMenu = () => { nav.classList.remove('open'); mb.setAttribute('aria-expanded', false); };
  mb.addEventListener('click', () => { const o = nav.classList.toggle('open'); mb.setAttribute('aria-expanded', o); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); mb.focus(); } });

  // ---------- toasts ----------
  const box = document.getElementById('toasts');
  // Toasts that arrive together (coins, level and achievement from one run) show one after
  // another, at most two on screen at once and one on a phone.
  const queue = [];
  let next = 0;
  function toast(kind, html, ms = 3200) { queue.push({ kind, html, ms }); pump(); }
  function pump() {
    if (!queue.length || next) return;
    const max = matchMedia('(max-width: 700px)').matches ? 1 : 2;
    if (box.querySelectorAll('.toast:not(.out)').length >= max) { next = setTimeout(() => { next = 0; pump(); }, 250); return; }
    const { kind, html, ms } = queue.shift();
    const t = UI.el(`<div class="toast ${kind}">${html}</div>`);
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
    next = setTimeout(() => { next = 0; pump(); }, 700);
  }
  // null: js/app/progress-ui.js shows its own toast for these
  const REASON = { typing: '', 'level up': ' for the level', achievement: ' for the achievement', streak: null, task: null, weekly: null, gift: null, 'free typing': null };
  WPM.on('coins', ({ delta, reason }) => {
    if (delta > 0 && REASON[reason] !== null) toast('t-coin', `${UI.coin()}<span><b>+${UI.fmt(delta)}</b> coins${REASON[reason] ?? ''}</span>`);
  });
  WPM.on('save-failed', () => toast('t-ach', `${UI.icon('lock', 'gold')}<span>This browser isn't saving your progress. Private browsing or full storage stops it.</span>`, 8000));
  WPM.on('level', ({ level }) => toast('t-level', `${UI.icon('bolt', 'green')}<span>Level <b>${level}</b></span>`, 4000));
  WPM.on('achievement', a => toast('t-ach', `${UI.icon('crown', 'gold')}<span>Achievement: <b>${UI.esc(a.name)}</b></span>`, 4500));
  window.Toast = toast;

  // ---------- falling code ----------
  // It stops on the world boss page so the margins stay calm around the fight, and while a
  // fight or a timed run is on (UI.playing), since a full-screen redraw costs every frame.
  const cv = document.getElementById('rain');
  const c = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const CH = '0123456789abcdef<>/{}[]=+*wpm';
  const COL = 18;
  let drops = [], raf = 0, last = 0;
  function size() {
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.ceil(innerWidth / COL);
    drops = Array.from({ length: n }, () => ({ y: Math.random() * innerHeight, v: 0.4 + Math.random() * 0.9 }));
    c.fillStyle = Theme.hex('bg'); c.fillRect(0, 0, innerWidth, innerHeight);
    if (reduce.matches) still();
  }
  function still() {
    c.fillStyle = Theme.hex('bg'); c.fillRect(0, 0, innerWidth, innerHeight);
    c.font = '15px "JetBrains Mono", monospace';
    for (let i = 0; i < drops.length; i++) {
      for (let y = 0; y < innerHeight; y += COL * 1.2) {
        if (Math.random() < .12) { c.fillStyle = Math.random() < .2 ? Theme.hex('accent') : Theme.hex('accent-dim'); c.fillText(CH[Math.floor(Math.random() * CH.length)], i * COL, y); }
      }
    }
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 66) return;   // about 15 frames a second
    last = t;
    c.fillStyle = 'rgba(4,8,6,.14)'; c.fillRect(0, 0, innerWidth, innerHeight);
    c.font = '15px "JetBrains Mono", monospace';
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      c.fillStyle = Math.random() < .06 ? Theme.hex('ink') : Theme.hex('accent');
      c.fillText(CH[Math.floor(Math.random() * CH.length)], i * COL, d.y);
      d.y += COL * d.v;
      if (d.y > innerHeight && Math.random() > .96) d.y = -COL * Math.random() * 20;
    }
  }
  const calm = () => (window.Router && ['boss', 'superboss'].includes(Router.current())) || (window.UI && UI.playing && UI.playing());
  let wasCalm = false;
  function run() {
    cancelAnimationFrame(raf); raf = 0;
    const now = calm();
    if (now && window.Router && ['boss', 'superboss'].includes(Router.current())) { c.fillStyle = Theme.hex('bg'); c.fillRect(0, 0, innerWidth, innerHeight); }
    else if (wasCalm && reduce.matches) still();
    wasCalm = now;
    if (!document.hidden && !reduce.matches && !now) raf = requestAnimationFrame(frame);
  }
  addEventListener('resize', () => { size(); run(); });
  addEventListener('wpm-route', run);
  addEventListener('wpm-playing', run);
  document.addEventListener('visibilitychange', run);
  reduce.addEventListener('change', () => { size(); run(); });
  size(); run();
})();
