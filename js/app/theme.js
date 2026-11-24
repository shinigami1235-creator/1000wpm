// Colour themes. Loaded in <head> before the page paints, so a saved theme shows from the
// first frame. The CSS colours live in css/site.css (:root and :root[data-theme]). Canvases and
// 3D scenes read the current colours from here when they mount:
//   Theme.hex('accent') -> '#39ff88'      Theme.list -> [{ id, name, note, accent, bg, ink }]
//   Theme.id() / Theme.set(id)            the 'wpm-theme' event fires after a change
window.Theme = (() => {
  const KEY = 'wpm-theme';
  const list = [
    { id: 'matrix', name: 'Matrix', note: 'The original green', accent: '#39ff88', bg: '#040806', ink: '#d7f5e3' },
    { id: 'ctrl', name: 'CTRL', note: 'Lime on steel', accent: '#8cff58', bg: '#060707', ink: '#e4e8ea' },
    { id: 'ice', name: 'Ice', note: 'Blue team', accent: '#5cc8ff', bg: '#03070b', ink: '#d8ecf7' },
    { id: 'amber', name: 'Amber', note: 'Old terminal', accent: '#ffb000', bg: '#0a0602', ink: '#f7e6c8' },
    { id: 'phosphor', name: 'Phosphor', note: 'White mono', accent: '#e8f0f2', bg: '#050606', ink: '#e8ecee' },
  ];
  const root = document.documentElement;
  const valid = id => list.some(t => t.id === id);
  let cur = 'matrix';
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (valid(v)) cur = v; } catch (e) {}
  if (cur !== 'matrix') root.dataset.theme = cur;

  // read a colour token as #rrggbb; works for any --name in css/site.css
  const cache = {};
  function hex(name) {
    if (cache[cur + name]) return cache[cur + name];
    let v = getComputedStyle(root).getPropertyValue('--' + name).trim();
    const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) {
      // a page without css/site.css (a test page): fall back to the theme's own swatch colours
      const t = list.find(x => x.id === cur);
      return v || (name === 'accent' ? t.accent : name === 'bg' || name === 'bg-0' ? t.bg : name === 'ink' ? t.ink : '#ffffff');
    }
    if (m[1].length === 3) v = '#' + m[1].split('').map(c => c + c).join('');
    return (cache[cur + name] = v.toLowerCase());
  }
  function set(id) {
    if (!valid(id) || id === cur) return;
    cur = id;
    if (id === 'matrix') delete root.dataset.theme; else root.dataset.theme = id;
    try { localStorage.setItem(KEY, JSON.stringify(id)); } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = hex('bg');
    dispatchEvent(new CustomEvent('wpm-theme', { detail: { id } }));
  }
  // 'r,g,b' for rgba() strings, and the number three.js colour setters accept
  const rgb = name => { const h = hex(name).slice(1); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0).join(','); };
  const rgba = (name, a) => `rgba(${rgb(name)},${a})`;
  const num = name => parseInt(hex(name).slice(1), 16) || 0xffffff;
  // a token mixed toward another colour: mix('accent', '#000000', 0.5) is the accent at half brightness
  function mix(name, other, k) {
    const a = rgb(name).split(',').map(Number), o = other.slice(1);
    const c = a.map((v, i) => Math.round(v + (parseInt(o.slice(i * 2, i * 2 + 2), 16) - v) * k));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return { list, id: () => cur, set, hex, rgb, rgba, num, mix };
})();
