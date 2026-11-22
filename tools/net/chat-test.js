// Tests for the chat rooms: the rules in js/net/chat-rules.js, the rooms in js/net/chat-rooms.js,
// every bot line in js/net/chat-lines.js and the simulated rooms in js/net/chat-sim.js.
// node tools/net/chat-test.js
const load = require('./load');
const G = load(['js/wordbank-common.js', 'js/wordbank.js', 'js/net/chat-rules.js', 'js/net/chat-rooms.js', 'js/net/chat-lines.js', 'js/net/sim.js', 'js/net/chat-sim.js', 'js/net/friends-sim.js']);
const R = G.ChatRules;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('FAIL', name); } }

// ---------- every bot line passes the filter ----------
{
  const L = G.CHAT_LINES;
  const all = [];
  const walk = (o, path) => { for (const [k, v] of Object.entries(o)) { if (Array.isArray(v)) v.forEach(x => all.push([path + '.' + k, Array.isArray(x) ? x[1] : x])); else walk(v, path + '.' + k); } };
  walk(L, 'lines');
  let bad = 0;
  for (const [where, line] of all) {
    const text = line.replace(/\{name\}/g, 'kbd_mira42').replace(/\{me\}/g, 'Guest').replace(/\{wpm\}/g, '112');
    const c = R.check(text);
    if (!c.ok || c.text !== text) { bad++; console.log('  line refused', where, JSON.stringify(line), c.code); }
    if (text.length > R.MAX) { bad++; console.log('  line too long', where); }
  }
  ok(all.length > 300, `over 300 bot lines (${all.length})`);
  ok(bad === 0, 'every bot line passes ChatRules.check');
  const rooms = G.CHAT_ROOMS.areas.flatMap(x => x.rooms);
  ok(new Set(rooms.map(r => r.id)).size === rooms.length, 'room ids are unique');
  const chat = rooms.filter(r => !r.readOnly && r.kind !== 'posts');
  ok(chat.every(r => (L.rooms[r.lines || r.id] || []).length >= 14), 'every chat room has at least 14 bot lines');
  ok(rooms.every(r => L.replies[{ ja: 'ja', pt: 'pt', es: 'es', th: 'th', tl: 'tl', id: 'id', vi: 'vi', ko: 'ko', de: 'de' }[r.lang] || 'en']), 'every room language has replies');
  ok(rooms.some(r => r.readOnly) && rooms.some(r => r.kind === 'posts'), 'a read-only room and a posts room');
}

// ---------- rules ----------
{
  const no = (t, code) => { const c = R.check(t); ok(!c.ok && c.code === code, `refuses ${JSON.stringify(t)} as ${code} (got ${c.code || 'ok'})`); };
  const yes = t => { const c = R.check(t); ok(c.ok, `allows ${JSON.stringify(t)} (got ${c.code})`); };
  no('go to www.example.com', 'link');
  no('check example.com', 'link');
  no('https://x.y', 'link');
  no('mail me at kid@school.org', 'email');
  no('kid at gmail', 'email');
  no('call 081 234 5678', 'phone');
  no('+63 917 555 0101', 'phone');
  no('add me @speedy_kid', 'handle');
  no('my ig is speedykid', 'handle');
  no('add me on discord', 'handle');
  no('that was shit', 'word');
  no('you are stupid', 'word');
  no('stup1d', 'word');
  no('abcdefghij'.repeat(15), 'long');
  no('   ', 'empty');
  yes('gg');
  yes('I got 120 wpm and 98%');
  yes('anyone up for Boss Rush?');
  yes('the boss. me too');
  yes('สวัสดีครับ');
  yes('peacock and cucumber');
  yes('see you tonight, knight');
  yes('players from Niger and Nigeria');
  no('n1ggers', 'word');
  no('niiiger', 'word');
  // slow mode and repeats
  const t = 1e9;
  const slow = R.check('hello', { lastAt: t - 500, now: t });
  ok(!slow.ok && slow.code === 'slow' && slow.wait === 1500, 'slow mode gives the wait');
  ok(R.check('hello', { lastAt: t - 2100, now: t }).ok, 'slow mode ends after 2 s');
  ok(R.check('Hello!!', { recent: [{ text: 'hello', at: t - 5000 }], now: t }).code === 'repeat', 'the same line again is refused');
  ok(R.check('hello', { recent: [{ text: 'hello', at: t - 40000 }], now: t }).ok, 'a repeat after 30 s is fine');
  ok(R.tidy('ggggggggggg') === 'ggggg', 'long letter runs are cut to five');
  // wpm
  ok(R.wpm(25, 3000) === 100, '25 characters in 3 s is 100 wpm');
  ok(R.wpm(10, 1) === R.WPM_MAX, 'wpm is capped');
  ok(R.wpm(0, 1000) === null && R.wpm(5, 0) === null, 'no wpm without characters or time');
  ok(R.QUICK.includes('gg') && R.QUICK.includes('rematch?'), 'quick phrases');
}

