// joint-check.js: checks where a character's joints sit and how far they bend, for any three.js rig
// (procedural bone groups like BossKit, or a loaded GLB skeleton). Pure ES module: pass THREE in.
//
//   const rig = JC.describe(THREE, root, spec)      // spec: humanoid or quadruped joints (see PRESETS)
//   JC.captureRest(rig)                             // with the rig in its rest pose (limbs straight)
//   JC.bend(rig, 'elbowL', { flex: 40 })            // -> [x, y, z] Euler for that bone, the right sign per side
//   const r = JC.check(rig, 'punch')                // after posing: [{ pose, joint, rule, value, limit, msg }]
//   const g = JC.checkShape(rig)                    // at rest: pivots inside the body, symmetry, proportions
//
// Angles are in degrees everywhere in this file. "front" is the way the character faces at rest.

// Limits for a healthy body, slightly past the textbook range so stylized poses still pass.
// hinge: flex = bend toward `bend` side; side = bend sideways (a hinge has none); twist about the bone.
// ball:  flex = segment swung forward, ext = swung back, abd = out to the side, add = across the midline.
export const LIMITS = {
  // humanoid
  shoulder: { kind: 'ball', flex: 180, ext: 60, abd: 180, add: 45, twist: 100 },
  elbow:    { kind: 'hinge', bend: 'front', flex: [-8, 150], side: 12, twist: 95 },
  wrist:    { kind: 'ball', flex: 80, ext: 75, abd: 25, add: 40, twist: 20 },
  hip:      { kind: 'ball', flex: 125, ext: 35, abd: 55, add: 30, twist: 50 },
  knee:     { kind: 'hinge', bend: 'back', flex: [-5, 150], side: 8, twist: 25 },
  ankle:    { kind: 'hinge', bend: 'front', flex: [-50, 30], side: 25, twist: 25 },
  spine:    { kind: 'segment', max: 40 },
  neck:     { kind: 'segment', max: 60 },
  head:     { kind: 'segment', max: 60 },
  // four-legged: a joint's point faces away from the way it bends. Front leg: the elbow points back
  // (bends forward), the wrist (carpus) folds the paw back. Hind leg: the knee (stifle) points forward
  // (bends back), the hock points back (bends forward).
  qShoulder: { kind: 'ball', flex: 110, ext: 70, abd: 30, add: 20, twist: 30 },
  qElbow:    { kind: 'hinge', bend: 'front', flex: [-10, 140], side: 10, twist: 20 },
  carpus:    { kind: 'hinge', bend: 'back', flex: [-15, 140], side: 12, twist: 15 },
  qHip:      { kind: 'ball', flex: 110, ext: 60, abd: 35, add: 20, twist: 30 },
  stifle:    { kind: 'hinge', bend: 'back', flex: [-10, 140], side: 8, twist: 15 },
  hock:      { kind: 'hinge', bend: 'front', flex: [-10, 140], side: 10, twist: 15 },
  tail:      { kind: 'segment', max: 75 },
};

// spec entries: name -> { bone, tip, type }  where tip is the next joint's bone, or { bone, at:[x,y,z] }
// (a point in the bone's own space, for the end of a chain: the sole of a foot, the end of a fist)
export function describe(THREE, root, spec, opts = {}) {
  const front = new THREE.Vector3(...(opts.front || [0, 0, 1])).normalize();
  const up = new THREE.Vector3(...(opts.up || [0, 1, 0])).normalize();
  const joints = {};
  for (const [name, j] of Object.entries(spec)) {
    if (!j || !j.bone) continue;
    const lim = LIMITS[j.type];
    if (!lim) throw new Error(`joint ${name}: unknown type ${j.type}`);
    joints[name] = { name, ...j, lim };
  }
  const bones = new Set(Object.values(joints).map(j => j.bone));
  return { THREE, root, joints, bones, front, up, height: opts.height || null, ground: opts.ground, rest: null };
}

const D = 180 / Math.PI;

