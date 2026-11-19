# 10000WPM: running costs

Checked 19 Nov 2026. Prices are in US dollars unless marked.

## What each part needs

| Part | Needs a server? | Cost |
|---|---|---|
| The site itself (pages, typing test, Breach, race, room, shop, profile) | No. It runs in the browser. | Free on GitHub Pages or Cloudflare Pages |
| Domain name | No | 1 baht the first year, then 699 baht a year |
| Accounts, global leaderboard, saving progress across devices | Yes | See below |
| World boss that everyone attacks at once, with a damage scoreboard | Yes, with live connections | See below |
| Payments | Yes | Later. The payment provider takes a cut of each payment. |

## Server options

**Supabase** (database, logins and live connections in one place)
- Free plan: 200 players connected live at the same moment, 500 MB database, 50,000 monthly active users for logins. A free project pauses when it gets too little activity for a week, and its data stays.
- Pro plan: $25 a month. 500 players connected at once are included, then $10 for every extra 1,000. Pro projects never pause.

**Cloudflare Workers with Durable Objects** (one Durable Object can hold one world boss fight and its WebSocket connections)
- Free plan includes Durable Objects with 100,000 requests a day.
- Paid plan: $5 a month minimum, with 1 million Durable Object requests a month included, then $0.15 per million. 100 incoming WebSocket messages count as 5 requests.
- Needs more code than Supabase since logins and the leaderboard have to be built on top.

**Firebase Realtime Database**
- Free (Spark) plan: 100 players connected at once, and the limit cannot be raised.
- Pay as you go (Blaze): up to 200,000 connections per database.

## Recommendation

1. Launch on the domain plus Supabase Free. Year one costs 1 baht plus $0, and the free plan holds 200 players connected at the same time.
2. Move to Supabase Pro at $25 a month when more than 200 people regularly play at once, or when the site has paying players and can't risk a pause.
3. If the world boss alone outgrows Supabase's connection limit, run just the boss fight on Cloudflare Durable Objects for $5 a month and keep accounts and leaderboards on Supabase.

A global leaderboard also needs the server to check runs before saving them (replaying the keystroke timings), since anyone can send a fake score from the browser. That is server code to build, not an extra cost.

## Sources

- Supabase Realtime limits: https://supabase.com/docs/guides/realtime/limits
- Supabase Realtime pricing: https://supabase.com/docs/guides/realtime/pricing
- Supabase free project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Supabase Pro plan: https://supabase.com/pricing
- Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Firebase Realtime Database limits: https://firebase.google.com/docs/database/faq-and-troubleshooting
