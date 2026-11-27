// Home items (Gid, 27 Nov 2026): wallpapers, floors, beds, sofas, more chairs, shelves of books
// and things that move (aquarium, fishbowl, globe, clock, fan, fireplace, arcade, plasma ball).
// Loaded after items.js. Wallpapers and floors are bought like room sizes: they carry
// finish: { kind: 'wall' | 'floor', ... } and change the room shell instead of being placed.
(() => {
  const TAU = Math.PI * 2;
  const P = () => RoomItems.parts;
  const K_ = RoomItems.K_;

  // ---------------------------------------------------------------- finishes
  // A finish says how to make the material: draw(K) returns { map, bump, emissiveMap, ... }.
  // tile is how many metres one copy of the texture covers.
  const tex = (K, key, w, h, draw, srgb = true) => K.canvasTex(key, w, h, draw, { srgb });
  const noise = (c, w, h, r, n, a, s = 2) => { for (let i = 0; i < n; i++) { const v = r() * 255 | 0; c.fillStyle = `rgba(${v},${v},${v},${a})`; c.fillRect(r() * w, r() * h, s * r() + 0.5, s * r() + 0.5); } };

  const paint = (color, rough = 0.9) => K => ({ color, rough, bump: K.plasterTex(), bumpScale: 0.8, tile: 1.2, pbr: { set: 'plaster', tile: 2.4, rough: 0.95 } });
  // a printed or painted pattern keeps its own picture and takes the plaster's surface
  const onPlaster = f => K => ({ ...f(K), pbr: { set: 'plaster', tile: 2.4, map: false, normal: 0.6 } });

  function brick(K) {
    const draw = bump => (c, w, h) => {
      const r = K.rng(21), bw = w / 5, bh = h / 17;
      c.fillStyle = bump ? '#303030' : '#b9b2a6'; c.fillRect(0, 0, w, h);
      for (let row = 0; row < 17; row++) for (let i = -1; i < 6; i++) {
        const x = i * bw + (row % 2 ? bw / 2 : 0) + 3, y = row * bh + 3;
        if (bump) { c.fillStyle = '#b0b0b0'; c.fillRect(x, y, bw - 6, bh - 6); continue; }
        const t = r();
        c.fillStyle = `rgb(${150 + t * 50 | 0},${68 + t * 30 | 0},${48 + t * 18 | 0})`; c.fillRect(x, y, bw - 6, bh - 6);
        c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x, y + bh - 10, bw - 6, 4);
      }
      if (!bump) noise(c, w, h, r, 3000, 0.12);
    };
    return { map: tex(K, 'wf-brick', 512, 512, draw(false)), bump: tex(K, 'wf-brickb', 512, 512, draw(true), false), bumpScale: 2.5, rough: 0.9, tile: 1.2, pbr: { set: 'brick', tile: 1.2, normal: 1.2 } };
  }
  function panel(K) {
    const map = tex(K, 'wf-panel', 512, 512, (c, w, h) => {
      const r = K.rng(5), n = 8, bw = w / n;
      for (let i = 0; i < n; i++) {
        const t = r();
        c.fillStyle = `rgb(${176 + t * 30 | 0},${128 + t * 22 | 0},${84 + t * 14 | 0})`; c.fillRect(i * bw, 0, bw, h);
        for (let k = 0; k < 14; k++) {
          const x0 = i * bw + 4 + r() * (bw - 8), amp = 1 + r() * 3;
          c.strokeStyle = r() < 0.6 ? 'rgba(90,55,25,.3)' : 'rgba(240,200,150,.2)'; c.lineWidth = 0.6 + r();
          c.beginPath(); for (let y = 0; y <= h; y += 12) c.lineTo(x0 + Math.sin(y * 0.02 + k) * amp, y); c.stroke();
        }
        c.fillStyle = 'rgba(40,22,10,.8)'; c.fillRect(i * bw, 0, 3, h);
      }
    });
    const bump = tex(K, 'wf-panelb', 512, 64, (c, w, h) => { c.fillStyle = '#a0a0a0'; c.fillRect(0, 0, w, h); c.fillStyle = '#202020'; for (let i = 0; i < 8; i++) c.fillRect(i * w / 8, 0, 4, h); }, false);
    return { map, bump, bumpScale: 2, rough: 0.6, tile: 1.2, pbr: { set: 'panel', tile: 1.2, rough: 0.8 } };
  }
  function stripes(K) {
    return { map: tex(K, 'wf-stripes', 256, 256, (c, w, h) => {
      c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#9db8a0'; for (let i = 0; i < 4; i++) c.fillRect(i * w / 4, 0, w / 8, h);
      c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 4; i++) c.fillRect(i * w / 4 + w / 8 - 3, 0, 2, h);
    }), bump: K.plasterTex(), bumpScale: 0.5, rough: 0.85, tile: 1.2 };
  }
  function concrete(K) {
    return { map: tex(K, 'wf-concrete', 512, 512, (c, w, h) => {
      const r = K.rng(8);
      c.fillStyle = '#8a8d8c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '60,62,62' : '170,172,170'},${0.05 + r() * 0.08})`; c.beginPath(); c.arc(r() * w, r() * h, 20 + r() * 90, 0, TAU); c.fill(); }
      noise(c, w, h, r, 9000, 0.18, 1.5);
      c.fillStyle = 'rgba(40,40,40,.5)'; c.fillRect(0, 0, w, 2); c.fillRect(0, h / 2, w, 2);
      for (const [x, y] of [[0.17, 0.25], [0.67, 0.25], [0.17, 0.75], [0.67, 0.75]]) { c.fillStyle = '#4a4c4c'; c.beginPath(); c.arc(x * w, y * h, 6, 0, TAU); c.fill(); }
    }), bump: K.plasterTex(), bumpScale: 1.5, rough: 0.95, tile: 1.2, pbr: { set: 'concrete', tile: 1.6 } };
  }
  function subway(K) {
    const draw = bump => (c, w, h) => {
      c.fillStyle = bump ? '#202020' : '#c9cbc6'; c.fillRect(0, 0, w, h);
      const tw = w / 8, th = h / 16, r = K.rng(3);
      for (let row = 0; row < 16; row++) for (let i = -1; i < 9; i++) {
        const x = i * tw + (row % 2 ? tw / 2 : 0) + 2, y = row * th + 2;
        if (bump) { c.fillStyle = '#c8c8c8'; c.fillRect(x, y, tw - 4, th - 4); continue; }
        const v = 236 + r() * 14 | 0;
        c.fillStyle = `rgb(${v},${v},${v - 4})`; c.fillRect(x, y, tw - 4, th - 4);
        c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x + 3, y + 2, tw - 12, 2);
      }
    };
    return { map: tex(K, 'wf-subway', 512, 512, draw(false)), bump: tex(K, 'wf-subwayb', 512, 512, draw(true), false), bumpScale: 1.5, rough: 0.2, tile: 1.2, pbr: { set: 'subway', tile: 1.2, rough: 0.35 } };
  }
  function retro(K) {
    return { map: tex(K, 'wf-retro', 512, 512, (c, w, h) => {
      c.fillStyle = '#f1e3c2'; c.fillRect(0, 0, w, h);
      const cols = ['#d9792b', '#e8a93a', '#7a4a2a', '#2f8a83'];
      cols.forEach((col, i) => {
        c.strokeStyle = col; c.lineWidth = 26;
        c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, 110 + i * 30 + Math.sin(x / w * TAU * 2) * 40); c.stroke();
        c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, 366 + i * 30 + Math.sin(x / w * TAU * 2 + Math.PI) * 40); c.stroke();
      });
    }), bump: K.plasterTex(), bumpScale: 0.5, rough: 0.8, tile: 1.2 };
  }
  function dots(K) {
    return { map: tex(K, 'wf-dots', 256, 256, (c, w, h) => {
      c.fillStyle = '#efc3cb'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff6f2';
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.beginPath(); c.arc((x + (y % 2) * 0.5) * w / 4 + w / 8, y * h / 4 + h / 8, 9, 0, TAU); c.fill(); }
    }), bump: K.plasterTex(), bumpScale: 0.5, rough: 0.85, tile: 0.8 };
  }
  function hex(K) {
    const lines = (c, w, h, col, lw) => {
      c.strokeStyle = col; c.lineWidth = lw;
      const R = w / 6, dx = R * Math.sqrt(3);
      for (let row = -1; row < 6; row++) for (let i = -1; i < 4; i++) {
        const cx = i * dx + (row % 2 ? dx / 2 : 0), cy = row * R * 1.5;
        c.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } c.stroke();
      }
    };
    // 3 hexes across: w = 3 * sqrt(3) * R, rows repeat every 3R; the canvas is cut to tile
    const W = 512, H = Math.round(512 / (Math.sqrt(3) * 3) * 6);
    const map = tex(K, 'wf-hex', W, H, (c, w, h) => { c.fillStyle = '#0d1420'; c.fillRect(0, 0, w, h); lines(c, w, h, '#1b2a3d', 6); });
    const em = tex(K, 'wf-hexe', W, H, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); lines(c, w, h, '#2affb0', 1.5); });
    return { map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: 0.5, rough: 0.5, metal: 0.2, tile: 1.2,
      tick: (m, t) => { m.emissiveIntensity = 0.4 + 0.2 * Math.sin(t * 1.3); } };
  }
  function starry(K) {
    const r0 = () => K.rng(31);
    const map = tex(K, 'wf-stars', 512, 512, (c, w, h) => { c.fillStyle = '#141a3a'; c.fillRect(0, 0, w, h); const r = r0(); for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(120,90,200,${0.04 + r() * 0.05})`; c.beginPath(); c.arc(r() * w, r() * h, 40 + r() * 80, 0, TAU); c.fill(); } });
    const em = tex(K, 'wf-starse', 512, 512, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const r = r0(); for (let i = 0; i < 30; i++) { r(); r(); r(); r(); }
      for (let i = 0; i < 260; i++) { const s = r() < 0.08 ? 2.5 : 1.2; c.fillStyle = r() < 0.2 ? '#ffe6a8' : '#e8eeff'; c.globalAlpha = 0.4 + r() * 0.6; c.beginPath(); c.arc(r() * w, r() * h, s, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    });
    return { map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: 1.2, rough: 0.9, tile: 1.2,
      tick: (m, t) => { m.emissiveIntensity = 1.0 + 0.35 * Math.sin(t * 2.1) * Math.sin(t * 0.7); } };
  }

  function planks(K, key, wood, ph = 92) {
    const p = K.WOODS[wood];
    const map = tex(K, 'ff-' + key, 1024, 1024, (c, w, h) => {
      const r = K.rng(key.length * 7);
      const base = new K.THREE.Color(p.base), dark = new K.THREE.Color(p.dark), light = new K.THREE.Color(p.light), col = new K.THREE.Color();
      for (let y = 0; y < h; y += ph) {
        let x = -(r() * 500);
        while (x < w) {
          const len = 380 + r() * 420, t = r();
          col.copy(dark).lerp(base, 0.5 + t * 0.5); c.fillStyle = '#' + col.getHexString(); c.fillRect(x, y, len, ph);
          for (let i = 0; i < 24; i++) {
            const yy = y + r() * ph, amp = 1 + r() * 3, f = 0.006 + r() * 0.01, phs = r() * 9;
            c.strokeStyle = r() < 0.6 ? `#${dark.getHexString()}55` : `#${light.getHexString()}40`; c.lineWidth = 0.5 + r() * 1.6;
            c.beginPath(); for (let xx = x; xx <= x + len; xx += 14) c.lineTo(xx, Math.min(y + ph - 2, Math.max(y + 2, yy + Math.sin(xx * f + phs) * amp))); c.stroke();
          }
          c.fillStyle = 'rgba(20,12,6,.8)'; c.fillRect(x, y, 2, ph);
          x += len;
        }
        c.fillStyle = 'rgba(20,12,6,.85)'; c.fillRect(0, y, w, 2);
      }
    });
    return { map, bump: K.floorBump(), bumpScale: 1.2, rough: p.rough, tile: 2, pbr: { set: key, tile: 2, rough: 0.85 } };
  }
  function herringbone(K) {
    // planks 4 widths long; plank k lies flat at (k, k), the next stands at (k, k + 1), and each
    // zigzag repeats every (4, -4), so 8 widths make a tile that wraps
    const n = 4, S = 8;
    const map = tex(K, 'ff-herring', 1024, 1024, (c, w, h) => {
      const u = w / S, r = K.rng(17), p = K.WOODS.oak, col = new K.THREE.Color();
      c.fillStyle = p.dark; c.fillRect(0, 0, w, h);
      const plank = (x, y, pw, ph) => {
        col.set(p.dark).lerp(new K.THREE.Color(p.light), 0.35 + r() * 0.5);
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const X = (x + ox) * u, Y = (y + oy) * u;
          if (X > w || Y > h || X + pw * u < 0 || Y + ph * u < 0) continue;
          c.fillStyle = '#' + col.getHexString(); c.fillRect(X + 1.5, Y + 1.5, pw * u - 3, ph * u - 3);
          c.strokeStyle = 'rgba(90,55,25,.22)'; c.lineWidth = 1;
          for (let k = 0; k < 5; k++) { c.beginPath(); if (pw > ph) { const yy = Y + 4 + ((k * 37) % 100) / 100 * (ph * u - 8); c.moveTo(X + 3, yy); c.lineTo(X + pw * u - 3, yy + 2); } else { const xx = X + 4 + ((k * 37) % 100) / 100 * (pw * u - 8); c.moveTo(xx, Y + 3); c.lineTo(xx + 2, Y + ph * u - 3); } c.stroke(); }
        }
      };
      for (let k = 0; k < S; k++) { plank(k, k, n, 1); plank(k, k + 1, 1, n); }
    });
    return { map, rough: 0.5, tile: 0.8, pbr: { set: 'herring', tile: 0.8, rough: 0.8 } };
  }
  function checker(K) {
    const map = tex(K, 'ff-checker', 512, 512, (c, w, h) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#16181a' : '#ecebe6'; c.fillRect(x * w / 4, y * h / 4, w / 4, h / 4); }
      c.strokeStyle = 'rgba(120,120,120,.6)'; c.lineWidth = 2; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
    });
    return { map, rough: 0.25, tile: 1.2, pbr: { set: 'tiles4', tile: 1.2, map: false, rough: 0.6 } };
  }
  function marble(K) {
    const map = tex(K, 'ff-marble', 1024, 1024, (c, w, h) => {
      const r = K.rng(41);
      c.fillStyle = '#e9e7e2'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        let x = r() * w, y = r() * h, a = r() * TAU;
        c.strokeStyle = `rgba(110,110,118,${0.12 + r() * 0.25})`; c.lineWidth = 0.6 + r() * 2.2;
        c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 60; k++) { a += (r() - 0.5) * 0.6; x += Math.cos(a) * 14; y += Math.sin(a) * 14; c.lineTo(x, y); }
        c.stroke();
      }
      c.strokeStyle = 'rgba(150,150,150,.7)'; c.lineWidth = 3;
      for (let i = 0; i <= 2; i++) { c.beginPath(); c.moveTo(i * w / 2, 0); c.lineTo(i * w / 2, h); c.moveTo(0, i * h / 2); c.lineTo(w, i * h / 2); c.stroke(); }
    });
    return { map, rough: 0.12, tile: 1.2, pbr: { set: 'marble', tile: 1.2, rough: 0.5 } };
  }
  function carpet(K) {
    const map = tex(K, 'ff-carpet', 512, 512, (c, w, h) => { const r = K.rng(9); c.fillStyle = '#5b6066'; c.fillRect(0, 0, w, h); noise(c, w, h, r, 30000, 0.22, 2); });
    const bump = tex(K, 'ff-carpetb', 512, 512, (c, w, h) => { const r = K.rng(10); c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); noise(c, w, h, r, 30000, 0.5, 2); }, false);
    return { map, bump, bumpScale: 3, rough: 1, tile: 0.8, sheen: true, pbr: { set: 'carpet', tile: 0.6 } };
  }
  function polished(K) {
    const map = tex(K, 'ff-polished', 1024, 1024, (c, w, h) => {
      const r = K.rng(13);
      c.fillStyle = '#7c807f'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '50,52,52' : '160,162,160'},${0.04 + r() * 0.06})`; c.beginPath(); c.arc(r() * w, r() * h, 30 + r() * 150, 0, TAU); c.fill(); }
      noise(c, w, h, r, 20000, 0.12, 1.5);
      c.fillStyle = 'rgba(30,30,30,.6)'; c.fillRect(0, 0, w, 3); c.fillRect(0, 0, 3, h);
    });
    return { map, rough: 0.28, metal: 0.05, tile: 3, pbr: { set: 'polished', tile: 2.5, rough: 0.35 } };
  }
  function terrazzo(K) {
    const map = tex(K, 'ff-terrazzo', 1024, 1024, (c, w, h) => {
      const r = K.rng(23);
      c.fillStyle = '#eee6d8'; c.fillRect(0, 0, w, h);
      const cols = ['#e07a5f', '#3d9a8b', '#f2cc8f', '#81b29a', '#5c5470', '#c9c2b4'];
      for (let i = 0; i < 900; i++) {
        c.fillStyle = cols[r() * cols.length | 0]; c.beginPath();
        const x = r() * w, y = r() * h, s = 3 + r() * 13, n = 5 + (r() * 3 | 0);
        for (let k = 0; k < n; k++) { const a = k / n * TAU + r() * 0.5, rr = s * (0.6 + r() * 0.5); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        c.fill();
      }
    });
    return { map, rough: 0.35, tile: 1.5 };
  }
  function neonGrid(K) {
    const map = tex(K, 'ff-neon', 512, 512, (c, w, h) => { c.fillStyle = '#07090f'; c.fillRect(0, 0, w, h); c.fillStyle = '#0d1220'; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) c.fillRect(x * w / 2 + 6, y * h / 2 + 6, w / 2 - 12, h / 2 - 12); });
    const em = tex(K, 'ff-neone', 512, 512, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3ee6ff'; c.lineWidth = 3; c.shadowColor = '#3ee6ff'; c.shadowBlur = 10;
      for (let i = 0; i <= 2; i++) { c.beginPath(); c.moveTo(i * w / 2, 0); c.lineTo(i * w / 2, h); c.moveTo(0, i * h / 2); c.lineTo(w, i * h / 2); c.stroke(); }
    });
    return { map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: 1.4, rough: 0.2, metal: 0.3, tile: 1,
      tick: (m, t) => { m.emissiveIntensity = 1.1 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.6)); } };
  }

  const WALLS = [
    ['wall-plaster', 'Green plaster', 0, paint('#34403a', 0.92), true],
    ['wall-cream', 'Cream paint', 300, paint('#d9cfbd')],
    ['wall-sky', 'Sky blue paint', 300, paint('#a9c6d8')],
    ['wall-blush', 'Blush paint', 300, paint('#e2b3ae')],
    ['wall-navy', 'Navy paint', 400, paint('#24304a')],
    ['wall-charcoal', 'Charcoal paint', 400, paint('#24282a')],
    ['wall-stripes', 'Sage stripes', 600, onPlaster(stripes)],
    ['wall-dots', 'Pink polka dots', 600, onPlaster(dots)],
    ['wall-retro', '70s waves', 900, onPlaster(retro)],
    ['wall-panel', 'Oak panels', 1200, panel],
    ['wall-subway', 'White subway tiles', 1200, subway],
    ['wall-brick', 'Red brick', 1400, brick],
    ['wall-concrete', 'Raw concrete', 1400, concrete],
    ['wall-hex', 'Glowing hex', 2200, onPlaster(hex)],
    ['wall-stars', 'Night sky', 2500, onPlaster(starry)],
  ];
  const FLOORS = [
    ['floor-oak', 'Oak planks', 0, K => ({ map: K.floorTex(), bump: K.floorBump(), bumpScale: 1.2, rough: 0.48, tile: 2, pbr: { set: 'oak', tile: 2, rough: 0.8 } }), true],
    ['floor-ash', 'Pale ash planks', 900, K => planks(K, 'ash', 'ash')],
    ['floor-walnut', 'Walnut planks', 1200, K => planks(K, 'walnut', 'walnut')],
    ['floor-herring', 'Herringbone oak', 1800, herringbone],
    ['floor-carpet', 'Grey carpet', 800, carpet],
    ['floor-polished', 'Polished concrete', 1200, polished],
    ['floor-checker', 'Checkerboard', 1400, checker],
    ['floor-terrazzo', 'Terrazzo', 1600, terrazzo],
    ['floor-marble', 'Marble tiles', 2400, marble],
    ['floor-neon', 'Neon grid', 3000, neonGrid],
  ];

  // The material for a finish. repeat is how many texture copies fit across the surface's uv.
  function finishMat(K, id, kind, repeatU = 1, repeatV = 1, hd = false) {
    const it = RoomItems.get(id);
    const f = it && it.finish && it.finish.kind === kind ? it.finish : RoomItems.get(kind === 'wall' ? 'wall-plaster' : 'floor-oak').finish;
    const o = f.make(K);
    const THREE = K.THREE;
    const rep = t => { if (!t) return null; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(repeatU / o.tile, repeatV / o.tile); c.needsUpdate = true; return c; };
    const m = new (o.sheen ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({
      color: o.color || '#ffffff', map: rep(o.map), bumpMap: rep(o.bump), bumpScale: o.bumpScale || 1,
      roughness: o.rough ?? 0.8, metalness: o.metal || 0,
      emissive: o.emissive || '#000000', emissiveMap: rep(o.emissiveMap), emissiveIntensity: o.emissiveIntensity || 0,
      ...(o.sheen ? { sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#9aa0a6') } : {}),
    });
    m.userData.tick = o.tick || null;
    // the room page swaps in the high-detail texture set once it has loaded; shop pictures keep the drawn one
    if (hd && o.pbr) K.hdSet(o.pbr.set).then(t => {
      const pt = o.pbr.tile || o.tile, c = x => { const y = x.clone(); y.repeat.set(repeatU / pt, repeatV / pt); y.needsUpdate = true; return y; };
      if (o.pbr.map !== false) m.map = c(t.map);
      m.normalMap = c(t.normal); m.normalScale.setScalar(o.pbr.normal ?? 1);
      m.roughnessMap = c(t.orm); m.roughness = o.pbr.rough ?? 1;
      m.bumpMap = null; m.needsUpdate = true;
    }).catch(() => {});
    return m;
  }

  // a corner of a room for the shop picture: the finish on two walls or on the floor
  function corner(K, id, kind) {
    const THREE = K.THREE, g = K.group();
    const wallM = kind === 'wall' ? finishMat(K, id, 'wall', 1.2, 1.2) : K.std('#2a332e', 0.9);
    const floorM = kind === 'floor' ? finishMat(K, id, 'floor', 1.2, 1.2) : K.std('#3b3127', 0.8);
    const f = K.mesh(new THREE.PlaneGeometry(1.2, 1.2), floorM); f.rotation.x = -Math.PI / 2; f.position.set(0.6, 0.01, 0.6); g.add(f);
    const b = K.mesh(new THREE.PlaneGeometry(1.2, 1.2), wallM); b.position.set(0.6, 0.6, 0); g.add(b);
    const l = K.mesh(new THREE.PlaneGeometry(1.2, 1.2), wallM); l.rotation.y = Math.PI / 2; l.position.set(0, 0.6, 0.6); g.add(l);
    g.position.set(-0.6, 0, -0.6);
    return K.group(g);
  }

  // ---------------------------------------------------------------- beds and sofas
  function sofa(K, o = {}) {
    const g = K.group();
    const W = o.w || 1.8, D = 0.88, fab = K.fabric(o.color || '#7f9c8a'), legM = K.wood('walnut');
    const base = K.rbox(W, 0.22, D, 0.05, fab); base.position.y = 0.23; g.add(base);
    const back = K.rbox(W, 0.42, 0.2, 0.08, fab); back.position.set(0, 0.52, -D / 2 + 0.1); back.rotation.x = -0.08; g.add(back);
    for (const sx of [-1, 1]) { if (o.noRight && sx > 0) continue; const arm = K.rbox(0.18, 0.36, D, 0.07, fab); arm.position.set(sx * (W / 2 - 0.09), 0.44, 0); g.add(arm); }
    const n = W > 2 ? 3 : 2, cw = (W - 0.36) / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.18 + cw * (i + 0.5);
      const seat = K.cushion(cw - 0.01, D - 0.24, 0.13, fab, { puff: 0.8 }); seat.rotation.x = -Math.PI / 2; seat.position.set(x, 0.4, 0.07); g.add(seat);
      const bc = K.cushion(cw - 0.03, 0.42, 0.14, fab, { puff: 0.9 }); bc.position.set(x, 0.62, -D / 2 + 0.25); bc.rotation.x = -0.15; g.add(bc);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = K.cyl(0.02, 0.014, 0.12, legM, 12); leg.position.set(sx * (W / 2 - 0.08), 0.06, sz * (D / 2 - 0.08)); leg.rotation.z = sx * 0.12; g.add(leg); }
    if (o.pillow) for (const sx of [-1, 1]) { const p = K.cushion(0.36, 0.36, 0.12, K.fabric(o.pillow), { puff: 1.2 }); p.position.set(sx * (W / 2 - 0.36), 0.62, -D / 2 + 0.38); p.rotation.set(-0.2, -sx * 0.25, sx * 0.1); g.add(p); }
    return g;
  }
  function cornerSofa(K) {
    const g = K.group();
    const fab = K.fabric('#5b6168'), legM = K.std('#151617', 0.5, 0.4);
    const A = 2.3, B = 1.6, D = 0.9;
    // long side along the back (z = -?), chaise along +x side towards +z
    const s1 = sofa(K, { w: A, color: '#5b6168', noRight: true });
    s1.position.set(0, 0, -(B - D) / 2); g.add(s1);
    const ch = K.group();
    const base = K.rbox(D, 0.22, B - D + 0.02, 0.05, fab); base.position.set(0, 0.23, 0); ch.add(base);
    const seat = K.cushion(D - 0.2, B - D - 0.04, 0.13, fab, { puff: 0.8 }); seat.rotation.x = -Math.PI / 2; seat.position.set(-0.05, 0.4, 0); ch.add(seat);
    const arm = K.rbox(0.18, 0.36, B - D + 0.02, 0.07, fab); arm.position.set(D / 2 - 0.09, 0.44, 0); ch.add(arm);
    for (const sz of [-1, 1]) { const leg = K.cyl(0.02, 0.014, 0.12, legM, 12); leg.position.set(D / 2 - 0.08, 0.06, sz * ((B - D) / 2 - 0.05)); ch.add(leg); }
    ch.position.set(A / 2 - D / 2, 0, B / 2 - (B - D) / 2 + 0.0); g.add(ch);
    for (const [x, c] of [[-A / 2 + 0.35, '#e0a458'], [0.15, '#9fb7d9']]) { const p = K.cushion(0.38, 0.38, 0.12, K.fabric(c), { puff: 1.2 }); p.position.set(x, 0.63, -B / 2 + 0.34); p.rotation.x = -0.25; g.add(p); }
    return g;
  }
  // a sheet laid over a box W wide and L long: flat on top, rolling over the long sides and the
  // foot end (+z) and hanging down drop metres, with small wrinkles
  function duvetGeo(K, W, L, drop) {
    const THREE = K.THREE, rr = 0.05, hang = drop + rr * Math.PI / 2;
    const geo = new THREE.PlaneGeometry(W + 2 * hang, L + hang, 80, 60); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, hang / 2);
    const p = geo.attributes.position;
    const fold = d => d <= 0 ? [0, 0] : d < rr * Math.PI / 2 ? [rr * Math.sin(d / rr), rr * (1 - Math.cos(d / rr))] : [rr + 0.006 * (d - rr * Math.PI / 2), rr + (d - rr * Math.PI / 2)];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), dx = Math.abs(x) - W / 2, dz = z - L / 2;
      const [ox, yx] = fold(dx), [oz, yz] = fold(dz);
      let nx = dx > 0 ? Math.sign(x) * (W / 2 + ox) : x, nz = dz > 0 ? L / 2 + oz : z, y = -Math.max(yx, yz);
      const top = dx <= 0 && dz <= 0;
      y += top ? 0.008 * Math.sin(x * 23 + z * 5) * Math.sin(z * 11) : 0;
      if (!top) { const ripple = 0.012 * Math.sin((dx > 0 ? z : x) * 28) * Math.min(1, Math.max(yx, yz) / 0.1); if (dx > dz) nx += Math.sign(x) * ripple; else nz += ripple; }
      p.setXYZ(i, nx, y, nz);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function bed(K, o) {
    const g = K.group();
    const W = o.w, L = 2.05, wood = K.wood(o.wood || 'oak');
    const frame = K.rbox(W + 0.06, 0.2, L, 0.02, wood); frame.position.set(0, 0.2, 0); g.add(frame);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = K.rbox(0.06, 0.12, 0.06, 0.01, wood); leg.position.set(sx * (W / 2 - 0.02), 0.06, sz * (L / 2 - 0.05)); g.add(leg); }
    const mat = K.rbox(W - 0.02, 0.2, L - 0.06, 0.06, K.fabric('#f1efe9', 0.6)); mat.position.set(0, 0.4, 0.02); g.add(mat);
    if (o.head === 'pad') {
      const hb = K.cushion(W + 0.1, 0.75, 0.12, K.fabric(o.headColor || '#4c5a6e'), { puff: 0.6 }); hb.position.set(0, 0.75, -L / 2 - 0.02); g.add(hb);
      for (let i = 0; i < Math.round(W / 0.2); i++) { const b = K.sph(0.012, K.fabric(o.headColor || '#4c5a6e'), 8, 6); b.position.set(-W / 2 + 0.1 + i * 0.2, 0.85, -L / 2 + 0.045); g.add(b); }
    } else {
      const hb = K.rbox(W + 0.06, 0.55, 0.05, 0.015, wood); hb.position.set(0, 0.55, -L / 2 + 0.02); g.add(hb);
    }
    // duvet: a soft slab that drapes over the sides
    // the duvet lies on the mattress and falls over the sides and the foot, with soft wrinkles
    const duv = K.mesh(duvetGeo(K, W + 0.04, L * 0.7, 0.2), K.memo('duvet|' + o.duvet, () => { const m = K.fabric(o.duvet).clone(); m.side = K.THREE.DoubleSide; return m; }));
    duv.position.set(0, 0.555, L * 0.15); g.add(duv);
    const stitch = K.memo('stitch|' + o.duvet, () => new K.THREE.MeshStandardMaterial({ color: new K.THREE.Color(o.duvet).multiplyScalar(0.8), roughness: 1 }));
    for (let i = 1; i < 4; i++) { const st = K.box(W + 0.02, 0.002, 0.004, stitch); st.position.set(0, 0.558 + 0.004 * Math.sin(i * 2.1), L * 0.15 - L * 0.35 + i * L * 0.7 / 4); g.add(st); }
    const fold = K.cushion(W + 0.04, 0.22, 0.06, K.fabric(o.fold || '#f6f4ee'), { puff: 0.8 }); fold.rotation.x = -Math.PI / 2; fold.position.set(0, 0.57, L * 0.15 - L * 0.34 + 0.08); g.add(fold);
    const np = Math.max(1, Math.round(W / 0.75));
    for (let i = 0; i < np; i++) { const p = K.cushion(Math.min(0.62, W / np - 0.08), 0.42, 0.13, K.fabric('#fbfaf6'), { puff: 1.3 }); p.rotation.x = -Math.PI / 2 + 0.35; p.position.set(-W / 2 + W / np * (i + 0.5), 0.58, -L / 2 + 0.3); g.add(p); }
    if (o.plush) { const pl = K.cushion(0.3, 0.3, 0.1, K.fabric(o.plush), { puff: 1.3 }); pl.rotation.set(-0.4, 0.3, 0.2); pl.position.set(W * 0.22, 0.66, -L / 2 + 0.52); g.add(pl); }
    return g;
  }

  // ---------------------------------------------------------------- chairs
  function armchair(K) {
    const g = K.group();
    const fab = K.fabric('#2f7d7a'), legM = K.wood('walnut');
    const seat = K.cushion(0.6, 0.55, 0.14, fab, { puff: 0.8 }); seat.rotation.x = -Math.PI / 2; seat.position.set(0, 0.42, 0.05); g.add(seat);
    const base = K.rbox(0.62, 0.14, 0.62, 0.04, fab); base.position.set(0, 0.3, 0); g.add(base);
    const back = K.cushion(0.78, 0.6, 0.14, fab, { bend: 0.12, puff: 0.7 }); back.position.set(0, 0.68, -0.28); back.rotation.x = -0.18; g.add(back);
    for (const sx of [-1, 1]) {
      const arm = K.rbox(0.12, 0.3, 0.6, 0.05, fab); arm.position.set(sx * 0.36, 0.45, 0); arm.rotation.z = sx * 0.06; g.add(arm);
      for (const sz of [-1, 1]) { const leg = K.cyl(0.018, 0.012, 0.24, legM, 10); leg.position.set(sx * 0.3, 0.12, sz * 0.27); leg.rotation.set(sz * 0.15, 0, -sx * 0.15); g.add(leg); }
    }
    return g;
  }
  function stool(K) {
    const g = K.group();
    const wood = K.wood('oak'), metal = K.std('#1b1c1e', 0.4, 0.7);
    const top = K.cyl(0.18, 0.17, 0.04, wood, 32); top.position.y = 0.66; g.add(top);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; const leg = K.cyl(0.012, 0.012, 0.68, metal, 8); leg.position.set(Math.cos(a) * 0.14, 0.33, Math.sin(a) * 0.14); leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); g.add(leg); }
    const ring = K.torus(0.165, 0.008, metal); ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; g.add(ring);
    return g;
  }
  function eggChair(K) {
    const g = K.group();
    const metal = K.std('#202224', 0.35, 0.8), rattan = K.memo('rattan', () => { const t = rattanTex(K).clone(); t.wrapS = t.wrapT = K.THREE.RepeatWrapping; t.repeat.set(6, 4); t.needsUpdate = true; return new K.THREE.MeshStandardMaterial({ map: t, color: '#e0bf8a', roughness: 0.8, side: K.THREE.DoubleSide }); });
    const base = K.cyl(0.3, 0.33, 0.04, metal, 40); base.position.y = 0.02; g.add(base);
    g.add(K.tube([[0, 0.04, -0.15], [0, 1.2, -0.3], [0, 1.85, -0.05], [0, 1.85, 0.12], [0, 1.78, 0.12]], 0.025, metal, 64, 10));
    const pod = K.group(); pod.position.set(0, 1.74, 0.12); g.add(pod);
    const chain = K.cyl(0.006, 0.006, 0.2, metal, 6); chain.position.y = -0.1; pod.add(chain);
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([Math.sin(t * Math.PI) * 0.45 * (1 - 0.25 * t), -0.2 - t * 1.05]); }
    const shellGeo = new K.THREE.LatheGeometry(pts.map(p => new K.THREE.Vector2(p[0], p[1])), 48, Math.PI * 0.22, Math.PI * 1.56);
    const shell = K.mesh(shellGeo, rattan); pod.add(shell);
    const cush = K.cushion(0.6, 0.5, 0.14, K.fabric('#f2efe6'), { puff: 1 }); cush.rotation.x = -Math.PI / 2; cush.position.set(0, -0.98, 0.05); pod.add(cush);
    const bc = K.cushion(0.5, 0.5, 0.14, K.fabric('#f2efe6'), { puff: 1.1 }); bc.position.set(0, -0.68, -0.24); bc.rotation.x = -0.25; pod.add(bc);
    const pl = K.cushion(0.28, 0.28, 0.1, K.fabric('#e0a458'), { puff: 1.3 }); pl.position.set(0.12, -0.8, -0.1); pl.rotation.set(-0.3, -0.3, 0.2); pod.add(pl);
    g.userData.tick = t => { pod.rotation.z = Math.sin(t * 0.6) * 0.03; pod.rotation.y = Math.sin(t * 0.43) * 0.05; };
    return g;
  }
  function rattanTex(K) {
    // a fine basket weave: 16 by 16 cells, each two strands over, two under
    return tex(K, 'rattan', 512, 512, (c, w, h) => {
      const n = 16, u = w / n, r = K.rng(8);
      c.fillStyle = '#3a2412'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const t = r(), across = (x + y) % 2 === 0;
        const g = c.createLinearGradient(x * u, y * u, across ? x * u : (x + 1) * u, across ? (y + 1) * u : y * u);
        const base = `rgb(${200 + t * 30 | 0},${158 + t * 24 | 0},${100 + t * 18 | 0})`;
        g.addColorStop(0, '#7a5530'); g.addColorStop(0.25, base); g.addColorStop(0.75, base); g.addColorStop(1, '#7a5530');
        c.fillStyle = g;
        for (let k = 0; k < 2; k++) {
          if (across) c.fillRect(x * u + 1, y * u + 2 + k * u / 2, u - 2, u / 2 - 4);
          else c.fillRect(x * u + 2 + k * u / 2, y * u + 1, u / 2 - 4, u - 2);
        }
      }
    });
  }
  function pouf(K) {
    const g = K.group(), THREE = K.THREE;
    // chunky knit: twelve cable ridges running top to bottom, each a twist of two strands
    const geo = new THREE.SphereGeometry(0.25, 96, 48), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const cable = Math.abs(Math.cos(a * 12)), twist = 0.5 + 0.5 * Math.sin(y * 60 + (Math.cos(a * 24) > 0 ? 0 : Math.PI));
      const k = 1 + 0.035 * cable + 0.012 * twist * cable;
      p.setXYZ(i, x * k, Math.max(-0.17, Math.min(0.17, y * 0.8)), z * k);
    }
    geo.computeVertexNormals();
    const m = K.mesh(geo, K.memo('poufknit', () => new THREE.MeshPhysicalMaterial({ color: '#d9a24a', roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffe2a8') })));
    m.position.y = 0.17; g.add(m);
    return g;
  }
  function cubeShelf(K) {
    const g = K.group(), W = 1.1, H = 1.1, D = 0.36, t = 0.025;
    const m = K.std('#efeee9', 0.55);
    for (let i = 0; i <= 3; i++) { const v = K.box(t, H, D, m); v.position.set(-W / 2 + t / 2 + i * (W - t) / 3, H / 2, 0); g.add(v); const hz = K.box(W, t, D, m); hz.position.set(0, t / 2 + i * (H - t) / 3, 0); g.add(hz); }
    const back = K.box(W, H, 0.006, K.std('#dcdad3', 0.7)); back.position.set(0, H / 2, -D / 2); g.add(back);
    const r = K.rng(12), cw = (W - t) / 3;
    const fill = [['books'], ['basket', '#c9a066'], ['plant'], ['basket', '#7f9c8a'], ['books'], ['bowl'], ['books'], ['vinyl'], ['basket', '#e2b3ae']];
    fill.forEach(([kind, col], i) => {
      const cx = -W / 2 + t + cw * (i % 3) + cw / 2 - t / 2, y0 = t + (2 - Math.floor(i / 3)) * (H - t) / 3;
      if (kind === 'books') P().bookRows(K, g, cx - cw / 2 + 0.03, cx + cw / 2 - 0.03, y0, D * 0.75, r);
      else if (kind === 'basket') { const b = K.rbox(cw - 0.05, (H - t) / 3 - 0.05, D - 0.04, 0.02, K.memo('basket|' + col, () => new K.THREE.MeshStandardMaterial({ color: col, map: rattanTex(K), roughness: 0.85 }))); b.position.set(cx, y0 + ((H - t) / 3 - 0.05) / 2, 0.01); g.add(b); }
      else if (kind === 'plant') { const p = P().cactus(K); p.scale.setScalar(1.5); p.position.set(cx, y0, 0); g.add(p); }
      else if (kind === 'bowl') { const b = K.lathe([[0, 0], [0.08, 0], [0.12, 0.06], [0.115, 0.065], [0.075, 0.008], [0, 0.008]], K.plastic('#2f7d7a', 0.3), 40); b.position.set(cx, y0, 0); g.add(b); }
      else { for (let k = 0; k < 7; k++) { const v = K.box(0.006, 0.3, 0.3, K.std(['#111', '#d9792b', '#222', '#3d9a8b', '#151515', '#e8a93a', '#1a1a1a'][k], 0.5)); v.position.set(cx - 0.1 + k * 0.03, y0 + 0.15, 0); v.rotation.z = k === 6 ? -0.2 : 0; g.add(v); } }
    });
    return g;
  }
  function ladderShelf(K) {
    const g = K.group(), H = 1.75, wood = K.wood('ash');
    const lean = 0.18;
    for (const sx of [-1, 1]) { const rail = K.rbox(0.04, H, 0.03, 0.006, wood); rail.position.set(sx * 0.3, H / 2 * Math.cos(lean), 0.02); rail.rotation.x = -lean; g.add(rail); }
    const r = K.rng(4);
    const levels = [[0.3, 0.4], [0.7, 0.32], [1.1, 0.24], [1.45, 0.17]];
    levels.forEach(([y, d], i) => {
      const z = 0.2 - y * Math.tan(lean) + 0.05;
      const s = K.rbox(0.58, 0.022, d, 0.004, wood); s.position.set(0, y, z - d / 2 + 0.03); g.add(s);
      if (i === 0) { const p = P().snakePlant(K); p.scale.setScalar(0.45); p.position.set(0.14, y + 0.011, z - d / 2 + 0.03); g.add(p); P().bookRows(K, g, -0.27, -0.02, y + 0.011, d * 0.7, r, z - d / 2 + 0.03); }
      else if (i === 1) P().bookRows(K, g, -0.26, 0.26, y + 0.011, d * 0.8, r, z - d / 2 + 0.03);
      else if (i === 2) { const st = P().books(K, [[0.2, 0.03, 0.15, '#7c2f28'], [0.18, 0.025, 0.14, '#c7c1b2'], [0.19, 0.035, 0.13, '#1e3a2c']], r); st.position.set(-0.1, y + 0.011, z - d / 2 + 0.03); g.add(st); const c = P().cactus(K); c.position.set(0.15, y + 0.011, z - d / 2 + 0.03); g.add(c); }
      else { const v = K.lathe([[0, 0], [0.04, 0], [0.05, 0.08], [0.025, 0.16], [0.03, 0.18], [0, 0.18]], K.plastic('#e8e3d6', 0.3), 32); v.position.set(0, y + 0.011, z - d / 2 + 0.03); g.add(v); }
    });
    return g;
  }
  function bookTower(K) {
    const r = K.rng(19), cols = ['#1e3a2c', '#c7c1b2', '#7c2f28', '#2b2f3a', '#d6b26a', '#3a5a48', '#4a2f45', '#e6e2d6', '#2f7d7a', '#d9792b'];
    const list = []; for (let i = 0; i < 14; i++) list.push([0.2 + r() * 0.1, 0.025 + r() * 0.03, 0.15 + r() * 0.06, cols[r() * cols.length | 0]]);
    const g = P().books(K, list, r);
    const top = g.userData.height;
    const c = P().cactus(K); c.position.set(0, top, 0); g.add(c);
    return g;
  }
  function bookLedge(K) {
    const g = K.group(), W = 1.0, D = 0.16, wood = K.wood('walnut');
    const s = K.rbox(W, 0.03, D, 0.005, wood); s.position.set(0, 0.015, D / 2); g.add(s);
    const lip = K.rbox(W, 0.05, 0.015, 0.004, wood); lip.position.set(0, 0.04, D - 0.008); g.add(lip);
    const r = K.rng(29);
    P().bookRows(K, g, -W / 2 + 0.02, 0.15, 0.03, D * 0.8, r, D / 2 - 0.01);
    for (const sx of [-1, 1]) { const end = K.rbox(0.015, 0.14, 0.1, 0.004, K.std('#1b1c1e', 0.4, 0.7)); end.position.set(sx > 0 ? 0.17 : -W / 2 + 0.005, 0.1, D / 2); g.add(end); }
    const st = P().books(K, [[0.2, 0.03, 0.14, '#2f7d7a'], [0.18, 0.025, 0.13, '#e6e2d6']], r); st.position.set(0.33, 0.03, D / 2); g.add(st);
    return g;
  }

  // ---------------------------------------------------------------- tables
  function nightstand(K) {
    const g = K.group(), wood = K.wood('oak');
    const body = K.rbox(0.46, 0.48, 0.4, 0.01, wood); body.position.y = 0.32; g.add(body);
    const drawer = K.rbox(0.42, 0.18, 0.01, 0.004, K.wood('ash')); drawer.position.set(0, 0.44, 0.2); g.add(drawer);
    const knob = K.sph(0.014, K.std('#c9a24a', 0.3, 1), 12, 8); knob.position.set(0, 0.44, 0.215); g.add(knob);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = K.cyl(0.015, 0.012, 0.08, K.std('#1b1c1e', 0.5, 0.5), 10); l.position.set(sx * 0.19, 0.04, sz * 0.15); g.add(l); }
    return g;
  }
  function sideTable(K) {
    const g = K.group();
    const top = K.cyl(0.25, 0.25, 0.025, K.std('#e9e7e2', 0.15), 48); top.position.y = 0.52; g.add(top);
    const stem = K.cyl(0.025, 0.025, 0.5, K.std('#c9a24a', 0.25, 1), 16); stem.position.y = 0.26; g.add(stem);
    const base = K.cyl(0.17, 0.18, 0.02, K.std('#c9a24a', 0.25, 1), 40); base.position.y = 0.01; g.add(base);
    return g;
  }
  function miniFridge(K) {
    const g = K.group();
    const body = K.rbox(0.48, 0.82, 0.5, 0.03, K.plastic('#e8e3d6', 0.35)); body.position.y = 0.43; g.add(body);
    const door = K.rbox(0.47, 0.8, 0.02, 0.02, K.plastic('#f2ede0', 0.3)); door.position.set(0, 0.43, 0.255); g.add(door);
    const h = K.rbox(0.02, 0.3, 0.03, 0.008, K.std('#c9ccd2', 0.2, 1)); h.position.set(0.19, 0.55, 0.28); g.add(h);
    const logo = K.box(0.12, 0.02, 0.002, K.glow('#3ee6ff', 2)); logo.position.set(-0.1, 0.78, 0.267); g.add(logo);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const f = K.cyl(0.02, 0.02, 0.02, K.std('#222', 0.6), 10); f.position.set(sx * 0.2, 0.01, sz * 0.2); g.add(f); }
    return g;
  }

  // ---------------------------------------------------------------- things that move
  function aquarium(K) {
    const g = K.group(), THREE = K.THREE, W = 1.0, D = 0.4, TH = 0.5;
    const cab = K.rbox(W + 0.04, 0.7, D + 0.04, 0.012, K.wood('black')); cab.position.y = 0.35; g.add(cab);
    for (const sx of [-1, 1]) {
      const dr = K.rbox(W / 2 - 0.03, 0.6, 0.012, 0.004, K.std('#1d2022', 0.35, 0.3)); dr.position.set(sx * W / 4, 0.36, D / 2 + 0.024); g.add(dr);
      const hd = K.rbox(0.012, 0.12, 0.02, 0.004, K.std('#c9ccd2', 0.2, 1)); hd.position.set(sx * 0.03, 0.42, D / 2 + 0.04); g.add(hd);
    }
    const y0 = 0.71, IN = 0.012;
    // a painted blue backdrop on the back glass, so the tank reads as deep water
    const bg = tex(K, 'aqback', 512, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a8fd0'); gr.addColorStop(1, '#0a2c52'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      const r = K.rng(4); c.fillStyle = 'rgba(10,40,70,.6)';
      for (let i = 0; i < 9; i++) { const x = r() * w, hh = h * (0.3 + r() * 0.5); c.beginPath(); c.moveTo(x - 20, h); c.quadraticCurveTo(x + (r() - 0.5) * 40, h - hh, x + 6, h - hh); c.quadraticCurveTo(x + 10, h - hh * 0.5, x + 24, h); c.fill(); }
    });
    const back = K.mesh(new THREE.PlaneGeometry(W - IN * 2, TH - 0.02), K.memo('aqbackm', () => new THREE.MeshBasicMaterial({ map: bg, color: new THREE.Color(0.75, 0.85, 1) }))); back.position.set(0, y0 + TH / 2, -D / 2 + IN); g.add(back);
    const water = K.memo('aqwater2', () => new THREE.MeshPhysicalMaterial({ color: '#4fb0e8', transparent: true, opacity: 0.16, roughness: 0.02, depthWrite: false, emissive: '#0d4a78', emissiveIntensity: 0.25 }));
    const w = K.box(W - IN * 2, TH - 0.06, D - IN * 2, water); w.position.y = y0 + (TH - 0.06) / 2; g.add(w);
    const surf = K.mesh(new THREE.PlaneGeometry(W - IN * 2, D - IN * 2, 24, 10), K.memo('aqsurf', () => new THREE.MeshPhysicalMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })));
    surf.rotation.x = -Math.PI / 2; surf.position.y = y0 + TH - 0.06; g.add(surf);
    const glass = K.box(W, TH, D, K.glass('#cfe8f0', 0.08)); glass.position.y = y0 + TH / 2; g.add(glass);
    const frameM = K.std('#111', 0.4, 0.5);
    for (const y of [y0, y0 + TH]) for (const sz of [-1, 1]) { const b = K.box(W, 0.014, 0.014, frameM); b.position.set(0, y, sz * D / 2); g.add(b); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b = K.box(0.014, TH, 0.014, frameM); b.position.set(sx * W / 2, y0 + TH / 2, sz * D / 2); g.add(b); }
    const lid = K.rbox(W + 0.012, 0.05, D + 0.012, 0.01, frameM); lid.position.y = y0 + TH + 0.025; g.add(lid);
    const strip = K.box(W - 0.1, 0.004, 0.04, K.glow('#d6f0ff', 3)); strip.position.set(0, y0 + TH - 0.001, 0); g.add(strip);
    // sand with ripples, and light that wobbles across it (caustics)
    const sandT = tex(K, 'aqsand', 256, 128, (c, w2, h2) => { const r = K.rng(2); c.fillStyle = '#c9b48a'; c.fillRect(0, 0, w2, h2); noise(c, w2, h2, r, 4000, 0.25, 1.5); });
    const sandG = new THREE.PlaneGeometry(W - IN * 2, D - IN * 2, 40, 16), sp = sandG.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), yy = sp.getY(i); sp.setZ(i, 0.04 + 0.012 * Math.sin(x * 22 + yy * 6) + 0.03 * (0.5 - yy / D)); }
    sandG.computeVertexNormals();
    const cau = tex(K, 'aqcaustic', 256, 256, (c, w2, h2) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w2, h2); c.strokeStyle = 'rgba(200,240,255,.55)'; c.lineWidth = 2.5; const r = K.rng(12);
      for (let i = 0; i < 40; i++) { const x = r() * w2, y = r() * h2, rr = 14 + r() * 22; c.beginPath(); for (let k = 0; k <= 7; k++) { const a = k / 7 * TAU, q = rr * (0.7 + 0.3 * Math.sin(a * 3 + i)); c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.stroke(); }
    });
    const caus = cau.clone(); caus.wrapS = caus.wrapT = THREE.RepeatWrapping; caus.repeat.set(3, 1.2); caus.needsUpdate = true;
    const sandM = new THREE.MeshStandardMaterial({ map: sandT, roughness: 0.95, emissive: '#9fdcff', emissiveMap: caus, emissiveIntensity: 0.5 });
    const sand = K.mesh(sandG, sandM); sand.rotation.x = -Math.PI / 2; sand.position.y = y0; g.add(sand);
    const r = K.rng(6);
    // stones, a piece of driftwood and a little castle
    for (let i = 0; i < 9; i++) { const st = K.mesh(new THREE.IcosahedronGeometry(0.025 + r() * 0.035, 1), K.std(['#6b6e70', '#8a8478', '#4f5254', '#a39c8c'][i % 4], 0.9)); st.scale.set(1.2, 0.55 + r() * 0.3, 1); st.rotation.y = r() * TAU; st.position.set((r() - 0.5) * (W - 0.12), y0 + 0.05, (r() - 0.5) * (D - 0.12)); g.add(st); }
    g.add(K.put(K.tube([[-0.32, y0 + 0.05, 0.02], [-0.2, y0 + 0.1, -0.03], [-0.06, y0 + 0.12, 0.0], [0.04, y0 + 0.2, -0.04]], 0.018, K.wood('walnut'), 24, 8)));
    const castle = K.group(); castle.position.set(0.3, y0 + 0.05, -0.08); g.add(castle);
    const stone = K.std('#b6ab96', 0.9);
    castle.add(K.put(K.box(0.12, 0.1, 0.08, stone), 0, 0.05, 0));
    for (const [x, hgt] of [[-0.06, 0.16], [0.06, 0.13]]) { castle.add(K.put(K.cyl(0.028, 0.03, hgt, stone, 12), x, hgt / 2, 0)); castle.add(K.put(K.mesh(new THREE.ConeGeometry(0.034, 0.05, 12), K.std('#8a3b2e', 0.7)), x, hgt + 0.025, 0)); }
    castle.add(K.put(K.box(0.03, 0.045, 0.005, K.std('#1b1410', 0.9)), 0, 0.023, 0.041));
    // plants: blades that curl and sway, in clumps
    const weeds = [], wm = K.memo('weed2', () => new THREE.MeshStandardMaterial({ color: '#3fa463', roughness: 0.6, side: THREE.DoubleSide }));
    const wm2 = K.memo('weed3', () => new THREE.MeshStandardMaterial({ color: '#6fcf5a', roughness: 0.6, side: THREE.DoubleSide }));
    for (const [cx, cz, n] of [[-0.38, -0.1, 7], [-0.1, -0.12, 5], [0.12, -0.1, 6], [0.42, 0.05, 4]]) for (let i = 0; i < n; i++) {
      const h = 0.14 + r() * 0.26, geo = new THREE.PlaneGeometry(0.022 + r() * 0.012, h, 1, 8); geo.translate(0, h / 2, 0);
      const gp = geo.attributes.position; for (let k = 0; k < gp.count; k++) { const yy = gp.getY(k) / h; gp.setX(k, gp.getX(k) * (1 - yy * 0.6)); gp.setZ(k, yy * yy * 0.03); }
      geo.computeVertexNormals();
      const m = K.mesh(geo, r() < 0.6 ? wm : wm2); m.position.set(cx + (r() - 0.5) * 0.08, y0 + 0.05, cz + (r() - 0.5) * 0.06); m.rotation.y = r() * TAU; g.add(m); weeds.push({ m, ph: r() * 9 });
    }
    // fish: a body with a fan tail, a dorsal fin and eyes; they turn round smoothly at the glass
    const tailShape = new THREE.Shape(); tailShape.moveTo(0, 0); tailShape.quadraticCurveTo(-0.02, 0.02, -0.035, 0.022); tailShape.quadraticCurveTo(-0.026, 0, -0.035, -0.022); tailShape.quadraticCurveTo(-0.02, -0.02, 0, 0);
    const tailGeo = new THREE.ShapeGeometry(tailShape, 8);
    const finShape = new THREE.Shape(); finShape.moveTo(-0.015, 0); finShape.quadraticCurveTo(0, 0.022, 0.012, 0); finShape.lineTo(-0.015, 0);
    const finGeo = new THREE.ShapeGeometry(finShape, 6);
    const fish = [], fcols = [['#ff7b2e', '#ffffff'], ['#ffd23d', '#3a3a3a'], ['#3ee6ff', '#1d4fd0'], ['#ff5d8f', '#ffffff'], ['#9b6bff', '#ffd23d'], ['#ff7b2e', '#111111'], ['#e8f0ff', '#ff4d5e']];
    fcols.forEach(([main, stripe], i) => {
      const f = K.group();
      const sk = tex(K, 'fishskin|' + i, 64, 32, (c, w2, h2) => { c.fillStyle = main; c.fillRect(0, 0, w2, h2); c.fillStyle = stripe; for (const x of [0.3, 0.62]) c.fillRect(x * w2, 0, 6, h2); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, h2 * 0.65, w2, h2 * 0.35); });
      const fm = K.memo('fishm|' + i, () => new THREE.MeshStandardMaterial({ map: sk, roughness: 0.35, metalness: 0.1 }));
      const finM = K.memo('finm|' + i, () => new THREE.MeshStandardMaterial({ color: main, roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      const body = K.sph(0.022, fm, 20, 12); body.scale.set(1.7, 1.05, 0.55); f.add(body);
      const tail = K.mesh(tailGeo, finM); tail.position.x = -0.034; f.add(tail);
      const fin = K.mesh(finGeo, finM); fin.position.set(0.004, 0.02, 0); f.add(fin);
      for (const s of [-1, 1]) { const eye = K.sph(0.0045, K.std('#0a0a0a', 0.1), 8, 6); eye.position.set(0.026, 0.006, s * 0.009); f.add(eye); const hl = K.sph(0.0015, K.glow('#ffffff', 2), 6, 4); hl.position.set(0.029, 0.008, s * 0.012); f.add(hl); }
      const sc = 0.8 + r() * 0.5; f.scale.setScalar(sc);
      g.add(f); fish.push({ f, tail, sp: 0.18 + r() * 0.22, ph: r() * TAU, y: y0 + 0.13 + r() * 0.25, zr: 0.05 + r() * 0.08, prev: 0 });
    });
    const bubbles = [];
    for (let i = 0; i < 14; i++) { const b = K.sph(0.005 + r() * 0.005, K.glass('#ffffff', 0.55), 8, 6); g.add(b); bubbles.push({ b, ph: r(), sp: 0.12 + r() * 0.12 }); }
    const stone2 = K.sph(0.018, K.std('#5a6a72', 0.9), 10, 8); stone2.scale.y = 0.6; stone2.position.set(W / 2 - 0.12, y0 + 0.055, -0.08); g.add(stone2);
    const light = new THREE.PointLight('#7fc8ff', 0.6, 1.8, 2); light.position.set(0, y0 + 0.3, 0.3); g.add(light);
    const sp0 = surf.geometry.attributes.position, base = Float32Array.from(sp0.array);
    g.userData.tick = t => {
      for (const o of fish) {
        const a = t * o.sp + o.ph, x = Math.sin(a) * (W / 2 - 0.12), dx = Math.cos(a), z = Math.sin(a * 1.7 + o.ph) * o.zr;
        o.f.position.set(x, o.y + Math.sin(a * 2.3) * 0.02, z);
        // face the way it swims, turning through the side as it reverses
        o.f.rotation.y = Math.atan2(-Math.cos(a * 1.7 + o.ph) * o.zr * 1.7, dx * (W / 2 - 0.12));
        o.tail.rotation.y = Math.sin(t * 12 + o.ph) * 0.5;
      }
      for (const w2 of weeds) { w2.m.rotation.z = Math.sin(t * 1.2 + w2.ph) * 0.14; w2.m.rotation.x = Math.sin(t * 0.9 + w2.ph * 2) * 0.08; }
      for (const o of bubbles) { const p = (t * o.sp + o.ph) % 1; o.b.position.set(W / 2 - 0.12 + Math.sin(p * 20 + o.ph * 9) * 0.008, y0 + 0.07 + p * (TH - 0.14), -0.08); }
      caus.offset.set(Math.sin(t * 0.3) * 0.2, t * 0.05); sandM.emissiveIntensity = 0.4 + 0.15 * Math.sin(t * 1.7);
      for (let i = 0; i < sp0.count; i++) sp0.setZ(i, base[i * 3 + 2] + 0.003 * Math.sin(base[i * 3] * 30 + t * 2) * Math.sin(base[i * 3 + 1] * 25 + t * 1.6));
      sp0.needsUpdate = true;
    };
    g.userData.tick(0);
    return g;
  }
  function fishbowl(K) {
    const g = K.group(), THREE = K.THREE;
    const pts = []; for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + i / 24 * Math.PI * 0.8; pts.push([Math.cos(a) * 0.12, 0.12 + Math.sin(a) * 0.12]); }
    pts[0][0] = 0.06; pts.unshift([0, 0]);
    // a rolled lip at the top
    const top = pts[pts.length - 1];
    const glass = K.lathe(pts, K.glass('#e8f6fa', 0.12), 48); g.add(glass);
    const lip = K.torus(top[0], 0.004, K.glass('#ffffff', 0.3), TAU, 8, 48); lip.rotation.x = Math.PI / 2; lip.position.y = top[1]; g.add(lip);
    const wpts = pts.filter(p => p[1] < 0.175).map(([x, y]) => [x * 0.97, y + 0.002]); wpts.push([0, 0.175]);
    g.add(K.lathe(wpts, K.memo('bowlwater2', () => new THREE.MeshPhysicalMaterial({ color: '#8fd3f0', transparent: true, opacity: 0.14, roughness: 0.02, depthWrite: false })), 48));
    const surf = K.mesh(new THREE.CircleGeometry(wpts[wpts.length - 2][0], 40), K.memo('bowlsurf', () => new THREE.MeshPhysicalMaterial({ color: '#d8f2ff', transparent: true, opacity: 0.3, roughness: 0.02, depthWrite: false, side: THREE.DoubleSide })));
    surf.rotation.x = -Math.PI / 2; surf.position.y = 0.175; g.add(surf);
    // colourful pebbles in one instanced mesh
    const r = K.rng(5), cols = ['#ff7b8a', '#7fd8ff', '#ffd23d', '#9fe8a0', '#c9b3ff', '#ffffff'];
    const peb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.008, 1), K.std('#ffffff', 0.4), 90), o = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < 90; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * 0.07; o.position.set(Math.cos(a) * rr, 0.012 + r() * 0.012 * (1 - rr / 0.07), Math.sin(a) * rr); o.scale.set(1, 0.7, 1); o.rotation.set(r() * 3, r() * 3, 0); o.updateMatrix(); peb.setMatrixAt(i, o.matrix); peb.setColorAt(i, c.set(cols[i % cols.length])); }
    g.add(peb);
    const plant = K.group(); plant.position.set(-0.04, 0.02, -0.03); g.add(plant);
    for (let i = 0; i < 4; i++) { const h = 0.06 + r() * 0.05, geo = new THREE.PlaneGeometry(0.012, h, 1, 4); geo.translate(0, h / 2, 0); const m = K.mesh(geo, K.memo('weed2', () => new THREE.MeshStandardMaterial({ color: '#3fa463', roughness: 0.6, side: THREE.DoubleSide }))); m.rotation.set(0, i * 1.3, (r() - 0.5) * 0.4); plant.add(m); }
    // a goldfish with a long double tail
    const f = K.group(); g.add(f);
    const gm = K.memo('goldm', () => new THREE.MeshStandardMaterial({ color: '#ff8a1f', roughness: 0.3, metalness: 0.15, emissive: '#ff5a00', emissiveIntensity: 0.12 }));
    const body = K.sph(0.02, gm, 20, 14); body.scale.set(1.45, 1.15, 0.7); f.add(body);
    const tm = K.memo('goldtail2', () => new THREE.MeshStandardMaterial({ color: '#ffb35c', side: THREE.DoubleSide, transparent: true, opacity: 0.8, roughness: 0.4 }));
    const ts = new THREE.Shape(); ts.moveTo(0, 0); ts.bezierCurveTo(-0.02, 0.03, -0.05, 0.03, -0.055, 0.012); ts.lineTo(-0.035, 0); ts.lineTo(-0.055, -0.014); ts.bezierCurveTo(-0.05, -0.03, -0.02, -0.028, 0, 0);
    const tail = K.mesh(new THREE.ShapeGeometry(ts, 10), tm); tail.position.x = -0.022; f.add(tail);
    const fin = K.mesh(new THREE.ShapeGeometry((() => { const s2 = new THREE.Shape(); s2.moveTo(-0.012, 0); s2.quadraticCurveTo(0, 0.02, 0.01, 0); s2.lineTo(-0.012, 0); return s2; })(), 6), tm); fin.position.y = 0.02; f.add(fin);
    for (const s of [-1, 1]) { const eye = K.sph(0.005, K.std('#111', 0.1), 8, 6); eye.position.set(0.02, 0.006, s * 0.011); f.add(eye); }
    g.userData.tick = t => { const a = t * 0.7; f.position.set(Math.cos(a) * 0.055, 0.09 + Math.sin(t * 1.3) * 0.02, Math.sin(a) * 0.055); f.rotation.y = -a - Math.PI / 2; tail.rotation.y = Math.sin(t * 9) * 0.5; fin.rotation.x = Math.sin(t * 6) * 0.2; };
    g.userData.tick(0);
    return g;
  }
  function globe(K) {
    const g = K.group(), THREE = K.THREE;
    const base = K.lathe([[0, 0], [0.08, 0], [0.082, 0.008], [0.07, 0.02], [0.03, 0.03], [0.012, 0.05], [0, 0.05]], K.wood('walnut'), 40); g.add(base);
    const brass = K.std('#c9a24a', 0.22, 1);
    const stem = K.cyl(0.007, 0.009, 0.06, brass, 12); stem.position.y = 0.075; g.add(stem);
    const tilt = K.group(); tilt.position.y = 0.21; tilt.rotation.z = 0.41; g.add(tilt);
    const arc = K.torus(0.118, 0.005, brass, Math.PI * 1.2, 8, 48); arc.rotation.z = -Math.PI * 0.1 + Math.PI / 2; tilt.add(arc);
    for (const s of [-1, 1]) { const pin = K.sph(0.008, brass, 10, 8); pin.position.y = s * 0.114; tilt.add(pin); }
    // land from smooth value noise, with a grid of latitude and longitude lines and a sepia ocean
    const map = tex(K, 'globe2', 1024, 512, (c, w, h) => {
      const r = K.rng(77), N = 16, grid = Array.from({ length: (N + 1) * (N / 2 + 1) }, () => r());
      const at = (gx, gy) => grid[((gy % (N / 2 + 1)) * (N + 1)) + (gx % N)];
      const smooth = t => t * t * (3 - 2 * t);
      const noiseAt = (u, v) => { const x = u * N, y = v * N / 2, ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy); const a = at(ix, iy), b = at(ix + 1, iy), c0 = at(ix, iy + 1), d = at(ix + 1, iy + 1); return a + (b - a) * fx + (c0 - a) * fy + (a - b - c0 + d) * fx * fy; };
      const img = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h, n = noiseAt(u, v) * 0.65 + noiseAt(u * 2.3 % 1, v * 2.3 % 1) * 0.35, lat = Math.abs(v - 0.5) * 2;
        const land = n > 0.55 - lat * 0.05, ice = lat > 0.86, i = (y * w + x) * 4;
        const col = ice ? [236, 240, 238] : land ? (n > 0.68 ? [176, 140, 86] : [196, 176, 112]) : [62 + n * 30, 112 + n * 30, 140 + n * 30];
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      }
      // drawn through a spare canvas, since putImageData ignores the 2x scale canvasTex sets
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(img, 0, 0); c.drawImage(tmp, 0, 0);
      c.strokeStyle = 'rgba(60,40,20,.35)'; c.lineWidth = 1;
      for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(0, i * h / 8); c.lineTo(w, i * h / 8); c.stroke(); }
      for (let i = 0; i < 16; i++) { c.beginPath(); c.moveTo(i * w / 16, 0); c.lineTo(i * w / 16, h); c.stroke(); }
    });
    const ball = K.mesh(new THREE.SphereGeometry(0.11, 48, 32), K.memo('globemat2', () => new THREE.MeshPhysicalMaterial({ map, roughness: 0.35, clearcoat: 0.6 }))); tilt.add(ball);
    g.userData.tick = t => { ball.rotation.y = t * 0.5; };
    return g;
  }
  function cradle(K) {
    const g = K.group(), metal = K.std('#c9ccd2', 0.15, 1);
    const base = K.rbox(0.24, 0.02, 0.14, 0.006, K.wood('black')); base.position.y = 0.01; g.add(base);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = K.cyl(0.003, 0.003, 0.18, metal, 8); p.position.set(sx * 0.1, 0.11, sz * 0.05); g.add(p); }
    for (const sz of [-1, 1]) { const b = K.cyl(0.003, 0.003, 0.2, metal, 8); b.rotation.z = Math.PI / 2; b.position.set(0, 0.2, sz * 0.05); g.add(b); }
    const balls = [];
    for (let i = 0; i < 5; i++) {
      const piv = K.group(); piv.position.set(-0.04 + i * 0.02, 0.2, 0); g.add(piv);
      for (const sz of [-1, 1]) { const s = K.cyl(0.0006, 0.0006, 0.13, K.std('#ddd', 0.5), 4); s.position.set(0, -0.065, sz * 0.025); s.rotation.x = -sz * 0.36; piv.add(s); }
      const b = K.sph(0.01, metal, 20, 14); b.position.y = -0.125; piv.add(b);
      balls.push(piv);
    }
    g.userData.tick = t => { const s = Math.sin(t * 4.5), a = Math.abs(s) * 0.55; balls[0].rotation.z = s < 0 ? a : 0; balls[4].rotation.z = s > 0 ? -a : 0; };
    return g;
  }
  function plasmaBall(K) {
    const g = K.group(), THREE = K.THREE;
    const base = K.lathe([[0, 0], [0.07, 0], [0.065, 0.03], [0.04, 0.06], [0.03, 0.075], [0, 0.075]], K.plastic('#151618', 0.4), 40); g.add(base);
    const ball = K.sph(0.1, K.glass('#c9b3ff', 0.18), 40, 24); ball.position.y = 0.17; g.add(ball);
    const core = K.sph(0.014, K.glow('#ffd6ff', 4), 16, 10); core.position.y = 0.17; g.add(core);
    const lm = K.memo('plasmaline', () => new THREE.LineBasicMaterial({ color: new THREE.Color('#e08cff').multiplyScalar(2.2), toneMapped: false }));
    const bolts = [];
    for (let i = 0; i < 7; i++) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3)); const l = new THREE.Line(geo, lm); l.position.y = 0.17; g.add(l); bolts.push({ l, a: i / 7 * TAU, b: Math.random() * 2 - 1 }); }
    const light = new THREE.PointLight('#c070ff', 0.4, 1.2, 2); light.position.y = 0.17; g.add(light);
    const v = new THREE.Vector3();
    g.userData.tick = t => {
      for (const o of bolts) {
        o.a += Math.sin(t * 0.7 + o.b * 3) * 0.02; o.b = Math.max(-0.9, Math.min(0.9, o.b + Math.sin(t * 1.1 + o.a) * 0.01));
        v.set(Math.cos(o.a) * Math.sqrt(1 - o.b * o.b), o.b, Math.sin(o.a) * Math.sqrt(1 - o.b * o.b)).multiplyScalar(0.098);
        const p = o.l.geometry.attributes.position;
        for (let k = 0; k < 12; k++) { const f = k / 11, j = k && k < 11 ? 0.008 : 0; p.setXYZ(k, v.x * f + (Math.random() - 0.5) * j, v.y * f + (Math.random() - 0.5) * j, v.z * f + (Math.random() - 0.5) * j); }
        p.needsUpdate = true;
      }
      light.intensity = 0.35 + Math.random() * 0.1;
    };
    g.userData.tick(0);
    return g;
  }
  function deskFan(K) {
    const g = K.group(), m = K.plastic('#e8e3d6', 0.35);
    const base = K.cyl(0.08, 0.09, 0.025, m, 32); base.position.y = 0.012; g.add(base);
    const stem = K.cyl(0.012, 0.012, 0.2, m, 12); stem.position.y = 0.12; g.add(stem);
    const head = K.group(); head.position.y = 0.24; g.add(head);
    const motor = K.cyl(0.04, 0.04, 0.07, m, 20); motor.rotation.x = Math.PI / 2; motor.position.z = -0.04; head.add(motor);
    const cage = K.torus(0.12, 0.004, K.std('#c9ccd2', 0.3, 0.9), TAU, 6, 48); cage.position.z = 0.02; head.add(cage);
    for (let i = 0; i < 8; i++) { const sp = K.box(0.002, 0.24, 0.002, K.std('#c9ccd2', 0.3, 0.9)); sp.rotation.z = i / 8 * Math.PI; sp.position.z = 0.03; head.add(sp); }
    const rotor = K.group(); rotor.position.z = 0.015; head.add(rotor);
    for (let i = 0; i < 3; i++) { const bl = K.rbox(0.04, 0.1, 0.004, 0.002, K.plastic('#7fc8c0', 0.3)); bl.position.y = 0.06; const arm = K.group(bl); arm.rotation.z = i / 3 * TAU; bl.rotation.y = 0.35; rotor.add(arm); }
    rotor.add(K.sph(0.016, m, 12, 8));
    g.userData.tick = t => { rotor.rotation.z = -t * 22; head.rotation.y = Math.sin(t * 0.5) * 0.6; };
    return g;
  }
  function wallClock(K) {
    const g = K.group(), R = 0.17;
    const rim = K.cyl(R + 0.012, R + 0.012, 0.035, K.std('#1b1c1e', 0.4, 0.5), 48); rim.rotation.x = Math.PI / 2; rim.position.set(0, R + 0.012, 0.0175); g.add(rim);
    const face = K.mesh(new K.THREE.CircleGeometry(R, 48), K.memo('clockface', () => new K.THREE.MeshStandardMaterial({ map: tex(K, 'clockface', 256, 256, (c, w, h) => {
      c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#1b1c1e';
      for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, big = i % 5 === 0; c.save(); c.translate(w / 2, h / 2); c.rotate(a); c.fillRect(-(big ? 3 : 1), -h / 2 + 8, big ? 6 : 2, big ? 18 : 8); c.restore(); }
      c.font = `600 20px ${K.MONO}`; c.textAlign = 'center'; c.fillText('10000WPM', w / 2, h * 0.7);
    }), roughness: 0.6 })));
    face.position.set(0, R + 0.012, 0.036); g.add(face);
    const hands = [[0.008, R * 0.55, '#1b1c1e'], [0.006, R * 0.8, '#1b1c1e'], [0.003, R * 0.85, '#d5503f']].map(([w, l, col], i) => {
      const piv = K.group(); piv.position.set(0, R + 0.012, 0.04 + i * 0.003); g.add(piv);
      const h = K.box(w, l, 0.002, K.std(col, 0.5)); h.position.y = l / 2 - 0.02; piv.add(h); return piv;
    });
    const glass = K.mesh(new K.THREE.CircleGeometry(R, 48), K.glass('#ffffff', 0.06)); glass.position.set(0, R + 0.012, 0.05); g.add(glass);
    g.userData.tick = () => {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = d.getHours() % 12 + m / 60;
      hands[0].rotation.z = -h / 12 * TAU; hands[1].rotation.z = -m / 60 * TAU; hands[2].rotation.z = -Math.floor(s) / 60 * TAU;
    };
    g.userData.tick(0);
    return g;
  }
  function fireplace(K) {
    const g = K.group(), THREE = K.THREE, W = 1.2, H = 0.62, D = 0.3;
    const fw = W * 0.72, fh = H * 0.56, fy = H * 0.46, fz = D / 2;
    // the body is built round an open firebox, so the flames inside can be seen
    const bodyM = K.std('#ecebe6', 0.55);
    const blk = (w, h, x, y) => { const b = K.rbox(w, h, D, 0.008, bodyM); b.position.set(x, y, 0); g.add(b); };
    blk(W, fy - fh / 2, 0, (fy - fh / 2) / 2);
    blk(W, H - (fy + fh / 2), 0, (H + fy + fh / 2) / 2);
    for (const sx of [-1, 1]) blk((W - fw) / 2, fh, sx * (fw + W) / 4, fy);
    const plinth = K.rbox(W + 0.04, 0.05, D + 0.02, 0.006, K.std('#2a2c2e', 0.5)); plinth.position.y = 0.025; g.add(plinth);
    const mantel = K.rbox(W + 0.12, 0.05, D + 0.08, 0.01, K.wood('walnut')); mantel.position.y = H + 0.025; g.add(mantel);
    const trimM = K.std('#151617', 0.35, 0.6);
    for (const [w, h, x, y] of [[fw + 0.05, 0.025, 0, fy + fh / 2], [fw + 0.05, 0.025, 0, fy - fh / 2], [0.025, fh, -fw / 2, fy], [0.025, fh, fw / 2, fy]]) { const t = K.box(w, h, 0.02, trimM); t.position.set(x, y, fz); g.add(t); }
    const inner = K.box(fw, fh, 0.01, K.std('#1a0d06', 0.9)); inner.position.set(0, fy, -D / 2 + 0.04); g.add(inner);
    for (const sx of [-1, 1]) { const wall = K.box(0.01, fh, D - 0.05, K.std('#120804', 0.9)); wall.position.set(sx * fw / 2, fy, 0.015); g.add(wall); }
    // a bed of glowing embers, logs, and flames drawn as soft tongues that flicker
    const bedY = fy - fh / 2 + 0.01, fzz = 0.0;
    const ember = tex(K, 'embers', 256, 64, (c, w, h) => { const r = K.rng(9); c.fillStyle = '#100503'; c.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { c.fillStyle = r() < 0.5 ? '#ff6a1a' : '#ffb347'; c.globalAlpha = 0.3 + r() * 0.7; c.beginPath(); c.arc(r() * w, r() * h, 1 + r() * 4, 0, TAU); c.fill(); } c.globalAlpha = 1; });
    const emberM = new THREE.MeshStandardMaterial({ color: '#2a1408', emissive: '#ffffff', emissiveMap: ember, emissiveIntensity: 1.4, roughness: 0.9 });
    const bedM = K.mesh(new THREE.PlaneGeometry(fw - 0.06, 0.16), emberM); bedM.rotation.x = -Math.PI / 2; bedM.position.set(0, bedY, fzz); g.add(bedM);
    const logM = K.memo('charlog', () => new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.95, emissive: '#ff4a10', emissiveIntensity: 0.12 }));
    for (const [x, rz, ry] of [[-0.1, 0.08, 0.2], [0.1, -0.08, -0.2], [0, 0, 0]]) { const l = K.cyl(0.024, 0.026, 0.32, logM, 12); l.rotation.set(0, ry, Math.PI / 2 + rz); l.position.set(x * 0.8, bedY + (x ? 0.022 : 0.058), fzz); g.add(l); }
    const ft = tex(K, 'flame', 128, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,170,60,1)'); gr.addColorStop(0.6, 'rgba(255,80,20,.8)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(w * 0.5, 0); c.bezierCurveTo(w * 0.9, h * 0.45, w * 1.0, h * 0.8, w * 0.5, h); c.bezierCurveTo(0, h * 0.8, w * 0.1, h * 0.45, w * 0.5, 0); c.filter = 'blur(6px)'; c.fill();
    });
    const flameM = K.memo('flame2', () => new THREE.MeshBasicMaterial({ map: ft, color: new THREE.Color(1.6, 1.4, 1.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    const flames = [];
    for (let i = 0; i < 9; i++) {
      const h = 0.12 + (i % 3) * 0.04, f = K.mesh(new THREE.PlaneGeometry(0.07 + (i % 2) * 0.02, h), flameM);
      f.geometry.translate(0, h / 2, 0); f.position.set(-0.2 + i * 0.05, bedY + 0.02, fzz + ((i % 2) - 0.5) * 0.02); f.rotation.y = (i % 3 - 1) * 0.4; g.add(f); flames.push({ f, ph: i * 1.7 });
    }
    const glass = K.box(fw, fh, 0.004, K.glass('#ffffff', 0.06)); glass.position.set(0, fy, fz + 0.012); g.add(glass);
    // things on the mantel
    const candle = K.group(); candle.position.set(-0.42, H + 0.05, 0.02); g.add(candle);
    candle.add(K.put(K.cyl(0.025, 0.025, 0.1, K.std('#f4efe4', 0.6), 20), 0, 0.05, 0));
    const cf = K.mesh(new THREE.PlaneGeometry(0.02, 0.035), flameM); cf.geometry.translate(0, 0.0175, 0); cf.position.y = 0.102; candle.add(cf);
    const vase = K.lathe([[0, 0], [0.04, 0], [0.05, 0.06], [0.03, 0.14], [0.035, 0.16], [0, 0.16]], K.plastic('#2f7d7a', 0.25), 32); vase.position.set(0.42, H + 0.05, 0); g.add(vase);
    const light = new THREE.PointLight('#ff8a3a', 1.2, 2.5, 2); light.position.set(0, fy, fz + 0.2); g.add(light);
    g.userData.tick = t => {
      for (const o of flames) { const k = 0.75 + 0.25 * Math.sin(t * 9 + o.ph) * Math.sin(t * 5.3 + o.ph * 2); o.f.scale.set(0.9 + 0.1 * Math.sin(t * 7 + o.ph), k, 1); o.f.rotation.z = Math.sin(t * 4 + o.ph) * 0.08; }
      cf.scale.set(1, 0.85 + 0.15 * Math.sin(t * 13), 1);
      light.intensity = 1.0 + 0.3 * Math.sin(t * 11) * Math.sin(t * 7.3);
      emberM.emissiveIntensity = 1.2 + 0.3 * Math.sin(t * 2.3);
    };
    g.userData.tick(0);
    return g;
  }
  function arcade(K) {
    const g = K.group(), THREE = K.THREE;
    const black = K.std('#141416', 0.5);
    const shape = new THREE.Shape(); shape.moveTo(-0.32, 0); shape.lineTo(0.32, 0); shape.lineTo(0.32, 0.75); shape.lineTo(0.42, 0.95); shape.lineTo(0.3, 1.7); shape.lineTo(-0.32, 1.75); shape.lineTo(-0.32, 0);
    const sideGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
    // side art: a purple-to-pink sunset, a grid and the 10000WPM mark, mapped from the side's own coordinates
    const art = tex(K, 'arcadeside', 256, 512, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a0f4a'); gr.addColorStop(0.55, '#5b2bd9'); gr.addColorStop(1, '#ff5d8f'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd23d'; c.beginPath(); c.arc(w * 0.5, h * 0.58, w * 0.28, Math.PI, 0); c.fill();
      c.fillStyle = '#1a0f4a'; for (let i = 0; i < 6; i++) c.fillRect(0, h * 0.5 + i * 12, w, 4 + i);
      c.strokeStyle = 'rgba(62,230,255,.8)'; c.lineWidth = 2;
      for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, h * 0.62 + i * i * 4); c.lineTo(w, h * 0.62 + i * i * 4); c.stroke(); }
      for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(w / 2 + i * 8, h * 0.62); c.lineTo(w / 2 + i * 60, h); c.stroke(); }
      c.fillStyle = '#e8eef2'; c.font = `700 30px ${K.MONO}`; c.textAlign = 'center'; c.save(); c.translate(w * 0.5, h * 0.25); c.rotate(-Math.PI / 2); c.fillText('STORMTYPER', 0, 10); c.restore();
    });
    const sideM = K.memo('arcadesidem', () => new THREE.MeshStandardMaterial({ map: art, roughness: 0.45 }));
    const sp = sideGeo.attributes.position, suv = sideGeo.attributes.uv;
    for (let i = 0; i < suv.count; i++) suv.setXY(i, (sp.getX(i) + 0.32) / 0.74, sp.getY(i) / 1.75);
    const sideGeoR = sideGeo.clone(); { const u2 = sideGeoR.attributes.uv; for (let i = 0; i < u2.count; i++) u2.setX(i, 1 - u2.getX(i)); }
    for (const sx of [-1, 1]) {
      const s = K.mesh(sx > 0 ? sideGeoR : sideGeo, sideM); s.rotation.y = -Math.PI / 2; s.position.x = sx * 0.3 + 0.015; g.add(s);
      // the glowing T-moulding round the side's edge
      const edge = K.tube(shape.getPoints(4).map(p => [sx * 0.32, p.y, p.x]), 0.006, K.glow('#3ee6ff', 2.2), 80, 6, true); g.add(edge);
    }
    const body = K.box(0.58, 1.7, 0.6, black); body.position.set(0, 0.85, -0.04); g.add(body);
    const panel = K.box(0.6, 0.04, 0.24, K.plastic('#1b1b20', 0.4)); panel.position.set(0, 0.92, 0.3); panel.rotation.x = 0.2; g.add(panel);
    const panelArt = K.box(0.58, 0.002, 0.22, K.plastic('#5b2bd9', 0.35)); panelArt.position.set(0, 0.942, 0.305); panelArt.rotation.x = 0.2; g.add(panelArt);
    for (const px of [-0.15, 0.13]) {
      const stick = K.cyl(0.006, 0.006, 0.06, K.std('#222', 0.4), 8); stick.position.set(px - 0.04, 0.97, 0.3); g.add(stick);
      const knob = K.sph(0.02, K.plastic(px < 0 ? '#d8343f' : '#3ee6ff', 0.25), 16, 10); knob.position.set(px - 0.04, 1.0, 0.3); g.add(knob);
      ['#ffd23d', '#3ee6ff', '#ff5d8f'].forEach((c, i) => { const b = K.cyl(0.013, 0.013, 0.012, K.plastic(c, 0.3), 16); b.position.set(px + 0.02 + i * 0.035, 0.955, 0.3 - (i % 2) * 0.015); b.rotation.x = 0.2; g.add(b); });
    }
    // coin door and speaker grille
    const door = K.rbox(0.26, 0.3, 0.01, 0.005, K.std('#2a2b2f', 0.35, 0.7)); door.position.set(0, 0.5, 0.265); g.add(door);
    for (const sx of [-1, 1]) { const slot = K.box(0.04, 0.05, 0.004, K.glow('#ff3a46', 2.4)); slot.position.set(sx * 0.06, 0.58, 0.272); g.add(slot); const coin = K.box(0.004, 0.02, 0.006, K.std('#111', 0.4)); coin.position.set(sx * 0.06, 0.58, 0.276); g.add(coin); }
    const grille = K.box(0.4, 0.06, 0.004, K.memo('arcgrille', () => new THREE.MeshStandardMaterial({ color: '#0d0d0f', map: tex(K, 'arcgrille', 128, 32, (c, w, h) => { c.fillStyle = '#26262a'; c.fillRect(0, 0, w, h); c.fillStyle = '#060607'; for (let x = 3; x < w; x += 6) for (let y = 3; y < h; y += 6) c.fillRect(x, y, 3, 3); }), roughness: 0.6 })));
    grille.position.set(0, 1.56, 0.27); g.add(grille);
    const scr = tex(K, 'arcadescr', 256, 512, (c, w, h) => {
      c.fillStyle = '#05030f'; c.fillRect(0, 0, w, h);
      const r = K.rng(3);
      for (let i = 0; i < 80; i++) { c.fillStyle = `rgba(255,255,255,${r()})`; c.fillRect(r() * w, r() * h, 2, 2); }
      const cols = ['#39ff88', '#ff5d8f', '#ffd23d', '#3ee6ff'];
      for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) { c.fillStyle = cols[row]; const x = 22 + i * 36, y = 40 + row * 34; c.fillRect(x, y, 22, 12); c.fillRect(x + 4, y + 12, 4, 6); c.fillRect(x + 14, y + 12, 4, 6); c.fillRect(x - 4, y + 4, 4, 4); c.fillRect(x + 22, y + 4, 4, 4); }
      c.fillStyle = '#3ee6ff'; c.fillRect(w / 2 - 16, h - 60, 32, 14); c.fillRect(w / 2 - 4, h - 70, 8, 10);
      c.fillStyle = '#ffd23d'; c.font = `700 22px ${K.MONO}`; c.textAlign = 'center'; c.fillText('HI 10000', w / 2, 24);
    });
    const smap = scr.clone(); smap.wrapT = THREE.RepeatWrapping; smap.needsUpdate = true;
    const bezel = K.box(0.52, 0.46, 0.01, K.std('#050506', 0.3)); bezel.position.set(0, 1.28, 0.262); bezel.rotation.x = -0.18; g.add(bezel);
    const screenM = new THREE.MeshBasicMaterial({ map: smap, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) });
    // scanlines over the screen, and a slight bulge like a tube
    const sg = new THREE.PlaneGeometry(0.46, 0.4, 12, 12), sgp = sg.attributes.position;
    for (let i = 0; i < sgp.count; i++) { const x = sgp.getX(i) / 0.23, y = sgp.getY(i) / 0.2; sgp.setZ(i, 0.012 * (1 - x * x) * (1 - y * y)); }
    const screen = K.mesh(sg, screenM); screen.position.set(0, 1.28, 0.27); screen.rotation.x = -0.18; g.add(screen);
    const lines = K.mesh(sg, K.memo('arcscan', () => new THREE.MeshBasicMaterial({ map: (() => { const t = tex(K, 'scan', 4, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.35)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1); }).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); t.needsUpdate = true; return t; })(), transparent: true, depthWrite: false })));
    lines.position.copy(screen.position); lines.position.z += 0.001; lines.rotation.copy(screen.rotation); g.add(lines);
    const marqueeT = tex(K, 'marquee', 512, 128, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#5b2bd9'); gr.addColorStop(1, '#ff5d8f'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = `700 60px ${K.MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#3ee6ff'; c.shadowBlur = 12; c.fillText('TYPE INVADERS', w / 2, h / 2 + 4);
    });
    const marqueeM = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: marqueeT, emissiveIntensity: 1.6 });
    const marquee = K.box(0.56, 0.14, 0.02, marqueeM); marquee.position.set(0, 1.64, 0.2); g.add(marquee);
    const glow = new THREE.PointLight('#8c6bff', 0.5, 1.6, 2); glow.position.set(0, 1.3, 0.5); g.add(glow);
    g.userData.tick = t => { smap.offset.y = (t * 0.08) % 1; marqueeM.emissiveIntensity = 1.5 + Math.sin(t * 3) * 0.3; };
    return g;
  }
  function floorLamp(K) {
    const g = K.group(), metal = K.std('#1b1c1e', 0.35, 0.7);
    const base = K.cyl(0.16, 0.17, 0.03, K.std('#e9e7e2', 0.2), 40); base.position.y = 0.015; g.add(base);
    g.add(K.tube([[0, 0.03, -0.05], [0, 1.0, -0.1], [0.1, 1.7, 0.05], [0.4, 1.85, 0.25], [0.65, 1.7, 0.35]], 0.012, metal, 64, 8));
    const shade = K.lathe([[0.02, 0], [0.18, -0.16], [0.185, -0.17], [0.025, -0.005]], K.std('#c9a24a', 0.3, 0.9), 40); shade.position.set(0.65, 1.72, 0.35); g.add(shade);
    const bulb = K.sph(0.04, K.glow('#ffd9a0', 4), 16, 10); bulb.position.set(0.65, 1.62, 0.35); g.add(bulb);
    const light = new K.THREE.PointLight('#ffcf94', 2, 3.5, 2); light.position.set(0.65, 1.5, 0.35); g.add(light);
    return g;
  }
  function guitar(K) {
    const g = K.group(), THREE = K.THREE;
    const stand = K.std('#1b1c1e', 0.4, 0.6);
    g.add(K.tube([[-0.15, 0.01, 0.1], [0, 0.03, -0.05], [0.15, 0.01, 0.1]], 0.008, stand, 24, 6));
    g.add(K.tube([[0, 0.03, -0.05], [0, 0.6, -0.12]], 0.008, stand, 8, 6));
    for (const sx of [-1, 1]) g.add(K.put(K.cyl(0.012, 0.012, 0.05, K.std('#111', 0.9), 10), sx * 0.08, 0.07, 0.06, Math.PI / 2, 0, 0));
    const gt = K.group(); gt.position.set(0, 0.07, 0.03); gt.rotation.x = -0.16; g.add(gt);
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.bezierCurveTo(0.2, 0, 0.21, 0.2, 0.12, 0.25); s.bezierCurveTo(0.17, 0.33, 0.16, 0.46, 0, 0.47);
    s.bezierCurveTo(-0.16, 0.46, -0.17, 0.33, -0.12, 0.25); s.bezierCurveTo(-0.21, 0.2, -0.2, 0, 0, 0);
    const hole = new THREE.Path(); hole.absarc(0, 0.3, 0.042, 0, TAU, true);
    const top = new THREE.Shape(s.getPoints(48)); top.holes.push(hole);
    // the top is spruce with a sunburst, the sides and back are darker wood, edged with white binding
    const topT = tex(K, 'gtop', 256, 256, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h * 0.65, 10, w / 2, h * 0.6, w * 0.6); gr.addColorStop(0, '#f2c77a'); gr.addColorStop(0.65, '#d9953f'); gr.addColorStop(1, '#5a2a10'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(120,70,20,.18)'; for (let x = 0; x < w; x += 3) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 2, h); c.stroke(); }
    });
    const topGeo = new THREE.ShapeGeometry(top, 24), tp = topGeo.attributes.position, tuv = topGeo.attributes.uv;
    for (let i = 0; i < tuv.count; i++) tuv.setXY(i, (tp.getX(i) + 0.21) / 0.42, tp.getY(i) / 0.47);
    const topM = K.memo('gtopm', () => new THREE.MeshPhysicalMaterial({ map: topT, roughness: 0.3, clearcoat: 1 }));
    const front = K.mesh(topGeo, topM); front.position.z = 0.046; gt.add(front);
    const sideGeo = new THREE.ExtrudeGeometry(new THREE.Shape(s.getPoints(48)), { depth: 0.09, bevelEnabled: false, curveSegments: 24 });
    const body = K.mesh(sideGeo, K.memo('gside', () => new THREE.MeshPhysicalMaterial({ color: '#5a2a10', roughness: 0.3, clearcoat: 1 }))); body.position.z = -0.045; gt.add(body);
    const bind = K.tube(s.getPoints(48).map(p => [p.x, p.y, 0.046]), 0.003, K.std('#f2efe6', 0.4), 120, 4, true); gt.add(bind);
    const inside = K.mesh(new THREE.CircleGeometry(0.042, 32), K.std('#120b06', 0.9)); inside.position.set(0, 0.3, 0.02); gt.add(inside);
    const rose = K.torus(0.05, 0.004, K.std('#1b1410', 0.5), TAU, 6, 40); rose.position.set(0, 0.3, 0.047); gt.add(rose);
    const guard = K.mesh(new THREE.CircleGeometry(0.04, 20, 0, Math.PI * 0.6), K.plastic('#1b1410', 0.3)); guard.position.set(0.03, 0.23, 0.047); guard.rotation.z = -1.4; gt.add(guard);
    const neck = K.box(0.05, 0.5, 0.025, K.wood('walnut')); neck.position.set(0, 0.7, 0.03); gt.add(neck);
    const fb = K.box(0.052, 0.48, 0.006, K.std('#1b1410', 0.5)); fb.position.set(0, 0.71, 0.045); gt.add(fb);
    for (let i = 1; i < 14; i++) { const fr = K.box(0.052, 0.002, 0.003, K.std('#c9ccd2', 0.2, 1)); fr.position.set(0, 0.95 - i * 0.034 * (1 - i * 0.018), 0.049); gt.add(fr); }
    for (const fy of [0.85, 0.78, 0.72, 0.66, 0.6]) { const dot = K.cyl(0.004, 0.004, 0.002, K.std('#f2efe6', 0.3), 8); dot.rotation.x = Math.PI / 2; dot.position.set(0, fy, 0.049); gt.add(dot); }
    const head = K.rbox(0.075, 0.16, 0.02, 0.006, K.wood('walnut')); head.position.set(0, 1.03, 0.025); head.rotation.x = -0.15; gt.add(head);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const peg = K.cyl(0.006, 0.006, 0.03, K.std('#c9ccd2', 0.2, 1), 8); peg.rotation.z = Math.PI / 2; peg.position.set(sx * 0.05, 0.98 + k * 0.04, 0.02); gt.add(peg); const knob = K.rbox(0.014, 0.02, 0.008, 0.003, K.std('#f2efe6', 0.4)); knob.position.set(sx * 0.068, 0.98 + k * 0.04, 0.02); gt.add(knob); }
    const br = K.rbox(0.12, 0.016, 0.008, 0.003, K.std('#1b1410', 0.5)); br.position.set(0, 0.12, 0.051); gt.add(br);
    for (let i = 0; i < 6; i++) { const st = K.box(0.0012, 0.86, 0.0012, K.std('#d9d4c9', 0.3, 1)); st.position.set(-0.018 + i * 0.0072, 0.55, 0.058); gt.add(st); }
    return g;
  }
  function framedTrio(K) {
    const g = K.group();
    const arts = [
      ['sun', 0.3, 0.4, (c, w, h) => { c.fillStyle = '#f1e3c2'; c.fillRect(0, 0, w, h); c.fillStyle = '#d9792b'; c.beginPath(); c.arc(w / 2, h * 0.45, w * 0.25, 0, TAU); c.fill(); c.fillStyle = '#2f8a83'; c.fillRect(0, h * 0.62, w, h); }],
      ['wave', 0.4, 0.3, (c, w, h) => { c.fillStyle = '#e8eef2'; c.fillRect(0, 0, w, h); ['#2b4a7a', '#3d7ab0', '#9fc0d9'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 4) c.lineTo(x, h * (0.45 + i * 0.15) + Math.sin(x / w * TAU * 1.5 + i) * 10); c.lineTo(w, h); c.fill(); }); }],
      ['leaf', 0.3, 0.4, (c, w, h) => { c.fillStyle = '#ece6da'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a5a48'; c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.18, h * 0.35, 0.3, 0, TAU); c.fill(); c.strokeStyle = '#ece6da'; c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.42, h * 0.8); c.lineTo(w * 0.58, h * 0.2); c.stroke(); }],
    ];
    let x = -0.55;
    arts.forEach(([key, W, H, draw], i) => {
      const y = i === 1 ? 0.12 : 0;
      const fr = K.rbox(W, H, 0.02, 0.003, K.std(i === 1 ? '#c9a24a' : '#121314', 0.35, i === 1 ? 1 : 0.4)); fr.position.set(x + W / 2, y + H / 2, 0.01); g.add(fr);
      const t = tex(K, 'trio|' + key, Math.round(W * 600), Math.round(H * 600), draw);
      const art = K.mesh(new K.THREE.PlaneGeometry(W - 0.05, H - 0.05), K.memo('trio|' + key, () => new K.THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }))); art.position.set(x + W / 2, y + H / 2, 0.021); g.add(art);
      x += W + 0.05;
    });
    return g;
  }
  function mirror(K) {
    const g = K.group(), R = 0.3;
    const ring = K.torus(R, 0.02, K.std('#c9a24a', 0.25, 1), TAU, 12, 64); ring.position.set(0, R + 0.02, 0.02); g.add(ring);
    const m = K.mesh(new K.THREE.CircleGeometry(R, 64), K.memo('mirror', () => new K.THREE.MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.02, metalness: 1, envMapIntensity: 2.5 }))); m.position.set(0, R + 0.02, 0.012); g.add(m);
    return g;
  }
  function dartboard(K) {
    const g = K.group(), THREE = K.THREE, R = 0.22;
    const back = K.cyl(R + 0.03, R + 0.03, 0.04, K.std('#151515', 0.8), 48); back.rotation.x = Math.PI / 2; back.position.set(0, R + 0.03, 0.02); g.add(back);
    const t = tex(K, 'dart', 512, 512, (c, w, h) => {
      const cx = w / 2, cy = h / 2, rr = w / 2;
      for (let i = 0; i < 20; i++) for (const [r0, r1, a, b] of [[0, 0.95, '#151515', '#efe6cf'], [0.58, 0.63, '#c1272d', '#1f8a4c'], [0.9, 0.95, '#c1272d', '#1f8a4c']]) {
        c.fillStyle = i % 2 ? a : b; c.beginPath(); const s = (i - 0.5) / 20 * TAU - Math.PI / 2, e = s + TAU / 20; c.arc(cx, cy, rr * r1, s, e); c.arc(cx, cy, rr * r0, e, s, true); c.fill();
      }
      c.fillStyle = '#1f8a4c'; c.beginPath(); c.arc(cx, cy, rr * 0.08, 0, TAU); c.fill(); c.fillStyle = '#c1272d'; c.beginPath(); c.arc(cx, cy, rr * 0.035, 0, TAU); c.fill();
    });
    const face = K.mesh(new THREE.CircleGeometry(R, 64), K.memo('dartface', () => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }))); face.position.set(0, R + 0.03, 0.041); g.add(face);
    for (const [x, y, c] of [[0.03, 0.05, '#ffd23d'], [-0.07, -0.02, '#3ee6ff'], [0.01, 0.0, '#ff5d8f']]) {
      const d = K.group(); d.position.set(x, R + 0.03 + y, 0.045); d.rotation.x = -0.1; g.add(d);
      const shaft = K.cyl(0.003, 0.002, 0.08, K.std('#c9ccd2', 0.2, 1), 6); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.04; d.add(shaft);
      for (let k = 0; k < 2; k++) { const f = K.box(0.03, 0.002, 0.025, K.plastic(c, 0.4)); f.position.z = 0.075; f.rotation.z = k * Math.PI / 2; d.add(f); }
    }
    return g;
  }

  // ---------------------------------------------------------------- catalog
  const items = [
    // beds and sofas
    { id: 'sofa', name: 'Sage sofa', category: 'Beds & Sofas', price: 2200, size: [7.4, 3.6], top: 0.45, desc: 'A two-seat sage fabric sofa on walnut legs.', build: K_(K => sofa(K, { pillow: '#e0a458' })) },
    { id: 'sofa-pink', name: 'Blush sofa', category: 'Beds & Sofas', price: 2400, size: [7.4, 3.6], top: 0.45, desc: 'A two-seat blush pink sofa with cream cushions.', build: K_(K => sofa(K, { color: '#d99a9a', pillow: '#f2efe6' })) },
    { id: 'sofa-corner', name: 'Corner sofa', category: 'Beds & Sofas', price: 4200, size: [9.4, 6.6], desc: 'A grey L-shaped sofa with a chaise, two cushions and a throw.', build: K_(cornerSofa) },
    { id: 'bed-single', name: 'Single bed', category: 'Beds & Sofas', price: 1800, size: [4.4, 8.4], desc: 'An oak single bed with a green duvet and a plush toy.', build: K_(K => bed(K, { w: 1.0, duvet: '#4f8a6a', plush: '#e0a458' })) },
    { id: 'bed-double', name: 'Double bed', category: 'Beds & Sofas', price: 3600, size: [7, 8.6], desc: 'A double bed with a padded navy headboard and a cream duvet.', build: K_(K => bed(K, { w: 1.6, head: 'pad', headColor: '#2b3a55', duvet: '#e8dfcc', fold: '#2b3a55', wood: 'walnut' })) },
    { id: 'bed-pink', name: 'Pastel bed', category: 'Beds & Sofas', price: 2600, size: [6, 8.6], desc: 'A white bed with a blush headboard, a lilac duvet and a bear.', build: K_(K => bed(K, { w: 1.4, head: 'pad', headColor: '#e2b3ae', duvet: '#c9b6e4', fold: '#fbfaf6', wood: 'ash', plush: '#c79a6a' })) },
    // chairs
    { id: 'armchair', name: 'Velvet armchair', category: 'Chairs', price: 1600, size: [3.4, 3.4], desc: 'A teal velvet armchair on walnut legs.', build: K_(armchair) },
    { id: 'stool', name: 'Bar stool', category: 'Chairs', price: 400, size: [1.6, 1.6], desc: 'An oak-top stool on black steel legs.', build: K_(stool) },
    { id: 'egg-chair', name: 'Hanging egg chair', category: 'Chairs', price: 3200, size: [4, 4], desc: 'A rattan egg chair that sways on its stand.', build: K_(eggChair) },
    { id: 'pouf', name: 'Knitted pouf', category: 'Chairs', price: 500, size: [2, 2], desc: 'A mustard knitted pouf.', build: K_(pouf) },
    // tables
    { id: 'nightstand', name: 'Nightstand', category: 'Desks', price: 600, size: [1.9, 1.7], top: 0.56, desc: 'An oak nightstand with a drawer.', build: K_(nightstand) },
    { id: 'side-table', name: 'Marble side table', category: 'Desks', price: 900, size: [2, 2], top: 0.535, desc: 'A round marble table on a brass stem.', build: K_(sideTable) },
    { id: 'mini-fridge', name: 'Mini fridge', category: 'PC & Tech', price: 1100, size: [2, 2.1], top: 0.84, desc: 'A cream mini fridge for drinks, with room on top.', build: K_(miniFridge) },
    // shelves and books
    { id: 'cube-shelf', name: 'Cube shelf', category: 'Wall & Shelf', price: 1400, size: [4.4, 1.5], top: 1.1, desc: 'A white nine-cube shelf with books, baskets, records and a cactus.', build: K_(cubeShelf) },
    { id: 'ladder-shelf', name: 'Ladder shelf', category: 'Wall & Shelf', price: 1100, size: [2.5, 1.8], desc: 'An ash ladder shelf leaning on the wall, with books and plants.', build: K_(ladderShelf) },
    { id: 'book-ledge', name: 'Book ledge', category: 'Wall & Shelf', price: 600, size: [4, 0.7], wall: true, desc: 'A walnut wall ledge with a row of books.', build: K_(bookLedge) },
    { id: 'book-tower', name: 'Book tower', category: 'Decor', price: 500, size: [1.3, 1], desc: 'Fourteen books stacked on the floor with a cactus on top.', build: K_(bookTower) },
    // things that move
    { id: 'aquarium', name: 'Aquarium', category: 'Decor', price: 3800, size: [4.2, 1.8], desc: 'A 1 m fish tank on a black cabinet, with six fish, weeds and bubbles.', build: K_(aquarium) },
    { id: 'fishbowl', name: 'Goldfish bowl', category: 'Decor', price: 700, size: [1, 1], surface: true, desc: 'A glass bowl with one goldfish swimming laps.', build: K_(fishbowl) },
    { id: 'globe', name: 'Spinning globe', category: 'Decor', price: 600, size: [0.9, 0.9], surface: true, desc: 'A desk globe that turns slowly.', build: K_(globe) },
    { id: 'cradle', name: "Newton's cradle", category: 'Decor', price: 500, size: [1, 0.6], surface: true, desc: 'Five steel balls that click back and forth.', build: K_(cradle) },
    { id: 'plasma-ball', name: 'Plasma ball', category: 'Lighting', price: 900, size: [0.7, 0.7], surface: true, desc: 'A glass ball with purple lightning inside.', build: K_(plasmaBall) },
    { id: 'desk-fan', name: 'Desk fan', category: 'PC & Tech', price: 450, size: [1, 0.7], surface: true, desc: 'A cream desk fan that spins and turns side to side.', build: K_(deskFan) },
    { id: 'fireplace', name: 'Electric fireplace', category: 'Decor', price: 2800, size: [5, 1.4], top: 0.66, desc: 'A white fireplace with flickering flames and a walnut mantel.', build: K_(fireplace) },
    { id: 'arcade', name: 'Arcade cabinet', category: 'PC & Tech', price: 4800, size: [3, 3], desc: 'A purple arcade cabinet with a game running.', build: K_(arcade) },
    { id: 'wall-clock', name: 'Wall clock', category: 'Wall & Shelf', price: 400, size: [1.5, 0.2], wall: true, desc: 'A clock that keeps your real time.', build: K_(wallClock) },
    // accessories
    { id: 'floor-lamp', name: 'Arc floor lamp', category: 'Lighting', price: 1200, size: [3.2, 2.2], desc: 'A black arc lamp with a brass shade.', build: K_(floorLamp) },
    { id: 'guitar', name: 'Acoustic guitar', category: 'Decor', price: 1500, size: [1.6, 1.4], desc: 'An acoustic guitar on a floor stand.', build: K_(guitar) },
    { id: 'framed-trio', name: 'Three prints', category: 'Wall & Shelf', price: 700, size: [4.6, 0.15], wall: true, desc: 'Three framed prints: a sun, waves and a leaf.', build: K_(framedTrio) },
    { id: 'mirror', name: 'Round mirror', category: 'Wall & Shelf', price: 800, size: [2.6, 0.2], wall: true, desc: 'A round mirror in a brass ring.', build: K_(mirror) },
    { id: 'dartboard', name: 'Dartboard', category: 'Wall & Shelf', price: 500, size: [2, 0.4], wall: true, desc: 'A dartboard with three darts in it.', build: K_(dartboard) },
  ];
  items.forEach(it => RoomItems.add(it));

  for (const [list, kind, cat] of [[WALLS, 'wall', 'Walls'], [FLOORS, 'floor', 'Floors']]) for (const [id, name, price, make, base] of list) {
    RoomItems.add({ id, name, category: cat, price, size: [0, 0], gift: !!base, base: !!base, finish: { kind, make },
      desc: kind === 'wall' ? `${name} on both walls.` : `${name} across the floor.`,
      thumb: { dir: kind === 'wall' ? [0.75, 0.6, 1] : [0.7, 1.4, 1] }, build: K_(K => corner(K, id, kind)) });
  }

  RoomItems.finishMat = finishMat;
  RoomItems.finishes = kind => RoomItems.catalog.filter(d => d.finish && d.finish.kind === kind);
})();
