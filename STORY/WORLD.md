# Breach: world

Breach was called Typo Horde until November 2026. The story stayed the same and moved into cyberspace.

Lines marked **[PROPOSED, Nov 2026]** are new or changed and wait for Gid's yes. Everything else was canon before that batch.

## Premise
Otto Brenn wrote Fixword, the autocorrect every phone and computer in the city runs. Last June Fixword changed his daughter Mina's flood text from Canal Road to Coral Road and the rescue boat went to the wrong side of the city. Otto rewrote Fixword so every wrong word gets a body and goes after whoever typed it. Art (@10000wpm) is mid-stream when the update goes out. The typos in his chat come alive and his screen pulls him into the chat after them. He follows the update back through every network it passed on its way to him.

## Tone
Arcade horror in the style of Typing of the Dead. Dark premise, no gore. The typos are glitch creatures made of code and fall apart into letters and voxels when shot.

## Site story: the player's journey (approved by Gid, 21 Nov 2026, option A)
Breach stays as Art's own story: the night the Fixword update pulled him into his stream chat, he followed it back to the core, rolled it back and became the Typemaster.

The player is an ordinary person who gets pulled in later. The rollback ended the update, but every typo it gave a body to and nobody corrected is still in the network, and those leftovers have grown into Syntax Error, the world boss everyone fights together. Art stayed in the network to guide the people who keep falling in.

What each part of the site is in the story:
| Part of the site | In the story |
|---|---|
| Academy | Art's training for new arrivals |
| Boss Rush | Art's gauntlet of copies of every boss he has beaten |
| World Boss | Syntax Error, the leftovers of the update, fought by everyone at once |
| Superboss | Art's live fights on his stream, which the player watches and supports |
| PvP | Sparring between typists, and challenging Art himself |
| Party | Runs with other people who fell in |
| Breach | Art's own story, told as the run that made him the Typemaster |

Art becomes an NPC guide on the site who can also talk with viewers. Tilde, the keycap buddy, stays as the player's companion.

### Holes in the site story
- The network has no name yet.
- How the player falls in (what they were typing) is not written.
- Whether the player can leave the network, and what being a Typemaster lets them do, is not written.
- How Art's NPC lines relate to Art's real streams (live messages later, simulated now) is not decided.

## Places
Each chapter is a network or system the update passed through, in reverse order from Art's stream back to its source. Each area has its own palette, floor grid, fog and music.

| Chapter | Place | Theme key | Look | Music |
|---|---|---|---|---|
| 1 Live | Art's stream chat, 9:00 pm | chat | green floor with violet lines, violet fog, chat bubbles, a LIVE sign | stage1 |
| 2 Night market | The market's shop network | market | amber floor with large tiles, pink accents, brown fog, misspelled neon shop signs | stage2 |
| 3 Last train | Line 2 control system | transit | pale blue floor with long tiles, navy fog, light trains below the platforms | stage3 |
| 4 The factory | Brenn Keyboards firmware line | factory | magenta floor with a dense grid, lime accents, plum fog, gears and keycap conveyors | stage4 |
| 5 Fixword core | Fixword core, under the factory | core | red floor with orange accents, near-black red fog, server racks, giant rings around a red core | stage5 |

**[PROPOSED, Nov 2026]** The area looks above replace the earlier green floor with one second colour per chapter.

## Set pieces **[PROPOSED, Nov 2026]**
| Chapter | Set piece | What happens | Why it happens in the story |
|---|---|---|---|
| 1 | Bridge that falls apart | A narrow bridge of chat messages drops away behind Art | Art's moderators are deleting the chat history to stop the typos |
| 2 | Two aisles | Art types noodles or phones to pick the food aisle (more typos, a power-up) or the phone aisle (shorter, harder typos) | The market map shows two ways to the transit gate |
| 3 | Chase | Train 2-14 moves on its own behind Art while firewall barriers block the track ahead | The control system is under the update |
| 4 | Elevator, then a bridge | Art fights at the top of a lift, rides it 16 m down to the factory floor, then crosses a conveyor bridge that drops away | The firmware line runs on two floors |
| 5 | Dark stretch | The lights in the core go off and Art's shots light the floor | Otto turned the lights off |

## Cast
| Name | Role | Status | Defined in |
|---|---|---|---|
| Art | Player, speed typist streaming his follower count | alive | js/breach/data.js |
| Otto Brenn | Wrote Fixword, sends the update | arrested at the end | js/breach/data.js, chapter 4 letter |
| Mina Brenn | Otto's daughter | died in the flood last June | chapter 4 letter |
| Pim | Noodle seller at the night market, sends Art the code from her transit card | alive | chapter 2 intro |

