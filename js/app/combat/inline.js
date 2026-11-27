// InlineLine: the World Boss's one line of words (Gid, 27 Nov 2026) for the modes whose fight owns
// its own word stack: Boss Rush, the Superboss and Party. There are no extra words to look up for.
// A block, a packet, a weak point, a spell and the rest go into your own line as words, and typing
// them in order does the thing. They only ever go in past the middle line (WordFlow.far), so the
// words you're about to type never change under you.
//
// Here the special words go in between the stack words instead of replacing them, since the fight
// keeps the stack. Each one remembers how many stack words come before it (pos), and that count
// drops as the stack moves on.
//
//   const L = InlineLine.create({ flow: () => flow, cps: () => letters a second })
//   L.sync(list, base)   list: the specials live now, { id, kind, word, due, total, color, ... };
//                        new ones go in past the middle line, ones that left drop out (unless you're
//                        typing that one). base: the stack words, current first. Returns the new ones.
//   L.view(base)         { cur, next, tags, head } for WordFlow.render; head is the special you're on, or null
//   L.reach(base)        ms until you reach the first word a new special may take
//   L.shift()            a stack word was used up (typed, missed or eaten)
//   L.done(id)           the special at the head was typed (right or wrong): it leaves the line
//   L.hold(base) / L.release()  the front special stays while you type it / you cleared what you typed
//   L.has(id) / L.items() / L.clear()
window.InlineLine = (() => {
  function create(o = {}) {
    let items = [], seq = 0, spent = new Set();
    const cps = () => Math.max(1.2, (o.cps && o.cps()) || 3);

    // the line as entries: the specials sitting before stack word p, then stack word p, and so on
    function entries(base) {
      const out = [], by = new Map();
      for (const it of items) (by.get(it.pos) || by.set(it.pos, []).get(it.pos)).push(it);
      for (const a of by.values()) a.sort((x, y) => x.seq - y.seq);
      const last = Math.max(base.length, ...items.map(x => x.pos + 1));
      for (let p = 0; p < last; p++) {
        for (const it of by.get(p) || []) out.push({ item: it, word: it.word });
        if (p < base.length) out.push({ word: base[p] });
      }
      return out;
    }
    function far() { return typeof WordFlow !== 'undefined' ? WordFlow.far(typeof o.flow === 'function' ? o.flow() : o.flow) : 4; }
    function reachTo(base, n) {
      const e = entries(base);
      let L = 0;
      for (let i = 0; i < n && i < e.length; i++) L += e[i].word.length + 1;
      return 1000 * (L + 1) / cps();
    }
    // a new special goes in front of the first stack word at or past the middle line's end
    function put(it, base) {
      const e = entries(base), at = Math.min(far(), e.length);
      let pos = 0;
      for (let i = 0; i < at; i++) if (!e[i].item) pos++;
      it.pos = pos; it.seq = ++seq;
      items.push(it);
    }
    function sync(list, base) {
      const live = new Map(list.map(x => [x.id, x]));
      const head = entries(base)[0];
      items = items.filter(it => live.has(it.id) || it.keep || (head && head.item === it && it.typing));
      for (const it of items) { const x = live.get(it.id); if (x) { it.due = x.due; it.total = x.total; it.x = x; } }
      const fresh = [];
      for (const id of spent) if (!live.has(id)) spent.delete(id);
      for (const x of list) {
        if (spent.has(x.id) || items.some(it => it.id === x.id)) continue;
        const it = { id: x.id, kind: x.kind, word: x.word, due: x.due, total: x.total, color: x.color, x };
        put(it, base);
        fresh.push(it);
      }
      return fresh;
    }
    function view(base, t = performance.now()) {
      const e = entries(base);
      const tags = e.slice(0, 51).map(x => x.item && {
        kind: x.item.kind, color: x.item.color, first: true, last: true,
        ms: x.item.total && x.item.due && isFinite(x.item.due) ? x.item.total : 0,
        el: x.item.total && x.item.due && isFinite(x.item.due) ? Math.max(0, x.item.total - (x.item.due - t)) : 0,
      });
      return { cur: e[0] ? e[0].word : '', next: e.slice(1, 51).map(x => x.word), tags, head: e[0] && e[0].item ? e[0].item : null, stackAt: i => { let n = -1; for (let k = 0; k <= i && k < e.length; k++) if (!e[k].item) n++; return e[i] && !e[i].item ? n : -1; } };
    }
    return {
      sync, view,
      reach: base => reachTo(base, far()) + 1000 * items.filter(it => it.pos >= 1).reduce((n, it) => n + it.word.length + 1, 0) / cps(),
      shift() { for (const it of items) if (it.pos > 0) it.pos--; },
      // the special at the front stays in the line while you type it, even if its moment passes
      hold(base) { const e = entries(base)[0]; if (e && e.item) e.item.typing = true; },
      release() { for (const it of items) it.typing = false; },
      done(id) { items = items.filter(it => it.id !== id); spent.add(id); },
      has: id => items.some(it => it.id === id),
      items: () => items.slice(),
      clear() { items = []; spent.clear(); },
      // the view index of stack word i (0 = the current stack word), for marks drawn on stack words
      indexOf(base, i) { const e = entries(base); let n = -1; for (let k = 0; k < e.length; k++) if (!e[k].item && ++n === i) return k; return -1; },
    };
  }
  return { create };
})();
