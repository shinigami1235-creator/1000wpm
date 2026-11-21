// 3D avatars: a smooth, textured head built from the MakeHuman base mesh, with slider morphs
// applied on the CPU, a face texture painted per look in a canvas (skin tone, facial hair and
// makeup), and hair, clothes and accessories bound to the head surface so they follow every
// slider. The base file loads after first paint; each hairstyle, outfit and accessory is its
// own small file, loaded the first time someone wears it. One shared WebGL renderer draws
// the creator view and renders thumbnails offscreen.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const D = window.AvatarData;
const ROOT = new URL('../../assets/avatar/', import.meta.url).href;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// hairstyles live in avatar-hair.js (cards, scalp layer, hair shader)
if (!window.AvatarHair) await import('./avatar-hair.js');
const H = window.AvatarHair.create({ THREE, loader, root: ROOT, prep });
// outfits (fit-*) and jewellery (acc-*) live in avatar-cloth.js (MakeHuman garments, fabric shader)
if (!window.AvatarCloth) await import('./avatar-cloth.js');
const CL = window.AvatarCloth.create({ THREE, loader, root: ROOT, prep });
const isCloth = pid => pid.startsWith('fit-') || pid.startsWith('acc-');
// sculpt points (look.sc): pushed and pulled areas on top of the slider morphs, in avatar-sculpt.js
const SC = (await import('./avatar-sculpt.js')).default;
// brows placed by rule on the current head, built here rather than in the glb (avatar-brows.js)
const BR = (await import('./avatar-brows.js')).default;

// ---------- reading the files ----------
function vec3Array(attr, off, sc) {
  const n = attr.count, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = off[0] + attr.getX(i) * sc; out[i * 3 + 1] = off[1] + attr.getY(i) * sc; out[i * 3 + 2] = off[2] + attr.getZ(i) * sc;
  }
  return out;
}
// canonical vertex per position, so normals stay smooth across UV seams
function weldMap(pos) {
  const map = new Map(), canon = new Uint32Array(pos.length / 3);
  for (let i = 0; i < canon.length; i++) {
    const k = `${Math.round(pos[i * 3] * 2e3)},${Math.round(pos[i * 3 + 1] * 2e3)},${Math.round(pos[i * 3 + 2] * 2e3)}`;
    if (!map.has(k)) map.set(k, i);
    canon[i] = map.get(k);
  }
  return canon;
}
function readProps(root) {
  const out = new Map();
  let node = null;
  root.traverse(o => { if (o.userData && o.userData.parts && !node) node = o; });
  if (!node) return out;
  const tri = node.isMesh ? node : node.children.find(m => m.isMesh && !m.isLineSegments);
  const lin = node.isMesh ? null : node.children.find(m => m.isLineSegments);
  // parts come from the node's extras; quantisation and morph names from the mesh's
  const g = tri.geometry, ud = node.userData, mx = tri.userData;
  const [qo, qs] = mx.q;
  const P = vec3Array(g.attributes.position, qo, qs);
  const B = g.attributes._bind.array, W = g.attributes._bindw.array, C = g.attributes.color.array, UV = g.attributes.uv.array, ST = g.attributes._strand;
  const T = g.index.array, Ls = lin ? lin.geometry.index.array : null;
  const morphs = {};
  (mx.targetNames || []).forEach((name, k) => {
    const raw = g.morphAttributes.position[k].array, sc = mx.morphScale[k] / 32767, f = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) f[i] = raw[i] * sc;
    morphs[name] = f;
  });
  const rebase = (arr, v0) => { const o = new Uint16Array(arr.length); for (let i = 0; i < arr.length; i++) o[i] = arr[i] - v0; return o; };
  for (const [pid, mat, v0, vn, t0, tn, l0, ln] of ud.parts) {
    const strand = new Float32Array(vn * 3);
    for (let i = 0; i < vn; i++) { strand[i * 3] = ST.getX(v0 + i); strand[i * 3 + 1] = ST.getY(v0 + i); strand[i * 3 + 2] = ST.getZ(v0 + i); }
    const pos = P.slice(v0 * 3, (v0 + vn) * 3);
    const part = {
      mat, pos, bind: B.slice(v0 * 4, (v0 + vn) * 4), bindw: W.slice(v0 * 4, (v0 + vn) * 4), col: C.slice(v0 * 4, (v0 + vn) * 4),
      uv: UV.slice(v0 * 2, (v0 + vn) * 2), strand, canon: weldMap(pos),
      index: tn ? rebase(T.subarray(t0, t0 + tn), v0) : null, lines: ln && Ls ? rebase(Ls.subarray(l0, l0 + ln), v0) : null, morph: {},
    };
    for (const [k, f] of Object.entries(morphs)) part.morph[k] = f.slice(v0 * 3, (v0 + vn) * 3);
    if (!out.has(pid)) out.set(pid, []);
    out.get(pid).push(part);
  }
  return out;
}

