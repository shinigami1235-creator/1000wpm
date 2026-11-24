// Loads the combat layer and the net files into one context for node tests and the balance sim.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  'js/app/combat/bus.js', 'js/app/combat/spells.js', 'js/app/combat/combo.js', 'js/app/combat/damage.js', 'js/app/combat/perks.js', 'js/app/combat/engine.js',
  'js/net/core.js', 'js/net/filter.js', 'js/net/rating.js', 'js/net/typist.js', 'js/net/bot.js', 'js/net/duel-rules.js', 'js/net/party-rules.js',
];
module.exports = function load(extra = []) {
  const ctx = { console, performance: { now: () => 0 }, setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, JSON };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of [...FILES, ...extra]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
};
