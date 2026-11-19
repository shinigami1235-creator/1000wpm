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
    const youLane = panel.querySelector('.lane.you');
    const themLane = panel.querySelector('.lane.them');
    const PASSAGES = [
      'the best way to get faster is to slow down first and type every word right then add speed a little at a time once your fingers know where to go',
      'every keyboard sounds different and the sound changes with the switches the plate the foam and even the keycaps so i try each one on camera before i say anything about it',
      'a hall effect switch uses a magnet so you can set how far down a key has to go before it counts and rapid trigger lets it reset the moment you lift',
      'warm up with a few easy tests then do your real runs and stop when your hands get tired since tired hands make more mistakes than they save time',
    ];
    const tt = new TT.TypeText(host);
    let opp = 'art';          // art | best | duo
    let phase = 'p1';         // duo: p1 then p2
    let p1Times = null;
    let ghost = null;         // { times, name }
    let running = false, finished = false, raf = 0, text = '';

    function setLane(lane, name, frac, wpm) {
      lane.querySelector('.name').textContent = name;
      lane.querySelector('.fill').style.width = Math.min(100, frac * 100) + '%';
      lane.querySelector('.w').textContent = wpm + ' wpm';
    }
    function prepare(keepText) {
      cancelAnimationFrame(raf);
      running = false; finished = false;
      if (!keepText) text = TT.pick(PASSAGES);
      tt.set(text);
      ghost = null;
      if (opp === 'art') {
        ghost = { times: TT.paceTimes(text, ART), name: 'Art' };
        note.innerHTML = `Art types at ${ART} wpm. Start typing to race him.`;
      } else if (opp === 'best') {
        const b = TT.store.get('wpm-race-best', null);
        if (b) {
          text = b.text; tt.set(text);
          ghost = { times: b.times, name: 'Your best' };
          note.innerHTML = `Your best run is ${b.wpm} wpm. Start typing to beat it.`;
        } else {
          note.innerHTML = 'Finish a race first to save your best run.';
        }
      } else {
        if (phase === 'p1') note.innerHTML = 'Player 1, start typing. Player 2 races your run next.';
        else { ghost = { times: p1Times, name: 'Player 1' }; note.innerHTML = 'Player 2, start typing to race Player 1.'; }
      }
      const youName = opp === 'duo' ? (phase === 'p1' ? 'Player 1' : 'Player 2') : 'You';
      setLane(youLane, youName, 0, 0);
      themLane.hidden = !ghost;
      if (ghost) setLane(themLane, ghost.name, 0, 0);
      tt.ghost.hidden = !ghost;
      if (ghost) tt.showGhost(0, ghost.name);
    }
    function ghostAt(ms) {
      let i = 0;
      while (i < ghost.times.length && ghost.times[i] <= ms) i++;
      return i;
    }
    function loop(now) {
      if (!running) return;
      const ms = now - tt.startT;
      setLane(youLane, youLane.querySelector('.name').textContent, tt.pos / text.length, tt.wpm(now));
      if (ghost) {
        const gi = ghostAt(ms);
        tt.showGhost(gi, ghost.name);
        const gms = Math.min(ms, ghost.times[ghost.times.length - 1]);
        setLane(themLane, ghost.name, gi / text.length, gms > 300 ? Math.round((gi / 5) / (gms / 60000)) : 0);
      }
      raf = requestAnimationFrame(loop);
    }
    function finish() {
      running = false; finished = true;
      cancelAnimationFrame(raf);
      const now = performance.now();
      const myMs = now - tt.startT;
      const wpm = tt.wpm(now);
      setLane(youLane, youLane.querySelector('.name').textContent, 1, wpm);
      const times = tt.times.slice();
      const best = TT.store.get('wpm-race-best', null);
      if (!best || wpm > best.wpm) TT.store.set('wpm-race-best', { text, times, wpm });

      if (opp === 'duo' && phase === 'p1') {
        p1Times = times;
        phase = 'p2';
        note.innerHTML = `Player 1 typed ${wpm} wpm. Player 2, press <kbd>Enter</kbd> when ready.`;
        return;
      }
      if (ghost) {
        const gMs = ghost.times[ghost.times.length - 1];
        const gW = Math.round((text.length / 5) / (gMs / 60000));
        setLane(themLane, ghost.name, 1, gW);
        const me = opp === 'duo' ? 'Player 2' : 'You';
        const diff = Math.abs((myMs - gMs) / 1000).toFixed(1);
        note.innerHTML = myMs < gMs
          ? `${me} won by ${diff} seconds with ${wpm} wpm. Press <kbd>Enter</kbd> for a new race.`
          : `${ghost.name} won by ${diff} seconds. Press <kbd>Enter</kbd> for a new race.`;
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
          raf = requestAnimationFrame(loop);
        }
        tt.input(ch);
        TT.click(ch === ' ');
        if (tt.done()) finish();
      },
      onBack(word) { if (running) word ? tt.backWord() : tt.back(); },
      onKey(k) {
        if (k === 'Enter' && finished) prepare(opp === 'duo' && phase === 'p2');
        else if (k === 'Tab' || k === 'Escape') { phase = 'p1'; prepare(); }
      },
    });
    prepare();
    document.fonts.ready.then(() => { if (!running) prepare(true); });
    document.getElementById('race-game').addEventListener('shown', () => { if (!running) prepare(true); });
  }
})();
