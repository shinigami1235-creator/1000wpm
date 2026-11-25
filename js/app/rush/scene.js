// Boss Rush in three.js: one arena whose colours follow the boss's Breach chapter,
// lean copies of the five Breach bosses and Syntax Error built in the same holo and
// edge style and the combat layer's effects (js/app/combat/fx3d.js) aimed at them.
// The World Boss scene (boss3d.js) is left alone; this is a separate, smaller scene.
//
//   const s = RushScene.mount(host, { onImpact(h, x, y) })   returns at once and draws once three.js loads
//   s.setBoss(slot)          build the boss for a RushData.slot() and shift the arena to its colours
//   s.setFrac(f)  s.windup(ms)  s.windupEnd()  s.slam()  s.stun(ms)  s.setShield(f|null)  s.enrage(on)
//   s.setSign(text)          The Signboard's sign
//   s.gifts(ids, due)  s.giftGone(id)  s.packet(id, due)  s.returnShot(id)  s.packetHit(id)
//   s.speakers(on)  s.speakerOff(order)
//   s.sig(id, kind, due)  s.sigDone(id)  s.sigHit(id)  s.sigGone(id)   the signature move's objects
//                            (sign, page, byte, decoy, mute, popup); screen('sig:<id>') places their word
//   s.stage(n)               a new phase: the boss grows, glitches and moves faster
//   s.lunge()                a short lunge at you, for each signature attack
//   s.hit(h)                 a word's shot from your marker; onImpact(h, x, y) when it lands
//   s.cast(id, { hits, effect })  s.aura(name, on)  s.fxEvent(kind)  s.react(kind, power, extra)
//   s.hurt()  s.defeat()  s.screen(key, out)  s.pause(on)  s.info()  s.dispose()
window.RushScene = (() => {
  let libs = null;
  function load() {
    libs ||= Promise.all([
      import('three'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
    ]).catch(e => { libs = null; throw e; });
    return libs;
  }

  function mount(host, opts = {}) {
    let impl = null, gone = false;
    const pend = { slot: null, frac: 1, shield: null, sign: null };
    const call = (name, ...a) => (impl && impl[name] ? impl[name](...a) : undefined);
    const ctl = {
      ready: load().then(([THREE, EC, RP, UB, OP, SP, RB]) => {
        if (gone) return false;
        impl = build(host, { ...opts, RoundedBoxGeometry: RB.RoundedBoxGeometry }, THREE, EC.EffectComposer, RP.RenderPass, UB.UnrealBloomPass, OP.OutputPass, SP.ShaderPass);
        if (pend.slot) impl.setBoss(pend.slot, true);
        impl.setFrac(pend.frac);
        impl.setShield(pend.shield);
        if (pend.sign) impl.setSign(pend.sign);
        return true;
      }),
      setBoss: (s, instant) => { pend.slot = s; pend.frac = 1; pend.shield = null; pend.sign = null; call('setBoss', s, instant); },
      setFrac: f => { pend.frac = f; call('setFrac', f); },
      setShield: f => { pend.shield = f; call('setShield', f); },
      setSign: t => { pend.sign = t; call('setSign', t); },
      hit: h => { if (impl && impl.live()) impl.hit(h); else if (opts.onImpact) opts.onImpact(h, null, null); },
      screen: (k, out) => (impl ? impl.screen(k, out) : null),
      info: () => (impl ? impl.info() : null),
      dispose: () => { gone = true; if (impl) impl.dispose(); impl = null; },
    };
    for (const n of ['windup', 'windupEnd', 'slam', 'stun', 'enrage', 'gifts', 'giftGone', 'packet', 'returnShot', 'packetHit',
      'speakers', 'speakerOff', 'moveEnd', 'heat', 'cast', 'aura', 'fxEvent', 'react', 'hurt', 'defeat', 'pause',
      'sig', 'sigDone', 'sigHit', 'sigGone', 'stage', 'lunge']) ctl[n] = (...a) => call(n, ...a);
    return ctl;
  }

  function build(host, opts, THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass) {
    const V = THREE.Vector3;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let calmSet = true;
    try { const s = JSON.parse(localStorage.getItem('wpm-breach-settings') || '{}'); calmSet = s.reduceFlash !== false; } catch (e) {}
    const calm = reduce || calmSet;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const nowS = () => performance.now() / 1000;
    // GPU resources: the arena's stay until dispose, each boss's go when the next boss arrives
    const keep = [];
    let bucket = null;
    const own = x => ((bucket || keep).push(x), x);

    const flashes = [];
    function canFlash() {
      const t = performance.now();
      while (flashes.length && t - flashes[0] > 1000) flashes.shift();
      if (flashes.length >= (calm ? 2 : 3)) return false;
      flashes.push(t); return true;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.info.autoReset = false;      // info() reports the whole frame, every pass
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(Theme.hex('bg-0'));
    scene.fog = new THREE.Fog(Theme.hex('bg-0'), 22, 70);
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 200);

    // ---------- textures ----------
    function canvasTex(w, h, draw, srgb = true) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      draw(cv.getContext('2d'), w, h);
      const t = own(new THREE.CanvasTexture(cv));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    function textTex(text, { w = 512, h = 128, size = 64, col = '#ffffff', font = 'JetBrains Mono, monospace', frame = false } = {}) {
      return canvasTex(w, h, (c) => {
        c.clearRect(0, 0, w, h);
        if (frame) { c.strokeStyle = col; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12); }
        c.fillStyle = col; c.font = `700 ${size}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        let s = size;
        while (c.measureText(text).width > w - 24 && s > 12) { s -= 4; c.font = `700 ${s}px ${font}`; }
        c.fillText(text, w / 2, h / 2 + 2);
      });
    }
    const glowTex = canvasTex(128, 128, c => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    }, false);
    const codeTex = canvasTex(512, 512, c => {
      c.font = '20px monospace';
      const CH = '01{}[]<>/=+*#$abcdef';
      for (let x = 0; x < 512; x += 16) for (let y = 0; y < 512; y += 22) {
        if (Math.random() < 0.5) { c.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.9).toFixed(2)})`; c.fillText(CH[Math.floor(Math.random() * CH.length)], x, y); }
      }
    });
    codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping; codeTex.repeat.set(6, 3);
    const glyphTex = {};
    function glyph(ch) {
      if (!glyphTex[ch]) { const b = bucket; bucket = null; glyphTex[ch] = textTex(ch, { w: 64, h: 64, size: 52 }); bucket = b; }
      return glyphTex[ch];
    }

    // ---------- arena ----------
    const pal = { a: C(Theme.hex('accent')), b: C(Theme.hex('accent-dim')), bg: C(Theme.hex('bg-0')), fog: C(Theme.hex('bg-0')) };
    const palTo = { a: pal.a.clone(), b: pal.b.clone(), bg: pal.bg.clone(), fog: pal.fog.clone() };
    let palT = 1;
    const wallMat = own(new THREE.MeshBasicMaterial({ map: codeTex, color: pal.b.clone(), transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
    const wall = new THREE.Mesh(own(new THREE.PlaneGeometry(130, 52)), wallMat);
    wall.position.set(0, 18, -34); scene.add(wall);
    const grid = new THREE.GridHelper(120, 60, '#ffffff', '#ffffff');
    grid.material.transparent = true; grid.material.opacity = 0.3; grid.material.color = pal.b.clone();
    own(grid.geometry); own(grid.material); scene.add(grid);
    const ringMat = own(new THREE.MeshBasicMaterial({ color: pal.a.clone(), side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    for (const [a, b] of [[3.4, 3.52], [4.8, 4.86]]) {
      const m = new THREE.Mesh(own(new THREE.RingGeometry(a, b, 96)), ringMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; scene.add(m);
    }
    // pillars of data around the back of the arena
    const pilLine = own(new THREE.LineBasicMaterial({ color: pal.b.clone(), transparent: true, opacity: 0.8 }));
    const pilFill = own(new THREE.MeshBasicMaterial({ color: '#010402' }));
    const pilGeo = own(new THREE.BoxGeometry(1, 1, 1)), pilEdge = own(new THREE.EdgesGeometry(pilGeo));
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * (0.06 + 0.88 * i / 15), r = rnd(26, 34), hgt = rnd(4, 15), w = rnd(1.4, 2.6);
      const g = new THREE.Group(); g.position.set(-Math.cos(a) * r, hgt / 2, -Math.sin(a) * r * 0.6 - 8); g.scale.set(w, hgt, w);
      g.add(new THREE.Mesh(pilGeo, pilFill)); g.add(new THREE.LineSegments(pilEdge, pilLine));
      scene.add(g);
    }
    // your marker at the front of the arena, where shots and spells start
    const YOU = new V(0, 0.9, 8.6);
    const youMat = own(new THREE.MeshBasicMaterial({ color: C(Theme.hex('accent'), 1.6), transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    const youRing = new THREE.Mesh(own(new THREE.RingGeometry(0.55, 0.62, 48)), youMat); youRing.rotation.x = -Math.PI / 2; youRing.position.set(YOU.x, 0.03, YOU.z); scene.add(youRing);
    const youGem = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.22, 0)), youMat); youGem.position.copy(YOU); scene.add(youGem);

    // ---------- materials for the boss figures ----------
    const lineMats = [];   // every boss edge material, tinted red on a wind-up
    const L = (col, k = 1.6) => { const m = own(new THREE.LineBasicMaterial({ color: C(col, k), transparent: true, opacity: 1 })); m.userData.base = m.color.clone(); lineMats.push(m); return m; };
    const F = (col, k = 0.18) => own(new THREE.MeshBasicMaterial({ color: C(col, k), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    const DARK = own(new THREE.MeshBasicMaterial({ color: '#020a06' }));
    const glowM = (col, k = 2.5) => own(new THREE.MeshBasicMaterial({ color: C(col, k) }));
    const addM = (col, k, map) => own(new THREE.MeshBasicMaterial({ color: C(col, k), map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    function part(geo, col, parent, x = 0, y = 0, z = 0, k = 1.6) {
      own(geo);
      const g = new THREE.Group(); g.position.set(x, y, z);
      const inner = new THREE.Mesh(geo, DARK); inner.scale.setScalar(0.97); g.add(inner);
      g.add(new THREE.Mesh(geo, F(col)));
      g.add(new THREE.LineSegments(own(new THREE.EdgesGeometry(geo, 25)), L(col, k)));
      parent.add(g); return g;
    }

    // ---------- the bosses ----------
    // Each builder returns { root, P, core, scale, dome, anim(t, dt, s) }. Shapes follow
    // js/breach/render.js with fewer parts.
    const BUILD = {
      spam(b) {
        const root = new THREE.Group(), P = { segs: [] };
        const texts = ['FREE FOLLOWERS', 'clik here', 'u won!!', 'subscirbe', 'cheap views', 'DM me', 'gift card', 'follwo back'];
        for (let i = 0; i < 11; i++) {
          const s = new THREE.Group(), w = 1.9 - i * 0.08;
          part(new THREE.BoxGeometry(w, 0.95, 0.5), b.color2, s);
          const tx = new THREE.Mesh(own(new THREE.PlaneGeometry(w - 0.2, 0.6)), addM('#ffe6ff', 1, textTex(texts[i % texts.length], { w: 512, h: 150, size: 54, col: '#ffe6ff' })));
          tx.position.z = 0.27; s.add(tx);
          root.add(s); P.segs.push(s);
        }
        const head = P.segs[0]; head.scale.setScalar(1.5);
        const red = glowM('#ff4d5e', 3);
        for (const sx of [-1, 1]) { const e = new THREE.Mesh(own(new THREE.SphereGeometry(0.13, 12, 8)), red); e.position.set(sx * 0.5, 0.25, 0.3); head.add(e); }
        P.jaw = new THREE.Group(); P.jaw.position.set(0, -0.55, 0.2); head.add(P.jaw);
        for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(own(new THREE.ConeGeometry(0.08, 0.3, 4)), red); t.position.set(-0.6 + k * 0.24, 0, 0); t.rotation.x = Math.PI; P.jaw.add(t); }
        return {
          root, P, scale: 1.9, dome: [0, 2.6, 3.0], coreObj: head, coreOff: new V(0, 0, 0.4),
          anim(t, dt, s) {
            P.segs.forEach((g, i) => {
              const u = i / 10, sway = Math.sin(t * 2.2 - i * 0.55) * (0.4 + u * 1.4);
              g.position.set(sway, 0.7 + Math.pow(1 - u, 1.6) * 2.4 + Math.sin(t * 1.5 - i * 0.4) * 0.2 + (i === 0 ? s.wind * 0.35 : 0), -i * 0.8 + (i === 0 ? s.atk * 2 : 0));
              g.rotation.set(-0.2 * (1 - u) - (i === 0 ? s.wind * 0.6 : 0), Math.cos(t * 2.2 - i * 0.55) * 0.3, Math.sin(t * 2 - i) * 0.1);
            });
            P.jaw.rotation.x = s.wind * 0.8 + s.atk * 0.9 + (s.move ? Math.abs(Math.sin(t * 10)) * 0.4 : 0);
          },
        };
      },
      sign(b) {
        const root = new THREE.Group(), P = {};
        P.board = new THREE.Group(); P.board.position.y = 4.4; root.add(P.board);
        part(new THREE.BoxGeometry(7.4, 2.8, 0.4), b.color2, P.board, 0, 0, 0, 2);
        P.faceMat = addM('#ffffff', 1.2, null);
        P.face = new THREE.Mesh(own(new THREE.PlaneGeometry(6.8, 2.2)), P.faceMat); P.face.position.z = 0.22; P.board.add(P.face);
        P.setText = text => {
          if (P.text === text) return;
          P.text = text;
          if (P.faceMat.map) P.faceMat.map.dispose();
          P.faceMat.map = textTex(text, { w: 1024, h: 330, size: text.length > 9 ? 120 : 190, col: b.color2, font: 'Chakra Petch, sans-serif' });
          P.faceMat.needsUpdate = true;
        };
        P.setText('NODLES');
        for (let k = 0; k < 14; k++) { const bulb = new THREE.Mesh(own(new THREE.SphereGeometry(0.07, 8, 6)), glowM(k % 2 ? b.color2 : '#ffffff', 2.5)); bulb.position.set(-3.6 + k / 13 * 7.2, 1.48, 0.15); P.board.add(bulb); }
        P.legs = [];
        for (let k = 0; k < 4; k++) {
          const sx = k < 2 ? -1 : 1, sz = k % 2 ? -1 : 1;
          const hip = new THREE.Group(); hip.position.set(sx * 2.8, 3.2, sz * 0.4); root.add(hip);
          const up = part(new THREE.CylinderGeometry(0.14, 0.1, 2.2, 6), b.color, hip, sx * 0.6, 0.5); up.rotation.z = sx * -1.0;
          const knee = new THREE.Group(); knee.position.set(sx * 1.6, 1.1, 0); hip.add(knee);
          const lo = part(new THREE.CylinderGeometry(0.1, 0.03, 4.4, 6), b.color, knee, sx * 0.3, -2.2); lo.rotation.z = sx * 0.15;
          P.legs.push(hip);
        }
        P.eye = new THREE.Mesh(own(new THREE.SphereGeometry(0.3, 16, 10)), glowM('#ff4d5e', 3)); P.eye.position.set(0, 2.7, 0.3); root.add(P.eye);
        return {
          root, P, scale: 1.18, dome: [0, 4.2, 4.2], coreObj: P.board, coreOff: new V(0, 0, 0.5),
          anim(t, dt, s) {
            P.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 2.6 + i * 1.6) * 0.25; l.rotation.z = Math.sin(t * 2.6 + i * 1.6 + 1) * 0.08; });
            P.board.position.y = 4.4 + Math.sin(t * 5.2) * 0.12 + s.wind * 0.6 - s.atk * 2.2;
            P.board.rotation.x = -s.wind * 0.35 + s.atk * 0.6;
            P.eye.scale.setScalar(1 + s.wind * 1.5);
          },
        };
      },
      // the titans and Syntax Error: a BossKit body (js/app/bosskit.js) scaled to the arena,
      // with its own lights since the rest of the arena is lines and glow
      kit(b) {
        const root = new THREE.Group(), P = {};
        const k = BossKit.create({ ...THREE, RoundedBoxGeometry: opts.RoundedBoxGeometry }, b.kit, { glow: b.kit === 'syntax' ? null : b.color });
        root.add(k.group);
        const hemi = new THREE.HemisphereLight('#c8d2da', '#06080a', 0.55);
        const key = new THREE.DirectionalLight('#ffffff', 1.5); key.position.set(-6, 10, 9);
        const rim = new THREE.DirectionalLight(b.color, 2.2); rim.position.set(5, 7, -8);
        root.add(hemi, key, rim);
        if (bucket) bucket.push({ dispose: () => k.dispose && k.dispose() });
        const H = BossKit.BOSSES[b.kit].height;
        P.kit = k;
        let reel = 0;
        return {
          root, P, scale: 7.8 / H, dome: [0, H * 0.55, H * 0.42], coreObj: k.core, coreOff: new V(0, 0, 0),
          anim(t, dt, s) {
            reel += ((s.stun ? 0.55 : 0) - reel) * Math.min(1, dt * 6);
            const rl = Math.max(reel, s.reel || 0);
            const L = [];
            if (s.wind > 0.01) L.push(['windup', s.wind]);
            if (s.atk > 0.01) L.push([k.POSES.reach ? 'reach' : 'slam', s.atk]);
            if (s.move) L.push(['roar', 0.55 + 0.25 * Math.sin(t * 5)]);
            if (rl > 0.01) L.push(['reel', rl]);
            k.mix(L);
            k.update(t, dt);
          },
        };
      },
      announcer(b) {
        const root = new THREE.Group(), P = {};
        P.core = part(new THREE.IcosahedronGeometry(1.1, 1), b.color2, root, 0, 4.2);
        P.heart = new THREE.Mesh(own(new THREE.SphereGeometry(0.42, 16, 10)), glowM('#ff4d5e', 3)); P.heart.position.y = 4.2; root.add(P.heart);
        P.ring = new THREE.Group(); P.ring.position.y = 4.2; root.add(P.ring);
        P.ring.add(new THREE.Mesh(own(new THREE.TorusGeometry(2.4, 0.06, 8, 64)), glowM(b.color, 2)));
        P.cones = [];
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2;
          const cone = part(new THREE.CylinderGeometry(0.75, 0.25, 0.7, 16, 1, true), b.color, P.ring, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.2);
          cone.rotation.x = Math.PI / 2; cone.userData.on = true; P.cones.push(cone);
        }
        const tick = textTex('NXET STOP: NOWERE   DELAYD   MIND TEH GAP   ', { w: 2048, h: 128, size: 90, col: '#ff7a4d' });
        tick.wrapS = THREE.RepeatWrapping;
        P.ticker = new THREE.Mesh(own(new THREE.CylinderGeometry(1.7, 1.7, 0.45, 48, 1, true)), addM('#ffffff', 1.2, tick)); P.ticker.position.y = 5.8; root.add(P.ticker);
        P.waves = [];
        for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.03, 6, 64)), addM(b.color2, 2)); w.position.y = 4.2; w.visible = false; root.add(w); P.waves.push(w); }
        return {
          root, P, scale: 1.0, dome: [0, 4.2, 3.4], coreObj: P.heart, coreOff: new V(0, 0, 0.4),
          anim(t, dt, s) {
            P.ring.rotation.z = t * (0.6 + s.wind * 6);
            const pulse = 1 + Math.sin(t * 14) * 0.06 + s.wind * 0.25;
            P.cones.forEach(c => c.scale.setScalar(c.userData.on ? pulse : 0.55));
            P.core.rotation.set(t * 0.4, t * 0.7, 0);
            P.heart.scale.setScalar(1 + s.wind * 0.8 + Math.sin(t * 8) * 0.08);
            P.ticker.material.map.offset.x = -t * 0.08;
            root.position.y = Math.sin(t * 1.3) * 0.35 + 0.4;
            P.waves.forEach((w, i) => { const k = (t * 1.2 + i / 3) % 1; w.visible = s.wind > 0 || s.move; w.scale.setScalar(1 + k * 5); w.material.opacity = 1 - k; });
          },
        };
      },
      press(b) {
        const root = new THREE.Group(), P = {};
        for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.8, 8, 0.9), b.color, root, sx * 4, 4);
        part(new THREE.BoxGeometry(9, 0.9, 1.1), b.color, root, 0, 8.2);
        P.head = new THREE.Group(); P.head.position.y = 4.6; root.add(P.head);
        part(new THREE.BoxGeometry(6.6, 1.5, 1.6), b.color2, P.head, 0, 0, 0, 2.2);
        const caps = 'TYPOERROR';
        for (let k = 0; k < 9; k++) {
          const cap = part(new THREE.BoxGeometry(0.55, 0.45, 0.55), '#d9ffe9', P.head, -2.8 + k * 0.7, -1.05, 0.2, 1.4);
          const lt = new THREE.Mesh(own(new THREE.PlaneGeometry(0.4, 0.4)), addM('#ffffff', 1.5, glyph(caps[k]))); lt.position.z = 0.29; cap.add(lt);
        }
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16, 0.16, 3, 8)), glowM(b.color, 1.2)); p.position.set(sx * 2, 2.3, 0); P.head.add(p); }
        P.eyes = [];
        for (const sx of [-1, 1]) { const e = new THREE.Mesh(own(new THREE.BoxGeometry(0.9, 0.16, 0.05)), glowM('#ff4d5e', 3)); e.position.set(sx * 1.4, -0.1, 0.82); P.head.add(e); P.eyes.push(e); }
        part(new THREE.BoxGeometry(10, 0.5, 2.2), b.color, root, 0, 0.25);
        return {
          root, P, scale: 0.92, dome: [0, 4.4, 5.6], coreObj: P.head, coreOff: new V(0, 0, 0.9),
          anim(t, dt, s) {
            P.head.position.y = 4.6 + s.wind * 1.8 - s.atk * 3.4 + (s.stun ? -2 : 0) + Math.sin(t * 2) * 0.1;
            const hot = s.heat >= 2;
            P.eyes.forEach(e => { e.material.color.copy(C(hot ? '#f2c230' : '#ff4d5e', 2 + s.heat * 0.5)); e.scale.x = 1 + s.wind; });
          },
        };
      },
      correction(b) {
        const root = new THREE.Group(), P = {};
        P.slab = new THREE.Group(); P.slab.position.y = 4.4; root.add(P.slab);
        part(new THREE.BoxGeometry(5.6, 7.6, 0.7), b.color2, P.slab, 0, 0, 0, 1.8);
        const lines = ['stuck on canal road', 'water rising', 'canal -> coral', 'send help', 'fixword 9.0', 'autocorrect off', 'rollback', 'check your words'];
        for (let k = 0; k < 12; k++) {
          const cx = -1.9 + (k % 3) * 1.9, cy = 2.7 - Math.floor(k / 3) * 1.8;
          const tex = canvasTex(256, 200, (c, w, h) => {
            c.strokeStyle = k % 4 ? b.color : b.color2; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
            c.font = '18px JetBrains Mono, monospace';
            for (let i = 0; i < 4; i++) { c.fillStyle = i ? Theme.hex('ink') : (k % 4 ? b.color : b.color2); c.fillText(lines[(k + i * 3) % lines.length], 14, 40 + i * 40); }
          });
          const s = new THREE.Mesh(own(new THREE.PlaneGeometry(1.7, 1.5)), addM('#ffffff', 1, tex)); s.position.set(cx, cy, 0.37); P.slab.add(s);
        }
        P.eye = new THREE.Mesh(own(new THREE.BoxGeometry(3.6, 0.22, 0.1)), glowM('#ff4d5e', 3)); P.eye.position.set(0, 0.9, 0.45); P.slab.add(P.eye);
        P.rings = [];
        for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(own(new THREE.TorusGeometry(4.4 + k * 0.7, 0.04, 6, 96)), glowM(k === 1 ? b.color : b.color2, 2)); r.position.y = 4.4; r.rotation.order = 'YXZ'; root.add(r); P.rings.push(r); }
        P.cables = [];
        const redM = glowM('#ff4d5e', 3), cabM = glowM(b.color2, 1.4), sph = own(new THREE.SphereGeometry(0.16, 8, 6));
        for (let c = 0; c < 4; c++) {
          const chain = [];
          for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(sph, k % 3 === 0 ? redM : cabM); s.scale.setScalar(1.2 - k * 0.07); root.add(s); chain.push(s); }
          P.cables.push(chain);
        }
        return {
          root, P, scale: 0.95, dome: [0, 4.6, 5.2], coreObj: P.eye, coreOff: new V(0, 0, 0.3),
          anim(t, dt, s) {
            P.slab.position.y = 4.4 + Math.sin(t * 0.9) * 0.25;
            P.eye.scale.x = 1 + s.wind * 0.6;
            P.rings.forEach((r, i) => r.rotation.set(1.15 + i * 0.12 + Math.sin(t * 0.35 + i * 2) * 0.22, t * (0.3 + i * 0.2) + i * 2, 0));
            P.cables.forEach((chain, c) => {
              const sx = c < 2 ? -1 : 1, hi = c % 2;
              chain.forEach((s2, k) => {
                const u = k / 8, reach = s.wind * 1.5 + s.atk * 3;
                s2.position.set(sx * (2.9 + u * (2.5 + Math.sin(t * 1.4 + c + u * 3) * 0.8)), 6 - hi * 2.8 - u * 3 + Math.sin(t * 2 + c * 2 + u * 5) * 0.5, u * (1.5 + reach));
              });
            });
          },
        };
      },
      // a lean Syntax Error: a giant of glowing blocks around a core, as on the World Boss page
      syntax(b) {
        const root = new THREE.Group(), P = {};
        const blocks = [];
        const add = (x, y, z, s, alt) => blocks.push({ x, y, z, s, alt });
        for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; add(Math.cos(a) * 1.9, 4.6 + Math.sin(a) * 1.6, rnd(-0.6, 0.4), rnd(0.5, 0.8), i % 4 === 0); }
        for (let i = 0; i < 9; i++) add(rnd(-0.7, 0.7), 7.3 + rnd(-0.6, 0.6), rnd(-0.3, 0.3), rnd(0.45, 0.7), i === 4);
        for (const sx of [-1, 1]) {
          add(sx * 2.9, 5.9, 0, 0.9, false);
          for (let k = 0; k < 6; k++) add(sx * (3.3 + k * 0.38), 5.2 - k * 0.62, rnd(-0.2, 0.2), 0.6 - k * 0.04, k === 5);
        }
        for (let i = 0; i < 10; i++) add(rnd(-1.3, 1.3), 2.6 - i * 0.18, rnd(-0.4, 0.4), rnd(0.4, 0.7), false);
        const geo = own(new THREE.BoxGeometry(1, 1, 1)), edge = own(new THREE.EdgesGeometry(geo));
        const lA = L(b.color, 1.8), lC = L(b.color2, 2);
        P.blocks = blocks.map(o => {
          const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); g.scale.setScalar(o.s);
          g.add(new THREE.Mesh(geo, DARK)); g.add(new THREE.LineSegments(edge, o.alt ? lC : lA));
          g.userData = { ...o, ph: rnd(0, 6) }; root.add(g); return g;
        });
        P.core = new THREE.Mesh(own(new THREE.IcosahedronGeometry(0.9, 1)), glowM(Theme.hex('accent'), 1.4)); P.core.position.set(0, 4.6, 0.2); root.add(P.core);
        P.eyes = [];
        for (const sx of [-1, 1]) { const e = new THREE.Mesh(own(new THREE.BoxGeometry(0.34, 0.12, 0.05)), glowM('#ff4d5e', 3)); e.position.set(sx * 0.32, 7.35, 0.42); root.add(e); P.eyes.push(e); }
        return {
          root, P, scale: 1.05, dome: [0, 4.8, 4.6], coreObj: P.core, coreOff: new V(0, 0, 0.6),
          anim(t, dt, s) {
            P.blocks.forEach(g => { const u = g.userData; g.position.set(u.x + Math.sin(t * 1.3 + u.ph) * 0.06, u.y + Math.sin(t * 1.7 + u.ph) * 0.08 + s.wind * (u.y > 5 ? 0.4 : 0), u.z - s.atk * 1.2 * (u.y > 4 ? 1 : 0)); g.rotation.set(t * 0.2 + u.ph, t * 0.3, 0); });
            P.core.rotation.set(t * 0.6, t * 0.9, 0);
            P.core.material.color.copy(C(s.wind > 0 ? '#ff4d5e' : s.stun ? '#3ee6ff' : Theme.hex('accent'), 1.3 + s.wind));
            P.eyes.forEach(e => e.scale.x = 1 + s.wind * 1.5);
          },
        };
      },
    };

    // the parts every boss shares: shield dome, charge orb, stun halo
    const domeGeo = own(new THREE.IcosahedronGeometry(1, 2));
    const domeFill = own(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 0.18), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    const domeLine = own(new THREE.LineBasicMaterial({ color: C('#3ee6ff', 1.2), transparent: true, opacity: 0.8 }));
    const dome = new THREE.Group(); dome.add(new THREE.Mesh(domeGeo, domeFill)); dome.add(new THREE.LineSegments(own(new THREE.EdgesGeometry(domeGeo, 1)), domeLine)); dome.visible = false; scene.add(dome);
    const charge = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: C('#ff4d5e', 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    charge.visible = false; scene.add(charge);
    const halo = new THREE.Group(); scene.add(halo); halo.visible = false;
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glyph('?!#*?!%&'[k]), color: C(Theme.hex('accent'), 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      s.scale.setScalar(0.55); halo.add(s);
    }

    // gifts and packets flying at you
    const boxGeo = own(new THREE.BoxGeometry(0.8, 0.8, 0.8)), boxEdge = own(new THREE.EdgesGeometry(boxGeo));
    const giftLine = own(new THREE.LineBasicMaterial({ color: C('#a35bff', 2) })), pktLine = own(new THREE.LineBasicMaterial({ color: C('#3ee6ff', 2.2) }));
    const badLine = own(new THREE.LineBasicMaterial({ color: C('#ff4d5e', 2.4) }));
    const pool = Array.from({ length: 8 }, () => {
      const g = new THREE.Group(); g.add(new THREE.Mesh(boxGeo, DARK)); const e = new THREE.LineSegments(boxEdge, giftLine); g.add(e);
      g.visible = false; scene.add(g);
      return { g, e, id: '', kind: '', from: new V(), to: new V(), t0: 0, t1: 0, back: -1, pos: new V() };
    });
    const flyer = id => pool.find(p => p.id === id);
    function launch(id, kind, due, slotI) {
      const p = pool.find(x => !x.id) || pool[0];
      p.id = id; p.kind = kind; p.back = -1;
      p.e.material = kind === 'packet' ? pktLine : kind === 'decoy' ? badLine : giftLine;
      coreWorld(p.from);
      if (kind === 'gift') p.to.set((slotI - 1) * 3.2, 2.2 + (slotI === 1 ? 0.8 : 0), 5.4);
      else if (kind === 'decoy') p.to.copy(YOU).add(v1.set(rnd(-2.2, 2.2), rnd(0.2, 1.6), -0.8));
      else p.to.copy(YOU).add(v1.set(rnd(-1.4, 1.4), rnd(0.4, 1.4), -0.6));
      p.t0 = nowS(); p.t1 = p.t0 + Math.max(0.6, (due - performance.now()) / 1000);
      p.g.visible = true; p.g.scale.setScalar(kind === 'packet' || kind === 'decoy' ? 0.55 : 0.8);
    }
    function drop(id) { const p = flyer(id); if (p) { p.id = ''; p.g.visible = false; } }

    // tier-0 bolts: a few pooled glow sprites
    const bolts = Array.from({ length: 10 }, () => {
      const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: C(Theme.hex('accent'), 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      s.visible = false; s.scale.setScalar(0.7); scene.add(s);
      return { s, on: false, t: 0, from: new V(), h: null };
    });
    let boltI = 0;

    // ---------- the signature moves ----------
    // Falling signs, pages sliding along the floor, packets and lit speakers. The word on each
    // is a tag the page places with screen('sig:<id>'). Materials and shapes are shared, so a
    // new one builds no shader.
    const sigObj = new Map();
    const signGeo = own(new THREE.BoxGeometry(2.6, 1.15, 0.2)), signEdge = own(new THREE.EdgesGeometry(signGeo));
    const signLine = own(new THREE.LineBasicMaterial({ color: C('#ffb347', 2.4) }));
    const signFace = own(new THREE.MeshBasicMaterial({ color: C('#ff5f9e', 0.35), transparent: true, opacity: 0.8 }));
    const shadowGeo = own(new THREE.CircleGeometry(1.5, 32)), faceGeo = own(new THREE.PlaneGeometry(2.3, 0.85));
    const shadowMat = own(new THREE.MeshBasicMaterial({ color: '#ff4d5e', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    const pageGeo = own(new THREE.PlaneGeometry(1.6, 1.1));
    const pageMat = own(new THREE.MeshBasicMaterial({ color: C('#e9ffe0', 1.1), side: THREE.DoubleSide, transparent: true, opacity: 0.95,
      map: canvasTex(256, 176, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#1b2a22'; for (let i = 0; i < 6; i++) c.fillRect(20, 22 + i * 24, i % 3 === 2 ? 120 : 214, 9); }) }));
    const pageEdge = own(new THREE.LineBasicMaterial({ color: C('#c8ff3d', 2.2) })), pageEdgeGeo = own(new THREE.EdgesGeometry(pageGeo));
    let stageN = 1, coneNext = 0;
    // hidden copies of each new shape, so the shader warm-up before the first frame covers them
    { const w = new THREE.Group(); w.visible = false;
      w.add(new THREE.Mesh(signGeo, DARK), new THREE.LineSegments(signEdge, signLine), new THREE.Mesh(faceGeo, signFace), new THREE.Mesh(shadowGeo, shadowMat),
        new THREE.Mesh(pageGeo, pageMat), new THREE.LineSegments(pageEdgeGeo, pageEdge), new THREE.LineSegments(boxEdge, badLine));
      scene.add(w); }
    function sigAdd(id, kind, due) {
      const t0 = nowS(), t1 = t0 + Math.max(0.6, ((due || performance.now()) - performance.now()) / 1000);
      if (kind === 'byte' || kind === 'decoy') { launch(id, kind === 'byte' ? 'packet' : 'decoy', due, 0); sigObj.set(id, { kind, t0, t1 }); return; }
      if (kind === 'mute') {
        const cones = fig && fig.P.cones;
        let k = -1;
        if (cones) for (let n = 0; n < cones.length; n++) { const i = (coneNext + n) % cones.length; if (!cones[i].userData.on) { k = i; break; } }
        if (k >= 0) { cones[k].userData.on = true; coneNext = k + 1; }
        sigObj.set(id, { kind, cone: k, t0, t1 });
        return;
      }
      if (kind === 'popup') { sigObj.set(id, { kind, t0, t1 }); return; }
      const g = new THREE.Group(), o = { kind, g, t0, t1, from: new V(), to: new V(), pop: -1 };
      if (kind === 'sign') {
        g.add(new THREE.Mesh(signGeo, DARK)); g.add(new THREE.LineSegments(signEdge, signLine));
        const face = new THREE.Mesh(faceGeo, signFace); face.position.z = 0.11; g.add(face);
        o.to.set(rnd(-2.6, 2.6), 1.2, YOU.z - rnd(1.2, 2.4));
        o.from.set(o.to.x * 1.4 + rnd(-1, 1), 13, o.to.z - 4);
        o.shadow = new THREE.Mesh(shadowGeo, shadowMat); o.shadow.rotation.x = -Math.PI / 2; o.shadow.position.set(o.to.x, 0.04, o.to.z); scene.add(o.shadow);
      } else {
        g.add(new THREE.Mesh(pageGeo, pageMat)); g.add(new THREE.LineSegments(pageEdgeGeo, pageEdge));
        coreWorld(o.from); o.from.x += rnd(-2.6, 2.6); o.from.y = 1; o.from.z += 1;
        o.to.set(rnd(-2.4, 2.4), 0.6, YOU.z - 0.6);
      }
      g.position.copy(o.from); scene.add(g);
      sigObj.set(id, o);
    }
    function sigRemove(id, how) {
      const o = sigObj.get(id); if (!o) return;
      if (o.kind === 'byte' || o.kind === 'decoy') {
        if (how === 'done' && o.kind === 'byte') { const p = flyer(id); if (p) { p.pos.copy(p.g.position); p.back = 0; } }
        else drop(id);
        sigObj.delete(id); return;
      }
      if (o.kind === 'mute') { const c = fig && fig.P.cones && fig.P.cones[o.cone]; if (c) c.userData.on = false; sigObj.delete(id); return; }
      if (!o.g) { sigObj.delete(id); return; }
      if (how === 'done') { o.pop = 0; return; }   // bursts, then goes in the loop
      sigFree(id, o);
    }
    function sigFree(id, o) { scene.remove(o.g); if (o.shadow) scene.remove(o.shadow); sigObj.delete(id); }
    function sigClear() { for (const [id, o] of [...sigObj]) { if (o.g) sigFree(id, o); else if (o.kind === 'mute') sigRemove(id); else sigObj.delete(id); } }
    function drawSigs(t, dt) {
      for (const [id, o] of sigObj) {
        if (!o.g) continue;
        if (o.pop >= 0) {
          o.pop += dt / 0.22;
          o.g.scale.setScalar(1 + o.pop * 0.8);
          o.g.children.forEach(c => { if (c.material && c.material.opacity !== undefined) c.visible = Math.random() > o.pop; });
          if (o.shadow) o.shadow.visible = false;
          if (o.pop >= 1) sigFree(id, o);
          continue;
        }
        const k = clamp((t - o.t0) / (o.t1 - o.t0), 0, 1);
        if (o.kind === 'sign') {
          // drops into view, hangs swaying while it creeps lower, then falls the last stretch
          const y = k < 0.12 ? 12 - (k / 0.12) * 5.6 : k < 0.72 ? 6.4 - (k - 0.12) / 0.6 * 1.8 : 4.6 - Math.pow((k - 0.72) / 0.28, 2) * 3.4;
          o.g.position.set(o.from.x + (o.to.x - o.from.x) * k, y, o.from.z + (o.to.z - o.from.z) * k);
          o.g.rotation.set(Math.sin(t * 3 + o.to.x) * 0.15 * (1 - k), Math.sin(t * 2) * 0.2, Math.sin(t * 2.5 + o.to.z) * 0.12);
          o.shadow.scale.setScalar(0.3 + 0.9 * k);
          shadowMat.opacity = 0.18 + 0.4 * k;
        } else {
          o.g.position.lerpVectors(o.from, o.to, k);
          o.g.position.y = 0.35 + Math.abs(Math.sin(t * 7 + o.to.x)) * 0.25;
          o.g.rotation.set(-0.9 + Math.sin(t * 6 + o.to.x) * 0.25, Math.sin(t * 2) * 0.3, Math.sin(t * 5) * 0.1);
        }
      }
    }

    // ---------- post: bloom in WebGL; tint, dim, vignette and glitch in a CSS layer over the canvas ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), calm ? 0.5 : 0.6, 0.35, 0.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const vfx = document.createElement('div');
    vfx.className = 'rush-vfx'; vfx.setAttribute('aria-hidden', 'true');
    renderer.domElement.after(vfx);
    let tintHex = '#ff4d5e', vfxKey = '';
    function paintVfx(tint, dim, glitch) {
      const key = tint.toFixed(2) + dim.toFixed(2) + (glitch > 0.05 ? 1 : 0) + tintHex;
      if (key === vfxKey) return;
      vfxKey = key;
      vfx.style.setProperty('--tint', tintHex);
      vfx.style.setProperty('--ta', tint.toFixed(2));
      vfx.style.setProperty('--dim', dim.toFixed(2));
      renderer.domElement.classList.toggle('glitch', glitch > 0.05);
    }

    // ---------- combat effects ----------
    let shake = 0, stopUntil = 0, glitchK = 0, glitchUntil = 0, dimK = 0, dimUntil = 0, tintAmt = 0;
    const fx = window.Combat && Combat.FX ? Combat.FX.create(THREE, scene, camera, {
      glowTex, calm, reduce,
      pixelHeight: () => renderer.domElement.height,
      juice: {
        shake: k => { shake = Math.max(shake, k); },
        stop: ms => { stopUntil = Math.max(stopUntil, performance.now() + ms); },
        glitch: (k, secs) => { glitchK = Math.max(glitchK, k); glitchUntil = Math.max(glitchUntil, nowS() + secs); },
        dim: (k, secs) => { dimK = k; dimUntil = nowS() + secs; },
        tint: (hex, k) => { tintHex = hex; tintAmt = Math.max(tintAmt, (calm ? 0.6 : 1) * k); },
        canFlash,
      },
    }) : null;
    const v1 = new V(), v2 = new V(), v3 = new V(), c1 = new THREE.Color();
    const caster = { pos: out => out.copy(YOU) };
    function coreWorld(out) {
      if (!fig) return out.set(0, 4.5, 0);
      fig.coreObj.getWorldPosition(out);
      return out.add(v3.copy(fig.coreOff).multiplyScalar(fig.scale));
    }
    const target = {
      size: 5,
      pos: out => coreWorld(out),
      top: out => { coreWorld(out); out.y += 2.6; return out; },
      base: out => out.set(fig ? fig.root.position.x : 0, 0, (fig ? fig.root.position.z : 0) + 1),
      react: (k, p, x) => react(k, p, x),
    };

    // ---------- camera ----------
    const camLook = new V(0, 4.3, 0);
    const camBase = new V(0, 4.4, 14);
    function fit() {
      const w = host.clientWidth || 600, h = host.clientHeight || 400;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      const half = THREE.MathUtils.degToRad(camera.fov / 2);
      // keep the boss's height on wide screens and the gifts' spread on narrow ones
      const dist = Math.max(13.5, 6.2 / (Math.tan(half) * camera.aspect) + 5);
      camBase.set(0, 4.4, dist);
      camera.position.copy(camBase);
      camera.lookAt(camLook);
      camera.updateProjectionMatrix();
      YOU.set(0, 1.1, Math.min(9, dist - 5.5));
      youRing.position.set(0, 0.03, YOU.z); youGem.position.copy(YOU);
    }
    const ro = new ResizeObserver(fit); ro.observe(host);
    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(host);
    fit();

    // ---------- the boss on stage ----------
    let fig = null, old = null, slotNow = null, frac = 1, shieldF = null;
    let windAt = 0, windMs = 0, windOn = false, atkT = 0, stunUntil = 0, freezeUntil = 0, flash = 0, recoil = 0, recoilV = 0;
    // jolt: a short reel from your hits; reelAt: the big reel when you block or stagger it
    let jolt = 0, reelAt = -9;
    let introT = 1, dying = -1, enraged = false, moveOn = false, paused = false, heat = 0;
    function setBoss(s, instant) {
      slotNow = s;
      const b = s.boss;
      palTo.a.set(b.color); palTo.b.set(b.color).multiplyScalar(0.5); palTo.bg.set(b.base); palTo.fog.set(b.fog);
      palTo.b.lerp(new THREE.Color(b.color2), 0.35);
      palT = instant ? 1 : 0;
      if (instant) applyPal(1);
      if (fig) { old = fig; old.goneAt = nowS(); }
      // drop the line materials of the old boss from the tint list once it is gone
      lineMats.length = 0;
      bucket = [];
      fig = BUILD[b.art](b);
      fig.res = bucket; bucket = null;
      fig.root.scale.setScalar(0.01);
      scene.add(fig.root);
      if (s.mark > 1) fig.root.position.z = -0.5;
      introT = 0; dying = -1; enraged = false; windOn = false; frac = 1; shieldF = null; heat = 0; moveOn = false;
      stageN = 1; sigClear(); coneNext = 0;
      if (fig.P.cones) fig.P.cones.forEach(c => { c.userData.on = false; });
      charge.visible = false; halo.visible = false; dome.visible = false;
      pool.forEach(p => { p.id = ''; p.g.visible = false; });
      if (fx) fx.clear();
      glitchK = Math.max(glitchK, 0.8); glitchUntil = nowS() + 0.6;
    }
    function disposeFig(f) {
      scene.remove(f.root);
      f.res.forEach(d => d.dispose && d.dispose());
      if (f.P.faceMat && f.P.faceMat.map) f.P.faceMat.map.dispose();
    }
    function applyPal(k) {
      pal.a.lerp(palTo.a, k); pal.b.lerp(palTo.b, k); pal.bg.lerp(palTo.bg, k); pal.fog.lerp(palTo.fog, k);
      scene.background.copy(pal.bg); scene.fog.color.copy(pal.fog);
      grid.material.color.copy(pal.b); ringMat.color.copy(pal.a); wallMat.color.copy(pal.b); pilLine.color.copy(pal.b);
    }

    // ---------- reactions ----------
    function react(kind, power = 0, extra) {
      if (!fig || dying >= 0) return;
      if (kind === 'flinch') {
        recoilV -= Math.min(1.3, 0.3 + power * 0.012); flash = Math.max(flash, calm ? 0.25 : 0.4);
        jolt = Math.min(0.85, jolt + Math.min(0.45, 0.12 + power * 0.008));
      } else if (kind === 'stagger') {
        // a block breaks the attack off: the wind-up drops, it's thrown back and reels
        windOn = false; atkT = 0; reelAt = nowS(); jolt = 0;
        recoilV -= 2.4; shake = Math.max(shake, 0.6); stopUntil = Math.max(stopUntil, performance.now() + 110);
        if (canFlash()) flash = calm ? 0.5 : 1;
      } else if (kind === 'flash') { recoilV -= 0.35; if (canFlash()) flash = calm ? 0.5 : 1; }
      else if (kind === 'break') { recoilV -= 2.4; shake = Math.max(shake, 0.9); if (canFlash()) flash = 1; }
      else if (kind === 'stun') stunUntil = Math.max(stunUntil, nowS() + power / 1000);
      else if (kind === 'freeze') freezeUntil = nowS() + power / 1000;
      else if (kind === 'pull') recoilV += 0.4;
    }
    function hit(h) {
      if (!fig || dying >= 0) { if (opts.onImpact) opts.onImpact(h, null, null); return; }
      const from = v2.copy(YOU).add(v1.set(rnd(-0.3, 0.3), 0.2, 0));
      const land = at => {
        react('flinch', h.amount / 10);
        if (h.crit || h.tier >= 3) shake = Math.max(shake, 0.25 + h.tier * 0.05);
        if (opts.onImpact) { v3.copy(at).project(camera); opts.onImpact(h, (v3.x * 0.5 + 0.5) * host.clientWidth, (-v3.y * 0.5 + 0.5) * host.clientHeight); }
      };
      if (fx && h.tier >= 1) {
        const off = new V(rnd(-0.8, 0.8), rnd(-0.6, 0.8), 0);
        fx.shot(Math.min(4, h.tier), from.clone(), out => coreWorld(out).add(off), land, { color: h.color });
        return;
      }
      const b = bolts[boltI = (boltI + 1) % bolts.length];
      b.on = true; b.t = 0; b.h = h; b.land = land; b.from.copy(from); b.s.visible = true;
      b.s.material.color.copy(C(h.kind === 'weak' ? '#ffc46b' : Theme.hex('accent'), 2.2));
    }

    // ---------- loop ----------
    let at = 0, last = nowS();
    const pose = { wind: 0, atk: 0, stun: false, move: false, heat: 0 };
    let frames = 0;
    // compile every shader now, hidden pooled effects included, so the first hit, spell or status
    // effect in a fight doesn't stall a frame while its shader compiles
    try { renderer.compile(scene, camera); if (renderer.initTexture) renderer.initTexture(pageMat.map); } catch (e) {}
    renderer.setAnimationLoop(() => {
      const t = nowS();
      let dt = Math.min(0.05, t - last); last = t;
      if (paused) dt = 0;
      if (!visible || document.hidden) return;
      frames++;
      renderer.info.reset();
      const adt = performance.now() < stopUntil ? dt * 0.1 : dt;
      const iced = t < freezeUntil, stunned = t < stunUntil;
      at += adt * (stunned ? 0.15 : iced ? 0.3 : 1);
      if (palT < 1) { palT = Math.min(1, palT + dt / 1.2); applyPal(Math.min(1, dt * 3)); }
      codeTex.offset.y -= adt * (enraged ? 0.12 : 0.05) * (reduce ? 0.3 : 1);
      youGem.rotation.y += adt * 1.5;

      if (old) {
        const k = (t - old.goneAt) / 1.1;
        if (k >= 1) { disposeFig(old); old = null; }
        else { old.root.scale.set(old.scale * (1 + k * 0.3), old.scale * Math.max(0.02, 1 - k), old.scale * (1 + k * 0.3)); old.root.visible = Math.random() > k * 0.6; }
      }
      if (fig) {
        if (introT < 1) introT = Math.min(1, introT + dt / 0.9);
        let s = fig.scale * ease(introT);
        if (dying >= 0) {
          dying += dt;
          const k = Math.min(1, dying / 1.3);
          fig.root.visible = Math.random() > k * 0.5;
          fig.root.scale.set(fig.scale * (1 + k * 0.25), fig.scale * Math.max(0.02, 1 - k * k), fig.scale * (1 + k * 0.25));
        } else fig.root.scale.setScalar(Math.max(0.01, s * (1 + 0.07 * (stageN - 1))));
        // wind-up builds over its length, the slam lunges forward
        const wk = windOn ? clamp((performance.now() - windAt) / Math.max(1, windMs), 0, 1) : 0;
        pose.wind += (wk - pose.wind) * Math.min(1, dt * 8);
        atkT = Math.max(0, atkT - adt * 1.8);
        pose.atk = Math.sin(Math.min(1, atkT) * Math.PI) * (atkT > 0 ? 1 : 0);
        pose.stun = stunned; pose.move = moveOn; pose.heat = heat;
        const rk = t - reelAt;
        jolt = Math.max(0, jolt - adt * 2.6);
        pose.reel = Math.max(rk < 1.1 ? Math.sin(Math.min(1, rk / 1.1) * Math.PI) * 0.9 : 0, jolt) * (reduce ? 0.4 : 1);
        if (dying < 0) fig.anim(at, adt, pose);
        recoilV += (-recoil * 40 - recoilV * 9) * adt; recoil += recoilV * adt; recoil = clamp(recoil, -1.1, 0.4);
        fig.root.position.z = (slotNow && slotNow.mark > 1 ? -0.5 : 0) + recoil;
        // pushed back, it leans back with it (every boss, kit-built or not)
        fig.root.rotation.x = dying < 0 ? recoil * 0.3 - pose.reel * 0.12 : 0;
        // the boss never stands still: it sways across the arena, faster each phase
        const drift = reduce ? 0 : Math.sin(at * (0.45 + 0.22 * (stageN - 1))) * (1.1 + 0.4 * (stageN - 1)) * (stunned ? 0.2 : 1);
        fig.root.position.x = drift + (enraged && !calm ? Math.sin(t * 31) * 0.04 : 0);
        // edges: red through a wind-up, blue while frozen, brighter on a hit
        flash = Math.max(0, flash - dt * 3.5);
        for (const m of lineMats) {
          m.color.copy(m.userData.base);
          if (pose.wind > 0.01) m.color.lerp(c1.setRGB(3, 0.45, 0.55), pose.wind * (calm ? 0.7 : 0.6 + 0.4 * Math.abs(Math.sin(t * 6))));
          if (iced) m.color.lerp(c1.setRGB(1.6, 2.4, 3), 0.5);
          if (stunned) m.color.multiplyScalar(0.6);
          if (flash) m.color.multiplyScalar(1 + flash * 0.8);
          if (enraged) m.color.lerp(c1.setRGB(2.6, 0.5, 0.5), 0.25);
          else if (stageN === 3) m.color.lerp(c1.setRGB(2.4, 0.7, 0.5), 0.15 + 0.1 * Math.sin(t * 5));
        }
        // shared parts
        coreWorld(v2);
        charge.visible = pose.wind > 0.02 && dying < 0;
        if (charge.visible) { charge.position.copy(v2).add(v1.set(0, 0, 1)); charge.scale.setScalar(0.6 + pose.wind * 3.2 + (calm ? 0 : Math.sin(t * 40) * 0.2)); }
        halo.visible = stunned && dying < 0;
        if (halo.visible) halo.children.forEach((sp, i) => { const a = t * 2.5 + i / 8 * Math.PI * 2; sp.position.set(v2.x + Math.cos(a) * 2.4, v2.y + 2.4 + Math.sin(a * 2) * 0.2, v2.z + Math.sin(a) * 2.4); });
        dome.visible = shieldF !== null && dying < 0;
        if (dome.visible) {
          const [dx, dy, dr] = fig.dome;
          dome.position.set(dx, dy * fig.scale, fig.root.position.z);
          dome.scale.setScalar(dr * fig.scale * (1 + Math.sin(t * 6) * 0.015)); dome.rotation.y = t * 0.3;
          domeFill.opacity = 0.25 + 0.35 * shieldF;
        }
      }
      // gifts drift toward you, packets fly at you or back at the boss
      for (const p of pool) {
        if (!p.id) continue;
        if (p.back >= 0) {
          p.back += dt / 0.4;
          coreWorld(v1);
          p.g.position.lerpVectors(p.pos, v1, Math.min(1, p.back));
          if (p.back >= 1) { p.id = ''; p.g.visible = false; react('flinch', 30); }
          continue;
        }
        const k = clamp((t - p.t0) / (p.t1 - p.t0), 0, 1);
        if (p.kind === 'gift') p.pos.lerpVectors(p.from, p.to, ease(Math.min(1, k * 3))).add(v1.set(0, Math.sin(t * 3 + p.to.x) * 0.15, k * 1.6));
        else { p.pos.lerpVectors(p.from, p.to, k); p.pos.y += Math.sin(k * Math.PI) * 1.2; }
        p.g.position.copy(p.pos);
        p.g.rotation.set(t * 1.3, t * 1.7, 0);
      }
      for (const b of bolts) {
        if (!b.on) continue;
        b.t += adt / 0.16;
        coreWorld(v1);
        b.s.position.lerpVectors(b.from, v1, Math.min(1, b.t));
        if (b.t >= 1) { b.on = false; b.s.visible = false; b.land(v1.clone()); }
      }
      drawSigs(t, dt);
      if (fx) fx.update(adt);
      // camera shake and post
      shake = Math.max(0, shake - dt * 2.2);
      const sk = shake * (reduce ? 0.12 : calm ? 0.55 : 1) * 0.5;
      camera.position.set(camBase.x + (Math.random() - 0.5) * sk, camBase.y + (Math.random() - 0.5) * sk, camBase.z);
      camera.lookAt(camLook);
      tintAmt = Math.max(0, tintAmt - dt * 1.6);
      if (t >= glitchUntil) glitchK = 0;
      const dimNow = t < dimUntil ? dimK : 0;
      paintVfx(tintAmt, dimNow, glitchK * (calm ? 0.5 : 1));
      composer.render();
    });

    // ---------- controls ----------
    function screen(key, out) {
      if (key === 'core') coreWorld(v1);
      else if (key === 'top') { coreWorld(v1); v1.y += 3.2; }
      else if (key === 'you') v1.copy(YOU);
      else if (key.startsWith('sig:')) {
        const id = key.slice(4), o = sigObj.get(id);
        if (!o) return null;
        if (o.kind === 'byte' || o.kind === 'decoy') { const p = flyer(id); if (!p) return null; v1.copy(p.g.position); v1.y += 0.9; }
        else if (o.kind === 'mute') { const c = fig && fig.P.cones && fig.P.cones[o.cone]; if (!c) { coreWorld(v1); v1.y -= 2; } else { c.getWorldPosition(v1); v1.y -= 1.1; } }
        else if (o.g) { v1.copy(o.g.position); v1.y += o.kind === 'sign' ? 1.1 : 0.7; }
        else return null;
      } else { const p = flyer(key); if (!p) return null; v1.copy(p.g.position); }
      v1.project(camera);
      if (v1.z > 1) return null;
      out.x = (v1.x * 0.5 + 0.5) * host.clientWidth; out.y = (-v1.y * 0.5 + 0.5) * host.clientHeight;
      return out;
    }
    function dispose() {
      renderer.setAnimationLoop(null);
      if (fx) fx.dispose();
      ro.disconnect(); io.disconnect();
      if (old) disposeFig(old);
      if (fig) disposeFig(fig);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
      keep.forEach(d => d.dispose && d.dispose());
      bloom.dispose();
      if (composer.dispose) composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      vfx.remove();
    }

    return {
      live: () => visible && !document.hidden,
      setBoss,
      setFrac: f => { frac = f; },
      windup: ms => { windOn = true; windAt = performance.now(); windMs = ms; },
      windupEnd: () => { windOn = false; },
      slam: () => { windOn = false; atkT = 1; shake = Math.max(shake, 0.8); tintAmt = Math.max(tintAmt, calm ? 0.5 : 0.8); tintHex = '#ff4d5e'; },
      stun: ms => { stunUntil = nowS() + ms / 1000; windOn = false; },
      enrage: on => { enraged = !!on; if (on) { glitchK = 0.6; glitchUntil = nowS() + 0.5; } },
      setShield: f => { shieldF = f; },
      setSign: text => { if (fig && fig.P.setText) fig.P.setText(text || 'NODLES'); },
      gifts: (ids, due) => { moveOn = true; ids.forEach((id, i) => launch(id, 'gift', due, i)); },
      giftGone: id => { const p = flyer(id); if (p) { p.pos.copy(p.g.position); p.back = 0; } },
      packet: (id, due) => launch(id, 'packet', due, 0),
      returnShot: id => { const p = flyer(id); if (p) { p.pos.copy(p.g.position); p.back = 0; } },
      packetHit: id => { drop(id); shake = Math.max(shake, 0.3); },
      speakers: on => { moveOn = !!on; if (fig && fig.P.cones) fig.P.cones.forEach(c => { c.userData.on = true; }); },
      speakerOff: order => { if (fig && fig.P.cones && fig.P.cones[order - 1]) fig.P.cones[order - 1].userData.on = false; },
      moveEnd: () => { moveOn = false; pool.forEach(p => { if (p.kind === 'gift') drop(p.id); }); },
      hit,
      cast: (id, c = {}) => { if (fx && fig && dying < 0) fx.cast(id, { caster, target, hits: c.hits, effect: c.effect }); },
      aura: (name, on) => { if (fx) fx.aura(name, on, { caster, target }); },
      fxEvent: k => { if (fx) fx.event(k, { caster }); },
      react,
      heat: n => { heat = n; },
      hurt: () => { shake = Math.max(shake, 0.6); tintAmt = Math.max(tintAmt, calm ? 0.45 : 0.75); tintHex = '#ff4d5e'; },
      defeat: () => {
        if (!fig) return;
        if (fx) fx.cast('neon-nova', { caster, target, hits: [], effect: {} });
        dying = 0; windOn = false; shake = Math.max(shake, 1); glitchK = 1; glitchUntil = nowS() + 0.8;
        pool.forEach(p => { p.id = ''; p.g.visible = false; });
        sigClear();
      },
      pause: on => { paused = !!on; },
      sig: (id, kind, due) => { sigAdd(id, kind, due); atkT = Math.max(atkT, 0.5); },
      sigDone: id => sigRemove(id, 'done'),
      sigHit: id => { sigRemove(id, 'hit'); shake = Math.max(shake, 0.35); },
      sigGone: id => sigRemove(id, 'gone'),
      stage: n => { stageN = n; shake = Math.max(shake, 0.9); glitchK = 1; glitchUntil = nowS() + 0.7; recoilV += 1.2; if (canFlash()) flash = 1; },
      lunge: () => { atkT = Math.max(atkT, 0.5); },
      screen,
      info: () => ({ frames, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, lines: renderer.info.render.lines, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, size: [renderer.domElement.width, renderer.domElement.height], boss: slotNow && slotNow.boss.id, mark: slotNow && slotNow.mark, wind: +pose.wind.toFixed(2), dying, shield: shieldF, fx: fx ? fx.info() : null, flyers: pool.filter(p => p.id).length }),
      dispose,
    };
  }

  return { mount };
})();
