// Makeup painted onto the face texture. The masks (tools/avatar/makeup_masks.py) are soft
// greyscale maps of the lids, lips and cheeks in the head's UV layout; each layer blends its
// colour into the skin the way the product would: shadow multiplies, liner is laid on top so a
// coloured liner keeps its colour, blush lifts with soft light, highlight brightens in
// proportion to the skin, and lipstick takes the lip's own light and shade so the lip texture
// shows through. Strength scales each layer from 0 to 100%.
// Gloss is not paint: it lowers the lip roughness in a separate map, so the light catches it.
window.AvatarMakeup = (() => {
  const D = () => window.AvatarData;
  let meta = null, imgs = {};
  const sized = new Map();

  function image(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  }
  async function load(root) {
    if (meta) return;
    const m = await (await fetch(root + 'tex/mk.json')).json();
    const list = await Promise.all(Object.keys(m.files).map(async k => [k, await image(`${root}tex/${k}.webp`)]));
    imgs = Object.fromEntries(list); meta = m;
  }

  // the masks resampled to one texture size, as one channel per mask
  function masksAt(size) {
    if (sized.has(size)) return sized.get(size);
    const [u0, v0, u1, v1] = meta.rect;
    const x0 = Math.floor(u0 * size), y0 = Math.floor((1 - v1) * size);
    const w = Math.min(size, Math.ceil(u1 * size)) - x0, h = Math.min(size, Math.ceil((1 - v0) * size)) - y0;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    const out = { x0, y0, w, h, m: {} };
    for (const [file, names] of Object.entries(meta.files)) {
      x.clearRect(0, 0, w, h); x.imageSmoothingQuality = 'high';
      x.drawImage(imgs[file], (u0 * size - x0), ((1 - v1) * size - y0), (u1 - u0) * size, (v1 - v0) * size);
      const px = x.getImageData(0, 0, w, h).data;
      names.forEach((n, k) => {
        // bytes, 0-255: read as v / 255 (Q below)
        const a = new Uint8Array(w * h);
        let any = false;
        for (let i = 0; i < a.length; i++) { const v = px[i * 4 + k]; a[i] = v; if (v) any = true; }
        out.m[n] = any ? a : null;
      });
    }
    sized.set(size, out);
    return out;
  }

  const Q = 1 / 255;
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const softLight = (b, s) => s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // what a look paints: colours and opacities for every layer that is on
  function layers(L) {
    const d = D(), mk = L.mk, s = k => (mk[k + 'S'] || 0) / 100;
    const col = (layer, i) => rgb(d.mkHex(layer, i, L.sk));
    const out = [];
    if (s('sculpt')) out.push({ kind: 'sculpt', a: s('sculpt') });
    if (s('blush')) out.push({ kind: 'blush', mask: 'blush', c: col('blush', mk.blushC), a: s('blush') });
    if (s('shadow')) out.push({ kind: 'multiply', mask: 'shadow-' + mk.shadow, c: col('shadow', mk.shadowC), a: s('shadow') * 0.9 });
    // brow fill: the brow colour (as the brow cards draw it, a little darker than the hair)
    if (s('brow')) out.push({ kind: 'multiply', mask: 'brow', c: rgb(d.HAIR_COLORS[L.bc < 0 ? L.hc : L.bc].hex).map(v => Math.min(1, v * 0.8 + 0.12)), a: s('brow') * 0.5 });
    // liner is laid on, not multiplied, so a coloured liner stays its colour over a dark shadow
    if (s('liner')) out.push({ kind: 'paint', mask: 'liner-' + mk.liner, c: col('liner', mk.linerC), a: Math.min(1, s('liner') * 1.15) });
    if (s('lip')) out.push({ kind: 'tint', mask: 'lips', c: col('lip', mk.lipC), a: s('lip') * 0.92 });
    if (s('line')) out.push({ kind: 'tint', mask: 'lipline', c: col('line', mk.lineC), a: s('line') * 0.75 });
    return out;
  }
  // a key that changes whenever the painted result would
  function key(L) {
    const ls = layers(L);
    return ls.length ? JSON.stringify(ls) : '-';
  }

  // Paints the look's makeup into ctx, whose canvas holds the skin at size x size.
  function paint(ctx, size, L) {
    if (!meta) return;
    const ls = layers(L).filter(l => l.kind === 'sculpt' || maskOf(size, l.mask));
    if (!ls.length) return;
    const S = masksAt(size), { x0, y0, w, h } = S;
    const im = ctx.getImageData(x0, y0, w, h), p = im.data, n = w * h;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { R[i] = p[i * 4] / 255; G[i] = p[i * 4 + 1] / 255; B[i] = p[i * 4 + 2] / 255; }
    for (const l of ls) {
      if (l.kind === 'sculpt') {
        // contour: a cool brown shade under the cheekbones and down the nose; highlight: a warm lift
        const C = S.m.contour, Hl = S.m.highlight;
        if (C) for (let i = 0; i < n; i++) {
          const a = C[i] * Q * l.a * 0.55; if (!a) continue;
          R[i] *= 1 - a * 0.2; G[i] *= 1 - a * 0.27; B[i] *= 1 - a * 0.3;
        }
        if (Hl) for (let i = 0; i < n; i++) {
          // a lift in proportion to the skin, so it reads as sheen on deep skin, not a pale stripe
          const a = Hl[i] * Q * l.a; if (!a) continue;
          R[i] = Math.min(1, R[i] * (1 + a * 0.22) + (1 - R[i]) * a * 0.05);
          G[i] = Math.min(1, G[i] * (1 + a * 0.2) + (1 - G[i]) * a * 0.045);
          B[i] = Math.min(1, B[i] * (1 + a * 0.16) + (1 - B[i]) * a * 0.04);
        }
        continue;
      }
      const m = S.m[l.mask]; let [cr, cg, cb] = l.c;
      if (l.kind === 'paint') {
        for (let i = 0; i < n; i++) {
          const a = m[i] * Q * l.a; if (!a) continue;
          R[i] += (cr - R[i]) * a; G[i] += (cg - G[i]) * a; B[i] += (cb - B[i]) * a;
        }
      } else if (l.kind === 'multiply') {
        for (let i = 0; i < n; i++) {
          const a = m[i] * Q * l.a; if (!a) continue;
          R[i] *= 1 - a + a * cr; G[i] *= 1 - a + a * cg; B[i] *= 1 - a + a * cb;
        }
      } else if (l.kind === 'blush') {
        // soft light for the flush on light skin; on deep skin soft light barely moves, so the
        // colour's hue goes on at the skin's own brightness instead
        const cl = Math.max(0.05, lum(cr, cg, cb));
        for (let i = 0; i < n; i++) {
          // the mask peaks at 1 for very light skin, where blush is hardest to see; other skin
          // gets about 70% of it
          const y = lum(R[i], G[i], B[i]), light = Math.min(1, Math.max(0, (y - 0.66) / 0.18));
          const a = m[i] * Q * l.a * (0.72 + 0.28 * light); if (!a) continue;
          const deep = Math.min(1, Math.max(0, (0.45 - y) / 0.3));
          const r = softLight(R[i], cr), g = softLight(G[i], cg), b = softLight(B[i], cb);
          const k = Math.min(1, a * 0.95);
          R[i] += (r - R[i]) * k; G[i] += (g - G[i]) * k; B[i] += (b - B[i]) * k;
          const h = a * (0.34 + 0.1 * deep), t = y / cl;
          R[i] += (Math.min(1, cr * t) - R[i]) * h; G[i] += (Math.min(1, cg * t) - G[i]) * h; B[i] += (Math.min(1, cb * t) - B[i]) * h;
          // very light skin: a touch of multiply, so the flush shows from a third of the slider
          const q = a * 0.3 * light;
          if (q) { R[i] *= 1 - q + q * cr; G[i] *= 1 - q + q * cg; B[i] *= 1 - q + q * cb; }
        }
      } else {
        // tint: the colour carries the lip's own light and shade (each texel's brightness
        // against the lips' average), so creases and texture stay
        let sw = 0, sy = 0;
        for (let i = 0; i < n; i++) { const v = m[i] * Q; if (v > 0.5) { sw += v; sy += v * lum(R[i], G[i], B[i]); } }
        const avg = sw ? sy / sw : 0.4;
        // on deep skin a bright colour reads as neon: it goes on deeper and a little cooler, the
        // way the same lipstick looks on a dark lip
        const deep = Math.min(1, Math.max(0, (0.46 - avg) / 0.26));
        const sat = Math.max(cr, cg, cb) - Math.min(cr, cg, cb), dd = deep * Math.min(1, sat * 2.2);
        if (dd) { cr *= 1 - 0.5 * dd; cg *= 1 - 0.42 * dd; cb *= 1 - 0.12 * dd; }
        const cl = Math.max(0.03, lum(cr, cg, cb));
        // a colour much lighter than the lip shows lighter, but not pastel: half way back to
        // the lip's own brightness (three quarters of the way on deep skin). A darker colour keeps its depth.
        const k = (cl + (avg - cl) * (cl > avg ? 0.5 + 0.25 * deep : 0.04)) / cl;
        for (let i = 0; i < n; i++) {
          const a = m[i] * Q * l.a; if (!a) continue;
          // shade varies a little less than the bare lip, so dark colours do not go flat black
          const t = Math.min(1.15, Math.pow(lum(R[i], G[i], B[i]) / avg, 0.8)) * k;
          const r = Math.min(1, cr * t), g = Math.min(1, cg * t), b = Math.min(1, cb * t);
          R[i] += (r - R[i]) * a; G[i] += (g - G[i]) * a; B[i] += (b - B[i]) * a;
        }
      }
    }
    for (let i = 0; i < n; i++) { p[i * 4] = R[i] * 255; p[i * 4 + 1] = G[i] * 255; p[i * 4 + 2] = B[i] * 255; }
    ctx.putImageData(im, x0, y0);
  }
  function maskOf(size, name) { return masksAt(size).m[name]; }

  // Roughness map for the gloss (three.js reads roughness from G). base is the skin's own
  // roughness or ORM image, kept as it is outside the lips; without one the map is white, so
  // the material's roughness value holds. null when there is no gloss.
  const glossCache = new Map(), baseIds = new WeakMap();
  let nextBase = 1;
  function gloss(L, size, base = null) {
    const g = (L.mk.glossS || 0) / 100;
    if (!meta || !g) return null;
    if (base && !baseIds.has(base)) baseIds.set(base, nextBase++);
    const k = `${size}|${g}|${base ? baseIds.get(base) : 0}`;
    if (glossCache.has(k)) return glossCache.get(k);
    const S = masksAt(size), m = S.m.gloss, lips = S.m.lips;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (base) x.drawImage(base, 0, 0, size, size);
    else { x.fillStyle = '#ffffff'; x.fillRect(0, 0, size, size); }
    if (m) {
      const im = x.getImageData(S.x0, S.y0, S.w, S.h), p = im.data;
      for (let i = 0; i < m.length; i++) {
        // a soft sheen over the whole lip, strongest in the middle of the lower lip
        const a = Math.min(1, (m[i] * 0.85 + (lips ? lips[i] * 0.3 : 0)) * Q) * g;
        if (!a) continue;
        const f = 1 - 0.6 * a;
        if (base) p[i * 4 + 1] *= f;
        else p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = Math.round(255 * f);
      }
      x.putImageData(im, S.x0, S.y0);
    }
    glossCache.set(k, c);
    while (glossCache.size > 6) glossCache.delete(glossCache.keys().next().value);
    return c;
  }

  return { load, paint, gloss, key, layers };
})();
