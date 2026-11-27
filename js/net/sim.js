// The simulated backend: a stand-in server that runs in this browser until the real one
// exists. It runs every duel and party run with the same rules files a server would
// (DuelRules, PartyRules), fills the other seats with bots (NetBot) and keeps this
// player's duel and party record in localStorage. Every simulated player has bot: true
// and the pages label them as bots.
//
// NetSim.create(host) -> the backend object js/net/net.js calls. host gives it the clock,
// word lists, the player's level and storage.
(function (root) {
  const STORE = 'wpm-net-sim-v1';
  const { rng, pick, between, hash } = root.NetCore;

  // ---------- simulated players ----------
  const PRE = ['kbd', 'key', 'swift', 'tap', 'click', 'byte', 'pixel', 'glyph', 'echo', 'nova', 'rune', 'vex', 'zen', 'lumen', 'flux', 'neon', 'quill', 'rapid'];
  const SUF = ['mira', 'juno', 'rex', 'kai', 'sol', 'ivy', 'nox', 'lark', 'fen', 'ash', 'bo', 'tem', 'rin', 'pao', 'nok', 'ploy', 'jun', 'tala', 'mika', 'dex'];
  const COUNTRIES = ['TH', 'TH', 'TH', 'PH', 'PH', 'US', 'US', 'ID', 'VN', 'MY', 'IN', 'BR', 'JP', 'KR', 'GB', 'DE', 'MX', 'CA', 'AU', 'SG'];
  function handle(r) {
    const n = r() < 0.5 ? String(Math.floor(r() * 90) + 10) : '';
    return `${pick(r, PRE)}_${pick(r, SUF)}${n}`;
  }
  const ROOM = {
    desk: ['desk-basic', 'desk-walnut', 'desk-standing', 'desk-command'],
    chair: ['chair-basic', 'chair-ergo', 'chair-gaming'],
    monitor: ['monitor-basic', 'monitor-27', 'monitor-ultra', 'monitor-dual'],
    keyboard: ['keyboard-basic', 'kb-aula-f99', 'kb-womier-sk61he', 'kb-loga-yaksa', 'kb-attackshark-x68he', 'kb-corsair-vanguard96', 'kb-chilkey-sf60'],
    extra: ['pc-tower', 'pc-white', 'laptop', 'headphone-stand', 'mic-arm', 'cat', 'astronaut', 'book-stack', 'keycap-jar', 'desk-lamp', 'lantern', 'lava-lamp',
      'led-strip', 'hex-panels', 'neon-sign', 'monstera', 'snake-plant', 'pothos', 'cactus', 'pegboard', 'bookshelf', 'shelf-industrial', 'wall-shelf',
      'poster-logo', 'poster-mountain', 'rug-laurel', 'rug-round', 'rug-shag', 'beanbag'],
  };
  const MODES = ['Typing test', 'Race', 'Breach', 'World boss', 'Duels', 'Party runs'];

  function simProfile(id, hint = {}) {
    const r = rng('p:' + id);
    const wpm = hint.wpm || Math.round(32 + Math.pow(r(), 1.4) * 128);
    const acc = Math.round((0.9 + r() * 0.085) * 1000) / 1000;
    const level = Math.max(2, Math.round(wpm / 7 + r() * 9));
    const runs = Math.round(level * (6 + r() * 14));
    const modes = {};
    let left = runs;
    MODES.forEach((m, i) => { const n = i === MODES.length - 1 ? left : Math.round(left * (0.15 + r() * 0.4)); modes[m] = n; left -= n; });
    const duels = modes.Duels;
    const rating = root.NetRating.ofBot(wpm, acc) + Math.round((r() - 0.5) * 120);
    const wins = Math.round(duels * Math.min(0.85, Math.max(0.15, 0.5 + (rating - 1350) / 900)));
    const owned = [pick(r, ROOM.desk), pick(r, ROOM.chair), pick(r, ROOM.monitor), pick(r, ROOM.keyboard)];
    const extra = ROOM.extra.slice().sort(() => r() - 0.5).slice(0, Math.min(ROOM.extra.length, 3 + Math.floor(level / 3)));
    const size = level > 22 ? 'room-l' : level > 12 ? 'room-m' : 'room-s';
    const month = 1 + Math.floor(r() * 10);
    return {
      id, name: id, bot: true, country: hint.country || pick(r, COUNTRIES), level,
      joined: `2026-${String(month).padStart(2, '0')}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`,
      lookSeed: 'bot:' + id,
      stats: { bestWpm: Math.round(wpm * (1.06 + r() * 0.1)), avgWpm: wpm, acc: Math.round(acc * 1000) / 10, runs, modes, achievements: Math.min(40, 2 + Math.floor(level * 0.9 + r() * 6)) },
      duel: { rating, games: duels, wins, losses: duels - wins, bestStreak: Math.max(wins ? 1 : 0, Math.round(Math.sqrt(wins) * (0.8 + r()))), vsArt: { w: 0, l: Math.floor(r() * 4) } },
      room: { size, owned: [...owned, ...extra, ...(size !== 'room-s' ? [size] : [])], preset: Math.floor(r() * 3) },
      typing: { wpm, acc },
    };
  }
  const ART = {
    id: 'art', name: 'Art', art: true, bot: true, country: 'TH', level: 99, joined: '2026-01-01', handle: '@10000wpm',
    stats: { bestWpm: 204, avgWpm: 204, acc: 98.5, runs: null, modes: null, achievements: null },
    duel: { rating: 2400, games: null, wins: null, losses: null, bestStreak: null, vsArt: null },
    room: null, typing: { wpm: 204, acc: 0.985 },
  };

  function create(host) {
    const T = host.test;
    const emit = host.emit;
    const now = () => host.now();
    let me = null, timer = 0, presence = [], lobbies = [], lobby = null, session = null, challenges = new Map();
    let presT = 0, lobT = 0, uid = 0;
    const sr = rng('sim:' + Math.floor(Date.now() / 3.6e6));      // the online list changes every hour
    const nid = p => `${p}${(++uid).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const wait = (ms, v) => new Promise(res => setTimeout(() => res(v), ms));
    const delay = (a, b) => (T.fast ? 30 : a + Math.random() * (b - a));

    // ---------- storage: what the server would keep for this player ----------
    const blankRec = () => ({
      duel: { rating: root.NetRating.START, games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, vsArt: { w: 0, l: 0 }, history: [], opps: {} },
      party: { runs: 0, wins: 0, best: 0, history: [] },
      visits: {},
    });
    let rec = { ...blankRec(), ...host.store.get(STORE, {}) };
    const save = () => host.store.set(STORE, rec);

    // ---------- presence ----------
    function makePresence() {
      const n = 14 + Math.floor(sr() * 10);
      const out = [];
      for (let i = 0; i < n; i++) {
        const name = handle(sr);
        if (out.some(x => x.id === name)) continue;
        const p = simProfile(name);
        out.push({ id: name, name, bot: true, status: pick(sr, ['idle', 'idle', 'idle', 'duel', 'run', 'typing']), rating: p.duel.rating, level: p.level, country: p.country });
      }
      return out;
    }
    function stirPresence() {
      for (const p of presence) if (Math.random() < 0.25) p.status = pick(Math.random, ['idle', 'idle', 'duel', 'run', 'typing']);
      emit('presence', presence.map(p => ({ ...p })));
    }

    // ---------- lobbies (other people's) ----------
    function botMember(r, role) {
      const name = handle(r);
      const p = simProfile(name);
      return { id: name, name, bot: true, role: role || pick(r, ['striker', 'guard', 'support']), ready: r() < 0.6, level: p.level, rating: p.duel.rating, typing: p.typing };
    }
    function makeLobbies() {
      const r = rng('lob:' + Math.floor(Date.now() / 6e5));
      const out = [];
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) out.push(oneLobby(r, i, 1 + Math.floor(r() * 4)));
      return out;
    }
    function oneLobby(r, i, size) {
      const roles = ['guard', 'support', 'striker', 'striker'];
      const players = Array.from({ length: size }, (_, k) => botMember(r, roles[k]));
      return { id: 'L' + hash('l' + i + players[0].id).toString(36), name: `${players[0].name}'s run`, host: players[0].id, run: pick(r, ['relay', 'relay', 'deep', 'mixed']), difficulty: pick(r, ['easy', 'normal', 'normal', 'hard']), players, max: 4, status: size === 4 && r() < 0.5 ? 'running' : 'open', chat: [] };
    }
    const summary = l => ({ id: l.id, name: l.name, host: l.host, hostName: (l.players.find(p => p.id === l.host) || {}).name, run: l.run, difficulty: l.difficulty, players: l.players.map(p => ({ id: p.id, name: p.name, bot: p.bot, role: p.role })), count: l.players.length, max: l.max, status: l.status, art: false });
    const full = l => l && { ...summary(l), players: l.players.map(p => ({ ...p })), chat: l.chat.slice(-50), you: 'me', isHost: l.host === 'me' };

    // ---------- chat lines for bots: short, friendly, nothing a teen site would hide ----------
    const LINES = {
      join: ['hi', 'hey all', 'yo', 'hello', 'hi, I can guard', 'support here', 'ready when you are', 'first run today'],
      ready: ['ready', 'set', 'good to go', 'ready, go when you want'],
      reply: { hi: 'hey', hello: 'hi', hey: 'hey', gg: 'gg', ready: 'same', go: 'go go', thanks: 'np', ty: 'np', wp: 'wp' },
      end: ['gg', 'gg wp', 'nice run', 'that last fight was close', 'again?'],
    };
    function say(l, p, text) {
      if (!l) return;
      const m = { id: nid('m'), from: p ? p.id : null, name: p ? p.name : null, bot: p ? !!p.bot : false, system: !p, text, at: Date.now() };
      l.chat.push(m); if (l.chat.length > 80) l.chat.shift();
      if (l === lobby) emit('chat', m);
    }
    function lobbyChanged() { if (lobby) emit('lobby', full(lobby)); }

    // ---------- the loop ----------
    function loop() {
      const t = now();
      if (session) session.pump(t);
      if (t - presT > 15000) { presT = t; stirPresence(); }
      if (t - lobT > 6000) { lobT = t; stirLobbies(); }
      if (lobby && lobby.tick) lobby.tick(t);
    }
    function startLoop() { if (!timer) timer = setInterval(loop, 33); }
    function stirLobbies() {
      let changed = false;
      for (const l of lobbies) {
        if (l === lobby) continue;
        if (l.status === 'open' && l.players.length < 4 && Math.random() < 0.2) { l.players.push(botMember(Math.random)); changed = true; }
        else if (l.status === 'open' && l.players.length > 1 && Math.random() < 0.08) { l.players.pop(); changed = true; }
        else if (l.status === 'running' && Math.random() < 0.1) { l.status = 'open'; changed = true; }
        else if (l.status === 'open' && l.players.length === 4 && Math.random() < 0.3) { l.status = 'running'; changed = true; }
      }
      if (changed) emit('lobbies', lobbies.map(summary));
    }

    // ---------- duels ----------
    function botFor(profile, seed) {
      if (profile.art) return root.NetBot.create({ ...root.NetBot.ART, tape: root.NetBot.ART_TAPE, seed });
      const t = profile.typing;
      return root.NetBot.create({ wpm: T.botWpm || t.wpm, acc: t.acc, seed, spell: 0.55 + Math.min(0.35, t.wpm / 400) });
    }
    function viewOf(m, i) {
      const st = m.state(), s = st.sides[i];
      const words = m.words(st.round);
      const offers = (s.offer || []).slice().sort((a, b) => root.Combat.spell(b).rarity - root.Combat.spell(a).rarity).map(id => root.Combat.spell(id).word);
      return { phase: st.phase, stream: words[s.idx % Math.max(1, words.length)] || '', typed: s.typed || '', offers, offerId: s.offerUntil, locked: s.locked, fog: s.fog };
    }

    function duelSession(info, players, sides) {
      const cfg = { ...(T.hp ? { hp: T.hp } : {}), ...(T.roundMs ? { roundMs: T.roundMs } : {}), ...(T.breakMs != null ? { breakMs: T.breakMs } : {}), ...(T.startMs != null ? { startMs: T.startMs } : {}), ...(T.offerMs ? { offerMs: T.offerMs } : {}) };
      const lists = Array.from({ length: 6 }, (_, r) => r ? host.words(`${info.seed}:${r}`, { count: 160, difficulty: info.difficulty }) : []);
      const m = root.DuelRules.match({ seed: info.seed, words: r => lists[r] || lists[1], config: cfg });
      info.words = lists; info.config = m.cfg;
      // the clock holds at 0 until every side has loaded the arena and said ready, so nobody's
      // countdown starts while their machine is still busy. A bot is ready after a short load;
      // the player (or a spectator) sends match.ready. A side that never loads cancels the duel.
      let t0 = 0, waiting = true;
      const made = now();
      const ready = sides.map(b => (b ? made + delay(600, 1800) : 0));   // bots: the time they finish loading
      const isReady = i => (sides[i] ? now() >= ready[i] : ready[i] === true);
      const watcher = { ready: info.you >= 0 };   // a spectator's own client loads too
      const bots = sides.map((b, i) => (b ? botFor(players[i], `${info.seed}:bot${i}`) : null));
      let lastState = -1e9, ended = false;
      const loadState = () => ({ ...m.state(), phase: 'load', clock: 0, ready: [0, 1].map(isReady) });
      const S = {
        kind: 'duel', info, m,
        get t0() { return t0; },
        clock: () => (waiting ? 0 : now() - t0),
        ready() {
          if (info.you >= 0) ready[info.you] = true; else watcher.ready = true;
          S.pump(now());
        },
        stepBots(t) {
          // a bot plans one word per step, so a slow or throttled loop asks it again until it is caught up
          bots.forEach((b, i) => { if (!b) return; for (let n = 0; n < 12; n++) { const ks = b.step(t, viewOf(m, i)); if (!ks.length) break; for (const k of ks) m.input(i, k.k, k.t); } });
        },
        pump(tn) {
          if (ended) return;
          if (waiting) {
            if ([0, 1].every(isReady) && watcher.ready) {
              waiting = false; t0 = tn;
              emit('match', { type: 'state', id: info.id, kind: 'duel', state: m.state() });
            } else {
              if (tn - made > (T.loadMs || 30000)) { ended = true; return finish({ winner: -1, cancelled: true, reason: 'load', wins: [0, 0], rounds: [], sides: [{}, {}] }); }
              if (tn - lastState >= 250) { lastState = tn; emit('match', { type: 'state', id: info.id, kind: 'duel', state: loadState() }); }
              return;
            }
            lastState = -1e9;
          }
          const t = tn - t0;
          S.stepBots(t);
          m.advance(t);
          if (t - lastState >= 100) { lastState = t; emit('match', { type: 'state', id: info.id, kind: 'duel', state: m.state() }); }
        },
        input(k, t) {
          if (ended || waiting || info.you < 0) return;
          const tn = now() - t0;
          t = Math.min(tn, Math.max(0, t == null ? tn : t));
          S.stepBots(t);
          m.input(info.you, k, t);
        },
        state: () => (waiting ? loadState() : m.state()),
        leave() {
          if (ended) return;
          ended = true;
          // leaving before the countdown is a cancel, not a loss
          if (waiting) return finish({ winner: -1, cancelled: true, reason: 'left', wins: [0, 0], rounds: [], sides: [{}, {}] });
          const st = m.state();
          finish({ winner: info.you >= 0 ? 1 - info.you : -1, forfeit: info.you, wins: st.wins, rounds: [], sides: [{}, {}] });
        },
      };
      m.on(ev => {
        emit('match', { type: 'event', id: info.id, kind: 'duel', ev });
        if (ev.type === 'end') { ended = true; finish(m.result()); }
      });
      function finish(result) {
        let rating = null;
        if (info.you >= 0 && !result.cancelled) rating = recordDuel(info, players, result);
        const out = { type: 'end', id: info.id, kind: 'duel', result, rating, log: m.log, verified: true };
        emit('match', out);
        session = null;
        if (info.challenge) setChallenge(info.challenge, 'done');
      }
      return S;
    }

    function recordDuel(info, players, result) {
      const d = rec.duel, opp = players[1 - info.you];
      const before = d.rating;
      const score = result.winner === -1 ? 0.5 : result.winner === info.you ? 1 : 0;
      const oppRating = opp.art ? root.NetRating.ART : opp.rating;
      const u = root.NetRating.update(before, oppRating, score, d.games);
      d.rating = u.rating; d.games++;
      if (score === 1) { d.wins++; d.streak = Math.max(0, d.streak) + 1; d.bestStreak = Math.max(d.bestStreak, d.streak); }
      else if (score === 0) { d.losses++; d.streak = 0; }
      else { d.draws = (d.draws || 0) + 1; }
      if (opp.art) { if (score === 1) d.vsArt.w++; else if (score === 0) d.vsArt.l++; }
      const o = d.opps[opp.id] || { id: opp.id, name: opp.name, bot: !!opp.bot, art: !!opp.art, rating: oppRating, w: 0, l: 0 };
      o.rating = oppRating; if (score === 1) o.w++; else if (score === 0) o.l++;
      d.opps[opp.id] = o;
      const mine = result.sides && result.sides[info.you] || {};
      d.history.push({ at: new Date().toISOString(), id: info.id, mode: info.mode, opp: { id: opp.id, name: opp.name, bot: !!opp.bot, art: !!opp.art, rating: oppRating }, score, wins: result.wins, delta: d.rating - before, rating: d.rating, wpm: mine.wpm || 0, acc: mine.acc || 0, forfeit: result.forfeit != null });
      if (d.history.length > 60) d.history.shift();
      save();
      return { before, after: d.rating, delta: d.rating - before };
    }

    function opponentFor(mode, oppId, salt = '') {
      if (mode === 'art') return Promise.resolve(ART);
      if (mode === 'player' && oppId) return getProfile(oppId);
      const L = host.level();
      // salt: watch mode draws two bots in the same millisecond, which would make them the same bot
      const r = rng('q:' + Date.now() + salt);
      // matchmaking is by MMR: a bot within 100 of the player's, typing at the speed that MMR stands for
      const target = Math.max(600, rec.duel.rating + Math.round((r() - 0.5) * 200));
      const acc = Math.max(0.86, Math.min(0.99, L.acc + (r() - 0.5) * 0.03));
      const wpm = Math.max(20, Math.min(230, Math.round(root.NetRating.wpmFor(target, acc))));
      const p = simProfile(handle(r), { wpm });
      p.typing = { wpm, acc };
      p.duel.rating = root.NetRating.ofBot(wpm, acc);
      return Promise.resolve(p);
    }
    const pub = p => ({ id: p.id, name: p.name, bot: !!p.bot, art: !!p.art, rating: p.art ? root.NetRating.ART : p.duel.rating, level: p.level, country: p.country, lookSeed: p.lookSeed || null, wpm: p.typing ? p.typing.wpm : null });

    async function queue({ mode = 'quick', opponent, challenge } = {}) {
      if (session) session.leave();
      // placement: a first duel starts from the MMR the player's typing stands for, not a flat 1200,
      // so a fast typist isn't matched with slow bots for their first twenty games
      if (!rec.duel.games && !rec.duel.placed) { const L = host.level(); rec.duel.rating = Math.max(800, Math.min(1800, root.NetRating.ofBot(L.wpm, L.acc))); rec.duel.placed = true; save(); }
      const id = nid('D');
      const seed = id + ':' + Date.now();
      await wait(T.search != null ? T.search : mode === 'quick' ? delay(1200, 2600) : delay(300, 700));
      let players, you = 0, sides;
      if (mode === 'watch') {
        const a = await opponentFor('quick', null, ':a');
        let b = await opponentFor('quick', null, ':b');
        for (let i = 0; b.name === a.name && i < 5; i++) b = await opponentFor('quick', null, ':b' + i);
        players = [pub(a), pub(b)]; you = -1; sides = [true, true];
        players.forEach((p, i) => { p.typing = [a, b][i].typing; });
      } else {
        const o = await opponentFor(mode, opponent);
        const meP = { id: 'me', name: me.name, bot: false, rating: rec.duel.rating, level: host.local().level || 1 };
        players = [meP, pub(o)]; players[1].typing = o.typing; sides = [false, true];
      }
      // harder words for faster pairs: the slower typist's level sets the difficulty
      const slow = Math.min(...players.map(p => (p.typing ? p.typing.wpm : host.level().wpm)));
      const difficulty = slow > 110 ? [3, 7] : slow > 70 ? [2, 6] : [1, 5];
      const info = { id, kind: 'duel', mode, seed, you, players, difficulty, challenge: challenge || null, startedAt: Date.now() };
      // what a win, a draw or a loss would do to the player's MMR, shown before the countdown
      if (you >= 0) {
        const opp = players[1 - you], oppR = opp.art ? root.NetRating.ART : opp.rating;
        info.stakes = Object.fromEntries([['win', 1], ['draw', 0.5], ['loss', 0]].map(([k, sc]) => [k, root.NetRating.update(rec.duel.rating, oppR, sc, rec.duel.games).delta]));
      }
      session = duelSession(info, players, sides);
      startLoop();
      emit('match', { type: 'start', ...info, state: session.state() });
      return info;
    }

    // ---------- party lobbies and runs ----------
    function myLobby(opts) {
      const l = { id: nid('L'), name: opts.name || `${me.name}'s run`, host: 'me', run: opts.run || 'relay', difficulty: opts.difficulty || 'normal', max: 4, status: 'open', chat: [],
        players: [{ id: 'me', name: me.name, bot: false, role: 'striker', ready: false, level: host.local().level || 1 }] };
      let nextJoin = now() + (T.join != null ? T.join : delay(1500, 3500));
      l.tick = t => {
        if (l.status !== 'open') return;
        if (l.players.length < l.max && t >= nextJoin && !l.closed) {
          const have = l.players.map(p => p.role);
          const role = ['guard', 'support', 'striker'].find(x => !have.includes(x)) || 'striker';
          const L = host.level();
          const b = botMember(Math.random, role);
          b.typing = { wpm: Math.max(25, Math.round(L.wpm * (0.85 + Math.random() * 0.3))), acc: Math.min(0.98, L.acc + (Math.random() - 0.5) * 0.04) };
          b.ready = false;
          l.players.push(b);
          say(l, null, `${b.name} (bot) joined as ${root.PartyRules.ROLES[role].name.toLowerCase()}.`);
          if (Math.random() < 0.5) setTimeout(() => say(l, b, pick(Math.random, LINES.join)), delay(600, 1800));
          setTimeout(() => { if (l.players.includes(b)) { b.ready = true; lobbyChanged(); } }, delay(800, 2600));
          nextJoin = t + (T.join != null ? T.join : delay(2500, 6000));
          lobbyChanged();
        }
      };
      return l;
    }
    function joinLobby(l) {
      l.players.push({ id: 'me', name: me.name, bot: false, role: ['guard', 'support', 'striker'].find(x => !l.players.some(p => p.role === x)) || 'striker', ready: false, level: host.local().level || 1 });
      l.players.forEach(p => { if (p.bot) { p.ready = true; if (!p.typing) p.typing = simProfile(p.id).typing; } });
      l.tick = t => {
        if (l.status !== 'open' || l.starting) return;
        const all = l.players.every(p => p.ready);
        if (all) {
          l.starting = true;
          const hostP = l.players.find(p => p.id === l.host);
          say(l, hostP, 'starting');
          setTimeout(() => { if (lobby === l && l.players.every(p => p.ready)) startRun(l); else l.starting = false; }, delay(1500, 2500));
        }
      };
      setTimeout(() => { const h = l.players.find(p => p.id === l.host); if (lobby === l && h) say(l, h, pick(Math.random, LINES.join)); }, delay(500, 1200));
    }

    function partySession(l) {
      const seed = l.id + ':' + Date.now();
      const r = rng(seed);
      const R = T.partyFights ? { fights: T.partyFights } : root.PartyRules.RUNS[l.run];
      const artChance = T.artChance != null ? T.artChance : 0.35;
      const art = r() < artChance ? { fight: T.artFight != null ? T.artFight : Math.min(R.fights.length - 1, r() < 0.6 ? 1 : Math.floor(r() * R.fights.length)), ms: T.artMs || 4000 + r() * 6000 } : null;
      const L = host.level();
      const diff = { easy: [1, 4], normal: [2, 5], hard: [3, 7] }[l.difficulty] || [2, 5];
      const lists = new Map();
      const words = (pid, f) => {
        const k = pid + ':' + f;
        if (!lists.has(k)) lists.set(k, host.words(`${seed}:${k}`, { count: 160, difficulty: [diff[0] + (f > 2 ? 1 : 0), diff[1] + (f > 1 ? 1 : 0)] }));
        return lists.get(k);
      };
      const counters = f => { const k = 'c:' + f; if (!lists.has(k)) lists.set(k, host.words(`${seed}:${k}`, { count: 30, difficulty: [2, 6], theme: 'cyber' })); return lists.get(k); };
      // mite and car words: short, so a mite can be popped before it lands
      const foeWords = f => { const k = 'm:' + f; if (!lists.has(k)) lists.set(k, host.words(`${seed}:${k}`, { count: 80, difficulty: [1, 4] }).filter(w => w.length >= 3 && w.length <= 7)); return lists.get(k); };
      // CTRL divisions: yours from your profile, each bot's from its seed
      const DIVS = root.Combat && root.Combat.Perks ? root.Combat.Perks.DIVISIONS.map(d => d.id) : [];
      const divOf = p => (p.id === 'me' ? (root.Ops && root.Ops.perks()) || {} : DIVS.length ? { division: DIVS[Math.floor(root.NetCore.rng(seed + ':div:' + p.id)() * DIVS.length)], rank: 1 } : {});
      const players = l.players.map(p => ({ id: p.id, name: p.name, role: p.role, bot: !!p.bot, ...divOf(p) }));
      const run = root.PartyRules.run({ seed, run: l.run, difficulty: l.difficulty, players, words, counters, foeWords, art, fights: T.partyFights, lit: ['me'], config: { ...(T.partyStartMs != null ? { startMs: T.partyStartMs } : {}), ...(T.clearMs != null ? { clearMs: T.clearMs } : {}), ...(T.teamHp ? { teamHp: T.teamHp } : {}) } });
      if (T.bossHp) { const orig = run.advance; let set = -1; run.advance = t => { orig(t); const st = run.state(); if (st.phase === 'fight' && st.fight !== set) { set = st.fight; run.debug.bossHp(T.bossHp); } }; }
      const bots = new Map(l.players.filter(p => p.bot).map(p => [p.id, root.NetBot.create({ wpm: T.partyBotWpm || (p.typing ? p.typing.wpm : L.wpm), acc: p.typing ? p.typing.acc : 0.94, seed: seed + p.id, spell: 0.6, guard: 0.82 })]));
      const info = { id: nid('P'), kind: 'party', seed, run: l.run, difficulty: l.difficulty, lobby: l.id, players: l.players.map(p => ({ id: p.id, name: p.name, role: p.role, bot: !!p.bot, level: p.level })), you: 'me', art: !!art, startedAt: Date.now() };
      const t0 = now();
      let lastState = -1e9, ended = false;
      const view = id => root.PartyRules.view(run.state(), id, run.words(id));
      const S = {
        kind: 'party', info, run, t0,
        clock: () => now() - t0,
        stepBots(t) { for (const [id, b] of bots) for (let n = 0; n < 12; n++) { const ks = b.step(t, view(id)); if (!ks.length) break; for (const k of ks) run.input(id, k.k, k.t); } },
        pump(tn) {
          if (ended) return;
          const t = tn - t0;
          S.stepBots(t);
          run.advance(t);
          if (t - lastState >= 100) { lastState = t; emit('match', { type: 'state', id: info.id, kind: 'party', state: run.state() }); }
        },
        input(k, t) {
          if (ended) return;
          const tn = now() - t0;
          t = Math.min(tn, Math.max(0, t == null ? tn : t));
          S.stepBots(t);
          run.input('me', k, t);
        },
        state: () => run.state(),
        leave() { if (ended) return; ended = true; session = null; emit('match', { type: 'end', id: info.id, kind: 'party', result: { won: false, left: true, players: [] } }); },
      };
      run.on(ev => {
        // each client gets its own word stream with the fight start, as a server would send it
        emit('match', { type: 'event', id: info.id, kind: 'party', ev: ev.type === 'fight' && ev.phase === 'start' ? { ...ev, words: run.words('me') } : ev });
        if (ev.type === 'end') {
          ended = true;
          const p = rec.party;
          p.runs++; if (ev.won) p.wins++;
          p.best = Math.max(p.best, ev.cleared);
          const mine = ev.players.find(x => x.id === 'me') || {};
          p.history.push({ at: new Date().toISOString(), run: l.run, difficulty: l.difficulty, won: ev.won, cleared: ev.cleared, of: ev.of, art: ev.art, role: mine.role, dmg: mine.dmg, wpm: mine.wpm, acc: mine.acc, team: ev.players.map(x => ({ name: x.name, bot: x.bot, role: x.role, dmg: x.dmg })) });
          if (p.history.length > 40) p.history.shift();
          save();
          emit('match', { type: 'end', id: info.id, kind: 'party', result: run.result() });
          session = null;
          l.status = 'open'; l.starting = false;
          l.players.forEach(x => { x.ready = !!x.bot; });
          setTimeout(() => { const b = l.players.find(x => x.bot); if (lobby === l && b) say(l, b, pick(Math.random, LINES.end)); }, delay(1200, 2500));
          lobbyChanged();
        }
      });
      return S;
    }

    function startRun(l) {
      if (session) session.leave();
      l.status = 'running';
      session = partySession(l);
      startLoop();
      lobbyChanged();
      emit('match', { type: 'start', ...session.info, state: session.state() });
      return session.info;
    }

    // ---------- profiles ----------
    async function communityHint(id) {
      try {
        if (!root.Community || !root.Community.isDemo()) return {};
        const { snap } = await root.Community.load();
        const c = snap.countries.find(x => x.top && x.top.name === id);
        return c ? { wpm: c.top.wpm, country: c.code } : {};
      } catch (e) { return {}; }
    }
    async function getProfile(id) {
      if (id === 'me') return { ...host.local(), duel: duelPublic() };
      if (id === 'art') return { ...ART };
      if (!/^[a-z0-9_]{3,24}$/i.test(id)) throw new Error('No player with that id.');
      return simProfile(id, await communityHint(id));
    }
    const duelPublic = () => { const d = rec.duel; return { rating: d.rating, games: d.games, wins: d.wins, losses: d.losses, bestStreak: d.bestStreak, vsArt: { ...d.vsArt } }; };

    // ---------- challenges ----------
    function setChallenge(id, status, extra = {}) {
      const c = challenges.get(id);
      if (!c) return null;
      Object.assign(c, { status, ...extra });
      emit('challenge', { ...c });
      return c;
    }

    // ---------- the shared room's chat (js/net/chat-sim.js) ----------
    // the Party finder posts come from these lobbies
    let api = null;
    const chat = root.NetChatSim ? root.NetChatSim.create(host, {
      simProfile, handle,
      lobbyList: () => lobbies.filter(l => l.host !== 'me').map(summary),
      myLobby: () => (lobby && lobby.host === 'me' ? summary(lobby) : null),
      addLobby() {
        if (lobbies.length >= 12) { const i = lobbies.findIndex(l => l !== lobby); if (i >= 0) lobbies.splice(i, 1); }
        lobbies.push(oneLobby(Math.random, Date.now(), 1 + Math.floor(Math.random() * 3)));
        emit('lobbies', lobbies.map(summary));
      },
      createLobby: o => api.lobbies.create(o),
    }) : null;

    // ---------- friends and private messages (js/net/friends-sim.js) ----------
    const social = root.NetFriendsSim ? root.NetFriendsSim.create(host, { simProfile, handle }) : null;

    // ---------- party invites: a simulated player answers after a moment ----------
    function invite(to) {
      if (!lobby) { lobby = myLobby({}); say(lobby, null, 'Lobby open. Empty seats fill with bots until real players can join.'); lobbyChanged(); }
      const l = lobby;
      if (l.players.some(p => p.id === to)) return Promise.reject(new Error('Already in your party.'));
      if (l.players.length >= l.max) return Promise.reject(new Error('Your party is full.'));
      if (l.status !== 'open') return Promise.reject(new Error('Your party is in a run.'));
      const sp = simProfile(to);
      const inv = { id: nid('I'), to, toName: to, toBot: true, lobby: l.id, status: 'pending', at: Date.now() };
      emit('invite', { ...inv });
      setTimeout(() => {
        const yes = T.inviteAccept != null ? T.inviteAccept : Math.random() < 0.8;
        if (yes && lobby === l && l.status === 'open' && l.players.length < l.max && !l.players.some(p => p.id === to)) {
          const have = l.players.map(p => p.role);
          const role = ['guard', 'support', 'striker'].find(x => !have.includes(x)) || 'striker';
          const b = { id: to, name: to, bot: true, role, ready: false, level: sp.level, rating: sp.duel.rating, typing: sp.typing };
          l.players.push(b);
          say(l, null, `${to} (bot) joined as ${root.PartyRules.ROLES[role].name.toLowerCase()}.`);
          setTimeout(() => { if (l.players.includes(b)) { b.ready = true; lobbyChanged(); } }, delay(800, 2000));
          lobbyChanged();
          emit('invite', { ...inv, status: 'accepted' });
        } else {
          emit('invite', { ...inv, status: 'declined', reason: lobby === l ? 'busy' : 'closed' });
        }
      }, T.answer != null ? T.answer : delay(1200, 2800));
      return Promise.resolve({ ...inv });
    }

    // ---------- the backend object ----------
    return api = {
      connect(m) {
        me = m;
        if (!presence.length) presence = makePresence();
        if (!lobbies.length) lobbies = makeLobbies();
        startLoop();
        return Promise.resolve({ id: 'me', name: me.name, sim: true });
      },
      disconnect() {
        if (chat) chat.leave();
        if (session) session.leave();
        if (lobby) { lobby.closed = true; lobby = null; }
        clearInterval(timer); timer = 0;
      },
      reset() { rec = blankRec(); host.store.del(STORE); },
      chat,
      friends: social && social.friends,
      dm: social && social.dm,
      presence: () => presence.map(p => ({ ...p })),
      lobbies: {
        list: () => Promise.resolve(lobbies.map(summary)),
        invite,
        create(o) {
          if (lobby) this.leave();
          lobby = myLobby(o);
          say(lobby, null, 'Lobby open. Empty seats fill with bots until real players can join.');
          lobbyChanged();
          return Promise.resolve(full(lobby));
        },
        join(id) {
          const l = lobbies.find(x => x.id === id);
          if (!l) return Promise.reject(new Error('That lobby has closed.'));
          if (l.status !== 'open' || l.players.length >= l.max) return Promise.reject(new Error('That lobby is full.'));
          if (lobby) this.leave();
          lobby = l; joinLobby(l);
          lobbyChanged();
          return Promise.resolve(full(l));
        },
        leave() {
          if (session && session.kind === 'party') session.leave();
          if (lobby) {
            const l = lobby;
            l.players = l.players.filter(p => p.id !== 'me');
            l.closed = l.host === 'me';
            if (l.host === 'me') lobbies = lobbies.filter(x => x !== l);
            lobby = null;
            emit('lobby', null);
          }
          return Promise.resolve();
        },
        ready(on) {
          if (!lobby) return Promise.reject(new Error('You are not in a lobby.'));
          const p = lobby.players.find(x => x.id === 'me'); p.ready = on;
          lobbyChanged();
          return Promise.resolve(full(lobby));
        },
        setRole(role) {
          if (!lobby || !root.PartyRules.ROLES[role]) return Promise.reject(new Error('Pick striker, guard or support.'));
          lobby.players.find(x => x.id === 'me').role = role;
          lobbyChanged();
          return Promise.resolve(full(lobby));
        },
        kick(id) {
          if (!lobby || lobby.host !== 'me') return Promise.reject(new Error('Only the host can remove players.'));
          const p = lobby.players.find(x => x.id === id);
          if (!p || id === 'me') return Promise.reject(new Error('No such player in the lobby.'));
          lobby.players = lobby.players.filter(x => x !== p);
          say(lobby, null, `${p.name} was removed from the lobby.`);
          lobbyChanged();
          return Promise.resolve(full(lobby));
        },
        setRun(o) {
          if (!lobby || lobby.host !== 'me') return Promise.reject(new Error('Only the host can pick the run.'));
          if (o.run && root.PartyRules.RUNS[o.run]) lobby.run = o.run;
          if (o.difficulty && root.PartyRules.DIFF[o.difficulty]) lobby.difficulty = o.difficulty;
          lobbyChanged();
          return Promise.resolve(full(lobby));
        },
        chat(text) {
          if (!lobby) return Promise.reject(new Error('You are not in a lobby.'));
          const meP = lobby.players.find(p => p.id === 'me');
          say(lobby, meP, text);
          const key = Object.keys(LINES.reply).find(k => new RegExp(`\\b${k}\\b`, 'i').test(text));
          const b = lobby.players.find(p => p.bot);
          if (key && b && Math.random() < 0.8) setTimeout(() => say(lobby, b, LINES.reply[key]), delay(700, 1800));
          return Promise.resolve(lobby.chat[lobby.chat.length - 1]);
        },
        start() {
          if (!lobby || lobby.host !== 'me') return Promise.reject(new Error('Only the host can start the run.'));
          if (!lobby.players.every(p => p.ready)) return Promise.reject(new Error('Wait until everyone is ready.'));
          return Promise.resolve(startRun(lobby));
        },
        current: () => full(lobby),
      },
      match: {
        queue: o => (o && o.mode === 'party' ? Promise.reject(new Error('Start a party run from a lobby.')) : queue(o)),
        input: (k, t) => { if (session) session.input(k, t); },
        ready: () => { if (session && session.ready) session.ready(); },
        leave() { if (session) session.leave(); return Promise.resolve(); },
        current: () => (session ? { info: session.info, state: session.state(), words: session.kind === 'party' ? session.run.words('me') : undefined } : null),
        clock: () => (session ? session.clock() : 0),
      },
      results: {
        record: () => Promise.resolve({ ...rec.duel, history: rec.duel.history.slice(), vsArt: { ...rec.duel.vsArt }, opps: undefined }),
        party: () => Promise.resolve({ ...rec.party, history: rec.party.history.slice() }),
        opponents: () => Promise.resolve(Object.values(rec.duel.opps).map(o => ({ ...o }))),
      },
      profiles: {
        get: getProfile,
        async visit(id) {
          const profile = await getProfile(id);
          if (id !== 'me') { rec.visits[id] = (rec.visits[id] || 0) + 1; save(); }
          return { profile, room: profile.room };
        },
        online: () => Promise.resolve(presence.map(p => ({ ...p }))),
      },
      challenges: {
        async send(to) {
          const p = await getProfile(to);
          const c = { id: nid('C'), from: 'me', fromName: me.name, to: p.id, toName: p.name, toBot: !!p.bot, status: 'pending', at: Date.now() };
          challenges.set(c.id, c);
          emit('challenge', { ...c });
          // a simulated player answers after a moment; now and then they are busy
          setTimeout(() => {
            const cur = challenges.get(c.id);
            if (!cur || cur.status !== 'pending') return;
            const yes = p.art || T.accept === true || (T.accept !== false && Math.random() < 0.85);
            setChallenge(c.id, yes ? 'accepted' : 'declined', yes ? {} : { reason: 'busy' });
          }, T.answer != null ? T.answer : delay(1200, 2800));
          return { ...c };
        },
        accept(id) { const c = setChallenge(id, 'accepted'); return c ? Promise.resolve({ ...c }) : Promise.reject(new Error('That challenge has expired.')); },
        decline(id) { const c = setChallenge(id, 'declined'); return c ? Promise.resolve({ ...c }) : Promise.reject(new Error('That challenge has expired.')); },
        // the sim sends you a challenge from an online bot; the duel page asks for one while you wait there
        incoming(fromId) {
          const from = fromId || (presence.find(p => p.status === 'idle') || presence[0] || {}).id;
          if (!from) return null;
          const c = { id: nid('C'), from, fromName: from, fromBot: true, to: 'me', toName: me ? me.name : 'you', status: 'pending', at: Date.now() };
          challenges.set(c.id, c);
          emit('challenge', { ...c });
          setTimeout(() => { const cur = challenges.get(c.id); if (cur && cur.status === 'pending') setChallenge(c.id, 'expired'); }, 30000);
          return { ...c };
        },
      },
      _session: () => session,
      _lobby: () => lobby,
    };
  }

  root.NetSim = { create, simProfile, ART, handle };
})(globalThis);
