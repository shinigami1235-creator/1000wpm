# Network layer

Every multiplayer feature (duels, party lobbies and runs, player profiles, room visits and challenges) talks to `window.Net` in `js/net/net.js` and never to a server or a backend directly. `Net.BACKEND` picks the backend:

| Value | File | What it does |
|---|---|---|
| `'sim'` | `js/net/sim.js` | Runs everything in the browser. Simulated players fill every seat and are always shown as bots. |
| `'ws'` | `js/net/ws.js` | Talks to a WebSocket server at `Net.WS_URL` with the messages below. The server does not exist yet. |

The rules run in files with no DOM, so the server loads the same code as the page:

| File | What it holds |
|---|---|
| `js/net/core.js` | `NetCore`: string hash, seeded random numbers, event emitter |
| `js/net/typist.js` | `NetTypist`: which word a key is aimed at (stream, spell, counter word, buff) and when a word is finished |
| `js/net/duel-rules.js` | `DuelRules`: PvP damage, the PvP spell versions, rounds, the match result and `replay()` |
| `js/net/party-rules.js` | `PartyRules`: roles, player HP and handles, the five fight kinds, boss attacks, buffs, Art's drop-in, the run result, and `view()` for bots |
| `js/net/rating.js` | `NetRating`: MMR (Elo with a larger step for new players), bot MMR from typing and back, tiers |
| `js/net/filter.js` | `NetFilter`: the chat and name filter |
| `js/net/chat-rules.js` | `ChatRules`: one check for a chat line (length, words, contact details, slow mode, repeats) and the typed wpm |
| `js/net/chat-rooms.js` | `CHAT_ROOMS`: the areas and rooms at #/commons, as data |
| `js/net/chat-lines.js` | `CHAT_LINES`: what the bots say in each room, and the demo Announcements (sim only) |
| `js/net/chat-sim.js` | `NetChatSim`: the chat rooms in the sim backend |
| `js/net/bot.js` | `NetBot`: simulated typists for the sim backend |
| `js/app/combat/*.js` | The combat layer (combo, accuracy, spells, damage), see COMBAT.md |

The server also needs `js/wordbank-common.js` and `js/wordbank.js` if it picks the words itself.

Unit tests: `node tools/net/test.js`. Bot against bot balance runs: `node tools/net/balance.js`.

## API

Every call returns a Promise unless marked.

```js
Net.connect()                           // -> { id, name }   name and look come from WPM
Net.disconnect()
Net.on(event, fn)                       // -> off()   'presence' 'lobbies' 'lobby' 'chat' 'match' 'challenge' 'invite' 'notice'
                                        //            and for the chat rooms 'chat.msg' 'chat.rooms' 'chat.people' 'chat.post' 'chat.unpost' 'chat.delete'
Net.presence()                          // not a promise: the last presence list

Net.lobbies.list()                      // -> [LobbySummary]
Net.lobbies.create({ name, run, difficulty })   // -> Lobby
Net.lobbies.join(id)                    // -> Lobby
Net.lobbies.leave()
Net.lobbies.ready(on)
Net.lobbies.setRole(role)               // 'striker' | 'guard' | 'support'
Net.lobbies.kick(playerId)              // host only
Net.lobbies.setRun({ run, difficulty }) // host only
Net.lobbies.chat(text)                  // filtered here, and the server filters again
Net.lobbies.start()                     // host only, once everyone is ready
Net.lobbies.current()                   // not a promise: the lobby you are in or null
Net.lobbies.invite(playerId)            // -> Invite   opens a lobby for you first if you have none; 'invite' events follow

Net.chat.rooms()                        // not a promise: CHAT_ROOMS
Net.chat.enter()                        // -> { mode: 'full' | 'quick' | 'off', allowed: [roomId] | null, rooms: { id: { members, seq } } }
Net.chat.exit()
Net.chat.join(room)                     // -> { room, members: [Player], offline: [Player], history: [ChatMessage], posts: [Post] | null }
Net.chat.leave(room)
Net.chat.send({ room, text, wpm, quick, reply })   // -> ChatMessage   reply is a message id
Net.chat.post({ run, difficulty, skill: [lo, hi] }) // -> Post   Party finder; opens your lobby
Net.chat.people(room)                   // not a promise: who is online in the room
Net.chat.mute(id, on)                   // not a promise: kept in localStorage 'wpm-chat-mutes' and sent to the server
Net.chat.muted()                        // not a promise: [id]
Net.chat.report({ player, name, room, reason, lines })

Net.match.queue({ mode, opponent, challenge })  // -> MatchInfo   mode: 'quick' | 'art' | 'player' | 'watch'
Net.match.input(k, t)                   // not a promise: one key at t ms on the match clock
Net.match.ready()                       // not a promise: this client has loaded the arena (see "Loading before the countdown")
Net.match.leave()                       // leaving a duel early is a loss; leaving while it loads cancels it
Net.match.current()                     // not a promise: { info, state, words? } or null
Net.match.clock()                       // not a promise: ms on the match clock

Net.results.record()                    // -> DuelRecord
Net.results.party()                     // -> PartyRecord
Net.results.opponents()                 // -> [{ id, name, bot, art, rating, w, l }]

Net.profiles.get(id)                    // -> Profile    'me' is this player's public profile
Net.profiles.visit(id)                  // -> { profile, room }   the server counts the visit
Net.profiles.online()                   // -> [Player]

Net.challenges.send(id)                 // -> Challenge
Net.challenges.accept(id)
Net.challenges.decline(id)
```

