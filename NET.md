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
| `js/net/party-rules.js` | `PartyRules`: roles, the team combo, boss attacks, buffs, Art's drop-in and the run result |
| `js/net/rating.js` | `NetRating`: Elo with a larger step for new players, bot ratings, rating tiers |
| `js/net/filter.js` | `NetFilter`: the chat and name filter |
| `js/net/bot.js` | `NetBot`: simulated typists for the sim backend |
| `js/app/combat/*.js` | The combat layer (combo, accuracy, spells, damage), see COMBAT.md |

The server also needs `js/wordbank-common.js` and `js/wordbank.js` if it picks the words itself.

Unit tests: `node tools/net/test.js`. Bot against bot balance runs: `node tools/net/balance.js`.

## API

Every call returns a Promise unless marked.

```js
Net.connect()                           // -> { id, name }   name and look come from WPM
Net.disconnect()
Net.on(event, fn)                       // -> off()   'presence' 'lobbies' 'lobby' 'chat' 'match' 'challenge' 'notice'
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

Net.match.queue({ mode, opponent, challenge })  // -> MatchInfo   mode: 'quick' | 'art' | 'player' | 'watch'
Net.match.input(k, t)                   // not a promise: one key at t ms on the match clock
Net.match.leave()                       // leaving a duel early is a loss
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

`Net.test({ ... })`, or `window.__netTest` set before the scripts load, speeds the sim up for automated tests: `search`, `hp`, `roundMs`, `startMs`, `breakMs`, `offerMs`, `botWpm`, `partyBotWpm`, `join`, `answer`, `accept`, `artChance`, `artFight`, `artMs`, `partyStartMs`, `clearMs`, `teamHp`, `bossHp`.

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
| `match.leave` | `{ id }` | `{}` |
| `results.record` | `{}` | `DuelRecord` |
| `results.party` | `{}` | `PartyRecord` |
| `results.opponents` | `{}` | `[Opponent]` |
| `profile.get` | `{ id }` | `Profile` |
| `profile.visit` | `{ id }` | `{ profile, room }` |
| `challenge.send` | `{ to }` | `Challenge` |
| `challenge.accept` | `{ id }` | `Challenge` |
| `challenge.decline` | `{ id }` | `Challenge` |

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

## Payloads

```js
Player       { id, name, bot, status: 'idle' | 'duel' | 'run' | 'typing', rating, level, country }
LobbySummary { id, name, host, hostName, run: 'relay' | 'deep', difficulty: 'easy' | 'normal' | 'hard',
               players: [{ id, name, bot, role }], count, max: 4, status: 'open' | 'running' }
Lobby        LobbySummary + { players: [{ id, name, bot, role, ready, level }], chat: [ChatMessage], you, isHost }
ChatMessage  { id, from, name, bot, system, text, at }      system lines have no from
MatchInfo    duel:  { id, kind: 'duel', mode, seed, you: 0 | 1 | -1, players: [DuelPlayer, DuelPlayer], difficulty: [lo, hi],
                      words: [[], round1, round2, ...], config, challenge, startedAt }     you -1 is a spectator
             party: { id, kind: 'party', seed, run, difficulty, lobby, players: [{ id, name, role, bot, level }], you, art, startedAt }
DuelPlayer   { id, name, bot, art, rating, level, country }
Challenge    { id, from, fromName, to, toName, status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled', reason?, at }
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
{ phase: 'count' | 'fight' | 'break' | 'over', round, clock, roundAt, roundMs, breakUntil, wins: [a, b], hpMax,
  sides: [{ hp, idx, typed, target, clean, combo, tier, acc, offer: [spellId], offerUntil,
            statuses: [{ name, until, charges }], fog, frozen, locked, immune, reflect,
            stats: { keys, good, words, wrong, typos, chars, dmg, taken, blocks, bestCombo, spells, fizzles }, liveWpm }] }
```

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

State: `{ phase: 'count' | 'fight' | 'clear' | 'over', fight, of, run, clock, boss: { key, name, area, look, hp, maxHp }, teamHp, teamMax, teamCombo, teamTier, teamMult, meter, buffOffer, buffN, overclock, firewall, art, attack: { id, word, land, start } | null, players: [{ id, name, role, bot, typed, target, idx, combo, tier, acc, offer, offerUntil, statuses, stats }] }`.

| `type` | Fields |
|---|---|
| `fight` | `phase: 'start' \| 'clear', fight, of, key, area, boss, look, hp`, and at the start this player's `words` for the fight |
| `attack` | `id, word, start, land, dmg` |
| `block` | `id` (the attack), `by` (a player id or `'firewall'`) |
| `impact` | `id, dmg, teamHp, teamCombo, from` |
| `hit` | `id` (player), `dmg, kind: 'word' \| 'spell' \| 'counter', bossHp, tier, crit, spell` |
| `cast` | `id, spell, hits, effect` |
| `buffOffer` / `buff` | `buffs` / `buff, by, teamHp, until` |
| `teamCombo` | `combo, from, reason` |
| `miss`, `typo`, `fizzle`, `counterMiss` | `id` and the word |
| `art` | `on` |
| `callout` | `text`, Art's line |
| `end` | `won, fights, cleared, of, ms, art, artAt, teamBest, teamHp, players: [per player stats with wpm and acc]` |

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
- Quick match pairs a player with someone near their rating (a bot near their recent wpm in the sim).
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
