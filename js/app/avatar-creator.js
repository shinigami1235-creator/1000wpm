// #/profile/avatar: the avatar creator. A large 3D view you turn by dragging, sliders for
// the face, and a grid of options for brows, makeup, hair, outfits and accessories, each
// shown on your own avatar. Free parts are ready to use; the rest show their price and can
// be tried on, then bought here or in the shop.
window.AvatarCreator = (() => {
  const D = window.AvatarData;
  const TABS = [['face', 'Face'], ['eyes', 'Eyes'], ['brows', 'Brows'], ['nose', 'Nose'], ['mouth', 'Mouth'], ['makeup', 'Makeup'],
    ['hair', 'Hair'], ['outfit', 'Outfit'], ['gear', 'Accessories']];
  // tabs whose changes are small on the face: the view moves in close
  const FOCUS = ['eyes', 'brows', 'makeup', 'mouth'];
  let el = null, look = null, savedKey = '', hist = [], tab = 'face', view = null, off = [], dragFrom = null, savedTimer = 0, palette = null;
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
    view.setFocus(FOCUS.includes(tab));
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
    if (t.dataset.mk) {
      look = D.normalize({ ...look, mk: { ...look.mk, [t.dataset.mk + 'S']: +t.value } });
      const row = t.closest('.mkr');
      row.querySelector('output').textContent = `${t.value}%`;
      row.classList.toggle('off', +t.value === 0);
      el.querySelectorAll('[data-slot="mkp"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === D.presetOf(look.mk)));
    } else {
      const f = { ...look.f, [t.dataset.s]: +t.value };
      look = D.normalize({ ...look, f });
      // the V-shape default follows the face's sex until someone sets it
      const vl = t.dataset.s === 'sex' && el.querySelector('input[data-s="vline"]');
      if (vl) vl.value = D.fv(look.f, 'vline');
    }
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
    if (slot === 'op') return set({ ...look, op: id });
    if (slot === 'mkp') {
      palette = null;
      return set({ ...look, mk: D.presetMk(id, (layer, i) => !D.lockOf('mkc', `${layer}-${i}`)) });
    }
    if (slot === 'mkpal') { palette = palette === id ? null : id; return paintPane(); }
    // picking a colour or a shape turns a layer that is off back on
    const on = layer => look.mk[layer + 'S'] || D.MAKEUP[layer].def;
    if (slot === 'mks') { const [layer, style] = id.split(':'); return set({ ...look, mk: { ...look.mk, [layer]: style, [layer + 'S']: on(layer) } }); }
    if (slot === 'mkc') { const [layer, i] = id.split('-'); return set({ ...look, mk: { ...look.mk, [layer + 'C']: +i, [layer + 'S']: on(layer) } }); }
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
    if (D.lockOf('ec', L.ec)) L.ec = pickUsable('ec', D.EYE_COLORS, 0);
    L.mk = D.freeMk(L.mk);
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

  // makeup shapes, presets and strengths and outfit colours are free; brow colours use the hair colour prices
  const lockFor = (slot, id) => slot === 'mks' || slot === 'mkp' || slot === 'oc' || slot === 'op' || id === 'none' ? null : D.lockOf(slot === 'bc' ? 'hc' : slot, id);
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
  function sliders(group, list = D.SLIDERS.filter(s => s.group === group)) {
    return `<div class="avs-list">${list.map(s => `
      <label class="avs"><span>${e(s.name)}</span><input type="range" min="${s.min}" max="100" step="1" value="${D.fv(look.f, s.id)}" data-s="${s.id}"></label>`).join('')}</div>`;
  }
  // eye colours as named swatches, each a small iris with its pupil
  function eyeColours() {
    return `<div class="avc-eyes" role="group" aria-label="Eye colour">${D.EYE_ORDER.map(id => {
      const c = D.part('ec', id), l = lockFor('ec', id);
      return `<button type="button" class="eyec${l ? ' locked' : ''}" data-slot="ec" data-id="${id}" aria-pressed="${look.ec === id}" style="--c:${c.hex};--ci:${c.in}">
        <i aria-hidden="true"></i><span>${e(c.name)}</span>${l && l.price ? `<span class="price">${UI.coin()}${fmt(l.price)}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }
  function sw(hex) { return `<i class="sw" style="--c:${hex}"></i>`; }

  // ---------- makeup: presets, then one row per layer ----------
  const MK_ROWS = [['liner', 'Eyes'], ['shadow'], ['brow'], ['blush', 'Face'], ['sculpt'], ['lip', 'Lips'], ['line'], ['gloss']];
  function presetChip(p) {
    const mk = D.presetMk(p.id, (layer, i) => !D.lockOf('mkc', `${layer}-${i}`));
    const dots = ['shadow', 'blush', 'lip'].filter(k => mk[k + 'S']).map(k => `<i style="--c:${D.mkHex(k, mk[k + 'C'], look.sk)}"></i>`).join('');
    return `<button type="button" class="mkp" data-slot="mkp" data-id="${p.id}" aria-pressed="${D.presetOf(look.mk) === p.id}">
      <span class="mkp-dots" aria-hidden="true">${dots}</span>${e(p.name)}</button>`;
  }
  function mkRow(layer) {
    const m = D.MAKEUP[layer], v = look.mk[layer + 'S'];
    let sw = '<span></span>', pal = '', shapes = '';
    if (m.colors) {
      const i = look.mk[layer + 'C'], c = m.colors[i], l = D.lockOf('mkc', `${layer}-${i}`);
      sw = `<button type="button" class="mkr-sw${l ? ' locked' : ''}" data-slot="mkpal" data-id="${layer}" aria-expanded="${palette === layer}"
        aria-label="${e(`${m.name} colour: ${c.name}`)}" title="${e(c.name)}" style="--c:${D.mkHex(layer, i, look.sk)}"></button>`;
      if (palette === layer) pal = swatches('mkc', m.colors.map((c, k) => ({ ...c, id: `${layer}-${k}`, hex: D.mkHex(layer, k, look.sk) })), `${layer}-${i}`, `${m.name} colour`);
    }
    if (m.styles) shapes = `<div class="mkr-shapes" role="group" aria-label="${e(m.name)} shape">${m.styles.map(([id, name]) =>
      `<button type="button" data-slot="mks" data-id="${layer}:${id}" aria-pressed="${look.mk[layer] === id}">${e(name)}</button>`).join('')}</div>`;
    return `<div class="mkr${v ? '' : ' off'}">
      <span class="mkr-n">${e(m.name)}</span>${sw}
      <input type="range" min="0" max="100" step="1" value="${v}" data-mk="${layer}" aria-label="${e(m.name)} strength">
      <output>${v}%</output>${shapes}${pal}
    </div>`;
  }
  function makeupPane() {
    return `<div class="label avc-sub">Presets</div>
      <div class="mkp-row" role="group" aria-label="Makeup presets">${D.MK_PRESETS.map(presetChip).join('')}</div>
      ${MK_ROWS.map(([layer, head]) => `${head ? `<div class="label avc-sub">${head}</div>` : ''}${mkRow(layer)}`).join('')}
      <p class="dim avc-tip">Strength sliders are free. Dimmed colours cost coins.</p>`;
  }

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
      h = `<div class="label avc-sub">Eye colour</div>
        ${eyeColours()}
        <div class="label avc-sub">Shape</div>
        ${sliders('eyes')}`;
    } else if (tab === 'brows') {
      const match = `<button type="button" class="dot match" data-slot="bc" data-id="-1" aria-pressed="${look.bc < 0}" title="Match hair" style="--c:${D.HAIR_COLORS[look.hc].hex}"><span>Match hair</span></button>`;
      h = `<div class="label avc-sub">Shape</div>
        <div class="avc-tiles">${D.PARTS.bs.map(p => tile('bs', p, look.bs === p.id, { ...look, bs: p.id, g: [] })).join('')}</div>
        <div class="label avc-sub">Brow colour</div>
        ${swatches('bc', D.HAIR_COLORS.filter(c => !c.price), look.bc, 'Brow colour', match)}
        ${sliders('brows', D.BROW_SLIDERS)}`;
    } else if (tab === 'nose') {
      h = sliders(tab);
    } else if (tab === 'mouth') {
      h = `${sliders('mouth', D.LIP_SLIDERS).replace('avs-list', 'avs-list wide')}
        <p class="dim avc-tip">Lip colour, liner and gloss are on the Makeup tab.</p>`;
    } else if (tab === 'makeup') {
      h = makeupPane();
    } else if (tab === 'hair') {
      h = `<div class="label avc-sub">Style</div>
        <div class="avc-tiles">${D.PARTS.h.map(p => tile('h', p, look.h === p.id, D.withGear({ ...look, h: p.id }, null))).join('')}</div>
        <div class="label avc-sub">Hair colour</div>
        ${swatches('hc', D.HAIR_COLORS, look.hc, 'Hair colour')}
        ${D.FACIAL_HAIR ? `<div class="label avc-sub">Facial hair</div>
        <div class="avc-tiles">${D.PARTS.fh.map(p => tile('fh', p, look.fh === p.id, { ...look, fh: p.id })).join('')}</div>` : ''}`;
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
        ${D.PATTERN_OUTFITS.includes(look.o) ? `<div class="label avc-sub">Pattern</div>
        <div class="mkr-shapes avc-pattern" role="group" aria-label="Pattern">${[['plain', 'Plain'], ['stripe', 'Stripes']].map(([id, name]) =>
          `<button type="button" data-slot="op" data-id="${id}" aria-pressed="${look.op === id}">${name}</button>`).join('')}</div>` : ''}
        <div class="label avc-sub">Glow</div>
        <div class="avc-cards">${D.GLOWS.map(g => card('gl', g, look.gl === g.id, sw(g.hex), g.lock && lv < D.GOLD_LEVEL ? `Level ${D.GOLD_LEVEL}` : '')).join('')}</div>
        ${lv < D.GOLD_LEVEL ? `<p class="dim avc-tip">Gold glow unlocks at level ${D.GOLD_LEVEL}. You are level ${lv}.</p>` : ''}`;
    }
    pane.innerHTML = h;
    if (view) view.setFocus(FOCUS.includes(tab));
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
