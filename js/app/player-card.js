// A small card for another player, opened from a name or a portrait: View profile,
// Add friend (or Message once you are friends), Challenge to duel, Invite to party, Mute, Block and Report. Built from MultiUI's portraits and
// tags, the duel route (#/duel/vs/<id>) and Net.lobbies.invite, so any page can use it.
//
//   PlayerCard.open(anchor, player, { room, lines, dm, onMute(id, on) })   dm: opened from a private chat, so a report sends that chat
//      player: { id, name, bot, country, level, rating, wpm }, lines: their recent messages for a report
//   PlayerCard.close()
window.PlayerCard = (() => {
  const e = s => UI.esc(s);
  const REASONS = ['Rude or mean', 'Spam', 'Asking for personal details', 'Something else'];
  let box = null, anchor = null, offs = [];

  function close() {
    offs.forEach(f => f()); offs = [];
    if (box) box.remove();
    box = null;
    if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
    anchor = null;
  }

  function place() {
    if (!box || !anchor) return;
    if (matchMedia('(max-width: 600px)').matches) { box.classList.add('sheet'); box.style.left = box.style.top = ''; return; }
    box.classList.remove('sheet');
    const r = anchor.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    let x = r.right + 10, y = r.top - 8;
    if (x + w > innerWidth - 12) x = r.left - w - 10;
    if (x < 12) x = Math.max(12, Math.min(innerWidth - w - 12, r.left));
    if (x === r.left || x < r.left && x + w > r.left) y = r.bottom + 8;
    y = Math.max(76, Math.min(innerHeight - h - 12, y));
    box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(y) + 'px';
  }

  function open(a, p, o = {}) {
    close();
    if (!p || !p.id) return;
    anchor = a;
    const me = p.id === 'me';
    let muted = Net.chat.muted().includes(p.id);
    const tier = p.rating ? NetRating.tier(p.rating) : null;
    const facts = [p.country ? MultiUI.country(p.country) : '', p.level ? `Level ${p.level}` : '', p.wpm ? `${p.wpm} wpm average` : ''].filter(Boolean).join(', ');
    const link = MultiUI.link(p);
    box = UI.el(`<div class="panel hot pc" role="dialog" aria-label="${e(p.name)}">
      <div class="pc-top">
        ${MultiUI.img(p, 128, 64, 'class="pc-img"')}
        <div class="pc-id">
          <p class="pc-name"><b>${e(p.name)}</b>${MultiUI.tag(p)}</p>
          ${facts ? `<p class="dim">${e(facts)}</p>` : ''}
          ${tier ? `<p><span class="mu-tier ${tier.id}">${tier.name}</span> <span class="num dim">${p.rating}</span></p>` : ''}
        </div>
        <button class="icon-btn pc-x" type="button" data-x aria-label="Close">x</button>
      </div>
      <div class="pc-acts">
        <a class="btn sm" href="${link}">View profile</a>
        ${me ? '' : `<button class="btn out sm" type="button" data-friend disabled>Add friend</button>
        <a class="btn out sm" href="#/duel/vs/${encodeURIComponent(p.id)}">Challenge to duel</a>
        <button class="btn out sm" type="button" data-invite>Invite to party</button>
        <button class="btn out sm" type="button" data-mute aria-pressed="${muted}">${muted ? 'Unmute' : 'Mute'}</button>
        <button class="btn out sm" type="button" data-block>Block</button>
        <button class="btn danger sm" type="button" data-report>Report</button>`}
      </div>
      <form class="pc-rep" data-repform hidden>
        <fieldset><legend class="label">Why are you reporting ${e(p.name)}?</legend>
          ${REASONS.map((r, i) => `<label><input type="radio" name="why" value="${e(r)}"${i ? '' : ' checked'}> ${e(r)}</label>`).join('')}
        </fieldset>
        <div class="row"><button class="btn danger sm" type="submit">Send report</button><button class="btn out sm" type="button" data-cancel>Cancel</button></div>
      </form>
      <p class="pc-msg" data-msg role="status"></p>
    </div>`);
    document.body.append(box);
    place();
    const msg = t => { if (box) box.querySelector('[data-msg]').textContent = t; };
    const q = s => box.querySelector(s);
    q('[data-x]').addEventListener('click', close);
    box.querySelectorAll('a').forEach(x => x.addEventListener('click', () => setTimeout(close)));
    if (!me) {
      let inviteId = null;
      q('[data-invite]').addEventListener('click', ev => {
        ev.currentTarget.disabled = true;
        Net.lobbies.invite(p.id).then(inv => { inviteId = inv.id; msg('Invite sent.'); })
          .catch(err => { msg(err.message); if (box) q('[data-invite]').disabled = false; });
      });
      offs.push(Net.on('invite', inv => {
        if (!box || inv.id !== inviteId) return;
        if (inv.status === 'accepted') msg(`${p.name} joined your party.`);
        if (inv.status === 'declined') { msg(`${p.name} can't join right now.`); q('[data-invite]').disabled = false; }
      }));
      q('[data-mute]').addEventListener('click', ev => {
        muted = !muted;
        Net.chat.mute(p.id, muted);
        ev.currentTarget.textContent = muted ? 'Unmute' : 'Mute';
        ev.currentTarget.setAttribute('aria-pressed', muted);
        if (o.onMute) o.onMute(p.id, muted);
      });
      // friend state: Add friend, Request sent, Accept request, or Message and Remove friend
      const fb = q('[data-friend]');
      let fstate = 'none';
      const paintFriend = d => {
        if (!box) return;
        fstate = d.friends.some(f => f.id === p.id) ? 'friend' : d.incoming.some(f => f.id === p.id) ? 'incoming' : d.outgoing.some(f => f.id === p.id) ? 'sent' : d.blocked.some(f => f.id === p.id) ? 'blocked' : 'none';
        fb.disabled = fstate === 'sent' || fstate === 'blocked';
        fb.textContent = { none: 'Add friend', sent: 'Request sent', incoming: 'Accept friend request', friend: 'Message', blocked: 'Blocked' }[fstate];
        fb.classList.toggle('out', fstate !== 'friend' && fstate !== 'incoming');
        const bl = q('[data-block]'); bl.textContent = fstate === 'blocked' ? 'Unblock' : 'Block';
        let rm = q('[data-unfriend]');
        if (fstate === 'friend' && !rm) { fb.insertAdjacentHTML('afterend', '<button class="btn out sm" type="button" data-unfriend>Remove friend</button>'); rm = q('[data-unfriend]'); rm.addEventListener('click', () => Net.friends.remove(p.id).then(() => msg(`${p.name} is off your friends list.`))); }
        if (fstate !== 'friend' && rm) rm.remove();
        place();
      };
      Net.friends.list().then(paintFriend).catch(() => { fb.hidden = true; });
      offs.push(Net.on('friends', paintFriend));
      fb.addEventListener('click', () => {
        if (fstate === 'friend') { location.hash = '#/commons/@' + encodeURIComponent(p.id); close(); return; }
        fb.disabled = true;
        (fstate === 'incoming' ? Net.friends.accept(p.id) : Net.friends.request(p.id, p.name))
          .then(() => msg(fstate === 'incoming' ? `You and ${p.name} are friends now.` : 'Friend request sent.'))
          .catch(err => { msg(err.message); if (box) fb.disabled = false; });
      });
      // blocking ends the friendship, hides their messages and stops their requests and private messages
      q('[data-block]').addEventListener('click', () => {
        if (fstate === 'blocked') { Net.friends.unblock(p.id).then(() => msg(`${p.name} is unblocked.`)); return; }
        Net.friends.block(p.id, p.name).then(() => {
          if (!muted) { muted = true; Net.chat.mute(p.id, true); const mb = q('[data-mute]'); mb.textContent = 'Unmute'; mb.setAttribute('aria-pressed', 'true'); if (o.onMute) o.onMute(p.id, true); }
          msg(`${p.name} is blocked. You won't see their messages or requests.`);
        });
      });
      const form = q('[data-repform]');
      q('[data-report]').addEventListener('click', () => { form.hidden = false; place(); form.querySelector('input').focus(); });
      q('[data-cancel]').addEventListener('click', () => { form.hidden = true; place(); });
      form.addEventListener('submit', ev => {
        ev.preventDefault();
        const reason = new FormData(form).get('why');
        (o.dm ? Net.dm.report({ player: p.id, name: p.name, reason }) : Net.chat.report({ player: p.id, name: p.name, room: o.room || null, reason, lines: o.lines || [] }))
          .then(() => { form.hidden = true; q('[data-report]').disabled = true; msg('Report saved. Moderators get it once the server is live.'); place(); })
          .catch(err => msg(err.message));
      });
    }
    const outside = ev => { if (box && !box.contains(ev.target) && !(anchor && anchor.contains(ev.target))) close(); };
    const key = ev => { if (ev.key === 'Escape' && box) { ev.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    addEventListener('resize', place);
    addEventListener('wpm-route', close);
    offs.push(() => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); removeEventListener('resize', place); removeEventListener('wpm-route', close); });
    (box.querySelector('.pc-acts .btn') || box).focus({ preventScroll: true });
  }

  return { open, close, isOpen: () => !!box };
})();
