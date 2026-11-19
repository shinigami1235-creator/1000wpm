// Race view: a pseudo-3D road where each car's position is its typing progress.
// Typing faster moves the car faster, and a run of correct letters turns on the boost.
window.RaceView = (() => {
  const W = 960, H = 400;
  const SEG = 200, ROAD = 2000, CAM_H = 1000, DEPTH = 0.84, DRAW = 160, LANES = 3;
  const THEMES = [
    { name: 'City at night', sky: ['#0b1020', '#27304d'], ground: ['#14171c', '#181b21'], rumble: ['#e7e6e1', '#c4473d'], road: ['#2a2c31', '#2d2f34'], lane: '#d9d6cf', far: '#1a2033', near: '#121620', props: 'lamp', sun: '#f2f0e6', sunY: 0.25, hills: 'city' },
    { name: 'Coast road', sky: ['#f2a65a', '#f6d6a3'], ground: ['#d9c38f', '#d1ba86'], rumble: ['#e7e6e1', '#2f7a6b'], road: ['#5a5550', '#5f5a55'], lane: '#f2f0e6', far: '#6f90a8', near: '#4f7a72', props: 'palm', sun: '#fff1c9', sunY: 0.55, hills: 'hills' },
    { name: 'Desert highway', sky: ['#5a8fd1', '#bfe0f2'], ground: ['#d7a86e', '#cf9f65'], rumble: ['#e7e6e1', '#c44f3d'], road: ['#55504a', '#59544e'], lane: '#f2f0e6', far: '#c98b5a', near: '#b0744a', props: 'cactus', sun: '#fffbe6', sunY: 0.2, hills: 'mesa' },
    { name: 'Snow pass', sky: ['#6f86a8', '#c9d6e6'], ground: ['#eef3f7', '#e3eaf0'], rumble: ['#c4473d', '#e7e6e1'], road: ['#4a4e55', '#4e5259'], lane: '#f2f0e6', far: '#8ea3bf', near: '#6c8099', props: 'pine', sun: '#ffffff', sunY: 0.3, hills: 'peaks' },
    { name: 'Forest road', sky: ['#4b7d6a', '#a9cbb0'], ground: ['#2f5a3a', '#2b5436'], rumble: ['#e7e6e1', '#d49a2a'], road: ['#3e403f', '#424443'], lane: '#e9e6d6', far: '#3d6650', near: '#2a4a38', props: 'tree', sun: '#fdf6d8', sunY: 0.35, hills: 'hills' },
  ];
  const BOARDS = ['AULA', 'WOMIER', 'LOGA', 'ATTACK SHARK', 'CORSAIR', 'CHILKEY', '10000WPM'];

  const ease = (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);

  class View {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.fit(); addEventListener('resize', () => this.fit());
      this.newCourse();
    }
    fit() {
      const dpr = Math.min(2, devicePixelRatio || 1), w = this.cv.clientWidth || W;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(w * H / W * dpr);
    }
    newCourse(seed) {
      let s = seed || Math.floor(Math.random() * 1e9);
      this.seed = s;
      const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      this.theme = THEMES[Math.floor(r() * THEMES.length)];
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
      segs.forEach((g, i) => {
        if (i % 6 === 0) g.prop = { side: (i / 6) % 2 ? 1 : -1, kind: i % 54 === 0 ? 'board' : this.theme.props, text: BOARDS[Math.floor(i / 54) % BOARDS.length] };
      });
      this.segs = segs;
      this.length = segs.length * SEG;
      this.finishSeg = segs.length - 70;
      this.bgX = 0;
      this.camZ = 0;
      this.speedShown = 0;
    }
    trackZ(progress) { return Math.min(1, progress) * this.finishSeg * SEG; }

    // state: { you: {progress, kmh, boost, skid, color, name}, others: [{progress, color, name, gap}] , dt }
    draw(state, dt) {
      const ctx = this.ctx, T = this.theme;
      ctx.setTransform(this.cv.width / W, 0, 0, this.cv.height / H, 0, 0);
      const target = this.trackZ(state.you.progress);
      const prev = this.camZ;
      this.camZ += (target - this.camZ) * Math.min(1, dt * 6);
      const moved = this.camZ - prev;
      const baseIdx = Math.floor(this.camZ / SEG) % this.segs.length;
      const base = this.segs[baseIdx];
      this.bgX += base.curve * moved * 0.00012;
      this.speedShown += (state.you.kmh - this.speedShown) * Math.min(1, dt * 4);

      // sky and far scenery
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = T.sun; ctx.beginPath(); ctx.arc(W * 0.7 - this.bgX * 40, H * T.sunY, 34, 0, 7); ctx.fill();
      this.drawHills(ctx, T.far, 0.55, 0.3, 60);
      this.drawHills(ctx, T.near, 0.62, 0.6, 40);

      // road from back to front, with hidden-line clipping on hills
      const camY = CAM_H + base.y;
      const playerX = -2 / 3;
      const basePct = (this.camZ % SEG) / SEG;
      let x = 0, dx = -(base.curve * basePct);
      let maxY = H;
      const proj = [];
      const project = (wx, wy, wz, camX) => {
        const cz = wz - this.camZ;
        const sc = DEPTH / Math.max(1, cz);
        return { x: W / 2 + sc * (wx - camX) * W / 2, y: H / 2 - sc * (wy - camY) * H / 2, w: sc * ROAD * W / 2, sc };
      };
      for (let n = 0; n < DRAW; n++) {
        const i = baseIdx + n;
        if (i >= this.segs.length) break;
        const seg = this.segs[i];
        const yPrev = i > 0 ? this.segs[i - 1].y : 0;
        const z1 = i * SEG, z2 = z1 + SEG;
        const camX1 = playerX * ROAD - x, camX2 = playerX * ROAD - x - dx;
        const p1 = project(0, yPrev, z1, camX1), p2 = project(0, seg.y, z2, camX2);
        const P = { i, seg, p1, p2, camX1, camX2, z1, clip: maxY, visible: false };
        proj.push(P);
        x += dx; dx += seg.curve;
        if (z1 - this.camZ <= 1 || p2.y >= maxY) continue;
        P.visible = true;
        maxY = p2.y;
      }
      // paint far to near so each nearer strip covers the seam of the one behind it
      for (let n = proj.length - 1; n >= 0; n--) {
        const P = proj[n];
        if (P.visible) this.segment(ctx, P.i, P.p1, P.p2, Math.floor(P.i / 3) % 2, P.i >= this.finishSeg && P.i < this.finishSeg + 3);
      }
      // props and other cars from back to front
      const cars = state.others.map(o => ({ ...o, wz: this.trackZ(o.progress) }));
      for (let n = proj.length - 1; n >= 0; n--) {
        const P = proj[n];
        if (P.z1 - this.camZ <= 1) continue;
        if (P.seg.prop) {
          const pp = project(P.seg.prop.side * ROAD * 1.35, P.seg.y, P.z1 + SEG / 2, (P.camX1 + P.camX2) / 2);
          if (pp.y <= P.clip + 4) this.prop(ctx, P.seg.prop, pp);
        }
        for (const c of cars) {
          if (c.wz >= P.z1 && c.wz < P.z1 + SEG) {
            const k = (c.wz - P.z1) / SEG;
            const cp = project(0, P.seg.y, c.wz, P.camX1 + (P.camX2 - P.camX1) * k);
            if (cp.y <= P.clip + 6) this.car(ctx, cp.x, cp.y, cp.sc * 3000, c.color, c.boost, 0, c.name);
          }
        }
      }
      // a car right beside or behind you shows as a label at the side
      for (const c of cars) {
        const gap = c.wz - this.camZ;
        if (gap <= SEG * 1.5 && state.you.progress > 0.02) {
          ctx.font = '700 14px Archivo, sans-serif'; ctx.textAlign = 'right';
          ctx.fillStyle = c.color; ctx.textAlign = 'left'; ctx.fillText(`${c.name} is behind you`, 24, 64);
        }
      }

      // speed lines while boosting
      const you = state.you;
      if (you.boost > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.25 * you.boost})`; ctx.lineWidth = 2;
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * Math.PI * 2 + performance.now() / 300;
          const r1 = 120 + ((performance.now() / 4 + k * 40) % 300);
          ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r1, H * 0.45 + Math.sin(a) * r1 * 0.5); ctx.lineTo(W / 2 + Math.cos(a) * (r1 + 60), H * 0.45 + Math.sin(a) * (r1 + 60) * 0.5); ctx.stroke();
        }
      }
      // your car at the front
      const sway = -base.curve * 6 + (you.skid > 0 ? Math.sin(performance.now() / 30) * 14 : 0);
      const bounce = Math.sin(performance.now() / 70) * Math.min(2, moved * 0.02);
      this.car(ctx, W / 2 + sway, H - 22 + bounce, 1.15, you.color, you.boost, base.curve, null);

      // HUD
      this.hud(ctx, state);
    }

    drawHills(ctx, col, base, par, amp) {
      const T = this.theme;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, H);
      const off = this.bgX * par * 300;
      for (let xx = 0; xx <= W; xx += 8) {
        const u = (xx + off) / 90;
        let y;
        if (T.hills === 'city') y = H * base - (Math.floor(Math.abs(Math.sin(Math.floor(u) * 12.9898) * 43758) % 5) * amp * 0.35 + amp * 0.4);
        else if (T.hills === 'mesa') y = H * base - (Math.sin(u * 0.5) > 0.3 ? amp * 1.1 : amp * 0.2);
        else if (T.hills === 'peaks') y = H * base - Math.abs(Math.sin(u * 0.7)) * amp * 1.6;
        else y = H * base - (Math.sin(u * 0.6) * 0.5 + 0.5) * amp - Math.sin(u * 1.7) * amp * 0.2;
        ctx.lineTo(xx, y);
      }
      ctx.lineTo(W, H); ctx.fill();
      if (T.hills === 'city' && par > 0.5) {
        for (let xx = 0; xx < W; xx += 14) {
          if (Math.sin((xx + off) * 0.37) > 0.6) { ctx.fillStyle = 'rgba(255,211,107,.6)'; ctx.fillRect(xx, H * base - amp * 0.3 - (xx % 3) * 6, 3, 3); }
        }
      }
    }

    segment(ctx, i, p1, p2, alt, finish) {
      const T = this.theme;
      ctx.fillStyle = T.ground[alt]; ctx.fillRect(0, p2.y - 1, W, p1.y - p2.y + 2);
      const quad = (x1, y1, w1, x2, y2, w2, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1 - w1, y1 + 0.5); ctx.lineTo(x2 - w2, y2 - 0.5); ctx.lineTo(x2 + w2, y2 - 0.5); ctx.lineTo(x1 + w1, y1 + 0.5); ctx.fill(); };
      const r1 = p1.w / 8, r2 = p2.w / 8;
      quad(p1.x, p1.y, p1.w + r1, p2.x, p2.y, p2.w + r2, T.rumble[alt]);
      quad(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, finish ? (alt ? '#f2f0e6' : '#1b1c1e') : T.road[alt]);
      if (!alt && !finish) {
        const l1 = p1.w / 40, l2 = p2.w / 40;
        for (let k = 1; k < LANES; k++) {
          const f = -1 + (2 * k) / LANES;
          quad(p1.x + p1.w * f, p1.y, l1, p2.x + p2.w * f, p2.y, l2, T.lane);
        }
      }
    }

    prop(ctx, pr, p) {
      const s = p.sc * 1600;
      if (s < 0.02) return;
      const x = p.x, y = p.y;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      const k = pr.kind;
      if (k === 'board') {
        ctx.fillStyle = '#333'; ctx.fillRect(-4, -160, 8, 160); ctx.fillRect(-90 * pr.side + (pr.side > 0 ? 0 : 0), -160, 8, 160);
        ctx.fillStyle = '#1b1c1e'; ctx.fillRect(-110, -230, 220, 80);
        ctx.fillStyle = '#f2c230'; ctx.font = '900 40px Archivo, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(pr.text, 0, -175);
      } else if (k === 'lamp') {
        ctx.fillStyle = '#3a3d44'; ctx.fillRect(-3, -170, 6, 170); ctx.fillRect(-3, -170, 40 * -pr.side, 6);
        ctx.fillStyle = 'rgba(255,220,150,.9)'; ctx.beginPath(); ctx.arc(40 * -pr.side, -160, 9, 0, 7); ctx.fill();
      } else if (k === 'palm') {
        ctx.strokeStyle = '#6b4f2f'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(14, -80, 6, -170); ctx.stroke();
        ctx.strokeStyle = '#2f7a4f'; ctx.lineWidth = 9; ctx.lineCap = 'round';
        for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.moveTo(6, -170); ctx.quadraticCurveTo(6 + Math.cos(a) * 50, -200, 6 + Math.cos(a) * 80, -150 + Math.sin(a) * 10); ctx.stroke(); }
      } else if (k === 'cactus') {
        ctx.fillStyle = '#3f7a46'; ctx.fillRect(-10, -110, 20, 110); ctx.fillRect(-36, -80, 14, 40); ctx.fillRect(22, -95, 14, 45); ctx.fillRect(-36, -48, 36, 12); ctx.fillRect(10, -58, 26, 12);
      } else if (k === 'pine') {
        ctx.fillStyle = '#2e4f42';
        for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(0, -200 + l * 50); ctx.lineTo(-50 + l * -8, -100 + l * 50); ctx.lineTo(50 + l * 8, -100 + l * 50); ctx.fill(); }
        ctx.fillStyle = '#f4f7fa'; ctx.beginPath(); ctx.moveTo(0, -200); ctx.lineTo(-18, -165); ctx.lineTo(18, -165); ctx.fill();
      } else if (k === 'tree') {
        ctx.fillStyle = '#5a4030'; ctx.fillRect(-8, -80, 16, 80);
        ctx.fillStyle = '#2f6a3f'; ctx.beginPath(); ctx.arc(0, -120, 60, 0, 7); ctx.fill();
        ctx.fillStyle = '#3b7d4b'; ctx.beginPath(); ctx.arc(-18, -135, 34, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    car(ctx, x, y, s, col, boost, curve, label) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      if (s > 0.25 && boost > 0) {
        for (const fx of [-38, 38]) {
          const len = 30 + Math.random() * 30 * boost;
          const g = ctx.createLinearGradient(0, 0, 0, len);
          g.addColorStop(0, 'rgba(255,240,180,.95)'); g.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - 9, -8); ctx.lineTo(fx + 9, -8); ctx.lineTo(fx, len); ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 80, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(-72, -26, 22, 26); ctx.fillRect(50, -26, 22, 26);
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(-76, -14); ctx.lineTo(-70, -46); ctx.lineTo(-44, -54); ctx.lineTo(44, -54); ctx.lineTo(70, -46); ctx.lineTo(76, -14); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-46, -54); ctx.lineTo(-34, -82); ctx.lineTo(34, -82); ctx.lineTo(46, -54); ctx.fill();
      ctx.fillStyle = 'rgba(20,24,32,.85)'; ctx.beginPath(); ctx.moveTo(-38, -57); ctx.lineTo(-29, -77); ctx.lineTo(29, -77); ctx.lineTo(38, -57); ctx.fill();
      ctx.fillStyle = '#e5604f'; ctx.fillRect(-68, -42, 26, 8); ctx.fillRect(42, -42, 26, 8);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-60, -26, 120, 10);
      ctx.fillStyle = '#ddd'; ctx.fillRect(-16, -28, 32, 9);
      ctx.restore();
      if (label && s > 0.2) {
        ctx.font = '700 13px Archivo, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(14,15,16,.85)'; const tw = ctx.measureText(label).width;
        ctx.beginPath(); ctx.roundRect(x - tw / 2 - 6, y - 100 * s - 22, tw + 12, 20, 4); ctx.fill();
        ctx.fillStyle = col; ctx.fillText(label, x, y - 100 * s - 7);
      }
    }

    hud(ctx, st) {
      const you = st.you;
      // speedometer
      const cx = W - 92, cy = H - 64, r = 52;
      ctx.fillStyle = 'rgba(14,15,16,.82)'; ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2d2e32'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      const f = Math.min(1, this.speedShown / 400);
      ctx.strokeStyle = you.boost > 0 ? '#e07a3a' : '#f2c230'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * f)); ctx.stroke();
      ctx.fillStyle = '#ecebe6'; ctx.font = '600 26px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(this.speedShown)), cx, cy + 6);
      ctx.fillStyle = '#a3a29c'; ctx.font = '600 12px Archivo, sans-serif'; ctx.fillText('km/h', cx, cy + 24);
      if (you.boost > 0) { ctx.fillStyle = '#e07a3a'; ctx.font = '800 15px Archivo, sans-serif'; ctx.fillText('BOOST', cx, cy - r - 16); }
      // map of the course with each car on it
      const mx = 24, my = 22, mw = W - 48;
      ctx.fillStyle = 'rgba(14,15,16,.7)'; ctx.fillRect(mx, my - 4, mw, 8);
      ctx.fillStyle = '#ecebe6'; ctx.fillRect(mx + mw - 3, my - 10, 3, 20);
      const dot = (p, col, lbl) => {
        const xx = mx + mw * Math.min(1, p);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xx, my, 7, 0, 7); ctx.fill();
        ctx.font = '700 12px Archivo, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lbl, xx, my + 22);
      };
      st.others.forEach(o => dot(o.progress, o.color, o.name));
      dot(you.progress, you.color, you.name);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(236,235,230,.85)'; ctx.font = '600 13px Archivo, sans-serif';
      ctx.fillText(this.theme.name, 24, H - 16);
    }
  }
  return View;
})();
