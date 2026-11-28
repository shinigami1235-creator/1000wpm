// The way into the site (Art and Gid, 28 Nov 2026): a CTRL network window that finds the visitor's
// node, assembles the CTRL logo and asks them to prove they belong by typing one line. The line is
// a clearance check: it's timed, anyone passes, and the readout is honest ("62 WPM // 98%"). Then the
// identity changes from UNKNOWN to their operator number and the window dives into the ops map, where
// their node pings and links up to other operators.
//
// It replaces the fall into Keyspace (js/app/intro.js, kept in the repo but no longer loaded).
//   first visit to #/home on a device   the full window, about 4.5 s, the check, then 2 s to the map
//   later visits, once a session        "node reconnected", the logo and straight to the map, 1.6 s
//   prefers-reduced-motion              everything shown at once; Enter or the check, then a fade
// Esc, a click outside the window or the Skip button skips it. A letter before the check shows only
// moves it on to the check. The footer's "Replay intro" plays the full one again.
//
// Real values only: the node comes from the browser's time zone (no network call, no location
// prompt), the operator count from Activity (js/app/activity.js) once it's running and marked
// "demo" while the site runs on demo data, and the line is left out when there's no count.
// The check's result is kept on this device as 'wpm-first-sample' and nothing else uses it yet.
//
// For screenshots: Intro.play({ mode: 'full', at: 3.2 }) freezes at 3.2 s, Intro.seek(t), and
// Intro.debugType(n) types the first n letters of the line.
(() => {
  const html = document.documentElement;
  const SEEN = 'wpm-entry', SESSION = 'wpm-entry-s', SAMPLE = 'wpm-first-sample';
  const PHRASES = [
    'the network holds as long as we keep typing',
    'every word we type takes one more typo down',
    'we keep typing so the network stays in control',
  ];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const soundOn = () => store.get('wpm-sound') !== 'off';
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- the visitor's node, from the time zone ----------
  // [country, lon, lat] for the zones most visitors will have; any other zone still gives its city
  const TZ = {
    'Asia/Bangkok': ['TH', 100.5, 13.75], 'Asia/Manila': ['PH', 121, 14.6], 'Asia/Jakarta': ['ID', 106.8, -6.2], 'Asia/Makassar': ['ID', 119.4, -5.1],
    'Asia/Ho_Chi_Minh': ['VN', 106.7, 10.8], 'Asia/Saigon': ['VN', 106.7, 10.8], 'Asia/Kuala_Lumpur': ['MY', 101.7, 3.1], 'Asia/Singapore': ['SG', 103.8, 1.35],
    'Asia/Tokyo': ['JP', 139.7, 35.7], 'Asia/Seoul': ['KR', 127, 37.6], 'Asia/Shanghai': ['CN', 121.5, 31.2], 'Asia/Hong_Kong': ['HK', 114.2, 22.3],
    'Asia/Taipei': ['TW', 121.5, 25], 'Asia/Kolkata': ['IN', 88.4, 22.6], 'Asia/Calcutta': ['IN', 88.4, 22.6], 'Asia/Karachi': ['PK', 67, 24.9],
    'Asia/Dhaka': ['BD', 90.4, 23.8], 'Asia/Dubai': ['AE', 55.3, 25.2], 'Asia/Riyadh': ['SA', 46.7, 24.7], 'Asia/Yangon': ['MM', 96.2, 16.8],
    'Asia/Phnom_Penh': ['KH', 104.9, 11.6], 'Asia/Vientiane': ['LA', 102.6, 18], 'Asia/Kathmandu': ['NP', 85.3, 27.7], 'Asia/Colombo': ['LK', 79.9, 6.9],
    'Asia/Almaty': ['KZ', 76.9, 43.2], 'Asia/Tehran': ['IR', 51.4, 35.7], 'Asia/Jerusalem': ['IL', 35.2, 31.8], 'Europe/Istanbul': ['TR', 29, 41],
    'Europe/London': ['GB', -0.1, 51.5], 'Europe/Dublin': ['IE', -6.3, 53.3], 'Europe/Paris': ['FR', 2.35, 48.86], 'Europe/Berlin': ['DE', 13.4, 52.5],
    'Europe/Madrid': ['ES', -3.7, 40.4], 'Europe/Rome': ['IT', 12.5, 41.9], 'Europe/Amsterdam': ['NL', 4.9, 52.4], 'Europe/Brussels': ['BE', 4.35, 50.85],
    'Europe/Stockholm': ['SE', 18.1, 59.3], 'Europe/Oslo': ['NO', 10.75, 59.9], 'Europe/Helsinki': ['FI', 24.9, 60.2], 'Europe/Copenhagen': ['DK', 12.6, 55.7],
    'Europe/Warsaw': ['PL', 21, 52.2], 'Europe/Prague': ['CZ', 14.4, 50.1], 'Europe/Vienna': ['AT', 16.4, 48.2], 'Europe/Zurich': ['CH', 8.5, 47.4],
    'Europe/Lisbon': ['PT', -9.1, 38.7], 'Europe/Athens': ['GR', 23.7, 38], 'Europe/Bucharest': ['RO', 26.1, 44.4], 'Europe/Kiev': ['UA', 30.5, 50.45],
    'Europe/Kyiv': ['UA', 30.5, 50.45], 'Europe/Moscow': ['RU', 37.6, 55.75], 'Africa/Cairo': ['EG', 31.2, 30], 'Africa/Lagos': ['NG', 3.4, 6.5],
    'Africa/Nairobi': ['KE', 36.8, -1.3], 'Africa/Johannesburg': ['ZA', 28, -26.2], 'Africa/Casablanca': ['MA', -7.6, 33.6], 'Africa/Accra': ['GH', -0.2, 5.6],
    'America/New_York': ['US', -74, 40.7], 'America/Chicago': ['US', -87.6, 41.9], 'America/Denver': ['US', -105, 39.7], 'America/Phoenix': ['US', -112, 33.4],
    'America/Los_Angeles': ['US', -118.2, 34], 'America/Anchorage': ['US', -149.9, 61.2], 'Pacific/Honolulu': ['US', -157.9, 21.3], 'America/Toronto': ['CA', -79.4, 43.7],
    'America/Vancouver': ['CA', -123.1, 49.3], 'America/Edmonton': ['CA', -113.5, 53.5], 'America/Halifax': ['CA', -63.6, 44.6], 'America/Mexico_City': ['MX', -99.1, 19.4],
    'America/Bogota': ['CO', -74.1, 4.7], 'America/Lima': ['PE', -77, -12], 'America/Santiago': ['CL', -70.7, -33.4], 'America/Argentina/Buenos_Aires': ['AR', -58.4, -34.6],
    'America/Buenos_Aires': ['AR', -58.4, -34.6], 'America/Sao_Paulo': ['BR', -46.6, -23.5], 'America/Caracas': ['VE', -66.9, 10.5], 'America/Guayaquil': ['EC', -79.9, -2.2],
    'Australia/Sydney': ['AU', 151.2, -33.9], 'Australia/Melbourne': ['AU', 145, -37.8], 'Australia/Brisbane': ['AU', 153, -27.5], 'Australia/Perth': ['AU', 115.9, -32],
    'Australia/Adelaide': ['AU', 138.6, -34.9], 'Pacific/Auckland': ['NZ', 174.8, -36.8], 'Asia/Ulaanbaatar': ['MN', 106.9, 47.9], 'UTC': [null, null, null],
  };
  function node() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    const t = TZ[tz] || [];
    const city = tz && tz !== 'UTC' ? tz.split('/').pop().replace(/_/g, ' ').toUpperCase() : '';
    return { city, cc: t[0] || null, lon: t[1] ?? null, lat: t[2] ?? null, label: city ? city + (t[0] ? ' // ' + t[0] : '') : 'UNLISTED' };
  }
  // other operators' nodes the visitor's node links up to on the map: big cities in the demo's countries
  const PEERS = [['MANILA', 121, 14.6], ['JAKARTA', 106.8, -6.2], ['TOKYO', 139.7, 35.7], ['SEOUL', 127, 37.6], ['SAO PAULO', -46.6, -23.5],
    ['LOS ANGELES', -118.2, 34], ['NEW YORK', -74, 40.7], ['LONDON', -0.1, 51.5], ['BERLIN', 13.4, 52.5], ['MUMBAI', 72.9, 19.1],
    ['BANGKOK', 100.5, 13.75], ['SYDNEY', 151.2, -33.9], ['MEXICO CITY', -99.1, 19.4], ['LAGOS', 3.4, 6.5]];

  // ---------- sound: silent until the visitor presses a key or taps (browsers need a gesture) ----------
  let ac = null, master = null, hum = null;
  function audio() {
    if (ac || !soundOn()) return ac;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.9;
      const lim = ac.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 8;
      master.connect(lim).connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }
  function humOn() {
    if (!audio() || hum) return;
    const t = ac.currentTime, g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.value = 55; o2.type = 'sine'; o2.frequency.value = 110.6;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(master); o1.start(t); o2.start(t);
    hum = { g, o: [o1, o2] };
  }
  function humOff(fast) {
    if (!hum) return;
    const t = ac.currentTime, h = hum; hum = null;
    h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, fast ? 0.05 : 0.25);
    h.o.forEach(o => o.stop(t + (fast ? 0.4 : 1.5)));
  }
  function noise(dur) {
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; return s;
  }
  function tick(wrong) {
    if (!audio()) return;
    const t = ac.currentTime, s = noise(0.03), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.frequency.value = wrong ? 900 : 3200 + Math.random() * 900; f.Q.value = 2.5;
    g.gain.setValueAtTime(wrong ? 0.22 : 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    s.connect(f).connect(g).connect(master); s.start(t);
  }
  function hit() {
    if (!audio()) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.65);
    const s = noise(0.5), f = ac.createBiquadFilter(), g2 = ac.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.45);
    g2.gain.setValueAtTime(0.2, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f).connect(g2).connect(master); s.start(t);
    for (const [fr, at] of [[1318.5, 0.02], [1975.5, 0.09]]) {
      const c = ac.createOscillator(), cg = ac.createGain();
      c.type = 'triangle'; c.frequency.value = fr;
      cg.gain.setValueAtTime(0, t + at); cg.gain.linearRampToValueAtTime(0.07, t + at + 0.01); cg.gain.exponentialRampToValueAtTime(0.001, t + at + 0.7);
      c.connect(cg).connect(master); c.start(t + at); c.stop(t + at + 0.75);
    }
  }
  addEventListener('wpm-sound', e => { if (!(e.detail && e.detail.on)) humOff(true); });

  // ---------- timelines (seconds) ----------
  const FULL = {
    lines: [[0.35, 'Establishing connection...'], [0.95, 'Locating CTRL network...'], [1.55, 'Connection established.'], [2.45, 'Identity: ', 'id'], [3.0, 'Awaiting authentication', 'wait']],
    status: 1.1, head: 1.6, logo: [2.0, 0.9], strong: 3.45, check: 4.0,
    after: { id: 0.15, result: 0.35, burst: 1.25, dive: 1.35, end: 2.05 },
  };
  const SHORT = {
    lines: [[0.08, 'Node reconnected: ', 'node'], [0.3, 'Identity: ', 'id'], [0.55, 'Access granted.']],
    status: 0, head: 0, logo: [0.0, 0.45], strong: null, check: null,
    after: { burst: 0.95, dive: 1.0, end: 1.6 },
  };
  const CPS = 58;   // terminal letters a second
  const SCR = 'abcdefghijklmnopqrstuvwxyz0123456789<>/{}=+_';
  // text as it types out at time t: what has landed, then two letters still scrambling
  function typed(text, t0, t, seed) {
    if (t < t0) return null;
    const n = Math.floor((t - t0) * CPS);
    if (n >= text.length) return text;
    let s = text.slice(0, n);
    for (let i = n; i < Math.min(text.length, n + 2); i++) s += text[i] === ' ' ? ' ' : SCR[Math.floor(hash(seed + i, Math.floor(t * 30)) * SCR.length)];
    return s;
  }
  // text decoding in place: every letter scrambles, then settles left to right over dur
  function decoded(text, t0, t, dur, seed) {
    if (t < t0) return null;
    const k = clamp((t - t0) / dur);
    if (k >= 1) return text;
    let s = '';
    for (let i = 0; i < text.length; i++) {
      const settle = i / text.length < k;
      s += settle || text[i] === ' ' ? text[i] : SCR[Math.floor(hash(seed + i, Math.floor(t * 24)) * SCR.length)].toUpperCase();
    }
    return s;
  }

  // ---------- running it ----------
  let run = null;
  function identity() {
    let name = '';
    try { const p = window.WPM && WPM.profile(); if (p && p.name && p.name !== 'Guest') name = p.name; } catch (e) {}
    let num = '';
    try { num = window.Ops && Ops.number ? Ops.number() : ''; } catch (e) {}
    let div = '';
    try { const d = window.Ops && Ops.division && Ops.division(); if (d) div = d.name || d.id || ''; } catch (e) {}
    return { name, num, div, label: (name ? name : 'OPERATOR ' + (num || '')).trim() };
  }
  function operators() {
    try {
      if (!window.Activity) return null;
      const n = Activity.now();
      if (!n || !n.online) return null;
      return (window.UI ? UI.fmt(n.online) : String(n.online)) + (n.demo ? ' (demo)' : '');
    } catch (e) { return null; }
  }

  function start(mode = 'full', { at = null } = {}) {
    if (run || !document.body) return;
    const calm = reduce();
    const T = mode === 'short' ? SHORT : FULL;
    const nd = node();
    const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
    const ov = document.createElement('div');
    ov.className = `entry ${mode}${calm ? ' calm' : ''}`;
    ov.innerHTML = `
      <canvas class="en-fx" aria-hidden="true"></canvas>
      <section class="en-win" role="dialog" aria-modal="true" aria-labelledby="en-title">
        <div class="en-bar"><span>CTRL NET</span><span>// Classified access</span></div>
        <div class="en-body">
          <div class="en-head">
            <p class="en-kick">// CTRL network //</p>
            <h1 class="en-title" id="en-title">Stormtyper</h1>
            <p class="en-sub">A global typing operation</p>
          </div>
          <div class="en-main">
            <ol class="en-lines"></ol>
            <div class="en-logo" aria-hidden="true"><i></i><canvas></canvas></div>
          </div>
          <p class="en-strong"></p>
          <div class="en-check" hidden>
            <div class="en-check-h"><span>Clearance check</span><span class="en-live" aria-hidden="true"></span></div>
            <p class="en-phrase" aria-label="Type this line: ${esc(phrase)}">${[...phrase].map(c => `<span>${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('')}</p>
            <div class="en-check-f"><span class="en-hint"><span class="en-k">Type the line to pass.</span> <button type="button" class="en-pass">Enter skips the check</button></span><a class="en-auth" href="#/profile">Authenticate</a></div>
          </div>
          <p class="en-result" hidden></p>
        </div>
        <div class="en-status">
          <span class="st-a"><i></i>Status <b>Online</b></span>
          <span class="st-o" hidden>Operators <b></b></span>
          <span class="st-n">Node <b></b></span>
        </div>
      </section>
      <button class="en-skip" type="button">Skip</button>
      <input class="en-in" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Type the line">`;
    document.body.append(ov);
    html.classList.add('intro');
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'intro' }));
    const q = s => ov.querySelector(s);
    run = {
      ov, mode, T, calm, nd, phrase, id: null, t: calm ? 99 : 0, last: 0, raf: 0, frozen: at, phase: 'intro', tDone: 0, typedAt: [],
      idx: 0, errs: 0, t0: 0, tEnd: 0, result: null, ending: false, shell: document.querySelector('.shell'),
      lines: [], cache: new Map(), logo: null, fx: q('.en-fx'), w: innerWidth, h: innerHeight, ops: null,
    };
    // the lines, empty until their time comes
    const ol = q('.en-lines');
    for (const L of T.lines) { const li = document.createElement('li'); li.hidden = true; ol.append(li); run.lines.push(li); }
    sizeFx();
    q('.en-skip').addEventListener('click', e => { e.stopPropagation(); skip(); });
    ov.addEventListener('pointerdown', e => {
      audio();
      if (e.target.closest('.en-check, .en-auth, .en-pass')) return;
      if (e.target.closest('.en-win') && run.phase === 'check') return;
      if (!e.target.closest('.en-win')) skip();
    });
    q('.en-phrase').addEventListener('click', () => focusIn());
    q('.en-pass').addEventListener('click', e => { e.preventDefault(); pass(null); });
    q('.en-auth').addEventListener('click', () => { finish(true, false); });
    q('.en-in').addEventListener('input', e => { const v = e.target.value; e.target.value = ''; for (const ch of v) key(ch); });
    if (calm) { paint(99); html.classList.remove('intro-cover'); if (mode === 'short' && at == null) run.calmTimer = setTimeout(() => finish(false), 900); return; }
    run.raf = requestAnimationFrame(frame);
  }
  function focusIn() { const i = run && run.ov.querySelector('.en-in'); if (i) i.focus({ preventScroll: true }); }
  function sizeFx() {
    const dpr = Math.min(2, devicePixelRatio || 1), cv = run.fx;
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    run.dpr = dpr;
  }

  function frame(now) {
    if (!run) return;
    run.raf = requestAnimationFrame(frame);
    if (run.frozen != null) run.t = run.frozen;
    else if (run.last) {
      let t = run.t + Math.min(0.1, (now - run.last) / 1000);
      // the clock holds while the check waits for the visitor
      if (run.phase === 'check') t = Math.min(t, run.T.check + 0.4);
      run.t = t;
    }
    run.last = now;
    paint(run.t);
    if (run.t > 0.02) html.classList.remove('intro-cover');
    const A = run.T.after, base = run.mode === 'full' ? run.tDone : 0;
    if (run.mode === 'full' && run.phase === 'intro' && run.t >= run.T.check) { run.phase = 'check'; showCheck(); }
    if (run.phase === 'post' || run.mode === 'short') {
      if (!run.burst && run.t >= base + A.burst) { run.burst = run.t; if (run.frozen == null) hit(); }
      if (run.frozen == null && run.t >= base + A.end) finish(false, true);
    }
  }

  // everything on screen is a function of the time, so a frozen frame looks the same every time
  function paint(t) {
    const R = run, T = R.T, ov = R.ov, q = s => ov.querySelector(s);
    const set = (el, key, v) => { if (R.cache.get(key) !== v) { R.cache.set(key, v); el.textContent = v; } };
    const show = (el, on) => { if (el.hidden === on) el.hidden = !on; };
    ov.classList.toggle('on', t > 0.02);
    // terminal lines
    T.lines.forEach(([t0, text, kind], i) => {
      const li = R.lines[i], s = typed(text, t0, t, i * 50);
      show(li, s != null);
      if (s == null) return;
      const done = s === text;
      let tail = '';
      if (done && kind === 'id') {
        if (!R.id && window.Ops) R.id = identity();
        const lab = R.id ? R.id.label : 'OPERATOR';
        const post = R.phase === 'post' || R.mode === 'short';
        const k = post ? (R.mode === 'short' ? decoded(lab, t0 + 0.12, t, 0.25, 7) : decoded(lab, R.tDone + T.after.id, t, 0.35, 7)) : null;
        tail = `<b class="en-id${post && k ? ' ok' : ''}">${esc(post && k ? k : 'UNKNOWN')}</b>`;
      } else if (done && kind === 'node') tail = `<b class="en-id ok">${esc(R.nd.label)}</b>`;
      else if (done && kind === 'wait') tail = R.phase === 'post' ? ' <b class="en-ok">done</b>' : '<i class="en-cur"></i>';
      const v = `<span class="en-p">&gt;</span> ${esc(s)}${tail}`;
      if (R.cache.get('l' + i) !== v) { R.cache.set('l' + i, v); li.innerHTML = v; }
    });
    // status bar
    const sn = q('.st-n b'), so = q('.st-o');
    const ns = decoded(R.nd.label, T.status, t, 0.5, 31);
    set(sn, 'sn', ns == null ? '' : ns);
    if (t >= T.status + 0.25) { if (R.ops == null) R.ops = operators() || ''; }
    show(so, !!R.ops && t >= T.status + 0.25);
    if (R.ops) set(q('.st-o b'), 'so', decoded(R.ops, T.status + 0.25, t, 0.5, 41) || '');
    ov.classList.toggle('st-on', t >= T.status);
    // title block
    ov.classList.toggle('head-on', t >= T.head);
    set(q('.en-title'), 'ti', decoded('STORMTYPER', T.head + 0.1, t, 0.55, 13) || 'STORMTYPER');
    // the strong line
    if (T.strong != null) set(q('.en-strong'), 'sg', typed('Your next keystroke changes everything.', T.strong, t, 90) || '');
    // the logo
    drawLogo(t);
    drawFx(t);
  }

  // ---------- the CTRL logo, assembling from glitch shards ----------
  function drawLogo(t) {
    const R = run, box = R.ov.querySelector('.en-logo'), cv = box.querySelector('canvas');
    if (!window.CtrlBrand) return;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    const dpr = R.dpr;
    if (!R.logo || R.logo.w !== w || R.logo.h !== h) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      // the lockup drawn once, cut into bands later
      const lh = h * 0.82, sz = CtrlBrand.size('lockup', lh);
      const src = document.createElement('canvas'); src.width = Math.ceil(sz.w * dpr); src.height = Math.ceil(lh * dpr);
      CtrlBrand.draw(src.getContext('2d'), 'lockup', 0, 0, lh * dpr, '#ffffff');
      const N = 16, bands = [];
      let y = 0;
      for (let i = 0; i < N; i++) { const bh = (i === N - 1 ? src.height - y : Math.round(src.height / N * (0.6 + hash(i, 3) * 0.8))); bands.push({ y, h: Math.max(1, Math.min(bh, src.height - y)), dx: (hash(i, 1) - 0.5) * 2, d: hash(i, 2) }); y += bh; if (y >= src.height) break; }
      R.logo = { w, h, src, bands, x: (w - sz.w) / 2, y: (h - lh) / 2, cw: sz.w, ch: lh };
    }
    const L = R.logo, c = cv.getContext('2d'), [t0, dur] = R.T.logo;
    const k = R.calm ? 1 : clamp((t - t0) / dur);
    const key = R.calm ? 'calm' : k >= 1 ? 'done' + (R.burst ? Math.floor((t - R.burst) * 30) : '') : t.toFixed(3);
    if (L.key === key && !(k >= 1 && R.burst && t - R.burst < 0.6)) return;
    L.key = key;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    if (t < t0 && !R.calm) return;
    const sx = L.src.width, X = L.x * dpr, Y = L.y * dpr;
    for (const b of L.bands) {
      // each band flies in from the side at its own moment, with a cyan and a white ghost beside it
      const u = ease((k - b.d * 0.45) / 0.55);
      if (u <= 0) continue;
      const off = (1 - u) * b.dx * L.w * 0.6 * dpr, a = clamp(u * 1.6);
      const jit = u < 1 ? 0 : (hash(b.y, Math.floor(t * 12)) < 0.04 && !R.calm ? (hash(b.y, 9) - 0.5) * 10 * dpr : 0);
      if (u < 1) {
        c.globalAlpha = a * 0.5; c.globalCompositeOperation = 'lighter';
        c.filter = 'none';
        c.drawImage(L.src, 0, b.y, sx, b.h, X + off - 6 * dpr * (1 - u), Y + b.y, sx, b.h);
      }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = a;
      c.drawImage(L.src, 0, b.y, sx, b.h, X + off + jit, Y + b.y, sx, b.h);
      if (u < 1) {   // a cyan edge on the band while it moves
        c.globalAlpha = a * 0.8; c.fillStyle = '#3ee6ff';
        c.fillRect(X + off + (b.dx > 0 ? sx : 0) - 2 * dpr, Y + b.y, 3 * dpr, Math.max(1, b.h * 0.5));
      }
    }
    c.globalAlpha = 1;
    // the burst: the logo flashes and a ring leaves it
    if (R.burst && t >= R.burst) {
      const e = clamp((t - R.burst) / 0.5);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - e) * 0.9;
      c.drawImage(L.src, X, Y);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
  }

  // ---------- full-screen effects: a few glitch bars at the edges, the burst ring ----------
  function drawFx(t) {
    const R = run, cv = R.fx, c = cv.getContext('2d'), dpr = R.dpr, W = innerWidth, H = innerHeight;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    if (R.calm) return;
    // glitch bars: short slices near the left and right edges that jump now and then
    const frameN = Math.floor(t * 10);
    for (let i = 0; i < 7; i++) {
      if (hash(i, frameN) > 0.55) continue;
      const left = i % 2 === 0, y = H * (0.08 + hash(i, 4) * 0.84), bw = 30 + hash(i, frameN + 1) * 160, x = left ? hash(i, 6) * W * 0.12 : W - bw - hash(i, 6) * W * 0.12;
      c.fillStyle = i % 3 === 0 ? 'rgba(62,230,255,.55)' : 'rgba(255,255,255,.18)';
      c.fillRect(x, y, bw, 2);
      if (i % 3 === 0) { c.fillStyle = 'rgba(62,230,255,.25)'; c.fillRect(x + bw * 0.3, y + 4, bw * 0.4, 1); }
    }
    if (R.burst && t >= R.burst) {
      const box = R.ov.querySelector('.en-logo').getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2, e = clamp((t - R.burst) / 0.7);
      const r = 20 + ease(e) * Math.hypot(W, H) * 0.7;
      c.strokeStyle = `rgba(62,230,255,${0.7 * (1 - e)})`; c.lineWidth = 3 * (1 - e) + 1;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${0.5 * (1 - e)})`; c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, r * 0.82, 0, Math.PI * 2); c.stroke();
    }
  }

  // ---------- the clearance check ----------
  function showCheck() {
    const R = run, box = R.ov.querySelector('.en-check');
    box.hidden = false;
    R.ov.classList.add('checking');
    const coarse = matchMedia('(pointer: coarse)').matches;
    R.ov.querySelector('.en-k').textContent = coarse ? 'Tap the line to type it.' : 'Type the line to pass.';
    R.ov.querySelector('.en-pass').textContent = coarse ? 'Skip the check' : 'Enter skips the check';
    if (!coarse) focusIn();
    paintCheck();
  }
  function paintCheck() {
    const R = run, spans = R.ov.querySelectorAll('.en-phrase span');
    spans.forEach((s, i) => { s.className = i < R.idx ? 'ok' : i === R.idx ? 'at' : ''; });
    const live = R.ov.querySelector('.en-live');
    if (R.t0) {
      const min = (performance.now() - R.t0) / 60000;
      live.textContent = min > 0.02 ? `${Math.round(R.idx / 5 / min)} wpm` : '';
    } else live.textContent = '';
  }
  function key(ch) {
    const R = run;
    if (!R || R.phase !== 'check') return;
    audio(); humOn();
    const want = R.phrase[R.idx];
    if (ch === want || (want === ' ' && ch === ' ')) {
      if (!R.t0) R.t0 = performance.now();
      R.idx++; tick(false);
      if (R.idx >= R.phrase.length) return pass(performance.now());
    } else {
      R.errs++; tick(true);
      const sp = R.ov.querySelectorAll('.en-phrase span')[R.idx];
      if (sp) { sp.classList.remove('err'); void sp.offsetWidth; sp.classList.add('err'); }
    }
    paintCheck();
  }
  // the check is over: the honest readout, or "check skipped" when Enter passed it
  function pass(tEnd) {
    const R = run;
    if (!R || R.phase !== 'check') return;
    R.phase = 'post'; R.tDone = R.t;
    R.ov.classList.remove('checking'); R.ov.classList.add('passed');
    R.ov.querySelector('.en-in').blur();
    let txt = 'Clearance granted // check skipped';
    if (tEnd && R.t0) {
      const ms = tEnd - R.t0, n = R.phrase.length;
      const wpm = Math.round((n - 1) / 5 / (ms / 60000)), acc = Math.round(100 * n / (n + R.errs));
      txt = `Clearance granted // ${wpm} wpm // ${acc}%`;
      R.result = { wpm, acc };
      if (R.frozen == null) store.set(SAMPLE, JSON.stringify({ wpm, acc, ms: Math.round(ms), errors: R.errs, phrase: R.phrase, at: new Date().toISOString() }));
    }
    const res = R.ov.querySelector('.en-result');
    res.hidden = false; res.textContent = txt;
    R.ov.querySelectorAll('.en-phrase span').forEach(s => { s.className = 'ok'; });
    humOff();
    if (R.calm) { setTimeout(() => finish(false, true), 900); }
  }

  // ---------- leaving: the dive into the map ----------
  function finish(fast, dive) {
    const R = run;
    if (!R || R.ending) return;
    R.ending = true;
    clearTimeout(R.calmTimer);
    humOff(true);
    if (R.frozen == null) {
      store.set(SEEN, '1'); store.set('wpm-fell-in', '1');
      try { sessionStorage.setItem(SESSION, '1'); } catch (e) {}
    }
    const ov = R.ov;
    ov.classList.add(R.calm ? 'out-calm' : fast ? 'out-fast' : 'out-dive');
    // the page underneath settles from slightly too close as the window dives into it
    if (R.shell && !fast && !R.calm) {
      R.shell.style.transition = 'none'; R.shell.style.transform = 'scale(1.05)'; R.shell.style.transformOrigin = '50% 30vh';
      requestAnimationFrame(() => { R.shell.style.transition = 'transform .7s cubic-bezier(.2,.7,.2,1)'; R.shell.style.transform = ''; });
    }
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'arrive' }));
    setTimeout(() => {
      cancelAnimationFrame(R.raf);
      ov.remove();
      if (R.shell) { R.shell.style.transition = ''; R.shell.style.transform = ''; R.shell.style.transformOrigin = ''; }
      html.classList.remove('intro', 'intro-cover');
      if (run === R) run = null;
      if (dive !== false) ping(R.nd);
    }, R.calm ? 400 : fast ? 260 : 650);
  }
  function skip() { if (run && !run.ending) finish(true); }

  // ---------- the visitor's node on the ops map ----------
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  function ee(lon, lat) {
    const l = lon * Math.PI / 180, th = Math.asin(M * Math.sin(lat * Math.PI / 180));
    const t2 = th * th, t6 = t2 * t2 * t2;
    return [l * Math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
  }
  function ping(nd, tries = 0) {
    if (nd.lon == null || !/^(#\/?(home)?)?$/.test(location.hash)) return;
    const box = document.querySelector('.page-home .hero-map.ready .hm-map') || (tries > 30 ? null : undefined);
    if (box === undefined) { setTimeout(() => ping(nd, tries + 1), 150); return; }
    if (!box) return;
    const W = box.clientWidth, H = box.clientHeight;
    const XMAX = ee(180, 0)[0], YTOP = ee(0, 84)[1], s = W / (2 * XMAX);
    const P = (lon, lat) => { const p = ee(lon, lat); return [(p[0] + XMAX) * s, (YTOP - p[1]) * s]; };
    const [x, y] = P(nd.lon, nd.lat);
    const peers = PEERS.filter(p => p[0] !== nd.city).map(p => ({ n: p[0], p: P(p[1], p[2]) }))
      .sort((a, b) => Math.hypot(a.p[0] - x, a.p[1] - y) - Math.hypot(b.p[0] - x, b.p[1] - y));
    const pick = [peers[0], peers[1], peers[3], peers[6]].filter(Boolean);
    const path = (a, b) => { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22; return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`; };
    const el = document.createElement('div');
    el.className = 'en-ping' + (reduce() ? ' calm' : '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      ${pick.map((p, i) => `<path class="pl" style="--d:${0.35 + i * 0.18}s" pathLength="1" d="${path([x, y], p.p)}"/><circle class="pp" style="--d:${0.75 + i * 0.18}s" cx="${p.p[0].toFixed(1)}" cy="${p.p[1].toFixed(1)}" r="3"/>`).join('')}
      <circle class="pr" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10"/><circle class="pr two" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10"/>
      <circle class="pc" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/></svg>
      <span class="pt" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px">You // ${esc(nd.city || 'node')}</span>`;
    box.append(el);
    setTimeout(() => el.classList.add('gone'), 5200);
    setTimeout(() => el.remove(), 6200);
  }

  // ---------- keys ----------
  addEventListener('keydown', e => {
    const R = run;
    if (!R) return;
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    if (e.target && e.target.closest && e.target.closest('.en-auth, .en-skip, .en-pass') && (e.key === 'Enter' || e.key === ' ')) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
    if (e.key === 'Tab') return;
    e.preventDefault();
    audio();
    if (R.phase === 'check') {
      if (e.key === 'Enter') return pass(null);
      if (e.key.length === 1 && !e.repeat) key(e.key);
      return;
    }
    // before the check, a key moves things on to it; the calm version and the short one just go
    if (R.mode === 'short' || R.calm) { if (R.calm && R.phase === 'check') return; finish(R.mode !== 'short', R.mode === 'short'); return; }
    if (R.phase === 'intro' && R.frozen == null && e.key.length === 1 && R.t < R.T.check) R.t = R.T.check - 0.3;
  }, true);
  addEventListener('resize', () => { if (run) { sizeFx(); run.logo = null; } });

  // the replay link in the footer
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-replay-intro]');
    if (!a) return;
    e.preventDefault();
    if (run) return;
    if (!/^(#\/?(home)?)?$/.test(location.hash)) location.hash = '#/home';
    scrollTo(0, 0);
    start('full');
  });

  window.Intro = {
    play: (o = {}) => start(o.mode || 'full', o), skip,
    seek(t) { if (run) run.frozen = t; },
    // types the first n letters of the line, so a screenshot can show the check half done
    debugType(n, errs = 0) { if (!run) return; if (run.phase !== 'check') { run.phase = 'check'; showCheck(); } run.t0 = performance.now() - n * 190; run.idx = 0; run.errs = 0; for (let i = 0; i < n; i++) key(run.phrase[i]); run.errs = errs; paintCheck(); },
    debugPass() { if (run && run.phase === 'check') { run.t0 = performance.now() - run.phrase.length * 190; run.idx = run.phrase.length; pass(performance.now()); } },
    active: () => !!run,
    state: () => run && { t: run.t, phase: run.phase, mode: run.mode },
  };

  // the <head> script decided before the first paint (window.__entry) and covered the page
  function boot() {
    if (!document.body) { requestAnimationFrame(boot); return; }
    clearTimeout(window.__introFS);
    if (window.__entry && html.classList.contains('intro')) start(window.__entry);
  }
  boot();
})();
