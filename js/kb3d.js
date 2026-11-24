// 3D keyboards. Each board is built from its layout in keyboards.js so a new
// sponsor board needs one data entry. GLB models from the makers can replace them later.
// KB3D.mount(stage, card) builds the showroom in stage and returns a function that
// stops the render loop and frees the WebGL context.
window.KB3D = (() => {
  let libs = null;
  async function load() {
    if (!libs) libs = Promise.all([
      import('three'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]);
    return libs;
  }

  function mount(stage, card) {
    let dispose = null, gone = false;
    const loading = stage.querySelector('.kb-loading');
    load().then(([T, R, O, E]) => {
      if (gone) return;
      loading.remove();
      dispose = build3d(stage, card, T, R.RoundedBoxGeometry, O.OrbitControls, E.RoomEnvironment);
    }).catch(e => {
      libs = null;
      console.warn(e);
      loading.textContent = 'The 3D keyboards need an internet connection.';
    });
    return () => { gone = true; if (dispose) dispose(); };
  }

  function build3d(stage, card, THREE, RoundedBoxGeometry, OrbitControls, RoomEnvironment) {
  const picker = stage.querySelector('.kb-picker');
  const typedEl = stage.querySelector('.kb-typed');
  const offs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#040a07');
  scene.fog = new THREE.Fog('#040a07', 30, 70);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.35;
  controls.target.set(0, 0.6, 0);
  const finePointer = matchMedia('(pointer: fine)').matches;
  controls.enableRotate = finePointer;
  renderer.domElement.style.touchAction = 'pan-y';

  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(-6, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 40 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(Theme.hex('accent'), 0.7);
  fill.position.set(8, 5, -6);
  scene.add(fill);

  // desk mat
  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(400, 0.12, 400),
    new THREE.MeshStandardMaterial({ color: '#06110b', roughness: 1 })
  );
  mat.position.y = -0.06;
  mat.receiveShadow = true;
  scene.add(mat);
  const grid = new THREE.GridHelper(80, 40, Theme.hex('accent-dim'), '#0f3a24');
  grid.position.y = 0.005;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  // ---------- board builder ----------
  const geoCache = new Map();
  function capGeo(w, h) {
    const id = w + 'x' + h;
    if (!geoCache.has(id)) geoCache.set(id, new RoundedBoxGeometry(w - 0.12, 0.42, h - 0.12, 3, 0.1));
    return geoCache.get(id);
  }

  function legendAtlas(labels, color) {
    const N = Math.ceil(Math.sqrt(labels.length));
    const cell = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * cell;
    const c = cv.getContext('2d');
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const uv = new Map();
    labels.forEach((l, i) => {
      const x = (i % N) * cell, y = Math.floor(i / N) * cell;
      const size = l.length === 1 ? 58 : l.length <= 3 ? 36 : 28;
      c.font = `600 ${size}px "Chakra Petch", system-ui, sans-serif`;
      c.fillText(l, x + cell / 2, y + cell / 2 + 2);
      uv.set(l, { u0: x / cv.width, v0: 1 - (y + cell) / cv.height, s: cell / cv.width });
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { tex, uv };
  }

  function screenTexture() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.draw = text => {
      c.fillStyle = '#04100a'; c.fillRect(0, 0, 256, 128);
      c.fillStyle = Theme.hex('accent'); c.font = '600 54px "JetBrains Mono", monospace';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, 128, 66);
      tex.needsUpdate = true;
    };
    tex.draw('204');
    return tex;
  }

  let board = null;          // current THREE.Group
  let keyMap = new Map();    // code -> [key groups]
  let capMeshes = [];
  let screenTex = null;

  function build(kb) {
    const L = window.KB_LAYOUTS[kb.layout];
    const look = kb.look;
    const g = new THREE.Group();
    keyMap = new Map();
    capMeshes = [];
    screenTex = null;

    const labels = new Set();
    L.rows.forEach(r => r.forEach(k => { if (Array.isArray(k) && k[0]) labels.add(k[0]); }));
    const atlas = legendAtlas([...labels], look.legend);

    const capMat = col => look.crystal
      ? new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.08, transmission: 0.85, thickness: 0.4, ior: 1.5 })
      : new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
    const mats = { alpha: capMat(look.alpha), mod: capMat(look.mod), accent: capMat(look.accent) };
    const legendMat = new THREE.MeshStandardMaterial({
      map: atlas.tex, transparent: true, roughness: 0.6,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    });

    // lay keys out in units
    let maxX = 0, knobSpot = null;
    const placed = [];
    L.rows.forEach((r, ri) => {
      let x = 0;
      const z = ri + (ri > 0 && L.fGap ? L.fGap : 0);
      for (const k of r) {
        if (!Array.isArray(k)) {
          if (k.knob) knobSpot = { x: x + 0.5, z: z + 0.5 };
          x += k.gap; continue;
        }
        const [label, w, code, h] = k;
        placed.push({ label, w, h, code, x: x + w / 2, z: z + h / 2 });
        x += w;
      }
      maxX = Math.max(maxX, x);
    });
    const rowsD = L.rows.length + (L.fGap || 0);
    const extraBack = (kb.knob && !knobSpot) || kb.screen ? 1.1 : 0;
    const ox = maxX / 2, oz = rowsD / 2;

    // case
    const caseW = maxX + 0.8, caseD = rowsD + 0.8 + extraBack;
    const caseMat = look.clear
      ? new THREE.MeshPhysicalMaterial({ color: look.case, roughness: 0.12, transmission: 0.82, thickness: 1.2, ior: 1.49, attenuationColor: new THREE.Color(look.case), attenuationDistance: 3 })
      : new THREE.MeshStandardMaterial({ color: look.case, roughness: look.metal ? 0.38 : 0.7, metalness: look.metal ? 0.85 : 0 });
    const caseMesh = new THREE.Mesh(new RoundedBoxGeometry(caseW, 0.85, caseD, 4, 0.2), caseMat);
    caseMesh.position.set(0, 0.425, -extraBack / 2);
    caseMesh.castShadow = true; caseMesh.receiveShadow = true;
    g.add(caseMesh);

    // plate with a thin strip of light under the caps
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(maxX + 0.1, 0.06, rowsD + 0.1),
      new THREE.MeshStandardMaterial({ color: '#2a2b2f', roughness: 0.6, emissive: look.rgb, emissiveIntensity: 0.18 })
    );
    plate.position.y = 0.9;
    g.add(plate);
    if (look.clear) {
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(maxX, 0.08, rowsD), new THREE.MeshStandardMaterial({ color: '#1d2420', roughness: 0.8 }));
      pcb.position.y = 0.55;
      g.add(pcb);
    }

    // keys
    for (const p of placed) {
      const kg = new THREE.Group();
      const isAccent = p.code && [].concat(p.code).some(c => look.accentKeys.includes(c));
      const isMod = p.w > 1.01 || p.label.length > 1 || /^F\d/.test(p.label) || p.label === '';
      const m = isAccent ? mats.accent : isMod && p.label !== '' ? mats.mod : mats.alpha;
      const cap = new THREE.Mesh(capGeo(p.w, p.h), m);
      cap.castShadow = true;
      cap.position.y = 0.21;
      kg.add(cap);
      if (p.label) {
        const a = atlas.uv.get(p.label);
        const pg = new THREE.PlaneGeometry(0.6, 0.6);
        const uvs = pg.attributes.uv;
        for (let i = 0; i < uvs.count; i++) uvs.setXY(i, a.u0 + uvs.getX(i) * a.s, a.v0 + uvs.getY(i) * a.s);
        const lg = new THREE.Mesh(pg, legendMat);
        lg.rotation.x = -Math.PI / 2;
        lg.position.y = 0.425;
        if (p.w >= 1.5) lg.position.x = -(p.w - 1) / 2 + 0.05;   // mods print on the left like real caps
        kg.add(lg);
      }
      kg.position.set(p.x - ox, 0.95, p.z - oz);
      kg.userData = { y: 0, target: 0, label: p.label };
      cap.userData.key = kg;
      capMeshes.push(cap);
      g.add(kg);
      for (const c of [].concat(p.code || [])) {
        if (!keyMap.has(c)) keyMap.set(c, []);
        keyMap.get(c).push(kg);
      }
    }

    // knob and screen on the boards that have them
    if (kb.knob) {
      const kx = knobSpot ? knobSpot.x - ox : maxX / 2 - 0.7;
      const kz = knobSpot ? knobSpot.z - oz : -oz - 0.55;
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.44, 0.55, 48),
        new THREE.MeshStandardMaterial({ color: look.metal || look.clear ? '#c9c9c6' : look.mod, metalness: 0.9, roughness: 0.3 })
      );
      knob.position.set(kx, 1.13, kz);
      knob.castShadow = true;
      g.add(knob);
    }
    if (kb.screen) {
      screenTex = screenTexture();
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
      scr.rotation.x = -Math.PI / 2;
      scr.position.set(maxX / 2 - 1.2, 0.855, -oz - 0.6);
      g.add(scr);
    }

    g.rotation.x = 0.07;
    g.position.y = 0.0;
    g.userData.width = caseW;
    return g;
  }

  // ---------- camera fit ----------
  function fit() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const bw = (board && board.userData.width) || 20;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const distH = (bw * (camera.aspect < 1 ? 0.6 : 0.54)) / Math.tan(fov / 2) / camera.aspect;
    const dist = Math.max(distH, (bw * 0.5) / Math.tan(fov / 2));
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 0.01) dir.set(0, 0.75, 1);
    dir.setLength(dist);
    camera.position.copy(controls.target).add(dir);
    camera.updateProjectionMatrix();
  }

  // ---------- selection ----------
  let current = null;
  let dropT = 1;
  function select(kb) {
    current = kb;
    if (board) {
      scene.remove(board);
      board.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); });
    }
    board = build(kb);
    scene.add(board);
    dropT = 0;
    fit();
    TT.setProfile(kb.sound);
    picker.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.id === kb.id));
    renderSpec(kb);
    typedEl.textContent = '';
  }

  function renderSpec(kb) {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    card.innerHTML = `
      <div class="ph">&gt; SPECS_<span class="meta">${esc(kb.layout)}%</span></div>
      <div class="tag">${esc(kb.tag)}</div>
      <h3>${esc(kb.name)}${kb.sub ? `<small>${esc(kb.sub)}</small>` : ''}</h3>
      <p class="standout">${esc(kb.standout)}</p>
      <dl>${kb.specs.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
      <div class="price">${esc(kb.price)}</div>
      <div class="links">
        <a class="btn" href="${esc(kb.video)}" target="_blank" rel="noopener">Watch Art type on it</a>
        <a class="btn out" href="${esc(kb.src[0])}" target="_blank" rel="noopener">Maker page</a>
      </div>`;
  }

  for (const kb of window.KEYBOARDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = kb.name.replace(' Wireless', '');
    b.dataset.id = kb.id;
    b.setAttribute('role', 'tab');
    on(b, 'click', () => select(kb));
    picker.appendChild(b);
  }

  // ---------- pressing ----------
  let idleT = 99;
  let typed = '';
  const stamps = [];
  function press(code, ch) {
    const ks = keyMap.get(code);
    if (ks) ks.forEach(k => { k.userData.target = -0.16; });
    idleT = 0;
    if (ch) {
      const now = performance.now();
      stamps.push(now);
      while (stamps.length && now - stamps[0] > 5000) stamps.shift();
      if (screenTex && stamps.length > 3) screenTex.draw(String(Math.round((stamps.length / 5) / ((now - stamps[0]) / 60000 || 1))));
      typed = (typed + ch).slice(-48);
      typedEl.textContent = typed;
    } else if (code === 'Backspace') {
      typed = typed.slice(0, -1);
      typedEl.textContent = typed;
    }
  }
  function release(code) {
    const ks = keyMap.get(code);
    if (ks) ks.forEach(k => { k.userData.target = 0; });
  }
  function inView() {
    const r = stage.getBoundingClientRect();
    return r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.4;
  }
  on(window, 'keydown', e => {
    if (!visible || e.repeat) return;
    const inBox = document.activeElement && document.activeElement.classList.contains('sr-input');
    if (!inBox && !inView()) return;
    if (!inBox && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    press(e.code, !inBox && e.key.length === 1 ? e.key : null);
    if (!inBox && !e.ctrlKey && !e.metaKey) TT.click(e.code === 'Space' || e.code === 'Enter');
  }, true);
  on(window, 'keyup', e => {
    release(e.code);
    const inBox = document.activeElement && document.activeElement.classList.contains('sr-input');
    if (!inBox && visible && inView()) TT.click(false, true);
  }, true);

  // tap a key on the model
  const ray = new THREE.Raycaster();
  let downAt = null;
  on(renderer.domElement, 'pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
  on(renderer.domElement, 'pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(capMeshes, false)[0];
    if (!hit) return;
    const kg = hit.object.userData.key;
    kg.userData.target = -0.16;
    const l = kg.userData.label;
    TT.click(l === '' || l === 'Enter');
    idleT = 0;
    typed = (typed + (l === '' ? ' ' : l.length === 1 ? l.toLowerCase() : '')).slice(-48);
    typedEl.textContent = typed;
    setTimeout(() => { kg.userData.target = 0; TT.click(false, true); }, 110);
  });

  // ---------- loop ----------
  let visible = false;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
  io.observe(stage);
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  on(document, 'visibilitychange', () => { if (document.hidden) visible = false; else visible = stage.getBoundingClientRect().bottom > 0; });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) controls.autoRotate = false;

  const clock = new THREE.Clock();
  const typingView = new THREE.Vector3(0, 0.82, 0.57).normalize();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    if (!visible || !board) return;
    idleT += dt;
    // while someone types, stop spinning and turn the camera to the front
    if (idleT < 3) {
      controls.autoRotate = false;
      const dist = camera.position.distanceTo(controls.target);
      const want = typingView.clone().multiplyScalar(dist).add(controls.target);
      camera.position.lerp(want, Math.min(1, dt * 3));
    } else if (!reduce) {
      controls.autoRotate = true;
    }
    if (dropT < 1) {
      dropT = Math.min(1, dropT + dt * 2.5);
      const e = 1 - Math.pow(1 - dropT, 3);
      board.position.y = (1 - e) * 2.5;
      board.rotation.y = (1 - e) * -0.6;
    }
    board.traverse(o => {
      if (o.userData && o.userData.target !== undefined) {
        o.userData.y += (o.userData.target - o.userData.y) * Math.min(1, dt * 40);
        o.position.y = 0.95 + o.userData.y;
      }
    });
    controls.update(dt);
    renderer.render(scene, camera);
  });

  // start on a front three-quarter view
  camera.position.set(0, 9, 13);
  select(window.KEYBOARDS[0]);

  return () => {
    renderer.setAnimationLoop(null);
    offs.forEach(f => f());
    io.disconnect(); ro.disconnect();
    controls.dispose();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? [].concat(o.material) : [];
      ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    if (scene.environment) scene.environment.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  }

  return { mount };
})();
