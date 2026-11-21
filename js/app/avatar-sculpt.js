// Sculpt points: free push and pull on the face, on top of the slider morphs.
// A look keeps its points in look.sc (see avatar-data.js normalizeSc):
//   [{ v: 10551, d: [0, 40, 25], r: 250, m: 1 }]
// v is a head vertex (the canonical one of its weld group), so a point stays on the same spot
// of the face when sliders change; d is the offset in thousandths of a model unit, r the size
// (radius of influence) in the same units, m: 1 mirrors the point onto the other side.
// Each point moves the skin around it by d with a smooth falloff. Points go on one after
// another, each from the shape the one before left: with the offset capped at half the size,
// every point is a fold-free warp of space, so lips and lids can't pass through each other.
// The eyeballs move whole, and lids are kept outside them. Hair, clothes, brows and lashes
// follow because they read the head's delta after this runs (avatar3d.js).
import * as THREE from 'three';

const MAXN = 16, RMIN = 60, RMAX = 600, RDEF = 250;
const K = 0.5, K_MOUTH = 0.4;          // largest offset as a share of the size
const BUDGET = 0.34;                   // most that overlapping points may add up to, in model units
const MOUTH = [0, 6.686, 1.46], MOUTH_HALF = 0.26;   // the lip line (lipU/lipL morphs meet there)
const CENTRE = 0.008;                  // a vertex this close to x = 0 sits on the centre line
const fall = t => { const s = 1 - t * t; return s * s; };

// ---------- per-asset tables, built once ----------
function prep(A) {
  if (A.sculpt) return A.sculpt;
  const n = A.base.length / 3, B = A.base, weld = A.weld;
  const isEye = new Uint8Array(n), eyes = [{ all: [], ball: [] }, { all: [], ball: [] }];
  for (const prim of ['eye', 'cornea']) for (const v of new Set(A.headPrims[prim] || [])) {
    if (isEye[v]) continue;
    isEye[v] = 1;
    const e = eyes[B[v * 3] >= 0 ? 0 : 1];
    e.all.push(v); if (prim === 'eye') e.ball.push(v);
  }
  const skin = [];
  for (let v = 0; v < n; v++) if (!isEye[v]) skin.push(v);
  // the skin near each eye: lids, kept outside the eyeball after sculpting
  for (const e of eyes) {
    const c = mean(B, e.ball), R = (A.meta.eyes && A.meta.eyes[0] && A.meta.eyes[0].R) || 0.155;
    e.lid = Uint32Array.from(skin.filter(v => Math.hypot(B[v * 3] - c[0], B[v * 3 + 1] - c[1], B[v * 3 + 2] - c[2]) < R * 2));
    e.all = Uint32Array.from(e.all); e.ball = Uint32Array.from(e.ball);
  }
  // rest normals of the skin, smooth across UV seams, for the depth direction
  const nrm = new Float32Array(n * 3), ix = A.headPrims.skin || [];
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = B[b] - B[a], uy = B[b + 1] - B[a + 1], uz = B[b + 2] - B[a + 2];
    const vx = B[c] - B[a], vy = B[c + 1] - B[a + 1], vz = B[c + 2] - B[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [ix[i], ix[i + 1], ix[i + 2]]) { const w = weld[v] * 3; nrm[w] += nx; nrm[w + 1] += ny; nrm[w + 2] += nz; }
  }
  // weld holds a group per position (vertices split by UV seams share one); a point anchors
  // to the first skin vertex of its group
  const first = new Int32Array(n).fill(-1);
  for (const v of skin) if (first[weld[v]] < 0) first[weld[v]] = v;
  const canon = skin.filter(v => first[weld[v]] === v);
  A.sculpt = { skin: Uint32Array.from(skin), canon: Uint32Array.from(canon), first, eyes, nrm, mirror: new Map() };
  return A.sculpt;
}
function mean(P, list) {
  const c = [0, 0, 0];
  for (const v of list) { c[0] += P[v * 3]; c[1] += P[v * 3 + 1]; c[2] += P[v * 3 + 2]; }
  const k = list.length || 1; c[0] /= k; c[1] /= k; c[2] /= k;
  return c;
}

