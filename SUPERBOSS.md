# Superboss

Superboss is the mode Art streams: he fights one of three bosses live while his viewers watch on this site, chat and spend coins to help him or to make the fight harder. It lives at its own route, `#/superboss`, with a tab on the Play page. Until the server exists, the viewer page runs a simulated stream with a bot typing for Art, and it mirrors a real streamer tab when one is open in the same browser.

| Route | Page |
|---|---|
| `#/superboss` | Pick a boss and a difficulty, with a 3D preview |
| `#/superboss/stream/<boss>/<dial>` | The streamer view: what Art plays and captures in OBS |
| `#/superboss/watch[/<boss>/<dial>]` | The viewer view: the fight mirrored from the stream, the chat, the support shop and the watch party count |

## Files

| File | What it holds |
|---|---|
| `js/app/sb-data.js` | `SuperData`: the bosses, the difficulty dial, the items, the chat lines and handles. No DOM |
| `js/app/sb-fight.js` | `SuperFight.create()`: the rules. No DOM, no three.js, no sound, its clock comes from `opts.now`, so it runs in node and later on a server |
| `js/app/sb-bot.js` | `SuperBot.create()`: a simulated typist that reads snapshots and types into a fight |
| `js/app/sb-stream.js` | `SuperStream`: the messages below, the simulated chat and the simulated viewers |
| `js/app/sb-audio.js` | `SuperAudio`: music beds, sound effects and stingers made in code, the buses and the ducking |
| `js/app/sb-scene.js` | `SuperScene`: the stage (light, fog, mist, light shafts, dust, the floor with light streaks), post, hit feel and the camera, with `Combat.FX` for spells |
| `js/app/sb-kit.js` | `SuperKit`: armour materials with panel seams and a rim light, geometry builders, the environment map, and the pooled effects (sparks, beams, rings, floor telegraphs, orbs, a flash light) |
| `js/app/sb-hydra.js`, `sb-compiler.js`, `sb-leviathan.js` | `SuperModels`: each boss's body, props, actions, death and anchors |
| `js/app/sb-support.js` | `SuperSupport`: viewers' items on stage |
| `js/app/sb-cam.js` | `SuperCam`: the broadcast shots that `CamDirector` (`js/app/camdir.js`) plays |
| `js/app/superboss.js` | The route: lobby, streamer view, viewer view, HUD and results card |
| `css/superboss.css` | Every style for the mode |
| `tools/superboss/balance.js` | Runs every boss on every dial against bots in node and prints win rates |

The page also loads `js/app/camdir.js` and `js/room/aq.js` (adaptive quality) unchanged. Shared files got small additions only: two script and one stylesheet line in `index.html`, the Play tab in `js/app/play.js`, the calm background in `js/app/shell.js`, `REWARDS.superboss` in `js/app/rewards-config.js`, `superboss` in the mode names in `js/app/ui.js`, and `superboss` beside `boss` in the gift crate and buddy route checks (`js/app/progress-ui.js`, `js/app/buddy.js`).

## The fight

- Every typed word is a target with a deadline. The first letter picks the target, so live targets start with different letters. Space or Enter sends the word.
- Damage comes from the combat layer (COMBAT.md): letters times the combo tier, accuracy, word speed and spell buffs. Spells are offered at combo 10, 25, 50 and every 25 after.
- Art has 100 HP. An attack that lands breaks the combo. Packets, Fork's bites and fixing a line out of order take HP and keep the combo.
- Phase 2 starts at 66% and phase 3 at 33%. A phase change calls off the attacks winding up and gives the banner 2.5 seconds.
- Enrage: when the timer runs out the boss attacks about 1.7 times as often and every hit on Art does 50% more. Reaction windows keep their length.
- At 0 HP the fight stops for the finish phrase. Type it in full before the bar runs out to win. Miss it and the boss heals to 12% and Art loses 10 HP.

### The difficulty dial

Every window is the time a typist at the dial's speed needs to react and type the word: `react + letters / (wpm x 5 / 60) x slack`. Boss HP is `wpm x 26 x hpK`. Slower dials also space the boss's moves further apart.

