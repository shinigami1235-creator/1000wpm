// Where the academy and free typing get their words. js/wordbank.js (being written
// alongside) exposes WordBank.pick(); when it is loaded every list comes from it, and until
// then the lists come from window.WORDS in js/words.js.
// The WordBank call is guessed as WordBank.pick(n, opts) returning an array of words or a
// string. Any other answer, or an error, falls back to words.js.
window.LearnWords = (() => {
  const W = () => window.WORDS || { common: [], long: [] };
  const rand = n => Math.floor(Math.random() * n);
  const sample = (list, n) => {
    const out = [];
    if (!list.length) return out;
    while (out.length < n) {
      const w = list[rand(list.length)];
      if (w !== out[out.length - 1] || list.length < 2) out.push(w);
    }
    return out;
  };

  function fromBank(n, opts) {
    const B = window.WordBank;
    if (!B || typeof B.pick !== 'function') return null;
    try {
      const r = B.pick(n, opts);
      const a = Array.isArray(r) ? r : typeof r === 'string' ? r.split(/\s+/) : null;
      const clean = a && a.map(w => String(typeof w === 'object' && w ? w.word || w.text || '' : w)).filter(w => /^\S+$/.test(w));
      return clean && clean.length ? clean.slice(0, n) : null;
    } catch (e) { console.warn('WordBank.pick failed, using words.js', e); return null; }
  }

  // n common words. top limits the list to its first entries, which are the most used words.
  function common(n, { top = 1000, min = 1, max = 99 } = {}) {
    return fromBank(n, { kind: 'common', top, minLen: min, maxLen: max }) ||
      sample(W().common.slice(0, top).filter(w => w.length >= min && w.length <= max), n);
  }
  function long(n, { min = 6, max = 10 } = {}) {
    return fromBank(n, { kind: 'long', minLen: min, maxLen: max }) ||
      sample([...W().common, ...W().long].filter(w => w.length >= min && w.length <= max), n);
  }
  // words made only of the letters in allowed. need, when given, must appear in every word.
  function only(allowed, { need = '', min = 2, max = 8 } = {}) {
    const ok = new Set(allowed), must = new Set(need);
    const all = [...new Set([...W().common, ...W().long])];
    return all.filter(w => w.length >= min && w.length <= max && [...w].every(c => ok.has(c)) && (!must.size || [...w].some(c => must.has(c))));
  }

  // themed packs: WordBank's when it has any, otherwise the packs in js/learn/lessons.js
  function packs() {
    const B = window.WordBank, own = (window.LEARN && LEARN.PACKS) || {};
    let theirs = {};
    try {
      const p = B && (typeof B.packs === 'function' ? B.packs() : B.packs);
      if (Array.isArray(p)) p.forEach(x => { if (x && x.name && Array.isArray(x.words)) theirs[x.name] = { name: x.name, words: x.words }; });
      else if (p && typeof p === 'object') Object.entries(p).forEach(([k, v]) => { if (Array.isArray(v)) theirs[k] = { name: k[0].toUpperCase() + k.slice(1), words: v }; else if (v && Array.isArray(v.words)) theirs[k] = { name: v.name || k, words: v.words }; });
    } catch (e) { theirs = {}; }
    return Object.keys(theirs).length ? theirs : own;
  }
  function pack(id, n) {
    const p = packs()[id];
    return p ? sample(p.words, n) : common(n);
  }

  return { common, long, only, packs, pack, sample, bank: () => !!(window.WordBank && WordBank.pick) };
})();
