// Typo Horde plays like Typing of the Dead. Typos walk toward the player and the
// word over each one shoots it. The first letter picks the target and each
// correct letter after it fires a shot.
(() => {
  const box = document.getElementById('horde-box');
  const cv = box.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const W = 960, H = 540, HORIZON = 200, FLOOR = H - 10;
  const C = {
    bg: '#121315', wall: '#1a1b1e', floor: '#1d1e21', line: '#2a2b30',
    ink: '#ecebe6', ink2: '#a3a29c', accent: '#f2c230', bad: '#e5604f',
    body: [92, 104, 92], boss: [120, 84, 74], fog: [18, 19, 21],
  };
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const SANS = '"Archivo", system-ui, sans-serif';

  let dpr = 1;
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || W;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * 9 / 16 * dpr);
  }
  fit();
  addEventListener('resize', fit);

  // ---------- state ----------
  let state = 'title';     // title | play | wave | over
  let foes = [], parts = [], shots = [];
  let target = null, wave = 0, queue = [], spawnT = 0, bannerT = 0;
  let hearts = 3, score = 0, combo = 0, bestCombo = 0;
  let keys = 0, hits = 0, chars = 0, playMs = 0;
  let shake = 0, hurt = 0, missFlash = 0;
  let focused = false, visible = false;
  const best = () => TT.store.get('wpm-horde-best', 0);

  function newGame() {
    foes = []; parts = []; shots = []; target = null;
    wave = 0; hearts = 3; score = 0; combo = 0; bestCombo = 0;
    keys = 0; hits = 0; chars = 0; playMs = 0;
    nextWave();
  }
  function nextWave() {
    wave++;
    const n = 4 + wave * 2;
    queue = [];
    for (let i = 0; i < n; i++) queue.push('foe');
    if (wave % 3 === 0) queue.push('boss');
    spawnT = 0.6;
    state = 'wave';
    bannerT = 1.6;
  }
  function pickWord() {
    const min = Math.min(3 + Math.floor(wave / 2), 7);
    const max = Math.min(5 + wave, 11);
    const used = new Set(foes.filter(f => !f.dead).map(f => f.word[0]));
    let w = TT.wordOfLength(min, max);
    for (let i = 0; i < 25 && used.has(w[0]); i++) w = TT.wordOfLength(min, max);
    return w;
  }
  function spawn(kind) {
    const boss = kind === 'boss';
    const word = boss ? TT.randomWords(3 + Math.min(3, Math.floor(wave / 3))).join(' ') : pickWord();
    const secs = boss ? 26 : Math.max(5.2, 12.5 - wave * 0.7) * (0.85 + Math.random() * 0.3);
    foes.push({
      word, typed: 0, boss,
      x: (Math.random() * 1.3 - 0.65),
      z: 1, speed: 1 / secs,
      phase: Math.random() * 6, flash: 0, dead: false, deadT: 0,
    });
  }

  // ---------- projection ----------
  const proj = z => 0.4 / (0.4 + Math.max(0, z) * 2.2);
  function screen(f) {
    const p = proj(f.z);
    return {
      p,
      x: W / 2 + f.x * W * 0.5 * (0.45 + 0.55 * p),
      y: HORIZON + p * (FLOOR - HORIZON),
      h: (f.boss ? 1.35 : 1) * 420 * p,
    };
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;

  // ---------- input ----------
  function shoot(f) {
    const s = screen(f);
    shots.push({ x: s.x + (Math.random() - .5) * s.h * .1, y: s.y - s.h * 0.6, t: 0.07 });
    f.flash = 0.08;
    f.z = Math.min(1, f.z + 0.006);
  }
  function kill(f) {
    f.dead = true; f.deadT = 0.45;
    combo++; bestCombo = Math.max(bestCombo, combo);
    score += Math.round(f.word.length * 10 * (1 + Math.floor(combo / 5) * 0.5) * (f.boss ? 3 : 1));
    const s = screen(f);
    const col = f.boss ? C.boss : C.body;
    for (let i = 0; i < 18; i++) {
      parts.push({ x: s.x, y: s.y - s.h * 0.6, vx: (Math.random() - .5) * 500 * s.p + (Math.random() - .5) * 120,
        vy: -Math.random() * 380 * s.p - 60, r: 2 + Math.random() * 6 * s.p, t: 0.7, col });
    }
    target = null;
    TT.click(true);
  }
  function onChar(ch) {
    if (state !== 'play' && state !== 'wave') return;
    ch = ch.toLowerCase();
    keys++;
    if (!target) {
      const cand = foes.filter(f => !f.dead && f.word[0] === ch).sort((a, b) => a.z - b.z)[0];
      if (!cand) { combo = 0; missFlash = 0.15; return; }
      target = cand;
    }
    if (target.word[target.typed] === ch) {
      target.typed++; hits++; chars++;
      shoot(target);
      TT.click(false);
      if (target.typed >= target.word.length) kill(target);
    } else {
      combo = 0; missFlash = 0.15;
    }
  }
  TT.captureKeys(box, {
    label: 'Typo Horde game',
    onChar,
    onBack() { if (target) { target.typed = 0; target = null; } },
    onKey(k) {
      if (k === 'Enter' && (state === 'title' || state === 'over')) newGame();
      if (k === 'Escape' && target) { target.typed = 0; target = null; }
    },
  });
  box.addEventListener('pointerup', () => { if (state === 'title' || state === 'over') newGame(); });
  box.addEventListener('focusin', () => { focused = true; });
  box.addEventListener('focusout', () => { focused = false; });

  // ---------- update ----------
  function update(dt) {
    shake = Math.max(0, shake - dt); hurt = Math.max(0, hurt - dt); missFlash = Math.max(0, missFlash - dt);
    for (const s of shots) s.t -= dt;
    shots = shots.filter(s => s.t > 0);
    for (const p of parts) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; }
    parts = parts.filter(p => p.t > 0);
    if (state === 'title' || state === 'over') return;
    playMs += dt * 1000;

    if (state === 'wave') { bannerT -= dt; if (bannerT <= 0) state = 'play'; }
    spawnT -= dt;
    if (queue.length && spawnT <= 0) {
      spawn(queue.shift());
      spawnT = Math.max(0.7, 2.4 - wave * 0.15) * (0.7 + Math.random() * 0.6);
    }
    for (const f of foes) {
      f.phase += dt * (f.boss ? 4 : 6);
      f.flash = Math.max(0, f.flash - dt);
      if (f.dead) { f.deadT -= dt; continue; }
      f.z -= f.speed * dt;
      if (f.z <= 0) {
        f.dead = true; f.deadT = 0; f.bit = true;
        if (target === f) target = null;
        hearts--; combo = 0; shake = 0.35; hurt = 0.4;
        TT.click(true);
        if (hearts <= 0) {
          state = 'over';
          TT.store.set('wpm-horde-best', Math.max(best(), score));
        }
      }
    }
    foes = foes.filter(f => !f.dead || f.deadT > 0);
    if (state === 'play' && !queue.length && !foes.length) nextWave();
  }

  // ---------- draw ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  function drawScene(t) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // back wall and floor
    ctx.fillStyle = C.wall; ctx.fillRect(0, 60, W, HORIZON - 60);
    ctx.fillStyle = C.floor; ctx.fillRect(0, HORIZON, W, H - HORIZON);
    // ceiling lamps
    for (let i = 0; i < 4; i++) {
      const x = 120 + i * 240;
      ctx.fillStyle = '#2b2c30'; ctx.fillRect(x - 40, 60, 80, 6);
      const g = ctx.createLinearGradient(0, 66, 0, HORIZON);
      g.addColorStop(0, 'rgba(236,235,230,0.07)'); g.addColorStop(1, 'rgba(236,235,230,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 40, 66); ctx.lineTo(x + 40, 66); ctx.lineTo(x + 90, HORIZON); ctx.lineTo(x - 90, HORIZON); ctx.fill();
    }
    // floor lines toward the vanishing point
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(W / 2 + i * 22, HORIZON); ctx.lineTo(W / 2 + i * 260, H); ctx.stroke();
    }
    const scroll = (t * 0.04) % 1;
    for (let k = 0; k < 10; k++) {
      const z = 1 - ((k / 10 + scroll) % 1);
      const y = HORIZON + proj(z) * (FLOOR - HORIZON);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.fillStyle = '#0e0f10'; ctx.fillRect(0, 0, W, 60);
  }

  function drawFoe(f) {
    const s = screen(f);
    const fog = Math.min(0.85, f.z * 0.9);
    let col = mix(f.boss ? C.boss : C.body, C.fog, fog);
    if (f.flash > 0) col = mix(col, [236, 235, 230], 0.7);
    const h = s.h, x = s.x, y = s.y;
    const sway = Math.sin(f.phase) * h * 0.03;
    ctx.save();
    if (f.dead) {
      const k = 1 - Math.max(0, f.deadT) / 0.45;
      ctx.globalAlpha = 1 - k;
      ctx.translate(x, y); ctx.rotate(k * 0.9 * (f.x > 0 ? 1 : -1)); ctx.translate(-x, -y);
    }
    ctx.fillStyle = rgb(col); ctx.strokeStyle = rgb(col); ctx.lineCap = 'round';
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y, h * 0.2, h * 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgb(col);
    // legs
    ctx.lineWidth = h * 0.075;
    const step = Math.sin(f.phase) * h * 0.06;
    ctx.beginPath(); ctx.moveTo(x - h * 0.06, y - h * 0.45); ctx.lineTo(x - h * 0.09 + step, y - h * 0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + h * 0.06, y - h * 0.45); ctx.lineTo(x + h * 0.09 - step, y - h * 0.02); ctx.stroke();
    // torso, hunched
    rr(x - h * 0.15 + sway, y - h * 0.84, h * 0.3, h * 0.44, h * 0.08); ctx.fill();
    // arms reaching toward you
    ctx.lineWidth = h * 0.06;
    const reach = Math.sin(f.phase * 0.5) * h * 0.04;
    ctx.beginPath(); ctx.moveTo(x - h * 0.13 + sway, y - h * 0.76); ctx.lineTo(x - h * 0.27, y - h * 0.5 + reach); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + h * 0.13 + sway, y - h * 0.76); ctx.lineTo(x + h * 0.27, y - h * 0.52 - reach); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - h * 0.28, y - h * 0.49 + reach, h * 0.045, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + h * 0.28, y - h * 0.51 - reach, h * 0.045, 0, 7); ctx.fill();
    // head, tilted forward
    ctx.beginPath(); ctx.arc(x + sway * 1.5, y - h * 0.9, h * 0.1, 0, 7); ctx.fill();
    // eyes
    ctx.fillStyle = f.boss ? C.bad : '#d9d4bd';
    ctx.globalAlpha *= 1 - fog * 0.5;
    ctx.beginPath(); ctx.arc(x + sway * 1.5 - h * 0.035, y - h * 0.91, Math.max(1, h * 0.014), 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sway * 1.5 + h * 0.035, y - h * 0.91, Math.max(1, h * 0.014), 0, 7); ctx.fill();
    ctx.restore();
  }

  let tagRects = [];
  function drawTag(f) {
    if (f.dead) return;
    const s = screen(f);
    const size = Math.round(15 + 9 * s.p);
    ctx.font = `600 ${size}px ${MONO}`;
    const tw = ctx.measureText(f.word).width;
    const pad = 8;
    let x = s.x - tw / 2, y = s.y - s.h - size - 18;
    x = Math.max(6, Math.min(W - tw - 6 - pad * 2, x));
    y = Math.max(66 + size, y);
    // push the label up while it overlaps one already drawn
    for (let tries = 0; tries < 8; tries++) {
      const hit = tagRects.find(r => x - pad < r.x + r.w && x + tw + pad > r.x && y - size < r.y + r.h && y + size * 0.5 > r.y);
      if (!hit) break;
      y = hit.y - size * 0.6;
    }
    tagRects.push({ x: x - pad, y: y - size, w: tw + pad * 2, h: size * 1.5 });
    ctx.fillStyle = 'rgba(14,15,16,0.88)';
    rr(x - pad, y - size * 0.95, tw + pad * 2, size * 1.45, 5); ctx.fill();
    if (f === target) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); }
    const done = f.word.slice(0, f.typed);
    ctx.fillStyle = C.accent; ctx.fillText(done, x, y);
    ctx.fillStyle = f === target ? C.ink : C.ink2;
    ctx.fillText(f.word.slice(f.typed), x + ctx.measureText(done).width, y);
  }

  function drawHud() {
    ctx.font = `700 15px ${SANS}`;
    ctx.fillStyle = C.ink2; ctx.textAlign = 'left';
    ctx.fillText('SCORE', 20, 26); ctx.fillText('WAVE', 160, 26);
    ctx.font = `600 22px ${MONO}`; ctx.fillStyle = C.ink;
    ctx.fillText(String(score), 20, 50); ctx.fillText(String(wave), 160, 50);
    // hearts as keycaps
    for (let i = 0; i < 3; i++) {
      const x = W - 20 - (3 - i) * 34;
      ctx.fillStyle = i < hearts ? C.accent : '#2d2e32';
      rr(x, 18, 28, 28, 5); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 3, 41, 22, 3);
    }
    if (combo >= 3) {
      ctx.textAlign = 'center'; ctx.font = `700 18px ${SANS}`; ctx.fillStyle = C.accent;
      ctx.fillText(`${combo} in a row`, W / 2, 38);
    }
    ctx.textAlign = 'left';
  }

  function centerText(lines) {
    ctx.fillStyle = 'rgba(14,15,16,0.82)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    let y = H / 2 - (lines.length - 1) * 20;
    for (const [txt, font, col] of lines) {
      ctx.font = font; ctx.fillStyle = col; ctx.fillText(txt, W / 2, y); y += font.includes('48') ? 56 : 34;
    }
    ctx.textAlign = 'left';
  }

  let last = performance.now(), t = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) { requestAnimationFrame(frame); return; }
    const paused = (state === 'play' || state === 'wave') && !focused;
    if (!paused) { update(dt); t += dt; }

    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 16 * shake, (Math.random() - .5) * 16 * shake);
    drawScene(t);
    const order = foes.slice().sort((a, b) => b.z - a.z);
    for (const f of order) drawFoe(f);
    for (const p of parts) {
      ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = rgb(p.col);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const s of shots) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, 7); ctx.fill();
    }
    tagRects = [];
    for (const f of order.slice().reverse()) drawTag(f);
    ctx.restore();
    if (hurt > 0) { ctx.fillStyle = `rgba(229,96,79,${hurt * 0.5})`; ctx.fillRect(0, 0, W, H); }
    if (missFlash > 0) { ctx.fillStyle = `rgba(229,96,79,${missFlash})`; ctx.fillRect(0, H - 6, W, 6); }

    if (state !== 'title') drawHud();
    if (state === 'title') {
      centerText([
        ['Typo Horde', `900 48px ${SANS}`, C.ink],
        ['Type the word over a typo to shoot it.', `500 20px ${SANS}`, C.ink2],
        ['The game ends when three typos reach you.', `500 20px ${SANS}`, C.ink2],
        [focused ? 'Press Enter to start' : 'Click here to start', `700 20px ${SANS}`, C.accent],
      ]);
    } else if (state === 'over') {
      const min = playMs / 60000;
      const wpm = min > 0 ? Math.round((chars / 5) / min) : 0;
      const acc = keys ? Math.round(100 * hits / keys) : 100;
      centerText([
        ['Game over', `900 48px ${SANS}`, C.ink],
        [`Score ${score}   Wave ${wave}   Best ${best()}`, `600 20px ${MONO}`, C.ink],
        [`${wpm} wpm   ${acc}% accuracy   ${bestCombo} in a row`, `600 20px ${MONO}`, C.ink2],
        ['Press Enter to play again', `700 20px ${SANS}`, C.accent],
      ]);
    } else if (paused) {
      centerText([
        ['Paused', `900 48px ${SANS}`, C.ink],
        ['Click here to keep playing', `700 20px ${SANS}`, C.accent],
      ]);
    } else if (state === 'wave') {
      ctx.textAlign = 'center'; ctx.font = `900 44px ${SANS}`; ctx.fillStyle = C.ink;
      ctx.fillText(`Wave ${wave}`, W / 2, H / 2 - 40);
      if (wave % 3 === 0) { ctx.font = `700 20px ${SANS}`; ctx.fillStyle = C.accent; ctx.fillText('A boss comes at the end of this wave.', W / 2, H / 2); }
      ctx.textAlign = 'left';
    }
    requestAnimationFrame(frame);
  }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) fit(); }).observe(box);
  requestAnimationFrame(frame);
})();