// the canonical skin vertex at the same spot on the other side of the face
function mirrorOf(A, v) {
  const G = prep(A);
  if (G.mirror.has(v)) return G.mirror.get(v);
  const B = A.base, x = -B[v * 3], y = B[v * 3 + 1], z = B[v * 3 + 2];
  let best = v, bd = 1e9;
  for (const u of G.canon) { const dx = B[u * 3] - x, dy = B[u * 3 + 1] - y, dz = B[u * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = u; } }
  G.mirror.set(v, best);
  return best;
}
const canonOf = (A, v) => { const f = prep(A).first[A.weld[v]]; return f >= 0 ? f : v; };
const onCentre = (A, v) => Math.abs(A.base[v * 3]) < CENTRE;
// unit rest normal at a vertex
function normalAt(A, v) {
  const N = prep(A).nrm, w = A.weld[v] * 3, l = Math.hypot(N[w], N[w + 1], N[w + 2]) || 1;
  return [N[w] / l, N[w + 1] / l, N[w + 2] / l];
}

// ---------- limits ----------
// the most a point may move: half its size, less where it reaches the lips
function maxOffset(A, p) {
  const B = A.base, r = p.r;
  const x = B[p.v * 3], y = B[p.v * 3 + 1], z = B[p.v * 3 + 2];
  const dx = Math.max(0, Math.abs(x) - MOUTH_HALF), dm = Math.hypot(dx, y - MOUTH[1], z - MOUTH[2]) * 1000;
  const near = Math.max(0, Math.min(1, 1 - dm / r));
  return r * (K + (K_MOUTH - K) * near);
}
// The points as they go on the mesh, mirrors included, in model units.
function expand(A, sc) {
  const out = [];
  sc.forEach((p, i) => {
    const d = p.d.map(x => x / 1000), r = p.r / 1000;
    if (p.m && onCentre(A, p.v)) { d[0] = 0; out.push({ v: p.v, d, r, i }); return; }
    out.push({ v: p.v, d, r, i });
    if (p.m) out.push({ v: mirrorOf(A, p.v), d: [-d[0], d[1], d[2]], r, i });
  });
  return out;
}
// Clamps point i of sc (offsets in thousandths): half its size (less at the lips), on the
// centre line when mirrored there, and within what the points it overlaps leave over.
// Returns a new list.
function limit(A, sc, i) {
  const out = sc.slice(), p = { ...out[i], d: out[i].d.slice() };
  if (p.m && onCentre(A, p.v)) p.d[0] = 0;
  const B = A.base, ex = expand(A, sc).filter(q => q.i !== i);
  const at = v => [B[v * 3], B[v * 3 + 1], B[v * 3 + 2]];
  const a = at(p.v), mine = p.m && !onCentre(A, p.v) ? at(mirrorOf(A, p.v)) : null, r = p.r / 1000;
  const ov = (b, rb) => { const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); return d < r + rb ? fall(d / (r + rb)) : 0; };
  let used = 0;
  for (const q of ex) used += Math.hypot(...q.d) * ov(at(q.v), q.r);
  const self = mine ? ov(mine, r) : 0;
  const cap = Math.min(maxOffset(A, p), Math.max(0, (BUDGET - used) * 1000) / (1 + self));
  const len = Math.hypot(...p.d);
  if (len > cap) { const s = cap / len; p.d = p.d.map(x => x * s); }
  p.d = p.d.map(x => Math.round(x) || 0);
  out[i] = p;
  return out;
}

