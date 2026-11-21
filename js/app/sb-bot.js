// A simulated typist for the Superboss. It reads the fight's snapshot and types into it at a set
// speed and accuracy, the same way a person would: blocks first, then packets, weak points and
// spells, then the oldest bug line, the head worth cutting, then the word stack. The viewer page
// uses it to run the simulated stream, and tools/superboss/balance.js uses it to check that each
// dial is fair for its speed.
//   const bot = SuperBot.create({ state, char, back, now }, { wpm: 165, acc: 0.97, react: 260, rng });
//   bot.step()   call often; it types when its next key is due
window.SuperBot = (() => {
  function create(api, o = {}) {
    const rng = o.rng || Math.random;
    let wpm = o.wpm || 160, acc = o.acc === undefined ? 0.97 : o.acc, react = o.react || 260;
    let plan = null, nextAt = 0, fix = false;
    const keyMs = () => 60000 / (wpm * 5);
    const can = x => x.left == null || x.left > x.word.length * keyMs() + 120;
    const soon = list => list.filter(can).sort((a, b) => (a.left ?? 1e9) - (b.left ?? 1e9))[0];
    function choose(s) {
      const T = s.targets, k = kind => T.filter(x => x.kind === kind);
      let p = soon(k('block')) || soon(k('packet')) || soon(k('weak')) || soon(k('crowd')) || soon(k('spell'));
      if (!p && s.boss === 'compiler') p = soon(k('fix'));
      if (!p && s.boss === 'hydra' && s.b && !s.stack.length) {
        const up = s.b.heads.filter(h => h.up && h.tid);
        const patch = up.find(h => h.id === 'patch');
        // phase 1: cut Fork to stop the bites; from phase 2 Patch first since it reattaches heads
        const order = s.phase >= 2 ? ['patch', 'fork', 'root'] : ['fork', 'root', 'patch'];
        const h = (s.phase >= 2 && patch) ? patch : up.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0];
        if (h) p = T.find(x => x.id === h.tid);
      }
      if (!p && s.stack.length) p = { id: 'stack', kind: 'stack', word: s.stack[0] };
      return p ? { id: p.id, word: p.word, i: 0, kind: p.kind || 'stack' } : null;
    }
    function alive(s) {
      if (!plan || plan.done) return false;
      if (plan.id === 'stack') return s.stack[0] === plan.word;
      return s.targets.some(x => x.id === plan.id);
    }
    // when the page was busy and the bot fell behind, it catches up with a few actions at once
    function step() {
      for (let i = 0; i < 12 && api.now() >= nextAt; i++) act();
    }
    function act() {
      const at = api.now();
      nextAt = Math.max(nextAt, at - 400);
      const s = api.state();
      if (s.status === 'finish' && s.finish) {
        const p = s.finish.phrase;
        if (!p.startsWith(s.typed)) { api.back(); nextAt = Math.max(nextAt, at - 400) + keyMs() * 2; return; }
        if (s.typed.length < p.length) {
          if (rng() > acc + 0.01) api.char('q'); else api.char(p[s.typed.length]);
          nextAt = Math.max(nextAt, at - 400) + keyMs() * (0.7 + rng() * 0.6);
        }
        return;
      }
      if (s.status !== 'fight') { plan = null; return; }
      if (fix) { api.back(); fix = false; nextAt = Math.max(nextAt, at - 400) + keyMs() * 1.5; return; }
      if (!alive(s)) {
        if (s.typed) { api.back(true); }
        const was = plan && plan.kind;
        plan = choose(s);
        // a new kind of target costs a reaction; the next word of the same stream does not
        const same = plan && (plan.kind === 'stack' || plan.kind === 'head' || plan.kind === 'fix') && plan.kind === was;
        nextAt = Math.max(nextAt, at - 400) + (plan ? (same ? keyMs() * 1.5 : react * (0.7 + rng() * 0.6)) : 120);
        return;
      }
      if (plan.i >= plan.word.length) {
        api.char(' ');
        plan = { kind: plan.kind, done: true };
        nextAt = Math.max(nextAt, at - 400) + keyMs() * (0.8 + rng() * 0.5);
        return;
      }
      if (rng() > acc) { api.char(plan.word[plan.i] === 'x' ? 'z' : 'x'); fix = true; nextAt = Math.max(nextAt, at - 400) + keyMs() * 1.4; return; }
      api.char(plan.word[plan.i++]);
      nextAt = Math.max(nextAt, at - 400) + keyMs() * (0.6 + rng() * 0.8);
    }
    return { step, set(n) { if (n.wpm) wpm = n.wpm; if (n.acc !== undefined) acc = n.acc; if (n.react) react = n.react; }, get wpm() { return wpm; } };
  }
  return { create };
})();