// ---------- the simulated room ----------
(async () => {
  const store = {};
  const events = [];
  const T = { chatBots: 80, chatRate: 20, chatChurnMs: 200, fast: true, chatReply: true };
  const host = {
    emit: (ev, p) => events.push([ev, p]), now: () => Date.now(), test: T, hidden: () => false, local: () => ({ id: 'me', name: 'Tester', level: 3 }), level: () => ({ wpm: 60, acc: 0.95 }), me: () => ({ id: 'me', name: 'Tester' }),
    store: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; }, del: k => { delete store[k]; } },
  };
  const S = G.NetSim.create(host);
  await S.connect({ id: 'me', name: 'Tester' });
  const en = await S.chat.enter();
  ok(en.mode === 'full' && en.allowed === null, 'a normal account gets full chat in every room');
  const count = Object.values(en.rooms).reduce((a, r) => a + r.members, 0);
  ok(count >= 70 && count <= 100, `about 80 people over the rooms (${count})`);
  const busiest = Object.entries(en.rooms).sort((a, b) => b[1].members - a[1].members).slice(0, 3).map(x => x[0]);
  ok(busiest.includes('lobby') && busiest.includes('boss'), `Lobby and Syntax Error are busiest (${busiest})`);
  const lobby = await S.chat.join('lobby');
  ok(lobby.history.length === 30, `Lobby opens with 30 messages (${lobby.history.length})`);
  ok(lobby.members.every(p => p.bot) && lobby.offline.length > 0, 'members are bots and some are offline');
  const th = await S.chat.join('th');
  ok(th.members.every(p => p.country === 'TH'), 'the Thailand room has Thai players');
  ok(th.history.filter(m => /[\u0E00-\u0E7F]/.test(m.text)).length >= 20, 'the Thailand room talks in Thai');
  const news = await S.chat.join('news');
  ok(news.history.length >= 10 && news.history.every(m => m.staff), 'Announcements hold site updates');
  let err = null;
  try { await S.chat.send({ room: 'news', text: 'hi' }); } catch (e) { err = e; }
  ok(err && err.code === 'readonly', 'nobody else posts in Announcements');
  const party = await S.chat.join('party');
  ok(party.posts.length >= 3 && party.posts.every(p => p.skill[1] > p.skill[0] && p.expires - p.at === 15 * 60000), `Party finder has posts (${party.posts.length})`);
  await S.chat.join('lobby');
  await new Promise(r => setTimeout(r, 1500));
  const msgs = events.filter(e => e[0] === 'chat.msg').map(e => e[1]);
  ok(msgs.length > 5, `bots talk (${msgs.length} lines in 1.5 s at 20x)`);
  ok(msgs.every(m => m.bot && m.wpm > 0 && m.room), 'bot lines carry a room and a wpm');
  ok(msgs.every(m => R.check(m.text).ok), 'every line a bot sent passes the filter');
  ok(events.some(e => e[0] === 'chat.people'), 'people come and go');
  ok(events.some(e => e[0] === 'chat.rooms'), 'room counts are sent');
  const m = await S.chat.send({ room: 'lobby', text: 'hi everyone', wpm: 74 });
  ok(m.from === 'me' && m.wpm === 74 && m.room === 'lobby', 'the player\'s line keeps its wpm');
  err = null;
  try { await S.chat.send({ room: 'lobby', text: 'again' }); } catch (e) { err = e; }
  ok(err && err.code === 'slow', 'the sim refuses a second line inside 2 s');
  await new Promise(r => setTimeout(r, 900));
  const replies = events.filter(e => e[0] === 'chat.msg' && /Tester/.test(e[1].text));
  ok(replies.length >= 1, `bots answer the player (${replies.length})`);
  await S.chat.report({ player: 'kbd_mira42', name: 'kbd_mira42', room: 'lobby', reason: 'spam', lines: ['x'] });
  ok(store['wpm-chat-reports'] && store['wpm-chat-reports'].length === 1, 'a report is kept on the device');
  const mine = await S.chat.post({ run: 'deep', difficulty: 'hard', skill: [60, 90] });
  ok(mine.mine && mine.run === 'deep' && S.lobbies.current() && S.lobbies.current().isHost, 'posting a party opens your lobby');
  const inv = await S.lobbies.invite('kbd_mira42');
  ok(inv.status === 'pending', 'an invite is sent');
  T.chatMode = 'quick';
  await new Promise(r => setTimeout(r, 2100));
  err = null;
  try { await S.chat.send({ room: 'lobby', text: 'typed line' }); } catch (e) { err = e; }
  ok(err && err.code === 'quick', 'a quick-phrase account cannot type');
  ok(await S.chat.send({ room: 'lobby', text: 'gg', quick: true }).then(x => x.quick && x.wpm === null), 'a quick phrase goes out with no wpm');
  T.chatMode = null; T.chatRooms = 'learn';
  err = null;
  try { await S.chat.join('lobby'); } catch (e) { err = e; }
  ok(err && err.code === 'school', 'a school limited to Learn cannot open the Lobby');
  ok(await S.chat.join('academy').then(x => x.room === 'academy'), 'and can open Academy help');
  S.disconnect();
  
