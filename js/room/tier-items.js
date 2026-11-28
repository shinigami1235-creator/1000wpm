// My Room in tiers (Gid, 28 Nov 2026): five rooms as still pictures, unlocked by operator level
// (WPM.levelInfo, earned by playing; coins never buy a tier), each with slots the player dresses up.
// This file is the data: the five rooms with every slot measured in the picture's own pixels
// (assets/room/tiers/t<n>.jpg at about 1376 x 768; the 2752 px WebP keeps the same coordinates),
// and the catalogue of things that go in the slots. js/room/tier-view.js draws a room from it and
// js/room/tier-page.js is the #/room page.
//
//   RoomTiers.TIERS[n]        { name, level, w, h, glass, posters, front, screens, lights, banner, shelf, desk, case, pins, pet, holo }
//   RoomTiers.KINDS           the shop tabs: what a slot takes and what it's called
//   RoomTiers.ITEMS / get(id) the catalogue; RoomItems (below) is the same list for #/shop and gifts
//   RoomTiers.TROPHIES        the achievement case: earned only, never sold
//   RoomTiers.slots(n)        every slot of tier n: { id, kind, at }
//   RoomTiers.tierFor(level)  the highest tier that level opens
//
// Slots by tier, from the decided plan: window view, monitor screens, posters, LED colour per
// lighting zone, shelf and desk items, a wall screen from tier 3, a hologram at tier 5, a pet, the
// banner print, and the achievement case. Empty slots show the picture as it is (an empty lit shelf,
// a blank frame), so a new player's room never looks broken.
(() => {
  // ------------------------------------------------------------------ the five rooms
  // q: four corners clockwise from top left. spot: [x, y] is where an item's bottom centre stands;
  // ppm: picture pixels per metre there, so every item keeps its real size against the room.
  // lights: zones of the teal LED that a hue blend recolours; e: [cx, cy, w, h] ellipses.
  // glass: the window mask's box (tools/room-glass.py makes t<n>-glass.png).
  const row = (xs, y, ppm) => xs.map(x => [x, y, ppm]);
  const TIERS = {
    1: { name: 'Bunk room', level: 1, w: 1377, h: 768, size: [3, 3], focus: 0.62, dim: 0.72,
      glass: [304, 119, 195.5, 234.5],
      posters: [[[663, 185], [760, 175], [760, 349], [663, 350]]],
      screens: [{ q: [[941, 326], [1106, 324], [1106, 432], [941, 432]], glow: [1015, 400, 300, 220] }],
      lights: [{ name: 'Shelf light', zones: [[898, 262, 300, 170]], cores: [[846, 242, 104, 8]] }],
      banner: { q: [[122, 115], [283, 135], [285, 385], [128, 388]], u: [0.22, 0.3, 0.78, 0.62] },
      shelf: [], desk: [],
      pins: [[1042, 200], [1100, 196], [1158, 206]],
      pet: { sit: [612, 503, 158], hover: [585, 300, 170] },
    },
    2: { name: 'Field room', level: 10, w: 1376, h: 768, size: [3.5, 4], focus: 0.5, dim: 0.8,
      glass: [203, 101, 108.5, 342.5],
      posters: [[[50, 131], [151, 162], [151, 402], [50, 402]], [[1118, 217], [1164, 194], [1165, 406], [1119, 399]]],
      screens: [{ q: [[690, 351], [821, 351], [821, 428], [690, 428]], glow: [755, 410, 260, 200] }],
      lights: [{ name: 'Loft strips', zones: [[770, 300, 640, 170]] }, { name: 'Stairs and crates', zones: [[390, 450, 240, 330], [1215, 585, 260, 70]] }],
      banner: { q: [[1195, 140], [1335, 65], [1340, 475], [1195, 455]], u: [0.2, 0.28, 0.8, 0.55] },
      shelf: row([892, 930, 968], 352, 112),
      desk: [[925, 461, 124], [1024, 459, 124]],
      case: row([1150, 1199, 1249, 1297], 572, 230),
      pet: { sit: [606, 240, 112], hover: [470, 190, 120] },
    },
    3: { name: 'Ops den', level: 25, w: 1376, h: 768, size: [5, 4.5], focus: 0.45, dim: 0.85,
      glass: [506, 132, 222.5, 309.5],
      posters: [[[54, 121], [234, 148], [236, 402], [54, 404]], [[1192, 240], [1299, 231], [1300, 388], [1192, 389]]],
      // the plant hanging in front of the left frame, cut out of the picture (tools/room-front.py) and
      // laid back over the poster so the poster sits behind its leaves
      front: [['t3-plant', 48, 114, 112, 146]],
      screens: [
        { q: [[273, 367], [384, 368], [384, 454], [274, 469]] },
        { q: [[390, 368], [519, 369], [519, 446], [390, 455]], glow: [460, 430, 520, 220] },
        { q: [[526, 369], [660, 369], [660, 445], [526, 446]] },
        { q: [[982, 257], [1168, 242], [1168, 386], [982, 386]], glow: [1075, 330, 360, 260], wall: true }],
      lights: [{ name: 'Ceiling', zones: [[930, 55, 1000, 150]] }, { name: 'Bed glow', zones: [[1040, 632, 640, 130]] }],
      banner: { q: [[712, 172], [792, 178], [800, 393], [712, 392]], u: [0.14, 0.22, 0.86, 0.5] },
      shelf: row([294, 343, 392, 441, 489], 301, 118),
      desk: [[252, 497, 130], [690, 474, 120]],
      case: [...row([829, 861, 892], 296, 150), ...row([829, 861, 892], 344, 150), ...row([829, 861, 892], 391, 150)],
      pet: { sit: [1060, 500, 140], hover: [860, 160, 120] },
    },
    4: { name: 'The loft', level: 45, w: 1380, h: 752, size: [7, 6], focus: 0.5, dim: 0.78,
      glass: [171, 0, 428.5, 527.5],
      posters: [[[389, 109], [469, 125], [469, 258], [389, 249]], [[393, 298], [466, 304], [466, 419], [393, 421]]],
      screens: [{ q: [[832, 402], [901, 402], [901, 450], [832, 450]], glow: [870, 430, 220, 140] }, { q: [[906, 402], [958, 402], [958, 450], [906, 450]] }],
      lights: [{ name: 'Loft edge', zones: [[960, 300, 820, 120], [745, 600, 900, 190]] }, { name: 'Stairs', zones: [[1245, 480, 380, 640]] }],
      banner: { q: [[790, 256], [928, 256], [925, 366], [792, 368]], u: [0.3, 0.12, 0.7, 0.88] },
      shelf: [[77, 104, 140], [77, 189, 140], [77, 351, 140], [77, 438, 140], [77, 525, 140]],
      desk: [[815, 467, 110], [966, 471, 110]],
      case: [[694, 412, 165], [694, 452, 165], [694, 493, 165], [1052, 415, 175], [1052, 467, 175], [1052, 519, 175]],
      pet: { sit: [226, 668, 175], hover: [640, 210, 120] },
    },
    5: { name: 'Command deck', level: 75, w: 1376, h: 768, size: [10, 8], focus: 0.55, dim: 0.85,
      glass: [94, 29, 733.5, 472.5],
      posters: [[[1061, 160], [1129, 149], [1130, 261], [1061, 266]], [[1052, 352], [1110, 349], [1110, 458], [1053, 461]]],
      screens: [
        { q: [[246, 399], [298, 399], [298, 450], [246, 450]] },
        { q: [[301, 399], [366, 399], [366, 450], [301, 450]], glow: [400, 430, 420, 160] },
        { q: [[369, 399], [453, 399], [453, 450], [369, 450]] },
        { q: [[542, 399], [624, 399], [624, 450], [542, 450]] }],
      lights: [{ name: 'Ceiling', zones: [[650, 55, 900, 130], [1200, 45, 420, 90]] }, { name: 'Floor lines', zones: [[600, 585, 1000, 150], [1150, 705, 520, 120]] }],
      banner: { q: [[1156, 70], [1338, 38], [1340, 300], [1156, 302]], u: [0.26, 0.2, 0.74, 0.62] },
      shelf: [...row([943, 996], 345, 95), ...row([943, 996], 393, 95), ...row([943, 996], 445, 95)],
      desk: [[205, 482, 120], [598, 459, 105]],
      case: [...row([1160, 1215, 1271, 1328], 383, 185), ...row([1160, 1215, 1271, 1328], 443, 185), ...row([1160, 1215, 1271, 1328], 503, 185)],
      holo: { x: 740, y: 608, w: 220, h: 300 },
      pet: { sit: [212, 700, 190], hover: [880, 300, 130] },
    },
  };
  const LEVELS = [1, 10, 25, 45, 75];
  const tierFor = lv => LEVELS.reduce((t, need, i) => (lv >= need ? i + 1 : t), 1);

  // ------------------------------------------------------------------ what each slot takes
  // type: the catalogue type a slot takes. The tabs follow this order.
  const KINDS = [
    { id: 'view', name: 'Window', type: 'view' },
    { id: 'screen', name: 'Monitors', type: 'screen' },
    { id: 'wall', name: 'Wall screen', type: 'screen', from: 3 },
    { id: 'poster', name: 'Posters', type: 'poster' },
    { id: 'light', name: 'Lighting', type: 'light' },
    { id: 'shelf', name: 'Shelf', type: 'prop', from: 2 },
    { id: 'desk', name: 'Desk', type: 'prop', from: 2 },
    { id: 'holo', name: 'Hologram', type: 'holo', from: 5 },
    { id: 'pet', name: 'Pet', type: 'pet' },
    { id: 'banner', name: 'Banner', type: 'banner' },
  ];
  // every slot of a tier, with an id that stays the same between visits
  function slots(n) {
    const T = TIERS[n], out = [];
    if (T.glass) out.push({ id: 'view', kind: 'view' });
    T.screens.forEach((s, i) => out.push({ id: (s.wall ? 'w' : 'm') + (i + 1), kind: s.wall ? 'wall' : 'screen', at: s }));
    T.posters.forEach((q, i) => out.push({ id: 'p' + (i + 1), kind: 'poster', at: q }));
    T.lights.forEach((l, i) => out.push({ id: 'l' + (i + 1), kind: 'light', at: l, name: l.name }));
    T.shelf.forEach((s, i) => out.push({ id: 's' + (i + 1), kind: 'shelf', at: s }));
    T.desk.forEach((s, i) => out.push({ id: 'd' + (i + 1), kind: 'desk', at: s }));
    if (T.holo) out.push({ id: 'holo', kind: 'holo', at: T.holo });
    if (T.pet) out.push({ id: 'pet', kind: 'pet', at: T.pet });
    if (T.banner) out.push({ id: 'banner', kind: 'banner', at: T.banner });
    return out;
  }

  // ------------------------------------------------------------------ the catalogue
  // Prices (rewards-config.js for scale): a 60-second test pays about 37 coins and a level-up pays
  // 50 x the new level, so a new player buys a light or a poster in the first evening, a mini arcade
  // takes about a week, and the holograms are for the Command deck at level 75.
  // A price of 0 is free and owned by everyone. gift: comes only as a gift. legacy: ids from the
  // old 3D room shop that this item replaces (owners get it, see js/room/tier-page.js).
  // Props: hm is the height in metres they stand at; desk: desk only (too big for a shelf).
  const I = [];
  const add = (type, list) => list.forEach(([id, name, price, more]) => I.push({ id, name, type, price, ...(more || {}) }));
  add('view', [
    ['view-city', 'City at night', 0, { scene: null, desc: 'The view the room came with.' }],
    ['view-rain', 'Rainy afternoon', 500, { scene: 'rain' }],
    ['view-forest', 'Forest with fireflies', 800, { scene: 'forest' }],
    ['view-snow', 'Snowy mountains', 900, { scene: 'snow' }],
    ['view-sakura', 'Cherry blossoms', 1000, { scene: 'sakura' }],
    ['view-sunset', 'Beach sunset', 1200, { scene: 'sunset' }],
    ['view-neon', 'Neon city in the rain', 1500, { scene: 'neon' }],
    ['view-ocean', 'Under the sea', 1800, { scene: 'ocean' }],
    ['view-aurora', 'Northern lights', 2200, { scene: 'aurora' }],
    ['view-space', 'Earth from orbit', 3000, { scene: 'space' }],
  ]);
  add('screen', [
    ['scr-stats', 'Your stats', 0, { desc: 'Best wpm, accuracy and level.' }],
    ['scr-logo', 'CTRL screensaver', 0, { desc: 'The CTRL emblem, drifting.' }],
    ['scr-card', 'Operator card', 0, { desc: 'Your name, level and records.' }],
    ['scr-code', 'CTRL feed', 300, { desc: 'Raid and firewall news as it comes in.', legacy: ['monitor-dual'] }],
    ['scr-boss', 'World Boss HP', 400, { desc: 'Syntax Error\'s health bar, live.', glow: '#ff4d5e' }],
    ['scr-graph', 'WPM graph', 450, { desc: 'Your last 30 runs.', legacy: ['monitor-27'] }],
    ['scr-board', 'Leaderboard', 500, { desc: 'The week\'s top typists with you among them.', legacy: ['monitor-ultra'] }],
    ['scr-streak', 'Streak calendar', 500, { desc: 'The last five weeks of sign-ins.' }],
    ['scr-rush', 'Boss Rush record', 650, { desc: 'Your best run and the bosses in it.', glow: '#ffb020' }],
    ['scr-keys', 'Key heatmap', 800, { desc: 'Which keys you miss, in red.' }],
    ['scr-rain', 'Code rain', 900, { desc: 'Falling green code.' }],
    ['scr-radar', 'Keyspace radar', 1200, { desc: 'A sweep over the map with players lighting up.', glow: '#3ee6ff' }],
  ]);
  add('poster', [
    ['poster-ctrl', 'CTRL emblem', 300],
    ['poster-logo', '10000WPM', 300],
    ['poster-keys', 'Keycaps', 300],
    ['poster-mountain', 'Mountain', 350],
    ['poster-synth', 'Synthwave sun', 400],
    ['poster-syntax', 'Syntax Error', 500],
    ['poster-operator', 'Operator', 500],
    ['poster-red', 'Red phase', 450],
    ['poster-204', '204 wpm', 600, { desc: 'Art\'s best race, in big type.' }],
    ['poster-siege', 'Siege Titan', 700],
    ['poster-king', 'Kernel King', 700],
    ['poster-colossus', 'Data Colossus', 800],
    ['poster-rush', 'Boss Rush lineup', 1200, { desc: 'Six titans from Boss Rush.' }],
    ['poster-blueprint', 'Keyboard blueprint', 900],
  ]);
  add('light', [
    ['led-teal', 'Teal', 0, { c: null, sw: '#2fe0c0' }],
    ['led-violet', 'Violet', 150, { c: '#b45cff', legacy: ['led-strip'] }],
    ['led-ice', 'Ice', 150, { c: '#7fd8ff', legacy: ['hex-panels'] }],
    ['led-red', 'Red alert', 200, { c: '#ff3b4f' }],
    ['led-pink', 'Hot pink', 250, { c: '#ff3fb8', legacy: ['neon-sign'] }],
    ['led-lime', 'Lime', 250, { c: '#8cff58' }],
    ['led-gold', 'Gold', 300, { c: '#ffb020' }],
    ['led-orange', 'Sunset orange', 300, { c: '#ff7a2a' }],
    ['led-blue', 'Deep blue', 300, { c: '#3a6bff' }],
    ['led-pulse', 'Red pulse', 700, { c: '#ff3b4f', anim: 'pulse', desc: 'Breathes slowly, like an alarm.' }],
    ['led-streak', 'Streak light', 0, { bonus: 'roomlight', c: '#3ee6ff', desc: 'Your 60-day streak colour, set on the Profile page.' }],
    ['led-rainbow', 'Rainbow cycle', 900, { c: '#ff3b4f', anim: 'rainbow', sw: 'linear-gradient(90deg,#ff4d5e,#f2c230,#39ff88,#3ee6ff,#b45cff)', desc: 'Runs through every colour.' }],
  ]);
  add('prop', [
    ['cactus', 'Small cactus', 150, { hm: 0.2 }],
    ['book-tower', 'Book tower', 200, { hm: 0.3 }],
    ['book-stack', 'Books and mug', 200, { hm: 0.17 }],
    ['snake-plant', 'Snake plant', 250, { hm: 0.36 }],
    ['astronaut', 'Astronaut figure', 350, { hm: 0.22 }],
    ['headphone-stand', 'Headphones on a stand', 350, { hm: 0.28 }],
    ['desk-fan', 'Desk fan', 350, { hm: 0.3, desk: true }],
    ['keycap-jar', 'Keycap jar', 400, { hm: 0.2 }],
    ['lava-lamp', 'Lava lamp', 450, { hm: 0.36, glow: '#b45cff' }],
    ['cradle', 'Newton\'s cradle', 450, { hm: 0.15 }],
    ['globe', 'Spinning globe', 500, { hm: 0.3 }],
    ['lantern', 'Lantern lamp', 500, { hm: 0.3, glow: '#ffc070' }],
    ['fishbowl', 'Goldfish bowl', 600, { hm: 0.2 }],
    ['mic-arm', 'Microphone arm', 600, { hm: 0.36, desk: true }],
    ['monstera', 'Monstera', 700, { hm: 0.5, desk: true }],
    ['plasma-ball', 'Plasma ball', 800, { hm: 0.22, glow: '#b45cff' }],
    ['laptop', 'Laptop', 1200, { hm: 0.2, desk: true }],
    ['arcade', 'Mini arcade', 1500, { hm: 0.34, glow: '#3ee6ff', desc: 'A desk-size arcade cabinet that really lights up.' }],
    ['pc-tower', 'Gaming PC', 2400, { hm: 0.44, desk: true, glow: '#39ff88' }],
    ['pc-white', 'White gaming PC', 2400, { hm: 0.44, desk: true, glow: '#3ee6ff' }],
    ['aquarium', 'Aquarium', 3500, { hm: 0.42, desk: true, glow: '#3ec8ff' }],
    ['gift-crt', 'Green CRT terminal', 0, { hm: 0.24, gift: true, glow: '#39ff88', desc: 'An old terminal that still boots.' }],
    ['gift-trophy', 'Gold keycap trophy', 0, { hm: 0.18, gift: true, desc: 'A keycap cast in gold.' }],
  ]);
  add('holo', [
    ['holo-ctrl', 'CTRL emblem', 6000],
    ['holo-syntax', 'Syntax Error', 9000],
    ['holo-earth', 'Earth', 12000],
    ['holo-operator', 'Your operator', 15000, { desc: 'An operator in light, life size.' }],
    ['holo-rush', 'Boss Rush titans', 20000, { desc: 'The six titans, one after another.' }],
  ]);
  add('pet', [
    ['cat', 'Sleeping cat', 1500, { mode: 'sit', hm: 0.3, desc: 'A ginger tabby, asleep wherever you put it.' }],
    ['pet-drone', 'Camera drone', 2500, { mode: 'hover', hm: 0.2, desc: 'Hovers and watches the room.' }],
  ]);
  add('banner', [
    ['ban-ctrl', 'CTRL emblem', 0],
    ['ban-ctrl-red', 'CTRL emblem, red', 300],
    ['ban-ctrl-gold', 'CTRL emblem, gold', 500],
    ['ban-laurel', '10000WPM laurel', 400],
    ['ban-hazard', 'Hazard stripes', 350],
    ['ban-syntax', 'Syntax Error mark', 600],
    ['gift-pennant', 'Streak flame', 0, { gift: true, desc: 'A flame for days in a row.' }],
  ]);
  for (const it of I) it.art = it.type === 'prop' || it.type === 'pet' ? `assets/room/items/${it.id === 'pet-drone' ? 'drone' : it.id}.webp` : null;
  const byId = new Map(I.map(it => [it.id, it]));
  const bonusColor = it => { try { const b = window.Progress && Progress.bonus(it.bonus); return b ? b.color : null; } catch (e) { return null; } };
  const DEFAULT = { view: 'view-city', screen: 'scr-stats', wall: 'scr-card', light: 'led-teal', banner: 'ban-ctrl' };

  // ------------------------------------------------------------------ the achievement case
  // Earned only. has(ctx) gets { ach(id), level, rush: { bosses, beat: Set of boss ids }, bossWins }.
  // Better trophies first: the case fills from the top, so the best ones get the front spots.
  const TROPHIES = [
    { id: 'cup-art', art: 'cup-gold', name: 'Faster than Art', how: 'Type more than 204 wpm.', has: c => c.ach('beatart') },
    { id: 'fig-syntax', art: 'fig-syntax', name: 'Syntax Error', how: 'Be in the fight when Syntax Error goes down.', has: c => c.ach('bosswin') || c.rush.beat.has('syntax') },
    { id: 'cup-rush', art: 'cup-silver', name: 'Boss Rush: 10 bosses', how: 'Beat 10 bosses in one Boss Rush run.', has: c => c.rush.bosses >= 10 },
    { id: 'rank-75', art: 'badge-gold', name: 'Level 75', how: 'Reach level 75.', has: c => c.level >= 75 },
    { id: 'fig-king', art: 'fig-king', name: 'Kernel King', how: 'Beat the Kernel King in Boss Rush.', has: c => c.rush.beat.has('king') },
    { id: 'fig-colossus', art: 'fig-colossus', name: 'Data Colossus', how: 'Beat the Data Colossus in Boss Rush.', has: c => c.rush.beat.has('colossus') },
    { id: 'fig-brute', art: 'fig-brute', name: 'Overclocked Brute', how: 'Beat the Overclocked Brute in Boss Rush.', has: c => c.rush.beat.has('brute') },
    { id: 'fig-half', art: 'fig-half', name: 'Half-Compiled', how: 'Beat Half-Compiled in Boss Rush.', has: c => c.rush.beat.has('half') },
    { id: 'fig-warden', art: 'fig-warden', name: 'Firewall Warden', how: 'Beat the Firewall Warden in Boss Rush.', has: c => c.rush.beat.has('warden') },
    { id: 'fig-siege', art: 'fig-siege', name: 'Siege Titan', how: 'Beat the Siege Titan in Boss Rush.', has: c => c.rush.beat.has('siege') },
    { id: 'medal-150', art: 'medal-gold', name: '150 wpm', how: 'Type 150 wpm in any run.', has: c => c.ach('wpm150') },
    { id: 'crystal-boss', art: 'crystal-red', name: '100,000 damage', how: 'Deal 100,000 damage to Syntax Error.', has: c => c.ach('boss100k') },
    { id: 'crystal-combo', art: 'crystal-cyan', name: '250 combo', how: 'Reach a 250 combo.', has: c => c.ach('combo250') },
    { id: 'crystal-streak', art: 'crystal-violet', name: '30 day streak', how: 'Sign in 30 days in a row.', has: c => c.ach('streak30') },
    { id: 'crystal-hidden', art: 'crystal-gold', name: 'Secret', how: 'Find a hidden achievement.', has: c => ['h-night', 'h-100', 'h-204', 'h-quote', 'h-back'].some(c.ach) },
    { id: 'key-breach', art: 'key-gold', name: 'Rollback', how: 'Clear the last chapter of Breach.', has: c => c.ach('horde5') },
    { id: 'cup-race', art: 'cup-bronze', name: 'Overtake', how: 'Win a race against Art.', has: c => c.ach('racewin') },
    { id: 'rank-45', art: 'badge-violet', name: 'Level 45', how: 'Reach level 45.', has: c => c.level >= 45 },
    { id: 'medal-100', art: 'medal-silver', name: '100 wpm', how: 'Type 100 wpm in any run.', has: c => c.ach('wpm100') },
    { id: 'rank-25', art: 'badge-cyan', name: 'Level 25', how: 'Reach level 25.', has: c => c.level >= 25 },
    { id: 'cup-rush3', art: 'key-silver', name: 'Boss Rush: 3 bosses', how: 'Beat 3 bosses in one Boss Rush run.', has: c => c.rush.bosses >= 3 },
    { id: 'badge-firewall', art: 'badge-red', name: 'Firewall', how: 'Block 50 of Syntax Error\'s attacks.', has: c => c.ach('block50') },
    { id: 'medal-60', art: 'medal-bronze', name: '60 wpm', how: 'Type 60 wpm in any run.', has: c => c.ach('wpm60') },
    { id: 'rank-10', art: 'badge-green', name: 'Level 10', how: 'Reach level 10.', has: c => c.level >= 10 },
  ];
  // the bunk room's corkboard takes pinned badges: [colour, icon]
  const PIN = { 'cup-gold': ['#ffcf4a', 'star'], 'cup-silver': ['#dfe8ea', 'star'], 'cup-bronze': ['#e08a4a', 'flag'], 'fig-syntax': ['#ff4d5e', 'skull'],
    'medal-gold': ['#ffcf4a', 'bolt'], 'medal-silver': ['#dfe8ea', 'bolt'], 'medal-bronze': ['#e08a4a', 'bolt'], 'crystal-red': ['#ff4d5e', 'gem'],
    'crystal-cyan': ['#3ee6ff', 'gem'], 'crystal-violet': ['#b45cff', 'gem'], 'crystal-gold': ['#ffcf4a', 'eye'], 'key-gold': ['#ffcf4a', 'key'], 'key-silver': ['#dfe8ea', 'key'],
    'badge-gold': ['#ffcf4a', 'chev'], 'badge-violet': ['#b45cff', 'chev'], 'badge-cyan': ['#3ee6ff', 'chev'], 'badge-green': ['#39ff88', 'chev'], 'badge-red': ['#ff4d5e', 'shield'] };

  // ------------------------------------------------------------------ the old 3D room shop
  // Items bought in the old shop that the tier rooms use under the same id need nothing; these
  // take a new id (only Gid and Art played the old room, so a simple map is enough).
  const LEGACY = {};
  for (const it of I) for (const old of it.legacy || []) LEGACY[old] = it.id;

  window.RoomTiers = {
    TIERS, LEVELS, KINDS, ITEMS: I, TROPHIES, PIN, DEFAULT, LEGACY,
    get: id => byId.get(id) || null, slots, tierFor,
    // what an untouched slot shows: the first monitor your stats, the others the screensaver
    defaultFor: (slotId, kind) => (kind === 'screen' && slotId !== 'm1' ? 'scr-logo' : DEFAULT[kind] || null),
    kind: id => KINDS.find(k => k.id === id),
    // free items count as owned by everyone
    owns: (id, owned) => { const it = byId.get(id); if (it && it.bonus) return !!bonusColor(it); return !!it && (it.price === 0 && !it.gift || (owned ? owned.includes(id) : !!(window.WPM && WPM.owns(id)))); },
    // a light that comes from a streak bonus takes the colour picked for it (js/app/progress.js)
    colorOf: it => (it.bonus ? bonusColor(it) || it.c : it.c),
  };

  // ------------------------------------------------------------------ RoomItems for #/shop and gifts
  // The shop page (js/app/shop.js), the gift crate (js/app/progress.js) and the gift reveal read
  // window.RoomItems. Free items stay out of the shop; gift-only ones come only from gifts.
  const CAT = { view: 'Window views', screen: 'Monitor programs', poster: 'Posters', light: 'Lighting', prop: 'Shelf and desk', holo: 'Holograms', pet: 'Pets', banner: 'Banners' };
  const catalog = I.filter(it => (it.price > 0 || it.gift) && !it.bonus).map(it => {
    it.category = CAT[it.type];
    it.desc ||= `${it.name}, for ${({ view: 'the window', screen: 'any monitor', poster: 'any poster frame', light: 'any lighting zone', prop: 'a shelf or the desk', holo: 'the Command deck pedestal', pet: 'your room', banner: 'the banner' })[it.type]}.`;
    if (it.type === 'holo') it.desc += ' Shows from the Command deck (level 75).';
    return it;
  });
  const thumbs = new Map();
  window.RoomItems = {
    catalog, categories: Object.values(CAT).map(name => ({ id: name, name })),
    get: id => byId.get(id) || null,
    // a picture for the shop card: the cut-out, or one drawn by the room view (tier-view.js)
    thumbnail(id) {
      const it = byId.get(id);
      if (!it) return Promise.reject(new Error('Unknown item ' + id));
      if (!thumbs.has(id)) thumbs.set(id, (function wait() { return window.RoomView ? Promise.resolve(RoomView.thumb(it)) : new Promise(ok => setTimeout(ok, 100)).then(wait); })());
      return thumbs.get(id);
    },
  };
})();
