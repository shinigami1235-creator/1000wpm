// Breach loader. The site includes only this file, after words.js, core.js,
// state.js and the three.js import map. It adds the game's scripts in order and
// window.Breach works right away: a mount() made before the scripts finish runs
// once they have loaded.
(() => {
  const me = document.currentScript;
  const here = me ? me.src : location.href;
  window.BREACH_BASE = new URL('../../', here).href;
  if (!window.Breach) {
    const queue = [];
    window.Breach = {
      _queue: queue,
      mount: el => queue.push(['mount', el]),
      unmount: () => queue.push(['unmount']),
      fullscreen: () => queue.push(['fullscreen']),
      mounted: false,
    };
  }
  for (const name of ['audio', 'data', 'render', 'game']) {
    const s = document.createElement('script');
    s.src = new URL(name + '.js', here).href;
    s.async = false;
    document.head.appendChild(s);
  }
})();
