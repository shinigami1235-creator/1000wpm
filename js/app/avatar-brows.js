// Brows placed by rule on the head the look actually has. The rules and numbers come from the
// glb meta's 'brow' entry (tools/avatar/brows.py): on the front view, in mm out from the facial
// midline and mm above that eye's canthal line, with the scale from a 63 mm interpupillary
// distance, three guide lines start at the ala's outer edge. The head sits on the line through
// the medial canthus, the peak on the line through the lateral limbus (moved towards the
// lateral canthus line by peak_at) and the tail on the line through the lateral canthus. The
// lower edge is a hermite curve through them; the thickness runs head to peak, then tapers.
// The canthi and the alae are read from the current head, so every slider and sculpt point
// that moves them moves the brows. The sex slider blends the female and male presets; the
// brow sliders add to the numbers.
//
// Each brow is a card of NS stations along by NR rows across, laid on the skin: the centre line
// is spaced by its length on the head, each point dropped onto the skin through a depth map of
// the face taken from the front, and lifted a hair off it.
import * as THREE from 'three';
const NS = 28, NR = 6, LIFT = 0.003;
const GX0 = -0.82, GX1 = 0.82, GY0 = 7.0, GY1 = 8.0, CELL = 0.008;
const GW = Math.round((GX1 - GX0) / CELL) + 1, GH = Math.round((GY1 - GY0) / CELL) + 1;
// brow sliders: what each adds at +100 (and takes away at -100)
const SLIDE = {
  browH: { head_low: 4, peak_low: 4 },           // brow height: the head morph lifts the skin, this the brow on it
  browSp: { head_x: 4.5, peak_x: 1.5 },          // spacing: the head further from the midline
  browIn: { head_low: 4 },                       // inner height
  browTl: { tail_lift: 4.5 },                    // tail height
  browAp: { peak_at: 0.6 },                      // arch position
  browAh: { peak_low: 4 },                       // arch height
  browLn: { tail_x: 13 },                        // tail length
  browA: { tail_lift: 5, peak_low: 2 },          // angle: the brow turns about its head
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hermite = (p0, p1, m0, m1, t) => { const t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1; };
const lineX = (a, b, v) => Math.abs(b[1] - a[1]) < 1e-6 ? b[0] : a[0] + (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]);

// ---------- the numbers for a look ----------
function params(B, style, f) {
  const fem = smooth(-60, 60, (f && f.sex) || 0), F = B.presets.female, M = B.presets.male;
  const p = { ...B.shape, ...B.common };
  for (const k in F) p[k] = M[k] + (F[k] - M[k]) * fem;
  const st = B.styles[style] || {};
  for (const [k, v] of Object.entries(st.add || {})) p[k] += v;
  for (const [k, v] of Object.entries(st.mul || {})) p[k] *= v;
  for (const [k, v] of Object.entries(st.set || {})) p[k] = v;
  for (const [k, v] of Object.entries(st.rel || {})) p[k] = p.head_low + v;
  p.head_x = 0; p.peak_x = 0; p.tail_x = 0;
  for (const [id, adds] of Object.entries(SLIDE)) {
    const v = ((f && f[id]) || 0) / 100; if (!v) continue;
    for (const [k, a] of Object.entries(adds)) p[k] += a * v;
  }
  // thickness: all of it, the head end and the tail end
  const t = ((f && f.browT) || 0) / 100, ti = ((f && f.browTi) || 0) / 100, to = ((f && f.browTo) || 0) / 100;
  const all = 1 + 0.5 * t;
  p.head_thick *= all * (1 + 0.5 * ti); p.peak_thick *= all * (1 + 0.15 * ti + 0.15 * to); p.tail_thick *= all * (1 + 1.6 * to);
  p.taper *= 1 - 0.35 * to;
  return p;
}

