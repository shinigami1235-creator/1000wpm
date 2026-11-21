// Shared pieces for the multiplayer pages (duels, party runs, player profiles):
// this player's public profile, avatars and name tags for other players, the
// accuracy ring and the floating damage numbers.
//
//   MultiLocal.profile()             this device's public profile, the same shape NetSim gives a simulated player
//   MultiUI.look(p)                  an avatar look for a profile or player ({ art: true } for Art)
//   MultiUI.img(p, size, show, attrs)
//   MultiUI.tag(p)                   'You', 'Bot' or 'Ghost' (Art while his matches are simulated)
//   MultiUI.name(p)                  escaped name with the tag
//   MultiUI.ring(acc, { color, label, size })   SVG accuracy ring
//   MultiUI.pop(layer, x, y, text, cls)          a floating number or word
//   MultiUI.country(code)
window.MultiLocal = (() => {
  const GROUPS = [
    ['Typing test', m => /^(time|words)-|^quote$|^custom$/.test(m)],
    ['Race', m => /^race-/.test(m)],
    ['Breach', m => /^horde-|^breach-/.test(m)],
    ['World boss', m => m === 'world-boss'],
    ['Duels', m => /^duel/.test(m)],
    ['Party runs', m => m === 'party'],
    ['Academy', m => /^learn|^lesson|^free/.test(m)],
  ];
  function profile() {
    const p = WPM.profile(), st = WPM.stats(), lv = WPM.levelInfo();
    const modes = {};
    for (const [name] of GROUPS) modes[name] = 0;
    for (const s of WPM.sessions()) { const g = GROUPS.find(([, f]) => f(s.mode || '')); if (g) modes[g[0]]++; }
    const achs = WPM.achievements();
    return {
      id: 'me', name: p.name, bot: false, you: true, level: lv.level, joined: p.joined, country: null,
      stats: { bestWpm: st.bestWpm, avgWpm: st.avgWpm, acc: st.accuracy, runs: st.sessions, modes, achievements: achs.filter(a => a.unlocked).length },
      room: { layout: WPM.getRoom(), owned: WPM.owned() },
    };
  }
  return { profile };
})();

