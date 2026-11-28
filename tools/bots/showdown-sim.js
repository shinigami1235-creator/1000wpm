// Bot against bot Showdowns to tune ShowdownRules (js/app/showdown-rules.js): match length and win rates
// with and without the spell words, and with and without overdrive. Each side is a NetBot typing the round's
// words the way the Showdown page takes keys (js/app/showdown.js sideKey), 20 ms steps. A side done with its
// 10 words types the overdrive stream until the round ends, the special word included when it comes up.
//   node tools/bots/showdown-sim.js [matches per pair, 60]          the spell and no-spell tables
//   node tools/bots/showdown-sim.js od [matches per pair, 400]      overdrive off and on, side by side
const load = require('../net/load');
const G = load(['js/app/showdown-rules.js']);
const SR = G.ShowdownRules, C = SR.CONFIG;
const W = 'time about people world house water light still story right place great small every found never under thing night point think three large often other first learn paper group begin music those both mark book letter until mile river feet care second enough plain young ready above ever list though feel talk bird soon body family direct leave song measure door product black short class wind question happen complete ship area half rock order fire south problem piece told knew pass since whole king space heard best hour better true during hundred five remember step early hold west ground interest reach fast verb sing listen table travel less morning'.split(' ');

function roundWords(seed, r, spells, od) {
  const rng = G.NetCore.rng(`${seed}:${r}`);
  const list = Array.from({ length: C.words }, () => W[Math.floor(rng() * W.length)]);
  const sp = spells ? SR.spellFor(seed, r) : null;
  if (sp) list[sp.slot] = G.Combat.spell(sp.id).word;
  const orng = G.NetCore.rng(`${seed}:${r}:od`);
  const odList = od ? Array.from({ length: 40 }, () => W[Math.floor(orng() * W.length)]) : null;
  return { list, sp, odList, odSpell: od ? SR.odSpellFor(seed, r) : null };
}

// one round of typing for both sides, as the page counts it
// odBots type the overdrive stream (same wpm and accuracy, their own random stream), so a match with
// overdrive on types its 10 words key for key as the same match with it off and the two compare fairly
function typeRound(bots, list, sp, odList, odSpell, odBots) {
  const blank = () => ({ idx: 0, typed: '', good: 0, bad: 0, words: 0, doneAt: null, lastAt: 0, clean: true, wclean: true, spell: null, od: odList ? SR.odState() : null, oi: 0, sw: false });
  const S = [blank(), blank()];
  // the word on screen: one of the 10, or past them the overdrive stream (the special word when it's due)
  const cur = s => (s.idx < C.words ? list[s.idx] : !s.od ? null : s.sw ? G.Combat.spell(odSpell).word : odList[s.oi % odList.length]);
  const submit = (s, t) => {
    const w = cur(s), ok = s.typed === w;
    if (s.idx >= C.words) {
      // an overdrive word
      if (s.sw) { SR.odSpecial(s.od, ok && s.wclean, odSpell); s.sw = false; }
      else { SR.odWord(s.od, ok && s.wclean, t - s.lastAt); s.oi++; }
      s.lastAt = t; s.typed = ''; s.wclean = true;
      if (s.od.due) s.sw = true;
      return;
    }
    if (sp && s.idx === sp.slot) s.spell = { id: sp.id, ok: ok && s.wclean };
    s.idx++; s.typed = ''; s.wclean = true;
    if (ok) { s.words++; s.lastAt = t; } else s.clean = false;
    if (s.idx >= C.words) { s.doneAt = t; s.lastAt = t; }
  };
  const key = (s, k, t) => {
    const w = cur(s);
    if (w == null) return;
    const od = s.idx >= C.words;
    if (k === 'Backspace') { s.typed = s.typed.slice(0, -1); return; }
    if (k === 'CtrlBackspace') { s.typed = ''; return; }
    // a space inside a two-word spell is a letter of it
    if (k === ' ' && !(w.includes(' ') && s.typed.length < w.length && w[s.typed.length] === ' ')) { if (s.typed) submit(s, t); return; }
    s.typed += k;
    const good = s.typed.length <= w.length && k === w[s.typed.length - 1];
    if (od) { if (good) s.od.good++; else { s.od.bad++; s.wclean = false; } return; }
    if (good) s.good++; else { s.bad++; s.clean = false; s.wclean = false; }
    if (s.typed === w && s.idx === C.words - 1) submit(s, t);
  };
  bots.forEach(b => b.reset && b.reset());
  if (odBots) odBots.forEach(b => b.reset());
  for (let t = 0; t <= C.roundMs; t += 20) {
    bots.forEach((b0, i) => {
      const s = S[i], b = odBots && s.idx >= C.words ? odBots[i] : b0;
      for (let g = 0; g < 8; g++) { const ks = b.step(t, { phase: 'fight', stream: cur(s) || '', typed: s.typed }); if (!ks.length) break; ks.forEach(k => key(s, k.k, t)); }
    });
    if (S.every(s => s.idx >= C.words)) break;
  }
  return S;
}

