// Tabs on the Type page: the typing test (js/app/type.js), the academy (js/app/learn.js)
// and free typing (js/app/free.js). #/type is the test, #/type/learn and #/type/free the
// other two, so the nav keeps its eight items. This file also names the new run modes for
// the profile and leaderboard and shows new players a line on the home page that points
// to the academy.
(() => {
  const test = Router.get && Router.get('type');
  if (!test) return;

  // the academy, free typing and reel (#/type/reel, js/app/reel.js) load with the 'learn'
  // group the first time one of their tabs opens, so the test itself starts light
  const TABS = [['test', 'Typing test', '#/type'], ['learn', 'Academy', '#/type/learn'], ['free', 'Free typing', '#/type/free'], ['reel', 'Reel', '#/type/reel']];
  const pageOf = t => t === 'learn' ? LearnPage : t === 'free' ? FreePage : t === 'reel' ? ReelPage : test;
  const tabOf = params => ['learn', 'free', 'reel'].includes(params[0]) ? params[0] : 'test';
  let root = null, holder = null, cur = null, curTab = '';

  // a player with no runs, no placement test and no lessons yet
  function isNew() {
    const l = WPM.learn();
    return !WPM.sessions().length && !l.placement && !Object.keys(l.lessons || {}).length;
  }

  let asked = 0;   // a tab that waits for its scripts opens only if no other tab was picked meanwhile
  function show(params) {
    asked++;
    const t = tabOf(params);
    root.querySelectorAll('.ty-tabs a').forEach(a => {
      if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const nudge = root.querySelector('.ty-nudge');
    if (nudge) nudge.hidden = t !== 'test' || !isNew();
    if (t === curTab && cur) { if (cur.update) cur.update(params.slice(1)); return; }
    if (cur) { try { cur.unmount(); } catch (e) { console.error(e); } }
    cur = null; curTab = '';
    holder.innerHTML = '';
    if (t !== 'test' && !window.LearnPage) {
      holder.innerHTML = '<div class="loading-state">Loading</div>';
      const ask = asked;
      Lazy.need('learn').then(() => { if (holder && ask === asked) show(params); },
        e => { console.error(e); if (holder) holder.innerHTML = '<div class="loading-state">This tab did not load. Check the connection and reload.</div>'; });
      return;
    }
    const el = document.createElement('div');
    el.className = 'ty-' + t;
    holder.append(el);
    cur = pageOf(t); curTab = t;
    try { cur.mount(el, t === 'test' ? params : params.slice(1)); } catch (e) { console.error(e); }
    if (t !== 'learn') document.title = `${t === 'free' ? 'Free typing' : t === 'reel' ? 'Reel' : 'Type'} | lowercase`.toLowerCase();
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
})();
