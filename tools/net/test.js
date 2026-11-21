// Unit tests for the network layer, the duel and party rules and the rating maths.
// node tools/net/test.js
const load = require('./load');
const G = load(['js/net/sim.js']);
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('FAIL', name); } }
function near(a, b, eps, name) { ok(Math.abs(a - b) <= eps, `${name} (${a} vs ${b})`); }

const W = 'time about people world house water light still story right place great small every found never under thing night point think three large often other first learn paper group begin music those both mark book letter until mile river feet care second enough plain young ready above ever list though feel talk bird soon body family direct leave song measure door product black short class wind question happen complete ship area half rock order fire south problem piece told knew pass since whole king space heard best hour better true during hundred five remember step early hold west ground interest reach fast verb sing listen table travel less morning'.split(' ');
const words = seed => { const r = G.NetCore.rng(seed); return Array.from({ length: 300 }, () => W[Math.floor(r() * W.length)]); };

// ---------- core ----------
{
  const a = G.NetCore.rng('x'), b = G.NetCore.rng('x');
  ok([1, 2, 3].every(() => a() === b()), 'rng repeats for the same seed');
  ok(G.NetCore.rng('x')() !== G.NetCore.rng('y')(), 'rng differs across seeds');
  const e = G.NetCore.emitter(); let got = 0, star = 0;
  const off = e.on('a', v => { got += v; }); e.on('*', () => star++);
  e.emit('a', 2); off(); e.emit('a', 5);
  ok(got === 2 && star === 2, 'emitter on, off and *');
}

// ---------- filter ----------
{
  const F = G.NetFilter;
  ok(F.blocked('what the fuck'), 'blocks a swear word');
  ok(F.blocked('sh1t'), 'blocks letter swaps');
  ok(F.blocked('f u c k'), 'blocks spaced letters');
  ok(F.blocked('go to www.example.com now'), 'blocks links');
  ok(!F.blocked('peacock and cucumber'), 'keeps harmless words that contain short blocked words');
  ok(!F.blocked('my therapist said gg'), 'keeps therapist');
  ok(!F.blocked('I died on the last fight'), 'keeps everyday game talk');
  ok(F.clean('you are a bitch').text === 'you are a *****', 'clean stars the word');
  ok(F.clean('see https://x.com/abc').text === 'see [link removed]', 'clean removes links');
  ok(!F.nameOk('Art').ok && !F.nameOk('10000wpm').ok && !F.nameOk('Admin').ok, 'reserved names fail');
  ok(!F.nameOk('xX_fuck_Xx').ok, 'name with a swear word fails');
  ok(F.nameOk('kbd_mira').ok && F.nameOk('Guest').ok, 'normal names pass');
  ok(!F.nameOk('ab').ok, 'short name fails');
}

// ---------- rating ----------
{
  const R = G.NetRating;
  near(R.expected(1200, 1200), 0.5, 1e-9, 'expected is 0.5 for equal ratings');
  near(R.expected(1400, 1200) + R.expected(1200, 1400), 1, 1e-9, 'expected is symmetric');
  ok(R.expected(1600, 1200) > 0.9, 'a 400 point gap expects about 0.91');
  const w = R.update(1200, 1200, 1, 0), l = R.update(1200, 1200, 0, 0);
  ok(w.delta === 20 && l.delta === -20, 'new player moves 20 either way at K 40');
  ok(R.update(1200, 1200, 1, 30).delta === 12, 'settled player moves 12 at K 24');
  ok(R.update(2100, 2100, 1, 30).delta === 8, 'K 16 from 2000');
  ok(R.update(1200, 2400, 1, 30).delta === 24 && R.update(1200, 2400, 0, 30).delta === 0, 'beating Art pays the full step and losing costs nothing');
  ok(R.update(1300, 1100, 0.5, 30).delta < 0, 'a draw against a weaker player costs points');
  ok(R.ofBot(40, 0.95) < R.ofBot(80, 0.95) && R.ofBot(80, 0.95) < R.ofBot(80, 0.99), 'bot rating rises with wpm and accuracy');
  ok(R.tier(1000).id === 'bronze' && R.tier(1500).id === 'gold' && R.tier(2400).id === 'master', 'tiers');
}

