// World boss network adapter. The page talks only to window.WorldBossNet so a
// server version can replace LocalDemo without touching the page.
//
//   WorldBossNet.connect({ id, name })    -> Promise<state>   join the current fight
//   WorldBossNet.now()                    -> ms               the fight clock (server time)
//   WorldBossNet.peek()                   -> Promise<{ hp, maxHp, phase, raiders, defeatedAt, startedAt } | null>  without joining
//   WorldBossNet.sendDamage(letters, opt) -> void             one correctly typed word from the stack, or one spell hit
//                                                             opt: { crit, jam } from the player's streak and missed blocks
//                                                             plus the combat layer's { mult, tier, pierce, color } and,
//                                                             for a spell hit, { kind: 'spell', spell: id } with letters = its damage.
//                                                             A server must check mult against the player's combo, statuses
//                                                             and casts rather than trust it (see COMBAT.md).
//   WorldBossNet.sendBlock(attackId, text, opt) -> Promise<{ ok }> the counter word typed before the hit
//                                                             opt.grace: ms past the hit still allowed (cryo lock, up to 6000)
//   WorldBossNet.sendReturn(shotId, word)   -> Promise<{ ok }> a thrown word sent back
//   WorldBossNet.sendAddKill(addId, word)   -> Promise<{ ok }> an add destroyed
//   WorldBossNet.onState(fn)              -> unsubscribe      fn(state), a few times a second
//   WorldBossNet.onHit(fn)                -> unsubscribe      fn(hit) for every hit on the boss
//   WorldBossNet.onEvent(fn)              -> unsubscribe      fn(event) for raid events
//   WorldBossNet.newBoss()                -> Promise<state>   start the next fight
//   WorldBossNet.disconnect()
//   WorldBossNet.use(impl)                swap the implementation (same methods)
//
// state: { bossId, name, maxHp, hp, dealt, startedAt, defeatedAt, lastHit, demo,
//          phase, phaseAt: [ms per phase], shield: { id, hp, max } | null,
//          weak: { until, mult } | null, blocks: { [attackId]: count }, addsDown: { [addId]: name },
//          raiders: [{ id, name, damage, blocks, you }] }   raiders sorted by damage, highest first
// hit:   { id, name, letters, dmg, kind: 'word' | 'return' | 'block' | 'add' | 'spell', crit, weak, shield, at, you, tier, spell, color }
// event: { type: 'phase' | 'shieldUp' | 'shieldBreak' | 'adds' | 'addDown' | 'impact' | 'team' | 'defeat', ... }
//   team: { tier: 'hardened' | 'overclock' | 'root', up, by } when the team firewall crosses 50, 75 or 100
//
// The phase is WorldBossRules.phaseOf(hp / maxHp) and the attacks come from
// WorldBossRules.eventsAt(state, now), so the only shared values a server has
// to send are in the state above.
//
// LocalDemo runs the fight in this browser. The other raiders are simulated
// (40 named raiders typing 40 to 150 wpm) until the server is live.
// The fight is saved in localStorage so a reload continues it.
window.WorldBossNet = (() => {
  // The rules are read when the fight starts rather than when this file loads,
  // so the script order can never leave them undefined here.
  let R = null;
  const rules = () => (R ||= window.WorldBossRules);

  const LocalDemo = (() => {
    const KEY = 'wpm-boss-v1';
    const RAIDERS = 40;
    let st = null, me = null, timer = 0, saveT = 0, last = 0, lastTick = 0, simScale = 1, healAcc = 0;
    let sims = [], plans = {};
    const stateSubs = new Set(), hitSubs = new Set(), eventSubs = new Set();

    const rnd = (a, b) => a + Math.random() * (b - a);
    // operator-style names; the first part is short and different for each, since squadmates
    // type it as a handle to heal, cover or revive them (js/app/boss-squad.js)
    const NA = ['vex', 'rune', 'kite', 'nova', 'byte', 'echo', 'flux', 'zed', 'mira', 'juno', 'pixel', 'sora', 'tako', 'lumen', 'orbit', 'quill', 'rook', 'sable', 'tide', 'ember',
      'kilo', 'nyx', 'onyx', 'pike', 'dash', 'fern', 'glyph', 'hex', 'ion', 'jolt', 'koi', 'lark', 'moss', 'nim', 'opal', 'plume', 'quark', 'reef', 'silk', 'tron'];
    const NB = ['tem', 'sol', 'dex', 'arc', 'vin', 'mo', 'ka', 'ri'];
    const name = i => `${NA[i % NA.length]}_${NB[(i * 7) % NB.length]}${10 + (i * 37) % 90}`;
    const now = () => Date.now();
    const nameOf = r => (r.id === 'you' && me ? me.name : r.name);

    function fresh() {
      const raiders = Array.from({ length: RAIDERS }, (_, i) => ({ id: 'sim' + i, name: name(i), damage: 0, blocks: 0, wpm: Math.round(rnd(40, 150)), acc: rnd(0.9, 0.99) }));
      const t = now();
      return blank({ bossId: t.toString(36), name: R.BOSS.name, maxHp: R.BOSS.maxHp, hp: R.BOSS.maxHp, startedAt: t, defeatedAt: null, lastHit: null, raiders });
    }
    // fills in the fields an older save does not have
    function blank(s) {
      s.name = R.BOSS.name;
      s.phase = R.phaseOf(s.hp / s.maxHp);
      if (!Array.isArray(s.phaseAt)) { s.phaseAt = [s.startedAt, null, null, null, null]; if (s.phase) s.phaseAt[s.phase] = now(); }
      s.shield ||= null; s.weak ||= null; s.blocks ||= {}; s.addsDown ||= {}; s.done ||= {}; s.team ||= { fw: 0, rootUntil: 0 };
      s.raiders.forEach((r, i) => { r.blocks ||= 0; if (/^raider_\d+$/.test(r.name || '')) r.name = name(i); });
      return s;
    }
    function load() {
      try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.maxHp && s.raiders) return blank(s); } catch (e) {}
      return null;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

    function snapshot() {
      const raiders = st.raiders.map(r => ({ id: r.id, name: nameOf(r), damage: r.damage, blocks: r.blocks || 0, you: r.id === 'you' }))
        .sort((a, b) => b.damage - a.damage);
      return {
        bossId: st.bossId, name: st.name, maxHp: st.maxHp, hp: st.hp, dealt: st.maxHp - st.hp, startedAt: st.startedAt, defeatedAt: st.defeatedAt,
        lastHit: st.lastHit, demo: true, phase: st.phase, phaseAt: st.phaseAt.slice(), shield: st.shield && { ...st.shield }, weak: st.weak && { ...st.weak },
        blocks: { ...st.blocks }, addsDown: { ...st.addsDown }, raiders,
        team: { ...(st.team || { fw: 0, rootUntil: 0 }) },
      };
    }
    const fan = (subs, x) => subs.forEach(f => { try { f(x); } catch (e) { console.error(e); } });
    const emit = () => fan(stateSubs, snapshot());
    const emitHit = h => fan(hitSubs, h);
    const emitEvent = e => fan(eventSubs, e);

    function setPhase(t) {
      const p = R.phaseOf(st.hp / st.maxHp);
      if (p <= st.phase || st.defeatedAt) return;
      st.phase = p; st.phaseAt[p] = t;
      // a phase change ends the shield, the weak point and the attacks in flight
      st.shield = null; st.weak = null; st.blocks = {}; st.addsDown = {}; st.done = {}; plans = {};
      emitEvent({ type: 'phase', phase: p, at: t });
      emit();
    }

    // Damage to the boss goes into the shield first.
    function damage(id, letters, kind = 'word', opts = {}) {
      if (st.defeatedAt || letters <= 0) return null;
      const r = st.raiders.find(x => x.id === id);
      if (!r) return null;
      const t = now();
      const weak = R.weakMult(st, t) > 1;
      const base = kind === 'return' ? letters * R.RETURN_X : kind === 'block' ? letters * R.BLOCK_X : letters;
      if (kind === 'return') team(R.TEAM.ret, t, nameOf(r));
      if (R.teamRoot(st, t)) opts = { ...opts, pierce: true };      // root access goes through the boss's firewall
      // the combat layer's multiplier (combo tier, accuracy, speed, buffs) for words; spells arrive already multiplied
      const cm = kind === 'word' ? Math.max(0.5, Math.min(20, +opts.mult || 1)) : 1;
      let dmg = Math.max(1, Math.round(base * cm * R.multiplier(st, t, opts)));
      let toShield = 0;
      if (st.shield && !opts.pierce) {
        toShield = Math.min(dmg, st.shield.hp);
        st.shield.hp -= toShield;
        r.damage += toShield;
        if (st.shield.hp <= 0) {
          const sid = st.shield.id;
          st.shield = null; st.done['s:' + sid] = 1;
          st.weak = { until: t + R.WEAK_MS, mult: R.PHASES[st.phase].weakMult };
          emitEvent({ type: 'shieldBreak', by: nameOf(r), you: id === 'you', at: t });
        }
      }
      const toHp = Math.min(dmg - toShield, st.hp);
      st.hp -= toHp;
      r.damage += toHp;
      dmg = toShield + toHp;
      const h = { id, name: nameOf(r), letters, dmg, kind, crit: !!opts.crit, weak, shield: toShield > 0 && toHp === 0, at: t, you: id === 'you',
        tier: opts.tier || 0, spell: opts.spell || null, color: opts.color || null };
      emitHit(h);
      if (st.hp <= 0) {
        st.hp = 0; st.defeatedAt = t; st.lastHit = nameOf(r); st.shield = null;
        emitEvent({ type: 'defeat', by: st.lastHit, you: id === 'you', at: t });
        save(); emit();
      } else setPhase(t);
      return h;
    }

    // ---------- the team firewall (WorldBossRules.TEAM) ----------
    function team(add, t = now(), who) {
      st.team ||= { fw: 0, rootUntil: 0 };
      const T = st.team, was = T.fw;
      if (T.rootUntil > t && add > 0) return;               // the meter rests during root access
      T.fw = Math.max(0, Math.min(100, T.fw + add));
      for (const tr of R.TEAM.tiers) if (was < tr.at && T.fw >= tr.at) emitEvent({ type: 'team', tier: tr.id, up: true, by: who || null, at: t });
      for (const tr of R.TEAM.tiers) if (was >= tr.at && T.fw < tr.at && tr.id !== 'root') emitEvent({ type: 'team', tier: tr.id, up: false, at: t });
      if (T.fw >= 100) { T.rootUntil = t + R.TEAM.root; T.fw = R.TEAM.after; }
    }

    // ---------- attacks: the schedule is shared, the outcomes are kept here ----------
    function liveAdd(e, a, t) { return t >= a.spawn && t < a.until && !st.addsDown[a.id]; }
    function runEvents(t, dt) {
      const evs = R.eventsAt(st, t, 600);
      for (const e of evs) {
        if (e.type === 'slam') {
          // simulated raiders block most attacks, fewer in later phases
          if (!plans[e.id]) {
            const p = [0.72, 0.66, 0.6, 0.55, 0.5][st.phase];
            plans[e.id] = sims.filter(() => Math.random() < p).map(s => ({ s, at: rnd(e.start + 1200, e.hit - 150) }));
          }
          for (const b of plans[e.id]) if (!b.done && t >= b.at && t < e.hit) { b.done = true; block(b.s.r.id, e); }
          if (t >= e.hit && !st.done[e.id]) {
            st.done[e.id] = 1;
            // a late tick still counts the blocks that were typed before the hit
            for (const b of plans[e.id]) if (!b.done && b.at < e.hit) { b.done = true; block(b.s.r.id, e); }
            const n = st.blocks[e.id] || 0, of = st.raiders.length;
            const stun = n / of >= R.STAGGER_SHARE;
            if (stun) st.weak = { until: e.hit + R.WEAK_MS, mult: R.PHASES[st.phase].weakMult };
            team(stun ? R.TEAM.stun : -R.TEAM.miss, t);
            emitEvent({ type: 'impact', id: e.id, kind: e.kind, blocks: n, of, stun, at: e.hit });
          }
        } else if (e.type === 'volley') {
          if (!plans[e.id]) plans[e.id] = e.shots.filter(() => Math.random() < 0.35).map(sh => ({ sh, s: sims[Math.floor(Math.random() * sims.length)], at: rnd(sh.launch + 800, sh.arrive - 300) }));
          for (const b of plans[e.id]) if (!b.done && t >= b.at) { b.done = true; damage(b.s.r.id, b.sh.word.length, 'return'); }
        } else if (e.type === 'adds') {
          if (!st.done[e.id] && t >= e.adds[0].spawn) { st.done[e.id] = 1; emitEvent({ type: 'adds', id: e.id, n: e.adds.length, at: t }); }
          if (!plans[e.id]) plans[e.id] = e.adds.map(a => ({ a, s: sims[Math.floor(Math.random() * sims.length)], at: a.spawn + rnd(3000, 11000) / Math.max(0.5, simScale) }));
          for (const b of plans[e.id]) if (!b.done && t >= b.at && liveAdd(e, b.a, t)) { b.done = true; killAdd(b.s.r.id, b.a); }
          // each living add heals the boss, never past the top of the current phase
          let n = 0;
          for (const a of e.adds) if (liveAdd(e, a, t)) n++;
          if (n && !st.defeatedAt) {
            healAcc += n * e.heal * dt;
            const whole = Math.floor(healAcc);
            healAcc -= whole;
            st.hp = Math.min(R.ceiling(st.phase, st.maxHp), st.hp + whole);
          }
        } else if (e.type === 'shield') {
          if (t >= e.up && !st.done['s:' + e.id] && !st.done[e.id]) {
            st.done[e.id] = 1;
            const max = R.shieldMax(st.raiders.length);
            st.shield = { id: e.id, hp: max, max };
            emitEvent({ type: 'shieldUp', id: e.id, max, at: t });
          }
        }
      }
    }
    function block(id, e) {
      const r = st.raiders.find(x => x.id === id);
      st.blocked ||= {};
      const k = e.id + ':' + id;
      if (st.blocked[k]) return false;
      st.blocked[k] = 1;
      st.blocks[e.id] = (st.blocks[e.id] || 0) + 1;
      r.blocks = (r.blocks || 0) + 1;
      team(R.TEAM.block, now(), nameOf(r));
      damage(id, e.word.replace(/ /g, '').length, 'block');
      return true;
    }
    function killAdd(id, a) {
      const r = st.raiders.find(x => x.id === id);
      st.addsDown[a.id] = nameOf(r);
      emitEvent({ type: 'addDown', id: a.id, by: nameOf(r), you: id === 'you', at: now() });
      team(R.TEAM.add, now(), nameOf(r));
      damage(id, a.word.length, 'add');
    }
    function findEvent(t, test) { return R.eventsAt(st, t).find(test); }

    // ---------- simulated raiders ----------
    // Each one types a word at a time at its own speed and misses a word now and then.
    function simInit() {
      sims = st.raiders.filter(r => r.id !== 'you').map(r => ({ r, next: performance.now() + rnd(0, 2500), len: 0 }));
    }
    // HP a skip takes off goes to the simulated raiders by typing speed, as if
    // they had dealt it, so the damage and shares on the board stay believable
    function spread(n) {
      if (n <= 0 || !sims.length) return;
      const w = sims.map(s => (s.r.wpm || 80) * (s.r.acc || 0.95) * rnd(0.85, 1.15));
      const sum = w.reduce((a, b) => a + b, 0);
      let left = n;
      sims.forEach((s, i) => {
        const d = i === sims.length - 1 ? Math.max(0, left) : Math.min(left, Math.round(n * w[i] / sum));
        s.r.damage += d; left -= d;
      });
    }
    const simTier = c => { const T = window.Combat && Combat.TIERS; if (!T) return 0; let i = 0; T.forEach((x, k) => { if (c >= x.at) i = k; }); return i; };
    function wordLen() { const x = Math.random(); return x < 0.18 ? Math.round(rnd(8, 12)) : Math.round(rnd(2, 7)); }
    function tick() {
      const pn = performance.now(), t = now();
      const dt = lastTick ? Math.min(0.5, (t - lastTick) / 1000) : 0.05;
      lastTick = t;
      if (st.defeatedAt) return;
      for (const s of sims) {
        if (pn < s.next || s.r.down) continue;
        // each simulated raider keeps a combo so its shots show in its tier's colour; the
        // tier only changes the picture, never the damage, so the raid's numbers stay as tuned
        if (s.len && Math.random() < s.r.acc) { s.combo = (s.combo || 0) + 1; damage(s.r.id, s.len * simScale, 'word', { tier: simTier(s.combo) }); }
        else if (s.len) s.combo = Math.floor((s.combo || 0) * 0.4);
        if (st.defeatedAt) return;
        s.len = wordLen();
        const perChar = 60000 / ((s.r.wpm || 80) * 5);
        s.next = pn + (s.len + 1) * perChar * rnd(0.7, 1.35) + (Math.random() < 0.04 ? rnd(1500, 5000) : 0);
      }
      runEvents(t, dt);
      if (st.team && st.team.fw > 0) team(-R.TEAM.drain * dt, t);
      if (st.blocked && Object.keys(st.blocked).length > 600) st.blocked = {};
      if (pn - last > 250) { last = pn; emit(); }
      if (pn - saveT > 2000) { saveT = pn; save(); }
    }

    return {
      async connect(who) {
        rules();
        me = { id: 'you', name: (who && who.name) || 'You' };
        st = load() || fresh();
        if (!st.raiders.find(r => r.id === 'you')) st.raiders.push({ id: 'you', name: me.name, damage: 0, blocks: 0 });
        simInit(); plans = {}; lastTick = 0;
        clearInterval(timer);
        timer = setInterval(tick, 50);
        save();
        return snapshot();
      },
      now,
      sendDamage(letters, opts) { opts ||= {}; if (st) damage('you', Math.max(0, Math.round(letters)), opts.kind === 'spell' ? 'spell' : 'word', opts); },
      async sendBlock(id, text, opts) {
        const t = now(), grace = Math.max(0, Math.min(6000, (opts && opts.grace) || 0));
        const e = st && R.eventsAt(st, t, grace).find(x => x.type === 'slam' && x.id === id);
        // a slower raider blocks with the shorter word for their tier (WorldBossRules.blockWord)
        const want = opts && opts.tier != null ? R.blockWord(e, opts.tier) : e.word;
        if (!e || t >= e.hit + grace || text !== want) return { ok: false };
        return { ok: block('you', e) };
      },
      async sendReturn(id, word) {
        const t = now();
        const e = st && findEvent(t, x => x.type === 'volley' && x.shots.some(s => s.id === id));
        const sh = e && e.shots.find(s => s.id === id);
        st.returned ||= {};
        if (!sh || t < sh.launch || t >= sh.arrive || word !== sh.word || st.returned[id]) return { ok: false };
        st.returned[id] = 1;
        damage('you', word.length, 'return');
        return { ok: true };
      },
      async sendAddKill(id, word) {
        const t = now();
        const e = st && findEvent(t, x => x.type === 'adds' && x.adds.some(a => a.id === id));
        const a = e && e.adds.find(x => x.id === id);
        if (!a || !liveAdd(e, a, t) || word !== a.word) return { ok: false };
        killAdd('you', a);
        return { ok: true };
      },
      onState(fn) { stateSubs.add(fn); return () => stateSubs.delete(fn); },
      // the fight as it stands, without joining it (the cover before the fight)
      peek() {
        const s = st || load();
        if (!s) return Promise.resolve(null);
        return Promise.resolve({ hp: s.hp, maxHp: s.maxHp, phase: R.phaseOf(s.hp / s.maxHp), raiders: s.raiders.filter(r => r.id !== 'you').length + 1, defeatedAt: s.defeatedAt, startedAt: s.startedAt });
      },
      onHit(fn) { hitSubs.add(fn); return () => hitSubs.delete(fn); },
      onEvent(fn) { eventSubs.add(fn); return () => eventSubs.delete(fn); },
      async newBoss() {
        rules();
        st = fresh();
        st.raiders.push({ id: 'you', name: me ? me.name : 'You', damage: 0, blocks: 0 });
        simInit(); plans = {}; save(); emit();
        return snapshot();
      },
      disconnect() { clearInterval(timer); timer = 0; if (st) save(); stateSubs.clear(); hitSubs.clear(); eventSubs.clear(); },
      // demo only: move the fight forward so every phase can be seen without an hour of typing
      demo: {
        jumpTo(p) {
          if (!st || st.defeatedAt || p <= st.phase) return;
          const hp = Math.min(st.hp, R.ceiling(p, st.maxHp) - 1);
          spread(st.hp - hp);
          st.hp = hp;
          setPhase(now()); save(); emit();
        },
        setFrac(f) {
          if (!st) return;
          const hp = Math.max(1, Math.round(st.maxHp * f));
          spread(st.hp - hp);
          st.hp = hp;
          if (st.phase > R.phaseOf(f)) { st.phase = R.phaseOf(f); }
          setPhase(now()); save(); emit();
        },
        simScale(x) { simScale = x; },
        // a squadmate who is down stops dealing damage until they're back (js/app/boss-squad.js)
        setDown(id, on) { const r = st && st.raiders.find(x => x.id === id); if (r) r.down = !!on; },
        // the simulated raiders, for picking squadmates
        raiders: () => (st ? st.raiders.filter(r => r.id !== 'you').map(r => ({ id: r.id, name: nameOf(r), wpm: r.wpm, acc: r.acc })) : []),
      },
    };
  })();

  let impl = LocalDemo;
  return {
    get MAX_HP() { return rules().BOSS.maxHp; },
    LocalDemo,
    use(next) { impl = next; },
    connect: who => impl.connect(who),
    peek: () => (impl.peek ? impl.peek() : Promise.resolve(null)),
    now: () => (impl.now ? impl.now() : Date.now()),
    sendDamage: (letters, opts) => impl.sendDamage(letters, opts),
    sendBlock: (id, text, opts) => impl.sendBlock(id, text, opts),
    sendReturn: (id, word) => impl.sendReturn(id, word),
    sendAddKill: (id, word) => impl.sendAddKill(id, word),
    onState: fn => impl.onState(fn),
    onHit: fn => impl.onHit(fn),
    onEvent: fn => impl.onEvent(fn),
    newBoss: () => impl.newBoss(),
    disconnect: () => impl.disconnect(),
    demo: () => impl.demo || null,
  };
})();
