// Squads in the World Boss (Art and Gid, 24 Nov 2026; CTRL.md "World Boss squads").
// Every operator fights Syntax Error in a squad of four. Operators have integrity (HP)
// and can go down, and the squad keeps each other up:
//   - the boss locks on to one squad member every 9 to 14 seconds; the target types a
//     dodge word sized to their own speed, and a Sentinel can cover them by typing
//     their handle
//   - an Architect heals a squadmate by typing their handle (with no Architect in the
//     squad, anyone heals at half strength)
//   - anyone revives a downed squadmate by typing their handle
//   - a downed operator reboots after 10 seconds, and every clean word they type takes a
//     second off; Recruits (CL-01) can't go down at all
// The squad runs in this browser for now: the other three are simulated raiders from the
// demo (js/app/boss-net.js), so their damage keeps counting on the scoreboard.
//
//   const sq = BossSquad.create({ now, me: { name, division, recruit, wpm }, raiders, demo })
//   sq.tick(t, phase)        moves the clock: lock-ons, bots healing, covering and reviving, reboots
//   sq.targets(t)            typing targets for the word row: { kind, id, word, due, total, who }
//   sq.act(m, t)             the player typed target m -> { kind, who, amount }
//   sq.hitMe(dmg, t)         an attack reached the player -> { hp, down, shielded }
//   sq.raidHit(dmg)          a raid attack hit the whole raid; the bots who didn't block take it
//   sq.cleanWord()           a clean word typed while down takes a second off the reboot
//   sq.down() / sq.members() / sq.stats() / sq.on(event, fn) / sq.destroy()
//   events: lock, dodge, covered, hit, down, up, heal, revive
window.BossSquad = (() => {
  const HP = 100;
  const DOWN_MS = 10000, WORD_OFF = 1000, REBOOT_HP = 50, REVIVE_HP = 40;
  const LOCK_WIND = 4500;                       // ms from a lock-on to its hit
  const LOCK_EVERY = [9000, 14000];             // ms between lock-ons, shortened by the phase
  const lockDmg = () => 25;                     // one of your four integrity pips (boss.js)
  const HEAL = 25, HEAL_CD = 4000;              // an Architect's heal
  const HEAL_HALF = 12, HEAL_HALF_CD = 6000;    // anyone's heal when the squad has no Architect
  const HEAL_BELOW = 0.75;                      // heal targets show under this much integrity
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // a squadmate's handle: the first run of letters in their name, 3 to 8 long and unique
  function handles(names) {
    const used = new Set(), out = [];
    for (const n of names) {
      let h = ((String(n).toLowerCase().match(/[a-z]{3,}/) || ['op'])[0]).slice(0, 8);
      if (h.length < 3) h = (h + 'xyz').slice(0, 3);
      let k = h, i = 2;
      while (used.has(k)) k = h.slice(0, 6) + (i++);
      used.add(k); out.push(k);
    }
    return out;
  }

  function create(o) {
    const now = o.now;
    const L = {};
    const on = (ev, fn) => { (L[ev] ||= []).push(fn); return () => { L[ev] = L[ev].filter(f => f !== fn); }; };
    const emit = (ev, d) => (L[ev] || []).forEach(f => f(d));
    const DIVS = (window.Combat && Combat.Perks ? Combat.Perks.DIVISIONS.map(d => d.id) : ['striker', 'precision', 'hunter', 'sentinel', 'ghost', 'architect']);

    // ---------- who is in the squad ----------
    // Three raiders from the demo. If you're neither a Sentinel nor an Architect, one of them is.
    const pool = (o.raiders || []).slice().sort(() => Math.random() - 0.5).slice(0, 3);
    while (pool.length < 3) pool.push({ id: 'squad' + pool.length, name: pick(['vex', 'nova', 'kite', 'rune', 'byte', 'echo']) + Math.floor(rnd(10, 99)), wpm: rnd(40, 120), acc: 0.94 });
    const myDiv = o.me.division || null;
    const divs = pool.map(() => pick(DIVS));
    if (myDiv !== 'sentinel' && myDiv !== 'architect' && !divs.some(d => d === 'sentinel' || d === 'architect')) divs[Math.floor(Math.random() * 3)] = pick(['sentinel', 'architect']);
    const H = handles([o.me.name, ...pool.map(r => r.name)]);
    const mk = (id, name, division, h, extra) => ({ id, name, division, handle: h, hp: HP, max: HP, down: false, downUntil: 0, lockUntil: 0, lockId: null, healAt: 0, ...extra });
    const M = [mk('you', o.me.name, myDiv, H[0], { you: true, recruit: !!o.me.recruit })]
      .concat(pool.map((r, i) => mk(r.id, r.name, divs[i], H[i + 1], { wpm: Math.round(r.wpm || 70), acc: r.acc || 0.94, demoId: r.id })));
    const youM = M[0];
    M.forEach(m => { if (m.demoId && o.demo && o.demo.setDown) o.demo.setDown(m.demoId, false); });

    const hasArchitect = () => M.some(m => m.division === 'architect' && !m.down);
    const st = { saves: 0, heals: 0, downs: 0, revives: 0, covered: 0, dodges: 0, lockMisses: 0, botSaves: {}, botHeals: {} };
    let nextLock = now() + rnd(6000, 9000), lockSeq = 0, phase = 0;
    const lastAct = {};

    // ---------- integrity ----------
    function hurt(m, dmg, t, why) {
      if (m.down || dmg <= 0) return { hp: m.hp, down: m.down };
      let hp = m.hp - dmg, shielded = false;
      if (m.you && m.recruit && hp < 1) { hp = 1; shielded = true; }
      m.hp = Math.max(0, Math.round(hp));
      emit('hit', { who: m, dmg, why, shielded });
      if (m.hp <= 0) goDown(m, t);
      return { hp: m.hp, down: m.down, shielded };
    }
    function goDown(m, t) {
      m.down = true; m.downUntil = t + DOWN_MS; m.lockUntil = 0; m.lockId = null; m.hp = 0;
      if (m.you) st.downs++;
      if (m.demoId && o.demo && o.demo.setDown) o.demo.setDown(m.demoId, true);
      emit('down', { who: m });
    }
    function up(m, hp, by) {
      m.down = false; m.downUntil = 0; m.hp = hp;
      if (m.demoId && o.demo && o.demo.setDown) o.demo.setDown(m.demoId, false);
      emit(by ? 'revive' : 'up', { who: m, by });
    }
    function heal(m, amount, by) {
      if (m.down) return 0;
      const got = Math.min(amount, m.max - m.hp);
      m.hp += got;
      if (got > 0) emit('heal', { who: m, by, amount: got });
      return got;
    }

    // ---------- the clock ----------
    function tick(t, ph) {
      phase = ph || 0;
      // reboots
      for (const m of M) if (m.down && t >= m.downUntil) up(m, REBOOT_HP, null);
      // a new lock-on
      if (t >= nextLock) {
        const alive = M.filter(m => !m.down && !m.lockUntil);
        if (alive.length) {
          const weights = alive.map(m => (m.you ? 1.3 : 1));
          let x = Math.random() * weights.reduce((a, b) => a + b, 0), m = alive[0];
          for (let i = 0; i < alive.length; i++) { x -= weights[i]; if (x < 0) { m = alive[i]; break; } }
          m.lockUntil = t + LOCK_WIND; m.lockId = 'lock' + (++lockSeq);
          m.dodgeWord = m.you ? (o.dodgeWord ? o.dodgeWord() : 'dodge') : null;
          emit('lock', { who: m, until: m.lockUntil });
          // simulated raiders decide now whether they dodge and whether a Sentinel covers them
          if (!m.you) m.plan = { dodge: Math.random() < 0.5 + (m.acc - 0.9) * 2, at: t + rnd(1200, 3800) };
        }
        const k = 1 - 0.08 * phase;
        nextLock = t + rnd(LOCK_EVERY[0] * k, LOCK_EVERY[1] * k);
      }
      // lock-ons landing, dodges and covers
      for (const m of M) {
        if (!m.lockUntil) continue;
        if (!m.you && m.plan && t >= m.plan.at && m.plan.dodge) { m.lockUntil = 0; m.plan = null; continue; }
        // a simulated Sentinel covers a squadmate a second before the hit
        const sen = M.find(x => !x.you && x !== m && x.division === 'sentinel' && !x.down);
        if (sen && t >= m.lockUntil - 1000 && !m.coverTried) {
          m.coverTried = true;
          if (Math.random() < 0.7) { m.lockUntil = 0; st.botSaves[sen.id] = (st.botSaves[sen.id] || 0) + 1; emit('covered', { who: m, by: sen }); m.coverTried = false; continue; }
        }
        if (t >= m.lockUntil) {
          m.lockUntil = 0; m.coverTried = false;
          if (m.you) st.lockMisses++;
          hurt(m, lockDmg(phase), t, 'lock');
        }
      }
      // simulated healers and revivers
      for (const b of M) {
        if (b.you || b.down) continue;
        if (t < (lastAct[b.id] || 0)) continue;
        const downed = M.find(m => m.down && m !== b && t > m.downUntil - DOWN_MS + 2500);
        if (downed && Math.random() < 0.15) {
          up(downed, REVIVE_HP, b);
          lastAct[b.id] = t + rnd(2500, 4500);
          continue;
        }
        const healer = b.division === 'architect' || !hasArchitect();
        const hurtOne = M.filter(m => !m.down && m.hp < m.max * 0.7).sort((a, c) => a.hp - c.hp)[0];
        if (healer && hurtOne && Math.random() < 0.5) {
          const g = heal(hurtOne, b.division === 'architect' ? HEAL : HEAL_HALF, b);
          st.botHeals[b.id] = (st.botHeals[b.id] || 0) + g;
          lastAct[b.id] = t + (b.division === 'architect' ? rnd(4000, 6000) : rnd(6000, 9000));
          continue;
        }
        lastAct[b.id] = t + rnd(800, 1400);
      }
    }

    // ---------- what the player can type ----------
    function targets(t) {
      const out = [];
      if (youM.down) return out;
      if (youM.lockUntil) out.push({ kind: 'dodge', id: youM.lockId, word: youM.dodgeWord, due: youM.lockUntil, total: LOCK_WIND, who: youM });
      for (const m of M) {
        if (m.you) continue;
        if (m.down) { out.push({ kind: 'revive', id: 'rev:' + m.id, word: m.handle, due: m.downUntil, total: DOWN_MS, who: m }); continue; }
        if (m.lockUntil && youM.division === 'sentinel') out.push({ kind: 'cover', id: 'cov:' + m.lockId, word: m.handle, due: m.lockUntil, total: LOCK_WIND, who: m });
      }
      // one heal at a time: the most hurt squadmate, once the heal is ready
      const arch = youM.division === 'architect';
      if (t >= youM.healAt && (arch || !hasArchitect())) {
        const h = M.filter(m => !m.you && !m.down && m.hp < m.max * HEAL_BELOW && !out.some(x => x.who === m)).sort((a, b) => a.hp - b.hp)[0];
        if (h) out.push({ kind: 'heal', id: 'heal:' + h.id + ':' + Math.floor(youM.healAt), word: h.handle, due: t + 8000, total: 8000, who: h, sticky: true });
      }
      return out;
    }
    function act(m, t) {
      const w = m.who;
      if (m.kind === 'dodge' && youM.lockUntil && youM.lockId === m.id) { youM.lockUntil = 0; st.dodges++; emit('dodge', { who: youM }); return { kind: 'dodge' }; }
      if (m.kind === 'cover' && w.lockUntil) { w.lockUntil = 0; w.coverTried = false; st.saves++; st.covered++; emit('covered', { who: w, by: youM }); return { kind: 'cover', who: w }; }
      if (m.kind === 'revive' && w.down) { up(w, REVIVE_HP, youM); st.saves++; st.revives++; return { kind: 'revive', who: w }; }
      if (m.kind === 'heal' && !w.down) {
        const arch = youM.division === 'architect';
        const got = heal(w, arch ? HEAL : HEAL_HALF, youM);
        st.heals += got;
        youM.healAt = t + (arch ? HEAL_CD : HEAL_HALF_CD);
        return { kind: 'heal', who: w, amount: got };
      }
      return null;
    }
    function hitMe(dmg, t) { return hurt(youM, dmg, t, 'raid'); }
    // a raid-wide attack landed: each simulated squadmate blocked it or took it
    function raidHit(dmg, t) {
      for (const m of M) if (!m.you && !m.down && Math.random() > 0.72 + (m.acc - 0.94)) hurt(m, dmg, t, 'raid');
    }
    function cleanWord() { if (youM.down) youM.downUntil = Math.max(now(), youM.downUntil - WORD_OFF); }

    function stats() {
      return { ...st, members: M.map(m => ({ name: m.name, you: !!m.you, division: m.division, saves: m.you ? st.saves : (st.botSaves[m.id] || 0), heals: m.you ? st.heals : (st.botHeals[m.id] || 0), demoId: m.demoId })) };
    }
    function destroy() { M.forEach(m => { if (m.demoId && o.demo && o.demo.setDown) o.demo.setDown(m.demoId, false); }); }

    return {
      tick, targets, act, hitMe, raidHit, cleanWord, stats, destroy, on,
      // a spell's self heal (Binary rain): f of your max integrity
      healMe: f => heal(youM, Math.round(youM.max * f), 'spell'),
      members: () => M, me: () => youM, down: () => youM.down,
      HP, DOWN_MS, LOCK_WIND,
    };
  }
  return { create, handles };
})();
