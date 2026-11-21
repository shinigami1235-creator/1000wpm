// Simulated typists for the sim backend. A bot reads what is on its screen (the next
// word, any spell on offer, a counter word) and plans key presses with human timing:
// a reaction delay before it starts, uneven gaps between keys around its wpm, slower
// spaces and double letters, now and then a pause, and typos from neighbouring keys
// that it usually fixes with Backspace and sometimes leaves in.
//
//   const bot = NetBot.create({ wpm: 72, acc: 0.95, seed: 'x', spell: 0.6 });
//   bot.step(now, view) -> [{ t, k }]   the keys due by now, in order
//   view: { phase: 'fight' | ..., stream: 'word', typed: '', offers: ['data spike'], offerId, counter: 'block' | null, counterId,
//           buffs: ['patch'] | null, buffId, locked: ms, fog: n, tasks: [{ id, word, kind, chance }] }
//   The ids tell a new offer, attack or buff offer apart from an earlier one with the same words.
//
// Bots are always shown as bots in the interface. Their names come from NetSim.
(function (root) {
  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const NEAR = {};
  ROWS.forEach((row, y) => [...row].forEach((c, x) => {
    const n = [];
    for (const [dy, dx] of [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, -1], [1, 0]]) { const r = ROWS[y + dy]; if (r && r[x + dx]) n.push(r[x + dx]); }
    NEAR[c] = n.join('');
  }));

  // Art's pace while no recorded run exists: the same shape js/core.js uses for his ghost in the
  // race (TT.paceTimes at 204 wpm). A recorded key log can replace it: NetBot.ART_TAPE = [ms between keys].
  const ART = { name: 'Art', wpm: 204, acc: 0.985, react: [160, 300], spell: 0.95, pause: 0.02, fix: 0.95 };

  function create(o = {}) {
    const r = root.NetCore.rng(o.seed || 'bot');
    const wpm = o.wpm || 60, acc = Math.min(0.995, o.acc || 0.95);
    const react = o.react || [380, 750];
    const spellChance = o.spell != null ? o.spell : 0.5;
    const pauseChance = o.pause != null ? o.pause : 0.07;
    const fixChance = o.fix != null ? o.fix : 0.8;
    const tape = o.tape || null;
    // The gaps below average out long and fixing typos costs time, so the base is shortened
    // until the wpm measured over a match lands near the wpm asked for. form is how well this
    // bot types today: each bot is a few per cent faster or slower than its number.
    const form = o.form != null ? o.form : 1 + (r() + r() + r() - 1.5) * 0.08;
    const base = 60000 / (wpm * form * 5) / (1.17 + (1 - acc) * 2.8);
    let plan = [], intent = null, lastT = 0, tapeI = 0, started = false;
    const seen = new Set();

    function gap(ch, prev, fog) {
      let d;
      if (tape && tape.length) d = tape[tapeI++ % tape.length];
      else {
        d = base * (0.55 + r() * 0.9);
        if (ch === ' ') d *= 1.25;
        if (prev === ch) d *= 1.2;
      }
      return d * (fog ? 1.3 : 1);
    }

    function makePlan(word, t0, fog, kind) {
      const keys = [];
      let t = t0, prev = '';
      const perr = (1 - acc) * 1.05;
      const text = word + ' ';
      for (let n = 0; n < text.length; n++) {
        const ch = text[n];
        t += gap(ch, prev, fog);
        if (ch !== ' ' && r() < perr) {
          const near = NEAR[ch] || 'e';
          keys.push({ t, k: near[Math.floor(r() * near.length)] });
          if (r() < fixChance) {
            t += base * (1.4 + r() * 1.6);
            keys.push({ t, k: 'Backspace' });
            t += base * (0.8 + r() * 0.6);
            keys.push({ t, k: ch });
          } else {
            // left in: the word goes in wrong
          }
        } else keys.push({ t, k: ch });
        prev = ch;
      }
      return { keys, word, kind };
    }

    function choose(now, v) {
      const ck = 'c:' + (v.counterId || v.counter), bk = 'b:' + (v.buffId || (v.buffs || []).join()), ok = 'o:' + (v.offerId || (v.offers || []).join());
      if (v.counter && !seen.has(ck)) {
        seen.add(ck);
        if (r() < (o.guard != null ? o.guard : 0.85)) return { word: v.counter, kind: 'counter', delay: react[0] + r() * (react[1] - react[0]) };
      }
      // party tasks: revive, heal, shield, pop a mite, cut a car, change aim
      for (const tk of v.tasks || []) {
        if (seen.has(tk.id)) continue;
        seen.add(tk.id);
        if (r() < tk.chance) return { word: tk.word, kind: tk.kind, delay: react[0] * 0.7 + r() * (react[1] - react[0]) * 0.8 };
      }
      if (v.buffs && v.buffs.length && !seen.has(bk)) {
        seen.add(bk);
        if (r() < 0.9) return { word: v.buffs[Math.floor(r() * v.buffs.length)], kind: 'buff', delay: react[0] + r() * (react[1] - react[0]) };
      }
      if (v.offers && v.offers.length && !seen.has(ok)) {
        seen.add(ok);
        if (r() < spellChance) {
          // the rarest spell on offer is listed first; bots usually take it
          const w = r() < 0.7 ? v.offers[0] : v.offers[Math.floor(r() * v.offers.length)];
          return { word: w, kind: 'spell', delay: react[0] * 0.6 + r() * (react[1] - react[0]) };
        }
      }
      return { word: v.stream, kind: 'stream', delay: r() < pauseChance ? 250 + r() * 600 : 0 };
    }

    function step(now, v) {
      const out = [];
      if (!v || v.phase !== 'fight') { plan = []; intent = null; lastT = now; started = false; return out; }
      if (!started) { started = true; lastT = now + react[0] + r() * (react[1] - react[0]); }
      if (v.locked > 0) {
        // keys are dead while locked; the bot waits it out and starts again a little after
        const until = now + v.locked + 120 + r() * 200;
        const shift = Math.max(0, until - (plan[0] ? plan[0].t : now));
        plan.forEach(p => { p.t += shift; });
        lastT = Math.max(lastT, until);
        return out;
      }
      for (let guard = 0; guard < 200; guard++) {
        if (!plan.length) {
          if (lastT > now) break;
          if (!v.stream && !v.counter && !(v.offers && v.offers.length)) break;
          // anything already typed into the buffer (a lock cut a word off) is cleared first
          if (v.typed && !intent) { plan = [{ t: Math.max(lastT, now) + base, k: 'CtrlBackspace' }]; intent = { word: '', kind: 'clear' }; continue; }
          const c = choose(now, v);
          if (!c.word) break;
          const p = makePlan(c.word, Math.max(lastT, now - 40) + c.delay, v.fog > 0, c.kind);
          plan = p.keys; intent = { word: c.word, kind: c.kind };
        }
        if (plan[0].t > now) break;
        const k = plan.shift();
        out.push(k);
        lastT = k.t;
        if (!plan.length) { intent = null; break; }   // the view changes after each word; ask again next step
      }
      return out;
    }

    return { step, wpm, acc, reset() { plan = []; intent = null; started = false; seen.clear(); } };
  }

  root.NetBot = { create, ART, ART_TAPE: null, NEAR };
})(globalThis);
