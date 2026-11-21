// Focus mode. From the first key of a typing test, a race or free typing, the nav, the
// falling code, Tilde and the panels around the text fade out and only the words and the
// caret stay. They come back on the result, on Esc, on a new route and when the mouse moves
// over the top bar. css/typing-extras.css does the fading with opacity and visibility, so
// nothing on the page moves.
// One setting, saved as wpm-focus: 'on' (the default) or 'off'.
window.Focus = (() => {
  const html = document.documentElement;
  const KEY = 'wpm-focus';
  const enabled = () => TT.store.get(KEY, 'on') !== 'off';
  function setEnabled(on) { TT.store.set(KEY, on ? 'on' : 'off'); if (!on) end(); }

  // the pages it runs on: the typing test, free typing and the race
  function here() {
    const [name = '', sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
    if (name === 'type') return sub === '' || sub === 'free';
    return name === 'play' && sub === 'race';
  }

  let fadeT = 0, want = false;
  function start(box) {
    if (!enabled() || !here() || want) return;
    want = true;
    // on a short screen the text can sit low with the panels above it gone, so bring it up
    if (box && box.getBoundingClientRect().top > innerHeight * 0.45) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollBy({ top: box.getBoundingClientRect().top - innerHeight * 0.2, behavior: reduce ? 'auto' : 'smooth' });
    }
    clearTimeout(fadeT);
    html.classList.add('focus-fade');
    // one frame later, so the transition is in place before the values change
    requestAnimationFrame(() => { if (want) html.classList.add('focus-typing'); });
  }
  function end() {
    if (!html.classList.contains('focus-fade')) return;
    want = false;
    html.classList.remove('focus-typing');
    clearTimeout(fadeT);
    fadeT = setTimeout(() => html.classList.remove('focus-fade'), 400);
  }
  const active = () => want;

  // A printable key in a typing box starts it. Phones send input events instead of keys.
  // The box drops its .idle class once typing is under way and gets it back on a result,
  // and the page's own handler runs before this one, so a box still idle is not typing.
  const boxOf = t => t.closest('.typebox') || t.parentElement.querySelector('.typebox') || t;
  const inBox = t => t && t.isConnected && t.classList && t.classList.contains('sr-input') && !boxOf(t).classList.contains('idle');
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { end(); return; }
    if (inBox(e.target) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) start(boxOf(e.target));
  });
  document.addEventListener('input', e => { if (inBox(e.target)) start(boxOf(e.target)); });

  // the mouse over the top bar brings everything back
  document.addEventListener('mousemove', e => {
    if (!active()) return;
    const top = document.querySelector('header.top');
    const h = top ? top.offsetHeight : 70;
    if (e.clientY <= h + 8) end();
  }, { passive: true });

  addEventListener('wpm-route', end);
  return { start, end, active, enabled, setEnabled };
})();
