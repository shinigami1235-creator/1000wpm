// Bot against bot Showdowns to tune ShowdownRules (js/app/showdown-rules.js): match length and win rates
// with and without the spell words. Each side is a NetBot typing the round's words the way the Showdown page
// takes keys (js/app/showdown.js sideKey), 20 ms steps.
//   node tools/bots/showdown-sim.js [matches per pair, 60]
const load = require('../net/load');
const G = load(['js/app/showdown-rules.js']);
const SR = G.ShowdownRules, C = SR.CONFIG;
const W = 'time about people world house water light still story right place great small every found never under thing night point think three large often other first learn paper group begin music those both mark book letter until mile river feet care second enough plain young ready above ever list though feel talk bird soon body family direct leave song measure door product black short class wind question happen complete ship area half rock order fire south problem piece told knew pass since whole king space heard best hour better true during hundred five remember step early hold west ground interest reach fast verb sing listen table travel less morning'.split(' ');

function roundWords(seed, r, spells) {
  const rng = G.NetCore.rng(`${seed}:${r}`);
  const list = Array.from({ length: C.words }, () => W[Math.floor(rng() * W.length)]);
  const sp = spells ? SR.spellFor(seed, r) : null;
  if (sp) list[sp.slot] = G.Combat.spell(sp.id).word;
  return { list, sp };
}

// one round of typing for both sides, as the page counts it
function typeRound(bots, list, sp) {
  const blank = () => ({ idx: 0, typed: '', good: 0, bad: 0, words: 0, doneAt: null, lastAt: 0, clean: true, wclean: true, spell: null });
  const S = [blank(), blank()];
  const submit = (s, t) => {
    const w = list[s.idx], ok = s.typed === w;
    if (sp && s.idx === sp.slot) s.spell = { id: sp.id, ok: ok && s.wclean };
    s.idx++; s.typed = ''; s.wclean = true;
    if (ok) { s.words++; s.lastAt = t; } else s.clean = false;
    if (s.idx >= C.words) s.doneAt = t;
  };
  const key = (s, k, t) => {
    const w = list[s.idx];
    if (w == null) return;
    if (k === 'Backspace') { s.typed = s.typed.slice(0, -1); return; }
    if (k === 'CtrlBackspace') { s.typed = ''; return; }
    // a space inside a two-word spell is a letter of it
    if (k === ' ' && !(w.includes(' ') && s.typed.length < w.length && w[s.typed.length] === ' ')) { if (s.typed) submit(s, t); return; }
    s.typed += k;
    const good = s.typed.length <= w.length && k === w[s.typed.length - 1];
    if (good) s.good++; else { s.bad++; s.clean = false; s.wclean = false; }
    if (s.typed === w && s.idx === C.words - 1) submit(s, t);
  };
  bots.forEach(b => b.reset && b.reset());
  for (let t = 0; t <= C.roundMs; t += 20) {
    bots.forEach((b, i) => {
      const s = S[i];
      for (let g = 0; g < 8; g++) { const ks = b.step(t, { phase: 'fight', stream: list[s.idx] || '', typed: s.typed }); if (!ks.length) break; ks.forEach(k => key(s, k.k, t)); }
    });
    if (S.every(s => s.idx >= C.words)) break;
  }
  return S;
}

function match(a, b, seed, spells) {
  const bots = [G.NetBot.create({ ...a, seed: seed + ':b0', pause: 0.03 }), G.NetBot.create({ ...b, seed: seed + ':b1', pause: 0.03 })];
  const rng = G.NetCore.rng(seed);
  const m = { hp: [C.hp, C.hp], wins: [0, 0], round: 0, kos: 0, casts: 0, fizzles: 0, spellDmg: 0, beams: 0, exchanges: 0, dmg: 0 };
  const recent = [];
  for (let r = 1; r <= C.rounds; r++) {
    m.round = r;
    const { list, sp } = roundWords(seed, r, spells);
    const S = typeRound(bots, list, sp);
    const acc = s => (s.good + s.bad ? s.good / (s.good + s.bad) : 0);
    const sides = S.map((s, i) => ({ words: s.words, acc: acc(s), clean: s.clean && s.words > 0, doneAt: s.doneAt, lastAt: s.lastAt, hp: m.hp[i], spell: s.spell }));
    const res = SR.resolve(sides, rng);
    const bm = SR.beam(res, sides, rng, recent);
    recent.push(!!bm); m.exchanges++; if (bm) m.beams++;
    for (const at of res.attacks) { if (at.kind === 'spell') { if (at.fizzled) m.fizzles++; else { m.casts++; m.spellDmg += at.dmg; } } m.dmg += at.dmg; }
    m.hp = res.hp;
    if (res.winner >= 0) m.wins[res.winner]++;
    const ov = SR.over({ hp: m.hp, wins: m.wins, round: r });
    if (res.ko >= 0) m.kos++;
    if (ov.done) { m.winner = ov.winner; break; }
  }
  return m;
}

if (require.main === module) {
  const N = +(process.argv[2] || 60);
  const pairs = [[60, 60], [60, 70], [60, 80], [80, 100], [40, 55], [100, 204], [140, 204]];
  for (const spells of [false, true]) {
    console.log(spells ? '\nwith spell words' : 'without spells');
    let allR = 0, allM = 0;
    for (const [wa, wb] of pairs) {
      let winsB = 0, rounds = 0, kos = 0, casts = 0, fiz = 0, sdmg = 0, beams = 0, ex = 0, dmg = 0;
      for (let s = 0; s < N; s++) {
        const bArt = wb === 204 ? { ...G.NetBot.ART } : { wpm: wb, acc: 0.95 };
        const m = match({ wpm: wa, acc: 0.95 }, bArt, `sd${wa}-${wb}-${s}`, spells);
        if (m.winner === 1) winsB++;
        rounds += m.round; kos += m.kos; casts += m.casts; fiz += m.fizzles; sdmg += m.spellDmg; beams += m.beams; ex += m.exchanges; dmg += m.dmg;
      }
      allR += rounds; allM += N;
      console.log(`${wa} vs ${wb}: B wins ${Math.round(100 * winsB / N)}%, rounds ${(rounds / N).toFixed(2)}, KO matches ${Math.round(100 * kos / N)}%, dmg/round ${(dmg / rounds).toFixed(1)}`
        + (spells ? `, casts/match ${(casts / N).toFixed(2)}, fizzles ${(fiz / N).toFixed(2)}, dmg/cast ${(sdmg / Math.max(1, casts)).toFixed(1)}` : '') + `, beam ${Math.round(100 * beams / ex)}% of exchanges`);
    }
    console.log(`all pairs: ${(allR / allM).toFixed(2)} rounds a match`);
  }
}
module.exports = { match, typeRound, roundWords, G };
