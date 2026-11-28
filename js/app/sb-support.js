// What viewers' items look like on stage (sb-scene.js), drawn big enough to read on a stream and kept
// clear of the word line, the HP bars and the timers:
//   Shield     a gold barrier of hexagons rises in front of Art and stays while he has shields; it
//              shatters a layer when it stops a hit. Typed blocks light the same barrier in cyan
//   Heal       a green column of light from Art into the air, with motes rising
//   Overclock  orange embers stream up both sides of the arena and a rune ring turns under Art
//   Slow mo    a clock face hangs over the arena and ticks; the boss moves slower
//   Hype train a train of gold lights races round the arena rim; a full meter rains gold
//   Fog, Shuffle, Speed up (chaos): fog rolls in, a magenta glitch swirl, red speed streaks
//   const S = SuperSupport.create(THREE, scene, K, { artPos, glitch(k, s), tint(hex, k) })
//   S.event(name, data)   S.update(t, dt, snapshot)   S.timeScale()   S.dispose()
window.SuperSupport = (() => {
  function create(THREE, scene, K, ctx) {
    const V = THREE.Vector3, C = K.C, rnd = K.rnd, clamp = K.clamp;
    const art = ctx.artPos;
    const own = K.own;
    // ---------- the barrier ----------
    const barMat = own(new THREE.ShaderMaterial({
      uniforms: { uC: { value: C('#f2c230') }, uA: { value: 0 }, uFlash: { value: 0 }, uRise: { value: 0 }, uT: { value: 0 }, uHit: { value: new THREE.Vector2(0.5, 0.5) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uC; uniform float uA; uniform float uFlash; uniform float uRise; uniform float uT; uniform vec2 uHit; varying vec2 vUv;
        vec2 hexd(vec2 p){ p *= vec2(1.0, 1.1547); vec2 a = mod(p, vec2(1.0, 1.732)) - vec2(0.5, 0.866); vec2 b = mod(p - vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
          vec2 g = dot(a, a) < dot(b, b) ? a : b; return vec2(length(g), floor(p.x + p.y)); }
        void main(){
          vec2 p = vec2(vUv.x * 14.0, vUv.y * 7.0);
          vec2 h = hexd(p); float edge = smoothstep(0.38, 0.48, h.x);
          float rise = step(vUv.y, uRise * 1.1 - fract(sin(h.y * 12.7) * 43758.5) * 0.1);
          float fade = smoothstep(0.85, 0.4, vUv.y) * smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
          float ring = 0.0; float d = length((vUv - uHit) * vec2(2.0, 1.0)); ring = smoothstep(0.5, 0.0, d) * uFlash;
          float shimmer = 0.6 + 0.4 * sin(uT * 3.0 + vUv.y * 9.0 + h.y);
          vec3 c = uC * (edge * 0.9 + 0.08) * shimmer * uA + uC * ring * (0.5 + edge) * 1.5 + vec3(1.0) * ring * edge * 0.6;
          gl_FragColor = vec4(c * rise * fade, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const barrier = new THREE.Mesh(own(new THREE.CylinderGeometry(6, 6, 6.5, 40, 1, true, Math.PI - 0.75, 1.5).translate(0, 3.25, 0)), barMat);
    barrier.position.copy(art).setY(0); barrier.renderOrder = 7; scene.add(barrier);
    let barA = 0, barRise = 0, barFlash = 0, barCol = C('#f2c230'), shields = 0;
    // ---------- heal column, overclock runes, slow mo clock, hype train ----------
    const colMat = own(new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uT: { value: 0 }, uC: { value: C('#39ff88') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uA; uniform float uT; uniform vec3 uC; varying vec2 vUv;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0; float a = pow(1.0 - x, 2.0) * smoothstep(1.0, 0.2, vUv.y) * (0.7 + 0.3 * sin(vUv.y * 30.0 - uT * 12.0));
          gl_FragColor = vec4(uC * a * uA * 1.6, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const column = new THREE.Mesh(own(new THREE.CylinderGeometry(1.6, 2.2, 22, 20, 1, true).translate(0, 11, 0)), colMat);
    column.position.copy(art).setY(0); column.visible = false; scene.add(column);
    let healT = -9;
    const runeMat = own(new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uT: { value: 0 }, uC: { value: C('#ff8a3d') } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uA; uniform float uT; uniform vec3 uC; varying vec2 vP;
        void main(){ float r = length(vP), a = atan(vP.y, vP.x);
          float ring = smoothstep(0.03, 0.0, abs(r - 0.92)) + smoothstep(0.02, 0.0, abs(r - 0.7));
          float ticks = step(0.7, fract(a * 12.0 / 6.2832 + uT * 0.5)) * step(0.72, r) * step(r, 0.9);
          float spokes = smoothstep(0.03, 0.0, abs(fract(a * 3.0 / 6.2832 - uT * 0.3) - 0.5) * r) * step(r, 0.7) * 0.5;
          gl_FragColor = vec4(uC * (ring + ticks * 0.8 + spokes) * uA, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const rune = new THREE.Mesh(own(new THREE.CircleGeometry(4.5, 48)), runeMat);
    rune.rotation.x = -Math.PI / 2; rune.position.copy(art).setY(0.12); scene.add(rune);
    const clockMat = own(new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uT: { value: 0 }, uC: { value: C('#9fd8ff') }, uHand: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uA; uniform float uT; uniform vec3 uC; uniform float uHand; varying vec2 vP;
        void main(){ float r = length(vP), a = atan(vP.x, vP.y);
          float rim = smoothstep(0.02, 0.0, abs(r - 0.95)) + smoothstep(0.012, 0.0, abs(r - 0.82)) * 0.6;
          float ticks = step(0.92, fract(a * 12.0 / 6.2832 + 0.04)) * step(0.83, r) * step(r, 0.93);
          float ha = mod(a - uHand + 3.14159, 6.2832) - 3.14159; float hand = smoothstep(0.035, 0.0, abs(ha) * r) * step(r, 0.78);
          float sweep = smoothstep(0.0, -1.2, ha) * step(ha, 0.0) * step(r, 0.8) * 0.18;
          gl_FragColor = vec4(uC * (rim + ticks + hand * 1.4 + sweep) * uA, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const clock = new THREE.Mesh(own(new THREE.CircleGeometry(5.2, 64)), clockMat);
    clock.position.set(0, 15.5, -2); clock.visible = false; scene.add(clock);
    const train = { t0: -9, n: 9 };
    let crowdT = -9, shuffleT = -9, speedOn = 0, overOn = 0, slowOn = 0;
    const v1 = new V(), v2 = new V();

    function event(n, d = {}) {
      const t = ctx.now();
      if (n === 'support') {
        if (d.id === 'shield') { barCol.set('#f2c230'); barFlash = 1; barRise = Math.min(barRise, 0); K.fx.burst(v1.copy(art).setY(3), 50, '#ffe08a', { speed: 8, g: -1, life: 0.9, size: 0.3 }); }
        if (d.id === 'heal') { healT = t; K.fx.burst(v1.copy(art).setY(0.5), 60, '#7dffb0', { speed: 6, up: 3, g: -4, life: 1.6, size: 0.35 }); K.fx.shock(v1.setY(0.1), C('#39ff88'), 1, 9, 0.8); K.fx.light(v1.setY(3), '#39ff88', 40, 2); }
        if (d.id === 'overclock') { K.fx.shock(v1.copy(art).setY(0.15), C('#ff8a3d'), 1, 12, 0.7); K.fx.burst(v1.setY(1), 70, '#ffb070', { speed: 10, up: 2, g: 4, life: 0.9, size: 0.35 }); }
        if (d.id === 'slowmo') { K.fx.shock(v1.set(0, 15.5, -1.9), C('#9fd8ff'), 1, 7, 0.9, { flat: false }); }
        if (d.id === 'hype') train.t0 = t;
        if (d.id === 'fog') K.fx.burst(v1.set(0, 2, 0), 80, '#b48cff', { speed: 10, spread: 14, g: -1, life: 2, size: 0.6, drag: 1 });
        if (d.id === 'shuffle') { shuffleT = t; ctx.glitch(0.8, 0.5); }
        if (d.id === 'speed') K.fx.shock(v1.copy(art).setY(0.15), C('#ff4d5e'), 1, 14, 0.6);
      }
      if (n === 'shielded') {
        // a layer of the barrier stops the hit and shatters
        barCol.set('#f2c230'); barFlash = 1.4;
        const yw = ctx.yaw ? ctx.yaw() : Math.PI;
        K.fx.burst(v1.set(art.x + Math.sin(yw) * 5.6, 3, art.z + Math.cos(yw) * 5.6), 90, '#ffe08a', { speed: 13, g: 10, life: 0.9, size: 0.35, spread: 3 });
        K.fx.light(v1, '#f2c230', 50, 4);
      }
      if (n === 'block') { barCol.set('#3ee6ff'); barFlash = 1.2; barA = Math.max(barA, 0.6); barRise = 1; }
      if (n === 'hype' && d.full) {
        crowdT = t;
        for (let i = 0; i < 6; i++) K.fx.burst(v1.set(rnd(-16, 16), 22, rnd(-10, 6)), 30, i % 2 ? '#f2c230' : '#ffe9a8', { speed: 6, g: 7, life: 2.2, size: 0.35, drag: 0.6 });
        K.fx.shock(v1.set(0, 0.15, 0), C('#f2c230'), 2, 32, 1.2);
      }
    }
    function update(t, dt, s) {
      // Art's bot flies round the arena (sb-bots.js): the barrier, the heal column and the rune ring go with it
      barrier.position.set(art.x, 0, art.z); barrier.rotation.y = (ctx.yaw ? ctx.yaw() : Math.PI) - Math.PI;
      column.position.set(art.x, 0, art.z); rune.position.set(art.x, 0.12, art.z);
      const sh = s && s.art ? s.art.shield : 0;
      if (sh !== shields) { if (sh > shields) barRise = 0; shields = sh; }
      const wantA = shields ? 0.06 + shields * 0.04 : 0;
      barA += (Math.max(wantA, barFlash * 0.4) - barA) * Math.min(1, dt * 4);
      barRise = Math.min(1, barRise + dt * 1.6);
      barFlash = Math.max(0, barFlash - dt * 2.4);
      barrier.visible = barA > 0.01 || barFlash > 0.01;
      // the camera looks over Art's bot through the barrier, so it is kept faint enough to see the boss through
      barMat.uniforms.uA.value = barA * 0.55; barMat.uniforms.uFlash.value = barFlash * 0.5; barMat.uniforms.uRise.value = shields || barFlash > 0 ? barRise : 1; barMat.uniforms.uT.value = t;
      barMat.uniforms.uC.value.copy(barCol);
      // heal
      const hu = (t - healT) / 1.6;
      column.visible = hu >= 0 && hu < 1; colMat.uniforms.uA.value = hu < 0.15 ? hu / 0.15 : 1 - (hu - 0.15) / 0.85; colMat.uniforms.uT.value = t;
      if (column.visible && Math.random() < dt * 40) K.fx.spark(v1.copy(art).add(v2.set(rnd(-1.5, 1.5), rnd(0, 2), rnd(-1.5, 1.5))), v2.set(0, rnd(5, 9), 0), C('#7dffb0'), { size: 0.35, life: 1.2, drag: 0.5 });
      // overclock: embers up both sides, a turning rune ring
      overOn += ((s && s.art && s.art.over > 0 ? 1 : 0) - overOn) * Math.min(1, dt * 3);
      runeMat.uniforms.uA.value = overOn * 1.2; runeMat.uniforms.uT.value = t; rune.visible = overOn > 0.01; rune.rotation.z = t * 0.6;
      if (overOn > 0.5 && Math.random() < dt * 40) { const sd = Math.random() < 0.5 ? -1 : 1; K.fx.spark(v1.set(sd * rnd(13, 19), 0.3, rnd(-6, 12)), v2.set(rnd(-0.5, 0.5), rnd(4, 9), 0), C('#ff8a3d'), { size: 0.3, life: 1.6, drag: 0.3 }); }
      // slow mo: the clock ticks over the arena
      slowOn += ((s && s.art && s.art.slow > 0 ? 1 : 0) - slowOn) * Math.min(1, dt * 3);
      clock.visible = slowOn > 0.01; clockMat.uniforms.uA.value = slowOn * 0.7; clockMat.uniforms.uT.value = t;
      if (s && s.art) clockMat.uniforms.uHand.value = -((s.art.slow || 0) / 10000) * Math.PI * 2;
      // hype train: gold lights race once round the rim
      const tu = (t - train.t0) / 2.2;
      if (tu >= 0 && tu < 1) for (let i = 0; i < train.n; i++) { const a = -Math.PI / 2 + (tu * 2.2 - i * 0.07) * Math.PI * 2 * 0.9; v1.set(Math.cos(a) * 26, 0.6, -6 + Math.sin(a) * 20); K.fx.spark(v1, v2.set(0, 1, 0), C(i ? '#f2c230' : '#ffffff'), { size: i ? 0.9 : 1.4, life: 0.35, drag: 2 }); }
      // chaos
      speedOn += ((s && s.chaos && s.chaos.speed > 0 ? 1 : 0) - speedOn) * Math.min(1, dt * 3);
      if (speedOn > 0.5 && Math.random() < dt * 50) K.fx.spark(v1.set(rnd(-22, 22), rnd(1, 18), -30), v2.set(0, 0, rnd(60, 90)), C('#ff6b78', 0.8), { size: 0.25, end: 0.1, life: 0.6, drag: 0 });
      if (t - shuffleT < 0.8 && Math.random() < dt * 60) { const a = rnd(0, 6.28); K.fx.spark(v1.set(Math.cos(a) * 6, 8 + rnd(-3, 3), Math.sin(a) * 3), v2.set(-Math.sin(a) * 12, rnd(-2, 2), Math.cos(a) * 6), C('#ff4da6'), { size: 0.4, life: 0.5, drag: 1 }); }
    }
    // the boss's animation speed: slower under slow mo, faster under speed up
    const timeScale = () => 1 - slowOn * 0.2 + speedOn * 0.15;
    function dispose() { for (const m of [barrier, column, rune, clock]) scene.remove(m); }
    return { event, update, timeScale, dispose };
  }
  return { create };
})();
