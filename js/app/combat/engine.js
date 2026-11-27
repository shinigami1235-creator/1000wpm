// One fighter's combat state: combo, accuracy, spell offers, statuses and damage.
// A mode makes one per player and feeds it what the player typed. It never sends
// damage itself; it returns numbers and emits events, and the mode decides where
// the damage goes (a boss, another player, a raid target).
//
//   const me = Combat.create({ rng, offerMs, offerAt, offerSize, spells });
//   me.key(ok)                          every key press, for accuracy
//   me.word({ letters, clean, ms, useCrit })  a typed word that hit -> { amount, mult, tier, combo, pierce, crit }
//                                       letters 0 counts a word toward the combo without damage (a block word)
//   me.miss(reason)                     a wrong word or a typo -> drops a tier (quantum split can save it)
//   me.hurt(kind)                       an attack reached the player -> { blocked } (safe mode blocks it) or breaks the combo
//   me.cast(text, { clean, shield })    typed a spell word -> null if no such offer, { fizzled } on a typo, or a cast
//   me.matchOffer(prefix)               the offered spell whose word starts with prefix
//   me.tick(now)                        ends statuses and offers on time
//   earn: true (World Boss, Gid 27 Nov 2026): a combo milestone earns one spell instead of opening an
//   offer. It's picked at random, leaning toward the stronger ones the more accurate you've been
//   (spellEarned { spell, combo }); the page puts its words into your line and it waits there until you
//   type it: clean casts it, a typo fizzles it. me.earned() lists the spells waiting.
//   me.status(name), me.consume(name), me.statuses(), me.state(), me.reset(), me.debug
//   me.on(event, fn)                    events: hit combo tierUp tierDown spellOffer offerEnd spellCast fizzle miss ward guard status perk
//
// CTRL perks (js/app/combat/perks.js, CTRL.md) come in through opts, and only boss modes pass them:
//   perks: { division, rank }   the player's division and its rank (1 to 3)
//   targetHp: () => 0..1        the target's health left, for the Hunter
//   teamMult: () => n           a party's Architect bonus for everyone in it
window.Combat = window.Combat || {};
Combat.create = function create(opts = {}) {
  const bus = opts.bus || Combat.Bus();
  const P = Combat.Perks;
  const perks = P && opts.perks && P.byId(opts.perks.division) ? opts.perks : null;
  const combo = Combat.Combo({ tiers: perks ? P.tiers(opts.tiers || Combat.TIERS, perks) : opts.tiers });
  const guardMs = perks ? P.guardMs(perks) : 0;
  const teamMult = () => (opts.teamMult ? opts.teamMult() : 1);
  let guardAt = -Infinity, hunting = false;
  const D = Combat.Damage;
  const now = opts.now || (() => performance.now());
  const rng = opts.rng || Math.random;
  const OFFER_MS = opts.offerMs || 15000;
  // combo points that open an offer: 10, 25, 50, then every 25
  const offerAt = opts.offerAt || (n => n === 10 || n === 25 || n === 50 || (n > 50 && n % 25 === 0));
  const offerSize = opts.offerSize || (n => (n < 25 ? 2 : 3));
  const allowed = opts.spells ? new Set(opts.spells) : null;
  const KEYS = 60, RECENT = 8;

  let keys = [], recent = [], statuses = {}, offer = null, lastWordAt = 0, earned = [];

  function acc() { return keys.length ? keys.reduce((a, b) => a + b, 0) / keys.length : 1; }
  function key(ok) { keys.push(ok ? 1 : 0); if (keys.length > KEYS) keys.shift(); }

  // ---------- statuses ----------
  function status(name) {
    const s = statuses[name];
    if (!s) return null;
    if (s.until && now() >= s.until) { end(name); return null; }
    return s;
  }
  function start(name, o) {
    statuses[name] = { name, at: now(), until: o.ms ? now() + o.ms : 0, charges: o.charges || 0, mult: o.mult || 1, pierce: !!o.pierce, ms: o.ms || 0 };
    bus.emit('status', { name, on: true, ...statuses[name] });
  }
  function end(name) {
    if (!statuses[name]) return;
    delete statuses[name];
    bus.emit('status', { name, on: false });
  }
  function consume(name) {
    const s = status(name);
    if (!s) return false;
    if (s.charges) { s.charges--; if (s.charges <= 0) end(name); else bus.emit('status', { name, on: true, ...s }); }
    return true;
  }
  function statusMult() {
    let m = 1;
    for (const k in statuses) { const s = status(k); if (s && s.mult > 1) m *= s.mult; }
    return m;
  }
  const pierce = () => Object.keys(statuses).some(k => { const s = status(k); return s && s.pierce; });

  // ---------- offers ----------
  function pool(maxRarity) {
    return Combat.SPELLS().filter(s => s.rarity <= maxRarity && (!allowed || allowed.has(s.id))
      && !(s.effect.status && status(s.effect.status)));
  }
  function makeOffer(n) {
    const maxR = n >= 100 && n % 100 === 0 ? 4 : n >= 50 ? 3 : n >= 25 ? 2 : 1;
    const size = offerSize(n);
    const all = pool(maxR).filter(s => s.rarity < 4 || maxR === 4);
    const out = [], letters = new Set();
    const take = s => { out.push(s); letters.add(s.word[0]); };
    const top = all.filter(s => s.rarity === maxR);
    if (top.length) take(top[Math.floor(rng() * top.length)]);
    // the rest lean toward the highest rarities on offer
    for (let tries = 0; out.length < size && tries < 60; tries++) {
      const s = all[Math.floor(rng() * all.length)];
      if (!s || out.includes(s) || letters.has(s.word[0]) || s.rarity === 4) continue;
      if (rng() > 0.35 + 0.65 * (s.rarity / maxR)) continue;
      take(s);
    }
    if (!out.length) return null;
    offer = { combo: n, at: now(), until: now() + OFFER_MS, spells: out.map(s => s.id) };
    bus.emit('spellOffer', { ...offer, spells: out });
    return offer;
  }
  // one spell for reaching combo n: the higher your accuracy, the more the draw leans to the rare ones
  function earnSpell(n) {
    const maxR = n >= 100 && n % 100 === 0 ? 4 : n >= 50 ? 3 : n >= 25 ? 2 : 1;
    const all = pool(maxR).filter(s => s.rarity < 4 || maxR === 4);
    if (!all.length) return null;
    const k = Math.max(0, (acc() - 0.8) * 15);   // 80% accuracy: every spell equal; 100%: weight rarity cubed
    const w = all.map(s => Math.pow(s.rarity, k)), tot = w.reduce((a, b) => a + b, 0);
    let r = rng() * tot, s = all[all.length - 1];
    for (let i = 0; i < all.length; i++) { r -= w[i]; if (r <= 0) { s = all[i]; break; } }
    earned.push(s.id); if (earned.length > 3) earned.shift();
    bus.emit('spellEarned', { spell: s, combo: n });
    return s;
  }
  function closeOffer(reason) {
    if (!offer) return;
    const o = offer; offer = null;
    bus.emit('offerEnd', { ...o, reason });
  }
  function matchOffer(prefix) {
    if (!offer || !prefix) return null;
    for (const id of offer.spells) { const s = Combat.spell(id); if (s.word.startsWith(prefix)) return s; }
    return null;
  }

  // ---------- combo ----------
  function after(r, reason) {
    const st = combo.state();
    bus.emit('combo', { ...st, from: r.from, reason });
    if (r.up) bus.emit('tierUp', { tier: r.tier, name: st.name, combo: r.combo });
    if (r.down) bus.emit('tierDown', { tier: r.tier, name: st.name, combo: r.combo, from: r.from, reason });
    if (r.combo > r.from && offerAt(r.combo)) { if (opts.earn) earnSpell(r.combo); else makeOffer(r.combo); }
    return st;
  }
  function slip(reason) {
    // Frenzy (Gid, 28 Nov 2026): one miss ends it
    if (status('frenzy')) end('frenzy');
    // Combo shield: until its timer runs out a typo or a wrong word keeps the combo, it just adds nothing
    if (status('cshield') && reason !== 'hurt') { bus.emit('guard', { reason, left: 0, shield: true }); return combo.state(); }
    if (consume('split')) { bus.emit('guard', { reason, left: status('split') ? status('split').charges : 0 }); return combo.state(); }
    // Sentinel: one slip every so often keeps its tier
    if (guardMs && reason !== 'hurt' && combo.state().combo > 0 && now() - guardAt >= guardMs) {
      guardAt = now();
      bus.emit('perk', { id: 'sentinel', name: 'Unbreakable' });
      return combo.state();
    }
    const r = combo.drop();
    const st = after(r, reason);
    bus.emit('miss', { reason, combo: r.combo, from: r.from, tier: r.tier });
    return st;
  }

  // a word that hit. clean: no wrong key was pressed while typing it
  function word({ letters = 0, clean = true, ms = 0, useCrit = true } = {}) {
    let st;
    if (clean) {
      let r = combo.add();
      // in a frenzy each clean word counts twice for the combo
      if (status('frenzy')) { const r2 = combo.add(); r = { ...r2, from: r.from, up: r.up || r2.up }; }
      st = after(r, 'word');
    }
    else st = slip('typo');
    const wpm = ms > 0 && letters ? (letters + 1) / 5 / (ms / 60000) : 0;
    const hp = opts.targetHp ? opts.targetHp() : null;
    const perkMult = (perks ? P.word(perks, { wpm, clean, acc: acc(), targetHp: hp }) : 1) * teamMult();
    if (perks && perks.division === 'hunter' && letters) {
      const on = hp != null && hp < 0.3;
      if (on && !hunting) bus.emit('perk', { id: 'hunter', name: 'Execution' });
      hunting = on;
    }
    const d = D.word({ letters, tierMult: st.mult, acc: acc(), wpm, statusMult: statusMult(), perkMult });
    if (letters) {
      recent.push(d.amount); if (recent.length > RECENT) recent.shift();
      bus.emit('hit', { kind: 'word', letters, amount: d.amount, mult: d.mult, tier: st.tier, combo: st.combo });
    }
    lastWordAt = now();
    let crit = false;
    const cs = status('crits');
    if (cs && letters && useCrit) { crit = true; consume('crits'); }
    return { amount: d.amount, mult: d.mult, parts: d.parts, tier: st.tier, combo: st.combo, pierce: pierce(), crit };
  }
  function miss(reason = 'miss') { return slip(reason); }
  function hurt(kind = 'hit') {
    if (consume('ward')) { bus.emit('ward', { kind }); return { blocked: true }; }
    if (status('stunned-target')) return { blocked: true };
    const r = combo.break();
    after(r, 'hurt');
    if (r.from > 0) bus.emit('miss', { reason: 'hurt', combo: 0, from: r.from, tier: 0 });
    return { blocked: false };
  }

  // ---------- casting ----------
  function cast(text, { clean = true, shield = false } = {}) {
    const s = Combat.spellByWord(text);
    const fromEarned = !!s && earned.includes(s.id);
    if (!fromEarned && (!offer || !s || !offer.spells.includes(s.id))) return null;
    if (fromEarned) earned.splice(earned.indexOf(s.id), 1);
    if (!clean) {
      bus.emit('fizzle', { spell: s });
      slip('fizzle');
      return { fizzled: true, spell: s };
    }
    if (!fromEarned) closeOffer('cast');
    const e = s.effect;
    if (e.status) start(e.status, e);
    if (e.crits) start('crits', { charges: e.crits, ms: 20000 });
    if (e.debuff === 'stun') start('stunned-target', { ms: e.ms });
    if (e.debuff === 'freeze') start('frozen-target', { ms: e.ms });
    if (e.cleanse) bus.emit('status', { name: 'cleanse', on: true });
    const sm = statusMult() * (perks ? P.spell(perks) : 1) * teamMult();
    const hits = Combat.hitsFor(s, { recent }).map(h => {
      const d = D.spell(h.power, { acc: acc(), statusMult: sm, vsShield: e.vsShield || 1, shield });
      return { at: h.at, power: h.power, amount: d.amount, mult: d.mult };
    });
    const total = hits.reduce((a, h) => a + h.amount, 0);
    const st = after(combo.add(), 'cast');
    const out = { spell: s, hits, total, effect: e, pierce: !!e.pierce || pierce(), combo: st.combo };
    bus.emit('spellCast', out);
    return out;
  }

  function tick() {
    for (const k in statuses) status(k);
    if (offer && now() >= offer.until) closeOffer('time');
  }
  function reset() {
    combo.reset(); keys = []; recent = []; offer = null; earned = [];
    for (const k in statuses) end(k);
    statuses = {};
  }
  function state() {
    const c = combo.state();
    const list = Object.keys(statuses).map(status).filter(Boolean);
    return { ...c, acc: acc(), offer: offer && { ...offer, left: Math.max(0, offer.until - now()) }, statuses: list, mult: statusMult() };
  }

  return {
    bus, on: bus.on, off: bus.off,
    key, word, miss, hurt, cast, matchOffer, tick, reset, state,
    status, consume, statuses: () => Object.keys(statuses).map(status).filter(Boolean), start, end,
    // a paused fight moves its timed statuses and the open spell offer on, so a pause doesn't eat them
    shift(ms) { for (const k in statuses) if (statuses[k].until) statuses[k].until += ms; if (offer) offer.until += ms; },
    offer: () => offer && { ...offer, left: Math.max(0, offer.until - now()) },
    earned: () => earned.slice(),
    closeOffer,
    acc,
    tiers: combo.tiers,
    debug: {
      setCombo: n => after(combo.set(n), 'debug'),
      offer: ids => { offer = { combo: combo.state().combo, at: now(), until: now() + OFFER_MS, spells: ids }; bus.emit('spellOffer', { ...offer, spells: ids.map(Combat.spell) }); },
    },
  };
};
