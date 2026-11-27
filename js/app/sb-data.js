// Superboss data: the three bosses, the difficulty dial, the support and chaos items,
// and the lines the simulated chat types. No DOM, no three.js and no sound here, so the
// fight engine runs the same in a browser, a test in node and a future server.
// Prices come from REWARDS.superboss in js/app/rewards-config.js. SUPERBOSS.md has the rules.
window.SuperData = (() => {
  // ---------- the difficulty dial ----------
  // Every window in a fight (a block word, a weak point, a compile) is the time a typist at the
  // dial's wpm needs to react and type it, times a slack. Typemaster (150) is fair for Art and
  // anyone at 150 wpm or more.
  const DIALS = [
    { id: 'casual', name: 'Casual', wpm: 60 },
    { id: 'normal', name: 'Normal', wpm: 90 },
    { id: 'hard', name: 'Hard', wpm: 120 },
    { id: 'typemaster', name: 'Typemaster', wpm: 150 },
    { id: 'brutal', name: 'Brutal', wpm: 180 },
  ];
  const dial = id => DIALS.find(d => d.id === id) || DIALS[3];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function tune(id) {
    const d = dial(id);
    const wpm = d.wpm, cps = wpm * 5 / 60;
    const react = clamp(1150 - wpm * 4.5, 340, 900);
    return {
      id: d.id, name: d.name, wpm, cps, react,
      // ms to react and type n letters, with a slack on the typing part
      ms: (n, slack = 1.5) => Math.round(react + n / cps * 1000 * slack),
      // gaps between boss moves stretch for slower dials, so a casual fight is calmer and not only shorter windows
      gap: ms => Math.round(ms * Math.sqrt(150 / wpm)),
      diff: wpm <= 70 ? [1, 3] : wpm <= 100 ? [2, 4] : wpm <= 130 ? [2, 5] : wpm <= 160 ? [3, 6] : [4, 7],
      hint: wpm <= 90,          // the compiler shows the fixed word under each bug on Casual and Normal
    };
  }

  // ---------- bosses ----------
  // hpK scales the boss's HP, which is the dial's wpm times 26 times hpK.
  const BOSSES = [
    {
      id: 'hydra', name: 'Kernel Hydra', n: 1, hpK: 1, enrageS: 270,
      look: 'Three heads on one body, in a flooded server pit.',
      core: 'Each word hits the head in its colour. Heads left alone heal.',
      phases: [
        'Each word hits the head in its colour. Heads left alone heal.',
        'Patch puts cut heads back on now.',
        'The heads grow back in 6 seconds and Root\'s breath needs two words to block.',
      ],
      finish: ['sever every head', 'cut the kernel loose', 'no head grows back'],
      music: ['stage4', 'stage5', 'boss'],
      pal: [
        { bg: '#010605', a: '#39ff88', b: '#167a57', c: '#3ee6ff', bloom: 0.6 },
        { bg: '#060602', a: '#f2c230', b: '#7a5d12', c: '#39ff88', bloom: 0.65 },
        { bg: '#0b0203', a: '#ff4d5e', b: '#8a1b2a', c: '#f29d30', bloom: 0.72 },
      ],
      heads: [
        { id: 'fork', name: 'Fork', role: 'bites', theme: ['band1', 'band2'], len: [3, 5], hpK: 0.06 },
        { id: 'root', name: 'Root', role: 'breathes', theme: ['cyber'], len: [5, 9], hpK: 0.09 },
        { id: 'patch', name: 'Patch', role: 'mends', theme: ['mix'], len: [4, 8], hpK: 0.07 },
      ],
    },
    {
      id: 'compiler', name: 'The Compiler', n: 2, hpK: 0.9, enrageS: 285,
      look: 'A tower of screens that writes code at you.',
      core: 'Type the lit word before its line compiles.',
      phases: [
        'Type the lit word before its line compiles.',
        'Some lines have two bugs. Fix them left to right.',
        'Lines compile faster and two can arrive at once.',
      ],
      finish: ['exit with code zero', 'build failed for good', 'end of program'],
      music: ['stage2', 'stage3', 'wb-p3'],
      pal: [
        { bg: '#01040a', a: '#3ee6ff', b: '#145a73', c: '#39ff88', bloom: 0.6 },
        { bg: '#05030a', a: '#b779ff', b: '#4d2a7a', c: '#3ee6ff', bloom: 0.66 },
        { bg: '#0a0402', a: '#ff8a3d', b: '#8a3f12', c: '#ff4d5e', bloom: 0.72 },
      ],
      lines: [
        'let {w} = load(cfg);', 'if (!{w}) return null;', 'for (const k of {w}) send(k);', 'import {w} from "./core";',
        'export function {w}() {', '{w}.push(packet);', 'while ({w} < max) i++;', 'const port = {w}.listen(80);',
        'return {w} ?? fallback;', 'await {w}.flush();', 'log("{w} ok");', 'throw new Error({w});', 'queue.add({w}, 3);',
        'const {w} = new Map();', 'if ({w} > limit) drop();', 'self.{w} = true;',
      ],
    },
    {
      id: 'leviathan', name: 'Packet Leviathan', n: 3, hpK: 1, enrageS: 270,
      look: 'A serpent made of packets that circles the arena.',
      core: 'Type the lit weak point word before the segment passes. Triple damage.',
      phases: [
        'Type the lit weak point word before the segment passes.',
        'Ignore the red decoy.',
        'The weak point windows get shorter and the tail sweep needs two words to block.',
      ],
      finish: ['drop every packet', 'close the last port', 'sink the leviathan'],
      music: ['stage1', 'wb-p2', 'wb-p4'],
      pal: [
        { bg: '#010508', a: '#3ee6ff', b: '#0f5f6e', c: '#39ff88', bloom: 0.62 },
        { bg: '#01070a', a: '#39ffd2', b: '#0d6b5a', c: '#f2c230', bloom: 0.66 },
        { bg: '#08020a', a: '#ff4da6', b: '#7a1652', c: '#3ee6ff', bloom: 0.72 },
      ],
    },
  ];
  const boss = id => BOSSES.find(b => b.id === id) || BOSSES[0];

  // ---------- support and chaos ----------
  const R = () => (window.REWARDS && REWARDS.superboss) || {
    support: { shield: 40, overclock: 60, heal: 30, slowmo: 50, hype: 25 }, chaos: { fog: 35, shuffle: 15, speed: 45 }, hypeGoal: 300, hypeItemK: 3, win: {},
  };
  const ITEMS = [
    { id: 'shield', kind: 'support', name: 'Shield', text: 'Blocks the next hit on Art.' },
    { id: 'overclock', kind: 'support', name: 'Overclock', text: 'Art deals 50% more damage for 10 seconds.' },
    { id: 'heal', kind: 'support', name: 'Heal', text: 'Gives Art back 5% of his HP.' },
    { id: 'slowmo', kind: 'support', name: 'Slow mo', text: 'Attack wind-ups take 20% longer for 10 seconds.' },
    { id: 'hype', kind: 'support', name: 'Hype train', text: 'Fills the crowd meter three times as much as other items. A full meter gives Art a free spell.' },
    { id: 'fog', kind: 'chaos', name: 'Fog', text: 'Blurs Art\'s attack words for 5 seconds.' },
    { id: 'shuffle', kind: 'chaos', name: 'Shuffle', text: 'Swaps Art\'s next word for a new one.' },
    { id: 'speed', kind: 'chaos', name: 'Speed up', text: 'Attack wind-ups take 15% less time for 8 seconds.' },
  ];
  const item = id => ITEMS.find(i => i.id === id) || null;
  const price = id => { const r = R(), i = item(id); return i ? (r[i.kind] && r[i.kind][id]) || 0 : 0; };
  // limits that keep chaos from making a fight impossible
  const CHAOS = { gapMs: 12000, perPhase: 2, minArtHp: 0.3, quietStartMs: 8000, shuffleGapMs: 8000 };

  // ---------- simulated viewers ----------
  const HANDLES = ('nova_k keycap_kid pixelrat m1ss_typo linearfan tactile_tom qwerty_queen thockwave sprintkey jett.types ' +
    'bytebean clackattack homerow_hero lofi_lena capslock_carl ghostkeys tenkeyless dvorak_dan spacebar_sam zeroping ' +
    'mintswitch rgb_rory latte_typer kbd_kai inkline nightowl_ns backspace_bea fn_layer.jo pingu_types rapidfire_rae ' +
    'mx_milo typo_tamer glyphgirl cherry_red keymash_ken solderboy oyster_keys pudding_caps hotswap_hana macro_max').split(' ');
  const CHAT = {
    idle: ['lets gooo', 'art is cooking', 'how is he this fast', 'chat what wpm is this', 'clean', 'W stream', 'first time catching this live',
      'the keyboard sound is so good', 'ok this boss looks scary', 'focus art', 'he types like its nothing', 'what switches is he on',
      'smooth', 'this music goes hard', 'i can barely read the words', 'hi from manila', 'hi from bangkok', 'lurking but hype',
      'the hp bar is moving', 'calm hands', 'he hasnt missed once', 'type type type', 'this is my favourite boss'],
    hit: ['BIG HIT', 'that hit was huge', 'damage', 'look at that number', 'oof the boss felt that', 'clean hit'],
    crit: ['CRIT', 'that crit tho', 'NO WAY', 'massive', 'did you see that number'],
    spell: ['{spell} LETS GO', 'he cast {spell}', '{spell} is so clean', 'SPELL', 'that {spell} animation'],
    bigSpell: ['ZERO DAY OMG', 'THE SCREEN WENT DARK', 'that spell is insane', 'NO WAY', 'clip it'],
    phase: ['phase {n} incoming', 'PHASE {n}', 'here we go', 'it got angry', 'oh no new phase', 'phase {n} lets go'],
    enrage: ['ENRAGED', 'its enraged hurry', 'timer ran out', 'oh no oh no', 'speed up art'],
    hurt: ['ouch', 'that hurt', 'nooo', 'block it next time', 'hp going down', 'careful'],
    low: ['he is so low', 'HEAL HIM', 'someone send a heal', 'chat send shields', 'clutch time', 'dont die art'],
    block: ['blocked', 'nice block', 'BLOCKED', 'read it perfectly', 'reaction time crazy'],
    sever: ['HEAD OFF', 'cut it', 'one head down', 'cut patch next', 'he chopped it'],
    neck: ['ALL HEADS DOWN', 'neck is open', 'triple damage go go'],
    regrow: ['it grew back', 'ugh it regrew', 'cut it again'],
    compile: ['it compiled', 'bug got through', 'segfault lol', 'fix them faster'],
    order: ['wrong order', 'oldest line first art'],
    fix: ['fixed', 'clean build', 'debugging speedrun'],
    weak: ['WEAK POINT', 'he hit the weak spot', 'that read was so fast', 'how did he see that'],
    decoy: ['that was the decoy lol', 'he typed the red one', 'decoy got him'],
    support: ['thanks {who}', 'W {who}', '{who} with the {item}', '{item} incoming', 'love the {item}'],
    chaos: ['who sent {item} lmao', '{who} is evil', '{item} noooo', 'thats so mean {who}', 'chaos time'],
    hype: ['HYPE TRAIN', 'crowd spell lets go', 'we did it chat', 'choo choo'],
    finish: ['FINISH IT', 'type it type it', 'do it', 'last phrase go'],
    win: ['GG', 'GGGG', 'HE DID IT', 'what a fight', 'clip that', 'GG art', 'W', 'that was insane', 'run it back'],
    lose: ['nooo', 'so close', 'F', 'run it back', 'next one for sure', 'unlucky'],
    miss: ['typo lol', 'he missed one', 'fingers slipped'],
  };

  return { DIALS, dial, tune, BOSSES, boss, ITEMS, item, price, CHAOS, HANDLES, CHAT, R };
})();
