// The Packet Leviathan (sb-scene.js mounts it): a sea serpent of armoured packet segments that arcs in
// and out of an open sea under a storm. Data runs down its spine as light.
//   body        28 segments on a rope: each hangs from the one in front and leans toward its place on the
//               swim loop, so the head can rear, strike and dive while the body follows it like a real
//               serpent. Every segment has scutes, belly plates, a dorsal spine, a seam band and flank
//               lights; fins on every third one. The water ripples, foams and sprays where it crosses
//   weak point  the segment facing Art opens four plates round a white core; the decoy opens on a red one
//   lunge       swims up in front of Art, rears back with its jaws filling with light, then strikes:
//               the jaws close on Art's bot, or slam into the barrier and rebound
//   breach      (phase 2 on) dives, the sea boils under Art, then it bursts up in a column of water and
//               bites down on Art or the barrier, and falls back into the sea
//   tail sweep  (phase 3) the tail rises out of the sea beside Art and sweeps through him, or stops on
//               the barrier and rebounds
//   spit        the jaws open and packets fly one after another to Art; typed ones fly back into its face
// Lures on its brow, gills and flank lights pulse at rest, it breathes, blinks and tracks Art.
// Phase 2 turns its lures and spines gold and stirs the sea; phase 3 cracks its armour with light and
// raises its spines. Phase breaks make it rear up and roar under lightning. On the kill it thrashes,
// the segments burst from the tail up and the head falls into the sea.
window.SuperModels = window.SuperModels || {};
SuperModels.leviathan = function (THREE, K, ctx) {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const { C, clamp, rnd } = K;
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = x => Math.pow(clamp(x, 0, 1), 2.2);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const art = ctx.artPos;
  const G = K.geo;
  const sfx = (n, a) => ctx.sfx(n, a);
  const want = (n, x) => { if (ctx.want) ctx.want(n, x); };
  const group = new THREE.Group(), props = new THREE.Group();

  // ---------- materials ----------
  const plateMat = K.armor({ env: 0.35, color: '#27313a', seam: '#3ee6ff', seamK: 1.0, rim: '#3ee6ff', rimK: 0.45, metal: 0.8, rough: 0.36, scale: 1.7, density: 0.4 });
  const bellyMat = K.armor({ color: '#46525a', seam: '#3ee6ff', seamK: 0.35, rim: '#3ee6ff', rimK: 0.2, metal: 0.5, rough: 0.45, scale: 2.4, density: 0.2 });
  const finMat = K.armor({ color: '#162026', seam: '#39ffd2', seamK: 0.7, rim: '#39ffd2', rimK: 0.6, metal: 0.55, rough: 0.4, scale: 2.2, density: 0.3 });
  finMat.side = THREE.DoubleSide;
  const headMat = K.armor({ color: '#232c34', seam: '#3ee6ff', seamK: 1.0, rim: '#3ee6ff', rimK: 0.45, metal: 0.85, rough: 0.28, scale: 0.9, density: 0.35 });
  const toothMat = K.own(new THREE.MeshStandardMaterial({ color: '#d5dde0', metalness: 0.3, roughness: 0.35, flatShading: true }));
  const glowMat = K.own(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }));
  const eyeMat = K.glow('#ff3b46', 4), eyeHot = K.glow('#ffffff', 4);
  const gillMat = K.glow('#3ee6ff', 1.6), lureMat = K.glow('#39ff88', 3), lureHalo = K.shellMat('#39ff88', 0.8);
  const throatMat = K.own(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 0.6), toneMapped: false }));
  const mawMat = K.own(new THREE.MeshBasicMaterial({ color: '#05080a' }));

  // ---------- geometry helpers ----------
  // plates laid on a segment's surface: angle a round its axis (0 is the back), tilted so the back edge lifts
  const onRing = (g, a, rad, y, tilt) => [g, [Math.sin(a) * rad, y, Math.cos(a) * rad], [-tilt, a, 0, 'YXZ']];
  const lathe = (pts, n) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n); const x = g.toNonIndexed(); g.dispose(); x.computeVertexNormals(); return G.own(x); };
  // narrow a shape toward +x (fins)
  function taperX(g, len, f, sweep = 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = clamp(p.getX(i) / len, 0, 1); p.setY(i, p.getY(i) * (1 + (f - 1) * u) - sweep * u * u); }
    g.computeVertexNormals(); return g;
  }

  // ---------- one body segment, in its own frame: +y toward the head, +z the back, x the flanks ----------
  // Unit radius, 1.5 long. The rope stretches each one to reach the next, so they overlap a little.
  const segCore = lathe([[0.55, -0.75], [0.93, -0.56], [1.02, -0.22], [1.0, 0.22], [0.86, 0.58], [0.62, 0.75]], 12);
  const plate = (w, h, d = 0.15) => G.cbox(w, h, d, 0.05, 1, 1);
  const segArmor = G.merge([
    [segCore],
    onRing(plate(1.15, 1.05, 0.18), 0, 1.0, 0.0, 0.2), onRing(plate(0.7, 0.6, 0.14), 0, 1.08, 0.42, 0.28),
    onRing(plate(0.95, 1.0), 0.85, 1.0, 0.02, 0.18), onRing(plate(0.95, 1.0), -0.85, 1.0, 0.02, 0.18),
    onRing(plate(0.85, 0.95), 1.7, 0.98, 0.05, 0.16), onRing(plate(0.85, 0.95), -1.7, 0.98, 0.05, 0.16),
    // a lip at the back edge, so each segment reads as a ring overlapping the next
    [G.own(new THREE.TorusGeometry(0.9, 0.07, 4, 12)), [0, -0.62, 0], [Math.PI / 2, 0, 0]],
  ]);
  const segBelly = G.merge([
    onRing(plate(0.8, 0.5, 0.12), 2.45, 0.96, -0.24, 0.1), onRing(plate(0.8, 0.5, 0.12), -2.45, 0.96, -0.24, 0.1), onRing(plate(0.9, 0.5, 0.12), Math.PI, 0.98, -0.24, 0.1),
    onRing(plate(0.8, 0.5, 0.12), 2.45, 0.96, 0.28, 0.1), onRing(plate(0.8, 0.5, 0.12), -2.45, 0.96, 0.28, 0.1), onRing(plate(0.9, 0.5, 0.12), Math.PI, 0.98, 0.28, 0.1),
  ]);
  const segGlow = (() => {
    const p = [[G.own(new THREE.CylinderGeometry(1.035, 1.035, 0.07, 12, 1, true)), [0, -0.48, 0]], [G.cbox(0.07, 1.1, 0.05, 0.02), [0, 0.0, 1.2], [0.2, 0, 0]]];
    for (const sd of [-1, 1]) for (const y of [-0.3, 0.05, 0.38]) p.push([G.own(new THREE.OctahedronGeometry(0.075, 0)), [Math.sin(sd * 1.28) * 1.04, y, Math.cos(sd * 1.28) * 1.04]]);
    return G.merge(p);
  })();
  const spineGeo = G.merge([[G.horn(1.7, 0.2, -0.9, 5, 5), [0, 0, 0]], [G.horn(0.8, 0.12, -0.6, 4, 3), [0, -0.45, -0.05], [0, 0, 0]]]);
  const finGeo = (() => {
    const mem = taperX(G.cbox(2.2, 1.4, 0.05, 0.02, 1, 1, 1).translate(1.1, -0.35, 0), 2.2, 0.25, 0.9);
    const ribs = [0, 1, 2].map(k => [G.horn(2.3 - k * 0.35, 0.09, 0.2, 4, 4), [0, 0.2 - k * 0.32, 0], [0, Math.PI / 2, -0.15 - k * 0.32, 'ZYX']]);
    return G.merge([[mem], ...ribs]);
  })();
  const flukeGeo = (() => {
    const blade = sd => { const g = G.cbox(0.12, 1.6, 3.4, 0.04, 1, 1, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i) + 1.7, u = z / 3.4; p.setZ(i, sd * z); p.setY(i, p.getY(i) * (1 - u * 0.8) - u * u * 2.4); } g.computeVertexNormals(); return g; };
    return G.merge([[blade(1)], [blade(-1)], [G.cbox(0.16, 2.4, 0.6, 0.06, 1, 1), [0, -0.8, 0]]]);
  })();

  // ---------- the body ----------
  const SEG = 28, GAPU = 0.165;
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); return m; };
  const segs = inst(segArmor, plateMat, SEG), bellies = inst(segBelly, bellyMat, SEG), glows = inst(segGlow, glowMat, SEG);
  const spines = inst(spineGeo, finMat, SEG), fins = inst(finGeo, finMat, SEG * 2);
  glows.setColorAt(0, new THREE.Color()); glows.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const fluke = new THREE.Mesh(flukeGeo, finMat); fluke.matrixAutoUpdate = false; group.add(fluke);
  const flukeEdge = new THREE.Mesh(G.merge([[G.cbox(0.05, 0.08, 3.2, 0.02), [0, -1.25, 1.75], [0.62, 0, 0]], [G.cbox(0.05, 0.08, 3.2, 0.02), [0, -1.25, -1.75], [-0.62, 0, 0]]]), lureMat);
  fluke.add(flukeEdge);

  // ---------- the head: +z forward, +y up ----------
  const HS = 1.5;
  const head = new THREE.Group(); group.add(head);
  const skull = new THREE.Group(); skull.scale.setScalar(HS); head.add(skull);
  const lures = [];
  {
    const p = [];
    p.push([G.rock(1.7, 1, 0.07, 1.1, 0.75, 1.25, 4), [0, 0.5, -0.4]]);
    p.push([G.taperZ(G.rock(1.4, 1, 0.05, 0.85, 0.45, 2.2, 2), 6, 0.55, 0.65, 0.3), [0, 0.45, 2.4]]);
    p.push([G.taperZ(G.cbox(0.9, 0.3, 4.4, 0.1), 4.4, 0.4, 0.8, 0.25), [0, 1.1, 2.0], [0.08, 0, 0]]);
    // scutes over the skull, overlapping back to front
    for (let i = 0; i < 4; i++) p.push([G.cbox(1.3 - i * 0.12, 0.16, 1.0, 0.06, 0.8, 1), [0, 1.36 - i * 0.02, 0.5 - i * 0.75], [0.12 + i * 0.05, 0, 0]]);
    for (let i = 0; i < 3; i++) p.push([G.horn(0.5 - i * 0.08, 0.09, 0.3, 4, 2), [0, 1.2 - i * 0.06, 2.6 + i * 0.8], [-1.0, 0, 0]]);   // nose studs
    for (const sd of [-1, 1]) {
      p.push([G.horn(4.2, 0.5, 0.6, 5, 6), [sd * 1.0, 1.2, -0.8], [-0.35, Math.PI + sd * 0.35, sd * 0.15]]);   // swept horns
      p.push([G.horn(2.4, 0.3, 0.3, 4, 4), [sd * 1.5, 0.2, -1.0], [0.1, Math.PI + sd * 0.7, 0]]);
      p.push([G.taperZ(G.cbox(0.16, 1.8, 2.4, 0.05, 0.4, 1), 2.4, 0.5, 1, 0), [sd * 1.45, 0.6, -1.4], [0, sd * 0.45, sd * 0.5]]);   // gill fins
      p.push([G.horn(1.8, 0.28, 0.2, 4, 3), [sd * 0.75, 1.3, 1.4], [-0.5, Math.PI + sd * 0.25, 0]]);   // brow
      p.push([G.taperZ(G.cbox(0.22, 0.75, 1.6, 0.06), 1.6, 0.7, 0.6, 0), [sd * 1.22, 0.32, 0.7], [0, sd * 0.2, 0]]);   // cheek plate
      p.push([G.cbox(0.3, 0.2, 0.45, 0.05), [sd * 0.36, 0.92, 4.4], [0.3, 0, 0]]);   // nostril
    }
    for (let i = 0; i < 4; i++) p.push([G.taperZ(G.cbox(0.14, 1.4 - i * 0.2, 1.4, 0.04, 0.3, 1), 1.4, 0.4, 1, 0), [0, 1.6 - i * 0.05, -0.6 - i * 0.9], [-0.4, 0, 0]]);   // crest
    skull.add(new THREE.Mesh(G.merge(p), headMat));
    const t = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 8; i++) { const z = 1.0 + i * 0.55, w = 1.05 - i * 0.09; t.push([G.tooth(i === 6 ? 1.0 : 0.5, i === 6 ? 0.16 : 0.1), [sd * w, -0.1 - z * 0.03, z]]); }
    skull.add(new THREE.Mesh(G.merge(t), toothMat));
    // gill slits glow on the cheeks; the gills pulse as it breathes
    const gl = [];
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) gl.push([G.cbox(0.06, 0.62 - k * 0.08, 0.1, 0.02), [sd * 1.36, 0.25, -0.55 - k * 0.32], [0, sd * 0.35, 0]]);
    skull.add(new THREE.Mesh(G.merge(gl), gillMat));
    // the roof of the mouth, dark, with the throat's glow along it
    skull.add(new THREE.Mesh(G.taperZ(G.cbox(1.6, 0.08, 4.4, 0.03), 4.4, 0.5, 1, 0.2), mawMat).translateY(-0.05).translateZ(2.4));
    const throat = new THREE.Mesh(G.taperZ(G.cbox(1.1, 0.1, 4, 0.04), 4, 0.5, 1, 0.2), throatMat); throat.position.set(0, -0.15, 2.2); skull.add(throat);
    // lures: two stalks from the brow with glowing bulbs, swaying on their own
    for (const sd of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sd * 0.55, 1.45, 0.9); skull.add(g);
      const len = 3.6, bend = -1.1;
      const stalk = new THREE.Mesh(G.horn(len, 0.11, bend, 5, 8), headMat); g.add(stalk);
      const tip = new V(0, (1 - Math.cos(bend)) / bend * len, Math.sin(bend) / bend * len);
      const bulb = new THREE.Mesh(G.own(new THREE.IcosahedronGeometry(0.26, 1)), lureMat); bulb.position.copy(tip); g.add(bulb);
      const halo = new THREE.Mesh(G.own(new THREE.IcosahedronGeometry(0.42, 2)), lureHalo); bulb.add(halo);
      lures.push({ g, sd, bulb, halo, sw: 0, swV: 0 });
    }
    const eyes = [];
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(G.own(new THREE.OctahedronGeometry(0.32, 0)), eyeMat); e.scale.set(1.6, 0.6, 1); e.position.set(sd * 1.0, 0.95, 1.5); e.rotation.set(0, sd * 0.5, sd * -0.3); skull.add(e); eyes.push(e); }
    skull.userData.eyes = eyes;
  }
  const eyes = skull.userData.eyes;
  const jaw = new THREE.Group(); jaw.position.set(0, -0.35, -0.2); skull.add(jaw);
  {
    const p = [[G.taperZ(G.cbox(1.9, 0.5, 5.4, 0.12), 5.4, 0.45, 0.7, -0.1), [0, -0.25, 2.5]]];
    for (const sd of [-1, 1]) {
      p.push([G.horn(1.6, 0.22, -0.3, 4, 3), [sd * 0.9, -0.5, 0.2], [0.4, Math.PI + sd * 0.5, 0]]);
      p.push([G.horn(2.6, 0.1, -1.1, 4, 6), [sd * 0.6, -0.45, 3.6], [1.2, sd * 0.25, 0]]);   // barbels
      p.push([G.cbox(0.2, 0.36, 2.6, 0.05), [sd * 0.92, -0.15, 2.0], [0, sd * 0.06, 0]]);   // jaw plates
    }
    jaw.add(new THREE.Mesh(G.merge(p), headMat));
    const t = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) t.push([G.tooth(0.45, 0.09), [sd * (0.75 - i * 0.08), 0.12, 0.8 + i * 0.6], [Math.PI, 0, 0]]);
    jaw.add(new THREE.Mesh(G.merge(t), toothMat));
    jaw.add(new THREE.Mesh(G.taperZ(G.cbox(1.2, 0.06, 3.8, 0.02), 3.8, 0.5, 1, 0), throatMat).translateY(0.02).translateZ(2.3));
  }
  const MOUTH = new V(0, -0.45, 5.4).multiplyScalar(HS);   // between the jaws, in the head's frame
  const SOCKET = new V(0, 0.4, -1.9).multiplyScalar(HS);   // where the neck joins

  // ---------- the weak point and the decoy: four plates open round a core ----------
  function opener(coreHex) {
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.visible = false; group.add(g);
    const core = new THREE.Mesh(G.own(new THREE.IcosahedronGeometry(0.5, 1)), K.glow(coreHex, 3)); core.position.set(0, 0, 1.05); g.add(core);
    const halo = new THREE.Mesh(G.own(new THREE.IcosahedronGeometry(0.85, 2)), K.shellMat(coreHex, 1.4)); core.add(halo);
    // a soft column of light out of the open plates
    const beams = new THREE.Mesh(G.own(new THREE.CylinderGeometry(0.55, 0.2, 2.6, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.3)), K.shellMat(coreHex, 0.9));
    beams.position.set(0, 0, 1.05); g.add(beams);
    const petals = [0, 1, 2, 3].map(k => {
      const piv = new THREE.Object3D(); piv.position.set(Math.cos(k * Math.PI / 2 + Math.PI / 4) * 0.25, Math.sin(k * Math.PI / 2 + Math.PI / 4) * 0.25, 1.12); g.add(piv);
      const m = new THREE.Mesh(G.cbox(0.8, 0.7, 0.12, 0.04, 1, 1), plateMat); m.position.set(0.38, 0, 0); piv.add(m);
      return { piv, a: k * Math.PI / 2 + Math.PI / 4 };
    });
    return { g, core, halo, beams, petals, open: 0, i: -1, mat: core.material, hex: coreHex };
  }
  const weakR = opener('#ffffff'), decoyR = opener('#ff4d5e');

  // ---------- the sea: ripples and foam where the body crosses it ----------
  const NR = 48;
  const ripGeo = G.own(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
  const aAge = new Float32Array(NR).fill(1), aK = new Float32Array(NR), aSeed = new Float32Array(NR);
  ripGeo.setAttribute('aAge', new THREE.InstancedBufferAttribute(aAge, 1).setUsage(THREE.DynamicDrawUsage));
  ripGeo.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 1).setUsage(THREE.DynamicDrawUsage));
  ripGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  const ripMat = K.own(new THREE.ShaderMaterial({
    uniforms: { uC: { value: C('#bfefff') } },
    vertexShader: `attribute float aAge; attribute float aK; attribute float aSeed; varying vec2 vP; varying float vAge; varying float vK; varying float vSeed;
      void main(){ vP = position.xz; vAge = aAge; vK = aK; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uC; varying vec2 vP; varying float vAge; varying float vK; varying float vSeed;
      void main(){ if (vAge >= 1.0) discard;
        float r = length(vP); float a = atan(vP.y, vP.x);
        float R = 0.12 + vAge * 0.85;
        float n = 0.65 + 0.35 * sin(a * 9.0 + vSeed * 7.0) * sin(a * 4.0 - vSeed * 3.0 + vAge * 4.0);
        float ring = exp(-pow((r - R) / (0.05 + vAge * 0.06), 2.0)) * n;
        float ring2 = exp(-pow((r - R * 0.62) / 0.05, 2.0)) * 0.45 * step(0.15, vAge);
        float foam = smoothstep(0.55, 0.0, r) * (1.0 - smoothstep(0.0, 0.35, vAge)) * (0.5 + 0.5 * sin(vP.x * 23.0 + vSeed) * sin(vP.y * 19.0 - vSeed));
        float f = (ring + ring2 + foam * 0.7) * pow(1.0 - vAge, 1.4) * vK * smoothstep(1.0, 0.92, r);
        gl_FragColor = vec4(uC * f, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const ripples = new THREE.InstancedMesh(ripGeo, ripMat, NR); ripples.frustumCulled = false; ripples.renderOrder = 3; ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(ripples);
  const ripLife = new Float32Array(NR).fill(1), ripSize = new Float32Array(NR), ripPos = Array.from({ length: NR }, () => new V());
  let ripNext = 0;
  function ripple(at, size, k = 1, life = 1.4) {
    const i = ripNext; ripNext = (ripNext + 1) % NR;
    aAge[i] = 0; ripLife[i] = life; ripSize[i] = size; aK[i] = k; aSeed[i] = Math.random() * 10; ripPos[i].set(at.x, 0.07, at.z);
  }
  // the breach: the sea boils under Art, then a column of water bursts up with a crown of spray
  const sprayMat = K.own(new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC: { value: C('#7fd8ee') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform float uA; uniform vec3 uC; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ float col = floor(vUv.x * 48.0); float sp = 0.6 + h(vec2(col, 1.0)) * 0.8;
        float streak = smoothstep(0.35, 1.0, sin((vUv.y * 6.0 - uT * 5.0 * sp) + h(vec2(col, 2.0)) * 6.28) * 0.5 + 0.5);
        float top = smoothstep(1.0, 0.55 + h(vec2(col, 3.0)) * 0.4, vUv.y);
        float gap = step(0.35, h(vec2(col, 5.0)));
        float a = (0.08 + streak * 0.6 * gap) * top * uA * (0.5 + 0.5 * h(vec2(col, 4.0)));
        gl_FragColor = vec4(uC * a, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  const column = new THREE.Mesh(G.own(new THREE.CylinderGeometry(1.0, 1.6, 1, 32, 1, true).translate(0, 0.5, 0)), sprayMat); column.visible = false; column.renderOrder = 5; group.add(column);
  const crownMat = sprayMat.clone(); K.own(crownMat);
  const crown = new THREE.Mesh(G.own(new THREE.CylinderGeometry(3.2, 1.6, 1, 32, 1, true).translate(0, 0.5, 0)), crownMat); crown.visible = false; crown.renderOrder = 5; group.add(crown);
  const boilMat = K.own(new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC: { value: C('#9fe8ff') }, uHot: { value: C('#ff4d5e') } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform float uA; uniform vec3 uC; uniform vec3 uHot; varying vec2 vP;
      void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
        float sw = sin(a * 3.0 + r * 9.0 - uT * 5.0) * 0.5 + 0.5;
        float foam = smoothstep(0.7, 0.98, sw) * smoothstep(1.0, 0.25, r) * smoothstep(0.05, 0.3, r);
        float bub = smoothstep(0.85, 1.0, sin(vP.x * 31.0 + uT * 7.0) * sin(vP.y * 27.0 - uT * 6.0)) * smoothstep(0.9, 0.1, r);
        float dark = smoothstep(1.0, 0.0, r) * 0.6;
        float wob = sin(a * 5.0 + uT * 2.0) * 0.04 + sin(a * 11.0 - uT * 3.0) * 0.025;
        float rim = exp(-pow((r - 0.78 - wob) / 0.07, 2.0)) * (0.55 + 0.45 * sin(a * 7.0 - uT * 4.0 + sin(a * 3.0) * 2.0));
        vec3 c = mix(vec3(0.0, 0.02, 0.03), uC * 1.1, clamp(foam + bub + rim, 0.0, 1.0)) + uHot * smoothstep(0.8, 0.0, r) * 0.25 * (0.6 + 0.4 * sin(uT * 14.0));
        gl_FragColor = vec4(c, clamp(dark + foam + bub * 0.8 + rim, 0.0, 1.0) * uA * smoothstep(1.0, 0.9, r)); }`,
    transparent: true, depthWrite: false,
  }));
  const boil = new THREE.Mesh(G.own(new THREE.CircleGeometry(1, 48)), boilMat); boil.rotation.x = -Math.PI / 2; boil.visible = false; boil.renderOrder = 2; group.add(boil);
  let spout = null;   // { t0, at, big }
  function burstWater(at, big, t) {
    spout = { t0: t, at: at.clone().setY(0), big };
    K.fx.burst(v3.copy(at).setY(0.3), big ? 140 : 80, C('#bfe8f4', 0.8), { speed: big ? 16 : 11, up: 3, g: 16, life: 1.3, size: 0.45, spread: big ? 2.4 : 1.4, floor: 0.05 });
    K.fx.burst(v3.copy(at).setY(1.0), big ? 36 : 14, C('#ffffff', 0.8), { speed: big ? 22 : 14, up: 5, g: 18, life: 0.9, size: 0.3, spread: 1, floor: 0.05 });
    K.fx.shock(v3.copy(at).setY(0.08), C('#9fdcea', 0.7), 1, big ? 11 : 7, 0.8, { w: 0.2, k: 0.7 });
    for (let k = 0; k < (big ? 3 : 2); k++) ripple(at, (big ? 6 : 4) + k * 2.4, 0.9 - k * 0.2, 1.5 + k * 0.3);
  }

  // ---------- packets ----------
  const pk = new Map();
  const pkGeo = G.merge([[G.cbox(0.75, 0.75, 0.75, 0.1)]]);
  const pkPool = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(pkGeo, K.glow('#3ee6ff', 1.8));
    const cage = new THREE.Mesh(G.own(new THREE.OctahedronGeometry(0.95, 0)), K.glow('#9ff6ff', 0.6, { add: true }));
    m.add(cage);
    const h = new THREE.Mesh(G.own(new THREE.IcosahedronGeometry(1.1, 1)), K.shellMat('#3ee6ff', 0.7)); m.add(h);
    m.visible = false; group.add(m); return m;
  });
  // lightning in the far sky
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 40), 3)); K.own(boltGeo);
  const boltMat = K.own(new THREE.LineBasicMaterial({ color: C('#cfe8ff', 3), transparent: true, opacity: 0, toneMapped: false, fog: false }));
  const bolt = new THREE.LineSegments(boltGeo, boltMat); bolt.frustumCulled = false; props.add(bolt);
  let boltK = 0, skyFlash = 0, boltAt = new V();
  function lightning(near) {
    const a = boltGeo.attributes.position.array; let n = 0;
    const x0 = near ? rnd(-26, 26) : rnd(-40, 40), z0 = near ? rnd(-34, -22) : rnd(-70, -50);
    let p = new V(x0, 45, z0);
    const seg = (q) => { a.set([p.x, p.y, p.z, q.x, q.y, q.z], n * 6); n++; p = q; };
    while (p.y > 0 && n < 30) { const q = p.clone().add(new V(rnd(-4, 4), -rnd(2.5, 5), rnd(-1, 1))); if (q.y < 0) q.y = 0; seg(q); if (Math.random() < 0.2 && n < 36) { const b = p.clone().add(new V(rnd(-6, 6), -rnd(3, 6), 0)); a.set([p.x, p.y, p.z, b.x, b.y, b.z], n * 6); n++; } }
    boltGeo.setDrawRange(0, n * 2); boltGeo.attributes.position.needsUpdate = true;
    boltK = 1; skyFlash = 1; boltAt.copy(p); sfx('thunder');
    if (near) { ripple(p, 8, 1.4, 1.2); K.fx.burst(v3.copy(p).setY(0.4), 40, '#e8f4ff', { speed: 10, up: 2, g: 12, life: 0.8, size: 0.4, floor: 0.05 }); }
  }

  // ---------- state ----------
  const q = Array.from({ length: SEG }, () => new V());          // where each segment is (0: the neck socket)
  const P = Array.from({ length: SEG }, () => new V());          // where the swim loop wants it
  const segZ = Array.from({ length: SEG }, () => new V(0, 1, 0)); // each segment's back, carried down the body so it never rolls over
  const segQ = Array.from({ length: SEG }, () => new Q()), segR = new Float32Array(SEG);
  const segKick = new Float32Array(SEG), segFlash = new Float32Array(SEG), burst = new Uint8Array(SEG);
  const waves = [];   // hit ripples running down the body: { i, t0, k }
  let serpS = 0, frontI = 8, weakI = -1, decoyI = -1, phaseN = 1, spineK = 1, crackK = 0, lureCol = new THREE.Color('#39ff88');
  let atk = null;
  let spitT = -9, roarT = -9, dead = false, deadT = 0, finishing = false, bigFlash = 0, headFlash = 0, blinkT = 3, blink = 0, idleT = 6, idle = null;
  let kbH = 0, kbHV = 0, tilt = 0, tiltV = 0, lastS = null, splashedHead = false;
  const headPos = new V(), headLook = new V(), hFwd = new V(0, 0, 1), aimV = new V(), mouthV = new V();
  let jawNow = 0.2, orb = null, mark = null;
  const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V(), v5 = new V(), UP = new V(0, 1, 0), tmpO = new THREE.Object3D(), m4 = new THREE.Matrix4(), mB = new THREE.Matrix4(), qT = new Q(), tmpC = new THREE.Color();
  const xA = new V(), yA = new V(), zA = new V(), sc = new V(), idleV = new V();
  // the swim loop: a wide oval out in the sea, rising and falling three times a lap
  const pathAt = (u, out) => out.set(Math.cos(u) * 16.5, 2.6 + Math.sin(u * 3) * 5.2, -10 + Math.sin(u) * 12);
  // a frame whose +y is f and whose +z leans toward hint
  function basis(f, hint, outQ) {
    yA.copy(f).normalize();
    zA.copy(hint).addScaledVector(yA, -hint.dot(yA));
    if (zA.lengthSq() < 1e-5) zA.set(0, 0, 1).addScaledVector(yA, -yA.z);
    zA.normalize(); xA.crossVectors(yA, zA);
    mB.makeBasis(xA, yA, zA); return outQ.setFromRotationMatrix(mB);
  }
  const mouthW = out => out.copy(MOUTH).applyQuaternion(head.quaternion).add(head.position);
  // the head position that puts the jaws on a point, coming in along dir
  const ZERO = new V(), hfM = new THREE.Matrix4();
  function headFor(point, dir, out) { hfM.lookAt(dir, ZERO, UP); qT.setFromRotationMatrix(hfM); return out.copy(MOUTH).applyQuaternion(qT).negate().add(point); }
  const radiusOf = i => (i < 5 ? 1.75 + i * 0.17 : i < 9 ? 2.6 : 2.6 - (i - 9) / (SEG - 10) * 1.85) * (dead ? 1 : 1);

  // ---------- events ----------
  function startAtk(kind, ms, t) {
    if (atk && atk.mark) atk.mark.off();
    if (atk && atk.orb) atk.orb.pop();
    atk = { kind, t0: t, len: Math.max(0.6, ms / 1000), done: false, from: headPos.clone(), side: headPos.x > 0 ? 1 : -1, entered: false, hitDone: false, surfaced: false };
    atk.mark = K.fx.mark(v1.copy(art).setY(0.06), kind === 'breach' ? 3.8 : 3.2, '#ff4d5e', 1);
    // the lunge's stance: up out of the sea in front of Art, to the side it's already on
    atk.stance = new V(clamp(headPos.x * 0.45, -7, 7), 10.5, clamp(headPos.z * 0.25, -3, 1.5));
    if (kind === 'lunge') { atk.orb = K.fx.orb(ctx.pal.a, out => mouthW(out)); sfx('levCharge', ms); }
    if (kind === 'sweep') { atk.tailUp = new V(-atk.side * 13, 13, 6); sfx('levSurface'); }
  }
  function resolve(how, t) {
    const a = atk; if (!a || a.done) return;
    a.done = true; a.how = how; a.t1 = t; a.fromS = headPos.clone();
    if (a.mark) { a.mark.off(); a.mark = null; }
    const hit = how === 'blockFail';
    a.contact = hit ? ctx.artAim(new V()) : ctx.shieldAt(new V());
    if (how === 'cancel') { if (a.orb) { mouthW(v1); K.fx.burst(v1, 60, '#bfefff', { speed: 12, g: 2, life: 0.6, size: 0.35 }); K.fx.shock(v1, C('#3ee6ff'), 0.5, 7, 0.5, { flat: false, face: ctx.camPos }); a.orb.pop(); a.orb = null; } kbHV += 4; return; }
    if (a.kind === 'lunge') sfx('levStrike');
    if (a.kind === 'sweep') { sfx('levSweep'); a.tailFrom = (a.tailNow || a.tailUp).clone(); }
    if (a.kind === 'breach') { a.emerge = new V(a.contact.x, 0, a.contact.z - (hit ? 5.2 : 4.2)); }
  }
  // the moment an attack lands: on Art's bot or on the barrier
  function contact(a, t) {
    if (a.hitDone) return; a.hitDone = true;
    const hit = a.how === 'blockFail', at = a.contact;
    if (a.orb) { a.orb.pop(); a.orb = null; }
    if (hit) {
      K.fx.burst(at, 90, '#ffb0b0', { speed: 13, g: 8, life: 0.7, size: 0.38 });
      K.fx.burst(at, 30, '#ffffff', { speed: 18, g: 4, life: 0.35, size: 0.25 });
      K.fx.light(at, '#ff4d5e', 60, 4);
      K.fx.shock(at, C('#ff4d5e'), 0.5, 4.2, 0.4, { flat: false, face: ctx.camPos, w: 0.25 });
      sfx(a.kind === 'sweep' ? 'levClang' : 'levCrunch');
      ctx.juice.stop(70);
    } else {
      K.fx.burst(at, 80, '#cfefff', { speed: 14, g: 6, life: 0.6, size: 0.34, dir: v1.copy(at).sub(headPos).setY(0).normalize().negate(), dirK: 0.5 });
      K.fx.light(at, '#3ee6ff', 55, 4);
      K.fx.shock(at, C('#3ee6ff'), 0.5, 4.8, 0.4, { flat: false, face: ctx.camPos, w: 0.25 });
      K.fx.shock(v1.copy(at).setY(0.1), C('#3ee6ff'), 1, 8, 0.5);
      sfx('levClang'); kbHV += a.kind === 'sweep' ? 0 : 5; headFlash = 1;
    }
    if (a.kind === 'sweep') { ripple(at, 6, 1.2); K.fx.burst(v1.copy(at).setY(0.3), 60, '#cfefff', { speed: 12, up: 2, g: 16, life: 1, size: 0.4, spread: 1.5, floor: 0.05 }); }
    ctx.juice.shake(hit ? 0.5 : 0.4);
  }
  function event(n, d, t) {
    if (n === 'windup' && (d.kind === 'lunge' || d.kind === 'sweep' || d.kind === 'breach')) startAtk(d.kind, d.ms, t);
    if (n === 'windup' && d.kind === 'spit') { spitT = t; orb = K.fx.orb(ctx.pal.a, out => mouthW(out)); orb.grow(0.6); }
    if ((n === 'block' || n === 'blockFail' || n === 'cancel') && atk && (d.attack === 'lunge' || d.attack === 'sweep' || d.attack === 'breach')) resolve(n, t);
    if (n === 'packet' && d.returned) {
      // on the line the ids are ours, so the one sent back is the one nearest Art
      let p = pk.get(d.id);
      if (!p && lineMode) { let best = Infinity; for (const [, r] of pk) if (!r.back && r.left < best) { best = r.left; p = r; } }
      if (p && !p.back) { p.back = t; p.from.copy(p.m.position); }
    }
    if (n === 'weak' && d.hit && weakR.i >= 0) { segFlash[weakR.i] = 1; K.fx.burst(weakR.core.getWorldPosition(v1), 70, '#ffffff', { speed: 15, g: 6, life: 0.7, size: 0.35 }); K.fx.shock(v1, C('#ffffff'), 0.4, 3.5, 0.35, { flat: false, face: ctx.camPos, w: 0.2 }); }
    if (n === 'decoy' && decoyR.i >= 0) { segFlash[decoyR.i] = 1; K.fx.burst(decoyR.core.getWorldPosition(v1), 50, '#ff4d5e', { speed: 11, g: 4, life: 0.6, size: 0.35 }); }
    if (n === 'phase') {
      for (const [, r] of pk) r.m.visible = false; pk.clear();
      roarT = t; lightning(true); sfx('levRoar'); want('levRoar');
      ripple(v1.copy(headPos).setY(0), 9, 1.3, 1.6); ripple(v1, 5, 1, 1.2);
      if (atk) { if (atk.mark) atk.mark.off(); if (atk.orb) atk.orb.pop(); atk = null; }
    }
    if (n === 'countdown') want('levRise');
    if (n === 'hit') {
      const imp = Math.min(2.4, 0.35 + (d.amount || 0) * 0.012) * (d.crit ? 1.5 : 1);
      const i = d.src === 'weak' && weakR.i >= 0 ? weakR.i : d.at === 'head' ? 1 : frontI;
      for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 1 && j < SEG) { segKick[j] = Math.max(segKick[j], imp * (1 - Math.abs(k) * 0.22)); segFlash[j] = Math.max(segFlash[j], 0.6 - Math.abs(k) * 0.15); } }
      if (waves.length > 3) waves.shift();
      waves.push({ i, t0: t, k: imp });
      if (d.at === 'head' || d.src === 'packet') { kbHV += imp * 3; tiltV += (Math.random() < 0.5 ? -1 : 1) * imp * 3; headFlash = Math.max(headFlash, d.crit ? 1 : 0.5); }
      if (d.crit || d.src === 'weak') bigFlash = 0.8;
    }
    if (n === 'win') { dead = true; deadT = 0; clearAtk(); want('levKill'); sfx('levDie'); }
  }
  function clearAtk() { if (atk) { if (atk.mark) atk.mark.off(); if (atk.orb) atk.orb.pop(); } atk = null; if (orb) { orb.pop(); orb = null; } }

  // targets from the snapshot: which segment is the weak point and which the decoy
  // The streamer's page runs the fight on one line of words (InlineLine): its snapshot has no targets,
  // and the specials live in s.line.tags instead (kind, ms, el). Read them there, with an id made from
  // the kind and the total, which stays the same for as long as the special is lit.
  let lineMode = false;
  function fromLine(line) {
    const out = [];
    (line.tags || []).forEach(g => { if (g && g.first && g.ms) out.push({ id: 'L' + g.kind + g.ms, kind: g.kind, left: Math.max(0, g.ms - g.el), total: g.ms }); });
    return out;
  }
  function apply(s) {
    lastS = s;
    lineMode = !s.targets.length && !!s.line;
    const tgs = lineMode ? fromLine(s.line) : s.targets;
    if (lineMode) packets(tgs.filter(x => x.kind === 'packet'));
    const weak = tgs.find(x => x.kind === 'weak'), decoy = tgs.find(x => x.kind === 'decoy');
    if (weak && weakI < 0) {
      // the segment nearest Art that is well out of the water
      let best = -1, bz = -1e9;
      for (let i = 4; i < SEG - 5; i++) if (q[i].y > 3 && q[i].z > bz) { bz = q[i].z; best = i; }
      weakI = best >= 0 ? best : clamp(frontI, 4, SEG - 6);
      sfx('plates');
    }
    if (!weak) weakI = -1;
    if (decoy && decoyI < 0) { let best = -1, bz = 1e9; for (let i = 4; i < SEG - 4; i++) if (Math.abs(i - weakI) > 6 && q[i].y > 2.5 && q[i].z < bz) { bz = q[i].z; best = i; } decoyI = best >= 0 ? best : (weakI + 10) % (SEG - 4) + 2; }
    if (!decoy) decoyI = -1;
  }
  let launchN = 0;
  function packets(list, t) {
    const live = new Set();
    for (const p of list) {
      live.add(p.id);
      let r = pk.get(p.id);
      if (!r) {
        const m = pkPool.find(x => !x.visible); if (!m) continue;
        m.visible = true; head.updateMatrixWorld();
        const n = [...pk.values()].filter(x => !x.back).length;
        r = { m, from: new V(), left: p.left, total: p.total, delay: Math.min(n * 0.24, p.total / 1000 * 0.4), age: 0, out: false, back: 0 };
        mouthW(m.position); pk.set(p.id, r);
      }
      r.left = p.left; r.total = p.total;
    }
    for (const [id, r] of pk) if (!live.has(id) && !r.back) {
      // landed on Art: it bursts on his bot
      ctx.artAim(v1);
      K.fx.burst(v1, 40, '#ff8a8a', { speed: 9, g: 8, life: 0.5, size: 0.3 }); K.fx.light(v1, '#ff4d5e', 25, 6);
      r.m.visible = false; pk.delete(id);
    }
    void t;
  }

  // ---------- frame ----------
  function update(t, dt, S) {
    finishing = !!S.finishing;
    if (S.dead && !dead) { dead = true; deadT = 0; clearAtk(); }
    if (!S.dead && dead && !S.lost) { reset(); }
    if (dead) deadT += dt;
    if (S.phase !== phaseN) phaseN = S.phase;
    // the look of each phase: gold lures and spines in 2, cracked armour and raised spines in 3
    spineK += ([0, 1, 1.25, 1.6][phaseN] - spineK) * Math.min(1, dt * 2);
    crackK += ((phaseN >= 3 ? 1 : 0) - crackK) * Math.min(1, dt * 1.5);
    lureCol.copy(phaseN >= 2 ? ctx.pal.c : ctx.pal.a);
    bigFlash = Math.max(0, bigFlash - dt * 5); headFlash = Math.max(0, headFlash - dt * 4);
    boltK = Math.max(0, boltK - dt * 3.5); skyFlash = Math.max(0, skyFlash - dt * 2.5);
    boltMat.opacity = boltK > 0.6 ? 1 : boltK * (Math.random() < 0.5 ? 1 : 0.3);
    if (S.phase >= 2 && !dead && Math.random() < dt * (S.phase >= 3 ? 0.09 : 0.05)) lightning(Math.random() < 0.35);
    const speed = [0, 0.3, 0.36, 0.45][phaseN] * (S.enraged ? 1.3 : 1) * (dead ? Math.max(0, 1 - deadT * 0.5) : finishing ? 0.2 : 1);
    serpS += dt * speed;
    // springs: the head thrown back by hits and blocks, and tilted
    kbHV += (-kbH * 70 - kbHV * 9) * dt; kbH = clamp(kbH + kbHV * dt, -0.5, 3);
    tiltV += (-tilt * 60 - tiltV * 7) * dt; tilt = clamp(tilt + tiltV * dt, -0.6, 0.6);

    // ----- the head: where it wants to be -----
    pathAt(serpS, v1); pathAt(serpS + 0.04, v2);
    const travel = v4.copy(v2).sub(v1).normalize();
    v1.y = 4.2 + v1.y * 0.45 + Math.sin(t * 1.3) * 0.35;
    const idleP = idleV.copy(v1), hp = headPos;
    const target = v2.copy(idleP);
    ctx.artAim(aimV);
    const look = headLook.copy(aimV).add(v3.set(Math.sin(t * 0.37) * 2, 0, 0));
    let jawK = 0.18 + Math.max(0, Math.sin(t * 1.1)) * 0.14, throat = 0.6, eyeK = 1, lureK = 1, follow = 6, snap = false, neckDown = 0, neckDive = 0;
    // idle life: a look round now and then, a snap of the jaws
    idleT -= dt;
    if (idleT < 0 && !atk && !dead && !finishing) { idle = { t0: t, kind: Math.random() < 0.5 ? 'look' : 'snap', side: Math.random() < 0.5 ? -1 : 1 }; idleT = rnd(6, 10); }
    if (idle) { const u = (t - idle.t0) / 1.6; if (u > 1 || atk) idle = null; else if (idle.kind === 'look') { look.x += idle.side * 18 * Math.sin(u * Math.PI); look.y += 4 * Math.sin(u * Math.PI); } else { jawK = Math.max(jawK, u < 0.3 ? u / 0.3 * 0.9 : 0.9 * (1 - smooth((u - 0.3) / 0.15))); } }
    blinkT -= dt; if (blinkT < 0) { blink = 1; blinkT = rnd(2.5, 5); } blink = Math.max(0, blink - dt * 7);
    // forward: partly along the swim, partly toward Art
    const a = atk;
    if (a) {
      const u = clamp((t - a.t0) / a.len, 0, 1);
      if (a.kind === 'lunge') {
        neckDive = 1;
        if (!a.done) {
          // swims up in front of Art, then rears back, the jaws filling with light
          const e = ease(u / 0.4), rear = smooth((u - 0.45) / 0.55);
          target.copy(a.from).lerp(a.stance, e);
          v3.copy(aimV).sub(a.stance).setY(0).normalize();
          target.addScaledVector(v3, -3.2 * rear).add(v5.set(Math.sin(t * 43) * 0.12 * rear, 2.2 * rear, 0));
          look.copy(aimV); jawK = 0.25 + 0.95 * smooth(u * 1.1); throat = 0.6 + 3 * u; eyeK = 1 + 2.5 * u; lureK = 1 + 2 * u; follow = 5;
          if (a.orb) a.orb.grow(0.25 + u * 0.95);
          if (a.mark) a.mark.set(u);
          if (u > 0.2 && Math.random() < dt * (20 + u * 50)) { mouthW(v5); K.fx.suck(v5, 3.5, 2, ctx.pal.a, 0.45, 0.25); }
          if (t - a.t0 > a.len + 1.2) { clearAtk(); }
        } else {
          const s = t - a.t1, dir = v3.copy(a.contact).sub(a.fromS).normalize();
          headFor(a.contact, dir, v5);
          if (a.how === 'cancel') { target.copy(a.fromS).add(v1.set(Math.sin(s * 30) * 0.6 * (1 - s), 1.5 * Math.sin(Math.min(1, s) * Math.PI), -2)); jawK = 0.5 * (1 - s); if (s > 0.9) atk = null; }
          else if (s < 0.15) { target.copy(a.fromS).lerp(v5, easeIn(s / 0.15)); look.copy(a.contact).addScaledVector(dir, 10); jawK = 1.25; snap = true; eyeK = 3; lureK = 3;
            if (Math.random() < dt * 60) K.fx.spark(mouthW(v1), v4.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), ctx.pal.a, { size: 0.5, end: 0, life: 0.25, drag: 0 }); }
          else if (s < 0.32) { contact(a, t); target.copy(v5); look.copy(a.contact).addScaledVector(dir, 10); jawK = a.how === 'blockFail' ? 0.05 : 0.4; snap = true; eyeK = 2.5;
            if (a.how === 'blockFail') { target.x += Math.sin(t * 55) * 0.25; tiltV += Math.sin(t * 40) * 2; } }
          else if (s < 1.3) { const e = smooth((s - 0.32) / 0.98); v1.copy(v5); if (a.how === 'block') v1.add(v4.set(0, 3, 0).addScaledVector(dir, -4)); target.copy(v1).lerp(idleP, e); jawK = 0.3 * (1 - e) + 0.2; follow = 9; neckDive = 1 - e; }
          else atk = null;
        }
      } else if (a.kind === 'breach') {
        if (!a.done) {
          // rears up, then arcs over and dives; the sea starts to boil under Art
          const dive = smooth((u - 0.08) / 0.28);
          v3.copy(aimV).sub(a.from).setY(0).normalize();
          target.copy(a.from).add(v5.set(0, 3 * Math.sin(clamp(u / 0.12, 0, 1) * Math.PI / 2) * (1 - dive), 0)).addScaledVector(v3, 7 * dive);
          target.y -= 16 * dive;
          look.copy(target).addScaledVector(v3, 6).add(v5.set(0, 4 - 18 * dive, 0));
          jawK = 0.6 * (1 - dive); neckDown = dive; follow = 6;
          if (!a.entered && dive > 0.3 && hp.y < 0.4) { a.entered = true; burstWater(v5.copy(hp).setY(0), false, t); sfx('dive'); sfx('splash'); }
          if (a.mark) a.mark.set(u);
          if (t - a.t0 > a.len + 1.2) clearAtk();
        } else {
          const s = t - a.t1, E = a.emerge, C2 = a.contact;
          neckDown = 1;
          if (a.how === 'cancel') { target.set(E.x, -10, E.z - 8); if (s > 1) atk = null; }
          else if (s < 0.2) { const e = ease(s / 0.2); target.set(E.x, -7 + 17 * e, E.z - 0.5); look.set(E.x, 30, E.z + 6); jawK = 1.2; follow = 30; snap = true;
            if (!a.burst && target.y > -1.5) { a.burst = true; burstWater(E, true, t); sfx('levBurst'); ctx.juice.shake(0.65); want('levBreach'); } }
          else if (s < 0.36) { const e = easeIn((s - 0.2) / 0.16); v5.set(E.x, 10, E.z - 0.5); const dir = v3.copy(C2).sub(v5).normalize(); headFor(C2, dir, v4); target.copy(v5).lerp(v4, e); look.copy(C2).addScaledVector(dir, 8); jawK = 1.25; snap = true; }
          else if (s < 0.55) { contact(a, t); const dir = v3.copy(C2).sub(v5.set(E.x, 10, E.z - 0.5)).normalize(); headFor(C2, dir, target); look.copy(C2).addScaledVector(dir, 8); jawK = a.how === 'blockFail' ? 0.05 : 0.5; snap = true; }
          else if (s < 1.5) { const e = easeIn((s - 0.55) / 0.95); const dir = v3.copy(C2).sub(v5.set(E.x, 10, E.z - 0.5)).normalize(); headFor(C2, dir, v4); target.copy(v4).lerp(v5.set(E.x + a.side * 2, -9, E.z - 7), e); look.copy(target).add(v1.set(0, -8 * e, -6)); jawK = 0.6; follow = 20; snap = true;
            if (!a.fell && hp.y < 0.3 && s > 0.7) { a.fell = true; burstWater(v1.copy(hp).setY(0), false, t); sfx('splash'); ctx.juice.shake(0.3); } }
          else { atk = null; follow = 3; }
        }
        // the sea under Art boils as it comes
        const bk = !a.done ? smooth((u - 0.3) / 0.6) : Math.max(0, 1 - (t - a.t1) * 5);
        boil.visible = bk > 0.01; boilMat.uniforms.uA.value = bk; boilMat.uniforms.uT.value = t; boil.scale.setScalar(2.5 + bk * 3.2); boil.position.set(art.x, 0.05, art.z - 4.6);
        if (!a.done && u > 0.3) {
          if (Math.random() < dt * (14 + u * 50)) K.fx.spark(v5.set(art.x + rnd(-4, 4), 0.1, art.z - 4.6 + rnd(-4, 3)), v4.set(rnd(-0.6, 0.6), rnd(3, 8) * u, rnd(-0.6, 0.6)), C('#cfefff', 0.9), { size: 0.32, life: 0.55, g: 12, floor: 0.05 });
          if (Math.random() < dt * (2 + u * 4)) ripple(v5.set(art.x + rnd(-2.5, 2.5), 0, art.z - 4.6 + rnd(-2, 2)), rnd(1.5, 3.5), 0.8, 0.9);
          ctx.lightPool(5, v5.set(art.x, 0, art.z - 4.6), '#ff4d5e', 0.4 * u);
        }
      } else if (a.kind === 'sweep') {
        look.copy(aimV); jawK = 0.4 + 0.3 * u; eyeK = 1 + 1.5 * u;
        if (a.mark) a.mark.set(u);
        if (!a.done && t - a.t0 > a.len + 1.2) clearAtk();
        if (a.done && t - a.t1 > 1.55) atk = null;
      }
    } else { boil.visible = false; }
    if (!(a && a.kind === 'breach')) boil.visible = false;
    // spitting packets: the jaws open wide for a moment and the head kicks back on each one
    const sp = t - spitT;
    if (sp < 1.2) { jawK = Math.max(jawK, sp < 0.35 ? sp / 0.35 * 1.1 : 1.1 - (sp - 0.35) / 0.85 * 0.7); throat = Math.max(throat, 2.5); if (orb && sp > 0.4) { orb.pop(); orb = null; } }
    // the roar on a phase break: rears up out of the sea and opens wide
    const roar = t - roarT < 2.2 ? Math.sin(clamp((t - roarT) / 2.2, 0, 1) * Math.PI) : 0;
    if (roar > 0 && !atk && !dead) { target.y += 7 * roar; target.z += 2 * roar; look.y += 20 * roar; jawK = Math.max(jawK, 1.25 * roar); throat = 3; eyeK = 3; lureK = 3; target.x += Math.sin(t * 37) * 0.15 * roar;
      if (Math.random() < dt * 40 * roar) K.fx.spark(mouthW(v5), v4.set(rnd(-2, 2), rnd(3, 7), rnd(2, 5)), ctx.pal.a, { size: 0.35, life: 0.6, g: 4 }); }
    // the finish: beaten down low on the water in front of Art, panting
    if (finishing && !atk && !dead) { target.set(clamp(idleP.x * 0.3, -5, 5), 3.2 + Math.sin(t * 1.5) * 0.4, 1); look.copy(aimV).setY(-2); jawK = 0.6 + Math.sin(t * 4.5) * 0.25; eyeK = 0.5 + Math.random() * 0.5; neckDive = 1; }
    // the kill: thrashes, rears up and roars, then topples into the sea
    if (dead) {
      const thr = Math.min(1, deadT * 3) * Math.max(0, 1 - deadT / 2.6);
      if (deadT < 2.4) { target.copy(idleP).add(v5.set(Math.sin(t * 13) * 2.2 * thr, 6 * Math.min(1, deadT * 2), 2)); look.y += 22; jawK = 1.25; eyeK = 3.5; throat = 3; lureK = 3; }
      else { const u = deadT - 2.4; target.copy(idleP).add(v5.set(0, 6 - u * u * 7, 2 + u * 5)); look.copy(target).add(v5.set(0, -10, 8)); jawK = 0.9; eyeK = Math.max(0, 1 - u * 1.2); lureK = Math.max(0, 1 - u); throat = Math.max(0, 2 - u * 2); follow = 12; neckDive = 1;
        if (!splashedHead && headPos.y < 0.5) { splashedHead = true; burstWater(v5.copy(headPos).setY(0), true, t); K.fx.light(v5.setY(2), '#ffffff', 70, 1.5); ctx.juice.shake(0.8); ctx.juice.flash(0.4); sfx('levBurst'); } }
      if (deadT > 2.4 && deadT < 6 && Math.random() < dt * 30) { v5.copy(headPos).setY(0.1).add(v4.set(rnd(-2, 2), 0, rnd(-2, 2))); if (headPos.y < 0) K.fx.spark(v5, v4.set(rnd(-0.4, 0.4), rnd(2, 5), rnd(-0.4, 0.4)), C('#cfefff', 0.9), { size: 0.3, life: 0.6, g: 6, floor: 0.05 }); }
    }
    // hits throw the head back from Art and tilt it
    v3.copy(aimV).sub(target).setY(0); if (v3.lengthSq() > 1e-4) v3.normalize();
    target.addScaledVector(v3, -kbH * 3.2); target.y += kbH * 1.6 + S.kb * 0.6;
    if (snap) hp.copy(target); else hp.lerp(target, Math.min(1, dt * follow));
    // turn toward the look point
    tmpO.position.copy(hp); tmpO.up.set(0, 1, 0); tmpO.lookAt(look.x === hp.x && look.z === hp.z ? look.add(v5.set(0, 0, 0.01)) : look);
    tmpO.rotateZ(tilt);
    if (snap) head.quaternion.copy(tmpO.quaternion); else head.quaternion.slerp(tmpO.quaternion, Math.min(1, dt * 7));
    head.position.copy(hp);
    jawNow += (Math.min(1.3, jawK) - jawNow) * Math.min(1, dt * (snap ? 40 : 14));
    jaw.rotation.x = jawNow * 0.6;
    throatMat.color.copy(ctx.pal.a).multiplyScalar(throat * (dead ? Math.max(0, 1 - deadT * 0.3) : 1));
    head.updateMatrixWorld();
    hFwd.set(0, 0, 1).applyQuaternion(head.quaternion);
    // eyes, lures, gills
    const ek = eyeK * (1 + headFlash);
    for (const e of eyes) { e.material = ek > 2.2 ? eyeHot : eyeMat; e.scale.set(1.6 * (0.85 + 0.15 * Math.min(2, ek)), 0.6 * (1 - blink * 0.9) * (dead && deadT > 3 ? 0.2 : 1), 1); }
    for (const L of lures) {
      // the stalks lag behind the head's moves and sway on their own
      L.swV += (-L.sw * 30 - L.swV * 3 + (Math.sin(t * 1.7 + L.sd) * 4)) * dt - kbHV * dt * 2 - (snap ? 20 * dt : 0); L.sw = clamp(L.sw + L.swV * dt, -0.7, 0.7);
      L.g.rotation.set(-1.35 + L.sw * 0.45, L.sd * 0.22, L.sd * (0.12 + L.sw * 0.2));
    }
    lureMat.color.copy(lureCol).multiplyScalar((1.6 + Math.sin(t * 3.1) * 0.5) * lureK * (dead ? Math.max(0, 1 - deadT * 0.3) : 1));
    lureHalo.uniforms.uC.value.copy(lureCol).multiplyScalar(0.45 * lureK); lureHalo.uniforms.uT.value = t;
    gillMat.color.copy(ctx.pal.a).multiplyScalar((0.9 + 0.7 * Math.max(0, Math.sin(t * 2.2))) * (1 + throat * 0.2));
    mouthW(mouthV);

    // ----- the body: a rope from the neck socket, each segment leaning toward its place on the loop -----
    q[0].copy(SOCKET).applyQuaternion(head.quaternion).add(hp);
    P[0].copy(idleP);
    const bi = dead ? SEG - 1 - Math.floor(Math.max(0, deadT - 0.6) * 10) : SEG;   // segments past bi have burst
    for (let i = 1; i < SEG; i++) {
      pathAt(serpS - i * GAPU, P[i]);
      segKick[i] = Math.max(0, segKick[i] - dt * 2.2); segFlash[i] = Math.max(0, segFlash[i] - dt * 3);
      P[i].z -= segKick[i] * 2.5 + S.kb * 1.0; P[i].y += segKick[i] * 1.2;
      for (const w of waves) { const d = Math.abs(i - w.i) - (t - w.t0) * 18; if (d > -3 && d < 3) P[i].y += Math.cos(d / 3 * Math.PI * 0.5) * w.k * 1.4 * Math.max(0, 1 - (t - w.t0) * 1.2); }
      if (finishing) P[i].y = Math.max(-1, P[i].y * 0.5 + 0.5);
      if (dead) { P[i].x += Math.sin(t * 11 + i * 0.6) * 1.6 * Math.max(0, 1 - deadT / 3); if (i > bi) P[i].y -= 4; P[i].y -= Math.max(0, deadT - 2.6) * 2; }
    }
    // a lunge or the finish pulls the neck down into the sea behind the head; a breach takes it straight down
    for (let i = 1; i < SEG; i++) {
      const L = P[i].distanceTo(P[i - 1]);
      v5.copy(P[i]);
      const nd = neckDive * (smooth((i - 1) / 2) * (1 - smooth((i - 9) / 5)));
      if (nd > 0) v5.y = v5.y * (1 - nd) - 12 * nd;
      if (neckDown > 0 && i < 10) { v1.set(q[i - 1].x, q[i - 1].y - 30, q[i - 1].z - 4); v5.lerp(v1, neckDown * (1 - smooth((i - 6) / 4))); }
      v1.copy(v5).sub(q[i - 1]); const d = v1.length() || 1;
      q[i].copy(q[i - 1]).addScaledVector(v1, L / d);
    }
    // the tail sweep: the last third lifts out of the sea and swings through Art or into the barrier
    if (a && a.kind === 'sweep') {
      const u = clamp((t - a.t0) / a.len, 0, 1);
      let w = smooth(u / 0.35), TT = v2;
      if (!a.done) { TT.copy(q[SEG - 1]).lerp(a.tailUp, ease(u / 0.45)); TT.y += Math.sin(t * 9) * 0.4 * u; TT.x += Math.sin(t * 31) * 0.15 * u; a.tailNow = (a.tailNow || new V()).copy(TT);
        if (Math.random() < dt * 25 * w) K.fx.spark(v5.copy(TT).add(v4.set(rnd(-1, 1), rnd(-1, 0), rnd(-1, 1))), v4.set(0, -1, 0), C('#cfefff', 0.8), { size: 0.3, life: 0.8, g: 14, floor: 0.05 }); }
      else {
        const s = t - a.t1, Cn = a.contact, hit = a.how === 'blockFail';
        if (a.how === 'cancel') { TT.copy(a.tailFrom).lerp(q[SEG - 1], smooth(s)); w = 1 - smooth(s); }
        else if (s < 0.2) { const e = easeIn(s / 0.2); bez3(a.tailFrom, v4.copy(a.tailFrom).lerp(Cn, 0.5).setY(a.tailFrom.y + 2), Cn, e, TT); }
        else if (s < 0.34) { contact(a, t); const e = (s - 0.2) / 0.14; if (hit) TT.copy(Cn).lerp(v4.set(Cn.x + a.side * 3, Cn.y - 0.8, Cn.z + 0.5), e); else TT.copy(Cn).add(v4.set(Math.sin(t * 60) * 0.12, 0, 0)); }
        else if (s < 0.64) { const e = ease((s - 0.34) / 0.3); if (hit) TT.copy(v5.set(Cn.x + a.side * 3, Cn.y - 0.8, Cn.z + 0.5)).lerp(v4.set(-Cn.x + a.side * 13, 3, Cn.z - 2), e); else TT.copy(Cn).lerp(v4.copy(a.tailFrom).setY(a.tailFrom.y * 0.7), e * 0.6); }
        else { const e = smooth((s - 0.64) / 0.9); TT.copy(hit ? v4.set(-Cn.x + a.side * 13, 3, Cn.z - 2) : v4.copy(a.tailFrom).lerp(Cn, 0.4).setY(a.tailFrom.y * 0.7)).lerp(q[SEG - 1], e); w = 1 - e; }
        if (s < 0.45 && Math.random() < dt * 80) K.fx.spark(v5.copy(TT), v4.set(rnd(-2, 2), rnd(-1, 2), rnd(-2, 2)), ctx.pal.a, { size: 0.45, end: 0, life: 0.3, drag: 0 });
      }
      const K0 = SEG - 12;
      v1.copy(q[K0]); v3.copy(q[K0]).sub(q[K0 - 1]).normalize();
      const len = v1.distanceTo(TT);
      v4.copy(v1).addScaledVector(v3, len * 0.35).add(v5.set(0, len * 0.35, 0));
      v5.copy(TT).add(xA.set(0, len * 0.45, 0)).addScaledVector(zA.copy(TT).sub(v1).setY(0).normalize(), -len * 0.15);
      for (let i = K0 + 1; i < SEG; i++) { bez4(v1, v4, v5, TT, (i - K0) / (SEG - 1 - K0), yA); q[i].lerp(yA, w); }
    }

    // ----- draw the segments -----
    let best = -1e9;
    for (let i = 1; i < SEG; i++) {
      const p = q[i], f = v1.copy(q[i - 1]).sub(p), len = f.length() || 1;
      // the back is carried from the segment in front, pulled gently toward the sky so it never rolls over
      v2.copy(i === 1 ? v3.set(0, 1, 0).applyQuaternion(head.quaternion) : segZ[i - 1]).multiplyScalar(2).add(UP);
      basis(f, v2, segQ[i]); segZ[i].copy(zA);
      const r = radiusOf(i) * (1 + 0.03 * Math.sin(t * 2.2 - i * 0.45)) * (i === weakI ? 1.08 : 1);
      segR[i] = r;
      const gone = dead && i > bi;
      const show = gone ? 0 : 1;
      m4.compose(p, segQ[i], sc.set(r * show, len / 1.22 * show, r * show));
      segs.setMatrixAt(i, m4); bellies.setMatrixAt(i, m4); glows.setMatrixAt(i, m4);
      // dorsal spine
      tmpO.position.copy(p).addScaledVector(zA, r * 1.05); tmpO.quaternion.copy(segQ[i]); tmpO.scale.setScalar(r * 0.75 * spineK * show * (i > SEG - 4 ? 0.6 : 1)); tmpO.updateMatrix(); spines.setMatrixAt(i, tmpO.matrix);
      // fins on every third segment, flapping
      for (const sd of [0, 1]) {
        const on = i % 3 === 2 && i < SEG - 5 && !gone;
        tmpO.position.copy(p).addScaledVector(xA, (sd ? -1 : 1) * r * 0.92); tmpO.quaternion.copy(segQ[i]);
        tmpO.rotateY(sd ? Math.PI : 0); tmpO.rotateZ(-0.2); tmpO.rotateY(-0.35 + Math.sin(t * 2.6 + i * 0.7) * 0.25);
        tmpO.scale.setScalar(on ? r * 0.85 : 0); tmpO.updateMatrix(); fins.setMatrixAt(i * 2 + sd, tmpO.matrix);
      }
      // data runs down the spine; hits flash; the weak point and the decoy glow through
      const pulse = Math.max(0, Math.sin(i * 0.7 - t * 6)) ** 4;
      const deathRun = dead ? Math.max(0, 1 - Math.abs(i - (deadT * 14 % SEG))) * 3 : 0;
      const c = i === weakI ? tmpC.setRGB(2.4, 2.4, 2.4) : i === decoyI ? tmpC.set('#ff4d5e').multiplyScalar(2 + Math.sin(t * 12)) : tmpC.copy(ctx.pal.a).multiplyScalar(0.6 + pulse * 1.8 + segFlash[i] * 2.2 + bigFlash + deathRun + crackK * 0.3);
      glows.setColorAt(i, c);
      if (p.z > best && p.y > 1.5 && i > 3) { best = p.z; frontI = i; }
      // the kill: each segment bursts as the chain reaches it
      if (dead && i === bi + 1 && !burst[i]) {
        burst[i] = 1;
        K.fx.burst(p, 46, i % 2 ? '#ffffff' : ctx.pal.a, { speed: 13, g: 8, life: 0.9, size: 0.42 });
        K.fx.light(p, ctx.pal.a, 34, 6); ctx.shed(p, 5, ctx.pal.a, 1.3, 0.8);
        if (p.y < 2) ripple(p, 4, 1);
        if (i % 3 === 0) sfx('pop');
      }
      // the body breaks the water: foam rings and spray where it crosses the surface
      if (!gone && i > 1) {
        const y0 = q[i - 1].y, y1 = p.y;
        if ((y0 > 0) !== (y1 > 0)) {
          const k = y0 / (y0 - y1); v4.copy(q[i - 1]).lerp(p, k);
          if (Math.random() < dt * (phaseN >= 2 ? 3.2 : 2.4)) ripple(v4, r * 1.8 + rnd(0, 1.2), 0.85, 1.5);
          if (Math.random() < dt * 14) K.fx.spark(v4.setY(0.25).add(v5.set(rnd(-r, r), 0, rnd(-r, r))), v5.set(rnd(-2, 2), rnd(3, 6.5), rnd(-2, 2)), C('#cfefff', 0.75), { size: 0.3, life: 0.6, g: 14, floor: 0.05 });
        }
      }
    }
    for (const m of [segs, bellies, glows, spines]) m.setMatrixAt(0, m4.makeScale(0, 0, 0));
    fins.setMatrixAt(0, m4); fins.setMatrixAt(1, m4);
    for (const m of [segs, bellies, glows, spines, fins]) m.instanceMatrix.needsUpdate = true;
    glows.instanceColor.needsUpdate = true;
    // the tail fluke on the last segment
    const L = SEG - 1;
    fluke.matrix.compose(v1.copy(q[L]).addScaledVector(yA.set(0, 1, 0).applyQuaternion(segQ[L]), -0.6), segQ[L], sc.setScalar(dead && burst[L] ? 0 : 1.5)); fluke.matrixWorldNeedsUpdate = true;
    // the head's own splash when it crosses the water outside an attack
    const hy = hp.y;
    if (Math.abs(hy - 1) < 1 && Math.random() < dt * 2) ripple(hp, 4, 0.7);

    // ----- weak point and decoy rigs -----
    rig(weakR, weakI >= 0 ? weakI : finishing && !dead ? frontI : -1, dt, t);
    rig(decoyR, decoyI, dt, t);

    // ----- ripples, the water column -----
    for (let i = 0; i < NR; i++) {
      if (aAge[i] < 1) aAge[i] = Math.min(1, aAge[i] + dt / ripLife[i]);
      const s2 = aAge[i] < 1 ? ripSize[i] : 0;
      m4.makeScale(s2, 1, s2).setPosition(ripPos[i]); ripples.setMatrixAt(i, m4);
    }
    ripples.instanceMatrix.needsUpdate = true; ripGeo.attributes.aAge.needsUpdate = true; ripGeo.attributes.aK.needsUpdate = true; ripGeo.attributes.aSeed.needsUpdate = true;
    ripMat.uniforms.uC.value.copy(ctx.pal.a).lerp(tmpC.set('#e8f8ff'), 0.6);
    if (spout) {
      const u = (t - spout.t0) / (spout.big ? 1.2 : 0.8);
      if (u >= 1) { spout = null; column.visible = crown.visible = false; }
      else {
        const H = (spout.big ? 8.5 : 4.5) * (u < 0.25 ? ease(u / 0.25) : 1 - easeIn((u - 0.25) / 0.75) * 0.7), A = u < 0.1 ? u / 0.1 : 1 - smooth((u - 0.35) / 0.65);
        column.visible = crown.visible = true;
        column.position.copy(spout.at); column.scale.set((spout.big ? 1.7 : 1.1) * (1 + u * 0.8), H, (spout.big ? 1.7 : 1.1) * (1 + u * 0.8));
        crown.position.copy(spout.at); crown.scale.set(1 + u * (spout.big ? 3 : 2), H * 0.28, 1 + u * (spout.big ? 3 : 2));
        sprayMat.uniforms.uT.value = t; sprayMat.uniforms.uA.value = A * 0.5; crownMat.uniforms.uT.value = t * 0.7; crownMat.uniforms.uA.value = A * 0.55;
        ctx.lightPool(4, v1.copy(spout.at).setY(4), '#cfefff', A * 0.8);
      }
    }

    // ----- materials follow the phase colour; flashes; cracks in phase 3; heat when it dies -----
    const heat = dead ? smooth((deadT - 0.4) / 2) : finishing ? 0.2 + Math.sin(t * 6) * 0.08 : crackK * 0.14;
    for (const m of [plateMat, bellyMat, finMat, headMat]) {
      const u2 = m.userData.u;
      u2.uSeam.value.copy(m === finMat ? lureCol : ctx.pal.a).multiplyScalar(m === finMat ? 0.7 * spineK : m === bellyMat ? 0.4 : 0.95);
      u2.uRim.value.copy(ctx.pal.a).multiplyScalar(0.35 + skyFlash * 0.8);
      u2.uFlash.value = m === headMat ? Math.max(bigFlash * 0.5, headFlash * 0.8) : bigFlash * 0.5;
      u2.uHeat.value = heat;
    }
    // ----- packets fly an arc from the jaws to Art, one after another -----
    for (const [id, r] of pk) {
      r.age += dt;
      if (r.back) {
        // typed: it flies back into its face
        const u = clamp((t - r.back) / 0.22, 0, 1);
        r.m.position.copy(r.from).lerp(mouthV, ease(u)); r.m.position.y += Math.sin(u * Math.PI) * 1.5;
        if (Math.random() < dt * 60) K.fx.spark(r.m.position, v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), C('#ffffff'), { size: 0.35, life: 0.25, drag: 3 });
        if (u >= 1) { K.fx.burst(mouthV, 50, '#ffffff', { speed: 12, g: 6, life: 0.5, size: 0.32 }); K.fx.shock(mouthV, C('#3ee6ff'), 0.4, 5, 0.35, { flat: false, face: ctx.camPos }); K.fx.light(mouthV, '#3ee6ff', 30, 6); kbHV += 3; headFlash = 1; jawNow = 0; r.m.visible = false; pk.delete(id); }
        continue;
      }
      r.left = Math.max(0, r.left - dt * 1000);
      const flight = r.total / 1000 - r.delay, u = clamp((r.age - r.delay) / Math.max(0.2, flight), 0, 1);
      if (r.age < r.delay) { r.m.position.copy(mouthV); r.m.scale.setScalar(0.4 + r.age / r.delay * 0.6); continue; }
      if (!r.out) { r.out = true; r.m.scale.setScalar(1); r.from.copy(mouthV); K.fx.burst(mouthV, 24, '#9ff6ff', { speed: 8, g: 2, life: 0.4, size: 0.3, dir: hFwd, dirK: 0.8 }); sfx('spit'); kbHV += 1.2; jawNow = Math.max(jawNow, 1); launchN++; }
      v1.copy(r.from).lerp(aimV, ease(u)); v1.y += Math.sin(u * Math.PI) * 4.5;
      r.m.position.copy(v1); r.m.rotation.set(t * 4, t * 3, 0);
      if (Math.random() < dt * 40) K.fx.spark(r.m.position, v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), C('#9ff6ff'), { size: 0.32, life: 0.35, drag: 3 });
    }
    // ----- light on the water: the head, the weak point, the decoy, the storm -----
    ctx.lightPool(1, hp, lureCol, (0.8 + throat * 0.2) * (dead ? Math.max(0, 1 - deadT * 0.2) : 1));
    if (weakR.g.visible) ctx.lightPool(2, weakR.core.getWorldPosition(v1), '#ffffff', 0.9 * weakR.open);
    if (decoyR.g.visible) ctx.lightPool(3, decoyR.core.getWorldPosition(v1), '#ff4d5e', 0.7 * decoyR.open);
    if (skyFlash > 0) ctx.lightPool(4, boltAt.y < 1 ? boltAt : v1.set(0, 30, -30), '#cfe8ff', skyFlash * 2);
    ctx.skyFlash = skyFlash;
  }
  const bez3 = (a, b, c, u, out) => { const k = 1 - u; return out.set(0, 0, 0).addScaledVector(a, k * k).addScaledVector(b, 2 * k * u).addScaledVector(c, u * u); };
  const bez4 = (a, b, c, d, u, out) => { const k = 1 - u; return out.set(0, 0, 0).addScaledVector(a, k * k * k).addScaledVector(b, 3 * k * k * u).addScaledVector(c, 3 * k * u * u).addScaledVector(d, u * u * u); };
  // the four plates over a core: open on the weak point (or the finish), shut otherwise
  function rig(R, i, dt, t) {
    if (i >= 1 && i !== R.i) { R.i = i; R.open = 0; }
    const on = i >= 1;
    R.open += ((on ? 1 : 0) - R.open) * Math.min(1, dt * (on ? 9 : 12));
    if (!on && R.open < 0.02) { R.g.visible = false; R.i = -1; return; }
    const j = R.i, r = segR[j] || 2;
    R.g.visible = true;
    R.g.matrix.compose(q[j], segQ[j], sc.setScalar(r)); R.g.matrixWorldNeedsUpdate = true;
    for (const p of R.petals) p.piv.rotation.set(0, -R.open * 1.15, p.a, 'ZYX');
    R.core.scale.setScalar(0.3 + R.open * (0.75 + Math.sin(t * 18) * 0.06)); R.core.rotation.set(t * 2, t * 3, 0);
    R.beams.scale.set(R.open, R.open, R.open * (0.8 + Math.sin(t * 9) * 0.1)); R.beams.material.uniforms.uT.value = t;
    R.halo.material.uniforms.uT.value = t;
  }

  function reset() {
    dead = false; deadT = 0; clearAtk(); weakI = decoyI = -1; splashedHead = false; burst.fill(0); waves.length = 0;
    for (const [, r] of pk) r.m.visible = false; pk.clear();
    spout = null; column.visible = crown.visible = boil.visible = false;
  }
  function anchor(key, out) {
    if (key === 'seg:front') { const i = weakI >= 0 ? weakI : frontI; return out.copy(q[i]).setY(q[i].y + segR[i] + 2.2); }
    if (key === 'seg:far') { const i = decoyI >= 0 ? decoyI : 12; return out.copy(q[i]).setY(q[i].y + segR[i] + 2.2); }
    if (key === 'head') return out.copy(headPos).setY(headPos.y + 3.6);
    if (key.startsWith('packet:')) { const r = pk.get(key.slice(7)); return r ? out.copy(r.m.position).setY(r.m.position.y + 1.6) : null; }
    if (key === 'core') { const R = weakR.g.visible ? weakR : null; return R ? R.core.getWorldPosition(out) : out.copy(q[frontI]); }
    if (key === 'body') return out.copy(q[Math.floor(SEG / 2)]);
    return null;
  }
  function worldOf(at, out) {
    if (at === 'seg:front') return weakR.g.visible ? weakR.core.getWorldPosition(out) : out.copy(q[frontI]);
    if (at === 'head') return out.copy(headPos);
    return out.copy(q[frontI]);
  }
  function attacker(attack, owner, out) { return attack === 'sweep' ? out.copy(q[SEG - 1]) : out.copy(headPos); }
  const subjects = { core: new V(), head: new V(), top: new V(0, 16, -8), body: new V(), tail: new V(), water: new V() };
  function subj() { subjects.head.copy(headPos); anchor('core', subjects.core); subjects.body.copy(q[12]); subjects.tail.copy(q[SEG - 1]); subjects.water.copy(headPos).setY(0); return subjects; }

  // ---------- the sea around it: buoys with network lights and a far ring of rocks ----------
  {
    const rk = K.armor({ color: '#121a1f', seam: '#3ee6ff', seamK: 0.35, rimK: 0.2, metal: 0.4, rough: 0.7, scale: 0.6, density: 0.3 });
    const parts = [], lights = [];
    for (let i = 0; i < 9; i++) { const a = -0.3 + i / 8 * (Math.PI + 0.6), r = 42 + (i % 3) * 6; parts.push([G.rock(3 + (i % 3) * 1.5, 1, 0.25, 1, 1.8 + (i % 2), 1, i), [Math.cos(a) * r, 2, -10 - Math.sin(a) * r * 0.8]]); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.3, x = Math.cos(a) * 30, z = -14 + Math.sin(a) * 18; parts.push([G.cbox(0.5, 5, 0.5, 0.1), [x, 1.6, z]]); parts.push([G.cbox(1.8, 0.8, 1.8, 0.2), [x, 0.2, z]]); lights.push([new THREE.OctahedronGeometry(0.45, 0), [x, 4.3, z]]); }
    props.add(new THREE.Mesh(G.merge(parts), rk));
    const lm = K.glow('#3ee6ff', 2.4);
    props.add(new THREE.Mesh(G.merge(lights), lm));
    props.userData.tick = (t, pal) => { lm.color.copy(pal.a).multiplyScalar(1.6 + Math.sin(t * 4) * 0.8); rk.userData.u.uSeam.value.copy(pal.a).multiplyScalar(0.35); };
  }

  return { group, props, update, event, apply, packets: (list, t) => { if (!lineMode) packets(list, t); }, anchor, worldOf, attacker, subj, reset, dispose() {}, height: 15, width: 42, focus: new V(0, 6.5, -6), face: 'head',
    info: () => ({ weakI, decoyI, frontI, atk: atk && atk.kind, tail: q[SEG - 1].toArray().map(x => +x.toFixed(1)), tt: atk && atk.tailNow ? atk.tailNow.toArray().map(x => +x.toFixed(1)) : null, done: !!(atk && atk.done), packets: pk.size, head: headPos.toArray().map(x => +x.toFixed(2)), mouth: mouthV.toArray().map(x => +x.toFixed(2)), aim: aimV.toArray().map(x => +x.toFixed(2)), ripples: aAge.filter(x => x < 1).length, spout: !!spout }) };
};
