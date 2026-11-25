// The hero race on the home page. The text types itself at Art's pace until the
// visitor starts typing and the first key starts a race against Art's caret.
// HeroRace.mount(root) returns a function that stops it.
window.HeroRace = (() => {
  const TEXT = 'hi im art and i type fast on every keyboard brands send me so race me on this one and see how close you get to two hundred and four words a minute';

  function mount(root) {
    const box = root.querySelector('[data-race]');
    const youEl = root.querySelector('[data-you]');
    const artEl = root.querySelector('[data-art]');
    const hint = root.querySelector('[data-hint]');
    const tt = new TT.TypeText(box);
    const ART = TT.ART_WPM;
    const HINT = hint.innerHTML;

    let mode = 'demo';      // demo | race | done
    let ghostTimes = [];
    let raf = 0;
    let demoStart = 0;
    let alive = true;

    function reset(toDemo) {
      cancelAnimationFrame(raf);
      tt.set(TEXT);
      ghostTimes = TT.paceTimes(TEXT, ART);
      youEl.textContent = '0';
      artEl.textContent = toDemo ? ART : '0';
      hint.innerHTML = HINT;
      mode = toDemo ? 'demo' : 'race';
      box.classList.add('idle');
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
      if (i >= tt.spans.length && ms > ghostTimes[ghostTimes.length - 1] + 2500) demoStart = now;
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
      const now = performance.now();
      const w = tt.wpm(now);
      youEl.textContent = w;
      artEl.textContent = ART;
      const artMs = ghostTimes[ghostTimes.length - 1];
      const youMs = now - tt.startT;
      const behind = ((youMs - artMs) / 1000).toFixed(1);
      const r = WPM.record({ mode: 'race-art', wpm: w, acc: tt.accuracy(), correct: tt.correct, keys: tt.typed, ms: Math.round(youMs), won: w >= ART });
      WPM.track('race_done', { opp: 'art', wpm: w, acc: tt.accuracy(), won: w >= ART });
      const earned = ` You earned ${r.coins} coins and ${r.xp} XP.`;
      hint.innerHTML = (w >= ART
        ? `You beat Art with ${w} wpm and ${tt.accuracy()}% accuracy.`
        : `You typed ${w} wpm with ${tt.accuracy()}% accuracy and finished ${behind} seconds after Art.`) + earned + ' Press <kbd>Tab</kbd> to race again.';
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

    // Typing anywhere on the page with nothing focused goes to the race while it is on screen.
    function onKey(e) {
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.id !== 'view') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const r = box.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      e.preventDefault();
      keys.focus();
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    }
    const onResize = () => { tt.invalidate(); tt.place(tt.caret, tt.pos); };
    document.addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    document.fonts.ready.then(() => { if (alive && mode === 'demo') reset(true); });
    reset(true);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
    };
  }

  return { mount, TEXT };
})();