// ---------- typist ----------
{
  let offer = [{ id: 'spell:data-spike', word: 'data spike', kind: 'spell' }];
  const ty = G.NetTypist.create({ stream: () => 'dark', extras: () => offer });
  let r;
  for (const c of 'data spike') r = ty.key(c, 1);
  r = ty.key(' ', 2);
  ok(r.submit && r.submit.kind === 'spell' && r.submit.ok && r.submit.clean, 'two-word spell keeps its space and submits');
  for (const c of 'dark') r = ty.key(c, 3);
  r = ty.key(' ', 4);
  ok(r.submit.kind === 'stream' && r.submit.ok, 'stream word whose start matches a spell goes to the stream');
  offer = [];
  ty.key('d', 5); ty.key('x', 6); ty.key('Backspace', 7); ty.key('a', 8); ty.key('r', 9); ty.key('k', 10);
  r = ty.key(' ', 11);
  ok(r.submit.ok && !r.submit.clean, 'a fixed typo leaves the word unclean');
  ty.key('d', 12); ty.key('o', 13);
  r = ty.key(' ', 14);
  ok(!r.submit.ok && r.submit.kind === 'stream', 'a wrong word is a miss on the stream');
}

// ---------- bot ----------
{
  const bot = G.NetBot.create({ wpm: 80, acc: 0.95, seed: 's', form: 1 });
  let t = 0, chars = 0, typed = '', idx = 0, keys = 0, bad = 0;
  const list = words('bot');
  while (t < 60000) {
    t += 20;
    for (const k of bot.step(t, { phase: 'fight', stream: list[idx], typed, offers: [] })) {
      keys++;
      if (k.k === ' ') { if (typed === list[idx]) chars += typed.length + 1; idx++; typed = ''; }
      else if (k.k === 'Backspace') typed = typed.slice(0, -1);
      else { if (k.k !== list[idx][typed.length]) bad++; typed += k.k; }
    }
  }
  const wpm = chars / 5;
  ok(wpm > 68 && wpm < 92, `bot types near its wpm (${wpm.toFixed(0)} for 80)`);
  ok(bad / keys > 0.02 && bad / keys < 0.09, `bot makes typos near its accuracy (${(100 * bad / keys).toFixed(1)}% wrong keys)`);
}

