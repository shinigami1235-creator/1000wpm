// Faceted 3D avatars: loads assets/avatar/avatar.glb once, morphs the head on the CPU
// from the slider values, binds every prop to the head surface so hair and gear follow
// the face shape, and draws through one shared WebGL renderer. Thumbnails render into
// an offscreen target on that same renderer, so the site never holds more than one
// WebGL context for avatars.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const D = window.AvatarData;
const GLB_URL = new URL('../../assets/avatar/avatar.glb', import.meta.url).href;

// ---------- assets ----------
async function loadAssets() {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(GLB_URL);
  const A = { headPrims: {}, headLines: null, props: new Map(), base: null, morphs: new Map(), meta: gltf.scene.userData || {} };
  let head = null;
  gltf.scene.traverse(o => { if (o.name === 'head') head = o; });
  const kids = head.isMesh ? [head] : head.children;
  for (const m of kids) {
    const g = m.geometry, name = m.material.name;
    if (!A.base) {
      A.base = new Float32Array(g.attributes.position.array);
      const dict = m.morphTargetDictionary || {};
      const list = g.morphAttributes.position || [];
      for (const [key, k] of Object.entries(dict)) {
        const arr = list[k].array, idx = [], d = [];
        for (let i = 0; i < arr.length; i += 3) {
          if (arr[i] || arr[i + 1] || arr[i + 2]) { idx.push(i / 3); d.push(arr[i], arr[i + 1], arr[i + 2]); }
        }
        A.morphs.set(key, { idx: Uint32Array.from(idx), d: Float32Array.from(d) });
      }
    }
    if (m.isLineSegments || name === 'line') A.headLines = g.index.array.slice();
    else A.headPrims[name] = g.index.array.slice();
  }
  // every prop part shares one vertex set; userData.parts lists the slices
  let props = null;
  gltf.scene.traverse(o => { if (o.userData && o.userData.parts) props = o; });
  const tri = props.children.find(m => m.isMesh), lin = props.children.find(m => m.isLineSegments);
  const g = tri.geometry, P = g.attributes.position.array, B = g.attributes._bind.array, W = g.attributes._bindw.array;
  const T = g.index.array, Ls = lin.geometry.index.array;
  const rebase = (arr, v0) => { const o = new Uint16Array(arr.length); for (let i = 0; i < arr.length; i++) o[i] = arr[i] - v0; return o; };
  for (const [pid, mat, v0, vn, t0, tn, l0, ln] of props.userData.parts) {
    const part = {
      mat, pos: P.slice(v0 * 3, (v0 + vn) * 3), bind: B.slice(v0 * 4, (v0 + vn) * 4), bindw: W.slice(v0 * 4, (v0 + vn) * 4),
      index: tn ? rebase(T.subarray(t0, t0 + tn), v0) : null, lines: ln ? rebase(Ls.subarray(l0, l0 + ln), v0) : null,
    };
    if (!A.props.has(pid)) A.props.set(pid, []);
    A.props.get(pid).push(part);
  }
  // the glTF scene graph and its morph data are no longer needed
  gltf.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  return A;
}

