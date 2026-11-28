// Faceoff3D: the raid's half of the World Boss beam face-off (boss-rules.js FACEOFF), drawn in three.js.
// Every bot in the wedge feeds a strand of light into one orb in front of it; the orb is the arm cannon's
// charge (js/app/cannonfx.js) in the raid's cyan and grows with the power the raid has typed in; then it
// fires as one beam that meets the boss's at a point that slides toward the weaker side; the meeting point
// crackles, throws sparks and arcs and flashes harder as the struggle goes on. boss3d.js runs the boss's
// side, the camera and the bots' wedge; this draws the strands, the team orb and beam and the collision.
//
//   const fo = Faceoff3D.create(THREE, scene, { burst, flare, arc, reduce })
//   fo.update({ t, phase, u, power, bots: [V3], orb: V3, point: V3, bossAt: V3, win, you })
//     phase  null | 'gather' (the wedge forms) | 'charge' | 'clash' | 'resolve'
//     u      0..1 through the phase; power 0..1.5 the raid's power over what it needs
//     bots   where each bot in the wedge is; orb where the team's orb hangs
//     point  where the beams meet (clash and resolve); bossAt where the team beam ends when it wins
//     win    null until it resolves, then true (the raid's beam goes through) or false
//     you    seconds since your last resistance word: your strand flares
//   fo.dispose()
window.Faceoff3D = (() => {
  const SEGS = 9, MAXB = 14;
  function create(THREE, scene, env = {}) {
    const V = THREE.Vector3, keep = [], own = x => (keep.push(x), x);
    const CY = new THREE.Color('#3ee6ff'), HOT = new THREE.Color('#e6fdff'), RED = new THREE.Color('#ff3a4a');
    const team = window.CannonFX ? CannonFX.create(THREE, { color: '#3ee6ff', scale: 0.58 }) : null;
    if (team) scene.add(team.group);
    // the strands: thin open cylinders, one instance a stretch
    const geo = own(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)); geo.translate(0, 0.5, 0);
    const mat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const strands = new THREE.InstancedMesh(geo, mat, MAXB * SEGS);
    strands.instanceMatrix.setUsage(THREE.DynamicDrawUsage); strands.frustumCulled = false; strands.count = 0; strands.renderOrder = 6;
    strands.setColorAt(0, CY); scene.add(strands);
    // the meeting point: a white core and two halos, one in each side's colour
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    { const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    const tex = own(new THREE.CanvasTexture(cv));
    const sprite = (c, k) => { const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: tex, color: c.clone().multiplyScalar(k), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))); s.visible = false; s.renderOrder = 9; scene.add(s); return s; };
    const core = sprite(HOT, 3), haloC = sprite(CY, 1.6), haloR = sprite(RED, 1.6);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V(), a = new V(), b = new V(), c1 = new V(), p = new V(), pv = new V(), up = new V(0, 1, 0), dir = new V(), col = new THREE.Color();
    let sparkAt = 0, arcAt = 0;
    const bez = (A, C, B, u, out) => out.set(0, 0, 0).addScaledVector(A, (1 - u) * (1 - u)).addScaledVector(C, 2 * u * (1 - u)).addScaledVector(B, u * u);

    function update(s) {
      if (!s || !s.phase) { strands.count = 0; core.visible = haloC.visible = haloR.visible = false; if (team) team.update(null); return; }
      const t = s.t, pw = Math.max(0, s.power || 0), firing = s.phase === 'clash' || s.phase === 'resolve';
      // the team's orb: it gathers light while the raid types, and fires into the meeting point
      if (team) {
        dir.copy(s.point || s.bossAt || s.orb).sub(s.orb).normalize();
        if (s.phase === 'gather') team.update({ phase: 'spark', u: s.u, t, at: s.orb, dir, target: s.point || s.bossAt, reduce: s.reduce });
        else if (s.phase === 'charge') team.update({ phase: 'grow', u: Math.min(0.98, 0.08 + 0.9 * Math.min(1, pw)), t, at: s.orb, dir, target: s.point || s.bossAt, reduce: s.reduce });
        else if (s.phase === 'clash') team.update({ phase: s.u < 0.12 ? 'fire' : 'beam', u: s.u < 0.12 ? s.u / 0.12 : 0.04 + 0.05 * Math.sin(t * 31), t, at: s.orb, dir, target: s.point, reduce: s.reduce });
        else {
          // resolved: through to the boss on a win, swallowed back on a loss
          const lose = s.win === false;
          team.update(lose ? (s.u < 0.35 ? { phase: 'beam', u: 0.35 + s.u * 1.8, t, at: s.orb, dir, target: s.point, reduce: s.reduce } : null)
            : { phase: 'beam', u: Math.min(0.95, 0.05 + s.u * 0.9), t, at: s.orb, dir: dir.copy(s.bossAt).sub(s.orb).normalize(), target: s.point, reduce: s.reduce });
        }
      }
      // strands from every bot to the orb, a brighter pulse running down each; yours flares on a word
      let n = 0;
      const on = s.phase === 'gather' ? s.u : s.phase === 'charge' ? 1 : s.phase === 'clash' ? 1 - s.u * 0.4 : Math.max(0, 0.6 - s.u);
      if (on > 0.02) {
        const bright = 0.55 + 0.9 * Math.min(1.2, pw);
        (s.bots || []).slice(0, MAXB).forEach((B, i) => {
          c1.copy(B).lerp(s.orb, 0.5); c1.y += 1.2 + (i % 3) * 0.5;
          const you = i === 0, flare = you && s.you != null ? Math.max(0, 1 - s.you / 0.45) : 0;
          const head = ((t * (0.9 + (i % 4) * 0.15) + i * 0.37) % 1);
          for (let k = 0; k < SEGS; k++) {
            const u0 = k / SEGS, u1 = (k + 1) / SEGS;
            if (u1 > on && s.phase === 'gather') break;
            bez(B, c1, s.orb, u0, a); bez(B, c1, s.orb, u1, b);
            const sway = Math.sin(t * 7 + i + k * 0.9) * 0.06 * Math.sin(u0 * Math.PI);
            a.x += sway; b.x += sway;
            dir.copy(b).sub(a); const len = dir.length(); dir.normalize();
            q.setFromUnitVectors(up, dir);
            const pulse = Math.exp(-Math.pow((u0 - head) * 7, 2));
            const w = (0.035 + 0.04 * Math.min(1, pw) + 0.05 * pulse + 0.07 * flare) * (you ? 1.5 : 1);
            sc.set(w, len, w); m4.compose(a, q, sc); strands.setMatrixAt(n, m4);
            col.copy(CY).lerp(HOT, Math.min(1, pulse * 0.8 + flare)).multiplyScalar((bright + 1.6 * pulse + 2.2 * flare) * on);
            strands.setColorAt(n, col); n++;
          }
        });
      }
      strands.count = n; strands.instanceMatrix.needsUpdate = true; if (strands.instanceColor) strands.instanceColor.needsUpdate = true;
      // the meeting point
      const meet = firing && s.point && !(s.phase === 'resolve' && s.u > 0.4);
      core.visible = haloC.visible = haloR.visible = !!meet;
      if (meet) {
        const k = s.phase === 'clash' ? 0.6 + 0.6 * s.u : 1.3, fl = 0.85 + 0.15 * Math.sin(t * 47) + 0.1 * Math.sin(t * 23);
        const lean = s.side || 0;   // -1 the raid is losing, +1 the boss is
        core.position.copy(s.point); core.scale.setScalar((1.5 + 0.9 * k) * fl * (s.reduce ? 0.7 : 1));
        haloC.position.copy(s.point).addScaledVector(dir.copy(s.orb).sub(s.point).normalize(), 0.6); haloC.scale.setScalar((2.8 + 1.3 * k) * (1 - 0.25 * lean) * fl);
        haloR.position.copy(s.point).addScaledVector(dir.multiplyScalar(-1), 0.6); haloR.scale.setScalar((2.8 + 1.3 * k) * (1 + 0.25 * lean) * fl);
        // sparks thrown off the collision and arcs crackling round it, more as the struggle goes on
        if (!s.reduce && env.burst && t - sparkAt > 0.05) { sparkAt = t; env.burst(s.point, Math.round(6 + 10 * k), 9 + 5 * k, Math.random() < 0.5 ? CY : RED, 0.9, 3); }
        if (!s.reduce && env.arc && t - arcAt > 0.07) {
          arcAt = t;
          for (let j = 0; j < 2; j++) { pv.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(2.5 + 3 * k * Math.random()); env.arc(s.point, p.copy(s.point).add(pv), Math.random() < 0.5 ? 0 : 1); }
        }
      }
    }
    function dispose() { if (team) team.dispose(); [strands, core, haloC, haloR].forEach(o => scene.remove(o)); keep.forEach(x => x.dispose && x.dispose()); core.material.dispose(); haloC.material.dispose(); haloR.material.dispose(); }
    return { update, dispose };
  }
  return { create };
})();
