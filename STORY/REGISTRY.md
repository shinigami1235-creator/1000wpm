# Breach: registry

Rows marked **[PROPOSED]** are new or changed in November 2026 and wait for Gid's yes. Notes show in a message box at the top left when the camera reaches that wave.

| id | type | file | trigger | who | where | changes | calls back to |
|---|---|---|---|---|---|---|---|
| live.intro | chapter intro | js/breach/data.js | start chapter 1 | Art | chat | Art is pulled into his chat | none |
| live.note1 **[PROPOSED]** | log: Fixword 9.0 release notes | js/breach/data.js | chapter 1 wave 1 | none | chat | none | live.intro |
| live.note2 **[PROPOSED]** | log: stream chat, 9:03 pm | js/breach/data.js | chapter 1 wave 2 | none | chat | none | live.intro |
| live.note3 **[PROPOSED]** | log: stream chat, 9:05 pm | js/breach/data.js | chapter 1 bridge | none | chat | the bridge falls behind Art | live.intro |
| live.note4 **[PROPOSED]** | message: fixword_otto | js/breach/data.js | chapter 1 last wave | Otto | chat | none | none |
| live.boss | boss: The Spam | js/breach/data.js | end of chapter 1 | Art | chat | unlocks chapter 2 | live.intro |
| live.outro | chapter outro | js/breach/data.js | chapter 1 cleared | Art, fixword_otto | chat | Art follows the link out of the chat | live.note4 |
| market.intro **[PROPOSED: first line added]** | chapter intro | js/breach/data.js | start chapter 2 | Art, Pim | market | none | live.outro |
| market.note1 **[PROPOSED]** | message: Pim | js/breach/data.js | chapter 2 wave 1 | Pim | market | none | market.intro |
| market.note2 **[PROPOSED]** | log: shop log, 9:11 pm | js/breach/data.js | chapter 2 wave 2 | Pim | market | none | market.note1 |
| market.branch **[PROPOSED]** | choice: two aisles | js/breach/data.js | chapter 2 wave 3 | Art | market | food aisle has more typos and a Macro power-up, phone aisle is shorter | none |
| market.note3 **[PROPOSED]** | message: Pim | js/breach/data.js | chapter 2 wave 4 | Pim | market | none | market.intro |
| market.note4 **[PROPOSED]** | message: Pim | js/breach/data.js | chapter 2 last wave | Pim | market | none | market.boss |
| market.boss | boss: The Signboard | js/breach/data.js | end of chapter 2 | Art | market | unlocks chapter 3 | market.note4 |
| market.outro | chapter outro | js/breach/data.js | chapter 2 cleared | Pim | market | Art gets the code from Pim's transit card | market.note3 |
| subway.intro **[PROPOSED: first line added]** | chapter intro | js/breach/data.js | start chapter 3 | Art | transit | none | market.outro |
| subway.note1 **[PROPOSED]** | log: announcement log, 9:20 pm | js/breach/data.js | chapter 3 wave 1 | none | transit | none | subway.intro |
| subway.chase **[PROPOSED]** | set piece: train 2-14 | js/breach/data.js | chapter 3 wave 3 | none | transit | each firewall barrier Art reaches costs a life | subway.intro |
| subway.note2 **[PROPOSED]** | note: maintenance | js/breach/data.js | chapter 3 wave 6 | none | transit | none | subway.outro |
| subway.boss | boss: The Announcer | js/breach/data.js | end of chapter 3 | Art | transit | unlocks chapter 4 | subway.intro |
| subway.outro | chapter outro | js/breach/data.js | chapter 3 cleared | Art | transit | Art reaches the factory firmware | subway.note2 |
| factory.intro | chapter intro | js/breach/data.js | start chapter 4 | Art | factory | none | subway.outro |
| factory.note1 **[PROPOSED]** | log: firmware changelog signed Otto | js/breach/data.js | chapter 4 wave 1 | Otto | factory | none | factory.letter |
| factory.note2 **[PROPOSED]** | log: shift report | js/breach/data.js | chapter 4 elevator | none | factory | none | factory.intro |
| factory.note3 **[PROPOSED]** | email: Otto, last July | js/breach/data.js | chapter 4 wave 6 | Otto | factory | sets that Otto took leave after the flood | factory.letter |
| factory.boss | boss: The Press | js/breach/data.js | end of chapter 4 | Art | factory | unlocks chapter 5 | factory.intro |
| factory.letter | letter | js/breach/data.js | chapter 4 cleared | Otto, Mina | factory | none | live.outro |
| server.intro | chapter intro | js/breach/data.js | start chapter 5 | Art, Otto | core | none | factory.letter |
| server.note1 **[PROPOSED]** | log: Fixword log, last June | js/breach/data.js | chapter 5 wave 1 | Mina | core | none | factory.letter |
| server.note2 **[PROPOSED]** | message: fixword_otto | js/breach/data.js | chapter 5 dark stretch | Otto | core | the lights go off | server.note1 |
| server.note3 **[PROPOSED]** | message: fixword_otto | js/breach/data.js | chapter 5 last wave | Otto | core | none | server.intro |
| server.boss | boss: The Correction | js/breach/data.js | end of chapter 5 | Art, Otto | core | asks "Which road was Mina on?", ends on the rollback command | factory.letter |
| server.outro | ending | js/breach/data.js | chapter 5 cleared | Art, Otto | core | ends the game, Art comes back out through his stream | live.intro |

## Changed lines **[PROPOSED, Nov 2026]**
| id | before | after |
|---|---|---|
| market.intro | (no first line) | "The link from fixword_otto opens the market's shop network." |
| subway.intro | (no first line) | "The code from Pim's transit card gets Art into the Line 2 control system." |
