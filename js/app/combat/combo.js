// Combo tracker. Every clean word adds one. A typo drops the combo to the start of
// the tier below (63 -> 25, 12 -> 0), so one slip at a high combo costs a tier
// rather than the whole run. Getting hit by an attack you didn't block breaks it to 0.
//   const c = Combat.Combo({ tiers });
//   c.add()    -> { combo, tier, from, up }     a clean word
//   c.drop()   -> { combo, tier, from, down }   a typo
//   c.break()  -> { combo, tier, from, down }   an unblocked hit
//   c.set(n), c.state(), c.tierOf(n)
window.Combat = window.Combat || {};
// Art's combo levels (2026-11-25): names, colours and multipliers are his.
Combat.TIERS = [
  { at: 0, name: 'Bolt', mult: 1, color: null },
  { at: 10, name: 'Pulse', mult: 1.5, color: '#2fe07a' },
  { at: 25, name: 'Surge', mult: 2, color: '#38b6ff' },
  { at: 50, name: 'Overdrive', mult: 3, color: '#a35bff' },
  { at: 100, name: 'Meltdown', mult: 5, color: '#ffb020' },
  { at: 200, name: 'Zero Limit', mult: 8, color: '#ff4d5e' },
];
// Boss HP in each mode is multiplied by these, since Art's tiers deal more than the old ones (x1.25
// to x2.5). A combo walk over our typo rule gives 1.2x the damage for a 93%-clean typist and 1.3x
// to 1.9x for 96% to 99%. Each mode's own number came from its balance tool, matched to the times
// before the change (tools/superboss/balance.js, tools/net/party-balance.js, tools/rush/sim.js);
// the World Boss has no tool and its raiders hold long combos, so it takes the walk's middle value.
Combat.HP_SCALE = { boss: 1.5, rush: 1.3, superboss: 1.1, party: 1 };
Combat.hpScale = mode => (Combat.HP_SCALE && Combat.HP_SCALE[mode]) || 1;
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
