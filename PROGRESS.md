# Progress events

Daily tasks, weekly tasks and achievements listen to events from `WPM.track` and never to the pages. A new mode plugs in with two calls and no change to the progress code.

```js
// once when the mode's script loads so its tasks join the daily draw
WPM.events.register('lesson_pass');

// each time the player does the thing
WPM.track('lesson_pass', { lesson: 'home-row-1', wpm: 42, acc: 97 });
```

`WPM.track(name, payload)` adds `name` and `at` (an ISO time) to the payload and sends it to every `WPM.on('track', fn)` listener. Calling it also registers the name. Registered names are saved so a task for a mode stays in the draw after the first visit.

A task or achievement for an event nobody has registered stays out of the daily draw and off the profile grid. The academy, spells and PvP tasks are already written and appear once those modes register their events.

## Events

| Event | Sent by | Payload |
|---|---|---|
| `run` | `WPM.record`, for every finished run in any mode | the run (`mode, wpm, acc, correct, keys, ms, score?, won?, cleared?, difficulty?`) plus `newBest` |
| `type_test` | `js/app/type.js` | `mode, wpm, acc, correct, ms` |
| `race_done` | `js/games.js`, `js/hero.js` | `opp` (`art`, `best` or `duo`), `wpm, acc, won` |
| `boss_hit` | `js/app/boss.js`, each hit the player lands | `dmg, kind` (`word`, `block`, `return`, `add`), `crit` |
| `boss_win` | `js/app/boss.js`, the player was in the fight when Syntax Error went down | `dmg` |
| `combo` | `js/app/boss.js` every 5 words in a row, `js/breach/game.js` at the end of a run | `n, mode` |
| `breach_stage` | `js/breach/game.js`, a chapter cleared | `chapter` (1 to 5), `difficulty, score, wpm, acc` |
| `breach_endless` | `js/breach/game.js`, an endless or daily run ended | `score, level, daily, difficulty` |
| `item_buy` | `WPM.buy` | `id, price` |
| `room_save` | `WPM.setRoom` | `items` (the number placed) |
| `signin` | the streak, once a calendar day | `streak, cycleDay, shield` |
| `task_done` | the task list | `id, weekly` |
| `gift_open` | the gift crate | `id, source` |
| `lesson_pass` | the academy, not built yet | `lesson` and anything else |
| `spell_cast` | combat, not built yet | `spell` |
| `pvp_win` | `js/app/duel.js`, a duel won | `mode` (`quick`, `art`, `player`), `opp`, `art` |
| `pvp_match` | `js/app/duel.js`, every duel that ends, won or lost | `mode, won, opp, art, wpm, acc, rating` |
| `party_run` | `js/app/party.js`, a party run that ends | `run, difficulty, won, cleared, role, dmg, art` |

A combo event carries the highest combo so far. Tasks keep the largest `n` they see and sending it often or once at the end both work.

## Adding a task or an achievement

Task templates and achievements are in `js/app/progress-data.js`. A task names its event, a goal `n` and how events count toward it:

```js
{ id: 'lesson3', ev: 'lesson_pass', tier: 'medium', n: 3, text: 'Finish {n} academy lessons' }
{ id: 'acc95', ev: 'type_test', tier: 'medium', n: 1, when: e => e.acc >= 95, text: 'Hit 95% accuracy in a typing test' }
{ id: 'chars2k', ev: 'run', tier: 'easy', n: 2000, add: e => e.correct, text: 'Type {n} correct characters' }
{ id: 'combo25', ev: 'combo', tier: 'medium', n: 25, max: e => e.n, text: 'Reach a {n} combo' }
```

Each day draws one easy, one medium and one hard task, seeded by the date so every player gets the same three. The week draws three weekly tasks the same way. An achievement reads a counter kept in `count()` in `js/app/progress.js` and a new kind of achievement needs a line there.

## Other hooks

- Coins and XP for the streak, tasks, achievements and gifts are all in `js/app/rewards-config.js`.
- `Progress.bonus(id)` returns a visual bonus when it is unlocked and switched on, with its `color`. The room reads `roomlight` this way.
- `Progress.give(source)` hands out a random room gift. The crate opens on the next page that is not a game.
- Items with `gift: true` in `RoomItems` stay out of the shop. `js/room/gift-items.js` adds four of them with `RoomItems.add`.
- Tests can step through days by setting `window.__wpmNow` to a function that returns a timestamp before the page scripts run.
