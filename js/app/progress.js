// The daily loop: sign-in streak, daily and weekly tasks, achievements, visual bonuses
// and room gifts. It listens to WPM.track events only so a new mode plugs in by calling
// WPM.track and WPM.events.register (see PROGRESS.md). Amounts come from window.REWARDS.
// Saved state lives in WPM.progress(). js/app/progress-ui.js draws it.
window.Progress = (() => {
  const R = window.REWARDS, D = window.ProgressData;
  const subs = {};
  const on = (ev, fn) => { (subs[ev] ||= []).push(fn); return () => { subs[ev] = subs[ev].filter(f => f !== fn); }; };
  const emit = (ev, x) => (subs[ev] || []).forEach(f => { try { f(x); } catch (e) { console.error(e); } });
  // Boss hits arrive several times a second so saves wait for a quiet moment.
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { saveT = 0; WPM.saveProgress(); }, 400); };
  addEventListener('pagehide', () => { if (saveT) { clearTimeout(saveT); WPM.saveProgress(); } });
  let p = null, booted = false;

  // The modes in this build. A new mode registers its own events when its script loads.
  WPM.events.register('run', 'type_test', 'race_done', 'boss_hit', 'boss_win', 'breach_stage', 'breach_endless',
    'combo', 'item_buy', 'room_save', 'signin', 'task_done', 'gift_open');

  // ---------- dates ----------
  const parse = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 12); };
  const between = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const addDays = (d, n) => { const x = parse(d); x.setDate(x.getDate() + n); return WPM.day(x); };
  // the Monday of the week, as the week's key
  const weekOf = d => { const x = parse(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return WPM.day(x); };
  const today = () => WPM.day();

  // seeded random so everyone gets the same tasks on the same day
  function rng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }

  // ---------- saved state ----------
  const COUNTERS = ['tests', 'acc95', 'clean', 'races', 'raceArtWins', 'duo', 'bossDmg', 'bossBlocks', 'bossWins', 'combo',
    'breach', 'breachHard', 'ch1', 'ch5', 'endlessLvl', 'lessons', 'spells', 'pvp', 'tasks', 'allDaily', 'weekly', 'allWeekly',
    'gifts', 'giftSet', 'shields', 'streakBest', 'signins', 'placed', 'night', 'round100', 'exact204', 'quoteClean', 'comeback'];
  function load() {
    p = WPM.progress();
    p.c ||= backfill();
    for (const k of COUNTERS) p.c[k] ||= 0;
    p.streak ||= { n: 0, last: null, shieldWeek: null };
    p.known ||= [];
    p.fx ||= {};          // bonus id -> date unlocked
    p.fxOff ||= {};       // bonus id -> true when switched off
    p.fxColor ||= {};     // bonus id -> colour
    p.gift ||= { month: null, runDay: null, runCount: 0 };
    p.reveal ||= [];      // gifts given and not opened yet: { id, source } or { coins, source }
    p.said ||= null;      // the day Tilde last announced the streak
    WPM.events.register(p.known);
  }
  // Players from before the daily loop get counters from the runs they already have.
  function backfill() {
    const c = {};
    for (const s of WPM.sessions()) {
      if (D.TYPING.test(s.mode)) {
        c.tests = (c.tests || 0) + 1;
        if (s.acc >= 95) c.acc95 = (c.acc95 || 0) + 1;
        if (s.acc >= 100 && s.ms >= 30000) c.clean = (c.clean || 0) + 1;
      } else if (/^race-/.test(s.mode)) {
        c.races = (c.races || 0) + 1;
        if (s.mode === 'race-art' && s.won) c.raceArtWins = (c.raceArtWins || 0) + 1;
        if (s.mode === 'race-duo') c.duo = (c.duo || 0) + 1;
      } else if (/^horde-\d$/.test(s.mode) && s.cleared) {
        c.breach = (c.breach || 0) + 1;
        if (s.mode === 'horde-1') c.ch1 = 1;
        if (s.mode === 'horde-5') c.ch5 = 1;
        if (s.difficulty === 'hard') c.breachHard = 1;
      } else if (s.mode === 'world-boss') c.bossDmg = (c.bossDmg || 0) + (s.score || 0);
    }
    return c;
  }

  // ---------- sign-in streak ----------
  // A visit on a new calendar day signs in. One missed day a week is covered by the shield.
  function shieldReady(missed) { return p.streak.shieldWeek !== weekOf(missed); }
  function checkIn() {
    const t = today(), s = p.streak;
    if (s.last === t) return null;
    ensureTasks();
    const gap = s.last ? between(s.last, t) : null;
    let shield = false, lost = 0;
    if (gap === 1) s.n++;
    else if (gap === 2 && s.n > 0 && R.streak.shieldsPerWeek > 0 && shieldReady(addDays(t, -1))) {
      s.n++; shield = true; s.shieldWeek = weekOf(addDays(t, -1)); p.c.shields++;
    } else { lost = s.n; s.n = 1; }
    if (gap >= 8) p.c.comeback = 1;
    s.last = t;
    p.c.streakBest = Math.max(p.c.streakBest, s.n);
    p.c.signins++;
    const r = dayReward(s.n);
    WPM.addCoins(r.coins, 'streak');
    WPM.addXP(r.xp);
    const res = { n: s.n, day: r.day, coins: r.coins, xp: r.xp, shield, lost, gift: !!r.gift };
    // bonuses unlock at milestones and stay
    const fresh = [];
    for (const b of D.BONUSES) if (s.n >= b.days && !p.fx[b.id]) { p.fx[b.id] = t; fresh.push(b); }
    res.bonuses = fresh;
    save();
    emit('checkin', res);
    WPM.track('signin', { streak: s.n, cycleDay: r.day, shield });
    if (fresh.length) emit('bonus', fresh);
    if (r.gift && R.gifts.streakDays.includes(r.day)) give('streak');
    const month = t.slice(0, 7);
    if (R.gifts.monthly && p.gift.month !== month) {
      const first = !p.gift.month;
      p.gift.month = month; save();
      if (!first) give('month');
    }
    return res;
  }
  // coins and XP for a streak day, with the week bonus
  function dayReward(n) {
    const day = ((n - 1) % 7) + 1, weeks = Math.floor((n - 1) / 7);
    const k = 1 + Math.min(R.streak.weekBonusMax, weeks * R.streak.weekBonus);
    const d = R.streak.days[day - 1];
    return { day, coins: Math.round(d.coins * k), xp: Math.round(d.xp * k), gift: d.gift };
  }
  function streak() {
    const s = p.streak, t = today();
    const gap = s.last ? between(s.last, t) : null;
    // still alive today: signed in today or yesterday or the shield would cover one missed day
    const alive = gap === 0 || gap === 1 || (gap === 2 && shieldReady(addDays(t, -1)));
    const n = alive ? s.n : 0;
    const day = n ? ((n - 1) % 7) + 1 : 0;
    const cycle = R.streak.days.map((d, i) => {
      const nAt = n - day + i + 1;
      const r = dayReward(Math.max(1, nAt));
      return { day: i + 1, coins: r.coins, gift: !!d.gift, done: i < day, today: i + 1 === day && gap === 0 };
    });
    return { n, best: p.c.streakBest, day, signedToday: gap === 0, shieldReady: shieldReady(t), shieldUsedOn: s.shieldWeek, cycle };
  }

  // ---------- tasks ----------
  const TPL = new Map([...D.DAILY, ...D.WEEKLY].map(t => [t.id, t]));
  function draw(pool, seed, picks) {
    const r = rng(seed);
    const ok = pool.filter(t => WPM.events.known(t.ev));
    const out = [];
    for (const tier of picks) {
      let cand = ok.filter(t => (!tier || t.tier === tier) && !out.includes(t));
      // two tasks from the same event make a dull day so those go last
      const fresh = cand.filter(t => !out.some(o => o.ev === t.ev));
      if (fresh.length) cand = fresh;
      if (!cand.length) cand = ok.filter(t => !out.includes(t));
      if (!cand.length) break;
      out.push(cand[Math.floor(r() * cand.length)]);
    }
    return out.map(t => ({ id: t.id, v: 0, done: false }));
  }
  function ensureTasks() {
    const t = today(), w = weekOf(t);
    let changed = false;
    if (!p.daily || p.daily.day !== t) { p.daily = { day: t, list: draw(D.DAILY, 'daily:' + t, ['easy', 'medium', 'hard']), all: false }; changed = true; }
    if (!p.weekly || p.weekly.week !== w) { p.weekly = { week: w, list: draw(D.WEEKLY, 'weekly:' + w, [null, null, null]), all: false }; changed = true; }
    if (changed) { save(); emit('tasks'); }
  }
  function taskView(row, weekly) {
    const t = TPL.get(row.id);
    if (!t) return null;
    const pay = weekly ? R.tasks.weekly : R.tasks[t.tier];
    return { id: t.id, text: D.taskText(t), hint: t.hint || '', tier: t.tier, n: t.n, v: Math.min(t.n, row.done ? t.n : row.v), done: row.done,
      unit: t.unit || '', coins: pay.coins, xp: pay.xp, weekly };
  }
  function tasks() {
    ensureTasks();
    const end = parse(today()); end.setHours(24, 0, 0, 0);
    const wEnd = parse(p.weekly.week); wEnd.setDate(wEnd.getDate() + 7); wEnd.setHours(0, 0, 0, 0);
    return {
      daily: p.daily.list.map(r => taskView(r, false)).filter(Boolean),
      weekly: p.weekly.list.map(r => taskView(r, true)).filter(Boolean),
      dailyEnds: end, weeklyEnds: wEnd,
      allDaily: R.tasks.allDaily, allWeekly: R.tasks.allWeekly,
    };
  }
  function advance(set, e, weekly) {
    for (const row of set.list) {
      if (row.done) continue;
      const t = TPL.get(row.id);
      if (!t || t.ev !== e.name || (t.when && !t.when(e))) continue;
      if (t.max) row.v = Math.max(row.v, t.max(e) || 0);
      else if (t.distinct) { const k = t.distinct(e); row.seen ||= []; if (k && !row.seen.includes(k)) row.seen.push(k); row.v = row.seen.length; }
      else row.v += t.add ? t.add(e) : 1;
      if (row.v >= t.n) {
        row.done = true;
        const pay = weekly ? R.tasks.weekly : R.tasks[t.tier];
        WPM.addCoins(pay.coins, weekly ? 'weekly' : 'task');
        WPM.addXP(pay.xp);
        if (weekly) p.c.weekly++; else p.c.tasks++;
        emit('task', { ...taskView(row, weekly) });
        later.push(['task_done', { id: t.id, weekly }]);
      }
    }
    if (!set.all && set.list.length && set.list.every(r => r.done)) {
      set.all = true;
      const pay = weekly ? R.tasks.allWeekly : R.tasks.allDaily;
      WPM.addCoins(pay.coins, weekly ? 'weekly' : 'task');
      WPM.addXP(pay.xp);
      if (weekly) p.c.allWeekly++; else p.c.allDaily++;
      emit('alldone', { weekly, coins: pay.coins, xp: pay.xp });
    }
  }

  // ---------- events ----------
  const later = [];
  let busy = false;
  function onTrack(e) {
    if (!p) return;
    if (!p.known.includes(e.name)) p.known.push(e.name);
    later.push([e.name, e]);
    if (busy) return;
    busy = true;
    try {
      while (later.length) {
        const [name, x] = later.shift();
        // a follow-up such as task_done goes out through WPM.track, which queues it here again
        if (!x.name) { WPM.track(name, x); continue; }
        handle(x);
      }
    } finally { busy = false; }
    checkAch(false);
    save();
  }
  function handle(e) {
    count(e);
    ensureTasks();
    advance(p.daily, e, false);
    advance(p.weekly, e, true);
    if (e.name === 'run') maybeRunGift();
  }
  // lifetime counters for the achievements
  function count(e) {
    const c = p.c;
    switch (e.name) {
      case 'run': {
        const h = new Date(e.at).getHours();
        if (h < 4) c.night = 1;
        if (e.wpm === 100) c.round100 = 1;
        if (e.wpm === 204) c.exact204 = 1;
        break;
      }
      case 'type_test':
        c.tests++;
        if (e.acc >= 95) c.acc95++;
        if (e.acc >= 100 && e.ms >= 30000) c.clean++;
        if (e.mode === 'quote' && e.acc >= 100) c.quoteClean = 1;
        break;
      case 'race_done':
        c.races++;
        if (e.opp === 'art' && e.won) c.raceArtWins++;
        if (e.opp === 'duo') c.duo++;
        break;
      case 'boss_hit':
        c.bossDmg += e.dmg || 0;
        if (e.kind === 'block') c.bossBlocks++;
        break;
      case 'boss_win': c.bossWins++; break;
      case 'combo': c.combo = Math.max(c.combo, e.n || 0); break;
      case 'breach_stage':
        c.breach++;
        if (e.chapter === 1) c.ch1 = 1;
        if (e.chapter === 5) c.ch5 = 1;
        if (e.difficulty === 'hard') c.breachHard = 1;
        break;
      case 'breach_endless': c.endlessLvl = Math.max(c.endlessLvl, e.level || 0); break;
      case 'lesson_pass': c.lessons++; break;
      case 'spell_cast': c.spells++; break;
      case 'pvp_win': c.pvp++; break;
      case 'room_save': c.placed = Math.max(c.placed, e.items || 0); break;
      case 'gift_open': c.gifts++; break;
    }
  }

  // ---------- achievements ----------
  // WPM.stats() walks every saved run so one check reads it once
  const once = f => { let v, done = false; return () => (done ? v : (done = true, v = f())); };
  const view = () => ({ stats: once(WPM.stats), owned: once(WPM.owned), levelInfo: once(WPM.levelInfo) });
  function achVisible(a) { return !a.needs || WPM.events.known(a.needs); }
  function achList() {
    const W = view();
    return D.ACH.filter(achVisible).map(a => {
      const got = WPM.unlockedOn(a.id);
      let v = 0;
      try { v = a.val(p.c, W) || 0; } catch (e) {}
      return { id: a.id, name: a.name, text: a.text, group: a.group, tier: a.tier, hidden: !!a.hidden, unlocked: got,
        goal: a.goal, v: Math.max(0, Math.min(a.goal, Math.floor(v))), bar: a.bar !== false && a.goal > 1, unit: a.unit || '' };
    });
  }
  function checkAch(quiet) {
    const got = [], W = view();
    for (const a of D.ACH) {
      if (!achVisible(a) || WPM.unlockedOn(a.id)) continue;
      let v = 0;
      try { v = a.val(p.c, W) || 0; } catch (e) {}
      if (v >= a.goal) got.push(a);
    }
    if (!got.length) return got;
    // three or more at once get one toast between them instead of one each
    const many = quiet || got.length > 2;
    for (const a of got) WPM.unlock(a.id, { name: a.name, text: a.text, tier: a.tier, hidden: !!a.hidden }, many);
    if (many && !quiet) emit('many', got);
    let coins = 0, xp = 0;
    for (const a of got) { const pay = a.hidden ? R.achievements.hidden : R.achievements[a.tier]; coins += pay.coins; xp += pay.xp; }
    WPM.addCoins(coins, 'achievement');
    WPM.addXP(xp);
    emit('achievements', got);
    return got;
  }

  // ---------- gifts ----------
  function giftPool() {
    const cat = window.RoomItems && RoomItems.catalog;
    if (!cat) return null;
    const only = cat.filter(i => i.gift && !WPM.owns(i.id));
    const shop = cat.filter(i => !i.gift && !i.roomSize && i.price > 0 && i.price <= R.gifts.maxPrice && !WPM.owns(i.id));
    return { only, shop };
  }
  // A gift is given straight away and opened when the player next sees a page that is not a game.
  function give(source) {
    p.reveal.push({ source });
    resolve();
  }
  function resolve() {
    const pool = giftPool();
    if (!pool) return;
    let changed = false;
    for (const g of p.reveal) {
      if (g.id || g.coins) continue;
      const r = rng(today() + ':' + source(g) + ':' + p.c.signins + ':' + p.reveal.length + ':' + WPM.owned().length);
      const from = pool.only.length && (r() < R.gifts.giftOnlyShare || !pool.shop.length) ? pool.only : pool.shop;
      if (from.length) {
        const it = from[Math.floor(r() * from.length)];
        WPM.grant(it.id, 'gift');
        g.id = it.id;
        pool.only = pool.only.filter(x => x !== it); pool.shop = pool.shop.filter(x => x !== it);
        if (cat().filter(i => i.gift).every(i => WPM.owns(i.id))) p.c.giftSet = 1;
      } else {
        g.coins = R.gifts.allOwnedCoins;
      }
      changed = true;
    }
    if (changed) { save(); emit('gift', nextGift()); }
  }
  const source = g => g.source || 'gift';
  const cat = () => (window.RoomItems && RoomItems.catalog) || [];
  function maybeRunGift() {
    const t = today();
    if (p.gift.runDay !== t) { p.gift.runDay = t; p.gift.runCount = 0; }
    if (p.gift.runCount >= R.gifts.sessionMaxPerDay) return;
    if (Math.random() >= R.gifts.sessionChance) return;
    p.gift.runCount++;
    give('run');
  }
  const nextGift = () => p.reveal.find(g => g.id || g.coins) || null;
  // the reveal finished: count it and pay coins when the gift was coins
  function openGift() {
    const i = p.reveal.findIndex(g => g.id || g.coins);
    if (i < 0) return null;
    const [g] = p.reveal.splice(i, 1);
    if (g.coins) WPM.addCoins(g.coins, 'gift');
    save();
    WPM.track('gift_open', { id: g.id || null, source: g.source });
    return g;
  }

  // ---------- visual bonuses ----------
  function bonuses() {
    return D.BONUSES.map(b => ({ ...b, unlocked: p.fx[b.id] || null, on: !!p.fx[b.id] && !p.fxOff[b.id],
      color: p.fxColor[b.id] || (b.colors ? b.colors[0][1] : null) }));
  }
  function setBonus(id, { on, color } = {}) {
    if (!p.fx[id]) return;
    if (on !== undefined) { if (on) delete p.fxOff[id]; else p.fxOff[id] = true; }
    if (color) p.fxColor[id] = color;
    save();
    emit('fx', bonuses());
  }
  const bonus = id => bonuses().find(b => b.id === id && b.on) || null;

  // ---------- boot ----------
  function boot() {
    load();
    WPM.useAchievements({ list: achList });
    if (booted) { ensureTasks(); checkIn(); checkAch(true); emit('change'); return; }
    booted = true;
    WPM.on('event-registered', n => { if (p && !p.known.includes(n)) { p.known.push(n); save(); } });
    WPM.on('track', onTrack);
    WPM.on('level', () => { checkAch(false); save(); });
    WPM.on('inventory', () => { checkAch(false); save(); });
    WPM.on('reset', () => { boot(); emit('fx', bonuses()); });
    ensureTasks();
    // achievements a returning player already qualifies for unlock without a toast each
    const first = checkAch(true);
    if (first.length) emit('backfill', first);
    checkIn();
    // the day can change while the page is open
    setInterval(() => { if (p.streak.last !== today()) { checkIn(); emit('change'); } }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && p.streak.last !== today()) { checkIn(); emit('change'); } });
    addEventListener('load', () => { resolve(); });
    emit('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  return {
    on, streak, tasks, achievements: achList, bonuses, bonus, setBonus,
    nextGift, openGift, resolveGifts: resolve, checkIn, ready: () => !!p,
    said: () => p.said, setSaid: d => { p.said = d; save(); },
    dayReward, give,
    // the daily task ids a date would draw, for tests and for planning the pool
    preview: d => draw(D.DAILY, 'daily:' + d, ['easy', 'medium', 'hard']).map(r => r.id),
  };
})();
