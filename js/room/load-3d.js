// The old 3D room (kept, not loaded since the tier rooms replaced it on 28 Nov 2026): adds its
// styles and scripts to the page. tools/room-bake.html uses it to bake the item cut-outs.
(() => {
  const me = document.currentScript && document.currentScript.src;
  const base = me ? me.slice(0, me.lastIndexOf('/') + 1) : 'js/room/';
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = base + 'room.css';
  document.head.appendChild(css);
  const files = ['aq.js', 'kit.js', 'items.js', 'home-items.js', 'scenes.js', 'views.js', 'gift-items.js', 'room.js'];
  if (!window.KB_LAYOUTS) files.unshift('../keyboards.js');
  for (const f of files) {
    const s = document.createElement('script');
    s.src = base + f;
    s.async = false;
    document.head.appendChild(s);
  }
})();
