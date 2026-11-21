// Tabs on the Type page: the typing test (js/app/type.js), the academy (js/app/learn.js)
// and free typing (js/app/free.js). #/type is the test, #/type/learn and #/type/free the
// other two, so the nav keeps its eight items. This file also names the new run modes for
// the profile and leaderboard and shows new players a line on the home page that points
// to the academy.
(() => {
  const test = Router.get && Router.get('type');
  if (!test || !window.LearnPage || !window.FreePage) return;

  const TABS = [['test', 'Typing test', '#/type'], ['learn', 'Academy', '#/type/learn'], ['free', 'Free typing', '#/type/free']];
  // #/type/reel is the reel recorder in js/app/reel.js, shown as a fourth tab when loaded
  if (window.ReelPage) TABS.push(['reel', 'Reel', '#/type/reel']);
  const pageOf = t => t === 'learn' ? LearnPage : t === 'free' ? FreePage : t === 'reel' ? ReelPage : test;
  const tabOf = params => ['learn', 'free'].includes(params[0]) || (params[0] === 'reel' && window.ReelPage) ? params[0] : 'test';
  let root = null, holder = null, cur = null, curTab = '';

  // a player with no runs, no placement test and no lessons yet
  function isNew() {
    const l = WPM.learn();
    return !WPM.sessions().length && !l.placement && !Object.keys(l.lessons || {}).length;
  }

  function show(params) {
    const t = tabOf(params);
    root.querySelectorAll('.ty-tabs a').forEach(a => {
      if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const nudge = root.querySelector('.ty-nudge');
    if (nudge) nudge.hidden = t !== 'test' || !isNew();
    if (t === curTab && cur) { if (cur.update) cur.update(params.slice(1)); return; }
    if (cur) { try { cur.unmount(); } catch (e) { console.error(e); } }
    holder.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'ty-' + t;
    holder.append(el);
    cur = pageOf(t); curTab = t;
    try { cur.mount(el, t === 'test' ? params : params.slice(1)); } catch (e) { console.error(e); }
    if (t !== 'learn') document.title = `${t === 'free' ? 'Free typing' : t === 'reel' ? 'Reel' : 'Type'} | 10000WPM`;
  }

  Router.register('type', {
    title: 'Type',
    mount(el, params) {
      root = el; cur = null; curTab = '';
      el.innerHTML = `<nav class="ty-tabs" aria-label="Type">
          ${TABS.map(([id, name, href]) => `<a href="${href}" data-tab="${id}">${name}</a>`).join('')}
          <p class="ty-nudge" hidden>New to typing? The <a href="#/type/learn">academy</a> starts from the home row.</p>
        </nav><div class="ty-body"></div>`;
      holder = el.querySelector('.ty-body');
      show(params || []);
    },
    update(params) { show(params || []); },
    unmount() { if (cur) { try { cur.unmount(); } catch (e) { console.error(e); } } cur = null; curTab = ''; root = holder = null; },
  });

  // names for the new run modes
  const baseName = UI.modeName;
  UI.modeName = (m, d) => {
    if (/^learn-/.test(m)) { const L = LEARN.byId(m.slice(6)); return L ? `Academy, ${L.title}` : 'Academy'; }
    if (m === 'placement') return 'Placement test';
    if (m === 'free') return 'Free typing';
    return baseName(m, d);
  };

  // home page line for new players, under the race. Hide stays hidden on this device.
  addEventListener('wpm-route', ({ detail }) => {
    if (detail.name !== 'home' || !isNew() || TT.store.get('wpm-learn-nudge', '') === 'off') return;
    const page = document.querySelector('.page-home');
    if (!page || page.querySelector('.home-nudge')) return;
    const p = UI.el(`<p class="home-nudge"><span>New to typing? The <a href="#/type/learn">academy</a> teaches it from the home row.</span>
      <button type="button" aria-label="Hide this line"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg></button></p>`);
    p.querySelector('button').addEventListener('click', () => { TT.store.set('wpm-learn-nudge', 'off'); p.remove(); });
    const race = page.querySelector('.hero-race');
    if (race) race.after(p); else page.prepend(p);
  });
})();
