// The race game. Your car's speed comes from your typing speed and a run of
// correct letters turns on the boost. RaceView in race.js draws the road.
// RaceGame.mount(panel) builds the race inside panel and returns a function that stops it.
window.RaceGame = (() => {
  const ART = TT.ART_WPM;
  const YOU = Theme.hex('accent'), ART_C = '#3ee6ff', P1_C = '#ff8a3d', BEST_C = Theme.hex('ink');

  function mount(panel) {
    panel.innerHTML = `
      <div class="race-top">
        <div class="seg" role="group" aria-label="Opponent">
          <button type="button" data-o="art" aria-pressed="true">Art</button>
          <button type="button" data-o="best" aria-pressed="false">Your best</button>
          <button type="button" data-o="duo" aria-pressed="false">2 players</button>
        </div>
        <p class="race-note" aria-live="polite"></p>
      </div>
      <div class="race-stage"><canvas class="race-canvas" width="960" height="400"></canvas></div>
      <div class="race-text typebox"></div>`;
    const host = panel.querySelector('.race-text');
    const note = panel.querySelector('.race-note');
    const segBtns = panel.querySelectorAll('.seg button');
    const view = new RaceView(panel.querySelector('.race-canvas'));
    const tt = new TT.TypeText(host);
    const snd = window.RaceAudio ? RaceAudio.create() : null;
    view.onBoost = () => snd && snd.boost();
    view.onOvertake = up => snd && (up ? snd.overtake() : snd.passed());
    let opp = 'art';          // art | best | duo
    let phase = 'p1';         // duo: p1 then p2
    let p1 = null;            // player 1's run for the duo
    let ghost = null;         // { times, name, color }
    let cd = null, running = false, finished = false, text = '', seed = 0, first = true;
    let stamps = [], streak = 0, skid = 0, raf = 0;

    const newText = () => TT.testWords(26).join(' ');
    function prepare(keepCourse) {
      running = false; finished = false;
      if (cd) { cd(); cd = null; }
      if (!keepCourse) { text = newText(); seed = Math.floor(Math.random() * 1e9); }
      ghost = null;
      if (opp === 'art') {
        ghost = { times: TT.paceTimes(text, ART), name: 'Art', color: ART_C };
        note.innerHTML = `Art drives at <b>${ART} wpm</b>. Press any key to start.`;
      } else if (opp === 'best') {
        const b = TT.store.get('wpm-race-best2', null);
        if (b) {
          text = b.text; seed = b.seed;
          ghost = { times: b.times, name: 'Your best', color: BEST_C };
          note.innerHTML = `Your best run is <b>${b.wpm} wpm</b>. Press any key to start.`;
        } else note.innerHTML = 'Finish a race first to save your best run.';
      } else if (phase === 'p1') {
        note.innerHTML = 'Player 1, press any key to start. Player 2 races your run next on the same course.';
      } else {
        ghost = { times: p1.times, name: 'Player 1', color: P1_C };
        note.innerHTML = 'Player 2, press any key to start.';
      }
      tt.set(text);
      view.newCourse(seed, first);
      first = false;
      stamps = []; streak = 0; skid = 0;
      tt.ghost.hidden = !ghost;
      if (ghost) tt.showGhost(0, ghost.name);
      host.classList.add('idle');
    }
    function ghostAt(ms) {
      let i = 0;
      ms *= window._race ? _race.ghostK : 1;
      while (i < ghost.times.length && ghost.times[i] <= ms) i++;
      return i;
    }
    function ghostWpmAt(gi) {
      const a = Math.max(0, gi - 10), ta = a ? ghost.times[a - 1] : 0, tb = ghost.times[gi - 1];
      return ((gi - a) / 5) / (((tb - ta) || 1) / 60000);
    }
    // test hook: the view, and how long its draw takes on average
    const perf = { ms: 0, n: 0, reset() { this.ms = 0; this.n = 0; }, get avg() { return this.n ? this.ms / this.n : 0; } };
    window._race = { view, perf, ghostK: 1 };
    let last = performance.now();
    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (document.hidden) return;
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
      const kmh = Math.min(400, wpm * 1.6 * (1 + boost * 0.25));
      const youName = opp === 'duo' ? (phase === 'p1' ? 'Player 1' : 'Player 2') : 'You';
      const t0 = performance.now();
      view.draw({
        you: { progress: tt.pos / text.length, kmh, boost, skid, streak, color: YOU, name: youName },
        others,
      }, dt);
      perf.ms += performance.now() - t0; perf.n++;
      if (snd) snd.engine(running ? kmh / 320 : 0, boost);
    }
    raf = requestAnimationFrame(loop);

    function record(won) {
      const mode = opp === 'art' ? 'race-art' : opp === 'best' ? 'race-best' : 'race-duo';
      const run = { mode, wpm: tt.wpm(), acc: tt.accuracy(), correct: tt.correct, keys: tt.typed, ms: Math.round(performance.now() - tt.startT) };
      if (won !== undefined) run.won = won;
      const r = WPM.record(run);
      WPM.track('race_done', { opp, wpm: run.wpm, acc: run.acc, won: !!won });
      return ` +${r.coins} coins, +${r.xp} XP.`;
    }

    function finish() {
      running = false; finished = true;
      if (window.Focus) Focus.end();
      host.classList.add('idle');
      const now = performance.now();
      const myMs = now - tt.startT;
      const wpm = tt.wpm(now);
      const times = tt.times.slice();
      const best = TT.store.get('wpm-race-best2', null);
      if (!best || wpm > best.wpm) TT.store.set('wpm-race-best2', { text, seed, times, wpm });
      const stats = [['WPM', String(wpm)], ['ACCURACY', tt.accuracy() + '%'], ['TIME', (myMs / 1000).toFixed(1) + ' s']];
      if (opp === 'duo' && phase === 'p1') {
        const earned = record();
        p1 = { times, wpm };
        phase = 'p2';
        view.finish({ title: 'P1 DONE', sub: `${wpm} wpm`, sub2: 'Player 2 races this run next', color: P1_C, stats, won: true });
        if (snd) snd.finish(true);
        note.innerHTML = `Player 1 typed <b>${wpm} wpm</b>.${earned} Player 2, press <kbd>Enter</kbd> when ready.`;
        return;
      }
      if (ghost) {
        const gMs = ghost.times[ghost.times.length - 1];
        const won = myMs < gMs;
        const me = opp === 'duo' ? 'Player 2' : 'You';
        const diff = Math.abs((myMs - gMs) / 1000).toFixed(1);
        const earned = record(won);
        stats.push(['GAP', (won ? '-' : '+') + diff + ' s']);
        view.finish({ title: won ? '1ST' : '2ND', sub: won ? `${me} won` : `${ghost.name} won`, sub2: `by ${diff} s`, color: won ? YOU : ghost.color, stats, won });
        if (snd) snd.finish(won);
        note.innerHTML = (won
          ? `${me} won by ${diff} seconds with <b>${wpm} wpm</b>.`
          : `${ghost.name} won by ${diff} seconds. You typed <b>${wpm} wpm</b>.`) + earned + ' Press <kbd>Enter</kbd> for a new course.';
        if (opp === 'duo') phase = 'p1';
      }
    }
    segBtns.forEach(b => b.addEventListener('click', () => {
      opp = b.dataset.o; phase = 'p1';
      segBtns.forEach(x => x.setAttribute('aria-pressed', x === b));
      prepare();
      keys.focus();
    }));
    const keys = TT.captureKeys(panel, {
      label: 'Race',
      onChar(ch) {
        if (finished) return;
        // the first key starts a 3, 2, 1; the race and the ghost both start on GO
        if (!running) {
          if (opp === 'best' && !ghost) return;
          if (!cd) { view.countdown(); if (snd) snd.engine(0.02, 0); cd = TT.countdown(panel.querySelector('.race-stage'), () => { cd = null; running = true; tt.startT = performance.now(); host.classList.remove('idle'); }); }
          return;
        }
        const ok = tt.input(ch);
        if (ok) { stamps.push(performance.now()); streak++; if (ch === ' ') { view.word(); if (snd) snd.word(); } }
        else { streak = 0; skid = 0.4; if (snd) snd.typo(); }
        view.key(!!ok);
        TT.click(ch === ' ');
        if (tt.done()) finish();
      },
      onBack(word) { if (running) { word ? tt.backWord() : tt.back(); streak = 0; } },
      onKey(k) {
        if (k === 'Enter' && finished) prepare(opp === 'duo' && phase === 'p2');
        else if (k === 'Tab' || k === 'Escape') { phase = 'p1'; prepare(); }
      },
    });
    panel.addEventListener('focusin', () => host.classList.add('focused'));
    panel.addEventListener('focusout', () => host.classList.remove('focused'));
    // Keys typed with nothing focused go to the race.
    const forward = e => {
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'view') return;
      if (e.ctrlKey || e.metaKey || e.altKey || !(e.key.length === 1 || e.key === 'Enter')) return;
      e.preventDefault();
      keys.focus();
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    };
    document.addEventListener('keydown', forward);
    prepare();
    let alive = true;
    document.fonts.ready.then(() => { if (alive && !running) { view.fit(); tt.invalidate(); tt.place(tt.caret, tt.pos); } });

    return {
      focus: () => keys.focus(),
      destroy() { alive = false; if (cd) cd(); cancelAnimationFrame(raf); view.destroy(); if (snd) snd.stop(); document.removeEventListener('keydown', forward); },
    };
  }

  return { mount };
})();
