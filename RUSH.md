# Boss rush

Boss rush is a near-endless run of boss fights at `#/play/rush`, the third game on the Play page. Copies of the five Breach bosses and Syntax Error come one after another, then come back as mark II, mark III and so on with more HP and new twists. A director sets every fight from the boss number and how the player has been doing. The scoreboard is kept on this device until the server exists.

## Files

| File | What it holds |
|---|---|
| `js/app/rush/data.js` | The roster, the twists each mark adds, the floors table, the Breach move words and the scoring formula |
| `js/app/rush/director.js` | `RushDirector`, the internal monitor that plans each fight |
| `js/app/rush/fight.js` | `RushFight`, one fight's rules with no DOM, which lets node run it |
| `js/app/rush/scene.js` | `RushScene`, the arena and the boss figures in three.js (the five Breach bosses drawn here, the titans and Syntax Error from `js/app/bosskit.js`), with the combat effects, each titan's arena and the camera director |
| `js/app/rush/titans.js` | `RushTitans`, each titan's attacks (wind-up, strike, recovery), its entrance and its death |
| `js/app/rush/titanfx.js` | `RushTitanFX`, the titans' pooled effects: floor telegraphs, particles, debris, shockwave rings, trails, the beam and the light pulse |
| `js/app/rush/audio.js` | `RushAudio`, the music, the stinger between bosses and the effects |
| `tools/rush/music.py` | Makes each boss's music, `audio/rush-<boss>-<phase>.mp3`, in code |
| `js/app/rush/board.js` | `RushBoard`, the scoreboard, the saved director model and the server payload |
| `js/app/rush/page.js` | `RushPage`, the entry screen, the fights, the breather and the end screen |
| `css/rush.css` | The rush's own styles on top of the World Boss page's `.page-boss` rules |
| `tools/rush/sim.js` | Director tests with simulated players |

Load order (`js/app/lazy.js`): the combat files, then `data`, `director`, `fight`, `audio`, `titanfx`, `titans`, `scene`, `page`.

## The run

