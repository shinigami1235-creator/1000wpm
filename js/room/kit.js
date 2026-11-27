// Modelling kit for the room items: cached materials, canvas textures and
// geometry helpers. RoomKit(THREE, RB) builds it once per three.js instance.
// Units are metres. Every item faces +z with y = 0 at its base.
(() => {
  let made = null;

  window.RoomKit = function (THREE, RB) {
    if (made && made.THREE === THREE) return made;
    const K = { THREE, RB };
    // sharper canvas textures on desktop; phones keep 1x to save memory
    const phoneish = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
    K.texScale = phoneish ? 1 : 2;
    K.aniso = phoneish ? 4 : 16;
    const TAU = Math.PI * 2;

    // ---------- seeded random so textures and props look the same every load ----------
    K.rng = seed => () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    // ---------- materials ----------
    const mats = new Map();
    const memo = (key, make) => { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m); } return m; };
    K.memo = memo;
    K.std = (color, rough = 0.6, metal = 0) => memo(`std|${color}|${rough}|${metal}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
    K.metal = (color = '#9a9da3', rough = 0.32) => K.std(color, rough, 0.9);
    K.plastic = (color, rough = 0.45) => memo(`pl|${color}|${rough}`,
      () => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
    K.glow = (color, i = 2.5) => memo(`glow|${color}|${i}`,
      () => new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: i, roughness: 0.5 }));
    K.glass = (tint = '#cfe8dc', opacity = 0.16) => memo(`glass|${tint}|${opacity}`, () => {
      const m = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.04, metalness: 0, transparent: true, opacity, clearcoat: 1, depthWrite: false });
      m.userData.glass = true;
      return m;
    });
    K.fabric = (color, bump = 1) => memo(`fab|${color}|${bump}`, () => K.weaveUp(new THREE.MeshPhysicalMaterial({
      color, roughness: 0.92, sheen: 1, sheenRoughness: 0.45,
      sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35),
      bumpMap: K.weaveTex(), bumpScale: bump,
    })));
    // In the room page the woven fabric gets a real normal map (K.useWeave), in place of the bump
    K.weaveUp = m => {
      if (K.weave) { m.normalMap = K.weave; m.normalScale.set(0.7, 0.7); m.bumpMap = null; m.needsUpdate = true; }
      return m;
    };
    K.useWeave = tex => {
      const t = tex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.needsUpdate = true;
      K.weave = t;
      for (const [k, m] of mats) if (k.startsWith('fab|')) K.weaveUp(m);
    };

    // ---------- high-detail texture sets (albedo, normal, ORM) from assets/room/tex, fetched only by the room page ----------
    const hdSets = new Map();
    K.hdSet = name => {
      if (!hdSets.has(name)) hdSets.set(name, (async () => {
        const tl = new THREE.TextureLoader();
        const ld = (f, srgb) => new Promise((ok, no) => tl.load(`assets/room/tex/${name}/${f}.webp`, t => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = K.aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; ok(t);
        }, undefined, no));
        const [map, normal, orm] = await Promise.all([ld('albedo', true), ld('normal'), ld('orm')]);
        return { map, normal, orm };
      })().catch(e => { hdSets.delete(name); throw e; }));
      return hdSets.get(name);
    };
    K.leather = color => memo(`lea|${color}`, () => new THREE.MeshPhysicalMaterial({
      color, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.5, bumpMap: K.grainTex(), bumpScale: 0.6,
    }));
    K.wood = kind => memo(`wood|${kind}`, () => {
      const p = K.WOODS[kind] || K.WOODS.oak;
      return new THREE.MeshStandardMaterial({ map: K.woodTex(kind), roughness: p.rough, bumpMap: K.woodTex(kind), bumpScale: 0.4 });
    });
    K.WOODS = {
      oak: { base: '#b98856', dark: '#7a5230', light: '#d9ad7c', rough: 0.55 },
      walnut: { base: '#5e3b25', dark: '#3a2314', light: '#8a5d3d', rough: 0.45 },
      black: { base: '#1d1f1e', dark: '#0e0f0f', light: '#353836', rough: 0.5 },
      ash: { base: '#cdb48f', dark: '#9c8360', light: '#e6d4b6', rough: 0.6 },
    };
    // A screen: emissive canvas so it lights up under bloom
    K.screenMat = (kind, i = 1.15) => memo(`scr|${kind}|${i}`, () => new THREE.MeshStandardMaterial({
      color: '#000000', emissive: '#ffffff', emissiveMap: K.screenTex(kind), emissiveIntensity: i, roughness: 0.25, metalness: 0,
    }));

    // ---------- canvas textures ----------
    const texs = new Map();
    K.canvasTex = (key, w, h, draw, { srgb = true, repeat = null } = {}) => {
      let t = texs.get(key);
      if (t) return t;
      const cv = document.createElement('canvas');
      // draw at a higher resolution with the same coordinates, capped at 2048 px
      const k = Math.max(1, Math.min(K.texScale, 2048 / Math.max(w, h)));
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const cx = cv.getContext('2d');
      cx.scale(k, k);
      draw(cx, w, h);
      t = new THREE.CanvasTexture(cv);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = K.aniso;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
      texs.set(key, t);
      return t;
    };

    K.weaveTex = () => K.canvasTex('weave', 128, 128, (c, w, h) => {
      c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
        const on = ((x + y) / 4) % 2;
        c.fillStyle = on ? '#a0a0a0' : '#5a5a5a';
        c.fillRect(x, y, 4, 4);
      }
    }, { srgb: false, repeat: [8, 8] });

    K.grainTex = () => K.canvasTex('grain', 256, 256, (c, w, h) => {
      const r = K.rng(7);
      c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        const v = 100 + r() * 60 | 0;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.beginPath(); c.arc(r() * w, r() * h, 0.6 + r() * 1.6, 0, TAU); c.fill();
      }
    }, { srgb: false, repeat: [3, 3] });

    K.woodTex = kind => K.canvasTex('wood|' + kind, 512, 256, (c, w, h) => {
      const p = K.WOODS[kind] || K.WOODS.oak;
      const r = K.rng(kind.length * 31 + 5);
      c.fillStyle = p.base; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) {
        const y0 = r() * h, amp = 1 + r() * 4, f = 0.004 + r() * 0.01, ph = r() * 9;
        c.strokeStyle = r() < 0.55 ? p.dark : p.light;
        c.globalAlpha = 0.06 + r() * 0.18;
        c.lineWidth = 0.6 + r() * 2.2;
        c.beginPath();
        for (let x = -10; x <= w + 10; x += 12) c.lineTo(x, y0 + Math.sin(x * f + ph) * amp + Math.sin(x * 0.05 + ph) * 0.6);
        c.stroke();
      }
      c.globalAlpha = 1;
    });

    K.plasterTex = () => K.canvasTex('plaster', 256, 256, (c, w, h) => {
      const r = K.rng(3);
      c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        const v = 110 + r() * 40 | 0;
        c.fillStyle = `rgba(${v},${v},${v},.5)`;
        c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
      }
    }, { srgb: false, repeat: [4, 4] });

    // Floor planks: 1024 px is 2 m. Planks run along x.
    K.floorTex = () => K.canvasTex('floor', 1024, 1024, (c, w, h) => {
      const r = K.rng(11);
      const ph = 92;
      for (let y = 0, row = 0; y < h; y += ph, row++) {
        let x = -(r() * 500);
        while (x < w) {
          const len = 380 + r() * 420;
          const tone = r();
          const base = [112 + tone * 34, 76 + tone * 22, 52 + tone * 14].map(v => v | 0);
          c.fillStyle = `rgb(${base})`;
          c.fillRect(x, y, len, ph);
          for (let i = 0; i < 26; i++) {
            const yy = y + r() * ph, amp = 1 + r() * 3, f = 0.006 + r() * 0.01, phs = r() * 9;
            c.strokeStyle = r() < 0.6 ? 'rgba(70,40,20,.35)' : 'rgba(230,180,130,.22)';
            c.lineWidth = 0.5 + r() * 1.6;
            c.beginPath();
            for (let xx = x; xx <= x + len; xx += 14) c.lineTo(xx, Math.min(y + ph - 2, Math.max(y + 2, yy + Math.sin(xx * f + phs) * amp)));
            c.stroke();
          }
          c.fillStyle = 'rgba(25,14,8,.85)';
          c.fillRect(x, y, 2, ph);
          x += len;
        }
        c.fillStyle = 'rgba(25,14,8,.9)';
        c.fillRect(0, y, w, 2);
      }
    });
    K.floorBump = () => K.canvasTex('floorbump', 1024, 1024, (c, w, h) => {
      c.fillStyle = '#909090'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#303030';
      for (let y = 0; y < h; y += 92) c.fillRect(0, y, w, 3);
    }, { srgb: false });

    // ---------- the laurel A mark ----------
    K.drawLaurel = (c, cx, cy, s, color, glow = 0) => {
      c.save();
      c.strokeStyle = color; c.fillStyle = color;
      if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
      for (const side of [-1, 1]) {
        const R = s * 0.46;
        for (let i = 0; i < 9; i++) {
          const a = Math.PI / 2 + side * (0.35 + i * 0.27);
          const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 1.02;
          for (const o of [-1, 1]) {
            c.save();
            c.translate(x, y);
            c.rotate(a + side * Math.PI / 2 + o * 0.55 * side + (side > 0 ? Math.PI : 0));
            c.beginPath();
            c.ellipse(o * s * 0.045, 0, s * 0.058, s * 0.022, 0, 0, TAU);
            c.fill();
            c.restore();
          }
        }
        c.lineWidth = s * 0.018;
        c.beginPath();
        c.arc(cx, cy, R, Math.PI / 2 + side * 0.3, Math.PI / 2 + side * 2.5, side < 0);
        c.stroke();
      }
      c.lineJoin = 'miter'; c.lineCap = 'butt';
      c.lineWidth = s * 0.075;
      c.beginPath();
      c.moveTo(cx - s * 0.2, cy + s * 0.26);
      c.lineTo(cx, cy - s * 0.3);
      c.lineTo(cx + s * 0.2, cy + s * 0.26);
      c.stroke();
      c.lineWidth = s * 0.045;
      c.beginPath();
      c.moveTo(cx - s * 0.1, cy + s * 0.07); c.lineTo(cx + s * 0.1, cy + s * 0.07);
      c.stroke();
      c.restore();
    };

    const MONO = '"Share Tech Mono", "JetBrains Mono", ui-monospace, monospace';
    K.MONO = MONO;

    // ---------- screens ----------
    const SCREENS = {
      logo(c, w, h) {
        const g = c.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, w * 0.7);
        g.addColorStop(0, '#0f3a24'); g.addColorStop(1, '#020604');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        K.drawLaurel(c, w / 2, h * 0.42, h * 0.5, '#39ff88', 18);
        c.font = `700 ${h * 0.11 | 0}px ${MONO}`; c.textAlign = 'center';
        c.fillStyle = '#d7f5e3'; c.shadowColor = '#39ff88'; c.shadowBlur = 10;
        c.fillText('10000WPM', w / 2, h * 0.86);
      },
      mountain(c, w, h) {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#0b1730'); g.addColorStop(0.6, '#2b4a7a'); g.addColorStop(1, '#9fb7d9');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        const r = K.rng(4);
        for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.8})`; c.fillRect(r() * w, r() * h * 0.45, 1.5, 1.5); }
        const ridge = (y, amp, col, seed) => {
          const rr = K.rng(seed);
          c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
          let yy = y;
          for (let x = 0; x <= w; x += w / 14) { yy = y - rr() * amp; c.lineTo(x, yy); }
          c.lineTo(w, h); c.fill();
        };
        ridge(h * 0.62, h * 0.32, '#3d5577', 2);
        ridge(h * 0.75, h * 0.28, '#1d2c44', 9);
        ridge(h * 0.9, h * 0.2, '#0c1422', 5);
      },
      code(c, w, h) {
        c.fillStyle = '#0b0f0d'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#121a16'; c.fillRect(0, 0, w * 0.18, h);
        const r = K.rng(21);
        const cols = ['#39ff88', '#3ee6ff', '#f2c230', '#d7f5e3', '#7fa892', '#ff7ab6'];
        const lh = h / 18;
        for (let i = 0; i < 17; i++) {
          let x = w * 0.22 + (r() < 0.6 ? r() * 4 | 0 : 0) * 14;
          const n = 2 + r() * 5 | 0;
          for (let j = 0; j < n; j++) {
            const len = 14 + r() * 70;
            c.fillStyle = cols[r() * cols.length | 0];
            c.globalAlpha = 0.85;
            c.fillRect(x, 8 + i * lh, len, lh * 0.45);
            x += len + 8;
            if (x > w * 0.95) break;
          }
          c.fillStyle = '#2f4a3b'; c.globalAlpha = 1;
          c.fillRect(w * 0.03, 8 + i * lh, w * 0.1 * r() + 10, lh * 0.4);
        }
      },
      type(c, w, h) {
        c.fillStyle = '#040806'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(57,255,136,.35)'; c.lineWidth = 2;
        c.strokeRect(w * 0.06, h * 0.12, w * 0.88, h * 0.7);
        c.font = `${h * 0.075 | 0}px ${MONO}`; c.textBaseline = 'top';
        const lines = ['the quick brown fox jumps', 'over the lazy dog while the', 'keys clack under every word'];
        lines.forEach((l, i) => {
          const y = h * 0.24 + i * h * 0.15;
          const done = i === 0 ? l.length : i === 1 ? 11 : 0;
          c.fillStyle = '#39ff88'; c.fillText(l.slice(0, done), w * 0.1, y);
          const wDone = c.measureText(l.slice(0, done)).width;
          c.fillStyle = '#3d5446'; c.fillText(l.slice(done), w * 0.1 + wDone, y);
          if (i === 1) { c.fillStyle = '#3ee6ff'; c.fillRect(w * 0.1 + wDone, y, 3, h * 0.08); }
        });
        c.fillStyle = '#39ff88'; c.font = `${h * 0.06 | 0}px ${MONO}`;
        c.fillText('> TYPE_', w * 0.06, h * 0.86);
      },
      stats(c, w, h) {
        c.fillStyle = '#050a07'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(57,255,136,.12)';
        for (let x = 0; x < w; x += w / 12) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
        for (let y = 0; y < h; y += h / 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        const r = K.rng(8);
        c.strokeStyle = '#39ff88'; c.lineWidth = 3; c.shadowColor = '#39ff88'; c.shadowBlur = 8;
        c.beginPath();
        let y = h * 0.7;
        for (let x = 0; x <= w; x += w / 30) { y = Math.max(h * 0.15, Math.min(h * 0.85, y - (r() - 0.42) * h * 0.12)); c.lineTo(x, y); }
        c.stroke();
        c.strokeStyle = '#3ee6ff'; c.lineWidth = 2; c.globalAlpha = 0.7;
        c.beginPath();
        for (let x = 0; x <= w; x += w / 30) c.lineTo(x, h * 0.5 + Math.sin(x * 0.02) * h * 0.1);
        c.stroke();
      },
      city(c, w, h) { K.drawCity(c, w, h, 14); },
    };
    K.screenTex = kind => K.canvasTex('screen|' + kind, 512, 288, SCREENS[kind] || SCREENS.logo);

    K.drawCity = (c, w, h, seed) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05060f'); g.addColorStop(0.55, '#16163a'); g.addColorStop(1, '#3a1d4a');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const r = K.rng(seed);
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.6})`; c.fillRect(r() * w, r() * h * 0.4, 1.2, 1.2); }
      const layers = [[0.5, '#0d0f22', 0.35], [0.62, '#090a18', 0.6], [0.74, '#050610', 1]];
      for (const [base, col, lit] of layers) {
        let x = -10;
        while (x < w) {
          const bw = w * (0.05 + r() * 0.09), bh = h * (0.2 + r() * 0.5) * (1.2 - base);
          const top = h * base - bh + h * 0.25;
          c.fillStyle = col; c.fillRect(x, top, bw, h - top);
          const winCols = ['#ffd27a', '#ffe7b0', '#3ee6ff', '#ff7ab6', '#39ff88'];
          for (let wy = top + 6; wy < h - 4; wy += 7) for (let wx = x + 4; wx < x + bw - 4; wx += 6) {
            if (r() < 0.32 * lit) { c.fillStyle = winCols[r() < 0.8 ? (r() * 2 | 0) : 2 + (r() * 3 | 0)]; c.globalAlpha = 0.5 + r() * 0.5; c.fillRect(wx, wy, 3, 4); }
          }
          c.globalAlpha = 1;
          if (r() < 0.25 * lit) { c.fillStyle = r() < 0.5 ? '#ff3d8b' : '#3ee6ff'; c.shadowColor = c.fillStyle; c.shadowBlur = 8; c.fillRect(x + bw * 0.2, top + 8, bw * 0.6, 4); c.shadowBlur = 0; }
          x += bw + r() * 6;
        }
      }
    };

    // ---------- geometry helpers ----------
    const shade = o => { o.traverse(m => { if (m.isMesh) { const g = [].concat(m.material).some(x => x.userData.glass); m.castShadow = !g; m.receiveShadow = true; } }); return o; };
    K.shade = shade;
    K.mesh = (geo, mat) => new THREE.Mesh(geo, mat);
    K.box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    K.rbox = (w, h, d, r, mat, seg = 3) => new THREE.Mesh(new RB(w, h, d, seg, Math.max(0.0005, Math.min(r, Math.min(w, h, d) * 0.48))), mat);
    K.cyl = (rt, rb, h, mat, seg = 32, open = false) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
    K.sph = (r, mat, ws = 32, hs = 20) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
    K.torus = (R, r, mat, arc = TAU, rs = 12, ts = 48) => new THREE.Mesh(new THREE.TorusGeometry(R, r, rs, ts, arc), mat);
    K.cap = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 16), mat);
    K.lathe = (pts, mat, seg = 48) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg), mat);
    K.curve = pts => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    K.tube = (pts, r, mat, seg = 64, rs = 10, closed = false) => new THREE.Mesh(new THREE.TubeGeometry(K.curve(pts), seg, r, rs, closed), mat);
    K.put = (o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
    K.group = (...kids) => { const g = new THREE.Group(); kids.forEach(k => k && g.add(k)); return g; };
    K.done = g => shade(g);

    // Weld a geometry by position so computeVertexNormals gives a smooth surface
    K.weld = geo => {
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      const map = new Map(), remap = new Int32Array(pos.count), P = [], U = [];
      for (let i = 0; i < pos.count; i++) {
        const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
        let j = map.get(k);
        if (j === undefined) { j = P.length / 3; map.set(k, j); P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); }
        remap[i] = j;
      }
      const src = geo.index ? geo.index.array : Array.from({ length: pos.count }, (_, i) => i);
      const I = [];
      for (let i = 0; i < src.length; i += 3) {
        const a = remap[src[i]], b = remap[src[i + 1]], c = remap[src[i + 2]];
        if (a !== b && b !== c && a !== c) I.push(a, b, c);
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      out.setIndex(I);
      return out;
    };

    // A padded cushion: thick in the middle, thin at the seams, optionally bent around y.
    // w across x, h across y, d is the thickness along z. bend pulls the sides toward +z.
    K.cushionGeo = (w, h, d, { bend = 0, puff = 1, taper = 0 } = {}) => {
      const geo = K.weld(new THREE.BoxGeometry(w, h, d, 18, 18, 3));
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const nx = Math.min(1, Math.abs(2 * x / w)), ny = Math.min(1, Math.abs(2 * y / h));
        const f = Math.pow(1 - Math.pow(nx, 5), 0.3) * Math.pow(1 - Math.pow(ny, 5), 0.3);
        z *= 0.3 + 0.7 * Math.pow(f, puff);
        // soften the outline corners
        const corner = Math.pow(nx, 6) * Math.pow(ny, 6);
        x *= 1 - corner * 0.12; y *= 1 - corner * 0.12;
        if (taper) x *= 1 - taper * (y / h + 0.5);
        z += bend * (2 * x / w) * (2 * x / w);
        p.setXYZ(i, x, y, z);
      }
      geo.computeVertexNormals();
      return geo;
    };
    K.cushion = (w, h, d, mat, o) => new THREE.Mesh(K.cushionGeo(w, h, d, o), mat);

    // Bend a plane-like geometry around a vertical axis R in front of it (+z), so the sides come forward.
    K.curveX = (geo, R) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const a = x / R;
        p.setXYZ(i, Math.sin(a) * (R - z), p.getY(i), R - (R - z) * Math.cos(a));
      }
      geo.computeVertexNormals();
      return geo;
    };

    // ---------- reusable parts ----------
    // Five-star chair base with casters, gas lift up to seatY
    K.starBase = (seatY, legMat, R = 0.32) => {
      const g = new THREE.Group();
      const hub = K.cyl(0.05, 0.06, 0.06, legMat); hub.position.y = 0.1; g.add(hub);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        const arm = new THREE.Group();
        const leg = K.rbox(R, 0.035, 0.05, 0.012, legMat);
        leg.position.set(R / 2, 0.1, 0); leg.rotation.z = -0.12;
        arm.add(leg);
        const fork = K.cyl(0.012, 0.012, 0.04, K.metal('#2a2b2e'));
        fork.position.set(R - 0.005, 0.06, 0); arm.add(fork);
        const wheel = K.cyl(0.028, 0.028, 0.03, K.plastic('#151618', 0.5), 20);
        wheel.rotation.x = Math.PI / 2; wheel.position.set(R - 0.02, 0.028, 0); arm.add(wheel);
        arm.rotation.y = a;
        g.add(arm);
      }
      const lift = K.cyl(0.022, 0.022, seatY - 0.16, K.metal('#c9cbd0', 0.25));
      lift.position.y = 0.13 + (seatY - 0.16) / 2; g.add(lift);
      const sleeve = K.cyl(0.032, 0.036, (seatY - 0.16) * 0.55, legMat);
      sleeve.position.y = 0.14 + (seatY - 0.16) * 0.275; g.add(sleeve);
      return g;
    };

    // PC fan with an RGB ring. userData.spin is the rotor to turn.
    K.fan = (d, color, frameColor = '#141516', bladeTint = '#e8f5ee') => {
      const g = new THREE.Group();
      const frame = K.rbox(d, d, 0.025, 0.006, K.plastic(frameColor, 0.5));
      g.add(frame);
      const ring = K.torus(d * 0.42, d * 0.022, K.glow(color, 3), TAU, 8, 48);
      ring.position.z = 0.0135; g.add(ring);
      const ring2 = K.torus(d * 0.42, d * 0.022, K.glow(color, 3), TAU, 8, 48);
      ring2.position.z = -0.0135; g.add(ring2);
      const hole = K.cyl(d * 0.4, d * 0.4, 0.026, K.std('#050505', 0.9), 40);
      hole.rotation.x = Math.PI / 2; g.add(hole);
      const rotor = new THREE.Group();
      const hubM = K.plastic(bladeTint, 0.35);
      const hub = K.cyl(d * 0.12, d * 0.12, 0.022, hubM, 24); hub.rotation.x = Math.PI / 2; rotor.add(hub);
      const bladeM = memo(`blade|${bladeTint}|${color}`, () => new THREE.MeshStandardMaterial({ color: bladeTint, emissive: color, emissiveIntensity: 0.45, roughness: 0.3, transparent: true, opacity: 0.85 }));
      for (let i = 0; i < 9; i++) {
        const b = K.rbox(d * 0.27, d * 0.09, 0.003, 0.0015, bladeM, 2);
        b.geometry.translate(d * 0.25, 0, 0);
        b.rotation.set(0.45, 0, i / 9 * TAU);
        rotor.add(b);
      }
      g.add(rotor);
      g.userData.spin = rotor;
      return g;
    };

    // ---------- keyboards ----------
    K.KB_FALLBACK = layout => {
      const k = (l, w = 1) => [l, w, null, 1];
      const ones = n => Array.from({ length: n }, () => k('', 1));
      const base = [
        [k('Esc'), ...ones(12), k('Bksp', 2)],
        [k('Tab', 1.5), ...ones(12), k('\\', 1.5)],
        [k('Caps', 1.75), ...ones(11), k('Enter', 2.25)],
        [k('Shift', 2.25), ...ones(10), k('Shift', 2.75)],
        [k('Ctrl', 1.25), k('Win', 1.25), k('Alt', 1.25), k('', 6.25), k('Alt', 1.25), k('Fn', 1.25), k('Menu', 1.25), k('Ctrl', 1.25)],
      ];
      if (layout === '96' || layout === '75') base.unshift([k('Esc'), ...ones(layout === '96' ? 17 : 15)]);
      if (layout === '96') base.forEach((r, i) => i && r.push(...ones(4)));
      return { rows: base, fGap: layout === '96' || layout === '75' ? 0.25 : 0 };
    };

    const capGeo = () => memo('capgeo', () => {
      const g = new RB(0.0176, 0.0095, 0.0176, 2, 0.0026);
      // dish the top slightly and taper the sides like a real cap
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const t = (y + 0.00475) / 0.0095;
        p.setX(i, p.getX(i) * (1 - t * 0.14));
        p.setZ(i, p.getZ(i) * (1 - t * 0.14));
      }
      g.computeVertexNormals();
      return g;
    });

    // kb: { layout, look, knob, screen } from js/keyboards.js
    K.keyboard = kb => {
      const U = 0.019;
      const L = (window.KB_LAYOUTS && window.KB_LAYOUTS[kb.layout]) || K.KB_FALLBACK(kb.layout);
      const look = kb.look;
      const placed = [];
      let maxX = 0, knobSpot = null;
      L.rows.forEach((r, ri) => {
        let x = 0;
        const z = ri + (ri > 0 && L.fGap ? L.fGap : 0);
        for (const key of r) {
          if (!Array.isArray(key)) { if (key.knob) knobSpot = { x: x + 0.5, z: z + 0.5 }; x += key.gap; continue; }
          const [label, w, code, h = 1] = key;
          placed.push({ label, w, h, code, x: x + w / 2, z: z + h / 2 });
          x += w;
        }
        maxX = Math.max(maxX, x);
      });
      const rowsD = L.rows.length + (L.fGap || 0);
      const back = (kb.knob && !knobSpot) || kb.screen ? 1.1 : 0;
      const ox = maxX / 2, oz = rowsD / 2;
      const g = new THREE.Group();
      const inner = new THREE.Group();
      g.add(inner);

      const caseW = (maxX + 0.75) * U, caseD = (rowsD + 0.75 + back) * U, caseH = 0.02;
      const caseMat = look.clear
        ? memo('kbclear|' + look.case, () => new THREE.MeshPhysicalMaterial({ color: look.case, roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1 }))
        : look.metal ? K.std(look.case, 0.35, 0.85) : K.plastic(look.case, 0.55);
      const cs = K.rbox(caseW, caseH, caseD, 0.004, caseMat, 4);
      cs.position.set(0, caseH / 2, -back * U / 2);
      inner.add(cs);
      if (look.clear) {
        const pcb = K.box(maxX * U, 0.003, rowsD * U, K.std('#1d2420', 0.7));
        pcb.position.y = 0.008; inner.add(pcb);
      }
      // backlit plate between the caps
      const plate = K.box(maxX * U + 0.002, 0.002, rowsD * U + 0.002, K.glow(look.rgb, 0.55));
      plate.position.y = caseH - 0.0005; inner.add(plate);
      // underglow lightbar
      const under = K.rbox(caseW - 0.006, 0.003, caseD - 0.006, 0.0015, K.glow(look.rgb, 2.2));
      under.position.set(0, 0.0015, -back * U / 2); inner.add(under);

      const capM = col => look.crystal
        ? memo('crys|' + col, () => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.08, transparent: true, opacity: 0.62, clearcoat: 1, emissive: look.rgb, emissiveIntensity: 0.25 }))
        : K.plastic(col, 0.5);
      const groups = { alpha: [], mod: [], accent: [] };
      for (const p of placed) {
        const isAccent = p.code && [].concat(p.code).some(c => look.accentKeys.includes(c));
        const isMod = p.w > 1.01 || p.label.length > 1 || p.label === '';
        groups[isAccent ? 'accent' : isMod && p.label !== '' ? 'mod' : 'alpha'].push(p);
      }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
      for (const [kind, list] of Object.entries(groups)) {
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(capGeo(), capM(look[kind]), list.length);
        list.forEach((p, i) => {
          s.set((p.w * U - 0.0014) / 0.0176, 1, (p.h * U - 0.0014) / 0.0176);
          v.set((p.x - ox) * U, caseH + 0.0058, (p.z - oz) * U);
          im.setMatrixAt(i, m4.compose(v, q, s));
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingBox(); im.computeBoundingSphere();
        inner.add(im);
      }
      // legends on one transparent sheet above the caps
      const PX = 40;
      const legend = K.canvasTex(`legend|${kb.id || kb.layout}|${look.legend}`, Math.ceil(maxX * PX), Math.ceil(rowsD * PX), c => {
        c.fillStyle = look.legend; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (const p of placed) {
          if (!p.label) continue;
          const sz = p.label.length === 1 ? 17 : p.label.length <= 3 ? 11 : 9;
          c.font = `600 ${sz}px ${MONO}`;
          const lx = p.w >= 1.5 ? (p.x - p.w / 2 + 0.55) * PX : p.x * PX;
          c.fillText(p.label, lx, p.z * PX + 1);
        }
      });
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(maxX * U, rowsD * U),
        memo('legendmat|' + (kb.id || kb.layout), () => new THREE.MeshStandardMaterial({ map: legend, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.y = caseH + 0.0107;
      inner.add(sheet);

      if (kb.knob) {
        const kx = knobSpot ? (knobSpot.x - ox) * U : (maxX / 2 - 0.7) * U;
        const kz = knobSpot ? (knobSpot.z - oz) * U : (-oz - 0.55) * U;
        const knob = K.cyl(0.0085, 0.009, 0.012, K.metal(look.metal || look.clear ? '#c9c9c6' : '#3a3c42', 0.3), 40);
        knob.position.set(kx, caseH + 0.006, kz); inner.add(knob);
        const notch = K.box(0.0015, 0.0005, 0.005, K.glow(look.rgb, 2));
        notch.position.set(kx, caseH + 0.0122, kz - 0.004); inner.add(notch);
      }
      if (kb.screen) {
        const scr = K.canvasTex('kbscreen', 128, 64, c => {
          c.fillStyle = '#0d0e10'; c.fillRect(0, 0, 128, 64);
          c.fillStyle = look.rgb; c.font = `600 34px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('204', 64, 34);
        });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.014), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: scr, emissiveIntensity: 1.2 }));
        sm.rotation.x = -Math.PI / 2;
        sm.position.set((maxX / 2 - 1.3) * U, caseH + 0.0003, (-oz - 0.6) * U);
        inner.add(sm);
      }
      // typing angle
      inner.rotation.x = 0.07;
      inner.position.y = Math.sin(0.07) * caseD / 2;
      g.userData.size = [caseW, caseD];
      return g;
    };

    // ---------- monitors ----------
    // o: { w, h (panel), curve (radius or 0), screen, stand ('none' hides it), bezel, lift, backGlow }
    K.monitor = o => {
      const g = new THREE.Group();
      const shell = K.plastic('#1a1b1e', 0.5);
      const w = o.w, h = o.h, t = 0.012;
      const panel = new THREE.Group();
      const screenGeo = new THREE.PlaneGeometry(w - o.bezel * 2, h - o.bezel * 2 - 0.012, o.curve ? 48 : 1, 1);
      const bodyGeo = new RB(w, h, t, 2, 0.004);
      if (o.curve) {
        // rebuild the shell as a segmented box so it bends with the screen
        const bg = new THREE.BoxGeometry(w, h, t, 48, 1, 1);
        K.curveX(bg, o.curve); K.curveX(screenGeo, o.curve);
        panel.add(new THREE.Mesh(bg, shell));
      } else {
        panel.add(new THREE.Mesh(bodyGeo, shell));
      }
      const scr = new THREE.Mesh(screenGeo, K.screenMat(o.screen || 'logo'));
      scr.position.set(0, 0.006, t / 2 + 0.0008);
      panel.add(scr);
      // chin logo light and back bulge
      const led = K.box(0.012, 0.0015, 0.001, K.glow('#39ff88', 2)); led.position.set(0, -h / 2 + 0.006, t / 2 + 0.0006); panel.add(led);
      const bulge = K.rbox(w * 0.45, h * 0.5, 0.04, 0.012, shell); bulge.position.set(0, -h * 0.05, -0.02); panel.add(bulge);
      if (o.backGlow) { const bl = K.box(w * 0.7, 0.004, 0.004, K.glow(o.backGlow, 3)); bl.position.set(0, h * 0.2, -0.042); panel.add(bl); }
      const standH = o.lift ?? 0.12;
      panel.position.set(0, standH + h / 2, 0.02);
      panel.rotation.x = -0.05;
      g.add(panel);
      if (o.stand !== 'none') {
        const sm = K.metal('#2b2d31', 0.35);
        const base = K.rbox(o.w > 0.7 ? 0.36 : 0.26, 0.012, 0.19, 0.005, sm, 3);
        base.position.set(0, 0.006, -0.01); g.add(base);
        const neck = K.rbox(0.05, standH + h * 0.35, 0.022, 0.008, sm);
        neck.position.set(0, (standH + h * 0.35) / 2, -0.06); neck.rotation.x = 0.06; g.add(neck);
        const hole = K.rbox(0.022, 0.035, 0.024, 0.008, K.std('#0a0a0a', 0.9));
        hole.position.set(0, standH * 0.6, -0.061); g.add(hole);
      }
      return g;
    };

    made = K;
    return K;
  };
})();