function tipLocal(rig, j) {
  const { THREE } = rig;
  // the tip in the joint bone's own space
  if (j.tip && j.tip.isObject3D) return j.tip.position.clone();
  if (j.tip && j.tip.at) return new THREE.Vector3(...j.tip.at);
  throw new Error(`joint ${j.name}: no tip`);
}

// Rest data, per joint, all in the frame of the joint bone's parent (which moves with the body, so
// "front" and "out" stay anatomical however the body is posed).
export function captureRest(rig) {
  const { THREE, root, joints } = rig;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  rig.height = rig.height || box.max.y - box.min.y;
  rig.groundY = rig.ground != null ? rig.ground : box.min.y;
  const mid = new THREE.Vector3(); box.getCenter(mid);
  rig.rest = {};
  for (const j of Object.values(joints)) {
    const b = j.bone, p = b.parent;
    const pq = new THREE.Quaternion(); p.getWorldQuaternion(pq);
    const inv = pq.clone().invert();
    const s = tipLocal(rig, j);
    const a = s.clone().applyQuaternion(b.quaternion).normalize();             // segment at rest, parent frame
    const f = rig.front.clone().applyQuaternion(inv);                           // character front, parent frame
    const u = rig.up.clone().applyQuaternion(inv);
    const wp = new THREE.Vector3(); b.getWorldPosition(wp);
    const outW = new THREE.Vector3(wp.x - mid.x, 0, wp.z - mid.z);
    outW.sub(rig.front.clone().multiplyScalar(outW.dot(rig.front)));          // sideways part only
    const side = outW.length() > rig.height * 0.02 ? Math.sign(outW.dot(new THREE.Vector3().crossVectors(rig.up, rig.front))) : 0;
    const out = new THREE.Vector3().crossVectors(rig.up, rig.front).multiplyScalar(side || 1).applyQuaternion(inv);
    rig.rest[j.name] = { s, a, f, u, out, side, q0: b.quaternion.clone(), wp: wp.clone() };
  }
  return rig;
}

function frameFor(rig, j) {
  const { THREE } = rig, R = rig.rest[j.name];
  const a = R.a.clone();
  let f = (j.lim.bend === 'back' ? R.f.clone().negate() : R.f.clone());
  f.sub(a.clone().multiplyScalar(f.dot(a)));
  if (f.lengthSq() < 1e-6) f = R.u.clone().sub(a.clone().multiplyScalar(R.u.dot(a)));   // segment along front: use up
  f.normalize();
  const lat = new THREE.Vector3().crossVectors(a, f);
  return { a, f, lat };
}

function twistOf(rig, q, axis) {
  // swing-twist split: rotation about `axis` contained in q, signed degrees
  const w = q.w < 0 ? -1 : 1;
  const t = new rig.THREE.Vector3(q.x * w, q.y * w, q.z * w).dot(axis);
  return 2 * Math.atan2(t, q.w * w) * D;
}

// angles of one joint as it stands now
export function measure(rig, name) {
  const { THREE } = rig, j = rig.joints[name], R = rig.rest[name];
  const q = j.bone.quaternion.clone();
  const d = R.s.clone().applyQuaternion(q).normalize();
  const rel = R.q0.clone().invert().multiply(q);                          // change from rest, bone frame
  const twist = twistOf(rig, rel, R.s.clone().normalize());
  if (j.lim.kind === 'hinge') {
    const { a, f, lat } = frameFor(rig, j);
    return { flex: Math.atan2(d.dot(f), d.dot(a)) * D, side: Math.asin(Math.max(-1, Math.min(1, d.dot(lat)))) * D, twist };
  }
  if (j.lim.kind === 'ball') {
    // swing of the segment away from its rest line, split into forward/back and out/in
    const a = R.a, f = R.f.clone().sub(a.clone().multiplyScalar(R.f.dot(a))).normalize();
    const o = R.out.clone().sub(a.clone().multiplyScalar(R.out.dot(a))).sub(f.clone().multiplyScalar(R.out.dot(f))).normalize();
    const da = d.dot(a), df = d.dot(f), dout = d.dot(o);
    return { fwd: Math.atan2(df, Math.max(1e-6, Math.hypot(da, dout))) * D, outA: Math.atan2(dout, Math.max(1e-6, Math.hypot(da, df))) * D, swing: Math.acos(Math.max(-1, Math.min(1, da))) * D, twist, da };
  }
  return { angle: 2 * Math.acos(Math.min(1, Math.abs(rel.w))) * D };
}

