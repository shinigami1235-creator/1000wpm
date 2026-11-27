// The Packet Leviathan (sb-scene.js mounts it): a sea serpent of armoured packet segments that arcs in
// and out of an open sea under a storm. Data runs down its spine as light.
//   weak point  a segment facing Art opens its plates and shows a white core; the decoy glows red
//   lunge       it rears up, throat glowing, and strikes at Art (block it)
//   breach      (phase 2 on) it dives, the water boils under Art, and it bursts up out of the sea (block it)
//   tail sweep  (phase 3) the tail rises behind it and sweeps across (block it)
//   spit        its jaws open and it spits glowing packets at Art; typed ones fly back into its face
// Lightning lights the sky on phase breaks. On the kill the segments burst one by one from the tail
// and the head falls into the sea.
window.SuperModels = window.SuperModels || {};
SuperModels.leviathan = function (THREE, K, ctx) {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const { C, clamp, rnd } = K;
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = x => Math.pow(clamp(x, 0, 1), 2.2);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const art = ctx.artPos;
  const G = K.geo;
  const group = new THREE.Group(), props = new THREE.Group();

  const bodyMat = K.armor({ color: '#1f272e', seam: '#3ee6ff', seamK: 0.8, rim: '#3ee6ff', rimK: 0.4, metal: 0.8, rough: 0.3, scale: 0.8, density: 0.3 });
  const finMat = K.armor({ color: '#162026', seam: '#39ffd2', seamK: 0.6, rim: '#39ffd2', rimK: 0.5, metal: 0.6, rough: 0.4, scale: 1.4, density: 0.25 });
  const headMat = K.armor({ color: '#232c34', seam: '#3ee6ff', seamK: 1.0, rim: '#3ee6ff', rimK: 0.45, metal: 0.85, rough: 0.28, scale: 0.9, density: 0.35 });
  const toothMat = K.own(new THREE.MeshStandardMaterial({ color: '#d5dde0', metalness: 0.3, roughness: 0.35, flatShading: true }));
  const ringMat = K.glow('#3ee6ff', 1.4);
  const eyeMat = K.glow('#ff3b46', 4);
  const throatMat = K.own(new THREE.MeshBasicMaterial({ color: C('#3ee6ff', 0.6), toneMapped: false }));
  const weakMat = K.glow('#ffffff', 3), decoyMat = K.glow('#ff4d5e', 3);

  // ---------- the body: instanced segments, fins and glowing rings ----------
  const SEG = 26, GAPU = 0.19;
  const segGeo = (() => { const g = new THREE.LatheGeometry([new THREE.Vector2(0.55, -0.7), new THREE.Vector2(0.95, -0.52), new THREE.Vector2(1.1, -0.1), new THREE.Vector2(1.05, 0.35), new THREE.Vector2(0.8, 0.7), new THREE.Vector2(0.5, 0.72)], 6); const n = g.toNonIndexed(); g.dispose(); n.computeVertexNormals(); return K.own(n); })();
  const finGeo = (() => { const g = G.taperZ(G.cbox(0.16, 2.2, 1.6, 0.05, 0.25, 1), 1.6, 0.5, 1, 0); g.translate(0, 1.1, 0); return g; })();
  const sideFinGeo = (() => { const g = G.taperZ(G.cbox(1.8, 0.12, 1.2, 0.04, 1, 1), 1.2, 0.3, 1, 0); g.translate(0.9, 0, 0); return g; })();
  const segs = new THREE.InstancedMesh(segGeo, bodyMat, SEG), fins = new THREE.InstancedMesh(finGeo, finMat, SEG), sides = new THREE.InstancedMesh(sideFinGeo, finMat, SEG * 2);
  const rings = new THREE.InstancedMesh(K.own(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)), ringMat, SEG);
  rings.setColorAt(0, new THREE.Color());
  for (const m of [segs, fins, sides, rings]) { m.frustumCulled = false; group.add(m); }
  // the weak point's core and the decoy's
  const weakCore = new THREE.Mesh(K.own(new THREE.IcosahedronGeometry(1.1, 1)), weakMat); weakCore.visible = false; group.add(weakCore);
  const weakHalo = new THREE.Mesh(K.own(new THREE.IcosahedronGeometry(1.8, 2)), K.shellMat('#ffffff', 1.4)); weakCore.add(weakHalo);
  const decoyCore = new THREE.Mesh(K.own(new THREE.IcosahedronGeometry(1.1, 1)), decoyMat); decoyCore.visible = false; group.add(decoyCore);
  // the tail blade
  const tailFin = new THREE.Mesh(G.merge([[G.taperZ(G.cbox(0.2, 3.6, 2.4, 0.06, 0.3, 1), 2.4, 0.4, 1, 0), [0, 1.2, -1]], [G.taperZ(G.cbox(0.2, 3.6, 2.4, 0.06, 0.3, 1), 2.4, 0.4, 1, 0), [0, -1.2, -1], [Math.PI, 0, 0]]]), finMat);
  group.add(tailFin);

  // ---------- the head ----------
  const head = new THREE.Group(); group.add(head);
  {
    const p = [];
    p.push([G.rock(1.7, 1, 0.07, 1.1, 0.75, 1.25, 4), [0, 0.5, -0.4]]);
    p.push([G.taperZ(G.rock(1.4, 1, 0.05, 0.85, 0.45, 2.2, 2), 6, 0.55, 0.65, 0.3), [0, 0.45, 2.4]]);
    p.push([G.taperZ(G.cbox(0.9, 0.3, 4.4, 0.1), 4.4, 0.4, 0.8, 0.25), [0, 1.1, 2.0], [0.08, 0, 0]]);
    for (const sd of [-1, 1]) {
      p.push([G.horn(4.2, 0.5, 0.6, 5, 6), [sd * 1.0, 1.2, -0.8], [-0.35, Math.PI + sd * 0.35, sd * 0.15]]);   // swept horns
      p.push([G.horn(2.4, 0.3, 0.3, 4, 4), [sd * 1.5, 0.2, -1.0], [0.1, Math.PI + sd * 0.7, 0]]);
      p.push([G.taperZ(G.cbox(0.16, 1.8, 2.4, 0.05, 0.4, 1), 2.4, 0.5, 1, 0), [sd * 1.45, 0.6, -1.4], [0, sd * 0.45, sd * 0.5]]);   // gill fins
      p.push([G.horn(1.8, 0.28, 0.2, 4, 3), [sd * 0.75, 1.3, 1.4], [-0.5, Math.PI + sd * 0.25, 0]]);   // brow
    }
    for (let i = 0; i < 4; i++) p.push([G.taperZ(G.cbox(0.14, 1.4 - i * 0.2, 1.4, 0.04, 0.3, 1), 1.4, 0.4, 1, 0), [0, 1.6 - i * 0.05, -0.6 - i * 0.9], [-0.4, 0, 0]]);   // crest
    head.add(new THREE.Mesh(G.merge(p), headMat));
    const t = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 8; i++) { const z = 1.0 + i * 0.55, w = 1.05 - i * 0.09; t.push([G.tooth(i === 6 ? 1.0 : 0.5, i === 6 ? 0.16 : 0.1), [sd * w, -0.1 - z * 0.03, z]]); }
    head.add(new THREE.Mesh(G.merge(t), toothMat));
    for (const sd of [-1, 1]) { const e = new THREE.Mesh(K.own(new THREE.OctahedronGeometry(0.32, 0)), eyeMat); e.scale.set(1.6, 0.6, 1); e.position.set(sd * 1.0, 0.95, 1.5); e.rotation.set(0, sd * 0.5, sd * -0.3); head.add(e); }
    const throat = new THREE.Mesh(G.taperZ(G.cbox(1.4, 0.12, 4, 0.04), 4, 0.5, 1, 0.2), throatMat); throat.position.set(0, -0.15, 2.4); head.add(throat);
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.35, -0.2); head.add(jaw);
  {
    const p = [[G.taperZ(G.cbox(1.9, 0.5, 5.4, 0.12), 5.4, 0.45, 0.7, -0.1), [0, -0.25, 2.5]]];
    for (const sd of [-1, 1]) p.push([G.horn(1.6, 0.22, -0.3, 4, 3), [sd * 0.9, -0.5, 0.2], [0.4, Math.PI + sd * 0.5, 0]]);
    jaw.add(new THREE.Mesh(G.merge(p), headMat));
    const t = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) t.push([G.tooth(0.45, 0.09), [sd * (0.75 - i * 0.08), 0.12, 0.8 + i * 0.6], [Math.PI, 0, 0]]);
    jaw.add(new THREE.Mesh(G.merge(t), toothMat));
  }
  head.scale.setScalar(1.5);
  const mouth = new V(0, -0.4, 5.6);

  // ---------- state ----------
  const segPos = Array.from({ length: SEG }, () => new V()), segQ = Array.from({ length: SEG }, () => new Q());
  const segKick = new Float32Array(SEG), segFlash = new Float32Array(SEG);
  let serpS = 0, frontI = 6, weakI = -1, decoyI = -1;
  let atk = null;      // { kind: 'lunge'|'sweep'|'breach', t0, len, mark, done, how, t1 }
  let spitT = -9, roarT = -9, dead = false, deadT = 0, finishing = false, bigFlash = 0, kbHead = 0;
  const pk = new Map();     // packets in the air
  const pkPool = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(K.own(new THREE.OctahedronGeometry(0.7, 1)), K.glow('#3ee6ff', 2.6)); const h = new THREE.Mesh(K.own(new THREE.IcosahedronGeometry(1.2, 1)), K.shellMat('#3ee6ff', 1.2)); m.add(h); m.visible = false; group.add(m); return m; });
  // lightning in the far sky
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 40), 3)); K.own(boltGeo);
  const boltMat = K.own(new THREE.LineBasicMaterial({ color: C('#cfe8ff', 3), transparent: true, opacity: 0, toneMapped: false, fog: false }));
  const bolt = new THREE.LineSegments(boltGeo, boltMat); bolt.frustumCulled = false; props.add(bolt);
  let boltK = 0, skyFlash = 0;
  function lightning() {
    const a = boltGeo.attributes.position.array; let n = 0;
    const x0 = rnd(-40, 40), z0 = rnd(-70, -50);
    let p = new V(x0, 45, z0);
    const seg = (q) => { a.set([p.x, p.y, p.z, q.x, q.y, q.z], n * 6); n++; p = q; };
    while (p.y > 0 && n < 30) { const q = p.clone().add(new V(rnd(-4, 4), -rnd(2.5, 5), rnd(-1, 1))); seg(q); if (Math.random() < 0.2 && n < 36) { const keep = p; const b = p.clone().add(new V(rnd(-6, 6), -rnd(3, 6), 0)); a.set([keep.x, keep.y, keep.z, b.x, b.y, b.z], n * 6); n++; } }
    boltGeo.setDrawRange(0, n * 2); boltGeo.attributes.position.needsUpdate = true;
    boltK = 1; skyFlash = 1; ctx.sfx('thunder');
  }

  const tmpC = new THREE.Color(), v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V(), UP = new V(0, 1, 0), tmpO = new THREE.Object3D(), m4 = new THREE.Matrix4();
  const pathAt = (u, out) => out.set(Math.cos(u) * 16.5, 3.4 + Math.sin(u * 3) * 4.4, -10 + Math.sin(u) * 12);

  function event(n, d, t) {
    if (n === 'windup' && (d.kind === 'lunge' || d.kind === 'sweep' || d.kind === 'breach')) {
      if (atk && atk.mark) atk.mark.off();
      atk = { kind: d.kind, t0: t, len: d.ms / 1000, done: false };
      atk.mark = K.fx.mark(v1.copy(art).setY(0.06), d.kind === 'breach' ? 3.6 : 3.2, '#ff4d5e', 1);
      if (d.kind === 'breach') ctx.sfx('dive');
    }
    if (n === 'windup' && d.kind === 'spit') spitT = t;
    if ((n === 'block' || n === 'blockFail' || n === 'cancel') && atk && !atk.done && (d.attack === 'lunge' || d.attack === 'sweep' || d.attack === 'breach')) {
      atk.done = true; atk.how = n; atk.t1 = t; if (atk.mark) { atk.mark.off(); atk.mark = null; }
      const hit = n === 'blockFail', at = hit ? v1.copy(art).setY(1.2) : ctx.shieldAt(v1);
      if (atk.kind === 'breach') {
        const p = hit ? v2.copy(art).setY(0.2) : v2.copy(ctx.shieldAt(v3)).setY(0.2).add(v4.set(0, 0, -2));
        K.fx.burst(p, 160, '#cfefff', { speed: 16, up: 3, g: 16, life: 1.3, size: 0.5, spread: 2.5, floor: 0.05 });
        K.fx.shock(p.setY(0.08), C(hit ? '#ff4d5e' : '#3ee6ff'), 1, 12, 0.8);
        ctx.sfx('splash'); ctx.juice.shake(0.6);
      }
      K.fx.burst(at, 70, hit ? '#ffb0b0' : '#cfefff', { speed: 12, g: 8, life: 0.6, size: 0.35 });
      K.fx.light(at, hit ? '#ff4d5e' : '#3ee6ff', 50, 4);
      if (!hit) { K.fx.shock(at, C('#3ee6ff'), 0.5, 6, 0.4, { flat: false, face: ctx.camPos }); kbHead = 1; }
    }
    if (n === 'weak' && d.hit && weakI >= 0) { segFlash[weakI] = 1; segPos[weakI] && K.fx.burst(segPos[weakI], 60, '#ffffff', { speed: 14, g: 6, life: 0.7, size: 0.35 }); }
    if (n === 'decoy' && decoyI >= 0) segFlash[decoyI] = 1;
    if (n === 'phase') { roarT = t; lightning(); ctx.sfx('roar'); }
    if (n === 'hit') {
      const imp = Math.min(2.4, 0.35 + (d.amount || 0) * 0.012) * (d.crit ? 1.5 : 1);
      const i = d.src === 'weak' && weakI >= 0 ? weakI : d.at === 'head' ? 0 : frontI;
      for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < SEG) segKick[j] = Math.max(segKick[j], imp * (1 - Math.abs(k) * 0.3)); }
      if (d.at === 'head') kbHead = Math.max(kbHead, 0.6);
      if (d.crit || d.src === 'weak') bigFlash = 0.8;
    }
    if (n === 'win') { dead = true; deadT = 0; if (atk && atk.mark) atk.mark.off(); atk = null; }
  }

  // targets from the snapshot: which segment is the weak point and which the decoy
  function apply(s) {
    const weak = s.targets.find(x => x.kind === 'weak'), decoy = s.targets.find(x => x.kind === 'decoy');
    if (weak && weakI < 0) {
      // the segment nearest Art that is out of the water
      let best = -1, bz = -1e9;
      for (let i = 3; i < SEG - 3; i++) if (segPos[i].y > 2.4 && segPos[i].z > bz) { bz = segPos[i].z; best = i; }
      weakI = best >= 0 ? best : clamp(frontI, 3, SEG - 4);
      ctx.sfx('plates');
    }
    if (!weak) weakI = -1;
    if (decoy && decoyI < 0) { let best = -1, bz = 1e9; for (let i = 3; i < SEG - 2; i++) if (Math.abs(i - weakI) > 5 && segPos[i].y > 2 && segPos[i].z < bz) { bz = segPos[i].z; best = i; } decoyI = best >= 0 ? best : (weakI + 9) % SEG; }
    if (!decoy) decoyI = -1;
  }
  function packets(list, t) {
    const live = new Set();
    for (const p of list) {
      live.add(p.id);
      let q = pk.get(p.id);
      if (!q) { const m = pkPool.find(x => !x.visible); if (!m) continue; m.visible = true; head.updateMatrixWorld(); q = { m, from: mouthW(new V()), left: p.left, total: p.total }; m.position.copy(q.from); pk.set(p.id, q); K.fx.burst(q.from, 24, '#9ff6ff', { speed: 7, g: 2, life: 0.4, size: 0.3 }); ctx.sfx('spit'); }
      q.left = p.left; q.total = p.total;
    }
    for (const [id, q] of pk) if (!live.has(id)) {
      // sent back (typed) flies into its face; landed bursts on Art
      const back = q.m.position.distanceTo(art) > 4;
      if (back) { mouthW(v2); K.fx.beam(q.m.position, v2, '#3ee6ff', 0.4, 0.25, { grow: 0.12 }); K.fx.burst(v2, 40, '#ffffff', { speed: 11, g: 6, life: 0.5, size: 0.3 }); kbHead = Math.max(kbHead, 0.8); }
      else K.fx.burst(q.m.position, 40, '#ff8a8a', { speed: 9, g: 8, life: 0.5, size: 0.3 });
      q.m.visible = false; pk.delete(id);
    }
  }
  const mouthW = out => out.copy(mouth).applyMatrix4(head.matrixWorld);

  function update(t, dt, S) {
    finishing = !!S.finishing;
    if (S.dead && !dead) { dead = true; deadT = 0; }
    if (!S.dead && dead && !S.lost) { dead = false; deadT = 0; reset(); }
    if (dead) deadT += dt;
    bigFlash = Math.max(0, bigFlash - dt * 5); kbHead = Math.max(0, kbHead - dt * 2.2);
    boltK = Math.max(0, boltK - dt * 3.5); skyFlash = Math.max(0, skyFlash - dt * 2.5);
    boltMat.opacity = boltK > 0.6 ? 1 : boltK * (Math.random() < 0.5 ? 1 : 0.3);
    if (S.phase >= 2 && Math.random() < dt * 0.06) lightning();
    const speed = [0, 0.3, 0.38, 0.48][S.phase] * (S.enraged ? 1.3 : 1) * (dead ? Math.max(0, 1 - deadT * 0.6) : finishing ? 0.25 : 1);
    serpS += dt * speed;
    const a = atk, au = a ? clamp((t - a.t0) / a.len, 0, 1) : 0;
    // the body: segments follow the path, kicked back by hits
    let best = -1e9;
    for (let i = 1; i < SEG; i++) {
      const u = serpS - i * GAPU;
      pathAt(u, v1);
      if (finishing) v1.y = Math.max(1.8, v1.y * 0.35 + 2);
      segKick[i] = Math.max(0, segKick[i] - dt * 2.2); segFlash[i] = Math.max(0, segFlash[i] - dt * 3);
      v1.z -= segKick[i] * 2.5 + S.kb * 1.0; v1.y += segKick[i] * 1.2;
      // a tail sweep raises the last third out of the water and swings it across
      if (a && a.kind === 'sweep') { const k = smooth((i - SEG * 0.6) / (SEG * 0.3)); const sw = a.done ? clamp((t - a.t1) / 0.5, 0, 1) : 0; v1.y += k * (7 * ease(au) * (1 - sw * 0.5)); v1.x += k * (a.done ? -1 : 1) * (12 * Math.sin(sw * Math.PI * 0.5) - 4 * au); v1.z += k * sw * 10; }
      if (dead) { const bi = SEG - 1 - Math.floor(deadT * 7); if (i > bi) v1.y -= (deadT - (SEG - 1 - i) / 7) * 6; }
      segPos[i].copy(v1);
      if (v1.z > best && v1.y > 1) { best = v1.z; frontI = i; }
      pathAt(u + 0.05, v2); v2.sub(pathAt(u, v3)).normalize();
      segQ[i].setFromUnitVectors(UP, v2);
    }
    // the head leads: rears for a lunge, dives for a breach
    pathAt(serpS, v1);
    let jawK = 0.2 + Math.max(0, Math.sin(t * 1.1)) * 0.15, look = v3.copy(art).setY(2), throat = 0.6;
    if (a) {
      if (a.kind === 'lunge' || a.kind === 'sweep') {
        if (!a.done) { const e = ease(au); v1.y += 6 * e; v1.z += 2 * e; jawK = 0.3 + 0.8 * e; throat = 0.6 + 2.5 * au; v1.x += Math.sin(t * 43) * 0.08 * au;
          if (a.kind === 'lunge' && Math.random() < dt * 40) { mouthW(v2); K.fx.suck(v2, 3, 1, '#9ff6ff', 0.4, 0.25); } }
        else {
          const u = t - a.t1;
          if (a.kind === 'lunge') {
            if (u < 0.18) { v1.lerp(v2.copy(a.how === 'blockFail' ? art : ctx.shieldAt(v4)).setY(3), easeIn(u / 0.18) * 0.85); jawK = 1.2 * (1 - u / 0.18); }
            else if (u < 0.9) { v2.copy(a.how === 'blockFail' ? art : ctx.shieldAt(v4)).setY(3); v1.lerp(v2, 0.85 * (1 - smooth((u - 0.18) / 0.72))); jawK = 0.1; }
          }
          if (u > 1) atk = null;
        }
        if (a.kind === 'sweep' && !a.done && a.mark) a.mark.set(au);
      } else if (a.kind === 'breach') {
        if (!a.done) {
          // dives, then the water boils under Art
          const e = ease(au * 2.5); v1.y -= 12 * e; v1.z += 6 * e;
          if (au > 0.35 && Math.random() < dt * (20 + au * 80)) { v2.copy(art).add(v4.set(rnd(-3, 3), 0.1, rnd(-3, 2))); K.fx.spark(v2, v4.set(rnd(-1, 1), rnd(3, 7), rnd(-1, 1)), C('#cfefff', 0.9), { size: 0.35, life: 0.5, g: 12, floor: 0.05 }); }
          if (au > 0.35 && Math.random() < dt * 3) K.fx.shock(v2.copy(art).setY(0.08), C('#9fe8ff'), 0.5, 4, 0.6, { w: 0.2, k: 0.6 });
        } else {
          // bursts up out of the sea under Art (or under the barrier) and falls back
          const u = t - a.t1, p = a.how === 'blockFail' ? v2.copy(art) : ctx.shieldAt(v2).add(v4.set(0, 0, -2));
          const rise = u < 0.25 ? ease(u / 0.25) : 1 - easeIn((u - 0.25) / 0.9);
          v1.set(p.x, -4 + rise * 13, p.z - 1); look.set(p.x, 30, p.z + 4); jawK = 1.1 * (u < 0.3 ? 1 : 0.4);
          if (u > 1.15) atk = null;
        }
        if (a && !a.done && a.mark) a.mark.set(au);
      }
      if (a && !a.done && t - a.t0 > a.len + 1) { if (a.mark) a.mark.off(); atk = null; }
    }
    // spitting packets: the jaws open wide for a moment
    const sp = t - spitT; if (sp < 0.6) { jawK = Math.max(jawK, Math.sin(sp / 0.6 * Math.PI) * 1.1); throat = 2.5; }
    // the roar on a phase break: rears up and opens wide
    const roar = t - roarT < 2 ? Math.sin(clamp((t - roarT) / 2, 0, 1) * Math.PI) : 0;
    if (roar > 0 && !a) { v1.y += 8 * roar; v1.z += 2 * roar; look.y += 18 * roar; jawK = Math.max(jawK, 1.2 * roar); throat = 3; }
    if (finishing && !a) { v1.y = 4 + Math.sin(t * 1.5) * 0.5; v1.z += 3; jawK = 0.5 + Math.sin(t * 4) * 0.2; look.y = 0.5; }
    v1.y += kbHead * 2; v1.z -= kbHead * 4 + S.kb * 1.2;
    if (dead) { const u = Math.max(0, deadT - 2.6); v1.y += deadT < 2.6 ? Math.min(6, deadT * 4) : 6 - u * u * 9; look.y = 30 - deadT * 8; jawK = 1.2; if (v1.y < 0 && !head.userData.splash) { head.userData.splash = true; K.fx.burst(v2.copy(v1).setY(0.3), 200, '#cfefff', { speed: 18, up: 3, g: 16, life: 1.5, size: 0.55, spread: 3, floor: 0.05 }); K.fx.shock(v2.setY(0.08), C('#cfefff'), 2, 26, 1.2); ctx.sfx('splash'); ctx.juice.shake(0.8); } }
    head.position.lerp(v1, Math.min(1, dt * (a && a.done && a.kind !== 'sweep' ? 25 : 8)));
    segPos[0].copy(head.position);
    tmpO.position.copy(head.position); tmpO.lookAt(look); head.quaternion.slerp(tmpO.quaternion, Math.min(1, dt * 7));
    jaw.rotation.x = clamp(jawK, 0, 1.2) * 0.55;
    throatMat.color.copy(ctx.pal.a).multiplyScalar(throat * (dead ? Math.max(0, 1 - deadT * 0.3) : 1));
    head.updateMatrixWorld();

    // draw the segments: ring 1 sits behind the head
    for (let i = 1; i < SEG; i++) {
      const taper = (i < 4 ? 1.05 + i * 0.08 : 1.35 - (i - 4) / (SEG - 4) * 0.75) * 2.0;
      const p = segPos[i], q = segQ[i];
      const opened = i === weakI ? 1 : 0;
      m4.compose(p, q, v2.set(taper * (1 + opened * 0.15), taper * 1.75, taper * (1 + opened * 0.15))); segs.setMatrixAt(i, m4);
      tmpO.position.copy(p); tmpO.quaternion.copy(q); tmpO.translateZ(-taper * 0.85); tmpO.rotateX(-Math.PI / 2 + 0.25); tmpO.scale.setScalar(taper * (0.75 + (i % 2) * 0.25)); tmpO.updateMatrix(); fins.setMatrixAt(i, tmpO.matrix);
      for (const sd of [0, 1]) { tmpO.position.copy(p); tmpO.quaternion.copy(q); tmpO.rotateY(sd ? Math.PI : 0); tmpO.translateX(taper * 0.85); tmpO.rotateZ(-0.35 + Math.sin(t * 3 + i) * 0.15); tmpO.scale.setScalar(i % 3 === 1 ? taper * 0.9 : 0.001); tmpO.updateMatrix(); sides.setMatrixAt(i * 2 + sd, tmpO.matrix); }
      m4.compose(p, q, v2.set(taper * 1.03, 0.12, taper * 1.03)); rings.setMatrixAt(i, m4);
      // data runs down the spine
      const pulse = Math.max(0, Math.sin(i * 0.8 - t * 6)) ** 4;
      const c = i === weakI ? tmpC.setRGB(2.5, 2.5, 2.5) : i === decoyI ? tmpC.set('#ff4d5e').multiplyScalar(2 + Math.sin(t * 12)) : tmpC.copy(ctx.pal.a).multiplyScalar(0.7 + pulse * 1.8 + segFlash[i] * 2 + bigFlash);
      rings.setColorAt(i, c);
      // the body breaks the water: spray where it crosses the surface
      if (Math.abs(p.y) < taper * 0.8 && Math.random() < dt * 6) K.fx.spark(v3.set(p.x, 0.2, p.z), v4.set(rnd(-2, 2), rnd(3, 6), rnd(-2, 2)), C('#cfefff', 0.7), { size: 0.3, life: 0.6, g: 14, floor: 0.05 });
      // the kill: segments burst in a chain from the tail
      if (dead) { const bi = SEG - 1 - Math.floor(deadT * 7); if (i === bi + 1 && !segs.userData['b' + i]) { segs.userData['b' + i] = 1; K.fx.burst(p, 40, i % 2 ? '#ffffff' : ctx.pal.a, { speed: 12, g: 8, life: 0.8, size: 0.4 }); K.fx.light(p, ctx.pal.a, 30, 6); ctx.shed(p, 4, ctx.pal.a, 1.2, 0.8); if (i % 4 === 0) ctx.sfx('pop'); } if (i > bi + 1) { segs.setMatrixAt(i, m4.makeScale(0, 0, 0)); fins.setMatrixAt(i, m4); rings.setMatrixAt(i, m4); sides.setMatrixAt(i * 2, m4); sides.setMatrixAt(i * 2 + 1, m4); } }
    }
    segs.setMatrixAt(0, m4.makeScale(0, 0, 0)); fins.setMatrixAt(0, m4); rings.setMatrixAt(0, m4); sides.setMatrixAt(0, m4); sides.setMatrixAt(1, m4);
    for (const m of [segs, fins, sides, rings]) m.instanceMatrix.needsUpdate = true;
    rings.instanceColor.needsUpdate = true;
    // the tail blade on the last segment
    const L = SEG - 1;
    tailFin.position.copy(segPos[L]); tailFin.quaternion.copy(segQ[L]); tailFin.rotateX(-Math.PI / 2); tailFin.scale.setScalar(dead && deadT > 0.3 ? 0.001 : 1.4);
    // weak point and decoy cores
    weakCore.visible = weakI >= 0; if (weakI >= 0) { weakCore.position.copy(segPos[weakI]).y += 0.4; weakCore.rotation.set(t * 2, t * 3, 0); weakCore.scale.setScalar(1 + Math.sin(t * 20) * 0.08); weakHalo.material.uniforms.uT.value = t; }
    decoyCore.visible = decoyI >= 0; if (decoyI >= 0) { decoyCore.position.copy(segPos[decoyI]).y += 0.4; decoyCore.rotation.set(t, t * 2, 0); decoyMat.color.copy(C('#ff4d5e', 2 + Math.sin(t * 14) * 0.8)); }
    for (const m of [bodyMat, finMat, headMat]) { m.userData.u.uSeam.value.copy(ctx.pal.a).multiplyScalar(m === finMat ? 0.6 : 0.9); m.userData.u.uRim.value.copy(ctx.pal.a).multiplyScalar(0.35 + skyFlash * 0.8); m.userData.u.uFlash.value = bigFlash * 0.5; m.userData.u.uHeat.value = dead ? smooth(deadT / 1.5) : finishing ? 0.2 + Math.sin(t * 6) * 0.08 : 0; }
    // packets fly an arc from the jaws to Art
    for (const [, q] of pk) {
      const u = clamp(1 - q.left / Math.max(1, q.total), 0, 1);
      v1.copy(q.from).lerp(v2.copy(art).setY(1.6), ease(u) * 0.94); v1.y += Math.sin(u * Math.PI) * 4;
      q.m.position.lerp(v1, Math.min(1, dt * 10)); q.m.rotation.set(t * 4, t * 3, 0);
      q.left = Math.max(0, q.left - dt * 1000);
      if (Math.random() < dt * 30) K.fx.spark(q.m.position, v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), C('#9ff6ff'), { size: 0.3, life: 0.3, drag: 3 });
    }
    // light on the water: the head, the weak point, the storm
    ctx.lightPool(1, head.position, ctx.pal.a, 0.8 + throat * 0.2);
    if (weakI >= 0) ctx.lightPool(2, segPos[weakI], '#ffffff', 0.9);
    if (decoyI >= 0) ctx.lightPool(3, segPos[decoyI], '#ff4d5e', 0.7);
    if (skyFlash > 0) ctx.lightPool(4, v1.set(0, 30, -30), '#cfe8ff', skyFlash * 2);
    ctx.skyFlash = skyFlash;
  }

  function reset() {
    dead = false; deadT = 0; atk = null; weakI = decoyI = -1; head.userData.splash = false;
    for (const k of Object.keys(segs.userData)) delete segs.userData[k];
    for (const [, q] of pk) q.m.visible = false; pk.clear();
  }
  function anchor(key, out) {
    if (key === 'seg:front') { const i = weakI >= 0 ? weakI : frontI; return out.copy(segPos[i]).setY(segPos[i].y + 3.6); }
    if (key === 'seg:far') { const i = decoyI >= 0 ? decoyI : 12; return out.copy(segPos[i]).setY(segPos[i].y + 3.6); }
    if (key === 'head') return out.copy(head.position).setY(head.position.y + 3.4);
    if (key.startsWith('packet:')) { const q = pk.get(key.slice(7)); return q ? out.copy(q.m.position).setY(q.m.position.y + 1.6) : null; }
    if (key === 'core') return out.copy(segPos[weakI >= 0 ? weakI : frontI]);
    if (key === 'body') return out.copy(segPos[Math.floor(SEG / 2)]);
    return null;
  }
  function worldOf(at, out) {
    if (at === 'seg:front') return out.copy(segPos[weakI >= 0 ? weakI : frontI]);
    if (at === 'head') return out.copy(head.position);
    return out.copy(segPos[frontI]);
  }
  function attacker(attack, owner, out) { return out.copy(head.position); }
  const subjects = { core: new V(), head: new V(), top: new V(0, 16, -8), body: new V() };
  function subj() { subjects.head.copy(head.position); subjects.core.copy(segPos[weakI >= 0 ? weakI : frontI]); subjects.body.copy(segPos[12]); return subjects; }

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

  return { group, props, update, event, apply, packets, anchor, worldOf, attacker, subj, reset, dispose() {}, height: 15, width: 42, focus: new V(0, 6.5, -6), face: 'head', info: () => ({ weakI, decoyI, frontI, atk: atk && atk.kind, packets: pk.size }) };
};