`Net.test({ ... })`, or `window.__netTest` set before the scripts load, speeds the sim up for automated tests: `search`, `hp`, `roundMs`, `startMs`, `breakMs`, `offerMs`, `botWpm`, `partyBotWpm`, `join`, `answer`, `accept`, `artChance`, `artFight`, `artMs`, `partyStartMs`, `clearMs`, `teamHp` (each player's HP), `bossHp`, `partyFights` (a list of area keys that replaces the run's).

## Wire format

Each WebSocket message is one JSON object:

```json
{ "v": 1, "t": "lobby.join", "id": 7, "d": { "id": "L3k2" } }
```

- `v` is the protocol version, 1 for now.
- `t` is the message type.
- `id` is present on a request. The server answers with `{ "t": "ok", "id": 7, "d": ... }` or `{ "t": "err", "id": 7, "d": { "message": "That lobby is full." } }`. The client gives up after 10 seconds.
- `match.input` has no `id` and gets no answer.
- A message without `id` from the server is an event.

### Client to server

| `t` | `d` | Answer `d` |
|---|---|---|
| `hello` | `{ name, look, client: 'web-1' }` | `{ id, name }` |
| `presence.list` | `{}` | `[Player]` |
| `lobby.list` | `{}` | `[LobbySummary]` |
| `lobby.create` | `{ name?, run, difficulty }` | `Lobby` |
| `lobby.join` | `{ id }` | `Lobby` |
| `lobby.leave` | `{}` | `{}` |
| `lobby.ready` | `{ on }` | `Lobby` |
| `lobby.role` | `{ role }` | `Lobby` |
| `lobby.kick` | `{ id }` | `Lobby` |
| `lobby.run` | `{ run?, difficulty? }` | `Lobby` |
| `lobby.chat` | `{ text }` | `ChatMessage` |
| `lobby.start` | `{}` | `MatchInfo` |
| `match.queue` | `{ mode, opponent?, challenge? }` | `MatchInfo` |
| `match.input` | `{ id, k, t }` | none |
| `match.ready` | `{ id }` | none |
| `match.leave` | `{ id }` | `{}` |
| `results.record` | `{}` | `DuelRecord` |
| `results.party` | `{}` | `PartyRecord` |
| `results.opponents` | `{}` | `[Opponent]` |
| `profile.get` | `{ id }` | `Profile` |
| `profile.visit` | `{ id }` | `{ profile, room }` |
| `challenge.send` | `{ to }` | `Challenge` |
| `challenge.accept` | `{ id }` | `Challenge` |
| `challenge.decline` | `{ id }` | `Challenge` |
| `lobby.invite` | `{ to }` | `Invite` |
| `chat.enter` | `{}` | `{ mode, allowed, rooms }` |
| `chat.exit` | `{}` | `{}` |
| `chat.join` | `{ room }` | `{ room, members, offline, history, posts }`, history is the last 50 messages |
| `chat.leave` | `{ room }` | `{}` |
| `chat.send` | `{ room, text, wpm, quick, reply }` | `ChatMessage`, or `err` with `{ message, code, wait? }` |
| `chat.post` | `{ run, difficulty, skill: [lo, hi] }` | `Post` |
| `chat.mute` | `{ id, on }` | `{}` |
| `chat.report` | `{ player, room, reason, lines: [id] }` | `{ id }` |
| `chat.delete` | `{ room, id }` | `{}`, moderators only |

