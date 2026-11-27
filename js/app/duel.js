// #/duel: PvP typing duels. Both players type the same seeded words; every correct word
// fires a shot at the other side, combos power the shots up and spells land on the
// opponent. Best of 3 rounds. The match itself runs in the network layer (js/net/),
// which is the simulated server for now, so this page only sends keys and draws.
//
//   #/duel            the duel menu: modes, your record, players online, incoming challenges
//   #/duel/quick      a bot at your level
//   #/duel/art        Art's ghost at 204 wpm
//   #/duel/vs/<id>    challenge a player (simulated players answer for now)
//   #/duel/watch      two bots, for spectating
window.DuelPage = { events: ['pvp_win', 'pvp_match'] };
if (window.WPM) WPM.events.register(...DuelPage.events);

Router.register('duel', (() => {
  const e = s => UI.esc(s);
  let el = null, off = [], mode = 'menu', info = null, scene = null, raf = 0, keys = null, onDoc = null;
  let ty = null, lastState = null, fog = 0, endShown = false, waitC = null, incoming = null, incT = 0, ctl = null, noticeT = 0;
  let snd = null, phaseWas = '', countWas = 0, endT = 0;
  const SIDE_COL = [Theme.hex('accent'), '#f29d30'];

  function mount(root, params) {
    TT.useWeaponSound();
    el = root;
    off.push(Net.on('match', onMatch), Net.on('challenge', onChallenge), Net.on('presence', () => { if (mode === 'menu') paintOnline(); }));
    // the fighters' portraits are 3D avatars: start loading them now, so they're ready by the countdown
    if (window.Avatar) { Avatar.load(); Avatar.thumb(Avatar.mine(), 512, 512); }
    route(params || []);
  }
  function update(params) { stopFight(); route(params || []); }

  function route(p) {
    endShown = false;
    if (p[0] === 'quick') return start({ mode: 'quick' });
    if (p[0] === 'art') return start({ mode: 'art' });
    if (p[0] === 'watch') return start({ mode: 'watch' });
    if (p[0] === 'vs' && p[1]) return challenge(decodeURIComponent(p[1]));
    menu();
  }

  // ---------- menu ----------
  function menu() {
    mode = 'menu';
    el.innerHTML = `
      <div class="du-head">
        <div class="title-block"><h1><span class="pre">&gt;</span>Duel</h1><p>// PVP, BEST OF 3 ROUNDS</p></div>
        <a class="btn out" href="#/leaderboard/duel">Duel leaderboard</a>
      </div>
      <div class="du-menu">
        <div class="du-modes">
          <a class="panel du-mode" href="#/duel/quick"><span class="label">&gt; Quick match</span><h3>A bot near your MMR</h3><p>Picked within about 100 MMR of yours.</p></a>
          <a class="panel du-mode art" href="#/duel/art"><span class="label">&gt; Challenge Art</span><h3>Art's ghost, ${NetRating.ART} MMR</h3><p>His pace from the race ghost, with spells.</p></a>
          <a class="panel du-mode" href="#/duel/watch"><span class="label">&gt; Watch</span><h3>Two bots duel</h3><p>See how the accuracy rings and spells work before you play.</p></a>
        </div>
        <section class="panel du-rec" aria-label="Your duel record"><div class="ph">// YOUR RECORD<span class="meta">THIS DEVICE</span></div><div data-rec><div class="loading-state">Loading</div></div></section>
        <section class="panel du-inc" data-inc hidden aria-live="polite"></section>
        <section class="panel du-online" aria-label="Players online"><div class="ph">// ONLINE NOW<span class="meta">SIMULATED</span></div><ul class="mu-list" data-online></ul></section>
        <section class="panel du-rules" aria-label="How a duel works">
          <div class="ph">// HOW A DUEL WORKS</div>
          <ul class="du-rule-list">
            <li>You both type the same words. Every correct word fires a shot at the other side.</li>
            <li>Clean words build your combo and power up your shots. A typo drops it one tier.</li>
            <li>Spells come up at combo 6, 15, 25, 40 and 50. Type one in full to cast it.</li>
            <li>Each round starts at ${DuelRules.CONFIG.hp} HP. Drop the other side to 0 to win it. A round that runs ${DuelRules.CONFIG.roundMs / 1000} seconds goes to the side with more HP.</li>
            <li>Winning raises your MMR and losing lowers it. Beat someone above you and you gain more; lose to them and you drop less.</li>
            <li>Shop items are looks only and never change a duel.</li>
          </ul>
          <details class="du-spells"><summary>Spells in a duel</summary>
            <dl>${Combat.SPELLS().map(s => `<dt style="--sc:${s.color}">${e(s.word)}</dt><dd>${e((DuelRules.PVP[s.id] || {}).text || s.text)}</dd>`).join('')}</dl>
          </details>
        </section>
      </div>`;
    Net.connect().then(() => { paintRecord(); paintOnline(); }).catch(err => { const r = el && el.querySelector('[data-rec]'); if (r) r.innerHTML = `<p class="empty">${e(err.message)}</p>`; });
    // the simulated server sends a challenge from an online bot now and then while you wait here
    clearTimeout(incT);
    if (Net.isSim()) incT = setTimeout(() => { if (mode === 'menu' && !incoming) { const imp = Net._impl(); if (imp.challenges.incoming) imp.challenges.incoming(); } }, 25000 + Math.random() * 20000);
  }

  function paintRecord() {
    const box = el && el.querySelector('[data-rec]');
    if (!box) return;
    Net.results.record().then(r => {
      if (!box.isConnected) return;
      const t = NetRating.tier(r.rating);
      const last = r.history.slice(-4).reverse();
      box.innerHTML = `
        <div class="du-rating"><b class="big">${r.rating}</b><span class="label">MMR</span><span class="mu-tier ${t.id}">${t.name}</span></div>
        <dl class="kv">
          <dt>Wins</dt><dd>${r.wins}</dd><dt>Losses</dt><dd>${r.losses}</dd>
          <dt>Best streak</dt><dd>${r.bestStreak}</dd><dt>Vs Art</dt><dd>${r.vsArt.w} won, ${r.vsArt.l} lost</dd>
        </dl>
        ${last.length ? `<ol class="du-last">${last.map(h => `<li class="${h.score === 1 ? 'w' : h.score === 0 ? 'l' : ''}"><span>${h.score === 1 ? 'Won' : h.score === 0 ? 'Lost' : 'Draw'}</span> vs <a href="${MultiUI.link(h.opp)}">${e(h.opp.name)}</a>${h.opp.bot && !h.opp.art ? ' <span class="mu-tag bot">Bot</span>' : ''}<em>${h.delta > 0 ? '+' : ''}${h.delta}</em></li>`).join('')}</ol>` : '<p class="dim">No duels yet.</p>'}`;
    });
  }

  function paintOnline() {
    const ul = el && el.querySelector('[data-online]');
    if (!ul) return;
    const list = Net.presence().slice(0, 10);
    const ST = { idle: 'Online', duel: 'In a duel', run: 'In a party run', typing: 'Typing test' };
    ul.innerHTML = list.map(p => `<li>
      <a class="mu-who" href="${MultiUI.link(p)}">${MultiUI.img(p, 68, 34)}<span>${MultiUI.name(p)}</span></a>
      <span class="mu-st ${p.status}">${ST[p.status] || ''}</span><span class="num dim">${p.rating} MMR</span>
      <a class="btn out sm" href="#/duel/vs/${encodeURIComponent(p.id)}"${p.status === 'idle' ? '' : ' aria-disabled="true" tabindex="-1"'}>Challenge</a></li>`).join('');
  }

  function onChallenge(c) {
    if (!el) return;
    if (c.to === 'me' && c.status === 'pending' && mode === 'menu') { incoming = c; paintIncoming(); return; }
    if (incoming && c.id === incoming.id && c.status !== 'pending') { incoming = null; paintIncoming(); }
    if (waitC && c.id === waitC.id) {
      if (c.status === 'accepted') start({ mode: c.to === 'art' ? 'art' : 'player', opponent: c.to, challenge: c.id });
      if (c.status === 'declined' || c.status === 'expired') {
        const box = el.querySelector('[data-wait]');
        if (box) box.innerHTML = `<p>${e(c.toName)} is busy right now.</p><div class="row"><a class="btn" href="#/duel/quick">Quick match</a><a class="btn out" href="#/duel">Back to duels</a></div>`;
        waitC = null;
      }
    }
  }
  function paintIncoming() {
    const box = el && el.querySelector('[data-inc]');
    if (!box) return;
    if (!incoming) { box.hidden = true; return; }
    const p = { id: incoming.from, name: incoming.fromName, bot: incoming.fromBot };
    box.hidden = false;
    box.innerHTML = `<div class="ph">// CHALLENGE</div>
      <p class="du-inc-who"><a class="mu-who" href="${MultiUI.link(p)}">${MultiUI.img(p, 68, 34)}<span>${MultiUI.name(p)}</span></a> challenged you to a duel.</p>
      <div class="row"><button class="btn" type="button" data-acc>Accept</button><button class="btn out" type="button" data-dec>Decline</button></div>`;
    box.querySelector('[data-acc]').addEventListener('click', () => {
      const c = incoming; incoming = null;
      Net.challenges.accept(c.id).then(() => start({ mode: 'player', opponent: c.from, challenge: c.id })).catch(err => Toast && Toast('t-err', e(err.message)));
    });
    box.querySelector('[data-dec]').addEventListener('click', () => { const c = incoming; incoming = null; paintIncoming(); Net.challenges.decline(c.id).catch(() => {}); });
  }

  // ---------- a challenge sent from a profile or the online list ----------
  function challenge(id) {
    mode = 'wait';
    el.innerHTML = `<div class="du-wait panel" data-wait><div class="loading-state">Sending the challenge</div></div>`;
    Net.challenges.send(id).then(c => {
      waitC = c;
      const box = el && el.querySelector('[data-wait]');
      if (!box || waitC !== c) return;
      const p = { id: c.to, name: c.toName, bot: c.toBot, art: c.to === 'art' };
      if (c.status !== 'pending') return;
      box.innerHTML = `<div class="du-wait-who">${MultiUI.img(p, 160, 80)}<div><h2>${MultiUI.name(p)}</h2><p class="dim">Waiting for an answer.</p></div></div>
        <div class="row"><button class="btn out" type="button" data-cancel>Cancel</button></div>`;
      box.querySelector('[data-cancel]').addEventListener('click', () => { waitC = null; location.hash = '#/duel'; });
    }).catch(err => { if (el) el.innerHTML = `<div class="panel du-wait"><p>${e(err.message)}</p><a class="btn out" href="#/duel">Back to duels</a></div>`; });
  }

  // ---------- searching ----------
  function start(o) {
    mode = 'search'; waitC = null; incoming = null; clearTimeout(incT);
    const label = o.mode === 'art' ? 'Loading Art\'s ghost' : o.mode === 'watch' ? 'Finding two bots' : o.mode === 'player' ? 'Starting the duel' : 'Finding a bot at your level';
    el.innerHTML = `<div class="du-wait panel"><div class="loading-state">${label}</div><a class="btn out" href="#/duel">Cancel</a></div>`;
    const want = o;
    Net.match.queue(o).then(i => { if (mode === 'search' && want === o) fight(i); }).catch(err => { if (el) el.innerHTML = `<div class="panel du-wait"><p>${e(err.message)}</p><a class="btn out" href="#/duel">Back to duels</a></div>`; });
  }

  // ---------- the fight ----------
  function fight(i) {
    mode = 'fight'; info = i; endShown = false; fog = 0;
    const P = info.players, me = info.you;
    const L = 0, R = 1;
    const side = (k, cls) => {
      const p = P[k];
      return `<div class="du-side ${cls}">
        <div class="du-id"><a class="mu-who" href="${MultiUI.link(p)}" ${me >= 0 ? 'tabindex="-1"' : ''}>${MultiUI.img(p, 68, 34)}<span>${MultiUI.name(p)}</span></a><span class="num dim">${p.art ? NetRating.ART : p.rating} MMR</span></div>
        <div class="du-hp" data-hp="${k}"><i></i><b class="num">${DuelRules.CONFIG.hp}</b></div>
        <div class="du-pips" data-pips="${k}" aria-label="Rounds won"><i></i><i></i></div>
      </div>`;
    };
    el.innerHTML = `
      <div class="du" data-mode="${info.mode}">
        <header class="du-top">
          ${side(L, 'l')}
          <div class="du-mid"><span class="label" data-round>Round 1</span><b class="num" data-clock>0:00</b></div>
          ${side(R, 'r')}
        </header>
        <section class="du-stage" data-stage aria-label="Arena">
          <div class="du-nums" data-nums aria-hidden="true"></div>
          <div class="du-acc l" data-acc="0">${MultiUI.ring(100, { color: SIDE_COL[0] })}<span><b class="num" data-combo="0">0</b> combo</span></div>
          <div class="du-acc r" data-acc="1">${MultiUI.ring(100, { color: P[1].art ? '#3ee6ff' : SIDE_COL[1] })}<span><b class="num" data-combo="1">0</b> combo</span></div>
          <div class="du-flags l" data-flags="0"></div><div class="du-flags r" data-flags="1"></div>
          <div class="du-opp" data-opp aria-hidden="true"></div>
          <div class="du-banner" data-banner aria-live="polite"></div>
          <div class="du-load" data-load role="status">
            <p class="label" data-load-t>Loading the arena</p>
            <ul>${[0, 1].map(k => `<li data-rd="${k}"><span>${MultiUI.name(P[k])}</span><em>Loading</em></li>`).join('')}</ul>
            ${info.stakes ? `<p class="du-stakes"><span>Win <b class="green">${sign(info.stakes.win)}</b> MMR</span><span>Lose <b class="red">${sign(info.stakes.loss)}</b> MMR</span></p>` : ''}
          </div>
        </section>
        <section class="du-type" aria-label="${me >= 0 ? 'Your words' : 'Words'}">
          <div class="du-chips" data-chips></div>
          <div class="typebox du-words" data-box tabindex="-1">
            <div class="du-line" data-line></div>
            ${me >= 0 ? '<div class="focus-note"><span class="fn-key">Click here or press any key to type</span><span class="fn-tap">Tap here to type</span></div>' : ''}
            <div class="du-lock" data-lock hidden></div>
          </div>
        </section>
        <div class="du-strip">
          <span><b class="num" data-s="wpm">0</b> wpm</span><span><b class="num" data-s="acc">100%</b> accuracy</span>
          <span><b class="num" data-s="dmg">0</b> damage</span><span><b class="num" data-s="best">0</b> best combo</span>
          <button class="btn out sm" type="button" data-leave>${me >= 0 ? 'Leave duel' : 'Stop watching'}</button>
        </div>
        <p class="du-note">${P.some(p => p.bot && !p.art) ? 'Bots are simulated players until the server is live.' : 'Art is a ghost on his race pace until his live matches are on the server.'}</p>
        <div class="du-end" data-end hidden></div>
      </div>`;
    const stage = el.querySelector('[data-stage]');
    UI.play('duel', true);
    // each side's operator: yours from the Character Lab, everyone else's seeded from their name
    const preset = k => (!window.Operator ? null : k === me ? Operator.mine() : Operator.random(P[k].art ? 'art' : P[k].name || P[k].id));
    // the arena's sounds: hits, blocks, the bell, the crowd (js/app/arena-audio.js)
    snd = window.ArenaAudio ? ArenaAudio.create() : null;
    phaseWas = ''; countWas = 0;
    scene = DuelScene.mount(stage, { me, audio: snd, sides: [0, 1].map(k => ({ look: MultiUI.look(P[k]), color: P[k].art ? '#3ee6ff' : SIDE_COL[k], preset: preset(k), name: P[k].name })) });
    window._duel = { scene: () => scene };   // tests
    // load and play every effect once behind the cover, then tell the server this side is ready.
    // The countdown starts only when both sides are; a stuck load gives up after 12 seconds.
    const chars = [...new Set(info.words.flat().join('') + Combat.SPELLS().map(x => x.word).join(''))].join('');
    const at = info;
    Promise.race([scene.warm(chars), new Promise(r => setTimeout(r, 12000))]).then(() => { if (info === at && mode === 'fight') Net.match.ready(); });
    el.querySelector('[data-leave]').addEventListener('click', () => { Net.match.leave(); if (me < 0) location.hash = '#/duel'; });
    lastState = info.state;
    if (me >= 0) {
      const words = r => (info.words[r] && info.words[r].length ? info.words[r] : info.words[1]);
      ty = NetTypist.create({ stream: () => { const s = lastState && lastState.sides[me]; const list = words(lastState ? lastState.round : 1); return list[(s ? s.idx : 0) % list.length] || ''; }, extras: () => offerTargets(me) });
      const box = el.querySelector('[data-box]');
      keys = TT.captureKeys(box, {
        label: 'Type the words to attack',
        onChar: ch => key(ch),
        onBack: whole => key(whole ? 'CtrlBackspace' : 'Backspace'),
        onKey: k => { if (k === 'Escape') keys.el.blur(); },
      });
      onDoc = ev => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.length !== 1) return;
        const a = document.activeElement;
        if (a && a !== document.body && a.id !== 'view' && a !== keys.el) return;
        if (a === keys.el) return;
        ev.preventDefault(); keys.focus(); key(ev.key);
      };
      document.addEventListener('keydown', onDoc);
      setTimeout(() => keys && keys.focus(), 60);
    }
    paint();
    loop();
  }

  function offerTargets(i) {
    const s = lastState && lastState.sides[i];
    if (!s || !s.offer) return [];
    return s.offer.map(id => ({ id: 'spell:' + id, word: Combat.spell(id).word, kind: 'spell', spell: id }));
  }

  function key(k) {
    if (mode !== 'fight' || !info || info.you < 0) return;
    const st = lastState;
    if (!st || st.phase !== 'fight') return;
    if (st.sides[info.you].locked > 0) { flashLock(); return; }
    const t = Net.match.clock();
    Net.match.input(k, t);
    const r = ty.key(k, t);
    if (r && r.submit && r.submit.kind === 'stream') fog = Math.max(0, fog - 1);
    if (r && r.key) TT.click(false);
    // the simulated server answers at once; a real one sends the state back a moment later
    const cur = Net.match.current();
    if (cur && cur.state) lastState = cur.state;
    paintWords();
  }
  function flashLock() {
    const b = el.querySelector('[data-lock]');
    if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }

  // ---------- network events ----------
  function onMatch(m) {
    if (!el || !info || m.id !== info.id) return;
    if (m.type === 'state') { lastState = m.state; return; }
    if (m.type === 'event') return event(m.ev);
    if (m.type === 'end') return end(m);
  }

  function screenOf(k) { const o = scene && scene.screen(k, {}); return o || { x: k ? el.clientWidth * 0.7 : el.clientWidth * 0.3, y: 120 }; }
  function num(k, text, cls) { const p = screenOf(k); MultiUI.pop(el.querySelector('[data-nums]'), p.x, p.y, text, cls); }

  function event(ev) {
    const me = info.you;
    switch (ev.type) {
      case 'shot': scene.shot(ev.side, ev.tier, null, { color: info.players[ev.side].art ? '#3ee6ff' : SIDE_COL[ev.side], word: ev.word, crit: ev.crit, combo: ev.combo, ms: ev.landAt - Net.match.clock() }); break;
      case 'hit': {
        num(ev.to, (ev.crit ? 'Crit ' : '') + ev.dmg, `${ev.to === me ? 'in' : 'out'}${ev.kind === 'spell' ? ' spell' : ''}${ev.crit ? ' crit' : ''}`);
        if (ev.kind === 'dot') scene.react(ev.to, 'poisonTick');
        else if (ev.kind !== 'word') scene.react(ev.to, 'hit', 0.5);
        hpTo(ev.to, ev.hp);
        break;
      }
      case 'cast': {
        const now = Net.match.clock();
        scene.cast(ev.side, ev.spell, ev.hits.map(h => ({ at: performance.now() + (h.at - now), dmg: h.dmg })), Combat.spell(ev.spell).effect);
        banner(`${MultiUI.spellName(ev.spell)}`, ev.side === me || (me < 0 && ev.side === 0) ? 'spell mine' : 'spell theirs', 1200);
        if (ev.side === me) WPM.track('spell_cast', { spell: ev.spell, mode: 'duel' });
        if (ev.blocked) num(ev.to, 'Blocked', 'block');
        if (ev.broke) num(ev.to, 'Shield broken', 'block');
        break;
      }
      case 'block': scene.react(ev.side, 'block'); num(ev.side, 'Blocked', 'block'); break;
      case 'typo': scene.react(ev.side, 'typo'); ringFlash(ev.side); break;
      case 'miss': num(ev.side, 'Miss', 'miss'); ringFlash(ev.side); break;
      case 'fizzle': num(ev.side, 'Fizzled', 'miss'); break;
      case 'locked': if (ev.side === me) flashLock(); break;
      case 'effect': effect(ev); break;
      case 'status': if (['ward', 'hyper', 'root', 'split'].includes(ev.name)) scene.aura(ev.side, ev.name, ev.on); break;
      case 'round': round(ev); break;
      case 'combo': if (ev.side === me && ev.combo && ev.combo % 5 === 0 && ev.combo > ev.from) WPM.track('combo', { n: ev.combo, mode: 'duel' });
        if (ev.side === me && ev.tier > 0 && ev.combo > ev.from && Combat.TIERS[ev.tier].at === ev.combo) { banner(Combat.TIERS[ev.tier].name, 'tier', 900); if (snd) snd.combat('tierUp', ev.tier); }
        if (ev.side === me && ev.combo < ev.from && ev.from >= 5 && snd) snd.combat('break'); break;
      default: break;
    }
  }

  function effect(ev) {
    const me = info.you;
    if (ev.resisted) { num(ev.side, 'Resisted', 'block'); return; }
    if (ev.name === 'fog') { scene.react(ev.side, 'fog'); if (ev.side === me) fog = ev.n; num(ev.side, 'Blurred', 'debuff'); }
    if (ev.name === 'locked') { scene.react(ev.side, 'stun', ev.ms); num(ev.side, 'Locked', 'debuff'); }
    if (ev.name === 'frozen') { scene.react(ev.side, 'freeze', ev.ms); num(ev.side, 'Frozen', 'debuff'); }
    if (ev.name === 'corrupt') { scene.react(ev.side, 'poison', ev.ms); num(ev.side, 'Corrupted', 'debuff'); }
    if (ev.name === 'dispel') num(ev.side, 'Buffs removed', 'debuff');
    if (ev.name === 'cleanse') { if (ev.side === me) fog = 0; scene.react(ev.side, 'cleanse'); num(ev.side, 'Cleansed', 'buff'); }
    if (ev.name === 'heal') { scene.react(ev.side, 'cleanse'); num(ev.side, `+${ev.amount} HP`, 'buff'); }
    if (ev.name === 'reflect') num(ev.side, 'Reflecting', 'buff');
    if (ev.name === 'shieldBroken') num(ev.side, 'Shield broken', 'debuff');
  }

  function round(ev) {
    if (ev.phase === 'start') {
      UI.play('duel', true);
      scene.revive();
      if (ty) ty.reset();
      fog = 0;
      banner(`Round ${ev.round}`, 'round', 1400);
      hpTo(0, DuelRules.CONFIG.hp); hpTo(1, DuelRules.CONFIG.hp);
    } else {
      const P = info.players;
      if (ev.winner >= 0) { scene.ko(1 - ev.winner); banner(ev.winner === info.you ? 'You take the round' : `${P[ev.winner].name} takes the round`, ev.winner === info.you ? 'won' : 'lost', 2600); }
      else banner('Drawn round', 'round', 2400);
      paintPips(ev.wins);
    }
  }

  function hpTo(k, hp) {
    const bar = el.querySelector(`[data-hp="${k}"]`);
    if (!bar) return;
    const max = (info.config && info.config.hp) || DuelRules.CONFIG.hp;
    const f = Math.max(0, Math.min(1, hp / max));
    bar.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
    bar.querySelector('b').textContent = Math.max(0, Math.round(hp));
    bar.classList.toggle('low', f < 0.3);
    if (scene) scene.setHp(k, f);
  }
  function paintPips(wins) { [0, 1].forEach(k => el.querySelectorAll(`[data-pips="${k}"] i`).forEach((p, n) => p.classList.toggle('on', n < wins[k]))); }
  function ringFlash(k) { const a = el.querySelector(`[data-acc="${k}"]`); if (a) { a.classList.remove('slip'); void a.offsetWidth; a.classList.add('slip'); } }
  let bannerT = 0;
  function banner(text, cls, ms) {
    const b = el && el.querySelector('[data-banner]');
    if (!b) return;
    b.className = 'du-banner on ' + cls; b.textContent = text;
    clearTimeout(bannerT); bannerT = setTimeout(() => { if (b.isConnected) b.className = 'du-banner'; }, ms);
  }

  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

  // ---------- drawing ----------
  // rewriting the same markup 16 times a second makes the browser restyle it every time
  const put = (node, html) => { if (node && node._html !== html) { node._html = html; node.innerHTML = html; } };
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => { raf = requestAnimationFrame(tick); if (mode === 'fight') paint(); };
    raf = requestAnimationFrame(tick);
  }
  let lastPaint = 0;
  function paint() {
    const now = performance.now();
    if (now - lastPaint < 60) return;
    lastPaint = now;
    const cur = Net.match.current();
    if (cur && cur.info && info && cur.info.id === info.id) lastState = cur.state;
    const st = lastState;
    if (!st || !el) return;
    const cover = el.querySelector('[data-load]');
    if (cover) {
      if (st.phase !== 'load') cover.remove();
      else {
        const rd = st.ready || [false, false];
        rd.forEach((r, k) => { const li = cover.querySelector(`[data-rd="${k}"]`); li.classList.toggle('ok', !!r); li.querySelector('em').textContent = r ? 'Ready' : 'Loading'; });
        const me = info.you;
        cover.querySelector('[data-load-t]').textContent = me >= 0 && rd[me] && !rd[1 - me] ? `Waiting for ${info.players[1 - me].name}` : 'Loading the arena';
        el.querySelector('[data-round]').textContent = 'Loading';
        return;
      }
    }
    if (st.phase !== phaseWas) {
      phaseWas = st.phase;
      if (scene) scene.phase(st.phase, Math.max(1, st.phase === 'fight' ? st.round : (st.round || 0) + 1));
      if (snd && st.phase !== 'over') snd.crowd(true, st.phase === 'fight' ? 1 : 0.8);
    }
    const clockEl = el.querySelector('[data-clock]');
    const t = st.phase === 'fight' ? st.roundMs - (st.clock - st.roundAt) : st.phase === 'count' ? (st.roundAt || 0) - st.clock : st.phase === 'break' ? st.breakUntil - st.clock : 0;
    clockEl.textContent = UI.clock ? UI.clock(Math.max(0, Math.ceil(t / 1000))) : String(Math.ceil(t / 1000));
    el.querySelector('[data-round]').textContent = st.phase === 'count' ? 'Get ready' : st.phase === 'break' ? 'Next round in' : `Round ${Math.max(1, st.round)}`;
    if (st.phase === 'count' || st.phase === 'break') {
      const s = (((st.phase === 'count' ? st.roundAt : st.breakUntil) || 0) - st.clock) / 1000;
      const n = Math.ceil(s);
      if (st.phase === 'count' && n > 0) banner(String(n), 'count', 1100);
      if (n > 0 && n <= 3 && n !== countWas && snd) snd.play('tick');
      if (st.phase === 'break' && s < 1.7 && scene) scene.rise();
      countWas = n;
    }
    st.sides.forEach((s, k) => {
      hpTo(k, s.hp);
      const a = el.querySelector(`[data-acc="${k}"]`);
      MultiUI.setRing(a.querySelector('svg'), s.acc);
      a.querySelector('[data-combo]').textContent = s.combo;
      a.dataset.t = s.tier;
      const flags = [];
      for (const x of s.statuses || []) {
        if (x.name === 'ward') flags.push(['buff', 'Shield']);
        if (x.name === 'hyper') flags.push(['buff', 'Hyper x1.5']);
        if (x.name === 'root') flags.push(['buff', 'Root access']);
        if (x.name === 'split') flags.push(['buff', `Split ${x.charges}`]);
        if (x.name === 'crits') flags.push(['buff', `Crits ${x.charges}`]);
      }
      if (s.reflect > 0) flags.push(['buff', 'Reflect']);
      if (s.immune > 0) flags.push(['buff', 'Immune']);
      if (s.locked > 0) flags.push(['debuff', `Locked ${(s.locked / 1000).toFixed(1)}s`]);
      if (s.frozen > 0) flags.push(['debuff', 'Frozen, half damage']);
      if (s.fog > 0) flags.push(['debuff', `Blurred ${s.fog}`]);
      put(el.querySelector(`[data-flags="${k}"]`), flags.map(([c, x]) => `<span class="mu-flag ${c}">${x}</span>`).join(''));
    });
    const me = info.you >= 0 ? info.you : 0;
    const mine = st.sides[me];
    el.querySelector('[data-s="wpm"]').textContent = mine.liveWpm || 0;
    el.querySelector('[data-s="acc"]').textContent = (mine.acc != null ? Math.round(mine.acc) : 100) + '%';
    el.querySelector('[data-s="dmg"]').textContent = UI.fmt((mine.stats || {}).dmg || 0);
    el.querySelector('[data-s="best"]').textContent = (mine.stats || {}).bestCombo || 0;
    const lock = el.querySelector('[data-lock]');
    if (lock) { lock.hidden = !(mine.locked > 0); if (mine.locked > 0) lock.textContent = `Keys locked ${(mine.locked / 1000).toFixed(1)}s`; }
    paintWords();
    paintOpp();
    paintChips();
  }

  // the words as a block of lines, Monkeytype style (js/app/wordflow.js), as in the World Boss:
  // typed words stay on their line and the next ones wait after the current word
  let flow = null, flowIdx = -1, flowRound = -1, flowLine = null;
  function paintWords() {
    const st = lastState, line = el && el.querySelector('[data-line]');
    if (!st || !line) return;
    if (window.WordFlow) { paintFlow(st, line); return; }
    const k = info.you >= 0 ? info.you : 0;
    const s = st.sides[k];
    const list = info.words[Math.max(1, st.round)] || info.words[1];
    const typed = info.you >= 0 && ty ? ty.state().typed : s.typed || '';
    const target = info.you >= 0 && ty ? ty.state().target : s.target;
    const fogN = info.you >= 0 ? Math.max(fog, s.fog || 0) : s.fog || 0;
    const onSpell = target && target.kind === 'spell';
    const curW = list[s.idx % list.length] || '';
    const word = (w, n) => {
      const cls = n === 0 ? 'cur' : 'next';
      const blur = n < fogN ? ' fog' : '';
      if (n === 0 && !onSpell) return `<span class="du-w ${cls}${blur}">${letters(w, typed)}</span>`;
      return `<span class="du-w ${cls}${blur}">${e(w)}</span>`;
    };
    const next = [];
    for (let n = 0; n < 4; n++) next.push(list[(s.idx + n) % list.length] || '');   // the word you are on and three to read ahead
    put(line, `<div class="du-cur">${onSpell ? `<span class="du-w cur spell">${letters(target.word, typed)}</span>` : word(curW, 0)}</div><div class="du-next">${next.slice(1).map((w, n) => word(w, n + 1)).join('')}</div>`);
    line.classList.toggle('locked', s.locked > 0);
  }
  function paintFlow(st, line) {
    const k = info.you >= 0 ? info.you : 0;
    const s = st.sides[k];
    const list = info.words[Math.max(1, st.round)] || info.words[1];
    const typed = info.you >= 0 && ty ? ty.state().typed : s.typed || '';
    const target = info.you >= 0 && ty ? ty.state().target : s.target;
    const fogN = info.you >= 0 ? Math.max(fog, s.fog || 0) : s.fog || 0;
    const onSpell = target && target.kind === 'spell';
    if (!flow || flowLine !== line) { flow = WordFlow.create(line, { lines: 3 }); flowLine = line; flowIdx = -1; }
    // a new round brings new words; joining late starts the block at the word you're on
    if (flowRound !== st.round || flowIdx < 0 || s.idx < flowIdx) { flow.clear(); flowRound = st.round; flowIdx = s.idx; }
    while (flowIdx < s.idx) { const w = list[flowIdx % list.length] || ''; flow.push(w, w, true); flowIdx++; }
    const next = [];
    for (let n = 1; n < 50; n++) next.push(list[(s.idx + n) % list.length] || '');
    // while a spell word is being typed, the stack waits dimmed and the spell's chip shows the letters
    flow.render({ cur: list[s.idx % list.length] || '', typed: onSpell ? '' : typed, mine: !onSpell, next, fog: fogN });
    line.classList.toggle('locked', s.locked > 0);
  }
  function letters(w, typed) {
    let out = '';
    for (let i = 0; i < Math.max(w.length, typed.length); i++) {
      const c = w[i], t = typed[i];
      if (t == null) out += `<i class="${i === typed.length ? 'at' : ''}">${e(c === ' ' ? ' ' : c)}</i>`;
      else if (t === c) out += `<i class="ok">${e(c === ' ' ? ' ' : c)}</i>`;
      else out += `<i class="bad">${e(c ? (c === ' ' ? ' ' : c) : t)}</i>`;
    }
    return out + (typed.length >= w.length ? '<i class="caret"> </i>' : '');
  }
  function paintOpp() {
    const st = lastState, box = el && el.querySelector('[data-opp]');
    if (!st || !box) return;
    const k = info.you >= 0 ? 1 - info.you : 1;
    const s = st.sides[k];
    const list = info.words[Math.max(1, st.round)] || info.words[1];
    const w = s.target && s.target.kind === 'spell' ? s.target.word : list[s.idx % list.length] || '';
    put(box, `<span class="label">${e(info.players[k].name)} is typing</span><span class="du-ow">${letters(w, s.typed || '')}</span>`);
  }
  function paintChips() {
    const st = lastState, box = el && el.querySelector('[data-chips]');
    if (!st || !box) return;
    const k = info.you >= 0 ? info.you : 0;
    const s = st.sides[k];
    const typed = info.you >= 0 && ty ? ty.state().typed : s.typed || '';
    const left = s.offerUntil ? Math.max(0, (s.offerUntil - st.clock) / 1000) : 0;
    const key = (s.offer || []).join() + '|' + typed + '|' + Math.ceil(left);
    if (box.dataset.k === key) return;
    box.dataset.k = key;
    box.innerHTML = (s.offer || []).map(id => {
      const sp = Combat.spell(id), on = typed && sp.word.startsWith(typed);
      return `<span class="mu-chip r${sp.rarity}${on ? ' on' : ''}" style="--sc:${sp.color}"><small>${e(Combat.RARITY[sp.rarity].name)}</small><b>${on ? letters(sp.word, typed) : e(sp.word)}</b><em>${e(DuelRules.PVP[id] ? shortFx(id) : sp.label)}</em></span>`;
    }).join('') + (s.offer && s.offer.length ? `<span class="mu-chip-t num">${Math.ceil(left)}s</span>` : '');
  }
  const SHORT = { 'data-spike': '27 dmg', 'safe-mode': 'Blocks 1', 'binary-rain': 'Heals 30', 'echo-pulse': 'Repeats 8', 'glitch-blade': 'Breaks shields', 'cryo-lock': 'Half damage 4s',
    'electro-storm': '35 dmg', 'hyper-thread': 'x1.5 for 6s', 'packet-storm': 'Reflects', 'neon-nova': 'Removes buffs', 'system-purge': 'Cleanse', 'void-sphere': '88 dmg',
    'kernel-panic': 'Locks keys', 'root-access': 'Pierce x1.5', 'quantum-split': 'Saves combo', 'zero-day': '250 dmg' };
  const shortFx = id => SHORT[id] || '';

  // ---------- the end ----------
  function end(m) {
    if (endShown) return;
    endShown = true;
    UI.play('duel', false);
    const r = m.result || {};
    const me = info.you, P = info.players;
    if (r.cancelled) {
      const box = el.querySelector('[data-end]');
      if (r.reason === 'left') { location.hash = '#/duel'; return; }
      if (!box) return;
      box.hidden = false;
      box.innerHTML = `<div class="panel hot du-end-card" role="dialog" aria-labelledby="du-end-t"><h2 id="du-end-t">Duel cancelled</h2>
        <p class="dim">The arena didn't load on ${me >= 0 && (lastState && lastState.ready && lastState.ready[me]) ? e(P[1 - me].name) + "'s side" : 'this device'}. Nobody's MMR changed.</p>
        <div class="row"><a class="btn" href="#/duel">Back to duels</a></div></div>`;
      return;
    }
    const won = me >= 0 && r.winner === me, lost = me >= 0 && r.winner === 1 - me;
    if (scene && r.forfeit == null) scene.result(r.winner);
    let reward = null;
    if (me >= 0) {
      const s = (r.sides && r.sides[me]) || {};
      if (s.keys) {
        const accF = Math.max(0, ((s.acc || 0) - 50) / 50);
        reward = WPM.record({ mode: info.mode === 'art' ? 'duel-art' : 'duel', wpm: s.wpm || 0, acc: s.acc || 0, correct: s.chars || 0, keys: s.keys || 0, ms: s.ms || 0, won,
          coins: Math.round((s.chars || 0) / 10 * accF) + (won ? 40 : 10) });
      }
      WPM.track('pvp_match', { mode: info.mode, won, opp: P[1 - me].id, art: !!P[1 - me].art, wpm: s.wpm || 0, acc: s.acc || 0, rating: m.rating ? m.rating.after : null });
      if (won) WPM.track('pvp_win', { mode: info.mode, opp: P[1 - me].id, art: !!P[1 - me].art });
    }
    // the KO and the winner's moment play out first (the camera circles the winner), then the card
    const show = () => paintEnd(m, r, won, lost, reward);
    clearTimeout(endT);
    if (r.forfeit != null || matchMedia('(prefers-reduced-motion: reduce)').matches) show(); else endT = setTimeout(show, 3600);
  }
  function paintEnd(m, r, won, lost, reward) {
    if (!el || !info) return;
    if (snd) snd.crowd(false);
    const me = info.you, P = info.players;
    const box = el.querySelector('[data-end]');
    if (!box) return;
    const title = r.forfeit != null ? (r.forfeit === me ? 'You left the duel' : `${P[r.forfeit].name} left the duel`)
      : me < 0 ? (r.winner >= 0 ? `${P[r.winner].name} wins ${r.wins[r.winner]}-${r.wins[1 - r.winner]}` : 'Draw')
        : won ? `You won ${r.wins[me]}-${r.wins[1 - me]}` : lost ? `${P[1 - me].name} won ${r.wins[1 - me]}-${r.wins[me]}` : 'Draw';
    const rt = m.rating;
    const sides = r.sides || [{}, {}];
    const row = (label, f) => `<tr><th scope="row">${label}</th>${[0, 1].map(k => `<td class="num">${f(sides[k] || {}, k)}</td>`).join('')}</tr>`;
    const spells = s => (s.spells && s.spells.length ? s.spells.map(MultiUI.spellName).map(e).join(', ') : 'None');
    box.hidden = false;
    box.innerHTML = `<div class="panel hot du-end-card" role="dialog" aria-labelledby="du-end-t">
      <h2 id="du-end-t" class="${won ? 'green' : lost ? 'red' : ''}">${e(title)}</h2>
      ${rt ? `<p class="du-end-rt"><span class="label">MMR</span><b class="num">${rt.after}</b><em class="${rt.delta >= 0 ? 'green' : 'red'}">${rt.delta >= 0 ? '+' : ''}${rt.delta}</em></p>` : ''}
      ${reward ? `<p class="dim">You earned ${reward.coins} coins and ${reward.xp} XP.</p>` : ''}
      ${r.rounds && r.rounds.length ? `<div class="du-tw"><table class="du-sum">
        <thead><tr><th></th>${[0, 1].map(k => `<th scope="col">${MultiUI.name(P[k])}</th>`).join('')}</tr></thead>
        <tbody>
          ${row('wpm', s => s.wpm || 0)}${row('Accuracy', s => (s.acc != null ? s.acc : 0) + '%')}${row('Best combo', s => s.bestCombo || 0)}
          ${row('Damage', s => UI.fmt(s.dmg))}${row('Damage taken', s => UI.fmt(s.taken))}${row('Blocks', s => s.blocks || 0)}
          ${row('Typos', s => (s.typos || 0) + (s.wrong || 0))}<tr><th scope="row">Spells</th>${[0, 1].map(k => `<td class="sp">${spells(sides[k] || {})}</td>`).join('')}</tr>
        </tbody></table></div>
      <div class="du-tw"><table class="du-rounds">
        <thead><tr><th scope="col">Round</th><th scope="col">Winner</th><th scope="col">Time</th>${[0, 1].map(k => `<th scope="col" class="r">${e(P[k].name)}</th>`).join('')}</tr></thead>
        <tbody>${r.rounds.map(x => `<tr><td class="num">${x.round}</td><td>${x.winner >= 0 ? e(x.winner === me ? 'You' : P[x.winner].name) : 'Draw'}</td><td class="num">${UI.clock ? UI.clock(Math.round(x.ms / 1000)) : Math.round(x.ms / 1000) + ' s'}</td>
          ${[0, 1].map(k => `<td class="num r">${x.sides[k].dmg} dmg, ${x.sides[k].wpm} wpm, ${x.sides[k].acc}%</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>` : ''}
      <div class="row">
        ${me >= 0 ? `<a class="btn" href="#/duel/${info.mode === 'art' ? 'art' : info.mode === 'player' ? 'vs/' + encodeURIComponent(P[1 - me].id) : 'quick'}" data-again>${info.mode === 'art' ? 'Challenge Art again' : info.mode === 'player' ? 'Rematch' : 'Next match'}</a>` : '<a class="btn" href="#/duel/watch" data-again>Watch another</a>'}
        <a class="btn out" href="#/duel">Back to duels</a>
        ${me >= 0 && !P[1 - me].art ? `<a class="btn out" href="${MultiUI.link(P[1 - me])}">${e(P[1 - me].name)}'s profile</a>` : ''}
      </div>
    </div>`;
    const again = box.querySelector('[data-again]');
    // the same hash again does not fire hashchange, so route by hand
    if (again) again.addEventListener('click', ev => { if (location.hash === again.getAttribute('href')) { ev.preventDefault(); update(location.hash.replace(/^#\/duel\/?/, '').split('/')); } });
    // focus the heading rather than a button, so a player still typing can't press Space on "Next match"
    const h = box.querySelector('h2'); h.tabIndex = -1; h.focus({ preventScroll: true });
  }

  // ---------- leaving ----------
  function stopFight() {
    UI.play('duel', false);
    cancelAnimationFrame(raf); raf = 0;
    if (mode === 'fight' && !endShown) Net.match.leave();
    if (scene) { scene.dispose(); scene = null; }
    if (snd) { snd.dispose(); snd = null; }
    if (onDoc) { document.removeEventListener('keydown', onDoc); onDoc = null; }
    keys = null; ty = null; info = null; lastState = null; waitC = null;
    clearTimeout(incT); clearTimeout(bannerT); clearTimeout(endT);
  }
  function unmount() {
    stopFight();
    off.forEach(f => f()); off = [];
    el = null; mode = 'menu';
  }

  return { title: 'Duel', mount, update, unmount };
})());
