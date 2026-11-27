// #/play: the game hub. #/play on its own shows the game picker (js/app/play-picker.js).
// #/play/breach mounts the game agent's window.Breach,
// #/play/race mounts the race and #/play/rush mounts Boss rush (js/app/rush/page.js).
// Only one game runs at a time.
Router.register('play', (() => {
  let el, game = '', stopGame = null;

  function mount(root, params) {
    el = root;
    el.innerHTML = `
      <div class="play-head">
        <div class="title-block"><h1><a href="#/play" class="play-home">Play_</a></h1><p data-sub>// GAMES</p></div>
      </div>
      <nav class="game-tabs" aria-label="Games">
        <a class="panel game-tab" href="#/play/breach" data-g="breach"><span class="label">&gt; GAME 01</span><h3>Breach</h3></a>
        <a class="panel game-tab" href="#/play/race" data-g="race"><span class="label">&gt; GAME 02</span><h3>Race</h3></a>
        <a class="panel game-tab" href="#/play/rush" data-g="rush"><span class="label">&gt; GAME 03</span><h3>Boss rush</h3></a>
        <a class="panel game-tab" href="#/superboss" data-g="superboss"><span class="label">&gt; LIVE</span><h3>Superboss</h3></a>
        <a class="panel game-tab" href="#/duel" data-g="duel"><span class="label">&gt; PVP</span><h3>Duel</h3></a>
        <a class="panel game-tab" href="#/party" data-g="party"><span class="label">&gt; CO-OP</span><h3>Party</h3></a>
        <a class="panel game-tab" href="#/commons" data-g="commons"><span class="label">&gt; CHAT</span><h3>Open Port</h3></a>
      </nav>
      <div data-game></div>`;
    update(params);
  }

  function update(params) {
    const want = params && ['breach', 'race', 'rush'].includes(params[0]) ? params[0] : 'pick';
    if (want === game) return;
    stop();
    game = want;
    el.classList.toggle('picking', game === 'pick');
    el.classList.toggle('play-racing', game === 'race');
    el.querySelector('[data-sub]').textContent = game === 'pick' ? (matchMedia('(hover: none)').matches ? '// pick a game' : '// pick a game. Type its name to start it.') : '// GAMES';
    const host0 = el.querySelector('[data-game]');
    if (game === 'pick') {
      host0.innerHTML = '';
      const cancel = UI.waitFor('PlayPicker', host0, P => { const pk = P.mount(host0); stopGame = () => pk.destroy(); });
      stopGame = () => cancel();
      return;
    }
    el.querySelectorAll('.game-tab').forEach(a => a.dataset.g === game ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    // on narrow screens the row scrolls sideways, so bring the open game's tile into view
    const tab = el.querySelector(`.game-tab[data-g="${game}"]`);
    if (tab.scrollIntoView && el.querySelector('.game-tabs').scrollWidth > el.querySelector('.game-tabs').clientWidth) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

  function unmount() { stop(); game = ''; if (el) el.classList.remove('picking', 'play-racing'); el = null; }

  return { title: 'Play', mount, update, unmount };
})());
