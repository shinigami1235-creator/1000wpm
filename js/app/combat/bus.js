// Combat event bus. Combat.create() makes one per fighter; modes can make their own.
//   const bus = Combat.Bus();
//   const off = bus.on('hit', fn);  bus.once('spellCast', fn);  bus.emit('hit', payload);  bus.clear();
// on('*', fn) hears every event as fn(name, payload).
window.Combat = window.Combat || {};
Combat.Bus = function Bus() {
  const subs = new Map();
  function on(ev, fn) {
    if (!subs.has(ev)) subs.set(ev, new Set());
    subs.get(ev).add(fn);
    return () => off(ev, fn);
  }
  function off(ev, fn) { const s = subs.get(ev); if (s) s.delete(fn); }
  function once(ev, fn) { const o = on(ev, x => { o(); fn(x); }); return o; }
  function emit(ev, payload) {
    const run = (fn, ...a) => { try { fn(...a); } catch (e) { console.error(e); } };
    const s = subs.get(ev);
    if (s) [...s].forEach(fn => run(fn, payload));
    const all = subs.get('*');
    if (all) [...all].forEach(fn => run(fn, ev, payload));
  }
  return { on, off, once, emit, clear: () => subs.clear() };
};