### Server to client (events)

| `t` | `d` |
|---|---|
| `presence` | `[Player]`, sent when someone comes online, goes offline or changes status |
| `lobbies` | `[LobbySummary]`, the open lobbies, sent when one changes |
| `lobby` | `Lobby` or `null` when you left or were removed |
| `chat` | `ChatMessage` |
| `match` | `{ type: 'start', ...MatchInfo, state, clock }`, `{ type: 'state', id, kind, state, clock }` (10 a second), `{ type: 'event', id, kind, ev }`, `{ type: 'end', id, kind, result, rating?, verified }` |
| `challenge` | `Challenge` whenever its status changes |
| `notice` | `{ kind: 'offline' \| 'maintenance' \| 'kicked', text? }` |
| `invite` | `Invite` whenever its status changes |
| `chat.msg` | `ChatMessage` with `room` and `seq`, for the room you joined |
| `chat.rooms` | `{ rooms: { id: { members, seq } } }`, every few seconds, for the unread counts |
| `chat.people` | `{ room, join: [Player], leave: [id], offline: [Player] }` |
| `chat.post` / `chat.unpost` | `Post` / `{ id }` in the Party finder |
| `chat.delete` | `{ room, id }`, a moderator removed a message |

## Payloads

```js
Player       { id, name, bot, status: 'idle' | 'duel' | 'run' | 'typing', rating, level, country }
LobbySummary { id, name, host, hostName, run: 'relay' | 'deep', difficulty: 'easy' | 'normal' | 'hard',
               players: [{ id, name, bot, role }], count, max: 4, status: 'open' | 'running' }
Lobby        LobbySummary + { players: [{ id, name, bot, role, ready, level }], chat: [ChatMessage], you, isHost }
ChatMessage  { id, from, name, bot, system, text, at }      system lines have no from
MatchInfo    duel:  { id, kind: 'duel', mode, seed, you: 0 | 1 | -1, players: [DuelPlayer, DuelPlayer], difficulty: [lo, hi],
                      words: [[], round1, round2, ...], config, challenge, startedAt, stakes: { win, draw, loss } }     you -1 is a spectator (no stakes)
             party: { id, kind: 'party', seed, run, difficulty, lobby, players: [{ id, name, role, bot, level }], you, art, startedAt }
DuelPlayer   { id, name, bot, art, rating, level, country }
Challenge    { id, from, fromName, to, toName, status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled', reason?, at }
Invite       { id, to, toName, lobby, status: 'pending' | 'accepted' | 'declined', reason?, at }
RoomMessage  { id, room, seq, from, name, bot, staff?, country, text, wpm, quick, reply: { id, name, text } | null, at }
Post         { id, lobby, room: 'party', by, name, bot, country, run, difficulty, skill: [lo, hi], count, max, status, at, expires }
DuelRecord   { rating, games, wins, losses, draws, streak, bestStreak, vsArt: { w, l },
               history: [{ at, id, mode, opp: { id, name, bot, art, rating }, score, wins, delta, rating, wpm, acc, forfeit }] }
PartyRecord  { runs, wins, best, history: [{ at, run, difficulty, won, cleared, of, art, role, dmg, wpm, acc, team }] }
Profile      { id, name, bot, art?, country, level, joined,
               stats: { bestWpm, avgWpm, acc, runs, modes: { 'Typing test': n, ... }, achievements },
               duel: { rating, games, wins, losses, bestStreak, vsArt },
               room: { layout } | { size, owned: [itemId], preset } }
```

