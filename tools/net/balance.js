// Bot against bot duels to tune DuelRules.CONFIG and the PvP spells. node tools/net/balance.js
const load = require('./load');
const G = load();
const W = ['time', 'about', 'people', 'world', 'house', 'water', 'light', 'still', 'story', 'right', 'place', 'great', 'small', 'every', 'found', 'never', 'under', 'thing', 'night', 'point', 'think', 'three', 'large', 'often', 'other', 'first', 'learn', 'paper', 'group', 'begin', 'music', 'those', 'both', 'mark', 'book', 'letter', 'until', 'mile', 'river', 'car', 'feet', 'care', 'second', 'enough', 'plain', 'girl', 'usual', 'young', 'ready', 'above', 'ever', 'red', 'list', 'though', 'feel', 'talk', 'bird', 'soon', 'body', 'dog', 'family', 'direct', 'pose', 'leave', 'song', 'measure', 'door', 'product', 'black', 'short', 'numeral', 'class', 'wind', 'question', 'happen', 'complete', 'ship', 'area', 'half', 'rock', 'order', 'fire', 'south', 'problem', 'piece', 'told', 'knew', 'pass', 'since', 'top', 'whole', 'king', 'space', 'heard', 'best', 'hour', 'better', 'true', 'during', 'hundred', 'five', 'remember', 'step', 'early', 'hold', 'west', 'ground', 'interest', 'reach', 'fast', 'verb', 'sing', 'listen', 'six', 'table', 'travel', 'less', 'morning'];
function words(seed) { const r = G.NetCore.rng(seed); const out = []; for (let i = 0; i < 400; i++) out.push(W[Math.floor(r() * W.length)]); return out; }
function duel(a, b, seed, cfg = {}) {
  const m = G.DuelRules.match({ seed, words: r => words(seed + ':' + r), config: cfg });
  const bots = [G.NetBot.create({ ...a, seed: seed + 'a' }), G.NetBot.create({ ...b, seed: seed + 'b' })];
  let t = 0;
  while (!m.result() && t < 1200000) {
    t += 20;
    m.advance(t);
    const st = m.state();
    for (let i = 0; i < 2; i++) {
      const s = st.sides[i];
      const v = { phase: st.phase, stream: s.idx != null ? m.words(st.round)[s.idx % 400] : '', typed: s.typed, offers: (s.offer || []).slice().sort((x, y) => G.Combat.spell(y).rarity - G.Combat.spell(x).rarity).map(id => G.Combat.spell(id).word), offerId: s.offerUntil, locked: s.locked, fog: s.fog };
      for (const k of bots[i].step(t, v)) m.input(i, k.k, k.t);
    }
  }
  return m;
}
module.exports = { duel, words, G };
if (require.main === module) {
  const pairs = [[60, 60], [60, 70], [60, 80], [80, 100], [100, 204], [140, 204], [40, 55]];
  for (const [wa, wb] of pairs) {
    let winsB = 0, rounds = 0, roundMs = 0, n = 30, wpmA = 0, wpmB = 0, accA = 0, spells = 0;
    for (let s = 0; s < n; s++) {
      const m = duel({ wpm: wa, acc: 0.95 }, wb === 204 ? { ...G.NetBot.ART } : { wpm: wb, acc: 0.95 }, 'b' + wa + wb + s);
      const r = m.result();
      if (r.winner === 1) winsB++;
      rounds += r.rounds.length; roundMs += r.rounds.reduce((x, y) => x + y.ms, 0);
      wpmA += r.sides[0].wpm; wpmB += r.sides[1].wpm; accA += r.sides[0].acc; spells += r.sides[0].spells.length + r.sides[1].spells.length;
    }
    console.log(`${wa} vs ${wb}: B wins ${Math.round(100 * winsB / n)}%, rounds ${(rounds / n).toFixed(2)}, round ${(roundMs / rounds / 1000).toFixed(1)} s, measured wpm ${(wpmA / n).toFixed(0)} / ${(wpmB / n).toFixed(0)}, acc A ${(accA / n).toFixed(1)}, spells/match ${(spells / n).toFixed(1)}`);
  }
}