No new named characters. Train 2-14 is a train number, not a character. **[PROPOSED, Nov 2026]**

Otto's voice: "I spent twenty years teaching it to fix spelling for people and now nobody checks what they send." / "People will check their words again."

**[PROPOSED, Nov 2026]** Otto's new lines, sent to Art as fixword_otto or found in files:
- "Read what you send before you send it." (chapter 1, before the boss)
- "Removed autocorrect from keycap legends. If the operator types it wrong, it ships wrong." (chapter 4 firmware changelog)
- "I am taking leave. Do not push anything to Fixword while I am gone." (chapter 4, an email from last July. This sets that Otto took leave after Mina died and wrote the update during it.)
- "I turned the lights off down here. The one screen still on shows Mina's text from Canal Road." (chapter 5. This sets that he keeps Mina's text on screen.)
- "The rollback is in the core. Type through my machine without a mistake and it is yours." (chapter 5, before the boss)

**[PROPOSED, Nov 2026]** Pim's first spoken lines, sent from her shop's order page:
- "Every bowl on my order page has said NODLES since nine. My customers tap without reading."
- "The update came into my shop from the transit network at 9:00 exactly."
- "The big sign over the gate is the worst one. Its letters have been wrong since I opened my stall."

## Bosses **[PROPOSED, Nov 2026]**
Each boss is a program the update built inside that chapter's system. Every boss has a weak point word between attacks, an attack wind-up with a counter word, a stun window after a repel where every word typed deals damage, and one move nobody else has.

| Chapter | Boss | What it is | Weak point | Its own move |
|---|---|---|---|---|
| 1 | The Spam | A serpent of spam chat bubbles that slithers round the arena | its head | Free gifts: throws three hex chips that look like power-ups and turn into mimics. Breaking all three before any reach Art stuns it |
| 2 | The Signboard | A misspelled neon sign walking on four legs | its red eye under the sign | Fix the sign: the sign shows a misspelled word (NODLES, COFEE) and Art types it spelled right without seeing the answer. Shield nodes at 65% |
| 3 | The Announcer | A ring of six speakers round a core, with a ticker of garbled announcements; it teleports | its red heart | Mute the speakers: six numbered speaker words to type in order before the timer runs out. Muting all six gives a long stun |
| 4 | The Press | The keycap press on the firmware line, stamping wrong letters | its visor | Heat: every repelled slam adds heat and the third in a row overheats it for a long stun. Its slams wind up faster than any other boss |
| 5 | The Correction | Fixword itself: a wall of screens with a red eye and cables | its eye | "Which road was Mina on?" (canal road, coral road, carol road), two shield phases, and at 10% it can only be finished by typing "roll back the fixword update" |

## Enemies
| Type | Behaviour | First chapter |
|---|---|---|
| drone, runner, flyer, bug | walk, sprint, swoop or swarm toward Art | 1 |
| glitcher | teleports sideways and always carries a glitch word | 1 |
| splitter | breaks into two short-word shards | 1 |
| mimic **[PROPOSED]** | looks like a power-up chip until 8 m away, then shows itself and speeds up | 1 |
| reflector **[PROPOSED]** | its word shows mirrored while it faces away | 2 |
| carrier **[PROPOSED]** | a slow hive that lets out three bugs when it breaks | 2 |
| shielded | a hex shield is its first word | 2 |
| burrower **[PROPOSED]** | moves under the grid and can't be typed until it surfaces 9 m away | 3 |
| link **[PROPOSED]** | a chain of segments typed from the front | 3 |
| shooter | stops and fires packets to type down | 3 |
| healer **[PROPOSED]** | keeps its distance and puts a shield back on another typo | 4 |
| heavy **[PROPOSED]** | slow and big, carries a three or four word phrase | 4 |
| cloaked **[PROPOSED]** | fades out and back in, its word hidden while faded | 5 |

Glitch words **[PROPOSED]**: a typo's word shows one or two letters swapped for digits or symbols (sp4m, r0ute, @rt). The player types it as shown. Off on Easy, from chapter 2 on Normal, from chapter 1 on Hard.

## World rules
- The update gives every misspelled word on a screen a body. It goes after the person who typed it.
- Typing a word correctly at a typo destroys it.
- Doors inside the networks close on Art and open for the right password.
- Rolling back the update ends it everywhere at once.

## Holes
- The city has no name yet.
- What the police charge Otto with is not written.
- Whether Art knew Otto or Fixword before the update is open.
- Whether Otto is inside the Fixword core with Art or at the servers outside it is not written.
- How Pim reaches Art inside the network is shown (her shop's order page) and not explained. **[PROPOSED, Nov 2026]**
