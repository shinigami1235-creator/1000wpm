// The Compiler (sb-scene.js mounts it): a mainframe of a monitor that writes code at Art, in a hall of
// build pillars. The page lays the code lines over its screen (screenRect in sb-scene.js), so nothing
// of the model ever sits on the screen, and no attack flies across it: they all come round the sides.
//   the head     a CPU housing on top with a heatsink, heat pipes into the racks and a tracking eye;
//                for a segfault (phase 2 on) the eye charges and its beam jumps over two pointer
//                screens that leave the orbit, down the side of the tower to Art
//   the arms     two industrial arms on hydraulic pistons that type on floating keyboards; for a stack
//                overflow each hand holds up a column of memory blocks the screen pushes onto it, the
//                columns sway as they overflow, and the arms hurl them round both sides at Art; for a
//                compile one slams the enter key and the screen's chin fires a red bolt
//   the racks    server towers at its shoulders with drive bays, fans and code screens; in phase 3
//                their hatches open and fork bomb drones fly out and round at Art
// Idle life: the eye tracks Art with small glances away, the arms type in bursts, the fans spin, data
// runs down the cables, code scrolls on every small screen and the satellites orbit.
// Each phase changes the look: phase 2 opens the vents on the head and spins everything faster,
// phase 3 runs the heatsink and pipes hot, steam leaks from the vents and the rack hatches stay open.
// A phase break is a kernel panic and a reboot. The kill, in the 2 seconds before the result card: it
// glitches, the glass cracks, the eye bursts, the arms and satellites drop, panels blow off, the screen
// shatters, the core under the heatsink blows and the tower sinks.
// It brings its own broadcast shots (boot, crash, teardown) in place of the stock intro, phase and kill.
// Arms are solved with two-bone IK and a pole behind the elbow, so the elbows always bend forward.
window.SuperModels = window.SuperModels || {};
SuperModels.compiler = function (THREE, K, ctx) {
  const V = THREE.Vector3;
  const { C, clamp, rnd } = K;
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = x => Math.pow(clamp(x, 0, 1), 2.2);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const pulse = (x, a, b) => smooth((x - a) / Math.max(1e-3, b - a));   // 0 before a, 1 after b
  const hump = x => Math.sin(clamp(x, 0, 1) * Math.PI);
  const art = ctx.artPos;
  const G = K.geo;
  const sfx = (n, a) => ctx.sfx(n, a);
  const group = new THREE.Group(), props = new THREE.Group();
  const T = { x: 0, y: 10, z: -7, w: 23, h: 12.5 };   // the screen, as sb-scene.js knows it
  const RED = C('#ff4d5e'), WHITE = C('#ffffff');
  const v1 = new V(), v2 = new V(), v3 = new V(), v4 = new V(), v5 = new V();
  const tmpO = new THREE.Object3D(), qInv = new THREE.Quaternion(), col = new THREE.Color();

  // ---------- materials (shared by every part) ----------
  const frameMat = K.armor({ color: '#20262c', seam: '#3ee6ff', seamK: 0.9, rim: '#3ee6ff', rimK: 0.35, metal: 0.8, rough: 0.34, scale: 0.6, density: 0.35 });
  const darkMat = K.armor({ color: '#14181c', seam: '#3ee6ff', seamK: 0.5, rimK: 0.2, metal: 0.6, rough: 0.5, scale: 0.9, density: 0.25 });
  const armMat = K.armor({ color: '#2b3139', seam: '#3ee6ff', seamK: 0.8, rim: '#3ee6ff', rimK: 0.3, metal: 0.85, rough: 0.3, scale: 1.0, density: 0.3 });
  const pipeMat = K.armor({ color: '#6b4428', seam: '#ff9a4d', seamK: 0.25, rim: '#ffb070', rimK: 0.25, metal: 0.95, rough: 0.28, scale: 2.2, density: 0.15 });
  const ledMat = K.glow('#3ee6ff', 1.8);
  const redMat = K.glow('#ff4d5e', 2.6);
  const keyMat = K.glow('#3ee6ff', 1.1);
  const ventMat = K.glow('#3ee6ff', 1.2);
  const fanMat = K.glow('#3ee6ff', 0.9);

  // code text for every small screen and memory block: one canvas, scrolled per instance in the shader
  const codeCv = document.createElement('canvas'); codeCv.width = 256; codeCv.height = 512;
  {
    const c = codeCv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 256, 512); c.font = '15px monospace';
    const tok = ['let', 'const', 'if', 'for', 'ret', 'push(', 'pop()', '{', '}', '=>', '0x7f', 'null', 'sock', 'buf[i]', '&&', '++', 'io.', 'jmp', 'mov', 'emit', '//', 'heap', 'ptr', 'ok'];
    for (let y = 14; y < 512; y += 17) {
      let x = 4 + (Math.floor(K.srnd(0, 4)) * 12);
      while (x < 240 && K.srnd() < 0.86) { const w = tok[Math.floor(K.srnd(0, tok.length))]; c.fillStyle = `rgba(255,255,255,${K.srnd(0.45, 1).toFixed(2)})`; c.fillText(w, x, y); x += c.measureText(w).width + 8; }
    }
  }
  const codeTex = K.own(new THREE.CanvasTexture(codeCv)); codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping;
  // a code screen: scrolling text in the instance's colour, a bright edge, scanlines
  const codeMat = K.own(new THREE.ShaderMaterial({
    uniforms: { uTex: { value: codeTex }, uT: { value: 0 }, uA: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vC; varying float vI;
      void main(){ vUv = uv; vC = vec3(1.0); vI = 0.0;
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
      #ifdef USE_INSTANCING
        vI = float(gl_InstanceID);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      #else
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #endif
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uT; uniform float uA; varying vec2 vUv; varying vec3 vC; varying float vI;
      void main(){ vec2 u = vec2(vUv.x * 0.8 + fract(vI * 0.23) * 0.2, vUv.y * 0.3 + fract(vI * 0.37) + uT * (0.05 + fract(vI * 0.61) * 0.06));
        float g = texture2D(uTex, u).r;
        float scan = 0.82 + 0.18 * sin(vUv.y * 140.0);
        float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float edge = 1.0 - smoothstep(0.0, 0.07, e);
        gl_FragColor = vec4(vC * (0.08 + g * 0.95 * scan + edge * 0.55) * uA, 1.0); }`,
  }));

  // ---------- the monitor ----------
  const tower = new THREE.Group(); group.add(tower);
  // every static part goes into one list per material, merged into one mesh each at the end (fewer draw calls)
  const SP = { frame: [], dark: [], led: [] };
  // plain boxes for the small parts (LEDs, keys, vents, fins): 12 triangles instead of a rounded box's 108
  const bx = (w, h, d) => G.own(new THREE.BoxGeometry(w, h, d));
  const bolt = G.own(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 6).rotateX(Math.PI / 2));
  {
    const { x, y, z, w, h } = T, bz = z - 0.2, d = 2.2, b = 1.3;
    const parts = [];
    parts.push([G.cbox(w + b * 2, b, d, 0.25), [x, y + h / 2 + b / 2, bz]]);
    parts.push([G.cbox(w + b * 2 + 0.6, b * 1.4, d + 0.4, 0.3), [x, y - h / 2 - b * 0.7, bz]]);
    for (const sd of [-1, 1]) parts.push([G.cbox(b, h + b * 2, d, 0.25), [x + sd * (w / 2 + b / 2), y, bz]]);
    parts.push([G.cbox(w + 1, h + 1, 1.2, 0.2), [x, y, bz - d / 2 - 0.4]]);                       // the back
    for (let i = 0; i < 5; i++) parts.push([G.cbox(0.7, h + 1.6, 1.2, 0.15), [x - w / 2 + 2 + i * (w - 4) / 4, y, bz - d / 2 - 1.2]]);   // ribs on the back
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      parts.push([G.cbox(2.2, 2.2, d + 0.6, 0.3), [x + cx * (w / 2 + b * 0.6), y + cy * (h / 2 + b * 0.6), bz]]);   // corner blocks
      for (const [bx, by] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) parts.push([bolt, [x + cx * (w / 2 + b * 0.6) + bx, y + cy * (h / 2 + b * 0.6) + by, bz + d / 2 + 0.38]]);
    }
    for (let i = 0; i < 9; i++) parts.push([bx(1.4, 0.35, 0.3), [x - 8 + i * 2, y - h / 2 - b * 0.7 - 0.2, bz + d / 2 + 0.25]]);   // vents on the chin
    // bolts down the side bezels
    for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) parts.push([bolt, [x + sd * (w / 2 + b / 2), y - h / 2 + 1.6 + i * 1.9, bz + d / 2 + 0.1]]);
    // the pedestal, its steps and the clamps that hold it to the floor
    parts.push([G.cbox(w * 0.7, 3.4, 5, 0.3, 0.85, 1), [x, 1.7, z + 0.6]]);
    parts.push([G.cbox(w * 0.95, 1, 7.5, 0.25), [x, 0.5, z + 1.2]]);
    for (const sd of [-1, 1]) for (const k of [0, 1]) parts.push([G.cbox(1.6, 1.4, 2.2, 0.2, 0.7, 1), [x + sd * (5 + k * 4), 1.2, z + 4.4]]);
    parts.push([G.cbox(4, y - h / 2 - 3, 2.6, 0.3), [x, 3.4 + (y - h / 2 - 3.4) / 2, z - 1]]);   // the neck down to the pedestal
    // the head unit that holds the eye: a CPU housing with shoulders and a heatsink on top
    parts.push([G.cbox(9, 4.6, 4.2, 0.6, 0.8, 1), [x, y + h / 2 + 3.4, z - 0.6]]);
    parts.push([G.cbox(7.4, 0.5, 3.6, 0.15), [x, y + h / 2 + 5.75, z - 0.6]]);   // heatsink base plate
    for (const sd of [-1, 1]) parts.push([G.cbox(2.6, 1.2, 3.6, 0.3), [x + sd * 5.2, y + h / 2 + 2.6, z - 0.6], [0, 0, sd * -0.35]]);
    for (const sd of [-1, 1]) parts.push([G.horn(3.4, 0.4, 0.5, 5, 4), [x + sd * 4.6, y + h / 2 + 4.9, z - 1.6], [-1.1, sd * 0.4, sd * 0.45]]);   // antennae
    // the lens hood around the eye
    parts.push([K.own(new THREE.CylinderGeometry(2.35, 2.6, 1.1, 10, 1, true).rotateX(Math.PI / 2)), [x, y + h / 2 + 3.4, z + 1.65]]);
    SP.frame.push(...parts);
    // status LEDs along the bottom bezel, a trim of light round the screen, vent slots on the top bezel
    const leds = [];
    for (let i = 0; i < 26; i++) leds.push([bx(0.5, 0.18, 0.1), [x - 12 + i * 0.96, y - h / 2 - 0.55, bz + d / 2 + 0.05]]);
    for (const sd of [-1, 1]) { leds.push([bx(w + 0.5, 0.1, 0.1), [x, y + sd * (h / 2 + 0.12), bz + d / 2 + 0.03]]); leds.push([bx(0.1, h + 0.3, 0.1), [x + sd * (w / 2 + 0.12), y, bz + d / 2 + 0.03]]); }
    SP.led.push(...leds);
    const vents = [];
    for (let i = 0; i < 14; i++) vents.push([bx(0.9, 0.16, 0.1), [x - 9.1 + i * 1.4, y + h / 2 + b / 2, bz + d / 2 + 0.03]]);
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) vents.push([bx(0.12, 0.7, 2.6), [x + sd * (4.52), y + h / 2 + 2.6 + i * 0.0, z - 0.6 + (i - 1.5) * 0.75]]);   // slots in the head's sides
    tower.add(new THREE.Mesh(G.merge(vents), ventMat));
  }
  // the heatsink: thin fins over the head, they run hot in phase 3
  const sinkMat = K.armor({ color: '#3a4048', seam: '#3ee6ff', seamK: 0.3, rim: '#3ee6ff', rimK: 0.3, metal: 0.95, rough: 0.25, scale: 1.4, density: 0.1 });
  {
    const fins = [];
    for (let i = 0; i < 11; i++) fins.push([bx(0.16, 1.7, 3.3), [T.x - 3.4 + i * 0.68, T.y + T.h / 2 + 6.85, T.z - 0.6]]);
    tower.add(new THREE.Mesh(G.merge(fins), sinkMat));
  }
  // the vents on the head that open from phase 2: two flaps on each side
  const flaps = [];
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(T.x + sd * 4.55, T.y + T.h / 2 + 3.1, T.z + 0.4); tower.add(pv);
    const m = new THREE.Mesh(G.cbox(0.25, 1.6, 3.2, 0.08), frameMat); m.position.z = -1.6; pv.add(m);
    flaps.push({ pv, sd });
  }
  // heat pipes from the head down into the racks
  {
    const parts = [];
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) {
      const c = new THREE.CatmullRomCurve3([new V(T.x + sd * 3.2, T.y + T.h / 2 + 4.6, T.z - 1.6 - k * 0.9), new V(T.x + sd * (7 + k), T.y + T.h / 2 + 6.2 - k * 0.4, T.z - 1.8 - k * 0.9), new V(T.x + sd * (12.5 + k * 0.8), T.y + T.h / 2 + 4.6, T.z - 2.6 - k * 0.9), new V(T.x + sd * (15.2 + k * 0.6), T.y + T.h / 2 + 2.8, T.z - 2.9 - k * 0.6)]);
      parts.push([K.own(new THREE.TubeGeometry(c, 14, 0.28, 6, false))]);
    }
    tower.add(new THREE.Mesh(G.merge(parts), pipeMat));
  }
  // fans: two on the chin, one on top of each rack
  const fanGeo = (() => { const p = []; for (let i = 0; i < 5; i++) p.push([bx(0.28, 0.9, 0.06), [Math.cos(i / 5 * Math.PI * 2) * 0.5, Math.sin(i / 5 * Math.PI * 2) * 0.5, 0], [0.4, 0, i / 5 * Math.PI * 2 - Math.PI / 2]]); return G.merge(p); })();
  const FANS = [[T.x - 9.6, T.y - T.h / 2 - 0.9, T.z + 1.05, 0], [T.x + 9.6, T.y - T.h / 2 - 0.9, T.z + 1.05, 0], [T.x - 15.7, 19.85, T.z - 1.4, 1], [T.x + 15.7, 19.85, T.z - 1.4, 1]];
  const fans = new THREE.InstancedMesh(fanGeo, fanMat, FANS.length); fans.frustumCulled = false; tower.add(fans);
  {
    const rings = [];
    for (const [x, y, z, top] of FANS) rings.push([K.own(new THREE.TorusGeometry(1.15, 0.16, 6, 18)), [x, y, z], top ? [Math.PI / 2, 0, 0] : [0, 0, 0]]);
    SP.dark.push(...rings);
  }

  // the screen: dark glass with faint scrolling code at the top, a slow scan, flashes, a panic and a reboot
  const screenMat = K.own(new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uC: { value: C('#3ee6ff') }, uPulse: { value: 0 }, uRed: { value: 0 }, uBreak: { value: 0 }, uTex: { value: codeTex },
      uPanic: { value: 0 }, uOn: { value: 1 }, uHit: { value: 0 }, uHitP: { value: new THREE.Vector2(0.5, 0.2) }, uGlitch: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 uC; uniform float uPulse; uniform float uRed; uniform float uBreak; uniform sampler2D uTex;
      uniform float uPanic; uniform float uOn; uniform float uHit; uniform vec2 uHitP; uniform float uGlitch; varying vec2 vUv;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main(){ vec2 uv = vUv;
        float row = floor(uv.y * 40.0);
        uv.x += (h21(vec2(row, floor(uT * 14.0))) - 0.5) * 0.06 * uGlitch * step(0.6, h21(vec2(row * 1.7, floor(uT * 9.0))));
        float scan = 0.5 + 0.5 * sin(uv.y * 420.0); float band = smoothstep(0.0, 0.08, abs(fract(uv.y - uT * 0.12) - 0.5));
        vec3 c = vec3(0.004, 0.018, 0.02) + uC * 0.03 * scan + uC * 0.05 * (1.0 - band);
        // faint code scrolling in the top half, out of the way of the lines the page lays over the bottom
        float code = texture2D(uTex, vec2(uv.x * 1.6, uv.y * 0.8 + uT * 0.03)).r;
        c += uC * code * 0.07 * smoothstep(0.4, 0.95, uv.y);
        float edge = 1.0 - smoothstep(0.0, 0.05, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
        c += uC * edge * 0.25 + uC * uPulse * 0.25 + vec3(1.0, 0.1, 0.15) * uRed * 0.35;
        // a fix lands: a soft flash on its line
        vec2 dq = (uv - uHitP) * vec2(2.2, 6.0); c += mix(uC, vec3(1.0), 0.5) * uHit * 0.35 * exp(-dot(dq, dq) * 3.0);
        // kernel panic: blocks of noise and a red cast, held dim so the lines stay readable
        float rowN = h21(vec2(floor(uv.y * 48.0), floor(uT * 10.0)));
        float dash = step(0.45, h21(vec2(floor(uv.x * 70.0 + rowN * 9.0), floor(uv.y * 48.0)))) * step(0.3, rowN) * step(0.25, fract(uv.y * 48.0));
        c = mix(c, vec3(0.45, 0.03, 0.07) * (0.35 + 0.65 * dash) + vec3(0.25) * dash * step(0.9, rowN), uPanic * 0.55);
        // power: off is black, the picture comes on from the top down behind a bright line
        float on = step(1.0 - uv.y, uOn * 1.08); float line = smoothstep(0.03, 0.0, abs(1.0 - uv.y - uOn * 1.08));
        c = c * on + uC * line * 0.8 * step(uOn, 0.999);
        // it breaks: glass shards (cell edges) crack out from a point under the eye, then shards fall out
        if (uBreak > 0.0) {
          vec2 p = vUv * vec2(9.0, 5.0), ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)); vec2 r = o + vec2(h21(ip + o), h21(ip + o + 17.0)) - fp; float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = h21(ip + o + 5.0); } else if (d < d2) d2 = d; }
          float edge = 1.0 - smoothstep(0.0, 0.045, sqrt(d2) - sqrt(d1));
          float dist = length((vUv - vec2(0.5, 0.7)) * vec2(1.8, 1.0));
          float reach = smoothstep(uBreak * 1.5, uBreak * 1.5 - 0.15, dist);
          float gone = step(id, (uBreak - 0.5) * 1.6);
          c = mix(c, vec3(0.0), gone) * (1.0 - edge * reach * 0.6);
          c += vec3(0.85, 0.95, 1.0) * edge * reach * (1.0 - gone) * 0.6;
        }
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  const screen = new THREE.Mesh(K.own(new THREE.PlaneGeometry(T.w, T.h)), screenMat);
  screen.position.set(T.x, T.y, T.z + 0.85); tower.add(screen);

  // ---------- the eye ----------
  const EYE0 = new V(T.x, T.y + T.h / 2 + 3.4, T.z + 1.6);
  const eye = new THREE.Group(); eye.position.copy(EYE0); tower.add(eye);
  const lensRing = new THREE.Mesh(K.own(new THREE.TorusGeometry(1.75, 0.38, 8, 28)), armMat); eye.add(lensRing);
  const lensGlow = new THREE.Mesh(K.own(new THREE.TorusGeometry(2.05, 0.07, 4, 40)), ledMat); eye.add(lensGlow);
  const irisMat = K.glow('#3ee6ff', 1.6);
  const iris = new THREE.Mesh(K.own(new THREE.CircleGeometry(1.45, 32)), irisMat); iris.position.z = 0.05; eye.add(iris);
  const pupilMat = K.glow('#ffffff', 3);
  const pupil = new THREE.Mesh(K.own(new THREE.CircleGeometry(0.55, 24)), pupilMat); pupil.position.z = 0.1; eye.add(pupil);
  // a crosshair in the iris from phase 3
  const cross = new THREE.Mesh(G.merge([[G.cbox(2.4, 0.09, 0.02, 0.01)], [G.cbox(0.09, 2.4, 0.02, 0.01)]]), redMat); cross.position.z = 0.12; eye.add(cross);
  // the lens blades that close to a slit when it charges
  const shutter = new THREE.InstancedMesh(G.cbox(1.5, 0.5, 0.12, 0.05), darkMat, 6); shutter.frustumCulled = false; eye.add(shutter);

  // ---------- server racks at the shoulders ----------
  const RACK = [-1, 1].map(sd => new V(T.x + sd * (T.w / 2 + 4.2), 9.5, T.z - 1.4));
  {
    const parts = [], leds = [], dark = [];
    for (const sd of [-1, 1]) {
      const x = T.x + sd * (T.w / 2 + 4.2), fz = T.z + 0.8;
      parts.push([G.cbox(4.4, 19, 4.4, 0.3), [x, 9.5, T.z - 1.4]]);
      parts.push([G.cbox(5.2, 1, 5.2, 0.2), [x, 19.3, T.z - 1.4]]);
      parts.push([G.cbox(5.2, 0.8, 5.2, 0.2), [x, 0.4, T.z - 1.4]]);
      // drive bays with handles, in two columns
      for (let i = 0; i < 7; i++) for (let k = 0; k < 2; k++) { dark.push([bx(1.7, 0.95, 0.3), [x - 0.95 + k * 1.9, 3 + i * 1.25, fz + 0.12]]); parts.push([bx(0.9, 0.12, 0.22), [x - 0.95 + k * 1.9, 3.3 + i * 1.25, fz + 0.32]]); }
      for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) leds.push([bx(0.34, 0.14, 0.08), [x - 1.4 + k * 0.38, 2.6 + i * 1.05 + (k % 2) * 0.3, fz + 0.32]]);
      // the shoulder housing the arm hangs from
      parts.push([G.cbox(3.2, 3, 2.2, 0.4, 0.85, 1), [x, 17.6, T.z + 0.4]]);
      for (const [bx, by] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) parts.push([bolt, [x + bx, 17.6 + by, T.z + 1.55]]);
      // the hatch frame on top
      parts.push([G.cbox(3.4, 0.3, 0.4, 0.08), [x, 20, T.z - 1.4 + 1.7]]); parts.push([G.cbox(3.4, 0.3, 0.4, 0.08), [x, 20, T.z - 1.4 - 1.7]]);
    }
    SP.frame.push(...parts); SP.dark.push(...dark); SP.led.push(...leds);
  }
  // hatches on top of each rack: two flaps that open for the fork bomb
  const hatches = [];
  for (const sd of [-1, 1]) for (const hz of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(T.x + sd * (T.w / 2 + 4.2), 20.05, T.z - 1.4 + hz * 1.55); tower.add(pv);
    const m = new THREE.Mesh(G.cbox(3.2, 0.22, 1.55, 0.06), armMat); m.position.z = -hz * 0.78; pv.add(m);
    hatches.push({ pv, sd, hz });
  }
  // cables from the racks down to the floor and into the pedestal, with data running along them
  const cables = [];
  {
    const parts = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x0 = T.x + sd * (T.w / 2 + 2.6 + i * 0.7), y0 = 5.5 - i * 1.4;
      const c = new THREE.CatmullRomCurve3([new V(x0, y0, T.z + 0.9), new V(x0 + sd * 0.4, y0 * 0.4, T.z + 2.5 + i * 0.6), new V(x0 - sd * (2 + i * 1.5), 0.25, T.z + 5 + i * 0.8), new V(T.x + sd * (6.5 + i * 1.2), 0.25, T.z + 4.2 + i * 0.6)]);
      parts.push([K.own(new THREE.TubeGeometry(c, 12, 0.3 - i * 0.04, 5, false))]);
      cables.push(c);
    }
    // two thick trunks from the back of the monitor into the racks
    for (const sd of [-1, 1]) { const c = new THREE.CatmullRomCurve3([new V(T.x + sd * 6, T.y + 4, T.z - 2.6), new V(T.x + sd * 10, T.y + 1, T.z - 3.4), new V(T.x + sd * 13.5, T.y + 3, T.z - 3.4)]); parts.push([K.own(new THREE.TubeGeometry(c, 10, 0.55, 6, false))]); }
    SP.dark.push(...parts);
  }
  tower.add(new THREE.Mesh(G.merge(SP.frame), frameMat), new THREE.Mesh(G.merge(SP.dark), darkMat), new THREE.Mesh(G.merge(SP.led), ledMat));
  const BEADS = 30;
  const beads = new THREE.InstancedMesh(bx(0.3, 0.3, 0.6), K.glow('#ffffff', 2.2), BEADS); beads.frustumCulled = false; tower.add(beads);
  const beadMat = beads.material;

  // ---------- arms ----------
  const UPPER = 7, FORE = 6.6;
  const pistonGeo = G.own(new THREE.CylinderGeometry(0.32, 0.32, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5));
  const rodGeo = G.own(new THREE.CylinderGeometry(0.16, 0.16, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5));
  const fingerIM = new THREE.InstancedMesh(G.merge([[G.cbox(0.34, 0.34, 0.75, 0.1), [0, 0, 0.38]], [G.cbox(0.3, 0.3, 0.7, 0.1), [0, -0.12, 1.0], [0.35, 0, 0]]]), armMat, 10);
  fingerIM.frustumCulled = false; group.add(fingerIM);
  const fm4 = new THREE.Matrix4();
  const arms = [-1, 1].map(sd => {
    const sh = new V(T.x + sd * (T.w / 2 + 4.2), 17.6, T.z + 1.2);
    const up = new THREE.Mesh(G.merge([[G.cbox(1.5, 1.5, UPPER, 0.35, 1, 1), [0, 0, UPPER / 2]], [G.cbox(1.9, 0.5, UPPER * 0.7, 0.15), [0, 0.85, UPPER / 2]], [G.cbox(1.7, 1.7, 0.5, 0.1), [0, 0, UPPER * 0.75]], [G.cbox(1.7, 1.7, 0.5, 0.1), [0, 0, UPPER * 0.3]]]), armMat);
    const fo = new THREE.Mesh(G.merge([[G.cbox(1.2, 1.2, FORE, 0.3, 1, 1), [0, 0, FORE / 2]], [G.cbox(0.4, 1.6, FORE * 0.6, 0.12), [0, 0, FORE * 0.45]], [G.cbox(1.45, 1.45, 0.9, 0.15), [0, 0, FORE - 0.45]]]), armMat);
    const jS = new THREE.Mesh(K.own(new THREE.SphereGeometry(1.25, 12, 8)), darkMat), jE = new THREE.Mesh(K.own(new THREE.SphereGeometry(1, 12, 8)), darkMat);
    const ring = new THREE.Mesh(K.own(new THREE.TorusGeometry(1.05, 0.09, 4, 20)), ledMat);   // a light ring round the elbow
    // a hydraulic piston from the shoulder housing to the forearm
    const pist = new THREE.Mesh(pistonGeo, darkMat), rod = new THREE.Mesh(rodGeo, armMat);
    // the hand: a claw of four fingers and a thumb over a palm
    const hand = new THREE.Group();
    hand.add(new THREE.Mesh(G.merge([[G.cbox(2.2, 0.6, 1.8, 0.2)], [G.cbox(1.3, 0.9, 0.9, 0.2), [0, 0, -0.9]]]), armMat));
    const fingers = [];
    for (let i = 0; i < 5; i++) {
      const th = i === 4, f = new THREE.Group();
      f.position.set(th ? sd * -1.2 : -0.8 + i * 0.53, th ? 0 : 0, th ? 0.1 : 0.8); if (th) f.rotation.y = sd * -0.9;
      fingers.push(f);   // drawn by the one instanced mesh of all ten fingers (fingerIM), placed from the hand
    }
    const glowBand = new THREE.Mesh(G.cbox(1.3, 0.25, 0.25, 0.05), ledMat); glowBand.position.set(0, 0.35, -0.3); hand.add(glowBand);
    // the floating keyboard it types on, with a little holo screen above it
    const kb = new THREE.Group();
    const kbBase = new THREE.Mesh(G.cbox(5, 0.35, 2.4, 0.12), darkMat); kb.add(kbBase);
    const keys = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) keys.push([bx(0.55, 0.18, 0.55), [-1.95 + c * 0.65, 0.25, -0.7 + r * 0.7]]);
    keys.push([bx(1.2, 0.18, 1.2), [sd * -2.95, 0.25, 0.05]]);   // the enter key, the one it slams
    kb.add(new THREE.Mesh(G.merge(keys), keyMat));
    kb.position.set(T.x + sd * (T.w / 2 + 1.5), 4.2, T.z + 4.8); kb.rotation.set(0.25, -sd * 0.35, 0);
    for (const m of [up, fo, jS, jE, ring, pist, rod, hand, kb]) group.add(m);
    return { sd, sh, up, fo, jS, jE, ring, pist, rod, hand, fingers, kb, elbow: new V(), wrist: new V(), target: new V(), cur: new V(), limp: 0, fallV: new V(), fallen: false, shW: new V(), pole: new V(), throwT: -9, flinch: 0 };
  });
  // two-bone IK: the elbow sits on the side of the pole (behind and out), so the arm bends forward
  function solveArm(a, target, pole) {
    const d = v1.copy(target).sub(a.sh), L = Math.min(d.length(), UPPER + FORE - 0.05), dir = d.normalize();
    const cosA = clamp((UPPER * UPPER + L * L - FORE * FORE) / (2 * UPPER * L), -1, 1), ang = Math.acos(cosA);
    const side = v2.copy(pole).sub(a.sh); side.sub(v3.copy(dir).multiplyScalar(side.dot(dir))).normalize();
    a.elbow.copy(a.sh).addScaledVector(dir, Math.cos(ang) * UPPER).addScaledVector(side, Math.sin(ang) * UPPER);
    a.wrist.copy(a.sh).addScaledVector(dir, L);
  }
  function placeSeg(m, from, to) { m.position.copy(from); m.lookAt(to); }

  // ---------- satellites: small code screens orbiting the tower, plus the screens on the racks ----------
  const SAT = 14, RS = 6;
  const sats = new THREE.InstancedMesh(G.merge([[G.cbox(1.9, 1.3, 0.22, 0.08)], [G.cbox(0.25, 0.25, 0.6, 0.05), [0, 0, -0.35]]]), frameMat, SAT); sats.frustumCulled = false; group.add(sats);
  const faces = new THREE.InstancedMesh(K.own(new THREE.PlaneGeometry(1.6, 1.0)), codeMat, SAT + RS); faces.frustumCulled = false; group.add(faces);
  faces.setColorAt(0, col.set(0xffffff));
  const satS = Array.from({ length: SAT }, (_, i) => ({ p: new V(), kick: 0, relay: 0, fall: null, red: 0, i }));
  const RSP = [];   // rack screens: three on each rack, above the drive bays
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) RSP.push(new V(T.x + sd * (T.w / 2 + 4.2), 12.6 + i * 1.6, T.z + 1.0));

  // ---------- memory blocks: the overflow's columns, and the debris of the death ----------
  const NB = 40;
  const blkFrame = new THREE.InstancedMesh((() => { const p = [], s = 1, e = 0.13; for (const a of [-1, 1]) for (const b of [-1, 1]) { p.push([bx(s + e, e, e), [0, a * s / 2, b * s / 2]]); p.push([bx(e, s + e, e), [a * s / 2, 0, b * s / 2]]); p.push([bx(e, e, s + e), [a * s / 2, b * s / 2, 0]]); } return G.merge(p); })(), armMat, NB);
  const blkFace = new THREE.InstancedMesh(K.own(new THREE.BoxGeometry(0.9, 0.9, 0.9)), codeMat, NB);
  for (const m of [blkFrame, blkFace]) { m.frustumCulled = false; m.count = 0; group.add(m); }
  blkFace.setColorAt(0, col.set(0xffffff));
  const blocks = [];   // { p, v, r, w, s, c, mode: 'col'|'arc'|'fall', side, i, t, dur, from, ctl, to, hit, life }
  function addBlock(o) { if (blocks.length >= NB) return null; const b = Object.assign({ p: new V(), v: new V(), r: new V(rnd(0, 6), rnd(0, 6), 0), w: new V(), s: 1.05, c: new THREE.Color(), t: 0, life: 1.4, k: 1 }, o); blocks.push(b); return b; }

  // ---------- drones for the fork bomb ----------
  const droneBody = G.merge([[G.cbox(1.3, 0.6, 1.3, 0.2)], [new THREE.OctahedronGeometry(0.5, 0), [0, -0.5, 0]], [G.cbox(2.6, 0.16, 0.22, 0.05), [0, 0.1, 0], [0, Math.PI / 4, 0]], [G.cbox(2.6, 0.16, 0.22, 0.05), [0, 0.1, 0], [0, -Math.PI / 4, 0]], [G.horn(0.9, 0.06, 0.2, 4, 3), [0.3, 0.3, -0.3], [-1.2, 0, 0]]]);
  const rotorGeo = (() => { const p = []; for (const [x, z] of [[0.92, 0.92], [-0.92, 0.92], [0.92, -0.92], [-0.92, -0.92]]) p.push([K.own(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 10)), [x, 0.26, z]]); return G.merge(p); })();
  const rotorMat = K.glow('#ff8a8a', 0.5, { add: true });
  const drones = new Map();
  const dronePool = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(droneBody, armMat);
    const g = new THREE.Mesh(K.own(new THREE.SphereGeometry(0.3, 10, 8)), redMat); g.position.set(0, -0.15, 0.62); m.add(g);
    const r = new THREE.Mesh(rotorGeo, rotorMat); m.add(r);
    m.visible = false; group.add(m); return m;
  });
  const fate = new Map();   // packet id -> 'back' (typed) or 'hit' (landed), from the events

  // ---------- aim lines for the laser: thin red lines eye -> pointer -> pointer -> floor ----------
  const aimMat = K.own(new THREE.MeshBasicMaterial({ color: C('#ff6b78', 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  const aims = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(rodGeo, aimMat); m.visible = false; m.renderOrder = 5; group.add(m); return m; });
  // a spinning red ring round each pointer screen while it is locked on
  const lockMat = K.own(new THREE.MeshBasicMaterial({ color: C('#ff4d5e', 1.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  const locks = Array.from({ length: 2 }, () => { const m = new THREE.Mesh(G.merge([[K.own(new THREE.TorusGeometry(1.55, 0.07, 4, 36))], [bx(0.5, 0.1, 0.05), [1.95, 0, 0]], [bx(0.5, 0.1, 0.05), [-1.95, 0, 0]], [bx(0.1, 0.5, 0.05), [0, 1.95, 0]], [bx(0.1, 0.5, 0.05), [0, -1.95, 0]]]), lockMat); m.visible = false; m.renderOrder = 5; group.add(m); return m; });
  function aimLine(i, a, b, w) { const m = aims[i]; m.visible = w > 0; if (!m.visible) return; m.position.copy(a); m.lookAt(b); m.scale.set(w, w, a.distanceTo(b)); }

  // ---------- state ----------
  let stack = null, laser = null, compileT = -9, compileArm = 0, compileX = 0, roarT = -9, bootT = -9, bombT = -9, dead = false, deadT = 0, finishing = false, lost = false;
  let bigFlash = 0, screenPulse = 0, screenRed = 0, screenHit = 0, glitch = 0, towerKb = 0, towerKbV = 0, headKb = 0, headKbV = 0, eyeBlink = 0, lookAway = null, nextGlance = 3, phaseNow = 1;
  let scorch = 0, stackHitDone = true;
  const scorchAt = new V();
  const lineOrder = [];   // live line ids in the order the page shows them (the newest at the bottom)
  const deathFx = { eye: false, arms: false, panels: false, glass: false, core: false };

  // the columns sit on the hands: where the hand of side sd holds the base of its column
  const colBase = (a, out) => out.copy(a.wrist).add(v5.set(0, 0.9, 0.3));
  function event(n, d, t) {
    if (n === 'countdown') { bootT = t; sfx('boot'); }
    if (n === 'windup' && d.kind === 'overflow') { endStack(true); stack = { t0: t, len: d.ms / 1000, n: [0, 0], thrown: false, mark: K.fx.mark(v1.copy(art).setY(0.06), 3.4, '#ff4d5e', 1) }; sfx('servo', 0.5); }
    if (n === 'windup' && d.kind === 'laser') {
      endLaser();
      const s = Math.random() < 0.5 ? -1 : 1;
      laser = { t0: t, len: d.ms / 1000, s, fired: false, R1: new V(T.x + s * 15, 21.8, T.z + 2.5), R2: new V(T.x + s * 16, 6.8, T.z + 8), sat: [s < 0 ? 0 : 7, s < 0 ? 1 : 8], sweep: new V(), pinged: 0 };
      laser.orb = K.fx.orb('#ff4d5e', out => eye.getWorldPosition(out).add(v4.set(0, 0, 0.8)));
      laser.mark = K.fx.mark(v1.copy(art).setY(0.06), 3, '#ff4d5e', 1);
    }
    if (n === 'windup' && d.kind === 'bomb') { bombT = t; for (const a of arms) a.launch = t; sfx('launch'); }
    if (n === 'block' || n === 'blockFail' || n === 'cancel') {
      const hit = n === 'blockFail', off = n === 'cancel';
      if (d.attack === 'overflow') throwStack(hit, off, t);
      if (d.attack === 'laser') fireLaser(hit, off, t);
    }
    if (n === 'packet') { fate.set(d.id, d.returned ? 'back' : 'hit'); lastFate = { f: d.returned ? 'back' : 'hit', at: performance.now() }; }
    if (n === 'compile') {
      compileT = t; compileArm = Math.random() < 0.5 ? 0 : 1; screenRed = 1; screenPulse = 1; glitch = Math.max(glitch, 0.5);
      // the bolt leaves the chin under the screen, never the screen itself, and lands on Art's bot
      compileX = rnd(-7, 7);
      const from = v1.set(T.x + compileX, T.y - T.h / 2 - 1.4, T.z + 1.6);
      K.fx.beam(from, ctx.artAim(v2), '#ff4d5e', 0.6, 0.35, { grow: 0.06 });
      K.fx.burst(from, 18, '#ff8a8a', { speed: 6, g: 4, life: 0.4, size: 0.28 });
      K.fx.burst(v2, 40, '#ff8a8a', { speed: 10, g: 8, life: 0.5, size: 0.3 });
      K.fx.shock(v3.copy(art).setY(0.12), RED, 0.6, 6, 0.45);
      K.fx.light(v2, '#ff4d5e', 40, 5);
    }
    if (n === 'fix') { screenPulse = Math.max(screenPulse, 0.6); screenHit = 1; }
    if (n === 'phase') { roarT = t; phaseNow = d.n || phaseNow + 1; sfx('panic'); sfx('roar'); endStack(true); endLaser(); for (const s of satS) s.kick = 6; }
    if (n === 'hit') {
      const imp = Math.min(2.4, 0.35 + (d.amount || 0) * 0.012) * (d.crit ? 1.5 : 1);
      if (d.at && d.at.startsWith('line:')) {
        // a fix lands on its line: a flash there, the screen shakes in its frame
        const i = lineOrder.indexOf(d.at.slice(5)), n2 = lineOrder.length;
        screenMat.uniforms.uHitP.value.set(rnd(0.25, 0.75), i < 0 ? 0.15 : clamp(0.1 + (n2 - 1 - i) * 0.12, 0.05, 0.6));
        screenHit = Math.max(screenHit, d.crit ? 1 : 0.6); towerKbV += imp * 0.6; glitch = Math.max(glitch, d.crit ? 0.35 : 0.12);
      } else {
        // a hit on the eye: it blinks and the head is knocked back
        headKbV += imp * 3.2; eyeBlink = Math.max(eyeBlink, d.crit ? 1 : 0.5); towerKbV += imp * 0.4;
      }
      for (const a of arms) a.flinch = Math.max(a.flinch, d.crit ? 1 : 0.4);
      for (const s of satS) s.kick = Math.max(s.kick, imp * (d.crit ? 1.6 : 0.6));
      if (d.crit || d.src === 'counter') bigFlash = 0.8;
    }
    if (n === 'win') { dead = true; deadT = 0; endStack(true); endLaser(); Object.keys(deathFx).forEach(k => { deathFx[k] = false; }); sfx('panic'); }
  }

  // ---------- the stack overflow ----------
  function endStack(drop) {
    if (!stack) return;
    if (stack.mark) { stack.mark.off(); stack.mark = null; }
    if (drop) for (const b of blocks) if (b.mode === 'col' || b.mode === 'rise') { b.mode = 'fall'; b.v.set(rnd(-2, 2), rnd(0, 3), rnd(0, 3)); b.w.set(rnd(-4, 4), rnd(-4, 4), 0); b.t = 0; b.life = 1.6; }
    stack = null;
  }
  function throwStack(hit, off, t) {
    if (!stack) return;
    if (stack.mark) { stack.mark.off(); stack.mark = null; }
    if (off) { endStack(true); return; }
    // the columns break from the top and pour round both sides of the tower at Art (or onto his barrier)
    const to = hit ? ctx.artAim(new V()) : ctx.shieldAt(new V());
    const col2 = blocks.filter(b => b.mode === 'col' || b.mode === 'rise').sort((a, b) => b.i - a.i);
    col2.forEach((b, k) => {
      b.mode = 'arc'; b.t = -k * 0.012; b.dur = 0.17 + k * 0.003; b.k = 2.2; b.from = b.p.clone(); b.hit = hit;
      b.ctl = new V(T.x + b.side * rnd(23, 27), rnd(12, 17), T.z + rnd(6, 10));
      b.to = to.clone().add(v1.set(rnd(-0.8, 0.8), rnd(-0.6, 0.8), rnd(-0.5, 0.5)));
      b.w.set(rnd(-9, 9), rnd(-9, 9), rnd(-6, 6));
    });
    stack.thrown = true; stack.thrownT = t; stackHitDone = false;
    for (const a of arms) a.throwT = t;
    sfx('stackThrow');
    towerKbV -= 3;   // it lunges forward with the throw
    endStack(false);
  }

  // ---------- the segfault: a beam that jumps over two pointer screens down the side ----------
  function fireLaser(hit, off, t) {
    if (!laser) return;
    eye.getWorldPosition(v1);
    const L = laser;
    if (off) {
      K.fx.burst(v1, 60, '#ffd0d0', { speed: 12, g: 2, life: 0.6, size: 0.35 }); K.fx.shock(v1, RED, 0.5, 7, 0.5, { flat: false, face: ctx.camPos });
      endLaser(); return;
    }
    const to = hit ? ctx.artAim(v2) : ctx.shieldAt(v2);
    K.fx.beam(v1, L.R1, '#ff4d5e', 0.42, 0.5, { grow: 0.04 });
    K.fx.beam(L.R1, L.R2, '#ff4d5e', 0.42, 0.5, { grow: 0.04 });
    K.fx.beam(L.R2, to, '#ff4d5e', 0.55, 0.55, { grow: 0.05 });
    for (const p of [L.R1, L.R2]) { K.fx.burst(p, 24, '#ffb3b3', { speed: 8, g: 2, life: 0.4, size: 0.3 }); }
    K.fx.burst(to, hit ? 70 : 40, hit ? '#ffb3b3' : '#cfefff', { speed: 13, g: 6, life: 0.6, size: 0.32 });
    K.fx.light(to, hit ? '#ff4d5e' : '#3ee6ff', hit ? 55 : 40, 4);
    sfx('zap');
    headKbV += 3;   // the head kicks back with the shot
    if (hit) { scorch = 1; scorchAt.copy(art).setY(0); K.fx.shock(v3.copy(art).setY(0.12), RED, 0.8, 8, 0.6); }
    else {
      // the barrier throws it back up the line and the low pointer screen bursts
      K.fx.beam(to, L.R2, '#3ee6ff', 0.3, 0.3, { grow: 0.08 });
      K.fx.shock(to, C('#3ee6ff'), 0.5, 5, 0.4, { flat: false, face: ctx.camPos }); bigFlash = 0.7;
      K.fx.burst(L.R2, 50, '#bfefff', { speed: 12, g: 6, life: 0.6, size: 0.32 });
      const s = satS[L.sat[1]]; s.kick = 8;
    }
    L.fired = true; L.firedT = t;
    if (L.orb) { L.orb.pop(); L.orb = null; } if (L.mark) { L.mark.off(); L.mark = null; }
  }
  function endLaser() { if (laser) { if (laser.orb) laser.orb.pop(); if (laser.mark) laser.mark.off(); } laser = null; aims.forEach(m => { m.visible = false; }); locks.forEach(m => { m.visible = false; }); }

  // ---------- packets: the fork bomb's drones ----------
  function packets(list, t, own) {
    if (lineMode && !own) return;   // on the one line the drones come from line.tags (apply below), not from the stage's targets
    if (t == null) t = nowT;
    const live = new Set();
    for (const p of list) {
      live.add(p.id);
      let d = drones.get(p.id);
      if (!d) {
        const m = dronePool.find(x => !x.visible); if (!m) continue;
        m.visible = true; m.scale.setScalar(1.15);
        const sd = p.i % 2 ? 1 : -1;
        d = { m, sd, from: new V(T.x + sd * (T.w / 2 + 4.2), 20.2, T.z - 1.4), pos: m.position, left: p.left, total: p.total, vel: new V(), born: t };
        m.position.copy(d.from); drones.set(p.id, d);
        K.fx.burst(d.from, 24, '#ff4d5e', { speed: 7, up: 2, g: 2, life: 0.5, size: 0.3 });
        sfx('servo', 0.2);
      }
      d.left = p.left; d.total = p.total;
    }
    for (const [id, d] of drones) if (!live.has(id)) {
      const f = fate.get(id) || (lastFate && performance.now() - lastFate.at < 700 ? lastFate.f : 'back'); fate.delete(id); lastFate = null;
      if (f === 'hit') {
        // it reached Art: it dives into his bot and blows
        ctx.artAim(v1);
        K.fx.burst(v1, 60, '#ff8a8a', { speed: 12, g: 8, life: 0.6, size: 0.32 }); K.fx.shock(v2.copy(art).setY(0.12), RED, 0.6, 7, 0.5); K.fx.light(v1, '#ff4d5e', 40, 5);
      } else {
        // typed: it bursts where it is and its pieces fall
        K.fx.burst(d.pos, 50, '#ffd0d0', { speed: 11, g: 8, life: 0.6, size: 0.3 }); K.fx.shock(d.pos, C('#ffffff'), 0.3, 3.5, 0.3, { flat: false, face: ctx.camPos });
        for (let i = 0; i < 3; i++) addBlock({ mode: 'fall', p: d.pos.clone(), v: new V(rnd(-5, 5), rnd(2, 7), rnd(-3, 4)), w: new V(rnd(-9, 9), rnd(-9, 9), 0), s: 0.45, c: C('#ff4d5e'), life: 1.3, k: 0.8 });
        sfx('pop');
      }
      d.m.visible = false; drones.delete(id);
    }
  }

  // snapshot: where each live line sits on the screen, for the flash when a fix lands
  // The streamer's page fights on one line of words (InlineLine): its snapshot has no targets and the
  // fork bomb's processes are lit words in s.line.tags (kind, ms, el). Read them there, with an id made
  // from the kind and the total, which stays the same for as long as the word is lit.
  let lineMode = false, lastFate = null, nowT = 0;
  function apply(s) {
    lineOrder.length = 0;
    if (s && s.b && s.b.lines) for (const l of s.b.lines) if (l.state === 'live') lineOrder.push(l.id);
    lineMode = !!(s && s.line && !(s.targets && s.targets.length));
    if (lineMode) {
      const tg = [];
      for (const g of s.line.tags || []) if (g && g.first && g.ms && g.kind === 'packet') tg.push({ id: 'L' + g.kind + g.ms, left: Math.max(0, g.ms - g.el), total: g.ms, i: tg.length });
      packets(tg, nowT, true);
    }
  }

  // ---------- frame ----------
  function update(t, dt, S) {
    nowT = t;
    finishing = !!S.finishing; lost = !!S.lost;
    if (S.dead && !dead) { dead = true; deadT = 0; }
    if (!S.dead && dead && !S.lost) { dead = false; reset(); }
    if (dead) deadT += dt;
    const ph = S.phase || 1;
    bigFlash = Math.max(0, bigFlash - dt * 5); screenPulse = Math.max(0, screenPulse - dt * 2); screenRed = Math.max(0, screenRed - dt * 1.5);
    screenHit = Math.max(0, screenHit - dt * 3); glitch = Math.max(0, glitch - dt * 1.6); eyeBlink = Math.max(0, eyeBlink - dt * 4); scorch = Math.max(0, scorch - dt * 0.7);
    towerKbV += (-towerKb * 70 - towerKbV * 10) * dt; towerKb = clamp(towerKb + towerKbV * dt, -1.2, 1.5);
    headKbV += (-headKb * 60 - headKbV * 8) * dt; headKb = clamp(headKb + headKbV * dt, -0.6, 2);
    const rec = S.recoil * 0.4 + S.kb * 0.9 + towerKb * 0.6;
    // the phase break: a kernel panic, then a reboot from the top of the screen down
    const pr = t - roarT, roar = pr < 2.2 ? hump(pr / 2.2) : 0;
    const panic = pr < 1.0 ? 1 - pulse(pr, 0.75, 1.0) : 0;
    const boot = t - bootT;
    const sag = finishing ? 1 : 0;
    // the tower: a slow hum, recoil, a sag on the finish, a collapse when it dies
    const fall = dead ? easeIn(clamp((deadT - 1.25) / 2.4, 0, 1)) : 0;
    const hum = Math.sin(t * 1.1) * 0.06;
    const shiver = (bigFlash * 0.12 + roar * 0.12 + panic * 0.1 + (dead && deadT < 1.25 ? 0.14 : 0));
    tower.position.set(Math.sin(t * 37) * shiver, hum - sag * 0.8 - fall * 14, -rec);
    tower.rotation.set(-sag * 0.06 + fall * 0.32 - towerKb * 0.012, 0, (finishing ? Math.sin(t * 1.6) * 0.02 : 0) + fall * 0.12 + Math.sin(t * 31) * shiver * 0.01);
    // colours: the phase palette, hotter with each phase
    const hot = ph >= 3 ? 1 : ph === 2 ? 0.35 : 0;
    for (const m of [frameMat, darkMat, armMat, sinkMat]) {
      m.userData.u.uSeam.value.copy(ctx.pal.a).multiplyScalar(m === darkMat ? 0.5 : 0.9);
      m.userData.u.uRim.value.copy(ctx.pal.a).multiplyScalar(0.3);
      m.userData.u.uFlash.value = bigFlash * 0.5 + (S.hit || 0) * 0.22;
      m.userData.u.uHeat.value = dead ? smooth((deadT - 0.1) / 1.1) : finishing ? 0.2 + Math.sin(t * 7) * 0.08 : 0;
    }
    sinkMat.userData.u.uSeam.value.copy(ctx.pal.a).multiplyScalar(0.6 + hot * 1.4 + Math.sin(t * 3) * 0.2 * hot);
    sinkMat.userData.u.uHeat.value = Math.max(sinkMat.userData.u.uHeat.value, hot * (0.35 + Math.sin(t * 2.3) * 0.08));
    pipeMat.userData.u.uSeam.value.set('#ff9a4d').multiplyScalar(0.7 + hot * 0.8 + Math.sin(t * 1.7) * 0.15);
    pipeMat.userData.u.uHeat.value = dead ? smooth((deadT - 0.1) / 1.1) : hot * 0.25;
    const flick = finishing ? Math.sin(t * 23) * 0.8 : 0;
    // while an attack winds up at Art the trim and the screen's edge pulse red, faster as it closes in
    const warnU = stack ? clamp((t - stack.t0) / stack.len, 0, 1) : laser && !laser.fired ? clamp((t - laser.t0) / laser.len, 0, 1) : 0;
    const warn = warnU > 0 ? (0.45 + 0.55 * warnU) * (0.5 + 0.5 * Math.sin(t * (7 + warnU * 16))) : 0;
    ledMat.color.copy(ctx.pal.a).lerp(RED, Math.min(1, warnU * 1.5)).multiplyScalar(1.4 + Math.sin(t * 5) * 0.3 + flick + warn * 0.8);
    keyMat.color.copy(ctx.pal.a).multiplyScalar(0.9);
    ventMat.color.copy(ctx.pal.a).lerp(RED, hot * 0.4).multiplyScalar(1 + hot * 1.2 + Math.sin(t * 4) * 0.3 * hot + roar * 2);
    fanMat.color.copy(ctx.pal.a).multiplyScalar(0.8);
    beadMat.color.copy(ctx.pal.a).lerp(WHITE, 0.4).multiplyScalar(1.8);
    // the screen
    const U = screenMat.uniforms;
    U.uT.value = t; U.uC.value.copy(ctx.pal.a); U.uPulse.value = (screenPulse + roar) * 0.4;
    U.uRed.value = (screenRed + warn * 0.35 + (finishing ? 0.4 + Math.sin(t * 9) * 0.2 : 0) + (lost ? 0.5 + Math.sin(t * 4) * 0.2 : 0)) * 0.6;
    U.uBreak.value = dead ? clamp(deadT / 0.7, 0, 0.5) + (deathFx.glass ? clamp((deadT - 1.05) * 3, 0, 0.5) : 0) : 0;
    U.uPanic.value = Math.max(panic, dead ? 0.5 * (1 - pulse(deadT, 0.3, 0.7)) : 0);
    U.uOn.value = boot < 3 ? pulse(boot, 0.35, 1.2) : pr >= 1.0 && pr < 1.9 ? pulse(pr, 1.0, 1.75) : 1;
    U.uHit.value = screenHit; U.uGlitch.value = glitch + panic * 0.6 + (dead ? 0.6 : 0);
    tower.updateMatrixWorld();

    // vents on the head open from phase 2 (and blast on a phase break); phase 3 leaks steam
    const open = Math.max(ph >= 2 ? 1 : 0, roar);
    for (const f of flaps) f.pv.rotation.y = f.sd * (0.1 + open * 0.9) * (dead ? 1.4 : 1);
    if ((ph >= 3 || roar > 0.2) && !dead && Math.random() < dt * (roar > 0.2 ? 40 : 6)) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      v1.set(T.x + sd * 4.9, T.y + T.h / 2 + 3.1 + rnd(-0.6, 0.6), T.z - 0.6 + rnd(-1.4, 1.4)).add(tower.position);
      K.fx.spark(v1, v2.set(sd * rnd(2, 4), rnd(1.5, 3.5), rnd(-0.5, 0.5)), col.copy(ctx.pal.a).lerp(WHITE, 0.6).multiplyScalar(0.55), { size: rnd(0.5, 0.9), end: 1.4, life: 0.9, drag: 1.2, g: -1 });
    }
    // fans
    for (let i = 0; i < FANS.length; i++) {
      const [x, y, z, top] = FANS[i];
      tmpO.position.set(x, y, z); tmpO.rotation.set(top ? -Math.PI / 2 : 0, 0, t * (6 + ph * 3) * (i % 2 ? -1 : 1) * (dead ? Math.max(0, 1 - deadT * 0.5) : 1)); tmpO.scale.setScalar(1); tmpO.updateMatrix();
      fans.setMatrixAt(i, tmpO.matrix);
    }
    fans.instanceMatrix.needsUpdate = true;
    // data running down the cables: faster each phase, red while an attack winds up
    const flow = t * (0.22 + ph * 0.08);
    for (let i = 0; i < BEADS; i++) {
      const c = cables[i % cables.length], u = (flow + i * 0.137 + (i % 3) * 0.31) % 1;
      c.getPointAt(1 - u, v1); c.getTangentAt(1 - u, v2);
      tmpO.position.copy(v1); tmpO.lookAt(v3.copy(v1).add(v2)); tmpO.scale.setScalar(dead ? 0.001 : 1); tmpO.updateMatrix();
      beads.setMatrixAt(i, tmpO.matrix);
    }
    beads.instanceMatrix.needsUpdate = true;

    // the eye: tracks Art, glances away now and then, a shutter that closes to a slit as the laser charges
    eye.position.copy(EYE0).add(v1.set(0, 0, -headKb * 0.9));
    eye.getWorldPosition(v1);
    const lookAt = v2.copy(art).setY(2.2);
    if (t > nextGlance && !laser && !stack) { lookAway = { t0: t, at: new V(rnd(-18, 18), rnd(2, 14), rnd(-2, 10)) }; nextGlance = t + rnd(2.5, 5.5); }
    if (lookAway && t - lookAway.t0 < 0.7) lookAt.lerp(lookAway.at, hump((t - lookAway.t0) / 0.7) * 0.9);
    if (stack) lookAt.set(T.x + Math.sin(t * 2) * 12, 16, T.z + 6);   // it watches its columns grow
    let charge = 0;
    if (laser) {
      const L = laser, u = clamp((t - L.t0) / L.len, 0, 1); charge = L.fired ? 0 : u;
      if (L.orb) L.orb.grow(0.3 + u * 0.9);
      if (L.mark) L.mark.set(u);
      if (!L.fired) {
        // the two pointer screens leave the orbit and take their places down the side
        const a1 = pulse(u, 0.15, 0.4), a2 = pulse(u, 0.3, 0.55), a3 = pulse(u, 0.45, 0.6);
        if (u > 0.35 && L.pinged < 1) { L.pinged = 1; sfx('relay'); K.fx.shock(L.R1, RED, 0.4, 3.2, 0.4, { flat: false, face: ctx.camPos }); }
        if (u > 0.5 && L.pinged < 2) { L.pinged = 2; sfx('relay'); K.fx.shock(L.R2, RED, 0.4, 3.2, 0.4, { flat: false, face: ctx.camPos }); }
        const fl = 0.75 + 0.25 * Math.sin(t * 40);
        aimLine(0, v1, L.R1, a1 > 0.99 ? 0.2 * fl : 0); aimLine(1, L.R1, L.R2, a2 > 0.99 ? 0.2 * fl : 0);
        // the last line sweeps over the floor toward Art over the second half
        const s = pulse(u, 0.5, 0.95);
        L.sweep.set(art.x + (1 - s) * 13 * L.s, 0.1, art.z - 1 - (1 - s) * 7);
        aimLine(2, L.R2, L.sweep, a3 > 0.99 ? 0.24 * fl : 0);
        aimMat.opacity = 0.9;
        if (a3 > 0.99 && Math.random() < dt * 30) K.fx.spark(L.sweep, v4.set(rnd(-2, 2), rnd(2, 5), rnd(-1, 1)), C('#ff6b78'), { size: 0.3, life: 0.4, g: 10 });
        if (Math.random() < dt * 40) K.fx.suck(v1, 3, 1, '#ff6b78', 0.4, 0.25);
        if (t - L.t0 > L.len + 0.8) endLaser();
      } else {
        aims.forEach(m => { m.visible = false; }); locks.forEach(m => { m.visible = false; });
        if (t - L.firedT > 1.2) laser = null;
      }
      // the head rears back as it charges
      if (laser && !laser.fired) lookAt.lerp(L.R1, 0.15);
    }
    if (dead) lookAt.set(T.x + Math.sin(t * 9) * 6, 30, T.z + 10);
    tmpO.position.copy(v1); tmpO.lookAt(lookAt);
    eye.quaternion.slerp(tmpO.quaternion.premultiply(qInv.copy(tower.quaternion).invert()), Math.min(1, dt * (lookAway && t - lookAway.t0 < 0.15 ? 14 : 6)));
    const bootOpen = boot < 3 ? pulse(boot, 0.7, 1.4) : 1, panicOpen = pr < 1.6 ? 1 - hump(clamp(pr / 1.6, 0, 1)) * 0.85 : 1;
    const shut = dead ? Math.max(0, 1 - deadT * 1.5) : (1 - charge * 0.75) * bootOpen * panicOpen * (1 - eyeBlink * 0.8);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * (0.2 + charge * 3); tmpO.position.set(Math.cos(a) * (0.6 + shut * 1.1), Math.sin(a) * (0.6 + shut * 1.1), 0.16); tmpO.rotation.set(0, 0, a + Math.PI / 2); tmpO.scale.setScalar(1); tmpO.updateMatrix(); shutter.setMatrixAt(i, tmpO.matrix); }
    shutter.instanceMatrix.needsUpdate = true;
    const eyeK = dead ? Math.max(0.1, 1 - deadT * 0.6) * (Math.random() < 0.3 ? 0.3 : 1) : (finishing || panic > 0.1) ? (Math.random() < 0.15 ? 0.3 : 1) : 1;
    irisMat.color.copy(charge > 0 ? col.set('#ff4d5e').multiplyScalar(1.6 + charge * 2) : col.copy(ctx.pal.a).multiplyScalar(1.4 + bigFlash * 2 + roar * 2)).multiplyScalar(eyeK * bootOpen);
    pupilMat.color.setScalar(3 * eyeK * bootOpen);
    pupil.scale.setScalar(0.6 + charge * 0.8 + roar * 0.5 - (ph >= 3 ? 0.15 : 0));
    cross.visible = ph >= 3 && !dead; cross.rotation.z = t * 0.6;
    ctx.lightPool(1, v1, charge > 0 ? '#ff4d5e' : ctx.pal.a, (0.6 + charge * 1.5 + roar) * bootOpen);

    // ---------- the arms ----------
    const st = stack, stU = st ? clamp((t - st.t0) / st.len, 0, 1) : 0;
    for (const a of arms) {
      const sd = a.sd;
      a.flinch = Math.max(0, a.flinch - dt * 3);
      // typing: the hand hovers over its keyboard and hammers keys, in bursts with pauses
      a.kb.getWorldPosition(v1);
      const burst = smooth(0.5 + 0.7 * Math.sin(t * 0.7 + sd * 2.1) + 0.3 * Math.sin(t * 1.9 + sd));
      const tap = Math.max(0, Math.sin(t * (9 + ph * 1.5) + sd * 1.7)) * 0.6 * burst;
      a.target.set(v1.x - sd * 0.2, v1.y + 1.5 + tap + (1 - burst) * 0.5, v1.z - 0.4);
      // boot: the arms unfold from folded at the shoulders
      if (boot < 3) { const e = pulse(boot, 0.8, 2.0); v2.copy(a.sh).add(v3.set(-sd * 1.5, -6.5, 2.5)); a.target.lerpVectors(v2, a.target, e); }
      // compile: one hand rises and slams the enter key
      const cu = t - compileT;
      if (cu < 0.8 && a === arms[compileArm]) { const s = cu < 0.25 ? ease(cu / 0.25) : 1 - smooth((cu - 0.25) / 0.55); a.target.y += 3 * (cu < 0.12 ? cu / 0.12 : 1) * (1 - s) + (cu > 0.12 && cu < 0.25 ? -1 : 0); }
      // overflow: the hand comes up beside the tower to hold its column; the column grows, it strains
      if (st) {
        const e = ease(Math.min(1, stU * 3));
        v2.set(T.x + sd * 17, 10.5 + Math.sin(t * 7 + sd) * 0.25 * stU, T.z + 6.5);
        // anticipation: at the end it leans back, ready to throw
        v2.z -= pulse(stU, 0.75, 1) * 2; v2.y += pulse(stU, 0.75, 1) * 1.2;
        v2.x += Math.sin(t * 11 + sd) * 0.15 * stU;   // straining
        a.target.lerp(v2, e);
      }
      // the throw: a hard swing forward and in, then back to typing
      const tu = t - a.throwT;
      if (tu < 1.1) {
        const sw = tu < 0.18 ? ease(tu / 0.18) : 1 - smooth((tu - 0.35) / 0.75);
        v2.set(T.x + sd * 14, 9, T.z + 10.5);
        a.target.lerp(v2, clamp(sw, 0, 1));
      }
      // the phase change: arms flung wide
      if (roar > 0) { v2.set(T.x + sd * 25, T.y + 11, T.z + 6); a.target.lerp(v2, roar); }
      // fork bomb: a hand points at Art as the drones launch
      if (a.launch && t - a.launch < 1.2) { const e = hump((t - a.launch) / 1.2); v2.copy(art).lerp(a.sh, 0.55).setY(10); a.target.lerp(v2, e); }
      // hits: a flinch up and back
      a.target.y += a.flinch * 0.8; a.target.z -= a.flinch * 0.8;
      // the finish: hands hang; a win for the boss: arms raised
      if (finishing) a.target.set(a.sh.x + sd * 1.5, 3, a.sh.z + 3);
      if (lost && !dead) a.target.set(a.sh.x + sd * 4, a.sh.y + 4 + Math.sin(t * 3 + sd) * 0.6, a.sh.z + 4);
      a.cur.lerp(a.target, Math.min(1, dt * (tu < 0.4 ? 22 : st ? 6 : 10)));
      // the shoulder moves with the tower
      const shW = a.shW;
      shW.copy(a.sh).add(tower.position);
      a.pole.copy(shW).add(v4.set(sd * 6, 2, -8));
      solveArm({ sh: shW, elbow: a.elbow, wrist: a.wrist }, a.cur, a.pole);
      if (dead && deadT > 0.6) {
        // the arms come off at the shoulder and drop, bouncing once
        if (!a.fallen) {
          a.fallen = true; a.fallV.set(sd * 4, 4, 3); a.fallP = a.wrist.clone(); a.fallE = a.elbow.clone(); a.fallS = shW.clone(); a.fallVy = [0, 0, 0];
          K.fx.burst(shW, 50, '#ffd9a0', { speed: 10, g: 10, life: 0.8, size: 0.3 }); K.fx.light(shW, '#ffb070', 30, 4);
          sfx('shatter');
        }
        [a.fallP, a.fallE, a.fallS].forEach((p, k) => {
          a.fallVy[k] -= 26 * dt; p.x += a.fallV.x * dt * (1 - k * 0.3); p.z += a.fallV.z * dt; p.y += a.fallVy[k] * dt;
          if (p.y < 0.7) { p.y = 0.7; if (a.fallVy[k] < -6) { K.fx.burst(v3.copy(p).setY(0.3), 14, '#cfefff', { speed: 6, up: 2, g: 12, life: 0.6, size: 0.35, floor: 0.05 }); } a.fallVy[k] *= -0.25; a.fallV.multiplyScalar(0.7); }
        });
        a.wrist.copy(a.fallP); a.elbow.copy(a.fallE); shW.copy(a.fallS);
      }
      placeSeg(a.up, shW, a.elbow); placeSeg(a.fo, a.elbow, a.wrist);
      a.jS.position.copy(shW); a.jE.position.copy(a.elbow);
      a.ring.position.copy(a.elbow); a.ring.lookAt(v3.copy(a.elbow).add(v4.copy(a.wrist).sub(shW)));
      // the piston: from the shoulder housing, out along the upper arm, to the middle of the forearm
      v3.copy(shW).add(v4.set(0, 1.1, 0.6)); v4.copy(a.elbow).lerp(a.wrist, 0.35);
      a.pist.position.copy(v3); a.pist.lookAt(v4); const pl = v3.distanceTo(v4); a.pist.scale.set(1, 1, pl * 0.55);
      a.rod.position.copy(v4); a.rod.lookAt(v3); a.rod.scale.set(1, 1, pl * 0.55);
      a.hand.position.copy(a.wrist); tmpO.position.copy(a.elbow); tmpO.lookAt(a.wrist); a.hand.quaternion.copy(tmpO.quaternion); a.hand.rotateX(st ? -0.3 : 0.5);
      const grip = st ? 0.9 : tu < 0.5 ? -0.3 : 0;
      a.hand.updateMatrixWorld();
      a.fingers.forEach((f, i) => { f.rotation.x = 0.4 + grip + (st || tu < 0.5 ? 0 : Math.max(0, Math.sin(t * 9 + i * 1.3 + sd)) * 0.5 * burst) + (finishing ? 0.7 : 0); f.updateMatrix(); fingerIM.setMatrixAt((sd < 0 ? 0 : 5) + i, fm4.multiplyMatrices(a.hand.matrixWorld, f.matrix)); });
      a.kb.visible = !dead || deadT < 0.6;
      a.kb.position.y = 4.2 + Math.sin(t * 1.3 + sd) * 0.15 - sag * 1.5 - (boot < 3 ? (1 - pulse(boot, 0.5, 1.5)) * 3 : 0);
    }

    fingerIM.instanceMatrix.needsUpdate = true;

    // ---------- the overflow's columns ----------
    if (st) {
      st.mark && st.mark.set(stU);
      // the screen pushes blocks out of its top corners onto the columns, bottom first
      const want = Math.min(9, Math.floor(stU * 11));
      for (const [si, a] of arms.entries()) {
        while (st.n[si] < want) {
          const i = st.n[si]++;
          const b = addBlock({ mode: 'rise', side: a.sd, i, s: 1.3, from: new V(T.x + a.sd * 11.2, T.y + T.h / 2 + 0.6, T.z + 0.8), t: 0, dur: 0.28, c: new THREE.Color() });
          if (!b) break;
          b.p.copy(b.from);
          if (si === 0) sfx('stackPush', i);
        }
      }
      if (t - st.t0 > st.len + 1.2) endStack(true);
    }
    // every block: rising to its slot, held in a column, flying at Art, or falling as debris
    let nb = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      b.t += dt;
      if (b.mode === 'rise' || b.mode === 'col') {
        const a = arms[b.side < 0 ? 0 : 1];
        colBase(a, v1);
        const lean = (st ? pulse(stU, 0.4, 1) : 0) * 0.035 * b.i;
        // the column sways more the taller it gets, and leans back before the throw
        v1.add(v2.set(Math.sin(t * 3.1 + b.side) * 0.06 * b.i * b.i * (st ? stU : 0) + b.side * lean * b.i * 0.5, b.i * 1.4, -lean * b.i * 1.4));
        if (b.mode === 'rise') { const e = ease(b.t / b.dur); b.p.lerpVectors(b.from, v1, e); b.p.y += hump(b.t / b.dur) * 2; if (b.t >= b.dur) { b.mode = 'col'; K.fx.burst(v1, 6, ctx.pal.a, { speed: 3, g: 0, life: 0.3, size: 0.25 }); } }
        else b.p.copy(v1);
        b.r.set(Math.sin(t * 2 + b.i) * 0.05, b.side * 0.2, Math.sin(t * 3 + b.i) * 0.06 * (st ? stU : 0));
        // from palette to red as it overflows
        b.c.copy(ctx.pal.a).lerp(RED, st ? pulse(stU, 0.35, 0.9) : 1); b.k = 1.6 + (st ? stU : 0) * 1.0 + Math.sin(t * 12 + b.i) * 0.25 * (st ? stU : 0);
      } else if (b.mode === 'arc') {
        if (b.t < 0) { colBase(arms[b.side < 0 ? 0 : 1], v1); b.p.copy(v1).add(v2.set(0, b.i * 1.4, 0)); }
        else {
          const u = clamp(b.t / b.dur, 0, 1), k = 1 - u;
          b.p.set(0, 0, 0).addScaledVector(b.from, k * k).addScaledVector(b.ctl, 2 * k * u).addScaledVector(b.to, u * u);
          b.r.addScaledVector(b.w, dt);
          if (Math.random() < dt * 40) K.fx.spark(b.p, v2.set(0, 0, 0), b.hit ? C('#ff6b78') : C('#ff9aa5'), { size: 0.4, end: 0, life: 0.25, drag: 0 });
          if (u >= 1) {
            // it lands: on Art a red crunch, on the barrier a cyan shatter that throws it off
            K.fx.burst(b.p, 10, b.hit ? '#ff8a8a' : '#bfefff', { speed: 9, g: 10, life: 0.45, size: 0.3 });
            if (b.i % 4 === 0) { K.fx.shock(v2.copy(b.p), b.hit ? RED : C('#3ee6ff'), 0.4, 3.6, 0.3, { flat: false, face: ctx.camPos }); sfx('stackCrash', b.hit ? 1 : 0); }
            if (!stackHitDone) { stackHitDone = true; K.fx.light(b.p, b.hit ? '#ff4d5e' : '#3ee6ff', 60, 3.5); K.fx.burst(b.p, 50, b.hit ? '#ffb3b3' : '#e0fbff', { speed: 14, g: 8, life: 0.6, size: 0.36 }); K.fx.shock(v2.copy(art).setY(0.12), b.hit ? RED : C('#3ee6ff'), 1, 9, 0.6); }
            b.mode = 'fall'; b.t = 0; b.life = 1.2;
            b.v.set(rnd(-6, 6), rnd(3, 8), b.hit ? rnd(-2, 4) : rnd(-7, -2));
            if (!b.hit) b.c.set('#3ee6ff');
          }
        }
      } else {
        b.v.y -= 22 * dt; b.p.addScaledVector(b.v, dt); b.r.addScaledVector(b.w, dt);
        if (b.p.y < b.s * 0.45) { b.p.y = b.s * 0.45; b.v.y *= -0.35; b.v.x *= 0.6; b.v.z *= 0.6; b.w.multiplyScalar(0.6); }
        if (b.t > b.life) { blocks.splice(i, 1); continue; }
      }
      const sc = b.s * (b.mode === 'fall' ? Math.min(1, (b.life - b.t) * 2.5) : b.mode === 'rise' ? 0.4 + 0.6 * ease(b.t / b.dur) : 1);
      tmpO.position.copy(b.p); tmpO.rotation.set(b.r.x, b.r.y, b.r.z); tmpO.scale.setScalar(Math.max(0.01, sc)); tmpO.updateMatrix();
      blkFrame.setMatrixAt(nb, tmpO.matrix); blkFace.setMatrixAt(nb, tmpO.matrix);
      blkFace.setColorAt(nb, col.copy(b.c).multiplyScalar(b.k * (b.mode === 'fall' ? 0.7 : 1)));
      nb++;
    }
    blkFrame.count = blkFace.count = nb;
    if (nb) { blkFrame.instanceMatrix.needsUpdate = blkFace.instanceMatrix.needsUpdate = true; blkFace.instanceColor.needsUpdate = true; }

    // ---------- satellites orbit the tower; faster each phase, out of the way of the columns ----------
    const room = st ? ease(Math.min(1, stU * 3)) * 5 : 0;
    for (let i = 0; i < SAT; i++) {
      const s = satS[i];
      s.kick = Math.max(0, s.kick - dt * 6);
      const ring = i % 2, a = t * (ring ? -0.22 : 0.3) * (1 + (ph - 1) * 0.35) * (S.enraged ? 1.5 : 1) + i / SAT * Math.PI * 2;
      const r = 17 + ring * 3 + s.kick * 0.4 + room;
      v1.set(T.x + Math.cos(a) * r, T.y + 2 + Math.sin(a) * r * 0.55, T.z + 2 + Math.sin(a * 2) * 1.2);
      if (boot < 3) v1.lerp(v3.set(T.x + Math.cos(a) * 3, T.y + 2, T.z - 2), 1 - pulse(boot, 0.6, 2.2));
      // the laser's two pointer screens leave the orbit for their places down the side
      let relay = 0;
      if (laser && (i === laser.sat[0] || i === laser.sat[1])) {
        const L = laser, u = clamp((t - L.t0) / L.len, 0, 1), k = i === L.sat[0] ? pulse(u, 0.1, 0.35) : pulse(u, 0.2, 0.48);
        relay = L.fired ? 1 - pulse(t - L.firedT, 0.3, 1.1) : k;
        v1.lerp(i === L.sat[0] ? L.R1 : L.R2, relay);
      }
      s.relay = relay;
      if (laser && (i === laser.sat[0] || i === laser.sat[1])) { const lk = locks[i === laser.sat[0] ? 0 : 1]; lk.visible = relay > 0.6 && !laser.fired; if (lk.visible) { lk.position.copy(v1); lk.lookAt(ctx.camPos); lk.rotateZ(t * 2.5 * (i % 2 ? 1 : -1)); lk.scale.setScalar(0.8 + (1 - relay) * 2 + Math.sin(t * 14) * 0.05); } }
      if (dead) {
        // they drop out of the sky one after another and shatter on the floor
        if (!s.fall && deadT > 0.2 + i * 0.04) s.fall = { p: s.p.clone(), vy: 0, done: false };
        if (s.fall) {
          s.fall.vy -= 24 * dt; s.fall.p.y += s.fall.vy * dt;
          if (s.fall.p.y < 0.4 && !s.fall.done) { s.fall.done = true; K.fx.burst(v3.copy(s.fall.p).setY(0.4), 16, ctx.pal.a, { speed: 7, up: 2, g: 12, life: 0.6, size: 0.3, floor: 0.05 }); if (i % 4 === 0) sfx('shatter'); }
          v1.copy(s.fall.p);
        }
      }
      s.p.copy(v1);
      tmpO.position.copy(v1);
      if (relay > 0.01) { eye.getWorldPosition(v3); tmpO.lookAt(i === laser.sat[0] ? v3 : v4.copy(art)); }
      else { tmpO.lookAt(v2.copy(v1).add(v3.set(0, 0, 10))); tmpO.rotation.z = Math.sin(a) * 0.3; }
      const gone = s.fall && s.fall.done;
      tmpO.scale.setScalar(gone ? 0.001 : 1 + relay * 0.7); tmpO.updateMatrix();
      sats.setMatrixAt(i, tmpO.matrix);
      tmpO.translateZ(0.13); tmpO.updateMatrix(); faces.setMatrixAt(i, tmpO.matrix);
      faces.setColorAt(i, col.copy(ctx.pal.a).lerp(RED, relay).multiplyScalar((1 + bigFlash + relay * 1.2) * (boot < 3 ? pulse(boot, 0.6, 1.6) : 1)));
    }
    for (let i = 0; i < RS; i++) {
      tmpO.position.copy(RSP[i]).add(tower.position); tmpO.rotation.set(0, 0, 0); tmpO.scale.set(1.9, 1.05, 1); tmpO.updateMatrix();
      faces.setMatrixAt(SAT + i, tmpO.matrix);
      faces.setColorAt(SAT + i, col.copy(ctx.pal.a).lerp(RED, Math.max(screenRed, hot * 0.25)).multiplyScalar((dead ? 0.15 : 0.9) * (boot < 3 ? pulse(boot, 0.4, 1.0) : 1)));
    }
    sats.instanceMatrix.needsUpdate = faces.instanceMatrix.needsUpdate = true; faces.instanceColor.needsUpdate = true;
    codeMat.uniforms.uT.value = t;

    // ---------- the rack hatches: open for the fork bomb and in phase 3 ----------
    const bu = t - bombT, hatchOpen = Math.max(bu < 2.5 ? pulse(bu, 0, 0.3) * (1 - pulse(bu, 1.8, 2.5)) : 0, ph >= 3 && !dead ? 0.35 : 0);
    for (const h of hatches) h.pv.rotation.x = h.hz * hatchOpen * 1.6;
    if (hatchOpen > 0.5 && Math.random() < dt * 30) { const r = RACK[Math.random() < 0.5 ? 0 : 1]; K.fx.spark(v1.set(r.x + rnd(-1.2, 1.2), 20.2, r.z + rnd(-1, 1)), v2.set(rnd(-1, 1), rnd(3, 6), rnd(-1, 1)), RED, { size: 0.3, life: 0.5, g: 2 }); }

    // ---------- drones fly a wide arc from the racks round the side to Art ----------
    for (const [, d] of drones) {
      const u = clamp(1 - d.left / Math.max(1, d.total), 0, 1);
      // a short hover over the rack (the launch), then the arc
      const h = pulse(u, 0, 0.12), fl = pulse(u, 0.12, 1);
      v1.copy(d.from).add(v2.set(d.sd * 2.5 * h, 4 * h, 2.5 * h));
      if (fl > 0) {
        ctx.artAim(v3); v3.y += 0.6;
        const k = 1 - fl, ctl = v4.set(T.x + d.sd * 23, 17, T.z + 9);
        v5.set(0, 0, 0).addScaledVector(v1, k * k).addScaledVector(ctl, 2 * k * fl).addScaledVector(v3, fl * fl * 0.92 + 0.08 * fl);
        v1.copy(v5);
      }
      d.vel.copy(v1).sub(d.pos);
      d.pos.lerp(v1, Math.min(1, dt * 10));
      // tilt into the flight, rotors spinning, the eye blinking faster as it closes in
      d.m.rotation.set(clamp(d.vel.z * 3, -0.6, 0.6) + Math.sin(t * 6) * 0.1, t * 2.2, clamp(-d.vel.x * 3, -0.6, 0.6));
      d.m.children[1].rotation.y = t * 40;
      d.m.children[0].visible = Math.sin(t * (8 + u * 30)) > -0.3;
      if (Math.random() < dt * 30) K.fx.spark(d.pos, v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), RED, { size: 0.28, life: 0.35, drag: 3 });
      d.left = Math.max(0, d.left - dt * 1000);
    }
    rotorMat.color.copy(RED).multiplyScalar(0.35);

    // ---------- light on the floor ----------
    ctx.lightPool(2, v1.set(T.x, 3, T.z + 4), ctx.pal.a, (0.5 + screenPulse * 0.8) * (boot < 3 ? pulse(boot, 0.35, 1.2) : 1) * (dead ? Math.max(0, 1 - deadT * 0.3) : 1));
    ctx.lightPool(3, v1.set(T.x - 14, 4, T.z + 2), ctx.pal.a, 0.35 + hot * 0.15);
    ctx.lightPool(4, v1.set(T.x + 14, 4, T.z + 2), ctx.pal.a, 0.35 + hot * 0.15);
    if (screenRed > 0.5) ctx.lightPool(5, v1.set(T.x, T.y, T.z + 2), '#ff4d5e', screenRed);
    else if (laser && !laser.fired) ctx.lightPool(5, laser.R2, '#ff4d5e', 0.6);
    if (scorch > 0.01) ctx.lightPool(0, scorchAt, '#ff4d5e', scorch * 1.4);
    else if (st) ctx.lightPool(0, v1.set(T.x + Math.sin(t * 2) * 18, 6, T.z + 6), '#ff4d5e', stU * 0.8);

    // ---------- death ----------
    if (dead) {
      if (deadT < 1.25 && Math.random() < dt * 30) K.fx.burst(v1.set(T.x + rnd(-11, 11), T.y + rnd(-6, 6) - fall * 14, T.z + 1.2), 4, Math.random() < 0.5 ? '#ffffff' : ctx.pal.a, { speed: 6, g: 12, life: 0.8, size: 0.28 });
      if (deadT > 0.45 && !deathFx.eye) {
        deathFx.eye = true; eye.getWorldPosition(v1);
        // held down: the teardown shot is a close-up on the eye when it goes
        K.fx.burst(v1, 80, '#ffffff', { speed: 18, g: 6, life: 0.9, size: 0.34 });
        K.fx.burst(v1, 50, ctx.pal.a, { speed: 12, g: 6, life: 1.2, size: 0.4 });
        K.fx.shock(v1, WHITE, 0.6, 9, 0.6, { flat: false, face: ctx.camPos, k: 0.55 });
        K.fx.light(v1, '#ffffff', 35, 3, 40);
        ctx.juice.shake(0.5); ctx.juice.stop(80); ctx.juice.flash(0.15); sfx('zap');
      }
      if (deadT > 0.85 && !deathFx.panels) {
        // the corner blocks and side panels blow off the frame
        deathFx.panels = true; sfx('shatter');
        for (let i = 0; i < 14; i++) {
          const sd = i % 2 ? 1 : -1, y = T.y - T.h / 2 + (i / 14) * (T.h + 4);
          addBlock({ mode: 'fall', p: new V(T.x + sd * (T.w / 2 + 0.8), y, T.z + 0.2).add(tower.position), v: new V(sd * rnd(6, 12), rnd(4, 10), rnd(2, 8)), w: new V(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)), s: rnd(0.9, 1.6), c: ctx.pal.a.clone(), life: 2.4, k: 0.9 });
        }
        K.fx.burst(v1.set(T.x, T.y, T.z + 1).add(tower.position), 80, '#ffd9a0', { speed: 14, g: 10, life: 0.9, size: 0.35 });
      }
      if (deadT > 1.05 && !deathFx.glass) {
        // the screen shatters out toward the floor
        deathFx.glass = true; sfx('shatter');
        for (let i = 0; i < 16; i++) addBlock({ mode: 'fall', p: new V(T.x + rnd(-10, 10), T.y + rnd(-5, 5), T.z + 1.4).add(tower.position), v: new V(rnd(-4, 4), rnd(0, 5), rnd(4, 10)), w: new V(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10)), s: rnd(0.5, 1.1), c: WHITE.clone(), life: 2, k: 0.7 });
        K.fx.burst(v1.set(T.x, T.y, T.z + 1.5).add(tower.position), 120, '#e8fbff', { speed: 12, g: 12, life: 1, size: 0.3, dir: v2.set(0, 0, 1), dirK: 0.8 });
      }
      if (deadT > 1.25 && !deathFx.core) {
        // the core under the heatsink blows and the tower goes down
        deathFx.core = true;
        v1.set(T.x, T.y + T.h / 2 + 4.5, T.z - 0.6).add(tower.position);
        K.fx.burst(v1, 170, '#ffffff', { speed: 26, g: 8, life: 1.3, size: 0.45 });
        K.fx.burst(v1, 100, ctx.pal.a, { speed: 16, g: 6, life: 1.7, size: 0.55 });
        K.fx.shock(v1, WHITE, 1, 24, 1.1, { flat: false, face: ctx.camPos, k: 0.6 });
        K.fx.shock(v2.set(T.x, 0.1, T.z + 2), ctx.pal.a, 2, 40, 1.4);
        K.fx.light(v1, '#ffffff', 80, 1.8, 60);
        ctx.juice.shake(1); ctx.juice.stop(120); ctx.juice.flash(0.4); sfx('boom'); sfx('collapse');
        ctx.shed(v1, 30, C('#ffffff'), 2, 1);
      }
      if (deadT > 1.25 && deadT < 4.2 && Math.random() < dt * 16) K.fx.burst(v1.set(T.x + rnd(-14, 14), 0.4, T.z + rnd(-2, 5)), 6, '#cfefff', { speed: 6, up: 2, g: 12, life: 0.8, size: 0.4, floor: 0.05 });
    }
  }

  function reset() {
    dead = false; deadT = 0; endStack(false); blocks.length = 0; endLaser(); Object.keys(deathFx).forEach(k => { deathFx[k] = false; });
    for (const a of arms) { a.fallen = false; a.throwT = -9; }
    for (const s of satS) s.fall = null;
    for (const [, d] of drones) d.m.visible = false; drones.clear(); fate.clear();
  }
  function anchor(key, out) {
    if (key === 'core' || key === 'body') return eye.getWorldPosition(out).add(v4.set(0, 0.5, 0));
    if (key.startsWith('packet:')) { const d = drones.get(key.slice(7)); return d ? out.copy(d.pos).setY(d.pos.y + 1.6) : null; }
    if (key === 'head') return eye.getWorldPosition(out);
    return null;
  }
  function worldOf(at, out) {
    if (at && at.startsWith('line:')) return out.set(T.x + rnd(-8, 8), T.y + rnd(-3.5, 3.5), T.z + 1.2);
    return eye.getWorldPosition(out);
  }
  // where Art's counter shot goes on a block: a column's top, or the low pointer screen (both beside the screen)
  function attacker(attack, owner, out) {
    if (attack === 'overflow') return out.set(T.x + (Math.random() < 0.5 ? -17 : 17), 16, T.z + 6);
    if (attack === 'laser' && laser) return out.copy(laser.R2);
    return eye.getWorldPosition(out);
  }
  const subjects = { core: new V(), top: new V(T.x, 24, T.z), body: new V(T.x, T.y, T.z) };
  function subj() { eye.getWorldPosition(subjects.core); return subjects; }

  // ---------- its own broadcast shots (sb-cam.js plays them in place of the stock intro, phase and kill) ----------
  const E = () => eye.getWorldPosition(v5);
  const shots = {
    // boot: a low close-up as the screen and the eye come on, then a crane down the tower to the game shot
    intro: { pri: 4, free: true, parts: [
      { len: 1.5, cut: 1, fov: 30, pose: (c, out) => { const e = E(); out.look.set(e.x, e.y - 2.5 - c.u * 1.5, e.z); out.pos.set(e.x - 6 + c.u * 3, e.y - 6.5, e.z + 15 - c.u * 2); } },
      { len: 1.5, cut: 1, fov: 44, pose: (c, out) => { const u = ease(c.u); out.look.set(T.x, 18 - u * 6, T.z + 1); out.pos.set(T.x + 10 - u * 8, 27 - u * 15, T.z + 20 + u * 24); } },
    ] },
    // crash: the panic from under the eye in slow motion, then a high wide as it reboots with its arms flung out
    phase: { pri: 3, parts: [
      { len: 1.2, cut: 1, slow: 0.5, fov: 36, hand: 0.05, pose: (c, out) => { const e = E(); out.look.copy(e).y -= 5; out.pos.set(e.x + 9 - c.u * 2, e.y - 9.5, e.z + 31 - c.u * 3); } },
      { len: 1.3, cut: 1, fov: 50, pose: (c, out) => { out.look.set(T.x, 12, T.z); out.pos.set(T.x + 12 - c.u * 5, 18 - c.u * 2, T.z + 38); } },
    ] },
    // teardown: the eye glitching, the arms dropping from the side, then a crane back as the tower goes down
    kill: { pri: 5, free: true, parts: [
      { len: 1.1, cut: 1, slow: 0.5, fov: 34, hand: 0.04, pose: (c, out) => { const e = E(); out.look.copy(e).y -= 3; out.pos.set(e.x + 7 - c.u * 1.5, e.y - 4.5, e.z + 21 - c.u * 2); } },
      { len: 1.1, cut: 1, slow: 0.7, fov: 44, pose: (c, out) => { out.look.set(T.x - 3, 11, T.z); out.pos.set(T.x - 24 + c.u * 2, 7, T.z + 24); } },
      { len: 3.2, cut: 1, slow: 0.9, fov: 52, omega: 3, pose: (c, out) => { const a = 0.45 - c.u * 0.8, r = 46; out.look.set(T.x, 10 - c.u * 4, T.z); out.pos.set(T.x + Math.sin(a) * r, 9 + c.u * 7, T.z + Math.cos(a) * r); } },
    ] },
  };

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

  return { group, props, update, event, apply, anchor, worldOf, attacker, subj, packets, reset, shots, dispose() {}, height: 27, width: 50, camY: 9, focus: new V(0, 12, -6), face: 'core',
    info: () => ({ stack: blocks.filter(b => b.mode === 'col').length, blocks: blocks.length, laser: laser ? (laser.fired ? 'fired' : 'charging') : null, drones: drones.size }),
    // joint check: the elbow's bend (0 = straight) and which way it points; it must stay behind the arm
    // (toward the pole), so the forearm always folds forward like an elbow, never backward
    joints: () => arms.map(a => {
      const s0 = a.shW, u = v1.copy(a.elbow).sub(s0).normalize(), f = v2.copy(a.wrist).sub(a.elbow).normalize();
      const bend = Math.round(Math.acos(clamp(u.dot(f), -1, 1)) * 180 / Math.PI);
      const line = v3.copy(a.wrist).sub(s0).normalize(), off = v4.copy(a.elbow).sub(s0); off.sub(line.multiplyScalar(off.dot(line)));
      const back = off.z < 0.05 || Math.abs(off.x) > Math.abs(off.z);   // the elbow sits behind or out, never in front
      return { side: a.sd, bend, back, upper: +a.elbow.distanceTo(s0).toFixed(2), fore: +a.wrist.distanceTo(a.elbow).toFixed(2) };
    }) };
};
