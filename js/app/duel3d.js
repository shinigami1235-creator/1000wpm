// The duel arena in three.js: two fighters on hex pads facing each other across a
// round floor. Each fighter is the player's 3D avatar, rendered once by avatar3d.js
// into a portrait card (the lighter 2.5D style), so the arena never runs two live
// avatar rigs. Shots and spells come from the combat layer (Combat.FX) with each card
// as the target adapter.
//
//   const sc = DuelScene.mount(host, { sides: [{ look, color }, { look, color }], onImpact(side, dmg, x, y, extra) });
//   sc.ready                          Promise, true once three.js loaded
//   sc.shot(from, tier, onLand, { color, crit })   a word's shot from side `from` to the other side
//   sc.cast(from, spellId, hits, effect)           hits: [{ at: ms after now, dmg }]
//   sc.react(side, kind, power)       'typo' | 'hit' | 'block' | 'stun' | 'freeze' | 'flash' | 'fog'
//   sc.aura(side, name, on)           'ward' | 'hyper' | 'root' | 'split'
//   sc.setLook(side, look), sc.setHp(side, frac), sc.ko(side), sc.revive()
//   sc.screen(side, out)              host pixels above a fighter, for numbers and labels
//   sc.dispose()
window.DuelScene = (() => {
  let libs = null;
  function load() {
    libs ||= Promise.all([
      import('three'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  function mount(host, opts = {}) {
    let impl = null, gone = false;
    const pend = { looks: opts.sides.map(s => s.look), hp: [1, 1], auras: [] };
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP]) => {
        if (gone) return false;
        impl = build(host, opts, THREE, EC.EffectComposer, RP.RenderPass, UB.UnrealBloomPass, OP.OutputPass);
        pend.looks.forEach((l, i) => impl.setLook(i, l));
        pend.hp.forEach((f, i) => impl.setHp(i, f));
        return true;
      }).catch(e => { console.warn('Duel arena did not load', e); return false; }),
      shot: (from, tier, onLand, o) => { if (impl) impl.shot(from, tier, onLand, o); else if (onLand) onLand(); },
      cast: (from, id, hits, effect) => impl && impl.cast(from, id, hits, effect),
      react: (side, kind, p) => impl && impl.react(side, kind, p),
      aura: (side, name, on) => impl && impl.aura(side, name, on),
      setLook: (side, look) => { pend.looks[side] = look; if (impl) impl.setLook(side, look); },
      setHp: (side, f) => { pend.hp[side] = f; if (impl) impl.setHp(side, f); },
      ko: side => impl && impl.ko(side),
      revive: () => impl && impl.revive(),
      screen: (side, out) => (impl ? impl.screen(side, out) : null),
      info: () => (impl ? impl.info() : null),
      dispose() { gone = true; if (impl) impl.dispose(); impl = null; },
    };
    return ctl;
  }

  function build(host, opts, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
    const V = THREE.Vector3;
    const keep = [];
    const own = x => (keep.push(x), x);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phone = matchMedia('(max-width: 720px)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, phone ? 1.5 : 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'du-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = C('#020604');
    scene.fog = new THREE.Fog('#020604', 18, 44);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 120);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.45, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---------- the floor: a round pad of rings and spokes ----------
    const floorMat = own(new THREE.LineBasicMaterial({ color: C('#39ff88', 0.55), transparent: true, opacity: 0.55 }));
    const pts = [];
    for (const r of [2, 4, 6.5, 9, 12]) for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2, b = (i + 1) / 96 * Math.PI * 2;
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
    }
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(Math.cos(a) * 2, 0, Math.sin(a) * 2, Math.cos(a) * 12, 0, Math.sin(a) * 12); }
    const fg = own(new THREE.BufferGeometry()); fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(fg, floorMat));
    const disc = new THREE.Mesh(own(new THREE.CircleGeometry(12.2, 64)), own(new THREE.MeshBasicMaterial({ color: '#03100a' })));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.01; scene.add(disc);

    // background towers of glowing blocks, far back
    const towerMat = own(new THREE.MeshBasicMaterial({ color: C('#1f9e57', 0.5), wireframe: true, transparent: true, opacity: 0.35 }));
    const towerGeo = own(new THREE.BoxGeometry(1, 1, 1));
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (0.12 + 0.76 * i / 25) + Math.PI;
      const r = rnd(20, 30), h = rnd(4, 16);
      const m = new THREE.Mesh(towerGeo, towerMat);
      m.scale.set(rnd(1.2, 2.6), h, rnd(1.2, 2.6));
      m.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r);
      scene.add(m);
    }

    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    { const c = glowCv.getContext('2d'); const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }
    const glowTex = own(new THREE.CanvasTexture(glowCv));

    // ---------- fighters ----------
    const CARD_W = 3.1, CARD_H = 3.6;
    const POS = [new V(-4.1, 0, 0.6), new V(4.1, 0, 0.6)];
    const YAW = [0.42, -0.42];
    const loader = new THREE.TextureLoader();
    const F = opts.sides.map((s, i) => {
      const g = new THREE.Group();
      g.position.copy(POS[i]);
      g.rotation.y = YAW[i];
      scene.add(g);
      const col = C(s.color || (i ? '#f29d30' : '#39ff88'));
      // hex pad and the light column under the card
      const pad = new THREE.Mesh(own(new THREE.CylinderGeometry(1.7, 1.85, 0.22, 6)), own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.35) })));
      pad.position.y = 0.11; g.add(pad);
      const ring = new THREE.Mesh(own(new THREE.RingGeometry(1.95, 2.08, 6)), own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), side: THREE.DoubleSide, transparent: true, opacity: 0.9 })));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.24; g.add(ring);
      // a soft glow behind the card in the side's colour
      const beam = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: col.clone().multiplyScalar(0.55), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })));
      beam.scale.set(6.5, 6.5, 1); beam.position.set(0, 2.4, -0.6); g.add(beam);
      // the portrait card
      const card = new THREE.Group(); card.position.y = 0.45 + CARD_H / 2; g.add(card);
      // the hooded figure stands in until the 3D portrait is rendered
      const mat = own(new THREE.MeshBasicMaterial({ color: '#d8d8d8', transparent: true }));
      const plane = new THREE.Mesh(own(new THREE.PlaneGeometry(CARD_W, CARD_H)), mat);
      if (i === 1) plane.scale.x = -1;            // mirrored so both fighters face the middle
      card.add(plane);
      // corner brackets in the side's colour
      const br = [];
      const bw = CARD_W / 2 + 0.12, bh = CARD_H / 2 + 0.12, L = 0.55;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) br.push(sx * bw, sy * bh, 0.02, sx * (bw - L), sy * bh, 0.02, sx * bw, sy * bh, 0.02, sx * bw, sy * (bh - L), 0.02);
      const bg = own(new THREE.BufferGeometry()); bg.setAttribute('position', new THREE.Float32BufferAttribute(br, 3));
      const brMat = own(new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.2) }));
      card.add(new THREE.LineSegments(bg, brMat));
      // a tint panel over the card for flashes, stun, freeze and the KO
      const tintMat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      const tint = new THREE.Mesh(own(new THREE.PlaneGeometry(CARD_W, CARD_H)), tintMat); tint.position.z = 0.01; card.add(tint);
      return { g, card, plane, mat, tintMat, brMat, beam, ring, col, base: card.position.clone(), kick: 0, kickDir: i ? 1 : -1, flash: 0, flashCol: new THREE.Color('#ffffff'), stun: 0, freeze: 0, fog: 0, hp: 1, ko: 0, koT: 0, tex: null, seq: 0, glitch: 0 };
    });

    // ---------- combat effects ----------

    let shake = 0, stopUntil = 0, flashGate = [];
    const canFlash = () => { const t = performance.now(); flashGate = flashGate.filter(x => t - x < 1000); if (flashGate.length >= (reduce ? 2 : 3)) return false; flashGate.push(t); return true; };
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm: reduce, reduce, pixelHeight: () => renderer.domElement.height,
      juice: { shake: k => { shake = Math.max(shake, k * 0.6); }, stop: ms => { stopUntil = Math.max(stopUntil, performance.now() + ms); }, glitch: () => {}, dim: () => {}, tint: () => {}, canFlash },
    }) : null;
    const tmp = new V(), tmp2 = new V();
    const centre = (i, out) => { F[i].card.getWorldPosition(out); return out; };
    const adapters = F.map((f, i) => ({
      size: 1.6,
      pos: out => centre(i, out),
      top: out => centre(i, out).setY(f.base.y + CARD_H / 2 + 0.4),
      base: out => out.copy(POS[i]).setY(0.25),
      react: (kind, power) => react(i, kind === 'stun' ? 'stun' : kind === 'freeze' ? 'freeze' : 'hit', power),
    }));
    const casterOf = i => ({ pos: out => centre(i, out).add(tmp2.set(i ? -1.2 : 1.2, 0.2, 0.4)) });

    // tier 0 bolts: small glowing sprites
    const BOLTS = 24;
    const bolts = Array.from({ length: BOLTS }, () => {
      const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })));
      s.visible = false; s.scale.setScalar(0.9); scene.add(s);
      return { s, on: false, t: 0, dur: 0.2, from: new V(), to: 0, onLand: null };
    });
    let boltI = 0;

    function shot(from, tier, onLand, o = {}) {
      const to = 1 - from;
      const start = casterOf(from).pos(new V());
      if (fx && tier >= 1) {
        fx.shot(Math.min(4, tier), start, out => centre(to, out).add(tmp.set(rnd(-0.6, 0.6), rnd(-0.6, 0.8), 0.2)), () => { react(to, 'hit', 0.3 + tier * 0.15); if (onLand) onLand(); }, { color: o.color });
        return;
      }
      const b = bolts[boltI = (boltI + 1) % BOLTS];
      b.on = true; b.t = 0; b.dur = 0.2; b.from.copy(start); b.to = to; b.onLand = () => { react(to, 'hit', 0.25); if (onLand) onLand(); };
      b.s.material.color.set(o.color || (from ? '#f29d30' : '#39ff88')).multiplyScalar(2);
      b.s.visible = true;
    }

    function cast(from, id, hits, effect) {
      if (!fx) return;
      const now = performance.now();
      fx.cast(id, { caster: casterOf(from), target: adapters[1 - from], hits: hits.map(h => ({ at: Math.max(0, h.at - now), amount: h.dmg })), effect: effect || {} });
    }

    function react(i, kind, power = 0.4) {
      const f = F[i];
      if (kind === 'hit') { f.kick = Math.min(1, f.kick + 0.35 + power * 0.4); f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#ffffff'); }
      if (kind === 'typo') { f.flash = Math.max(f.flash, 0.6); f.flashCol.set('#ff4d5e'); f.glitch = 0.35; }
      if (kind === 'block') { f.flash = Math.max(f.flash, 0.5); f.flashCol.set('#7dffc4'); if (fx) fx.event('ward', { caster: adapters[i] }); }
      if (kind === 'stun') { f.stun = Math.max(f.stun, power > 10 ? power / 1000 : 1.5); }
      if (kind === 'freeze') { f.freeze = Math.max(f.freeze, power > 10 ? power / 1000 : 2); }
      if (kind === 'fog') { f.fog = 1.5; }
      if (kind === 'flash') { f.flash = 1; f.flashCol.set('#ffffff'); }
    }
    function aura(i, name, on) { if (fx) fx.aura(name, on, { caster: adapters[i], target: adapters[1 - i] }); }

    // Art has no avatar look yet, so his card shows the laurel mark in his colour
    function artTexture() {
      const cv = document.createElement('canvas'); cv.width = cv.height = 512;
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(256, 220, 20, 256, 256, 360);
      g.addColorStop(0, '#0b2a30'); g.addColorStop(1, '#040806');
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      c.save(); c.translate(256 - 32 * 6.2, 236 - 34 * 6.2); c.scale(6.2, 6.2);
      c.strokeStyle = '#3ee6ff'; c.lineCap = 'round'; c.lineJoin = 'round'; c.shadowColor = '#3ee6ff'; c.shadowBlur = 6;
      c.lineWidth = 2.4; c.stroke(new Path2D('M20 47 L32 13 L44 47')); c.stroke(new Path2D('M27 41 L32 28 L37 41'));
      c.lineWidth = 1.6; c.stroke(new Path2D('M29 58 C17 54 9 44 10 20')); c.stroke(new Path2D('M35 58 C47 54 55 44 54 20'));
      c.fillStyle = '#3ee6ff';
      for (const [x, y, a] of [[23, 55, -25], [17, 51, -45], [13, 45, -62], [10.5, 38, -75], [9.5, 31, -85], [9.8, 24, -95]]) {
        for (const m of [1, -1]) { c.save(); c.translate(m === 1 ? x : 64 - x, y); c.rotate(m * a * Math.PI / 180); c.beginPath(); c.ellipse(0, 0, 4, 1.6, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
      }
      c.restore();
      c.fillStyle = '#3ee6ff'; c.font = '600 44px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.shadowBlur = 0;
      c.fillText('204 WPM', 256, 470);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function setLook(i, look) {
      const f = F[i], seq = ++f.seq;
      if (look && look.art) { f.plane.scale.x = 1; if (f.tex) f.tex.dispose(); f.tex = artTexture(); f.mat.map = f.tex; f.mat.needsUpdate = true; return; }
      if (!look || !window.Avatar) return;
      if (!f.tex) loader.load(Avatar.fallback(look, 256), tex => { if (!alive || seq !== f.seq || f.tex) { tex.dispose(); return; } tex.colorSpace = THREE.SRGBColorSpace; f.tex = tex; f.mat.map = tex; f.mat.needsUpdate = true; });
      Avatar.thumb(look, 512, 512).then(url => {
        if (seq !== f.seq || !alive) return;
        loader.load(url, tex => {
          if (!alive) { tex.dispose(); return; }
          tex.colorSpace = THREE.SRGBColorSpace;
          if (f.tex) f.tex.dispose();
          f.plane.scale.x = i ? -1 : 1;
          f.tex = tex; f.mat.map = tex; f.mat.needsUpdate = true;
        });
      }).catch(() => {});
    }
    function setHp(i, frac) { F[i].hp = Math.max(0, Math.min(1, frac)); }
    function ko(i) { F[i].ko = 1; F[i].koT = 0; }
    function revive() { F.forEach(f => { f.ko = 0; f.koT = 0; f.stun = 0; f.freeze = 0; }); }

    const _s = new V();
    function screen(i, out = {}) {
      centre(i, _s).setY(F[i].base.y + CARD_H / 2 + 0.2).project(camera);
      out.x = (_s.x * 0.5 + 0.5) * host.clientWidth; out.y = (-_s.y * 0.5 + 0.5) * host.clientHeight;
      return out;
    }

    // ---------- size and camera ----------
    const camPos = new V(0, 4.4, 15), look = new V(0, 2.5, 0);
    function fit() {
      const w = host.clientWidth || 600, h = host.clientHeight || 360;
      renderer.setSize(w, h, false); composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      // keep both cards in view on narrow screens
      const half = THREE.MathUtils.degToRad(camera.fov / 2);
      const need = 6.4 / (Math.tan(half) * camera.aspect);
      camPos.set(0, 4.2, Math.max(13.5, need + 1.5));
      camera.position.copy(camPos); camera.lookAt(look); camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    fit();
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);

    // ---------- frame ----------
    let alive = true, last = performance.now(), t = 0;
    renderer.setAnimationLoop(() => {
      if (!alive || document.hidden || !visible) { last = performance.now(); return; }
      const nowT = performance.now();
      let dt = Math.min(0.05, (nowT - last) / 1000); last = nowT;
      if (nowT < stopUntil) dt *= 0.15;
      t += dt;
      F.forEach((f, i) => {
        f.kick = Math.max(0, f.kick - dt * 3.2);
        f.flash = Math.max(0, f.flash - dt * 4.5);
        f.stun = Math.max(0, f.stun - dt); f.freeze = Math.max(0, f.freeze - dt); f.fog = Math.max(0, f.fog - dt);
        f.glitch = Math.max(0, f.glitch - dt);
        const bob = reduce ? 0 : Math.sin(t * 1.6 + i * 2) * 0.06;
        const jitter = (f.stun > 0 || f.glitch > 0) && !reduce ? (Math.random() - 0.5) * 0.12 : 0;
        if (f.ko) f.koT = Math.min(1, f.koT + dt * 1.6);
        const k = f.koT;
        f.card.position.set(f.base.x + f.kickDir * f.kick * 0.35 + jitter, f.base.y + bob - k * 1.2, f.base.z - f.kick * 0.2);
        f.card.rotation.set(-k * 1.1, 0, f.kickDir * (f.kick * 0.12 + k * 0.2));
        // tint: flash colour, then stun blue, frozen ice, KO dark
        let op = f.flash * 0.38, c = f.flashCol;
        if (f.stun > 0) { op = Math.max(op, 0.35 + Math.sin(t * 30) * 0.1); c = tmpCol.set('#3d7bff'); }
        else if (f.freeze > 0) { op = Math.max(op, 0.32); c = tmpCol.set('#bfefff'); }
        if (k > 0) { op = Math.max(op, k * 0.65); c = tmpCol.set('#000000'); }
        f.tintMat.opacity = op; f.tintMat.color.copy(c);
        // low HP: the column fades and the brackets turn red
        const low = f.hp < 0.3 ? 1 - f.hp / 0.3 : 0;
        f.brMat.color.copy(f.col).lerp(RED, low * (0.6 + 0.4 * Math.sin(t * 8))).multiplyScalar(2.2);
        f.beam.material.opacity = 0.22 * (0.4 + 0.6 * f.hp) * (1 - k);
        f.ring.rotation.z = t * 0.4 * (i ? -1 : 1);
      });
      for (const b of bolts) {
        if (!b.on) continue;
        b.t += dt;
        const u = Math.min(1, b.t / b.dur);
        centre(b.to, tmp);
        b.s.position.lerpVectors(b.from, tmp, u);
        if (u >= 1) { b.on = false; b.s.visible = false; if (b.onLand) { const f = b.onLand; b.onLand = null; f(); } }
      }
      shake = Math.max(0, shake - dt * 2.5);
      camera.position.copy(camPos);
      if (shake > 0 && !reduce) camera.position.add(tmp.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
      camera.lookAt(look);
      if (fx) fx.update(dt);
      composer.render();
    });
    const tmpCol = new THREE.Color(), RED = new THREE.Color('#ff4d5e');

    function dispose() {
      alive = false;
      renderer.setAnimationLoop(null);
      ro.disconnect(); io.disconnect();
      if (fx) fx.dispose();
      F.forEach(f => { if (f.tex) f.tex.dispose(); });
      keep.forEach(x => { try { x.dispose(); } catch (e) {} });
      composer.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    }

    return { shot, cast, react, aura, setLook, setHp, ko, revive, screen, dispose, info: () => ({ fx: fx ? fx.info() : null, bolts: bolts.filter(b => b.on).length }) };
  }

  return { mount };
})();
