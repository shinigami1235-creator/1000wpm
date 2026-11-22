// #/party: party lobbies and co-op runs. Up to 4 typists pick roles and fight a chain
// of bosses through Keyspace areas together. The lobby, the bots in empty seats and the
// run itself come from the network layer (js/net/), which is simulated until the server
// exists; PartyRules in js/net/party-rules.js has the rules.
//
//   #/party           the lobby browser and Create a lobby
//   #/party/lobby     the lobby you are in, and the run once it starts
window.PartyPage = { events: ['party_run'] };
if (window.WPM) WPM.events.register(...PartyPage.events);

Router.register('party', (() => {
  const e = s => UI.esc(s);
  const R = () => PartyRules;
  const ROLE_ICON = { striker: 'bolt', guard: 'lock', support: 'flame' };
  let el = null, off = [], view = '', run = null, words = [], scene = null, keys = null, ty = null, onDoc = null, onSound = null, onResize = null, raf = 0, lastState = null, endShown = false;
  let create = { run: 'relay', difficulty: 'normal' };

  function mount(root, params) {
    el = root;
    off.push(
      Net.on('lobby', l => { if (view === 'lobby') { if (l) paintLobby(l); else browser(); } }),
      Net.on('lobbies', () => { if (view === 'browser') paintList(); }),
      Net.on('chat', m => { if (view === 'lobby') addChat(m); }),
      Net.on('match', onMatch),
    );
    route(params || []);
  }
  function update(params) { route(params || []); }
  function route(p) {
    Net.connect().then(() => {
      if (!el) return;
      const cur = Net.match.current();
      if (cur && cur.info && cur.info.kind === 'party') return startRun(cur.info);
      if (Net.lobbies.current()) return lobbyView();
      if (p[0] === 'lobby') { location.hash = '#/party'; return; }
      browser();
    }).catch(err => { if (el) el.innerHTML = `<p class="empty">${e(err.message)}</p>`; });
  }

  // ---------- the lobby browser ----------
  function browser() {
    stopRun();
    view = 'browser';
    el.innerHTML = `
      <div class="du-head">
        <div class="title-block"><h1><span class="pre">&gt;</span>Party</h1><p>// CO-OP RUNS, UP TO 4 PLAYERS</p></div>
      </div>
      <div class="pa-grid">
        <section class="panel pa-list" aria-label="Open lobbies">
          <div class="ph">// LOBBIES<span class="meta">SIMULATED</span></div>
          <div data-list><div class="loading-state">Loading</div></div>
        </section>
        <div class="pa-side">
          <section class="panel hot" aria-label="Create a lobby">
            <div class="ph">// CREATE A LOBBY</div>
            <p class="label">Run</p>
            <div class="seg" data-run role="group" aria-label="Run">${Object.values(R().RUNS).map(x => `<button type="button" data-v="${x.id}" aria-pressed="${x.id === create.run}">${e(x.name)}, ${x.fights.length} fights</button>`).join('')}</div>
            <p class="label">Difficulty</p>
            <div class="seg" data-diff role="group" aria-label="Difficulty">${['easy', 'normal', 'hard'].map(d => `<button type="button" data-v="${d}" aria-pressed="${d === create.difficulty}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
            <button class="btn" type="button" data-create>Create lobby</button>
            <p class="dim pa-note">Empty seats fill with bots until real players can join.</p>
          </section>
          <section class="panel" aria-label="Roles">
            <div class="ph">// ROLES</div>
            <dl class="pa-roles">${Object.entries(R().ROLES).map(([k, r]) => `<dt>${UI.icon(ROLE_ICON[k], 'green')}${e(r.name)}</dt><dd>${e(r.text)}</dd>`).join('')}</dl>
            <p class="dim pa-note">Clean words from anyone raise the team combo, which multiplies everyone's damage. A typo from anyone drops it a tier.</p>
          </section>
          <section class="panel" aria-label="Your party runs"><div class="ph">// YOUR RUNS<span class="meta">THIS DEVICE</span></div><div data-rec></div></section>
        </div>
      </div>`;
    const seg = (sel, key) => el.querySelector(sel).addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      create[key] = b.dataset.v;
      el.querySelectorAll(sel + ' button').forEach(x => x.setAttribute('aria-pressed', x === b));
    });
    seg('[data-run]', 'run'); seg('[data-diff]', 'difficulty');
    el.querySelector('[data-create]').addEventListener('click', () => Net.lobbies.create({ ...create }).then(() => { location.hash = '#/party/lobby'; lobbyView(); }));
    paintList();
    Net.results.party().then(r => {
      const box = el && el.querySelector('[data-rec]'); if (!box) return;
      const last = r.history.slice(-3).reverse();
      box.innerHTML = `<dl class="kv"><dt>Runs</dt><dd>${r.runs}</dd><dt>Cleared</dt><dd>${r.wins}</dd><dt>Most fights cleared</dt><dd>${r.best}</dd></dl>
        ${last.length ? `<ol class="du-last">${last.map(h => `<li class="${h.won ? 'w' : 'l'}"><span>${h.won ? 'Cleared' : `${h.cleared} of ${h.of}`}</span> ${e(R().RUNS[h.run].name)}, ${e(h.difficulty)}<em>${UI.fmt(h.dmg || 0)} dmg</em></li>`).join('')}</ol>` : ''}`;
    });
  }

  function paintList() {
    const box = el && el.querySelector('[data-list]');
    if (!box) return;
    Net.lobbies.list().then(list => {
      if (!box.isConnected) return;
      if (!list.length) { box.innerHTML = '<p class="empty">No open lobbies. Create one.</p>'; return; }
      box.innerHTML = `<table class="board pa-table"><thead><tr><th>Lobby</th><th>Run</th><th class="hide-sm">Difficulty</th><th>Players</th><th></th></tr></thead><tbody>
        ${list.map(l => `<tr>
          <td><div class="who"><a class="mu-who" href="#/u/${encodeURIComponent(l.host)}">${MultiUI.img({ id: l.host, name: l.hostName, bot: true }, 68, 34)}<span>${e(l.name)}</span></a></div></td>
          <td>${e(R().RUNS[l.run].name)}<span class="dim hide-sm">, ${R().RUNS[l.run].fights.length} fights</span></td>
          <td class="hide-sm">${e(l.difficulty[0].toUpperCase() + l.difficulty.slice(1))}</td>
          <td><span class="pa-seats" aria-label="${l.count} of ${l.max} players">${Array.from({ length: l.max }, (_, i) => `<i class="${i < l.count ? 'on' : ''}"></i>`).join('')}</span> <span class="num">${l.count}/${l.max}</span></td>
          <td class="r">${l.status === 'running' ? '<span class="dim">In a run</span>' : l.count >= l.max ? '<span class="dim">Full</span>' : `<button class="btn out sm" type="button" data-join="${e(l.id)}">Join</button>`}</td>
        </tr>`).join('')}</tbody></table>
        <p class="dim pa-note">Every player in these lobbies is a bot for now.</p>`;
      box.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => Net.lobbies.join(b.dataset.join)
        .then(() => { location.hash = '#/party/lobby'; lobbyView(); })
        .catch(err => { if (window.Toast) Toast('t-err', `<span>${e(err.message)}</span>`); paintList(); })));
    });
  }

  // ---------- a lobby ----------
  function lobbyView() {
    stopRun();
    view = 'lobby';
    const l = Net.lobbies.current();
    if (!l) return browser();
    el.innerHTML = `
      <div class="du-head">
        <div class="title-block"><h1><span class="pre">&gt;</span><span data-name></span></h1><p data-sub></p></div>
        <button class="btn out" type="button" data-leave>Leave lobby</button>
      </div>
      <div class="pa-lobby">
        <div class="pa-main">
        <section class="panel hot" aria-label="Players"><div class="ph">// PLAYERS<span class="meta" data-count></span></div><ul class="pa-seats-list" data-seats></ul></section>
        <section class="panel pa-chat" aria-label="Lobby chat">
          <div class="ph">// CHAT</div>
          <ol class="pa-msgs" data-msgs aria-live="polite"></ol>
          <form class="pa-say" data-say><label class="sr-only" for="pa-in">Message</label><input class="field" id="pa-in" maxlength="140" autocomplete="off" placeholder="Say hi"><button class="btn out sm" type="submit">Send</button></form>
        </section>
        </div>
        <div class="pa-side">
          <section class="panel" aria-label="Your role"><div class="ph">// YOUR ROLE</div><div class="pa-rolepick" data-roles role="group" aria-label="Role"></div></section>
          <section class="panel" data-hostbox aria-label="Run"><div class="ph">// RUN<span class="meta" data-hostnote></span></div><div data-runpick></div></section>
          <div class="pa-go"><button class="btn out" type="button" data-ready aria-pressed="false">Ready</button><button class="btn" type="button" data-start hidden>Start run</button></div>
        </div>
      </div>`;
    el.querySelector('[data-leave]').addEventListener('click', () => Net.lobbies.leave().then(() => { location.hash = '#/party'; browser(); }));
    el.querySelector('[data-ready]').addEventListener('click', ev => { const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true'; Net.lobbies.ready(on); });
    el.querySelector('[data-start]').addEventListener('click', () => Net.lobbies.start().catch(err => window.Toast && Toast('t-err', `<span>${e(err.message)}</span>`)));
    el.querySelector('[data-say]').addEventListener('submit', ev => {
      ev.preventDefault();
      const inp = el.querySelector('#pa-in');
      const v = inp.value.trim(); if (!v) return;
      inp.value = '';
      Net.lobbies.chat(v);
    });
    el.querySelector('[data-msgs]').innerHTML = '';
    l.chat.forEach(addChat);
    paintLobby(l);
  }

  function paintLobby(l) {
    if (!el || view !== 'lobby') return;
    const me = l.players.find(p => p.id === 'me') || {};
    el.querySelector('[data-name]').textContent = l.name;
    el.querySelector('[data-sub]').textContent = `// ${R().RUNS[l.run].name}, ${R().RUNS[l.run].fights.length} fights, ${l.difficulty}`.toUpperCase();
    el.querySelector('[data-count]').textContent = `${l.players.length} / ${l.max}`;
    const seats = [];
    for (let i = 0; i < l.max; i++) {
      const p = l.players[i];
      if (!p) { seats.push(`<li class="pa-seat empty"><span class="pa-av"></span><span class="dim">Open seat</span></li>`); continue; }
      seats.push(`<li class="pa-seat${p.id === 'me' ? ' is-me' : ''}">
        <a class="mu-who" href="${MultiUI.link(p)}">${MultiUI.img(p, 96, 48)}<span>${MultiUI.name(p)}${p.id === l.host ? '<span class="mu-tag host">Host</span>' : ''}</span></a>
        <span class="pa-role">${UI.icon(ROLE_ICON[p.role], 'green')}${e(R().ROLES[p.role].name)}</span>
        <span class="pa-ready ${p.ready ? 'on' : ''}">${p.ready ? 'Ready' : 'Not ready'}</span>
        ${l.isHost && p.id !== 'me' ? `<button class="btn danger sm" type="button" data-kick="${e(p.id)}">Remove</button>` : ''}
      </li>`);
    }
    el.querySelector('[data-seats]').innerHTML = seats.join('');
    el.querySelectorAll('[data-kick]').forEach(b => b.addEventListener('click', () => Net.lobbies.kick(b.dataset.kick)));
    el.querySelector('[data-roles]').innerHTML = Object.entries(R().ROLES).map(([k, r]) => `<button type="button" class="pa-rolebtn" data-role="${k}" aria-pressed="${me.role === k}">${UI.icon(ROLE_ICON[k])}<b>${e(r.name)}</b><span>${e(r.text)}</span></button>`).join('');
    el.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => Net.lobbies.setRole(b.dataset.role)));
    const rp = el.querySelector('[data-runpick]');
    el.querySelector('[data-hostnote]').textContent = l.isHost ? 'YOU PICK' : 'THE HOST PICKS';
    rp.innerHTML = l.isHost
      ? `<div class="seg" data-run role="group" aria-label="Run">${Object.values(R().RUNS).map(x => `<button type="button" data-v="${x.id}" aria-pressed="${x.id === l.run}">${e(x.name)}</button>`).join('')}</div>
         <div class="seg" data-diff role="group" aria-label="Difficulty" style="margin-top:8px">${['easy', 'normal', 'hard'].map(d => `<button type="button" data-v="${d}" aria-pressed="${d === l.difficulty}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>`
      : `<p>${e(R().RUNS[l.run].name)}, ${e(l.difficulty)}</p>`;
    rp.insertAdjacentHTML('beforeend', `<ol class="pa-areas">${R().RUNS[l.run].fights.map(k => `<li><b>${e(R().AREAS[k].boss)}</b><span class="dim">${e(R().KINDS[R().AREAS[k].kind])}${R().AREAS[k].mite && R().AREAS[k].kind !== 'swarm' ? ' and mites' : ''}, ${e(R().AREAS[k].area)}</span></li>`).join('')}</ol>`);
    if (l.isHost) {
      rp.querySelector('[data-run]').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) Net.lobbies.setRun({ run: b.dataset.v }); });
      rp.querySelector('[data-diff]').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) Net.lobbies.setRun({ difficulty: b.dataset.v }); });
    }
    const rb = el.querySelector('[data-ready]');
    rb.setAttribute('aria-pressed', !!me.ready); rb.textContent = me.ready ? 'Ready' : 'Ready up';
    const sb = el.querySelector('[data-start]');
    sb.hidden = !l.isHost;
    sb.disabled = !l.players.every(p => p.ready);
    sb.title = sb.disabled ? 'Everyone has to be ready' : '';
  }

  function addChat(m) {
    const ol = el && el.querySelector('[data-msgs]');
    if (!ol || !m) return;
    const li = document.createElement('li');
    li.className = m.system ? 'sys' : m.from === 'me' ? 'is-me' : '';
    li.innerHTML = m.system ? e(m.text) : `<b>${e(m.name)}</b>${m.bot ? '<span class="mu-tag bot">Bot</span>' : ''} ${e(m.text)}`;
    ol.append(li);
    while (ol.childElementCount > 60) ol.firstChild.remove();
    ol.scrollTop = ol.scrollHeight;
  }

  // ---------- the run ----------
  function onMatch(m) {
    if (!el || m.kind !== 'party') return;
    if (m.type === 'start') return startRun(m);
    if (!run || m.id !== run.id) return;
    if (m.type === 'state') { lastState = m.state; return; }
    if (m.type === 'event') return event(m.ev);
    if (m.type === 'end') return end(m);
  }

  const COLORS = ['#3ee6ff', '#f2b330', '#ff7ad9'];
  const colorOf = id => { if (id === 'me') return '#39ff88'; const others = run.players.filter(p => p.id !== 'me'); return COLORS[Math.max(0, others.findIndex(p => p.id === id)) % COLORS.length]; };
  const HOW = {
    hydra: 'Type a head\'s name to aim at it. A head grows back unless the others fall soon after.',
    swarm: 'Type a mite\'s word before it reaches the player it flies at.',
    snake: 'Type the last two cars\' words to cut them off. A shorter train hits softer.',
    golem: 'When the core opens, everything does double damage.',
    twins: 'Type a name to aim. Drop both within 12 s of each other or the first one comes back.',
  };
  HOW.mites = 'Mites carry words too: type one before it lands.';
  const MUSIC = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage4', 'stage5', 'stage3'];
  const ROLE_HOW = {
    striker: 'Your words hit 1.3 times harder.',
    guard: 'Type the red word to block. Type a teammate\'s name to shield them.',
    support: 'Type a teammate\'s name to heal them. Buffs show up when the meter fills.',
  };

  function startRun(info) {
    if (run && run.id === info.id) return;
    stopRun();
    view = 'run'; run = info; endShown = false; fightKind = ''; music = '';
    lastState = info.state || null;
    words = (Net.match.current() || {}).words || info.words || [];
    location.hash = '#/party/lobby';
    const me = run.players.find(p => p.id === 'me');
    el.innerHTML = `
      <div class="pa-run">
        <header class="pa-top">
          <div class="pa-boss"><span class="label" data-area></span><h2><span data-boss></span> <em class="pa-kind" data-kind></em></h2></div>
          <div class="du-hp boss" data-bhp><i></i><b class="num"></b></div>
          <span class="label" data-fight></span>
        </header>
        <p class="pa-how"><span data-how></span> <span class="dim">${e(ROLE_HOW[me.role])}</span></p>
        <section class="pa-stage" data-stage aria-label="The fight">
          <div class="pa-tags" data-tags aria-hidden="true"></div>
          <div class="du-nums" data-nums aria-hidden="true"></div>
          <div class="pa-status" data-status></div>
          <div class="pa-art" data-art hidden><span class="mu-av art">${MultiUI.LOGO}</span><p data-call></p></div>
          <div class="du-banner" data-banner aria-live="polite"></div>
        </section>
        <section class="du-type" aria-label="Your words">
          <div class="du-chips" data-chips></div>
          <div class="typebox du-words" data-box tabindex="-1">
            <div class="du-line" data-line></div>
            <div class="focus-note"><span class="fn-key">Click here or press any key to type</span><span class="fn-tap">Tap here to type</span></div>
          </div>
        </section>
        <ol class="pa-team" data-team aria-label="Team"></ol>
        <div class="du-strip">
          <span><b class="num" data-s="role"></b></span><span><b class="num" data-s="dmg">0</b> damage</span><span><b class="num" data-s="wpm">0</b> wpm</span>
          <span><b class="num" data-s="acc">100%</b> accuracy</span><span><b class="num" data-tc>0</b> team combo <em data-tm>x1.00</em></span>
          <button class="btn out sm" type="button" data-leave>Leave run</button>
        </div>
        <p class="du-note">Teammates marked Bot are simulated until the server is live.</p>
        <div class="du-end" data-end hidden></div>
      </div>`;
    const stage = el.querySelector('[data-stage]');
    buildTeam();
    scene = PartyScene.mount(stage, {
      now: () => Net.match.clock(),
      color: colorOf,
      lane: id => lanes.get(id) || null,
      onImpact: (h, x, y) => { if (x != null) MultiUI.pop(el.querySelector('[data-nums]'), x, y, String(h.dmg), h.you ? 'out' : 'team'); },
      onFrame: placeTags,
    });
    el.querySelector('[data-leave]').addEventListener('click', () => { Net.match.leave(); Net.lobbies.leave().then(() => { location.hash = '#/party'; browser(); }); });
    ty = NetTypist.create({
      stream: () => { const st = lastState; if (!st || !words.length) return ''; const p = st.players.find(x => x.id === 'me'); return p ? words[p.idx % words.length] || '' : ''; },
      extras: () => targets(),
    });
    const box = el.querySelector('[data-box]');
    keys = TT.captureKeys(box, { label: 'Type the words to attack', onChar: ch => key(ch), onBack: w => key(w ? 'CtrlBackspace' : 'Backspace') });
    onDoc = ev => {
      if (window.RushAudio) RushAudio.unlock();
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.length !== 1) return;
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'view') return;
      ev.preventDefault(); keys.focus(); key(ev.key);
    };
    document.addEventListener('keydown', onDoc);
    onSound = ev => { if (window.RushAudio) RushAudio.setOn(!!(ev.detail && ev.detail.on)); };
    addEventListener('wpm-sound', onSound);
    onResize = () => measureLanes();
    addEventListener('resize', onResize);
    setTimeout(() => keys && keys.focus(), 60);
    el.querySelector('[data-s="role"]').textContent = R().ROLES[me.role].name;
    if (window.RushAudio) RushAudio.unlock();
    const tick = () => { raf = requestAnimationFrame(tick); paint(); };
    raf = requestAnimationFrame(tick);
  }

  // ---------- the team strip: one card per player, under your words ----------
  const lanes = new Map();
  function buildTeam() {
    const ol = el.querySelector('[data-team]');
    ol.innerHTML = run.players.map(p => `<li class="pa-card${p.id === 'me' ? ' is-me' : ''}" data-p="${e(p.id)}" style="--pc:${colorOf(p.id)}">
      <div class="pa-c-top">${MultiUI.img(p, 68, 30)}<span class="pa-c-name">${MultiUI.name(p)}</span><span class="pa-c-role">${UI.icon(ROLE_ICON[p.role])}${e(R().ROLES[p.role].name)}</span></div>
      <div class="pa-hp"><i></i><b class="num"></b></div>
      <div class="pa-c-bot"><span class="pa-handle" data-h></span><span class="pa-c-st" data-st></span></div>
    </li>`).join('');
    measureLanes();
  }
  function measureLanes() {
    const stage = el && el.querySelector('[data-stage]'); if (!stage) return;
    const sr = stage.getBoundingClientRect();
    for (const li of el.querySelectorAll('[data-p]')) { const r = li.getBoundingClientRect(); lanes.set(li.dataset.p, { x: r.left + r.width / 2 - sr.left, y: Math.min(r.top - sr.top, sr.height - 36) }); }
  }
  function paintTeam(st) {
    const me = st.players.find(x => x.id === 'me');
    const typed = ty ? ty.state().typed : '';
    for (const p of st.players) {
      const li = el.querySelector(`[data-p="${CSS.escape(p.id)}"]`); if (!li) continue;
      const f = Math.max(0, Math.min(1, p.hp / (st.maxHp || 100)));
      const aimed = st.attack && (st.attack.target === p.id || st.attack.target === 'team') && !p.down;
      li.classList.toggle('down', p.down);
      li.classList.toggle('low', !p.down && f < 0.35);
      li.classList.toggle('aimed', !!aimed);
      li.classList.toggle('shielded', p.shield);
      const bar = li.querySelector('.pa-hp');
      bar.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
      bar.querySelector('b').textContent = p.down ? '0' : p.hp;
      // what typing this player's handle does for you right now
      let act = '', label = '';
      if (me && !me.down) {
        const healer = me.role === 'support' || !st.players.some(x => x.role === 'support');
        if (p.down && p.id !== 'me') { act = 'revive'; label = 'Revive'; }
        else if (!p.down && healer && p.hp < st.maxHp && me.healIn <= 0) { act = 'heal'; label = 'Heal'; }
        else if (!p.down && me.role === 'guard' && p.id !== 'me' && !p.shield && me.shieldIn <= 0) { act = 'shield'; label = 'Shield'; }
      }
      const on = act && typed && p.handle.startsWith(typed);
      const h = `${label ? `<small>${label}</small>` : ''}<b>${e(p.handle)}</b>`;
      const hs = li.querySelector('[data-h]');
      if (hs.dataset.v !== h) { hs.innerHTML = h; hs.dataset.v = h; }
      hs.className = `pa-handle${act ? ' act ' + act : ''}${on ? ' on' : ''}`;
      let stx = '';
      if (p.down) stx = `Down, back in ${Math.ceil(p.downLeft / 1000)} s`;
      else if (aimed) stx = `Hit in ${Math.max(0, (st.attack.land - st.clock) / 1000).toFixed(1)} s`;
      else if (p.shield) stx = 'Shielded';
      else if (p.target) { const fo = st.foes.find(x => x.id === p.target); if (fo && (fo.kind === 'head' || fo.kind === 'twin')) stx = `On ${fo.name}`; }
      const sx = li.querySelector('[data-st]');
      if (sx.textContent !== stx) sx.textContent = stx;
    }
  }

  // ---------- word tags over the foes ----------
  const tagEls = new Map();
  function paintTags(st) {
    const box = el.querySelector('[data-tags]'); if (!box) return;
    const me = st.players.find(x => x.id === 'me') || {};
    const s = ty ? ty.state() : { typed: '', target: null };
    const want = new Set();
    for (const f of st.foes) {
      if (!f.alive) continue;
      let word = '', cls = '', sub = '';
      if (f.kind === 'mite') { word = f.word; cls = 'mite'; const left = (f.land - st.clock) / 1000; sub = f.lane === 'me' ? 'at you' : (st.players.find(p => p.id === f.lane) || {}).name || ''; if (left < 2.5) cls += ' close'; }
      else if (f.kind === 'car') {
        const cars = st.foes.filter(x => x.kind === 'car' && x.alive);
        const i = cars.indexOf(f);
        if (i < cars.length - 2) continue;
        word = f.word; cls = 'car';
      } else if (f.kind === 'head' && st.boss.kind === 'hydra' || f.kind === 'twin') {
        word = f.name; cls = 'aim' + (me.target === f.id ? ' mine' : '');
        const n = st.players.filter(p => p.target === f.id && !p.down);
        sub = `<span class="pa-tag-hp"><i style="width:${(100 * f.hp / f.maxHp).toFixed(0)}%"></i></span>${n.map(p => `<i class="dot" style="background:${colorOf(p.id)}"></i>`).join('')}`;
      } else continue;
      want.add(f.id);
      let t = tagEls.get(f.id);
      if (!t) { t = document.createElement('div'); t.className = 'pa-tag'; box.append(t); tagEls.set(f.id, t); }
      const mine = s.target && s.target.id && s.target.id.endsWith(':' + f.id);
      const html = `<span class="pa-tag-w">${mine ? letters(word, s.typed) : e(word)}</span>${sub ? `<span class="pa-tag-s">${f.kind === 'mite' ? e(sub) : sub}</span>` : ''}`;
      if (t.dataset.v !== html) { t.innerHTML = html; t.dataset.v = html; }
      t.className = `pa-tag ${cls}${mine ? ' typing' : ''}`;
    }
    for (const [id, t] of tagEls) if (!want.has(id)) { t.remove(); tagEls.delete(id); }
  }
  function placeTags() {
    if (!scene || !tagEls.size) return;
    const at = scene.anchors();
    for (const [id, t] of tagEls) {
      const a = at.get(id);
      if (!a) { t.style.visibility = 'hidden'; continue; }
      t.style.visibility = '';
      t.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  // the words this player may type besides the stream; the rules decide what they do
  function targets() {
    const st = lastState; if (!st || st.phase !== 'fight') return [];
    const p = st.players.find(x => x.id === 'me'); if (!p || p.down) return [];
    const out = [];
    const guardUp = st.players.some(x => x.role === 'guard' && !x.down);
    if (st.attack && (p.role === 'guard' || !guardUp)) out.push({ id: 'counter:' + st.attack.id, word: st.attack.word, kind: 'counter' });
    for (const f of st.foes) if (f.alive && f.kind === 'mite') out.push({ id: 'foe:' + f.id, word: f.word, kind: 'foe' });
    if (st.boss && st.boss.kind === 'snake') for (const f of st.foes.filter(x => x.kind === 'car' && x.alive).slice(-2)) out.push({ id: 'foe:' + f.id, word: f.word, kind: 'foe' });
    if (st.boss && (st.boss.kind === 'hydra' || st.boss.kind === 'twins')) for (const f of st.foes) if (f.alive) out.push({ id: 'aim:' + f.id, word: f.name, kind: 'aim' });
    const healer = p.role === 'support' || !st.players.some(x => x.role === 'support');
    for (const q of st.players) {
      if (q.down && q.id !== 'me') out.push({ id: 'revive:' + q.id, word: q.handle, kind: 'revive' });
      else if (!q.down && healer && q.hp < st.maxHp && p.healIn <= 0) out.push({ id: 'heal:' + q.id, word: q.handle, kind: 'heal' });
      else if (!q.down && p.role === 'guard' && q.id !== 'me' && !q.shield && p.shieldIn <= 0) out.push({ id: 'shield:' + q.id, word: q.handle, kind: 'shield' });
    }
    if (st.buffOffer && p.role === 'support') for (const b of st.buffOffer) out.push({ id: 'buff:' + b, word: R().BUFFS[b].word, kind: 'buff' });
    for (const id of p.offer || []) out.push({ id: 'spell:' + id, word: Combat.spell(id).word, kind: 'spell', spell: id });
    return out;
  }
  const myWords = () => words;

  function key(k) {
    if (view !== 'run' || !lastState || lastState.phase !== 'fight') return;
    const t = Net.match.clock();
    Net.match.input(k, t);
    const r = ty.key(k, t);
    if (r && r.key) TT.click(false);
    const cur = Net.match.current(); if (cur && cur.state) lastState = cur.state;
    paintWords();
    if (lastState) { paintTags(lastState); paintTeam(lastState); }
  }

  // ---------- sound ----------
  let music = '';
  function playMusic(name) { if (!window.RushAudio || music === name) return; music = name; RushAudio.music(name); }
  const sfx = (n, a) => { if (window.RushAudio) RushAudio.play(n, a); };
  const cSfx = (n, a) => { const c = window.RushAudio && RushAudio.combat(); if (c) c.play(n, a); };

  function who(id) { return run.players.find(p => p.id === id) || { id, name: id }; }
  const nameOf = id => (id === 'me' ? 'You' : who(id).name);
  let fightKind = '';
  function event(ev) {
    const now = Net.match.clock();
    const st = lastState;
    switch (ev.type) {
      case 'fight':
        if (ev.phase === 'start') {
          UI.play('party', true);
          if (ev.words) words = ev.words;
          fightKind = ev.kind;
          scene.setFight({ kind: ev.kind, look: ev.look, foes: ev.foes });
          ty.reset();
          for (const t of tagEls.values()) t.remove(); tagEls.clear();
          el.querySelector('[data-how]').textContent = (HOW[ev.kind] || '') + (ev.adds ? ' ' + HOW.mites : '');
          el.querySelector('[data-kind]').textContent = (R().KINDS[ev.kind] || '') + (ev.adds ? ' and mites' : '');
          banner(`${ev.boss}`, 'round', 1800);
          playMusic(MUSIC[ev.look] || 'stage1');
          sfx('roar');
          measureLanes();
        } else {
          scene.clear();
          sfx('defeat');
          if (window.RushAudio) RushAudio.sting();
          banner(ev.fight + 1 < (st ? st.of : 3) ? 'Cleared. Next fight soon.' : 'Run cleared', 'won', 3000);
        }
        break;
      case 'hit': {
        if (ev.kind === 'spell') break;
        const you = ev.id === 'me';
        scene.shot({ id: ev.id, foe: ev.foe, you, dmg: ev.dmg, tier: ev.tier || 0, crit: ev.crit, kind: ev.kind });
        if (you) { if (ev.tier >= 1) cSfx('shot' + Math.min(4, ev.tier)); sfx(ev.crit ? 'crit' : 'hit'); }
        if (st && st.of && ev.bossHp != null && st.fight === st.of - 1 && st.boss && ev.bossHp / st.boss.maxHp < 0.35) playMusic('boss');
        break;
      }
      case 'cast': scene.cast(ev.spell, { from: ev.id, foe: ev.foe, hits: ev.hits.map(h => ({ at: Math.max(0, h.at - now), amount: h.dmg })), effect: ev.effect }); if (ev.id === 'me') { banner(MultiUI.spellName(ev.spell), 'spell mine', 1100); cSfx(ev.spell); } break;
      case 'attack': sfx('windup', Math.min(2.5, (ev.land - ev.start) / 1000)); if (ev.target === 'me' || ev.target === 'team') sfx('warn'); break;
      case 'block': scene.block({ id: ev.id, by: ev.by }); pop(ev.by === 'firewall' ? 'Firewall blocked it' : `${nameOf(ev.by)} blocked it`, 'block'); sfx('blockOk'); break;
      case 'impact': scene.attackLands({ id: ev.id, target: ev.target }); sfx('impact', false); break;
      case 'chip': scene.chip(ev); break;
      case 'hurt':
        if (ev.id === 'me') { const b = el.querySelector('[data-stage]'); b.classList.remove('ouch'); void b.offsetWidth; b.classList.add('ouch'); }
        lanePop(ev.id, `-${ev.dmg}`, ev.shielded ? 'block' : 'in');
        break;
      case 'down': scene.down(ev.id); pop(ev.id === 'me' ? 'You are down. Keep typing to reboot faster.' : `${who(ev.id).name} is down. Type ${who(ev.id).handle || handleOf(ev.id)} to bring them back.`, 'in'); sfx('blockFail'); break;
      case 'up': if (ev.by) pop(`${nameOf(ev.by)} brought ${ev.id === 'me' ? 'you' : who(ev.id).name} back`, 'buff'); lanePop(ev.id, `+${ev.hp}`, 'heal'); scene.heal(ev.id); sfx('milestone'); break;
      case 'heal': scene.heal(ev.id); lanePop(ev.id, `+${ev.amount}`, 'heal'); if (ev.by === 'me' || ev.id === 'me') sfx('weakOpen'); break;
      case 'shield': scene.shield(ev.id); lanePop(ev.id, 'Shield', 'block'); if (ev.by === 'me' || ev.id === 'me') sfx('shieldUp'); break;
      case 'foeGone': scene.foeGone(ev.id, ev.how); if (ev.how === 'pop' || ev.how === 'kill') sfx('addKill'); if (ev.how === 'bite') sfx('projHit'); break;
      case 'foe': if (fightKind === 'swarm') sfx('addSpawn'); break;
      case 'regrow': scene.regrow(ev.id); pop(fightKind === 'twins' ? 'It came back' : 'A head grew back', 'in'); sfx('roar'); break;
      case 'relink': banner('12 s to drop the other one', 'tier', 2200); break;
      case 'weak': if (ev.on) { banner('Core open: double damage', 'tier', 2000); sfx('weakOpen'); } break;
      case 'buff': pop(`${nameOf(ev.by)}: ${R().BUFFS[ev.buff].text}`, 'buff'); sfx('shieldUp'); break;
      case 'late': if (ev.id === 'me') pop('Taken already', 'block'); break;
      case 'art': {
        const box = el.querySelector('[data-art]'); box.hidden = false;
        banner('Art joined your run', 'art', 2600);
        if (window.Toast) Toast('t-level', `${MultiUI.LOGO}<span><b>Art</b> joined your run</span>`, 3500);
        break;
      }
      case 'callout': { const p = el.querySelector('[data-call]'); if (p) { p.textContent = ev.text; p.parentElement.classList.remove('say'); void p.offsetWidth; p.parentElement.classList.add('say'); } break; }
      case 'typo': if (ev.id === 'me') { const b = el.querySelector('[data-box]'); b.classList.remove('slip'); void b.offsetWidth; b.classList.add('slip'); } break;
      default: break;
    }
  }
  const handleOf = id => { const p = lastState && lastState.players.find(x => x.id === id); return p ? p.handle : ''; };
  function pop(text, cls) { const s = el.querySelector('[data-stage]'); MultiUI.pop(el.querySelector('[data-nums]'), s.clientWidth / 2, s.clientHeight * 0.42, text, cls + ' wide'); }
  function lanePop(id, text, cls) { const L = lanes.get(id); if (!L) return; MultiUI.pop(el.querySelector('[data-nums]'), L.x, L.y - 8, text, cls); }
  let bannerT = 0;
  function banner(text, cls, ms) {
    const b = el && el.querySelector('[data-banner]'); if (!b) return;
    b.className = 'du-banner on ' + cls; b.textContent = text;
    clearTimeout(bannerT); bannerT = setTimeout(() => { if (b.isConnected) b.className = 'du-banner'; }, ms);
  }

  let lastPaint = 0;
  function paint() {
    if (view !== 'run' || !el) return;
    const now = performance.now();
    if (now - lastPaint < 70) return;
    lastPaint = now;
    const cur = Net.match.current();
    if (cur && cur.info && cur.info.id === run.id) lastState = cur.state;
    const st = lastState; if (!st) return;
    if (scene) scene.sync(st);
    if (st.boss) {
      el.querySelector('[data-area]').textContent = st.boss.area;
      el.querySelector('[data-boss]').textContent = st.boss.name;
      bar(el.querySelector('[data-bhp]'), st.boss.hp, st.boss.maxHp, UI.fmt(st.boss.hp));
    }
    el.querySelector('[data-fight]').textContent = st.phase === 'count' ? 'Get ready' : `Fight ${Math.max(1, st.fight + 1)} of ${st.of}`;
    el.querySelector('[data-tc]').textContent = st.teamCombo;
    el.querySelector('[data-tm]').textContent = `x${st.teamMult.toFixed(2)}`;
    el.querySelector('[data-tm]').className = st.teamMult > 1 ? 'green' : '';
    paintTeam(st);
    paintTags(st);
    const status = [];
    if (st.weak > 0) status.push(`<span class="pa-st gold">Core open <b class="num">${(st.weak / 1000).toFixed(1)} s</b></span>`);
    if (st.relink > 0) status.push(`<span class="pa-st red">Drop the other one <b class="num">${(st.relink / 1000).toFixed(1)} s</b></span>`);
    if (st.overclock > 0) status.push(`<span class="pa-st cyan">Overclock <b class="num">${(st.overclock / 1000).toFixed(1)} s</b></span>`);
    if (st.firewall) status.push('<span class="pa-st cyan">Firewall up</span>');
    if (st.art) status.push(`<span class="pa-st art">${MultiUI.LOGO}Art is in</span>`);
    const sb = el.querySelector('[data-status]'), sh = status.join('');
    if (sb.dataset.v !== sh) { sb.innerHTML = sh; sb.dataset.v = sh; }
    const mine = st.players.find(p => p.id === 'me');
    if (mine) {
      el.querySelector('[data-s="dmg"]').textContent = UI.fmt(mine.stats.dmg);
      const ms = st.clock > 0 ? st.clock : 1;
      el.querySelector('[data-s="wpm"]').textContent = Math.round(mine.stats.chars / 5 / (ms / 60000)) || 0;
      el.querySelector('[data-s="acc"]').textContent = Math.round(mine.acc) + '%';
      el.querySelector('.pa-run').classList.toggle('me-down', mine.down);
    }
    paintWords(); paintChips();
  }
  function bar(b, v, max, label) {
    if (!b) return;
    const f = Math.max(0, Math.min(1, v / (max || 1)));
    b.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
    b.querySelector('b').textContent = label;
    b.classList.toggle('low', f < 0.3);
  }
  function paintWords() {
    const st = lastState, line = el && el.querySelector('[data-line]');
    if (!st || !line) return;
    const p = st.players.find(x => x.id === 'me'); if (!p) return;
    const list = myWords(); if (!list.length) return;
    const s = ty.state();
    const tg = s.target;
    const cur = tg && tg.kind !== 'stream' ? `<span class="du-w cur ${tg.kind}">${letters(tg.word, s.typed)}</span>` : `<span class="du-w cur">${letters(list[p.idx % list.length], s.typed)}</span>`;
    const next = [];
    for (let n = 1; n < 4; n++) next.push(`<span class="du-w next">${e(list[(p.idx + n) % list.length])}</span>`);
    const html = `<div class="du-cur">${cur}</div><div class="du-next">${next.join('')}</div>`;
    if (line.dataset.v !== html) { line.innerHTML = html; line.dataset.v = html; }
  }
  function letters(w, typed) {
    let out = '';
    for (let i = 0; i < Math.max(w.length, typed.length); i++) {
      const c = w[i], t = typed[i];
      const ch = x => e(x === ' ' ? ' ' : x);
      if (t == null) out += `<i class="${i === typed.length ? 'at' : ''}">${ch(c)}</i>`;
      else out += `<i class="${t === c ? 'ok' : 'bad'}">${ch(c || t)}</i>`;
    }
    return out + (typed.length >= w.length ? '<i class="caret"> </i>' : '');
  }
  function paintChips() {
    const st = lastState, box = el && el.querySelector('[data-chips]');
    if (!st || !box) return;
    const p = st.players.find(x => x.id === 'me'); if (!p) return;
    const typed = ty.state().typed;
    const chips = [];
    const guardUp = st.players.some(x => x.role === 'guard' && !x.down);
    const canCounter = !p.down && (p.role === 'guard' || !guardUp);
    if (st.attack) {
      const left = Math.max(0, (st.attack.land - st.clock) / 1000);
      const at = st.attack.target === 'team' ? 'Everyone' : st.attack.target === 'me' ? 'You' : who(st.attack.target).name;
      chips.push(canCounter
        ? `<span class="mu-chip block${typed && st.attack.word.startsWith(typed) ? ' on' : ''}"><small>Block, hits ${e(at)}</small><b>${e(st.attack.word)}</b><em class="num">${left.toFixed(1)}s</em></span>`
        : `<span class="mu-chip wait"><small>Hit on ${e(at)} in</small><b class="num">${left.toFixed(1)}s</b><em>Your guard blocks it</em></span>`);
    }
    if (p.down) chips.push(`<span class="mu-chip down"><small>You are down</small><b class="num">${Math.ceil(p.downLeft / 1000)}s</b><em>Each clean word takes a second off</em></span>`);
    if (st.buffOffer && p.role === 'support') for (const b of st.buffOffer) chips.push(`<span class="mu-chip buff${typed && R().BUFFS[b].word.startsWith(typed) ? ' on' : ''}"><small>Buff</small><b>${e(R().BUFFS[b].word)}</b><em>${e(R().BUFFS[b].text)}</em></span>`);
    else if (p.role === 'support') chips.push(`<span class="mu-chip meter"><small>Team meter</small><b class="num">${Math.round(st.meter)}%</b></span>`);
    for (const id of p.offer || []) { const sp = Combat.spell(id); chips.push(`<span class="mu-chip r${sp.rarity}${typed && sp.word.startsWith(typed) ? ' on' : ''}" style="--sc:${sp.color}"><small>${e(Combat.RARITY[sp.rarity].name)}</small><b>${e(sp.word)}</b></span>`); }
    const html = chips.join('');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  function end(m) {
    if (endShown) return;
    endShown = true;
    const r = m.result || {};
    const box = el.querySelector('[data-end]'); if (!box) return;
    if (r.left) { stopRun(); browser(); return; }
    const mine = (r.players || []).find(p => p.id === 'me') || {};
    let reward = null;
    if (mine.keys) {
      const accF = Math.max(0, ((mine.acc || 0) - 50) / 50);
      const base = Math.round((mine.chars || 0) / 10 * accF) + r.cleared * 25 + (r.won ? 60 : 0);
      reward = WPM.record({ mode: 'party', wpm: mine.wpm || 0, acc: mine.acc || 0, correct: mine.chars || 0, keys: mine.keys || 0, ms: r.ms || 0, won: !!r.won, cleared: !!r.won, score: mine.dmg || 0,
        coins: Math.round(base * (r.art ? 1.5 : 1)) });
    }
    WPM.track('party_run', { run: run.run, difficulty: run.difficulty, won: !!r.won, cleared: r.cleared, role: mine.role, dmg: mine.dmg || 0, art: !!r.art });
    const lostAt = !r.won && r.fights && r.fights.length ? r.fights[r.fights.length - 1] : null;
    UI.play('party', false);
    if (!r.won) { if (window.RushAudio) RushAudio.stop(); sfx('defeat'); }
    box.hidden = false;
    box.innerHTML = `<div class="panel hot du-end-card" role="dialog" aria-labelledby="pa-end-t">
      <h2 id="pa-end-t" class="${r.won ? 'green' : 'red'}">${r.won ? 'Run cleared' : `The team went down in ${e(lostAt ? lostAt.area : 'the run')}`}</h2>
      <p class="dim">${r.cleared} of ${r.of} fights cleared in ${UI.clock(Math.round((r.ms || 0) / 1000))}. Best team combo ${r.teamBest}.${r.art ? ' Art joined the run and rewards were 1.5 times.' : ''}</p>
      ${reward ? `<p class="dim">You earned ${reward.coins} coins and ${reward.xp} XP.</p>` : ''}
      <div class="du-tw"><table class="du-sum pa-sum"><thead><tr><th scope="col">Player</th><th scope="col">Role</th><th scope="col" class="r">Damage</th><th scope="col" class="r">wpm</th><th scope="col" class="r">Accuracy</th><th scope="col" class="r hide-sm">Healed</th><th scope="col" class="r hide-sm">Blocks</th><th scope="col" class="r hide-sm">Revives</th><th scope="col" class="r hide-sm">Downs</th><th scope="col" class="hide-sm">Spells</th></tr></thead>
        <tbody>${(r.players || []).slice().sort((a, b) => b.dmg - a.dmg).map(p => `<tr class="${p.id === 'me' ? 'is-me' : ''}"><td>${MultiUI.name(who(p.id))}</td><td>${e(R().ROLES[p.role].name)}</td>
          <td class="num r">${UI.fmt(p.dmg)}</td><td class="num r">${p.wpm}</td><td class="num r">${p.acc}%</td><td class="num r hide-sm">${p.healed || 0}</td><td class="num r hide-sm">${p.blocks}</td><td class="num r hide-sm">${p.revives || 0}</td><td class="num r hide-sm">${p.downs || 0}</td>
          <td class="sp hide-sm">${p.spells.length ? p.spells.map(MultiUI.spellName).map(e).join(', ') : 'None'}</td></tr>`).join('')}</tbody></table></div>
      <ol class="pa-fights">${(r.fights || []).map(f => `<li class="${f.won ? 'w' : 'l'}"><b>${e(f.boss)}</b><span class="dim">${e(f.area)}</span><span class="num">${f.won ? UI.clock(Math.round((f.endedAt - f.startedAt) / 1000)) : 'Lost'}</span></li>`).join('')}</ol>
      <div class="row"><button class="btn" type="button" data-back>Back to the lobby</button><a class="btn out" href="#/party" data-out>Leave</a></div>
    </div>`;
    box.querySelector('[data-back]').addEventListener('click', () => lobbyView());
    box.querySelector('[data-out]').addEventListener('click', ev => { ev.preventDefault(); Net.lobbies.leave().then(() => { location.hash = '#/party'; browser(); }); });
    const h = box.querySelector('h2'); h.tabIndex = -1; h.focus({ preventScroll: true });
  }

  function stopRun() {
    cancelAnimationFrame(raf); raf = 0;
    if (scene) { scene.dispose(); scene = null; }
    if (onDoc) { document.removeEventListener('keydown', onDoc); onDoc = null; }
    if (onSound) { removeEventListener('wpm-sound', onSound); onSound = null; }
    if (onResize) { removeEventListener('resize', onResize); onResize = null; }
    if (window.RushAudio) RushAudio.stop();
    UI.play('party', false);
    tagEls.clear(); lanes.clear();
    keys = null; ty = null; run = null; lastState = null;
    clearTimeout(bannerT);
  }
  function unmount() {
    const cur = Net.match.current();
    if (view === 'run' && cur && cur.info && cur.info.kind === 'party' && !endShown) Net.match.leave();
    stopRun();
    off.forEach(f => f()); off = [];
    el = null; view = '';
  }

  return { title: 'Party', mount, update, unmount };
})());
