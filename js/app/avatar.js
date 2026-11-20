// Avatar thumbnails for the whole site. Pages ask for an <img> and get UI.avatar's hooded
// figure straight away; the 3D module loads after the page has painted, renders each look
// once on its shared offscreen renderer and swaps the real picture in. Pictures are cached
// as data URLs keyed by a hash of the look, in memory and (small sizes) in localStorage.
window.Avatar = (() => {
  const D = window.AvatarData;
  const mem = new Map();
  const LS = 'wpm-avatar-thumbs', LS_MAX = 24;
  let store = {};
  try { store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { store = {}; }
  for (const [k, v] of Object.entries(store)) mem.set(k, v);

  let mod = null, loading = null, started = false;
  const queue = [], waiters = new Map();

  const keyOf = (look, size) => `${D.hash(look)}-${size}`;
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

  function request(look, size, k) {
    if (mem.has(k) || queue.some(q => q.k === k)) return;
    queue.push({ look, size, k });
    if (mod) pump(); else start();
  }
  let busy = false;
  function pump() {
    if (busy || !mod || !queue.length) return;
    busy = true;
    setTimeout(() => {
      const { look, size, k } = queue.shift();
      let url = null;
      try { url = mod.thumb(look, size); } catch (e) { console.warn('avatar thumbnail', e); }
      if (url) { mem.set(k, url); persist(k, url, size); fill(k, url); }
      busy = false;
      pump();
    }, 0);
  }
  function persist(k, url, size) {
    if (size > 96) return;
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
  function src(look, size) {
    const k = keyOf(look, size);
    if (mem.has(k)) return mem.get(k);
    request(look, size, k);
    return null;
  }
  // HTML for an <img> that fills itself in when the picture is ready
  function img(look, size, show = size, attrs = '') {
    const k = keyOf(look, size);
    return `<img src="${src(look, size) || fallback(look, size)}" data-avk="${k}" width="${show}" height="${show}"${/\balt=/.test(attrs) ? '' : ' alt=""'} ${attrs}>`;
  }
  function apply(el, look, size) {
    const k = keyOf(look, size);
    el.dataset.avk = k;
    el.src = src(look, size) || fallback(look, size);
  }
  function thumb(look, size) {
    const k = keyOf(look, size);
    if (mem.has(k)) return Promise.resolve(mem.get(k));
    return new Promise(res => {
      if (!waiters.has(k)) waiters.set(k, []);
      waiters.get(k).push(res);
      request(look, size, k);
    });
  }

  // the shop shows each avatar item worn by a plain model
  const MODEL = { v: 1, f: { sex: -30, jawW: 10 }, sk: 4, h: 'buzz', hc: 1, fh: 'none', g: [], o: 'crew', gl: 'green' };
  const FEM_HAIR = ['bob', 'long', 'braids'];
  function wearing(item) {
    let L = { ...MODEL, f: { ...MODEL.f }, g: [] };
    if (item.slot === 'h') { L.h = item.part; if (FEM_HAIR.includes(item.part)) L.f = { sex: 70 }; }
    else if (item.slot === 'fh') L.fh = item.part;
    else if (item.slot === 'g') L = D.withGear(L, item.part);
    else if (item.slot === 'o') L.o = item.part;
    else if (item.slot === 'hc') { L.hc = item.part; L.h = 'undercut'; }
    else if (item.slot === 'gl') L.gl = item.part;
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