// Euler angles that bend a joint the anatomical way, for this rig's axes and this side of the body.
// hinge: { flex, side, twist };  ball: { flex (forward), abd (out), twist };  segment: same as ball
export function bend(rig, name, { flex = 0, side = 0, abd = 0, twist = 0 } = {}, order) {
  const { THREE } = rig, j = rig.joints[name], R = rig.rest[name];
  const rad = x => x / D;
  let qb;
  if (j.lim.kind === 'hinge') {
    const { a, f, lat } = frameFor(rig, j);
    const qF = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(a, f).normalize(), rad(flex));
    const qS = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(a, lat).normalize(), rad(side));
    qb = qS.multiply(qF);
  } else {
    const a = R.a, f = R.f.clone().sub(a.clone().multiplyScalar(R.f.dot(a))).normalize();
    const o = R.out.clone().sub(a.clone().multiplyScalar(R.out.dot(a))).sub(f.clone().multiplyScalar(R.out.dot(f))).normalize();
    const qA = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(a, o).normalize(), rad(abd || side));
    const qF = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(a, f).normalize(), rad(flex));
    qb = qF.multiply(qA);
  }
  const qT = new THREE.Quaternion().setFromAxisAngle(R.s.clone().normalize(), rad(twist));   // bone frame
  const q = qb.multiply(R.q0.clone()).multiply(qT);
  const e = new THREE.Euler().setFromQuaternion(q, order || j.bone.rotation.order);
  const r3 = x => Math.round(x * 1000) / 1000;
  return [r3(e.x), r3(e.y), r3(e.z)];
}

// ---------- range-of-motion check for the current pose ----------
export function check(rig, pose = '') {
  const out = [];
  const add = (joint, rule, value, limit, msg) => out.push({ pose, joint, rule, value: Math.round(value), limit, msg });
  for (const j of Object.values(rig.joints)) {
    const L = j.lim, m = measure(rig, j.name), nm = j.label || j.name;
    if (L.kind === 'hinge') {
      if (m.flex < L.flex[0]) add(j.name, 'wrong way', m.flex, L.flex[0], `${nm} bends ${Math.round(-m.flex)}° the wrong way (${L.bend === 'front' ? 'backward' : 'forward'}); it only bends ${L.bend === 'front' ? 'forward' : 'backward'}`);
      if (m.flex > L.flex[1]) add(j.name, 'too far', m.flex, L.flex[1], `${nm} folds ${Math.round(m.flex)}°, past ${L.flex[1]}°`);
      if (Math.abs(m.side) > L.side) add(j.name, 'sideways', m.side, L.side, `${nm} bends ${Math.round(Math.abs(m.side))}° sideways; it's a hinge and only bends one way`);
      if (Math.abs(m.twist) > L.twist) add(j.name, 'twist', m.twist, L.twist, `${nm} twists ${Math.round(Math.abs(m.twist))}°, past ${L.twist}°`);
    } else if (L.kind === 'ball') {
      if (m.fwd < -L.ext) add(j.name, 'behind', m.fwd, -L.ext, `${nm} swings ${Math.round(-m.fwd)}° behind the body, past ${L.ext}°`);
      if (m.fwd > L.flex) add(j.name, 'too far forward', m.fwd, L.flex, `${nm} swings ${Math.round(m.fwd)}° forward, past ${L.flex}°`);
      if (m.outA < -L.add) add(j.name, 'across', m.outA, -L.add, `${nm} crosses ${Math.round(-m.outA)}° toward the other side, past ${L.add}°`);
      if (m.outA > L.abd) add(j.name, 'too far out', m.outA, L.abd, `${nm} swings ${Math.round(m.outA)}° out to the side, past ${L.abd}°`);
      if (Math.abs(m.twist) > L.twist) add(j.name, 'twist', m.twist, L.twist, `${nm} twists ${Math.round(Math.abs(m.twist))}°, past ${L.twist}°`);
    } else if (m.angle > L.max) add(j.name, 'too far', m.angle, L.max, `${nm} turns ${Math.round(m.angle)}° in one bone, past ${L.max}°; spread it over the chain`);
  }
  return out;
}

