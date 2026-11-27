// Race view: a pseudo-3D road where each car's position is its typing progress.
// Typing faster moves the car faster, and a run of correct letters turns on the boost.
// Everything costly (cars, buildings, skylines, the sky, glows) is drawn once into offscreen
// sprites and stamped each frame, so the detail costs almost nothing per frame.
//   view.draw(state, dt)   state: { you: {progress, kmh, boost, skid, streak, color, name}, others: [{progress, color, name, boost}] }
//   view.key(ok) view.word() view.countdown() view.finish(result) view.newCourse(seed, first)
window.RaceView = (() => {
  const W = 960, H = 400;
  const SEG = 200, ROAD = 2000, CAM_H = 1000, DEPTH = 0.84, DRAW = 150, LANES = 3;
  const BOOST_AT = 12;
  const acc = () => Theme.hex('accent');
  // Night courses in the site's terminal colours. The grid city comes first and shows up most.
  const THEMES = [
    { name: 'Grid city', sky: ['#000201', '#021208', '#0b3a22'], fog: '#0a3a22', ground: ['#010503', '#010604'], rumble: ['ACC', '#042014'], road: ['#050b08', '#060d0a'],
      lane: 'ACC', edge: 'ACC', props: 'neon', sun: 'synth', sunCol: ['ACC', '#0b6b3c'], sunY: 0.34, hills: 'city', grid: true, win: ['ACC', '#b8ffd8', '#3ee6ff'], hill: ['#020d07', '#031409'], glow: 'ACC', stars: 70 },
    { name: 'Grid city', sky: ['#000204', '#021018', '#0a3040'], fog: '#0a2c3a', ground: ['#010406', '#010507'], rumble: ['#3ee6ff', '#06222a'], road: ['#050a0c', '#060c0e'],
      lane: '#3ee6ff', edge: '#3ee6ff', props: 'neon', sun: 'synth', sunCol: ['#3ee6ff', '#1d4f8f'], sunY: 0.34, hills: 'city', grid: true, win: ['#3ee6ff', '#c8f6ff', '#ff6ad5'], hill: ['#020a10', '#041018'], glow: '#3ee6ff', stars: 70 },
    { name: 'City at night', sky: ['#010303', '#06160f', '#183526'], fog: '#163024', ground: ['#060b09', '#070d0a'], rumble: ['#e8f2ec', '#c3303d'], road: ['#15191a', '#171c1d'],
      lane: '#e8f2ec', edge: '#e8f2ec', props: 'lamp', sun: 'moon', sunCol: ['#eef5ef', '#7fa596'], sunY: 0.2, hills: 'city', win: ['#ffd27a', '#ffeec0', '#7dffb3'], hill: ['#07120d', '#0b1a13'], glow: '#ffcf7a', stars: 40 },
    { name: 'Coast road at night', sky: ['#01040a', '#071d2a', '#1b4652'], fog: '#173f4a', ground: ['#16170f', '#191a11'], rumble: ['#e8f2ec', '#c3303d'], road: ['#191b1b', '#1c1e1e'],
      lane: '#e8f2ec', edge: '#e8f2ec', props: 'palm', sun: 'moon', sunCol: ['#f4f7ee', '#7aa7b3'], sunY: 0.42, hills: 'hills', hill: ['#0a2630', '#0b1e1a'], glow: '#ffcf7a', stars: 90, sea: true },
    { name: 'Desert at night', sky: ['#020309', '#0d1a2c', '#3a2c3a'], fog: '#3a2a2e', ground: ['#231b11', '#271e13'], rumble: ['#e8f2ec', '#ff4d5e'], road: ['#1c1a17', '#1f1d1a'],
      lane: '#f2e6c8', edge: '#f2e6c8', props: 'cactus', sun: 'moon', sunCol: ['#fff3dc', '#b38f6a'], sunY: 0.22, hills: 'mesa', hill: ['#2a1d1c', '#1f1612'], glow: '#ffb35c', stars: 120 },
    { name: 'Snow pass at night', sky: ['#01040a', '#0e1d33', '#2d4867'], fog: '#2b4361', ground: ['#a9b8c4', '#9fafbc'], rumble: ['#ff4d5e', '#e8f2ec'], road: ['#1d2126', '#20242a'],
      lane: '#e8f2ec', edge: '#e8f2ec', props: 'pine', sun: 'moon', sunCol: ['#ffffff', '#9ab3d1'], sunY: 0.26, hills: 'peaks', hill: ['#1c2c42', '#15202f'], glow: '#bfe1ff', stars: 100, snow: true },
  ];
  const BOARDS = ['AULA', 'WOMIER', 'LOGA', 'ATTACK SHARK', 'CORSAIR', 'CHILKEY', 'STORMTYPER'];
  const col = (T, v) => v === 'ACC' ? acc() : v;

  const ease = (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const shade = (hex, k) => {
    const c = rgb(hex).map(v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const mixMemo = new Map();
  const mix = (a, b, k) => {
    const key = a + b + k;
    let v = mixMemo.get(key);
    if (!v) { const x = rgb(a), y = rgb(b); v = `rgb(${x.map((q, i) => Math.round(q + (y[i] - q) * k)).join(',')})`; mixMemo.set(key, v); }
    return v;
  };

  // ---------- sprites: drawn once, stamped every frame ----------
  const cache = new Map();
  function sprite(key, w, h, scale, draw) {
    let s = cache.get(key);
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    draw(g, w, h);
    s = { c, w, h };
    cache.set(key, s);
    return s;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
  function glow(color) {
    return sprite('glow:' + color, 64, 64, 1, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.22, rgba(color, 0.55)); gr.addColorStop(0.55, rgba(color, 0.14)); gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  function stamp(ctx, s, x, y, w, h) { ctx.drawImage(s.c, x - w / 2, y - h / 2, w, h); }

  // A sports coupe seen from behind, x -96..96, y -104..6, wheels on y = 0.
  function carSprite(color) {
    return sprite('car:' + color, 200, 116, 2.5, (g) => {
      g.translate(100, 108);
      const lt = shade(color, 0.45), md = shade(color, -0.15), dk = shade(color, -0.55), dk2 = shade(color, -0.78);
      // tyres with tread
      g.fillStyle = '#050607'; rr(g, -90, -36, 32, 38, 7); rr(g, 58, -36, 32, 38, 7);
      g.fillStyle = 'rgba(255,255,255,.08)';
      for (let k = 0; k < 6; k++) { g.fillRect(-87, -32 + k * 6, 26, 1.6); g.fillRect(61, -32 + k * 6, 26, 1.6); }
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(-90, -36, 4, 38); g.fillRect(86, -36, 4, 38);
      // lower body and diffuser
      g.fillStyle = '#0b0e10'; g.beginPath(); g.moveTo(-82, -32); g.lineTo(82, -32); g.lineTo(76, -6); g.lineTo(-76, -6); g.closePath(); g.fill();
      g.fillStyle = '#1b2126'; for (let k = -3; k <= 3; k++) g.fillRect(k * 13 - 1.5, -28, 3, 20);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(-76, -8, 152, 1.5);
      // exhaust tips
      for (const ex of [-46, 46]) {
        const eg = g.createRadialGradient(ex - 2, -19, 1, ex, -18, 9);
        eg.addColorStop(0, '#000'); eg.addColorStop(0.55, '#111'); eg.addColorStop(0.7, '#c9d2d8'); eg.addColorStop(1, '#4b545b');
        g.fillStyle = eg; g.beginPath(); g.ellipse(ex, -18, 9, 6.5, 0, 0, 7); g.fill();
      }
      // main body with a light top and dark bottom
      g.beginPath(); g.moveTo(-94, -30); g.quadraticCurveTo(-98, -46, -90, -58); g.lineTo(-72, -70); g.lineTo(72, -70); g.lineTo(90, -58); g.quadraticCurveTo(98, -46, 94, -30); g.closePath();
      const bg = g.createLinearGradient(0, -70, 0, -30);
      bg.addColorStop(0, lt); bg.addColorStop(0.28, color); bg.addColorStop(0.7, md); bg.addColorStop(1, dk);
      g.fillStyle = bg; g.fill();
      // the sides turn away from the light
      const sg = g.createLinearGradient(-96, 0, 96, 0);
      sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(0.18, 'rgba(0,0,0,0)'); sg.addColorStop(0.82, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = sg; g.fill();
      // shoulder line
      g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = 1.3; g.beginPath(); g.moveTo(-70, -69); g.lineTo(70, -69); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-92, -40); g.lineTo(92, -40); g.stroke();
      // tail lights: a full-width bar with brighter ends
      g.fillStyle = '#2a0206'; rr(g, -88, -59, 176, 10, 3);
      g.fillStyle = '#ff2a3c'; g.beginPath(); g.moveTo(-88, -58); g.lineTo(-56, -58); g.lineTo(-60, -50); g.lineTo(-86, -50); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(88, -58); g.lineTo(56, -58); g.lineTo(60, -50); g.lineTo(86, -50); g.closePath(); g.fill();
      g.fillStyle = '#ff6474'; g.fillRect(-84, -56, 24, 2); g.fillRect(60, -56, 24, 2);
      g.fillStyle = 'rgba(255,60,80,.75)'; g.fillRect(-54, -55, 108, 2);
      // number plate
      g.fillStyle = '#0c0f10'; rr(g, -23, -45, 46, 15, 2);
      g.fillStyle = '#dfe7e4'; rr(g, -21, -43.5, 42, 12, 1.5);
      g.fillStyle = '#16201b'; g.font = '700 8.5px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText('WPM 204', 0, -34.5);
      // cabin and rear window
      g.beginPath(); g.moveTo(-66, -70); g.lineTo(-46, -101); g.lineTo(46, -101); g.lineTo(66, -70); g.closePath();
      const cg = g.createLinearGradient(0, -101, 0, -70); cg.addColorStop(0, md); cg.addColorStop(1, dk); g.fillStyle = cg; g.fill();
      g.beginPath(); g.moveTo(-57, -72); g.lineTo(-41, -97); g.lineTo(41, -97); g.lineTo(57, -72); g.closePath();
      const wg = g.createLinearGradient(0, -97, 0, -72); wg.addColorStop(0, '#1d2a33'); wg.addColorStop(1, '#030507'); g.fillStyle = wg; g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(-30, -100); g.lineTo(-14, -100); g.lineTo(-38, -70); g.lineTo(-54, -70); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(-6, -100); g.lineTo(2, -100); g.lineTo(-22, -70); g.lineTo(-30, -70); g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(-45, -100.5); g.lineTo(45, -100.5); g.stroke();
      // rear wing on two struts
      g.fillStyle = dk2; g.fillRect(-52, -78, 6, 9); g.fillRect(46, -78, 6, 9);
      g.fillStyle = dk2; rr(g, -86, -84, 172, 8, 2);
      g.fillStyle = lt; g.fillRect(-84, -84, 168, 1.5);
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(-86, -77, 172, 1.5);
    });
  }

  // a glass and steel tower with lit windows, a neon edge and a roof light (x -55..55, y -h..0)
  function towerSprite(T, v) {
    const hgt = 300 + (v * 53) % 160, edge = col(T, T.lane);
    return sprite(`tower:${T.name}:${edge}:${v}`, 130, hgt + 40, 1.4, (g, w) => {
      g.translate(65, hgt + 40);
      const bg = g.createLinearGradient(0, -hgt, 0, 0); bg.addColorStop(0, '#04110b'); bg.addColorStop(1, '#010503');
      g.fillStyle = bg; g.fillRect(-55, -hgt, 110, hgt);
      // the side facing the road is lit a little
      g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(-55, -hgt, 22, hgt);
      let seed = v * 977 + 13;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let wy = -hgt + 18; wy < -18; wy += 16) for (let wx = -46; wx < 46; wx += 13) {
        const on = r();
        g.fillStyle = on > 0.62 ? rgba(col(T, T.win[on > 0.93 ? 1 : on > 0.86 ? 2 : 0]), 0.55 + r() * 0.4) : 'rgba(255,255,255,.035)';
        g.fillRect(wx, wy, 8, 9);
      }
      // neon edge and a band at the top
      g.strokeStyle = rgba(edge, 0.9); g.lineWidth = 2.4; g.strokeRect(-55, -hgt, 110, hgt);
      g.fillStyle = rgba(edge, 0.85); g.fillRect(-55, -hgt + 6, 110, 3);
      // a vertical sign
      if (v % 2) { g.fillStyle = '#020604'; g.fillRect(36, -hgt + 40, 14, 120); g.fillStyle = rgba(col(T, T.win[2]), 0.95); for (let k = 0; k < 6; k++) g.fillRect(39, -hgt + 46 + k * 19, 8, 12); }
      // roof mast
      g.fillStyle = '#0a1a12'; g.fillRect(-2, -hgt - 36, 4, 36);
    });
  }
  function billboardSprite(text, T) {
    const edge = col(T, T.lane);
    return sprite(`board:${text}:${edge}`, 260, 250, 1.4, (g) => {
      g.translate(130, 250);
      g.fillStyle = '#0d1512'; g.fillRect(-60, -160, 8, 160); g.fillRect(52, -160, 8, 160);
      g.fillStyle = '#18221d'; g.fillRect(-70, -160, 140, 6);
      g.fillStyle = '#020605'; g.fillRect(-120, -240, 240, 84);
      const bg = g.createLinearGradient(0, -236, 0, -160); bg.addColorStop(0, rgba(edge, 0.25)); bg.addColorStop(1, rgba(edge, 0.05));
      g.fillStyle = bg; g.fillRect(-116, -236, 232, 76);
      g.strokeStyle = edge; g.lineWidth = 4; g.strokeRect(-118, -238, 236, 80);
      g.fillStyle = '#f2fff8'; g.font = `700 ${text.length > 9 ? 32 : 42}px "Chakra Petch", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 0, -197);
      // spot lights under the board
      g.fillStyle = '#c9d6cf'; for (const x of [-80, 0, 80]) g.fillRect(x - 6, -154, 12, 5);
    });
  }
  function lampSprite() {
    return sprite('lamp', 80, 200, 1.6, (g) => {
      g.translate(20, 196);
      g.fillStyle = '#1c2622'; g.fillRect(-4, -176, 8, 176); g.fillRect(-7, -8, 14, 8);
      g.strokeStyle = '#1c2622'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -172); g.quadraticCurveTo(4, -186, 24, -186); g.lineTo(44, -184); g.stroke();
      g.fillStyle = '#2b3631'; rr(g, 30, -190, 26, 9, 3);
      g.fillStyle = '#fff3cf'; g.fillRect(33, -182, 20, 3);
    });
  }
  function palmSprite(v) {
    return sprite('palm:' + v, 240, 260, 1.4, (g) => {
      g.translate(120, 256);
      const lean = v ? 22 : -14;
      // trunk in rings
      for (let k = 0; k < 14; k++) {
        const t = k / 14, x = lean * t * t, y = -t * 190, w = 12 - t * 4;
        g.fillStyle = k % 2 ? '#4a3a28' : '#5c4731'; g.beginPath(); g.ellipse(x, y, w, 8, 0, 0, 7); g.fill();
      }
      const top = { x: lean, y: -192 };
      g.lineCap = 'round';
      for (let a = 0; a < 9; a++) {
        const ang = -Math.PI / 2 + (a - 4) * 0.42 + (v ? 0.1 : -0.1), len = 90 + (a % 3) * 14;
        const ex = top.x + Math.cos(ang) * len, ey = top.y + Math.sin(ang) * len * 0.45 + len * 0.35;
        const mx = top.x + Math.cos(ang) * len * 0.5, my = top.y + Math.sin(ang) * len * 0.6 - 18;
        g.strokeStyle = a % 2 ? '#1f5a3a' : '#2a6e47'; g.lineWidth = 7;
        g.beginPath(); g.moveTo(top.x, top.y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
        g.strokeStyle = 'rgba(20,60,40,.9)'; g.lineWidth = 2;
        for (let k = 1; k < 7; k++) {
          const t = k / 7, px = (1 - t) * (1 - t) * top.x + 2 * (1 - t) * t * mx + t * t * ex, py = (1 - t) * (1 - t) * top.y + 2 * (1 - t) * t * my + t * t * ey;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang + 1.2) * 14 * (1 - t), py + 12 * (1 - t)); g.stroke();
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang - 1.2) * 14 * (1 - t), py + 12 * (1 - t)); g.stroke();
        }
      }
      g.fillStyle = '#3b2c1c'; for (const [x, y] of [[-6, 4], [6, 6], [0, 10]]) { g.beginPath(); g.arc(top.x + x, top.y + y, 6, 0, 7); g.fill(); }
    });
  }
  function cactusSprite(v) {
    return sprite('cactus:' + v, 120, 150, 1.6, (g) => {
      g.translate(60, 148);
      const body = (x, y, w, h) => {
        const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0); gr.addColorStop(0, '#2c5634'); gr.addColorStop(0.45, '#4f8c55'); gr.addColorStop(1, '#203f27');
        g.fillStyle = gr; g.beginPath(); g.roundRect(x - w / 2, y, w, h, w / 2); g.fill();
      };
      body(0, -128, 22, 128);
      if (v) { body(-26, -96, 15, 50); body(-15, -56, 22, 13); } else { body(-26, -84, 15, 40); body(-15, -50, 22, 13); }
      body(26, -104, 15, 56); body(15, -56, 22, 13);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (const x of [-5, 0, 5]) { g.beginPath(); g.moveTo(x, -124); g.lineTo(x, -4); g.stroke(); }
    });
  }
  function pineSprite(v) {
    return sprite('pine:' + v, 140, 240, 1.5, (g) => {
      g.translate(70, 236);
      g.fillStyle = '#2a1f17'; g.fillRect(-6, -30, 12, 30);
      for (let l = 0; l < 4; l++) {
        const y = -224 + l * 46 + (v ? 6 : 0), w = 26 + l * 14;
        const gr = g.createLinearGradient(-w, 0, w, 0); gr.addColorStop(0, '#173328'); gr.addColorStop(0.5, '#25493b'); gr.addColorStop(1, '#10261d');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, y); g.lineTo(-w, y + 70); g.lineTo(w, y + 70); g.closePath(); g.fill();
        g.fillStyle = '#eef4f8'; g.beginPath(); g.moveTo(0, y); g.lineTo(-w * 0.42, y + 26); g.quadraticCurveTo(0, y + 20, w * 0.42, y + 26); g.closePath(); g.fill();
        g.fillStyle = 'rgba(238,244,248,.8)'; g.fillRect(-w, y + 66, w * 2, 4);
      }
    });
  }

  // the sky with its stars, horizon glow and moon or synth sun, all in one picture
  function skySprite(T) {
    return sprite(`sky:${T.name}:${col(T, T.sunCol[0])}`, W, H * 0.7, 1, (g) => {
      const h = H * 0.7;
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, T.sky[0]); gr.addColorStop(0.55, T.sky[1]); gr.addColorStop(1, T.sky[2]);
      g.fillStyle = gr; g.fillRect(0, 0, W, h);
    });
  }
  function sunSprite(T) {
    const c0 = col(T, T.sunCol[0]), c1 = col(T, T.sunCol[1]);
    return sprite(`sun:${T.name}:${c0}`, 220, 220, 1.5, (g) => {
      g.translate(110, 110);
      const hg = g.createRadialGradient(0, 0, 20, 0, 0, 110);
      hg.addColorStop(0, rgba(c0, 0.35)); hg.addColorStop(0.5, rgba(c0, 0.08)); hg.addColorStop(1, rgba(c0, 0));
      g.fillStyle = hg; g.fillRect(-110, -110, 220, 220);
      if (T.sun === 'synth') {
        const sg = g.createLinearGradient(0, -52, 0, 52); sg.addColorStop(0, c0); sg.addColorStop(1, c1);
        g.fillStyle = sg; g.beginPath(); g.arc(0, 0, 52, 0, 7); g.fill();
        // the classic cut lines, thicker toward the bottom
        g.globalCompositeOperation = 'destination-out';
        for (let k = 0; k < 7; k++) { const y = 6 + k * 7.2; g.fillRect(-60, y, 120, 1 + k * 0.7); }
        g.globalCompositeOperation = 'source-over';
      } else {
        const mg = g.createRadialGradient(-10, -10, 4, 0, 0, 34); mg.addColorStop(0, '#ffffff'); mg.addColorStop(1, c0);
        g.fillStyle = mg; g.beginPath(); g.arc(0, 0, 32, 0, 7); g.fill();
        g.fillStyle = rgba(c1, 0.35);
        for (const [x, y, r] of [[-10, -6, 7], [9, 8, 5], [12, -12, 4], [-4, 14, 3.5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      }
    });
  }
  // a skyline strip that tiles sideways: far = 0 is pale and low, far = 1 is dark and detailed
  function layerSprite(T, near) {
    const LW = W * 2, LH = 170;
    return sprite(`layer:${T.name}:${near}:${col(T, (T.win || ['#ffffff'])[0])}`, LW, LH, near ? 1.25 : 1, (g) => {
      let seed = near ? 4242 : 1717;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const base = T.hill[near ? 1 : 0];
      const fillWrap = (x, draw) => { draw(x); if (x > LW - 200) draw(x - LW); if (x < 200) draw(x + LW); };
      if (T.hills === 'city') {
        let x = 0;
        while (x < LW) {
          const bw = (near ? 46 : 30) + r() * (near ? 70 : 50), bh = (near ? 40 : 60) + r() * (near ? 90 : 100);
          const bx = x, seedB = r();
          fillWrap(bx, (xx) => {
            const gr = g.createLinearGradient(0, LH - bh, 0, LH); gr.addColorStop(0, shade(base, near ? 0.06 : 0.14)); gr.addColorStop(1, base);
            g.fillStyle = gr; g.fillRect(xx, LH - bh, bw - 3, bh);
            if (seedB > 0.6) { g.fillRect(xx + bw * 0.4, LH - bh - 14, 3, 14); }
            const wc = T.win;
            let s2 = Math.floor(seedB * 1e6) + 7;
            const r2 = () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; };
            for (let wy = LH - bh + 6; wy < LH - 6; wy += near ? 7 : 6) for (let wx = xx + 4; wx < xx + bw - 7; wx += near ? 6 : 5) {
              const q = r2();
              if (q > (near ? 0.72 : 0.84)) { g.fillStyle = rgba(col(T, wc[q > 0.95 ? 1 : 0]), near ? 0.7 : 0.4); g.fillRect(wx, wy, near ? 2.5 : 2, near ? 3 : 2); }
            }
            if (near && seedB > 0.8) { g.fillStyle = rgba(col(T, wc[2] || wc[0]), 0.9); g.fillRect(xx + 3, LH - bh + 4, bw - 9, 2); }
          });
          x += bw;
        }
      } else {
        // a ridge line from summed waves, so it repeats exactly across the strip
        const pts = [];
        for (let xx = 0; xx <= LW; xx += 4) {
          const u = xx / LW * Math.PI * 2;
          let y;
          if (T.hills === 'mesa') {
            // flat tops with sloped cliffs: a smooth step of a slow wave
            const m = Math.sin(u * 3 + 1) + 0.55 * Math.sin(u * 7 + 2) + 0.2 * Math.sin(u * 19);
            const top = clamp((m - 0.2) * 3.2, 0, 1), sm = top * top * (3 - 2 * top);
            y = near ? 128 - (Math.sin(u * 5) * 0.5 + 0.5) * 16 - Math.sin(u * 17) * 3 : 128 - sm * 78 - (1 - sm) * (Math.sin(u * 11) * 0.5 + 0.5) * 10 + (sm > 0.98 ? Math.sin(u * 40) * 1.5 : 0);
          } else if (T.hills === 'peaks') {
            // ridged noise: sharp crests from several waves
            const ridge = (f, ph) => 1 - Math.abs(Math.sin(u * f + ph));
            y = near ? 118 - ridge(9, 0.3) * 18 - ridge(23, 1.1) * 8 : 166 - ridge(3, 0.5) * 92 - ridge(7, 2.1) * 42 - ridge(17, 0.7) * 12;
          } else {
            y = near ? 120 - (Math.sin(u * 4) * 0.5 + 0.5) * 30 - Math.sin(u * 13) * 6 : 110 - (Math.sin(u * 3) * 0.5 + 0.5) * 55 - Math.sin(u * 8) * 10;
          }
          pts.push([xx, y]);
        }
        const gr = g.createLinearGradient(0, 30, 0, LH); gr.addColorStop(0, shade(base, near ? 0.05 : 0.18)); gr.addColorStop(1, base);
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, LH); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(LW, LH); g.closePath(); g.fill();
        // moonlight on the ridge
        g.strokeStyle = rgba('#ffffff', near ? 0.08 : 0.14); g.lineWidth = 1.2; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
        if (!near && (T.hills === 'peaks' || T.hills === 'mesa')) {
          g.save(); g.beginPath(); g.moveTo(0, LH); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(LW, LH); g.closePath(); g.clip();
          if (T.hills === 'peaks') {
            // snow above the snow line, ragged at its lower edge, lit on the side facing the moon
            const sg = g.createLinearGradient(0, 40, 0, 110); sg.addColorStop(0, 'rgba(236,244,252,.85)'); sg.addColorStop(1, 'rgba(200,220,240,.55)');
            g.fillStyle = sg; g.beginPath(); g.moveTo(0, 0);
            for (let xx = 0; xx <= LW; xx += 6) g.lineTo(xx, 92 + Math.sin(xx * 0.05) * 7 + Math.sin(xx * 0.13) * 5);
            g.lineTo(LW, 0); g.closePath(); g.fill();
            g.fillStyle = 'rgba(20,32,50,.35)';
            for (let k = 1; k < pts.length; k++) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; if (y1 > y0) g.fillRect(x0, y0, 4, 100 - y0); }
          } else {
            // rock layers across the mesas
            for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? 'rgba(255,190,140,.06)' : 'rgba(0,0,0,.12)'; g.fillRect(0, 54 + k * 9, LW, 4); }
          }
          g.restore();
        }
        if (near) {
          // a few lights on the hills: houses, a radio mast
          for (let k = 0; k < 28; k++) { const xx = r() * LW, yy = 128 + r() * 34; g.fillStyle = rgba('#ffd9a0', 0.5 + r() * 0.4); g.fillRect(xx, yy, 2, 2); }
        }
      }
    });
  }

  class View {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.onResize = () => this.fit();
      this.fit(); addEventListener('resize', this.onResize);
      this.parts = Array.from({ length: 140 }, () => ({ life: 0 }));
      this.lines = Array.from({ length: 36 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), w: 0.4 + Math.random() }));
      this.newCourse();
    }
    fit() {
      const dpr = Math.min(2, devicePixelRatio || 1), w = this.cv.clientWidth || W;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(w * H / W * dpr);
    }
    destroy() { removeEventListener('resize', this.onResize); }
    newCourse(seed, first, themeI) {
      let s = seed || Math.floor(Math.random() * 1e9);
      this.seed = s;
      const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      this.theme = themeI != null ? THEMES[themeI] : first ? THEMES[0] : THEMES[Math.floor(r() * THEMES.length)];
      const segs = [];
      let y = 0;
      const add = (n, curve, hill) => {
        const y0 = y;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          y = ease(y0, y0 + hill, t);
          segs.push({ curve: curve * Math.sin(t * Math.PI), y, prop: null });
        }
      };
      add(40, 0, 0);
      while (segs.length < 900) {
        const n = 30 + Math.floor(r() * 70);
        const curve = r() < 0.3 ? 0 : (r() * 2 - 1) * 5;
        const hill = r() < 0.4 ? 0 : (r() * 2 - 1) * 2400;
        add(n, curve, hill);
      }
      add(60, 0, -y);
      const T = this.theme;
      segs.forEach((g, i) => {
        if (i % 6 === 0 && i > 8) g.prop = { side: (i / 6) % 2 ? 1 : -1, kind: i % 54 === 0 ? 'board' : T.props, text: BOARDS[Math.floor(i / 54) % BOARDS.length], v: Math.floor(r() * 4) };
        // a second row of towers further out in the city
        if (T.props === 'neon' && i % 6 === 3) g.prop2 = { side: (i / 6 | 0) % 2 ? -1 : 1, kind: 'neon', v: Math.floor(r() * 4), far: true };
      });
      this.segs = segs;
      this.length = segs.length * SEG;
      this.finishSeg = segs.length - 70;
      this.startSeg = 14;
      this.bgX = 0;
      this.camZ = 0;
      this.speedShown = 0;
      this.shake = 0; this.kick = 0; this.flash = 0; this.flashCol = '#ffffff'; this.red = 0; this.lurch = 0;
      this.banners = []; this.result = null; this.lightsT0 = 0; this.lead = 0; this.boostWas = 0;
      this.coast = 0; this.coastV = 0; this.done = {};
      this.parts.forEach(p => { p.life = 0; });
      this.wordN = 0; this.youFinishedAt = 0;
    }
    trackZ(progress) { return Math.min(1, progress) * this.finishSeg * SEG; }

    // ---------- events from the game ----------
    countdown() { this.lightsT0 = performance.now(); }
    key(ok) {
      if (ok) { this.lurch = 1; if (Math.random() < 0.5) this.puff('pop'); }
      else { this.red = 1; this.shake = Math.min(1, this.shake + 0.35); for (let k = 0; k < 6; k++) this.puff('smoke'); }
    }
    word() { this.wordN++; this.kick = Math.min(1, this.kick + 0.35); for (let k = 0; k < 3; k++) this.puff('fire'); }
    banner(text, color, sub) { this.banners = this.banners.filter(b => b.text !== text); this.banners.push({ text, color, sub, t0: performance.now() }); if (this.banners.length > 2) this.banners.shift(); }
    // result: { title, sub, color, stats: [[label, value]], won }
    finish(result) {
      this.result = { ...result, t0: performance.now() };
      this.banners = [];
      this.flash = result.won === false ? 0.5 : 1; this.flashCol = result.won === false ? '#ff4d5e' : '#ffffff'; this.shake = Math.min(1, this.shake + 0.4);
      if (result.won !== false) for (let k = 0; k < 70; k++) this.puff('confetti');
    }
    puff(kind) {
      const p = this.parts.find(q => q.life <= 0); if (!p) return;
      const side = Math.random() < 0.5 ? -1 : 1;
      p.kind = kind;
      if (kind === 'smoke') { p.x = W / 2 + side * (60 + Math.random() * 20); p.y = H - 26; p.vx = side * (20 + Math.random() * 60); p.vy = -10 - Math.random() * 30; p.life = p.max = 0.7 + Math.random() * 0.4; p.s = 10 + Math.random() * 10; }
      else if (kind === 'pop' || kind === 'fire') { p.x = W / 2 + side * 53; p.y = H - 42; p.vx = side * Math.random() * 30; p.vy = 30 + Math.random() * 40; p.life = p.max = kind === 'fire' ? 0.3 : 0.18; p.s = kind === 'fire' ? 14 : 7; }
      else { p.x = W / 2 + (Math.random() - 0.5) * 300; p.y = H * 0.35; p.vx = (Math.random() - 0.5) * 520; p.vy = -120 - Math.random() * 260; p.life = p.max = 1.4 + Math.random() * 1.2; p.s = 3 + Math.random() * 4; p.rot = Math.random() * 6; p.c = [acc(), '#3ee6ff', '#ffffff', '#ffd166', '#ff6ad5'][Math.floor(Math.random() * 5)]; }
    }

    // ---------- the frame ----------
    draw(state, dt) {
      const ctx = this.ctx, T = this.theme, now = performance.now();
      const you = state.you;
      // on a small canvas (phones) the HUD, banners and result card draw bigger so they stay readable
      this.hk = clamp(760 / (this.cv.clientWidth || W), 1, 2);
      ctx.setTransform(this.cv.width / W, 0, 0, this.cv.height / H, 0, 0);
      // after the line the car rolls on and slows down
      if (you.progress >= 1) {
        if (!this.youFinishedAt) { this.youFinishedAt = now; this.coastV = Math.max(1600, (this.camZ - (this._prevZ || this.camZ)) / Math.max(dt, 0.001)); }
        this.coastV *= Math.exp(-dt * 0.9);
        this.coast = Math.min(this.coast + this.coastV * dt, 45 * SEG);
      }
      const target = this.trackZ(you.progress) + this.coast;
      const prev = this.camZ;
      this._prevZ = prev;
      this.camZ += (target - this.camZ) * Math.min(1, dt * 6);
      const moved = this.camZ - prev;
      const baseIdx = Math.floor(this.camZ / SEG) % this.segs.length;
      const base = this.segs[baseIdx];
      this.bgX += base.curve * moved * 0.00012;
      this.speedShown += (you.kmh - this.speedShown) * Math.min(1, dt * 4);
      const speed01 = clamp(this.speedShown / 320, 0, 1);

      // boost and overtakes become banners here, so the game only reports positions
      if (you.boost > 0 && !this.boostWas) { this.banner('BOOST', '#3ee6ff'); this.shake = Math.min(1, this.shake + 0.3); this.kick = 1; this.flash = 0.35; this.flashCol = '#3ee6ff'; this.onBoost && this.onBoost(); }
      this.boostWas = you.boost;
      const opp = state.others[0];
      if (opp && you.progress > 0.02 && you.progress < 1 && opp.progress < 1) {
        const d = you.progress - opp.progress, lead = d > 0.004 ? 1 : d < -0.004 ? -1 : this.lead;
        if (this.lead && lead !== this.lead) {
          if (lead > 0) { this.banner('OVERTAKE', acc(), `You passed ${opp.name}`); this.flash = 0.3; this.flashCol = acc(); this.onOvertake && this.onOvertake(true); }
          else { this.banner(`${opp.name.toUpperCase()} PASSED YOU`, opp.color); this.onOvertake && this.onOvertake(false); }
        }
        this.lead = lead;
      }
      if (you.progress >= 0.85 && !this.lastStretch && you.progress < 1) { this.lastStretch = true; this.banner('LAST STRETCH', '#ffd166'); }
      if (you.progress < 0.85) this.lastStretch = false;

      // juice decays every frame
      this.shake = Math.max(0, this.shake - dt * 1.8);
      this.kick = Math.max(0, this.kick - dt * 2.2);
      this.flash = Math.max(0, this.flash - dt * 2.4);
      this.red = Math.max(0, this.red - dt * 2.5);
      this.lurch = Math.max(0, this.lurch - dt * 9);

      ctx.save();
      const tr = this.shake * this.shake;
      if (tr > 0) ctx.translate(Math.sin(now / 23) * 7 * tr, Math.sin(now / 31 + 1) * 4 * tr);
      // a wider view while boosting, a little punch on each word
      const zoom = 1 + you.boost * 0.05 + this.kick * 0.018;
      if (zoom !== 1) { ctx.translate(W / 2, H * 0.55); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H * 0.55); }

      this.drawSky(ctx, T, now);

      // road from back to front, with hidden-line clipping on hills
      const camY = CAM_H + base.y;
      const playerX = -2 / 3;
      const basePct = (this.camZ % SEG) / SEG;
      let x = 0, dx = -(base.curve * basePct);
      let maxY = H;
      const proj = [];
      const camZ = this.camZ;
      const project = (wx, wy, wz, camX) => {
        const cz = wz - camZ;
        const sc = DEPTH / Math.max(1, cz);
        return { x: W / 2 + sc * (wx - camX) * W / 2, y: H / 2 - sc * (wy - camY) * H / 2, w: sc * ROAD * W / 2, sc };
      };
      this.project = project;
      for (let n = 0; n < DRAW; n++) {
        const i = baseIdx + n;
        if (i >= this.segs.length) break;
        const seg = this.segs[i];
        const yPrev = i > 0 ? this.segs[i - 1].y : 0;
        const z1 = i * SEG, z2 = z1 + SEG;
        const camX1 = playerX * ROAD - x, camX2 = playerX * ROAD - x - dx;
        const p1 = project(0, yPrev, z1, camX1), p2 = project(0, seg.y, z2, camX2);
        const P = { i, n, seg, p1, p2, camX1, camX2, z1, clip: maxY, visible: false };
        proj.push(P);
        x += dx; dx += seg.curve;
        if (z1 - camZ <= 1 || p2.y >= maxY) continue;
        P.visible = true;
        maxY = p2.y;
      }
      const fogRGB = T.fog;
      for (let n = proj.length - 1; n >= 0; n--) {
        const P = proj[n];
        if (!P.visible) continue;
        this.segment(ctx, P.i, P.p1, P.p2, Math.floor(P.i / 3) % 2, now, P.n);
        // distance haze: far strips fade into the fog colour
        const f = Math.pow(P.n / DRAW, 1.6);
        if (f > 0.04) { ctx.globalAlpha = Math.min(0.92, f * 1.15); ctx.fillStyle = fogRGB; ctx.fillRect(0, P.p2.y - 1, W, P.p1.y - P.p2.y + 2); ctx.globalAlpha = 1; }
      }
      // props, gantries and other cars from back to front
      const cars = state.others.map(o => {
        if (o.progress >= 1) { this.done[o.name] ||= now; }
        const ct = this.done[o.name] ? (now - this.done[o.name]) / 1000 : 0;
        return { ...o, wz: this.trackZ(o.progress) + (ct ? 40 * SEG * (1 - Math.exp(-ct * 0.45)) : 0) };
      });
      for (let n = proj.length - 1; n >= 0; n--) {
        const P = proj[n];
        if (P.z1 - camZ <= 1) continue;
        const fade = 1 - Math.pow(P.n / DRAW, 2);
        const mid = (P.camX1 + P.camX2) / 2;
        if (P.seg.prop2) {
          const pp = project(P.seg.prop2.side * ROAD * 2.6, P.seg.y, P.z1 + SEG / 2, mid);
          if (pp.y <= P.clip + 4) this.prop(ctx, P.seg.prop2, pp, fade * 0.8);
        }
        if (P.seg.prop) {
          const pp = project(P.seg.prop.side * ROAD * 1.4, P.seg.y, P.z1 + SEG / 2, mid);
          if (pp.y <= P.clip + 4) this.prop(ctx, P.seg.prop, pp, fade);
        }
        // reflector posts along both edges
        if (P.i % 2 === 0 && P.n < 70) {
          for (const sd of [-1, 1]) {
            const pp = project(sd * ROAD * 1.18, P.seg.y, P.z1, P.camX1);
            if (pp.y <= P.clip + 2) this.post(ctx, pp, sd, fade);
          }
        }
        if (P.i === this.finishSeg || P.i === this.startSeg) {
          const pp = project(0, P.seg.y, P.z1, P.camX1);
          if (pp.y <= P.clip + 4) this.gantry(ctx, P, project, P.i === this.finishSeg, now);
        }
        for (const c of cars) {
          if (c.wz >= P.z1 && c.wz < P.z1 + SEG) {
            const k = (c.wz - P.z1) / SEG;
            const cp = project(0, P.seg.y, c.wz, P.camX1 + (P.camX2 - P.camX1) * k);
            // a car level with yours is drawn beside you at most full size
            const sc = Math.min(0.92, cp.sc * 3000);
            const cy = Math.min(cp.y, H - 34);
            // close up it pulls over to the right so it never sits on top of your car
            const near = clamp((sc - 0.45) / 0.4, 0, 1);
            const cx = Math.min(cp.x + near * Math.max(0, W / 2 + 205 - cp.x), W - 110);
            if (cp.y <= P.clip + 6) this.car(ctx, cx, cy, sc, c.color, c.boost, 0, c.name, 0, now);
          }
        }
      }

      this.speedLines(ctx, you, speed01, dt);
      // your car at the front
      const sway = -base.curve * 6 + (you.skid > 0 ? Math.sin(now / 30) * 12 * (you.skid / 0.4) : 0);
      const bounce = Math.sin(now / 70) * Math.min(1.6, moved * 0.02) - this.lurch * 2;
      this.car(ctx, W / 2 + sway, H - 20 + bounce, 1.08, you.color, you.boost, base.curve, null, you.skid > 0 ? 1 : 0, now, true, speed01);
      this.drawParts(ctx, dt);
      ctx.restore();

      // screen tints sit over the world but under the HUD
      if (this.red > 0) this.vignette(ctx, '#ff2a3c', this.red * 0.4);
      if (you.boost > 0) this.vignette(ctx, '#3ee6ff', 0.22 * you.boost + Math.sin(now / 60) * 0.04);
      if (this.flash > 0) { ctx.globalAlpha = this.flash * 0.45; ctx.fillStyle = this.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

      this.hud(ctx, state, now, cars);
      this.drawBanners(ctx, now);
      this.lights(ctx, now);
      if (this.result) this.drawResult(ctx, now);
    }

    drawSky(ctx, T, now) {
      ctx.drawImage(skySprite(T).c, 0, 0, W, H * 0.7);
      // stars, a few of them twinkling
      if (!this.stars || this.stars.T !== T) {
        let s = 99; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        this.stars = { T, list: Array.from({ length: T.stars || 0 }, () => [r() * W * 2, r() * H * 0.42, r() < 0.15 ? 1.6 : 1, r() * 6]) };
      }
      const off = (this.bgX * 30) % (W * 2);
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy, sz, ph] of this.stars.list) {
        let xx = (sx - off) % (W * 2); if (xx < 0) xx += W * 2;
        if (xx > W) continue;
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now / 700 + ph * 3);
        ctx.fillRect(xx, sy, sz, sz);
      }
      ctx.globalAlpha = 1;
      const sun = sunSprite(T), sx = W * 0.66 - this.bgX * 40, sy = H * T.sunY;
      ctx.drawImage(sun.c, sx - 110, sy - 110, 220, 220);
      // skyline layers with parallax
      const hy = H * 0.56;
      for (const [near, par, top] of [[0, 0.3, hy - 112], [1, 0.6, hy - 104]]) {
        const L = layerSprite(T, near), LW = W * 2;
        let ox = -((this.bgX * par * 300) % LW); if (ox > 0) ox -= LW;
        ctx.drawImage(L.c, ox, top, LW, 170); ctx.drawImage(L.c, ox + LW, top, LW, 170);
      }
      // the horizon glow
      const hg = this._hg || (this._hg = {});
      const key = T.name + col(T, T.glow);
      if (hg.key !== key) {
        const g = ctx.createLinearGradient(0, hy - 70, 0, hy + 30);
        g.addColorStop(0, rgba(col(T, T.glow), 0)); g.addColorStop(0.7, rgba(col(T, T.glow), T.grid ? 0.22 : 0.12)); g.addColorStop(1, rgba(col(T, T.glow), 0));
        hg.key = key; hg.g = g;
      }
      ctx.fillStyle = hg.g; ctx.fillRect(0, hy - 70, W, 100);
      ctx.fillStyle = T.ground[0]; ctx.fillRect(0, hy + 60, W, H - hy - 60);
    }

    segment(ctx, i, p1, p2, alt, now, n) {
      const T = this.theme;
      const near = n < 70;
      ctx.fillStyle = T.ground[alt]; ctx.fillRect(0, p2.y - 1, W, p1.y - p2.y + 2);
      // quads are added to one path and filled together, one fill per colour
      const q = (x1, y1, w1, x2, y2, w2) => { ctx.moveTo(x1 - w1, y1 + 0.5); ctx.lineTo(x2 - w2, y2 - 0.5); ctx.lineTo(x2 + w2, y2 - 0.5); ctx.lineTo(x1 + w1, y1 + 0.5); ctx.closePath(); };
      const quad = (x1, y1, w1, x2, y2, w2, c) => { ctx.fillStyle = c; ctx.beginPath(); q(x1, y1, w1, x2, y2, w2); ctx.fill(); };
      const lane = col(T, T.lane);
      if (T.grid) {
        // a floor of grid lines that run toward the horizon
        ctx.fillStyle = lane;
        if (i % 4 === 0) { ctx.globalAlpha = 0.3; ctx.fillRect(0, p2.y, W, Math.max(1, (p1.y - p2.y) * 0.08)); }
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        const g1 = Math.max(0.4, p1.w / 160), g2 = Math.max(0.4, p2.w / 160);
        for (let k = 2.6; k <= 14; k += 1.5) {
          const a1 = p1.w * k * 0.5, a2 = p2.w * k * 0.5;
          if (p1.x - a1 > -20) q(p1.x - a1, p1.y, g1, p2.x - a2, p2.y, g2);
          if (p1.x + a1 < W + 20) q(p1.x + a1, p1.y, g1, p2.x + a2, p2.y, g2);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // shoulder, rumble strips, asphalt
      if (near && !T.grid) quad(p1.x, p1.y, p1.w * 1.16, p2.x, p2.y, p2.w * 1.16, shade(T.ground[alt], -0.25));
      const r1 = p1.w / (T.grid ? 16 : 9), r2 = p2.w / (T.grid ? 16 : 9);
      quad(p1.x, p1.y, p1.w + r1, p2.x, p2.y, p2.w + r2, alt ? col(T, T.rumble[1]) : (T.grid ? mix(col(T, T.rumble[0]), '#000000', 0.62) : col(T, T.rumble[0])));
      const finish = i >= this.finishSeg && i < this.finishSeg + 2, start = i >= this.startSeg - 1 && i < this.startSeg + 1;
      quad(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, T.road[alt]);
      if (finish || start) {
        // a real checker pattern, 10 squares across
        const rows = 2;
        ctx.fillStyle = start ? 'rgba(232,242,236,.75)' : '#e8f2ec';
        ctx.beginPath();
        for (let rI = 0; rI < rows; rI++) for (let c = 0; c < 10; c++) {
          if ((c + rI + i) % 2) continue;
          const ya = p1.y + (p2.y - p1.y) * rI / rows, yb = p1.y + (p2.y - p1.y) * (rI + 1) / rows;
          const xa = p1.x + (p2.x - p1.x) * rI / rows, xb = p1.x + (p2.x - p1.x) * (rI + 1) / rows;
          const wa = p1.w + (p2.w - p1.w) * rI / rows, wb = p1.w + (p2.w - p1.w) * (rI + 1) / rows;
          const fa = -1 + c * 0.2, fb = fa + 0.2;
          ctx.moveTo(xa + wa * fa, ya); ctx.lineTo(xb + wb * fa, yb); ctx.lineTo(xb + wb * fb, yb); ctx.lineTo(xa + wa * fb, ya); ctx.closePath();
        }
        ctx.fill();
      }
      if (p1.w < 3) return;
      // edge lines and lane dashes
      const e1 = Math.max(0.5, p1.w / 46), e2 = Math.max(0.5, p2.w / 46);
      ctx.fillStyle = col(T, T.edge); ctx.beginPath();
      q(p1.x - p1.w * 0.96, p1.y, e1, p2.x - p2.w * 0.96, p2.y, e2);
      q(p1.x + p1.w * 0.96, p1.y, e1, p2.x + p2.w * 0.96, p2.y, e2);
      ctx.fill();
      if (!alt && !finish) {
        const l1 = p1.w / 64, l2 = p2.w / 64;
        ctx.globalAlpha = 0.85; ctx.fillStyle = lane; ctx.beginPath();
        for (let k = 1; k < LANES; k++) {
          const f = -1 + (2 * k) / LANES;
          q(p1.x + p1.w * f, p1.y, l1, p2.x + p2.w * f, p2.y, l2);
        }
        ctx.fill(); ctx.globalAlpha = 1;
      }
      // neon edges glow onto the asphalt in the city
      if (T.grid && p1.w > 30) {
        ctx.globalAlpha = 0.07; ctx.fillStyle = lane; ctx.beginPath();
        q(p1.x - p1.w * 0.9, p1.y, p1.w * 0.1, p2.x - p2.w * 0.9, p2.y, p2.w * 0.1);
        q(p1.x + p1.w * 0.9, p1.y, p1.w * 0.1, p2.x + p2.w * 0.9, p2.y, p2.w * 0.1);
        ctx.fill(); ctx.globalAlpha = 1;
      }
    }

    post(ctx, p, side, fade) {
      const s = p.sc * 1600; if (s < 0.05) return;
      const h = 26 * s, w = Math.max(1, 4 * s);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#c9d2cf'; ctx.fillRect(p.x - w / 2, p.y - h, w, h);
      ctx.fillStyle = side < 0 ? '#ff9f43' : '#ff4d5e'; ctx.fillRect(p.x - w / 2, p.y - h * 0.85, w, h * 0.22);
      if (s > 0.2) { ctx.globalCompositeOperation = 'lighter'; const gs = 26 * s; stamp(ctx, glow(side < 0 ? '#ff9f43' : '#ff4d5e'), p.x, p.y - h * 0.75, gs, gs); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
    }

    // the start and finish arches: two pillars, a beam with a banner, lights
    gantry(ctx, P, project, finish, now) {
      const T = this.theme, y0 = P.seg.y, z = P.z1;
      const L = project(-ROAD * 1.22, y0, z, P.camX1), R = project(ROAD * 1.22, y0, z, P.camX1);
      const Lt = project(-ROAD * 1.22, y0 + 1500, z, P.camX1);
      const s = L.sc * W / 2;            // pixels per world unit
      if (s * 2000 < 6) return;
      const top = Lt.y, pw = Math.max(2, 90 * s), bh = Math.max(3, 360 * s);
      const lane = col(T, T.lane);
      for (const X of [L.x, R.x]) {
        if (X + pw < 0 || X - pw > W) continue;
        const mg = ctx.createLinearGradient(X - pw / 2, 0, X + pw / 2, 0);
        mg.addColorStop(0, '#3a4541'); mg.addColorStop(0.35, '#1c2421'); mg.addColorStop(1, '#0a0f0d');
        ctx.fillStyle = mg; ctx.fillRect(X - pw / 2, top, pw, L.y - top);
        ctx.fillStyle = lane; ctx.fillRect(X - pw * 0.08, top + bh, Math.max(1, pw * 0.16), L.y - top - bh);
      }
      const bg = ctx.createLinearGradient(0, top - bh * 0.1, 0, top + bh * 0.9);
      bg.addColorStop(0, '#2a3430'); bg.addColorStop(0.15, '#121a17'); bg.addColorStop(1, '#070b09');
      ctx.fillStyle = bg; ctx.fillRect(L.x - pw / 2, top - bh * 0.1, R.x - L.x + pw, bh);
      ctx.fillStyle = lane; ctx.fillRect(L.x - pw / 2, top - bh * 0.1, R.x - L.x + pw, Math.max(1, bh * 0.04));
      if (finish) {
        // checkered banner
        const cells = 16, cw = (R.x - L.x) / cells, chh = bh * 0.5;
        for (let r = 0; r < 2; r++) for (let c = 0; c < cells; c++) { ctx.fillStyle = (c + r) % 2 ? '#0a0f0c' : '#e8f2ec'; ctx.fillRect(L.x + c * cw, top + r * chh / 2, cw + 0.5, chh / 2 + 0.5); }
        if (bh > 14) { ctx.fillStyle = '#f2fff8'; ctx.font = `700 ${Math.round(bh * 0.36)}px "Chakra Petch", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FINISH', (L.x + R.x) / 2, top + bh * 0.68); ctx.textBaseline = 'alphabetic'; }
        ctx.fillStyle = lane; ctx.fillRect(L.x, top + bh * 0.88, R.x - L.x, Math.max(1, bh * 0.04));
      } else {
        // start lights: five pods, red as the count runs, green on GO
        const e = this.lightsT0 ? (now - this.lightsT0) / 1000 : -1;
        const lit = e < 0 ? 0 : Math.min(3, Math.floor(e) + 1), go = e >= 3;
        const n = 5, gap = (R.x - L.x) / (n + 1), r = Math.max(1.5, bh * 0.22);
        for (let k = 1; k <= n; k++) {
          const x = L.x + gap * k, y = top + bh * 0.42;
          ctx.fillStyle = '#020403'; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, 7); ctx.fill();
          const on = go || (k - 1) < lit * 5 / 3;
          const c = go ? '#39ff88' : '#ff2a3c';
          ctx.fillStyle = on ? c : '#2a0a0d'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          if (on) { ctx.globalCompositeOperation = 'lighter'; stamp(ctx, glow(c), x, y, r * 9, r * 9); ctx.globalCompositeOperation = 'source-over'; }
        }
        if (bh > 14) { ctx.fillStyle = rgba(lane, 0.9); ctx.font = `600 ${Math.round(bh * 0.2)}px "Share Tech Mono", monospace`; ctx.textAlign = 'center'; ctx.fillText('STORMTYPER GP', (L.x + R.x) / 2, top + bh * 0.84); }
      }
    }

    prop(ctx, pr, p, fade) {
      const s = p.sc * 1600;
      if (s < 0.015) return;
      const T = this.theme;
      ctx.globalAlpha = fade;
      let sp, ax = 0.5;
      if (pr.kind === 'board') sp = billboardSprite(pr.text, T);
      else if (pr.kind === 'neon') sp = towerSprite(T, pr.v);
      else if (pr.kind === 'lamp') { sp = lampSprite(); ax = 0.25; }
      else if (pr.kind === 'palm') sp = palmSprite(pr.v % 2);
      else if (pr.kind === 'cactus') sp = cactusSprite(pr.v % 2);
      else if (pr.kind === 'pine') sp = pineSprite(pr.v % 2);
      if (!sp) { ctx.globalAlpha = 1; return; }
      const w = sp.w * s, h = sp.h * s;
      // lamps lean their arm over the road, so the right-hand ones are mirrored
      const flip = pr.kind === 'lamp' && pr.side > 0;
      if (flip) { ctx.save(); ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.drawImage(sp.c, -w * ax, p.y - h, w, h); ctx.restore(); }
      else ctx.drawImage(sp.c, p.x - w * ax, p.y - h, w, h);
      ctx.globalCompositeOperation = 'lighter';
      if (pr.kind === 'lamp' && s > 0.05) {
        const lx = p.x + (flip ? -1 : 1) * 23 * s, ly = p.y - 182 * s;
        stamp(ctx, glow('#ffd58a'), lx, ly, 120 * s, 120 * s);
        // the pool of light on the road
        ctx.globalAlpha = fade * 0.5; stamp(ctx, glow('#ffcf7a'), lx, p.y - 4 * s, 260 * s, 50 * s); ctx.globalAlpha = fade;
      } else if (pr.kind === 'neon' && s > 0.05 && !pr.far) {
        const hgt = 300 + (pr.v * 53) % 160;
        ctx.globalAlpha = fade * (0.6 + 0.4 * Math.sin(performance.now() / 300 + pr.v));
        stamp(ctx, glow('#ff2a3c'), p.x, p.y - (hgt + 36) * s, 30 * s, 30 * s);
        ctx.globalAlpha = fade;
      } else if (pr.kind === 'board' && s > 0.05) {
        ctx.globalAlpha = fade * 0.5; stamp(ctx, glow(col(T, T.lane)), p.x, p.y - 197 * s, 300 * s, 120 * s); ctx.globalAlpha = fade;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    car(ctx, x, y, s, color, boost, curve, label, brake, now, mine, speed01 = 0) {
      const sp = carSprite(color);
      // ground shadow and the underglow
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.ellipse(x, y + 2 * s, 100 * s, 12 * s, 0, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55; stamp(ctx, glow(color), x, y - 2 * s, 260 * s, 34 * s); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // a slight lean into the curve
      const lean = clamp(-curve * 0.012, -0.05, 0.05);
      ctx.save(); ctx.translate(x, y); if (lean) ctx.rotate(lean);
      ctx.drawImage(sp.c, -100 * s, -108 * s, 200 * s, 116 * s);
      ctx.restore();
      // tail lights glow, much brighter on the brakes
      ctx.globalCompositeOperation = 'lighter';
      const tl = brake ? 1 : 0.45;
      ctx.globalAlpha = tl; for (const lx of [-72, 72]) stamp(ctx, glow('#ff2a3c'), x + lx * s, y - 54 * s, (brake ? 120 : 70) * s, (brake ? 60 : 34) * s);
      ctx.globalAlpha = 0.5 * tl; stamp(ctx, glow('#ff2a3c'), x, y - 54 * s, 220 * s, 26 * s);
      ctx.globalAlpha = 1;
      // boost flames from both pipes, flickering
      if (boost > 0 && s > 0.2) {
        for (const ex of [-46, 46]) {
          const f = 0.75 + Math.random() * 0.5, len = (26 + 30 * boost) * f * s;
          stamp(ctx, glow('#3ee6ff'), x + ex * s, y - 16 * s + len * 0.25, 46 * s * f, len * 1.3);
          stamp(ctx, glow('#ffffff'), x + ex * s, y - 18 * s, 18 * s, 14 * s);
          stamp(ctx, glow('#5f7bff'), x + ex * s, y - 10 * s + len * 0.5, 30 * s, len);
        }
      } else if (mine && speed01 > 0.05) {
        for (const ex of [-46, 46]) { ctx.globalAlpha = 0.35 * speed01; stamp(ctx, glow('#ff8a3d'), x + ex * s, y - 18 * s, 22 * s, 16 * s); }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      if (label && s > 0.12) {
        const ly = y - 118 * s - 6;
        ctx.font = '600 13px "Share Tech Mono", monospace'; ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(3,7,5,.85)'; ctx.beginPath(); ctx.roundRect(x - tw / 2 - 7, ly - 15, tw + 14, 20, 4); ctx.fill();
        ctx.fillStyle = color; ctx.fillRect(x - tw / 2 - 7, ly + 5, tw + 14, 2);
        ctx.beginPath(); ctx.moveTo(x - 4, ly + 7); ctx.lineTo(x + 4, ly + 7); ctx.lineTo(x, ly + 11); ctx.fill();
        ctx.fillText(label, x, ly);
      }
    }

    speedLines(ctx, you, speed01, dt) {
      const k = Math.max(0, speed01 - 0.35) * 0.6 + you.boost;
      if (k <= 0.02) return;
      const cx = W / 2, cy = H * 0.52;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = you.boost > 0 ? 'rgba(160,240,255,1)' : 'rgba(255,255,255,1)';
      for (const L of this.lines) {
        L.r += dt * (0.7 + k * 1.6) * (0.6 + L.w * 0.6);
        if (L.r > 1) { L.r = 0.05; L.a = Math.random() * Math.PI * 2; }
        const r0 = 120 + L.r * 520, r1 = r0 + 40 + 120 * k * L.r;
        const ca = Math.cos(L.a), sa = Math.sin(L.a) * 0.55;
        // keep the lines off the middle where the road and cars are
        if (Math.abs(ca) < 0.35 && sa > 0) continue;
        ctx.globalAlpha = Math.min(0.5, k * 0.45) * L.r;
        ctx.lineWidth = L.w * (1 + you.boost);
        ctx.beginPath(); ctx.moveTo(cx + ca * r0, cy + sa * r0); ctx.lineTo(cx + ca * r1, cy + sa * r1); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    drawParts(ctx, dt) {
      for (const p of this.parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        const k = Math.max(0, p.life / p.max);
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'smoke') {
          p.vy -= 8 * dt; p.s += dt * 30;
          ctx.globalAlpha = 0.5 * k; stamp(ctx, glow('#aab5b0'), p.x, p.y, p.s * 3, p.s * 2.4);
        } else if (p.kind === 'confetti') {
          p.vy += 420 * dt; p.vx *= 1 - dt * 1.2; p.rot += dt * 8;
          ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.c;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s, -p.s * 0.4, p.s * 2, p.s * 0.8); ctx.restore();
        } else {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
          stamp(ctx, glow(p.kind === 'fire' ? '#ff8a3d' : '#ffd08a'), p.x, p.y, p.s * 2 * (1.5 - k * 0.5), p.s * 2 * (1.5 - k * 0.5));
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = 1;
    }

    vignette(ctx, color, a) {
      if (a <= 0) return;
      const v = this._vig || (this._vig = {});
      if (!v[color]) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
        g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, 1));
        v[color] = g;
      }
      ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = v[color]; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }

    lights(ctx, now) {
      // after GO the start gantry is behind; nothing else to draw here
    }

    drawBanners(ctx, now) {
      this.banners = this.banners.filter(b => now - b.t0 < 1500);
      this.banners.forEach((b, i) => {
        const e = (now - b.t0) / 1000;
        const inK = Math.min(1, e / 0.18), outK = e > 1.2 ? 1 - (e - 1.2) / 0.3 : 1;
        const a = Math.max(0, Math.min(inK, outK));
        const hk = Math.min(1.6, this.hk || 1), y = (112 + i * 52) * hk, sc = (1 + (1 - inK) * 0.4) * hk;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(sc, sc);
        ctx.font = 'italic 700 34px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(b.text).width;
        ctx.fillStyle = 'rgba(2,6,4,.72)'; ctx.beginPath(); ctx.moveTo(-tw / 2 - 26, -22); ctx.lineTo(tw / 2 + 34, -22); ctx.lineTo(tw / 2 + 26, 22); ctx.lineTo(-tw / 2 - 34, 22); ctx.fill();
        ctx.fillStyle = b.color; ctx.fillRect(-tw / 2 - 30, 20, tw + 60, 3);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.5; stamp(ctx, glow(b.color), 0, 0, tw + 120, 80); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.fillStyle = '#f4fff9'; ctx.fillText(b.text, 0, 1);
        if (b.sub) { ctx.font = '13px "Share Tech Mono", monospace'; ctx.fillStyle = b.color; ctx.fillText(b.sub, 0, 36); }
        ctx.restore();
      });
      ctx.textBaseline = 'alphabetic';
    }

    drawResult(ctx, now) {
      const R = this.result, e = (now - R.t0) / 1000;
      const k = Math.min(1, e / 0.35), ek = 1 - Math.pow(1 - k, 3);
      const w = 540, h = 156, x = W / 2 - w / 2, y = 96 + (1 - ek) * 30;
      ctx.save(); ctx.globalAlpha = ek;
      const rk = Math.min(1.7, this.hk || 1);
      if (rk > 1) { ctx.translate(W / 2, 40); ctx.scale(rk, rk); ctx.translate(-W / 2, -40); }
      ctx.fillStyle = 'rgba(2,6,4,.86)';
      ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 14); ctx.lineTo(x + w - 14, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = R.color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = R.color; ctx.fillRect(x, y + h - 3, w * ek, 3);
      // the place, big
      ctx.font = 'italic 700 56px "Chakra Petch", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ek * 0.45; stamp(ctx, glow(R.color), x + 80, y + 52, 200, 110); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ek;
      ctx.fillStyle = R.color; ctx.fillText(R.title, x + 26, y + 70);
      const tw = ctx.measureText(R.title).width;
      ctx.font = '600 18px "Chakra Petch", sans-serif'; ctx.fillStyle = '#eafff3';
      ctx.fillText(R.sub, x + 40 + tw, y + 46);
      if (R.sub2) { ctx.font = '13px "Share Tech Mono", monospace'; ctx.fillStyle = 'rgba(234,255,243,.6)'; ctx.fillText(R.sub2, x + 40 + tw, y + 68); }
      // the numbers
      const cw = (w - 52) / R.stats.length;
      R.stats.forEach(([lab, val], i) => {
        const cx = x + 26 + i * cw;
        const kk = clamp((e - 0.25 - i * 0.1) / 0.25, 0, 1);
        ctx.globalAlpha = ek * kk;
        ctx.font = '12px "Share Tech Mono", monospace'; ctx.fillStyle = 'rgba(234,255,243,.55)'; ctx.fillText(lab, cx, y + 104);
        ctx.font = '600 23px "JetBrains Mono", monospace'; ctx.fillStyle = '#f4fff9'; ctx.fillText(val, cx, y + 134);
      });
      ctx.restore();
    }

    hud(ctx, st, now, cars) {
      const you = st.you;
      const G = acc(), INK = '#eafff3', CY = '#3ee6ff';
      // course map along the top, each car a small marker
      const k = this.hk || 1;
      const mx = 20 + 130 * k, my = 24 * Math.min(k, 1.4), mw = W - mx - 40;
      ctx.fillStyle = 'rgba(2,6,4,.7)'; ctx.beginPath(); ctx.roundRect(mx - 10, my - 9, mw + 20, 18, 9); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(mx, my - 1, mw, 2);
      for (let k = 1; k < 10; k++) ctx.fillRect(mx + mw * k / 10 - 0.5, my - 3, 1, 6);
      // the finish flag
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { ctx.fillStyle = (r + c) % 2 ? '#0a0f0c' : '#e8f2ec'; ctx.fillRect(mx + mw + 2 + c * 4, my - 7 + r * 4, 4, 4); }
      ctx.fillStyle = G; ctx.fillRect(mx, my - 1, mw * clamp(you.progress, 0, 1), 2);
      const marks = st.others.map(o => [o.progress, o.color, o.name]).concat([[you.progress, you.color, you.name]]);
      let lastX = -99;
      marks.forEach(([p, c, n], i) => {
        const xx = mx + mw * clamp(p, 0, 1);
        ctx.fillStyle = 'rgba(2,6,4,.9)'; ctx.beginPath(); ctx.arc(xx, my, 7 * k, 0, 7); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(xx, my, 5 * k, 0, 7); ctx.fill();
        ctx.font = `${Math.round(12 * k)}px "Share Tech Mono", monospace`; ctx.textAlign = 'center';
        const flip = Math.abs(xx - lastX) < 60 * k;
        ctx.fillText(n, xx, flip ? my + 37 * k : my + 22 * k);
        lastX = xx;
      });
      // position and gap at the top left
      const opp = st.others[0];
      ctx.save(); ctx.scale(k, k);
      if (opp) {
        const ahead = you.progress >= opp.progress;
        const place = you.progress >= 1 && opp.progress >= 1 ? (this.result && this.result.won ? 1 : 2) : ahead ? 1 : 2;
        ctx.textAlign = 'left';
        ctx.font = 'italic 700 34px "Chakra Petch", sans-serif'; ctx.fillStyle = place === 1 ? G : INK;
        ctx.fillText('P' + place, 20, 42);
        ctx.font = '13px "Share Tech Mono", monospace'; ctx.fillStyle = 'rgba(234,255,243,.55)'; ctx.fillText('/ 2', 72, 42);
        const gapM = Math.round(Math.abs(you.progress - opp.progress) * this.finishSeg * SEG / 100);
        if (you.progress > 0.005 && you.progress < 1) {
          const gt = gapM < 2 ? `${opp.name} level` : `${opp.name} ${gapM} m ${ahead ? 'behind' : 'ahead'}`;
          ctx.font = '13px "Share Tech Mono", monospace';
          ctx.fillStyle = 'rgba(2,6,4,.72)'; ctx.fillRect(16, 50, ctx.measureText(gt).width + 8, 17);
          ctx.fillStyle = opp.color; ctx.fillText(gt, 20, 62);
        }
      }
      ctx.restore();
      // speedometer: ticks, the arc, a digital readout and the boost bar
      const sk = Math.min(k, 1.45);
      ctx.save(); ctx.translate(W, H); ctx.scale(sk, sk); ctx.translate(-W, -H);
      const cx = W - 84, cy = H - 62, r = 50;
      ctx.fillStyle = 'rgba(2,6,4,.82)'; ctx.beginPath(); ctx.arc(cx, cy, r + 12, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r + 12, 0, 7); ctx.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      for (let k = 0; k <= 16; k++) {
        const a = a0 + (a1 - a0) * k / 16, big = k % 4 === 0;
        ctx.strokeStyle = k >= 13 ? 'rgba(255,77,94,.8)' : big ? 'rgba(234,255,243,.6)' : 'rgba(234,255,243,.25)';
        ctx.lineWidth = big ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - (big ? 9 : 5)), cy + Math.sin(a) * (r - (big ? 9 : 5))); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
      }
      const f = clamp(this.speedShown / 400, 0, 1);
      const arcC = you.boost > 0 ? CY : G;
      ctx.strokeStyle = arcC; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, r + 5, a0, a0 + (a1 - a0) * f); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
      const na = a0 + (a1 - a0) * f; stamp(ctx, glow(arcC), cx + Math.cos(na) * (r + 5), cy + Math.sin(na) * (r + 5), 34, 34);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = INK; ctx.font = '600 28px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(this.speedShown)), cx, cy + 8);
      ctx.fillStyle = 'rgba(234,255,243,.5)'; ctx.font = '11px "Share Tech Mono", monospace'; ctx.fillText('KM/H', cx, cy + 24);
      // boost bar: fills with the run of correct letters, glows once it is on
      const bw = 92, bx = cx - bw / 2, by = cy + 34;
      const fill = you.boost > 0 ? 1 : clamp((you.streak || 0) / BOOST_AT, 0, 1);
      ctx.fillStyle = 'rgba(2,6,4,.9)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
      for (let k = 0; k < 12; k++) {
        const on = k < Math.round(fill * 12);
        ctx.fillStyle = on ? (you.boost > 0 ? CY : rgba(CY, 0.55)) : 'rgba(255,255,255,.08)';
        ctx.fillRect(bx + k * (bw / 12) + 0.5, by, bw / 12 - 1.5, 5);
      }
      ctx.font = '10px "Share Tech Mono", monospace'; ctx.fillStyle = you.boost > 0 ? CY : 'rgba(234,255,243,.45)'; ctx.textAlign = 'right';
      ctx.fillText(you.boost > 0 ? 'BOOST' : 'NITRO', bx - 6, by + 6);
      ctx.restore();
      if (k < 1.3) {
        ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(234,255,243,.4)'; ctx.font = '12px "Share Tech Mono", monospace';
        ctx.fillText('// ' + this.theme.name.toUpperCase(), 20, H - 16);
      }
    }
  }
  View.THEMES = THEMES;
  // the picker's preview screen draws the same cars
  View.carSprite = carSprite; View.glow = glow;
  return View;
})();