A room is either the player's saved layout (`{ v: 1, items: [{ id, x, y, z, rot, wall }] }`, the same as `WPM.setRoom`) or, for a player who never saved one, the items they own and a preset number.

### Duel state (`match` state for `kind: 'duel'`)

```js
{ phase: 'load' | 'count' | 'fight' | 'break' | 'over', round, clock, roundAt, roundMs, breakUntil, wins: [a, b], hpMax,
  ready: [a, b],   // only in 'load'
  sides: [{ hp, idx, typed, target, clean, combo, tier, acc, offer: [spellId], offerUntil,
            statuses: [{ name, until, charges }], fog, frozen, locked, immune, reflect,
            stats: { keys, good, words, wrong, typos, chars, dmg, taken, blocks, bestCombo, spells, fizzles }, liveWpm }] }
```

### Loading before the countdown

A duel starts in phase `'load'` with the match clock held at 0. Each client loads the arena, plays every effect once behind a cover so nothing is built for the first time mid-fight, then sends `match.ready`. The server starts the clock, and with it the 3-second countdown, only once both players have sent it. While loading, `state.ready` says which sides are done, and keys are ignored. A spectator's ready doesn't hold the players.

If a side hasn't sent `match.ready` 30 seconds after the match was made, the server ends it with `result: { cancelled: true, reason: 'load' }`. Leaving during `'load'` ends it with `{ cancelled: true, reason: 'left' }`. A cancelled duel changes nobody's MMR or record.

`idx` is the side's place in the round's word list. `typed` is what that side has typed into the current word, so spectators and the opponent see typos as they happen.

### Duel events (`ev` in a `match` event)

