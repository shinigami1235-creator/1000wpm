// Avatar catalogue: face sliders, skin tones, eyes, brows, makeup, hair, facial hair,
// outfits, accessories and glow, with prices, free parts and the seeded generator for
// simulated players. No three.js here, so the shop and the boards can read it before the
// 3D files load.
// A look is a small JSON object stored in the player profile as profile.look:
//   { v: 1, f: { sex: -60, jawW: 25 }, sk: 3, ec: 1, bs: 'straight', bc: -1, h: 'buzz', hc: 0,
//     fh: 'none', g: ['visor'], o: 'crew', oc: 0, gl: 'green',
//     mk: { liner: 'none', linerC: 0, shadow: 'none', shadowC: 0, blush: 'none', blushC: 0, lip: 'none', lipC: 0 } }
// f holds slider values from -100 to 100 (missing means 0). Fields added later have
// defaults, so looks saved before them still load.
window.AvatarData = (() => {
  // the first 21 sliders keep their order: the seeded generator draws them in this order
  const SLIDERS = [
    ['sex', 'Masculine to feminine', 'face'], ['headW', 'Head width', 'face'], ['jawW', 'Jaw width', 'face'],
    ['jawA', 'Jaw angle', 'face'], ['chinL', 'Chin length', 'face'], ['chinW', 'Chin width', 'face'],
    ['cheekH', 'Cheekbone height', 'face'], ['cheekW', 'Cheekbone width', 'face'], ['ears', 'Ear size', 'face'],
    ['neck', 'Neck thickness', 'face'],
    ['eyeS', 'Eye size', 'eyes'], ['eyeD', 'Eye spacing', 'eyes'], ['eyeT', 'Eye tilt', 'eyes'],
    ['browH', 'Brow height', 'brows'], ['browD', 'Brow depth', 'brows'],
    ['noseL', 'Nose length', 'nose'], ['noseW', 'Nose width', 'nose'], ['noseB', 'Nose bridge', 'nose'], ['noseT', 'Nose tip', 'nose'],
    ['lips', 'Lip fullness', 'mouth'], ['mouthW', 'Mouth width', 'mouth'],
    ['browT', 'Brow thickness', 'brows'], ['browA', 'Brow angle', 'brows'],
  ].map(([id, name, group]) => ({ id, name, group }));
  const LEGACY_SLIDERS = SLIDERS.slice(0, 21);

  const SKIN = ['#ebc6aa', '#e6bc9c', '#d9ab86', '#c69470', '#b3805c', '#9c6c4a', '#85583a', '#6c452d', '#553422', '#45291c'];
  const HAIR_COLORS = [
    { id: 0, name: 'Black', hex: '#1d1815' }, { id: 1, name: 'Dark brown', hex: '#3b281c' },
    { id: 2, name: 'Brown', hex: '#6b462b' }, { id: 3, name: 'Auburn', hex: '#8a3f23' },
    { id: 4, name: 'Blonde', hex: '#c9a466' }, { id: 5, name: 'Grey', hex: '#a3a29d' },
    { id: 6, name: 'Teal dye', hex: '#2cb3a6', price: 400 }, { id: 7, name: 'Red dye', hex: '#d63e57', price: 400 },
  ];
  const EYE_COLORS = [
    { id: 0, name: 'Dark brown', hex: '#4a2c1a' }, { id: 1, name: 'Brown', hex: '#7a4a26' }, { id: 2, name: 'Hazel', hex: '#8c7038' },
    { id: 3, name: 'Green', hex: '#5a8a4a' }, { id: 4, name: 'Blue', hex: '#4f86c2' }, { id: 5, name: 'Grey', hex: '#8a98a2' },
    { id: 6, name: 'Cyber cyan', hex: '#3ee6ff', price: 400 }, { id: 7, name: 'Cyber red', hex: '#ff4d5e', price: 400 },
  ];
  const OUTFIT_COLORS = [
    { id: 0, name: 'Charcoal', hex: '#34393d' }, { id: 1, name: 'Black', hex: '#1a1c1e' }, { id: 2, name: 'White', hex: '#e4e2dc' },
    { id: 3, name: 'Burgundy', hex: '#6e1f2c' }, { id: 4, name: 'Navy', hex: '#1f2c4a' }, { id: 5, name: 'Olive', hex: '#4a5232' },
    { id: 6, name: 'Tan', hex: '#a07a52' }, { id: 7, name: 'Red', hex: '#b0283a' }, { id: 8, name: 'Teal', hex: '#1f6b68' },
  ];
  const GLOWS = [
    { id: 'green', name: 'Green', hex: '#39ff88' }, { id: 'cyan', name: 'Cyan', hex: '#3ee6ff' },
    { id: 'red', name: 'Red', hex: '#ff4d5e', price: 1000 },
    { id: 'gold', name: 'Gold', hex: '#f2c230', lock: 'level' },
  ];
  // makeup layers: styles, then colours (the first ones are free)
  const MAKEUP = {
    liner: { name: 'Eyeliner', styles: [['none', 'None'], ['thin', 'Thin'], ['winged', 'Winged'], ['heavy', 'Heavy']],
      colors: [{ name: 'Black', hex: '#141012' }, { name: 'Brown', hex: '#3e2618' }, { name: 'Navy', hex: '#1c2a6e', price: 300 }, { name: 'Violet', hex: '#4b2470', price: 300 }] },
    shadow: { name: 'Eyeshadow', styles: [['none', 'None'], ['soft', 'Soft'], ['smoky', 'Smoky']],
      colors: [{ name: 'Taupe', hex: '#7a5e52' }, { name: 'Bronze', hex: '#94603a' }, { name: 'Plum', hex: '#5c2a52', price: 300 }, { name: 'Teal', hex: '#1f6d74', price: 300 }, { name: 'Gold', hex: '#c09232', price: 400 }] },
    blush: { name: 'Blush', styles: [['none', 'None'], ['on', 'On']],
      colors: [{ name: 'Rose', hex: '#d06a78' }, { name: 'Peach', hex: '#e08a68' }, { name: 'Berry', hex: '#a83a5c', price: 300 }] },
    lip: { name: 'Lipstick', styles: [['none', 'None'], ['matte', 'Matte'], ['gloss', 'Gloss']],
      colors: [{ name: 'Nude', hex: '#b9776a' }, { name: 'Rose', hex: '#c24a64' }, { name: 'Red', hex: '#b51e2e', price: 300 }, { name: 'Berry', hex: '#8e1f52', price: 300 },
               { name: 'Wine', hex: '#5a1420', price: 400 }, { name: 'Black', hex: '#1c1416', price: 400 }] },
  };
  const MK_DEFAULT = { liner: 'none', linerC: 0, shadow: 'none', shadowC: 0, blush: 'none', blushC: 0, lip: 'none', lipC: 0 };

  // slot -> items. price missing means free. zones stop two accessories sitting in the same place.
  const PARTS = {
    h: [
      { id: 'buzz', name: 'Buzz' }, { id: 'undercut', name: 'Undercut' }, { id: 'sidepart', name: 'Side part', price: 700 },
      { id: 'slick', name: 'Slicked back', price: 600 }, { id: 'long', name: 'Long, tied back', price: 900 },
      { id: 'ponytail', name: 'Ponytail', price: 900 }, { id: 'bun', name: 'Bun', price: 900 },
      { id: 'bob', name: 'Bob', price: 900 }, { id: 'longstraight', name: 'Long straight', price: 1000 },
      { id: 'longlayered', name: 'Long layered', price: 1100 }, { id: 'curly', name: 'Curly', price: 1200 },
      { id: 'afro', name: 'Afro', price: 1300 }, { id: 'mohawk', name: 'Mohawk', price: 1200 },
      { id: 'braids', name: 'Braids', price: 1400 }, { id: 'hood', name: 'Hood up', price: 1500 },
    ],
    fh: [
      { id: 'none', name: 'None' }, { id: 'stubble', name: 'Stubble', price: 300 },
      { id: 'moustache', name: 'Moustache', price: 500 }, { id: 'goatee', name: 'Goatee', price: 600 },
      { id: 'shortbeard', name: 'Short beard', price: 700 }, { id: 'beard', name: 'Full beard', price: 900 },
    ],
    bs: [
      { id: 'straight', name: 'Straight' }, { id: 'arched', name: 'Arched' }, { id: 'soft', name: 'Soft' },
      { id: 'thick', name: 'Thick' }, { id: 'thin', name: 'Thin' }, { id: 'angled', name: 'Angled' },
      { id: 'bushy', name: 'Bushy' }, { id: 'slit', name: 'Slit', price: 400 },
    ],
    g: [
      { id: 'glasses', name: 'Glasses', price: 800, zones: ['eyes'] },
      { id: 'visor', name: 'Visor', price: 2000, zones: ['eyes'] },
      { id: 'goggles', name: 'Goggles', price: 1500, zones: ['eyes'] },
      { id: 'implant', name: 'Cyber eye implant', price: 3000, zones: ['eyes'] },
      { id: 'respirator', name: 'Respirator mask', price: 2500, zones: ['mouth'] },
      { id: 'headset', name: 'Headset with mic', price: 1800, zones: ['top', 'ears'] },
      { id: 'cap', name: 'Cap', price: 900, zones: ['top'] },
      { id: 'bandana', name: 'Bandana', price: 700, zones: ['top'] },
      { id: 'earrings', name: 'Hoop earrings', price: 500, zones: ['lobes'] },
      { id: 'chain', name: 'Chain necklace', price: 900, zones: ['chest'] },
      { id: 'pendant', name: 'Pendant necklace', price: 1200, zones: ['chest'] },
      { id: 'choker', name: 'Spiked choker', price: 1100, zones: ['neck'] },
    ],
    o: [
      { id: 'crew', name: 'Tee' }, { id: 'tank', name: 'Tank top', price: 1200 },
      { id: 'shirt', name: 'Open shirt over a tee', price: 1800 }, { id: 'hoodie', name: 'Hoodie', price: 1600 },
      { id: 'jacket', name: 'Leather jacket', price: 2600 }, { id: 'collar', name: 'High collar', price: 1200 },
      { id: 'plates', name: 'Shoulder plates', price: 3000 },
    ],
  };
  const SLOT_NAME = { h: 'Hair', fh: 'Facial hair', bs: 'Brows', g: 'Accessory', o: 'Outfit', hc: 'Hair colour', gl: 'Glow', ec: 'Eye colour', mkc: 'Makeup colour' };
  const HOOD_BLOCKS = ['top', 'ears'];
  const GOLD_LEVEL = 20;

  const DEFAULT = { v: 1, f: {}, sk: 3, ec: 0, bs: 'straight', bc: -1, h: 'buzz', hc: 1, fh: 'none', g: [], o: 'crew', oc: 0, gl: 'green', mk: MK_DEFAULT };

  // ---------- shop items ----------
  const itemId = (slot, id) => `av-${slot}-${id}`;
  function items() {
    const out = [];
    for (const [slot, list] of Object.entries(PARTS)) for (const p of list) if (p.price) out.push({ id: itemId(slot, p.id), name: p.name, price: p.price, slot, part: p.id, category: 'avatar' });
    for (const c of HAIR_COLORS) if (c.price) out.push({ id: itemId('hc', c.id), name: `${c.name} hair`, price: c.price, slot: 'hc', part: c.id, category: 'avatar' });
    for (const c of EYE_COLORS) if (c.price) out.push({ id: itemId('ec', c.id), name: `${c.name} eyes`, price: c.price, slot: 'ec', part: c.id, category: 'avatar' });
    for (const c of GLOWS) if (c.price) out.push({ id: itemId('gl', c.id), name: `${c.name} glow`, price: c.price, slot: 'gl', part: c.id, category: 'avatar' });
    for (const [layer, m] of Object.entries(MAKEUP)) m.colors.forEach((c, i) => {
      if (c.price) out.push({ id: itemId('mkc', `${layer}-${i}`), name: `${c.name} ${m.name.toLowerCase()}`, price: c.price, slot: 'mkc', part: `${layer}-${i}`, category: 'avatar' });
    });
    return out.sort((a, b) => a.price - b.price);
  }
  function part(slot, id) {
    if (slot === 'hc') return HAIR_COLORS.find(c => c.id === +id);
    if (slot === 'ec') return EYE_COLORS.find(c => c.id === +id);
    if (slot === 'gl') return GLOWS.find(c => c.id === id);
    if (slot === 'mkc') { const [layer, i] = String(id).split('-'); const m = MAKEUP[layer]; return m && m.colors[+i] ? { ...m.colors[+i], name: `${m.colors[+i].name} ${m.name.toLowerCase()}` } : undefined; }
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
  const defaultBrow = f => ((f && f.sex) || 0) > 25 ? 'soft' : 'straight';
  function normalize(look) {
    const src = look && typeof look === 'object' ? look : {};
    const L = { ...DEFAULT, ...src };
    const f = {};
    for (const s of SLIDERS) { const v = Math.round(+((src.f && src.f[s.id]) || 0)); if (v) f[s.id] = clamp(v, -100, 100); }
    L.f = f;
    L.sk = clamp(Math.round(+L.sk) || 0, 0, SKIN.length - 1);
    L.hc = clamp(Math.round(+L.hc) || 0, 0, HAIR_COLORS.length - 1);
    L.ec = clamp(Math.round(+L.ec) || 0, 0, EYE_COLORS.length - 1);
    L.oc = clamp(Math.round(+L.oc) || 0, 0, OUTFIT_COLORS.length - 1);
    L.bc = Math.round(+L.bc); if (!(L.bc >= 0 && L.bc < HAIR_COLORS.length)) L.bc = -1;
    if (!part('bs', src.bs)) L.bs = defaultBrow(f);
    if (!part('h', L.h)) L.h = DEFAULT.h;
    if (!part('fh', L.fh)) L.fh = 'none';
    if (!part('o', L.o)) L.o = DEFAULT.o;
    if (!part('gl', L.gl)) L.gl = DEFAULT.gl;
    const mk = { ...MK_DEFAULT, ...(src.mk && typeof src.mk === 'object' ? src.mk : {}) };
    for (const [layer, m] of Object.entries(MAKEUP)) {
      if (!m.styles.some(s => s[0] === mk[layer])) mk[layer] = 'none';
      mk[layer + 'C'] = clamp(Math.round(+mk[layer + 'C']) || 0, 0, m.colors.length - 1);
    }
    L.mk = Object.fromEntries(Object.keys(MK_DEFAULT).map(k => [k, mk[k]]));
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
    if (lockOf('bs', L.bs)) L.bs = defaultBrow(L.f);
    if (lockOf('o', L.o)) L.o = DEFAULT.o;
    if (lockOf('hc', L.hc)) L.hc = DEFAULT.hc;
    if (lockOf('ec', L.ec)) L.ec = DEFAULT.ec;
    if (L.bc >= 0 && lockOf('hc', L.bc)) L.bc = -1;
    if (lockOf('gl', L.gl)) L.gl = DEFAULT.gl;
    for (const layer of Object.keys(MAKEUP)) if (lockOf('mkc', `${layer}-${L.mk[layer + 'C']}`)) L.mk = { ...L.mk, [layer + 'C']: 0 };
    L.g = L.g.filter(id => !lockOf('g', id));
    return L;
  }
  // every paid thing a look uses, for the creator's save check
  function unownedParts(L) {
    const out = [];
    const chk = (slot, id) => { const l = lockOf(slot, id); if (l) out.push({ slot, id, name: part(slot, id).name, l }); };
    chk('h', L.h); chk('fh', L.fh); chk('bs', L.bs); chk('o', L.o); chk('hc', L.hc); chk('ec', L.ec); chk('gl', L.gl);
    if (L.bc >= 0) chk('hc', L.bc);
    for (const layer of Object.keys(MAKEUP)) if (L.mk[layer] !== 'none') chk('mkc', `${layer}-${L.mk[layer + 'C']}`);
    L.g.forEach(id => chk('g', id));
    return out;
  }

  // ---------- hashing and the seeded generator ----------
  function stable(look) {
    const L = normalize(look);
    const f = Object.keys(L.f).sort().map(k => `${k}:${L.f[k]}`).join(',');
    const mk = Object.keys(MK_DEFAULT).map(k => L.mk[k]).join(',');
    return `${L.sk}|${L.h}|${L.hc}|${L.fh}|${L.g.join(',')}|${L.o}|${L.gl}|${f}|${L.ec}|${L.bs}|${L.bc}|${L.oc}|${mk}`;
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
  // A random look. free: only free parts (new players). The face stays within the middle of
  // every slider so every result reads as a person. Choices added after the first release
  // come from a second generator, so the people already on the boards keep their faces.
  function random(seed, { free = false } = {}) {
    const r = rng(seed);
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;
    const woman = r() < 0.5;
    const f = {};
    for (const s of LEGACY_SLIDERS) f[s.id] = Math.round(clamp(gauss() * 70, -85, 85));
    f.sex = Math.round((woman ? 1 : -1) * (55 + r() * 40));
    if (woman) { f.jawW = Math.min(f.jawW, 20); f.browD = Math.min(f.browD, 20); f.lips = Math.max(f.lips, -20); }
    else { f.lips = Math.min(f.lips, 40); }
    const L = { v: 1, f, sk: Math.floor(r() * SKIN.length), g: [], o: 'crew', gl: 'green' };
    L.hc = weighted(r, [[0, 4], [1, 4], [2, 3], [3, 1.5], [4, 1.5], [5, 1], [6, free ? 0 : 0.6], [7, free ? 0 : 0.6]]);
    const r2 = rng(String(seed) + '|v3');
    L.ec = weighted(r2, [[0, 4], [1, 3], [2, 2], [3, 1.5], [4, 2], [5, 1]]);
    L.bs = woman ? weighted(r2, [['soft', 3], ['arched', 3], ['thin', 2], ['angled', 1.5], ['straight', 1]])
      : weighted(r2, [['straight', 4], ['thick', 2.5], ['bushy', 1], ['angled', 1.5], ['arched', 0.5]]);
    f.browT = Math.round(clamp((r2() - 0.5) * 80, -50, 50)); f.browA = Math.round(clamp((r2() - 0.5) * 70, -40, 40));
    L.oc = weighted(r2, [[0, 3], [1, 3], [2, 1], [3, 1.5], [4, 1.5], [5, 1], [6, 1], [7, 0.8], [8, 0.8]]);
    const mkOn = woman && !free && r2() < 0.7;
    L.mk = { ...MK_DEFAULT };
    if (mkOn) {
      L.mk.liner = weighted(r2, [['none', 1], ['thin', 2], ['winged', 2], ['heavy', 0.6]]); L.mk.linerC = r2() < 0.8 ? 0 : 1;
      L.mk.shadow = weighted(r2, [['none', 2], ['soft', 2], ['smoky', 0.6]]); L.mk.shadowC = Math.floor(r2() * 2);
      L.mk.blush = r2() < 0.6 ? 'on' : 'none'; L.mk.blushC = Math.floor(r2() * 2);
      L.mk.lip = weighted(r2, [['none', 1], ['matte', 2], ['gloss', 2]]); L.mk.lipC = weighted(r2, [[0, 2], [1, 2], [2, 1.5], [3, 1], [4, 0.5]]);
    }
    if (free) {
      L.h = r() < 0.5 ? 'buzz' : 'undercut'; L.fh = 'none'; L.gl = r() < 0.5 ? 'green' : 'cyan';
      return normalize(L);
    }
    L.h = woman ? weighted(r, [['bob', 3], ['long', 3], ['braids', 2.5], ['hood', 1], ['slick', 0.6], ['undercut', 0.5], ['mohawk', 0.5], ['buzz', 0.3]])
      : weighted(r, [['buzz', 2.5], ['undercut', 2.5], ['slick', 1.5], ['mohawk', 1], ['hood', 1.2], ['long', 0.8], ['braids', 0.6], ['bob', 0.2]]);
    // some people get one of the newer styles instead
    if (r2() < 0.45) L.h = woman ? weighted(r2, [['longstraight', 3], ['longlayered', 3], ['ponytail', 2], ['bun', 2], ['curly', 2], ['afro', 1.2]])
      : weighted(r2, [['sidepart', 3], ['curly', 1.5], ['afro', 1], ['ponytail', 0.5], ['bun', 0.4]]);
    L.fh = woman ? 'none' : weighted(r, [['none', 4], ['stubble', 2.5], ['moustache', 1], ['goatee', 1.2], ['beard', 1.5]]);
    if (L.fh === 'beard' && r2() < 0.5) L.fh = 'shortbeard';
    L.o = weighted(r, [['crew', 3], ['collar', 2], ['hoodie', 2.5], ['plates', 1]]);
    if (r2() < 0.5) L.o = weighted(r2, [['shirt', 3], ['jacket', 3], ['tank', woman ? 2 : 1]]);
    L.gl = weighted(r, [['green', 4], ['cyan', 3], ['red', 2], ['gold', 0.6]]);
    let look = L;
    const nGear = weighted(r, [[0, 3], [1, 4], [2, 1.5]]);
    const legacyGear = ['visor', 'goggles', 'implant', 'respirator', 'headset', 'cap', 'bandana', 'earrings'];
    for (let i = 0; i < nGear; i++) look = withGear(look, pick(r, legacyGear));
    if (r2() < 0.35) look = withGear(look, weighted(r2, [['chain', 2], ['pendant', 2], ['choker', woman ? 1.5 : 0.5], ['glasses', 1.5]]));
    return normalize(look);
  }

  return {
    SLIDERS, SKIN, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS, GLOWS, MAKEUP, MK_DEFAULT, PARTS, SLOT_NAME, DEFAULT, GOLD_LEVEL, HOOD_BLOCKS,
    items, itemId, part, lockOf, normalize, usable, unownedParts, withGear, stable, hash, random, rng,
  };
})();
