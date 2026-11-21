// Plays party runs with bot teams at different speeds and prints how they go.
// node tools/net/party-balance.js
const load = require('./load');
const G = load([]);
const W = 'time year people way day man thing woman life child world school state family student group country problem hand part place case week company system program question work government number night point home water room mother area money story fact month lot right study book eye job word business issue side kind head house service friend father power hour game line end member law car city community name president team minute idea kid body information back parent face others level office door health person art war history party result change morning reason research girl guy moment air teacher force education'.split(' ');
const words = seed => { const r = G.NetCore.rng(seed); return Array.from({ length: 300 }, () => W[Math.floor(r() * W.length)]); };
function play(runId, diff, seed, team) {
  const players = team.map((x, i) => ({ id: 'p' + i, name: ['guest', 'flux_dex50', 'kbd_mira42', 'nova_7'][i], role: x[0], wpm: x[1] }));
  const run = G.PartyRules.run({ seed, run: runId, difficulty: diff, players, words: (id, f) => words(id + f + seed), counters: () => ['firewall', 'checksum', 'reboot', 'kernel'], foeWords: f => words('foe' + f + seed) });
  const bots = new Map(players.map(p => [p.id, G.NetBot.create({ wpm: p.wpm, acc: 0.94, seed: seed + p.id, guard: 0.82 })]));
  const ev = []; run.on(e => ev.push(e));
  let t = 0;
  while (!run.result() && t < 2000000) { t += 25; run.advance(t); const st = run.state(); for (const p of st.players) for (const k of bots.get(p.id).step(t, G.PartyRules.view(st, p.id, run.words(p.id)))) run.input(p.id, k.k, k.t); }
  const r = run.result();
  return `${r.won ? 'WON ' : 'lost'} ${r.fights.map(f => `${f.kind} ${((f.endedAt - f.startedAt) / 1000).toFixed(0)}s`).join(' ')} | downs ${r.players.map(p => p.downs).join('/')} heals ${ev.filter(e => e.type === 'heal').length} revives ${ev.filter(e => e.type === 'up' && e.by).length} taken ${r.players.map(p => p.taken).join('/')}`;
}
const teams = {
  'solo 50': [['striker', 50]],
  '2x 50 (st+sup)': [['striker', 50], ['support', 50]],
  '4x 40': [['striker', 40], ['guard', 40], ['support', 40], ['striker', 40]],
  '4x 60': [['striker', 60], ['guard', 60], ['support', 60], ['striker', 60]],
  '4x 90': [['striker', 90], ['guard', 90], ['support', 90], ['striker', 90]],
  '3x 60 no support': [['striker', 60], ['guard', 60], ['striker', 60]],
};
for (const diff of process.argv[2] ? [process.argv[2]] : ['easy', 'normal', 'hard'])
  for (const [k, team] of Object.entries(teams)) for (const s of ['a', 'b']) console.log(diff.padEnd(6), k.padEnd(18), play('deep', diff, s + k, team));
