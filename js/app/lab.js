// #/lab: the Operator page. Pick a base, colours, keyboard and gear for your operator, play its
// animations and save it as the operator you fight as (js/app/operator3d.js). Gear sold in the
// shop (REWARDS.shop.gear) can be tried on here and shows in fights once it's bought.
Router.register('lab', (() => {
  const KEY = 'wpm-operator';
  let el = null, stop = null, op = null, P = null, offTheme = null;

  const esc = s => UI.esc(String(s));
  const saved = () => Operator.clean(TT.store.get(KEY, null) || Operator.defaults('male'));

  function mount(root) {
    el = root;
    P = saved();
    el.classList.add('page-full');
    el.innerHTML = `
      <div class="lab">
        <section class="lab-view" aria-label="Operator preview">
          <div class="lab-stage" data-stage></div>
          <div class="lab-views" role="group" aria-label="View">
            <button type="button" class="btn out sm" data-view="0">Front</button>
            <button type="button" class="btn out sm" data-view="1.5708">Side</button>
            <button type="button" class="btn out sm" data-view="3.1416">Back</button>
          </div>
        </section>
        <section class="panel lab-panel" aria-labelledby="lab-h">
          <div class="ph" id="lab-h">// YOUR OPERATOR</div>
          <div class="lab-group">
            <span class="label">Base</span>
            <div class="seg" role="group" aria-label="Base" data-base>
              ${Object.entries(Operator.BASES).map(([id, b]) => `<button type="button" data-v="${id}">${esc(b.name)}</button>`).join('')}
            </div>
          </div>
          <div class="lab-group">
            <span class="label">Colours</span>
            <div class="lab-colors" data-colors></div>
          </div>
          <div class="lab-group">
            <span class="label">Body</span>
            <div class="lab-sliders" data-body></div>
          </div>
          <div class="lab-group">
            <span class="label">Keyboard</span>
            <div class="seg" role="group" aria-label="Keyboard shape" data-kb>
              ${Operator.KB_STYLES.map(([id, n]) => `<button type="button" data-v="${id}">${esc(n)}</button>`).join('')}
            </div>
            <div class="lab-colors" data-kbc></div>
            <div data-kblock></div>
          </div>
          <div class="lab-group">
            <span class="label">Gear</span>
            <div class="lab-acc" data-acc></div>
          </div>
          <div class="lab-group">
            <span class="label">Animation</span>
            <div class="seg lab-anims" role="group" aria-label="Animation" data-anim>
              ${Operator.ANIMS.map(([id, n]) => `<button type="button" data-v="${id}">${esc(n)}</button>`).join('')}
            </div>
            <div class="lab-once">${Operator.ONCE.map(([id, n]) => `<button type="button" class="btn out sm" data-once="${id}">${esc(n)}</button>`).join('')}</div>
          </div>
          <div class="lab-group lab-actions">
            <button type="button" class="btn" data-save>Save as mine</button>
            <button type="button" class="btn out" data-copy>Copy preset</button>
            <button type="button" class="btn out" data-reset>Reset</button>
          </div>
          <p class="lab-note" data-note aria-live="polite"></p>
        </section>
      </div>`;
    paintForm();
    el.querySelector('[data-base]').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === P.base) return;
      // a new base starts from that base's outfit colours
      P = Operator.clean({ ...Operator.defaults(b.dataset.v) }); apply(); paintForm();
    });
    el.querySelector('[data-body]').addEventListener('input', e => {
      const k = e.target.dataset.body; if (!k) return;
      P.body[k] = +e.target.value / 100; apply();
    });
    el.querySelector('[data-colors]').addEventListener('input', e => {
      if (e.target.dataset.tint) {
        if (e.target.dataset.tint === 'k') P.tint.k = +e.target.value / 100; else P.tint.color = e.target.value;
        const code = e.target.parentElement.querySelector('code'); if (code && e.target.type === 'color') code.textContent = e.target.value;
        apply(); return;
      }
      const z = e.target.dataset.zone; if (!z) return;
      if (e.target.type === 'checkbox') { P.colors[z] = e.target.checked ? 'theme' : Theme.hex('accent'); apply(); paintForm(); return; }
      P.colors[z] = e.target.value;
      const code = e.target.parentElement.querySelector('code'); if (code) code.textContent = e.target.value;
      apply();
    });
    // the keyboard only shows while typing, so changing it starts the typing animation
    const showKb = () => { if (op) { op.play('type'); markAnim('type'); } };
    el.querySelector('[data-kb]').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      P.kb.style = b.dataset.v; apply(); paintForm(); showKb();
    });
    el.querySelector('[data-kbc]').addEventListener('input', e => {
      if (e.target.type === 'checkbox') P.kb.color = e.target.checked ? 'theme' : Theme.hex('accent');
      else P.kb.color = e.target.value;
      apply(); paintForm(); showKb();
    });
    el.querySelector('[data-acc]').addEventListener('change', e => {
      const a = e.target.dataset.acc; if (!a) return;
      P.acc[a] = e.target.checked; apply();
    });
    el.querySelector('[data-anim]').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b || !op) return;
      op.play(b.dataset.v); markAnim(b.dataset.v);
    });
    el.querySelectorAll('[data-once]').forEach(b => b.addEventListener('click', () => op && op.once(b.dataset.once)));
    el.querySelector('[data-save]').addEventListener('click', () => {
      TT.store.set(KEY, P);
      const t = trying();
      note(t.length ? `Saved. ${t.join(' and ')[0].toUpperCase() + t.join(' and ').slice(1)} ${t.length > 1 ? 'show' : 'shows'} in fights once you buy ${t.length > 1 ? 'them' : 'it'} in the shop.` : 'Saved as your operator.');
    });
    el.querySelector('[data-copy]').addEventListener('click', async () => {
      const text = JSON.stringify(P);
      try { await navigator.clipboard.writeText(text); note('Preset copied.'); } catch (e) { note(text); }
    });
    el.querySelector('[data-reset]').addEventListener('click', () => { P = Operator.defaults(P.base); apply(); paintForm(); note(''); });
    markAnim('idle');
    const offInv = WPM.on('inventory', () => el && paintForm());
    offTheme = () => { removeEventListener('wpm-theme', onTheme); offInv(); };
    addEventListener('wpm-theme', onTheme);
    start();
  }
  // shop gear: the item that unlocks an accessory or keyboard, and whether you own it
  const GEAR = () => (window.REWARDS && REWARDS.shop && REWARDS.shop.gear) || [];
  const gearFor = (k, v) => GEAR().find(g => g[k] === v);
  const lockedItem = (k, v) => { const g = gearFor(k, v); return g && !WPM.owns(g.id) ? g : null; };
  const tag = g => `<a class="lab-lock" href="#/shop" title="Buy it in the shop">${UI.coin()}${UI.fmt(g.price)}</a>`;
  function trying() {
    const out = [];
    for (const [a, name] of Operator.ACCESSORIES) if (P.acc[a] && lockedItem('acc', a)) out.push(name.toLowerCase());
    if (lockedItem('kb', P.kb.style)) out.push(`the ${P.kb.style} keyboard`);
    return out;
  }
  function onTheme() { if (op) op.repaint(); }
  function note(t) { const n = el && el.querySelector('[data-note]'); if (n) n.textContent = t; }
  function markAnim(id) { el.querySelectorAll('[data-anim] [data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === id))); }
  function apply() { if (op) op.set(P); }

  function paintForm() {
    el.querySelectorAll('[data-base] [data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === P.base)));
    // the generated body takes an outfit tint and the glow colour; the code-built body takes every zone
    const isModel = !!(op && op.model);
    const zones = isModel ? Operator.ZONES.filter(([z]) => z === 'glow') : Operator.ZONES;
    const tintRow = isModel ? `<label class="lab-color"><span>Outfit tint</span><input type="color" value="${P.tint.color}" data-tint="color" aria-label="Outfit tint colour"><code>${P.tint.color}</code></label>
      <label class="lab-slider"><span>Tint strength</span><input type="range" min="0" max="60" step="1" value="${Math.round(P.tint.k * 100)}" data-tint="k" aria-label="Tint strength"></label>` : '';
    el.querySelector('[data-body]').innerHTML = [['height', 'Height'], ['build', 'Build']].map(([k, n]) =>
      `<label class="lab-slider"><span>${n}</span><input type="range" min="-100" max="100" step="5" value="${Math.round(P.body[k] * 100)}" data-body="${k}" aria-label="${n}"></label>`).join('');
    el.querySelector('[data-colors]').innerHTML = tintRow + zones.map(([z, name]) => {
      const v = P.colors[z], theme = v === 'theme';
      const hex = theme ? Theme.hex('accent') : v;
      return `<label class="lab-color"><span>${esc(name)}</span>
        <input type="color" value="${hex}" data-zone="${z}" ${theme ? 'disabled' : ''} aria-label="${esc(name)} colour">
        ${z === 'glow' ? `<span class="lab-theme"><input type="checkbox" data-zone="glow" ${theme ? 'checked' : ''}> Theme</span>` : `<code>${hex}</code>`}</label>`;
    }).join('');
    el.querySelectorAll('[data-kb] [data-v]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.v === P.kb.style));
      const g = lockedItem('kb', b.dataset.v);
      b.classList.toggle('locked', !!g);
      b.title = g ? `${g.name}: ${UI.fmt(g.price)} coins in the shop` : '';
    });
    const kl = lockedItem('kb', P.kb.style);
    el.querySelector('[data-kblock]').innerHTML = kl ? `<p class="lab-try">Trying on the ${esc(kl.name.toLowerCase())}. ${tag(kl)}</p>` : '';
    const kt = P.kb.color === 'theme', kh = kt ? Theme.hex('accent') : P.kb.color;
    el.querySelector('[data-kbc]').innerHTML = `<label class="lab-color"><span>Glow</span>
      <input type="color" value="${kh}" ${kt ? 'disabled' : ''} aria-label="Keyboard colour">
      <span class="lab-theme"><input type="checkbox" ${kt ? 'checked' : ''}> Theme</span></label>`;
    // the generated body wears its outfit; only shop gear goes on over it
    const accList = isModel ? Operator.ACCESSORIES.filter(([a]) => gearFor('acc', a)) : Operator.ACCESSORIES;
    el.querySelector('[data-acc]').innerHTML = accList.map(([a, name]) => {
      const g = lockedItem('acc', a);
      return `<label class="lab-switch${g ? ' locked' : ''}"><input type="checkbox" data-acc="${a}" ${P.acc[a] ? 'checked' : ''}><span>${esc(name)}</span>${g ? tag(g) : ''}</label>`;
    }).join('');
  }

  // ---------- the 3D view ----------
  async function start() {
    const host = el.querySelector('[data-stage]');
    let THREE, Orbit, RB;
    try {
      const [T, O, G] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/geometries/RoundedBoxGeometry.js')]);
      THREE = { ...T, RoundedBoxGeometry: G.RoundedBoxGeometry }; Orbit = O.OrbitControls;
    } catch (e) { host.innerHTML = '<p class="loading-state">3D did not load. Check the connection.</p>'; return; }
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(Theme.hex('bg-0'));
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    camera.position.set(0.9, 1.25, 4.2);
    const ctl = new Orbit(camera, renderer.domElement);
    ctl.target.set(0, 0.95, 0); ctl.enablePan = false; ctl.minDistance = 1.6; ctl.maxDistance = 6.5;
    ctl.minPolarAngle = 0.35; ctl.maxPolarAngle = 1.62; ctl.enableDamping = true;
    scene.add(new THREE.HemisphereLight('#c9d3da', '#08090a', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(-2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(Theme.hex('accent'), 1.4); rim.position.set(2, 2.5, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight('#9fb6c8', 0.6); fill.position.set(3, 1, 2); scene.add(fill);
    // a floor disc with a ring, in the theme colour
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.3, 64), new THREE.MeshStandardMaterial({ color: Theme.hex('bg-2'), roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.26, 1.3, 96), new THREE.MeshBasicMaterial({ color: Theme.hex('accent'), transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);

    op = Operator.create(THREE, P, { onModel: () => el && paintForm() });
    scene.add(op.group);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) op.at('idle', 0);

    el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
      const a = +b.dataset.view, d = camera.position.distanceTo(ctl.target);
      camera.position.set(ctl.target.x + Math.sin(a) * d, 1.25, ctl.target.z + Math.cos(a) * d);
    }));
    const size = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size); ro.observe(host); size();
    let last = performance.now(), live = true, hold = false;
    renderer.setAnimationLoop(() => {
      if (!live || document.hidden) return;
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduce && !hold) op.update(dt);
      ctl.update();
      renderer.render(scene, camera);
    });
    window._lab = { op: () => op, at: (n, t) => { hold = true; op.at(n, t); }, play: () => { hold = false; }, bg: hex => { scene.background.set(hex); }, view: (a, dist, h) => { const d = dist || camera.position.distanceTo(ctl.target); camera.position.set(Math.sin(a) * d, h || 1.25, Math.cos(a) * d); ctl.update(); renderer.render(scene, camera); } };
    stop = () => {
      live = false; renderer.setAnimationLoop(null); ro.disconnect(); ctl.dispose();
      op.dispose(); op = null;
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
      delete window._lab;
    };
  }

  function unmount() {
    if (stop) stop(); stop = null;
    if (offTheme) offTheme(); offTheme = null;
    el = null;
  }

  return { title: 'Character Lab', mount, unmount };
})());
