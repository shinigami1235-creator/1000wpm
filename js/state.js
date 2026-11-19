// Player progress for the standalone site. Everything lives in this browser's
// localStorage under one key until the server exists. Every page and game reads
// and writes progress through window.WPM and never touches localStorage itself.
window.WPM = (() => {
  const KEY = 'wpm-player-v1';
  const ART_BEST = 204;
  // Calendar day in the player's own time zone, so a streak day ends at their midnight.
  const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  });

  let data;
  try { data = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { data = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };

  // ---------- events ----------
  const subs = {};
  function on(ev, fn) { (subs[ev] ||= []).push(fn); return () => { subs[ev] = subs[ev].filter(f => f !== fn); }; }
  function emit(ev, payload) { (subs[ev] || []).forEach(f => { try { f(payload); } catch (e) { console.error(e); } }); }

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
  // run: { mode: 'time-60' | 'words-50' | 'quote' | 'race' | 'horde-3' | ..., wpm, acc (0-100), correct (chars), keys, ms, score? }
  // Returns { coins, xp, newBest, unlocked: [achievement ids] }.
  function record(run) {
    const today = day();
    const words = run.correct / 5;
    const s = { ...run, at: new Date().toISOString() };
    data.sessions.push(s);
    if (data.sessions.length > 500) data.sessions.splice(0, data.sessions.length - 500);
    data.totals.keys += run.keys || 0;
    data.totals.correct += run.correct || 0;
    data.totals.words += Math.round(words);
    data.totals.ms += run.ms || 0;
    if (!data.days.includes(today)) data.days.push(today);
    const metric = run.score !== undefined ? run.score : run.wpm;
    const newBest = !(data.best[run.mode] >= metric);
    if (newBest) data.best[run.mode] = metric;
    // rewards: 1 coin per 2 correct words, scaled by accuracy, plus a bonus for a new best
    const accF = Math.max(0, (run.acc - 50) / 50);
    const coins = Math.round(words / 2 * accF) + (newBest ? 25 : 0);
    const xp = Math.round(words * accF * 2 + (run.wpm || 0) / 4);
    save();
    addCoins(coins, 'typing');
    addXP(xp);
    const unlocked = checkAchievements(s);
    emit('session', { run: s, coins, xp, newBest, unlocked });
    return { coins, xp, newBest, unlocked };
  }

  // ---------- streak ----------
  function streak() {
    const set = new Set(data.days);
    const d = new Date();
    const iso = day;
    if (!set.has(iso(d))) d.setDate(d.getDate() - 1);   // today not played yet still keeps yesterday's streak
    let n = 0;
    while (set.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    const week = [];
    const w = new Date();
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
  const ACH = [
    { id: 'first', name: 'First run', text: 'Finish one typing run.', test: () => data.sessions.length >= 1 },
    { id: 'wpm60', name: '60 wpm', text: 'Type 60 wpm in any run.', test: s => s.wpm >= 60 },
    { id: 'wpm100', name: '100 wpm', text: 'Type 100 wpm in any run.', test: s => s.wpm >= 100 },
    { id: 'wpm150', name: '150 wpm', text: 'Type 150 wpm in any run.', test: s => s.wpm >= 150 },
    { id: 'beatart', name: 'Faster than Art', text: `Type more than Art's ${ART_BEST} wpm.`, test: s => s.wpm > ART_BEST },
    { id: 'clean', name: 'Clean run', text: 'Finish a run of 30 seconds or more at 100% accuracy.', test: s => s.acc >= 100 && s.ms >= 30000 },
    { id: 'streak7', name: '7 day streak', text: 'Type on 7 days in a row.', test: () => streak().days >= 7 },
    { id: 'streak30', name: '30 day streak', text: 'Type on 30 days in a row.', test: () => streak().days >= 30 },
    { id: 'words10k', name: '10,000 words', text: 'Type 10,000 correct words in total.', test: () => data.totals.correct / 5 >= 10000 },
    { id: 'horde1', name: 'Off the air', text: 'Clear chapter 1 of Breach.', test: s => s.mode === 'horde-1' && s.cleared },
    { id: 'horde5', name: 'Rollback', text: 'Clear the last chapter of Breach.', test: s => s.mode === 'horde-5' && s.cleared },
    { id: 'racewin', name: 'Overtake', text: 'Win a race against Art.', test: s => s.mode === 'race-art' && s.won },
    { id: 'collector', name: 'Collector', text: 'Own 10 items from the shop.', test: () => data.owned.length >= 14 },
    { id: 'level10', name: 'Level 10', text: 'Reach level 10.', test: () => levelInfo().level >= 10 },
  ];
  function checkAchievements(s) {
    const out = [];
    for (const a of ACH) {
      if (data.achievements[a.id]) continue;
      if (a.test(s || {})) { data.achievements[a.id] = day(); out.push(a.id); emit('achievement', a); }
    }
    if (out.length) { save(); addCoins(out.length * 100, 'achievement'); }
    return out;
  }
  const achievements = () => ACH.map(a => ({ id: a.id, name: a.name, text: a.text, unlocked: data.achievements[a.id] || null }));

  // ---------- inventory and room ----------
  function owns(id) { return data.owned.includes(id); }
  function buy(item) {
    if (owns(item.id)) return { ok: false, reason: 'owned' };
    if (!spend(item.price)) return { ok: false, reason: 'coins' };
    data.owned.push(item.id); save();
    emit('inventory', { id: item.id });
    checkAchievements();
    return { ok: true };
  }
  function getRoom() { return data.room; }
  function setRoom(room) { data.room = room; save(); emit('room', room); }

  // ---------- profile ----------
  function profile() { return { ...data.profile }; }
  function setProfile(p) { data.profile = { ...data.profile, ...p }; save(); emit('profile', data.profile); }

  function reset() { data = blank(); save(); emit('reset', null); }
  function exportData() { return JSON.stringify(data); }

  return {
    ART_BEST, on, record, stats, streak, levelInfo, achievements,
    coins: () => data.coins, addCoins, spend, addXP, xp: () => data.xp,
    owns, buy, owned: () => [...data.owned], getRoom, setRoom,
    profile, setProfile, sessions: () => [...data.sessions], best: () => ({ ...data.best }),
    reset, exportData,
  };
})();
