// Every coin and XP amount the daily loop pays, in one place, since the economy is not
// settled yet. js/app/progress.js reads this object and nothing else for amounts.
// For scale: a 60-second test at 80 wpm and 96% accuracy pays about 37 coins and 115 XP.
window.REWARDS = {
  // The shop (Gid, 25 Nov 2026). Coins are the only currency and every item can be bought
  // with coins earned by playing. The CTRL Pass doubles the coins you earn while it runs,
  // coin packs sell coins, and premium items (the high-quality props and gear) cost a lot
  // of coins. Prices are proposals until Gid and Art settle them; payments need the server.
  shop: {
    payments: false,      // the CTRL Pass and coin packs stay hidden until this is true (Gid, 25 Nov)
    pass: { name: 'CTRL Pass', coinMult: 2, days: 30, price: 'US$4.99 a month' },
    packs: [
      { id: 'pack-1200', coins: 1200, price: 'US$0.99' },
      { id: 'pack-6500', coins: 6500, price: 'US$4.99' },
      { id: 'pack-14000', coins: 14000, price: 'US$9.99' },
      { id: 'pack-30000', coins: 30000, price: 'US$19.99' },
      { id: 'pack-80000', coins: 80000, price: 'US$49.99' },
    ],
    premiumFrom: 25000,   // an item at this price or more shows as Premium
    // Operator gear (MODELS.md). The outfit from the Gemini sheets is free: beanie, visor, scarf,
    // wrist device, belt pouches, harness and the Slab keyboard. These are sold. Keyboards are the
    // operators' weapons, the way other games sell gun skins; they change the look, never the damage. Each one names
    // the operator slot it unlocks (acc: an accessory, kb: a keyboard style); premium models
    // generated later join this list with the same slots.
    // Seasonal and limited items (Gid, 25 Nov 2026): add from and until (dates, 'YYYY-MM-DD') and
    // the item is in the shop only between them, with the days left on its card. Whoever bought
    // it keeps it after it leaves. It's still bought with coins, so anyone can earn it in time;
    // money only buys coins or the pass, never an item.
    //   { id: 'kb-frost', name: 'Frost keyboard', price: 6000, kb: 'frost', from: '2026-12-15', until: '2027-01-05' }
    gear: [
      { id: 'op-mask', name: 'Face mask', price: 1200, acc: 'mask', icon: 'mask' },
      { id: 'kb-compact', name: 'Compact keyboard', price: 1800, kb: 'compact', icon: 'kb-compact', desc: 'Needles: your shots fly as three thin bolts at once.' },
      { id: 'kb-split', name: 'Split keyboard', price: 2500, kb: 'split', icon: 'kb-split', desc: 'Twin: your shots leave from both halves and cross on the target.' },
      { id: 'kb-arc', name: 'Arc keyboard', price: 3500, kb: 'arc', icon: 'kb-arc', desc: 'Storm: your shots fly as forked lightning.' },
    ],
    // Bot parts for the hangar (Gid, 27 Nov 2026: "we definitely need more. and of course buyable").
    // part is the look key in BotKit (js/app/botkit.js) and v its value. Each one can be tried on in the
    // hangar first and bought there or in the shop; a part you don't own stays off your bot in fights.
    bot: [
      { id: 'bot-eyes-dots', name: 'Dot eyes', price: 500, part: 'eyes', v: 'dots' },
      { id: 'bot-eyes-big', name: 'Sparkle eyes', price: 700, part: 'eyes', v: 'big' },
      { id: 'bot-eyes-sleepy', name: 'Sleepy eyes', price: 600, part: 'eyes', v: 'sleepy' },
      { id: 'bot-eyes-wink', name: 'Wink', price: 800, part: 'eyes', v: 'wink' },
      { id: 'bot-eyes-star', name: 'Star eyes', price: 900, part: 'eyes', v: 'star' },
      { id: 'bot-eyes-heart', name: 'Heart eyes', price: 900, part: 'eyes', v: 'heart' },
      { id: 'bot-blush', name: 'Blush', price: 400, part: 'blush', v: 'on' },
      { id: 'bot-shell-mint', name: 'Mint shell', price: 800, part: 'shell', v: 'mint' },
      { id: 'bot-shell-sky', name: 'Sky shell', price: 800, part: 'shell', v: 'sky' },
      { id: 'bot-shell-lilac', name: 'Lilac shell', price: 800, part: 'shell', v: 'lilac' },
      { id: 'bot-shell-peach', name: 'Peach shell', price: 800, part: 'shell', v: 'peach' },
      { id: 'bot-shell-pearl', name: 'Pearl shell', price: 1800, part: 'shell', v: 'pearl' },
      { id: 'bot-shell-rose', name: 'Rose gold shell', price: 2500, part: 'shell', v: 'rose' },
      { id: 'bot-shell-gold', name: 'Gold shell', price: 4000, part: 'shell', v: 'gold' },
      { id: 'bot-top-antenna', name: 'Antenna ball', price: 600, part: 'top', v: 'antenna' },
      { id: 'bot-top-party', name: 'Party hat', price: 700, part: 'top', v: 'party' },
      { id: 'bot-top-bow', name: 'Bow', price: 900, part: 'top', v: 'bow' },
      { id: 'bot-top-flower', name: 'Flower', price: 900, part: 'top', v: 'flower' },
      { id: 'bot-top-cap', name: 'Cap', price: 1000, part: 'top', v: 'cap' },
      { id: 'bot-top-headphones', name: 'Headphones', price: 1500, part: 'top', v: 'headphones' },
      { id: 'bot-top-propeller', name: 'Propeller cap', price: 2000, part: 'top', v: 'propeller' },
      { id: 'bot-top-crown', name: 'Crown', price: 5000, part: 'top', v: 'crown' },
      { id: 'bot-back-balloon', name: 'Heart balloon', price: 1200, part: 'back', v: 'balloon' },
      { id: 'bot-back-cape', name: 'Cape', price: 1500, part: 'back', v: 'cape' },
      { id: 'bot-back-jets', name: 'Twin jets', price: 1800, part: 'back', v: 'jets' },
      { id: 'bot-glow-rainbow', name: 'Rainbow glow', price: 6000, part: 'color', v: 'rainbow' },
      { id: 'bot-glow-ember', name: 'Ember glow', price: 4500, part: 'color', v: 'ember' },
      { id: 'bot-glow-frost', name: 'Frost glow', price: 4500, part: 'color', v: 'frost' },
      { id: 'bot-glow-galaxy', name: 'Galaxy glow', price: 5500, part: 'color', v: 'galaxy' },
      { id: 'bot-shell-lime', name: 'Lime shell', price: 800, part: 'shell', v: 'lime' },
      { id: 'bot-shell-bubblegum', name: 'Bubblegum shell', price: 800, part: 'shell', v: 'bubblegum' },
      { id: 'bot-shell-cherry', name: 'Cherry shell', price: 1200, part: 'shell', v: 'cherry' },
      { id: 'bot-shell-midnight', name: 'Midnight shell', price: 2200, part: 'shell', v: 'midnight' },
      { id: 'bot-shell-holo', name: 'Holo shell', price: 3500, part: 'shell', v: 'holo' },
      { id: 'bot-eyes-anime', name: 'Anime eyes', price: 900, part: 'eyes', v: 'anime' },
      { id: 'bot-eyes-squint', name: 'Squint eyes', price: 600, part: 'eyes', v: 'squint' },
      { id: 'bot-eyes-glasses', name: 'Glasses', price: 1000, part: 'eyes', v: 'glasses' },
      { id: 'bot-eyes-cyclops', name: 'Cyclops eye', price: 1200, part: 'eyes', v: 'cyclops' },
      { id: 'bot-top-sprout', name: 'Sprout', price: 600, part: 'top', v: 'sprout' },
      { id: 'bot-top-cat', name: 'Cat ears', price: 1200, part: 'top', v: 'cat' },
      { id: 'bot-top-beanie', name: 'Beanie', price: 1000, part: 'top', v: 'beanie' },
      { id: 'bot-top-horns', name: 'Horns', price: 1500, part: 'top', v: 'horns' },
      { id: 'bot-top-chef', name: 'Chef hat', price: 1500, part: 'top', v: 'chef' },
      { id: 'bot-top-halo', name: 'Halo', price: 2500, part: 'top', v: 'halo' },
      { id: 'bot-top-wizard', name: 'Wizard hat', price: 3000, part: 'top', v: 'wizard' },
      { id: 'bot-back-backpack', name: 'Backpack', price: 1200, part: 'back', v: 'backpack' },
      { id: 'bot-back-bat', name: 'Bat wings', price: 2200, part: 'back', v: 'bat' },
      { id: 'bot-back-angel', name: 'Angel wings', price: 2500, part: 'back', v: 'angel' },
      { id: 'bot-back-rocket', name: 'Rocket', price: 3000, part: 'back', v: 'rocket' },
    ],
    // the reasons WPM.addCoins doubles while the pass runs: coins earned by playing,
    // never refunds, bought packs or the shop
    earned: ['typing', 'boss rush', 'world boss', 'achievement', 'task', 'weekly', 'streak', 'academy', 'free typing', 'level up', 'gift', 'party', 'duel', 'superboss'],
  },

  // Sign-in streak. Day 1 to 7 of each week of the streak, then it starts again at day 1
  // with the week bonus added.
  streak: {
    days: [
      { coins: 20, xp: 20 },
      { coins: 30, xp: 30 },
      { coins: 40, xp: 40, gift: true },
      { coins: 50, xp: 50 },
      { coins: 60, xp: 60 },
      { coins: 80, xp: 80 },
      { coins: 200, xp: 150, gift: true },
    ],
    weekBonus: 0.1,      // each full week already in the streak adds 10% to the day's coins and XP
    weekBonusMax: 0.5,   // up to 50%
    shieldsPerWeek: 1,   // one missed day a week (Monday to Sunday) is forgiven
  },

  // Daily tasks by tier, the bonus for finishing all three and the weekly tasks.
  tasks: {
    easy: { coins: 30, xp: 40 },
    medium: { coins: 50, xp: 70 },
    hard: { coins: 80, xp: 110 },
    allDaily: { coins: 60, xp: 60 },
    weekly: { coins: 250, xp: 300 },
    allWeekly: { coins: 400, xp: 400 },
  },

  // Achievements by tier. Hidden ones pay the hidden amount.
  achievements: {
    1: { coins: 50, xp: 50 },
    2: { coins: 120, xp: 120 },
    3: { coins: 300, xp: 300 },
    hidden: { coins: 150, xp: 150 },
  },

  // Boss Rush, on top of what WPM.record pays for the run's typing. Kept small until the
  // economy is settled. js/app/rush/page.js reads these.
  rush: {
    boss: { coins: 5, xp: 8, perMark: 2 },   // each boss beaten: 5 coins plus 2 for each mark past I, and 8 XP
    run: { coins: 10, xp: 20, minBosses: 3 }, // a run that beats at least 3 bosses
    newBest: { coins: 25 },                   // a new best run (bosses beaten) on this device
    maxPerRun: 250,                           // rush coins in one run stop here
  },

  // Random room items.
  // Surprise drops (Gid, 25 Nov 2026): finishing something may bring a bonus, never on a
  // schedule a player can count on. Drops are earned only and are never sold, so no paid random
  // boxes. A drop waits in the gift crate and opens on the next page that isn't a game.
  //   chance       a task, all of a day's or week's tasks, or an achievement
  //   winPerMin    a win's chance grows with the game's length: 5% a minute, up to winMax,
  //                so a 2-minute duel is 10% and a 10-minute raid 50%
  //   pityMins     bad-luck protection counts minutes played, not finishes, so many short
  //                games and one long one count the same: after this many minutes of play
  //                without a drop, the next finish always drops
  //   perDay       the day's cap, a number from lo to hi picked fresh each day
  //   coins: [lo, hi]   boost: x mult on coins earned by playing, for mins after it opens
  //   gift: a room item, as the gift crate picks it   jackpot: shown as a jackpot
  drops: {
    chance: { task: 0.35, weekly: 0.6, alldone: 0.5, achievement: 0.4 },
    winPerMin: 0.05, winMax: 0.6,
    table: [
      { w: 55, coins: [40, 120] },
      { w: 25, coins: [150, 400] },
      { w: 12, boost: { mult: 1.5, mins: 15 } },
      { w: 5, gift: true },
      { w: 3, coins: [1000, 1000], jackpot: true },
    ],
    pityMins: 20,
    perDay: [5, 10],
  },

  gifts: {
    streakDays: [3, 7],       // days of the 7-day cycle that bring a gift
    sessionChance: 1 / 6,     // chance after any finished run
    sessionMaxPerDay: 1,      // at most this many gifts from runs a day
    monthly: true,            // one gift on the first sign-in of each calendar month
    maxPrice: 2500,           // shop items above this price never come as gifts
    giftOnlyShare: 0.35,      // chance the gift is a gift-only item while any are left
    allOwnedCoins: 200,       // paid instead when every possible gift is owned
  },

  // Superboss (js/app/superboss.js, SUPERBOSS.md). Viewers pay these in coins to send
  // an item to the streamer's fight. Support items help, chaos items make it harder.
  superboss: {
    support: { shield: 40, overclock: 60, heal: 30, slowmo: 50, hype: 25 },
    chaos: { fog: 35, shuffle: 15, speed: 45 },
    hypeGoal: 300,      // coins of support that fill the hype train; a hype item counts 3 times its price
    hypeItemK: 3,
    // coins the streamer gets for a win, by difficulty, on top of the usual typing coins
    win: { casual: 40, normal: 80, hard: 140, typemaster: 220, brutal: 320 },
  },
};

