// Tests for the World Boss beam face-off (js/app/boss-rules.js, js/app/boss-net.js).
// node tools/boss/faceoff-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }

// a context with a clock we move by hand
function ctxAt(t0) {
  const clock = { t: t0 }, timers = [];
  const D = function () {}; D.now = () => clock.t;
  const ctx = { console, Math, JSON, Date: D, performance: { now: () => clock.t }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: f => (timers.push(f), timers.length), clearInterval() {} };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/app/boss-rules.js', 'js/app/boss-net.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, clock, step(ms) { const end = clock.t + ms; while (clock.t < end) { clock.t = Math.min(end, clock.t + 50); timers.forEach(f => f()); } } };
}

const T0 = 1764300000000;
const { ctx } = ctxAt(T0);
const R = ctx.WorldBossRules, F = R.FACEOFF;
const state = (o = {}) => ({ bossId: 'abc', startedAt: T0, phase: 0, phaseAt: [T0, null, null, null, null], ...o });

// ---------- the schedule ----------
{
  const s = state(), starts = [];
  let last = null;
  for (let t = T0; t < T0 + 30 * 60000; t += 250) {
    const f = R.faceoffAt(s, t);
    if (f && f.id !== last) { last = f.id; starts.push(f.start - T0); }
    if (f) {
      const others = R.eventsAt(s, t).filter(e => e.type !== 'faceoff' && e.type !== 'adds' && e.start >= f.start - 1);
      ok(!others.length, `nothing starts during face-off ${f.id} (at ${((t - T0) / 1000).toFixed(1)} s)`);
      const running = R.eventsAt(s, t).filter(e => e.type !== 'faceoff' && e.type !== 'adds');
      if (running.length) { ok(false, `no attack runs during face-off ${f.id} at ${((t - T0) / 1000).toFixed(1)} s: ${running.map(e => e.type + ':' + e.kind).join(',')}`); break; }
    }
  }
  console.log('face-offs in 30 min start at', starts.map(x => (x / 1000).toFixed(0) + ' s').join(', '));
  ok(starts.length >= 8 && starts.length <= 10, `about one every 3 min (${starts.length} in 30 min)`);
  ok(starts[0] >= 160000 && starts[0] <= 215000, `the first comes about 3 min in (${starts[0] / 1000} s)`);
  const gaps = starts.slice(1).map((x, i) => x - starts[i]);
  ok(gaps.every(g => g >= 135000 && g <= 230000), `gaps stay near 3 min (${gaps.map(g => (g / 1000).toFixed(0)).join(', ')})`);
  ok(new Set(gaps.map(g => Math.round(g / 1000))).size > 2, 'the gaps vary');
  const again = R.faceoffAt(state(), T0 + starts[2] + 3000), first = R.faceoffAt(s, T0 + starts[2] + 3000);
  ok(again && first && again.start === first.start && again.words.join() === first.words.join(), 'two raiders get the same face-off and words');
  ok(first.words.length === 12 && first.words.every(w => /^[a-z]+$/.test(w) && w.length <= 6), 'twelve short resistance words');
  const tr = state({ training: true, bossId: 'trn' }), f1 = R.faceoffsNear(tr, T0 + 60000)[0];
  ok(f1 && f1.start - T0 >= 40000 && f1.start - T0 <= 100000, `the training raid's first comes about 1 min in (${f1 && (f1.start - T0) / 1000} s)`);
  // phases later in the fight: still no overlap
  const s3 = state({ phase: 3, phaseAt: [T0, T0 + 200000, T0 + 400000, T0 + 600000, null] });
  let bad = 0;
  for (let t = T0 + 600000; t < T0 + 1500000; t += 250) { const f = R.faceoffAt(s3, t); if (f && R.eventsAt(s3, t).some(e => e.type !== 'faceoff' && e.type !== 'adds')) bad++; }
  ok(bad === 0, `phase 4: no attack runs during a face-off (${bad} frames)`);
}

