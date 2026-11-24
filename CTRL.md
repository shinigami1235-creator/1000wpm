# CTRL: the organisation, its operators and their ranks

The game is **10000wpm: Stormtyper**. The organisation every player joins is **CTRL**, and players are **operators**. This file is the canon for both, written from Art's direction on 24 Nov 2026 (his ChatGPT chat "CTRL Operator Story") and Gid's calls the same day. The site's text follows it.

Gid's rule for all of it: easy to get into. A new player should understand their division and rank in one line each, so the site keeps plain names for menus and pages and uses CTRL words only where they mean something.

## Names

| Thing | Name | Notes |
|---|---|---|
| The game and site | 10000wpm: Stormtyper | Tab titles read "Stormtyper by 10000wpm" |
| The organisation | CTRL | Said "control". Slogan: Control the chaos. |
| A player | Operator | Every player gets an operator number |
| The world | Keyspace | Unchanged from STORY/WORLD.md |
| Bosses | Targets | Used for the World Boss line (Operation 100) and in boss intros |
| A player's class | Division | Six, below |
| A player's rank | Clearance level, CL-01 to CL-08 | Eight, below |
| The founder | Art, 10000wpm | Operator #000001 |

**Left out on purpose:** Art's chat also renamed the community (the Network), the battlefield (the Grid), daily tasks (Directives), rewards (Requisitions), the home page (Command Center), achievements (Service Records) and the shop (Supply Depot). Twelve new words is a lot to learn before typing a single letter, so menus stay Home, Type, Play, Shop, Profile and so on. Any of these can come back later as flavour text.

## The story

Art fell into Keyspace on his stream, followed the Fixword update back to its core and rolled it back. That's Breach, his own story. The rollback ended the update but not what it left behind: every typo it gave a body to and nobody corrected is still loose in Keyspace, and the worst of them have grown into Targets.

Art stayed in Keyspace and started CTRL to clear them. He doesn't recruit the fastest typists. He recruits anyone who keeps typing, since a Target goes down from a thousand small hits as well as from one big one. Operators don't need to know each other's names or speak the same language. They share one network and one job: clear the Targets and keep Keyspace under control.

**Operation 100** **[PROPOSED, 24 Nov 2026]**: the World Boss becomes a numbered line of 100 Targets. Syntax Error is Target 001. When the whole network brings one down, the next one comes online. Target 100 is The System, the thing the leftovers have been building toward. Everyone who hit a Target gets it on their record.

## Divisions

Every operator picks one of six divisions on their profile. The site suggests one from how they type, and they can switch for free once a day (any time from CL-06).

**Perks only work in boss fights:** the World Boss, Boss Rush and Party. Duels stay even, so MMR measures typing and nothing else. Breach is Art's own story and the Superboss is Art's stream, so neither uses the player's perks.

Each division's perk gets stronger at CL-04 and again at CL-07 (ranks I, II and III).

| Division | Good at | Perk | Rank I / II / III |
|---|---|---|---|
| **Striker** | Speed | **Overdrive.** Fast words hit harder, on top of the usual speed bonus. Full bonus at 180 wpm. | +15% / +20% / +25% |
| **Precision** | Accuracy | **Zero error.** Clean words hit harder while your accuracy is 95% or more. | +10% / +13% / +16% |
| **Hunter** | Boss damage | **Execution.** You hit harder once the Target is below 30% health. | +20% / +26% / +32% |
| **Sentinel** | Endurance | **Unbreakable.** One typo doesn't cost you a combo tier, once every so often. | every 20 s / 16 s / 12 s |
| **Ghost** | Combos | **Ghost protocol.** Your combo tiers come sooner. At rank I: Charged bolt at 9 instead of 10, Twin beam at 21, Rail shot at 43, Overload at 85. | 15% / 20% / 25% sooner |
| **Architect** | Support | **System override.** Your spells hit harder, and in a Party the whole team deals more. | spells +15% / +20% / +25%, team +4% / +5% / +6% |

Someone at 50 wpm with 99% accuracy is as useful to CTRL as someone at 150 wpm. Precision, Sentinel and Ghost are there so they are.

The numbers are a first pass and get tuned in playtesting.

