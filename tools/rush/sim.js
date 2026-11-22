// Boss Rush director tests. Runs whole rushes in node with simulated players typing
// through the real fight rules, combat engine and word bank and prints the
// director's decisions.
//   node tools/rush/sim.js            all three players
//   node tools/rush/sim.js strong     one of strong, weak, near
// Exits 1 if a check fails.
globalThis.window = globalThis;
const root = require('path').resolve(__dirname, '../..');
for (const f of ['js/app/combat/bus.js', 'js/app/combat/spells.js', 'js/app/combat/combo.js', 'js/app/combat/damage.js', 'js/app/combat/engine.js',
  'js/wordbank-common.js', 'js/wordbank.js', 'js/app/rush/data.js', 'js/app/rush/director.js', 'js/app/rush/fight.js']) require(root + '/' + f);

const D = RushData;
// a small seeded rng so a run repeats
function rngOf(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- a simulated player ----------
// wpm: typing speed. acc: chance each key is right. react: ms before they turn to a new attack.
// know: chance they know the right spelling on The Correction's question.
function fight(plan, bot, rng) {
  let t = 0;
  const me = Combat.create({ now: () => t, rng });
  const f = RushFight.create({ plan, me, now: () => t, rng, pick: o => WordBank.pick({ ...o, rng }) });
  f.start(0);
  const msChar = 12000 / bot.wpm;
  let busy = 0, cur = null, seen = '', turnAt = 0;
  for (let guard = 0; guard < 40000 && (f.phase === 'intro' || f.phase === 'fight'); guard++) {
    t += 25;
    f.tick(t);
    if (f.phase !== 'fight') continue;
    const st = f.state(t);
    const key = st.action ? st.action.type + st.action.start : '';
    if (key !== seen) { seen = key; turnAt = t + bot.react; }
    if (t < busy) continue;
    if (cur) {
      if (cur.spell) {
        const r = me.cast(cur.word, { clean: cur.clean });
        if (r && !r.fizzled) f.cast(r, t);
      } else f.submit(cur.text, { clean: cur.clean, ms: cur.ms, target: cur.target, t });
      cur = null;
    }
    // what to type next: the attack once they have reacted, then a spell, then the weak point now and then, then the stack
    const chips = f.chips(t);
    let c = null;
    if (t >= turnAt) {
      c = chips.find(x => x.kind === 'block') || chips.find(x => x.kind === 'answer' && (rng() < bot.know ? x.right : !x.right))
        || chips.find(x => x.kind === 'fix') || chips.find(x => x.kind === 'speaker' && x.next) || chips.find(x => x.kind === 'packet')
        || chips.find(x => x.kind === 'gift') || chips.find(x => x.kind === 'boost');
      // the signature: the one about to land first, pop-ups and speakers once a few are open;
      // a fake packet gets typed now and then by someone who doesn't read it
      if (!c) {
        const sig = chips.filter(x => ['popup', 'sign', 'mute', 'page', 'byte'].includes(x.kind) || (x.kind === 'decoy' && rng() > bot.know))
          .sort((a, b) => (a.due || a.born + 9000) - (b.due || b.born + 9000));
        const open = chips.filter(x => x.kind === 'popup' || x.kind === 'mute').length;
        if (sig.length && (sig[0].due || open >= 2 || st.volume > 0.5)) c = sig[0];
      }
    }
    let word, spell = false, target = null;
    const offer = me.offer();
    if (c) { word = c.word; target = c.id; }
    else if (offer && rng() < 0.85) { word = Combat.spell(offer.spells[0]).word; spell = true; }
    else if (rng() < 0.25 && chips.find(x => x.kind === 'weak')) { const w = chips.find(x => x.kind === 'weak'); word = w.word; target = w.id; }
    else {
      word = f.stack()[0];
      const mk = f.marks().find(m => m.i === 0);
      if (mk && rng() > bot.know) word = mk.fake;   // fell for the red pen
    }
    if (!word) continue;
    // type it: a wrong key costs two more keys to fix and now and then the word goes in wrong
    let clean = true, extra = 0, text = word;
    for (const ch of word) {
      const ok = rng() < bot.acc;
      f.key(ok);
      if (!ok) { clean = false; extra += 2; f.key(true); }
    }
    if (!clean && rng() < 0.2) text = word.slice(0, -1) + (word.endsWith('x') ? 'y' : 'x');
    const ms = (word.length + extra + 1) * msChar * (0.85 + rng() * 0.3);
    busy = t + ms;
    cur = { text, word, clean: clean && text === word, ms, target, spell };
  }
  return f.summary();
}

// ---------- whole rushes ----------
function rush(name, bot, runs, seed, { onlyN, log } = {}) {
  const rng = rngOf(seed);
  const d = RushDirector.create({ rng, prior: bot.prior });
  const out = { name, runs: [], bad: [] };
  for (let r = 0; r < runs; r++) {
    d.startRun();
    let n = onlyN || 1, retry = false, beaten = 0;
    const lines = [];
    while (n < 80) {
      const p = RushDirector.create ? d.plan(n, { retry }) : null;
      check(p, out.bad);
      const res = fight(p, bot, rng);
      d.report(p, res);
      lines.push(`  #${String(n).padStart(2)} ${p.slot.title.padEnd(26)} S ${String(p.S).padStart(5)} floor ${String(p.floor.wpm).padStart(3)} hp ${String(p.knobs.hp).padStart(6)}`
        + ` ${p.help ? `help ${(p.help.k * 100).toFixed(0)}%` : '        '} ${p.boost ? `boost ${p.boost.dmg}` : '          '}`
        + ` -> ${res.won ? 'won ' : 'lost'} ${res.won ? `integrity ${(res.hpLeft * 100).toFixed(0)}%` : `boss ${(res.left * 100).toFixed(1)}% left`} in ${res.secs.toFixed(0)}s, ${res.wpm} wpm ${res.acc}% phase ${res.stage} sig ${res.sigsDone}/${res.sigs} hit ${res.sigHits}${res.boosts ? ' BOOST USED' : ''}`);
      if (res.won) { beaten++; n++; retry = false; if (onlyN) break; continue; }
      if (!retry && !onlyN) { retry = true; continue; }
      if (onlyN) { retry = true; if (lines.length >= 6) break; continue; }
      break;
    }
    out.runs.push({ beaten, lines });
    if (log !== false) { console.log(`${name} run ${r + 1}: ${beaten} bosses beaten`); lines.forEach(l => console.log(l)); }
  }
  out.d = d;
  return out;
}
// every knob must sit inside the floor
function check(p, bad) {
  const k = p.knobs, f = p.floor;
  const fail = [];
  if (p.S < f.wpm) fail.push(`S ${p.S} < ${f.wpm}`);
  if (k.hp < f.hp) fail.push(`hp ${k.hp} < ${f.hp}`);
  if (k.diff[0] < f.diff) fail.push(`diff ${k.diff[0]} < ${f.diff}`);
  if (k.minLen < f.minLen) fail.push(`minLen ${k.minLen} < ${f.minLen}`);
  if (k.interval > f.interval) fail.push(`interval ${k.interval} > ${f.interval}`);
  if (k.react > f.react) fail.push(`react ${k.react} > ${f.react}`);
  if (k.perChar > f.perChar) fail.push(`perChar ${k.perChar} > ${f.perChar}`);
  if (k.counters < f.counters) fail.push(`counters ${k.counters} < ${f.counters}`);
  if (k.typo < f.typo) fail.push(`typo ${k.typo} < ${f.typo}`);
  if (fail.length) bad.push(`#${p.n} ${p.slot.title}: ${fail.join(', ')}`);
}
function printLog(d, last) {
  console.log('  director log (last ' + last + '):');
  for (const e of d.log().slice(-last)) {
    if (e.result) console.log(`    [${e.n}] ${e.result}${e.left !== undefined ? ` left ${e.left} fails ${e.fails} near ${e.near}` : ` integrity ${e.hpLeft} in ${e.secs}s`} lift ${JSON.stringify(e.lift)} model ${JSON.stringify(e.model)}`);
    else console.log(`    [${e.n}] plan ${e.boss} mk${e.mark} S ${e.S} hp ${e.hp} diff ${JSON.stringify(e.diff)} wind ${JSON.stringify(e.wind)} counters ${e.counters} typo ${e.typo} help ${e.help} boost ${e.boost}${e.retry ? ' retry' : ''}: ${e.why}`);
  }
}

const which = process.argv[2];
let failed = 0;
const assert = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };

