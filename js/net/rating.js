// Duel MMR (shown as MMR, called rating in the code): Elo with a larger step while a player is new.
// The points a result moves depend on the gap: beating a higher MMR gains more than beating a
// lower one, and losing to a higher MMR costs less than losing to a lower one. The server will run the
// same maths, so this file has no DOM.
//
//   NetRating.START                       1200, every new player's rating
//   NetRating.expected(a, b)              chance that a beats b, 0..1
//   NetRating.k(rating, games)            the step: 40 for the first 10 games, 24 below 2000, 16 from 2000
//   NetRating.update(a, b, score, games)  -> { rating, delta }   score 1 win, 0.5 draw, 0 loss, for player a
//   NetRating.ofBot(wpm, acc)             a simulated player's rating from its typing (acc 0..1)
//   NetRating.wpmFor(rating, acc)         the other way: the wpm a bot needs to stand at that rating
//   NetRating.ART                         Art's fixed rating while his matches are simulated
//   NetRating.tier(rating)                -> { id, name, at }   the badge shown next to a rating
(function (root) {
  const START = 1200, ART = 2400;
  const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
  const k = (rating, games) => (games < 10 ? 40 : rating < 2000 ? 24 : 16);
  function update(a, b, score, games = 0) {
    const delta = Math.round(k(a, games) * (score - expected(a, b)));
    return { rating: Math.max(100, a + delta), delta };
  }
  // 40 wpm at 95% is about 1080, 80 wpm at 96% about 1350, 120 wpm at 97% about 1640
  const ofBot = (wpm, acc = 0.95) => Math.round(800 + 7.5 * wpm * (0.6 + 0.4 * Math.pow(Math.max(0, Math.min(1, acc)), 4)));
  const wpmFor = (rating, acc = 0.95) => Math.max(0, rating - 800) / (7.5 * (0.6 + 0.4 * Math.pow(Math.max(0, Math.min(1, acc)), 4)));
  const TIERS = [
    { id: 'bronze', name: 'Bronze', at: 0 },
    { id: 'silver', name: 'Silver', at: 1200 },
    { id: 'gold', name: 'Gold', at: 1450 },
    { id: 'plat', name: 'Platinum', at: 1700 },
    { id: 'master', name: 'Master', at: 2000 },
  ];
  const tier = r => TIERS.reduce((t, x) => (r >= x.at ? x : t), TIERS[0]);
  root.NetRating = { START, ART, expected, k, update, ofBot, wpmFor, tier, TIERS };
})(globalThis);
