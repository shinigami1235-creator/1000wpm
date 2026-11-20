// Avatar thumbnails for the whole site. Pages ask for an <img> and get UI.avatar's hooded
// figure straight away; the 3D module loads after the page has painted, renders each look
// once on its shared offscreen renderer and swaps the real picture in. Pictures are cached
// as data URLs keyed by a hash of the look, in memory and (small sizes) in localStorage.
window.Avatar = (() => {
  const D = window.AvatarData;
  const mem = new Map();
  // v4: MakeHuman skins, eyes and brows; older cached pictures are dropped
  const LS = 'wpm-avatar-thumbs-v4', LS_MAX = 24;
  let store = {};
  try { localStorage.removeItem('wpm-avatar-thumbs'); localStorage.removeItem('wpm-avatar-thumbs-v3'); store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { store = {}; }
  for (const [k, v] of Object.entries(store)) mem.set(k, v);

  let mod = null, loading = null, started = false;
  const queue = [], waiters = new Map();

  // pictures are rendered at the screen's pixel density, so they stay sharp on phones
  const DPR = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const px = (size, show) => Math.max(size, Math.round(show * DPR));
  const keyOf = (look, size, show = size) => `${D.hash(look)}-${px(size, show)}-${show <= 64 ? 's' : 'l'}`;
  const bots = new Map();

  // the player's own look, with anything not owned swapped for a free part
  function mine() {
    const p = WPM.profile();
    return D.usable(p.look || D.random(`me:${p.joined}:${p.avatar}`, { free: true }));
  }
  // simulated players get a look from their name, the same one every time
  function bot(name) {
    if (!bots.has(name)) bots.set(name, D.random('bot:' + name));
    return bots.get(name);
  }
  const fallback = (look, size) => UI.avatar(parseInt(D.hash(look), 36) % UI.AVATARS.length, size);

  function load() {
    if (loading) return loading;
    const url = new URL('js/app/avatar3d.js', document.baseURI).href;
    loading = import(url).then(async m => { await m.ready; mod = m; pump(); return m; })
      .catch(e => { console.warn('Avatar 3D did not load', e); });
    return loading;
  }
  // start loading once the page has painted, so avatars never hold up first paint
  function start() {
    if (started) return;
    started = true;
    const go = () => setTimeout(load, 120);
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  }

  function request(look, size, show, k) {
    if (mem.has(k) || queue.some(q => q.k === k)) return;
    queue.push({ look, size: px(size, show), show, k });
    if (mod) pump(); else start();
  }
  let busy = false;
  function pump() {
    if (busy || !mod || !queue.length) return;
    busy = true;
    setTimeout(async () => {
      const { look, size, show, k } = queue.shift();
      let url = null;
      try { url = await mod.thumb(look, size, { show }); } catch (e) { console.warn('avatar thumbnail', e); }
      if (url) { mem.set(k, url); persist(k, url, size); fill(k, url); }
      busy = false;
      pump();
    }, 0);
  }
  function persist(k, url, size) {
    if (size > 160) return;
    store[k] = url;
    const keys = Object.keys(store);
    if (keys.length > LS_MAX) for (const old of keys.slice(0, keys.length - LS_MAX)) delete store[old];
    try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { store = {}; }
  }
  function fill(k, url) {
    document.querySelectorAll(`img[data-avk="${k}"]`).forEach(i => { i.src = url; });
    (waiters.get(k) || []).forEach(f => f(url)); waiters.delete(k);
  }

  // cached picture or null (and a render is queued)
  function src(look, size, show = size) {
    const k = keyOf(look, size, show);
    if (mem.has(k)) return mem.get(k);
    request(look, size, show, k);
    return null;
  }
  // HTML for an <img> that fills itself in when the picture is ready
  function img(look, size, show = size, attrs = '') {
    const k = keyOf(look, size, show);
    return `<img src="${src(look, size, show) || fallback(look, size)}" data-avk="${k}" width="${show}" height="${show}"${/\balt=/.test(attrs) ? '' : ' alt=""'} ${attrs}>`;
  }
  function apply(el, look, size) {
    const show = +el.getAttribute('width') || el.clientWidth || size;
    const k = keyOf(look, size, show);
    el.dataset.avk = k;
    el.src = src(look, size, show) || fallback(look, size);
  }
  function thumb(look, size, show = size) {
    const k = keyOf(look, size, show);
    if (mem.has(k)) return Promise.resolve(mem.get(k));
    return new Promise(res => {
      if (!waiters.has(k)) waiters.set(k, []);
      waiters.get(k).push(res);
      request(look, size, show, k);
    });
  }

  // the shop shows each avatar item worn by a plain model
  const MODEL = { v: 1, f: { sex: -30, jawW: 10 }, sk: 4, ec: 1, h: 'buzz', hc: 1, fh: 'none', g: [], o: 'crew', oc: 0, gl: 'green' };
  const FEM_HAIR = ['bob', 'long', 'braids', 'longstraight', 'longlayered', 'ponytail', 'bun', 'curly'];
  function wearing(item) {
    let L = { ...MODEL, f: { ...MODEL.f }, g: [] };
    if (item.slot === 'h') { L.h = item.part; if (FEM_HAIR.includes(item.part)) L.f = { sex: 70 }; }
    else if (item.slot === 'fh') L.fh = item.part;
    else if (item.slot === 'bs') L.bs = item.part;
    else if (item.slot === 'g') L = D.withGear(L, item.part);
    else if (item.slot === 'o') L.o = item.part;
    else if (item.slot === 'hc') { L.hc = item.part; L.h = 'undercut'; }
    else if (item.slot === 'ec') L.ec = item.part;
    else if (item.slot === 'gl') L.gl = item.part;
    else if (item.slot === 'mkc') {
      const [layer, i] = String(item.part).split('-');
      L.f = { sex: 70 }; L.h = 'bun'; L.mk = { ...D.MK_DEFAULT, liner: 'winged', [layer + 'C']: +i, [layer + 'S']: 75, glossS: layer === 'lip' ? 35 : 0 };
    }
    return L;
  }
  const itemThumb = item => thumb(wearing(item), 220);

  // the 3D view for the creator
  async function viewer(host, opts) {
    const m = await load();
    if (!m) return null;
    return new window.Avatar3D.Viewer(host, opts);
  }

  return { mine, bot, src, img, apply, thumb, itemThumb, wearing, viewer, load, fallback, keyOf };
})();