// Keyspace milestones for the world map (js/app/activity.js, js/app/worldmap.js).
// Every threshold of words typed by everyone, in total, brings a node of Keyspace online
// as a permanent marker on the map. The four districts take their names from the places
// in STORY/WORLD.md that the update passed through; the rest are numbered nodes.
// A country gets a permanent beacon the first day it reaches beaconPlayers players.
window.KEYSPACE = {
  launchDate: '2026-01-26',   // day 1 of the site; 2026-11-21 is day 300
  beaconPlayers: 100,
  nodes: [
    { words: 10e6, name: '10M words', lon: -42, lat: 8 },
    { words: 25e6, name: '25M words', lon: 163, lat: 12 },
    { words: 50e6, name: 'Stream chat', district: true, lon: -132, lat: 24 },
    { words: 100e6, name: '100M words', lon: -28, lat: -30 },
    { words: 200e6, name: 'Night market', district: true, lon: 86, lat: -12 },
    { words: 350e6, name: '350M words', lon: 40, lat: 70 },
    { words: 500e6, name: 'Line 2', district: true, lon: -152, lat: 56 },
    { words: 750e6, name: '750M words', lon: 150, lat: -44 },
    { words: 1000e6, name: '1B words', lon: -4, lat: 64 },
    { words: 1400e6, name: 'Firmware line', district: true, lon: 156, lat: 53 },
    { words: 1800e6, name: '1.8B words', lon: 22, lat: -46 },
    { words: 2500e6, name: '2.5B words', lon: -78, lat: 64 },
  ],
};
