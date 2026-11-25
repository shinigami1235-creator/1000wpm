# lowercase

lowercase is the typing site and the organisation its players join, made for Art, who posts speed typing on Instagram as @10000wpm. Everything on it shows in lower case (see SPEC.md). Run it from a web server: GitHub Pages, or `python -m http.server` in this folder and then http://localhost:8000. Opened straight from the folder (a `file://` address), Chrome blocks the 3D scenes, the avatars, the fonts and the boss music, since it won't load modules, fonts or audio from disk. Nothing loads from another company's server: three.js is in `lib/three/` and the fonts are in `fonts/`.

## Pages

The site is one page, `index.html`, with a hash route for each page so it works on GitHub Pages and from a file.

- **Home** (`#/home`). The text at the top types itself at Art's 204 wpm and a visitor who starts typing races Art's caret. Beside it are his numbers from Instagram, then links to Type, Play and My Room, the 3D keyboards with their specs, his reels and the section for brands.
- **Type** (`#/type`). A typing test in four modes: time (15, 30, 60 or 120 seconds), words (25, 50 or 100), quote and custom, where the player pastes their own text. The panels show wpm, accuracy, correct and incorrect letters, time, progress, a live wpm chart with peak and average and the player's records against Art's 204.
- **Play** (`#/play/breach`, `#/play/race`). Breach is a typing shooter in cyberspace with three modes. Story has five chapters, each in its own area with its own boss: Art's stream chat, a night market, the last train, a factory and the Fixword core. Endless sends mixed enemies until you lose three lives, and a hit clears the screen and drops you back to level 1. The daily run is one endless stage that is the same for everyone that day. Easy uses short words for x0.6 points, Normal is x1.0 and Hard uses longer words, faster enemies and more glitch words such as H3llo for x1.5. The race is a driving view where your car's speed comes from your typing speed, on a neon grid city or one of five night courses. Race Art, your best run or a friend on the same keyboard.
- **World boss** (`#/boss`). Everyone attacks Syntax Error, one boss with 1,000,000 HP. Each player types through their own stack of words and every correctly typed word deals one damage per letter. Spaces, wrong words and half-typed words deal nothing. The fight has five phases by HP left: Online, Corrupted at 75%, Memory leak at 50%, Kernel exposed at 25% and Kernel panic at 10%, where it is enraged. Its block attacks are the crash, the packet flood, the fork bomb and the overload. Each phase has its own movement, attacks, arena colour and music loop. A phase change plays a roar and a banner and pauses typing for 1.2 seconds. The boss attacks every 7 to 12 seconds and each attack word shows in its own slot above the word stack. A block attack shows a red word to type before its timer runs out and missing it halves your damage for 5 seconds. Packets fly at the raid and typing one sends it back for triple damage. A firewall takes the raid's damage until someone breaks it and bugs patch the boss until someone types their words. When half the raid blocks an attack or the firewall breaks, the kernel opens for 6 seconds and hits deal double damage or triple when it is enraged. Six quick words in a row stagger it and make the next three hits crits. The page shows the HP left, a scoreboard of damage and blocks, a live feed of hits and raid events and the player's damage, rank, blocks, packets sent back and bugs deleted. Blocks earn 3 coins each up to 60 and being there when it falls earns 20. These amounts are for playtesting and will change. Until the server is live the other raiders, raider_01 to raider_40, are simulated at 40 to 150 wpm, a new demo boss starts at full HP and the demo banner has buttons that skip to a later phase. The fight is saved in this browser so a reload continues it.
- **Leaderboard** (`#/leaderboard`). Art's 204 wpm from his reels and the runs on this device, with a tab for each mode, the world boss, Breach endless and daily runs and this device's room. Breach scores are split by difficulty. The global board needs the server so no other players are shown.
- **My Room** (`#/room`). A 3D room decorated with items from the shop. Bigger floors from S to XL are sold in the shop, and any size you own can be picked.
- **Operator** (`#/lab`). Your operator: base, colours, keyboard and gear, with its animations. Gear from the shop can be tried on here and shows in fights once it's bought.
- **Shop** (`#/shop`). Operator gear first, then room items by category, bought with coins. Filter by owned or not owned, sort by price and search by name. Coins are the only currency and every item can be bought with coins earned by playing. The CTRL Pass doubles the coins you earn for 30 days, coin packs sell coins, and items at 25,000 coins or more show as Premium. The pass and packs are hidden until `REWARDS.shop.payments` is set to true, and their buttons stay off until the server can take payments. MODELS.md lists every slot a generated model will fill. All the numbers are in `REWARDS.shop` (`js/app/rewards-config.js`), and `WPM.grantPass(days)` is the hook the server calls once a payment clears. For testing, open the site with `?coins=test` (for example `index.html?coins=test#/shop`): the balance shows 9,999,999 and nothing costs anything. `?coins=off` puts the real balance back and takes back what was bought with test coins. It only changes that browser's save. Remove it (the test coins block in `js/state.js`) before coins move to the server.
- **Duel** (`#/duel`). PvP typing duels, best of 3 rounds: a quick match at your level, a challenge to another player or Art's ghost at 204 wpm, or watching two bots. Both players type the same words, every correct word fires a shot, combos power the shots up and spells land on the other player. Ratings, wins, losses, streaks and the record against Art are on the Duels tab of the leaderboard.
- **Party** (`#/party`). Lobbies of up to 4 players who pick a role (striker, guard or support) and fight a chain of bosses through Keyspace together. Empty seats fill with bots and Art sometimes drops in to call out attacks and buff the team.
- **Player profiles** (`#/u/<id>`). Another player's 3D avatar, stats and duel record, a button to challenge them and a read-only visit to their room (`#/u/<id>/room`). `#/u/me` shows your own profile the way others see it.
- **Profile** (`#/profile`). Name, one of eight hooded avatars drawn from code characters, level and XP, coins, stats, a wpm chart, recent sessions, the 7-day streak, achievements and a button that resets progress after asking.

