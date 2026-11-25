// Operators: the player characters in 3D. One rig, two bases (male and female), colour zones,
// accessories on bones and animations made in code, all set from a preset:
//
//   const op = Operator.create(THREE, preset, { lite })   preset: see Operator.defaults(base)
//   scene.add(op.group); op.play('type'); op.once('cast'); each frame op.update(dt)
//   op.set(preset)   recolour and swap accessories in place (same base) or rebuild (new base)
//   op.at(name, t)   hold one moment of an animation, for stills and tests
//   op.dispose()
//
// A base with a generated model (MODELS: Tripo via Higgsfield, rigged in Blender on this skeleton,
// 2026-11-24) loads it in the background and swaps it in when it arrives; until then, and for bases
// without one, the base is a stand-in mannequin built here. Bones follow the usual humanoid names
// (Hips, Spine, LeftArm...), the character faces +z and its left side is +x. Every bone's bind pose
// has no rotation, so a pose means the same thing on the model and on the stand-in.
// Poses are written in body terms (shoulder forward 40, elbow 80, in degrees) and turned into bone
// rotations by limb(), so a sign can't flip an elbow backward (joint-check skill).
window.Operator = (() => {
  const ZONES = [
    ['skin', 'Skin'], ['hair', 'Hair'], ['jacket', 'Jacket'], ['shirt', 'Shirt'], ['pants', 'Pants'],
    ['boots', 'Boots'], ['gloves', 'Gloves'], ['straps', 'Straps'], ['beanie', 'Beanie'], ['scarf', 'Scarf'], ['glow', 'Glow'],
  ];
  const ACCESSORIES = [
    ['beanie', 'Beanie'], ['visor', 'Visor'], ['scarf', 'Scarf'], ['mask', 'Face mask'],
    ['wrist', 'Wrist device'], ['pouches', 'Belt pouches'], ['harness', 'Harness'],
  ];
  // the virtual keyboard each operator types on: their weapon, so its shape and colour are theirs to pick
  const KB_STYLES = [['slab', 'Slab'], ['split', 'Split'], ['arc', 'Arc'], ['compact', 'Compact']];
  const ANIMS = [['idle', 'Idle'], ['walk', 'Walk'], ['type', 'Typing'], ['victory', 'Victory'], ['defeat', 'Defeat']];
  const ONCE = [['cast', 'Cast'], ['hit', 'Hit']];

  // both bases wear the outfit from the 2026-11-24 Gemini sheets; colours come from there too
  const BASES = {
    male: { name: 'Operator M', hip: 0.96, shoulder: 0.19, hipW: 0.095, scale: 1, hairStyle: 'short' },
    female: { name: 'Operator F', hip: 0.93, shoulder: 0.17, hipW: 0.1, scale: 0.955, hairStyle: 'shag' },
  };
  function defaults(base = 'male') {
    const f = base === 'female';
    return {
      v: 1, base,
      colors: {
        skin: f ? '#d9b39a' : '#c49477', hair: f ? '#d4b66e' : '#2b211b', jacket: '#1d2638', shirt: '#2f2b26',
        pants: '#16181b', boots: '#2b2d31', gloves: '#1b1c1e', straps: '#4a4a32', beanie: '#3c3d2e', scarf: '#24232b', glow: 'theme',
      },
      acc: { beanie: !f, visor: true, scarf: true, mask: false, wrist: true, pouches: true, harness: true },
      kb: { style: 'slab', color: 'theme' },
      tint: { color: '#3a5a8a', k: 0 },      // the generated body's outfit tint, 0 to 1 (strength)
      body: { height: 0, build: 0 },         // -1 to 1: ±4% height, ±6% across the chest and shoulders
    };
  }
  // a saved or pasted preset with anything missing filled from the base's defaults
  function clean(p) {
    const base = p && BASES[p.base] ? p.base : 'male', d = defaults(base);
    const hex = v => (typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || v === 'theme') ? v : null);
    const colors = {}, acc = {};
    for (const [z] of ZONES) colors[z] = hex(p && p.colors && p.colors[z]) || d.colors[z];
    for (const [a] of ACCESSORIES) acc[a] = p && p.acc && typeof p.acc[a] === 'boolean' ? p.acc[a] : d.acc[a];
    const k = (p && p.kb) || {};
    const kb = { style: KB_STYLES.some(([id]) => id === k.style) ? k.style : d.kb.style, color: hex(k.color) || d.kb.color };
    const num = (v, lo, hi, dv) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dv);
    const t = (p && p.tint) || {}, b = (p && p.body) || {};
    const tint = { color: hex(t.color) && t.color !== 'theme' ? t.color : d.tint.color, k: num(t.k, 0, 0.6, d.tint.k) };
    const body = { height: num(b.height, -1, 1, 0), build: num(b.build, -1, 1, 0) };
    return { v: 1, base, colors, acc, kb, tint, body };
  }

  // generated bodies: full detail for you, lite for everyone else; the far crowd stays stand-ins
  const MODELS = { male: { full: 'assets/operators/male.glb', lite: 'assets/operators/male-lite.glb' } };
  // editor masks painted on each model's texture (R skin, G eyes, B outfit; see MODELS.md)
  const MASKS = { male: 'assets/operators/male-mask.png' };
  const maskTex = {};
  // where shop gear sits on the generated male's Head bone: [height, forward, depth scale]
  const MODEL_FIT = { mask: [-0.02, 0.07, 1] };
  const tpl = {}, live = new Set();
  let loading = null;
  // the generated texture is dark (navy leather, black cargo pants) and the arenas are dim, so lift it:
  // a brighter base colour, plus the texture glowing faintly so the shadow side keeps its detail
  const LIFT = { color: 1.7, glow: 0.32, rough: 0.62 };
  let THREE = null;
  function brighten(m) {
    if (!m || !m.map) return;
    m.color.setScalar(LIFT.color);
    m.emissiveMap = m.map; m.emissive.setScalar(1); m.emissiveIntensity = LIFT.glow;
    m.roughness = LIFT.rough; m.metalness = 0;
    m.side = THREE.DoubleSide;   // a fold at the elbow turns a few faces round; draw their backs instead of a hole
    m.needsUpdate = true;
  }
  function loadModels(T) {
    if (T) THREE = T;
    if (!loading) loading = import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const L = new GLTFLoader();
      return Promise.all(Object.entries(MODELS).flatMap(([base, lods]) => Object.entries(lods).map(([lod, url]) =>
        L.loadAsync(url).then(g => { g.scene.traverse(o => o.isMesh && brighten(o.material)); tpl[base + ':' + lod] = g.scene; }).catch(e => console.warn('operator model', url, e))).concat(
        Object.entries(MASKS).map(([base, url]) => new THREE.TextureLoader().loadAsync(url).then(t => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; maskTex[base] = t; }).catch(e => console.warn('operator mask', url, e))))));
    }).then(() => { for (const op of live) op._upgrade(); });
    return loading;
  }

  const R = Math.PI / 180;
  const PRO_SIGN = 1;   // checked on renders: + turns the palm down on both arms
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  // ---------- poses, in degrees ----------
  // lean: spine forward; side: toward the character's left; twist: chest turned to its left
  // arm/leg: { flex: forward, abd: out to its side, twist: + rolls it inward }; elbow and knee: bend; wrist: bend forward
  const BLANK = () => ({ lean: 0, side: 0, twist: 0, nod: 0, turn: 0, tilt: 0,
    armL: { flex: 0, abd: 0, twist: 0 }, armR: { flex: 0, abd: 0, twist: 0 }, elbowL: 0, elbowR: 0, wristL: 0, wristR: 0, proL: 0, proR: 0,
    legL: { flex: 0, abd: 0 }, legR: { flex: 0, abd: 0 }, kneeL: 0, kneeR: 0 });
  function mixPose(a, b, w) {
    if (w <= 0) return a; if (w >= 1) return b;
    const o = {};
    for (const k in a) {
      if (typeof a[k] === 'number') o[k] = a[k] + (b[k] - a[k]) * w;
      else { o[k] = {}; for (const j in a[k]) o[k][j] = a[k][j] + (b[k][j] - a[k][j]) * w; }
    }
    return o;
  }
  const A = {
    idle(t) {
      const p = BLANK(), br = Math.sin(t * 1.6);
      p.lean = 2 + br * 0.8; p.side = Math.sin(t * 0.35) * 1.5; p.twist = Math.sin(t * 0.5) * 3;
      p.nod = -2 + Math.sin(t * 0.7) * 1.5; p.turn = Math.sin(t * 0.4) * 8;
      p.armL = { flex: 4 + br, abd: 9, twist: 0 }; p.armR = { flex: 4 + br, abd: 9, twist: 0 };
      p.elbowL = p.elbowR = 14; p.wristL = p.wristR = 6;
      p.legL = { flex: 2, abd: 4 }; p.legR = { flex: -2, abd: 4 }; p.kneeL = p.kneeR = 4;
      return p;
    },
    walk(t) {
      const p = BLANK(), ph = t * Math.PI * 2 / 1.05, s = Math.sin(ph), c = Math.cos(ph);
      p.lean = 4; p.twist = 5 * s; p.nod = 2; p.turn = -2 * s;
      p.legL = { flex: 21 * s, abd: 3 }; p.legR = { flex: -21 * s, abd: 3 };
      // the knee bends through the swing on a smooth curve, with no corner where it starts
      p.kneeL = 6 + 50 * Math.pow((1 + c) / 2, 2); p.kneeR = 6 + 50 * Math.pow((1 - c) / 2, 2);
      p.armL = { flex: -18 * s, abd: 8, twist: 0 }; p.armR = { flex: 18 * s, abd: 8, twist: 0 };
      p.elbowL = 16 + 14 * Math.pow((1 - s) / 2, 2); p.elbowR = 16 + 14 * Math.pow((1 + s) / 2, 2); p.wristL = p.wristR = 5;
      return p;
    },
    type(t) { return typePose(t, strokes(t)); },
    victory(t) {
      const p = BLANK(), b = Math.abs(Math.sin(t * 4));
      p.lean = -6; p.nod = -16; p.turn = Math.sin(t * 2) * 6;
      // both fists up in a V, upper arms rolled so the forearms come in over the head (Gid's references)
      p.armL = { flex: 142, abd: 38, twist: 50 }; p.armR = { flex: 142, abd: 38, twist: 50 };
      p.elbowL = p.elbowR = 28 + b * 8; p.wristL = p.wristR = 0;
      p.legL = { flex: 4 + b * 10, abd: 9 }; p.legR = { flex: 4 + b * 10, abd: 9 }; p.kneeL = p.kneeR = 6 + b * 22;
      return p;
    },
    defeat(t) {
      const p = BLANK(), br = Math.sin(t * 1.1);
      p.lean = 24 + br; p.side = 3; p.nod = 34; p.turn = -6;
      p.armL = { flex: 10, abd: 5, twist: 0 }; p.armR = { flex: 12, abd: 4, twist: 0 }; p.elbowL = p.elbowR = 12;
      p.legL = { flex: 24, abd: 6 }; p.legR = { flex: 18, abd: 6 }; p.kneeL = 42; p.kneeR = 34;
      return p;
    },
    // one-shots: weight 0 to 1 and back over their length
    cast(t) {
      // the right arm draws back with the chest turned away, then throws forward
      const p = A.idle(t), wind = smooth(t / 0.4), strike = ease((t - 0.4) / 0.22);
      const w = mixPose(BLANK(), { ...BLANK(), lean: 2, twist: -22, nod: -4, turn: 14,
        armR: { flex: -28, abd: 34, twist: 0 }, elbowR: 70, wristR: 10, armL: { flex: 30, abd: 12, twist: 40 }, elbowL: 72,
        legL: { flex: 8, abd: 6 }, legR: { flex: -10, abd: 6 }, kneeL: 10, kneeR: 8 }, wind);
      const s = { ...BLANK(), lean: 10, twist: 20, nod: 2, turn: -12,
        armR: { flex: 86, abd: 6, twist: 0 }, elbowR: 6, wristR: -6, armL: { flex: 24, abd: 16, twist: 0 }, elbowL: 64,
        legL: { flex: 16, abd: 6 }, legR: { flex: -14, abd: 6 }, kneeL: 14, kneeR: 6 };
      return { pose: strike > 0 ? mixPose(w, s, strike) : w, len: 1.15, base: p };
    },
    hit(t) {
      const p = { ...BLANK(), lean: -14, side: 5, nod: -18, turn: 8,
        armL: { flex: 26, abd: 22, twist: 0 }, armR: { flex: 30, abd: 18, twist: 0 }, elbowL: 62, elbowR: 70,
        legL: { flex: 6, abd: 6 }, legR: { flex: -8, abd: 6 }, kneeL: 14, kneeR: 10 };
      return { pose: p, len: 0.5, base: A.idle(t) };
    },
  };
  const ONCE_LEN = { cast: 1.15, hit: 0.5 };
  // standing at the keyboard, after Gid's posture references (2026-11-24): back straight, upper arms
  // close to the body, elbows near 90, forearms level and angled in so the hands meet the keys about
  // shoulder width apart, eyes ahead with a small nod; each hand strikes from the wrist and elbow
  // each hand rises and falls with the forearm (1 is the bottom of a stroke) and the wrist follows a
  // beat behind, so the hands bob over the keys instead of twitching
  const strokes = t => [Math.sin(t * 12.5), Math.sin(t * 14 + 1.3)];
  function typePose(t, [kl, kr]) {
    const p = BLANK();
    const wl = Math.sin(t * 12.5 - 0.9), wr = Math.sin(t * 14 + 0.4);
    p.lean = 2; p.nod = 8 + Math.sin(t * 2.1) * 1.5; p.turn = Math.sin(t * 0.8) * 3;
    // palms down on the keys (Gid, 25 Nov); the forearms hold still and typing is a small tap at the wrist
    p.armL = { flex: 14, abd: 18, twist: 42 }; p.armR = { flex: 14, abd: 18, twist: 42 };
    p.elbowL = p.elbowR = 88; p.proL = p.proR = 65;
    const tap = k => Math.max(0, k);   // the stroke presses down and lifts back, never up past rest
    p.wristL = 4 + tap(kl) * 6 + wl * 1; p.wristR = 4 + tap(kr) * 6 + wr * 1;
    p.legL = { flex: 2, abd: 6 }; p.legR = { flex: -1, abd: 6 }; p.kneeL = p.kneeR = 4;
    return p;
  }

  function create(THREE, preset, opts = {}) {
    const V = THREE.Vector3;
    let P = clean(preset);
    const lite = !!opts.lite || !!opts.tiny;
    const seg = opts.tiny ? 4 : lite ? 6 : 12;   // tiny: the far-away crowd
    const group = new THREE.Group();
    const owned = [];
    const own = x => (owned.push(x), x);
    let B = {}, mats = {}, accs = {}, built = null, isModel = false;
    const model = () => (opts.tiny ? null : tpl[P.base + ':' + (lite ? 'lite' : 'full')] || tpl[P.base + ':full'] || null);

    // ---------- materials, one set per character so two operators can differ ----------
    function mat(zone) {
      if (zone === 'glow') return own(new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.4 }));
      const rough = { skin: 0.62, hair: 0.85, jacket: 0.74, shirt: 0.9, pants: 0.8, boots: 0.5, gloves: 0.6, straps: 0.7, beanie: 0.95, scarf: 0.85 }[zone] ?? 0.8;
      return own(new THREE.MeshStandardMaterial({ roughness: rough, metalness: zone === 'boots' ? 0.15 : 0 }));
    }
    function paint() {
      paintModel();
      for (const [z] of ZONES) {
        const v = P.colors[z], m = mats[z];
        if (!m) continue;
        const hex = v === 'theme' ? (window.Theme ? Theme.hex('accent') : '#39ff88') : v;
        if (z === 'glow') m.emissive.set(hex); else m.color.set(hex);
      }
    }

    // ---------- the rig ----------
    function bone(name, parent, x, y, z) {
      const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); B[name] = g; return g;
    }
    function piece(b, geo, zone, at = [0, 0, 0], rot = [0, 0, 0], scale) {
      const m = new THREE.Mesh(own(geo), mats[zone]);
      m.position.set(...at); m.rotation.set(...rot); if (scale) m.scale.set(...scale);
      m.userData.zone = zone; b.add(m); return m;
    }
    const cap = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len), opts.tiny ? 1 : lite ? 2 : 4, seg);
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const rbox = (w, h, d, r) => (THREE.RoundedBoxGeometry && !opts.tiny ? new THREE.RoundedBoxGeometry(w, h, d, lite ? 1 : 2, r) : box(w, h, d));

    // the generated body: a copy of the loaded model on its own bones (geometry and texture are shared).
    // Its material is this operator's own, so the safe editors can change it: an outfit tint that keeps
    // the texture's light and shade (mask B), and the glowing cyan details recoloured to the Glow colour.
    // Eye colour and skin tone wait for the separate heads, since this texture gives the face ~50 px.
    let mu = null;
    function modelMat(src) {
      const m = src.clone();
      const u = mu = { uMask: { value: maskTex[P.base] || null }, uTint: { value: new THREE.Color() }, uTintK: { value: 0 }, uGlow: { value: new THREE.Color() } };
      m.defines = { ...(m.defines || {}), OP_MASK: maskTex[P.base] ? 1 : 0 };
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform sampler2D uMask; uniform vec3 uTint; uniform float uTintK; uniform vec3 uGlow;
            // cyan glowing details, and warm skin the tint must leave alone (bare forearms, neck), from the texel in linear colour
            float opGlowMask(vec3 c) { return clamp(((c.g + c.b) * 0.5 - c.r * 1.2 - 0.04) * 9.0, 0.0, 1.0) * smoothstep(0.1, 0.18, max(c.g, c.b)); }
            float opSkin(vec3 c) { return smoothstep(1.05, 1.35, c.r / max(c.g, 1e-3)) * step(c.b, c.g) * smoothstep(0.03, 0.08, c.r); }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            {
              vec3 c0 = diffuseColor.rgb / max(diffuse, vec3(1e-4));
              float gm = opGlowMask(c0);
              float l = dot(c0, vec3(0.299, 0.587, 0.114));
              float cloth = 1.0;
              #if OP_MASK
                cloth = texture2D(uMask, vMapUv).b;
              #endif
              cloth *= 1.0 - opSkin(c0);
              vec3 c = mix(c0, uTint * clamp(l * 7.0, 0.0, 1.6), cloth * uTintK * (1.0 - gm));
              c = mix(c, uGlow * (0.35 + l * 1.4), gm);
              diffuseColor.rgb = c * diffuse;
            }`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            { vec3 e0 = texture2D(emissiveMap, vEmissiveMapUv).rgb; float g2 = opGlowMask(e0);
              float l2 = dot(e0, vec3(0.299, 0.587, 0.114));
              float cl2 = 1.0 - opSkin(e0);
              #if OP_MASK
                cl2 *= texture2D(uMask, vEmissiveMapUv).b;
              #endif
              vec3 e = mix(e0, uTint * clamp(l2 * 7.0, 0.0, 1.6), cl2 * uTintK * (1.0 - g2));
              totalEmissiveRadiance = (e * (1.0 - g2) + uGlow * g2 * 1.6) * emissive; }`);
      };
      m.customProgramCacheKey = () => 'op-model-' + m.defines.OP_MASK;
      return own(m);
    }
    function paintModel() {
      if (!mu) return;
      const glow = P.colors.glow === 'theme' ? (window.Theme ? Theme.hex('accent') : '#39ff88') : P.colors.glow;
      mu.uTint.value.set(P.tint.color); mu.uTintK.value = P.tint.k; mu.uGlow.value.set(glow);
    }
    function buildModel(t) {
      B = {}; mats = {}; accs = {}; mu = null;
      const root = t.clone(true);
      root.name = 'operator';
      root.traverse(o => { if (o.isBone) B[o.name] = o; });
      root.traverse(o => {
        if (!o.isSkinnedMesh) return;
        const sk = o.skeleton;
        o.bind(new THREE.Skeleton(sk.bones.map(b => B[b.name]), sk.boneInverses.map(m => m.clone())), o.bindMatrix);
        o.frustumCulled = false; o.userData.zone = 'model';
        o.material = modelMat(o.material);
      });
      // shop gear that isn't part of the generated outfit hangs on the model's own bones
      mats.scarf = mat('scarf');
      if (B.Head) {
        const g = new THREE.Group(); g.name = 'acc-mask'; B.Head.add(g); accs.mask = g;
        const m = new THREE.Mesh(own(new THREE.CylinderGeometry(0.104, 0.094, 0.085, 32, 1, true, -Math.PI * 0.62, Math.PI * 1.24)), mats.scarf);
        m.position.set(0, MODEL_FIT.mask[0], MODEL_FIT.mask[1]); m.scale.set(1, 1, MODEL_FIT.mask[2]); m.userData.zone = 'scarf'; g.add(m);
      }
      return root;
    }
    function build() {
      const t = model();
      isModel = !!t;
      if (t) return buildModel(t);
      const S = BASES[P.base], k = S.scale;
      B = {}; mats = {}; accs = {};
      for (const [z] of ZONES) mats[z] = mat(z);
      const root = new THREE.Group(); root.name = 'operator';
      const hips = bone('Hips', root, 0, S.hip, 0);
      const sp = bone('Spine', hips, 0, 0.1 * k, 0), sp1 = bone('Spine1', sp, 0, 0.12 * k, 0), sp2 = bone('Spine2', sp1, 0, 0.13 * k, 0);
      const neck = bone('Neck', sp2, 0, 0.17 * k, 0), head = bone('Head', neck, 0, 0.09 * k, 0);
      const up = 0.28 * k, fore = 0.26 * k, thigh = 0.43 * k, shin = 0.42 * k;
      for (const [s, x] of [['Left', 1], ['Right', -1]]) {
        const sh = bone(s + 'Shoulder', sp2, x * 0.05 * k, 0.115 * k, -0.01);
        const arm = bone(s + 'Arm', sh, x * (S.shoulder - 0.05) * k, 0, 0);
        const fa = bone(s + 'ForeArm', arm, 0, -up, 0);
        const hand = bone(s + 'Hand', fa, 0, -fore, 0);
        const ul = bone(s + 'UpLeg', hips, x * S.hipW * k, -0.06 * k, 0);
        const lg = bone(s + 'Leg', ul, 0, -thigh, 0);
        const ft = bone(s + 'Foot', lg, 0, -shin, 0);
        // arm: sleeve, elbow, sleeve, glove; the pivots sit in the middle of each joint
        piece(arm, cap(0.056 * k, up - 0.06), 'jacket', [0, -up / 2, 0]);
        piece(arm, new THREE.SphereGeometry(0.075 * k, seg, seg / 2), 'jacket', [x * 0.01, 0.005, 0]);
        piece(fa, cap(0.05 * k, fore - 0.07), 'jacket', [0, -fore / 2 + 0.01, 0]);
        piece(fa, new THREE.CylinderGeometry(0.052 * k, 0.05 * k, 0.05, seg), 'jacket', [0, -fore + 0.04, 0]);   // cuff
        piece(hand, rbox(0.075 * k, 0.1 * k, 0.04 * k, 0.012), 'gloves', [0, -0.05 * k, 0.004]);
        piece(hand, rbox(0.03 * k, 0.05 * k, 0.03 * k, 0.008), 'gloves', [x * 0.04 * k, -0.035 * k, 0.018], [0.3, 0, x * -0.5]);   // thumb
        // leg: trousers, knee, boot
        piece(ul, cap(0.078 * k, thigh - 0.08), 'pants', [0, -thigh / 2, 0]);
        piece(lg, cap(0.062 * k, shin - 0.1), 'pants', [0, -shin / 2 + 0.03, 0]);
        piece(lg, new THREE.CylinderGeometry(0.07 * k, 0.066 * k, 0.17 * k, seg), 'boots', [0, -shin + 0.075 * k, 0]);
        piece(ft, rbox(0.105 * k, 0.085 * k, 0.25 * k, 0.025), 'boots', [0, -0.012, 0.055 * k]);
        piece(ft, box(0.112 * k, 0.018, 0.255 * k), 'boots', [0, -0.05 * k, 0.055 * k]);   // sole
        if (!lite) piece(ft, box(0.004, 0.012, 0.07), 'glow', [x * 0.055 * k, 0.0, 0.0]);           // boot light
      }
      // pelvis and belt
      piece(hips, rbox(0.33 * k, 0.17 * k, 0.21 * k, 0.05), 'pants', [0, -0.03, 0]);
      piece(hips, box(0.345 * k, 0.035, 0.22 * k), 'straps', [0, 0.05, 0]);
      // torso: shirt underneath, jacket over the chest with an open front showing the shirt
      piece(sp, rbox(0.27 * k, 0.17 * k, 0.18 * k, 0.05), 'shirt', [0, 0.04, 0]);
      piece(sp1, rbox(0.31 * k, 0.16 * k, 0.2 * k, 0.05), 'jacket', [0, 0.06, -0.005]);
      piece(sp2, rbox(0.36 * k, 0.2 * k, 0.21 * k, 0.06), 'jacket', [0, 0.06, -0.005]);
      piece(sp1, box(0.11 * k, 0.3 * k, 0.02), 'shirt', [0, 0.12, 0.1 * k]);
      if (!lite) for (const x of [-1, 1]) piece(sp2, box(0.006, 0.16 * k, 0.006), 'glow', [x * 0.065 * k, 0.04, 0.112 * k]);   // jacket trim
      piece(sp2, new THREE.CylinderGeometry(0.09 * k, 0.11 * k, 0.07, seg, 1, true), 'jacket', [0, 0.16 * k, -0.01]);       // collar
      piece(neck, new THREE.CylinderGeometry(0.052 * k, 0.058 * k, 0.12 * k, seg), 'skin', [0, 0.03, 0]);
      // head: skull, jaw, nose, ears, eyes
      piece(head, new THREE.SphereGeometry(0.1 * k, seg * 2, seg), 'skin', [0, 0.1 * k, 0.005], [0, 0, 0], [1, 1.17, 1.08]);
      piece(head, rbox(0.13 * k, 0.07 * k, 0.13 * k, 0.03), 'skin', [0, 0.035 * k, 0.025]);
      piece(head, box(0.022 * k, 0.04 * k, 0.03 * k), 'skin', [0, 0.095 * k, 0.107 * k], [-0.25, 0, 0]);
      for (const x of [-1, 1]) {
        piece(head, new THREE.SphereGeometry(0.022 * k, 8, 6), 'skin', [x * 0.1 * k, 0.1 * k, 0], [0, 0, 0], [0.5, 1, 0.8]);
        const eye = new THREE.Mesh(own(new THREE.SphereGeometry(0.012 * k, 8, 6)), own(new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.3 })));
        eye.position.set(x * 0.036 * k, 0.118 * k, 0.098 * k); eye.userData.zone = 'eyes'; head.add(eye);
      }
      // hair, by base
      if (S.hairStyle === 'shag') {
        piece(head, new THREE.SphereGeometry(0.112 * k, seg * 2, seg, 0, Math.PI * 2, 0, Math.PI * 0.55), 'hair', [0, 0.11 * k, -0.005], [0, 0, 0], [1.02, 1.12, 1.1]);
        piece(head, new THREE.CylinderGeometry(0.115 * k, 0.12 * k, 0.15 * k, seg * 2, 1, true, Math.PI * 0.32, Math.PI * 1.36), 'hair', [0, 0.045 * k, -0.008]);   // sides and back to the jaw
        piece(head, rbox(0.15 * k, 0.04 * k, 0.04 * k, 0.015), 'hair', [0, 0.16 * k, 0.09 * k], [0.4, 0, 0]);   // bangs
      } else {
        piece(head, new THREE.SphereGeometry(0.108 * k, seg * 2, seg, 0, Math.PI * 2, 0, Math.PI * 0.48), 'hair', [0, 0.12 * k, -0.006], [-0.12, 0, 0], [1.02, 1.1, 1.1]);
        piece(head, rbox(0.12 * k, 0.03 * k, 0.04 * k, 0.012), 'hair', [0, 0.18 * k, 0.07 * k], [0.5, 0, 0]);
      }

      // ---------- accessories ----------
      const acc = (name, b, list) => { const g = new THREE.Group(); g.name = 'acc-' + name; b.add(g); list(g); accs[name] = g; };
      acc('beanie', head, g => {
        piece(g, new THREE.SphereGeometry(0.118 * k, seg * 2, seg, 0, Math.PI * 2, 0, Math.PI * 0.52), 'beanie', [0, 0.125 * k, -0.01], [-0.18, 0, 0], [1.03, 1.12, 1.1]);
        piece(g, new THREE.TorusGeometry(0.113 * k, 0.018 * k, 6, seg * 2), 'beanie', [0, 0.135 * k, -0.005], [Math.PI / 2 - 0.18, 0, 0], [1.03, 1.08, 1]);
      });
      acc('visor', head, g => {
        piece(g, box(0.19 * k, 0.034 * k, 0.012), 'gloves', [0, 0.12 * k, 0.103 * k]);                  // frame
        const lens = piece(g, box(0.17 * k, 0.026 * k, 0.006), 'glow', [0, 0.12 * k, 0.11 * k]);
        lens.material = own(new THREE.MeshStandardMaterial({ color: '#0b1a1a', emissive: '#ffffff', emissiveIntensity: 0.35, transparent: true, opacity: 0.85, roughness: 0.1 }));
        lens.userData.zone = 'lens';
        for (const x of [-1, 1]) piece(g, box(0.008, 0.016, 0.1 * k), 'gloves', [x * 0.1 * k, 0.12 * k, 0.055 * k]);   // arms
      });
      acc('scarf', neck, g => { piece(g, new THREE.TorusGeometry(0.075 * k, 0.035 * k, 8, seg * 2), 'scarf', [0, 0.01, 0.005], [Math.PI / 2, 0, 0], [1, 1.15, 1]); });
      acc('mask', head, g => { piece(g, new THREE.CylinderGeometry(0.108 * k, 0.1 * k, 0.085 * k, seg * 2, 1, true, -Math.PI * 0.62, Math.PI * 1.24), 'scarf', [0, 0.05 * k, 0.01]); });
      acc('wrist', B.LeftForeArm, g => {
        piece(g, rbox(0.07 * k, 0.06 * k, 0.075 * k, 0.01), 'gloves', [0.01, -fore + 0.075, 0.01]);
        piece(g, box(0.004, 0.045 * k, 0.055 * k), 'glow', [0.047 * k, -fore + 0.075, 0.01]);
      });
      acc('pouches', hips, g => {
        for (const x of [-1, 1]) piece(g, rbox(0.06 * k, 0.07 * k, 0.04 * k, 0.01), 'straps', [x * 0.12 * k, 0.02, 0.105 * k]);
        piece(g, rbox(0.05 * k, 0.15 * k, 0.06 * k, 0.012), 'straps', [-0.16 * k, -0.17 * k, 0.02]);   // thigh holster, right side
      });
      acc('harness', sp2, g => {
        for (const x of [-1, 1]) {
          piece(g, box(0.035 * k, 0.3 * k, 0.012), 'straps', [x * 0.09 * k, 0.0, 0.113 * k], [0, 0, x * -0.12]);
          piece(g, box(0.035 * k, 0.3 * k, 0.012), 'straps', [x * 0.08 * k, 0.0, -0.118 * k], [0, 0, x * 0.35]);
          piece(g, box(0.035 * k, 0.012, 0.23 * k), 'straps', [x * 0.1 * k, 0.165 * k, -0.005]);
        }
      });
      return root;
    }
    // height and build: the whole body ±4%, and the chest and shoulders ±6% wide (the arms ride along)
    function shape() {
      if (!built) return;
      built.scale.setScalar(1 + 0.04 * P.body.height);
      if (B.Spine2) B.Spine2.scale.set(1 + 0.06 * P.body.build, 1, 1 + 0.04 * P.body.build);
    }
    function showAcc() {
      for (const [a] of ACCESSORIES) if (accs[a]) accs[a].visible = !!P.acc[a];
      if (accs.mask && P.acc.mask && accs.scarf) accs.scarf.visible = false;   // the scarf pulled up is the mask
    }

    // merge the pieces that hang on the same bone and share a material into one mesh, so a
    // character costs a few dozen draw calls instead of seventy (accessory groups merge on their own)
    function compact(root) {
      const nodes = [];
      root.traverse(o => { if (!o.isMesh) nodes.push(o); });
      for (const node of nodes) {
        const byMat = new Map();
        for (const m of node.children) if (m.isMesh && m.userData.zone !== 'eyes') {
          if (!byMat.has(m.material)) byMat.set(m.material, []);
          byMat.get(m.material).push(m);
        }
        for (const [material, list] of byMat) {
          if (list.length < 2) continue;
          const pos = [], nor = [], uv = [];
          for (const m of list) {
            m.updateMatrix();
            const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
            pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
            if (g.attributes.uv) uv.push(...g.attributes.uv.array); else uv.push(...new Float32Array(g.attributes.position.count * 2));
            g.dispose(); node.remove(m);
          }
          const geo = own(new THREE.BufferGeometry());
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
          geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          const merged = new THREE.Mesh(geo, material);
          merged.userData.zone = list[0].userData.zone;
          node.add(merged);
        }
      }
    }
    function rebuild() {
      if (built) { group.remove(built); }
      while (owned.length) owned.pop().dispose();
      built = build();
      if (!isModel) compact(built);
      group.add(built);
      paint(); showAcc();
      rest = {}; for (const n in B) rest[n] = B[n].position.clone();
      shape();
      // each limb's direction at rest, and the turn that straightens a rest bend in elbows and knees,
      // so 0 means a straight limb hanging down on both the stand-in and the model
      dirs = {}; straight = {};
      for (const [n, c] of Object.entries(CHILD)) dirs[n] = rest[c].clone().normalize();
      for (const n of ['LeftForeArm', 'RightForeArm', 'LeftLeg', 'RightLeg']) straight[n] = new THREE.Quaternion().setFromUnitVectors(dirs[n], dirs[B[n].parent.name]);
      legs = {};
      for (const s of ['Left', 'Right']) legs[s] = { a: rest[s + 'Leg'].length(), c: rest[s + 'Foot'].length(), drop: -(rest[s + 'Leg'].y + rest[s + 'Foot'].y) };
      placeKb(); buildKb();
    }
    // ---------- the virtual keyboard ----------
    // keys are one instanced mesh, so a board costs three draw calls; it hangs off the body, not the
    // hands, sits under the fingertips of the typing pose and fades in while the operator types
    let kb = null, kbV = 0, kbAt = new V(), lastStroke = [0, 0];
    const KEY = 0.032;   // key pitch, well over a real 19 mm key so the board reads from the arena camera
    function kbLayout(style) {
      const keys = [];   // [x, z, w, side, rotY]
      const rows = style === 'compact' ? [10, 10, 9] : [12, 12, 11, 10];
      rows.forEach((n, r) => { for (let i = 0; i < n; i++) keys.push([(i - (n - 1) / 2) * KEY + r * KEY * 0.25, (r - rows.length / 2) * KEY, 1]); });
      keys.push([0, (rows.length / 2) * KEY, style === 'compact' ? 4 : 6]);   // space
      if (style === 'split') for (const k of keys) { const s = k[0] >= 0 ? 1 : -1; k[0] += s * KEY * 1.6; k[4] = -s * 0.22; }
      if (style === 'arc') for (const k of keys) { const a = k[0] / 0.26; k[4] = -a; k[0] = Math.sin(a) * 0.26; k[1] = k[1] - (1 - Math.cos(a)) * 0.26; }
      for (const k of keys) k[3] = k[0] >= 0 ? 0 : 1;   // 0: under the left hand (+x), 1: the right
      return keys;
    }
    function kbColor() { const v = P.kb.color; return v === 'theme' ? (window.Theme ? Theme.hex('accent') : '#39ff88') : v; }
    function buildKb() {
      if (kb) { group.remove(kb.group); kb.parts.forEach(x => x.dispose()); kb = null; }
      if (opts.tiny) return;
      const layout = kbLayout(P.kb.style), g = new THREE.Group(), parts = [];
      const c = new THREE.Color(kbColor());
      const glow = (o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); parts.push(m); return m; };
      // the plate under the keys and its glowing rim
      const xs = layout.map(k => k[0]), zs = layout.map(k => k[1]);
      const w = Math.max(...xs) - Math.min(...xs) + KEY * 2.6, d = Math.max(...zs) - Math.min(...zs) + KEY * 2.2;
      const plateGeo = new THREE.PlaneGeometry(w, d); plateGeo.rotateX(-Math.PI / 2); parts.push(plateGeo);
      const plate = new THREE.Mesh(plateGeo, glow(0.16)); plate.position.y = -0.004;
      const rimGeo = new THREE.EdgesGeometry(plateGeo); parts.push(rimGeo);
      const rim = new THREE.LineSegments(rimGeo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      parts.push(rim.material); rim.position.y = -0.004;
      if (P.kb.style !== 'arc' && P.kb.style !== 'split') g.add(plate, rim);
      else for (const s of [1, -1]) {   // one plate per half for the split and the curve
        const half = layout.filter(k => (k[0] >= 0 ? 1 : -1) === s);
        const hx = half.reduce((a, k) => a + k[0], 0) / half.length, hz = half.reduce((a, k) => a + k[1], 0) / half.length;
        const pg = new THREE.PlaneGeometry(w / 2 - KEY * 0.4, d); pg.rotateX(-Math.PI / 2); parts.push(pg);
        const eg = new THREE.EdgesGeometry(pg); parts.push(eg);
        const pm = new THREE.Mesh(pg, plate.material), rm = new THREE.LineSegments(eg, rim.material);
        for (const o of [pm, rm]) { o.position.set(hx, -0.004, hz); o.rotation.y = half[0][4] || 0; g.add(o); }
      }
      const capGeo = new THREE.BoxGeometry(KEY * 0.8, 0.004, KEY * 0.8); parts.push(capGeo);
      const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); parts.push(capMat);
      const caps = new THREE.InstancedMesh(capGeo, capMat, layout.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V(), pos = new V(), up = new V(0, 1, 0);
      layout.forEach((k, i) => { caps.setMatrixAt(i, m4.compose(pos.set(k[0], 0, k[1]), q.setFromAxisAngle(up, k[4] || 0), sc.set(k[2] + (k[2] > 1 ? (k[2] - 1) * 0.25 : 0), 1, 1))); caps.setColorAt(i, c); });
      caps.frustumCulled = false; g.add(caps);
      g.rotation.x = -0.22;   // far edge up, like a real keyboard
      g.position.copy(kbAt); g.visible = false;
      group.add(g);
      kb = { group: g, caps, layout, base: c.clone(), flash: new Float32Array(layout.length), parts, mats: [plate.material, rim.material, capMat], op: [0.16, 0.9, 0.85] };
    }
    // where the board sits: under the fingertips at the bottom of a stroke
    function placeKb() {
      apply(typePose(0, [1, 1]));   // the bottom of a stroke: fingers on the keys
      group.updateMatrixWorld(true);
      const a = B.LeftHand.getWorldPosition(new V()), b = B.RightHand.getWorldPosition(new V());
      group.worldToLocal(a); group.worldToLocal(b);
      kbAt.copy(a).add(b).multiplyScalar(0.5).add(new V(0, -0.04, 0.07));
      // on a generated body, sit the keys just under the lowest fingertip of either hand at the bottom
      // of a stroke, so no finger goes through the board (the two hands don't hang at the same height)
      let mesh = null;
      if (isModel && built) built.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
      if (mesh) {
        // all in the operator's own space (it faces +z there), whatever way the scene turned it
        const pos = mesh.geometry.attributes.position, v = new V();
        let low = Infinity;
        for (let i = 0; i < pos.count; i++) {
          mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); group.worldToLocal(v);
          for (const h of [a, b]) if (v.z > h.z + 0.01 && v.distanceTo(h) < 0.14 && v.y < low) low = v.y;
        }
        if (isFinite(low)) kbAt.y = low - 0.012;
      }
    }
    const kc = new THREE.Color(), white = new THREE.Color(0xffffff);
    // The keyboard is the operator's weapon (Gid, 25 Nov), so it's always out: holstered upright at
    // the right hip between words, swung up in front of the hands to type. opts.unarmed hides it
    // between words as before.
    const HOLSTER = new V(-0.27, 0.93, 0.02), hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.25, 1.35)), kq = new THREE.Quaternion();
    let holsterT = 0;
    function kbTick(dt, typing, tt) {
      if (!kb) return;
      kbV += ((typing ? 1 : 0) - kbV) * Math.min(1, dt * 7);
      const armed = !opts.unarmed;
      kb.group.visible = armed || kbV > 0.02;
      if (!kb.group.visible) return;
      const k = smooth(kbV);
      holsterT += dt;
      const bob = Math.sin(holsterT * 2.2) * 0.012 * (1 - k);
      kb.group.position.copy(HOLSTER).setY(HOLSTER.y + bob).multiplyScalar(BASES[P.base].scale).lerp(kbAt, k);
      kb.group.quaternion.copy(kq.identity()).slerp(hq, armed ? 1 - k : 0);
      const sz = armed ? 0.55 + 0.45 * k : 1;
      kb.group.scale.set(sz * (0.7 + 0.3 * kbV), sz, sz * (0.85 + 0.15 * kbV));
      const vis = armed ? 0.55 + 0.45 * kbV : kbV;
      kb.mats.forEach((m, i) => { m.opacity = kb.op[i] * vis; });
      // a key lights under each stroke, on that hand's half of the board
      if (typing) {
        const st = strokes(tt);
        for (const h of [0, 1]) {
          if (st[h] > 0.85 && lastStroke[h] <= 0.85) {
            const pick = kb.layout.map((k, i) => (k[3] === h ? i : -1)).filter(i => i >= 0);
            kb.flash[pick[Math.floor(Math.random() * pick.length)]] = 1;
          }
          lastStroke[h] = st[h];
        }
      }
      for (let i = 0; i < kb.flash.length; i++) {
        kb.flash[i] *= Math.exp(-dt * 9);
        kc.copy(kb.base).multiplyScalar(0.55).lerp(white, kb.flash[i] * 0.7);
        kb.caps.setColorAt(i, kc);
      }
      kb.caps.instanceColor.needsUpdate = true;
    }

    const CHILD = { LeftArm: 'LeftForeArm', RightArm: 'RightForeArm', LeftForeArm: 'LeftHand', RightForeArm: 'RightHand',
      LeftUpLeg: 'LeftLeg', RightUpLeg: 'RightLeg', LeftLeg: 'LeftFoot', RightLeg: 'RightFoot' };
    let rest = {}, dirs = {}, straight = {}, legs = {};

    // ---------- applying a pose ----------
    const qT = new THREE.Quaternion(), dir = new V(), q0 = new THREE.Quaternion(), qw = new THREE.Quaternion(), X = new V(1, 0, 0);
    // a limb swings forward (about the body's side-to-side axis), then out toward its side, the way a
    // shoulder or hip moves; the shortest-arc turn used before spun a raised arm a quarter turn about
    // its own length, so the elbow bent toward the head and the wrist device ended up on the inside
    const qa = new THREE.Quaternion(), qf = new THREE.Quaternion(), qd = new THREE.Quaternion(), axs = new V(), sx = new V(), DOWN = new V(0, -1, 0);
    function limb(b, side, { flex = 0, abd = 0, twist = 0 }) {
      const f = flex * R, a = abd * R;
      qf.setFromAxisAngle(X, -f);
      dir.set(0, -Math.cos(f), Math.sin(f));
      qa.setFromAxisAngle(axs.copy(dir).cross(sx.set(side, 0, 0)).normalize(), a);
      b.quaternion.copy(qa).multiply(qf).multiply(qd.setFromUnitVectors(dirs[b.name], DOWN));
      if (twist) b.quaternion.multiply(qT.setFromAxisAngle(dirs[b.name], side * twist * R));   // mirrored, so + rolls either arm inward
    }
    function hinge(b, deg) { b.quaternion.setFromAxisAngle(X, deg * R).multiply(straight[b.name]); }
    function apply(p) {
      for (const n of ['Spine', 'Spine1', 'Spine2']) B[n].rotation.set(p.lean / 3 * R, p.twist / 3 * R, -p.side / 3 * R);
      B.Neck.rotation.set(p.nod * 0.4 * R, p.turn * 0.4 * R, -p.tilt * 0.4 * R);
      B.Head.rotation.set(p.nod * 0.6 * R, p.turn * 0.6 * R, -p.tilt * 0.6 * R);
      // the collarbone lifts once an arm goes past shoulder height, as a real shoulder does; the arm
      // keeps its direction, so only the shoulder line moves
      for (const [s, x, arm] of [['Left', 1, p.armL], ['Right', -1, p.armR]]) {
        const lift = Math.max(0, arm.flex - 70) * 0.25 + Math.max(0, arm.abd - 50) * 0.35;
        B[s + 'Shoulder'].rotation.set(0, 0, x * lift * R);
      }
      limb(B.LeftArm, 1, p.armL); limb(B.RightArm, -1, p.armR);
      B.LeftArm.quaternion.premultiply(q0.copy(B.LeftShoulder.quaternion).invert());
      B.RightArm.quaternion.premultiply(q0.copy(B.RightShoulder.quaternion).invert());
      hinge(B.LeftForeArm, -p.elbowL); hinge(B.RightForeArm, -p.elbowR);
      // pronation (+ turns the palm down) is shared by the forearm and the hand, as the radius rolls
      // along the whole forearm, so neither the elbow nor the wrist wrings like a towel
      for (const [s, x, pro, wr] of [['Left', 1, p.proL, p.wristL], ['Right', -1, p.proR, p.wristR]]) {
        const fa = B[s + 'ForeArm'], h = B[s + 'Hand'], ax = dirs[s + 'ForeArm'];
        if (pro) fa.quaternion.multiply(qT.setFromAxisAngle(ax, x * PRO_SIGN * pro * 0.6 * R));
        h.quaternion.setFromAxisAngle(ax, x * PRO_SIGN * (pro || 0) * 0.4 * R).multiply(q0.setFromAxisAngle(X, -wr * R));
      }
      limb(B.LeftUpLeg, 1, p.legL); limb(B.RightUpLeg, -1, p.legR);
      hinge(B.LeftLeg, p.kneeL); hinge(B.RightLeg, p.kneeR);
      // the lower foot sits on the floor: move the hips by the height the legs lost or gained against rest
      const reach = (L, l, kn) => { const f = l.flex * R, ab = l.abd * R; return (L.a * Math.cos(f) + L.c * Math.cos(kn * R - f)) * Math.cos(ab); };
      // a soft minimum of the two legs, so the hips glide instead of jumping when the feet swap
      const la = legs.Left.drop - reach(legs.Left, p.legL, p.kneeL), lb = legs.Right.drop - reach(legs.Right, p.legR, p.kneeR), k = 0.035;
      const lost = Math.min(la, lb) - k * Math.log(1 + Math.exp(-Math.abs(la - lb) / k));
      B.Hips.position.y = rest.Hips.y - lost;
      // feet stay level with the ground whatever the leg does
      group.updateMatrixWorld(true);
      group.getWorldQuaternion(qw);
      for (const s of ['Left', 'Right']) {
        const ft = B[s + 'Foot'];
        ft.parent.getWorldQuaternion(q0);
        ft.quaternion.copy(q0.invert().multiply(qw));
      }
    }

    rebuild();   // after the pose code above, since placing the keyboard poses the body once

    // ---------- playing ----------
    let anim = 'idle', t = 0, prev = null, blend = 1, once = null;
    function poseAt(name, tt) { return (A[name] || A.idle)(tt); }
    function frame() {
      let p = poseAt(anim, t);
      if (prev && blend < 1) p = mixPose(poseAt(prev.name, prev.t), p, ease(blend));
      if (once) {
        const r = A[once.name](once.t), len = ONCE_LEN[once.name];
        // the cast eases in over 0.2 s and back to idle over its last 0.45 s
        const w = once.name === 'hit' ? Math.sin(clamp(once.t / len, 0, 1) * Math.PI) : Math.min(smooth(once.t / 0.2), 1 - smooth((once.t - (len - 0.45)) / 0.45));
        p = mixPose(p, r.pose, clamp(w, 0, 1));
      }
      apply(p);
    }
    const ctl = {
      group, get bones() { return B; }, get preset() { return JSON.parse(JSON.stringify(P)); },
      height: () => 1.8 * BASES[P.base].scale * (1 + 0.04 * P.body.height),
      get model() { return isModel; },
      // where shots leave from: the keyboard, its weapon
      kbWorld(out) { if (!kb || !kb.group.visible) return null; return kb.group.getWorldPosition(out); },
      play(name) { if (!A[name] || ONCE_LEN[name] || name === anim) return; prev = { name: anim, t }; anim = name; t = 0; blend = 0; },
      once(name) { if (ONCE_LEN[name]) once = { name, t: 0 }; },
      update(dt) {
        t += dt; if (prev) { prev.t += dt; blend = Math.min(1, blend + dt / 0.25); if (blend >= 1) prev = null; }
        if (once) { once.t += dt; if (once.t > ONCE_LEN[once.name]) once = null; }
        frame();
        kbTick(dt, anim === 'type', t);
      },
      // hold one moment: an animation, or a one-shot at time tt over idle
      at(name, tt) {
        prev = null; once = null;
        if (ONCE_LEN[name]) { anim = 'idle'; t = tt; once = { name, t: tt }; } else { anim = name; t = tt; }
        frame();
        kbV = anim === 'type' ? 0.98 : 0; lastStroke = [1, 1]; kbTick(1 / 60, anim === 'type', t);
      },
      set(next) {
        const n = clean(next), rebuildNeeded = n.base !== P.base, kbChanged = n.kb.style !== P.kb.style || n.kb.color !== P.kb.color;
        P = n;
        if (rebuildNeeded || !isModel !== !model()) rebuild(); else { paint(); showAcc(); shape(); if (kbChanged) buildKb(); }
        if (!opts.tiny && MODELS[P.base]) { live.add(ctl); loadModels(THREE); }
        frame();
      },
      repaint() { paint(); if (P.kb.color === 'theme') buildKb(); },
      dispose() { live.delete(ctl); if (built) group.remove(built); while (owned.length) owned.pop().dispose(); if (kb) kb.parts.forEach(x => x.dispose()); },
      // tests: hold an exact pose given in body terms, missing parts filled from a blank pose
      _pose(p) { prev = null; once = null; const b = BLANK(); for (const k in p) b[k] = typeof p[k] === 'object' ? { ...b[k], ...p[k] } : p[k]; apply(b); },
      // the model for this base finished loading: rebuild on it, keeping the animation where it was
      _upgrade() { if (!isModel && model()) { rebuild(); frame(); if (opts.onModel) opts.onModel(); } },
    };
    frame();
    if (!opts.tiny && MODELS[P.base]) { live.add(ctl); loadModels(THREE); }
    return ctl;
  }

  // ---------- other players ----------
  // a look for someone else, the same every time for the same id
  const PAL = {
    skin: ['#f1c9a8', '#d9a982', '#c49477', '#a7774f', '#7d5536', '#5a3b26'],
    hair: ['#1b1512', '#2b211b', '#4a3222', '#8a5a33', '#d4b66e', '#e8e2d8', '#7a2d2d'],
    jacket: ['#1d2638', '#26282b', '#3a3f2c', '#3b2a22', '#1f3330', '#2b2235', '#4a4f55'],
    shirt: ['#2f2b26', '#3a3a3a', '#1d2a24', '#4a3b2b', '#d8d6d0'],
    pants: ['#16181b', '#22262c', '#2d3326', '#2a3442', '#3a3530'],
  };
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function random(seed) {
    let x = hash(seed) || 1;
    const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(r() * a.length)];
    const p = defaults(r() < 0.5 ? 'male' : 'female');
    for (const z of Object.keys(PAL)) p.colors[z] = pick(PAL[z]);
    p.colors.beanie = pick(['#3c3d2e', '#26282b', '#5a2b2b', '#2b3a4a']);
    p.kb = { style: pick(KB_STYLES)[0], color: r() < 0.5 ? 'theme' : pick(['#39ff88', '#4fd8ff', '#ff4fd8', '#ffb84f', '#b48cff', '#ff5a5a']) };
    p.acc.beanie = r() < 0.5; p.acc.visor = r() < 0.7; p.acc.mask = r() < 0.25; p.acc.harness = r() < 0.6; p.acc.pouches = r() < 0.7;
    return p;
  }
  // the player's own look from the Character Lab
  // gear sold in the shop (REWARDS.shop.gear) only shows on your operator once you own it
  function locked(P) {
    const G = (window.REWARDS && REWARDS.shop && REWARDS.shop.gear) || [];
    const has = id => !window.WPM || WPM.owns(id);
    for (const g of G) {
      if (g.acc && P.acc[g.acc] && !has(g.id)) P.acc[g.acc] = false;
      if (g.kb && P.kb.style === g.kb && !has(g.id)) P.kb.style = 'slab';
    }
    return P;
  }
  function mine() { try { return locked(clean(TT.store.get('wpm-operator', null) || defaults('male'))); } catch (e) { return defaults('male'); } }

  // A crowd of n operators as one draw call: a light stand-in posed once, merged into one mesh with
  // its zone colours baked in, and instanced. Each copy gets its own tint. For the World Boss raid.
  function crowd(THREE, n, opts = {}) {
    const parts = [];
    for (const base of ['male', 'female']) {
      const op = create(THREE, { ...defaults(base), acc: { beanie: base === 'male', visor: true, scarf: true, mask: false, wrist: false, pouches: false, harness: true } }, { tiny: true });
      op.at('idle', 0.4);
      op.group.updateMatrixWorld(true);
      const pos = [], nor = [], col = [];
      const c = new THREE.Color();
      op.group.traverse(m => {
        if (!m.isMesh || !m.visible || !m.geometry) return;
        let vis = true; for (let o = m; o; o = o.parent) if (!o.visible) vis = false;
        if (!vis) return;
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
        const mt = m.material;
        c.copy(mt.emissive && mt.emissiveIntensity > 1 ? mt.emissive : mt.color);
        const P = g.attributes.position.array, N = g.attributes.normal.array;
        for (let i = 0; i < P.length; i += 3) { pos.push(P[i], P[i + 1], P[i + 2]); nor.push(N[i], N[i + 1], N[i + 2]); col.push(c.r, c.g, c.b); }
        g.dispose();
      });
      op.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      parts.push(geo);
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const meshes = parts.map(g => { const m = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.count = 0; return m; });
    return { meshes, dispose() { parts.forEach(g => g.dispose()); mat.dispose(); meshes.forEach(m => m.dispose && m.dispose()); } };
  }

  return { create, defaults, clean, random, mine, locked, crowd, loadModels, MODELS, KB_STYLES, ZONES, ACCESSORIES, ANIMS, ONCE, BASES, ONCE_LEN };
})();
