# lowercase site: build spec

The site is **lowercase**, the organisation every player joins (Gid, 22 Nov 2026). Its mark is the Shift key's arrow turned to point down, and its theme is lower case: every word on the site shows in lower case through one rule in `css/site.css`, canvases included through a hook in `js/app/ui.js`. The text a player types keeps its case, and free typing has a switch that drops the capitals from book passages. Keyspace is the world; Art keeps his laurel mark and @10000wpm.

This spec covers the standalone version of the site for Art (@10000wpm on Instagram, 25.5K followers, a speed typist sponsored by keyboard makers). Everything runs in the browser with no server. Progress, coins and the room are saved on the player's device through `js/state.js`. A server for global leaderboards and a shared world boss, and payments, come later.

Art's own mockups are in `design/`. Match their look: `ca2e6d4b` (shop), `c183062a` (type page), `4ae85dd2` (leaderboard), `389191bc` (my room), `d2315375` (profile). `5e35ff3f` and `33b832e5` are references he liked.

## Art direction

A hacker terminal. Near-black green backgrounds, terminal green as the main colour, thin glowing panel borders with cut corners and corner brackets, monospace labels, faint scanlines and a faint falling-code background. Art chose the neon green glow on purpose, so the usual "no neon, no glow" design rules do not apply here. Keep the glow on borders, numbers and the active nav item rather than on every element.

### Tokens (in `css/site.css` `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#040806` | page |
| `--bg-2` | `#07100b` | panels |
| `--bg-3` | `#0c1a12` | raised panels, inputs |
| `--line` | `rgba(57,255,136,.28)` | panel borders |
| `--green` | `#39ff88` | main accent, active, correct letters |
| `--green-dim` | `#1f9e57` | second text on green |
| `--ink` | `#d7f5e3` | main text |
| `--ink-2` | `#7fa892` | second text |
| `--gold` | `#f2c230` | coins and the top three ranks only |
| `--red` | `#ff4d5e` | errors, damage |
| `--cyan` | `#3ee6ff` | rare highlight, Art's caret and ghost |
| `--r` | `2px` | radius; panels use cut corners instead |

Fonts from Google Fonts: **Chakra Petch** (600, 700) for headings, **Share Tech Mono** for nav, labels and panel titles, and **JetBrains Mono** (400, 600) for typing text and numbers. Body text is Chakra Petch 400.

### Patterns

- Panel: `--bg-2` fill, 1px `--line` border, top-left and bottom-right corners cut 10px with `clip-path`, and a panel title in Share Tech Mono like `// TYPING PERFORMANCE` or `> SHOP_`.
- Nav: logo (the downward arrow mark plus `lowercase_` with a blinking cursor and `// the typing collective`) at the left, then `[ home ] [ type ] [ play ] [ world boss ] [ open port ] [ leaderboard ] [ my room ] [ shop ] [ profile ]`, then coins and the player's avatar and name at the right. The active item is green with an underline glow.
- Big numbers (wpm, coins, rank) in JetBrains Mono with `font-variant-numeric: tabular-nums`.
- Do not use the Guy Fawkes mask from the mockups. Use a hooded figure made from code characters instead.

## Structure

One page, `index.html`, with hash routes so it works on GitHub Pages and from a file:

| Route | Page | Owner |
|---|---|---|
| `#/home` | Hero race against Art, his facts, the 3D keyboards with specs, videos, for brands | site agent |
| `#/type` | Typing test: words, time, quote and custom modes, 15/30/60/120 s, live stats, live wpm chart | site agent |
| `#/play` | Game hub: Breach (the reworked Typo Horde) and Race | site agent for the hub, game agent for Breach |
| `#/leaderboard` | Art's records and this device's bests per mode | site agent |
| `#/room` | 3D room the player decorates with items bought in the shop | room agent |
| `#/shop` | Items to buy with coins, by category | site agent for the page, room agent for item models and thumbnails |
| `#/profile` | Name, avatar, level, coins, stats, wpm chart, recent sessions, streak, achievements | site agent |

### Files and owners

- `js/state.js`: progress API (`window.WPM`). Shared and already written. Read the top of the file. Do not change its API without saying so in your report.
- `js/words.js`, `js/core.js`: word lists, `TT.captureKeys`, `TT.TypeText`, `TT.randomWords`, key sounds. Shared. Additions are fine. Do not break the existing functions.
- `js/keyboards.js`, `js/kb3d.js`: sponsor keyboards and the 3D showroom (site agent reskins).
- `js/race.js` plus the race part of `js/games.js`: the race (site agent reskins it to the theme).
- `js/horde*.js`, `audio/`, `STORY/`: the game (game agent).
- `js/room/*.js`: room and item models (room agent). It must expose `window.RoomItems` with the item catalog and a thumbnail renderer that the shop page uses.
- `js/app/*.js`: router and pages (site agent).

### Rewards

Every typing run, game or race calls `WPM.record({ mode, wpm, acc, correct, keys, ms, score?, cleared?, won? })` once when it ends, and shows the coins and XP it returns. Mode keys: `time-15`, `time-30`, `time-60`, `time-120`, `words-25`, `words-50`, `words-100`, `quote`, `custom`, `race-art`, `race-best`, `race-duo`, `horde-1` to `horde-5`.

## Writing

All visible text follows Gid's writing rules. Load the `my-writing-style` and `humanizer` skills with the Skill tool before writing any text. The short version:

- Headings and labels are names: "Shop", "Recent sessions", "Best wpm". Panel titles may use the terminal style from the mockups (`// RECENT SESSIONS`, `> SHOP_`).
- Instructions are one plain sentence: "Press Tab to start over." No taglines, no "Unleash", "Dominate", "Level up your", no slogans.
- No sentence starting "That is" or "This is" that only labels the sentence before it. No "not X, but Y". No comma before and/or/but/so. Few dashes. No emoji.
- No reassuring padding ("Your progress is safe", "Don't worry"). State the fact once.
- Real numbers and names. Never invent players, reviews, follower counts or brand deals. Leaderboards show only Art's real records and this device's runs.

## Testing in this container

- Google Chrome is at `/usr/bin/google-chrome`. Python Playwright is installed. WebGL works with `--use-angle=swiftshader --enable-unsafe-swiftshader` and runs slowly, so game time passes slower than real time.
- The CDN and Google Fonts are blocked from the container. Serve the repo with `python3 -m http.server PORT -d /home/claude/repo-1000wpm` and route requests the way `route()` does in `/home/claude/test/play.py`: three.js files come from `/home/claude/deps/node_modules/three` and font CSS returns empty. Use a port nobody else uses (game 8781, site 8782, room 8783).
- Take screenshots at 1440x900 and 390x844 and look at them. Fix what looks wrong before reporting.
- Do not commit or push. The lead commits.
