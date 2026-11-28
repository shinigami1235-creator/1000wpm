// Hash router. Each page registers { title, mount(el, params), unmount(), update?(params) }.
// Leaving a page calls its unmount so games, timers and WebGL stop.
// #/play/race passes ['race'] as params to the play page.
window.Router = (() => {
  const pages = {};
  let view = null, cur = null, curName = '', curHash = '';
  // a fight in progress (js/app/game-guard.js) can hold a route change: guard(want) returns true to let
  // it through, or false and calls leave(want) itself once the player has said yes
  let guard = null;

  function register(name, page) { pages[name] = page; }
  // a page whose scripts load on first visit (js/app/lazy.js). The stand-in shows
  // "Loading", and once the scripts have run the real page is registered and mounted.
  function lazy(name, group = 'page:' + name) {
    if (pages[name]) return;
    let live = false;
    pages[name] = {
      title: '',
      lazy: true,
      mount(el) {
        live = true;
        el.innerHTML = '<div class="loading-state brand-load" role="status"><svg viewBox="0 0 2001 2428" aria-hidden="true"><use href="#i-ctrl"/></svg><span class="bl-bar" aria-hidden="true"></span><span class="sr-only">Loading</span></div>';
        Lazy.need(group).then(() => {
          if (live && curName === name && pages[name] && !pages[name].lazy) go(true);
        }, e => {
          console.error(e);
          if (!live) return;
          el.innerHTML = '<div class="loading-state">This page did not load. Check the connection. <button class="btn out sm" type="button">Reload</button></div>';
          el.querySelector('button').addEventListener('click', () => location.reload());
        });
      },
      unmount() { live = false; },
    };
  }

  function parse() {
    const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: pages[name] ? name : 'home', params };
  }

  function go(force) {
    curHash = location.hash;
    const { name, params } = parse();
    if (!force && cur && name === curName) { if (cur.update) cur.update(params); return; }
    if (cur) { try { cur.unmount(); } catch (e) { console.error(e); } }
    view.innerHTML = '';
    curName = name; cur = pages[name];
    document.title = cur.title ? `${cur.title} | Stormtyper` : 'Stormtyper by 10000wpm';
    document.querySelectorAll('#nav a').forEach(a => {
      if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const el = document.createElement('div');
    el.className = 'page page-' + name;
    view.append(el);
    scrollTo(0, 0);
    try { cur.mount(el, params); } catch (e) { console.error(e); }
    dispatchEvent(new CustomEvent('wpm-route', { detail: { name, params } }));
  }

  function start(v) {
    view = v;
    addEventListener('hashchange', () => {
      if (guard && location.hash !== curHash && guard(location.hash) !== true) { history.replaceState(null, '', curHash); return; }
      go();
    });
    if (!/^#\//.test(location.hash)) history.replaceState(null, '', '#/home');
    go();
  }

  function leave(hash) { guard = null; if (hash && hash !== location.hash) location.hash = hash; else go(true); }

  return { register, lazy, get: name => pages[name], start, reload: () => go(true), current: () => curName,
    guard: fn => { guard = fn || null; }, leave };
})();
