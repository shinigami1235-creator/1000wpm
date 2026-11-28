// Draws one tier room: the still picture with the player's items laid onto it (js/room/tier-items.js).
// Posters, monitor programs and the banner print are SVG bent onto the picture's frames with a
// projective (matrix3d) transform; LED colours are a hue blend, so grey stays grey and only the teal
// light turns; shelf, desk and case items are cut-outs standing on their spots by their bottom
// centre; the window view is a 2D canvas behind a glass mask (tools/room-glass.py).
//
//   const v = RoomView.create(host, { tier, equip, data, earned, interactive, onSlot, fit, still })
//     fit: 'cover' (fills host), 'width' (host height follows), 'height' (host scrolls sideways)
//     still: no animation and the small picture, for thumbnails and room lists
//   v.set({ tier, equip, data, earned })   v.preview(slotId, itemId | undefined)   v.select(slotId)
//   v.fit()   v.dispose()
//   RoomView.thumb(item) -> a picture URL for the #/shop card
window.RoomView = (() => {
  const RT = window.RoomTiers;
  const TAU = Math.PI * 2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => Math.round(n || 0).toLocaleString('en-US');
  const MONO = "'Share Tech Mono','JetBrains Mono',ui-monospace,monospace", HEAD = "'Chakra Petch','Rajdhani',sans-serif";
  const G = '#39ff88', INK = '#d7f5e3';

  // ------------------------------------------------------------------ bending a box onto four points
  function adj(m) { return [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]]; }
  function mm(a, b) { const c = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j]; c[3 * i + j] = s; } return c; }
  function mv(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
  function basis(p) { const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1]; const v = mv(adj(m), [p[3][0], p[3][1], 1]); return mm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]); }
  function quad(el, w, h, dst) {
    let t = mm(basis(dst), adj(basis([[0, 0], [w, 0], [w, h], [0, h]])));
    t = t.map(x => x / t[8]);
    el.style.width = w + 'px'; el.style.height = h + 'px';
    el.style.transform = `matrix3d(${[t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].join(',')})`;
  }
  // a smaller quad inside a quad, by fractions across and down
  function sub(q, [u0, v0, u1, v1]) {
    const at = (u, v) => { const a = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u], b = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u]; return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v]; };
    return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  }
  const bbox = q => { const xs = q.map(p => p[0]), ys = q.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };

  // ------------------------------------------------------------------ art in SVG
  // the CTRL emblem is the official wing mark now (Gid, 28 Nov: main 6a61c78), drawn in a 64 x 64 box
  const EMBLEM = (c = 'currentColor') => (window.RoomArt ? RoomArt.mark(8, 3, 48, 58, `fill="${c}"`) : '');
  const LAUREL = c => { let s = ''; for (const side of [-1, 1]) for (let i = 0; i < 9; i++) { const a = (90 + side * (22 + i * 16)) * Math.PI / 180, x = 32 + Math.cos(a) * 24, y = 32 + Math.sin(a) * 24; s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3" ry="6.6" transform="rotate(${(a * 180 / Math.PI + side * 18).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${c}"/>`; } return s + `<text x="32" y="40" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="22" fill="${c}">A</text>`; };
  const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${extra}>${body}</svg>`;
  const img = (href, x, y, w, h, more = '') => `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" ${more}/>`;

  // posters: 300 x 450
  const P = (bg, body) => svg(300, 450, `<rect width="300" height="450" fill="${bg}"/>${body}`, 'preserveAspectRatio="xMidYMid slice"');
  const figPoster = (fig, a, b, title) => P('#050608', `<defs><radialGradient id="pg${fig}" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="300" height="450" fill="url(#pg${fig})"/>
    <g stroke="${a}" stroke-opacity=".25">${[...Array(9)].map((_, i) => `<path d="M0 ${60 + i * 40}H300"/>`).join('')}</g>
    ${img(`assets/room/items/fig-${fig}.webp`, 20, 56, 260, 290, 'preserveAspectRatio="xMidYMax meet"')}
    <rect x="0" y="360" width="300" height="90" fill="#050608" fill-opacity=".85"/><text x="24" y="402" font-family="${HEAD}" font-weight="700" font-size="30" fill="#f2f4f2">${title}</text><text x="24" y="428" font-family="${MONO}" font-size="13" letter-spacing="3" fill="${a}">BOSS RUSH // DEFEATED</text>`);
  const POSTERS = {
    'poster-ctrl': () => P('#020805', `<defs><radialGradient id="pc" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#0d3a22"/><stop offset="1" stop-color="#020805"/></radialGradient></defs><rect width="300" height="450" fill="url(#pc)"/><g transform="translate(60 105) scale(2.8)" color="#d7f5e3">${EMBLEM()}</g><text x="150" y="380" text-anchor="middle" font-family="${MONO}" font-size="16" letter-spacing="6" fill="#39ff88">CTRL</text>`),
    'poster-logo': () => P('#0d1712', `<rect x="14" y="14" width="272" height="422" fill="none" stroke="#d7f5e3" stroke-opacity=".4" stroke-width="2"/><g transform="translate(70 90) scale(2.5)">${LAUREL('#39ff88')}</g><text x="150" y="330" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="40" fill="#d7f5e3">10000WPM</text><text x="150" y="358" text-anchor="middle" font-family="${MONO}" font-size="12" letter-spacing="3" fill="#7fa892">THE TYPING COLLECTION</text>`),
    'poster-keys': () => P('#0a0d0f', [...Array(12)].map((_, i) => { const x = 36 + (i % 3) * 80, y = 60 + Math.floor(i / 3) * 86; const c = ['#2a3036', '#2a3036', '#f2c230', '#2a3036', '#39ff88', '#2a3036', '#2a3036', '#ff4d5e', '#2a3036', '#2a3036', '#2a3036', '#3ee6ff'][i]; return `<rect x="${x}" y="${y}" width="68" height="70" rx="9" fill="#050607"/><rect x="${x + 5}" y="${y + 3}" width="58" height="56" rx="7" fill="${c}" fill-opacity="${c === '#2a3036' ? 1 : 0.85}"/><text x="${x + 14}" y="${y + 26}" font-family="${MONO}" font-size="16" fill="${c === '#2a3036' ? '#9aa4aa' : '#0a0d0f'}">${'QWERASDFZXCV'[i]}</text>`; }).join('')),
    'poster-mountain': () => P('#0b1730', `<defs><linearGradient id="pm" x2="0" y2="1"><stop offset="0" stop-color="#0b1730"/><stop offset=".6" stop-color="#2b4a7a"/><stop offset="1" stop-color="#9fb7d9"/></linearGradient></defs><rect width="300" height="450" fill="url(#pm)"/>${[...Array(40)].map((_, i) => `<circle cx="${(i * 73) % 300}" cy="${(i * 37) % 170}" r="${i % 7 ? 0.8 : 1.4}" fill="#fff" fill-opacity=".7"/>`).join('')}<path d="M0 320 70 210 120 260 180 150 240 240 300 190V450H0z" fill="#3d5577"/><path d="M180 150 160 185 175 180 185 192 196 176z" fill="#e8eef8"/><path d="M0 380 90 290 150 340 230 270 300 330V450H0z" fill="#1d2c44"/><text x="150" y="425" text-anchor="middle" font-family="${MONO}" font-size="13" letter-spacing="4" fill="#d7e4f2">ALT 4,808 M</text>`),
    'poster-synth': () => P('#1a0530', `<defs><linearGradient id="ps" x2="0" y2="1"><stop offset="0" stop-color="#1a0530"/><stop offset=".55" stop-color="#4d0f5c"/><stop offset=".551" stop-color="#0a0214"/></linearGradient><linearGradient id="pss" x2="0" y2="1"><stop offset="0" stop-color="#ffd23d"/><stop offset="1" stop-color="#ff3fb8"/></linearGradient><clipPath id="psc"><rect width="300" height="247"/></clipPath></defs><rect width="300" height="450" fill="url(#ps)"/><g clip-path="url(#psc)"><circle cx="150" cy="200" r="95" fill="url(#pss)"/>${[...Array(6)].map((_, i) => `<rect x="40" y="${165 + i * 14}" width="220" height="${2 + i * 1.4}" fill="#4d0f5c"/>`).join('')}</g><g stroke="#ff3fb8" stroke-opacity=".6">${[...Array(9)].map((_, i) => `<path d="M${150 + (i - 4) * 18} 248 ${150 + (i - 4) * 90} 450"/>`).join('')}${[...Array(6)].map((_, i) => `<path d="M0 ${252 + i * i * 7}H300"/>`).join('')}</g>`),
    'poster-syntax': () => P('#0a0204', `<defs><radialGradient id="pse" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3a0a12"/><stop offset="1" stop-color="#050102"/></radialGradient></defs><rect width="300" height="450" fill="url(#pse)"/>${img('assets/boss/syntax-error.webp', -20, 10, 340, 420, 'preserveAspectRatio="xMidYMin slice"')}<text x="150" y="430" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="28" letter-spacing="2" fill="#ff4d5e">SYNTAX ERROR</text>`),
    'poster-operator': () => P('#06090c', `<defs><linearGradient id="po" x2="0" y2="1"><stop offset="0" stop-color="#10202a"/><stop offset="1" stop-color="#030506"/></linearGradient></defs><rect width="300" height="450" fill="url(#po)"/>${img('assets/boss/operator-back.webp', 20, 30, 260, 400, 'preserveAspectRatio="xMidYMax meet"')}<text x="24" y="40" font-family="${MONO}" font-size="13" letter-spacing="4" fill="#3ee6ff">OPERATOR // CTRL</text>`),
    'poster-red': () => P('#3a0a12', `<defs><linearGradient id="pr" x2="0" y2="1"><stop offset="0" stop-color="#ff4d5e"/><stop offset="1" stop-color="#2a050b"/></linearGradient></defs><rect width="300" height="450" fill="url(#pr)"/><path d="M150 90 250 270H50z" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="10"/><path d="M150 150v60M150 230v12" stroke="#fff" stroke-width="12"/><text x="150" y="350" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="40" fill="#fff">PHASE 3</text><text x="150" y="380" text-anchor="middle" font-family="${MONO}" font-size="13" letter-spacing="4" fill="#ffd0d4">KERNEL BREACH</text>`),
    'poster-204': () => P('#050706', `<text x="150" y="250" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="150" fill="#39ff88">204</text><text x="150" y="300" text-anchor="middle" font-family="${MONO}" font-size="26" letter-spacing="10" fill="#d7f5e3">WPM</text><path d="M40 330H260" stroke="#39ff88" stroke-opacity=".5"/><text x="150" y="362" text-anchor="middle" font-family="${MONO}" font-size="13" letter-spacing="3" fill="#7fa892">ART // @10000WPM</text>`),
    'poster-siege': () => figPoster('siege', '#ffb020', '#140a02', 'SIEGE TITAN'),
    'poster-king': () => figPoster('king', '#ffd23d', '#141002', 'KERNEL KING'),
    'poster-colossus': () => figPoster('colossus', '#a35bff', '#0b0418', 'DATA COLOSSUS'),
    'poster-rush': () => P('#050608', `<rect width="300" height="450" fill="#07090b"/>${['siege', 'warden', 'colossus', 'king', 'half', 'brute'].map((f, i) => img(`assets/room/items/fig-${f}.webp`, 12 + (i % 2) * 140, 40 + Math.floor(i / 2) * 120, 136, 118, 'preserveAspectRatio="xMidYMax meet"')).join('')}<text x="150" y="30" text-anchor="middle" font-family="${MONO}" font-size="14" letter-spacing="5" fill="#ffb020">BOSS RUSH</text><text x="150" y="428" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="22" fill="#eef">SIX TITANS. ONE RUN.</text>`),
    'poster-blueprint': () => P('#0b2a4a', `<g stroke="#9fd0ff" stroke-opacity=".18">${[...Array(15)].map((_, i) => `<path d="M${i * 20} 0V450M0 ${i * 30}H300"/>`).join('')}</g><g fill="none" stroke="#d8ecff" stroke-width="1.6"><rect x="30" y="150" width="240" height="110" rx="8"/>${[...Array(4)].map((_, r) => [...Array(r === 3 ? 6 : 12)].map((_, c) => `<rect x="${40 + c * (r === 3 ? 38 : 19)}" y="${160 + r * 24}" width="${r === 3 ? 34 : 16}" height="18" rx="2"/>`).join('')).join('')}</g><text x="30" y="120" font-family="${MONO}" font-size="14" fill="#d8ecff">SLAB-60 // SCALE 1:2</text><text x="30" y="300" font-family="${MONO}" font-size="11" fill="#9fd0ff">285.0 MM</text>`),
  };

  // monitor programs: 480 x 270, drawn from d (the room owner's numbers)
  const S = (bg, body, cls = '') => svg(480, 270, `<rect width="480" height="270" fill="${bg}"/>${body}`, `class="rv-scr ${cls}" font-family="${MONO}"`);
  const head = (l, r, c = '#8fb3a0') => `<text x="26" y="40" font-size="17" letter-spacing="2" fill="${c}">${esc(l)}</text><text x="454" y="40" text-anchor="end" font-size="17" letter-spacing="2" fill="${c}">${esc(r)}</text>`;
  const BOSSES = ['spam', 'siege', 'sign', 'warden', 'announcer', 'colossus', 'press', 'king', 'correction', 'half', 'brute', 'syntax'];
  const KEYROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const SCREENS = {
    'scr-stats': d => S('#020a05', `${head('STORMTYPER', 'LV.' + d.level)}<text x="26" y="120" font-size="54" font-weight="700" fill="${G}">${d.best}<tspan fill="#eafff2" font-size="40"> wpm · ${d.acc}%</tspan></text><text x="26" y="172" font-size="26" fill="#5f7d6c"><tspan fill="${G}">cache</tspan> <tspan fill="${G}">reboot</tspan> crypto<tspan class="rv-caret" fill="${G}">_</tspan></text><rect x="26" y="208" width="428" height="12" fill="${G}" fill-opacity=".18"/><rect x="26" y="208" width="${(428 * d.xp).toFixed(0)}" height="12" fill="${G}"/>`),
    'scr-logo': () => S('#020805', `<defs><radialGradient id="sl" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#06301a"/><stop offset="1" stop-color="#020a05"/></radialGradient></defs><rect width="480" height="270" fill="url(#sl)"/><g class="rv-drift"><g transform="translate(190 85) scale(1.6)" color="#d7f5e3">${EMBLEM()}</g></g>`),
    'scr-card': d => S('#020a05', `<rect x="26" y="48" width="160" height="160" fill="#06301a" stroke="${G}" stroke-width="3"/><g transform="translate(58 80) scale(1.5)" color="#d7f5e3">${EMBLEM()}</g><text x="210" y="70" font-size="16" letter-spacing="2" fill="#8fb3a0">OPERATOR // ${esc(String(d.name).toUpperCase().slice(0, 14))}</text><text x="210" y="118" font-family="${HEAD}" font-weight="700" font-size="44" fill="#eafff2">Level ${d.level}</text>${[['Best', d.best + ' wpm'], ['Accuracy', d.acc + '%'], ['Boss damage', d.dmgS]].map(([a, b], i) => `<text x="210" y="${158 + i * 30}" font-size="21" fill="${INK}">${a}</text><text x="454" y="${158 + i * 30}" text-anchor="end" font-size="21" fill="${G}">${esc(b)}</text>`).join('')}`),
    'scr-code': d => S('#020a05', `<defs><clipPath id="cf"><rect x="0" y="54" width="480" height="216"/></clipPath></defs>${head('CTRL // FEED', 'LIVE', G)}<g font-size="21" fill="${G}" clip-path="url(#cf)"><g class="rv-scroll">${['raid 41 joined', 'firewall 26%', 'kernel open x2', 'packet returned', `${esc(d.name)} on watch`, 'node 7 online', 'boss phase 3', 'raid 42 forming', 'raid 41 joined', 'firewall 26%', 'kernel open x2', 'packet returned'].map((t, i) => `<text x="26" y="${82 + i * 34}" ${i % 4 === 3 ? 'fill="#7fa892"' : ''}>&gt; ${t}</text>`).join('')}</g></g>`),
    'scr-boss': d => S('#0d0204', `${head('WORLD BOSS', 'PHASE ' + d.phase, '#ffb3ba')}<text x="26" y="124" font-family="${HEAD}" font-weight="700" font-size="58" fill="#ff4d5e">SYNTAX</text><text x="26" y="168" font-size="24" fill="#ffb3ba">${fmt(d.bossHp)} HP left</text><rect x="26" y="200" width="428" height="14" fill="#ff4d5e" fill-opacity=".2"/><rect class="rv-hp" x="26" y="200" width="${(428 * d.bossHp / 1.5e6).toFixed(0)}" height="14" fill="#ff4d5e"/>`, 'red'),
    'scr-graph': d => { const r = d.runs.length > 1 ? d.runs : [0, 0], mx = Math.max(...r, 10), mn = Math.min(...r, mx - 10), pts = r.map((v, i) => `${(26 + i * 428 / (r.length - 1)).toFixed(1)},${(236 - (v - mn) / (mx - mn) * 160).toFixed(1)}`).join(' ');
      return S('#020a05', `${head('WPM // LAST ' + r.length, (r[r.length - 1] - r[0] >= 0 ? '+' : '') + (r[r.length - 1] - r[0]), G)}<g stroke="${G}" stroke-opacity=".12">${[0, 1, 2, 3].map(i => `<path d="M26 ${76 + i * 53}H454"/>`).join('')}</g><polygon points="26,236 ${pts} 454,236" fill="${G}" fill-opacity=".12"/><polyline points="${pts}" fill="none" stroke="${G}" stroke-width="5" stroke-linejoin="round"/>`); },
    'scr-board': d => S('#020a05', `${head('LEADERBOARD', 'WEEK')}${d.board.map(([n, w, you], i) => `<text x="26" y="${88 + i * 44}" font-size="25" fill="${you ? '#f2c230' : INK}">${i + 1} ${esc(n)}</text><text x="454" y="${88 + i * 44}" text-anchor="end" font-size="25" fill="${you ? '#f2c230' : G}">${w}</text><path d="M26 ${100 + i * 44}H454" stroke="${G}" stroke-opacity=".15"/>`).join('')}`),
    'scr-streak': d => S('#020a05', `${head('SIGN-INS', d.streakN + ' DAYS', G)}${d.streak.map((on, i) => `<rect x="${36 + (i % 7) * 60}" y="${62 + Math.floor(i / 7) * 40}" width="50" height="32" rx="3" fill="${on ? G : '#0d2618'}" fill-opacity="${on ? 0.85 : 1}"/>`).join('')}`),
    'scr-rush': d => S('#0d0802', `${head('BOSS RUSH', 'BEST RUN', '#ffd08a')}<text x="26" y="128" font-family="${HEAD}" font-weight="700" font-size="64" fill="#ffb020">${d.rush.bosses}<tspan font-size="28" fill="#ffd08a"> bosses</tspan></text><text x="26" y="166" font-size="20" fill="#ffd08a">score ${fmt(d.rush.score)}</text>${BOSSES.map((b, i) => `<rect x="${26 + i * 36}" y="196" width="30" height="30" rx="4" fill="${d.rush.beat.includes(b) ? '#ffb020' : '#2a1a06'}"/>`).join('')}`, 'amber'),
    'scr-keys': d => S('#020a05', `${head('MISSED KEYS', 'ALL TIME')}${KEYROWS.map((r, ri) => [...r].map((k, i) => { const m = Math.min(1, (d.miss[k] || 0) * 12); return `<rect x="${30 + ri * 18 + i * 42}" y="${66 + ri * 62}" width="36" height="50" rx="5" fill="rgb(${Math.round(20 + m * 235)},${Math.round(60 - m * 20)},${Math.round(40 + m * 30)})"/><text x="${48 + ri * 18 + i * 42}" y="${98 + ri * 62}" text-anchor="middle" font-size="19" fill="#eafff2">${k}</text>`; }).join('')).join('')}`),
    'scr-rain': () => S('#010603', `<g font-size="18" fill="${G}">${[...Array(16)].map((_, c) => `<g class="rv-fall" style="animation-duration:${(3 + (c * 7) % 5)}s;animation-delay:-${(c * 13) % 7}s">${[...Array(14)].map((_, r) => `<text x="${12 + c * 29}" y="${r * 22}" fill-opacity="${(r / 14).toFixed(2)}">${'01ABCDEF<>/{}#$'[(c * 5 + r * 3) % 15]}</text>`).join('')}</g>`).join('')}</g>`),
    'scr-radar': d => S('#020a0c', `<g fill="none" stroke="#3ee6ff" stroke-opacity=".35"><circle cx="240" cy="140" r="110"/><circle cx="240" cy="140" r="72"/><circle cx="240" cy="140" r="34"/><path d="M130 140H350M240 30V250"/></g><g class="rv-sweep"><path d="M240 140 240 30A110 110 0 0 1 335 85z" fill="#3ee6ff" fill-opacity=".22"/></g>${[...Array(14)].map((_, i) => `<circle cx="${(240 + Math.cos(i * 2.4) * (30 + (i * 37) % 76)).toFixed(0)}" cy="${(140 + Math.sin(i * 2.4) * (30 + (i * 37) % 76)).toFixed(0)}" r="4" fill="#3ee6ff" class="rv-blip" style="animation-delay:${(i * 0.37 % 4).toFixed(2)}s"/>`).join('')}<text x="26" y="40" font-size="17" fill="#8fd8e8">KEYSPACE</text><text x="26" y="248" font-size="17" fill="#8fd8e8">${d.online} online</text>`),
  };

  // banner prints, drawn on a 200 x 200 square inside the cloth (or the whole cloth for stripes)
  const BANNERS = {
    'ban-ctrl': { svg: () => svg(68, 68, `<g transform="translate(2 2)" color="#d7f5e3">${EMBLEM()}</g>`), c: 'rgba(215,245,227,.24)' },
    'ban-ctrl-red': { svg: () => svg(68, 68, `<g transform="translate(2 2)" color="#ff6a78">${EMBLEM('currentColor', '#ff4d5e')}</g>`), c: '' },
    'ban-ctrl-gold': { svg: () => svg(68, 68, `<g transform="translate(2 2)" color="#ffd27a">${EMBLEM('currentColor', '#ffb020')}</g>`), c: '' },
    'ban-laurel': { svg: () => svg(64, 64, LAUREL('#d7f5e3')), c: '' },
    'ban-syntax': { svg: () => svg(64, 64, `<path d="M32 8 58 54H6z" fill="none" stroke="#ff4d5e" stroke-width="4"/><path d="M32 24v16M32 45v4" stroke="#ff4d5e" stroke-width="5"/>`), c: '' },
    'ban-hazard': { full: true, svg: () => svg(100, 100, `<defs><pattern id="hz" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="20" fill="#f2c230"/></pattern></defs><rect width="100" height="100" fill="url(#hz)"/>`, 'preserveAspectRatio="none"') },
    'gift-pennant': { svg: () => svg(64, 64, `<path d="M32 6c4 12 16 16 16 32a16 16 0 0 1-32 0c0-8 4-12 8-16 0 6 2 10 6 10-2-10 2-20 2-26z" fill="#ff7a2a"/><path d="M32 30c3 6 8 8 8 16a8 8 0 0 1-16 0c0-5 4-8 8-16z" fill="#ffd23d"/>`), c: '' },
  };

  // My Room, more (28 Nov 2026): the new posters, programs and prints from js/room/tier-art.js
  const RA = window.RoomArt;
  if (RA) { Object.assign(POSTERS, RA.POSTERS); Object.assign(SCREENS, RA.SCREENS); Object.assign(BANNERS, RA.BANNERS); }

  // the bunk room's corkboard badges
  const PIN_ICON = {
    star: '<path d="M20 11l2.6 5.4 5.9.8-4.3 4.1 1 5.9L20 24.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
    bolt: '<path d="M22 9l-8 13h6l-2 11 8-14h-6z"/>', skull: '<circle cx="20" cy="19" r="7"/><path d="M15 27h10" stroke="currentColor" stroke-width="2.5"/>',
    gem: '<path d="M14 15h12l3 5-9 11-9-11z"/>', eye: '<path d="M10 21c5-7 15-7 20 0-5 7-15 7-20 0z"/><circle cx="20" cy="21" r="2.5" fill="#000"/>',
    key: '<rect x="13" y="13" width="14" height="14" rx="2"/>', chev: '<path d="M12 22l8-7 8 7M12 29l8-7 8 7" fill="none" stroke="currentColor" stroke-width="3"/>',
    shield: '<path d="M20 10l8 3v6c0 6-4 10-8 12-4-2-8-6-8-12v-6z"/>', flag: '<path d="M14 10v22M14 11h12l-3 4 3 4H14" fill="none" stroke="currentColor" stroke-width="2.5"/>',
  };
  const pin = art => { const [c, ic] = RT.PIN[art] || ['#39ff88', 'chev']; return svg(40, 44, `<path d="M20 2 37 12v20L20 42 3 32V12z" fill="#0b1210" stroke="${c}" stroke-width="2.5"/><g fill="${c}" color="${c}">${PIN_ICON[ic]}</g><circle cx="20" cy="5" r="2.2" fill="#c8c8c8"/>`); };

  // ------------------------------------------------------------------ the Earth hologram's land (96 x 48, from js/app/world-110m.js)
  const LAND = (() => { const b = atob('AAAAAAAAAAAAAAAAAAAAAAeAAAAAAAAAAAAD///4HgwAYAAAAAH/9//gCACAfAQAAAP38H/gAAI//8cAj////H/AD8P/////////3j4wH///////H///fjgAf///////Bx//HwACe/////ywAA///4AHP/////xgAAP//8AD//////4AAAH//8AB//////wAAAH//gAH/3////YAAAH/+AAHL////+QAAAH/8AAD4v///3wAAAD/4AAH/////7AAAAB+IAAP/////4AAAAA8IAAP/////4AAAgAMmAAf//8f/AAAAAAHwAAf//4ceIAAAAAAwAAf//gMOIAAAAAAfwAP//wMKcAAAAAAH8AH//gEM0AAAAAAH+AAP/AAN4AAAAAAP/gAP+AAF7wAAAAAP/4AH+AAGI/AAAAAH/4AH+AAAccgAAAAH/wAH+QAADoAAAAAD/wAH+wAAP4BAAAAB/gAH9gAAf8AAAAAB/AAD9gAA/+AAAAAB+AAD4AAA/+AAAAAB+AABwAAA/+AAAAAD8AABAAAAQ8CAAAADwAAAAAAAAMDAAAADgAAAAAAAAEGAAAADgAAAAAAAAAIAAAADAAAAAAAAAAAAAAADAAAAAAAAAA'); return (x, y) => { const i = y * 96 + x; return (b.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1; }; })();
  function drawEarth(c, w, h, t) {
    c.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2, rot = t * 0.25, tilt = 0.35;
    const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, 'rgba(90,220,255,.22)'); g.addColorStop(1, 'rgba(40,160,220,.06)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(140,245,255,.55)'; c.lineWidth = 1.5; c.stroke();
    c.lineWidth = 0.8; c.strokeStyle = 'rgba(120,240,255,.18)';
    for (let la = -60; la <= 60; la += 30) { const y = cy - Math.sin(la * Math.PI / 180) * R * Math.cos(tilt), rr = Math.cos(la * Math.PI / 180) * R; c.beginPath(); c.ellipse(cx, y, rr, rr * Math.sin(tilt), 0, 0, Math.PI); c.stroke(); }
    c.fillStyle = '#b8fbff';
    const d = R / 22;
    for (let y = 2; y < 46; y++) for (let x = 0; x < 96; x++) {
      if (!LAND(x, y)) continue;
      const lon = (x / 96) * TAU - Math.PI + rot, lat = Math.PI / 2 - (y / 48) * Math.PI;
      const X = Math.cos(lat) * Math.sin(lon), Y = Math.sin(lat), Z = Math.cos(lat) * Math.cos(lon);
      const Y2 = Y * Math.cos(tilt) - Z * Math.sin(tilt), Z2 = Y * Math.sin(tilt) + Z * Math.cos(tilt);
      if (Z2 < 0.02) continue;
      c.globalAlpha = 0.25 + Z2 * 0.75; c.fillRect(cx + X * R - d / 2, cy - Y2 * R - d / 2, d, d);
    }
    c.globalAlpha = 1;
  }


  // ------------------------------------------------------------------ window views
  // the scenes are baked into pictures (tools/room-views-bake.py): the big one for the window and a
  // small one for the shop card; a scene without a picture is painted here instead
  const OW = 384, OH = 288;
  const sceneCache = new Map();
  function sceneArt(key, small) {
    const k = key + (small ? '-s' : '');
    if (!sceneCache.has(k)) sceneCache.set(k, loadImg(`assets/room/views/${k}.webp`).catch(() => {
      const W = small ? 400 : 1536, H = small ? 300 : 1152, c = document.createElement('canvas'); c.width = W; c.height = H;
      RoomScenes.SCENES[key].draw(RoomScenes.K, c.getContext('2d', { willReadFrequently: true }), W, H);
      return c;
    }));
    return sceneCache.get(k);
  }
  // The view as if it were really outside that window, worked out from the photo's own glass:
  // brightness and contrast pulled toward what the photo shows there, a little less colour, the
  // photo's light across the glass (darker corners, brighter where the room lights it), haze, the
  // room's reflections from the original glass laid back on top, and the photo's grain.
  //   sc.keep: how much of the view's own brightness stays (0 takes the photo's, 1 keeps the scene's)
  function behindGlass(c, W, H, P, mk, [bx, by, bw, bh], tw, sc) {
    const f = (P.naturalWidth || P.width) / tw;
    const grab = (w, h, blur = 0) => { const t = document.createElement('canvas'); t.width = w; t.height = h; const g = t.getContext('2d', { willReadFrequently: true }); if (blur) g.filter = `blur(${blur}px)`; g.drawImage(P, bx * f, by * f, bw * f, bh * f, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
    const O = grab(W, H), Ob = grab(W, H, Math.max(2, W / 70));
    // the photo's light across the window, very soft: from a tiny copy, smoothed up
    const lw = 12, lh = Math.max(2, Math.round(12 * H / W));
    const tiny = document.createElement('canvas'); tiny.width = lw; tiny.height = lh;
    const tg = tiny.getContext('2d'); tg.filter = 'blur(1px)'; tg.drawImage(P, bx * f, by * f, bw * f, bh * f, 0, 0, lw, lh);
    const big = document.createElement('canvas'); big.width = W; big.height = H;
    const bgc = big.getContext('2d', { willReadFrequently: true }); bgc.imageSmoothingQuality = 'high'; bgc.drawImage(tiny, 0, 0, W, H);
    const Lo = bgc.getImageData(0, 0, W, H).data;
    const mt = document.createElement('canvas'); mt.width = W; mt.height = H;
    const mg = mt.getContext('2d', { willReadFrequently: true }); mg.drawImage(mk, 0, 0, W, H);
    const M = mg.getImageData(0, 0, W, H).data;
    const img = c.getImageData(0, 0, W, H), D = img.data;
    const lum = (a, i) => a[i] * 0.2126 + a[i + 1] * 0.7152 + a[i + 2] * 0.0722;
    // averages over the glass only
    let n = 0, sS = 0, sS2 = 0, sO = 0, sO2 = 0, oR = 0, oG = 0, oB = 0;
    for (let i = 0; i < D.length; i += 16) {
      if (M[i + 3] < 128) continue;
      const a = lum(D, i), b = lum(O, i);
      n++; sS += a; sS2 += a * a; sO += b; sO2 += b * b; oR += O[i]; oG += O[i + 1]; oB += O[i + 2];
    }
    if (!n) return;
    const mS = sS / n, dS = Math.sqrt(Math.max(1, sS2 / n - mS * mS)), mO = sO / n, dO = Math.sqrt(Math.max(1, sO2 / n - mO * mO));
    oR /= n; oG /= n; oB /= n;
    const keep = sc.keep == null ? 0.35 : sc.keep;
    // brightness: mostly the photo's; contrast: never more than the scene had, pulled toward the photo's
    const mT = mS > mO ? mO + (mS - mO) * keep : mS, dT = Math.min(dS, dO + (dS - dO) * (keep + 0.15)) * 0.92, g = dT / dS;
    // the glass's colour: the photo's average there, as a tint around grey
    const oL = Math.max(1, oR * 0.2126 + oG * 0.7152 + oB * 0.0722), tR = oR / oL, tG = oG / oL, tB = oB / oL, tint = 0.28;
    const sat = 0.8, haze = 0.1, hR = tR * mT * 1.05, hG = tG * mT * 1.05, hB = tB * mT * 1.05;
    let seed = 1;
    for (let i = 0, p = 0; i < D.length; i += 4, p++) {
      if (M[i + 3] === 0) continue;
      const y = (p / W | 0) / H;
      let r = D[i], gg = D[i + 1], b = D[i + 2];
      // tone toward the photo
      r = (r - mS) * g + mT; gg = (gg - mS) * g + mT; b = (b - mS) * g + mT;
      const L = r * 0.2126 + gg * 0.7152 + b * 0.0722;
      r = L + (r - L) * sat; gg = L + (gg - L) * sat; b = L + (b - L) * sat;
      r += (r * tR - r) * tint; gg += (gg * tG - gg) * tint; b += (b * tB - b) * tint;
      // the photo's light falloff across the glass
      const lo = Math.min(1.5, Math.max(0.6, lum(Lo, i) / Math.max(4, mO)));
      const lk = 1 + (lo - 1) * 0.35;
      r *= lk; gg *= lk; b *= lk;
      // depth haze, a little thicker low down where the view is farthest off
      const hz = haze + 0.08 * y;
      r += (hR - r) * hz; gg += (hG - gg) * hz; b += (hB - b) * hz;
      // the room's reflections: what stands out bright on the photo's own glass (the LED lines, the
      // light on the bars), the cool ones more than the warm city lights, screened on
      const hp = lum(O, i) - lum(Ob, i), cy = Math.min(1, Math.max(0, (O[i + 1] - O[i] - 30) / 22));
      const rf = Math.min(1, Math.max(0, (hp - 8) / 50)) * cy * 0.5;
      if (rf > 0) { r = 255 - (255 - r) * (1 - O[i] / 255 * rf); gg = 255 - (255 - gg) * (1 - O[i + 1] / 255 * rf); b = 255 - (255 - b) * (1 - O[i + 2] / 255 * rf); }
      // grain like the photo's
      seed = (seed * 16807) % 2147483647; const gr = (seed / 2147483647 - 0.5) * 7;
      D[i] = r + gr; D[i + 1] = gg + gr; D[i + 2] = b + gr;
    }
    c.putImageData(img, 0, 0);
  }

  const masks = new Map();
  const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const mask = n => { if (!masks.has(n)) masks.set(n, loadImg(`assets/room/tiers/t${n}-glass.png`)); return masks.get(n); };

  // the look from what's placed: accent colour, wall tint and mood
  function lookOf(e) {
    const g = (k, d) => RT.get(e[k] !== undefined ? e[k] || d : d) || RT.get(d);
    const a = g('accent', 'acc-teal'), w = g('walls', 'walls-none'), m = g('mood', 'mood-night');
    return { accent: a.c || null, walls: w.c ? { c: w.c, dark: !!w.dark } : null, mood: m.id };
  }
  // one graded picture kept: grading the 2752 px picture takes a moment, so trying moods back and forth reuses it
  const grades = new Map(), urls = new WeakMap();
  const urlOf = G => { if (!urls.has(G)) urls.set(G, new Promise(ok => G.toBlob(b => ok(b ? URL.createObjectURL(b) : null), 'image/jpeg', 0.93))); return urls.get(G); };
  function gradeCached(P, tier, key, look) {
    const k = tier + key + (P.naturalWidth || P.width);
    if (!grades.has(k)) { if (grades.size > 2) { const old = grades.keys().next().value, G = grades.get(old); grades.delete(old); if (urls.has(G)) urls.get(G).then(u => u && URL.revokeObjectURL(u)); } grades.set(k, RA.grade(P, look)); }
    return grades.get(k);
  }

  // ------------------------------------------------------------------ the room
  function create(host, o = {}) {
    let opt = { tier: 1, equip: {}, earned: [], data: null, interactive: false, fit: 'cover', still: false, ...o };
    let previewing = null, sel = null, disposed = false;
    const motion = () => !opt.still && !reduce.matches;
    const box = document.createElement('div');
    box.className = 'rv' + (opt.still ? ' still' : '') + (opt.interactive ? ' edit' : '');
    const room = document.createElement('div'); room.className = 'rv-room';
    box.append(room); host.append(box);
    let T, bg, glassCv = null, ticks = [], s = 1, ox = 0, oy = 0, par = { x: 0, y: 0, tx: 0, ty: 0 }, raf = 0, visible = true, lastT = 0;

    const el = (cls, html, style) => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; if (style) d.setAttribute('style', style); room.append(d); return d; };
    const equipOf = () => { const e = { ...opt.equip }; if (previewing) { if (previewing.item === undefined) delete e[previewing.slot]; else e[previewing.slot] = previewing.item; } return e; };
    const itemIn = (slot, e) => { const id = e[slot.id] !== undefined ? e[slot.id] : RT.defaultFor(slot.id, slot.kind); return id ? RT.get(id) : null; };

    // the picture as plain pixels for the canvases (an <img> with srcset reports a scaled natural size)
    let pix = null, graded = null, lookKey = '';
    const raw = () => (pix ||= new Promise(ok => { const go = () => loadImg(bg.currentSrc || bg.src).then(ok, () => ok(null)); if (bg.complete && bg.naturalWidth) go(); else bg.addEventListener('load', go, { once: true }); }));
    // the room's look (accent, walls, mood) is worked into the picture once; everything that copies
    // the picture's pixels (LED zones, the window, rugs and mats) takes them from the graded one
    const pixels = () => (lookKey ? (graded ||= raw().then(P => (P ? gradeCached(P, opt.tier, lookKey, lookOf(equipOf())) : null))) : raw());

    function build() {
      room.innerHTML = ''; ticks = []; glassCv = null; pix = null; graded = null;
      T = RT.TIERS[opt.tier];
      room.style.width = T.w + 'px'; room.style.height = T.h + 'px';
      room.style.setProperty('--dim', T.dim);
      bg = document.createElement('img');
      bg.className = 'rv-bg'; bg.alt = ''; bg.decoding = 'async'; bg.width = T.w; bg.height = T.h;
      if (opt.still) bg.src = `assets/room/tiers/t${opt.tier}-s.webp`;
      else { bg.srcset = `assets/room/tiers/t${opt.tier}-m.webp ${T.w}w, assets/room/tiers/t${opt.tier}.webp ${T.w * 2}w`; bg.src = `assets/room/tiers/t${opt.tier}-m.webp`; }
      room.append(bg);
      const e = equipOf(), d = opt.data || {};
      const slots = RT.slots(opt.tier);
      // the look: a graded copy of the picture over it, and a filter for the cut-outs to match
      const look = lookOf(e);
      lookKey = look.accent || look.walls || look.mood !== 'mood-night' ? JSON.stringify(look) : '';
      room.style.setProperty('--mf', (RA && RA.MOOD_FILTER[look.mood]) || 'brightness(1)');
      if (lookKey) gradeLayer(look);
      // things that lie flat (rugs, the desk mat and keyboard) go down before anything stands on them
      for (const sl of slots) {
        const it = itemIn(sl, e);
        if (sl.kind === 'rug' && it) rugOn(sl.at, it);
        if (sl.kind === 'mat') deskSet(sl.at, it, itemIn(slots.find(x => x.kind === 'kb'), e));
      }
      for (const sl of slots) {
        const it = itemIn(sl, e);
        if (sl.kind === 'sign' && it) neonOn(sl.at, it);
        if (sl.kind === 'plate' && it) plateOn(sl.at, it, d);
        if (sl.kind === 'view' && it && it.scene) windowView(it);
        if ((sl.kind === 'screen' || sl.kind === 'wall') && it) screen(sl, it, d);
        if (sl.kind === 'poster' && it) poster(sl.at, it);
        if (sl.kind === 'light' && it) light(sl.at, it);
        if ((sl.kind === 'shelf' || sl.kind === 'desk') && it) prop(sl.at, it);
        if (sl.kind === 'banner' && it) banner(sl.at, it);
        if (sl.kind === 'holo' && it) holo(sl.at, it);
        if (sl.kind === 'pet' && it) pet(sl.at, it);
      }
      // parts of the picture that stand in front of a slot (a plant over a poster frame)
      for (const [src, x, y, w, h] of T.front || []) el('rv-front', `<img src="assets/room/tiers/${src}.webp" alt="" decoding="async">`, `left:${x}px;top:${y}px;width:${w}px;height:${h}px`);
      caseItems();
      if (opt.interactive) hits(slots);
      if (sel) select(sel);
      fit();
      loop();
    }

    // -------- the window
    // Two canvases behind the glass mask: the painted scene, drawn once per size, and the moving
    // layer (rain, snow, petals, fish), small and redrawn about 20 times a second.
    function windowView(it) {
      const [bx, by, bw, bh] = T.glass;
      const cv = document.createElement('canvas'), lv = document.createElement('canvas');
      cv.className = lv.className = 'rv-glass';
      cv.style.cssText = lv.style.cssText = `left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px`;
      room.append(cv, lv);
      const sc = RoomScenes.SCENES[it.scene];
      const draw = sc.layer ? sc.layer(RoomScenes.K.rng(it.scene.length * 13)) : null;
      let m = null, P = null, base = null;
      Promise.all([mask(opt.tier), pixels(), sceneArt(it.scene)]).then(([i, p, b]) => { m = i; P = p; base = b; paint(); layer(2); }, () => {});
      const ctx = cv.getContext('2d', { willReadFrequently: true }), lx = lv.getContext('2d');
      function paint() {
        if (!m) return;
        const k = Math.min(2, s * (devicePixelRatio || 1));
        const W = Math.max(1, Math.round(bw * k)), H = Math.max(1, Math.round(bh * k));
        if (cv.width === W && cv.height === H && cv._done) return;
        cv.width = W; cv.height = H; cv._done = true;
        const SW = base.naturalWidth || base.width, SH = base.naturalHeight || base.height;
        const sk = Math.max(W / SW, H / SH) * 1.06, sw = SW * sk, sh = SH * sk;
        // soft, as if it were far behind the glass and out of the lens's focus
        ctx.filter = `blur(${(Math.max(1, W / 520) * (sc.soft || 1)).toFixed(2)}px)`; ctx.drawImage(base, (W - sw) / 2, (H - sh) / 2, sw, sh); ctx.filter = 'none';
        if (P) behindGlass(ctx, W, H, P, m, [bx, by, bw, bh], T.w, sc);
        ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      const LW = Math.min(640, Math.round(bw * 1.5)), LH = Math.round(LW * bh / bw);
      lv.width = LW; lv.height = LH;
      let last = -1;
      function layer(t) {
        if (!draw || !m || t - last < 0.05) return;
        last = t;
        lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, LW, LH);
        // the layers were painted for a 384 x 288 window: drawn over a larger area here, so a
        // snowflake or raindrop stays a pixel or two across on a big window; faint, behind the glass
        const lk = Math.max(LW / OW, LH / OH) * (sc.fine || 0.55);
        lx.globalAlpha = sc.fade || 0.7;
        lx.save(); lx.scale(lk, lk); draw(lx, LW / lk, LH / lk, t); lx.restore();
        lx.globalAlpha = 1;
        lx.globalCompositeOperation = 'destination-in'; lx.drawImage(m, 0, 0, LW, LH);
      }
      glassCv = { paint };
      ticks.push(layer);
      // the view's light in the room, faint, around the window
      const [gx, gy, gw, gh] = [bx + bw / 2, by + bh * 0.6, bw * 2.2, bh * 1.3];
      el('rv-spill', '', `left:${gx - gw / 2}px;top:${gy - gh / 2}px;width:${gw}px;height:${gh}px;background:radial-gradient(closest-side,${sc.glow}26,transparent)`);
    }

    // -------- screens, posters, banner
    function screen(sl, it, d) {
      const q = sl.at.q, w = el('rv-q rv-mon');
      w.innerHTML = (SCREENS[it.id] || SCREENS['scr-stats'])(d);
      quad(w, 480, 270, q);
      const g = sl.at.glow;
      if (g) el('rv-glow', '', `left:${g[0] - g[2] / 2}px;top:${g[1] - g[3] / 2}px;width:${g[2]}px;height:${g[3]}px;background:radial-gradient(closest-side,${(it.glow || '#39ff88')}2b,transparent)`);
    }
    function poster(q, it) {
      const w = el('rv-q rv-poster'); w.innerHTML = POSTERS[it.id] ? POSTERS[it.id]() : '';
      const svgEl = w.firstChild; if (svgEl) { svgEl.setAttribute('width', 300); svgEl.setAttribute('height', 450); }
      quad(w, 300, 450, q);
    }
    // the pictures' banners carry the old hexagon logo: the cloth there is filled in, row by row, from
    // the cloth either side of it, so any print (and the default wing) sits on plain cloth
    function cloth(b) {
      const q = sub(b.q, [b.u[0] - 0.05, b.u[1] - 0.04, b.u[2] + 0.05, b.u[3] + 0.04]);
      const [x0, y0, w0, h0] = bbox(q), c = document.createElement('canvas');
      c.className = 'rv-cloth'; c.style.cssText = `left:${x0}px;top:${y0}px;width:${w0}px;height:${h0}px`; room.append(c);
      pixels().then(P => {
        if (!P || !c.isConnected) return;
        const f = (P.naturalWidth || P.width) / T.w, W = Math.round(w0 * f), H = Math.round(h0 * f), m = Math.max(3, Math.round(6 * f));
        const t = document.createElement('canvas'); t.width = W + 4 * m; t.height = H; const g = t.getContext('2d', { willReadFrequently: true });
        g.drawImage(P, x0 * f - 2 * m, y0 * f, W + 4 * m, H, 0, 0, W + 4 * m, H);
        const src = g.getImageData(0, 0, W + 4 * m, H).data;
        c.width = W; c.height = H; const x = c.getContext('2d'), out = x.createImageData(W, H), D = out.data;
        const med = (y, a0, a1) => { const r = [], gg = [], bb = []; for (let xx = a0; xx < a1; xx++) { const k = (y * (W + 4 * m) + xx) * 4; r.push(src[k]); gg.push(src[k + 1]); bb.push(src[k + 2]); } const md = v => v.sort((p, q2) => p - q2)[v.length >> 1]; return [md(r), md(gg), md(bb)]; };
        let seed = 7;
        for (let y = 0; y < H; y++) {
          const L = med(y, 0, m * 2), R = med(y, W + 2 * m, W + 4 * m);
          for (let xx = 0; xx < W; xx++) { const k = (y * W + xx) * 4, t2 = xx / (W - 1); seed = (seed * 16807) % 2147483647; const n = (seed / 2147483647 - 0.5) * 5;
            D[k] = L[0] + (R[0] - L[0]) * t2 + n; D[k + 1] = L[1] + (R[1] - L[1]) * t2 + n; D[k + 2] = L[2] + (R[2] - L[2]) * t2 + n; D[k + 3] = 255; }
        }
        x.putImageData(out, 0, 0);
        // only inside the print's area, with soft edges
        const mk = document.createElement('canvas'); mk.width = W; mk.height = H; const mg = mk.getContext('2d');
        const inner = sub(b.q, [b.u[0] - 0.02, b.u[1] - 0.015, b.u[2] + 0.02, b.u[3] + 0.015]).map(([px, py]) => [(px - x0) * f, (py - y0) * f]);
        mg.filter = `blur(${(2.5 * f).toFixed(1)}px)`; mg.fillStyle = '#000'; mg.beginPath(); inner.forEach(([px, py], i) => (i ? mg.lineTo(px, py) : mg.moveTo(px, py))); mg.closePath(); mg.fill();
        x.globalCompositeOperation = 'destination-in'; x.drawImage(mk, 0, 0);
      });
    }
    function banner(b, it) {
      const B = BANNERS[it.id] || BANNERS['ban-ctrl'];
      cloth(b);
      const w = el('rv-q rv-print' + (B.full ? ' full' : '') + (B.tech ? ' tech' : '') + (it.id === 'ban-ctrl' ? ' ink' : ''), B.svg());
      const s0 = w.firstChild; s0.setAttribute('width', 200); s0.setAttribute('height', 200);
      quad(w, 200, 200, B.full ? sub(b.q, [0.04, 0.03, 0.96, 0.97]) : sub(b.q, b.u));
    }

    // -------- light: each zone is a copy of the picture with the hue turned to the LED colour
    // (saturation and brightness kept, so grey stays grey), faded out at its edges. Drawn once into
    // a canvas instead of a CSS blend, so the page doesn't blend the whole room on every frame.
    function light(L, it) {
      const col = RT.colorOf(it);
      if (!col) return;
      for (const [x, y, w, h] of L.zones) {
        const c = document.createElement('canvas');
        c.className = 'rv-tint' + (it.anim ? ' ' + it.anim : '');
        c.style.cssText = `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px`;
        room.append(c);
        const paint = P => {
          if (!P) return;
          const f = (P.naturalWidth || P.width) / T.w, k = Math.min(1.5, f);
          const W = Math.round(w * k), H = Math.round(h * k);
          c.width = W; c.height = H;
          const g = c.getContext('2d');
          g.drawImage(P, (x - w / 2) * f, (y - h / 2) * f, w * f, h * f, 0, 0, W, H);
          g.globalCompositeOperation = 'hue'; g.fillStyle = col; g.fillRect(0, 0, W, H);
          g.globalCompositeOperation = 'destination-in';
          g.save(); g.translate(W / 2, H / 2); g.scale(W / 2, H / 2);
          const r = g.createRadialGradient(0, 0, 0, 0, 0, 1); r.addColorStop(0, '#000'); r.addColorStop(0.55, '#000'); r.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = r; g.fillRect(-1, -1, 2, 2); g.restore();
        };
        pixels().then(paint);
        if (it.anim === 'pulse') el('rv-dark', '', `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px`);
      }
      for (const [x, y, w, h] of L.cores || []) el('rv-core' + (it.anim ? ' ' + it.anim : ''), '', `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${col}`);
    }

    // -------- props, pets and the case: cut-outs standing on their spot
    function cut(x, y, hpx, src, cls = '', glow = null) {
      const w = el('rv-prop ' + cls, `<img src="${src}" alt="" decoding="async" draggable="false">`, `left:${x}px;top:${y}px;height:${hpx.toFixed(1)}px${glow ? `;--gl:${glow}` : ''}`);
      return w;
    }
    function prop([x, y, ppm], it) {
      const w = cut(x, y, it.hm * ppm, it.art, (it.glow ? 'lit' : '') + (it.id === 'lava-lamp' ? ' lava' : '') + (it.id === 'plasma-ball' ? ' plasma' : ''), it.glow);
      if (it.id === 'lava-lamp') w.insertAdjacentHTML('beforeend', '<i></i><i></i><i></i>');
      if (it.glow) el('rv-halo', '', `left:${x - it.hm * ppm * 0.7}px;top:${y - it.hm * ppm * 1.05}px;width:${it.hm * ppm * 1.4}px;height:${it.hm * ppm * 1.1}px;background:radial-gradient(closest-side,${it.glow}30,transparent)`);
    }
    function pet(at, it) {
      if (it.mode === 'hover') { const [x, y, ppm] = at.hover; cut(x, y, it.hm * ppm, it.art, 'hover'); }
      else if (it.mode === 'bot' || it.mode === 'fish') roamer(at, it);
      else if (it.mode === 'desk') { const [x, y, ppm, span] = at.desk || at.sit; const w = cut(x, y, it.hm * ppm, it.art, 'walker'); w.style.setProperty('--dx', (span * ppm).toFixed(1) + 'px'); }
      else if (it.mode === 'swarm') { const [x, y, ppm] = at.hover; for (let i = 0; i < 3; i++) { const w = cut(x + (i - 1) * 0.22 * ppm, y + (i % 2) * 0.12 * ppm, it.hm * ppm * (1 - i * 0.12), it.art, 'swarm'); w.style.animationDelay = `-${i * 2.3}s`; w.style.setProperty('--r', (0.16 * ppm).toFixed(1) + 'px'); } }
      else { const [x, y, ppm] = at.sit; cut(x, y, it.hm * ppm, it.art, 'pet' + (it.glow ? ' lit' : ''), it.glow); }
    }
    // a pet that moves between its hover spot and the room's other side (roam), keeping its size
    // true to each spot; a bot blinks (its blink frame laid over it now and then)
    function roamer(at, it) {
      const [x, y, ppm] = at.hover, [rx, ry, rp] = at.roam || at.hover;
      const w = el('rv-roam ' + it.mode, '', `left:${x}px;top:${y}px;--dx:${rx - x}px;--dy:${ry - y}px;--k:${(rp / ppm).toFixed(3)}`);
      const inner = document.createElement('div'); inner.className = 'rv-prop bob'; inner.style.height = (it.hm * ppm).toFixed(1) + 'px';
      inner.innerHTML = `<img src="${it.art}" alt="" decoding="async" draggable="false">` + (it.mode === 'bot' ? `<img class="blink" src="${it.art.replace('.webp', '-b.webp')}" alt="" decoding="async" draggable="false">` : '');
      w.append(inner);
      const seed = [...it.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
      w.style.animationDelay = `-${seed % 11}s`; inner.style.animationDelay = `-${(seed % 7) / 3}s`;
    }

    // -------- My Room, more: the look, neon, nameplate, rug and the desk set (js/room/tier-art.js draws them)
    // the graded picture replaces the room's own (no second full-size layer to composite every frame);
    // Red alert keeps the original under it and breathes between the two
    function gradeLayer(look) {
      const alert = look.mood === 'mood-alert';
      let c = null;
      if (alert) { c = document.createElement('canvas'); c.className = 'rv-grade alert'; c.style.cssText = `left:0;top:0;width:${T.w}px;height:${T.h}px`; room.append(c); }
      const me = bg;
      pixels().then(G => {
        if (!G || !me.isConnected) return;
        if (c) { c.width = G.width; c.height = G.height; c.getContext('2d').drawImage(G, 0, 0); return; }
        urlOf(G).then(u => { if (u && me.isConnected) { me.removeAttribute('srcset'); me.removeAttribute('sizes'); me.src = u; } });
      });
      if (look.mood === 'mood-storm') { const [bx, by, bw, bh] = T.glass; el('rv-storm', '', `left:${bx - bw * 0.6}px;top:${by - bh * 0.3}px;width:${bw * 2.2}px;height:${bh * 1.8}px`); }
    }
    const qbox = q => { const [x, y, w, h] = bbox(q); return { x, y, w, h }; };
    // drawn once into a canvas (tubes, then their glow added on top), so a frame never repaints SVG filters
    function neonOn(q, it) {
      const { w, h } = qbox(q), W = Math.round(w * 3), H = Math.round(h * 3), c = document.createElement('canvas');
      c.className = 'rv-q rv-neon'; c.width = W; c.height = H; room.append(c); quad(c, W, H, q);
      RA.loadSvg(RA.neon(it, W, H)).then(im => {
        if (!im || !c.isConnected) return;
        const g = c.getContext('2d');
        g.filter = `blur(${(Math.max(W, H) / 40).toFixed(1)}px)`; g.globalAlpha = 0.9; g.drawImage(im, 0, 0);
        g.globalCompositeOperation = 'lighter'; g.filter = `blur(${(Math.max(W, H) / 140).toFixed(1)}px)`; g.globalAlpha = 0.8; g.drawImage(im, 0, 0);
        g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.drawImage(im, 0, 0);
      });
      const [x, y] = [bbox(q)[0] + w / 2, bbox(q)[1] + h / 2];
      el('rv-spill neon', '', `left:${x - w * 1.1}px;top:${y - h * 1.0}px;width:${w * 2.2}px;height:${h * 2.0}px;background:radial-gradient(closest-side,${it.c || '#3ee6ff'}38,transparent)`);
    }
    function plateOn(q, it, d) {
      const { w, h } = qbox(q), W = Math.round(w * 4), H = Math.round(h * 4);
      const n = el('rv-q rv-plate' + (it.id === 'plate-neon' ? ' lit' : ''), RA.plate(it, d, W, H)); quad(n, W, H, q);
    }
    function flatOn(q, W, H, paint, cls, alb) {
      const c = document.createElement('canvas'); c.className = 'rv-q rv-flat ' + cls; c.width = W; c.height = H; room.append(c); quad(c, W, H, q);
      pixels().then(P => RA.litQuad(q, W, H, paint, P, T, alb)).then(src => { if (c.isConnected) c.getContext('2d').drawImage(src, 0, 0); });
      return c;
    }
    function rugOn(q, it) {
      const W = 640, H = 420;
      flatOn(q, W, H, async g => { const im = await RA.loadSvg(RA.rug(it, W, H)); if (im) g.drawImage(im, 0, 0, W, H); }, 'rug', T.alb || 0.42);
    }
    // the desk mat covers the picture's own keyboard; a keyboard picked goes on it, with a mouse
    function deskSet(m, mt, kb) {
      if (!mt && !kb) return;
      mt = mt || RT.get('mat-plain');
      const W = 760, H = 220, [u0, v0, u1, v1] = m.kb;
      const rgb = mt.id === 'mat-rgb';
      const c = flatOn(m.q, W, H, async g => {
        const im = await RA.loadSvg(RA.mat(mt, W, H)); if (im) g.drawImage(im, 0, 0, W, H);
        // the keyboard, to scale: the picture's own keyboard (m.kb) is about 0.47 x 0.16 m
        let kx0 = u0 * W, ky0 = v0 * H, kw = (u1 - u0) * W, kh = (v1 - v0) * H;
        if (kb) {
          const k = await loadImg(kb.art).catch(() => null);
          if (k) { kw = (u1 - u0) * W * kb.L / 0.47; kh = (v1 - v0) * H * kb.L * (k.height / k.width) / 0.16; kx0 = W * (u0 + u1) / 2 - kw / 2; ky0 = H * (v0 + v1) / 2 - kh / 2;
            g.save(); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 10; g.shadowOffsetY = 6; g.drawImage(k, kx0, ky0, kw, kh); g.restore(); }
        }
        if (m.mouse) { const [mx, my] = [m.mouse[0] * W, m.mouse[1] * H]; g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8; g.shadowOffsetY = 4;
          const gr = g.createRadialGradient(mx - 6, my - 14, 2, mx, my, 34); gr.addColorStop(0, '#3a3f44'); gr.addColorStop(1, '#0d0f11'); g.fillStyle = gr;
          g.beginPath(); g.ellipse(mx, my, 20, 34, 0, 0, Math.PI * 2); g.fill(); g.restore(); g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(mx, my - 32); g.lineTo(mx, my - 10); g.stroke(); }
      }, 'mat', 0.6);
      if (rgb) { const e2 = el('rv-q rv-rgbedge'); quad(e2, W, H, m.q); }
      void c;
    }
    function caseItems() {
      const list = opt.earned.map(id => RT.TROPHIES.find(t => t.id === id)).filter(Boolean);
      if (T.pins) T.pins.forEach(([x, y], i) => { const t = list[i]; if (t) el('rv-pin', pin(t.art), `left:${x - 16}px;top:${y}px`); });
      (T.case || []).forEach(([x, y, ppm], i) => { const t = list[i]; if (t) cut(x, y, (t.art.startsWith('fig') ? 0.24 : 0.2) * ppm, `assets/room/items/${t.art}.webp`, 'trophy'); });
    }

    // -------- the hologram on the Command deck pedestal
    function holo(h, it) {
      const w = el('rv-holo', '<div class="cone"></div>', `left:${h.x - h.w / 2}px;top:${h.y - h.h}px;width:${h.w}px;height:${h.h}px`);
      const add = html => w.insertAdjacentHTML('beforeend', html);
      if (it.id === 'holo-syntax') add('<img class="fig" src="assets/boss/syntax-error.webp" alt="">');
      if (it.id === 'holo-operator') add('<img class="fig op" src="assets/room/items/operator.webp" alt="">');
      if (it.id === 'holo-ctrl') add(`<div class="emb">${svg(68, 68, `<g transform="translate(2 2)" color="#8ff4ff">${EMBLEM('currentColor', '#8ff4ff')}</g>`)}</div>`);
      if (it.id === 'holo-rush') { add(['siege', 'warden', 'colossus', 'king', 'half', 'brute'].map((f, i) => `<img class="fig rush" style="animation-delay:${i * 3}s" src="assets/room/items/fig-${f}.webp" alt="">`).join('')); }
      if (it.id === 'holo-earth') {
        const c = document.createElement('canvas'); c.width = c.height = 300; c.className = 'earth'; w.append(c);
        const cx = c.getContext('2d'); let el0 = -1; drawEarth(cx, 300, 300, 1); ticks.push(t => { if (t - el0 > 0.05) { el0 = t; drawEarth(cx, 300, 300, t); } });
      }
      if (it.id === 'holo-wing') add(`<div class="emb wing">${svg(100, 100, RA.mark(4, 4, 92, 92, 'fill="#bff8ff"', true))}</div>`);
      if (it.id === 'holo-kb') add('<img class="fig kb" src="assets/room/items/top-kb-aula-f99.webp" alt="">');
      if (it.id === 'holo-bots') add(['orbit', 'pixel', 'nova', 'kite', 'beep', 'raze'].map((f, i) => `<img class="fig rush" style="animation-delay:${i * 3}s" src="assets/room/items/pet-${f}.webp" alt="">`).join(''));
      add('<div class="lines"></div>');
    }

    // -------- slots you can click, in the edit view
    function hits(slots) {
      for (const sl of slots) {
        let h;
        const a = sl.at, k = sl.kind;
        if (k === 'view') { const [x, y, w, hh] = T.glass; h = el('rv-hit', '', `left:${x}px;top:${y}px;width:${w}px;height:${hh}px`); }
        else if (k === 'screen' || k === 'wall') { h = el('rv-q rv-hit q'); quad(h, 480, 270, a.q); }
        else if (k === 'poster') { h = el('rv-q rv-hit q'); quad(h, 300, 450, a); }
        else if (k === 'banner') { h = el('rv-q rv-hit q'); quad(h, 200, 300, a.q); }
        else if (k === 'light') { const [x, y, w, hh] = a.zones[0]; h = el('rv-hit round', '', `left:${x - w * 0.3}px;top:${y - hh * 0.3}px;width:${w * 0.6}px;height:${hh * 0.6}px`); }
        else if (k === 'shelf' || k === 'desk') { const [x, y, ppm] = a, w = Math.max(30, ppm * 0.26), hh = Math.max(36, ppm * 0.38); h = el('rv-hit spot', '', `left:${x - w / 2}px;top:${y - hh}px;width:${w}px;height:${hh}px`); }
        else if (k === 'holo') h = el('rv-hit', '', `left:${a.x - a.w * 0.35}px;top:${a.y - a.h}px;width:${a.w * 0.7}px;height:${a.h}px`);
        else if (k === 'pet') { const [x, y, ppm] = a.sit, w = ppm * 0.5, hh = ppm * 0.32; h = el('rv-hit spot', '', `left:${x - w / 2}px;top:${y - hh}px;width:${w}px;height:${hh}px`); }
        else if (k === 'sign' || k === 'plate' || k === 'rug') { h = el('rv-q rv-hit q'); quad(h, 300, 200, a); }
        else if (k === 'mat' || k === 'kb') { if (k === 'kb') continue; h = el('rv-q rv-hit q'); quad(h, 300, 100, a.q); }
        if (!h) continue;
        h.dataset.slot = sl.id; h.dataset.kind = k;
        if (k === 'mat') h.dataset.also = 'kb';
        h.setAttribute('role', 'button'); h.tabIndex = -1;
        h.setAttribute('aria-label', (sl.name || RT.kind(k).name) + '');
        h.addEventListener('click', ev => { ev.stopPropagation(); if (opt.onSlot) opt.onSlot(sl); });
      }
      if (T.case || T.pins) {
        const pts = T.case || T.pins.map(([x, y]) => [x, y + 40, 150]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const hh = el('rv-hit spot', '', `left:${Math.min(...xs) - 26}px;top:${Math.min(...ys) - 46}px;width:${Math.max(...xs) - Math.min(...xs) + 52}px;height:${Math.max(...ys) - Math.min(...ys) + 52}px`);
        hh.dataset.slot = 'case'; hh.dataset.kind = 'case'; hh.setAttribute('aria-label', 'Achievements');
        hh.addEventListener('click', ev => { ev.stopPropagation(); if (opt.onSlot) opt.onSlot({ id: 'case', kind: 'case' }); });
      }
    }
    function select(id) {
      sel = id;
      room.querySelectorAll('.rv-hit').forEach(h => h.classList.toggle('on', !!id && (h.dataset.slot === id || h.dataset.kind === id || h.dataset.also === id)));
    }

    // -------- fitting the picture to the host, and the mouse parallax
    function fit() {
      if (!T) return;
      const cw = box.clientWidth || host.clientWidth, ch = box.clientHeight || host.clientHeight;
      if (opt.fit === 'width') { s = cw / T.w; box.style.height = Math.round(T.h * s) + 'px'; ox = 0; oy = 0; }
      else if (opt.fit === 'height') { s = ch / T.h; box.style.width = Math.round(T.w * s) + 'px'; ox = 0; oy = 0; }
      else { s = Math.max(cw / T.w, ch / T.h); ox = (cw - T.w * s) * T.focus; oy = (ch - T.h * s) * 0.45; }
      if (!opt.still && bg.srcset) bg.sizes = Math.round(T.w * s) + 'px';
      place();
      if (glassCv) glassCv.paint();
    }
    function place() {
      const k = motion() && opt.fit === 'cover' ? 1.015 : 1;
      const cw = box.clientWidth, ch = box.clientHeight;
      const dx = motion() && opt.fit === 'cover' ? -par.x * cw * 0.006 : 0, dy = motion() && opt.fit === 'cover' ? -par.y * ch * 0.006 : 0;
      // zoomed a touch around the middle, so the parallax never shows an edge
      const zx = (cw / 2 - ox) * (1 - k), zy = (ch / 2 - oy) * (1 - k);
      room.style.transform = `translate(${(ox + zx + dx).toFixed(2)}px,${(oy + zy + dy).toFixed(2)}px) scale(${(s * k).toFixed(5)})`;
    }
    const onMove = ev => { const r = box.getBoundingClientRect(); par.tx = ((ev.clientX - r.left) / r.width - 0.5) * 2; par.ty = ((ev.clientY - r.top) / r.height - 0.5) * 2; };
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerleave', () => { par.tx = par.ty = 0; });
    const ro = new ResizeObserver(() => fit()); ro.observe(box);
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) loop(); }); io.observe(box);
    const onVis = () => { if (!document.hidden) loop(); };
    document.addEventListener('visibilitychange', onVis);

    // one frame loop for the window's rain, the Earth hologram and the parallax, at 30 fps
    function loop() {
      if (raf || disposed) return;
      if (!motion()) { ticks.forEach(f => f(2)); return; }
      let last = 0;
      const frame = now => {
        raf = 0;
        if (disposed || document.hidden || !visible) return;
        raf = requestAnimationFrame(frame);
        if (now - last < 33) return;
        last = now; lastT = now / 1000;
        par.x += (par.tx - par.x) * 0.08; par.y += (par.ty - par.y) * 0.08;
        place();
        for (const f of ticks) f(lastT);
      };
      raf = requestAnimationFrame(frame);
    }

    build();
    return {
      el: box,
      set(n) { const re = n.tier !== undefined && n.tier !== opt.tier; opt = { ...opt, ...n }; if (re) sel = null; build(); },
      preview(slot, item) { previewing = slot ? { slot, item } : null; build(); },
      select(id) { select(id); },
      fit,
      get tier() { return opt.tier; },
      dispose() { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); box.remove(); },
    };
  }

  // ------------------------------------------------------------------ the picture on a shop card
  const toUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  // an SVG with <image> links has to carry the pictures inside it to show in an <img>
  async function inline(s) {
    const hrefs = [...new Set([...s.matchAll(/href="([^"]+\.webp)"/g)].map(m => m[1]))];
    for (const h of hrefs) {
      try { const b = await (await fetch(h)).blob(); const u = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); s = s.split(`href="${h}"`).join(`href="${u}"`); } catch (e) {}
    }
    return s;
  }
  const DEMO = { name: 'You', level: 12, xp: 0.4, best: 96, avg: 88, acc: 96.4, dmgS: '1.2M', runs: [62, 70, 66, 74, 80, 77, 85, 90, 88, 96], board: [['jolt_arc93', 188], ['nim_ri61', 176], ['You', 171, true], ['reef_arc29', 160]], phase: 3, bossHp: 612480,
    streak: [...Array(35)].map((_, i) => (i * 7) % 5 > 1), streakN: 9, miss: { e: 0.05, r: 0.02, t: 0.08, a: 0.01, s: 0.04, x: 0.09 }, rush: { bosses: 7, score: 48200, beat: ['spam', 'siege', 'sign', 'warden', 'announcer', 'colossus', 'press'] }, online: 24 };
  // every shop picture is a 4:3 scene: the item on a dark stage, never cropped
  const strip = x => x.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const nest = (x, X, Y, W, H, vw, vh) => `<svg x="${X}" y="${Y}" width="${W}" height="${H}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet"><g font-family="${MONO}">${strip(x)}</g></svg>`;
  const STAGE = `<defs><radialGradient id="stg" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="#13261b"/><stop offset="1" stop-color="#040806"/></radialGradient></defs><rect width="400" height="300" fill="url(#stg)"/>`;
  async function thumb(it) {
    if (it.art) {
      const im = await loadImg(it.art), c = document.createElement('canvas'); c.width = 400; c.height = 300;
      const x = c.getContext('2d'), g = x.createRadialGradient(200, 130, 10, 200, 150, 260);
      g.addColorStop(0, '#13261b'); g.addColorStop(1, '#040806'); x.fillStyle = g; x.fillRect(0, 0, 400, 300);
      const k = Math.min(300 / im.width, 220 / im.height), w = im.width * k, h = im.height * k;
      const sh = x.createRadialGradient(200, 262, 2, 200, 262, w * 0.6); sh.addColorStop(0, 'rgba(0,0,0,.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = sh; x.fillRect(0, 240, 400, 50);
      x.drawImage(im, 200 - w / 2, 262 - h, w, h);
      return c.toDataURL('image/webp', 0.86);
    }
    if (it.type === 'poster' && POSTERS[it.id]) return toUrl(await inline(svg(400, 300, `${STAGE}<rect x="137" y="22" width="126" height="256" fill="#15191b"/>${nest(POSTERS[it.id](), 145, 30, 110, 240, 300, 450)}`)));
    if (it.type === 'screen' && SCREENS[it.id]) return toUrl(svg(400, 300, `${STAGE}<rect x="34" y="52" width="332" height="196" rx="6" fill="#0b0d0e" stroke="#2a2f32" stroke-width="2"/>${nest(SCREENS[it.id](DEMO).replace(/class="[^"]*"/g, ''), 44, 62, 312, 176, 480, 270)}<rect x="186" y="248" width="28" height="22" fill="#15181a"/><rect x="150" y="268" width="100" height="6" rx="3" fill="#15181a"/>`));
    if (it.type === 'sign' || it.type === 'plate' || it.type === 'rug' || it.type === 'mat') {
      const [w, h] = { sign: [300, 140], plate: [300, 80], rug: [300, 200], mat: [360, 120] }[it.type], f = flatArt(it, DEMO).replace(/^<div[^>]*>|<\/div>$/g, '');
      const glow = it.type === 'sign' ? `<filter id="tg"><feGaussianBlur stdDeviation="6"/></filter><g filter="url(#tg)" opacity=".8">${nest(f, 40, 80, 320, 140, w, h)}</g>` : '';
      return toUrl(svg(400, 300, `${it.type === 'sign' ? '<rect width="400" height="300" fill="#0b0d0e"/>' : STAGE}${glow}${it.type === 'rug' || it.type === 'mat' ? `<g transform="translate(200 160) scale(1 .62) rotate(-8) translate(-160 -110)">${nest(f, 0, 0, 320, 220, w, h)}</g>` : nest(f, 40, 80, 320, 140, w, h)}`));
    }
    if (it.type === 'banner') { const B = BANNERS[it.id]; return toUrl(svg(400, 300, `${STAGE}<path d="M140 30h120v240l-60-22-60 22z" fill="#1d2124"/>${B.full ? nest(B.svg(), 140, 30, 120, 200, 100, 100) : nest(B.svg(), 160, 70, 80, 80, 68, 68)}`)); }
    if (it.type === 'holo') {
      const src = { 'holo-syntax': 'assets/boss/syntax-error.webp', 'holo-operator': 'assets/room/items/operator.webp', 'holo-rush': 'assets/room/items/fig-siege.webp', 'holo-bots': 'assets/room/items/pet-orbit.webp', 'holo-kb': 'assets/room/items/top-kb-aula-f99.webp' }[it.id];
      const body = src ? img(src, 110, 40, 180, 210, 'preserveAspectRatio="xMidYMax meet" style="filter:url(#hf)"') : it.id === 'holo-wing' ? RA.mark(130, 50, 140, 180, 'fill="#bff8ff"') : it.id === 'holo-ctrl' ? `<g transform="translate(144 70) scale(1.75)" color="#8ff4ff">${EMBLEM('currentColor', '#8ff4ff')}</g>` : `<circle cx="200" cy="140" r="78" fill="#3ee6ff" fill-opacity=".12" stroke="#8ff4ff" stroke-width="2"/><ellipse cx="200" cy="140" rx="32" ry="78" fill="none" stroke="#8ff4ff" stroke-opacity=".6"/><path d="M122 140H278M130 105H270M130 175H270" stroke="#8ff4ff" stroke-opacity=".5"/>`;
      return toUrl(await inline(svg(400, 300, `<defs><filter id="hf"><feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .95  0 0 0 0 1  .33 .33 .33 0 0"/></filter><linearGradient id="hc" x2="0" y2="1"><stop offset="0" stop-color="#3ee6ff" stop-opacity="0"/><stop offset="1" stop-color="#3ee6ff" stop-opacity=".35"/></linearGradient></defs><rect width="400" height="300" fill="#04121a"/><path d="M90 20h220l-60 250h-100z" fill="url(#hc)"/><ellipse cx="200" cy="272" rx="70" ry="10" fill="#3ee6ff" fill-opacity=".55"/>${body}`)));
    }
    const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d');
    if (it.type === 'view') {
      if (it.scene) { const sc = RoomScenes.SCENES[it.scene], b = await sceneArt(it.scene, true); x.drawImage(b, 0, 0, 400, 300); if (sc.layer) { const l = document.createElement('canvas'); l.width = OW; l.height = OH; sc.layer(RoomScenes.K.rng(7))(l.getContext('2d'), OW, OH, 3); x.globalAlpha = sc.fade || 0.7; x.drawImage(l, 0, 0, 400, 300); x.globalAlpha = 1; } }
      // the room's own city: a piece of the Ops den's window, bars and all
      else { const im = await loadImg('assets/room/tiers/t3-m.webp'); x.drawImage(im, 512, 220, 196, 147, 0, 0, 400, 300); return c.toDataURL('image/webp', 0.86); }
      x.strokeStyle = '#1a1e1c'; x.lineWidth = 14; x.strokeRect(0, 0, 400, 300); x.lineWidth = 8; x.beginPath(); x.moveTo(200, 0); x.lineTo(200, 300); x.moveTo(0, 150); x.lineTo(400, 150); x.stroke();
    } else if (it.type === 'accent' || it.type === 'walls' || it.type === 'mood') {
      x.fillStyle = '#07100c'; x.fillRect(0, 0, 400, 300);
      if (it.sw && !it.sw.startsWith('#')) { const lg = x.createLinearGradient(40, 0, 360, 0); const cs = it.sw.match(/#[0-9a-f]{6}/gi) || ['#222', '#444']; cs.forEach((cc, i) => lg.addColorStop(i / Math.max(1, cs.length - 1), cc)); x.fillStyle = lg; }
      else x.fillStyle = it.c || it.sw || '#2fe0c0';
      x.fillRect(40, 70, 320, 160);
    } else if (it.type === 'light') {
      x.fillStyle = '#07100c'; x.fillRect(0, 0, 400, 300);
      const col = it.sw && it.sw.startsWith('#') ? it.sw : it.c || '#2fe0c0';
      if (it.anim === 'rainbow') { const lg = x.createLinearGradient(60, 0, 340, 0); ['#ff4d5e', '#f2c230', '#39ff88', '#3ee6ff', '#b45cff'].forEach((cc, i) => lg.addColorStop(i / 4, cc)); x.fillStyle = lg; x.shadowColor = '#fff'; }
      else { const g = x.createRadialGradient(200, 150, 4, 200, 150, 190); g.addColorStop(0, col + '66'); g.addColorStop(1, 'transparent'); x.fillStyle = g; x.fillRect(0, 0, 400, 300); x.fillStyle = col; x.shadowColor = col; }
      x.shadowBlur = 28; x.fillRect(50, 140, 300, 18);
    } else return null;
    return c.toDataURL('image/webp', 0.86);
  }

  // the shop bar's small live pictures (DOM, not images): an SVG string scaled into a box
  // flat things and signs for a card, drawn small
  function flatArt(it, data) {
    if (!RA) return null;
    if (it.type === 'sign') return `<div class="nsign" style="--c:${it.c}">${RA.neon(it, 300, 140)}</div>`;
    if (it.type === 'plate') return RA.plate(it, data || DEMO, 300, 80);
    if (it.type === 'rug') return RA.rug(it, 300, 200);
    if (it.type === 'mat') return RA.mat(it, 360, 120);
    return null;
  }
  function art(it, data) {
    if (it.type === 'kb') return `<img src="${it.art}" alt="" loading="lazy" draggable="false" class="kbtop">`;
    if (it.art) return `<img src="${it.art}" alt="" loading="lazy" draggable="false">`;
    const f = flatArt(it, data); if (f) return f;
    if (it.type === 'poster' && POSTERS[it.id]) return POSTERS[it.id]();
    if (it.type === 'screen' && SCREENS[it.id]) return SCREENS[it.id](data || DEMO);
    if (it.type === 'banner') { const B = BANNERS[it.id]; return `<div class="ban${B.full ? ' full' : ''}">${B.svg()}</div>`; }
    return null;
  }

  return { create, thumb, art, DEMO, pin, quad, sub };
})();
