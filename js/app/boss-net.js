// World boss network adapter. The page talks only to window.WorldBossNet so a
// server version can replace LocalDemo without touching the page.
//
//   WorldBossNet.connect({ id, name })  -> Promise<state>   join the current fight
//   WorldBossNet.sendDamage(letters)    -> void             one correctly typed word
//   WorldBossNet.onState(fn)            -> unsubscribe      fn(state), a few times a second
//   WorldBossNet.onHit(fn)              -> unsubscribe      fn({ id, name, letters, at, you })
//   WorldBossNet.newBoss()              -> Promise<state>   start the next fight
//   WorldBossNet.disconnect()
//   WorldBossNet.use(impl)              swap the implementation (same six methods)
//
// state: { bossId, name, maxHp, hp, dealt, startedAt, defeatedAt, lastHit, demo,
//          raiders: [{ id, name, damage, you }] }   raiders sorted by damage, highest first
//
// LocalDemo runs the fight in this browser. The other raiders are simulated
// (raider_01 to raider_40, typing 40 to 150 wpm) until the server is live.
// The fight is saved in localStorage so a reload continues it.
window.WorldBossNet = (() => {
  const MAX_HP = 1000000;

  const LocalDemo = (() => {
    const KEY = 'wpm-boss-v1';
    const START_HP = 300000;        // a new demo boss starts part way through the fight
    const RAIDERS = 40;
    let st = null, me = null, timer = 0, saveT = 0, last = 0;
    let sims = [];
    const stateSubs = new Set(), hitSubs = new Set();

    const rnd = (a, b) => a + Math.random() * (b - a);
    const name = i => 'raider_' + String(i + 1).padStart(2, '0');

    function fresh() {
      // the letters already dealt are split across the simulated raiders
      const dealt = MAX_HP - START_HP;
      const w = Array.from({ length: RAIDERS }, () => rnd(0.4, 1.6));
      const sum = w.reduce((a, b) => a + b, 0);
      const raiders = w.map((x, i) => ({ id: 'sim' + i, name: name(i), damage: Math.round(dealt * x / sum), wpm: Math.round(rnd(40, 150)), acc: rnd(0.9, 0.99) }));
      const fix = dealt - raiders.reduce((a, r) => a + r.damage, 0);
      raiders[0].damage += fix;
      return { bossId: Date.now().toString(36), name: 'Overflow', maxHp: MAX_HP, hp: START_HP, startedAt: Date.now(), defeatedAt: null, lastHit: null, raiders };
    }
    function load() {
      try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.maxHp && s.raiders) return s; } catch (e) {}
      return null;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

    function snapshot() {
      const raiders = st.raiders.map(r => ({ id: r.id, name: r.id === 'you' && me ? me.name : r.name, damage: r.damage, you: r.id === 'you' }))
        .sort((a, b) => b.damage - a.damage);
      return { bossId: st.bossId, name: st.name, maxHp: st.maxHp, hp: st.hp, dealt: st.maxHp - st.hp, startedAt: st.startedAt, defeatedAt: st.defeatedAt, lastHit: st.lastHit, demo: true, raiders };
    }
    function emit() { const s = snapshot(); stateSubs.forEach(f => { try { f(s); } catch (e) { console.error(e); } }); }
    function emitHit(h) { hitSubs.forEach(f => { try { f(h); } catch (e) { console.error(e); } }); }

    function damage(id, letters) {
      if (st.defeatedAt || letters <= 0) return;
      const r = st.raiders.find(x => x.id === id);
      const dealt = Math.min(letters, st.hp);
      st.hp -= dealt;
      r.damage += dealt;
      if (st.hp <= 0) { st.hp = 0; st.defeatedAt = Date.now(); st.lastHit = r.id === 'you' && me ? me.name : r.name; save(); emit(); }
      emitHit({ id, name: r.id === 'you' && me ? me.name : r.name, letters: dealt, at: Date.now(), you: id === 'you' });
    }

    // Each simulated raider types one word at a time at its own speed and
    // misses a word now and then. A missed word deals nothing.
    function simInit() {
      sims = st.raiders.filter(r => r.id !== 'you').map(r => ({ r, next: performance.now() + rnd(0, 2500), len: 0 }));
    }
    function wordLen() { const x = Math.random(); return x < 0.18 ? Math.round(rnd(8, 12)) : Math.round(rnd(2, 7)); }
    function tick() {
      const now = performance.now();
      if (st.defeatedAt) return;
      for (const s of sims) {
        if (now < s.next) continue;
        if (s.len && Math.random() < s.r.acc) damage(s.r.id, s.len);
        s.len = wordLen();
        // letters plus the space, at the raider's speed, with some spread between words
        const perChar = 60000 / ((s.r.wpm || 80) * 5);
        s.next = now + (s.len + 1) * perChar * rnd(0.7, 1.35) + (Math.random() < 0.04 ? rnd(1500, 5000) : 0);
      }
      if (now - last > 250) { last = now; emit(); }
      if (now - saveT > 2000) { saveT = now; save(); }
    }

    return {
      async connect(who) {
        me = { id: 'you', name: (who && who.name) || 'You' };
        st = load() || fresh();
        if (!st.raiders.find(r => r.id === 'you')) st.raiders.push({ id: 'you', name: me.name, damage: 0 });
        simInit();
        clearInterval(timer);
        timer = setInterval(tick, 50);
        save();
        return snapshot();
      },
      sendDamage(letters) { if (st) damage('you', Math.max(0, Math.round(letters))); },
      onState(fn) { stateSubs.add(fn); return () => stateSubs.delete(fn); },
      onHit(fn) { hitSubs.add(fn); return () => hitSubs.delete(fn); },
      async newBoss() {
        st = fresh();
        st.raiders.push({ id: 'you', name: me ? me.name : 'You', damage: 0 });
        simInit(); save(); emit();
        return snapshot();
      },
      disconnect() { clearInterval(timer); timer = 0; if (st) save(); stateSubs.clear(); hitSubs.clear(); },
    };
  })();

  let impl = LocalDemo;
  return {
    MAX_HP, LocalDemo,
    use(next) { impl = next; },
    connect: who => impl.connect(who),
    sendDamage: letters => impl.sendDamage(letters),
    onState: fn => impl.onState(fn),
    onHit: fn => impl.onHit(fn),
    newBoss: () => impl.newBoss(),
    disconnect: () => impl.disconnect(),
  };
})();