// ---------- geometry: what's attached to which bone ----------
// meshes whose nearest bone above them is one of `bones` (bones = the rig's joint bones plus the ones asked for)
function meshesOf(rig, bones) {
  const want = new Set(bones), stop = new Set([...rig.bones, ...bones, rig.root]), out = [];
  rig.root.traverse(o => {
    if (!o.isMesh || !o.geometry || o.isInstancedMesh || o.userData.jcSkip) return;
    for (let p = o.parent; p; p = p.parent) if (stop.has(p)) { if (want.has(p)) out.push(o); break; }
  });
  return out;
}
function boxOf(m) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); return m.geometry.boundingBox; }
// vertices plus a 3x3x3 grid over the part's box, so face centres count too (a chamfered box has no vertex
// in the middle of its top face, which is exactly where a limb meets the joint above it)
function samplePts(THREE, m, n = 160) {
  const pos = m.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / n)), pts = [];
  for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  const b = boxOf(m);
  for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) for (const fz of [0, 0.5, 1])
    pts.push(new THREE.Vector3(b.min.x + (b.max.x - b.min.x) * fx, b.min.y + (b.max.y - b.min.y) * fy, b.min.z + (b.max.z - b.min.z) * fz).applyMatrix4(m.matrixWorld));
  return pts;
}
function insideAny(THREE, p, meshes, shrink = 0.12) {
  for (const m of meshes) {
    const b = boxOf(m), l = p.clone().applyMatrix4(m.matrixWorld.clone().invert());
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).multiplyScalar(0.5 * (1 - shrink));
    if (Math.abs(l.x - c.x) < s.x && Math.abs(l.y - c.y) < s.y && Math.abs(l.z - c.z) < s.z) return true;
  }
  return false;
}
function distToMeshes(THREE, p, meshes) {
  let best = Infinity;
  for (const m of meshes) {
    const l = p.clone().applyMatrix4(m.matrixWorld.clone().invert()), b = boxOf(m);
    const q = l.clone().clamp(b.min, b.max).applyMatrix4(m.matrixWorld);
    best = Math.min(best, q.distanceTo(p));
  }
  return best;
}

// Parts sinking into each other in the current pose. pairs: [[labelA, bonesA], [labelB, bonesB]]
export function checkClips(rig, pairs, pose = '', share = 0.15) {
  const { THREE } = rig, out = [];
  rig.root.updateMatrixWorld(true);
  for (const [[la, ba], [lb, bb]] of pairs) {
    const A = meshesOf(rig, ba), Bm = meshesOf(rig, bb);
    if (!A.length || !Bm.length) continue;
    let n = 0, inn = 0;
    for (const m of A) for (const p of samplePts(THREE, m)) { n++; if (insideAny(THREE, p, Bm)) inn++; }
    if (n && inn / n > share) out.push({ pose, joint: la, rule: 'clips', value: Math.round(100 * inn / n), limit: Math.round(share * 100), msg: `${Math.round(100 * inn / n)}% of the ${la} is buried in the ${lb}` });
  }
  return out;
}