Every run calls `WPM.record` once when it ends and earns coins and XP. Coins, XP, runs, the streak and the room are saved in this browser through `js/state.js`.

## Structure

- `index.html` holds the nav, the page frame, the icons, the scripts every page needs and the Content-Security-Policy. Pages draw into `<main id="view">`. After editing any inline `<script>` in it, run `node .github/csp-tag.mjs index.html --write`, or that script is blocked.
- `js/app/lazy.js` loads each page's scripts and styles the first time the page opens, from the groups listed at its top. A new page or mode goes into a group there, and `Router.lazy(name)` in `index.html` registers it. Avatars render in 3D only on the profile, player profiles, duels and parties; elsewhere they show a picture rendered before or the hooded figure (`js/app/avatar.js`).
- `css/site.css` holds the colours, fonts and layout, with the tokens from `SPEC.md` at the top.
- `js/app/router.js` reads the hash and mounts one page at a time. Each page registers `{ title, mount(el, params), unmount(), update?(params) }`. Leaving a page calls its `unmount`, which stops its timers, games and WebGL. `#/play/race` passes `['race']` to the play page.
- `js/app/shell.js` runs the parts that stay put: coins and avatar in the nav, the sound button, the mobile menu, toasts for coins, level ups and achievements and the falling-code background. The background stops when the tab is hidden or the player prefers reduced motion.
- `js/app/ui.js` holds shared helpers: the avatars, the line chart, number and date formats and `waitFor`, which shows "Loading" until `window.Breach`, `window.Room` or `window.RoomItems` exists.
- `js/app/home.js`, `type.js`, `play.js`, `boss.js`, `leaderboard.js`, `shop.js`, `room.js` and `profile.js` are the pages.
- `js/app/boss-rules.js` holds `window.WorldBossRules` with the boss and phase names, the phases and the attack schedule. `js/app/boss3d.js` draws the world boss in three.js, `js/app/boss-audio.js` plays its music from `audio/wb-*.mp3` and its sound effects and `js/app/boss-net.js` holds `window.WorldBossNet`, the connection the boss page talks to.
- `js/state.js` is the progress API, `window.WPM`.
- `js/words.js` holds about 3,400 words from wordfreq with names, places and loaded words taken out.
- `js/core.js` holds the typing engine and the key sounds and deals words from shuffled lists so none repeat until the list runs out.
- `js/hero.js` runs the race on the home page through `HeroRace.mount(el)`.
- `js/games.js` runs the race game through `RaceGame.mount(el)` and `js/race.js` draws its road, cars and speedometer.
- `js/keyboards.js` holds each board's specs, colours and layout and `js/kb3d.js` builds the 3D keyboards through `KB3D.mount(stage, card)`.
- `js/breach/` is Breach, loaded by `js/breach/load.js`. `audio/` and `STORY/` belong to it.
- `js/room/` is the room and the shop items, loaded by `js/room/load.js`.
- `js/net/` is the network layer for duels, party runs, profiles and challenges, with a simulated backend until the server exists. NET.md has the API, every message and how the server checks results. `js/app/duel.js`, `duel3d.js`, `party.js`, `players.js` and `multi-ui.js` are the multiplayer pages and `css/multi.css` their styles.