function match(a, b, seed, spells, od = false) {
  const bots = [G.NetBot.create({ ...a, seed: seed + ':b0', pause: 0.03 }), G.NetBot.create({ ...b, seed: seed + ':b1', pause: 0.03 })];
  const odBots = od ? [G.NetBot.create({ ...a, seed: seed + ':o0', pause: 0.03, react: [60, 160] }), G.NetBot.create({ ...b, seed: seed + ':o1', pause: 0.03, react: [60, 160] })] : null;
  const rng = G.NetCore.rng(seed);
  const m = { hp: [C.hp, C.hp], wins: [0, 0], round: 0, kos: 0, casts: 0, fizzles: 0, spellDmg: 0, beams: 0, exchanges: 0, dmg: 0,
    od: { words: [0, 0], dmg: [0, 0], specials: [0, 0], specialOk: [0, 0], tiers: [[0, 0, 0, 0], [0, 0, 0, 0]], base: [0, 0] } };
  const recent = [];
  for (let r = 1; r <= C.rounds; r++) {
    m.round = r;
    const { list, sp, odList, odSpell } = roundWords(seed, r, spells, od);
    const S = typeRound(bots, list, sp, odList, odSpell, odBots);
    const acc = s => (s.good + s.bad ? s.good / (s.good + s.bad) : 0);
    const sides = S.map((s, i) => ({ words: s.words, acc: acc(s), clean: s.clean && s.words > 0, doneAt: s.doneAt, lastAt: s.lastAt, hp: m.hp[i], spell: s.spell, od: s.od }));
    const res = SR.resolve(sides, rng);
    if (od) S.forEach((s, i) => {
      m.od.words[i] += s.od.words; if (s.od.special) { m.od.specials[i]++; if (s.od.special.ok) m.od.specialOk[i]++; }
      const st = res.attacks.find(a => a.kind === 'strike' && a.from === i);
      if (st) { m.od.tiers[i][st.od]++; m.od.dmg[i] += st.odDmg; m.od.base[i] += st.dmg - st.odDmg; }
      res.attacks.filter(a => a.kind === 'spell' && a.od && a.from === i).forEach(a => { m.od.dmg[i] += a.dmg; });
    });
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

// overdrive off and on for the same seeds: win rates, rounds, and what overdrive added
function odTable(N, pairs = [[60, 80], [60, 100], [80, 120], [100, 150], [60, 60], [100, 204]], acc = 0.95) {
  const rows = [];
  for (const [wa, wb] of pairs) {
    const row = { a: wa, b: wb };
    for (const od of [false, true]) {
      let winsB = 0, rounds = 0, odW = [0, 0], odD = [0, 0], base = [0, 0], spOk = [0, 0], sp = [0, 0], t3 = [0, 0], ex = 0;
      for (let s = 0; s < N; s++) {
        const bb = wb === 204 ? { ...G.NetBot.ART } : { wpm: wb, acc };
        const m = match({ wpm: wa, acc }, bb, `sd${wa}-${wb}-${s}`, true, od);
        if (m.winner === 1) winsB++;
        rounds += m.round; ex += m.exchanges;
        for (const i of [0, 1]) { odW[i] += m.od.words[i]; odD[i] += m.od.dmg[i]; base[i] += m.od.base[i]; spOk[i] += m.od.specialOk[i]; sp[i] += m.od.specials[i]; t3[i] += m.od.tiers[i][3]; }
      }
      row[od ? 'on' : 'off'] = { winB: 100 * winsB / N, rounds: rounds / N, odWordsB: odW[1] / ex, odShareB: base[1] ? 100 * odD[1] / base[1] : 0, odShareA: base[0] ? 100 * odD[0] / base[0] : 0, specialsB: sp[1] / N, specialOkB: spOk[1] / N, od3B: 100 * t3[1] / ex };
    }
    rows.push(row);
  }
  return rows;
}

if (require.main === module && process.argv[2] === 'od') {
  const N = +(process.argv[3] || 400);
  console.log(`overdrive off vs on, ${N} matches a pair, spell words on, both sides 95% accurate (B is the faster side)`);
  console.log('pair        B wins off  B wins on  change  rounds off  rounds on  B od words/round  od dmg B  od dmg A  B specials/match (clean)  B rounds at OD3');
  for (const r of odTable(N)) {
    const d = r.on.winB - r.off.winB;
    console.log(`${(r.a + ' vs ' + r.b).padEnd(11)} ${r.off.winB.toFixed(1).padStart(9)}%  ${r.on.winB.toFixed(1).padStart(8)}%  ${(d >= 0 ? '+' : '') + d.toFixed(1)}`.padEnd(48)
      + `${r.off.rounds.toFixed(2).padStart(10)}  ${r.on.rounds.toFixed(2).padStart(9)}  ${r.on.odWordsB.toFixed(2).padStart(16)}  ${('+' + r.on.odShareB.toFixed(1) + '%').padStart(8)}  ${('+' + r.on.odShareA.toFixed(1) + '%').padStart(8)}  ${(r.on.specialsB.toFixed(2) + ' (' + r.on.specialOkB.toFixed(2) + ')').padStart(23)}  ${(r.on.od3B.toFixed(0) + '%').padStart(15)}`);
  }
} else if (require.main === module) {
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
module.exports = { match, typeRound, roundWords, odTable, G };
