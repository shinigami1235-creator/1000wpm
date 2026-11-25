// #/shop: operator gear (REWARDS.shop.gear) and room items from window.RoomItems, bought with
// coins through WPM.buy, plus the
// CTRL Pass and coin packs from REWARDS.shop (js/app/rewards-config.js).
Router.register('shop', (() => {
  const thumbs = new Map();       // id -> dataURL, kept between visits
  let el, off = [], io = null, cancel = null, queue = [], busy = false;
  let cat = 'all', filter = 'all', sort = 'asc', search = '';

  function mount(root) {
    el = root;
    el.innerHTML = `
      <div class="panel shop-hero">
        <div class="title-block"><h1><span class="pre">&gt;</span>Shop_</h1><p>// ITEMS FOR MY ROOM AND AVATAR</p></div>
        <div class="panel coin-box hot">${UI.coin()}<b data-coins>${UI.fmt(WPM.coins())}</b></div>
      </div>
      <div data-body></div>`;
    off.push(WPM.on('coins', () => { if (el) el.querySelector('[data-coins]').textContent = UI.fmt(WPM.coins()); paintItems(false); }));
    off.push(WPM.on('inventory', () => paintItems(false)));
    const body = el.querySelector('[data-body]');
    cancel = UI.waitFor('RoomItems', body, () => build(body));
  }

  function catalog() {
    const c = window.RoomItems.catalog;
    const list = Array.isArray(c) ? c : Array.isArray(c && c.items) ? c.items
      : Object.entries(c || {}).flatMap(([k, v]) => Array.isArray(v) ? v.map(i => ({ category: k, ...i })) : [{ id: k, ...v }]);
    // operator gear (REWARDS.shop.gear) replaced the old avatar creator's items
    const gear = ((window.REWARDS && REWARDS.shop && REWARDS.shop.gear) || []).map(g => ({ ...g, category: 'Operator' }));
    return [...gear, ...list].filter(i => i && i.id && !i.gift).map(i => ({ item: i, cat: String(i.category || i.cat || i.type || 'other') }));
  }
  function categories(list) {
    const named = window.RoomItems.categories;
    const name = id => {
      if (Array.isArray(named)) {
        const f = named.find(x => (x.id || x) === id);
        if (f && f.name) return f.name;
      } else if (named && named[id]) return named[id].name || named[id];
      return id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ');
    };
    let ids = [...new Set(list.map(x => x.cat))];
    if (Array.isArray(named)) {
      const order = named.map(x => x.id || x);
      ids = [...order.filter(id => ids.includes(id)), ...ids.filter(id => !order.includes(id))];
      if (ids.includes('Operator')) ids = ['Operator', ...ids.filter(id => id !== 'Operator')];
    }
    return ids.map(id => ({ id, name: name(id), n: list.filter(x => x.cat === id).length }));
  }

  function build(body) {
    const list = catalog();
    body.innerHTML = `
      ${storeHtml()}
      <div class="shop">
        <aside class="panel">
          <div class="ph">// CATEGORIES</div>
          <div class="cats" data-cats>
            <button type="button" data-c="all">All items<span>${list.length}</span></button>
            ${categories(list).map(c => `<button type="button" data-c="${UI.esc(c.id)}">${UI.esc(c.name)}<span>${c.n}</span></button>`).join('')}
          </div>
          <a class="btn out" href="#/room" style="margin-top:16px;width:100%">Open My Room</a>
        </aside>
        <section>
          <div class="panel shop-bar">
            <div class="seg" data-f role="group" aria-label="Show">
              <button type="button" data-v="all">All</button><button type="button" data-v="owned">Owned</button><button type="button" data-v="not">Not owned</button>
            </div>
            <span class="grow"></span>
            <label class="sr-only" for="shop-sort">Sort</label>
            <select class="field" id="shop-sort" data-sort>
              <option value="asc">Price, low to high</option>
              <option value="desc">Price, high to low</option>
              <option value="name">Name</option>
            </select>
            <label class="sr-only" for="shop-search">Search items</label>
            <input class="field" id="shop-search" type="search" placeholder="Search items" autocomplete="off" data-search>
          </div>
          <div class="items" data-items></div>
        </section>
      </div>`;
    body.querySelector('[data-cats]').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { cat = b.dataset.c; paintItems(true); } });
    body.querySelector('[data-f]').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { filter = b.dataset.v; paintItems(true); } });
    const s = body.querySelector('[data-sort]'); s.value = sort;
    s.addEventListener('change', () => { sort = s.value; paintItems(true); });
    const q = body.querySelector('[data-search]'); q.value = search;
    q.addEventListener('input', () => { search = q.value.trim().toLowerCase(); paintItems(true); });
    io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); want(en.target); } }), { rootMargin: '200px' });
    paintItems(true);
  }

  // The CTRL Pass and coin packs (REWARDS.shop). Payments go through the server, so the
  // buttons stay off until it is live.
  function storeHtml() {
    const S = window.REWARDS && REWARDS.shop; if (!S || !S.payments) return '';
    const p = WPM.pass(), until = p.active ? new Date(p.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return `<section class="store" aria-label="CTRL Pass and coin packs">
      <article class="panel store-pass${p.active ? ' on' : ''}">
        <h2>${UI.esc(S.pass.name)}</h2>
        <p>Double coins from everything you play for ${S.pass.days} days. Every item in the shop can still be bought with coins you earn.</p>
        <div class="row">${p.active ? `<span class="owned">Active until ${UI.esc(until)}</span>` : `<b class="store-price">${UI.esc(S.pass.price)}</b><button class="btn out sm" type="button" disabled>Opens at launch</button>`}</div>
      </article>
      <div class="store-packs">
        ${S.packs.map(k => `<article class="panel store-pack"><b>${UI.coin()}${UI.fmt(k.coins)}</b><span>${UI.esc(k.price)}</span><button class="btn out sm" type="button" disabled>Opens at launch</button></article>`).join('')}
      </div>
      <p class="store-note">Payments open when the game server goes live.</p>
    </section>`;
  }

  // Thumbnails render one at a time since each one is a WebGL draw.
  function want(card) {
    const id = card.dataset.id;
    if (thumbs.has(id)) return setThumb(card, thumbs.get(id));
    queue.push(card); pump();
  }
  function pump() {
    if (busy || !queue.length || !el) return;
    const card = queue.shift(), id = card.dataset.id;
    if (thumbs.has(id)) { setThumb(card, thumbs.get(id)); return pump(); }
    busy = true;
    Promise.resolve().then(() => card._item.icon ? gearIcon(card._item.icon) : window.RoomItems.thumbnail(id)).then(url => {
      if (url) { thumbs.set(id, url); setThumb(card, url); }
    }).catch(e => console.warn('thumbnail', id, e)).finally(() => { busy = false; pump(); });
  }
  // Stand-in pictures for operator gear until the generated models have their own renders
  function gearIcon(kind) {
    const c = (window.Theme && Theme.hex('accent')) || '#39ff88';
    const keys = (x, y, w, n, rows, gap = 4) => { let k = ''; for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) k += `<rect x="${x + i * (w + gap)}" y="${y + r * (w + gap)}" width="${w}" height="${w}" rx="2"/>`; return k; };
    const art = {
      mask: `<path d="M44 92c8-20 104-20 112 0v22c-10 22-102 22-112 0z" fill="none" stroke="${c}" stroke-width="5"/><path d="M60 104h80M60 116h80" stroke="${c}" stroke-width="3" opacity=".6"/>`,
      'kb-compact': `<rect x="40" y="70" width="120" height="60" rx="6" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".8">${keys(50, 80, 10, 8, 3)}</g>`,
      'kb-split': `<g transform="rotate(-10 60 100)"><rect x="18" y="70" width="80" height="60" rx="6" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".8">${keys(27, 80, 10, 5, 3)}</g></g><g transform="rotate(10 140 100)"><rect x="102" y="70" width="80" height="60" rx="6" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".8">${keys(111, 80, 10, 5, 3)}</g></g>`,
      'kb-arc': `<path d="M24 120c40-50 112-50 152 0l-14 14c-34-38-90-38-124 0z" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".8">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = Math.PI * (0.84 - i * 0.097), x = 100 + Math.cos(a) * 62, y = 140 - Math.sin(a) * 50; return `<rect x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" rx="2" transform="rotate(${(90 - a * 180 / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }).join('')}</g>`,
    }[kind] || '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#050a07"/>${art}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function setThumb(card, url) {
    const t = card.querySelector('.thumb');
    if (t && !t.querySelector('img')) t.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
  }

  function paintItems(full) {
    if (!el || !window.RoomItems) return;
    const box = el.querySelector('[data-items]');
    if (!box) return;
    el.querySelectorAll('[data-cats] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === cat));
    el.querySelectorAll('[data-f] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === filter));
    if (!full) {
      box.querySelectorAll('.item').forEach(card => paintCard(card));
      return;
    }
    let list = catalog().filter(x => cat === 'all' || x.cat === cat);
    if (filter === 'owned') list = list.filter(x => WPM.owns(x.item.id));
    if (filter === 'not') list = list.filter(x => !WPM.owns(x.item.id));
    if (search) list = list.filter(x => String(x.item.name || x.item.id).toLowerCase().includes(search));
    list.sort((a, b) => sort === 'name' ? String(a.item.name).localeCompare(String(b.item.name)) : sort === 'desc' ? (b.item.price || 0) - (a.item.price || 0) : (a.item.price || 0) - (b.item.price || 0));
    queue = [];
    if (io) io.disconnect();
    box.innerHTML = list.length ? '' : `<p class="empty">No items match.</p>`;
    for (const { item } of list) {
      const card = UI.el(`<article class="panel item${item.slot ? ' av-item' : ''}" data-id="${UI.esc(item.id)}"${item.desc ? ` title="${UI.esc(item.desc)}"` : ''}>
        <div class="thumb"><span class="ph-text">LOADING</span></div>
        <div class="body"><h3>${UI.esc(item.name || item.id)}</h3>${item.kb && item.desc ? `<p class="item-desc">${UI.esc(item.desc)}</p>` : ''}<div class="row" data-row></div><p class="msg" data-msg></p></div>
      </article>`);
      card._item = item;
      paintCard(card);
      box.append(card);
      io.observe(card);
    }
  }

  function paintCard(card) {
    const item = card._item;
    const row = card.querySelector('[data-row]');
    const owned = WPM.owns(item.id);
    card.classList.toggle('is-owned', owned);
    const S = window.REWARDS && REWARDS.shop;
    const premium = !!(item.premium || (S && (item.price || 0) >= S.premiumFrom));
    card.classList.toggle('premium', premium);
    if (premium && !card.querySelector('.prem')) card.querySelector('.body').insertAdjacentHTML('afterbegin', '<span class="prem">Premium</span>');
    const price = `<span class="price">${UI.coin()}${UI.fmt(item.price || 0)}</span>`;
    if (owned) {
      row.innerHTML = item.category === 'Operator' ? `<span class="owned">Owned</span><a class="btn out sm" href="#/lab">Operator</a>` : `<span class="owned">Owned</span><a class="btn out sm" href="#/room">My Room</a>`;
      card.querySelector('[data-msg]').textContent = '';
      return;
    }
    row.innerHTML = `${price}<button class="btn sm" type="button" aria-label="Buy ${UI.esc(item.name || item.id)}">${UI.icon('cart')}Buy</button>`;
    const btn = row.querySelector('button');
    btn.querySelector('svg').style.cssText = 'width:16px;height:16px';
    btn.addEventListener('click', () => {
      const r = WPM.buy(item);
      const msg = card.querySelector('[data-msg]');
      if (r.ok) { msg.textContent = ''; TT.click(true); paintCard(card); }
      else if (r.reason === 'coins') msg.textContent = `You need ${UI.fmt((item.price || 0) - WPM.coins())} more coins.`;
    });
  }

  function unmount() {
    if (cancel) cancel();
    off.forEach(f => f()); off = [];
    if (io) io.disconnect();
    io = null; queue = []; el = null;
  }

  return { title: 'Shop', mount, unmount };
})());
