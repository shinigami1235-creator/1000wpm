// #/boss: the world boss. Every correctly typed word deals one point of damage
// per letter. The boss attacks on a schedule every raider shares
// (WorldBossRules), and the words those attacks carry show in their own slot
// above the word stack: block, send back or destroy. The fight runs through
// window.WorldBossNet (LocalDemo for now).
// The combat layer (js/app/combat/, COMBAT.md) runs the combo, the spells and the
// damage multipliers: clean words build a combo whose tiers upgrade the shot, and
// combo 10, 25, 50, then every 25, offer spell words to cast. The word stack comes
// from js/wordbank.js.
Router.register('boss', (() => {
  // the rules, the boss and the audio are read in mount, so the order the scripts load in never matters
  let R, B, A, NAME, TIPS;
  const BANNER = [
    '',
    'It now puts up firewalls and throws packets at you.',
    'It now spawns bugs that heal it.',
    'Block words are now two words long.',
    'It attacks twice as often now.',
  ];
  const tipsFor = name => ({
    slam: 'Type the red word before its timer runs out to block the attack.',
    phrase: 'Type both words and the space between them to block.',
    volley: 'Type a cyan packet before it reaches you to send it back for triple damage.',
    shield: 'Your hits go into the firewall until the raid breaks it. The kernel opens when it breaks.',
    adds: `Type the amber words to delete the bugs before they heal ${name}.`,
    weak: 'The kernel is open and your hits deal double damage.',
    weak3: 'The kernel is open and your hits deal triple damage.',
    stagger: `Type six words fast to stagger ${name}. Your next three hits crit.`,
    start: 'Type the highlighted word and press Space. Each word deals one damage per letter.',
    combo: 'Words with no typo raise your combo and make your shots bigger. A typo drops it one tier.',
    spell: 'Type the green spell word with no typo to cast it. It goes away after 15 seconds.',
    orb: 'Every word charges your orb. It fires after six words or when you stop typing.',
  });
  const KIND = { block: 'Block', return: 'Send back', add: 'Debug', dodge: 'Dodge', cover: 'Cover', heal: 'Heal', revive: 'Revive' };
  // the word row's order: your own dodge first, then saving squadmates, then the raid's attacks
  const ORDER = { dodge: 0, revive: 1, cover: 1, block: 2, return: 3, heal: 4, add: 5 };
  // integrity a raid attack takes when it reaches you: 22 in phase 1 to 34 in phase 5; a packet takes 8
  const slamDmg = p => 22 + 3 * p, PACKET_DMG = 8;
  const STREAK_N = 6, STREAK_MS = 4500, STAGGER_CD = 8000, CRITS = 3, JAM_MS = 5000, ACTIVE_MS = 20000, LOCK_MS = 1200;
  const DMG_MILESTONES = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05];
  const BLOCK_MILESTONES = [1, 5, 10, 25, 50];

  let el, scene, offs = [], timers = [], keys = null;
  let st = null;
  let stack = [], hist = [], typed = '', target = null, clean = true, combo = 0, best = 0;
  let sess = null, recorded = false, feed = [], others = [], lastOther = 0, lastNum = 0, lastStage = -1, lastPhase = -1;
  let mech = [], mechKey = '', sent = new Set(), done = new Set(), mine = new Set(), warned = {};
  let wordTimes = [], staggerAt = 0, critLeft = 0, jamUntil = 0, lockUntil = 0, lastKeyAt = 0, weakWas = false, shieldWas = false;
  let tipQ = [], tipUntil = 0, seenTips = new Set(), miles = new Set(), downTimer = 0, feedDirty = false;
  let labels = new Map(), misses = [], gone = new Map();
  // the combat layer: this player's combo and spells, the sounds, the word stack's source
  let squad = null, squadOffs = [], tier = 3;
  let me = null, cSnd = null, words = null, spellT = [], wordT0 = 0, grace = {}, frostMs = 0, castDmg = {}, avoid = new Set(), comboShown = false;
  const STACK_DIFF = [[1, 4], [2, 4], [2, 5], [3, 5], [3, 6]];
  const cSfx = (n, a) => { if (cSnd) cSnd.play(n, a); };
  const later = (ms, fn) => { const id = setTimeout(() => { spellT = spellT.filter(x => x !== id); fn(); }, ms); spellT.push(id); };

  const q = k => el && el.querySelector(`[data-k="${k}"]`);
  const fmt = UI.fmt, esc = UI.esc;
  const pct = (a, b) => b ? (100 * a / b) : 0;
  const share = (a, b) => { const p = pct(a, b); return p > 0 && p < 0.01 ? '<0.01%' : (p > 0 && p < 1 ? p.toFixed(2) : p.toFixed(1)) + '%'; };
  const now = () => WorldBossNet.now();
  const active = () => now() - lastKeyAt < ACTIVE_MS;
  const sfx = (n, a) => A.play(n, a);

  function newSession() {
    sess = { keys: 0, good: 0, letters: 0, words: 0, missed: 0, first: 0, last: 0, active: 0, blocks: 0, fails: 0, returns: 0, adds: 0, dmg: 0, casts: 0 };
    recorded = false;
  }
  // ---------- the squad (js/app/boss-squad.js) ----------
  // your typing speed sets the size of your block and dodge words and of the word stack
  function myWpm() { try { const s = WPM.stats(); return s.avgWpm || 35; } catch (e) { return 35; } }
  const DODGE = [[2, 4], [3, 5], [4, 6], [5, 7]];
  function makeSquad() {
    squadOffs.forEach(f => f()); squadOffs = [];
    if (squad) squad.destroy();
    squad = null;
    if (!window.BossSquad) return;
    const d = WorldBossNet.demo();
    tier = R.tierOf(myWpm());
    const div = window.Ops && Ops.division();
    squad = BossSquad.create({
      now, demo: d, raiders: d && d.raiders ? d.raiders() : [],
      me: { name: WPM.profile().name, division: div ? div.id : null, recruit: !!(window.Ops && Ops.clearance().i === 0) },
      dodgeWord: () => TT.wordOfLength(...DODGE[tier]),
    });
    if (words && tier < 3) words.set({ maxLen: [5, 6, 7][tier] });
    // the squad mates stand beside you in the scene, each with a look of their own
    const opId = m => (m.you ? 'you' : m.demoId || m.id);
    if (scene && window.Operator) scene.crew(squad.members().filter(m => !m.you).map(m => ({ id: opId(m), preset: Operator.random(m.name) })));
    const name = m => (m.you ? 'you' : m.name);
    squadOffs.push(
      squad.on('lock', e => { if (!el) return; if (e.who.you) { sfx('warn'); pop('LOCKED ON', 'red'); pushFeed({ text: `${NAME} is aiming at you. Type the dodge word`, cls: 'alert' }); } }),
      squad.on('dodge', () => { if (!el) return; sfx('blockOk'); pop('DODGED', 'cyan'); }),
      squad.on('covered', e => { if (!el) return; if (e.by.you) { sfx('blockOk'); pop('COVERED', 'cyan'); } pushFeed({ text: `${e.by.you ? 'You' : e.by.name} covered ${name(e.who)}`, cls: e.by.you || e.who.you ? 'you' : '' }); }),
      squad.on('hit', e => { if (scene) scene.act(opId(e.who), 'hit'); if (!el || !e.who.you) return; if (e.shielded) pushFeed({ text: 'Your recruit shield saved you. You can go down from CL-02', cls: 'you' }); }),
      squad.on('down', e => { if (scene) scene.act(opId(e.who), 'down'); if (!el) return; pushFeed({ text: e.who.you ? "You're down. Each word you type brings you back a second sooner" : `${e.who.name} is down. Type ${e.who.handle} to revive them`, cls: 'alert' }); if (e.who.you) { sfx('blockFail'); typed = ''; target = null; renderQueue(); } }),
      squad.on('revive', e => { if (!el) return; if (e.by && e.by.you) { sfx('blockOk'); pop('REVIVED', 'green'); } pushFeed({ text: `${e.by.you ? 'You' : e.by.name} revived ${name(e.who)}`, cls: e.by.you || e.who.you ? 'you' : '' }); }),
      squad.on('up', e => { if (scene) scene.act(opId(e.who), 'up'); if (el && e.who.you) pushFeed({ text: "You're back up", cls: 'you' }); }),
      squad.on('heal', e => { if (scene) scene.act(opId(e.by), 'cast'); if (!el) return; if (e.by.you) pop(`+${e.amount}`, 'green'); else if (e.who.you) pushFeed({ text: `${e.by.name} healed you for ${e.amount}`, cls: 'you' }); }),
    );
  }

  function resetFight() {
    newSession();
    feed = []; hist = []; trace = []; typed = ''; target = null; combo = 0; best = 0; clean = true; lastStage = -1; lastPhase = -1;
    flow = null;
    mech = []; mechKey = ''; sent = new Set(); done = new Set(); mine = new Set(); warned = {};
    wordTimes = []; staggerAt = 0; critLeft = 0; jamUntil = 0; lockUntil = 0; weakWas = false; shieldWas = false; miles = new Set();
    spellT.forEach(clearTimeout); spellT = []; grace = {}; frostMs = 0; castDmg = {}; avoid = new Set(); comboShown = false;
    if (me) me.reset();
    makeSquad();
  }

  // The cover Art designed: the boss and your operator before the fight starts.
  // Join (or Enter) builds the fight in the same root.
  // #/boss/training is the training raid for new operators (Gid, 25 Nov 2026): a weak Syntax Error
  // with three slow squadmates and the first three phases, every tip shown as its part of the
  // fight comes up, and a division suggestion at the end (WorldBossNet.Training).
  let started = false, coverOff = null, training = false;
  const NPH = () => (training ? 3 : R.PHASES.length);
  function mount(root, params) {
    TT.useWeaponSound();
    el = root; started = false;
    training = !!(params && params[0] === 'training');
    WorldBossNet.use(training ? WorldBossNet.Training : WorldBossNet.LocalDemo);
    R = window.WorldBossRules; B = R.BOSS; A = window.BossAudio; NAME = B.name;
    const fmt0 = n => n.toLocaleString('en-US');
    if (training) { cover(true); return; }
    cover(false);
  }
  function cover(tr) {
    const fmt0 = n => n.toLocaleString('en-US');
    el.innerHTML = `
      <section class="wb-cover" aria-labelledby="wb-cover-h">
        <div class="wb-cover-art" aria-hidden="true">
          <img class="wb-cover-boss" src="assets/boss/syntax-error.webp" alt="" width="724" height="900" decoding="async">
          <img class="wb-cover-op" src="assets/boss/operator-back.webp" alt="" width="486" height="900" decoding="async">
        </div>
        <div class="wb-cover-text">
          <small>${tr ? 'Training raid' : 'World boss'}</small>
          <h1 id="wb-cover-h">${esc(NAME)}</h1>
          <p>${tr ? `A short practice fight against a weaker ${esc(NAME)} with three squadmates. Tips explain each attack as it comes. At the end you get a division suggested from how you typed.`
            : 'Everyone online fights this boss together. Each word you type deals one damage per letter and the red words block its attacks.'}</p>
          <dl>
            <div><dt>HP</dt><dd>${fmt0(tr ? 3000 : B.maxHp)}</dd></div>
            <div><dt>Phases</dt><dd>${NPH()}</dd></div>
          </dl>
          <ol class="wb-cover-phases">${R.PHASES.slice(0, NPH()).map(ph => `<li>${esc(ph.name)}</li>`).join('')}</ol>
          <div class="wb-cover-live" data-k="clive" hidden>
            <span class="wb-cover-tag">Raid in progress</span>
            <span class="wb-cover-ph" data-k="cph"></span>
            <i class="wb-cover-hp"><i data-k="chp"></i></i>
            <span class="wb-cover-n" data-k="cn"></span>
          </div>
          <button class="btn" type="button" data-k="join">${tr ? 'Start training' : 'Join the raid'} <kbd>Enter</kbd></button>
          ${tr ? '<a class="wb-cover-alt" href="#/boss">Skip to the real raid</a>' : '<a class="wb-cover-alt" href="#/boss/training">First time? Try the training raid</a>'}
        </div>
      </section>`;
    const go = () => { if (started || !el) return; coverOff(); A.unlock(); begin(); };
    const key = e => { if (e.key === 'Enter' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); go(); } };
    const btn = el.querySelector('[data-k="join"]');
    btn.addEventListener('click', go);
    document.addEventListener('keydown', key);
    coverOff = () => document.removeEventListener('keydown', key);
    if (matchMedia('(pointer: fine)').matches) btn.focus({ preventScroll: true });
    // Art's attack state: when a fight is already running, the cover shows it live
    if (!tr) WorldBossNet.peek().then(p => {
      if (!el || started || !p || p.defeatedAt || p.hp >= p.maxHp) return;
      const cov = el.querySelector('.wb-cover'); if (!cov) return;
      cov.classList.add('live');
      q('clive').hidden = false;
      q('cph').textContent = `Phase ${p.phase + 1} of ${R.PHASES.length}: ${R.PHASES[p.phase].name}`;
      q('chp').style.width = (100 * p.hp / p.maxHp).toFixed(1) + '%';
      q('cn').textContent = `${fmt0(Math.ceil(p.hp))} HP left, ${p.raiders} operators fighting`;
    }).catch(() => {});
  }

  function begin() {
    started = true;
    TIPS = tipsFor(NAME);
    if (window.Combat && Combat.create) {
      // CTRL division perks count here (js/app/ops.js); duels never pass them
      me = Combat.create({ perks: window.Ops ? Ops.perks() : null, targetHp: () => (st && st.maxHp ? st.hp / st.maxHp : null) });
      cSnd = Combat.Audio.create({ ctx: () => A.out().ac, out: () => A.out().bus, on: () => A.on });
      wireCombat();
    }
    words = window.WordBank ? WordBank.stream({ theme: 'mix', difficulty: STACK_DIFF[0] }) : null;
    resetFight();
    try { seenTips = new Set(training ? [] : JSON.parse(localStorage.getItem('wpm-boss-tips') || '[]')); } catch (e) { seenTips = new Set(); }
    stack = moreWords(80);
    // One centred column: HP, the arena, the attack slots, the word stack and a slim
    // strip with your numbers. The scoreboard, the live feed and the rest of your
    // stats sit in a drawer that Tab or the Scoreboard button opens.
    el.innerHTML = `
      <div class="wb" data-k="wb">
        <section class="boss-hpbox" aria-label="Boss HP" data-k="hpbox">
          <div class="wb-hp-row">
            <h1 class="wb-name">${esc(NAME)}</h1>
            <span class="boss-state" data-k="state"></span>
            <span class="wb-phase" data-k="phase"></span>
            <span class="wb-hpnum"><b data-k="hp">0</b><span class="wb-left"><span data-k="left">0%</span> left</span></span>
          </div>
          <div class="boss-bar" role="meter" aria-label="Boss HP" aria-valuemin="0" aria-valuemax="${B.maxHp}" data-k="meter">
            <i data-k="fill"></i><em class="wb-shieldbar" data-k="sbar" hidden></em>
            ${R.PHASES.slice(1, NPH()).map(ph => `<s style="left:${ph.at * 100}%"></s>`).join('')}
          </div>
          <div class="wb-team" data-k="team" title="Blocks, packets sent back and bugs deleted fill it. 50: boss attacks do half damage to operators. 75: every hit x1.2. 100: root access, x1.5 hits through the firewall for 10 s.">
            <span class="wb-team-l">Team firewall</span>
            <span class="wb-team-bar" role="meter" aria-label="Team firewall" aria-valuemin="0" aria-valuemax="100" data-k="tmeter"><i data-k="tfill"></i><s style="left:50%"></s><s style="left:75%"></s></span>
            <span class="wb-team-n" data-k="tnum">0%</span>
            <span class="wb-team-b" data-k="tbuff"></span>
          </div>
        </section>
        <section class="boss-stage" data-k="stage" aria-label="The boss">
          <div class="kb-loading" data-k="loading">Loading</div>
          <div class="wb-tint" data-k="tint" aria-hidden="true"></div>
          <div class="wb-labels" data-k="labels" aria-hidden="true"></div>
          <div class="wb-ntags" data-k="ntags" aria-hidden="true"></div>
          <ol class="wb-cards" data-k="cards" aria-label="Raid feed"></ol>
          <div class="dmg-layer" data-k="nums" aria-hidden="true"></div>
          <div class="wb-status">
            <span class="wb-flag shield" data-k="shield" hidden></span>
            <span class="wb-flag weak" data-k="weak" hidden></span>
            <span class="wb-me" data-k="mestat"></span>
          </div>
          <ol class="wb-mini" data-k="mini" aria-label="Top raiders"></ol>
          <div class="wb-combo" data-k="cbox" data-t="0" hidden aria-live="off">
            <b data-k="cnum">0</b>
            <span class="wb-combo-l"><span data-k="cmult">Combo</span><em data-k="ctier">Bolt</em></span>
            <i class="wb-cbar"><i data-k="cbar"></i><small data-k="cnext"></small></i>
          </div>
          <div class="wb-level" data-k="level" hidden aria-live="polite"></div>
          <p class="wb-tip" data-k="tip" aria-live="polite"></p>
          <div class="wb-pop" data-k="pop" aria-hidden="true"></div>
          <div class="wb-banner" data-k="banner" hidden></div>
          <div class="boss-down" data-k="down" hidden></div>
          <div class="wb-youdown" data-k="youdown" hidden></div>
        </section>
        <section class="boss-type" aria-label="Your word stack">
          <div class="wb-mech" data-k="mechrow"><div class="wb-chips" data-k="chips"></div></div>
          <div class="typebox boss-words" data-k="box" tabindex="-1">
            <div class="boss-queue" data-k="queue"></div>
            <div class="focus-note"><span class="fn-key">Click here or press any key to type</span><span class="fn-tap">Tap here to type</span></div>
          </div>
          <ol class="wb-track" data-k="track" aria-label="Combo levels"></ol>
          <div class="wb-over" data-k="over"><button class="btn" type="button" data-k="again">${training ? 'Train again' : 'New demo boss'}</button>${training ? '<a class="btn out" href="#/boss">Join the real raid</a>' : ''}</div>
        </section>
        <section class="wb-squad" data-k="squad" aria-label="Your squad"></section>
        <div class="wb-strip">
          <span class="wb-stat mine"><b data-k="s-dmg">0</b> damage</span>
          <span class="wb-stat"><b data-k="s-rank">-</b><span data-k="s-of"></span></span>
          <span class="wb-stat"><b data-k="s-wpm">0</b> wpm</span>
          <span class="wb-stat"><b data-k="s-blocks">0</b> blocked</span>
          <button class="wb-boardbtn" type="button" data-k="boardbtn" aria-expanded="false" aria-controls="wb-drawer">Scoreboard <kbd>Tab</kbd></button>
        </div>
        <p class="wb-demo" data-k="demo">The other raiders are bots until the server is live.
          <span class="wb-skip" data-k="skip">Skip to phase ${[2, 3, 4, 5].map(n => `<button type="button" data-p="${n - 1}">${n}</button>`).join('')}</span></p>
      </div>
      <aside class="wb-drawer" id="wb-drawer" data-k="drawer" aria-label="Scoreboard" inert>
        <div class="wb-dhead">
          <h2>Scoreboard</h2><span data-k="count"></span>
          <button class="wb-x" type="button" data-k="close" aria-label="Close the scoreboard"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg></button>
        </div>
        <section class="boss-you">
          <h3>You</h3>
          <div class="wb-you">
            <div><span>Damage</span><b class="green" data-k="mydmg">0</b></div>
            <div><span>Rank</span><b data-k="rank">-</b></div>
            <div><span>wpm</span><b data-k="wpm">0</b></div>
            <div><span>Accuracy</span><b data-k="acc">100%</b></div>
            <div><span>Combo</span><b data-k="combo">0</b></div>
            <div><span>Best combo</span><b data-k="best">0</b></div>
            <div><span>Blocks</span><b data-k="blocks">0</b></div>
            <div><span>Packets sent back</span><b data-k="returns">0</b></div>
            <div><span>Bugs deleted</span><b data-k="adds">0</b></div>
          </div>
        </section>
        <section>
          <h3>Damage</h3>
          <table class="boss-board"><thead><tr><th>#</th><th>Operator</th><th class="r">Damage</th><th class="r">Blocks</th><th class="r">Share</th></tr></thead><tbody data-k="board"></tbody></table>
        </section>
        <section class="wb-chat" data-k="chat">
          <div class="wb-chat-tabs" role="tablist" aria-label="Chat">
            <button type="button" role="tab" data-tab="global" aria-selected="true">Global<i data-k="u-global"></i></button>
            <button type="button" role="tab" data-tab="team" aria-selected="false">Team<i data-k="u-team"></i></button>
            <button type="button" role="tab" data-tab="system" aria-selected="false">System</button>
          </div>
          <ol class="wb-chat-log" data-k="clog" aria-live="polite"></ol>
          <ol class="boss-feed" data-k="feed" hidden></ol>
          <form class="wb-chat-say" data-k="say">
            <input data-k="sayin" maxlength="140" autocomplete="off" spellcheck="false" placeholder="Say something to the raid" aria-label="Chat message">
            <button class="btn out" type="submit">Send</button>
          </form>
          <p class="wb-chat-why" data-k="saywhy" aria-live="polite"></p>
        </section>
      </aside>`;

    renderQueue();
    tip('start');
    scene = BossScene.mount(q('stage'), { onImpact, onFrame: placeLabels, bossId: 'syntax' });
    scene.ready.then(ok => { const l = q('loading'); if (ok && l) l.remove(); })
      .catch(() => { const l = q('loading'); if (l) l.textContent = "The boss can't load without an internet connection."; });

    offs.push(WorldBossNet.onState(onState));
    offs.push(WorldBossNet.onHit(onHit));
    offs.push(WorldBossNet.onEvent(onEvent));
    WorldBossNet.connect({ id: 'you', name: WPM.profile().name }).then(s => { makeSquad(); onState(s, true); });

    q('skip').addEventListener('click', e => {
      const b = e.target.closest('button[data-p]');
      const d = WorldBossNet.demo();
      if (b && d) { d.jumpTo(+b.dataset.p); if (keys) keys.focus(); }
    });
    q('again').addEventListener('click', again);
    q('boardbtn').addEventListener('click', () => { drawer(); if (keys) keys.focus(); });
    wireChat();
    q('close').addEventListener('click', () => { drawer(false); if (keys) keys.focus(); });
    q('drawer').addEventListener('keydown', e => { if (e.key === 'Escape') { drawer(false); if (keys) keys.focus(); } });

    const box = q('box');
    keys = TT.captureKeys(box, {
      label: 'Type the words to attack the boss. Tab opens the scoreboard.',
      onChar, onBack,
      onKey(k) {
        if (k === 'Enter') submit();
        else if (k === 'Tab') drawer();
        else if (k === 'Escape') drawer(false);
      },
    });
    if (matchMedia('(pointer: fine)').matches) keys.focus();
    countdown();
    const forward = e => {
      A.unlock();
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'view') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      keys.focus();
      // the stack can't take focus (hidden at the end of a fight): sending the key on would come back here
      if (document.activeElement !== keys.el) return;
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    };
    document.addEventListener('keydown', forward);
    offs.push(() => document.removeEventListener('keydown', forward));
    const unlock = () => A.unlock();
    el.addEventListener('pointerdown', unlock);
    const snd = e => { A.setOn(!!(e.detail && e.detail.on)); if (st && !st.defeatedAt && e.detail.on) A.phase(st.phase); };
    addEventListener('wpm-sound', snd);
    offs.push(() => removeEventListener('wpm-sound', snd));
    A.setOn(TT.soundOn());
    const leave = () => { record(!!(st && st.defeatedAt)); payOwed(); };
    addEventListener('pagehide', leave);
    offs.push(() => removeEventListener('pagehide', leave));
    timers.push(setInterval(paintFeed, 300));
    timers.push(setInterval(tick, 100));
    debugHook();
  }

  // ---------- the 3-second countdown after Join ----------
  // Keys wait until it ends; attacks can't hurt you either, since they only land on an active typist.
  let readyAt = 0;
  function countdown() {
    readyAt = performance.now() + 3000;
    const stage = q('stage'); if (!stage) return;
    const c = document.createElement('div');
    c.className = 'wb-count'; c.setAttribute('aria-live', 'assertive');
    stage.append(c);
    let n = 3;
    const step = () => {
      if (!el || !c.isConnected) return;
      c.textContent = n > 0 ? String(n) : 'GO';
      c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
      sfx(n > 0 ? 'warn' : 'shieldBreak');
      if (n-- > 0) timers.push(setTimeout(step, 1000));
      else timers.push(setTimeout(() => c.remove(), 650));
    };
    step();
  }
  const counting = () => performance.now() < readyAt;

  // ---------- typing ----------
  // A word goes to the first attack slot it matches, otherwise to the stack.
  function wordOf(t) { return t && t.kind ? t.word : stack[0]; }
  // the spells on offer, as typing targets
  function spellTargets() {
    const o = me && me.offer();
    if (!o) return [];
    return o.spells.map(id => { const sp = Combat.spell(id); return { kind: 'spell', id: 'spell:' + id, word: sp.word, spell: sp, due: o.until, total: o.until - o.at }; });
  }
  // A special word (attack, packet, bug or spell) that leaves while you're typing it stays your
  // target as long as your letters still match it, so finishing it isn't counted as typos; the
  // space then clears it as TOO LATE without spending the stack word or the combo.
  function retarget() {
    const vanished = target && target.kind && !target.gone && (target.kind === 'spell'
      ? !spellTargets().some(x => x.id === target.id) : !mech.some(m => m.id === target.id));
    if (vanished || (target && target.gone)) {
      if (typed && target.word.startsWith(typed)) { if (!target.gone) target = { ...target, gone: true }; return; }
      target = null;
    }
    if (target && wordOf(target).startsWith(typed)) return;
    const m = mech.find(x => x.word.startsWith(typed)) || spellTargets().find(x => x.word.startsWith(typed));
    if (m) { target = m; return; }
    if (stack[0].startsWith(typed)) { target = { stack: true }; return; }
    // a slip in the first letters of a spell word was more likely meant for the stack
    if (!target || (target.kind === 'spell' && typed.length < 4)) target = { stack: true };
  }
  function onChar(ch) {
    if (!st || st.defeatedAt || counting()) return;
    const t = performance.now();
    lastKeyAt = now();
    if (now() < lockUntil) return;
    if (!sess.first) sess.first = t;
    else if (t - sess.last < 5000) sess.active += t - sess.last;
    sess.last = t;
    if (ch === ' ') {
      // a two-word block keeps its space
      if (target && target.kind && target.word.startsWith(typed + ' ')) { typed += ' '; renderQueue(); return; }
      if (typed) submit();
      return;
    }
    sess.keys++;
    if (!typed) wordT0 = t;
    typed += ch;
    retarget();
    const w = wordOf(target);
    const good = typed.length <= w.length && ch === w[typed.length - 1];
    if (good) sess.good++;
    else clean = false;
    if (me) me.key(good);
    TT.click(false);
    renderQueue();
    paintChips(true);
  }
  function onBack(whole) {
    if (!typed) return;
    typed = whole ? '' : typed.slice(0, -1);
    if (!typed) target = null; else retarget();
    renderQueue();
    paintChips(true);
  }
  function submit() {
    if (!typed || !st || st.defeatedAt) return;
    // an exact match wins, so a stack word that starts an attack word still counts
    const exact = mech.find(m => m.word === typed);
    const spellHit = !exact && spellTargets().find(x => x.word === typed);
    if (exact) target = exact;
    else if (spellHit) target = spellHit;
    else if (typed === stack[0]) target = { stack: true };
    else if ((target && target.gone) || (gone.has(typed) && performance.now() - gone.get(typed) < 3000)) {
      // an attack word that just left the row: clear it without spending the stack word
      typed = ''; target = null; clean = true;
      pop('TOO LATE', 'white');
      renderQueue(); paintChips(true);
      return;
    } else if (!target) retarget();
    sess.keys++;                      // the space
    const t = now();
    if (target && target.kind === 'spell') { castSpell(target.spell, clean && typed === target.word); return; }
    if (target && target.kind) {
      const m = target, ok = typed === m.word && t < m.due;
      if (!ok) misses.push({ typed, word: m.word, late: t >= m.due });
      typed = ''; target = null;
      if (ok) {
        sess.good++;
        if (me) me.word({ letters: 0, clean });
        else { combo = clean ? combo + 1 : 0; best = Math.max(best, combo); }
        streak(t);
        mine.add(m.id);
        if (m.who && squad) {
          squad.act(m, t);
        } else if (m.kind === 'block') {
          sess.blocks++;
          WorldBossNet.sendBlock(m.id, m.word, { grace: grace[m.id] || 0, tier });
          if (scene) scene.block(m.id);
          sfx('blockOk');
          pop('BLOCKED', 'cyan');
          pushFeed({ text: `You blocked the ${R.ATTACK_NAME[m.ev.kind]}`, cls: 'you' });
          milestone('blocks', sess.blocks);
        } else if (m.kind === 'return') {
          sess.returns++;
          WorldBossNet.sendReturn(m.id, m.word);
          if (scene) scene.returnShot(m.id);
          sfx('returned');
          pop('SENT BACK', 'cyan');
        } else if (m.kind === 'add') {
          sess.adds++;
          WorldBossNet.sendAddKill(m.id, m.word);
          if (scene) scene.killAdd(m.id, true);
          sfx('addKill');
        }
      } else {
        sess.missed++;
        if (me) me.miss('wrong'); else combo = 0;
        TT.click(true);
      }
      clean = true;
      tick(); renderQueue(); paintYou();
      return;
    }
    const word = stack.shift();
    const ok = typed === word;
    if (ok && squad && squad.down()) {
      // down: clean words bring you back sooner and deal no damage
      sess.good++; sess.letters += word.length; sess.words++;
      if (clean) squad.cleanWord();
      TT.click(true);
    } else if (ok) {
      sess.good++;
      sess.letters += word.length;
      sess.words++;
      if (me) {
        // the combat layer sets the multiplier and the shot from the combo tier, accuracy, speed and buffs
        const w = me.word({ letters: word.length, clean, ms: performance.now() - wordT0, useCrit: critLeft <= 0 });
        const crit = critLeft > 0 ? (critLeft--, true) : w.crit;
        const col = me.status('hyper') ? '#ffb066' : me.status('root') ? '#ffc46b' : null;
        WorldBossNet.sendDamage(word.length, { crit, jam: t < jamUntil, mult: w.mult, tier: w.tier, pierce: w.pierce, color: col });
        cSfx('blip');
        if (scene) scene.act('you', 'type');
      } else {
        combo = clean ? combo + 1 : 0;
        best = Math.max(best, combo);
        const crit = critLeft > 0;
        if (crit) critLeft--;
        WorldBossNet.sendDamage(word.length, { crit, jam: t < jamUntil });
      }
      TT.click(true);
      streak(t);
      milestone('combo', combo);
      if (combo && combo % 5 === 0) WPM.track('combo', { n: combo, mode: 'boss' });
    } else {
      sess.missed++;
      if (me) me.miss('wrong'); else combo = 0;
      misses.push({ typed, word });
    }
    hist.push({ word, ok });
    if (hist.length > 3) hist.shift();
    if (flow) flow.push(word, typed, ok);
    typed = ''; target = null; clean = true;
    if (stack.length < 40) stack.push(...moreWords(60));
    renderQueue();
    paintYou();
  }
  // six quick words in a row stagger the boss and the next three hits crit
  function streak(t) {
    wordTimes.push(t);
    while (wordTimes.length && t - wordTimes[0] > STREAK_MS) wordTimes.shift();
    if (wordTimes.length >= STREAK_N && combo >= STREAK_N && t - staggerAt > STAGGER_CD) {
      staggerAt = t; critLeft = CRITS; wordTimes = [];
      if (scene) scene.stagger();
      sfx('stagger');
      pop('STAGGER', 'white');
      pushFeed({ text: `You staggered ${NAME}`, cls: 'you' });
      tip('stagger');
    }
  }

  // ---------- combat: combo, spells and the word stack ----------
  function moreWords(n) {
    if (!words) return TT.randomWords(n);
    // a stack word that is also the first word of an offered spell would make Space ambiguous
    return words.next(n + 4).filter(w => !avoid.has(w)).slice(0, n);
  }
  function wireCombat() {
    me.on('combo', c => { combo = c.combo; best = Math.max(best, c.best); paintCombo(c.reason === 'hurt' || c.reason === 'typo' || c.reason === 'wrong' || c.reason === 'fizzle'); });
    me.on('tierUp', e => {
      if (!el) return;
      cSfx('tierUp', e.tier);
      levelUp(e.tier);
      pushFeed({ text: `${e.name} at combo ${e.combo}: x${Combat.TIERS[e.tier].mult} damage`, cls: 'mile' });
      tip('combo');
      const b = q('cbox'); if (b) { b.classList.remove('up'); void b.offsetWidth; b.classList.add('up'); }
    });
    me.on('miss', e => { if (el && e.from >= 10) cSfx('break'); });
    me.on('spellOffer', o => {
      if (!el) return;
      avoid = new Set(o.spells.map(x => x.word.split(' ')[0]));
      stack = [stack[0], ...stack.slice(1).filter(w => !avoid.has(w))];
      if (stack.length < 40) stack.push(...moreWords(60));
      cSfx('offer');
      tip('spell');
      renderQueue(); paintChips(true);
    });
    me.on('offerEnd', () => {
      if (!el) return;
      if (target && target.kind === 'spell' && !target.gone) {
        if (typed && target.word.startsWith(typed)) target = { ...target, gone: true }; else { target = null; typed = ''; }
        renderQueue();
      }
      paintChips(true);
    });
    me.on('ward', () => { cSfx('ward'); if (scene) scene.fxEvent('ward'); });
    me.on('perk', e => { if (!el) return; pop(e.name.toUpperCase(), 'white'); pushFeed({ text: e.id === 'sentinel' ? 'Unbreakable kept your combo tier' : 'Execution: it is below 30% HP', cls: 'you' }); });
    me.on('guard', () => { if (!el) return; cSfx('guard'); if (scene) scene.fxEvent('guard'); pop('COMBO KEPT', 'white'); pushFeed({ text: 'Quantum split kept your combo', cls: 'you' }); });
    me.on('status', e => { if (!e.on && scene && ['ward', 'hyper', 'root', 'split'].includes(e.name)) scene.aura(e.name, false); if (el && st) paintMe(now()); });
  }
  // a spell word typed in full: cast it, or fizzle on a typo
  function castSpell(sp, ok) {
    typed = ''; target = null; clean = true;
    const r = me.cast(sp.word, { clean: ok, shield: !!(st && st.shield) });
    if (!r) { renderQueue(); paintChips(true); return; }
    if (r.fizzled) {
      sess.missed++;
      cSfx('fizzle');
      pop('FIZZLED', 'red');
      pushFeed({ text: `${sp.word} fizzled on a typo`, cls: 'alert' });
      renderQueue(); paintChips(true); paintYou();
      return;
    }
    sess.good++; sess.casts++;
    if (window.WPM && WPM.track) WPM.track('spell_cast', { spell: sp.id, mode: 'boss' });
    const e = r.effect, t = now();
    cSfx(sp.id);
    if (sp.rarity >= 3) A.duck(0.5, sp.rarity >= 4 ? 3.2 : 2.4);
    if (scene) scene.cast(sp.id, { hits: r.hits, effect: e });
    pop(sp.word, 'spell');
    if (sp.rarity >= 3) document.dispatchEvent(new CustomEvent('buddy', { detail: 'fast' }));
    if (e.cleanse) jamUntil = 0;
    if (e.heal && squad) later(600, () => { if (squad) squad.healMe(e.heal); });
    if (e.debuff === 'freeze') freezeNext(e.ms);
    if (e.returnShots) returnAll();
    castDmg[sp.id] = 0;
    const last = r.hits.length - 1;
    r.hits.forEach((h, i) => later(h.at, () => {
      if (!el || !st || st.defeatedAt) return;
      WorldBossNet.sendDamage(h.amount, { kind: 'spell', spell: sp.id, pierce: r.pierce, jam: now() < jamUntil });
      if (sp.strike) cSfx(sp.strike, h.power);
      if (i === 0 && e.clearAdds) clearAdds();
      if (i === last) later(300, () => { if (el) pushFeed({ text: `Your ${sp.word} dealt ${fmt(castDmg[sp.id] || 0)}`, cls: 'you' }); });
    }));
    if (!r.hits.length) pushFeed({ text: `You cast ${sp.word}`, cls: 'you' });
    streak(t);
    renderQueue(); paintChips(true); paintYou(); paintMe(t);
  }
  // cryo lock: the attack winding up now, or the next one, waits longer for you
  function freezeNext(ms) {
    const m = mech.find(x => x.kind === 'block' && !grace[x.id]);
    if (m) { grace[m.id] = ms; if (scene) scene.freezeAttack(m.id); }
    else frostMs = ms;
    tick();
  }
  // neon nova: every live bug goes
  function clearAdds() {
    for (const m of mech.filter(x => x.kind === 'add')) {
      mine.add(m.id); sess.adds++;
      WorldBossNet.sendAddKill(m.id, m.word);
      if (scene) scene.killAdd(m.id, true);
    }
    tick();
  }
  // packet storm: every packet in the air goes back
  function returnAll() {
    for (const m of mech.filter(x => x.kind === 'return')) {
      mine.add(m.id); sess.returns++;
      WorldBossNet.sendReturn(m.id, m.word);
      if (scene) scene.returnShot(m.id);
    }
    tick();
  }
  // Art's combo levels: the level's colour runs through the combo box, the word block and the track
  const tierCol = t => (Combat.TIERS[t] && Combat.TIERS[t].color) || null;
  function levelUp(t) {
    const L = q('level'); if (!L) return;
    const T = Combat.TIERS[t];
    L.style.setProperty('--tc', T.color);
    L.innerHTML = `<small>Combo ${T.at}</small><b>${esc(T.name.toUpperCase())} PROTOCOL ACTIVATED</b><span>x${T.mult} damage</span>`;
    L.dataset.t = t;
    L.hidden = false; L.classList.remove('go'); void L.offsetWidth; L.classList.add('go');
    clearTimeout(levelUp.t); levelUp.t = setTimeout(() => { L.hidden = true; }, 1900);
    if (t >= Combat.TIERS.length - 1 && scene && scene.wave) scene.wave(1.5);   // ZERO LIMIT bends the whole screen
  }
  function paintTrack(c) {
    const tr = q('track'); if (!tr) return;
    const key = c.tier + ':' + c.best;
    if (tr.dataset.key === key) return;
    tr.dataset.key = key;
    tr.innerHTML = Combat.TIERS.slice(1).map((T, i) => {
      const n = i + 1, st = n < c.tier ? 'done' : n === c.tier ? 'on' : 'off';
      return `<li class="${st}" style="--tc:${T.color}"><b>${T.at}</b><span>${esc(T.name)}</span><small>x${T.mult}</small></li>`;
    }).join('');
  }
  function paintCombo(drop) {
    const box = q('cbox'); if (!box || !me) return;
    const c = me.state();
    if (c.combo > 0) comboShown = true;
    box.hidden = !comboShown;
    q('cnum').textContent = c.combo;
    q('ctier').textContent = c.name;
    q('cmult').textContent = c.tier ? `x${Combat.TIERS[c.tier].mult} damage` : 'Combo';
    box.dataset.t = c.tier;
    const col = tierCol(c.tier);
    for (const n of [box, q('box')]) if (n) { if (col) n.style.setProperty('--tc', col); else n.style.removeProperty('--tc'); n.dataset.t = c.tier; }
    paintTrack(c);
    q('cbar').style.width = (100 * Math.min(1, c.progress)).toFixed(1) + '%';
    q('cnext').textContent = c.next ? c.next : '';
    if (drop) { box.classList.remove('drop'); void box.offsetWidth; box.classList.add('drop'); }
  }

  // the words as a block of lines, Monkeytype style (js/app/wordflow.js): typed words stay on their
  // line, the current word is marked, and it waits dimmed while you type an attack word or a spell
  function renderQueue() {
    const box = q('queue'); if (!box) return;
    if (!flow) flow = WordFlow.create(box, { lines: 3 });
    const mineNow = !target || target.stack;
    flow.render({ cur: stack[0], typed: mineNow ? typed : '', mine: mineNow, next: stack.slice(1, 50) });
    if (me && q('track') && !q('track').dataset.key) paintTrack(me.state());
    q('combo').textContent = combo;
    q('box').classList.toggle('locked', now() < lockUntil);
  }
  let flow = null;
  function lettersHtml(word, t, caret) {
    let s = '';
    for (let i = 0; i < word.length; i++) {
      const a = t[i], c = word[i];
      const ch = c === ' ' ? '&nbsp;' : esc(c);
      if (a === undefined) s += `<span class="c${caret && i === t.length ? ' at' : ''}">${ch}</span>`;
      else s += `<span class="c ${a === c ? 'ok' : 'bad'}">${ch}</span>`;
    }
    return s;
  }

  // ---------- attacks on the shared clock ----------
  function tick() {
    if (!el || !st) return;
    if (chg && performance.now() - chg.last > CHARGE_IDLE) releaseCharge();
    const t = now();
    if (me) me.tick();
    if (squad) squad.tick(t, st.phase || 0);
    const isDown = !!(squad && squad.down());
    const evs = R.eventsAt(st, t, 800 + Math.max(0, ...Object.values(grace)));
    const list = squad ? squad.targets(t) : [];
    for (const e of evs) {
      if (!sent.has(e.id)) {
        sent.add(e.id);
        if (e.type === 'slam' && frostMs) { grace[e.id] = frostMs; frostMs = 0; if (scene) scene.freezeAttack(e.id); }
        if (scene) scene.event(e, t);
        if (e.type === 'slam') { sfx('windup', Math.min(2.5, (e.hit - t) / 1000)); tip(R.PHASES[st.phase].phrase ? 'phrase' : 'slam'); }
        if (e.type === 'volley') tip('volley');
        if (e.type === 'adds') tip('adds');
      }
      if (e.type === 'slam') {
        // cryo lock gives you extra time on one attack
        const due = e.hit + (grace[e.id] || 0);
        if (t < due && !mine.has(e.id) && !isDown) {
          list.push({ kind: 'block', id: e.id, word: R.blockWord(e, tier), due, total: due - e.start, ev: e });
          const left = Math.ceil((due - t) / 1000);
          if (left <= 3 && warned[e.id] !== left) { warned[e.id] = left; sfx('warn'); }
        }
        if (t >= due && !done.has(e.id)) {
          done.add(e.id);
          if (squad) squad.raidHit(Math.round(slamDmg(st.phase || 0) * R.teamGuard(st, now())), t);
          if (mine.has(e.id)) sfx('impact', true);
          else if (active() && !isDown) {
            const stunned = me && me.status('stunned-target');
            const r = me ? me.hurt('slam') : { blocked: false };
            if (r.blocked) {
              sfx('impact', true);
              pop(stunned ? 'MISSED' : 'BLOCKED', 'cyan');
              pushFeed({ text: stunned ? `The ${R.ATTACK_NAME[e.kind]} missed you during kernel panic` : `Safe mode blocked the ${R.ATTACK_NAME[e.kind]}`, cls: 'you' });
            } else {
              if (!(me && me.status('purge'))) jamUntil = t + JAM_MS;
              if (!me) combo = 0;
              sess.fails++;
              if (squad) squad.hitMe(Math.round(slamDmg(st.phase || 0) * R.teamGuard(st, now())), t);
              if (scene) scene.hurt();
              flashTint();
              sfx('blockFail');
              pop('HIT', 'red');
              pushFeed({ text: me && me.status('purge') ? `The ${R.ATTACK_NAME[e.kind]} hit you` : `The ${R.ATTACK_NAME[e.kind]} hit you and halved your damage for 5s`, cls: 'alert' });
            }
          } else sfx('impact', false);
        }
      } else if (e.type === 'volley') {
        for (const s of e.shots) {
          if (t >= s.launch && t < s.arrive && !mine.has(s.id) && !isDown) list.push({ kind: 'return', id: s.id, word: s.word, due: s.arrive, total: s.arrive - s.launch });
          if (t >= s.launch && !sent.has('l:' + s.id)) { sent.add('l:' + s.id); if (t < s.launch + 600) sfx('launch'); }
          if (t >= s.arrive && !done.has(s.id)) {
            done.add(s.id);
            if (!mine.has(s.id) && active() && !isDown) {
              const had = combo;
              const r = me ? me.hurt('packet') : { blocked: false };
              if (!r.blocked) {
                if (squad) squad.hitMe(Math.round(PACKET_DMG * R.teamGuard(st, now())), t);
                if (had > 0) pushFeed({ text: 'A packet hit you and broke your combo', cls: 'alert' });
                if (!me) combo = 0;
                if (scene) scene.hurt();
                sfx('projHit');
              }
            }
          }
        }
      } else if (e.type === 'adds') {
        for (const a of e.adds) {
          const live = t >= a.spawn && t < a.until && !st.addsDown[a.id] && !mine.has(a.id);
          if (live && !isDown) list.push({ kind: 'add', id: a.id, word: a.word, due: a.until, total: R.ADD_LIFE });
          if (st.addsDown[a.id] && !done.has('k:' + a.id)) { done.add('k:' + a.id); if (!mine.has(a.id) && scene) scene.killAdd(a.id, false); }
        }
      }
    }
    list.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.due - b.due);
    for (const m of mech) if (!list.some(x => x.id === m.id)) gone.set(m.word, performance.now());
    if (gone.size > 40) gone.clear();
    mech = list;
    // an attack word that left the row takes what was typed with it; a spell isn't in the row and
    // clears itself when its offer ends (offerEnd), so it's left alone here
    if (target && target.kind && target.kind !== 'spell' && !target.gone && !mech.some(m => m.id === target.id)) {
      // left while you were typing it: keep it as a ghost so the rest of the word isn't typos (retarget)
      if (typed && target.word.startsWith(typed)) target = { ...target, gone: true };
      else { target = null; typed = ''; }
      renderQueue();
    }
    // weak point and shield
    const weak = R.weakMult(st, t) > 1 && !st.defeatedAt;
    if (weak !== weakWas) {
      weakWas = weak;
      if (scene) scene.setWeak(weak);
      if (weak) { sfx('weakOpen'); pop(`KERNEL OPEN x${st.weak.mult}`, 'amber'); tip(st.weak.mult > 2 ? 'weak3' : 'weak'); }
    }
    const wf = q('weak');
    wf.hidden = !weak;
    if (weak) {
      const html = `Kernel open x${st.weak.mult} <b>${Math.ceil((st.weak.until - t) / 1000)}s</b>`;
      if (wf.innerHTML !== html) wf.innerHTML = html;
    }
    if (now() >= lockUntil && q('box').classList.contains('locked')) renderQueue();
    paintChips(false);
    paintMe(t);
    paintSquad(t);
    paintTip(t);
  }

  function paintChips(force) {
    const row = q('chips'); if (!row || !st) return;
    const t = now();
    const spells = st.defeatedAt ? [] : spellTargets();
    const max = spells.length ? 3 : 5;
    const show = mech.slice(0, max);
    const key = show.map(m => m.id).join('|') + '#' + spells.map(x => x.id).join('|') + '#' + (target && target.kind ? target.id + ':' + typed : '');
    if (force || key !== mechKey) {
      mechKey = key;
      let html = '';
      if (!show.length) {
        const nx = st.defeatedAt ? null : R.nextEventAt(st, t);
        html = nx ? `<span class="wb-next">Next attack in <b data-k="nexts">${Math.max(0, Math.ceil((nx - t) / 1000))}s</b></span>` : '';
      } else {
        html = show.map((m, i) => {
          const on = target && target.kind && target.id === m.id;
          return `<span class="wb-chip ${m.kind}${i === 0 ? ' first' : ''}${on ? ' on' : ''}${grace[m.id] ? ' frozen' : ''}" data-id="${esc(m.id)}">
            <small>${grace[m.id] ? `Block +${Math.round(grace[m.id] / 1000)}s` : KIND[m.kind]}</small><span class="w">${lettersHtml(m.word, on ? typed : '', on)}</span>
            <i class="bar"><i></i></i><em class="secs"></em></span>`;
        }).join('') + (mech.length > max ? `<span class="wb-more">+${mech.length - max}</span>` : '');
      }
      // the spells on offer sit after the attacks, in their own group
      if (spells.length) {
        html += `<span class="wb-spells" aria-label="Spells">` + spells.map(x => {
          const on = target && target.kind === 'spell' && target.id === x.id;
          return `<span class="wb-chip spell r${x.spell.rarity}${on ? ' on' : ''}" data-id="${esc(x.id)}" style="--sc:${x.spell.color}">
            <small>${esc(x.spell.label)}</small><span class="w">${lettersHtml(x.word, on ? typed : '', on)}</span>
            <i class="bar"><i></i></i><em class="secs"></em></span>`;
        }).join('') + `</span>`;
      }
      row.innerHTML = html;
      paintLabels();
    }
    if (spells.length) {
      const pn = performance.now();
      for (const x of spells) {
        const c = row.querySelector(`[data-id="${CSS.escape(x.id)}"]`);
        if (!c) continue;
        const left = Math.max(0, x.due - pn);
        c.querySelector('.bar i').style.width = (100 * left / x.total).toFixed(1) + '%';
        c.querySelector('.secs').textContent = Math.ceil(left / 1000) + 's';
        c.classList.toggle('late', left < 4000);
      }
    }
    if (!show.length) {
      const n = row.querySelector('[data-k="nexts"]');
      const nx = st.defeatedAt ? null : R.nextEventAt(st, t);
      if (n && nx) n.textContent = Math.max(0, Math.ceil((nx - t) / 1000)) + 's';
    }
    for (const m of show) {
      const c = row.querySelector(`[data-id="${CSS.escape(m.id)}"]`);
      if (!c) continue;
      const left = Math.max(0, m.due - t);
      c.querySelector('.bar i').style.width = (100 * left / m.total).toFixed(1) + '%';
      c.querySelector('.secs').textContent = Math.ceil(left / 1000) + 's';   // whole seconds: tenths ticking pulled the eye off the words
      c.classList.toggle('late', m.kind !== 'add' && left < 1500);
    }
  }
  function paintMe(t) {
    const box = q('mestat'); if (!box) return;
    const bits = [];
    if (t < jamUntil) bits.push(`<span class="wb-flag jam">Damage halved <b>${Math.ceil((jamUntil - t) / 1000)}s</b></span>`);
    const crits = critLeft + ((me && me.status('crits') && me.status('crits').charges) || 0);
    if (crits > 0) bits.push(`<span class="wb-flag crit">Crit x2 on the next <b>${crits}</b> ${crits === 1 ? 'hit' : 'hits'}</span>`);
    if (me) {
      const pn = performance.now();
      for (const x of me.statuses()) {
        const left = x.until ? Math.max(0, Math.ceil((x.until - pn) / 1000)) + 's' : '';
        const f = {
          ward: 'Safe mode', hyper: `Hyper thread x2 <b>${left}</b>`, root: `Root access x2 <b>${left}</b>`,
          split: `Quantum split <b>${x.charges}</b>`, purge: `Purge <b>${left}</b>`, 'stunned-target': `Kernel panic <b>${left}</b>`,
        }[x.name];
        if (f) bits.push(`<span class="wb-flag buff ${x.name}">${f}</span>`);
      }
      if (frostMs || Object.keys(grace).some(id => !done.has(id) && !mine.has(id))) bits.push(`<span class="wb-flag buff cryo">Cryo lock</span>`);
    }
    const html = bits.join('');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ---------- the squad cards ----------
  const DIVN = id => (window.Combat && Combat.Perks && Combat.Perks.byId(id) ? Combat.Perks.byId(id).name : 'No division');
  let squadKey = '';
  function paintSquad(t) {
    const box = q('squad'); if (!box || !squad) return;
    const ms = squad.members();
    const key = ms.map(m => [m.hp, m.down, m.lockUntil ? Math.ceil((m.lockUntil - t) / 500) : 0, m.down ? Math.ceil((m.downUntil - t) / 1000) : 0].join(',')).join('|');
    if (key !== squadKey) {
      squadKey = key;
      box.innerHTML = `<h2 class="wb-sqh">Squad</h2>` + ms.map(m => {
        const pct = Math.round(100 * m.hp / m.max);
        const state = m.down ? `Down ${Math.max(0, Math.ceil((m.downUntil - t) / 1000))}s`
          : m.lockUntil ? `Locked on ${Math.max(0, (m.lockUntil - t) / 1000).toFixed(1)}s`
          : m.you && m.recruit ? 'Recruit shield' : `${m.hp} / ${m.max}`;
        return `<div class="wb-op${m.you ? ' you' : ''}${m.down ? ' down' : ''}${m.lockUntil ? ' locked' : ''}${pct < 35 ? ' low' : ''}">
          <div class="wb-opn"><b>${m.you ? 'You' : esc(m.name)}</b><span>${esc(DIVN(m.division))}</span></div>
          <i class="wb-ophp"><i style="width:${pct}%"></i></i>
          <div class="wb-ops"><span>${state}</span>${m.you ? '' : `<kbd>${esc(m.handle)}</kbd>`}</div>
        </div>`;
      }).join('');
    }
    const me2 = squad.me(), yd = q('youdown');
    if (me2.down) {
      yd.hidden = false;
      const html = `<b>You're down</b><span>Back in ${Math.max(0, Math.ceil((me2.downUntil - t) / 1000))}s. Each word you type takes a second off. A squadmate can also revive you.</span>`;
      if (yd.innerHTML !== html) yd.innerHTML = html;
    } else if (!yd.hidden) { yd.hidden = true; yd.innerHTML = ''; }
  }

  // ---------- labels over the 3D scene ----------
  function paintLabels() {
    const layer = q('labels'); if (!layer) return;
    const want = new Map();
    const firstBlock = mech.find(m => m.kind === 'block');
    for (const m of mech) {
      if (m.kind === 'block' && m !== firstBlock) continue;
      want.set(m.id, m);
    }
    for (const [id, n] of labels) if (!want.has(id)) { n.remove(); labels.delete(id); }
    for (const [id, m] of want) {
      let n = labels.get(id);
      if (!n) {
        n = document.createElement('span');
        n.className = 'wb-label ' + m.kind;
        n.dataset.key = m.kind === 'block' ? 'head' : m.kind === 'return' ? 'shot:' + id : 'add:' + id;
        layer.append(n); labels.set(id, n);
      }
      const on = target && target.kind && target.id === id;
      const html = lettersHtml(m.word, on ? typed : '', on);
      if (n._h !== html) { n._h = html; n.innerHTML = html; n._w = 0; }
    }
  }
  const pt = { x: 0, y: 0 }, placed = [];
  function placeLabels() {
    if (!scene) return;
    placeTags();
    placed.length = 0;
    if (!labels.size) return;
    const W = q('stage').clientWidth;
    for (const n of labels.values()) {
      const p = scene.screen(n.dataset.key, pt);
      if (!p) { n.style.visibility = 'hidden'; continue; }
      if (!n._w) { n._w = n.offsetWidth; n._hh = n.offsetHeight; }
      // labels sit above their anchor and step up past any label they would cover
      let x = Math.max(4, Math.min(W - n._w - 4, p.x - n._w / 2)), y = Math.max(4, p.y - n._hh * (n.classList.contains('block') ? 1 : 1.5));
      for (let k = 0; k < 4; k++) {
        const hit = placed.find(r => x < r.x + r.w + 4 && x + n._w + 4 > r.x && y < r.y + r.h + 3 && y + n._hh + 3 > r.y);
        if (!hit) break;
        y = hit.y - n._hh - 4;
      }
      placed.push({ x, y, w: n._w, h: n._hh });
      n.style.visibility = '';
      n.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  // ---------- state from the net ----------
  function onState(s, first) {
    if (!el) return;
    const wasDown = st && st.defeatedAt;
    st = s;
    traceState(s);
    const f = s.hp / s.maxHp;
    q('hp').innerHTML = `${fmt(Math.ceil(s.hp))}<small> / ${fmt(s.maxHp)} HP</small>`;
    q('fill').style.width = (100 * f) + '%';
    paintTeam(s);
    q('meter').setAttribute('aria-valuenow', Math.ceil(s.hp));
    q('left').textContent = (f > 0 && f < 0.01 ? (100 * f).toFixed(2) : (100 * f).toFixed(1)) + '%';
    const ph = s.phase || 0;
    q('state').textContent = s.defeatedAt ? 'Down' : R.PHASES[ph].name;
    q('state').dataset.s = s.defeatedAt ? 5 : ph + 1;
    q('phase').textContent = `Phase ${ph + 1} of ${NPH()}`;
    q('phase').dataset.p = ph;
    q('demo').hidden = !s.demo || training;
    el.querySelectorAll('[data-p]').forEach(b => { if (b.tagName === 'BUTTON') b.disabled = +b.dataset.p <= ph || !!s.defeatedAt; });
    // shield over the HP bar
    const sb = q('sbar'), sf = q('shield');
    if (s.shield) {
      sb.hidden = false; sb.style.width = (100 * f) + '%'; sb.style.setProperty('--s', s.shield.hp / s.shield.max);
      sf.hidden = false; sf.innerHTML = `Firewall <b>${fmt(s.shield.hp)}</b><small> / ${fmt(s.shield.max)}</small>`;
    } else { sb.hidden = true; sf.hidden = true; }
    if (scene) {
      scene.setFrac(f, first || lastStage < 0);
      scene.setShield(s.shield ? s.shield.hp / s.shield.max : null);
    }
    if (!!s.shield !== shieldWas) { shieldWas = !!s.shield; if (s.shield && !first) tip('shield'); }
    lastStage = [0.75, 0.5, 0.25, 0.1].filter(t => f <= t).length;
    if (ph !== lastPhase) {
      const fresh = lastPhase < 0 || first;
      if (!fresh && ph > lastPhase) transition(ph);
      else { if (scene) scene.setPhase(ph, true); }
      if (!s.defeatedAt) A.phase(ph);
      if (words) words.set({ difficulty: STACK_DIFF[ph] || STACK_DIFF[0] });
      lastPhase = ph;
      sent = new Set(); done = new Set(); mine = new Set(); warned = {};
    }
    q('count').textContent = `${s.raiders.length} raiders`;
    paintBoard();
    paintYou();
    if (s.defeatedAt && !wasDown) down(first);
  }

  function transition(ph) {
    lockUntil = now() + LOCK_MS;
    if (target && target.kind) { typed = ''; target = null; }
    if (scene) scene.setPhase(ph, false);
    sfx('roar');
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'phase' }));
    const b = q('banner');
    b.hidden = false;
    b.innerHTML = `<div class="in"><small>Phase ${ph + 1} of ${NPH()}</small><b>${esc(R.PHASES[ph].name)}</b>${BANNER[ph] ? `<span>${esc(BANNER[ph])}</span>` : ''}</div>`;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, 2800);
    pushFeed({ sys: true, text: `Phase ${ph + 1}: ${R.PHASES[ph].name}` });
    renderQueue();
    setTimeout(renderQueue, LOCK_MS + 30);
  }

  function onHit(h) {
    if (!el) return;
    const t = performance.now();
    if (h.you) {
      sess.dmg += h.dmg;
      if (!training) WPM.track('boss_hit', { dmg: h.dmg, kind: h.kind || 'word', crit: !!h.crit });   // training counts toward nothing
      if (h.kind === 'spell') castDmg[h.spell] = (castDmg[h.spell] || 0) + h.dmg;
      if (h.kind === 'spell') { if (scene) scene.hit(h); else onImpact(h, null, null); milestone('dmg', meDamage()); return; }
      if (h.kind === 'return') pushFeed({ text: `You sent back a packet for ${h.dmg}`, cls: 'you' });
      else if (h.kind === 'block') pushFeed({ text: `You hit back for ${h.dmg}`, cls: 'you' });
      else if (h.kind === 'add') pushFeed({ text: `You deleted a bug and hit for ${h.dmg}`, cls: 'you' });
      else pushFeed(h);
      if (!h.kind || h.kind === 'word') chargeWord(h);
      else if (scene) scene.hit(h); else onImpact(h, null, null);
      milestone('dmg', meDamage());
    } else {
      if (scene) scene.hit(h);
      if ((h.tier >= 3 || h.crit) && h.kind === 'word') bigHit(h);
      others.push(h); if (others.length > 60) others.shift();
      if (t - lastOther > 900) { lastOther = t; pushFeed(others[Math.floor(Math.random() * others.length)]); others = []; }
    }
  }
  // ---------- raid chat: Global, Team (your squad) and System (the raid's events) ----------
  // Lines go through ChatRules (js/net/chat-rules.js), the same check as Open Port. Until the
  // server is live the other raiders' lines are simulated and labelled as such in the demo note.
  const chat = { global: [], team: [], tab: 'global', unread: { global: 0, team: 0 }, recent: [], lastAt: null };
  const SIM_GLOBAL = ['block the crash!!', 'kernel open, go go', 'who broke the firewall?', 'nice meltdown', 'gg so far', 'my combo keeps dying lol',
    'zero limit on me, watch', 'type the packets back', 'bugs on the left', 'phase 3 already?', 'firewall soon, stack blocks', 'lets get root access',
    'first raid, this is wild', 'anyone from manila?', 'cebu here', 'bkk here', 'sentinels cover pls', 'heal me architect'];
  const SIM_TEAM = ['im on blocks', 'ill heal', 'cover me', 'got your back', 'nice one', 'revive pls', 'stay on the core', 'save a spell for the shield'];
  function chatLine(tab, who, text, you) {
    const L = chat[tab]; L.push({ who, text, you, at: Date.now() }); if (L.length > 80) L.shift();
    if (tab !== chat.tab || !q('drawer').classList.contains('open')) { chat.unread[tab]++; paintUnread(); }
    if (tab === chat.tab) paintChat();
  }
  function paintUnread() {
    for (const k of ['global', 'team']) { const u = q('u-' + k); if (u) u.textContent = chat.unread[k] ? ` ${Math.min(99, chat.unread[k])}` : ''; }
    const b = q('boardbtn'); if (b) b.dataset.unread = chat.unread.global + chat.unread.team ? '1' : '';
  }
  function paintChat() {
    const log = q('clog'); if (!log) return;
    log.innerHTML = chat[chat.tab].slice(-40).map(m => `<li class="${m.you ? 'you' : ''}"><b>${esc(m.you ? 'You' : m.who)}</b> ${esc(m.text)}</li>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  function chatTab(tab) {
    chat.tab = tab;
    el.querySelectorAll('.wb-chat-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    const sys = tab === 'system';
    q('clog').hidden = sys; q('feed').hidden = !sys; q('say').hidden = sys; q('saywhy').textContent = '';
    if (!sys) { chat.unread[tab] = 0; paintUnread(); paintChat(); } else paintFeed(true);
  }
  function wireChat() {
    el.querySelector('.wb-chat-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) chatTab(b.dataset.tab); });
    q('say').addEventListener('submit', e => {
      e.preventDefault();
      const inp = q('sayin'), why = q('saywhy');
      const r = window.ChatRules ? ChatRules.check(inp.value, { recent: chat.recent, lastAt: chat.lastAt }) : { ok: !!inp.value.trim(), text: inp.value.trim(), why: '' };
      if (!r.ok) { why.textContent = r.why || ''; return; }
      why.textContent = ''; inp.value = '';
      chat.lastAt = Date.now(); chat.recent.push({ text: r.text, at: chat.lastAt }); if (chat.recent.length > 5) chat.recent.shift();
      chatLine(chat.tab, 'You', r.text, true);
      // a simulated raider answers now and then
      if (Math.random() < 0.45) setTimeout(() => { if (el) simSay(chat.tab, ['lol', 'gg', 'true', 'focus the core', 'hi', 'same', 'nice'][Math.floor(Math.random() * 7)]); }, 1500 + Math.random() * 2500);
    });
    q('sayin').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); if (keys) keys.focus(); } });
    timers.push(setInterval(() => { if (el && st && !st.defeatedAt && Math.random() < 0.55) simSay('global'); }, 7000));
    timers.push(setInterval(() => { if (el && st && !st.defeatedAt && Math.random() < 0.3) simSay('team'); }, 11000));
  }
  function simSay(tab, text) {
    let who;
    if (tab === 'team') { const ms = squad ? squad.members().filter(m => !m.you) : []; if (!ms.length) return; who = ms[Math.floor(Math.random() * ms.length)].name; }
    else { const rs = st ? st.raiders.filter(r => !r.you) : []; if (!rs.length) return; who = rs[Math.floor(Math.random() * rs.length)].name; }
    const pool = tab === 'team' ? SIM_TEAM : SIM_GLOBAL;
    chatLine(tab, who, text || pool[Math.floor(Math.random() * pool.length)], false);
  }

  // ---------- the team firewall (WorldBossRules.TEAM) ----------
  function paintTeam(s) {
    const T = s.team || { fw: 0, rootUntil: 0 }, t = now(), root = T.rootUntil > t;
    const fw = root ? 100 : T.fw;
    q('tfill').style.width = fw.toFixed(1) + '%';
    q('tmeter').setAttribute('aria-valuenow', Math.round(fw));
    q('tnum').textContent = root ? Math.ceil((T.rootUntil - t) / 1000) + 's' : Math.floor(T.fw) + '%';
    const on = root ? 'root' : T.fw >= 75 ? 'overclock' : T.fw >= 50 ? 'hardened' : '';
    const box = q('team');
    if (box.dataset.on !== on) {
      box.dataset.on = on;
      const tr = R.TEAM.tiers.find(x => x.id === on);
      q('tbuff').textContent = tr ? (on === 'hardened' ? 'Hardened: half damage to operators' : on === 'overclock' ? 'Hardened + Overclocked x1.2' : 'ROOT ACCESS x1.5') : '';
    }
  }

  // ---------- the team damage graph ----------
  // Every 5 s the raid's total and yours are noted; the result screen draws them as damage
  // per 15 s, the raid's bars with your part inside each one.
  let trace = [];
  function traceState(s) {
    const t = performance.now(), last = trace[trace.length - 1];
    if (last && t - last.t < 5000 && !s.defeatedAt) return;
    const mine = s.raiders.find(r => r.you);
    trace.push({ t, raid: s.raiders.reduce((a, r) => a + r.damage, 0), you: mine ? mine.damage : 0 });
    if (trace.length > 2000) trace = trace.slice(-2000);
  }
  function damageGraph() {
    if (trace.length < 3) return '';
    const W = 15000, t0 = trace[0].t, n = Math.max(1, Math.ceil((trace[trace.length - 1].t - t0) / W));
    const at = (t, k) => { let v = trace[0][k]; for (const p of trace) { if (p.t > t) break; v = p[k]; } return v; };
    const bins = Array.from({ length: n }, (_, i) => {
      const a = t0 + i * W, b = a + W;
      return { raid: Math.max(0, at(b, 'raid') - at(a, 'raid')), you: Math.max(0, at(b, 'you') - at(a, 'you')) };
    });
    const top = Math.max(1, ...bins.map(b => b.raid));
    const bw = 600 / n, H = 120;
    const bars = bins.map((b, i) => {
      const x = (i * bw + bw * 0.12).toFixed(1), w = (bw * 0.76).toFixed(1);
      const hr = (H * b.raid / top).toFixed(1), hy = (H * b.you / top).toFixed(1);
      return `<rect class="r" x="${x}" y="${(H - hr).toFixed(1)}" width="${w}" height="${hr}"><title>${fmt(b.raid)} raid damage, ${fmt(b.you)} yours</title></rect>` +
        `<rect class="y" x="${x}" y="${(H - hy).toFixed(1)}" width="${w}" height="${hy}"/>`;
    }).join('');
    const mins = Math.ceil(n * W / 60000);
    return `<figure class="wb-graph">
      <figcaption><span>Team damage every 15 s</span><span class="k"><i class="r"></i>Raid <i class="y"></i>You</span></figcaption>
      <svg viewBox="0 0 600 ${H}" preserveAspectRatio="none" role="img" aria-label="Raid damage per 15 seconds, peak ${fmt(top)}">${bars}</svg>
      <div class="ax"><span>0:00</span><span>${mins}:00</span></div>
    </figure>`;
  }

  // ---------- the raid around you ----------
  // A raider's big hit (combo tier 3 or more, or a crit) puts their name over them in the crowd
  // in their tier's colour, and the biggest ones get a card in the feed over the arena.
  const ntags = new Map();
  let lastTag = 0, lastCard = 0;
  function tierOf(t) { return Combat.TIERS[Math.max(0, Math.min(t | 0, Combat.TIERS.length - 1))]; }
  function bigHit(h) {
    const t = performance.now(), T = tierOf(h.tier);
    if (t - lastTag > 450 && ntags.size < 4 && !ntags.has(h.id)) {
      lastTag = t;
      const n = document.createElement('span');
      n.className = 'wb-ntag'; n.style.setProperty('--tc', T.color || 'var(--accent)');
      n.innerHTML = `${esc(h.name)} <b>${fmt(h.dmg)}</b>`;
      q('ntags').append(n);
      ntags.set(h.id, { n, until: t + 1400 });
    }
    if (h.tier >= 4 && t - lastCard > 1600) {
      lastCard = t;
      card({ who: h.name, what: `${T.name.toUpperCase()} hit`, dmg: h.dmg, color: T.color });
    }
  }
  // the feed cards over the arena: the four latest raid moments, each for 4 s
  function card(c) {
    const box = q('cards'); if (!box) return;
    const li = document.createElement('li');
    li.style.setProperty('--tc', c.color || 'var(--accent)');
    li.innerHTML = `<b>${esc(c.who)}</b><span>${esc(c.what)}</span>${c.dmg ? `<em>${fmt(c.dmg)}</em>` : ''}`;
    box.prepend(li);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => li.classList.add('out'), 3600);
    setTimeout(() => li.remove(), 4000);
  }
  function placeTags() {
    if (!ntags.size || !scene) return;
    const t = performance.now(), W = q('stage').clientWidth;
    for (const [id, x] of ntags) {
      if (t > x.until) { x.n.remove(); ntags.delete(id); continue; }
      const p = scene.screen('raider:' + id, pt);
      if (!p) { x.n.style.visibility = 'hidden'; continue; }
      const w = x.n.offsetWidth;
      x.n.style.visibility = '';
      x.n.style.transform = `translate(${Math.max(4, Math.min(W - w - 4, p.x - w / 2)).toFixed(1)}px, ${(p.y - 24).toFixed(1)}px)`;
    }
  }

  // ---------- the charge ----------
  // Your words power up an orb that fires as one attack. Each word is still sent on its own, so the
  // scores stay exact; only the picture waits. The orb grows with every word and fires after CHARGE_N
  // words or a CHARGE_IDLE pause, and lands as one number with the words' damage added up.
  const CHARGE_N = 6, CHARGE_IDLE = 1500;
  let chg = null;
  function chargeWord(h) {
    chg ||= { n: 0, dmg: 0, letters: 0, tier: 0, crit: false, weak: false, shield: false, color: null, last: 0 };
    chg.n++; chg.dmg += h.dmg; chg.letters += h.letters || 0; chg.tier = Math.max(chg.tier, h.tier || 0);
    chg.crit ||= !!h.crit; chg.weak ||= !!h.weak; chg.shield ||= !!h.shield; chg.color = h.color || chg.color;
    chg.last = performance.now();
    if (chg.n === 1) tip('orb');
    if (scene) { scene.feed(); scene.charge(Math.min(1, chg.n / CHARGE_N), chg.tier); }
    if (chg.n >= CHARGE_N) releaseCharge();
  }
  function releaseCharge() {
    const c = chg; chg = null;
    if (!c || !el) return;
    const power = Math.min(1, c.n / CHARGE_N);
    const h = { you: true, kind: 'word', dmg: c.dmg, letters: c.letters, tier: c.tier, crit: c.crit, weak: c.weak, shield: c.shield, color: c.color, words: c.n };
    cSfx('shot' + Math.max(1, Math.min(4, c.tier + (power >= 1 ? 1 : 0))));
    if (power >= 1 && c.tier >= 3) cSfx('boom');
    if (scene) scene.release(c.tier, power, (x, y) => onImpact(h, x, y)); else onImpact(h, null, null);
  }

  // a bolt landed: the number and the sound go where and when it hits
  function onImpact(h, x, y) {
    if (!el) return;
    if (h.you) {
      if (h.kind === 'spell') { number(h, x, y); return; }
      if (h.shield) sfx('shieldHit');
      else if (h.weak) sfx('weak');
      else if (h.crit || h.kind === 'block' || h.kind === 'return') sfx('crit');
      else sfx('hit', combo);
      number(h, x, y);
    } else {
      if (h.shield) sfx('shieldHit');
      else if (Math.random() < 0.3) sfx('raid');
      const t = performance.now();
      if (t - lastNum > 160) { lastNum = t; number(h, x, y); }
    }
  }

  function onEvent(e) {
    if (!el) return;
    if (e.type === 'shieldUp') { sfx('shieldUp'); pushFeed({ sys: true, text: `${NAME} put up a firewall` }); }
    if (e.type === 'shieldBreak') {
      sfx('shieldBreak'); pop('FIREWALL DOWN', 'cyan');
      pushFeed({ text: `${e.you ? 'You' : e.by} broke the firewall`, cls: e.you ? 'you' : 'shield' });
      card({ who: e.you ? 'You' : e.by, what: 'broke the firewall', color: '#3ee6ff' });
    }
    if (e.type === 'adds') { sfx('addSpawn'); pushFeed({ sys: true, text: `${NAME} spawned ${e.n} bugs` }); }
    if (e.type === 'addDown') pushFeed({ text: `${e.you ? 'You' : e.by} deleted a bug`, cls: e.you ? 'you' : 'add' });
    if (e.type === 'impact') {
      pushFeed({ text: `${e.blocks} of ${e.of} raiders blocked the ${R.ATTACK_NAME[e.kind]}${e.stun ? `. Kernel open for ${R.WEAK_MS / 1000}s` : ''}`, cls: e.stun ? 'shield' : 'alert' });
      if (e.stun) card({ who: `${e.blocks} of ${e.of}`, what: `blocked the ${R.ATTACK_NAME[e.kind]}`, color: '#3ee6ff' });
    }
    if (e.type === 'team' && e.up) {
      const tr = R.TEAM.tiers.find(x => x.id === e.tier);
      if (tr) {
        pushFeed({ sys: true, text: `Team firewall ${tr.at}%: ${tr.name}. ${tr.text}` });
        card({ who: `Team ${tr.at}%`, what: tr.name, color: e.tier === 'root' ? '#ffd23d' : '#3ee6ff' });
        if (e.tier === 'root') { pop('ROOT ACCESS', 'amber'); sfx('shieldBreak'); simSay('global', 'ROOT ACCESS lets gooo'); }
        else sfx('shieldUp');
      }
    }
    if (e.type === 'defeat') pushFeed({ sys: true, text: `${NAME} is down. Last hit by ${e.you ? 'you' : e.by}` });
  }

  function number(h, x, y) {
    const layer = q('nums'); if (!layer) return;
    if (x === null || x === undefined) {
      const stg = q('stage');
      x = stg.clientWidth * (0.42 + Math.random() * 0.16); y = stg.clientHeight * (0.35 + Math.random() * 0.2);
    }
    const s = document.createElement('span');
    const big = h.crit || h.weak || h.kind === 'block' || h.kind === 'return' || (h.kind === 'spell' && h.dmg >= 60) || h.tier >= 3;
    s.className = 'dmg' + (h.you ? ' you' : '') + (h.you && big ? ' big' : '') + (h.shield ? ' sh' : '') + (h.kind === 'return' && h.you ? ' ret' : '') + (h.kind === 'spell' && h.you ? ' spell' : '') + (h.you && h.dmg >= 300 ? ' huge' : '');
    const tag = h.weak ? ` x${st && st.weak ? st.weak.mult : 2}` : h.crit ? ' crit' : '';
    s.textContent = '-' + h.dmg + (h.you ? tag : '');
    s.style.left = (x + (Math.random() - 0.5) * 70) + 'px';
    s.style.top = (y + (Math.random() - 0.5) * 44) + 'px';
    layer.append(s);
    while (layer.children.length > 28) layer.firstElementChild.remove();
    setTimeout(() => s.remove(), 1200);
  }
  let popT = 0;
  // Big callouts (the kernel opening, the firewall going down, a stagger, a lock-on) stay up
  // for 2 seconds and small ones (HIT, BLOCKED, +25) can't replace them, so they get read.
  const MAJOR = /^(KERNEL OPEN|FIREWALL DOWN|STAGGER|LOCKED ON|EXECUTION|UNBREAKABLE)/;
  let popHold = 0;
  function pop(text, cls) {
    const p = q('pop'); if (!p) return;
    const t = performance.now(), major = MAJOR.test(text);
    if (t - popT < 350 && !major) return;
    if (!major && t < popHold) return;
    popT = t; popHold = major ? t + 1800 : 0;
    p.className = 'wb-pop ' + cls + (major ? ' long' : '');
    p.textContent = text;
    void p.offsetWidth; p.classList.add('go');
  }
  let tintT = 0;
  function flashTint() {
    const n = q('tint'); if (!n) return;
    const t = performance.now();
    if (t - tintT < 400) return;
    tintT = t;
    n.classList.remove('go'); void n.offsetWidth; n.classList.add('go');
  }
  function tip(id) {
    if (seenTips.has(id) || tipQ.includes(id)) return;
    tipQ.push(id);
  }
  function paintTip(t) {
    const n = q('tip'); if (!n) return;
    if (t < tipUntil) return;
    const id = tipQ.shift();
    if (!id) { if (n.textContent) { n.textContent = ''; n.classList.remove('on'); } return; }
    seenTips.add(id);
    if (!training) try { localStorage.setItem('wpm-boss-tips', JSON.stringify([...seenTips])); } catch (e) {}
    n.textContent = TIPS[id];
    n.classList.add('on');
    tipUntil = t + 6500;
  }

  function meDamage() { const me = st && st.raiders.find(r => r.you); return me ? me.damage : 0; }
  function milestone(kind, v) {
    if (kind === 'dmg') {
      for (const m of DMG_MILESTONES) {
        const k = 'd' + m;
        if (v >= m * B.maxHp && !miles.has(k)) {
          miles.add(k);
          pushFeed({ text: `You've dealt ${+(m * 100).toFixed(2)}% of ${NAME}'s HP`, cls: 'mile' });
          sfx('milestone');
        }
      }
    } else if (kind === 'blocks') {
      if (BLOCK_MILESTONES.includes(v) && v > 1 && !miles.has('b' + v)) { miles.add('b' + v); pushFeed({ text: `You blocked ${v} attacks`, cls: 'mile' }); sfx('milestone'); }
    }
  }

  function pushFeed(h) {
    const t = new Date();
    feed.unshift({ ...h, time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    if (feed.length > 30) feed.length = 30;
    feedDirty = true;
  }
  function paintFeed(force) {
    if ((!feedDirty && force !== true) || !el) return;
    feedDirty = false;
    q('feed').innerHTML = feed.slice(0, 10).map(h => {
      const tm = `<span class="t">[${h.time}]</span> `;
      if (h.sys) return `<li class="sys">${tm}${esc(h.text)}</li>`;
      if (h.text) return `<li class="${h.cls || ''}">${tm}${esc(h.text)}</li>`;
      const tag = h.weak ? ` x${st && st.weak ? st.weak.mult : 2}` : h.crit ? ' crit' : '';
      return `<li class="${h.you ? 'you' : ''}">${tm}${esc(h.you ? 'You' : h.name)} hit ${h.shield ? 'the firewall ' : ''}for <b>${h.dmg}</b>${h.you ? tag : ''}</li>`;
    }).join('');
  }

  // a share is the part of all the raid's damage so far, so the whole board adds up to 100%
  function raidTotal() { return st.raiders.reduce((a, r) => a + r.damage, 0); }
  function rows(list, max, cols = 5) {
    const me = st.raiders.findIndex(r => r.you);
    const total = raidTotal();
    const top = list.slice(0, max).map((r, i) => [r, i]);
    if (me >= max) top.push(null, [st.raiders[me], me]);
    return top.map(x => {
      if (!x) return `<tr class="gap"><td colspan="${cols}">…</td></tr>`;
      const [r, i] = x;
      return `<tr class="${r.you ? 'you' : ''}"><td class="rank ${i < 3 ? 'top' : ''}">${i + 1}</td>
        <td class="who">${window.Avatar ? Avatar.img(r.you ? Avatar.mine() : Avatar.bot(r.name), 48, 20) : r.you ? `<img src="${UI.avatar(WPM.profile().avatar, 48)}" alt="" width="20" height="20">` : ''}${esc(r.name)}${r.you ? ' <span class="tag">You</span>' : ''}</td>
        <td class="r num">${fmt(r.damage)}</td><td class="r num dim">${fmt(r.blocks || 0)}</td><td class="r num dim">${share(r.damage, total)}</td></tr>`;
    }).join('');
  }
  function paintBoard() {
    q('board').innerHTML = rows(st.raiders, 10);
    // the corner board in the arena: the top three and you
    const me = st.raiders.findIndex(r => r.you);
    const list = st.raiders.slice(0, 3).map((r, i) => [r, i]);
    if (me >= 3) list.push([st.raiders[me], me]);
    q('mini').innerHTML = list.map(([r, i]) => `<li class="${i < 3 ? 'top' : ''}${r.you ? ' you' : ''}"><span class="r">${i + 1}</span><span class="n">${r.you ? 'You' : esc(r.name)}</span><b>${fmt(r.damage)}</b></li>`).join('');
  }
  // the scoreboard drawer: no argument toggles it
  function drawer(open) {
    const d = q('drawer'); if (!d) return;
    const on = open === undefined ? !d.classList.contains('open') : !!open;
    d.classList.toggle('open', on);
    d.inert = !on;
    q('boardbtn').setAttribute('aria-expanded', on);
    if (on) { if (chat.tab === 'system') paintFeed(true); else { chat.unread[chat.tab] = 0; paintUnread(); paintChat(); } }
  }

  function paintYou() {
    if (!st || !el) return;
    const i = st.raiders.findIndex(r => r.you);
    const me = st.raiders[i];
    const dmg = fmt(me ? me.damage : 0), ranked = me && me.damage;
    q('mydmg').textContent = dmg;
    q('rank').innerHTML = ranked ? `#${i + 1}<small> of ${st.raiders.length}</small>` : '-';
    const min = sess.active / 60000;
    const wpm = min > 0.05 ? Math.round(((sess.letters + sess.words) / 5) / min) : 0;
    q('wpm').textContent = wpm;
    q('acc').textContent = (sess.keys ? Math.round(100 * sess.good / sess.keys) : 100) + '%';
    q('blocks').textContent = sess.blocks;
    q('returns').textContent = sess.returns;
    q('adds').textContent = sess.adds;
    q('best').textContent = best;
    // the slim strip under the stack
    q('s-dmg').textContent = dmg;
    q('s-rank').textContent = ranked ? `#${i + 1}` : '-';
    q('s-of').textContent = ranked ? ` of ${st.raiders.length}` : ' rank';
    q('s-wpm').textContent = wpm;
    q('s-blocks').textContent = sess.blocks;
  }

  // ---------- defeat ----------
  function down(instant) {
    mech = []; target = null; typed = '';
    spellT.forEach(clearTimeout); spellT = [];
    if (me) me.closeOffer('down');
    el.querySelector('.boss-type').classList.add('is-done');
    paintChips(true); renderQueue();
    for (const n of labels.values()) n.remove();
    labels.clear();
    if (scene) { scene.setWeak(false); scene.defeat(instant); }
    if (!instant) { sfx('defeat'); A.victory(); }
    else A.stop();
    if (!instant) document.dispatchEvent(new CustomEvent('buddy', { detail: 'boss-kill' }));
    clearTimeout(downTimer);
    downTimer = setTimeout(() => showResult(instant), instant ? 0 : 3200);
  }
  // The rewards are recorded when the result opens rather than at the kill, and
  // the block bonus follows a little later, so the site toasts don't all land at once.
  function showResult(instant) {
    if (!el) return;
    const r = record(true, true);
    const me = st.raiders.findIndex(x => x.you);
    const mineR = st.raiders[me];
    const mvp = st.raiders[0];
    const lastYou = !!(mineR && st.lastHit && st.lastHit === mineR.name);
    const who = (you, name) => (you ? 'You' : esc(name));
    let line = '';
    if (st.lastHit && mvp && (lastYou ? mvp.you : !mvp.you && st.lastHit === mvp.name)) {
      line = `${who(lastYou, st.lastHit)} landed the last hit and dealt the most damage with ${fmt(mvp.damage)}.`;
    } else {
      if (st.lastHit) line += `${who(lastYou, st.lastHit)} landed the last hit. `;
      if (mvp) line += `${who(mvp.you, mvp.name)} dealt the most damage with ${fmt(mvp.damage)}.`;
    }
    const box = q('down');
    box.hidden = false;
    q('stage').classList.add('is-down');
    const bonus = r ? r.bonus : 0;
    box.innerHTML = `
      <div class="boss-down-in" data-k="result">
        <h2>${esc(NAME)} is down</h2>
        <p class="wb-res-line">${line}</p>
        <div class="wb-res-main">
          <div><span>Your damage</span><b class="green">${fmt(mineR ? mineR.damage : 0)}</b></div>
          <div><span>Share</span><b>${share(mineR ? mineR.damage : 0, raidTotal())}</b></div>
          <div><span>Rank</span><b>#${me + 1}<small> of ${st.raiders.length}</small></b></div>
          ${r ? `<div><span>Coins</span><b class="gold">+${fmt(r.coins + bonus)}</b></div>
          <div><span>XP</span><b>+${fmt(r.xp + r.bonusXp)}</b></div>` : ''}
        </div>
        <div class="wb-res-more">
          <span><b>${sess.blocks}</b> blocked</span>
          <span><b>${sess.returns}</b> sent back</span>
          <span><b>${sess.adds}</b> bugs deleted</span>
          <span><b>${best}</b> best combo</span>
          <span><b>${sess.casts}</b> ${sess.casts === 1 ? 'spell' : 'spells'} cast</span>
        </div>
        ${r && bonus ? `<p class="wb-bonus">Coins include ${[
          r.blockCoins ? `${r.blockCoins} for ${sess.blocks} ${sess.blocks === 1 ? 'block' : 'blocks'}` : '',
          r.killCoins ? `${r.killCoins} for being there at the end` : '',
          r.squadCoins ? `${r.squadCoins} for saves and heals` : '',
        ].filter(Boolean).join(' and ')}.</p>` : ''}
        ${training ? trainedHtml() : ''}
        ${damageGraph()}
        <table class="boss-board"><thead><tr><th>#</th><th>Operator</th><th class="r">Damage</th><th class="r">Blocks</th><th class="r">Share</th></tr></thead><tbody>${rows(st.raiders, 3)}</tbody></table>
        ${squadTable()}
      </div>`;
    if (instant) q('again').focus({ preventScroll: true });
    requestAnimationFrame(showWhole);
  }
  // After the training raid: the division the site suggests from how you typed, and where to pick it
  function trainedHtml() {
    try { localStorage.setItem('wpm-boss-trained', '1'); } catch (e) {}
    const sug = window.Ops && Ops.suggest(), d = sug && window.Ops && Ops.division();
    const P = window.Combat && Combat.Perks, name = sug && P && P.byId(sug.id) ? P.byId(sug.id).name : sug && sug.id;
    if (!sug) return '';
    return `<div class="wb-trained">
      <h3>Training done</h3>
      <p>${d ? `You're in the ${esc(d.name)} division.` : `Suggested division: <b>${esc(name || sug.id)}</b>.`} ${esc(sug.why || '')}</p>
      <a class="btn out sm" href="#/profile">${d ? 'Divisions' : 'Pick a division'}</a>
    </div>`;
  }
  // the squad's damage, saves and heals, with the top guard and top medic called out
  function squadTable() {
    if (!squad) return '';
    const sq = squad.stats();
    const dmgOf = m => { const r = st.raiders.find(x => (m.you ? x.you : x.id === m.demoId)); return r ? r.damage : 0; };
    const rows = sq.members.map(m => ({ ...m, dmg: dmgOf(m) }));
    const top = k => { const b = rows.slice().sort((a, c) => c[k] - a[k])[0]; return b && b[k] > 0 ? b : null; };
    const g = top('saves'), h = top('heals'), d = top('dmg');
    const call = [d && `Top damage: ${d.you ? 'you' : esc(d.name)}`, g && `Top guard: ${g.you ? 'you' : esc(g.name)}`, h && `Top medic: ${h.you ? 'you' : esc(h.name)}`].filter(Boolean);
    return `<h3 class="wb-sqres">Your squad</h3>
      ${call.length ? `<p class="wb-sqcall">${call.join('. ')}.</p>` : ''}
      <table class="boss-board wb-sqtable"><thead><tr><th>Operator</th><th class="hide-sm">Division</th><th class="r">Damage</th><th class="r">Saves</th><th class="r">Heals</th></tr></thead>
      <tbody>${rows.map(m => `<tr class="${m.you ? 'you' : ''}"><td>${m.you ? 'You' : esc(m.name)}</td><td class="hide-sm">${esc(DIVN(m.division))}</td><td class="r">${fmt(m.dmg)}</td><td class="r">${m.saves}</td><td class="r">${fmt(m.heals)}</td></tr>`).join('')}</tbody></table>
      <p class="wb-sqline">You went down ${sq.downs} ${sq.downs === 1 ? 'time' : 'times'}, dodged ${sq.dodges} lock-${sq.dodges === 1 ? 'on' : 'ons'} and saved squadmates ${sq.saves} ${sq.saves === 1 ? 'time' : 'times'}.</p>`;
  }
  // The result and the New demo boss button below it must both be on screen.
  // If they aren't, the page scrolls the top of the fight, or the result itself
  // on a phone, to just under the site header.
  function showWhole() {
    if (!el) return;
    const res = q('result'), btn = q('over');
    if (!res || !btn) return;
    const head = document.querySelector('header.top');
    const hb = head ? head.getBoundingClientRect().bottom : 0;
    const top = res.getBoundingClientRect().top, bottom = btn.getBoundingClientRect().bottom;
    if (top >= hb && bottom <= innerHeight) return;
    const hp = Math.min(q('hpbox').getBoundingClientRect().top, q('stage').getBoundingClientRect().top);
    const to = bottom - (hp - hb - 8) <= innerHeight ? hp : top;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: scrollY + to - hb - 8, behavior: smooth ? 'smooth' : 'auto' });
  }
  function again() {
    clearTimeout(downTimer);
    if (st && st.defeatedAt && !recorded) record(true);
    const box = q('down');
    box.hidden = true; box.innerHTML = '';
    q('stage').classList.remove('is-down');
    el.querySelector('.boss-type').classList.remove('is-done');
    resetFight();
    if (scene) scene.revive();
    WorldBossNet.newBoss().then(s => onState(s, true));
    renderQueue();
    if (keys) keys.focus();
  }

  // One WPM.record per session: when the boss falls or when the player leaves.
  // Blocks earn 3 coins and 6 XP each (up to 60 coins) and being there at the end earns 20 coins.
  // With spaced set, the block bonus coins and XP follow 1.6s apart.
  let owed = [], owedT = [];
  function record(atKill, spaced) {
    if (recorded || !sess || !sess.keys) return null;
    recorded = true;
    const min = Math.max(sess.active, 1000) / 60000;
    const r = WPM.record({
      mode: training ? 'boss-training' : 'world-boss',
      wpm: Math.round(((sess.letters + sess.words) / 5) / min),
      acc: Math.round(100 * sess.good / sess.keys),
      correct: sess.letters + sess.words,
      keys: sess.keys,
      ms: Math.round(Math.max(sess.active, 1000)),
      score: Math.round(sess.dmg || sess.letters),
    });
    if (atKill && sess.words > 0 && !training) WPM.track('boss_win', { dmg: Math.round(sess.dmg || 0) });
    r.blockCoins = Math.min(60, sess.blocks * 3);
    r.killCoins = atKill && sess.words > 0 && !training ? 20 : 0;
    // saving squadmates pays like blocking: 3 a save and 1 for every 10 integrity healed, up to 60
    const sq = squad ? squad.stats() : null;
    r.squadCoins = sq ? Math.min(60, sq.saves * 3 + Math.floor(sq.heals / 10)) : 0;
    r.bonus = r.blockCoins + r.killCoins + r.squadCoins;
    r.bonusXp = sess.blocks * 6;
    const give = [];
    if (r.bonus) give.push(() => WPM.addCoins(r.bonus, 'world boss'));
    if (r.bonusXp) give.push(() => WPM.addXP(r.bonusXp));
    if (spaced) {
      give.forEach((f, i) => {
        owed.push(f);
        owedT.push(setTimeout(() => { owed = owed.filter(x => x !== f); f(); }, 1600 * (i + 1)));
      });
    } else give.forEach(f => f());
    if (!atKill && window.Toast) Toast('t-level', `${UI.icon('bolt', 'green')}<span>World boss: <b>${fmt(sess.dmg || sess.letters)}</b> damage, <b>+${r.xp + r.bonusXp}</b> XP</span>`, 4500);
    return r;
  }
  // pays a bonus still waiting on its timer, when the page goes away first
  function payOwed() {
    owedT.forEach(clearTimeout); owedT = [];
    const list = owed; owed = [];
    list.forEach(f => f());
  }

  function debugHook() {
    window._wb = {
      squad: () => squad,
      sceneCtl: () => scene,
      state: () => st,
      phase: () => st && st.phase,
      mech: () => mech.map(m => ({ kind: m.kind, id: m.id, word: m.word, due: m.due - now() })),
      stack: () => stack[0],
      typed: () => typed,
      me: () => ({ ...sess, combo, best, critLeft, jam: Math.max(0, jamUntil - now()), lock: Math.max(0, lockUntil - now()) }),
      scene: () => scene && scene.info(),
      events: () => (st ? R.eventsAt(st, now()) : []),
      next: () => (st ? R.nextEventAt(st, now()) - now() : null),
      setFrac: f => { const d = WorldBossNet.demo(); if (d) d.setFrac(f); },
      jump: p => { const d = WorldBossNet.demo(); if (d) d.jumpTo(p); },
      simScale: x => { const d = WorldBossNet.demo(); if (d) d.simScale(x); },
      renderFx: (n, a, s) => A.renderFx(n, a, s),
      feed: () => feed.slice(0, 12).map(f => f.text || `${f.name} hit for ${f.dmg}`),
      misses: () => misses.slice(-20),
      combat: () => me && me.state(),
      setCombo: n => me && me.debug.setCombo(n),
      offer: ids => me && me.debug.offer(ids),
      // casts a spell as if it had been offered and typed cleanly
      cast: id => { const sp = Combat.spell(id); if (!sp || !me) return false; me.debug.offer([id]); typed = ''; target = null; castSpell(sp, true); return true; },
      spells: () => Combat.SPELLS().map(x => x.id),
      fx: () => { const i = scene && scene.info(); return i && i.fx; },
      pause: on => scene && scene.pause(on),
    };
  }

  function unmount() {
    if (coverOff) { coverOff(); coverOff = null; }
    if (!started) { el = null; WorldBossNet.use(WorldBossNet.LocalDemo); return; }
    started = false;
    record(!!(st && st.defeatedAt));
    payOwed();
    spellT.forEach(clearTimeout); spellT = [];
    if (me) me.bus.clear();
    me = null; cSnd = null; words = null; chg = null;
    squadOffs.forEach(f => f()); squadOffs = [];
    if (squad) { squad.destroy(); squad = null; }
    offs.forEach(f => f()); offs = [];
    timers.forEach(clearInterval); timers = [];
    clearTimeout(downTimer);
    WorldBossNet.disconnect();
    WorldBossNet.use(WorldBossNet.LocalDemo);
    A.stop();
    if (scene) scene.dispose();
    labels.clear();
    delete window._wb;
    scene = null; keys = null; el = null; st = null;
  }

  // #/boss and #/boss/training are the same page, so moving between them mounts it again
  function update(params) { const root = el; if (!root) return; unmount(); root.innerHTML = ''; mount(root, params); }

  return { title: 'World boss', mount, unmount, update };
})());
