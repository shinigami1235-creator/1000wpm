// Avatar catalogue: face sliders, skin tones, eyes, brows, makeup, hair, facial hair,
// outfits, accessories and glow, with prices, free parts and the seeded generator for
// simulated players. No three.js here, so the shop and the boards can read it before the
// 3D files load.
// A look is a small JSON object stored in the player profile as profile.look:
//   { v: 1, f: { sex: -60, jawW: 25 }, sk: 3, ec: 1, bs: 'straight', bc: -1, h: 'buzz', hc: 0,
//     fh: 'none', g: ['visor'], o: 'crew', oc: 0, gl: 'green',
//     mk: { liner: 'thin', linerC: 0, linerS: 0, shadow: 'soft', shadowC: 0, shadowS: 0, blushC: 0, blushS: 0, sculptS: 0,
//           browS: 0, lipC: 0, lipS: 0, lineC: 0, lineS: 0, glossS: 0 } }
// f holds slider values from -100 to 100 (missing means 0, except V-shape: see fv). Fields added later have
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
    ['lips', 'Lip size', 'mouth'], ['mouthW', 'Mouth width', 'mouth'],
    ['browT', 'Brow thickness', 'brows'], ['browA', 'Brow angle', 'brows'],
    // lip shape (morphs from tools/avatar/morphs.py)
    ['lipU', 'Upper lip fullness', 'mouth'], ['lipL', 'Lower lip fullness', 'mouth'], ['lipBow', "Cupid's bow", 'mouth'], ['lipCorner', 'Lip corners', 'mouth'],
    // eye shape and the V-shaped face (FACE pass 3); V-shape runs from 0 to 100
    ['eyeW', 'Eye width', 'eyes'], ['eyeH', 'Eye height', 'eyes'], ['eyeIn', 'Inner corners', 'eyes'], ['eyeOut', 'Outer corners', 'eyes'],
    ['vline', 'V-shape', 'face', 0],
    // FACE pass 4: iris colour from muted (-40) through natural (0, the default) to vivid (100)
    ['eyeB', 'Eye brightness', 'eyes', -40],
    // brow shape (BROW pass 1): prop morphs on the brow cards (tools/avatar/brows.py MORPHS)
    ['browSp', 'Brow spacing', 'brows'], ['browIn', 'Inner height', 'brows'], ['browTl', 'Tail height', 'brows'],
    ['browAp', 'Arch position', 'brows'], ['browAh', 'Arch height', 'brows'], ['browLn', 'Tail length', 'brows'],
    ['browTi', 'Inner thickness', 'brows'], ['browTo', 'Tail thickness', 'brows'],
    // proportions: the facial thirds and the outer fifths (Face tab, under Proportions)
    ['foreH', 'Forehead height', 'prop'], ['midH', 'Midface length', 'prop'], ['lowH', 'Lower face length', 'prop'], ['faceW', 'Face width', 'prop'],
    // the rest of a Sims-style face editor
    ['foreS', 'Forehead slope', 'face'], ['foreP', 'Forehead prominence', 'face'], ['templeW', 'Temple width', 'face'],
    ['cheekF', 'Cheek fullness', 'face'], ['cheekHo', 'Cheek hollows', 'face'], ['jawH', 'Jaw angle height', 'face'],
    ['jawDef', 'Jaw line definition', 'face'], ['chinP', 'Chin projection', 'face'], ['earA', 'Ear angle', 'face'],
    ['eyeDp', 'Eye depth', 'eyes'], ['lidF', 'Eyelid fold', 'eyes'],
    ['nostW', 'Nostril width', 'nose'], ['tipW', 'Nose tip width', 'nose'], ['bridgeW', 'Bridge width', 'nose'], ['noseA', 'Nose angle', 'nose'], ['noseP', 'Nose projection', 'nose'],
    // lips: the whole mouth, then each lip on its own (LIP_GROUPS)
    ['mouthY', 'Mouth position', 'mouth'], ['lipH', 'Lip height', 'mouth'],
    ['lipUW', 'Upper lip width', 'mouth'], ['lipUH', 'Upper lip height', 'mouth'], ['lipLW', 'Lower lip width', 'mouth'], ['lipLH', 'Lower lip height', 'mouth'],
  ].map(([id, name, group, min = -100]) => ({ id, name, group, min }));
  // the creator's Mouth tab, in this order; every slider runs from -100 to 100
  const LIP_SLIDERS = ['lips', 'lipU', 'lipL', 'mouthW', 'lipBow', 'lipCorner'].map(id => SLIDERS.find(s => s.id === id));
  const LEGACY_SLIDERS = SLIDERS.slice(0, 21);
  // the creator's Brows tab, in this order
  const BROW_SLIDERS = ['browH', 'browD', 'browSp', 'browIn', 'browAp', 'browAh', 'browTl', 'browLn', 'browA', 'browT', 'browTi', 'browTo']
    .map(id => SLIDERS.find(s => s.id === id));
  const byId = id => SLIDERS.find(s => s.id === id);
  // the Mouth tab's groups, in order
  const LIP_GROUPS = [
    ['Whole mouth', ['lips', 'mouthW', 'lipH', 'mouthY', 'lipCorner']],
    ['Upper lip', ['lipUW', 'lipUH', 'lipU', 'lipBow']],
    ['Lower lip', ['lipLW', 'lipLH', 'lipL']],
  ].map(([name, ids]) => [name, ids.map(byId)]);
  // Lip presets set every lip shape slider at once (missing means 0) and leave the mouth's
  // position alone; the sliders stay free to fine-tune afterwards
  const LIP_IDS = ['lips', 'mouthW', 'lipH', 'lipCorner', 'lipUW', 'lipUH', 'lipU', 'lipBow', 'lipLW', 'lipLH', 'lipL'];
  const LIP_PRESETS = [
    { id: 'natural', name: 'Natural', f: {} },
    { id: 'full', name: 'Full', f: { lips: 45, lipU: 35, lipL: 30, lipUH: 25, lipLH: 20 } },
    { id: 'thin', name: 'Thin', f: { lips: -45, lipU: -35, lipL: -30, lipUH: -25, lipLH: -20, lipH: -20 } },
    { id: 'wide', name: 'Wide', f: { mouthW: 50, lipUW: 20, lipLW: 20, lipH: -10 } },
    { id: 'heart', name: 'Heart', f: { lipU: 40, lipBow: 50, mouthW: -25, lipUW: -10, lipLW: -30, lipL: 10, lipLH: -10 } },
    { id: 'bow', name: 'Bow', f: { lipBow: 70, lipUH: 30, lipU: 20, mouthW: -35, lipCorner: 10 } },
    { id: 'pouty', name: 'Pouty', f: { lips: 20, lipU: 25, lipL: 50, lipLH: 35, mouthW: -10, lipCorner: -20 } },
  ];
  const withLipPreset = (f, id) => ({ ...f, ...Object.fromEntries(LIP_IDS.map(k => [k, 0])), ...(LIP_PRESETS.find(p => p.id === id) || LIP_PRESETS[0]).f });
  const lipPresetOf = f => (LIP_PRESETS.find(p => LIP_IDS.every(k => ((f && f[k]) || 0) === (p.f[k] || 0))) || {}).id || null;
  // the Face tab's Proportions: the thirds, then the fifths (face width, eye width and spacing)
  const PROP_SLIDERS = ['foreH', 'midH', 'lowH', 'faceW', 'eyeW', 'eyeD'].map(byId);
  const THIRDS = ['foreH', 'midH', 'lowH'];

  const SKIN = ['#ebc6aa', '#e6bc9c', '#d9ab86', '#c69470', '#b3805c', '#9c6c4a', '#85583a', '#6c452d', '#553422', '#45291c'];
  const HAIR_COLORS = [
    { id: 0, name: 'Black', hex: '#1d1815' }, { id: 1, name: 'Dark brown', hex: '#3b281c' },
    { id: 2, name: 'Brown', hex: '#6b462b' }, { id: 3, name: 'Auburn', hex: '#8a3f23' },
    { id: 4, name: 'Blonde', hex: '#c9a466' }, { id: 5, name: 'Grey', hex: '#a3a29d' },
    { id: 6, name: 'Teal dye', hex: '#2cb3a6', price: 400 }, { id: 7, name: 'Red dye', hex: '#d63e57', price: 400 },
    // added later, so they go at the end and saved looks keep their colour
    { id: 8, name: 'Light brown', hex: '#8d6a48' }, { id: 9, name: 'Strawberry blonde', hex: '#b8784e' }, { id: 10, name: 'Platinum', hex: '#ddd3c2' },
  ];
  // hex is the iris colour at its edge, in the colour round the pupil. Ids never change, so saved
  // looks keep their colour; EYE_ORDER is the order the creator shows them in.
  const EYE_COLORS = [
    { id: 0, name: 'Dark brown', hex: '#4a2a16', in: '#2a170c' }, { id: 1, name: 'Brown', hex: '#7a4824', in: '#4e2a12' },
    { id: 2, name: 'Hazel', hex: '#5f7a3c', in: '#8a5a22' }, { id: 3, name: 'Green', hex: '#2f8a46', in: '#7d8a34' },
    { id: 4, name: 'Blue', hex: '#2462c8', in: '#5e9ce6' }, { id: 5, name: 'Grey', hex: '#66767f', in: '#96a2aa' },
    { id: 6, name: 'Cyber cyan', hex: '#00c4f0', in: '#5eeeff', price: 400, glow: true }, { id: 7, name: 'Cyber red', hex: '#e01030', in: '#ff7a88', price: 400, glow: true },
    // added in FACE pass 3
    { id: 8, name: 'Light brown', hex: '#a06a34', in: '#6e3e18' }, { id: 9, name: 'Amber', hex: '#b0701c', in: '#d89a2a' },
    { id: 10, name: 'Light blue', hex: '#4a94dc', in: '#86c0ee' }, { id: 11, name: 'Deep blue', hex: '#1a3c9a', in: '#4a7ad8' },
    { id: 12, name: 'Violet', hex: '#5a38b0', in: '#a08ae0' }, { id: 13, name: 'Grey green', hex: '#4f7f62', in: '#8ea270' },
    { id: 14, name: 'Blue grey', hex: '#4f6f8e', in: '#86a2bc' },
  ];
  const EYE_ORDER = [0, 1, 8, 9, 2, 3, 13, 5, 14, 10, 4, 11, 12, 6, 7];
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
  // Makeup layers. Each has a strength from 0 (off) to 100 in mk[layer + 'S'], a colour index
  // in mk[layer + 'C'] when it has colours (the first ones are free) and a shape in mk[layer]
  // when it has shapes. A nude colour follows the skin: the skin mixed towards `nude` by `mix`.
  // Colours added later go at the end of a list, so saved indices keep their colour.
  const MAKEUP = {
    liner: { name: 'Eyeliner', def: 50, styles: [['thin', 'Thin'], ['winged', 'Winged'], ['heavy', 'Heavy']],
      colors: [{ name: 'Black', hex: '#141012' }, { name: 'Brown', hex: '#3e2618' }, { name: 'Navy', hex: '#1c2a6e', price: 300 }, { name: 'Violet', hex: '#4b2470', price: 300 }] },
    shadow: { name: 'Eyeshadow', def: 45, styles: [['soft', 'Soft'], ['smoky', 'Smoky']],
      colors: [{ name: 'Taupe', hex: '#7a5e52' }, { name: 'Bronze', hex: '#94603a' }, { name: 'Plum', hex: '#5c2a52', price: 300 }, { name: 'Teal', hex: '#1f6d74', price: 300 }, { name: 'Gold', hex: '#c09232', price: 400 },
               { name: 'Charcoal', hex: '#3a3134' }] },
    blush: { name: 'Blush', def: 45,
      colors: [{ name: 'Rose', hex: '#d06a78' }, { name: 'Peach', hex: '#e08a68' }, { name: 'Berry', hex: '#a83a5c', price: 300 }] },
    sculpt: { name: 'Contour', def: 40 },
    brow: { name: 'Brow fill', def: 40 },
    lip: { name: 'Lipstick', def: 55,
      colors: [{ name: 'Nude', hex: '#b9776a', nude: '#7a2e30', mix: 0.32 }, { name: 'Rose', hex: '#c24a64' }, { name: 'Red', hex: '#b51e2e', price: 300 }, { name: 'Berry', hex: '#8e1f52', price: 300 },
               { name: 'Wine', hex: '#5a1420', price: 400 }, { name: 'Black', hex: '#1c1416', price: 400 }, { name: 'Mauve', hex: '#a2626a' }] },
    line: { name: 'Lip liner', def: 35,
      colors: [{ name: 'Nude', hex: '#a66a5e', nude: '#5e2224', mix: 0.42 }, { name: 'Rose', hex: '#a8485a' }, { name: 'Brick', hex: '#8a3a2e' }, { name: 'Plum', hex: '#5a2440', price: 300 }] },
    gloss: { name: 'Lip gloss', def: 40 },
  };
  const MK_LAYERS = ['liner', 'shadow', 'blush', 'sculpt', 'brow', 'lip', 'line', 'gloss'];
  const MK_DEFAULT = { liner: 'thin', linerC: 0, linerS: 0, shadow: 'soft', shadowC: 0, shadowS: 0, blushC: 0, blushS: 0, sculptS: 0, browS: 0,
    lipC: 0, lipS: 0, lineC: 0, lineS: 0, glossS: 0 };
  // Presets set every layer at once. A colour that is not free names a free one to use until
  // it is bought ([colour, fallback]).
  const MK_PRESETS = [
    { id: 'none', name: 'None', mk: {} },
    { id: 'natural', name: 'Natural', mk: { liner: 'winged', linerC: 0, linerS: 58, shadow: 'soft', shadowC: 0, shadowS: 30, blushC: 1, blushS: 30, sculptS: 30, browS: 35,
      lipC: 0, lipS: 55, lineC: 0, lineS: 30, glossS: 35 } },
    { id: 'everyday', name: 'Everyday', mk: { liner: 'winged', linerC: 0, linerS: 78, shadow: 'smoky', shadowC: 5, shadowS: 62, blushC: 0, blushS: 48, sculptS: 35, browS: 45,
      lipC: [3, 1], lipS: 65, lineC: [3, 1], lineS: 35, glossS: 55 } },
    { id: 'evening', name: 'Evening', mk: { liner: 'winged', linerC: 0, linerS: 72, shadow: 'smoky', shadowC: [2, 5], shadowS: 60, blushC: 0, blushS: 52, sculptS: 45, browS: 50,
      lipC: [2, 6], lipS: 75, lineC: 2, lineS: 45, glossS: 45 } },
    { id: 'bold', name: 'Bold', mk: { liner: 'heavy', linerC: [2, 0], linerS: 85, shadow: 'smoky', shadowC: 5, shadowS: 88, blushC: [2, 0], blushS: 55, sculptS: 50, browS: 55,
      lipC: [4, 6], lipS: 88, lineC: [3, 2], lineS: 60, glossS: 30 } },
  ];

  // slot -> items. price missing means free. zones stop two accessories sitting in the same place.
  const PARTS = {
    h: [
      // short
      { id: 'buzz', name: 'Buzz' }, { id: 'undercut', name: 'Undercut' },
      { id: 'slick', name: 'Slicked back', price: 600 }, { id: 'sidepart', name: 'Side swept', price: 700 },
      // medium
      { id: 'bob', name: 'Bob', price: 900 }, { id: 'wavybob', name: 'Wavy bob', price: 1000 }, { id: 'curtain', name: 'Curtain bangs', price: 1000 },
      // long
      { id: 'longstraight', name: 'Long straight', price: 1000 }, { id: 'longlayered', name: 'Long layered', price: 1100 },
      { id: 'wavy', name: 'Long wavy', price: 1200 }, { id: 'curly', name: 'Curly', price: 1200 }, { id: 'afro', name: 'Afro', price: 1300 },
      // tied up
      { id: 'ponytail', name: 'Ponytail', price: 900 }, { id: 'bun', name: 'Bun', price: 900 },
      { id: 'updo', name: 'Updo', price: 1100 }, { id: 'braids', name: 'Braids', price: 1400 },
    ],
    fh: [
      { id: 'none', name: 'None' }, { id: 'stubble', name: 'Stubble', price: 300 },
      { id: 'moustache', name: 'Moustache', price: 500 }, { id: 'chin', name: 'Goatee', price: 500 },
      { id: 'goatee', name: 'Goatee and moustache', price: 600 },
      { id: 'shortbeard', name: 'Short beard', price: 700 }, { id: 'beard', name: 'Full beard', price: 900 },
    ],
    bs: [
      { id: 'straight', name: 'Straight' }, { id: 'soft', name: 'Soft arch' }, { id: 'arched', name: 'High arch' },
      { id: 'rounded', name: 'Rounded' }, { id: 'angled', name: 'Angled' }, { id: 'full', name: 'Feathered' },
      { id: 'thin', name: 'Thin' }, { id: 'sparse', name: 'Sparse' },
    ],
    g: [
      { id: 'glasses', name: 'Rectangle glasses', price: 800, zones: ['eyes'] },
      { id: 'roundglasses', name: 'Round glasses', price: 800, zones: ['eyes'] },
      { id: 'visor', name: 'Visor', price: 2000, zones: ['eyes'] },
      { id: 'goggles', name: 'Goggles', price: 1500, zones: ['eyes'] },
      { id: 'implant', name: 'Cyber eye implant', price: 3000, zones: ['eyes'] },
      { id: 'respirator', name: 'Respirator mask', price: 2500, zones: ['mouth'] },
      { id: 'headset', name: 'Headset with mic', price: 1800, zones: ['top', 'ears'] },
      { id: 'cap', name: 'Cap', price: 900, zones: ['top'] },
      { id: 'bandana', name: 'Bandana', price: 700, zones: ['top'] },
      { id: 'earrings', name: 'Hoop earrings', price: 500, zones: ['lobes'] },
      { id: 'studs', name: 'Stud earrings', price: 400, zones: ['lobes'] },
      { id: 'chain', name: 'Chain necklace', price: 900, zones: ['chest'] },
      { id: 'pendant', name: 'Pendant necklace', price: 1200, zones: ['chest'] },
      { id: 'choker', name: 'Spiked choker', price: 1100, zones: ['neck'] },
    ],
    o: [
      { id: 'crew', name: 'Tee' }, { id: 'tank', name: 'Tank top', price: 1200 },
      { id: 'shirt', name: 'Open shirt over a tee', price: 1800 }, { id: 'hoodie', name: 'Hoodie', price: 1600 },
      { id: 'jacket', name: 'Leather jacket', price: 2600 }, { id: 'collar', name: 'High collar', price: 1200 },
      { id: 'plates', name: 'Shoulder plates', price: 3000 },
      // added later
      { id: 'polo', name: 'Polo shirt', price: 1400 }, { id: 'sweater', name: 'Sweater', price: 1300 },
    ],
  };
  // outfits that come plain or striped (look.op); stripes are free, like the colours
  const PATTERN_OUTFITS = ['crew', 'polo'];
  // Styles taken out until they look right. Their files stay in assets/avatar/items, and
  // saved or random looks that use one get the nearest style still offered.
  const HAIR_RETIRED = { crop: 'slick', messy: 'sidepart', mohawk: 'undercut', hood: 'buzz', long: 'ponytail', wavyends: 'wavy' };
  // brow styles replaced in BROW pass 1, and the new style nearest each
  const BROW_RETIRED = { thick: 'full', bushy: 'full', slit: 'straight' };
  const SLOT_NAME = { h: 'Hair', fh: 'Facial hair', bs: 'Brows', g: 'Accessory', o: 'Outfit', hc: 'Hair colour', gl: 'Glow', ec: 'Eye colour', mkc: 'Makeup colour' };
  const HOOD_BLOCKS = ['top', 'ears'];
  const GOLD_LEVEL = 20;

  // Facial hair is off for now: no option row, no shop items, no facial hair on random looks,
  // and saved looks that have it render without it (avatar-face.js). Set true to bring it back.
  const FACIAL_HAIR = false;

  const DEFAULT = { v: 1, f: {}, sk: 3, ec: 0, bs: 'straight', bc: -1, h: 'buzz', hc: 1, fh: 'none', g: [], o: 'crew', oc: 0, op: 'plain', gl: 'green', mk: MK_DEFAULT };

  // ---------- shop items ----------
  const itemId = (slot, id) => `av-${slot}-${id}`;
  function items() {
    const out = [];
    for (const [slot, list] of Object.entries(PARTS)) for (const p of list) if (p.price && (FACIAL_HAIR || slot !== 'fh')) out.push({ id: itemId(slot, p.id), name: p.name, price: p.price, slot, part: p.id, category: 'avatar' });
    for (const c of HAIR_COLORS) if (c.price) out.push({ id: itemId('hc', c.id), name: `${c.name} hair`, price: c.price, slot: 'hc', part: c.id, category: 'avatar' });
    for (const c of EYE_COLORS) if (c.price) out.push({ id: itemId('ec', c.id), name: `${c.name} eyes`, price: c.price, slot: 'ec', part: c.id, category: 'avatar' });
    for (const c of GLOWS) if (c.price) out.push({ id: itemId('gl', c.id), name: `${c.name} glow`, price: c.price, slot: 'gl', part: c.id, category: 'avatar' });
    for (const [layer, m] of Object.entries(MAKEUP)) (m.colors || []).forEach((c, i) => {
      if (c.price) out.push({ id: itemId('mkc', `${layer}-${i}`), name: `${c.name} ${m.name.toLowerCase()}`, price: c.price, slot: 'mkc', part: `${layer}-${i}`, category: 'avatar' });
    });
    return out.sort((a, b) => a.price - b.price);
  }
  function part(slot, id) {
    if (slot === 'hc') return HAIR_COLORS.find(c => c.id === +id);
    if (slot === 'ec') return EYE_COLORS.find(c => c.id === +id);
    if (slot === 'gl') return GLOWS.find(c => c.id === id);
    if (slot === 'mkc') { const [layer, i] = String(id).split('-'); const m = MAKEUP[layer]; return m && m.colors && m.colors[+i] ? { ...m.colors[+i], name: `${m.colors[+i].name} ${m.name.toLowerCase()}` } : undefined; }
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
  // A slider's value, defaults included. V-shape is the one slider with a default other than 0:
  // about 50 on feminine faces (Gid's pick), 0 on masculine ones, eased in between, until
  // someone sets it (normalize keeps a V-shape set to 0).
  const VLINE_DEFAULT = 50;
  function fv(f, id) {
    if (f && f[id] !== undefined) return f[id];
    if (id !== 'vline') return 0;
    const t = clamp((((f && f.sex) || 0) - 20) / 50, 0, 1);
    return Math.round(VLINE_DEFAULT * t * t * (3 - 2 * t));
  }
  function normalize(look) {
    const src = look && typeof look === 'object' ? look : {};
    const L = { ...DEFAULT, ...src };
    const f = {};
    for (const s of SLIDERS) { const v = clamp(Math.round(+((src.f && src.f[s.id]) || 0)), s.min, 100); if (v) f[s.id] = v; }
    // a V-shape someone set to 0 stays 0; a missing one follows fv()'s default
    if (src.f && src.f.vline !== undefined && src.f.vline !== null && !f.vline) f.vline = 0;
    L.f = f;
    L.sk = clamp(Math.round(+L.sk) || 0, 0, SKIN.length - 1);
    L.hc = clamp(Math.round(+L.hc) || 0, 0, HAIR_COLORS.length - 1);
    L.ec = clamp(Math.round(+L.ec) || 0, 0, EYE_COLORS.length - 1);
    L.oc = clamp(Math.round(+L.oc) || 0, 0, OUTFIT_COLORS.length - 1);
    L.bc = Math.round(+L.bc); if (!(L.bc >= 0 && L.bc < HAIR_COLORS.length)) L.bc = -1;
    if (BROW_RETIRED[src.bs]) L.bs = BROW_RETIRED[src.bs];
    else if (!part('bs', src.bs)) L.bs = defaultBrow(f);
    if (HAIR_RETIRED[L.h]) L.h = HAIR_RETIRED[L.h];
    if (!part('h', L.h)) L.h = DEFAULT.h;
    if (!part('fh', L.fh)) L.fh = 'none';
    if (!part('o', L.o)) L.o = DEFAULT.o;
    L.op = L.op === 'stripe' ? 'stripe' : 'plain';
    if (!part('gl', L.gl)) L.gl = DEFAULT.gl;
    L.mk = normalizeMk(src.mk);
    L.g = [...new Set(Array.isArray(L.g) ? L.g : [])].filter(id => part('g', id));
    L.g = withGear(L, null).g;
    L.v = 1;
    return L;
  }
  // Makeup saved before strengths had a style per layer ('none' was off) and painted every
  // layer at full strength: those load at about 60%, gloss lipstick keeps a gloss.
  function normalizeMk(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const old = !MK_LAYERS.some(k => (k + 'S') in src);
    const mk = { ...MK_DEFAULT };
    for (const layer of MK_LAYERS) {
      const m = MAKEUP[layer];
      let s = +src[layer + 'S'];
      if (old) {
        const st = src[layer];
        const on = layer === 'liner' || layer === 'shadow' || layer === 'blush' || layer === 'lip' ? st !== undefined && st !== 'none' : false;
        s = on ? (st === 'heavy' || st === 'smoky' || layer === 'lip' ? 60 : 50) : 0;
        if (layer === 'gloss') s = src.lip === 'gloss' ? 45 : 0;
      }
      mk[layer + 'S'] = clamp(Math.round(s) || 0, 0, 100);
      if (m.colors) mk[layer + 'C'] = clamp(Math.round(+src[layer + 'C']) || 0, 0, m.colors.length - 1);
      if (m.styles) mk[layer] = m.styles.some(x => x[0] === src[layer]) ? src[layer] : m.styles[0][0];
    }
    return Object.fromEntries(Object.keys(MK_DEFAULT).map(k => [k, mk[k]]));
  }
  // A preset's makeup. ok(layer, i) says whether colour i can be used; when it can't, the
  // preset's free fallback colour goes on instead.
  function presetMk(id, ok = () => true) {
    const p = MK_PRESETS.find(x => x.id === id) || MK_PRESETS[0];
    const mk = { ...MK_DEFAULT };
    for (const [k, v] of Object.entries(p.mk)) {
      if (Array.isArray(v)) { const layer = k.slice(0, -1); mk[k] = ok(layer, v[0]) ? v[0] : v[1]; }
      else mk[k] = v;
    }
    return mk;
  }
  // the colour a makeup layer paints; a nude colour follows the skin tone
  function mkHex(layer, i, sk) {
    const c = MAKEUP[layer].colors[i];
    if (!c.nude) return c.hex;
    const A = parseInt(SKIN[sk].slice(1), 16), B = parseInt(c.nude.slice(1), 16);
    return '#' + [16, 8, 0].map(sh => Math.round((A >> sh & 255) + ((B >> sh & 255) - (A >> sh & 255)) * c.mix).toString(16).padStart(2, '0')).join('');
  }
  // Makeup with every colour the player can't use swapped for a free one: the free colour the
  // nearest preset names for it (by layer strengths and shapes), else the first colour.
  function freeMk(mk, usable = (layer, i) => !lockOf('mkc', `${layer}-${i}`)) {
    const out = { ...mk };
    const far = p => MK_LAYERS.reduce((d, k) => d + Math.abs((p.mk[k + 'S'] || 0) - (mk[k + 'S'] || 0)), 0)
      + (p.mk.liner && p.mk.liner !== mk.liner ? 20 : 0) + (p.mk.shadow && p.mk.shadow !== mk.shadow ? 20 : 0);
    const near = MK_PRESETS.slice().sort((a, b) => far(a) - far(b));
    for (const [layer, m] of Object.entries(MAKEUP)) {
      const k = layer + 'C';
      if (!m.colors || usable(layer, mk[k])) continue;
      const p = near.find(p => Array.isArray(p.mk[k]) && p.mk[k][0] === mk[k]);
      out[k] = p ? p.mk[k][1] : 0;
    }
    return out;
  }
  // which preset a look's makeup is exactly, if any
  function presetOf(mk) {
    const k = JSON.stringify(normalizeMk(mk));
    const p = MK_PRESETS.find(x => [true, false].some(own => JSON.stringify(presetMk(x.id, () => own)) === k));
    return p ? p.id : null;
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
    L.mk = freeMk(L.mk);
    L.g = L.g.filter(id => !lockOf('g', id));
    return L;
  }
  // every paid thing a look uses, for the creator's save check
  function unownedParts(L) {
    const out = [];
    const chk = (slot, id) => { const l = lockOf(slot, id); if (l) out.push({ slot, id, name: part(slot, id).name, l }); };
    chk('h', L.h); if (FACIAL_HAIR) chk('fh', L.fh); chk('bs', L.bs); chk('o', L.o); chk('hc', L.hc); chk('ec', L.ec); chk('gl', L.gl);
    if (L.bc >= 0) chk('hc', L.bc);
    for (const [layer, m] of Object.entries(MAKEUP)) if (m.colors && L.mk[layer + 'S'] > 0) chk('mkc', `${layer}-${L.mk[layer + 'C']}`);
    L.g.forEach(id => chk('g', id));
    return out;
  }

  // ---------- hashing and the seeded generator ----------
  function stable(look) {
    const L = normalize(look);
    const f = Object.keys(L.f).sort().map(k => `${k}:${L.f[k]}`).join(',');
    const mk = Object.keys(MK_DEFAULT).map(k => L.mk[k]).join(',');
    return `${L.sk}|${L.h}|${L.hc}|${L.fh}|${L.g.join(',')}|${L.o}|${L.gl}|${f}|${L.ec}|${L.bs}|${L.bc}|${L.oc}|${mk}${L.op === 'stripe' ? '|stripe' : ''}`;
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
    L.bs = woman ? weighted(r2, [['soft', 3], ['arched', 2], ['rounded', 1.5], ['thin', 1.5], ['angled', 1.5], ['full', 1], ['straight', 1]])
      : weighted(r2, [['straight', 4], ['full', 3], ['soft', 1.2], ['angled', 1.2], ['sparse', 0.8], ['rounded', 0.4]]);
    f.browT = Math.round(clamp((r2() - 0.5) * 80, -50, 50)); f.browA = Math.round(clamp((r2() - 0.5) * 70, -40, 40));
    // brow shape (added later): its own generator, small changes round each style
    const r6 = rng(String(seed) + '|brows');
    for (const id of ['browSp', 'browIn', 'browTl', 'browAp', 'browAh', 'browLn', 'browTi', 'browTo']) f[id] = Math.round(clamp((r6() + r6() - 1) * 32, -24, 24));
    // lip shape (added later): its own generator, so the faces above stay as they were
    const r3 = rng(String(seed) + '|lips');
    for (const id of ['lipU', 'lipL', 'lipBow', 'lipCorner']) f[id] = Math.round(clamp((r3() + r3() - 1) * 55, -45, 45));
    L.oc = weighted(r2, [[0, 3], [1, 3], [2, 1], [3, 1.5], [4, 1.5], [5, 1], [6, 1], [7, 0.8], [8, 0.8]]);
    const mkOn = woman && !free && r2() < 0.7;
    L.mk = { ...MK_DEFAULT };
    if (mkOn) {
      // mostly a light Natural look with small differences. Eight draws from r2, as before,
      // so everything drawn after the makeup stays the same for every simulated player.
      const kind = weighted(r2, [['natural', 5], ['everyday', 2.5], ['evening', 0.6]]);
      const linerC = r2() < 0.8 ? 0 : 1;
      const shadowC = Math.floor(r2() * 2), shadowOn = r2() < 0.75;
      const blushC = Math.floor(r2() * 2), blushOn = r2() < 0.8;
      const lipC = weighted(r2, [[0, 3], [1, 2], [6, 1.2], [2, 0.6], [3, 0.4]]), jitter = r2();
      L.mk = presetMk(kind, () => !free);
      const j = v => Math.round(clamp(v * (0.8 + 0.4 * jitter), 0, 100));
      Object.assign(L.mk, { linerC, shadowC, blushC, lipC, linerS: j(L.mk.linerS), lipS: j(L.mk.lipS) });
      if (!shadowOn) L.mk.shadowS = 0;
      if (!blushOn) L.mk.blushS = 0;
    }
    // eye shape, the V-shaped face and the eye colours added in FACE pass 3: their own generator
    const r5 = rng(String(seed) + '|eyes3');
    f.eyeW = Math.round(clamp((r5() + r5() - 1) * 50, -35, 35)); f.eyeH = Math.round(clamp((r5() + r5() - 1) * 50, -35, 15));
    f.eyeOut = Math.round(clamp((r5() + r5() - 1) * 40, -30, 30));
    // women's V-shape lands between 35 and 60 (the same draws as before, so the eye colour drawn
    // next stays the same); men keep the default, 0
    const vl = r5();
    if (woman) f.vline = Math.round(35 + 25 * (vl < 0.75 ? r5() : (vl - 0.75) / 0.25));
    if (r5() < 0.4) L.ec = weighted(r5, [[8, 2], [9, 0.8], [10, 1.5], [11, 1.2], [12, 0.4], [13, 1], [14, 1]]);
    if (free) {
      L.h = r() < 0.5 ? 'buzz' : 'undercut'; L.fh = 'none'; L.gl = r() < 0.5 ? 'green' : 'cyan';
      return normalize(L);
    }
    L.h = woman ? weighted(r, [['bob', 3], ['wavybob', 2], ['curtain', 2], ['ponytail', 2.5], ['braids', 2], ['updo', 1.2], ['slick', 0.5], ['undercut', 0.4], ['buzz', 0.2]])
      : weighted(r, [['buzz', 2.5], ['undercut', 2.5], ['slick', 2], ['sidepart', 2], ['braids', 0.5], ['curtain', 0.5], ['bob', 0.2]]);
    // some people get one of the longer or curly styles instead
    if (r2() < 0.45) L.h = woman ? weighted(r2, [['longstraight', 3], ['longlayered', 3], ['wavy', 2], ['bun', 2], ['curly', 2], ['afro', 1.2]])
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
    // polos, sweaters, stripes, studs and round glasses (added later): their own generator
    const r4 = rng(String(seed) + '|cloth');
    if (r4() < 0.25) look = { ...look, o: weighted(r4, [['polo', 1], ['sweater', 1]]) };
    if (!FACIAL_HAIR) look = { ...look, fh: 'none' };
    if (PATTERN_OUTFITS.includes(look.o) && r4() < 0.3) look = { ...look, op: 'stripe' };
    if (look.g.includes('earrings') && r4() < 0.4) look = withGear(look, 'studs');
    if (look.g.includes('glasses') && r4() < 0.5) look = withGear(look, 'roundglasses');
    return normalize(look);
  }

  return {
    SLIDERS, LIP_SLIDERS, BROW_SLIDERS, LIP_GROUPS, LIP_PRESETS, PROP_SLIDERS, THIRDS, withLipPreset, lipPresetOf, SKIN, HAIR_COLORS, EYE_COLORS, EYE_ORDER, FACIAL_HAIR, OUTFIT_COLORS, GLOWS, MAKEUP, MK_LAYERS, MK_DEFAULT, MK_PRESETS, PARTS, PATTERN_OUTFITS, SLOT_NAME, DEFAULT, GOLD_LEVEL, HOOD_BLOCKS,
    items, itemId, part, lockOf, normalize, fv, normalizeMk, presetMk, presetOf, freeMk, mkHex, usable, unownedParts, withGear, stable, hash, random, rng,
  };
})();
