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
  // ------------------------------------------------------------------ TEST SWITCH (Gid, 28 Nov 2026)
  // "Unlock all the different rooms and selectors. I want to check the different rooms even if I'm not
  // levelled enough yet." While true: every tier opens, every tab and slot is open in every tier,
  // every item (gift-only and streak ones too) can be previewed and placed for free without buying it,
  // the achievement case shows every trophy, and Visit a room lists a test room at each tier.
  // Turn it off before launch: set to false (or ?roomtest=off in the address for this browser).
  // js/room/tier-page.js reads RoomTiers.TEST for every gate it opens.
  const TEST_ON = true;
  const TEST = (() => { try { const q = /[?&#]roomtest=(on|off)/.exec(location.href); if (q) localStorage.setItem('wpm-roomtest', q[1]); const v = localStorage.getItem('wpm-roomtest'); return v ? v === 'on' : TEST_ON; } catch (e) { return TEST_ON; } })();

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
      pet: { sit: [612, 503, 158], hover: [585, 300, 170], roam: [905, 318, 160], desk: [1150, 470, 200, 0.22] },
      // added 28 Nov 2026 (My Room, more): neon sign, nameplate, rug, desk mat and keyboard
      sign: [[1262, 112], [1360, 106], [1360, 286], [1262, 288]],
      plate: [[16, 286], [80, 290], [80, 312], [16, 309]],
      rug: [[505, 612], [772, 612], [806, 702], [468, 702]],
      mat: { q: [[906, 442], [1108, 447], [1112, 473], [901, 469]], kb: [0.02, 0.06, 0.74, 0.94], mouse: [0.86, 0.55] },
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
      pet: { sit: [606, 240, 112], hover: [470, 190, 120], roam: [610, 330, 118], desk: [930, 461, 124, 0.3] },
      sign: [[872, 304], [1000, 304], [1000, 350], [872, 350]],
      plate: [[716, 259], [800, 259], [800, 273], [716, 273]],
      mat: { q: [[699, 446], [827, 446], [828, 465], [697, 465]], kb: [0.05, 0.1, 0.8, 0.9], mouse: [0.92, 0.5] },
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
      pet: { sit: [1060, 500, 140], hover: [860, 160, 120], roam: [640, 250, 112], desk: [655, 476, 120, 0.3] },
      sign: [[996, 165], [1166, 158], [1166, 226], [996, 229]],
      plate: [[1032, 403], [1130, 400], [1130, 421], [1032, 424]],
      rug: [[905, 655], [1190, 650], [1240, 735], [865, 740]],
      mat: { q: [[428, 474], [612, 466], [624, 485], [434, 501]], kb: [0.08, 0.1, 0.72, 0.85], mouse: [0.86, 0.45] },
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
      pet: { sit: [226, 668, 175], hover: [640, 210, 120], roam: [990, 430, 118], desk: [905, 470, 110, 0.25] },
      sign: [[946, 302], [1094, 296], [1094, 352], [946, 356]],
      plate: [[670, 322], [780, 318], [780, 340], [670, 344]],
      rug: [[625, 650], [990, 644], [1040, 728], [585, 734]],
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
      pet: { sit: [212, 700, 190], hover: [880, 300, 130], roam: [600, 320, 122], desk: [480, 466, 110, 0.3] },
      sign: [[880, 150], [1000, 146], [1000, 290], [880, 292]],
      plate: [[1042, 478], [1120, 476], [1120, 496], [1042, 498]],
    },
  };
  const LEVELS = [1, 10, 25, 45, 75];
  const tierFor = lv => LEVELS.reduce((t, need, i) => (lv >= need ? i + 1 : t), 1);

  // ------------------------------------------------------------------ what each slot takes
  // type: the catalogue type a slot takes. The tabs follow this order.
  // group: the four shelves of the shop bar (Gid, 28 Nov: curated like a character creator)
  const KINDS = [
    { id: 'view', name: 'Window', type: 'view', group: 'walls' },
    { id: 'poster', name: 'Posters', type: 'poster', group: 'walls' },
    { id: 'banner', name: 'Banner', type: 'banner', group: 'walls' },
    { id: 'sign', name: 'Neon sign', type: 'sign', group: 'walls' },
    { id: 'wall', name: 'Wall screen', type: 'screen', from: 3, group: 'walls' },
    { id: 'plate', name: 'Nameplate', type: 'plate', group: 'walls' },
    { id: 'screen', name: 'Monitors', type: 'screen', group: 'desk' },
    { id: 'kb', name: 'Keyboard', type: 'kb', group: 'desk' },
    { id: 'mat', name: 'Desk mat', type: 'mat', group: 'desk' },
    { id: 'desk', name: 'Desk', type: 'prop', from: 2, group: 'desk' },
    { id: 'accent', name: 'Accent', type: 'accent', group: 'light' },
    { id: 'light', name: 'LED zones', type: 'light', group: 'light' },
    { id: 'walls', name: 'Wall tint', type: 'walls', group: 'light' },
    { id: 'mood', name: 'Mood', type: 'mood', group: 'light' },
    { id: 'pet', name: 'Pet', type: 'pet', group: 'decor' },
    { id: 'shelf', name: 'Shelf', type: 'prop', from: 2, group: 'decor' },
    { id: 'rug', name: 'Rug', type: 'rug', group: 'decor' },
    { id: 'holo', name: 'Hologram', type: 'holo', from: 5, group: 'decor' },
  ];
  const GROUPS = [{ id: 'walls', name: 'Walls' }, { id: 'desk', name: 'Desk' }, { id: 'light', name: 'Lighting' }, { id: 'decor', name: 'Decor' }];
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
    if (T.sign) out.push({ id: 'sign', kind: 'sign', at: T.sign });
    if (T.plate) out.push({ id: 'plate', kind: 'plate', at: T.plate });
    if (T.rug) out.push({ id: 'rug', kind: 'rug', at: T.rug });
    if (T.mat) out.push({ id: 'mat', kind: 'mat', at: T.mat }, { id: 'kb', kind: 'kb', at: T.mat });
    // the whole room's look: every tier has these
    out.push({ id: 'accent', kind: 'accent' }, { id: 'walls', kind: 'walls' }, { id: 'mood', kind: 'mood' });
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

  // ------------------------------------------------------------------ more (Gid, 28 Nov 2026: "add more customization options:
  // pets, designs, whatever else may be good to edit"). Prices against the list above and rewards-config.js.
  // pets: bot: a CTRL bot that hovers, drifts to the room's other side and blinks (pic-b is the blink);
  // sit: sits where the cat sits; desk: walks the desk; fish: swims between two spots; swarm: three drones
  add('pet', [
    ['pet-orbit', 'Orbit bot', 3200, { mode: 'bot', hm: 0.26, desc: 'The Sentinel bot, pocket size. Hovers, wanders and blinks.' }],
    ['pet-pixel', 'Pixel bot', 3200, { mode: 'bot', hm: 0.26, desc: 'The Precision bot, pocket size. Hovers, wanders and blinks.' }],
    ['pet-nova', 'Nova bot', 3200, { mode: 'bot', hm: 0.27, desc: 'The Striker bot, pocket size. Hovers, wanders and blinks.' }],
    ['pet-kite', 'Kite bot', 3200, { mode: 'bot', hm: 0.26, desc: 'The Ghost bot, pocket size. Hovers, wanders and blinks.' }],
    ['pet-beep', 'Beep bot', 3200, { mode: 'bot', hm: 0.29, desc: 'The Architect bot, pocket size. Hovers, wanders and blinks.' }],
    ['pet-raze', 'Raze bot', 3200, { mode: 'bot', hm: 0.19, desc: 'The Hunter bot, pocket size. Hovers, wanders and blinks.' }],
    ['pet-cybercat', 'Cyber cat', 2800, { mode: 'sit', hm: 0.3, glow: '#3ee6ff', desc: 'A gunmetal cat with cyan eyes. Sits and watches.' }],
    ['pet-crab', 'Desk crab', 2200, { mode: 'desk', hm: 0.1, desc: 'A small crab bot that walks up and down the desk.' }],
    ['pet-fish', 'Holo koi', 4000, { mode: 'fish', hm: 0.22, desc: 'A koi made of light, swimming laps across the room.' }],
    ['pet-swarm', 'Drone swarm', 4500, { mode: 'swarm', hm: 0.12, pic: 'drone', desc: 'Three small drones flying a loose loop.' }],
  ]);
  add('prop', [
    ['ctrl-can', 'CTRL energy can', 150, { hm: 0.13 }],
    ['ctrl-mug', 'CTRL mug', 200, { hm: 0.1 }],
    ['succulents', 'Succulent bowl', 300, { hm: 0.1 }],
    ['desk-lamp', 'Desk lamp', 400, { hm: 0.42, desk: true, glow: '#ffc070' }],
    ['switch-tester', 'Switch tester', 450, { hm: 0.045, desc: 'Nine switches to press: linear, tactile and clicky.' }],
    ['flip-clock', 'Flip clock', 500, { hm: 0.075 }],
    ['artisan-key', 'Artisan keycap', 750, { hm: 0.085, glow: '#7ff4ff', desc: 'A resin keycap with the wing mark set inside.' }],
    ['ctrl-plaque', 'CTRL plaque', 900, { hm: 0.14, desc: 'The CTRL lockup on black glass.' }],
    ['studio-speaker', 'Studio speaker', 900, { hm: 0.21 }],
    ['bonsai', 'Bonsai', 1100, { hm: 0.24 }],
    ['ctrl-lightbox', 'CTRL light box', 1400, { hm: 0.16, glow: '#3ee6ff', desc: 'The wing mark lit from behind.' }],
    ['bot-squad', 'Bot squad figures', 1800, { hm: 0.11, desc: 'The six CTRL bots on one stand.' }],
  ]);
  // keyboards for the desk, laid on the desk mat (the picture's own stays until you pick one); L: length in metres
  add('kb', [
    ['desk-kb-black', 'Black 75%', 300, { pic: 'top-kb-basic', L: 0.33 }],
    ['desk-kb-shark', 'Attack Shark X68 HE', 1200, { pic: 'top-kb-attackshark-x68he', L: 0.31 }],
    ['desk-kb-aula', 'AULA F99 Pro', 1400, { pic: 'top-kb-aula-f99', L: 0.39, desc: 'The board Art types on.' }],
    ['desk-kb-womier', 'Womier SK61 HE', 1500, { pic: 'top-kb-womier-sk61he', L: 0.29, desc: 'From Art\'s collab.' }],
    ['desk-kb-loga', 'LOGA Yaksa Pro 75', 1800, { pic: 'top-kb-loga-yaksa', L: 0.33 }],
    ['desk-kb-chilkey', 'Chilkey SF60 Diamond', 2200, { pic: 'top-kb-chilkey-sf60', L: 0.29 }],
    ['desk-kb-corsair', 'Corsair Vanguard 96', 2400, { pic: 'top-kb-corsair-vanguard96', L: 0.39 }],
  ]);
  add('mat', [
    ['mat-plain', 'Black mat', 0, { desc: 'Plain black cloth.' }],
    ['mat-grid', 'Grid mat', 400],
    ['mat-camo', 'Urban camo', 450],
    ['mat-sunset', 'Sunset', 450],
    ['mat-topo', 'Contour map', 500],
    ['mat-keys', 'Legend print', 500],
    ['mat-ctrl', 'CTRL mat', 600, { desc: 'Matte black with the wing mark and a cyan edge.' }],
    ['mat-rgb', 'RGB edge mat', 1200, { desc: 'A lit edge that runs through every colour.' }],
  ]);
  add('sign', [
    ['sign-gg', 'GG', 900, { c: '#ff3fb8' }],
    ['sign-bolt', 'Lightning bolt', 1000, { c: '#ffd23d' }],
    ['sign-esc', 'ESC key', 1200, { c: '#b45cff' }],
    ['sign-type', 'Type faster', 1500, { c: '#ff7a2a' }],
    ['sign-wpm', '10000WPM', 2000, { c: '#39ff88' }],
    ['sign-wing', 'Wing mark', 2500, { c: '#3ee6ff' }],
    ['sign-ctrl', 'CTRL, cyan', 4000, { c: '#3ee6ff', desc: 'The CTRL lockup in cyan neon.' }],
    ['sign-ctrl-white', 'CTRL, white', 4000, { c: '#e9f6ff', desc: 'The CTRL lockup in white neon.' }],
  ]);
  add('plate', [
    ['plate-black', 'Matte black', 0, { desc: 'Your name and division on matte black.' }],
    ['plate-steel', 'Brushed steel', 300],
    ['plate-neon', 'Neon', 800],
    ['plate-gold', 'Gold', 1200],
  ]);
  add('rug', [
    ['rug-hazard', 'Hazard mat', 700],
    ['rug-round', 'Round sage', 800],
    ['rug-shag', 'Cream shag', 900],
    ['rug-camo', 'Urban camo', 1000],
    ['rug-grid', 'Grid rug', 1100],
    ['rug-keycap', 'Escape key', 1500, { desc: 'A rug shaped like the Esc key.' }],
    ['rug-kilim', 'Red kilim', 1600],
    ['rug-ctrl', 'CTRL rug', 1800, { desc: 'Black with the wing mark and a cyan border.' }],
  ]);
  // the whole room's look, worked out from the picture once (tier-view.js grade()):
  // accent turns every teal LED in the picture; walls tints the grey surfaces; mood grades the light
  add('accent', [
    ['acc-teal', 'Teal', 0, { c: null, sw: '#2fe0c0' }],
    ['acc-cyan', 'Cyan', 400, { c: '#3ee6ff' }],
    ['acc-lime', 'Lime', 500, { c: '#8cff58' }],
    ['acc-violet', 'Violet', 500, { c: '#9a5cff' }],
    ['acc-blue', 'Deep blue', 500, { c: '#3a6bff' }],
    ['acc-white', 'Ice white', 500, { c: '#e8f6ff', sw: '#e8f6ff' }],
    ['acc-magenta', 'Magenta', 600, { c: '#ff3fb8' }],
    ['acc-red', 'Red', 600, { c: '#ff3b4f' }],
    ['acc-amber', 'Amber', 600, { c: '#ffb020' }],
  ]);
  add('walls', [
    ['walls-none', 'As built', 0, { c: null, sw: '#5c615f' }],
    ['walls-warm', 'Warm concrete', 500, { c: '#c08a5a' }],
    ['walls-steel', 'Cold steel', 500, { c: '#6f8fa8' }],
    ['walls-sand', 'Sandstone', 600, { c: '#c7b08a' }],
    ['walls-olive', 'Olive drab', 600, { c: '#7f8a4c' }],
    ['walls-graphite', 'Graphite', 700, { c: '#2a2c2e', dark: true }],
    ['walls-midnight', 'Midnight', 700, { c: '#33468a' }],
    ['walls-plum', 'Plum', 700, { c: '#80507e' }],
  ]);
  add('mood', [
    ['mood-night', 'Night', 0, { sw: 'linear-gradient(90deg,#0b1220,#1d2a3a)' }],
    ['mood-late', 'Late night', 600, { sw: 'linear-gradient(90deg,#020305,#0b1014 60%,#2fe0c0)', desc: 'Darker, so the lights carry the room.' }],
    ['mood-dusk', 'Golden hour', 900, { sw: 'linear-gradient(90deg,#3a1d0c,#ff9a3d)', desc: 'Warm low sun across the walls.' }],
    ['mood-blue', 'Blue hour', 900, { sw: 'linear-gradient(90deg,#0b1430,#4a7cff)', desc: 'Cold blue light after sunset.' }],
    ['mood-haze', 'Neon haze', 1200, { sw: 'linear-gradient(90deg,#2a0a3a,#ff3fb8,#3ee6ff)', desc: 'A coloured haze that softens the dark.' }],
    ['mood-alert', 'Red alert', 1500, { sw: 'linear-gradient(90deg,#2a0306,#ff3b4f)', desc: 'Emergency red that breathes.' }],
    ['mood-storm', 'Thunderstorm', 2000, { sw: 'linear-gradient(90deg,#0a0e16,#c8d8ff)', desc: 'Dim and blue, with lightning outside now and then.' }],
  ]);
  add('poster', [
    ['poster-switch', 'Linear switch', 500, { desc: 'A switch taken apart, drawn like a parts sheet.' }],
    ['poster-ctrl-wing', 'CTRL wing', 600, { desc: 'The wing mark on matte black.' }],
    ['poster-ctrl-drop', 'CTRL season 01', 700],
    ['poster-ctrl-div', 'Six divisions', 800],
    ['poster-bots', 'The six bots', 900],
  ]);
  add('banner', [
    ['ban-ctrl-wing', 'CTRL lockup', 500, { desc: 'The CTRL wing and wordmark in white.' }],
    ['ban-ctrl-tech', 'CTRL techwear', 900, { desc: 'The lockup with cyan panel lines, like the CTRL hoodie.' }],
  ]);
  add('screen', [
    ['scr-ctrl', 'CTRL wing mark', 300, { desc: 'The wing mark with a slow cyan sweep.', glow: '#3ee6ff' }],
    ['scr-clock', 'Clock', 350, { desc: 'The time, big.' }],
    ['scr-type', 'Typing test', 450, { desc: 'A test running, with the wpm going up.' }],
    ['scr-viz', 'Music visualiser', 700, { desc: 'Bars that move to a beat.', glow: '#ff3fb8' }],
    ['scr-bot', 'Your bot', 800, { desc: 'Your division\'s bot and its stats.', glow: '#3ee6ff' }],
  ]);
  add('holo', [
    ['holo-wing', 'CTRL wing mark', 8000],
    ['holo-kb', 'Keyboard', 10000, { desc: 'Art\'s AULA F99, turning slowly.' }],
    ['holo-bots', 'The six bots', 14000, { desc: 'The six CTRL bots, one after another.' }],
  ]);
  for (const it of I) it.art = it.type === 'prop' || it.type === 'pet' ? `assets/room/items/${it.id === 'pet-drone' ? 'drone' : it.pic || it.id}.webp` : it.type === 'kb' ? `assets/room/items/${it.pic}.webp` : null;
  const byId = new Map(I.map(it => [it.id, it]));
  const bonusColor = it => { try { const b = window.Progress && Progress.bonus(it.bonus); return b ? b.color : null; } catch (e) { return null; } };
  const DEFAULT = { view: 'view-city', screen: 'scr-stats', wall: 'scr-card', light: 'led-teal', banner: 'ban-ctrl', accent: 'acc-teal', walls: 'walls-none', mood: 'mood-night' };

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
    TIERS, LEVELS, KINDS, GROUPS, ITEMS: I, TEST, TROPHIES, PIN, DEFAULT, LEGACY,
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
  const CAT = { view: 'Window views', screen: 'Monitor programs', poster: 'Posters', light: 'Lighting', prop: 'Shelf and desk', holo: 'Holograms', pet: 'Pets', banner: 'Banners',
    sign: 'Neon signs', kb: 'Desk keyboards', mat: 'Desk mats', rug: 'Rugs', plate: 'Nameplates', accent: 'Room colours', walls: 'Room colours', mood: 'Room colours' };
  // the rooms whose slots take an item, for the shop card and the tab
  const fits = it => [1, 2, 3, 4, 5].filter(n => slots(n).some(sl => { const k = KINDS.find(x => x.id === sl.kind); return k.type === it.type && !(sl.kind === 'shelf' && it.desk); }));
  for (const it of I) it.tiers = fits(it);
  const fitText = t => (t.length === 5 ? '' : t.length === 1 ? ` Room ${t[0]} only.` : t.every((v, i) => !i || v === t[i - 1] + 1) ? ` Rooms ${t[0]} to ${t[t.length - 1]}.` : ` Rooms ${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}.`);
  const catalog = I.filter(it => (it.price > 0 || it.gift) && !it.bonus).map(it => {
    it.category = CAT[it.type];
    it.desc ||= `${it.name}, for ${({ view: 'the window', screen: 'any monitor', poster: 'any poster frame', light: 'any lighting zone', prop: 'a shelf or the desk', holo: 'the Command deck pedestal', pet: 'your room', banner: 'the banner',
      sign: 'the neon sign spot', kb: 'the desk, on its mat', mat: 'the desk', rug: 'the floor', plate: 'the nameplate', accent: 'every LED in the room', walls: 'the walls', mood: 'the whole room' })[it.type]}.`;
    if (it.type === 'holo') it.desc += ' Shows from the Command deck (level 75).';
    else if (!it.gift) it.desc += fitText(it.tiers);
    return it;
  });
  const thumbs = new Map();
  window.RoomItems = {
    catalog, categories: [...new Set(Object.values(CAT))].map(name => ({ id: name, name })),
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
