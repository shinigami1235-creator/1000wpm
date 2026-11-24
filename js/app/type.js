// #/type: the typing test. Modes words, time, quote and custom, with live stats,
// a live wpm chart and a result that shows the coins and XP the run earned.
Router.register('type', (() => {
  const QUOTES = [
    'The best way to type faster is to type slowly at first. Speed comes once your fingers stop guessing where the keys are.',
    'Rain started a little after six so the market packed up early. By seven the street was empty except for one man selling umbrellas.',
    'Keep your wrists off the desk and let your fingers rest on the home row. Every key you need is one short reach from there.',
    'She left the window open all night and woke up to find the cat asleep on her keyboard. It had typed four pages of the letter j.',
    'A good warm up is two easy minutes of common words. After that your hands are loose and your first real test is usually your best.',
    'The bus was late again so he walked the last two stops. It was faster anyway and he found a coin on the bridge.',
    'Switches decide how a keyboard feels. Linear switches go straight down, tactile ones have a bump and clicky ones make a sharp sound.',
    'Look at the screen instead of your hands. It feels slower for a week and then it feels like you never typed any other way.',
    'He typed one word for every follower he had. On the first day that was eleven words and on the last day it was twenty five thousand.',
  ];
  const SECS = [15, 30, 60, 120], COUNTS = [25, 50, 100];

  let el, tt, keys, iv = 0, stopKey = null, onResize = null;
  let opt, running, ended, startT, samples, lastQuote = '', hist, raws, ks;

  const modeKey = () => opt.mode === 'time' ? `time-${opt.secs}` : opt.mode === 'words' ? `words-${opt.count}` : opt.mode;

  // the WPM needle beside the live number: the far right of the dial is Art's top speed
  const GAUGE = `<svg class="wpm-gauge" viewBox="0 0 64 38" aria-hidden="true">
      <path class="g-arc" d="M6 34 A26 26 0 0 1 58 34"/>
      <path class="g-art" d="M54.5 28.4 L58.6 26.6"/>
      <path class="g-needle" data-needle d="M32 34 L32 11"/>
      <circle class="g-hub" cx="32" cy="34" r="3"/>
    </svg>`;
  let gauge = null;

  function mount(root) {
    el = root;
    opt = { mode: 'time', secs: 60, count: 50, caps: 1, ...TT.store.get('wpm-type-opts', {}), wset: TT.wordset() };
    el.innerHTML = `
      <div class="type-top">
        <div class="panel title-block">
          <div class="ph">&gt; TYPING TEST</div>
          <h1>Type_</h1>
          <p data-k="sub"></p>
        </div>
        <div class="panel type-opts">
          <div class="row"><span class="label">Mode</span>
            <div class="seg" data-g="mode" role="group" aria-label="Mode">
              <button type="button" data-v="words">Words</button><button type="button" data-v="time">Time</button>
              <button type="button" data-v="quote">Quote</button><button type="button" data-v="custom">Custom</button>
            </div>
          </div>
          <div class="row" data-row="secs"><span class="label">Duration</span>
            <div class="seg" data-g="secs" role="group" aria-label="Duration">${SECS.map(s => `<button type="button" data-v="${s}">${s}s</button>`).join('')}</div>
          </div>
          <div class="row" data-row="count"><span class="label">Words</span>
            <div class="seg" data-g="count" role="group" aria-label="Word count">${COUNTS.map(s => `<button type="button" data-v="${s}">${s}</button>`).join('')}</div>
          </div>
          <div class="row" data-row="wset"><span class="label">Word set</span>
            <div class="seg" data-g="wset" role="group" aria-label="Word set"><button type="button" data-v="mt">Monkeytype 200</button><button type="button" data-v="mt1k">Monkeytype 1k</button><button type="button" data-v="big">Expanded</button></div>
          </div>
          <div class="row" data-row="none"><span class="label">Length</span><span class="dim" data-k="len"></span></div>
          <div class="row" data-row="caps"><span class="label">Capitals</span>
            <div class="seg" data-g="caps" role="group" aria-label="Capitals"><button type="button" data-v="1">On</button><button type="button" data-v="0">Off</button></div>
          </div>
          ${window.Focus ? `<div class="row"><span class="label">Focus</span>
            <div class="seg" data-focus role="group" aria-label="Focus mode"><button type="button" data-v="on">On</button><button type="button" data-v="off">Off</button></div>
          </div>` : ''}
        </div>
      </div>

      <div class="type-stats">
        <div class="panel hot statrow">
          <div><span class="label">&gt; WPM</span><div class="wpm-read"><b class="big" data-k="wpm">0</b>${GAUGE}</div></div>
          <div><span class="label">Accuracy</span><b class="mid" data-k="acc">100%</b></div>
          <div><span class="label">Correct</span><b class="mid" data-k="ok">0</b></div>
          <div><span class="label">Incorrect</span><b class="mid red" data-k="bad">0</b></div>
          <div><span class="label">Time</span><b class="mid time" data-k="time">0:00</b></div>
        </div>
        <div class="panel progress">
          <div class="ph">&gt; PROGRESS</div>
          <div class="row"><div class="segbar" data-k="bar">${'<i></i>'.repeat(20)}</div><b class="pct" data-k="pct">0%</b></div>
        </div>
      </div>

      <div class="panel hot type-text">
        <div class="ph">&gt; TYPE THE TEXT BELOW<span class="meta" data-k="run"></span></div>
        <div data-k="stage"></div>
        <div class="type-help" data-k="help"></div>
      </div>

      <div class="type-bottom">
        <div class="panel">
          <div class="ph">&gt; LIVE STATS<span class="meta">WPM EACH SECOND</span></div>
          <div class="chart-wrap">
            <canvas class="chart" data-k="chart"></canvas>
            <div class="side-nums">
              <div><span class="label">Peak wpm</span><b class="mid" data-k="peak">0</b></div>
              <div><span class="label">Avg wpm</span><b class="mid" data-k="avg">0</b></div>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="ph">&gt; SESSION INFO</div>
          <dl class="kv">
            <dt>Mode</dt><dd class="green" data-k="i-mode"></dd>
            <dt>Total chars</dt><dd data-k="i-total">0</dd>
            <dt>Correct chars</dt><dd data-k="i-ok">0</dd>
            <dt>Incorrect chars</dt><dd data-k="i-bad">0</dd>
            <dt>Calculation</dt><dd>correct ÷ 5 ÷ minutes</dd>
          </dl>
        </div>
        <div class="panel">
          <div class="ph">&gt; RECORDS</div>
          <dl class="kv" data-k="records"></dl>
        </div>
      </div>`;

    const q = k => el.querySelector(`[data-k="${k}"]`);
    el.q = q;
    const fs = el.querySelector('[data-focus]');
    if (fs) fs.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      Focus.setEnabled(b.dataset.v === 'on');
      paintOpts();
      if (keys) keys.focus();
    });
    el.querySelectorAll('.seg[data-g]').forEach(g => g.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const k = g.dataset.g;
      opt[k] = k === 'mode' || k === 'wset' ? b.dataset.v : +b.dataset.v;
      if (k === 'wset') TT.setWordset(opt.wset);
      TT.store.set('wpm-type-opts', opt);
      reset();
      if (keys) keys.focus();
    }));

    // Typing anywhere with nothing focused goes to the test.
    stopKey = e => {
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'view') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || !keys) return;
      e.preventDefault();
      keys.focus();
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    };
    document.addEventListener('keydown', stopKey);
    onResize = () => { if (tt && !ended) { tt.invalidate(); tt.place(tt.caret, tt.pos); scroll(); } drawChart(); };
    addEventListener('resize', onResize);
    reset();
    document.fonts.ready.then(() => { if (el && tt && !running && !ended) reset(); });
  }

  function textFor() {
    if (opt.mode === 'time') return TT.testWords(Math.max(120, opt.secs * 4.5), opt.wset).join(' ');
    if (opt.mode === 'words') return TT.testWords(opt.count, opt.wset).join(' ');
    if (opt.mode === 'quote') {
      // the free typing passages (short and medium) once they have loaded, the few quotes above until then
      const P = window.PASSAGES;
      const list = P ? P.LIST.filter(x => x.len === 'short' || x.len === 'medium').map(x => x.text) : QUOTES;
      if (!P && window.Lazy) Lazy.need('passages').then(() => { if (el && opt.mode === 'quote' && !running && !ended) reset(); }).catch(() => {});
      let i; do { i = Math.floor(Math.random() * list.length); } while (list[i] === lastQuote && list.length > 1);
      lastQuote = list[i];
      return opt.caps ? list[i] : list[i].toLowerCase();
    }
    return TT.store.get('wpm-custom-text', '');
  }

  function paintOpts() {
    el.querySelectorAll('.seg[data-g]').forEach(g => g.querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-pressed', String(opt[g.dataset.g]) === b.dataset.v);
    }));
    el.querySelector('[data-row="secs"]').hidden = opt.mode !== 'time';
    el.querySelector('[data-row="count"]').hidden = opt.mode !== 'words';
    el.querySelector('[data-row="wset"]').hidden = opt.mode !== 'time' && opt.mode !== 'words';
    el.querySelector('[data-row="none"]').hidden = opt.mode === 'time' || opt.mode === 'words';
    el.querySelector('[data-row="caps"]').hidden = opt.mode !== 'quote';
    el.querySelectorAll('[data-focus] button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === 'on') === Focus.enabled()));
    el.q('len').textContent = opt.mode === 'quote' ? 'One passage from a book or a speech' : 'Your own text';
    el.q('i-mode').textContent = UI.modeName(modeKey());
    const n = WPM.sessions().length + 1;
    el.q('run').textContent = `[ RUN ${n} ]`;
    el.q('sub').textContent = `// ${UI.modeName(modeKey()).toUpperCase()}`;
  }

  function paintRecords() {
    const best = WPM.best()[modeKey()];
    const st = WPM.stats();
    el.q('records').innerHTML = `
      <dt>Your best, ${UI.esc(UI.modeName(modeKey()))}</dt><dd class="green">${best ? best + ' wpm' : 'none yet'}</dd>
      <dt>Your best, any mode</dt><dd>${st.bestWpm ? st.bestWpm + ' wpm' : 'none yet'}</dd>
      <dt>Art's best</dt><dd class="cyan">${TT.ART_WPM} wpm</dd>
      <dt>Runs on this device</dt><dd>${UI.fmt(st.sessions)}</dd>`;
  }

  function reset() {
    clearInterval(iv);
    stopTab();
    if (window.Focus) Focus.end();
    running = false; ended = false; startT = 0; UI.play('type', false); samples = []; hist = []; raws = []; ks = {};
    paintOpts(); paintRecords();
    const stage = el.q('stage');
    stage.innerHTML = '';
    keys = null; tt = null;
    const text = textFor().replace(/\s+/g, ' ').trim();
    if (opt.mode === 'custom' && !text) return customForm(stage);
    const win = UI.el(`<div class="type-window typebox idle" tabindex="-1"><div class="focus-note"><span class="fn-key">CLICK HERE OR PRESS ANY KEY TO TYPE</span><span class="fn-tap">TAP HERE TO TYPE</span></div></div>`);
    stage.append(win);
    tt = new TT.TypeText(win);
    tt.set(text);
    keys = TT.captureKeys(win, {
      label: 'Typing test',
      onChar(ch) {
        if (ended) return;
        if (!running) start();
        win.classList.remove('idle');
        const want = tt.text[tt.pos];
        const ok = tt.input(ch);
        if (want !== undefined && ok !== null) noteKey(want, ok);
        TT.click(ch === ' ');
        scroll();
        if (tt.done()) finish();
        else live();
      },
      onBack(word) { if (running) { word ? tt.backWord() : tt.back(); scroll(); live(); } },
      onKey(k) { if (k === 'Tab' || k === 'Escape') reset(); },
    });
    el.q('help').innerHTML = (opt.mode === 'time' ? 'The timer starts on your first key. ' : '') +
      'Press <kbd>Tab</kbd> to start over.' +
      (opt.mode === 'custom' ? ' <button class="btn out sm" type="button" data-k="edit">Change text</button>' : '');
    const edit = el.q('edit');
    if (edit) edit.addEventListener('click', () => { TT.store.set('wpm-custom-text', ''); reset(); });
    live();
    drawChart();
    if (matchMedia('(pointer: fine)').matches) keys.focus();
  }

  function customForm(stage) {
    const f = UI.el(`<form class="custom-box">
      <label class="label" for="custom-text">Paste or type the text you want to practise</label>
      <textarea id="custom-text" class="field" maxlength="5000" spellcheck="false"></textarea>
      <div><button class="btn" type="submit">Start</button></div>
    </form>`);
    stage.append(f);
    el.q('help').textContent = 'Line breaks become spaces.';
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const t = f.querySelector('textarea').value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
      if (!t) return;
      TT.store.set('wpm-custom-text', t);
      reset();
    });
    live();
    drawChart();
  }

  function start() {
    running = true; UI.play('type', true);
    startT = performance.now();
    let lastSample = startT;
    hist = [{ t: startT, c: 0, k: 0 }];
    iv = setInterval(() => {
      const now = performance.now();
      if (now - lastSample >= 1000) {
        lastSample += 1000;
        const prev = hist[hist.length - 1];
        hist.push({ t: now, c: tt.correct, k: tt.typed });
        raws.push(((tt.typed - prev.k) / 5) / ((now - prev.t) / 60000 || 1));
        const back = hist[Math.max(0, hist.length - 3)];
        const w = Math.round(((tt.correct - back.c) / 5) / ((now - back.t) / 60000 || 1));
        samples.push(Math.max(0, w));
        drawChart();
      }
      if (opt.mode === 'time' && now - startT >= opt.secs * 1000) finish();
      else live();
    }, 100);
  }

  function elapsed() { return running ? performance.now() - startT : 0; }

  function needle(v) {
    if (!gauge && window.Motion) gauge = Motion.gauge(el.querySelector('.wpm-gauge'), TT.ART_WPM);
    if (gauge) gauge.set(v);
  }

  function live() {
    if (!tt) {
      needle(0);
      ['wpm', 'ok', 'bad'].forEach(k => el.q(k).textContent = '0');
      el.q('acc').textContent = '100%';
      el.q('time').textContent = '0:00';
      return paintProgress(0);
    }
    const ms = elapsed();
    el.q('wpm').textContent = running ? tt.wpm() : 0;
    needle(running ? tt.wpm() : 0);
    el.q('acc').textContent = tt.accuracy() + '%';
    el.q('ok').textContent = UI.fmt(tt.correct);
    el.q('bad').textContent = UI.fmt(tt.errors);
    el.q('time').textContent = opt.mode === 'time' ? `${UI.clock(ms / 1000)} / ${UI.clock(opt.secs)}` : UI.clock(ms / 1000);
    el.q('i-total').textContent = UI.fmt(tt.typed);
    el.q('i-ok').textContent = UI.fmt(tt.correct);
    el.q('i-bad').textContent = UI.fmt(tt.errors);
    paintProgress(opt.mode === 'time' ? ms / (opt.secs * 1000) : tt.pos / tt.spans.length);
  }

  function paintProgress(f) {
    f = Math.max(0, Math.min(1, f));
    const on = Math.round(f * 20);
    el.q('bar').querySelectorAll('i').forEach((b, i) => b.classList.toggle('on', i < on));
    el.q('pct').textContent = Math.round(f * 100) + '%';
  }

  function drawChart() {
    if (!el) return;
    UI.lineChart(el.q('chart'), samples, {
      labels: samples.map((_, i) => `${i + 1}s`),
      min: samples.length ? undefined : 0,
      empty: 'The chart starts on your first key',
      tag: samples.length ? `${samples[samples.length - 1]} WPM` : '',
    });
    const peak = samples.length ? Math.max(...samples) : 0;
    const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0;
    el.q('peak').textContent = peak;
    el.q('avg').textContent = avg;
  }

  // Keep the caret on the second line once the first line is done.
  function scroll() {
    const p = tt.xy(tt.pos);
    const lh = tt.lineH();
    const row = Math.floor((p.y + p.h / 2) / lh);
    tt.el.style.transform = `translateY(${-Math.max(0, row - 1) * lh}px)`;
  }

  function finish() {
    if (ended) return;
    clearInterval(iv);
    const now = performance.now();
    const ms = opt.mode === 'time' ? opt.secs * 1000 : now - startT;
    if (opt.mode === 'time') hist.push({ t: now, c: tt.correct, k: tt.typed });
    running = false; ended = true; UI.play('type', false);
    if (window.Focus) Focus.end();
    const wpm = Math.round((tt.correct / 5) / (ms / 60000));
    const raw = Math.round((tt.typed / 5) / (ms / 60000));
    const acc = tt.accuracy();
    const cons = consistency(raws);
    const key = modeKey();
    const prevBest = WPM.best()[key];
    const weak = weakest(ks);
    const r = WPM.record({ mode: key, wpm, raw, acc, cons, correct: tt.correct, keys: tt.typed, ms: Math.round(ms), keyStats: ks });
    WPM.track('type_test', { mode: key, wpm, acc, correct: tt.correct, ms: Math.round(ms) });
    el.q('wpm').textContent = wpm;
    needle(wpm);
    el.q('time').textContent = UI.clock(ms / 1000) + (opt.mode === 'time' ? ` / ${UI.clock(opt.secs)}` : '');
    paintProgress(1);
    drawChart();
    paintRecords();
    const ART = TT.ART_WPM;
    const pct = Math.round((wpm / ART) * 100);
    const vsArt = wpm >= ART
      ? `You beat Art's ${ART} wpm by ${wpm - ART}.`
      : `You typed ${pct}% of Art's ${ART} wpm, ${ART - wpm} wpm short.`;
    const pb = r.newBest && prevBest > 0;
    el.q('stage').innerHTML = `
      ${pb ? `<p class="pb-banner" role="status"><b>New personal best</b><span>${wpm} wpm, up from ${prevBest} in ${UI.esc(UI.modeName(key))}</span></p>` : ''}
      <div class="result" aria-live="polite">
        <div><div class="big">${wpm}</div><div class="unit">WPM, ${UI.esc(UI.modeName(key).toUpperCase())}</div></div>
        <div class="result-grid">
          <div class="stat"><span class="label">Raw wpm</span><b class="mid">${raw}</b></div>
          <div class="stat"><span class="label">Accuracy</span><b class="mid">${acc}%</b></div>
          <div class="stat"><span class="label">Consistency</span><b class="mid">${cons == null ? '<span class="dim">n/a</span>' : cons + '%'}</b></div>
          <div class="stat"><span class="label">Vs Art</span><b class="mid cyan">${pct}%</b></div>
          <div class="stat"><span class="label">Coins</span><b class="mid gold">+${r.coins}</b></div>
          <div class="stat"><span class="label">XP</span><b class="mid green">+${r.xp}</b></div>
          <div class="stat weak-keys"><span class="label">Weakest keys</span>${weak.length
            ? `<span class="wk-list">${weak.map(w => `<span class="wk"><kbd>${UI.esc(keyLabel(w.k))}</kbd> ${w.bad} of ${w.n} missed</span>`).join('')}</span>`
            : '<span class="dim">No missed keys</span>'}</div>
          <p class="result-note">${vsArt}${r.newBest && !pb ? ` <span class="new">First ${UI.esc(UI.modeName(key))} run.</span>` : ''}</p>
        </div>
      </div>`;
    el.q('help').innerHTML = 'Press <kbd>Tab</kbd> or the button to start over. <button class="btn out sm" type="button" data-k="again">Start over</button>';
    el.q('again').addEventListener('click', () => reset());
    // keep Tab working after the text is gone
    const tab = e => { if (e.key === 'Tab' && ended) { e.preventDefault(); document.removeEventListener('keydown', tab); reset(); } };
    document.addEventListener('keydown', tab);
    stopTab = () => document.removeEventListener('keydown', tab);
  }
  let stopTab = () => {};

  // per-key results for this run, keyed by the character the text asked for
  function noteKey(want, ok) {
    const k = want === ' ' ? ' ' : want.toLowerCase();
    const t = (ks[k] ||= [0, 0]);
    t[ok ? 0 : 1]++;
  }
  // up to three keys with misses, most missed first
  function weakest(map) {
    return Object.entries(map).filter(([, [, bad]]) => bad > 0)
      .map(([k, [ok, bad]]) => ({ k, bad, n: ok + bad, rate: bad / (ok + bad) }))
      .sort((a, b) => b.bad - a.bad || b.rate - a.rate).slice(0, 3);
  }
  const keyLabel = k => k === ' ' ? 'space' : k;
  // How steady the raw speed was from second to second, 0 to 100. Same curve as
  // Monkeytype: 100 * (1 - tanh(cv + cv^3/3 + cv^5/5)), cv = spread / mean.
  function consistency(a) {
    if (!a || a.length < 3) return null;
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    if (!m) return 0;
    const cv = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m;
    return Math.max(0, Math.round(100 * (1 - Math.tanh(cv + cv ** 3 / 3 + cv ** 5 / 5))));
  }

  function unmount() {
    clearInterval(iv);
    stopTab();
    if (window.Focus) Focus.end();
    document.removeEventListener('keydown', stopKey);
    removeEventListener('resize', onResize);
    if (gauge) gauge.destroy();
    el = null; tt = null; keys = null; gauge = null;
  }

  return { title: 'Type', mount, unmount };
})());
