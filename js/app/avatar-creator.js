// #/profile/avatar: the avatar creator. A large 3D view you turn by dragging, sliders for
// the face, and a grid of options for brows, makeup, hair, outfits and accessories, each
// shown on your own avatar. Free parts are ready to use; the rest show their price and can
// be tried on, then bought here or in the shop.
window.AvatarCreator = (() => {
  const D = window.AvatarData;
  const TABS = [['face', 'Face'], ['eyes', 'Eyes'], ['brows', 'Brows'], ['nose', 'Nose'], ['mouth', 'Mouth'], ['makeup', 'Makeup'],
    ['hair', 'Hair'], ['outfit', 'Outfit'], ['gear', 'Accessories']];
  let el = null, look = null, savedKey = '', hist = [], tab = 'face', view = null, off = [], dragFrom = null, savedTimer = 0;
  const e = s => UI.esc(s);
  const fmt = n => UI.fmt(n);

  function mount(root) {
    el = root;
    look = Avatar.mine();
    savedKey = D.stable(look); hist = [];
    el.innerHTML = `
      <div class="avc">
        <div class="panel shop-hero avc-head">
          <div class="title-block"><h1><span class="pre">&gt;</span>Avatar_</h1><p>// YOUR 3D AVATAR</p></div>
          <div class="panel coin-box hot">${UI.coin()}<b data-coins>${fmt(WPM.coins())}</b></div>
        </div>
        <div class="avc-main">
          <section class="panel hot avc-stage" aria-label="Preview">
            <div class="ph">// PREVIEW<span class="meta">Drag to turn</span></div>
            <div class="avc-view" data-view><div class="loading-state">Loading</div></div>
            <div class="avc-turn">
              <button class="btn out sm" type="button" data-turn="-1" aria-label="Turn left">&lt;</button>
              <button class="btn out sm" type="button" data-turn="1" aria-label="Turn right">&gt;</button>
            </div>
          </section>
          <section class="panel avc-ctrl">
            <div class="avc-bar">
              <a class="btn out sm" href="#/profile">Back to profile</a>
              <span class="grow"></span>
              <button class="btn out sm" type="button" data-rand>Randomise</button>
              <button class="btn out sm" type="button" data-undo>Undo</button>
              <button class="btn sm" type="button" data-save>Save</button>
            </div>
            <p class="avc-note" data-note role="status"></p>
            <div class="seg avc-tabs" role="tablist" aria-label="Parts">
              ${TABS.map(([id, name]) => `<button type="button" role="tab" data-tab="${id}">${name}</button>`).join('')}
            </div>
            <div class="avc-pane" data-pane></div>
          </section>
        </div>
      </div>`;
    el.querySelector('.avc-tabs').addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; paintPane(); } });
    el.querySelector('[data-rand]').addEventListener('click', randomise);
    el.querySelector('[data-undo]').addEventListener('click', undo);
    el.querySelector('[data-save]').addEventListener('click', save);
    el.querySelectorAll('[data-turn]').forEach(b => b.addEventListener('click', () => view && view.rotate(+b.dataset.turn * 0.5)));
    const pane = el.querySelector('[data-pane]');
    pane.addEventListener('input', onSlider);
    pane.addEventListener('change', onSliderDone);
    pane.addEventListener('click', onPick);
    el.querySelector('[data-note]').addEventListener('click', ev => { const b = ev.target.closest('[data-buy]'); if (b) doBuy(b.dataset.buy); });
    off.push(WPM.on('coins', () => { if (!el) return; el.querySelector('[data-coins]').textContent = fmt(WPM.coins()); paintPane(); }));
    off.push(WPM.on('inventory', () => el && paintPane()));
    paintPane();
    startView();
  }

  async function startView() {
    const host = el.querySelector('[data-view]');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const v = await Avatar.viewer(host, { reduceMotion: reduce.matches });
    if (!el || !host.isConnected) { if (v) v.dispose(); return; }
    host.innerHTML = '';
    if (!v) { host.innerHTML = '<div class="loading-state">The 3D view did not load.</div>'; return; }
    view = v;
    host.append(view.r.domElement);
    view.resize();
    view.set(look);
    const onMq = () => view && view.setReduce(reduce.matches);
    reduce.addEventListener('change', onMq);
    off.push(() => reduce.removeEventListener('change', onMq));
  }

  // ---------- state ----------
  function set(next, record = true) {
    if (record) { hist.push(D.normalize(look)); if (hist.length > 60) hist.shift(); }
    look = D.normalize(next);
    if (view) view.set(look);
    paintPane();
  }
  function undo() { if (!hist.length) return; look = hist.pop(); if (view) view.set(look); paintPane(); }
  function onSlider(ev) {
    const t = ev.target;
    if (!t.matches('input[type=range]')) return;
    if (!dragFrom) dragFrom = D.normalize(look);
    const f = { ...look.f, [t.dataset.s]: +t.value };
    look = D.normalize({ ...look, f });
    if (view) view.set(look);
    paintStatus();
  }
  function onSliderDone(ev) {
    if (!ev.target.matches('input[type=range]') || !dragFrom) return;
    hist.push(dragFrom); dragFrom = null;
    paintStatus();
  }

  function onPick(ev) {
    const buy = ev.target.closest('[data-buy]');
    if (buy) return doBuy(buy.dataset.buy);
    const b = ev.target.closest('[data-slot]');
    if (!b || b.disabled) return;
    const slot = b.dataset.slot, id = b.dataset.id;
    if (slot === 'sk') return set({ ...look, sk: +id });
    if (slot === 'hc') return set({ ...look, hc: +id });
    if (slot === 'ec') return set({ ...look, ec: +id });
    if (slot === 'bc') return set({ ...look, bc: +id });
    if (slot === 'oc') return set({ ...look, oc: +id });
    if (slot === 'mk') { const [layer, style] = id.split(':'); return set({ ...look, mk: { ...look.mk, [layer]: style } }); }
    if (slot === 'mkc') { const [layer, i] = id.split('-'); return set({ ...look, mk: { ...look.mk, [layer + 'C']: +i, [layer]: look.mk[layer] === 'none' ? D.MAKEUP[layer].styles[1][0] : look.mk[layer] } }); }
    if (slot === 'gl') { if (D.lockOf('gl', id) && D.part('gl', id).lock) return; return set({ ...look, gl: id }); }
    if (slot === 'g') {
      if (id === 'none') return set({ ...look, g: [] });
      if (look.g.includes(id)) return set({ ...look, g: look.g.filter(x => x !== id) });
      return set(D.withGear(look, id));
    }
    if (slot === 'h') return set(D.withGear({ ...look, h: id }, null));
    return set({ ...look, [slot]: id });
  }

  function doBuy(itemId) {
    const item = D.items().find(i => i.id === itemId);
    if (!item) return;
    const r = WPM.buy(item);
    const note = el.querySelector('[data-note]');
    if (r.ok) { TT.click(true); paintPane(); }
    else if (r.reason === 'coins') { note.textContent = `You need ${fmt(item.price - WPM.coins())} more coins for ${item.name}.`; note.className = 'avc-note bad'; }
  }

  function randomise() {
    const r = D.random(Math.floor(Math.random() * 1e9));
    const pickUsable = (slot, list, fallback) => {
      const ok = list.filter(p => !D.lockOf(slot, p.id));
      return ok.length ? ok[Math.floor(Math.random() * ok.length)].id : fallback;
    };
    const L = { ...r };
    if (D.lockOf('h', L.h)) L.h = pickUsable('h', D.PARTS.h, 'buzz');
    if (D.lockOf('fh', L.fh)) L.fh = (L.f.sex || 0) < 0 ? pickUsable('fh', D.PARTS.fh, 'none') : 'none';
    if (D.lockOf('o', L.o)) L.o = pickUsable('o', D.PARTS.o, 'crew');
    if (D.lockOf('hc', L.hc)) L.hc = Math.floor(Math.random() * 6);
    if (D.lockOf('gl', L.gl)) L.gl = pickUsable('gl', D.GLOWS, 'green');
    if (D.lockOf('bs', L.bs)) L.bs = (L.f.sex || 0) > 25 ? 'soft' : 'straight';
    if (D.lockOf('ec', L.ec)) L.ec = Math.floor(Math.random() * 6);
    for (const layer of Object.keys(D.MAKEUP)) if (D.lockOf('mkc', `${layer}-${L.mk[layer + 'C']}`)) L.mk = { ...L.mk, [layer + 'C']: 0 };
    L.g = L.g.filter(id => !D.lockOf('g', id));
    set(L);
  }

  const unowned = () => D.unownedParts(look);
  const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  function save() {
    if (unowned().length) return;
    WPM.setProfile({ look: D.normalize(look) });
    savedKey = D.stable(look);
    const b = el.querySelector('[data-save]');
    b.textContent = 'Saved';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (el) { b.textContent = 'Save'; } }, 1600);
    paintStatus();
  }

  // ---------- painting ----------
  function paintStatus() {
    if (!el) return;
    const bad = unowned();
    const note = el.querySelector('[data-note]');
    const save = el.querySelector('[data-save]');
    el.querySelector('[data-undo]').disabled = !hist.length;
    if (bad.some(x => x.l.price)) {
      const paid = bad.filter(x => x.l.price), names = paid.map(x => x.name);
      note.innerHTML = `${e(`Buy ${list(names)} or take ${names.length > 1 ? 'them' : 'it'} off to save.`)} ${paid.map(x => `<button class="btn sm" type="button" data-buy="${D.itemId(x.slot, x.id)}">Buy ${e(x.name)} for ${fmt(x.l.price)}</button>`).join(' ')}`;
      note.className = 'avc-note bad';
      save.disabled = true;
    } else {
      note.textContent = D.stable(look) === savedKey ? '' : 'Not saved yet.';
      note.className = 'avc-note';
      save.disabled = D.stable(look) === savedKey;
    }
  }

  // makeup styles and outfit colours are free; brow colours use the hair colour prices
  const lockFor = (slot, id) => slot === 'mk' || slot === 'oc' ? null : D.lockOf(slot === 'bc' ? 'hc' : slot, id);
  function priceTag(slot, id) {
    const l = lockFor(slot, id);
    if (!l) return '';
    if (!l.price) return `<span class="avo-lock">${UI.icon('lock')}${e(l.why)}</span>`;
    return `<span class="price">${UI.coin()}${fmt(l.price)}</span>`;
  }
  function card(slot, p, pressed, extra = '', disabled = '', lockSlot = slot, lockId = p.id) {
    const l = lockFor(lockSlot, lockId);
    const buy = l && l.price && pressed ? `<button class="btn sm avo-buy" type="button" data-buy="${D.itemId(lockSlot, lockId)}">Buy</button>` : '';
    return `<div class="avo${pressed ? ' on' : ''}${l ? ' locked' : ''}">
      <button type="button" data-slot="${slot}" data-id="${e(p.id)}" aria-pressed="${pressed}"${disabled ? ' disabled' : ''}>${extra}<span class="n">${e(p.name)}</span>${disabled ? `<span class="avo-why">${e(disabled)}</span>` : priceTag(lockSlot, lockId)}</button>${buy}
    </div>`;
  }
  // a tile that shows the option on the player's own avatar; the picture fills in when rendered
  function tile(slot, p, pressed, withLook, disabled = '', lockSlot = slot, lockId = p.id) {
    const L = D.normalize(withLook);
    return card(slot, p, pressed, Avatar.img(L, 64, 64, 'class="avo-pic" loading="lazy"'), disabled, lockSlot, lockId);
  }
  function swatches(slot, list, current, label, extraFirst = '') {
    return `<div class="avc-sw" role="group" aria-label="${e(label)}">${extraFirst}${list.map(c => {
      const l = c.id === -1 ? null : lockFor(slot, c.id);
      return `<button type="button" class="dot${l ? ' locked' : ''}" data-slot="${slot}" data-id="${c.id}" aria-pressed="${current === c.id}" title="${e(c.name)}${l && l.price ? ` (${fmt(l.price)} coins)` : ''}" style="--c:${c.hex}"></button>`;
    }).join('')}</div>`;
  }
  function sliders(group) {
    return `<div class="avs-list">${D.SLIDERS.filter(s => s.group === group).map(s => `
      <label class="avs"><span>${e(s.name)}</span><input type="range" min="-100" max="100" step="1" value="${look.f[s.id] || 0}" data-s="${s.id}"></label>`).join('')}</div>`;
  }
  function sw(hex) { return `<i class="sw" style="--c:${hex}"></i>`; }

  function paintPane() {
    if (!el) return;
    el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    const pane = el.querySelector('[data-pane]');
    let h = '';
    if (tab === 'face') {
      h = `${sliders('face')}
        <div class="label avc-sub">Skin tone</div>
        <div class="avc-skins" role="group" aria-label="Skin tone">${D.SKIN.map((c, i) => `<button type="button" class="skin" data-slot="sk" data-id="${i}" aria-pressed="${look.sk === i}" aria-label="Skin tone ${i + 1} of ${D.SKIN.length}" style="--c:${c}"></button>`).join('')}</div>`;
    } else if (tab === 'eyes') {
      h = `${sliders('eyes')}
        <div class="label avc-sub">Eye colour</div>
        ${swatches('ec', D.EYE_COLORS, look.ec, 'Eye colour')}`;
    } else if (tab === 'brows') {
      const match = `<button type="button" class="dot match" data-slot="bc" data-id="-1" aria-pressed="${look.bc < 0}" title="Match hair" style="--c:${D.HAIR_COLORS[look.hc].hex}"><span>Match hair</span></button>`;
      h = `<div class="label avc-sub">Shape</div>
        <div class="avc-tiles">${D.PARTS.bs.map(p => tile('bs', p, look.bs === p.id, { ...look, bs: p.id, g: [] })).join('')}</div>
        <div class="label avc-sub">Brow colour</div>
        ${swatches('bc', D.HAIR_COLORS.filter(c => !c.price), look.bc, 'Brow colour', match)}
        ${sliders('brows')}`;
    } else if (tab === 'nose' || tab === 'mouth') {
      h = sliders(tab);
    } else if (tab === 'makeup') {
      h = Object.entries(D.MAKEUP).map(([layer, m]) => `
        <div class="label avc-sub">${e(m.name)}</div>
        <div class="avc-tiles">${m.styles.map(([id, name]) => tile('mk', { id: `${layer}:${id}`, name }, look.mk[layer] === id, { ...look, mk: { ...look.mk, [layer]: id } }, '', 'mk', null)).join('')}</div>
        ${swatches('mkc', m.colors.map((c, i) => ({ ...c, id: `${layer}-${i}` })), `${layer}-${look.mk[layer + 'C']}`, `${m.name} colour`)}`).join('');
    } else if (tab === 'hair') {
      h = `<div class="label avc-sub">Style</div>
        <div class="avc-tiles">${D.PARTS.h.map(p => tile('h', p, look.h === p.id, D.withGear({ ...look, h: p.id }, null))).join('')}</div>
        <div class="label avc-sub">Hair colour</div>
        ${swatches('hc', D.HAIR_COLORS, look.hc, 'Hair colour')}
        <div class="label avc-sub">Facial hair</div>
        <div class="avc-tiles">${D.PARTS.fh.map(p => tile('fh', p, look.fh === p.id, { ...look, fh: p.id })).join('')}</div>`;
    } else if (tab === 'gear') {
      const hood = look.h === 'hood';
      h = `<div class="label avc-sub">Accessories</div>
        <div class="avc-tiles">${card('g', { id: 'none', name: 'None' }, !look.g.length)}${D.PARTS.g.map(p => {
          const blocked = hood && p.zones.some(z => D.HOOD_BLOCKS.includes(z));
          return tile('g', p, look.g.includes(p.id), D.withGear(look, p.id), blocked ? 'Not with Hood up' : '');
        }).join('')}</div>
        <p class="dim avc-tip">Each spot takes one item: eyes, mouth, head, neck and chest. Earrings go with any of them.</p>`;
    } else if (tab === 'outfit') {
      const lv = WPM.levelInfo().level;
      h = `<div class="label avc-sub">Outfit</div>
        <div class="avc-tiles">${D.PARTS.o.map(p => tile('o', p, look.o === p.id, { ...look, o: p.id })).join('')}</div>
        <div class="label avc-sub">Outfit colour</div>
        ${swatches('oc', D.OUTFIT_COLORS, look.oc, 'Outfit colour')}
        <div class="label avc-sub">Glow</div>
        <div class="avc-cards">${D.GLOWS.map(g => card('gl', g, look.gl === g.id, sw(g.hex), g.lock && lv < D.GOLD_LEVEL ? `Level ${D.GOLD_LEVEL}` : '')).join('')}</div>
        ${lv < D.GOLD_LEVEL ? `<p class="dim avc-tip">Gold glow unlocks at level ${D.GOLD_LEVEL}. You are level ${lv}.</p>` : ''}`;
    }
    pane.innerHTML = h;
    pane.setAttribute('aria-label', TABS.find(t => t[0] === tab)[1]);
    paintStatus();
  }

  function unmount() {
    off.forEach(f => f()); off = [];
    clearTimeout(savedTimer);
    if (view) view.dispose();
    view = null; el = null;
  }

  return { mount, unmount };
})();