const texLoader = new THREE.TextureLoader();
const img = name => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = ROOT + 'tex/' + name; });
function tex(name, { srgb = true, repeat = false } = {}) {
  const t = texLoader.load(ROOT + 'tex/' + name);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

async function loadAssets() {
  const gltf = await loader.loadAsync(ROOT + 'avatar.glb');
  const A = { headPrims: {}, base: null, morphs: new Map(), meta: gltf.scene.userData || {}, items: new Map(), props: new Map() };
  let head = null;
  gltf.scene.traverse(o => { if (o.name === 'head') head = o; });
  const kids = head.isMesh ? [head] : head.children;
  for (const m of kids) {
    const scale = m.userData.morphScale;
    const g = m.geometry;
    if (!A.base) {
      A.base = new Float32Array(g.attributes.position.array);
      A.uv = new Float32Array(g.attributes.uv.array);
      A.col = new Uint8Array(g.attributes.color.array);
      const w = g.attributes._weld.array; A.weld = new Uint32Array(A.base.length / 3);
      for (let i = 0; i < A.weld.length; i++) A.weld[i] = w[i * 2];
      const dict = m.morphTargetDictionary || {}, list = g.morphAttributes.position || [];
      for (const [key, k] of Object.entries(dict)) {
        const arr = list[k].array, sc = scale[k] / 32767, idx = [], d = [];
        for (let i = 0; i < arr.length; i += 3) if (arr[i] || arr[i + 1] || arr[i + 2]) { idx.push(i / 3); d.push(arr[i] * sc, arr[i + 1] * sc, arr[i + 2] * sc); }
        A.morphs.set(key, { idx: Uint32Array.from(idx), d: Float32Array.from(d) });
      }
    }
    A.headPrims[m.material.name] = g.index.array.slice();
  }
  for (const [pid, parts] of readProps(gltf.scene)) A.props.set(pid, parts);
  if (A.meta.brow) for (const [pid, parts] of BR.parts(A.meta.brow)) A.props.set(pid, parts);
  window.AvatarFace.init(THREE, ROOT, A.meta.face);
  gltf.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  A.tex = {
    // ao: the skin ORM map (R ambient occlusion, G roughness), from avatar-face.js's list
    ao: tex('skin_orm.webp', { srgb: false }), sparse: tex('hair-sparse.webp', { repeat: true }),
    knit: tex('knit.webp', { repeat: true }), weave: tex('weave.webp', { repeat: true }), leather: tex('leather.webp', { repeat: true }),
  };
  await window.AvatarMakeup.load(ROOT);
  return A;
}

// one item file (a hairstyle, outfit or accessory), loaded once
function loadItem(pid) {
  if (pid.startsWith('hair-')) return H.load(pid);
  if (isCloth(pid)) return CL.load(pid);
  if (assets.items.has(pid)) return assets.items.get(pid);
  const p = loader.loadAsync(`${ROOT}items/${pid}.glb`).then(g => {
    const m = readProps(g.scene);
    g.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const [k, v] of m) assets.props.set(k, v);
    return true;
  }).catch(e => { console.warn('avatar item', pid, e); return false; });
  assets.items.set(pid, p);
  return p;
}

// ---------- which files a look needs ----------
const TIERED = ['visor', 'goggles', 'headset', 'cap', 'bandana'];
function wanted(L, bare) {
  const out = ['brow-' + L.bs, L.f.sex > 25 || L.lash === 'long' ? 'lash-long' : 'lash'];
  if (bare) return out;
  out.push('hair-' + L.h, 'fit-' + L.o);
  // facial hair is painted on the face (avatar-face.js), with no strand cards: the jaw fringe
  // cards (items/fh-beard.glb) read as dots at the jaw line, so the painted edge does that work
  const tier = H.tier(L.h);
  for (const g of L.g) {
    if (TIERED.includes(g)) out.push(`gear-${g}${tier}`);
    else if (JEWEL.includes(g)) out.push('acc-' + g);
    else out.push('gear-' + g);
  }
  return out;
}
// jewellery and glasses: MakeHuman pieces drawn by avatar-cloth.js
const JEWEL = ['glasses', 'roundglasses', 'earrings', 'studs', 'chain', 'pendant', 'choker'];
function ensure(L, bare) {
  const need = wanted(L, bare).filter(p => !(p.startsWith('hair-') ? H.has(p) : isCloth(p) ? CL.has(p) : assets.props.has(p)));
  const face = window.AvatarFace.need(L);
  return need.length || face ? Promise.all([...need.map(loadItem), face]) : null;
}