function design(p, ala, mc, lc) {
  const a = [ala[0] + p.ala_out_mm, ala[1]];
  const ec = [(mc[0] + lc[0]) / 2, (mc[1] + lc[1]) / 2], ln = Math.hypot(lc[0] - mc[0], lc[1] - mc[1]);
  const ll = [ec[0] + (lc[0] - mc[0]) / ln * p.iris_radius_mm, ec[1] + (lc[1] - mc[1]) / ln * p.iris_radius_mm];
  const hb = p.head_low, pb = p.peak_low, tb = hb + p.tail_lift;
  const hx = lineX(a, mc, hb) + p.head_x;
  const pat = Math.max(-0.8, Math.min(1.3, p.peak_at));
  let px = (1 - pat) * lineX(a, ll, pb) + pat * lineX(a, lc, pb) + p.peak_x;
  let tx = lineX(a, lc, tb) + p.tail_x;
  px = Math.max(hx + 6, Math.min(tx - 4, px)); tx = Math.max(px + 4, tx);
  const lower = u => {
    if (u <= px) { const t = Math.min(1, Math.max(0, (u - hx) / (px - hx))); return hermite(hb, pb, (pb - hb) * p.k_in, (pb - hb) * p.sharp * 0.9, t); }
    const t = Math.min(1, Math.max(0, (u - px) / (tx - px))); return hermite(pb, tb, (tb - pb) * p.sharp * 0.9, (tb - pb) * p.k_out, t);
  };
  const thick = u => {
    if (u <= px) { const t = Math.min(1, Math.max(0, (u - hx) / (px - hx))); return p.head_thick + (p.peak_thick - p.head_thick) * t; }
    const t = Math.min(1, Math.max(0, (u - px) / (tx - px))); return p.peak_thick + (p.tail_thick - p.peak_thick) * Math.pow(t, p.taper);
  };
  return { ala: a, mc, lc, ll, hx, px, tx, hb, pb, tb, lower, thick };
}

// ---------- the face's depth from the front ----------
function region(A) {
  if (A.browTris) return A.browTris;
  const P = A.base, T = A.headPrims.skin, out = [];
  for (let i = 0; i < T.length; i += 3) {
    let ok = false;
    for (let k = 0; k < 3; k++) { const v = T[i + k] * 3; if (Math.abs(P[v]) < 0.9 && P[v + 1] > 6.85 && P[v + 1] < 8.15 && P[v + 2] > 0.3) ok = true; }
    if (ok) out.push(T[i], T[i + 1], T[i + 2]);
  }
  return (A.browTris = Uint32Array.from(out));
}
// front-most skin depth and normal per cell, from the rig's current positions
function depthMap(rig) {
  if (rig.browDepth && rig.browDepth.stamp === rig.shapeStamp) return rig.browDepth;
  const T = region(rig.A), P = rig.pos, N = rig.nrm;
  const z = new Float32Array(GW * GH).fill(-1e9), n = new Float32Array(GW * GH * 3);
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
    const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - GX0) / CELL)), i1 = Math.min(GW - 1, Math.floor((Math.max(ax, bx, cx) - GX0) / CELL));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - GY0) / CELL)), j1 = Math.min(GH - 1, Math.floor((Math.max(ay, by, cy) - GY0) / CELL));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const x = GX0 + ii * CELL, y = GY0 + j * CELL;
      const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const zz = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2], q = j * GW + ii;
      if (zz <= z[q]) continue;
      z[q] = zz;
      for (let k = 0; k < 3; k++) n[q * 3 + k] = w0 * N[a + k] + w1 * N[b + k] + w2 * N[c + k];
    }
  }
  return (rig.browDepth = { stamp: rig.shapeStamp, z, n });
}
// the skin point (lifted) at front position (x, y)
function onSkin(G, x, y, out, o, nrm) {
  const fx = Math.min(GW - 1.001, Math.max(0, (x - GX0) / CELL)), fy = Math.min(GH - 1.001, Math.max(0, (y - GY0) / CELL));
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
  let zs = 0, ws = 0, nx = 0, ny = 0, nz = 0;
  for (const [di, dj, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
    const q = (j + dj) * GW + i + di;
    if (G.z[q] < -1e8 || w <= 0) continue;
    zs += G.z[q] * w; ws += w; nx += G.n[q * 3] * w; ny += G.n[q * 3 + 1] * w; nz += G.n[q * 3 + 2] * w;
  }
  const l = Math.hypot(nx, ny, nz) || 1, z = ws ? zs / ws : 1.2;
  out[o] = x + nx / l * LIFT; out[o + 1] = y + ny / l * LIFT; out[o + 2] = z + nz / l * LIFT;
  if (nrm) { nrm[0] = nx / l; nrm[1] = ny / l; nrm[2] = nz / l; }
}

// ---------- the parts the rig draws ----------
// One part per style: both brows, NS x NR each, with the style's tile in the atlas.
function parts(B) {
  const out = new Map(), n = NS * NR * 2;
  for (const [style, [c, r]] of Object.entries(B.tiles)) {
    const uv = new Float32Array(n * 2), idx = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < NS; i++) for (let k = 0; k < NR; k++) {
      const q = (s * NS + i) * NR + k;
      uv[q * 2] = (c + i / (NS - 1)) / B.grid[0]; uv[q * 2 + 1] = 1 - (r + 1 - k / (NR - 1)) / B.grid[1];
    }
    for (let s = 0; s < 2; s++) for (let i = 0; i < NS - 1; i++) for (let k = 0; k < NR - 1; k++) {
      const a = (s * NS + i) * NR + k, b = a + NR, cc = b + 1, d = a + 1;
      if (s === 0) idx.push(a, b, cc, a, cc, d); else idx.push(a, d, cc, a, cc, b);
    }
    const canon = new Uint32Array(n); for (let i = 0; i < n; i++) canon[i] = i;
    out.set('brow-' + style, [{
      mat: 'brow', pos: new Float32Array(n * 3), bind: new Uint16Array(n * 4), bindw: new Uint8Array(n * 4), col: new Uint8Array(n * 4).fill(255),
      uv, strand: new Float32Array(n * 3), canon, index: Uint16Array.from(idx), lines: null, morph: {}, style,
    }]);
  }
  return out;
}