// Feet on the ground: lowest point of each foot's meshes against the rest ground line.
export function checkGround(rig, feet, pose = '', { planted = true } = {}) {
  const { THREE } = rig, out = [], H = rig.height;
  rig.root.updateMatrixWorld(true);
  for (const [label, bones] of feet) {
    let lo = Infinity;
    for (const m of meshesOf(rig, bones)) for (const p of samplePts(THREE, m, 400)) lo = Math.min(lo, p.y);
    if (!isFinite(lo)) continue;
    const dy = lo - rig.groundY;
    if (dy < -0.03 * H) out.push({ pose, joint: label, rule: 'sinks', value: +(dy / H * 100).toFixed(1), limit: -3, msg: `${label} sinks ${(-dy).toFixed(2)} into the floor (${(-dy / H * 100).toFixed(0)}% of height)` });
    if (planted && dy > 0.04 * H) out.push({ pose, joint: label, rule: 'floats', value: +(dy / H * 100).toFixed(1), limit: 4, msg: `${label} floats ${dy.toFixed(2)} above the floor in a standing pose` });
  }
  return out;
}

// At rest: each pivot inside the body it moves, the limb still attached when the joint bends,
// and left matching right.
export function checkShape(rig, { mirror = [], bendTest = 70 } = {}) {
  const { THREE } = rig, out = [], H = rig.height;
  rig.root.updateMatrixWorld(true);
  for (const j of Object.values(rig.joints)) {
    if (j.lim.kind === 'segment' || j.noShape) continue;
    const near = meshesOf(rig, [j.bone, j.bone.parent]);
    if (!near.length) continue;
    const wp = new THREE.Vector3(); j.bone.getWorldPosition(wp);
    const gap = distToMeshes(THREE, wp, near);
    if (gap > 0.025 * H) out.push({ joint: j.name, rule: 'pivot outside', value: +(gap / H * 100).toFixed(1), limit: 2.5, msg: `${j.label || j.name} pivots ${gap.toFixed(2)} outside the parts it joins; move the bone into the middle of the joint` });
    // bend it and see whether the moving part stays attached to the part above
    if (j.lim.kind === 'hinge' && j.tip && !j.noBendTest) {
      const keep = j.bone.rotation.toArray();
      const before = meshesOf(rig, [j.bone]);
      const above = meshesOf(rig, [j.bone.parent]);
      if (before.length && above.length) {
        j.bone.rotation.set(...bend(rig, j.name, { flex: Math.min(bendTest, j.lim.flex[1]) }));
        rig.root.updateMatrixWorld(true);
        let gapMin = Infinity;
        for (const m of before) for (const p of samplePts(THREE, m, 120)) gapMin = Math.min(gapMin, distToMeshes(THREE, p, above));
        if (gapMin > 0.02 * H) out.push({ joint: j.name, rule: 'comes apart', value: +(gapMin / H * 100).toFixed(1), limit: 2, msg: `bent ${bendTest}°, the part below ${j.label || j.name} separates by ${gapMin.toFixed(2)}; the pivot is not where the parts meet` });
        j.bone.rotation.set(...keep);
        rig.root.updateMatrixWorld(true);
      }
    }
  }
  for (const [l, r] of mirror) {
    const a = rig.rest[l]?.wp, b = rig.rest[r]?.wp;
    if (!a || !b) continue;
    const m = b.clone(); const x = new THREE.Vector3().crossVectors(rig.up, rig.front);
    m.sub(x.clone().multiplyScalar(2 * m.dot(x)));
    const d = m.distanceTo(a);
    if (d > 0.02 * H) out.push({ joint: `${l}/${r}`, rule: 'not mirrored', value: +(d / H * 100).toFixed(1), limit: 2, msg: `${l} and ${r} sit ${d.toFixed(2)} off from mirror images` });
  }
  return out;
}

// Proportions in head heights, as warnings: stylized designs break them on purpose.
export function proportions(rig, marks) {
  const { THREE } = rig, H = rig.height, y = o => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v.y - rig.groundY; };
  const r = {};
  for (const [k, o] of Object.entries(marks)) if (o) r[k] = +(y(o) / H).toFixed(3);
  return r;
}
