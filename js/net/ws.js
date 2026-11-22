// The WebSocket backend for when the server exists. It speaks the messages in NET.md:
// every message is one JSON object { v: 1, t: type, id?: request id, d: payload }.
// A request carries an id and the server answers with { t: 'ok' | 'err', id, d }.
// Everything else the server sends is an event: presence, lobbies, lobby, chat, match,
// challenge, invite, notice, and for the chat rooms chat.msg, chat.rooms, chat.people, chat.post,
// chat.unpost and chat.delete.
//
// Nothing here runs until Net.BACKEND is 'ws'. Until the server is up, connect() fails
// and the pages show that the server is offline.
(function (root) {
  function create(host, url) {
    let ws = null, open = null, n = 0, me = null, presence = [], lobby = null, match = null, clockOff = 0, room = null, people = new Map();
    const pending = new Map();

    function connect(m) {
      me = m;
      if (open) return open;
      open = new Promise((ok, fail) => {
        try { ws = new WebSocket(url); } catch (e) { open = null; fail(e); return; }
        ws.onopen = () => { send('hello', { name: me.name, look: me.look, client: 'web-1' }).then(ok, fail); };
        ws.onerror = () => { open = null; fail(new Error('The server is offline.')); };
        ws.onclose = () => { open = null; for (const p of pending.values()) p.fail(new Error('Connection closed.')); pending.clear(); host.emit('notice', { kind: 'offline' }); };
        ws.onmessage = e => { let msg; try { msg = JSON.parse(e.data); } catch (x) { return; } receive(msg); };
      });
      return open;
    }

    function send(t, d = {}) {
      return new Promise((ok, fail) => {
        if (!ws || ws.readyState !== 1) { fail(new Error('The server is offline.')); return; }
        const id = ++n;
        pending.set(id, { ok, fail });
        ws.send(JSON.stringify({ v: 1, t, id, d }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); fail(new Error('The server did not answer.')); } }, 10000);
      });
    }
    // keys go out without waiting for an answer
    function fire(t, d) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ v: 1, t, d })); }

    function receive(msg) {
      if (msg.t === 'ok' || msg.t === 'err') {
        const p = pending.get(msg.id); if (!p) return;
        pending.delete(msg.id);
        msg.t === 'ok' ? p.ok(msg.d) : p.fail(new Error((msg.d && msg.d.message) || 'Request refused.'));
        return;
      }
      if (msg.t === 'presence') presence = msg.d || [];
      if (msg.t === 'lobby') lobby = msg.d;
      if (msg.t === 'chat.people' && msg.d && msg.d.room === room) {
        for (const id of msg.d.leave || []) people.delete(id);
        for (const p of msg.d.join || []) people.set(p.id, p);
      }
      if (msg.t === 'match') {
        const d = msg.d || {};
        if (d.type === 'start') { match = { info: d, state: d.state }; clockOff = host.now() - (d.clock || 0); }
        if (d.type === 'state' && match) { match.state = d.state; if (d.clock != null) clockOff = host.now() - d.clock; }
        if (d.type === 'end') match = null;
      }
      host.emit(msg.t, msg.d);
    }

    return {
      connect,
      disconnect() { if (ws) ws.close(); ws = null; open = null; },
      presence: () => presence.slice(),
      lobbies: {
        list: () => send('lobby.list'),
        create: o => send('lobby.create', o),
        join: id => send('lobby.join', { id }),
        leave: () => send('lobby.leave'),
        ready: on => send('lobby.ready', { on }),
        setRole: role => send('lobby.role', { role }),
        kick: id => send('lobby.kick', { id }),
        setRun: o => send('lobby.run', o),
        chat: text => send('lobby.chat', { text }),
        invite: to => send('lobby.invite', { to }),
        start: () => send('lobby.start'),
        current: () => lobby,
      },
      match: {
        queue: o => send('match.queue', o),
        input: (k, t) => fire('match.input', { id: match && match.info.id, k, t }),
        ready: () => fire('match.ready', { id: match && match.info.id }),
        leave: () => send('match.leave', { id: match && match.info.id }),
        current: () => match,
        clock: () => host.now() - clockOff,
      },
      chat: {
        enter: () => send('chat.enter'),
        exit: () => send('chat.exit').catch(() => {}),
        join: id => send('chat.join', { room: id }).then(d => { room = id; people = new Map((d.members || []).map(p => [p.id, p])); return d; }),
        leave: id => send('chat.leave', { room: id }).catch(() => {}).then(() => { if (room === id) { room = null; people.clear(); } }),
        send: o => send('chat.send', o),
        post: o => send('chat.post', o),
        people: id => (id === room ? [...people.values()] : []),
        mute: (id, on) => send('chat.mute', { id, on }),
        report: r => send('chat.report', r),
      },
      friends: {
        list: () => send('friends.list'),
        request: (id, name) => send('friends.request', { id, name }),
        accept: id => send('friends.accept', { id }),
        decline: id => send('friends.decline', { id }),
        cancel: id => send('friends.cancel', { id }),
        remove: id => send('friends.remove', { id }),
        block: (id, name) => send('friends.block', { id, name }),
        unblock: id => send('friends.unblock', { id }),
      },
      dm: {
        threads: () => send('dm.threads'),
        open: id => send('dm.open', { id }),
        close: () => send('dm.close').catch(() => {}),
        read: id => send('dm.read', { id }),
        send: o => send('dm.send', o),
        report: r => send('dm.report', r),
      },
      results: {
        record: () => send('results.record'),
        party: () => send('results.party'),
        opponents: () => send('results.opponents'),
      },
      profiles: {
        get: id => send('profile.get', { id }),
        visit: id => send('profile.visit', { id }),
        online: () => send('presence.list'),
      },
      challenges: {
        send: to => send('challenge.send', { to }),
        accept: id => send('challenge.accept', { id }),
        decline: id => send('challenge.decline', { id }),
      },
    };
  }
  root.NetWS = { create };
})(globalThis);
