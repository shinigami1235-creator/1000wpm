// #/commons: chat rooms grouped by area (js/net/chat-rooms.js). Room list on the left,
// the open room in the middle, who is in it on the right. On a phone the room list is its
// own screen and a room opens full width with a back button.
//
//   #/commons          the room list on a phone, the last room on a wider screen
//   #/commons/<room>   that room
//   #/commons/@<id>    a private chat with a friend. Rooms stay public; the only private chat is
//                      one on one between friends, checked by the same ChatRules as the rooms.
//
// Every message shows the speed it was typed at, from the first keystroke to Enter.
// Lines go through ChatRules here and again in the backend; the server runs the same file.
window.CommonsPage = { NAME: 'Open Port', events: ['chat_message'] };
if (window.WPM) WPM.events.register(...CommonsPage.events);

Router.register('commons', (() => {
  const e = s => UI.esc(s);
  const SEEN = 'wpm-chat-seen', LAST = 'wpm-chat-room';
  const GROUP_MS = 5 * 60000;
  const GREET = /\b(hi|hiya|hello|hey|yo|sup|hola|oi|halo|hallo|kumusta|morning|evening)\b|สวัสดี|หวัดดี|こんにちは|こんばんは|안녕|chào/i;
  const phone = matchMedia('(max-width: 760px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (x) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) {} },
  };

  let el = null, offs = [], timers = [], entered = null;
  let roomId = null, want = null, mode = 'full', allowed = null, summary = {}, seen = {}, seenDirty = false;
  let msgs = [], members = [], offline = [], posts = [], pending = [], muted = new Set(), moreOpen = false, joinSeq = 0;
  let t0 = null, tEnd = null, lastAt = null, recent = [], reply = null, waitUntil = 0, unseenBelow = 0;
  let dmWith = null, friend = null, fr = { friends: [], incoming: [], outgoing: [], blocked: [] }, unread = {}, allFriends = false;

  const ROOMS = () => Net.chat.rooms().areas.flatMap(a => a.rooms.map(r => ({ ...r, area: a.id })));
  const room = id => ROOMS().find(r => r.id === id);
  const q = s => el && el.querySelector(s);
  const ok = id => !allowed || allowed.includes(id);

  // ---------- mount ----------
  function mount(root, params) {
    el = root;
    muted = new Set(Net.chat.muted());
    seen = store.get(SEEN, {});
    el.innerHTML = `
      <h1 class="sr-only">${e(CommonsPage.NAME)}</h1>
      <div class="cm" data-view="list">
        <aside class="panel cm-side" aria-label="Rooms">
          <div class="ph">// ROOMS${Net.isSim() ? '<span class="cm-demo">Demo data</span>' : ''}</div>
          <p class="cm-note" data-modenote hidden></p>
          <section class="cm-fr" data-friends aria-label="Friends"></section>
          <nav class="cm-list" data-rooms aria-label="Rooms"></nav>
        </aside>
        <section class="panel cm-main" aria-labelledby="cm-title">
          <header class="cm-top">
            <a class="btn out sm cm-back" href="#/commons">Rooms</a>
            <div class="cm-tt"><h2 id="cm-title"><span class="pre">#</span><span data-name></span></h2><p data-topic></p></div>
            <button class="btn out sm cm-pbtn" type="button" data-pbtn aria-expanded="false" aria-controls="cm-people">People <b class="num" data-pcount></b></button>
          </header>
          <div class="cm-body">
            <ol class="cm-msgs" data-msgs role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages" tabindex="0"></ol>
            <div class="cm-posts" data-posts hidden></div>
            <p class="cm-off" data-off hidden>Chat is off for this account. A teacher can turn it on.</p>
            <button class="btn sm cm-jump" type="button" data-jump hidden>Jump to newest</button>
          </div>
          <footer class="cm-say" data-say>
            <p class="cm-ro" data-ro hidden>Only Art and the moderators post here.</p>
            <p class="cm-ro" data-qnote hidden>This account sends quick phrases only.</p>
            <div class="cm-reply" data-reply hidden><span data-rtext></span><button class="btn out sm" type="button" data-rcancel>Cancel reply</button></div>
            <div class="cm-quick" data-quick role="group" aria-label="Quick phrases">${ChatRules.QUICK.map(t => `<button class="cm-qp" type="button" data-qp="${e(t)}">${e(t)}</button>`).join('')}</div>
            <form class="cm-form" data-form>
              <label class="sr-only" for="cm-in">Message</label>
              <input class="field" id="cm-in" maxlength="${ChatRules.MAX}" autocomplete="off" spellcheck="false" enterkeyhint="send">
              <span class="cm-left num" data-left aria-hidden="true">${ChatRules.MAX}</span>
              <button class="btn" type="submit" data-send>Send</button>
            </form>
            <form class="cm-pform" data-pform hidden></form>
            <p class="cm-err" data-err role="alert"></p>
            <p class="cm-help" data-help>Enter starts a message from anywhere in the room. Esc leaves the box.</p>
          </footer>
        </section>
        <aside class="panel cm-people" id="cm-people" aria-label="People in this room" data-people></aside>
      </div>`;
    wire();
    offs.push(
      Net.on('chat.msg', onMsg),
      Net.on('chat.rooms', d => { summary = { ...summary, ...(d && d.rooms) }; if (summary[roomId]) markSeen(roomId, summary[roomId].seq); paintCounts(); }),
      Net.on('chat.people', onPeople),
      Net.on('chat.post', onPost),
      Net.on('chat.unpost', d => { posts = posts.filter(p => p.id !== d.id); if (isPosts()) paintPosts(); }),
      Net.on('chat.delete', d => { msgs = msgs.filter(m => m.id !== d.id); if (d.room === roomId) paintMsgs(); }),
      Net.on('friends', d => { fr = d; paintFriends(); if (dmWith && !fr.friends.some(f => f.id === dmWith)) location.hash = '#/commons'; }),
      Net.on('friend.request', r => { if (window.Toast) Toast('t-level', `${UI.icon('user', 'green')}<span><b>${e(r.name)}</b> sent you a friend request.</span>`, 5000); }),
      Net.on('friend.accepted', r => { if (window.Toast) Toast('t-level', `${UI.icon('user', 'green')}<span><b>${e(r.name)}</b> accepted your friend request. <a class="green" href="#/commons/@${encodeURIComponent(r.id)}">Message</a></span>`, 5000); }),
      Net.on('dm.threads', list => { unread = Object.fromEntries((list || []).map(t => [t.id, t.unread])); paintFriends(); }),
      Net.on('dm.msg', onDm),
      Net.on('invite', inv => {
        if (!window.Toast || PlayerCard.isOpen()) return;
        if (inv.status === 'accepted') Toast('t-level', `${UI.icon('bolt', 'green')}<span><b>${e(inv.toName)}</b> joined your party. <a class="green" href="#/party/lobby">Open lobby</a></span>`, 5000);
        if (inv.status === 'declined') Toast('t-level', `<span>${e(inv.toName)} can't join right now.</span>`);
      }),
    );
    const keys = onKey;
    document.addEventListener('keydown', keys);
    offs.push(() => document.removeEventListener('keydown', keys));
    const mq = () => { layout(); if (!phone.matches && !roomId) update([]); };
    phone.addEventListener('change', mq);
    offs.push(() => phone.removeEventListener('change', mq));
    // relative times, expired posts, the slow-mode countdown and the throttled log
    timers.push(setInterval(() => { if (!document.hidden) flush(); }, 900));
    timers.push(setInterval(() => { if (!document.hidden) tidyPosts(); }, 15000));
    timers.push(setInterval(() => { if (seenDirty) { store.set(SEEN, seen); seenDirty = false; } }, 3000));
    Net.friends.list().then(d => { fr = d; paintFriends(); }).catch(() => {});
    Net.dm.threads().then(list => { unread = Object.fromEntries(list.map(t => [t.id, t.unread])); paintFriends(); }).catch(() => {});
    entered = Net.chat.enter().then(r => {
      mode = r.mode; allowed = r.allowed; summary = r.rooms || {};
      for (const [id, s] of Object.entries(summary)) if (seen[id] == null) { seen[id] = s.seq; seenDirty = true; }
      paintRooms();
      return r;
    });
    entered.catch(err => { if (el) q('[data-msgs]').innerHTML = `<li class="cm-sys">${e(err.message)}</li>`; });
    update(params || []);
  }

  function update(params) {
    const id = params[0] ? decodeURIComponent(params[0]) : '';
    want = id || null;
    entered.then(() => {
      if (!el) return;
      if (want && want[0] === '@') { openDm(want.slice(1)); return; }
      let target = want && room(want) ? want : null;
      if (target && !ok(target)) target = null;
      if (!target) {
        if (phone.matches && !want) {
          if (roomId) { Net.chat.leave(roomId); roomId = null; joinSeq++; }
          if (dmWith) closeDm();
          layout(); paintRooms(); return;
        }
        const lastId = store.get(LAST, Net.chat.rooms().first);
        target = ok(lastId) && room(lastId) ? lastId : (allowed ? allowed[0] : Net.chat.rooms().first);
        history.replaceState(null, '', '#/commons/' + target);
      }
      open(target);
    }).catch(() => {});
  }

  // a phone shows the room list or one room; a wider screen shows both
  function layout() {
    const box = q('.cm'); if (!box) return;
    box.dataset.view = phone.matches && !want ? 'list' : 'room';
  }

  // ---------- the room list ----------
  function paintRooms() {
    const nav = q('[data-rooms]'); if (!nav) return;
    const open = roomId;
    const areas = Net.chat.rooms().areas;
    nav.innerHTML = areas.map(a => {
      const main = a.rooms.filter(r => !r.more || moreOpen || r.id === open);
      const more = a.rooms.filter(r => r.more && !moreOpen && r.id !== open);
      return `<section class="cm-area"><h3 class="label">${e(a.name)}</h3><ul>
        ${main.map(r => roomItem(r, open)).join('')}
        ${more.length ? `<li><button class="cm-more" type="button" data-more aria-expanded="false">${more.length} more: ${e(more.map(r => r.name).join(', '))}</button></li>` : ''}
      </ul></section>`;
    }).join('');
    const mn = q('[data-modenote]');
    const note = allowed ? 'Your school limits chat to the Learn rooms.' : mode === 'quick' ? 'This account sends quick phrases only.' : mode === 'off' ? 'Chat is off for this account.' : '';
    mn.textContent = note; mn.hidden = !note;
    paintCounts();
  }
  function roomItem(r, open) {
    const icon = r.readOnly ? UI.icon('lock') : r.kind === 'posts' ? UI.icon('flag') : '<span class="cm-hash" aria-hidden="true">#</span>';
    if (!ok(r.id)) return `<li><span class="cm-room off" aria-disabled="true">${icon}<span class="cm-rn">${e(r.name)}</span></span></li>`;
    return `<li><a class="cm-room" href="#/commons/${r.id}" data-room="${r.id}"${r.id === open ? ' aria-current="page"' : ''}>${icon}<span class="cm-rn">${e(r.name)}</span>
      <span class="cm-cnt num" data-cnt title="Online"></span><span class="cm-un num" data-un hidden></span></a></li>`;
  }
  function paintCounts() {
    el && el.querySelectorAll('[data-room]').forEach(a => {
      const s = summary[a.dataset.room] || { members: 0, seq: 0 };
      a.querySelector('[data-cnt]').textContent = s.members || '';
      const un = a.dataset.room === roomId ? 0 : Math.max(0, s.seq - (seen[a.dataset.room] ?? s.seq));
      const b = a.querySelector('[data-un]');
      b.hidden = !un; b.textContent = un > 99 ? '99+' : un;
      a.setAttribute('aria-label', `${room(a.dataset.room).name}, ${s.members || 0} online${un ? `, ${un} unread` : ''}`);
    });
  }
  function markSeen(id, s) { if (s != null && seen[id] !== s) { seen[id] = s; seenDirty = true; } }

  // ---------- opening a room ----------
  function open(id) {
    const r = room(id);
    if (dmWith) closeDm();
    if (roomId && roomId !== id) Net.chat.leave(roomId);
    roomId = id; store.set(LAST, id);
    PlayerCard.close();
    reply = null; pending = []; unseenBelow = 0;
    layout();
    q('.cm-tt .pre').textContent = '#';
    q('[data-name]').textContent = r.name;
    q('[data-topic]').textContent = r.topic;
    q('#cm-in').placeholder = `Message #${r.name}`;
    q('#cm-in').lang = r.lang || 'en';
    q('[data-msgs]').innerHTML = '<li class="cm-sys">Loading</li>';
    paintRooms();
    paintFooter();
    const n = ++joinSeq;
    Net.chat.join(id).then(d => {
      if (!el || n !== joinSeq) return;
      msgs = d.history || []; members = d.members || []; offline = d.offline || []; posts = d.posts || [];
      if (msgs.length) markSeen(id, msgs[msgs.length - 1].seq);
      if (summary[id]) markSeen(id, summary[id].seq);
      paintCounts();
      if (isPosts()) paintPosts(); else paintMsgs();
      paintPeople();
    }).catch(err => { if (el && n === joinSeq) q('[data-msgs]').innerHTML = `<li class="cm-sys">${e(err.message)}</li>`; });
  }
  const isPosts = () => { const r = room(roomId); return r && r.kind === 'posts'; };

  function paintFooter() {
    if (dmWith) {
      const off = mode === 'off';
      q('[data-msgs]').hidden = off; q('[data-posts]').hidden = true; q('[data-off]').hidden = !off;
      q('[data-ro]').hidden = true; q('[data-qnote]').hidden = mode !== 'quick';
      q('[data-quick]').hidden = off; q('[data-form]').hidden = off || mode === 'quick';
      q('[data-pform]').hidden = true; q('[data-help]').hidden = off || mode === 'quick';
      q('[data-reply]').hidden = true; q('[data-err]').textContent = '';
      return;
    }
    const r = room(roomId);
    if (!r) return;
    const off = mode === 'off';
    const posts_ = r.kind === 'posts';
    q('[data-msgs]').hidden = off || posts_;
    q('[data-posts]').hidden = off || !posts_;
    q('[data-off]').hidden = !off;
    q('[data-ro]').hidden = !r.readOnly;
    q('[data-qnote]').hidden = mode !== 'quick' || r.readOnly || posts_;
    q('[data-quick]').hidden = off || r.readOnly || posts_;
    q('[data-form]').hidden = off || r.readOnly || posts_ || mode === 'quick';
    q('[data-pform]').hidden = off || !posts_;
    q('[data-help]').hidden = off || r.readOnly || posts_ || mode === 'quick';
    q('[data-reply]').hidden = !reply;
    q('[data-err]').textContent = '';
    if (posts_) paintPostForm();
  }

  // ---------- messages ----------
  const visible = m => !muted.has(m.from);
  function who(m) {
    if (m.staff) return { id: m.from, name: m.name, staff: true };
    if (m.from === 'me') return { id: 'me', name: m.name, you: true };
    if (dmWith && friend && m.from === friend.id) return friend;
    return members.find(p => p.id === m.from) || offline.find(p => p.id === m.from) || { id: m.from, name: m.name, bot: m.bot, country: m.country };
  }
  function when(at) {
    const d = new Date(at), n = new Date();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === n.toDateString() ? hm : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hm}`;
  }
  function head(m) {
    const p = who(m);
    const av = m.staff ? `<span class="mu-av art cm-av" aria-hidden="true">${MultiUI.LOGO}</span>`
      : `<button class="cm-av" type="button" data-who="${e(p.id)}" tabindex="-1" aria-hidden="true">${MultiUI.img(p, 80, 40)}</button>`;
    const name = m.staff ? `<b class="cm-name">${e(m.name)}</b><span class="mu-tag art">Staff</span>`
      : `<button class="cm-name" type="button" data-who="${e(p.id)}">${e(m.name)}</button>${MultiUI.tag(p)}`;
    const cc = p.country ? `<span class="cm-cc" title="${e(MultiUI.country(p.country))}">${e(p.country)}</span>` : '';
    return `${av}<div class="cm-gb"><p class="cm-gh">${name}${cc}<time datetime="${new Date(m.at).toISOString()}">${when(m.at)}</time></p>`;
  }
  function line(m) {
    const r = m.reply ? `<span class="cm-q">Reply to <b>${e(m.reply.name)}</b>: ${e(m.reply.text.slice(0, 80))}</span>` : '';
    const w = m.wpm ? `<span class="cm-wpm" title="Typed at ${m.wpm} wpm">${m.wpm} wpm</span>` : m.quick ? '<span class="cm-wpm qp">quick</span>' : '';
    const can = !dmWith && !m.staff && !(room(roomId) || {}).readOnly && mode === 'full';
    return `<div class="cm-line${m.from === 'me' ? ' mine' : ''}" data-mid="${e(m.id)}">${r}<p>${w}<span class="cm-tx">${e(m.text)}</span>${can ? `<button class="cm-rbtn" type="button" data-rep="${e(m.id)}" aria-label="Reply to ${e(m.name)}">Reply</button>` : ''}</p></div>`;
  }
  const joins = (a, b) => a && b && a.from === b.from && !b.reply && b.at - a.at < GROUP_MS;
  function paintMsgs() {
    const ol = q('[data-msgs]'); if (!ol) return;
    const list = msgs.filter(visible);
    let html = '', prev = null;
    for (const m of list) {
      if (!joins(prev, m)) html += `${prev ? '</div></li>' : ''}<li class="cm-g" data-from="${e(m.from)}">${head(m)}`;
      html += line(m);
      prev = m;
    }
    ol.innerHTML = list.length ? html + '</div></li>' : `<li class="cm-sys">${dmWith ? `No messages with ${e(friend ? friend.name : '')} yet.` : (room(roomId) || {}).readOnly ? 'No announcements yet.' : 'No messages yet. Say hi.'}</li>`;
    toBottom(true);
  }
  function append(list) {
    const ol = q('[data-msgs]'); if (!ol || !list.length) return;
    const near = atBottom();
    const sys = ol.querySelector('.cm-sys'); if (sys) sys.remove();
    for (const m of list) {
      const shown = msgs.filter(visible);
      const prev = shown[shown.indexOf(m) - 1];
      const g = ol.lastElementChild;
      if (g && joins(prev, m) && g.dataset.from === m.from) g.querySelector('.cm-gb').insertAdjacentHTML('beforeend', line(m));
      else ol.insertAdjacentHTML('beforeend', `<li class="cm-g" data-from="${e(m.from)}">${head(m)}${line(m)}</div></li>`);
    }
    while (ol.childElementCount > 80) ol.firstElementChild.remove();
    if (near || list.some(m => m.from === 'me')) toBottom(); else { unseenBelow += list.length; showJump(); }
  }
  // the log is a live region, so new lines go in at most about once a second
  function flush() {
    if (!pending.length) return;
    const list = pending; pending = [];
    append(list);
  }
  function onMsg(m) {
    if (!m) return;
    if (m.room !== roomId) { paintCounts(); return; }
    if (msgs.some(x => x.id === m.id)) return;
    msgs.push(m); if (msgs.length > 120) msgs.shift();
    markSeen(roomId, m.seq);
    if (!visible(m) || isPosts() || mode === 'off') return;
    pending.push(m);
    if (m.from === 'me') flush();
  }
  const atBottom = () => { const ol = q('[data-msgs]'); return !ol || ol.scrollHeight - ol.scrollTop - ol.clientHeight < 60; };
  function toBottom(now) {
    const ol = q('[data-msgs]'); if (!ol) return;
    ol.scrollTo({ top: ol.scrollHeight, behavior: now || reduce.matches ? 'auto' : 'smooth' });
    unseenBelow = 0; showJump();
  }
  function showJump() {
    const b = q('[data-jump]'); if (!b) return;
    b.hidden = !unseenBelow;
    b.textContent = unseenBelow ? `Jump to newest (${unseenBelow})` : 'Jump to newest';
  }

  // ---------- people ----------
  function onPeople(d) {
    if (!d || d.room !== roomId) return;
    if (d.leave && d.leave.length) members = members.filter(p => !d.leave.includes(p.id));
    for (const p of d.join || []) if (!members.some(x => x.id === p.id)) members.push(p);
    for (const p of d.offline || []) { offline = [p, ...offline.filter(x => x.id !== p.id)].slice(0, 15); }
    paintPeople();
  }
  function person(p, off) {
    const cc = p.country ? `<span class="cm-cc" title="${e(MultiUI.country(p.country))}">${e(p.country)}</span>` : '';
    return `<li${off ? ' class="off"' : ''}${muted.has(p.id) ? ' data-muted' : ''}><button type="button" class="cm-pp" data-who="${e(p.id)}">${MultiUI.img(p, 64, 32)}<span class="cm-pn">${e(p.name)}</span>${MultiUI.tag(p)}${cc}${muted.has(p.id) ? '<span class="mu-tag">Muted</span>' : ''}</button></li>`;
  }
  function paintPeople() {
    const box = q('[data-people]'); if (!box) return;
    const me = { id: 'me', name: WPM.profile().name, you: true };
    const on = [...members].sort((a, b) => a.name.localeCompare(b.name));
    const off = offline.filter(p => !members.some(x => x.id === p.id));
    q('[data-pcount]').textContent = on.length + 1;
    box.innerHTML = `<div class="ph">// IN THIS ROOM<button class="icon-btn cm-px" type="button" data-pclose aria-label="Close">x</button></div>
      <p class="label">Online ${on.length + 1}</p><ul class="cm-plist">${person(me)}${on.map(p => person(p)).join('')}</ul>
      ${off.length ? `<p class="label">Offline ${off.length}</p><ul class="cm-plist">${off.map(p => person(p, true)).join('')}</ul>` : ''}`;
  }

  // ---------- party finder ----------
  const RUNS = () => PartyRules.RUNS;
  function paintPostForm() {
    const f = q('[data-pform]');
    if (f.dataset.ready) return;
    f.dataset.ready = '1';
    const avg = WPM.stats().avgWpm || 0;
    const lo = avg ? Math.max(10, Math.floor((avg - 20) / 5) * 5) : 30, hi = avg ? Math.ceil((avg + 20) / 5) * 5 : 80;
    f.innerHTML = `
      <label><span class="label">Run</span><select class="field" name="run">${Object.values(RUNS()).map(r => `<option value="${r.id}">${e(r.name)}, ${r.fights.length} fights</option>`).join('')}</select></label>
      <label><span class="label">Difficulty</span><select class="field" name="difficulty"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select></label>
      <fieldset><legend class="label">Skill, wpm</legend><input class="field num" name="lo" type="number" min="10" max="250" step="5" value="${lo}" aria-label="Lowest wpm"><span>to</span><input class="field num" name="hi" type="number" min="10" max="300" step="5" value="${hi}" aria-label="Highest wpm"></fieldset>
      <button class="btn" type="submit">Post a party</button>`;
  }
  function onPost(p) {
    if (!p) return;
    const i = posts.findIndex(x => x.id === p.id);
    if (i >= 0) posts[i] = p; else posts.unshift(p);
    if (isPosts()) paintPosts();
  }
  function tidyPosts() {
    const n = posts.length;
    posts = posts.filter(p => p.expires > Date.now());
    if (isPosts() && (n !== posts.length || posts.length)) paintPosts();
  }
  function paintPosts() {
    const box = q('[data-posts]'); if (!box) return;
    const mine = Net.lobbies.current();
    const list = posts.filter(p => p.expires > Date.now() && !muted.has(p.by)).sort((a, b) => (b.mine - a.mine) || (b.at - a.at));
    if (!list.length) { box.innerHTML = '<p class="cm-sys">No open parties. Post one below.</p>'; return; }
    box.innerHTML = `<ul class="cm-plist2">${list.map(p => {
      const r = RUNS()[p.run], left = Math.max(1, Math.ceil((p.expires - Date.now()) / 60000)), ago = Math.max(0, Math.floor((Date.now() - p.at) / 60000));
      const full = p.count >= p.max, inIt = mine && mine.id === p.lobby;
      const who_ = p.mine ? { id: 'me', name: p.name, you: true } : { id: p.by, name: p.name, bot: p.bot, country: p.country };
      const act = inIt ? '<a class="btn sm" href="#/party/lobby">Open lobby</a>'
        : p.status === 'running' ? '<span class="dim">In a run</span>' : full ? '<span class="dim">Full</span>'
        : `<button class="btn sm" type="button" data-join="${e(p.lobby)}">Join</button>`;
      return `<li class="cm-post">
        <div class="cm-ph"><button class="cm-av" type="button" data-who="${e(who_.id)}" tabindex="-1" aria-hidden="true">${MultiUI.img(who_, 80, 40)}</button>
          <p><button class="cm-name" type="button" data-who="${e(who_.id)}">${e(p.name)}</button>${MultiUI.tag(who_)}${p.country ? `<span class="cm-cc" title="${e(MultiUI.country(p.country))}">${e(p.country)}</span>` : ''}<br><span class="dim">${ago ? `${ago} min ago` : 'Just now'}, closes in ${left} min</span></p></div>
        <dl class="cm-pd">
          <div><dt class="label">Run</dt><dd>${e(r ? r.name : p.run)}, ${e(p.difficulty)}</dd></div>
          <div><dt class="label">Skill</dt><dd class="num">${p.skill[0]} to ${p.skill[1]} wpm</dd></div>
          <div><dt class="label">Slots</dt><dd><span class="pa-seats" aria-label="${p.count} of ${p.max} players">${Array.from({ length: p.max }, (_, i) => `<i class="${i < p.count ? 'on' : ''}"></i>`).join('')}</span> <span class="num">${p.count}/${p.max}</span></dd></div>
        </dl>
        <div class="cm-pact">${act}</div>
      </li>`;
    }).join('')}</ul>`;
  }

  // ---------- sending ----------
  function wire() {
    const inp = q('#cm-in');
    // key events carry the time the key was pressed, so a busy page does not change the wpm
    inp.addEventListener('input', ev => {
      if (!inp.value) t0 = null; else if (t0 == null) t0 = ev.timeStamp;
      q('[data-left]').textContent = ChatRules.MAX - inp.value.length;
      if (q('[data-err]').textContent && !waitUntil) q('[data-err]').textContent = '';
    });
    inp.addEventListener('paste', ev => { ev.preventDefault(); err('Paste is off in chat.'); });
    inp.addEventListener('drop', ev => ev.preventDefault());
    inp.addEventListener('keydown', ev => {
      if (!inp.value && ev.key.length === 1) t0 = ev.timeStamp;
      if (ev.key === 'Enter') tEnd = ev.timeStamp;
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      if (reply) { setReply(null); return; }
      inp.blur(); q('[data-msgs]').focus({ preventScroll: true });
    });
    q('[data-form]').addEventListener('submit', ev => {
      ev.preventDefault();
      const text = inp.value;
      const end = tEnd != null && tEnd >= (t0 || 0) ? tEnd : performance.now();
      tEnd = null;
      const wpm = t0 != null ? ChatRules.wpm(ChatRules.tidy(text).length, end - t0) : null;
      (dmWith ? sendDm : send)({ text, wpm }).then(sent => { if (sent) { inp.value = ''; t0 = null; q('[data-left]').textContent = ChatRules.MAX; } });
    });
    q('[data-quick]').addEventListener('click', ev => {
      const b = ev.target.closest('[data-qp]'); if (!b) return;
      (dmWith ? sendDm : send)({ text: b.dataset.qp, quick: true });
    });
    q('[data-rcancel]').addEventListener('click', () => setReply(null));
    q('[data-jump]').addEventListener('click', () => toBottom());
    q('[data-msgs]').addEventListener('scroll', () => { if (unseenBelow && atBottom()) { unseenBelow = 0; showJump(); } });
    q('[data-pbtn]').addEventListener('click', () => togglePeople());
    el.addEventListener('click', ev => {
      const w = ev.target.closest('[data-who]');
      if (w) { card(w, w.dataset.who); return; }
      const r = ev.target.closest('[data-rep]');
      if (r) { setReply(msgs.find(m => m.id === r.dataset.rep)); return; }
      // on a phone a tap on a line shows its Reply button
      const ln = ev.target.closest('.cm-line');
      if (ln) { el.querySelectorAll('.cm-line.sel').forEach(x => { if (x !== ln) x.classList.remove('sel'); }); ln.classList.toggle('sel'); return; }
      if (ev.target.closest('[data-pclose]')) { togglePeople(false); return; }
      const fa = ev.target.closest('[data-facc], [data-fdec], [data-fcan]');
      if (fa) {
        fa.disabled = true;
        const id = fa.dataset.facc || fa.dataset.fdec || fa.dataset.fcan;
        (fa.dataset.facc ? Net.friends.accept(id) : fa.dataset.fdec ? Net.friends.decline(id) : Net.friends.cancel(id)).catch(x => { err(x.message); fa.disabled = false; });
        return;
      }
      if (ev.target.closest('[data-fall]')) { allFriends = !allFriends; paintFriends(); return; }
      const fp = ev.target.closest('[data-fprof]');
      if (fp && friend) { card(fp, friend.id); return; }
      if (ev.target.closest('[data-more]')) { moreOpen = true; paintRooms(); return; }
      const j = ev.target.closest('[data-join]');
      if (j) {
        j.disabled = true;
        Net.lobbies.join(j.dataset.join).then(() => { location.hash = '#/party/lobby'; })
          .catch(x => { err(x.message); j.disabled = false; paintPosts(); });
      }
    });
    q('[data-pform]').addEventListener('submit', ev => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      const lo = +f.get('lo'), hi = +f.get('hi');
      if (!(lo > 0) || !(hi >= lo)) { err('Set the skill range from the lower wpm to the higher one.'); return; }
      Net.chat.post({ run: f.get('run'), difficulty: f.get('difficulty'), skill: [lo, hi] })
        .then(() => { err(''); paintPosts(); })
        .catch(x => err(x.message));
    });
  }

  function err(t) { const p = q('[data-err]'); if (p) p.textContent = t || ''; }
  function setReply(m) {
    reply = m || null;
    const box = q('[data-reply]');
    box.hidden = !reply;
    if (reply) { q('[data-rtext]').innerHTML = `Reply to <b>${e(reply.name)}</b>: ${e(reply.text.slice(0, 60))}`; q('#cm-in').focus(); }
  }

  function send({ text, wpm, quick }) {
    const r = room(roomId);
    if (!r || r.readOnly || r.kind === 'posts') return Promise.resolve(false);
    if (Date.now() < waitUntil) return Promise.resolve(false);
    const c = ChatRules.check(text, { recent, lastAt, slowMs: r.slowMs || Net.chat.rooms().slowMs });
    if (!c.ok) { err(c.why); if (c.code === 'slow') countdown(c.wait); return Promise.resolve(false); }
    err('');
    return Net.chat.send({ room: roomId, text: c.text, wpm: quick ? null : wpm, quick: !!quick, reply: reply ? reply.id : null }).then(m => {
      lastAt = Date.now();
      recent.push({ text: c.text, at: lastAt }); if (recent.length > 10) recent.shift();
      setReply(null);
      countdown(r.slowMs || Net.chat.rooms().slowMs);
      WPM.track('chat_message', { room: roomId, wpm: m.wpm || null, quick: !!quick, greet: GREET.test(c.text) });
      return true;
    }).catch(x => { err(x.message); if (x.code === 'slow') countdown(x.wait || 1000); return false; });
  }
  // slow mode: the wait shows on the send button
  function countdown(ms) {
    waitUntil = Date.now() + ms;
    const b = q('[data-send]'), qp = el.querySelectorAll('[data-qp]');
    const tick = () => {
      if (!el) return;
      const left = waitUntil - Date.now();
      if (left <= 0) { waitUntil = 0; b.disabled = false; b.textContent = 'Send'; qp.forEach(x => { x.disabled = false; }); if (/^One message every/.test(q('[data-err]').textContent)) err(''); return; }
      b.disabled = true; b.textContent = `Wait ${(left / 1000).toFixed(1)}s`; qp.forEach(x => { x.disabled = true; });
      setTimeout(tick, 100);
    };
    tick();
  }

  // ---------- player card and the people drawer ----------
  function card(anchor, id) {
    if (dmWith && friend && id === friend.id) {
      PlayerCard.open(anchor, friend, { room: 'dm', dm: true, lines: msgs.filter(m => m.from === id).slice(-5).map(m => ({ at: m.at, room: 'dm', text: m.text })) });
      return;
    }
    const p = id === 'me' ? { id: 'me', name: WPM.profile().name, you: true, level: WPM.levelInfo().level }
      : members.find(x => x.id === id) || offline.find(x => x.id === id) || (() => { const m = msgs.find(x => x.from === id); return m ? { id, name: m.name, bot: m.bot, country: m.country } : (posts.find(x => x.by === id) ? { id, name: posts.find(x => x.by === id).name, bot: true } : null); })();
    if (!p || p.staff) return;
    PlayerCard.open(anchor, p, {
      room: roomId,
      lines: msgs.filter(m => m.from === id).slice(-5).map(m => ({ at: m.at, room: m.room, text: m.text })),
      onMute(pid, on) {
        if (on) muted.add(pid); else muted.delete(pid);
        if (isPosts()) paintPosts(); else paintMsgs();
        paintPeople();
      },
    });
  }
  function togglePeople(force) {
    const box = q('.cm'), b = q('[data-pbtn]');
    const on = force != null ? force : !box.classList.contains('people-open');
    box.classList.toggle('people-open', on);
    b.setAttribute('aria-expanded', on);
    if (on) { const f = q('[data-people] .cm-pp'); if (f) f.focus(); } else if (force === false) b.focus();
  }

  // ---------- friends ----------
  function paintFriends() {
    const box = q('[data-friends]'); if (!box) return;
    const list = fr.friends || [];
    const on = list.filter(f => f.online).length;
    const shown = allFriends ? list : list.slice(0, 8);
    const reqs = (fr.incoming || []).map(r => `<li class="cm-req"><span class="cm-rqn">${MultiUI.img(r, 48, 24)}<b>${e(r.name)}</b></span>
      <span class="cm-rqa"><button class="btn sm" type="button" data-facc="${e(r.id)}">Accept</button><button class="btn out sm" type="button" data-fdec="${e(r.id)}">Decline</button></span></li>`).join('');
    const sent = (fr.outgoing || []).map(r => `<li class="cm-req out"><span class="cm-rqn">${MultiUI.img(r, 48, 24)}<b>${e(r.name)}</b><span class="dim">Sent</span></span>
      <button class="btn out sm" type="button" data-fcan="${e(r.id)}">Cancel</button></li>`).join('');
    box.innerHTML = `<h3 class="label">Friends <span class="dim">${list.length ? `${on} online` : ''}</span></h3>
      ${reqs ? `<p class="cm-frh">Requests</p><ul class="cm-reqs">${reqs}</ul>` : ''}
      ${list.length ? `<ul class="cm-flist">${shown.map(f => `<li><a class="cm-room cm-friend${f.online ? ' on' : ''}" href="#/commons/@${encodeURIComponent(f.id)}" data-fid="${e(f.id)}"${f.id === dmWith ? ' aria-current="page"' : ''}>
          <span class="cm-dot" aria-hidden="true"></span><span class="cm-rn">${e(f.name)}</span>
          <span class="cm-un num"${unread[f.id] ? '' : ' hidden'}>${unread[f.id] || ''}</span><span class="sr-only">${f.online ? 'online' : 'offline'}</span></a></li>`).join('')}</ul>
          ${list.length > 8 ? `<button class="cm-more" type="button" data-fall>${allFriends ? 'Show fewer' : `All ${list.length} friends`}</button>` : ''}`
        : `<p class="cm-frnone">Open a player's card and pick Add friend. Friends can message each other one on one.</p>`}
      ${sent ? `<ul class="cm-reqs">${sent}</ul>` : ''}`;
  }

  // ---------- private chat with a friend ----------
  function openDm(id) {
    if (roomId) { Net.chat.leave(roomId); roomId = null; joinSeq++; }
    PlayerCard.close();
    reply = null; pending = []; unseenBelow = 0;
    dmWith = id; friend = null;
    want = '@' + id;
    layout();
    q('[data-name]').textContent = '';
    q('[data-topic]').textContent = '';
    q('[data-msgs]').innerHTML = '<li class="cm-sys">Loading</li>';
    q('.cm').classList.add('dm');
    paintRooms(); paintFriends();
    const n = ++joinSeq;
    Net.dm.open(id).then(d => {
      if (!el || n !== joinSeq) return;
      friend = d.with; msgs = d.history || [];
      q('.cm-tt .pre').textContent = '@';
      q('[data-name]').innerHTML = `<button class="cm-dmname" type="button" data-fprof>${e(friend.name)}</button>`;
      q('[data-topic]').textContent = `${friend.online ? 'Online' : 'Offline'}. Only the two of you see this chat unless one of you reports it. Links, contact details and personal questions are blocked here too.`;
      q('#cm-in').placeholder = `Message ${friend.name}`;
      q('#cm-in').lang = 'en';
      paintFooter(); paintMsgs();
    }).catch(x => {
      if (!el || n !== joinSeq) return;
      q('[data-msgs]').innerHTML = `<li class="cm-sys">${e(x.message)} <a class="green" href="#/commons">Back to the rooms</a></li>`;
      q('[data-form]').hidden = true; q('[data-quick]').hidden = true;
    });
  }
  function closeDm() {
    Net.dm.close();
    dmWith = null; friend = null;
    q('.cm').classList.remove('dm');
  }
  function onDm(m) {
    if (!m || !el) return;
    if (m.with !== dmWith) return;
    if (msgs.some(x => x.id === m.id)) return;
    msgs.push(m); if (msgs.length > 120) msgs.shift();
    if (m.from !== 'me') Net.dm.read(dmWith);
    pending.push(m);
    if (m.from === 'me') flush();
  }
  function sendDm({ text, wpm, quick }) {
    if (!dmWith || mode === 'off' || Date.now() < waitUntil) return Promise.resolve(false);
    const c = ChatRules.check(text, { recent, lastAt });
    if (!c.ok) { err(c.why); if (c.code === 'slow') countdown(c.wait); return Promise.resolve(false); }
    err('');
    return Net.dm.send({ to: dmWith, text: c.text, wpm: quick ? null : wpm, quick: !!quick }).then(m => {
      lastAt = Date.now();
      recent.push({ text: c.text, at: lastAt }); if (recent.length > 10) recent.shift();
      countdown(ChatRules.SLOW_MS);
      WPM.track('chat_message', { room: 'dm', wpm: m.wpm || null, quick: !!quick, greet: GREET.test(c.text) });
      return true;
    }).catch(x => { err(x.message); if (x.code === 'slow') countdown(x.wait || 1000); return false; });
  }

  // ---------- keys: Enter starts a message anywhere in the room ----------
  function onKey(ev) {
    if (!el || ev.defaultPrevented) return;
    if (ev.key === 'Escape' && q('.cm').classList.contains('people-open') && !PlayerCard.isOpen()) { togglePeople(false); return; }
    if (ev.key !== 'Enter' || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey || PlayerCard.isOpen()) return;
    const t = ev.target;
    if (t.closest && t.closest('input, textarea, select, button, a, [contenteditable], summary')) return;
    const inp = q('#cm-in');
    if (!inp || inp.closest('[hidden]') || q('.cm').dataset.view === 'list') return;
    ev.preventDefault();
    inp.focus();
  }

  function unmount() {
    PlayerCard.close();
    offs.forEach(f => f()); offs = [];
    timers.forEach(clearInterval); timers = [];
    if (seenDirty) store.set(SEEN, seen);
    if (roomId) Net.chat.leave(roomId);
    if (dmWith) Net.dm.close();
    Net.chat.exit();
    dmWith = null; friend = null;
    el = null; roomId = null; want = null; msgs = []; members = []; offline = []; posts = []; pending = []; waitUntil = 0;
  }

  return { title: CommonsPage.NAME, mount, update, unmount };
})());
