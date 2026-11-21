// Combo tracker. Every clean word adds one. A typo drops the combo to the start of
// the tier below (63 -> 25, 12 -> 0), so one slip at a high combo costs a tier
// rather than the whole run. Getting hit by an attack you didn't block breaks it to 0.
//   const c = Combat.Combo({ tiers });
//   c.add()    -> { combo, tier, from, up }     a clean word
//   c.drop()   -> { combo, tier, from, down }   a typo
//   c.break()  -> { combo, tier, from, down }   an unblocked hit
//   c.set(n), c.state(), c.tierOf(n)
window.Combat = window.Combat || {};
Combat.TIERS = [
  { at: 0, name: 'Bolt', mult: 1 },
  { at: 10, name: 'Charged bolt', mult: 1.25 },
  { at: 25, name: 'Twin beam', mult: 1.5 },
  { at: 50, name: 'Rail shot', mult: 2 },
  { at: 100, name: 'Overload', mult: 2.5 },
];
Combat.Combo = function Combo(opts = {}) {
  const tiers = opts.tiers || Combat.TIERS;
  let combo = 0, best = 0;
  const tierOf = n => { let t = 0; for (let i = 0; i < tiers.length; i++) if (n >= tiers[i].at) t = i; return t; };
  function move(n) {
    const from = combo, t0 = tierOf(from);
    combo = Math.max(0, n);
    best = Math.max(best, combo);
    const tier = tierOf(combo);
    return { combo, tier, from, up: tier > t0, down: tier < t0 };
  }
  return {
    add: () => move(combo + 1),
    drop: () => { const t = tierOf(combo); return move(t === 0 ? 0 : tiers[t - 1].at); },
    break: () => move(0),
    set: n => move(n),
    state: () => {
      const tier = tierOf(combo), next = tiers[tier + 1];
      return {
        combo, best, tier, name: tiers[tier].name, mult: tiers[tier].mult,
        next: next ? next.at : null,
        progress: next ? (combo - tiers[tier].at) / (next.at - tiers[tier].at) : 1,
      };
    },
    tierOf,
    tiers,
    reset() { combo = 0; best = 0; },
  };
};