// ---------- materials ----------
const U = {
  uRim: { value: new THREE.Color('#39ff88') }, uRimStr: { value: 0.1 }, uExposure: { value: 1.0 },
  uKeyDir: { value: new THREE.Vector3(0, 0, 1) }, uKeyCol: { value: new THREE.Color('#fff1e0') },
};
// ACES filmic curve (the fit three.js uses), applied in our own shaders so thumbnails
// rendered offscreen get the same tone mapping as the live view
const ACES = `
vec3 avRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 avAces(vec3 c) {
  const mat3 IM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= 1.0 / 0.6; c = OM * avRRT(IM * c); return clamp(c, 0.0, 1.0);
}`;
// bottom of the bust (y 4.62) and its sides (x 1.72) go to nothing, a soft fade up to the chest
const FADE = `
float avFade(vec3 p) {
  float b = smoothstep(4.64, 5.15, p.y - 0.16 * smoothstep(0.5, 1.7, abs(p.x)));
  float s = 1.0 - smoothstep(1.46, 1.71, abs(p.x));
  return b * s;
}`;
function prep(mat, { rim = 1, hair = false, tone = true, hook = null, name = '' } = {}) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    if (hook) hook(sh);   // avatar-face.js: skin and eye shading
    let v = sh.vertexShader, f = sh.fragmentShader;
    f = f.replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimStr; uniform float uExposure; uniform vec3 uKeyDir; uniform vec3 uKeyCol;' + ACES + (hair ? '\nvarying vec3 vStrand;' : ''));
    if (rim) f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
      totalEmissiveRadiance += uRim * pow(rimF, 3.0) * uRimStr * ${rim.toFixed(2)};`);
    if (hair) {
      v = v.replace('#include <common>', '#include <common>\nattribute vec4 _strand;\nvarying vec3 vStrand;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStrand = normalize(mat3(modelViewMatrix) * _strand.xyz + vec3(1e-5));');
      // two-lobe Kajiya-Kay highlight along the strands, shifted by the strand texture
      f = f.replace('#include <opaque_fragment>', `{
        vec3 T = normalize(vStrand - normal * dot(vStrand, normal));
        vec3 Vd = normalize(vViewPosition); vec3 H = normalize(uKeyDir + Vd);
        float sh = (texture2D(map, vMapUv).r - 0.55) * 0.5;
        vec3 T1 = normalize(T + normal * (sh + 0.12)); float d1 = dot(T1, H);
        vec3 T2 = normalize(T + normal * (sh - 0.18)); float d2 = dot(T2, H);
        float s1 = pow(sqrt(max(0.0, 1.0 - d1 * d1)), 90.0); float s2 = pow(sqrt(max(0.0, 1.0 - d2 * d2)), 24.0);
        float lit = clamp(dot(normal, uKeyDir) * 0.6 + 0.4, 0.0, 1.0);
        vec3 tint = mix(diffuseColor.rgb, vec3(1.0), 0.25);
        outgoingLight += (tint * 0.16 * s1 + diffuseColor.rgb * 0.22 * s2) * lit * uKeyCol;
      }
      #include <opaque_fragment>`);
    }
    if (tone) f = f.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = avAces(gl_FragColor.rgb * uExposure);');
    // the bust fades into the background at the bottom and the sides, like a portrait
    v = v.replace('#include <common>', '#include <common>\nvarying vec3 vAvObj;').replace('#include <project_vertex>', 'vAvObj = transformed;\n#include <project_vertex>');
    f = f.replace('#include <common>', '#include <common>\nvarying vec3 vAvObj;' + FADE)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        ${mat.blending === THREE.AdditiveBlending ? 'gl_FragColor.rgb' : mat.transparent ? 'gl_FragColor.a' : 'gl_FragColor'} *= avFade(vAvObj);`);
    sh.vertexShader = v; sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `av-${rim}-${hair}-${tone}-${name}`;
  return mat;
}
let ENV = null;
function makeMats(r) {
  if (!ENV) { const pm = new THREE.PMREMGenerator(r); ENV = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  const T = assets.tex;
  // the room reflection only goes on eyes, lips, metal and lenses, where it shows; elsewhere
  // the lights do the work, which keeps thumbnails cheap
  const std = (o, p) => prep(new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, ...o }), p);
  const shiny = (o, p) => std({ envMap: ENV, ...o }, p);
  const hairMat = map => std({ map, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.55, vertexColors: true, envMapIntensity: 0.2 }, { hair: true, rim: 0.6 });
  const M = {
    // skin, lips (skin too; gloss comes from the makeup's roughness map), eyes, corneas, brows
    // and lashes: avatar-face.js
    ...window.AvatarFace.materials(prep, ENV),
    // the caps over the bust cut sit where the fade reaches nothing: they show the background
    // and hide the inside of the bust and the clothes
    cut: prep(new THREE.MeshBasicMaterial({ color: '#0a0f0c' }), { rim: 0, name: 'cut' }),
    beard: hairMat(T.sparse),
    knit: std({ map: T.knit, roughness: 0.9, vertexColors: true, envMapIntensity: 0.15 }, { rim: 0.7 }),
    weave: std({ map: T.weave, roughness: 0.85, vertexColors: true, envMapIntensity: 0.15 }, { rim: 0.7 }),
    leather: shiny({ map: T.leather, roughness: 0.36, vertexColors: true, envMapIntensity: 0.7 }, { rim: 0.7 }),
    under: std({ map: T.knit, color: '#17191b', roughness: 0.9, vertexColors: true, envMapIntensity: 0.1 }, { rim: 1 }),
    // cyber gear: satin anodised shells, soft pads and brushed metal, with a light rim of glow
    gear: shiny({ color: '#262c30', roughness: 0.36, metalness: 0.55, vertexColors: true, side: THREE.DoubleSide, envMapIntensity: 0.7 }, { rim: 0.5, name: 'gear' }),
    pad: std({ color: '#1c2124', roughness: 0.9, vertexColors: true }, { rim: 0.35, name: 'pad' }),
    metal: shiny({ color: '#8a939a', roughness: 0.3, metalness: 0.9, vertexColors: true, side: THREE.DoubleSide, envMapIntensity: 0.9 }, { rim: 0.4, name: 'metal' }),
    silver: shiny({ color: '#c9ced3', roughness: 0.22, metalness: 1, vertexColors: true, envMapIntensity: 1.2 }, { rim: 0.5 }),
    gold: shiny({ color: '#e1b04a', roughness: 0.24, metalness: 1, vertexColors: true, envMapIntensity: 1.2 }, { rim: 0.5 }),
    cloth2: std({ map: T.knit, color: '#2a3330', roughness: 0.85, vertexColors: true, side: THREE.DoubleSide }, { rim: 1 }),
    band: std({ map: T.weave, color: '#7a1f2b', roughness: 0.8, vertexColors: true, side: THREE.DoubleSide }, { rim: 1 }),
    glow: prep(new THREE.MeshBasicMaterial({ color: '#39ff88', side: THREE.DoubleSide }), { rim: 0, tone: false, name: 'glow' }),
    lens: shiny({ color: '#39ff88', transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }, { rim: 0 }),
    'lens-clear': shiny({ color: '#cfe8f0', transparent: true, opacity: 0.12, roughness: 0.04, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }, { rim: 0 }),
  };
  M.line = new LineMaterial({ color: 0x39ff88, linewidth: 1.5, transparent: true, opacity: 0.9, depthWrite: false });
  return M;
}

// ---------- face texture: skin, facial hair (avatar-face.js) and makeup painted in a canvas ----------
const faceCache = new Map();
function faceTexture(L, size) {
  const key = [size, window.AvatarFace.key(L), window.AvatarMakeup.key(L)].join('|');
  if (faceCache.has(key)) { const t = faceCache.get(key); faceCache.delete(key); faceCache.set(key, t); return t; }
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  window.AvatarFace.paintSkin(x, L, size);
  window.AvatarMakeup.paint(x, size, L);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  faceCache.set(key, t);
  while (faceCache.size > 8) { const [k0, t0] = faceCache.entries().next().value; faceCache.delete(k0); t0.dispose(); }
  return t;
}
// lip gloss: a roughness map from the makeup painter, null when there is no gloss
const glossTex = new Map();
function glossTexture(L, size) {
  const c = window.AvatarMakeup.gloss(L, size >> 1);
  if (!c) return null;
  if (!glossTex.has(c)) {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
    glossTex.set(c, t);
    while (glossTex.size > 6) { const [k0, t0] = glossTex.entries().next().value; glossTex.delete(k0); t0.dispose(); }
  }
  return glossTex.get(c);
}
// ---------- normals ----------
let ACC = new Float32Array(0);
function computeNormals(pos, index, canon, nrm) {
  let maxC = 0; for (let i = 0; i < canon.length; i++) if (canon[i] > maxC) maxC = canon[i];
  if (ACC.length < (maxC + 1) * 3) ACC = new Float32Array((maxC + 1) * 3);
  const acc = ACC; acc.fill(0, 0, (maxC + 1) * 3);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [index[i], index[i + 1], index[i + 2]]) { const w = canon[v] * 3; acc[w] += nx; acc[w + 1] += ny; acc[w + 2] += nz; }
  }
  for (let i = 0; i < canon.length; i++) {
    const w = canon[i] * 3, x = acc[w], y = acc[w + 1], z = acc[w + 2], l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
}

// sliders that change the brows but not the head (avatar-brows.js)
const BROW_MORPHS = ['browT', 'browA', 'browSp', 'browIn', 'browTl', 'browAp', 'browAh', 'browLn', 'browTi', 'browTo'];
// ---------- proportions: the landmarks tools/avatar/morphs.py landmarks() picked ----------
// How much of a slider's morph goes on: |v|, except that the masculine end already tapers the
// jaw, so V-shape goes on at up to 35% less there and the two together never make a pointed chin
const slideW = (s, v, L) => Math.abs(v) * (s.id === 'vline' ? 1 - 0.35 * Math.max(0, -(L.f.sex || 0)) / 100 : 1);
function morphAt(A, key, i, ax) {
  const m = A.morphs.get(key); if (!m) return 0;
  let lo = 0, hi = m.idx.length - 1;
  while (lo <= hi) { const k = (lo + hi) >> 1, x = m.idx[k]; if (x === i) return m.d[k * 3 + ax]; if (x < i) lo = k + 1; else hi = k - 1; }
  return 0;
}
// one coordinate of skin vertex i for look L, worked out from the morphs without applying the look
function markAt(A, L, i, ax) {
  let p = A.base[i * 3 + ax] + morphAt(A, 'base+', i, ax);
  for (const s of D.SLIDERS) { const v = D.fv(L.f, s.id) / 100; if (v) p += slideW(s, v, L) * morphAt(A, s.id + (v < 0 ? '-' : '+'), i, ax); }
  return p;
}
const THIRD_MARKS = ['hair', 'brow', 'sub', 'ment'];

// ---------- the rig: one avatar built from the shared assets ----------
export class Rig {
  constructor(A, renderer, { faceSize = 1024 } = {}) {
    this.A = A; this.faceSize = faceSize;
    this.group = new THREE.Group();
    this.M = makeMats(renderer);
    const n = A.base.length / 3;
    this.pos = new Float32Array(A.base); this.delta = new Float32Array(n * 3); this.nrm = new Float32Array(n * 3);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmAttr = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    const uvAttr = new THREE.BufferAttribute(A.uv, 2), colAttr = new THREE.BufferAttribute(A.col, 4, true);
    // the whole head (skin, lips, cut caps, eyes, corneas) shares one index for normals
    const all = []; for (const ix of Object.values(A.headPrims)) all.push(...ix);
    this.allIndex = Uint32Array.from(all);
    this.eyes = (A.meta.eyes || []);
    for (const [name, index] of Object.entries(A.headPrims)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', this.posAttr); g.setAttribute('normal', this.nrmAttr); g.setAttribute('uv', uvAttr); g.setAttribute('color', colAttr);
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6.6, 0.2), 4);
      const m = new THREE.Mesh(g, this.M[name] || this.M.skin);
      if (name === 'cornea') m.renderOrder = 2;
      this.group.add(m);
    }
    this.props = new Map(); this.look = null;
    this.hair = H.attach(this);
    this.cloth = CL.attach(this, { env: ENV });
  }

  lines(index, pos, mat) {
    const g = new LineSegmentsGeometry(); g.setPositions(new Float32Array(index.length * 3));
    const obj = new LineSegments2(g, mat); obj.frustumCulled = false;
    const rec = { obj, index, buf: g.attributes.instanceStart.data, pos };
    this.fillLines(rec); return rec;
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
      const pos = new Float32Array(p.pos), nrm = new Float32Array(p.pos.length);
      const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
      const nattr = new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage);
      const sub = new THREE.Group(); let mesh = null;
      if (p.index) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', attr); g.setAttribute('normal', nattr); g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
        g.setAttribute('color', new THREE.BufferAttribute(p.col, 4, true)); g.setAttribute('_strand', new THREE.BufferAttribute(p.strand, 3));
        g.setIndex(new THREE.BufferAttribute(p.index, 1));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6.6, 0.2), 5);
        mesh = new THREE.Mesh(g, this.M[p.mat] || this.M.gear);
        if (p.mat.startsWith('lens')) mesh.renderOrder = 3;
        sub.add(mesh);
      }
      const rec = { p, pos, nrm, attr, nattr, mesh, sub, lines: null, k, base: new Float32Array(p.pos) };
      if (p.lines) { rec.lines = this.lines(p.lines, pos, this.M.line); sub.add(rec.lines.obj); }
      grp.add(sub);
      return rec;
    });
    const out = { grp, recs, stamp: -1, brow: pid.startsWith('brow-') };
    this.group.add(grp); this.props.set(pid, out);
    return out;
  }
  updateProp(pr, L) {
    const dl = this.delta;
    for (const r of pr.recs) {
      const { bind, bindw } = r.p, base = r.base, out = r.pos;
      if (pr.brow) {
        BR.update(this, r, L);
        computeNormals(out, r.p.index, r.p.canon, r.nrm); r.nattr.needsUpdate = true; r.attr.needsUpdate = true;
        continue;
      }
      base.set(r.p.pos);
      for (let i = 0, n = base.length / 3; i < n; i++) {
        const b0 = bind[i * 4] * 3, b1 = bind[i * 4 + 1] * 3, b2 = bind[i * 4 + 2] * 3;
        const w0 = bindw[i * 4] / 255, w1 = bindw[i * 4 + 1] / 255, w2 = bindw[i * 4 + 2] / 255;
        out[i * 3] = base[i * 3] + w0 * dl[b0] + w1 * dl[b1] + w2 * dl[b2];
        out[i * 3 + 1] = base[i * 3 + 1] + w0 * dl[b0 + 1] + w1 * dl[b1 + 1] + w2 * dl[b2 + 1];
        out[i * 3 + 2] = base[i * 3 + 2] + w0 * dl[b0 + 2] + w1 * dl[b1 + 2] + w2 * dl[b2 + 2];
      }
      if (r.p.index) { computeNormals(out, r.p.index, r.p.canon, r.nrm); r.nattr.needsUpdate = true; }
      r.attr.needsUpdate = true;
      if (r.lines) this.fillLines(r.lines);
    }
    pr.stamp = this.shapeStamp;
  }

  // Applies a look. Items not loaded yet are skipped; call ensure() first to wait for them.
  set(look, { bare = false } = {}) {
    const L = D.normalize(look);
    const shapeKey = JSON.stringify(L.f) + SC.key(L.sc);
    if (shapeKey !== this.shapeKey) {
      this.shapeKey = shapeKey; this.shapeStamp = (this.shapeStamp || 0) + 1;
      const pos = this.pos, base = this.A.base, dl = this.delta;
      pos.set(base);
      // 'base+' is always on: the shape every face starts from (tools/avatar/morphs.py BASE)
      const b0 = this.A.morphs.get('base+');
      if (b0) for (let i = 0; i < b0.idx.length; i++) { const k = b0.idx[i] * 3; pos[k] += b0.d[i * 3]; pos[k + 1] += b0.d[i * 3 + 1]; pos[k + 2] += b0.d[i * 3 + 2]; }
      for (const s of D.SLIDERS) {
        const v = D.fv(L.f, s.id) / 100; if (!v) continue;
        const m = this.A.morphs.get(s.id + (v < 0 ? '-' : '+')); if (!m) continue;
        const w = slideW(s, v, L), idx = m.idx, d = m.d;
        for (let i = 0; i < idx.length; i++) { const k = idx[i] * 3; pos[k] += w * d[i * 3]; pos[k + 1] += w * d[i * 3 + 1]; pos[k + 2] += w * d[i * 3 + 2]; }
      }
      SC.apply(this, L.sc);
      for (let i = 0; i < pos.length; i++) dl[i] = pos[i] - base[i];
      computeNormals(pos, this.allIndex, this.A.weld, this.nrm);
      this.posAttr.needsUpdate = true; this.nrmAttr.needsUpdate = true;
    }
    const want = new Set(wanted(L, bare));
    const capOn = !bare && L.g.includes('cap');
    for (const [pid, pr] of this.props) pr.grp.visible = want.has(pid);
    for (const pid of want) {
      if (!this.A.props.has(pid)) continue;
      const pr = this.prop(pid);
      pr.grp.visible = true;
      const bk = BROW_MORPHS.map(id => L.f[id] || 0).join('|');
      if (pr.stamp !== this.shapeStamp || pr.browKey !== bk) { this.updateProp(pr, L); pr.browKey = bk; }
    }
    // colours and textures
    const M = this.M, glow = D.part('gl', L.gl).hex, hair = D.HAIR_COLORS[L.hc].hex;
    const ft = faceTexture(L, this.faceSize);
    for (const k of ['skin', 'lips']) if (M[k].map !== ft) { M[k].map = ft; M[k].needsUpdate = true; }
    const gloss = glossTexture(L, this.faceSize);
    for (const k of ['skin', 'lips']) if (M[k].roughnessMap !== gloss) { M[k].roughnessMap = gloss; M[k].needsUpdate = true; }
    window.AvatarFace.apply(M, L);   // eye texture, brow and lash colour
    M.beard.color.set(hair);
    this.hair.set(L, { bare, hat: capOn ? 'cap' : !bare && L.g.includes('bandana') ? 'bandana' : null });
    this.cloth.set(L, [...want].filter(isCloth));
    const oc = D.OUTFIT_COLORS[L.oc].hex;
    for (const k of ['knit', 'weave', 'leather']) M[k].color.set(oc);
    M.glow.color.set(glow); M.lens.color.set(glow); M.line.color.set(glow);
    U.uRim.value.set(glow);
    this.look = L;
    return L;
  }
  setLineScale(px, w, h) { this.M.line.linewidth = px; this.M.line.resolution.set(w, h); }

  // Forehead height, midface length and lower face length that make the three thirds (hairline
  // to brows, brows to nose base, nose base to chin) equal on this face, keeping its overall
  // height. Each slider moves only its own band, so a few Newton steps per third settle it.
  // Returns { foreH, midH, lowH }, or null when the file has no landmarks.
  balanceThirds(look) {
    const A = this.A, mk = A.meta.marks; if (!mk) return null;
    const L = D.normalize(look), f = { ...L.f };
    const thirds = ff => { const y = THIRD_MARKS.map(k => markAt(A, { ...L, f: ff }, mk[k], 1)); return [y[0] - y[1], y[1] - y[2], y[2] - y[3]]; };
    const t0 = thirds(f), T = (t0[0] + t0[1] + t0[2]) / 3;
    for (let it = 0; it < 4; it++) D.THIRDS.forEach((id, k) => {
      const t = thirds(f)[k], need = T - t, v = f[id] || 0, step = need > 0 ? 4 : -4;
      const slope = (thirds({ ...f, [id]: v + step })[k] - t) / step;
      if (Math.abs(slope) > 1e-7) f[id] = Math.max(-100, Math.min(100, Math.round(v + need / slope)));
    });
    return Object.fromEntries(D.THIRDS.map(id => [id, f[id] || 0]));
  }
  // the guide lines on the current shape, as segment end points: across the face at the
  // hairline, brows, nose base and chin (the thirds), and down it at each side of the face and
  // each eye corner (the fifths). Each line sits at its landmark's own depth.
  guideSegments() {
    const mk = this.A.meta.marks, P = this.pos, out = [];
    const at = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const fifths = [...mk.l, ...mk.r].map(at), X = Math.max(...fifths.map(p => Math.abs(p[0]))) + 0.14;
    const [hair, , , ment] = THIRD_MARKS.map(k => at(mk[k]));
    for (const k of THIRD_MARKS) { const [, y, z] = at(mk[k]); out.push(-X, y, z, X, y, z); }
    for (const [x, , z] of fifths) out.push(x, hair[1] + 0.1, z, x, ment[1] - 0.1, z);
    return out;
  }
}

// turn the avatar about the middle of the head rather than the origin
export function turn(group, yaw) {
  const c = 0.25;
  group.rotation.y = yaw;
  group.position.set(-Math.sin(yaw) * c, 0, c - Math.cos(yaw) * c);
}

// ---------- scene: a soft warm key, a cool fill, a warm bounce from below and two rims in
// the glow colour; skin and eyes also see the room environment (avatar-face.js) ----------
const KEY_DIR = new THREE.Vector3(-0.9, 0.65, 1.6).normalize();
function makeScene(rig) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e8ecf2', '#6a5040', 0.6));
  const key = new THREE.DirectionalLight('#fff0e0', 1.85); key.position.copy(KEY_DIR); scene.add(key);
  const fill = new THREE.DirectionalLight('#e0e6ff', 0.8); fill.position.set(1.4, 0.3, 1.0); scene.add(fill);
  const bounce = new THREE.DirectionalLight('#ffd9bf', 0.35); bounce.position.set(0, -1, 0.8); scene.add(bounce);
  const rimL = new THREE.DirectionalLight('#39ff88', 0.45); rimL.position.set(-1.0, 0.6, -1.0); scene.add(rimL);
  const rimR = new THREE.DirectionalLight('#39ff88', 0.4); rimR.position.set(1.0, 0.4, -1.0); scene.add(rimR);
  scene.add(rig.group);
  return { scene, rims: [rimL, rimR] };
}
const _m = new THREE.Matrix4();
function beforeRender(cam, group) {
  // the hair highlight uses the key light's direction in view space
  cam.updateMatrixWorld();
  U.uKeyDir.value.copy(KEY_DIR).transformDirection(_m.copy(cam.matrixWorldInverse));
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
let scratch = null;
async function thumb(look, size = 96, { yaw = 0.32, bare = false, frame = 'bust', show = size } = {}) {
  if (!assets) await ready;
  const r = getRenderer();
  if (!thumbRig) {
    thumbRig = new Rig(assets, r, { faceSize: 512 });
    thumbScene = makeScene(thumbRig);
    thumbCam = new THREE.PerspectiveCamera(22, 1, 1, 60);
  }
  const L0 = D.normalize(look);
  const wait = ensure(L0, bare); if (wait) await wait;
  turn(thumbRig.group, yaw);
  const L = thumbRig.set(look, { bare });
  const glow = D.part('gl', L.gl).hex;
  thumbScene.rims.forEach(l => l.color.set(glow));
  const px = Math.round(size);
  // supersample and filter down; that is the antialiasing, so the target skips MSAA
  const ss = px <= 40 ? 3 : 2;
  const rpx = Math.min(640, px * ss);
  let rt = targets.get(rpx);
  if (!rt) { rt = new THREE.WebGLRenderTarget(rpx, rpx, { samples: 0, colorSpace: THREE.SRGBColorSpace }); targets.set(rpx, rt); }
  const small = show <= 64;
  thumbRig.setLineScale(small ? 2.4 * rpx / px : 1.6 * rpx / Math.max(px, 160), rpx, rpx);
  U.uRimStr.value = small ? 0.22 : 0.1;
  const tall = L.g.includes('cap') ? 0 : H.tall(L.h);
  if (frame === 'eyes') { thumbCam.position.set(0, 7.4, 4.6); thumbCam.lookAt(0, 7.33, 0.3); }
  else if (frame === 'mouth') { thumbCam.position.set(0, 6.8, 4.6); thumbCam.lookAt(0, 6.7, 0.3); }
  else if (frame === 'face') { thumbCam.position.set(0, 7.35, 7.4); thumbCam.lookAt(0, 7.2, 0.3); }
  else if (small) { thumbCam.position.set(0, 7.6 + tall * 0.4, 9.4 + tall * 1.2); thumbCam.lookAt(0, 7.2 + tall * 0.45, 0.2); }
  // head and shoulders: the face fills about 45% of the height, the shoulders run off the bottom
  else { thumbCam.position.set(0, 7.1 + tall * 0.5, 10.6 + tall * 1.6); thumbCam.lookAt(0, 6.8 + tall * 0.55, 0.15); }
  thumbCam.updateProjectionMatrix();
  beforeRender(thumbCam);
  const prevTarget = r.getRenderTarget();
  r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear();
  r.render(thumbScene.scene, thumbCam);
  const buf = new Uint8Array(rpx * rpx * 4);
  r.readRenderTargetPixels(rt, 0, 0, rpx, rpx, buf);
  r.setRenderTarget(prevTarget);
  U.uRimStr.value = 0.1;
  // flip and un-premultiply into a canvas, then filter down in halving steps
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = scratch.height = rpx;
  const c = scratch.getContext('2d');
  const im = c.createImageData(rpx, rpx);
  for (let y = 0; y < rpx; y++) {
    const src = (rpx - 1 - y) * rpx * 4, dst = y * rpx * 4;
    for (let x = 0; x < rpx * 4; x += 4) {
      const a = buf[src + x + 3], k = a ? 255 / a : 0;
      im.data[dst + x] = Math.min(255, buf[src + x] * k); im.data[dst + x + 1] = Math.min(255, buf[src + x + 1] * k);
      im.data[dst + x + 2] = Math.min(255, buf[src + x + 2] * k); im.data[dst + x + 3] = a;
    }
  }
  c.putImageData(im, 0, 0);
  let src = scratch, s = rpx;
  while (s / 2 >= px) {
    const h = document.createElement('canvas'); h.width = h.height = s / 2;
    const hx = h.getContext('2d'); hx.imageSmoothingQuality = 'high'; hx.drawImage(src, 0, 0, s / 2, s / 2);
    src = h; s /= 2;
  }
  const out = document.createElement('canvas'); out.width = out.height = px;
  const o = out.getContext('2d');
  const gc = new THREE.Color(glow);
  const bg = o.createRadialGradient(px * 0.5, px * 0.4, px * 0.05, px * 0.5, px * 0.5, px * 0.78);
  bg.addColorStop(0, `rgb(${Math.round(gc.r * 255 * 0.16 + 10)},${Math.round(gc.g * 255 * 0.16 + 14)},${Math.round(gc.b * 255 * 0.16 + 12)})`);
  bg.addColorStop(1, '#040806');
  o.fillStyle = bg; o.fillRect(0, 0, px, px);
  o.imageSmoothingQuality = 'high'; o.drawImage(src, 0, 0, px, px);
  return out.toDataURL('image/png');
}

// ---------- the live view used by the creator ----------
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export class Viewer {
  constructor(host, { reduceMotion = false } = {}) {
    this.host = host;
    this.r = getRenderer();
    this.rig = new Rig(assets, this.r, { faceSize: 1024 });
    const s = makeScene(this.rig); this.scene = s.scene; this.rims = s.rims;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(0, 4.56, 0.1); this.scene.add(sh);
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
    this.raf = 0; this.alive = true; this.seq = 0;
    this.kick();
  }
  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const dpr = Math.min(3, devicePixelRatio || 1);
    this.r.setPixelRatio(dpr); this.r.setSize(w, h, false);
    this.r.domElement.style.width = w + 'px'; this.r.domElement.style.height = h + 'px';
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.rig.setLineScale(1.6 * dpr, w * dpr, h * dpr);
    this.w = w; this.h = h;
    this.kick();
  }
  // shows the look now with what is loaded, then again once its items arrive
  set(look) {
    const seq = ++this.seq;
    const L = this.rig.set(look);
    this.rims.forEach(l => l.color.set(D.part('gl', L.gl).hex));
    this.host.style.setProperty('--av-glow', D.part('gl', L.gl).hex);
    const wait = ensure(L, false);
    if (wait) wait.then(() => { if (this.alive && seq === this.seq) { this.rig.set(look); this.kick(); } });
    if (this.guides && this.guides.visible) this.fillGuides();
    this.kick();
    return L;
  }
  // thin lines over the face for the thirds and fifths (Rig.guideSegments), in the glow colour
  setGuides(on) {
    on = !!on && !!this.rig.A.meta.marks;
    if (on && !this.guides) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60), 3));
      const m = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
      this.guides = new THREE.LineSegments(g, m); this.guides.frustumCulled = false; this.guides.renderOrder = 10;
      this.rig.group.add(this.guides);
    }
    if (this.guides) { this.guides.visible = on; if (on) this.fillGuides(); }
    this.kick();
  }
  fillGuides() {
    const a = this.guides.geometry.attributes.position; a.array.set(this.rig.guideSegments()); a.needsUpdate = true;
    this.guides.material.color.set(D.part('gl', this.rig.look ? this.rig.look.gl : 'green').hex);
  }
  balanceThirds(look) { return this.rig.balanceThirds(look); }
  rotate(d) { this.yaw += d; this.kick(); }
  kick() { if (!this.raf && this.alive) this.raf = requestAnimationFrame(t => this.frame(t)); }
  frame(t) {
    this.raf = 0;
    if (!this.alive) return;
    // a slow sway while nobody is dragging, unless the player asked for reduced motion
    const sway = !this.reduce && !this.still && !this.dragging && t - this.idle > 2500;
    const yaw = this.yaw + (sway ? Math.sin((t - this.idle) / 2600) * 0.22 : 0);
    turn(this.rig.group, yaw);
    // close up (the makeup and mouth tabs) eases in from the bust view
    const fz = this.focus || 0, fzT = this.focusTo || 0;
    this.focus = this.reduce || Math.abs(fzT - fz) < 0.01 ? fzT : fz + (fzT - fz) * 0.18;
    const z = this.focus;
    const dist = (this.w / this.h < 0.8 ? 12.2 : 10.0) * (1 - 0.42 * z);
    this.cam.position.set(0, 6.95 + 0.25 * z + Math.sin(this.pitch) * dist, 0.15 + Math.cos(this.pitch) * dist);
    this.cam.lookAt(0, 6.78 + 0.28 * z, 0.15);
    beforeRender(this.cam);
    this.r.setRenderTarget(null);
    this.r.render(this.scene, this.cam);
    if (this.onFrame) this.onFrame();   // the sculpt tool's dots (avatar-sculpt.js)
    if ((sway || this.focus !== fzT) && document.visibilityState === 'visible') this.kick();
  }
  setReduce(v) { this.reduce = v; this.kick(); }
  // true frames the face, false the bust
  setFocus(on) { this.focusTo = on ? 1 : 0; this.kick(); }
  dispose() {
    this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect();
    if (this.guides) { this.guides.removeFromParent(); this.guides.geometry.dispose(); this.guides.material.dispose(); }
    const el = this.r.domElement;
    el.removeEventListener('pointerdown', this.onDown); el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp); el.removeEventListener('pointercancel', this.onUp);
    el.remove();
  }
}

window.Avatar3D = { ready, thumb, Viewer, Rig, browGuides: BR.guides };
export { ready, thumb };