// ---------- duel rules ----------
function botDuel(a, b, seed, cfg) {
  const m = G.DuelRules.match({ seed, words: r => words(seed + r), config: cfg });
  const bots = [G.NetBot.create({ ...a, seed: seed + 'a' }), G.NetBot.create({ ...b, seed: seed + 'b' })];
  const events = [];
  m.on(e => events.push(e));
  let t = 0;
  while (!m.result() && t < 900000) {
    t += 20;
    m.advance(t);
    const st = m.state();
    for (let i = 0; i < 2; i++) {
      const s = st.sides[i];
      const v = { phase: st.phase, stream: m.words(st.round)[s.idx % 300], typed: s.typed, offers: (s.offer || []).map(id => G.Combat.spell(id).word), offerId: s.offerUntil, locked: s.locked, fog: s.fog };
      for (const k of bots[i].step(t, v)) m.input(i, k.k, k.t);
    }
  }
  return { m, events };
}
{
  const { m, events } = botDuel({ wpm: 60, acc: 0.95 }, { wpm: 90, acc: 0.97 }, 'd1');
  const r = m.result();
  ok(r && r.winner === 1, 'the faster, cleaner bot wins');
  ok(r.wins[1] === 2 && r.rounds.length >= 2 && r.rounds.length <= 3, 'best of 3 rounds');
  ok(r.sides[1].wpm > r.sides[0].wpm && r.sides[0].wpm > 40, 'summary wpm');
  ok(events.some(e => e.type === 'shot') && events.some(e => e.type === 'hit') && events.some(e => e.type === 'typo'), 'shots, hits and typos are events');
  // the server's check: the same result from the key logs alone
  const rp = G.DuelRules.replay({ seed: 'd1', words: rr => words('d1' + rr), logs: m.log });
  const a = JSON.stringify(rp.result().rounds.map(x => [x.winner, x.sides.map(s => [s.dmg, s.taken, s.words, s.spells.join()])]));
  const b = JSON.stringify(r.rounds.map(x => [x.winner, x.sides.map(s => [s.dmg, s.taken, s.words, s.spells.join()])]));
  ok(a === b, 'replaying the key logs rebuilds every round');
  // a forged log: the slower side "types" its words twice as fast
  const forged = m.log.map((l, i) => (i === 0 ? l.map(e => ({ ...e, t: e.t / 2, n: undefined })) : l.map(e => ({ ...e, n: undefined }))));
  const fr = G.DuelRules.replay({ seed: 'd1', words: rr => words('d1' + rr), logs: forged }).result();
  ok(JSON.stringify(fr.rounds) !== JSON.stringify(r.rounds), 'a changed key log gives a different result');
}
{
  // PvP spell versions on a fixed board
  const m = G.DuelRules.match({ seed: 'sp', words: () => ['alpha', 'bravo', 'delta', 'kilo'], config: { startMs: 0 } });
  const ev = []; m.on(e => ev.push(e));
  m.advance(1);
  const A = m.debug.side(0), B = m.debug.side(1);
  B.eng.debug.offer(['safe-mode']);
  let t = 10;
  for (const c of 'safe mode ') m.input(1, c, t += 50);
  ok(B.eng.status('ward'), 'safe mode puts a shield on the caster');
  for (const c of 'alpha ') m.input(0, c, t += 50);
  m.advance(t += 400);
  ok(ev.some(e => e.type === 'block' && e.side === 1 && e.kind === 'word') && B.hp === 200, 'the shield blocks the next shot');
  A.eng.debug.offer(['binary-rain']);
  for (const c of 'binary rain ') m.input(0, c, t += 50);
  m.advance(t += 3000);
  ok(B.fog === 4 && B.hp < 200, 'binary rain blurs 4 words and hits');
  A.eng.debug.offer(['kernel-panic']);
  for (const c of 'kernel panic ') m.input(0, c, t += 50);
  m.advance(t += 500);
  ok(m.state().sides[1].locked > 0, 'kernel panic locks the other side');
  const before = B.idx;
  m.input(1, 'a', t += 10);
  ok(B.ty.state().typed === '' && B.idx === before, 'keys do nothing while locked');
  B.eng.debug.offer(['safe-mode']);
  m.advance(t += 2000);
  for (const c of 'safe mode ') m.input(1, c, t += 40);
  A.eng.debug.offer(['glitch-blade']);
  const hpB = B.hp;
  for (const c of 'glitch blade ') m.input(0, c, t += 40);
  m.advance(t += 600);
  ok(!B.eng.status('ward') && hpB - B.hp >= 50, 'glitch blade breaks the shield and hits double');
  ok(m.state().sides[1].corrupt > 0, 'glitch blade corrupts the other side');
  const hpC = B.hp;
  m.advance(t += 6500);
  ok(hpC - B.hp === 12, 'corruption deals 2 a second for 6 seconds');
  A.eng.debug.offer(['hyper-thread']);
  for (const c of 'hyper thread ') m.input(0, c, t += 40);
  ok(A.eng.status('hyper') && A.eng.status('hyper').mult === 1.5, 'hyper thread is 1.5 times in PvP');
  B.eng.debug.offer(['neon-nova']);
  for (const c of 'neon nova ') m.input(1, c, t += 40);
  m.advance(t += 700);
  ok(!A.eng.status('hyper'), 'neon nova removes buffs');
}
{
  // round flow: drop a side to 0 and check the break and the next round
  const m = G.DuelRules.match({ seed: 'rf', words: () => ['go'], config: { startMs: 0, breakMs: 1000 } });
  m.advance(1);
  m.debug.hp(1, 1);
  for (const c of 'go ') m.input(0, c, 100);
  m.advance(500);
  ok(m.state().phase === 'break' && m.state().wins[0] === 1, 'a side at 0 HP loses the round');
  m.advance(1600);
  ok(m.state().phase === 'fight' && m.state().round === 2 && m.state().sides[1].hp === 200, 'the next round starts at full HP');
  m.debug.hp(1, 1);
  for (const c of 'go ') m.input(0, c, 1700);
  m.advance(2200);
  ok(m.result() && m.result().winner === 0 && m.result().wins.join() === '2,0', 'two round wins take the match');
}
{
  // time out: more HP wins the round
  const m = G.DuelRules.match({ seed: 'to', words: () => ['go'], config: { startMs: 0, roundMs: 1000, breakMs: 0 } });
  m.advance(1);
  for (const c of 'go ') m.input(0, c, 100);
  m.advance(1001);
  ok(m.state().wins[0] === 1, 'a timed-out round goes to the side with more HP');
}