- Boss n is roster slot `(n - 1) % 6` at mark `floor((n - 1) / 6) + 1`: The Spam, The Signboard, The Announcer, The Press, The Correction, Syntax Error, then The Spam mark II.
- Each fight has a word stack, a weak point word (5% of max HP times the word's multiplier) and attacks. A wind-up shows one or more counter words with a timer. Typing all of them blocks it, takes 4% of the boss's HP and stuns it for 3.2 s. Words hit double while it is stunned. A wind-up that lands costs integrity and breaks the combo.
- The player has 100 integrity. A landed wind-up costs 22, plus 3 for each mark past I, up to 40. A wrong word costs the typo penalty. A fight is lost at 0.
- Every third attack is the boss's own move from Breach, every second one from mark IV:

| Boss | Move | Done right | Missed |
|---|---|---|---|
| The Spam | Three gift words to type before they reach you | 6 s stun | 8 per gift left |
| The Signboard | A misspelled sign to type spelled right | 8% of HP and a 6 s stun | a full hit |
| The Announcer | Six speaker words to mute in order | 1.5% each and a 6 s stun | 5 per speaker left |
| The Press | Two wind-ups in a row; three blocks in a row overheat it | 6 s stun on overheat | a full hit each |
| The Correction | Which one is spelled right, three options | 12% of HP and a 6 s stun | a full hit |
| Syntax Error | Four packets to send back | triple damage each, a stun if all go back | 6 each |

- Twists by mark: II a firewall of 15% of max HP at half HP, III glitched stack words, IV the own move twice as often, V faster attacks below 30% HP, VI one more counter word per wind-up. Any fight that runs past 2.2 times its sized length enrages too.
- Between fights the breather shows the run so far and the next boss, with Next boss (Enter) and End run. A lost fight offers one retry per run.
- The combo carries from boss to boss. Spell damage is scaled to the boss as power times max HP / 700. One cast takes at most 40% of max HP (zero day 75%).

## Phases

Every fight has three phases: from full HP, from 66% and from 33%. The two lines on the boss's HP bar mark them, and the header says "Phase 2 of 3". At each change the boss roars, glitches, grows a little and stops attacking for 1.6 s, and then:

- its big attacks come sooner: the gap between them is 80% of phase 1's in phase 2 and 64% in phase 3,
- its signature move comes sooner by the same amount, and in phase 3 most signatures come two at a time,
- its music switches to a faster version of the same track (see Music),
- it sways across the arena faster.

The phase pace is `RushData.PACE` and the HP lines are `RushData.STAGES`.

## Signature moves

Each boss has one move it keeps doing for the whole fight, between its big attacks and its own move from Breach. The words for it sit in the arena on the thing they belong to, not in the chip row. Typing one deals the same damage as a stack word. One that gets through costs 4 integrity at mark I, 2 more each mark up to 14, and doesn't break the combo. Nothing new is thrown while the boss is stunned.

| Boss | Signature | Rules |
|---|---|---|
| The Spam | Pop-ups | Windows land over the arena, each with a word. They stay until typed. If three are open, the next one bites (70% of a full hit) and all close. Phase 3: two at a time. |
| The Signboard | Falling signs | A sign drops into view, hangs, then falls on you while its shadow grows. Type it before it lands. Phase 3: two at a time. |
| The Announcer | Volume | The volume climbs (4.5% a second, 6% in phase 2, 8% in phase 3). Speakers light up with words; each one typed takes 24% off. Past half, your words shake; at full volume it shouts (80% of a full hit) and drops back to 35%. Up to three speakers lit, four from phase 2. |
| The Press | Pages | Pages slide along the floor at you. Five typed in a row (no gap over 5 s) overheat it for a 6 s stun. |
| The Correction | Red pen | It crosses out a word in your line and writes a wrong version over it in red. Type the crossed-out word for 1.5 times the damage; type the red one and it hurts and the word is used up. Phase 3: two marks at a time. |
| Syntax Error | Packets | Packets fly at you; typing one sends it back for double damage. From phase 3 one of each pair is a red fake: typing it hurts 1.5 times as much, letting it land does nothing. |

The time between two signature attacks is `gap` word-times at the fight's sized speed S (a word is about 5.5 letters), kept between 1.7 and 9 s, times the phase pace. A sign, page or packet gives `react + perChar * letters * 1.5 + 0.9 s` to type it, 10% less in phase 3. The numbers are in `RushData.SIG`.

## Music

Each boss has its own track, made in code by `tools/rush/music.py` with no samples, so it's ours to ship. A track is a 16-bar loop at three speeds, one per phase; phase 2 adds the lead and phase 3 adds busier drums and a brighter, harder mix. `RushData.musicFor(boss, phase)` names the file and the page crossfades to the next one at a phase change. All 18 files are about -17 LUFS with peaks under -6 dBFS, the same loudness as the Breach loops.

| Boss | Style | Speeds (bpm) |
|---|---|---|
| The Spam | Bubbly electro-pop with a message-chirp hook, F# minor | 124, 136, 150 |
| The Signboard | Neon city-pop with gated chords and a slap bass, E dorian | 110, 120, 132 |
| The Announcer | Driving techno with a station chime, B minor | 126, 138, 152 |
| The Press | Industrial, metal clanks and a distorted bass, D phrygian | 118, 130, 144 |
| The Correction | Dark and dramatic, half-time drums and an ostinato, C minor | 132, 144, 158 |
| Syntax Error | Fast broken beat with a growling bass and a glitch arp, A minor | 150, 162, 176 |

To change one, edit its writer in `tools/rush/music.py` and run `python3 tools/rush/music.py <boss>`.

## The director

`RushDirector.plan(n)` works out S, the speed in wpm the fight is sized for, and turns it into the fight's numbers. Every decision goes into a log: `_rush.log()` in the page, `RushBoard.director().log` in the save and the console when `localStorage['wpm-rush-log']` is `'1'`. The player never sees a number that says they were helped. The boost word is the one visible sign and reads "Art sent you a boost".

1. The curve: `demand(n) = 18 * 1.085^(n - 1)` wpm, times `lift`.
2. The cap: the player's own measured wpm times `pressure(n)`, which is 55% to 65% for bosses 1 to 3 so the run opens with easy wins, rises 4% a boss to 110% at boss 13, then 1% a boss to 130%. S is the lower of the two.
3. Lift: an easy win (80% integrity left, under 75% of the sized time) raises it 12%, a win with 55% left raises it 5%, four easy wins in a row add 4% more, a loss drops it 8%. It stays between 0.75 and 2.2 and half of it carries into the next run.
4. Loss streak help: losses in a row on the same boss number, kept across runs, roll for help. The odds are 15% after one loss, 40% after two, then 20% more a loss up to 95%. Help eases S by 8% a loss up to 30%, drops word difficulty one band, shortens the longest word by one, lengthens the wind-up and trims HP by up to 12%.
5. Near-miss boost: once the closest loss on a boss left it under 15% of its HP, each attempt rolls for a boost word at 45%, rising 25% with each loss after the near miss. The word shows 5 to 11 s into the fight, lasts 15 s and deals the margin of that closest loss times 0.9, kept between 6% and 15% of max HP. In 200 simulated seeds the boost came by the second try 45% of the time, by the third 84% and by the fourth 99%.
6. Accuracy under 92% means easier words and a typo penalty one lower. 97% or more with a combo of 30 or more means harder words.
7. Reaction time: if the player's average reaction to wind-ups is slower than the fight allows, the wind-up allows up to 1.1 times it, at most 500 ms more.
8. The floor: S never goes under the boss's floor wpm. Every number is pulled back inside the floor row after the help and the adjustments.

The model the director keeps: rolling wpm, accuracy, reaction ms and combo (weighted 60% for the first two fights, then 35%), the lift, the win and loss streaks and for each boss number the losses since the last win there, the near misses and the closest margin.

### From S to the fight

| Number | Formula |
|---|---|
| Sized length T | 34 s, plus 4 s a mark, up to 56 s |
| Boss HP | `S * 5 * T / 60 * 0.8 * hpK * 10`, rounded to 10 |
| Word difficulty | centre `1.2 + S / 28` (1.5 to 8.5), band of plus and minus 1 |
| Word length | from `2 + S / 50` to `5 + S / 22` letters |
| Time between attacks | `10500 - 40 * S` ms, 4200 to 10000, times the boss's intervalK |
| Wind-up | reaction allowance `1500 - 5 * S` ms (600 to 1400) plus per letter `12000 / S * slack * windK`, slack `2.2 - S / 100` (1.25 to 2) |
| Counter words | 1 under 40 wpm, 2 under 80, 3 above, one more from mark VI |
| Typo penalty | `S / 20` integrity, 0 to 8 |

Boss shapes: hpK 1, 1.08, 1.14, 1.2, 1.28, 1.36 in roster order; The Press winds up at 0.82 and Syntax Error at 0.95 of the normal time.

### Floors

The least each boss asks for. These are the `FLOORS` rows in `js/app/rush/data.js`, generated from the formulas above at each floor wpm. Past mark V the mark V row climbs 16 wpm a mark.

| Boss | Mark | wpm | HP | diff from | min length | attack every (ms, at most) | reaction (ms, at most) | per letter (ms, at most) | counters | typo |
|---|---|---|---|---|---|---|---|---|---|---|
| The Spam | I | 10 | 230 | 1 | 2 | 10000 | 1400 | 2400 | 1 | 1 |
| The Spam | II | 26 | 660 | 1 | 2 | 9460 | 1370 | 895 | 1 | 1 |
| The Spam | III | 42 | 1180 | 1.5 | 2 | 8820 | 1290 | 509 | 2 | 2 |
| The Spam | IV | 58 | 1780 | 2.5 | 3 | 8180 | 1210 | 335 | 2 | 3 |
| The Spam | V | 74 | 2470 | 3 | 3 | 7540 | 1130 | 237 | 2 | 4 |
| The Signboard | I | 12 | 290 | 1 | 2 | 10000 | 1400 | 2000 | 1 | 1 |
| The Signboard | II | 28 | 770 | 1 | 2 | 9380 | 1360 | 823 | 1 | 1 |
| The Signboard | III | 44 | 1330 | 2 | 2 | 8740 | 1280 | 480 | 2 | 2 |
| The Signboard | IV | 60 | 1990 | 2.5 | 3 | 8100 | 1200 | 320 | 2 | 3 |
| The Signboard | V | 76 | 2740 | 3 | 3 | 7460 | 1120 | 227 | 2 | 4 |
| The Announcer | I | 14 | 360 | 1 | 2 | 9542 | 1400 | 1714 | 1 | 1 |
| The Announcer | II | 30 | 870 | 1.5 | 2 | 8928 | 1350 | 760 | 1 | 2 |
| The Announcer | III | 46 | 1470 | 2 | 2 | 8314 | 1270 | 454 | 2 | 2 |
| The Announcer | IV | 62 | 2170 | 2.5 | 3 | 7699 | 1190 | 306 | 2 | 3 |
| The Announcer | V | 78 | 2960 | 3 | 3 | 7085 | 1110 | 218 | 2 | 4 |
| The Press | I | 16 | 440 | 1 | 2 | 9860 | 1400 | 1230 | 1 | 1 |
| The Press | II | 32 | 970 | 1.5 | 2 | 9220 | 1340 | 578 | 1 | 2 |
| The Press | III | 48 | 1610 | 2 | 2 | 8580 | 1260 | 353 | 2 | 2 |
| The Press | IV | 64 | 2360 | 2.5 | 3 | 7940 | 1180 | 240 | 2 | 3 |
| The Press | V | 80 | 3200 | 3 | 3 | 7300 | 1100 | 172 | 3 | 4 |
| The Correction | I | 18 | 520 | 1 | 2 | 9291 | 1400 | 1333 | 1 | 1 |
| The Correction | II | 34 | 1100 | 1.5 | 2 | 8683 | 1330 | 656 | 1 | 2 |
| The Correction | III | 50 | 1790 | 2 | 3 | 8075 | 1250 | 408 | 2 | 3 |
| The Correction | IV | 66 | 2590 | 2.5 | 3 | 7467 | 1170 | 280 | 2 | 3 |
| The Correction | V | 82 | 3500 | 3 | 3 | 6859 | 1090 | 202 | 3 | 4 |
| Syntax Error | I | 20 | 620 | 1 | 2 | 8924 | 1400 | 1140 | 1 | 1 |
| Syntax Error | II | 36 | 1240 | 1.5 | 2 | 8335 | 1320 | 583 | 1 | 2 |
| Syntax Error | III | 52 | 1980 | 2 | 3 | 7746 | 1240 | 368 | 2 | 3 |
| Syntax Error | IV | 68 | 2840 | 2.5 | 3 | 7158 | 1160 | 255 | 2 | 3 |
| Syntax Error | V | 84 | 3810 | 3 | 3 | 6569 | 1080 | 185 | 3 | 4 |

## Scoring

A win scores `round((100 + 25n) * speed * accuracy * health) + 4 * best combo + 30 * spells cast`, where:

- `speed` = sized length T / kill time, from 0.5 to 2;
- `accuracy` = (fight accuracy / 100) squared;
- `health` = 0.75 + 0.5 * integrity left (0 to 1).

A win on the retry scores half. A loss scores nothing. The run's score is the sum.

Example: boss 7, killed in 30 s against a sized 38 s, 96% accuracy, 80% integrity left, best combo 30 and one spell: `275 * 1.267 * 0.9216 * 1.15 = 369`, plus 120 and 30, makes 519.

## Rewards and events

- `WPM.record({ mode: 'rush', wpm, acc, correct, keys, ms, score })` once a run ends. The run shows in the profile and pays the usual typing coins. The run's wpm is its average.
- `REWARDS.rush` in `js/app/rewards-config.js`: 5 coins and 8 XP a boss, plus 2 coins for each mark past I; 10 coins and 20 XP for a run of 3 bosses or more; 25 coins for a new best run; at most 250 rush coins a run. Paid when the run ends.
- Events: `rush_boss` after each boss beaten (`n, boss, mark, secs, wpm, acc, combo, retry`) and `rush_run` when a run ends (`bosses, score, wpm, acc, combo, spells`). Spells send `spell_cast` with `mode: 'rush'` and combos send `combo` every 5. `js/app/progress-data.js` has two daily tasks and one weekly task for them.

## Scoreboard and the server

The scoreboard keeps the 25 best runs by score on this device, plus the records: best run (bosses beaten), score, peak wpm (the fastest fight of 5 s or more), average accuracy, best combo, spells cast and the fastest boss kill. It is saved with `WPM.setModeData('rush', ...)` in the player's save, next to the director's model. The entry screen shows the top five and `#/leaderboard` has a Boss rush tab.

When the server exists the page sends each finished run as:

```
POST /api/rush/run
{
  "v": 1,
  "id": "r1abc23de4f",          // made on the device
  "at": "2026-11-21T19:53:00Z",
  "name": "Guest",
  "bosses": 9,                   // bosses beaten
  "reached": 10,                 // the boss number the run ended on
  "score": 6120,
  "ms": 412000,                  // fight time, breathers left out
  "wpm": 88,                     // peak, the fastest fight of 5 s or more
  "avgWpm": 71,
  "acc": 96.4,
  "bestCombo": 64,
  "spells": 7,
  "dmg": 18450,
  "fastest": { "ms": 9100, "n": 2, "boss": "sign", "title": "The Signboard" },
  "retry": true,                 // the run's retry was used
  "fights": [
    { "n": 1, "boss": "spam", "mark": 1, "won": true, "retry": false, "secs": 11.2, "wpm": 74, "acc": 98.1,
      "combo": 22, "casts": 1, "dmg": 412, "score": 402, "left": 0 }
  ]
}
-> 200 { "rank": 12, "best": { "bosses": true } }
```

`RushBoard.payload(run)` builds this body. The server must not trust the numbers as sent. It should replay the key stream and the director's plan against `fight.js`, which runs in node, before it ranks a run.

## Testing

- `node tools/rush/sim.js` runs a strong, a weak and a near-miss player through whole rushes with the real fight rules and prints the director's decisions. `node tools/rush/sim.js strong` (or `weak`, `near`) runs one.
- In the page, `window._rush` has `start()`, `jump(n)`, `win()`, `lose(left)`, `attack()`, `move()`, `sig()` (the next signature attack now), `cast(id)`, `setCombo(n)`, `setHp(f)` (also moves the phase), `boost()`, `act('next' | 'retry' | 'end')`, `end()`, `state()`, `plan()`, `chips()`, `tags()`, `marks()`, `log()` and `board()`.

## The titans (25 Nov 2026)

One lap is now 12 bosses: the five Breach bosses with a BossKit titan after each, and Syntax Error last. Mark II starts at boss 13.

| # | Boss | Its move | Its signature | Music |
|---|---|---|---|---|
| 2 | Siege Titan | Double slam (the Press's double wind-up) | Falling rubble (falling signs) | The Press |
| 4 | Firewall Warden | Access check (spell it right) | Firewall rules (red pen) | The Correction |
| 6 | Data Colossus | Data burst (packets) | Data blocks (packets with fakes) | Syntax Error |
| 8 | Kernel King | Royal decrees (gifts) | Decrees (pop-ups) | The Announcer |
| 10 | Half-Compiled | Compile check (spell it right) | Bad compile (red pen) | The Correction |
| 11 | Overclocked Brute | Steam vents (gifts) | Pistons (pages) | The Press |
| 12 | Syntax Error | Packets | Packets with fakes | Syntax Error |

A titan's floors sit halfway between the Breach bosses on either side of it. The titans borrow the Breach music until they get their own tracks, and the gifts, signs and pages still look like the Breach ones.

## The titans, rebuilt (28 Nov 2026)

### Their look

In the rush the titans use BossKit's rich build (`BossKit.create(..., { detail: true, env })`; the World Boss's Syntax Error keeps the plain one):

- Layered armour: a second plate over each pauldron with a polished trim rim and bolts, a back plate and a spine of fins, trim on the pectorals, side vents with slats and a lit strip, a belt with a lit buckle, ribbed hoses on the gut, pistons on the upper arms and thighs, ram plates and lit strips on the gauntlets, trim knuckles, layered knee cops, toe plates, a frame round the visor, cheek vents and fins on the helmet, cables from the back to the shoulders, and a core in a trim ring with six clamps and two thin rings that turn.
- The plate shader draws dark panel grooves round every plate, varies each panel's colour and roughness so the light breaks up, and keeps the glowing circuit seams. The Brute's armour is cracked and the cracks glow hotter as it overheats.
- Real materials: plates at metalness 0.45 and roughness 0.5, darker parts at 0.6 and 0.45, polished trim in each titan's own metal at 0.95 and 0.26, rubber cables, all lit by a small environment map built for each titan (a white key above, its colour behind and at the sides).
- Each titan's own parts: the Siege Titan's battering-ram forearms, spiked knuckles, heavy brow and lamp pylons; the Warden's tassets, gorget, pauldron fins, framed shield with a lit emblem, and a blade with a lit fuller, grip and pommel; the Colossus's data pylons, three eyes, cable bundles into its tail and a ring of blocks circling its chest; the King's gold-trimmed throne with lit runes and pillars, a crown band with red jewels, gold bands on his gauntlets and lit tips on the cable cape; Half-Compiled's jagged lit seam, wire half-skull and wire ribs; the Brute's glowing coil, back pistons and knuckle dusters.
- Colours per titan (metal, dark, trim, glow): Siege warm grey and brass with amber, Warden steel and silver with cyan, Colossus violet-grey with purple, King gunmetal and gold with gold, Half-Compiled gunmetal with green and pink, Brute scorched iron and copper with orange.
- Every part sits on the bone it moves with and the parts are merged per bone and material, so a titan draws in about as many calls as the old plain build while carrying about twice the triangles.

### Their attacks

A wind-up picks one of three attacks (`RushData.ATTACKS`), never the same one twice in a row. The lit counter words are labelled with it (BLOCK SLAM) and the flags show its name and timer.

| Titan | Attack | Wind-up and telegraph | Strike |
|---|---|---|---|
| Siege Titan | Double-fist slam | both fists overhead, a red disc filling out to you | slams the floor: shockwave, debris, dust |
| | Siege hook | right arm cocked out to the side, a fan | a level hook across the front, trail and sparks |
| | Quake stomp | right leg raised, a lane to you | the stomp, a crack of debris racing along the lane |
| Firewall Warden | Shield bash | shield drawn back, a lane | lunges in shield first, a ring off the shield |
| | Blade sweep | blade out to the side and back, a fan | a level sweep with a blade trail |
| | Firewall cleave | blade overhead, a narrow lane | cleaves the floor; a line of fire runs along the lane to you |
| Data Colossus | Block storm | arms up, the orbiting blocks speed up, a target closing on you | blocks rain on you |
| | Tail lash | torso wound up, a wide fan | the tail whips round with a trail |
| | Core beam | chest arched, the core charging, a lane | a beam from the core to you |
| Kernel King | Throne shockwave | fists raised, a red disc | fists on the armrests: two gold rings across the hall |
| | Royal decree | hand drawn back, a target on you | points and throws a gold bolt at you |
| | Gauntlet crush | the giant right fist raised, a lane | slams it down in front |
| Half-Compiled | Glitch split | crouched, glitching side to side, the armour dropping out to the wire body | flings its arms out in a burst of green and pink |
| | Wire lash | wire arm drawn back, a lane | the wire arm stretches and lashes |
| | Stack crash | both fists overhead, a disc | slams the floor |
| Overclocked Brute | Piston punch | arm chambered, steam from the elbow, a lane | lunging punch, a ring and a cone of sparks and steam |
| | Steam blast | hunched in, the vents building, the cracks heating, a fan | rears up, the vents blast steam at you |
| | Hammer pound | both fists overhead, the armour white-hot, a disc | pounds the floor |

`wind` scales the wind-up's length and `hit` the integrity it costs when it lands: the quick attacks wind up 5% faster and hit 20% lighter, the big ones wind up 12% longer and hit 10% harder, so the three average out. The Siege Titan's double slam (its own move) uses the plain slam at 1 and 1. The attack is picked from its own random stream, so the fight's other dice are unchanged. In 320 simulated titan fights per player (a 40 wpm and a 24 wpm bot, bosses 2 to 16, attacks on against attacks off) the win rate moved by under 2 points and the integrity left by under 1; `node tools/rush/sim.js` passes.

Every pose comes from joint-check's `bend()` in body terms and passes its range, buried-limb and floor checks, at the wind-up, the strike and at a quarter, half and three quarters of the way between (`TITAN_POSES` in `js/app/bosskit.js`). The wind-up eases in and trembles in its last fifth; the strike blends in over 0.13 s, holds, and recovers over 0.7 s; a blocked strike stops halfway and the titan reels.

A blocked strike throws sparks off a cyan barrier ring in front of you; a landed one hits your marker with red sparks and a ring.

### Entrances and deaths

Each titan enters during the 3-2-1 count (real time, so it ends inside the count however slow the frames): the Siege Titan drops out of the sky and lands in a crouch; a firewall sweeps down and leaves the Warden standing behind it; the Colossus assembles from blocks pulled in from the arena; the King rises out of the floor on his throne and strikes the armrests; Half-Compiled compiles from the feet up; the Brute charges in from the back and skids to a stop roaring. A fight event (a wind-up) ends an entrance still running.

A titan's death runs about 3 s: the last hit throws it back with sparks from the core, it falls to its knees (or slumps on the throne) and its pauldrons and helmet plates fly loose, the core overloads, it blows apart in a flash, a ring and debris, and the rest dissolves into the floor. The Colossus sheds blocks as it falls, the King's crown bursts, Half-Compiled glitches between its halves, and the Brute's cracks go white with steam. The breather waits 3 s after a titan dies (1.5 s after the others).

### Their arenas

Each titan stands on a dark polished floor that picks up its colour, with a soft shadow under it, dust in the light and its own props kept to the sides and the back: rubble and broken walls with hazard lamps (Siege), firewall gates of moving light (Warden), drifting data blocks (Colossus), a hall of gold-capped columns and a carpet (King), half-built wire scaffolds (Half-Compiled), pipes, two steam stacks and furnace grates (Brute). The Siege Titan's falling rubble and the Brute's pistons replace the Signboard's signs and the Press's pages on their paths.

### The camera director

The rush camera runs on `CamDirector` (`js/app/camdir.js`). The game shot is the view it always had. The page tells the scene how long until the next thing comes at you (`scene.threat(ms)`: 0 while a wind-up is up or a thrown word is in the air, else the time to the next attack or throw), and no cutaway plays within 1.2 s of one. The shots: `enter` (the entrance, a low wide that pushes in, then up at its face), `block` (low behind your barrier in slow motion, then side on as it reels), `hit` (side on as its blow lands), `phase` (a crane round it as it roars), `stunned` (close on it after its own move is beaten) and `kill` (a slow orbit as it comes apart, slowed for its first beat). The springs step at 60 Hz however slow the frames.

### Sound

`RushAudio.titan(name, arg)` (in `js/app/rush/audio.js`) makes every titan sound in code on the World Boss's effects bus: a charge per attack that builds over the wind-up and is cut off when the blow lands or is blocked (or the game pauses), a strike sound per attack, the clang of a block, and the roars, entrances and death (armour coming off, the core overloading, the blast). Levels come from offline renders (`RushAudio.renderTitan(name)`): the loudest peak is about -3 dBFS after the effects bus's compressor, the charges sit about 3 dB under the strikes.

### Testing

- `window._rush.attack(id)` starts that titan attack now. `_rush.freeze(true)` holds the fight still; `_rush.sceneCtl().preview([[pose, weight], ...])` holds a pose and `review({ pos, look, fov })` a fixed camera; `window.__rushStep = 1 / 30` steps the scene a fixed 1/30 s a frame, for matched review shots. `_rush.sceneCtl().titan()` reports the titan's state and the camera director's log.
- `window.__camProbe = true` before the page loads logs the camera and the fighters every frame in `window.__camLog`, for the camera metrics.

### Frame cost

Measured headless (SwiftShader) with `_rush.sceneCtl().bench()`, which times whole frames with the GPU finished, plain titans (`window.__rushPlain = true`) against the rich ones on the same page at 1366x660: about 45 ms against about 55 to 65 ms. The machine was shared and the numbers moved by a quarter between runs. Draw calls went from 106-236 to 121-158 (the King from 236 to 144), since the parts are merged per bone. Most of the added cost is the armour's panel shader on a software renderer; on a real GPU it is small. What was cut to get here: a lit floor (now a painted texture), the flash's point light (now a glow and a lift of the fill light), the environment map on the broad plates (trim only), and the Brute's crack pattern on the others (compiled only for the Brute).
