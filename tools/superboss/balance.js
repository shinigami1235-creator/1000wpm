// Balance check for the Superboss: runs each boss on each dial against simulated typists in node,
// with a fake clock, and prints the win rate and fight length.
//   node tools/superboss/balance.js [runs] [boss] [dial]
// A typist at the dial's speed should win most fights; one at 70% of it should lose most.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
let clock = 0;
const ctx = { console, Math, JSON, Set, Map, Array, Object, Number, String, performance: { now: () => clock } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/wordbank-common.js', 'js/wordbank.js', 'js/app/combat/bus.js', 'js/app/combat/spells.js', 'js/app/combat/combo.js',
  'js/app/combat/damage.js', 'js/app/combat/engine.js', 'js/app/rewards-config.js', 'js/app/sb-data.js', 'js/app/sb-fight.js', 'js/app/sb-bot.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function fight(boss, dial, wpm, seed, acc = 0.985) {
  clock = 0;
  const rng = rngOf(seed);
  const f = ctx.SuperFight.create({ boss, dial, now: () => clock, rng });
  const bot = ctx.SuperBot.create({ state: f.state, char: f.char, back: f.back, now: () => clock }, { wpm, acc, rng, react: 300 });
  f.start();
  let phases = 1;
  f.on('phase', e => { phases = e.n; });
  while (clock < 600000 && (f.status === 'countdown' || f.status === 'fight' || f.status === 'finish')) {
    clock += 10; f.tick(); bot.step();
  }
  const r = f.result();
  return { won: r.won, ms: r.ms, phase: phases, hp: r.hpLeft, art: f.state().art.hp, casts: r.casts, best: r.bestCombo, wpm: r.wpm, acc: r.acc, taken: r.taken };
}
const runs = +(process.argv[2] || 6);
const bosses = process.argv[3] ? [process.argv[3]] : ['hydra', 'compiler', 'leviathan'];
const dials = process.argv[4] ? [process.argv[4]] : ['casual', 'normal', 'typemaster', 'brutal'];
for (const boss of bosses) for (const dial of dials) {
  const d = ctx.SuperData.dial(dial);
  for (const k of [1.1, 0.7]) {
    const res = [];
    for (let i = 0; i < runs; i++) res.push(fight(boss, dial, Math.round(d.wpm * k), 1000 + i * 77));
    const wins = res.filter(r => r.won);
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
    console.log(`${boss.padEnd(10)} ${dial.padEnd(10)} bot ${String(Math.round(d.wpm * k)).padStart(3)} wpm: won ${wins.length}/${runs}` +
      `  win time ${(avg(wins.map(r => r.ms)) / 1000).toFixed(0)}s  phase ${avg(res.map(r => r.phase))}  boss hp left ${avg(res.map(r => r.hp))}` +
      `  art hp ${avg(res.map(r => r.art))}  taken ${avg(res.map(r => r.taken))}  casts ${avg(res.map(r => r.casts))}  combo ${avg(res.map(r => r.best))}  real wpm ${avg(res.map(r => r.wpm))}`);
  }
}
