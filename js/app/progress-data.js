// What the daily loop is made of: the daily and weekly task templates, the achievements
// and the visual bonuses. Everything here reacts to events from WPM.track (PROGRESS.md
// lists them). js/app/progress.js runs it and js/app/rewards-config.js prices it.
window.ProgressData = (() => {
  const TYPING = /^(time-|words-|quote$|custom$)/;
  const fmt = n => Math.round(n).toLocaleString('en-US');

  // ---------- task templates ----------
  // ev: the event that moves it. n: the goal. when: only events that pass count.
  // add: how much one event adds (default 1). max: the task keeps the highest value instead.
  // distinct: counts different values only. tier picks the reward in REWARDS.tasks.
  const DAILY = [
    { id: 'tests3', ev: 'type_test', tier: 'easy', n: 3, text: 'Finish {n} typing tests' },
    { id: 'tests6', ev: 'type_test', tier: 'medium', n: 6, text: 'Finish {n} typing tests' },
    { id: 't60', ev: 'type_test', tier: 'easy', n: 1, when: e => e.mode === 'time-60', text: 'Finish a 60-second typing test' },
    { id: 't120', ev: 'type_test', tier: 'medium', n: 1, when: e => e.mode === 'time-120', text: 'Finish a 120-second typing test' },
    { id: 'quote2', ev: 'type_test', tier: 'easy', n: 2, when: e => e.mode === 'quote', text: 'Finish {n} quote tests' },
    { id: 'words100', ev: 'type_test', tier: 'medium', n: 1, when: e => e.mode === 'words-100', text: 'Finish a 100-word test' },
    { id: 'acc95', ev: 'type_test', tier: 'medium', n: 1, when: e => e.acc >= 95, text: 'Hit 95% accuracy in a typing test' },
    { id: 'acc90x3', ev: 'type_test', tier: 'medium', n: 3, when: e => e.acc >= 90, text: 'Finish {n} typing tests at 90% accuracy or higher' },
    { id: 'clean', ev: 'type_test', tier: 'hard', n: 1, when: e => e.acc >= 100 && e.ms >= 30000, text: 'Finish a test of 30 seconds or more at 100% accuracy' },
    { id: 'best', ev: 'run', tier: 'hard', n: 1, when: e => e.newBest && TYPING.test(e.mode), text: 'Beat your best wpm in any test mode' },
    { id: 'chars2k', ev: 'run', tier: 'easy', n: 2000, add: e => e.correct || 0, text: 'Type {n} correct characters' },
    { id: 'chars6k', ev: 'run', tier: 'medium', n: 6000, add: e => e.correct || 0, text: 'Type {n} correct characters' },
    { id: 'min5', ev: 'run', tier: 'medium', n: 5, add: e => (e.ms || 0) / 60000, text: 'Type for {n} minutes in total', unit: 'min' },
    { id: 'modes3', ev: 'run', tier: 'medium', n: 3, distinct: e => modeGroup(e.mode), text: 'Play {n} different modes', hint: 'Typing test, Race, Breach and the World Boss each count once.' },
    { id: 'race1', ev: 'race_done', tier: 'easy', n: 1, text: 'Finish a race' },
    { id: 'race3', ev: 'race_done', tier: 'medium', n: 3, text: 'Finish {n} races' },
    { id: 'racewin', ev: 'race_done', tier: 'hard', n: 1, when: e => e.won, text: 'Win a race against Art or your best run' },
    { id: 'boss150', ev: 'boss_hit', tier: 'easy', n: 150, add: e => e.dmg || 0, text: 'Deal {n} damage to Syntax Error' },
    { id: 'boss500', ev: 'boss_hit', tier: 'medium', n: 500, add: e => e.dmg || 0, text: 'Deal {n} damage to Syntax Error' },
    { id: 'block3', ev: 'boss_hit', tier: 'medium', n: 3, when: e => e.kind === 'block', text: "Block {n} of Syntax Error's attacks" },
    { id: 'combo25', ev: 'combo', tier: 'medium', n: 25, max: e => e.n, text: 'Reach a {n} combo', hint: 'Counts in Breach and the World Boss.' },
    { id: 'combo50', ev: 'combo', tier: 'hard', n: 50, max: e => e.n, text: 'Reach a {n} combo', hint: 'Counts in Breach and the World Boss.' },
    { id: 'breach1', ev: 'breach_stage', tier: 'medium', n: 1, text: 'Clear a Breach chapter' },
    { id: 'breachhard', ev: 'breach_stage', tier: 'hard', n: 1, when: e => e.difficulty === 'hard', text: 'Clear a Breach chapter on Hard' },
    { id: 'endless1', ev: 'breach_endless', tier: 'easy', n: 1, text: 'Play a run of Breach endless' },
    { id: 'endless5', ev: 'breach_endless', tier: 'medium', n: 5, max: e => e.level, text: 'Reach level {n} in Breach endless' },
    { id: 'room', ev: 'room_save', tier: 'easy', n: 1, text: 'Move or add an item in your room' },
    { id: 'lesson1', ev: 'lesson_pass', tier: 'easy', n: 1, text: 'Finish an academy lesson' },
    { id: 'lesson3', ev: 'lesson_pass', tier: 'medium', n: 3, text: 'Finish {n} academy lessons' },
    { id: 'spell10', ev: 'spell_cast', tier: 'medium', n: 10, text: 'Cast {n} spells' },
    { id: 'rush3', ev: 'rush_boss', tier: 'easy', n: 3, text: 'Beat {n} bosses in Boss rush' },
    { id: 'rush6run', ev: 'rush_run', tier: 'hard', n: 1, when: e => e.bosses >= 6, text: 'Beat 6 bosses in one Boss rush run' },
    { id: 'pvp1', ev: 'pvp_win', tier: 'hard', n: 1, text: 'Win a PvP match' },
  ];

  const WEEKLY = [
    { id: 'w-tests20', ev: 'type_test', tier: 'weekly', n: 20, text: 'Finish {n} typing tests' },
    { id: 'w-chars30k', ev: 'run', tier: 'weekly', n: 30000, add: e => e.correct || 0, text: 'Type {n} correct characters' },
    { id: 'w-min30', ev: 'run', tier: 'weekly', n: 30, add: e => (e.ms || 0) / 60000, text: 'Type for {n} minutes in total', unit: 'min' },
    { id: 'w-signin5', ev: 'signin', tier: 'weekly', n: 5, text: 'Sign in on {n} days' },
    { id: 'w-daily9', ev: 'task_done', tier: 'weekly', n: 9, when: e => !e.weekly, text: 'Finish {n} daily tasks' },
    { id: 'w-races10', ev: 'race_done', tier: 'weekly', n: 10, text: 'Finish {n} races' },
    { id: 'w-boss3k', ev: 'boss_hit', tier: 'weekly', n: 3000, add: e => e.dmg || 0, text: 'Deal {n} damage to Syntax Error' },
    { id: 'w-bosswin', ev: 'boss_win', tier: 'weekly', n: 1, text: 'Be in the fight when Syntax Error goes down' },
    { id: 'w-breach3', ev: 'breach_stage', tier: 'weekly', n: 3, text: 'Clear {n} Breach chapters' },
    { id: 'w-combo100', ev: 'combo', tier: 'weekly', n: 100, max: e => e.n, text: 'Reach a {n} combo' },
    { id: 'w-lesson5', ev: 'lesson_pass', tier: 'weekly', n: 5, text: 'Finish {n} academy lessons' },
    { id: 'w-pvp3', ev: 'pvp_win', tier: 'weekly', n: 3, text: 'Win {n} PvP matches' },
    { id: 'w-rush20', ev: 'rush_boss', tier: 'weekly', n: 20, text: 'Beat {n} bosses in Boss rush' },
  ];

  function modeGroup(m = '') {
    if (TYPING.test(m)) return 'test';
    if (m.startsWith('race')) return 'race';
    if (m.startsWith('horde') || m.startsWith('breach')) return 'breach';
    return m;
  }
  const taskText = t => t.text.replace('{n}', fmt(t.n));

  // ---------- achievements ----------
  // val(c, w) returns the current number and goal is the number to reach. c is the
  // counter object kept by progress.js and w is window.WPM. needs hides an achievement
  // until its event is registered so academy ones appear once the academy exists.
  const best = w => w.stats().bestWpm;
  const ACH = [
    // speed
    { id: 'first', group: 'Speed', tier: 1, name: 'First run', text: 'Finish one typing run.', goal: 1, val: (c, w) => w.stats().sessions },
    { id: 'wpm40', group: 'Speed', tier: 1, name: '40 wpm', text: 'Type 40 wpm in any run.', goal: 40, val: (c, w) => best(w), bar: false },
    { id: 'wpm60', group: 'Speed', tier: 1, name: '60 wpm', text: 'Type 60 wpm in any run.', goal: 60, val: (c, w) => best(w), bar: false },
    { id: 'wpm80', group: 'Speed', tier: 2, name: '80 wpm', text: 'Type 80 wpm in any run.', goal: 80, val: (c, w) => best(w), bar: false },
    { id: 'wpm100', group: 'Speed', tier: 2, name: '100 wpm', text: 'Type 100 wpm in any run.', goal: 100, val: (c, w) => best(w), bar: false },
    { id: 'wpm120', group: 'Speed', tier: 2, name: '120 wpm', text: 'Type 120 wpm in any run.', goal: 120, val: (c, w) => best(w), bar: false },
    { id: 'wpm150', group: 'Speed', tier: 3, name: '150 wpm', text: 'Type 150 wpm in any run.', goal: 150, val: (c, w) => best(w), bar: false },
    { id: 'beatart', group: 'Speed', tier: 3, name: 'Faster than Art', text: "Type more than Art's 204 wpm.", goal: 205, val: (c, w) => best(w), bar: false },
    // accuracy
    { id: 'acc95', group: 'Accuracy', tier: 1, name: 'Steady hands', text: 'Finish a typing test at 95% accuracy or higher.', goal: 1, val: c => c.acc95 },
    { id: 'clean', group: 'Accuracy', tier: 2, name: 'Clean run', text: 'Finish a test of 30 seconds or more at 100% accuracy.', goal: 1, val: c => c.clean },
    { id: 'clean5', group: 'Accuracy', tier: 3, name: 'Five clean runs', text: 'Finish 5 tests of 30 seconds or more at 100% accuracy.', goal: 5, val: c => c.clean },
    { id: 'acc96k', group: 'Accuracy', tier: 3, name: 'Sharpshooter', text: 'Type 50,000 keystrokes with 96% accuracy or higher overall.', goal: 50000, val: (c, w) => { const s = w.stats(); return s.accuracy >= 96 ? s.keys : 0; } },
    // volume
    { id: 'tests10', group: 'Typing', tier: 1, name: '10 tests', text: 'Finish 10 typing tests.', goal: 10, val: c => c.tests },
    { id: 'tests100', group: 'Typing', tier: 2, name: '100 tests', text: 'Finish 100 typing tests.', goal: 100, val: c => c.tests },
    { id: 'tests500', group: 'Typing', tier: 3, name: '500 tests', text: 'Finish 500 typing tests.', goal: 500, val: c => c.tests },
    { id: 'words1k', group: 'Typing', tier: 1, name: '1,000 words', text: 'Type 1,000 correct words in total.', goal: 1000, val: (c, w) => w.stats().correct / 5 },
    { id: 'words10k', group: 'Typing', tier: 2, name: '10,000 words', text: 'Type 10,000 correct words in total.', goal: 10000, val: (c, w) => w.stats().correct / 5 },
    { id: 'words100k', group: 'Typing', tier: 3, name: '100,000 words', text: 'Type 100,000 correct words in total.', goal: 100000, val: (c, w) => w.stats().correct / 5 },
    { id: 'hour1', group: 'Typing', tier: 2, name: 'One hour in', text: 'Type for 1 hour in total.', goal: 60, val: (c, w) => w.stats().ms / 60000, unit: 'min' },
    // sign-in streak
    { id: 'streak3', group: 'Streak', tier: 1, name: '3 day streak', text: 'Sign in 3 days in a row.', goal: 3, val: c => c.streakBest },
    { id: 'streak7', group: 'Streak', tier: 1, name: '7 day streak', text: 'Sign in 7 days in a row.', goal: 7, val: c => c.streakBest },
    { id: 'streak14', group: 'Streak', tier: 2, name: '14 day streak', text: 'Sign in 14 days in a row.', goal: 14, val: c => c.streakBest },
    { id: 'streak30', group: 'Streak', tier: 2, name: '30 day streak', text: 'Sign in 30 days in a row.', goal: 30, val: c => c.streakBest },
    { id: 'streak60', group: 'Streak', tier: 3, name: '60 day streak', text: 'Sign in 60 days in a row.', goal: 60, val: c => c.streakBest },
    { id: 'streak100', group: 'Streak', tier: 3, name: '100 day streak', text: 'Sign in 100 days in a row.', goal: 100, val: c => c.streakBest },
    { id: 'shield', group: 'Streak', tier: 1, name: 'Shielded', text: 'Keep your streak with a streak shield.', goal: 1, val: c => c.shields },
    // tasks
    { id: 'task1', group: 'Tasks', tier: 1, name: 'First task', text: 'Finish a daily task.', goal: 1, val: c => c.tasks },
    { id: 'alldaily', group: 'Tasks', tier: 1, name: 'Full day', text: 'Finish all 3 daily tasks in one day.', goal: 1, val: c => c.allDaily },
    { id: 'tasks50', group: 'Tasks', tier: 2, name: '50 tasks', text: 'Finish 50 daily tasks.', goal: 50, val: c => c.tasks },
    { id: 'weekly1', group: 'Tasks', tier: 1, name: 'Weekly task', text: 'Finish a weekly task.', goal: 1, val: c => c.weekly },
    { id: 'allweekly', group: 'Tasks', tier: 3, name: 'Full week', text: 'Finish all 3 weekly tasks in one week.', goal: 1, val: c => c.allWeekly },
    // world boss
    { id: 'boss1', group: 'World boss', tier: 1, name: 'First hit', text: 'Deal damage to Syntax Error.', goal: 1, val: c => c.bossDmg, bar: false },
    { id: 'boss1k', group: 'World boss', tier: 1, name: '1,000 damage', text: 'Deal 1,000 damage to Syntax Error in total.', goal: 1000, val: c => c.bossDmg },
    { id: 'boss10k', group: 'World boss', tier: 2, name: '10,000 damage', text: 'Deal 10,000 damage to Syntax Error in total.', goal: 10000, val: c => c.bossDmg },
    { id: 'boss100k', group: 'World boss', tier: 3, name: '100,000 damage', text: 'Deal 100,000 damage to Syntax Error in total.', goal: 100000, val: c => c.bossDmg },
    { id: 'bosswin', group: 'World boss', tier: 2, name: 'Kernel panic', text: 'Be in the fight when Syntax Error goes down.', goal: 1, val: c => c.bossWins },
    { id: 'block50', group: 'World boss', tier: 2, name: 'Firewall', text: "Block 50 of Syntax Error's attacks.", goal: 50, val: c => c.bossBlocks },
    // combo
    { id: 'combo25', group: 'Combo', tier: 1, name: '25 combo', text: 'Reach a 25 combo in Breach or the World Boss.', goal: 25, val: c => c.combo, bar: false },
    { id: 'combo100', group: 'Combo', tier: 2, name: '100 combo', text: 'Reach a 100 combo in Breach or the World Boss.', goal: 100, val: c => c.combo, bar: false },
    { id: 'combo250', group: 'Combo', tier: 3, name: '250 combo', text: 'Reach a 250 combo in Breach or the World Boss.', goal: 250, val: c => c.combo, bar: false },
    // breach
    { id: 'horde1', group: 'Breach', tier: 1, name: 'Off the air', text: 'Clear chapter 1 of Breach.', goal: 1, val: c => c.ch1 },
    { id: 'horde5', group: 'Breach', tier: 3, name: 'Rollback', text: 'Clear the last chapter of Breach.', goal: 1, val: c => c.ch5 },
    { id: 'breach10', group: 'Breach', tier: 2, name: '10 chapters', text: 'Clear 10 Breach chapters.', goal: 10, val: c => c.breach },
    { id: 'breachhard', group: 'Breach', tier: 2, name: 'Hard mode', text: 'Clear a Breach chapter on Hard.', goal: 1, val: c => c.breachHard },
    { id: 'endless10', group: 'Breach', tier: 2, name: 'Level 10', text: 'Reach level 10 in Breach endless.', goal: 10, val: c => c.endlessLvl, bar: false },
    // race
    { id: 'race1', group: 'Race', tier: 1, name: 'Off the line', text: 'Finish a race.', goal: 1, val: c => c.races },
    { id: 'racewin', group: 'Race', tier: 2, name: 'Overtake', text: 'Win a race against Art.', goal: 1, val: c => c.raceArtWins },
    { id: 'race50', group: 'Race', tier: 2, name: '50 races', text: 'Finish 50 races.', goal: 50, val: c => c.races },
    { id: 'duo', group: 'Race', tier: 1, name: 'Two players', text: 'Finish a 2-player race.', goal: 1, val: c => c.duo },
    // academy, spells and pvp: shown once their modes register the event
    { id: 'lesson1', group: 'Academy', tier: 1, needs: 'lesson_pass', name: 'First lesson', text: 'Finish an academy lesson.', goal: 1, val: c => c.lessons },
    { id: 'lesson10', group: 'Academy', tier: 2, needs: 'lesson_pass', name: '10 lessons', text: 'Finish 10 academy lessons.', goal: 10, val: c => c.lessons },
    { id: 'lesson30', group: 'Academy', tier: 3, needs: 'lesson_pass', name: '30 lessons', text: 'Finish 30 academy lessons.', goal: 30, val: c => c.lessons },
    { id: 'spell100', group: 'Combat', tier: 2, needs: 'spell_cast', name: '100 spells', text: 'Cast 100 spells.', goal: 100, val: c => c.spells },
    { id: 'pvp1', group: 'Combat', tier: 1, needs: 'pvp_win', name: 'First win', text: 'Win a PvP match.', goal: 1, val: c => c.pvp },
    { id: 'pvp25', group: 'Combat', tier: 3, needs: 'pvp_win', name: '25 wins', text: 'Win 25 PvP matches.', goal: 25, val: c => c.pvp },
    // room and collecting
    { id: 'place5', group: 'Room', tier: 1, name: 'Moved in', text: 'Place 5 items in your room.', goal: 5, val: c => c.placed },
    { id: 'place20', group: 'Room', tier: 2, name: 'Full room', text: 'Place 20 items in your room.', goal: 20, val: c => c.placed },
    { id: 'collector', group: 'Collecting', tier: 1, name: 'Collector', text: 'Own 10 items besides the 4 you start with.', goal: 10, val: (c, w) => w.owned().length - 4 },
    { id: 'own30', group: 'Collecting', tier: 2, name: '30 items', text: 'Own 30 items besides the 4 you start with.', goal: 30, val: (c, w) => w.owned().length - 4 },
    { id: 'gift1', group: 'Collecting', tier: 1, name: 'Gift', text: 'Open a gift.', goal: 1, val: c => c.gifts },
    { id: 'gift10', group: 'Collecting', tier: 2, name: '10 gifts', text: 'Open 10 gifts.', goal: 10, val: c => c.gifts },
    { id: 'giftall', group: 'Collecting', tier: 3, name: 'Gift set', text: 'Own every gift-only room item.', goal: 1, val: c => c.giftSet },
    { id: 'level10', group: 'Collecting', tier: 2, name: 'Level 10', text: 'Reach level 10.', goal: 10, val: (c, w) => w.levelInfo().level, bar: false },
    { id: 'level25', group: 'Collecting', tier: 3, name: 'Level 25', text: 'Reach level 25.', goal: 25, val: (c, w) => w.levelInfo().level, bar: false },
    // hidden: the name and goal show once earned
    { id: 'h-night', group: 'Hidden', tier: 2, hidden: true, name: 'Night shift', text: 'Finish a run between midnight and 4 am.', goal: 1, val: c => c.night },
    { id: 'h-100', group: 'Hidden', tier: 2, hidden: true, name: 'Round number', text: 'Finish a run at exactly 100 wpm.', goal: 1, val: c => c.round100 },
    { id: 'h-204', group: 'Hidden', tier: 3, hidden: true, name: 'Photo finish', text: "Finish a run at exactly Art's 204 wpm.", goal: 1, val: c => c.exact204 },
    { id: 'h-quote', group: 'Hidden', tier: 2, hidden: true, name: 'Word for word', text: 'Finish a quote test at 100% accuracy.', goal: 1, val: c => c.quoteClean },
    { id: 'h-back', group: 'Hidden', tier: 2, hidden: true, name: 'Back online', text: 'Sign in again after 7 days or more away.', goal: 1, val: c => c.comeback },
  ];

  // ---------- visual bonuses ----------
  // Unlocked by the sign-in streak and kept after that. None of them changes a number in a game.
  const BONUSES = [
    { id: 'trail', days: 3, name: 'Caret trail', text: 'Your caret leaves a short trail while you type.' },
    { id: 'sparks', days: 7, name: 'Letter sparks', text: 'Each correct letter gives off a spark.' },
    { id: 'frame', days: 14, name: 'Avatar frame', text: 'A glowing frame around your avatar in the nav and on your profile.' },
    { id: 'name', days: 30, name: 'Name colour', text: 'Your name in the nav in a colour you pick.',
      colors: [['Cyan', '#3ee6ff'], ['Violet', '#b779ff'], ['White', '#eafff2']] },
    { id: 'roomlight', days: 60, name: 'Room light', text: 'The corner light in your room in a colour you pick.',
      colors: [['Cyan', '#3ee6ff'], ['Violet', '#b779ff'], ['Red', '#ff4d5e']] },
    { id: 'hit', days: 100, name: 'Boss hit colour', text: 'Your damage numbers on Syntax Error in a colour you pick.',
      colors: [['Cyan', '#3ee6ff'], ['Violet', '#b779ff'], ['White', '#eafff2']] },
  ];

  return { DAILY, WEEKLY, ACH, BONUSES, taskText, modeGroup, TYPING };
})();