// The current landmarks and the design for each side ('l' +x, 'r' -x), in the eye's plane (mm).
function designs(rig, style, f) {
  const B = rig.A.meta.brow, P = rig.pos, m = B.marks;
  const at = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const eye = s => { const a = at(m[s][0]), b = at(m[s][1]); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; };
  const el = eye('l'), er = eye('r');
  const mmpu = B.common.ipd_mm / Math.hypot(el[0] - er[0], el[1] - er[1], el[2] - er[2]);
  const mid = (P[m.l[0] * 3] + P[m.r[0] * 3]) / 2;
  const p = params(B, style, f), out = {};
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    const base = (P[m[s][0] * 3 + 1] + P[m[s][1] * 3 + 1]) / 2;
    const toPlane = q => [(q[0] - mid) * sx * mmpu, (q[1] - base) * mmpu];
    const marks = [toPlane(at(m[s][2])), toPlane(at(m[s][0])), toPlane(at(m[s][1]))];
    const d = design(p, ...marks);
    d.marks = marks;
    d.frame = { sx, mid, base, mmpu };
    d.xy = (u, v) => [mid + sx * u / mmpu, base + v / mmpu];
    out[s] = d;
  }
  return { p, sides: out, mmpu, style };
}

// Fills the brow part's positions for look L.
function update(rig, rec, L) {
  const B = rig.A.meta.brow; if (!B) return;
  const G = depthMap(rig), out = rec.pos, D = designs(rig, rec.p.style, L.f);
  const tmp = new Float32Array(3), N = 90;
  let side = 0;
  for (const s of ['l', 'r']) {
    const d = D.sides[s], m = B.margin * (d.tx - d.hx), u0 = d.hx - m, u1 = d.tx + m;
    // the centre line on the skin, and its length there
    const us = new Float32Array(N), len = new Float32Array(N); let prev = null;
    for (let i = 0; i < N; i++) {
      const u = u0 + (u1 - u0) * i / (N - 1); us[i] = u;
      const [x, y] = d.xy(u, d.lower(u) + d.thick(u) / 2); onSkin(G, x, y, tmp, 0);
      len[i] = prev ? len[i - 1] + Math.hypot(tmp[0] - prev[0], tmp[1] - prev[1], tmp[2] - prev[2]) : 0;
      prev = [tmp[0], tmp[1], tmp[2]];
    }
    for (let i = 0; i < NS; i++) {
      // stations evenly spaced along the skin
      const L0 = len[N - 1] * i / (NS - 1); let j = 1; while (j < N - 1 && len[j] < L0) j++;
      const t = (L0 - len[j - 1]) / Math.max(1e-9, len[j] - len[j - 1]), u = us[j - 1] + (us[j] - us[j - 1]) * t;
      const du = 0.25, c = d.lower(u) + d.thick(u) / 2, c1 = d.lower(u + du) + d.thick(u + du) / 2, c0 = d.lower(u - du) + d.thick(u - du) / 2;
      let tu = 2 * du, tv = c1 - c0; const tl = Math.hypot(tu, tv); tu /= tl; tv /= tl;
      const half = B.kt * d.thick(u) / 2;
      for (let k = 0; k < NR; k++) {
        const o = half * (2 * k / (NR - 1) - 1);
        const [x, y] = d.xy(u - tv * o, c + tu * o);
        onSkin(G, x, y, out, ((side * NS + i) * NR + k) * 3);
      }
    }
    side++;
  }
  rig.browLast = update.last = { D, G };
}

