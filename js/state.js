// Player progress for the standalone site. Everything lives in this browser's
// localStorage under one key until the server exists. Every page and game reads
// and writes progress through window.WPM and never touches localStorage itself.
window.WPM = (() => {
  const KEY = 'wpm-player-v1';
  const ART_BEST = 204;
  // The clock every progress date comes from. Tests set window.__wpmNow to a function
  // returning a timestamp to step through days.
  const now = () => (typeof window.__wpmNow === 'function' ? new Date(window.__wpmNow()) : new Date());
  // Calendar day in the player's own time zone, so a streak day ends at their midnight.
  const day = (d = now()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const blank = () => ({
    profile: { name: 'Guest', avatar: 0, joined: day(), theme: 'terminal' },
    coins: 500,                 // starting coins so the shop is usable on day one
    xp: 0,
    sessions: [],               // newest last, capped at 500
    best: {},                   // best wpm per mode key, e.g. { 'time-60': 132, 'horde-1': 9800 }
    days: [],                   // ISO dates with at least one session, for the streak
    achievements: {},           // id -> ISO date unlocked
    owned: ['desk-basic', 'chair-basic', 'monitor-basic', 'keyboard-basic'],
    room: null,                 // room layout, written by the room editor
    totals: { keys: 0, correct: 0, words: 0, ms: 0 },
    learn: {},                  // academy progress and free typing coins, see js/app/learn.js
    prog: {},                   // sign-in streak, tasks, counters and visual bonuses, owned by js/app/progress.js
    keyStats: {},               // per expected key: [typed right, missed], summed over every run that sends keyStats
  });

  let data;
  try { data = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { data = blank(); }
  // a save the browser refuses (private browsing, full storage) is shown once, so nobody
  // plays on thinking their coins are kept
  let saveFailed = false;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); saveFailed = false; }
    catch (e) { if (!saveFailed) { saveFailed = true; console.warn('progress not saved', e); emit('save-failed', e); } }
  };

  // ---------- events ----------
  const subs = {};
  function on(ev, fn) { (subs[ev] ||= []).push(fn); return () => { subs[ev] = subs[ev].filter(f => f !== fn); }; }
  function emit(ev, payload) { (subs[ev] || []).forEach(f => { try { f(payload); } catch (e) { console.error(e); } }); }

  // ---------- progress events ----------
  // Every mode reports what the player did with WPM.track(name, payload). Daily tasks and
  // achievements listen for these and never for the pages themselves. A mode calls
  // WPM.events.register(name) when its script loads so tasks for it join the daily draw.
  // PROGRESS.md lists the names and payloads.
  const known = new Set();
  const events = {
    register(...names) { for (const n of names.flat()) if (n && !known.has(n)) { known.add(n); emit('event-registered', n); } },
    known: n => (n === undefined ? [...known] : known.has(n)),
  };
  function track(name, payload = {}) {
    events.register(name);
    const e = { name, ...payload, at: now().toISOString() };
    emit('track', e);
    return e;
  }

  // ---------- levels ----------
  // Level n needs 100 * n^1.5 XP more than level n-1.
  const need = n => Math.round(100 * Math.pow(n, 1.5));
  function levelInfo(xp = data.xp) {
    let lvl = 1, left = xp;
    while (left >= need(lvl)) { left -= need(lvl); lvl++; }
    return { level: lvl, into: left, next: need(lvl) };
  }

  // ---------- coins ----------
  function addCoins(n, reason) {
    n = Math.round(n);
    if (!n) return data.coins;
    data.coins = Math.max(0, data.coins + n); save();
    emit('coins', { coins: data.coins, delta: n, reason });
    return data.coins;
  }
  function spend(n) {
    if (data.coins < n) return false;
    addCoins(-n, 'shop');
    return true;
  }

  function addXP(n) {
    const before = levelInfo().level;
    data.xp += Math.round(n); save();
    const after = levelInfo().level;
    if (after > before) { emit('level', { level: after }); addCoins(after * 50, 'level up'); }
    return levelInfo();
  }

  // ---------- sessions ----------
  // Call once at the end of any typing run.
  // run: { mode: 'time-60' | 'words-50' | 'quote' | 'race' | 'horde-3' | ..., wpm, acc (0-100), correct (chars), keys, ms, score?, difficulty? }
  // Returns { coins, xp, newBest, unlocked: [achievement ids] }.
  function record(run) {
    const today = day();
    const words = run.correct / 5;
    const s = { ...run, at: now().toISOString() };
    // run.keyStats ({ key: [right, missed] }) goes into the all-time key totals, and the
    // session keeps only the misses as kmiss so 500 saved runs stay small
    if (run.keyStats) {
      const ks = (data.keyStats ||= {}), miss = {};
      for (const [k, [ok, bad]] of Object.entries(run.keyStats)) {
        const t = (ks[k] ||= [0, 0]); t[0] += ok || 0; t[1] += bad || 0;
        if (bad) miss[k] = bad;
      }
      delete s.keyStats;
      s.kmiss = miss;
    }
    data.sessions.push(s);
    if (data.sessions.length > 500) data.sessions.splice(0, data.sessions.length - 500);
    data.totals.keys += run.keys || 0;
    data.totals.correct += run.correct || 0;
    data.totals.words += Math.round(words);
    data.totals.ms += run.ms || 0;
    if (!data.days.includes(today)) data.days.push(today);
    const metric = run.score !== undefined ? run.score : run.wpm;
    // Breach runs on Easy or Hard keep their own best, so Normal keeps the plain mode key
    const bestKey = run.difficulty && run.difficulty !== 'normal' ? `${run.mode}:${run.difficulty}` : run.mode;
    const newBest = !(data.best[bestKey] >= metric);
    if (newBest) data.best[bestKey] = metric;
    // rewards: 1 coin per 2 correct words, scaled by accuracy, plus a bonus for a new best
    const accF = Math.max(0, (run.acc - 50) / 50);
    // run.coins, when given, replaces the formula (the academy and free typing set their own)
    const base = run.coins !== undefined ? Math.round(run.coins) : Math.round(words / 2 * accF) + (newBest ? 25 : 0);
    // CTRL clearance: +5% from CL-02, +10% from CL-05 (js/app/ops.js)
    const coins = Math.round(base * (window.Ops ? Ops.coinMult() : 1));
    const xp = Math.round(words * accF * 2 + (run.wpm || 0) / 4);
    save();
    addCoins(coins, 'typing');
    addXP(xp);
    const unlocked = [];
    const offA = on('achievement', a => unlocked.push(a.id));
    track('run', { ...s, newBest });
    offA();
    emit('session', { run: s, coins, xp, newBest, unlocked });
    return { coins, xp, newBest, unlocked };
  }

  // ---------- streak ----------
  function streak() {
    const set = new Set(data.days);
    const d = now();
    const iso = day;
    if (!set.has(iso(d))) d.setDate(d.getDate() - 1);   // today not played yet still keeps yesterday's streak
    let n = 0;
    while (set.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    const week = [];
    const w = now();
    for (let i = 6; i >= 0; i--) { const x = new Date(w); x.setDate(w.getDate() - i); week.push({ date: iso(x), played: set.has(iso(x)) }); }
    return { days: n, week };
  }

  // ---------- stats ----------
  function stats() {
    const typed = data.sessions.filter(s => s.wpm);
    const bestWpm = typed.reduce((m, s) => Math.max(m, s.wpm), 0);
    const avg = typed.length ? Math.round(typed.slice(-20).reduce((a, s) => a + s.wpm, 0) / Math.min(20, typed.length)) : 0;
    const acc = data.totals.keys ? Math.round(1000 * data.totals.correct / data.totals.keys) / 10 : 0;
    const bestAcc = typed.reduce((m, s) => Math.max(m, s.acc || 0), 0);
    return { bestWpm, avgWpm: avg, accuracy: acc, bestAcc, sessions: data.sessions.length, ...data.totals, artBest: ART_BEST };
  }

  // ---------- achievements ----------
  // The list and the checks live in js/app/progress.js, which hands them over with
  // WPM.useAchievements({ list }). Unlocks are stored here as id -> date.
  let achList = () => [];
  function useAchievements(p) { achList = p.list; }
  function unlock(id, meta = { id }, quiet = false) {
    if (data.achievements[id]) return false;
    data.achievements[id] = day(); save();
    if (!quiet) emit('achievement', { id, ...meta });
    return true;
  }
  const unlockedOn = id => data.achievements[id] || null;
  const achievements = () => achList();

  // ---------- inventory and room ----------
  function owns(id) { return data.owned.includes(id); }
  function buy(item) {
    if (owns(item.id)) return { ok: false, reason: 'owned' };
    if (!spend(item.price)) return { ok: false, reason: 'coins' };
    data.owned.push(item.id); save();
    emit('inventory', { id: item.id });
    track('item_buy', { id: item.id, price: item.price });
    return { ok: true };
  }
  // An item given for free, such as a gift.
  function grant(id, reason = 'gift') {
    if (owns(id)) return false;
    data.owned.push(id); save();
    emit('inventory', { id, reason });
    return true;
  }
  function getRoom() { return data.room; }
  function setRoom(room) { data.room = room; save(); emit('room', room); track('room_save', { items: room && Array.isArray(room.items) ? room.items.length : 0 }); }

  // ---------- profile ----------
  function profile() { return { ...data.profile }; }
  function setProfile(p) { data.profile = { ...data.profile, ...p }; save(); emit('profile', data.profile); }

  // ---------- academy ----------
  // { lessons: { id: { stars, wpm, acc } }, open, placement, layout, free: { day, coins } }
  function learn() { return JSON.parse(JSON.stringify(data.learn || {})); }
  function setLearn(patch) { data.learn = { ...(data.learn || {}), ...patch }; save(); emit('learn', learn()); }

  // ---------- mode data ----------
  // A mode's own saved data that is not a run, such as the Boss Rush scoreboard and its
  // director's model. Stored in the same save under modes[name].
  function modeData(name) { const m = data.modes && data.modes[name]; return m === undefined ? null : JSON.parse(JSON.stringify(m)); }
  function setModeData(name, value) { data.modes = { ...(data.modes || {}), [name]: value }; save(); emit('mode-data', { name }); }

  function reset() { data = blank(); save(); emit('reset', null); }
  function exportData() { return JSON.stringify(data); }

  // The progress module's own saved state. It changes the object and then calls saveProgress().
  const progress = () => (data.prog ||= {});

  return {
    ART_BEST, on, record, track, events, now, day, progress, saveProgress: save,
    useAchievements, unlock, unlockedOn, grant, stats, streak, levelInfo, achievements,
    coins: () => data.coins, addCoins, spend, addXP, xp: () => data.xp,
    owns, buy, owned: () => [...data.owned], getRoom, setRoom,
    profile, setProfile, sessions: () => [...data.sessions], best: () => ({ ...data.best }),
    reset, exportData, learn, setLearn,
    modeData, setModeData,
    keyStats: () => JSON.parse(JSON.stringify(data.keyStats || {})),
  };
})();
