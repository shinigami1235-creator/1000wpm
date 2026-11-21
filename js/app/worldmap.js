// The Keyspace ops map at the top of #/home, in the look of a spy game's world map:
// glowing teal land over a dark ocean, the game modes as mission markers, the community
// as country markers with arcs to the player's own country, what is happening right now
// (js/app/activity.js) and a time-lapse of every day since launch.
//
// It is a flat 2D map on one canvas in the Equal Earth projection. The land, its glow and
// borders are drawn once per resize into an offscreen canvas; the lit countries and
// milestones once per data change; each frame draws only what moves, capped at 30 fps.
// Markers, tags, the HUD, the feed and the controls are DOM so screen readers get them.
//
// WorldMap.mount(section) -> stop(); the markup is in js/app/home.js.
window.WorldMap = (() => {
  const T = '60,242,180', TEAL = '#3cf2b4', INK = '#d7f5e3', OCEAN = '#03100e', RED = '255,77,94', CY = '62,230,255';
  const LAT_TOP = 84, LAT_BOT = -56;
  const FPS_MS = 33;
  const HUB_ARCS = 15;
  const DRAG_SEEN = 'wpm-map-drag-seen', VIEW_KEY = 'wpm-map-view';

  // ---------- Equal Earth projection (Šavrič, Patterson and Jenny, 2018) ----------
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  function ee(lon, lat) {
    const l = lon * Math.PI / 180, th = Math.asin(M * Math.sin(lat * Math.PI / 180));
    const t2 = th * th, t6 = t2 * t2 * t2;
    return [l * Math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
  }
  const XMAX = ee(180, 0)[0], YTOP = ee(0, LAT_TOP)[1], YBOT = ee(0, LAT_BOT)[1];
  const ASPECT = (YTOP - YBOT) / (2 * XMAX);

  let proj = null;
  function project(w) {
    if (proj) return proj;
    const q = w.q;
    proj = new Map();
    for (const [code, , lx, ly, rings] of w.c) {
      const pr = rings.map(flat => {
        const out = new Float32Array(flat.length);
        let x = 0, y = 0;
        for (let i = 0; i < flat.length; i += 2) {
          x += flat[i]; y += flat[i + 1];
          const p = ee(x / q, Math.max(LAT_BOT - 4, y / q));
          out[i] = p[0]; out[i + 1] = p[1];
        }
        return out;
      });
      proj.set(code, { rings: pr, label: ee(lx / q, ly / q) });
    }
    return proj;
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const MODE_NAME = { 'time-15': '15 second test', 'time-30': '30 second test', 'time-60': '60 second test', 'time-120': '120 second test',
    'words-25': '25 word test', 'words-50': '50 word test', 'words-100': '100 word test', quote: 'quote test', custom: 'custom test' };
  const trim = (v, d) => v.toFixed(d).replace(/\.0+$|(\.\d*?)0+$/, '$1');
  const short = n => n >= 1e9 ? trim(n / 1e9, n >= 1e10 ? 0 : 2) + 'B' : n >= 1e6 ? trim(n / 1e6, n >= 1e8 ? 0 : 1) + 'M' : UI.fmt(n);

  // a fine grain, made once
  let grain = null;
  function noise() {
    if (grain) return grain;
    grain = document.createElement('canvas'); grain.width = grain.height = 128;
    const g = grain.getContext('2d'), im = g.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.random() * 40; }
    g.putImageData(im, 0, 0);
    return grain;
  }
  function hexPath(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); }
    c.closePath();
  }

  function mount(root) {
    const e = UI.esc;
    const q = s => root.querySelector(s);
    const stage = q('[data-map-stage]'), box = q('[data-map]'), cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
    const dotsEl = q('.hm-dots'), callsEl = q('.hm-calls'), misEl = q('.hm-missions'), card = q('.hm-card'), drag = q('.hm-drag');
    const banner = q('.hm-banner'), feedEl = q('.hm-feed'), feedLive = q('[data-feed-live]'), modesEl = q('.hm-modes');
    const hudLive = q('.hm-live'), hudDay = q('.hm-day'), range = q('[data-day]'), dayOut = q('[data-day-out]');
    const playBtn = q('[data-play]'), nowBtn = q('[data-now]'), cmpBtn = q('[data-compare]'), cmpEl = q('.hm-compare');
    const hit = document.createElement('canvas').getContext('2d');

    let W = 0, H = 0, dpr = 1, s = 1;
    let data = null, liveSnap = null, snap = null, hub = null, meCode = null;
    let landCv = null, litCv = null;
    let outline = null, paths = new Map(), pts = new Map(), arcs = [], links = [];
    let flashes = [], shots = [], duelArcs = [];
    let hover = null, pinned = null;
    let raf = 0, last = 0, t0 = performance.now();
    let onScreen = true, stream = null, stopped = false;
    let view = 'missions', day = null, playing = 0;
    const off = [], unsub = [];
    const X = x => (x + XMAX) * s, Y = y => (YTOP - y) * s;
    const P = (lon, lat) => { const p = ee(lon, lat); return [X(p[0]), Y(p[1])]; };
    const lit = () => snap.countries.filter(c => c.players > 0 || c.you);
    const players = () => view !== 'missions';
    const missions = () => view !== 'players';
    const now = () => performance.now() - t0;
    const meet = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

    try { const v = localStorage.getItem(VIEW_KEY); if (['missions', 'players', 'both'].includes(v)) view = v; } catch (err) {}

    // ---------- geometry ----------
    let lastSW = 0;
    function layout() {
      const sw = stage.clientWidth;
      if (!sw) return false;
      lastSW = sw;
      W = sw < 640 ? Math.max(sw, 600) : sw;
      H = Math.round(W * ASPECT);
      s = W / (2 * XMAX);
      dpr = Math.min(2, devicePixelRatio || 1);
      box.style.width = W + 'px'; box.style.height = H + 'px';
      box.style.setProperty('--mk', W < 900 ? '24px' : W < 1200 ? '30px' : '34px');
      box.classList.toggle('small', W < 900);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      return true;
    }

    function shapes() {
      const Pj = project(data);
      outline = new Path2D(); paths = new Map(); pts = new Map();
      for (const [code, p] of Pj) {
        const path = new Path2D();
        for (const r of p.rings) {
          path.moveTo(X(r[0]), Y(r[1]));
          for (let i = 2; i < r.length; i += 2) path.lineTo(X(r[i]), Y(r[i + 1]));
          path.closePath();
        }
        outline.addPath(path);
        paths.set(code, path);
        pts.set(code, [X(p.label[0]), Y(p.label[1])]);
      }
    }

    // ---------- the land: drawn once per size ----------
    function canvas(w = cv.width, h = cv.height) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    // the inside edge of the land: the land minus a blurred copy of itself, so only a rim is left
    function rim(mask, px) {
      const b = canvas(), bc = b.getContext('2d'), off = b.width + 50;
      bc.shadowColor = '#fff'; bc.shadowBlur = px * dpr; bc.shadowOffsetX = off;
      bc.drawImage(mask, -off, 0);
      const r = canvas(), rc = r.getContext('2d');
      rc.drawImage(mask, 0, 0);
      rc.globalCompositeOperation = 'destination-out'; rc.drawImage(b, 0, 0);
      return r;
    }
    function tint(src, color) {
      const c = canvas(), g = c.getContext('2d');
      g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      return c;
    }
    function paintLand() {
      landCv = canvas();
      const c = landCv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = OCEAN; c.fillRect(0, 0, W, H);
      // a faint latitude and longitude grid inside the map's outline
      c.strokeStyle = `rgba(${T},.07)`; c.lineWidth = 0.6;
      for (let lon = -160; lon <= 160; lon += 20) {
        c.beginPath();
        for (let lat = LAT_BOT; lat <= LAT_TOP; lat += 4) { const p = P(lon, lat); c[lat === LAT_BOT ? 'moveTo' : 'lineTo'](p[0], p[1]); }
        c.stroke();
      }
      for (let lat = -40; lat <= 80; lat += 20) {
        c.beginPath();
        for (let lon = -180; lon <= 180; lon += 5) { const p = P(lon, lat); c[lon === -180 ? 'moveTo' : 'lineTo'](p[0], p[1]); }
        c.stroke();
      }
      c.strokeStyle = `rgba(${T},.14)`;
      for (const lon of [-180, 180]) { c.beginPath(); for (let lat = LAT_BOT; lat <= LAT_TOP; lat += 4) { const p = P(lon, lat); c[lat === LAT_BOT ? 'moveTo' : 'lineTo'](p[0], p[1]); } c.stroke(); }
      // land with a glow around it
      c.save(); c.shadowColor = `rgba(${T},.45)`; c.shadowBlur = 16 * dpr; c.fillStyle = '#1d8a6c'; c.fill(outline); c.restore();
      // grain and a light from the north
      c.save(); c.clip(outline);
      const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(120,255,210,.16)'); gr.addColorStop(1, 'rgba(0,20,14,.25)');
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.9; c.fillStyle = c.createPattern(noise(), 'repeat'); c.fillRect(0, 0, W, H);
      c.restore();
      // country borders, dark on the lit land
      c.strokeStyle = 'rgba(2,34,26,.55)'; c.lineWidth = 0.7; c.lineJoin = 'round'; c.stroke(outline);
      // the inner glow and the bright coastline
      const mask = canvas(), mc = mask.getContext('2d');
      mc.setTransform(dpr, 0, 0, dpr, 0, 0); mc.fillStyle = '#fff'; mc.fill(outline);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 0.5; c.drawImage(tint(rim(mask, 9), '#8fffd8'), 0, 0);
      c.globalAlpha = 1; c.drawImage(tint(rim(mask, 1.4), '#d4fff0'), 0, 0);
      // vignette and a little grain on the ocean
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,4,3,.6)');
      c.fillStyle = v; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.35; c.fillStyle = c.createPattern(noise(), 'repeat'); c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    }

    // ---------- lit countries, arcs, milestones: drawn once per data change ----------
    function build() {
      const L = lit();
      const h = pts.get(hub);
      arcs = h ? L.filter(c => c.code !== hub && pts.has(c.code)).sort((a, b) => b.players - a.players)
        .slice(0, HUB_ARCS).map((c, i) => arc(c.code, pts.get(c.code), h, i)) : [];
      links = []; const seen = new Set();
      for (const a of L) {
        if (!pts.has(a.code) || a.code === hub) continue;
        let best = null, bd = Infinity;
        for (const b of L) {
          if (b === a || b.code === hub || !pts.has(b.code)) continue;
          const pa = pts.get(a.code), pb = pts.get(b.code), d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) continue;
        const k = [a.code, best.code].sort().join();
        if (!seen.has(k)) { seen.add(k); links.push(arc(a.code, pts.get(a.code), pts.get(best.code), links.length, 0.16)); }
      }
      paintLit();
      placeDots();
      paintCount();
    }
    function arc(code, a, b, i, lift = 0.24) {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const c = [mx, my - Math.max(8, Math.min(d * lift, H * 0.32))];
      const r = Math.sin(i * 91.7 + 3.1) * 0.5 + 0.5;
      return { code, a, b, c, period: 4200 + r * 3000, phase: (i * 0.618) % 1 };
    }
    const at = (A, t) => { const u = 1 - t; return [u * u * A.a[0] + 2 * u * t * A.c[0] + t * t * A.b[0], u * u * A.a[1] + 2 * u * t * A.c[1] + t * t * A.b[1]]; };
    function curve(c, A) { c.beginPath(); c.moveTo(A.a[0], A.a[1]); c.quadraticCurveTo(A.c[0], A.c[1], A.b[0], A.b[1]); c.stroke(); }

    function paintLit() {
      litCv ||= canvas();
      litCv.width = cv.width; litCv.height = cv.height;
      const c = litCv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const L = lit();
      // countries with players glow a little brighter
      for (const ct of L) {
        const p = paths.get(ct.code); if (!p) continue;
        c.fillStyle = `rgba(170,255,225,${ct.you ? .24 : .1 + Math.min(.12, ct.players / 3000)})`; c.fill(p);
      }
      const R = Activity.reached(day);
      // beacons: a country's first 100 players
      for (const code of R.beacons) {
        const p = pts.get(code); if (!p) continue;
        const g = c.createLinearGradient(p[0], p[1] - 30, p[0], p[1]);
        g.addColorStop(0, `rgba(${T},0)`); g.addColorStop(1, `rgba(200,255,235,.8)`);
        c.fillStyle = g; c.fillRect(p[0] - 1, p[1] - 30, 2, 30);
      }
      // Keyspace nodes brought online by words typed
      c.font = `${W < 900 ? 9 : 10}px "Share Tech Mono", ui-monospace, monospace`; c.textBaseline = 'middle';
      for (const n of R.nodes) {
        const p = P(n.lon, n.lat), r = n.district ? 6 : 4;
        c.beginPath(); c.moveTo(p[0], p[1] - r); c.lineTo(p[0] + r, p[1]); c.lineTo(p[0], p[1] + r); c.lineTo(p[0] - r, p[1]); c.closePath();
        c.fillStyle = OCEAN; c.fill(); c.strokeStyle = n.district ? INK : TEAL; c.lineWidth = 1.2; c.stroke();
        if (W >= 900) { c.fillStyle = `rgba(215,245,227,${n.district ? .8 : .55})`; c.fillText(n.name, p[0] + r + 4, p[1]); }
      }
      if (!players()) return;
      c.lineCap = 'round';
      c.setLineDash([3, 4]);
      for (const A of links) { c.strokeStyle = `rgba(${T},.16)`; c.lineWidth = 1; curve(c, A); }
      for (const A of arcs) { c.strokeStyle = `rgba(200,255,235,${reduce.matches ? .3 : .2})`; c.lineWidth = 1; curve(c, A); }
      c.setLineDash([]);
      // a hexagon badge on each country with players, bigger for big counts
      for (const ct of L) {
        const p = pts.get(ct.code); if (!p) continue;
        const r = ct.you ? 8 : ct.players >= 300 ? 7 : ct.players >= 100 ? 5.5 : 4;
        hexPath(c, p[0], p[1], r); c.fillStyle = '#041612'; c.fill();
        c.strokeStyle = ct.you ? INK : '#aaffe0'; c.lineWidth = ct.you ? 1.6 : 1.2; c.stroke();
        c.fillStyle = ct.you ? INK : TEAL; c.beginPath(); c.arc(p[0], p[1], r * 0.32, 0, Math.PI * 2); c.fill();
      }
    }

    // ---------- country buttons (players layer) ----------
    function label(ct) {
      const top = ct.top ? `, top typist ${ct.top.name} at ${ct.top.wpm} wpm` : '';
      return `${Community.name(ct.code)}${ct.you ? ' (you)' : ''}: ${UI.fmt(ct.players)} ${ct.players === 1 ? 'player' : 'players'}${top}`;
    }
    function placeDots() {
      dotsEl.innerHTML = '';
      dotsEl.hidden = !players();
      for (const ct of lit()) {
        const p = pts.get(ct.code); if (!p) continue;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'hm-dot' + (ct.you ? ' you' : '');
        b.dataset.code = ct.code;
        b.style.left = p[0] + 'px'; b.style.top = p[1] + 'px';
        b.setAttribute('aria-label', label(ct));
        if (ct.you) b.innerHTML = '<span>You</span>';
        dotsEl.append(b);
      }
    }

    // ---------- mission markers ----------
    const regionNow = () => day ? Activity.regionOn(dateOfDay(day)) : (Activity.boss() || {}).region || Activity.REGIONS[0];
    const dateOfDay = n => { const d = new Date(Activity.LAUNCH_DATE + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n - 1); return d.toISOString().slice(0, 10); };
    function markerHTML(m, sub) {
      return `<a class="hm-mk${m.big ? ' big' : ''}${sub ? ' sub' : ''}" data-mk="${m.id}" href="${m.href}" style="--c:${m.color}">
        <span class="hex">${Missions.svg(m.icon)}</span><svg class="lead" viewBox="0 0 14 14" aria-hidden="true"><path d="M0 14L14 0"/></svg>
        <span class="tag"><b>${e(m.name)}</b>${m.id === 'boss' ? '<small data-boss-where></small><i class="bar"><i data-boss-bar></i></i>' : m.tag ? `<small>${e(m.tag)}</small>` : ''}</span></a>`;
    }
    function buildMissions() {
      misEl.innerHTML = Missions.LIST.map(m => m.cluster
        ? `<div class="hm-cluster" data-cluster style="--c:${m.color}">
            <button class="hm-mk cl" type="button" data-mk="${m.id}" aria-expanded="false" aria-controls="hm-train">
              <span class="hex">${Missions.svg(m.icon)}</span><svg class="lead" viewBox="0 0 14 14" aria-hidden="true"><path d="M0 14L14 0"/></svg>
              <span class="tag"><b>${e(m.name)}</b><small>3 modes</small></span></button>
            <div class="hm-fan" id="hm-train" hidden>${Missions.TRAINING.map(t => markerHTML(t, true)).join('')}</div></div>`
        : markerHTML(m)).join('');
      for (const m of Missions.LIST) {
        const el = misEl.querySelector(`[data-mk="${m.id}"]`);
        el.dataset.side = m.side === 'l' ? 'l' : 'r'; setSide(el, el.dataset.side, false);
        el.setAttribute('aria-label', `${m.name}. ${m.desc}`);
      }
      Missions.TRAINING.forEach(t => {
        const el = misEl.querySelector(`[data-mk="${t.id}"]`);
        el.dataset.side = 'l'; setSide(el, 'l', false); el.setAttribute('aria-label', `${t.name}. ${t.desc}`);
        const a = t.angle * Math.PI / 180;
        el.style.setProperty('--fx', (-Math.cos(a)) + ''); el.style.setProperty('--fy', Math.sin(a) + '');
      });
      modesEl.innerHTML = Missions.LIST.filter(m => !m.cluster).concat(Missions.TRAINING)
        .map(m => `<li><a href="${m.href}" style="--c:${m.color}"><span class="hex">${Missions.svg(m.icon)}</span><span><b>${e(m.name)}</b><small>${e(m.desc)}</small></span></a></li>`).join('');
    }
    function placeMissions() {
      misEl.hidden = !missions();
      for (const m of Missions.LIST) {
        const el = m.cluster ? misEl.querySelector('[data-cluster]') : misEl.querySelector(`[data-mk="${m.id}"]`);
        let lon = m.lon, lat = m.lat, side = m.side;
        if (m.id === 'boss') { const r = regionNow(); lon = r.lon; lat = r.lat; side = r.side; }
        const p = P(lon, lat);
        el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
        if (m.id === 'boss') el.dataset.side = side === 'l' ? 'l' : 'r';
      }
      paintBoss();
      fitTags();
    }
    function setSide(el, side, down) {
      el.classList.toggle('side-l', side === 'l'); el.classList.toggle('side-r', side !== 'l'); el.classList.toggle('down', !!down);
    }
    // Each tag keeps its own side unless it would cover another marker, another tag or a
    // Keyspace node; then it tries the other side, then below. The World Boss moves every
    // day, so it goes last, after the fixed markers and the open Training fan.
    function fitTags() {
      if (!missions() || box.classList.contains('small') || !W) return;
      const br = box.getBoundingClientRect();
      const R = el => { const r = el.getBoundingClientRect(); return { l: r.left - br.left - 4, t: r.top - br.top - 4, r: r.right - br.left + 4, b: r.bottom - br.top + 4 }; };
      const all = [...misEl.querySelectorAll('.hm-mk')].filter(m => !m.closest('[hidden]'));
      const taken = all.map(m => ({ ...R(m.querySelector('.hex')), m }));
      for (const n of Activity.reached(day).nodes) { const p = P(n.lon, n.lat); taken.push({ l: p[0] - 7, t: p[1] - 7, r: p[0] + 12 + n.name.length * 6, b: p[1] + 7 }); }
      const order = all.filter(m => m.dataset.mk !== 'boss' && !m.classList.contains('sub'))
        .concat(all.filter(m => m.classList.contains('sub')), all.filter(m => m.dataset.mk === 'boss'));
      for (const m of order) {
        const tag = m.querySelector('.tag');
        if (m.classList.contains('cl') && m.closest('.open')) continue;
        const pref = m.dataset.side || 'r', other = pref === 'r' ? 'l' : 'r';
        let got = null;
        for (const [side, down] of [[pref, false], [other, false], [pref, true], [other, true]]) {
          setSide(m, side, down);
          const t = R(tag);
          if (t.l < 2 || t.r > W - 2 || t.t < 2 || t.b > H - 2) continue;
          if (taken.some(o => o.m !== m && meet(o, t))) continue;
          got = t; break;
        }
        if (!got) { setSide(m, pref, false); got = R(tag); }
        taken.push(got);
      }
    }
    function paintBoss() {
      const el = misEl.querySelector('[data-mk="boss"]'); if (!el) return;
      const r = regionNow(), b = Activity.boss();
      el.querySelector('[data-boss-where]').textContent = `Syntax Error over ${r.name}`;
      const pct = b && !day ? Math.max(0, b.hp / b.max) : null;
      const bar = el.querySelector('[data-boss-bar]');
      bar.parentNode.hidden = pct == null;
      if (pct != null) bar.style.width = (pct * 100).toFixed(1) + '%';
      el.setAttribute('aria-label', `World Boss: Syntax Error over ${r.name}${pct != null ? `, ${Math.round(pct * 100)}% health left` : ''}. ${Missions.byId('boss').desc}`);
    }
    // the Training cluster fans out on hover, focus or tap
    let fanT = 0;
    function fan(open) {
      const cl = misEl.querySelector('[data-cluster]'); if (!cl) return;
      clearTimeout(fanT);
      const b = cl.querySelector('.cl'), f = cl.querySelector('.hm-fan');
      if (open === (b.getAttribute('aria-expanded') === 'true')) return;
      b.setAttribute('aria-expanded', open); f.hidden = !open; cl.classList.toggle('open', open);
      fitTags();
    }
    on(misEl, 'pointerenter', ev => { if (ev.target.closest && ev.target.closest('[data-cluster]') && ev.pointerType === 'mouse') fan(true); }, true);
    on(misEl, 'pointerleave', ev => { if (ev.target.matches && ev.target.matches('[data-cluster]')) fanT = setTimeout(() => { if (!misEl.querySelector('[data-cluster]').contains(document.activeElement)) fan(false); }, 300); }, true);
    on(misEl, 'click', ev => {
      const cl = ev.target.closest('.cl');
      if (cl) { ev.preventDefault(); fan(cl.getAttribute('aria-expanded') !== 'true'); return; }
      const a = ev.target.closest('a.hm-mk');
      // on touch the first tap shows the card and Go opens the mode
      if (a && ev.pointerType !== 'mouse' && cardFor !== a.dataset.mk && matchMedia('(hover: none)').matches) { ev.preventDefault(); showMission(a.dataset.mk, true); }
    });
    on(misEl, 'focusin', ev => { const a = ev.target.closest('.hm-mk'); if (a) showMission(a.dataset.mk); if (ev.target.closest('[data-cluster]')) fan(true); });
    on(misEl, 'focusout', () => setTimeout(() => {
      if (!misEl.contains(document.activeElement)) { fan(false); if (!card.matches(':hover')) hideCard(); }
      else if (!misEl.querySelector('[data-cluster]').contains(document.activeElement)) fan(false);
    }, 0));
    on(misEl, 'pointerover', ev => { if (ev.pointerType !== 'mouse') return; const a = ev.target.closest('.hm-mk'); if (a) showMission(a.dataset.mk); });
    on(misEl, 'pointerout', ev => { if (ev.pointerType === 'mouse' && ev.target.closest('.hm-mk') && !ev.relatedTarget?.closest?.('.hm-mk')) hideSoon(); });

    // ---------- the card: a country or a mission ----------
    let cardFor = null, cardAt = null, hideT = 0;
    function hideCard() { clearTimeout(hideT); card.hidden = true; card.classList.remove('mission'); cardFor = null; hover = null; paintStill(); }
    function hideSoon() { clearTimeout(hideT); hideT = setTimeout(() => { if (!card.matches(':hover') && !pinned) hideCard(); }, 260); }
    on(card, 'pointerleave', () => { if (cardFor && !pinned) hideSoon(); });
    on(card, 'pointerenter', () => clearTimeout(hideT));
    function showMission(id, pin) {
      const m = Missions.byId(id); if (!m || m.cluster) return;   // the Training cluster shows its fan instead
      clearTimeout(hideT);
      hover = null; cardFor = id; if (pin) pinned = null;
      const mine = Missions.progress(id);
      let extra = '';
      if (id === 'boss') {
        const b = Activity.boss(), r = regionNow();
        extra = `<p class="hm-where">Syntax Error surfaced over ${e(r.name)}${b && !day ? `. ${Math.round(b.hp / b.max * 100)}% health left` : ''}.</p>`;
      }
      card.innerHTML = `<b>${e(m.name)}</b><p class="hm-desc">${e(m.desc)}</p>${extra}
        ${mine ? `<p class="hm-mine">${e(mine)}</p>` : ''}<a class="hm-go-link" href="${m.href}">Go</a>`;
      card.classList.add('mission');
      card.hidden = false;
      const el = misEl.querySelector(`[data-mk="${id}"]`);
      const r = el.querySelector('.hex').getBoundingClientRect(), fr = root.querySelector('.hm-mapwrap').getBoundingClientRect();
      cardAt = [r.left + r.width / 2 - fr.left, r.top - fr.top, r.bottom - fr.top];
      place();
    }
    function show(code) {
      const ct = code && snap.countries.find(c => c.code === code);
      hover = ct ? code : null; cardFor = null; cardAt = null;
      if (!ct) { card.hidden = true; paintStill(); return; }
      card.classList.remove('mission');
      card.innerHTML = `<b>${e(Community.name(code))}</b>
        <dl><dt>Players</dt><dd>${UI.fmt(ct.players)}</dd>
        <dt>Top typist</dt><dd>${ct.top ? e(ct.top.name) : 'None yet'}</dd>
        <dt>Best wpm</dt><dd>${ct.top ? ct.top.wpm : '-'}</dd></dl>
        ${ct.you ? '<p>Your country</p>' : ''}
        ${ct.top && window.MultiUI ? `<a class="hm-visit" href="#/u/${encodeURIComponent(ct.top.name)}">Visit ${e(ct.top.name)}</a>${pinned === code ? '' : '<small class="hm-pin">Click the country to keep this card open.</small>'}` : ''}`;
      card.hidden = false;
      place(); paintStill();
    }
    // the card stays inside the part of the map on screen
    function place() {
      if (card.hidden) return;
      const wrap = root.querySelector('.hm-mapwrap');
      let px, top, bottom;
      if (cardAt) [px, top, bottom] = cardAt;
      else {
        const p = pts.get(hover); if (!p) return;
        px = p[0] + stage.offsetLeft + box.offsetLeft - stage.scrollLeft; top = bottom = p[1] + stage.offsetTop;
      }
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const x = Math.max(stage.offsetLeft + 8, Math.min(stage.offsetLeft + stage.clientWidth - cw - 8, px - cw / 2));
      let y = top - ch - 12;
      if (y < stage.offsetTop + 4) y = bottom + 12;
      card.style.left = x + 'px'; card.style.top = Math.min(wrap.clientHeight - ch - 4, y) + 'px';
    }
    function pick(x, y, touch) {
      let best = null, bd = touch ? 24 : 14;
      for (const ct of lit()) { const p = pts.get(ct.code); if (!p) continue; const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = ct.code; } }
      if (best) return best;
      for (const ct of lit()) { const p = paths.get(ct.code); if (p && hit.isPointInPath(p, x, y)) return ct.code; }
      return null;
    }
    const local = ev => { const r = box.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    on(box, 'pointermove', ev => {
      if (ev.pointerType !== 'mouse' || pinned || !players() || ev.target.closest('.hm-mk, .hm-cluster')) return;
      if (cardFor) return;
      const code = pick(...local(ev), false);
      if (code !== hover) show(code);
      box.style.cursor = code ? 'pointer' : '';
    });
    on(box, 'pointerleave', () => { if (!pinned && !cardFor && !box.contains(document.activeElement)) show(null); });
    on(box, 'click', ev => {
      if (!players() || ev.target.closest('.hm-mk, .hm-cluster')) return;
      const dot = ev.target.closest('.hm-dot');
      const code = dot ? dot.dataset.code : pick(...local(ev), ev.pointerType !== 'mouse');
      pinned = code && code !== pinned ? code : null;
      show(pinned);
    });
    on(dotsEl, 'focusin', ev => { const d = ev.target.closest('.hm-dot'); if (d) show(d.dataset.code); });
    on(dotsEl, 'focusout', () => setTimeout(() => { if (!dotsEl.contains(document.activeElement) && !pinned) show(null); }, 0));
    on(document, 'keydown', ev => { if (ev.key === 'Escape' && !card.hidden) { pinned = null; hideCard(); fan(false); } });
    on(document, 'pointerdown', ev => {
      if (!card.hidden && !box.contains(ev.target) && !card.contains(ev.target)) { pinned = null; hideCard(); }
      if (!ev.target.closest('[data-cluster]')) fan(false);
    });

    // ---------- callouts on the players layer: rotate, never overlap ----------
    let callT = 0, newTags = [], featIdx = 0;
    function rects() {
      const br = box.getBoundingClientRect(), out = [];
      const add = el => { if (!el || el.hidden) return; const r = el.getBoundingClientRect(); if (r.width) out.push({ l: r.left - br.left - 6, t: r.top - br.top - 6, r: r.right - br.left + 6, b: r.bottom - br.top + 6 }); };
      if (missions()) misEl.querySelectorAll('.hex, .tag').forEach(add);
      const h = pts.get(hub); if (h) out.push({ l: h[0] - 16, t: h[1] - 16, r: h[0] + 44, b: h[1] + 16 });
      // Keyspace nodes and their names, drawn on the canvas
      for (const n of Activity.reached(day).nodes) {
        const p = P(n.lon, n.lat), w = W >= 900 ? 12 + n.name.length * 6 : 8;
        out.push({ l: p[0] - 8, t: p[1] - 8, r: p[0] + w, b: p[1] + 8 });
      }
      const intro = root.querySelector('.hm-intro');
      if (getComputedStyle(intro).position === 'absolute') add(intro);
      return out;
    }
    function callouts() {
      callsEl.innerHTML = '';
      if (!players() || playing || !snap) return;
      const taken = rects();
      const left = stage.scrollLeft - box.offsetLeft, right = left + stage.clientWidth;
      const L = lit().filter(c => c.code !== hub && pts.has(c.code) && pts.get(c.code)[0] > left + 20 && pts.get(c.code)[0] < right - 20);
      if (!L.length) return;
      const byPlayers = L.slice().sort((a, b) => b.players - a.players);
      const list = [];
      for (const n of newTags) if (L.some(c => c.code === n)) list.push({ code: n, kind: 'new' });
      const feat = byPlayers[featIdx % Math.min(8, byPlayers.length)];
      if (feat && !list.some(x => x.code === feat.code)) list.push({ code: feat.code, kind: 'feat' });
      if (W >= 900) {
        const rest = byPlayers.filter(c => !list.some(x => x.code === c.code));
        for (let i = 0; i < 2 && rest.length; i++) list.push({ code: rest.splice((featIdx * 7 + i * 5) % rest.length, 1)[0].code, kind: 'tag' });
      }
      for (const it of list) {
        const ct = snap.countries.find(c => c.code === it.code); if (!ct) continue;
        const el = document.createElement('div');
        el.className = 'hm-call ' + it.kind;
        el.innerHTML = it.kind === 'feat'
          ? `<span class="box"><b>${e(Community.name(ct.code))}</b><small>${UI.fmt(ct.players)} players</small>${ct.top ? `<small>Top typist ${e(ct.top.name)}, ${ct.top.wpm} wpm</small>` : ''}</span>`
          : it.kind === 'new' ? `<span class="box"><em>NEW</em><b>${e(Community.name(ct.code))}</b></span>`
          : `<span class="box"><b>${e(Community.name(ct.code))}</b><small>${UI.fmt(ct.players)}</small></span>`;
        el.style.visibility = 'hidden';
        callsEl.append(el);
        const bx = el.querySelector('.box'), bw = bx.offsetWidth, bh = bx.offsetHeight, p = pts.get(ct.code), d = it.kind === 'feat' ? 30 : 20;
        let done = false;
        for (const [sx, sy] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
          const ex = p[0] + sx * d, ey = p[1] + sy * d;
          const r = { l: sx > 0 ? ex : ex - bw, r: sx > 0 ? ex + bw : ex, t: sy < 0 ? ey - bh : ey, b: sy < 0 ? ey : ey + bh };
          const lead = { l: Math.min(p[0], ex), r: Math.max(p[0], ex), t: Math.min(p[1], ey), b: Math.max(p[1], ey) };
          if (r.l < left + 4 || r.r > Math.min(W, right) - 4 || r.t < 4 || r.b > H - 4) continue;
          if (taken.some(o => meet(o, r) || meet(o, lead))) continue;
          taken.push({ l: r.l - 6, r: r.r + 6, t: r.t - 6, b: r.b + 6 });
          el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
          el.style.setProperty('--d', d + 'px'); el.classList.add(sx > 0 ? 'to-r' : 'to-l', sy > 0 ? 'down' : 'up');
          el.style.visibility = ''; done = true; break;
        }
        if (!done) el.remove();
      }
    }
    function rotate() { featIdx++; callouts(); }

    // ---------- HUD, feed, banner ----------
    const hudSet = (k, v) => { const el = root.querySelector(`[data-k="${k}"]`); if (el && el.textContent !== v) el.textContent = v; };
    function paintHud() {
      if (day) return;
      const n = Activity.now(), b = Activity.boss();
      hudSet('online', UI.fmt(n.online)); hudSet('inBoss', UI.fmt(n.inBoss)); hudSet('duels', UI.fmt(n.duels));
      hudSet('words', UI.fmt(n.wordsToday)); hudSet('chat', UI.fmt(n.inChat));
      if (b) {
        const pct = b.hp / b.max;
        root.querySelector('[data-hud-bar]').style.width = (pct * 100).toFixed(2) + '%';
        hudSet('hp', `${Math.round(pct * 100)}%`);
        root.querySelector('.hm-bossbar').title = `${UI.fmt(b.hp)} of ${UI.fmt(b.max)}`;
        hudSet('hpn', UI.fmt(b.hp));
      }
      paintBoss();
    }
    function paintCount() {
      const L = lit(), n = L.reduce((a, c) => a + c.players, 0);
      root.querySelectorAll('[data-map-count]').forEach(el => {
        el.innerHTML = snap.failed ? 'Player counts could not be loaded.' : `<b>${UI.fmt(n)}</b> ${n === 1 ? 'player' : 'players'} in <b>${L.length}</b> ${L.length === 1 ? 'country' : 'countries'}`;
      });
    }
    const who = p => window.MultiUI ? `<a href="#/u/${encodeURIComponent(p.id || p.name)}">${e(p.name)}</a> (${e(p.country)})` : `${e(p.name)} (${e(p.country)})`;
    let liveAt = 0, liveText = '';
    function feed(html, text) {
      const li = document.createElement('li');
      li.innerHTML = html;
      if (!reduce.matches) li.className = 'in';
      feedEl.prepend(li);
      while (feedEl.children.length > 5) feedEl.lastElementChild.remove();
      // screen readers hear at most one line every 12 seconds
      liveText = text || li.textContent;
      const t = Date.now();
      if (t - liveAt > 12000) { liveAt = t; feedLive.textContent = liveText; }
    }
    let bannerT = 0;
    function flashBanner(text) {
      banner.textContent = text; banner.hidden = false;
      clearTimeout(bannerT); bannerT = setTimeout(() => { banner.hidden = true; }, 4200);
    }

    // ---------- events ----------
    function communityEvent(ev, sn) {
      if (stopped) return;
      liveSnap = sn;
      if (day) return;
      const before = snap ? snap.countries.find(c => c.code === ev.country) : null;
      const was = before ? before.players : 0;
      snap = sn;
      build(); placeMissions();
      if (ev.type === 'join') {
        const p = pts.get(ev.country), h = pts.get(hub);
        const A = arcs.find(x => x.code === ev.country) || (p && h && ev.country !== hub ? arc(ev.country, p, h, 0) : null);
        flashes.push({ code: ev.country, t: now(), arc: A });
        newTags.unshift(ev.country); newTags = [...new Set(newTags)].slice(0, 2);
        setTimeout(() => { newTags = newTags.filter(c => c !== ev.country); }, 9000);
        callouts();
        feed(`New player from ${e(Community.name(ev.country))}`);
        const c = sn.countries.find(x => x.code === ev.country);
        if (c && was < 100 && c.players >= 100) feed(`${e(Community.name(c.code))} reached 100 players and got a beacon`);
      } else if (ev.type === 'best') {
        feed(`Someone in ${e(Community.inName(ev.country))} typed ${ev.wpm} wpm on the ${MODE_NAME[ev.mode] || 'typing test'}`);
      } else if (ev.type === 'breach') {
        feed(`Someone in ${e(Community.inName(ev.country))} cleared Breach chapter ${ev.chapter}`);
      }
      if (hover && !card.hidden) show(hover);
    }
    function wireActivity() {
      unsub.push(Activity.on('hit', h => {
        if (day) return;
        const p = pts.get(h.country), b = regionNow();
        if (p && missions() && !reduce.matches && shots.length < 12) shots.push({ a: p, b: P(b.lon, b.lat), t: now(), red: Math.random() < 0.5 });
        if (h.feed) feed(`${who(h)} hit Syntax Error for ${UI.fmt(h.dmg)} at ${h.wpm} wpm`);
      }));
      unsub.push(Activity.on('duel-start', du => {
        if (day) return;
        const a = pts.get(du.a.country), b = pts.get(du.b.country);
        if (a && b && du.a.country !== du.b.country && duelArcs.length < 3) duelArcs.push({ ...arc('duel', a, b, duelArcs.length, 0.3), t: now(), life: 12000 });
      }));
      unsub.push(Activity.on('duel-end', du => { if (!day) feed(`Duel: ${who(du.winner)} beat ${who(du.loser)} ${du.w}-${du.l}`); }));
      unsub.push(Activity.on('party', pa => { if (!day) feed(`A party of ${pa.size} cleared a run through Keyspace`); }));
      unsub.push(Activity.on('rush', r => { if (!day) feed(`${who(r)} beat ${r.bosses} bosses in Boss rush`); }));
      unsub.push(Activity.on('chat', c => { if (!day && c.people > 1) feed(`${UI.fmt(c.people)} people in Open Port`); }));
      unsub.push(Activity.on('defeat', d => {
        if (day) return;
        const text = `Syntax Error defeated by ${UI.fmt(d.players)} players`;
        flashBanner(text); feed(text);
      }));
      unsub.push(Activity.on('respawn', r => { if (day) return; placeMissions(); feed(`Syntax Error surfaced over ${e(r.region.name)}`); }));
      unsub.push(Activity.on('milestone', m => {
        if (day) return;
        paintLit(); feed(nodeLine(m.node));
      }));
    }
    const nodeLine = n => n.district ? `Keyspace grew: the ${e(n.name)} district is online after ${short(n.words)} words` : `Keyspace grew: a new node is online after ${short(n.words)} words`;

    // ---------- drawing ----------
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (t - last < FPS_MS) return;
      last = t;
      if (playing) playStep();
      draw(now());
    }
    function draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (landCv) ctx.drawImage(landCv, 0, 0);
      if (litCv) ctx.drawImage(litCv, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      const moving = !reduce.matches;
      // countries with someone typing right now flicker faintly
      if (moving) {
        const typing = day ? histTyping : Activity.typingIn();
        for (const code of typing) {
          const p = paths.get(code); if (!p) continue;
          const k = 0.5 + 0.5 * Math.sin(t / 170 + code.charCodeAt(0) * 1.7 + code.charCodeAt(1));
          if (k > 0.55) { ctx.fillStyle = `rgba(200,255,235,${(k - 0.55) * 0.16})`; ctx.fill(p); }
        }
      }
      if (hover && paths.get(hover)) { ctx.fillStyle = 'rgba(220,255,240,.16)'; ctx.fill(paths.get(hover)); }
      ctx.globalCompositeOperation = 'lighter';
      if (players()) {
        for (const A of arcs) {
          if (A.code === hover) { ctx.strokeStyle = `rgba(${T},.6)`; ctx.lineWidth = 1.2; curve(ctx, A); }
          if (!moving) continue;
          // now and then a keycap travels to the hub
          const u = (t / A.period + A.phase) % 2.6;
          if (u < 1) keycap(A, u);
        }
        const h = pts.get(hub);
        if (h) ring(h, t, `${T}`, 2600, 9, 30);
      }
      // the World Boss pulses
      if (missions()) {
        const r = regionNow(), b = P(r.lon, r.lat);
        ring(b, t, RED, 2000, 18, 46);
        ring(b, t + 1000, RED, 2000, 18, 46);
        // hits fly in from the countries fighting it
        shots = shots.filter(sh => t - sh.t < 900);
        for (const sh of shots) {
          const k = (t - sh.t) / 700;
          if (k < 1) {
            const x = sh.a[0] + (sh.b[0] - sh.a[0]) * k, y = sh.a[1] + (sh.b[1] - sh.a[1]) * k - Math.sin(k * Math.PI) * 30;
            const k0 = Math.max(0, k - 0.12), x0 = sh.a[0] + (sh.b[0] - sh.a[0]) * k0, y0 = sh.a[1] + (sh.b[1] - sh.a[1]) * k0 - Math.sin(k0 * Math.PI) * 30;
            ctx.strokeStyle = sh.red ? `rgba(${RED},.9)` : `rgba(${T},.9)`; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
          } else {
            const f = (t - sh.t - 700) / 200;
            ctx.fillStyle = `rgba(255,220,220,${(1 - f) * .7})`; ctx.beginPath(); ctx.arc(sh.b[0] + (Math.random() - .5) * 10, sh.b[1] + (Math.random() - .5) * 10, 2.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // duels: a brief arc between the two countries
      duelArcs = duelArcs.filter(d => t - d.t < d.life);
      for (const d of duelArcs) {
        const k = (t - d.t) / d.life, a = Math.min(1, k * 6, (1 - k) * 6);
        ctx.setLineDash([4, 4]); ctx.strokeStyle = `rgba(${CY},${a * .7})`; ctx.lineWidth = 1.2; curve(ctx, d); ctx.setLineDash([]);
        if (moving) {
          const u = (Math.sin(t / 500) + 1) / 2, p = at(d, u), p2 = at(d, 1 - u);
          ctx.fillStyle = `rgba(${CY},${a})`;
          ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(p2[0], p2[1], 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      // sign-ups: a ring and one keycap to the hub
      flashes = flashes.filter(f => t - f.t < 2600);
      for (const f of flashes) {
        const k = (t - f.t) / 1600, p = pts.get(f.code);
        if (p && k < 1) { ctx.strokeStyle = `rgba(${T},${(1 - k) * .9})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], 4 + k * 24, 0, Math.PI * 2); ctx.stroke(); }
        if (f.arc && players() && moving) keycap(f.arc, (t - f.t) / 1800);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    function ring(p, t, rgb, period, r0, r1) {
      if (reduce.matches) {
        ctx.strokeStyle = `rgba(${rgb},.5)`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], (r0 + r1) / 2, 0, Math.PI * 2); ctx.stroke();
        return;
      }
      const k = (t % period) / period;
      ctx.strokeStyle = `rgba(${rgb},${(1 - k) * .75})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(p[0], p[1], r0 + (r1 - r0) * k, 0, Math.PI * 2); ctx.stroke();
    }
    function keycap(A, u) {
      if (u <= 0 || u >= 1) return;
      for (let k = 1; k <= 5; k++) {
        const a = at(A, Math.max(0, u - k * 0.025)), b = at(A, Math.max(0, u - (k - 1) * 0.025));
        ctx.strokeStyle = `rgba(${T},${(1 - k / 6) * .5})`; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const p = at(A, u);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#041612'; ctx.fillRect(p[0] - 4.5, p[1] - 4, 9, 8);
      ctx.strokeStyle = '#c8ffe9'; ctx.lineWidth = 1; ctx.strokeRect(p[0] - 4.5, p[1] - 4, 9, 8);
      ctx.fillStyle = '#c8ffe9'; ctx.fillRect(p[0] - 2, p[1] + 0.5, 4, 1);
      ctx.globalCompositeOperation = 'lighter';
    }
    function paintStill() { if (!raf) draw(now()); }

    // ---------- the time-lapse ----------
    let histTyping = new Set(), hist = [], prevReached = null;
    function setDay(n, fromPlay) {
      const max = hist.length;
      n = Math.max(1, Math.min(max, Math.round(n)));
      const live = n >= max && !fromPlay;
      day = live ? null : n;
      range.value = n;
      root.classList.toggle('history', !!day);
      hudLive.hidden = !!day; hudDay.hidden = !day;
      if (live) {
        snap = liveSnap; hub = meCode || Community.ART_COUNTRY;
        dayOut.textContent = 'Today'; range.setAttribute('aria-valuetext', 'Today');
      } else {
        const d = hist[n - 1];
        snap = Activity.snapAt(n);
        hub = snap.countries.some(c => c.code === meCode) ? meCode : snap.countries.some(c => c.code === 'TH') ? 'TH' : snap.countries[0] && snap.countries[0].code;
        dayOut.textContent = `Day ${n} · ${UI.fmt(d.players)} ${d.players === 1 ? 'player' : 'players'}`;
        range.setAttribute('aria-valuetext', dayOut.textContent);
        hudSet('d-day', `Day ${n}`); hudSet('d-date', UI.date(d.date + 'T12:00:00', false));
        hudSet('d-players', UI.fmt(d.players)); hudSet('d-countries', UI.fmt(d.countries));
        hudSet('d-peak', UI.fmt(d.peakOnline)); hudSet('d-words', UI.fmt(d.words)); hudSet('d-defeats', UI.fmt(d.defeats));
        // activity on the map follows that day's numbers
        const share = Math.min(1, d.peakOnline / Math.max(1, hist[max - 1].peakOnline));
        histTyping = new Set(snap.countries.filter(() => Math.random() < 0.25 + share * 0.6).map(c => c.code));
      }
      // milestones reached since the last frame show in the feed as the time-lapse plays
      const R = Activity.reached(day);
      if (prevReached && fromPlay) {
        for (const nd of R.nodes) if (!prevReached.nodes.includes(nd)) feed(nodeLine(nd));
        for (const c of R.beacons) if (!prevReached.beacons.has(c)) feed(`${e(Community.name(c))} reached 100 players and got a beacon`);
      }
      prevReached = R;
      build(); placeMissions(); if (!playing) callouts();
      paintCompare(); paintHud(); paintStill();
    }
    let playFrom = 0, playDays = 0;
    function playStep() {
      const k = (performance.now() - playFrom) / 15000;
      const n = 1 + Math.floor(k * (playDays - 1));
      if (n >= playDays) { stopPlay(); setDay(playDays); return; }
      if (n !== day) setDay(n, true);
      // a little activity scaled to that day
      if (day && missions() && Math.random() < 0.12 + hist[day - 1].peakOnline / 1200) {
        const c = snap.countries[Math.floor(Math.random() * snap.countries.length)], p = c && pts.get(c.code), r = regionNow();
        if (p) shots.push({ a: p, b: P(r.lon, r.lat), t: now(), red: Math.random() < 0.5 });
      }
    }
    function startPlay() {
      if (reduce.matches) return;
      playing = 1; playDays = hist.length; playFrom = performance.now();
      prevReached = Activity.reached(1);
      feedEl.innerHTML = '';
      playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true');
      setDay(1, true); sync();
    }
    function stopPlay() { playing = 0; playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false'); callouts(); }
    on(playBtn, 'click', () => { if (playing) stopPlay(); else startPlay(); });
    on(range, 'input', () => { if (playing) stopPlay(); prevReached = null; setDay(+range.value); });
    on(nowBtn, 'click', () => { if (playing) stopPlay(); setDay(hist.length); });
    on(cmpBtn, 'click', () => {
      const open = cmpBtn.getAttribute('aria-pressed') !== 'true';
      cmpBtn.setAttribute('aria-pressed', open); cmpEl.hidden = !open; paintCompare();
    });
    function paintCompare() {
      if (cmpEl.hidden || !hist.length) return;
      const a = hist[0], bN = day || hist.length, b = hist[bN - 1];
      const defeats = n => hist.slice(0, n).reduce((x, d) => x + d.defeats, 0);
      const rows = [['Players', a.players, b.players], ['Countries', a.countries, b.countries], ['Words typed', a.wordsTotal, b.wordsTotal], ['Bosses beaten', defeats(1), defeats(bN)]];
      const x = (p, q) => !p ? (q ? 'new' : '-') : q / p >= 10 ? `x${UI.fmt(q / p)}` : `x${(q / p).toFixed(1)}`;
      // players over time, with the two days marked
      const w = 220, h = 36, maxP = hist[hist.length - 1].players;
      const pt = d => [(d.day - 1) / Math.max(1, hist.length - 1) * w, h - 2 - d.players / maxP * (h - 4)];
      const line = hist.filter((d, i) => i % 3 === 0 || i === hist.length - 1).map((d, i) => (i ? 'L' : 'M') + pt(d).map(v => v.toFixed(1)).join(' ')).join('');
      const [bx, by] = pt(b);
      cmpEl.innerHTML = `<table><thead><tr><th></th><th>Day 1</th><th>${day ? `Day ${bN}` : 'Today'}</th><th>Change</th></tr></thead><tbody>
        ${rows.map(([n, p, q]) => `<tr><th>${n}</th><td>${short(p)}</td><td>${short(q)}</td><td>${x(p, q)}</td></tr>`).join('')}</tbody></table>
        <svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Players from day 1 to ${day ? `day ${bN}` : 'today'}"><path d="${line}"/><circle cx="${pt(a)[0]}" cy="${pt(a)[1]}" r="2.5"/><circle cx="${bx}" cy="${by}" r="2.5"/></svg>
        <span class="hm-demo">Demo data</span>`;
    }

    // ---------- running and pausing ----------
    let hudT = 0, callTimer = 0;
    function sync() {
      const go = !stopped && onScreen && !document.hidden && data;
      const anim = go && (!reduce.matches || playing);
      if (anim) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
      else { cancelAnimationFrame(raf); raf = 0; }
      if (go) {
        Activity.resume();
        if (stream) stream.resume();
        if (!hudT) hudT = setInterval(paintHud, 250);
        if (!callTimer && !reduce.matches) callTimer = setInterval(rotate, 5000);
        paintHud();
      } else {
        Activity.pause();
        if (stream) stream.pause();
        clearInterval(hudT); hudT = 0; clearInterval(callTimer); callTimer = 0;
      }
      if (go && reduce.matches) paintStill();
    }
    const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; sync(); });
    io.observe(stage);
    on(document, 'visibilitychange', sync);
    on(reduce, 'change', () => { if (data) { playBtn.hidden = reduce.matches; paintLit(); } sync(); });
    const ro = new ResizeObserver(() => {
      const w = stage.clientWidth;
      if (!data || !w || w === lastSW) return;
      if (layout()) { shapes(); paintLand(); build(); placeMissions(); center(); callouts(); paintStill(); hideCard(); }
    });
    ro.observe(stage);
    function center() {
      const h = pts.get(hub);
      if (h && W > stage.clientWidth) stage.scrollLeft = Math.max(0, h[0] - stage.clientWidth / 2);
      edges();
    }
    function edges() {
      const more = W > stage.clientWidth + 1;
      stage.classList.toggle('more-l', more && stage.scrollLeft > 2);
      stage.classList.toggle('more-r', more && stage.scrollLeft + stage.clientWidth < W - 2);
      if (!more) { drag.hidden = true; return; }
      let seen = true;
      try { seen = !!localStorage.getItem(DRAG_SEEN); if (!seen) localStorage.setItem(DRAG_SEEN, '1'); } catch (err) {}
      if (!seen) { drag.hidden = false; drag.style.top = (stage.offsetTop + H - drag.offsetHeight - 10) + 'px'; }
    }
    let scrollT = 0;
    on(stage, 'scroll', () => {
      stage.classList.toggle('more-l', stage.scrollLeft > 2);
      stage.classList.toggle('more-r', stage.scrollLeft + stage.clientWidth < W - 2);
      place();
      clearTimeout(scrollT); scrollT = setTimeout(callouts, 250);
    }, { passive: true });
    for (const t of ['pointerdown', 'wheel']) on(stage, t, () => { drag.hidden = true; }, { passive: true });

    // ---------- the layer filter ----------
    function setView(v) {
      view = v;
      try { localStorage.setItem(VIEW_KEY, v); } catch (err) {}
      root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
      root.dataset.view = v;
      if (!data) return;
      hideCard(); paintLit(); placeDots(); placeMissions(); callouts(); paintStill();
    }
    root.querySelectorAll('[data-view]').forEach(b => on(b, 'click', () => setView(b.dataset.view)));

    // ---------- start ----------
    buildMissions();
    setView(view);
    playBtn.hidden = reduce.matches;
    Community.load().then(r => {
      if (stopped) return;
      data = window.WORLD_110M; liveSnap = snap = r.snap; hub = r.hub; meCode = r.me ? r.me.code : null;
      root.querySelectorAll('.hm-demo').forEach(x => { x.hidden = !snap.demo; });
      Activity.attach(snap);
      hist = Activity.history();
      range.max = Math.max(1, hist.length); range.value = range.max;
      range.setAttribute('aria-valuetext', 'Today');
      root.classList.add('ready');
      if (!layout()) return;
      shapes(); paintLand(); build(); placeMissions(); center();
      // a few lines so the feed is never empty on arrival
      Community.history().slice(0, 3).reverse().forEach(ev => {
        if (ev.type === 'join') feed(`New player from ${e(Community.name(ev.country))}`);
        else if (ev.type === 'best') feed(`Someone in ${e(Community.inName(ev.country))} typed ${ev.wpm} wpm on the ${MODE_NAME[ev.mode] || 'typing test'}`);
        else if (ev.type === 'breach') feed(`Someone in ${e(Community.inName(ev.country))} cleared Breach chapter ${ev.chapter}`);
        else if (ev.type === 'boss') feed(`Someone in ${e(Community.inName(ev.country))} landed a hit on Syntax Error`);
      });
      liveAt = 0;
      stream = Community.stream(communityEvent);
      wireActivity();
      sync();
      callouts();
      paintStill();
      document.fonts && document.fonts.ready.then(() => { if (!stopped) { paintLit(); callouts(); paintStill(); } });
    }).catch(err => {
      console.warn(err);
      root.querySelectorAll('[data-map-count]').forEach(el => { el.textContent = 'The map could not be loaded.'; });
    });

    function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); }

    return () => {
      stopped = true;
      cancelAnimationFrame(raf); raf = 0;
      if (stream) stream.stop();
      Activity.pause();
      clearInterval(hudT); clearInterval(callTimer); clearTimeout(bannerT);
      io.disconnect(); ro.disconnect();
      off.forEach(f => f()); unsub.forEach(f => f());
    };
  }

  return { mount };
})();
