// Boss Rush scoreboard for this device and the shape a run will have when the
// server takes it (POST /api/rush/run, see RUSH.md).
//   RushBoard.load()          { runs, best, totals }
//   RushBoard.add(run)        saves a finished run -> { best: which records it set, rank }
//   RushBoard.payload(run)    the body for POST /api/rush/run
//   RushBoard.director() / RushBoard.saveDirector(model)   the director's saved model
//   RushBoard.render(sub, board)   the Boss rush tab on #/leaderboard
//   RushBoard.table(runs, max)     the runs table, for the entry screen
// Saved in WPM.modeData('rush') or localStorage 'wpm-rush-v1' when state.js has no mode data.
window.RushBoard = (() => {
  const KEY = 'wpm-rush-v1', KEEP = 25;
  const blank = () => ({ v: 1, runs: [], best: {}, totals: { runs: 0, bosses: 0, spells: 0, ms: 0 }, director: null });
  function read() {
    let d = null;
    try { d = window.WPM && WPM.modeData ? WPM.modeData('rush') : JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    return { ...blank(), ...(d || {}) };
  }
  function write(d) {
    try { if (window.WPM && WPM.setModeData) WPM.setModeData('rush', d); else localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }
  const load = () => { const d = read(); return { runs: d.runs, best: d.best, totals: d.totals }; };

  // A finished run. Records: bosses, score, peak wpm, average accuracy, best combo,
  // spells cast and the fastest boss kill.
  function add(run) {
    const d = read();
    const b = d.best, set = {};
    // a record counts as new only when it beats one already on the board
    const better = (k, v) => { if (v === undefined || v === null) return; const had = b[k] !== undefined; if (!had || v > b[k]) { if (had) set[k] = true; b[k] = v; } };
    better('bosses', run.bosses);
    better('score', run.score);
    better('wpm', run.wpm);
    if (run.bosses > 0) better('acc', run.acc);
    better('combo', run.bestCombo);
    better('spells', run.spells);
    if (run.fastest) {
      if (!b.fastest || run.fastest.ms < b.fastest.ms) { if (b.fastest) set.fastest = true; b.fastest = { ...run.fastest }; }
    }
    d.totals.runs++; d.totals.bosses += run.bosses; d.totals.spells += run.spells; d.totals.ms += run.ms;
    d.runs.push(run);
    d.runs.sort((x, y) => y.score - x.score || y.bosses - x.bosses);
    const rank = d.runs.indexOf(run) + 1;
    d.runs = d.runs.slice(0, KEEP);
    write(d);
    return { best: set, rank, first: d.totals.runs === 1 };
  }
  // What the server will take. A real server must not trust these numbers on their own:
  // it should replay the key stream against the same fight rules (js/app/rush/fight.js).
  function payload(run) {
    return {
      v: 1, id: run.id, at: run.at, name: run.name,
      bosses: run.bosses, reached: run.reached, score: run.score, ms: run.ms,
      wpm: run.wpm, avgWpm: run.avgWpm, acc: run.acc, bestCombo: run.bestCombo, spells: run.spells, dmg: run.dmg,
      fastest: run.fastest, retry: run.retry,
      fights: run.fights.map(f => ({ n: f.n, boss: f.boss, mark: f.mark, won: f.won, retry: f.retry, secs: f.secs, wpm: f.wpm, acc: f.acc, combo: f.combo, casts: f.casts, dmg: f.dmg, score: f.score, left: f.left })),
    };
  }
  const director = () => read().director;
  function saveDirector(m) { const d = read(); d.director = m; write(d); }

  // ---------- drawing ----------
  const fmt = n => (window.UI ? UI.fmt(n) : String(n));
  const esc = s => (window.UI ? UI.esc(s) : String(s));
  const secs = ms => (ms / 1000).toFixed(1) + ' s';
  function table(runs, max = 10) {
    if (!runs.length) return '';
    return `<table class="board rush-runs">
      <thead><tr><th>#</th><th class="num-col">Bosses</th><th class="num-col">Score</th><th class="num-col hide-sm">Peak wpm</th><th class="num-col hide-sm">Accuracy</th><th class="num-col hide-sm">Best combo</th><th class="num-col hide-sm">Spells</th><th class="hide-sm">Date</th></tr></thead>
      <tbody>${runs.slice(0, max).map((r, i) => `<tr class="${i === 0 ? 'mine-best' : ''}">
        <td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td><td class="w num-col">${r.bosses}</td><td class="n num-col">${fmt(r.score)}</td>
        <td class="n num-col hide-sm">${r.wpm}</td><td class="n num-col hide-sm">${r.acc}%</td><td class="n num-col hide-sm">${r.bestCombo}</td>
        <td class="n num-col hide-sm">${r.spells}</td><td class="n hide-sm">${esc(window.UI ? UI.date(r.at) : r.at)}</td></tr>`).join('')}</tbody>
    </table>`;
  }
  function bests(b) {
    const cell = (label, v) => `<div><span class="label">${label}</span><b class="mid">${v}</b></div>`;
    return `<div class="lb-boss rush-bests">
      ${cell('Best run', b.bosses !== undefined ? `${b.bosses} ${b.bosses === 1 ? 'boss' : 'bosses'}` : '-')}
      ${cell('Best score', b.score !== undefined ? fmt(b.score) : '-')}
      ${cell('Peak wpm', b.wpm !== undefined ? b.wpm : '-')}
      ${cell('Average accuracy', b.acc !== undefined ? b.acc + '%' : '-')}
      ${cell('Best combo', b.combo !== undefined ? b.combo : '-')}
      ${cell('Spells cast', b.spells !== undefined ? b.spells : '-')}
      ${b.fastest ? `<div><span class="label">Fastest kill</span><b class="mid">${secs(b.fastest.ms)}</b><span class="dim rb-who">${esc(b.fastest.title)}</span></div>` : cell('Fastest kill', '-')}
    </div>`;
  }
  function render(sub, board) {
    const d = load();
    sub.innerHTML = `<p class="dim lb-note">This device only until the server is live.</p>${bests(d.best)}`;
    board.innerHTML = d.runs.length ? table(d.runs, 20)
      : '<p class="empty">No Boss rush runs on this device yet. <a class="green" href="#/play/rush">Start a run</a> to get on the board.</p>';
  }

  return { load, add, payload, director, saveDirector, render, table, bests };
})();
