// The Superboss stream: the messages between the streamer's page and the viewers' pages, the
// simulated chat and the simulated viewers. SUPERBOSS.md documents the message format.
//
// Until the server exists, messages go through a BroadcastChannel, so a viewer tab in the same
// browser mirrors a streamer tab, and through a loopback link when the viewer page runs its own
// simulated stream.
//   SuperStream.host(link, { fight, name, sim })   the streamer side: sends state and events, takes purchases
//   SuperStream.watch(handlers)                    the viewer side: mirrors a live tab or starts a simulated stream
//   SuperStream.broadcast()                        a link over BroadcastChannel('wpm-superboss')
//   SuperStream.loopback()                         [hostLink, viewerLink] joined in memory
window.SuperStream = (() => {
  const V = 1;
  const FORWARD = new Set(['countdown', 'go', 'hit', 'hurt', 'phase', 'enrage', 'finish', 'finishFail', 'win', 'lose', 'cast', 'fizzle', 'sever', 'regrow', 'neck',
    'block', 'blockFail', 'windup', 'attack', 'cancel', 'compile', 'fix', 'order', 'line', 'weak', 'weakOpen', 'decoy', 'packet', 'support', 'drop', 'hype', 'shielded',
    'warded', 'tier', 'comboDrop', 'shuffle', 'cleanse', 'chaosEnd', 'offer', 'crowdGone', 'miss']);
  let seq = 0;
  const msg = (type, data, from) => ({ v: V, type, from, seq: ++seq, at: Date.now(), data });

  // ---------- links ----------
  function wrap(post, listen) {
    const subs = {};
    listen(m => { if (m && m.v === V && subs[m.type]) subs[m.type].forEach(fn => { try { fn(m.data, m); } catch (e) { console.error(e); } }); });
    return {
      on(type, fn) { (subs[type] ||= new Set()).add(fn); return () => subs[type].delete(fn); },
      send(type, data, from = 'local') { post(msg(type, data, from)); },
    };
  }
  function broadcast() {
    if (!window.BroadcastChannel) return wrap(() => {}, () => {});
    const bc = new BroadcastChannel('wpm-superboss');
    const l = wrap(m => { try { bc.postMessage(m); } catch (e) {} }, fn => { bc.onmessage = e => fn(e.data); });
    l.close = () => bc.close();
    return l;
  }
  function loopback() {
    let toA = () => {}, toB = () => {};
    const a = wrap(m => setTimeout(() => toB(m), 0), fn => { toA = fn; });
    const b = wrap(m => setTimeout(() => toA(m), 0), fn => { toB = fn; });
    a.close = b.close = () => {};
    return [a, b];
  }

  // ---------- simulated chat ----------
  // Idle chatter at about 0.7 lines a second. Big moments add energy, which raises the rate and
  // sends a few reaction lines; the energy fades over about 4 seconds.
  function simChat(say, rng = Math.random) {
    const D = SuperData;
    let energy = 0, acc = 0, recent = [];
    const pick = a => a[Math.floor(rng() * a.length)];
    const who = () => { let h; for (let i = 0; i < 5; i++) { h = pick(D.HANDLES); if (!recent.includes(h)) break; } recent = [h, ...recent].slice(0, 6); return h; };
    const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
    function line(kind, v = {}, user) { const list = D.CHAT[kind]; if (!list) return; say({ id: 'c' + (++seq), user: user || who(), text: fill(pick(list), v), sim: true, kind }); }
    function react(kind, v = {}, n = 1, boost = 1) {
      energy = Math.min(8, energy + boost);
      for (let i = 0; i < n; i++) setTimeout(() => line(rng() < 0.85 ? kind : 'idle', v), 250 + rng() * (600 + i * 500));
    }
    function tick(dt) {
      energy *= Math.exp(-dt / 4);
      acc += dt * (0.7 + energy * 0.45);
      while (acc >= 1) { acc -= 1 + rng() * 0.4; line('idle'); }
    }
    return { react, tick, line };
  }

  // ---------- the streamer side ----------
  // Sends the fight state 10 times a second and every event as it happens, answers purchases,
  // and runs the simulated viewers: their chat, their purchases and the watch party count.
  function host(links, { fight, name = 'Art', sim = true, rng = Math.random, onChat, onViewers }) {
    links = [].concat(links);
    const send = (type, data) => links.forEach(l => l.send(type, data, 'streamer'));
    const offs = [];
    let viewers = 180 + Math.floor(rng() * 120), real = new Map(), stateT = 0, helloT = 0, buyT = 6 + rng() * 6, alive = true;
    const say = m => { send('chat.msg', m); if (onChat) onChat(m); };
    const chat = simChat(say, rng);
    const bump = k => { viewers = Math.round(viewers * (1 + k)); };
    offs.push(fight.on('*', (n, d) => {
      if (!alive) return;
      if (FORWARD.has(n)) send('fight.event', { name: n, data: d });
      if (!sim) return;
      const sp = d && d.spell ? Combat.spell(d.spell) : null;
      if (n === 'hit' && d.crit && d.amount > 60) chat.react('crit', {}, 1, 1);
      else if (n === 'hit' && d.amount > 120) chat.react('hit', {}, 1, 0.6);
      if (n === 'cast') chat.react(d.rarity >= 4 ? 'bigSpell' : 'spell', { spell: sp ? sp.word : 'that spell' }, d.rarity >= 3 ? 3 : 1, d.rarity);
      if (n === 'phase') { chat.react('phase', { n: d.n }, 4, 4); bump(0.04); }
      if (n === 'enrage') chat.react('enrage', {}, 3, 3);
      if (n === 'hurt' && d.amount >= 9) chat.react(fight.state().art.hp < 30 ? 'low' : 'hurt', {}, 1, 1);
      if (n === 'block') chat.react('block', {}, 1, 0.6);
      if (n === 'sever') chat.react('sever', {}, 2, 1.5);
      if (n === 'neck' && d.on) chat.react('neck', {}, 3, 3);
      if (n === 'regrow' && rng() < 0.4) chat.react('regrow', {}, 1, 0.3);
      if (n === 'compile') chat.react('compile', {}, 1, 0.8);
      if (n === 'order') chat.react('order', {}, 1, 0.5);
      if (n === 'fix' && rng() < 0.3) chat.react('fix', {}, 1, 0.3);
      if (n === 'weak' && d.hit) chat.react('weak', {}, 1, 1.2);
      if (n === 'decoy') chat.react('decoy', {}, 2, 1);
      if (n === 'drop' || (n === 'support' && d.kind === 'chaos')) { const it = SuperData.item(d.id); chat.react(d.kind === 'chaos' ? 'chaos' : 'support', { who: d.buyer, item: it ? it.name.toLowerCase() : d.id }, 2, 1.5); }
      if (n === 'hype') chat.react('hype', {}, 4, 4);
      if (n === 'finish') { chat.react('finish', {}, 4, 5); bump(0.03); }
      if (n === 'win') { chat.react('win', {}, 8, 8); bump(0.06); }
      if (n === 'lose') chat.react('lose', {}, 5, 5);
      if (n === 'miss' && rng() < 0.15) chat.react('miss', {}, 1, 0.2);
    }));
    for (const l of links) {
      offs.push(l.on('support.buy', d => {
        const r = fight.support(d.item, d.buyer, { you: true });
        send('support.result', { id: d.id, ok: r.ok, reason: r.reason || null });
      }));
      offs.push(l.on('chat.send', d => say({ id: 'c' + (++seq), user: String(d.user || 'viewer').slice(0, 24), text: String(d.text || '').slice(0, 200), sim: false })));
      offs.push(l.on('viewer.join', d => { real.set(d.id, d.name); hello(); }));
      offs.push(l.on('viewer.leave', d => { real.delete(d.id); }));
      offs.push(l.on('stream.ping', () => hello()));
    }
    function hello() {
      const s = fight.state();
      send('stream.hello', { streamer: name, boss: s.boss, dial: s.dial, viewers: viewers + real.size, sim });
      if (onViewers) onViewers(viewers + real.size);
    }
    function update(dt) {
      if (!alive) return;
      stateT += dt; helloT += dt;
      if (stateT >= 0.1) { stateT = 0; send('fight.state', fight.state()); }
      if (helloT >= 2) { helloT = 0; viewers = Math.max(60, Math.round(viewers + (rng() - 0.45) * 6)); hello(); }
      if (!sim) return;
      chat.tick(dt);
      const st = fight.status;
      if (st === 'fight' || st === 'finish') {
        buyT -= dt;
        if (buyT <= 0) {
          buyT = 9 + rng() * 13;
          const s = fight.state();
          const chaos = !s.chaos.block && rng() < 0.24;
          const pool = chaos ? ['fog', 'shuffle', 'speed'] : (s.art.hp < 45 ? ['heal', 'heal', 'shield', 'shield', 'slowmo', 'hype'] : ['shield', 'overclock', 'overclock', 'heal', 'slowmo', 'hype', 'hype']);
          fight.support(pool[Math.floor(rng() * pool.length)], SuperData.HANDLES[Math.floor(rng() * SuperData.HANDLES.length)]);
        }
      }
    }
    hello();
    return {
      update, hello, chat,
      viewers: () => viewers + real.size,
      end() { if (!alive) return; send('stream.end', { result: fight.result() }); },
      close() { alive = false; offs.forEach(f => f()); },
    };
  }

  // ---------- the viewer side ----------
  // Listens for a streamer tab for 1.2 s. With none, it runs a simulated stream in this page:
  // a SuperFight with a SuperBot typing for Art, sent over a loopback link, so the viewer page
  // reads it through exactly the messages a real stream would send.
  function watch(h) {
    const me = 'v' + Math.random().toString(36).slice(2, 8);
    const bc = broadcast();
    let link = null, mode = 'wait', simFight = null, simHost = null, simBot = null, raf = 0, last = 0, timer = 0, pending = new Map(), closed = false;
    const offs = [];
    function use(l, m) {
      link = l; mode = m;
      offs.push(l.on('fight.state', s => h.state && h.state(s)));
      offs.push(l.on('fight.event', e => h.event && h.event(e.name, e.data)));
      offs.push(l.on('chat.msg', c => h.chat && h.chat(c)));
      offs.push(l.on('stream.hello', d => h.hello && h.hello(d, mode)));
      offs.push(l.on('stream.end', d => h.end && h.end(d.result)));
      offs.push(l.on('support.result', d => { const p = pending.get(d.id); if (p) { pending.delete(d.id); clearTimeout(p.t); p.done(d); } }));
      l.send('viewer.join', { id: me, name: h.name ? h.name() : 'viewer' }, me);
      if (h.mode) h.mode(m);
    }
    // a streamer tab answers the ping at once; one that opens later takes over from the simulated stream
    const offHello = bc.on('stream.hello', () => {
      if (mode === 'live' || closed) return;
      clearTimeout(timer);
      if (mode === 'sim') stopSim();
      offHello();
      use(bc, 'live');
    });
    bc.send('stream.ping', { id: me }, me);
    timer = setTimeout(() => { if (mode === 'wait' && !closed) startSim(h.boss || 'hydra', h.dial || 'typemaster'); }, 1200);
    function startSim(boss, dial) {
      const [hostLink, viewLink] = loopback();
      const t0 = performance.now();
      simFight = SuperFight.create({ boss, dial, now: () => performance.now(), inline: { flow: () => null } });
      simBot = SuperBot.create({ state: simFight.state, char: simFight.char, back: simFight.back, now: () => performance.now() }, { wpm: SuperData.dial(dial).wpm + 20, acc: 0.985, react: 260 });
      simHost = host(hostLink, { fight: simFight, name: 'Art', sim: true });
      use(viewLink, 'sim');
      simFight.on('win', () => setTimeout(() => simHost && simHost.end(), 400));
      simFight.on('lose', () => setTimeout(() => simHost && simHost.end(), 400));
      simFight.start();
      last = t0;
      const loop = t => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.25, (t - last) / 1000); last = t;
        simFight.tick(); simBot.step(); simFight.tick();
        simHost.update(dt);
      };
      raf = requestAnimationFrame(loop);
      // keep the stream going while the tab is hidden, at a slower rate
      const bg = setInterval(() => { if (document.hidden && simFight) { simFight.tick(); simBot.step(); simHost.update(0.1); } }, 100);
      offs.push(() => clearInterval(bg));
    }
    function stopSim() {
      cancelAnimationFrame(raf);
      if (simHost) simHost.close();
      offs.forEach(f => f()); offs.length = 0;
      simFight = simHost = simBot = null;
    }
    function restart(boss, dial) {
      if (mode !== 'sim') return;
      stopSim();
      startSim(boss, dial);
    }
    // a purchase with this viewer's own coins: the coins come off now and go back if the streamer says no
    function buy(item, buyer) {
      return new Promise(done => {
        if (!link) return done({ ok: false, reason: 'The stream is not connected.' });
        const id = me + ':' + (++seq);
        const t = setTimeout(() => { pending.delete(id); done({ ok: false, reason: 'The stream did not answer.' }); }, 6000);
        pending.set(id, { done, t });
        link.send('support.buy', { id, item, buyer, price: SuperData.price(item) }, me);
      });
    }
    function say(user, text) { if (link) link.send('chat.send', { id: me, user, text }, me); }
    function close() {
      closed = true;
      clearTimeout(timer); cancelAnimationFrame(raf);
      if (link) link.send('viewer.leave', { id: me }, me);
      offs.forEach(f => f());
      if (simHost) simHost.close();
      if (bc.close) bc.close();
    }
    return { buy, say, close, restart, mode: () => mode, sim: () => simFight, bot: () => simBot };
  }

  return { host, watch, broadcast, loopback, simChat, FORWARD, V };
})();
