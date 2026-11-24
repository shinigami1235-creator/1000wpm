// The player as a CTRL operator (CTRL.md): their division, clearance level and operator
// number. The numbers behind the perks are in js/app/combat/perks.js.
//
//   Ops.division()          -> the division object, or null before the player picks one
//   Ops.pick(id)            -> { ok, why }: choose or switch division (free once a day, any time from CL-06)
//   Ops.canSwitch()         -> { ok, left }: left is ms until the next free switch
//   Ops.clearance()         -> { cl, name, perk, i, at } from the player's level
//   Ops.rank()              -> 1, 2 or 3, the division perk's strength
//   Ops.perks()             -> { division, rank } for Combat.create, or null
//   Ops.coinMult()          -> 1, 1.05 or 1.10 from clearance
//   Ops.number()            -> '#123456', made once on this device (the server hands out real ones later)
//   Ops.suggest()           -> { id, why } from the player's own records
//   event 'wpm-ops' on window when the division changes
window.Ops = (() => {
  const KEY = 'wpm-ops';
  const DAY = 24 * 3600 * 1000;
  const P = () => window.Combat && Combat.Perks;
  const load = () => TT.store.get(KEY, {});
  const save = v => TT.store.set(KEY, v);
  const level = () => (window.WPM && WPM.levelInfo ? WPM.levelInfo().level : 1);

  function division() { const d = load().division; return d && P() ? P().byId(d) : null; }
  function clearance() { return P() ? P().clearance(level()) : { cl: 'CL-01', name: 'Recruit', i: 0, at: 1, perk: '' }; }
  function rank() { return P() ? P().rank(level()) : 1; }
  function perks() { const d = division(); return d ? { division: d.id, rank: rank() } : null; }
  function coinMult() { return P() ? P().coinMult(level()) : 1; }

  function canSwitch() {
    const s = load();
    if (!s.division || level() >= 21) return { ok: true, left: 0 };
    const left = (s.at || 0) + DAY - Date.now();
    return { ok: left <= 0, left: Math.max(0, left) };
  }
  function pick(id) {
    if (!P() || !P().byId(id)) return { ok: false, why: 'No such division' };
    const s = load();
    if (s.division === id) return { ok: true };
    const c = canSwitch();
    if (!c.ok) return { ok: false, why: `You can switch again in ${Math.ceil(c.left / 3600000)} h` };
    // the first pick is free and starts no wait; switching starts the day's wait
    save({ ...s, division: id, at: s.division ? Date.now() : 0 });
    dispatchEvent(new CustomEvent('wpm-ops', { detail: { division: id } }));
    if (window.WPM && WPM.track) WPM.track('division_pick', { division: id });
    return { ok: true };
  }

  function number() {
    const s = load();
    if (s.number) return s.number;
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    const n = '#' + String(100000 + (a[0] % 900000));
    save({ ...s, number: n });
    return n;
  }

  // The division the player's records point to. Each score compares the player with an
  // ordinary typist (40 wpm, 92% accuracy, a 20 combo); whichever stands out most wins.
  function suggest() {
    const runs = window.WPM && WPM.sessions ? WPM.sessions().slice(-60) : [];
    if (runs.length < 3) return { id: 'precision', why: 'A good first pick until you have a few runs. The site suggests one from your runs after that.' };
    const avg = (a, f) => (a.length ? a.reduce((s, r) => s + (f(r) || 0), 0) / a.length : 0);
    const wpm = Math.max(...runs.map(r => r.wpm || 0));
    const acc = avg(runs, r => r.acc);
    const long = runs.filter(r => (r.ms || 0) >= 120000).length / runs.length;
    const combo = Math.max(0, ...runs.map(r => r.combo || r.bestCombo || 0));
    const boss = runs.filter(r => /^(boss|rush|party)/.test(r.mode || '')).length / runs.length;
    const parties = runs.filter(r => /^party/.test(r.mode || '')).length;
    const score = {
      striker: [wpm / 40 - 1, `Your top speed is ${Math.round(wpm)} wpm.`],
      precision: [(acc - 92) / 4, `Your accuracy averages ${Math.round(acc)}%.`],
      hunter: [boss * 2, 'Most of your runs are boss fights.'],
      sentinel: [long * 2.5, 'You play long runs.'],
      ghost: [combo / 20 - 1, `Your best combo is ${combo}.`],
      architect: [parties >= 3 ? parties / 6 : 0, 'You play a lot of party runs.'],
    };
    let best = 'precision';
    for (const k in score) if (score[k][0] > score[best][0]) best = k;
    return { id: best, why: score[best][1] };
  }

  return { division, pick, canSwitch, clearance, rank, perks, coinMult, number, suggest, level };
})();