| Dial | wpm | Reaction allowance | Hydra HP | Compiler HP | Leviathan HP | Win coins |
|---|---|---|---|---|---|---|
| Casual | 60 | 880 ms | 1,560 | 1,404 | 1,560 | 40 |
| Normal | 90 | 745 ms | 2,340 | 2,106 | 2,340 | 80 |
| Hard | 120 | 610 ms | 3,120 | 2,808 | 3,120 | 140 |
| Typemaster | 150 | 475 ms | 3,900 | 3,510 | 3,900 | 220 |
| Brutal | 180 | 340 ms | 4,680 | 4,212 | 4,680 | 320 |

Typemaster is the dial for Art. `node tools/superboss/balance.js 6` runs six fights per boss and dial with a bot at 110% and at 70% of the dial's speed, 98.5% accuracy:

| Boss | Typemaster, bot at 165 wpm | Typemaster, bot at 105 wpm | Casual, bot at 66 wpm |
|---|---|---|---|
| Kernel Hydra | won 6 of 6, about 2:15 | won 0 of 6 | won 5 of 6 |
| The Compiler | won 5 of 6, about 3:25 | won 0 of 6 | won 6 of 6 |
| Packet Leviathan | won 6 of 6, about 3:10 | won 0 of 6 | won 5 of 6 |

The bot reads a misspelled line instantly, so the Compiler is harder for a person than this table shows.

## The bosses

### Kernel Hydra (enrages at 4:30)

Three heads on one body of blocks, in a flooded server pit. Each head has its own word stream and HP bar, and every word typed at a head hits it and the body.

- A head nobody hits for 2.5 seconds heals 8% a second (10% in phase 2, 13% in phase 3).
- A cut head deals a bonus 1.5% of the body's HP and grows back after 9 seconds (7.5 in phase 2, 6 in phase 3).
- **Fork** (green, short common words) bites every 6.5 seconds for 3 HP with a 0.9 second warning. Only cutting Fork stops the bites.
- **Root** (cyan, cyber words) winds up a breath with a red block word. Block it, or cut Root before it lands. It hits for 14 HP (16 in phase 2, 18 in phase 3), and in phase 3 the block is two words.
- **Patch** (gold, mixed words) mends the other heads by 25% every 7.5 seconds. From phase 2 it also puts cut heads back on at half HP, so Patch is the head to cut first.
- All three heads down opens the neck for 5 seconds: the word stack appears and every core word deals triple damage.
- **Tidal slam** (phase 2 on): the hull rises out of the water and drops, and a wave rolls at Art. A block word, 10 HP (12 in phase 3, 70% on Casual and Normal). Blocking it throws the wave back: a counter hit of 2.5% of the boss's HP, and Fork's next bite waits 2.5 seconds. About every 16 seconds (13.5 in phase 3), longer on slow dials.
- Finish phrases: `sever every head`, `cut the kernel loose`, `no head grows back`.

### The Compiler (enrages at 4:45)

A tower of screens that writes a program at you, in a hall of build pillars. Each new line has a misspelled word in red. Type the word spelled right before the line compiles.

- Fixing the oldest line first deals double damage. Fixing any other line first costs 3 HP and drops a combo tier.
- A line that compiles with its bug hits Art for 9 HP (11 in phase 2, 13 in phase 3).
- The word stack between lines is cyber and common words.
- Stack overflow: a block word every 13 seconds (11, 9) for 14 to 16 HP, two words in phase 3. Each hand holds up a column of memory blocks beside the tower while the screen pushes blocks onto it; the columns sway and turn red as they overflow, lean back, and the arms hurl them round both sides of the tower at Art.
- **Segfault** (phase 2 on): the eye charges while two pointer screens leave the orbit and take their places down one side; red aim lines join them and the last one sweeps over the floor to Art. The beam jumps eye, pointer, pointer, Art, so it never crosses the code. A block word, 10 HP (12 in phase 3), about every 14 seconds (11.5).
- **Fork bomb** (phase 3): the rack hatches open and two drones rise out and fly a wide arc round the side at Art. Type each one's word to kill it (triple damage); one that lands costs 4 HP. About every 12.5 seconds.
- Phase 2: 40% of lines carry two bugs, fixed left to right. Phase 3: lines compile faster and two can arrive at once.
- Casual and Normal show the fixed word in grey under each bug.
- Finish phrases: `exit with code zero`, `build failed for good`, `end of program`.

