# Combat layer

The shared combat code for every typing fight: the combo, spells, damage and the effects and sounds that go with them. The World Boss (Syntax Error) uses it now. Boss Rush, the streamer Superboss, PvP duels and party raids are meant to use the same pieces.

## Files

| File | What it holds |
|---|---|
| `js/app/combat/bus.js` | `Combat.Bus()`, the event bus |
| `js/app/combat/spells.js` | The spell registry: data only, no three.js or sound, so a server can load it |
| `js/app/combat/combo.js` | `Combat.TIERS` and `Combat.Combo()`, the combo tracker |
| `js/app/combat/damage.js` | `Combat.Damage`, the damage model |
| `js/app/combat/engine.js` | `Combat.create()`: one fighter's combo, accuracy, offers, statuses and casts |
| `js/app/combat/sfx.js` | `Combat.Audio`: every tier and spell sound, made in code with Web Audio |
| `js/app/combat/fx3d.js` | `Combat.FX`: tier shots and spell effects in three.js |
| `js/wordbank.js`, `js/wordbank-common.js` | `WordBank`: the words every mode types |
| `css/combat.css` | The combo readout, spell chips and buff flags on the boss page |

Load order: `bus`, `spells`, `combo`, `damage`, `engine`, `sfx`, `fx3d`, then the mode. `wordbank-common.js` goes before `wordbank.js`.

## Rules

- Every correctly typed word is a basic attack: its letters times the multiplier below.
- A clean word (no wrong key pressed while typing it) adds 1 to the combo.
- A typo drops the combo to the start of the tier below: 63 goes to 25, 30 to 10, 12 to 0. One slip at combo 90 costs a tier and keeps the run alive, which played better than a full reset over a long boss fight.
- An attack that hits you and isn't blocked breaks the combo to 0.

| Tier | From combo | Shot | Damage |
|---|---|---|---|
| 0 | 0 | Bolt | x1 |
| 1 | 10 | Charged bolt | x1.25 |
| 2 | 25 | Twin beam | x1.5 |
| 3 | 50 | Rail shot, with screen shake | x2 |
| 4 | 100 | Overload: a rail shot wrapped in a spiral, with a shock ring | x2.5 |

Damage multiplier for a word = tier x accuracy x speed x buffs, capped at 6.

- Accuracy: `0.6 + 0.4 * acc^4` over the last 60 keys. 100% gives x1, 95% x0.93, 90% x0.86, 80% x0.76.
- Speed: from x1 at 40 wpm to x1.3 at 180 wpm or faster, measured on the word itself.
- Buffs: hyper thread x2, root access x2.

The mode applies its own multipliers after these. The world boss adds the weak point, crits and the damage-halved debuff.

## Spells

At combo 10, 25, 50 and then every 25, two or three spell words are offered (two at combo 10). The offer lasts 15 seconds. Typing one in full with no typo casts it, and the rest of the offer goes. A typo while typing it makes it fizzle: the offer stays and the combo drops a tier like any typo. A new combo point replaces an open offer. One spell in each offer is from the highest rarity unlocked, and the words in one offer start with different letters.

| Spell | Rarity | What it does |
|---|---|---|
| data spike | Common (10) | Three crystal spikes burst up under the target. 3 x 22 |
| safe mode | Common | A hex shield around you stops the next attack that would hit you |
| binary rain | Common | Zeros and ones pour onto the target for 3 seconds. 12 x 8 |
| echo pulse | Common | Rings carry the damage of your last 8 words to the target again |
| glitch blade | Common | One huge glitching slash, 70, triple against a firewall |
| cryo lock | Common | An ice cage holds the target. The attack winding up gets 5 more seconds for you to block it. 30 |
| electro storm | Rare (25) | A storm cloud forms over the target and lightning strikes it 7 times. 7 x 22 |
| hyper thread | Rare | Your attacks deal double damage for 8 seconds |
| packet storm | Rare | 16 packets circle the target and dive in, 16 x 9, and every packet thrown at you goes back |
| neon nova | Rare | A neon blast bursts out of the target, 180, and destroys every bug |
| system purge | Rare | A scan sweeps the field, 90, clears your damage-halved debuff and keeps it off for 6 seconds |
| void sphere | Epic (50) | A black orb grows into a black hole that pulls matter and blocks in, then collapses. 6 x 12, then 340 |
| kernel panic | Epic | The target freezes for 4 seconds, its attacks miss you and your next 6 hits crit. 80 |
| root access | Epic | Opens a weak point for 6 seconds: x2 damage that goes through shields. 40 |
| quantum split | Epic | Two copies of you take your next 2 typos, so the combo stays |
| zero day | Ultimate (100) | The screen goes dark and a lance of code splits the target. 1500, through shields |

Spell damage is the power in the table times the caster's accuracy multiplier and buffs. It doesn't use the combo tier, since the combo already paid for the offer.

