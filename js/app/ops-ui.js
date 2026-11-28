// The profile's CTRL parts (CTRL.md): the Operator ID card and the division picker.
//   OpsUI.card({ name, img, editBtn })   -> HTML for the Operator ID panel
//   OpsUI.picker(host)                     renders the six divisions and handles picking
//   OpsUI.patch(id, size)                  -> a division's patch as inline SVG
window.OpsUI = (() => {
  const e = s => UI.esc(s);
  const P = () => Combat.Perks;
  // each division's mark inside the patch hexagon, drawn on a 24 x 24 grid
  const MARK = {
    striker: '<path d="M13 3 6 13h5l-1 8 8-11h-5l1-7z"/>',
    precision: '<circle cx="12" cy="12" r="6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
    hunter: '<path d="M4 20 20 4M14 4h6v6"/><path d="M4 14v6h6"/>',
    sentinel: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3z"/>',
    ghost: '<path d="M6 20V10a6 6 0 0 1 12 0v10l-3-2-3 2-3-2-3 2z"/><path d="M10 11h.01M14 11h.01"/>',
    architect: '<path d="M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5"/>',
  };
  function patch(id, size = 28) {
    return `<svg class="op-patch" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">
      <path class="op-hex" d="M16 1.5 28.5 8.75v14.5L16 30.5 3.5 23.25V8.75z"/>
      <g transform="translate(4 4)">${MARK[id] || ''}</g></svg>`;
  }

  function card({ name, img, editBtn = '' }) {
    const st = WPM.stats(), lv = WPM.levelInfo(), cl = Ops.clearance(), d = Ops.division();
    const next = P().CLEARANCE[cl.i + 1];
    const targets = window.Progress && Progress.counter ? (Progress.counter('bossDmg') > 0 ? 1 : 0) : 0;
    const gold = cl.i >= 7;
    return `
      <div class="op-card${gold ? ' gold' : ''}">
        <div class="op-head"><span class="op-brand"><span class="ctrl-tag" aria-hidden="true"><svg viewBox="0 0 2001 2428"><use href="#i-ctrl"/></svg></span>CTRL // Operator ID</span><span class="op-live">Active</span></div>
        <div class="op-who">
          ${img}
          <div class="op-id">
            <span class="op-num">Operator ${e(Ops.number())}</span>
            <div class="name-row" data-name><h2>${e(name)}</h2>${editBtn}</div>
            <span class="op-div">${d ? `${cl.i >= 2 ? patch(d.id, 22) : ''}${e(d.name)} division` : 'No division yet'}</span>
            <span class="op-cl">${e(cl.cl)} / ${e(cl.name)}</span>
          </div>
        </div>
        <div class="op-stats">
          <div><span class="label">Top speed</span><b>${UI.fmt(st.bestWpm || 0)}</b><small>WPM</small></div>
          <div><span class="label">Accuracy</span><b>${st.accuracy ? st.accuracy + '%' : '-'}</b></div>
          <div><span class="label">Targets</span><b>${targets}/100</b></div>
        </div>
        <div class="level">
          <div class="row"><span class="label">Level ${lv.level}</span><span class="dim">${UI.fmt(lv.into)} / ${UI.fmt(lv.next)} XP</span></div>
          <div class="xpbar"><i style="width:${Math.round(100 * lv.into / lv.next)}%"></i></div>
          <small>${next ? `${e(next.cl)} ${e(next.name)} at level ${next.at}: ${e(next.perk)}` : 'Highest clearance'}</small>
        </div>
      </div>`;
  }

  function picker(host) {
    if (!host) return;
    const paint = () => {
      const d = Ops.division(), r = Ops.rank(), sug = Ops.suggest(), sw = Ops.canSwitch();
      host.innerHTML = `
        <div class="ph">// Division</div>
        <p class="op-note">${d ? `Your perk works in the World Boss, Boss Rush and Party. Duels stay even.` : `Pick a division. Its perk works in the World Boss, Boss Rush and Party. Duels stay even.`}
          ${d && !sw.ok ? ` You can switch again in ${Math.ceil(sw.left / 3600000)} h.` : ''}</p>
        <ul class="op-divs">
          ${P().DIVISIONS.map(x => `
            <li class="${d && d.id === x.id ? 'on' : ''}">
              ${patch(x.id, 34)}
              <div class="op-dtext">
                <b>${e(x.name)}</b> <span class="dim">${e(x.good)}</span>${sug.id === x.id && !(d && d.id === x.id) ? ' <span class="op-sug">Suggested</span>' : ''}
                <p><em>${e(x.perk)}.</em> ${e(P().text(x.id, r))}</p>
                ${sug.id === x.id && !(d && d.id === x.id) ? `<p class="dim">${e(sug.why)}</p>` : ''}
              </div>
              ${d && d.id === x.id ? '<span class="op-cur">Current</span>' : `<button class="btn out sm" type="button" data-pick="${x.id}" ${d && !sw.ok ? 'disabled' : ''}>${d ? 'Switch' : 'Join'}</button>`}
            </li>`).join('')}
        </ul>
        <p class="op-note dim">Rank ${['I', 'II', 'III'][r - 1]} perk, stronger at CL-04 and CL-07.</p>`;
      host.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        const res = Ops.pick(b.dataset.pick);
        if (!res.ok) { const n = host.querySelector('.op-note'); if (n) n.textContent = res.why; }
      }));
    };
    paint();
    addEventListener('wpm-ops', paint);
    return () => removeEventListener('wpm-ops', paint);
  }

  return { card, picker, patch };
})();
