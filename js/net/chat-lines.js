// What the simulated players say in each chat room at #/commons while the server does not
// exist. Lines are keyed by room id (see js/net/chat-rooms.js). Every line is checked against
// ChatRules (NetFilter, TEEN_OFF, contact details) by node tools/net/chat-test.js, since the
// site is used in schools.
//
//   {name}  another player in the room      {me}  the player      {wpm}  the player's line speed
//
//   rooms[id]        lines a bot posts on its own in that room
//   replies[lang]    answers: greet and generic for every language, plus topics in English
//   news             Announcements in demo: the site's real updates, newest last
window.CHAT_LINES = {
  rooms: {
    lobby: [
      'hi all', 'anyone else on a school computer?', 'just got here', 'what is everyone playing?', 'saving coins for the Aula F99',
      'my room has a lava lamp now', 'daily tasks are easy today', 'got a gift crate this morning', 'Tilde keeps telling me to take a break',
      'one more run then homework', 'how do you get the hex panels for your room?', 'anyone done the weekly tasks yet?', 'brb dinner', 'back',
      'my streak is on day 12', 'who else is on Breach chapter 3?', 'the train level in Breach is hard', 'lol', 'busy in here tonight',
      'what wpm is everyone at?', 'I can finally type without looking', 'reel mode is fun to watch', 'good morning from Manila',
      'good evening from Bangkok', 'my avatar has the same hair as me now', 'which room item is the best?', '{name} what are you playing?',
      'heading to the boss, see you there', 'just hit level 10',
    ],
    intro: [
      'hi, I am new, about 45 wpm', 'hello! 3rd day here, 62 wpm so far', 'new here, my teacher showed us this site', 'hi everyone, typing since last week',
      'just made my avatar', 'hi from Cebu', "hey, I came from Art's reels", 'I type around 80 on a good day', 'new, still learning the home row',
      'hi, I play duels mostly', 'hello, came here for the world boss', 'anyone else from Chiang Mai?', 'joined with my whole class today',
      'first day, 38 wpm, going for 50', 'welcome {name}', 'welcome!', 'hi {name}, what wpm are you?', 'nice to meet you all',
      'hey, 70 wpm, mostly typing tests', 'just finished the first academy lesson', 'hello from Davao', 'new here, 55 wpm on my phone keyboard lol',
    ],
    boss: [
      'Syntax Error is below half', 'counter word coming, get ready', 'blocked that one', 'missed the counter word again', 'who has top damage today?',
      'my combo hit 40 on the boss', 'it is winding up', 'type the counter fast', 'new boss started at full HP', 'electro storm did 300 on it',
      'void sphere on the boss is so good', 'it hits so hard tonight', 'we need more people on the boss', 'just joined the fight',
      'I keep getting the long words', 'crit for 120', 'it is at 30%', 'almost down, keep going', 'gg everyone, it went down',
      'that last attack broke my combo', '{name} nice block', 'how do you get the spell words?', 'returned a packet for big damage',
      'my damage is 4k today', 'boss fight before school', 'kernel panic stunned it', 'who else is still in?',
    ],
    rush: [
      'got to boss 6', 'The Press is the hardest one for me', 'watch the heat on The Press', 'The Spam throws fake chips, break all three',
      'on The Signboard you type the sign spelled right', 'The Announcer speakers have to be muted in order', 'need tips for The Correction',
      'new best: 8 bosses', 'Boss Rush gets hard after boss 4', 'my scoreboard spot dropped', 'who is top of the Boss Rush board?',
      'lost on boss 5 again', 'one more run', 'gg, 7 bosses', '{name} how far did you get?', 'I always lose to the Press slams',
      'the stun window is the best part', 'Boss Rush before bed', 'it gets easier after a few losses', 'beat The Signboard first try',
    ],
    duels: [
      'duel anyone?', 'looking for a duel around 70 wpm', 'who wants a 1v1', 'lost to a 120 wpm player', 'won 4 in a row',
      'kernel panic saved my last round', 'got hit by void sphere twice', 'someone challenge me', 'rematch {name}?', '{name} you up for a duel?',
      'tried the duel against Art, he is so fast', 'my rating went up 30', 'best of 3, I lost 1-2', 'cryo lock froze me right at the end',
      'safe mode blocked a big hit', 'gg {name}', 'anyone at Gold yet?', 'the fog spell is annoying', 'quick match took a while',
      'challenge sent', 'one more?', 'just made Silver',
    ],
    stream: [
      'is Art live today?', 'when is the next stream?', 'sent him a shield', 'that combo was crazy', 'he typed that at 200+', 'chat go',
      'saving coins for support items', 'he almost lost that one', 'the boss music is good', 'Art please do a hard one',
      'watched the last fight twice', 'how does he not make typos', 'go Art', 'gg Art', 'that last phase', 'he blocked everything',
      'what dial was that on?', 'first time watching a Superboss fight',
    ],
    academy: [
      'stuck on the home row lesson', 'how do I pass lesson 3?', 'what accuracy do you need to pass?', 'the keyboard picture helps a lot',
      'finished all the home row lessons', 'top row is hard', 'should I go slow first?', 'yes, accuracy first then speed', 'my pinky is so slow',
      'free typing still gives coins', 'I keep looking at my keys', 'cover your hands with a cloth, it helps', 'lesson coins are nice',
      'which lesson has the numbers?', 'done with the academy today', 'my teacher gave us 3 lessons for homework', 'is there a lesson for symbols?',
      'thank you {name}',
    ],
    gear: [
      'what keyboard do you all use?', 'the Womier SK61 HE feels so smooth', 'linear or tactile?', 'I type on a laptop keyboard',
      'saving for the Aula F99', 'does the keyboard make you faster?', 'a bit, but practice matters more', 'my school keyboards are loud',
      'anyone tried the Attack Shark X68 HE?', 'my spacebar rattles', 'lubed my switches this weekend', '60% or full size?',
      'the Chilkey looks clean', 'I use a membrane keyboard and get 90', 'wrist rest or no?', 'the Corsair Vanguard 96 has a lot of keys',
      'low profile keyboards feel weird to me', 'new keycaps came today', '{name} which switches?',
    ],
    drills: [
      'do 10 minutes of the common words every day', 'practice the words you miss most', 'slow down to 95% accuracy then speed up',
      'the quote test is good for punctuation', 'look at the screen, not your hands', 'my drill: three 60 second tests every morning',
      'Ctrl+Backspace deletes a whole word', 'does anyone practice with music?', 'went from 50 to 70 in a month', 'short breaks help my hands',
      'focus mode helps me', 'which mode is best to practice?', 'the stats page shows your weak keys', 'try typing song lyrics',
      'relax your shoulders', 'my weak key is B', 'type the hard words slowly first', 'thanks for the tip {name}',
    ],
    th: [
      'สวัสดีครับ', 'สวัสดีค่ะ', 'หวัดดีทุกคน', 'ใครไปตีบอสบ้าง', 'บอสเลือดเหลือครึ่งแล้ว', 'ใครอยากดวลบ้าง', 'วันนี้ได้ 80 wpm แล้ว',
      'พิมพ์เร็วมาก', 'ขออีกรอบ', 'ขอเข้าปาร์ตี้ด้วย', 'เก่งมาก', 'สู้ๆ', 'จีจี', 'การบ้านเยอะมาก', 'คีย์บอร์ดใหม่มาแล้ว', 'ไปนอนก่อนนะ',
      'มีใครจากเชียงใหม่บ้าง', 'ฝึกพิมพ์ทุกวันเลย',
    ],
    ph: [
      'kumusta kayo', 'hello po', 'uy andito na ako', 'sino gusto mag-boss?', 'malapit na matalo yung boss', 'tara duel', 'sino gusto ng duel?',
      'pasali sa party', 'kulang pa kami ng isa', 'gg mga lods', 'galing mo', 'laban lang', 'ang bilis mo mag-type', 'isa pang round',
      'naka 80 wpm na ako', 'may assignment pa ako', 'taga Cebu ako', 'good morning mga ka-type',
    ],
    jp: [
      'こんにちは', 'こんばんは', 'よろしく', 'ボス行く人いる？', 'ボスあと半分', '対戦しよう', '誰か対戦しない？', 'パーティー入りたい', 'あと一人募集',
      'おつかれ', 'ナイス', 'がんばって', 'タイピング速すぎ', 'もう一回', '今日は80 wpmいけた', '新しいキーボード買った', 'ローマ字入力の練習中', 'おやすみ',
    ],
    br: [
      'oi gente', 'boa noite', 'alguém pro chefe?', 'o chefe está com metade da vida', 'bora duelar?', 'quem quer um duelo?', 'entro na party',
      'falta um na party', 'boa partida', 'mandou bem', 'você digita muito rápido', 'mais uma', 'cheguei a 80 wpm', 'teclado novo chegou',
      'treinando todo dia', 'alguém de São Paulo?', 'vou dormir, até amanhã',
    ],
    es: [
      'hola a todos', 'buenas', 'alguien para el jefe?', 'el jefe tiene la mitad de vida', 'quién quiere un duelo?', 'te reto a un duelo',
      'me uno a la party', 'nos falta uno', 'buena partida', 'bien jugado', 'suerte a todos', 'qué rápido escribes', 'una más',
      'ya llegué a 90 wpm', 'teclado nuevo', 'alguien de México?', 'me voy a dormir',
    ],
    id: [
      'halo semua', 'selamat malam', 'ada yang mau lawan bos?', 'bosnya tinggal setengah', 'ayo duel', 'siapa mau duel?', 'ikut party dong',
      'kurang satu orang', 'mantap', 'cepat banget ngetiknya', 'sekali lagi', 'aku sudah 80 wpm', 'keyboard baru datang', 'latihan tiap hari',
      'tidur dulu ya',
    ],
    vn: [
      'chào mọi người', 'chào buổi tối', 'ai đánh boss không?', 'boss còn một nửa máu', 'ai muốn đấu không?', 'cho mình vào party với',
      'còn thiếu một người', 'hay quá', 'gõ nhanh thật', 'thêm một ván nữa', 'mình được 80 wpm rồi', 'bàn phím mới về', 'luyện gõ mỗi ngày',
      'mình đi ngủ đây',
    ],
    kr: [
      '안녕하세요', '다들 안녕', '보스 갈 사람?', '보스 피 반 남았어요', '대결할 사람?', '한 판 해요', '파티 들어가고 싶어요', '한 명 더 구해요',
      '수고했어요', '잘하시네요', '타자 진짜 빠르다', '한 판 더', '오늘 80 wpm 나왔어요', '새 키보드 왔어요', '매일 연습 중', '잘 자요',
    ],
    de: [
      'hallo zusammen', 'guten Abend', 'wer kommt mit zum Boss?', 'der Boss hat nur noch die Hälfte', 'jemand Lust auf ein Duell?',
      'ich komme in die Party', 'uns fehlt noch einer', 'gut gespielt', 'stark', 'du tippst echt schnell', 'noch eine Runde',
      'heute 80 wpm geschafft', 'neue Tastatur ist da', 'ich übe jeden Tag', 'gute Nacht',
    ],
  },
  replies: {
    en: {
      greet: ['hey {me}', 'hi {me}', 'welcome {me}', 'yo {me}', 'hello {me}'],
      generic: ['true', 'same', 'nice', 'lol', 'fair', 'agree', 'good luck'],
      question: ['not sure', 'yeah', 'I think so', 'no idea', 'ask in Tips and drills'],
      gg: ['gg {me}', 'gg', 'gg wp'],
      party: ['I can join {me}', 'post it in the Party finder', 'what role do you need?', 'I can guard'],
      boss: ['I am on the boss too', 'see you there {me}', 'boss is at half'],
      duel: ['I will duel you {me}', 'sure, challenge me', 'what wpm are you?'],
      fast: ['{wpm} wpm on a chat line?', 'typing that at {wpm} wpm is quick', 'how are you that fast {me}'],
    },
    th: { greet: ['สวัสดี {me}', 'หวัดดี {me}'], generic: ['จริง', 'เหมือนกัน', 'เก่งมาก', 'สู้ๆ'] },
    tl: { greet: ['hello {me}', 'uy {me}, kumusta'], generic: ['true', 'same', 'galing', 'laban'] },
    ja: { greet: ['{me}さん、こんにちは', 'よろしく {me}'], generic: ['ナイス', 'たしかに', 'がんばって', 'わかる'] },
    pt: { greet: ['oi {me}', 'bem-vindo {me}'], generic: ['verdade', 'boa', 'mandou bem', 'também'] },
    es: { greet: ['hola {me}', 'bienvenido {me}'], generic: ['verdad', 'igual', 'bien', 'suerte'] },
    id: { greet: ['halo {me}', 'selamat datang {me}'], generic: ['betul', 'sama', 'mantap', 'semangat'] },
    vi: { greet: ['chào {me}', 'chào mừng {me}'], generic: ['đúng rồi', 'mình cũng vậy', 'hay', 'cố lên'] },
    ko: { greet: ['{me}님 안녕하세요', '반가워요 {me}'], generic: ['맞아요', '저도요', '좋네요', '화이팅'] },
    de: { greet: ['hallo {me}', 'willkommen {me}'], generic: ['stimmt', 'genau', 'stark', 'viel Glück'] },
  },
  news: [
    ['2026-11-20T10:30:00+07:00', 'The World Boss is now called Syntax Error, with new names for its phases and attacks.'],
    ['2026-11-20T15:30:00+07:00', 'Avatars are 3D now. Open your profile to make yours.'],
    ['2026-11-21T10:30:00+07:00', 'The avatar creator has face shape sliders, lip controls and a Sculpt tab.'],
    ['2026-11-21T12:00:00+07:00', 'Brows have their own editor in the avatar creator.'],
    ['2026-11-21T17:50:00+07:00', 'The home page has a world map of where players are.'],
    ['2026-11-21T18:00:00+07:00', 'The academy and free typing are tabs on the Type page.'],
    ['2026-11-21T18:15:00+07:00', 'Daily and weekly tasks, sign-in streaks, achievements and room gifts are live.'],
    ['2026-11-21T18:50:00+07:00', 'Combos and 16 spells are in the World Boss fight.'],
    ['2026-11-21T20:15:00+07:00', 'Boss Rush is open on the Play page: every boss Art has beaten, one after another.'],
    ['2026-11-21T20:30:00+07:00', 'Focus mode and reel mode are on the Type page. Your profile shows your weak keys.'],
    ['2026-11-21T20:50:00+07:00', 'Duels, party runs and player profiles are open. Other players are bots until the server is live.'],
    ['2026-11-21T20:55:00+07:00', "Superboss is open: watch Art's boss fights and send him support with coins."],
    ['2026-11-21T21:00:00+07:00', 'Word lists no longer have words that read as rude for a teen audience.'],
    ['2026-11-21T21:30:00+07:00', 'Reel mode uses random words from the 1,000 most common English words.'],
  ],
};