## Engine API

```js
const me = Combat.create({
  rng,          // optional, () => 0..1, for repeatable offers
  offerMs,      // how long an offer stays, default 15000
  offerAt,      // n => bool, which combo points open an offer
  offerSize,    // n => 2 | 3
  spells,       // optional list of spell ids this mode allows
  now,          // optional clock, default performance.now
});

me.key(ok)                                   // every key press, for accuracy
me.word({ letters, clean, ms, useCrit })      // a word that hit -> { amount, mult, parts, tier, combo, pierce, crit }
                                              // letters 0 counts it toward the combo with no damage (a block word)
me.miss(reason)                               // a wrong word -> drops a tier unless quantum split saves it
me.hurt(kind)                                 // an attack reached the player -> { blocked } (safe mode, kernel panic) or the combo breaks
me.cast(text, { clean, shield })              // null if text isn't an offered spell, { fizzled, spell } on a typo,
                                              // or { spell, hits: [{ at, power, amount, mult }], total, effect, pierce, combo }
me.matchOffer(prefix)                         // the offered spell whose word starts with prefix
me.tick()                                     // ends statuses and offers on time; call it a few times a second
me.state()                                    // { combo, best, tier, name, mult, next, progress, acc, offer, statuses }
me.status(name), me.consume(name), me.statuses(), me.offer(), me.closeOffer(reason), me.reset()
me.debug.setCombo(n), me.debug.offer(ids)
```

The engine never sends damage. It returns numbers and the mode decides where they go. For a spell, the mode runs `hits[i].amount` at `hits[i].at` ms after the cast, so the damage lands when the effect strikes.

### Events

`me.on(name, fn)` returns an unsubscribe function. `me.on('*', (name, payload) => ...)` hears everything.

| Event | Payload |
|---|---|
| `hit` | `{ kind: 'word', letters, amount, mult, tier, combo }` |
| `combo` | `combo, best, tier, name, mult, next, progress, from, reason` (`word`, `typo`, `wrong`, `fizzle`, `hurt`, `cast`) |
| `tierUp` / `tierDown` | `{ tier, name, combo }` |
| `spellOffer` | `{ combo, at, until, spells: [spell objects] }` |
| `offerEnd` | `{ reason: 'cast' \| 'time' \| ... }` |
| `spellCast` | the cast result above |
| `fizzle` | `{ spell }` |
| `miss` | `{ reason, combo, from, tier }` after a typo, a wrong word or an unblocked hit |
| `ward` | safe mode stopped an attack |
| `guard` | quantum split kept the combo |
| `status` | `{ name, on, until, charges, mult, pierce }` |

### Statuses

Spells start these on the caster. A mode reads them with `me.status(name)`.

| Status | From | Meaning for the mode |
|---|---|---|
| `ward` | safe mode | `hurt()` uses it up and returns blocked |
| `hyper` | hyper thread | already in the word multiplier |
| `root` | root access | already in the multiplier, and `pierce` is true: skip the shield |
| `split` | quantum split | `miss()` uses a charge instead of dropping a tier |
| `purge` | system purge | the mode keeps its debuffs off |
| `crits` | kernel panic | the next 6 words return `crit: true` |
| `stunned-target` | kernel panic | `hurt()` returns blocked |
| `frozen-target` | cryo lock | the mode gives the player extra time on the target's next attack |

### Spell data

```js
Combat.SPELLS()          // every spell
Combat.spell(id)         // { id, word, rarity, label, text, color, hits, plan?, strike, effect }
Combat.spellByWord(word)
Combat.hitsFor(spell, { recent })
Combat.registerSpell({ id, word, rarity, label, text, color, hits, strike, effect })
```

`effect` keys a mode may act on: `status`, `ms`, `charges`, `mult`, `pierce`, `debuff` (`freeze`, `stun`), `crits`, `vsShield`, `clearAdds`, `returnShots`, `cleanse`, `echo`, `break`. A new spell with no effect in `fx3d.js` still casts and deals damage; it just has no visual until one is added under its id.

## Effects

```js
const fx = Combat.FX.create(THREE, scene, camera, {
  glowTex, calm, reduce,
  pixelHeight: () => renderer.domElement.height,
  juice: { shake(k), stop(ms), glitch(k, secs), dim(k, secs), tint(hex, k), canFlash() },
});
fx.shot(tier, from, to(out), onLand, { color })   // basic attack for tiers 1 to 4
fx.cast(spellId, { caster, target, hits, effect })
fx.aura(name, on, { caster, target })              // 'ward' | 'hyper' | 'split' | 'root'
fx.event('ward' | 'guard')
fx.update(dt)                                       // every frame, with the hitstop-slowed dt
fx.clear(), fx.dispose(), fx.info()
```

`caster` and `target` are adapters, so an effect can be aimed at a boss or at another player:

```js
caster = { pos(out) }                               // where the spell starts
target = {
  size,                                             // about 6 for the world boss, 1 for a player figure; effects scale with it
  pos(out), top(out), base(out),                    // centre, highest point, floor under it
  react(kind, power, extra),                        // flinch, stagger, flash, break, stun (ms), freeze (ms), pull (power, point)
}
```

Everything is pooled: one instanced mesh of up to 1600 glowing boxes rebuilt every frame (lines, prisms, panels, rings), one point cloud of 2600 particles with a glyph atlas (dot, 0, 1, packet box, #, {, star, hex), 24 flares, 3 fresnel shells and one black hole mesh. Nothing is created per cast except small vectors.

## Sounds

```js
const sfx = Combat.Audio.create({ ctx: () => audioContext, out: () => node, on: () => true });
sfx.play('shot1' ... 'shot4' | 'tierUp' (tier) | 'offer' | 'break' | 'fizzle' | 'ward' | 'guard' | spellId | strike name)
Combat.Audio.render(name, arg, secs)   // offline render, for loudness checks
```

Strike names (the sound each spell hit makes): crack, tick, pulse, slice, ice, zap, blip, boom, sweep, thrum, crash, lock, ultimate. The world boss passes `BossAudio.out()`, so these go through the boss's effects bus and compressor under the music, and epic and ultimate casts duck the music.

## Word bank

```js
WordBank.pick({ count, difficulty, theme, minLen, maxLen, avoidFirstLetters, distinctFirst, seed, rng, exclude, withMeta })
WordBank.stream(opts)  // { next(n), set(opts) }
WordBank.meta(text)    // { len, rare, reach, shift, score 1..10 }
WordBank.list(theme), WordBank.counts(), WordBank.THEMES
```

- `difficulty`: a number (entries within 1 of it) or `[lo, hi]`.
- `theme`: `band1` to `band5` (common English by frequency), `common`, `long`, `hard`, `cyber`, `keyboards`, `gaming`, `nature`, `food`, `space`, `city`, `music`, `science`, `mythic`, `verbs`, `phrases`, `punctuation`, `numbers`, `quotes`, or the groups `mix` (common plus every word pack), `any` (adds long and hard) and `drills` (punctuation and numbers). An array draws a theme first for each pick, so small packs show up as often as big ones.
- `seed` or `rng` makes the pick repeatable. The world boss seeds attack words from the fight so every raider sees the same ones. Unseeded picks avoid the last 400 entries handed out.
- The score weighs length, rare letters (q, z, x, j, k, v), same-finger and top-to-bottom row reaches on QWERTY, long one-hand runs, Shift, symbols and digits.

Counts: 8000 common words in five bands (1000, 1500, 2000, 2000, 1500), 900 more long words, 294 hard spelling words, 11 themed packs of 173 to 240 words, 201 phrases, 91 punctuation drills, 81 number drills and 95 sentences written for this site.

`tools/wordbank/build_common.py` regenerates the bands from wordfreq. It keeps lower-case dictionary words only and drops names, places, brands, slurs, swear words and sexual, violent and drug terms. `tools/wordbank/check_bank.py` counts every theme and fails if a blocked word appears anywhere in the bank.

## World boss wiring

- `boss.js` makes one engine for the player, feeds it every key and word, sends `mult`, `tier`, `pierce` and `color` with each word through `WorldBossNet.sendDamage`, and runs spell hits with `{ kind: 'spell', spell }`.
- `boss-net.js` multiplies word damage by `mult` (clamped to 0.5 to 8 in the demo), skips the shield on `pierce`, and accepts `grace` on `sendBlock` for cryo lock. A real server must not trust `mult`: it should rebuild it from the player's own key stream, combo and casts, using the same `Combat` files.
- `boss3d.js` creates `Combat.FX` inside the boss scene, routes tier shots and spells through it and handles the reactions: flinch, stagger, flash, the phase-break pose (thrown back, arms flung out, blocks flying), the kernel panic stun (frozen, blue, flickering eyes), the cryo freeze (icy and slowed) and the void pull (blocks torn toward the black hole, then back into place).
- `boss-rules.js` picks attack words from the word bank (common plus cyber, difficulty rising by phase) with the attack's seeded rng, so each attack's words still start with different letters and match on every client.

## Using it in a new mode

1. `const me = Combat.create({ spells: [...] })` for each fighter.
2. On each key, `me.key(ok)`. On each finished word, `me.word(...)` or `me.miss()`, and send `amount` (or letters with `mult`) to your target.
3. Show `me.offer()` as typing targets. When one is typed, `me.cast(word, { clean })`, run its `hits` on timers and pass them to `fx.cast`.
4. When the other side attacks, `me.hurt()` first.
5. For PvP, the target adapter is the opponent's figure and the hits go to their HP. Map `ward` to blocking their next spell, `stun` to locking their input for a moment, and `freeze` to adding time to your own next defence.