### Packet Leviathan (enrages at 4:30)

A serpent of packet segments circling an open network sea.

- A weak point word shows on the segment facing you for a split second: the time to react and type it at 1.25 times the dial's speed in phase 1, 1.15 in phase 2 and 1.05 in phase 3. Typing it deals 3.5 times the word's damage.
- Phase 2: about half the weak points come with a red decoy word on a far segment. Typing the decoy costs 8 HP and a combo tier.
- Lunge: a block word, 14 HP. In phase 3 it is a tail sweep with a two-word block, 16 HP.
- **Breach** (phase 2 on): 45% of lunges (35% in phase 3) are a breach instead: it dives, the water boils under Art and it bursts up out of the sea. A block word, 15 HP.
- Packets: 2 (then 3) short cyan words fly at Art one after another. Typing one sends it back for triple damage. One that lands costs 4 HP.
- Finish phrases: `drop every packet`, `close the last port`, `sink the leviathan`.

## How it looks and moves

- Every boss is built in code from lit armour (metal with glowing panel seams and a rim light) on a stage with a key light, a coloured rim light, low mist, shafts of light, dust and a floor that reflects the lights above it as streaks.
- **Kernel Hydra:** an armoured hull in black water with a tail behind it and three heads on vertebra necks. Fork has twin forked horns, Root a crown of antenna spikes and hanging cables, Patch a frill of stapled spines and a plate over one eye. The bite coils back and lunges with the jaws snapping; the breath rears up, charges an orb in the jaws while a red ring fills under Art, then fires a beam; the mend sends gold threads; the slam lifts the hull and sends a wave. A cut head flies off and sinks, and grows back out of the stump.
- **The Compiler:** a mainframe of a monitor with a CPU housing on top (a heatsink, copper heat pipes into the racks, a lens hood round a tracking eye), server racks at its shoulders with drive bays, fans, hatches and code screens, cables with data running down them, satellite code screens orbiting it and two industrial arms on hydraulic pistons (two-bone IK, elbows always bending forward) typing in bursts on floating keyboards beside the screen. The code lines are laid over the screen by the page, so nothing of the model ever covers them, and every attack comes round the sides of the screen instead of across it. The eye glances away now and then and blinks when hit; a fix flashes its line and shakes the screen. Phase 2 opens vents on the head and spins everything faster; phase 3 runs the heatsink and pipes hot, leaks steam, keeps the hatches ajar and puts a crosshair in the eye. A phase break is a kernel panic on the screen and a reboot from the top down. The countdown powers it on: the screen wipes on, the eye opens, the arms unfold.
- **Packet Leviathan:** an armoured sea serpent arcing in and out of the sea under a storm, with data running down its spine. Its 28 segments hang from its head like a rope and lean toward their place on the swim loop, so it can rear, strike and dive while the body follows. Each segment has scutes, belly plates, a dorsal spine, a seam band and flank lights; fins on every third one, a fluke on the tail, two glowing lures on its brow and lit gills. The sea ripples, foams round the body where it pierces the surface and sprays. The weak point segment opens four plates round a white core, the decoy a red one. The lunge swims up in front of Art and rears back with its jaws filling with light, then the jaws close on Art's bot or slam into the barrier and rebound. The breach dives, the sea boils under Art, and it bursts up in a column of spray and bites down. The tail sweep raises the tail out of the sea and brings it down through Art or onto the barrier. Packets fly from its jaws one after another and typed ones fly back into its face. Phase 2 turns its lures and spines gold; phase 3 cracks its armour with light and raises its spines. Lightning on phase breaks.
- Phase breaks make the boss roar. The finish phrase leaves the boss beaten down with its core lit, and each right key of the phrase sends a spark into it with a rising tick. The kill: the Hydra's heads go limp and drop one by one, the hull cracks with light and blows; the Compiler glitches, its glass cracks out from under the eye, the eye bursts, the arms and satellites drop, panels blow off, the screen shatters, the core under the heatsink blows and the tower sinks; the Leviathan thrashes and roars, its segments burst from the tail up and the head falls into the sea in a column of spray, all before the results card comes up.
- **Broadcast camera** (`sb-cam.js` with `CamDirector`): the game shot frames each boss by its size. Cutaways: a hero intro during the countdown, a phase break (close-up in slow motion, then the wide), a cut head, the Hydra's open neck, a Leviathan weak point hit, and the kill (a close-up in slow motion, then an orbit). The Leviathan has its own: the intro low on the water looking up at its head, the phase break from under its jaw and then a high wide, the breach from Art's side, and the kill wide and low on the water as it falls (`levRise`, `levRoar`, `levBreach`, `levKill`; the model asks for them through `ctx.want`). A model can also bring its own version of the stock intro, phase and kill (`model.shots`): the Compiler's intro is a boot (a low close-up as the eye opens, then a crane down the tower), its phase break a crash (from under the panicking eye, then a high wide of the reboot) and its kill a teardown (the eye, the arms dropping from the side, then a crane back as it sinks). The director turns down any cutaway when an attack Art has to answer lands within 3 seconds (blocks, packets, weak points, decoys and bug lines), read from the snapshot's targets or, on the one line the streamer page uses, from `line.tags`, caps them at 3 in 20 seconds, and keeps the game shot with reduced motion.
- **Viewers' items** (`sb-support.js`): a gold barrier of hexagons rises in front of Art for each shield and shatters a layer when it stops a hit (typed blocks light it cyan), a green column for a heal, orange embers and a rune ring for Overclock, a clock face over the arena for Slow mo (the boss moves slower), a train of gold lights round the rim for the Hype train and gold rain when the meter fills, fog, a magenta glitch swirl and red speed streaks for the chaos items.
- **Adaptive quality:** `js/room/aq.js` lowers the resolution first, then turns off the mist, the light shafts and the dust, on a machine that can't hold 60 fps.

