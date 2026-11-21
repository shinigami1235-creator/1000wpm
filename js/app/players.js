// #/u/<id>: a player's public profile, and #/u/<id>/room: their room, read only.
// #/u/me shows this device's own profile the way other players see it.
// Profiles come from Net.profiles (simulated players for now, the server later).
Router.register('u', (() => {
  const e = s => UI.esc(s);
  let el = null, viewer = null, roomOn = false, cancelRoom = null, seq = 0;

  function mount(root, params) { el = root; show(params || []); }
  function update(params) { stop(); show(params || []); }

  function show(p) {
    const id = decodeURIComponent(p[0] || 'me');
    const n = ++seq;
    el.innerHTML = '<div class="loading-state">Loading</div>';
    const call = p[1] === 'room' ? Net.profiles.visit(id) : Net.profiles.get(id).then(profile => ({ profile }));
    call.then(r => { if (n !== seq || !el) return; if (p[1] === 'room') room(r.profile, r.room); else profile(r.profile); })
      .catch(err => { if (n === seq && el) el.innerHTML = `<div class="panel du-wait"><p>${e(err.message || 'No player with that name.')}</p><a class="btn out" href="#/duel">Players online</a></div>`; });
  }

  function profile(p) {
    const me = p.id === 'me', art = !!p.art;
    const d = p.duel || {};
    const t = d.rating ? NetRating.tier(d.rating) : null;
    const modes = p.stats.modes ? Object.entries(p.stats.modes).filter(([, n]) => n > 0) : [];
    const maxM = modes.reduce((m, [, n]) => Math.max(m, n), 1);
    el.innerHTML = `
      ${me ? `<p class="u-preview"><b>How others see you.</b> This is your public profile. <a class="green" href="#/profile">Back to your profile</a></p>` : ''}
      <div class="u-grid">
        <section class="panel hot u-card" aria-label="Player">
          <div class="u-av" data-av>${art ? `<span class="mu-av art big">${MultiUI.LOGO}</span>` : MultiUI.img(p, 360, 180, 'class="u-img" alt=""')}</div>
          <div class="u-id">
            <h1>${e(p.name)}</h1>
            <div class="u-tags">${MultiUI.tag(p)}${art ? '<span class="mu-tag">@10000wpm</span>' : ''}${p.country ? `<span class="mu-tag">${e(MultiUI.country(p.country))}</span>` : ''}</div>
            <dl class="kv">
              ${art ? '' : `<dt>Level</dt><dd>${p.level}</dd>`}
              ${p.joined && !art ? `<dt>Joined</dt><dd>${e(UI.date(p.joined + 'T12:00:00', false))}</dd>` : ''}
            </dl>
            <div class="u-actions">
              ${me ? '<a class="btn" href="#/profile/avatar">Edit avatar</a>' : `<a class="btn" href="#/duel/${art ? 'art' : 'vs/' + encodeURIComponent(p.id)}">${art ? 'Challenge Art' : 'Challenge to a duel'}</a>`}
              ${art ? '<a class="btn out" href="https://www.instagram.com/10000wpm/" target="_blank" rel="noopener">Instagram</a>' : `<a class="btn out" href="#/u/${encodeURIComponent(p.id)}/room">${me ? 'See your room' : 'Visit room'}</a>`}
            </div>
            ${p.bot && !art ? '<p class="dim u-note">A simulated player. Real players show here once the server is live.</p>' : ''}
            ${art ? '<p class="dim u-note">Duels with Art use a ghost on his 204 wpm race pace until his live matches are on the server.</p>' : ''}
          </div>
        </section>
        <section class="panel" aria-label="Typing">
          <div class="ph">// TYPING</div>
          <div class="u-nums">
            <div><span class="label">Best wpm</span><b class="mid green">${p.stats.bestWpm || 0}</b></div>
            <div><span class="label">Average wpm</span><b class="mid">${p.stats.avgWpm || 0}</b></div>
            <div><span class="label">Accuracy</span><b class="mid">${p.stats.acc != null ? p.stats.acc + '%' : '-'}</b></div>
            ${p.stats.runs != null ? `<div><span class="label">Runs</span><b class="mid">${UI.fmt(p.stats.runs)}</b></div>` : ''}
            ${p.stats.achievements != null ? `<div><span class="label">Achievements</span><b class="mid">${p.stats.achievements}</b></div>` : ''}
          </div>
          ${modes.length ? `<div class="ph" style="margin-top:18px">// MODES PLAYED</div><ul class="u-modes">${modes.map(([m, n]) => `<li><span>${e(m)}</span><i style="--w:${(100 * n / maxM).toFixed(0)}%"></i><b class="num">${UI.fmt(n)}</b></li>`).join('')}</ul>` : ''}
        </section>
        <section class="panel" aria-label="Duels">
          <div class="ph">// DUELS${me ? '<span class="meta">THIS DEVICE</span>' : ''}</div>
          ${d.rating ? `<div class="du-rating"><b class="big">${d.rating}</b>${t ? `<span class="mu-tier ${t.id}">${t.name}</span>` : ''}</div>` : ''}
          ${art ? '<p class="dim">Art\'s rating is fixed at 2400 while his matches are simulated.</p>' : `<dl class="kv">
            <dt>Wins</dt><dd>${d.wins || 0}</dd><dt>Losses</dt><dd>${d.losses || 0}</dd>
            <dt>Best streak</dt><dd>${d.bestStreak || 0}</dd><dt>Vs Art</dt><dd>${d.vsArt ? `${d.vsArt.w} won, ${d.vsArt.l} lost` : '-'}</dd>
          </dl>`}
        </section>
      </div>`;
    // the live 3D avatar replaces the picture once it loads; drag to turn it
    if (!art && window.Avatar && Avatar.viewer) {
      const host = el.querySelector('[data-av]');
      const look = MultiUI.look(p);
      Avatar.viewer(host, { reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }).then(v => {
        if (!v || !el || !host.isConnected) { if (v) v.dispose(); return; }
        viewer = v; v.set(look);
        host.classList.add('live');
      }).catch(() => {});
    }
  }

  function room(p, r) {
    roomOn = false;
    const me = p.id === 'me';
    el.classList.add('page-full');
    el.innerHTML = `
      <div class="u-roomhead">
        <a class="btn out sm" href="#/u/${encodeURIComponent(p.id)}">Back to ${me ? 'your public profile' : e(p.name) + "'s profile"}</a>
        <p class="dim">${me ? 'Your room as visitors see it.' : 'Read only. Drag to look around.'}</p>
        ${me ? '' : `<a class="btn sm" href="#/duel/vs/${encodeURIComponent(p.id)}">Challenge to a duel</a>`}
      </div>
      <section class="panel room-host" aria-label="${e(p.name)}'s room" data-host></section>`;
    const host = el.querySelector('[data-host]');
    const visit = me ? { name: p.name, layout: r.layout, owned: r.owned } : { name: p.name, layout: r && r.layout || null, owned: (r && r.owned) || [], size: r && r.size, preset: r && r.preset };
    cancelRoom = UI.waitFor('Room', host, R => { R.mount(host, { visit }); roomOn = true; });
  }

  function stop() {
    seq++;
    if (viewer) { viewer.dispose(); viewer = null; }
    if (cancelRoom) { cancelRoom(); cancelRoom = null; }
    if (roomOn && window.Room) { try { Room.unmount(); } catch (err) { console.error(err); } }
    roomOn = false;
    if (el) el.classList.remove('page-full');
  }
  function unmount() { stop(); el = null; }

  return { title: 'Player', mount, update, unmount };
})());
