// #/hangar: your bots (js/app/botkit.js). Pick a bot, then its glow, shell, face, parts and battle
// marks; every bot keeps its own look, saved as 'wpm-bot'. The bot you fight with is your division's
// (BotKit.DIV_BOT), so the hangar marks that one. The bot turns on its own only once you've left it
// alone for 3 seconds.
// The hangar has its own idle music and every bot has a little voice (js/app/idle-audio.js). Bought
// parts (REWARDS.shop.bot) can be tried on here; one you don't own shows its price, a Buy button
// waits under the options, and it stays off your bot in fights until it's bought.
Router.register('hangar', (() => {
  const KEY = 'wpm-bot', IDLE_AFTER = 3;
  const GLOWS = ['theme', '#8cff58', '#5cc8ff', '#ffb000', '#b48cff', '#ff7ad9', '#3effc8', '#f4f4f4', '#ff8a3d'];
  const SCREENS = ['', '#ffffff', '#9ff3ff', '#ffd27a', '#ff9be0', '#c6ffa8'];
  const SHELL_DOT = { white: '#d8dce2', gunmetal: '#4d535c', black: '#1f2226', chrome: 'linear-gradient(135deg,#fff,#8a929c)', twotone: 'linear-gradient(90deg,#d8dce2 50%,#2a3039 50%)',
    mint: '#b8f0d8', sky: '#bcdcff', lilac: '#dcc8ff', peach: '#ffd3bd', pearl: 'linear-gradient(135deg,#fff,#ffd9f6 55%,#d9e6f2)', rose: 'linear-gradient(135deg,#f4cbbb,#c98b78)', gold: 'linear-gradient(135deg,#ffe28a,#c79a2e)' };
  const RAINBOW = 'conic-gradient(#ff5c8a,#ffd23d,#3effc8,#5cc8ff,#8c7bff,#ff5c8a)';
  const fresh = () => ({ color: '', shell: 'white', eyes: 'own', screen: '', sig: 0, back: 'none', top: 'none', blush: false, name: '', stickers: [], wear: 0 });
  const voice = mood => { if (window.IdleAudio && store) IdleAudio.bot(store.active, mood); };
  // a bought part's price tag, or nothing if it's free or yours
  const lockOf = (part, v) => { const it = BotKit.itemFor(part, v === true ? 'on' : v); return it && !WPM.owns(it.id) ? it : null; };
  const price = it => `<em class="hg-price">${UI.coin ? UI.coin() : ''}${UI.fmt(it.price)}</em>`;
  const esc = s => UI.esc(String(s));
  let el = null, store = null, tab = 'Colour', hist = [], hi = 0, stage = null;

  const load = () => { const s = TT.store.get(KEY, null); return s && s.bots ? s : { active: fight(), bots: {} }; };
  const fight = () => { const d = window.Ops && Ops.division(); return (d && BotKit.DIV_BOT[d.id]) || null; };
  const look = () => (store.bots[store.active] = { ...fresh(), ...(store.bots[store.active] || {}) });
  const glowOf = L => (!L.color || L.color === 'theme' ? Theme.hex('accent') : L.color === 'rainbow' ? '#ff5cf0' : L.color);
  function commit() {
    const s = JSON.stringify(store); if (s === hist[hi]) return;
    hist = hist.slice(0, hi + 1); hist.push(s); hi = hist.length - 1;
    TT.store.set(KEY, store);
  }
  function restore(s) { store = JSON.parse(s); TT.store.set(KEY, store); stage && stage.build(); paint(); }

  function mount(root) {
    el = root; store = load(); if (!BotKit.BOTS[store.active]) store.active = fight() || 'pixel';
    if (window.IdleAudio) IdleAudio.music('hangar');
    hist = [JSON.stringify(store)]; hi = 0;
    el.classList.add('page-full');
    el.innerHTML = `
      <div class="hg">
        <section class="hg-view" aria-label="Your bot">
          <div class="hg-stage" data-stage></div>
          <div class="hg-name" data-name></div>
          <div class="hg-info" data-info></div>
        </section>
        <section class="panel hg-panel" aria-labelledby="hg-h">
          <div class="ph" id="hg-h">// HANGAR</div>
          <div class="hg-bots" role="group" aria-label="Bot" data-bots>
            ${Object.entries(BotKit.BOTS).map(([id, b]) => `<button type="button" data-bot="${id}">${esc(b.name)}</button>`).join('')}
          </div>
          <p class="hg-fight" data-fight></p>
          <div class="seg hg-tabs" role="tablist" data-tabs>${['Colour', 'Face', 'Parts', 'Marks'].map(t => `<button type="button" role="tab" data-tab="${t}">${t}</button>`).join('')}</div>
          <div class="hg-pane" data-pane></div>
          <div class="hg-buy" data-buy hidden></div>
          <div class="hg-actions"><button type="button" class="btn out" data-undo>Undo</button><button type="button" class="btn out" data-redo>Redo</button><button type="button" class="btn out" data-reset>Reset this bot</button></div>
        </section>
      </div>`;
    const q = s => el.querySelector(s);
    q('[data-bots]').addEventListener('click', e => { const b = e.target.closest('[data-bot]'); if (b) { store.active = b.dataset.bot; commit(); stage && stage.build(); paint(); voice('hello'); stage && stage.tryFace('happy'); } });
    q('[data-tabs]').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; paint(); } });
    q('[data-undo]').addEventListener('click', () => { if (hi > 0) { restore(hist[--hi]); voice('boop'); } });
    q('[data-redo]').addEventListener('click', () => { if (hi < hist.length - 1) { restore(hist[++hi]); voice('boop'); } });
    q('[data-reset]').addEventListener('click', () => { store.bots[store.active] = fresh(); commit(); stage && stage.build(); paint(); voice('whirr'); });
    // buying a part you're trying on
    q('[data-buy]').addEventListener('click', e => {
      const b = e.target.closest('[data-buyid]'); if (!b) return;
      const it = (REWARDS.shop.bot || []).find(x => x.id === b.dataset.buyid); if (!it) return;
      const r = WPM.buy(it);
      if (r.ok) { voice('heart'); stage && stage.tryFace('heart'); paint(); }
      else if (r.reason === 'coins') { const m = q('[data-buymsg]'); if (m) m.textContent = `You have ${UI.fmt(WPM.coins())} coins.`; voice('sad'); }
    });
    const pane = q('[data-pane]');
    pane.addEventListener('click', e => {
      const b = e.target.closest('[data-set]');
      if (b) {
        const L = look(), k = b.dataset.set;
        L[k] = k === 'sig' ? +b.dataset.v : k === 'blush' ? b.dataset.v === '1' : b.dataset.v;
        commit(); stage && stage.build(); paint();
        voice(k === 'color' || k === 'screen' ? 'pick' : k === 'shell' ? 'ooh' : k === 'blush' && L.blush ? 'giggle' : 'happy');
        if (k !== 'color' && k !== 'screen' && stage) stage.tryFace(k === 'eyes' ? '' : 'happy');
        return;
      }
      const tr = e.target.closest('[data-try]');
      if (tr && stage) { stage.tryFace(tr.dataset.try); voice({ happy: 'happy', angry: 'angry', hurt: 'hurt', heart: 'heart', x: 'sleep' }[tr.dataset.try] || 'boop'); }
    });
    pane.addEventListener('change', e => {
      const c = e.target.closest('[data-stick]');
      if (c) { const L = look(); L.stickers = L.stickers.filter(x => x !== c.dataset.stick); if (c.checked) L.stickers.push(c.dataset.stick); commit(); stage && stage.build(); voice(c.checked ? 'giggle' : 'boop'); }
      if (e.target.matches('[data-wear], [data-nm]')) { commit(); voice(e.target.matches('[data-nm]') ? 'happy' : look().wear > 0.6 ? 'hurt' : 'boop'); }
    });
    pane.addEventListener('input', e => {
      const L = look();
      if (e.target.matches('[data-wear]')) { L.wear = e.target.value / 100; stage && stage.build(); }
      if (e.target.matches('[data-nm]')) { L.name = e.target.value.replace(/[^a-z0-9 _-]/gi, '').slice(0, 12); q('[data-name]').textContent = L.name; }
    });
    paint();
    start();
  }

  function paint() {
    if (!el) return;
    const L = look(), q = s => el.querySelector(s), f = fight(), B = BotKit.BOTS[store.active];
    el.querySelectorAll('[data-bot]').forEach(b => { b.classList.toggle('on', b.dataset.bot === store.active); b.classList.toggle('fights', b.dataset.bot === f); });
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    q('[data-fight]').innerHTML = f
      ? (store.active === f ? `${esc(B.name)} is the bot you fight with, since your division is ${esc(B.division)}.` : `You fight with ${esc(BotKit.BOTS[f].name)}, your ${esc(BotKit.BOTS[f].division)} bot. <a href="#/profile">Switch division</a> to fight with ${esc(B.name)}.`)
      : `Pick a division in <a href="#/profile">Profile</a> and its bot fights for you. Until then you fight with the bot shown here.`;
    q('[data-name]').textContent = L.name; q('[data-name]').style.color = glowOf(L);
    q('[data-info]').innerHTML = `<b>${esc(B.name)}</b>${esc(B.role)} · ${esc(B.division)}`;
    const btns = (key, list) => `<div class="seg hg-wrap">${list.map(([v, n]) => { const lk = lockOf(key, v); return `<button type="button" data-set="${key}" data-v="${v}" class="${String(L[key]) === String(v) ? 'on' : ''}${lk ? ' locked' : ''}">${esc(n)}${lk ? price(lk) : ''}</button>`; }).join('')}</div>`;
    let h = '';
    if (tab === 'Colour') {
      const rb = lockOf('color', 'rainbow');
      h += `<div class="hg-group"><span class="label">Glow</span><div class="hg-sw">${GLOWS.map(c => `<button type="button" class="hg-dot ${(L.color || 'theme') === c ? 'on' : ''}" style="background:${c === 'theme' ? Theme.hex('accent') : c}" data-set="color" data-v="${c}" aria-label="${c === 'theme' ? 'Theme colour' : c}" title="${c === 'theme' ? 'Theme colour' : c}"></button>`).join('')}
        <button type="button" class="hg-dot rainbow ${L.color === 'rainbow' ? 'on' : ''}${rb ? ' locked' : ''}" style="background:${RAINBOW}" data-set="color" data-v="rainbow" aria-label="Rainbow glow${rb ? `, ${rb.price} coins` : ''}" title="Rainbow glow${rb ? `: ${UI.fmt(rb.price)} coins` : ''}"></button></div></div>`;
      h += `<div class="hg-group"><span class="label">Shell</span><div class="seg hg-wrap">${BotKit.OPTIONS.shell.map(([v, n]) => { const lk = lockOf('shell', v); return `<button type="button" data-set="shell" data-v="${v}" class="${L.shell === v ? 'on' : ''}${lk ? ' locked' : ''}"><i class="hg-shell" style="background:${SHELL_DOT[v]}"></i>${esc(n)}${lk ? price(lk) : ''}</button>`; }).join('')}</div></div>`;
    } else if (tab === 'Face') {
      h += `<div class="hg-group"><span class="label">Eyes</span>${btns('eyes', BotKit.OPTIONS.eyes)}</div>`;
      const bl = lockOf('blush', 'on');
      h += `<div class="hg-group"><span class="label">Cheeks</span><div class="seg hg-wrap"><button type="button" data-set="blush" data-v="0" class="${!L.blush ? 'on' : ''}">None</button><button type="button" data-set="blush" data-v="1" class="${L.blush ? 'on' : ''}${bl ? ' locked' : ''}">Blush${bl ? price(bl) : ''}</button></div></div>`;
      h += `<div class="hg-group"><span class="label">Screen colour</span><div class="hg-sw">${SCREENS.map(c => `<button type="button" class="hg-dot ${L.screen === c ? 'on' : ''}" style="background:${c || `conic-gradient(${glowOf(L)} 0 50%, #fff 0)`}" data-set="screen" data-v="${c}" title="${c || 'Matches the glow'}" aria-label="${c || 'Matches the glow'}"></button>`).join('')}</div></div>`;
      h += `<div class="hg-group"><span class="label">Try a face</span><div class="seg hg-wrap">${[['happy', 'Happy'], ['angry', 'Angry'], ['hurt', 'Hurt'], ['heart', 'Heart'], ['x', 'Offline']].map(([f2, n]) => `<button type="button" data-try="${f2}">${n}</button>`).join('')}</div></div>`;
    } else if (tab === 'Parts') {
      const sg = BotKit.OPTIONS.sig[store.active];
      h += `<div class="hg-group"><span class="label">${esc(sg[0])}</span>${btns('sig', [[0, sg[1]], [1, sg[2]]])}</div>`;
      h += `<div class="hg-group"><span class="label">On its head</span>${btns('top', BotKit.OPTIONS.top)}</div>`;
      h += `<div class="hg-group"><span class="label">Back</span>${btns('back', BotKit.OPTIONS.back)}</div>`;
    } else {
      h += `<div class="hg-group"><label class="label" for="hg-nm">Name</label><input id="hg-nm" class="field" data-nm type="text" maxlength="12" value="${esc(L.name)}" placeholder="${esc(B.name)}"></div>`;
      h += `<div class="hg-group"><span class="label">Stickers</span>${Object.entries(BotKit.STICKERS).map(([k, n]) => `<label class="hg-stick"><input type="checkbox" data-stick="${k}" ${L.stickers.includes(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}<p class="hg-hint">One for each boss your bot helped repair.</p></div>`;
      h += `<div class="hg-group"><label class="label" for="hg-wear">Battle wear</label><input id="hg-wear" data-wear type="range" min="0" max="100" value="${Math.round(L.wear * 100)}"></div>`;
    }
    q('[data-pane]').innerHTML = h;
    // parts you're trying on and don't own yet: a Buy button for each
    const lk = BotKit.locked(L), buy = q('[data-buy]');
    buy.hidden = !lk.length;
    buy.innerHTML = lk.length ? `<div class="hg-buyrow">${lk.map(it => `<button type="button" class="btn" data-buyid="${esc(it.id)}">Buy ${esc(it.name)} ${price(it)}</button>`).join('')}</div><p class="hg-hint" data-buymsg></p>` : '';
  }

  async function start() {
    const host = el.querySelector('[data-stage]');
    let THREE, EC, RP, UB, OP, RE;
    try {
      const [T, G, a, b, c, d, e] = await Promise.all([import('three'), import('three/addons/geometries/RoundedBoxGeometry.js'), import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'), import('three/addons/environments/RoomEnvironment.js')]);
      THREE = { ...T, RoundedBoxGeometry: G.RoundedBoxGeometry }; EC = a.EffectComposer; RP = b.RenderPass; UB = c.UnrealBloomPass; OP = d.OutputPass; RE = e.RoomEnvironment;
    } catch (err) { host.innerHTML = '<p class="loading-state">3D did not load. Check the connection.</p>'; return; }
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio)); host.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(Theme.hex('bg-0'));
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RE(), 0.04).texture; scene.environmentIntensity = 0.35;   // so chrome has something to reflect
    scene.add(new THREE.HemisphereLight('#dfe8ff', '#1a1e24', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(4, 7, 8); scene.add(key);
    const back = new THREE.DirectionalLight('#9fdcff', 1.2); back.position.set(-6, 3, -6); scene.add(back);
    const standG = new THREE.Group(); scene.add(standG); standG.position.y = -2.1;
    standG.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.25, 64), new THREE.MeshStandardMaterial({ color: '#121715', roughness: 0.4, metalness: 0.6 })));
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.03, 8, 96), new THREE.MeshBasicMaterial({ toneMapped: false })); padRing.rotation.x = Math.PI / 2; padRing.position.y = 0.13; standG.add(padRing);
    const grid = new THREE.GridHelper(60, 30, '#16201b', '#0f1512'); grid.position.y = -2.25; scene.add(grid);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200); camera.position.set(0, 1.6, 11.5); camera.lookAt(0, 0, 0);
    const composer = new EC(renderer); composer.addPass(new RP(scene, camera));
    composer.addPass(new UB(new THREE.Vector2(256, 256), 0.5, 0.22, 0.9)); composer.addPass(new OP());

    let bot = null, spin = -0.5, busyAt = -1e9, face = '', faceUntil = 0, drag = null;
    const now = () => performance.now() / 1000;
    function build() {
      if (bot) bot.dispose();
      const L = look();
      bot = BotKit.create(THREE, store.active, { color: L.color === 'rainbow' ? 'rainbow' : glowOf(L), shell: L.shell, eyes: L.eyes, screen: L.screen || undefined, sig: L.sig, back: L.back, top: L.top, blush: !!L.blush, marks: { stickers: L.stickers, wear: L.wear } });
      scene.add(bot.group); padRing.material.color.set(glowOf(L)).multiplyScalar(1.6);
    }
    build();
    const touch = () => { busyAt = now(); };
    const evs = ['pointerdown', 'pointermove', 'keydown', 'input', 'wheel'];
    evs.forEach(ev => el.addEventListener(ev, touch, { passive: true }));
    const cv = renderer.domElement;
    // a tap on the bot gets a boop; a big spin makes it whirr
    let moved = 0;
    cv.addEventListener('pointerdown', e => { drag = e.clientX; moved = 0; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (drag != null) { spin += (e.clientX - drag) * 0.01; moved += Math.abs(e.clientX - drag); drag = e.clientX; } });
    cv.addEventListener('pointerup', () => {
      drag = null;
      if (moved < 4) { voice(Math.random() < 0.5 ? 'boop' : 'giggle'); face = 'happy'; faceUntil = now() + 1.2; }
      else if (moved > 260) { voice('whirr'); face = 'x'; faceUntil = now() + 0.9; }
    });
    const size = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(host); size();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = now();
    // left alone, the bot hums to itself now and then
    let chirpAt = now() + 8 + Math.random() * 6;
    const IDLE = [['boop', 'calm'], ['ooh', 'happy'], ['happy', 'happy'], ['sleep', 'blink'], ['giggle', 'heart']];
    renderer.setAnimationLoop(() => {
      const t = now(), dt = Math.min(0.05, t - last); last = t;
      if (t > chirpAt) { chirpAt = t + 10 + Math.random() * 8; if (t - busyAt > IDLE_AFTER && !document.hidden) { const [m, f] = IDLE[Math.floor(Math.random() * IDLE.length)]; voice(m); face = f; faceUntil = t + 1.2; } }
      if (drag == null && !reduce && t - busyAt > IDLE_AFTER) spin += dt * 0.25;
      bot.group.rotation.y = spin; standG.rotation.y = spin;
      bot.update(t, dt, { face: t < faceUntil ? face : undefined });
      composer.render();
    });
    stage = {
      build, tryFace: f => { face = f; faceUntil = f ? now() + 1.6 : 0; },
      stop() { renderer.setAnimationLoop(null); ro.disconnect(); evs.forEach(ev => el && el.removeEventListener(ev, touch)); bot && bot.dispose(); composer.dispose && composer.dispose(); pmrem.dispose(); renderer.dispose(); cv.remove(); },
    };
  }

  function unmount() { if (stage) stage.stop(); stage = null; el = null; if (window.IdleAudio) IdleAudio.stop(); }
  return { title: 'Hangar', mount, unmount };
})());
