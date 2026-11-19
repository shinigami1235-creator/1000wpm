# Breach: registry

| id | type | file | trigger | who | where | changes | calls back to |
|---|---|---|---|---|---|---|---|
| live.intro | chapter intro | js/breach/data.js | start chapter 1 | Art | chat | Art is pulled into his chat | none |
| live.boss | boss: The Spam | js/breach/data.js | end of chapter 1 | Art | chat | unlocks chapter 2 | live.intro |
| live.outro | chapter outro | js/breach/data.js | chapter 1 cleared | Art, fixword_otto | chat | Art follows the link out of the chat | live.intro |
| market.intro | chapter intro | js/breach/data.js | start chapter 2 | Art, Pim | market | none | live.outro |
| market.boss | boss: The Signboard | js/breach/data.js | end of chapter 2 | Art | market | unlocks chapter 3 | market.intro |
| market.outro | chapter outro | js/breach/data.js | chapter 2 cleared | Pim | market | Art gets the code from Pim's transit card | market.intro |
| subway.intro | chapter intro | js/breach/data.js | start chapter 3 | Art | transit | none | market.outro |
| subway.boss | boss: The Announcer | js/breach/data.js | end of chapter 3 | Art | transit | unlocks chapter 4 | subway.intro |
| subway.outro | chapter outro | js/breach/data.js | chapter 3 cleared | Art | transit | Art reaches the factory firmware | none |
| factory.intro | chapter intro | js/breach/data.js | start chapter 4 | Art | factory | none | subway.outro |
| factory.boss | boss: The Press | js/breach/data.js | end of chapter 4 | Art | factory | unlocks chapter 5 | factory.intro |
| factory.letter | letter | js/breach/data.js | chapter 4 cleared | Otto, Mina | factory | none | live.outro |
| server.intro | chapter intro | js/breach/data.js | start chapter 5 | Art, Otto | core | none | factory.letter |
| server.boss | boss: The Correction | js/breach/data.js | end of chapter 5 | Art, Otto | core | asks "Which road was Mina on?", ends on the rollback command | factory.letter |
| server.outro | ending | js/breach/data.js | chapter 5 cleared | Art, Otto | core | ends the game, Art comes back out through his stream | live.intro |
