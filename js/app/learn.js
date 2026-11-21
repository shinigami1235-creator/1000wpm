// #/type/learn: the academy. The lesson map, each lesson (guide, finger keyboard, drill,
// result with stars) and the placement test. js/app/type-tabs.js mounts it as a tab of the
// Type page. Params: [] for the map, ['placement'] for the test, [lessonId] for a lesson.
// Progress is saved through WPM.learn() and WPM.setLearn().
window.LearnPage = (() => {
  const C = window.LEARN_COINS;
  const LS = () => LEARN.LESSONS;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/></svg>';
  const starRow = (n, cls = '') => `<span class="lx-stars ${cls}" aria-label="${n} of 3 stars">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}">${STAR}</i>`).join('')}</span>`;

  let el = null, stops = [];
  const stop = () => { stops.forEach(f => { try { f(); } catch (e) { console.error(e); } }); stops = []; };

  // ---------- progress ----------
  function prog() {
    const l = WPM.learn();
    const lessons = l.lessons || {};
    let open = l.open || 0;
    LS().forEach((L, i) => { if ((lessons[L.id] || {}).stars) open = Math.max(open, i + 1); });
    open = Math.min(open, LS().length - 1);
    const nextIdx = LS().findIndex((L, i) => i <= open && !(lessons[L.id] || {}).stars);
    const passed = LS().filter(L => (lessons[L.id] || {}).stars).length;
    const stars = LS().reduce((a, L) => a + ((lessons[L.id] || {}).stars || 0), 0);
    return { lessons, open, nextIdx, passed, stars, placement: l.placement || null, layout: l.layout || 'qwerty', allPaid: !!l.allPaid };
  }
  const layout = () => prog().layout;

  // the finger keyboard with the layout switch under it
  function keyboardBlock(host, { hands = true } = {}) {
    host.innerHTML = `<div data-fk></div>
      <div class="lx-layout"><span>Keyboard layout</span><div class="lx-seg" role="group" aria-label="Keyboard layout">
        ${Object.entries(FingerKeys.LAYOUTS).map(([id, L]) => `<button type="button" data-l="${id}" aria-pressed="${id === layout()}">${L.name}</button>`).join('')}
      </div></div>`;
    const fk = FingerKeys.mount(host.querySelector('[data-fk]'), { layout: layout(), hands });
    host.querySelector('.lx-seg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      WPM.setLearn({ layout: b.dataset.l });
      host.querySelectorAll('.lx-seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
      fk.setLayout(b.dataset.l);
      if (host.onLayout) host.onLayout(b.dataset.l);
    });
    stops.push(() => fk.destroy());
    return fk;
  }

  // ---------- map ----------
  function renderMap() {
    const p = prog(), e = UI.esc;
    const next = p.nextIdx >= 0 ? LS()[p.nextIdx] : null;
    const all = p.passed === LS().length;
    const placedOut = p.placement && p.placement.at >= LS().length;
    let main;
    if (next) main = `<a class="btn" href="#/type/learn/${next.id}">${p.passed || p.nextIdx ? `Continue with lesson ${p.nextIdx + 1}` : 'Start lesson 1'}</a>`;
    else main = `<a class="btn" href="#/type">Go to the typing test</a>`;
    const rows = [];
    LS().forEach((L, i) => {
      const s = (p.lessons[L.id] || {}).stars || 0;
      const locked = i > p.open;
      const state = locked ? 'locked' : s ? 'done' : i === p.nextIdx ? 'next' : 'open';
      const inner = `<span class="n">${i + 1}</span><span class="t"><b>${e(L.title)}</b><span>${e(L.blurb)}</span></span>
        ${locked ? `<span class="lk">${UI.icon('lock')}<span class="sr-only">Locked</span></span>` : starRow(s)}`;
      rows.push(locked
        ? `<li class="lx-row is-locked" aria-disabled="true"><div>${inner}</div></li>`
        : `<li class="lx-row is-${state}"><a href="#/type/learn/${L.id}">${inner}</a></li>`);
      const tip = LEARN.TIPS[L.id];
      if (tip && tip.map && i < LS().length - 1) rows.push(`<li class="lx-tip"><b>Tip</b><span>${e(tip.text)}</span></li>`);
    });
    el.innerHTML = `
      <div class="lx lx-map">
        <header class="lx-head">
          <h1>Academy</h1>
          <p class="lx-lead">${LS().length} lessons that take you from the home row to full sentences. Pass a lesson to open the next one.</p>
          <div class="lx-acts">${main}${all || placedOut ? '' : '<a class="btn out" href="#/type/learn/placement">Take the placement test</a>'}</div>
          <p class="lx-note">${placedOut ? `Your placement test opened every lesson. The <a href="#/type">typing test</a>, <a href="#/play/race">the race</a> and <a href="#/play/breach">Breach</a> are the next step.`
            : all ? `Every lesson is passed. The <a href="#/type">typing test</a>, <a href="#/play/race">the race</a> and <a href="#/play/breach">Breach</a> are the next step.`
            : 'The placement test takes 1 minute and opens every lesson you can skip.'}</p>
        </header>
        <div class="lx-cols">
          <section class="lx-lessons" aria-labelledby="lx-l">
            <h2 id="lx-l">Lessons <span class="lx-count">${p.passed} of ${LS().length} passed, ${p.stars} of ${LS().length * 3} stars</span></h2>
            <ol class="lx-list">${rows.join('')}</ol>
          </section>
          <section class="lx-zones" aria-labelledby="lx-z">
            <h2 id="lx-z">Finger zones</h2>
            <p class="lx-sub">Each colour is one finger on both hands. Your index fingers rest on the keys with a bump.</p>
            <div data-kb></div>
          </section>
        </div>
      </div>`;
    keyboardBlock(el.querySelector('[data-kb]'), { hands: false });
  }

  // ---------- lesson ----------
  function renderLesson(L) {
    const p = prog(), i = LS().indexOf(L);
    if (i > p.open) { location.hash = '#/type/learn'; return; }
    const K = () => FingerKeys.info(layout());
    const e = UI.esc;
    const guideTag = L.id === 'posture' ? 'ol' : 'ul';
    el.innerHTML = `
      <div class="lx lx-lesson">
        <nav class="lx-crumb" aria-label="Academy"><a href="#/type/learn">Academy</a><span>Lesson ${i + 1} of ${LS().length}</span></nav>
        <h1>${e(L.title)}</h1>
        <${guideTag} class="lx-guide" data-guide></${guideTag}>
        <div class="lx-stage" data-stage></div>
        <p class="lx-hint" data-hint></p>
        <div class="lx-kbwrap" data-kb></div>
      </div>`;
    const kbHost = el.querySelector('[data-kb]');
    const fk = keyboardBlock(kbHost);
    const paintGuide = () => { el.querySelector('[data-guide]').innerHTML = L.guide(K()).map(g => `<li>${e(g)}</li>`).join(''); };
    paintGuide();
    let box = null, offResult = null;
    const markLine = `Pass: ${L.pass.acc}% accuracy, then ${L.pass.wpm} wpm. 3 stars: ${L.three.acc}% and ${L.three.wpm} wpm.`;

    function start() {
      if (offResult) { offResult(); offResult = null; }
      const stage = el.querySelector('[data-stage]');
      stage.innerHTML = '';
      if (box) box.destroy();
      const k = K();
      fk.focus(L.keys(k));
      const text = L.drill(k);
      box = LearnTyper.mount(stage, text, {
        label: `Lesson ${i + 1}, ${L.title}`,
        onChar: (ok, tt) => fk.light(tt.text[tt.pos]),
        onBack: tt => fk.light(tt.text[tt.pos]),
        onDone: (tt, ms) => finish(tt, ms),
        onKey: key => { if (key === 'Tab' || key === 'Escape') start(); },
      });
      fk.light(text[0]);
      el.querySelector('[data-hint]').innerHTML = `${markLine} Press <kbd>Tab</kbd> for new text.`;
    }
    kbHost.onLayout = () => { paintGuide(); start(); };

    function finish(tt, ms) {
      const wpm = Math.round((tt.correct / 5) / Math.max(ms, 1000) * 60000);
      const acc = tt.accuracy();
      const st = LEARN.stars(L, acc, wpm);
      const now = prog();
      const prev = now.lessons[L.id] || { stars: 0, wpm: 0, acc: 0 };
      let coins = 0;
      if (st && !prev.stars) coins += C.lessonPass;
      if (st > prev.stars) coins += C.perNewStar * (st - prev.stars);
      const lessons = { ...now.lessons, [L.id]: { stars: Math.max(prev.stars, st), wpm: Math.max(prev.wpm || 0, wpm), acc: Math.max(prev.acc || 0, acc) } };
      WPM.setLearn({ lessons, open: Math.max(now.open, st ? i + 1 : 0) });
      WPM.record({ mode: 'learn-' + L.id, wpm, acc, correct: tt.correct, keys: tt.typed, ms: Math.round(ms), coins });
      const allNow = LS().every(x => (lessons[x.id] || {}).stars);
      let bonus = 0;
      if (allNow && !now.allPaid) { bonus = C.allPassed; WPM.setLearn({ allPaid: true }); WPM.addCoins(bonus, 'academy'); }
      if (!st) document.dispatchEvent(new CustomEvent('buddy', { detail: 'oops' }));
      box.destroy(); box = null;
      fk.light(null);
      showResult({ st, acc, wpm, coins: coins + bonus, prev, allNow });
    }

    function showResult({ st, acc, wpm, coins, prev, allNow }) {
      const next = LS()[i + 1];
      let msg = '';
      if (acc < L.pass.acc) msg = `Accuracy is ${acc}% and the pass mark is ${L.pass.acc}%. Slow down and try again.`;
      else if (!st) msg = `Accuracy passed. Speed is ${wpm} wpm and the pass mark is ${L.pass.wpm} wpm.`;
      else if (st < 3) {
        const m = st === 1 ? L.two : L.three;
        msg = `${st + 1} stars needs ${m.acc}% accuracy and ${m.wpm} wpm.`;
        if (prev.stars > st) msg += ` Your best on this lesson is ${prev.stars} stars.`;
      }
      if (allNow && st && !next) msg = 'You passed every lesson in the academy. The typing test, the race and Breach are the next step.';
      let acts;
      if (!st) acts = `<button class="btn" type="button" data-again>Try again</button><a class="btn out" href="#/type/learn">Academy</a>`;
      else if (next) acts = `<a class="btn" href="#/type/learn/${next.id}" data-main>Next lesson: ${e(next.title)}</a><button class="btn out" type="button" data-again>Try again</button>`;
      else acts = `<a class="btn" href="#/type" data-main>Go to the typing test</a><a class="btn out" href="#/play/race">Race Art</a><button class="btn out" type="button" data-again>Try again</button>`;
      const tip = LEARN.TIPS[L.id];
      el.querySelector('[data-stage]').innerHTML = `
        <div class="lx-result${st ? ' pass' : ' fail'}" aria-live="polite">
          ${starRow(st, 'big')}
          <h2>${st ? 'Passed' : 'Not passed'}</h2>
          <div class="lx-nums">
            <div class="${acc >= L.pass.acc ? '' : 'miss'}"><b>${acc}%</b><span>Accuracy, pass ${L.pass.acc}%</span></div>
            <div class="${wpm >= L.pass.wpm ? '' : 'miss'}"><b>${wpm}</b><span>Wpm, pass ${L.pass.wpm}</span></div>
            ${coins ? `<div class="coin"><b>+${coins}</b><span>Coins</span></div>` : ''}
          </div>
          ${msg ? `<p class="lx-msg">${e(msg)}</p>` : ''}
          <div class="lx-acts">${acts}</div>
          ${tip ? `<p class="lx-tipline"><b>Tip</b><span>${e(tip.text)}</span></p>` : ''}
        </div>`;
      el.querySelector('[data-hint]').innerHTML = st ? 'Press <kbd>Enter</kbd> for the next lesson or <kbd>Tab</kbd> to try again.' : 'Press <kbd>Tab</kbd> to try again.';
      el.querySelectorAll('[data-again]').forEach(b => b.addEventListener('click', start));
      const onKey = ev => {
        if (ev.key === 'Tab') { ev.preventDefault(); start(); }
        else if (ev.key === 'Enter' && st && document.activeElement === document.body) { const m = el.querySelector('[data-main]'); if (m) { ev.preventDefault(); m.click(); } }
      };
      document.addEventListener('keydown', onKey);
      offResult = () => document.removeEventListener('keydown', onKey);
    }

    start();
    stops.push(() => { if (box) box.destroy(); if (offResult) offResult(); });
  }

  // ---------- placement test ----------
  function renderPlacement() {
    const P = LEARN.PLACEMENT;
    el.innerHTML = `
      <div class="lx lx-lesson lx-place">
        <nav class="lx-crumb" aria-label="Academy"><a href="#/type/learn">Academy</a><span>Placement test</span></nav>
        <h1>Placement test</h1>
        <p class="lx-lead">Type the text below at your normal speed for up to 1 minute. The result opens every lesson you can skip.</p>
        <div class="lx-stage" data-stage></div>
        <p class="lx-hint split"><span data-hint></span><b class="lx-clock" data-clock>0:00 / ${UI.clock(P.secs)}</b></p>
      </div>`;
    let box = null, iv = 0, offResult = null;
    const clock = el.querySelector('[data-clock]');
    function start() {
      clearInterval(iv);
      if (offResult) { offResult(); offResult = null; }
      if (box) box.destroy();
      const stage = el.querySelector('[data-stage]');
      stage.innerHTML = '';
      clock.hidden = false;
      clock.textContent = `0:00 / ${UI.clock(P.secs)}`;
      box = LearnTyper.mount(stage, LearnWords.common(P.words, { top: P.top }).join(' '), {
        label: 'Placement test',
        onDone: (tt, ms) => finish(tt, ms),
        onKey: k => { if (k === 'Tab' || k === 'Escape') start(); },
      });
      el.querySelector('[data-hint]').innerHTML = 'The timer starts on your first key. Press <kbd>Tab</kbd> to start over.';
      iv = setInterval(() => {
        const tt = box && box.tt;
        if (!tt || !tt.startT) return;
        const ms = performance.now() - tt.startT;
        clock.textContent = `${UI.clock(Math.min(ms, P.secs * 1000) / 1000)} / ${UI.clock(P.secs)}`;
        if (ms >= P.secs * 1000) finish(tt, P.secs * 1000);
      }, 200);
    }
    function finish(tt, ms) {
      clearInterval(iv);
      if (!box) return;
      const wpm = Math.round((tt.correct / 5) / Math.max(ms, 1000) * 60000);
      const acc = tt.accuracy();
      const at = LEARN.place(wpm, acc);
      const p = prog();
      const first = !p.placement;
      WPM.setLearn({ placement: { wpm, acc, at, on: UI.day() }, open: Math.max(p.open, Math.min(at, LS().length - 1)) });
      WPM.record({ mode: 'placement', wpm, acc, correct: tt.correct, keys: tt.typed, ms: Math.round(ms), coins: first ? C.placement : 0 });
      box.destroy(); box = null;
      clock.hidden = true;
      const L = LS()[at];
      let msg, acts;
      if (at >= LS().length) {
        msg = 'You can already type. Every lesson is open and the typing test is your next step.';
        acts = `<a class="btn" href="#/type" data-main>Go to the typing test</a><a class="btn out" href="#/play/race">Race Art</a><a class="btn out" href="#/type/learn">Academy</a>`;
      } else {
        msg = at ? `Lessons 1 to ${at} are open. Start at lesson ${at + 1}, ${L.title}.` : `Start at lesson 1, ${L.title}.`;
        acts = `<a class="btn" href="#/type/learn/${L.id}" data-main>Start lesson ${at + 1}</a><a class="btn out" href="#/type/learn">Academy</a>`;
      }
      el.querySelector('[data-stage]').innerHTML = `
        <div class="lx-result pass" aria-live="polite">
          <div class="lx-nums">
            <div><b>${wpm}</b><span>Wpm</span></div>
            <div><b>${acc}%</b><span>Accuracy</span></div>
            ${first && C.placement ? `<div class="coin"><b>+${C.placement}</b><span>Coins</span></div>` : ''}
          </div>
          <p class="lx-msg">${UI.esc(msg)}</p>
          <div class="lx-acts">${acts}</div>
        </div>`;
      el.querySelector('[data-hint]').innerHTML = 'Press <kbd>Tab</kbd> to take the test again.';
      const onKey = ev => { if (ev.key === 'Tab') { ev.preventDefault(); start(); } };
      document.addEventListener('keydown', onKey);
      offResult = () => document.removeEventListener('keydown', onKey);
    }
    start();
    stops.push(() => { clearInterval(iv); if (box) box.destroy(); if (offResult) offResult(); });
  }

  // ---------- page ----------
  function show(params) {
    stop();
    const id = params[0] || '';
    const L = LEARN.byId(id);
    if (id === 'placement') renderPlacement();
    else if (L) renderLesson(L);
    else renderMap();
    document.title = `${id === 'placement' ? 'Placement test' : L ? L.title : 'Academy'} | 10000WPM`;
    scrollTo(0, 0);
  }

  return {
    title: 'Academy',
    mount(root, params) { el = root; show(params || []); },
    update(params) { show(params || []); },
    unmount() { stop(); el = null; },
  };
})();
