// Small helpers shared by the pages: HTML building, avatars, the line chart and number formats.
window.UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n || 0).toLocaleString('en-US');
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const coin = () => icon('coin');

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function time(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  function clock(s) {
    s = Math.max(0, Math.round(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function date(iso, withTime = true) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return withTime ? `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : day;
  }

  const MODES = {
    'time-15': '15 s', 'time-30': '30 s', 'time-60': '60 s', 'time-120': '120 s',
    'words-25': '25 words', 'words-50': '50 words', 'words-100': '100 words',
    quote: 'Quote', custom: 'Custom',
    'race-art': 'Race vs Art', 'race-best': 'Race vs best', 'race-duo': 'Race, 2 players',
  };
  function modeName(m) {
    if (MODES[m]) return MODES[m];
    const h = /^horde-(\d)$/.exec(m);
    return h ? `Breach ch. ${h[1]}` : m;
  }

  // ---------- avatars ----------
  // Eight hooded figures drawn from code characters. Each has its own colour and
  // character set and a seeded random so the same avatar always looks the same.
  const AVATARS = [
    { name: 'Green', color: '#39ff88', chars: '01' },
    { name: 'Cyan', color: '#3ee6ff', chars: '0123456789abcdef' },
    { name: 'Gold', color: '#f2c230', chars: '{}[]<>/=+*' },
    { name: 'Red', color: '#ff4d5e', chars: '#$%&@!?' },
    { name: 'Violet', color: '#b779ff', chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ' },
    { name: 'Orange', color: '#ff8a3d', chars: '01<>/\\|' },
    { name: 'White', color: '#e3f2e8', chars: 'wpm10000' },
    { name: 'Blue', color: '#4d8dff', chars: ';:.,=-_~' },
  ];
  const avCache = new Map();
  function rng(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  function hex(c, k) {
    const n = parseInt(c.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  }
  function avatar(i = 0, size = 160) {
    i = ((i % AVATARS.length) + AVATARS.length) % AVATARS.length;
    const key = i + ':' + size;
    if (avCache.has(key)) return avCache.get(key);
    const A = AVATARS[i], S = size, r = rng(i + 7);
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    // background
    const bg = c.createRadialGradient(S * .5, S * .35, S * .05, S * .5, S * .5, S * .75);
    bg.addColorStop(0, hex(A.color, .16)); bg.addColorStop(1, '#030604');
    c.fillStyle = bg; c.fillRect(0, 0, S, S);
    // silhouette mask
    const m = document.createElement('canvas'); m.width = m.height = S;
    const mc = m.getContext('2d');
    const P = (x, y) => [x * S, y * S];
    mc.beginPath();
    mc.moveTo(...P(.02, 1));
    mc.bezierCurveTo(...P(.04, .84), ...P(.16, .77), ...P(.27, .73));
    mc.bezierCurveTo(...P(.19, .52), ...P(.22, .16), ...P(.5, .09));
    mc.bezierCurveTo(...P(.78, .16), ...P(.81, .52), ...P(.73, .73));
    mc.bezierCurveTo(...P(.84, .77), ...P(.96, .84), ...P(.98, 1));
    mc.closePath();
    mc.fillStyle = '#fff'; mc.fill();
    const md = mc.getImageData(0, 0, S, S).data;
    const inMask = (x, y) => md[(Math.min(S - 1, Math.max(0, Math.round(y))) * S + Math.min(S - 1, Math.max(0, Math.round(x)))) * 4 + 3] > 0;
    const face = (x, y) => ((x - S * .5) / (S * .15)) ** 2 + ((y - S * .47) / (S * .2)) ** 2 < 1;
    // characters
    const cell = Math.max(5, Math.round(S / 22));
    c.font = `600 ${Math.round(cell * 1.15)}px "JetBrains Mono", monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let y = cell / 2; y < S; y += cell) {
      for (let x = cell / 2; x < S; x += cell * .82) {
        const ch = A.chars[Math.floor(r() * A.chars.length)];
        if (!inMask(x, y)) {
          if (r() < .05) { c.fillStyle = hex(A.color, .18); c.fillText(ch, x, y); }
          continue;
        }
        if (face(x, y)) continue;
        // light from the upper left: brighter on the hood rim, darker at the bottom
        const edge = !inMask(x - cell, y) || !inMask(x + cell, y) || !inMask(x, y - cell);
        const rim = Math.hypot(x - S * .5, y - S * .47) < S * .26 && !face(x, y);
        let k = .28 + r() * .35 + (edge ? .45 : 0) + (rim ? .3 : 0) - (y / S) * .2 + (x < S * .5 ? .08 : 0);
        k = Math.max(.15, Math.min(1.25, k));
        c.fillStyle = hex(A.color, Math.min(1, k));
        if (k > 1) { c.shadowColor = A.color; c.shadowBlur = 4; } else c.shadowBlur = 0;
        c.fillText(ch, x, y);
      }
    }
    c.shadowBlur = 0;
    // the dark opening of the hood
    const fg = c.createRadialGradient(S * .5, S * .5, 0, S * .5, S * .47, S * .2);
    fg.addColorStop(0, '#000'); fg.addColorStop(1, 'rgba(0,0,0,.85)');
    c.fillStyle = fg;
    c.beginPath(); c.ellipse(S * .5, S * .47, S * .145, S * .195, 0, 0, Math.PI * 2); c.fill();
    const url = cv.toDataURL('image/png');
    avCache.set(key, url);
    return url;
  }

  // ---------- line chart ----------
  // values: numbers; labels: x labels (same length, optional). Draws to the canvas's CSS size.
  function lineChart(cv, values, { labels = [], min, max, empty = 'No runs yet', tag } = {}) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth || 300, H = cv.clientHeight || 160;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const padL = 34, padR = 14, padT = 14, padB = labels.length ? 22 : 8;
    const iw = W - padL - padR, ih = H - padT - padB;
    let lo = min ?? Math.min(...values), hi = max ?? Math.max(...values);
    if (!values.length) { lo = 0; hi = 100; }
    if (hi - lo < 10) { hi = lo + 10; }
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const y = v => padT + ih - ((v - lo) / (hi - lo)) * ih;
    const x = i => padL + (values.length < 2 ? iw / 2 : (i / (values.length - 1)) * iw);
    c.font = '11px "Share Tech Mono", monospace';
    c.textBaseline = 'middle'; c.textAlign = 'right';
    for (let v = lo; v <= hi + 0.001; v += step) {
      c.strokeStyle = 'rgba(57,255,136,.09)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(padL, Math.round(y(v)) + .5); c.lineTo(W - padR, Math.round(y(v)) + .5); c.stroke();
      c.fillStyle = '#7fa892'; c.fillText(String(Math.round(v)), padL - 6, y(v));
    }
    if (!values.length) {
      c.font = '13px "Share Tech Mono", monospace';
      const tw = c.measureText(empty).width + 16;
      c.fillStyle = '#07100b'; c.fillRect(padL + iw / 2 - tw / 2, padT + ih / 2 - 11, tw, 22);
      c.textAlign = 'center'; c.fillStyle = '#7fa892';
      c.fillText(empty, padL + iw / 2, padT + ih / 2);
      return;
    }
    if (labels.length) {
      c.textBaseline = 'alphabetic'; c.fillStyle = '#7fa892';
      const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(iw / 64))));
      let lastRight = -1e9;
      labels.forEach((l, i) => {
        if (!l || (i % every !== 0 && i !== labels.length - 1)) return;
        const tw = c.measureText(l).width;
        let lx = Math.max(padL, Math.min(W - padR - tw, x(i) - tw / 2));
        if (lx < lastRight + 8) return;
        c.textAlign = 'left'; c.fillText(l, lx, H - 6);
        lastRight = lx + tw;
      });
    }
    // area
    const g = c.createLinearGradient(0, padT, 0, padT + ih);
    g.addColorStop(0, 'rgba(57,255,136,.32)'); g.addColorStop(1, 'rgba(57,255,136,0)');
    c.beginPath(); c.moveTo(x(0), y(values[0]));
    values.forEach((v, i) => c.lineTo(x(i), y(v)));
    c.lineTo(x(values.length - 1), padT + ih); c.lineTo(x(0), padT + ih); c.closePath();
    c.fillStyle = g; c.fill();
    // line
    c.beginPath(); values.forEach((v, i) => i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)));
    c.strokeStyle = '#39ff88'; c.lineWidth = 2; c.shadowColor = '#39ff88'; c.shadowBlur = 8; c.stroke(); c.shadowBlur = 0;
    if (values.length <= 40) {
      values.forEach((v, i) => { c.beginPath(); c.arc(x(i), y(v), 2.6, 0, 7); c.fillStyle = '#39ff88'; c.fill(); });
    }
    const li = values.length - 1;
    c.beginPath(); c.arc(x(li), y(values[li]), 5, 0, 7); c.fillStyle = '#040806'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#d7f5e3'; c.stroke();
    if (tag) {
      c.font = '12px "Share Tech Mono", monospace';
      const tw = c.measureText(tag).width + 12;
      const tx = Math.min(W - padR - tw, x(li) - tw / 2), ty = Math.max(1, y(values[li]) - 26);
      c.fillStyle = 'rgba(7,16,11,.92)'; c.fillRect(tx, ty, tw, 18);
      c.strokeStyle = '#39ff88'; c.lineWidth = 1; c.strokeRect(tx + .5, ty + .5, tw - 1, 17);
      c.fillStyle = '#39ff88'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(tag, tx + 6, ty + 9.5);
    }
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
    return 10 * p;
  }

  // Shows "Loading" in host until window[name] exists, then calls ready(). Returns a cancel function.
  function waitFor(name, host, ready) {
    if (window[name]) { ready(window[name]); return () => {}; }
    host.innerHTML = '<div class="loading-state">Loading</div>';
    let stop = false;
    const iv = setInterval(() => {
      if (stop || !window[name]) return;
      clearInterval(iv);
      host.innerHTML = '';
      ready(window[name]);
    }, 250);
    return () => { stop = true; clearInterval(iv); };
  }

  return { day, esc, fmt, icon, coin, el, time, clock, date, modeName, AVATARS, avatar, lineChart, waitFor };
})();
