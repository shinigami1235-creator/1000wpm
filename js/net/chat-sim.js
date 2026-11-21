// The chat rooms at #/commons in the sim backend. 60 to 100 bots spread over the rooms in
// js/net/chat-rooms.js (Lobby and Syntax Error busiest), come and go, move between rooms,
// talk in each room's topic and language from js/net/chat-lines.js, and now and then answer
// the player. The Party finder holds structured posts tied to the sim's party lobbies.
// The rules for a line are the ones the server will run, in js/net/chat-rules.js.
//
// NetChatSim.create(host, sim) -> the `chat` part of the backend object (see js/net/net.js):
//   enter() -> { mode, allowed, rooms }     exit()
//   join(room) -> { room, members, offline, history, posts }     leave(room)
//   send({ room, text, wpm, quick, reply }) -> ChatMessage     post({ run, difficulty, skill }) -> Post
//   people(room), mute(id, on), report(r)
// Events through host.emit: 'chat.msg', 'chat.rooms', 'chat.people', 'chat.post', 'chat.unpost'.
(function (root) {
  const { rng, pick, between } = root.NetCore;
  const ABOUT = [
    ['greet', /\b(hi|hiya|hello|hey|yo|sup|hola|oi|halo|hallo|kumusta|morning|evening)\b|สวัสดี|หวัดดี|こんにちは|こんばんは|안녕|chào/i],
    ['gg', /\bgg\b|good game|well played|\bwp\b/i],
    ['party', /party|team|squad|invite|guard|support|striker/i],
    ['boss', /boss|syntax error/i],
    ['duel', /duel|1v1|rematch|pvp|challenge/i],
    ['question', /\?\s*$/],
  ];
  const STAFF = { id: 'site', name: 'Site updates', staff: true };
  const STORE_REPORTS = 'wpm-chat-reports';

  function create(host, sim) {
    const T = host.test;
    const now = () => host.now();
    const C = () => root.CHAT_ROOMS;
    const L = () => root.CHAT_LINES;
    const ROOMS = C().areas.flatMap(a => a.rooms.map(r => ({ ...r, area: a.id })));
    const byId = Object.fromEntries(ROOMS.map(r => [r.id, r]));
    const chatty = r => !r.readOnly && r.kind !== 'posts';

    let on = false, timer = 0, last = 0, uid = 0, seeded = false, opened = null, lastSend = null, sumT = 0, postT = 0, newPostAt = 0;
    const recent = [];
    const people = new Map();                       // online bots
    const members = Object.fromEntries(ROOMS.map(r => [r.id, new Set()]));
    const offline = Object.fromEntries(ROOMS.map(r => [r.id, []]));
    const logs = Object.fromEntries(ROOMS.map(r => [r.id, []]));
    const seq = Object.fromEntries(ROOMS.map(r => [r.id, 0]));
    const posts = new Map();
    const later = [];
    const r0 = rng('chat:' + Math.floor(Date.now() / 3.6e6));

    const nid = () => 'c' + (++uid).toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const me = () => (host.me && host.me()) || { id: 'me', name: 'You' };
    const pub = p => ({ id: p.id, name: p.name, bot: !!p.bot, country: p.country, level: p.level, rating: p.rating, wpm: p.wpm, room: p.room });
    const lo = () => Math.max(10, Math.round((T.chatBots || 80) * 0.85)), hi = () => Math.min(100, Math.round((T.chatBots || 80) * 1.15));
    const langOf = r => ({ ja: 'ja', pt: 'pt', es: 'es', th: 'th', tl: 'tl', id: 'id', vi: 'vi', ko: 'ko', de: 'de' })[r.lang] || 'en';

    function weighted(r) {
      const list = ROOMS.filter(x => x.busy);
      let x = r() * list.reduce((a, b) => a + b.busy, 0);
      for (const room of list) { x -= room.busy; if (x <= 0) return room; }
      return list[0];
    }
    function newBot(r, room) {
      for (let tries = 0; tries < 20; tries++) {
        const name = sim.handle(r);
        if (people.has(name) || name === me().name) continue;
        const country = room.countries ? pick(r, room.countries) : null;
        const p = sim.simProfile(name, country ? { country } : {});
        return { id: name, name, bot: true, country: p.country, level: p.level, rating: p.duel.rating, wpm: p.typing.wpm, room: room.id };
      }
      return null;
    }
    function arrive(b, quiet) {
      people.set(b.id, b);
      members[b.room].add(b.id);
      const off = offline[b.room]; const i = off.findIndex(x => x.id === b.id); if (i >= 0) off.splice(i, 1);
      if (!quiet) host.emit('chat.people', { room: b.room, join: [pub(b)], leave: [] });
    }
    function depart(b, toRoom) {
      members[b.room].delete(b.id);
      host.emit('chat.people', { room: b.room, join: [], leave: [b.id] });
      if (toRoom) { b.room = toRoom; arrive(b); return; }
      // a player who leaves stays listed in the room as offline
      people.delete(b.id);
      const off = offline[b.room]; off.unshift(pub(b)); if (off.length > 15) off.pop();
      host.emit('chat.people', { room: b.room, join: [], leave: [], offline: [pub(b)] });
    }
    function populate() {
      const n = T.chatBots || 60 + Math.floor(r0() * 41);
      // each room gets its share, at least one person, and the rest go by share
      const list = ROOMS.filter(x => x.busy), total = list.reduce((a, r) => a + r.busy, 0);
      for (const room of list) for (let i = 0; i < Math.max(1, Math.floor(n * room.busy / total)); i++) { const b = newBot(r0, room); if (b) arrive(b, true); }
      while (people.size < n) { const room = weighted(r0); const b = newBot(r0, room); if (b) arrive(b, true); }
    }

    // ---------- lines ----------
    const inRoom = (room, not) => [...members[room]].map(id => people.get(id)).filter(p => p && p !== not);
    function fill(text, o = {}) {
      return text.replace(/\{name\}/g, () => { const x = inRoom(o.room, o.speaker); return x.length ? pick(Math.random, x).name : 'everyone'; })
        .replace(/\{me\}/g, o.me || me().name).replace(/\{wpm\}/g, o.wpm || '');
    }
    // a line nobody in the room said in the last dozen messages
    function fresh(lines, room, r = Math.random) {
      const said = new Set(logs[room].slice(-12).map(m => m.text));
      for (let i = 0; i < 8; i++) { const l = pick(r, lines); if (!said.has(l)) return l; }
      return pick(r, lines);
    }
    function lineWpm(p, text) {
      const w = p.wpm * between(Math.random, 0.5, 0.95);
      return Math.max(12, Math.round(text.length < 6 ? w * 0.7 : w));
    }
    function push(m) {
      m.seq = ++seq[m.room];
      const log = logs[m.room]; log.push(m); if (log.length > 120) log.shift();
      return m;
    }
    function post(p, room, text, extra = {}) {
      if (!on) return null;
      const m = push({ id: nid(), room, from: p.id, name: p.name, bot: !!p.bot, country: p.country || null, text, wpm: p.bot ? lineWpm(p, text) : p.wpm, quick: false, reply: null, at: Date.now(), ...extra });
      host.emit('chat.msg', { ...m });
      return m;
    }
    function soon(ms, fn) { later.push({ at: now() + (T.fast ? Math.min(ms, 300) : ms), fn }); }
    function botSays(room) {
      const pool = inRoom(room.id);
      const lines = L().rooms[room.lines || room.id];
      if (!pool.length || !lines) return;
      const p = pick(Math.random, pool);
      const m = post(p, room.id, fill(fresh(lines, room.id), { room: room.id, speaker: p }));
      if (!m || Math.random() > 0.28) return;
      // someone answers
      const q = pick(Math.random, inRoom(room.id, p)); if (!q) return;
      const R = L().replies[langOf(room)];
      const greet = ABOUT[0][1].test(m.text);
      soon(between(Math.random, 1500, 4000), () => people.has(q.id) && q.room === room.id &&
        post(q, room.id, fill(pick(Math.random, greet ? R.greet : R.generic), { me: p.name }), Math.random() < 0.4 ? { reply: { id: m.id, name: m.name, text: m.text } } : {}));
    }

    // the player's line gets an answer now and then
    function react(m) {
      const room = byId[m.room];
      const lang = langOf(room);
      const R = L().replies[lang], EN = L().replies.en;
      const about = ABOUT.filter(([, re]) => re.test(m.text)).map(([k]) => k);
      const pool = inRoom(room.id);
      if (!pool.length) return;
      let replies = [];
      if (about.includes('greet')) replies = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => 'greet');
      else if (about.length && Math.random() < 0.7) replies = [about[0]];
      else if (Math.random() < 0.25) replies = ['generic'];
      if (m.wpm >= 100 && lang === 'en' && Math.random() < 0.5) replies.push('fast');
      if (T.chatReply === false) replies = [];
      if (T.chatReply === true && !replies.length) replies = ['generic'];
      const used = new Set();
      replies.forEach((k, i) => {
        const p = pick(Math.random, pool.filter(x => !used.has(x)));
        if (!p) return;
        used.add(p);
        const list = R[k] || (lang === 'en' ? EN[k] : null) || R.generic;
        const text = fill(pick(Math.random, list), { wpm: m.wpm, room: room.id, speaker: p });
        const reply = i === 0 && Math.random() < 0.5 ? { reply: { id: m.id, name: m.name, text: m.text } } : {};
        soon(between(Math.random, 900, 2600) + i * between(Math.random, 600, 1500), () => people.has(p.id) && p.room === room.id && post(p, room.id, text, reply));
      });
    }

    // ---------- party finder ----------
    function skillOf(l) {
      const w = sim.simProfile(l.host).typing.wpm;
      return [Math.max(20, Math.floor((w - 15) / 5) * 5), Math.ceil((w + 20) / 5) * 5];
    }
    function postOf(l, at, mine, skill) {
      const prof = mine ? null : sim.simProfile(l.host);
      return { id: 'P' + l.id, lobby: l.id, room: 'party', by: mine ? 'me' : l.host, name: mine ? me().name : l.hostName, bot: !mine, country: prof ? prof.country : null,
        run: l.run, difficulty: l.difficulty, skill: skill || skillOf(l), count: l.count, max: l.max, status: l.status, at, expires: at + C().postMinutes * 60000, mine: !!mine };
    }
    function syncPosts(first) {
      const list = sim.lobbyList();
      const mine = sim.myLobby();
      const t = Date.now();
      for (const l of list) {
        if (!posts.has('P' + l.id) && l.status === 'open' && l.count < l.max) {
          const p = postOf(l, first ? t - Math.floor(Math.random() * 12 * 60000) : t);
          posts.set(p.id, p);
          if (!first) host.emit('chat.post', { ...p });
        }
      }
      for (const p of [...posts.values()]) {
        const l = p.mine ? (mine && mine.id === p.lobby ? mine : null) : list.find(x => x.id === p.lobby);
        if (!l || t >= p.expires) { posts.delete(p.id); host.emit('chat.unpost', { id: p.id }); continue; }
        if (l.count !== p.count || l.status !== p.status) { p.count = l.count; p.status = l.status; host.emit('chat.post', { ...p }); }
      }
    }

    // ---------- the loop ----------
    function summary() { return Object.fromEntries(ROOMS.map(r => [r.id, { members: members[r.id].size + (opened === r.id ? 1 : 0), seq: seq[r.id] }])); }
    function tick() {
      const t = now();
      if (host.hidden && host.hidden()) { last = t; return; }     // paused while the tab is hidden
      const dt = Math.min(1000, t - (last || t));
      last = t;
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= t) { const f = later.splice(i, 1)[0].fn; try { f(); } catch (e) { console.error(e); } }
      // people come, go and change rooms
      if (Math.random() < dt / (T.chatChurnMs || 3000)) {
        const n = people.size, roll = Math.random();
        const any = () => pick(Math.random, [...people.values()]);
        if (n >= hi() || (n > lo() && roll < 0.35)) depart(any());
        else if (roll < 0.7 || n <= lo()) { const room = weighted(Math.random); const b = newBot(Math.random, room); if (b) arrive(b); }
        else {
          const b = any();
          if (b && !byId[b.room].countries) { const to = weighted(Math.random); if (!to.countries && to.id !== b.room) depart(b, to.id); }
        }
      }
      // about one line a second over all rooms with 80 people
      const rate = (T.chatRate || 1) * dt / 1000;
      for (const room of ROOMS) if (chatty(room) && Math.random() < members[room.id].size * 0.016 * rate) botSays(room);
      if (t - sumT > 2000) { sumT = t; host.emit('chat.rooms', { rooms: summary() }); }
      if (t - postT > 5000) {
        postT = t; syncPosts(false);
        if (Date.now() > newPostAt) {
          newPostAt = Date.now() + (T.fast ? 2000 : 30000 + Math.random() * 40000);
          if ([...posts.values()].filter(p => !p.mine).length < 9) { sim.addLobby(); syncPosts(false); }
        }
      }
    }

    // each room has been talking before the player arrives
    function history() {
      const t0 = Date.now();
      for (const room of ROOMS) {
        if (room.readOnly) {
          for (const [at, text] of L().news) push({ id: nid(), room: room.id, from: STAFF.id, name: STAFF.name, bot: false, staff: true, country: null, text, wpm: null, quick: false, reply: null, at: Date.parse(at) });
          continue;
        }
        if (!chatty(room)) continue;
        // a few who talked earlier and have since left stay listed as offline
        for (let i = 0; i < 4 + Math.floor(r0() * 6); i++) { const b = newBot(r0, room); if (b) offline[room.id].push(pub(b)); }
        const lines = L().rooms[room.lines || room.id] || [];
        const span = room.busy >= 10 ? 60000 : room.busy >= 4 ? 4 * 60000 : 15 * 60000;
        const R = L().replies[langOf(room)];
        const t1 = t0 - 31 * span;
        let at = t1;
        for (let i = 0; i < 30; i++) {
          const p = pick(r0, [...inRoom(room.id), ...offline[room.id]]); if (!p) break;
          const generic = i && r0() < 0.2;
          const text = fill(generic ? fresh(R.generic, room.id, r0) : fresh(lines, room.id, r0), { room: room.id, speaker: p });
          at += span * (0.4 + 1.2 * r0());
          push({ id: nid(), room: room.id, from: p.id, name: p.name, bot: true, country: p.country, text, wpm: lineWpm(p, text), quick: false, reply: null, at: Math.min(at, t0 - 4000) });
          // people often send two lines in a row
          if (r0() < 0.18 && i < 29) {
            i++; at += 6000 + 10000 * r0();
            const t2 = fill(fresh(lines, room.id, r0), { room: room.id, speaker: p });
            push({ id: nid(), room: room.id, from: p.id, name: p.name, bot: true, country: p.country, text: t2, wpm: lineWpm(p, t2), quick: false, reply: null, at: Math.min(at, t0 - 3000) });
          }
        }
      }
    }

    const mode = () => T.chatMode || 'full';
    const allowed = () => (T.chatRooms === 'learn' ? C().areas.find(a => a.id === 'learn').rooms.map(r => r.id) : null);
    const refuse = (msg, code) => Promise.reject(Object.assign(new Error(msg), { code }));

    return {
      enter() {
        if (!people.size) populate();
        if (!seeded) { seeded = true; history(); syncPosts(true); }
        on = true; last = now();
        if (!timer) timer = setInterval(tick, 250);
        return Promise.resolve({ mode: mode(), allowed: allowed(), rooms: summary() });
      },
      exit() { on = false; opened = null; clearInterval(timer); timer = 0; later.length = 0; return Promise.resolve(); },
      join(id) {
        const room = byId[id];
        if (!room) return refuse('No such room.', 'room');
        const a = allowed(); if (a && !a.includes(id)) return refuse('Your school limits chat to the Learn rooms.', 'school');
        opened = id;
        return Promise.resolve({ room: id, members: inRoom(id).map(pub), offline: offline[id].slice(), history: logs[id].slice(-C().history).map(m => ({ ...m })),
          posts: room.kind === 'posts' ? [...posts.values()].sort((x, y) => y.at - x.at).map(p => ({ ...p })) : null });
      },
      leave(id) { if (opened === id) opened = null; return Promise.resolve(); },
      people: id => inRoom(id).map(pub),
      send({ room: id, text, wpm, quick, reply } = {}) {
        if (!on) return refuse('Open a room first.', 'closed');
        const room = byId[id];
        if (!room) return refuse('No such room.', 'room');
        if (mode() === 'off') return refuse('Chat is off for this account.', 'off');
        if (room.readOnly) return refuse('Only Art and the moderators post here.', 'readonly');
        if (room.kind === 'posts') return refuse('Post a party with the form.', 'posts');
        const a = allowed(); if (a && !a.includes(id)) return refuse('Your school limits chat to the Learn rooms.', 'school');
        if (mode() === 'quick' && !(quick && root.ChatRules.QUICK.includes(text))) return refuse('This account sends quick phrases only.', 'quick');
        const c = root.ChatRules.check(text, { recent, lastAt: lastSend, now: Date.now(), slowMs: room.slowMs || C().slowMs });
        if (!c.ok) return Promise.reject(Object.assign(new Error(c.why || 'Type a message first.'), { code: c.code, wait: c.wait }));
        lastSend = Date.now();
        recent.push({ text: c.text, at: lastSend }); if (recent.length > 10) recent.shift();
        const w = quick ? null : (wpm ? Math.max(1, Math.min(root.ChatRules.WPM_MAX, Math.round(wpm))) : null);
        const r = reply && logs[id].find(m => m.id === reply);
        const m = post({ id: 'me', name: me().name, bot: false, wpm: w, country: null }, id, c.text, { quick: !!quick, reply: r ? { id: r.id, name: r.name, text: r.text } : null });
        react(m);
        return Promise.resolve({ ...m });
      },
      async post({ run = 'relay', difficulty = 'normal', skill } = {}) {
        if (mode() === 'off') return refuse('Chat is off for this account.', 'off');
        const a = (skill || [])[0], b = (skill || [])[1];
        const lo_ = Math.max(10, Math.min(250, Math.round(+a || 30))), hi_ = Math.max(lo_, Math.min(300, Math.round(+b || 90)));
        for (const p of [...posts.values()]) if (p.mine) { posts.delete(p.id); host.emit('chat.unpost', { id: p.id }); }
        const l = await sim.createLobby({ run, difficulty });
        const p = postOf({ ...l, count: l.players.length }, Date.now(), true, [lo_, hi_]);
        posts.set(p.id, p);
        host.emit('chat.post', { ...p });
        return { ...p };
      },
      mute: () => Promise.resolve({ ok: true }),
      report(r) {
        const list = host.store.get(STORE_REPORTS, []);
        const item = { id: nid(), at: new Date().toISOString(), player: r.player, name: r.name, room: r.room || null, reason: r.reason, lines: (r.lines || []).slice(-5) };
        list.push(item); while (list.length > 50) list.shift();
        host.store.set(STORE_REPORTS, list);
        return Promise.resolve({ id: item.id, status: 'saved' });
      },
    };
  }

  root.NetChatSim = { create };
})(globalThis);
