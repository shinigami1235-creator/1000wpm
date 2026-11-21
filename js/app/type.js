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
  let opt, running, ended, startT, samples, lastQuote = -1, hist;

  const modeKey = () => opt.mode === 'time' ? `time-${opt.secs}` : opt.mode === 'words' ? `words-${opt.count}` : opt.mode;

  function mount(root) {
    el = root;
    opt = { mode: 'time', secs: 60, count: 50, ...TT.store.get('wpm-type-opts', {}) };
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
          <div class="row" data-row="none"><span class="label">Length</span><span class="dim" data-k="len"></span></div>
        </div>
      </div>

      <div class="type-stats">
        <div class="panel hot statrow">
          <div><span class="label">&gt; WPM</span><b class="big" data-k="wpm">0</b></div>
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
    el.querySelectorAll('.seg[data-g]').forEach(g => g.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const k = g.dataset.g;
      opt[k] = k === 'mode' ? b.dataset.v : +b.dataset.v;
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
    onResize = () => { if (tt && !ended) { tt.place(tt.caret, tt.pos); scroll(); } drawChart(); };
    addEventListener('resize', onResize);
    reset();
    document.fonts.ready.then(() => { if (el && tt && !running && !ended) reset(); });
  }

  function textFor() {
    if (opt.mode === 'time') return TT.randomWords(Math.max(120, opt.secs * 4.5)).join(' ');
    if (opt.mode === 'words') return TT.randomWords(opt.count).join(' ');
    if (opt.mode === 'quote') {
      let i; do { i = Math.floor(Math.random() * QUOTES.length); } while (i === lastQuote && QUOTES.length > 1);
      lastQuote = i;
      return QUOTES[i];
    }
    return TT.store.get('wpm-custom-text', '');
  }

  function paintOpts() {
    el.querySelectorAll('.seg[data-g]').forEach(g => g.querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-pressed', String(opt[g.dataset.g]) === b.dataset.v);
    }));
    el.querySelector('[data-row="secs"]').hidden = opt.mode !== 'time';
    el.querySelector('[data-row="count"]').hidden = opt.mode !== 'words';
    el.querySelector('[data-row="none"]').hidden = opt.mode === 'time' || opt.mode === 'words';
    el.q('len').textContent = opt.mode === 'quote' ? 'One short passage' : 'Your own text';
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
    running = false; ended = false; startT = 0; samples = []; hist = [];
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
        tt.input(ch);
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
    running = true;
    startT = performance.now();
    let lastSample = startT;
    hist = [{ t: startT, c: 0 }];
    iv = setInterval(() => {
      const now = performance.now();
      if (now - lastSample >= 1000) {
        lastSample += 1000;
        hist.push({ t: now, c: tt.correct });
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

  function live() {
    if (!tt) {
      ['wpm', 'ok', 'bad'].forEach(k => el.q(k).textContent = '0');
      el.q('acc').textContent = '100%';
      el.q('time').textContent = '0:00';
      return paintProgress(0);
    }
    const ms = elapsed();
    el.q('wpm').textContent = running ? tt.wpm() : 0;
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
    const lh = parseFloat(getComputedStyle(tt.el).lineHeight) || 40;
    const row = Math.floor((p.y + p.h / 2) / lh);
    tt.el.style.transform = `translateY(${-Math.max(0, row - 1) * lh}px)`;
  }

  function finish() {
    if (ended) return;
    clearInterval(iv);
    const now = performance.now();
    const ms = opt.mode === 'time' ? opt.secs * 1000 : now - startT;
    if (opt.mode === 'time') hist.push({ t: now, c: tt.correct });
    running = false; ended = true;
    const wpm = Math.round((tt.correct / 5) / (ms / 60000));
    const acc = tt.accuracy();
    const key = modeKey();
    const r = WPM.record({ mode: key, wpm, acc, correct: tt.correct, keys: tt.typed, ms: Math.round(ms) });
    WPM.track('type_test', { mode: key, wpm, acc, correct: tt.correct, ms: Math.round(ms) });
    el.q('wpm').textContent = wpm;
    el.q('time').textContent = UI.clock(ms / 1000) + (opt.mode === 'time' ? ` / ${UI.clock(opt.secs)}` : '');
    paintProgress(1);
    drawChart();
    paintRecords();
    const ART = TT.ART_WPM;
    const pct = Math.round((wpm / ART) * 100);
    const vsArt = wpm >= ART
      ? `You beat Art's ${ART} wpm by ${wpm - ART}.`
      : `You typed ${pct}% of Art's ${ART} wpm, ${ART - wpm} wpm short.`;
    el.q('stage').innerHTML = `
      <div class="result" aria-live="polite">
        <div><div class="big">${wpm}</div><div class="unit">WPM, ${UI.esc(UI.modeName(key).toUpperCase())}</div></div>
        <div class="result-grid">
          <div class="stat"><span class="label">Accuracy</span><b class="mid">${acc}%</b></div>
          <div class="stat"><span class="label">Coins</span><b class="mid gold">+${r.coins}</b></div>
          <div class="stat"><span class="label">XP</span><b class="mid green">+${r.xp}</b></div>
          <div class="stat"><span class="label">Vs Art</span><b class="mid cyan">${pct}%</b></div>
          <p class="result-note">${vsArt}${r.newBest ? ` <span class="new">New best for ${UI.esc(UI.modeName(key))}.</span>` : ''}</p>
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

  function unmount() {
    clearInterval(iv);
    stopTab();
    document.removeEventListener('keydown', stopKey);
    removeEventListener('resize', onResize);
    el = null; tt = null; keys = null;
  }

  return { title: 'Type', mount, unmount };
})());