if (!which || which === 'strong') {
  console.log('\n=== strong player: 130 wpm, 97% keys right, reacts in 550 ms ===');
  const r = rush('strong', { wpm: 130, acc: 0.97, react: 550, know: 0.95, prior: 120 }, 3, 11);
  printLog(r.d, 14);
  const best = Math.max(...r.runs.map(x => x.beaten));
  const S = r.d.log().filter(e => e.S && !e.retry);
  const first = S.find(e => e.n === 1), top = Math.max(...S.map(e => e.S));
  assert(best >= 18, `climbs past boss 18 (best run ${best})`);
  assert(first && top > first.S * 3, `the fights got harder: S ${first && first.S} at boss 1, up to ${top}`);
  assert(!r.bad.length, `every plan within the floors${r.bad.length ? ': ' + r.bad.slice(0, 3).join(' | ') : ''}`);
}
if (!which || which === 'weak') {
  console.log('\n=== weak player: 32 wpm, 90% keys right, reacts in 1500 ms ===');
  const r = rush('weak', { wpm: 32, acc: 0.9, react: 1500, know: 0.6, prior: 30 }, 6, 22);
  printLog(r.d, 16);
  const helped = r.d.log().filter(e => e.help > 0);
  const firstWins = r.runs.every(x => x.beaten >= 3);
  assert(firstWins, `wins the first three bosses every run (${r.runs.map(x => x.beaten).join(', ')})`);
  assert(helped.length > 0, `gets help after losses (${helped.length} helped fights)`);
  assert(!r.bad.length, `help never goes below the floors${r.bad.length ? ': ' + r.bad.slice(0, 3).join(' | ') : ''}`);
  const S = helped.map(e => `#${e.n} S ${e.S} floor ${e.floor}`);
  console.log('  helped fights: ' + S.slice(0, 8).join(', '));
}
if (!which || which === 'near') {
  console.log('\n=== near-miss player: keeps losing boss 9 with a sliver left ===');
  // the director alone, fed losses at boss 9 with 4% to 10% left, a few times over
  let gotWithin = [];
  for (let s = 1; s <= 200; s++) {
    const rng = rngOf(1000 + s);
    const d = RushDirector.create({ rng, prior: 45 });
    d.startRun();
    let tries = 0, got = 0;
    for (; tries < 6 && !got; tries++) {
      const p = d.plan(9, { retry: tries % 2 === 1 });
      if (p.boost) { got = tries + 1; break; }
      d.report(p, { won: false, left: 0.04 + rng() * 0.06, wpm: 44, acc: 95, react: 900, combo: 20, hpLeft: 0, secs: 50 });
    }
    gotWithin.push(got || 99);
  }
  const by = k => gotWithin.filter(x => x <= k).length / gotWithin.length;
  console.log(`  boost offered by attempt 2: ${(by(2) * 100).toFixed(0)}%, by 3: ${(by(3) * 100).toFixed(0)}%, by 4: ${(by(4) * 100).toFixed(0)}% of 200 seeds`);
  assert(by(4) >= 0.97, 'the boost word arrives within a few tries');
  // one seed in full, with the log
  const rng = rngOf(7);
  const d = RushDirector.create({ rng, prior: 45 });
  d.startRun();
  for (let i = 0; i < 4; i++) {
    const p = d.plan(9, { retry: i % 2 === 1 });
    console.log(`  attempt ${i + 1}: boost ${p.boost ? `"${p.boost.word}" at ${(p.boost.at / 1000).toFixed(1)}s for ${p.boost.dmg} of ${p.knobs.hp} HP` : 'none'}`);
    if (p.boost) break;
    d.report(p, { won: false, left: 0.07, wpm: 44, acc: 95, react: 900, combo: 20, hpLeft: 0, secs: 50 });
  }
  printLog(d, 8);
  // and simulated players who sit right at boss 9's edge, through the real fight:
  // find the speed that loses there most often with under 15% left, then let the
  // director run attempts until it sends a boost
  let edge = null;
  for (let w = 18; w <= 42; w += 2) {
    let near = 0, lost = 0;
    for (let k = 0; k < 6; k++) {
      const rng = rngOf(500 + w * 13 + k);
      const d = RushDirector.create({ rng, prior: w * 0.8 });
      const res = fight(d.plan(9), { wpm: w, acc: 0.94, react: 1000, know: 0.8 }, rng);
      if (!res.won) { lost++; if (res.left < 0.15) near++; }
    }
    if (!edge || near > edge.near) edge = { w, near, lost };
  }
  console.log(`  edge player: ${edge.w} wpm loses boss 9 in ${edge.lost} of 6 fights, ${edge.near} of them with under 15% left`);
  const bot = { wpm: edge.w, acc: 0.94, react: 1000, know: 0.8 };
  const seqs = [];
  for (let s = 0; s < 12; s++) {
    const rng = rngOf(900 + s);
    const d = RushDirector.create({ rng, prior: edge.w * 0.8 });
    d.startRun();
    const seq = [];
    for (let i = 0; i < 8; i++) {
      const p = d.plan(9, { retry: i % 2 === 1 });
      const res = fight(p, bot, rng);
      d.report(p, res);
      seq.push(`${p.boost ? 'B' : '-'}${res.won ? 'W' : res.left < 0.15 ? 'n' : 'L'}`);
      if (res.won) break;
    }
    seqs.push(seq.join(' '));
  }
  console.log('  attempts per seed (B = carried a boost, W won, n near miss, L lost):');
  seqs.forEach((x, i) => console.log(`    seed ${i + 1}: ${x}`));
  const late = seqs.filter(x => { const a = x.split(' '); const firstNear = a.findIndex(y => y[1] === 'n'); return firstNear >= 0 && !a.slice(firstNear + 1, firstNear + 4).some(y => y[0] === 'B') && a.length > firstNear + 3; });
  assert(!late.length, `after a near miss the boost comes within three attempts (${seqs.length - late.length} of ${seqs.length} seeds)`);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