// ---------- party rules ----------
{
  const players = [{ id: 'me', name: 'me', role: 'striker' }, { id: 'b1', name: 'b1', role: 'guard', bot: true }, { id: 'b2', name: 'b2', role: 'support', bot: true }];
  const run = G.PartyRules.run({ seed: 'p1', run: 'relay', difficulty: 'easy', players, words: (id, f) => words(id + f), counters: f => ['firewall', 'checksum', 'reboot'], art: { fight: 1, ms: 2000 } });
  const bots = new Map(players.map(p => [p.id, G.NetBot.create({ wpm: 75, acc: 0.95, seed: 'p' + p.id, guard: 0.9 })]));
  const ev = []; run.on(e => ev.push(e));
  let t = 0;
  while (!run.result() && t < 900000) {
    t += 25;
    run.advance(t);
    const st = run.state();
    for (const p of st.players) {
      const v = { phase: st.phase, stream: run.words(p.id)[p.idx % 300], typed: p.typed, offers: p.offer.map(id => G.Combat.spell(id).word),
        counter: st.attack && p.role === 'guard' ? st.attack.word : null, counterId: st.attack && st.attack.id, buffId: st.buffN, offerId: p.offerUntil, buffs: p.role === 'support' && st.buffOffer ? st.buffOffer.map(b => G.PartyRules.BUFFS[b].word) : null };
      for (const k of bots.get(p.id).step(t, v)) run.input(p.id, k.k, k.t);
    }
  }
  const r = run.result();
  ok(r && r.won && r.cleared === 3, `three bots clear the easy relay run (${r && r.cleared} cleared)`);
  ok(ev.some(e => e.type === 'block' && e.by === 'b1'), 'the guard blocks attacks');
  ok(ev.some(e => e.type === 'buff'), 'the support casts a buff');
  ok(ev.some(e => e.type === 'art' && e.on) && r.art, 'Art drops in');
  ok(ev.filter(e => e.type === 'callout').length >= 2, 'Art gives callouts');
  const fightMs = r.fights.map(f => (f.endedAt - f.startedAt) / 1000);
  console.log('  party fights (s):', fightMs.map(x => x.toFixed(0)).join(', '), ' dmg:', r.players.map(p => `${p.role} ${p.dmg}`).join(', '), ' team best combo', r.teamBest);
  ok(fightMs.every(s => s > 20 && s < 150), 'each fight lasts 20 to 150 s');
}

