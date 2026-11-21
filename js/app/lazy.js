// Loads each page's scripts and styles the first time the page opens, so a visit to
// #/type doesn't download the world boss, Breach or the room. index.html keeps only
// the shell, the typing engine, progress and Tilde.
//
// A group is a list of files plus the groups it needs first. Router.lazy(name, group)
// registers a stand-in page that loads the group, then mounts the real page, which
// registers itself under the same name when its script runs.
// Lazy.need(name) loads a group by hand; Lazy.provide('Room') loads whatever group
// defines that global (UI.waitFor calls it).
window.Lazy = (() => {
  const G = {
    words: { js: ['js/wordbank-common.js', 'js/wordbank.js'] },
    combat: { css: ['css/combat.css'], js: ['bus', 'spells', 'combo', 'damage', 'engine', 'sfx', 'fx3d'].map(f => `js/app/combat/${f}.js`) },
    map: { css: ['css/map.css'], js: ['js/app/community.js', 'js/app/missions.js', 'js/app/worldmap.js', 'js/app/activity.js'] },
    kb: { js: ['js/keyboards.js', 'js/kb3d.js'] },
    race: { js: ['js/race.js', 'js/games.js'] },
    learn: { need: ['words'], css: ['css/learn.css'],
      js: ['js/learn/coins.js', 'js/learn/passages.js', 'js/learn/wordsource.js', 'js/learn/keyboard.js', 'js/learn/lessons.js', 'js/learn/typer.js', 'js/app/learn.js', 'js/app/free.js', 'js/app/reel.js'] },
    net: { need: ['words', 'combat'], css: ['css/multi.css'],
      js: ['core', 'filter', 'chat-rules', 'chat-rooms', 'chat-lines', 'chat-sim', 'rating', 'typist', 'bot', 'duel-rules', 'party-rules', 'sim', 'ws', 'net']
        .map(f => `js/net/${f}.js`).concat('js/app/multi-ui.js') },
    boss: { need: ['words', 'combat'], js: ['js/app/boss-rules.js', 'js/app/boss-net.js', 'js/app/boss-audio.js', 'js/app/boss3d.js'] },
    rushBoard: { css: ['css/rush.css'], js: ['js/app/rush/board.js'] },
    rush: { need: ['words', 'combat', 'boss', 'rushBoard'], css: ['css/rush.css'],
      js: ['data', 'director', 'fight', 'audio', 'scene', 'page'].map(f => `js/app/rush/${f}.js`) },
    // these loaders add their own files after themselves, so the group is ready when the globals are
    breach: { js: ['js/breach/load.js'], ready: () => window.Breach && window.Breach.endlessScores },
    room: { js: ['js/room/load.js'], ready: () => window.Room && window.RoomItems },
    avatarParts: { js: ['js/app/avatar-face.js', 'js/app/avatar-makeup.js', 'js/app/avatar-hair.js'] },
    avatarEdit: { need: ['avatarParts'], js: ['js/app/avatar-creator.js'] },

    // pages
    'page:home': { need: ['map', 'kb', 'net'], js: ['js/hero.js', 'js/app/home.js'] },
    'page:type': { js: ['js/app/type.js', 'js/app/type-tabs.js'] },
    'page:play': { need: ['race'], js: ['js/app/play.js'] },
    'page:boss': { need: ['boss'], js: ['js/app/boss.js'] },
    'page:superboss': { need: ['words', 'combat'], css: ['css/superboss.css'],
      js: ['js/app/sb-data.js', 'js/app/sb-fight.js', 'js/app/sb-bot.js', 'js/app/sb-stream.js', 'js/app/sb-audio.js', 'js/app/sb-scene.js', 'js/app/superboss.js'] },
    'page:duel': { need: ['net'], js: ['js/app/duel3d.js', 'js/app/duel.js'] },
    'page:party': { need: ['net', 'boss'], js: ['js/app/party.js'] },
    'page:u': { need: ['net'], js: ['js/app/players.js'] },
    'page:commons': { need: ['net'], css: ['css/commons.css'], js: ['js/app/player-card.js', 'js/app/commons.js'] },
    'page:leaderboard': { need: ['net'], js: ['js/app/leaderboard.js'] },
    'page:shop': { js: ['js/app/shop.js'] },
    'page:room': { js: ['js/app/room.js'] },
    'page:profile': { need: ['net', 'avatarEdit'], js: ['js/app/stats-view.js', 'js/app/profile.js'] },
  };
  // the group that defines each global other pages wait on
  const PROVIDES = { Breach: 'breach', Room: 'room', RoomItems: 'room', RushPage: 'rush', RushBoard: 'rushBoard',
    MultiUI: 'net', Net: 'net', AvatarCreator: 'avatarEdit', WordBank: 'words', LEARN: 'learn', Combat: 'combat' };

  const files = new Map(), groups = new Map();
  const url = f => new URL(f, document.baseURI).href;
  const have = f => !!document.querySelector(`script[src="${f}"],link[rel="stylesheet"][href="${f}"]`);

  function css(f) {
    if (!files.has(f)) files.set(f, have(f) ? Promise.resolve() : new Promise(ok => {
      const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: f });
      l.onload = l.onerror = () => ok();   // a missing style shouldn't stop the page
      document.head.append(l);
    }));
    return files.get(f);
  }
  // scripts go in with async off, so they download together and run in list order
  function js(f) {
    if (!files.has(f)) files.set(f, have(f) ? Promise.resolve() : new Promise((ok, fail) => {
      const s = Object.assign(document.createElement('script'), { src: url(f), async: false });
      s.onload = () => ok();
      s.onerror = () => { files.delete(f); fail(new Error(f + ' did not load')); };
      document.head.append(s);
    }));
    return files.get(f);
  }

  function need(name) {
    if (groups.has(name)) return groups.get(name);
    const g = G[name];
    if (!g) return Promise.reject(new Error('no group ' + name));
    const p = Promise.all((g.need || []).map(need))
      .then(() => Promise.all([...(g.css || []).map(css), ...g.js.map(js)]))
      .then(() => g.ready && until(g.ready))
      .catch(e => { groups.delete(name); throw e; });
    groups.set(name, p);
    return p;
  }
  const until = (test, ms = 30000) => new Promise((ok, fail) => {
    const t0 = Date.now();
    (function poll() { if (test()) ok(); else if (Date.now() - t0 > ms) fail(new Error('timed out')); else setTimeout(poll, 100); })();
  });
  const provide = global => window[global] || !PROVIDES[global] ? Promise.resolve() : need(PROVIDES[global]);

  // warm the next likely page once the current one is idle, without running anything
  function prefetch(name) {
    const g = G[name];
    if (!g) return;
    for (const f of [...(g.css || []), ...g.js]) {
      if (files.has(f) || document.querySelector(`link[href="${f}"]`)) continue;
      document.head.append(Object.assign(document.createElement('link'), { rel: 'prefetch', href: f }));
    }
    (g.need || []).forEach(prefetch);
  }

  // a pointer over a link, or focus on it, warms that page's files before the click
  const warm = ev => {
    const a = ev.target.closest && ev.target.closest('a[href^="#/"]');
    if (a) prefetch('page:' + a.getAttribute('href').slice(2).split('/')[0]);
  };
  document.addEventListener('pointerover', warm, { passive: true });
  document.addEventListener('focusin', warm);

  return { need, provide, prefetch, groups: G };
})();