// The guide lines, the designed outline, the head, peak and tail, the thickness handles and
// the canthal line, on the skin of the brows last built for a rig (the last one built at all
// when no rig is given), in the rig's own space.
function guides(rig) {
  const l = rig ? rig.browLast : update.last; if (!l) return null;
  const { D, G } = l, t = new Float32Array(3);
  const pt = (d, u, v, n) => { const [x, y] = d.xy(u, v); onSkin(G, x, y, t, 0, n); return [t[0], t[1], t[2]]; };
  const out = {};
  for (const [s, d] of Object.entries(D.sides)) {
    const line = target => { const a = d.ala, pts = []; for (let k = 0; k <= 24; k++) { const v = a[1] + (40 - a[1]) * k / 24; pts.push(pt(d, lineX(a, target, v), v)); } return pts; };
    const us = []; for (let k = 0; k <= 60; k++) us.push(d.hx + (d.tx - d.hx) * k / 60);
    const dot = (u, v) => { const n = [0, 0, 1]; return { p: pt(d, u, v, n), n, uv: [u, v] }; };
    out[s] = {
      medial: line(d.mc), limbus: line(d.ll), lateral: line(d.lc),
      outline: [...us.map(u => pt(d, u, d.lower(u))), ...us.slice().reverse().map(u => pt(d, u, d.lower(u) + d.thick(u)))],
      head: pt(d, d.hx, d.hb), peak: pt(d, d.px, d.pb), tail: pt(d, d.tx, d.tb),
      dots: { head: dot(d.hx, d.hb), peak: dot(d.px, d.pb), tail: dot(d.tx, d.tb), headT: dot(d.hx, d.hb + d.thick(d.hx)), peakT: dot(d.px, d.pb + d.thick(d.px)) },
      canthal: [pt(d, d.mc[0] - 4, 0), pt(d, d.lc[0] + 4, 0)],
      mm: { head: [d.hx, d.hb], peak: [d.px, d.pb], tail: [d.tx, d.tb], ala: d.ala, mc: d.mc, lc: d.lc, ll: d.ll },
    };
  }
  return { sides: out, mmpu: D.mmpu };
}
// a point on the skin from a brow's plane (mm), for working out how a drag maps to the screen
function skinAt(rig, side, u, v) {
  const l = rig.browLast; if (!l) return null;
  const d = l.D.sides[side], t = new Float32Array(3), [x, y] = d.xy(u, v);
  onSkin(l.G, x, y, t, 0); return [t[0], t[1], t[2]];
}

