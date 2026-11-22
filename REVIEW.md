# Finish pass, 21 Nov 2026

This is the speed test and the four audits Gid asked for once the features were done: ponytail-audit, app-defense, security-privacy-review and repo-guard, plus a modern-web pass. The fixes are in the same commits. Open items are at the end, with the questions only Gid or Art can answer.

## Speed

Each page was opened on a first visit in Chrome, at phone size, with nothing cached. Sizes are before compression; GitHub Pages compresses scripts to about a third.

| Page | Before | After | WebGL before → after |
|---|---|---|---|
| Home | 6,764 KB | 1,068 KB | 2 → 0 |
| Type | 6,661 KB | 496 KB | 1 → 0 |
| Leaderboard | 6,661 KB | 871 KB | 1 → 0 |
| Open Port | 6,661 KB | 905 KB | 1 → 0 |
| Play (Race) | 6,941 KB | 1,920 KB | 2 → 1 |
| World boss | 8,002 KB | 3,087 KB | 1 → 1 |
| My Room | 3,928 KB | 1,428 KB | 1 → 1 |
| Profile | 6,661 KB | 4,744 KB | 1 → 1 |

Main-thread blocking on the Type page went from 3.7 s to almost nothing. The test machine draws 3D in software, so the blocking on 3D pages is higher than on a real phone.

What changed:

- **Scripts load per page.** Every page used to load all 2.1 MB of scripts. `js/app/lazy.js` now loads a page's scripts and styles the first time it opens, and hovering a nav link fetches that page's files ahead of the click.
- **Avatars.** The nav and the lists show a picture rendered before or the hooded figure. The 3D avatar (three.js, the 1.8 MB head and the hair) loads only on the profile, player profiles, duels and parties. The nav picks up the real face after the first profile visit.
- **Home keyboards** start three.js when they scroll near the screen, not on load.
- **The Academy, Free typing and Reel tabs** load when one of them opens, so the typing test starts light.
- **three.js** is the minified build from `lib/three/` (690 KB instead of 1.3 MB).

## Security and privacy

The site has no server, no accounts and no payments yet. Progress, coins and the room live in the player's browser. The only data sent anywhere is the country count to `/api/community`, which doesn't exist yet: a country code from the time zone, with no name or ID.

Fixed in this pass:

| What | Where | Fix |
|---|---|---|
| three.js came from a CDN with no integrity check, so a hacked CDN could run code for every visitor | `index.html` import map | Copied into `lib/three/` |
| Google Fonts sent every visitor's IP address to Google before any consent | `index.html` | Self-hosted in `fonts/`, with the Thai subset of Chakra Petch |
| No Content-Security-Policy, so one missed escape could run injected code | `index.html` | CSP from `.github/csp-tag.mjs`. Scripts only from the site and the five inline scripts by fingerprint; WebAssembly allowed for the avatar decoder |
| The chat let links through when spaced out or spelled with "dot" (`evil . com`, `evil dot com/free`) | `js/net/chat-rules.js` | Caught now; a sentence ending before "me too" still passes |
| A save the browser refused was ignored, so a player in private browsing could lose everything with no warning | `js/state.js` | Shown once as a toast |

Checked and fine: names, chat and profiles are escaped everywhere they're shown (the scanner's hits are fixed text from the code); no keys or passwords in any of the 55 commits; outside links are the sponsor shops and Instagram.

| Check | Result |
|---|---|
| Fonts or files from another company's server | Passed after this pass |
| Claims | Passed. Art's 204 wpm and follower count are from his reels; the live numbers on the map are labelled "Demo data" |
| Logos, images, fonts and code | Passed for fonts and three.js (`LICENSES.md`). The sponsor keyboard names and logos need written OK from each brand before launch |
| Children could use it | Open. See the questions below |
| Accounts, payments, subscriptions, uploads, chat between real people | Not live yet. They come with the server and need the checks in the plan below |
| Operator name and contact on the site | Open. Nothing says who runs the site |

## Audit findings

Fixed:

1. **Daily tasks would have left out half the modes.** The draw only picks tasks for modes whose scripts have loaded, and those scripts now load per page. `js/app/progress.js` lists every mode's events at start-up.
2. **Watch mode in duels put a bot against itself.** Both bots were drawn in the same millisecond from the same seed. `js/net/sim.js` salts each draw.
3. **The Play hub wrapped 7 tiles as 4 + 3.** Three stylesheets set its grid. One rule in `css/site.css` now gives one row on desktop and a swipeable strip on phones.
4. **Duel portraits showed the hooded figure through the countdown.** The 3D avatars start loading when the duel page opens.
5. **Chat filter test.** `.github/test-chat-rules.mjs` runs 480 checks, including every demo chat line.

Open:

6. **Coins, wins and ratings can be edited in the browser.** Anyone can open the console and give themselves coins. That's fine while everything is local, but the server must own coins, runs and ratings before anything costs real money or a leaderboard means something. NET.md already says the server checks runs by replaying keystrokes.
7. **The site doesn't run from a `file://` address.** Chrome blocks modules, fonts and audio from disk. Use GitHub Pages or `python -m http.server` (README).

## Scans on every push

`.github/workflows/security-scan.yml` runs on GitHub's machines:

- **Gitleaks:** leaked keys in the code and the whole history.
- **The CSP check on `index.html`:** fails when an inline script changed without `node .github/csp-tag.mjs index.html --write`.
- **The chat filter test.**
- **Semgrep and harden-scan:** report only, since they flag every `innerHTML` in 2.5 MB of code.

GitHub's own Secret scanning and Push protection are a repo setting: Settings, Code security. They're free, delete nothing and can be switched off again.

## Questions for Gid and Art

1. **Who is the operator?** A name, a country and a contact email go on the site before launch.
2. **Age.** Art's audience is teenagers. In Thailand a player under 20 needs a parent's consent for their data, and in the Philippines under 18. Once there are accounts, does sign-up ask for a birth year and a parent's consent?
3. **Chat moderation.** Open Port will carry real teenagers' messages. Who reads reports, and how fast? Since 22 Nov, "how old are you", "where do you live", "send pics", "meet up" and "don't tell your parents" type messages are refused in rooms and private chats; should a refused one also be flagged to a moderator? The 90-day room log Gid approved needs a stated purpose in the privacy notice and a way for a player to get theirs deleted.
4. **Private chats between friends (added 22 Nov).** How long are they kept? Proposed: 30 days, a reported chat kept until the report is closed, and a moderator opens one only when it's reported. Neither Thailand's PDPA nor the Philippines' Data Privacy Act sets a number of days; both say no longer than the purpose needs, and the privacy notice has to state the period.
5. **Coin purchases.** When real money buys coins: a refund policy, the price with every fee shown before paying, and the Thai consumer rules on selling to minors. That needs a lawyer's look.
6. **Sponsor logos.** Written permission from each keyboard brand shown on the home page.

## Plan

- **Before launch:** operator details on the site; sponsor permissions; turn on Secret scanning and Push protection.
- **With the server:** coins, runs and ratings decided by the server; a privacy policy and terms with recorded acceptance; age and parent consent; chat reports with a human behind them; data copy and deletion on request; rate limits on chat and sign-up. Add the server's address to `connect-src` in the CSP, or the site can't reach it.
- **Ongoing:** read the Monday scan's report; rerun the CSP tool after editing an inline script.

## Not checked

- Real phones and iPad Safari: all tests ran in Chrome on Linux.
- Breach, the room and the boss internals were tested by loading and playing pages, not read line by line.
- Legal points above are questions for a lawyer, not conclusions.
