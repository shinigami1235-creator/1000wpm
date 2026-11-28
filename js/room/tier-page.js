// #/room in tiers (Gid, 28 Nov 2026): the player's room as a full-screen picture under the site
// header, with the My Room menu, the operator level and the next unlock, and the shop bar. Clicking
// a slot in the picture opens its tab. Coins buy what goes in the slots (WPM.buy); levels open the
// rooms (RoomTiers.LEVELS). Also someone else's room, read only (#/u/<id>/room).
//
//   Room.mount(host, { visit: { profile } })   Room.unmount()
//   Room.summary()                              for the Rooms tab on #/leaderboard
//   RoomData.mine() / RoomData.of(profile)      { tier, equip, earned, data } to draw a room
//   RoomData.thumb(host, profile)               a small still of that player's room
(() => {
  const RT = window.RoomTiers, RV = window.RoomView;
  const esc = s => (window.UI ? UI.esc(s) : String(s));
  const fmt = n => Math.round(n || 0).toLocaleString('en-US');
  const coin = () => (window.UI ? UI.coin() : '');
  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z"/></svg>';
  const sfx = big => { try { if (window.TT && TT.click) TT.click(big); } catch (e) {} };

  // ------------------------------------------------------------------ saved room
  // WPM.getRoom(): { v: 2, tier: picked tier or null (the highest open one), eq: { '<tier>': { slot: item } }, items }
  function load() {
    const r = window.WPM && WPM.getRoom();
    return r && r.v === 2 ? r : { v: 2, tier: null, eq: {} };
  }
  function save(r) {
    const t = activeTier(r);
    r.items = Object.values(r.eq[t] || {}).filter(Boolean);
    WPM.setRoom(r);
  }
  const level = () => WPM.levelInfo().level;
  // The test switch (RoomTiers.TEST in js/room/tier-items.js, Gid 28 Nov): every room, tab, slot and
  // item open to look at and place without the level or the coins. Each gate it opens says TEST below.
  const TEST = !!RT.TEST;
  const openTier = () => (TEST ? 5 : RT.tierFor(level()));   // TEST: rooms open whatever the level
  // the room shown: the one picked in Room tiers, or the highest the player's level opens
  const activeTier = (r = load()) => Math.min(openTier(), r.tier || RT.tierFor(level()));

  // items from the old 3D room shop: owners get the new item that replaces each one
  function migrate() {
    if (!window.WPM) return;
    for (const old of WPM.owned()) { const nu = RT.LEGACY[old]; if (nu && !WPM.owns(nu)) WPM.grant(nu, 'room'); }
  }

  // ------------------------------------------------------------------ what the screens and case show
  function rushOf(m) {
    const beat = new Set();
    for (const run of (m && m.runs) || []) for (const f of run.fights || []) if (f.won) beat.add(f.boss);
    return { bosses: (m && m.best && m.best.bosses) || 0, score: (m && m.best && m.best.score) || 0, beat };
  }
  function bossHp() {
    // the World Boss bar between fights: drifts through the day the way the raid wears it down
    const t = Date.now() / 3.6e6, k = (t % 24) / 24;
    return { phase: 1 + Math.floor(k * 3), bossHp: Math.round(1.5e6 * (1 - ((k * 3) % 1)) * 0.92 + 40000) };
  }
  const BOARD = [['jolt_arc93', 188], ['nim_ri61', 176], ['reef_arc29', 160], ['kbd_sol42', 151], ['glyph_ivy', 142]];
  function board(name, best) {
    const rows = BOARD.map(([n, w]) => [n, w, false]);
    rows.push([name.slice(0, 12), best, true]);
    rows.sort((a, b) => b[1] - a[1]);
    const i = rows.findIndex(r => r[2]);
    const from = Math.max(0, Math.min(rows.length - 4, i - 1));
    return rows.slice(from, from + 4);
  }
  function mine() {
    const r = load(), tier = activeTier(r);
    const L = WPM.levelInfo(), st = WPM.stats(), name = WPM.profile().name || 'You';
    const c = (WPM.progress().c) || {};
    const rush = rushOf(WPM.modeData && WPM.modeData('rush'));
    const ctx = { ach: id => !!WPM.unlockedOn(id), level: L.level, rush };
    const days = new Set(WPM.sessions().map(s => String(s.at).slice(0, 10)));
    const streak = [...Array(35)].map((_, i) => { const d = new Date(Date.now() - (34 - i) * 864e5); return days.has(d.toISOString().slice(0, 10)); });
    const ks = WPM.keyStats(), miss = {};
    for (const [k, [ok, bad]] of Object.entries(ks)) if (ok + bad > 20) miss[k.toLowerCase()] = bad / (ok + bad);
    const runs = WPM.sessions().filter(s => s.wpm).slice(-30).map(s => Math.round(s.wpm));
    const dmg = c.bossDmg || 0;
    const eq = { ...(r.eq[tier] || {}) };
    if (!TEST) for (const [k, id] of Object.entries(eq)) if (id && !RT.owns(id)) delete eq[k];   // placed while testing, not bought
    const dv = window.Ops && Ops.division ? Ops.division() : null;
    return {
      tier, equip: eq,
      // TEST: the case shows every trophy, so a full case can be checked
      earned: TEST ? RT.TROPHIES.map(t => t.id) : RT.TROPHIES.filter(t => t.has(ctx)).map(t => t.id),
      data: { name, level: L.level, xp: L.next ? L.into / L.next : 0, best: st.bestWpm, avg: st.avgWpm, acc: st.accuracy || 0, runs: runs.length > 1 ? runs : [0, st.bestWpm],
        dmgS: dmg >= 1e6 ? (dmg / 1e6).toFixed(1) + 'M' : dmg >= 1e3 ? (dmg / 1e3).toFixed(1) + 'k' : String(dmg), board: board(name, st.bestWpm), ...bossHp(),
        streak, streakN: window.Progress ? Progress.streak().n : 0, miss, rush: { bosses: rush.bosses, score: rush.score, beat: [...rush.beat] }, online: 18 + new Date().getHours() % 9,
        div: dv ? dv.name : null, bot: botOf(dv && dv.id) },
    };
  }
  // someone else's room, the same every visit: their tier from their level, and items picked from
  // their name, more of them the higher they are (simulated players until the server keeps rooms)
  // the bot of each division (js/app/botkit.js), for the Your bot screen
  const BOT_OF = { sentinel: 'orbit', precision: 'pixel', striker: 'nova', ghost: 'kite', architect: 'beep', hunter: 'raze' };
  const botOf = div => BOT_OF[div] || 'orbit';
  function rng(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
  function of(p) {
    if (!p || p.id === 'me') return mine();
    // TEST: test_room_t<n> is a dressed room at tier n, for checking visits to every tier
    const tst = TEST && /^test_room_t([1-5])$/.exec(p.id);
    const art = !!p.art, lv = art ? 99 : tst ? RT.LEVELS[tst[1] - 1] + 2 : p.level || 1, tier = RT.tierFor(lv), r = rng('room:' + p.id);
    const pick = (type, f = () => true) => { const l = RT.ITEMS.filter(i => i.type === type && !i.gift && f(i)); return l[Math.floor(r() * l.length)]; };
    const fill = tst ? 1 : Math.min(1, 0.35 + lv / 40);   // how much of the room they have dressed
    const eq = {};
    for (const sl of RT.slots(tier)) {
      if (r() > fill && sl.kind !== 'screen') continue;
      if ((sl.kind === 'mood' || sl.kind === 'walls') && r() < 0.6) continue;   // most keep the room's own light
      const k = RT.kind(sl.kind);
      const it = k.type === 'prop' ? pick('prop', i => sl.kind === 'desk' || !i.desk) : pick(k.type, i => i.price <= 600 + lv * 260);
      if (it) eq[sl.id] = it.id;
    }
    if (art) Object.assign(eq, { view: 'view-neon', holo: 'holo-syntax', banner: 'ban-laurel', pet: 'cat', l1: 'led-rainbow', l2: 'led-violet', p1: 'poster-204', p2: 'poster-syntax', m1: 'scr-stats', m2: 'scr-board', m3: 'scr-rain', m4: 'scr-radar',
      sign: 'sign-ctrl', plate: 'plate-neon', accent: 'acc-teal', mood: 'mood-night', walls: 'walls-none', rug: 'rug-ctrl' });
    const best = p.stats ? p.stats.bestWpm || 0 : 0;
    const ctx = { ach: id => ({ wpm60: best >= 60, wpm100: best >= 100, wpm150: best >= 150, beatart: art, bosswin: r() < lv / 30, racewin: r() < 0.3, block50: r() < lv / 40, streak30: r() < lv / 60, combo250: r() < lv / 50 })[id] || false, level: lv,
      rush: { bosses: Math.floor(lv / 4 + r() * 4), beat: new Set(['spam', 'siege', 'sign', 'warden', 'announcer', 'colossus', 'press', 'king', 'correction', 'half', 'brute', 'syntax'].slice(0, Math.floor(lv / 4 + r() * 3))) } };
    const name = tst ? `Test room ${tst[1]}` : p.name || p.id;
    const divs = ['Striker', 'Precision', 'Hunter', 'Sentinel', 'Ghost', 'Architect'], dv = art ? 'Striker' : divs[Math.floor(r() * 6)];
    return {
      tier, equip: eq, earned: RT.TROPHIES.filter(t => t.has(ctx)).map(t => t.id),
      data: { name, level: lv, xp: r(), best, avg: p.stats ? p.stats.avgWpm : 0, acc: p.stats ? p.stats.acc : 0, runs: [...Array(16)].map((_, i) => Math.round(best * (0.72 + i * 0.016 + r() * 0.06))),
        dmgS: (lv * 0.04 + r() * 0.3).toFixed(1) + 'M', board: board(name, best), ...bossHp(), streak: [...Array(35)].map(() => r() < 0.6), streakN: Math.floor(r() * 20),
        miss: Object.fromEntries([...'qwertyuiopasdfghjklzxcvbnm'].map(k => [k, r() * 0.06])), rush: { bosses: ctx.rush.bosses, score: ctx.rush.bosses * 6100, beat: [...ctx.rush.beat] }, online: 21,
        div: dv, bot: botOf(dv.toLowerCase()) },
    };
  }
  function thumb(host, p) {
    const d = of(p);
    return RV.create(host, { ...d, still: true, fit: 'cover' });
  }
  window.RoomData = { mine, of, thumb, load, activeTier };

  // ------------------------------------------------------------------ the page
  let root = null, view = null, offs = [], state = null;

  function mount(host, opts = {}) {
    unmount();
    migrate();
    scrollTo(0, 0);
    const visit = opts.visit && opts.visit.profile ? opts.visit.profile : null;
    root = document.createElement('div'); root.className = 'rm' + (visit ? ' visiting' : '');
    root.innerHTML = '<div class="rm-stage" data-stage></div>';
    host.append(root);
    // the room fills the window under the header with no page scroll
    const top = () => { const h = document.querySelector('header.top'); if (root) root.style.setProperty('--rm-top', Math.round(h ? h.getBoundingClientRect().bottom : 69) + 'px'); };
    top(); addEventListener('resize', top); offs.push(() => removeEventListener('resize', top));
    document.documentElement.classList.add('rm-on'); offs.push(() => document.documentElement.classList.remove('rm-on'));
    const stage = root.querySelector('[data-stage]');
    const phone = matchMedia('(max-width: 760px)');
    const d = visit ? of(visit) : mine();
    state = { visit, tab: 'view', slot: 'view', mode: 'custom', pending: null, phone, touched: false, bar: false, menu: false };
    view = RV.create(stage, { ...d, interactive: !visit, fit: phone.matches ? 'height' : 'cover', onSlot: openSlot });
    if (phone.matches) requestAnimationFrame(() => { stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) * RT.TIERS[d.tier].focus; });
    const onPhone = () => { if (!view) return; view.set({ fit: phone.matches ? 'height' : 'cover' }); };
    phone.addEventListener('change', onPhone); offs.push(() => phone.removeEventListener('change', onPhone));
    if (visit) return paintVisit(visit, d);
    paintMenu(); paintOp(); paintBar();
    offs.push(WPM.on('coins', () => { paintOp(); if (state.mode === 'custom') paintItems(); }));
    offs.push(WPM.on('inventory', () => { if (state.mode === 'custom') paintItems(); }));
    offs.push(WPM.on('level', () => { paintOp(); paintMenu(); }));
    document.addEventListener('keydown', onKey); offs.push(() => document.removeEventListener('keydown', onKey));
  }

  function ui(cls, html, tag = 'div') {
    let n = root.querySelector('.' + cls.split(' ')[0]);
    if (!n) { n = document.createElement(tag); root.append(n); }
    n.className = 'rm-ui rm-panel ' + cls; n.innerHTML = html;
    return n;
  }
  const drop = cls => { const n = root && root.querySelector('.' + cls); if (n) n.remove(); };

  // ---------- the My Room menu
  function paintMenu() {
    const t = view.tier, T = RT.TIERS[t];
    const nSlots = RT.slots(t).length, earned = mine().earned.length, cap = (T.case || T.pins || []).length;
    const items = [['custom', 'Customise', `${nSlots} slots`], ['ach', 'Achievements', `${Math.min(earned, cap)} of ${cap}`], ['visit', 'Visit a room', ''], ['tiers', 'Room tiers', `${openTier()} of 5`]];
    const n = ui('rm-menu' + (state.menu ? ' open' : ''), `<button type="button" class="rm-head" data-open aria-expanded="${state.menu}"><span><h1>My Room</h1><span class="tier">Tier ${t} // ${esc(T.name)}</span></span><i aria-hidden="true"></i></button>
      <div class="rm-list">${items.map(([k, a, b]) => `<button type="button" data-m="${k}" aria-pressed="${(k === 'custom' ? state.bar : state.mode === k) && k === state.mode}">${a}<small>${b}</small></button>`).join('')}
      <button type="button" data-hide>Hide everything<small>H</small></button></div>`, 'nav');
    n.setAttribute('aria-label', 'My Room');
    n.querySelector('[data-open]').addEventListener('click', () => { state.menu = !state.menu; paintMenu(); });
    n.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { state.menu = false; setMode(b.dataset.m, true); }));
    n.querySelector('[data-hide]').addEventListener('click', () => clean(true));
  }
  function setMode(m, open) {
    state.mode = m; state.pending = null; view.preview(null);
    if (m === 'custom' && open) state.bar = true;
    paintMenu();
    drop('rm-bar'); drop('rm-sheet'); drop('rm-tab');
    if (m === 'custom') paintBar();
    if (m === 'tiers') paintTiers();
    if (m === 'ach') paintAch();
    if (m === 'visit') paintVisits();
  }

  // the room on its own, for a look or a screenshot: H or the button hides the panels
  function clean(on) {
    if (!root) return;
    root.classList.toggle('clean', on);
    let b = root.querySelector('.rm-show');
    if (on && !b) { b = document.createElement('button'); b.type = 'button'; b.className = 'rm-show'; b.textContent = 'Show panels'; b.addEventListener('click', () => clean(false)); root.append(b); b.focus(); }
    if (!on && b) b.remove();
  }
  function onKey(ev) {
    if (!root || ev.ctrlKey || ev.metaKey || ev.altKey || /input|textarea|select/i.test(ev.target.tagName)) return;
    if (ev.key === 'h' || ev.key === 'H') clean(!root.classList.contains('clean'));
    if (ev.key === 'Escape' && root.classList.contains('clean')) return clean(false);
    if (ev.key === 'Escape' && state.mode !== 'custom') return setMode('custom');
    if (ev.key === 'Escape' && state.bar) return closeBar();
    if (ev.key === 'Escape' && state.menu) { state.menu = false; paintMenu(); }
  }

  // ---------- the operator panel
  function paintOp() {
    if (!root) return;
    const L = WPM.levelInfo(), o = openTier(), nx = RT.TIERS[o + 1];
    // the room you'd unlock next by level (while every room is open for checking, the real lock still shows)
    const nxL = RT.TIERS[RT.tierFor(L.level) + 1];
    ui('rm-op', `<div class="lv">Level <b>${L.level}</b>${nxL ? `<span class="next">${LOCK}${esc(nxL.name)} at ${nxL.level}</span>` : `<span class="next top">${STAR}Top tier</span>`}</div>
      <div class="xp" title="${fmt(L.into)} of ${fmt(L.next)} XP"><i style="width:${(100 * L.into / L.next).toFixed(1)}%"></i></div>`);
    void nx; void o;
  }

  // ---------- the shop bar
  // Four shelves (Walls, Desk, Lighting, Decor), each with its tabs, then the slots of the tab picked.
  // A tab whose slot this room doesn't have shows the level its room opens at; TEST: it opens that room.
  function kindsHere(t) {
    const sl = RT.slots(t);
    return RT.KINDS.map(k => ({ ...k, slots: sl.filter(s => s.kind === k.id), at: [1, 2, 3, 4, 5].find(n => RT.slots(n).some(s => s.kind === k.id)) }))
      .filter(k => k.slots.length || k.at);
  }
  function paintBar() {
    const t = view.tier, ks = kindsHere(t);
    if (!ks.some(k => k.id === state.tab && k.slots.length)) { const k0 = ks.find(k => k.slots.length); state.tab = k0.id; state.slot = k0.slots[0].id; }
    const k = ks.find(x => x.id === state.tab);
    state.group = k.group;
    if (!k.slots.some(s => s.id === state.slot)) state.slot = k.slots[0].id;
    if (!state.bar) { drop('rm-bar'); view.select(null); return paintTab(); }
    drop('rm-tab');
    const inGroup = ks.filter(x => x.group === state.group);
    const tabBtn = x => x.slots.length
      ? `<button type="button" role="tab" data-k="${x.id}" aria-selected="${x.id === state.tab}">${esc(x.name)}</button>`
      : TEST ? `<button type="button" class="jump" data-jump="${x.id}" title="Opens room ${x.at}">${esc(x.name)} <small>room ${x.at}</small></button>`
        : `<button type="button" class="lock" disabled title="Opens at level ${RT.TIERS[x.at].level}">${esc(x.name)} ${LOCK}${RT.TIERS[x.at].level}</button>`;
    const n = ui('rm-bar', `<div class="rm-tabs rm-groups" role="tablist"><button type="button" class="rm-close" data-close aria-label="Close the shop">&times;</button>${RT.GROUPS.map(g => `<button type="button" role="tab" data-g="${g.id}" aria-selected="${g.id === state.group}">${esc(g.name)}</button>`).join('')}${TEST ? '<span class="rm-test" title="RoomTiers.TEST in js/room/tier-items.js">Test: all open</span>' : ''}</div>
      <div class="rm-sub"><div class="rm-kinds">${inGroup.map(tabBtn).join('')}</div>
      ${k.slots.length > 1 ? `<div class="rm-slots">${k.slots.map((s, i) => `<button type="button" data-s="${s.id}" aria-pressed="${s.id === state.slot}">${esc(s.name || `${k.id === 'wall' ? 'Wall' : k.name.replace(/s$/, '')} ${i + 1}`)}</button>`).join('')}</div>` : ''}</div>
      <div class="rm-items" data-items></div><p class="rm-msg" data-msg role="status"></p>`);
    n.setAttribute('aria-label', 'Customise');
    n.querySelector('[data-close]').addEventListener('click', closeBar);
    n.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { const f = ks.find(x => x.group === b.dataset.g && x.slots.length) || ks.find(x => x.group === b.dataset.g); state.touched = true; if (!f.slots.length) return jump(f); state.tab = f.id; state.slot = null; cancelPending(); paintBar(); }));
    n.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { state.touched = true; state.tab = b.dataset.k; state.slot = null; cancelPending(); paintBar(); }));
    n.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => jump(ks.find(x => x.id === b.dataset.jump))));
    n.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { state.touched = true; state.slot = b.dataset.s; cancelPending(); paintBar(); }));
    view.select(state.touched ? state.slot : null);
    paintItems();
  }
  // TEST: a tab this room lacks opens the first room that has it
  function jump(k) {
    if (!TEST || !k || !k.at) return;
    cancelPending();
    const r = load(); r.tier = k.at; save(r);
    const d = mine(); view.set({ tier: d.tier, equip: d.equip, earned: d.earned, data: d.data });
    state.tab = k.id; state.slot = null; state.touched = true; paintMenu(); paintBar(); sfx(true);
  }
  // the shop stays tucked away as one small button until it's needed
  function paintTab() {
    const b = ui('rm-tab', `${coin()}<span>Customise</span>`, 'button');
    b.type = 'button'; b.setAttribute('aria-label', 'Open the shop');
    b.onclick = () => { state.bar = true; state.menu = false; paintMenu(); paintBar(); };
  }
  function closeBar() { state.bar = false; cancelPending(); paintBar(); paintMenu(); }
  function openSlot(sl) {
    if (state.visit) return;
    if (sl.kind === 'case') return setMode('ach');
    if (state.mode !== 'custom') setMode('custom');
    state.bar = true; state.menu = false; paintMenu();
    state.touched = true; state.tab = sl.kind; state.slot = sl.id; cancelPending(); paintBar();
    sfx(false);
  }
  function equipped() { const r = load(), t = view.tier; return (r.eq[t] || {}); }
  function optionsFor(kind, slot) {
    const k = RT.kind(kind);
    // TEST: gift-only and streak items show too
    let list = RT.ITEMS.filter(i => i.type === k.type && (TEST || ((!i.gift || WPM.owns(i.id)) && (!i.bonus || RT.owns(i.id)))));
    if (kind === 'shelf') list = list.filter(i => !i.desk);
    if (kind === 'wall') list = list.filter(i => i.id !== 'scr-logo');
    if (kind === 'screen') list = list.filter(i => i.id !== 'scr-card');
    // owned first, then by price
    const own = i => RT.owns(i.id);
    list.sort((a, b) => (own(b) - own(a)) || a.price - b.price);
    // a mat or a keyboard covers the picture's own desk set; Original leaves the picture as it is
    const optional = ['poster', 'shelf', 'desk', 'pet', 'holo', 'sign', 'plate', 'rug', 'kb', 'mat'].includes(kind);
    return { list, optional };
  }
  function paintItems() {
    const box = root && root.querySelector('[data-items]'); if (!box) return;
    const eq = equipped(), cur = eq[state.slot] !== undefined ? eq[state.slot] : RT.defaultFor(state.slot, state.tab);
    const { list, optional } = optionsFor(state.tab, state.slot);
    const pend = state.pending;
    const card = (it) => {
      const own = RT.owns(it.id), on = cur === it.id, can = own || TEST || WPM.coins() >= it.price || WPM.testing();
      const status = on ? '<small class="own">Placed</small>' : own ? '<small class="own">Owned</small>' : `<small>${coin()}${fmt(it.price)}</small>`;
      return `<button type="button" class="rm-it${on ? ' on' : ''}${pend === it.id ? ' on' : ''}${can ? '' : ' cant'}" data-i="${it.id}" title="${esc(it.desc || it.name)}"><span class="th ${it.type}">${thumbHtml(it)}</span><span class="nm">${esc(it.name)}</span>${status}</button>`;
    };
    const orig = state.tab === 'kb' || state.tab === 'mat';   // the picture's own keyboard and desk
    box.innerHTML = (optional ? `<button type="button" class="rm-it none${cur ? '' : ' on'}" data-i=""><span class="th">${orig ? 'AS BUILT' : 'EMPTY'}</span><span class="nm">${orig ? 'Original' : 'Nothing'}</span><small class="own">${cur ? 'Clear' : 'Placed'}</small></button>` : '') + list.map(card).join('');
    box.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => choose(b.dataset.i || null)));
    // views draw their scene into the card once it is on screen
    box.querySelectorAll('canvas[data-view]').forEach(c => { const it = RT.get(c.dataset.view); RV.thumb(it).then(u => { if (u && c.isConnected) { const im = new Image(); im.src = u; im.className = 'view'; c.replaceWith(im); } }); });
    box.querySelectorAll('img[data-holo]').forEach(im => RV.thumb(RT.get(im.dataset.holo)).then(u => { im.src = u; }));
    const sel = box.querySelector('.rm-it.on'); if (sel && sel.scrollIntoView && state.scrolled !== state.slot) { state.scrolled = state.slot; box.scrollLeft = Math.max(0, sel.offsetLeft - 40); }
  }
  function thumbHtml(it) {
    if (it.type === 'accent' || it.type === 'walls' || it.type === 'mood') return `<span class="sw ${it.type}" style="--c:${it.sw && it.sw.startsWith('#') ? it.sw : it.c || '#2fe0c0'};${it.sw && !it.sw.startsWith('#') ? `background:${it.sw}` : ''}"></span>`;
    if (it.type === 'light') return `<span class="sw" style="--c:${it.sw || RT.colorOf(it)};${it.sw && !it.sw.startsWith('#') ? `background:${it.sw}` : ''}"></span>`;
    if (it.type === 'view') return `<canvas data-view="${it.id}" width="4" height="3"></canvas>`;
    if (it.type === 'holo') return `<img src="" alt="" data-holo="${it.id}">`;
    return RV.art(it, mine().data) || esc(it.name);
  }
  function msg(html) { const m = root && root.querySelector('[data-msg]'); if (m) m.innerHTML = html; return m; }
  function cancelPending() { if (state.pending !== null) { state.pending = null; view.preview(null); } }

  function place(id) {
    const r = load(), t = view.tier;
    r.eq[t] ||= {};
    if (id === null) delete r.eq[t][state.slot]; else r.eq[t][state.slot] = id;
    save(r);
    view.preview(null);
    view.set({ equip: { ...r.eq[t] } });
    view.select(state.slot);
  }
  function choose(id) {
    if (id === null || RT.owns(id)) { state.pending = null; place(id); sfx(true); paintItems(); msg(''); return; }
    const it = RT.get(id);
    // TEST: placed without buying; it comes off again when the switch is turned off
    if (TEST) { state.pending = null; place(id); sfx(true); paintItems(); msg(`${esc(it.name)}: <b>${fmt(it.price)}</b> coins. Placed free while testing.`); return; }
    // not owned: show it in the room first, then buy
    state.pending = id;
    view.preview(state.slot, id);
    view.select(state.slot);
    paintItems();
    const short = it.price - WPM.coins();
    if (short > 0 && !WPM.testing()) { msg(`${esc(it.name)} costs <b>${fmt(it.price)}</b>. You need ${fmt(short)} more coins.`); return; }
    const m = msg(`${esc(it.name)}, <b>${fmt(it.price)}</b> coins.<button type="button" data-buy>Buy and place</button><button type="button" data-no>Cancel</button>`);
    m.querySelector('[data-buy]').addEventListener('click', () => {
      const res = WPM.buy(it);
      if (!res.ok) { msg(res.reason === 'coins' ? `You need ${fmt(it.price - WPM.coins())} more coins.` : ''); return; }
      state.pending = null; place(id); sfx(true); paintItems(); paintOp(); msg('');
    });
    m.querySelector('[data-no]').addEventListener('click', () => { cancelPending(); paintItems(); msg(''); });
  }

  // ---------- room tiers
  function paintTiers() {
    const o = openTier(), cur = view.tier, L = level();
    const n = ui('rm-sheet', `<button type="button" class="rm-x" data-x>Close</button><h2>Room tiers</h2><p>Each level tier opens a bigger room with more slots. Coins can't buy a tier.</p>
      <div class="rm-tiers">${[1, 2, 3, 4, 5].map(t => { const T = RT.TIERS[t], open = t <= o;
        return `<button type="button" class="rm-tier${open ? '' : ' locked'}${t === cur ? ' cur' : ''}" data-t="${t}" ${open ? '' : 'aria-disabled="true"'}><span class="pic" ${open ? '' : `data-need="Level ${T.level}"`}><img src="assets/room/tiers/t${t}-s.webp" alt="" loading="lazy"></span><span class="cap">${t}. ${esc(T.name)}<small>${t === cur ? 'Your room' : open ? `${RT.slots(t).length} slots` : `${fmt(T.level - L)} levels to go`}</small></span></button>`; }).join('')}</div>`);
    n.querySelector('[data-x]').addEventListener('click', () => setMode('custom'));
    n.querySelectorAll('.rm-tier:not(.locked)').forEach(b => b.addEventListener('click', () => {
      const t = +b.dataset.t, r = load();
      r.tier = t === RT.tierFor(level()) ? null : t; save(r);
      const d = mine(); view.set({ tier: d.tier, equip: d.equip, earned: d.earned, data: d.data });
      sfx(true); setMode('custom');
    }));
  }

  // ---------- achievements
  function paintAch() {
    const d = mine(), have = new Set(d.earned), T = RT.TIERS[view.tier], cap = (T.case || T.pins || []).length;
    const n = ui('rm-sheet', `<button type="button" class="rm-x" data-x>Close</button><h2>Achievements</h2><p>Earned, never sold. The best ${cap} stand in your room's ${T.pins ? 'corkboard' : 'case'}; higher tiers have more room.</p>
      <div class="rm-ach">${[...RT.TROPHIES].sort((a, b) => have.has(b.id) - have.has(a.id)).map(t => `<div class="rm-a${have.has(t.id) ? '' : ' no'}"><img src="assets/room/items/${t.art}.webp" alt="" loading="lazy"><div><b>${esc(t.name)}</b><span>${have.has(t.id) ? 'Earned' : esc(t.how)}</span></div></div>`).join('')}</div>`);
    n.querySelector('[data-x]').addEventListener('click', () => setMode('custom'));
  }

  // ---------- visit a room
  function paintVisits() {
    const n = ui('rm-sheet', `<button type="button" class="rm-x" data-x>Close</button><h2>Visit a room</h2><p>Players online now. Open a room to look around.</p><div class="rm-visit" data-list><div class="loading-state">Loading</div></div>`);
    n.querySelector('[data-x]').addEventListener('click', () => setMode('custom'));
    const list = n.querySelector('[data-list]');
    const show = ps => {
      if (!list.isConnected) return;
      list.innerHTML = '';
      for (const p of ps) {
        const a = document.createElement('a'); a.className = 'rm-v'; a.href = `#/u/${encodeURIComponent(p.id)}/room`;
        const tier = RT.tierFor(p.art ? 99 : p.level || 1);   // a test room's level is set for its tier
        a.innerHTML = `<span class="pic"></span><span class="cap">${esc(p.name)}<small>Level ${p.art ? 99 : p.level || 1} · ${esc(RT.TIERS[tier].name)}</small></span>`;
        list.append(a);
        thumb(a.querySelector('.pic'), p);
      }
    };
    const art = { id: 'art', name: 'Art', art: true, level: 99, stats: { bestWpm: 204, avgWpm: 204, acc: 98.5 } };
    // TEST: one dressed room at each tier
    const tests = TEST ? [1, 2, 3, 4, 5].map(n => ({ id: `test_room_t${n}`, name: `Test room ${n}`, level: RT.LEVELS[n - 1] + 2, stats: { bestWpm: 80 + n * 20, avgWpm: 70 + n * 20, acc: 95 } })) : [];
    (window.Lazy ? Lazy.need('net') : Promise.reject()).then(() => Net.profiles.online()).then(on => Promise.all(on.slice(0, 11).map(p => Net.profiles.get(p.id).catch(() => p))))
      .then(ps => show([art, ...tests, ...ps.sort((a, b) => (b.level || 0) - (a.level || 0))]))
      .catch(() => show([art, ...tests]));
  }

  // ---------- someone else's room
  function paintVisit(p, d) {
    const T = RT.TIERS[d.tier];
    const me = p.id === 'me';
    const n = ui('rm-visitbar', `<h1>${me ? 'Your room' : `${esc(d.data.name || p.name)}'s room`}</h1><p>Tier ${d.tier} // ${esc(T.name)} · Level ${p.art ? 99 : d.data.level}</p>
      <div class="row"><a class="btn out sm" href="#/u/${encodeURIComponent(p.id)}">Profile</a>${me ? '' : p.art ? '<a class="btn sm" href="#/duel/art">Challenge Art</a>' : `<a class="btn sm" href="#/duel/vs/${encodeURIComponent(p.id)}">Challenge to a duel</a>`}<a class="btn out sm" href="#/room">${me ? 'Customise' : 'My Room'}</a></div>`);
    if (me) return;
    n.setAttribute('aria-label', 'Visiting');
    const mineT = activeTier(), L = level();
    if (d.tier > mineT && !TEST) ui('rm-op', `<div class="l">Your room</div><div class="lv">Tier <b>${mineT}</b></div><div class="next">${LOCK}<span>${esc(T.name)} unlocks at <b>level ${T.level}</b>. You're level ${L}.</span></div>`);
  }

  function unmount() {
    offs.forEach(f => f()); offs = [];
    if (view) view.dispose();
    if (root) root.remove();
    view = null; root = null; state = null;
  }

  // the Rooms tab on #/leaderboard reads this
  function summary() {
    const d = mine(), T = RT.TIERS[d.tier];
    const value = Object.values(d.equip).reduce((s, id) => s + ((RT.get(id) || {}).price || 0), 0);
    return { tier: d.tier, label: T.name, w: T.size[0], d: T.size[1], area: T.size[0] * T.size[1], items: Object.values(d.equip).filter(Boolean).length, value };
  }

  window.Room = { mount, unmount, summary };
})();