// ---------- dragging a dot: the brow slider values that put it at (u, v) mm ----------
const SNAP = 1.5;                       // mm: a dot this close to its guide line sits on it
const clampS = x => Math.round(Math.max(-100, Math.min(100, x)));
function dragTo(rig, f, side, which, u, v) {
  const l = rig.browLast; if (!l) return { f };
  const B = rig.A.meta.brow, style = l.D.style, d = l.D.sides[side];
  const [ala0, mc, lc] = d.marks, out = { ...f };
  const zero = ids => { const g = { ...f }; for (const id of ids) delete g[id]; return params(B, style, g); };
  const a = [ala0[0] + B.common.ala_out_mm, ala0[1]];
  const ec = [(mc[0] + lc[0]) / 2, (mc[1] + lc[1]) / 2], ln = Math.hypot(lc[0] - mc[0], lc[1] - mc[1]);
  const ll = [ec[0] + (lc[0] - mc[0]) / ln * B.common.iris_radius_mm, ec[1] + (lc[1] - mc[1]) / ln * B.common.iris_radius_mm];
  let snapped = false;
  const snap = du => { if (Math.abs(du) < SNAP) { snapped = true; return 0; } return du; };
  if (which === 'head') {
    const p0 = zero(['browIn', 'browSp']);
    out.browIn = clampS((v - p0.head_low) / SLIDE.browIn.head_low * 100);
    const hb = p0.head_low + SLIDE.browIn.head_low * out.browIn / 100;
    out.browSp = clampS(snap(u - lineX(a, mc, hb)) / SLIDE.browSp.head_x * 100);
  } else if (which === 'peak') {
    const p0 = zero(['browAh', 'browAp']);
    out.browAh = clampS((v - p0.peak_low) / SLIDE.browAh.peak_low * 100);
    const pb = p0.peak_low + SLIDE.browAh.peak_low * out.browAh / 100;
    const xl = lineX(a, ll, pb), xc = lineX(a, lc, pb), rule = (1 - p0.peak_at) * xl + p0.peak_at * xc + p0.peak_x;
    out.browAp = clampS(snap(u - rule) / (xc - xl) / SLIDE.browAp.peak_at * 100);
  } else if (which === 'tail') {
    const p0 = zero(['browTl', 'browLn']);
    out.browTl = clampS((v - p0.head_low - p0.tail_lift) / SLIDE.browTl.tail_lift * 100);
    const tb = p0.head_low + p0.tail_lift + SLIDE.browTl.tail_lift * out.browTl / 100;
    out.browLn = clampS(snap(u - lineX(a, lc, tb) - p0.tail_x) / SLIDE.browLn.tail_x * 100);
  } else if (which === 'peakT') {
    const p0 = zero(['browT']), T = v - d.pb;
    out.browT = clampS((T / p0.peak_thick - 1) / 0.5 * 100);
  } else if (which === 'headT') {
    const p0 = zero(['browTi']), T = v - d.hb;
    out.browTi = clampS((T / p0.head_thick - 1) / 0.5 * 100);
  }
  for (const k of Object.keys(out)) if (out[k] === 0 && k.startsWith('brow')) delete out[k];
  return { f: out, snapped };
}

