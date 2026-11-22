// Friends and private messages in the sim backend. The rooms stay public; the only private
// chat is one on one between two players who are both on each other's friends list.
// Every private line goes through the same ChatRules check as the rooms (links, contact
// details, personal questions, blocked words, slow mode, repeats), here and on the server.
//
// NetFriendsSim.create(host, sim) -> { friends, dm } (see js/net/net.js)
//   friends.list() -> { friends: [Friend], incoming: [Req], outgoing: [Req], blocked: [Player], limits }
//   friends.request(id, name) / accept(id) / decline(id) / cancel(id) / remove(id) / block(id, name) / unblock(id)
//   dm.threads() -> [{ id, name, last, unread }]     dm.open(id) -> { with: Friend, history: [Dm] }
//   dm.close()   dm.send({ to, text, wpm, quick }) -> Dm   dm.read(id)   dm.report({ player, name, reason, lines })
// Events through host.emit: 'friends' (the whole list after any change), 'friend.request' (Req),
// 'friend.accepted' ({ id, name }), 'dm.msg' (Dm), 'dm.threads' ([thread]).
//
// Friend  { id, name, bot, country, level, wpm, online, room, since }
// Req     { id, name, bot, country, level, at }
// Dm      { id, with, from: 'me' | id, name, text, wpm, quick, at }
(function (root) {
  const { pick } = root.NetCore;
  const STORE = 'wpm-friends';
  const LOG = 'wpm-dm';
  const LIMITS = { friends: 200, requestsPerDay: 20, history: 50, keep: 100 };

  function create(host, sim) {
    const T = host.test;
    const me = () => (host.me && host.me()) || { id: 'me', name: 'You' };
    const load = () => ({ friends: [], incoming: [], outgoing: [], blocked: [], sentToday: { on: '', n: 0 }, seeded: false, ...host.store.get(STORE, {}) });
    let S = load();
    let logs = host.store.get(LOG, {});
    let openWith = null, lastSent = null;
    const recent = [];
    const save = () => host.store.set(STORE, S);
    const saveLogs = () => host.store.set(LOG, logs);
    const today = () => new Date().toISOString().slice(0, 10);
    const delay = (a, b) => (T.answer != null ? T.answer : a + Math.random() * (b - a));
    const nid = () => 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const refuse = (message, code, extra = {}) => Promise.reject(Object.assign(new Error(message), { code, ...extra }));

    function person(id, name) {
      const p = sim.simProfile(id);
      return { id, name: name || id, bot: true, country: p.country, level: p.level, wpm: p.typing.wpm };
    }
    // bots are online about two thirds of the time, in a busy room
    function presence(f) {
      const h = [...f.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + Math.floor(Date.now() / 600000);
      const online = h % 3 !== 0;
      return { ...f, online, room: online ? ['lobby', 'boss', 'duels', 'rush', 'academy'][h % 5] : null };
    }
    const snapshot = () => ({
      friends: S.friends.map(presence).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name)),
      incoming: S.incoming.slice(), outgoing: S.outgoing.slice(), blocked: S.blocked.slice(), limits: { ...LIMITS },
    });
    const changed = () => { save(); host.emit('friends', snapshot()); };
    const isFriend = id => S.friends.some(f => f.id === id);
    const isBlocked = id => S.blocked.some(b => b.id === id);
    const drop = (list, id) => list.filter(x => x.id !== id);

    // the first visit gets one request from a simulated player, so the list isn't empty
    function seed() {
      if (S.seeded || T.friendSeed === false) return;
      S.seeded = true; save();
      setTimeout(() => {
        const name = sim.handle(Math.random);
        if (isFriend(name) || isBlocked(name)) return;
        const req = { ...person(name), at: Date.now() };
        S.incoming = [req, ...drop(S.incoming, name)];
        changed();
        host.emit('friend.request', { ...req });
      }, T.friendSeedMs != null ? T.friendSeedMs : 20000);
    }

    const friends = {
      list() { seed(); return Promise.resolve(snapshot()); },
      request(id, name) {
        if (!id || id === 'me') return refuse("You can't add yourself.", 'self');
        if (isBlocked(id)) return refuse('Unblock this player first.', 'blocked');
        if (isFriend(id)) return refuse('Already on your friends list.', 'already');
        if (S.outgoing.some(x => x.id === id)) return refuse('Request already sent.', 'sent');
        if (S.friends.length >= LIMITS.friends) return refuse(`Your friends list is full (${LIMITS.friends}).`, 'full');
        // a request from them is waiting: sending one back accepts it
        if (S.incoming.some(x => x.id === id)) return friends.accept(id);
        if (S.sentToday.on !== today()) S.sentToday = { on: today(), n: 0 };
        if (S.sentToday.n >= LIMITS.requestsPerDay) return refuse(`${LIMITS.requestsPerDay} friend requests a day at most.`, 'limit');
        S.sentToday.n++;
        const req = { ...person(id, name), at: Date.now() };
        S.outgoing = [req, ...S.outgoing];
        changed();
        setTimeout(() => {
          if (!S.outgoing.some(x => x.id === id)) return;
          const yes = T.friendAccept != null ? T.friendAccept : Math.random() < 0.85;
          S.outgoing = drop(S.outgoing, id);
          if (yes) {
            S.friends = [{ ...req, since: Date.now() }, ...drop(S.friends, id)];
            host.emit('friend.accepted', { id, name: req.name });
          }
          changed();
        }, delay(1500, 4000));
        return Promise.resolve({ ...req });
      },
      accept(id) {
        const req = S.incoming.find(x => x.id === id);
        if (!req) return refuse('That request is gone.', 'gone');
        if (S.friends.length >= LIMITS.friends) return refuse(`Your friends list is full (${LIMITS.friends}).`, 'full');
        S.incoming = drop(S.incoming, id);
        S.friends = [{ ...req, since: Date.now() }, ...drop(S.friends, id)];
        changed();
        return Promise.resolve(presence(S.friends[0]));
      },
      decline(id) { S.incoming = drop(S.incoming, id); changed(); return Promise.resolve({}); },
      cancel(id) { S.outgoing = drop(S.outgoing, id); changed(); return Promise.resolve({}); },
      // removing a friend ends the private chat; the history goes with it
      remove(id) {
        S.friends = drop(S.friends, id);
        delete logs[id]; saveLogs();
        if (openWith === id) openWith = null;
        changed(); host.emit('dm.threads', threads());
        return Promise.resolve({});
      },
      block(id, name) {
        const p = S.friends.find(x => x.id === id) || S.incoming.find(x => x.id === id) || person(id, name);
        S.friends = drop(S.friends, id); S.incoming = drop(S.incoming, id); S.outgoing = drop(S.outgoing, id);
        S.blocked = [{ id, name: p.name }, ...drop(S.blocked, id)];
        delete logs[id]; saveLogs();
        changed(); host.emit('dm.threads', threads());
        return Promise.resolve({});
      },
      unblock(id) { S.blocked = drop(S.blocked, id); changed(); return Promise.resolve({}); },
    };

    // ---------- private messages ----------
    function threads() {
      return S.friends.map(f => {
        const log = (logs[f.id] || {}).list || [];
        const last = log[log.length - 1] || null;
        return { id: f.id, name: f.name, last, unread: (logs[f.id] || {}).unread || 0 };
      }).filter(t => t.last).sort((a, b) => b.last.at - a.last.at);
    }
    function push(id, m) {
      const t = (logs[id] ||= { list: [], unread: 0 });
      t.list.push(m); while (t.list.length > LIMITS.keep) t.list.shift();
      if (m.from !== 'me' && openWith !== id) t.unread++;
      saveLogs();
      host.emit('dm.msg', { ...m });
      host.emit('dm.threads', threads());
    }
    // a simulated friend answers now and then, with the same lines the rooms use
    function answer(f, text) {
      const L = root.CHAT_LINES && root.CHAT_LINES.replies && root.CHAT_LINES.replies.en;
      if (!L || Math.random() > (T.dmReply != null ? T.dmReply : 0.7)) return;
      const kind = /\?\s*$/.test(text) ? 'question' : /\b(hi|hey|hello|yo|sup)\b/i.test(text) ? 'greet' : /\bgg\b/i.test(text) ? 'gg' : /party|team|join/i.test(text) ? 'party' : 'generic';
      const line = pick(Math.random, L[kind] || L.generic).replace(/\{me\}/g, me().name);
      if (!root.ChatRules.check(line).ok) return;
      setTimeout(() => {
        if (!isFriend(f.id)) return;
        push(f.id, { id: nid(), with: f.id, from: f.id, name: f.name, text: line, wpm: f.wpm || null, quick: false, at: Date.now() });
      }, delay(1800, 5000));
    }

    const dm = {
      threads: () => Promise.resolve(threads()),
      open(id) {
        const f = S.friends.find(x => x.id === id);
        if (!f) return refuse('You can only message players on your friends list.', 'notFriend');
        openWith = id;
        const t = logs[id]; if (t) { t.unread = 0; saveLogs(); host.emit('dm.threads', threads()); }
        return Promise.resolve({ with: presence(f), history: ((t && t.list) || []).slice(-LIMITS.history) });
      },
      close() { openWith = null; return Promise.resolve({}); },
      read(id) { const t = logs[id]; if (t && t.unread) { t.unread = 0; saveLogs(); host.emit('dm.threads', threads()); } return Promise.resolve({}); },
      send({ to, text, wpm, quick } = {}) {
        const f = S.friends.find(x => x.id === to);
        if (!f) return refuse('You can only message players on your friends list.', 'notFriend');
        const c = root.ChatRules.check(text, { recent, lastAt: lastSent });
        if (!c.ok) return refuse(c.why, c.code, c.wait ? { wait: c.wait } : {});
        if (quick && !root.ChatRules.QUICK.includes(c.text)) return refuse('Quick phrases only.', 'quick');
        lastSent = Date.now();
        recent.push({ text: c.text, at: lastSent }); if (recent.length > 10) recent.shift();
        const m = { id: nid(), with: to, from: 'me', name: me().name, text: c.text, wpm: quick ? null : wpm || null, quick: !!quick, at: lastSent };
        push(to, m);
        answer(f, c.text);
        return Promise.resolve({ ...m });
      },
      // a report keeps the last lines of the conversation for the moderators, the only time
      // they see a private chat
      report(r = {}) {
        const list = host.store.get('wpm-chat-reports', []);
        const lines = ((logs[r.player] || {}).list || []).slice(-20).map(m => ({ at: m.at, from: m.from, text: m.text }));
        const item = { id: nid(), at: new Date().toISOString(), player: r.player, name: r.name, room: 'dm', reason: r.reason, lines };
        list.push(item); while (list.length > 50) list.shift();
        host.store.set('wpm-chat-reports', list);
        return Promise.resolve({ id: item.id, status: 'saved' });
      },
    };

    return { friends, dm };
  }

  root.NetFriendsSim = { create };
})(globalThis);
