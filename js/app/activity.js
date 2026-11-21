// What is happening in Keyspace right now, and every day since launch. The home map reads
// it; nothing else writes to it. Community.MODE (js/app/community.js) switches it too:
//   'demo'  simulated from the same seeded countries as the map, labelled "Demo data"
//   'live'  reads the server described in NET.md under "Activity"
//
// Activity.attach(snap)  start from a Community snapshot (countries and players)
// Activity.now()         -> { online, inBoss, inDuel, duels, inParty, inRush, inChat, typing, wordsToday, wordsTotal, wpmAvg }
//                           inChat is the number chatting in Open Port (#/commons)
// Activity.boss()        -> { hp, max, region: { name, lon, lat }, participants, defeatsToday }
// Activity.on(ev, fn)    -> unsubscribe. ev: 'tick' (once a second), 'hit', 'duel-start', 'duel-end',
//                           'party', 'rush', 'chat', 'defeat', 'respawn', 'milestone'
// Activity.typingIn()    -> Set of country codes with someone typing right now
// Activity.pause() / resume()  stop the clock while the map is hidden; resume catches up
// Activity.history()     -> [Day] from day 1 to today, Day = { day, date, players, countries,
//                           peakOnline, words, wordsTotal, defeats, duels, parties, newPlayers }
// Activity.snapAt(day)   -> a Community-shaped snapshot of that day, for the time-lapse
// Activity.reached(day)  -> { nodes: [node], beacons: Set(code) } milestones reached by that day
window.Activity = (() => {
  const CFG = window.KEYSPACE || { launchDate: '2026-01-26', beaconPlayers: 100, nodes: [] };
  const LAUNCH_DATE = CFG.launchDate;
  const BOSS_HP = 4000000;        // the community's shared Syntax Error, separate from one player's fight
  const DMG_PER_WORD = 12;        // about 5 letters at the combat layer's average x2.4
  const STREAM_DAY = 212;         // the day Art streamed the site and sign-ups spiked
  // where Syntax Error can surface; one a day, seeded by the date
  const REGIONS = [
    { name: 'the North Atlantic', lon: -38, lat: 48, side: 'l' }, { name: 'Siberia', lon: 96, lat: 63, side: 'r' },
    { name: 'the Arabian Sea', lon: 63, lat: 13, side: 'l' }, { name: 'Greenland', lon: -42, lat: 64, side: 'r' },
    { name: 'Central Asia', lon: 70, lat: 46, side: 'r' }, { name: 'the Indian Ocean', lon: 74, lat: -34, side: 'l' },
    { name: 'the North Pacific', lon: -160, lat: 14, side: 'r' },
  ];
  const PRE = ['kbd', 'key', 'swift', 'tap', 'click', 'byte', 'pixel', 'glyph', 'echo', 'nova', 'rune', 'vex', 'zen', 'lumen', 'flux', 'neon', 'quill', 'rapid'];
  const SUF = ['mira', 'juno', 'rex', 'kai', 'sol', 'ivy', 'nox', 'lark', 'fen', 'ash', 'bo', 'tem', 'rin', 'pao', 'nok', 'ploy', 'jun', 'tala', 'mika', 'dex'];

  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const R = rng(Date.now() & 0xffffff);
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayNo = (d = new Date()) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.parse(LAUNCH_DATE + 'T00:00:00Z')) / 864e5) + 1;
  const dateOf = n => { const d = new Date(LAUNCH_DATE + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n - 1); return d.toISOString().slice(0, 10); };
  const seedOf = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const regionOn = (date, n = 0) => REGIONS[(seedOf(date) + n * 3) % REGIONS.length];

  // Bangkok hour, since most players are in Southeast Asia; 1 at 21:00, 0 at 09:00
  const bkkHour = (t = Date.now()) => ((t / 36e5 + 7) % 24 + 24) % 24;
  const curve = h => 0.5 + 0.5 * Math.cos((h - 21) / 24 * Math.PI * 2);

  // ---------- state ----------
  const subs = {};
  function on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); }
  function emit(ev, x) { (subs[ev] || []).forEach(f => { try { f(x); } catch (e) { console.error(e); } }); }

  let snap = null, hist = null, last = 0, timer = 0, paused = true, drift = 0, wpmDrift = 0, tickAcc = 0;
  const N = { online: 0, inBoss: 0, inDuel: 0, duels: 0, inParty: 0, inRush: 0, inChat: 0, typing: 0, wordsToday: 0, wordsTotal: 0, wpmAvg: 71 };
  let boss = null, today = '', typingSet = new Set(), duels = [], reachedNodes = 0;

  const total = () => snap ? snap.countries.reduce((n, c) => n + c.players, 0) : 0;
  const share = t => 0.08 + 0.07 * curve(bkkHour(t)) + drift;
  function mix(t) {
    const tot = total();
    N.online = Math.max(1, Math.round(tot * share(t)));
    N.inBoss = Math.round(N.online * 0.32);
    N.duels = Math.round(N.online * 0.05);
    N.inDuel = N.duels * 2;
    N.inParty = Math.round(N.online * 0.07);
    N.inRush = Math.round(N.online * 0.05);
    N.inChat = Math.round(N.online * 0.11);
    N.typing = Math.round(N.online * 0.55);
    N.wpmAvg = Math.round(71 + wpmDrift);
  }
  const wordsPerSec = t => total() * share(t) * 0.55 * (71 + wpmDrift) / 60;
  // words typed since Bangkok midnight, one-minute steps
  function wordsSinceMidnight(t) {
    const mins = Math.floor(bkkHour(t) * 60);
    let w = 0;
    for (let m = 0; m < mins; m++) w += wordsPerSec(t - (mins - m) * 60000) * 60;
    return w;
  }

  // ---------- names: the multiplayer layer's simulated players when it is loaded ----------
  function player(countryHint) {
    let name = `${PRE[Math.floor(R() * PRE.length)]}_${SUF[Math.floor(R() * SUF.length)]}${R() < 0.5 ? Math.floor(R() * 90) + 10 : ''}`;
    let country = countryHint || weighted().code;
    if (window.NetSim && NetSim.handle && window.NetCore) {
      try { name = NetSim.handle(R); country = NetSim.simProfile(name).country; } catch (e) {}
    }
    if (!snap.countries.some(c => c.code === country)) country = weighted().code;
    return { id: name, name, country };
  }
  function weighted() {
    let x = R() * total();
    for (const c of snap.countries) { x -= c.players; if (x <= 0) return c; }
    return snap.countries[0];
  }

  // ---------- the boss ----------
  function spawn(n, t) {
    const date = ymd(new Date(t));
    const region = regionOn(date, n);
    boss = { n, date, region, max: BOSS_HP, hp: BOSS_HP, participants: N.inBoss, spawnedAt: t, defeatsToday: n };
  }
  function bossStart(t) {
    // the fight in progress: today's defeats so far and how far into the current one
    const fights = wordsSinceMidnight(t) * 0.32 * DMG_PER_WORD / BOSS_HP;
    spawn(Math.floor(fights), t);
    boss.hp = Math.max(1, Math.round(BOSS_HP * (1 - (fights % 1))));
    boss.participants = Math.round(N.inBoss * (1 + (fights % 1) * 6));
  }

  // ---------- one step of the clock ----------
  function step(dt, t, quiet) {
    const d = ymd(new Date(t));
    if (d !== today) { today = d; N.wordsToday = 0; if (!quiet) spawn(0, t); }
    drift = Math.max(-0.012, Math.min(0.012, drift + (R() - 0.5) * 0.0006 * dt));
    wpmDrift = Math.max(-4, Math.min(4, wpmDrift + (R() - 0.5) * 0.08 * dt));
    mix(t);
    const words = wordsPerSec(t) * dt;
    N.wordsToday += words; N.wordsTotal += words;
    // milestones
    while (CFG.nodes[reachedNodes] && N.wordsTotal >= CFG.nodes[reachedNodes].words) {
      const node = CFG.nodes[reachedNodes++];
      if (!quiet) emit('milestone', { kind: 'node', node, index: reachedNodes });
    }
    // the boss loses what its fighters deal
    let dmg = N.inBoss * (N.wpmAvg / 60) * DMG_PER_WORD * dt;
    boss.participants = Math.min(Math.round(total() * 0.8), boss.participants + Math.round(N.inBoss * dt / 45 + (R() < dt / 3 ? 1 : 0)));
    while (dmg >= boss.hp) {
      dmg -= boss.hp;
      const players = boss.participants, from = boss.region;
      if (!quiet) emit('defeat', { players, region: from });
      spawn(boss.n + 1, t);
      if (!quiet) emit('respawn', { region: boss.region });
    }
    boss.hp -= dmg;
    if (quiet) return;
    // things worth a line in the feed or a mark on the map
    const p = (rate) => R() < rate * dt;
    if (p(Math.min(6, N.inBoss / 15))) {
      const who = player();
      const wpm = Math.round(Math.max(35, Math.min(198, N.wpmAvg + (R() - 0.4) * 60)));
      emit('hit', { ...who, wpm, dmg: Math.round(wpm / 60 * DMG_PER_WORD * (50 + R() * 60)), feed: R() < 0.07 });
    }
    if (p(N.duels / 90) && duels.length < 6) {
      const a = player(), b = player();
      if (a.country !== b.country || R() < 0.3) {
        const du = { id: 'u' + Math.floor(R() * 1e9).toString(36), a, b, ends: t + (40 + R() * 70) * 1000 };
        duels.push(du); emit('duel-start', du);
      }
    }
    duels = duels.filter(du => {
      if (t < du.ends) return true;
      const aw = 60 + Math.round(R() * 60), bw = aw - 2 - Math.round(R() * 18);
      const win = R() < 0.5;
      emit('duel-end', { ...du, winner: win ? du.a : du.b, loser: win ? du.b : du.a, w: aw, l: Math.max(30, bw) });
      return false;
    });
    if (p(N.inParty / 4 / 900)) {
      const size = 2 + Math.floor(R() * 3), who = Array.from({ length: size }, () => player());
      emit('party', { size, players: who, countries: [...new Set(who.map(x => x.country))] });
    }
    if (p(N.inRush / 600)) emit('rush', { ...player(), bosses: 4 + Math.floor(R() * R() * 22) });
    if (p(1 / 75)) emit('chat', { people: N.inChat });
    tickAcc += dt;
    if (tickAcc >= 1) {
      tickAcc = 0;
      // who is typing: a country with k players online has someone typing with high odds
      typingSet = new Set();
      for (const c of snap.countries) {
        const k = c.players * share(t) * 0.55;
        if (R() < 1 - Math.exp(-k)) typingSet.add(c.code);
      }
      emit('tick', now());
    }
  }

  function loop() {
    const t = Date.now();
    const dt = Math.min(1, (t - last) / 1000);
    last = t;
    step(dt, t, false);
  }

  // ---------- history: one record a day ----------
  function buildHistory() {
    const days = Math.max(1, dayNo());
    const r = rng(10301);
    const cs = snap.countries.slice().sort((a, b) => b.players - a.players);
    // day each country got its first player: Thailand and a handful on day 1, the rest later
    const first = new Map();
    cs.forEach((c, i) => {
      const d = c.code === 'TH' || i < 4 ? 1 : Math.min(days, 2 + Math.floor(Math.pow(i / cs.length, 1.3) * days * 0.85 * (0.6 + r() * 0.6)));
      first.set(c.code, d);
    });
    const start = c => c.code === 'TH' ? 8 : 2;
    const at = (c, d) => {
      const s = first.get(c.code);
      if (d < s) return 0;
      if (d >= days) return c.players;
      let g = Math.pow((d - s + 1) / (days - s + 1), 1.7);
      if (d >= STREAM_DAY && s <= STREAM_DAY) g = Math.min(1, g + 0.07 * (1 - g) + 0.03);
      return Math.min(c.players, Math.max(start(c), Math.round(c.players * g)));
    };
    const out = [];
    let cum = 0;
    const beaconDay = new Map();
    for (let d = 1; d <= days; d++) {
      const counts = cs.map(c => [c.code, at(c, d)]).filter(x => x[1] > 0);
      const players = counts.reduce((n, x) => n + x[1], 0);
      for (const [code, n] of counts) if (n >= CFG.beaconPlayers && !beaconDay.has(code)) beaconDay.set(code, d);
      const date = dateOf(d), wd = new Date(date + 'T00:00:00Z').getUTCDay();
      const weekend = wd === 0 || wd === 6 ? 1.22 : 1, stream = d === STREAM_DAY ? 1.6 : 1;
      const avgOnline = players * 0.115 * weekend * stream;
      const words = Math.round(avgOnline * 0.55 * 70 * 1440 * (0.9 + r() * 0.2));
      cum += words;
      out.push({ day: d, date, players, countries: counts.length, counts, peakOnline: Math.round(players * 0.15 * weekend * stream),
        words, wordsTotal: cum, defeats: Math.floor(words * 0.32 * DMG_PER_WORD / BOSS_HP), duels: Math.round(players * 0.5 * weekend * (0.85 + r() * 0.3)),
        parties: Math.round(players * 0.12 * weekend), newPlayers: d === 1 ? players : players - out[d - 2].players, demo: true });
    }
    hist = { days: out, beaconDay };
  }

  // ---------- public ----------
  function attach(s) {
    snap = s;
    if (Community.MODE !== 'demo') return;   // live: see NET.md; the map shows what the server sends
    const t = Date.now();
    buildHistory();
    today = ymd(new Date(t));
    mix(t);
    N.wordsToday = wordsSinceMidnight(t);
    const h = hist.days;
    N.wordsTotal = (h.length > 1 ? h[h.length - 2].wordsTotal : 0) + N.wordsToday;
    // today's record grows with the live count
    h[h.length - 1].words = Math.round(N.wordsToday); h[h.length - 1].wordsTotal = Math.round(N.wordsTotal);
    reachedNodes = CFG.nodes.filter(n => N.wordsTotal >= n.words).length;
    bossStart(t);
    last = t;
  }
  function now() { return { ...N, wordsToday: Math.floor(N.wordsToday), wordsTotal: Math.floor(N.wordsTotal), demo: Community.MODE === 'demo' }; }
  function pause() { if (paused) return; paused = true; clearInterval(timer); }
  function resume() {
    if (!paused || !snap || Community.MODE !== 'demo') return;
    paused = false;
    // catch up on the time away in one quiet step a second at a time, so counts never go back
    const t = Date.now();
    let gone = (t - last) / 1000;
    let tt = last;
    while (gone > 1) { tt += 1000; step(1, tt, true); gone -= 1; }
    last = t;
    timer = setInterval(loop, 250);
  }
  function snapAt(day) {
    const d = hist && hist.days[Math.max(0, Math.min(hist.days.length - 1, day - 1))];
    if (!d) return snap;
    const you = snap.countries.find(c => c.you);
    return { demo: true, day: d.day, countries: d.counts.map(([code, players]) => {
      const now = snap.countries.find(c => c.code === code);
      return { code, players, top: now && now.top && players > 5 ? now.top : null, you: !!(you && you.code === code) };
    }) };
  }
  function reached(day) {
    const d = hist && hist.days[Math.max(0, Math.min(hist.days.length - 1, (day || hist.days.length) - 1))];
    const words = !hist || !day || day >= hist.days.length ? N.wordsTotal : d.wordsTotal;
    const beacons = new Set();
    if (hist) for (const [code, bd] of hist.beaconDay) if (!day || bd <= day) beacons.add(code);
    return { nodes: CFG.nodes.filter(n => words >= n.words), beacons };
  }

  return {
    LAUNCH_DATE, BOSS_HP, REGIONS, attach, now, on, pause, resume, snapAt, reached,
    boss: () => boss && { ...boss, hp: Math.max(0, Math.round(boss.hp)) },
    typingIn: () => typingSet,
    duelsNow: () => duels.slice(),
    history: () => hist ? hist.days : [],
    dayNo, regionOn,
    // for screenshots and tests: bring the boss close to its end
    debugNearDefeat() { if (boss) boss.hp = Math.min(boss.hp, N.inBoss * (N.wpmAvg / 60) * DMG_PER_WORD * 1.5); },
  };
})();