// ---------- the brow editor: guides on the preview and dots to drag ----------
// Lines for the guide lines (from each ala through the medial canthus in yellow, the lateral
// limbus in green, the lateral canthus in blue) and the designed outline (white), drawn over
// the face and turning with it; dots for the head, peak and tail and handles for the
// thickness at the head and peak. Pointer handling follows the sculpt tool's: listeners
// capture on the host, so a grabbed dot stays grabbed until the pointer is released and the
// head neither turns nor sculpts meanwhile; two fingers turn the head.
const COL = { medial: [1, 0.78, 0.24], limbus: [0.35, 0.9, 0.47], lateral: [0.31, 0.63, 1], outline: [1, 1, 1] };
const DOTS = ['head', 'peak', 'tail', 'headT', 'peakT'];
const _v = new THREE.Vector3();
class Tool {
  constructor(view, ctl) {
    this.view = view; this.ctl = ctl; this.on = false;
    this.host = view.host; this.el = view.r.domElement;
    this.layer = document.createElement('div'); this.layer.className = 'avbr-dots'; this.layer.setAttribute('aria-hidden', 'true');
    this.host.append(this.layer);
    this.drag = null; this.touches = new Map(); this.turning = null; this.screen = []; this.raf = 0; this.built = null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(3), 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 11; this.lines.visible = false;
    view.rig.group.add(this.lines);
    const cap = { capture: true };
    this.h = { down: e => this.down(e), move: e => this.move(e), up: e => this.up(e) };
    this.host.addEventListener('pointerdown', this.h.down, cap);
    this.host.addEventListener('pointermove', this.h.move, cap);
    this.host.addEventListener('pointerup', this.h.up, cap);
    this.host.addEventListener('pointercancel', this.h.up, cap);
    const prev = view.onFrame;
    view.onFrame = () => { if (prev) prev(); this.paint(); };
  }
  setOn(on) {
    this.on = on; this.lines.visible = on;
    this.host.classList.toggle('browing', on);
    if (!on) { this.drag = null; this.turning = null; this.touches.clear(); }
    this.paint(); this.view.kick();
  }
  get rig() { return this.view.rig; }
  // the lines, rebuilt when the brows were
  build() {
    const l = this.rig.browLast;
    if (!l || l === this.built) return;
    this.built = l;
    const G = guides(this.rig), pos = [], col = [];
    const seg = (pts, c, closed) => { for (let i = 0; i + 1 < pts.length; i++) { pos.push(...pts[i], ...pts[i + 1]); col.push(...c, ...c); } if (closed) { pos.push(...pts[pts.length - 1], ...pts[0]); col.push(...c, ...c); } };
    for (const s of Object.values(G.sides)) {
      for (const k of ['medial', 'limbus', 'lateral']) seg([s[k][0], s[k][s[k].length - 1]], COL[k]);
      seg(s.outline, COL.outline, true);
      seg(s.canthal, [0.75, 0.75, 0.75]);
    }
    const g = this.lines.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(col), 3));
    this.dots = G;
  }
  screenOf(p) {
    const g = this.rig.group; _v.set(p[0], p[1], p[2]).applyMatrix4(g.matrixWorld).project(this.view.cam);
    return [(_v.x + 1) / 2 * this.view.w, (1 - _v.y) / 2 * this.view.h];
  }
  paint() {
    this.screen = [];
    if (this.on) this.build();
    if (!this.on || !this.dots) { if (this.lastHtml) { this.layer.innerHTML = ''; this.lastHtml = ''; } return; }
    const g = this.rig.group, cam = this.view.cam;
    g.updateMatrixWorld(); cam.updateMatrixWorld();
    const camLocal = g.worldToLocal(cam.position.clone());
    let html = '';
    for (const [side, s] of Object.entries(this.dots.sides)) for (const k of DOTS) {
      const d = s.dots[k], p = d.p;
      const seen = d.n[0] * (camLocal.x - p[0]) + d.n[1] * (camLocal.y - p[1]) + d.n[2] * (camLocal.z - p[2]) > 0;
      const [x, y] = this.screenOf(p);
      this.screen.push({ side, k, x, y, seen });
      if (!seen) continue;
      const on = this.drag && this.drag.k === k;
      html += `<i class="avbr-dot ${k}${on ? ' on' : ''}${on && this.drag.snapped ? ' snap' : ''}" style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)"></i>`;
    }
    if (html !== this.lastHtml) { this.layer.innerHTML = html; this.lastHtml = html; }
  }
  dotAt(cx, cy, touch) {
    const b = this.el.getBoundingClientRect(), x = cx - b.left, y = cy - b.top, R = touch ? 22 : 13;
    let best = null, bd = R * R;
    for (const s of this.screen) { if (!s.seen) continue; const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  centroid() { let x = 0, y = 0; for (const [a, b] of this.touches.values()) { x += a; y += b; } return [x / this.touches.size, y / this.touches.size]; }
  down(e) {
    if (!this.on) return;
    const touch = e.pointerType === 'touch';
    if (touch) {
      this.touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.touches.size >= 2) {
        // two fingers turn the head; a dot the first finger moved goes back
        if (this.drag) { this.drag = null; this.ctl.revert(); }
        this.turning = this.centroid(); this.view.dragging = true;
        e.stopPropagation(); e.preventDefault(); return;
      }
    }
    if (e.button !== 0) return;
    const hit = this.dotAt(e.clientX, e.clientY, touch);
    if (!hit) return;                     // anywhere else: the viewer turns the head
    const d = this.dots.sides[hit.side].dots[hit.k], [u, v] = d.uv;
    // how the dot moves on screen per mm along and up the brow
    const at = (du, dv) => { const p = skinAt(this.rig, hit.side, u + du, v + dv); return this.screenOf(p); };
    const o = at(0, 0), ex = at(1, 0), ey = at(0, 1);
    const J = [ex[0] - o[0], ey[0] - o[0], ex[1] - o[1], ey[1] - o[1]], det = J[0] * J[3] - J[1] * J[2];
    if (Math.abs(det) < 1e-6) return;
    this.ctl.begin();
    this.drag = { id: e.pointerId, side: hit.side, k: hit.k, x0: e.clientX, y0: e.clientY, u, v, J, det, f0: { ...this.ctl.look().f }, snapped: false };
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    e.stopPropagation(); e.preventDefault();
    this.paint();
  }
  move(e) {
    if (!this.on) return;
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.turning) {
      if (this.touches.size < 2) return;
      const c = this.centroid(), v = this.view;
      v.yaw += (c[0] - this.turning[0]) * 0.012;
      v.pitch = Math.max(-0.25, Math.min(0.45, v.pitch + (c[1] - this.turning[1]) * 0.006));
      this.turning = c; v.kick();
      e.stopPropagation(); e.preventDefault(); return;
    }
    const D = this.drag;
    if (!D || D.id !== e.pointerId) return;
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX - D.x0, sy = e.clientY - D.y0, J = D.J;
    const du = (J[3] * sx - J[1] * sy) / D.det, dv = (-J[2] * sx + J[0] * sy) / D.det;
    D.next = [D.u + du, D.v + dv];
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }
  flush() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    const D = this.drag; if (!D || !D.next) return;
    const [u, v] = D.next; D.next = null;
    const r = dragTo(this.rig, D.f0, D.side, D.k, u, v);
    D.snapped = r.snapped;
    this.ctl.change(r.f);
  }
  // ups always reach the viewer too, so its own turn drag never sticks
  up(e) {
    if (this.touches.has(e.pointerId)) {
      this.touches.delete(e.pointerId);
      if (this.turning) { if (this.touches.size < 2) { this.turning = null; this.view.dragging = false; } return; }
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.flush(); this.drag = null; this.ctl.end(); this.paint();
  }
  dispose() {
    const cap = { capture: true };
    this.host.removeEventListener('pointerdown', this.h.down, cap);
    this.host.removeEventListener('pointermove', this.h.move, cap);
    this.host.removeEventListener('pointerup', this.h.up, cap);
    this.host.removeEventListener('pointercancel', this.h.up, cap);
    cancelAnimationFrame(this.raf);
    this.lines.removeFromParent(); this.lines.geometry.dispose(); this.lines.material.dispose();
    this.layer.remove();
  }
}

const AvatarBrows = { parts, update, guides, dragTo, skinAt, Tool, SLIDE: Object.keys(SLIDE) };
window.AvatarBrows = AvatarBrows;
export default AvatarBrows;
