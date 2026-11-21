// #/profile/avatar: the avatar creator. A large 3D view you turn by dragging, sliders for
// the face, and a grid of options for brows, makeup, hair, outfits and accessories, each
// shown on your own avatar. Free parts are ready to use; the rest show their price and can
// be tried on, then bought here or in the shop. The Sculpt tab pushes and pulls points on the
// face (avatar-sculpt.js). Undo and redo cover every change, resets included.
window.AvatarCreator = (() => {
  const D = window.AvatarData;
  const TABS = [['face', 'Face'], ['eyes', 'Eyes'], ['brows', 'Brows'], ['nose', 'Nose'], ['mouth', 'Mouth'], ['sculpt', 'Sculpt'], ['makeup', 'Makeup'],
    ['hair', 'Hair'], ['outfit', 'Outfit'], ['gear', 'Accessories']];
  // tabs whose changes are small on the face: the view moves in close
  const FOCUS = ['eyes', 'makeup', 'mouth', 'sculpt'];
  // what "Reset tab" puts back to DEFAULT besides the tab's sliders (sliders go by their group)
  const TAB_KEYS = { face: ['sk'], eyes: ['ec'], brows: ['bs', 'bc'], makeup: ['mk'], hair: ['h', 'hc', 'fh'], outfit: ['o', 'oc', 'op', 'gl'], gear: ['g'] };
  let el = null, look = null, savedKey = '', tab = 'face', view = null, off = [], savedTimer = 0, palette = null;
  // history: whole looks before each change; a drag or a run of wheel steps is one change
  let undoS = [], redoS = [], pending = null;
  // sculpt: the selected point, whether it is fixed, and the settings for new points
  let sel = -1, fixed = false, mirror = true, size = 250, tool = null, flash = '', flashT = 0, confirmFn = null;
  const S = () => window.AvatarSculpt;
  const e = s => UI.esc(s);
  const fmt = n => UI.fmt(n);

  function mount(root) {
    el = root;
    look = Avatar.mine();
    savedKey = D.stable(look); undoS = []; redoS = []; pending = null; sel = -1; fixed = false;
    el.innerHTML = `
      <div class="avc">
        <div class="panel shop-hero avc-head">
          <div class="title-block"><h1><span class="pre">&gt;</span>Avatar_</h1><p>// YOUR 3D AVATAR</p></div>
          <div class="panel coin-box hot">${UI.coin()}<b data-coins>${fmt(WPM.coins())}</b></div>
        </div>
        <div class="avc-main">
          <section class="panel hot avc-stage" aria-label="Preview">
            <div class="ph">// PREVIEW<span class="meta" data-turn-hint>Drag to turn</span></div>
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
              <button class="btn out sm" type="button" data-undo aria-keyshortcuts="Control+Z">Undo</button>
              <button class="btn out sm" type="button" data-redo aria-keyshortcuts="Control+Y">Redo</button>
              <button class="btn out sm" type="button" data-reset-face>Reset face</button>
              <button class="btn sm" type="button" data-save>Save</button>
            </div>
            <div class="avc-confirm" data-confirm hidden role="alertdialog" aria-labelledby="avc-confirm-q">
              <span id="avc-confirm-q" data-confirm-q></span>
              <button class="btn sm" type="button" data-confirm-yes></button>
              <button class="btn out sm" type="button" data-confirm-no>Cancel</button>
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
    el.querySelector('[data-redo]').addEventListener('click', redo);
    el.querySelector('[data-reset-face]').addEventListener('click', () => ask('Reset the face sliders and sculpt points?', 'Reset face', resetFace));
    el.querySelector('[data-confirm-yes]').addEventListener('click', () => { const f = confirmFn; closeAsk(); if (f) f(); });
    el.querySelector('[data-confirm-no]').addEventListener('click', closeAsk);
    el.querySelector('[data-save]').addEventListener('click', save);
    el.querySelectorAll('[data-turn]').forEach(b => b.addEventListener('click', () => view && view.rotate(+b.dataset.turn * 0.5)));
    const pane = el.querySelector('[data-pane]');
    pane.addEventListener('input', onSlider);
    pane.addEventListener('change', onSliderDone);
    pane.addEventListener('click', onPick);
    pane.addEventListener('dblclick', ev => { if (ev.target.matches('input[type=range]')) resetSlider(ev.target); });
    document.addEventListener('keydown', onKey);
    off.push(() => document.removeEventListener('keydown', onKey));
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
    tool = new (S().Tool)(view, sculptCtl);
    tool.setOn(tab === 'sculpt');
    paintPane();
    const onMq = () => view && view.setReduce(reduce.matches);
    reduce.addEventListener('change', onMq);
    off.push(() => reduce.removeEventListener('change', onMq));
  }

  // ---------- state ----------
  const same = (a, b) => JSON.stringify(D.normalize(a)) === JSON.stringify(D.normalize(b));
  function record(prev) {
    if (same(prev, look)) return;
    undoS.push(prev); if (undoS.length > 80) undoS.shift();
    redoS = [];
  }
  function set(next, rec = true) {
    end();
    const prev = look;
    look = D.normalize(next);
    if (rec) record(prev);
    fixSel();
    if (view) view.set(look);
    paintPane();
  }
  // a change that runs over many events (a slider or point drag, wheel steps) is one undo step
  function begin() { if (!pending) pending = D.normalize(look); }
  function end(repaint = false) {
    if (!pending) return;
    record(pending); pending = null;
    if (repaint) paintPane(); else paintStatus();
  }
  function step(from, to) {
    end();
    if (!from.length) return;
    to.push(look); look = from.pop();
    fixSel();
    if (view) view.set(look);
    paintPane();
  }
  const undo = () => step(undoS, redoS);
  const redo = () => step(redoS, undoS);
  function fixSel() {
    const n = (look.sc || []).length;
    if (sel >= n) sel = -1;
    if (sel < 0) fixed = false;
  }
  function onKey(ev) {
    if (!el || ev.altKey) return;
    const t = ev.target;
    if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range'))) return;
    const k = (ev.key || '').toLowerCase();
    if (ev.ctrlKey || ev.metaKey) {
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); redo(); }
      return;
    }
    if (k === 'escape' && confirmFn) { closeAsk(); return; }
    if (k === 'f' && !ev.shiftKey && tab === 'sculpt') { ev.preventDefault(); toggleFix(); }
  }

  // ---------- resets ----------
  function resetSlider(t) {
    if (t.dataset.mk) return set({ ...look, mk: { ...look.mk, [t.dataset.mk + 'S']: D.MK_DEFAULT[t.dataset.mk + 'S'] } });
    if (t.dataset.s) { const f = { ...look.f }; delete f[t.dataset.s]; return set({ ...look, f }); }
    if (t.dataset.sc === 'r') return setSize(250, true);
    if (t.dataset.sc === 'depth') return setDepth(0, true);
  }
  function resetTab(id) {
    const next = { ...look, f: { ...look.f } };
    for (const s of D.SLIDERS) if (s.group === id) delete next.f[s.id];
    for (const k of TAB_KEYS[id] || []) next[k] = D.DEFAULT[k];
    // the brow shape goes back to the one that suits the face
    if (id === 'brows') delete next.bs;
    if (id === 'hair') return set(D.withGear(next, null));
    set(next);
  }
  // every face slider and the sculpt back to default; hair, outfit, skin, makeup and colours stay
  function resetFace() { const next = { ...look, f: {} }; delete next.sc; sel = -1; set(next); }
  function ask(q, yes, fn) {
    const box = el.querySelector('[data-confirm]');
    box.querySelector('[data-confirm-q]').textContent = q;
    box.querySelector('[data-confirm-yes]').textContent = yes;
    box.hidden = false; confirmFn = fn;
    box.querySelector('[data-confirm-yes]').focus();
  }
  function closeAsk() { confirmFn = null; if (el) el.querySelector('[data-confirm]').hidden = true; }

  // ---------- sculpt ----------
  const pts = () => look.sc || [];
  const sculptCtl = {
    state: () => ({ sc: pts(), sel, fixed, mirror, size }),
    select(i) { sel = i; paintPane(); },
    change(sc, i, { live = false } = {}) {
      look = D.normalize({ ...look, sc });
      sel = i;
      if (view) view.set(look);
      if (live && tab === 'sculpt') paintSculptLive(); else paintPane();
    },
    begin, end: () => end(tab === 'sculpt'),
    // a gesture that turned out to be a two-finger turn: back to how it started, no undo step
    revert() {
      if (!pending) return;
      look = pending; pending = null;
      fixSel();
      if (view) view.set(look);
      paintPane();
    },
    note(text) { flash = text; clearTimeout(flashT); flashT = setTimeout(() => { flash = ''; paintStatus(); }, 3000); paintStatus(); },
  };
  function toggleFix() {
    if (sel < 0) { fixed = false; sculptCtl.note('Select a point to fix it.'); return; }
    fixed = !fixed;
    paintPane(); if (view) view.kick();
  }
  function scEdit(fn, rec = true) {
    const sc = pts().map(p => ({ ...p, d: p.d.slice() }));
    if (!sc[sel]) return;
    fn(sc[sel]);
    const out = view ? S().limit(view.rig.A, sc, sel) : sc;
    if (rec) set({ ...look, sc: out });
    else sculptCtl.change(out, sel, { live: true });
  }
  // depth: how far the point sits out (+) or in (-) along the face, in thousandths
  function depthOf(p) { const n = S().normalAt(view.rig.A, p.v); return p.d[0] * n[0] + p.d[1] * n[1] + p.d[2] * n[2]; }
  function setDepth(v, rec) {
    if (!view || sel < 0) return;
    scEdit(p => { const n = S().normalAt(view.rig.A, p.v), k = v - depthOf(p); p.d = p.d.map((x, j) => x + n[j] * k); }, rec);
  }
  function setSize(v, rec) {
    size = v;
    if (sel < 0 || !view) return paintSculptLive();
    scEdit(p => { p.r = v; }, rec);
  }
  function sculptAct(a) {
    if (a === 'reset') return scEdit(p => { p.d = [0, 0, 0]; });
    if (a === 'del') { const sc = pts().filter((_, i) => i !== sel); sel = -1; return set({ ...look, sc }); }
    if (a === 'clear') {
      const n = pts().length;
      return ask(`Delete all ${n} point${n === 1 ? '' : 's'}?`, 'Clear all points', () => { sel = -1; const next = { ...look }; delete next.sc; set(next); });
    }
  }

  function onSlider(ev) {
    const t = ev.target;
    if (!t.matches('input[type=range]')) return;
    begin();
    if (t.dataset.sc === 'r') return setSize(+t.value, false);
    if (t.dataset.sc === 'depth') return setDepth(+t.value, false);
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
    if (!ev.target.matches('input[type=range]')) return;
    end();
  }

  function onPick(ev) {
    const buy = ev.target.closest('[data-buy]');
    if (buy) return doBuy(buy.dataset.buy);
    const rst = ev.target.closest('[data-rst]');
    if (rst) { const t = rst.parentElement.querySelector('input[type=range]'); if (t) resetSlider(t); return; }
    const rt = ev.target.closest('[data-reset-tab]');
    if (rt) return resetTab(tab);
    const scp = ev.target.closest('[data-scp]');
    if (scp) { sel = +scp.dataset.scp; paintPane(); if (view) view.kick(); return; }
    const sct = ev.target.closest('[data-sct]');
    if (sct && !sct.disabled) {
      if (sct.dataset.sct === 'fix') return toggleFix();
      mirror = !mirror;
      if (sel >= 0) return scEdit(p => { if (mirror) p.m = 1; else delete p.m; });
      return paintPane();
    }
    const sca = ev.target.closest('[data-sca]');
    if (sca && !sca.disabled) return sculptAct(sca.dataset.sca);
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
    sel = -1;
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
    el.querySelector('[data-undo]').disabled = !undoS.length && !pending;
    el.querySelector('[data-redo]').disabled = !redoS.length;
    if (bad.some(x => x.l.price)) {
      const paid = bad.filter(x => x.l.price), names = paid.map(x => x.name);
      note.innerHTML = `${e(`Buy ${list(names)} or take ${names.length > 1 ? 'them' : 'it'} off to save.`)} ${paid.map(x => `<button class="btn sm" type="button" data-buy="${D.itemId(x.slot, x.id)}">Buy ${e(x.name)} for ${fmt(x.l.price)}</button>`).join(' ')}`;
      note.className = 'avc-note bad';
      save.disabled = true;
    } else if (flash) {
      note.textContent = flash;
      note.className = 'avc-note';
      save.disabled = D.stable(look) === savedKey;
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
  // each slider has a small reset button; double-clicking the slider resets it too
  const rstBtn = name => `<button type="button" class="avs-rst" data-rst aria-label="Reset ${e(name.toLowerCase())}" title="Reset">&#x21BA;</button>`;
  function sliders(group, list = D.SLIDERS.filter(s => s.group === group)) {
    return `<div class="avs-list">${list.map(s => `
      <div class="avs"><label for="avs-${s.id}">${e(s.name)}</label><input id="avs-${s.id}" type="range" min="${s.min}" max="100" step="1" value="${D.fv(look.f, s.id)}" data-s="${s.id}">${rstBtn(s.name)}</div>`).join('')}</div>`;
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
      <output>${v}%</output>${rstBtn(m.name)}${shapes}${pal}
    </div>`;
  }
  function makeupPane() {
    return `<div class="label avc-sub">Presets</div>
      <div class="mkp-row" role="group" aria-label="Makeup presets">${D.MK_PRESETS.map(presetChip).join('')}</div>
      ${MK_ROWS.map(([layer, head]) => `${head ? `<div class="label avc-sub">${head}</div>` : ''}${mkRow(layer)}`).join('')}
      <p class="dim avc-tip">Strength sliders are free. Dimmed colours cost coins.</p>`;
  }

  function sculptPane() {
    const sc = pts(), p = sc[sel], ready = !!view;
    const max = p && ready ? Math.round(S().maxOffset(view.rig.A, p)) : 125, dep = p && ready ? Math.round(depthOf(p)) : 0;
    const rows = sc.map((q, i) => `<button type="button" class="avsc-row" data-scp="${i}" aria-pressed="${i === sel}">
      <i aria-hidden="true"></i><span>Point ${i + 1}</span>${q.m ? '<span class="dim">Mirrored</span>' : ''}${i === sel && fixed ? '<span class="avsc-tag">Fixed</span>' : ''}</button>`).join('');
    return `<p class="avc-tip avsc-how">Click the face to add a point, then drag it.</p>
      <div class="avsc-tools">
        <button type="button" class="btn out sm avsc-fix" data-sct="fix" aria-pressed="${fixed}" aria-keyshortcuts="F" title="F"${p ? '' : ' disabled'}>Fix point</button>
        <button type="button" class="btn out sm" data-sct="mirror" aria-pressed="${mirror}">Mirror</button>
      </div>
      <div class="avs-list">
        <div class="avs"><label for="avsc-r">Size</label><input id="avsc-r" type="range" min="${S() ? S().RMIN : 60}" max="${S() ? S().RMAX : 600}" step="10" value="${p ? p.r : size}" data-sc="r">${rstBtn('Size')}</div>
        <div class="avs"><label for="avsc-d">Depth</label><input id="avsc-d" type="range" min="${-max}" max="${max}" step="1" value="${dep}" data-sc="depth" title="Shift-drag or scroll on the face"${p ? '' : ' disabled'}>${rstBtn('Depth')}</div>
      </div>
      <div class="label avc-sub avsc-head">Points<span class="dim">${sc.length} of ${S() ? S().MAXN : 16}</span></div>
      ${rows ? `<div class="avsc-list" role="group" aria-label="Points">${rows}</div>` : ''}
      <div class="avsc-acts">
        <button type="button" class="btn out sm" data-sca="reset"${p ? '' : ' disabled'}>Reset point</button>
        <button type="button" class="btn out sm" data-sca="del"${p ? '' : ' disabled'}>Delete point</button>
        <button type="button" class="btn out sm danger" data-sca="clear"${sc.length ? '' : ' disabled'}>Clear all points</button>
      </div>`;
  }
  // during a drag only the two sliders follow the point
  function paintSculptLive() {
    if (!el || tab !== 'sculpt') return;
    const p = pts()[sel], r = el.querySelector('#avsc-r'), d = el.querySelector('#avsc-d');
    if (r && document.activeElement !== r) r.value = p ? p.r : size;
    if (d && p && view && document.activeElement !== d) {
      const max = Math.round(S().maxOffset(view.rig.A, p));
      d.min = -max; d.max = max; d.value = Math.round(depthOf(p));
    }
    paintStatus();
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
        ${sliders('brows')}`;
    } else if (tab === 'nose') {
      h = sliders(tab);
    } else if (tab === 'mouth') {
      h = `${sliders('mouth', D.LIP_SLIDERS).replace('avs-list', 'avs-list wide')}
        <p class="dim avc-tip">Lip colour, liner and gloss are on the Makeup tab.</p>`;
    } else if (tab === 'sculpt') {
      h = sculptPane();
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
    if (tab !== 'sculpt') h += `<div class="avc-tabfoot"><button class="btn out sm" type="button" data-reset-tab>Reset tab</button></div>`;
    pane.innerHTML = h;
    if (view) view.setFocus(FOCUS.includes(tab));
    if (tool) tool.setOn(tab === 'sculpt');
    el.querySelector('[data-turn-hint]').textContent = tab === 'sculpt' ? 'Right-drag or two fingers to turn' : 'Drag to turn';
    pane.setAttribute('aria-label', TABS.find(t => t[0] === tab)[1]);
    paintStatus();
  }

  function unmount() {
    off.forEach(f => f()); off = [];
    clearTimeout(savedTimer); clearTimeout(flashT);
    if (tool) tool.dispose();
    if (view) view.dispose();
    view = null; tool = null; el = null; confirmFn = null;
  }

  // for scripted tests
  const peek = () => ({ look, sel, fixed, mirror, size, undo: undoS.length, redo: redoS.length, view, tool });
  return { mount, unmount, peek };
})();