| `type` | Fields |
|---|---|
| `round` | `phase: 'start' \| 'end', round, at`, and at the end `winner, wins, sides` (the round's stats) |
| `shot` | `side, to, dmg, tier, combo, crit, word, landAt` |
| `hit` | `side` (attacker), `to, dmg, kind: 'word' \| 'spell' \| 'reflect', spell, crit, tier, hp` |
| `block` | `side` (defender), `from, kind, spell` |
| `cast` | `side, to, spell, hits: [{ at, dmg }], blocked, broke` |
| `fizzle` | `side, spell` |
| `miss` | `side, word, typed` |
| `typo` | `side` |
| `locked` | `side`, a key sent while locked |
| `effect` | `side` (who it is on), `name: 'fog' \| 'frozen' \| 'locked' \| 'reflect' \| 'cleanse' \| 'dispel' \| 'shieldBroken', ms, n, until, resisted` |
| `status` | `side, name, on, until` |
| `combo` | `side, combo, tier, from, reason` |
| `offer` / `offerEnd` | `side, spells, until` / `side, reason` |
| `guard` | `side`, quantum split kept the combo |
| `end` | `winner, wins, rounds, sides` (the match summary per side) |

### Party state and events

Each player has their own HP and a handle (a word made from their name) that teammates type to heal, shield or revive them. A fight is one of five kinds: `hydra`, `swarm`, `snake`, `golem`, `twins`; Mixed run areas add mites (`adds: 'mites'`). Rules and numbers are in the header of `js/net/party-rules.js`; `node tools/net/party-balance.js` plays bot teams at several speeds.

State: `{ phase: 'count' | 'fight' | 'clear' | 'over', fight, of, run, clock, boss: { key, kind, adds, name, area, look, hp, maxHp }, foes: [{ id, kind: 'head' | 'twin' | 'queen' | 'golem' | 'car' | 'mite', name, word, hp, maxHp, alive, slot, lane, born, land, path, regrowAt }], weak, relink, teamCombo, teamTier, teamMult, meter, buffOffer, buffN, overclock, firewall, art, maxHp, attack: { id, word, land, start, target: playerId | 'team', from, dmg } | null, players: [{ id, name, role, bot, handle, hp, down, downLeft, shield, target, healIn, shieldIn, typed, idx, combo, tier, acc, offer, offerUntil, statuses, stats }] }`.

| `type` | Fields |
|---|---|
| `fight` | `phase: 'start' \| 'clear', fight, of, key, kind, adds, area, boss, look, hp, foes`, and at the start this player's `words` for the fight |
| `attack` | `id, word, start, land, dmg, target, from` |
| `block` | `id` (the attack), `by` (a player id or `'firewall'`), `target` |
| `impact` | `id, dmg, target, teamCombo, from` |
| `chip` | `what: 'spit' \| 'whip' \| 'quake' \| 'beam', from, targets, dmg`: small hits nobody can block |
| `hurt` | `id, dmg, kind: 'aimed' \| 'slam' \| 'chip' \| 'bite', shielded, hp` |
| `down` / `up` / `rebootStep` | `id, until` / `id, by, hp` / `id, until` |
| `heal` / `shield` | `id` (who got it), `by, amount, hp, ready` |
| `hit` | `id` (player), `foe, dmg, kind: 'word' \| 'spell' \| 'counter' \| 'pop' \| 'cut', foeHp, bossHp, tier, crit, spell` |
| `foe` / `foeGone` | a new mite or car / `id, how: 'kill' \| 'pop' \| 'bite', by, lane` |
| `aim` | `id, foe`: a player typed a head's or twin's name |
| `regrowing` / `regrow` / `headGone` | hydra heads and twins coming back |
| `relink` | `id, until`: twins, the other one has to fall by then |
| `weak` | `on, until`: the golem's core is open |
| `cast` | `id, spell, foe, hits, effect` |
| `buffOffer` / `buff` | `buffs` / `buff, by, until` |
| `teamCombo` | `combo, from, reason` |
| `miss`, `typo`, `fizzle`, `counterMiss`, `late` | `id` and the word; `late` is a mite or car word a teammate took first, with no penalty |
| `art` | `on` |
| `callout` | `text`, Art's line |
| `end` | `won, fights, cleared, of, ms, art, artAt, teamBest, players: [per player stats with wpm, acc, hp, heals, healed, shields, revives, pops, cuts, downs, taken]` |

## How the server checks results

The client is never trusted with damage, HP or a result. It sends only keys (`match.input { k, t }`), where `k` is one character, `'Backspace'` or `'CtrlBackspace'` and `t` is ms on the match clock.

1. **One authority.** The server runs the match with the same files the page uses: `DuelRules.match()` or `PartyRules.run()`, with the combat layer and `NetTypist`. It feeds every player's keys into it in the order they arrived and sends the events and the state from its own copy. The page draws what the server sends and only predicts its own typing buffer so letters show without delay.
2. **Seeds.** The server picks the seed and the word lists and sends them in `MatchInfo`. Spell offers come from `NetCore.rng(seed + round + side)`, so offers can't be rerolled by the client.
3. **Clock.** The server stamps each key with its own receive time. A client `t` is accepted when it is within 250 ms of the server's time and not earlier than that player's previous key; otherwise the server time is used.
4. **Typing limits.** A key interval under 15 ms for more than 20 keys in a row, or a word rate over 350 wpm for 10 seconds, flags the match for review and the result is held until checked.
5. **Replay.** `DuelRules.replay({ seed, words, logs, config })` rebuilds a whole match from the two key logs. The server stores the logs with every rated match. A disputed or flagged match is replayed and the stored result must match. `node tools/net/test.js` checks that a replay rebuilds every round of a bot match exactly and that a changed log gives a different result.
6. **Ratings and rewards.** Only the server writes ratings, the duel record, the party record and the coins and XP from multiplayer. In the sim the page pays coins through `WPM.record`; with the server that moves to the server.
7. **Spells.** A spell is cast only when its word is typed in full while it is on offer for that player. The spell's damage and effects come from `DuelRules.PVP` or the combat layer and never from the client.

## Fairness

- Shop items, coin purchases and subscriptions are looks only. Nothing a player owns changes damage, HP, spells or words in a duel or a party run. Duels use the same `DuelRules.CONFIG` for both sides, and the server must reject any client-side config.
- Rating is shown to players as **MMR**. It is Elo (`js/net/rating.js`): a result moves it by `k * (score - expected)`, so beating a higher MMR gains more than beating a lower one, and losing to a higher MMR costs less. `k` is 40 for a player's first 10 duels, then 24, then 16 from 2000.
- A player's first duel starts from the MMR their typing stands for (`NetRating.ofBot(wpm, acc)` from their recent runs, between 800 and 1800) instead of a flat 1200, so a fast typist isn't paired with slow players for weeks.
- `MatchInfo.stakes = { win, draw, loss }` is what each result would change the player's MMR by. The loading cover shows it.
- Quick match pairs a player with someone within about 100 MMR (in the sim, a bot typing at the speed that MMR stands for).
- Other players' wpm isn't shown on the duel page or the player card, only their MMR. Their wpm is on their profile.
- Art's duels are a ghost on his 204 wpm race pace (the same shape `TT.paceTimes` gives his race ghost), labelled Ghost, with a fixed rating of 2400. No recorded run of Art exists in the site yet. `NetBot.ART_TAPE = [ms between keys]` replaces the pace with a real key log once one is recorded.

## Bots

- Bots are labelled Bot everywhere a name appears: lists, lobbies, chat, the arena and the end screens. Art's simulated matches are labelled Ghost.
- A bot types at its wpm with uneven gaps, slower spaces and double letters, a reaction delay before it starts, the odd pause, typos from neighbouring keys that it fixes most of the time, and spell use that rises with its speed. The sim backend adjusts bot speed so a 60 wpm bot measures about 60 wpm over a match.
- Simulated profiles are seeded from the name, so a bot has the same stats, look and room every time.

## Moderation

Chat and names go through `NetFilter` on the device now. That is enough for bots and nowhere near enough for real players. Before chat between real players goes live, the server needs:

- the same filter on every chat line and name, run on the server, plus a maintained word list in more languages than English (Thai first, given Art's audience);
- a report button on every chat line and profile, with the line, the lobby and the time sent to a moderation queue;
- mute and block per player, kept on the server;
- rate limits on chat (for example 5 lines in 10 seconds) and on challenges;
- names checked on change, including the reserved names (Art, 10000wpm, admin, mod, staff);
- lobby chat off by default for accounts under 16, since the site is aimed at teenagers, with a switch to turn it on;
- logs of chat kept long enough to act on reports.

## Activity and daily snapshots (the home map)

The map on the home page reads two modules, and `Community.MODE` in `js/app/community.js` switches both. In `'demo'` they simulate everything from the seeded countries and the map says "Demo data" beside every number. In `'live'` they read the endpoints below, which do not exist yet.

`js/app/community.js` (countries and players): `GET /api/community/snapshot`, `GET /api/community/events?since=`, `POST /api/community/visit`. The shapes are at the top of that file.

`js/app/activity.js` (what is happening now, and every day since launch):

```
Activity.now()    -> { online, inBoss, inDuel, duels, inParty, inRush, typing, wordsToday, wordsTotal, wpmAvg }
Activity.boss()   -> { hp, max, region: { name, lon, lat }, participants, defeatsToday }
Activity.on(ev, fn)   ev: tick, hit, duel-start, duel-end, party, rush, defeat, respawn, milestone
Activity.history()    -> [Day], one record a day from launch
```

### Endpoints

| Call | Answer |
|---|---|
| `GET /api/activity/now` | `{ at, online, inBoss, inDuel, duels, inParty, inRush, typing, wordsToday, wordsTotal, wpmAvg, boss: { hp, max, region, participants, defeatsToday } }`. Polled every 5 s while the map is on screen, or pushed as `activity` over the WebSocket. |
| `GET /api/activity/events?since=<ISO>` | `{ now, events: [Event] }`, the same events as `Activity.on`. The client keeps at most 5 for the feed. |
| `GET /api/activity/days?from=1&to=<n>` | `{ days: [Day] }` from `daily_snapshots`. |

```
Event  hit        { player: { id, name, country }, wpm, dmg }        one burst of damage on the World Boss
       duel-start { id, a: player, b: player }
       duel-end   { id, winner: player, loser: player, w, l }       w and l are the two wpm
       party      { size, countries: [code] }                      a party finished a run
       rush       { player, bosses }                                a Boss rush run ended
       defeat     { players, region }                               the community boss reached 0 HP
       respawn    { region }
       milestone  { kind: 'node' | 'beacon', node?, country? }
```

### `daily_snapshots` table

Written once a day at 00:00 Asia/Bangkok for the day that ended, and updated through the day for today.

| Field | Type | What it holds |
|---|---|---|
| `day` | int, primary key | days since launch, day 1 is `KEYSPACE.launchDate` (2026-01-26) |
| `date` | date | Bangkok calendar date |
| `players` | int | players signed up by the end of the day |
| `countries` | int | countries with at least one player |
| `counts` | json | `{ code: players }` per country, for the time-lapse |
| `peak_online` | int | most players online at once |
| `words` | bigint | words typed that day, every mode |
| `words_total` | bigint | words typed since launch |
| `defeats` | int | World Boss defeats that day |
| `duels` | int | duels finished |
| `parties` | int | party runs finished |
| `new_players` | int | sign-ups that day |

Milestones come from these numbers, so the server and the time-lapse agree: a Keyspace node comes online the first day `words_total` passes its threshold in `KEYSPACE.nodes` (`js/app/rewards-config.js`), and a country gets its beacon the first day its count reaches `KEYSPACE.beaconPlayers`.

The community World Boss on the map has `BOSS_HP` 4,000,000 shared by everyone, separate from the 1,000,000 HP fight in `js/app/boss-rules.js`. Its region is seeded by the Bangkok date and moves to the next region on each defeat. The server should own both.

## Chat rooms (#/commons)

The rooms are data in `js/net/chat-rooms.js`: areas, then rooms with `id`, `name`, `topic`, `lang`, and `readOnly`, `kind: 'posts'`, `school` or `slowMs` where they apply. The server loads the same file, so a room added there exists on both sides. A room's `id` never changes once players have used it, since history is stored by it.

- **Join and leave.** `chat.join` subscribes the player to one room and answers with the people in it, the recent offline members and the last 50 messages (`CHAT_ROOMS.history`). `chat.msg` events come only for the joined room. `chat.rooms` goes to everyone in the chat every few seconds with each room's online count and its last `seq`, and the page shows `seq` minus the last `seq` it saw as the unread count.
- **One check, both sides.** The server runs `ChatRules.check` on every line with the player's own recent lines and last send time, and drops anything that fails. The page runs the same check first so the player sees the reason at once. It refuses lines over 140 characters, links, email addresses, phone numbers (7 or more digits), usernames from other apps (an @handle, or an app name with "add", "my", "follow" and the like), personal questions (age, where someone lives or goes to school, asking for photos, meeting up, calls, asking for secrecy; English, Filipino and Thai), words from `NetFilter` and the `TEEN_OFF` list in `js/wordbank.js`, and the same line again within 30 seconds. Runs of one letter are cut to five.
- **Slow mode.** One line every 2 seconds per player (`CHAT_ROOMS.slowMs`), or a room's own `slowMs`. The server answers `err` with `code: 'slow'` and `wait` in ms. On top of that, more than 20 lines in a minute mutes the player for 5 minutes (approved by Gid, 21 Nov 2026).
- **The wpm tag** is measured on the device from the first keystroke to Enter and sent with the line. The server can't check it, so it is shown only as a tag, capped at 300, and never counts toward records, ratings or tasks. Pasting is off in the box. Quick phrases carry no wpm.
- **Announcements** (`readOnly`) take lines only from Art's account and moderators. In demo it shows the site's updates.
- **Moderators** can delete any message with `chat.delete`, which removes it from history and sends `chat.delete` to the room. Moderators can also mute a player in every room for a set time.
- **Mute** is per player. The page keeps it in localStorage and hides that player's lines and posts. The server keeps it with the account so it follows the player to other devices.
- **Reports** carry the player, the room, the reason and the ids of their last 5 lines. The server keeps the lines with the report even if they are later deleted. In demo a report is saved on the device under `wpm-chat-reports`.
- **Party finder** (`kind: 'posts'`) has no free text. A post is made from a lobby (`chat.post` opens one), shows the run, difficulty, skill range and seats, and closes after 15 minutes (`CHAT_ROOMS.postMinutes`), when its lobby closes or starts a run. Join calls `lobby.join`.
- **Region rooms** are for one language each. The server's word list needs those languages too, Thai first.

### School and young accounts

- Accounts under 13 send quick phrases only (`ChatRules.QUICK`: hi, gg, good luck, join my party?, rematch?, well played). `chat.enter` answers `mode: 'quick'` and the server refuses any other text.
- School accounts start with chat off (`mode: 'off'`). A teacher's switch turns it on for the class, to quick phrases or to full chat.
- A teacher can also limit the class to the Learn rooms (`school: true` in the config). `chat.enter` then answers `allowed: [the Learn room ids]` and `chat.join` refuses the rest.
- Chat logs are kept for 90 days so reports can be acted on (approved by Gid, 21 Nov 2026).

### Friends and private messages

Gid's rule (22 Nov 2026): **rooms stay public**, so there are no private group chats; the only private chat is **one on one between friends**, with the same checks as the rooms.

- **Friends.** `friends.request` sends a request; the other player accepts or declines. A request to someone who already sent you one accepts theirs. At most 200 friends and 20 requests a day. `friends.remove` ends the friendship and deletes the private chat between the two.
- **Who can message whom.** `dm.send` only works when both players are on each other's friends list. Anything else answers `err` with `code: 'notFriend'`. There is no message request inbox from strangers.
- **The same check.** The server runs `ChatRules.check` on every private line with that player's recent lines, slow mode included, and refuses links, contact details, other apps' usernames, personal questions and blocked words. Accounts with chat `mode: 'quick'` send quick phrases only in private too; `mode: 'off'` turns private messages off.
- **Block.** `friends.block` removes the friend, deletes the private chat, mutes the player in the rooms and refuses their requests and messages. `friends.unblock` lifts it; the friendship doesn't come back by itself.
- **Report.** `dm.report` sends the last 20 lines of that private chat with the report. That is the only way a moderator sees a private chat.
- **Events.** `friends` (the whole list after any change), `friend.request`, `friend.accepted`, `dm.msg`, `dm.threads` (each thread's last line and unread count).
- **Page.** Friends sit above the rooms in Open Port, online first, with requests on top. `#/commons/@<id>` opens the private chat. The player card and the profile page have Add friend, which turns into Message once accepted, plus Block.
- **Demo.** `js/net/friends-sim.js` keeps friends and private chats on the device (`wpm-friends`, `wpm-dm`), sends one friend request from a bot on the first visit, and bots accept requests and answer now and then. Test hooks: `friendAccept`, `friendSeed`, `friendSeedMs`, `dmReply`.
- **Keeping private chats** is an open question for Gid (see REVIEW.md). Proposed: 30 days, shorter than the rooms' 90, and a reported chat kept until the report is closed.

The sim backend tests these with `Net.test({ chatMode: 'quick' | 'off', chatRooms: 'learn' })`, or `window.__netTest` set before the scripts load. `chatBots`, `chatRate`, `chatChurnMs` and `chatReply` also change the simulated rooms. Unit tests: `node tools/net/chat-test.js`.
