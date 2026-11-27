// The window views as painted scenes (Gid, 28 Nov 2026), shared by the 3D room (js/room/views.js
// puts them on a plane with a parallax shader) and the tier rooms (js/room/tier-view.js draws them
// on a 2D canvas behind the glass). Each scene has draw(K, c, w, h), which paints it once, and
// layer(r), which returns a function that draws the moving layer (rain, snow, petals, fireflies,
// fish) at time t on a transparent canvas; glow is the colour the window throws into the room.
// The scenes are painted like photographs (Gid, 28 Nov: "flat cartoons pasted into photographs"):
// noise for rock, snow, cloud, water and haze, thousands of small marks for leaves and blossoms, and
// distance shown by haze and softness. Any size works; every length is a fraction of w or h.
// tier-view.js reads a scene's fine (how small the moving layer is drawn) and fade (how faint).
//   RoomScenes.SCENES, RoomScenes.K (rng, MONO, drawCity for pages without three.js)
(() => {
  const TAU = Math.PI * 2;
  const rng = seed => () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  // ---------------------------------------------------------------- noise
  const hash = (x, y, s) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  function noise(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s = 0, oct = 5, lac = 2.03, gain = 0.5) {
    let t = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { t += a * noise(x * f, y * f, s + i * 31); n += a; a *= gain; f *= lac; }
    return t / n;
  }
  const hash3 = (x, y, z, s) => hash(x + Math.imul(z, 1013), y - Math.imul(z, 7919), s);
  function noise3(x, y, z, s = 0) {
    const zi = Math.floor(z), zf = z - zi, w = zf * zf * (3 - 2 * zf);
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = k => { const a = hash3(xi, yi, k, s), b = hash3(xi + 1, yi, k, s), c = hash3(xi, yi + 1, k, s), d = hash3(xi + 1, yi + 1, k, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
    const p = at(zi); return p + (at(zi + 1) - p) * w;
  }
  function fbm3(x, y, z, s = 0, oct = 5) {
    let t = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { t += a * noise3(x * f, y * f, z * f, s + i * 31); n += a; a *= 0.5; f *= 2.03; }
    return t / n;
  }
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

  // every pixel through fn(x, y, o): o holds the colour already there and takes the new one;
  // return false to leave a pixel as it was
  function pixels(c, w, h, fn, y0 = 0, y1 = h) {
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(h, Math.ceil(y1));
    if (y1 <= y0) return;
    const im = c.getImageData(0, y0, w, y1 - y0), d = im.data, o = [0, 0, 0];
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
      const i = ((y - y0) * w + x) * 4;
      o[0] = d[i]; o[1] = d[i + 1]; o[2] = d[i + 2];
      if (fn(x, y, o) === false) continue;
      d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255;
    }
    c.putImageData(im, 0, y0);
  }
  // a vertical sky: stops [[at, '#hex'], ...]
  function sky(c, w, h, stops) {
    const g = c.createLinearGradient(0, 0, 0, h);
    stops.forEach(([p, col]) => g.addColorStop(p, col));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function glow(c, x, y, rad, col, a = 1) {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); c.restore();
  }
  function starfield(c, w, h, r, n, maxY, bright = 1) {
    const s = Math.max(1, w / 1024);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = Math.pow(r(), 1.3) * h * maxY, b = Math.pow(r(), 3) * bright;
      const tint = r(); c.fillStyle = `rgba(${tint < 0.2 ? '255,214,180' : tint < 0.45 ? '190,210,255' : '255,255,255'},${(0.15 + b * 0.85) * (1 - y / (h * maxY) * 0.7)})`;
      const z = (b > 0.7 ? 1.6 : 1) * s; c.fillRect(x, y, z, z);
    }
  }
  // soft clouds: fbm stretched sideways, lit from below by lit and shaded at the top by dark
  function clouds(c, w, h, s, { y0, y1, cover = 0.5, lit, dark, alpha = 0.8, sx = 2.5, sy = 10 }) {
    const L = hex(lit), D = hex(dark);
    pixels(c, w, h, (x, y, o) => {
      const v = (y - y0) / (y1 - y0), n = fbm(x / w * sx + fbm(x / w * 2, y / h * 3, s + 9, 3) * 0.8, y / h * sy, s, 6);
      const d = smooth(cover, cover + 0.22, n) * Math.sin(Math.PI * clamp(v)) * alpha;
      if (d <= 0.002) return false;
      const t = clamp(0.25 + (n - cover) * 2.2 + v * 0.4), col = mixc(D, L, t);
      o[0] = mix(o[0], col[0], d); o[1] = mix(o[1], col[1], d); o[2] = mix(o[2], col[2], d);
    }, y0, y1);
  }
  // a mountain range from y (its foot) up to amp: rock, snow lying on the gentler slopes and the
  // high parts, lit from one side, hazed toward fog with distance
  function range(c, w, h, s, { y, amp, sc = 3, rock, snow, fog, haze = 0, light = -1, snowLine = 0.45, bright = 1 }) {
    const R = hex(rock), S = snow ? hex(snow) : null, F = hex(fog);
    const top = new Float32Array(w + 2);
    for (let x = 0; x <= w + 1; x++) {
      const u = x / w * sc, n = fbm(u, 0.5, s, 7, 2.1, 0.52), rid = 1 - Math.abs(fbm(u * 1.7, 3.5, s + 3, 5) * 2 - 1);
      top[x] = h * y - h * amp * (0.62 * n + 0.38 * rid * rid) * 1.5 + h * amp * 0.35;
    }
    let ymin = h; for (let x = 0; x < w; x++) ymin = Math.min(ymin, top[x]);
    // the face as a heightfield of ridges and gullies; light from the side, snow where it faces up
    const H = (u, v) => { let t = 0, am = 0.5, f = 1; const wu = (fbm(u * 0.5, v * 0.5, s + 7, 3) - 0.5) * 0.8; for (let i = 0; i < 6; i++) { const n = 1 - Math.abs(noise((u + wu) * f, v * f * 1.4, s + 11 + i * 13) * 2 - 1); t += am * n * n; am *= 0.5; f *= 2.1; } return t; };
    const e = 0.004 * sc * 5;
    pixels(c, w, h, (x, yy, o) => {
      const t = top[x];
      if (yy < t - 1) return false;
      const edge = clamp(yy - t + 1);
      const dep = clamp((yy - t) / (h * amp * 1.2));
      const u = x / w * sc * 5, v = yy / h * 7;
      const z = H(u, v), dx = (H(u + e, v) - z) / e, dy = (H(u, v + e) - z) / e;
      // light from the left (light -1) or right, a little from above
      let lit = clamp(0.5 + (-dx * light * 0.09) - dy * 0.05, 0.08, 1.15);
      let col = R;
      if (S) {
        const sn = smooth(0.48, 0.62, z * 0.7 - dy * 0.04 + (1 - dep) * snowLine - dep * 0.3 + (fbm(u * 3, v * 3, s + 2, 3) - 0.5) * 0.3);
        col = mixc(R, S, sn);
      }
      lit *= bright * (0.85 + 0.3 * (1 - dep));
      let r = col[0] * lit, gg = col[1] * lit, b = col[2] * lit;
      const hz = clamp(haze * (0.75 + dep * 0.5));
      r = mix(r, F[0], hz); gg = mix(gg, F[1], hz); b = mix(b, F[2], hz);
      o[0] = mix(o[0], r, edge); o[1] = mix(o[1], gg, edge); o[2] = mix(o[2], b, edge);
    }, ymin - 2, h);
    return top;
  }
  // a band of mist lying over everything between y0 and y1, thickest at peak (0..1 of the band)
  function mist(c, w, h, s, y0, y1, col, a, peak = 0.6) {
    const F = hex(col);
    pixels(c, w, h, (x, y, o) => {
      const v = (y - y0) / (y1 - y0), k = v < peak ? smooth(0, peak, v) : 1 - smooth(peak, 1, v);
      const d = k * a * (0.6 + 0.8 * fbm(x / w * 4, y / h * 14, s, 4));
      o[0] = mix(o[0], F[0], d); o[1] = mix(o[1], F[1], d); o[2] = mix(o[2], F[2], d);
    }, y0, y1);
  }
  // draws fn on its own layer, then lays the layer on c softened by blur: a filter on every small
  // fill would blur the whole canvas each time
  function soft(c, blur, fn) {
    if (!blur) { fn(c); return; }
    const cv = document.createElement('canvas'); cv.width = c.canvas.width; cv.height = c.canvas.height;
    const l = cv.getContext('2d'); fn(l);
    c.save(); c.filter = `blur(${blur}px)`; c.drawImage(cv, 0, 0); c.restore();
  }
  // a conifer: a ragged spire of branch tiers, built from short strokes so the outline is broken
  function conifer(c, x, y, hh, col, r, snow) {
    const wd = hh * (0.26 + r() * 0.08);
    c.fillStyle = col;
    c.fillRect(x - hh * 0.02, y - hh * 0.12, hh * 0.04, hh * 0.14);
    const tiers = 7 + (r() * 5 | 0);
    for (let i = 0; i < tiers; i++) {
      const k = i / tiers, ty = y - hh * 0.08 - k * hh * 0.88, tw = wd * (1 - k) * (0.85 + r() * 0.3), th = hh * 0.2 * (1 - k * 0.5);
      const R = [], L = [], n = 6;
      for (let j = 0; j <= n; j++) { const u = j / n; R.push([x + tw * u * (j % 2 ? 0.75 : 1), ty - th + th * u + (r() - 0.5) * th * 0.25]); L.push([x - tw * u * (j % 2 ? 0.75 : 1), ty - th + th * u + (r() - 0.5) * th * 0.25]); }
      c.beginPath(); c.moveTo(x, ty - th); R.forEach(p => c.lineTo(p[0], p[1])); for (let j = n; j >= 0; j--) c.lineTo(L[j][0], L[j][1]); c.fill();
      // snow lying along the upper edge of the branches
      if (snow) { c.strokeStyle = snow; c.lineWidth = Math.max(0.5, hh * 0.007); c.lineJoin = 'round'; for (const side of [R, L]) { c.beginPath(); c.moveTo(x, ty - th + hh * 0.004); for (let j = 1; j < n; j++) c.lineTo(side[j][0] * 0.96 + x * 0.04, side[j][1] - hh * 0.003); c.stroke(); } }
    }
    c.beginPath(); c.moveTo(x, y - hh); c.lineTo(x - hh * 0.015, y - hh * 0.8); c.lineTo(x + hh * 0.015, y - hh * 0.8); c.fill();
  }
  // a row of conifers along the line y(x), heights h0..h1, softened by blur
  function forest(c, w, h, r, { y, h0, h1, n, col, blur = 0, snow = null, jitter = 0.03 }) {
    soft(c, blur * w / 1024, c => { for (let i = 0; i < n; i++) { const x = r() * w * 1.04 - w * 0.02; conifer(c, x, y(x / w) * h + r() * h * jitter, h * (h0 + r() * (h1 - h0)), col, r, snow); } });
  }

  // ---------------------------------------------------------------- the old flat night city
  // kept for the 3D room's thumbnails (K.drawCity in js/room/kit.js paints the same)
  function drawCity(c, w, h, seed) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05060f'); g.addColorStop(0.55, '#16163a'); g.addColorStop(1, '#3a1d4a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.6})`; c.fillRect(r() * w, r() * h * 0.4, 1.2, 1.2); }
    for (const [base, col, lit] of [[0.5, '#0d0f22', 0.35], [0.62, '#090a18', 0.6], [0.74, '#050610', 1]]) {
      let x = -10;
      while (x < w) {
        const bw = w * (0.05 + r() * 0.09), bh = h * (0.2 + r() * 0.5) * (1.2 - base), top = h * base - bh + h * 0.25;
        c.fillStyle = col; c.fillRect(x, top, bw, h - top);
        for (let wy = top + 6; wy < h - 4; wy += 7) for (let wx = x + 4; wx < x + bw - 4; wx += 6) if (r() < 0.32 * lit) { c.fillStyle = ['#ffd27a', '#ffe7b0', '#3ee6ff', '#ff7ab6', '#39ff88'][r() < 0.8 ? (r() * 2 | 0) : 2 + (r() * 3 | 0)]; c.globalAlpha = 0.5 + r() * 0.5; c.fillRect(wx, wy, 3, 4); }
        c.globalAlpha = 1;
        x += bw + r() * 6;
      }
    }
  }
  const K2 = { rng, MONO: '"Share Tech Mono", "JetBrains Mono", ui-monospace, monospace', drawCity };

  // ---------------------------------------------------------------- city blocks, near to far
  // one layer of buildings: tops from base - hgt, facades a touch lighter than col with lit windows
  function city(c0, w, h, r, { base, h0, h1, col, edge, lit, wins, blur = 0, ww = 0.006, gap = 0.012, signs = null, tops = 0.3 }) {
    soft(c0, blur * w / 1024, c => {
    let x = -w * 0.02;
    while (x < w * 1.02) {
      const bw = w * (0.035 + r() * 0.07), top = h * (base - h0 - r() * (h1 - h0));
      c.fillStyle = col; c.fillRect(x, top, bw, h - top + 2);
      // a lighter edge where the sky lights one side
      c.fillStyle = edge; c.fillRect(x, top, Math.max(1, bw * 0.06), h - top);
      if (r() < tops) { const tw = bw * (0.3 + r() * 0.4), th = h * (0.01 + r() * 0.03); c.fillStyle = col; c.fillRect(x + (bw - tw) / 2, top - th, tw, th + 1); if (r() < 0.5) c.fillRect(x + bw / 2 - 0.5, top - th - h * 0.04, Math.max(1, w / 1024), h * 0.04); }
      const wpx = w * ww, gx = w * gap, gy = w * gap * 1.25;
      for (let wy = top + gy; wy < h - gy; wy += gy) {
        const rowOn = r() < 0.85;
        for (let wx = x + gx * 0.6; wx < x + bw - wpx - gx * 0.3; wx += gx) {
          if (!rowOn || r() > lit) continue;
          c.globalAlpha = 0.35 + r() * 0.6; c.fillStyle = wins[r() * wins.length | 0];
          c.fillRect(wx, wy, wpx, wpx * 1.3);
        }
      }
      c.globalAlpha = 1;
      if (signs && r() < signs.p) {
        const sc = signs.cols[r() * signs.cols.length | 0], sx = x + bw * (0.2 + r() * 0.5), sy = top + (h - top) * (0.1 + r() * 0.4), vert = r() < 0.6;
        c.save(); c.shadowColor = sc; c.shadowBlur = w * 0.02; c.fillStyle = sc; c.globalAlpha = 0.9;
        if (vert) c.fillRect(sx, sy, w * 0.006, h * (0.05 + r() * 0.1)); else c.fillRect(sx - bw * 0.2, sy, bw * 0.5, h * 0.008);
        c.restore();
      }
      x += bw + r() * w * 0.004;
    }
    });
  }

  // ---------------------------------------------------------------- the scenes
  const SCENES = {
    city: { glow: '#8a6bff', moon: '#7f9cff', draw: (K, c, w, h) => K.drawCity(c, w, h, 14),
      layer: r => { const lights = Array.from({ length: 40 }, () => [r(), 0.45 + r() * 0.5, r() * 9, r() < 0.5 ? '#ffd27a' : '#3ee6ff']);
        return (c, w, h, t) => { for (const [x, y, ph, col] of lights) if (Math.sin(t * 1.3 + ph * 3) > 0.6) { c.fillStyle = col; c.fillRect(x * w, y * h, 2, 3); } };
      } },

    // ---- snowy mountains by moonlight, a pine forest below and a few cabin lights
    snow: { glow: '#9fc8ff', moon: '#c8dcff', fine: 0.4, fade: 0.5,
      draw: (K, c, w, h) => {
        const r = rng(9);
        sky(c, w, h, [[0, '#060c1a'], [0.35, '#16233d'], [0.6, '#34466a'], [1, '#56688c']]);
        starfield(c, w, h, r, 900 * w / 1024, 0.5, 0.7);
        glow(c, w * 0.8, h * 0.16, w * 0.3, 'rgba(170,190,230,.22)');
        glow(c, w * 0.8, h * 0.16, w * 0.05, 'rgba(235,240,255,.55)');
        c.fillStyle = '#e8eefa'; c.beginPath(); c.arc(w * 0.8, h * 0.16, w * 0.014, 0, TAU); c.fill();
        clouds(c, w, h, 4, { y0: h * 0.05, y1: h * 0.42, cover: 0.55, lit: '#8a9cc4', dark: '#1a2540', alpha: 0.55 });
        range(c, w, h, 21, { y: 0.6, amp: 0.3, sc: 2.2, rock: '#2c3854', snow: '#a9b9d6', fog: '#4c5d80', haze: 0.45, light: -1, bright: 0.8 });
        range(c, w, h, 33, { y: 0.7, amp: 0.2, sc: 3.4, rock: '#1c2638', snow: '#9eafcc', fog: '#41507a', haze: 0.3, light: -1, snowLine: 0.4, bright: 0.78 });
        mist(c, w, h, 2, h * 0.6, h * 0.8, '#6b7c9e', 0.35);
        // snowfield, then the forest
        pixels(c, w, h, (x, y, o) => {
          const top = h * (0.76 + 0.03 * Math.sin(x / w * 5) + 0.03 * (fbm(x / w * 3, 0, 77, 4) - 0.5));
          if (y < top) return false;
          const n = fbm(x / w * 12, y / h * 30, 78, 5), d = (y - top) / (h - top + 1);
          const L = 150 + n * 50 - d * 40;
          o[0] = L * 0.78; o[1] = L * 0.84; o[2] = L * 1.0;
        }, h * 0.7, h);
        forest(c, w, h, r, { y: u => 0.79 + 0.02 * Math.sin(u * 7), h0: 0.05, h1: 0.09, n: 160 * w / 1024, col: '#1b2638', blur: 1.2, snow: 'rgba(190,205,232,.45)' });
        forest(c, w, h, r, { y: u => 0.88 + 0.03 * Math.sin(u * 4 + 1), h0: 0.1, h1: 0.2, n: 70 * w / 1024, col: '#0e1622', blur: 0.6, snow: 'rgba(200,214,240,.5)' });
        // cabin windows far down in the trees
        for (const [x, y] of [[0.62, 0.795], [0.645, 0.8], [0.3, 0.805]]) { glow(c, w * x, h * y, w * 0.012, 'rgba(255,190,110,.5)'); c.fillStyle = '#ffd59a'; c.fillRect(w * x, h * y, Math.max(1, w * 0.002), Math.max(1, w * 0.0018)); }
        forest(c, w, h, r, { y: u => 1.02, h0: 0.22, h1: 0.34, n: 14 * w / 1024, col: '#070c13', snow: 'rgba(170,186,215,.35)' });
      },
      layer: r => { const f = Array.from({ length: 260 }, () => [r(), r(), 0.03 + r() * 0.05, 0.35 + Math.pow(r(), 3) * 1.1, r() * 9, 0.25 + r() * 0.6]);
        return (c, w, h, t) => { for (const [x, y, sp, s, ph, a] of f) { const yy = ((y + t * sp) % 1) * h, xx = ((x + Math.sin(t * 0.8 + ph) * 0.015 + t * 0.006) % 1) * w; c.fillStyle = `rgba(235,242,255,${a})`; c.beginPath(); c.arc(xx, yy, s, 0, TAU); c.fill(); } };
      } },

    // ---- the night side of Earth from orbit: the limb, the dawn line, cities, clouds, the airglow
    space: { glow: '#5c9cff', moon: '#bcd4ff', fine: 0.5, fade: 0.8,
      draw: (K, c, w, h) => {
        const r = rng(44);
        c.fillStyle = '#010207'; c.fillRect(0, 0, w, h);
        // the Milky Way: a faint dusty band across the top
        pixels(c, w, h, (x, y, o) => {
          const u = x / w, v = y / h, d = v - (0.08 + u * 0.32), band = Math.exp(-d * d / 0.012);
          const n = fbm(u * 6, v * 6, 3, 6), dust = smooth(0.45, 0.7, fbm(u * 10, v * 10, 5, 5));
          const k = band * (0.25 + n * 0.75) * (1 - dust * 0.7) * 30;
          o[0] += k * 0.9; o[1] += k * 0.9; o[2] += k * 1.05;
        }, 0, h * 0.6);
        starfield(c, w, h, r, 2600 * w / 1024, 0.75, 1);
        const cx = w * 0.42, cy = h * 2.05, R = h * 1.55;
        // the sun just past the planet's right edge, lighting a thin dawn crescent
        const sx = 0.9, sy = 0.28, sz = -0.55, sl = Math.hypot(sx, sy, sz);
        pixels(c, w, h, (x, y, o) => {
          const dx = (x - cx) / R, dy = (y - cy) / R, d2 = dx * dx + dy * dy;
          const d = Math.sqrt(d2);
          if (d > 1.06) return false;
          if (d > 1) {
            // airglow and atmosphere above the limb
            const a = 1 - (d - 1) / 0.06, lit = clamp(0.25 + (dx * sx - dy * sy) / sl * 1.4);
            const k = a * a;
            o[0] = mix(o[0], 40 + 160 * lit, k * (0.3 + lit * 0.6)); o[1] = mix(o[1], 90 + 140 * lit, k * (0.4 + lit * 0.5)); o[2] = mix(o[2], 200 + 55 * lit, k * (0.55 + lit * 0.4));
            return;
          }
          const nz = Math.sqrt(1 - d2), nx = dx, ny = -dy;
          // a point on the globe, tipped toward us, for noise without poles
          const px = nx, py = ny * 0.85 + nz * 0.53, pz = nz * 0.85 - ny * 0.53;
          const q = 2.2, wq = fbm3(px * q, py * q, pz * q, 51, 3) * 1.4;
          const land = smooth(0.48, 0.51, fbm3(px * q + wq, py * q + wq, pz * q, 57, 7));
          const cq = 5, cw = fbm3(px * 3, py * 3, pz * 3, 61, 3) * 2.2;
          const cloud = smooth(0.52, 0.78, fbm3(px * cq + cw, py * cq * 1.6, pz * cq + cw, 62, 6));
          const u = px * 6, v = py * 6;
          const sun = (nx * sx + ny * sy + nz * sz) / sl, day = smooth(-0.06, 0.3, sun);
          const ocean = [6, 22, 52], ground = mixc([52, 60, 38], [92, 78, 54], fbm(u * 5, v * 5, 53, 4));
          let col = mixc(ocean, ground, land);
          col = mixc(col, [232, 236, 245], cloud * 0.92);
          const sh = clamp(sun * 1.2 + 0.1);
          let rr = col[0] * day * (0.35 + sh * 0.8), gg = col[1] * day * (0.35 + sh * 0.8), bb = col[2] * day * (0.35 + sh * 0.8);
          // sun glint on the sea
          const gl = Math.pow(clamp(sun), 40) * (1 - land) * (1 - cloud) * 220; rr += gl; gg += gl * 0.9; bb += gl * 0.75;
          // city lights on the night side, dimmed under cloud
          const night = 1 - smooth(-0.15, 0.05, sun);
          if (night > 0 && land > 0.5) {
            const cn = fbm3(px * 30, py * 30, pz * 30, 71, 4), spark = hash3(Math.floor(px * 700), Math.floor(py * 700), Math.floor(pz * 700), 72);
            const L = (smooth(0.62, 0.85, cn) * 0.18 + (spark > 0.93 ? spark - 0.93 : 0) * 14 * smooth(0.42, 0.62, cn)) * night * (1 - cloud * 0.85) * 255;
            rr += L; gg += L * 0.72; bb += L * 0.38;
          }
          // the faint glow of moonlit cloud tops on the night side
          rr += cloud * night * 10; gg += cloud * night * 12; bb += cloud * night * 18;
          // atmosphere toward the limb
          const rim = Math.pow(1 - nz, 2.2), rl = clamp(0.2 + sun);
          rr = mix(rr, 70 * rl + 8, rim * 0.7); gg = mix(gg, 130 * rl + 16, rim * 0.7); bb = mix(bb, 255 * rl + 40, rim * 0.75);
          o[0] = rr; o[1] = gg; o[2] = bb;
        }, cy - R * 1.07, h);
        // the sun's flare at the dawn line
        const fx = cx + R * 0.86 * 0.82, fy = cy - R * Math.sqrt(1 - 0.86 * 0.86 * 0.67);
        glow(c, fx, fy, w * 0.25, 'rgba(255,220,170,.18)');
        glow(c, fx, fy, w * 0.04, 'rgba(255,245,225,.7)');
      },
      layer: r => { const tw = Array.from({ length: 50 }, () => [r(), r() * 0.45, r() * 9]); let shoot = null;
        return (c, w, h, t) => {
          for (const [x, y, ph] of tw) { const a = Math.max(0, Math.sin(t * 2 + ph * 7)) * 0.6; c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(x * w, y * h, 1, 1); }
          if (!shoot && Math.random() < 0.003) shoot = { x: Math.random() * w, y: Math.random() * h * 0.25, t };
          if (shoot) { const k = (t - shoot.t) / 0.7; if (k > 1) shoot = null; else { const x = shoot.x + k * 120, y = shoot.y + k * 40; const g = c.createLinearGradient(x - 40, y - 13, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.7 * (1 - k)})`); c.strokeStyle = g; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 40, y - 13); c.lineTo(x, y); c.stroke(); } }
        };
      } },

    // ---- cherry trees at dusk, Fuji behind, lanterns along a path, a torii in the mist
    sakura: { glow: '#ffb6d0', moon: '#ffe2ec', fine: 0.42, fade: 0.6,
      draw: (K, c, w, h) => {
        const r = rng(8);
        sky(c, w, h, [[0, '#1b2444'], [0.3, '#3d4470'], [0.52, '#8a7598'], [0.64, '#d8a3a8'], [1, '#e8b9b0']]);
        clouds(c, w, h, 14, { y0: h * 0.04, y1: h * 0.45, cover: 0.5, lit: '#f1b9b4', dark: '#3b3d68', alpha: 0.7, sx: 2, sy: 9 });
        starfield(c, w, h, r, 120, 0.15, 0.4);
        // Fuji: a broad cone, snow down the gullies
        pixels(c, w, h, (x, y, o) => {
          const u = (x / w - 0.5) / 0.3, top = h * (0.38 + Math.pow(Math.abs(u), 1.5) * 0.3 + (Math.abs(u) < 0.07 ? 0.004 : 0) + (fbm(x / w * 30, 1, 5, 3) - 0.5) * 0.006);
          if (y < top) return false;
          const d = (y - top) / h, gul = fbm(x / w * 50 + fbm(x / w * 20, y / h * 10, 4, 3) * 2, y / h * 22, 6, 5);
          const sn = smooth(0.012, -0.01, d - 0.05 - (gul - 0.5) * 0.09 + Math.abs(u) * 0.02);
          const lit = 0.8 - clamp(u, -1, 1) * 0.12 + (gul - 0.5) * 0.25 * sn;
          const rock = mixc([70, 72, 108], [96, 92, 126], fbm(x / w * 8, y / h * 8, 7, 3)), snowc = [214, 200, 220], col = mixc(rock, snowc, sn);
          const hz = 0.5 + d * 0.9;
          o[0] = mix(col[0] * lit, 196, hz); o[1] = mix(col[1] * lit, 160, hz); o[2] = mix(col[2] * lit, 180, hz);
        }, h * 0.35, h * 0.8);
        range(c, w, h, 15, { y: 0.74, amp: 0.08, sc: 4, rock: '#3a3c5e', fog: '#9c8aa8', haze: 0.45, light: -1 });
        mist(c, w, h, 16, h * 0.62, h * 0.82, '#c4a3b4', 0.55, 0.7);
        range(c, w, h, 17, { y: 0.82, amp: 0.07, sc: 6, rock: '#262a40', fog: '#806e8e', haze: 0.3, light: -1 });
        // torii in the mist
        soft(c, 1.2 * w / 1024, c => { c.fillStyle = 'rgba(92,40,56,.8)';
        const tx = w * 0.66, ty = h * 0.8, ts = h * 0.12;
        c.fillRect(tx - ts * 0.42, ty - ts, ts * 0.06, ts); c.fillRect(tx + ts * 0.36, ty - ts, ts * 0.06, ts);
        c.beginPath(); c.moveTo(tx - ts * 0.62, ty - ts * 0.98); c.quadraticCurveTo(tx, ty - ts * 0.92, tx + ts * 0.68, ty - ts * 1.02); c.lineTo(tx + ts * 0.66, ty - ts * 0.92); c.quadraticCurveTo(tx, ty - ts * 0.84, tx - ts * 0.6, ty - ts * 0.88); c.fill();
        c.fillRect(tx - ts * 0.5, ty - ts * 0.76, ts * 1.06, ts * 0.06);
        });
        // ground, then the lantern path
        pixels(c, w, h, (x, y, o) => { if (y < h * 0.86) return false; const n = fbm(x / w * 20, y / h * 40, 18, 4); o[0] = 34 + n * 22; o[1] = 30 + n * 18; o[2] = 42 + n * 20; }, h * 0.86, h);
        for (let i = 0; i < 9; i++) { const x = w * (0.08 + i * 0.11 + r() * 0.03), y = h * (0.86 + r() * 0.01); glow(c, x, y, w * 0.03, 'rgba(255,170,90,.35)'); c.fillStyle = '#ffcf8a'; c.fillRect(x - w * 0.003, y - h * 0.012, w * 0.006, h * 0.012); }
        // cherry trees: crooked branches, then thousands of blossoms around the branch tips
        // a cherry tree: the branches worked out first, then a soft mass of bloom behind them, the
        // branches, and thousands of small flowers on top, lighter where the sky lights them
        const tree = (x, y, s, blur, shade) => {
          const segs = [], tips = [];
          const br = (x0, y0, a, l, d) => {
            const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
            segs.push([x0, y0, (x0 + x1) / 2 + (r() - 0.5) * l * 0.35, (y0 + y1) / 2 + (r() - 0.5) * l * 0.35, x1, y1, Math.max(0.6, s * 0.07 * Math.pow(0.62, d))]);
            if (d >= 5) { tips.push([x1, y1]); return; }
            if (d >= 3) tips.push([x1, y1]);
            const n = d < 1 ? 2 : 2 + (r() < 0.35 ? 1 : 0);
            for (let i = 0; i < n; i++) br(x1, y1, a + (r() - 0.5) * 1.1 + (i - (n - 1) / 2) * 0.62, l * (0.64 + r() * 0.2), d + 1);
          };
          br(x, y, -Math.PI / 2 + (r() - 0.5) * 0.25, s * 0.3, 0);
          const tone = (p, k, al) => `rgba(${p[0] * k | 0},${p[1] * k | 0},${p[2] * k | 0},${al})`;
          const lift = by => (0.6 + clamp(1 - (by - (y - s)) / s) * 0.45) * shade;
          soft(c, (blur + 5) * w / 1024, c => { for (const [tx2, ty2] of tips) { const k = lift(ty2); c.fillStyle = tone([200, 120, 150], k * 0.9, 0.55); c.beginPath(); c.ellipse(tx2, ty2, s * 0.09, s * 0.065, 0, 0, TAU); c.fill(); } });
          soft(c, blur * w / 1024, c => {
            c.strokeStyle = shade < 0.7 ? '#24181e' : '#2e1e22'; c.lineCap = 'round';
            for (const [x0, y0, qx, qy, x1, y1, lw] of segs) { c.lineWidth = lw; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(qx, qy, x1, y1); c.stroke(); }
            const pal = [[247, 190, 208], [240, 168, 192], [252, 214, 226], [255, 236, 240], [226, 150, 178]];
            for (const [tx2, ty2] of tips) for (let i = 0, n = 60 + s / h * 160; i < n; i++) {
              const a = r() * TAU, rd = Math.pow(r(), 0.6) * s * 0.1, bx = tx2 + Math.cos(a) * rd, by = ty2 + Math.sin(a) * rd * 0.7;
              const k = lift(by) * (0.75 + r() * 0.4) * (Math.sin(a) < 0 ? 1.08 : 0.85);
              c.fillStyle = tone(pal[r() * pal.length | 0], k, 0.5 + r() * 0.5);
              c.beginPath(); c.arc(bx, by, Math.max(0.5, h * (0.0015 + r() * 0.0025)), 0, TAU); c.fill();
            }
          });
        };
        for (let i = 0; i < 5; i++) tree(w * (0.1 + i * 0.2 + r() * 0.05), h * 0.84, h * (0.22 + r() * 0.06), 1.4, 0.62);
        tree(w * 0.12, h * 1.04, h * 0.75, 0.4, 0.82);
        tree(w * 0.94, h * 1.06, h * 0.68, 0.4, 0.78);
      },
      layer: r => { const p = Array.from({ length: 70 }, () => [r(), r(), 0.04 + r() * 0.05, r() * 9, 0.5 + r() * 0.8]);
        return (c, w, h, t) => { for (const [x, y, sp, ph, s] of p) { const yy = ((y + t * sp) % 1) * h, xx = ((x + t * sp * 0.6 + Math.sin(t + ph) * 0.02) % 1) * w; c.save(); c.translate(xx, yy); c.rotate(t * 2 + ph); c.fillStyle = 'rgba(250,200,215,.8)'; c.beginPath(); c.ellipse(0, 0, 1.6 * s, 0.9 * s, 0, 0, TAU); c.fill(); c.restore(); } };
      } },

    // ---- the sun on the sea line, clouds lit from under, palms in silhouette
    sunset: { glow: '#ff8a3a', moon: '#ffb06a', fine: 0.45, fade: 0.7,
      draw: (K, c, w, h) => {
        const r = rng(5), hy = h * 0.6;
        sky(c, w, h, [[0, '#1a1638'], [0.25, '#4a2a5c'], [0.45, '#b4506a'], [0.55, '#f08a4e'], [0.6, '#ffc278']]);
        glow(c, w * 0.55, hy, w * 0.5, 'rgba(255,170,90,.35)');
        clouds(c, w, h, 25, { y0: h * 0.08, y1: h * 0.52, cover: 0.48, lit: '#ffb07a', dark: '#4a2a50', alpha: 0.85, sx: 1.6, sy: 12 });
        glow(c, w * 0.55, hy, w * 0.09, 'rgba(255,236,190,.9)');
        c.fillStyle = '#fff1cf'; c.beginPath(); c.arc(w * 0.55, hy + h * 0.008, w * 0.032, Math.PI, 0); c.fill();
        // the sea: swell texture, darker toward us, the sun's path broken by the waves
        pixels(c, w, h, (x, y, o) => {
          const v = (y - hy) / (h - hy), u = x / w;
          const wav = fbm(u * 18 / (0.2 + v), v * 120 / (0.3 + v), 31, 4);
          const base = mixc([196, 120, 112], [28, 26, 52], Math.pow(v, 0.5));
          const path = Math.exp(-Math.pow((u - 0.55) / (0.02 + v * 0.16), 2)) * smooth(0.45, 0.7, wav) * (1 - v * 0.5);
          const k = 0.8 + wav * 0.4;
          o[0] = base[0] * k + path * 255; o[1] = base[1] * k + path * 200; o[2] = base[2] * k + path * 140;
        }, hy, h);
        // a far headland
        soft(c, w / 1024, c => { c.fillStyle = 'rgba(70,36,70,.9)'; c.beginPath(); c.moveTo(0, hy + 1); c.lineTo(0, hy - h * 0.035);
          for (let x = 0; x <= w * 0.3; x += w / 100) c.lineTo(x, hy - h * 0.035 * (1 - x / (w * 0.3)) * (0.8 + fbm(x / w * 20, 0, 8, 3) * 0.4)); c.lineTo(w * 0.3, hy + 1); c.fill(); });
        // wet sand
        pixels(c, w, h, (x, y, o) => { const top = h * (0.9 - 0.08 * Math.pow(1 - x / w, 2)); if (y < top) return false; const n = fbm(x / w * 30, y / h * 80, 9, 4); o[0] = 40 + n * 25; o[1] = 26 + n * 16; o[2] = 34 + n * 14; }, h * 0.8, h);
        // palms
        const palm = (x, y, s, lean) => {
          c.fillStyle = '#120a12'; c.strokeStyle = '#120a12';
          const pts = []; for (let i = 0; i <= 20; i++) { const k = i / 20; pts.push([x + lean * s * 0.5 * Math.pow(k, 1.6), y - s * k]); }
          for (let i = 0; i < 20; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; c.lineWidth = s * (0.045 - i * 0.0012); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
          const [tx, ty] = pts[20];
          for (let f = 0; f < 11; f++) {
            const a = -Math.PI / 2 + (f / 10 - 0.5) * 3.6 + (r() - 0.5) * 0.3, len = s * (0.32 + r() * 0.12), droop = 0.55 + r() * 0.3;
            let px = tx, py = ty;
            for (let i = 1; i <= 16; i++) {
              const k = i / 16, ang = a + Math.sign(Math.cos(a)) * droop * k * 1.6, nx = tx + Math.cos(a) * len * k, ny = ty + Math.sin(a) * len * k + Math.pow(k, 2) * len * droop * 0.9;
              c.lineWidth = Math.max(0.6, s * 0.008 * (1 - k)); c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
              const ll = s * 0.07 * Math.sin(Math.PI * Math.min(1, k * 1.2));
              c.lineWidth = Math.max(0.5, s * 0.004);
              for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(nx, ny); c.lineTo(nx + Math.cos(ang + sd * 1.2 + 0.6) * ll, ny + Math.sin(ang + sd * 1.2 + 0.6) * ll + ll * 0.6); c.stroke(); }
              px = nx; py = ny;
            }
          }
        };
        palm(w * 0.1, h * 0.98, h * 0.62, 0.45); palm(w * 0.24, h * 0.96, h * 0.44, -0.25); palm(w * 0.93, h * 1.02, h * 0.5, -0.4);
      },
      layer: r => { const sp = Array.from({ length: 60 }, () => [0.5 + (r() - 0.5) * 0.22, 0.62 + r() * 0.28, r() * 9]); const birds = Array.from({ length: 4 }, () => [r(), 0.2 + r() * 0.2, 0.008 + r() * 0.008]);
        return (c, w, h, t) => {
          for (const [x, y, ph] of sp) { const a = Math.max(0, Math.sin(t * 2 + ph * 5)); if (a > 0.75) { c.fillStyle = `rgba(255,240,200,${a * 0.8})`; c.fillRect(x * w, y * h, 2, 1); } }
          c.strokeStyle = 'rgba(30,14,26,.8)'; c.lineWidth = 0.8;
          for (const [x0, y, s] of birds) { const x = ((x0 + t * s) % 1.2 - 0.1) * w, f = Math.sin(t * 6 + x0 * 9) * 1.6; c.beginPath(); c.moveTo(x - 3.5, y * h - f); c.quadraticCurveTo(x - 1.5, y * h - 1.5, x, y * h); c.quadraticCurveTo(x + 1.5, y * h - 1.5, x + 3.5, y * h - f); c.stroke(); }
        };
      } },

    // ---- a moonlit pine forest in layers of mist
    forest: { glow: '#7fffb0', moon: '#9fb8ff', fine: 0.5, fade: 0.9,
      draw: (K, c, w, h) => {
        const r = rng(12);
        sky(c, w, h, [[0, '#03070f'], [0.4, '#0b1726'], [0.7, '#1a2c38'], [1, '#22343a']]);
        starfield(c, w, h, r, 1100 * w / 1024, 0.6, 0.8);
        glow(c, w * 0.74, h * 0.2, w * 0.35, 'rgba(160,190,220,.16)');
        glow(c, w * 0.74, h * 0.2, w * 0.06, 'rgba(225,235,250,.5)');
        c.fillStyle = '#eef2f0'; c.beginPath(); c.arc(w * 0.74, h * 0.2, w * 0.02, 0, TAU); c.fill();
        clouds(c, w, h, 41, { y0: h * 0.05, y1: h * 0.4, cover: 0.58, lit: '#7f93a8', dark: '#0d1622', alpha: 0.6 });
        range(c, w, h, 43, { y: 0.62, amp: 0.12, sc: 2.5, rock: '#15232c', fog: '#2b3e48', haze: 0.55, light: -1 });
        const layers = [[0.62, 0.05, 0.09, '#1d3036', 1.6, 220], [0.7, 0.07, 0.12, '#14242a', 1.1, 160], [0.8, 0.1, 0.17, '#0b171b', 0.7, 100], [0.95, 0.18, 0.32, '#050c0e', 0.3, 40]];
        layers.forEach(([y, h0, h1, col, bl, n], i) => {
          forest(c, w, h, r, { y: u => y + 0.015 * Math.sin(u * 9 + i), h0, h1, n: n * w / 1024, col, blur: bl });
          if (i < 3) mist(c, w, h, 50 + i, h * (y - 0.04), h * (y + 0.06), ['#4a6470', '#3a535c', '#2b4048'][i], 0.4 - i * 0.08, 0.6);
        });
      },
      layer: r => { const ff = Array.from({ length: 34 }, () => [r(), 0.62 + r() * 0.34, r() * 9, 0.3 + r() * 0.5]);
        return (c, w, h, t) => { for (const [x, y, ph, sp] of ff) { const a = Math.pow(0.5 + 0.5 * Math.sin(t * 1.6 + ph * 4), 2); const xx = (x + Math.sin(t * sp * 0.4 + ph) * 0.03) * w, yy = (y + Math.cos(t * sp * 0.5 + ph) * 0.02) * h; glow(c, xx, yy, 4, `rgba(190,255,120,${0.45 * a})`); c.fillStyle = `rgba(235,255,180,${a})`; c.fillRect(xx - 0.5, yy - 0.5, 1, 1); } };
      } },

    // ---- northern lights over snowy peaks and a frozen lake
    aurora: { glow: '#3effa0', moon: '#7fffcc', fine: 0.5, fade: 0.35,
      draw: (K, c, w, h) => {
        const r = rng(61);
        sky(c, w, h, [[0, '#01040a'], [0.5, '#06121e'], [0.75, '#0c2230'], [1, '#13303a']]);
        starfield(c, w, h, r, 1500 * w / 1024, 0.75, 1);
        // the curtains: a wandering lower edge, rays rising from it, green into violet
        pixels(c, w, h, (x, y, o) => {
          const u = x / w, v = y / h;
          for (const [y0, amp, ph, str] of [[0.42, 0.07, 0, 1], [0.3, 0.05, 2.3, 0.6]]) {
            const e = y0 + amp * Math.sin(u * 5 + ph) + 0.05 * (fbm(u * 3, ph, 90, 4) - 0.5);
            const dv = e - v;
            if (dv < -0.12 || dv > 0.38) continue;
            if (dv < 0) { const k = Math.exp(-dv * dv / 0.0012) * 0.22 * str; o[0] += k * 30; o[1] += k * 140; o[2] += k * 100; continue; }
            const ray = Math.pow(fbm(u * 70 + Math.sin(u * 6 + ph) * 3, v * 1.5, 91 + ph * 10 | 0, 3), 2.2) * 2.2;
            const k = (dv < 0 ? Math.exp(-dv * dv / 0.00008) : Math.exp(-dv / 0.09)) * ray * str * (0.4 + 0.6 * fbm(u * 4, ph, 92, 3));
            const vi = smooth(0.08, 0.3, dv);
            o[0] += k * mix(40, 150, vi); o[1] += k * mix(255, 70, vi); o[2] += k * mix(150, 200, vi);
          }
        }, 0, h * 0.5);
        range(c, w, h, 63, { y: 0.74, amp: 0.2, sc: 2.6, rock: '#0d1620', snow: '#5d7a86', fog: '#14303a', haze: 0.35, light: -1 });
        // the frozen lake: the sky's green caught in the ice, then snow
        pixels(c, w, h, (x, y, o) => {
          const v = (y - h * 0.74) / (h * 0.26), n = fbm(x / w * 8, v * 30, 64, 5);
          const st = Math.pow(fbm(x / w * 70, 1, 65, 3), 2) * (1 - v) * 60;
          const ice = [10 + n * 12 + st * 0.3, 30 + n * 26 + st, 34 + n * 22 + st * 0.7], snow = [52 + n * 34, 66 + n * 34, 74 + n * 34];
          const col = mixc(ice, snow, smooth(0.35, 0.6, v + (n - 0.5) * 0.3));
          o[0] = col[0]; o[1] = col[1]; o[2] = col[2];
        }, h * 0.74, h);
        forest(c, w, h, r, { y: u => 0.97 + 0.02 * Math.sin(u * 5), h0: 0.12, h1: 0.24, n: 26 * w / 1024, col: '#03080a', blur: 0.4, snow: 'rgba(110,150,150,.5)' });
      },
      layer: () => (c, w, h, t) => {
        // a slow shimmer over the painted curtains
        for (const [col, off, amp, y0] of [['70,255,170', 0, 0.07, 0.42], ['160,90,255', 2.3, 0.05, 0.3]]) {
          for (let x = 0; x < w; x += 2) {
            const u = x / w, y = h * (y0 + amp * Math.sin(u * 5 + off) + 0.02 * Math.sin(u * 23 - t * 0.6)), a = 0.12 + 0.12 * Math.sin(u * 17 + t * 0.9 + off);
            const g = c.createLinearGradient(0, y - h * 0.2, 0, y); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${a})`);
            c.fillStyle = g; c.fillRect(x, y - h * 0.2, 2, h * 0.2);
          }
        }
      } },

    // ---- under the sea: light from the surface, a reef, kelp, fish
    ocean: { glow: '#3ec8ff', moon: '#5fd0ff', fine: 0.4, fade: 0.65,
      draw: (K, c, w, h) => {
        const r = rng(77);
        pixels(c, w, h, (x, y, o) => {
          const u = x / w, v = y / h;
          let col = mixc([40, 130, 160], [2, 16, 34], Math.pow(v, 0.7));
          // shafts of light from up and to the left
          const ang = Math.atan2(x - w * 0.25, y + h * 0.4), shaft = Math.pow(fbm(ang * 9, 0.5, 78, 4), 3) * 2.6 * (1 - v) * (1 - v);
          // the moving pattern of the surface, near the top
          const ca = Math.abs(fbm(u * 10 + fbm(u * 4, v * 8, 80, 3), v * 22, 79, 4) - 0.5), caus = Math.pow(clamp(1 - ca * 6), 2) * smooth(0.3, 0, v) * 0.35;
          const k = shaft + caus;
          o[0] = col[0] + k * 60; o[1] = col[1] + k * 110; o[2] = col[2] + k * 120;
        });
        // the reef: rock shapes with coral on them, bluer with distance
        const reef = (y0, amp, sc, s, depth) => {
          const top = new Float32Array(w + 1);
          for (let x = 0; x <= w; x++) top[x] = h * (y0 - amp * fbm(x / w * sc, 0.3, s, 6));
          pixels(c, w, h, (x, y, o) => {
            if (y < top[x]) return false;
            const n = fbm(x / w * 30, y / h * 30, s + 1, 5), cor = fbm(x / w * 9, y / h * 9, s + 2, 4);
            let col = [50 + n * 40, 46 + n * 30, 52 + n * 30];
            if (cor > 0.58) col = mixc(col, [[220, 110, 90], [230, 150, 80], [190, 90, 170]][Math.floor(cor * 37) % 3], smooth(0.58, 0.66, cor) * (0.6 + n * 0.6));
            const lit = 0.55 + smooth(top[x] + h * 0.03, top[x], y) * 0.6;
            const fog = depth + (y / h) * 0.15;
            o[0] = mix(col[0] * lit, 10, fog); o[1] = mix(col[1] * lit, 60, fog); o[2] = mix(col[2] * lit, 90, fog);
          }, h * (y0 - amp), h);
        };
        reef(0.86, 0.22, 3, 81, 0.7);
        // kelp, swaying up toward the light
        // kelp: a thin stalk with long blades hanging off it, each blade a soft leaf shape
        const kelp = (c, x, y, len, col, lw) => {
          c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineWidth = lw * 0.5;
          const at = k => [x + Math.sin(k * 3 + x) * len * 0.07 + k * len * 0.06, y - len * k];
          c.beginPath(); c.moveTo(x, y); for (let i = 1; i <= 16; i++) c.lineTo(...at(i / 16)); c.stroke();
          for (let i = 2; i < 30; i++) {
            if (r() < 0.3) continue;
            const k = i / 30, [lx, ly] = at(k), sd = r() < 0.5 ? 1 : -1, bl = lw * (5 + r() * 9) * (1 - k * 0.4), a = -Math.PI / 2 + sd * (0.2 + r() * 0.9);
            c.save(); c.translate(lx, ly); c.rotate(a + Math.PI / 2); c.beginPath(); c.ellipse(0, -bl / 2, lw * 0.9, bl / 2, sd * 0.15, 0, TAU); c.fill(); c.restore();
          }
        };
        soft(c, 1.6 * w / 1024, c => { for (let i = 0; i < 18; i++) kelp(c, r() * w, h * 0.8, h * (0.25 + r() * 0.3), 'rgba(24,74,72,.55)', w * 0.004); });
        reef(0.97, 0.2, 4, 83, 0.3);
        soft(c, 1.2 * w / 1024, c => { for (let i = 0; i < 5; i++) kelp(c, r() * w, h * 1.02, h * (0.45 + r() * 0.4), 'rgba(22,50,34,.92)', w * 0.007); });
        // drifting specks in the water
        for (let i = 0; i < 700 * w / 1024; i++) { c.fillStyle = `rgba(190,235,240,${r() * 0.35})`; c.fillRect(r() * w, r() * h, w / 1024, w / 1024); }
      },
      layer: r => { const fish = Array.from({ length: 14 }, () => [r(), 0.25 + r() * 0.45, 0.012 + r() * 0.02, r(), 1.6 + r() * 2.2]); const bub = Array.from({ length: 25 }, () => [r(), r(), 0.06 + r() * 0.08]);
        return (c, w, h, t) => {
          for (const [x0, y, sp, tone, s] of fish) { const x = ((x0 + t * sp) % 1.2 - 0.1) * w, yy = y * h + Math.sin(t * 0.8 + x0 * 9) * 4; c.fillStyle = tone < 0.6 ? 'rgba(150,190,200,.7)' : 'rgba(230,180,90,.7)'; c.beginPath(); c.ellipse(x, yy, s, s * 0.4, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(x - s * 0.9, yy); c.lineTo(x - s * 1.6, yy - s * 0.4); c.lineTo(x - s * 1.6, yy + s * 0.4); c.fill(); }
          c.strokeStyle = 'rgba(220,245,255,.45)'; c.lineWidth = 0.6; for (const [x, y, sp] of bub) { const yy = (1 - (y + t * sp) % 1) * h; c.beginPath(); c.arc(x * w + Math.sin(t * 2 + y * 9) * 2, yy, 1.1, 0, TAU); c.stroke(); }
        };
      } },

    // ---- a wet grey city late in the afternoon, towers fading into the rain
    rain: { glow: '#a8b8c8', moon: '#c8d4e0', fine: 0.45, fade: 0.55,
      draw: (K, c, w, h) => {
        const r = rng(19);
        sky(c, w, h, [[0, '#4a525e'], [0.5, '#7a8590'], [1, '#8f98a2']]);
        clouds(c, w, h, 20, { y0: 0, y1: h * 0.55, cover: 0.4, lit: '#9aa4b0', dark: '#3a414c', alpha: 0.7, sx: 2, sy: 6 });
        const wins = ['#ffd9a0', '#ffe8c4', '#f2f4ff'];
        city(c, w, h, r, { base: 0.72, h0: 0.1, h1: 0.45, col: '#76808b', edge: '#7f8994', lit: 0.12, wins, blur: 2.2, tops: 0.4 });
        mist(c, w, h, 21, h * 0.4, h * 0.85, '#8a949e', 0.5, 0.7);
        city(c, w, h, r, { base: 0.82, h0: 0.08, h1: 0.38, col: '#5d6670', edge: '#6a737d', lit: 0.18, wins, blur: 1.4, ww: 0.007, gap: 0.014 });
        mist(c, w, h, 22, h * 0.55, h * 0.95, '#7c858f', 0.4, 0.7);
        city(c, w, h, r, { base: 0.95, h0: 0.12, h1: 0.4, col: '#3f464e', edge: '#4c545c', lit: 0.25, wins, blur: 0.6, ww: 0.009, gap: 0.018 });
        city(c, w, h, r, { base: 1.12, h0: 0.15, h1: 0.3, col: '#262b31', edge: '#30363d', lit: 0.3, wins, ww: 0.012, gap: 0.024 });
      },
      layer: r => { const drops = Array.from({ length: 40 }, () => [r(), r(), 0.02 + r() * 0.08, 0.8 + r() * 1.4]); const streaks = Array.from({ length: 160 }, () => [r(), r(), 0.8 + r()]);
        return (c, w, h, t) => {
          c.strokeStyle = 'rgba(220,230,240,.22)'; c.lineWidth = 0.6; c.beginPath(); for (const [x, y, sp] of streaks) { const yy = ((y + t * sp) % 1) * h; c.moveTo(x * w, yy); c.lineTo(x * w - 1.2, yy + 9); } c.stroke();
          // drops on the glass that slide down now and then
          for (const [x, y, sp, s] of drops) { const yy = ((y + Math.max(0, Math.sin(t * sp * 3 + x * 9)) * t * sp * 0.2) % 1) * h; c.fillStyle = 'rgba(225,235,245,.4)'; c.beginPath(); c.ellipse(x * w, yy, s * 0.7, s, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x * w - s * 0.3, yy - s * 0.4, 0.8, 0.8); }
        };
      } },

    // ---- a neon city at night in the rain
    neon: { glow: '#ff3d9a', moon: '#5c7dff', fine: 0.45, fade: 0.55,
      draw: (K, c, w, h) => {
        const r = rng(31);
        sky(c, w, h, [[0, '#07030f'], [0.45, '#1c0a2c'], [0.8, '#4a1440'], [1, '#5a1a44']]);
        clouds(c, w, h, 32, { y0: 0, y1: h * 0.5, cover: 0.48, lit: '#7a2a66', dark: '#120818', alpha: 0.75, sx: 2, sy: 6 });
        glow(c, w * 0.65, h * 0.75, w * 0.6, 'rgba(255,60,160,.22)');
        const wins = ['#ff5fae', '#5fe6ff', '#b88bff', '#ffd27a', '#ffe9d0'], signs = { p: 0.5, cols: ['#ff3d9a', '#3ee6ff', '#b46bff', '#ffcf5a'] };
        city(c, w, h, r, { base: 0.7, h0: 0.12, h1: 0.5, col: '#1c0e2c', edge: '#2a1438', lit: 0.18, wins, blur: 2, signs });
        mist(c, w, h, 33, h * 0.45, h * 0.9, '#5a1c50', 0.45, 0.7);
        city(c, w, h, r, { base: 0.86, h0: 0.1, h1: 0.42, col: '#120820', edge: '#1e0f2c', lit: 0.24, wins, blur: 1, ww: 0.007, gap: 0.014, signs });
        // the 10000 sign on a tower
        c.save(); c.shadowColor = '#3ee6ff'; c.shadowBlur = w * 0.025; c.strokeStyle = '#8ff4ff'; c.lineWidth = w * 0.003; c.font = `700 ${w * 0.034}px ${K2.MONO}`; c.strokeText('10000', w * 0.16, h * 0.44); c.restore();
        mist(c, w, h, 34, h * 0.65, h, '#4a1440', 0.35, 0.8);
        city(c, w, h, r, { base: 1.08, h0: 0.15, h1: 0.32, col: '#07040c', edge: '#120a1a', lit: 0.3, wins, ww: 0.011, gap: 0.022, signs });
      },
      layer: r => { const drops = Array.from({ length: 160 }, () => [r(), r(), 0.6 + r() * 0.8]);
        return (c, w, h, t) => {
          c.strokeStyle = 'rgba(220,200,255,.22)'; c.lineWidth = 0.6;
          c.beginPath(); for (const [x, y, sp] of drops) { const yy = ((y + t * sp) % 1) * h, xx = x * w - yy * 0.08; c.moveTo(xx, yy); c.lineTo(xx - 1.5, yy + 9); } c.stroke();
          if (Math.sin(t * 7) * Math.sin(t * 2.3) > 0.2) { c.save(); c.shadowColor = '#ff3d9a'; c.shadowBlur = 8; c.fillStyle = '#ff6ab4'; c.font = '700 9px monospace'; c.fillText('OPEN', w * 0.72, h * 0.62); c.restore(); }
        };
      } },
  };

  window.RoomScenes = { SCENES, K: K2, fbm, noise, fbm3 };
})();
