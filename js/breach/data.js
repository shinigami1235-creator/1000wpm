// Breach content: chapters, story text, enemy types, bosses and power-ups.
// Story canon lives in STORY/WORLD.md and every story piece is listed in STORY/REGISTRY.md.
window.BreachData = (() => {
  // speed in metres a second, len is the word length range, words is how many
  // words the enemy carries (a shielded one loses its shield to the first).
  const ENEMIES = {
    drone:    { speed: 2.7, len: [3, 6], score: 10 },
    runner:   { speed: 4.3, len: [3, 4], score: 15, fast: true },
    glitcher: { speed: 2.5, len: [4, 6], score: 20, teleport: 1.5 },
    splitter: { speed: 2.3, len: [6, 8], score: 20, split: 2 },
    shard:    { speed: 3.0, len: [2, 3], score: 5 },
    shielded: { speed: 2.1, len: [4, 6], score: 30, words: 2 },
    shooter:  { speed: 2.8, len: [5, 7], score: 25, stopAt: 11, fireEvery: 3.4 },
    flyer:    { speed: 3.4, len: [3, 5], score: 15, fly: true, fast: true },
    bug:      { speed: 2.8, len: [1, 1], score: 5 },
    node:     { speed: 0, len: [4, 6], score: 20 },
  };

  const PICKUPS = {
    health:   { label: 'Health',   text: '+1 life', icon: 'plus' },
    debounce: { label: 'Debounce', text: 'Typos slow down for 8 seconds', icon: 'clock' },
    macro:    { label: 'Macro',    text: 'Every typo on screen goes down', icon: 'burst' },
    shield:   { label: 'Shield',   text: 'Blocks the next hit', icon: 'shield' },
    double:   { label: 'Double',   text: 'Double score for 10 seconds', icon: 'x2' },
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
  // Z is a wide platform the camera strafes across, A is an open arena, G is a door with a password.
  // Each wave's foes list holds [type, count, where] with where = ahead, side, above or corner.
  const CHAPTERS = [
    {
      id: 'live', title: 'Live', place: "Art's stream chat, 9:00 pm", theme: 'chat', music: 'stage1',
      color: '#39ff88', color2: '#a35bff',
      waves: [
        { path: 'FF', foes: [['drone', 4, 'ahead']] },
        { path: 'L', foes: [['drone', 3, 'corner'], ['bug', 3, 'ahead']], pickup: 'health' },
        { path: 'FZ', foes: [['drone', 3, 'side'], ['runner', 2, 'ahead'], ['flyer', 1, 'above']] },
        { path: 'G', hack: true },
        { path: 'UF', foes: [['glitcher', 2, 'ahead'], ['drone', 3, 'side'], ['bug', 4, 'corner']], pickup: 'debounce' },
        { path: 'RA', foes: [['drone', 4, 'ahead'], ['runner', 2, 'side'], ['splitter', 1, 'ahead']] },
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
        loop: ['core', 'barrage', 'core', 'windup', 'summon', 'windup'],
        events: [{ at: 0.5, act: 'spell' }],
        counters: ['block', 'mute', 'report', 'ban user', 'clear chat', 'slow mode'],
        barrage: 6, summon: [['bug', 5]],
      },
    },
    {
      id: 'market', title: 'Night market', place: "The market's shop network", theme: 'market', music: 'stage2',
      color: '#39ff88', color2: '#ff9a3d',
      waves: [
        { path: 'FF', foes: [['drone', 4, 'ahead'], ['runner', 2, 'side']] },
        { path: 'R', foes: [['flyer', 3, 'above'], ['drone', 3, 'corner']], pickup: 'health' },
        { path: 'DZ', foes: [['splitter', 2, 'ahead'], ['bug', 5, 'side'], ['runner', 2, 'ahead']] },
        { path: 'FL', foes: [['shielded', 1, 'corner'], ['glitcher', 2, 'ahead'], ['drone', 3, 'side']], pickup: 'macro' },
        { path: 'G', hack: true },
        { path: 'UA', foes: [['drone', 5, 'ahead'], ['flyer', 2, 'above'], ['shielded', 1, 'ahead'], ['bug', 4, 'side']], pickup: 'double' },
      ],
      bossPath: 'FRA',
      intro: [
        'Every shop listing in the market has a spelling mistake in it and every mistake is walking.',
        "A noodle seller named Pim messages Art from her shop's order page. She says the typos came out of people's phones the moment the update finished.",
        "The update reached her shop through the transit control system, five stops from Fixword's servers.",
      ],
      outro: ["Pim sends Art the code from her transit card and tells him the trains are still running."],
      boss: {
        name: 'The Signboard', art: 'sign', hp: 1250,
        loop: ['core', 'windup', 'core', 'barrage', 'windup'],
        events: [{ at: 0.65, act: 'shield' }, { at: 0.35, act: 'spell' }],
        counters: ['unplug', 'lights off', 'take down', 'close shop', 'pull the plug'],
        barrage: 8, summon: [['runner', 3]], nodes: 3,
      },
    },
    {
      id: 'subway', title: 'Last train', place: 'Line 2 control system', theme: 'transit', music: 'stage3',
      color: '#39ff88', color2: '#4d7cff',
      waves: [
        { path: 'FF', foes: [['drone', 4, 'ahead'], ['bug', 4, 'side']] },
        { path: 'L', foes: [['runner', 4, 'corner'], ['shooter', 1, 'ahead']], pickup: 'shield' },
        { path: 'UZ', foes: [['flyer', 4, 'above'], ['shielded', 1, 'ahead'], ['drone', 2, 'side']] },
        { path: 'G', hack: true },
        { path: 'DF', foes: [['glitcher', 3, 'ahead'], ['splitter', 2, 'side'], ['bug', 5, 'corner']], pickup: 'health' },
        { path: 'RA', foes: [['drone', 4, 'ahead'], ['shooter', 2, 'ahead'], ['runner', 3, 'side'], ['flyer', 2, 'above']], pickup: 'debounce' },
      ],
      bossPath: 'FLA',
      intro: [
        'The control system has stopped every train on Line 2 between two stations.',
        'The screens on the line fill with garbled announcements and the announcements climb down out of the screens.',
      ],
      outro: ["Art follows a maintenance link out of the control system into the firmware of the old Brenn keyboard factory, where Fixword keeps its servers."],
      boss: {
        name: 'The Announcer', art: 'announcer', hp: 1500,
        loop: ['core', 'summon', 'windup', 'barrage', 'windup'],
        events: [{ at: 0.6, act: 'spell' }, { at: 0.3, act: 'shield' }],
        counters: ['mute', 'end call', 'cut the feed', 'turn it down', 'stop'],
        barrage: 10, summon: [['glitcher', 3]], nodes: 4, teleport: true,
      },
    },
    {
      id: 'factory', title: 'The factory', place: 'Brenn Keyboards firmware line', theme: 'factory', music: 'stage4',
      color: '#39ff88', color2: '#ff3dbb',
      waves: [
        { path: 'FF', foes: [['shielded', 2, 'ahead'], ['drone', 4, 'side']] },
        { path: 'R', foes: [['shooter', 2, 'corner'], ['runner', 4, 'ahead']], pickup: 'double' },
        { path: 'DZ', foes: [['splitter', 3, 'ahead'], ['flyer', 4, 'above'], ['bug', 5, 'side']] },
        { path: 'G', hack: true },
        { path: 'UL', foes: [['glitcher', 3, 'corner'], ['shielded', 2, 'ahead'], ['runner', 3, 'side']], pickup: 'shield' },
        { path: 'G', hack: true },
        { path: 'FA', foes: [['drone', 5, 'ahead'], ['shooter', 2, 'ahead'], ['shielded', 2, 'side'], ['bug', 6, 'above']], pickup: 'macro' },
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
        barrage: 10, summon: [['shielded', 2], ['runner', 2]], nodes: 4, fastWindup: true,
      },
    },
    {
      id: 'server', title: 'Fixword core', place: 'Fixword core, under the factory', theme: 'core', music: 'stage5',
      color: '#39ff88', color2: '#ff2a3a',
      waves: [
        { path: 'FF', foes: [['drone', 5, 'ahead'], ['shooter', 2, 'ahead'], ['flyer', 2, 'above']] },
        { path: 'L', foes: [['shielded', 3, 'corner'], ['runner', 4, 'side']], pickup: 'health' },
        { path: 'G', hack: true },
        { path: 'UZ', foes: [['splitter', 3, 'ahead'], ['shooter', 3, 'side'], ['bug', 6, 'above']], pickup: 'debounce' },
        { path: 'DR', foes: [['glitcher', 4, 'corner'], ['drone', 4, 'ahead'], ['runner', 4, 'side']], pickup: 'shield' },
        { path: 'G', hack: true },
        { path: 'FA', foes: [['drone', 6, 'ahead'], ['shielded', 2, 'ahead'], ['shooter', 2, 'side'], ['flyer', 3, 'above'], ['bug', 5, 'side']], pickup: 'macro' },
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
        barrage: 12, summon: [['shielded', 2], ['glitcher', 2], ['bug', 4]], nodes: 4, teleport: true,
      },
    },
  ];

  return { ENEMIES, PICKUPS, PICKUP_WORDS, PASSWORDS, SPELL, CHAPTERS };
})();
