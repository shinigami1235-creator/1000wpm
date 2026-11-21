// The fall into Keyspace. Plays once on this device, the first time the player opens
// Play (#/play), as the moment they fall into the network (STORY/WORLD.md). The home page
// opens straight on the map. When the site is opened on #/play directly, a small script
// in <head> decides before the first paint and covers the page; this file loads async so
// the page keeps loading underneath. The footer link replays it on any page.
//
// Timeline, in seconds:
//   0.0 to 1.2   falling code: each column types Art's words or a bit of code down the screen
//   0.9 to 2.3   glyphs fall out of the columns and land as the lowercase wordmark, then the
//                subtitle types itself out
//   2.3 to 3.9   the wordmark opens into a portal and the camera flies through a tunnel of
//                code rings, streaks and grid lines. From 3.1 the exit opens in the middle and
//                shows the landing page, which has been loaded the whole time
//   3.4          the buddy flies out of the portal to its spot on the page
//   3.9 to 4.3   what is left fades and the site's own falling code carries on
// Any key, click or tap skips. The key that skips, and any typed during the fade, go to
// the page's typing box once the intro is gone.
// prefers-reduced-motion gets a still wordmark and a short fade instead.
(() => {
  const html = document.documentElement;
  const SEEN = 'wpm-fell-in';   // localStorage, so it plays once per device
  const END = 4.3, ARRIVE = 3.4;
  const G = '#39ff88', GD = '#1f9e57', INK = '#d7f5e3', CY = '#3ee6ff', GOLD = '#f2c230', BG = '#040806';
  const ART = 'hi im art and i type fast sometimes every day i type my follower count with one word for each follower so today i type twenty five thousand words';
  const CODE = ['wpm=204', '{acc:100}', '10000wpm', '<type/>', 'keys++', 'race(art)', '[tab]', 'f99 pro', 'sk61 he', 'yaksa 75', 'x68 he', 'vanguard 96', 'sf60', 'k98se', 'caret>', 'words=25500'];
  const CH = ' 0123456789abcdefghijklmnopqrstuvwxyz<>/{}[]()=+*;:_.,#';
  const LOGO_CH = 'lowercase_<>{}/=+';

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
  const outCubic = x => 1 - Math.pow(1 - x, 3);
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Breach's own "reduce flashing" switch also tones the intro down
  const calmFlash = () => { try { const s = JSON.parse(localStorage.getItem('wpm-breach-settings') || 'null'); return !!(s && s.reduceFlash); } catch (e) { return false; } };
  const soundOn = () => { try { return localStorage.getItem('wpm-sound') !== 'off'; } catch (e) { return true; } };

  // ---------- glyph atlas: every character pre-drawn in every colour, then copied with drawImage ----------
  function atlas(px, dpr, colors) {
    const cw = Math.ceil(px * 0.66 * dpr) + 2, chh = Math.ceil(px * 1.25 * dpr);
    const cv = document.createElement('canvas');
    cv.width = cw * CH.length; cv.height = chh * colors.length;
    const c = cv.getContext('2d');
    c.font = `600 ${px * dpr}px "JetBrains Mono", ui-monospace, Consolas, monospace`;
    c.textBaseline = 'middle'; c.textAlign = 'center';
    colors.forEach((col, row) => {
      c.fillStyle = col[0]; c.globalAlpha = col[1];
      for (let i = 1; i < CH.length; i++) c.fillText(CH[i], i * cw + cw / 2, row * chh + chh / 2);
    });
    return { cv, cw, chh, w: cw / dpr, h: chh / dpr };
  }
  const ci = ch => Math.max(0, CH.indexOf(ch));
  const RAIN_A = [1, 1, 1, .78, .58, .42, .28, .16];

  // ---------- the scene ----------
  function build(w, h, dpr, calm) {
    const R = rng(20410);
    const cell = Math.round(clamp(w / 118, 10, 16));
    const cellH = Math.round(cell * 1.2);
    // rain colours: head, cyan head, then the trail from bright to faint
    const RAIN = RAIN_A.map((a, i) => [i === 0 ? INK : i === 1 ? CY : G, a]);
    const rainA = atlas(cell, dpr, RAIN);
    const rows = Math.ceil(h / cellH) + 1;
    const cols = [];
    for (let i = 0, n = Math.ceil(w / cell); i < n; i++) {
      let src;
      if (R() < 0.6) { const words = ART.split(' '); const k = Math.floor(R() * words.length); src = words.slice(k).concat(words.slice(0, k)).join(' ') + '   '; }
      else { src = ''; for (let j = 0; j < 6; j++) src += CODE[Math.floor(R() * CODE.length)] + '  '; }
      cols.push({ x: i * cell + cell / 2, v: (16 + R() * 22) * rows / 60, L: 8 + Math.floor(R() * 12), t0: R() * 0.3, r0: R() * rows * 0.6 - rows * 0.45, off: Math.floor(R() * 400),
        src: [...src].map(ci), cyan: R() < 0.12 });
    }

    // the wordmark, sampled into a grid of cells from text drawn at 4x and averaged
    const logoW = Math.min(w * (w < 700 ? 0.86 : 0.7), 1150);
    const m = document.createElement('canvas').getContext('2d');
    const FONT = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
    m.font = `700 100px ${FONT}`;
    const F = 100 * logoW / m.measureText('lowercase_').width;
    const lc = Math.round(clamp(F * 0.74 / 13, 4, 14));
    const gw = Math.ceil(logoW / lc) + 2, gh = Math.ceil(F * 0.9 / lc);
    const SS = 4, sc = document.createElement('canvas');
    sc.width = gw * SS; sc.height = gh * SS;
    const sx = sc.getContext('2d', { willReadFrequently: true });
    sx.font = `700 ${F / lc * SS}px ${FONT}`; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#fff';
    sx.fillText('lowercase_', sc.width / 2, sc.height / 2 + F / lc * SS * 0.04);
    const px = sx.getImageData(0, 0, sc.width, sc.height).data;
    const x0 = (w - gw * lc) / 2, y0 = h * 0.44 - gh * lc / 2;
    const parts = [];
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let a = 0;
      for (let yy = 0; yy < SS; yy++) for (let xx = 0; xx < SS; xx++) a += px[((gy * SS + yy) * sc.width + gx * SS + xx) * 4 + 3];
      if (a / (SS * SS) < 100) continue;
      const tx = x0 + gx * lc, ty = y0 + gy * lc;
      parts.push({ tx, ty, ts: 0.92 + 0.6 * (gx / gw) + R() * 0.32, d: 0.42 + R() * 0.3, fall: h * (0.14 + R() * 0.28),
        ch: ci(LOGO_CH[Math.floor(R() * LOGO_CH.length)]), tone: R() < 0.25 ? 3 : 2, i: parts.length });
    }
    const LOGO = [[INK, 1], [CY, 1], [G, 1], [G, .7], [G, .45], [G, .22]];
    const logoA = atlas(lc, dpr, LOGO);
    // a soft glow behind the wordmark, blurred once here
    const gl = document.createElement('canvas');
    const pad = 40;
    gl.width = Math.ceil((gw * lc + pad * 2) / 2); gl.height = Math.ceil((gh * lc + pad * 2) / 2);
    const gc = gl.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = gl.width; tmp.height = gl.height;
    const tc = tmp.getContext('2d'); tc.fillStyle = G;
    parts.forEach(p => tc.fillRect((p.tx - x0 + pad) / 2, (p.ty - y0 + pad) / 2, lc / 2, lc / 2));
    gc.filter = 'blur(10px)'; gc.drawImage(tmp, 0, 0);

    // the tunnel
    const cx = w / 2, cy = y0 + gh * lc / 2;
    const rho = Math.min(gh * lc * 1.25, Math.min(w, h) * 0.3);
    const diag = Math.hypot(w, h);
    const streaks = [];
    for (let j = 0; j < 120; j++) { const r = R(); streaks.push({ a: R() * Math.PI * 2, rf: 0.45 + R() * 0.55, s: R() * 6, col: r < 0.06 ? 2 : r < 0.22 ? 1 : 0 }); }
    const ringA = atlas(Math.max(10, lc), dpr, [[G, 1], [CY, 1]]);
    // landed glyphs of the wordmark are kept here
    const cacheM = lc * 2, cache = document.createElement('canvas');
    cache.width = Math.ceil((gw * lc + cacheM * 2) * dpr); cache.height = Math.ceil((gh * lc + cacheM * 2) * dpr);
    const cc = cache.getContext('2d'); cc.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h, dpr, calm, cell, cellH, rows, cols, rainA, parts, logoA, lc, x0, y0, gw, gh, gl, pad, cx, cy, rho, diag, streaks, ringA, F, FONT,
      cache, cc, cacheM, cached: new Uint8Array(parts.length), cacheT: -1 };
  }

  function glyph(c, A, row, ch, x, y, size) {
    const s = size || A.w;
    c.drawImage(A.cv, ch * A.cw, row * A.chh, A.cw, A.chh, x - s / 2, y - s * A.h / A.w / 2, s, s * A.h / A.w);
  }

  // ---------- one frame at time t ----------
  function draw(c, S, t) {
    const { w, h } = S;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = BG; c.fillRect(0, 0, w, h);

    // camera: still until 2.45, then accelerating forward
    const u = clamp((t - 2.45) / 1.45);
    const cam = 3.4 * Math.pow(u, 2.3);
    const open = outCubic(clamp((t - 2.3) / 0.45));

    // 1. falling code
    const rainAlpha = t < 0.3 ? t / 0.3 : t < 1.15 ? 1 : t < 1.9 ? 1 - 0.68 * (t - 1.15) / 0.75 : t < 2.4 ? 0.32 : 0.32 * (1 - smooth(2.4, 2.95, t));
    if (rainAlpha > 0.01) {
      c.globalAlpha = rainAlpha;
      const A = S.rainA, wrap = S.rows + 24;
      c.fillStyle = 'rgba(57,255,136,.16)';
      for (const col of S.cols) {
        const run = (t - col.t0) * col.v + col.r0;
        if (run < 0) continue;
        const head = Math.floor(run % wrap);
        if (head < S.rows) c.fillRect(col.x - S.cell / 2 + 1, head * S.cellH, S.cell - 2, S.cellH);
        for (let k = 0; k < col.L; k++) {
          const row = head - k; if (row < 0 || row >= S.rows) continue;
          const ch = col.src[(row + col.off) % col.src.length]; if (!ch) continue;
          const lvl = k === 0 ? (col.cyan ? 1 : 0) : Math.min(7, 2 + Math.floor(k * 6 / col.L));
          if (rainAlpha * RAIN_A[lvl] < 0.07) break;         // too faint to see
          glyph(c, A, lvl, ch, col.x, row * S.cellH + S.cellH / 2);
        }
      }
      c.globalAlpha = 1;
    }

    // a dark pool under the wordmark so it reads over the rain
    const pool = smooth(0.9, 1.6, t) * (1 - smooth(2.6, 3.0, t));
    if (pool > 0) {
      const g = c.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, S.gw * S.lc * 0.62);
      g.addColorStop(0, `rgba(4,8,6,${0.85 * pool})`); g.addColorStop(1, 'rgba(4,8,6,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }

    // 2. the wordmark: glyphs fall into place, then the whole thing flies past the camera.
    // A glyph that has landed is drawn once into S.cache, so each frame copies one image.
    const logoScale = cam < 0.97 ? 1 / (1 - cam) : 40;
    const fade = clamp(1 - (logoScale - 1) / 5);
    if (fade > 0) {
      const A = S.logoA, L = S.lc, M = S.cacheM;
      if (t < S.cacheT) { S.cc.clearRect(0, 0, S.cache.width, S.cache.height); S.cached.fill(0); }
      S.cacheT = t;
      const glow = smooth(1.5, 2.25, t) * (S.calm ? 0.22 : 0.5) * fade;
      if (glow > 0) {
        c.globalAlpha = glow;
        const gw = S.gl.width * 2 * logoScale, gh = S.gl.height * 2 * logoScale;
        c.drawImage(S.gl, S.cx - gw / 2, S.cy - gh / 2, gw, gh);
      }
      c.globalAlpha = fade;
      for (const p of S.parts) {
        if (t < p.ts || S.cached[p.i]) continue;
        const q = (t - p.ts) / p.d, x = p.tx + L / 2;
        if (q < 1) {
          const ch = ci(LOGO_CH[Math.floor(hash(p.i, Math.floor(t * 18)) * LOGO_CH.length)]), y = p.ty + L / 2 - p.fall * (1 - outCubic(q));
          glyph(c, A, 3, ch, x, y - L * 1.1, L); glyph(c, A, 0, ch, x, y, L);
        } else if (t - p.ts - p.d < 0.16) {
          const sc = logoScale, y = p.ty + L / 2;
          glyph(c, A, 0, p.ch, S.cx + (x - S.cx) * sc, S.cy + (y - S.cy) * sc, L * 1.18 * sc);
        } else {
          S.cached[p.i] = 1;
          glyph(S.cc, A, p.tone, p.ch, x - S.x0 + M, p.ty + L / 2 - S.y0 + M, L * 1.18);
        }
      }
      const cw = S.cache.width / S.dpr, chh = S.cache.height / S.dpr;
      c.drawImage(S.cache, S.cx + (S.x0 - M - S.cx) * logoScale, S.cy + (S.y0 - M - S.cy) * logoScale, cw * logoScale, chh * logoScale);
      // subtitle typing out under it
      const sub = '// the typing collective';
      const n = Math.floor(clamp((t - 1.85) / 0.5) * sub.length);
      const sa = (1 - smooth(2.3, 2.6, t));
      if (n > 0 && sa > 0) {
        const fs = Math.max(12, Math.round(L * 1.25));
        c.globalAlpha = sa;
        c.font = `400 ${fs}px "Share Tech Mono", ui-monospace, monospace`;
        c.textAlign = 'left'; c.textBaseline = 'middle';
        if ('letterSpacing' in c) c.letterSpacing = '2px';
        const full = c.measureText(sub).width, sx = S.cx - full / 2, sy = S.y0 + S.gh * L + fs * 1.6;
        c.fillStyle = '#7fa892'; c.fillText(sub.slice(0, n), sx, sy);
        const tw = c.measureText(sub.slice(0, n)).width;
        if (n < sub.length || Math.floor(t * 3) % 2 === 0) { c.fillStyle = G; c.fillRect(sx + tw + 3, sy - fs * 0.55, fs * 0.5, fs * 1.1); }
        if ('letterSpacing' in c) c.letterSpacing = '0px';
      }
      c.globalAlpha = 1;
    }

    // 3. the tunnel, seen through the portal, drawn over the middle of the wordmark
    const Rp = S.rho * open * logoScale;
    if (open > 0) {
      const clip = Rp < S.diag;
      c.save();
      if (clip) { c.beginPath(); c.arc(S.cx, S.cy, Rp, 0, Math.PI * 2); c.clip(); }
      c.fillStyle = '#020604'; c.fillRect(0, 0, w, h);
      tunnel(c, S, t, u, cam);
      c.restore();
      if (clip) rim(c, S, t, Rp, open);
    }

    // 4. the exit: a soft hole in the middle that grows until the page shows everywhere
    const e = smooth(0.48, 1, u);
    if (e > 0) {
      const Rx = e * e * S.diag * 0.78;
      c.globalCompositeOperation = 'destination-out';
      const g = c.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, Math.max(1, Rx));
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
    }
    return e;
  }

  function tunnel(c, S, t, u, cam) {
    const { cx, cy, rho, diag } = S, SP = 0.32, N = 26;
    // grid: spokes running down the tunnel wall
    const far = rho / (1 + N * SP - cam);
    c.strokeStyle = 'rgba(57,255,136,.13)'; c.lineWidth = 1;
    c.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + 0.1;
      c.moveTo(cx + Math.cos(a) * far, cy + Math.sin(a) * far); c.lineTo(cx + Math.cos(a) * diag, cy + Math.sin(a) * diag);
    }
    c.stroke();
    // rings of code
    const A = S.ringA;
    for (let i = N; i >= 0; i--) {
      const dz = 1 + i * SP - cam;
      if (dz < 0.1) continue;
      const r = rho / dz;
      if (r > diag) continue;
      const a = clamp(1.25 - dz / 7) * clamp((dz - 0.1) / 0.35);
      if (a <= 0.02) continue;
      c.globalAlpha = a * 0.55;
      c.strokeStyle = i % 4 === 0 ? CY : G; c.lineWidth = clamp(1.3 / dz, 0.6, 4);
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      const gs = S.lc * 1.1 / dz;
      if (gs < 4) continue;
      c.globalAlpha = a * 0.85;
      const spin = i * 0.6 + t * (i % 2 ? 0.45 : -0.45);
      for (let k = 0; k < 18; k++) {
        const ang = k / 18 * Math.PI * 2 + spin;
        glyph(c, A, i % 4 === 0 ? 1 : 0, 1 + Math.floor(hash(i, k) * (CH.length - 1)), cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, Math.min(gs, 54));
      }
    }
    // streaks flying past
    const k = smooth(0, 0.25, u);
    if (k > 0) {
      const cols = [G, CY, GOLD];
      for (let col = 0; col < 3; col++) for (let b = 0; b < 3; b++) {
        c.beginPath();
        let any = false;
        for (const s of S.streaks) {
          if (s.col !== col) continue;
          const d = ((s.s - cam * 1.5 - t * 0.35) % 6 + 6) % 6 + 0.15;
          const bucket = d < 1.2 ? 0 : d < 3 ? 1 : 2;
          if (bucket !== b) continue;
          const r1 = rho * s.rf / d, r2 = rho * s.rf / (d + 0.3 + u * 0.5);
          if (r2 > diag) continue;
          const ca = Math.cos(s.a), sa = Math.sin(s.a);
          c.moveTo(cx + ca * r2, cy + sa * r2); c.lineTo(cx + ca * Math.min(r1, diag), cy + sa * Math.min(r1, diag)); any = true;
        }
        if (!any) continue;
        c.globalAlpha = k * [0.75, 0.45, 0.2][b] * (col === 2 ? 0.7 : 1);
        c.strokeStyle = cols[col]; c.lineWidth = [2.2, 1.4, 0.8][b];
        c.stroke();
      }
    }
    // a soft light at the end of the tunnel that rises smoothly and never pulses
    const glow = (S.calm ? 0.12 : 0.3) * smooth(0.25, 0.85, u);
    if (glow > 0) {
      const R = Math.min(S.w, S.h) * (0.2 + 0.5 * u);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, `rgba(57,255,136,${glow})`); g.addColorStop(1, 'rgba(57,255,136,0)');
      c.globalAlpha = 1; c.fillStyle = g; c.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    c.globalAlpha = 1;
  }

  // the edge of the portal: two thin rings and code turning round it
  function rim(c, S, t, Rp, open) {
    c.globalAlpha = 0.9 * open;
    c.strokeStyle = G; c.lineWidth = 2; c.beginPath(); c.arc(S.cx, S.cy, Rp, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.5 * open;
    c.strokeStyle = CY; c.lineWidth = 1; c.beginPath(); c.arc(S.cx, S.cy, Rp + 6, 0, Math.PI * 2); c.stroke();
    const n = Math.max(16, Math.min(90, Math.floor(Rp * 2 * Math.PI / (S.lc * 1.6))));
    const gs = Math.min(40, S.lc * Math.max(1, Rp / (S.rho || 1)));
    c.globalAlpha = 0.85 * open;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + t * 0.8;
      glyph(c, S.ringA, 0, 1 + Math.floor(hash(k, 7) * (CH.length - 1)), S.cx + Math.cos(a) * (Rp + gs * 0.9), S.cy + Math.sin(a) * (Rp + gs * 0.9), gs);
    }
    c.globalAlpha = 1;
  }

  // ---------- sound: a soft swell made in Web Audio, only when the browser allows it ----------
  let ac = null, master = null, noiseBuf = null;
  function audio() {
    if (!soundOn()) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    // creating it before any click or key only earns a browser warning, so wait for one
    if (!AC || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return null;
    if (!ac) {
      try { ac = new AC(); } catch (e) { return null; }
      master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    master.gain.cancelScheduledValues(ac.currentTime); master.gain.setValueAtTime(0.22, ac.currentTime);
    return ac;
  }
  function noise(at, dur, f0, f1, peak, peakAt) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + peakAt); g.gain.linearRampToValueAtTime(0.0001, at + dur);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(at); src.stop(at + dur + 0.05);
  }
  function chime(at, f, peak) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + 1);
  }
  // the whole swell, lined up with the warp. t is where the intro is now.
  function swell(t) {
    if (!audio()) return;
    const T = x => ac.currentTime + Math.max(0, x - t);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(260, T(2.2)); lp.frequency.exponentialRampToValueAtTime(3600, T(3.7));
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, T(2.1)); g.gain.linearRampToValueAtTime(0.16, T(3.5)); g.gain.linearRampToValueAtTime(0.0001, T(4.25));
    lp.connect(g); g.connect(master);
    [[110, 'sawtooth'], [164.8, 'sawtooth'], [55, 'sine']].forEach(([f, type]) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, T(2.1)); o.frequency.exponentialRampToValueAtTime(f * 2, T(3.8));
      o.connect(lp); o.start(T(2.1)); o.stop(T(4.3));
    });
    noise(T(2.4), 1.6, 500, 6000, 0.22, 1.1);
    chime(T(3.85), 880, 0.07); chime(T(3.87), 1318.5, 0.05);
  }
  function whooshOut() {
    if (!audio()) return;
    const t = ac.currentTime;
    noise(t, 0.45, 3200, 380, 0.2, 0.06);
    chime(t + 0.2, 880, 0.05);
  }
  function hush() { if (ac && master) { master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(0, ac.currentTime, 0.05); } }
  addEventListener('wpm-sound', e => { if (!(e.detail && e.detail.on)) hush(); });

  // ---------- running it ----------
  let run = null, queued = [];
  const stats = { frames: 0, cost: [], gaps: [], started: 0, ended: 0 };

  function start({ at = null } = {}) {
    if (run || !document.body) return;
    const calmAll = reduceMotion();
    const ov = document.createElement('div');
    ov.className = 'intro-ov' + (calmAll ? ' calm' : '');
    ov.innerHTML = '<canvas aria-hidden="true"></canvas><button class="intro-skip" type="button" aria-label="Skip intro">Skip</button>';
    document.body.append(ov);
    html.classList.add('intro');
    try { localStorage.setItem(SEEN, '1'); } catch (e) {}
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'intro' }));
    const cv = ov.querySelector('canvas'), c = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shell = document.querySelector('.shell');
    run = { ov, cv, c, S: null, t: 0, last: 0, raf: 0, frozen: at, arrived: false, ending: false, calmAll, shell, w, h, dpr, sound: false };
    swallow = true;
    stats.frames = 0; stats.cost = []; stats.gaps = []; stats.started = performance.now();
    ov.addEventListener('pointerdown', e => { e.preventDefault(); skip(); });
    ov.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    if (calmAll) return calmRun();
    run.S = build(w, h, dpr, calmFlash());
    if (at == null) { swell(0); run.sound = !!ac; }
    run.raf = requestAnimationFrame(tick);
  }

  // prefers-reduced-motion: the wordmark sits still for a moment, then everything fades out
  function calmRun() {
    const { c, w, h } = run;
    c.fillStyle = BG; c.fillRect(0, 0, w, h);
    const fs = Math.min(w * 0.11, 150);
    c.font = `700 ${fs}px "Chakra Petch", "Segoe UI", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = G; c.fillText('lowercase_', w / 2, h * 0.44);
    c.font = `400 ${Math.max(12, fs * 0.16)}px "Share Tech Mono", ui-monospace, monospace`; c.fillStyle = '#7fa892';
    c.fillText('// the typing collective', w / 2, h * 0.44 + fs * 0.75);
    html.classList.remove('intro-cover');
    if (run.frozen != null) return;
    run.calmTimer = setTimeout(() => finish(false), 750);
  }

  function tick(now) {
    if (!run) return;
    run.raf = requestAnimationFrame(tick);
    if (run.frozen != null) run.t = run.frozen;
    else {
      if (run.last) { const gap = now - run.last; stats.gaps.push(gap); run.t += Math.min(0.2, gap / 1000); }
      run.last = now;
    }
    const t0 = performance.now();
    const e = draw(run.c, run.S, run.t);
    stats.cost.push(performance.now() - t0); stats.frames++;
    if (stats.frames === 1) html.classList.remove('intro-cover');
    // the page underneath settles from slightly too close to its real size as the exit opens
    if (run.shell) {
      if (e > 0 && e < 1) { run.shell.style.transformOrigin = `50% ${(scrollY + run.S.cy).toFixed(0)}px`; run.shell.style.transform = `scale(${(1 + 0.05 * (1 - e)).toFixed(4)})`; }
      else if (e >= 1) run.shell.style.transform = '';
    }
    if (run.t >= ARRIVE) arrive();
    if (run.frozen == null && run.t >= 3.95) finish(false);
  }

  function arrive() {
    if (!run || run.arrived) return;
    run.arrived = true;
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'arrive' }));
  }

  function finish(fast) {
    if (!run || run.ending) return;
    run.ending = true;
    clearTimeout(run.calmTimer);
    arrive();
    const r = run;
    r.ov.classList.add(fast ? 'out-fast' : 'out');
    if (r.shell && fast) r.shell.style.transform = '';
    stats.ended = performance.now();
    setTimeout(() => {
      cancelAnimationFrame(r.raf);
      r.ov.remove();
      if (r.shell) { r.shell.style.transform = ''; r.shell.style.transformOrigin = ''; }
      html.classList.remove('intro', 'intro-cover');
      if (run === r) run = null;
      deliver();
    }, r.calmAll ? 650 : fast ? 260 : 340);
  }

  function skip() {
    if (!run || run.ending) return;
    if (!run.sound) whooshOut(); else hush();
    finish(true);
  }

  // A key during the intro skips it. The page doesn't see the key then; printable keys are
  // kept and handed to the typing box after the overlay is gone, so the first letter the
  // player types still counts. Held-down repeats are dropped. Shortcuts like Ctrl+R and F5
  // still work.
  const TYPING = new Set(['Enter', 'Tab', 'Backspace', 'Delete', ' ', 'Spacebar', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
  addEventListener('keydown', e => {
    if (!run) return;
    const shortcut = e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key);
    if (shortcut) return;
    if (e.key.length === 1 || TYPING.has(e.key)) e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key.length === 1 && !e.repeat && queued.length < 8) queued.push(e.key);
    if (!run.ending && run.frozen == null) skip();
  }, true);

  // The kept keys go to the focused text field, or else to the first typing box on the page
  // (the hidden textarea of TT.captureKeys). A game that is still loading gets up to 3 s.
  function deliver() {
    if (!queued.length) return;
    const t0 = performance.now();
    const go = () => {
      if (!queued.length) return;
      let t = document.activeElement;
      const field = t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && !t.readOnly;
      if (!field) {
        t = document.querySelector('#view .sr-input');
        if (!t) { if (performance.now() - t0 < 3000) setTimeout(go, 100); else queued = []; return; }
        t.focus({ preventScroll: true });
      }
      const keys = queued; queued = [];
      for (const k of keys) {
        const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
        // a plain text field gets the letter written in when nothing handled the key
        if (t.dispatchEvent(ev) && !t.classList.contains('sr-input') && typeof t.setRangeText === 'function') {
          try { t.setRangeText(k, t.selectionStart, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
      }
    };
    go();
  }
  addEventListener('resize', () => { if (run && run.frozen == null && (innerWidth !== run.w || innerHeight !== run.h)) skip(); });

  // the replay link in the footer
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-replay-intro]');
    if (!a) return;
    e.preventDefault();
    if (run) return;
    scrollTo(0, 0);
    start();
  });

  // the first time the player opens Play on this device
  const seen = () => { try { return !!localStorage.getItem(SEEN); } catch (e) { return true; } };
  addEventListener('wpm-route', e => {
    if (e.detail && e.detail.name === 'play' && !seen() && !run) { scrollTo(0, 0); start(); }
  });

  window.Intro = {
    play: start, skip,
    // for screenshots: Intro.play({ at: 2.9 }) freezes the intro at 2.9 s, Intro.seek(3.2) moves it
    seek(t) { if (run) run.frozen = t; },
    stats() {
      const s = stats.cost.slice().sort((a, b) => a - b), g = stats.gaps.slice().sort((a, b) => a - b);
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      return { frames: stats.frames, costAvgMs: +avg(s).toFixed(2), costP95Ms: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), costMaxMs: +(s[s.length - 1] || 0).toFixed(2),
        frameGapAvgMs: +avg(g).toFixed(2), fps: g.length ? +(1000 / avg(g)).toFixed(1) : 0, durationMs: stats.ended ? Math.round(stats.ended - stats.started) : null };
    },
    active: () => !!run,
    costs() { const c = stats.cost.slice(); stats.cost = []; return c; },
  };

  // first visit in this session: the <head> script already decided and covered the page
  function boot() {
    if (!document.body) { requestAnimationFrame(boot); return; }
    clearTimeout(window.__introFS);
    if (html.classList.contains('intro')) start();
  }
  boot();
})();
