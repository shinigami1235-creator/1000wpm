// The world map at the top of #/home: countries with players light up, arcs run from
// each one to the player's own country, and new sign-ups ring in. Data comes from
// window.Community (js/app/community.js), which says whether it is demo or live.
//
// It is a flat 2D map drawn on one canvas in the Equal Earth projection: the whole world
// shows at once on a phone, it needs no WebGL, and the outline is a 69 KB script
// (26 KB gzipped) loaded when the map first mounts.
//
// WorldMap.mount(section) -> stop()
//   section holds [data-map-stage], [data-map], [data-map-count], [data-tick] and
//   .hm-demo labels; see the markup in js/app/home.js.
window.WorldMap = (() => {
  const G = '57,255,136', INK = '#d7f5e3', BG = '#040806';
  const LAT_TOP = 84, LAT_BOT = -56;
  const FPS_MS = 33;   // about 30 frames a second is plenty for slow arcs

  // ---------- Equal Earth projection (Šavrič, Patterson and Jenny, 2018) ----------
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  function ee(lon, lat) {
    const l = lon * Math.PI / 180, th = Math.asin(M * Math.sin(lat * Math.PI / 180));
    const t2 = th * th, t6 = t2 * t2 * t2;
    return [l * Math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
  }
  const XMAX = ee(180, 0)[0], YTOP = ee(0, LAT_TOP)[1], YBOT = ee(0, LAT_BOT)[1];
  const ASPECT = (YTOP - YBOT) / (2 * XMAX);

  // every ring projected once, in projection units
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

  function line(ev) {
    const where = Community.inName(ev.country);
    if (ev.type === 'join') return `A new player joined from ${where}`;
    if (ev.type === 'boss') return `Someone in ${where} just beat Syntax Error`;
    if (ev.type === 'best') return `Someone in ${where} typed ${ev.wpm} wpm on the ${MODE_NAME[ev.mode] || 'typing test'}`;
    if (ev.type === 'breach') return `Someone in ${where} cleared Breach chapter ${ev.chapter}`;
    return '';
  }

  function mount(root) {
    const e = UI.esc;
    const stage = root.querySelector('[data-map-stage]');
    const box = root.querySelector('[data-map]');
    const cv = box.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const dotsEl = box.querySelector('.hm-dots');
    const card = box.querySelector('.hm-card');
    const countEl = root.querySelector('[data-map-count]');
    const tick = root.querySelector('[data-tick]');
    const hit = document.createElement('canvas').getContext('2d');

    let W = 0, H = 0, dpr = 1, s = 1;
    let data = null, snap = null, hub = null;
    let base = null;            // the outline and lit countries, drawn once per size or data change
    let outline = null, paths = new Map(), pts = new Map(), arcs = [], links = [];
    let flashes = [];           // sign-up rings and one-off bright arcs
    let hover = null, pinned = null;
    let raf = 0, last = 0, t0 = performance.now();
    let onScreen = true, stream = null, stopped = false;
    const off = [];

    const X = x => (x + XMAX) * s, Y = y => (YTOP - y) * s;
    const lit = () => snap.countries.filter(c => c.players > 0 || c.you);

    // ---------- geometry ----------
    function layout() {
      const sw = stage.clientWidth;
      if (!sw) return false;
      lastSW = sw;
      // on a phone the map is wider than the screen and scrolls sideways
      W = sw < 640 ? Math.max(sw, 600) : sw;
      H = Math.round(W * ASPECT);
      s = W / (2 * XMAX);
      dpr = Math.min(2, devicePixelRatio || 1);
      box.style.width = W + 'px'; box.style.height = H + 'px';
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      return true;
    }

    function build() {
      const P = project(data);
      outline = new Path2D(); paths = new Map(); pts = new Map();
      for (const [code, p] of P) {
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
      const L = lit();
      const h = pts.get(hub);
      arcs = h ? L.filter(c => c.code !== hub && pts.has(c.code)).map((c, i) => arc(c.code, pts.get(c.code), h, i)) : [];
      // a faint link from each lit country to its nearest lit neighbour
      links = []; const seen = new Set();
      for (const a of L) {
        if (!pts.has(a.code)) continue;
        let best = null, bd = Infinity;
        for (const b of L) {
          if (b === a || b.code === hub || a.code === hub || !pts.has(b.code)) continue;
          const pa = pts.get(a.code), pb = pts.get(b.code), d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) continue;
        const k = [a.code, best.code].sort().join();
        if (!seen.has(k)) { seen.add(k); links.push(arc(a.code, pts.get(a.code), pts.get(best.code), links.length, 0.16)); }
      }
      paintBase();
      placeDots();
      paintCount();
    }

    // a curve from a to b lifted towards the top of the map
    function arc(code, a, b, i, lift = 0.24) {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const c = [mx, my - Math.max(8, Math.min(d * lift, H * 0.32))];
      const r = Math.sin(i * 91.7 + 3.1) * 0.5 + 0.5;
      return { code, a, b, c, period: 3600 + r * 2600, phase: (i * 0.618) % 1 };
    }
    const at = (A, t) => {
      const u = 1 - t;
      return [u * u * A.a[0] + 2 * u * t * A.c[0] + t * t * A.b[0], u * u * A.a[1] + 2 * u * t * A.c[1] + t * t * A.b[1]];
    };

    function paintBase() {
      base ||= document.createElement('canvas');
      base.width = cv.width; base.height = cv.height;
      const c = base.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.lineJoin = 'round';
      c.fillStyle = `rgba(${G},.035)`; c.fill(outline);
      c.strokeStyle = `rgba(${G},.26)`; c.lineWidth = 0.7; c.stroke(outline);
      for (const ct of lit()) {
        const p = paths.get(ct.code);
        if (!p) continue;
        c.fillStyle = `rgba(${G},${ct.you ? .3 : .16})`; c.fill(p);
        c.strokeStyle = `rgba(${G},${ct.you ? .95 : .6})`; c.lineWidth = ct.you ? 1.2 : 0.9; c.stroke(p);
      }
      c.lineCap = 'round';
      for (const L of links) { c.strokeStyle = `rgba(${G},.12)`; c.lineWidth = 1; curve(c, L); }
      for (const A of arcs) { c.strokeStyle = `rgba(${G},${reduce.matches ? .24 : .14})`; c.lineWidth = 1; curve(c, A); }
    }
    function curve(c, A) { c.beginPath(); c.moveTo(A.a[0], A.a[1]); c.quadraticCurveTo(A.c[0], A.c[1], A.b[0], A.b[1]); c.stroke(); }

    // ---------- dots: one button per lit country, for focus, tap and screen readers ----------
    function label(ct) {
      const n = Community.name(ct.code);
      const top = ct.top ? `, top typist ${ct.top.name} at ${ct.top.wpm} wpm` : '';
      return `${n}${ct.you ? ' (you)' : ''}: ${UI.fmt(ct.players)} ${ct.players === 1 ? 'player' : 'players'}${top}`;
    }
    function placeDots() {
      dotsEl.innerHTML = '';
      for (const ct of lit()) {
        const p = pts.get(ct.code);
        if (!p) continue;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'hm-dot' + (ct.you ? ' you' : '');
        b.dataset.code = ct.code;
        b.style.left = p[0] + 'px'; b.style.top = p[1] + 'px';
        b.setAttribute('aria-label', label(ct));
        if (ct.you) b.innerHTML = '<span>You</span>';
        dotsEl.append(b);
      }
    }
    function paintCount() {
      const L = lit();
      const players = L.reduce((n, c) => n + c.players, 0);
      countEl.innerHTML = snap.failed ? 'Player counts could not be loaded.'
        : `<b>${UI.fmt(players)}</b> ${players === 1 ? 'player' : 'players'} in <b>${L.length}</b> ${L.length === 1 ? 'country' : 'countries'}`;
    }

    // ---------- the card ----------
    function show(code) {
      const ct = code && snap.countries.find(c => c.code === code);
      hover = ct ? code : null;
      if (!ct) { card.hidden = true; paintStill(); return; }
      card.innerHTML = `<b>${e(Community.name(code))}</b>
        <dl><dt>Players</dt><dd>${UI.fmt(ct.players)}</dd>
        <dt>Top typist</dt><dd>${ct.top ? e(ct.top.name) : 'None yet'}</dd>
        <dt>Best wpm</dt><dd>${ct.top ? ct.top.wpm : '-'}</dd></dl>
        ${ct.you ? '<p>Your country</p>' : ''}`;
      card.hidden = false;
      const p = pts.get(code);
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const left = stage.scrollLeft, right = left + stage.clientWidth;
      let x = Math.max(left + 8, Math.min(right - cw - 8, p[0] - cw / 2));
      let y = p[1] - ch - 16;
      if (y < 8) y = p[1] + 16;
      card.style.left = x + 'px'; card.style.top = Math.min(H - ch - 4, y) + 'px';
      paintStill();
    }
    function pick(x, y, touch) {
      let best = null, bd = touch ? 24 : 14;
      for (const ct of lit()) {
        const p = pts.get(ct.code);
        if (!p) continue;
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < bd) { bd = d; best = ct.code; }
      }
      if (best) return best;
      for (const ct of lit()) { const p = paths.get(ct.code); if (p && hit.isPointInPath(p, x, y)) return ct.code; }
      return null;
    }
    const local = ev => { const r = box.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    on(box, 'pointermove', ev => {
      if (ev.pointerType !== 'mouse' || pinned) return;
      const code = pick(...local(ev), false);
      if (code !== hover) show(code);
      box.style.cursor = code ? 'pointer' : '';
    });
    on(box, 'pointerleave', () => { if (!pinned && !box.contains(document.activeElement)) show(null); });
    on(box, 'click', ev => {
      const dot = ev.target.closest('.hm-dot');
      const code = dot ? dot.dataset.code : pick(...local(ev), ev.pointerType !== 'mouse');
      if (ev.pointerType === 'mouse' && !dot) { pinned = null; show(code); return; }
      pinned = code && code !== pinned ? code : null;
      show(pinned);
    });
    on(dotsEl, 'focusin', ev => { const d = ev.target.closest('.hm-dot'); if (d) show(d.dataset.code); });
    on(dotsEl, 'focusout', () => setTimeout(() => { if (!dotsEl.contains(document.activeElement) && !pinned) show(null); }, 0));
    on(document, 'keydown', ev => { if (ev.key === 'Escape' && !card.hidden) { pinned = null; show(null); } });
    on(document, 'pointerdown', ev => { if (pinned && !box.contains(ev.target)) { pinned = null; show(null); } });

    // ---------- drawing ----------
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - last < FPS_MS) return;
      last = now;
      draw(now - t0);
    }
    function draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (base) ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      if (hover && paths.get(hover)) { ctx.fillStyle = `rgba(${G},.14)`; ctx.fill(paths.get(hover)); }
      const moving = !reduce.matches;
      ctx.globalCompositeOperation = 'lighter';
      for (const A of arcs) {
        if (A.code === hover) { ctx.strokeStyle = `rgba(${G},.55)`; ctx.lineWidth = 1.2; curve(ctx, A); }
        if (!moving) continue;
        // each arc carries a short bright trail towards the hub, then rests
        const u = ((t / A.period + A.phase) % 2.2);
        if (u < 1.3) comet(A, u, 0.75);
      }
      // sign-ups: a ring at the country and one bright trail to the hub
      flashes = flashes.filter(f => t - f.t < 2600);
      for (const f of flashes) {
        const k = (t - f.t) / 1600;
        const p = pts.get(f.code);
        if (p && k < 1) {
          ctx.strokeStyle = `rgba(${G},${(1 - k) * .9})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p[0], p[1], 3 + k * 22, 0, Math.PI * 2); ctx.stroke();
        }
        if (f.arc) comet(f.arc, (t - f.t) / 1800, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    function comet(A, head, power) {
      const TAIL = 0.24, N = 14;
      for (let k = 0; k < N; k++) {
        const t1 = head - TAIL * k / N, t2 = head - TAIL * (k + 1) / N;
        if (t1 <= 0 || t2 >= 1) continue;
        const p1 = at(A, Math.min(1, t1)), p2 = at(A, Math.max(0, t2));
        const a = (1 - k / N) * power;
        ctx.strokeStyle = `rgba(${G},${a * .14})`; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
        ctx.strokeStyle = `rgba(${G},${a * .9})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }
      if (head > 0 && head < 1) {
        const p = at(A, head);
        ctx.fillStyle = INK; ctx.globalAlpha = power;
        ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // one still frame when nothing is moving: reduced motion, or a hover while paused
    function paintStill() { if (!raf) draw(performance.now() - t0); }

    // ---------- running and pausing ----------
    function sync() {
      const go = !stopped && onScreen && !document.hidden && data;
      if (go && !reduce.matches) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
      else { cancelAnimationFrame(raf); raf = 0; }
      if (stream) { if (go && !reduce.matches) stream.resume(); else stream.pause(); }
      if (go && reduce.matches) paintStill();
    }
    const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; sync(); });
    io.observe(stage);
    on(document, 'visibilitychange', sync);
    on(reduce, 'change', () => { if (data) { paintBase(); fillTicker(); } sync(); });
    let lastSW = 0;
    const ro = new ResizeObserver(() => {
      const w = stage.clientWidth;
      if (!data || !w || w === lastSW) return;
      if (layout()) { build(); center(); paintStill(); if (!card.hidden && hover) show(hover); }
    });
    ro.observe(stage);
    function center() {
      const h = pts.get(hub);
      if (h && W > stage.clientWidth) stage.scrollLeft = Math.max(0, h[0] - stage.clientWidth / 2);
    }

    // ---------- ticker ----------
    function setTick(text, animate) {
      const sp = document.createElement('span');
      sp.textContent = text;
      if (animate && !reduce.matches) sp.className = 'in';
      tick.replaceChildren(sp);
    }
    function fillTicker() {
      const h = Community.history();
      if (!h.length) { tick.replaceChildren(); return; }
      if (reduce.matches) {
        // nothing rotates: the three latest stay put
        tick.replaceChildren(...h.slice(0, 3).map(ev => { const sp = document.createElement('span'); sp.textContent = line(ev); return sp; }));
      } else setTick(line(h[0]), false);
    }

    function onEvent(ev, sn) {
      if (stopped) return;
      snap = sn;
      build();
      if (ev.type === 'join') {
        const A = arcs.find(x => x.code === ev.country);
        flashes.push({ code: ev.country, t: performance.now() - t0, arc: A || null });
      }
      if (hover && !card.hidden) show(hover);
      setTick(line(ev), true);
    }

    // ---------- start ----------
    Community.load().then(r => {
      if (stopped) return;
      data = window.WORLD_110M; snap = r.snap; hub = r.hub;
      root.querySelectorAll('.hm-demo').forEach(x => { x.hidden = !snap.demo; });
      root.classList.add('ready');
      if (!layout()) return;
      build(); center();
      fillTicker();
      stream = Community.stream(onEvent);
      sync();
      paintStill();
    }).catch(err => {
      console.warn(err);
      countEl.textContent = 'The map could not be loaded.';
    });

    function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); }

    return () => {
      stopped = true;
      cancelAnimationFrame(raf); raf = 0;
      if (stream) stream.stop();
      io.disconnect(); ro.disconnect();
      off.forEach(f => f());
    };
  }

  return { mount };
})();
