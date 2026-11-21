// One player's typing buffer for the multiplayer modes. It decides which word a key
// is aimed at (the next word in the stream, an offered spell, a counter word) the same
// way the world boss does, and reports each finished word. Duels, party runs, bots and
// the server's replay all use it, so a replayed key log gives the same words.
//
//   const ty = NetTypist.create({ stream: () => 'next', extras: () => [{ id, word, kind }] });
//   ty.key(k, t)   k: one character, 'Backspace' or 'CtrlBackspace'
//                  -> null | { key: true, good } | { submit: { kind, id, word, typed, ok, clean, letters, ms } }
//   ty.state()     -> { typed, target: { id, word, kind } | null, clean }
//   ty.reset()
//
// kind is 'stream' for the word stream, or the extra's own kind ('spell', 'counter', 'buff').
// A two-word target ("data spike") keeps its space. ok is true when the typed text equals
// the target word. clean is false once any wrong key was pressed on this word.
(function (root) {
  function create({ stream, extras = () => [] }) {
    let typed = '', target = null, clean = true, t0 = 0;
    const streamT = () => ({ id: 'stream', word: stream() || '', kind: 'stream' });

    function retarget() {
      const ex = extras();
      if (target && target.kind !== 'stream' && !ex.some(x => x.id === target.id)) target = null;
      if (target && target.word.startsWith(typed)) return;
      const m = ex.find(x => x.word.startsWith(typed));
      if (m) { target = m; return; }
      const s = streamT();
      if (s.word.startsWith(typed)) { target = s; return; }
      // a slip in the first letters of a spell word was more likely meant for the stream
      if (!target || (target.kind !== 'stream' && typed.length < 4)) target = s;
    }

    function submit(t) {
      const ex = extras();
      const exact = ex.find(x => x.word === typed);
      const s = streamT();
      if (exact) target = exact;
      else if (typed === s.word) target = s;
      else if (!target) retarget();
      const tg = target || s;
      const out = { kind: tg.kind, id: tg.id, word: tg.word, typed, ok: typed === tg.word, clean: clean && typed === tg.word, letters: tg.word.replace(/ /g, '').length, ms: Math.max(1, t - t0) };
      typed = ''; target = null; clean = true;
      return { submit: out };
    }

    function key(k, t = 0) {
      if (k === 'Backspace' || k === 'CtrlBackspace') {
        if (!typed) return null;
        typed = k === 'CtrlBackspace' ? '' : typed.slice(0, -1);
        if (!typed) target = null; else retarget();
        return { back: true };
      }
      if (typeof k !== 'string' || k.length !== 1) return null;
      if (k === ' ') {
        if (target && target.kind !== 'stream' && target.word.startsWith(typed + ' ') && typed) { typed += ' '; return { key: true, good: true }; }
        if (typed) return submit(t);
        return null;
      }
      if (!typed) t0 = t;
      typed += k;
      retarget();
      const w = target ? target.word : '';
      const good = typed.length <= w.length && k === w[typed.length - 1];
      if (!good) clean = false;
      return { key: true, good };
    }

    return {
      key,
      state: () => ({ typed, target: target && { ...target }, clean }),
      reset() { typed = ''; target = null; clean = true; },
    };
  }
  root.NetTypist = { create };
})(globalThis);