## Support and chaos

Viewers spend coins on items that land in the fight with their name on screen. Prices are in `REWARDS.superboss` in `js/app/rewards-config.js`.

| Item | Kind | Price | What it does | Limit |
|---|---|---|---|---|
| Shield | Support | 40 | Blocks the next hit on Art | 2 at a time |
| Overclock | Support | 60 | 50% more damage for 10 seconds | A new one restarts the 10 seconds |
| Heal | Support | 30 | Gives back 5 HP | One every 8 seconds, not at full HP |
| Slow mo | Support | 50 | Wind-ups take 20% longer for 10 seconds, including the ones already running | A new one restarts the 10 seconds |
| Hype train | Support | 25 | Adds 3 times its price to the crowd meter | |
| Fog | Chaos | 35 | Blurs the word stack, the head words and the Compiler's bugs for 5 seconds. Block words, weak points and the finish stay sharp | Chaos rules below |
| Shuffle | Chaos | 15 | Swaps Art's next word, or a head's word, for a longer one | Chaos rules below |
| Speed up | Chaos | 45 | Wind-ups take 15% less time for 8 seconds | Chaos rules below |

- Every support item adds its price to the crowd meter (300 to fill). A full meter gives Art a free crowd spell, a rare or epic spell word in gold that lasts 15 seconds.
- Chaos rules: one chaos item at a time, 12 seconds between them, 2 per phase, none in the first 8 seconds, none while Art is under 30% HP and none during the finish. System purge clears running chaos.
- The site's own viewer pays with WPM coins. The coins come off when the button is pressed and go back if the streamer's page turns the item down. A landed item sends `support_sent`.
- Simulated viewers buy every 9 to 22 seconds, mostly heals and shields when Art is low, and chaos about a quarter of the time when it is open.

## Streaming

