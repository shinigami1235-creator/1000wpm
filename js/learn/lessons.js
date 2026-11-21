// Academy lessons, the tips between them and the text that free typing offers.
// Lessons run in order and each one opens the next. K is FingerKeys.info(layout), so
// every guide and drill follows the player's keyboard layout.
// pass is the mark for 1 star (accuracy first, then speed). two and three are the marks
// for 2 and 3 stars.
window.LEARN = (() => {
  const shuffle = a => TT.shuffle([...a]);
  const pickN = (a, n) => { const out = []; while (out.length < n && a.length) out.push(...shuffle(a)); return out.slice(0, n); };
  const up = a => a.map(c => /\p{L}/u.test(c) ? c.toUpperCase() : c).join(' ');
  // tokens in words.js that are pieces of contractions or abbreviations
  const SKIP = new Set('ll ve re em ex id pm mm ft bc pa ca et ah oh hi ha dna bbc ceo ltd don thats sub pre non mid vs uk jr st ad'.split(' '));
  const and = (...a) => a.map(c => c.toUpperCase()).join(' and ');
  const fit = (K, text) => [...text].every(c => K.has(c));

  // words for the home row on QWERTY and QWERTZ, where it holds a s d f g h j k l
  const HOME_WORDS = 'as add ads all ask asks dad dads fad fall falls flag flags flash flask gal gas glad glass had half hall halls has hash lad lads lag lash lass sad salad salsa sash shall slash dash ash alas sag'.split(' ');
  const NUMBERS = ['room 204', '10 cats', '7 days', '24 hours', '365 days', 'the year 2026', '50 coins', '12 eggs', '3 cups', '60 seconds', '100 words', '8 lessons', '4 keys', 'page 38', '90 minutes', '15 tests', 'bus 61', '29 steps', 'flat 7b', '1 or 2'];
  const PUNCT = ['Yes, it is.', 'Who won?', 'Stop!', 'It\'s late.', 'I\'m here, Art.', 'Dad, wait!', 'Is it done?', 'Wow, that\'s fast.', 'Don\'t look down.', 'Ready? Go!', 'Tea, toast and jam.', 'She said yes.', 'We won!', 'Can you see it?', 'No, not yet.', 'Here it is.'];
  const SENTENCES = [
    'The cat sat on the warm desk.', 'We type a little every day.', 'Rest your hands on the home row.', 'Look at the screen and keep going.',
    'She found her keys under the bed.', 'The bus was late again today.', 'He made tea and sat by the window.', 'My new keyboard is very quiet.',
    'Rain fell on the roof all night.', 'They walked to the park after lunch.', 'Art types fast on every keyboard.', 'Our team won the game last week.',
    'The shop opens at nine.', 'I left my phone at home.', 'Put the cups back on the shelf.', 'The dog ran after the ball.',
  ];

  function wordsOnly(K, letters, need, n, min = 2, max = 7) {
    const ok = new Set(letters);
    let list = LearnWords.only(letters, { need, min, max }).filter(w => !SKIP.has(w));
    list = [...new Set([...HOME_WORDS.filter(w => [...w].every(c => ok.has(c)) && (!need.length || [...w].some(c => need.includes(c)))), ...list])];
    return list.length >= 8 ? pickN(list, n).join(' ') : null;
  }
  // three letter groups for a layout whose row makes no words, such as the AZERTY home row
  function groups(keys, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(Array.from({ length: 3 }, () => keys[Math.floor(Math.random() * keys.length)]).join(''));
    return out.join(' ');
  }

  const LESSONS = [
    {
      id: 'posture', title: 'Posture and hand position', blurb: 'Where your hands rest and which finger presses which key.',
      guide: K => [
        'Sit up straight with your feet flat and the screen at eye level.',
        'Keep your wrists off the desk and curve your fingers over the keys.',
        'Put your index fingers on F and J since both keys have a bump you can feel.',
        `Rest your other fingers on ${up(K.restL.slice(0, 3))} and ${up(K.restR.slice(1))} with your thumbs on Space.`,
        'Each colour on the keyboard is one finger. Press every key with its own finger and go back to the home row after it.',
      ],
      keys: K => [...K.restL, ...K.restR, ' '],
      drill: K => {
        const L = K.restL, R = K.restR;
        const pairs = [[L[3], R[0]], [L[2], R[1]], [L[1], R[2]], [L[0], R[3]]];
        return pairs.map(([a, b]) => `${a}${a}${a} ${b}${b}${b} ${a}${b} ${b}${a}`).join(' ') + ` ${L.join('')} ${R.join('')}`;
      },
      pass: { acc: 90, wpm: 5 }, two: { acc: 95, wpm: 10 }, three: { acc: 98, wpm: 15 },
    },
    {
      id: 'home', title: 'Home row', blurb: 'The letters under your fingers when they rest.',
      guide: K => [
        `Type ${up(K.homeRow)} without lifting your hands off the home row.`,
        `${and(...K.homeRow.slice(4, 6))} are a short reach inward for your index fingers.`,
        'Press Space with either thumb.',
      ],
      keys: K => [...K.homeRow, ' '],
      drill: K => wordsOnly(K, K.homeRow, [], 20, 2, 6) || groups(K.homeRow, 18),
      pass: { acc: 92, wpm: 10 }, two: { acc: 95, wpm: 15 }, three: { acc: 98, wpm: 22 },
    },
    {
      id: 'top', title: 'Top row', blurb: 'The row above, reached by moving each finger up.',
      guide: K => [
        'Reach up for each top row key and come back to the home row after it.',
        `Your index fingers take ${up(K.topRow.slice(3, 7))} and your middle fingers take ${and(K.topRow[2], K.topRow[7])}.`,
      ],
      keys: K => [...K.homeRow, ...K.topRow, ' '],
      drill: K => wordsOnly(K, [...K.homeRow, ...K.topRow], K.topRow, 20, 3, 7) || groups(K.topRow, 18),
      pass: { acc: 92, wpm: 10 }, two: { acc: 95, wpm: 15 }, three: { acc: 98, wpm: 22 },
    },
    {
      id: 'bottom', title: 'Bottom row', blurb: 'The row below, reached by curling each finger down.',
      guide: K => [
        'Curl each finger down for the bottom row and come back up after it.',
        `${and(...K.bottomRow.slice(3, 5))} go to your left index finger, ${and(...K.bottomRow.slice(5, 7))} to your right.`,
      ],
      keys: K => [...K.homeRow, ...K.topRow, ...K.bottomRow, ' '],
      drill: K => wordsOnly(K, [...K.homeRow, ...K.topRow, ...K.bottomRow], K.bottomRow, 20, 3, 7) || groups(K.bottomRow, 18),
      pass: { acc: 92, wpm: 10 }, two: { acc: 95, wpm: 15 }, three: { acc: 98, wpm: 20 },
    },
    {
      id: 'numbers', title: 'Numbers', blurb: 'The number row, two rows above the home row.',
      guide: K => [
        'Reach up two rows for each number and come back to the home row after it.',
        'Each number goes to the finger under it: 4 and 5 to your left index finger, 6 and 7 to your right.',
        ...(K.needsShift('1') ? ['Numbers on this layout need Shift.'] : []),
      ],
      keys: () => '1234567890 ',
      drill: () => '1 2 3 4 5 6 7 8 9 0 ' + pickN(NUMBERS, 10).join(' '),
      pass: { acc: 90, wpm: 8 }, two: { acc: 95, wpm: 12 }, three: { acc: 98, wpm: 18 },
    },
    {
      id: 'punct', title: 'Capitals and punctuation', blurb: 'Shift for capitals, then the full stop, comma, apostrophe, ? and !',
      guide: K => [
        'Hold Shift with the little finger of the hand that is not typing the letter: right Shift for a capital A, left Shift for a capital J.',
        `The full stop goes to your ${K.finger('.')} and the comma to your ${K.finger(',')}.`,
      ],
      keys: () => '.,\'?!ASDFJKL ',
      drill: K => pickN(PUNCT.filter(p => fit(K, p)), 9).join(' '),
      pass: { acc: 90, wpm: 10 }, two: { acc: 95, wpm: 15 }, three: { acc: 98, wpm: 20 },
    },
    {
      id: 'words', title: 'Common words', blurb: 'The 200 words that come up most in English.',
      guide: () => [
        'Most of what you type is the same few hundred words.',
        'Type each one as a whole word rather than letter by letter.',
      ],
      keys: () => null,
      drill: () => LearnWords.common(28, { top: 200 }).join(' '),
      pass: { acc: 92, wpm: 18 }, two: { acc: 95, wpm: 25 }, three: { acc: 98, wpm: 32 },
    },
    {
      id: 'sentences', title: 'Short sentences', blurb: 'Plain sentences with capitals and full stops.',
      guide: () => [
        'Start each sentence with a capital and end it with a full stop.',
        'Keep the same pace through the punctuation.',
      ],
      keys: () => null,
      drill: K => pickN(SENTENCES.filter(s => fit(K, s)), 4).join(' '),
      pass: { acc: 92, wpm: 18 }, two: { acc: 95, wpm: 25 }, three: { acc: 98, wpm: 32 },
    },
    {
      id: 'speed', title: 'Speed drill', blurb: 'Short words at a faster pace.',
      guide: () => [
        'Push your pace on short, easy words.',
        'Accuracy still has to reach 90% before speed counts.',
      ],
      keys: () => null,
      drill: () => LearnWords.common(36, { top: 300, max: 4 }).join(' '),
      pass: { acc: 90, wpm: 30 }, two: { acc: 92, wpm: 38 }, three: { acc: 95, wpm: 45 },
    },
    {
      id: 'accuracy', title: 'Accuracy drill', blurb: 'Longer words and no room for mistakes.',
      guide: () => [
        'Slow down and get every letter right on longer words.',
        'Press Backspace as soon as you see a mistake.',
      ],
      keys: () => null,
      drill: () => LearnWords.long(16, { min: 6, max: 9 }).filter(w => !SKIP.has(w)).join(' '),
      pass: { acc: 97, wpm: 15 }, two: { acc: 98, wpm: 22 }, three: { acc: 100, wpm: 28 },
    },
  ];

  // one tip per lesson, shown on its result. The map shows the ones marked map between groups.
  const TIPS = {
    posture: { text: 'Keep your eyes on the screen since looking at your hands slows down how fast your fingers learn the keys.', map: true },
    home: { text: 'Go back to the home row after every key since your fingers find the next key from there.' },
    top: { text: 'Feel for the bumps on F and J when your hands get lost.' },
    bottom: { text: 'Keep your wrists still and let your fingers do the reaching.', map: true },
    numbers: { text: 'Numbers are the longest reach on the board, so take them slower than letters.' },
    punct: { text: 'Use both Shift keys so one hand holds Shift while the other types the letter.', map: true },
    words: { text: 'Type at an even pace rather than in bursts since a steady rhythm makes fewer mistakes.' },
    sentences: { text: 'Hold Ctrl and press Backspace to delete the whole word.', map: true },
    speed: { text: 'Warm up with two easy minutes of common words before a timed test.' },
    accuracy: { text: 'Take a short break every 20 minutes and shake out your hands.', map: true },
  };

  // stars for a run: 0 is a fail. Accuracy is checked before speed.
  function stars(L, acc, wpm) {
    if (acc < L.pass.acc || wpm < L.pass.wpm) return 0;
    if (acc >= L.three.acc && wpm >= L.three.wpm) return 3;
    if (acc >= L.two.acc && wpm >= L.two.wpm) return 2;
    return 1;
  }

  // the placement test puts a player at the first lesson they still need
  const PLACEMENT = { secs: 60, words: 60, top: 400 };
  function place(wpm, acc) {
    let at = 0;                                     // index of the first lesson to take
    if (wpm >= 35 && acc >= 94) at = LESSONS.length;
    else if (wpm >= 20) at = LESSONS.findIndex(l => l.id === 'words');
    else if (wpm >= 12) at = LESSONS.findIndex(l => l.id === 'numbers');
    if (acc < 90) at = Math.min(at, LESSONS.findIndex(l => l.id === 'words'));
    if (acc < 80) at = 0;
    return at;
  }

  const PACKS = {
    keyboards: { name: 'Keyboards', words: 'keycap switch gasket linear tactile thock clack spacebar stabilizer lube magnetic actuation trigger polling latency backspace hotswap acrylic aluminum layout knob modifier keystroke wireless dongle cable plate foam case mount spring stem housing legend profile rapid wrist deskmat'.split(' ') },
    food: { name: 'Food', words: 'rice bread noodle mango coffee tea soup salad pepper garlic lemon honey butter cheese pasta curry ginger onion tomato chicken bacon pancake waffle cookie yogurt melon peach grape cocoa chocolate cereal almond'.split(' ') },
    animals: { name: 'Animals', words: 'cat dog horse tiger eagle whale shark rabbit turtle monkey zebra panda koala otter falcon parrot camel goat sheep spider snake frog lizard dolphin owl wolf bear deer fox'.split(' ') },
    space: { name: 'Space', words: 'planet orbit comet moon star rocket galaxy nebula meteor crater gravity asteroid launch shuttle saturn jupiter mars venus mercury neptune telescope eclipse solar lunar cosmic satellite module capsule'.split(' ') },
  };

  // public domain lines with where they come from
  const QUOTES = [
    ['Well done is better than well said.', 'Benjamin Franklin, Poor Richard\'s Almanack'],
    ['Lost time is never found again.', 'Benjamin Franklin, Poor Richard\'s Almanack'],
    ['Early to bed and early to rise, makes a man healthy, wealthy, and wise.', 'Benjamin Franklin, Poor Richard\'s Almanack'],
    ['Brevity is the soul of wit.', 'William Shakespeare, Hamlet'],
    ['There is nothing either good or bad, but thinking makes it so.', 'William Shakespeare, Hamlet'],
    ['If music be the food of love, play on.', 'William Shakespeare, Twelfth Night'],
    ['It is a capital mistake to theorize before one has data.', 'Arthur Conan Doyle, A Scandal in Bohemia'],
    ['It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', 'Jane Austen, Pride and Prejudice'],
    ['All happy families are alike; each unhappy family is unhappy in its own way.', 'Leo Tolstoy, Anna Karenina'],
    ['It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.', 'Charles Dickens, A Tale of Two Cities'],
    ['Whatever is worth doing at all is worth doing well.', 'Lord Chesterfield, Letters to His Son'],
    ['Hope is the thing with feathers that perches in the soul.', 'Emily Dickinson'],
  ];

  return { LESSONS, TIPS, stars, PLACEMENT, place, PACKS, QUOTES, SENTENCES, byId: id => LESSONS.find(l => l.id === id) };
})();
