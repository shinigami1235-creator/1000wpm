# Typo Horde: registry

| id | type | file | trigger | who | where | changes | calls back to |
|---|---|---|---|---|---|---|---|
| live.intro | chapter intro | js/horde-data.js | start chapter 1 | Art | room | none | none |
| live.boss | boss: The Spam | js/horde-data.js | end of chapter 1 | Art | room | unlocks chapter 2 | live.intro |
| live.outro | chapter outro | js/horde-data.js | chapter 1 cleared | Art, fixword_otto | room | none | live.intro |
| market.intro | chapter intro | js/horde-data.js | start chapter 2 | Art, Pim | market | none | live.outro |
| market.boss | boss: The Signboard | js/horde-data.js | end of chapter 2 | Art | market | unlocks chapter 3 | market.intro |
| market.outro | chapter outro | js/horde-data.js | chapter 2 cleared | Pim | market | Art gets the transit card | market.intro |
| subway.intro | chapter intro | js/horde-data.js | start chapter 3 | Art | subway | none | market.outro |
| subway.boss | boss: The Announcer | js/horde-data.js | end of chapter 3 | Art | subway | unlocks chapter 4 | subway.intro |
| subway.outro | chapter outro | js/horde-data.js | chapter 3 cleared | Art | subway | none | none |
| factory.intro | chapter intro | js/horde-data.js | start chapter 4 | Art | factory | none | subway.outro |
| factory.boss | boss: The Press | js/horde-data.js | end of chapter 4 | Art | factory | unlocks chapter 5 | factory.intro |
| factory.letter | letter | js/horde-data.js | chapter 4 cleared | Otto, Mina | factory | none | live.outro |
| server.intro | chapter intro | js/horde-data.js | start chapter 5 | Art, Otto | server | none | factory.letter |
| server.boss | boss: The Correction | js/horde-data.js | end of chapter 5 | Art, Otto | server | asks "Which road was Mina on?" | factory.letter |
| server.outro | ending | js/horde-data.js | chapter 5 cleared | Art, Otto | server | ends the game | live.intro |