### How the site suggests a division

From the player's own records: top speed, accuracy over recent runs, World Boss and Boss Rush damage, best combo, longest runs and Party heals. Whichever one stands out most against the site's averages is the suggestion. A new player with no records gets Precision, the easiest one to make work.

## World Boss squads

From Art's idea on 24 Nov 2026: in the World Boss an operator can go down if they fall behind, unless the operators around them guard and heal. Gid's rule on top: a brand-new typist has to enjoy it too. Built the same day in `js/app/boss-squad.js`.

- **Squads.** Every operator fights in a squad of four. If you're not a Sentinel or an Architect, one of your three squadmates is.
- **Integrity.** Everyone has 100. An unblocked raid attack takes 22 (34 by phase 5), a packet takes 8.
- **Lock-ons.** Every 9 to 14 seconds (sooner in later phases) the boss locks on to one squad member for 4.5 seconds and hits for 30 to 50. The target types a dodge word. A Sentinel can cover them by typing their handle.
- **Words sized to the typist.** Block and dodge words follow the operator's average speed: 2 to 4 letters under 30 wpm, 3 to 5 under 60, 4 to 6 under 100, the full attack word from 100. The word stack is capped at 5, 6 or 7 letters for the same tiers. Every raider gets the same window, so a slower typist gets a shorter word rather than more time.
- **Healing.** An Architect heals a squadmate 25 by typing their handle, every 4 seconds. With no Architect up, anyone heals 12 every 6 seconds.
- **Going down.** At 0 an operator is down for 10 seconds. Every clean word they type takes a second off, and anyone can revive them by typing their handle (back at 40). They keep their coins and damage.
- **Recruit shield.** CL-01 operators can't go down: their integrity stops at 1 and a hit only costs their combo, the same as before squads.
- **Credit.** The result shows the squad's damage, saves (covers and revives) and heals, with Top damage, Top guard and Top medic. Saves pay 3 coins each and heals 1 per 10 healed, up to 60, on top of the block coins.

These perks of Sentinel and Architect come on top of their division perks, which still apply in Boss Rush where there's no squad.

## Clearance levels

Clearance comes from the player's level (XP from every run, task and achievement, so it rewards playing and accuracy as much as raw speed). Each clearance level gives one perk.

| Clearance | Name | From level | Perk |
|---|---|---|---|
| CL-01 | Recruit | 1 | Your division perk (rank I) and your Operator ID |
| CL-02 | Operative | 3 | +5% coins from runs |
| CL-03 | Specialist | 6 | Your division's patch on your Operator ID and profile |
| CL-04 | Agent | 10 | Division perk rank II |
| CL-05 | Elite | 15 | +10% coins from runs (replaces the +5%) |
| CL-06 | Vanguard | 21 | Switch division any time |
| CL-07 | Commander | 28 | Division perk rank III |
| CL-08 | Director | 36 | Gold Operator ID and insignia |

## Operator ID

Every operator gets an ID card on their profile: operator number, name, division, clearance, country, top speed, accuracy and Targets hit. It changes as they rank up and is the card players share on Instagram or Discord. Art's card is #000001.

Operator numbers are made on the player's device for now. The server hands out real ones in join order once it exists.

## The insignia

A hexagon with a C inside it and the Control key's caret (^) inside the C, with four green marks at the hexagon's points like a sight. It sits in `index.html` as `#i-ctrl` and is the favicon. Art's laurel stays his own mark wherever Art appears.

## Lines the site uses

Slogans, from Art's chat:

- Control the chaos. (the organisation)
- We are the input. (the community)
- Every keystroke counts. (recruiting)
- No operator left behind. (Party)
- Type. Fight. Repeat. (merch)

Recruitment, for the home page and Art's posts:

> Incoming transmission
>
> **CTRL needs operators.**
> You don't need to be the fastest. You need to keep typing.
> 100 Targets. One network. Founded by 10000wpm.

## Merch ideas from Art's chat

Kept here for when merch happens: an operator T-shirt (small insignia on the chest, big one on the back, division on the sleeve), a black hoodie with the operator number, six division patches, a printed Operator ID card, a deskmat with the insignia, and an Operation 100 drop when Target 100 falls.
