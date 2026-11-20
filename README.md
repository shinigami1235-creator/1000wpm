# 10000wpm

Sample website for Art, who posts speed typing on Instagram as @10000wpm. Open `index.html` in a browser with an internet connection since the 3D keyboards and fonts load online. Breach's music loops cleanly when the site runs from a web server such as GitHub Pages and loops with a short gap when opened as a file.

## Pages

The site is one page, `index.html`, with a hash route for each page so it works on GitHub Pages and from a file.

- **Home** (`#/home`). The text at the top types itself at Art's 204 wpm and a visitor who starts typing races Art's caret. Beside it are his numbers from Instagram, then links to Type, Play and My Room, the 3D keyboards with their specs, his reels and the section for brands.
- **Type** (`#/type`). A typing test in four modes: time (15, 30, 60 or 120 seconds), words (25, 50 or 100), quote and custom, where the player pastes their own text. The panels show wpm, accuracy, correct and incorrect letters, time, progress, a live wpm chart with peak and average and the player's records against Art's 204.
- **Play** (`#/play/breach`, `#/play/race`). Breach is a typing shooter in cyberspace with three modes. Story has five chapters, each in its own area with its own boss: Art's stream chat, a night market, the last train, a factory and the Fixword core. Endless sends mixed enemies until you lose three lives, and a hit clears the screen and drops you back to level 1. The daily run is one endless stage that is the same for everyone that day. Easy uses short words for x0.6 points, Normal is x1.0 and Hard uses longer words, faster enemies and more glitch words such as H3llo for x1.5. The race is a driving view where your car's speed comes from your typing speed, on a neon grid city or one of five night courses. Race Art, your best run or a friend on the same keyboard.
- **World boss** (`#/boss`). Everyone attacks one boss with 1,000,000 HP. Each player types through their own stack of words and every correctly typed word deals one damage per letter. Spaces, wrong words and half-typed words deal nothing. The page shows the HP left, the letters dealt, a damage scoreboard, a live feed of hits and the player's own damage and rank. The boss loses parts of its shell at 75%, its rings at 50%, its chest at 25% and turns red at 10%. Until the server is live the other raiders, raider_01 to raider_40, are simulated at 40 to 150 wpm and a new demo boss starts at 300,000 HP. The fight is saved in this browser so a reload continues it.
- **Leaderboard** (`#/leaderboard`). Art's 204 wpm from his reels and the runs on this device, with a tab for each mode, the world boss, Breach endless and daily runs and this device's room. Breach scores are split by difficulty. The global board needs the server so no other players are shown.
- **My Room** (`#/room`). A 3D room decorated with items from the shop. Bigger floors from S to XL are sold in the shop, and any size you own can be picked.
- **Shop** (`#/shop`). Room items by category, bought with coins. Filter by owned or not owned, sort by price and search by name.
- **Profile** (`#/profile`). Name, one of eight hooded avatars drawn from code characters, level and XP, coins, stats, a wpm chart, recent sessions, the 7-day streak, achievements and a button that resets progress after asking.

Every run calls `WPM.record` once when it ends and earns coins and XP. Coins, XP, runs, the streak and the room are saved in this browser through `js/state.js`.

## Structure

- `index.html` holds the nav, the page frame, the icons and the script tags. Pages draw into `<main id="view">`.
- `css/site.css` holds the colours, fonts and layout, with the tokens from `SPEC.md` at the top.
- `js/app/router.js` reads the hash and mounts one page at a time. Each page registers `{ title, mount(el, params), unmount(), update?(params) }`. Leaving a page calls its `unmount`, which stops its timers, games and WebGL. `#/play/race` passes `['race']` to the play page.
- `js/app/shell.js` runs the parts that stay put: coins and avatar in the nav, the sound button, the mobile menu, toasts for coins, level ups and achievements and the falling-code background. The background stops when the tab is hidden or the player prefers reduced motion.
- `js/app/ui.js` holds shared helpers: the avatars, the line chart, number and date formats and `waitFor`, which shows "Loading" until `window.Breach`, `window.Room` or `window.RoomItems` exists.
- `js/app/home.js`, `type.js`, `play.js`, `boss.js`, `leaderboard.js`, `shop.js`, `room.js` and `profile.js` are the pages.
- `js/app/boss3d.js` draws the world boss in three.js and `js/app/boss-net.js` holds `window.WorldBossNet`, the connection the boss page talks to.
- `js/state.js` is the progress API, `window.WPM`.
- `js/words.js` holds about 3,400 words from wordfreq with names, places and loaded words taken out.
- `js/core.js` holds the typing engine and the key sounds and deals words from shuffled lists so none repeat until the list runs out.
- `js/hero.js` runs the race on the home page through `HeroRace.mount(el)`.
- `js/games.js` runs the race game through `RaceGame.mount(el)` and `js/race.js` draws its road, cars and speedometer.
- `js/keyboards.js` holds each board's specs, colours and layout and `js/kb3d.js` builds the 3D keyboards through `KB3D.mount(stage, card)`.
- `js/breach/` is Breach, loaded by `js/breach/load.js`. `audio/` and `STORY/` belong to it.
- `js/room/` is the room and the shop items, loaded by `js/room/load.js`.

Add a new sponsor board as one entry in `js/keyboards.js`.

## World boss server

The boss page only calls `window.WorldBossNet`:

- `connect({ id, name })` joins the current fight and resolves with its state.
- `sendDamage(letters)` sends one correctly typed word.
- `onState(fn)` and `onHit(fn)` return a function that stops listening. A state is `{ bossId, name, maxHp, hp, dealt, startedAt, defeatedAt, lastHit, demo, raiders: [{ id, name, damage, you }] }` and a hit is `{ id, name, letters, at, you }`.
- `newBoss()` starts the next fight and `disconnect()` leaves.

`LocalDemo` in `js/app/boss-net.js` runs all of this in the browser now. A server version is an object with the same six methods passed to `WorldBossNet.use(impl)` before the page opens. COSTS.md compares the options:

- **Supabase**: keep the boss row in a table, call a database function from `sendDamage` that subtracts the letters in one update and send `onState` and `onHit` from a Realtime channel. The free plan holds 200 players connected at once.
- **Cloudflare Durable Object**: one Durable Object holds one fight and its WebSocket connections. `connect` opens the socket, `sendDamage` sends a message and the object sends back the state a few times a second.

The server has to check the words it receives against the stack it dealt each player, since anyone can send damage from the browser. The sound button sends a `wpm-sound` event with `{ on }` so the games can stop their music.

## To confirm with Art

1. Which brands sponsor him. Womier is marked Collab from his caption. KeyPro is the first highlight on his profile and sells the LOGA board.
2. His best speed. 204 wpm is the highest score on screen in his recent reels.
3. The board colours, which were matched to his videos by eye.
4. The specs that came from shops and reviews: the LOGA weight and hot-swap plus every Chilkey value.
5. His YouTube link and an email for brands.
6. The Breach story in `STORY/WORLD.md`, since it uses Art as the main character.
