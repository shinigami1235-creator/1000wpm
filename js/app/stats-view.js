// The stats block: averages, a wpm chart, every mode's runs and a keyboard heatmap of
// missed keys. The player's own profile renders it from WPM, and the public profile page
// (#/u/<id>) renders it for other players from their runs.
//
//   const v = StatsView.render(host, { sessions, keyStats, totals });
//   v.destroy();   // when the page goes away
//
// sessions: runs as WPM.sessions() returns them ({ mode, wpm, acc, correct, ms, at, kmiss?, won? }).
// keyStats: optional { key: [right, missed] }, as WPM.keyStats() returns it. Without it the
//   heatmap counts misses from each run's kmiss.
// totals: optional { words, ms, sessions } when the runs list is capped (WPM keeps 500).
// Modes are read by name, so a new mode (Boss Rush 'rush', Superboss 'superboss', PvP 'pvp')
// shows up as soon as it saves runs with WPM.record.
window.StatsView = (() => {
  // every mode's name is in UI.modeName (js/app/ui.js)
  const modeName = m => UI.modeName(m);

  // shifted characters count on the key they sit on
  const SHIFT = { '~': '`', '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', _: '-', '+': '=',
    '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/' };
  const ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
  const keyOf = k => (k === ' ' ? ' ' : SHIFT[k] || k.toLowerCase());
  const label = k => (k === ' ' ? 'space' : k);
  // miss rate steps for the heatmap, one hue from faint to full red
  const STEPS = [[0.01, 'Under 1%'], [0.03, '1 to 3%'], [0.06, '3 to 6%'], [0.1, '6 to 10%'], [Infinity, '10% or more']];
  const ALPHA = [0.14, 0.3, 0.48, 0.68, 0.92];
  const SURF = [7, 16, 11], RED = [255, 77, 94];
  const mix = a => SURF.map((s, i) => Math.round(s + (RED[i] - s) * a));
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const fill = i => { const c = mix(ALPHA[i]); return { bg: `rgb(${c})`, ink: lum(c) > 0.18 ? '#040806' : '#d7f5e3' }; };
  const MIN_TRIES = 10;   // a key needs this many presses before its miss rate counts

  const avg = (a, f) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0);

  function summarise(sessions) {
    const runs = sessions.filter(s => s && s.mode);
    const typed = runs.filter(s => typeof s.wpm === 'number');
    const last = n => typed.slice(-n);
    const accOf = a => { const w = a.filter(s => typeof s.acc === 'number'); return w.length ? Math.round(avg(w, s => s.acc)) : null; };
    const modes = new Map();
    for (const s of runs) {
      const m = modes.get(s.mode) || { mode: s.mode, runs: 0, best: null, sum: 0, n: 0, ms: 0, wins: 0, games: 0 };
      m.runs++; m.ms += s.ms || 0;
      if (typeof s.wpm === 'number') { m.best = Math.max(m.best ?? 0, s.wpm); m.sum += s.wpm; m.n++; }
      if (typeof s.won === 'boolean') { m.games++; if (s.won) m.wins++; }
      modes.set(s.mode, m);
    }
    return {
      typed,
      avg10: last(10).length ? Math.round(avg(last(10), s => s.wpm)) : null,
      avg50: last(50).length ? Math.round(avg(last(50), s => s.wpm)) : null,
      acc10: accOf(last(10)), acc50: accOf(last(50)),
      n10: Math.min(10, typed.length), n50: Math.min(50, typed.length),
      words: Math.round(runs.reduce((a, s) => a + (s.correct || 0), 0) / 5),
      ms: runs.reduce((a, s) => a + (s.ms || 0), 0),
      runs: runs.length,
      modes: [...modes.values()].sort((a, b) => b.runs - a.runs || (b.best ?? 0) - (a.best ?? 0)),
    };
  }

  // { key: { ok, bad, n, rate } } from keyStats, or from each run's kmiss when that is all there is
  function keyTable(sessions, keyStats) {
    const out = {};
    const add = (k, ok, bad) => { const t = (out[keyOf(k)] ||= { ok: 0, bad: 0 }); t.ok += ok; t.bad += bad; };
    let countsOnly = false;
    if (keyStats && Object.keys(keyStats).length) for (const [k, [ok, bad]] of Object.entries(keyStats)) add(k, ok || 0, bad || 0);
    else { countsOnly = true; for (const s of sessions) if (s && s.kmiss) for (const [k, bad] of Object.entries(s.kmiss)) add(k, 0, bad || 0); }
    const maxBad = Math.max(1, ...Object.values(out).map(t => t.bad));
    for (const t of Object.values(out)) { t.n = t.ok + t.bad; t.rate = countsOnly ? t.bad / maxBad * 0.12 : t.n ? t.bad / t.n : 0; }
    return { keys: out, countsOnly };
  }
  const stepOf = rate => STEPS.findIndex(([hi]) => rate < hi);

  function render(host, { sessions = [], keyStats = null, totals = null } = {}) {
    const S = summarise(sessions);
    const K = keyTable(sessions, keyStats);
    const e = UI.esc;
    const words = totals && totals.words != null ? totals.words : S.words;
    const ms = totals && totals.ms != null ? totals.ms : S.ms;
    const runs = totals && totals.sessions != null ? totals.sessions : S.runs;
    const anyWins = S.modes.some(m => m.games);
    const weak = Object.entries(K.keys).filter(([, t]) => t.bad && (K.countsOnly || t.n >= MIN_TRIES))
      .sort((a, b) => b[1].rate - a[1].rate || b[1].bad - a[1].bad).slice(0, 5);
    const num = (v, unit = '') => (v == null ? '<span class="dim">none</span>' : `${v}${unit}`);

    host.innerHTML = `
      <section class="panel hot sv">
        <div class="ph">// STATS<span class="meta">${UI.fmt(runs)} RUNS</span></div>
        <div class="sv-tiles">
          <div><span class="label">Avg wpm, last ${S.n10 || 10}</span><b class="mid">${num(S.avg10)}</b></div>
          <div><span class="label">Avg wpm, last ${S.n50 || 50}</span><b class="mid">${num(S.avg50)}</b></div>
          <div><span class="label">Accuracy, last ${S.n10 || 10}</span><b class="mid">${num(S.acc10, '%')}</b></div>
          <div><span class="label">Accuracy, last ${S.n50 || 50}</span><b class="mid">${num(S.acc50, '%')}</b></div>
          <div><span class="label">Words typed</span><b class="mid">${UI.fmt(words)}</b></div>
          <div><span class="label">Time typing</span><b class="mid">${UI.time(ms)}</b></div>
        </div>
        <div class="sv-chart-head"><span class="label">Wpm per run, last ${Math.min(100, S.typed.length) || 100}</span></div>
        <div class="sv-chart" data-sv-chart></div>
      </section>

      <section class="panel sv">
        <div class="ph">// BY MODE</div>
        ${S.modes.length ? `<div class="sv-scroll"><table class="sv-modes">
          <thead><tr><th>Mode</th><th class="r">Runs</th><th class="r">Best wpm</th><th class="r">Avg wpm</th>${anyWins ? '<th class="r">Won</th>' : ''}<th class="r hide-sm">Time</th></tr></thead>
          <tbody>${S.modes.map(m => `<tr data-mode="${e(m.mode)}"><td>${e(modeName(m.mode))}</td><td class="r">${UI.fmt(m.runs)}</td>
            <td class="r w">${m.best ?? ''}</td><td class="r">${m.n ? Math.round(m.sum / m.n) : ''}</td>
            ${anyWins ? `<td class="r">${m.games ? `${m.wins} of ${m.games}` : ''}</td>` : ''}<td class="r hide-sm">${UI.time(m.ms)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty">No runs yet.</p>'}
      </section>

      <section class="panel sv">
        <div class="ph">// MISSED KEYS<span class="meta">${K.countsOnly ? 'MISSES' : 'MISS RATE'}</span></div>
        <div class="sv-kb" data-sv-kb role="img" aria-label="${e(weak.length ? 'Weakest keys: ' + weak.map(([k, t]) => `${label(k)} ${K.countsOnly ? t.bad + ' missed' : (t.rate * 100).toFixed(1) + '%'}`).join(', ') : 'No missed keys yet')}">
          ${[...ROWS.map(r => [...r]), [' ']].map(r => `<div class="kr">${r.map(k => keyCell(k, K)).join('')}</div>`).join('')}
        </div>
        ${K.countsOnly ? '' : `<div class="sv-legend" aria-hidden="true"><span class="label">Miss rate</span>${STEPS.map((s, i) => `<span><i style="background:${fill(i).bg}"></i>${s[1]}</span>`).join('')}</div>`}
        <div class="sv-weak">${weak.length ? `<span class="label">Weakest</span>${weak.map(([k, t]) =>
          `<span class="wk"><kbd>${e(label(k))}</kbd> ${K.countsOnly ? `${t.bad} missed` : `${(t.rate * 100).toFixed(1)}%, ${t.bad} of ${UI.fmt(t.n)}`}</span>`).join('')}`
          : `<span class="dim">No missed keys yet. Keys show here after a typing test.</span>`}</div>
      </section>
      <div class="sv-tip" data-sv-tip hidden></div>`;

    const tip = host.querySelector('[data-sv-tip]');
    const showTip = (html, x, y) => {
      tip.innerHTML = html; tip.hidden = false;
      const hr = host.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      let lx = x - hr.left + 14, ly = y - hr.top - th - 10;
      if (lx + tw > hr.width) lx = x - hr.left - tw - 14;
      if (ly < 0) ly = y - hr.top + 16;
      tip.style.left = Math.max(0, lx) + 'px'; tip.style.top = ly + 'px';
    };
    const hideTip = () => { tip.hidden = true; };

    // key hover
    const kb = host.querySelector('[data-sv-kb]');
    kb.addEventListener('pointermove', ev => {
      const c = ev.target.closest('[data-key]');
      if (!c) return hideTip();
      const k = c.dataset.key, t = K.keys[k];
      const head = `<b>${e(label(k))}</b>`;
      if (!t || !t.n && !t.bad) return showTip(`${head}<span>No presses yet</span>`, ev.clientX, ev.clientY);
      showTip(K.countsOnly ? `${head}<span>${t.bad} missed</span>` : `${head}<span>${t.bad} missed of ${UI.fmt(t.n)}, ${(t.rate * 100).toFixed(1)}%</span>`, ev.clientX, ev.clientY);
    });
    kb.addEventListener('pointerleave', hideTip);

    // chart
    const box = host.querySelector('[data-sv-chart]');
    const pts = S.typed.slice(-100);
    const draw = () => chart(box, pts, showTip, hideTip);
    draw();
    let ro = null;
    if (window.ResizeObserver) { let w = box.clientWidth; ro = new ResizeObserver(() => { if (box.clientWidth !== w) { w = box.clientWidth; draw(); } }); ro.observe(box); }
    return { destroy() { if (ro) ro.disconnect(); host.innerHTML = ''; } };
  }

  function keyCell(k, K) {
    const t = K.keys[k];
    const has = t && (t.n || t.bad);
    const lbl = label(k);
    if (!has) return `<span class="kk none${k === ' ' ? ' space' : ''}" data-key="${UI.esc(k)}">${UI.esc(lbl)}</span>`;
    const enough = K.countsOnly || t.n >= MIN_TRIES;
    const f = fill(Math.max(0, stepOf(t.rate)));
    const style = t.bad && enough ? `background:${f.bg};color:${f.ink}` : '';
    return `<span class="kk${k === ' ' ? ' space' : ''}${t.bad && enough ? ' hit' : ''}" data-key="${UI.esc(k)}" style="${style}">${UI.esc(lbl)}</span>`;
  }

  // one series, so no legend: the label above names it
  function chart(box, runs, showTip, hideTip) {
    const W = Math.max(240, box.clientWidth || 480), H = 180;
    const pl = 34, pr = 40, pt = 12, pb = 22, iw = W - pl - pr, ih = H - pt - pb;
    if (!runs.length) {
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><line x1="${pl}" x2="${W - pr}" y1="${pt + ih}" y2="${pt + ih}" class="ax"/></svg><p class="sv-none">Your wpm shows here after your first run.</p>`;
      return;
    }
    const v = runs.map(s => s.wpm);
    let lo = Math.min(...v), hi = Math.max(...v);
    if (hi - lo < 20) { const m = (hi + lo) / 2; lo = m - 10; hi = m + 10; }
    const step = [5, 10, 20, 25, 50, 100].find(s => (hi - lo) / s <= 4) || 100;
    lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step;
    const x = i => pl + (v.length < 2 ? iw / 2 : i / (v.length - 1) * iw);
    const y = w => pt + ih - (w - lo) / (hi - lo) * ih;
    let grid = '';
    for (let g = lo; g <= hi + 0.001; g += step) grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" class="gr"/><text x="${pl - 6}" y="${y(g).toFixed(1)}" class="yt">${g}</text>`;
    const path = v.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(w).toFixed(1)}`).join('');
    const area = `${path}L${x(v.length - 1).toFixed(1)} ${pt + ih}L${x(0).toFixed(1)} ${pt + ih}Z`;
    const li = v.length - 1;
    const d0 = UI.date(runs[0].at, false), d1 = UI.date(runs[li].at, false);
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Wpm per run, ${v.length} runs from ${UI.esc(d0)} to ${UI.esc(d1)}, last ${v[li]} wpm, best ${Math.max(...v)}">
      ${grid}
      <path d="${area}" class="ar"/>
      <path d="${path}" class="ln"/>
      <text x="${pl}" y="${H - 6}" class="xt">${UI.esc(d0)}</text>
      ${v.length > 1 ? `<text x="${W - pr}" y="${H - 6}" class="xt" text-anchor="end">${UI.esc(d1)}</text>` : ''}
      <circle cx="${x(li).toFixed(1)}" cy="${y(v[li]).toFixed(1)}" r="4" class="dot"/>
      <text x="${(x(li) + 8).toFixed(1)}" y="${y(v[li]).toFixed(1)}" class="end">${v[li]}</text>
      <g class="hv" style="display:none"><line class="cx" y1="${pt}" y2="${pt + ih}"/><circle r="4" class="dot"/></g>
      <rect x="${pl}" y="${pt}" width="${iw}" height="${ih}" fill="transparent" data-hit/>
    </svg>`;
    const svg = box.querySelector('svg'), hv = svg.querySelector('.hv'), hit = svg.querySelector('[data-hit]');
    hit.addEventListener('pointermove', ev => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * W / r.width;
      const i = Math.max(0, Math.min(li, Math.round(v.length < 2 ? 0 : (px - pl) / iw * li)));
      hv.style.display = '';
      hv.querySelector('.cx').setAttribute('x1', x(i)); hv.querySelector('.cx').setAttribute('x2', x(i));
      hv.querySelector('circle').setAttribute('cx', x(i)); hv.querySelector('circle').setAttribute('cy', y(v[i]));
      const s = runs[i];
      showTip(`<b>${s.wpm} wpm</b><span>${UI.esc(modeName(s.mode))}${typeof s.acc === 'number' ? `, ${s.acc}%` : ''}</span><span>${UI.esc(UI.date(s.at))}</span>`,
        r.left + x(i) * r.width / W, r.top + y(v[i]) * r.height / H);
    });
    hit.addEventListener('pointerleave', () => { hv.style.display = 'none'; hideTip(); });
  }

  return { render, modeName, summarise };
})();
