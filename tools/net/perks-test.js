// Checks the CTRL division perks in the combat engine (js/app/combat/perks.js, CTRL.md).
// node tools/net/perks-test.js
const load = require('./load');
const ctx = load();
const { Combat } = ctx;
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, e = 0.005) => Math.abs(a - b) <= e;

function eng(perks, extra = {}) {
  let t = 0;
  const me = Combat.create({ perks, now: () => t, rng: () => 0.5, ...extra });
  return { me, at: v => { t = v; } };
}
// a word of 5 letters typed in ms at a given wpm: letters+1 chars / 5 per minute
const msFor = wpm => (6 / 5) / wpm * 60000;

// no perks: the base multiplier
const base = eng(null).me.word({ letters: 5, clean: true, ms: msFor(180) });
ok(near(base.parts.perk, 1), 'no perk is x1');

// striker: +15% at 180 wpm, nothing at 40, rank III +25%
ok(near(eng({ division: 'striker', rank: 1 }).me.word({ letters: 5, clean: true, ms: msFor(180) }).parts.perk, 1.15), 'striker I at 180');
ok(near(eng({ division: 'striker', rank: 1 }).me.word({ letters: 5, clean: true, ms: msFor(40) }).parts.perk, 1), 'striker at 40');
ok(near(eng({ division: 'striker', rank: 3 }).me.word({ letters: 5, clean: true, ms: msFor(200) }).parts.perk, 1.25), 'striker III');

// precision: clean words at 95%+, not typo words
{
  const { me } = eng({ division: 'precision', rank: 1 });
  for (let i = 0; i < 20; i++) me.key(true);
  ok(near(me.word({ letters: 5, clean: true, ms: 1000 }).parts.perk, 1.10), 'precision clean');
  ok(near(me.word({ letters: 5, clean: false, ms: 1000 }).parts.perk, 1), 'precision typo word');
  for (let i = 0; i < 4; i++) me.key(false);   // 20/24 = 83%
  ok(near(me.word({ letters: 5, clean: true, ms: 1000 }).parts.perk, 1), 'precision below 95%');
}

// hunter: only under 30% target health, and one perk event when it starts
{
  let hp = 0.5;
  const { me } = eng({ division: 'hunter', rank: 2 }, { targetHp: () => hp });
  let events = 0; me.on('perk', e => { if (e.id === 'hunter') events++; });
  ok(near(me.word({ letters: 5, clean: true, ms: 1000 }).parts.perk, 1), 'hunter above 30%');
  hp = 0.2;
  ok(near(me.word({ letters: 5, clean: true, ms: 1000 }).parts.perk, 1.26), 'hunter II under 30%');
  me.word({ letters: 5, clean: true, ms: 1000 });
  ok(events === 1, 'hunter announces once');
}

// sentinel: a typo keeps the tier, the next one within 20 s drops it
{
  const { me, at } = eng({ division: 'sentinel', rank: 1 });
  me.debug.setCombo(30);
  at(1000); me.miss('typo');
  ok(me.state().combo === 30, 'sentinel keeps combo on first typo');
  at(5000); me.miss('typo');
  ok(me.state().combo === 10, 'sentinel drops on second typo inside 20 s');
  me.debug.setCombo(30);
  at(26000); me.miss('typo');
  ok(me.state().combo === 30, 'sentinel ready again after 20 s');
  me.hurt('hit');
  ok(me.state().combo === 0, 'sentinel does not stop a hit');
}

// ghost: tiers come sooner
{
  const { me } = eng({ division: 'ghost', rank: 1 });
  me.debug.setCombo(9);
  ok(me.state().tier === 1, 'ghost I charged bolt at 9');
  const plain = eng(null).me; plain.debug.setCombo(8);
  ok(plain.state().tier === 0, 'no ghost: still bolt at 8');
}

// architect: spells hit harder, team multiplier reaches words
{
  const spellAt = (perks, extra) => {
    const { me } = eng(perks, extra);
    me.debug.offer(['data-spike']);
    const s = Combat.spellByWord ? Combat.spellByWord('data spike') : null;
    return s ? me.cast('data spike', { clean: true }).total : null;
  };
  const a = spellAt(null), b = spellAt({ division: 'architect', rank: 1 });
  if (a != null && b != null) ok(b > a && near(b / a, 1.15, 0.05), `architect spell ${a} -> ${b}`);
  const w = eng(null, { teamMult: () => 1.05 }).me.word({ letters: 5, clean: true, ms: 1000 });
  ok(near(w.parts.perk, 1.05), 'team multiplier');
}

// clearance
const P = Combat.Perks;
ok(P.clearance(1).cl === 'CL-01' && P.clearance(10).cl === 'CL-04' && P.clearance(36).name === 'Director' && P.clearance(99).cl === 'CL-08', 'clearance levels');
ok(P.rank(9) === 1 && P.rank(10) === 2 && P.rank(28) === 3, 'perk ranks');
ok(P.coinMult(2) === 1 && P.coinMult(3) === 1.05 && P.coinMult(15) === 1.10, 'coin bonus');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
