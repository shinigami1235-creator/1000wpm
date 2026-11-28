// Boss Rush data: the roster, the twists each mark adds, the hard floors and the
// scoring constants. It has no DOM or three.js, which lets node load it for the director tests.
// The five Breach bosses come from js/breach/data.js (names, colours, counter words).
// The six titans and Syntax Error are BossKit bodies (js/app/bosskit.js, art: 'kit'),
// placed between them; a titan borrows a Breach boss's music (music) and can rename its move (mv). They are copied here so the rush works
// before the Breach scripts finish loading. RUSH.md explains every rule.
window.RushData = (() => {
  // One lap of the roster. hpK, intervalK and windK shape each boss on top of the
  // director's numbers: The Press winds up faster, Syntax Error has the most HP.
  // move is the boss's own move from Breach, rebuilt for a word stack fight.
  const ROSTER = [
    { id: 'spam', name: 'The Spam', art: 'spam', chapter: 1, move: 'gifts',
      color: '#39ff88', color2: '#a35bff', fog: '#07040d', base: '#05030a',
      theme: ['common', 'gaming'],
      hpK: 1, intervalK: 1, windK: 1,
      counters: ['block', 'mute', 'report', 'ban user', 'clear chat', 'slow mode'] },
    { id: 'siege', name: 'Siege Titan', art: 'kit', kit: 'siege', chapter: 0, move: 'press', music: 'press',
      mv: { name: 'Double slam', how: 'Block both slams.', text: 'Slams twice in a row. Three blocks in a row knock it off balance.' },
      color: '#ffb020', color2: '#ff6a3d', fog: '#0b0702', base: '#090602',
      theme: ['common', 'city'],
      hpK: 1.04, intervalK: 1, windK: 0.92,
      counters: ['brace', 'hold the gate', 'raise shields', 'dig in', 'stand firm'] },
    { id: 'sign', name: 'The Signboard', art: 'sign', chapter: 2, move: 'fixsign',
      color: '#ffb347', color2: '#ff5f9e', fog: '#0c0603', base: '#0a0503',
      theme: ['common', 'food', 'city'],
      hpK: 1.08, intervalK: 1, windK: 1,
      counters: ['unplug', 'lights off', 'take down', 'close shop', 'pull the plug'] },
    { id: 'warden', name: 'Firewall Warden', art: 'kit', kit: 'warden', chapter: 0, move: 'spell', music: 'correction',
      mv: { name: 'Access check', how: 'Type the password spelled right.', text: 'Asks for the password. Type the one spelled right to stun it.' },
      color: '#3ee6ff', color2: '#4d7cff', fog: '#020809', base: '#020607',
      theme: ['common', 'cyber'],
      hpK: 1.1, intervalK: 0.98, windK: 1,
      counters: ['bypass', 'override', 'tunnel', 'spoof', 'open port'] },
    { id: 'announcer', name: 'The Announcer', art: 'announcer', chapter: 3, move: 'speakers',
      color: '#5fd0ff', color2: '#4d7cff', fog: '#02060f', base: '#02050c',
      theme: ['common', 'city', 'music'],
      hpK: 1.14, intervalK: 0.96, windK: 1,
      counters: ['mute', 'end call', 'cut the feed', 'turn it down', 'stop'] },
    { id: 'colossus', name: 'Data Colossus', art: 'kit', kit: 'colossus', chapter: 0, move: 'volley', music: 'syntax',
      mv: { name: 'Data burst', how: 'Type each block to throw it back.', text: 'Throws data blocks. Type them to throw them back for triple damage.' },
      color: '#a35bff', color2: '#3ee6ff', fog: '#06030b', base: '#050209',
      theme: ['common', 'science'],
      hpK: 1.17, intervalK: 0.97, windK: 1,
      counters: ['compress', 'delete', 'wipe', 'defrag', 'clear cache'] },
    { id: 'press', name: 'The Press', art: 'press', chapter: 4, move: 'press',
      color: '#ff3dbb', color2: '#c8ff3d', fog: '#0a0309', base: '#080207',
      theme: ['common', 'keyboards'],
      hpK: 1.2, intervalK: 1, windK: 0.82,
      counters: ['brake', 'jam', 'halt', 'stop the line', 'reverse'] },
    { id: 'king', name: 'Kernel King', art: 'kit', kit: 'king', chapter: 0, move: 'gifts', music: 'announcer',
      mv: { name: 'Royal decrees', how: 'Type each decree before it lands.', text: 'Throws three decrees. Type them all to stun it.' },
      color: '#ffd23d', color2: '#a35bff', fog: '#0a0802', base: '#080602',
      theme: ['common', 'music'],
      hpK: 1.24, intervalK: 0.96, windK: 0.96,
      counters: ['revoke', 'dethrone', 'veto', 'sudo kill', 'abdicate'] },
    { id: 'correction', name: 'The Correction', art: 'correction', chapter: 5, move: 'spell',
      color: '#ff3a4a', color2: '#ff7a2a', fog: '#0b0102', base: '#090102',
      theme: ['common', 'science'],
      hpK: 1.28, intervalK: 0.95, windK: 1,
      counters: ['undo', 'revert', 'cancel', 'nobody checks what they send anymore', 'every wrong word goes back to whoever typed it'] },
    { id: 'half', name: 'Half-Compiled', art: 'kit', kit: 'half', chapter: 0, move: 'spell', music: 'correction',
      mv: { name: 'Compile check', how: 'Type the line that compiles.', text: 'Shows three spellings. Type the one that compiles to stun it.' },
      color: '#39ff88', color2: '#ff3dbb', fog: '#020805', base: '#020604',
      theme: ['common', 'cyber'],
      hpK: 1.3, intervalK: 0.94, windK: 1,
      counters: ['compile', 'build', 'link', 'run tests', 'ship it'] },
    { id: 'brute', name: 'Overclocked Brute', art: 'kit', kit: 'brute', chapter: 0, move: 'gifts', music: 'press',
      mv: { name: 'Steam vents', how: 'Type each vent before it blows.', text: 'Opens three steam vents. Type them all to stun it.' },
      color: '#ff7a2a', color2: '#ffd23d', fog: '#0b0502', base: '#090402',
      theme: ['common', 'keyboards'],
      hpK: 1.32, intervalK: 0.94, windK: 0.9,
      counters: ['cool down', 'vent', 'throttle', 'cut power', 'underclock'] },
    { id: 'syntax', name: 'Syntax Error', art: 'kit', kit: 'syntax', chapter: 0, move: 'volley',
      color: '#ff2a3a', color2: '#ff7a4d', fog: '#080102', base: '#060102',
      theme: ['common', 'cyber'],
      hpK: 1.36, intervalK: 0.92, windK: 0.95,
      counters: ['firewall', 'patch', 'reboot', 'rollback', 'kill process', 'debug'] },
  ];
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const markName = m => ROMAN[m] || String(m);

  // Boss number n (1 based) -> which copy. Boss 7 is The Spam mark II.
  function slot(n) {
    const i = (n - 1) % ROSTER.length;
    const mark = Math.floor((n - 1) / ROSTER.length) + 1;
    return { n, i, mark, boss: ROSTER[i], title: mark > 1 ? `${ROSTER[i].name} mark ${markName(mark)}` : ROSTER[i].name };
  }

  // What each mark adds. A boss carries every twist up to its mark.
  const TWISTS = [
    { id: 'shield', mark: 2, text: 'A firewall goes up at half HP.' },
    { id: 'twice', mark: 4, text: 'Its own move comes twice as often.' },
    { id: 'enrage', mark: 5, text: 'It attacks faster below 30% HP.' },
    { id: 'extra', mark: 6, text: 'Every attack needs one more counter word.' },
  ];
  const twistsFor = mark => TWISTS.filter(t => mark >= t.mark).map(t => t.id);

  // ---------- hard floors ----------
  // The least each boss always asks for, per mark. The director can ease a fight down
  // to these numbers and never past them.
  //   wpm       the speed the fight is sized for can't drop below this
  //   hp        boss HP at least
  //   diff      word difficulty band starts at least here (1 to 10, js/wordbank.js)
  //   minLen    stack words at least this long
  //   interval  ms between attacks at most
  //   react     ms of reaction time a wind-up allows at most
  //   perChar   ms per letter of counter words a wind-up allows at most
  //   counters  counter words per wind-up at least
  //   typo      integrity a wrong word costs at least
  // Marks past V use the mark V row plus 16 wpm a mark (see floorFor).
  const FLOORS = {
    //            wpm   hp     diff  minLen interval react perChar counters typo
    spam: [
      null,
      { wpm: 10, hp: 230, diff: 1, minLen: 2, interval: 10000, react: 1400, perChar: 2400, counters: 1, typo: 1 },
      { wpm: 26, hp: 660, diff: 1, minLen: 2, interval: 9460, react: 1370, perChar: 895, counters: 1, typo: 1 },
      { wpm: 42, hp: 1180, diff: 1.5, minLen: 2, interval: 8820, react: 1290, perChar: 509, counters: 2, typo: 2 },
      { wpm: 58, hp: 1780, diff: 2.5, minLen: 3, interval: 8180, react: 1210, perChar: 335, counters: 2, typo: 3 },
      { wpm: 74, hp: 2470, diff: 3, minLen: 3, interval: 7540, react: 1130, perChar: 237, counters: 2, typo: 4 },
    ],
    sign: [
      null,
      { wpm: 12, hp: 290, diff: 1, minLen: 2, interval: 10000, react: 1400, perChar: 2000, counters: 1, typo: 1 },
      { wpm: 28, hp: 770, diff: 1, minLen: 2, interval: 9380, react: 1360, perChar: 823, counters: 1, typo: 1 },
      { wpm: 44, hp: 1330, diff: 2, minLen: 2, interval: 8740, react: 1280, perChar: 480, counters: 2, typo: 2 },
      { wpm: 60, hp: 1990, diff: 2.5, minLen: 3, interval: 8100, react: 1200, perChar: 320, counters: 2, typo: 3 },
      { wpm: 76, hp: 2740, diff: 3, minLen: 3, interval: 7460, react: 1120, perChar: 227, counters: 2, typo: 4 },
    ],
    announcer: [
      null,
      { wpm: 14, hp: 360, diff: 1, minLen: 2, interval: 9542, react: 1400, perChar: 1714, counters: 1, typo: 1 },
      { wpm: 30, hp: 870, diff: 1.5, minLen: 2, interval: 8928, react: 1350, perChar: 760, counters: 1, typo: 2 },
      { wpm: 46, hp: 1470, diff: 2, minLen: 2, interval: 8314, react: 1270, perChar: 454, counters: 2, typo: 2 },
      { wpm: 62, hp: 2170, diff: 2.5, minLen: 3, interval: 7699, react: 1190, perChar: 306, counters: 2, typo: 3 },
      { wpm: 78, hp: 2960, diff: 3, minLen: 3, interval: 7085, react: 1110, perChar: 218, counters: 2, typo: 4 },
    ],
    press: [
      null,
      { wpm: 16, hp: 440, diff: 1, minLen: 2, interval: 9860, react: 1400, perChar: 1230, counters: 1, typo: 1 },
      { wpm: 32, hp: 970, diff: 1.5, minLen: 2, interval: 9220, react: 1340, perChar: 578, counters: 1, typo: 2 },
      { wpm: 48, hp: 1610, diff: 2, minLen: 2, interval: 8580, react: 1260, perChar: 353, counters: 2, typo: 2 },
      { wpm: 64, hp: 2360, diff: 2.5, minLen: 3, interval: 7940, react: 1180, perChar: 240, counters: 2, typo: 3 },
      { wpm: 80, hp: 3200, diff: 3, minLen: 3, interval: 7300, react: 1100, perChar: 172, counters: 3, typo: 4 },
    ],
    correction: [
      null,
      { wpm: 18, hp: 520, diff: 1, minLen: 2, interval: 9291, react: 1400, perChar: 1333, counters: 1, typo: 1 },
      { wpm: 34, hp: 1100, diff: 1.5, minLen: 2, interval: 8683, react: 1330, perChar: 656, counters: 1, typo: 2 },
      { wpm: 50, hp: 1790, diff: 2, minLen: 3, interval: 8075, react: 1250, perChar: 408, counters: 2, typo: 3 },
      { wpm: 66, hp: 2590, diff: 2.5, minLen: 3, interval: 7467, react: 1170, perChar: 280, counters: 2, typo: 3 },
      { wpm: 82, hp: 3500, diff: 3, minLen: 3, interval: 6859, react: 1090, perChar: 202, counters: 3, typo: 4 },
    ],
    syntax: [
      null,
      { wpm: 20, hp: 620, diff: 1, minLen: 2, interval: 8924, react: 1400, perChar: 1140, counters: 1, typo: 1 },
      { wpm: 36, hp: 1240, diff: 1.5, minLen: 2, interval: 8335, react: 1320, perChar: 583, counters: 1, typo: 2 },
      { wpm: 52, hp: 1980, diff: 2, minLen: 3, interval: 7746, react: 1240, perChar: 368, counters: 2, typo: 3 },
      { wpm: 68, hp: 2840, diff: 2.5, minLen: 3, interval: 7158, react: 1160, perChar: 255, counters: 2, typo: 3 },
      { wpm: 84, hp: 3810, diff: 3, minLen: 3, interval: 6569, react: 1080, perChar: 185, counters: 3, typo: 4 },
    ],
  };
  // the titans sit between the Breach bosses in the lap, so their floors are halfway between
  const mid = (a, b) => a.map((r, i) => r && Object.fromEntries(Object.keys(r).map(k => [k, Math.round((r[k] + b[i][k]) / 2 * 10) / 10])));
  Object.assign(FLOORS, {
    siege: mid(FLOORS.spam, FLOORS.sign), warden: mid(FLOORS.sign, FLOORS.announcer),
    colossus: mid(FLOORS.announcer, FLOORS.press), king: mid(FLOORS.press, FLOORS.correction),
    half: mid(FLOORS.correction, FLOORS.syntax), brute: mid(FLOORS.correction, FLOORS.syntax),
  });
  const FLOOR_STEP = 16;     // wpm added to the floor for each mark past V

  // ---------- the Breach moves' own words ----------
  // The Signboard's sign: [shown, answer]. From js/breach/data.js.
  const SIGNS = [['NODLES', 'noodles'], ['FRIDE RICE', 'fried rice'], ['MASAGE', 'massage'], ['COFEE', 'coffee'],
    ['KARAOKEE', 'karaoke'], ['DUMPLINS', 'dumplings'], ['PHONE REPIAR', 'phone repair'], ['OPEN 24 HOURES', 'open 24 hours'],
    ['BARBR SHOP', 'barber shop'], ['LAUNDRYY', 'laundry'], ['PHARMCY', 'pharmacy'], ['BAKREY', 'bakery']];
  // The Correction's question. The first option is spelled right. From js/breach/data.js.
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
  // Glitched words (digits in place of letters) were dropped on 28 Nov 2026 (Gid: they read as typos). Kept
  // only so old saves and tools that read D.GLITCH don't break.
  const GLITCH = { o: ['0'], e: ['3'], a: ['4', '@'], i: ['1'], s: ['5', '$'], t: ['7'], l: ['1'] };
  // The near-miss boost word Art sends. Tech words that never read like a typo.
  const BOOST_WORDS = ['overclock', 'hotfix', 'failsafe', 'uplink', 'reboot', 'backdoor', 'override', 'patch'];

  // ---------- phases and signature moves ----------
  // A fight has three phases: from full HP, from 66% and from 33%. Each phase change
  // pauses the boss's attacks for STAGE_PAUSE, speeds the music up and shortens the gaps
  // between attacks by PACE. Phase 3 is the boss's signature move in full.
  const STAGES = [0.66, 0.33];
  const PACE = [1, 0.8, 0.64];
  const STAGE_PAUSE = 1600;
  // Each boss's signature runs the whole fight, between its big attacks. gap is the time
  // between two of them in word-times at the fight's speed (one word is about 5.5 letters
  // at S wpm), kept between 1.7 and 9 s before the phase pace. A signature attack that
  // lands costs SIG_HIT integrity (more from mark II) without breaking the combo.
  //   popup  The Spam: pop-ups stay open until typed; a fourth one bites (cap 3)
  //   sign   The Signboard: a sign falls; type it before it lands
  //   mute   The Announcer: volume climbs (rise per second, by phase); a muted speaker
  //          takes drop off; at full volume it shouts
  //   page   The Press: pages slide at you; heat pages typed in a row overheat it
  //   pen    The Correction: writes a wrong version over a word in your line; type the
  //          crossed-out word for 1.5x damage, the red one hurts
  //   byte   Syntax Error: packets to send back for double damage; from phase 3 one of
  //          each pair is a fake (decoy) that hurts if typed and does nothing if it lands
  const SIG = {
    spam: { kind: 'popup', name: 'Pop-ups', gap: 3.2, cap: 3, text: 'Type pop-ups to close them. If three are open, the next one bites.' },
    sign: { kind: 'sign', name: 'Falling signs', gap: 3, text: 'Type each falling sign before it lands.' },
    announcer: { kind: 'mute', name: 'Volume', gap: 2.6, cap: 3, rise: [0.045, 0.06, 0.08], drop: 0.24, text: 'Type the speakers to turn the volume down. At full volume it shouts.' },
    press: { kind: 'page', name: 'Pages', gap: 2.4, heat: 5, text: 'Type pages before they reach you. Five in a row overheats the press.' },
    correction: { kind: 'pen', name: 'Red pen', gap: 3.4, text: 'It writes a wrong word over yours. Type the crossed-out word and ignore the red one.' },
    siege: { kind: 'sign', name: 'Falling rubble', gap: 3, text: 'Type each falling block before it lands.' },
    warden: { kind: 'pen', name: 'Firewall rules', gap: 3.4, text: 'It writes a blocked word over yours. Type the crossed-out word and ignore the red one.' },
    colossus: { kind: 'byte', name: 'Data blocks', gap: 2.8, text: 'Type data blocks to throw them back. From phase 3 the red ones are fakes so let them land.' },
    king: { kind: 'popup', name: 'Decrees', gap: 3.2, cap: 3, text: 'Type decrees to tear them up. If three are open, the next one bites.' },
    half: { kind: 'pen', name: 'Bad compile', gap: 3.2, text: 'It rewrites a word in your line. Type the crossed-out word and ignore the red one.' },
    brute: { kind: 'page', name: 'Pistons', gap: 2.5, heat: 5, text: 'Type pistons before they reach you. Five in a row overheats it.' },
    syntax: { kind: 'byte', name: 'Packets', gap: 2.6, text: 'Type packets to send them back. From phase 3 the red ones are fakes so let them land.' },
  };
  // Each titan's own attacks: a wind-up picks one of three. wind scales the wind-up's length and hit the
  // integrity it costs when it lands; a slower, bigger blow hits harder and a quick one hits lighter, so the
  // three average 1 and the fight's balance stays as the director sized it. short is the word on the lit
  // counter words (BLOCK SLAM). The Siege Titan's double slam (its own move) always uses its slam at 1 and 1.
  const ATTACKS = {
    siege: [{ id: 'fists', name: 'Double-fist slam', short: 'SLAM', wind: 1.12, hit: 1.1 }, { id: 'hook', name: 'Siege hook', short: 'HOOK', wind: 0.95, hit: 0.8 }, { id: 'stomp', name: 'Quake stomp', short: 'STOMP', wind: 1, hit: 1 }],
    warden: [{ id: 'bash', name: 'Shield bash', short: 'BASH', wind: 0.95, hit: 0.8 }, { id: 'sweep', name: 'Blade sweep', short: 'SWEEP', wind: 1, hit: 1 }, { id: 'cleave', name: 'Firewall cleave', short: 'CLEAVE', wind: 1.12, hit: 1.1 }],
    colossus: [{ id: 'storm', name: 'Block storm', short: 'STORM', wind: 1.12, hit: 1.1 }, { id: 'lash', name: 'Tail lash', short: 'LASH', wind: 0.95, hit: 0.8 }, { id: 'beam', name: 'Core beam', short: 'BEAM', wind: 1, hit: 1 }],
    king: [{ id: 'shock', name: 'Throne shockwave', short: 'SHOCKWAVE', wind: 1.12, hit: 1.1 }, { id: 'decree', name: 'Royal decree', short: 'DECREE', wind: 0.95, hit: 0.8 }, { id: 'crush', name: 'Gauntlet crush', short: 'CRUSH', wind: 1, hit: 1 }],
    half: [{ id: 'split', name: 'Glitch split', short: 'SPLIT', wind: 1, hit: 1 }, { id: 'lash', name: 'Wire lash', short: 'LASH', wind: 0.95, hit: 0.8 }, { id: 'crash', name: 'Stack crash', short: 'CRASH', wind: 1.12, hit: 1.1 }],
    brute: [{ id: 'piston', name: 'Piston punch', short: 'PUNCH', wind: 0.95, hit: 0.8 }, { id: 'vent', name: 'Steam blast', short: 'STEAM', wind: 1, hit: 1 }, { id: 'pound', name: 'Hammer pound', short: 'POUND', wind: 1.12, hit: 1.1 }],
  };
  const SIG_HIT = 4;          // integrity a landed signature attack costs at mark I, +2 a mark, at most 14
  // each boss's music, one track at three speeds, one per phase (audio/rush-<id>-<phase>.mp3)
  const musicFor = (id, stage) => `rush-${(ROSTER.find(b => b.id === id) || {}).music || id}-${stage}`;

  // ---------- fight constants ----------
  const UNIT = 10;            // boss damage per letter before multipliers, which makes the numbers read as damage
  const PLAYER_HP = 100;      // the player's integrity
  const STUN_MS = 3200;       // a blocked wind-up stuns the boss this long
  const LONG_STUN_MS = 6000;  // a finished move stuns it this long
  const STUN_MULT = 2;        // words hit double while it is stunned
  const WEAK_FRAC = 0.05;     // a weak point word takes 5% of max HP times the word's multiplier
  const SHIELD_FRAC = 0.15;   // the mark II firewall holds 15% of max HP
  const SPELL_REF = 700;      // spell damage scales by max HP / 700
  const SPELL_CAP = 0.4;      // one cast takes at most 40% of max HP (zero day 75%)
  const SPELL_CAP_ULT = 0.75;

  // ---------- scoring ----------
  // A win scores round((100 + 25n) * speed * accuracy * health) + 4 per best combo + 30 per spell.
  // speed = sized time / kill time, from 0.5 to 2. accuracy = (acc / 100)^2. health = 0.75 + 0.5 * integrity left.
  // A win on the retry scores half. RUSH.md has the worked example.
  function bossScore({ n, secs, sizedSecs, acc, hpLeft, bestCombo, casts, retry }) {
    const speed = Math.max(0.5, Math.min(2, sizedSecs / Math.max(1, secs)));
    const accK = Math.pow(Math.max(0, Math.min(100, acc)) / 100, 2);
    const health = 0.75 + 0.5 * Math.max(0, Math.min(1, hpLeft));
    const s = Math.round((100 + 25 * n) * speed * accK * health) + 4 * (bestCombo || 0) + 30 * (casts || 0);
    return retry ? Math.round(s / 2) : s;
  }

  return {
    ROSTER, TWISTS, FLOORS, FLOOR_STEP, SIGNS, SPELL, GLITCH, BOOST_WORDS, STAGES, PACE, STAGE_PAUSE, SIG, SIG_HIT, ATTACKS, musicFor,
    UNIT, PLAYER_HP, STUN_MS, LONG_STUN_MS, STUN_MULT, WEAK_FRAC, SHIELD_FRAC, SPELL_REF, SPELL_CAP, SPELL_CAP_ULT,
    slot, twistsFor, markName, bossScore,
  };
})();
