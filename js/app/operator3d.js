// Operators: the player characters in 3D. One rig, two bases (male and female), colour zones,
// accessories on bones and animations made in code, all set from a preset:
//
//   const op = Operator.create(THREE, preset, { lite })   preset: see Operator.defaults(base)
//   scene.add(op.group); op.play('type'); op.once('cast'); each frame op.update(dt)
//   op.set(preset)   recolour and swap accessories in place (same base) or rebuild (new base)
//   op.at(name, t)   hold one moment of an animation, for stills and tests
//   op.dispose()
//
// Until the generated models arrive (Higgsfield, 2026-11-24 plan) each base is a stand-in mannequin
// built here, on the same skeleton the models will be fitted to. Bones follow the usual humanoid
// names (Hips, Spine, LeftArm...), the character faces +z and its left side is +x.
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
    };
  }
  // a saved or pasted preset with anything missing filled from the base's defaults
  function clean(p) {
    const base = p && BASES[p.base] ? p.base : 'male', d = defaults(base);
    const hex = v => (typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || v === 'theme') ? v : null);
    const colors = {}, acc = {};
    for (const [z] of ZONES) colors[z] = hex(p && p.colors && p.colors[z]) || d.colors[z];
    for (const [a] of ACCESSORIES) acc[a] = p && p.acc && typeof p.acc[a] === 'boolean' ? p.acc[a] : d.acc[a];
    return { v: 1, base, colors, acc };
  }

  const R = Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

  // ---------- poses, in degrees ----------
  // lean: spine forward; side: toward the character's left; twist: chest turned to its left
  // arm/leg: { flex: forward, abd: out to its side, twist }; elbow and knee: bend; wrist: bend forward
  const BLANK = () => ({ lean: 0, side: 0, twist: 0, nod: 0, turn: 0, tilt: 0,
    armL: { flex: 0, abd: 0, twist: 0 }, armR: { flex: 0, abd: 0, twist: 0 }, elbowL: 0, elbowR: 0, wristL: 0, wristR: 0,
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
      p.legL = { flex: 24 * s, abd: 3 }; p.legR = { flex: -24 * s, abd: 3 };
      p.kneeL = 6 + 50 * Math.max(0, c); p.kneeR = 6 + 50 * Math.max(0, -c);
      p.armL = { flex: -18 * s, abd: 8, twist: 0 }; p.armR = { flex: 18 * s, abd: 8, twist: 0 };
      p.elbowL = 16 + 14 * Math.max(0, -s); p.elbowR = 16 + 14 * Math.max(0, s); p.wristL = p.wristR = 5;
      return p;
    },
    type(t) {
      // standing at a terminal: forearms level, hands on the keys, quick strokes from each hand
      const p = BLANK(), kl = Math.max(0, Math.sin(t * 17)), kr = Math.max(0, Math.sin(t * 19 + 1.3));
      p.lean = 9; p.nod = 16 + Math.sin(t * 2.1) * 2; p.turn = Math.sin(t * 0.8) * 4;
      p.armL = { flex: 36 + kl * 3, abd: 14, twist: 0 }; p.armR = { flex: 36 + kr * 3, abd: 14, twist: 0 };
      p.elbowL = 80 - kl * 6; p.elbowR = 80 - kr * 6; p.wristL = -8 + kl * 10; p.wristR = -8 + kr * 10;
      p.legL = { flex: 3, abd: 5 }; p.legR = { flex: -1, abd: 5 }; p.kneeL = p.kneeR = 6;
      return p;
    },
    victory(t) {
      const p = BLANK(), b = Math.abs(Math.sin(t * 4));
      p.lean = -6; p.nod = -16; p.turn = Math.sin(t * 2) * 6;
      p.armL = { flex: 150, abd: 32, twist: 0 }; p.armR = { flex: 150, abd: 32, twist: 0 };
      p.elbowL = p.elbowR = 22 + b * 10; p.wristL = p.wristR = -10;
      p.legL = { flex: 4 + b * 10, abd: 6 }; p.legR = { flex: 4 + b * 10, abd: 6 }; p.kneeL = p.kneeR = 6 + b * 22;
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
      const p = A.idle(t), wind = ease(t / 0.32), strike = ease((t - 0.32) / 0.14);
      const w = mixPose(BLANK(), { ...BLANK(), lean: 2, twist: -22, nod: -4, turn: 14,
        armR: { flex: -28, abd: 34, twist: 0 }, elbowR: 70, wristR: 10, armL: { flex: 30, abd: 12, twist: 0 }, elbowL: 72,
        legL: { flex: 8, abd: 6 }, legR: { flex: -10, abd: 6 }, kneeL: 10, kneeR: 8 }, wind);
      const s = { ...BLANK(), lean: 10, twist: 20, nod: 2, turn: -12,
        armR: { flex: 86, abd: 6, twist: 0 }, elbowR: 6, wristR: -6, armL: { flex: 24, abd: 16, twist: 0 }, elbowL: 64,
        legL: { flex: 16, abd: 6 }, legR: { flex: -14, abd: 6 }, kneeL: 14, kneeR: 6 };
      return { pose: strike > 0 ? mixPose(w, s, strike) : w, len: 0.95, base: p };
    },
    hit(t) {
      const p = { ...BLANK(), lean: -14, side: 5, nod: -18, turn: 8,
        armL: { flex: 26, abd: 22, twist: 0 }, armR: { flex: 30, abd: 18, twist: 0 }, elbowL: 62, elbowR: 70,
        legL: { flex: 6, abd: 6 }, legR: { flex: -8, abd: 6 }, kneeL: 14, kneeR: 10 };
      return { pose: p, len: 0.5, base: A.idle(t) };
    },
  };
  const ONCE_LEN = { cast: 0.95, hit: 0.5 };

  function create(THREE, preset, opts = {}) {
    const V = THREE.Vector3;
    let P = clean(preset);
    const lite = !!opts.lite || !!opts.tiny;
    const seg = opts.tiny ? 4 : lite ? 6 : 12;   // tiny: the far-away crowd
    const group = new THREE.Group();
    const owned = [];
    const own = x => (owned.push(x), x);
    let B = {}, mats = {}, accs = {}, built = null;

    // ---------- materials, one set per character so two operators can differ ----------
    function mat(zone) {
      if (zone === 'glow') return own(new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.4 }));
      const rough = { skin: 0.62, hair: 0.85, jacket: 0.74, shirt: 0.9, pants: 0.8, boots: 0.5, gloves: 0.6, straps: 0.7, beanie: 0.95, scarf: 0.85 }[zone] ?? 0.8;
      return own(new THREE.MeshStandardMaterial({ roughness: rough, metalness: zone === 'boots' ? 0.15 : 0 }));
    }
    function paint() {
      for (const [z] of ZONES) {
        const v = P.colors[z], m = mats[z];
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

    function build() {
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
      compact(built);
      group.add(built);
      paint(); showAcc();
      rest = {}; for (const n in B) rest[n] = B[n].position.clone();
    }
    let rest = {};
    rebuild();

    // ---------- applying a pose ----------
    const DOWN = new V(0, -1, 0), qT = new THREE.Quaternion(), dir = new V(), q0 = new THREE.Quaternion(), qw = new THREE.Quaternion();
    const S = () => BASES[P.base];
    function limb(b, side, { flex = 0, abd = 0, twist = 0 }) {
      const f = flex * R, a = abd * R;
      dir.set(side * Math.sin(a), -Math.cos(a) * Math.cos(f), Math.cos(a) * Math.sin(f)).normalize();
      b.quaternion.setFromUnitVectors(DOWN, dir);
      if (twist) b.quaternion.multiply(qT.setFromAxisAngle(DOWN, -twist * R));
    }
    function apply(p) {
      const k = S().scale;
      for (const n of ['Spine', 'Spine1', 'Spine2']) B[n].rotation.set(p.lean / 3 * R, p.twist / 3 * R, -p.side / 3 * R);
      B.Neck.rotation.set(p.nod * 0.4 * R, p.turn * 0.4 * R, -p.tilt * 0.4 * R);
      B.Head.rotation.set(p.nod * 0.6 * R, p.turn * 0.6 * R, -p.tilt * 0.6 * R);
      limb(B.LeftArm, 1, p.armL); limb(B.RightArm, -1, p.armR);
      B.LeftForeArm.rotation.set(-p.elbowL * R, 0, 0); B.RightForeArm.rotation.set(-p.elbowR * R, 0, 0);
      B.LeftHand.rotation.set(-p.wristL * R, 0, 0); B.RightHand.rotation.set(-p.wristR * R, 0, 0);
      limb(B.LeftUpLeg, 1, p.legL); limb(B.RightUpLeg, -1, p.legR);
      B.LeftLeg.rotation.set(p.kneeL * R, 0, 0); B.RightLeg.rotation.set(p.kneeR * R, 0, 0);
      // the lower foot sits on the floor: drop the hips by what the bent legs lost in height
      const a = 0.43 * k, c = 0.42 * k;
      const reach = (l, kn) => { const f = l.flex * R, ab = l.abd * R; return (a * Math.cos(f) + c * Math.cos(kn * R - f)) * Math.cos(ab); };
      const lost = (a + c) - Math.max(reach(p.legL, p.kneeL), reach(p.legR, p.kneeR));
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

    // ---------- playing ----------
    let anim = 'idle', t = 0, prev = null, blend = 1, once = null;
    function poseAt(name, tt) { return (A[name] || A.idle)(tt); }
    function frame() {
      let p = poseAt(anim, t);
      if (prev && blend < 1) p = mixPose(poseAt(prev.name, prev.t), p, ease(blend));
      if (once) {
        const r = A[once.name](once.t), len = ONCE_LEN[once.name];
        const w = once.name === 'hit' ? Math.sin(clamp(once.t / len, 0, 1) * Math.PI) : (once.t < len - 0.3 ? 1 : 1 - ease((once.t - (len - 0.3)) / 0.3));
        p = mixPose(p, r.pose, clamp(once.name === 'cast' ? Math.min(w, ease(once.t / 0.12)) : w, 0, 1));
      }
      apply(p);
    }
    const ctl = {
      group, get bones() { return B; }, get preset() { return JSON.parse(JSON.stringify(P)); },
      height: () => 1.8 * S().scale,
      play(name) { if (!A[name] || ONCE_LEN[name] || name === anim) return; prev = { name: anim, t }; anim = name; t = 0; blend = 0; },
      once(name) { if (ONCE_LEN[name]) once = { name, t: 0 }; },
      update(dt) {
        t += dt; if (prev) { prev.t += dt; blend = Math.min(1, blend + dt / 0.25); if (blend >= 1) prev = null; }
        if (once) { once.t += dt; if (once.t > ONCE_LEN[once.name]) once = null; }
        frame();
      },
      // hold one moment: an animation, or a one-shot at time tt over idle
      at(name, tt) {
        prev = null; once = null;
        if (ONCE_LEN[name]) { anim = 'idle'; t = tt; once = { name, t: tt }; } else { anim = name; t = tt; }
        frame();
      },
      set(next) {
        const n = clean(next), rebuildNeeded = n.base !== P.base;
        P = n;
        if (rebuildNeeded) rebuild(); else { paint(); showAcc(); }
        frame();
      },
      repaint() { paint(); },
      dispose() { if (built) group.remove(built); while (owned.length) owned.pop().dispose(); },
    };
    frame();
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
    p.acc.beanie = r() < 0.5; p.acc.visor = r() < 0.7; p.acc.mask = r() < 0.25; p.acc.harness = r() < 0.6; p.acc.pouches = r() < 0.7;
    return p;
  }
  // the player's own look from the Character Lab
  function mine() { try { return clean(TT.store.get('wpm-operator', null) || defaults('male')); } catch (e) { return defaults('male'); } }

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

  return { create, defaults, clean, random, mine, crowd, ZONES, ACCESSORIES, ANIMS, ONCE, BASES, ONCE_LEN };
})();