Add a new sponsor board as one entry in `js/keyboards.js`.

## World boss server

The boss page only calls `window.WorldBossNet`:

- `connect({ id, name })` joins the current fight and resolves with its state.
- `now()` gives the fight clock in ms. A server version returns server time so every client reads the attack schedule at the same moment.
- `sendDamage(letters, { crit, jam })` sends one correctly typed word from the stack. `crit` is set for the three words after a stagger and `jam` while a missed block halves the player's damage.
- `sendBlock(attackId, text)`, `sendReturn(shotId, word)` and `sendAddKill(addId, word)` send an attack word typed in time and resolve with `{ ok }`.
- `onState(fn)`, `onHit(fn)` and `onEvent(fn)` return a function that stops listening.
- `newBoss()` starts the next fight and `disconnect()` leaves.

A state is `{ bossId, name, maxHp, hp, dealt, startedAt, defeatedAt, lastHit, demo, phase, phaseAt, shield, weak, blocks, addsDown, raiders: [{ id, name, damage, blocks, you }] }`. A hit is `{ id, name, letters, dmg, kind, crit, weak, shield, at, you }` where `kind` is `word`, `return`, `block` or `add`. An event has a `type` of `phase`, `shieldUp`, `shieldBreak`, `adds`, `addDown`, `impact` or `defeat`.

Every client works out the same fight from the state without extra messages:

- The phase is `WorldBossRules.phaseOf(hp / maxHp)`. Adds can heal the boss but never past the top of the current phase so the phase only moves forward.
- `phaseAt[p]` is when phase p began. The attacks are `WorldBossRules.eventsAt(state, now)`, where a seeded random draw keyed on the boss id, the phase and the cycle number picks each attack and its words. Every client shows the same attack with the same word at the same time.
- The shared results are in the state. `shield` holds the shield HP, `blocks` counts the blocks on each attack, `addsDown` names who destroyed each add and `weak` holds when the open core closes and its multiplier. The server sets `weak` when half the raid blocks an attack or the shield breaks.

`LocalDemo` in `js/app/boss-net.js` runs all of this in the browser now. Its simulated raiders block most attacks, send back about a third of the thrown words, destroy adds after 3 to 11 seconds and wear down shields with their damage. `LocalDemo.demo` adds `jumpTo`, `setFrac` and `simScale` for the skip buttons and the tests and a server leaves it out. A server version is an object with the same methods passed to `WorldBossNet.use(impl)` before the page opens. COSTS.md compares the options:

- **Supabase**: keep the boss row in a table, call a database function from `sendDamage` that subtracts the letters in one update and send `onState`, `onHit` and `onEvent` from a Realtime channel. A scheduled function runs the attack schedule from the same rules file to raise shields, count blocks and heal from adds. The free plan holds 200 players connected at once.
- **Cloudflare Durable Object**: one Durable Object holds one fight and its WebSocket connections. `connect` opens the socket, each send is a message and the object runs the attack schedule from the same rules file and sends back the state a few times a second.

The server has to check the words it receives against the stack it dealt each player, since anyone can send damage from the browser. It also checks each block, sent-back word and add against the schedule and its time window and works out crits and halved damage from the times of the words it receives instead of trusting the flags. The sound button sends a `wpm-sound` event with `{ on }` so the games can stop their music.

## To confirm with Art

1. Which brands sponsor him. Womier is marked Collab from his caption. KeyPro is the first highlight on his profile and sells the LOGA board.
2. His best speed. 204 wpm is the highest score on screen in his recent reels.
3. The board colours, which were matched to his videos by eye.
4. The specs that came from shops and reviews: the LOGA weight and hot-swap plus every Chilkey value.
5. His YouTube link and an email for brands.
6. The Breach story in `STORY/WORLD.md`, since it uses Art as the main character.
