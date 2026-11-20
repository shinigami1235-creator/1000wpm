// Avatar catalogue: face sliders, skin tones, hair, facial hair, gear, outfits and glow,
// with prices, free parts and the seeded generator for simulated players. No three.js here,
// so the shop and the boards can read it before the 3D files load.
// A look is a small JSON object stored in the player profile as profile.look:
//   { v: 1, f: { sex: -60, jawW: 25 }, sk: 3, h: 'buzz', hc: 0, fh: 'none', g: ['visor'], o: 'crew', gl: 'green' }
// f holds slider values from -100 to 100 (missing means 0).
window.AvatarData = (() => {
  const SLIDERS = [
    ['sex', 'Masculine to feminine', 'face'], ['headW', 'Head width', 'face'], ['jawW', 'Jaw width', 'face'],
    ['jawA', 'Jaw angle', 'face'], ['chinL', 'Chin length', 'face'], ['chinW', 'Chin width', 'face'],
    ['cheekH', 'Cheekbone height', 'face'], ['cheekW', 'Cheekbone width', 'face'], ['ears', 'Ear size', 'face'],
    ['neck', 'Neck thickness', 'face'],
    ['eyeS', 'Eye size', 'eyes'], ['eyeD', 'Eye spacing', 'eyes'], ['eyeT', 'Eye tilt', 'eyes'],
    ['browH', 'Brow height', 'eyes'], ['browD', 'Brow depth', 'eyes'],
    ['noseL', 'Nose length', 'nose'], ['noseW', 'Nose width', 'nose'], ['noseB', 'Nose bridge', 'nose'], ['noseT', 'Nose tip', 'nose'],
    ['lips', 'Lip fullness', 'mouth'], ['mouthW', 'Mouth width', 'mouth'],
  ].map(([id, name, group]) => ({ id, name, group }));

  const SKIN = ['#ebc6aa', '#e6bc9c', '#d9ab86', '#c69470', '#b3805c', '#9c6c4a', '#85583a', '#6c452d', '#553422', '#45291c'];
  const HAIR_COLORS = [
    { id: 0, name: 'Black', hex: '#1d1815' }, { id: 1, name: 'Dark brown', hex: '#3b281c' },
    { id: 2, name: 'Brown', hex: '#6b462b' }, { id: 3, name: 'Auburn', hex: '#8a3f23' },
    { id: 4, name: 'Blonde', hex: '#c9a466' }, { id: 5, name: 'Grey', hex: '#a3a29d' },
    { id: 6, name: 'Teal dye', hex: '#2cb3a6', price: 400 }, { id: 7, name: 'Red dye', hex: '#d63e57', price: 400 },
  ];
  const GLOWS = [
    { id: 'green', name: 'Green', hex: '#39ff88' }, { id: 'cyan', name: 'Cyan', hex: '#3ee6ff' },
    { id: 'red', name: 'Red', hex: '#ff4d5e', price: 1000 },
    { id: 'gold', name: 'Gold', hex: '#f2c230', lock: 'level' },
  ];
  // slot -> items. price missing means free. zones stop two gear items sitting in the same place.
  const PARTS = {
    h: [
      { id: 'buzz', name: 'Buzz' }, { id: 'undercut', name: 'Undercut' },
      { id: 'slick', name: 'Slicked back', price: 600 }, { id: 'long', name: 'Long, tied back', price: 900 },
      { id: 'bob', name: 'Bob', price: 900 }, { id: 'mohawk', name: 'Mohawk', price: 1200 },
      { id: 'braids', name: 'Braids', price: 1400 }, { id: 'hood', name: 'Hood up', price: 1500 },
    ],
    fh: [
      { id: 'none', name: 'None' }, { id: 'stubble', name: 'Stubble', price: 300 },
      { id: 'moustache', name: 'Moustache', price: 500 }, { id: 'goatee', name: 'Goatee', price: 600 },
      { id: 'beard', name: 'Beard', price: 900 },
    ],
    g: [
      { id: 'visor', name: 'Visor', price: 2000, zones: ['eyes'] },
      { id: 'goggles', name: 'Goggles', price: 1500, zones: ['eyes'] },
      { id: 'implant', name: 'Cyber eye implant', price: 4000, zones: ['eyes'] },
      { id: 'respirator', name: 'Respirator mask', price: 2500, zones: ['mouth'] },
      { id: 'headset', name: 'Headset with mic', price: 1800, zones: ['top', 'ears'] },
      { id: 'cap', name: 'Cap', price: 900, zones: ['top'] },
      { id: 'bandana', name: 'Bandana', price: 700, zones: ['top'] },
      { id: 'earrings', name: 'Earrings', price: 500, zones: ['lobes'] },
    ],
    o: [
      { id: 'crew', name: 'Crew neck' }, { id: 'collar', name: 'High collar', price: 1200 },
      { id: 'hoodie', name: 'Hoodie', price: 1600 }, { id: 'plates', name: 'Shoulder plates', price: 3000 },
    ],
  };
  const SLOT_NAME = { h: 'Hair', fh: 'Facial hair', g: 'Gear', o: 'Outfit', hc: 'Hair colour', gl: 'Glow' };
  const HOOD_BLOCKS = ['top', 'ears'];
  const GOLD_LEVEL = 20;

  const DEFAULT = { v: 1, f: {}, sk: 3, h: 'buzz', hc: 1, fh: 'none', g: [], o: 'crew', gl: 'green' };

  // ---------- shop items ----------
  const itemId = (slot, id) => `av-${slot}-${id}`;
  function items() {
    const out = [];
    for (const [slot, list] of Object.entries(PARTS)) for (const p of list) if (p.price) out.push({ id: itemId(slot, p.id), name: p.name, price: p.price, slot, part: p.id, category: 'avatar' });
    for (const c of HAIR_COLORS) if (c.price) out.push({ id: itemId('hc', c.id), name: `${c.name} hair`, price: c.price, slot: 'hc', part: c.id, category: 'avatar' });
    for (const c of GLOWS) if (c.price) out.push({ id: itemId('gl', c.id), name: `${c.name} glow`, price: c.price, slot: 'gl', part: c.id, category: 'avatar' });
    return out.sort((a, b) => a.price - b.price);
  }
  function part(slot, id) {
    if (slot === 'hc') return HAIR_COLORS.find(c => c.id === +id);
    if (slot === 'gl') return GLOWS.find(c => c.id === id);
    return (PARTS[slot] || []).find(p => p.id === id);
  }
  // Can the player use this part? Returns null when they can and { why, price? } when they can't.
  function lockOf(slot, id) {
    const p = part(slot, id);
    if (!p) return { why: 'Unknown' };
    if (p.lock === 'level') {
      const lv = window.WPM ? WPM.levelInfo().level : 1;
      return lv >= GOLD_LEVEL ? null : { why: `Reach level ${GOLD_LEVEL}` };
    }
    if (!p.price) return null;
    return window.WPM && WPM.owns(itemId(slot, id)) ? null : { why: 'Buy', price: p.price };
  }

  // ---------- normalising ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function normalize(look) {
    const L = { ...DEFAULT, ...(look && typeof look === 'object' ? look : {}) };
    const f = {};
    for (const s of SLIDERS) { const v = Math.round(+((look && look.f && look.f[s.id]) || 0)); if (v) f[s.id] = clamp(v, -100, 100); }
    L.f = f;
    L.sk = clamp(Math.round(+L.sk) || 0, 0, SKIN.length - 1);
    L.hc = clamp(Math.round(+L.hc) || 0, 0, HAIR_COLORS.length - 1);
    if (!part('h', L.h)) L.h = DEFAULT.h;
    if (!part('fh', L.fh)) L.fh = 'none';
    if (!part('o', L.o)) L.o = DEFAULT.o;
    if (!part('gl', L.gl)) L.gl = DEFAULT.gl;
    L.g = [...new Set(Array.isArray(L.g) ? L.g : [])].filter(id => part('g', id));
    L.g = withGear(L, null).g;
    L.v = 1;
    return L;
  }
  // Adds gear id (or only cleans the list) and drops anything that shares a zone with it
  // or that the hood covers.
  function withGear(look, id) {
    let g = [...look.g];
    if (id) {
      const z = part('g', id).zones;
      g = g.filter(x => !part('g', x).zones.some(k => z.includes(k)));
      g.push(id);
    }
    if (look.h === 'hood') g = g.filter(x => !part('g', x).zones.some(k => HOOD_BLOCKS.includes(k)));
    const order = PARTS.g.map(p => p.id);
    return { ...look, g: g.sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
  }
  // The player's own look with anything not owned swapped for a free part.
  function usable(look) {
    const L = normalize(look);
    if (lockOf('h', L.h)) L.h = DEFAULT.h;
    if (lockOf('fh', L.fh)) L.fh = 'none';
    if (lockOf('o', L.o)) L.o = DEFAULT.o;
    if (lockOf('hc', L.hc)) L.hc = DEFAULT.hc;
    if (lockOf('gl', L.gl)) L.gl = DEFAULT.gl;
    L.g = L.g.filter(id => !lockOf('g', id));
    return L;
  }

  // ---------- hashing and the seeded generator ----------
  function stable(look) {
    const L = normalize(look);
    const f = Object.keys(L.f).sort().map(k => `${k}:${L.f[k]}`).join(',');
    return `${L.sk}|${L.h}|${L.hc}|${L.fh}|${L.g.join(',')}|${L.o}|${L.gl}|${f}`;
  }
  function hash(look) {
    const s = typeof look === 'string' ? look : stable(look);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  function rng(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : parseInt(hash(String(seed)), 36) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  function weighted(r, pairs) {
    const tot = pairs.reduce((a, p) => a + p[1], 0); let x = r() * tot;
    for (const [v, w] of pairs) { if ((x -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  }
  // A random look. free: only free parts (new players). The face stays within the
  // middle of every slider so every result reads as a person.
  function random(seed, { free = false } = {}) {
    const r = rng(seed);
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;      // -1..1, peaked at 0
    const woman = r() < 0.5;
    const f = {};
    for (const s of SLIDERS) f[s.id] = Math.round(clamp(gauss() * 70, -85, 85));
    f.sex = Math.round((woman ? 1 : -1) * (55 + r() * 40));
    if (woman) { f.jawW = Math.min(f.jawW, 20); f.browD = Math.min(f.browD, 20); f.lips = Math.max(f.lips, -20); }
    else { f.lips = Math.min(f.lips, 40); }
    const L = { v: 1, f, sk: Math.floor(r() * SKIN.length), g: [], o: 'crew', gl: 'green' };
    L.hc = weighted(r, [[0, 4], [1, 4], [2, 3], [3, 1.5], [4, 1.5], [5, 1], [6, free ? 0 : 0.6], [7, free ? 0 : 0.6]]);
    if (free) {
      L.h = r() < 0.5 ? 'buzz' : 'undercut'; L.fh = 'none'; L.gl = r() < 0.5 ? 'green' : 'cyan';
      return normalize(L);
    }
    L.h = woman ? weighted(r, [['bob', 3], ['long', 3], ['braids', 2.5], ['hood', 1], ['slick', 0.6], ['undercut', 0.5], ['mohawk', 0.5], ['buzz', 0.3]])
      : weighted(r, [['buzz', 2.5], ['undercut', 2.5], ['slick', 1.5], ['mohawk', 1], ['hood', 1.2], ['long', 0.8], ['braids', 0.6], ['bob', 0.2]]);
    L.fh = woman ? 'none' : weighted(r, [['none', 4], ['stubble', 2.5], ['moustache', 1], ['goatee', 1.2], ['beard', 1.5]]);
    L.o = weighted(r, [['crew', 3], ['collar', 2], ['hoodie', 2.5], ['plates', 1]]);
    L.gl = weighted(r, [['green', 4], ['cyan', 3], ['red', 2], ['gold', 0.6]]);
    let look = L;
    const nGear = weighted(r, [[0, 3], [1, 4], [2, 1.5]]);
    for (let i = 0; i < nGear; i++) look = withGear(look, pick(r, PARTS.g).id);
    return normalize(look);
  }

  return {
    SLIDERS, SKIN, HAIR_COLORS, GLOWS, PARTS, SLOT_NAME, DEFAULT, GOLD_LEVEL, HOOD_BLOCKS,
    items, itemId, part, lockOf, normalize, usable, withGear, stable, hash, random, rng,
  };
})();