// ---------- applying the points to a rig's positions (after the slider morphs) ----------
function apply(rig, sc) {
  if (!sc || !sc.length) return;
  const A = rig.A, G = prep(A), P = rig.pos, skin = G.skin;
  // the eyes before: centre, outer radius, and how far each lid vertex sits from the centre
  const eyes = G.eyes.map(e => {
    const c = mean(P, e.ball);
    let R = 0; for (const v of e.all) R = Math.max(R, Math.hypot(P[v * 3] - c[0], P[v * 3 + 1] - c[1], P[v * 3 + 2] - c[2]));
    const g0 = new Float32Array(e.lid.length);
    e.lid.forEach((v, k) => { g0[k] = Math.hypot(P[v * 3] - c[0], P[v * 3 + 1] - c[1], P[v * 3 + 2] - c[2]); });
    return { e, c, R, g0, move: [0, 0, 0] };
  });
  const list = expand(A, sc.map((p, i) => ({ ...p, d: limit(A, sc, i)[i].d })));
  for (const { v, d, r } of list) {
    if (!d[0] && !d[1] && !d[2]) continue;
    const ax = P[v * 3], ay = P[v * 3 + 1], az = P[v * 3 + 2], r2 = r * r;
    for (let k = 0; k < skin.length; k++) {
      const u = skin[k] * 3, dx = P[u] - ax, dy = P[u + 1] - ay, dz = P[u + 2] - az, q = dx * dx + dy * dy + dz * dz;
      if (q >= r2) continue;
      const w = fall(Math.sqrt(q) / r);
      P[u] += d[0] * w; P[u + 1] += d[1] * w; P[u + 2] += d[2] * w;
    }
    // each eyeball moves whole, by the weight at its centre
    for (const E of eyes) {
      const q = Math.hypot(E.c[0] - ax, E.c[1] - ay, E.c[2] - az);
      if (q >= r) continue;
      const w = fall(q / r);
      for (let j = 0; j < 3; j++) { E.c[j] += d[j] * w; E.move[j] += d[j] * w; }
    }
  }
  for (const E of eyes) {
    const [mx, my, mz] = E.move;
    if (mx || my || mz) for (const v of E.e.all) { P[v * 3] += mx; P[v * 3 + 1] += my; P[v * 3 + 2] += mz; }
    // lids stay outside the eyeball: never closer to its centre than they were, or than its
    // surface, whichever is nearer
    const c = E.c, lid = E.e.lid;
    for (let k = 0; k < lid.length; k++) {
      const u = lid[k] * 3, x = P[u] - c[0], y = P[u + 1] - c[1], z = P[u + 2] - c[2], l = Math.hypot(x, y, z) || 1e-6;
      const want = Math.min(E.g0[k], E.R + 0.003);
      if (l < want) { const s = want / l; P[u] = c[0] + x * s; P[u + 1] = c[1] + y * s; P[u + 2] = c[2] + z * s; }
    }
  }
}
const key = sc => sc && sc.length ? JSON.stringify(sc) : '';

// ---------- the creator's tool: picking, dragging and the dots on the face ----------
// ctl (avatar-creator.js) owns the look and history:
//   state() -> { sc, sel, fixed, mirror, size }   select(i)   change(sc, sel)   begin()   end()   revert()   note(text)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
class Tool {
  constructor(view, ctl) {
    this.view = view; this.ctl = ctl; this.on = false;
    this.host = view.host; this.el = view.r.domElement;
    this.layer = document.createElement('div'); this.layer.className = 'avsc-dots'; this.layer.setAttribute('aria-hidden', 'true');
    this.host.append(this.layer);
    this.drag = null; this.touches = new Map(); this.turning = null; this.screen = []; this.raf = 0; this.wheelT = 0;
    const cap = { capture: true };
    this.h = {
      down: e => this.down(e), move: e => this.move(e), up: e => this.up(e),
      wheel: e => this.wheel(e), menu: e => e.preventDefault(),
    };
    this.host.addEventListener('pointerdown', this.h.down, cap);
    this.host.addEventListener('pointermove', this.h.move, cap);
    this.host.addEventListener('pointerup', this.h.up, cap);
    this.host.addEventListener('pointercancel', this.h.up, cap);
    this.host.addEventListener('wheel', this.h.wheel, { capture: true, passive: false });
    this.host.addEventListener('contextmenu', this.h.menu);
    view.onFrame = () => this.paint();
  }
  setOn(on) {
    this.on = on; this.view.still = on;
    this.host.classList.toggle('sculpting', on);
    if (!on) { this.drag = null; this.turning = null; this.touches.clear(); }
    this.paint(); this.view.kick();
  }
  get rig() { return this.view.rig; }
  face() { return this.rig.group.children.find(m => m.isMesh && m.material === this.rig.M.skin); }

