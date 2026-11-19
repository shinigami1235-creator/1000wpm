# 10000wpm

Sample website for Art, who posts speed typing on Instagram as @10000wpm. Open `index.html` in a browser with an internet connection since the 3D keyboards and fonts load online. Typo Horde's music loops cleanly when the site runs from a web server such as GitHub Pages and loops with a short gap when opened as a file.

## Sections

- **Race.** The text at the top types itself at Art's 204 wpm. A visitor who starts typing races Art's caret.
- **Keyboards.** Six boards from his reels are built in 3D and spin until someone types. Pressed keys go down on the board with that board's own sound. The card beside each board has the maker's specs and a link to Art's reel.
- **Typo Horde.** A Typing of the Dead style game in five chapters: Art's room, the night market, the subway, the keyboard factory and the server room. Each chapter has its own enemies, music and boss. Bosses mix phrases to type, keycaps to shoot down, typos to clear and a spelling question. Health, Debounce, Macro, Shield and Double come up as power-ups. Ranks and unlocked chapters stay saved in the browser.
- **Speed test.** 15, 30 or 60 seconds of shuffled words with long words mixed in.
- **Race.** A driving view on a random course. Your car's speed comes from your typing speed and a run of correct letters turns on the boost. Race Art, your best run or a friend on the same keyboard.
- **Videos** and **For brands** link to his Instagram.

## Files

- `index.html` holds the page.
- `css/site.css` holds the colours, type and layout, with the tokens at the top.
- `js/words.js` holds about 3,400 words from wordfreq with names, places and loaded words taken out.
- `js/core.js` holds the typing engine and the key sounds, and deals words from shuffled lists so none repeat until the list runs out.
- `js/hero.js` runs the race at the top.
- `js/games.js` runs the speed test and the race game.
- `js/race.js` draws the race road, cars and speedometer.
- `js/horde.js` runs Typo Horde, with `horde-data.js` for chapters and story, `horde-art.js` for the drawing and `horde-audio.js` for music and sound effects.
- `audio/` holds the eight Typo Horde music loops.
- `STORY/` holds the Typo Horde story canon and the list of every story piece.
- `js/keyboards.js` holds each board's specs, colours and layout.
- `js/kb3d.js` builds the 3D keyboards.

Add a new sponsor board as one entry in `js/keyboards.js`.

## To confirm with Art

1. Which brands sponsor him. Womier is marked Collab from his caption. KeyPro is the first highlight on his profile and sells the LOGA board.
2. His best speed. 204 wpm is the highest score on screen in his recent reels.
3. The board colours, which were matched to his videos by eye.
4. The specs that came from shops and reviews: the LOGA weight and hot-swap plus every Chilkey value.
5. His YouTube link and an email for brands.
6. The Typo Horde story in `STORY/WORLD.md`, since it uses Art as the main character.
