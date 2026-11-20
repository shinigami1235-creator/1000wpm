// Tilde, the 10000WPM buddy. Built the same way as Nong Tape on the Apex Slim site:
// - it lives on the screen (position fixed), picks the perch nearest the reading
//   line (42% down the screen) and follows it with a damped spring, so scrolling
//   drags it along smoothly
// - perches are the things worth standing next to on each page plus the ends of
//   section headings, and a perch is skipped when the buddy would cover text, a
//   button or a game. With no free perch it waits in a bottom corner, and when
//   the corner is taken too it drops out of sight until there is room again
// - other scripts tell it what happened with
//   document.dispatchEvent(new CustomEvent('buddy', { detail: 'phase' }))
// - it talks only on big moments: never in its first 3 seconds, at most once
//   every 15 seconds, each line once per visit and never during a game. The rest
//   of the time it reacts with a face and a move
// - Breach and the World Boss get faces only, and on those pages it sits outside
//   the game box or hides
(() => {
  const NAME = 'Tilde';
  const A = window.BuddyArt;
  if (!A) return;

  const html = document.documentElement;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => mqReduce.matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const phone = () => innerWidth < 760;
  const route = () => (window.Router && Router.current()) || 'home';
  const gameRoute = () => route() === 'play' || route() === 'boss';
  const BASE = 80;                                   // the rig is drawn at 80px and scaled
  const SIZE = () => phone() ? 56 : gameRoute() ? 56 : 76;
  const CORNER = () => phone() ? 56 : 58;
  const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; } };
  const said = new Set((() => { try { return JSON.parse(sessionStorage.getItem('buddy-said') || '[]'); } catch (e) { return []; } })());
  const remember = k => { said.add(k); try { sessionStorage.setItem('buddy-said', JSON.stringify([...said])); } catch (e) {} };
  const now = () => Date.now();

  // ---------- reactions ----------
  // pose, face, how long in ms, a body move and an optional follow-up
  const EVENTS = {
    hello:          { pose: 'wave', expr: 'happy', ms: 2200, move: 'wiggle' },
    arrive:         { pose: 'hop', expr: 'excited', ms: 1300, move: 'hop' },
    best:           { pose: 'cheer', expr: 'excited', ms: 2600, move: 'hop' },
    beatart:        { pose: 'cheer', expr: 'love', ms: 3200, move: 'hop' },
    level:          { pose: 'cheer', expr: 'proud', ms: 2200, move: 'bob' },
    achievement:    { pose: 'wave', expr: 'love', ms: 2200, move: 'bob' },
    coins:          { pose: 'hop', expr: 'happy', ms: 800, move: 'hop' },
    fast:           { pose: 'hop', expr: 'excited', ms: 900, move: 'hop' },
    oops:           { pose: 'idle', expr: 'oops', ms: 1200, move: 'wobble' },
    phase:          { pose: 'idle', expr: 'surprised', ms: 900, move: 'startle', then: { pose: 'lean', expr: 'focused', ms: 1800 } },
    'boss-kill':    { pose: 'cheer', expr: 'excited', ms: 3200, move: 'hop' },
    'boss-down':    { pose: 'cheer', expr: 'excited', ms: 2200, move: 'hop' },
    'chapter-clear':{ pose: 'cheer', expr: 'proud', ms: 2600, move: 'bob' },
    love:           { pose: 'cheer', expr: 'love', ms: 1600, move: 'bob' },
  };

  // ---------- perches ----------
  // at: out-r / out-l = beside the element with bottoms lined up, in-br = inside its bottom-right
  // corner, below = under its left edge, text = right after a heading's text.
  // face: which way it turns when it lands. bonus pulls it toward the perches that matter.
  const PERCHES = [
    { route: 'home', sel: '.hero-race .hr-pace', at: 'out-r', dx: 26, dy: 14, face: 'left', bonus: 90, arrive: ['point', 'curious'] },
    { route: 'home', sel: '.home-art .ha-stats', at: 'out-r', dx: 24, dy: 18, face: 'left', bonus: 10 },
    { route: 'home', sel: '#keyboards .sec-head h2', at: 'text', dx: 20, dy: 4, face: 'right', bonus: 60, arrive: ['point', 'happy'] },
    { route: 'home', sel: '#videos .sec-head h2, #brands .sec-head h2', at: 'text', dx: 20, dy: 4, face: 'right', all: true },
    { route: 'type', sel: '.type-top .title-block', at: 'in-br', dx: -26, dy: -8, face: 'left', bonus: 90, arrive: ['lean', 'curious'] },
    { route: 'leaderboard', sel: '.lb-tabs button:last-child', at: 'out-r', dx: 26, dy: 20, face: 'left', bonus: 90, arrive: ['point', 'curious'] },
    { route: 'leaderboard', sel: '.lb-head h1', at: 'text', dx: 26, dy: 2, face: 'right', bonus: 20 },
    { route: 'shop', sel: '.shop-hero .coin-box', at: 'out-l', dx: -30, dy: 2, face: 'right', bonus: 400, arrive: ['point', 'happy'] },
    { route: 'shop', sel: '.shop-bar .seg', at: 'out-r', dx: 40, dy: 6, face: 'right', bonus: -100 },
    { route: 'room', sel: '.rm-menu', at: 'below', dx: 18, dy: 24, face: 'right', bonus: 90, arrive: ['point', 'happy'] },
    { route: 'profile', sel: '.avc-head h1', at: 'text', dx: 34, dy: 4, face: 'left', bonus: 400, arrive: ['point', 'happy'] },
    { route: 'profile', sel: '.streak-top b', at: 'text', dx: 34, dy: 6, face: 'left', bonus: 90, arrive: ['point', 'proud'] },
    { route: 'profile', sel: '[data-buddy-toggle]', at: 'out-r', dx: 22, dy: 10, face: 'left', bonus: 20 },
    { route: 'play', sel: '.page-play [data-game] > .panel', at: 'out-l', dx: -26, dy: 0, face: 'right', bonus: 90 },
    { route: 'play', sel: '.page-play [data-game] > .panel', at: 'below', dx: 6, dy: 2, face: 'right', bonus: 50 },
    { route: 'play', sel: '.game-bar .btn', at: 'out-l', dx: -28, dy: 10, face: 'right', bonus: 60 },
    { route: 'play', sel: '.play-head h1', at: 'text', dx: 24, dy: 4, face: 'right' },
    { route: 'boss', sel: '.boss-stage', at: 'out-l', dx: -18, dy: 0, face: 'right', bonus: 90 },
    { route: 'boss', sel: '.boss-stage', at: 'out-r', dx: 18, dy: 0, face: 'left', bonus: 60 },
  ];
  // what it must never cover. Text is checked line by line on desktop.
  const SOLID = 'a[href],button,input,select,textarea:not(.sr-input),[role=tab],.avc-stage,.avc-ctrl,.typebox,.breach-box,.boss-stage,.boss-type,.boss-hpbox,.wb-strip,.wb-demo,.wb-drawer,.race-panel,.rm-menu,.rm-dock,.rm-pop,.kb-picker,dialog';
  const TEXTY = /^(H1|H2|H3|H4|P|LI|DT|DD|LABEL|TH|TD|B|SPAN|SMALL|STRONG|EM|KBD|DIV)$/;

  // ---------- build ----------
  const root = document.createElement('div');
  root.className = 'buddy waiting';
  root.innerHTML = `<div class="buddy-scale"><div class="buddy-body-wrap">
      <button class="buddy-body" type="button" aria-label="${NAME}. Click to say hi."><span class="buddy-art"></span></button>
    </div><span class="buddy-nap" aria-hidden="true"><b>z</b><b>z</b><b>Z</b></span></div>
    <p class="buddy-say" aria-hidden="true"></p>
    <button class="buddy-x" type="button" aria-label="Hide ${NAME}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>`;
  document.body.append(root);
  const scaleEl = root.querySelector('.buddy-scale'), body = root.querySelector('.buddy-body'), bubble = root.querySelector('.buddy-say'), hideBtn = root.querySelector('.buddy-x');
  const rig = A.create(root.querySelector('.buddy-art'), BASE, { reduce });
  const peek = document.createElement('button');
  peek.className = 'buddy-peek'; peek.type = 'button'; peek.setAttribute('aria-label', `Bring back ${NAME}`);
  peek.innerHTML = '<i></i>';
  document.body.append(peek);

  let mode = 'wait';                                   // wait (for the intro), follow, drag
  let away = !!store('buddy-away');
  let born = 0, lastSay = 0, lastInput = now(), busyUntil = 0, actTimer = 0, sayTimer = 0, typeTimer = 0;
  let asleep = false, held = false, flying = false, facing = 1;
  const pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
  let S = SIZE(), lean = 0, first = true, lastT = performance.now();

  const MOVES = ['m-hop', 'm-wiggle', 'm-bob', 'm-wobble', 'm-startle'];
  const move = m => { if (reduce() || !m) return; body.classList.remove(...MOVES); void body.offsetWidth; body.classList.add('m-' + m); };
  body.addEventListener('animationend', e => { if (/^bd-(hop|wiggle|bob|wobble|startle)$/.test(e.animationName)) body.classList.remove(...MOVES); });

  const base = () => ({ pose: 'idle', expr: 'happy', dir: facing });
  const rest = () => { if (!held && !asleep && !flying && !watching) rig.set(base()); else if (watching && !asleep) watchFace(); };
  const free = () => !held && !asleep && now() > busyUntil;

  function act(name) {
    const e = EVENTS[name];
    if (!e || mode === 'wait') return;
    if (asleep) wake(false);
    stopFidget(); clearTimeout(actTimer);
    rig.set({ pose: e.pose, expr: e.expr, dir: facing }); move(e.move);
    busyUntil = now() + e.ms;
    actTimer = setTimeout(() => {
      if (e.then) { rig.set({ pose: e.then.pose, expr: e.then.expr, dir: facing }); busyUntil = now() + e.then.ms; actTimer = setTimeout(() => { busyUntil = 0; rest(); }, e.then.ms); }
      else { busyUntil = 0; rest(); }
    }, e.ms);
  }

  // ---------- talking ----------
  // Lines that arrive together (coins, level and a new best from one run) are pooled for a
  // moment and the most important one is said.
  let pending = null, pendTimer = 0;
  function say(text, prio) {
    if (pending && pending.prio >= prio) return;
    pending = { text, prio };
    clearTimeout(pendTimer); pendTimer = setTimeout(flush, 80);
  }
  function flush() {
    const p = pending; pending = null;
    if (!p || away || mode !== 'follow' || hiddenNow) return;
    const t = now();
    if (gameRoute() || said.has(p.text) || t - born < 3000 || t - lastSay < 15000) return;
    if (phone() && p.prio < 2) return;                 // fewer lines on a phone
    remember(p.text); speak(p.text);
  }
  function speak(text) {
    lastSay = now();
    clearTimeout(sayTimer); clearInterval(typeTimer);
    bubble.style.minWidth = ''; bubble.textContent = text;
    root.classList.add('talking'); sideOfBubble();
    if (!reduce()) {
      // types itself out at its final width so it does not grow sideways
      bubble.style.minWidth = bubble.offsetWidth + 'px';
      let i = 0; bubble.textContent = ''; typeTimer = setInterval(() => { bubble.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typeTimer); }, 28);
    }
    sayTimer = setTimeout(() => root.classList.remove('talking'), Math.min(5500, 2600 + text.length * 45));
  }
  // the bubble tries above-right, above-left, then level with it on either side, and takes the
  // first spot that covers no text or controls
  const SAYS = [['', (w, h) => [pos.x + S - 8, pos.y + 12 - h]], ['say-left', (w, h) => [pos.x + 8 - w, pos.y + 12 - h]],
    ['say-mid', (w, h) => [pos.x + S + 4, pos.y + S * 0.12]], ['say-left say-mid', (w, h) => [pos.x - 4 - w, pos.y + S * 0.12]]];
  function sideOfBubble() {
    if (!root.classList.contains('talking')) return;
    const w = bubble.offsetWidth || 200, h = bubble.offsetHeight || 40, top = headerBottom() + 2;
    textCache = new Map();
    let pick = SAYS.find(([, f]) => { const [x, y] = f(w, h); return x > 4 && x + w < innerWidth - 4 && y > top && y + h < viewH() - 4 && !blocked(x, y, w, h, true); });
    if (!pick) pick = pos.x + S + w > innerWidth - 8 ? SAYS[1] : SAYS[0];
    root.classList.remove('say-left', 'say-mid');
    if (pick[0]) root.classList.add(...pick[0].split(' '));
  }

  // ---------- progress events ----------
  if (window.WPM) {
    WPM.on('coins', ({ delta, reason }) => { if (delta > 0 && reason === 'typing' && free()) act('coins'); });
    WPM.on('level', ({ level }) => { act('level'); say(`You're level ${level} now.`, 2); });
    WPM.on('achievement', a => { act('achievement'); say(`You unlocked ${a.name}.`, 1); });
    WPM.on('session', ({ run, newBest }) => {
      if (!newBest || !run.wpm || run.score !== undefined) return;
      const art = WPM.ART_BEST;
      if (run.wpm > art) { act('beatart'); say(`${run.wpm} wpm. You beat Art's ${art}.`, 3); }
      else { act('best'); say(`New best. ${run.wpm} wpm.`, 3); }
    });
  }

  // ---------- sleeping after 60 seconds with no input ----------
  function sleep() {
    if (watching) return;
    asleep = true; stopFidget(); root.classList.add('napping');
    rig.set({ pose: 'sleep', expr: 'sleepy', ms: 900, dir: facing });
  }
  function wake(startle) {
    asleep = false; root.classList.remove('napping');
    if (startle) { rig.set({ pose: 'hop', expr: 'surprised', ms: 200 }); move('startle'); busyUntil = now() + 700; clearTimeout(actTimer); actTimer = setTimeout(() => { busyUntil = 0; rest(); }, 700); }
    else rest();
  }
  const poke = () => { lastInput = now(); if (asleep && mode === 'follow') wake(true); };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, poke, { passive: true }));
  addEventListener('scroll', () => { lastInput = now(); }, { passive: true });
  setInterval(() => { if (mode === 'follow' && !asleep && !held && !document.hidden && now() - lastInput > 60000) sleep(); }, 2000);

  // blinking and small things it does on its own while resting
  (function blink() { setTimeout(() => { if (mode === 'follow' && !asleep && !watching && free()) rig.blink(); blink(); }, 2600 + Math.random() * 3600); })();
  const FIDGETS = [
    [{ pose: 'idle', expr: 'curious', look: [-1, 0], ms: 900 }, { pose: 'idle', expr: 'curious', look: [1, 0], ms: 900 }, { pose: 'idle', expr: 'happy', look: [0, 0], ms: 300 }],
    [{ pose: 'think', expr: 'thinking', ms: 1500 }, { pose: 'idle', expr: 'happy', ms: 300 }],
    [{ pose: 'type', expr: 'focused', ms: 1400 }, { pose: 'idle', expr: 'proud', ms: 600 }],
    [{ pose: 'hop', expr: 'wink', ms: 500, move: 'hop' }, { pose: 'idle', expr: 'happy', ms: 300 }],
    [{ pose: 'wave', expr: 'happy', ms: 1200, move: 'wiggle' }],
  ];
  let fidgeting = false, fidgetTimers = [], lastFidget = -1;
  function stopFidget() { fidgetTimers.forEach(clearTimeout); fidgetTimers = []; if (fidgeting) { fidgeting = false; rig.look(0, 0); } }
  function playFidget(seq) {
    fidgeting = true; let t = 0;
    seq.forEach(st => {
      fidgetTimers.push(setTimeout(() => { rig.set({ pose: st.pose, expr: st.expr, dir: facing }); move(st.move); if (st.look) rig.look(st.look[0], st.look[1]); }, t));
      t += st.ms;
    });
    fidgetTimers.push(setTimeout(() => { fidgeting = false; rig.set(base()); }, t));
  }
  (function idlePlay() {
    setTimeout(() => {
      const ok = mode === 'follow' && !reduce() && !away && !hiddenNow && free() && !flying && !fidgeting && !watching
        && !root.classList.contains('talking') && !document.hidden && now() - lastInput < 45000;
      if (ok) {
        // games get only the quiet ones: looking round and thinking
        const pool = gameRoute() ? [0, 1] : FIDGETS.map((_, i) => i);
        let i; do { i = pool[Math.floor(Math.random() * pool.length)]; } while (i === lastFidget && pool.length > 1);
        lastFidget = i; playFidget(FIDGETS[i]);
      }
      idlePlay();
    }, 8000 + Math.random() * 7000);
  })();

  // eyes follow the mouse on desktop
  if (fine) addEventListener('pointermove', e => {
    lastInput = now();
    if (asleep || fidgeting || watching || mode !== 'follow') return;
    const dx = e.clientX - (pos.x + S / 2), dy = e.clientY - (pos.y + S / 2);
    const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
    rig.look(dx / d * k, dy / d * k);
  }, { passive: true });

  // ---------- watching the typing test and the race ----------
  let watching = false, watchT = 0, watchIv = 0, bads = [], lastBad = 0, lastWpm = 0, runStart = 0, hits = new Set();
  const typeTarget = () => route() === 'type' ? document.querySelector('.type-window') : route() === 'home' ? document.querySelector('.hero-race .typebox') : null;
  function watchFace() {
    if (!free()) return;
    rig.set({ pose: 'lean', expr: 'focused', dir: facing });
    const t = typeTarget();
    if (t) {
      const r = t.getBoundingClientRect(), dx = r.left + r.width / 2 - (pos.x + S / 2), dy = r.top + r.height / 2 - (pos.y + S / 2);
      const d = Math.hypot(dx, dy) || 1; rig.look(dx / d, dy / d);
    }
  }
  function readNum(sel) { const n = document.querySelector(sel); return n ? parseInt(n.textContent.replace(/[^\d]/g, ''), 10) || 0 : 0; }
  function watchTick() {
    if (now() - watchT > 1800 || !typeTarget()) { watching = false; clearInterval(watchIv); watchIv = 0; rig.look(0, 0); if (free()) rest(); return; }
    const isType = route() === 'type';
    const wpm = readNum(isType ? '.page-type [data-k="wpm"]' : '.hero-race [data-you]');
    if (wpm === 0 || wpm < lastWpm - 60) { hits = new Set(); runStart = now(); }
    lastWpm = wpm;
    if (now() - runStart > 3000) for (const th of [100, 150, 200]) if (wpm >= th && !hits.has(th)) { hits.add(th); act('fast'); break; }
    if (isType) {
      const bad = readNum('.page-type [data-k="bad"]');
      for (let i = lastBad; i < bad; i++) bads.push(now());
      bads = bads.filter(t => now() - t < 2500);
      if (bads.length >= 3) { bads = []; act('oops'); }
      lastBad = bad;
    }
    if (free() && !fidgeting) watchFace();
  }
  document.addEventListener('keydown', e => {
    if (mode !== 'follow' || away || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1 && e.key !== 'Backspace') return;
    const a = document.activeElement;
    const into = !a || a === document.body || a.id === 'view' || (a.classList && a.classList.contains('sr-input'));
    if (!into || !typeTarget()) return;
    watchT = now();
    if (asleep) wake(false);
    if (!watching) { watching = true; stopFidget(); runStart = runStart || now(); watchFace(); }
    if (!watchIv) watchIv = setInterval(watchTick, 220);
  }, true);

  // ---------- clicks, taps and picking it up ----------
  let taps = [], lastTap = -1;
  const TAPS = [
    { pose: 'hop', expr: 'wink', ms: 700, move: 'hop' },
    { pose: 'hop', expr: 'happy', ms: 700, move: 'hop' },
    { pose: 'cheer', expr: 'excited', ms: 800, move: 'hop' },
    { pose: 'idle', expr: 'wink', ms: 800, move: 'bob' },
  ];
  const grab = { id: null, sx: 0, sy: 0, dx: 0, dy: 0, moved: false };
  body.addEventListener('click', () => {
    if (grab.moved) { grab.moved = false; return; }
    if (mode !== 'follow') return;
    if (asleep) { wake(true); return; }
    const t = now(); taps = taps.filter(x => t - x < 1800); taps.push(t);
    stopFidget(); clearTimeout(actTimer); lastInput = t;
    if (taps.length >= 7) { taps = []; act('love'); return; }
    let r;
    if (taps.length >= 4) r = { pose: 'idle', expr: 'dizzy', ms: 1500, move: 'wobble' };
    else { let i; do { i = Math.floor(Math.random() * TAPS.length); } while (i === lastTap); lastTap = i; r = TAPS[i]; }
    rig.set({ pose: r.pose, expr: r.expr, dir: facing }); move(r.move);
    busyUntil = t + r.ms; actTimer = setTimeout(() => { busyUntil = 0; rest(); }, r.ms);
  });
  body.addEventListener('pointerdown', e => {
    if (mode !== 'follow' || e.button > 0) return;
    grab.id = e.pointerId; grab.sx = e.clientX; grab.sy = e.clientY; grab.dx = e.clientX - pos.x; grab.dy = e.clientY - pos.y; grab.moved = false;
  });
  addEventListener('pointermove', e => {
    if (grab.id !== e.pointerId) return;
    if (!grab.moved && Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy) < 7) return;
    if (!grab.moved) {
      grab.moved = true; mode = 'drag'; stopFidget(); clearTimeout(actTimer); busyUntil = Infinity; root.classList.remove('talking');
      if (asleep) wake(false);
      rig.set({ pose: 'cheer', expr: 'surprised', ms: 200 }); move('startle');
      try { body.setPointerCapture(e.pointerId); } catch (err) {}
      setTimeout(() => { if (mode === 'drag') rig.set({ expr: 'excited' }); }, 700);
    }
    vel.x = (e.clientX - grab.dx - pos.x) * 30; vel.y = (e.clientY - grab.dy - pos.y) * 30;
    pos.x = e.clientX - grab.dx; pos.y = e.clientY - grab.dy;
  }, { passive: true });
  const drop = e => {
    if (grab.id !== e.pointerId) return;
    grab.id = null;
    if (!grab.moved) return;
    mode = 'follow'; flying = true; busyUntil = now() + 900;
    rig.set({ pose: 'hop', expr: Math.hypot(vel.x, vel.y) > 1600 ? 'dizzy' : 'happy', ms: 200 });
    clearTimeout(actTimer); actTimer = setTimeout(() => { busyUntil = 0; rest(); }, 900);
  };
  addEventListener('pointerup', drop); addEventListener('pointercancel', drop);
  body.addEventListener('pointerup', () => setTimeout(() => body.blur(), 0));

  // ---------- hide and bring back ----------
  function setHidden(on) {
    away = !!on; store('buddy-away', on ? '1' : '');
    root.classList.toggle('away', away); peek.classList.toggle('on', away);
    if (!away && mode === 'follow') { first = true; act('hello'); }
    document.querySelectorAll('[data-buddy-toggle]').forEach(b => { b.textContent = `${away ? 'Show' : 'Hide'} ${NAME}`; });
  }
  hideBtn.addEventListener('click', () => setHidden(true));
  peek.addEventListener('click', () => setHidden(false));
  root.classList.toggle('away', away); peek.classList.toggle('on', away && mode !== 'wait');

  // ---------- phone: out of the way of the menu and the on-screen keyboard ----------
  let kbOpen = false;
  const field = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]),textarea,select';
  document.addEventListener('focusin', e => { if (!fine && e.target.matches && e.target.matches(field)) kbOpen = true; });
  document.addEventListener('focusout', () => { kbOpen = false; });
  const nav = document.getElementById('nav');
  let hiddenNow = false;

  // ---------- perches ----------
  const headerBottom = () => { const t = document.querySelector('.top'); return t ? Math.max(0, t.getBoundingClientRect().bottom) : 0; };
  const textRect = el => {
    const r = document.createRange(); r.selectNodeContents(el);
    const rs = [...r.getClientRects()].filter(x => x.width > 0); return rs.length ? rs[rs.length - 1] : el.getBoundingClientRect();
  };
  function spotFor(p, el, size, vh) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null;
    let x, y;
    if (p.at === 'out-r') { x = r.right + p.dx; y = r.bottom - size + p.dy; }
    else if (p.at === 'out-l') { x = r.left - size + p.dx; y = r.bottom - size + p.dy; }
    else if (p.at === 'in-br') { x = r.right - size + p.dx; y = r.bottom - size + p.dy; }
    else if (p.at === 'below') { x = r.left + p.dx; y = r.bottom + p.dy; }
    else { const t = textRect(el); x = t.right + p.dx; y = t.bottom - size + p.dy; }
    if (x < 4 || x + size > innerWidth - 4 || y < headerBottom() + 4 || y + size > vh - 4) return null;
    return { x, y };
  }
  // true when a box at x, y would cover text, a control or a game
  let textCache = new Map();
  function blocked(x, y, w, h, textToo) {
    const pad = 3, box = { l: x - pad, t: y + h * 0.06 - pad, r: x + w + pad, b: y + h + pad };
    for (const fy of [0.12, 0.5, 0.88]) for (const fx of [0.12, 0.5, 0.88]) {
      const px = x + w * fx, py = y + h * fy;
      if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) continue;
      for (const el of document.elementsFromPoint(px, py)) {
        if (el === root || root.contains(el) || el === peek) continue;
        if (el === document.body || el === html) break;
        if (el.closest(SOLID)) return true;
        if (textToo && TEXTY.test(el.tagName) && hasText(el, box)) return true;
      }
    }
    return false;
  }
  function hasText(el, box) {
    let rects = textCache.get(el);
    if (!rects) {
      rects = [];
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) {
        const r = document.createRange(); r.selectNodeContents(n);
        for (const q of r.getClientRects()) rects.push(q);
      }
      textCache.set(el, rects);
    }
    return rects.some(q => q.right > box.l && q.left < box.r && q.bottom > box.t && q.top < box.b);
  }
  // corners: bottom left first, then bottom right
  function corners(vh) {
    const s = CORNER();
    return [{ x: 6, y: vh - s - 8, face: 'right' }, { x: innerWidth - s - 8, y: vh - s - 8, face: 'left' }];
  }

  let cur = null, lastChoose = 0, arrivedAt = null;
  function choose(vh) {
    textCache = new Map();
    const desk = !phone(), size = SIZE(), line = vh * 0.42;
    let best = null, mine = null;
    if (desk) {
      const r = route();
      for (const p of PERCHES) {
        if (p.route !== r) continue;
        const els = p.all ? document.querySelectorAll(p.sel) : [document.querySelector(p.sel)];
        for (const el of els) {
          if (!el) continue;
          const s = spotFor(p, el, size, vh); if (!s || blocked(s.x, s.y, size, size, true)) continue;
          const score = Math.abs(s.y + size / 2 - line) - (p.bonus || 0);
          const c = { p, el, score, size };
          if (cur && cur.el === el && cur.p === p) mine = c;
          if (!best || score < best.score) best = c;
        }
      }
      if (mine && best && best !== mine && mine.score - best.score < 60) best = mine;   // stay put unless clearly better
    }
    if (!best) {
      // a corner: on a phone it may sit over text but never over a control
      const s = CORNER();
      const cs = corners(vh);
      if (cur && cur.corner != null) cs.unshift(cs.splice(cur.corner, 1)[0]);
      // a phone tries for a corner with no text first, then settles for one with no controls.
      // Home never lets it sit over text, so there it drops out of sight instead.
      const pick = cs.find(c => !blocked(c.x, c.y, s, s, true)) || (desk || route() === 'home' ? null : cs.find(c => !blocked(c.x, c.y, s, s, false)));
      if (pick) best = { corner: corners(vh).findIndex(c => c.x === pick.x), size: s, face: pick.face };
    }
    cur = best;
  }
  function target(vh) {
    if (!cur) return null;
    if (cur.corner != null) { const c = corners(vh)[cur.corner]; return { x: c.x, y: c.y, size: cur.size }; }
    if (!cur.el.isConnected) return null;
    const s = spotFor(cur.p, cur.el, cur.size, vh);
    return s ? { x: s.x, y: s.y, size: cur.size } : null;
  }

  // ---------- motion: a damped spring toward the perch, every frame ----------
  const viewH = () => window.visualViewport ? visualViewport.height : innerHeight;
  let offY = 0;
  function frame(nowT) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (nowT - lastT) / 1000); lastT = nowT;
    if (document.hidden || mode === 'wait') return;
    const vh = viewH();
    // on a phone the avatar creator needs the whole screen
    hiddenNow = away || (phone() && (kbOpen || (nav && nav.classList.contains('open')) || !!document.querySelector('.avc')));
    root.classList.toggle('stowed', hiddenNow && !away);
    if (away) return;
    if (mode === 'drag') { paint(); return; }
    const t = performance.now();
    if (t - lastChoose > (phone() ? 400 : 180) || !cur) { lastChoose = t; choose(vh); }
    let tg = target(vh);
    if (!tg && cur) { choose(vh); tg = target(vh); }
    let tx, ty, ts;
    if (tg && !hiddenNow) { tx = tg.x; ty = tg.y; ts = tg.size; offY = 0; }
    else { tx = pos.x; ts = S; ty = vh + 24; offY = 1; }       // nowhere free: drop out of sight below the screen
    if (first || reduce()) {
      pos.x = tx; pos.y = ty; vel.x = vel.y = 0; S = ts; first = false;
    } else {
      const k = 5.5;
      vel.x += ((tx - pos.x) * k * k - vel.x * 2 * k) * dt;
      vel.y += ((ty - pos.y) * k * k - vel.y * 2 * k) * dt;
      pos.x += vel.x * dt; pos.y += vel.y * dt;
      S += (ts - S) * Math.min(1, dt * 7);
    }
    const speed = Math.hypot(vel.x, vel.y);
    lean += ((reduce() ? 0 : Math.max(-12, Math.min(12, vel.x * 0.02))) - lean) * Math.min(1, dt * 8);
    paint();

    const face = cur && !offY ? (cur.p ? cur.p.face : cur.face) : null;
    if (!flying && speed > 160 && Math.hypot(tx - pos.x, ty - pos.y) > 30) {
      flying = true; root.classList.remove('talking'); stopFidget();
      if (free() && !offY) { rig.set({ pose: 'hop', expr: 'happy', ms: 240 }); body.classList.add('m-glide'); }
    }
    if (flying && Math.abs(vel.x) > 80) setFacing(vel.x > 0 ? 1 : -1);
    if (flying && speed < 30) { flying = false; body.classList.remove('m-glide'); land(face); }
    else if (!flying && speed < 30 && cur && cur.el !== arrivedAt) land(face);
  }
  function setFacing(d) { if (d !== facing) { facing = d; if (free() && !watching) rig.set({ dir: d }); } }
  function paint() {
    root.style.transform = `translate3d(${pos.x.toFixed(1)}px,${pos.y.toFixed(1)}px,0) rotate(${lean.toFixed(2)}deg)`;
    root.style.setProperty('--s', S.toFixed(1) + 'px');
    scaleEl.style.transform = `scale(${(S / BASE).toFixed(4)})`;
  }
  function land(face) {
    const fresh = cur && cur.el !== arrivedAt; arrivedAt = cur ? cur.el : null;
    if (face) setFacing(face === 'left' ? -1 : 1);
    sideOfBubble();
    if (!free() || watching) { if (watching) watchFace(); return; }
    const a = fresh && cur && cur.p && cur.p.arrive;
    if (a && now() - born > 1500) {
      rig.set({ pose: a[0], expr: a[1], dir: facing }); clearTimeout(actTimer);
      busyUntil = now() + 1400; actTimer = setTimeout(() => { busyUntil = 0; rest(); }, 1400);
    } else rig.set({ pose: 'idle', expr: base().expr, ms: 380, dir: facing });
  }

  // ---------- route changes ----------
  addEventListener('wpm-route', () => {
    watching = false; clearInterval(watchIv); watchIv = 0; hits = new Set(); lastBad = 0;
    cur = null; arrivedAt = null; lastChoose = 0;
  });
  addEventListener('resize', () => { lastChoose = 0; });

  // ---------- showing up ----------
  function appear(fromIntro) {
    if (mode !== 'wait') return;
    mode = 'follow'; born = now(); root.classList.remove('waiting');
    peek.classList.toggle('on', away);
    lastChoose = 0; choose(viewH());
    if (fromIntro && !reduce()) {
      // out of the portal: start small in the middle of the screen and fly to the perch
      first = false; S = 14; pos.x = innerWidth / 2 - 7; pos.y = viewH() / 2 - 7; vel.x = vel.y = 0;
      act('arrive');
    } else first = true;
    // it waves on every visit and says its name only the first time in this browser
    if (!away) setTimeout(() => {
      if (mode !== 'follow') return;
      act('hello');
      if (!phone() && !store('buddy-met')) { store('buddy-met', '1'); say(`Hi, I'm ${NAME}.`, 0); }
    }, 3100);
  }
  let waitTimer = 0;
  function waitForIntro() {
    mode = 'wait'; root.classList.add('waiting'); root.classList.remove('talking', 'napping'); asleep = false;
    // never stays hidden if the intro fails to load or to finish
    const check = () => { waitTimer = setTimeout(() => { if (window.Intro && Intro.active()) check(); else appear(false); }, 6000); };
    clearTimeout(waitTimer); check();
  }
  document.addEventListener('buddy', e => {
    const d = e.detail;
    if (d === 'intro') return waitForIntro();
    if (d === 'arrive') { clearTimeout(waitTimer); return appear(true); }
    if (d === 'done') { clearTimeout(actTimer); busyUntil = 0; rest(); return; }
    act(d);
  });
  if (html.classList.contains('intro')) waitForIntro(); else appear(false);

  window.Buddy = { NAME, hidden: () => away, setHidden };
  requestAnimationFrame(frame);
})();