// ---------- materials ----------
const SHARED = { uRim: { value: new THREE.Color('#39ff88') }, uRimStr: { value: 0.28 } };
function rimmed(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uRim = SHARED.uRim; sh.uniforms.uRimStr = SHARED.uRimStr;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimStr;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uRim * pow(rimF, 3.0) * uRimStr;`);
  };
  mat.customProgramCacheKey = () => 'av-rim';
  return mat;
}
function makeMats() {
  const lam = (hex, extra = {}) => rimmed(new THREE.MeshLambertMaterial({ color: hex, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2, ...extra }));
  const M = {
    skin: lam('#c69470'), lips: lam('#b07060'), cut: lam('#0b130f'), sclera: lam('#b8c1bb'), iris: lam('#0d1411'),
    brow: lam('#3b281c', { side: THREE.DoubleSide }), hair: lam('#3b281c', { side: THREE.DoubleSide }),
    stubble: lam('#6b4a38', { side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    cloth: lam('#1a2420', { side: THREE.DoubleSide }), cloth2: lam('#243029', { side: THREE.DoubleSide }),
    gear: lam('#303b37', { side: THREE.DoubleSide }), metal: lam('#4f5d57', { side: THREE.DoubleSide }), gold: lam('#e0ad2e', { side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: '#39ff88', side: THREE.DoubleSide }),
    lens: new THREE.MeshBasicMaterial({ color: '#39ff88', transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
  };
  M.headLine = new LineMaterial({ color: 0x39ff88, linewidth: 1, transparent: true, opacity: 0.7, depthWrite: false });
  M.faintLine = new LineMaterial({ color: 0x39ff88, linewidth: 1, transparent: true, opacity: 0.3, depthWrite: false });
  M.propLine = new LineMaterial({ color: 0x39ff88, linewidth: 1, transparent: true, opacity: 0.85, depthWrite: false });
  return M;
}
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

// ---------- the rig: one avatar built from the shared assets ----------
const TOP_PARTS = { 'hair-mohawk': [1], 'hair-undercut': [1] };    // hidden under a cap
const BULKY = ['slick', 'bob', 'long', 'braids'];                   // these take the loose cap and bandana

export class Rig {
  constructor(A) {
    this.A = A;
    this.group = new THREE.Group();
    this.M = makeMats();
    const n = A.base.length / 3;
    this.n = n;
    this.pos = new Float32Array(A.base);
    this.delta = new Float32Array(n * 3);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.headMeshes = [];
    for (const [name, index] of Object.entries(A.headPrims)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', this.posAttr); g.setIndex(new THREE.BufferAttribute(index, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6.6, 0.2), 4);
      const m = new THREE.Mesh(g, this.M[name] || this.M.skin);
      this.headMeshes.push(m); this.group.add(m);
    }
    this.headLines = this.lines(A.headLines, this.pos, this.M.headLine);
    this.group.add(this.headLines.obj);
    this.props = new Map();
    this.look = null;
  }

  lines(index, pos, mat) {
    const g = new LineSegmentsGeometry();
    const arr = new Float32Array(index.length * 3);
    g.setPositions(arr);
    const obj = new LineSegments2(g, mat);
    obj.frustumCulled = false;
    const rec = { obj, index, buf: g.attributes.instanceStart.data, pos };
    this.fillLines(rec);
    return rec;
  }
  fillLines(rec) {
    const a = rec.buf.array, idx = rec.index, p = rec.pos;
    for (let i = 0; i < idx.length; i++) { const v = idx[i] * 3; a[i * 3] = p[v]; a[i * 3 + 1] = p[v + 1]; a[i * 3 + 2] = p[v + 2]; }
    rec.buf.needsUpdate = true;
  }

  prop(pid) {
    if (this.props.has(pid)) return this.props.get(pid);
    const parts = this.A.props.get(pid) || [];
    const grp = new THREE.Group();
    const recs = parts.map((p, k) => {
      const pos = new Float32Array(p.pos);
      const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
      const g = new THREE.BufferGeometry();
      const sub = new THREE.Group();
      let mesh = null;
      if (p.index) {
        g.setAttribute('position', attr); g.setIndex(new THREE.BufferAttribute(p.index, 1));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6.6, 0.2), 5);
        mesh = new THREE.Mesh(g, this.M[p.mat] || this.M.gear);
        sub.add(mesh);
      }
      const rec = { p, pos, attr, mesh, sub, lines: null, k };
      if (p.lines) { rec.lines = this.lines(p.lines, pos, this.lineMat(p.mat)); sub.add(rec.lines.obj); }
      grp.add(sub);
      return rec;
    });
    const out = { grp, recs, stamp: -1 };
    this.group.add(grp);
    this.props.set(pid, out);
    return out;
  }

  lineMat(mat) {
    if (mat === 'line') return this.M.headLine;
    if (mat === 'line2' || mat === 'hair' || mat === 'stubble' || mat === 'brow') return this.M.faintLine;
    return this.M.propLine;
  }

  // Bound prop vertices move by the barycentric blend of the head's movement.
  updateProp(pr) {
    const dl = this.delta;
    for (const r of pr.recs) {
      const { pos: base, bind, bindw } = r.p, out = r.pos;
      for (let i = 0, n = base.length / 3; i < n; i++) {
        const b0 = bind[i * 4] * 3, b1 = bind[i * 4 + 1] * 3, b2 = bind[i * 4 + 2] * 3;
        const w0 = bindw[i * 4] / 255, w1 = bindw[i * 4 + 1] / 255, w2 = bindw[i * 4 + 2] / 255;
        out[i * 3] = base[i * 3] + w0 * dl[b0] + w1 * dl[b1] + w2 * dl[b2];
        out[i * 3 + 1] = base[i * 3 + 1] + w0 * dl[b0 + 1] + w1 * dl[b1 + 1] + w2 * dl[b2 + 1];
        out[i * 3 + 2] = base[i * 3 + 2] + w0 * dl[b0 + 2] + w1 * dl[b1 + 2] + w2 * dl[b2 + 2];
      }
      r.attr.needsUpdate = true;
      if (r.lines) this.fillLines(r.lines);
    }
    pr.stamp = this.shapeStamp;
  }

  set(look, { bare = false } = {}) {
    const L = D.normalize(look);
    const shapeKey = JSON.stringify(L.f);
    if (shapeKey !== this.shapeKey) {
      this.shapeKey = shapeKey; this.shapeStamp = (this.shapeStamp || 0) + 1;
      const pos = this.pos, base = this.A.base, dl = this.delta;
      pos.set(base);
      for (const s of D.SLIDERS) {
        const v = (L.f[s.id] || 0) / 100;
        if (!v) continue;
        const m = this.A.morphs.get(s.id + (v < 0 ? '-' : '+'));
        if (!m) continue;
        const w = Math.abs(v), idx = m.idx, d = m.d;
        for (let i = 0; i < idx.length; i++) { const k = idx[i] * 3; pos[k] += w * d[i * 3]; pos[k + 1] += w * d[i * 3 + 1]; pos[k + 2] += w * d[i * 3 + 2]; }
      }
      for (let i = 0; i < pos.length; i++) dl[i] = pos[i] - base[i];
      this.posAttr.needsUpdate = true;
      this.fillLines(this.headLines);
    }
    // which props
    const fem = (L.f.sex || 0) > 25, brows = fem ? 'brows-f' : 'brows';
    const want = new Set(bare ? [brows, 'face-lines'] : [brows, 'face-lines', 'hair-' + L.h, 'fit-' + L.o]);
    if (fem) want.add('lashes');
    if (L.fh !== 'none' && !bare) want.add('fh-' + L.fh);
    const capOn = L.g.includes('cap');
    for (const g of bare ? [] : L.g) want.add('gear-' + g + ((g === 'cap' || g === 'bandana') && BULKY.includes(L.h) ? '-loose' : ''));
    for (const [pid, pr] of this.props) pr.grp.visible = want.has(pid);
    for (const pid of want) {
      if (!this.A.props.has(pid)) continue;
      const pr = this.prop(pid);
      pr.grp.visible = true;
      for (const r of pr.recs) r.sub.visible = !(capOn && (TOP_PARTS[pid] || []).includes(r.k));
      if (pr.stamp !== this.shapeStamp) this.updateProp(pr);
    }
    // colours
    const M = this.M, skin = D.SKIN[L.sk], hair = D.HAIR_COLORS[L.hc].hex, glow = D.part('gl', L.gl).hex;
    M.skin.color.set(skin);
    // lips: a little darker and redder than the skin, more so on feminine faces
    const lc = new THREE.Color(skin).multiplyScalar(fem ? 0.8 : 0.9);
    M.lips.color.setRGB(Math.min(1, lc.r * (fem ? 1.12 : 1.04)), lc.g * (fem ? 0.86 : 0.95), lc.b * (fem ? 0.92 : 0.97));
    M.hair.color.set(hair); M.brow.color.copy(mix(hair, '#000000', 0.15));
    M.stubble.color.copy(mix(skin, hair, 0.55));
    M.cloth2.color.copy(mix('#202a25', glow, 0.12));
    M.glow.color.set(glow); M.lens.color.copy(mix(glow, '#03140a', 0.35));
    M.iris.color.set('#120d0a');
    M.headLine.color.set(glow); M.propLine.color.set(glow); M.faintLine.color.set(glow);
    SHARED.uRim.value.set(glow);
    this.look = L;
    return L;
  }

  setLineScale(px, w, h) {
    this.M.headLine.linewidth = px; this.M.faintLine.linewidth = px; this.M.propLine.linewidth = px * 1.1;
    this.M.headLine.resolution.set(w, h); this.M.faintLine.resolution.set(w, h); this.M.propLine.resolution.set(w, h);
  }
}

// turn the avatar about the middle of the head rather than the origin
export function turn(group, yaw) {
  const c = 0.25;
  group.rotation.y = yaw;
  group.position.set(-Math.sin(yaw) * c, 0, c - Math.cos(yaw) * c);
}

// ---------- scene ----------
function makeScene(rig) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfe8e2', '#2a2622', 0.75));
  const key = new THREE.DirectionalLight('#fff3e8', 2.1); key.position.set(-1.2, 1.1, 1.0); scene.add(key);
  const fill = new THREE.DirectionalLight('#d6e4ff', 0.8); fill.position.set(1.2, -0.1, 0.9); scene.add(fill);
  const back = new THREE.DirectionalLight('#39ff88', 0.9); back.position.set(0.4, 0.5, -1); scene.add(back);
  scene.add(rig.group);
  return { scene, back };
}

// ---------- shared renderer ----------
let renderer = null;
function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

let assets = null;
const ready = loadAssets().then(A => { assets = A; return A; });

// ---------- thumbnails ----------
let thumbRig = null, thumbScene = null, thumbCam = null;
const targets = new Map();
const scratch = document.createElement('canvas');
function thumb(look, size = 96, { yaw = 0.32, bare = false, frame = 'bust' } = {}) {
  if (!assets) throw new Error('avatar assets not loaded');
  const r = getRenderer();
  if (!thumbRig) {
    thumbRig = new Rig(assets);
    thumbScene = makeScene(thumbRig);
    thumbCam = new THREE.PerspectiveCamera(22, 1, 1, 60);
  }
  turn(thumbRig.group, yaw);
  const L = thumbRig.set(look, { bare });
  thumbScene.back.color.set(D.part('gl', L.gl).hex);
  const px = Math.round(size);
  let rt = targets.get(px);
  if (!rt) { rt = new THREE.WebGLRenderTarget(px, px, { samples: 4, colorSpace: THREE.SRGBColorSpace }); targets.set(px, rt); }
  thumbRig.setLineScale(px < 160 ? 1 : px / 280, px, px);
  // head and shoulders, a little from above
  const tall = L.h === 'mohawk' && !L.g.includes('cap') ? 0.25 : 0;
  if (frame === 'face') { thumbCam.position.set(0, 7.5, 7.6); thumbCam.lookAt(0, 7.3, 0.3); }
  else if (px <= 100) { thumbCam.position.set(0, 7.55 + tall * 0.5, 10.6 + tall * 1.5); thumbCam.lookAt(0, 7.12 + tall * 0.5, 0.15); }
  else { thumbCam.position.set(0, 7.45 + tall * 0.5, 12.6 + tall * 2); thumbCam.lookAt(0, 7.0 + tall * 0.55, 0.15); }
  thumbCam.updateProjectionMatrix();
  const prevTarget = r.getRenderTarget();
  r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear();
  r.render(thumbScene.scene, thumbCam);
  const buf = new Uint8Array(px * px * 4);
  r.readRenderTargetPixels(rt, 0, 0, px, px, buf);
  r.setRenderTarget(prevTarget);
  // flip, un-premultiply and lay over a dark backdrop tinted with the glow colour
  scratch.width = scratch.height = px;
  const c = scratch.getContext('2d');
  const img = c.createImageData(px, px);
  for (let y = 0; y < px; y++) {
    const src = (px - 1 - y) * px * 4, dst = y * px * 4;
    for (let x = 0; x < px * 4; x += 4) {
      const a = buf[src + x + 3];
      const k = a ? 255 / a : 0;
      img.data[dst + x] = Math.min(255, buf[src + x] * k); img.data[dst + x + 1] = Math.min(255, buf[src + x + 1] * k);
      img.data[dst + x + 2] = Math.min(255, buf[src + x + 2] * k); img.data[dst + x + 3] = a;
    }
  }
  const out = document.createElement('canvas'); out.width = out.height = px;
  const o = out.getContext('2d');
  const glow = new THREE.Color(D.part('gl', L.gl).hex);
  const bg = o.createRadialGradient(px * 0.5, px * 0.42, px * 0.05, px * 0.5, px * 0.5, px * 0.75);
  bg.addColorStop(0, `rgb(${Math.round(glow.r * 255 * 0.2)},${Math.round(glow.g * 255 * 0.2)},${Math.round(glow.b * 255 * 0.2)})`);
  bg.addColorStop(1, '#030604');
  o.fillStyle = bg; o.fillRect(0, 0, px, px);
  c.putImageData(img, 0, 0);
  o.drawImage(scratch, 0, 0);
  return out.toDataURL('image/png');
}

// ---------- the live view used by the creator ----------
export class Viewer {
  constructor(host, { reduceMotion = false } = {}) {
    this.host = host;
    this.r = getRenderer();
    this.rig = new Rig(assets);
    const s = makeScene(this.rig); this.scene = s.scene; this.back = s.back;
    this.cam = new THREE.PerspectiveCamera(24, 1, 1, 80);
    this.yaw = 0.35; this.pitch = 0.06; this.reduce = reduceMotion; this.dragging = false; this.idle = 0;
    host.append(this.r.domElement);
    this.r.domElement.className = 'av-canvas';
    this.r.domElement.setAttribute('aria-hidden', 'true');
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.resize();
    const el = this.r.domElement;
    let last = null;
    this.onDown = e => { last = [e.clientX, e.clientY]; this.dragging = true; el.setPointerCapture(e.pointerId); };
    this.onMove = e => {
      if (!last) return;
      this.yaw += (e.clientX - last[0]) * 0.012; this.pitch = Math.max(-0.25, Math.min(0.45, this.pitch + (e.clientY - last[1]) * 0.006));
      last = [e.clientX, e.clientY]; this.kick();
    };
    this.onUp = () => { last = null; this.dragging = false; this.idle = performance.now(); };
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp); el.addEventListener('pointercancel', this.onUp);
    this.raf = 0; this.alive = true;
    this.kick();
  }
  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.r.setPixelRatio(dpr); this.r.setSize(w, h, false);
    this.r.domElement.style.width = w + 'px'; this.r.domElement.style.height = h + 'px';
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.rig.setLineScale(1.5 * dpr, w * dpr, h * dpr);
    this.w = w; this.h = h;
    this.kick();
  }
  set(look) { const L = this.rig.set(look); this.back.color.set(D.part('gl', L.gl).hex); this.kick(); return L; }
  rotate(d) { this.yaw += d; this.kick(); }
  kick() { if (!this.raf && this.alive) this.raf = requestAnimationFrame(t => this.frame(t)); }
  frame(t) {
    this.raf = 0;
    if (!this.alive) return;
    // a slow sway while nobody is dragging, unless the player asked for reduced motion
    const sway = !this.reduce && !this.dragging && t - this.idle > 2500;
    const yaw = this.yaw + (sway ? Math.sin((t - this.idle) / 2600) * 0.25 : 0);
    turn(this.rig.group, yaw);
    const dist = this.w / this.h < 0.8 ? 14 : 11.4;
    this.cam.position.set(0, 6.9 + Math.sin(this.pitch) * dist, 0.15 + Math.cos(this.pitch) * dist);
    this.cam.lookAt(0, 6.78, 0.15);
    this.r.setRenderTarget(null);
    this.r.render(this.scene, this.cam);
    if (sway && document.visibilityState === 'visible') this.kick();
  }
  setReduce(v) { this.reduce = v; this.kick(); }
  dispose() {
    this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect();
    const el = this.r.domElement;
    el.removeEventListener('pointerdown', this.onDown); el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp); el.removeEventListener('pointercancel', this.onUp);
    el.remove();
  }
}

window.Avatar3D = { ready, thumb, Viewer, Rig };
export { ready, thumb };
