// #/hangar: your bots (js/app/botkit.js). Pick a bot, then dress it by category: colour, face, head,
// back, arm tool, trail, moves (emote and victory pose) and battle marks. Every bot keeps its own look,
// saved as 'wpm-bot'. The bot you fight with is your division's (BotKit.DIV_BOT), so the hangar marks it.
// 28 Nov 2026 (Gid: "a premium character creator"): a lit studio with a spot, rim lights and shadows,
// a turntable you can drag and zoom, the camera moving to the part you're choosing (the face, the back,
// the arm), and a card with a picture for every part. Pointing at a card tries it on; clicking keeps it.
// The hangar has its own idle music and every bot has a little voice (js/app/idle-audio.js). Bought
// parts (REWARDS.shop.bot) can be tried on here; one you don't own shows its price, a Buy button waits
// under the options, and it stays off your bot in fights until it's bought.
// The Orb tab (28 Nov 2026) picks the orb your bot charges as you type in Duel and Party; while it's open the
// bot types a word into it on a loop (BotFighter.orbDemo in js/app/bot-fighter.js), so you see it charge and fire.
Router.register('hangar', (() => {
  const KEY = 'wpm-bot', IDLE_AFTER = 3;
  const GLOWS = ['theme', '#8cff58', '#5cc8ff', '#ffb000', '#b48cff', '#ff7ad9', '#3effc8', '#f4f4f4', '#ff8a3d'];
  const SCREENS = ['', '#ffffff', '#9ff3ff', '#ffd27a', '#ff9be0', '#c6ffa8'];
  const fresh = () => ({ color: '', shell: 'white', eyes: 'own', screen: '', sig: 0, back: 'none', top: 'none', blush: false, name: '', stickers: [], wear: 0, arm: 'none', trail: 'none', emote: 'wave', victory: 'hop', armor: 'none', orb: 'core' });
  const voice = mood => { if (window.IdleAudio && store) IdleAudio.bot(store.active, mood); };
  // a bought part's price tag, or nothing if it's free or yours
  const lockOf = (part, v) => { const it = BotKit.itemFor(part, v === true ? 'on' : v); return it && !WPM.owns(it.id) ? it : null; };
  const price = it => `<em class="hg-price">${UI.coin ? UI.coin() : ''}${UI.fmt(it.price)}</em>`;
  const esc = s => UI.esc(String(s));
  // the categories, each with where the camera goes: [turn of the bot, camera height, distance, look height]
  const TABS = [
    ['Colour', [0.0, 1.4, 11.5, 0.1]], ['Face', [0.0, 0.6, 8.4, 0.1]], ['Head', [0.25, 2.6, 8.8, 0.7]], ['Back', [Math.PI, 1.6, 10, 0.2]],
    ['Armour', [-0.55, 1.5, 12, 0.3]], ['Arm', [0.75, 0.9, 8.5, -0.1]], ['Orb', [1.0, 1.0, 10.5, -0.3]], ['Trail', [-0.5, 2.2, 15, -0.6]], ['Moves', [0.0, 1.6, 12.5, 0.4]], ['Marks', [-0.6, 1.2, 9.5, 0.1]],
  ];
  let el = null, store = null, tab = 'Colour', hist = [], hi = 0, stage = null;

  const load = () => { const s = TT.store.get(KEY, null); return s && s.bots ? s : { active: fight(), bots: {} }; };
  const fight = () => { const d = window.Ops && Ops.division(); return (d && BotKit.DIV_BOT[d.id]) || null; };
  const look = () => (store.bots[store.active] = { ...fresh(), ...(store.bots[store.active] || {}) });
  const glowOf = L => (!L.color || L.color === 'theme' ? Theme.hex('accent') : BotKit.FX[L.color] ? BotKit.FX[L.color].base : L.color);
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
          <div class="hg-viewbar">
            <button type="button" class="hg-chip" data-spin title="Turntable">Turntable</button>
            <button type="button" class="hg-chip" data-play>Play emote</button>
          </div>
        </section>
        <section class="panel hg-panel" aria-labelledby="hg-h">
          <div class="ph" id="hg-h">// HANGAR</div>
          <div class="hg-bots" role="group" aria-label="Bot" data-bots>
            ${Object.entries(BotKit.BOTS).map(([id, b]) => `<button type="button" data-bot="${id}"><b>${esc(b.name)}</b><span>${esc(b.role)}</span></button>`).join('')}
          </div>
          <p class="hg-fight" data-fight></p>
          <div class="hg-tabs" role="tablist" data-tabs>${TABS.map(([t]) => `<button type="button" role="tab" data-tab="${t}">${t}</button>`).join('')}</div>
          <div class="hg-pane" data-pane></div>
          <div class="hg-buy" data-buy hidden></div>
          <div class="hg-actions"><button type="button" class="btn out" data-undo>Undo</button><button type="button" class="btn out" data-redo>Redo</button><button type="button" class="btn out" data-reset>Reset this bot</button></div>
        </section>
      </div>`;
    const q = s => el.querySelector(s);
    q('[data-bots]').addEventListener('click', e => { const b = e.target.closest('[data-bot]'); if (b) { store.active = b.dataset.bot; commit(); stage && stage.build(); paint(); voice('hello'); stage && stage.tryFace('happy'); } });
    q('[data-tabs]').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; paint(); stage && stage.view(tab); voice('boop'); } });
    q('[data-undo]').addEventListener('click', () => { if (hi > 0) { restore(hist[--hi]); voice('boop'); } });
    q('[data-redo]').addEventListener('click', () => { if (hi < hist.length - 1) { restore(hist[++hi]); voice('boop'); } });
    q('[data-reset]').addEventListener('click', () => { store.bots[store.active] = fresh(); commit(); stage && stage.build(); paint(); voice('whirr'); });
    q('[data-spin]').addEventListener('click', e => { if (!stage) return; const on = stage.toggleSpin(); e.currentTarget.classList.toggle('on', on); });
    q('[data-play]').addEventListener('click', () => { if (stage) { stage.emote(look().emote); voice('giggle'); } });
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
        commit(); if (stage) { stage.unpreview(); stage.build(); }
        paint();
        voice(k === 'color' || k === 'screen' ? 'pick' : k === 'shell' ? 'ooh' : k === 'blush' && L.blush ? 'giggle' : 'happy');
        if (stage) {
          if (k === 'emote') stage.emote(L.emote);
          else if (k === 'victory') stage.victory(L.victory);
          else if (k === 'arm') stage.fire();
          else if (k !== 'color' && k !== 'screen') stage.tryFace(k === 'eyes' ? '' : 'happy');
        }
        return;
      }
      const tr = e.target.closest('[data-try]');
      if (tr && stage) { stage.tryFace(tr.dataset.try); voice({ happy: 'happy', angry: 'angry', hurt: 'hurt', heart: 'heart', x: 'sleep' }[tr.dataset.try] || 'boop'); }
    });
    // pointing at a card tries the part on; leaving puts your own back
    pane.addEventListener('pointerover', e => {
      const b = e.target.closest('[data-set]'); if (!b || !stage || e.pointerType === 'touch') return;
      const k = b.dataset.set; if (k === 'emote' || k === 'victory' || k === 'screen') return;
      stage.preview(k, k === 'sig' ? +b.dataset.v : k === 'blush' ? b.dataset.v === '1' : b.dataset.v);
    });
    pane.addEventListener('pointerleave', () => stage && stage.unpreview());
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

  // a card: the part's picture, its name and its price or a tick when it's on
  function cards(key, list, L) {
    return `<div class="hg-cards">${list.map(([v, n]) => {
      const lk = lockOf(key, v), on = String(L[key]) === String(v);
      const src = BotKit.icon({ part: key, v });
      return `<button type="button" class="hg-card${on ? ' on' : ''}${lk ? ' locked' : ''}" data-set="${key}" data-v="${v}" aria-pressed="${on}">
        <img src="${src}" alt="" loading="lazy" decoding="async"><span>${esc(n)}</span>${lk ? price(lk) : on ? '<em class="hg-on">On</em>' : ''}</button>`;
    }).join('')}</div>`;
  }

  function paint() {
    if (!el) return;
    const L = look(), q = s => el.querySelector(s), f = fight(), B = BotKit.BOTS[store.active];
    el.querySelectorAll('[data-bot]').forEach(b => { b.classList.toggle('on', b.dataset.bot === store.active); b.classList.toggle('fights', b.dataset.bot === f); });
    el.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
    q('[data-fight]').innerHTML = f
      ? (store.active === f ? `${esc(B.name)} is the bot you fight with, since your division is ${esc(B.division)}.` : `You fight with ${esc(BotKit.BOTS[f].name)}, your ${esc(BotKit.BOTS[f].division)} bot. <a href="#/profile">Switch division</a> to fight with ${esc(B.name)}.`)
      : `Pick a division in <a href="#/profile">Profile</a> and its bot fights for you. Until then you fight with the bot shown here.`;
    q('[data-name]').textContent = L.name; q('[data-name]').style.color = glowOf(L);
    q('[data-info]').innerHTML = `<b>${esc(B.name)}</b>${esc(B.role)} · ${esc(B.division)}`;
    q('[data-play]').hidden = tab !== 'Moves';
    let h = '';
    if (tab === 'Colour') {
      h += `<div class="hg-group"><span class="label">Glow</span><div class="hg-sw">${GLOWS.map(c => `<button type="button" class="hg-dot ${(L.color || 'theme') === c ? 'on' : ''}" style="background:${c === 'theme' ? Theme.hex('accent') : c}" data-set="color" data-v="${c}" aria-label="${c === 'theme' ? 'Theme colour' : c}" title="${c === 'theme' ? 'Theme colour' : c}"></button>`).join('')}</div></div>`;
      h += `<div class="hg-group"><span class="label">Colour sets</span><div class="hg-sw">${Object.entries(BotKit.FX).map(([v, fx]) => { const lk = lockOf('color', v); return `<button type="button" class="hg-dot ${L.color === v ? 'on' : ''}${lk ? ' locked' : ''}" style="background:${fx.swatch}" data-set="color" data-v="${v}" aria-label="${fx.name} glow${lk ? `, ${lk.price} coins` : ''}" title="${fx.name}${lk ? `: ${UI.fmt(lk.price)} coins` : ''}"></button>`; }).join('')}</div></div>`;
      h += `<div class="hg-group"><span class="label">Shell</span>${cards('shell', BotKit.OPTIONS.shell, L)}</div>`;
    } else if (tab === 'Face') {
      h += `<div class="hg-group"><span class="label">Eyes</span>${cards('eyes', BotKit.OPTIONS.eyes, L)}</div>`;
      const bl = lockOf('blush', 'on');
      h += `<div class="hg-group"><span class="label">Cheeks</span><div class="seg hg-wrap"><button type="button" data-set="blush" data-v="0" class="${!L.blush ? 'on' : ''}">None</button><button type="button" data-set="blush" data-v="1" class="${L.blush ? 'on' : ''}${bl ? ' locked' : ''}">Blush${bl ? price(bl) : ''}</button></div></div>`;
      h += `<div class="hg-group"><span class="label">Screen colour</span><div class="hg-sw">${SCREENS.map(c => `<button type="button" class="hg-dot ${L.screen === c ? 'on' : ''}" style="background:${c || `conic-gradient(${glowOf(L)} 0 50%, #fff 0)`}" data-set="screen" data-v="${c}" title="${c || 'Matches the glow'}" aria-label="${c || 'Matches the glow'}"></button>`).join('')}</div></div>`;
      h += `<div class="hg-group"><span class="label">Try a face</span><div class="seg hg-wrap">${[['happy', 'Happy'], ['angry', 'Angry'], ['hurt', 'Hurt'], ['heart', 'Heart'], ['x', 'Offline']].map(([f2, n]) => `<button type="button" data-try="${f2}">${n}</button>`).join('')}</div></div>`;
    } else if (tab === 'Head') {
      const sg = BotKit.OPTIONS.sig[store.active];
      h += `<div class="hg-group"><span class="label">${esc(sg[0])}</span><div class="seg hg-wrap">${[[0, sg[1]], [1, sg[2]]].map(([v, n]) => `<button type="button" data-set="sig" data-v="${v}" class="${L.sig === v ? 'on' : ''}">${esc(n)}</button>`).join('')}</div></div>`;
      h += `<div class="hg-group"><span class="label">On its head</span>${cards('top', BotKit.OPTIONS.top, L)}</div>`;
    } else if (tab === 'Back') {
      h += `<div class="hg-group"><span class="label">Back</span>${cards('back', BotKit.OPTIONS.back, L)}</div>`;
    } else if (tab === 'Armour') {
      h += `<div class="hg-group"><span class="label">Armour set</span>${cards('armor', BotKit.OPTIONS.armor, L)}<p class="hg-hint">A set brings its own shell colour. Your glow stays.</p></div>`;
    } else if (tab === 'Arm') {
      h += `<div class="hg-group"><span class="label">Arm tool</span>${cards('arm', BotKit.OPTIONS.arm, L)}<p class="hg-hint">Looks only. It fires with your spells.</p></div>`;
    } else if (tab === 'Orb') {
      h += `<div class="hg-group"><span class="label">Orb</span>${cards('orb', BotKit.OPTIONS.orb, L)}<p class="hg-hint">Your bot charges it as you type in Duel and Party, and it fires when you finish the word.</p></div>`;
    } else if (tab === 'Trail') {
      h += `<div class="hg-group"><span class="label">Trail</span>${cards('trail', BotKit.OPTIONS.trail, L)}<p class="hg-hint">Left behind as your bot flies in the raid.</p></div>`;
    } else if (tab === 'Moves') {
      h += `<div class="hg-group"><span class="label">Emote</span>${cards('emote', BotKit.OPTIONS.emote, L)}</div>`;
      h += `<div class="hg-group"><span class="label">Victory pose</span>${cards('victory', BotKit.OPTIONS.victory, L)}<p class="hg-hint">Played when the boss goes down.</p></div>`;
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
    const V = THREE.Vector3;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio)); host.append(renderer.domElement);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const keep = [], own = x => (keep.push(x), x);
    const scene = new THREE.Scene();
    const accent = () => new THREE.Color(glowOf(look()));
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RE(), 0.04).texture; scene.environmentIntensity = 0.35;   // so chrome and the clear coat have something to reflect

    // ---------- the studio: a dark backdrop that fades to the bot's colour at the floor ----------
    const bgMat = own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: accent() }, uBase: { value: new THREE.Color(Theme.hex('bg-0')) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uCol; uniform vec3 uBase; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = uBase * 0.6 + uCol * 0.022 * smoothstep(0.25, -0.2, h) + vec3(0.012, 0.014, 0.018) * smoothstep(-0.2, 0.6, h);
          float vig = smoothstep(1.2, 0.2, length(vP.xz * vec2(0.6, 1.0))); gl_FragColor = vec4(c * (0.7 + 0.3 * vig), 1.0); }`,
      side: THREE.BackSide, depthWrite: false,
    }));
    const bg = new THREE.Mesh(own(new THREE.SphereGeometry(80, 32, 16)), bgMat); scene.add(bg);
    // floor: a soft dark plane with a lit circle under the stand and a faint grid
    const floorMat = own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: accent() } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uCol; varying vec2 vP;
        void main(){ float r = length(vP); vec2 g = abs(fract(vP * 0.5) - 0.5); float line = smoothstep(0.025, 0.0, min(g.x, g.y)) * smoothstep(16.0, 3.0, r) * 0.025;
          float pool = smoothstep(7.0, 0.0, r) * 0.1; vec3 c = vec3(0.008, 0.009, 0.011) + uCol * (pool * 0.25 + line); gl_FragColor = vec4(c, 1.0); }`,
    }));
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(80, 80)), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.25; scene.add(floor);

    // ---------- lights: a key spot from above with soft shadows, a fill, and two coloured rims ----------
    scene.add(new THREE.HemisphereLight('#cfdcff', '#0b0d10', 0.35));
    const key = new THREE.SpotLight('#ffffff', 130, 40, 0.42, 0.55, 1.5); key.position.set(3.5, 11, 6); key.target.position.set(0, -1, 0);
    key.castShadow = true; key.shadow.mapSize.set(512, 512); key.shadow.bias = -0.0004; key.shadow.radius = 4; key.shadow.camera.near = 4; key.shadow.camera.far = 30;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#9fb8ff', 0.5); fill.position.set(-7, 3, 6); scene.add(fill);
    const rimA = new THREE.PointLight('#ffffff', 60, 18, 1.6); rimA.position.set(-4.5, 3, -4.5); scene.add(rimA);
    const rimB = new THREE.PointLight('#5cc8ff', 45, 18, 1.6); rimB.position.set(4.5, 1.5, -4.5); scene.add(rimB);
    // a soft beam of light falling on the stand
    const beamMat = own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color('#cfe0ff') } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), vV)), 1.6); float a = smoothstep(-6.0, 4.0, vY) * smoothstep(6.0, 2.0, vY) * edge * 0.07; gl_FragColor = vec4(uCol * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const beam = new THREE.Mesh(own(new THREE.CylinderGeometry(0.6, 3.2, 12, 40, 1, true)), beamMat); beam.position.y = 3.6; scene.add(beam);

    // ---------- the turntable ----------
    const standG = new THREE.Group(); scene.add(standG); standG.position.y = -2.1;
    const standMat = own(new THREE.MeshStandardMaterial({ color: '#15191d', roughness: 0.32, metalness: 0.75 }));
    const topMat = own(new THREE.MeshStandardMaterial({ color: '#1d2228', roughness: 0.45, metalness: 0.6 }));
    const plinth = new THREE.Mesh(own(new THREE.CylinderGeometry(2.5, 2.7, 0.22, 72)), standMat); plinth.receiveShadow = true; standG.add(plinth);
    const deck = new THREE.Mesh(own(new THREE.CylinderGeometry(2.2, 2.2, 0.06, 72)), topMat); deck.position.y = 0.13; deck.receiveShadow = true; standG.add(deck);
    const ringMat = own(new THREE.MeshBasicMaterial({ toneMapped: false }));
    const padRing = new THREE.Mesh(own(new THREE.TorusGeometry(2.36, 0.03, 8, 120)), ringMat); padRing.rotation.x = Math.PI / 2; padRing.position.y = 0.12; standG.add(padRing);
    const inner = new THREE.Mesh(own(new THREE.TorusGeometry(1.5, 0.012, 6, 96)), ringMat); inner.rotation.x = Math.PI / 2; inner.position.y = 0.17; standG.add(inner);
    // tick marks round the deck, so the turn reads
    const tickGeo = own(new THREE.BoxGeometry(0.03, 0.01, 0.2)), ticks = new THREE.InstancedMesh(tickGeo, own(new THREE.MeshBasicMaterial({ color: '#56606b' })), 48);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; qq.setFromAxisAngle(new V(0, 1, 0), -a); ticks.setMatrixAt(i, m4.compose(new V(Math.cos(a) * 1.95, 0.165, Math.sin(a) * 1.95), qq, new V(1, 1, i % 4 ? 0.6 : 1.2))); }
    standG.add(ticks);
    // dust in the light
    const DN = 90, dPos = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) { const a = Math.random() * 6.28, r = Math.random() * 3; dPos[i * 3] = Math.cos(a) * r; dPos[i * 3 + 1] = -2 + Math.random() * 8; dPos[i * 3 + 2] = Math.sin(a) * r; }
    const dGeo = own(new THREE.BufferGeometry()); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const dust = new THREE.Points(dGeo, own(new THREE.PointsMaterial({ color: '#c8d6ff', size: 0.035, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
    scene.add(dust);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    const composer = new EC(renderer); composer.addPass(new RP(scene, camera));
    composer.addPass(new UB(new THREE.Vector2(256, 256), 0.45, 0.3, 0.88)); composer.addPass(new OP());

    let bot = null, spin = -0.5, spinV = 0, busyAt = -1e9, face = '', faceUntil = 0, drag = null, zoom = 1, auto = true, preview = null, vicUntil = 0, vicKind = 'hop';
    const cam = { turn: 0, y: 1.4, d: 11.5, ly: 0.1 }, camT = { ...cam };
    const now = () => performance.now() / 1000;
    // the orb on the Orb tab, charging on a loop
    let demo = null;
    function syncOrb() {
      if (demo) { demo.dispose(); demo = null; }
      if (tab !== 'Orb' || !bot || !window.BotFighter || !BotFighter.orbDemo) return;
      const L = { ...look(), ...(preview || {}) };
      demo = BotFighter.orbDemo(THREE, bot, L.orb || 'core', BotKit.FX[L.color] ? BotKit.FX[L.color].base : glowOf(L));
    }
    function build(over) {
      if (demo) { demo.dispose(); demo = null; }
      if (bot) bot.dispose();
      const L = { ...look(), ...(over || {}) };
      bot = BotKit.create(THREE, store.active, { color: BotKit.FX[L.color] ? L.color : glowOf(L), shell: L.shell, eyes: L.eyes, screen: L.screen || undefined, sig: L.sig, back: L.back, top: L.top, blush: !!L.blush,
        marks: { stickers: L.stickers, wear: L.wear }, arm: L.arm, trail: L.trail, emote: L.emote, victory: L.victory, armor: L.armor });
      bot.group.traverse(o => { if (o.isMesh && !(o.material && (o.material.blending === THREE.AdditiveBlending || o.material.transparent))) o.castShadow = true; });
      scene.add(bot.group);
      const c = accent(); ringMat.color.copy(c).multiplyScalar(1.15); bgMat.uniforms.uCol.value.copy(c); floorMat.uniforms.uCol.value.copy(c); rimA.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.35);
      syncOrb();
    }
    build();
    function setView(name) {
      const T2 = (TABS.find(x => x[0] === name) || TABS[0])[1];
      camT.y = T2[1]; camT.d = T2[2]; camT.ly = T2[3];
      // turn the bot to show the part, by the shortest way round
      const want = T2[0], cur = ((spin % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let dlt = want - cur; dlt = ((dlt + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      spinTo = spin + dlt; busyAt = now();
    }
    let spinTo = null;
    setView(tab);
    const touch = () => { busyAt = now(); };
    const evs = ['pointerdown', 'keydown', 'input', 'wheel'];
    evs.forEach(ev => el.addEventListener(ev, touch, { passive: true }));
    const cv = renderer.domElement;
    // drag to turn (it keeps turning a moment after you let go), wheel to zoom, tap for a boop
    let moved = 0, lastX = 0, lastT = 0;
    cv.addEventListener('pointerdown', e => { drag = e.clientX; lastX = e.clientX; lastT = now(); moved = 0; spinV = 0; spinTo = null; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (drag != null) { const dx = e.clientX - drag; spin += dx * 0.01; moved += Math.abs(dx); drag = e.clientX; const tt = now(); if (tt > lastT) spinV = (e.clientX - lastX) * 0.01 / Math.max(0.016, tt - lastT); lastX = e.clientX; lastT = tt; busyAt = tt; } });
    cv.addEventListener('pointerup', () => {
      drag = null;
      if (moved < 4) { voice(Math.random() < 0.5 ? 'boop' : 'giggle'); face = 'happy'; faceUntil = now() + 1.2; spinV = 0; }
      else if (moved > 260) { voice('whirr'); face = 'x'; faceUntil = now() + 0.9; }
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.6, Math.min(1.5, zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
    const size = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(host); size();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = now();
    // left alone, the bot hums to itself now and then, and does its emote
    let chirpAt = now() + 8 + Math.random() * 6;
    const IDLE = [['boop', 'calm'], ['ooh', 'happy'], ['happy', 'happy'], ['sleep', 'blink'], ['giggle', 'heart']];
    const flyP = new V(), flyPrev = new V(), vel = new V(), VP = {};
    // a slow device drops the shadows and draws at one pixel per pixel, once (adaptive-quality skill)
    let slowFor = 0, lean = false;
    renderer.setAnimationLoop(() => {
      const t = now(), dt = Math.min(0.05, t - last), raw = t - last; last = t;
      if (!lean) {
        slowFor = raw > 0.04 && !document.hidden ? slowFor + Math.min(raw, 0.2) : Math.max(0, slowFor - raw);
        if (slowFor > 2) { lean = true; renderer.setPixelRatio(1); size(); key.castShadow = false; renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
      }
      if (t > chirpAt) {
        chirpAt = t + 10 + Math.random() * 8;
        if (t - busyAt > IDLE_AFTER && !document.hidden) { if (Math.random() < 0.35) { bot.emote(look().emote, t); voice('giggle'); } else { const [m, f] = IDLE[Math.floor(Math.random() * IDLE.length)]; voice(m); face = f; faceUntil = t + 1.2; } }
      }
      // the turntable: eases to a chosen side, coasts after a drag, turns slowly on its own when left alone
      if (drag == null) {
        if (spinTo != null) { spin += (spinTo - spin) * Math.min(1, dt * 5); if (Math.abs(spinTo - spin) < 0.002) spinTo = null; }
        else if (Math.abs(spinV) > 0.01) { spin += spinV * dt; spinV *= Math.exp(-dt * 3); }
        else if (auto && !reduce && t - busyAt > IDLE_AFTER) spin += dt * 0.25;
      }
      standG.rotation.y = spin;
      // the camera glides to the chosen part
      for (const k of ['y', 'd', 'ly']) cam[k] += (camT[k] - cam[k]) * Math.min(1, dt * 4);
      const d = cam.d * zoom;
      camera.position.set(0, cam.y + (zoom - 1) * 1.5, d); camera.lookAt(0, cam.ly, 0);
      // the bot: on the trail page it flies a slow figure eight so the trail shows; a victory pose plays for a moment
      flyPrev.copy(flyP);
      if (tab === 'Trail' && !reduce) { const a = t * 0.9; flyP.set(Math.sin(a) * 2.2, 0.6 + Math.sin(a * 2) * 0.35, Math.sin(a * 2) * 1.1); }
      else flyP.multiplyScalar(Math.max(0, 1 - dt * 4));
      vel.subVectors(flyP, flyPrev).divideScalar(Math.max(1e-3, dt));
      let fc = t < faceUntil ? face : undefined;
      bot.group.position.copy(flyP);
      if (t < vicUntil) { BotKit.victoryPose(vicKind, t, VP); bot.group.position.y += VP.y; bot.group.rotation.set(VP.flip, spin + VP.turn, VP.tilt); fc = fc || VP.face; bot.cheer(t, vicKind); }
      else bot.group.rotation.set(0, spin, 0);
      bot.update(t, dt, { face: fc, vel: tab === 'Trail' ? vel.applyAxisAngle(new V(0, 1, 0), -spin) : undefined });
      if (demo) demo.update(t, dt);
      dust.rotation.y = t * 0.02;
      composer.render();
    });
    stage = {
      build: () => build(preview),
      tryFace: f => { face = f; faceUntil = f ? now() + 1.6 : 0; },
      view: name => { setView(name); syncOrb(); },
      emote: k => { bot.emote(k, now()); busyAt = now(); },
      victory: k => { vicKind = k; vicUntil = now() + 3.6; busyAt = now(); },
      fire: () => bot.fire(now()),
      toggleSpin: () => (auto = !auto),
      // trying a part on while the pointer is on its card
      preview: (k, v) => { if (preview && preview[k] === v) return; preview = { [k]: v }; build(preview); },
      unpreview: () => { if (!preview) return; preview = null; build(); },
      stop() { if (demo) demo.dispose(); renderer.setAnimationLoop(null); ro.disconnect(); evs.forEach(ev => el && el.removeEventListener(ev, touch)); bot && bot.dispose(); keep.forEach(x => x.dispose && x.dispose()); composer.dispose && composer.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss(); cv.remove(); },   // free the GPU context now: Chrome keeps only 16 alive
    };
    el.querySelector('[data-spin]').classList.toggle('on', auto);
  }

  function unmount() { if (stage) stage.stop(); stage = null; el = null; if (window.IdleAudio) IdleAudio.stop(); }
  return { title: 'Hangar', mount, unmount };
})());