// ---------- sim backend ----------
(async () => {
  let fake = 0;
  const store = new Map();
  const host = {
    emit: (ev, p) => (seen[ev] ||= []).push(p),
    now: () => fake,
    test: { search: 0, fast: true, join: 0, answer: 0, accept: true, artChance: 1, artFight: 0, artMs: 1000 },
    words: seed => words(seed),
    level: () => ({ wpm: 70, acc: 0.95 }),
    local: () => ({ id: 'me', name: 'tester', level: 5 }),
    store: { get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d), set: (k, v) => store.set(k, JSON.stringify(v)), del: k => store.delete(k) },
  };
  const seen = {};
  const sim = G.NetSim.create(host);
  await sim.connect({ id: 'me', name: 'tester' });
  ok(sim.presence().length >= 10 && sim.presence().every(p => p.bot), 'presence lists simulated players marked as bots');
  const lobbies = await sim.lobbies.list();
  ok(lobbies.length >= 5 && lobbies.every(l => l.players.every(p => p.bot)), 'lobby browser lists bot lobbies');

  // a quick duel where the player types a few words and then stops; the bot wins
  const info = await sim.match.queue({ mode: 'quick' });
  ok(info.players[1].bot && info.you === 0, 'quick match finds a bot opponent');
  const list = info.words[1];
  let i = 0;
  while (sim._session() && fake < 600000) {
    fake += 20;
    sim._session() && sim._session().pump(fake);
    if (fake > 3200 && fake < 8000 && fake % 400 === 0 && sim._session()) { for (const c of list[i] + ' ') sim.match.input(c, fake); i++; }
  }
  const end = (seen.match || []).find(e => e.type === 'end');
  ok(end && end.result.winner === 1 && end.rating.delta < 0, 'the bot wins and the rating drops');
  const rec = await sim.results.record();
  ok(rec.games === 1 && rec.losses === 1 && rec.rating === 1200 + end.rating.delta, 'the record is saved');
  const rp = G.DuelRules.replay({ seed: info.seed, words: r => info.words[r] || info.words[1], logs: end.log, config: info.config });
  ok(rp.result().winner === end.result.winner && rp.result().sides[1].dmg === end.result.sides[1].dmg, 'the sim result matches a replay of its logs');

  // challenge Art from a profile
  const art = await sim.profiles.get('art');
  ok(art.art && art.stats.bestWpm === 204, 'Art profile');
  const c = await sim.challenges.send('art');
  await new Promise(r => setTimeout(r, 20));
  ok(seen.challenge.some(x => x.id === c.id && x.status === 'accepted'), 'Art accepts a challenge');
  const ai = await sim.match.queue({ mode: 'art', challenge: c.id });
  while (sim._session() && fake < 1200000) { fake += 20; sim._session() && sim._session().pump(fake); }
  const r2 = await sim.results.record();
  ok(r2.vsArt.l === 1 && r2.games === 2, 'a loss to Art goes in the record vs Art');
  ok(r2.history[1].opp.art && r2.history[1].opp.rating === 2400, 'history keeps the opponent');

  // profiles and visits
  const p = await sim.profiles.visit('kbd_mira42');
  ok(p.profile.bot && p.room.owned.length >= 7 && p.profile.duel.rating > 500, 'a simulated profile with a room');
  const p2 = await sim.profiles.get('kbd_mira42');
  ok(JSON.stringify(p2.stats) === JSON.stringify(p.profile.stats), 'the same profile every time');

  // a lobby that fills with bots, then a run with an Art drop-in
  await sim.lobbies.create({ run: 'relay', difficulty: 'easy' });
  for (let k = 0; k < 40; k++) { fake += 100; sim._lobby().tick(fake); await new Promise(r => setTimeout(r, 1)); }
  await new Promise(r => setTimeout(r, 80));
  const L = sim.lobbies.current();
  ok(L.players.length === 4 && L.players.filter(x => x.bot).length === 3, 'the lobby fills with 3 bots');
  ok(['guard', 'support'].every(role => L.players.some(x => x.role === role)), 'bots fill the missing roles');
  const sys = L.chat.filter(m => m.system).map(m => m.text);
  ok(sys.some(s => / \(bot\) joined as /.test(s)), 'joins are announced with (bot)');
  await sim.lobbies.chat('hi all');
  await sim.lobbies.ready(true);
  await new Promise(r => setTimeout(r, 80));
  ok(sim.lobbies.current().players.every(x => x.ready), 'everyone is ready');
  await sim.lobbies.start();
  ok(sim._session() && sim._session().kind === 'party', 'the run starts');
  while (sim._session() && fake < 4000000) {
    fake += 25;
    const s = sim._session(); if (!s) break;
    s.pump(fake);
    const st = s.state();
    if (st.phase === 'fight' && fake % 300 === 0) { const me = st.players.find(x => x.id === 'me'); const w = s.run.words('me')[me.idx % 300]; for (const ch of w + ' ') sim.match.input(ch, fake); }
  }
  const pe = (seen.match || []).filter(e => e.kind === 'party');
  ok(pe.some(e => e.type === 'event' && e.ev.type === 'art'), 'Art joined the run');
  const pend = pe.find(e => e.type === 'end');
  ok(pend && pend.result.players.length === 4, `the run ends with stats for 4 players (won: ${pend && pend.result.won})`);
  const pr = await sim.results.party();
  ok(pr.runs === 1 && pr.history.length === 1, 'the party record is saved');

  sim.disconnect();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
