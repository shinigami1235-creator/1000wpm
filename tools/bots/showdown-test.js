// Unit tests for the Showdown rules (js/app/showdown-rules.js): strikes, spells and the beam struggle.
//   node tools/bots/showdown-test.js
const load = require('../net/load');
const G = load(['js/app/showdown-rules.js']);
const SR = G.ShowdownRules, C = SR.CONFIG;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('FAIL', name); } }
const side = (o = {}) => ({ words: 10, acc: 0.95, clean: false, doneAt: 15000, lastAt: 15000, hp: C.hp, spell: null, ...o });
const fixed = v => () => v;

// ---------- strikes, as before ----------
{
  ok(SR.tierOf(0) === 0 && SR.tierOf(3) === 1 && SR.tierOf(6) === 2 && SR.tierOf(9) === 3 && SR.tierOf(10) === 4, 'tiers by words');
  ok(SR.damage(10, 1, true) === Math.round((10 * C.perWord + C.finBonus) * C.critX), 'a clean finisher crits');
  const r = SR.resolve([side({ doneAt: 9000 }), side({ doneAt: 12000 })], fixed(0.99));
  ok(r.first === 0 && r.attacks[0].from === 0, 'the first to finish strikes first');
  ok(r.attacks.every(a => a.kind === 'strike'), 'no spell words, no spells');
  ok(SR.dodgeChance(side({ doneAt: 0 })) <= C.dodgeMax, 'dodge capped at 25%');
  const ko = SR.resolve([side({ doneAt: 9000, clean: true }), side({ hp: 5 })], fixed(0.99));
  ok(ko.ko === 1 && ko.attacks.length === 1, 'a KO stops the other strike');
}

// ---------- the round's spell word ----------
{
  const seeds = Array.from({ length: 300 }, (_, i) => 'SD:' + (1700000000000 + i * 7919));
  let rounds = 0, offered = 0, both = 0, badSlot = 0, badRar = 0, sameTwice = 0;
  const rar = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };
  for (const s of seeds) {
    let prev = null;
    for (let r = 1; r <= C.rounds; r++) {
      const a = SR.spellFor(s, r), b = SR.spellFor(s, r);
      rounds++;
      if (JSON.stringify(a) === JSON.stringify(b)) both++;
      if (a) {
        offered++;
        if (a.slot < C.spellSlots[0] || a.slot > C.spellSlots[1]) badSlot++;
        if (SR.SPELLS[a.id].rarity !== rar[r]) badRar++;
        if (prev) sameTwice++;
      }
      prev = a;
    }
  }
  ok(both === rounds, 'the same spell word for the same seed and round (both sides get the same offer)');
  ok(offered / rounds > 0.38 && offered / rounds < 0.62, `about every other round (${(offered / rounds).toFixed(2)})`);
  ok(sameTwice === 0, 'never two spell rounds in a row');
  ok(badSlot === 0, 'the spell word sits in the 3rd to 8th place');
  ok(badRar === 0, 'rarity opens up by round like Clash combo offers');
  ok(SR.spellFor('x', 0) === null, 'no spell before round 1');
  ok(Object.keys(SR.SPELLS).every(id => G.DuelRules.PVP[id] && G.DuelRules.PVP[id].hits.length === SR.SPELLS[id].hits
    && G.DuelRules.PVP[id].hits.reduce((n, h) => n + h[1], 0) === SR.SPELLS[id].power), 'spell power and hits match the Clash PvP table');
  ok(Object.keys(SR.SPELLS).every(id => G.Combat.spell(id) && G.Combat.spell(id).rarity === SR.SPELLS[id].rarity), 'spell rarities match Combat');
}

// ---------- spells in the exchange ----------
{
  const sp = { id: 'neon-nova', ok: true };
  const r = SR.resolve([side({ doneAt: 9000, spell: sp }), side({ spell: { id: 'neon-nova', ok: false } })], fixed(0.99));
  const kinds = r.attacks.map(a => `${a.kind}${a.from}`).join(' ');
  ok(kinds === 'strike0 strike1 spell0 spell1', `spells cast after both strikes, in strike order (${kinds})`);
  const s0 = r.attacks.find(a => a.kind === 'spell' && a.from === 0), s1 = r.attacks.find(a => a.kind === 'spell' && a.from === 1);
  ok(s0.dmg === SR.spellDamage('neon-nova', 0.95) && s0.dmg > 0 && !s0.fizzled, 'a clean spell word casts for its damage');
  ok(s1.dmg === 0 && s1.fizzled, 'a typo in the spell word fizzles: it flies and deals nothing');
  ok(r.dealt[0] === r.attacks.filter(a => a.from === 0).reduce((n, a) => n + a.dmg, 0), 'dealt counts the spell');
  ok(SR.spellDamage('void-sphere', 1) > SR.spellDamage('root-access', 1), 'stronger Clash spells hit harder');
  ok(SR.spellDamage('neon-nova', 0.8) < SR.spellDamage('neon-nova', 1), 'accuracy sets spell damage');
  ok(SR.spellDamage('void-sphere', 1) <= 16, 'the biggest spell stays under a 7-word strike');
  const ko = SR.resolve([side({ doneAt: 9000, spell: sp, clean: true }), side({ hp: 30, spell: sp })], fixed(0.99));
  ok(ko.ko === 1 && !ko.attacks.some(a => a.from === 1), 'a KO stops the spells too');
  const late = SR.resolve([side({ hp: 200 }), side({ hp: 31, doneAt: 9000, spell: sp })], fixed(0.99));
  ok(late.attacks.filter(a => a.kind === 'spell').length === 1, 'a spell word that was never reached casts nothing');
  const dodge = SR.resolve([side({ doneAt: 1000, spell: sp }), side({ doneAt: 2000, spell: sp })], fixed(0));
  ok(dodge.attacks.filter(a => a.kind === 'spell').every(a => !a.dodged && a.dmg > 0), 'spells are never dodged');
}

