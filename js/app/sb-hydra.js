// The Kernel Hydra (sb-scene.js mounts it): three armoured heads on one hull in a flooded server pit.
//   Fork   green, twin forked horns, bites on a timer
//   Root   cyan, a crown of antenna spikes and hanging cables, breathes a beam you block
//   Patch  gold, a stitched hood and a plate over one eye, mends the other heads
// Every action has a wind-up you can read, a strike and a recovery: the bite coils back and snaps,
// the breath rears up and charges an orb in the jaws, the mend sends gold threads, the tidal slam
// (phase 2 on) lifts the hull out of the water and drops it, sending a wave at Art. A cut head is
// thrown off and sinks; it grows back out of the stump. The death drops the heads one by one and
// cracks the hull open with light before it sinks.
window.SuperModels = window.SuperModels || {};
SuperModels.hydra = function (THREE, K, ctx) {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const { C, clamp, rnd } = K;
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = x => Math.pow(clamp(x, 0, 1), 2.2);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const art = ctx.artPos;
  const group = new THREE.Group(), props = new THREE.Group();

  const G = K.geo;

  // ---------- materials ----------
  const HC = { fork: C(Theme.hex('accent')), root: C('#3ee6ff'), patch: C('#f2c230') };
  const hullMat = K.armor({ color: '#1d2329', seam: '#39ff88', seamK: 1.1, rim: '#39ff88', rimK: 0.35, metal: 0.7, rough: 0.42, scale: 0.42 });
  const boneMat = K.armor({ color: '#2c343c', seam: '#39ff88', seamK: 0.6, rimK: 0.25, metal: 0.65, rough: 0.48, scale: 0.9, density: 0.3 });
  const headMat = {}, ringMat = {}, neckMat = {};
  for (const id of ['fork', 'root', 'patch']) {
    headMat[id] = K.armor({ color: id === 'patch' ? '#37322a' : '#2a323a', seam: HC[id], seamK: 0.9, rim: HC[id], rimK: 0.3, metal: 0.8, rough: 0.32, scale: 1.1, density: 0.28 });
    neckMat[id] = K.armor({ color: '#2a3138', seam: HC[id], seamK: 0.5, rim: HC[id], rimK: 0.22, metal: 0.75, rough: 0.38, scale: 0.7, density: 0.1 });
    ringMat[id] = K.glow(HC[id], 1.7);
  }
  const toothMat = new THREE.MeshStandardMaterial({ color: '#c9d2cc', metalness: 0.3, roughness: 0.35, flatShading: true });
  const eyeMat = K.glow('#ff3b46', 4);
  const eyeHot = K.glow('#ffffff', 4);
  const mouthMat = {};
  for (const id of ['fork', 'root', 'patch']) mouthMat[id] = new THREE.MeshBasicMaterial({ color: HC[id].clone().multiplyScalar(0.6), toneMapped: false });
  const coreMat = K.glow('#bfffe0', 2.2);
  const coreShell = K.shellMat('#39ff88', 1.2);
  K.own(toothMat); Object.values(mouthMat).forEach(K.own);

  // ---------- the hull ----------
  const BODY = new V(0, 1.2, -8.5);
  const body = new THREE.Group(); body.position.copy(BODY); group.add(body);
  {
    const parts = [[G.rock(5.6, 3, 0.1, 1.45, 0.82, 1.1, 2.1), [0, 0, 0]]];
    // scutes down the back and over the shoulders, each laid on the hull's surface
    const plate = G.cbox(1.7, 0.34, 1.35, 0.12, 0.8, 1);
    const n = new V(), up = new V(0, 1, 0), q = new Q();
    for (let row = 0; row < 4; row++) {
      const lat = 0.35 + row * 0.27, cnt = 9 - row;
      for (let i = 0; i < cnt; i++) {
        const lon = -Math.PI * 0.95 + (i + 0.5) / cnt * Math.PI * 0.9 + row * 0.08;
        n.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
        const p = new V(n.x * 5.6 * 1.45, n.y * 5.6 * 0.82, n.z * 5.6 * 1.1);
        n.set(n.x / 1.45, n.y / 0.82, n.z / 1.1).normalize();
        q.setFromUnitVectors(up, n);
        const e = new THREE.Euler().setFromQuaternion(q);
        const s = 1.15 - row * 0.15;
        parts.push([plate, p.addScaledVector(n, 0.12).toArray(), [e.x, e.y, e.z], [s, 1, s]]);
      }
    }
    // shoulder collars where the necks leave the hull
    for (const [x, y, z] of [[-3.8, 3.4, 2.4], [0, 4.4, 1.2], [3.8, 3.4, 2.4]]) parts.push([G.cbox(2.6, 1.1, 2.6, 0.3, 0.8, 1.1), [x, y, z], [0.45, 0, x * -0.08]]);
    // the ribcage in front that holds the kernel
    const rib = G.horn(3.6, 0.28, 1.6, 5, 6);
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) parts.push([rib, [sd * 0.5, 2.6 - i * 0.75, 4.2 - i * 0.2], [0.2, sd * (1.25 + i * 0.05), sd * 0.4]]);
    const hull = new THREE.Mesh(G.merge(parts), hullMat);
    body.add(hull);
  }
  // the kernel: a faceted core behind the ribs, brighter when the neck is open
  const core = new THREE.Group(); core.position.set(0, 2.4, 4.6); body.add(core);
  const coreGem = new THREE.Mesh(K.own(new THREE.OctahedronGeometry(1.05, 0)), coreMat); core.add(coreGem);
  const coreHalo = new THREE.Mesh(K.own(new THREE.IcosahedronGeometry(1.7, 2)), coreShell); core.add(coreHalo);
  // chest plates that slide apart when every head is down
  const chest = [-1, 1].map(sd => { const m = new THREE.Mesh(G.cbox(1.9, 2.8, 0.6, 0.2, 0.85, 1), hullMat); m.position.set(sd * 0.95, 2.4, 5.6); m.rotation.y = sd * 0.25; body.add(m); return { m, sd }; });
  // a tail curling out of the water behind
  const TAILN = 12;
  const vert = (() => { const g = new THREE.LatheGeometry([new THREE.Vector2(0.62, -0.62), new THREE.Vector2(0.86, -0.5), new THREE.Vector2(1.08, -0.18), new THREE.Vector2(1.04, 0.2), new THREE.Vector2(0.84, 0.62), new THREE.Vector2(0.6, 0.66)], 9); g.computeVertexNormals(); return K.own(g.toNonIndexed()); })();
  vert.computeVertexNormals();
  const spikeGeo = G.horn(1.2, 0.3, 0.5, 5, 3);
  const tail = new THREE.InstancedMesh(vert, boneMat, TAILN); tail.frustumCulled = false; group.add(tail);
  const tailSp = new THREE.InstancedMesh(spikeGeo, boneMat, TAILN); tailSp.frustumCulled = false; group.add(tailSp);

  // ---------- necks ----------
  const SEGS = 15;
  const necks = {}, heads = {};
  const DEF = {
    fork: { base: new V(-3.8, 4.6, -6.1), rest: new V(-8.6, 8.6, -1.2), dir: -1 },
    root: { base: new V(0, 5.6, -7.3), rest: new V(0, 12.0, -2.6), dir: 0 },
    patch: { base: new V(3.8, 4.6, -6.1), rest: new V(8.6, 8.6, -1.2), dir: 1 },
  };
  for (const id of Object.keys(DEF)) {
    const n = {
      v: new THREE.InstancedMesh(vert, neckMat[id], SEGS), sp: new THREE.InstancedMesh(spikeGeo, boneMat, SEGS),
      ring: new THREE.InstancedMesh(K.own(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true)), ringMat[id], SEGS),
    };
    for (const m of Object.values(n)) { m.frustumCulled = false; group.add(m); }
    necks[id] = n;
  }

  // ---------- heads ----------
  function buildHead(id) {
    const h = new THREE.Group();
    const skull = [];
    skull.push([G.rock(1.1, 1, 0.07, 1.0, 0.72, 1.3, 3 + id.length), [0, 0.38, -0.2]]);                // cranium
    skull.push([G.taperZ(G.rock(1, 1, 0.05, 0.72, 0.42, 1.55, 5), 3.1, 0.55, 0.7, 0.25), [0, 0.16, 1.7]]);   // snout, drooping to the nose
    skull.push([G.taperZ(G.cbox(0.7, 0.22, 2.6, 0.08), 2.6, 0.4, 0.8, 0.28), [0, 0.6, 1.6], [0.06, 0, 0]]);   // the ridge down the nose
    for (let i = 0; i < 3; i++) skull.push([G.cbox(1.1 - i * 0.2, 0.16, 0.9, 0.06, 0.7, 1), [0, 1.02 - i * 0.05, -0.75 - i * 0.6], [-0.3 - i * 0.12, 0, 0]]);   // crest plates
    for (const sd of [-1, 1]) {
      skull.push([G.horn(1.7, 0.26, 0.35, 4, 3), [sd * 0.58, 0.88, 0.75], [-0.42, Math.PI + sd * 0.32, sd * 0.2]]);   // brow ridge sweeping back over the eye
      skull.push([G.taperZ(G.cbox(0.34, 0.8, 1.7, 0.08), 1.7, 0.6, 0.5, 0), [sd * 0.92, 0.02, 0.45], [0, sd * 0.14, 0]]);   // cheek
      skull.push([G.horn(1.2, 0.2, -0.3, 4, 3), [sd * 0.98, -0.12, -0.2], [0.1, Math.PI + sd * 0.55, 0]]);          // jaw spike
      skull.push([G.cbox(0.26, 0.22, 0.5, 0.05), [sd * 0.34, 0.38, 3.15], [0.25, 0, 0]]);                         // nostril
    }
    // crests that tell the three apart
    if (id === 'fork') {
      for (const sd of [-1, 1]) {
        skull.push([G.horn(3.8, 0.5, 0.8, 6, 8), [sd * 0.62, 0.95, -0.7], [-0.5, Math.PI + sd * 0.38, 0]]);
        skull.push([G.horn(1.9, 0.28, 0.6, 5, 5), [sd * 1.15, 1.7, -1.6], [-1.2, Math.PI + sd * 0.75, 0]]);   // the fork's second tine
        skull.push([G.horn(0.8, 0.14, 0.2, 5, 2), [sd * 1.05, 0.2, -0.4], [0.2, Math.PI + sd * 1.2, 0]]);
      }
    } else if (id === 'root') {
      for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.2; skull.push([G.horn(2.2 + (i % 2) * 0.9, 0.17, 0.4, 5, 5), [Math.sin(a) * 0.8, 1.05, -0.7], [-0.7 - Math.cos(a) * 0.15, Math.PI + a * 0.55, 0]]); }
      for (let i = 0; i < 4; i++) skull.push([G.horn(0.45, 0.1, 0, 4, 1), [0, 0.78, 1.3 + i * 0.45], [-1.2, 0, 0]]);
    } else {
      // a frill of spines with a membrane between them, held together with staples, and a plate over the left eye
      for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.2; skull.push([G.horn(2.4 - Math.abs(a) * 0.35, 0.24, -0.25, 5, 4), [0, 0.6, -0.9], [-Math.PI / 2 - 0.6, 0, -a, 'ZYX']]); }
      for (let i = 0; i < 6; i++) { const a = (i / 5 - 0.5) * 1.8; skull.push([G.cbox(0.34, 0.08, 0.06, 0.02), [Math.sin(a) * 1.3, 0.6 + Math.cos(a) * 1.1, -0.9 - Math.cos(a) * 0.68], [-0.6, 0, -a, 'ZYX']]); }   // staples
      skull.push([G.cbox(0.8, 0.6, 0.2, 0.06), [-0.6, 0.64, 1.18], [0.1, -0.4, 0]]);
    }
    const sk = new THREE.Mesh(G.merge(skull), headMat[id]);
    h.add(sk);
    // upper teeth
    const teeth = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { const z = 0.8 + i * 0.36, w = 0.66 - i * 0.065; teeth.push([G.tooth(i === 5 ? 0.8 : 0.36 + (i % 2) * 0.1, i === 5 ? 0.12 : 0.07), [sd * w, -0.12 - z * 0.06, z]]); }
    h.add(new THREE.Mesh(G.merge(teeth), toothMat));
    // the mouth's glow, seen when the jaw opens
    const mouth = new THREE.Mesh(G.taperZ(G.cbox(1.05, 0.1, 2.6, 0.04), 2.6, 0.5, 1, 0.2), mouthMat[id]); mouth.position.set(0, -0.2, 1.6); h.add(mouth);
    // eyes
    const eyes = [];
    for (const sd of [-1, 1]) {
      if (id === 'patch' && sd < 0) continue;
      const e = new THREE.Mesh(K.own(new THREE.OctahedronGeometry(0.22, 0)), eyeMat); e.scale.set(1.5, 0.6, 1); e.position.set(sd * 0.6, 0.62, 1.12); e.rotation.set(0, sd * 0.4, sd * -0.3); h.add(e); eyes.push(e);
    }
    // the lower jaw, hinged behind the cheeks
    const jaw = new THREE.Group(); jaw.position.set(0, -0.32, 0.05); h.add(jaw);
    const jp = [[G.taperZ(G.cbox(1.3, 0.38, 3.0, 0.1), 3.0, 0.42, 0.7, -0.12), [0, -0.18, 1.45]]];
    for (const sd of [-1, 1]) jp.push([G.cbox(0.35, 0.6, 1.0, 0.08), [sd * 0.62, -0.05, 0.1]]);
    if (id === 'root') for (const sd of [-1, 1]) jp.push([G.horn(2.4, 0.08, -0.8, 4, 6), [sd * 0.45, -0.38, 0.6], [1.9, sd * 0.25, 0]]);   // hanging cables
    jaw.add(new THREE.Mesh(G.merge(jp), headMat[id]));
    const lt = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const t = G.tooth(0.32 + (i === 4 ? 0.25 : 0), 0.07); lt.push([t, [sd * (0.52 - i * 0.065), 0.08, 0.6 + i * 0.4], [Math.PI, 0, 0]]); }
    jaw.add(new THREE.Mesh(G.merge(lt), toothMat));
    group.add(h);
    h.children.forEach(c => { c.scale.multiplyScalar(1.4); c.position.multiplyScalar(1.4); });
    return { g: h, jaw, eyes, mouth, mouthPos: new V(0, -0.7, 4.9) };
  }

  const st = {};
  for (const id of Object.keys(DEF)) {
    heads[id] = buildHead(id);
    st[id] = {
      id, up: true, grow: 1, pos: DEF[id].rest.clone(), look: art.clone(), jaw: 0.15, kb: 0, kbV: 0, flash: 0,
      act: null, actT: 0, actLen: 1, orb: null, mark: null, fallV: new V(), fallSpin: new V(), fallP: new V(), fallR: new V(), down: 0, splashed: false, limp: 0,
      neckLen: 1, stumpT: 0,
    };
  }
  // pieces used in the death and the stump
  const stumpMat = K.glow('#ffffff', 2.2);

  // ---------- helpers ----------
  const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V(), p2v = new V(), m4 = new THREE.Matrix4(), q1 = new Q(), sc = new V(), UP = new V(0, 1, 0);
  const tmpO = new THREE.Object3D();
  function bez(a, b, c, d, u, out) { const k = 1 - u; return out.set(0, 0, 0).addScaledVector(a, k * k * k).addScaledVector(b, 3 * k * k * u).addScaledVector(c, 3 * k * u * u).addScaledVector(d, u * u * u); }
  const mouthWorld = (id, out) => out.copy(heads[id].mouthPos).applyMatrix4(heads[id].g.matrixWorld);

  // ---------- slam (the tidal wave) and the body ----------
  let slam = null, bodyLift = 0, bodyShake = 0, wave = null;
  let neckOpen = false, chestOpen = 0;
  let roarT = -9, dead = false, deadT = 0, finishing = false;
  const waveRing = [];   // spray points along the wave front

  function startAct(s, kind, ms, t) {
    s.act = kind; s.actT = t; s.actLen = ms / 1000; s.strikeT = -1; s.fired = false;
    if (kind === 'breath') {
      s.orb = K.fx.orb(HC.root, out => mouthWorld('root', out));
      s.mark = K.fx.mark(v1.copy(art).setY(0.06), 3.2, '#ff4d5e', 1);
    }
    if (kind === 'mend') s.orb = K.fx.orb(HC.patch, out => mouthWorld('patch', out).add(v4.set(0, 0.6, 0)));
  }
  function endAct(s, how, t) {
    if (s.orb) { s.orb.pop(); s.orb = null; }
    if (s.mark) { s.mark.off(); s.mark = null; }
    s.act = how || null; s.actT = t;
  }

  // ---------- events ----------
  function event(n, d, t) {
    if (n === 'windup') {
      if (d.kind === 'bite' && st.fork.up) startAct(st.fork, 'bite', d.ms, t);
      if (d.kind === 'breath' && st.root.up) startAct(st.root, 'breath', d.ms, t);
      if (d.kind === 'mend' && st.patch.up) startAct(st.patch, 'mend', d.ms, t);
      if (d.kind === 'slam') { slam = { t0: t, len: d.ms / 1000, slammed: false }; wave = null; slam.mark = K.fx.mark(v1.copy(art).setY(0.06), 3.6, '#ff4d5e', 1); }
    }
    if (n === 'attack' && d.kind === 'bite') { const s = st.fork; if (s.up) { s.act = 'bite'; s.strikeT = t; ctx.sfx('snap'); } }
    if (n === 'attack' && d.kind === 'mend') {
      const s = st.patch;
      if (s.up) {
        s.act = 'mendGo'; s.actT = t; if (s.orb) { s.orb.pop(); s.orb = null; }
        mouthWorld('patch', v1);
        for (const id of ['fork', 'root']) if (st[id].up) { K.fx.beam(v1, st[id].pos, '#f2c230', 0.35, 0.7, { grow: 0.25 }); K.fx.burst(st[id].pos, 26, '#ffe08a', { speed: 5, g: -2, life: 1, size: 0.3 }); st[id].flash = 1; }
        K.fx.shock(v2.copy(BODY).setY(4), C('#f2c230'), 2, 14, 0.8, { flat: false, face: ctx.camPos });
        K.fx.light(v1, '#f2c230', 30, 3);
      }
    }
    if (n === 'block' || n === 'blockFail' || n === 'cancel') {
      const hitArt = n === 'blockFail';
      if (d.attack === 'breath') fireBreath(hitArt, n === 'cancel', t);
      if (d.attack === 'slam') breakWave(hitArt, n === 'cancel', t);
    }
    if (n === 'sever') sever(d.head, t);
    if (n === 'regrow') { const s = st[d.head]; if (s) { s.up = true; s.grow = 0; s.down = 0; s.act = null; heads[d.head].g.visible = true; regrowFx(d.head); } }
    if (n === 'neck') neckOpen = !!d.on;
    if (n === 'phase') { roarT = t; ctx.sfx('roar'); for (const id in st) if (st[id].up && !st[id].act) st[id].act = null; }
    if (n === 'hit') {
      const id = d.at && d.at.startsWith('head:') ? d.at.slice(5) : null;
      const imp = Math.min(2.4, 0.35 + (d.amount || 0) * 0.012) * (d.crit ? 1.5 : 1);
      if (id && st[id]) { st[id].kbV += imp * 2.2; st[id].flash = 1; }
      else for (const k in st) st[k].kbV += imp * 0.5;
    }
    if (n === 'win') { dead = true; deadT = 0; for (const id in st) endAct(st[id], null, t); if (slam) { if (slam.mark) slam.mark.off(); slam = null; } }
  }
  function fireBreath(hitArt, cancelled, t) {
    const s = st.root;
    if (cancelled || !s.up) {
      if (s.orb) { mouthWorld('root', v1); K.fx.burst(v1, 60, '#bfefff', { speed: 12, g: 2, life: 0.6, size: 0.35 }); K.fx.shock(v1, C('#3ee6ff'), 0.5, 7, 0.5, { flat: false, face: ctx.camPos }); }
      endAct(s, 'reel', t); return;
    }
    mouthWorld('root', v1);
    const stop = hitArt ? v2.copy(art).setY(1.4) : ctx.shieldAt(v2);
    K.fx.beam(v1, stop, '#3ee6ff', 1.5, 0.75, { grow: 0.1, follow: (a, b) => { mouthWorld('root', a); } });
    K.fx.burst(stop, hitArt ? 80 : 70, hitArt ? '#ff8a8a' : '#bfefff', { speed: 14, g: 8, life: 0.7, size: 0.35, dir: v3.set(0, 0.6, hitArt ? 0.3 : -0.5), dirK: 0.6 });
    K.fx.light(stop, hitArt ? '#ff4d5e' : '#3ee6ff', 60, 4);
    if (!hitArt) K.fx.shock(stop, C('#3ee6ff'), 0.6, 6, 0.4, { flat: false, face: ctx.camPos });
    endAct(s, 'fire', t);
    s.kbV += hitArt ? 0.5 : 4;
  }
  function breakWave(hitArt, cancelled, t) {
    if (!slam) return;
    if (slam.mark) { slam.mark.off(); }
    if (!cancelled) {
      const at = hitArt ? v1.copy(art).setY(0.4) : ctx.shieldAt(v1).setY(0.6);
      K.fx.burst(at, 120, hitArt ? '#ffb3b3' : '#cfefff', { speed: 13, g: 14, life: 1, size: 0.4, up: 2.2, spread: 3, floor: 0.05 });
      K.fx.shock(v2.copy(at).setY(0.1), C(hitArt ? '#ff4d5e' : '#3ee6ff'), 1, 9, 0.6);
      K.fx.light(at, hitArt ? '#ff4d5e' : '#9fe8ff', 50, 4);
    }
    slam = null; wave = null;
  }
  function sever(id, t) {
    const s = st[id]; if (!s) return;
    endAct(s, null, t);
    s.up = false; s.down = 0; s.splashed = false;
    s.fallP.copy(s.pos); s.fallR.set(0, 0, 0);
    s.fallV.set(DEF[id].dir * 5 + rnd(-2, 2), 9, -4 + rnd(-1, 1)); s.fallSpin.set(rnd(-5, 5), rnd(-4, 4), rnd(-6, 6));
    K.fx.burst(s.pos, 70, HC[id], { speed: 12, g: 10, life: 0.9, size: 0.35 });
    K.fx.burst(s.pos, 30, '#ffffff', { speed: 16, g: 6, life: 0.4, size: 0.25 });
    K.fx.light(s.pos, HC[id], 50, 4);
    ctx.shed(s.pos, 10, HC[id], 1.1, 0.6);
  }
  function regrowFx(id) {
    const s = st[id];
    v1.copy(s.pos);
    K.fx.suck(v1, 4, 60, HC[id], 0.55, 0.3);
    ctx.sfx('assemble');
  }

  // ---------- frame ----------
  let lastT = 0;
  function update(t, dt, S) {
    finishing = !!S.finishing;
    if (S.dead && !dead) { dead = true; deadT = 0; }
    if (!S.dead && dead && !S.lost) { dead = false; deadT = 0; reset(true); }
    if (dead) deadT += dt;
    neckOpen = !!S.neck;
    const kb = S.kb, rec = S.recoil;
    // the body: breathing, lifting for the slam, sinking when it dies
    const breathe = Math.sin(t * 1.3) * 0.18;
    let lift = 0;
    if (slam) {
      const u = (t - slam.t0) / slam.len;
      // rise over the first 40% (anticipation), crash at 48%, the wave rolls the rest of the way
      lift = u < 0.4 ? easeIn(u / 0.4) * 3.2 : u < 0.48 ? 3.2 * (1 - easeIn((u - 0.4) / 0.08)) : 0;
      if (u >= 0.48 && !slam.slammed) {
        slam.slammed = true; bodyShake = 1;
        ctx.juice.shake(0.7); ctx.juice.stop(90); ctx.sfx('slam');
        K.fx.burst(v1.copy(BODY).setY(0.5), 140, '#cfefff', { speed: 14, g: 16, life: 1.2, size: 0.45, up: 2.5, spread: 6, floor: 0.05 });
        K.fx.light(v1.copy(BODY).setY(3), '#9fe8ff', 60, 3);
        wave = { t0: t, len: Math.max(0.3, slam.len * 0.52), r0: 7 };
      }
      if (u < 0.4 && Math.random() < dt * 30) K.fx.spark(v1.copy(BODY).add(v2.set(rnd(-7, 7), rnd(0, 3) + lift, rnd(-3, 5))), v3.set(0, -2, 0), C('#9fe8ff', 0.8), { size: 0.22, life: 0.8, g: 14 });
      if (slam.mark) slam.mark.set(clamp(u, 0, 1));
    }
    bodyLift += (lift - bodyLift) * Math.min(1, dt * 14);
    bodyShake = Math.max(0, bodyShake - dt * 2.5);
    const sink = dead ? easeIn(clamp((deadT - 2.6) / 3, 0, 1)) * 9 : finishing ? 0.8 : 0;
    body.position.set(BODY.x + Math.sin(t * 40) * bodyShake * 0.25, BODY.y + breathe + bodyLift - sink - (finishing ? Math.sin(t * 2) * 0.2 : 0), BODY.z - rec * 0.6 - kb * 1.6);
    body.rotation.set(-bodyLift * 0.06 + (finishing ? 0.12 : 0) + (dead ? clamp(deadT - 1.5, 0, 3) * 0.08 : 0), Math.sin(t * 0.3) * 0.03, dead ? Math.sin(deadT * 7) * 0.03 * clamp(3 - deadT, 0, 1) : 0);
    body.updateMatrixWorld();

    // the wave rolling at Art: a ring of spray running over the water
    if (wave) {
      const u = clamp((t - wave.t0) / wave.len, 0, 1);
      const R = wave.r0 + (art.distanceTo(v1.copy(BODY).setY(art.y)) - wave.r0 - 1.5) * u;
      const n = Math.round(dt * 260);
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + rnd(-0.75, 0.75);
        v1.set(BODY.x + Math.cos(a) * R, 0.2, BODY.z + Math.sin(a) * R);
        K.fx.spark(v1, v2.set(rnd(-1, 1), rnd(4, 8), rnd(1, 3)), C(u > 0.7 ? '#ffd0d0' : '#bfefff', 0.9), { size: 0.4, end: 0.1, life: 0.5, g: 16, floor: 0.05 });
      }
      if (Math.random() < dt * 8) K.fx.shock(v1.copy(BODY).setY(0.08), C('#9fe8ff'), R * 0.95, R * 1.05, 0.25, { w: 0.15, k: 0.6 });
      ctx.lightPool(0, v2.set(0, 0, BODY.z + R), '#9fe8ff', 1.2);
    }

    // the kernel and the chest
    chestOpen += ((neckOpen ? 1 : 0) - chestOpen) * Math.min(1, dt * 4);
    for (const c of chest) { c.m.position.x = c.sd * (0.95 + chestOpen * 1.5); c.m.rotation.y = c.sd * (0.25 + chestOpen * 0.7); }
    const deathGlow = dead ? clamp(deadT / 2.6, 0, 1) : 0;
    const cK = (neckOpen ? 2.4 + Math.sin(t * 14) * 0.4 : 1) + S.hit * 1.2 + (finishing ? 1.4 + Math.sin(t * 9) * 0.6 : 0) + deathGlow * 3;
    coreMat.color.copy(C(neckOpen || finishing ? '#ffffff' : '#bfffe0', 1.4 * cK));
    coreGem.rotation.set(t * 0.7, t * 1.1, 0);
    coreHalo.scale.setScalar(0.8 + chestOpen * 0.5 + (finishing ? 0.3 + Math.sin(t * 9) * 0.1 : 0) + deathGlow);
    coreShell.uniforms.uT.value = t; coreShell.uniforms.uC.value.copy(ctx.pal.a).multiplyScalar(1 + chestOpen + deathGlow * 2);
    // seams follow the phase colour; the hull cracks open with light as it dies
    const heat = dead ? smooth((deadT - 0.6) / 2.2) * (deadT < 6 ? 1 : 0) : finishing ? 0.25 + Math.sin(t * 6) * 0.08 : 0;
    for (const m of [hullMat, boneMat]) { m.userData.u.uSeam.value.copy(ctx.pal.a).multiplyScalar(m === hullMat ? 1.2 : 0.6); m.userData.u.uRim.value.copy(ctx.pal.a).multiplyScalar(0.3); m.userData.u.uFlash.value = S.hit * 0.6; m.userData.u.uHeat.value = heat; }
    if (dead && deadT > 2.6 && !body.userData.boom) {
      body.userData.boom = true;
      core.getWorldPosition(v1);
      K.fx.burst(v1, 220, '#ffffff', { speed: 26, g: 8, life: 1.4, size: 0.5 });
      K.fx.burst(v1, 120, ctx.pal.a, { speed: 16, g: 6, life: 1.8, size: 0.6 });
      K.fx.shock(v1, C('#ffffff'), 1, 30, 1.1, { flat: false, face: ctx.camPos });
      K.fx.shock(v2.copy(v1).setY(0.1), ctx.pal.a, 2, 40, 1.4);
      K.fx.light(v1, '#ffffff', 140, 1.5, 80);
      ctx.juice.shake(1); ctx.juice.stop(120); ctx.juice.flash(1);
      ctx.shed(v1, 40, C('#ffffff'), 2.2, 1);
      ctx.sfx('boom');
    }
    if (dead && deadT > 2.6 && deadT < 5.5 && Math.random() < dt * 20) { v1.copy(BODY).add(v2.set(rnd(-6, 6), 0.2, rnd(-3, 5))); K.fx.burst(v1, 6, '#cfefff', { speed: 5, up: 2, g: 12, life: 0.8, size: 0.35, floor: 0.05 }); }

    // the tail
    for (let i = 0; i < TAILN; i++) {
      const u = i / (TAILN - 1), a = -0.4 + u * 2.6 + Math.sin(t * 0.9 + u * 3) * 0.12;
      v1.set(9 + Math.cos(a) * 5.2 * (1 - u * 0.25), Math.sin(a) * 4.5 - 0.6 - sink * 0.5, -15 + u * 3 + Math.sin(t * 0.7 + u * 4) * 0.5);
      v2.set(9 + Math.cos(a + 0.1) * 5.2 * (1 - u * 0.25), Math.sin(a + 0.1) * 4.5 - 0.6, -15 + u * 3).sub(v1).normalize();
      q1.setFromUnitVectors(UP, v2);
      const r = 1.3 * (1 - u * 0.75);
      m4.compose(v1, q1, sc.set(r, r * 1.05, r)); tail.setMatrixAt(i, m4);
      v3.set(0, 0, -1).applyQuaternion(q1);
      v4.copy(v1).addScaledVector(v3, r * 0.85);
      tmpO.position.copy(v4); tmpO.quaternion.copy(q1); tmpO.rotateX(-1.4); tmpO.scale.setScalar(r * 0.9); tmpO.updateMatrix();
      tailSp.setMatrixAt(i, tmpO.matrix);
    }
    tail.instanceMatrix.needsUpdate = tailSp.instanceMatrix.needsUpdate = true;

    // the heads
    const roar = clamp(1 - (t - roarT) / 1.8, 0, 1) * (t - roarT < 1.8 ? 1 : 0);
    const roarIn = roar > 0 ? Math.sin(clamp((t - roarT) / 1.8, 0, 1) * Math.PI) : 0;
    let li = 0;
    for (const id of Object.keys(DEF)) {
      const D = DEF[id], s = st[id], H = heads[id];
      s.flash = Math.max(0, s.flash - dt * 4);
      s.kbV += (-s.kb * 60 - s.kbV * 9) * dt; s.kb = clamp(s.kb + s.kbV * dt, -0.4, 2.5);
      if (s.up) s.grow = Math.min(1, s.grow + dt * 1.5);
      const growE = ease(s.grow);
      // idle: sway, bob and a slow look around, all different per head
      const ph = D.dir * 1.7 + (id === 'root' ? 0.6 : 0);
      v1.copy(D.rest).add(v2.set(Math.sin(t * 0.9 + ph) * 0.9, Math.sin(t * 1.4 + ph) * 0.55, Math.sin(t * 0.7 + ph) * 0.6));
      let jaw = 0.12 + Math.max(0, Math.sin(t * 0.8 + ph * 3)) * 0.18;
      let eyeK = 1, mouthK = 0.35, look = v3.copy(art).setY(art.y + 1);
      const ldx = Math.sin(t * 0.37 + ph) * 3;
      look.x += ldx;
      // actions
      const at = t - s.actT;
      if (s.act === 'bite') {
        if (s.strikeT < 0) {   // coil back: up and away, jaws wide, trembling
          const u = clamp(at / s.actLen, 0, 1), e = ease(u);
          v1.add(v2.set(D.dir * -0.8 * e, 2.0 * e, -3.2 * e)).add(v4.set(Math.sin(t * 50) * 0.06 * u, Math.sin(t * 43) * 0.06 * u, 0));
          jaw = 0.15 + 0.9 * e; eyeK = 1 + 2 * e; mouthK = 0.4 + e;
          if (at > s.actLen + 0.6) s.act = null;   // called off
        } else {
          const u = t - s.strikeT;
          if (u < 0.16) {   // the lunge
            const e = easeIn(u / 0.16);
            v2.copy(D.rest).add(v4.set(D.dir * -0.8, 2.0, -3.2));
            v4.copy(art).setY(3.2).lerp(D.rest, 0.22);
            v1.copy(v2).lerp(v4, e);
            if (s.up) for (let k = 0; k < 4; k++) K.fx.spark(v2.copy(s.pos).add(v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))), v3.set(0, 0, 0), HC.fork, { size: 0.5, end: 0, life: 0.25, drag: 0 });
            jaw = 1.05 * (1 - smooth((u - 0.1) / 0.06)); eyeK = 3; mouthK = 1.4;
          } else if (u < 0.3) { v1.copy(art).setY(3.2).lerp(D.rest, 0.22); jaw = 0; eyeK = 2.5;
            if (!s.fired) { s.fired = true; mouthWorld(id, v2); K.fx.burst(v2, 30, '#ffffff', { speed: 9, g: 6, life: 0.4, size: 0.25 }); K.fx.shock(v2, HC.fork, 0.4, 4, 0.35, { flat: false, face: ctx.camPos }); }
          } else if (u < 1.0) { const e = smooth((u - 0.3) / 0.7); v2.copy(art).setY(3.2).lerp(D.rest, 0.22); v1.lerp(v2, 1 - e); jaw = 0.1 + 0.2 * e; }
          else s.act = null;
        }
      } else if (s.act === 'breath') {
        const u = clamp(at / s.actLen, 0, 1), e = ease(Math.min(1, u * 1.4));
        v1.add(v2.set(0, 3.2 * e, -2.8 * e)).add(v4.set(Math.sin(t * 47) * 0.05 * u, 0, 0));
        look.y += 6 * (1 - u) * e;   // rears up and looks down at Art as it fills
        jaw = 0.2 + 0.85 * smooth(u * 1.2); eyeK = 1 + 3 * u; mouthK = 0.6 + 2.5 * u;
        if (s.orb) s.orb.grow(0.25 + u * 1.15);
        if (s.mark) s.mark.set(u);
        if (Math.random() < dt * (20 + u * 60)) { mouthWorld(id, v2); K.fx.suck(v2, 3.5, 2, HC.root, 0.45, 0.25); }
        if (at > s.actLen + 0.8) endAct(s, null, t);
      } else if (s.act === 'fire') {
        const u = clamp(at / 0.75, 0, 1);
        v1.add(v2.set(0, 2.2 * (1 - u), 1.8 * Math.sin(u * Math.PI) - 1.5 * (1 - u)));
        jaw = 1.1 - 0.9 * smooth(u); eyeK = 3 - 2 * u; mouthK = 3 - 2.4 * u;
        if (u >= 1) s.act = null;
      } else if (s.act === 'reel') {
        const u = clamp(at / 0.9, 0, 1);
        v1.add(v2.set(Math.sin(u * 12) * 0.6 * (1 - u), 1.5 * Math.sin(u * Math.PI), -2.5 * Math.sin(u * Math.PI)));
        jaw = 0.5 * (1 - u); if (u >= 1) s.act = null;
      } else if (s.act === 'mend') {
        const u = clamp(at / s.actLen, 0, 1), e = ease(u);
        v1.add(v2.set(0, 1.8 * e, -1.2 * e)); look.copy(BODY).setY(10);
        jaw = 0.2 + 0.4 * e; eyeK = 1 + 1.5 * e; mouthK = 0.5 + 1.5 * e;
        if (s.orb) s.orb.grow(0.35 + e * 0.6);
        if (Math.random() < dt * 40) { mouthWorld(id, v2); K.fx.suck(v2.add(v4.set(0, 0.6, 0)), 3, 1, '#ffe08a', 0.5, 0.22); }
        if (at > s.actLen + 0.8) endAct(s, null, t);
      } else if (s.act === 'mendGo') {
        const u = clamp(at / 0.6, 0, 1);
        v1.add(v2.set(0, 1.8 * (1 - u), -1.2 * (1 - u) + Math.sin(u * Math.PI) * 1.2)); jaw = 0.6 * (1 - u);
        if (u >= 1) s.act = null;
      }
      // the roar at a phase change: every head rears back with its jaws open
      if (roarIn > 0 && s.up && (!s.act || s.act === 'reel')) {
        v1.add(v2.set(D.dir * 1.2 * roarIn, 2.6 * roarIn, -2 * roarIn)).add(v4.set(Math.sin(t * 38 + ph) * 0.12 * roarIn, Math.sin(t * 33) * 0.1 * roarIn, 0));
        look.y += 14 * roarIn; jaw = Math.max(jaw, 1.1 * roarIn); eyeK = Math.max(eyeK, 1 + 2.5 * roarIn); mouthK = Math.max(mouthK, 1.5 * roarIn);
        if (Math.random() < dt * 30 * roarIn) { mouthWorld(id, v2); K.fx.spark(v2, v4.set(rnd(-2, 2), rnd(3, 7), rnd(2, 5)), HC[id], { size: 0.3, life: 0.6, g: 4 }); }
      }
      // the finish: heads droop low, panting
      if (finishing && s.up) { v1.y -= 2.6; v1.z += 1.2; look.y -= 2; jaw = 0.55 + Math.sin(t * 5 + ph) * 0.2; eyeK = 0.6 + Math.random() * 0.6; }
      // hits throw the head up and back
      v1.add(v2.set(D.dir * s.kb * 1.2, s.kb * 2.0, -s.kb * 4.5 - kb * 1.2 - rec * 0.5));
      v1.y += bodyLift * 0.8;
      // death: convulse, then go limp and fall
      if (dead && s.up) {
        const drop = { fork: 0.9, patch: 1.35, root: 1.8 }[id];
        if (deadT < drop) { v1.add(v2.set(Math.sin(t * 30 + ph) * 0.5, Math.sin(t * 26) * 0.4 + deadT * 1.2, 0)); jaw = 1; eyeK = 3; }
        else {
          if (!s.limpFrom) { s.limpFrom = s.pos.clone(); s.limpV = new V(D.dir * 2, 2, 3); }
          const u = deadT - drop;
          v1.copy(s.limpFrom).addScaledVector(s.limpV, u); v1.y -= 9 * u * u;
          if (v1.y < 0.6) { v1.y = 0.6 - Math.min(4, (u - 0.3) * 2); if (!s.splashed) { s.splashed = true; K.fx.burst(v2.copy(v1).setY(0.3), 90, '#cfefff', { speed: 12, up: 3, g: 16, life: 1.1, size: 0.45, spread: 2, floor: 0.05 }); K.fx.shock(v2.setY(0.08), C('#cfefff'), 1, 8, 0.8); ctx.sfx('splash'); ctx.juice.shake(0.35); } }
          jaw = 0.8; eyeK = Math.max(0, 1 - u * 2); look.copy(v1).add(v2.set(D.dir * 2, -6, 3));
        }
      }
      if (s.up) s.pos.lerp(v1, Math.min(1, dt * (s.act === 'bite' && s.strikeT >= 0 && t - s.strikeT < 0.3 ? 30 : s.kb > 0.05 ? 18 : 7)));
      else if (!dead) {
        // a cut head flies off, spins and sinks
        s.fallV.y -= 22 * dt; s.fallP.addScaledVector(s.fallV, dt); s.fallR.addScaledVector(s.fallSpin, dt);
        if (s.fallP.y < 0.4) {
          if (!s.splashed) { s.splashed = true; K.fx.burst(v2.copy(s.fallP).setY(0.3), 80, '#cfefff', { speed: 11, up: 3, g: 16, life: 1, size: 0.4, spread: 1.5, floor: 0.05 }); K.fx.shock(v2.setY(0.08), C('#cfefff'), 1, 7, 0.7); ctx.sfx('splash'); }
          s.fallP.y = 0.4; s.fallV.multiplyScalar(0.2); s.fallV.y = -1.2; s.down += dt;
        }
      }
      // the head's transform
      const Hg = H.g;
      if (s.up || dead) {
        Hg.position.copy(s.pos);
        tmpO.position.copy(s.pos); tmpO.lookAt(look); Hg.quaternion.slerp(tmpO.quaternion, Math.min(1, dt * 8));
        if (s.act === 'bite' && s.strikeT >= 0 && t - s.strikeT < 0.3) Hg.quaternion.copy(tmpO.quaternion);
        Hg.scale.setScalar(Math.max(0.05, growE));
        Hg.visible = true;
      } else {
        Hg.position.copy(s.fallP); Hg.rotation.set(s.fallR.x, s.fallR.y, s.fallR.z); Hg.scale.setScalar(1);
        Hg.visible = s.down < 2.5 && !(neckOpen && s.down > 2.5);
        if (s.down > 0) Hg.position.y -= s.down * 1.2;
      }
      s.jaw = s.jaw + (jaw - s.jaw) * Math.min(1, dt * 18);
      H.jaw.rotation.x = clamp(s.jaw, 0, 1.15) * 0.62;
      const ek = eyeK * (1 + s.flash);
      for (const e of H.eyes) { e.material = ek > 2.2 ? eyeHot : eyeMat; e.scale.set(1.5 * (0.8 + 0.2 * Math.min(2, ek)), 0.7 * (dead && deadT > 1.8 ? 0.2 : 1), 1); }
      mouthMat[id].color.copy(HC[id]).multiplyScalar(mouthK * (dead ? Math.max(0, 1 - deadT * 0.4) : 1));
      headMat[id].userData.u.uFlash.value = s.flash;
      headMat[id].userData.u.uHeat.value = heat * 0.7;
      Hg.updateMatrixWorld();
      // the neck: a curve from the hull to the back of the skull
      const n = necks[id];
      const baseW = v1.copy(D.base).add(body.position).sub(BODY);
      let endW;
      if (s.up || dead) endW = v2.set(0, -0.1, -1.0).applyMatrix4(Hg.matrixWorld);
      else endW = v2.copy(baseW).lerp(s.pos, 0.3);
      const shown = s.up || dead ? Math.max(0.25, growE) : 0.3;
      const p1 = v3.copy(baseW).add(v4.set(D.dir * 3.2, D.dir ? 2.6 : 3.4, D.dir ? -0.5 : -3));
      const p2 = p2v.copy(endW).add(v4.set(0, -1.6, -4.2).applyQuaternion(Hg.quaternion).multiplyScalar(s.up || dead ? 1 : 0.2));
      const segU = shown / SEGS;
      for (let i = 0; i < SEGS; i++) {
        const u = (i + 0.5) * segU;
        bez(baseW, p1, p2, endW, s.up || dead ? u : u / shown * 0.3, v4);
        v4.x += Math.sin(t * 1.6 + i * 0.5 + ph) * 0.18 * Math.sin(u * Math.PI);
        bez(baseW, p1, p2, endW, Math.min(1, (s.up || dead ? u : u / shown * 0.3) + 0.02), sc);
        sc.sub(v4).normalize();
        q1.setFromUnitVectors(UP, sc);
        const r = (1.7 - u * 0.75) * (s.up || dead ? 1 : 1 - i / SEGS * 0.2);
        m4.compose(v4, q1, tmpO.scale.set(r, r * 1.1, r)); n.v.setMatrixAt(i, m4);
        m4.compose(v4, q1, tmpO.scale.set(r * 1.04, 0.09, r * 1.04)); n.ring.setMatrixAt(i, m4);
        // the spike on the back of each vertebra, tilted back along the neck
        tmpO.position.copy(v4); tmpO.quaternion.copy(q1); tmpO.translateZ(-r * 0.85); tmpO.rotateX(-1.25); tmpO.scale.setScalar(r * 0.7); tmpO.updateMatrix();
        n.sp.setMatrixAt(i, tmpO.matrix);
      }
      n.v.count = n.sp.count = n.ring.count = SEGS;
      n.v.instanceMatrix.needsUpdate = n.sp.instanceMatrix.needsUpdate = n.ring.instanceMatrix.needsUpdate = true;
      ringMat[id].color.copy(HC[id]).multiplyScalar((s.up ? 1.3 : 0.5) + s.flash * 1.5 + (s.act === 'breath' ? 1 : 0));
      // a cut stump spits sparks
      if (!s.up && !dead && Math.random() < dt * 18) { K.fx.spark(endW, v4.set(rnd(-3, 3), rnd(2, 6), rnd(0, 3)), HC[id], { size: 0.28, life: 0.6, g: 10 }); }
      // the head's light on the water
      ctx.lightPool(1 + li++, s.up ? s.pos : endW, HC[id], (s.up ? 0.7 : 0.25) * (1 + s.flash + (s.act === 'breath' ? 1.5 : 0)));
    }
    lastT = t;
  }

  function reset(soft) {
    for (const id in st) {
      const s = st[id];
      endAct(s, null, 0);
      Object.assign(s, { up: true, grow: 1, kb: 0, kbV: 0, flash: 0, down: 0, splashed: false, limpFrom: null });
      s.pos.copy(DEF[id].rest); heads[id].g.visible = true;
    }
    slam = null; wave = null; body.userData.boom = false; dead = false; deadT = 0; roarT = -9;
    void soft;
  }

  // ---------- anchors for labels, shots and the camera ----------
  function anchor(key, out) {
    if (key.startsWith('head:')) { const s = st[key.slice(5)]; if (!s) return null; return out.copy(s.up ? s.pos : s.fallP).setY((s.up ? s.pos.y : s.fallP.y) + 3.0); }
    if (key === 'core' || key === 'body') return core.getWorldPosition(out);
    if (key === 'head') return out.copy(st.root.pos);
    return null;
  }
  function worldOf(at, out) {
    if (at && at.startsWith('head:')) { const s = st[at.slice(5)]; if (s) return out.copy(s.up ? s.pos : s.fallP); }
    return core.getWorldPosition(out);
  }
  function attacker(attack, owner, out) {
    if (attack === 'slam') return out.copy(BODY).setY(4);
    const s = st[owner] || (attack === 'breath' ? st.root : attack === 'mend' ? st.patch : st.fork);
    return out.copy(s.pos);
  }
  // subjects for the camera director
  const subjects = { core: new V(), top: new V(), root: new V(), fork: new V(), patch: new V(), body: BODY.clone() };
  function subj() { core.getWorldPosition(subjects.core); subjects.top.set(0, 14, -4); for (const id in st) subjects[id].copy(st[id].up ? st[id].pos : st[id].fallP); return subjects; }

  // ---------- the pit around it: drowned server racks and hanging cables ----------
  {
    const rackMat = K.armor({ color: '#161b20', seam: '#39ff88', seamK: 0.5, rimK: 0.15, metal: 0.6, rough: 0.55, scale: 1.4, density: 0.4 });
    const parts = [];
    const ledParts = [];
    for (let i = 0; i < 10; i++) {
      const sd = i % 2 ? 1 : -1, z = -26 + Math.floor(i / 2) * 6.5, x = sd * (18 + (i % 3) * 2.2), h = 6 + (i % 3) * 2.5, tilt = sd * (0.05 + (i % 4) * 0.04);
      parts.push([G.cbox(3, h, 2.4, 0.12), [x, h / 2 - 1.2, z], [0, sd * 0.25, tilt]]);
      for (let k = 0; k < 5; k++) ledParts.push([G.cbox(2.2, 0.08, 0.05, 0.01), [x - sd * Math.sin(tilt) * k, 0.6 + k * (h / 6), z + 1.22], [0, sd * 0.25, tilt]]);
    }
    // broken pillars in the water
    for (const [x, z, h] of [[-13, -18, 14], [14, -20, 11], [-24, -6, 9], [25, -9, 13]]) parts.push([G.cbox(2.2, h, 2.2, 0.1), [x, h / 2 - 1, z], [0.04, 0.3, -0.05]]);
    const racks = new THREE.Mesh(G.merge(parts), rackMat); props.add(racks);
    const ledMat = K.glow('#39ff88', 1.6);
    const leds = new THREE.Mesh(G.merge(ledParts), ledMat); props.add(leds);
    // cables hanging from the dark above
    const cab = [];
    for (let i = 0; i < 9; i++) { const x = -22 + i * 5.5 + rnd(-1, 1), z = -16 + rnd(-6, 4); cab.push([G.horn(16 + rnd(0, 8), 0.12, rnd(-0.3, 0.3), 5, 6), [x, 26, z], [Math.PI / 2 + rnd(-0.1, 0.1), 0, rnd(-0.1, 0.1)]]); }
    props.add(new THREE.Mesh(G.merge(cab), K.armor({ color: '#0e1114', seam: '#39ff88', seamK: 0.3, rimK: 0.1, metal: 0.3, rough: 0.7 })));
    props.userData.tick = (t, pal) => { ledMat.color.copy(pal.a).multiplyScalar(1.2 + Math.sin(t * 3) * 0.3); rackMat.userData.u.uSeam.value.copy(pal.a).multiplyScalar(0.5); };
  }

  function dispose() { /* the kit owns every geometry and material */ }
  return { group, props, update, event, anchor, worldOf, attacker, subj, reset, dispose, height: 16, focus: new V(0, 7, -5), info: () => ({ acts: Object.fromEntries(Object.entries(st).map(([k, s]) => [k, s.act])), slam: !!slam }) };
};