// ---------- personal questions ----------
{
  const no = t => { const c = R.check(t); ok(!c.ok && c.code === 'personal', `refuses ${JSON.stringify(t)} as personal (got ${c.code || 'ok'})`); };
  const yes = t => { const c = R.check(t); ok(c.ok, `allows ${JSON.stringify(t)} (got ${c.code})`); };
  ['how old are you', 'where do you live?', 'send me a pic', 'wanna meet up', 'dont tell your mom', 'keep it a secret', 'what school u go to', 'ilang taon ka na', 'อายุเท่าไหร่'].forEach(no);
  ['my age is no secret lol', 'i live for this game', 'this pic of my room is old', 'meet me in the party finder', 'how old is the boss'].forEach(yes);
}

// ---------- friends and private messages ----------
async function friendsTest() {
  const mem = {};
  const events = [];
  const host = {
    test: { answer: 0, friendAccept: 1, dmReply: 1, friendSeed: false },
    me: () => ({ id: 'me', name: 'Guest' }),
    emit: (ev, d) => events.push([ev, d]),
    store: { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); }, del: k => { delete mem[k]; } },
  };
  const sim = { simProfile: () => ({ country: 'PH', level: 5, typing: { wpm: 60 } }), handle: () => 'kbd_test1' };
  const { friends, dm } = G.NetFriendsSim.create(host, sim);
  const err = p => p.then(() => null, e => e.code);
  ok(await err(dm.send({ to: 'bot_a', text: 'hi' })) === 'notFriend', 'private messages need a friendship');
  await friends.request('bot_a', 'bot_a');
  ok((await friends.list()).outgoing.length === 1, 'a request waits until it is answered');
  await new Promise(r => setTimeout(r, 30));
  let L = await friends.list();
  ok(L.friends.some(f => f.id === 'bot_a') && !L.outgoing.length, 'an accepted request makes a friend');
  ok(await err(friends.request('bot_a')) === 'already', 'no second request to a friend');
  const m = await dm.send({ to: 'bot_a', text: 'hey good game' });
  ok(m.text === 'hey good game' && m.from === 'me', 'a friend can be messaged');
  ok(await err(dm.send({ to: 'bot_a', text: 'how old are you' })) === 'personal', 'private messages block personal questions');
  await new Promise(r => setTimeout(r, 2100));
  ok(await err(dm.send({ to: 'bot_a', text: 'add me on discord: kid123' })) === 'handle', 'private messages block contact details');
  ok(await err(dm.send({ to: 'bot_a', text: 'my number is 0917 123 4567' })) === 'phone', 'private messages block phone numbers');
  const o = await dm.open('bot_a');
  ok(o.history.length >= 1, 'the chat history opens');
  const rep = await dm.report({ player: 'bot_a', name: 'bot_a', reason: 'Spam' });
  const saved = JSON.parse(mem['wpm-chat-reports']).find(x => x.id === rep.id);
  ok(saved && saved.room === 'dm' && saved.lines.length >= 1, 'a report keeps the private chat for the moderators');
  await friends.block('bot_a', 'bot_a');
  L = await friends.list();
  ok(!L.friends.length && L.blocked.some(b => b.id === 'bot_a'), 'blocking removes the friend');
  ok(await err(dm.send({ to: 'bot_a', text: 'hi again' })) === 'notFriend', 'a blocked player cannot be messaged');
  ok(await err(friends.request('bot_a')) === 'blocked', 'no requests to a blocked player');
  ok(!JSON.parse(mem['wpm-dm'] || '{}').bot_a, 'blocking deletes the private chat');
}

await friendsTest();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
