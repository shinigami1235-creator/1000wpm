// Typo Horde content: chapters, story text, enemies, bosses and power-ups.
// Story canon lives in STORY/WORLD.md.
window.HordeData = (() => {
  // How long each enemy type takes to walk from the back to the player (seconds),
  // how many words it carries and how long they are.
  const ENEMIES = {
    walker:  { secs: 11, len: [3, 6], h: 1.0, score: 10 },
    runner:  { secs: 6,  len: [3, 4], h: 0.95, score: 15 },
    crawler: { secs: 13, len: [6, 9], h: 0.45, score: 15 },
    brute:   { secs: 15, len: [4, 7], h: 1.3, score: 30, words: 2 },
    flyer:   { secs: 7,  len: [3, 5], h: 0.5, score: 15, fly: true },
    thrower: { secs: 9,  len: [5, 8], h: 1.1, score: 25, stopAt: 0.5 },
  };

  const PICKUPS = {
    health:   { label: 'Health',   color: '#5fbf77', text: '+1 heart' },
    debounce: { label: 'Debounce', color: '#9fb7d9', text: 'Typos slow down for 8 seconds' },
    macro:    { label: 'Macro',    color: '#f2c230', text: 'Every typo on screen goes down' },
    shield:   { label: 'Shield',   color: '#e7e6e1', text: 'Blocks the next hit' },
    double:   { label: 'Double',   color: '#e07a3a', text: 'Double score for 10 seconds' },
  };

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

  const CHAPTERS = [
    {
      id: 'live', title: 'Live', place: "Art's room, 9:00 pm", scene: 'room', music: 'stage1',
      waves: [['walker', 4], ['walker', 4, 'runner', 1], ['walker', 4, 'runner', 2, 'crawler', 1]],
      pickups: ['health', 'debounce'],
      intro: [
        'Art is live on stream, typing one word for each of his followers.',
        'At 9:00 pm every phone and computer in the city installs the Fixword update.',
        'Halfway through the count, the typos in his chat climb out of the screen.',
      ],
      outro: [
        'The last message in the chat came from an account called fixword_otto with a link to the update.',
        'Art shuts the stream off and goes outside to see how far it has spread.',
      ],
      boss: {
        name: 'The Spam', art: 'spam', hp: 4,
        phases: [
          { kind: 'barrage', count: 6 },
          { kind: 'phrase', words: 3, secs: 9 },
          { kind: 'spell', secs: 9 },
          { kind: 'phrase', words: 4, secs: 10 },
        ],
      },
    },
    {
      id: 'market', title: 'Night market', place: 'The market outside', scene: 'market', music: 'stage2',
      waves: [['walker', 4, 'runner', 2], ['walker', 3, 'flyer', 3], ['runner', 3, 'crawler', 2, 'brute', 1], ['walker', 5, 'flyer', 2, 'brute', 1]],
      pickups: ['health', 'macro', 'double'],
      intro: [
        'Every sign in the market has a spelling mistake on it and every mistake is walking.',
        "A noodle seller named Pim pulls Art behind her cart. She says the typos came out of people's phones the moment the update finished.",
        "Fixword's office is downtown, five stops away on the subway.",
      ],
      outro: ['Pim gives Art her transit card and tells him the trains are still running.'],
      boss: {
        name: 'The Signboard', art: 'sign', hp: 5,
        phases: [
          { kind: 'summon', count: 4 },
          { kind: 'phrase', words: 4, secs: 10 },
          { kind: 'spell', secs: 8 },
          { kind: 'barrage', count: 8 },
          { kind: 'phrase', words: 5, secs: 11, long: 0.4 },
        ],
      },
    },
    {
      id: 'subway', title: 'Last train', place: 'Line 2, between stations', scene: 'subway', music: 'stage3',
      waves: [['walker', 4, 'crawler', 2], ['runner', 4, 'thrower', 1], ['flyer', 4, 'brute', 1, 'walker', 2], ['walker', 4, 'thrower', 2, 'runner', 3]],
      pickups: ['shield', 'health', 'debounce'],
      intro: [
        'The train stops in the tunnel between two stations.',
        'The screens in the carriage fill with garbled announcements and the announcements climb down out of the screens.',
      ],
      outro: ['Art follows a maintenance shaft out of the tunnel and comes up inside the old Brenn keyboard factory, where Fixword keeps its servers.'],
      boss: {
        name: 'The Announcer', art: 'announcer', hp: 5,
        phases: [
          { kind: 'phrase', words: 4, secs: 10 },
          { kind: 'barrage', count: 10 },
          { kind: 'spell', secs: 7 },
          { kind: 'summon', count: 5 },
          { kind: 'phrase', words: 6, secs: 12, long: 0.4 },
        ],
      },
    },
    {
      id: 'factory', title: 'The factory', place: 'Brenn Keyboards, ground floor', scene: 'factory', music: 'stage4',
      waves: [['brute', 2, 'walker', 4], ['thrower', 2, 'runner', 4], ['crawler', 3, 'flyer', 4, 'brute', 1], ['walker', 5, 'thrower', 2, 'brute', 2]],
      pickups: ['double', 'shield', 'macro', 'health'],
      intro: [
        'The factory still makes keyboards.',
        'The assembly line is stamping keycaps with the wrong letters and every wrong keycap stands up and walks off the belt.',
      ],
      outro: ['Art finds a staff badge for Otto Brenn, who wrote Fixword. A letter is folded behind the badge.'],
      letter: [
        'My daughter Mina was stuck on Canal Road last June with the water up to the car windows. She texted for help. Fixword changed Canal Road to Coral Road and the rescue boat went to Coral Road on the other side of the city. They found her car the next morning.',
        'I wrote Fixword. I spent twenty years teaching it to fix spelling for people and now nobody checks what they send.',
        'The update gives every wrong word a body and sends it after whoever typed it. People will check their words again.',
        'Otto',
      ],
      boss: {
        name: 'The Press', art: 'press', hp: 6,
        phases: [
          { kind: 'barrage', count: 10 },
          { kind: 'phrase', words: 5, secs: 11 },
          { kind: 'summon', count: 5 },
          { kind: 'spell', secs: 7 },
          { kind: 'barrage', count: 12 },
          { kind: 'phrase', words: 6, secs: 12, long: 0.5 },
        ],
      },
    },
    {
      id: 'server', title: 'Server room', place: 'Fixword, basement', scene: 'server', music: 'stage5',
      waves: [['walker', 5, 'thrower', 2, 'flyer', 2], ['brute', 3, 'runner', 4], ['crawler', 3, 'thrower', 3, 'flyer', 3], ['walker', 6, 'brute', 2, 'runner', 4]],
      pickups: ['health', 'debounce', 'shield', 'macro'],
      intro: [
        'Otto is waiting in the server room.',
        'He says he will roll the update back for anyone who can type through his machine without a mistake.',
      ],
      outro: [
        'Art types the rollback and the update comes off every phone in the city. The typos fall apart into loose letters on the floor.',
        'Otto stays by the server racks until the police arrive.',
        'Art goes home and finishes the follower count.',
      ],
      boss: {
        name: 'The Correction', art: 'correction', hp: 7,
        phases: [
          { kind: 'phrase', text: 'nobody checks what they send anymore', secs: 11 },
          { kind: 'barrage', count: 12 },
          { kind: 'summon', count: 6 },
          { kind: 'spell', secs: 8, set: ['canal road', 'coral road', 'carol road'], ask: 'Which road was Mina on?' },
          { kind: 'phrase', text: 'every wrong word goes back to whoever typed it', secs: 12 },
          { kind: 'barrage', count: 14 },
          { kind: 'phrase', text: 'roll back the fixword update', secs: 10 },
        ],
      },
    },
  ];

  return { ENEMIES, PICKUPS, SPELL, CHAPTERS };
})();
