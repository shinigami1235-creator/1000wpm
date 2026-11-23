// Motion: the site's small animations, made with Anime.js 4.5.0 (lib/anime/, MIT, pinned).
// The library loads after the page is up, so nothing waits for it; until it arrives,
// everything here quietly does nothing.
//
//   Motion.decode(el)          the element's text decodes into place with scrambleText.
//                              Page titles, the typing test's WPM result and shop prices
//                              get it on their own as they appear (see WATCH below).
//   Motion.letter(span, ok)    a typed letter pops (right) or shakes (wrong). TypeText in
//                              js/core.js calls it for every key.
//   Motion.attach(typetextEl)  lets the letters of a TypeText box move (see .typetext.pops)
//   Motion.gauge(svg, max)     a needle that follows a value with createAnimatable:
//                              { set(value), destroy() }
//
// Reduced motion: titles, results and prices fade in, letters fade instead of moving,
// and the needle jumps to its value without sweeping.
window.Motion = (() => {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => mq.matches;
  let A = null, loading = null;
  const boxes = new Set();

  function load() {
    if (!loading) {
      loading = import(new URL('lib/anime/anime.esm.min.js', document.baseURI).href)
        .then(m => { A = m; boxes.forEach(paintBox); return m; })
        .catch(e => { console.error('Anime.js did not load', e); return null; });
    }
    return loading;
  }
  const whenIdle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 300));

  // ---------- decoding text into place ----------
  // The text to decode is the element's own last run of text, so an icon or a "> " prefix
  // beside it stays as it is: that run is wrapped in a span the first time.
  function textHost(el) {
    for (let n = el; n; ) {
      const texts = [...n.childNodes].filter(c => c.nodeType === 3 && c.nodeValue.trim());
      if (texts.length) {
        const t = texts[texts.length - 1];
        if (n.childNodes.length === 1) return n;
        const span = document.createElement('span');
        span.className = 'dec';
        t.replaceWith(span); span.append(t);
        return span;
      }
      n = [...n.children].reverse().find(c => c.textContent.trim() && !c.matches('svg, .sr-only, .pre'));
    }
    return null;
  }
  function decode(el) {
    if (!el || el.dataset.dec) return;
    el.dataset.dec = '1';
    const host = textHost(el);
    if (!host) return;
    const text = host.textContent;
    if (!text.trim() || text.length > 40 || /[<>&]/.test(text)) return;
    const run = () => {
      if (!A || !host.isConnected) return;
      if (reduce()) { A.animate(host, { opacity: [0, 1], duration: 220, ease: 'linear' }); return; }
      // a live region would read every random frame aloud, so it waits until the text settles
      const live = host.closest('[aria-live]');
      if (live) live.setAttribute('aria-busy', 'true');
      const digits = /^[\d,.\s%:+-]+$/.test(text);
      A.animate(host, {
        innerHTML: A.scrambleText({ text, chars: digits ? 'numbers' : 'lowercase', seed: text.length, cursor: !digits }),
        duration: Math.min(900, 320 + text.length * 45),
        ease: 'linear',
        onComplete: () => { host.textContent = text; if (live) live.removeAttribute('aria-busy'); },
      });
    };
    if (A) run(); else load().then(run);
  }

  // What decodes by itself when it appears in the page: page titles (short ones; a heading
  // that is a sentence stays still), the typing test's WPM result and the shop's prices.
  const WATCH = [
    'h1:not(.sr-only)',
    '.page-type .result .big',
    '.page-shop .price',
  ].join(',');
  const pending = new Set();
  let flushing = 0;
  function flush() {
    flushing = 0;
    const play = window.UI && UI.playing && UI.playing();
    for (const el of pending) if (el.isConnected && !el.closest('.typetext') && !(play && el.matches('h1'))) decode(el);
    pending.clear();
  }
  function watch(root) {
    const scan = n => {
      if (n.nodeType !== 1) return;
      if (n.matches(WATCH)) pending.add(n);
      n.querySelectorAll(WATCH).forEach(x => pending.add(x));
    };
    new MutationObserver(list => {
      for (const m of list) m.addedNodes.forEach(scan);
      if (pending.size && !flushing) flushing = requestAnimationFrame(flush);
    }).observe(root, { childList: true, subtree: true });
    scan(root);
    if (pending.size) flushing = requestAnimationFrame(flush);
  }

  // ---------- typed letters ----------
  // A letter can only scale or move as an inline-block, and inline-block letters could wrap
  // in the middle of a word, so .typetext.pops keeps each word on one line (css/site.css).
  // The class goes on only with full motion; reduced motion fades letters in place.
  function paintBox(el) {
    const on = !!A && !reduce();
    if (el.classList.contains('pops') === on) return;
    el.classList.toggle('pops', on);
    const t = el.__tt;
    if (t) { t.invalidate(); if (t.spans && t.spans.length) t.place(t.caret, t.pos); }
  }
  function attach(el) {
    if (!el) return;
    boxes.add(el);
    paintBox(el);
    if (!A) load();
  }
  function letter(s, ok) {
    if (!A || !s) return;
    if (reduce()) { A.animate(s, { opacity: [ok ? 0.5 : 0.25, 1], duration: 160, ease: 'linear' }); return; }
    if (!s.parentNode || !s.parentNode.parentNode || !s.parentNode.parentNode.classList.contains('pops')) return;
    if (ok) A.animate(s, { scale: [1.3, 1], y: [-2, 0], duration: 190, ease: 'out(3)' });
    else A.animate(s, { x: [0, -4, 4, -3, 2, 0], duration: 240, ease: 'linear' });
  }

  // ---------- the WPM needle ----------
  // The svg holds an element with data-needle, drawn pointing straight up and turning
  // around the gauge's centre: -90deg is 0, +90deg is max.
  function gauge(svg, max) {
    const needle = svg && svg.querySelector('[data-needle]');
    let anim = null, last = 0, gone = false;
    const angle = v => -90 + 180 * Math.max(0, Math.min(1, v / max));
    const make = () => {
      if (!A || !needle || gone) return;
      anim = A.createAnimatable(needle, { rotate: reduce() ? 0 : 450, ease: 'out(3)' });
      anim.rotate(angle(last));
    };
    if (A) make(); else load().then(make);
    const onMq = () => { if (anim) anim.revert(); anim = null; make(); };
    mq.addEventListener('change', onMq);
    return {
      set(v) { last = v; if (anim) anim.rotate(angle(v)); else if (needle) needle.style.transform = `rotate(${angle(v)}deg)`; },
      destroy() { gone = true; mq.removeEventListener('change', onMq); if (anim) anim.revert(); anim = null; },
    };
  }

  mq.addEventListener('change', () => boxes.forEach(paintBox));
  // forget boxes that left the page
  setInterval(() => { for (const b of boxes) if (!b.isConnected) boxes.delete(b); }, 5000);

  function start() {
    const view = document.getElementById('view');
    if (view) watch(view);
    whenIdle(load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  return { decode, letter, attach, gauge, load, ready: () => !!A };
})();
