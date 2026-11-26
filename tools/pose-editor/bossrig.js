// maps a BossKit boss onto joint-check's humanoid joints
export function bossSpec(b, S) {
  const B = b.bones, L = S.legs, spec = {};
  for (const k of ['L', 'R']) {
    const side = k === 'L' ? 'left' : 'right';
    spec['shoulder' + k] = { bone: B['arm' + k], tip: B['fore' + k], type: 'shoulder', label: side + ' shoulder', noShape: true };
    spec['elbow' + k] = { bone: B['fore' + k], tip: B['hand' + k], type: 'elbow', label: side + ' elbow' };
    spec['wrist' + k] = { bone: B['hand' + k], tip: { at: [0, -S.fist, 0] }, type: 'wrist', label: side + ' wrist', noShape: true };
    if (L) {
      spec['hip' + k] = { bone: B['thigh' + k], tip: B['shin' + k], type: 'hip', label: side + ' hip' };
      spec['knee' + k] = { bone: B['shin' + k], tip: { at: [0, -L.shin, 0] }, type: 'knee', label: side + ' knee' };
    }
  }
  spec.spine = { bone: B.spine, tip: B.chest, type: 'spine' };
  spec.chest = { bone: B.chest, tip: B.neck, type: 'spine' };
  spec.neck = { bone: B.neck, tip: B.head, type: 'neck', noShape: true };
  spec.head = { bone: B.head, tip: { at: [0, S.head, 0] }, type: 'head' };
  return spec;
}
export function bossChecks(JC, THREE, b, S, id) {
  const B = b.bones;
  for (const k in B) B[k].rotation.set(0, 0, 0);
  B.hips.position.y = S.legs ? S.legs.hip : S.hover;
  b.group.updateMatrixWorld(true);
  const rig = JC.describe(THREE, b.group, bossSpec(b, S), { height: S.height, ground: 0 });
  JC.captureRest(rig);
  const res = { id, shape: JC.checkShape(rig, { mirror: [['shoulderL', 'shoulderR'], ['elbowL', 'elbowR'], ['hipL', 'hipR'], ['kneeL', 'kneeR']] }), poses: {} };
  const body = [B.chest, B.spine, B.hips, B.neck, B.head];
  const pairs = [[['left forearm and fist', [B.foreL, B.handL]], ['body', body]], [['right forearm and fist', [B.foreR, B.handR]], ['body', body]]];
  if (S.legs) pairs.push([['left leg', [B.thighL, B.shinL]], ['right leg', [B.thighR, B.shinR]]]);
  for (const p of Object.keys(b.POSES)) {
    b.mix([[p, 1]]); b.group.updateMatrixWorld(true);
    const r = [...JC.check(rig, p), ...JC.checkClips(rig, pairs, p)];
    if (S.legs && id !== 'king') r.push(...JC.checkGround(rig, [['left foot', [B.footL || B.shinL]], ['right foot', [B.footR || B.shinR]]], p, { planted: p === 'idle' }));
    res.poses[p] = r;
  }
  b.mix([['idle', 1]]);
  return { rig, res };
}
