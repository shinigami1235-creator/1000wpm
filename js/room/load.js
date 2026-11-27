// Adds the room styles and scripts to the page. The site includes only this file.
(() => {
  const me = document.currentScript && document.currentScript.src;
  const base = me ? me.slice(0, me.lastIndexOf('/') + 1) : 'js/room/';
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = base + 'room.css';
  document.head.appendChild(css);
  const files = ['aq.js', 'kit.js', 'items.js', 'gift-items.js', 'room.js'];
  if (!window.KB_LAYOUTS) files.unshift('../keyboards.js');
  for (const f of files) {
    const s = document.createElement('script');
    s.src = base + f;
    s.async = false;
    document.head.appendChild(s);
  }
})();
