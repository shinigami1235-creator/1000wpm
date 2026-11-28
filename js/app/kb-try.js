// Try a keyboard before buying it (the shop's Try button): a small arena where the board fires its
// shot at a target over and over, a plain shot, a second one, then a big combo shot, each with the
// board's sound. Uses the real combat effects (js/app/combat/fx3d.js), loaded on the first Try.
//
//   KbTry.open(kb, name)    kb: an id in KbShots (js/app/kb-shots.js)
window.KbTry = (() => {
  let cur = null;

  function open(kb, name) {
    close();
    const dlg = document.createElement('dialog');
    dlg.className = 'kbtry';
    dlg.setAttribute('aria-label', `Try the ${name || kb}`);
    dlg.innerHTML = `<div class="kbtry-head"><h2></h2><button class="btn out sm" type="button" data-close>Close</button></div>
      <div class="kbtry-stage"><span class="kbtry-load">Loading</span></div>
      <p class="kbtry-sig"></p>`;
    dlg.querySelector('h2').textContent = name || (window.KbShots ? KbShots.nameOf(kb) : kb);
    dlg.querySelector('.kbtry-sig').textContent = window.KbShots ? KbShots.sig(kb) : '';
    document.body.append(dlg);
    dlg.querySelector('[data-close]').addEventListener('click', close);
    dlg.addEventListener('close', close);
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    dlg.showModal();
    const me = cur = { dlg, kb, dead: false, dispose: null };
    start(me).catch(e => { console.warn('keyboard try', e); const l = dlg.querySelector('.kbtry-load'); if (l) l.textContent = 'The preview needs WebGL.'; });
  }

  async function start(me) {
    const [THREE, EC, RP, UB, OP] = await Promise.all([
      import('three'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      window.Lazy ? Lazy.need('combat') : Promise.resolve(),
    ]);
    if (me.dead || !window.Combat || !Combat.FX) return;
    const host = me.dlg.querySelector('.kbtry-stage');
    const W = Math.max(280, host.clientWidth), H = Math.round(W * 0.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020604');
    scene.fog = new THREE.Fog('#020604', 16, 34);
    const camera = new THREE.PerspectiveCamera(34, W / H, 0.5, 80);
    camera.position.set(0, 3.2, 15); camera.lookAt(0, 1.5, 0);
    const composer = new EC.EffectComposer(renderer);
    composer.addPass(new RP.RenderPass(scene, camera));
    composer.addPass(new UB.UnrealBloomPass(new THREE.Vector2(W, H), 0.75, 0.45, 0.85));
    composer.addPass(new OP.OutputPass());
    const keep = [];
    const own = x => (keep.push(x), x);
    scene.add(new THREE.HemisphereLight('#c9d3da', '#08090a', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 2); key.position.set(2, 8, 10); scene.add(key);
    const accent = (window.Theme && Theme.hex('accent')) || '#39ff88';
    // the floor, the shooter's pad and the target: a dark plate with a lit ring
    const grid = new THREE.GridHelper(40, 40, '#0f3a22', '#0a2416'); grid.position.y = 0.01; scene.add(grid); own(grid.geometry); own(grid.material);
    const pad = (x, col) => {
      const m = new THREE.Mesh(own(new THREE.CylinderGeometry(1.6, 1.8, 0.24, 6)), own(new THREE.MeshStandardMaterial({ color: '#14171c', metalness: 0.6, roughness: 0.4 })));
      m.position.set(x, 0.12, 0); scene.add(m);
      const r = new THREE.Mesh(own(new THREE.TorusGeometry(1.62, 0.03, 6, 6)), own(new THREE.MeshBasicMaterial({ color: col, toneMapped: false })));
      r.rotation.x = Math.PI / 2; r.position.set(x, 0.25, 0); scene.add(r);
    };
    pad(-5.5, accent); pad(5.5, '#f29d30');
    const tgt = new THREE.Group(); tgt.position.set(5.5, 1.9, 0); scene.add(tgt);
    const tMat = own(new THREE.MeshStandardMaterial({ color: '#1b1f26', metalness: 0.5, roughness: 0.35, emissive: '#f29d30', emissiveIntensity: 0.15 }));
    const core = new THREE.Mesh(own(new THREE.IcosahedronGeometry(0.7, 1)), tMat); tgt.add(core);
    const ringM = own(new THREE.MeshBasicMaterial({ color: '#f29d30', toneMapped: false }));
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(1.15, 0.05, 8, 40)), ringM); ring.rotation.y = Math.PI / 2; tgt.add(ring);
    const gun = new THREE.Mesh(own(new THREE.SphereGeometry(0.22, 16, 12)), own(new THREE.MeshBasicMaterial({ color: accent, toneMapped: false })));
    gun.position.set(-5.5, 1.9, 0); scene.add(gun);
    let shake = 0, kick = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fx = Combat.FX.create(THREE, scene, camera, { calm: reduce, reduce, pixelHeight: () => renderer.domElement.height, juice: { shake: k => { shake = Math.max(shake, k * 0.4); } } });
    const from = new THREE.Vector3(-5.2, 1.9, 0);
    const aim = out => out.copy(tgt.position).add(new THREE.Vector3(-0.2, 0, 0));
    const land = () => { kick = 1; };
    // the order it fires in: two plain shots, then a combo shot
    const SEQ = [[1, 1.0], [1, 0.9], [3, 1.5]];
    let t = 0, next = 0.5, step = 0, last = performance.now();
    const fire = () => {
      const [tier, gap] = SEQ[step++ % SEQ.length];
      fx.shot(tier, from, aim, land, { kb: me.kb, color: tier === 1 ? accent : null, w: 0.6, dur: tier >= 3 ? 0.05 : 0.32 });
      if (window.KbShots) KbShots.play(me.kb, { vol: 0.8, big: tier >= 3 });
      next = t + gap;
    };
    renderer.setAnimationLoop(() => {
      const n = performance.now(), dt = Math.min(0.05, (n - last) / 1000); last = n;
      t += dt;
      if (t >= next) fire();
      kick = Math.max(0, kick - dt * 4);
      tgt.position.x = 5.5 + kick * 0.35;
      tMat.emissiveIntensity = 0.15 + kick * 1.6;
      ring.rotation.x += dt * 0.6;
      shake = Math.max(0, shake - dt * 2);
      camera.position.set((Math.random() - 0.5) * shake, 3.2 + (Math.random() - 0.5) * shake, 15);
      camera.lookAt(0, 1.5, 0);
      fx.update(dt);
      composer.render();
    });
    me.dispose = () => {
      renderer.setAnimationLoop(null);
      fx.dispose();
      keep.forEach(x => { try { x.dispose(); } catch (e) {} });
      composer.dispose(); renderer.dispose(); renderer.forceContextLoss();
    };
    window._kbtry = { fx, step: () => fire(), renderer };   // tests
  }

  function close() {
    const me = cur; if (!me) return;
    cur = null; me.dead = true;
    if (me.dispose) me.dispose();
    if (me.dlg.open) me.dlg.close();
    me.dlg.remove();
    window._kbtry = null;
  }

  return { open, close };
})();
