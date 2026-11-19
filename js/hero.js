// The hero text types itself at Art's pace until the visitor starts typing.
// The first key starts a race against Art's caret.
(() => {
  const box = document.getElementById('race');
  const youEl = document.getElementById('you-wpm');
  const artEl = document.getElementById('art-wpm');
  const hint = document.getElementById('race-hint');
  const TEXT = 'hi im art and i type fast sometimes every day i type my follower count with one word for each follower so today i type twenty five thousand words';
  const tt = new TT.TypeText(box);
  const ART = TT.ART_WPM;
  const HINT = hint.innerHTML;

  let mode = 'demo';      // demo | race | done
  let ghostTimes = [];
  let raf = 0;
  let demoStart = 0;

  function reset(toDemo) {
    cancelAnimationFrame(raf);
    tt.set(TEXT);
    ghostTimes = TT.paceTimes(TEXT, ART);
    youEl.textContent = '0';
    artEl.textContent = toDemo ? ART : '0';
    hint.innerHTML = HINT;
    mode = toDemo ? 'demo' : 'race';
    box.classList.toggle('idle', true);
    if (toDemo) { demoStart = performance.now(); raf = requestAnimationFrame(demo); }
  }

  function ghostIndex(ms) {
    let i = 0;
    while (i < ghostTimes.length && ghostTimes[i] <= ms) i++;
    return i;
  }

  function demo(now) {
    const ms = now - demoStart;
    const i = ghostIndex(ms);
    for (let k = 0; k < tt.spans.length; k++) tt.spans[k].classList.toggle('demo', k < i);
    tt.showGhost(i, 'Art');
    if (i >= tt.spans.length && ms > ghostTimes[ghostTimes.length - 1] + 2500) {
      demoStart = now;
    }
    raf = requestAnimationFrame(demo);
  }

  function race(now) {
    if (mode !== 'race') return;
    const ms = tt.startT ? now - tt.startT : 0;
    const gi = ghostIndex(ms);
    tt.showGhost(gi, 'Art');
    youEl.textContent = tt.wpm(now);
    const artW = ms > 300 ? Math.round((Math.min(gi, TEXT.length) / 5) / (Math.min(ms, ghostTimes[ghostTimes.length - 1]) / 60000)) : 0;
    artEl.textContent = gi >= TEXT.length ? ART : artW;
    raf = requestAnimationFrame(race);
  }

  function finish() {
    mode = 'done';
    cancelAnimationFrame(raf);
    const w = tt.wpm();
    youEl.textContent = w;
    artEl.textContent = ART;
    const artMs = ghostTimes[ghostTimes.length - 1];
    const youMs = performance.now() - tt.startT;
    const behind = ((youMs - artMs) / 1000).toFixed(1);
    hint.innerHTML = w >= ART
      ? `You beat Art with ${w} wpm and ${tt.accuracy()}% accuracy. Press <kbd>Tab</kbd> to race again.`
      : `You typed ${w} wpm with ${tt.accuracy()}% accuracy and finished ${behind} seconds after Art. Press <kbd>Tab</kbd> to race again.`;
    const best = TT.store.get('wpm-hero-best', 0);
    if (w > best) TT.store.set('wpm-hero-best', w);
  }

  const keys = TT.captureKeys(box, {
    label: 'Type the text to race Art',
    onChar(ch) {
      if (mode === 'done') return;
      if (mode === 'demo') { reset(false); raf = requestAnimationFrame(race); }
      box.classList.remove('idle');
      tt.input(ch);
      TT.click(ch === ' ');
      if (tt.done()) finish();
    },
    onBack(word) { if (mode === 'race') word ? tt.backWord() : tt.back(); },
    onKey(k) { if (k === 'Tab' || k === 'Escape') reset(true); },
  });

  // Typing anywhere on the page with nothing focused goes to the race.
  document.addEventListener('keydown', e => {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    const r = box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    e.preventDefault();
    keys.focus();
    box.dispatchEvent(new Event('focusin'));
    keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
  });

  addEventListener('resize', () => { tt.place(tt.caret, tt.pos); });
  document.fonts.ready.then(() => reset(true));
  reset(true);

  // footer counter: words Art could have typed since the page opened
  const counter = document.getElementById('since');
  const opened = performance.now();
  setInterval(() => {
    counter.textContent = Math.floor(((performance.now() - opened) / 60000) * ART).toLocaleString();
  }, 250);
})();
