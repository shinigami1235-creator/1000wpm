// Keyboards as shot effects (Gid, 28 Nov 2026: bots no longer ride keyboards; a keyboard you own
// only changes your shot, "so getting custom keyboards is another plus they can try").
// One list of every board: the shot style it fires (drawn in js/app/combat/fx3d.js, "keyboard
// signatures"), its colours, the switch it sounds like, and its shop icon. Looks and sound only;
// every board deals the same damage.
//
//   KbShots.ids()              every keyboard id: slab, the shape boards, then Art's boards
//   KbShots.valid(id)          is it a keyboard
//   KbShots.resolve(id)        { id, style, pal: [main, second, spark] | null, key, crystal }
//   KbShots.mine()             the keyboard you fire with: your saved one if you own it, else 'slab'
//   KbShots.use(id)            save it as yours (the shop's Use button)
//   KbShots.sig(id)            the one-line description, as in the shop
//   KbShots.keySound(id)       the typing profile for TT.useWeaponSound
//   KbShots.play(id, o)        the shot's sound on release: o { vol 0..1, pan -1..1, ctx() }
//   KbShots.icon(id)           the shop icon as an SVG data URL
//   KbShots.random(seed)       a board for a simulated player, the same one every time
window.KbShots = (() => {
  // shot styles: slab, compact, split, arc (25 Nov) and six more (28 Nov)
  //   type   Ink: inked type slugs that splat on the target
  //   comet  Rainbow: a rainbow comet with a long tail
  //   laser  Pin: a hair-thin laser that's there at once, the burst a beat later
  //   grid   Grid: a block of small squares that fly in formation
  //   ring   Click: shockwave rings, like the sound of a click
  //   mag    Magnet: the shot swings wide and curves onto the target
  const STYLES = ['slab', 'compact', 'split', 'arc', 'type', 'comet', 'laser', 'grid', 'ring', 'mag'];
  const SIG = {
    slab: 'Standard bolt. Every board deals the same damage.',
    compact: 'Needles: your shots fly as three thin bolts at once.',
    split: 'Twin: your shots leave from both halves and cross on the target.',
    arc: 'Storm: your shots fly as forked lightning.',
    type: 'Ink: your shots fly as inked type slugs and splat on the target.',
    comet: 'Rainbow: your shots fly as a rainbow comet with a long tail.',
    laser: 'Pin: your shots are a hair-thin laser that bursts a beat after it hits.',
    grid: 'Grid: your shots fly as a block of small squares in formation.',
    ring: 'Click: your shots fly as shockwave rings.',
    mag: 'Magnet: your shots swing wide and curve onto the target.',
  };
  // the switch each shape sounds like when you type and when it fires
  const KEY = { slab: 'thock', compact: 'clicky', split: 'creamy', arc: 'spark', type: 'clack', comet: 'creamy', laser: 'marble', grid: 'marble', ring: 'clicky', mag: 'thock' };

  // Art's boards (js/keyboards.js), each firing one of the styles in its own colours. pal is
  // [main, second, spark] taken from the board's look (case, alphas, accent, underglow).
  const BOARDS = {
    'aula-f99': { name: 'AULA F99 Pro', style: 'type', key: 'creamy', pal: ['#d5503f', '#ecebe5', '#f2c230'], layout: '96',
      look: { case: '#cfcfca', alpha: '#ecebe5', mod: '#8f939a', accent: '#d5503f', rgb: '#f2c230' } },
    'womier-sk61he': { name: 'Womier SK61 HE', style: 'mag', key: 'marble', pal: ['#9fb7d9', '#f2c230', '#e6ecf5'], layout: '60',
      look: { case: '#a9adb4', metal: true, alpha: '#26272b', mod: '#3a3c42', accent: '#f2c230', rgb: '#9fb7d9' } },
    'loga-yaksa': { name: 'LOGA Yaksa Pro 75 Clear', style: 'comet', key: 'thock', pal: ['#c9a24a', '#b9a6d6', '#ffe7a3'], layout: '75',
      look: { case: '#b9a6d6', clear: true, alpha: '#1f2023', mod: '#2f3a33', accent: '#c9a24a', rgb: '#c9a24a' } },
    'attackshark-x68he': { name: 'Attack Shark X68 HE', style: 'ring', key: 'clack', pal: ['#e07a3a', '#e7e6e1', '#ffb070'], layout: '65',
      look: { case: '#25262a', alpha: '#e7e6e1', mod: '#b9bbbf', accent: '#e07a3a', rgb: '#e07a3a' } },
    'corsair-vanguard96': { name: 'Corsair Vanguard 96', style: 'grid', key: 'creamy', pal: ['#e7e6e1', '#f2c230', '#ffffff'], layout: '96',
      look: { case: '#1d1e21', alpha: '#2b2c30', mod: '#232427', accent: '#f2c230', rgb: '#e7e6e1' } },
    'chilkey-sf60': { name: 'Chilkey SF60 Diamond', style: 'laser', key: 'marble', pal: ['#9fd3cf', '#dfe7ee', '#ffffff'], layout: '64', crystal: true,
      look: { case: '#c7c9cd', metal: true, alpha: '#dfe7ee', mod: '#cfd9e2', accent: '#9fd3cf', rgb: '#9fd3cf', crystal: true } },
  };
  const IDS = [...STYLES, ...Object.keys(BOARDS)];
  const ids = () => IDS.slice();
  const valid = id => IDS.includes(id);
  function resolve(id) {
    const b = BOARDS[id];
    if (b) return { id, style: b.style, pal: b.pal, key: b.key, crystal: !!b.crystal, board: b };
    return { id: valid(id) ? id : 'slab', style: valid(id) ? id : 'slab', pal: null, key: KEY[id] || 'thock', crystal: false };
  }
  const nameOf = id => (BOARDS[id] ? BOARDS[id].name : ({ slab: 'Slab', compact: 'Compact', split: 'Split', arc: 'Arc', type: 'Typewriter', comet: 'RGB', laser: 'Low-profile', grid: 'Ortholinear', ring: 'Clicky', mag: 'Hall-effect' })[id] || id);
  // the shop's line for a board (REWARDS.shop.gear), else the shape's own
  const gear = id => ((window.REWARDS && REWARDS.shop && REWARDS.shop.gear) || []).find(g => g.kb === id);
  const sig = id => { const g = gear(id); return (g && g.desc) || SIG[id] || ''; };
  const keySound = id => resolve(id).key;
  // a keyboard sold in the shop counts once it's bought
  function owned(id) {
    if (!valid(id)) return false;
    if (id === 'slab') return true;
    return !window.WPM || !WPM.owns || WPM.owns('kb-' + id);
  }
  function saved() { try { const p = TT.store.get('wpm-operator', null); return p && p.kb && p.kb.style; } catch (e) { return null; } }
  function mine() { const s = saved(); return s && owned(s) ? s : 'slab'; }
  function use(id) {
    if (!valid(id)) return;
    let p = null;
    try { p = TT.store.get('wpm-operator', null); } catch (e) {}
    p = p && typeof p === 'object' ? p : {};
    p.kb = { ...(p.kb || {}), style: id };
    if (!p.kb.color) p.kb.color = 'theme';
    TT.store.set('wpm-operator', p);
    if (window.TT && TT.useWeaponSound) TT.useWeaponSound(id);
    dispatchEvent(new CustomEvent('wpm-keyboard', { detail: { id } }));
  }
  // a simulated player's board: most fire the shape boards, a few one of Art's; Art fires his own
  function random(seed) {
    let h = 7; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const boards = Object.keys(BOARDS);
    if (seed === 'art') return boards[Math.floor(Date.now() / 864e5) % boards.length];   // a different one each day
    return h % 7 === 0 ? boards[(h >> 3) % boards.length] : STYLES[h % STYLES.length];
  }

  // ---------- sound ----------
  // Each board's shot starts with a key going down in its own switch, then the style's own sound.
  // Every context gets one compressor in front of its speakers, and each shot peaks around 0.25,
  // so a fast run of shots stacks without clipping.
  const SW = {
    thock: { lp: 1100, knock: 150, kg: 0.5, ng: 0.32, len: 0.05 },
    creamy: { lp: 1600, knock: 210, kg: 0.4, ng: 0.32, len: 0.045 },
    clack: { lp: 4200, knock: 320, kg: 0.26, ng: 0.46, len: 0.035 },
    marble: { lp: 2600, knock: 520, kg: 0.34, ng: 0.38, len: 0.03 },
    clicky: { lp: 5200, knock: 380, kg: 0.22, ng: 0.5, len: 0.03, ping: 3400 },
    spark: { lp: 3000, knock: 260, kg: 0.34, ng: 0.38, len: 0.035 },
  };
  let own = null;
  const buses = new WeakMap(), noiseBuf = new WeakMap(), last = {};
  function bus(c) {
    let b = buses.get(c);
    if (!b) {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
      const g = c.createGain(); g.gain.value = 0.85;
      comp.connect(g).connect(c.destination);
      b = comp; buses.set(c, b);
    }
    return b;
  }
  function noise(c) {
    let b = noiseBuf.get(c);
    if (!b) { b = c.createBuffer(1, Math.ceil(c.sampleRate * 0.6), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseBuf.set(c, b); }
    return b;
  }
  function kit(c, dest) {
    const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
    const tone = (t, type, f0, f1, len, vol, a = 0.003, d = dest) => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len); o.connect(g).connect(d); o.start(t); o.stop(t + a + len + 0.04); return o;
    };
    const hiss = (t, len, f0, q, vol, type = 'bandpass', a = 0.002, f1, d = dest) => {
      const n = c.createBufferSource(); n.buffer = noise(c); const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len); n.connect(f).connect(g).connect(d); n.start(t, Math.random() * 0.4); n.stop(t + a + len + 0.05);
    };
    // one key going down in a switch: a filtered click with a knock under it
    const key = (t, sw, k = 1, d = dest) => {
      const p = SW[sw] || SW.creamy, vary = 0.92 + Math.random() * 0.16;
      hiss(t, p.len, p.lp * vary, 0.7, p.ng * 0.5 * k, 'lowpass', 0.001, null, d);
      tone(t, 'sine', p.knock * vary, p.knock * 0.6, 0.05, p.kg * 0.5 * k, 0.001, d);
      if (p.ping) tone(t, 'square', p.ping * vary, p.ping * vary, 0.016, 0.03 * k, 0.001, d);
    };
    return { tone, hiss, key };
  }
  const FLOURISH = {
    slab(K, t, sw) { K.key(t, sw, 1.1); },
    compact(K, t, sw) { for (let i = 0; i < 3; i++) K.key(t + i * 0.032, sw, 0.9 - i * 0.15); K.tone(t + 0.02, 'sine', 2600, 1800, 0.06, 0.04); },
    split(K, t, sw, c, d) {
      for (const [i, s] of [[0, -0.7], [1, 0.7]]) { const p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) { p.pan.value = s; p.connect(d); } K.key(t + i * 0.04, sw, 1, p || d); }
      K.hiss(t, 0.14, 700, 1, 0.12, 'bandpass', 0.03, 3200);
    },
    arc(K, t, sw) { K.key(t, sw); K.tone(t + 0.01, 'sawtooth', 1900 + Math.random() * 600, 380, 0.05, 0.06); K.hiss(t + 0.01, 0.07, 3200, 3, 0.1, 'bandpass', 0.002, 1200); },
    // a type bar striking the platen, sometimes the carriage bell
    type(K, t, sw, c, d, big) {
      K.key(t, sw, 1.2); K.hiss(t + 0.012, 0.03, 1900, 2, 0.22, 'bandpass', 0.001, 900); K.tone(t + 0.012, 'triangle', 520, 300, 0.04, 0.08, 0.001);
      if (big || Math.random() < 0.18) { K.tone(t + 0.05, 'sine', 2093, 2090, 0.9, 0.05, 0.002); K.tone(t + 0.05, 'sine', 4186, 4180, 0.4, 0.015, 0.002); }
    },
    // a soft press, then a quick rising shimmer
    comet(K, t, sw) { K.key(t, sw); [1046.5, 1318.5, 1568, 2093].forEach((f, i) => K.tone(t + 0.02 + i * 0.03, 'sine', f, f, 0.16, 0.035, 0.004)); K.hiss(t + 0.02, 0.2, 5000, 1, 0.05, 'highpass', 0.02); },
    // a thin pew at once, the small burst a beat later (as the shot looks)
    laser(K, t, sw) { K.key(t, sw, 0.8); K.tone(t, 'sine', 3600, 900, 0.08, 0.06, 0.001); K.tone(t, 'square', 7200, 1800, 0.03, 0.012, 0.001); K.hiss(t + 0.11, 0.06, 2800, 1.2, 0.18, 'bandpass', 0.001, 900); K.tone(t + 0.11, 'sine', 240, 90, 0.08, 0.12, 0.001); },
    // a roll of four keys in a row, like a chord on an ortho grid
    grid(K, t, sw) { for (let i = 0; i < 4; i++) { K.key(t + i * 0.022, sw, 0.8); K.tone(t + i * 0.022, 'square', 1400 - i * 120, 1400 - i * 120, 0.018, 0.018, 0.001); } },
    // a sharp click, its ping, and the thump of the ring leaving
    ring(K, t, sw) { K.key(t, sw, 1.2); K.tone(t, 'square', 3400, 3300, 0.025, 0.04, 0.001); K.tone(t + 0.008, 'sine', 120, 55, 0.12, 0.2, 0.002); K.hiss(t + 0.01, 0.12, 900, 0.8, 0.1, 'bandpass', 0.004, 300); },
    // a deep press, then a short magnetic warble
    mag(K, t, sw, c, d) {
      K.key(t, sw);
      const o = K.tone(t + 0.01, 'sine', 180, 520, 0.16, 0.09, 0.02);
      try { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 28; lg.gain.value = 40; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + 0.25); } catch (e) {}
      K.tone(t + 0.02, 'triangle', 90, 120, 0.12, 0.06, 0.01);
    },
  };
  function soundOn() { try { return TT.soundOn ? TT.soundOn() : localStorage.getItem('wpm-sound') !== 'off'; } catch (e) { return true; } }
  function play(id, o = {}) {
    if (!soundOn()) return;
    const r = resolve(id), now = performance.now(), gap = o.gap == null ? 40 : o.gap;
    if (now - (last[id] || 0) < gap) return;
    last[id] = now;
    try {
      let c = o.ctx ? o.ctx() : null;
      if (!c) { own ||= new (window.AudioContext || window.webkitAudioContext)(); c = own; }
      if (c.state === 'suspended') c.resume().catch(() => {});
      const vol = c.createGain(); vol.gain.value = Math.max(0, Math.min(1, o.vol == null ? 1 : o.vol));
      let d = vol;
      if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); vol.connect(p).connect(bus(c)); }
      else vol.connect(bus(c));
      const t = c.currentTime + 0.005;
      (FLOURISH[r.style] || FLOURISH.slab)(kit(c, d), t, r.key, c, d, !!o.big);
      setTimeout(() => { try { vol.disconnect(); } catch (e) {} }, 1600);
    } catch (e) {}
  }

  // ---------- shop icons ----------
  // The shape boards are line drawings in the theme colour, like Compact, Split and Arc. Art's
  // boards are drawn in their real colours, with their layout, accent keys and underglow.
  const wrap = art => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#050a07"/>${art}</svg>`);
  const keys = (x, y, w, n, rows, gap = 4, stag = 0) => { let k = ''; for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) k += `<rect x="${x + i * (w + gap) + r * stag}" y="${y + r * (w + gap)}" width="${w}" height="${w}" rx="2"/>`; return k; };
  function shapeIcon(id, c) {
    switch (id) {
      case 'type': return `<path d="M52 86h96l20 52H32z" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/><rect x="46" y="62" width="108" height="16" rx="8" fill="none" stroke="${c}" stroke-width="4"/><path d="M40 70h-8M168 70h-8" stroke="${c}" stroke-width="4" stroke-linecap="round"/><g fill="${c}" opacity=".85">${[0, 1, 2].map(r => [0, 1, 2, 3, 4, 5, 6].map(i => `<circle cx="${62 + i * 13 - r * 3 + (r === 2 ? 6 : 0)}" cy="${98 + r * 13}" r="4.5"/>`).join('')).join('')}</g><path d="M100 78v10" stroke="${c}" stroke-width="3"/>`;
      case 'comet': {
        const st = ['#ff4d5e', '#ffb84f', '#f2e94e', '#39ff88', '#3ee6ff', '#6f7bff', '#d36bff'];
        return `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ff4d5e"/><stop offset=".33" stop-color="#f2e94e"/><stop offset=".66" stop-color="#3ee6ff"/><stop offset="1" stop-color="#d36bff"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="4"/></filter></defs><rect x="34" y="132" width="132" height="8" rx="4" fill="url(#g)" filter="url(#b)"/><rect x="32" y="74" width="136" height="60" rx="6" fill="none" stroke="${c}" stroke-width="4"/>${[0, 1, 2].map(r => [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<rect x="${42 + i * 13 + r * 3}" y="${84 + r * 14}" width="10" height="10" rx="2" fill="${st[(i + r) % st.length]}" opacity=".9"/>`).join('')).join('')}`;
      }
      case 'laser': return `<rect x="26" y="96" width="148" height="22" rx="4" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".85">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => `<rect x="${33 + i * 12.4}" y="91" width="10" height="4" rx="1"/>`).join('')}</g><path d="M26 136h148" stroke="${c}" stroke-width="2" opacity=".5"/><path d="M40 74h120" stroke="${c}" stroke-width="1.5"/><circle cx="160" cy="74" r="4" fill="${c}"/>`;
      case 'grid': return `<rect x="38" y="62" width="124" height="76" rx="6" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".85">${keys(47, 71, 11, 8, 4, 2.6)}</g>`;
      case 'ring': return `<rect x="40" y="104" width="120" height="44" rx="6" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".8">${keys(49, 113, 10, 8, 2, 4.6)}</g><rect x="88" y="78" width="24" height="20" rx="3" fill="${c}"/>${[22, 38, 54].map((r, i) => `<path d="M${100 - r} ${80 - i * 2}a${r} ${r * 0.62} 0 0 1 ${r * 2} 0" fill="none" stroke="${c}" stroke-width="${4 - i}" opacity="${1 - i * 0.25}"/>`).join('')}`;
      case 'mag': return `<rect x="34" y="112" width="132" height="44" rx="6" fill="none" stroke="${c}" stroke-width="4"/><g fill="${c}" opacity=".8">${keys(43, 121, 10, 9, 2, 4.4)}</g><path d="M76 52v22a24 24 0 0 0 48 0V52" fill="none" stroke="${c}" stroke-width="12"/><path d="M70 52h12M118 52h12" stroke="#050a07" stroke-width="3"/>${[18, 30].map((r, i) => `<path d="M${100 - 24 - r} 60c0 ${40 + r} ${48 + r * 2} ${40 + r} ${48 + r * 2} 0" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="5 5" opacity="${0.7 - i * 0.2}"/>`).join('')}`;
      default: return '';
    }
  }
  const COLS = { '60': 15, '64': 15, '65': 16, '75': 16, '96': 19 };
  function boardIcon(b) {
    const L = b.look, cols = COLS[b.layout] || 15, fRow = b.layout === '75' || b.layout === '96';
    const rows = fRow ? 6 : 5, W = 168, pad = 8, kw = (W - pad * 2) / cols, kh = kw;
    const H = rows * kh + pad * 2 + (fRow ? 3 : 0), x0 = 100 - W / 2, y0 = 100 - H / 2 + 6;
    const caseFill = L.metal ? 'url(#m)' : L.case;
    let k = '';
    for (let r = 0; r < rows; r++) {
      const y = y0 + pad + r * kh + (fRow && r > 0 ? 3 : 0);
      for (let i = 0; i < cols; i++) {
        const x = x0 + pad + i * kw;
        const mod = r === rows - 1 || i === 0 || i === cols - 1 || (fRow && r === 0) || (b.layout === '96' && i >= cols - 4);
        const acc = (r === 0 && i === 0) || (r === (fRow ? 3 : 2) && i === cols - (b.layout === '96' ? 5 : 1));
        if (r === rows - 1 && i > 3 && i < 9) { if (i === 4) k += `<rect x="${x + 0.8}" y="${y + 0.8}" width="${kw * 5 - 1.6}" height="${kh - 1.6}" rx="1.6" fill="${L.alpha}"${L.crystal ? ' fill-opacity=".55" stroke="#ffffff" stroke-opacity=".5" stroke-width=".6"' : ''}/>`; continue; }
        k += `<rect x="${x + 0.8}" y="${y + 0.8}" width="${kw - 1.6}" height="${kh - 1.6}" rx="1.6" fill="${acc ? L.accent : mod ? L.mod : L.alpha}"${L.crystal ? ' fill-opacity=".6" stroke="#ffffff" stroke-opacity=".55" stroke-width=".6"' : ''}/>`;
      }
    }
    return wrap(`<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".25" stop-color="${L.case}"/><stop offset="1" stop-color="${L.case}" stop-opacity=".75"/></linearGradient><filter id="b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="7"/></filter></defs>
      <rect x="${x0 + 6}" y="${y0 + H - 6}" width="${W - 12}" height="14" rx="7" fill="${L.rgb}" opacity=".75" filter="url(#b)"/>
      <rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="7" fill="${caseFill}"${L.clear ? ' fill-opacity=".55"' : ''} stroke="${L.clear ? L.case : '#000'}" stroke-opacity="${L.clear ? 1 : 0.35}" stroke-width="2"/>
      ${L.clear ? `<rect x="${x0 + 3}" y="${y0 + 3}" width="${W - 6}" height="${H - 6}" rx="5" fill="none" stroke="#ffffff" stroke-opacity=".35"/>` : ''}
      ${k}
      ${b.layout === '75' ? `<circle cx="${x0 + W - pad - kw / 2}" cy="${y0 + pad + kh / 2}" r="${kw * 0.42}" fill="${L.accent}"/>` : ''}`);
  }
  function icon(id) {
    if (BOARDS[id]) return boardIcon(BOARDS[id]);
    const art = shapeIcon(id, (window.Theme && Theme.hex('accent')) || '#39ff88');
    return art ? wrap(art) : null;
  }

  return { ids, valid, resolve, nameOf, sig, keySound, owned, mine, use, random, play, icon, STYLES, BOARDS };
})();
