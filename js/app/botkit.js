// BotKit: the operators' bots (27 Nov 2026), from Art's sheet of six. Each operator runs one bot in a
// fight. White hard-shell bodies, a pixel screen for a face, and seams that glow in the operator's own
// colour (red stays for corruption and the bosses).
//   orbit  Orbit  Sentinel: a sphere with a halo and side fins; carries the shield
//   pixel  Pixel  Precision: a boxy monitor with a second screen on its side and two antennas
//   nova   Nova   Striker: a sphere with four big blades and a side ring
//   kite   Kite   Ghost: a round head under a wide brimmed hat, with a scarf and a ribbon
//   beep   Beep   Architect: a round body with long ears and a medic pod
//   raze   Raze   Hunter: a dome with a ring eye hanging over six bladed legs
//
//   const b = BotKit.create(THREE, 'orbit', { color: '#8cff58', scale: 1, ...look })
//   look (all optional, see BotKit.OPTIONS):
//     shell   'white' | 'gunmetal' | 'black' | 'chrome' | 'twotone'
//     eyes    the resting face: 'own' (the bot's own) | 'round' | 'square' | 'slit' | 'visor'
//     screen  the face colour, '#rrggbb' (default: the glow colour, lightened)
//     sig     0 or 1, the style of the bot's signature part (halo, antennas, blades, hat, ears, legs)
//     back    'none' | 'wings' | 'pack', and bought: 'jets' | 'cape' | 'balloon'
//     top     on its head (bought): 'none' | 'bow' | 'cap' | 'flower' | 'party' | 'antenna' | 'headphones' | 'propeller' | 'crown'
//     blush   true: pink cheeks on the screen (bought)
//     marks   { stickers: [ids from BotKit.STICKERS], wear: 0..1 } battle marks, earned in fights
//   color 'rainbow' (bought) runs the glow through every colour
// The bought parts and their prices are in REWARDS.shop.bot (js/app/rewards-config.js); BotKit.locked(look)
// lists the ones in a look that this player doesn't own, and BotKit.mine() leaves them off in fights.
//   scene.add(b.group)          b.group sits at the bot's centre; move it to fly the bot
//   b.update(t, dt, { vel })    idle motion; vel (THREE.Vector3, units/s) leans the body into a dash
//   b.face('happy')             happy, calm, focus, angry, hurt, heart, blink, x
//   b.hit(dir, t)               knocked back along dir at time t: spins, flashes, face goes hurt
//   b.dispose()
//
// In fights (js/app/boss3d.js):
//   BotKit.mine()                 -> { id, look }: your bot is your division's (Ops), dressed as you set it in
//                                    the hangar (#/hangar, saved as 'wpm-bot'); before a division, the one you edited last
//   BotKit.random(seed)           -> { id, look } for another player, the same every time for the same seed
//   BotKit.actor(THREE, id, look) -> { group, play(anim), once(kind), update(dt), kbWorld(out), dispose }:
//                                    a bot that stands where an operator stood (group at floor level, facing +z)
//                                    and takes the same calls: play 'idle' | 'type' | 'victory' | 'defeat',
//                                    once 'cast' | 'hit'; kbWorld gives where its shots leave from
//   BotKit.crowd(THREE, n)        -> { meshes, dispose }: n simple bots in three instanced meshes (shell, face,
//                                    glow) sharing each matrix; colour the face and glow per instance
// THREE.RoundedBoxGeometry is used when the caller passes it in (as BossKit's callers do).
window.BotKit = (() => {
  const BOTS = {
    orbit: { name: 'Orbit', role: 'Shield', division: 'Sentinel', face: 'happy' },
    pixel: { name: 'Pixel', role: 'Hack', division: 'Precision', face: 'calm' },
    nova: { name: 'Nova', role: 'Attack', division: 'Striker', face: 'angry' },
    kite: { name: 'Kite', role: 'Control', division: 'Ghost', face: 'focus' },
    beep: { name: 'Beep', role: 'Heal', division: 'Architect', face: 'heart' },
    raze: { name: 'Raze', role: 'Finisher', division: 'Hunter', face: 'focus' },
  };

  // what the hangar offers; the first of each is the default
  const OPTIONS = {
    shell: [['white', 'White'], ['gunmetal', 'Gunmetal'], ['black', 'Matte black'], ['chrome', 'Chrome'], ['twotone', 'Two-tone'],
      ['mint', 'Mint'], ['sky', 'Sky'], ['lilac', 'Lilac'], ['peach', 'Peach'], ['pearl', 'Pearl'], ['rose', 'Rose gold'], ['gold', 'Gold'],
      ['cherry', 'Cherry'], ['lime', 'Lime'], ['bubblegum', 'Bubblegum'], ['midnight', 'Midnight'], ['holo', 'Holo']],
    eyes: [['own', 'Its own'], ['round', 'Round'], ['square', 'Square'], ['slit', 'Slit'], ['visor', 'Visor'],
      ['dots', 'Dots'], ['big', 'Sparkle'], ['sleepy', 'Sleepy'], ['wink', 'Wink'], ['star', 'Stars'], ['heart', 'Hearts'],
      ['anime', 'Anime'], ['squint', 'Squint'], ['glasses', 'Glasses'], ['cyclops', 'Cyclops']],
    back: [['none', 'None'], ['wings', 'Wings'], ['pack', 'Thruster pack'], ['jets', 'Twin jets'], ['cape', 'Cape'], ['balloon', 'Heart balloon'],
      ['angel', 'Angel wings'], ['bat', 'Bat wings'], ['backpack', 'Backpack'], ['rocket', 'Rocket']],
    top: [['none', 'None'], ['bow', 'Bow'], ['cap', 'Cap'], ['flower', 'Flower'], ['party', 'Party hat'], ['antenna', 'Antenna ball'], ['headphones', 'Headphones'], ['propeller', 'Propeller cap'], ['crown', 'Crown'],
      ['cat', 'Cat ears'], ['horns', 'Horns'], ['sprout', 'Sprout'], ['beanie', 'Beanie'], ['chef', 'Chef hat'], ['wizard', 'Wizard hat'], ['halo', 'Halo']],
    sig: {
      orbit: ['Halo', 'Single ring', 'Double ring'], pixel: ['Antennas', 'Twin spikes', 'Dish'], nova: ['Blades', 'Long', 'Swept back'],
      kite: ['Hat', 'Straw hat', 'Hood'], beep: ['Ears', 'Long', 'Floppy'], raze: ['Legs', 'Blades', 'Pistons'],
    },
  };
  // glows that change colour over time (bought): [hue at t, saturation, lightness] and a swatch
  const FX = {
    rainbow: { base: '#ff5cf0', swatch: 'conic-gradient(#ff5c8a,#ffd23d,#3effc8,#5cc8ff,#8c7bff,#ff5c8a)', name: 'Rainbow', at: (t, s) => [(t * 0.08 + s) % 1, 1, 0.55] },
    ember: { base: '#ff6a1f', swatch: 'radial-gradient(circle at 40% 35%,#ffe066,#ff6a1f 55%,#c41c1c)', name: 'Ember', at: (t, s) => [0.02 + 0.06 * (0.5 + 0.5 * Math.sin(t * 7 + s * 9) * Math.sin(t * 2.3)), 1, 0.52] },
    frost: { base: '#7fe8ff', swatch: 'radial-gradient(circle at 40% 35%,#fff,#7fe8ff 55%,#3b7dff)', name: 'Frost', at: (t, s) => [0.53 + 0.05 * Math.sin(t * 1.4 + s), 1, 0.62 + 0.14 * Math.sin(t * 2.1 + s)] },
    galaxy: { base: '#9b6bff', swatch: 'conic-gradient(#3b2bff,#9b6bff,#ff5cd6,#5cc8ff,#3b2bff)', name: 'Galaxy', at: (t, s) => [0.62 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.7 + s)), 1, 0.6] },
  };

  const SHELLS = {
    white: [['#d8dce2', 0.38, 0.25], ['#aeb4bd', 0.45, 0.3]],
    gunmetal: [['#4d535c', 0.32, 0.75], ['#30353c', 0.4, 0.7]],
    black: [['#1f2226', 0.75, 0.15], ['#2b2f35', 0.7, 0.2]],
    chrome: [['#b8bec7', 0.14, 1.0], ['#8d949e', 0.2, 1.0]],
    twotone: [['#d8dce2', 0.38, 0.25], ['#2a3039', 0.5, 0.4]],
    mint: [['#b8f0d8', 0.42, 0.1], ['#86d9b8', 0.45, 0.15]],
    sky: [['#bcdcff', 0.42, 0.1], ['#8ab8ec', 0.45, 0.15]],
    lilac: [['#dcc8ff', 0.42, 0.1], ['#b49ae8', 0.45, 0.15]],
    peach: [['#ffd3bd', 0.42, 0.1], ['#f2ab8a', 0.45, 0.15]],
    pearl: [['#f4f1ec', 0.18, 0.35, '#ffd9f6'], ['#d9e6f2', 0.22, 0.4]],
    rose: [['#e8b4a0', 0.2, 1.0], ['#c98b78', 0.26, 1.0]],
    gold: [['#e9c25a', 0.18, 1.0], ['#c79a2e', 0.24, 1.0]],
    cherry: [['#d8343f', 0.24, 0.15], ['#9e1f2c', 0.3, 0.2]],
    lime: [['#c8f06a', 0.4, 0.1], ['#93c43a', 0.45, 0.15]],
    bubblegum: [['#ff9ccf', 0.35, 0.1], ['#e86aa8', 0.4, 0.15]],
    midnight: [['#22306a', 0.28, 0.7], ['#141b3d', 0.35, 0.6]],
    holo: [['#e8f0ff', 0.15, 0.4, '#9ffcff'], ['#c9d4ff', 0.2, 0.5]],
  };
  // battle marks: one sticker per kind of boss repaired, drawn as a small badge
  const STICKERS = { syntax: 'Syntax Error', titan: 'Siege Titan', warden: 'Firewall Warden', king: 'Kernel King', streak: '10-win streak', founder: 'Season 1' };

  // a shop picture for a bought part: a little bot wearing it (an SVG data URL)
  function icon(it) {
    const acc = (window.Theme && Theme.hex('accent')) || '#8cff58';
    const shellC = { mint: '#b8f0d8', sky: '#bcdcff', lilac: '#dcc8ff', peach: '#ffd3bd', pearl: '#f4f1ec', rose: '#e8b4a0', gold: '#e9c25a', cherry: '#d8343f', lime: '#c8f06a', bubblegum: '#ff9ccf', midnight: '#22306a', holo: '#e8f0ff' };
    const body = it.part === 'shell' ? shellC[it.v] || '#d8dce2' : '#d8dce2';
    const FXG = { rainbow: ['#ff5c8a', '#ffd23d', '#3effc8', '#8c7bff'], ember: ['#c41c1c', '#ff6a1f', '#ffe066', '#ff6a1f'], frost: ['#3b7dff', '#7fe8ff', '#ffffff', '#7fe8ff'], galaxy: ['#3b2bff', '#9b6bff', '#ff5cd6', '#5cc8ff'] };
    const fxg = FXG[it.part === 'color' && it.v] || FXG.rainbow;
    const glowC = it.part === 'color' ? 'url(#rb)' : acc;
    let eyes = `<rect x="78" y="96" width="12" height="12" rx="3" fill="${acc}"/><rect x="110" y="96" width="12" height="12" rx="3" fill="${acc}"/>`;
    if (it.part === 'eyes') {
      const E = {
        dots: `<circle cx="84" cy="102" r="4" fill="${acc}"/><circle cx="116" cy="102" r="4" fill="${acc}"/>`,
        big: `<circle cx="84" cy="102" r="9" fill="${acc}"/><circle cx="116" cy="102" r="9" fill="${acc}"/><circle cx="87" cy="98" r="3" fill="#000"/><circle cx="119" cy="98" r="3" fill="#000"/>`,
        sleepy: `<path d="M76 104q8 -6 16 0M108 104q8 -6 16 0" stroke="${acc}" stroke-width="4" fill="none"/>`,
        wink: `<path d="M76 104q8 -8 16 0" stroke="${acc}" stroke-width="4" fill="none"/><rect x="110" y="96" width="12" height="12" rx="3" fill="${acc}"/>`,
        star: `<path d="M84 92l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7zM116 92l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z" fill="${acc}"/>`,
        heart: `<path d="M84 110l-8-8a5 5 0 0 1 8-6a5 5 0 0 1 8 6zM116 110l-8-8a5 5 0 0 1 8-6a5 5 0 0 1 8 6z" fill="${acc}"/>`,
        anime: `<ellipse cx="84" cy="102" rx="7" ry="10" fill="${acc}"/><ellipse cx="116" cy="102" rx="7" ry="10" fill="${acc}"/><circle cx="86" cy="97" r="3" fill="#000"/><circle cx="118" cy="97" r="3" fill="#000"/><circle cx="82" cy="107" r="1.6" fill="#000"/><circle cx="114" cy="107" r="1.6" fill="#000"/>`,
        squint: `<path d="M77 95l13 7-13 7M123 95l-13 7 13 7" stroke="${acc}" stroke-width="4" fill="none" stroke-linejoin="round"/>`,
        glasses: `<rect x="74" y="93" width="20" height="18" rx="3" stroke="${acc}" stroke-width="3" fill="none"/><rect x="106" y="93" width="20" height="18" rx="3" stroke="${acc}" stroke-width="3" fill="none"/><path d="M94 100h12" stroke="${acc}" stroke-width="3"/><circle cx="84" cy="102" r="3" fill="${acc}"/><circle cx="116" cy="102" r="3" fill="${acc}"/>`,
        cyclops: `<circle cx="100" cy="102" r="11" fill="${acc}"/><circle cx="103" cy="98" r="4" fill="#000"/>`,
      };
      eyes = E[it.v] || eyes;
    }
    const blush = it.part === 'blush' ? '<ellipse cx="72" cy="114" rx="7" ry="4" fill="#ff7fb6"/><ellipse cx="128" cy="114" rx="7" ry="4" fill="#ff7fb6"/>' : '';
    const TOPS = {
      bow: '<g transform="rotate(-20 128 62)"><path d="M128 62l-20-12v24zM128 62l20-12v24z" fill="#ff6fa8"/><circle cx="128" cy="62" r="6" fill="#ff6fa8"/></g>',
      cap: `<path d="M64 66a36 30 0 0 1 72 0z" fill="#333"/><path d="M100 66h44a6 6 0 0 1 0 8h-44z" fill="#333"/><circle cx="100" cy="38" r="4" fill="${acc}"/>`,
      flower: '<g transform="translate(78 50)"><circle r="7" cx="-9" fill="#ffe3f0"/><circle r="7" cx="9" fill="#ffe3f0"/><circle r="7" cy="-9" fill="#ffe3f0"/><circle r="7" cy="9" fill="#ffe3f0"/><circle r="6" fill="#ffcf4a"/></g>',
      party: '<path d="M100 18l20 46h-40z" fill="#7fd8ff"/><path d="M90 42h20M86 52h28" stroke="#ff6fa8" stroke-width="4"/><circle cx="100" cy="16" r="6" fill="' + acc + '"/>',
      antenna: `<path d="M100 66v-30" stroke="#222" stroke-width="4"/><circle cx="100" cy="32" r="8" fill="${acc}"/>`,
      headphones: `<path d="M56 100a44 44 0 0 1 88 0" stroke="#2a2f37" stroke-width="8" fill="none"/><rect x="48" y="92" width="16" height="26" rx="6" fill="#2a2f37"/><rect x="136" y="92" width="16" height="26" rx="6" fill="#2a2f37"/>`,
      propeller: '<path d="M68 66a32 26 0 0 1 64 0z" fill="#ffcf4a"/><path d="M100 40v-8" stroke="#222" stroke-width="4"/><path d="M76 30h48" stroke="#ff6fa8" stroke-width="6" stroke-linecap="round"/>',
      crown: '<path d="M70 66l4-26 13 14 13-20 13 20 13-14 4 26z" fill="#f2c230"/>',
      cat: `<path d="M66 74l6-34 22 22zM134 74l-6-34-22 22z" fill="#d8dce2"/><path d="M72 64l3-15 10 10zM128 64l-3-15-10 10z" fill="#ff9ccf"/>`,
      horns: '<path d="M74 66q-14-18-4-36q4 18 16 28zM126 66q14-18 4-36q-4 18-16 28z" fill="#d8343f"/>',
      sprout: '<path d="M100 64v-20" stroke="#4fbf6a" stroke-width="4"/><path d="M100 46q-20-2-22-18q18 0 22 18zM100 46q20-2 22-18q-18 0-22 18z" fill="#6fdc7e"/>',
      beanie: `<path d="M62 72a38 34 0 0 1 76 0z" fill="#5cc8ff"/><rect x="60" y="66" width="80" height="12" rx="4" fill="#3a8fd0"/><circle cx="100" cy="34" r="9" fill="#fff"/>`,
      chef: '<rect x="76" y="50" width="48" height="20" fill="#f4f4f4"/><circle cx="84" cy="44" r="13" fill="#f4f4f4"/><circle cx="100" cy="38" r="15" fill="#f4f4f4"/><circle cx="116" cy="44" r="13" fill="#f4f4f4"/>',
      wizard: `<path d="M100 6l-6 4 26 56h-46l22-48z" fill="#3b2bff"/><ellipse cx="98" cy="66" rx="40" ry="7" fill="#3b2bff"/><path d="M96 40l3 6 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z" fill="#f2c230"/>`,
      halo: '<ellipse cx="100" cy="44" rx="30" ry="8" stroke="#f2c230" stroke-width="5" fill="none"/>',
    };
    const top = it.part === 'top' ? TOPS[it.v] || '' : '';
    const BACKS = {
      jets: `<rect x="28" y="96" width="18" height="40" rx="8" fill="#aeb4bd"/><rect x="154" y="96" width="18" height="40" rx="8" fill="#aeb4bd"/><path d="M30 138l7 22 7-22zM156 138l7 22 7-22z" fill="${acc}"/>`,
      cape: `<path d="M60 92l-24 74h128l-24-74z" fill="${acc}" opacity=".55"/>`,
      balloon: '<path d="M158 98v-40" stroke="#222" stroke-width="2"/><path d="M158 62l-16-16a10 10 0 0 1 16-12a10 10 0 0 1 16 12z" fill="#ff5d8f"/>',
      angel: '<path d="M60 100q-30-30-50-10q10 8 8 16q10 2 12 12q14-2 30-8zM140 100q30-30 50-10q-10 8-8 16q-10 2-12 12q-14-2-30-8z" fill="#f4f4f4"/>',
      bat: '<path d="M60 96l-44-18q8 14 2 26q10-6 14 6q8-8 14 2q4-10 14-6zM140 96l44-18q-8 14-2 26q-10-6-14 6q-8-8-14 2q-4-10-14-6z" fill="#2a2f37"/>',
      backpack: `<rect x="134" y="84" width="34" height="48" rx="10" fill="#e8a23a"/><rect x="138" y="110" width="26" height="14" rx="4" fill="#c27f1e"/><circle cx="151" cy="96" r="3" fill="${acc}"/>`,
      rocket: `<path d="M150 60q10 14 10 44h-20q0-30 10-44z" fill="#e8ecf2"/><path d="M140 96l-8 14h8zM160 96l8 14h-8z" fill="#d8343f"/><circle cx="150" cy="82" r="5" fill="#5cc8ff"/><path d="M144 106l6 24 6-24z" fill="${acc}"/>`,
    };
    const back = it.part === 'back' ? BACKS[it.v] || '' : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="rb" x1="0" x2="1"><stop offset="0" stop-color="${fxg[0]}"/><stop offset=".33" stop-color="${fxg[1]}"/><stop offset=".66" stop-color="${fxg[2]}"/><stop offset="1" stop-color="${fxg[3]}"/></linearGradient></defs>
      <rect width="200" height="200" fill="#050a07"/>${back}<circle cx="100" cy="104" r="44" fill="${body}"/><path d="M66 100a34 26 0 0 1 68 0v6a34 22 0 0 1-68 0z" fill="#0b0d10"/>${eyes}${blush}
      <ellipse cx="100" cy="150" rx="22" ry="5" fill="${glowC}"/>${top}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------- pixel faces: two eyes on a 32 x 20 grid ----------
  const W = 32, H = 20;
  function eyeCells(kind, side) {   // side -1 left eye, 1 right eye; cells in an 8 x 8 box
    const c = [];
    const add = (x, y) => c.push([x, y]);
    if (kind === 'happy') for (let x = 0; x < 8; x++) { const y = Math.round(2 + Math.abs(x - 3.5) * 0.75); add(x, 6 - y + 2); add(x, 7 - y + 2); }
    else if (kind === 'calm') { for (let x = 1; x < 7; x++) for (let y = 1; y < 7; y++) if (!((x === 1 || x === 6) && (y === 1 || y === 6))) add(x, y); }
    else if (kind === 'focus') { for (let x = 0; x < 8; x++) for (let y = 3; y < 6; y++) add(x, y); }
    else if (kind === 'square') { for (let x = 1; x < 7; x++) for (let y = 1; y < 7; y++) add(x, y); }
    else if (kind === 'slit') { for (let x = 0; x < 8; x++) { add(x, 4); if (x > 0 && x < 7) add(x, 3); } }
    else if (kind === 'angry') { for (let x = 0; x < 8; x++) { const top = side < 0 ? Math.round(1 + x * 0.45) : Math.round(1 + (7 - x) * 0.45); for (let y = top; y < 7; y++) add(x, y); } }
    else if (kind === 'blink') { for (let x = 0; x < 8; x++) add(x, 5); }
    else if (kind === 'heart') { const m = ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...']; m.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') add(x, y); })); }
    else if (kind === 'hurt') { for (let i = 0; i < 7; i++) { const y = i < 4 ? i : 6 - i; add(side < 0 ? i : 7 - i, y + 2); add(side < 0 ? i : 7 - i, y + 1); } }
    else if (kind === 'x') { for (let i = 0; i < 8; i++) { add(i, i); add(7 - i, i); } }
    else if (kind === 'dots') { for (let x = 2; x < 6; x++) for (let y = 2; y < 6; y++) if (!((x === 2 || x === 5) && (y === 2 || y === 5))) add(x, y); }
    else if (kind === 'big') { for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { const d = Math.hypot(x - 3.5, y - 3.5); if (d < 3.9 && !(x >= 4 && x <= 5 && y >= 1 && y <= 2)) add(x, y); } }
    else if (kind === 'sleepy') { for (let x = 0; x < 8; x++) { const y = 4 + Math.round(Math.abs(x - 3.5) * -0.45 + 1.5); add(x, y); if (x > 0 && x < 7) add(x, y - 1); } }
    else if (kind === 'wink') { if (side < 0) { for (let x = 0; x < 8; x++) { const y = Math.round(2 + Math.abs(x - 3.5) * 0.75); add(x, 8 - y); add(x, 9 - y); } } else for (let x = 1; x < 7; x++) for (let y = 1; y < 7; y++) if (!((x === 1 || x === 6) && (y === 1 || y === 6))) add(x, y); }
    else if (kind === 'star') { const m = ['...##...', '...##...', '########', '.######.', '..####..', '.##..##.', '##....##']; m.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') add(x, y); })); }
    else if (kind === 'anime') { for (let x = 1; x < 7; x++) for (let y = 0; y < 8; y++) { const d = Math.hypot((x - 3.5) * 1.25, (y - 3.5) * 0.9); if (d < 3.6 && !(x >= 4 && x <= 5 && y >= 1 && y <= 2) && !(x === 2 && y === 5)) add(x, y); } }
    else if (kind === 'squint') { for (let i = 0; i < 4; i++) { const x = side < 0 ? 1 + i : 6 - i; add(x, 1 + i); add(x, 7 - i); } add(side < 0 ? 5 : 2, 4); }
    else if (kind === 'glasses') { for (let i = 0; i < 8; i++) { add(i, 1); add(i, 7); add(0, i); add(7, i); } for (let x = 3; x < 5; x++) for (let y = 3; y < 6; y++) add(x, y); }
    return c;
  }
  function drawFace(ctx, kind, col, blush) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = col;
    if (kind === 'visor') { ctx.fillRect(5, 8, 22, 3); ctx.globalAlpha = 0.45; ctx.fillRect(5, 11, 22, 1); ctx.globalAlpha = 1; }
    else if (kind === 'cyclops') { for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) { const d = Math.hypot(x - 5.5, y - 5.5); if (d < 5.8 && !(d < 2.4 && x >= 5 && y <= 6 && x <= 8 && y >= 3)) ctx.fillRect(10 + x, 3 + y, 1, 1); } }
    else if (kind === 'glasses') { for (const [side, x0] of [[-1, 6], [1, 18]]) for (const [x, y] of eyeCells(kind, side)) ctx.fillRect(x0 + x, 6 + y - 1, 1, 1); ctx.fillRect(14, 7, 4, 1); }
    else for (const [side, x0] of [[-1, 6], [1, 18]]) for (const [x, y] of eyeCells(kind, side)) ctx.fillRect(x0 + x, 6 + y - 1, 1, 1);
    // pink cheeks under the eyes
    if (blush && kind !== 'x') { ctx.fillStyle = '#ff7fb6'; for (const x0 of [3, 25]) { ctx.fillRect(x0, 14, 4, 2); ctx.fillRect(x0 + 1, 13, 2, 1); } }
  }

  function stickerTex(THREE, kind, glowCol) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const col = '#' + glowCol.getHexString();
    g.fillStyle = '#f2f4f6'; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); } g.closePath(); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#111'; g.stroke();
    g.fillStyle = kind === 'syntax' ? '#ff3a46' : '#15181c'; g.strokeStyle = g.fillStyle; g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath();
    if (kind === 'syntax') { g.moveTo(32, 14); g.lineTo(50, 46); g.lineTo(14, 46); g.closePath(); g.fill(); }
    else if (kind === 'titan') { g.fillRect(17, 20, 30, 24); g.clearRect(25, 28, 14, 6); }
    else if (kind === 'warden') { g.moveTo(32, 13); g.lineTo(48, 20); g.lineTo(45, 38); g.lineTo(32, 50); g.lineTo(19, 38); g.lineTo(16, 20); g.closePath(); g.fill(); }
    else if (kind === 'king') { g.moveTo(14, 44); g.lineTo(16, 20); g.lineTo(25, 32); g.lineTo(32, 16); g.lineTo(39, 32); g.lineTo(48, 20); g.lineTo(50, 44); g.closePath(); g.fill(); }
    else if (kind === 'streak') { g.fillStyle = col; g.moveTo(36, 10); g.lineTo(18, 36); g.lineTo(30, 36); g.lineTo(26, 54); g.lineTo(46, 26); g.lineTo(34, 26); g.closePath(); g.fill(); }
    else { g.fillStyle = col; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S1', 32, 34); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function scratchTex(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(20,22,26,0.75)'; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.lineWidth = 2.2 - i * 0.6; g.beginPath(); g.moveTo(10 + i * 4, 18 + i * 12); g.quadraticCurveTo(32, 26 + i * 10, 54 - i * 3, 22 + i * 13); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function create(THREE, id, opts = {}) {
    const def = BOTS[id] || BOTS.orbit, sc = opts.scale || 1;
    const V = THREE.Vector3, keep = [], own = x => (keep.push(x), x);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const fx = FX[opts.color] || null, rainbow = !!fx;
    const GLOW = new THREE.Color(fx ? fx.base : opts.color || '#8cff58');
    const hdr = k => GLOW.clone().multiplyScalar(k);
    const group = new THREE.Group(); group.name = 'bot-' + id;
    const body = new THREE.Group(); group.add(body);   // tilts and spins inside the group
    body.scale.setScalar(sc);

    // materials: white shell, dark joints, glow
    const SH = SHELLS[opts.shell] || SHELLS.white, sig = opts.sig ? 1 : 0;
    const shell = own(SH[0][3] && THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ color: SH[0][0], roughness: SH[0][1], metalness: SH[0][2], iridescence: 1, iridescenceIOR: 1.6, sheen: 1, sheenColor: new THREE.Color(SH[0][3]), clearcoat: 0.6 })
      : new THREE.MeshStandardMaterial({ color: SH[0][0], roughness: SH[0][1], metalness: SH[0][2] }));
    const shell2 = own(new THREE.MeshStandardMaterial({ color: SH[1][0], roughness: SH[1][1], metalness: SH[1][2] }));
    const dark = own(new THREE.MeshStandardMaterial({ color: '#16191e', roughness: 0.5, metalness: 0.5 }));
    const glow = own(new THREE.MeshBasicMaterial({ color: hdr(1.6), toneMapped: false }));
    const glowSoft = own(new THREE.MeshBasicMaterial({ color: hdr(1.0), toneMapped: false, transparent: true, opacity: 0.6 }));
    const mesh = (geo, mat, parent = body) => { const m = new THREE.Mesh(own(geo), mat); parent.add(m); return m; };
    const rbox = (w, h, d, r) => THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);

    // the face screen
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), tex = own(new THREE.CanvasTexture(cv));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const faceCol = opts.screen || '#' + GLOW.clone().lerp(new THREE.Color('#ffffff'), 0.55).getHexString();
    const EYES = { round: 'calm', square: 'square', slit: 'slit', visor: 'visor', dots: 'dots', big: 'big', sleepy: 'sleepy', wink: 'wink', star: 'star', heart: 'heart', anime: 'anime', squint: 'squint', glasses: 'glasses', cyclops: 'cyclops' };
    const rest = EYES[opts.eyes] || def.face;   // the resting face
    const screenMat = own(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false }));
    let faceNow = '';
    function face(kind) { if (kind === faceNow) return; faceNow = kind; drawFace(ctx, kind, faceCol, !!opts.blush); tex.needsUpdate = true; }
    // a curved screen on the front of a sphere of radius r
    const sphereScreen = (r, wide, tall, parent = body) => {
      const g = new THREE.SphereGeometry(r, 24, 16, Math.PI / 2 - wide / 2, wide, Math.PI / 2 - tall / 2, tall);
      const visor = mesh(new THREE.SphereGeometry(r * 0.995, 24, 16, Math.PI / 2 - wide / 2 - 0.12, wide + 0.24, Math.PI / 2 - tall / 2 - 0.1, tall + 0.2), dark, parent);
      visor.scale.setScalar(1.0);
      return mesh(g, screenMat, parent);
    };
    const ring = (r, tube, mat, parent = body) => mesh(new THREE.TorusGeometry(r, tube, 8, 48), mat, parent);
    const cone = (r, h, mat, seg = 4, parent = body) => mesh(new THREE.ConeGeometry(r, h, seg), mat, parent);
    const thruster = (y, r = 0.32) => { const t = ring(r, 0.05, glow); t.rotation.x = Math.PI / 2; t.position.y = y; const c = mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.95, 0.18, 16), dark); c.position.y = y + 0.08; return t; };
    const parts = {};   // pieces the idle motion moves

    if (id === 'orbit') {
      mesh(new THREE.SphereGeometry(1, 32, 24), shell);
      sphereScreen(1.012, 1.9, 1.25);
      const band = ring(1.005, 0.035, glow); band.rotation.x = Math.PI / 2; band.position.y = -0.55; band.scale.setScalar(0.835);
      parts.halo = new THREE.Group(); body.add(parts.halo); parts.halo.position.y = 1.45;
      const h1 = ring(0.62, 0.045, glow, parts.halo); h1.rotation.x = Math.PI / 2;
      if (sig) { h1.scale.setScalar(0.8); const h2 = ring(0.72, 0.03, glow, parts.halo); h2.rotation.x = Math.PI / 2 + 0.35; h1.rotation.y = -0.2; }
      for (const s of [-1, 1]) {   // side fins and ear pods
        const pod = mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.3, 16), dark); pod.rotation.z = Math.PI / 2; pod.position.x = s * 1.0;
        const fin = cone(0.22, 1.1, shell2); fin.rotation.z = -s * Math.PI / 2; fin.position.x = s * 1.6; fin.scale.z = 0.35;
        const edge = cone(0.05, 0.9, glow, 4); edge.rotation.z = -s * Math.PI / 2; edge.position.set(s * 1.62, -0.07, 0);
        const top = cone(0.16, 0.6, shell2); top.position.set(s * 0.55, 0.95, -0.1); top.rotation.z = s * 0.5; top.scale.z = 0.5;
      }
      thruster(-1.0);
    } else if (id === 'pixel') {
      mesh(rbox(1.9, 1.35, 1.35, 0.18), shell);
      const bezel = mesh(rbox(1.5, 1.0, 0.1, 0.05), dark); bezel.position.z = 0.66;
      const scr = mesh(new THREE.PlaneGeometry(1.36, 0.86), screenMat); scr.position.z = 0.72;
      const side = mesh(rbox(0.12, 0.8, 0.95, 0.04), dark); side.position.x = 0.97;
      const cvs = document.createElement('canvas'); cvs.width = 32; cvs.height = 24; const c2 = cvs.getContext('2d');
      c2.fillStyle = '#000'; c2.fillRect(0, 0, 32, 24); c2.fillStyle = faceCol; c2.font = 'bold 15px monospace'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(sig ? '>_' : '</>', 16, 13);
      const t2 = own(new THREE.CanvasTexture(cvs)); t2.colorSpace = THREE.SRGBColorSpace;
      const sideScr = mesh(new THREE.PlaneGeometry(0.85, 0.66), own(new THREE.MeshBasicMaterial({ map: t2, color: new THREE.Color(2, 2, 2), toneMapped: false }))); sideScr.position.x = 1.035; sideScr.rotation.y = Math.PI / 2;
      if (!sig) for (const [x, z, h, rz] of [[-0.55, -0.2, 1.1, 0.35], [0.6, -0.3, 0.8, -0.3]]) { const a = cone(0.09, h, dark, 6); a.position.set(x, 0.68 + h / 2, z); a.rotation.z = rz; }
      else {
        const mast = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), dark); mast.position.set(0.35, 0.9, -0.2);
        const dish = mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, 1.0), shell2); dish.material.side = THREE.DoubleSide; dish.position.set(0.35, 1.05, -0.2); dish.rotation.set(-0.6, 0, 0.5);
        const tip = mesh(new THREE.SphereGeometry(0.06, 10, 8), glow); tip.position.set(0.42, 1.2, -0.05);
      }
      const ear = mesh(rbox(0.16, 0.6, 0.6, 0.05), shell2); ear.position.set(-0.99, 0, -0.05);
      const strip = mesh(new THREE.BoxGeometry(1.4, 0.04, 0.04), glow); strip.position.set(0, -0.69, 0.55);
      thruster(-0.82, 0.38);
    } else if (id === 'nova') {
      mesh(new THREE.SphereGeometry(0.95, 32, 24), shell);
      sphereScreen(0.962, 1.7, 0.9);
      const brow = mesh(new THREE.SphereGeometry(0.99, 24, 12, Math.PI / 2 - 1.0, 2.0, 0.35, 0.55), shell2);   // armour cap over the eyes
      for (const [x, y, rz, s] of [[1, 1, -0.75, 1.2], [-1, 1, 0.75, 1.0], [1, -1, -2.4, 1.0], [-1, -1, 2.4, 1.2]]) {
        const L = sig ? 1.05 : 1.6, back = sig ? -0.45 : -0.15, pull = sig ? 0.92 : 1;
        const blade = cone(0.32, L * s, shell2, 4); blade.scale.z = 0.25; blade.position.set(x * 1.15 * pull, y * 0.95 * pull, back); blade.rotation.z = rz; if (sig) blade.rotation.x = -0.7;
        const e = cone(0.035, L * 0.75 * s, glow, 4); e.position.set(x * 1.18 * pull, y * 0.98 * pull, back + 0.1); e.rotation.z = rz; if (sig) e.rotation.x = -0.7;
      }
      const gun = ring(0.36, 0.09, dark); gun.rotation.y = Math.PI / 2; gun.position.x = 1.0;
      const gunGlow = ring(0.25, 0.05, glow); gunGlow.rotation.y = Math.PI / 2; gunGlow.position.x = 1.08;
      thruster(-0.95, 0.28);
    } else if (id === 'kite') {
      mesh(new THREE.SphereGeometry(0.95, 32, 24), dark);
      sphereScreen(0.962, 1.6, 0.75).position.y = -0.08;
      parts.hat = new THREE.Group(); body.add(parts.hat); parts.hat.position.set(0, 0.72, -0.15); parts.hat.rotation.x = -0.38;
      if (!sig) {
        mesh(new THREE.ConeGeometry(1.45, 0.8, 40, 1), shell, parts.hat).position.y = 0.15;
        const under = mesh(new THREE.CircleGeometry(1.42, 40), dark, parts.hat); under.rotation.x = Math.PI / 2; under.position.y = -0.24;   // the hat's underside
        const brim = ring(1.45, 0.035, glow, parts.hat); brim.rotation.x = Math.PI / 2; brim.position.y = -0.25;
        const crown = cone(0.1, 0.3, glow, 4, parts.hat); crown.position.y = 0.62;
      } else {   // a hood over the head with a peak at the front
        parts.hat.position.set(0, 0.05, 0); parts.hat.rotation.x = 0;
        const hood = mesh(new THREE.SphereGeometry(1.08, 32, 16, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.62), shell, parts.hat); hood.material = shell; hood.rotation.y = 0;
        const lip = mesh(new THREE.TorusGeometry(1.0, 0.035, 6, 48, Math.PI * 1.25), glow, parts.hat); lip.rotation.set(-0.9, 0, Math.PI * 0.12 + Math.PI); lip.position.set(0, 0.32, 0.22);
        const peak = cone(0.16, 0.5, shell2, 4, parts.hat); peak.position.set(0, 1.12, -0.25); peak.rotation.x = -0.5;
      }
      const scarf = mesh(new THREE.CylinderGeometry(0.95, 0.6, 0.55, 24, 1, true), own(new THREE.MeshStandardMaterial({ color: '#aeb4bd', roughness: 0.6, side: THREE.DoubleSide }))); scarf.position.y = -0.7;
      const sEdge = ring(0.61, 0.03, glow); sEdge.rotation.x = Math.PI / 2; sEdge.position.y = -0.97;
      parts.ribbon = new THREE.Group(); body.add(parts.ribbon); parts.ribbon.position.set(-0.6, -0.85, 0.4);
      const rib = mesh(new THREE.BoxGeometry(0.28, 0.9, 0.04), shell2, parts.ribbon); rib.position.y = -0.45;
      const ribG = mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), glow, parts.ribbon); ribG.position.set(0, -0.45, 0.01);
    } else if (id === 'beep') {
      const b0 = mesh(new THREE.SphereGeometry(1, 32, 24), shell); b0.scale.set(1.08, 0.95, 1);
      sphereScreen(1.012, 1.75, 1.1).scale.set(1.08, 0.95, 1);
      parts.ears = [];
      for (const s of [-1, 1]) {
        const ear = new THREE.Group(); body.add(ear); ear.position.set(s * 0.42, 0.75, -0.1); parts.ears.push(ear);
        const e = mesh(new THREE.CapsuleGeometry(0.17, sig ? 0.55 : 1.2, 4, 12), shell, ear); e.position.y = sig ? 0.4 : 0.75; e.scale.z = 0.45;
        const ei = mesh(new THREE.CapsuleGeometry(0.04, sig ? 0.4 : 0.9, 4, 8), glowSoft, ear); ei.position.set(0, sig ? 0.4 : 0.75, 0.07); ei.scale.z = 0.4;
        if (sig) {   // the top half folds over and hangs down the side
          const fold = new THREE.Group(); ear.add(fold); fold.position.y = 0.72; fold.rotation.z = -s * 2.3;
          const e2 = mesh(new THREE.CapsuleGeometry(0.17, 0.55, 4, 12), shell, fold); e2.position.y = 0.38; e2.scale.z = 0.45;
          const e2i = mesh(new THREE.CapsuleGeometry(0.04, 0.4, 4, 8), glowSoft, fold); e2i.position.set(0, 0.38, 0.07); e2i.scale.z = 0.4;
        }
        ear.rotation.z = -s * 0.22;
      }
      const pod = mesh(rbox(0.55, 0.75, 0.75, 0.12), shell2); pod.position.x = 1.15;
      const cr1 = mesh(new THREE.BoxGeometry(0.06, 0.42, 0.13), glow); cr1.position.set(1.44, 0, 0);
      const cr2 = mesh(new THREE.BoxGeometry(0.06, 0.13, 0.42), glow); cr2.position.set(1.44, 0, 0);
      const band = ring(0.62, 0.04, glow); band.rotation.x = Math.PI / 2; band.position.y = -0.92;
    } else if (id === 'raze') {
      const dome = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell); dome.scale.set(1.15, 0.8, 1.15);
      const under = mesh(new THREE.CylinderGeometry(1.0, 0.7, 0.45, 24), dark); under.position.y = -0.2;
      const eyeRing = ring(0.32, 0.07, glow); eyeRing.position.set(0, -0.1, 0.92);
      const eye = mesh(new THREE.CircleGeometry(0.2, 24), screenMat); eye.position.set(0, -0.1, 0.93);
      const rim = ring(1.14, 0.03, glow); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02;
      const tri = mesh(new THREE.RingGeometry(0.16, 0.22, 3), glow); tri.position.set(0, 0.72, 0.2); tri.rotation.x = -1.2;
      parts.legs = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6, hip = new THREE.Group(); body.add(hip);
        hip.position.set(Math.sin(a) * 0.95, -0.25, Math.cos(a) * 0.95); hip.rotation.y = a;
        const upper = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), shell2, hip); upper.position.z = 0.4;
        const knee = new THREE.Group(); hip.add(knee); knee.position.z = 0.85;
        if (!sig) {
          const blade = cone(0.2, 1.1, shell, 4, knee); blade.rotation.x = Math.PI; blade.position.y = -0.5; blade.scale.z = 0.3;
          const tip = cone(0.04, 0.9, glow, 4, knee); tip.rotation.x = Math.PI; tip.position.set(0, -0.45, 0.07);
        } else {   // a piston: a thick sleeve, a glowing joint, a rod and a foot pad
          const joint = mesh(new THREE.SphereGeometry(0.12, 12, 8), glow, knee);
          const sleeve = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 10), shell, knee); sleeve.position.y = -0.32;
          const rod = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), dark, knee); rod.position.y = -0.8;
          const pad = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 12), shell2, knee); pad.position.y = -1.06;
        }
        hip.rotation.x = -0.25; knee.rotation.x = 0.35;
        parts.legs.push({ hip, knee, ph: i * 1.7 });
      }
    }
    // ---------- the back slot: the same part on every bot, at that bot's back ----------
    const BACK = { orbit: [0, 0.1, -0.98], pixel: [0, 0.05, -0.68], nova: [0, 0.1, -0.93], kite: [0, -0.15, -0.93], beep: [0, 0, -0.98], raze: [0, 0.15, -1.05] };
    {   // every bot has a vent on its back that glows in the operator's colour, since the raid is mostly seen from behind
      const vent = new THREE.Group(); body.add(vent); vent.position.set(...(BACK[id] || [0, 0, -1])); vent.position.z -= 0.02;
      const plate = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 24), dark, vent); plate.rotation.x = Math.PI / 2;
      const vr = ring(0.27, 0.045, glow, vent); vr.position.z = -0.05;
      const core = mesh(new THREE.CircleGeometry(0.14, 20), glowSoft, vent); core.position.z = -0.05; core.rotation.y = Math.PI;
      for (const k of [-1, 1]) { const strip = mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), glow, vent); strip.position.set(k * 0.48, 0, 0.02); }
    }
    if (opts.back === 'wings' || opts.back === 'pack') {
      const anchor = new THREE.Group(); body.add(anchor); anchor.position.set(...(BACK[id] || [0, 0, -1])); parts.back = anchor;
      if (opts.back === 'wings') for (const s of [-1, 1]) {
        const w = new THREE.Group(); anchor.add(w); w.rotation.set(0.15, -s * 0.5, s * 0.25);
        const plate = mesh(new THREE.BoxGeometry(1.5, 0.06, 0.5), shell2, w); plate.position.x = s * 0.8; plate.rotation.y = s * 0.15;
        const tipW = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.3), shell, w); tipW.position.set(s * 1.5, 0.12, -0.12); tipW.rotation.z = s * 0.3;
        const edge = mesh(new THREE.BoxGeometry(1.4, 0.03, 0.04), glow, w); edge.position.set(s * 0.85, 0.04, 0.26);
      } else {
        const pack = mesh(rbox(0.9, 0.7, 0.4, 0.08), shell2, anchor); pack.position.z = -0.15;
        for (const s of [-1, 1]) {
          const n = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.45, 12), dark, anchor); n.position.set(s * 0.28, -0.3, -0.25);
          const f = ring(0.15, 0.035, glow, anchor); f.rotation.x = Math.PI / 2; f.position.set(s * 0.28, -0.53, -0.25);
        }
      }
    }

    // ---------- bought back parts (REWARDS.shop.bot) ----------
    if (opts.back === 'jets' || opts.back === 'cape' || opts.back === 'balloon') {
      const anchor = new THREE.Group(); body.add(anchor); anchor.position.set(...(BACK[id] || [0, 0, -1])); parts.back = anchor;
      if (opts.back === 'jets') for (const s of [-1, 1]) {
        const j = new THREE.Group(); anchor.add(j); j.position.set(s * 0.42, -0.05, -0.18);
        mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.75, 16), shell2, j);
        const cap = mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), shell, j); cap.position.y = 0.37;
        const noz = mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.14, 16), dark, j); noz.position.y = -0.44;
        const fl = mesh(new THREE.ConeGeometry(0.13, 0.5, 12), glowSoft, j); fl.position.y = -0.74; fl.rotation.x = Math.PI;
        (parts.flames ||= []).push(fl);
      } else if (opts.back === 'cape') {
        const cape = new THREE.Group(); anchor.add(cape); cape.position.set(0, 0.45, -0.05); parts.cape = cape;
        const g = new THREE.CylinderGeometry(0.62, 1.05, 1.7, 20, 6, true, Math.PI * 0.62, Math.PI * 0.76);
        const capeMat = own(new THREE.MeshStandardMaterial({ color: GLOW.clone().multiplyScalar(0.55), roughness: 0.75, side: THREE.DoubleSide }));
        const c = mesh(g, capeMat, cape); c.position.y = -0.85; c.position.z = 0.55;
        const hem = mesh(new THREE.TorusGeometry(1.05, 0.025, 6, 32, Math.PI * 0.76), glow, cape); hem.rotation.set(Math.PI / 2, 0, Math.PI * 1.12); hem.position.set(0, -1.7, 0.55);
        parts.capeMesh = c;
      } else {
        const bal = new THREE.Group(); anchor.add(bal); bal.position.set(0.55, 0.3, -0.2); parts.balloon = bal;
        const string = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 4), dark, bal); string.position.y = 0.7;
        const heart = new THREE.Group(); bal.add(heart); heart.position.y = 1.65;
        const hm = own(new THREE.MeshStandardMaterial({ color: '#ff5d8f', roughness: 0.25, metalness: 0.1, emissive: '#ff2a6a', emissiveIntensity: 0.25 }));
        for (const s of [-1, 1]) { const lobe = mesh(new THREE.SphereGeometry(0.24, 18, 12), hm, heart); lobe.position.set(s * 0.17, 0.08, 0); lobe.scale.z = 0.75; }
        const tip = mesh(new THREE.ConeGeometry(0.33, 0.42, 18), hm, heart); tip.rotation.z = Math.PI; tip.position.y = -0.17; tip.scale.z = 0.75;
        const knot = mesh(new THREE.ConeGeometry(0.05, 0.08, 8), hm, heart); knot.position.y = -0.42;
      }
    }

    if (['angel', 'bat', 'backpack', 'rocket'].includes(opts.back)) {
      const anchor = new THREE.Group(); body.add(anchor); anchor.position.set(...(BACK[id] || [0, 0, -1])); parts.back = anchor;
      const pm = (c, r = 0.5, m = 0.1) => own(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, side: THREE.DoubleSide }));
      if (opts.back === 'angel' || opts.back === 'bat') {
        parts.wings = [];
        const angel = opts.back === 'angel', m = angel ? pm('#f4f4f4', 0.7) : pm('#2a2f37', 0.6, 0.2);
        for (const s of [-1, 1]) {
          const w = new THREE.Group(); anchor.add(w); w.position.set(s * 0.2, 0.15, -0.1); w.rotation.y = -s * 0.35; parts.wings.push({ w, s });
          if (angel) for (let i = 0; i < 5; i++) {   // five feathers fanned out, longest at the top
            const f = mesh(new THREE.CapsuleGeometry(0.12, 0.55 + i * 0.12, 4, 10), m, w);
            f.scale.z = 0.35; f.rotation.z = s * (0.5 + i * 0.28); f.position.set(s * (0.35 + i * 0.1), 0.05 + i * 0.04, -i * 0.02);
            f.position.x += Math.sin(f.rotation.z * s) * 0.25 * s;
          } else {
            const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(1.4, 0.55); shape.quadraticCurveTo(1.2, 0.1, 1.35, -0.3);
            shape.quadraticCurveTo(1.0, -0.15, 0.95, -0.45); shape.quadraticCurveTo(0.65, -0.25, 0.5, -0.5); shape.quadraticCurveTo(0.3, -0.2, 0, -0.1);
            const wm = mesh(new THREE.ShapeGeometry(shape, 8), m, w); wm.scale.x = s;
            const bone = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), dark, w); bone.rotation.z = s * -1.18; bone.position.set(s * 0.7, 0.28, 0.01);
          }
        }
      } else if (opts.back === 'backpack') {
        const m = pm('#e8a23a', 0.7), m2 = pm('#c27f1e', 0.7);
        const bag = mesh(rbox(0.85, 0.95, 0.45, 0.14), m, anchor); bag.position.set(0, -0.05, -0.2);
        const pocket = mesh(rbox(0.6, 0.38, 0.14, 0.06), m2, anchor); pocket.position.set(0, -0.25, -0.46);
        const flap = mesh(rbox(0.87, 0.3, 0.48, 0.1), m2, anchor); flap.position.set(0, 0.32, -0.2);
        const tag = mesh(new THREE.SphereGeometry(0.06, 10, 8), glow, anchor); tag.position.set(0, 0.2, -0.46);
      } else {
        const r = new THREE.Group(); anchor.add(r); r.position.set(0, 0.1, -0.35); parts.rocket = r;
        const m = pm('#e8ecf2', 0.3, 0.4), red = pm('#d8343f', 0.35);
        mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.0, 20), m, r);
        const nose = mesh(new THREE.ConeGeometry(0.24, 0.45, 20), red, r); nose.position.y = 0.72;
        const win = mesh(new THREE.CircleGeometry(0.1, 16), own(new THREE.MeshBasicMaterial({ color: '#5cc8ff' })), r); win.position.set(0, 0.2, -0.241); win.rotation.y = Math.PI;
        for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, fin = mesh(new THREE.BoxGeometry(0.03, 0.35, 0.22), red, r); fin.position.set(Math.sin(a) * 0.27, -0.38, Math.cos(a) * 0.27); fin.rotation.y = a; }
        const fl = mesh(new THREE.ConeGeometry(0.16, 0.6, 12), glowSoft, r); fl.position.y = -0.82; fl.rotation.x = Math.PI;
        (parts.flames ||= []).push(fl);
      }
    }

    // ---------- the top slot (bought): something on the bot's head ----------
    // where the top of each head is, and how wide it is there
    const TOP = { orbit: [0, 0.97, 0, 0.85], pixel: [0, 0.68, -0.05, 0.9], nova: [0, 0.9, -0.05, 0.8], kite: [0, sig ? 1.15 : 1.32, sig ? -0.1 : -0.42, 0.7], beep: [0, 0.88, 0.02, 0.7], raze: [0, 0.78, 0, 0.9] };
    if (opts.top && opts.top !== 'none') {
      const [tx, ty, tz, tw] = TOP[id] || [0, 1, 0, 0.8];
      const top = new THREE.Group(); body.add(top); top.position.set(tx, ty, tz); parts.top = top;
      const mat = c => own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.15 }));
      const k = opts.top;
      if (k === 'bow') {
        const m = mat('#ff6fa8'); top.position.x += tw * 0.45; top.rotation.z = -0.35;
        for (const s of [-1, 1]) { const loop = mesh(new THREE.ConeGeometry(0.22, 0.42, 16), m, top); loop.rotation.z = s * Math.PI / 2; loop.position.x = s * 0.22; loop.scale.z = 0.5; }
        mesh(new THREE.SphereGeometry(0.1, 12, 8), m, top);
        for (const s of [-1, 1]) { const tail = mesh(new THREE.BoxGeometry(0.08, 0.28, 0.04), m, top); tail.position.set(s * 0.09, -0.16, 0); tail.rotation.z = s * 0.4; }
      } else if (k === 'cap') {
        const m = mat(GLOW.clone().lerp(new THREE.Color('#222'), 0.35));
        const crown = mesh(new THREE.SphereGeometry(tw * 0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, top); crown.position.y = -0.08;
        const brim = mesh(new THREE.CylinderGeometry(tw * 0.5, tw * 0.5, 0.04, 24, 1, false, -Math.PI / 2, Math.PI), m, top); brim.position.set(0, -0.06, tw * 0.45); brim.scale.z = 1.1;
        mesh(new THREE.SphereGeometry(0.05, 8, 6), glow, top).position.y = tw * 0.56;
      } else if (k === 'flower') {
        top.position.x -= tw * 0.35; top.rotation.z = 0.3; top.scale.setScalar(1.5);
        const stem = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), mat('#4fbf6a'), top); stem.position.y = 0.12;
        const head = new THREE.Group(); top.add(head); head.position.y = 0.32; head.rotation.x = 0.5; parts.flower = head;
        const pm = mat('#ffe3f0');
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, p = mesh(new THREE.SphereGeometry(0.1, 10, 8), pm, head); p.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0); p.scale.z = 0.4; }
        mesh(new THREE.SphereGeometry(0.08, 10, 8), mat('#ffcf4a'), head).position.z = 0.03;
      } else if (k === 'party') {
        top.rotation.z = -0.25; top.position.x += tw * 0.15;
        const cn = mesh(new THREE.ConeGeometry(0.28, 0.7, 24), mat('#7fd8ff'), top); cn.position.y = 0.3;
        for (const y of [0.1, 0.3, 0.5]) { const r = mesh(new THREE.TorusGeometry(0.28 * (1 - (y + 0.05) / 0.7), 0.025, 6, 24), mat('#ff6fa8'), top); r.rotation.x = Math.PI / 2; r.position.y = y; }
        mesh(new THREE.SphereGeometry(0.09, 10, 8), glow, top).position.y = 0.68;
      } else if (k === 'antenna') {
        const st = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), dark, top); st.position.y = 0.25;
        const ball = new THREE.Group(); top.add(ball); ball.position.y = 0.55; parts.antenna = ball;
        mesh(new THREE.SphereGeometry(0.12, 14, 10), glow, ball);
      } else if (k === 'headphones') {
        const m = mat('#2a2f37');
        const band = mesh(new THREE.TorusGeometry(tw + 0.1, 0.06, 8, 32, Math.PI), m, top); band.position.y = -0.45;
        for (const s of [-1, 1]) {
          const cup = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 20), m, top); cup.rotation.z = Math.PI / 2; cup.position.set(s * (tw + 0.1), -0.45, 0);
          const pad = mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 20), glow, top); pad.rotation.y = Math.PI / 2; pad.position.set(s * (tw + 0.2), -0.45, 0);
        }
      } else if (k === 'propeller') {
        const crown = mesh(new THREE.SphereGeometry(tw * 0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffcf4a'), top); crown.position.y = -0.1;
        for (let i = 0; i < 4; i++) { const seg = mesh(new THREE.SphereGeometry(tw * 0.552, 6, 12, i * Math.PI / 2, Math.PI / 4, 0, Math.PI / 2), mat(['#ff6fa8', '#5cc8ff', '#8fe8a0', '#b48cff'][i]), top); seg.position.y = -0.1; }
        const post = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), dark, top); post.position.y = tw * 0.5;
        const prop = new THREE.Group(); top.add(prop); prop.position.y = tw * 0.5 + 0.12; parts.prop = prop;
        for (const s of [-1, 1]) { const bl = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.1), mat(s < 0 ? '#ff6fa8' : '#5cc8ff'), prop); bl.position.x = s * 0.26; bl.rotation.x = s * 0.3; }
        mesh(new THREE.SphereGeometry(0.05, 8, 6), glow, prop);
      } else if (k === 'cat' || k === 'horns') {
        const m = k === 'cat' ? shell : mat('#d8343f'), inner = mat('#ff9ccf');
        for (const s of [-1, 1]) {
          const e = new THREE.Group(); top.add(e); e.position.set(s * tw * 0.5, k === 'cat' ? 0 : -0.12, 0); e.rotation.z = -s * (k === 'cat' ? 0.3 : 0.5);
          if (k === 'cat') {
            const ear = mesh(new THREE.ConeGeometry(0.3, 0.55, 4), m, e); ear.position.y = 0.24; ear.rotation.y = Math.PI / 4; ear.scale.z = 0.55;
            const ein = mesh(new THREE.ConeGeometry(0.18, 0.36, 4), inner, e); ein.position.set(0, 0.2, 0.08); ein.rotation.y = Math.PI / 4; ein.scale.z = 0.4;
          } else {   // a curved horn: a stack of shrinking cones bent outwards
            let y = 0, x = 0;
            for (let i = 0; i < 4; i++) { const r = 0.12 * (1 - i * 0.22), c = mesh(new THREE.CylinderGeometry(r * 0.78, r, 0.16, 12), m, e); c.position.set(x, y + 0.08, 0); c.rotation.z = -s * i * 0.25; y += 0.14; x += s * i * 0.035; }
            const tip = mesh(new THREE.ConeGeometry(0.05, 0.14, 12), m, e); tip.position.set(x + s * 0.04, y + 0.06, 0); tip.rotation.z = -s * 0.9;
          }
        }
        if (k === 'cat') parts.ears2 = top;
      } else if (k === 'sprout') {
        const g = mat('#6fdc7e'), st = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.35, 6), mat('#4fbf6a'), top); st.position.y = 0.12;
        const lv = new THREE.Group(); top.add(lv); lv.position.y = 0.3; parts.sprout = lv;
        for (const s of [-1, 1]) { const l = mesh(new THREE.SphereGeometry(0.16, 12, 8), g, lv); l.scale.set(1, 0.3, 0.55); l.position.x = s * 0.15; l.rotation.z = s * 0.45; }
      } else if (k === 'beanie') {
        const m = mat('#5cc8ff'), cuff = mat('#3a8fd0');
        const dome = mesh(new THREE.SphereGeometry(tw * 0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, top); dome.position.y = -0.12; dome.scale.y = 1.15;
        const c = mesh(new THREE.CylinderGeometry(tw * 0.64, tw * 0.64, 0.16, 24), cuff, top); c.position.y = -0.08;
        const pom = new THREE.Group(); top.add(pom); pom.position.y = tw * 0.6; parts.pom = pom;
        mesh(new THREE.SphereGeometry(0.13, 12, 10), mat('#ffffff'), pom);
      } else if (k === 'chef') {
        const m = own(new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.85 }));
        const band = mesh(new THREE.CylinderGeometry(tw * 0.45, tw * 0.45, 0.28, 24), m, top); band.position.y = 0.04;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, puff = mesh(new THREE.SphereGeometry(tw * 0.28, 14, 10), m, top); puff.position.set(Math.sin(a) * tw * 0.3, 0.32, Math.cos(a) * tw * 0.3); }
        mesh(new THREE.SphereGeometry(tw * 0.32, 14, 10), m, top).position.y = 0.42;
      } else if (k === 'wizard') {
        const m = own(new THREE.MeshStandardMaterial({ color: '#3b2bff', roughness: 0.7, side: THREE.DoubleSide }));
        const brim = mesh(new THREE.CylinderGeometry(tw * 0.85, tw * 0.85, 0.04, 28), m, top); brim.position.y = -0.04;
        const hat = new THREE.Group(); top.add(hat); parts.hatTip = hat;
        let y = 0, r = tw * 0.5;
        for (let i = 0; i < 4; i++) { const h = 0.26, c = mesh(new THREE.CylinderGeometry(r * 0.72, r, h, 20), m, hat); c.position.set(-i * i * 0.025, y + h / 2, 0); y += h * 0.95; r *= 0.72; }
        const star = mesh(new THREE.OctahedronGeometry(0.09), own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#f2c230').multiplyScalar(1.4), toneMapped: false })), hat); star.position.set(0.05, 0.25, tw * 0.42);
      } else if (k === 'halo') {
        const h = new THREE.Group(); top.add(h); h.position.y = 0.32; parts.goldHalo = h;
        const r = mesh(new THREE.TorusGeometry(tw * 0.55, 0.045, 10, 40), own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23d').multiplyScalar(1.5), toneMapped: false })), h); r.rotation.x = Math.PI / 2 - 0.45;
      } else if (k === 'crown') {
        const g = own(new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.2, metalness: 1 }));
        const r = tw * 0.5;
        const ringM = mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.2, 24, 1, true), g, top); ringM.position.y = 0.0; ringM.material.side = THREE.DoubleSide;
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.08, 0.24, 4), g, top); sp.position.set(Math.sin(a) * r, 0.2, Math.cos(a) * r); const gem = mesh(new THREE.SphereGeometry(0.045, 8, 6), glow, top); gem.position.set(Math.sin(a) * r * 1.02, 0.0, Math.cos(a) * r * 1.02); }
      }
    }

    // ---------- battle marks: stickers and wear, put on the shell by aiming at it from outside ----------
    const marks = opts.marks || {};
    if ((marks.stickers && marks.stickers.length) || marks.wear > 0) {
      group.updateMatrixWorld(true);
      const solids = []; body.traverse(o => { if (o.isMesh && (o.material === shell || o.material === shell2)) solids.push(o); });
      const ray = new THREE.Raycaster(), inv = new THREE.Matrix4().copy(body.matrixWorld).invert(), W2 = body.matrixWorld;
      // A sticker is a grid laid onto the part it lands on: every point of the grid is cast back onto
      // that part's surface, so it wraps round curves and lies flat on it all the way to the edges
      // (Gid, 27 Nov 2026: the flat ones floated off at their corners). One that hangs over the edge
      // of its part is made smaller until it fits, or left off.
      const N = 6;
      const P = new V(), D = new V(), Q = new V(), nrm = new V();
      const cast = (objs, fromBody, dirBody, far = Infinity) => {
        P.copy(fromBody).applyMatrix4(W2); D.copy(dirBody).transformDirection(W2);
        ray.set(P, D); ray.far = far;
        return ray.intersectObjects(objs, false)[0] || null;
      };
      const all = []; body.traverse(o => { if (o.isMesh) all.push(o); });
      const used = [];
      // one sticker or scratch at direction dir: it has to land on a shell part (not the screen, a
      // joint or a glow) and fit there whole; it goes on that part's own group, so it moves with it
      const place = (dir, size, mat, spin = 0) => {
        const d = new V(...dir).normalize();
        const h = cast(all, d.clone().multiplyScalar(6), d.clone().negate()); if (!h || !solids.includes(h.object)) return null;
        const obj = h.object, host = obj.parent, invH = new THREE.Matrix4().copy(host.matrixWorld).invert();
        const c = h.point.clone().applyMatrix4(inv);
        if (used.some(u => u.distanceTo(c) < size * 1.5)) return null;
        const n = h.face.normal.clone().transformDirection(obj.matrixWorld).transformDirection(inv).normalize();
        // two directions along the surface, turned by spin
        const up = Math.abs(n.y) > 0.9 ? new V(1, 0, 0) : new V(0, 1, 0);
        const tu = new V().crossVectors(up, n).normalize(), tv = new V().crossVectors(n, tu).normalize();
        const t1 = tu.clone().multiplyScalar(Math.cos(spin)).addScaledVector(tv, Math.sin(spin)), t2 = new V().crossVectors(n, t1).normalize();
        for (let sz = size, tries = 0; tries < 2; tries++, sz *= 0.85) {
          const g = new THREE.PlaneGeometry(1, 1, N, N), pos = g.attributes.position;
          let ok = true;
          for (let i = 0; i < pos.count && ok; i++) {
            const u = pos.getX(i) * sz, v = pos.getY(i) * sz;
            Q.copy(c).addScaledVector(t1, u).addScaledVector(t2, v);
            const hit = cast([obj], Q.clone().addScaledVector(n, 0.6), n.clone().negate(), 1.6 * sc);
            if (!hit) { ok = false; break; }
            nrm.copy(hit.face.normal).transformDirection(obj.matrixWorld);
            if (nrm.clone().transformDirection(inv).dot(n) < 0.5) { ok = false; break; }   // wrapping round a sharp edge
            const wn = nrm.clone().transformDirection(invH);
            const p = hit.point.applyMatrix4(invH).addScaledVector(wn, 0.008);
            pos.setXYZ(i, p.x, p.y, p.z);
          }
          if (!ok) { g.dispose(); continue; }
          g.computeVertexNormals();
          mesh(g, mat, host);
          used.push(c);
          return c;
        }
        return null;
      };
      // places to try, the front and sides first: a spiral over the sphere of directions, skipping
      // straight down and the back
      const CAND = [];
      for (let i = 0; i < 90; i++) {
        const y = 1 - (i + 0.5) / 90 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        const dv = [Math.cos(a) * r, y, Math.sin(a) * r];
        if (dv[1] < -0.75 || dv[2] < -0.55) continue;
        CAND.push(dv);
      }
      const pref = q => Math.abs(q[0]) * 0.8 + q[2] * 0.5 - Math.abs(q[1]) * 0.6;
      CAND.sort((p, q) => pref(q) - pref(p));
      let ci = 0;
      (marks.stickers || []).slice(0, 6).forEach((k, i) => {
        const mat = own(new THREE.MeshStandardMaterial({ map: own(stickerTex(THREE, k, GLOW)), color: '#9aa0a8', transparent: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }));
        while (ci < CAND.length && !place(CAND[ci++], 0.34, mat, i % 2 ? 0.25 : -0.2));
      });
      const scratch = own(new THREE.MeshBasicMaterial({ map: own(scratchTex(THREE)), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      used.length = 0;
      const n = Math.round(clamp(marks.wear || 0, 0, 1) * 10);
      for (let i = 0, cj = 3; i < n; i++) { const a = i * 2.39996; while (cj < CAND.length && !place(CAND[cj], 0.42 + (i % 3) * 0.1, scratch, a)) cj += 2; cj += 5; }
    }
    face(rest);

    // ---------- motion ----------
    const seed = (id.charCodeAt(0) * 13 + id.length * 7 + (opts.seed || 0)) % 100 / 100 * 6.28;
    let hitAt = -1e9; const hitDir = new V(1, 0, 0), lean = new V();
    function hit(dir, t) { hitAt = t; hitDir.copy(dir).setY(0).normalize(); }
    function update(t, dt = 0.016, o = {}) {
      const since = t - hitAt, hurt = since >= 0 && since < 1.1;
      body.position.y = Math.sin(t * 2.1 + seed) * 0.12 * sc;
      // lean into the direction of travel
      const v = o.vel || new V();
      lean.lerp(new V(clamp(v.z * 0.06, -0.5, 0.5), 0, clamp(-v.x * 0.06, -0.5, 0.5)), Math.min(1, dt * 10));
      body.rotation.set(lean.x + Math.sin(t * 1.3 + seed) * 0.05, Math.sin(t * 0.7 + seed) * 0.18, lean.z + Math.sin(t * 1.7 + seed) * 0.04);
      if (hurt) {   // knocked spinning, then it rights itself
        const k = 1 - since / 1.1;
        body.rotation.z += -hitDir.x * k * k * 6.5; body.rotation.x += hitDir.z * k * k * 4;
        body.position.y += Math.sin(since * 14) * 0.08 * k;
        face(since < 0.9 ? 'hurt' : rest);
        glow.color.copy(since < 0.12 ? new THREE.Color(4, 4, 4) : hdr(1.6));
      } else {
        glow.color.copy(hdr(1.6));
        face(o.face || ((t + seed) % 4.2 < 0.12 ? 'blink' : rest));
      }
      if (parts.halo) { parts.halo.rotation.y = t * 1.2; parts.halo.position.y = 1.45 + Math.sin(t * 2.4 + seed) * 0.06; }
      if (parts.hat) parts.hat.rotation.y = Math.sin(t * 0.9 + seed) * 0.1;
      if (parts.ribbon) parts.ribbon.rotation.set(Math.sin(t * 3 + seed) * 0.25 - lean.x * 2, 0, Math.sin(t * 2.3) * 0.2 - lean.z * 2);
      if (parts.ears) parts.ears.forEach((e, i) => { e.rotation.x = -lean.x * 1.5 + Math.sin(t * 2.6 + i) * 0.08; e.rotation.z = (i ? 0.22 : -0.22) + Math.sin(t * 2 + i * 2) * 0.06; });
      if (parts.back) parts.back.rotation.x = Math.sin(t * 2.1 + seed) * 0.05 + lean.x * 0.6;
      if (parts.legs) parts.legs.forEach(L => { L.hip.rotation.x = -0.25 + Math.sin(t * 3 + L.ph) * 0.12 - lean.x * 0.6; L.knee.rotation.x = 0.35 + Math.sin(t * 3 + L.ph + 1) * 0.15; });
      // the bought parts move too
      if (rainbow) { GLOW.setHSL(...fx.at(t, seed)); if (!hurt) glow.color.copy(hdr(1.6)); glowSoft.color.copy(hdr(1.0)); }
      if (parts.prop) parts.prop.rotation.y = t * 14;
      if (parts.wings) parts.wings.forEach(({ w, s }) => { w.rotation.y = -s * (0.35 + Math.sin(t * 5 + seed) * 0.3); });
      if (parts.rocket) parts.rocket.position.y = 0.1 + Math.sin(t * 9) * 0.015;
      if (parts.pom) parts.pom.position.x = Math.sin(t * 2.4 + seed) * 0.05 - lean.z * 0.4;
      if (parts.sprout) parts.sprout.rotation.z = Math.sin(t * 1.8 + seed) * 0.2;
      if (parts.hatTip) parts.hatTip.rotation.z = Math.sin(t * 1.5 + seed) * 0.06 + lean.z * 0.8;
      if (parts.goldHalo) { parts.goldHalo.rotation.y = t * 1.2; parts.goldHalo.position.y = 0.32 + Math.sin(t * 2 + seed) * 0.04; }
      if (parts.antenna) { parts.antenna.position.x = Math.sin(t * 3.1 + seed) * 0.06 - lean.z * 0.3; parts.antenna.position.z = lean.x * 0.3; }
      if (parts.flower) parts.flower.rotation.z = Math.sin(t * 1.6 + seed) * 0.25;
      if (parts.balloon) parts.balloon.rotation.set(Math.sin(t * 1.3 + seed) * 0.12 + lean.x * 1.5, 0, Math.sin(t * 1.7) * 0.15 + lean.z * 1.5);
      if (parts.cape) parts.cape.rotation.x = -0.12 + Math.sin(t * 2.2 + seed) * 0.06 + lean.x * 1.2;
      if (parts.flames) parts.flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 30 + i * 2) * 0.2 + Math.abs(lean.x) * 1.5; });
    }
    function dispose() { group.parent && group.parent.remove(group); keep.forEach(x => x.dispose && x.dispose()); }
    return { id, ...def, group, body, face, hit, update, dispose };
  }
  // ---------- in fights ----------
  const DIV_BOT = { striker: 'nova', precision: 'pixel', hunter: 'raze', sentinel: 'orbit', ghost: 'kite', architect: 'beep' };
  const HOVER = 2.3;   // a bot's centre above the floor
  const accent = () => (window.Theme ? Theme.hex('accent') : '#8cff58');
  const lookOf = L => ({ color: L.color || accent(), shell: L.shell, eyes: L.eyes, screen: L.screen || undefined, sig: L.sig, back: L.back,
    top: L.top || 'none', blush: !!L.blush, marks: { stickers: L.stickers || [], wear: L.wear || 0 }, name: L.name || '' });
  // the bought parts (REWARDS.shop.bot): { id, name, price, part, v }; part is a look key
  const SHOP = () => (window.REWARDS && REWARDS.shop && REWARDS.shop.bot) || [];
  const itemFor = (part, v) => SHOP().find(x => x.part === part && String(x.v) === String(v)) || null;
  const owns = id => !!(window.WPM && WPM.owns && WPM.owns(id));
  // the parts in a look that this player hasn't bought
  function locked(L) {
    const out = [];
    for (const k of ['color', 'shell', 'eyes', 'back', 'top', 'blush']) { const it = itemFor(k, L[k] === true ? 'on' : L[k]); if (it && !owns(it.id)) out.push(it); }
    return out;
  }
  // a look with its unbought parts back to the free ones, for fights
  function owned(L) {
    const o = { ...L };
    for (const it of locked(L)) o[it.part] = it.part === 'blush' ? false : it.part === 'color' ? '' : it.part === 'top' ? 'none' : OPTIONS[it.part][0][0];
    return o;
  }
  function mine() {
    let st = null; try { st = window.TT && TT.store ? TT.store.get('wpm-bot', null) : null; } catch (e) {}
    const d = window.Ops && Ops.division ? Ops.division() : null;
    const id = (d && DIV_BOT[d.id]) || (st && BOTS[st.active] ? st.active : 'pixel');
    return { id, look: lookOf(owned((st && st.bots && st.bots[id]) || {})) };
  }
  function random(seed) {
    let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = k => ((h >>> (k * 3)) & 1023) / 1024, ids = Object.keys(BOTS);
    const glows = ['#8cff58', '#5cc8ff', '#ffb000', '#b48cff', '#ff7ad9', '#3effc8', '#f4f4f4', '#ff8a3d'];
    return { id: ids[Math.floor(r(0) * ids.length)], look: lookOf({ color: glows[Math.floor(r(1) * glows.length)],
      shell: OPTIONS.shell[Math.floor(r(2) * OPTIONS.shell.length)][0], sig: r(3) < 0.5 ? 0 : 1, back: r(4) < 0.6 ? 'none' : r(4) < 0.8 ? 'wings' : 'pack',
      // other players show off what they bought now and then
      top: r(5) < 0.45 ? 'none' : OPTIONS.top[1 + Math.floor(r(6) * (OPTIONS.top.length - 1))][0], blush: r(7) < 0.25 }) };
  }
  function actor(THREE, id, look = {}, o = {}) {
    const V = THREE.Vector3, bot = create(THREE, id, { ...look, scale: o.scale || 1 });
    const group = new THREE.Group(); group.add(bot.group);
    const hover = o.hover == null ? HOVER : o.hover;
    let t = Math.random() * 10, anim = 'idle', castAt = -9, prevZ = 0;
    const vel = new V();
    function play(a) { anim = a; }
    function once(kind) {
      if (kind === 'hit') bot.hit(new V(Math.random() < 0.5 ? -1 : 1, 0, -0.6), t);
      else if (kind === 'cast') castAt = t;
    }
    const wv = new V();
    function update(dt, uo = {}) {   // uo.vel: how the actor is moving in the world, so the bot leans into it
      t += dt;
      const sc = t - castAt, lunge = sc < 0.4 ? Math.sin(sc / 0.4 * Math.PI) * 0.9 : 0;   // a dart forward on a cast
      let y = hover, face, tilt = 0, turn = 0;
      if (anim === 'defeat') { y = hover * 0.4; face = 'x'; tilt = 0.7; }
      else if (anim === 'victory') { y = hover + Math.abs(Math.sin(t * 5)) * 0.5; face = 'happy'; turn = Math.sin(t * 2.5) * 0.5; }
      else if (anim === 'type' || sc < 0.4) face = sc < 0.4 ? 'angry' : 'focus';
      bot.group.position.set(0, y, lunge);
      bot.group.rotation.set(0, turn, tilt);
      vel.set(0, 0, (lunge - prevZ) / Math.max(1e-3, dt) + (anim === 'type' ? 2.5 : 0)); prevZ = lunge;
      if (uo.vel) { wv.copy(uo.vel).applyAxisAngle(new V(0, 1, 0), -group.rotation.y); vel.add(wv); }
      bot.update(t, dt, { vel, face });
    }
    function at(name, tt) { anim = name; t = tt; update(0); }
    const kbWorld = out => bot.body.localToWorld(out.set(0, 0, 1.15));
    return { group, bot, play, once, update, at, kbWorld, dispose: () => bot.dispose() };
  }
  function mergeGeos(THREE, list) {   // non-indexed position merge, enough for flat-coloured glow parts
    const pos = []; for (const g of list) { const gg = g.index ? g.toNonIndexed() : g; pos.push(...gg.attributes.position.array); }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return out;
  }
  function crowd(THREE, n) {
    const keep = [], own = x => (keep.push(x), x);
    const shellGeo = own(new THREE.SphereGeometry(1, 20, 14)); shellGeo.translate(0, HOVER, 0);
    const faceGeo = own(new THREE.SphereGeometry(1.015, 16, 10, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.55, 1.1)); faceGeo.translate(0, HOVER, 0);
    const under = new THREE.TorusGeometry(0.42, 0.06, 6, 24); under.rotateX(Math.PI / 2); under.translate(0, HOVER - 1.02, 0);
    const vent = new THREE.TorusGeometry(0.3, 0.06, 6, 24); vent.translate(0, HOVER, -1.0);
    const glowGeo = own(mergeGeos(THREE, [under, vent]));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; drawFace(cv.getContext('2d'), 'calm', '#ffffff');
    const tex = own(new THREE.CanvasTexture(cv)); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const meshes = [
      new THREE.InstancedMesh(shellGeo, own(new THREE.MeshStandardMaterial({ color: '#d8dce2', roughness: 0.4, metalness: 0.25 })), n),
      new THREE.InstancedMesh(faceGeo, own(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })), n),
      new THREE.InstancedMesh(glowGeo, own(new THREE.MeshBasicMaterial({ toneMapped: false })), n),
    ];
    const white = new THREE.Color(1, 1, 1);
    meshes.forEach(m => { m.frustumCulled = false; if (m !== meshes[0]) for (let i = 0; i < n; i++) m.setColorAt(i, white); });
    return { meshes, dispose() { keep.forEach(x => x.dispose && x.dispose()); meshes.forEach(m => m.dispose && m.dispose()); } };
  }

  return { create, FX, BOTS, OPTIONS, STICKERS, DIV_BOT, HOVER, mine, random, actor, crowd, locked, owned, itemFor, icon };
})();
