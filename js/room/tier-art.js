// My Room, more (Gid, 28 Nov 2026): the art for the new slots, drawn in code. js/room/tier-view.js
// lays it into the picture. CTRL pieces use the official wing mark and wordmark (js/room/ctrl-art.js),
// in the techwear style of the CTRL hoodie: matte black, white mark, cyan accents.
//
//   RoomArt.POSTERS / SCREENS / BANNERS   more of each, merged into tier-view.js's own
//   RoomArt.neon(it, w, h)                a neon sign as SVG, sized to its spot
//   RoomArt.plate(it, d, w, h)            the nameplate: the owner's name and division
//   RoomArt.rug(it, w, h) / mat(it, w, h) flat prints, lit by the picture afterwards (litQuad)
//   RoomArt.grade(src, look)              the room's look (accent, walls, mood) worked into the picture's pixels
//   RoomArt.litQuad(q, W, H, paint, P, T, alb)  a flat print bent onto a floor or desk, lit like the picture there
window.RoomArt = (() => {
  const MONO = "'Share Tech Mono','JetBrains Mono',ui-monospace,monospace", HEAD = "'Chakra Petch','Rajdhani',sans-serif";
  const C = '#3ee6ff', INK = '#f2f6f7';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${extra}>${body}</svg>`;
  const A = () => window.CtrlArt;
  // the wing mark (or the stacked lockup) fitted into a box: x, y, w, h; anchor 0..1 across
  function mark(x, y, w, h, attrs, lockup = false, ax = 0.5) {
    const a = A(); if (!a) return '';
    const P = lockup ? a.LOCKUP : a.MARK, vb = P.vb, k = Math.min(w / vb[2], h / vb[3]);
    const tx = x + (w - vb[2] * k) * ax - vb[0] * k, ty = y + (h - vb[3] * k) / 2 - vb[1] * k;
    return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(5)})" ${attrs}><path fill-rule="evenodd" d="${P.d}"/></g>`;
  }
  // the wordmark alone, fitted the same way
  function word(x, y, w, h, attrs, ax = 0.5) {
    const a = A(); if (!a) return '';
    const vb = a.WORD.vb, k = Math.min(w / vb[2], h / vb[3]);
    const tx = x + (w - vb[2] * k) * ax - vb[0] * k, ty = y + (h - vb[3] * k) / 2 - vb[1] * k;
    return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(5)})" ${attrs}><path fill-rule="evenodd" d="${a.WORD.d}"/></g>`;
  }
  const brackets = (w, h, c, m = 14, l = 22, sw = 2) => `<g fill="none" stroke="${c}" stroke-width="${sw}"><path d="M${m} ${m + l}V${m}H${m + l}M${w - m - l} ${m}H${w - m}V${m + l}M${w - m} ${h - m - l}V${h - m}H${w - m - l}M${m + l} ${h - m}H${m}V${h - m - l}"/></g>`;
  const barcode = (x, y, h, c, n = 22) => { let s = '', X = x; for (let i = 0; i < n; i++) { const w = [1, 2, 1, 3, 1, 2][(i * 7) % 6]; s += `<rect x="${X}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`; X += w + 1 + (i % 3 === 0 ? 1 : 0); } return s; };
  const slash = (x, y, c, n = 4) => [...Array(n)].map((_, i) => `<path d="M${x + i * 7} ${y + 10}l6-10h3l-6 10z" fill="${c}"/>`).join('');

  // ------------------------------------------------------------------ posters 300 x 450
  const P = (bg, body) => svg(300, 450, `<rect width="300" height="450" fill="${bg}"/>${body}`, 'preserveAspectRatio="xMidYMid slice"');
  const matte = id => `<defs><radialGradient id="${id}" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#16191b"/><stop offset="1" stop-color="#060708"/></radialGradient></defs><rect width="300" height="450" fill="url(#${id})"/>`;
  const DIVS = [['STRIKER', 'SPEED'], ['PRECISION', 'ACCURACY'], ['HUNTER', 'BOSS DAMAGE'], ['SENTINEL', 'ENDURANCE'], ['GHOST', 'COMBOS'], ['ARCHITECT', 'SUPPORT']];
  const BOTS = ['orbit', 'pixel', 'nova', 'kite', 'beep', 'raze'];
  const POSTERS = {
    'poster-ctrl-wing': () => P('#07080a', `${matte('pw')}
      <g stroke="${C}" stroke-width="2" fill="none" opacity=".9"><path d="M22 300 60 262H110"/><path d="M278 128 246 160H200"/></g>
      ${mark(40, 70, 220, 250, `fill="${INK}"`)}
      <rect x="22" y="372" width="256" height="1" fill="#ffffff" opacity=".18"/>
      <text x="22" y="398" font-family="${MONO}" font-size="12" letter-spacing="4" fill="${INK}">CTRL // OPERATORS</text>
      <text x="22" y="418" font-family="${MONO}" font-size="10" letter-spacing="3" fill="#7d8a8f">KEYSPACE DIVISION 00</text>
      ${barcode(214, 404, 16, '#cfd6d9')}${slash(236, 30, C)}${brackets(300, 450, '#8a9599', 10, 18, 1.5)}`),
    'poster-ctrl-drop': () => P('#050607', `${matte('pd')}
      ${[...Array(7)].map((_, i) => `<rect x="${[30, 180, 60, 210, 20, 150, 240][i]}" y="${60 + i * 46}" width="${[70, 40, 26, 50, 18, 60, 30][i]}" height="3" fill="${C}" opacity="${i % 2 ? 0.9 : 0.45}"/>`).join('')}
      ${mark(55, 95, 190, 250, `fill="${INK}"`, true)}
      <text x="150" y="396" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="26" letter-spacing="6" fill="${INK}">SEASON 01</text>
      <text x="150" y="420" text-anchor="middle" font-family="${MONO}" font-size="11" letter-spacing="4" fill="${C}">// SYSTEM ONLINE</text>${brackets(300, 450, C, 12, 16, 2)}`),
    'poster-ctrl-div': () => P('#060708', `${matte('pv')}${mark(30, 60, 240, 300, 'fill="#ffffff" opacity=".06"')}
      <text x="24" y="44" font-family="${MONO}" font-size="12" letter-spacing="4" fill="${C}">CTRL // DIVISIONS</text>
      ${DIVS.map(([n, g], i) => `<g transform="translate(24 ${72 + i * 56})"><rect width="252" height="44" fill="#0c0e10" stroke="#ffffff" stroke-opacity=".12"/><rect width="3" height="44" fill="${C}"/><text x="14" y="21" font-family="${HEAD}" font-weight="700" font-size="18" fill="${INK}">${n}</text><text x="14" y="36" font-family="${MONO}" font-size="10" letter-spacing="2" fill="#7d8a8f">${g}</text><text x="238" y="28" text-anchor="end" font-family="${MONO}" font-size="12" fill="${C}">0${i + 1}</text></g>`).join('')}
      ${barcode(24, 418, 14, '#cfd6d9', 30)}`),
    'poster-bots': () => P('#060708', `${matte('pb')}
      <text x="150" y="40" text-anchor="middle" font-family="${MONO}" font-size="12" letter-spacing="5" fill="${C}">CTRL // BOTS</text>
      ${BOTS.map((b, i) => `<image href="assets/room/items/pet-${b}.webp" x="${18 + (i % 2) * 136}" y="${58 + Math.floor(i / 2) * 118}" width="128" height="104" preserveAspectRatio="xMidYMid meet"/><text x="${82 + (i % 2) * 136}" y="${172 + Math.floor(i / 2) * 118}" text-anchor="middle" font-family="${MONO}" font-size="10" letter-spacing="3" fill="#9aa6aa">${b.toUpperCase()}</text>`).join('')}
      ${mark(128, 410, 44, 30, `fill="${INK}"`)}`),
    'poster-switch': () => P('#0d1114', `<g stroke="#9fd0ff" stroke-opacity=".12">${[...Array(16)].map((_, i) => `<path d="M${i * 20} 0V450M0 ${i * 30}H300"/>`).join('')}</g>
      <g fill="none" stroke="#e8f0f4" stroke-width="1.6">
        <path d="M110 70h80l10 30H100z"/><path d="M100 100h100v8H100z"/><path d="M138 108h24v26h-24z"/><path d="M146 134v16M154 134v16"/>
        <path d="M120 175h60v6h-60zM126 181c0 14 48 14 48 0" /><path d="M150 195v4"/>
        <path d="M140 215c-10 0-10 8 0 8s10 8 0 8-10 8 0 8 10 8 0 8-10 8 0 8"/>
        <path d="M95 290h110l-8 40H103z"/><path d="M120 330v18M180 330v18M150 330v12"/></g>
      <g font-family="${MONO}" font-size="10" fill="#9fd0ff"><text x="212" y="88">KEYCAP</text><text x="212" y="140">STEM</text><text x="212" y="182">TOP HOUSING</text><text x="212" y="238">SPRING 45G</text><text x="212" y="314">BOTTOM HOUSING</text></g>
      <g stroke="#9fd0ff" stroke-opacity=".5"><path d="M200 85h10M166 136h44M182 178h28M160 234h50M205 310h5"/></g>
      <text x="24" y="40" font-family="${HEAD}" font-weight="700" font-size="24" fill="#e8f0f4">LINEAR SWITCH</text>
      <text x="24" y="410" font-family="${MONO}" font-size="11" letter-spacing="2" fill="#9fd0ff">TRAVEL 4.0 MM // ACTUATION 2.0 MM</text>`),
  };

  // ------------------------------------------------------------------ monitor programs 480 x 270, from d (the owner's numbers)
  const S = (bg, body, cls = '') => svg(480, 270, `<rect width="480" height="270" fill="${bg}"/>${body}`, `class="rv-scr ${cls}" font-family="${MONO}"`);
  const SCREENS = {
    'scr-ctrl': () => S('#040607', `<defs><linearGradient id="sc1" x2="1"><stop offset="0" stop-color="${C}" stop-opacity="0"/><stop offset=".5" stop-color="${C}" stop-opacity=".35"/><stop offset="1" stop-color="${C}" stop-opacity="0"/></linearGradient></defs>
      ${mark(150, 40, 180, 190, `fill="${INK}"`, true)}<rect class="rv-sweepx" x="-160" y="0" width="160" height="270" fill="url(#sc1)"/>${brackets(480, 270, '#5a6a70', 14, 20, 2)}`),
    'scr-clock': () => { const n = new Date(), hh = String(n.getHours()).padStart(2, '0'), mm = String(n.getMinutes()).padStart(2, '0');
      return S('#030506', `<text x="240" y="160" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="120" fill="${INK}">${hh}<tspan class="rv-caret" fill="${C}">:</tspan>${mm}</text><text x="240" y="210" text-anchor="middle" font-size="20" letter-spacing="6" fill="#7d8a8f">${n.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}</text>`); },
    'scr-type': d => S('#020a05', `<text x="26" y="40" font-size="17" letter-spacing="2" fill="#8fb3a0">TYPING TEST</text><text x="454" y="40" text-anchor="end" font-size="17" fill="#39ff88">${Math.max(60, d.best || 96)} WPM</text>
      <text x="26" y="110" font-size="30" fill="#eafff2">cache reboot <tspan fill="#5f7d6c">crypto kernel</tspan></text><text x="26" y="150" font-size="30" fill="#5f7d6c">packet firewall node</text>
      <rect class="rv-caret" x="222" y="86" width="3" height="30" fill="#39ff88"/><rect x="26" y="208" width="428" height="10" fill="#39ff88" fill-opacity=".18"/><rect class="rv-typebar" x="26" y="208" width="428" height="10" fill="#39ff88"/>`),
    'scr-viz': () => S('#08030a', `${[...Array(24)].map((_, i) => `<rect class="rv-eq" x="${24 + i * 18.5}" y="60" width="12" height="180" fill="${i < 8 ? '#ff3fb8' : i < 16 ? '#b45cff' : C}" style="animation-delay:-${((i * 0.37) % 1.2).toFixed(2)}s;animation-duration:${(0.7 + (i * 0.13) % 0.6).toFixed(2)}s"/>`).join('')}<text x="26" y="40" font-size="16" letter-spacing="2" fill="#d9a8ff">NOW PLAYING // BOSS RUSH</text>`),
    'scr-bot': d => { const b = d.bot || 'orbit'; return S('#040708', `<image href="assets/room/items/pet-${b}.webp" x="20" y="34" width="200" height="210" preserveAspectRatio="xMidYMid meet"/>
      <text x="240" y="64" font-size="15" letter-spacing="3" fill="${C}">BOT // ${b.toUpperCase()}</text><text x="240" y="108" font-family="${HEAD}" font-weight="700" font-size="34" fill="${INK}">${esc((d.div || 'No division').toUpperCase())}</text>
      ${[['Level', d.level], ['Best', (d.best || 0) + ' wpm'], ['Boss damage', d.dmgS]].map(([a, v], i) => `<text x="240" y="${150 + i * 30}" font-size="19" fill="#9aa6aa">${a}</text><text x="456" y="${150 + i * 30}" text-anchor="end" font-size="19" fill="${C}">${esc(v)}</text>`).join('')}`); },
  };

  // ------------------------------------------------------------------ banner prints (see tier-view.js BANNERS)
  const BANNERS = {
    'ban-ctrl-wing': { svg: () => svg(64, 64, mark(4, 2, 56, 60, `fill="${INK}"`, true)), c: '' },
    'ban-ctrl-tech': { full: true, tech: true, svg: () => svg(100, 100, `<g stroke="${C}" stroke-width="1.4" fill="none"><path d="M8 18H30L38 26"/><path d="M92 74H70L62 66"/><path d="M8 88h14"/></g>
      <g fill="${C}">${[0, 1, 2].map(i => `<path d="M${74 + i * 4} 10l3-5h2l-3 5z"/>`).join('')}</g>${mark(25, 26, 50, 46, `fill="${INK}"`, true)}`, 'preserveAspectRatio="none"') },
  };

  // ------------------------------------------------------------------ neon signs
  // tubes: a wide soft stroke in the colour, a narrower bright one, and a near-white core
  const tube = (body, c, w) => `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="${c}" stroke-width="${w * 1.5}">${body}</g><g stroke="#ffffff" stroke-width="${w * 0.55}" opacity=".85">${body}</g></g>`;
  function neon(it, w, h) {
    const c = it.c || C, vert = h > w * 1.2, a = A();
    const defs = `<defs><filter id="nb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(w, h) / 90}"/></filter></defs>`;
    // a clear acrylic back with four standoffs, so the sign hangs on something
    const back = `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" fill="none" stroke="#ffffff" stroke-opacity=".07"/>${[[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#9aa3a8" fill-opacity=".5"/>`).join('')}`;
    let body = '', sw = Math.max(w, h) / 120;
    const pathIn = (d, vb, x, y, W, H) => { const k = Math.min(W / vb[2], H / vb[3]), tx = x + (W - vb[2] * k) / 2 - vb[0] * k, ty = y + (H - vb[3] * k) / 2 - vb[1] * k; return `<path d="${d}" transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(5)})" vector-effect="non-scaling-stroke"/>`; };
    if (it.id === 'sign-ctrl' || it.id === 'sign-ctrl-white') {
      if (!a) return '';
      body = vert ? pathIn(a.LOCKUP.d, a.LOCKUP.vb, w * 0.08, h * 0.06, w * 0.84, h * 0.88)
        : pathIn(a.MARK.d, a.MARK.vb, w * 0.04, h * 0.08, h * 0.84 * 0.85, h * 0.84) + pathIn(a.WORD.d, a.WORD.vb, w * 0.04 + h * 0.8, h * 0.22, w * 0.92 - h * 0.8, h * 0.56);
      sw = Math.max(w, h) / 170;
    } else if (it.id === 'sign-wing') { if (!a) return ''; body = pathIn(a.MARK.d, a.MARK.vb, w * 0.1, h * 0.08, w * 0.8, h * 0.84); sw = Math.max(w, h) / 150; }
    else if (it.id === 'sign-bolt') body = pathIn('M60 0 10 70h34L30 130 90 50H54z', [10, 0, 80, 130], w * 0.2, h * 0.1, w * 0.6, h * 0.8);
    else if (it.id === 'sign-esc') {
      const key = 'M8 4h84a6 6 0 0 1 6 6v60a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6zM14 12h72v46H14z';
      body = vert ? pathIn(key, [0, 0, 100, 80], w * 0.08, h * 0.08, w * 0.84, h * 0.5) + `<text x="${w / 2}" y="${h * 0.86}" text-anchor="middle" font-family="${HEAD}" font-weight="600" font-size="${Math.min(w * 0.36, h * 0.22)}">ESC</text>`
        : pathIn(key, [0, 0, 100, 80], w * 0.12, h * 0.1, w * 0.36, h * 0.8) + `<text x="${w * 0.71}" y="${h * 0.66}" text-anchor="middle" font-family="${HEAD}" font-weight="600" font-size="${Math.min(h * 0.46, w * 0.16)}">ESC</text>`;
    }
    else {
      const txt = { 'sign-gg': 'GG', 'sign-wpm': '10000WPM', 'sign-type': vert ? 'TYPE\nFASTER' : 'TYPE FASTER' }[it.id] || 'CTRL';
      const lines = txt.split('\n'), fs = Math.min(h * 0.62 / lines.length, w * 1.5 / Math.max(...lines.map(l => l.length)));
      body = lines.map((l, i) => `<text x="${w / 2}" y="${h / 2 + (i - (lines.length - 1) / 2) * fs * 1.05 + fs * 0.36}" text-anchor="middle" font-family="${it.id === 'sign-type' ? HEAD : MONO}" font-weight="600" font-size="${fs.toFixed(1)}" stroke-width="${(fs / 40).toFixed(2)}">${l}</text>`).join('');
      return svg(w, h, defs + back + `<g fill="none" stroke-linejoin="round"><g stroke="${c}" style="stroke-width:${(fs / 22).toFixed(2)}px">${body}</g><g stroke="#fff" opacity=".85" style="stroke-width:${(fs / 60).toFixed(2)}px">${body}</g></g>`);
    }
    return svg(w, h, defs + back + tube(body, c, sw));
  }

  // ------------------------------------------------------------------ nameplate
  function plate(it, d, w, h) {
    const name = esc(String(d.name || 'Operator').toUpperCase().slice(0, 16)), div = esc(String(d.div || 'Recruit').toUpperCase());
    const st = {
      'plate-black': { bg: '#0d0f11', ink: INK, sub: C, edge: '#2a2f33' },
      'plate-steel': { bg: 'url(#pst)', ink: '#1b1f22', sub: '#3a4146', edge: '#c9d0d4', defs: '<linearGradient id="pst" x2="1" y2=".3"><stop offset="0" stop-color="#9aa3a8"/><stop offset=".5" stop-color="#dfe5e8"/><stop offset="1" stop-color="#8d969b"/></linearGradient>' },
      'plate-gold': { bg: 'url(#pgo)', ink: '#2a1d05', sub: '#5a4210', edge: '#ffe29a', defs: '<linearGradient id="pgo" x2="1" y2=".3"><stop offset="0" stop-color="#b8862a"/><stop offset=".5" stop-color="#f6d27a"/><stop offset="1" stop-color="#a8781f"/></linearGradient>' },
      'plate-neon': { bg: '#06090a', ink: '#e9fdff', sub: C, edge: C, glow: true },
    }[it.id] || {};
    const fs = h * 0.36;
    return svg(w, h, `<defs>${st.defs || ''}<filter id="pg"><feGaussianBlur stdDeviation="${h / 30}"/></filter></defs><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${h * 0.08}" fill="${st.bg}" stroke="${st.edge}" stroke-width="${h / 40}"/>
      ${mark(h * 0.14, h * 0.14, h * 0.72, h * 0.72, `fill="${st.ink}"`)}<rect x="${h * 0.98}" y="${h * 0.18}" width="${h / 30}" height="${h * 0.64}" fill="${st.sub}"/>
      ${st.glow ? `<text x="${h * 1.16}" y="${h * 0.5}" font-family="${HEAD}" font-weight="700" font-size="${fs}" fill="${C}" filter="url(#pg)" opacity=".9">${name}</text>` : ''}
      <text x="${h * 1.16}" y="${h * 0.5}" font-family="${HEAD}" font-weight="700" font-size="${fs}" fill="${st.ink}" textLength="${Math.min(w - h * 1.3, name.length * fs * 0.62)}" lengthAdjust="spacingAndGlyphs">${name}</text>
      <text x="${h * 1.16}" y="${h * 0.8}" font-family="${MONO}" font-size="${h * 0.2}" letter-spacing="${h * 0.03}" fill="${st.sub}">${div} // CTRL</text>`);
  }

  // ------------------------------------------------------------------ rugs and desk mats: flat prints W x H (seen from above)
  let rs = 1; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  function camo(w, h, cols, n, seed) { rs = seed; let s = ''; for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h, r = (0.04 + rnd() * 0.08) * Math.max(w, h), c = cols[i % cols.length]; s += `<path d="M${x} ${y}h${r}l${r * 0.4} ${r * 0.5}v${r * 0.6}h-${r * 1.2}l-${r * 0.3}-${r * 0.5}z" fill="${c}"/>`; } return s; }
  function topo(w, h, c) { rs = 7; let s = ''; for (let k = 0; k < 6; k++) { const cx = rnd() * w, cy = rnd() * h; for (let r = 1; r < 6; r++) s += `<ellipse cx="${cx}" cy="${cy}" rx="${r * w * 0.05 * (0.8 + rnd() * 0.4)}" ry="${r * h * 0.07 * (0.8 + rnd() * 0.4)}" fill="none" stroke="${c}" stroke-width="1.2" transform="rotate(${rnd() * 60 - 30} ${cx} ${cy})"/>`; } return s; }
  function grid(w, h, c, step) { let s = ''; for (let x = step; x < w; x += step) s += `<path d="M${x} 0V${h}" stroke="${c}"/>`; for (let y = step; y < h; y += step) s += `<path d="M0 ${y}H${w}" stroke="${c}"/>`; return s; }
  // a rug's pile: darker toward the edge, so it lies on the floor
  const pile = (w, h, round) => `<defs><radialGradient id="rp" cx=".5" cy=".5" r=".72"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>${round ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#rp)"/>` : `<rect width="${w}" height="${h}" fill="url(#rp)"/>`}`;
  function rug(it, w, h) { const s0 = rug0(it, w, h); return s0.replace('</svg>', pile(w, h, it.id === 'rug-round' || it.id === 'rug-keycap') + '</svg>'); }
  function rug0(it, w, h) {
    const id = it.id, b = Math.min(w, h);
    if (id === 'rug-ctrl') return svg(w, h, `<rect width="${w}" height="${h}" rx="${b * 0.03}" fill="#0b0c0e"/><rect x="${b * 0.05}" y="${b * 0.05}" width="${w - b * 0.1}" height="${h - b * 0.1}" fill="none" stroke="${C}" stroke-width="${b * 0.012}"/>${mark(w * 0.2, h * 0.14, w * 0.6, h * 0.72, `fill="${INK}"`, true)}`);
    if (id === 'rug-grid') return svg(w, h, `<rect width="${w}" height="${h}" fill="#15191c"/><g stroke-width="${b * 0.004}">${grid(w, h, '#3ee6ff55', b / 10)}</g><rect x="${b * 0.03}" y="${b * 0.03}" width="${w - b * 0.06}" height="${h - b * 0.06}" fill="none" stroke="#c9d2d6" stroke-width="${b * 0.008}"/>`);
    if (id === 'rug-keycap') return svg(w, h, `<rect x="0" y="0" width="${w}" height="${h}" rx="${b * 0.12}" fill="#1c1f22"/><rect x="${b * 0.07}" y="${b * 0.05}" width="${w - b * 0.14}" height="${h - b * 0.16}" rx="${b * 0.09}" fill="#e8e3d7"/><text x="${w * 0.17}" y="${h * 0.42}" font-family="${HEAD}" font-weight="600" font-size="${b * 0.24}" fill="#26292c">Esc</text>`);
    if (id === 'rug-shag') { rs = 3; return svg(w, h, `<rect width="${w}" height="${h}" rx="${b * 0.02}" fill="#d9d0bf"/>${[...Array(500)].map(() => `<circle cx="${rnd() * w}" cy="${rnd() * h}" r="${b * 0.012}" fill="${rnd() > 0.5 ? '#efe7d6' : '#bfb4a0'}" opacity=".7"/>`).join('')}`); }
    if (id === 'rug-round') return svg(w, h, `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 1}" ry="${h / 2 - 1}" fill="#6d8a6f"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.4}" ry="${h * 0.4}" fill="none" stroke="#a9bfa4" stroke-width="${b * 0.015}"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.28}" ry="${h * 0.28}" fill="none" stroke="#56705a" stroke-width="${b * 0.02}"/>`);
    if (id === 'rug-hazard') return svg(w, h, `<defs><pattern id="rh" width="${b * 0.16}" height="${b * 0.16}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${b * 0.08}" height="${b * 0.16}" fill="#e0b52c"/></pattern></defs><rect width="${w}" height="${h}" fill="#151618"/><rect x="${b * 0.04}" y="${b * 0.04}" width="${w - b * 0.08}" height="${h - b * 0.08}" fill="url(#rh)"/><rect x="${b * 0.16}" y="${b * 0.16}" width="${w - b * 0.32}" height="${h - b * 0.32}" fill="#1b1c1e"/>`);
    if (id === 'rug-camo') return svg(w, h, `<rect width="${w}" height="${h}" fill="#4a4f52"/>${camo(w, h, ['#2b2f31', '#6b7174', '#1c1f20', '#8a8f91'], 70, 11)}`);
    if (id === 'rug-kilim') { let s = ''; for (let i = 0; i < 6; i++) { const y = h * (0.12 + i * 0.15); s += `<path d="${[...Array(10)].map((_, j) => `M${w * (0.08 + j * 0.092)} ${y}l${w * 0.046} ${h * 0.05}l-${w * 0.046} ${h * 0.05}l-${w * 0.046}-${h * 0.05}z`).join('')}" fill="${i % 2 ? '#e3b45a' : '#1d2a3a'}"/>`; }
      return svg(w, h, `<rect width="${w}" height="${h}" fill="#8a2a22"/><rect x="${b * 0.04}" y="${b * 0.04}" width="${w - b * 0.08}" height="${h - b * 0.08}" fill="none" stroke="#e3b45a" stroke-width="${b * 0.02}"/>${s}`); }
    return svg(w, h, `<rect width="${w}" height="${h}" fill="#222"/>`);
  }
  function mat(it, w, h) {
    const id = it.id;
    const edge = `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${h * 0.03}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2"/>`;
    const base = c => `<rect width="${w}" height="${h}" rx="${h * 0.03}" fill="${c}"/>`;
    if (id === 'mat-plain') return svg(w, h, base('#131416') + edge);
    if (id === 'mat-ctrl') return svg(w, h, base('#0e0f11') + `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="${h * 0.03}" fill="none" stroke="${C}" stroke-width="3"/>${mark(w * 0.83, h * 0.1, w * 0.13, h * 0.35, `fill="${INK}"`)}${slash(w * 0.04, h * 0.84, C)}<text x="${w * 0.96}" y="${h * 0.88}" text-anchor="end" font-family="${MONO}" font-size="${h * 0.06}" letter-spacing="3" fill="#7d8a8f">CTRL // OPERATOR GEAR</text>`);
    if (id === 'mat-grid') return svg(w, h, base('#101315') + `<g stroke-width="1.2">${grid(w, h, '#3ee6ff40', h / 8)}</g>` + edge);
    if (id === 'mat-topo') return svg(w, h, base('#1a1d1a') + `<g opacity=".8">${topo(w, h, '#7fa892')}</g>` + edge);
    if (id === 'mat-camo') return svg(w, h, base('#3f4447') + camo(w, h, ['#24282a', '#5d6366', '#17191a'], 60, 5) + edge);
    if (id === 'mat-sunset') return svg(w, h, `<defs><linearGradient id="ms" x2="1"><stop offset="0" stop-color="#2a0b3a"/><stop offset=".55" stop-color="#c03a6a"/><stop offset="1" stop-color="#ffb35a"/></linearGradient></defs><rect width="${w}" height="${h}" rx="${h * 0.03}" fill="url(#ms)"/><circle cx="${w * 0.78}" cy="${h * 0.6}" r="${h * 0.3}" fill="#ffd27a" opacity=".55"/><path d="M0 ${h * 0.72}L${w * 0.2} ${h * 0.5}L${w * 0.38} ${h * 0.66}L${w * 0.55} ${h * 0.45}L${w * 0.8} ${h * 0.7}L${w} ${h * 0.55}V${h}H0z" fill="#1a0a24" opacity=".8"/>` + edge);
    if (id === 'mat-keys') { const L = 'ESC TAB CAPS SHIFT CTRL ALT SPACE ENTER BKSP FN DEL HOME END PGUP'.split(' '); rs = 9;
      return svg(w, h, base('#e7e2d6') + [...Array(40)].map((_, i) => `<text x="${(i % 10) * w / 10 + 8}" y="${Math.floor(i / 10) * h / 4 + h / 6}" font-family="${MONO}" font-size="${h * 0.08}" fill="${i % 7 ? '#3a3d40' : '#d44a3a'}">${L[Math.floor(rnd() * L.length)]}</text>`).join('') + edge); }
    if (id === 'mat-rgb') return svg(w, h, base('#0c0d0f') + edge);
    return svg(w, h, base('#131416'));
  }

  // ------------------------------------------------------------------ a flat print bent onto the picture, lit like the picture there
  // Maps each pixel of the print through the quad to the picture and multiplies it by the light there
  // (the surface's own colour, very blurred, divided by its albedo), so the print takes the room's
  // lamps, LEDs and shadows. alb: how light the surface under it is (concrete about .35).
  function H(q) {   // unit square to the quad
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1, g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
  }
  const loadSvg = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); });
  async function litQuad(q, W, H0, paint, P, T, alb = 0.35) {
    const c = document.createElement('canvas'); c.width = W; c.height = H0;
    const g = c.getContext('2d', { willReadFrequently: true });
    await paint(g, W, H0);
    if (!P) return c;
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
    const bx = Math.floor(Math.min(...xs)) - 4, by = Math.floor(Math.min(...ys)) - 4, bw = Math.ceil(Math.max(...xs)) - bx + 8, bh = Math.ceil(Math.max(...ys)) - by + 8;
    const PW = P.naturalWidth || P.width, f = PW / T.w;
    // the light there: the surface, blurred well past any texture or object on it
    const LW = 96, LH = Math.max(8, Math.round(96 * bh / bw)), l = document.createElement('canvas'); l.width = LW; l.height = LH;
    const lg = l.getContext('2d', { willReadFrequently: true }); lg.filter = 'blur(5px)';
    lg.drawImage(P, bx * f, by * f, bw * f, bh * f, -8, -8, LW + 16, LH + 16);
    const Ld = lg.getImageData(0, 0, LW, LH).data, img = g.getImageData(0, 0, W, H0), D = img.data, m = H(q);
    const k = 1 / (255 * alb);
    for (let y = 0; y < H0; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (!D[i + 3]) continue;
      const u = (x + 0.5) / W, v = (y + 0.5) / H0, w = m[6] * u + m[7] * v + 1;
      const px = (m[0] * u + m[1] * v + m[2]) / w, py = (m[3] * u + m[4] * v + m[5]) / w;
      const lx = Math.min(LW - 1, Math.max(0, ((px - bx) / bw) * LW | 0)), ly = Math.min(LH - 1, Math.max(0, ((py - by) / bh) * LH | 0)), j = (ly * LW + lx) * 4;
      D[i] = Math.min(255, D[i] * Ld[j] * k); D[i + 1] = Math.min(255, D[i + 1] * Ld[j + 1] * k); D[i + 2] = Math.min(255, D[i + 2] * Ld[j + 2] * k);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ------------------------------------------------------------------ the room's look, worked into the picture
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function hueOf(r, g, b, mx, mn) { const d = mx - mn; if (!d) return 0; let h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; }
  function fromHsv(h, s, v) { const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [r + m, g + m, b + m]; }
  // look: { accent: '#rrggbb' | null, walls: { c, dark } | null, mood: id }
  function grade(src, look) {
    const W = src.naturalWidth || src.width, Hh = src.naturalHeight || src.height;
    const c = document.createElement('canvas'); c.width = W; c.height = Hh;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, W, Hh), D = img.data;
    let aH = 0, aS = 1, aOn = false;
    if (look.accent) { const [r, gg, b] = hex(look.accent), mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); aH = hueOf(r, gg, b, mx, mn); aS = mx ? (mx - mn) / mx : 0; aOn = true; }
    let wt = null; if (look.walls && look.walls.c) { const [r, gg, b] = hex(look.walls.c), L = (r * 0.2126 + gg * 0.7152 + b * 0.0722) || 1; wt = [r / L, gg / L, b / L, look.walls.dark ? 1 : 0]; }
    const mood = look.mood || 'mood-night';
    // mood: per-channel gain, a lift added to the dark and how much the bright parts keep their own level
    const M = { 'mood-late': [0.62, 0.64, 0.68, 0, 0, 0, 0.55], 'mood-dusk': [1.2, 1.0, 0.76, 14, 6, 0, 0.2], 'mood-blue': [0.78, 0.94, 1.22, 0, 4, 14, 0.25],
      'mood-haze': [1, 1, 1, 0, 0, 0, 0], 'mood-alert': [1.15, 0.5, 0.52, 18, 0, 0, 0.25], 'mood-storm': [0.7, 0.8, 0.98, 0, 2, 8, 0.4] }[mood] || null;
    // the grade depends only on a pixel's colour (bar the haze), so it is worked out once for a 33-step
    // colour cube and each pixel reads it with trilinear blending: fast enough for the 2752 px picture
    function px(r, gg, b, out, o) {
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx ? (mx - mn) / mx : 0, v = mx / 255;
      if (aOn && s > 0.12 && v > 0.08) {
        const h = hueOf(r, gg, b, mx, mn), dh = Math.abs(h - 172), w = ss(48, 22, dh) * ss(0.12, 0.32, s) * ss(0.06, 0.2, v);
        if (w > 0) { const [nr, ng, nb] = fromHsv(aH, s * (aS < 0.2 ? 0.12 : Math.min(1, aS * 1.05)), v); r += (nr * 255 - r) * w; gg += (ng * 255 - gg) * w; b += (nb * 255 - b) * w; }
      }
      if (wt) {
        const w = (1 - ss(0.12, 0.34, s)) * (1 - ss(0.55, 0.85, v));
        if (w > 0) { const L = r * 0.2126 + gg * 0.7152 + b * 0.0722; if (wt[3]) { r *= 1 - 0.32 * w; gg *= 1 - 0.32 * w; b *= 1 - 0.3 * w; } else { r += (L * wt[0] - r) * 0.42 * w; gg += (L * wt[1] - gg) * 0.42 * w; b += (L * wt[2] - b) * 0.42 * w; } }
      }
      if (M) { const keep = M[6] * ss(0.45, 0.9, v); r = r * (M[0] + (1 - M[0]) * keep) + M[3] * (1 - v); gg = gg * (M[1] + (1 - M[1]) * keep) + M[4] * (1 - v); b = b * (M[2] + (1 - M[2]) * keep) + M[5] * (1 - v); }
      out[o] = r; out[o + 1] = gg; out[o + 2] = b;
    }
    const N = 33, st = 255 / (N - 1), lut = new Float32Array(N * N * N * 3);
    for (let bi = 0, o = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++, o += 3) px(ri * st, gi * st, bi * st, lut, o);
    const haze = mood === 'mood-haze';
    for (let i = 0, p = 0; i < D.length; i += 4, p++) {
      const fr = D[i] / st, fg = D[i + 1] / st, fb = D[i + 2] / st;
      const r0 = Math.min(N - 2, fr | 0), g0 = Math.min(N - 2, fg | 0), b0 = Math.min(N - 2, fb | 0), dr = fr - r0, dg = fg - g0, db = fb - b0;
      const o000 = ((b0 * N + g0) * N + r0) * 3, oG = N * 3, oB = N * N * 3;
      for (let ch = 0; ch < 3; ch++) {
        const o = o000 + ch;
        const c00 = lut[o] + (lut[o + 3] - lut[o]) * dr, c10 = lut[o + oG] + (lut[o + oG + 3] - lut[o + oG]) * dr;
        const c01 = lut[o + oB] + (lut[o + oB + 3] - lut[o + oB]) * dr, c11 = lut[o + oB + oG] + (lut[o + oB + oG + 3] - lut[o + oB + oG]) * dr;
        const c0 = c00 + (c10 - c00) * dg, c1 = c01 + (c11 - c01) * dg;
        D[i + ch] = c0 + (c1 - c0) * db;
      }
      if (haze) { const v = Math.max(D[i], D[i + 1], D[i + 2]) / 255, x = (p % W) / W, y = (p / W | 0) / Hh, hz = 26 * (1 - v) * (0.6 + 0.4 * y); D[i] += hz * (1 - x) * 1.1; D[i + 1] += hz * x * 0.75; D[i + 2] += hz * (0.7 + x * 0.3); }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // what the props and pets get so they sit in the same light (a CSS filter)
  const MOOD_FILTER = { 'mood-late': 'brightness(.78)', 'mood-dusk': 'sepia(.28) saturate(1.1) brightness(1.04)', 'mood-blue': 'hue-rotate(-12deg) saturate(.8) brightness(.95)',
    'mood-alert': 'sepia(.5) hue-rotate(-40deg) saturate(1.6) brightness(.92)', 'mood-storm': 'saturate(.7) brightness(.82)', 'mood-haze': 'saturate(1.1) brightness(1.04)' };

  return { POSTERS, SCREENS, BANNERS, neon, plate, rug, mat, litQuad, loadSvg, grade, MOOD_FILTER, mark, H };
})();