// ---------- the beam struggle ----------
{
  const res = (a, b) => SR.resolve([a, b], fixed(0.99));
  const A = side({ words: 8, doneAt: null, lastAt: 19000, acc: 0.97 }), B = side({ words: 8, doneAt: null, lastAt: 18000, acc: 0.93 });
  const r = res(A, B);
  const bm = SR.beam(r, [A, B], fixed(0.1), []);
  ok(bm && bm.winner === 0 && bm.loser === 1, 'same tier, higher accuracy wins the struggle');
  ok(!SR.beam(r, [A, B], fixed(0.1), [true]), 'never twice in a row');
  ok(!SR.beam(r, [A, B], fixed(0.1), [true, false, false]), 'at most one in four exchanges');
  ok(!!SR.beam(r, [A, B], fixed(0.1), [true, false, false, false]), 'allowed again after three plain exchanges');
  ok(!SR.beam(r, [A, B], fixed(0.9), []), 'not every time it qualifies');
  const C2 = side({ words: 9, doneAt: null, acc: 0.9 }), D = side({ words: 7, doneAt: null, acc: 0.99 });
  ok(SR.beam(res(C2, D), [C2, D], fixed(0.1), []).winner === 0, 'more words wins before accuracy');
  const E = side({ words: 3, doneAt: null }), F2 = side({ words: 3, doneAt: null });
  ok(!SR.beam(res(E, F2), [E, F2], fixed(0.1), []), 'not for single shots');
  const Gs = side({ words: 9, doneAt: null }), Hs = side({ words: 4, doneAt: null });
  ok(!SR.beam(res(Gs, Hs), [Gs, Hs], fixed(0.1), []), 'not when the tiers are far apart');
  const I = side({ words: 10, doneAt: 3000 }), J = side({ words: 10, doneAt: 5000 });
  const rd = SR.resolve([I, J], fixed(0));   // rng 0: every dodge roll succeeds
  ok(!SR.beam(rd, [I, J], fixed(0), []), 'not when a strike was dodged');
  // the struggle only changes the picture: the same attacks and damage either way
  const before = JSON.stringify(r.attacks), hp = r.hp.slice();
  SR.beam(r, [A, B], fixed(0.1), []);
  ok(JSON.stringify(r.attacks) === before && r.hp.join() === hp.join() && C.BEAM_EXTRA === 0, 'the struggle never changes damage');
  const K = side({ words: 9, doneAt: null, acc: 0.99 }), L = side({ words: 9, doneAt: null, acc: 0.9, hp: 10 });
  const rk = res(K, L), bk = SR.beam(rk, [K, L], fixed(0.1), []);
  ok(rk.ko === 1 && bk && bk.loser === 1, 'a KO round can be a struggle when the loser is the one knocked out');
}

// ---------- the simulated matches stay in shape ----------
{
  const sim = require('./showdown-sim');
  let r0 = 0, r1 = 0, beams = 0, ex = 0;
  for (let s = 0; s < 120; s++) {
    const a = sim.match({ wpm: 70, acc: 0.95 }, { wpm: 80, acc: 0.95 }, 't' + s, false), b = sim.match({ wpm: 70, acc: 0.95 }, { wpm: 80, acc: 0.95 }, 't' + s, true);
    r0 += a.round; r1 += b.round; beams += b.beams; ex += b.exchanges;
  }
  ok(Math.abs(r1 - r0) / r0 < 0.06, `spells keep match length within 6% (${(r0 / 120).toFixed(2)} -> ${(r1 / 120).toFixed(2)} rounds)`);
  ok(beams / ex <= 0.25 && beams > 0, `beam struggles in at most a quarter of exchanges (${(100 * beams / ex).toFixed(0)}%)`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
