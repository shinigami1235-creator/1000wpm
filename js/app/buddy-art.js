// Tilde, the 10000WPM buddy: a small floating keycap with a screen for a face
// and a text caret for an antenna. Drawn in SVG from parts so poses blend into
// each other instead of swapping. BuddyArt.svg() draws one still (the review
// sheet in design/buddy-sheet.html uses it) and BuddyArt.create() makes the
// live character that buddy.js moves around the page.
window.BuddyArt = (() => {
  const C = {
    g: Theme.hex('accent'), gd: Theme.hex('accent-dim'), ink: Theme.hex('ink'), bg: Theme.hex('bg'), cy: '#3ee6ff', gold: '#f2c230', red: '#ff4d5e',
    capHi: '#2e8a58', capMid: '#1a5537', capLo: '#0c2c1c', top: '#3fae72', screen: '#03140b', screenEdge: '#0e3a24',
  };
  const EXPRESSIONS = ['happy', 'blink', 'wink', 'excited', 'proud', 'curious', 'thinking', 'surprised', 'sleepy', 'oops', 'dizzy', 'focused', 'love'];
  const POSES = ['idle', 'wave', 'point', 'cheer', 'type', 'think', 'lean', 'hop', 'sleep'];

  // ---------- poses ----------
  // Each arm is one cubic curve: shoulder, two control points, hand. Poses blend point by point.
  const ARMS = {
    idle:  { l: [[24, 66], [18, 70], [14, 76], [15, 84]], r: [[96, 66], [102, 70], [106, 76], [105, 84]] },
    wave:  { l: [[24, 66], [18, 70], [14, 76], [15, 84]], r: [[96, 64], [106, 60], [111, 50], [108, 37]] },
    point: { l: [[24, 66], [18, 70], [14, 76], [15, 84]], r: [[96, 66], [104, 66], [111, 65], [118, 63]] },
    cheer: { l: [[24, 62], [14, 56], [9, 46], [12, 33]], r: [[96, 62], [106, 56], [111, 46], [108, 33]] },
    type:  { l: [[24, 70], [21, 82], [28, 94], [39, 101]], r: [[96, 70], [99, 82], [92, 94], [81, 101]] },
    think: { l: [[24, 66], [18, 70], [14, 76], [15, 84]], r: [[96, 68], [101, 82], [90, 93], [77, 89]] },
    lean:  { l: [[24, 68], [25, 79], [31, 87], [39, 91]], r: [[96, 68], [95, 79], [89, 87], [81, 91]] },
    hop:   { l: [[24, 64], [15, 61], [9, 56], [5, 49]], r: [[96, 64], [105, 61], [111, 56], [115, 49]] },
    sleep: { l: [[24, 70], [19, 78], [19, 86], [23, 92]], r: [[96, 70], [101, 78], [101, 86], [97, 92]] },
  };
  // body tilt in degrees, lift in px (negative is up), glow pool width, keyboard and thruster opacity
  const NUM = {
    idle:  { tilt: 0, lift: 0, pool: 19, kb: 0, thrust: 1 },
    wave:  { tilt: -3, lift: -1, pool: 19, kb: 0, thrust: 1 },
    point: { tilt: 4, lift: 0, pool: 19, kb: 0, thrust: 1 },
    cheer: { tilt: 0, lift: -4, pool: 17, kb: 0, thrust: 1 },
    type:  { tilt: 0, lift: 1, pool: 21, kb: 1, thrust: 1 },
    think: { tilt: -7, lift: 0, pool: 19, kb: 0, thrust: 1 },
    lean:  { tilt: 9, lift: 3, pool: 21, kb: 0, thrust: 1 },
    hop:   { tilt: 0, lift: -11, pool: 13, kb: 0, thrust: 1 },
    sleep: { tilt: 13, lift: 9, pool: 27, kb: 0, thrust: 0 },
  };
  const armOf = p => ARMS[p] || ARMS.idle;
  const numOf = p => NUM[p] || NUM.idle;
  const f1 = n => n.toFixed(1);
  const curve = a => `M${f1(a[0][0])} ${f1(a[0][1])}C${f1(a[1][0])} ${f1(a[1][1])} ${f1(a[2][0])} ${f1(a[2][1])} ${f1(a[3][0])} ${f1(a[3][1])}`;

  // ---------- face ----------
  // The face is lit pixels on the screen, so every part is green except hearts and the sweat drop.
  const EL = 49, ER = 71, EY = 66, MX = 60, MY = 80;
  const line = (d, w = 2.6, col = C.g) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  function eyeOpen(x, y, s = 1, glint = true) {
    s *= 1.12;
    const w = 7 * s, h = 11 * s;
    return `<rect x="${f1(x - w / 2)}" y="${f1(y - h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(3.2 * s)}" fill="${C.g}"/>` +
      (glint ? `<rect x="${f1(x + w * 0.05)}" y="${f1(y - h / 2 + 1.6 * s)}" width="${f1(2 * s)}" height="${f1(3 * s)}" rx=".8" fill="${C.ink}"/>` : '');
  }
  const star = (x, y, s, col) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-8 2-2 8 0 2 2 0 8-2 2-8 0-2-2z" fill="${col}"/>`;
  const heart = (x, y, s, col) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 7C-11 0-9-9-4-9c2.5 0 4 1.6 4 3.2 0-1.6 1.5-3.2 4-3.2 5 0 7 9-4 16z" fill="${col}"/>`;
  const arcUp = x => line(`M${x - 4.5} ${EY + 2}q4.5-6 9 0`);
  const arcDown = x => line(`M${x - 4.5} ${EY + 1}q4.5 4.5 9 0`);
  const tilde = (w = 2.6) => line(`M${MX - 7} ${MY}q3.5-4 7 0t7 0`, w);
  const smile = () => line(`M${MX - 6} ${MY - 1.5}q6 6 12 0`);
  const smileOpen = (s = 1) => `<path d="M${f1(MX - 6 * s)} ${MY - 2}h${f1(12 * s)}q0 ${f1(7 * s)}-${f1(6 * s)} ${f1(7 * s)}t-${f1(6 * s)}-${f1(7 * s)}z" fill="${C.g}"/>`;
  const spiral = x => line(`M${x} ${EY}m-1.2 0a1.2 1.2 0 1 1 2.4 0a2.6 2.6 0 1 1-5.2 0a4 4 0 1 1 8 0`, 1.8);

  const FACES = {
    happy: () => eyeOpen(EL, EY) + eyeOpen(ER, EY) + smile(),
    blink: () => line(`M${EL - 4} ${EY + 1}h8`) + line(`M${ER - 4} ${EY + 1}h8`) + smile(),
    wink: () => arcUp(EL) + eyeOpen(ER, EY) + smileOpen(),
    excited: () => eyeOpen(EL, EY - 1, 1.22) + eyeOpen(ER, EY - 1, 1.22) + smileOpen(1.25),
    proud: () => arcUp(EL) + arcUp(ER) + line(`M${MX - 7} ${MY - 1}q8 5 14-2`),
    curious: () => eyeOpen(EL, EY - 1, 1.14) + eyeOpen(ER, EY + 1, 0.82) + `<circle cx="${MX + 2}" cy="${MY}" r="2.4" fill="${C.g}"/>`,
    thinking: () => eyeOpen(EL + 2, EY - 3, 0.9) + eyeOpen(ER + 2, EY - 3, 0.9) + tilde(),
    surprised: () => `<circle cx="${EL}" cy="${EY}" r="5" fill="none" stroke="${C.g}" stroke-width="2.4"/><circle cx="${ER}" cy="${EY}" r="5" fill="none" stroke="${C.g}" stroke-width="2.4"/>` +
      `<circle cx="${EL}" cy="${EY}" r="1.6" fill="${C.g}"/><circle cx="${ER}" cy="${EY}" r="1.6" fill="${C.g}"/><ellipse cx="${MX}" cy="${MY + 1}" rx="3" ry="4" fill="none" stroke="${C.g}" stroke-width="2.2"/>`,
    sleepy: () => arcDown(EL) + arcDown(ER) + `<ellipse cx="${MX}" cy="${MY + 1}" rx="2.4" ry="1.6" fill="${C.g}"/>`,
    oops: () => line(`M${EL - 4} ${EY - 4}l7 4-7 4`) + line(`M${ER + 4} ${EY - 4}l-7 4 7 4`) + line(`M${MX - 7} ${MY + 1}l2.3-2 2.3 2 2.3-2 2.3 2 2.3-2 2.3 2`, 2.2),
    dizzy: () => spiral(EL) + spiral(ER) + line(`M${MX - 6} ${MY + 1}q2-3 4 0t4 0t4 0`, 2.2),
    focused: () => `<rect x="${EL - 4.5}" y="${EY - 1}" width="9" height="5" rx="2" fill="${C.g}"/><rect x="${ER - 4.5}" y="${EY - 1}" width="9" height="5" rx="2" fill="${C.g}"/>` +
      line(`M${EL - 5} ${EY - 5}l10 2.4`, 2.2) + line(`M${ER + 5} ${EY - 5}l-10 2.4`, 2.2) + line(`M${MX - 5} ${MY + 1}h10`),
    love: () => heart(EL, EY + 1, 0.62, C.red) + heart(ER, EY + 1, 0.62, C.red) + smileOpen(),
  };
  // things drawn around the head: typing dots, sparkles, a sweat drop
  const EXTRAS = {
    excited: star(14, 30, 0.55, C.g) + star(104, 22, 0.42, C.cy),
    thinking: `<circle cx="90" cy="20" r="2.2" fill="${C.g}"/><circle cx="97" cy="20" r="2.2" fill="${C.g}" opacity=".7"/><circle cx="104" cy="20" r="2.2" fill="${C.g}" opacity=".45"/>`,
    surprised: line('M20 30l-6-5M17 41h-8M100 30l6-5', 2.2, C.gd),
    oops: `<path d="M98 36q4 6 0 9-4-3 0-9z" fill="${C.cy}"/>`,
    dizzy: star(30, 18, 0.34, C.g) + star(92, 14, 0.3, C.gold) + star(60, 2, 0.28, C.cy),
    love: heart(100, 24, 0.5, C.red),
    curious: `<text x="98" y="30" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700" fill="${C.g}">?</text>`,
  };
  const face = expr => `<g class="bd-eyes">${(FACES[expr] || FACES.happy)()}</g>`;

  // ---------- the drawing ----------
  let uid = 0;
  const KEYS = (() => {
    let s = '';
    for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) s += `<rect x="${33.5 + k * 6 + (r === 1 ? 1.5 : 0)}" y="${101 + r * 3.1}" width="4.6" height="2.2" rx=".5"/>`;
    return s;
  })();
  function markup(id, size, s) {
    const a = armOf(s.pose), n = numOf(s.pose);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}" class="bd-svg" overflow="visible" aria-hidden="true">
  <defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.capHi}"/><stop offset=".45" stop-color="${C.capMid}"/><stop offset="1" stop-color="${C.capLo}"/></linearGradient>
    <radialGradient id="${id}f" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="#072a17"/><stop offset="1" stop-color="${C.screen}"/></radialGradient>
    <radialGradient id="${id}p" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${C.g}" stop-opacity=".55"/><stop offset="1" stop-color="${C.g}" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse data-k="pool" cx="60" cy="114" rx="${n.pool}" ry="4.5" fill="url(#${id}p)"/>
  <g data-k="tilt" transform="translate(0 ${n.lift}) rotate(${n.tilt} 60 72)">
    <g data-k="thrust" opacity="${n.thrust}"><ellipse cx="60" cy="103" rx="15" ry="2.6" fill="${C.g}" opacity=".35"/><path d="M50 104h20" stroke="${C.ink}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></g>
    <g data-k="caret" class="bd-caret"><rect x="55.5" y="6" width="9" height="20" rx="3" fill="${C.g}" opacity=".18"/><rect x="58" y="8" width="4" height="16" rx="1.2" fill="${C.g}"/></g>
    <path d="M35 29H85Q90 29 91.5 34L93 40H27L28.5 34Q30 29 35 29Z" fill="${C.top}"/>
    <path d="M37 31.5H83" stroke="${C.ink}" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M37.5 34.5q2-2 4 0t4 0" fill="none" stroke="${C.bg}" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M27 40H93L99.5 91Q100.5 99 92.5 99H27.5Q19.5 99 20.5 91Z" fill="url(#${id}s)"/>
    <path d="M27 40H93L99.5 91Q100.5 99 92.5 99H27.5Q19.5 99 20.5 91Z" fill="none" stroke="${C.g}" stroke-width="1.6" stroke-opacity=".9" stroke-linejoin="round"/>
    <path d="M27.6 41.2H92.4" stroke="${C.g}" stroke-opacity=".55" stroke-width="1.2"/>
    <rect x="31" y="46" width="58" height="45" rx="8" fill="url(#${id}f)" stroke="${C.screenEdge}" stroke-width="1.5"/>
    <g data-k="look"><g data-k="face">${face(s.expr)}</g></g>
    <path d="M34.5 50q6-2.4 14-2" fill="none" stroke="${C.ink}" stroke-opacity=".16" stroke-width="2" stroke-linecap="round"/>
    <g data-k="kb" opacity="${n.kb}"><rect x="29" y="98" width="62" height="13" rx="2.4" fill="#06120c" stroke="${C.g}" stroke-width="1.3"/><g fill="${C.gd}">${KEYS}</g></g>
    <path data-k="armL" d="${curve(a.l)}" fill="none" stroke="${C.g}" stroke-width="3.4" stroke-linecap="round"/>
    <path data-k="armR" d="${curve(a.r)}" fill="none" stroke="${C.g}" stroke-width="3.4" stroke-linecap="round"/>
    <circle data-k="handL" cx="${a.l[3][0]}" cy="${a.l[3][1]}" r="3.8" fill="${C.ink}" stroke="${C.g}" stroke-width="1.3"/>
    <circle data-k="handR" cx="${a.r[3][0]}" cy="${a.r[3][1]}" r="3.8" fill="${C.ink}" stroke="${C.g}" stroke-width="1.3"/>
  </g>
  <g data-k="extras">${EXTRAS[s.expr] || ''}</g>
</svg>`;
  }

  // one still drawing
  function svg({ expr = 'happy', pose = 'idle', size = 160, look = [0, 0] } = {}) {
    const host = document.createElement('div');
    host.innerHTML = markup('bd' + (++uid), size, { expr, pose });
    host.querySelector('[data-k=look]').setAttribute('transform', `translate(${look[0] * 3} ${look[1] * 2.4})`);
    return host.innerHTML;
  }

  // the live character: poses blend with a soft overshoot, faces cross-fade, eyes follow and blink
  function create(el, size, opts = {}) {
    const id = 'bd' + (++uid);
    el.innerHTML = markup(id, size, { expr: 'happy', pose: 'idle' });
    const q = k => el.querySelector(`[data-k=${k}]`);
    const k = { pool: q('pool'), tilt: q('tilt'), thrust: q('thrust'), kb: q('kb'), armL: q('armL'), armR: q('armR'), handL: q('handL'), handR: q('handR'), look: q('look'), face: q('face'), extras: q('extras') };
    const reduce = () => opts.reduce ? opts.reduce() : matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clone = a => ({ l: a.l.map(p => p.slice()), r: a.r.map(p => p.slice()) });
    // dir -1 mirrors the arms and the tilt so it can point or lean left; the face never flips
    const mirror = a => ({ l: a.r.map(p => [120 - p[0], p[1]]), r: a.l.map(p => [120 - p[0], p[1]]) });
    const armFor = (pose, dir) => dir < 0 ? mirror(ARMS[pose]) : clone(ARMS[pose]);
    const numFor = (pose, dir) => ({ ...NUM[pose], tilt: NUM[pose].tilt * dir });
    let cur = { pose: 'idle', dir: 1, expr: 'happy', arm: clone(ARMS.idle), n: { ...NUM.idle } };
    let from = null, to = null, t0 = 0, dur = 380, raf = 0;
    let look = [0, 0], lookT = [0, 0];
    const ease = x => { const c = 1.3; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
    const lerp = (a, b, t) => a + (b - a) * t;
    const lerpArm = (A, B, t) => ({ l: A.l.map((p, i) => [lerp(p[0], B.l[i][0], t), lerp(p[1], B.l[i][1], t)]), r: A.r.map((p, i) => [lerp(p[0], B.r[i][0], t), lerp(p[1], B.r[i][1], t)]) });

    function paint() {
      const a = cur.arm, n = cur.n;
      k.armL.setAttribute('d', curve(a.l)); k.armR.setAttribute('d', curve(a.r));
      k.handL.setAttribute('cx', f1(a.l[3][0])); k.handL.setAttribute('cy', f1(a.l[3][1]));
      k.handR.setAttribute('cx', f1(a.r[3][0])); k.handR.setAttribute('cy', f1(a.r[3][1]));
      k.tilt.setAttribute('transform', `translate(0 ${f1(n.lift)}) rotate(${f1(n.tilt)} 60 72)`);
      k.pool.setAttribute('rx', f1(n.pool));
      k.kb.setAttribute('opacity', Math.max(0, Math.min(1, n.kb)).toFixed(2));
      k.thrust.setAttribute('opacity', Math.max(0, Math.min(1, n.thrust)).toFixed(2));
      k.look.setAttribute('transform', `translate(${f1(look[0] * 3)} ${f1(look[1] * 2.4)})`);
    }
    function frame(now) {
      raf = 0; let busy = false;
      if (to) {
        const x = Math.max(0, Math.min(1, (now - t0) / dur)), e = ease(x), lin = Math.min(1, x * 1.4);
        cur.arm = lerpArm(from.arm, to.arm, e);
        cur.n = { tilt: lerp(from.n.tilt, to.n.tilt, e), lift: lerp(from.n.lift, to.n.lift, e), pool: lerp(from.n.pool, to.n.pool, lin),
          kb: lerp(from.n.kb, to.n.kb, lin), thrust: lerp(from.n.thrust, to.n.thrust, lin) };
        if (x >= 1) { cur.arm = clone(to.arm); cur.n = { ...to.n }; to = null; } else busy = true;
      }
      const dx = lookT[0] - look[0], dy = lookT[1] - look[1];
      if (Math.abs(dx) + Math.abs(dy) > 0.01) { look = [look[0] + dx * 0.18, look[1] + dy * 0.18]; busy = true; }
      paint();
      if (busy) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    function setFace(expr) {
      if (expr === cur.expr || !FACES[expr]) return;
      cur.expr = expr;
      const old = k.face, neu = old.cloneNode(false);
      neu.innerHTML = face(expr);
      if (reduce()) { old.replaceWith(neu); k.face = neu; k.extras.innerHTML = EXTRAS[expr] || ''; return; }
      neu.style.opacity = 0; neu.style.transition = old.style.transition = 'opacity .14s ease';
      old.after(neu); k.face = neu;
      requestAnimationFrame(() => { neu.style.opacity = 1; old.style.opacity = 0; });
      setTimeout(() => old.remove(), 200);
      const ex = k.extras; ex.style.transition = 'opacity .14s ease'; ex.style.opacity = 0;
      setTimeout(() => { ex.innerHTML = EXTRAS[cur.expr] || ''; ex.style.opacity = 1; }, 140);
    }
    function setPose(pose, ms, dir) {
      dir = dir || cur.dir;
      if (!ARMS[pose] || (pose === cur.pose && dir === cur.dir && !to)) return;
      cur.pose = pose; cur.dir = dir;
      from = { arm: cur.arm, n: cur.n }; to = { arm: armFor(pose, dir), n: numFor(pose, dir) };
      dur = reduce() ? 1 : (ms || 380); t0 = performance.now(); kick();
    }
    return {
      set({ expr, pose, ms, dir } = {}) { if (expr) setFace(expr); if (pose || dir) setPose(pose || cur.pose, ms, dir); },
      look(x, y) { lookT = [x, y]; if (reduce()) look = lookT.slice(); kick(); },
      // a blink swaps in the closed eyes for a moment, so the mouth stays put
      blink() {
        if (cur.expr !== 'happy' || to) return;
        const f = k.face;
        f.innerHTML = face('blink');
        setTimeout(() => { if (k.face === f && cur.expr === 'happy') f.innerHTML = face('happy'); }, 120);
      },
      get pose() { return cur.pose; }, get expr() { return cur.expr; }, get dir() { return cur.dir; },
    };
  }

  return { EXPRESSIONS, POSES, svg, create, COLORS: C };
})();
