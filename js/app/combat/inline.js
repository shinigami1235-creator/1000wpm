// InlineLine: lit words for the modes whose fight owns its word stack (Boss Rush, the Superboss).
// Gid, 27 Nov 2026: a special never changes or adds a word. It lights up words already in your line,
// at least two ahead of the one you're on, in its colour with a short label and a timer, and typing
// them right in time does the thing.
//
//   const L = InlineLine.create({ cps: () => letters a second })
//   L.sync(list, base)   list: the specials live now, { id, kind, n (words, default 1), label, due, total, color };
//                        new ones light the first free words from two ahead, ones that left go dark
//                        (unless you're typing one). base: the stack words, current first.
//   L.view(base, t)      { cur, next, tags, head } for WordFlow.render; head is { item, part, last }
//                        when the word you're on is lit
//   L.reach(base)        ms until you reach a newly lit word
//   L.shift()            the stack moved on one word
//   L.done(id)           that special is finished (fired or failed): its words go dark
//   L.hold(base) / L.release()   the special at the front stays lit while you type it
window.InlineLine = (() => {
  const NEAR = 2;
  function create(o = {}) {
    let items = [], spent = new Set();
    const cps = () => Math.max(1.2, (o.cps && o.cps()) || 3);
    const busy = i => items.some(it => i >= it.pos && i < it.pos + it.n);
    function put(it, base) {
      for (let i = NEAR; i + it.n <= Math.max(base.length, NEAR + it.n); i++) {
        let free = true;
        for (let j = 0; j < it.n; j++) if (busy(i + j)) { free = false; break; }
        if (free) { it.pos = i; items.push(it); return true; }
      }
      return false;
    }
    function sync(list, base) {
      const live = new Map(list.map(x => [x.id, x]));
      items = items.filter(it => live.has(it.id) || (it.typing && it.pos <= 0));
      for (const it of items) { const x = live.get(it.id); if (x) { it.due = x.due; it.total = x.total; it.x = x; } }
      for (const id of spent) if (!live.has(id)) spent.delete(id);
      const fresh = [];
      for (const x of list) {
        if (spent.has(x.id) || items.some(it => it.id === x.id)) continue;
        const it = { id: x.id, kind: x.kind, n: x.n || 1, label: x.label || '', due: x.due, total: x.total, color: x.color, x, ok: true };
        if (put(it, base)) fresh.push(it);
      }
      return fresh;
    }
    const at = i => items.find(it => i >= it.pos && i < it.pos + it.n);
    function view(base, t = performance.now()) {
      const tags = base.slice(0, 51).map((w, i) => {
        const it = at(i); if (!it) return null;
        const timed = it.total && it.due && isFinite(it.due);
        return { kind: it.kind, color: it.color, first: i === it.pos, last: i === it.pos + it.n - 1, label: i === it.pos ? it.label : '',
          ms: timed ? it.total : 0, el: timed ? Math.max(0, it.total - (it.due - t)) : 0 };
      });
      const h = at(0);
      return { cur: base[0] || '', next: base.slice(1, 51), tags, head: h ? { item: h, part: -h.pos, last: -h.pos === h.n - 1 } : null };
    }
    return {
      sync, view,
      reach: base => { let L = 0; for (let i = 0; i < NEAR && i < base.length; i++) L += base[i].length + 1; return 1000 * (L + 1) / cps(); },
      // a word that went past lit and untyped (or typed wrong) takes its special with it
      shift() { for (const it of items) it.pos--; items = items.filter(it => { if (it.pos + it.n <= 0) { spent.add(it.id); return false; } return true; }); },
      done(id) { items = items.filter(it => it.id !== id); spent.add(id); },
      hold() { const h = at(0); if (h) h.typing = true; },
      release() { for (const it of items) it.typing = false; },
      has: id => items.some(it => it.id === id),
      items: () => items.slice(),
      clear() { items = []; spent.clear(); },
    };
  }
  return { create, NEAR };
})();
