// Every coin and XP amount the daily loop pays, in one place, since the economy is not
// settled yet. js/app/progress.js reads this object and nothing else for amounts.
// For scale: a 60-second test at 80 wpm and 96% accuracy pays about 37 coins and 115 XP.
window.REWARDS = {
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
