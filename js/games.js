// Speed test and Race. Typo Horde lives in horde.js.
(() => {
  const ART = TT.ART_WPM;

  // ---------- tabs ----------
  const tabs = document.querySelectorAll('#games .tabs button');
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(t => t.setAttribute('aria-selected', t === b));
    document.querySelectorAll('#games .game').forEach(g => g.classList.toggle('on', g.id === b.dataset.game));
    const g = document.getElementById(b.dataset.game);
    g.dispatchEvent(new Event('shown'));
    const ta = g.querySelector('.sr-input');
    if (ta && matchMedia('(pointer: fine)').matches) ta.focus({ preventScroll: true });
  }));

  // ---------- speed test ----------
  {
    const panel = document.getElementById('st-panel');
    const win = panel.querySelector('.st-window');
    const timerEl = panel.querySelector('.st-timer');
    const res = panel.querySelector('.result');
    const segBtns = panel.querySelectorAll('.seg button');
    const tt = new TT.TypeText(win);
    let secs = 30, running = false, ended = false, endAt = 0, tick = 0;

    function reset() {
      clearInterval(tick);
      running = false; ended = false;
      tt.set(TT.randomWords(220).join(' '));
      tt.el.style.transform = '';
      timerEl.textContent = secs;
      res.classList.remove('on');
      win.style.display = '';
    }
    function scroll() {
      const p = tt.xy(tt.pos);
      const line = p.h || 40;
      const shift = Math.max(0, p.y - line);
      tt.el.style.transform = `translateY(${-shift}px)`;
    }
    function end() {
      clearInterval(tick);
      running = false; ended = true;
      const min = secs / 60;
      const wpm = Math.round((tt.correct / 5) / min);
      const raw = Math.round((tt.typed / 5) / min);
      const key = 'wpm-st-best-' + secs;
      const best = Math.max(TT.store.get(key, 0), wpm);
      TT.store.set(key, best);
      res.querySelector('[data-k=wpm]').textContent = wpm;
      res.querySelector('[data-k=raw]').textContent = raw;
      res.querySelector('[data-k=acc]').textContent = tt.accuracy() + '%';
      res.querySelector('[data-k=best]').textContent = best;
      const pct = Math.round((wpm / ART) * 100);
      res.querySelector('.verdict').innerHTML = wpm >= ART
        ? `You beat Art's ${ART} wpm. Press <kbd>Tab</kbd> to try again.`
        : `You typed ${pct}% as fast as Art. Press <kbd>Tab</kbd> to try again.`;
      res.classList.add('on');
      win.style.display = 'none';
      timerEl.textContent = 0;
    }
    segBtns.forEach(b => b.addEventListener('click', () => {
      secs = +b.dataset.s;
      segBtns.forEach(x => x.setAttribute('aria-pressed', x === b));
      reset();
      panel.querySelector('.sr-input').focus({ preventScroll: true });
    }));
    TT.captureKeys(panel, {
      label: 'Speed test',
      onChar(ch) {
        if (ended) return;
        if (!running) {
          running = true;
          endAt = performance.now() + secs * 1000;
          tick = setInterval(() => {
            const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
            timerEl.textContent = left;
            if (left <= 0) end();
          }, 100);
        }
        tt.input(ch);
        TT.click(ch === ' ');
        scroll();
      },
      onBack(word) { if (running) { word ? tt.backWord() : tt.back(); scroll(); } },
      onKey(k) { if (k === 'Tab' || k === 'Escape') reset(); },
    });
    reset();
    document.fonts.ready.then(reset);
    document.getElementById('speed').addEventListener('shown', () => { if (!running) reset(); });
  }

  // ---------- race ----------
  {
    const panel = document.getElementById('race-panel');
    const host = panel.querySelector('.race-text');
    const note = panel.querySelector('.race-note');
    const segBtns = panel.querySelectorAll('.seg button');
    const view = new RaceView(panel.querySelector('.race-canvas'));
    const tt = new TT.TypeText(host);
    const YOU = '#f2c230', ART_C = '#9fb7d9', P1_C = '#e07a3a', BEST_C = '#c9c9c6';
    let opp = 'art';          // art | best | duo
    let phase = 'p1';         // duo: p1 then p2
    let p1 = null;            // player 1's run for the duo
    let ghost = null;         // { times, name, color }
    let running = false, finished = false, text = '', seed = 0;
    let stamps = [], streak = 0, skid = 0;

    const newText = () => TT.randomWords(26, 0.22).join(' ');
    function prepare(keepCourse) {
      running = false; finished = false;
      if (!keepCourse) { text = newText(); seed = Math.floor(Math.random() * 1e9); }
      ghost = null;
      if (opp === 'art') {
        ghost = { times: TT.paceTimes(text, ART), name: 'Art', color: ART_C };
        note.innerHTML = `Art drives at ${ART} wpm. Start typing to race him.`;
      } else if (opp === 'best') {
        const b = TT.store.get('wpm-race-best2', null);
        if (b) {
          text = b.text; seed = b.seed;
          ghost = { times: b.times, name: 'Your best', color: BEST_C };
          note.innerHTML = `Your best run is ${b.wpm} wpm. Start typing to beat it.`;
        } else note.innerHTML = 'Finish a race first to save your best run.';
      } else if (phase === 'p1') {
        note.innerHTML = 'Player 1, start typing. Player 2 races your run next on the same course.';
      } else {
        ghost = { times: p1.times, name: 'Player 1', color: P1_C };
        note.innerHTML = 'Player 2, start typing to race Player 1.';
      }
      tt.set(text);
      view.newCourse(seed);
      stamps = []; streak = 0; skid = 0;
      tt.ghost.hidden = !ghost;
      if (ghost) tt.showGhost(0, ghost.name);
    }
    function ghostAt(ms) {
      let i = 0;
      while (i < ghost.times.length && ghost.times[i] <= ms) i++;
      return i;
    }
    let last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!panel.offsetParent) return;
      const ms = running ? now - tt.startT : finished ? Infinity : 0;
      while (stamps.length && now - stamps[0] > 2500) stamps.shift();
      const wpm = running && stamps.length > 1 ? (stamps.length / 5) / ((now - stamps[0]) / 60000 || 1) : 0;
      skid = Math.max(0, skid - dt);
      const boost = running && streak >= 12 ? Math.min(1, 0.4 + (streak - 12) / 20) : 0;
      const others = [];
      if (ghost) {
        const gi = ghostAt(ms);
        if (running) tt.showGhost(gi, ghost.name);
        const gWpm = gi > 0 && gi < text.length ? ghostWpmAt(gi) : 0;
        others.push({ progress: gi / text.length, name: ghost.name, color: ghost.color, boost: gWpm > 150 ? 0.6 : 0 });
      }
      const youName = opp === 'duo' ? (phase === 'p1' ? 'Player 1' : 'Player 2') : 'You';
      view.draw({
        you: { progress: tt.pos / text.length, kmh: Math.min(400, wpm * 1.6 * (1 + boost * 0.25)), boost, skid, color: YOU, name: youName },
        others,
      }, dt);
    }
    function ghostWpmAt(gi) {
      const a = Math.max(0, gi - 10), ta = a ? ghost.times[a - 1] : 0, tb = ghost.times[gi - 1];
      return ((gi - a) / 5) / (((tb - ta) || 1) / 60000);
    }
    requestAnimationFrame(loop);

    function finish() {
      running = false; finished = true;
      const now = performance.now();
      const myMs = now - tt.startT;
      const wpm = tt.wpm(now);
      const times = tt.times.slice();
      const best = TT.store.get('wpm-race-best2', null);
      if (!best || wpm > best.wpm) TT.store.set('wpm-race-best2', { text, seed, times, wpm });
      if (opp === 'duo' && phase === 'p1') {
        p1 = { times, wpm };
        phase = 'p2';
        note.innerHTML = `Player 1 typed ${wpm} wpm. Player 2, press <kbd>Enter</kbd> when ready.`;
        return;
      }
      if (ghost) {
        const gMs = ghost.times[ghost.times.length - 1];
        const me = opp === 'duo' ? 'Player 2' : 'You';
        const diff = Math.abs((myMs - gMs) / 1000).toFixed(1);
        note.innerHTML = myMs < gMs
          ? `${me} won by ${diff} seconds with ${wpm} wpm. Press <kbd>Enter</kbd> for a new course.`
          : `${ghost.name} won by ${diff} seconds. Press <kbd>Enter</kbd> for a new course.`;
        if (opp === 'duo') phase = 'p1';
      } else {
        note.innerHTML = `You typed ${wpm} wpm with ${tt.accuracy()}% accuracy. Press <kbd>Enter</kbd> to race this run.`;
        opp = 'best';
        segBtns.forEach(x => x.setAttribute('aria-pressed', x.dataset.o === 'best'));
      }
    }
    segBtns.forEach(b => b.addEventListener('click', () => {
      opp = b.dataset.o; phase = 'p1';
      segBtns.forEach(x => x.setAttribute('aria-pressed', x === b));
      prepare();
      panel.querySelector('.sr-input').focus({ preventScroll: true });
    }));
    TT.captureKeys(panel, {
      label: 'Race',
      onChar(ch) {
        if (finished) return;
        if (!running) {
          if (opp === 'best' && !ghost) return;
          running = true;
        }
        const ok = tt.input(ch);
        if (ok) { stamps.push(performance.now()); streak++; }
        else { streak = 0; skid = 0.4; }
        TT.click(ch === ' ');
        if (tt.done()) finish();
      },
      onBack(word) { if (running) { word ? tt.backWord() : tt.back(); streak = 0; } },
      onKey(k) {
        if (k === 'Enter' && finished) prepare(opp === 'duo' && phase === 'p2');
        else if (k === 'Tab' || k === 'Escape') { phase = 'p1'; prepare(); }
      },
    });
    prepare();
    document.fonts.ready.then(() => { if (!running) prepare(true); });
    document.getElementById('race-game').addEventListener('shown', () => { if (!running) { view.fit(); prepare(true); } });
  }
})();
