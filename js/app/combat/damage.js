// Damage model. Every number a mode sends is letters (or a spell's power) times these.
//   tier      the combo tier's mult (1, 1.25, 1.5, 2, 2.5)
//   accuracy  0.6 + 0.4 * acc^4 over the last 60 keys: 100% -> 1, 95% -> 0.93, 90% -> 0.86, 80% -> 0.76
//   speed     1 + 0.3 * (word wpm - 40) / 140, from 1 at 40 wpm to 1.3 at 180 wpm and over
//   status    hyper thread and root access each x2
//   perk      the player's CTRL division perk and a party's Architect bonus (perks.js), boss modes only
// The total multiplier never passes MAX (6). The mode applies its own multipliers after
// these (the world boss's weak point, crits and the damage-halved debuff).
window.Combat = window.Combat || {};
Combat.Damage = (() => {
  const MAX = 6;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const accMult = acc => 0.6 + 0.4 * Math.pow(clamp(acc, 0, 1), 4);
  const speedMult = wpm => 1 + 0.3 * clamp(((wpm || 0) - 40) / 140, 0, 1);
  function word({ letters, tierMult = 1, acc = 1, wpm = 0, statusMult = 1, perkMult = 1 }) {
    const parts = { tier: tierMult, acc: accMult(acc), speed: speedMult(wpm), status: statusMult, perk: perkMult };
    const mult = Math.min(MAX, parts.tier * parts.acc * parts.speed * parts.status * parts.perk);
    return { letters, mult: +mult.toFixed(3), amount: Math.max(letters > 0 ? 1 : 0, Math.round(letters * mult)), parts };
  }
  function spell(power, { acc = 1, statusMult = 1, vsShield = 1, shield = false } = {}) {
    const mult = Math.min(MAX, accMult(acc) * statusMult * (shield ? vsShield : 1));
    return { power, mult: +mult.toFixed(3), amount: Math.max(1, Math.round(power * mult)) };
  }
  return { word, spell, accMult, speedMult, MAX };
})();
