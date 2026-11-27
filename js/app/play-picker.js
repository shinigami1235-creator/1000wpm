// #/play with no game: the game picker. Every game is a row; typing a game's name starts it
// (Enter too), and clicking or tapping a row does the same. The screen beside the list
// plays a small live scene of the game under the cursor, drawn on a 2D canvas so it costs
// almost nothing. With nothing touched for a while the screen cycles through the games
// like an arcade cabinet's attract mode.
//
//   PlayPicker.mount(host) -> { destroy }
window.PlayPicker = (() => {
  const GAMES = [
    { id: 'breach', name: 'breach', href: '#/play/breach', mode: 'Solo', color: Theme.hex('accent'), alias: [],
      sub: 'Five chapters, endless and a daily run',
      desc: 'Words come through the firewall. Type them before they reach you, with a boss at the end of each chapter.' },
    { id: 'race', name: 'race', href: '#/play/race', mode: 'Solo', color: Theme.hex('ink'), alias: ['art'],
      sub: 'Against Art, your best run or a friend',
      desc: 'Your car goes as fast as you type. Race Art at his real speed or your own best run.' },
    { id: 'rush', name: 'boss rush', href: '#/play/rush', mode: 'Solo', color: '#ff9f43', alias: ['rush'],
      sub: 'Every boss in a row, each one harder',
      desc: 'Every boss Art has beaten, one after another. Each has its own move and music and gets faster as it loses HP.' },
    { id: 'superboss', name: 'superboss', href: '#/superboss', mode: 'Live', color: '#b48cff', alias: ['stream'],
      sub: 'Art fights it on his stream',
      desc: 'Watch Art fight live, chat and send him support with your coins.' },
    { id: 'duel', name: 'duel', href: '#/duel', mode: 'PvP', color: '#3ee6ff', alias: ['pvp'],
      sub: 'Best of 3 rounds, ranked by MMR',
      desc: 'Type against another player for three rounds. Your MMR goes up when you win and down when you lose.' },
    { id: 'party', name: 'party', href: '#/party', mode: 'Co-op', color: '#e6f26a', alias: ['coop'],
      sub: 'Up to 4 players against one boss',
      desc: 'Team up with up to three others. Heal, shield and revive each other by typing their names.' },
    { id: 'commons', name: 'open port', href: '#/commons', mode: 'Chat', color: '#ff8fc8', alias: ['chat', 'port'],
      sub: 'The chat rooms and your friends',
      desc: 'Talk with other players in the public rooms or privately with your friends.' },
  ];
  const flat = s => s.replace(/\s+/g, '');
  // short tones for the command line: a rising one when a game starts, a low one for a name that doesn't exist
  let ac = null;
  function tone(f0, f1, dur, vol, type = 'square') {
    if (!window.TT || !TT.soundOn()) return;
    try {
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mount(host) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.innerHTML = `
      <section class="pk" aria-label="Pick a game">
        <div class="pk-list">
          <div class="pk-cmd" aria-live="polite"><span class="pk-ps">$ run</span><span class="pk-in" data-in></span><span class="pk-caret" aria-hidden="true"></span><span class="pk-hint" data-hint>Type a game's name, or click one</span></div>
          <ol class="pk-rows">${GAMES.map((g, i) => `
            <li><a class="pk-row" href="${g.href}" data-i="${i}" style="--c:${g.color}">
              <span class="pk-n num">${String(i + 1).padStart(2, '0')}</span>
              <span class="pk-name" aria-label="${esc(g.name)}">${[...g.name].map(c => `<span>${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('')}</span>
              <span class="pk-mode">${g.mode}</span>
              <span class="pk-sub">${esc(g.sub)}</span>
            </a></li>`).join('')}
          </ol>
        </div>
        <div class="pk-side">
          <div class="pk-screen" data-screen><canvas data-cv aria-hidden="true"></canvas><span class="pk-tag" data-tag></span></div>
          <div class="pk-info">
            <h2 data-name></h2>
            <p data-desc></p>
            <p class="pk-me" data-me hidden></p>
            <a class="btn" data-go href="#">Start</a>
          </div>
        </div>
      </section>`;
    const q = s => host.querySelector(s);
    const rows = [...host.querySelectorAll('.pk-row')];
    const cv = q('[data-cv]'), ctx = cv.getContext('2d');
    let cur = -1, typed = '', raf = 0, last = 0, t0 = performance.now(), idleAt = performance.now(), seen = true, launching = false;
    let scene = null;

    // ---------- which game is shown ----------
    function show(i, why) {
      if (i === cur) return;
      cur = i;
      const g = GAMES[i];
      rows.forEach((r, k) => r.classList.toggle('on', k === i));
      host.querySelector('.pk').style.setProperty('--c', g.color);
      q('[data-name]').textContent = g.name;
      q('[data-desc]').textContent = g.desc;
      q('[data-tag]').textContent = `${String(i + 1).padStart(2, '0')} // ${g.name}`;
      const go = q('[data-go]'); go.href = g.href; go.textContent = `Start ${g.name}`;
      let me = null;
      try { me = window.Missions && Missions.progress(g.id === 'commons' ? 'commons' : g.id); } catch (e) {}
      const meEl = q('[data-me]'); meEl.hidden = !me; meEl.textContent = me || '';
      scene = SCENES[g.id](cv);
      if (why !== 'idle') idleAt = performance.now();
      if (reduce) draw(performance.now());
    }

    // ---------- typing a name ----------
    function matches(s) {
      const f = flat(s);
      return GAMES.map((g, i) => ({ i, hit: [g.name, ...g.alias].some(n => flat(n).startsWith(f)), full: [g.name, ...g.alias].some(n => flat(n) === f) }))
        .filter(x => x.hit);
    }
    function paintTyped(bad) {
      q('[data-in]').textContent = typed;
      q('[data-hint]').hidden = !!typed;
      const f = flat(typed);
      rows.forEach((r, k) => {
        const name = flat(GAMES[k].name), on = f && name.startsWith(f);
        r.classList.toggle('dim', !!f && !on && !GAMES[k].alias.some(a => a.startsWith(f)));
        let n = 0;
        r.querySelectorAll('.pk-name span').forEach(sp => {
          if (sp.textContent.trim() === '') { sp.className = ''; return; }
          sp.className = on && n < f.length ? 'ok' : ''; n++;
        });
      });
      const cmd = q('.pk-cmd');
      cmd.classList.toggle('bad', !!bad);
      if (bad) { cmd.classList.remove('shake'); void cmd.offsetWidth; cmd.classList.add('shake'); }
    }
    function launch(i) {
      if (launching) return;
      launching = true;
      tone(440, 1320, 0.22, 0.05); setTimeout(() => tone(880, 1760, 0.12, 0.035, 'triangle'), 90);
      const r = rows[i];
      r.classList.add('go');
      setTimeout(() => { location.hash = GAMES[i].href; }, reduce ? 0 : 260);
    }
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || launching) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      if (document.documentElement.classList.contains('intro')) return;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        show((cur + (k === 'ArrowDown' ? 1 : GAMES.length - 1)) % GAMES.length, 'key');
        rows[cur].focus({ preventScroll: true });
        return;
      }
      if (k === 'Enter') {
        if (a && a.classList && a.classList.contains('pk-row')) return;   // the link opens itself
        e.preventDefault(); launch(cur); return;
      }
      if (k === 'Escape') { typed = ''; paintTyped(); return; }
      if (k === 'Backspace') { if (typed) { e.preventDefault(); typed = typed.slice(0, -1); paintTyped(); } return; }
      if (k.length !== 1 || !/[a-z ]/i.test(k)) return;
      e.preventDefault();
      const next = (typed + k.toLowerCase()).replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
      const m = matches(next);
      if (!m.length) { paintTyped(true); tone(160, 110, 0.12, 0.05); return; }
      typed = next;
      if (window.TT) TT.click(k === ' ');
      paintTyped();
      show(m[0].i, 'type');
      // the whole name typed starts the game; a shorter alias needs Enter
      const done = m.find(x => flat(GAMES[x.i].name) === flat(typed));
      if (done && m.length === 1) launch(done.i);
    }
    document.addEventListener('keydown', onKey);
    rows.forEach((r, i) => {
      r.addEventListener('mouseenter', () => show(i, 'hover'));
      r.addEventListener('focus', () => show(i, 'focus'));
      r.addEventListener('click', e => { if (e.button === 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); launch(i); } });
    });
    q('[data-go]').addEventListener('click', e => { if (e.button === 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); launch(cur); } });

    // ---------- the screen ----------
    function fit() {
      const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d));
      ctx.setTransform(d, 0, 0, d, 0, 0);
      cv._w = r.width; cv._h = r.height;
      if (reduce) draw(performance.now());
    }
    function draw(now) {
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const W = cv._w || 1, H = cv._h || 1;
      ctx.fillStyle = Theme.hex('bg'); ctx.fillRect(0, 0, W, H);
      if (scene) scene(ctx, W, H, reduce ? 2.4 : (now - t0) / 1000, reduce ? 0 : dt);
    }
    function loop(now) {
      raf = 0;
      if (!seen || document.hidden) return;
      // nothing touched for 7 s: move to the next game every 5 s
      if (!typed && now - idleAt > 7000) { idleAt = now - 2000; show((cur + 1) % GAMES.length, 'idle'); }
      draw(now);
      raf = requestAnimationFrame(loop);
    }
    const start = () => { if (!raf && !reduce) { last = 0; raf = requestAnimationFrame(loop); } };
    const ro = new ResizeObserver(fit); ro.observe(cv);
    const io = new IntersectionObserver(es => { seen = es.some(x => x.isIntersecting); if (seen) start(); });
    io.observe(cv);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);
    host.addEventListener('mousemove', () => { idleAt = performance.now(); }, { passive: true });

    fit();
    show(0, 'start');
    start();

    return {
      destroy() {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVis);
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect(); io.disconnect();
      },
    };
  }

  // ---------- the scenes ----------
  // Each takes the canvas, keeps its own state and returns draw(ctx, w, h, t, dt).
  const WORDS = ['type', 'fast', 'keys', 'caret', 'shift', 'space', 'enter', 'focus', 'speed', 'combo', 'flow', 'clean', 'tab', 'echo', 'patch', 'byte', 'loop', 'debug'];
  const pickW = n => WORDS[(n * 7 + 3) % WORDS.length];
  const mono = (s, px) => `${px}px "JetBrains Mono", ui-monospace, monospace`;
  const head = px => `600 ${px}px "Chakra Petch", system-ui, sans-serif`;
  const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  function grid(c, w, h, col, t, speed) {
    // a floor that scrolls toward the viewer
    c.strokeStyle = alpha(col, 0.16); c.lineWidth = 1;
    const hy = h * 0.58;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(w / 2 + i * w * 0.03, hy); c.lineTo(w / 2 + i * w * 0.16, h); c.stroke(); }
    for (let k = 0; k < 7; k++) {
      const p = ((k + t * speed) % 7) / 7, y = hy + (h - hy) * p * p;
      c.globalAlpha = p; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.globalAlpha = 1;
    }
  }
  function glowText(c, s, x, y, col, font, blur = 10) { c.font = font; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = blur; c.fillText(s, x, y); c.shadowBlur = 0; }

  const SCENES = {
    breach() {
      const G = Theme.hex('accent');
      const ws = Array.from({ length: 6 }, (_, i) => ({ x: 0.12 + i * 0.15, y: 0.08 + ((i * 3) % 6) * 0.11, w: pickW(i), v: 0.1 + (i % 3) * 0.025, done: 0 }));
      let n = 6, bursts = [], bolts = [], flashes = [];
      return (c, w, h, t, dt) => {
        // a dark sky with the chapter glow along the horizon, then the floor
        const hg = c.createLinearGradient(0, h * 0.3, 0, h * 0.62);
        hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.8, alpha('#a35bff', 0.16)); hg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = hg; c.fillRect(0, h * 0.3, w, h * 0.32);
        grid(c, w, h, G, t, 0.5);
        // shots come in from the lower right, where the blaster sits in the game
        const muzzle = { x: w * 0.82, y: h * 1.02 };
        c.fillStyle = alpha('#ff4d5e', 0.75); c.fillRect(0, h * 0.86, w, 2);
        glowText(c, 'firewall', 10, h * 0.86 - 6, alpha('#ff4d5e', 0.8), mono(0, 11), 0);
        const low = ws.reduce((a, b) => (b.y > a.y && !b.done ? b : a), ws[0]);
        for (const o of ws) {
          o.y += o.v * dt;
          if (o === low && o.y > 0.35) {
            const before = Math.floor(o.done);
            o.done = Math.min(o.w.length, o.done + dt * 9);
            // a bolt for every letter typed
            if (Math.floor(o.done) > before) bolts.push({ x0: muzzle.x, y0: muzzle.y, x1: o.x * w, y1: o.y * h - 4, l: 0.12 });
          }
          if (o.done >= o.w.length) {
            for (let k = 0; k < 14; k++) bursts.push({ x: o.x * w, y: o.y * h, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.8) * 160, l: 0.6 });
            flashes.push({ x: o.x * w, y: o.y * h, l: 0.35 });
            Object.assign(o, { y: -0.12, w: pickW(n++), done: 0 });
          }
          if (o.y > 0.84) Object.assign(o, { y: -0.12, w: pickW(n++), done: 0 });
          if (o.y < -0.05) continue;
          c.font = mono(0, 17);
          const tw = c.measureText(o.w).width, x = o.x * w - tw / 2, y = o.y * h;
          c.fillStyle = 'rgba(4,8,6,.85)'; c.fillRect(x - 6, y - 15, tw + 12, 21);
          c.strokeStyle = alpha(G, o === low ? 0.9 : 0.35); c.strokeRect(x - 6, y - 15, tw + 12, 21);
          const d = Math.floor(o.done);
          glowText(c, o.w.slice(0, d), x, y, G, mono(0, 17), 8);
          c.fillStyle = Theme.hex('ink-2'); c.font = mono(0, 17); c.fillText(o.w.slice(d), x + c.measureText(o.w.slice(0, d)).width, y);
        }
        bursts = bursts.filter(b => (b.l -= dt) > 0);
        for (const b of bursts) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 300 * dt; c.fillStyle = alpha(G, b.l / 0.6); c.fillRect(b.x, b.y, 3, 3); }
        c.globalCompositeOperation = 'lighter';
        bolts = bolts.filter(b => (b.l -= dt) > 0);
        for (const b of bolts) {
          const k = b.l / 0.12;
          c.strokeStyle = alpha(G, k); c.lineWidth = 1 + 2 * k; c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke();
          c.fillStyle = alpha('#ffffff', k); c.beginPath(); c.arc(b.x1, b.y1, 2 + 3 * k, 0, 7); c.fill();
        }
        c.lineWidth = 1;
        flashes = flashes.filter(f => (f.l -= dt) > 0);
        for (const f of flashes) {
          const k = f.l / 0.35, r = 10 + (1 - k) * 40;
          const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r); g.addColorStop(0, alpha('#ffffff', k)); g.addColorStop(0.4, alpha('#ff4d5e', 0.6 * k)); g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g; c.fillRect(f.x - r, f.y - r, r * 2, r * 2);
          c.strokeStyle = alpha('#ff4d5e', k); c.beginPath(); c.ellipse(f.x, f.y + 6, r * 1.2, r * 0.35, 0, 0, 7); c.stroke();
        }
        c.globalCompositeOperation = 'source-over';
      };
    },
    race() {
      // the road from behind two cars, like the race itself: you in green, Art in cyan, trading the lead
      const G = Theme.hex('accent'), CY = '#3ee6ff';
      const RV = window.RaceView;
      let sky = null;
      return (c, w, h, t) => {
        const hy = h * 0.46;
        if (!sky || sky.h !== h) { const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#000201'); g.addColorStop(0.6, '#021208'); g.addColorStop(1, alpha(G, 0.28)); sky = { g, h }; }
        c.fillStyle = sky.g; c.fillRect(0, 0, w, hy);
        // synth sun with its cut lines, then a skyline in front of it
        const sr = h * 0.17, sx = w * 0.62;
        c.save(); c.beginPath(); c.rect(0, 0, w, hy); c.clip();
        const sg = c.createLinearGradient(0, hy - sr * 2, 0, hy); sg.addColorStop(0, G); sg.addColorStop(1, '#0b6b3c');
        c.fillStyle = sg; c.beginPath(); c.arc(sx, hy - sr * 0.2, sr, 0, 7); c.fill();
        c.fillStyle = '#021208'; for (let k = 0; k < 6; k++) c.fillRect(sx - sr, hy - sr * 0.55 + k * sr * 0.14, sr * 2, 1 + k * 0.8);
        for (let i = 0; i < 26; i++) {
          const bw = w * (0.03 + ((i * 37) % 7) * 0.006), bh = h * (0.05 + ((i * 53) % 9) * 0.018), bx = (i * w * 0.041 + ((i * 13) % 5) * 6) % w;
          c.fillStyle = '#031409'; c.fillRect(bx, hy - bh, bw, bh);
          c.fillStyle = alpha(G, 0.55); for (let k = 0; k < 4; k++) if (((i + k) * 7) % 3 === 0) c.fillRect(bx + 3 + k * 5, hy - bh + 5 + ((i * k) % 4) * 5, 2, 2);
        }
        c.restore();
        c.fillStyle = alpha(G, 0.5); c.fillRect(0, hy - 1, w, 2);
        // ground and road in perspective, dashes rushing toward the viewer
        c.fillStyle = '#010503'; c.fillRect(0, hy, w, h - hy);
        const cx = w * 0.5, top = w * 0.03, bot = w * 0.62;
        c.fillStyle = '#050b08'; c.beginPath(); c.moveTo(cx - top, hy); c.lineTo(cx + top, hy); c.lineTo(cx + bot, h); c.lineTo(cx - bot, h); c.fill();
        c.strokeStyle = G; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - top, hy); c.lineTo(cx - bot, h); c.moveTo(cx + top, hy); c.lineTo(cx + bot, h); c.stroke(); c.lineWidth = 1;
        c.strokeStyle = alpha(G, 0.14);
        for (let i = 1; i < 9; i++) { c.beginPath(); c.moveTo(cx - top * (1 + i * 0.6), hy); c.lineTo(cx - bot * (1 + i * 0.6), h); c.moveTo(cx + top * (1 + i * 0.6), hy); c.lineTo(cx + bot * (1 + i * 0.6), h); c.stroke(); }
        for (let k = 0; k < 8; k++) {
          const z = ((k / 8 + t * 0.9) % 1), y = hy + (h - hy) * z * z, half = top + (bot - top) * z * z;
          c.fillStyle = alpha(G, 0.85 * z); c.fillRect(cx - half / 3 - 1.5 * (0.3 + z), y, 3 * (0.3 + z), Math.max(1, 14 * z * z));
          c.fillRect(cx + half / 3 - 1.5 * (0.3 + z), y, 3 * (0.3 + z), Math.max(1, 14 * z * z));
        }
        // the two cars: the one behind is lower and bigger
        const lead = Math.sin(t * 0.6);
        const cars = [
          { col: G, name: 'you', wpm: 98 + Math.round(8 * Math.sin(t * 1.3)), lane: -1, z: 0.5 + lead * 0.35 },
          { col: CY, name: 'art', wpm: 204, lane: 1, z: 0.5 - lead * 0.35 },
        ].sort((a, b) => a.z - b.z);
        for (const car of cars) {
          const z = 0.45 + car.z * 0.5, y = hy + (h - hy) * z * z + h * 0.02, half = top + (bot - top) * z * z, x = cx + car.lane * half / 3, s = (h / 400) * (0.25 + z * z * 0.75);
          if (RV && RV.carSprite) {
            c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.ellipse(x, y, 100 * s, 12 * s, 0, 0, 7); c.fill();
            const sp = RV.carSprite(car.col);
            c.drawImage(sp.c, x - 100 * s, y - 108 * s, 200 * s, 116 * s);
            c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6;
            for (const lx of [-72, 72]) c.drawImage(RV.glow('#ff2a3c').c, x + lx * s - 35 * s, y - 54 * s - 17 * s, 70 * s, 34 * s);
            c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          }
          glowText(c, `${car.name} ${car.wpm} wpm`, x - 40, y - 118 * s - 6, car.col, mono(0, 12), 6);
        }
        // speed lines at the edges
        c.strokeStyle = 'rgba(255,255,255,.18)';
        for (let k = 0; k < 10; k++) {
          const a = k * 2.4 + 0.3, r = ((t * 0.8 + k / 10) % 1), x0 = cx + Math.cos(a) * (w * 0.3 + r * w * 0.5), y0 = hy + Math.sin(a) * 0.4 * (w * 0.3 + r * w * 0.5);
          if (Math.abs(Math.cos(a)) < 0.45) continue;
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * 30 * r, y0 + Math.sin(a) * 12 * r); c.stroke();
        }
      };
    },
    rush() {
      const O = '#ff9f43';
      let pops = [], next = 0;
      return (c, w, h, t, dt) => {
        grid(c, w, h, O, t, 0.35);
        const cx = w / 2 + Math.sin(t * 0.7) * w * 0.12, cy = h * 0.42 + Math.sin(t * 2) * 4;
        // a boss built from blocks
        const B = [[0, -3], [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-1, 0], [0, 0], [1, 0], [-2, 1], [2, 1], [-1, 1], [1, 1], [-1, 2], [1, 2]];
        const s = Math.min(w, h) * 0.06;
        for (const [i, j] of B) {
          const ox = Math.sin(t * 3 + i + j) * 2;
          c.strokeStyle = alpha(O, 0.9); c.shadowColor = O; c.shadowBlur = 10;
          c.strokeRect(cx + i * s * 1.05 - s / 2 + ox, cy + j * s * 1.05 - s / 2, s, s); c.shadowBlur = 0;
        }
        c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy - s * 1.05, s * 0.28, 0, 7); c.fill();
        // HP bar with the phase lines
        const hp = 1 - ((t * 0.08) % 1);
        c.fillStyle = alpha(O, 0.2); c.fillRect(w * 0.2, 16, w * 0.6, 6);
        c.fillStyle = O; c.fillRect(w * 0.2, 16, w * 0.6 * hp, 6);
        c.fillStyle = '#fff'; c.fillRect(w * 0.2 + w * 0.6 * 0.33, 14, 2, 10); c.fillRect(w * 0.2 + w * 0.6 * 0.66, 14, 2, 10);
        glowText(c, `phase ${hp > 0.66 ? 1 : hp > 0.33 ? 2 : 3} of 3`, w * 0.2, 40, O, mono(0, 12), 0);
        // shots at the boss
        for (let k = 0; k < 4; k++) { const p = (t * 1.6 + k / 4) % 1; c.fillStyle = Theme.hex('accent'); c.fillRect(w * (0.3 + k * 0.13) + (cx - w * (0.3 + k * 0.13)) * p, h - (h - cy) * p, 4, 4); }
        // the Spam's pop-ups
        if (dt && t > next) { pops.push({ x: 0.08 + Math.random() * 0.62, y: 0.5 + Math.random() * 0.3, w: pickW(Math.floor(t * 3)), l: 2.2 }); next = t + 0.9; }
        pops = pops.filter(p => (p.l -= dt) > 0).slice(-4);
        for (const p of pops) {
          const x = p.x * w, y = p.y * h;
          c.fillStyle = '#12051f'; c.fillRect(x, y, 112, 46);
          c.fillStyle = '#a35bff'; c.fillRect(x, y, 112, 12);
          c.fillStyle = '#12051f'; c.font = mono(0, 9); c.fillText('FREE GIFT!!', x + 4, y + 9); c.fillText('x', x + 103, y + 9);
          c.fillStyle = Theme.hex('ink'); c.font = mono(0, 15); c.fillText(p.w, x + 56 - c.measureText(p.w).width / 2, y + 35);
        }
      };
    },
    superboss() {
      const P = '#b48cff';
      const MSG = [['flux', 'gogo art'], ['kei_ra', '204 lets go'], ['nyx', 'that combo'], ['dex', 'sent 50 coins'], ['mori', 'gg boss'], ['vale', 'type faster lol'], ['ivo', 'clean'], ['bea', 'pb incoming']];
      return (c, w, h, t) => {
        const vw = w * 0.66;
        c.strokeStyle = alpha(P, 0.4); c.strokeRect(10.5, 10.5, vw - 16, h - 21);
        // the boss in the stream
        const cx = vw / 2, cy = h * 0.5;
        for (let r = 0; r < 5; r++) {
          c.lineWidth = 3; c.strokeStyle = alpha(P, 1 - r * 0.15); c.shadowColor = P; c.shadowBlur = 16;
          c.beginPath(); c.arc(cx, cy, 18 + r * 14 + Math.sin(t * 2 + r) * 3, t * (r % 2 ? 1 : -1) * 0.7, t * (r % 2 ? 1 : -1) * 0.7 + 4.2); c.stroke();
        }
        c.shadowBlur = 0; c.lineWidth = 1;
        c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, 8, 0, 7); c.fill();
        const hp = 0.25 + 0.7 * (0.5 + 0.5 * Math.cos(t * 0.3));
        c.fillStyle = alpha(P, 0.2); c.fillRect(26, h - 34, vw - 48, 6); c.fillStyle = P; c.fillRect(26, h - 34, (vw - 48) * hp, 6);
        c.fillStyle = '#ff4d5e'; c.fillRect(22, 20, 36, 16); c.fillStyle = '#fff'; c.font = head(11); c.fillText('LIVE', 28, 32);
        glowText(c, 'art vs the compiler', 66, 32, Theme.hex('ink'), mono(0, 12), 0);
        // chat scrolling up
        const lh = 22, off = (t * 18) % lh;
        c.save(); c.beginPath(); c.rect(vw, 10, w - vw - 10, h - 20); c.clip();
        for (let i = 0; i < 14; i++) {
          const m = MSG[(Math.floor(t * 18 / lh) + i) % MSG.length], y = h - 18 - i * lh + off;
          c.font = mono(0, 12); c.fillStyle = P; c.fillText(m[0], vw + 8, y);
          c.fillStyle = Theme.hex('ink'); c.fillText(m[1], vw + 14 + c.measureText(m[0]).width, y);
        }
        c.restore();
      };
    },
    duel() {
      const C = '#3ee6ff', G = Theme.hex('accent');
      return (c, w, h, t) => {
        grid(c, w, h, C, t, 0.25);
        const L = { x: w * 0.2, col: G }, R = { x: w * 0.8, col: C };
        [L, R].forEach((f, k) => {
          const y = h * 0.45 + Math.sin(t * 2 + k) * 3, cw = w * 0.13, ch = cw * 1.35;
          c.strokeStyle = f.col; c.shadowColor = f.col; c.shadowBlur = 14; c.lineWidth = 2;
          c.strokeRect(f.x - cw / 2, y - ch / 2, cw, ch); c.shadowBlur = 0; c.lineWidth = 1;
          c.fillStyle = alpha(f.col, 0.25); c.beginPath(); c.arc(f.x, y - ch * 0.12, cw * 0.22, 0, 7); c.fill();
          c.fillRect(f.x - cw * 0.3, y + ch * 0.1, cw * 0.6, ch * 0.28);
          const hp = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.5 + k * 2));
          c.fillStyle = alpha(f.col, 0.2); c.fillRect(f.x - cw / 2, y + ch / 2 + 10, cw, 5); c.fillStyle = f.col; c.fillRect(f.x - cw / 2, y + ch / 2 + 10, cw * hp, 5);
        });
        // a typed word flies from one side to the other, letter by letter on an arc
        const word = pickW(Math.floor(t / 1.2)), p = (t % 1.2) / 1.2, from = Math.floor(t / 1.2) % 2 ? R : L, to = from === L ? R : L;
        [...word].forEach((ch, i) => {
          const q = Math.max(0, Math.min(1, p * 1.4 - i * 0.06));
          if (q <= 0 || q >= 1) return;
          const x = from.x + (to.x - from.x) * q, y = h * 0.42 - Math.sin(q * Math.PI) * h * 0.22;
          glowText(c, ch, x, y, from.col, mono(0, 20), 12);
        });
        glowText(c, 'round 2', w / 2 - 28, 26, Theme.hex('ink'), mono(0, 13), 0);
      };
    },
    party() {
      const Y = '#e6f26a', G = Theme.hex('accent');
      let plus = [], next = 0;
      return (c, w, h, t, dt) => {
        grid(c, w, h, Y, t, 0.3);
        // three heads on swaying necks
        const bx = w / 2, by = h * 0.62;
        for (let k = -1; k <= 1; k++) {
          const hx = bx + k * w * 0.14 + Math.sin(t * 1.4 + k) * 12, hy = h * 0.26 + Math.cos(t * 1.7 + k * 2) * 10;
          c.strokeStyle = alpha('#ff4d5e', 0.8); c.lineWidth = 3; c.beginPath(); c.moveTo(bx + k * 20, by - 20);
          c.quadraticCurveTo(bx + k * w * 0.1, h * 0.45, hx, hy); c.stroke(); c.lineWidth = 1;
          c.strokeStyle = '#ff4d5e'; c.shadowColor = '#ff4d5e'; c.shadowBlur = 12; c.strokeRect(hx - 16, hy - 12, 32, 24); c.shadowBlur = 0;
          glowText(c, ['spam', 'scam', 'bait'][k + 1], hx - 15, hy - 18, Theme.hex('ink'), mono(0, 11), 0);
        }
        c.strokeStyle = '#ff4d5e'; c.strokeRect(bx - 40, by - 22, 80, 30);
        // the team along the bottom
        const names = ['you', 'flux', 'kei', 'dex'];
        names.forEach((n, i) => {
          const x = w * (0.14 + i * 0.24) - 40, y = h - 40;
          const hp = Math.max(0.1, 0.55 + 0.4 * Math.sin(t * 0.9 + i * 1.7));
          c.strokeStyle = alpha(Y, i === 0 ? 0.9 : 0.4); c.strokeRect(x + 0.5, y + 0.5, 80, 30);
          c.fillStyle = i === 0 ? Y : Theme.hex('ink'); c.font = head(12); c.fillText(n, x + 6, y + 13);
          c.fillStyle = alpha(G, 0.2); c.fillRect(x + 6, y + 19, 68, 4); c.fillStyle = hp < 0.3 ? '#ff4d5e' : G; c.fillRect(x + 6, y + 19, 68 * hp, 4);
        });
        if (dt && t > next) { plus.push({ x: w * (0.14 + Math.floor(Math.random() * 4) * 0.24), y: h - 46, l: 1 }); next = t + 0.7; }
        plus = plus.filter(p => (p.l -= dt) > 0);
        for (const p of plus) { p.y -= 40 * dt; glowText(c, '+22', p.x - 10, p.y, alpha(G, p.l), mono(0, 13), 8); }
      };
    },
    commons() {
      const P = '#ff8fc8';
      const LINES = ['anyone up for a duel', 'how do i beat the press', 'new pb 92 wpm', 'gg', 'party needs a support', 'the hydra keeps growing back', 'art is live', 'what keyboard do you use', 'every keystroke counts', 'welcome in'];
      return (c, w, h, t) => {
        const lh = 44, off = (t * 22) % lh;
        c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip();
        for (let i = 0; i < 9; i++) {
          const k = Math.floor(t * 22 / lh) + i, s = LINES[k % LINES.length], right = k % 3 === 1;
          const y = h - 24 - i * lh + off;
          c.font = mono(0, 14);
          const tw = c.measureText(s).width + 24, x = right ? w - tw - 18 : 18;
          c.fillStyle = right ? alpha(P, 0.18) : Theme.rgba('ink', .06); c.fillRect(x, y - 20, tw, 30);
          c.strokeStyle = right ? alpha(P, 0.6) : Theme.rgba('ink', .2); c.strokeRect(x + 0.5, y - 19.5, tw, 30);
          c.fillStyle = right ? P : Theme.hex('ink'); c.fillText(s, x + 12, y);
        }
        c.restore();
        c.fillStyle = 'rgba(4,8,6,.9)'; c.fillRect(0, 0, w, 30);
        glowText(c, '# general', 14, 20, P, mono(0, 13), 0);
      };
    },
  };

  return { mount, GAMES };
})();
