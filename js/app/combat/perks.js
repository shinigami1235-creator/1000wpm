// CTRL divisions and clearance levels (CTRL.md): the data and the maths, with no DOM, so
// the party rules and a future server load the same numbers. js/app/ops.js keeps the
// player's own division and shows it; the combat engine (engine.js) applies the perks
// when a mode passes { perks: { division, rank } } to Combat.create. Duels never do.
//
//   Combat.Perks.DIVISIONS        the six divisions, perk values by rank (I, II, III)
//   Combat.Perks.CLEARANCE        the eight clearance levels and the level each starts at
//   Combat.Perks.clearance(lvl)   -> { i, cl: 'CL-04', name, at, perk }
//   Combat.Perks.rank(lvl)        -> 1, 2 or 3: the division perk's strength
//   Combat.Perks.value(div, rank) -> that division's number at that rank
//   Combat.Perks.text(div, rank)  -> one plain line describing the perk
(function (root) {
  const Combat = root.Combat = root.Combat || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const DIVISIONS = [
    { id: 'striker', name: 'Striker', good: 'Speed', perk: 'Overdrive', vals: [0.15, 0.20, 0.25],
      text: v => `Fast words hit up to ${pct(v)} harder, on top of the usual speed bonus. Full bonus at 180 wpm.` },
    { id: 'precision', name: 'Precision', good: 'Accuracy', perk: 'Zero error', vals: [0.10, 0.13, 0.16],
      text: v => `Words with no typo hit ${pct(v)} harder while your accuracy is 95% or more.` },
    { id: 'hunter', name: 'Hunter', good: 'Boss damage', perk: 'Execution', vals: [0.20, 0.26, 0.32],
      text: v => `You hit ${pct(v)} harder once the target is below 30% health.` },
    { id: 'sentinel', name: 'Sentinel', good: 'Endurance', perk: 'Unbreakable', vals: [20000, 16000, 12000],
      text: v => `One typo every ${v / 1000} seconds doesn't cost you a combo tier.` },
    { id: 'ghost', name: 'Ghost', good: 'Combos', perk: 'Ghost protocol', vals: [0.15, 0.20, 0.25],
      text: v => `Your combo tiers come ${pct(v)} sooner: Charged bolt at ${Math.round(10 * (1 - v))} instead of 10.` },
    { id: 'architect', name: 'Architect', good: 'Support', perk: 'System override', vals: [0.15, 0.20, 0.25], team: [0.04, 0.05, 0.06],
      text: (v, t) => `Your spells hit ${pct(v)} harder. In a party the whole team deals ${pct(t)} more.` },
  ];
  const pct = v => `${Math.round(v * 100)}%`;

  const CLEARANCE = [
    { cl: 'CL-01', name: 'Recruit', at: 1, perk: 'Your division perk (rank I) and your Operator ID' },
    { cl: 'CL-02', name: 'Operative', at: 3, perk: '+5% coins from runs' },
    { cl: 'CL-03', name: 'Specialist', at: 6, perk: "Your division's patch on your Operator ID and profile" },
    { cl: 'CL-04', name: 'Agent', at: 10, perk: 'Division perk rank II' },
    { cl: 'CL-05', name: 'Elite', at: 15, perk: '+10% coins from runs' },
    { cl: 'CL-06', name: 'Vanguard', at: 21, perk: 'Switch division any time' },
    { cl: 'CL-07', name: 'Commander', at: 28, perk: 'Division perk rank III' },
    { cl: 'CL-08', name: 'Director', at: 36, perk: 'Gold Operator ID and insignia' },
  ];

  const byId = id => DIVISIONS.find(d => d.id === id) || null;
  function clearance(level) {
    let i = 0;
    for (let k = 0; k < CLEARANCE.length; k++) if (level >= CLEARANCE[k].at) i = k;
    return { i, ...CLEARANCE[i] };
  }
  const rank = level => (level >= 28 ? 3 : level >= 10 ? 2 : 1);
  function value(id, r = 1) { const d = byId(id); return d ? d.vals[clamp(r, 1, 3) - 1] : 0; }
  function team(id, r = 1) { const d = byId(id); return d && d.team ? d.team[clamp(r, 1, 3) - 1] : 0; }
  function text(id, r = 1) { const d = byId(id); return d ? d.text(value(id, r), team(id, r)) : ''; }
  const coinMult = level => (level >= 15 ? 1.10 : level >= 3 ? 1.05 : 1);

  // ---------- what the engine asks ----------
  // the combo tiers for a Ghost: every tier after the first starts that much sooner
  function tiers(base, perks) {
    if (!perks || perks.division !== 'ghost') return base;
    const k = value('ghost', perks.rank);
    return base.map(t => (t.at ? { ...t, at: Math.max(1, Math.round(t.at * (1 - k))) } : t));
  }
  // a word's perk multiplier. w: { wpm, clean, acc, targetHp }
  function word(perks, w) {
    if (!perks) return 1;
    const k = value(perks.division, perks.rank);
    switch (perks.division) {
      case 'striker': return 1 + k * clamp(((w.wpm || 0) - 40) / 140, 0, 1);
      case 'precision': return w.clean && w.acc >= 0.95 ? 1 + k : 1;
      case 'hunter': return w.targetHp != null && w.targetHp < 0.3 ? 1 + k : 1;
      default: return 1;
    }
  }
  const spell = perks => (perks && perks.division === 'architect' ? 1 + value('architect', perks.rank) : 1);
  const guardMs = perks => (perks && perks.division === 'sentinel' ? value('sentinel', perks.rank) : 0);

  Combat.Perks = { DIVISIONS, CLEARANCE, byId, clearance, rank, value, team, text, coinMult, tiers, word, spell, guardMs };
})(typeof window !== 'undefined' ? window : globalThis);
