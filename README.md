# 10000wpm

Sample website for Art (@10000wpm on Instagram). Open `index.html` in a browser. The 3D keyboards and fonts load from the internet.

## What is on the page

- **Race.** The hero text types itself at Art's 204 wpm until the visitor starts typing, then Art's caret races them.
- **Keyboards.** Six boards from his reels built in 3D. Each one spins, presses the keys you press and plays its own key sound. The spec card beside it carries the maker's specs and a link to his reel.
- **Games.** Typo Horde (shoot typos by typing the word over them, Typing of the Dead style), a 15, 30 or 60 second speed test, and a race against Art, your best run or a friend on the same keyboard.
- **Videos** and **For brands** link to his Instagram.

## Files

- `index.html` page markup
- `css/site.css` colours, type and layout, tokens at the top
- `js/core.js` typing engine, word lists and key sounds
- `js/hero.js` race at the top of the page
- `js/games.js` speed test and race
- `js/horde.js` Typo Horde
- `js/keyboards.js` board specs, colours and layouts
- `js/kb3d.js` 3D showroom

A new sponsor board only needs an entry in `js/keyboards.js`.

## To confirm with Art

1. Which brands sponsor him. Womier is marked Collab from his caption. KeyPro is the first highlight on his profile and sells the LOGA board, so it may belong on the page.
2. His best speed. 204 wpm is the highest number on screen in his recent reels.
3. Board colours. They are close to his videos and should be checked against real photos.
4. Specs marked from retailers rather than the maker: LOGA weight and hot-swap, all Chilkey values.
5. His YouTube link and a contact email for brands.
