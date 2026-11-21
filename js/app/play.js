// #/play: the game hub. #/play/breach mounts the game agent's window.Breach,
// #/play/race mounts the race and #/play/rush mounts Boss rush (js/app/rush/page.js).
// Only one game runs at a time.
Router.register('play', (() => {
  let el, game = '', stopGame = null;

  function mount(root, params) {
    el = root;
    el.innerHTML = `
      <div class="play-head">
        <div class="title-block"><h1>Play_</h1><p>// GAMES</p></div>
      </div>
      <nav class="game-tabs" aria-label="Games">
        <a class="panel game-tab" href="#/play/breach" data-g="breach"><span class="label">&gt; GAME 01</span><h3>Breach</h3><p>Five chapters with a boss at the end of each, plus endless and a daily run.</p></a>
        <a class="panel game-tab" href="#/play/race" data-g="race"><span class="label">&gt; GAME 02</span><h3>Race</h3><p>Your car's speed comes from your typing speed. Race Art, your best run or a friend.</p></a>
        <a class="panel game-tab" href="#/play/rush" data-g="rush"><span class="label">&gt; GAME 03</span><h3>Boss rush</h3><p>Copies of every boss Art has beaten, one after another, each harder than the last.</p></a>
        <a class="panel game-tab" href="#/superboss" data-g="superboss"><span class="label">&gt; LIVE</span><h3>Superboss</h3><p>Art fights these bosses on his stream. Watch, chat and send him support with your coins.</p></a>
        <a class="panel game-tab" href="#/duel" data-g="duel"><span class="label">&gt; PVP</span><h3>Duel</h3><p>Type against another player, best of 3 rounds. Challenge Art at 204 wpm.</p></a>
        <a class="panel game-tab" href="#/party" data-g="party"><span class="label">&gt; CO-OP</span><h3>Party</h3><p>Up to 4 players pick roles and fight through Keyspace together.</p></a>
      </nav>
      <div data-game></div>`;
    update(params);
  }

  function update(params) {
    const want = params && (params[0] === 'race' || params[0] === 'rush') ? params[0] : 'breach';
    if (want === game) return;
    stop();
    game = want;
    el.querySelectorAll('.game-tab').forEach(a => a.dataset.g === game ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    const host = el.querySelector('[data-game]');
    host.innerHTML = '';
    if (game === 'breach') breach(host); else if (game === 'rush') rush(host); else race(host);
  }

  function breach(host) {
    const panel = UI.el(`<section class="panel" aria-label="Breach">
      <div class="game-bar"><p>Click the game and start typing.</p><button class="btn out" type="button" data-full>Full screen</button></div>
      <div class="breach-box" data-box tabindex="-1"></div>
    </section>`);
    host.append(panel);
    const box = panel.querySelector('[data-box]');
    let mounted = false;
    const cancel = UI.waitFor('Breach', box, B => { B.mount(box); mounted = true; });
    panel.querySelector('[data-full]').addEventListener('click', () => {
      if (mounted && window.Breach.fullscreen) window.Breach.fullscreen();
      else if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
    });
    stopGame = () => { cancel(); if (mounted && window.Breach) window.Breach.unmount(); };
  }

  function race(host) {
    const panel = UI.el(`<section class="panel race-panel" aria-label="Race" tabindex="-1"></section>`);
    host.append(panel);
    const r = RaceGame.mount(panel);
    stopGame = () => r.destroy();
  }

  function rush(host) {
    const box = UI.el('<div class="rush-host"></div>');
    host.append(box);
    let r = null;
    const cancel = UI.waitFor('RushPage', box, R => { r = R.mount(box, el); });
    stopGame = () => { cancel(); if (r) r.destroy(); };
  }

  function stop() {
    if (stopGame) { try { stopGame(); } catch (e) { console.error(e); } }
    stopGame = null;
  }

  function unmount() { stop(); game = ''; el = null; }

  return { title: 'Play', mount, update, unmount };
})());
