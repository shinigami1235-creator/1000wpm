// Window views (Gid, 28 Nov 2026): what the window looks out on. Bought like walls and floors
// (finish kind 'view'). Each view is a painted scene plus a moving layer (rain, snow, petals,
// fireflies, fish), drawn on a plane in the window hole with a parallax shader, so the scene
// looks far away and shifts as the room turns.
(() => {
  const TAU = Math.PI * 2;
  const K_ = RoomItems.K_;
  const SW = 1024, SH = 768;   // the painted scene, a little bigger than the window shows
  const OW = 384, OH = 288;    // the moving layer, drawn again each frame

  // ---------------------------------------------------------------- painting helpers
  const grad = (c, h, stops) => { const g = c.createLinearGradient(0, 0, 0, h); stops.forEach(([p, col]) => g.addColorStop(p, col)); return g; };
  const ridge = (c, w, h, r, base, amp, col, rough = 0.5) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
    let y = base, v = 0;
    for (let x = 0; x <= w; x += 8) { v += (r() - 0.5) * amp * rough; v *= 0.92; y = base + Math.sin(x / w * TAU * (1 + r() * 0.02)) * amp * 0.3 + v; c.lineTo(x, y); }
    c.lineTo(w, h); c.fill();
  };
  const peaks = (c, w, h, r, base, n, hgt, col, snow) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([i / n * w + (r() - 0.5) * w / n * 0.6, base - hgt * (0.4 + r() * 0.6)]);
    c.fillStyle = col; c.beginPath(); c.moveTo(0, h); c.lineTo(0, base);
    pts.forEach(([x, y], i) => { const px = i ? pts[i - 1][0] : 0; c.lineTo((px + x) / 2, base - (i ? hgt * 0.15 : 0)); c.lineTo(x, y); });
    c.lineTo(w, base); c.lineTo(w, h); c.fill();
    if (snow) { c.fillStyle = snow; pts.forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x - hgt * 0.18, y + hgt * 0.22); c.lineTo(x - hgt * 0.05, y + hgt * 0.17); c.lineTo(x + hgt * 0.04, y + hgt * 0.24); c.lineTo(x + hgt * 0.16, y + hgt * 0.2); c.fill(); }); }
  };
  const pine = (c, x, y, s, col) => { c.fillStyle = col; for (let i = 0; i < 4; i++) { const w = s * (0.55 - i * 0.1), ty = y - i * s * 0.32; c.beginPath(); c.moveTo(x - w, ty); c.lineTo(x, ty - s * 0.55); c.lineTo(x + w, ty); c.fill(); } c.fillRect(x - s * 0.04, y, s * 0.08, s * 0.15); };
  const stars = (c, w, h, r, n, maxY, a = 1) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(255,255,255,${(0.2 + r() * 0.8) * a})`; const s = r() < 0.05 ? 2.2 : 1.1; c.fillRect(r() * w, r() * h * maxY, s, s); } };
  const glowDot = (c, x, y, rad, col) => { const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); };

  // ---------------------------------------------------------------- the scenes
  // draw(K, c, w, h) paints the scene once; layer(r) returns a function that draws the moving layer
  // at time t on a transparent canvas; glow is the colour the window throws into the room
  const SCENES = {
    city: { glow: '#8a6bff', moon: '#7f9cff', draw: (K, c, w, h) => K.drawCity(c, w, h, 14),
      layer: r => { const lights = Array.from({ length: 40 }, () => [r(), 0.45 + r() * 0.5, r() * 9, r() < 0.5 ? '#ffd27a' : '#3ee6ff']);
        return (c, w, h, t) => { for (const [x, y, ph, col] of lights) if (Math.sin(t * 1.3 + ph * 3) > 0.6) { c.fillStyle = col; c.fillRect(x * w, y * h, 2, 3); } };
      } },
    neon: { glow: '#ff3d9a', moon: '#5c7dff',
      draw: (K, c, w, h) => {
        const r = K.rng(31);
        c.fillStyle = grad(c, h, [[0, '#090418'], [0.5, '#2a0b3d'], [1, '#4a1036']]); c.fillRect(0, 0, w, h);
        glowDot(c, w * 0.7, h * 0.35, w * 0.4, 'rgba(255,60,160,.25)');
        for (const [base, col, lit] of [[0.55, '#14092a', 0.4], [0.7, '#0c061c', 0.7], [0.86, '#05030d', 1]]) {
          let x = -10;
          while (x < w) {
            const bw = w * (0.05 + r() * 0.08), top = h * base - h * (0.15 + r() * 0.5) * (1.1 - base);
            c.fillStyle = col; c.fillRect(x, top, bw, h - top);
            for (let wy = top + 8; wy < h - 6; wy += 10) for (let wx = x + 5; wx < x + bw - 5; wx += 8) if (r() < 0.3 * lit) { c.fillStyle = ['#ff3d9a', '#3ee6ff', '#b46bff', '#ffd23d'][r() * 4 | 0]; c.globalAlpha = 0.4 + r() * 0.5; c.fillRect(wx, wy, 4, 5); }
            c.globalAlpha = 1;
            if (r() < 0.5 * lit) { const sc = r() < 0.5 ? '#ff3d9a' : '#3ee6ff'; c.save(); c.shadowColor = sc; c.shadowBlur = 18; c.fillStyle = sc; c.fillRect(x + bw * 0.3, top + 20 + r() * 60, 6, 40 + r() * 60); c.restore(); }
            x += bw + 2;
          }
        }
        c.save(); c.shadowColor = '#3ee6ff'; c.shadowBlur = 20; c.strokeStyle = '#3ee6ff'; c.lineWidth = 4; c.font = `700 54px ${K.MONO}`; c.strokeText('10000', w * 0.12, h * 0.38); c.restore();
      },
      layer: r => { const drops = Array.from({ length: 140 }, () => [r(), r(), 0.6 + r() * 0.8]);
        return (c, w, h, t) => {
          c.strokeStyle = 'rgba(200,220,255,.35)'; c.lineWidth = 1;
          c.beginPath(); for (const [x, y, sp] of drops) { const yy = ((y + t * sp) % 1) * h, xx = x * w - yy * 0.12; c.moveTo(xx, yy); c.lineTo(xx - 3, yy + 14); } c.stroke();
          if (Math.sin(t * 7) * Math.sin(t * 2.3) > 0.2) { c.save(); c.shadowColor = '#ff3d9a'; c.shadowBlur = 14; c.fillStyle = '#ff3d9a'; c.font = `700 22px monospace`; c.fillText('OPEN', w * 0.7, h * 0.5); c.restore(); }
        };
      } },
    sunset: { glow: '#ff8a3a', moon: '#ffb06a',
      draw: (K, c, w, h) => {
        const r = K.rng(5);
        c.fillStyle = grad(c, h, [[0, '#2b1a4a'], [0.35, '#c4467a'], [0.55, '#ff9a4a'], [0.62, '#ffd28a'], [1, '#ffd28a']]); c.fillRect(0, 0, w, h);
        for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(255,150,170,${0.15 + r() * 0.2})`; c.beginPath(); c.ellipse(r() * w, h * (0.15 + r() * 0.3), 60 + r() * 140, 6 + r() * 10, 0, 0, TAU); c.fill(); }
        glowDot(c, w * 0.5, h * 0.6, w * 0.35, 'rgba(255,200,120,.6)');
        c.fillStyle = '#ffe7b0'; c.beginPath(); c.arc(w * 0.5, h * 0.6, w * 0.07, Math.PI, 0); c.fill();
        // a far island on the left, then the sea from the horizon down with the sun's path on it
        c.fillStyle = '#3a1d4a'; c.beginPath(); c.moveTo(0, h * 0.6); c.quadraticCurveTo(w * 0.12, h * 0.53, w * 0.28, h * 0.6); c.fill();
        c.fillStyle = grad(c, h, [[0, '#3a6a8a'], [0.6, '#3a6a8a'], [0.61, '#b0607a'], [0.75, '#3a3a6a'], [1, '#141a3a']]); c.fillRect(0, h * 0.6, w, h * 0.4);
        for (let y = h * 0.605; y < h; y += 5) { const k = (y - h * 0.6) / (h * 0.4); c.fillStyle = `rgba(255,210,140,${0.65 * (1 - k)})`; const ww = w * (0.05 + k * 0.3) * (0.5 + r() * 0.7); c.fillRect(w * 0.5 - ww / 2 + (r() - 0.5) * 30, y, ww, 2); }
        c.fillStyle = '#d9b07a'; c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * 0.9); c.quadraticCurveTo(w * 0.3, h * 0.84, w * 0.55, h * 0.95); c.lineTo(w * 0.55, h); c.fill();
        const palm = (x, y, s, lean) => { c.strokeStyle = '#140a14'; c.lineWidth = s * 0.06; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * s * 0.4, y - s * 0.6, x + lean * s * 0.5, y - s); c.stroke();
          const tx = x + lean * s * 0.5, ty = y - s; c.fillStyle = '#140a14';
          for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.55; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * s * 0.4, ty + Math.sin(a) * s * 0.2 - s * 0.1, tx + Math.cos(a) * s * 0.55, ty + Math.sin(a) * s * 0.35 + s * 0.15); c.quadraticCurveTo(tx + Math.cos(a) * s * 0.3, ty + Math.sin(a) * s * 0.1, tx, ty); c.fill(); } };
        palm(w * 0.12, h * 0.92, h * 0.55, 0.5); palm(w * 0.3, h * 0.9, h * 0.38, -0.3);
      },
      layer: r => { const sp = Array.from({ length: 50 }, () => [0.3 + r() * 0.4, 0.63 + r() * 0.3, r() * 9]); const birds = Array.from({ length: 4 }, () => [r(), 0.2 + r() * 0.2, 0.01 + r() * 0.01]);
        return (c, w, h, t) => {
          for (const [x, y, ph] of sp) { const a = Math.max(0, Math.sin(t * 2 + ph * 5)); if (a > 0.7) { c.fillStyle = `rgba(255,240,200,${a})`; c.fillRect(x * w, y * h, 3, 1.5); } }
          c.strokeStyle = 'rgba(20,10,20,.8)'; c.lineWidth = 1.5;
          for (const [x0, y, s] of birds) { const x = ((x0 + t * s) % 1.2 - 0.1) * w, f = Math.sin(t * 6 + x0 * 9) * 3; c.beginPath(); c.moveTo(x - 6, y * h - f); c.quadraticCurveTo(x - 3, y * h - 3, x, y * h); c.quadraticCurveTo(x + 3, y * h - 3, x + 6, y * h - f); c.stroke(); }
        };
      } },
    snow: { glow: '#9fc8ff', moon: '#c8dcff',
      draw: (K, c, w, h) => {
        const r = K.rng(9);
        c.fillStyle = grad(c, h, [[0, '#1d2b4f'], [0.45, '#5a6f9a'], [0.7, '#c9b8c8'], [1, '#e8eef5']]); c.fillRect(0, 0, w, h);
        stars(c, w, h, r, 60, 0.3, 0.6);
        peaks(c, w, h, r, h * 0.62, 5, h * 0.35, '#4a5a7a', '#e8eef8');
        peaks(c, w, h, r, h * 0.72, 7, h * 0.22, '#33415e', '#d6e0f0');
        c.fillStyle = '#eef3fa'; c.fillRect(0, h * 0.8, w, h * 0.2);
        for (let i = 0; i < 26; i++) { const x = r() * w, y = h * (0.78 + r() * 0.2), s = 40 + r() * 70; pine(c, x, y, s, '#1c2a33'); c.fillStyle = '#f4f8fc'; c.beginPath(); c.moveTo(x - s * 0.15, y - s * 0.75); c.lineTo(x, y - s * 0.87); c.lineTo(x + s * 0.15, y - s * 0.75); c.fill(); }
        for (let i = 0; i < 3; i++) { const x = w * (0.55 + i * 0.12), y = h * 0.83; c.fillStyle = '#3a2a22'; c.fillRect(x, y - 30, 50, 30); c.fillStyle = '#f4f8fc'; c.beginPath(); c.moveTo(x - 8, y - 28); c.lineTo(x + 25, y - 55); c.lineTo(x + 58, y - 28); c.fill(); c.fillStyle = '#ffcf7a'; c.fillRect(x + 8, y - 22, 10, 9); c.fillRect(x + 30, y - 22, 10, 9); }
      },
      layer: r => { const f = Array.from({ length: 160 }, () => [r(), r(), 0.04 + r() * 0.06, 1 + r() * 2.2, r() * 9]);
        return (c, w, h, t) => { c.fillStyle = 'rgba(255,255,255,.85)'; for (const [x, y, sp, s, ph] of f) { const yy = ((y + t * sp) % 1) * h, xx = ((x + Math.sin(t * 0.8 + ph) * 0.02) % 1) * w; c.beginPath(); c.arc(xx, yy, s, 0, TAU); c.fill(); } };
      } },
    forest: { glow: '#7fffb0', moon: '#9fb8ff',
      draw: (K, c, w, h) => {
        const r = K.rng(12);
        c.fillStyle = grad(c, h, [[0, '#050b14'], [0.6, '#0e2230'], [1, '#081a14']]); c.fillRect(0, 0, w, h);
        stars(c, w, h, r, 120, 0.5);
        glowDot(c, w * 0.75, h * 0.2, 110, 'rgba(220,235,255,.35)'); c.fillStyle = '#f2f4ea'; c.beginPath(); c.arc(w * 0.75, h * 0.2, 36, 0, TAU); c.fill();
        for (const [base, col, n, s0] of [[0.6, '#0d2a2a', 30, 70], [0.75, '#0a2020', 24, 110], [0.95, '#051210', 14, 190]]) { c.fillStyle = col; c.fillRect(0, h * base, w, h); for (let i = 0; i < n; i++) pine(c, r() * w, h * base + 10, s0 * (0.7 + r() * 0.6), col); }
      },
      layer: r => { const ff = Array.from({ length: 30 }, () => [r(), 0.55 + r() * 0.4, r() * 9, 0.3 + r() * 0.5]);
        return (c, w, h, t) => { for (const [x, y, ph, sp] of ff) { const a = 0.5 + 0.5 * Math.sin(t * 2 + ph * 4); const xx = (x + Math.sin(t * sp * 0.4 + ph) * 0.03) * w, yy = (y + Math.cos(t * sp * 0.5 + ph) * 0.03) * h; glowDot(c, xx, yy, 7, `rgba(190,255,120,${0.6 * a})`); c.fillStyle = `rgba(230,255,170,${a})`; c.fillRect(xx - 1, yy - 1, 2, 2); } };
      } },
    space: { glow: '#5c9cff', moon: '#bcd4ff',
      draw: (K, c, w, h) => {
        const r = K.rng(44);
        c.fillStyle = '#02030a'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) glowDot(c, r() * w, r() * h * 0.6, 150 + r() * 200, `rgba(${r() < 0.5 ? '120,60,200' : '40,90,200'},.12)`);
        stars(c, w, h, r, 500, 1);
        const cx = w * 0.4, cy = h * 1.55, R = h * 0.95;
        const earth = c.createRadialGradient(cx - R * 0.3, cy - R * 0.5, R * 0.2, cx, cy, R);
        earth.addColorStop(0, '#5fb0ff'); earth.addColorStop(0.7, '#1a4f9a'); earth.addColorStop(1, '#0a1f45');
        c.fillStyle = earth; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
        c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
        for (let i = 0; i < 40; i++) { c.fillStyle = r() < 0.6 ? 'rgba(255,255,255,.35)' : 'rgba(90,140,70,.6)'; c.beginPath(); c.ellipse(cx + (r() - 0.5) * R * 1.6, cy - R * (0.6 + r() * 0.4), 30 + r() * 120, 8 + r() * 20, (r() - 0.5) * 0.4, 0, TAU); c.fill(); }
        c.restore();
        c.strokeStyle = 'rgba(120,190,255,.7)'; c.lineWidth = 6; c.shadowColor = '#7fc8ff'; c.shadowBlur = 20; c.beginPath(); c.arc(cx, cy, R + 2, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.shadowBlur = 0;
        c.fillStyle = '#c8c8c0'; c.beginPath(); c.arc(w * 0.85, h * 0.18, 26, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(w * 0.86, h * 0.17, 6, 0, TAU); c.arc(w * 0.84, h * 0.2, 4, 0, TAU); c.fill();
      },
      layer: r => { const tw = Array.from({ length: 50 }, () => [r(), r() * 0.6, r() * 9]); let shoot = null;
        return (c, w, h, t) => {
          for (const [x, y, ph] of tw) { const a = Math.max(0, Math.sin(t * 3 + ph * 7)); c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(x * w, y * h, 2, 2); }
          if (!shoot && Math.random() < 0.004) shoot = { x: Math.random() * w, y: Math.random() * h * 0.3, t };
          if (shoot) { const k = (t - shoot.t) / 0.8; if (k > 1) shoot = null; else { const x = shoot.x + k * 160, y = shoot.y + k * 60; const g = c.createLinearGradient(x - 60, y - 22, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.9)'); c.strokeStyle = g; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 60, y - 22); c.lineTo(x, y); c.stroke(); } }
        };
      } },
    sakura: { glow: '#ffb6d0', moon: '#ffe2ec',
      draw: (K, c, w, h) => {
        const r = K.rng(8);
        c.fillStyle = grad(c, h, [[0, '#8fc3ec'], [0.6, '#dcecf7'], [1, '#f4e8ef']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#8a9cc0'; c.beginPath(); c.moveTo(w * 0.2, h * 0.68); c.lineTo(w * 0.5, h * 0.28); c.lineTo(w * 0.8, h * 0.68); c.fill();
        c.fillStyle = '#f6f8fc'; c.beginPath(); c.moveTo(w * 0.5, h * 0.28); c.lineTo(w * 0.44, h * 0.36); c.lineTo(w * 0.47, h * 0.35); c.lineTo(w * 0.5, h * 0.38); c.lineTo(w * 0.53, h * 0.35); c.lineTo(w * 0.56, h * 0.36); c.fill();
        ridge(c, w, h, r, h * 0.72, 30, '#7fa874', 0.4);
        const tree = (x, y, s) => { c.strokeStyle = '#4a2f2a'; c.lineWidth = s * 0.06; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - s * 0.5); c.moveTo(x, y - s * 0.4); c.lineTo(x - s * 0.25, y - s * 0.7); c.moveTo(x, y - s * 0.45); c.lineTo(x + s * 0.3, y - s * 0.75); c.stroke();
          for (let i = 0; i < 60; i++) { c.fillStyle = ['#f7b6cc', '#f2a0bc', '#fbd0de', '#ffffff'][r() * 4 | 0]; c.beginPath(); c.arc(x + (r() - 0.5) * s * 0.9, y - s * (0.55 + r() * 0.35), s * (0.05 + r() * 0.06), 0, TAU); c.fill(); } };
        for (let i = 0; i < 6; i++) tree(w * (0.05 + i * 0.19 + r() * 0.05), h * (0.85 + r() * 0.1), h * (0.35 + r() * 0.25));
        c.fillStyle = '#c1272d'; c.fillRect(w * 0.62, h * 0.66, 70, 8); c.fillRect(w * 0.63, h * 0.66, 8, 60); c.fillRect(w * 0.62 + 52, h * 0.66, 8, 60); c.fillRect(w * 0.61, h * 0.64, 92, 9);
      },
      layer: r => { const p = Array.from({ length: 60 }, () => [r(), r(), 0.05 + r() * 0.06, r() * 9]);
        return (c, w, h, t) => { for (const [x, y, sp, ph] of p) { const yy = ((y + t * sp) % 1) * h, xx = ((x + t * sp * 0.6 + Math.sin(t + ph) * 0.02) % 1) * w; c.save(); c.translate(xx, yy); c.rotate(t * 2 + ph); c.fillStyle = '#f7b6cc'; c.beginPath(); c.ellipse(0, 0, 4, 2.2, 0, 0, TAU); c.fill(); c.restore(); } };
      } },
    aurora: { glow: '#3effa0', moon: '#7fffcc',
      draw: (K, c, w, h) => {
        const r = K.rng(61);
        c.fillStyle = grad(c, h, [[0, '#020812'], [0.7, '#0a1e2a'], [1, '#0e2a30']]); c.fillRect(0, 0, w, h);
        stars(c, w, h, r, 260, 0.75);
        peaks(c, w, h, r, h * 0.78, 6, h * 0.25, '#0a1418', '#a8c8d0');
        c.fillStyle = '#c8dce4'; c.fillRect(0, h * 0.86, w, h);
        c.fillStyle = 'rgba(60,255,160,.12)'; c.fillRect(0, h * 0.86, w, h);
        for (let i = 0; i < 12; i++) pine(c, r() * w, h * (0.88 + r() * 0.1), 60 + r() * 80, '#061012');
      },
      layer: () => (c, w, h, t) => {
        // curtains of light: vertical strokes along a wandering line, brighter at the bottom edge
        for (const [col, off, amp, y0] of [['62,255,160', 0, 0.08, 0.3], ['160,90,255', 2.1, 0.06, 0.22]]) {
          for (let x = 0; x < w; x += 3) {
            const u = x / w, y = h * (y0 + amp * Math.sin(u * 7 + t * 0.4 + off) + 0.03 * Math.sin(u * 23 - t * 0.9)), a = 0.25 + 0.2 * Math.sin(u * 13 + t * 1.3 + off);
            const g = c.createLinearGradient(0, y - h * 0.22, 0, y); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${a})`);
            c.fillStyle = g; c.fillRect(x, y - h * 0.22, 3, h * 0.22);
          }
        }
      } },
    ocean: { glow: '#3ec8ff', moon: '#5fd0ff',
      draw: (K, c, w, h) => {
        const r = K.rng(77);
        c.fillStyle = grad(c, h, [[0, '#2a9ad0'], [0.5, '#0d4a7a'], [1, '#04182e']]); c.fillRect(0, 0, w, h);
        for (let i = 0; i < 7; i++) { c.fillStyle = 'rgba(180,230,255,.08)'; c.beginPath(); const x = r() * w; c.moveTo(x, 0); c.lineTo(x + 60, 0); c.lineTo(x + 200 + r() * 120, h); c.lineTo(x + 80, h); c.fill(); }
        c.fillStyle = '#c9b48a'; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 20) c.lineTo(x, h * 0.88 + Math.sin(x * 0.01) * 14); c.lineTo(w, h); c.fill();
        const coral = (x, s, col) => { c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = s * 0.12; const br = (x0, y0, a, l, d) => { if (d > 4) return; const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); br(x1, y1, a - 0.4 - r() * 0.3, l * 0.75, d + 1); br(x1, y1, a + 0.4 + r() * 0.3, l * 0.75, d + 1); }; br(x, h * 0.9, -Math.PI / 2, s * 0.35, 0); };
        coral(w * 0.15, 160, '#ff7a6a'); coral(w * 0.42, 110, '#ffb35c'); coral(w * 0.8, 180, '#d95ad0');
        for (let i = 0; i < 14; i++) { c.fillStyle = '#2f8a5a'; const x = r() * w; c.beginPath(); c.moveTo(x, h * 0.92); c.quadraticCurveTo(x + 20, h * 0.75, x + (r() - 0.5) * 30, h * (0.55 + r() * 0.2)); c.quadraticCurveTo(x + 8, h * 0.75, x + 6, h * 0.92); c.fill(); }
      },
      layer: r => { const fish = Array.from({ length: 9 }, () => [r(), 0.25 + r() * 0.5, 0.03 + r() * 0.04, ['#ffd23d', '#ff7b2e', '#3ee6ff', '#ffffff'][r() * 4 | 0], 4 + r() * 5]); const bub = Array.from({ length: 25 }, () => [r(), r(), 0.08 + r() * 0.1]);
        return (c, w, h, t) => {
          for (const [x0, y, sp, col, s] of fish) { const x = ((x0 + t * sp) % 1.2 - 0.1) * w, yy = y * h + Math.sin(t + x0 * 9) * 6; c.fillStyle = col; c.beginPath(); c.ellipse(x, yy, s, s * 0.5, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(x - s, yy); c.lineTo(x - s * 1.8, yy - s * 0.5); c.lineTo(x - s * 1.8, yy + s * 0.5); c.fill(); }
          c.strokeStyle = 'rgba(220,245,255,.6)'; c.lineWidth = 1; for (const [x, y, sp] of bub) { const yy = (1 - (y + t * sp) % 1) * h; c.beginPath(); c.arc(x * w + Math.sin(t * 2 + y * 9) * 3, yy, 2, 0, TAU); c.stroke(); }
        };
      } },
    rain: { glow: '#a8b8c8', moon: '#c8d4e0',
      draw: (K, c, w, h) => {
        const r = K.rng(19);
        c.fillStyle = grad(c, h, [[0, '#6a7480'], [0.6, '#9aa4ae'], [1, '#55606a']]); c.fillRect(0, 0, w, h);
        for (const [base, col] of [[0.5, '#7d8792'], [0.65, '#67717c'], [0.8, '#4a535c']]) { let x = 0; while (x < w) { const bw = 40 + r() * 90, top = h * base - r() * h * 0.3; c.fillStyle = col; c.fillRect(x, top, bw, h); for (let wy = top + 10; wy < h; wy += 14) for (let wx = x + 6; wx < x + bw - 6; wx += 12) if (r() < 0.25) { c.fillStyle = 'rgba(255,220,150,.5)'; c.fillRect(wx, wy, 5, 6); } x += bw + 4; } }
        c.fillStyle = 'rgba(200,210,220,.25)'; c.fillRect(0, 0, w, h);
      },
      layer: r => { const drops = Array.from({ length: 45 }, () => [r(), r(), 0.02 + r() * 0.08, 2 + r() * 3]); const streaks = Array.from({ length: 120 }, () => [r(), r(), 0.8 + r()]);
        return (c, w, h, t) => {
          c.strokeStyle = 'rgba(220,230,240,.3)'; c.beginPath(); for (const [x, y, sp] of streaks) { const yy = ((y + t * sp) % 1) * h; c.moveTo(x * w, yy); c.lineTo(x * w - 2, yy + 12); } c.stroke();
          // drops on the glass that slide down now and then
          for (const [x, y, sp, s] of drops) { const yy = ((y + Math.max(0, Math.sin(t * sp * 3 + x * 9)) * t * sp * 0.2) % 1) * h; c.fillStyle = 'rgba(230,240,250,.55)'; c.beginPath(); c.ellipse(x * w, yy, s * 0.8, s, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(x * w - s * 0.3, yy - s * 0.4, 1.2, 1.2); }
        };
      } },
  };

  // ---------------------------------------------------------------- the window plane
  // A plane in the window hole. Its shader looks into the scene as if it were depth metres behind
  // the glass: the farther the eye is to one side, the more of the other side shows.
  function viewMesh(K, id, ww, wh, depth = 1.2) {
    const THREE = K.THREE;
    const it = RoomItems.get(id);
    const key = it && it.finish && it.finish.kind === 'view' ? it.finish.scene : 'city';
    const sc = SCENES[key] || SCENES.city;
    const base = K.canvasTex('view|' + key, SW, SH, (c, w, h) => sc.draw(K, c, w, h));
    const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
    const ctx = cv.getContext('2d'), over = new THREE.CanvasTexture(cv); over.colorSpace = THREE.SRGBColorSpace;
    const layer = sc.layer ? sc.layer(K.rng(key.length * 13)) : null;
    const m = new THREE.MeshBasicMaterial({ map: base, color: new THREE.Color(1.15, 1.15, 1.15) });
    m.onBeforeCompile = sh => {
      sh.uniforms.uOver = { value: over }; sh.uniforms.uDepth = { value: depth }; sh.uniforms.uSize = { value: new THREE.Vector2(ww, wh) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLDir;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 vwp = modelMatrix * vec4(transformed, 1.0);\nvLDir = (vec4(vwp.xyz - cameraPosition, 0.0) * modelMatrix).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLDir;\nuniform sampler2D uOver;\nuniform float uDepth;\nuniform vec2 uSize;')
        .replace('#include <map_fragment>', `
          vec3 ld = normalize(vLDir);
          vec2 par = clamp(ld.xy / max(-ld.z, 0.2) * uDepth / uSize, -0.35, 0.35);   // never past the painted margin
          // the scene is drawn 1.35 times the window, so there is room to look round the edges
          vec2 suv = 0.5 + (vMapUv - 0.5) / 1.35 + par / 1.35 * 0.5;
          vec4 sceneC = texture2D(map, suv);
          vec2 ouv = 0.5 + (vMapUv - 0.5) / 1.1 + par / 1.1 * 0.15;
          vec4 ov = texture2D(uOver, ouv);
          diffuseColor.rgb *= mix(sceneC.rgb, ov.rgb, ov.a);`);
    };
    m.customProgramCacheKey = () => 'roomview';
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), m);
    let last = -1;
    const tick = t => {
      if (!layer || t - last < 1 / 30) return;
      last = t;
      ctx.clearRect(0, 0, OW, OH); layer(ctx, OW, OH, t); over.needsUpdate = true;
    };
    tick(0);
    return { mesh, tick, glow: sc.glow, moon: sc.moon };
  }

  // a framed window for the shop picture
  function framed(K, id) {
    const g = K.group(), fm = K.std('#1a1e1c', 0.4, 0.6);
    const v = viewMesh(K, id, 1.6, 1.2, 0.6); v.mesh.position.z = 0.01; g.add(v.mesh);
    for (const [w, h, x, y] of [[1.7, 0.05, 0, 0.62], [1.7, 0.05, 0, -0.62], [0.05, 1.3, -0.82, 0], [0.05, 1.3, 0.82, 0], [0.04, 1.2, 0, 0], [1.6, 0.035, 0, 0.14]]) { const b = K.rbox(w, h, 0.05, 0.006, fm); b.position.set(x, y, 0.03); g.add(b); }
    const sill = K.rbox(1.8, 0.04, 0.16, 0.006, K.std('#3a443e', 0.6)); sill.position.set(0, -0.66, 0.08); g.add(sill);
    g.position.y = 0.7;
    return K.group(g);
  }

  const VIEWS = [
    ['view-city', 'Night city', 0, 'city', true],
    ['view-rain', 'Rainy afternoon', 500, 'rain'],
    ['view-forest', 'Forest with fireflies', 800, 'forest'],
    ['view-snow', 'Snowy mountains', 900, 'snow'],
    ['view-sakura', 'Cherry blossoms', 1000, 'sakura'],
    ['view-sunset', 'Beach sunset', 1200, 'sunset'],
    ['view-neon', 'Neon city in the rain', 1500, 'neon'],
    ['view-ocean', 'Under the sea', 1800, 'ocean'],
    ['view-aurora', 'Northern lights', 2200, 'aurora'],
    ['view-space', 'Earth from orbit', 3000, 'space'],
  ];
  for (const [id, name, price, scene, base] of VIEWS) {
    RoomItems.add({ id, name, category: 'Windows', price, size: [0, 0], gift: !!base, base: !!base, finish: { kind: 'view', scene },
      desc: `${name} outside the window.`, thumb: { dir: [0.25, 0.1, 1] }, build: K_(K => framed(K, id)) });
  }
  RoomItems.viewMesh = viewMesh;
})();
