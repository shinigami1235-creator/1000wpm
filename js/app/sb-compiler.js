// The Compiler (sb-scene.js mounts it): a monolith of a monitor that writes code at Art, in a hall of
// build pillars. The page lays the code lines over its screen (screenRect in sb-scene.js), so nothing
// of the model ever sits on the screen itself.
//   the eye      a lens on top that tracks Art; it charges and sweeps the segfault laser (phase 2 on)
//   the arms     two industrial arms that type on floating keyboards beside the screen; for a stack
//                overflow they lift a column of blocks overhead and hurl it; for a compile one slams
//                the enter key and the screen fires a red bolt
//   the racks    server towers at its shoulders; in phase 3 they launch fork bomb drones
// Arms are solved with two-bone IK and a pole behind the elbow, so the elbows always bend forward.
window.SuperModels = window.SuperModels || {};
SuperModels.compiler = function (THREE, K, ctx) {
  const V = THREE.Vector3;
  const { C, clamp, rnd } = K;
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = x => Math.pow(clamp(x, 0, 1), 2.2);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const art = ctx.artPos;
  const G = K.geo;
  const group = new THREE.Group(), props = new THREE.Group();
  const T = { x: 0, y: 10, z: -7, w: 23, h: 12.5 };   // the screen, as sb-scene.js knows it

  const frameMat = K.armor({ color: '#20262c', seam: '#3ee6ff', seamK: 0.9, rim: '#3ee6ff', rimK: 0.35, metal: 0.8, rough: 0.34, scale: 0.6, density: 0.35 });
  const darkMat = K.armor({ color: '#14181c', seam: '#3ee6ff', seamK: 0.5, rimK: 0.2, metal: 0.6, rough: 0.5, scale: 0.9, density: 0.25 });
  const armMat = K.armor({ color: '#2b3139', seam: '#3ee6ff', seamK: 0.8, rim: '#3ee6ff', rimK: 0.3, metal: 0.85, rough: 0.3, scale: 1.0, density: 0.3 });
  const ledMat = K.glow('#3ee6ff', 1.8);
  const redMat = K.glow('#ff4d5e', 2.6);
  const keyMat = K.glow('#3ee6ff', 1.1);

  // ---------- the monitor ----------
  const tower = new THREE.Group(); group.add(tower);
  {
    const { x, y, z, w, h } = T, bz = z - 0.2, d = 2.2, b = 1.3;
    const parts = [];
    parts.push([G.cbox(w + b * 2, b, d, 0.25), [x, y + h / 2 + b / 2, bz]]);
    parts.push([G.cbox(w + b * 2 + 0.6, b * 1.4, d + 0.4, 0.3), [x, y - h / 2 - b * 0.7, bz]]);
    for (const sd of [-1, 1]) parts.push([G.cbox(b, h + b * 2, d, 0.25), [x + sd * (w / 2 + b / 2), y, bz]]);
    parts.push([G.cbox(w + 1, h + 1, 1.2, 0.2), [x, y, bz - d / 2 - 0.4]]);                       // the back
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([G.cbox(2.2, 2.2, d + 0.6, 0.3), [x + cx * (w / 2 + b * 0.6), y + cy * (h / 2 + b * 0.6), bz]]);   // corner blocks
    for (let i = 0; i < 9; i++) parts.push([G.cbox(1.4, 0.35, 0.3, 0.05), [x - 8 + i * 2, y - h / 2 - b * 0.7 - 0.2, bz + d / 2 + 0.25]]);   // vents on the chin
    // the pedestal and its steps
    parts.push([G.cbox(w * 0.7, 3.4, 5, 0.3, 0.85, 1), [x, 1.7, z + 0.6]]);
    parts.push([G.cbox(w * 0.95, 1, 7.5, 0.25), [x, 0.5, z + 1.2]]);
    parts.push([G.cbox(4, y - h / 2 - 3, 2.6, 0.3), [x, 3.4 + (y - h / 2 - 3.4) / 2, z - 1]]);   // the neck down to the pedestal
    // the head unit that holds the eye
    parts.push([G.cbox(9, 4.6, 4.2, 0.6, 0.8, 1), [x, y + h / 2 + 3.4, z - 0.6]]);
    for (const sd of [-1, 1]) parts.push([G.cbox(2.6, 1.2, 3.6, 0.3), [x + sd * 5.2, y + h / 2 + 2.6, z - 0.6], [0, 0, sd * -0.35]]);
    for (const sd of [-1, 1]) parts.push([G.horn(3.4, 0.4, 0.5, 5, 4), [x + sd * 3.6, y + h / 2 + 5.2, z - 1.2], [-1.1, sd * 0.4, sd * 0.3]]);   // antennae
    tower.add(new THREE.Mesh(G.merge(parts), frameMat));
    // status LEDs along the bottom bezel
    const leds = [];
    for (let i = 0; i < 26; i++) leds.push([G.cbox(0.5, 0.18, 0.1, 0.03), [x - 12 + i * 0.96, y - h / 2 - 0.55, bz + d / 2 + 0.05]]);
    tower.add(new THREE.Mesh(G.merge(leds), ledMat));
  }
  // the screen: dark glass with a slow scan, brightening when a line compiles
  const screenMat = K.own(new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uC: { value: C('#3ee6ff') }, uPulse: { value: 0 }, uRed: { value: 0 }, uBreak: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 uC; uniform float uPulse; uniform float uRed; uniform float uBreak; varying vec2 vUv;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main(){ float scan = 0.5 + 0.5 * sin(vUv.y * 420.0); float band = smoothstep(0.0, 0.08, abs(fract(vUv.y - uT * 0.12) - 0.5));
        vec3 c = vec3(0.004, 0.018, 0.02) + uC * 0.03 * scan + uC * 0.05 * (1.0 - band);
        float edge = 1.0 - smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        c += uC * edge * 0.25 + uC * uPulse * 0.25 + vec3(1.0, 0.1, 0.15) * uRed * 0.35;
        // cracks when it breaks
        vec2 g = floor(vUv * vec2(14.0, 8.0)); float k = step(1.0 - uBreak, h21(g));
        c = mix(c, vec3(0.0), k * 0.85) + vec3(0.9, 0.95, 1.0) * k * step(0.94, fract(vUv.x * 14.0 + h21(g) * 3.0)) * uBreak;
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  const screen = new THREE.Mesh(K.own(new THREE.PlaneGeometry(T.w, T.h)), screenMat);
  screen.position.set(T.x, T.y, T.z + 0.85); tower.add(screen);

  // ---------- the eye ----------
  const eye = new THREE.Group(); eye.position.set(T.x, T.y + T.h / 2 + 3.4, T.z + 1.6); tower.add(eye);
  const lensRing = new THREE.Mesh(K.own(new THREE.TorusGeometry(1.75, 0.38, 8, 28)), armMat); eye.add(lensRing);
  const iris = new THREE.Mesh(K.own(new THREE.CircleGeometry(1.45, 32)), K.glow('#3ee6ff', 1.6)); iris.position.z = 0.05; eye.add(iris);
  const pupil = new THREE.Mesh(K.own(new THREE.CircleGeometry(0.55, 24)), K.glow('#ffffff', 3)); pupil.position.z = 0.1; eye.add(pupil);
  const shutter = [];   // the lens blades that close to a slit when it charges
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(G.cbox(1.5, 0.5, 0.12, 0.05), darkMat); m.position.z = 0.16; eye.add(m); shutter.push({ m, a: i / 6 * Math.PI * 2 }); }

  // ---------- server racks at the shoulders ----------
  {
    const parts = [], leds = [];
    for (const sd of [-1, 1]) {
      const x = T.x + sd * (T.w / 2 + 4.2);
      parts.push([G.cbox(4.4, 19, 4.4, 0.3), [x, 9.5, T.z - 1.4]]);
      parts.push([G.cbox(5.2, 1, 5.2, 0.2), [x, 19.3, T.z - 1.4]]);
      for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) leds.push([G.cbox(0.7, 0.14, 0.08, 0.02), [x - 1.2 + k * 1.2, 2 + i * 1.9, T.z + 0.85]]);
      // cables down into the floor
      for (let i = 0; i < 3; i++) parts.push([G.horn(9, 0.32, 1.4, 6, 8), [x + sd * (0.8 - i * 0.6), 6 - i * 1.2, T.z + 0.8], [Math.PI / 2 + 0.3, 0, sd * (0.4 + i * 0.25)]]);
    }
    tower.add(new THREE.Mesh(G.merge(parts), darkMat));
    tower.add(new THREE.Mesh(G.merge(leds), ledMat));
  }

  // ---------- arms ----------
  const UPPER = 7, FORE = 6.6;
  const arms = [-1, 1].map(sd => {
    const sh = new V(T.x + sd * (T.w / 2 + 4.2), 17.6, T.z + 1.2);
    const up = new THREE.Mesh(G.merge([[G.cbox(1.5, 1.5, UPPER, 0.35, 1, 1), [0, 0, UPPER / 2]], [G.cbox(1.9, 0.5, UPPER * 0.7, 0.15), [0, 0.85, UPPER / 2]]]), armMat);
    const fo = new THREE.Mesh(G.merge([[G.cbox(1.2, 1.2, FORE, 0.3, 1, 1), [0, 0, FORE / 2]], [G.cbox(0.4, 1.6, FORE * 0.6, 0.12), [0, 0, FORE * 0.45]]]), armMat);
    const jS = new THREE.Mesh(K.own(new THREE.SphereGeometry(1.25, 12, 8)), darkMat), jE = new THREE.Mesh(K.own(new THREE.SphereGeometry(1, 12, 8)), darkMat);
    // the hand: a claw of four fingers over a palm
    const hand = new THREE.Group();
    hand.add(new THREE.Mesh(G.cbox(2.2, 0.6, 1.8, 0.2), armMat));
    const fingers = [];
    for (let i = 0; i < 4; i++) { const f = new THREE.Group(); f.position.set(-0.8 + i * 0.53, 0, 0.8); const m = new THREE.Mesh(G.cbox(0.34, 0.34, 1.3, 0.1), armMat); m.position.z = 0.6; f.add(m); hand.add(f); fingers.push(f); }
    const glowBand = new THREE.Mesh(G.cbox(1.3, 0.25, 0.25, 0.05), ledMat); glowBand.position.set(0, 0.35, -0.3); hand.add(glowBand);
    // the floating keyboard it types on
    const kb = new THREE.Group();
    const kbBase = new THREE.Mesh(G.cbox(5, 0.35, 2.4, 0.12), darkMat); kb.add(kbBase);
    const keys = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) keys.push([G.cbox(0.55, 0.18, 0.55, 0.05), [-1.95 + c * 0.65, 0.25, -0.7 + r * 0.7]]);
    kb.add(new THREE.Mesh(G.merge(keys), keyMat));
    kb.position.set(T.x + sd * (T.w / 2 + 1.5), 4.2, T.z + 4.8); kb.rotation.set(0.25, -sd * 0.35, 0);
    for (const m of [up, fo, jS, jE, hand, kb]) group.add(m);
    return { sd, sh, up, fo, jS, jE, hand, fingers, kb, elbow: new V(), wrist: new V(), target: new V(), cur: new V(), limp: 0, fallV: new V(), fallen: false };
  });
  const tmpO = new THREE.Object3D(), qInv = new THREE.Quaternion();
  const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V();
  // two-bone IK: the elbow sits on the side of the pole (behind and out), so the arm bends forward
  function solveArm(a, target, pole) {
    const d = v1.copy(target).sub(a.sh), L = Math.min(d.length(), UPPER + FORE - 0.05), dir = d.normalize();
    const cosA = clamp((UPPER * UPPER + L * L - FORE * FORE) / (2 * UPPER * L), -1, 1), ang = Math.acos(cosA);
    const side = v2.copy(pole).sub(a.sh); side.sub(v3.copy(dir).multiplyScalar(side.dot(dir))).normalize();
    a.elbow.copy(a.sh).addScaledVector(dir, Math.cos(ang) * UPPER).addScaledVector(side, Math.sin(ang) * UPPER);
    a.wrist.copy(a.sh).addScaledVector(dir, L);
  }
  function placeSeg(m, from, to) { m.position.copy(from); m.lookAt(to); }

  // ---------- satellites: small screens orbiting the tower ----------
  const SAT = 14;
  const sats = new THREE.InstancedMesh(G.cbox(1.8, 1.2, 0.2, 0.08), frameMat, SAT); sats.frustumCulled = false; group.add(sats);
  const satGlow = new THREE.InstancedMesh(K.own(new THREE.PlaneGeometry(1.5, 0.9)), K.glow('#3ee6ff', 1.2), SAT); satGlow.frustumCulled = false; group.add(satGlow);

  // ---------- drones for the fork bomb ----------
  const droneGeo = G.merge([[G.cbox(1.1, 0.7, 1.1, 0.2)], [new THREE.OctahedronGeometry(0.45, 0), [0, -0.5, 0]]]);
  const drones = new Map();
  const dronePool = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(droneGeo, armMat); const g = new THREE.Mesh(K.own(new THREE.SphereGeometry(0.35, 10, 8)), redMat); g.position.y = -0.1; g.position.z = 0.6; m.add(g); m.visible = false; group.add(m); return m; });

  // ---------- state ----------
  let stackT = -9, stackLen = 1, thrown = false, laser = null, compileArm = 0, compileT = -9, roarT = -9, dead = false, deadT = 0, finishing = false, bigFlash = 0, screenPulse = 0, screenRed = 0;
  const stackBlocks = [];   // the overflow's column of blocks: { p, v, s, flying }

  function event(n, d, t) {
    if (n === 'windup' && d.kind === 'overflow') { stackT = t; stackLen = d.ms / 1000; thrown = false; stackBlocks.length = 0; stackMark = K.fx.mark(v1.copy(art).setY(0.06), 3.4, '#ff4d5e', 1); }
    if (n === 'windup' && d.kind === 'laser') { laser = { t0: t, len: d.ms / 1000, fired: false }; laser.orb = K.fx.orb('#ff4d5e', out => eye.getWorldPosition(out).add(v4.set(0, 0, 0.8))); laser.mark = K.fx.mark(v1.copy(art).setY(0.06), 3, '#ff4d5e', 1); }
    if (n === 'windup' && d.kind === 'bomb') { for (const a of arms) a.launch = t; ctx.sfx('launch'); }
    if (n === 'block' || n === 'blockFail' || n === 'cancel') {
      const hit = n === 'blockFail';
      if (d.attack === 'overflow') throwStack(hit, t);
      if (d.attack === 'laser') fireLaser(hit, t);
    }
    if (n === 'compile') {
      compileT = t; compileArm = Math.random() < 0.5 ? 0 : 1; screenRed = 1; screenPulse = 1;
      const from = v1.set(T.x + rnd(-8, 8), T.y + rnd(-3, 3), T.z + 1);
      K.fx.beam(from, ctx.artAim(v2), '#ff4d5e', 0.6, 0.35, { grow: 0.06 });
      K.fx.burst(v2, 40, '#ff8a8a', { speed: 10, g: 8, life: 0.5, size: 0.3 });
      K.fx.light(v2, '#ff4d5e', 40, 5);
    }
    if (n === 'fix') { screenPulse = Math.max(screenPulse, 0.6); K.fx.burst(v1.set(T.x + rnd(-8, 8), T.y + rnd(-4, 4), T.z + 1.2), 16, '#9ff6ff', { speed: 6, g: 2, life: 0.5, size: 0.25 }); }
    if (n === 'phase') { roarT = t; ctx.sfx('roar'); }
    if (n === 'hit' && (d.crit || d.src === 'counter')) bigFlash = 0.8;
    if (n === 'win') { dead = true; deadT = 0; if (laser) endLaser(); }
  }
  let stackMark = null;
  function throwStack(hit, t) {
    if (stackMark) { stackMark.off(); stackMark = null; }
    thrown = true;
    const to = hit ? ctx.artAim(v2) : ctx.shieldAt(v2);
    for (const b of stackBlocks) { b.flying = true; b.v.copy(to).sub(b.p).multiplyScalar(rnd(2.6, 3.4)); b.v.y += rnd(2, 5); b.to = to.clone(); }
    stackT = -9;
  }
  function fireLaser(hit, t) {
    if (!laser) return;
    eye.getWorldPosition(v1);
    const to = hit ? ctx.artAim(v2) : ctx.shieldAt(v2);
    K.fx.beam(v1, to, '#ff4d5e', 1.1, 0.6, { grow: 0.05 });
    K.fx.burst(to, hit ? 70 : 60, hit ? '#ffb3b3' : '#ffd0d0', { speed: 13, g: 6, life: 0.6, size: 0.32 });
    K.fx.light(to, '#ff4d5e', 60, 4);
    if (!hit) { K.fx.beam(to, v3.copy(v1).add(v4.set(rnd(-3, 3), 3, 0)), '#3ee6ff', 0.5, 0.35, { grow: 0.08 }); K.fx.shock(to, C('#3ee6ff'), 0.5, 5, 0.4, { flat: false, face: ctx.camPos }); bigFlash = 0.7; }
    endLaser();
  }
  function endLaser() { if (laser) { if (laser.orb) laser.orb.pop(); if (laser.mark) laser.mark.off(); } laser = null; }

  // ---------- packets: the fork bomb's drones ----------
  function packets(list, t) {
    const live = new Set();
    for (const p of list) {
      live.add(p.id);
      let d = drones.get(p.id);
      if (!d) { const m = dronePool.find(x => !x.visible); if (!m) continue; m.visible = true; d = { m, from: new V(T.x + (p.i % 2 ? 1 : -1) * (T.w / 2 + 4.2), 19.5, T.z - 1.4), pos: m.position, left: p.left, total: p.total, gone: 0 }; m.position.copy(d.from); drones.set(p.id, d); K.fx.burst(d.from, 20, '#ff4d5e', { speed: 6, g: 2, life: 0.4, size: 0.3 }); }
      d.left = p.left; d.total = p.total;
    }
    for (const [id, d] of drones) if (!live.has(id) && !d.gone) {
      d.gone = t;
      K.fx.burst(d.pos, 40, '#ffb0b0', { speed: 10, g: 6, life: 0.5, size: 0.3 }); K.fx.shock(d.pos, C('#ff4d5e'), 0.3, 3, 0.3, { flat: false, face: ctx.camPos });
      d.m.visible = false; drones.delete(id);
    }
  }

  // ---------- frame ----------
  function update(t, dt, S) {
    finishing = !!S.finishing;
    if (S.dead && !dead) { dead = true; deadT = 0; }
    if (!S.dead && dead && !S.lost) { dead = false; reset(); }
    if (dead) deadT += dt;
    bigFlash = Math.max(0, bigFlash - dt * 5); screenPulse = Math.max(0, screenPulse - dt * 2); screenRed = Math.max(0, screenRed - dt * 1.5);
    const rec = S.recoil * 0.5 + S.kb * 1.4;
    const roar = t - roarT < 2 ? Math.sin(clamp((t - roarT) / 2, 0, 1) * Math.PI) : 0;
    const sag = finishing ? 1 : 0;
    // the tower: recoil, a sag on the finish, a collapse when it dies
    const fall = dead ? easeIn(clamp((deadT - 1.8) / 2.5, 0, 1)) : 0;
    tower.position.set(Math.sin(t * 37) * (bigFlash * 0.12 + roar * 0.1), -sag * 0.8 - fall * 14, -rec);
    tower.rotation.set(-sag * 0.06 + fall * 0.25, 0, (finishing ? Math.sin(t * 1.6) * 0.02 : 0) + fall * 0.15);
    for (const m of [frameMat, darkMat, armMat]) { m.userData.u.uSeam.value.copy(ctx.pal.a).multiplyScalar(m === darkMat ? 0.5 : 0.9); m.userData.u.uRim.value.copy(ctx.pal.a).multiplyScalar(0.3); m.userData.u.uFlash.value = bigFlash * 0.5; m.userData.u.uHeat.value = dead ? smooth((deadT - 0.3) / 1.6) : finishing ? 0.2 + Math.sin(t * 7) * 0.08 : 0; }
    ledMat.color.copy(ctx.pal.a).multiplyScalar(1.4 + Math.sin(t * 5) * 0.3 + (finishing ? Math.sin(t * 23) * 0.8 : 0));
    keyMat.color.copy(ctx.pal.a).multiplyScalar(0.9);
    screenMat.uniforms.uT.value = t; screenMat.uniforms.uC.value.copy(ctx.pal.a); screenMat.uniforms.uPulse.value = (screenPulse + roar) * 0.4; screenMat.uniforms.uRed.value = (screenRed + (finishing ? 0.4 + Math.sin(t * 9) * 0.2 : 0)) * 0.6;
    screenMat.uniforms.uBreak.value = dead ? clamp(deadT / 0.6, 0, 0.75) : 0;
    tower.updateMatrixWorld();

    // the eye: tracks Art, a shutter that closes to a slit as the laser charges
    eye.getWorldPosition(v1);
    let lookAt = v2.copy(art).setY(2);
    let charge = 0;
    if (laser) {
      const u = clamp((t - laser.t0) / laser.len, 0, 1); charge = u;
      if (laser.orb) laser.orb.grow(0.3 + u * 0.9);
      if (laser.mark) laser.mark.set(u);
      // the aim: a thin red line sweeping over the floor toward Art over the last half
      if (u > 0.45) {
        const s = (u - 0.45) / 0.55, sweep = v3.set(art.x + (1 - s) * 16 * (Math.sin(laser.t0 * 7) > 0 ? 1 : -1), 0.1, art.z - 2 - (1 - s) * 6);
        lookAt.copy(sweep);
        if (Math.random() < dt * 30) { K.fx.spark(sweep, v4.set(rnd(-2, 2), rnd(2, 5), rnd(-1, 1)), C('#ff6b78'), { size: 0.3, life: 0.4, g: 10 }); }
        laser.aim = (laser.aim || 0) + dt;
        if (laser.aim > 0.05) { laser.aim = 0; K.fx.beam(v1, sweep, '#ff4d5e', 0.12, 0.08, { grow: 0.01 }); }
      }
      if (Math.random() < dt * 40) K.fx.suck(v1, 3, 1, '#ff6b78', 0.4, 0.25);
      if (t - laser.t0 > laser.len + 0.8) endLaser();
    }
    tmpO.position.copy(v1); tmpO.lookAt(lookAt);
    eye.quaternion.slerp(tmpO.quaternion.premultiply(qInv.copy(tower.quaternion).invert()), Math.min(1, dt * 6));
    const open = dead ? Math.max(0, 1 - deadT * 1.5) : 1 - charge * 0.75;
    shutter.forEach((s2, i) => { const a = s2.a + t * 0.2; s2.m.position.set(Math.cos(a) * (0.6 + open * 1.1), Math.sin(a) * (0.6 + open * 1.1), 0.16); s2.m.rotation.z = a + Math.PI / 2; });
    iris.material.color.copy(charge > 0 ? C('#ff4d5e', 1.6 + charge * 2) : C(ctx.pal.a.getHex(), 1.4 + bigFlash * 2 + roar * 2)).multiplyScalar(dead ? Math.max(0.1, 1 - deadT * 0.6) * (Math.random() < 0.3 ? 0.3 : 1) : finishing ? (Math.random() < 0.15 ? 0.3 : 1) : 1);
    pupil.scale.setScalar(0.6 + charge * 0.8 + roar * 0.5);
    ctx.lightPool(1, v1, charge > 0 ? '#ff4d5e' : ctx.pal.a, 0.6 + charge * 1.5 + roar);

    // the stack overflow: blocks gather overhead between the hands, then fly
    if (stackT > 0 && !thrown) {
      const u = clamp((t - stackT) / stackLen, 0, 1);
      if (stackMark) stackMark.set(u);
      const want = Math.floor(u * 22);
      while (stackBlocks.length < want) { const i = stackBlocks.length; stackBlocks.push({ p: new V(T.x + rnd(-1.5, 1.5), T.y + T.h / 2 + 8.5 + i * 0.75, T.z + 2 + rnd(-0.5, 0.5)), v: new V(), s: rnd(1, 1.6), flying: false, r: rnd(0, 6) }); }
      if (t - stackT > stackLen + 1) stackT = -9;
    }
    for (let i = stackBlocks.length - 1; i >= 0; i--) {
      const b = stackBlocks[i];
      if (b.flying) {
        b.v.y -= 9 * dt; b.p.addScaledVector(b.v, dt); b.r += dt * 9;
        if (b.p.distanceTo(b.to) < 1.6 || b.p.y < 0.3) { K.fx.burst(b.p, 8, '#ffb0b0', { speed: 8, g: 10, life: 0.4, size: 0.3 }); stackBlocks.splice(i, 1); continue; }
      }
      ctx.put(b.p, b.s, b.s, b.s, b.r * 0.3, b.r * 0.2 + t * 0.5, 0, b.flying ? C('#ff6b78') : ctx.pal.a, b.flying ? 2 : 1.4 + Math.sin(t * 9 + i) * 0.3);
    }

    // the arms
    const stackU = stackT > 0 && !thrown ? clamp((t - stackT) / stackLen, 0, 1) : 0;
    for (const a of arms) {
      const sd = a.sd;
      // typing: the hand hovers over its keyboard and hammers keys
      a.kb.getWorldPosition(v1);
      const tap = Math.max(0, Math.sin(t * 9 + sd * 1.7)) * 0.6;
      a.target.set(v1.x - sd * 0.2, v1.y + 1.5 + tap, v1.z - 0.4);
      // compile: one hand slams down
      const cu = t - compileT;
      if (cu < 0.8 && a === arms[compileArm]) { const s = cu < 0.25 ? ease(cu / 0.25) : 1 - smooth((cu - 0.25) / 0.55); a.target.y += 3 * (cu < 0.12 ? cu / 0.12 : 1) * (1 - s) + (cu > 0.12 && cu < 0.25 ? -1 : 0); }
      // overflow: hands lift above the head and hold the column
      if (stackU > 0) { const e = ease(Math.min(1, stackU * 2.2)); v2.set(T.x + sd * 3.2, T.y + T.h / 2 + 9 + stackU * 4, T.z + 2.5); a.target.lerp(v2, e); }
      // the phase change: arms flung wide
      if (roar > 0) { v2.set(T.x + sd * 27, T.y + 12, T.z + 6); a.target.lerp(v2, roar); }
      // fork bomb: a hand points at Art as the drones launch
      if (a.launch && t - a.launch < 1) { const e = Math.sin(clamp((t - a.launch) / 1, 0, 1) * Math.PI); v2.copy(art).lerp(a.sh, 0.55).setY(10); a.target.lerp(v2, e); }
      // the finish: hands hang
      if (finishing) a.target.set(a.sh.x + sd * 1.5, 3, a.sh.z + 3);
      a.cur.lerp(a.target, Math.min(1, dt * (stackU > 0 ? 6 : 10)));
      // the shoulder moves with the tower
      const shW = a.shW || (a.shW = new V());
      shW.copy(a.sh).add(tower.position);
      const pole = a.pole || (a.pole = new V());
      pole.copy(shW).add(v4.set(sd * 6, 2, -8));
      solveArm({ sh: shW, elbow: a.elbow, wrist: a.wrist }, a.cur, pole);
      if (dead && deadT > 1.2) {
        // arms fall off and drop
        if (!a.fallen) { a.fallen = true; a.fallV.set(sd * 4, 4, 3); a.fallP = a.wrist.clone(); a.fallE = a.elbow.clone(); a.fallS = shW.clone(); }
        const u = deadT - 1.2;
        for (const p of [a.fallP, a.fallE, a.fallS]) p.addScaledVector(a.fallV, dt).y = Math.max(0.6, p.y - 14 * u * dt * 2);
        a.wrist.copy(a.fallP); a.elbow.copy(a.fallE); shW.copy(a.fallS);
      }
      placeSeg(a.up, shW, a.elbow); placeSeg(a.fo, a.elbow, a.wrist);
      a.jS.position.copy(shW); a.jE.position.copy(a.elbow);
      a.hand.position.copy(a.wrist); tmpO.position.copy(a.elbow); tmpO.lookAt(a.wrist); a.hand.quaternion.copy(tmpO.quaternion); a.hand.rotateX(0.5);
      a.fingers.forEach((f, i) => { f.rotation.x = 0.4 + (stackU > 0 ? -0.3 : Math.max(0, Math.sin(t * 9 + i * 1.3 + sd)) * 0.5) + (finishing ? 0.7 : 0); });
      a.kb.visible = !dead || deadT < 1.2;
      a.kb.position.y = 4.2 + Math.sin(t * 1.3 + sd) * 0.15 - sag * 1.5;
    }

    // satellites orbit the tower; more of them and faster with each phase
    for (let i = 0; i < SAT; i++) {
      const ring = i % 2, a = t * (ring ? -0.22 : 0.3) * (1 + (S.phase - 1) * 0.35) * (S.enraged ? 1.5 : 1) + i / SAT * Math.PI * 2;
      const r = 17 + ring * 3;
      v1.set(T.x + Math.cos(a) * r, T.y + 2 + Math.sin(a) * r * 0.55 - (dead ? deadT * deadT * 3 : 0), T.z + 2 + Math.sin(a * 2) * 1.2);
      tmpO.position.copy(v1); tmpO.lookAt(v2.copy(v1).add(v3.set(0, 0, 10))); tmpO.rotation.z = Math.sin(a) * 0.3; tmpO.scale.setScalar(dead ? Math.max(0.01, 1 - deadT * 0.3) : 1); tmpO.updateMatrix();
      sats.setMatrixAt(i, tmpO.matrix);
      tmpO.translateZ(0.12); tmpO.updateMatrix(); satGlow.setMatrixAt(i, tmpO.matrix);
    }
    sats.instanceMatrix.needsUpdate = satGlow.instanceMatrix.needsUpdate = true;
    satGlow.material.color.copy(ctx.pal.a).multiplyScalar(1 + bigFlash);

    // drones fly an arc from the racks to Art over their time
    for (const [, d] of drones) {
      const u = clamp(1 - d.left / Math.max(1, d.total), 0, 1);
      v1.copy(d.from).lerp(v2.copy(art).setY(1.6), ease(u) * 0.95); v1.y += Math.sin(u * Math.PI) * 4;
      d.pos.lerp(v1, Math.min(1, dt * 10));
      d.m.rotation.set(Math.sin(t * 6) * 0.2, t * 3, 0);
      if (Math.random() < dt * 30) K.fx.spark(d.pos, v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), C('#ff4d5e'), { size: 0.28, life: 0.35, drag: 3 });
      d.left = Math.max(0, d.left - dt * 1000);
    }

    // the cables and the hall
    ctx.lightPool(2, v1.set(T.x, 3, T.z + 4), ctx.pal.a, 0.5 + screenPulse * 0.8);
    ctx.lightPool(3, v1.set(T.x - 14, 4, T.z + 2), ctx.pal.a, 0.35);
    ctx.lightPool(4, v1.set(T.x + 14, 4, T.z + 2), ctx.pal.a, 0.35);
    if (screenRed > 0.5) ctx.lightPool(5, v1.set(T.x, T.y, T.z + 2), '#ff4d5e', screenRed);

    // death: the screen cracks, sparks rain, the eye bursts, then the tower sinks
    if (dead) {
      if (deadT < 3 && Math.random() < dt * 25) K.fx.burst(v1.set(T.x + rnd(-11, 11), T.y + rnd(-6, 6) - fall * 14, T.z + 1.2), 4, Math.random() < 0.5 ? '#ffffff' : ctx.pal.a, { speed: 6, g: 12, life: 0.8, size: 0.28 });
      if (deadT > 1.0 && !eye.userData.boom) {
        eye.userData.boom = true; eye.getWorldPosition(v1);
        K.fx.burst(v1, 200, '#ffffff', { speed: 24, g: 6, life: 1.3, size: 0.5 });
        K.fx.burst(v1, 100, ctx.pal.a, { speed: 14, g: 6, life: 1.6, size: 0.55 });
        K.fx.shock(v1, C('#ffffff'), 1, 26, 1, { flat: false, face: ctx.camPos });
        K.fx.light(v1, '#ffffff', 80, 1.8, 60);
        ctx.juice.shake(1); ctx.juice.stop(120); ctx.juice.flash(0.6); ctx.sfx('boom');
        ctx.shed(v1, 30, C('#ffffff'), 2, 1);
      }
      if (deadT > 1.8 && deadT < 4.5 && Math.random() < dt * 14) K.fx.burst(v1.set(T.x + rnd(-14, 14), 0.4, T.z + rnd(-2, 4)), 6, '#cfefff', { speed: 6, up: 2, g: 12, life: 0.8, size: 0.4, floor: 0.05 });
    }
  }

  function reset() {
    dead = false; deadT = 0; eye.userData.boom = false; stackT = -9; stackBlocks.length = 0; endLaser();
    for (const a of arms) { a.fallen = false; }
    for (const [, d] of drones) d.m.visible = false; drones.clear();
  }
  function anchor(key, out) {
    if (key === 'core' || key === 'body') return eye.getWorldPosition(out).add(v4.set(0, 0.5, 0));
    if (key.startsWith('packet:')) { const d = drones.get(key.slice(7)); return d ? out.copy(d.pos).setY(d.pos.y + 1.4) : null; }
    if (key === 'head') return eye.getWorldPosition(out);
    return null;
  }
  function worldOf(at, out) {
    if (at && at.startsWith('line:')) return out.set(T.x + rnd(-8, 8), T.y + rnd(-3.5, 3.5), T.z + 1.2);
    return eye.getWorldPosition(out);
  }
  function attacker(attack, owner, out) { if (attack === 'overflow') return out.set(T.x, T.y + T.h / 2 + 10, T.z + 2); return eye.getWorldPosition(out); }
  const subjects = { core: new V(), top: new V(T.x, 24, T.z), body: new V(T.x, T.y, T.z) };
  function subj() { eye.getWorldPosition(subjects.core); return subjects; }

  // ---------- the hall: build pillars with progress bars and cable trays ----------
  {
    const pm = K.armor({ color: '#171c21', seam: '#3ee6ff', seamK: 0.5, rimK: 0.15, metal: 0.65, rough: 0.5, scale: 1.2, density: 0.35 });
    const parts = [], bars = [];
    for (let i = 0; i < 10; i++) {
      const sd = i % 2 ? 1 : -1, zz = -34 + Math.floor(i / 2) * 9, hh = 12 + (i % 3) * 3;
      parts.push([G.cbox(3, hh, 3, 0.2), [sd * 22, hh / 2, zz]]);
      parts.push([G.cbox(3.8, 0.8, 3.8, 0.15), [sd * 22, hh, zz]]);
      bars.push([G.cbox(0.3, hh * 0.7, 0.1, 0.03), [sd * 22 - sd * 1.52, hh * 0.45, zz], [0, sd * Math.PI / 2, 0]]);
    }
    parts.push([G.cbox(70, 1.2, 2, 0.2), [0, 26, -24]]);
    props.add(new THREE.Mesh(G.merge(parts), pm));
    const barMat = K.glow('#3ee6ff', 1.3);
    props.add(new THREE.Mesh(G.merge(bars), barMat));
    props.userData.tick = (t, pal) => { barMat.color.copy(pal.a).multiplyScalar(1 + Math.sin(t * 2) * 0.3); pm.userData.u.uSeam.value.copy(pal.a).multiplyScalar(0.5); };
  }

  return { group, props, update, event, anchor, worldOf, attacker, subj, packets, reset, dispose() {}, height: 27, width: 50, camY: 9, focus: new V(0, 12, -6), face: 'core', info: () => ({ stack: stackBlocks.length, laser: !!laser, drones: drones.size }),
    // joint check: the elbow's bend (0 = straight) and which way it points; it must stay behind the arm
    // (toward the pole), so the forearm always folds forward like an elbow, never backward
    joints: () => arms.map(a => {
      const s0 = a.shW || a.sh, u = v1.copy(a.elbow).sub(s0).normalize(), f = v2.copy(a.wrist).sub(a.elbow).normalize();
      const bend = Math.round(Math.acos(clamp(u.dot(f), -1, 1)) * 180 / Math.PI);
      const line = v3.copy(a.wrist).sub(s0).normalize(), off = v4.copy(a.elbow).sub(s0); off.sub(line.multiplyScalar(off.dot(line)));
      const back = off.z < 0.05 || Math.abs(off.x) > Math.abs(off.z);   // the elbow sits behind or out, never in front
      return { side: a.sd, bend, back, upper: +a.elbow.distanceTo(s0).toFixed(2), fore: +a.wrist.distanceTo(a.elbow).toFixed(2) };
    }) };
};
