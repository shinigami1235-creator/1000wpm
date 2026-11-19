// Typo Horde drawing. Everything is drawn in code on a 960 x 540 canvas.
window.HordeArt = (() => {
  const W = 960, H = 540, HZ = 214, VX = W / 2;
  const proj = z => 0.4 / (0.4 + Math.max(0, z) * 2.2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h, a = 1) => {
    const n = parseInt(h.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const mixHex = (h1, h2, t) => {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = [16, 8, 0].map(s => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const rnd = s => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };

  // ---------- scenes ----------
  // Each scene is a corridor toward a vanishing point. Props sit on the side walls
  // every few metres and slide toward the camera while the player moves.
  const SCENES = {
    room: {
      sky: ['#14121a', '#1d1a24'], wall: '#2a2531', wallFar: '#17151c', floor: '#3a2d26', floorLine: '#4a3a31',
      ceil: '#0f0e13', light: '#f2c230', fog: '#151318', lamp: '#ffd36b',
    },
    market: {
      sky: ['#0b1020', '#1a1f33'], wall: '#2a2228', wallFar: '#14111a', floor: '#1d1d22', floorLine: '#2c2c33',
      ceil: null, light: '#ff9a52', fog: '#141620', lamp: '#ffb36b', wet: true,
    },
    subway: {
      sky: ['#0d1110', '#121816'], wall: '#55635c', wallFar: '#1a201d', floor: '#2b2f2d', floorLine: '#3b403d',
      ceil: '#1a1f1d', light: '#d8f0e4', fog: '#121614', lamp: '#e8fff4', rails: true,
    },
    factory: {
      sky: ['#140f0b', '#1e1712'], wall: '#3a3029', wallFar: '#1a1511', floor: '#3b3833', floorLine: '#4b4740',
      ceil: '#120e0b', light: '#ff8a2a', fog: '#18120d', lamp: '#ffac5a',
    },
    server: {
      sky: ['#070b12', '#0c1420'], wall: '#141c28', wallFar: '#0a0f17', floor: '#18202b', floorLine: '#243042',
      ceil: '#070a10', light: '#5fb0ff', fog: '#0a0f17', lamp: '#8ccbff', alarm: true,
    },
  };

  function wallX(p, side) { return VX + side * (W * 0.44) * p; }
  function floorY(p) { return HZ + p * (H - HZ + 40); }
  function ceilY(p) { return HZ - p * (HZ + 60); }

  function drawScene(ctx, name, travel, t, alarm) {
    const S = SCENES[name];
    // back
    const g = ctx.createLinearGradient(0, 0, 0, HZ);
    g.addColorStop(0, S.sky[0]); g.addColorStop(1, S.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawBack(ctx, name, S, t);
    // floor
    const fp = proj(1.2);
    ctx.fillStyle = S.floor;
    ctx.beginPath(); ctx.moveTo(wallX(fp, -1), floorY(fp)); ctx.lineTo(wallX(fp, 1), floorY(fp)); ctx.lineTo(W + 600, H + 40); ctx.lineTo(-600, H + 40); ctx.fill();
    // floor bands that scroll
    ctx.strokeStyle = S.floorLine; ctx.lineWidth = 1;
    const step = 0.08, off = (travel % step);
    for (let z = 1.2 - off; z > -0.05; z -= step) {
      const p = proj(z), y = floorY(p);
      ctx.globalAlpha = 0.3 + 0.7 * p;
      ctx.beginPath(); ctx.moveTo(wallX(p, -1), y); ctx.lineTo(wallX(p, 1), y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = -6; i <= 6; i++) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(VX + i * 14 * fp * 4, floorY(fp)); ctx.lineTo(VX + i * 150, H + 40); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (S.rails) {
      ctx.strokeStyle = '#8a8f8c'; ctx.lineWidth = 3;
      for (const sx of [-0.22, 0.22]) {
        ctx.beginPath(); ctx.moveTo(VX + sx * W * 0.62 * fp, floorY(fp)); ctx.lineTo(VX + sx * W * 0.62 * 1.3, H + 40); ctx.stroke();
      }
    }
    if (S.wet) {
      // lamp reflections on the wet street
      for (let k = 0; k < 6; k++) {
        const z = ((k * 0.2 - travel * 0.5) % 1.2 + 1.2) % 1.2;
        const p = proj(z);
        ctx.fillStyle = hex(k % 2 ? '#ff9a52' : '#ff5f6d', 0.08 * p + 0.03);
        ctx.fillRect(wallX(p, k % 2 ? 1 : -1) * 0.6 + VX * 0.4 - 20 * p, floorY(p), 40 * p, 120 * p);
      }
    }
    // walls
    for (const side of [-1, 1]) {
      const wg = ctx.createLinearGradient(side < 0 ? 0 : W, 0, VX, 0);
      wg.addColorStop(0, S.wall); wg.addColorStop(1, S.wallFar);
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.moveTo(wallX(fp, side), floorY(fp));
      ctx.lineTo(wallX(fp, side), S.ceil ? ceilY(fp) : HZ - 120 * fp - 40);
      ctx.lineTo(side < 0 ? -10 : W + 10, S.ceil ? -10 : 40);
      ctx.lineTo(side < 0 ? -10 : W + 10, H + 10);
      ctx.fill();
    }
    if (S.ceil) {
      ctx.fillStyle = S.ceil;
      ctx.beginPath(); ctx.moveTo(wallX(fp, -1), ceilY(fp)); ctx.lineTo(wallX(fp, 1), ceilY(fp)); ctx.lineTo(W + 10, -10); ctx.lineTo(-10, -10); ctx.fill();
    }
    // things on the walls, far to near
    const spacing = 0.22, span = spacing * 8;
    const items = [];
    for (let k = 0; k < 8; k++) {
      const z = ((k * spacing - travel) % span + span) % span - 0.05;
      const id = Math.round((travel + z) / spacing);
      items.push({ z, id });
    }
    items.sort((a, b) => b.z - a.z);
    wallLines(ctx, name, S, t);
    for (const it of items) {
      for (const side of [-1, 1]) drawProp(ctx, name, S, it.z, side, it.id * 2 + (side > 0 ? 1 : 0), t);
      drawCeilingLight(ctx, S, proj(it.z), t, it.id);
    }
    // fog toward the back
    const fg = ctx.createRadialGradient(VX, HZ, 10, VX, HZ, 360);
    fg.addColorStop(0, hex(S.fog, 0.9)); fg.addColorStop(1, hex(S.fog, 0));
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    if (S.alarm || alarm) {
      const a = (Math.sin(t * 4) * 0.5 + 0.5) * 0.12;
      ctx.fillStyle = `rgba(229,60,60,${a})`; ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBack(ctx, name, S, t) {
    const p = proj(1.2), y0 = ceilY(p), y1 = floorY(p), x0 = wallX(p, -1), x1 = wallX(p, 1);
    ctx.fillStyle = S.wallFar; ctx.fillRect(x0, S.ceil ? y0 : HZ - 120, x1 - x0, y1 - (S.ceil ? y0 : HZ - 120));
    if (name === 'room') {
      // the stream monitor at the end of the room
      ctx.fillStyle = '#0b0b0e'; ctx.fillRect(VX - 52, HZ - 40, 104, 62);
      const flick = 0.75 + Math.sin(t * 13) * 0.05 + (Math.random() < 0.05 ? 0.2 : 0);
      ctx.fillStyle = `rgba(160,200,255,${0.55 * flick})`; ctx.fillRect(VX - 48, HZ - 36, 96, 54);
      ctx.fillStyle = 'rgba(20,20,30,.8)';
      for (let i = 0; i < 6; i++) ctx.fillRect(VX - 44, HZ - 32 + i * 8, 30 + rnd(i + Math.floor(t * 2)) * 50, 3);
      ctx.fillStyle = '#26232b'; ctx.fillRect(VX - 70, HZ + 22, 140, 8);
      const glow = ctx.createRadialGradient(VX, HZ, 10, VX, HZ, 200);
      glow.addColorStop(0, 'rgba(140,180,255,.25)'); glow.addColorStop(1, 'rgba(140,180,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    } else if (name === 'market') {
      // street lights and lantern strings into the distance
      for (let i = 0; i < 18; i++) {
        const x = VX - 120 + rnd(i) * 240, y = HZ - 60 + rnd(i + 9) * 50;
        ctx.fillStyle = hex(i % 3 ? '#ff9a52' : '#ff5f6d', 0.7); ctx.beginPath(); ctx.arc(x, y, 2 + rnd(i + 3) * 2, 0, 7); ctx.fill();
      }
    } else if (name === 'subway') {
      // headlights of the stopped train
      ctx.fillStyle = '#0a0d0c'; ctx.fillRect(VX - 50, HZ - 50, 100, 80);
      for (const sx of [-22, 22]) {
        const gl = ctx.createRadialGradient(VX + sx, HZ + 10, 1, VX + sx, HZ + 10, 40);
        gl.addColorStop(0, 'rgba(255,250,220,.9)'); gl.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = gl; ctx.fillRect(VX + sx - 40, HZ - 30, 80, 80);
      }
    } else if (name === 'factory') {
      ctx.fillStyle = '#2a221c'; ctx.fillRect(VX - 70, HZ - 70, 140, 100);
      ctx.fillStyle = hex('#ff8a2a', 0.5 + Math.sin(t * 3) * 0.2); ctx.fillRect(VX - 60, HZ - 20, 120, 6);
    } else if (name === 'server') {
      for (let i = 0; i < 40; i++) {
        const on = rnd(i + Math.floor(t * 6 + i)) > 0.4;
        ctx.fillStyle = on ? (i % 5 ? '#5fb0ff' : '#5fff9a') : '#1a2433';
        ctx.fillRect(VX - 60 + (i % 10) * 12, HZ - 40 + Math.floor(i / 10) * 14, 4, 3);
      }
    }
  }

  function drawCeilingLight(ctx, S, p, t, id) {
    if (!S.ceil) return;
    const y = ceilY(p) + 6 * p, w = 120 * p;
    const flick = rnd(id + Math.floor(t * 8)) < 0.04 ? 0.3 : 1;
    ctx.fillStyle = hex(S.lamp, 0.9 * flick); ctx.fillRect(VX - w / 2, y, w, 6 * p);
    const cone = ctx.createLinearGradient(0, y, 0, floorY(p));
    cone.addColorStop(0, hex(S.lamp, 0.12 * flick)); cone.addColorStop(1, hex(S.lamp, 0));
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(VX - w / 2, y); ctx.lineTo(VX + w / 2, y); ctx.lineTo(VX + w * 1.4, floorY(p)); ctx.lineTo(VX - w * 1.4, floorY(p)); ctx.fill();
  }

  const SIGNS = ['NODLES', 'FRIDE RICE', 'MASAGE', 'PHONE REPIAR', 'COFEE', 'KARAOKEE', 'DUMPLINS', 'OPEN 24 HOURES'];
  const ceilAt = (S, p) => S.ceil ? ceilY(p) : HZ - 300 * p;
  // a point on a side wall at depth z and height v (0 floor, 1 ceiling)
  function wp(S, side, z, v) {
    const p = proj(z), yF = floorY(p), yC = ceilAt(S, p);
    return [wallX(p, side), yF + (yC - yF) * v];
  }
  function quad(ctx, S, side, z1, z2, v1, v2, col) {
    const a = wp(S, side, z1, v1), b = wp(S, side, z2, v1), c = wp(S, side, z2, v2), d = wp(S, side, z1, v2);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.fill();
  }
  const fogged = (S, col, z) => mixHex(col, S.fog, Math.min(0.9, Math.max(0, z) * 0.75));
  // lines that run the whole length of the walls (tiles, belts, trim)
  function wallLines(ctx, name, S, t) {
    const runs = { room: [[0.04, '#f2c230', 0.35]], subway: [[0.2, '#3b4541', 1], [0.4, '#3b4541', 1], [0.6, '#3b4541', 1], [0.8, '#3b4541', 1]], factory: [[0.12, '#d49a2a', 0.5]], server: [[0.97, '#24303f', 1]], market: [] }[name];
    for (const side of [-1, 1]) for (const [v, col, a] of runs) {
      const n = wp(S, side, -0.05, v), f = wp(S, side, 1.25, v);
      ctx.strokeStyle = hex(col, a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(n[0], n[1]); ctx.lineTo(f[0], f[1]); ctx.stroke();
    }
  }
  function billboard(ctx, x, y, s, draw) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); draw(); ctx.restore(); }

  function drawProp(ctx, name, S, z, side, id, t) {
    id = ((id % 840) + 840) % 840;
    if (z > 1.3) return;
    const z2 = z + 0.12;
    const p = proj(z);
    // seam between wall panels
    const s0 = wp(S, side, z, 0), s1 = wp(S, side, z, 1);
    ctx.strokeStyle = hex('#000000', 0.25); ctx.lineWidth = Math.max(1, 3 * p);
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    if (name === 'room') {
      if (id % 3 === 0) {
        quad(ctx, S, side, z + 0.02, z2, 0.35, 0.75, fogged(S, '#0d1626', z));             // window
        for (let k = 0; k < 6; k++) {
          const a = wp(S, side, z + 0.03 + rnd(id + k) * 0.08, 0.4 + rnd(id * 3 + k) * 0.3);
          ctx.fillStyle = hex('#ffd36b', 0.7 * (1 - z * 0.6)); ctx.fillRect(a[0], a[1], 3 * p, 3 * p);
        }
      } else if (id % 3 === 1) {
        quad(ctx, S, side, z + 0.03, z + 0.09, 0.45, 0.8, fogged(S, ['#f2c230', '#9fb7d9', '#e5604f'][id % 3], z)); // poster
      } else {
        quad(ctx, S, side, z, z2, 0.42, 0.45, fogged(S, '#4a3d44', z));                       // shelf
        quad(ctx, S, side, z, z2, 0.22, 0.25, fogged(S, '#4a3d44', z));
        quad(ctx, S, side, z + 0.01, z + 0.05, 0.45, 0.5, fogged(S, '#d9d6cf', z));            // keyboards on it
        quad(ctx, S, side, z + 0.06, z + 0.1, 0.45, 0.5, fogged(S, '#c9a24a', z));
      }
    } else if (name === 'market') {
      quad(ctx, S, side, z, z2, 0, 0.5, fogged(S, '#2a2228', z));                              // shopfront
      quad(ctx, S, side, z + 0.01, z2 - 0.01, 0.12, 0.42, fogged(S, '#ffd9a0', z * 1.2));       // lit counter
      quad(ctx, S, side, z, z2, 0.5, 0.58, fogged(S, ['#c4473d', '#2f7a6b', '#d49a2a', '#3c5a9a'][id % 4], z)); // awning
      // neon sign sticking out from the wall, facing the camera
      const a = wp(S, side, z + 0.06, 0.75);
      const flick = rnd(id + Math.floor(t * 5)) < 0.08 ? 0.3 : 1;
      billboard(ctx, a[0] - side * 70 * p, a[1], p, () => {
        ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fillRect(-80, -26, 160, 40);
        ctx.font = '900 22px Archivo, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = hex(id % 2 ? '#ff5f6d' : '#ffd36b', flick * (1 - Math.min(0.8, z * 0.6)));
        ctx.fillText(SIGNS[id % SIGNS.length], 0, 2);
      });
      // lanterns across the street
      if (side < 0) {
        const l = wp(S, -1, z, 0.95), r = wp(S, 1, z, 0.95);
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.quadraticCurveTo(VX, l[1] + 60 * p, r[0], r[1]); ctx.stroke();
        for (let k = 1; k < 8; k++) {
          const u = k / 8, x = l[0] + (r[0] - l[0]) * u, y = l[1] + Math.sin(u * Math.PI) * 30 * p;
          ctx.fillStyle = hex(k % 2 ? '#ff5f6d' : '#ffb36b', 0.85 * (1 - Math.min(0.8, z * 0.6)));
          ctx.beginPath(); ctx.arc(x, y + 8 * p, 7 * p, 0, 7); ctx.fill();
        }
      }
    } else if (name === 'subway') {
      if (id % 2) {
        quad(ctx, S, side, z + 0.02, z + 0.1, 0.45, 0.65, fogged(S, '#0b0f0e', z));              // station screen
        const a = wp(S, side, z + 0.06, 0.56);
        billboard(ctx, a[0], a[1], p * 0.8, () => {
          ctx.font = '700 18px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
          ctx.fillStyle = hex(rnd(id + Math.floor(t * 3)) > 0.5 ? '#ff5f4d' : '#ffb35f', 1 - Math.min(0.8, z * 0.6));
          ctx.fillText(['NXET TRAIN', 'STAION 4', 'DELAYD', 'MIND TEH GAP'][id % 4], 0, 0);
        });
      }
      // a pillar standing in front of the wall
      const b = wp(S, side, z, 0), c = wp(S, side, z, 1);
      ctx.fillStyle = fogged(S, '#4a5651', z);
      ctx.fillRect(b[0] - side * 36 * p - 18 * p, c[1], 36 * p, b[1] - c[1]);
    } else if (name === 'factory') {
      quad(ctx, S, side, z, z2, 0, 0.2, fogged(S, '#4a443c', z));                               // belt housing
      quad(ctx, S, side, z, z2, 0.2, 0.23, fogged(S, '#24201c', z));                            // belt
      for (let k = 0; k < 2; k++) {
        const kz = z + ((k / 2 + t * 0.2) % 1) * 0.12;
        quad(ctx, S, side, kz, kz + 0.025, 0.23, 0.3, fogged(S, ['#e7e6e1', '#e07a3a', '#2d2e32'][(id + k) % 3], kz));
      }
      const l = wp(S, side, z + 0.06, 0.8);
      ctx.fillStyle = hex('#ff8a2a', (0.6 + Math.sin(t * 6 + id) * 0.4) * (1 - Math.min(0.8, z * 0.6)));
      ctx.beginPath(); ctx.arc(l[0], l[1], 7 * p, 0, 7); ctx.fill();
      if (id % 3 === 0) quad(ctx, S, side, z + 0.02, z + 0.1, 0.4, 0.6, fogged(S, '#d49a2a', z));  // warning panel
    } else if (name === 'server') {
      quad(ctx, S, side, z + 0.005, z2 - 0.005, 0.02, 0.92, fogged(S, '#0e141d', z));             // rack
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 3; c++) {
          if (rnd(id * 31 + r * 7 + c + Math.floor(t * 8)) > 0.5) {
            const a = wp(S, side, z + 0.02 + c * 0.025, 0.08 + r * 0.085);
            ctx.fillStyle = hex(c === 2 ? '#5fff9a' : '#5fb0ff', 1 - Math.min(0.8, z * 0.6));
            ctx.fillRect(a[0], a[1], Math.max(1, 4 * p), Math.max(1, 3 * p));
          }
        }
      }
    }
  }

  // ---------- typos ----------
  const SKIN = { walker: '#7d8f80', runner: '#8d8a72', crawler: '#6f8378', brute: '#7a6f80', flyer: '#8a8f99', thrower: '#8f7a6f' };

  function glitch(ctx, draw, amt) {
    if (amt > 0) {
      ctx.save(); ctx.globalAlpha *= 0.5; ctx.translate(-amt, 0); draw('#3ad6ff'); ctx.restore();
      ctx.save(); ctx.globalAlpha *= 0.5; ctx.translate(amt, 0); draw('#ff3a6b'); ctx.restore();
    }
    draw(null);
  }

  function drawTypo(ctx, e, sx, sy, sh, fogT, t) {
    const base = mixHex(SKIN[e.type], '#121316', fogT);
    const col = e.flash > 0 ? '#f5f4ef' : base;
    const ph = e.phase;
    const amt = (e.flash > 0 ? 4 : 0) + (rnd(e.seed + Math.floor(t * 10)) < 0.04 ? 3 : 0);
    ctx.save();
    if (e.dying) {
      const k = 1 - e.dying / 0.4;
      ctx.globalAlpha = 1 - k;
      ctx.translate(sx, sy); ctx.rotate(k * 0.8 * (e.x > 0 ? 1 : -1)); ctx.translate(-sx, -sy);
    }
    // shadow
    if (!ENEMY_FLY(e)) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sx, sy, sh * 0.22, sh * 0.04, 0, 0, 7); ctx.fill();
    }
    glitch(ctx, tint => {
      const c = tint || col;
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (e.type === 'crawler') drawCrawler(ctx, sx, sy, sh, ph);
      else if (e.type === 'flyer') drawFlyer(ctx, sx, sy, sh, ph);
      else drawBiped(ctx, e.type, sx, sy, sh, ph, e);
      if (!tint) drawMarks(ctx, e, sx, sy, sh, fogT);
    }, amt);
    ctx.restore();
  }
  const ENEMY_FLY = e => e.type === 'flyer';

  function drawBiped(ctx, type, x, y, h, ph, e) {
    const wide = type === 'brute' ? 1.6 : type === 'runner' ? 0.85 : 1;
    const lean = type === 'runner' ? 0.12 : 0.04;
    const step = Math.sin(ph) * h * 0.06;
    const sway = Math.sin(ph) * h * 0.02;
    // legs
    ctx.lineWidth = h * 0.08 * wide;
    ctx.beginPath(); ctx.moveTo(x - h * 0.06 * wide, y - h * 0.45); ctx.lineTo(x - h * 0.1 * wide + step, y - h * 0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + h * 0.06 * wide, y - h * 0.45); ctx.lineTo(x + h * 0.1 * wide - step, y - h * 0.02); ctx.stroke();
    // torso
    ctx.save(); ctx.translate(x + sway, y - h * 0.45); ctx.rotate(lean);
    ctx.beginPath(); ctx.roundRect(-h * 0.16 * wide, -h * 0.42, h * 0.32 * wide, h * 0.46, h * 0.08); ctx.fill();
    // arms
    ctx.lineWidth = h * 0.065 * (type === 'brute' ? 1.4 : 1);
    if (type === 'thrower') {
      const wind = e.windup || 0;
      ctx.beginPath(); ctx.moveTo(h * 0.13 * wide, -h * 0.36); ctx.lineTo(h * 0.24, -h * (0.55 + wind * 0.15)); ctx.stroke();
      ctx.beginPath(); ctx.arc(h * 0.24, -h * (0.58 + wind * 0.15), h * 0.06, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-h * 0.13 * wide, -h * 0.34); ctx.lineTo(-h * 0.25, -h * 0.1); ctx.stroke();
    } else {
      const reach = Math.sin(ph * 0.5) * h * 0.04;
      ctx.beginPath(); ctx.moveTo(-h * 0.13 * wide, -h * 0.34); ctx.lineTo(-h * 0.27 * wide, -h * 0.06 + reach); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h * 0.13 * wide, -h * 0.34); ctx.lineTo(h * 0.27 * wide, -h * 0.08 - reach); ctx.stroke();
      ctx.beginPath(); ctx.arc(-h * 0.28 * wide, -h * 0.05 + reach, h * 0.05, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(h * 0.28 * wide, -h * 0.07 - reach, h * 0.05, 0, 7); ctx.fill();
    }
    // head
    ctx.beginPath(); ctx.arc(0, -h * 0.5, h * (type === 'brute' ? 0.09 : 0.1), 0, 7); ctx.fill();
    // brute armour made of keycaps
    if (type === 'brute' && e.words.length > 1 && e.wi === 0) {
      ctx.fillStyle = '#d9d6cf';
      for (let k = 0; k < 6; k++) ctx.fillRect(-h * 0.2 + (k % 3) * h * 0.14, -h * 0.38 + Math.floor(k / 3) * h * 0.14, h * 0.12, h * 0.12);
    }
    ctx.restore();
  }
  function drawCrawler(ctx, x, y, h, ph) {
    const step = Math.sin(ph * 1.5) * h * 0.08;
    ctx.beginPath(); ctx.ellipse(x, y - h * 0.35, h * 0.5, h * 0.22, 0, 0, 7); ctx.fill();
    ctx.lineWidth = h * 0.09;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + s * h * 0.3, y - h * 0.3); ctx.lineTo(x + s * h * 0.55 + step * s, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * h * 0.1, y - h * 0.3); ctx.lineTo(x + s * h * 0.25 - step * s, y); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y - h * 0.5, h * 0.16, 0, 7); ctx.fill();
  }
  function drawFlyer(ctx, x, y, h, ph) {
    const flap = Math.sin(ph * 3) * h * 0.35;
    ctx.beginPath(); ctx.ellipse(x, y, h * 0.18, h * 0.24, 0, 0, 7); ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + s * h * 0.12, y - h * 0.05);
      ctx.lineTo(x + s * h * 0.9, y - flap); ctx.lineTo(x + s * h * 0.6, y + h * 0.15); ctx.closePath(); ctx.fill();
    }
  }
  function drawMarks(ctx, e, x, y, h, fogT) {
    // eyes and a few letters of its word printed on the body
    const eyeY = e.type === 'crawler' ? y - h * 0.5 : e.type === 'flyer' ? y - h * 0.05 : y - h * 0.95;
    ctx.fillStyle = e.boss ? '#e5604f' : hex('#f2c230', 1 - fogT * 0.6);
    const ex = h * 0.035;
    ctx.beginPath(); ctx.arc(x - ex, eyeY, Math.max(1, h * 0.015), 0, 7); ctx.arc(x + ex, eyeY, Math.max(1, h * 0.015), 0, 7); ctx.fill();
    if (h > 50 && e.type !== 'flyer') {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.font = `800 ${h * 0.14}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
      const w = e.words[e.wi] || '';
      ctx.fillText(w.slice(0, 3), x, e.type === 'crawler' ? y - h * 0.3 : y - h * 0.62);
    }
  }

  // ---------- bosses ----------
  function drawBoss(ctx, b, t) {
    const x = VX + Math.sin(t * 0.7) * 30, y = HZ + 170, s = b.scale || 1;
    const hurt = b.flash > 0;
    const col = c => (hurt ? '#f5f4ef' : c);
    ctx.save();
    if (b.dying) ctx.globalAlpha = Math.max(0, b.dying / 1.5);
    const shake = b.charge > 0.75 ? (Math.random() - 0.5) * 8 : 0;
    ctx.translate(x + shake, y + 20);
    ctx.scale(s * 0.82, s * 0.82);
    if (b.art === 'spam') {
      // a worm made of chat bubbles
      for (let i = 9; i >= 0; i--) {
        const a = t * 2 + i * 0.6;
        const bx = Math.sin(a) * 120 * (i / 9), by = -i * 26 + Math.cos(a) * 10;
        ctx.fillStyle = col(i % 2 ? '#8a7fd1' : '#6b9fe0');
        ctx.beginPath(); ctx.roundRect(bx - 70 + i * 3, by - 26, 140 - i * 6, 48, 18); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        for (let k = 0; k < 3; k++) ctx.fillRect(bx - 50 + i * 3, by - 14 + k * 10, 60 + rnd(i * 3 + k) * 30, 4);
      }
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(-24, -246, 8, 0, 7); ctx.arc(24, -246, 8, 0, 7); ctx.fill();
    } else if (b.art === 'sign') {
      // a shop sign on long legs
      ctx.strokeStyle = col('#3a3439'); ctx.lineWidth = 14; ctx.lineCap = 'round';
      const st = Math.sin(t * 3) * 20;
      ctx.beginPath(); ctx.moveTo(-60, -120); ctx.lineTo(-90 + st, 0); ctx.moveTo(60, -120); ctx.lineTo(90 - st, 0); ctx.stroke();
      ctx.fillStyle = col('#1d1a22'); ctx.fillRect(-170, -300, 340, 180);
      ctx.strokeStyle = hex('#ff5f6d', 0.8 + Math.sin(t * 20) * 0.2); ctx.lineWidth = 5; ctx.strokeRect(-160, -290, 320, 160);
      ctx.fillStyle = hex('#ffd36b', rnd(Math.floor(t * 8)) < 0.1 ? 0.3 : 1);
      ctx.font = '900 54px Archivo, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NODLES', 0, -190);
      ctx.font = '700 22px Archivo, sans-serif'; ctx.fillText('OPEN 24 HOURES', 0, -150);
    } else if (b.art === 'announcer') {
      // a speaker-headed giant hanging from cables
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
      for (const cx of [-80, -30, 30, 80]) { ctx.beginPath(); ctx.moveTo(cx, -480); ctx.lineTo(cx * 0.6, -300); ctx.stroke(); }
      ctx.fillStyle = col('#2f3a36'); ctx.beginPath(); ctx.roundRect(-140, -320, 280, 200, 20); ctx.fill();
      for (const cx of [-70, 70]) {
        const pulse = 1 + Math.sin(t * 12 + cx) * 0.08;
        ctx.fillStyle = '#121615'; ctx.beginPath(); ctx.arc(cx, -220, 54 * pulse, 0, 7); ctx.fill();
        ctx.fillStyle = col('#5b6863'); ctx.beginPath(); ctx.arc(cx, -220, 22 * pulse, 0, 7); ctx.fill();
      }
      ctx.fillStyle = col('#3b4541'); ctx.fillRect(-60, -120, 120, 120);
      ctx.fillStyle = '#ff5f4d'; ctx.fillRect(-100, -300, 200, 24);
      ctx.fillStyle = '#121615'; ctx.font = '700 16px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('NXET STOP: NOWERE', 0, -283);
    } else if (b.art === 'press') {
      // a hydraulic press with keycap teeth
      const drop = Math.max(0, Math.sin(t * 2)) * 40 * (b.charge || 0.3);
      ctx.fillStyle = col('#4a443c'); ctx.fillRect(-190, -380, 40, 380); ctx.fillRect(150, -380, 40, 380);
      ctx.fillStyle = col('#3a3029'); ctx.fillRect(-200, -400, 400, 40);
      ctx.fillStyle = col('#5c544a'); ctx.fillRect(-150, -340 + drop, 300, 120);
      ctx.fillStyle = '#d49a2a';
      for (let i = 0; i < 10; i++) ctx.fillRect(-150 + i * 30, -340 + drop, 15, 120);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = col(['#e7e6e1', '#e07a3a', '#2d2e32'][i % 3]);
        ctx.fillRect(-140 + i * 32, -220 + drop, 26, 26);
      }
      ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(-120, -300 + drop, 10, 0, 7); ctx.arc(120, -300 + drop, 10, 0, 7); ctx.fill();
    } else if (b.art === 'correction') {
      // a wall of screens with one red cursor for an eye
      for (let i = 0; i < 12; i++) {
        const cx = -210 + (i % 4) * 140, cy = -420 + Math.floor(i / 4) * 110;
        ctx.fillStyle = col('#0e141d'); ctx.fillRect(cx, cy, 130, 100);
        ctx.fillStyle = hex('#5fb0ff', 0.2 + rnd(i + Math.floor(t * 4)) * 0.3); ctx.fillRect(cx + 6, cy + 6, 118, 88);
      }
      ctx.fillStyle = '#0a0f17'; ctx.fillRect(-70, -310, 140, 100);
      if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#ff3a3a'; ctx.fillRect(-8, -295, 16, 70); }
      ctx.strokeStyle = col('#24303f'); ctx.lineWidth = 18; ctx.lineCap = 'round';
      const sw = Math.sin(t * 1.5) * 30;
      ctx.beginPath(); ctx.moveTo(-210, -200); ctx.quadraticCurveTo(-320, -100 + sw, -240, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(210, -200); ctx.quadraticCurveTo(320, -100 - sw, 240, 0); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- pickups, projectiles, particles ----------
  function drawPickup(ctx, pk, x, y, s, t) {
    const P = HordeData.PICKUPS[pk.kind];
    const bob = Math.sin(t * 3 + pk.seed) * 6;
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(Math.sin(t * 2 + pk.seed) * 0.15);
    const k = 46 * s;
    ctx.fillStyle = P.color; ctx.beginPath(); ctx.roundRect(-k / 2, -k / 2, k, k, 8 * s); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-k / 2 + 4 * s, k / 2 - 7 * s, k - 8 * s, 4 * s);
    ctx.fillStyle = '#1b1c1e';
    if (pk.kind === 'health') { ctx.fillRect(-5 * s, -15 * s, 10 * s, 30 * s); ctx.fillRect(-15 * s, -5 * s, 30 * s, 10 * s); }
    else if (pk.kind === 'shield') { ctx.beginPath(); ctx.moveTo(0, -15 * s); ctx.lineTo(13 * s, -8 * s); ctx.lineTo(10 * s, 8 * s); ctx.lineTo(0, 16 * s); ctx.lineTo(-10 * s, 8 * s); ctx.lineTo(-13 * s, -8 * s); ctx.fill(); }
    else { ctx.font = `800 ${14 * s}px Archivo, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText({ debounce: 'SLOW', macro: 'ALL', double: 'x2' }[pk.kind], 0, 1); }
    ctx.restore();
  }

  function drawProjectile(ctx, pr, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 8 + pr.seed);
    ctx.fillStyle = pr.flash > 0 ? '#fff' : '#c9c3b5';
    ctx.beginPath(); ctx.roundRect(-14 * s, -14 * s, 28 * s, 28 * s, 5 * s); ctx.fill();
    ctx.fillStyle = '#1b1c1e'; ctx.font = `800 ${16 * s}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pr.word[0].toUpperCase(), 0, 1);
    ctx.restore();
  }

  function drawParticles(ctx, parts) {
    for (const p of parts) {
      ctx.globalAlpha = Math.min(1, p.t * 2);
      if (p.ch) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.col; ctx.font = `800 ${p.size}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
        ctx.fillText(p.ch, 0, 0); ctx.restore();
      } else {
        ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- story pictures ----------
  function drawStoryArt(ctx, chapter, t) {
    drawScene(ctx, chapter.scene, t * 0.05, t, false);
    ctx.fillStyle = 'rgba(10,10,12,.55)'; ctx.fillRect(0, 0, W, H);
  }

  return { W, H, HZ, VX, proj, floorY, wallX, drawScene, drawTypo, drawBoss, drawPickup, drawProjectile, drawParticles, drawStoryArt, hex };
})();
