// Spell registry: the data for every spell. No three.js and no sound here, so a
// server can load it too. The 3D effects are in fx3d.js and the sounds in sfx.js,
// both keyed by the spell id.
//
// A spell:
//   id       'electro-storm'          key for the effect, the sound and the event payloads
//   word     'electro storm'          what the player types, lower case, two words
//   rarity   1 common (combo 10), 2 rare (25), 3 epic (50), 4 ultimate (100)
//   label    short chip text that says what it does
//   text     one sentence for help pages
//   color    the effect's main colour
//   hits     [{ at: ms after the cast, power }]   power is damage before multipliers
//   plan(c)  optional: builds the hits from the caster's state (echo pulse uses it)
//   strike   the sound each hit plays
//   effect   what the mode applies besides damage. Every key is optional:
//            status: 'ward' | 'hyper' | 'root' | 'split' | 'purge'   a status on the caster
//            ms, charges, mult, pierce                              the status's length, uses, damage multiplier, shield pierce
//            debuff: 'freeze' | 'stun'                              on the target, for ms
//            crits: n                                               the caster's next n hits crit
//            vsShield: x                                            damage times x against a shield
//            clearAdds, returnShots, cleanse, echo: n, break: true  mode utilities (see COMBAT.md)
//            heal: f                                                restores f of the caster's max HP
// Combat.registerSpell(spell) adds one at run time, for a mode with its own spells.
window.Combat = window.Combat || {};
(() => {
  const seq = (n, start, gap, power) => Array.from({ length: n }, (_, i) => ({ at: start + i * gap, power }));
  const RARITY = [
    null,
    { id: 1, name: 'Common', at: 10 },
    { id: 2, name: 'Rare', at: 25 },
    { id: 3, name: 'Epic', at: 50 },
    { id: 4, name: 'Ultimate', at: 100 },
  ];
  const SPELLS = [
    // common, from combo 10
    { id: 'data-spike', word: 'data spike', rarity: 1, label: 'Burst', color: '#39ff88', strike: 'crack',
      text: 'Three crystal spikes burst out of the floor under the target.', hits: seq(3, 320, 150, 22) },
    { id: 'safe-mode', word: 'safe mode', rarity: 1, label: 'Blocks next hit', color: '#7dffc4', strike: null,
      text: 'A shield goes up around you and stops the next attack that would hit you.', hits: [],
      effect: { status: 'ward', charges: 1, ms: 30000 } },
    // a self heal since its green rain read as healing (Gid, 25 Nov 2026)
    { id: 'binary-rain', word: 'binary rain', rarity: 1, label: 'Heals you', color: '#5dff9e', strike: null,
      text: 'Zeros and ones rain down on you and restore a fifth of your HP.', hits: [],
      effect: { heal: 0.2 } },
    { id: 'echo-pulse', word: 'echo pulse', rarity: 1, label: 'Repeats 8 words', color: '#9ff3ff', strike: 'pulse',
      text: 'Rings carry the damage of your last eight words to the target again.', hits: [],
      plan: c => (c.recent || []).slice(-8).map((p, i) => ({ at: 500 + i * 120, power: Math.max(1, p) })),
      effect: { echo: 8 } },
    { id: 'glitch-blade', word: 'glitch blade', rarity: 1, label: 'Breaks firewalls', color: '#ff5cf0', strike: 'slice',
      text: 'One huge glitching slash that deals triple damage to a firewall.', hits: [{ at: 230, power: 70 }],
      effect: { vsShield: 3 } },
    { id: 'cryo-lock', word: 'cryo lock', rarity: 1, label: 'Freezes attack', color: '#bfefff', strike: 'ice',
      text: 'Ice locks the target and gives you 5 more seconds on its next attack.', hits: [{ at: 600, power: 30 }],
      effect: { debuff: 'freeze', ms: 5000 } },
    // rare, from combo 25
    { id: 'electro-storm', word: 'electro storm', rarity: 2, label: 'Lightning', color: '#9fd8ff', strike: 'zap',
      text: 'A storm cloud forms over the target and lightning strikes it seven times.', hits: seq(7, 800, 380, 22) },
    { id: 'hyper-thread', word: 'hyper thread', rarity: 2, label: 'x2 for 8s', color: '#ffb066', strike: null,
      text: 'Your attacks deal double damage for 8 seconds.', hits: [],
      effect: { status: 'hyper', ms: 8000, mult: 2 } },
    { id: 'packet-storm', word: 'packet storm', rarity: 2, label: 'Returns packets', color: '#3ee6ff', strike: 'blip',
      text: 'A swarm of packets circles the target and dives in, and every packet thrown at you goes back.',
      hits: seq(16, 1000, 85, 9), effect: { returnShots: true } },
    { id: 'neon-nova', word: 'neon nova', rarity: 2, label: 'Clears bugs', color: '#ff4fd8', strike: 'boom',
      text: 'A neon blast bursts out of the target and destroys every bug around it.', hits: [{ at: 480, power: 180 }],
      effect: { clearAdds: true } },
    { id: 'system-purge', word: 'system purge', rarity: 2, label: 'Clears debuffs', color: '#b6ff5c', strike: 'sweep',
      text: 'A scan sweeps the field, clears your debuffs and keeps new ones off for 6 seconds.', hits: [{ at: 700, power: 90 }],
      effect: { cleanse: true, status: 'purge', ms: 6000 } },
    // epic, from combo 50
    { id: 'void-sphere', word: 'void sphere', rarity: 3, label: 'Black hole', color: '#b86bff', strike: 'thrum',
      text: 'A black orb grows into a black hole that pulls the target in, then collapses for big damage.',
      hits: [...seq(6, 1000, 260, 12), { at: 2900, power: 340 }], effect: { break: true } },
    { id: 'kernel-panic', word: 'kernel panic', rarity: 3, label: 'Stun', color: '#3d7bff', strike: 'crash',
      text: 'The target freezes for 4 seconds, its attacks miss you and your next 6 hits crit.', hits: [{ at: 380, power: 80 }],
      effect: { debuff: 'stun', ms: 4000, crits: 6 } },
    { id: 'root-access', word: 'root access', rarity: 3, label: 'Exposes core', color: '#ffc46b', strike: 'lock',
      text: 'Opens a weak point for 6 seconds: double damage that goes through shields.', hits: [{ at: 500, power: 40 }],
      effect: { status: 'root', ms: 6000, mult: 2, pierce: true } },
    { id: 'quantum-split', word: 'quantum split', rarity: 3, label: 'Saves combo', color: '#d6b8ff', strike: null,
      text: 'Two copies of you take your next 2 typos, so your combo stays.', hits: [],
      effect: { status: 'split', charges: 2, ms: 45000 } },
    // ultimate, combo 100
    { id: 'zero-day', word: 'zero day', rarity: 4, label: 'Ultimate', color: '#ff3b4f', strike: 'ultimate',
      text: 'The screen goes dark and a lance of code splits the target for huge damage.', hits: [{ at: 2000, power: 1500 }],
      effect: { pierce: true, break: true } },
  ];

  const byId = new Map(), byWord = new Map();
  function registerSpell(s) {
    if (!s || !s.id || !s.word) throw new Error('A spell needs an id and a word');
    s.hits ||= [];
    s.effect ||= {};
    byId.set(s.id, s); byWord.set(s.word, s);
    return s;
  }
  SPELLS.forEach(registerSpell);

  // the hits for one cast: a plan built from the caster, or the fixed list
  function hitsFor(s, caster = {}) {
    const h = s.plan ? s.plan(caster) : s.hits;
    return h.map(x => ({ at: x.at, power: x.power }));
  }

  Object.assign(Combat, {
    RARITY,
    SPELLS: () => [...byId.values()],
    spell: id => byId.get(id) || null,
    spellByWord: w => byWord.get(w) || null,
    registerSpell,
    hitsFor,
  });
})();
