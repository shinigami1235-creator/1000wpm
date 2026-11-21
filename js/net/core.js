// Small helpers every multiplayer file uses: a string hash, a seeded random number
// generator and an event emitter. No DOM, so a server can load this file too.
//
//   NetCore.hash('text')        -> 32-bit unsigned int
//   NetCore.rng(seed)           -> () => 0..1, the same sequence for the same seed (string or number)
//   NetCore.pick(r, list)       -> one item
//   NetCore.between(r, a, b)    -> a number from a to b
//   NetCore.emitter()           -> { on(name, fn) -> off, off(name, fn), emit(name, payload) }   '*' hears every event
(function (root) {
  function hash(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hash(seed);
    // mix the seed first so seeds that differ by one character start far apart
    a = Math.imul(a ^ (a >>> 16), 0x45d9f3b) >>> 0; a = Math.imul(a ^ (a >>> 16), 0x45d9f3b) >>> 0; a = (a ^ (a >>> 16)) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
  const between = (r, a, b) => a + r() * (b - a);

  function emitter() {
    const subs = new Map();
    function on(name, fn) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(fn);
      return () => off(name, fn);
    }
    function off(name, fn) { const s = subs.get(name); if (s) s.delete(fn); }
    function emit(name, payload) {
      for (const key of [name, '*']) {
        const s = subs.get(key);
        if (!s) continue;
        for (const fn of [...s]) {
          try { key === '*' ? fn(name, payload) : fn(payload); } catch (e) { console.error(e); }
        }
      }
    }
    return { on, off, emit, clear: () => subs.clear() };
  }

  root.NetCore = { hash, rng, pick, between, emitter };
})(globalThis);
