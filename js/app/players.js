// #/u/<id>: a player's public profile with a picture of their room, and #/u/<id>/room: their room, read only.
// #/u/me shows this device's own profile the way other players see it.
// Profiles come from Net.profiles (simulated players for now, the server later).
Router.register('u', (() => {
  const e = s => UI.esc(s);
  let el = null, viewer = null, roomOn = false, cancelRoom = null, seq = 0, stops = [];

  function mount(root, params) { el = root; show(params || []); }
  function update(params) { stop(); show(params || []); }

  function show(p) {
    const id = decodeURIComponent(p[0] || 'me');
    const n = ++seq;
    el.innerHTML = '<div class="loading-state">Loading</div>';
    const call = p[1] === 'room' ? Net.profiles.visit(id) : Net.profiles.get(id).then(profile => ({ profile }));
    call.then(r => { if (n !== seq || !el) return; if (p[1] === 'room') room(r.profile); else profile(r.profile); })
      .catch(err => { if (n === seq && el) el.innerHTML = `<div class="panel du-wait"><p>${e(err.message || 'No operator with that name.')}</p><a class="btn out" href="#/duel">Players online</a></div>`; });
  }

  // Add friend, Request sent, Accept friend request, or Message once you are friends
  function friendButton(p) {
    const b = el.querySelector('[data-ufriend]'); if (!b) return;
    let st = 'none';
    const paint = d => {
      if (!b.isConnected) return;
      st = d.friends.some(f => f.id === p.id) ? 'friend' : d.incoming.some(f => f.id === p.id) ? 'incoming' : d.outgoing.some(f => f.id === p.id) ? 'sent' : d.blocked.some(f => f.id === p.id) ? 'blocked' : 'none';
      b.textContent = { none: 'Add friend', sent: 'Request sent', incoming: 'Accept friend request', friend: 'Message', blocked: 'Blocked' }[st];
      b.disabled = st === 'sent' || st === 'blocked';
    };
    Net.friends.list().then(paint).catch(() => { b.hidden = true; });
    const off = Net.on('friends', paint);
    stops.push(off);
    b.addEventListener('click', () => {
      if (st === 'friend') { location.hash = '#/commons/@' + encodeURIComponent(p.id); return; }
      b.disabled = true;
      (st === 'incoming' ? Net.friends.accept(p.id) : Net.friends.request(p.id, p.name)).catch(err => { b.disabled = false; if (window.Toast) Toast('t-level', `<span>${e(err.message)}</span>`); });
    });
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
        <section class="panel hot u-card" aria-label="Operator">
          <div class="u-av" data-av>${art ? `<span class="mu-av art big">${MultiUI.LOGO}</span>` : MultiUI.img(p, 360, 180, 'class="u-img" alt=""')}</div>
          <div class="u-id">
            <h1>${e(p.name)}</h1>
            <div class="u-tags">${MultiUI.tag(p)}${art ? '<span class="mu-tag">@10000wpm</span>' : ''}${p.country ? `<span class="mu-tag">${e(MultiUI.country(p.country))}</span>` : ''}</div>
            <dl class="kv">
              ${art ? '' : `<dt>Level</dt><dd>${p.level}</dd>`}
              ${p.joined && !art ? `<dt>Joined</dt><dd>${e(UI.date(p.joined + 'T12:00:00', false))}</dd>` : ''}
            </dl>
            <div class="u-actions">
              ${me ? '<a class="btn" href="#/lab">Edit operator</a>' : `<a class="btn" href="#/duel/${art ? 'art' : 'vs/' + encodeURIComponent(p.id)}">${art ? 'Challenge Art' : 'Challenge to a duel'}</a>`}
              ${art ? '<a class="btn out" href="https://www.instagram.com/10000wpm/" target="_blank" rel="noopener">Instagram</a>' : `<a class="btn out" href="#/u/${encodeURIComponent(p.id)}/room">${me ? 'See your room' : 'Visit room'}</a>`}
              ${me || art ? '' : '<button class="btn out" type="button" data-ufriend disabled>Add friend</button>'}
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
          ${d.rating ? `<div class="du-rating"><b class="big">${d.rating}</b><span class="label">MMR</span>${t ? `<span class="mu-tier ${t.id}">${t.name}</span>` : ''}</div>` : ''}
          ${art ? '<p class="dim">Art\'s MMR is fixed at 2400 while his matches are simulated.</p>' : `<dl class="kv">
            <dt>Wins</dt><dd>${d.wins || 0}</dd><dt>Losses</dt><dd>${d.losses || 0}</dd>
            <dt>Best streak</dt><dd>${d.bestStreak || 0}</dd><dt>Vs Art</dt><dd>${d.vsArt ? `${d.vsArt.w} won, ${d.vsArt.l} lost` : '-'}</dd>
          </dl>`}
        </section>
        ${`<section class="panel u-room" aria-label="Room" data-uroom><div class="ph">// ${me ? 'YOUR ROOM' : 'ROOM'}<span class="meta" data-tag></span></div><a class="rm-thumb big" href="#/u/${encodeURIComponent(p.id)}/room" data-pic aria-label="${me ? 'See your room' : 'Visit ' + e(p.name) + "'s room"}"></a></section>`}
      </div>`;
    friendButton(p);
    roomPanel(p);
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

  // the room in tiers (js/room/tier-page.js), full width, read only
  function room(p) {
    roomOn = false;
    el.classList.add('rm-full');
    el.innerHTML = '<div data-host></div>';
    const host = el.querySelector('[data-host]');
    cancelRoom = UI.waitFor('Room', host, R => { R.mount(host, { visit: { profile: p } }); roomOn = true; });
  }

  // a picture of their room under the profile; it opens the room
  function roomPanel(p) {
    const box = el.querySelector('[data-uroom]'); if (!box) return;
    const n = seq;
    (window.Lazy ? Lazy.need('room') : Promise.resolve()).then(() => {
      if (n !== seq || !box.isConnected || !window.RoomData) return;
      const d = RoomData.of(p), T = RoomTiers.TIERS[d.tier];
      box.querySelector('[data-tag]').textContent = `Tier ${d.tier} // ${T.name}`;
      const v = RoomView.create(box.querySelector('[data-pic]'), { ...d, fit: 'cover' });
      stops.push(() => v.dispose());
    }).catch(() => { box.hidden = true; });
  }

  function stop() {
    seq++;
    stops.forEach(f => f()); stops = [];
    if (viewer) { viewer.dispose(); viewer = null; }
    if (cancelRoom) { cancelRoom(); cancelRoom = null; }
    if (roomOn && window.Room) { try { Room.unmount(); } catch (err) { console.error(err); } }
    roomOn = false;
    if (el) el.classList.remove('page-full', 'rm-full');
  }
  function unmount() { stop(); el = null; }

  return { title: 'Operator', mount, update, unmount };
})());
