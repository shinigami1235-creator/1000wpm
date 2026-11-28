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
//     orb     the charge orb in Duel and Party (js/app/bot-fighter.js draws it): 'core', and bought:
//             'nebula' | 'frost' | 'ember' | 'void' | 'prism' | 'pulse'
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

  // armour sets (28 Nov 2026), our own designs: plate, inlay, glowing trim, cloth and lining, and the pieces each has
  const ARMOR = {
    sovereign: { name: 'Sovereign', shell: 'black', plate: '#c99a2e', inlay: '#17191c', trim: '#8cff58', cloth: '#123d22', lining: '#0b0d0c', hem: '#c99a2e', cape: 2.1, crown: true, shoulder: 1.05 },
    vigil: { name: 'Vigil', shell: 'pearl', plate: '#eef0f4', metal: 0.55, rough: 0.22, inlay: '#c8cbd6', trim: '#a27bff', cloth: '#3b2470', lining: '#a27bff', skirt: 0.85, crest: true, shoulder: 0.95 },
    ember: { name: 'Ember Warden', shell: 'carbon', plate: '#3a3d43', metal: 0.85, rough: 0.4, inlay: '#16171a', trim: '#ff6a1f', cloth: '#26262a', lining: '#4a1a08', hem: '#ff6a1f', cape: 1.8, ragged: true, horns: true, spikes: true, shoulder: 1.15, cracks: true },
  };

  // what the hangar offers; the first of each is the default
  const OPTIONS = {
    shell: [['white', 'White'], ['gunmetal', 'Gunmetal'], ['black', 'Matte black'], ['chrome', 'Chrome'], ['twotone', 'Two-tone'],
      ['mint', 'Mint'], ['sky', 'Sky'], ['lilac', 'Lilac'], ['peach', 'Peach'], ['pearl', 'Pearl'], ['rose', 'Rose gold'], ['gold', 'Gold'],
      ['cherry', 'Cherry'], ['lime', 'Lime'], ['bubblegum', 'Bubblegum'], ['midnight', 'Midnight'], ['holo', 'Holo'],
      ['ivory', 'Ivory'], ['jade', 'Jade'], ['ocean', 'Ocean'], ['sunset', 'Sunset'], ['carbon', 'Carbon'], ['obsidian', 'Obsidian']],
    eyes: [['own', 'Its own'], ['round', 'Round'], ['square', 'Square'], ['slit', 'Slit'], ['visor', 'Visor'],
      ['dots', 'Dots'], ['big', 'Sparkle'], ['sleepy', 'Sleepy'], ['wink', 'Wink'], ['star', 'Stars'], ['heart', 'Hearts'],
      ['anime', 'Anime'], ['squint', 'Squint'], ['glasses', 'Glasses'], ['cyclops', 'Cyclops'],
      ['code', 'Code'], ['cross', 'Crosses'], ['moon', 'Moons'], ['diamond', 'Diamonds'], ['dizzy', 'Dizzy']],
    back: [['none', 'None'], ['wings', 'Wings'], ['pack', 'Thruster pack'], ['jets', 'Twin jets'], ['cape', 'Cape'], ['balloon', 'Heart balloon'],
      ['angel', 'Angel wings'], ['bat', 'Bat wings'], ['backpack', 'Backpack'], ['rocket', 'Rocket'],
      ['jetpack', 'Jetpack'], ['solar', 'Solar panels'], ['butterfly', 'Butterfly wings'], ['dragon', 'Dragon wings']],
    top: [['none', 'None'], ['bow', 'Bow'], ['cap', 'Cap'], ['flower', 'Flower'], ['party', 'Party hat'], ['antenna', 'Antenna ball'], ['headphones', 'Headphones'], ['propeller', 'Propeller cap'], ['crown', 'Crown'],
      ['cat', 'Cat ears'], ['horns', 'Horns'], ['sprout', 'Sprout'], ['beanie', 'Beanie'], ['chef', 'Chef hat'], ['wizard', 'Wizard hat'], ['halo', 'Halo'],
      ['twinant', 'Twin antennas'], ['mohawk', 'Mohawk fin'], ['dish', 'Radar dish'], ['tophat', 'Top hat'], ['unicorn', 'Unicorn horn']],
    // 28 Nov 2026: a tool on the bot's side, a trail behind it, an emote and a victory pose
    arm: [['none', 'None'], ['blaster', 'Blaster'], ['shield', 'Hex shield'], ['claw', 'Claw'], ['drill', 'Drill'], ['saber', 'Saber'], ['cannon', 'Cannon']],
    trail: [['none', 'None'], ['spark', 'Sparks'], ['pixels', 'Pixels'], ['ribbon', 'Ribbon'], ['hearts', 'Hearts'], ['flame', 'Flame'], ['stars', 'Stars']],
    armor: [['none', 'None'], ...Object.entries(ARMOR).map(([k, a]) => [k, a.name])],
    emote: [['wave', 'Wave'], ['laugh', 'Laugh'], ['spin', 'Spin'], ['heart', 'Love'], ['dance', 'Dance'], ['flip', 'Backflip']],
    victory: [['hop', 'Hop'], ['spin', 'Spin'], ['float', 'Float'], ['dance', 'Dance'], ['flip', 'Flips'], ['fireworks', 'Fireworks']],
    // the orb a bot charges as you type in Duel and Party (js/app/bot-fighter.js)
    orb: [['core', 'Core'], ['pulse', 'Pulse'], ['nebula', 'Nebula'], ['ember', 'Ember'], ['frost', 'Frost'], ['prism', 'Prism'], ['void', 'Void']],
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
    toxic: { base: '#9dff2e', swatch: 'radial-gradient(circle at 40% 35%,#f4ff9a,#9dff2e 50%,#2f8a12)', name: 'Toxic', at: (t, s) => [0.22 + 0.04 * Math.sin(t * 3 + s), 1, 0.5 + 0.12 * Math.max(0, Math.sin(t * 5.3 + s * 3))] },
    sunset: { base: '#ff7a59', swatch: 'linear-gradient(160deg,#ffd166,#ff7a59 45%,#d94f9a)', name: 'Sunset', at: (t, s) => [(0.92 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.9 + s))) % 1, 1, 0.6] },
    ocean: { base: '#2ee6d6', swatch: 'linear-gradient(160deg,#9ffcff,#2ee6d6 40%,#2266ff)', name: 'Ocean', at: (t, s) => [0.48 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.1 + s)), 1, 0.55] },
    neon: { base: '#ff2bd6', swatch: 'linear-gradient(90deg,#ff2bd6 50%,#20e7ff 50%)', name: 'Neon flip', at: (t, s) => [Math.sin(t * 2.2 + s) > 0 ? 0.87 : 0.52, 1, 0.58] },
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
    ivory: [['#efe6d2', 0.45, 0.05], ['#cfc2a6', 0.5, 0.1]],
    jade: [['#3fae86', 0.22, 0.2], ['#257a5c', 0.3, 0.25]],
    ocean: [['#1f6f9a', 0.25, 0.45], ['#123f5c', 0.3, 0.5]],
    sunset: [['#ff9a6a', 0.3, 0.2], ['#d9577a', 0.35, 0.25]],
    carbon: [['#2b2e33', 0.28, 0.55], ['#16181b', 0.4, 0.6]],
    obsidian: [['#141318', 0.12, 0.6, '#7a5cff'], ['#0c0b10', 0.25, 0.6]],
  };
  // battle marks: one sticker per kind of boss repaired, drawn as a small badge
  const STICKERS = { syntax: 'Syntax Error', titan: 'Siege Titan', warden: 'Firewall Warden', king: 'Kernel King', streak: '10-win streak', founder: 'Season 1' };

  // a shop picture for a bought part: a little bot wearing it (an SVG data URL)
  function icon(it) {
    const acc = (window.Theme && Theme.hex('accent')) || '#8cff58';
    const shellC = { mint: '#b8f0d8', sky: '#bcdcff', lilac: '#dcc8ff', peach: '#ffd3bd', pearl: '#f4f1ec', rose: '#e8b4a0', gold: '#e9c25a', cherry: '#d8343f', lime: '#c8f06a', bubblegum: '#ff9ccf', midnight: '#22306a', holo: '#e8f0ff', gunmetal: '#4d535c', black: '#1f2226', chrome: '#b8bec7', ivory: '#efe6d2', jade: '#3fae86', ocean: '#1f6f9a', sunset: '#ff9a6a', carbon: '#2b2e33', obsidian: '#141318' };
    const AR = it.part === 'armor' && ARMOR[it.v];
    const body = it.part === 'shell' ? shellC[it.v] || '#d8dce2' : AR ? shellC[AR.shell] || '#d8dce2' : '#d8dce2';
    const FXG = { rainbow: ['#ff5c8a', '#ffd23d', '#3effc8', '#8c7bff'], ember: ['#c41c1c', '#ff6a1f', '#ffe066', '#ff6a1f'], frost: ['#3b7dff', '#7fe8ff', '#ffffff', '#7fe8ff'], galaxy: ['#3b2bff', '#9b6bff', '#ff5cd6', '#5cc8ff'], toxic: ['#2f8a12', '#9dff2e', '#f4ff9a', '#9dff2e'], ocean: ['#2266ff', '#2ee6d6', '#9ffcff', '#2ee6d6'], sunset: ['#ffd166', '#ff7a59', '#d94f9a', '#ff7a59'], neon: ['#ff2bd6', '#ff2bd6', '#20e7ff', '#20e7ff'] };
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
        code: `<path d="M90 94l-12 8 12 8M110 94l12 8-12 8" stroke="${acc}" stroke-width="4" fill="none"/>`,
        cross: `<path d="M84 93v18M75 102h18M116 93v18M107 102h18" stroke="${acc}" stroke-width="5"/>`,
        moon: `<path d="M88 94a9 9 0 1 0 0 16a7 7 0 1 1 0-16zM120 94a9 9 0 1 0 0 16a7 7 0 1 1 0-16z" fill="${acc}"/>`,
        diamond: `<path d="M84 92l9 10-9 10-9-10zM116 92l9 10-9 10-9-10z" fill="${acc}"/>`,
        dizzy: `<path d="M84 102a3 3 0 1 1 3 3a6 6 0 1 1 -6-6a9 9 0 1 1 9 9M116 102a3 3 0 1 0 -3 3a6 6 0 1 0 6-6a9 9 0 1 0 -9 9" stroke="${acc}" stroke-width="2.5" fill="none"/>`,
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
      twinant: `<path d="M86 64l-8-34M114 64l8-34" stroke="#8a919b" stroke-width="4"/><circle cx="78" cy="28" r="7" fill="${acc}"/><circle cx="122" cy="28" r="7" fill="${acc}"/>`,
      mohawk: `<path d="M84 64l6-24 6 10 6-16 6 14 6-8 4 24z" fill="#2f3a33"/><path d="M90 40l6 10 6-16 6 14 6-8" stroke="${acc}" stroke-width="2" fill="none"/>`,
      dish: `<path d="M100 64v-18" stroke="#8a919b" stroke-width="4"/><path d="M72 30a28 16 0 0 0 56 0z" fill="#aeb4bd" transform="rotate(-15 100 36)"/><circle cx="104" cy="22" r="4" fill="${acc}"/>`,
      tophat: `<rect x="74" y="58" width="52" height="8" rx="3" fill="#141418"/><rect x="82" y="22" width="36" height="38" rx="3" fill="#141418"/><rect x="82" y="50" width="36" height="6" fill="${acc}"/>`,
      unicorn: `<path d="M100 14l9 48h-18z" fill="#fbf3ff"/><path d="M94 52l14-6M95 40l11-5M97 28l7-3" stroke="${acc}" stroke-width="2.5"/>`,
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
      jetpack: `<rect x="34" y="80" width="22" height="50" rx="9" fill="#d8dce2"/><rect x="144" y="80" width="22" height="50" rx="9" fill="#d8dce2"/><path d="M36 132l9 34 9-34zM146 132l9 34 9-34z" fill="${acc}"/><path d="M34 96h22M144 96h22" stroke="#8a919b" stroke-width="3"/>`,
      solar: `<rect x="6" y="74" width="44" height="32" fill="#16264a" stroke="#8a919b" stroke-width="3"/><rect x="150" y="74" width="44" height="32" fill="#16264a" stroke="#8a919b" stroke-width="3"/><path d="M28 74v32M6 90h44M172 74v32M150 90h44" stroke="#2c4a80" stroke-width="2"/><path d="M50 90h12M138 90h12" stroke="#8a919b" stroke-width="4"/>`,
      butterfly: `<ellipse cx="34" cy="78" rx="28" ry="22" fill="${acc}" opacity=".6"/><ellipse cx="166" cy="78" rx="28" ry="22" fill="${acc}" opacity=".6"/><ellipse cx="44" cy="120" rx="18" ry="14" fill="${acc}" opacity=".6"/><ellipse cx="156" cy="120" rx="18" ry="14" fill="${acc}" opacity=".6"/><ellipse cx="34" cy="78" rx="18" ry="13" stroke="${acc}" stroke-width="3" fill="none"/><ellipse cx="166" cy="78" rx="18" ry="13" stroke="${acc}" stroke-width="3" fill="none"/>`,
      dragon: '<path d="M60 96L30 56L4 50Q16 76 6 96Q24 90 26 110Q38 98 46 116Q52 102 60 104zM140 96L170 56L196 50Q184 76 194 96Q176 90 174 110Q162 98 154 116Q148 102 140 104z" fill="#3a1a1e" stroke="#9aa0a8" stroke-width="3"/>',
    };
    const back = it.part === 'back' ? BACKS[it.v] || '' : '';
    // an arm tool on the bot's left, a trail under it, motion lines for an emote, sparkles for a victory pose
    const ARMS = {
      blaster: `<rect x="22" y="112" width="36" height="16" rx="4" fill="#aeb4bd"/><rect x="8" y="116" width="16" height="8" fill="#8a919b"/><circle cx="8" cy="120" r="5" fill="${acc}"/>`,
      shield: `<path d="M38 92l20 12v24l-20 12-20-12v-24z" fill="#aeb4bd" stroke="${acc}" stroke-width="4"/>`,
      claw: `<rect x="40" y="114" width="18" height="12" fill="#aeb4bd"/><path d="M40 114l-16-10M40 120l-20 0M40 126l-16 10" stroke="#8a919b" stroke-width="5" stroke-linecap="round"/>`,
      drill: `<rect x="44" y="112" width="14" height="16" fill="#aeb4bd"/><path d="M44 112l-30 8 30 8z" fill="#8a919b"/><path d="M38 114l2 12M30 116l2 8" stroke="${acc}" stroke-width="2"/>`,
      saber: `<rect x="44" y="116" width="14" height="8" fill="#8a919b"/><path d="M44 120L6 150" stroke="${acc}" stroke-width="7" stroke-linecap="round"/><path d="M44 120L6 150" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`,
      cannon: `<rect x="18" y="108" width="40" height="24" rx="6" fill="#aeb4bd"/><circle cx="18" cy="120" r="9" fill="#16191e"/><circle cx="18" cy="120" r="5" fill="${acc}"/>`,
    };
    const TRAILS = {
      spark: () => [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${92 + (i % 3) * 8}" cy="${160 + i * 6}" r="${3 - i * 0.35}" fill="${acc}"/>`).join(''),
      pixels: () => [0, 1, 2, 3, 4].map(i => `<rect x="${90 + (i * 7) % 20}" y="${160 + i * 7}" width="6" height="6" fill="${acc}"/>`).join(''),
      ribbon: () => `<path d="M100 156q-14 14 0 22t0 22" stroke="${acc}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
      hearts: () => '<path d="M86 172l-6-6a4 4 0 0 1 6-5a4 4 0 0 1 6 5zM112 186l-5-5a3 3 0 0 1 5-4a3 3 0 0 1 5 4zM96 194l-4-4a3 3 0 0 1 4-3a3 3 0 0 1 4 3z" fill="#ff6fae"/>',
      flame: () => '<path d="M100 154q16 18 0 44q-16-26 0-44z" fill="#ff7a2a"/><path d="M100 162q8 12 0 26q-8-14 0-26z" fill="#ffe08a"/>',
      stars: () => '<path d="M90 166l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1zM112 182l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#fff6c8"/>',
    };
    const arm = it.part === 'arm' ? ARMS[it.v] || '' : '';
    // an armour set: the cape behind, then shoulders, collar and its crown, crest or horns in front
    let arBack = '', arFront = '';
    if (AR) {
      if (AR.cape) arBack = `<path d="M62 92L46 182h108L138 92z" fill="${AR.cloth}"/><path d="M46 182h108" stroke="${AR.hem || AR.trim}" stroke-width="4"/>`;
      if (AR.skirt) arBack += `<path d="M66 128l-14 40h96l-14-40z" fill="${AR.cloth}"/><path d="M52 168h96" stroke="${AR.trim}" stroke-width="3"/>` + [0, 1, 2, 3, 4].map(i => `<rect x="${58 + i * 17}" y="132" width="14" height="26" rx="2" fill="${AR.plate}"/>`).join('');
      arFront = [-1, 1].map(s2 => `<path d="M${100 + s2 * 30} 96a${22} 18 0 0 ${s2 > 0 ? 1 : 0} ${s2 * 34} 22l${-s2 * 34} 4z" fill="${AR.plate}" stroke="${AR.trim}" stroke-width="3"/>`).join('')
        + `<path d="M70 132q30 12 60 0" stroke="${AR.plate}" stroke-width="8" fill="none"/><path d="M96 134l4 8 4-8-4-4z" fill="${AR.trim}"/>`;
      if (AR.crown) arFront += `<path d="M74 66l6-18 8 12 12-20 12 20 8-12 6 18z" fill="${AR.plate}" stroke="${AR.trim}" stroke-width="2"/>`;
      if (AR.crest) arFront += `<path d="M76 64q14-34 52-30l4 30z" fill="${AR.plate}" stroke="${AR.trim}" stroke-width="3"/>`;
      if (AR.horns) arFront += `<path d="M76 74q-18-20-6-44q2 22 16 36zM124 74q18-20 6-44q-2 22-16 36z" fill="${AR.plate}" stroke="${AR.trim}" stroke-width="2"/>`;
    }
    const trail = it.part === 'trail' && TRAILS[it.v] ? TRAILS[it.v]() : '';
    // each move gets its own mark: arcs for a wave, a turning arrow for a spin, notes for a dance...
    const stroke = (d, c = acc) => `<path d="${d}" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    const spark = (x, y, c, r = 9) => `<path d="M${x} ${y - r}l${r / 3} ${r * 0.67} ${r * 0.67} ${r / 3}-${r * 0.67} ${r / 3}-${r / 3} ${r * 0.67}-${r / 3}-${r * 0.67}-${r * 0.67}-${r / 3} ${r * 0.67}-${r / 3}z" fill="${c}"/>`;
    const note = (x, y) => `<path d="M${x} ${y}v-22l14-4v22" stroke="${acc}" stroke-width="4" fill="none"/><circle cx="${x - 4}" cy="${y}" r="5" fill="${acc}"/><circle cx="${x + 10}" cy="${y - 4}" r="5" fill="${acc}"/>`;
    const arrowSpin = stroke('M52 150a56 26 0 1 0 30-36') + `<path d="M82 104l4 14-14 0z" fill="${acc}"/>`;
    const arrowFlip = stroke('M150 150a52 64 0 1 0-24-104') + `<path d="M118 38l14 6-10 10z" fill="${acc}"/>`;
    const hearts = '<path d="M46 60l-8-8a5 5 0 0 1 8-6a5 5 0 0 1 8 6zM156 48l-7-7a4 4 0 0 1 7-5a4 4 0 0 1 7 5zM164 92l-6-6a4 4 0 0 1 6-4a4 4 0 0 1 6 4z" fill="#ff6fae"/>';
    const MOVES = {
      wave: stroke('M150 70q14 16 0 32M164 60q20 26 0 52'), laugh: `<text x="146" y="70" fill="${acc}" font-family="monospace" font-weight="bold" font-size="22">HA</text><text x="24" y="64" fill="${acc}" font-family="monospace" font-weight="bold" font-size="16">ha</text>`,
      spin: arrowSpin, heart: hearts, dance: note(36, 80) + note(150, 60), flip: arrowFlip,
      hop: stroke('M80 168h40M88 180h24') + stroke('M60 40v14M140 40v14M100 30v14'), float: stroke('M66 166q12-8 22 0t22 0t22 0') + stroke('M74 180q10-6 18 0t18 0t18 0'),
      fireworks: [[40, 40, '#ffd23d', 12], [160, 46, '#ff6fae', 10], [30, 140, '#5cc8ff', 9], [170, 136, acc, 11], [100, 20, '#fff', 8]].map(([x, y, c, r]) => spark(x, y, c, r)).join(''),
    };
    // an orb in front of the bot, low on its right, drawn in its style
    const ORBS = {
      core: `<defs><radialGradient id="oc"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${acc}"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></radialGradient></defs><circle cx="148" cy="142" r="30" fill="url(#oc)"/><circle cx="148" cy="142" r="22" stroke="${acc}" stroke-width="3" fill="none" opacity=".8"/><circle cx="148" cy="142" r="13" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>`,
      nebula: `<defs><filter id="ob" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter></defs><g filter="url(#ob)"><ellipse cx="140" cy="146" rx="24" ry="15" fill="#c04dff" opacity=".8"/><ellipse cx="156" cy="136" rx="18" ry="12" fill="#2ee6d6" opacity=".7"/><circle cx="148" cy="142" r="11" fill="${acc}"/></g><circle cx="148" cy="142" r="5" fill="#fff"/>${[[134, 132], [162, 150], [142, 156], [160, 128], [128, 148]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`).join('')}`,
      frost: [0, 1, 2, 3, 4, 5].map(i => { const a = i * 60 + 15, L = i % 2 ? 22 : 30; return `<g transform="rotate(${a} 148 142)"><path d="M148 142l6-5 2 ${-L + 8}-8 -8-8 8 2 ${L - 8}z" fill="#9fdcff" stroke="#e8f8ff" stroke-width="1.5"/><path d="M148 142l2 ${-L + 4}" stroke="#fff" stroke-width="1.5"/></g>`; }).join('') + '<circle cx="148" cy="142" r="6" fill="#e8f8ff"/>',
      ember: `<defs><radialGradient id="oe"><stop offset="0" stop-color="#fffbe8"/><stop offset=".4" stop-color="#ffd25a"/><stop offset=".75" stop-color="#ff6a1f"/><stop offset="1" stop-color="#c41c1c" stop-opacity="0"/></radialGradient></defs><path d="M134 140q-4-22 8-34q-2 14 6 18q2-16 14-24q-4 16 6 24q8 8 2 18z" fill="#ff6a1f"/><path d="M140 140q0-14 8-22q0 10 6 14q4-8 10-10q-4 12 2 18z" fill="#ffc24a"/><circle cx="148" cy="146" r="22" fill="url(#oe)"/><circle cx="168" cy="122" r="2.5" fill="#ffd25a"/><circle cx="128" cy="118" r="2" fill="#ff9a3a"/>`,
      void: `<defs><linearGradient id="ov" x1="0" x2="1"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".3"/><stop offset=".5" stop-color="#fff1d6"/><stop offset="1" stop-color="#ff8a3d" stop-opacity=".9"/></linearGradient></defs><ellipse cx="148" cy="142" rx="34" ry="9" fill="none" stroke="url(#ov)" stroke-width="7"/><circle cx="148" cy="142" r="17" fill="#ffe6c0" opacity=".35"/><path d="M131 140a17 17 0 0 1 34 0" stroke="#fff1d6" stroke-width="4" fill="none"/><circle cx="148" cy="142" r="14" fill="#000"/><path d="M116 145q32 10 64 0" stroke="url(#ov)" stroke-width="5" fill="none"/>`,
      prism: ['#ff3b3b', '#ff9a2e', '#ffe14a', '#4dff7a', '#3bc8ff', '#5a6bff', '#b45cff'].map((c2, i) => `<path d="M150 142L198 ${112 + i * 10}v8z" fill="${c2}" opacity=".85"/>`).join('') + '<path d="M148 116l12 26-12 26-12-26z" fill="#e9f3ff" stroke="#fff" stroke-width="2"/><path d="M148 116v52M136 142h24" stroke="#9fd6ff" stroke-width="1.5"/>',
      pulse: `<circle cx="148" cy="142" r="28" stroke="${acc}" stroke-width="2.5" fill="none" opacity=".7"/><path d="M148 156l-13-13a8 8 0 0 1 13-10a8 8 0 0 1 13 10z" fill="#ff2d63"/><path d="M114 144h18l5-10 6 22 6-30 6 18h29" stroke="${acc}" stroke-width="3" fill="none" stroke-linejoin="round"/>`,
    };
    const orbArt = it.part === 'orb' ? ORBS[it.v] || ORBS.core : '';
    const moves = it.part === 'emote' || it.part === 'victory' ? (it.part === 'victory' && (it.v === 'spin' || it.v === 'flip' || it.v === 'dance') ? spark(40, 36, '#ffd23d') + spark(164, 34, '#ff6fae', 7) : '') + (MOVES[it.v] || '') : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="rb" x1="0" x2="1"><stop offset="0" stop-color="${fxg[0]}"/><stop offset=".33" stop-color="${fxg[1]}"/><stop offset=".66" stop-color="${fxg[2]}"/><stop offset="1" stop-color="${fxg[3]}"/></linearGradient></defs>
      <rect width="200" height="200" fill="#050a07"/>${moves}${back}${trail}${arBack}<circle cx="100" cy="104" r="44" fill="${body}"/>${arm}<path d="M66 100a34 26 0 0 1 68 0v6a34 22 0 0 1-68 0z" fill="#0b0d10"/>${eyes}${blush}
      <ellipse cx="100" cy="150" rx="22" ry="5" fill="${glowC}"/>${top}${arFront}${orbArt}</svg>`;
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
    else if (kind === 'code') { for (let i = 0; i < 4; i++) { const x = side < 0 ? 5 - i : 2 + i; add(x, 1 + i); add(x, 7 - i); add(side < 0 ? 6 - i : 1 + i, 1 + i); add(side < 0 ? 6 - i : 1 + i, 7 - i); } }
    else if (kind === 'cross') { for (let i = 0; i < 8; i++) { add(3, i); add(4, i); add(i, 3); add(i, 4); } }
    else if (kind === 'moon') { for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { const a = Math.hypot(x - 3.5, y - 3.5), b = Math.hypot(x - 5, y - 2.4); if (a < 3.8 && b > 3) add(x, y); } }
    else if (kind === 'diamond') { for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if (Math.abs(x - 3.5) + Math.abs(y - 3.5) < 4.2) add(x, y); }
    else if (kind === 'dizzy') { const pts = []; for (let k = 0; k < 40; k++) { const a = k * 0.5 * side, r = 0.25 + k * 0.095; pts.push([Math.round(3.5 + Math.cos(a) * r), Math.round(3.5 + Math.sin(a) * r)]); } for (const [x, y] of pts) if (x >= 0 && x < 8 && y >= 0 && y < 8) add(x, y); }
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
    const _hc = new THREE.Color(), hdr = k => _hc.copy(GLOW).multiplyScalar(k);   // a shared colour: copy it, don't keep it
    const group = new THREE.Group(); group.name = 'bot-' + id;
    const body = new THREE.Group(); group.add(body);   // tilts and spins inside the group
    body.scale.setScalar(sc);

    // materials: white shell, dark joints, glow
    const SH = SHELLS[(opts.armor && ARMOR[opts.armor] && ARMOR[opts.armor].shell) || opts.shell] || SHELLS.white, sig = opts.sig ? 1 : 0;   // an armour set brings its own shell
    // the shell is lacquered: a clear coat over the paint gives it a sharp highlight on top of the soft one
    // (28 Nov 2026); the iridescent ones shift colour across the curve
    const PM = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const shell = own(SH[0][3]
      ? new PM({ color: SH[0][0], roughness: SH[0][1], metalness: SH[0][2], iridescence: 1, iridescenceIOR: 1.6, sheen: 1, sheenColor: new THREE.Color(SH[0][3]), clearcoat: 0.8, clearcoatRoughness: 0.12 })
      : new PM({ color: SH[0][0], roughness: SH[0][1], metalness: SH[0][2], clearcoat: opts.lite ? 0 : 0.7, clearcoatRoughness: 0.18 }));
    const shell2 = own(new THREE.MeshStandardMaterial({ color: SH[1][0], roughness: SH[1][1], metalness: SH[1][2] }));
    const dark = own(new THREE.MeshStandardMaterial({ color: '#16191e', roughness: 0.5, metalness: 0.5 }));
    const metal = own(new THREE.MeshStandardMaterial({ color: '#8a919b', roughness: 0.28, metalness: 0.95 }));   // bolts, rims, barrels
    const led = own(new THREE.MeshBasicMaterial({ color: hdr(2), toneMapped: false }));                            // status lights that blink on their own
    const glow = own(new THREE.MeshBasicMaterial({ color: hdr(1.6), toneMapped: false }));
    const glowSoft = own(new THREE.MeshBasicMaterial({ color: hdr(1.0), toneMapped: false, transparent: true, opacity: 0.6 }));
    const mesh = (geo, mat, parent = body) => { const m = new THREE.Mesh(own(geo), mat); parent.add(m); return m; };
    const rbox = (w, h, d, r) => THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);

    // the face screen
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), tex = own(new THREE.CanvasTexture(cv));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const faceCol = opts.screen || '#' + GLOW.clone().lerp(new THREE.Color('#ffffff'), 0.55).getHexString();
    const EYES = { round: 'calm', square: 'square', slit: 'slit', visor: 'visor', dots: 'dots', big: 'big', sleepy: 'sleepy', wink: 'wink', star: 'star', heart: 'heart', anime: 'anime', squint: 'squint', glasses: 'glasses', cyclops: 'cyclops',
      code: 'code', cross: 'cross', moon: 'moon', diamond: 'diamond', dizzy: 'dizzy' };
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
    // ---------- detail pass (28 Nov 2026): seams, vents, bolts and status lights ----------
    // Gid: "more details and look better". Small parts are merged into one mesh per material, so the
    // detail costs four draw calls per bot whatever its count.
    {
      const det = new Map(), _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), Y = new V(0, 1, 0);
      const put = (geo, mat, pos, rot, scl, quat) => {
        _M.compose(new V(...pos), quat || _Q.setFromEuler(_E.set(...(rot || [0, 0, 0]))), new V(...(scl || [1, 1, 1])));
        geo.applyMatrix4(_M);
        if (!det.has(mat)) det.set(mat, []);
        det.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
      };
      const onSphere = (R, az, el, out = new V()) => out.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(az) * Math.cos(el) * R);
      // a groove along the sphere: from (az0, el0) to (az1, el1), drawn as a thin dark tube just proud of the shell
      const groove = (R, az0, el0, az1, el1, w = 0.014, sy = 1, sx = 1, n = 24) => {
        const pts = [];
        for (let i = 0; i <= n; i++) { const u = i / n, p = onSphere(R, az0 + (az1 - az0) * u, el0 + (el1 - el0) * u); p.y *= sy; p.x *= sx; p.z *= sx; pts.push(p); }
        put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, w, 4, false), dark, [0, 0, 0]);
      };
      const bolt = (R, az, el, r = 0.032, sy = 1, sx = 1) => { const p = onSphere(R, az, el); p.y *= sy; p.x *= sx; p.z *= sx; const q = new THREE.Quaternion().setFromUnitVectors(Y, p.clone().normalize()); put(new THREE.CylinderGeometry(r, r * 1.15, 0.035, 8), metal, [p.x, p.y, p.z], null, null, q); };
      const light = (R, az, el, r = 0.035, sy = 1, sx = 1) => { const p = onSphere(R, az, el); p.y *= sy; p.x *= sx; p.z *= sx; put(new THREE.SphereGeometry(r, 8, 6), led, [p.x, p.y, p.z]); };
      // vent slots on a curved back: short dark bars stacked
      const vents = (R, az, el, n = 4, sy = 1, sx = 1) => { for (let i = 0; i < n; i++) { const p = onSphere(R, az, el + (i - (n - 1) / 2) * 0.09); p.y *= sy; p.x *= sx; p.z *= sx; const q = new THREE.Quaternion().setFromUnitVectors(new V(0, 0, 1), p.clone().normalize()); put(new THREE.BoxGeometry(0.3, 0.035, 0.04), dark, [p.x, p.y, p.z], null, null, q); } };
      const D = Math.PI / 180;
      if (id === 'orbit' || id === 'nova' || id === 'beep') {
        const R = id === 'nova' ? 0.962 : 1.008, sx = id === 'beep' ? 1.08 : 1, sy = id === 'beep' ? 0.95 : 1;
        // a crown seam over the top and a band round the back, framing the screen
        groove(R, 0, 52 * D, 2 * Math.PI, 52 * D, 0.014, sy, sx, 64);
        for (const az of [125, 180, 235]) groove(R, az * D, -48 * D, az * D, 50 * D, 0.013, sy, sx);
        for (const az of [-62, 62]) groove(R, az * D, -30 * D, az * D, 30 * D, 0.012, sy, sx, 12);
        for (const az of [125, 180, 235]) for (const el of [-40, 42]) bolt(R + 0.01, az * D, el * D, 0.03, sy, sx);
        vents(R + 0.005, 150 * D, 14 * D, 4, sy, sx); vents(R + 0.005, 210 * D, 14 * D, 4, sy, sx);
        for (let i = 0; i < 3; i++) light(R + 0.01, 70 * D, (12 - i * 11) * D, 0.03, sy, sx);
      } else if (id === 'kite') {
        groove(0.962, 0, -45 * D, 2 * Math.PI, -45 * D, 0.013, 1, 1, 64);
        for (const az of [140, 180, 220]) groove(0.962, az * D, -40 * D, az * D, 35 * D, 0.012);
        for (let i = 0; i < 3; i++) light(0.975, -68 * D, (6 - i * 10) * D, 0.028);
        vents(0.967, 180 * D, 5 * D, 5);
      } else if (id === 'pixel') {
        // a groove all round the case, screws in the bezel corners, a vent on top and a light strip
        for (const y of [0.58, -0.58]) {
          put(new THREE.BoxGeometry(1.92, 0.025, 0.025), dark, [0, y, 0.678]); put(new THREE.BoxGeometry(1.92, 0.025, 0.025), dark, [0, y, -0.678]);
          put(new THREE.BoxGeometry(0.025, 0.025, 1.37), dark, [0.955, y, 0]); put(new THREE.BoxGeometry(0.025, 0.025, 1.37), dark, [-0.955, y, 0]);
        }
        for (const [x, y] of [[-0.7, 0.45], [0.7, 0.45], [-0.7, -0.45], [0.7, -0.45]]) put(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), metal, [x, y, 0.71], [Math.PI / 2, 0, 0]);
        for (let i = 0; i < 6; i++) put(new THREE.BoxGeometry(0.5, 0.02, 0.05), dark, [-0.35, 0.68, -0.35 + i * 0.1]);
        for (let i = 0; i < 4; i++) put(new THREE.SphereGeometry(0.03, 8, 6), led, [0.45 + i * 0.1, 0.68, 0.45]);
        for (let i = 0; i < 5; i++) put(new THREE.BoxGeometry(0.04, 0.5, 0.05), dark, [-0.3 + i * 0.15, 0, -0.69]);
      } else if (id === 'raze') {
        for (let k = 0; k < 6; k++) groove(1.0, k / 6 * Math.PI * 2, 6 * D, k / 6 * Math.PI * 2, 80 * D, 0.012, 0.8, 1.15, 16);
        groove(1.0, 0, 40 * D, 2 * Math.PI, 40 * D, 0.012, 0.8, 1.15, 64);
        for (let k = 0; k < 12; k++) bolt(1.0, k / 12 * Math.PI * 2 + 0.26, 10 * D, 0.028, 0.8, 1.15);
        for (let k = 0; k < 6; k++) light(1.01, k / 6 * Math.PI * 2 + 0.52, 28 * D, 0.03, 0.8, 1.15);
      }
      // the thruster under every bot: a lit nozzle ring of small vanes
      const ty = { orbit: -1.0, pixel: -0.82, nova: -0.95, kite: -0.97, beep: -0.92, raze: -0.42 }[id] || -1;
      if (id !== 'raze') for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; put(new THREE.BoxGeometry(0.035, 0.12, 0.12), metal, [Math.cos(a) * 0.27, ty + 0.02, Math.sin(a) * 0.27], [0, -a, 0]); }
      for (const [mat, geos] of det) {
        const pos = [], nor = [];
        for (const g of geos) { if (!g.attributes.normal) g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); g.dispose(); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        mesh(geo, mat).userData.detail = true;
      }
      // exhaust under the thruster: a soft flame that flickers, longer when the bot dashes
      const exMat = own(new THREE.MeshBasicMaterial({ color: hdr(1.2), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const ex = mesh(new THREE.ConeGeometry(0.22, 0.6, 16, 1, true), exMat); ex.rotation.x = Math.PI; ex.position.y = ty - 0.3; parts.exhaust = ex; parts.exMat = exMat;
      const ex2 = mesh(new THREE.ConeGeometry(0.1, 0.32, 12, 1, true), own(new THREE.MeshBasicMaterial({ color: GLOW.clone().lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(1.6), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), ex);
      ex2.position.y = 0.14;
      if (id === 'raze') ex.visible = false;
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

    // ---------- more back parts (28 Nov 2026) ----------
    if (['jetpack', 'solar', 'butterfly', 'dragon'].includes(opts.back)) {
      const anchor = new THREE.Group(); body.add(anchor); anchor.position.set(...(BACK[id] || [0, 0, -1])); parts.back = anchor;
      const flameMat = own(new THREE.MeshBasicMaterial({ color: hdr(1.4), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      if (opts.back === 'jetpack') {
        // a frame, two turbines with intake fans, lit stripes and long flames
        const pack = mesh(rbox(0.7, 0.8, 0.3, 0.08), shell2, anchor); pack.position.z = -0.12;
        mesh(new THREE.BoxGeometry(0.05, 0.6, 0.02), glow, anchor).position.set(0, 0, -0.28);
        for (const sx of [-1, 1]) {
          const j = new THREE.Group(); anchor.add(j); j.position.set(sx * 0.48, -0.05, -0.2);
          mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.9, 20), shell, j);
          for (const y of [0.25, -0.1]) { const b = mesh(new THREE.TorusGeometry(0.215, 0.018, 6, 24), metal, j); b.rotation.x = Math.PI / 2; b.position.y = y; }
          const intake = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), dark, j); intake.position.y = 0.46;
          const fan = new THREE.Group(); j.add(fan); fan.position.y = 0.47; (parts.fans ||= []).push(fan);
          for (let b = 0; b < 6; b++) { const g = new THREE.Group(); fan.add(g); g.rotation.y = b / 6 * Math.PI * 2; const bl = mesh(new THREE.BoxGeometry(0.15, 0.01, 0.05), metal, g); bl.position.x = 0.07; bl.rotation.x = 0.4; }
          const noz = mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.18, 20, 1, true), metal, j); noz.position.y = -0.53;
          const ring = mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 20), glow, j); ring.rotation.x = Math.PI / 2; ring.position.y = -0.6;
          const fl = mesh(new THREE.ConeGeometry(0.14, 0.9, 16, 1, true), flameMat, j); fl.position.y = -1.06; fl.rotation.x = Math.PI;
          (parts.flames ||= []).push(fl);
        }
      } else if (opts.back === 'solar') {
        // two folding panels of cells on struts, tilting to the light
        const cell = own(new THREE.MeshStandardMaterial({ color: '#16264a', roughness: 0.2, metalness: 0.7, emissive: '#0b1a3a', emissiveIntensity: 0.4 }));
        mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), metal, anchor).rotation.z = Math.PI / 2;
        parts.panels = [];
        for (const sx of [-1, 1]) {
          const pg = new THREE.Group(); anchor.add(pg); pg.position.x = sx * 0.25; parts.panels.push({ pg, sx });
          const arm = mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), metal, pg); arm.position.x = sx * 0.25;
          const pane = new THREE.Group(); pg.add(pane); pane.position.set(sx * 0.95, 0.15, -0.1);
          mesh(new THREE.BoxGeometry(1.0, 0.7, 0.03), metal, pane);
          for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(0.22, 0.2, 0.02), cell, pane).position.set(-0.36 + i * 0.24, -0.22 + k * 0.22, -0.015);
          const edge = mesh(new THREE.BoxGeometry(1.0, 0.025, 0.035), glow, pane); edge.position.y = 0.36;
          pane.rotation.y = sx * 0.2;
        }
      } else {
        // butterfly: four soft lobes with a lit vein pattern; dragon: a finger-boned wing with webbing
        const dragon = opts.back === 'dragon';
        const memb = own(new THREE.MeshStandardMaterial({ color: dragon ? GLOW.clone().multiplyScalar(0.25).lerp(new THREE.Color('#2a1416'), 0.6) : GLOW.clone().lerp(new THREE.Color('#ffffff'), 0.45), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide, transparent: !dragon, opacity: dragon ? 1 : 0.8, emissive: GLOW, emissiveIntensity: dragon ? 0.08 : 0.25 }));
        parts.wings = [];
        for (const sx of [-1, 1]) {
          const w = new THREE.Group(); anchor.add(w); w.position.set(sx * 0.15, 0.1, -0.12); w.rotation.y = -sx * 0.3; parts.wings.push({ w, s: sx });
          if (!dragon) {
            for (const [ox, oy, sc2, rz] of [[0.75, 0.35, 0.85, 0.35], [0.55, -0.35, 0.55, -0.5]]) {
              const lobe = mesh(new THREE.CircleGeometry(0.5, 28), memb, w); lobe.scale.set(sx * sc2 * 1.2, sc2, 1); lobe.position.set(sx * ox, oy, 0); lobe.rotation.z = sx * rz;
              const vein = mesh(new THREE.RingGeometry(0.34, 0.38, 28), glow, w); vein.scale.set(sx * sc2 * 1.2, sc2, 1); vein.position.set(sx * ox, oy, 0.005); vein.rotation.z = sx * rz;
              const dot = mesh(new THREE.CircleGeometry(0.09, 16), glow, w); dot.position.set(sx * (ox + 0.1), oy + 0.05, 0.006);
            }
          } else {
            const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0.6, 0.75); shape.lineTo(1.5, 0.95);
            shape.quadraticCurveTo(1.25, 0.45, 1.45, 0.05); shape.quadraticCurveTo(1.05, 0.2, 1.0, -0.3); shape.quadraticCurveTo(0.7, -0.05, 0.5, -0.5); shape.quadraticCurveTo(0.3, -0.1, 0, -0.15);
            const wm = mesh(new THREE.ShapeGeometry(shape, 10), memb, w); wm.scale.x = sx;
            for (const [x1, y1] of [[0.6, 0.75], [1.5, 0.95], [1.45, 0.05], [1.0, -0.3], [0.5, -0.5]]) {
              const len = Math.hypot(x1, y1), b = mesh(new THREE.CylinderGeometry(0.02, 0.035, len, 6), shell2, w);
              b.position.set(sx * x1 / 2, y1 / 2, 0.01); b.rotation.z = Math.atan2(y1, sx * x1) - Math.PI / 2;
            }
            const claw = mesh(new THREE.ConeGeometry(0.04, 0.14, 6), shell2, w); claw.position.set(sx * 0.62, 0.8, 0.01); claw.rotation.z = -sx * 0.6;
          }
        }
      }
    }

    // ---------- armour sets (28 Nov 2026) ----------
    // Gid: knight bots in our own designs, "a cape or skirt with armor". Each set is plate shoulders, a collar under
    // the face, an armoured skirt or a cape, and a crown or a crest, in a palette of its own. Original designs only.
    if (opts.armor && ARMOR[opts.armor]) {
      const A = ARMOR[opts.armor];
      const plate = own(new PM({ color: A.plate, roughness: A.rough ?? 0.28, metalness: A.metal ?? 0.9, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
      const inlay = own(new THREE.MeshStandardMaterial({ color: A.inlay, roughness: 0.5, metalness: 0.4 }));
      const trim = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(A.trim).multiplyScalar(1.8), toneMapped: false }));
      const cloth = own(new THREE.MeshStandardMaterial({ color: A.cloth, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
      const lining = own(new THREE.MeshStandardMaterial({ color: A.lining || A.cloth, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }));
      const S = { orbit: [1.0, 0.25, 1, -0.72], pixel: [1.02, 0.42, 0.95, -0.66], nova: [0.98, 0.18, 0.95, -0.7], kite: [0.95, 0.1, 0.95, -0.72], beep: [1.0, 0.2, 1, -0.7], raze: [1.12, -0.05, 1.1, -0.3] }[id] || [1, 0.2, 1, -0.7];
      const [px, py, R, cy] = S;   // shoulder x and y, body radius, collar height
      const arm = new THREE.Group(); body.add(arm); parts.armor = arm;
      // shoulders: a domed plate with a lame under it, edged in the trim
      for (const sx of [-1, 1]) {
        const sh = new THREE.Group(); arm.add(sh); sh.position.set(sx * px * 0.86, py - 0.12, -0.05); sh.rotation.z = -sx * 0.95;
        const big = A.shoulder || 1, ph = Math.PI * 0.38;
        for (let l = 0; l < 3; l++) {   // the top plate, then two lames lapping down the arm
          const r = 0.62 * big * (1 - l * 0.08), g3 = new THREE.Group(); sh.add(g3); g3.position.set(sx * l * 0.1, -l * 0.17, 0); g3.rotation.z = -sx * l * 0.12;
          const d = mesh(new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, ph), l ? inlay : plate, g3); d.scale.set(1, 0.6, 1.1);
          if (l) d.material = plate;
          if (l === 1) continue;
          const rim = mesh(new THREE.TorusGeometry(r * Math.sin(ph), 0.028, 6, 36), trim, g3); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.1, 1); rim.position.y = r * Math.cos(ph) * 0.6;
        }
        if (A.spikes) for (const k of [-1, 0, 1]) { const sp = mesh(new THREE.ConeGeometry(0.07, 0.42 - Math.abs(k) * 0.12, 6), inlay, sh); sp.position.set(0, 0.32 * big, k * 0.22); sp.rotation.x = k * 0.3; }
      }
      // the collar: a plate band below the face
      const col = mesh(new THREE.TorusGeometry(R * 0.78, 0.13, 10, 40), plate, arm); col.rotation.x = Math.PI / 2; col.position.y = cy; col.scale.z = 0.6;
      const colT = mesh(new THREE.TorusGeometry(R * 0.78, 0.03, 6, 40), trim, arm); colT.rotation.x = Math.PI / 2; colT.position.y = cy + 0.08;
      const gem = mesh(new THREE.OctahedronGeometry(0.11, 0), trim, arm); gem.position.set(0, cy + 0.02, R * 0.88); gem.scale.set(1, 1.3, 0.5);
      // the skirt: overlapping plates hanging round the body over a cloth layer, open at the front
      if (A.skirt && id !== 'raze') {
        const sk = new THREE.Group(); arm.add(sk); sk.position.y = cy - 0.05; parts.armorSkirt = [];
        const clothG = new THREE.CylinderGeometry(R * 0.8, R * 1.3, A.skirt, 48, 4, true, Math.PI * 0.6, Math.PI * 1.8);
        { const cp = clothG.attributes.position; for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i), y = cp.getY(i), a = Math.atan2(x, z), v = 0.5 - y / A.skirt, k = 1 + Math.sin(a * 16) * 0.07 * v; cp.setX(i, x * k); cp.setZ(i, z * k); } clothG.computeVertexNormals(); }
        const cl = mesh(clothG, cloth, sk); cl.position.y = -A.skirt / 2;
        const hem = mesh(new THREE.TorusGeometry(R * 1.3, 0.025, 6, 48, Math.PI * 1.8), trim, sk); hem.rotation.set(Math.PI / 2, 0, Math.PI * 0.6 - Math.PI / 2); hem.position.y = -A.skirt; hem.rotation.z = -Math.PI * 0.6 + Math.PI / 2 - Math.PI * 0.9 + Math.PI;
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = Math.PI * 0.68 + (i / (n - 1)) * Math.PI * 1.64, g2 = new THREE.Group(); sk.add(g2);
          g2.position.set(Math.sin(a) * R * 0.82, 0, Math.cos(a) * R * 0.82); g2.rotation.y = a;
          const pl = mesh(new THREE.BoxGeometry(0.44, A.skirt * 0.55, 0.05), plate, g2); pl.position.set(0, -A.skirt * 0.27, 0.06);
          const pt = mesh(new THREE.BoxGeometry(0.44, 0.03, 0.06), trim, g2); pt.position.set(0, -A.skirt * 0.55, 0.07);
          g2.rotation.x = 0.28; parts.armorSkirt.push(g2);
        }
      }
      // the cape: hangs from the shoulders down the back, lined in a second colour
      if (A.cape) {
        const cp = new THREE.Group(); arm.add(cp); cp.position.set(0, py + 0.05, -R * 0.55); parts.armorCape = cp;
        const W = px * 1.7, H = A.cape, geo = new THREE.PlaneGeometry(W, H, 16, 14), pos = geo.attributes.position, hemPts = [];
        const shape = (x, v) => {   // x across (-1..1), v down (0..1): where that point of the cape hangs
          const wide = 1 + v * 0.55, ax = x * wide * W / 2, wrap = 0.75 - v * 0.25;
          const ang = x * wrap * 1.3, rr = R * 0.95 + v * 0.25;
          return [Math.sin(ang) * rr * (0.6 + 0.4 * wide), -v * H, -Math.cos(ang) * rr * 0.55 + R * 0.55 - v * 0.55 + Math.sin(x * 9 + v * 4) * 0.05 * v - Math.abs(ax) * 0];
        };
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) / (W / 2), v = (H / 2 - pos.getY(i)) / H;
          let [X, Y, Z] = shape(x, v);
          if (A.ragged && v > 0.97) Y += ((i * 37) % 7) / 7 * 0.28;
          pos.setXYZ(i, X, Y, Z);
        }
        geo.computeVertexNormals();
        for (let k = 0; k <= 24; k++) { const [X, Y, Z] = shape(k / 12 - 1, 1); hemPts.push(new V(X, Y, Z)); }
        mesh(geo, cloth, cp);
        const inner = mesh(geo.clone(), lining, cp); inner.position.z = 0.02; inner.scale.set(0.97, 0.99, 0.97);
        const hemMat = A.hem ? own(new THREE.MeshBasicMaterial({ color: new THREE.Color(A.hem).multiplyScalar(A.ragged ? 1.8 : 1.1), toneMapped: !!A.ragged ? false : true })) : trim;
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemPts), 48, 0.035, 6), hemMat, cp);
        for (const sx of [-1, 1]) { const cl = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 6), plate, cp); cl.rotation.x = Math.PI / 2; const [X, , Z] = shape(sx * 0.95, 0); cl.position.set(X, -0.02, Z + 0.04); const g4 = mesh(new THREE.OctahedronGeometry(0.06, 0), trim, cp); g4.position.set(X, -0.02, Z + 0.09); }
      }
      // the head: a crown of points, or a pair of swept horns
      const T = { orbit: [0.97, 0], pixel: [0.68, -0.05], nova: [0.9, -0.05], kite: [sig ? 1.15 : 1.32, sig ? -0.1 : -0.42], beep: [0.88, 0.02], raze: [0.78, 0] }[id] || [1, 0];
      if (A.crown) {
        const cr = new THREE.Group(); arm.add(cr); cr.position.set(0, T[0] - 0.08, T[1]);
        const cw = id === 'kite' ? 0.32 : 0.55;
        const band = mesh(new THREE.CylinderGeometry(cw, cw * 1.08, 0.22, 32, 1, true), plate, cr);
        for (const y of [-0.11, 0.11]) { const rr = mesh(new THREE.TorusGeometry(cw * (y < 0 ? 1.08 : 1), 0.03, 6, 40), trim, cr); rr.rotation.x = Math.PI / 2; rr.position.y = y; }
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + Math.PI / 2, h = i === 0 ? 0.55 : 0.34 + (i % 2) * 0.08;
          const pt = mesh(new THREE.ConeGeometry(0.11, h, 4), plate, cr); pt.position.set(Math.cos(a) * cw, 0.11 + h / 2, Math.sin(a) * cw); pt.rotation.y = -a;
          const tip = mesh(new THREE.OctahedronGeometry(0.06, 0), trim, cr); tip.position.set(Math.cos(a) * cw, 0.14 + h, Math.sin(a) * cw);
        }
      }
      if (A.horns) {
        for (const sx of [-1, 1]) {
          const hg = new THREE.Group(); arm.add(hg); hg.position.set(sx * 0.5, T[0] - 0.25, T[1] + 0.1); hg.rotation.set(0.15, 0, -sx * 0.55); hg.scale.setScalar(1.7);
          const curve = new THREE.CatmullRomCurve3([new V(0, 0, 0), new V(sx * 0.12, 0.3, -0.02), new V(sx * 0.1, 0.62, -0.18), new V(-sx * 0.02, 0.85, -0.45)]);
          const tube = new THREE.TubeGeometry(curve, 24, 1, 10), tp = tube.attributes.position;
          for (let i = 0; i < tp.count; i++) {   // taper the tube from 0.16 at the root to a point
            const seg = Math.floor(i / 11) / 24, p0 = curve.getPoint(seg), k = 0.16 * (1 - seg * 0.92);
            tp.setXYZ(i, p0.x + (tp.getX(i) - p0.x) * k, p0.y + (tp.getY(i) - p0.y) * k, p0.z + (tp.getZ(i) - p0.z) * k);
          }
          tube.computeVertexNormals(); mesh(tube, plate, hg);
          for (const sg of [0.3, 0.55]) { const p0 = curve.getPoint(sg), rg = mesh(new THREE.TorusGeometry(0.16 * (1 - sg * 0.92) + 0.01, 0.018, 6, 20), trim, hg); rg.position.copy(p0); rg.lookAt(hg.localToWorld(curve.getPoint(sg + 0.02).clone())); }
        }
      }
      if (A.crest) {   // a tall fin of plate along the top, edged in trim
        const cg = new THREE.Group(); arm.add(cg); cg.position.set(0, T[0] - 0.05, T[1] - 0.05);
        const sh = new THREE.Shape(); sh.moveTo(-0.45, 0); sh.quadraticCurveTo(-0.3, 0.55, 0.35, 0.62); sh.lineTo(0.5, 0.05); sh.lineTo(-0.45, 0);
        const fin = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }), plate, cg); fin.rotation.y = Math.PI / 2; fin.position.x = -0.025;
        const edge = mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new V(0, 0, 0.45), new V(0, 0.55, 0.3), new V(0, 0.62, -0.35)), 16, 0.025, 6), trim, cg);
      }
      if (A.cracks) parts.armorGlow = trim;
    }

    // ---------- arm attachment (28 Nov 2026): a tool on the bot's left side, pointing ahead ----------
    const ARM = { orbit: [-0.95, -0.5, 0.25], pixel: [-1.08, -0.15, 0.1], nova: [-1.0, -0.25, 0.15], kite: [-0.95, -0.35, 0.15], beep: [-1.12, -0.2, 0.1], raze: [-1.2, -0.05, 0.3] };
    if (opts.arm && opts.arm !== 'none') {
      const mount = new THREE.Group(); body.add(mount); mount.position.set(...(ARM[id] || [-1, -0.2, 0.1])); parts.arm = mount;
      mesh(new THREE.SphereGeometry(0.13, 16, 10), metal, mount);
      const strut = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 10), dark, mount); strut.rotation.z = Math.PI / 2; strut.position.x = 0.12;
      const tool = new THREE.Group(); mount.add(tool); tool.position.set(-0.08, 0, 0); parts.tool = tool;
      const k = opts.arm, Z90 = [Math.PI / 2, 0, 0];
      const at = (m, x, y, z, r) => { m.position.set(x, y, z); if (r) m.rotation.set(...r); return m; };
      if (k === 'blaster') {
        at(mesh(rbox(0.24, 0.26, 0.6, 0.06), shell2, tool), 0, 0, 0.12);
        at(mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.38, 14), metal, tool), 0, 0.03, 0.58, Z90);
        at(mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 16), glow, tool), 0, 0.03, 0.78);
        at(mesh(new THREE.BoxGeometry(0.02, 0.06, 0.4), glow, tool), -0.125, 0, 0.1);
        at(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.2), dark, tool), 0, -0.17, 0.02);
        parts.muzzle = new V(0, 0.03, 0.8);
      } else if (k === 'shield') {
        const sh = at(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 6), shell2, tool), -0.08, 0, 0.15, [0, 0, Math.PI / 2]);
        sh.rotation.order = 'ZYX'; sh.rotation.y = Math.PI / 6;
        const rim = at(mesh(new THREE.TorusGeometry(0.5, 0.025, 4, 6), glow, tool), -0.12, 0, 0.15, [0, Math.PI / 2, 0]); rim.rotation.order = 'YXZ'; rim.rotation.z = Math.PI / 6;
        const core = at(mesh(new THREE.TorusGeometry(0.2, 0.03, 4, 6), glowSoft, tool), -0.12, 0, 0.15, [0, Math.PI / 2, 0]); core.rotation.order = 'YXZ'; core.rotation.z = Math.PI / 6;
        parts.shieldCore = core;
      } else if (k === 'claw') {
        at(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 14), shell2, tool), 0, 0, 0.12, Z90);
        at(mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 18), glow, tool), 0, 0, 0.27);
        parts.fingers = [];
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * Math.PI * 2, f = new THREE.Group(); tool.add(f); f.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.28); f.rotation.set(-Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0);
          at(mesh(new THREE.ConeGeometry(0.045, 0.32, 6), metal, f), 0, 0, 0.16, Z90);
          parts.fingers.push({ f, a });
        }
      } else if (k === 'drill') {
        at(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 16), shell2, tool), 0, 0, 0.05, Z90);
        at(mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 20), glow, tool), 0, 0, 0.16);
        const bit = new THREE.Group(); tool.add(bit); bit.position.z = 0.18; parts.bit = bit;
        at(mesh(new THREE.ConeGeometry(0.13, 0.55, 16), metal, bit), 0, 0, 0.27, Z90);
        const pts = []; for (let i = 0; i <= 30; i++) { const u = i / 30, r = 0.13 * (1 - u) + 0.01, a = u * Math.PI * 6; pts.push(new V(Math.cos(a) * r, Math.sin(a) * r, u * 0.52)); }
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.018, 4), shell, bit);
      } else if (k === 'saber') {
        at(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.32, 12), metal, tool), 0, 0, 0.1, Z90);
        at(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), dark, tool), 0, 0, 0.26, Z90);
        const blade = new THREE.Group(); tool.add(blade); blade.position.z = 0.28; parts.blade = blade;
        at(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 10), own(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), toneMapped: false })), blade), 0, 0, 0.65, Z90);
        at(mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.36, 12), own(new THREE.MeshBasicMaterial({ color: hdr(1.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), blade), 0, 0, 0.66, Z90);
        tool.rotation.x = 0.35;
      } else if (k === 'cannon') {
        at(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.75, 20), shell2, tool), 0, 0.05, 0.25, Z90);
        for (const z of [0.05, 0.3, 0.55]) at(mesh(new THREE.TorusGeometry(0.215, 0.025, 6, 22), z === 0.55 ? glow : metal, tool), 0, 0.05, z);
        at(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 18), dark, tool), 0, 0.05, 0.63, Z90);
        at(mesh(new THREE.CircleGeometry(0.1, 18), glowSoft, tool), 0, 0.05, 0.66);
        at(mesh(rbox(0.2, 0.14, 0.3, 0.04), dark, tool), 0, 0.26, 0.1);
        parts.muzzle = new V(0, 0.05, 0.68);
      }
    }

    // ---------- the top slot (bought): something on the bot's head ----------
    // where the top of each head is, and how wide it is there
    const TOP = { orbit: [0, 0.97, 0, 0.85], pixel: [0, 0.68, -0.05, 0.9], nova: [0, 0.9, -0.05, 0.8], kite: [0, sig ? 1.15 : 1.32, sig ? -0.1 : -0.42, 0.7], beep: [0, 0.88, 0.02, 0.7], raze: [0, 0.78, 0, 0.9] };
    if (opts.top && opts.top !== 'none') {
      // on Kite a hat replaces its own straw hat, so two hats never stack
      if (id === 'kite' && !sig && ['cap', 'party', 'propeller', 'crown', 'wizard', 'chef', 'beanie', 'cat', 'horns'].includes(opts.top) && parts.hat) { parts.hat.visible = false; TOP.kite = [0, 0.86, 0, 0.78]; }
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
        // one smooth felt cone whose top flops over to the side, on a wide brim that droops at the edge
        const m = own(new THREE.MeshStandardMaterial({ color: '#3b2bff', roughness: 0.85, side: THREE.DoubleSide }));
        const brimG = new THREE.RingGeometry(tw * 0.4, tw * 1.0, 48, 4); brimG.rotateX(-Math.PI / 2);
        const bp = brimG.attributes.position;
        for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z), f = (r - tw * 0.4) / (tw * 0.6); bp.setY(i, -0.07 * f * f + 0.015 * f * Math.sin(Math.atan2(z, x) * 5)); }
        brimG.computeVertexNormals();
        mesh(brimG, m, top).position.y = -0.03;
        const H = 0.95, pts = [];
        for (let i = 0; i <= 20; i++) { const t2 = i / 20; pts.push(new THREE.Vector2(Math.max(0.004, tw * 0.44 * Math.pow(1 - t2, 0.85)), t2 * H)); }
        const coneG = new THREE.LatheGeometry(pts, 40), cp = coneG.attributes.position;
        for (let i = 0; i < cp.count; i++) { const f = Math.pow(cp.getY(i) / H, 2.4); cp.setX(i, cp.getX(i) - 0.32 * f); cp.setY(i, cp.getY(i) - 0.12 * f); cp.setZ(i, cp.getZ(i) - 0.08 * f); }
        coneG.computeVertexNormals();
        const hat = new THREE.Group(); top.add(hat); parts.hatTip = hat;
        mesh(coneG, m, hat).position.y = -0.03;
        const band = mesh(new THREE.TorusGeometry(tw * 0.43, 0.035, 8, 40), own(new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.35, metalness: 0.8 })), hat); band.rotation.x = Math.PI / 2; band.position.y = 0.04;
        const gold = own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23d').multiplyScalar(1.5), toneMapped: false }));
        for (const [y, a, s2] of [[0.3, 0.3, 0.07], [0.52, -0.6, 0.05], [0.18, -1.3, 0.045]]) {
          const f = Math.pow(y / H, 2.4), r = tw * 0.44 * Math.pow(1 - y / H, 0.85);
          const st = mesh(new THREE.OctahedronGeometry(s2), gold, hat); st.scale.z = 0.4;
          st.position.set(Math.sin(a) * r - 0.32 * f, y - 0.12 * f, Math.cos(a) * r - 0.08 * f); st.rotation.y = a;
        }
      } else if (k === 'halo') {
        const h = new THREE.Group(); top.add(h); h.position.y = 0.32; parts.goldHalo = h;
        const r = mesh(new THREE.TorusGeometry(tw * 0.55, 0.045, 10, 40), own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23d').multiplyScalar(1.5), toneMapped: false })), h); r.rotation.x = Math.PI / 2 - 0.45;
      } else if (k === 'crown') {
        const g = own(new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.2, metalness: 1 }));
        const r = tw * 0.5;
        const ringM = mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.2, 24, 1, true), g, top); ringM.position.y = 0.0; ringM.material.side = THREE.DoubleSide;
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.08, 0.24, 4), g, top); sp.position.set(Math.sin(a) * r, 0.2, Math.cos(a) * r); const gem = mesh(new THREE.SphereGeometry(0.045, 8, 6), glow, top); gem.position.set(Math.sin(a) * r * 1.02, 0.0, Math.cos(a) * r * 1.02); }
      } else if (k === 'twinant') {
        // two thin masts, each with a lit tip that sways on its own
        parts.ants = [];
        for (const sx of [-1, 1]) {
          const a = new THREE.Group(); top.add(a); a.position.x = sx * tw * 0.32; a.rotation.z = -sx * 0.25; parts.ants.push({ a, sx });
          mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.14, 10), metal, a).position.y = 0.0;
          const st = mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.62, 8), metal, a); st.position.y = 0.36;
          mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 14), dark, a).position.y = 0.3;
          mesh(new THREE.SphereGeometry(0.075, 12, 8), glow, a).position.y = 0.7;
          const r = mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20), glowSoft, a); r.position.y = 0.7; r.rotation.x = Math.PI / 2;
        }
      } else if (k === 'mohawk') {
        // a row of swept fins from the brow to the back of the head, lit along the edge
        const m = mat(GLOW.clone().lerp(new THREE.Color('#1a1a1a'), 0.5));
        for (let i = 0; i < 5; i++) {
          const f = mesh(new THREE.ConeGeometry(0.16, 0.5 - Math.abs(i - 1.5) * 0.06, 4), m, top); f.scale.z = 0.25; f.rotation.set(0, Math.PI / 2, 0.5);
          f.position.set(0, 0.12 - i * 0.03, 0.3 - i * 0.17); f.rotation.x = -0.5 - i * 0.12;
          const e = mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), glow, top); e.position.set(0, 0.18 - i * 0.03, 0.34 - i * 0.17); e.rotation.x = -0.9 - i * 0.12;
        }
      } else if (k === 'dish') {
        const mast = mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.3, 10), metal, top); mast.position.y = 0.1;
        const d = new THREE.Group(); top.add(d); d.position.y = 0.28; parts.dish = d;
        const bowl = mesh(new THREE.SphereGeometry(0.36, 24, 10, 0, Math.PI * 2, 0, 1.05), shell2, d); bowl.material.side = THREE.DoubleSide; bowl.rotation.x = -1.1; bowl.position.z = 0.05;
        const feed = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), dark, d); feed.rotation.x = 0.45; feed.position.set(0, 0.12, 0.12);
        mesh(new THREE.SphereGeometry(0.04, 8, 6), glow, d).position.set(0, 0.25, 0.2);
      } else if (k === 'tophat') {
        const m = own(new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.55, metalness: 0.1 }));
        top.rotation.z = -0.12;
        const brim = mesh(new THREE.CylinderGeometry(tw * 0.62, tw * 0.62, 0.04, 32), m, top); brim.position.y = -0.04; brim.scale.z = 0.9;
        mesh(new THREE.CylinderGeometry(tw * 0.38, tw * 0.4, 0.62, 32), m, top).position.y = 0.28;
        const band = mesh(new THREE.CylinderGeometry(tw * 0.405, tw * 0.405, 0.09, 32, 1, true), glow, top); band.position.y = 0.04;
        mesh(new THREE.CylinderGeometry(tw * 0.38, tw * 0.38, 0.01, 32), m, top).position.y = 0.59;
      } else if (k === 'unicorn') {
        // a spiral horn: a cone with a lit ribbon wound round it
        top.position.z += tw * 0.25; top.rotation.x = 0.35;
        const pearl = own(new THREE.MeshStandardMaterial({ color: '#fbf3ff', roughness: 0.25, metalness: 0.2, emissive: '#ffd9fb', emissiveIntensity: 0.15 }));
        mesh(new THREE.ConeGeometry(0.13, 0.75, 20), pearl, top).position.y = 0.36;
        const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40, r = 0.135 * (1 - u) + 0.005, a = u * Math.PI * 8; pts.push(new V(Math.cos(a) * r, u * 0.74, Math.sin(a) * r)); }
        const rib = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.012, 4), glow, top); rib.position.y = -0.01;
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
      const all = []; body.traverseVisible(o => { if (o.isMesh) all.push(o); });   // a hidden part (Kite's hat under a bought hat) takes no stickers
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

    // ---------- particles (28 Nov 2026): the bought trail, emote hearts, victory fireworks, muzzle flashes ----------
    // One small point cloud per bot, drawn in world space so what it leaves behind stays where it was left.
    const PT = { TN: 90 };
    if (!opts.lite) {
      const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 128; const g2 = cv2.getContext('2d');
      const cell = (i, fn) => { g2.save(); g2.translate((i % 2) * 64 + 32, Math.floor(i / 2) * 64 + 32); fn(); g2.restore(); };
      cell(0, () => { const r = g2.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = r; g2.fillRect(-32, -32, 64, 64); });
      cell(1, () => { g2.fillStyle = '#fff'; g2.shadowColor = '#fff'; g2.shadowBlur = 8; g2.fillRect(-14, -14, 28, 28); });
      cell(2, () => { g2.fillStyle = '#fff'; g2.shadowColor = '#fff'; g2.shadowBlur = 8; g2.beginPath(); g2.moveTo(0, 22); g2.bezierCurveTo(-30, 2, -18, -24, 0, -10); g2.bezierCurveTo(18, -24, 30, 2, 0, 22); g2.fill(); });
      cell(3, () => { g2.fillStyle = '#fff'; g2.shadowColor = '#fff'; g2.shadowBlur = 10; g2.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 6 : 28; g2.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g2.fill(); });
      const tex2 = own(new THREE.CanvasTexture(cv2));
      const N = PT.TN;
      Object.assign(PT, { pos: new Float32Array(N * 3), col: new Float32Array(N * 4), base: new Float32Array(N * 3), size: new Float32Array(N), s0: new Float32Array(N), gly: new Float32Array(N), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grav: new Float32Array(N), i: 0, acc: 0, alive: 0 });
      for (let i = 0; i < N; i++) PT.pos[i * 3 + 1] = -999;
      const geo = own(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(PT.pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aCol', new THREE.BufferAttribute(PT.col, 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSize', new THREE.BufferAttribute(PT.size, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aGly', new THREE.BufferAttribute(PT.gly, 1).setUsage(THREE.DynamicDrawUsage));
      const pm = own(new THREE.ShaderMaterial({
        uniforms: { uTex: { value: tex2 } },
        vertexShader: `attribute vec4 aCol; attribute float aSize; attribute float aGly; varying vec4 vC; varying float vG;
          void main(){ vC = aCol; vG = aGly; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * 2000.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uTex; varying vec4 vC; varying float vG;
          void main(){ vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y); float cx = mod(vG, 2.0), cy = floor(vG / 2.0);
            vec4 t = texture2D(uTex, vec2((uv.x + cx) / 2.0, (uv.y + 1.0 - cy) / 2.0)); float a = t.a * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb * a, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const pts = new THREE.Points(geo, pm);
      pts.frustumCulled = false; pts.matrixAutoUpdate = false; pts.matrixWorldAutoUpdate = false; pts.visible = false; pts.renderOrder = 6;
      group.add(pts); PT.pts = pts; PT.geo = geo;
    }
    const _pc = new THREE.Color(), _pe = new V();
    // one particle at world point p
    function pspawn(p, vx, vy, vz, col, size, life, gly = 0, grav = 0) {
      if (!PT.pts) return;
      const i = PT.i = (PT.i + 1) % PT.TN, j = i * 3;
      PT.pos[j] = p.x; PT.pos[j + 1] = p.y; PT.pos[j + 2] = p.z; PT.vel[j] = vx; PT.vel[j + 1] = vy; PT.vel[j + 2] = vz;
      PT.base[j] = col.r; PT.base[j + 1] = col.g; PT.base[j + 2] = col.b; PT.s0[i] = size; PT.life[i] = life; PT.max[i] = life; PT.gly[i] = gly; PT.grav[i] = grav;
    }
    const HEART = new THREE.Color(3, 0.9, 1.6), FLAME_HOT = new THREE.Color(3, 2.4, 1.2), FLAME_END = new THREE.Color(2.2, 0.5, 0.15), WHITE3 = new THREE.Color(2.5, 2.5, 2.5);
    const TRAIL = opts.trail && opts.trail !== 'none' ? opts.trail : null;
    // where the trail leaves the bot: under and behind it, in the body's own space
    const TRAIL_AT = new V(0, id === 'raze' ? -0.4 : -0.9, -0.35);
    function particles(t, dt, speed) {
      if (!PT.pts) return;
      if (TRAIL) {
        PT.acc += dt * (TRAIL === 'ribbon' ? 70 : TRAIL === 'hearts' ? 9 : TRAIL === 'stars' ? 16 : 34) * (1 + Math.min(2, speed * 0.25));
        if (PT.acc >= 1) { body.updateWorldMatrix(true, false); }
        while (PT.acc >= 1) {
          PT.acc -= 1;
          _pe.copy(TRAIL_AT).applyMatrix4(body.matrixWorld);
          const j = (a) => (Math.random() - 0.5) * a;
          if (TRAIL === 'spark') pspawn(_pe, j(1.2), -0.6 + j(0.6), j(1.2), hdr(2), 0.07 + Math.random() * 0.05, 0.7, 0, 1.5);
          else if (TRAIL === 'pixels') pspawn(_pe.set(_pe.x + j(0.3), _pe.y, _pe.z + j(0.3)), j(0.3), -0.4, j(0.3), hdr(1.8), 0.09, 1.0, 1, 0.6);
          else if (TRAIL === 'ribbon') pspawn(_pe, j(0.05), -0.15, j(0.05), hdr(1.6), 0.13, 0.75, 0);
          else if (TRAIL === 'hearts') pspawn(_pe, j(0.5), 0.5 + j(0.3), j(0.5), HEART, 0.2, 1.4, 2, -0.2);
          else if (TRAIL === 'flame') pspawn(_pe.set(_pe.x + j(0.2), _pe.y, _pe.z + j(0.2)), j(0.5), -2.4 + j(0.5), j(0.5), FLAME_HOT, 0.2, 0.7, 0, -1.5);
          else if (TRAIL === 'stars') pspawn(_pe.set(_pe.x + j(0.5), _pe.y + j(0.3), _pe.z + j(0.5)), j(0.2), -0.2, j(0.2), _pc.copy(WHITE3).lerp(GLOW, 0.4), 0.16, 1.2, 3);
        }
      }
      let alive = 0;
      const P = PT, k = Math.exp(-dt * 1.6);
      for (let i = 0; i < P.TN; i++) {
        if (P.life[i] <= 0) continue;
        P.life[i] -= dt;
        const j = i * 3;
        if (P.life[i] <= 0) { P.pos[j + 1] = -999; P.size[i] = 0; continue; }
        alive++;
        P.vel[j] *= k; P.vel[j + 1] = P.vel[j + 1] * k - P.grav[i] * dt; P.vel[j + 2] *= k;
        P.pos[j] += P.vel[j] * dt; P.pos[j + 1] += P.vel[j + 1] * dt; P.pos[j + 2] += P.vel[j + 2] * dt;
        const u = P.life[i] / P.max[i];
        let r = P.base[j], g = P.base[j + 1], b = P.base[j + 2];
        if (TRAIL === 'flame' && P.gly[i] === 0 && P.grav[i] < 0) { _pc.copy(FLAME_END).lerp(FLAME_HOT, u); r = _pc.r; g = _pc.g; b = _pc.b; }
        P.col[i * 4] = r; P.col[i * 4 + 1] = g; P.col[i * 4 + 2] = b; P.col[i * 4 + 3] = Math.min(1, u * 1.6);
        P.size[i] = P.s0[i] * (P.gly[i] === 3 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 9 + i)) : P.gly[i] === 0 && TRAIL === 'flame' ? 0.6 + 0.8 * u : 0.5 + 0.5 * u);
      }
      P.alive = alive; P.pts.visible = alive > 0;
      if (alive || P.dirty) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aCol.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aGly.needsUpdate = true; }
      P.dirty = alive > 0;
    }
    // a burst of particles from a point in the body's own space
    function pburst(local, n, speed, col, size, life, gly = 0, grav = 0) {
      if (!PT.pts) return;
      body.updateWorldMatrix(true, false);
      for (let i = 0; i < n; i++) {
        _pe.copy(local).applyMatrix4(body.matrixWorld);
        const a = Math.random() * 6.28, e = Math.random() * 2 - 1, r = Math.sqrt(1 - e * e), sp = speed * (0.4 + Math.random() * 0.6);
        pspawn(_pe, Math.cos(a) * r * sp, e * sp + speed * 0.3, Math.sin(a) * r * sp, col, size, life * (0.7 + Math.random() * 0.5), gly, grav);
      }
    }

    // ---------- emotes, a shot from the arm, and the victory pose ----------
    let emoteK = '', emoteAt = -1e9, fireAt = -1e9;
    const EMOTE_LEN = { wave: 1.4, laugh: 1.3, spin: 1.1, heart: 1.6, dance: 2.0, flip: 1.0 };
    const EMOTE_FACE = { wave: 'happy', laugh: 'happy', spin: 'happy', heart: 'heart', dance: 'happy', flip: 'happy' };
    function emote(kind, t) {
      emoteK = EMOTE_LEN[kind] ? kind : EMOTE_LEN[opts.emote] ? opts.emote : 'wave'; emoteAt = t;
      if (emoteK === 'heart') pburst(new V(0, 0.8, 0.6), 12, 1.6, HEART, 0.22, 1.4, 2, -0.3);
    }
    function fire(t) {
      fireAt = t;
      if (parts.arm && parts.muzzle) { const m = parts.muzzle.clone(); parts.tool.localToWorld(m); body.worldToLocal(m); pburst(m, 10, 3, WHITE3, 0.12, 0.3, 0, 0); pburst(m, 6, 2, hdr(2), 0.2, 0.25, 3, 0); }
    }
    function cheer(t, kind) {   // one moment of the victory pose: fireworks pop now and then
      if (kind === 'fireworks' && Math.random() < 0.05) { const c = new THREE.Color().setHSL(Math.random(), 1, 0.6).multiplyScalar(2.5); pburst(new V((Math.random() - 0.5) * 3, 2.5 + Math.random(), (Math.random() - 0.5) * 2), 16, 3, c, 0.13, 0.9, Math.random() < 0.5 ? 3 : 0, 2); }
    }

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
      if (parts.armorCape) parts.armorCape.rotation.x = 0.08 + Math.sin(t * 2.1 + seed) * 0.05 + Math.max(0, lean.x) * 1.3;
      if (parts.armorSkirt) parts.armorSkirt.forEach((g, i) => { g.rotation.x = 0.28 + Math.sin(t * 2.6 + i * 0.7 + seed) * 0.04 + Math.abs(lean.x) * 0.5; });
      if (parts.armorGlow) parts.armorGlow.color.copy(_hc.set('#ff6a1f').multiplyScalar(1.4 + 0.5 * Math.sin(t * 3.1 + seed) * Math.sin(t * 1.3)));
      if (parts.flames) parts.flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 30 + i * 2) * 0.2 + Math.abs(lean.x) * 1.5; });
      // 28 Nov 2026: the glow breathes, the status lights blink, the exhaust flickers, the new parts move
      const breath = 1 + 0.12 * Math.sin(t * 1.7 + seed);
      if (!hurt) glow.color.copy(hdr(1.6 * breath));
      led.color.copy(hdr((Math.sin(t * 2.6 + seed) > 0.2 ? 2.4 : 0.5)));
      if (parts.exhaust) { const kx = 0.85 + 0.18 * Math.sin(t * 37 + seed) + 0.1 * Math.sin(t * 23) + Math.min(1.2, Math.abs(lean.x) * 2.5); parts.exhaust.scale.set(1, kx, 1); parts.exMat.color.copy(hdr(1.1 * breath)); parts.exMat.opacity = 0.32 + 0.1 * Math.sin(t * 41); }
      if (parts.ants) parts.ants.forEach(({ a, sx }, i) => { a.rotation.z = -sx * 0.25 + Math.sin(t * 3.4 + i * 1.7 + seed) * 0.08 - lean.z * 0.6; a.rotation.x = lean.x * 0.6; });
      if (parts.dish) parts.dish.rotation.y = t * 1.3;
      if (parts.fans) parts.fans.forEach((f, i) => { f.rotation.y = t * (i ? 22 : -22); });
      if (parts.panels) parts.panels.forEach(({ pg, sx }) => { pg.rotation.x = Math.sin(t * 0.8 + seed) * 0.15; pg.rotation.z = sx * Math.sin(t * 1.1) * 0.05; });
      if (parts.bit) parts.bit.rotation.z = t * 18;
      if (parts.blade) parts.blade.scale.set(1 + Math.sin(t * 47) * 0.06, 1 + Math.sin(t * 47) * 0.06, 1);
      if (parts.shieldCore) parts.shieldCore.material.opacity = 0.4 + 0.25 * Math.sin(t * 3 + seed);
      if (parts.fingers) parts.fingers.forEach(({ f, a }) => { const open = 0.45 + 0.15 * Math.sin(t * 2 + seed); f.rotation.set(-Math.sin(a) * open, Math.cos(a) * open, 0); });
      if (parts.arm) {
        const fu = t - fireAt, rec = fu >= 0 && fu < 0.3 ? Math.sin(Math.min(1, fu / 0.05) * Math.PI / 2) * (1 - fu / 0.3) : 0;
        parts.arm.rotation.set(-0.1 + Math.sin(t * 1.9 + seed) * 0.06 - lean.x * 0.5 - rec * 0.3, 0, 0);
        parts.tool.position.z = -rec * 0.18;
      }
      // an emote takes over the body for its length
      const eu = (t - emoteAt) / (EMOTE_LEN[emoteK] || 1);
      if (eu >= 0 && eu < 1 && !hurt) {
        const w = Math.sin(Math.min(1, eu * 6) * Math.PI / 2) * Math.sin(Math.min(1, (1 - eu) * 6) * Math.PI / 2);
        if (emoteK === 'wave') { body.rotation.z += Math.sin(eu * Math.PI * 5) * 0.35 * w; body.position.y += 0.1 * w; if (parts.arm) parts.arm.rotation.x -= Math.abs(Math.sin(eu * Math.PI * 5)) * 0.8 * w; }
        else if (emoteK === 'laugh') { body.position.y += Math.abs(Math.sin(eu * 40)) * 0.08 * w; body.rotation.x -= 0.25 * w; }
        else if (emoteK === 'spin') { body.rotation.y += (1 - Math.pow(1 - eu, 3)) * Math.PI * 2; body.position.y += Math.sin(eu * Math.PI) * 0.4; }
        else if (emoteK === 'heart') { body.rotation.z += Math.sin(eu * Math.PI * 2) * 0.15 * w; body.position.y += Math.sin(eu * Math.PI) * 0.25; }
        else if (emoteK === 'dance') { const b = eu * Math.PI * 8; body.position.y += Math.abs(Math.sin(b)) * 0.3 * w; body.rotation.z += Math.sin(b) * 0.25 * w; body.rotation.y += Math.sin(b / 2) * 0.6 * w; }
        else if (emoteK === 'flip') { const fu2 = Math.min(1, Math.max(0, (eu - 0.15) / 0.7)); body.rotation.x -= (fu2 * fu2 * (3 - 2 * fu2)) * Math.PI * 2; body.position.y += Math.sin(eu * Math.PI) * 0.9; }
        if (!o.face) face(EMOTE_FACE[emoteK] || 'happy');
      }
      const sp = o.vel ? o.vel.length() : 0;
      particles(t, dt, sp);
    }
    function dispose() { group.parent && group.parent.remove(group); keep.forEach(x => x.dispose && x.dispose()); }
    return { id, ...def, group, body, parts, glowMat: glow, face, hit, update, dispose, emote, fire, cheer, look: { arm: opts.arm || 'none', trail: TRAIL || 'none', emote: opts.emote || 'wave', victory: opts.victory || 'hop' } };
  }
  // ---------- in fights ----------
  const DIV_BOT = { striker: 'nova', precision: 'pixel', hunter: 'raze', sentinel: 'orbit', ghost: 'kite', architect: 'beep' };
  const HOVER = 2.3;   // a bot's centre above the floor
  const accent = () => (window.Theme ? Theme.hex('accent') : '#8cff58');
  const lookOf = L => ({ color: L.color || accent(), shell: L.shell, eyes: L.eyes, screen: L.screen || undefined, sig: L.sig, back: L.back,
    top: L.top || 'none', blush: !!L.blush, marks: { stickers: L.stickers || [], wear: L.wear || 0 }, name: L.name || '',
    arm: L.arm || 'none', trail: L.trail || 'none', emote: L.emote || 'wave', victory: L.victory || 'hop', armor: L.armor || 'none', orb: L.orb || 'core' });
  // the bought parts (REWARDS.shop.bot): { id, name, price, part, v }; part is a look key
  const SHOP = () => (window.REWARDS && REWARDS.shop && REWARDS.shop.bot) || [];
  const itemFor = (part, v) => SHOP().find(x => x.part === part && String(x.v) === String(v)) || null;
  const owns = id => !!(window.WPM && WPM.owns && WPM.owns(id));
  // the parts in a look that this player hasn't bought
  function locked(L) {
    const out = [];
    for (const k of ['color', 'shell', 'eyes', 'back', 'top', 'blush', 'arm', 'trail', 'emote', 'victory', 'armor', 'orb']) { const it = itemFor(k, L[k] === true ? 'on' : L[k]); if (it && !owns(it.id)) out.push(it); }
    return out;
  }
  // a look with its unbought parts back to the free ones, for fights
  function owned(L) {
    const o = { ...L };
    for (const it of locked(L)) o[it.part] = it.part === 'blush' ? false : it.part === 'color' ? '' : it.part === 'top' || it.part === 'armor' ? 'none' : OPTIONS[it.part][0][0];
    return o;
  }
  function mine() {
    let st = null; try { st = window.TT && TT.store ? TT.store.get('wpm-bot', null) : null; } catch (e) {}
    const d = window.Ops && Ops.division ? Ops.division() : null;
    const id = (d && DIV_BOT[d.id]) || (st && BOTS[st.active] ? st.active : 'pixel');
    return { id, look: lookOf(owned((st && st.bots && st.bots[id]) || {})) };
  }
  // about one other player in three charges a bought orb
  function orbOf(seed) {
    let h = 5381; for (const c of String(seed)) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;
    return h % 100 < 64 ? 'core' : OPTIONS.orb[1 + (h >>> 8) % (OPTIONS.orb.length - 1)][0];
  }
  function random(seed) {
    let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = k => ((h >>> (k * 3)) & 1023) / 1024, ids = Object.keys(BOTS);
    const glows = ['#8cff58', '#5cc8ff', '#ffb000', '#b48cff', '#ff7ad9', '#3effc8', '#f4f4f4', '#ff8a3d'];
    return { id: ids[Math.floor(r(0) * ids.length)], look: lookOf({ color: glows[Math.floor(r(1) * glows.length)],
      shell: OPTIONS.shell[Math.floor(r(2) * OPTIONS.shell.length)][0], sig: r(3) < 0.5 ? 0 : 1, back: r(4) < 0.6 ? 'none' : r(4) < 0.8 ? 'wings' : 'pack',
      // other players show off what they bought now and then
      top: r(5) < 0.45 ? 'none' : OPTIONS.top[1 + Math.floor(r(6) * (OPTIONS.top.length - 1))][0], blush: r(7) < 0.25,
      arm: r(8) < 0.6 ? 'none' : OPTIONS.arm[1 + Math.floor(r(9) * (OPTIONS.arm.length - 1))][0], trail: 'none',
      victory: OPTIONS.victory[Math.floor(r(1) * OPTIONS.victory.length)][0], orb: orbOf(seed) }) };
  }
  // one moment of a victory pose: height above the hover, turn, tilt, flip (radians) and the face
  const VP = { y: 0, turn: 0, tilt: 0, flip: 0, face: 'happy' };
  function victoryPose(kind, t, out = {}) {
    out.y = 0; out.turn = 0; out.tilt = 0; out.flip = 0; out.face = 'happy';
    if (kind === 'spin') { out.y = 0.3 + Math.sin(t * 3) * 0.15; out.turn = t * 5; }
    else if (kind === 'float') { out.y = 0.8 + Math.sin(t * 1.5) * 0.25; out.turn = Math.sin(t * 0.7) * 0.9; out.tilt = Math.sin(t * 1.2) * 0.15; out.face = 'heart'; }
    else if (kind === 'dance') { const b = t * 6; out.y = Math.abs(Math.sin(b)) * 0.4; out.turn = Math.sin(b / 2) * 0.8; out.tilt = Math.sin(b) * 0.25; }
    else if (kind === 'flip') { const u = (t % 1.8) / 1.8, fu = Math.min(1, u / 0.55); out.y = Math.sin(Math.min(1, u / 0.6) * Math.PI) * 1.1; out.flip = -fu * fu * (3 - 2 * fu) * Math.PI * 2; }
    else if (kind === 'fireworks') { out.y = Math.abs(Math.sin(t * 4)) * 0.35; out.turn = Math.sin(t * 1.6) * 0.4; out.face = 'star'; }
    else { out.y = Math.abs(Math.sin(t * 5)) * 0.5; out.turn = Math.sin(t * 2.5) * 0.5; }
    return out;
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
      else if (kind === 'cast') { castAt = t; bot.fire(t); }
      else if (kind === 'emote') bot.emote(look.emote, t);
      // the operator actions (operator3d.js ONCE) mapped onto a bot: a dash aside, a brace, love, a spin
      else if (kind === 'dodge') { dodgeAt = t; dodgeSide = Math.random() < 0.5 ? -1 : 1; }
      else if (kind === 'cover') braceAt = t;
      else if (kind === 'heal') bot.emote('heart', t);
      else if (kind === 'revive') bot.emote('spin', t);
      else if (kind === 'attack') { castAt = t - 0.15; bot.fire(t); }
    }
    let dodgeAt = -9, dodgeSide = 1, braceAt = -9;
    const VIC = look.victory || 'hop';
    const wv = new V();
    function update(dt, uo = {}) {   // uo.vel: how the actor is moving in the world, so the bot leans into it
      t += dt;
      const sc = t - castAt, lunge = sc < 0.4 ? Math.sin(sc / 0.4 * Math.PI) * 0.9 : 0;   // a dart forward on a cast
      let y = hover, face, tilt = 0, turn = 0, flip = 0;
      if (anim === 'defeat') { y = hover * 0.4 + Math.sin(t * 1.3) * 0.04; face = 'x'; tilt = 0.7 + Math.sin(t * 0.9) * 0.05; }
      else if (anim === 'victory') { victoryPose(VIC, t, VP); y = hover + VP.y; turn = VP.turn; tilt = VP.tilt; flip = VP.flip; face = VP.face; bot.cheer(t, VIC); }
      else if (anim === 'type' || sc < 0.4) face = sc < 0.4 ? 'angry' : 'focus';
      const du = t - dodgeAt, dx = du < 0.55 ? Math.sin(du / 0.55 * Math.PI) * 1.4 * dodgeSide : 0;
      const bu = t - braceAt, br = bu < 0.8 ? Math.sin(Math.min(1, bu / 0.12) * Math.PI / 2) * (1 - bu / 0.8) : 0;
      if (br > 0.05) face = 'focus';
      bot.group.position.set(dx, y - br * 0.2, lunge - br * 0.35);
      bot.group.rotation.set(flip - br * 0.35, turn, tilt - dx * 0.25);
      vel.set(0, 0, (lunge - prevZ) / Math.max(1e-3, dt) + (anim === 'type' ? 2.5 : 0)); prevZ = lunge;
      if (uo.vel) { wv.copy(uo.vel).applyAxisAngle(new V(0, 1, 0), -group.rotation.y); vel.add(wv); }
      bot.update(t, dt, { vel, face });
    }
    function at(name, tt) { anim = name; t = tt; update(0); }
    const kbWorld = out => bot.body.localToWorld(out.set(0, 0, 1.15));
    return { group, bot, play, once, update, at, kbWorld, emote: k => bot.emote(k || look.emote, t), dispose: () => bot.dispose() };
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

  return { create, FX, ARMOR, BOTS, OPTIONS, STICKERS, DIV_BOT, HOVER, mine, random, actor, crowd, locked, owned, itemFor, icon, victoryPose };
})();
