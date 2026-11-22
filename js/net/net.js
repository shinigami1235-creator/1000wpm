// The one network API every multiplayer page uses: duels, party lobbies and runs,
// profiles, visits and challenges. Pages never talk to a backend directly.
//
// BACKEND below is the one switch:
//   'sim'  everything runs in this browser with simulated players (js/net/sim.js). Every
//          simulated player is shown as a bot.
//   'ws'   a WebSocket server at WS_URL (js/net/ws.js). The server does not exist yet;
//          NET.md has every message it must answer.
//
// API (every call returns a Promise unless noted)
//   Net.connect()                          -> { id, name }        uses the player's name and look from WPM
//   Net.disconnect()
//   Net.on(event, fn) -> off               events: 'presence', 'lobbies', 'lobby', 'chat', 'match', 'challenge', 'notice'
//   Net.presence()                         -> [Player]             not a promise; the last list the backend sent
//
//   Net.lobbies.list()                     -> [LobbySummary]
//   Net.lobbies.create({ name, run, difficulty }) -> Lobby
//   Net.lobbies.join(id)                   -> Lobby
//   Net.lobbies.leave()
//   Net.lobbies.ready(on)
//   Net.lobbies.setRole(role)              'striker' | 'guard' | 'support'
//   Net.lobbies.kick(playerId)             host only
//   Net.lobbies.setRun({ run, difficulty }) host only
//   Net.lobbies.chat(text)                 filtered here and again on the server
//   Net.lobbies.start()                    host only, everyone ready
//   Net.lobbies.current()                  not a promise; the lobby you are in or null
//
//   Net.match.queue({ mode, opponent, challenge }) -> MatchInfo   mode: 'quick' | 'art' | 'player' | 'watch'
//   Net.match.input(k, t)                  not a promise; one key at t ms on the match clock
//   Net.match.ready()                      not a promise; this client has loaded the arena (duels hold at phase 'load' until both sides send it)
//   Net.match.leave()                      leaving a duel before the end counts as a loss
//   Net.match.current()                    not a promise; { info, state } or null
//   'match' events: { type: 'start' | 'state' | 'event' | 'end', ... }, see NET.md
//
//   Net.results.record()                   -> this player's duel record { rating, games, wins, losses, streak, bestStreak, vsArt, history }
//   Net.results.party()                    -> party record { runs, wins, best, history }
//   Net.results.opponents()                -> [{ id, name, bot, rating, w, l }]   players this device has duelled
//
//   Net.profiles.get(id)                   -> Profile                'me' is this device's own public profile
//   Net.profiles.visit(id)                 -> { profile, room }      also counts the visit on the server
//   Net.profiles.online()                  -> [Player]
//
//   Net.lobbies.invite(playerId)           -> Invite { id, to, status }   makes a lobby first if you have none; 'invite' events follow
//
//   Net.chat.rooms()                      not a promise; the areas and rooms from js/net/chat-rooms.js
//   Net.chat.enter()                       -> { mode: 'full' | 'quick' | 'off', allowed: [roomId] | null, rooms: { id: { members, seq } } }
//   Net.chat.exit()
//   Net.chat.join(room)                    -> { room, members: [Player], offline: [Player], history: [ChatMessage], posts: [Post] | null }
//   Net.chat.leave(room)
//   Net.chat.send({ room, text, wpm, quick, reply }) -> ChatMessage
//   Net.chat.post({ run, difficulty, skill: [lo, hi] }) -> Post      the Party finder; opens a lobby for you
//   Net.chat.people(room)                  not a promise; who is online in the room
//   Net.chat.mute(id, on) / muted()        kept on this device and sent to the server
//   Net.chat.report({ player, name, room, reason, lines })
//   Net.friends.list() -> { friends, incoming, outgoing, blocked, limits }
//   Net.friends.request(id, name) / accept(id) / decline(id) / cancel(id) / remove(id) / block(id, name) / unblock(id)
//   Net.dm.threads() / open(id) -> { with, history } / close() / read(id) / send({ to, text, wpm, quick }) / report(r)
//      private messages go only between two players on each other's friends list, through ChatRules
//   events: 'friends' { friends, incoming, outgoing, blocked }, 'friend.request' Req, 'friend.accepted' { id, name },
//           'dm.msg' Dm, 'dm.threads' [thread]
//   events: 'chat.msg' ChatMessage, 'chat.rooms' { rooms }, 'chat.people' { room, join, leave, offline },
//           'chat.post' Post, 'chat.unpost' { id }, 'chat.delete' { room, id }
//
//   Net.challenges.send(id)                -> Challenge { id, from, to, status }
//   Net.challenges.accept(id) / decline(id)
//   'challenge' events: Challenge with status 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
//
// Test hooks: Net.test({ hp, roundMs, search, artChance, botWpm, join }) speeds the simulated
// backend up for automated tests. window.__netTest set before this file loads does the same.
window.Net = (() => {
  const BACKEND = 'sim';
  const WS_URL = 'wss://api.10000wpm.com/ws';   // placeholder until the domain and server exist

  const MUTES = 'wpm-chat-mutes';
  const bus = NetCore.emitter();
  let impl = null, me = null, conn = null;
  const T = { ...(window.__netTest || {}) };

  // what the backends need from the page: words, the player's level, their public profile
  const host = {
    emit: (ev, p) => {
      if ((ev === 'chat' || ev === 'chat.msg' || ev === 'dm.msg') && p && p.text) p = { ...p, text: NetFilter.clean(p.text).text };
      bus.emit(ev, p);
    },
    now: () => performance.now(),
    hidden: () => document.hidden,
    me: () => me,
    test: T,
    words(seed, { count = 120, difficulty = [2, 5], theme = 'common' } = {}) {
      if (window.WordBank) return WordBank.pick({ count, difficulty, theme, seed, minLen: 2, maxLen: 9 }).map(w => (typeof w === 'string' ? w : w.text || w.word || String(w)));
      const r = NetCore.rng(seed), base = (TT.randomWords ? TT.randomWords(count) : []);
      return base.length ? base : Array.from({ length: count }, () => NetCore.pick(r, ['type', 'fast', 'word', 'key']));
    },
    level() {
      const st = WPM.stats();
      const recent = WPM.sessions().filter(s => s.wpm && s.acc).slice(-20);
      const acc = recent.length ? recent.reduce((a, s) => a + s.acc, 0) / recent.length / 100 : 0.94;
      return { wpm: st.avgWpm || 45, acc: Math.max(0.85, Math.min(0.99, acc || 0.94)) };
    },
    local: () => (window.MultiLocal ? MultiLocal.profile() : { id: 'me', name: WPM.profile().name }),
    store: {
      get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
      del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    },
  };

  function backend() {
    if (impl) return impl;
    impl = BACKEND === 'ws' ? NetWS.create(host, WS_URL) : NetSim.create(host);
    return impl;
  }

  function connect() {
    if (conn) return conn;
    const p = WPM.profile();
    const ok = NetFilter.nameOk(p.name);
    me = { id: 'me', name: ok.ok || p.name === 'Guest' ? p.name : 'Guest', look: window.Avatar ? Avatar.mine() : null };
    conn = backend().connect(me).catch(e => { conn = null; throw e; });
    return conn;
  }
  const need = fn => (...a) => connect().then(() => fn(...a));

  // the device's progress reset clears the simulated server's copy of this player too
  if (window.WPM) WPM.on('reset', () => { if (impl && impl.reset) impl.reset(); });

  return {
    BACKEND, WS_URL,
    isSim: () => BACKEND === 'sim',
    connect,
    disconnect() { if (impl) impl.disconnect(); conn = null; },
    on: (ev, fn) => bus.on(ev, fn),
    presence: () => (impl ? impl.presence() : []),
    lobbies: {
      list: need(() => impl.lobbies.list()),
      create: need(o => impl.lobbies.create(o || {})),
      join: need(id => impl.lobbies.join(id)),
      leave: () => (impl ? impl.lobbies.leave() : Promise.resolve()),
      ready: need(on => impl.lobbies.ready(!!on)),
      setRole: need(role => impl.lobbies.setRole(role)),
      kick: need(id => impl.lobbies.kick(id)),
      setRun: need(o => impl.lobbies.setRun(o)),
      chat: need(text => {
        const c = NetFilter.clean(text);
        if (!c.text) return Promise.resolve(null);
        return impl.lobbies.chat(c.text);
      }),
      invite: need(id => impl.lobbies.invite(id)),
      start: need(() => impl.lobbies.start()),
      current: () => (impl ? impl.lobbies.current() : null),
    },
    match: {
      queue: need(o => impl.match.queue(o || { mode: 'quick' })),
      input: (k, t) => { if (impl) impl.match.input(k, t); },
      ready: () => { if (impl) impl.match.ready(); },
      leave: () => (impl ? impl.match.leave() : Promise.resolve()),
      current: () => (impl ? impl.match.current() : null),
      clock: () => (impl ? impl.match.clock() : 0),
    },
    results: {
      record: need(() => impl.results.record()),
      party: need(() => impl.results.party()),
      opponents: need(() => impl.results.opponents()),
    },
    profiles: {
      get: need(id => impl.profiles.get(id)),
      visit: need(id => impl.profiles.visit(id)),
      online: need(() => impl.profiles.online()),
    },
    chat: {
      rooms: () => window.CHAT_ROOMS,
      enter: need(() => impl.chat.enter()),
      exit: () => (impl && conn ? impl.chat.exit() : Promise.resolve()),
      join: need(room => impl.chat.join(room)),
      leave: room => (impl && conn ? impl.chat.leave(room) : Promise.resolve()),
      send: need(o => impl.chat.send(o || {})),
      post: need(o => impl.chat.post(o || {})),
      people: room => (impl ? impl.chat.people(room) : []),
      // a mute stays on this device even before the server keeps it
      mute(id, on) {
        const m = new Set(host.store.get(MUTES, []));
        if (on) m.add(id); else m.delete(id);
        host.store.set(MUTES, [...m]);
        if (impl && conn) impl.chat.mute(id, !!on).catch(() => {});
        return [...m];
      },
      muted: () => host.store.get(MUTES, []),
      report: need(r => impl.chat.report(r || {})),
    },
    // friends and one-on-one messages; the rooms stay public and there are no private groups
    friends: {
      list: need(() => impl.friends.list()),
      request: need((id, name) => impl.friends.request(id, name)),
      accept: need(id => impl.friends.accept(id)),
      decline: need(id => impl.friends.decline(id)),
      cancel: need(id => impl.friends.cancel(id)),
      remove: need(id => impl.friends.remove(id)),
      block: need((id, name) => impl.friends.block(id, name)),
      unblock: need(id => impl.friends.unblock(id)),
    },
    dm: {
      threads: need(() => impl.dm.threads()),
      open: need(id => impl.dm.open(id)),
      close: () => (impl && conn ? impl.dm.close() : Promise.resolve()),
      read: need(id => impl.dm.read(id)),
      send: need(o => impl.dm.send(o || {})),
      report: need(r => impl.dm.report(r || {})),
    },
    challenges: {
      send: need(id => impl.challenges.send(id)),
      accept: need(id => impl.challenges.accept(id)),
      decline: need(id => impl.challenges.decline(id)),
    },
    test(o) { Object.assign(T, o || {}); return { ...T }; },
    // for tests and the simulated pages: the backend object itself
    _impl: () => backend(),
  };
})();
