// 3D avatars: a smooth, textured head built from the MakeHuman base mesh, with slider morphs
// applied on the CPU, a face texture painted per look in a canvas (skin tone, stubble and
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
  gltf.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  A.tex = {
    skin: await img('skin.webp'), ao: tex('ao.webp', { srgb: false }), iris: await img('iris.webp'),
    brow: tex('brow.webp'), lash: tex('lash.webp'), straight: tex('hair-straight.webp', { repeat: true }), curly: tex('hair-curly.webp', { repeat: true }), sparse: tex('hair-sparse.webp', { repeat: true }),
    knit: tex('knit.webp', { repeat: true }), weave: tex('weave.webp', { repeat: true }), leather: tex('leather.webp', { repeat: true }),
  };
  A.masks = {};
  await Promise.all(['liner-thin', 'liner-winged', 'liner-heavy', 'shadow', 'blush', 'lips', 'stubble'].map(async k => { A.masks[k] = await img(`m-${k}.webp`); }));
  return A;
}

// one item file (a hairstyle, outfit or accessory), loaded once
function loadItem(pid) {
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
const TIER = { buzz: '', undercut: '', mohawk: '', hood: '', long: '-mid', braids: '-mid', ponytail: '-mid', bun: '-mid', sidepart: '-mid',
  slick: '-loose', bob: '-loose', longstraight: '-loose', longlayered: '-loose', curly: '-loose', afro: '-xl' };
const TIERED = ['visor', 'goggles', 'headset', 'cap', 'bandana'];
const TOP_PARTS = { 'hair-mohawk': [1], 'hair-undercut': [1] };    // hidden under a cap
function wanted(L, bare) {
  const out = ['brow-' + L.bs, L.f.sex > 25 || L.lash === 'long' ? 'lash-long' : 'lash'];
  if (bare) return out;
  out.push('hair-' + L.h, 'fit-' + L.o);
  if (L.fh !== 'none' && L.fh !== 'stubble') out.push('fh-' + L.fh);
  const tier = TIER[L.h] ?? '';
  for (const g of L.g) {
    if (TIERED.includes(g)) out.push(`gear-${g}${tier}`);
    else out.push('gear-' + g);
    if (g === 'glasses') out.push('gear-glasses-fit' + tier);
  }
  return out;
}
function ensure(L, bare) {
  const need = wanted(L, bare).filter(p => !assets.props.has(p));
  return need.length ? Promise.all(need.map(loadItem)) : null;
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
function prep(mat, { rim = 1, hair = false, tone = true } = {}) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
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
    sh.vertexShader = v; sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `av-${rim}-${hair}-${tone}`;
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
    skin: std({ roughness: 0.58, aoMap: T.ao, aoMapIntensity: 1.0, envMapIntensity: 0.3 }, { rim: 0.6 }),
    lips: shiny({ roughness: 0.45, aoMap: T.ao, aoMapIntensity: 1.0 }, { rim: 0.6 }),
    cut: new THREE.MeshBasicMaterial({ color: '#0a0f0c' }),
    eye: std({ roughness: 0.4, vertexColors: true, envMapIntensity: 0.05 }, { rim: 0 }),
    // the cornea only adds its reflections: a wet highlight from the key light and the room
    cornea: prep(new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.08, metalness: 0, envMap: ENV, envMapIntensity: 0.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), { rim: 0 }),
    brow: std({ map: T.brow, alphaTest: 0.38, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8, envMapIntensity: 0 }, { rim: 0 }),
    lash: std({ map: T.lash, alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, color: '#120c0a', roughness: 0.7, envMapIntensity: 0 }, { rim: 0 }),
    hair: hairMat(T.straight), 'hair-curly': hairMat(T.curly), beard: hairMat(T.sparse),
    knit: std({ map: T.knit, roughness: 0.9, vertexColors: true, envMapIntensity: 0.15 }, { rim: 0.7 }),
    weave: std({ map: T.weave, roughness: 0.85, vertexColors: true, envMapIntensity: 0.15 }, { rim: 0.7 }),
    leather: shiny({ map: T.leather, roughness: 0.36, vertexColors: true, envMapIntensity: 0.7 }, { rim: 0.7 }),
    under: std({ map: T.knit, color: '#17191b', roughness: 0.9, vertexColors: true, envMapIntensity: 0.1 }, { rim: 1 }),
    gear: shiny({ color: '#2b3236', roughness: 0.42, metalness: 0.35, vertexColors: true, side: THREE.DoubleSide }, { rim: 1 }),
    pad: std({ color: '#1c2124', roughness: 0.85, vertexColors: true }, { rim: 1 }),
    metal: shiny({ color: '#7d878c', roughness: 0.32, metalness: 0.85, vertexColors: true, side: THREE.DoubleSide }, { rim: 1 }),
    silver: shiny({ color: '#c9ced3', roughness: 0.22, metalness: 1, vertexColors: true, envMapIntensity: 1.2 }, { rim: 0.5 }),
    gold: shiny({ color: '#e1b04a', roughness: 0.24, metalness: 1, vertexColors: true, envMapIntensity: 1.2 }, { rim: 0.5 }),
    cloth2: std({ map: T.knit, color: '#2a3330', roughness: 0.85, vertexColors: true, side: THREE.DoubleSide }, { rim: 1 }),
    band: std({ map: T.weave, color: '#7a1f2b', roughness: 0.8, vertexColors: true, side: THREE.DoubleSide }, { rim: 1 }),
    glow: new THREE.MeshBasicMaterial({ color: '#39ff88', side: THREE.DoubleSide }),
    lens: shiny({ color: '#39ff88', transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }, { rim: 0 }),
    'lens-clear': shiny({ color: '#cfe8f0', transparent: true, opacity: 0.12, roughness: 0.04, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }, { rim: 0 }),
  };
  M.line = new LineMaterial({ color: 0x39ff88, linewidth: 1.5, transparent: true, opacity: 0.9, depthWrite: false });
  return M;
}