window.MultiUI = (() => {
  const e = s => UI.esc(s);
  const LOGO = `<svg class="mu-art" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-logo"/></svg>`;

  function look(p) {
    if (!p) return null;
    if (p.art || p.id === 'art') return { art: true };
    if (p.id === 'me' || p.you) return window.Avatar ? Avatar.mine() : null;
    return window.Avatar ? Avatar.bot(p.id || p.name) : null;
  }
  function img(p, size = 68, show = 34, attrs = '') {
    if (p && (p.art || p.id === 'art')) return `<span class="mu-av art" style="width:${show}px;height:${show}px">${LOGO}</span>`;
    if (p && (p.id === 'me' || p.you)) return UI.meImg(size, show, attrs);
    if (window.Avatar) return Avatar.img(look(p), size, show, attrs);
    return `<img src="${UI.avatar(NetCore.hash(p ? p.id : 'x') % UI.AVATARS.length, size)}" width="${show}" height="${show}" alt="" ${attrs}>`;
  }
  function tag(p) {
    if (!p) return '';
    if (p.id === 'me' || p.you) return '<span class="mu-tag you">You</span>';
    if (p.art || p.id === 'art') return '<span class="mu-tag art" title="Art is simulated until his live matches are on the server">Ghost</span>';
    if (p.bot) return '<span class="mu-tag bot" title="A simulated player">Bot</span>';
    return '';
  }
  const name = p => `<span class="mu-name">${e(p.name)}</span>${tag(p)}`;
  const link = p => (p.id === 'me' ? '#/u/me' : `#/u/${encodeURIComponent(p.id)}`);

  function ring(acc, { color = 'var(--green)', label = 'Accuracy', size = 64, sub = '' } = {}) {
    const r = 26, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, (acc || 0) / 100));
    return `<svg class="mu-ring" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${e(label)} ${Math.round(acc)}%">
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="5"/>
      <circle class="mu-ring-v" cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="butt"
        stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>
      <text x="32" y="${sub ? 31 : 37}" text-anchor="middle" class="mu-ring-t">${Math.round(acc)}</text>
      ${sub ? `<text x="32" y="45" text-anchor="middle" class="mu-ring-s">${e(sub)}</text>` : ''}
    </svg>`;
  }
  function setRing(svg, acc) {
    if (!svg) return;
    const v = svg.querySelector('.mu-ring-v'), t = svg.querySelector('.mu-ring-t');
    const c = 2 * Math.PI * 26, f = Math.max(0, Math.min(1, (acc || 0) / 100));
    v.setAttribute('stroke-dasharray', `${(c * f).toFixed(1)} ${c.toFixed(1)}`);
    t.textContent = Math.round(acc);
    svg.setAttribute('aria-label', `Accuracy ${Math.round(acc)}%`);
  }

  function pop(layer, x, y, text, cls = '') {
    if (!layer) return;
    const d = document.createElement('span');
    d.className = 'mu-pop ' + cls;
    d.textContent = text;
    d.style.left = Math.round(x + (Math.random() - 0.5) * 40) + 'px';
    d.style.top = Math.round(y + (Math.random() - 0.5) * 16) + 'px';
    layer.append(d);
    setTimeout(() => d.remove(), 1100);
    while (layer.childElementCount > 40) layer.firstChild.remove();
  }

  const country = code => (code && window.Community ? Community.name(code) : code || '');
  const spellName = id => { const s = Combat.spell(id); return s ? s.word : id; };

  // The Duels tab on #/leaderboard: this device's record and everyone it has duelled,
  // ranked by rating. The global board needs the server.
  function duelBoard(sub, board) {
    sub.innerHTML = '<p class="dim lb-note">This device only. Players from everywhere show here once the server is live.</p>';
    board.innerHTML = '<div class="loading-state">Loading</div>';
    Promise.all([Net.results.record(), Net.results.opponents()]).then(([r, opps]) => {
      if (!board.isConnected) return;
      const t = NetRating.tier(r.rating);
      const me = { id: 'me', name: WPM.profile().name, you: true };
      const rows = [{ p: me, rating: r.rating, w: r.wins, l: r.losses, me: true },
        ...opps.map(o => ({ p: o, rating: o.rating, w: o.w, l: o.l })),
        ...(opps.some(o => o.art) ? [] : [{ p: { id: 'art', name: 'Art', art: true }, rating: NetRating.ART, w: 0, l: 0 }])].sort((a, b) => b.rating - a.rating);
      const hist = r.history.slice(-8).reverse();
      board.innerHTML = `
        <div class="lb-boss mu-duelstats">
          <div><span class="label">Rating</span><span class="mu-rt"><b class="mid">${r.rating}</b><span class="mu-tier ${t.id}">${t.name}</span></span></div>
          <div><span class="label">Wins</span><b class="mid">${r.wins}</b></div>
          <div><span class="label">Losses</span><b class="mid">${r.losses}</b></div>
          <div><span class="label">Best streak</span><b class="mid">${r.bestStreak}</b></div>
          <div><span class="label">Vs Art</span><b class="mid">${r.vsArt.w}-${r.vsArt.l}</b></div>
        </div>
        <table class="board">
          <thead><tr><th>#</th><th>Typist</th><th class="num-col">Rating</th><th class="num-col">Your wins</th><th class="num-col hide-sm">Your losses</th></tr></thead>
          <tbody>${rows.map((x, i) => `<tr class="${x.me ? 'mine-best' : x.p.art ? 'art' : ''}">
            <td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td>
            <td><div class="who"><a class="mu-who" href="${link(x.p)}">${img(x.p, 68, 34)}<span>${name(x.p)}</span></a></div></td>
            <td class="w num-col">${x.rating}</td><td class="n num-col">${x.me ? '' : x.w}</td><td class="n num-col hide-sm">${x.me ? '' : x.l}</td></tr>`).join('')}</tbody>
        </table>
        ${hist.length ? `<div class="ph" style="margin-top:20px">// RECENT DUELS</div><ol class="du-last">${hist.map(h => `<li class="${h.score === 1 ? 'w' : h.score === 0 ? 'l' : ''}"><span>${h.score === 1 ? 'Won' : h.score === 0 ? 'Lost' : 'Draw'}</span> vs <a href="${link(h.opp)}">${e(h.opp.name)}</a>${tag(h.opp)} <span class="dim">${h.wins ? h.wins.join('-') : ''}, ${h.wpm} wpm, ${h.acc}%</span><em>${h.delta > 0 ? '+' : ''}${h.delta}</em></li>`).join('')}</ol>`
          : '<p class="empty">No duels on this device yet. <a class="green" href="#/duel">Start a duel</a> to get on the board.</p>'}`;
    }).catch(err => { board.innerHTML = `<p class="empty">${e(err.message)}</p>`; });
  }

  // The duel and party panel on #/profile
  function profilePanel(host) {
    if (!host || !window.Net) return;
    Promise.all([Net.results.record(), Net.results.party()]).then(([r, p]) => {
      if (!host.isConnected) return;
      const t = NetRating.tier(r.rating);
      host.innerHTML = `<div class="ph">// DUELS AND PARTY</div>
        <div class="du-rating"><b class="mid">${r.rating}</b><span class="mu-tier ${t.id}">${t.name}</span></div>
        <dl class="kv"><dt>Duels won</dt><dd>${r.wins} of ${r.games}</dd><dt>Best streak</dt><dd>${r.bestStreak}</dd><dt>Vs Art</dt><dd>${r.vsArt.w} won, ${r.vsArt.l} lost</dd>
          <dt>Party runs</dt><dd>${p.wins} cleared of ${p.runs}</dd></dl>
        <div class="row" style="margin-top:12px"><a class="btn out sm" href="#/u/me">How others see you</a><a class="btn out sm" href="#/duel">Duel</a><a class="btn out sm" href="#/party">Party</a></div>`;
    }).catch(() => {});
  }

  return { look, img, tag, name, link, ring, setRing, pop, country, spellName, LOGO, duelBoard, profilePanel };
})();
