// A fight in progress holds on to the player (Gid, 28 Nov 2026):
//   - a menu link, the back button or a typed address asks "End the fight?" first, and closing the tab
//     gets the browser's own leave prompt
//   - Esc opens a menu: Resume, How to play (when the page has a guide) and End fight. Fights that can
//     stop the clock pause while it's open; the live raid can't, and the menu says so
//   - ending a fight, however it ends, shows the result: time, damage, words, the fight's own counts,
//     XP and coins, with share buttons
//
//   GameGuard.start({
//     name: 'raid',                       // "End the raid?"
//     live: () => bool,                   // false: nothing to guard right now (not typing yet, result showing)
//     pause: on => {},                    // optional; without it the menu says the fight keeps going
//     end: leaving => summary | null,     // records the fight and returns what the result shows
//     after: () => {},                    // what the page does after End fight from the Esc menu
//     guide: () => {},                    // optional: opens the page's How to play panel
//     esc: () => bool,                    // optional: false lets the page keep this Esc (a drawer is open)
//   })
//   GameGuard.stop()                      the page left the fight on its own (a result screen, unmount)
//   GameGuard.result(summary)             the result window on its own
//   GameGuard.shareHtml(text) + GameGuard.wire(root, text)   share buttons for a page's own result screen
//
// summary: { label, title, sub, stats: [[name, value]], xp, coins, share }
window.GameGuard = (() => {
  let g = null, dlg = null, mode = '', paused = false;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => (typeof n === 'number' ? Math.round(n).toLocaleString('en-US') : n);
  const live = () => !!(g && (!g.live || g.live()));
  const site = () => 'https://' + (window.SITE_URL || '10000wpm.com') + '/';

  function start(o) {
    stop();
    g = o;
    Router.guard(want => { if (!live()) return true; ask(want); return false; });
    addEventListener('beforeunload', unload);
    document.addEventListener('click', link, true);
  }
  function stop() {
    if (!g) return;
    if (mode === 'ask' || mode === 'menu') close();
    g = null;
    Router.guard(null);
    removeEventListener('beforeunload', unload);
    document.removeEventListener('click', link, true);
  }
  function unload(e) { if (live()) { e.preventDefault(); e.returnValue = ''; } }
  // menu links are caught before the address changes, so the history keeps no extra entry
  function link(e) {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a || a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    if (!live() || a.getAttribute('href') === location.hash) return;
    e.preventDefault(); e.stopPropagation();
    ask(a.getAttribute('href'));
  }

  // ---------- the window ----------
  function box() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'gg';
    dlg.setAttribute('aria-labelledby', 'gg-h');
    document.body.append(dlg);
    dlg.addEventListener('cancel', e => { e.preventDefault(); back(); });
    dlg.addEventListener('click', e => {
      const b = e.target.closest('[data-gg]');
      if (!b) { if (e.target === dlg && mode !== 'result') back(); return; }
      const k = b.dataset.gg;
      if (k === 'stay' || k === 'resume') back();
      else if (k === 'end') finish(dlg.dataset.want || '');
      else if (k === 'guide') { const o = g; back(); if (o && o.guide) o.guide(); }
      else if (k === 'done') close();
    });
    return dlg;
  }
  function show(m, html, focus) {
    const d = box();
    mode = m;
    d.innerHTML = html;
    d.dataset.mode = m;
    if (!d.open) d.showModal();
    const f = d.querySelector(focus || '[data-gg]');
    if (f) f.focus();
  }
  function close() {
    mode = '';
    if (dlg && dlg.open) dlg.close();
    if (dlg) delete dlg.dataset.want;
  }
  // Esc, the backdrop, Keep fighting and Resume: back to the fight
  function back() {
    if (mode === 'result') { close(); return; }
    close();
    if (paused && g && g.pause) g.pause(false);
    paused = false;
    // the page's typing box takes the keys again
    const ta = document.querySelector('#view .sr-input');
    if (ta) ta.focus({ preventScroll: true });
  }
  function hold() { if (g && g.pause && !paused) { paused = true; g.pause(true); } }
  const keepsGoing = () => (g.pause ? '' : `<p class="gg-note">The ${esc(g.name || 'fight')} keeps going while this is open.</p>`);

  function ask(want) {
    if (!g) return;
    hold();
    show('ask', `
      <h2 id="gg-h">End the ${esc(g.name || 'fight')}?</h2>
      <p>Your damage, XP and coins so far are saved and you get your result.</p>
      ${keepsGoing()}
      <div class="gg-row"><button class="btn out" type="button" data-gg="stay">Keep fighting</button><button class="btn" type="button" data-gg="end">End ${esc(g.name || 'fight')}</button></div>`);
    dlg.dataset.want = want || '';
  }
  function menu() {
    hold();
    show('menu', `
      <h2 id="gg-h">${g.pause ? 'Paused' : 'Menu'}</h2>
      ${keepsGoing()}
      <div class="gg-col">
        <button class="btn" type="button" data-gg="resume">Resume <kbd>Esc</kbd></button>
        ${g.guide ? '<button class="btn out" type="button" data-gg="guide">How to play</button>' : ''}
        <button class="btn out gg-end" type="button" data-gg="end">End ${esc(g.name || 'fight')}</button>
      </div>`);
  }
  function finish(want) {
    const o = g;
    close();
    paused = false;
    if (!o) return;
    let sum = null;
    try { sum = o.end(!!want); } catch (e) { console.error(e); }
    stop();
    if (want) Router.leave(want);
    else if (o.after) o.after();
    if (sum) result(sum);
  }

  // ---------- the result ----------
  function result(s) {
    const rows = (s.stats || []).filter(r => r && r[1] !== undefined && r[1] !== null);
    show('result', `
      <span class="gg-label"><svg class="gg-mark" viewBox="0 0 2380 2895" aria-hidden="true"><use href="#i-ctrl"/></svg>// ${esc(s.label || 'RESULT')}</span>
      <h2 id="gg-h">${esc(s.title || 'Fight over')}</h2>
      ${s.sub ? `<p class="gg-sub">${esc(s.sub)}</p>` : ''}
      <dl class="gg-stats">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${typeof v === 'number' ? fmt(v) : v}</dd></div>`).join('')}</dl>
      ${s.xp || s.coins ? `<p class="gg-gain">${window.UI && UI.coin ? UI.coin() : ''}<span><b>+${fmt(s.coins || 0)}</b> coins and <b>+${fmt(s.xp || 0)}</b> XP</span></p>` : ''}
      ${s.share ? shareHtml(s.share) : ''}
      <div class="gg-row"><button class="btn" type="button" data-gg="done">Done <kbd>Esc</kbd></button></div>`, '[data-gg="done"]');
    if (s.share) wire(dlg, s.share);
  }

  // ---------- share ----------
  function shareHtml(text) {
    const url = site(), t = encodeURIComponent(text), u = encodeURIComponent(url);
    return `<div class="gg-share">
      <span>Share your result</span>
      ${navigator.share ? '<button class="btn sm" type="button" data-share="native">Share</button>' : ''}
      <a class="btn out sm" href="https://x.com/intent/post?text=${t}&url=${u}" target="_blank" rel="noopener noreferrer">X</a>
      <a class="btn out sm" href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener noreferrer">Facebook</a>
      <button class="btn out sm" type="button" data-share="copy">Copy</button>
      ${window.ShareCard ? '<button class="btn out sm" type="button" data-share="image">Image</button>' : ''}
    </div>`;
  }
  function wire(root, text) {
    root.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', async () => {
      const full = `${text} ${site()}`;
      if (b.dataset.share === 'native') { try { await navigator.share({ title: 'Stormtyper', text, url: site() }); } catch (e) {} return; }
      // the result as a picture with the CTRL logo (js/app/share-card.js)
      if (b.dataset.share === 'image') { const r = await ShareCard.save(text); if (r === 'saved') { b.textContent = 'Saved'; setTimeout(() => { b.textContent = 'Image'; }, 1800); } return; }
      try { await navigator.clipboard.writeText(full); b.textContent = 'Copied'; } catch (e) { b.textContent = "Can't copy"; }
      setTimeout(() => { b.textContent = 'Copy'; }, 1800);
    }));
  }

  // ---------- keys ----------
  // capture phase on window, so the fight's own key handlers never see a key meant for the window
  addEventListener('keydown', e => {
    if (dlg && dlg.open) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); back(); }
      return;
    }
    if (e.key !== 'Escape' || e.repeat || !live()) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.classList.contains('sr-input')) return;
    if (g.esc && !g.esc()) return;
    e.preventDefault(); e.stopPropagation();
    menu();
  }, true);

  // an End button on the page: asks first while there's something to lose
  function confirm() { if (!g) return; if (live()) ask(''); else finish(''); }

  return { start, stop, confirm, result, shareHtml, wire, active: () => live(), open: () => !!(dlg && dlg.open) };
})();