  // the face vertex under a screen point, or -1
  pick(cx, cy) {
    const b = this.el.getBoundingClientRect(), m = this.face();
    if (!m) return -1;
    _ndc.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
    this.rig.group.updateMatrixWorld(true);
    _ray.setFromCamera(_ndc, this.view.cam);
    const hit = _ray.intersectObject(m, false)[0];
    if (!hit) return -1;
    const P = this.rig.pos, loc = m.worldToLocal(hit.point.clone()), f = hit.face;
    let best = f.a, bd = 1e9;
    for (const v of [f.a, f.b, f.c]) { const d = (P[v * 3] - loc.x) ** 2 + (P[v * 3 + 1] - loc.y) ** 2 + (P[v * 3 + 2] - loc.z) ** 2; if (d < bd) { bd = d; best = v; } }
    return canonOf(this.rig.A, best);
  }
  // the point whose dot is under a screen point, or -1
  dotAt(cx, cy, touch) {
    const b = this.el.getBoundingClientRect(), x = cx - b.left, y = cy - b.top, R = touch ? 22 : 13;
    let best = -1, bd = R * R;
    for (const s of this.screen) { if (!s.seen) continue; const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s.i; } }
    return best;
  }

  down(e) {
    if (!this.on) return;
    const touch = e.pointerType === 'touch';
    if (touch) {
      this.touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.touches.size >= 2) {
        // two fingers turn the head; a point the first finger placed or moved goes back
        if (this.drag) { cancelAnimationFrame(this.raf); this.raf = 0; this.next = null; this.drag = null; this.ctl.revert(); }
        this.turning = this.centroid();
        this.view.dragging = true;
        e.stopPropagation(); e.preventDefault();
        return;
      }
    }
    if (e.button !== 0) return;          // right-drag turns the head (avatar3d.js Viewer)
    const st = this.ctl.state();
    let i = -1;
    if (st.fixed && st.sel >= 0) i = st.sel;
    else {
      i = this.dotAt(e.clientX, e.clientY, touch);
      if (i < 0) {
        const v = this.pick(e.clientX, e.clientY);
        if (v < 0) return;               // background: the viewer turns the head
        if (st.sc.length >= MAXN) { this.ctl.note(`${MAXN} points is the most. Delete one to add another.`); return; }
        this.ctl.begin();
        const p = { v, d: [0, 0, 0], r: st.size };
        if (st.mirror) p.m = 1;
        i = st.sc.length;
        this.ctl.change([...st.sc, p], i);
      } else this.ctl.select(i);
    }
    this.start(e, i);
    e.stopPropagation(); e.preventDefault();
  }
  start(e, i) {
    const st = this.ctl.state(), p = st.sc[i];
    if (!p) return;
    this.ctl.begin();
    const cam = this.view.cam, g = this.rig.group, P = this.rig.pos;
    g.updateMatrixWorld(true); cam.updateMatrixWorld();
    // screen right and up, and the size of a pixel at the point's depth, in the head's own space
    const wp = _v.set(P[p.v * 3], P[p.v * 3 + 1], P[p.v * 3 + 2]).applyMatrix4(g.matrixWorld);
    const dist = wp.distanceTo(cam.position);
    const px = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.max(1, this.view.h);
    const inv = g.getWorldQuaternion(_q).invert();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).applyQuaternion(inv);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).applyQuaternion(inv);
    this.drag = { id: e.pointerId, i, x: e.clientX, y: e.clientY, d0: p.d.slice(), plane: [0, 0, 0], depth: 0, px: px * 1000, right, up, n: normalAt(this.rig.A, p.v) };
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
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
      e.stopPropagation(); e.preventDefault();
      return;
    }
    const D = this.drag;
    if (!D || D.id !== e.pointerId) return;
    e.stopPropagation(); e.preventDefault();
    const dx = e.clientX - D.x, dy = e.clientY - D.y;
    D.x = e.clientX; D.y = e.clientY;
    // shift-drag pushes in or pulls out along the surface; a plain drag moves it on screen
    if (e.shiftKey) D.depth -= dy * D.px;
    else for (let j = 0; j < 3; j++) D.plane[j] += (D.right.getComponent(j) * dx - D.up.getComponent(j) * dy) * D.px;
    this.push(D.i, D.d0.map((x, j) => x + D.plane[j] + D.n[j] * D.depth));
  }
  // ups always reach the viewer too, so its own turn drag never sticks
  up(e) {
    if (this.touches.has(e.pointerId)) {
      this.touches.delete(e.pointerId);
      if (this.turning) {
        if (this.touches.size < 2) { this.turning = null; this.view.dragging = false; }
        return;
      }
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.finish();
  }
  finish() { this.flush(); this.drag = null; this.ctl.end(); }
  centroid() {
    let x = 0, y = 0; for (const [a, b] of this.touches.values()) { x += a; y += b; }
    return [x / this.touches.size, y / this.touches.size];
  }
  // the mouse wheel pushes the selected point in or pulls it out
  wheel(e) {
    if (!this.on) return;
    const st = this.ctl.state(), p = st.sc[st.sel];
    if (!p) return;
    e.preventDefault(); e.stopPropagation();
    if (!this.wheelT) this.ctl.begin();
    clearTimeout(this.wheelT);
    this.wheelT = setTimeout(() => { this.wheelT = 0; this.ctl.end(); }, 450);
    const step = (e.deltaY < 0 ? 1 : -1) * Math.max(4, p.r * 0.04), n = normalAt(this.rig.A, p.v);
    this.push(st.sel, p.d.map((x, j) => x + n[j] * step));
  }
  // set a point's offset (thousandths), clamped, and show it on the next frame
  push(i, d) {
    const st = this.ctl.state();
    if (!st.sc[i]) return;
    const sc = st.sc.slice(); sc[i] = { ...sc[i], d };
    this.next = { sc: limit(this.rig.A, sc, i), i };
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }
  flush() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    if (this.next) { const { sc, i } = this.next; this.next = null; this.ctl.change(sc, i, { live: true }); }
  }

  // the dots: one per point, where its anchor is now; a mirrored point shows a hollow twin
  paint() {
    const st = this.on ? this.ctl.state() : null;
    const sc = st ? st.sc : [];
    this.screen = [];
    const g = this.rig.group, cam = this.view.cam, P = this.rig.pos, N = this.rig.nrm, w = this.view.w, h = this.view.h;
    g.updateMatrixWorld(); cam.updateMatrixWorld();
    const camLocal = g.worldToLocal(cam.position.clone());
    const spot = (v, i, twin) => {
      _v.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      const tx = camLocal.x - _v.x, ty = camLocal.y - _v.y, tz = camLocal.z - _v.z;
      const seen = N[v * 3] * tx + N[v * 3 + 1] * ty + N[v * 3 + 2] * tz > 0;
      _v.applyMatrix4(g.matrixWorld).project(cam);
      return { i, twin, seen, x: (_v.x + 1) / 2 * w, y: (1 - _v.y) / 2 * h };
    };
    sc.forEach((p, i) => {
      this.screen.push(spot(p.v, i, false));
      if (p.m && !onCentre(this.rig.A, p.v)) this.screen.push(spot(mirrorOf(this.rig.A, p.v), i, true));
    });
    let html = '';
    for (const s of this.screen) {
      if (!s.seen) continue;
      const cls = ['avsc-dot', s.twin ? 'twin' : '', st && s.i === st.sel ? 'sel' : '', st && s.i === st.sel && st.fixed ? 'fixed' : ''].filter(Boolean).join(' ');
      html += `<i class="${cls}" style="transform:translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)"></i>`;
    }
    if (html !== this.lastHtml) { this.layer.innerHTML = html; this.lastHtml = html; }
  }
  dispose() {
    const cap = { capture: true };
    this.host.removeEventListener('pointerdown', this.h.down, cap);
    this.host.removeEventListener('pointermove', this.h.move, cap);
    this.host.removeEventListener('pointerup', this.h.up, cap);
    this.host.removeEventListener('pointercancel', this.h.up, cap);
    this.host.removeEventListener('wheel', this.h.wheel, { capture: true });
    this.host.removeEventListener('contextmenu', this.h.menu);
    clearTimeout(this.wheelT); cancelAnimationFrame(this.raf);
    this.view.onFrame = null; this.view.still = false;
    this.layer.remove();
  }
}

const AvatarSculpt = { MAXN, RMIN, RMAX, RDEF, apply, key, limit, maxOffset, normalAt, mirrorOf, onCentre, canonOf, expand, prep, Tool };
window.AvatarSculpt = AvatarSculpt;
export { apply, key, limit, Tool };
export default AvatarSculpt;
