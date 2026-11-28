// Adds My Room's styles and scripts to the page. The site includes only this file.
// The tier rooms (28 Nov 2026) replaced the 3D room; its files stay in this folder and
// js/room/load-3d.js still loads them (tools/room-bake.html uses it to bake item cut-outs).
(() => {
  const me = document.currentScript && document.currentScript.src;
  const base = me ? me.slice(0, me.lastIndexOf('/') + 1) : 'js/room/';
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = base + 'tier.css';
  document.head.appendChild(css);
  for (const f of ['ctrl-art.js', 'scenes.js', 'tier-items.js', 'tier-art.js', 'tier-view.js', 'tier-page.js']) {
    const s = document.createElement('script');
    s.src = base + f;
    s.async = false;
    document.head.appendChild(s);
  }
})();