- The stage is 16:9: the arena and a side column with the camera slot, the hype train and the chat. Every size inside it is in container units, so it reads the same at 1920x1080 in OBS as on a laptop.
- **Camera slot**, set under the stage: *Webcam frame* shows Art's camera after he presses Camera on (getUserMedia is only called then). *Transparent for OBS* leaves the slot see-through in streamer mode, so the real camera source sits under the browser source. *Green screen* fills it with #00ff00 for a chroma key.
- **Streamer mode** (button or F9) hides the site menu, the coins, the name, the toasts and the buddy, fills the window with the stage and makes the text 15% bigger.
- **OBS**: capture the streamer view as a window, or add a browser source at 1920x1080. For the transparent slot, use a browser source and turn on streamer mode.
- **Sound**: music beds from `audio/*.mp3` (Hydra: stage4, stage5, boss. Compiler: stage2, stage3, wb-p3. Leviathan: stage1, wb-p2, wb-p4. Enrage: wb-enrage. Win: wb-win), sound effects and stingers made in code. Buses: music, sound effects (compressed) and stingers, into a limiter and a 0.7 output gain. The music ducks to 60% under support alerts, to 40% under stingers, to 50% under epic and ultimate spells, and to 50% while Art talks when *Duck music under my mic* is on. The mic is only measured, never played. Music and sound effects each have a slider.
- Offline renders of every sound and of a busy moment over each music bed all peak under -4 dBFS (loudest -4.2 dBFS, music bed at full slider with a stinger, hits, a cut and the combat layer's spells on top).
- **Hit feel**, from the action-juice ladder: a shot from Art to the target, a white flash and a flare on impact, damage numbers (bigger for crits and spells), recoil, hitstop of 50 to 160 ms on crits, cuts, phase breaks and the kill, and a moderate camera shake capped at about 1% of the frame. Reduce shake cuts the shake to a quarter, and reduced motion cuts it further. Flashes are capped at 3 a second.

## The viewer view

- The fight, drawn from the stream's messages only. Viewers never run the rules.
- The chat with a box to type in. Messages go to the streamer's page and come back to every viewer.
- The support shop with the viewer's coins. Chaos buttons turn off with the reason when chaos is closed.
- The watch party count, which is the simulated viewers plus the real ones.
- With no streamer tab open, a simulated stream: a SuperFight with a bot at the dial's speed plus 20, sent over a loopback link so the page reads the same messages a real stream sends. The next boss starts 12 seconds after each fight. A streamer tab that opens later takes over.

## Stream messages (v1)

Every message is one JSON object:

```json
{ "v": 1, "type": "fight.state", "from": "streamer", "seq": 812, "at": 1763730000000, "data": { } }
```

`from` is `streamer` or the viewer's id, `seq` counts up per sender and `at` is the sender's clock in ms.

### Streamer to viewers

| Type | When | Data |
|---|---|---|
| `stream.hello` | every 2 s, and in answer to `stream.ping` or `viewer.join` | `{ streamer, boss, dial, viewers, sim }`: `sim` means the chat and viewer count are simulated |
| `fight.state` | 10 times a second | the snapshot below |
| `fight.event` | as it happens | `{ name, data }`, names below |
| `chat.msg` | each chat line | `{ id, user, text, sim, kind }` |
| `support.result` | in answer to `support.buy` | `{ id, ok, reason }` |
| `stream.end` | when a fight ends | `{ result }`, the results card numbers |

### Viewers to the streamer

| Type | Data |
|---|---|
| `stream.ping` | `{ id }` asks a live streamer to say hello now |
| `viewer.join`, `viewer.leave` | `{ id, name }` |
| `support.buy` | `{ id, item, buyer, price }` |
| `chat.send` | `{ id, user, text }`, text at most 200 characters |

### The snapshot (`fight.state`)

```js
{
  v: 1, t: 61234, status: 'fight',          // ready | countdown | fight | finish | won | lost
  boss: 'hydra', dial: 'typemaster', phase: 2, hp: 2301, maxHp: 3900,
  enrageIn: 208766, enraged: false, countdown: 0,
  art: { hp: 84, max: 100, combo: 37, best: 52, tier: 2, tierName: 'Twin beam', next: 50, progress: 0.48,
         acc: 0.984, wpm: 151, shield: 1, over: 0, slow: 4200, buffs: [{ name: 'hyper', left: 3100, charges: 0 }] },
  typed: 'pat', cur: 'h41',                  // what Art has typed and the target it is going to
  stack: ['vector', 'socket', 'gateway'],     // the word stack, empty when the boss has none
  targets: [{ id: 'b52', kind: 'block', word: 'cipher', left: 1400, total: 2100, owner: 'root', attack: 'breath' }],
  finish: null,                               // { phrase, left, total } during the finish
  chaos: { fog: 0, speed: 0, block: 'Chaos is cooling down.' },   // block is null when chaos is open
  hype: { n: 120, goal: 300 },
  b: { heads: [{ id: 'fork', hp: 20, max: 34, up: true, tid: 'h40', regrowIn: 0 }], neck: 0 },   // per boss
}
```

`b` holds the Hydra's heads and neck timer, the Compiler's lines (`{ id, tpl, fixes: [{ bad, good, done }], k, left, total, state, tid }`, with `good` only on Casual and Normal), or the Leviathan's dive timer. Target kinds: `finish`, `block`, `packet`, `decoy`, `weak`, `crowd`, `fix`, `spell`, `head`, plus the stack word.

### Events (`fight.event`)

`countdown`, `go`, `hit { amount, src, word, tier, crit, at, hp, frac }`, `hurt { amount, src, hp }`, `phase { n, line }`, `enrage`, `finish { phrase, ms }`, `finishFail`, `win` and `lose` (with the result), `cast { spell, word, rarity, hits, effect, crowd }`, `fizzle`, `sever { head }`, `regrow { head }`, `neck { on }`, `block`, `blockFail`, `windup { kind, owner, ms }`, `attack { kind, owner }`, `cancel`, `compile { line }`, `fix { line, inOrder }`, `order`, `line`, `weak { hit }`, `weakOpen`, `decoy`, `packet { returned }`, `support { id, kind, buyer, price, you }`, `hype { full, spell }`, `shielded`, `warded`, `tier`, `comboDrop`, `shuffle`, `cleanse`, `chaosEnd`, `offer`, `crowdGone`, `miss`.

`hit.at` names where the hit lands (`head:fork`, `core`, `body`, `seg:front`, `head`, `line:<id>`), so a viewer draws the shot in the right place.

### For the server

- Art's client sends `fight.state`, `fight.event`, `stream.hello` and `stream.end`. The server forwards them to everyone in the watch party and keeps the last snapshot for viewers who join late.
- The server owns coins: on `support.buy` it checks and takes the buyer's coins, forwards the purchase to Art's client, and refunds when `support.result` says no. Today the viewer's page does both with its own WPM coins.
- Chat goes through the server with a rate limit and a word filter before it reaches Art's page.
- The server should not trust Art's damage numbers for leaderboards. It can rerun the fight with `sb-fight.js` from his key stream and the seed, the same way COMBAT.md describes for the world boss.

## Progress

- The streamer's page calls `WPM.record({ mode: 'superboss', wpm, acc, correct, keys, ms, won, difficulty, boss, coins })` once per fight. The coins are the usual typing coins plus the win coins for the dial.
- `superboss_win { boss, dial, ms, wpm, combo }` when Art wins, `support_sent { item, kind, price, boss }` when a viewer's item lands, `spell_cast` for each cast and `combo` with the best combo. The first two are registered when the script loads.

## Test hooks

`window._sb` on the streamer view: `bench(n)` (frames back to back: ms, draw calls, triangles), `cam(pos, look, fov)` (a fixed review camera, `null` to release), `model()`, `scene()` (shot, camera log, adaptive quality), `start()`, `phase(n)`, `hp(frac)`, `finish(ms)`, `enrage()`, `support(id, buyer)`, `combo(n)`, `offer(ids)`, `crowd()`, `artHp(n)`, `type(text)`, `bot(wpm)`, `camera(on)`, `streamer(on)`, `slot(v)`, `slow(k)`, `pause(on)`, `render(name)`, `mix(track)`. `window._sbw` on the viewer view: `state()`, `mode()`, `sim()`, `bot()`, `buy(id)`, `phase(n)`, `finish()`, `support(id, who)`. `window.__sbHold = 3` keeps banners and alerts up three times longer for screenshots. `window.__sbFull = true` keeps full quality (no adaptive quality) for screenshots and benches. `_sb.arena().scene.step(secs, fps)` advances a paused scene by fixed frames, and `_sb.arena().scene.event(name, data)` plays a boss action without the rules, for reviewing animation.
