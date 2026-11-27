// Breach content: chapters, story text, enemy types, bosses and power-ups.
// Story canon lives in STORY/WORLD.md and every story piece is listed in STORY/REGISTRY.md.
window.BreachData = (() => {
  // speed in metres a second, len is the word length range, words is how many
  // words the enemy carries (a shielded one loses its shield to the first).
  const ENEMIES = {
    drone:     { speed: 2.7, len: [3, 6], score: 10 },
    runner:    { speed: 4.3, len: [3, 4], score: 15, fast: true },
    glitcher:  { speed: 2.5, len: [4, 6], score: 20, teleport: 1.5 },
    splitter:  { speed: 2.3, len: [6, 8], score: 20, split: 2 },
    shard:     { speed: 3.0, len: [2, 3], score: 5 },
    shielded:  { speed: 2.1, len: [4, 6], score: 30, words: 2 },
    shooter:   { speed: 2.8, len: [5, 7], score: 25, stopAt: 11, fireEvery: 3.4 },
    flyer:     { speed: 3.4, len: [3, 5], score: 15, fly: true, fast: true },
    bug:       { speed: 2.8, len: [1, 1], score: 5 },
    node:      { speed: 0, len: [4, 6], score: 20 },
    // looks like a power-up chip until it is 8 m away, then shows itself and speeds up
    mimic:     { speed: 1.9, len: [5, 7], score: 30, reveal: 8, revealSpeed: 3.6 },
    // moves under the grid and can't be targeted until it surfaces 9 m away
    burrower:  { speed: 3.0, len: [4, 6], score: 25, surface: 9, surfaceSpeed: 2.6 },
    // slow hive that lets out three bugs when it breaks
    carrier:   { speed: 1.7, len: [6, 8], score: 30, spawns: 3 },
    // its word shows mirrored while it faces away
    reflector: { speed: 2.4, len: [5, 7], score: 25, turn: [1.7, 1.0] },
    // linked segments typed head first
    link:      { speed: 2.2, len: [3, 4], score: 10 },
    // fades out and back in, its word hidden while it is faded
    cloaked:   { speed: 2.6, len: [4, 6], score: 25, cloak: 2.8 },
    // slow and big, carries a phrase
    heavy:     { speed: 1.35, len: [4, 6], score: 60, phrase: 3 },
    // keeps its distance and puts a shield back on another typo every few seconds
    healer:    { speed: 2.2, len: [5, 7], score: 30, stopAt: 13, healEvery: 4.5 },
    // stops far away, paints Art with a red sight line for 1.5 seconds, then fires a fast packet
    sniper:    { speed: 2.4, len: [5, 7], score: 35, stopAt: 16, fireEvery: 5.2, aim: 1.5, shotK: 1.6 },
  };

  const PICKUPS = {
    health:   { label: 'Health',   text: '+1 life', icon: 'plus' },
    debounce: { label: 'Debounce', text: 'Typos slow down for 8 seconds', icon: 'clock' },
    macro:    { label: 'Macro',    text: 'Every typo on screen goes down', icon: 'burst' },
    shield:   { label: 'Shield',   text: 'Blocks the next hit', icon: 'shield' },
    double:   { label: 'Double',   text: 'Double score for 10 seconds', icon: 'x2' },
    freeze:   { label: 'Freeze',   text: 'Time stops for 4 seconds', icon: 'pause' },
  };
  // Power-ups carry tech words from their own pool so they never read like a typo.
  const PICKUP_WORDS = ['patch', 'reboot', 'firewall', 'backup', 'uplink', 'compile', 'restore', 'kernel', 'sandbox',
    'checksum', 'debug', 'failsafe', 'overclock', 'antivirus', 'cache', 'defrag', 'encrypt', 'proxy', 'router',
    'bandwidth', 'install', 'update', 'hotfix', 'gateway', 'wifi', 'zip', 'quarantine', 'jumper', 'voltage', 'ethernet'];

  // Passwords for the doors that close during a chapter.
  const PASSWORDS = ['open sesame', 'let me in', 'access granted', 'override', 'admin login', 'root access',
    'master key', 'unlock door', 'bypass lock', 'guest pass', 'service mode', 'door override', 'emergency exit'];

  // Which one is spelled right? The first option is the right one.
  const SPELL = [
    ['receive', 'recieve', 'receeve'], ['separate', 'seperate', 'separite'], ['definitely', 'definately', 'defenitely'],
    ['necessary', 'neccessary', 'necesary'], ['occurrence', 'occurence', 'ocurrence'], ['accommodate', 'accomodate', 'acommodate'],
    ['embarrass', 'embarass', 'embaras'], ['rhythm', 'rythm', 'rhythym'], ['calendar', 'calender', 'calandar'],
    ['government', 'goverment', 'govenment'], ['tomorrow', 'tommorow', 'tomorow'], ['beginning', 'begining', 'beggining'],
    ['believe', 'beleive', 'belive'], ['weird', 'wierd', 'weerd'], ['address', 'adress', 'addres'],
    ['keyboard', 'keybaord', 'keyborad'], ['mechanical', 'mechanicle', 'mechancial'], ['accuracy', 'acuracy', 'accuarcy'],
    ['restaurant', 'resturant', 'restaraunt'], ['occasion', 'ocassion', 'occassion'], ['millennium', 'millenium', 'milennium'],
    ['conscience', 'concience', 'conscence'], ['privilege', 'priviledge', 'privelege'], ['guarantee', 'garantee', 'guarentee'],
  ];

  // Path letters build the rail the camera rides on:
  // F straight, L and R turn a corner, U climbs a ramp, D drops to a lower platform,
  // Z is a wide platform the camera strafes across, A is an open arena, G is a door with a password,
  // X is a bridge that falls apart behind the camera, C is a chase with a train behind and barriers ahead,
  // E is an elevator ride down, B splits into two lanes the player picks between, K is a dark stretch.
  // Each wave's foes list holds [type, count, where] with where = ahead, side, above or corner.
  // A note is a message or log that shows when the camera reaches the wave.
  const CHAPTERS = [
    {
      id: 'live', title: 'Live', place: "Art's stream chat, 9:00 pm", theme: 'chat', music: 'stage1',
      color: '#39ff88', color2: '#a35bff', fog: '#07040d', base: '#05030a', cell: 1,
      waves: [
        { path: 'FF', foes: [['drone', 4, 'ahead'], ['bug', 3, 'side']],
          note: { from: 'Fixword 9.0 release notes', text: 'Wrong words are no longer corrected. Each one gets a body and goes back to the person who typed it.' } },
        { path: 'L', foes: [['drone', 3, 'corner'], ['mimic', 1, 'ahead'], ['bug', 3, 'ahead']], pickup: 'health',
          note: { from: 'Stream chat, 9:03 pm', text: '212 messages in the last minute and 37 of them have a spelling mistake.' } },
        { path: 'X', foes: [['runner', 2, 'ahead'], ['drone', 3, 'side'], ['flyer', 1, 'above']],
          note: { from: 'Stream chat, 9:05 pm', text: 'Your moderators are deleting the chat history to stop the typos. The messages behind you are going with it.' } },
        { path: 'G', hack: true },
        { path: 'UF', foes: [['glitcher', 2, 'ahead'], ['mimic', 1, 'side'], ['drone', 3, 'side'], ['bug', 4, 'corner']], pickup: 'debounce' },
        { path: 'RA', foes: [['drone', 4, 'ahead'], ['runner', 2, 'side'], ['splitter', 1, 'ahead']],
          note: { from: 'fixword_otto', text: 'Read what you send before you send it.' } },
      ],
      bossPath: 'DFA',
      intro: [
        'Art is live on stream, typing one word for each of his followers.',
        'At 9:00 pm every phone and computer in the city installs the Fixword update.',
        'Halfway through the count, the typos in his chat come alive and his screen pulls him into the chat after them.',
      ],
      outro: [
        'The last message in the chat came from an account called fixword_otto with a link to the update.',
        'Art follows the link out of the chat to see how far the update has spread.',
      ],
      boss: {
        name: 'The Spam', art: 'spam', hp: 1000,
        loop: ['core', 'gifts', 'core', 'windup', 'barrage', 'windup'],
        events: [{ at: 0.5, act: 'spell' }],
        counters: ['block', 'mute', 'report', 'ban user', 'clear chat', 'slow mode'],
        barrage: 6, summon: [['bug', 4], ['mimic', 1]],
      },
    },
    {
      id: 'market', title: 'Night market', place: "The market's shop network", theme: 'market', music: 'stage2',
      color: '#ffb347', color2: '#ff5f9e', fog: '#0c0603', base: '#0a0503', cell: 1.6,
      waves: [
        { path: 'FF', foes: [['drone', 4, 'ahead'], ['runner', 2, 'side'], ['reflector', 1, 'ahead']],
          note: { from: 'Pim', text: 'Every bowl on my order page has said NODLES since nine. My customers tap without reading.' } },
        { path: 'R', foes: [['flyer', 3, 'above'], ['drone', 3, 'corner'], ['carrier', 1, 'ahead']], pickup: 'health',
          note: { from: 'Shop log, 9:11 pm', text: 'Order 4471 for two NODLES and one FRIDE RICE. Fixword left both as typed.' } },
        { path: 'FB', branch: {
            note: { from: 'Market map', text: 'Two aisles lead to the transit gate. The food aisle has more typos and a power-up at the end. The phone aisle is shorter.' },
            left: { word: 'noodles', label: 'Food aisle', foes: [['drone', 4, 'ahead'], ['splitter', 2, 'side'], ['bug', 5, 'corner'], ['mimic', 1, 'ahead']], pickup: 'macro' },
            right: { word: 'phones', label: 'Phone aisle', foes: [['reflector', 2, 'ahead'], ['carrier', 1, 'ahead'], ['runner', 2, 'side']] },
          } },
        { path: 'L', foes: [['shielded', 1, 'corner'], ['glitcher', 2, 'ahead'], ['drone', 3, 'side']],
          note: { from: 'Pim', text: 'The update came into my shop from the transit network at 9:00 exactly.' } },
        { path: 'G', hack: true },
        { path: 'UA', foes: [['drone', 5, 'ahead'], ['flyer', 2, 'above'], ['shielded', 1, 'ahead'], ['reflector', 1, 'side'], ['bug', 4, 'side']], pickup: 'double',
          note: { from: 'Pim', text: 'The big sign over the gate is the worst one. Its letters have been wrong since I opened my stall.' } },
      ],
      bossPath: 'FRA',
      intro: [
        "The link from fixword_otto opens the market's shop network.",
        'Every shop listing in the market has a spelling mistake in it and every mistake is walking.',
        "A noodle seller named Pim messages Art from her shop's order page. She says the typos came out of people's phones the moment the update finished.",
        "The update reached her shop through the transit control system, five stops from Fixword's servers.",
      ],
      outro: ['Pim sends Art the code from her transit card and tells him the trains are still running.'],
      boss: {
        name: 'The Signboard', art: 'sign', hp: 1250,
        loop: ['core', 'fixsign', 'windup', 'barrage', 'core', 'windup', 'summon'],
        events: [{ at: 0.65, act: 'shield' }, { at: 0.35, act: 'spell' }],
        counters: ['unplug', 'lights off', 'take down', 'close shop', 'pull the plug'],
        barrage: 8, summon: [['runner', 2], ['reflector', 1]], nodes: 3,
      },
    },
    {
      id: 'subway', title: 'Last train', place: 'Line 2 control system', theme: 'transit', music: 'stage3',
      color: '#5fd0ff', color2: '#4d7cff', fog: '#02060f', base: '#02050c', cell: 2.2,
      waves: [
        { path: 'FF', foes: [['drone', 4, 'ahead'], ['burrower', 2, 'ahead'], ['bug', 3, 'side']],
          note: { from: 'Announcement log, 9:20 pm', text: 'NXET TRAIN DELAYD. Sent as typed by the control room.' } },
        { path: 'L', foes: [['runner', 3, 'corner'], ['shooter', 1, 'ahead'], ['link', 4, 'ahead']], pickup: 'shield' },
        { path: 'C', chase: { barriers: 6 },
          note: { from: 'Control room', text: 'Train 2-14 has started moving on its own. It is on your track.' } },
        { path: 'UZ', foes: [['flyer', 3, 'above'], ['shielded', 1, 'ahead'], ['burrower', 2, 'side'], ['drone', 2, 'side']] },
        { path: 'G', hack: true },
        { path: 'DF', foes: [['glitcher', 2, 'ahead'], ['link', 4, 'ahead'], ['splitter', 1, 'side'], ['bug', 4, 'corner']], pickup: 'health',
          note: { from: 'Maintenance note', text: 'Line 2 signals load their firmware from Brenn Keyboards, on the same server as Fixword.' } },
        { path: 'RA', foes: [['drone', 3, 'ahead'], ['shooter', 2, 'ahead'], ['burrower', 2, 'side'], ['flyer', 2, 'above']], pickup: 'debounce' },
      ],
      bossPath: 'FLA',
      intro: [
        "The code from Pim's transit card gets Art into the Line 2 control system.",
        'The control system has stopped every train on Line 2 between two stations.',
        'The screens on the line fill with garbled announcements and the announcements climb down out of the screens.',
      ],
      outro: ["Art follows a maintenance link out of the control system into the firmware of the old Brenn keyboard factory, where Fixword keeps its servers."],
      boss: {
        name: 'The Announcer', art: 'announcer', hp: 1500,
        loop: ['core', 'speakers', 'windup', 'barrage', 'summon', 'windup'],
        events: [{ at: 0.6, act: 'spell' }, { at: 0.3, act: 'shield' }],
        counters: ['mute', 'end call', 'cut the feed', 'turn it down', 'stop'],
        barrage: 10, summon: [['glitcher', 2], ['burrower', 1]], nodes: 4, teleport: true,
      },
    },
    {
      id: 'factory', title: 'The factory', place: 'Brenn Keyboards firmware line', theme: 'factory', music: 'stage4',
      color: '#ff3dbb', color2: '#c8ff3d', fog: '#0a0309', base: '#080207', cell: 0.75,
      waves: [
        { path: 'FF', foes: [['shielded', 2, 'ahead'], ['drone', 3, 'side'], ['healer', 1, 'ahead']],
          note: { from: 'Firmware changelog, signed Otto Brenn', text: 'Removed autocorrect from keycap legends. If the operator types it wrong, it ships wrong.' } },
        { path: 'E', foes: [['flyer', 4, 'above'], ['bug', 5, 'side'], ['shooter', 1, 'ahead']],
          note: { from: 'Shift report', text: 'Line 3 stamped 9,000 caps tonight and 1,200 of them had the wrong letter.' } },
        { path: 'R', foes: [['heavy', 1, 'ahead'], ['runner', 3, 'corner'], ['carrier', 1, 'ahead']], pickup: 'double' },
        { path: 'X', foes: [['splitter', 2, 'ahead'], ['link', 4, 'ahead'], ['flyer', 2, 'above']] },
        { path: 'G', hack: true },
        { path: 'UL', foes: [['glitcher', 2, 'corner'], ['shielded', 2, 'ahead'], ['healer', 1, 'ahead'], ['runner', 2, 'side']], pickup: 'shield',
          note: { from: 'Email from Otto Brenn, last July', text: 'I am taking leave. Do not push anything to Fixword while I am gone.' } },
        { path: 'FA', foes: [['heavy', 1, 'ahead'], ['shooter', 2, 'ahead'], ['shielded', 2, 'side'], ['bug', 5, 'above']], pickup: 'macro' },
      ],
      bossPath: 'RFA',
      intro: [
        'The factory still makes keyboards.',
        'The firmware on the assembly line prints the wrong letters on every keycap and every wrong letter walks out of the code.',
      ],
      outro: ['Art finds a staff login for Otto Brenn, who wrote Fixword. A letter is saved with it.'],
      letter: [
        'My daughter Mina was stuck on Canal Road last June with the water up to the car windows. She texted for help. Fixword changed Canal Road to Coral Road and the rescue boat went to Coral Road on the other side of the city. They found her car the next morning.',
        'I wrote Fixword. I spent twenty years teaching it to fix spelling for people and now nobody checks what they send.',
        'The update gives every wrong word a body and sends it after whoever typed it. People will check their words again.',
        'Otto',
      ],
      boss: {
        name: 'The Press', art: 'press', hp: 1750,
        loop: ['windup', 'windup', 'core', 'barrage', 'windup', 'summon'],
        events: [{ at: 0.66, act: 'shield' }, { at: 0.4, act: 'spell' }],
        counters: ['brake', 'jam', 'halt', 'stop the line', 'reverse'],
        barrage: 10, summon: [['shielded', 2], ['heavy', 1]], nodes: 4, fastWindup: true, heat: 3,
      },
    },
    {
      id: 'server', title: 'Fixword core', place: 'Fixword core, under the factory', theme: 'core', music: 'stage5',
      color: '#ff3a4a', color2: '#ff7a2a', fog: '#0b0102', base: '#090102', cell: 1.2,
      waves: [
        { path: 'FF', foes: [['drone', 4, 'ahead'], ['shooter', 2, 'ahead'], ['cloaked', 2, 'side'], ['flyer', 2, 'above']],
          note: { from: 'Fixword log, last June', text: "'stuck on canal road water rising' changed to 'stuck on coral road water rising'." } },
        { path: 'L', foes: [['shielded', 2, 'corner'], ['healer', 1, 'ahead'], ['runner', 3, 'side']], pickup: 'health' },
        { path: 'K', dark: true, foes: [['cloaked', 2, 'ahead'], ['burrower', 2, 'ahead'], ['bug', 5, 'side'], ['drone', 3, 'side']],
          note: { from: 'fixword_otto', text: "I turned the lights off down here. The one screen still on shows Mina's text from Canal Road." } },
        { path: 'G', hack: true },
        { path: 'UZ', foes: [['splitter', 2, 'ahead'], ['reflector', 2, 'side'], ['link', 4, 'ahead'], ['bug', 4, 'above']], pickup: 'debounce' },
        { path: 'X', foes: [['heavy', 1, 'ahead'], ['glitcher', 3, 'corner'], ['mimic', 1, 'ahead'], ['runner', 2, 'side']], pickup: 'shield' },
        { path: 'G', hack: true },
        { path: 'FA', foes: [['drone', 4, 'ahead'], ['shielded', 2, 'ahead'], ['healer', 1, 'ahead'], ['cloaked', 2, 'side'], ['carrier', 1, 'ahead']], pickup: 'macro',
          note: { from: 'fixword_otto', text: 'The rollback is in the core. Type through my machine without a mistake and it is yours.' } },
      ],
      bossPath: 'FUA',
      intro: [
        'Otto is waiting in the Fixword core.',
        'He says he will roll the update back for anyone who can type through his machine without a mistake.',
      ],
      outro: [
        'Art types the rollback and the update comes off every phone in the city. The typos fall apart into loose letters on the floor.',
        'Otto stays at the Fixword servers until the police arrive.',
        'Art comes back out through his own stream and finishes the follower count.',
      ],
      boss: {
        name: 'The Correction', art: 'correction', hp: 2200,
        loop: ['core', 'windup', 'barrage', 'summon', 'windup', 'core'],
        events: [{ at: 0.75, act: 'shield' }, { at: 0.5, act: 'spell', set: ['canal road', 'coral road', 'carol road'], ask: 'Which road was Mina on?' }, { at: 0.3, act: 'shield' }],
        finale: { at: 0.1, text: 'roll back the fixword update' },
        counters: ['nobody checks what they send anymore', 'undo', 'every wrong word goes back to whoever typed it', 'revert', 'cancel'],
        barrage: 12, summon: [['healer', 1], ['cloaked', 2], ['link', 4]], nodes: 4, teleport: true,
      },
    },
  ];

  // The Signboard's own move: its sign shows a misspelled word and the player
  // types it spelled right. Each pair is [shown, answer].
  const SIGNS = [['NODLES', 'noodles'], ['FRIDE RICE', 'fried rice'], ['MASAGE', 'massage'], ['COFEE', 'coffee'],
    ['KARAOKEE', 'karaoke'], ['DUMPLINS', 'dumplings'], ['PHONE REPIAR', 'phone repair'], ['OPEN 24 HOURES', 'open 24 hours']];

  // Glitch words swap one or two letters for these digits and symbols.
  const GLITCH = { o: ['0'], e: ['3'], a: ['4', '@'], i: ['1'], s: ['5', '$'], t: ['7'], l: ['1'] };

  // Difficulty: word length, enemy speed, attack timers and the points multiplier.
  const DIFFICULTY = {
    easy:   { label: 'Easy',   mult: 0.6, speed: 0.75, timer: 1.4, lenMin: 2, lenMax: 5, long: 0, glitch: 0 },
    normal: { label: 'Normal', mult: 1.0, speed: 1.0,  timer: 1.0, lenAdd: 0, long: 1, glitch: 0.12, glitchFrom: 1 },
    hard:   { label: 'Hard',   mult: 1.5, speed: 1.2,  timer: 0.8, lenAdd: 1, long: 2, glitch: 0.25, glitchFrom: 0 },
  };

  // Endless mode: every enemy type mixed, unlocked by level, with no story.
  const ENDLESS = {
    pool: [
      // [type, first level it appears, weight]
      ['drone', 1, 6], ['bug', 1, 4], ['runner', 2, 4], ['flyer', 2, 3], ['shielded', 3, 3], ['glitcher', 3, 3],
      ['splitter', 4, 2], ['mimic', 4, 2], ['shooter', 5, 2], ['reflector', 5, 2], ['burrower', 6, 2], ['carrier', 6, 2],
      ['cloaked', 7, 2], ['sniper', 7, 2], ['link', 8, 1], ['healer', 9, 1], ['heavy', 10, 1],
    ],
    killsPerLevel: 10,
    pickups: ['health', 'debounce', 'freeze', 'macro', 'shield', 'double'],
    mutators: [
      { id: 'onelife', label: 'One life', text: 'Start with one life. Score x1.5', unlock: 3000, mult: 1.5 },
      { id: 'cloak', label: 'Cloaked', text: 'Every typo fades in and out. Score x1.3', unlock: 6000, mult: 1.3 },
      { id: 'fast', label: 'Fast', text: 'Typos move 30% faster. Score x1.3', unlock: 10000, mult: 1.3 },
    ],
  };

  return { ENEMIES, PICKUPS, PICKUP_WORDS, PASSWORDS, SPELL, CHAPTERS, ENDLESS, SIGNS, GLITCH, DIFFICULTY };
})();