// ---------- face texture: skin tone, stubble and makeup painted in a canvas ----------
const faceCache = new Map();
function tinted(mask, color, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0, size, size);
  return c;
}
function faceTexture(L, size) {
  const mk = L.mk;
  const key = [size, L.sk, L.fh !== 'none' && L.fh !== 'moustache' ? L.fh + L.hc : '-', JSON.stringify(mk)].join('|');
  if (faceCache.has(key)) { const t = faceCache.get(key); faceCache.delete(key); faceCache.set(key, t); return t; }
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = D.SKIN[L.sk]; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'multiply'; x.drawImage(assets.tex.skin, 0, 0, size, size);
  x.globalCompositeOperation = 'source-over';
  const M = assets.masks;
  const layer = (mask, color, alpha) => { x.globalAlpha = alpha; x.drawImage(tinted(mask, color, size), 0, 0); x.globalAlpha = 1; };
  if (L.fh === 'stubble') layer(M.stubble, D.HAIR_COLORS[L.hc].hex, 0.6);
  else if (L.fh === 'shortbeard' || L.fh === 'beard' || L.fh === 'goatee') layer(M.stubble, D.HAIR_COLORS[L.hc].hex, 0.3);
  if (mk.shadow !== 'none') layer(M.shadow, D.MAKEUP.shadow.colors[mk.shadowC].hex, mk.shadow === 'smoky' ? 0.85 : 0.55);
  if (mk.blush !== 'none') layer(M.blush, D.MAKEUP.blush.colors[mk.blushC].hex, 0.38);
  if (mk.lip !== 'none') {
    // nude follows the skin: a little deeper and rosier than the skin itself
    const c = mk.lipC === 0 ? '#' + new THREE.Color(D.SKIN[L.sk]).lerp(new THREE.Color('#7a2e30'), 0.32).getHexString() : D.MAKEUP.lip.colors[mk.lipC].hex;
    layer(M.lips, c, 0.86);
  }
  if (mk.liner !== 'none') layer(M['liner-' + mk.liner], D.MAKEUP.liner.colors[mk.linerC].hex, 0.95);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  faceCache.set(key, t);
  while (faceCache.size > 8) { const [k0, t0] = faceCache.entries().next().value; faceCache.delete(k0); t0.dispose(); }
  return t;
}
const irisCache = new Map();
function irisTexture(hex) {
  if (irisCache.has(hex)) return irisCache.get(hex);
  const I = assets.tex.iris, s = I.width;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = '#f2efea'; x.fillRect(0, 0, s, s);
  x.drawImage(I, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.drawImage(tinted(I, hex, s), 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  irisCache.set(hex, t);
  return t;
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
    const out = { grp, recs, stamp: -1 };
    this.group.add(grp); this.props.set(pid, out);
    return out;
  }
  updateProp(pr, L) {
    const dl = this.delta, bt = (L.f.browT || 0) / 100, ba = (L.f.browA || 0) / 100;
    for (const r of pr.recs) {
      const { bind, bindw, morph } = r.p, base = r.base, out = r.pos;
      base.set(r.p.pos);
      if (morph.browT && bt) for (let i = 0; i < base.length; i++) base[i] += morph.browT[i] * bt;
      if (morph.browA && ba) for (let i = 0; i < base.length; i++) base[i] += morph.browA[i] * ba;
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
    const shapeKey = JSON.stringify(L.f);
    if (shapeKey !== this.shapeKey) {
      this.shapeKey = shapeKey; this.shapeStamp = (this.shapeStamp || 0) + 1;
      const pos = this.pos, base = this.A.base, dl = this.delta;
      pos.set(base);
      for (const s of D.SLIDERS) {
        const v = (L.f[s.id] || 0) / 100; if (!v) continue;
        const m = this.A.morphs.get(s.id + (v < 0 ? '-' : '+')); if (!m) continue;
        const w = Math.abs(v), idx = m.idx, d = m.d;
        for (let i = 0; i < idx.length; i++) { const k = idx[i] * 3; pos[k] += w * d[i * 3]; pos[k + 1] += w * d[i * 3 + 1]; pos[k + 2] += w * d[i * 3 + 2]; }
      }
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
      for (const r of pr.recs) r.sub.visible = !(capOn && (TOP_PARTS[pid] || []).includes(r.k));
      if (pr.stamp !== this.shapeStamp || pr.browKey !== `${L.f.browT}|${L.f.browA}`) { this.updateProp(pr, L); pr.browKey = `${L.f.browT}|${L.f.browA}`; }
    }
    // colours and textures
    const M = this.M, glow = D.part('gl', L.gl).hex, hair = D.HAIR_COLORS[L.hc].hex;
    const ft = faceTexture(L, this.faceSize);
    for (const k of ['skin', 'lips']) if (M[k].map !== ft) { M[k].map = ft; M[k].needsUpdate = true; }
    const lipGloss = L.mk.lip === 'gloss';
    M.lips.roughness = lipGloss ? 0.24 : L.mk.lip === 'matte' ? 0.7 : 0.42; M.lips.envMapIntensity = lipGloss ? 0.55 : 0.3;
    const it = irisTexture(D.EYE_COLORS[L.ec].hex);
    if (M.eye.map !== it) { M.eye.map = it; M.eye.needsUpdate = true; }
    M.hair.color.set(hair); M['hair-curly'].color.set(hair); M.beard.color.set(hair);
    M.brow.color.set(L.bc < 0 ? hair : D.HAIR_COLORS[L.bc].hex);
    const oc = D.OUTFIT_COLORS[L.oc].hex;
    for (const k of ['knit', 'weave', 'leather']) M[k].color.set(oc);
    M.glow.color.set(glow); M.lens.color.set(glow); M.line.color.set(glow);
    U.uRim.value.set(glow);
    this.look = L;
    return L;
  }
  setLineScale(px, w, h) { this.M.line.linewidth = px; this.M.line.resolution.set(w, h); }
}

// turn the avatar about the middle of the head rather than the origin
export function turn(group, yaw) {
  const c = 0.25;
  group.rotation.y = yaw;
  group.position.set(-Math.sin(yaw) * c, 0, c - Math.cos(yaw) * c);
}

// ---------- scene: a warm key, a soft cool fill and two rims in the glow colour ----------
const KEY_DIR = new THREE.Vector3(-1.1, 1.2, 1.4).normalize();
function makeScene(rig) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfe6f0', '#3a302a', 0.55));
  const key = new THREE.DirectionalLight('#fff1e0', 2.6); key.position.copy(KEY_DIR); scene.add(key);
  const fill = new THREE.DirectionalLight('#cfdcff', 0.55); fill.position.set(1.3, 0.1, 0.9); scene.add(fill);
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
  const tall = (L.h === 'mohawk' || L.h === 'afro' || L.h === 'bun' || L.h === 'ponytail') && !L.g.includes('cap') ? 0.3 : 0;
  if (frame === 'face') { thumbCam.position.set(0, 7.35, 7.4); thumbCam.lookAt(0, 7.2, 0.3); }
  else if (small) { thumbCam.position.set(0, 7.6 + tall * 0.4, 9.4 + tall * 1.2); thumbCam.lookAt(0, 7.2 + tall * 0.45, 0.2); }
  else { thumbCam.position.set(0, 7.45 + tall * 0.5, 12.2 + tall * 2); thumbCam.lookAt(0, 6.95 + tall * 0.55, 0.15); }
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
    this.kick();
    return L;
  }
  rotate(d) { this.yaw += d; this.kick(); }
  kick() { if (!this.raf && this.alive) this.raf = requestAnimationFrame(t => this.frame(t)); }
  frame(t) {
    this.raf = 0;
    if (!this.alive) return;
    // a slow sway while nobody is dragging, unless the player asked for reduced motion
    const sway = !this.reduce && !this.dragging && t - this.idle > 2500;
    const yaw = this.yaw + (sway ? Math.sin((t - this.idle) / 2600) * 0.22 : 0);
    turn(this.rig.group, yaw);
    const dist = this.w / this.h < 0.8 ? 13.5 : 11.2;
    this.cam.position.set(0, 6.95 + Math.sin(this.pitch) * dist, 0.15 + Math.cos(this.pitch) * dist);
    this.cam.lookAt(0, 6.82, 0.15);
    beforeRender(this.cam);
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
