// BotFighter (28 Nov 2026): a BotKit bot that fights from the keyboard, for Duel and Party.
// Gid: "on duel i think it's bot vs bot... they fly around and attack and dodge." Every move hangs off a
// typing event, never a timer:
//   each correct key   key(frac)   the bot winds up: pulls back, its glow and signature part charge with the word
//   word finished      attack(tier) the strike leaves at once, since the wind-up happened while typing (75 ms in)
//   combo tier         tier 0 a shot, 1 a double, 2 a dashing strike, 3 the dash with a flurry
//   spell              spell()     rises, flares, then drives at the other bot (the one cutaway in a fight)
//   your word lands while a shot comes at you   dodge(side)   a barrel roll aside
//   block              block()     braces into the hex shield
//   typo               typo()      a glitch: jitter, flicker, dizzy face, a short drop
//   miss               miss()      a head shake
//   no keys for 2 s    (automatic) drifts back to its spot and calms down
// Live wpm sets a stance (setWpm): under 40 it hangs back and lobs, 40-80 circles mid range, 80-120 strafes in
// close, over 120 stays in the other bot's face. Every move is 0.3 s or less and the next one cancels it, so a
// 150 wpm typist (about 2.5 words a second) never sees the bot fall behind the keyboard.
//
//   const f = BotFighter.create(THREE, 'nova', look, { gap: 14 })   gap: the distance to the other bot
//   scene.add(f.group)   place f.group at the bot's spot, turned so local +z points at the other bot
//   f.update(dt)         every frame
//   f.muzzle(out)        where a shot leaves from (world)
//   f.hold(frac)         Showdown: a finished word adds a spark that stays, the orb holds at frac until attack()
//   f.clear()            drops the charge and every spark (a new round)
//   f.pose(name, u)      a frozen frame for stills: 'ready' | 'charge' | 'attack' | 'combo' | 'dodge' | 'block' | 'typo' | 'spell' | 'ko'
//
// The orb (28 Nov 2026, Gid: "the nice thing is we can alter them and create other effects as well"): look.orb picks
// its style, bought in the hangar (REWARDS.shop.bot, part 'orb'). Each style draws the orb, the sparks that gather
// into it, the release and the typo its own way; all of them answer the same key/hold/attack/spell/typo/clear calls.
//   core    the default: a white-hot core in two fresnel shells that glow in turns
//   nebula  swirling gas with stars caught in it; sparks are stardust and leave a dusty trail
//   frost   an ice crystal that grows a spike for every letter and shatters on the strike; sparks are snowflakes
//   ember   a molten ball under licking flames; sparks are embers with short trails
//   void    a black hole with a bright accretion disk bent over its top; sparks spiral in on the disk
//   prism   a turning glass shard that splits light into a rainbow fan pointed at the other bot
//   pulse   a heart that beats faster as the word fills, an ECG trace round it; sparks are hearts, a typo flatlines
//   BotFighter.orb(THREE, parent, style, colour)   the orb alone (the hangar's try-on uses it)
//   BotFighter.orbDemo(THREE, bot, style, colour)  types a word into it on a loop: { update(t, dt), dispose }
window.BotFighter = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const ramp = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const env = (u, a, b, c) => (u < a || u > c ? 0 : u < b ? sm(ramp(u, a, b)) : 1 - sm(ramp(u, b, c)));   // up a to b, down b to c
  const snap = (u, a, b, c) => (u < a || u > c ? 0 : u < b ? Math.sin(ramp(u, a, b) * Math.PI / 2) : 1 - sm(ramp(u, b, c)));   // a fast out, a slow return
  const TAU = Math.PI * 2;
  const STANCE = [   // advance (share of the gap), strafe width, strafe speed
    { adv: 0.0, sw: 0.5, sp: 0.6 }, { adv: 0.12, sw: 1.1, sp: 0.9 }, { adv: 0.24, sw: 1.6, sp: 1.3 }, { adv: 0.33, sw: 1.9, sp: 1.8 }];
  const stanceOf = w => (w < 40 ? 0 : w < 80 ? 1 : w < 120 ? 2 : 3);
  const LEN = { attack: 0.3, combo: 0.34, dodge: 0.3, block: 0.42, miss: 0.4, spell: 0.95 };
  const RELEASE = 0.25;   // the share of an attack at which the shot leaves

  // each bot's strike, written into P at u (0..1); A grows with the combo tier, dash is tier 2 and up
  const STRIKE = {
    // Orbit, the shield: a bash, the halo flaring wide on the hit
    orbit(u, P, A, dash) { const s = snap(u, 0.08, 0.3, 1); P.z += (dash ? 1.9 : 1.0) * A * s - 0.3 * env(u, 0, 0.08, 0.3); P.rx += 0.5 * s; P.halo += 0.8 * s; P.glow += 1.2 * s; },
    // Pixel, precision: holds still, fires, kicks back off the shot; a combo fires twice
    pixel(u, P, A, dash) { const k = snap(u, 0.2, 0.28, 0.75) + (A > 1.1 ? 0.8 * snap(u, 0.5, 0.58, 1) : 0); P.z -= 0.45 * A * k - (dash ? 1.2 * env(u, 0, 0.2, 0.9) : 0); P.rx -= 0.35 * k; P.y += 0.12 * env(u, 0, 0.2, 0.8); P.glow += 1.6 * k; P.ant += k; },
    // Nova, the striker: its four blades whirl like a saw as it darts in
    nova(u, P, A, dash) { const s = snap(u, 0.05, 0.35, 1); P.z += (dash ? 2.2 : 1.1) * A * s; P.spinZ -= TAU * (dash ? 2 : 1) * sm(ramp(u, 0.02, 0.6)); P.rx += 0.3 * s; P.glow += 1.4 * s; },
    // Kite, the ghost: a blink, a streak forward and to the side, a cut on the way back
    kite(u, P, A, dash) { const b = env(u, 0.05, 0.2, 0.4), out = snap(u, 0.2, 0.3, 1); P.sx -= 0.75 * b; P.sy += 0.5 * b; P.z += (dash ? 2.2 : 1.3) * A * out; P.x += 0.7 * out; P.rz -= 0.7 * env(u, 0.25, 0.4, 0.8); P.hat += 0.4 * out; P.glow += 2 * b; },
    // Beep, the architect: a hop, then the pod fires with the ears flat back
    beep(u, P, A, dash) { const hop = env(u, 0, 0.22, 0.7), k = snap(u, 0.22, 0.3, 0.9); P.y += 0.45 * hop; P.z -= 0.35 * k * A - (dash ? 1.3 * env(u, 0.1, 0.3, 0.95) : 0); P.rx -= 0.3 * k; P.ears += 1.2 * hop; P.glow += 1.4 * k; },
    // Raze, the hunter: rears up on its legs and pounces
    raze(u, P, A, dash) { const up = env(u, 0, 0.14, 0.35), s = snap(u, 0.14, 0.32, 1); P.y += 0.6 * up - 0.35 * s; P.z += (dash ? 2.1 : 1.2) * A * s; P.rx += -0.5 * up + 0.55 * s; P.legs += -1 * up + 0.8 * s; P.glow += 1.2 * s; },
  };

  // the core: white in the middle through the glow colour to clear
  function coreTex(THREE) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // a soft dot for the sparks, or a small rounded keycap
  function radialTex(THREE, kind) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    if (kind === 'cap') {
      const gr = c.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(19, 19, 26, 26, 6); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.roundRect(24, 22, 16, 14, 4); c.fill();
    } else {
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }


  // ---------- the orb styles ----------
  const ORB_AT = [0, -0.45, 1.6];   // where the orb sits in the bot's group: in front of it, below its face
  const WHITE = { r: 1, g: 1, b: 1 };
  const easeOut = u => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
  const backOut = u => { u = clamp(u, 0, 1); const s = 2.2; return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); };
  // 24 directions spread evenly over a sphere, for shards and scatter
  const FIB = Array.from({ length: 24 }, (_, i) => { const y = 1 - (i + 0.5) / 12, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  const rng = seed => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

  // textures and shapes, made once and shared by every orb on the page
  const TEXC = {}, GEOC = {};
  function tex(THREE, name) {
    if (TEXC[name]) return TEXC[name];
    const N = ['cloud', 'molten', 'ring', 'halo', 'ecg', 'flat'].includes(name) ? 128 : 64, h = N / 2;
    const cv = document.createElement('canvas'); cv.width = N; cv.height = name === 'flame' ? N * 2 : N;
    const c = cv.getContext('2d'), R = rng(name.length * 7919 + name.charCodeAt(0));
    const radial = (x, y, r, stops) => { const g = c.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([o, s]) => g.addColorStop(o, s)); return g; };
    const blob = (x, y, r, a) => { c.fillStyle = radial(x, y, r, [[0, `rgba(255,255,255,${a})`], [1, 'rgba(255,255,255,0)']]); c.fillRect(x - r, y - r, r * 2, r * 2); };
    if (name === 'glow') { c.fillStyle = radial(h, h, h, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.95)'], [0.4, 'rgba(255,255,255,0.45)'], [0.7, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, 0, N, N); }
    else if (name === 'dot') { c.fillStyle = radial(h, h, h, [[0, '#fff'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, 0, N, N); }
    else if (name === 'star') {   // a four-point twinkle
      blob(h, h, h * 0.55, 0.9);
      c.fillStyle = '#fff'; c.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 3 : h - 2; c.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r); }
      c.closePath(); c.fill();
    } else if (name === 'flake') {   // a six-armed snowflake
      c.strokeStyle = '#fff'; c.lineCap = 'round'; c.shadowColor = '#fff'; c.shadowBlur = 5; c.lineWidth = 3.4;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a), L = h - 6;
        c.beginPath(); c.moveTo(h, h); c.lineTo(h + ca * L, h + sa * L);
        for (const f of [0.42, 0.7]) { const bx = h + ca * L * f, by = h + sa * L * f, b = L * 0.3 * (1.15 - f); for (const s of [-1, 1]) { const a2 = a + s * 0.85; c.moveTo(bx, by); c.lineTo(bx + Math.cos(a2) * b, by + Math.sin(a2) * b); } }
        c.stroke();
      }
      blob(h, h, 9, 1);
    } else if (name === 'heart') {
      const s = N / 64; c.shadowColor = '#fff'; c.shadowBlur = 7; c.fillStyle = '#fff'; c.beginPath();
      c.moveTo(32 * s, 52 * s); c.bezierCurveTo(6 * s, 34 * s, 9 * s, 10 * s, 23 * s, 12 * s); c.bezierCurveTo(28 * s, 13 * s, 31 * s, 17 * s, 32 * s, 21 * s);
      c.bezierCurveTo(33 * s, 17 * s, 36 * s, 13 * s, 41 * s, 12 * s); c.bezierCurveTo(55 * s, 10 * s, 58 * s, 34 * s, 32 * s, 52 * s); c.fill();
    } else if (name === 'shard') { c.shadowColor = '#fff'; c.shadowBlur = 4; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(h, 5); c.lineTo(h + 9, h + 4); c.lineTo(h, N - 5); c.lineTo(h - 7, h - 2); c.closePath(); c.fill(); }
    else if (name === 'cloud') {   // gas: soft blobs on two spiral arms, with darker lanes cut through
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30; i++) { const a = R() * TAU, d = Math.pow(R(), 0.8) * h * 0.55; blob(h + Math.cos(a) * d, h + Math.sin(a) * d, h * (0.14 + R() * 0.26), 0.2 + R() * 0.15); }
      for (let k = 0; k < 2; k++) for (let j = 0; j < 14; j++) { const a = k * Math.PI + j * 0.38, d = 4 + j * 3.6; blob(h + Math.cos(a) * d, h + Math.sin(a) * d, h * (0.2 - j * 0.008), 0.32); }
      blob(h, h, h * 0.35, 0.6);
      c.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 2; k++) for (let j = 2; j < 12; j++) { const a = k * Math.PI + j * 0.38 + 0.9, d = 4 + j * 3.6; blob(h + Math.cos(a) * d, h + Math.sin(a) * d, h * 0.1, 0.5); }
    } else if (name === 'molten') {   // white-hot inside, red at the rim, with dark crust floating on it
      c.fillStyle = radial(h, h, h, [[0, '#fffbe8'], [0.2, '#ffe27a'], [0.42, '#ff9a2a'], [0.62, 'rgba(226,60,12,0.9)'], [0.8, 'rgba(140,20,4,0.45)'], [1, 'rgba(80,8,0,0)']]); c.fillRect(0, 0, N, N);
      c.globalCompositeOperation = 'source-atop'; c.filter = 'blur(2px)';
      for (let i = 0; i < 26; i++) { const a = R() * TAU, d = h * (0.3 + R() * 0.42), r = h * (0.05 + R() * 0.09); c.fillStyle = `rgba(${60 + R() * 40 | 0},${8 + R() * 10 | 0},0,${0.5 + R() * 0.35})`; c.beginPath(); c.arc(h + Math.cos(a) * d, h + Math.sin(a) * d, r, 0, TAU); c.fill(); }
    } else if (name === 'flame') {   // a tongue of fire, its base at the bottom
      const H2 = N * 2; c.filter = 'blur(2.5px)';
      const g = c.createLinearGradient(0, H2, 0, 0); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.22, 'rgba(255,214,90,1)'); g.addColorStop(0.55, 'rgba(255,110,24,0.85)'); g.addColorStop(1, 'rgba(200,30,0,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(N / 2, 6); c.bezierCurveTo(N * 0.6, H2 * 0.35, N * 0.92, H2 * 0.6, N * 0.8, H2 * 0.8); c.bezierCurveTo(N * 0.7, H2 * 0.97, N * 0.3, H2 * 0.97, N * 0.2, H2 * 0.8); c.bezierCurveTo(N * 0.08, H2 * 0.6, N * 0.4, H2 * 0.35, N / 2, 6); c.fill();
    } else if (name === 'ring') { c.strokeStyle = '#fff'; c.filter = 'blur(3px)'; c.lineWidth = 8; c.beginPath(); c.arc(h, h, h * 0.8, 0, TAU); c.stroke(); c.filter = 'none'; c.lineWidth = 2.5; c.beginPath(); c.arc(h, h, h * 0.8, 0, TAU); c.stroke(); }
    else if (name === 'halo') {   // a black hole's lensed light: a thin ring, the far side of the disk bent over the top, a fainter band under
      c.strokeStyle = '#fff'; c.filter = 'blur(5px)'; c.lineWidth = 11; c.beginPath(); c.arc(h, h, h * 0.6, Math.PI * 1.06, Math.PI * 1.94); c.stroke();
      c.lineWidth = 6; c.globalAlpha = 0.5; c.beginPath(); c.arc(h, h, h * 0.6, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); c.globalAlpha = 1;
      c.filter = 'blur(1.5px)'; c.lineWidth = 3; c.beginPath(); c.arc(h, h, h * 0.6, 0, TAU); c.stroke();
    } else if (name === 'ecg' || name === 'flat') {   // a heartbeat trace drawn round a circle, or the flat line
      const R0 = h * 0.6, g = (x, m, w, k) => k * Math.exp(-Math.pow((x - m) / w, 2));
      const wave = a => { if (name === 'flat') return 0; const x = a / TAU; return g(x, 0.05, 0.02, 4) - g(x, 0.105, 0.006, 5) + g(x, 0.12, 0.008, 21) - g(x, 0.136, 0.007, 9) + g(x, 0.22, 0.03, 6); };
      const path = () => { c.beginPath(); for (let i = 0; i <= 480; i++) { const a = i / 480 * TAU, r = R0 + wave(a); c.lineTo(h + Math.cos(a) * r, h - Math.sin(a) * r); } c.closePath(); };
      c.strokeStyle = '#fff'; c.lineJoin = 'round'; c.filter = 'blur(4px)'; c.lineWidth = 9; path(); c.stroke(); c.filter = 'none'; c.lineWidth = 3.4; path(); c.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return (TEXC[name] = t);
  }
  const flat = (THREE, g) => { const n = g.toNonIndexed(); g.dispose(); n.computeVertexNormals(); return n; };
  function geo(THREE, name) {
    if (GEOC[name]) return GEOC[name];
    let g;
    if (name === 'ball') g = new THREE.SphereGeometry(1, 24, 16);
    else if (name === 'shard') { g = flat(THREE, new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0.12), new THREE.Vector2(0.21, 0.64), new THREE.Vector2(0, 1)], 6)); g.rotateX(Math.PI / 2); }   // an ice column, base at the middle
    else if (name === 'gem') g = flat(THREE, new THREE.LatheGeometry([new THREE.Vector2(0, -1), new THREE.Vector2(0.5, -0.2), new THREE.Vector2(0.5, 0.25), new THREE.Vector2(0, 1)], 3));   // a three-sided glass shard
    else if (name === 'disk') g = new THREE.RingGeometry(1, 2.5, 72, 1);
    else if (name === 'fan') {   // seven beams leaving the prism toward +z, one per colour, spread in y
      const P = [], C = [], D = [], S = [], RB = ['#ff3b3b', '#ff9a2e', '#ffe14a', '#4dff7a', '#3bc8ff', '#5a6bff', '#b45cff'];
      const col = new THREE.Color();
      RB.forEach((hex, i) => {
        col.set(hex); const a = (i / 6 - 0.5), z0 = 0.15, z1 = 1, w0 = 0.02, w1 = 0.07;
        const q = [[a * z0 - w0, z0, 0, -1], [a * z0 + w0, z0, 0, 1], [a * z1 - w1, z1, 1, -1], [a * z1 + w1, z1, 1, 1]];
        for (const k of [0, 1, 2, 2, 1, 3]) { P.push(0, q[k][0], q[k][1]); C.push(col.r, col.g, col.b); D.push(q[k][2]); S.push(q[k][3]); }
      });
      g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute('aD', new THREE.Float32BufferAttribute(D, 1)); g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1));
    }
    return (GEOC[name] = g);
  }
  // a shell that's clear in the middle and glows at the edge (the default orb's look)
  const shellMat = (THREE, col, k, pw) => new THREE.ShaderMaterial({
    uniforms: { col: { value: col.clone().multiplyScalar(k) }, op: { value: 1 }, pw: { value: pw } },
    vertexShader: 'varying vec3 n; varying vec3 v; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); n = normalize(normalMatrix * normal); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 col; uniform float op; uniform float pw; varying vec3 n; varying vec3 v; void main(){ float f = pow(1.0 - abs(dot(normalize(n), normalize(v))), pw); gl_FragColor = vec4(col * (f * 1.6 + 0.06), (f + 0.06) * op); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  // flat facets lit from a fixed light, for ice and glass (works on an InstancedMesh too)
  const FACET_V = `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 p = vec4(position, 1.0); vec3 nn = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; nn = mat3(instanceMatrix) * nn;
      #endif
      vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * nn); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
  const iceMat = (THREE, ice, deep) => new THREE.ShaderMaterial({
    uniforms: { cIce: { value: ice }, cDeep: { value: deep }, uHot: { value: 0 }, uGrey: { value: 0 } },
    vertexShader: FACET_V,
    fragmentShader: `uniform vec3 cIce; uniform vec3 cDeep; uniform float uHot; uniform float uGrey; varying vec3 vN; varying vec3 vV;
      void main(){ vec3 n = normalize(vN), v = normalize(vV), L = normalize(vec3(0.35, 0.8, 0.5));
        float ndl = dot(n, L), fr = pow(1.0 - abs(dot(n, v)), 2.0), sp = pow(max(0.0, dot(reflect(-L, n), v)), 28.0);
        vec3 c = mix(cDeep, cIce, 0.15 + 0.85 * max(ndl, 0.0)) + fr * cIce * 0.6 + sp * vec3(1.6) + uHot * cIce * 1.2;
        c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 0.6, uGrey);
        gl_FragColor = vec4(c, 1.0); }` });
  const prismMat = THREE => new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOp: { value: 1 }, uGrey: { value: 0 } },
    vertexShader: FACET_V,
    fragmentShader: `uniform float uT; uniform float uOp; uniform float uGrey; varying vec3 vN; varying vec3 vV;
      vec3 hue(float h){ return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
      void main(){ vec3 n = normalize(vN), v = normalize(vV); float fr = pow(1.0 - abs(dot(n, v)), 1.4);
        float sp = pow(max(0.0, dot(reflect(-normalize(vec3(0.3, 0.9, 0.4)), n), v)), 20.0);
        vec3 c = hue(dot(n, vec3(0.7, 0.4, 0.6)) * 0.9 + fr * 0.7 + uT * 0.12) * (0.3 + 1.5 * fr) + vec3(1.0) * (pow(fr, 5.0) * 1.2 + sp * 1.6);
        c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 0.5, uGrey);
        gl_FragColor = vec4(c * uOp, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const fanMat = THREE => new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 1 }, uGrey: { value: 0 } },
    vertexShader: 'attribute float aD; attribute float aS; attribute vec3 color; varying vec3 vC; varying float vD; varying float vS; void main(){ vC = color; vD = aD; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uOp; uniform float uGrey; varying vec3 vC; varying float vD; varying float vS;
      void main(){ vec3 c = mix(vC, vec3(0.35), uGrey); float a = pow(1.0 - vD, 1.3) * smoothstep(0.0, 0.12, vD) * (1.0 - vS * vS); gl_FragColor = vec4(c * a * uOp * 1.6, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const diskMat = (THREE, hot, col) => new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOp: { value: 1 }, cHot: { value: hot }, cCol: { value: col } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform float uOp; uniform vec3 cHot; uniform vec3 cCol; varying vec2 vP;
      void main(){ float r = length(vP), a = atan(vP.y, vP.x), k = clamp((r - 1.0) / 1.5, 0.0, 1.0);
        float sw = a + uT * (2.6 / r);   // the inside turns faster
        float bands = 0.5 + 0.3 * sin(sw * 3.0 - log(r) * 10.0) + 0.2 * sin(sw * 7.0 + r * 9.0);
        float dop = 0.55 + 0.75 * (0.5 + 0.5 * cos(a));   // the side turning toward you is brighter
        vec3 c = mix(cHot, cCol, smoothstep(0.0, 0.55, k)) * bands * dop * pow(1.0 - k, 1.5) * smoothstep(0.0, 0.05, k) * 2.2;
        gl_FragColor = vec4(c * uOp, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  // what makes each style its own. build(c) adds its pieces; draw(c, time, dt, r0, ob, fl, vis) moves them each frame
  // (r0 the orb's size, ob how charged, fl the flash of a strike, vis whether the orb shows at all). Optional:
  // sparkTex and sparkCol(c, i) the sparks' look, slot(c, sp, out, ch, time) where a spark circles, sparkFx(c, sp, time, ch)
  // a last touch on each spark, burst / shock / debris the release, fizz the typo.
  const STYLES = {
    core: {
      build(c) {
        const { THREE, own, col } = c;
        c.core = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: own(coreTex(THREE)), color: col.clone().lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
        c.shellA = new THREE.Mesh(own(new THREE.SphereGeometry(1, 24, 16)), own(shellMat(THREE, col, 2.2, 2.2)));
        c.shellB = new THREE.Mesh(own(new THREE.SphereGeometry(1, 24, 16)), own(shellMat(THREE, col, 1.6, 1.4)));
        c.group.add(c.shellB, c.shellA, c.core);
      },
      draw(c, time, dt, r0, ob, fl, vis) {
        c.group.visible = vis; if (!vis) return;
        const w = Math.sin(time * 7), hot = Math.min(1, fl);   // the two shells take turns: one glows as the other clears
        c.core.scale.setScalar(r0 * (1.5 + 0.12 * Math.sin(time * 31)));
        c.shellA.scale.setScalar(r0 * (0.9 + 0.1 * w)); c.shellA.material.uniforms.op.value = 0.08 + 1.1 * Math.pow(0.5 + 0.5 * w, 2) + hot;
        c.shellB.scale.setScalar(r0 * (1.45 - 0.1 * w)); c.shellB.material.uniforms.op.value = 0.06 + 0.95 * Math.pow(0.5 - 0.5 * w, 2) + hot;
      },
    },

    // swirling gas in the glow colour and two neighbours of it, stars caught in it; stardust sparks with dusty trails
    nebula: {
      sparkTex: 'star',
      sparkCol: c => c.pal.a.clone().lerp(WHITE, 0.55).multiplyScalar(2.4),
      build(c) {
        const { THREE, col } = c, hsl = {}; col.getHSL(hsl);
        const a = new THREE.Color().setHSL(hsl.h, 0.85, 0.55), b = new THREE.Color().setHSL((hsl.h + 0.42) % 1, 0.9, 0.5), d = new THREE.Color().setHSL((hsl.h + 0.7) % 1, 0.95, 0.4);
        c.pal = { a, b, d, star: a.clone().lerp(WHITE, 0.75).multiplyScalar(1.5) };
        c.clouds = [[d, 0.7, 1, 4.4], [b, 0.65, -1, 3.4], [a, 0.7, 1, 2.3]].map(([k, m, dir, sz], i) => { const s = c.sprite('cloud', k.clone().multiplyScalar(m)); s.material.rotation = i * 2.1; s.userData = { dir, sz, spin: 0.5 + 0.35 * i }; return s; });
        c.heart = c.sprite('glow', a.clone().lerp(WHITE, 0.5).multiplyScalar(1.1));
        c.dust = c.points(64, 'star');
        this.burst = { tex: 'cloud', size: 2.4, grow: 2.2, len: 0.45, col: b.clone().multiplyScalar(0.8) };
      },
      debris: { n: 18, speed: 2.6, size: 0.14, len: 0.5, grav: 0, col: c => c.pal.star },
      fizz: { n: 6, speed: 0.6, size: 0.1, len: 0.4, grav: -1.5, col: c => c.grey },
      draw(c, time, dt, r0, ob, fl, vis) {
        c.group.visible = vis;
        const sour = c.sour;
        if (vis) {
          const sw = 1 + 2.2 * ob;   // it swirls faster as the word fills
          c.clouds.forEach((s, i) => {
            const U = s.userData; s.material.rotation += dt * U.dir * U.spin * sw;
            s.scale.setScalar(r0 * U.sz * (1 + 0.05 * Math.sin(time * (2 + i) + i)) * (1 - 0.25 * sour));
            s.material.opacity = (0.9 - 0.1 * i) * (1 - 0.65 * sour) + 0.3 * Math.min(1, fl);
          });
          c.heart.scale.setScalar(r0 * (1.0 + 0.12 * Math.sin(time * 9)) * (1 + 0.6 * Math.min(1, fl)));
          // stars caught in the gas, turning with it
          const sp = time * (0.6 + 1.6 * ob);
          for (let i = 0; i < 14; i++) {
            const f = FIB[i * 3 % 24], a = sp * (i % 2 ? 1 : 0.75), ca = Math.cos(a), sa = Math.sin(a), d = r0 * (0.5 + 0.8 * ((i * 0.618) % 1));
            c.dust.put(c.CORE.x + (f[0] * ca - f[2] * sa) * d, c.CORE.y + f[1] * d * 0.7, c.CORE.z + (f[0] * sa + f[2] * ca) * d, r0 * (0.2 + 0.16 * Math.abs(Math.sin(time * 4 + i * 3))), c.pal.star, 1 - sour);
          }
        }
        c.trails(4, 0.035, 0.11, c.pal.star, 0.7);
      },
    },

    // an ice crystal: a spike grows for every letter, it shatters on the strike, a typo snaps the newest spike off
    frost: {
      sparkTex: 'flake',
      sparkCol: c => c.pal.ice.clone().lerp(WHITE, 0.4).multiplyScalar(2.2),
      build(c) {
        const { THREE, col, own } = c;
        const ice = new THREE.Color('#8fd8ff').lerp(col, 0.12), deep = new THREE.Color('#0b2f6e').lerp(col, 0.08);
        c.pal = { ice, deep, glint: ice.clone().lerp(WHITE, 0.6).multiplyScalar(2) };
        c.inner = c.sprite('glow', ice.clone().multiplyScalar(0.9));
        c.aura = new THREE.Mesh(geo(THREE, 'ball'), own(shellMat(THREE, ice, 0.6, 3.5))); c.group.add(c.aura);
        c.mat = own(iceMat(THREE, ice.clone(), deep.clone()));
        c.ice = new THREE.InstancedMesh(geo(THREE, 'shard'), c.mat, 24); c.ice.frustumCulled = false; c.parent.add(c.ice);
        c.dust = c.points(48, 'shard');
        c.m4 = new THREE.Matrix4(); c.q = new THREE.Quaternion(); c.q2 = new THREE.Quaternion(); c.p = new THREE.Vector3(); c.s = new THREE.Vector3(); c.d = new THREE.Vector3(); c.Z = new THREE.Vector3(0, 0, 1); c.Y = new THREE.Vector3(0, 1, 0);
        this.burst = { tex: 'glow', size: 1.3, grow: 1.0, len: 0.18, col: ice.clone().multiplyScalar(0.9) };
        this.shock = { size: 2.2, grow: 4, len: 0.28, col: ice.clone().multiplyScalar(1.0) };
      },
      debris: { n: 20, speed: 3.4, size: 0.16, len: 0.55, grav: -4, col: c => c.pal.glint },
      fizz: { n: 6, speed: 1.2, size: 0.12, len: 0.4, grav: -5, col: c => c.pal.ice },
      draw(c, time, dt, r0, ob, fl, vis) {
        c.group.visible = vis;
        const R = r0 * 2.0, spin = time * 0.6, M = c.ice;
        const put = (i, dirI, len, scale, off, tumble, drop) => {
          const f = FIB[dirI]; c.d.set(f[0], f[1], f[2]).applyAxisAngle(c.Y, spin);
          c.q.setFromUnitVectors(c.Z, c.d); if (tumble) { c.q2.setFromAxisAngle(c.Y, tumble); c.q.premultiply(c.q2); }
          c.p.copy(c.CORE).addScaledVector(c.d, off); c.p.y += drop;
          c.s.set(scale, scale, scale * len); M.setMatrixAt(i, c.m4.compose(c.p, c.q, c.s));
        };
        let n = 0;
        // the growing crystal: two small seed spikes, then one per letter typed (up to 12)
        if (vis) {
          const k = Math.min(12, c.nKeys), big = ob > 1.05;   // a spell grows the whole crystal at once
          for (let i = 0; i < (big ? 12 : Math.max(2, k)); i++) {
            const g = i < k ? backOut((time - c.keyAt[i]) / 0.16) : big ? Math.min(1, (ob - 1) * 1.5) : 0.45;
            put(n++, (i * 7) % 24, 0.8 + 0.4 * ((i * 0.618) % 1), R * Math.max(0.001, g), 0, 0, 0);
          }
          c.inner.scale.setScalar(r0 * (1.4 + 0.6 * Math.min(1, fl)));
          c.aura.scale.setScalar(r0 * 1.7); c.aura.material.uniforms.op.value = 0.2 + 0.3 * ob + 0.6 * Math.min(1, fl);
        }
        // the shatter: the spikes the strike broke fly apart, spinning
        const ru = time - c.relAt;
        if (ru >= 0 && ru < 0.5) { const k = ru / 0.5, e = easeOut(k); for (let i = 0; i < Math.min(12, c.relN); i++) put(n++, (i * 7) % 24, 0.8, c.relR * 2 * (1 - k * 0.8), c.relR * (0.5 + 6 * e), ru * (9 + i), -2.5 * ru * ru); }
        // a typo: the newest spike snaps off and drops
        const ty = time - c.typoAt;
        if (ty >= 0 && ty < 0.5 && c.typoN < 12) { const i = c.typoN; put(n++, (i * 7) % 24, 0.9, R * (1 - ty), R * 0.5, ty * 14, -0.3 * ty - 4 * ty * ty); }
        M.count = n; M.instanceMatrix.needsUpdate = true; M.visible = n > 0;
        c.mat.uniforms.uHot.value = Math.min(1, fl) * 0.8; c.mat.uniforms.uGrey.value = c.sour * (Math.sin(time * 90) > 0 ? 1 : 0.4);
        c.trails(2, 0.03, 0.08, c.pal.ice, 0.5);
      },
      sparkFx(c, sp, time) { sp.m.material.rotation = time * 1.8 + sp.slot; },
    },

    // a molten ball under licking flames; embers trail behind as they fly in
    ember: {
      sparkTex: 'dot',
      sparkCol: (c, i) => c.pal[i % 3 ? 'ember' : 'hot'].clone().multiplyScalar(2.4),
      build(c) {
        const { THREE } = c;
        c.pal = { ember: new THREE.Color('#ff9a3a'), hot: new THREE.Color('#ffe08a'), red: new THREE.Color('#ff4a12'), smoke: new THREE.Color('#5a4a44') };
        c.heat = c.sprite('glow', new THREE.Color('#ff4a10').multiplyScalar(0.9));
        c.flames = [0, 1, 2, 3, 4, 5, 6].map(i => { const s = c.sprite('flame', new THREE.Color(i % 2 ? '#ff6a14' : '#ffa03a').multiplyScalar(1.1)); s.center.set(0.5, 0.1); return s; });
        c.ball = c.sprite('molten', new THREE.Color(1.5, 1.5, 1.5));
        c.dust = c.points(72, 'dot');
        this.burst = { tex: 'molten', size: 2.0, grow: 2.4, len: 0.35, col: new THREE.Color(1.8, 1.6, 1.4) };
        this.shock = { size: 2.2, grow: 4, len: 0.28, col: new THREE.Color('#ff7a2a').multiplyScalar(1.6) };
      },
      debris: { n: 22, speed: 3, size: 0.12, len: 0.6, grav: -5, col: (c, i) => (i % 2 ? c.pal.hot : c.pal.ember) },
      fizz: { n: 8, speed: 0.5, size: 0.22, len: 0.6, grav: 1.2, col: c => c.pal.smoke },
      draw(c, time, dt, r0, ob, fl, vis) {
        c.group.visible = vis;
        const sour = c.sour, hot = Math.min(1, fl);
        if (vis) {
          c.ball.scale.setScalar(r0 * 2.0 * (1 + 0.04 * Math.sin(time * 23))); c.ball.material.rotation = time * 0.7;
          c.heat.scale.setScalar(r0 * (4 + 1.5 * hot)); c.heat.material.opacity = 0.55 + 0.3 * ob;
          c.flames.forEach((s, i) => {
            const fl2 = 0.5 + 0.5 * Math.sin(time * (9 + i * 1.7) + i * 2) * Math.sin(time * (5.3 + i) + i);
            const h = r0 * (1.9 + 1.3 * fl2) * (1 + 0.5 * ob + 0.8 * hot) * (1 - 0.7 * sour);
            s.scale.set(r0 * (1.05 + 0.2 * fl2), h, 1);
            s.material.rotation = (i - 3) * 0.19 + 0.1 * Math.sin(time * 6 + i * 1.3);
            s.material.opacity = 0.85 - 0.25 * sour;
          });
          // embers rising off it
          for (let i = 0; i < 12; i++) {
            const ph = (time * (0.7 + 0.05 * i) + i * 0.137) % 1, x = Math.sin(i * 7.1) * r0 * 0.6 + Math.sin(time * 3 + i) * 0.06;
            c.dust.put(c.CORE.x + x, c.CORE.y + r0 * 0.5 + ph * (0.7 + 0.8 * ob), c.CORE.z + Math.cos(i * 5.3) * r0 * 0.5, 0.07 * (1 - ph) + 0.02, ph < 0.4 ? c.pal.hot : c.pal.red, Math.min(1, ob * 2.5) * (1 - ph));
          }
        }
        c.trails(4, 0.022, 0.11, c.pal.red, 0.85);
      },
      sparkFx(c, sp, time) { if (sp.st === 2) sp.m.scale.multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin(time * 17 + sp.slot * 3))); },
    },

    // a black hole: a dark centre, a bright accretion disk round it and the disk's far side bent over the top
    void: {
      sparkTex: 'dot',
      sparkCol: c => c.pal.hot.clone().multiplyScalar(2.6),
      build(c) {
        const { THREE, col, own } = c;
        const hot = new THREE.Color('#fff1d6'), rim = col.clone().lerp(new THREE.Color('#ffae5c'), 0.3);
        c.pal = { hot, rim, deep: col.clone().multiplyScalar(0.6) };
        c.hole = new THREE.Mesh(geo(THREE, 'ball'), own(new THREE.MeshBasicMaterial({ color: '#000000' }))); c.group.add(c.hole);
        c.photon = new THREE.Mesh(geo(THREE, 'ball'), own(shellMat(THREE, hot.clone().lerp(rim, 0.5), 1.8, 5))); c.group.add(c.photon);
        c.disk = new THREE.Mesh(geo(THREE, 'disk'), own(diskMat(THREE, hot.clone(), rim.clone())));
        c.dX = new THREE.Vector3(0, 0, -1); c.dY = new THREE.Vector3(0, 1, 0); c.dN = new THREE.Vector3(1, 0, 0);
        const v = new THREE.Vector3(), u = new THREE.Vector3(), m = new THREE.Matrix4();
        c.disk.onBeforeRender = (r, s, cam) => {   // tip the disk to the camera, so it reads the same from every side
          v.setFromMatrixPosition(cam.matrixWorld); c.group.worldToLocal(v); if (v.lengthSq() < 1e-6) return; v.normalize();
          u.set(0, 1, 0).addScaledVector(v, -v.y); if (u.lengthSq() < 1e-4) u.set(0, 0, 1); u.normalize();
          const b = 1.08 + c.wob;
          c.dX.crossVectors(u, v).normalize(); c.dN.copy(v).multiplyScalar(Math.cos(b)).addScaledVector(u, Math.sin(b)).normalize(); c.dY.crossVectors(c.dN, c.dX);
          c.disk.quaternion.setFromRotationMatrix(m.makeBasis(c.dX, c.dY, c.dN)); c.disk.updateMatrixWorld();
        };
        c.group.add(c.disk);
        c.lens = c.sprite('halo', rim.clone().lerp(WHITE, 0.25).multiplyScalar(1.3));
        c.dust = c.points(32, 'dot');
        c.wob = 0;
        this.burst = { tex: 'glow', size: 1.6, grow: 1.0, len: 0.18, col: hot.clone().multiplyScalar(1.2) };
        this.shock = { size: 2.6, grow: 5, len: 0.32, col: rim.clone().multiplyScalar(1.2) };
      },
      debris: { n: 14, speed: 3.5, size: 0.1, len: 0.35, grav: 0, col: c => c.pal.hot },
      draw(c, time, dt, r0, ob, fl, vis) {
        const ru = time - c.relAt, pop = ru >= 0 && ru < 0.3 ? 1 - Math.sin(Math.min(1, ru / 0.3) * Math.PI) : 1;   // the hole snaps shut on the strike and opens again
        c.group.visible = vis;
        if (!vis) return;
        const R = r0 * 0.95, sour = c.sour;
        c.wob = sour * 0.35 * Math.sin(time * 47);
        c.hole.scale.setScalar(R * pop); c.photon.scale.setScalar(R * 1.1 * pop); c.photon.material.uniforms.op.value = 0.9 + Math.min(1, fl);
        c.disk.scale.setScalar(R * (1 + 0.6 * Math.min(1, fl)));
        const u = c.disk.material.uniforms; u.uT.value = time * (1 + 2.5 * ob); u.uOp.value = (1.2 + 0.8 * ob + Math.min(1, fl)) * (1 - 0.6 * sour * (Math.sin(time * 80) > 0 ? 1 : 0));
        c.lens.scale.setScalar(R * 3.7 * pop); c.lens.material.opacity = 0.45 * (1 - 0.6 * sour);
        c.trails(3, 0.025, 0.08, c.pal.rim, 0.6);
      },
      // sparks circle on the disk and spiral in the longer they wait
      slot(c, sp, out, ch, time) {
        const age = Math.max(0, time - sp.at), r = (0.95 - 0.25 * ch) * (0.45 + 0.55 * Math.exp(-age * 0.9)), a = sp.slot * 2.399 + time * (1.2 + 1.4 / r);
        return out.copy(c.CORE).addScaledVector(c.dX, Math.cos(a) * r).addScaledVector(c.dY, Math.sin(a) * r);
      },
      sparkFx(c, sp, time) { if (sp.st === 1 || sp.st === 2) sp.m.scale.multiplyScalar(0.6); if (sp.st === 4) { const k = (time - sp.at) / 0.25; sp.m.position.lerp(c.CORE, Math.min(1, k * 0.6)); sp.m.scale.setScalar(0.3 * (1 - k)); } },
    },

    // a turning glass shard that splits light into a rainbow fan aimed at the other bot
    prism: {
      sparkTex: 'star',
      sparkCol: (c, i) => c.rb[i % 7].clone().lerp(WHITE, 0.3).multiplyScalar(2.4),
      build(c) {
        const { THREE, own } = c;
        c.rb = ['#ff3b3b', '#ff9a2e', '#ffe14a', '#4dff7a', '#3bc8ff', '#5a6bff', '#b45cff'].map(h => new THREE.Color(h));
        c.pal = { glint: new THREE.Color(2, 2, 2) };
        c.inner = c.sprite('glow', new THREE.Color(0.9, 0.9, 1.0));
        c.gem = new THREE.Mesh(geo(THREE, 'gem'), own(prismMat(THREE))); c.group.add(c.gem);
        c.fan = new THREE.Mesh(geo(THREE, 'fan'), own(fanMat(THREE))); c.group.add(c.fan);
        const v = new THREE.Vector3();
        c.fan.onBeforeRender = (r, s, cam) => {   // turn the fan about its own axis to face the camera
          v.setFromMatrixPosition(cam.matrixWorld); c.group.worldToLocal(v);
          if (v.x * v.x + v.y * v.y > 1e-4) { c.fan.rotation.z = Math.atan2(v.y, v.x); c.fan.updateMatrixWorld(); }
        };
        c.spin = 0;
        c.dust = c.points(30, 'star');
        this.burst = { tex: 'star', size: 2.2, grow: 1.2, len: 0.2, col: new THREE.Color(1.2, 1.2, 1.3) };
      },
      debris: { n: 14, speed: 3, size: 0.13, len: 0.45, grav: 0, col: (c, i) => c.rb[i % 7] },
      fizz: { n: 5, speed: 0.8, size: 0.1, len: 0.35, grav: -3, col: c => c.grey },
      draw(c, time, dt, r0, ob, fl, vis) {
        c.group.visible = vis;
        const ru = time - c.relAt, flare = ru >= 0 && ru < 0.4 ? 1 - ru / 0.4 : 0, sour = c.sour;
        c.spin += dt * (1.4 + 4 * ob + 18 * flare);
        if (!vis && flare <= 0) return;
        c.group.visible = true;
        const R = Math.max(r0, flare * c.relR) * 1.4;
        c.gem.scale.set(R * 0.75, R * 1.25, R * 0.75); c.gem.rotation.set(0.3 + 0.08 * Math.sin(time * 2), c.spin, 0.25 + sour * 0.4 * Math.sin(time * 50));
        c.gem.material.uniforms.uT.value = time; c.gem.material.uniforms.uOp.value = 1 + 0.6 * Math.min(1, fl); c.gem.material.uniforms.uGrey.value = sour;
        c.inner.scale.setScalar(R * (0.9 + 0.8 * Math.min(1, fl)));
        // the fan grows longer and wider as the word fills, and flares down the line on the strike
        const len = R * (1.8 + 2.6 * ob + 3.5 * flare) * (1 - 0.6 * sour), spread = 0.5 + 0.9 * ob + 0.5 * flare;
        c.fan.scale.set(1, len * spread * 0.9, len);
        c.fan.material.uniforms.uOp.value = (0.45 + 0.8 * ob + 0.9 * flare) * (sour > 0 && Math.sin(time * 70) > 0 ? 0.3 : 1); c.fan.material.uniforms.uGrey.value = sour;
        // glints at the shard's tips
        for (let i = 0; i < 2; i++) c.dust.put(c.CORE.x, c.CORE.y + (i ? -1 : 1) * R * 1.2, c.CORE.z, R * (0.5 + 0.4 * Math.abs(Math.sin(time * 6 + i * 2))), c.pal.glint, 0.8 * (1 - sour));
      },
      sparkFx(c, sp, time) { sp.m.material.rotation = time * 3 + sp.slot; },
    },

    // a heart: it beats faster as the word fills, a ripple leaves it on every key, a typo flatlines it
    pulse: {
      sparkTex: 'heart',
      sparkCol: c => c.pal.pink.clone().lerp(WHITE, 0.2).multiplyScalar(1.7),
      build(c) {
        const { THREE, col } = c;
        c.pal = { pink: new THREE.Color('#ff4f8b').lerp(col, 0.2), line: col.clone().lerp(WHITE, 0.1) };
        c.glowS = c.sprite('glow', new THREE.Color('#ff2d63').multiplyScalar(0.35));
        c.coreS = c.sprite('heart', new THREE.Color('#ff2d63').lerp(col, 0.15).multiplyScalar(1.15));
        c.ecg = c.sprite('ecg', c.pal.line.clone().multiplyScalar(1.1));
        c.flat = c.sprite('flat', new THREE.Color('#ff3b3b').multiplyScalar(1.8));
        c.ripples = [0, 1, 2, 3, 4, 5].map(() => { const s = c.sprite('ring', c.pal.line.clone().multiplyScalar(1.4), c.parent); s.position.copy(c.CORE); return s; });
        c.phase = 0; c.beat = 0;
        c.dust = c.points(24, 'heart');
        this.burst = { tex: 'heart', size: 1.6, grow: 1.6, len: 0.3, col: c.pal.pink.clone().multiplyScalar(1.2) };
      },
      debris: { n: 10, speed: 2.2, size: 0.16, len: 0.5, grav: -2, col: c => c.pal.pink },
      draw(c, time, dt, r0, ob, fl, vis) {
        c.group.visible = vis;
        const sour = c.sour, ty = time - c.typoAt;
        c.phase += dt * (1.1 + 2.2 * ob);
        const f = c.phase % 1, g = (m, w) => Math.exp(-Math.pow((f - m) / w, 2));
        const beat = sour > 0 ? 0 : g(0.06, 0.05) + 0.55 * g(0.25, 0.05), kick = Math.exp(-Math.max(0, time - c.lastKey) * 11);
        c.beat = beat;
        if (vis) {
          const k = r0 * (1 + 0.3 * beat + 0.3 * kick) * (1 + 0.5 * Math.min(1, fl));
          c.coreS.scale.setScalar(k * 1.7); c.glowS.scale.setScalar(k * 3.0);
          const flatOn = ty >= 0 && ty < 0.5;
          c.ecg.visible = !flatOn; c.flat.visible = flatOn;
          c.ecg.scale.setScalar(r0 * 5.2); c.ecg.material.rotation = -c.phase * TAU * 0.5; c.ecg.material.opacity = 0.65 + 0.35 * beat;
          c.flat.scale.setScalar(r0 * 5.2); c.flat.material.opacity = Math.sin(time * 40) > 0 ? 1 : 0.5;
        }
        // a ripple for each of the last keys, two big ones on the strike
        let n = 0;
        for (let j = 0; j < 4; j++) {
          const at = c.kRing[j], age = time - at; const s = c.ripples[n++];
          s.visible = age >= 0 && age < 0.4 && at > c.relAt - 0.05;
          if (s.visible) { const e = easeOut(age / 0.4); s.scale.setScalar(Math.max(0.15, r0) * (1.2 + 3 * e)); s.material.opacity = 0.7 * (1 - e); }
        }
        const ru = time - c.relAt;
        for (let j = 0; j < 2; j++) {
          const s = c.ripples[n++], age = ru - j * 0.1; s.visible = age >= 0 && age < 0.45;
          if (s.visible) { const e = easeOut(age / 0.45); s.scale.setScalar(c.relR * (1.5 + 8 * e)); s.material.opacity = 1 - e; }
        }
        c.trails(2, 0.03, 0.08, c.pal.pink, 0.4);
      },
      sparkFx(c, sp) { if (sp.st === 2) sp.m.scale.multiplyScalar(1 + 0.35 * c.beat); },
    },
  };
  const ORBS = Object.keys(STYLES);

  // the orb on a bot: parent is the bot's group; colour its glow (a THREE.Color or a hex)
  function makeOrb(THREE, parent, style, colour, o = {}) {
    const V = THREE.Vector3, ST = STYLES[style] ? { ...STYLES[style] } : { ...STYLES.core }, keep = [], own = x => (keep.push(x), x);
    const col = new THREE.Color(colour || '#8cff58'), CORE = new V(...ORB_AT);
    const group = new THREE.Group(); group.position.copy(CORE); parent.add(group);
    const _v4 = new THREE.Vector4(), _a = new V(), _b = new V();
    const c = { THREE, group, parent, col, own, CORE, relAt: -9, relN: 0, relR: 0.42, typoAt: -9, typoN: 99, keyAt: new Float32Array(16).fill(-9), nKeys: 0, lastKey: -9, kRing: new Float32Array(4).fill(-9), kSeq: 0, lastR0: 0, sour: 0, grey: new THREE.Color(0.5, 0.5, 0.52) };
    const extras = [];   // sprites and points that live on the parent, removed on dispose
    c.sprite = (name, color, par = group) => { const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: tex(THREE, name), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))); par.add(s); if (par !== group) extras.push(s); return s; };
    // pooled soft points with their own size, colour and fade, in one draw call; filled again every frame
    c.points = (n, name) => {
      const g = own(new THREE.BufferGeometry()), pos = new Float32Array(n * 3), cl = new Float32Array(n * 4), sz = new Float32Array(n);
      const A = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', A(pos, 3)); g.setAttribute('aCol', A(cl, 4)); g.setAttribute('aSize', A(sz, 1));
      const m = own(new THREE.ShaderMaterial({
        uniforms: { map: { value: tex(THREE, name) }, uScale: { value: 400 } },
        vertexShader: 'attribute float aSize; attribute vec4 aCol; uniform float uScale; varying vec4 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale * projectionMatrix[1][1] / max(0.05, -mv.z), 0.0, 200.0); vC = aCol; }',
        fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)); gl_FragColor = vec4(vC.rgb * t.rgb * t.a * vC.a, 1.0); }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 7; parent.add(p); extras.push(p);
      p.onBeforeRender = r => { r.getCurrentViewport(_v4); m.uniforms.uScale.value = _v4.w * 0.5; };
      let k = 0;
      return {
        put(x, y, z, s, color, a) { if (k >= n || a <= 0.003) return; pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; cl[k * 4] = color.r; cl[k * 4 + 1] = color.g; cl[k * 4 + 2] = color.b; cl[k * 4 + 3] = Math.min(1, a); sz[k] = s; k++; },
        begin() { k = 0; },
        end() { g.setDrawRange(0, k); p.visible = k > 0; if (k) { g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true; } },
      };
    };

    // the sparks: sprites that rise from the air round the bot into slots round the orb
    const sTex = o.spark === 'cap' ? own(radialTex(THREE, 'cap')) : ST.sparkTex ? tex(THREE, ST.sparkTex) : own(radialTex(THREE, 'dot'));
    const NS = 14, sparks = Array.from({ length: NS }, (_, i) => {
      const m = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: sTex, color: col.clone().multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
      m.visible = false; m.renderOrder = 7; parent.add(m); extras.push(m);
      return { m, st: 0, at: 0, from: new V(), slot: i, pop: 0 };
    });
    c.sparks = sparks;
    ST.build.call(ST, c);
    if (ST.sparkCol) sparks.forEach((sp, i) => sp.m.material.color.copy(ST.sparkCol(c, i)));
    if ((ST.debris || ST.fizz) && !c.dust) c.dust = c.points(32, 'dot');
    if (ST.burst) { c.bs = c.sprite(ST.burst.tex, ST.burst.col, parent); c.bs.position.copy(CORE); c.bs.visible = false; }
    if (ST.shock) { c.sk = c.sprite('ring', ST.shock.col, parent); c.sk.position.copy(CORE); c.sk.visible = false; }
    let nLive = 0, sparkSeq = 0;
    // where an orbit slot sits round the core: a ring that tightens as the word fills
    function slotPos(sp, out, ch, time) {
      if (ST.slot) return ST.slot(c, sp, out, ch, time);
      const a = sp.slot * 2.399 + time * (2.2 + 3 * ch), r = 0.85 - 0.2 * ch, tilt = 0.5;
      return out.set(Math.cos(a) * r, Math.sin(a) * r * Math.cos(tilt), Math.sin(a) * r * Math.sin(tilt) * 0.6).add(CORE);
    }
    // where a spark was at an earlier time, worked out again rather than remembered (for trails)
    function sparkAt(sp, time, ch, out) {
      const u = time - sp.at; if (u < 0) return null;
      if (sp.st === 1 || (sp.st === 2 && u < 0.18)) { const k = sm(u / 0.18); slotPos(sp, _b, ch, time); out.lerpVectors(sp.from, _b, k); out.y += Math.sin(k * Math.PI) * 0.25; return out; }
      return slotPos(sp, out, ch, time);
    }
    // a short trail behind every spark: n points, gap seconds apart
    c.trails = (n, gap, size, color, alpha) => {
      if (!c.dust) return;
      for (const sp of sparks) {
        if (!sp.st || sp.st === 4) continue;
        for (let j = 1; j <= n; j++) {
          const f = 1 - j / (n + 1);
          if (sp.st === 3) { c.dust.put(sp.m.position.x, sp.m.position.y, sp.m.position.z - j * 0.14, size * f, color, alpha * f * sp.m.material.opacity); continue; }
          if (!sparkAt(sp, c.time - j * gap, c.ob, _a)) break;
          c.dust.put(_a.x, _a.y, _a.z, size * f, color, alpha * f * sp.m.material.opacity);
        }
      }
    };
    function launch(born) {
      const sp = sparks[sparkSeq++ % NS]; if (sp.st === 1 || sp.st === 2) nLive--;
      const a = sparkSeq * 2.1 + 0.7, e = Math.sin(sparkSeq * 1.37) * 0.8;
      sp.from.set(Math.cos(a) * 1.9, e, Math.sin(a) * 1.4 + 0.4);
      sp.st = 1; sp.at = born; sp.pop = 0; nLive++;
      if (c.nKeys < 16) c.keyAt[c.nKeys] = born;
      c.nKeys++; c.lastKey = born; c.kRing[c.kSeq++ % 4] = born;
    }
    function drawSparks(time, dt, ch) {
      for (const sp of sparks) {
        if (!sp.st) { sp.m.visible = false; continue; }
        const u = time - sp.at;
        sp.m.visible = true;
        if (sp.st === 1) {   // rising from the key into its slot
          const k = sm(u / 0.18); slotPos(sp, _a, ch, time);
          sp.m.position.lerpVectors(sp.from, _a, k); sp.m.position.y += Math.sin(k * Math.PI) * 0.25;
          sp.m.scale.setScalar(0.3 * Math.min(1, u / 0.05) + 0.1 * (1 - k)); sp.m.material.opacity = Math.min(1, u / 0.05);
          if (k >= 1) sp.st = 2;
        } else if (sp.st === 2) { slotPos(sp, sp.m.position, ch, time); sp.m.scale.setScalar(0.28 + 0.08 * ch); sp.m.material.opacity = 0.95; }
        else if (sp.st === 3) {   // released: pulled into the core and thrown forward with the shot
          const k = u / 0.18; if (k >= 1) { sp.st = 0; sp.m.visible = false; continue; }
          if (k < 0.3) sp.m.position.lerp(CORE, 0.5); else sp.m.position.z += dt * 30;
          sp.m.material.opacity = 1 - k; sp.m.scale.setScalar(0.32 * (1 - k * 0.5));
        } else if (sp.st === 4) {   // a typo: this one fizzles out
          const k = u / 0.25; if (k >= 1) { sp.st = 0; sp.m.visible = false; continue; }
          sp.m.scale.setScalar(0.3 + 0.5 * k); sp.m.material.opacity = (1 - k) * (Math.sin(u * 90) > 0 ? 1 : 0.3); sp.m.position.y -= dt * 0.8;
        }
        if (ST.sparkFx) ST.sparkFx(c, sp, time, ch);
      }
    }
    // scatter: n points thrown out from the orb at `at`, falling with grav
    function scatter(D, at, time, R0, seed) {
      const u = time - at; if (u < 0 || u >= D.len) return;
      const k = u / D.len, e = easeOut(k);
      for (let i = 0; i < D.n; i++) {
        const f = FIB[(i * 5 + seed) % 24], sp = D.speed * (0.6 + 0.6 * ((i * 0.618 + seed * 0.1) % 1)), d = R0 * 0.6 + sp * e * D.len;
        c.dust.put(CORE.x + f[0] * d, CORE.y + f[1] * d + D.grav * u * u * 0.5, CORE.z + f[2] * d, D.size * (1 - 0.5 * k), D.col(c, i), 1 - k);
      }
    }
    return {
      group, CORE, style: STYLES[style] ? style : 'core', sparks,
      launch,
      // the word is done: every spark goes with the shot
      release(at, still) {
        for (const sp of sparks) if (sp.st === 1 || sp.st === 2) {
          sp.st = 3; sp.at = at;
          if (still) { slotPos(sp, sp.m.position, 1, at); sp.m.position.lerp(CORE, 0.3).z += 0.9 + sp.slot * 0.12; }
        }
        nLive = 0; c.relAt = at; c.relN = c.nKeys; c.relR = Math.max(0.3, c.lastR0); c.nKeys = 0;
      },
      // a typo: the newest spark fizzles out
      fizzle(at) {
        let last = null; for (const sp of sparks) if ((sp.st === 1 || sp.st === 2) && (!last || sp.at > last.at)) last = sp;
        if (last) { last.st = 4; last.at = at; nLive--; }
        c.typoAt = at; if (c.nKeys > 0) c.nKeys--; c.typoN = c.nKeys;
      },
      clear() { sparks.forEach(sp => { sp.st = 0; sp.m.visible = false; }); nLive = 0; c.nKeys = 0; c.relAt = c.typoAt = -9; c.relN = 0; c.kRing.fill(-9); },
      // ob: how big the charge is (0..1, more in a spell), fl: the strike's flash
      draw(time, dt, ob, fl) {
        c.time = time; c.ob = ob;
        const r0 = 0.08 + 0.34 * ob + 0.5 * fl, vis = r0 > 0.08, ty = time - c.typoAt;
        c.sour = ty >= 0 && ty < 0.4 ? 1 - ty / 0.4 : 0;
        if (c.dust) c.dust.begin();
        ST.draw(c, time, dt, r0, ob, fl, vis);
        if (ST.debris) scatter(ST.debris, c.relAt, time, c.relR, 0);
        if (ST.fizz) scatter(ST.fizz, c.typoAt, time, Math.max(0.15, r0), 7);
        for (const [S, m] of [[ST.burst, c.bs], [ST.shock, c.sk]]) {
          if (!S) continue;
          const k = (time - c.relAt) / S.len; m.visible = k >= 0 && k < 1;
          if (m.visible) { m.scale.setScalar(c.relR * S.size * (1 + S.grow * easeOut(k))); m.material.opacity = Math.pow(1 - k, 2); m.material.rotation = k * 1.5; }
        }
        drawSparks(time, dt, ob);
        if (c.dust) c.dust.end();
        if (vis) c.lastR0 = r0;
      },
      dispose() { extras.forEach(x => x.parent && x.parent.remove(x)); if (c.ice) c.ice.parent && c.ice.parent.remove(c.ice); group.parent && group.parent.remove(group); if (c.ice) c.ice.dispose(); keep.forEach(x => x.dispose && x.dispose()); },
    };
  }

  // the hangar's try-on: types a word into the orb on a loop (8 keys, a short hold, the strike, a rest); every third word has a typo
  function orbDemo(THREE, bot, style, colour) {
    const orb = makeOrb(THREE, bot.group, style, colour);
    let n = -1, at = -9, keys = 0, charge = 0, chargeTo = 0, relAt = -9, typoAt = -9, start = null;
    const KEY = 0.12, HOLD = 0.35, REST = 0.75, CYCLE = 8 * KEY + HOLD + REST;
    return {
      orb,
      update(t, dt) {
        if (start == null) start = t;
        const loop = Math.floor((t - start) / CYCLE), u = (t - start) - loop * CYCLE;
        if (loop !== n) { n = loop; keys = 0; at = start + loop * CYCLE; }
        while (keys < 8 && u >= keys * KEY) {
          const when = at + keys * KEY;
          if (n % 3 === 2 && keys === 5 && typoAt < at) { orb.fizzle(when); typoAt = when; chargeTo *= 0.6; }
          else { keys++; chargeTo = keys / 8; orb.launch(when); }
        }
        if (u >= 8 * KEY + HOLD && relAt < at) { relAt = at + 8 * KEY + HOLD; orb.release(relAt); chargeTo = 0; charge *= 0.3; }
        charge += (chargeTo - charge) * Math.min(1, dt * 18);
        const ra = (t - relAt) / LEN.attack;
        const fl = ra >= 0 && ra < 1 ? snap(ra, 0.12, RELEASE, 0.55) : 0, extra = ra >= 0 && ra < 1 ? 0.6 * (1 - ramp(ra, 0, RELEASE)) : 0;
        let ob = charge + extra; if (t - typoAt < 0.36 && Math.sin(t * 131) > 0) ob *= 0.1;
        orb.draw(t, dt, ob, fl);
      },
      dispose: () => orb.dispose(),
    };
  }

  function create(THREE, id, look = {}, o = {}) {
    const bot = BotKit.create(THREE, id, { ...look, scale: o.scale || 1, lite: o.lite, color: look.color || o.color });
    const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig); rig.add(bot.group);
    const HOVER = BotKit.HOVER, gap = o.gap || 12, V = THREE.Vector3, parts = bot.parts || {};
    const strike = STRIKE[id] || STRIKE.orbit;
    let t = Math.random() * 10, lastKey = -9, charge = 0, chargeTo = 0, kick = 0;
    let act = null, react = null, hitAt = -9, hitPow = 0, koAt = null, winAt = null, wpm = 0, stance = 0, sNow = 0, held = 0;
    const P = {}, S = {}, KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'glow', 'halo', 'ant', 'hat', 'ears', 'legs', 'spinZ', 'orb', 'flash', 'shield'];
    const zero = () => KEYS.forEach(k => { P[k] = 0; });
    zero(); KEYS.forEach(k => { S[k] = 0; });
    const vel = new V(), prev = new V(), wv = new V();
    // the charge: an orb at the bot's front that grows with the word and flashes as the shot leaves, its style
    // from look.orb (see the styles above). The block: a hex shield in front of it.
    const fxc = (BotKit.FX[look.color] && BotKit.FX[look.color].base) || look.color || o.color || '#8cff58';
    const add = (c, k, op) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const keep = [];
    const own = x => (keep.push(x), x);
    const orb = makeOrb(THREE, bot.group, look.orb || o.orb || 'core', o.sparkColor || fxc, { spark: o.spark });
    const shield = new THREE.Group(); bot.group.add(shield);
    const cap = (seg, ring) => { const g = own(new THREE.SphereGeometry(1, seg, ring, 0, TAU, 0, 1.05)); g.rotateX(Math.PI / 2); return g; };
    const hexFill = new THREE.Mesh(cap(24, 10), own(add(fxc, 0.8, 0.22))); hexFill.material.side = THREE.DoubleSide;
    const hexEdge = new THREE.Mesh(cap(6, 3), own(add(fxc, 2.4, 0.9))); hexEdge.material.wireframe = true;
    const rimG = own(new THREE.TorusGeometry(Math.sin(1.05), 0.03, 6, 48)); rimG.translate(0, 0, Math.cos(1.05));
    const hexIn = new THREE.Mesh(rimG, own(add(fxc, 2.6, 0.95)));
    shield.add(hexFill, hexEdge, hexIn);
    let face = '', strafe = 0;

    const start = (kind, extra = {}) => { act = { kind, at: t, len: LEN[kind] || 0.3, ...extra }; };
    const api = {
      group, bot, id, orb,
      // a correct key: frac is how much of the word is typed
      key(frac = 0) { chargeTo = clamp(frac, 0, 1); kick = 1; lastKey = t; orb.launch(t); },
      // Showdown: a finished word adds a spark that stays, and the orb holds at frac (0..1) until attack()
      hold(frac = 0, spark = true) { held = clamp(frac, 0, 1); kick = 1; lastKey = t; if (spark) orb.launch(t); },
      // the word is done: strike now. Returns the ms until the shot leaves
      attack(tier = 0) { const combo = tier >= 2; start(combo ? 'combo' : 'attack', { A: [1, 1.2, 1.45, 1.7][clamp(tier, 0, 3)], dash: combo }); chargeTo = 0; held = 0; charge *= 0.3; lastKey = t; bot.fire(t + LEN.attack * RELEASE); orb.release(t); return Math.round(LEN.attack * RELEASE * 1000); },
      dodge(side = Math.random() < 0.5 ? -1 : 1) { start('dodge', { side }); },
      block() { start('block'); },
      miss() { start('miss'); },
      spell() { start('spell'); chargeTo = 0; held = 0; charge = 0; orb.release(t); },
      typo() { react = { kind: 'typo', at: t, len: 0.36 }; chargeTo *= 0.6; orb.fizzle(t); },
      hit(dir, power = 0.5) { bot.hit(dir || new V(0, 0, -1), t); hitAt = t; hitPow = clamp(power, 0.2, 1.5); },
      ko() { koAt = t; act = null; react = null; },
      rise() { koAt = null; winAt = null; },
      // drops the charge and every spark at once (a new round)
      clear() { held = 0; chargeTo = 0; charge = 0; act = null; react = null; orb.clear(); },
      victory() { winAt = t; },
      setWpm(w) { wpm = w || 0; },
      get stance() { return stance; },
      update, pose, muzzle: out => bot.body.localToWorld(out.set(0, 0, 1.15)),
      dispose: () => { orb.dispose(); keep.forEach(x => x.dispose()); bot.dispose(); },
    };

    function compute(dt) {
      zero(); face = '';
      // the stance: how far in and how wide it circles, from the live wpm; idle drifts back home
      const idle = t - lastKey > 2;
      stance = idle ? 0 : stanceOf(wpm);
      sNow += (stance - sNow) * Math.min(1, dt * 1.6);
      const lo = STANCE[Math.floor(sNow)], hi = STANCE[Math.min(3, Math.ceil(sNow))], f = sNow - Math.floor(sNow);
      const adv = lo.adv + (hi.adv - lo.adv) * f, sw = lo.sw + (hi.sw - lo.sw) * f, sp = lo.sp + (hi.sp - lo.sp) * f;
      strafe += dt * sp;
      rig.position.set(Math.sin(strafe) * sw, Math.sin(strafe * 1.7) * 0.25 * (sNow / 3), adv * gap);
      if (idle && !act) face = 'calm';

      // the charge: the word being typed winds the bot up
      charge += (chargeTo - charge) * Math.min(1, dt * 18); kick = Math.max(0, kick - dt * 9);
      if (t - lastKey > 1.2) chargeTo = 0;
      if (held > chargeTo) chargeTo = held;
      const c = charge;
      P.z += -0.45 * c + 0.08 * kick; P.rx += -0.22 * c; P.y += 0.12 * c; P.glow += 1.4 * c + 0.4 * kick;
      P.orb += c; P.halo += 0.35 * c; P.ant += 0.6 * c; P.hat += 0.15 * c; P.ears += 0.7 * c; P.legs += -0.55 * c;
      if (c > 0.65) { P.x += Math.sin(t * 61) * 0.02 * c; P.y += Math.sin(t * 53) * 0.02 * c; }   // straining
      if (c > 0.05) face = 'focus';

      if (act) {
        const u = (t - act.at) / act.len;
        if (u >= 1) act = null;
        else if (act.kind === 'attack' || act.kind === 'combo') { strike(u, P, act.A, act.dash); P.flash += snap(u, 0.12, RELEASE, 0.55) * act.A; P.orb += 0.6 * (1 - ramp(u, 0, RELEASE)); face = 'angry'; }
        else if (act.kind === 'dodge') { const s = snap(u, 0, 0.3, 1); P.x += 1.2 * act.side * s; P.y += (act.side > 0 ? 1.25 : -0.85) * s; P.z -= 0.3 * s; P.spinZ -= act.side * TAU * sm(ramp(u, 0.02, 0.7)); face = 'focus'; }
        else if (act.kind === 'block') { const b = snap(u, 0, 0.18, 1); P.rx += 0.45 * b; P.z -= 0.45 * b; P.y -= 0.15 * b; P.sy -= 0.12 * b; P.sx += 0.08 * b; P.glow += 1 * b; P.shield += b; P.halo += 0.4 * b; P.legs += 0.4 * b; face = 'focus'; }
        else if (act.kind === 'miss') { const w = env(u, 0, 0.15, 1); P.ry += Math.sin(u * TAU * 2) * 0.32 * w; P.rx -= 0.12 * w; face = 'hurt'; }
        else if (act.kind === 'spell') {
          const rise = env(u, 0, 0.45, 0.95), drive = snap(u, 0.62, 0.72, 1);
          P.y += 1.2 * rise; P.orb += 2.2 * rise * (1 - drive); P.flash += 2.2 * snap(u, 0.6, 0.68, 0.9); P.rx += -0.45 * env(u, 0, 0.45, 0.65) + 0.55 * drive; P.z += 1.4 * drive - 0.4 * env(u, 0, 0.4, 0.65);
          P.sx += 0.15 * rise; P.sy += 0.15 * rise; P.glow += 2.6 * rise + 1.5 * drive; P.halo += 1.2 * rise; P.ears += 1 * rise; P.legs -= 0.8 * rise; P.ant += rise; P.hat += 0.3 * rise;
          P.spinZ += id === 'nova' ? -TAU * 3 * sm(ramp(u, 0.1, 0.7)) : 0;
          face = 'angry';
        }
      }
      if (react) {
        const u = (t - react.at) / react.len;
        if (u >= 1) react = null;
        else {   // a typo: the bot glitches
          const w = 1 - u, j = n => Math.sin(t * (97 + n * 13) + n) * w;
          P.x += 0.18 * j(1); P.y += 0.12 * j(2) - 0.4 * env(u, 0, 0.2, 1); P.rz += 0.16 * j(3) + 0.3 * env(u, 0, 0.15, 1); P.sx += 0.12 * j(4); P.sy -= 0.12 * j(4); P.glow -= (Math.sin(t * 173) > 0 ? 1.4 : 0) * w;
          P.orb *= Math.sin(t * 131) > 0 ? 0.1 : 1; face = 'dizzy';
        }
      }
      const hu = t - hitAt;
      if (hu < 0.6) { const k = snap(hu / 0.6, 0, 0.15, 1) * hitPow; P.z -= 1.1 * k; P.y += 0.2 * k; }
      if (koAt != null) {   // knocked out of the air: tumbles down onto the floor and stays there, dark
        const k = sm((t - koAt) / 0.9);
        const raze = id === 'raze';   // Raze lands on its back with its legs in the air; the round ones on their side
        P.y += -(HOVER - (raze ? 1.25 : 1.05)) * k + Math.sin(Math.min(1, (t - koAt) / 0.9) * Math.PI) * 0.8; P.z -= 1.3 * k; P.rz += (raze ? Math.PI : id === 'kite' ? 0.75 : 1.35) * k; P.rx -= 0.3 * k; P.glow -= 1.3 * k; P.legs += raze ? 0.9 * k : 0; face = 'x';
      }
    }

    function apply(dt, now) {
      const a = now ? 1 : 1 - Math.exp(-dt * 30);
      for (const k of KEYS) S[k] = k === 'spinZ' ? P[k] : S[k] + (P[k] - S[k]) * a;
      bot.group.position.set(S.x, HOVER + S.y, S.z);
      bot.group.rotation.set(S.rx, S.ry, S.rz);
      bot.group.scale.set(1 + S.sx, 1 + S.sy, 1 + S.sx);
      // the bot leans into how it's moving through the arena
      bot.group.getWorldPosition(wv); vel.copy(wv).sub(prev).divideScalar(Math.max(1e-3, dt)); prev.copy(wv);
      if (!now) vel.applyAxisAngle(new V(0, 1, 0), -group.rotation.y); else vel.set(0, 0, 0);
      if (winAt != null) { const VP = {}; BotKit.victoryPose(look.victory || 'hop', t - winAt, VP); bot.group.position.y += VP.y; bot.group.rotation.y += VP.turn; bot.group.rotation.z += VP.tilt; bot.group.rotation.x += VP.flip; face = VP.face; bot.cheer(t, look.victory || 'hop'); }
      bot.update(t, now ? 0.016 : dt, { vel: now ? null : vel, face: face || undefined });
      bot.body.rotation.z += S.spinZ;
      // the signature parts take the charge and the strike
      if (parts.halo) { parts.halo.rotation.y += t * 6 * S.halo; parts.halo.scale.setScalar(1 + 0.45 * Math.max(0, S.halo)); }
      if (parts.ants) parts.ants.forEach(({ a, sx }) => { a.rotation.z -= sx * 0.45 * S.ant; });
      if (parts.hat) parts.hat.rotation.x += 0.5 * S.hat;
      if (parts.ribbon) parts.ribbon.rotation.x -= 1.2 * S.hat;
      if (parts.ears) parts.ears.forEach(e => { e.rotation.x -= 0.9 * S.ears; });
      if (parts.legs) parts.legs.forEach(L => { L.hip.rotation.x += 0.6 * S.legs; L.knee.rotation.x -= 0.5 * S.legs; });
      if (parts.arm) parts.arm.rotation.x -= 0.4 * clamp(S.glow, 0, 2);
      bot.glowMat.color.multiplyScalar(clamp(1 + S.glow * 0.55, 0.15, 3.5));
      orb.draw(t, now ? 0 : dt, Math.max(0, S.orb), Math.max(0, S.flash));
      const sh = Math.max(0, S.shield); shield.visible = sh > 0.03;
      if (shield.visible) { shield.scale.setScalar(1.9 * (0.7 + 0.3 * sh)); hexFill.material.opacity = 0.22 * sh; hexEdge.material.opacity = 0.9 * sh; hexIn.material.opacity = 0.95 * sh; hexEdge.rotation.z = t * 0.8; }
    }

    function update(dt) { t += dt; compute(dt); apply(dt, false); }

    // a frozen frame for the pose sheet
    function pose(name, u = 0.5, o2 = {}) {
      act = react = null; koAt = winAt = null; hitAt = -9; charge = chargeTo = 0; kick = 0; lastKey = t;
      sNow = stance = 0; strafe = 0; wpm = 0;
      orb.clear();
      const word = o2.word || 'keyboard', typed = name === 'charge' || name === 'typo' ? Math.round(u * word.length) : name === 'attack' || name === 'combo' ? word.length : 0;
      for (let i = 0; i < typed; i++) orb.launch(t - 1 - (typed - i) * 0.01);
      if (o2.phase != null) t += o2.phase;
      if (name === 'charge') { charge = chargeTo = u; kick = 0.5; }
      if (name === 'typo') { charge = chargeTo = u * 0.6; orb.fizzle(t - 0.07); }
      if (name === 'attack' || name === 'combo') orb.release(t - 0.07, true);
      if (name === 'attack' || name === 'combo') { act = { kind: name, at: t - u * LEN[name], len: LEN[name], A: name === 'combo' ? 1.7 : 1, dash: name === 'combo' }; }
      else if (['dodge', 'block', 'miss', 'spell'].includes(name)) act = { kind: name, at: t - u * LEN[name], len: LEN[name], side: o2.side || 1 };
      if (name === 'typo') react = { kind: 'typo', at: t - 0.1, len: 0.36 };
      else if (name === 'ko') koAt = t - 2;
      compute(0); rig.position.set(0, 0, 0); apply(0, true);
    }
    return api;
  }
  return { create, STANCE, stanceOf, LEN, ORBS, orb: makeOrb, orbDemo };
})();
