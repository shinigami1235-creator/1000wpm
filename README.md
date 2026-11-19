# 10000wpm

Sample website for Art, who posts speed typing on Instagram as @10000wpm. Open `index.html` in a browser with an internet connection since the 3D keyboards and fonts load online.

## Sections

- **Race.** The text at the top types itself at Art's 204 wpm. A visitor who starts typing races Art's caret.
- **Keyboards.** Six boards from his reels are built in 3D and spin until someone types. Pressed keys go down on the board with that board's own sound. The card beside each board has the maker's specs and a link to Art's reel.
- **Games.** Typo Horde plays like Typing of the Dead. The speed test runs for 15, 30 or 60 seconds. Race puts you against Art, your best run or a friend on the same keyboard.
- **Videos** and **For brands** link to his Instagram.

## Files

- `index.html` holds the page.
- `css/site.css` holds the colours, type and layout, with the tokens at the top.
- `js/core.js` holds the typing engine, the word lists and the key sounds.
- `js/hero.js` runs the race at the top.
- `js/games.js` runs the speed test and the race game.
- `js/horde.js` runs Typo Horde.
- `js/keyboards.js` holds each board's specs, colours and layout.
- `js/kb3d.js` builds the 3D keyboards.

Add a new sponsor board as one entry in `js/keyboards.js`.

## To confirm with Art

1. Which brands sponsor him. Womier is marked Collab from his caption. KeyPro is the first highlight on his profile and sells the LOGA board.
2. His best speed. 204 wpm is the highest score on screen in his recent reels.
3. The board colours, which were matched to his videos by eye.
4. The specs that came from shops and reviews: the LOGA weight and hot-swap plus every Chilkey value.
5. His YouTube link and an email for brands.