// ---------- power ----------
{
  const WIN = (F.CHARGE + F.CLASH) / 1000;
  // words a typist gets through in the window, at wpm with accuracy acc (average word 5 letters and a space)
  const typed = (wpm, acc = 0.95, react = 0.8) => { const n = Math.round(Math.max(0, WIN - react) / (6 * 12 / wpm)); return [Math.round(n * acc), n - Math.round(n * acc)]; };
  const team = list => list.reduce((a, [w, acc]) => a + R.resistPower(...typed(w, acc)), 0);
  for (const p of [0, 2, 4]) {
    const need = R.resistNeed(4, p);
    console.log(`phase ${p}: a squad of 4 needs ${need.toFixed(1)}; 4 at 30 wpm make ${team([[30], [30], [30], [30]]).toFixed(1)}, 4 at 40 make ${team([[40], [40], [40], [40]]).toFixed(1)}, one at 150 and three idle make ${team([[150]]).toFixed(1)}, one at 150 and three at 30 make ${team([[150], [30], [30], [30]]).toFixed(1)}`);
    ok(team([[40], [40], [40], [40]]) >= need, `phase ${p}: four 40 wpm typists win`);
    ok(team([[150, 0.98]]) < need, `phase ${p}: one fast typist alone can't carry it`);
    ok(team([[150], [30], [30], [30]]) >= need, `phase ${p}: a fast typist with slow teammates wins`);
  }
  ok(team([[30], [30], [30], [30]]) >= R.resistNeed(4, 0), 'phase 1: four 30 wpm typists win by all typing');
  ok(R.resistPower(30, 0) === F.FULL + F.HALF * 0.5, 'past the cap more words add nothing');
  ok(R.resistPower(5, 2) === 4, 'a wrong word takes half a word off');
  ok(R.resistPower(0, 6) === 0, 'power never goes below zero');
}

// ---------- the demo decides once and tells everyone ----------
(async () => {
  const D = ctxAt(T0), W = D.ctx.WorldBossNet, demo = W.LocalDemo;
  W.use(W.Training);
  const evs = []; let snap = null;
  await W.connect({ name: 'Tester' });
  W.onEvent(e => evs.push(e)); W.onState(s => { snap = s; });
  const at = W.demo().faceoffIn(2000);
  D.step(2000 + F.DISENGAGE + 400);
  const st0 = snap;
  const e = D.ctx.WorldBossRules.eventsAt(st0, D.clock.t).find(x => x.type === 'faceoff');
  ok(!!e, 'the face-off is in the shared schedule');
  ok(evs.some(x => x.type === 'faceoffStart'), 'faceoffStart is sent');
  let mine = 0;
  for (let i = 0; i < 6; i++) { const r = await W.sendResist(e.id, e.words[i]); if (r.ok) mine++; D.step(600); }
  const bad = await W.sendResist(e.id, 'nope');
  ok(mine === 6 && !bad.ok, 'right words count, a wrong one does not');
  D.step(F.CHARGE + F.CLASH);
  const res = evs.filter(x => x.type === 'faceoff');
  ok(res.length === 1, `the result is sent once (${res.length})`);
  ok(res[0] && typeof res[0].win === 'boolean' && res[0].power > 0 && res[0].you === 5.5, `the result carries the power (${JSON.stringify(res[0])})`);
  ok(snap.fo && snap.fo.win === res[0].win, 'the state carries the same result');
  const late = await W.sendResist(e.id, e.words[6]);
  ok(!late.ok, 'no words count after it resolves');
  D.step(F.AFTER + 500);
  ok(snap.fo.over, 'it ends');
  if (res[0] && res[0].win) ok(res[0].dmg > 0 && snap.weak, 'a win damages the boss and opens the kernel');
  // twenty runs in a full raid: the raid wins most, but not all
  let wins = 0, n = 0, margins = [];
  for (let k = 0; k < 20; k++) {
    const D2 = ctxAt(T0 + k * 1000), W2 = D2.ctx.WorldBossNet, out = [];
    await W2.connect({ name: 'T' }); W2.onEvent(x => { if (x.type === 'faceoff') out.push(x); });
    W2.demo().faceoffIn(500); D2.step(500 + F.DISENGAGE + F.CHARGE + F.CLASH + 300);
    if (out[0]) { n++; if (out[0].win) wins++; margins.push(out[0].margin); }
  }
  console.log(`full raid, 20 face-offs: won ${wins} of ${n}; margins ${margins.map(m => m.toFixed(2)).join(' ')}`);
  ok(n === 20 && wins >= 9 && wins <= 19, 'a full raid wins most face-offs but can lose');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
