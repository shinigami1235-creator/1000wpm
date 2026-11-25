// Player pictures for the whole site, drawn from operators (js/app/operator3d.js) since the
// operators replaced the faceted avatars (25 Nov 2026). Pages ask for an <img> and get UI.avatar's
// hooded figure straight away; three.js and the operator model load after the page has painted,
// each look is rendered once as a head-and-shoulders picture on one shared offscreen renderer and
// swapped in. Pictures are cached as data URLs keyed by a hash of the look, in memory and (small
// sizes) in localStorage.
//
// A look is { me: <saved preset or null> } for the player, { bot: name } for anyone else, or
// any other object, which is seeded into a random operator. Three.js and the model only load on
// the pages listed in RENDER_ON, or when a page asks for a picture with thumb(). Everywhere else
// a picture shows if it was rendered before and the hooded figure shows if not.
window.Avatar = (() => {
  const RENDER_ON = ['profile', 'u', 'duel', 'party', 'lab', 'boss', 'leaderboard'];
  const mem = new Map();
  // v5: operator portraits; older cached pictures are dropped
  const LS = 'wpm-avatar-thumbs-v5', LS_MAX = 24;
  let store = {};
  try { for (const k of ['wpm-avatar-thumbs', 'wpm-avatar-thumbs-v3', 'wpm-avatar-thumbs-v4']) localStorage.removeItem(k); store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { store = {}; }
  for (const [k, v] of Object.entries(store)) mem.set(k, v);

  let mod = null, loading = null, started = false;
  const queue = [], waiters = new Map();
  const later = new Map();   // asked for on a page that doesn't render; drawn if the <img> is still there when 3D loads
  const renders = () => window.Router && RENDER_ON.includes(Router.current());

  // pictures are rendered at the screen's pixel density, so they stay sharp on phones
  const DPR = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const px = (size, show) => Math.max(size, Math.round(show * DPR));
  function hash(o) { const s = JSON.stringify(o || {}); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  const keyOf = (look, size, show = size) => `${hash(look)}-${px(size, show)}-${show <= 64 ? 's' : 'l'}`;

  // the player's own operator as saved on the Operator page, and its owned gear (see render())
  function mine() {
    let p = null;
    try { p = window.TT && TT.store ? TT.store.get('wpm-operator', null) : null; } catch (e) { p = null; }
    const owned = window.WPM ? ['op-mask', 'kb-compact', 'kb-split', 'kb-arc'].filter(id => WPM.owns(id)) : [];
    return { me: p, owned };
  }
  // simulated players get an operator from their name, the same one every time
  const bot = name => ({ bot: String(name || 'x') });
  const fallback = (look, size) => UI.avatar(parseInt(hash(look), 36) % UI.AVATARS.length, size);

  // the portrait renderer: one offscreen WebGL canvas, an operator posed at rest, the camera on
  // its head and shoulders
  async function makeMod() {
    const [T, RB] = await Promise.all([import('three'), import('three/addons/geometries/RoundedBoxGeometry.js'),
      window.Lazy ? Lazy.need('operator') : Promise.resolve()]);
    const THREE = { ...T, RoundedBoxGeometry: RB.RoundedBoxGeometry };
    await Operator.loadModels(THREE, 'lite');   // portraits are small; a big one swaps in the full model when it loads
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c1411');
    scene.add(new THREE.HemisphereLight('#d8e2ea', '#0a0c0e', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(-1.2, 2.4, 2.2); scene.add(key);
    const rim = new THREE.DirectionalLight('#ffffff', 1.6); rim.position.set(1.6, 2, -1.8); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
    const at = new THREE.Vector3();
    function preset(look) {
      if (look && 'me' in look) {
        // only gear the player owns, the same rule as Operator.mine()
        const P = Operator.clean(look.me || Operator.defaults('male'));
        return Operator.locked(P);
      }
      return Operator.random(look && look.bot ? look.bot : hash(look));
    }
    return {
      async thumb(look, size) {
        rim.color.set(window.Theme ? Theme.hex('accent') : '#39ff88');
        renderer.setPixelRatio(1); renderer.setSize(size, size, false);
        const op = Operator.create(THREE, preset(look), { lite: size <= 320 });
        scene.add(op.group);
        op.at('idle', 0.4);
        op.group.updateMatrixWorld(true);
        const head = op.bones.Head.getWorldPosition(at);
        camera.position.set(head.x + 0.16, head.y + 0.05, head.z + 1.05);
        camera.lookAt(head.x, head.y - 0.04, head.z);
        renderer.render(scene, camera);
        let url = canvas.toDataURL('image/webp', 0.88);
        if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
        scene.remove(op.group); op.dispose();
        return url;
      },
    };
  }
  function load() {
    if (loading) return loading;
    loading = makeMod().then(m => {
      mod = m;
      for (const [k, q] of later) if (document.querySelector(`img[data-avk="${k}"]`)) queue.push(q);
      later.clear();
      pump(); return m;
    }).catch(e => { console.warn('Operator pictures did not load', e); });
    return loading;
  }
  // start loading once the page has painted, so avatars never hold up first paint
  function start() {
    if (started) return;
    started = true;
    const go = () => setTimeout(load, 120);
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  }

  function request(look, size, show, k, force) {
    if (mem.has(k)) return;
    const had = queue.find(q => q.k === k);
    if (had) { if (force) had.force = true; return; }
    const q = { look, size: px(size, show), show, k, force: !!force };
    if (!mod && !force && !renders()) { if (later.size < 200) later.set(k, q); return; }
    queue.push(q);
    if (mod) pump(); else start();
  }
  let busy = false;
  // one picture at a time. A picture is a full 3D render and a read-back on the main thread, so
  // while a fight is on (UI.playing) only pictures the fight asked for (thumb()) are drawn, and
  // pictures nobody shows any more are dropped.
  const wanted = q => q.force || waiters.has(q.k) || document.querySelector(`img[data-avk="${q.k}"]`);
  function next() {
    for (let i = queue.length - 1; i >= 0; i--) if (!wanted(queue[i])) queue.splice(i, 1);
    const playing = window.UI && UI.playing && UI.playing();
    const i = playing ? queue.findIndex(q => q.force) : 0;
    return i >= 0 && queue.length ? queue.splice(i, 1)[0] : null;
  }
  addEventListener('wpm-playing', ev => { if (!ev.detail.on) pump(); });
  function pump() {
    if (busy || !mod || !queue.length) return;
    const item = next();
    if (!item) return;
    busy = true;
    setTimeout(async () => {
      const { look, size, show, k } = item;
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
      request(look, size, show, k, true);
    });
  }

  // the old faceted avatar's live 3D view is gone; pages show the operator picture instead
  const viewer = () => Promise.resolve(null);
  const refresh = () => document.querySelectorAll('#nav-me img, img.me-pic').forEach(i => apply(i, mine(), +i.dataset.size || 68));

  return { mine, bot, src, img, apply, thumb, viewer, load, fallback, keyOf, refresh };
})();
