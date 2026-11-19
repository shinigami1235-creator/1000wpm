// Hash router. Each page registers { title, mount(el, params), unmount(), update?(params) }.
// Leaving a page calls its unmount so games, timers and WebGL stop.
// #/play/race passes ['race'] as params to the play page.
window.Router = (() => {
  const pages = {};
  let view = null, cur = null, curName = '';

  function register(name, page) { pages[name] = page; }

  function parse() {
    const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: pages[name] ? name : 'home', params };
  }

  function go(force) {
    const { name, params } = parse();
    if (!force && cur && name === curName) { if (cur.update) cur.update(params); return; }
    if (cur) { try { cur.unmount(); } catch (e) { console.error(e); } }
    view.innerHTML = '';
    curName = name; cur = pages[name];
    document.title = cur.title ? `${cur.title} | 10000WPM` : '10000WPM';
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
    addEventListener('hashchange', () => go());
    if (!/^#\//.test(location.hash)) history.replaceState(null, '', '#/home');
    go();
  }

  return { register, start, reload: () => go(true), current: () => curName };
})();
