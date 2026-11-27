// The duel arena: a night stadium stage for two. A round stage of dark panels with a lit rim in
// both fighters' colours, a hex pedestal and a spotlight for each fighter, stands of crowd with
// light sticks in their side's colour, a jumbotron and two side screens, a lighting truss with
// sweeping beams, haze and dust. Everything is code-made: canvas textures, instanced crowd, one
// draw call per kind of thing.
//
//   const A = DuelArena.build(THREE, scene, { cols: ['#39ff88', '#f29d30'], names: ['Guest', 'swift_mira'], lite })
//   A.update(t, dt)                    each frame
//   A.board({ round, text, sub, hot })   what the jumbotron shows (redrawn only when it changes)
//   A.hype(side, k)                    the crowd jumps and the lights flare for a side (-1 both)
//   A.pad(i, out)                      the pedestal top of fighter i
//   A.dispose()
window.DuelArena = (() => {
  function build(THREE, scene, o = {}) {
    const V = THREE.Vector3, keep = [];
    const own = x => (keep.push(x), x);
    const C = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
    const cols = (o.cols || ['#39ff88', '#f29d30']).map(c => new THREE.Color(c));
    const lite = !!o.lite;
    const POS = o.pos || [new V(-5.4, 0, 0), new V(5.4, 0, 0)];
    const root = new THREE.Group(); scene.add(root);
    const PAD_TOP = 0.155, PAD_R = 2.2;
    let seed = 7;
    const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
    const hex2 = c => '#' + c.getHexString();

    scene.background = C('#03070a');
    scene.fog = new THREE.FogExp2('#04090c', 0.021);

    // ---------- the stage floor: dark panels, seams, a hex field, the lit centre mark ----------
    const fcv = document.createElement('canvas'); fcv.width = fcv.height = lite ? 512 : 1024;
    {
      const c = fcv.getContext('2d'), W = fcv.width, R = W / 2, s = W / 1024;
      const g = c.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, '#1a2328'); g.addColorStop(0.55, '#11181c'); g.addColorStop(0.86, '#0b1013'); g.addColorStop(1, '#05080a');
      c.fillStyle = g; c.fillRect(0, 0, W, W);
      // brushed grain
      for (let i = 0; i < 9000 * s; i++) { const a = rnd(0, Math.PI * 2), r = rnd(0, R); c.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.035).toFixed(3)})`; c.fillRect(R + Math.cos(a) * r, R + Math.sin(a) * r, rnd(4, 18) * s, 1); }
      // hex field
      c.strokeStyle = 'rgba(160,200,210,0.07)'; c.lineWidth = 1.2 * s;
      const hs = 26 * s;
      for (let y = -hs; y < W + hs; y += hs * 1.5) for (let x = -hs; x < W + hs; x += hs * Math.sqrt(3)) {
        const ox = (Math.round(y / (hs * 1.5)) % 2) * hs * Math.sqrt(3) / 2;
        c.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(x + ox + Math.cos(a) * hs * 0.96, y + Math.sin(a) * hs * 0.96); } c.stroke();
      }
      // concentric panel seams and radial cuts
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 3 * s;
      for (const r of [0.18, 0.36, 0.6, 0.82]) { c.beginPath(); c.arc(R, R, R * r, 0, Math.PI * 2); c.stroke(); }
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; c.beginPath(); c.moveTo(R + Math.cos(a) * R * 0.36, R + Math.sin(a) * R * 0.36); c.lineTo(R + Math.cos(a) * R * 0.98, R + Math.sin(a) * R * 0.98); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1 * s;
      for (const r of [0.182, 0.362, 0.602, 0.822]) { c.beginPath(); c.arc(R, R, R * r, 0, Math.PI * 2); c.stroke(); }
      // the halves: a faint wash of each side's colour toward its fighter
      for (const [i, sx] of [[0, -1], [1, 1]]) {
        const hg = c.createRadialGradient(R + sx * R * 0.5, R, 0, R + sx * R * 0.5, R, R * 0.6);
        const col = cols[i], rgb = `${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0}`;
        hg.addColorStop(0, `rgba(${rgb},0.16)`); hg.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = hg; c.fillRect(0, 0, W, W);
      }
      // the centre line and the ticks round the rim
      c.strokeStyle = 'rgba(230,240,240,0.22)'; c.lineWidth = 2 * s; c.setLineDash([14 * s, 10 * s]);
      c.beginPath(); c.moveTo(R, R * 0.1); c.lineTo(R, R * 1.9); c.stroke(); c.setLineDash([]);
      for (let k = 0; k < 120; k++) { const a = k / 120 * Math.PI * 2, l = k % 10 ? 0.025 : 0.05; c.strokeStyle = k % 10 ? 'rgba(220,235,235,0.18)' : 'rgba(240,250,250,0.4)'; c.beginPath(); c.moveTo(R + Math.cos(a) * R * 0.9, R + Math.sin(a) * R * 0.9); c.lineTo(R + Math.cos(a) * R * (0.9 - l), R + Math.sin(a) * R * (0.9 - l)); c.stroke(); }
      // centre emblem: two chevrons meeting
      c.save(); c.translate(R, R); c.strokeStyle = 'rgba(235,245,245,0.3)'; c.lineWidth = 5 * s;
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 70 * s, -60 * s); c.lineTo(sx * 18 * s, 0); c.lineTo(sx * 70 * s, 60 * s); c.stroke(); }
      c.beginPath(); c.arc(0, 0, 110 * s, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    const floorTex = own(new THREE.CanvasTexture(fcv)); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = 4;
    const STAGE_R = 12.5;
    const floorMat = own(new THREE.MeshBasicMaterial({ map: floorTex, color: C('#ffffff', 0.92) }));
    const floor = new THREE.Mesh(own(new THREE.CylinderGeometry(STAGE_R, STAGE_R + 0.25, 0.55, 96, 1)), [floorMat, floorMat, floorMat]);
    // only the top cap shows the texture, the side gets a dark band
    const sideMat = own(new THREE.MeshBasicMaterial({ color: '#070b0d' }));
    floor.material = [sideMat, floorMat, sideMat];
    floor.position.y = -0.275; root.add(floor);
    // fix the cap's UVs so the texture spans the disc
    // the ground beyond the stage: a dark grid that fades into the haze
    const gcv = document.createElement('canvas'); gcv.width = gcv.height = 256;
    { const c = gcv.getContext('2d'); c.fillStyle = '#05090b'; c.fillRect(0, 0, 256, 256); c.strokeStyle = 'rgba(120,160,170,0.12)'; c.lineWidth = 2; c.strokeRect(0, 0, 256, 256); c.strokeStyle = 'rgba(120,160,170,0.05)'; c.lineWidth = 1; c.beginPath(); c.moveTo(128, 0); c.lineTo(128, 256); c.moveTo(0, 128); c.lineTo(256, 128); c.stroke(); }
    const gTex = own(new THREE.CanvasTexture(gcv)); gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(30, 30); gTex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(160, 160)), own(new THREE.MeshBasicMaterial({ map: gTex })));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.56; root.add(ground);

    // the rim: a lit strip round the stage edge, each half in its fighter's colour, white where they meet
    const sideColors = (geo, k = 1) => {
      const P = geo.attributes.position, colA = new Float32Array(P.count * 3), wc = new THREE.Color('#ffffff'), cc = new THREE.Color();
      geo.computeBoundingBox();
      for (let i = 0; i < P.count; i++) {
        const v = new V().fromBufferAttribute(P, i).applyMatrix4(geo.userData.m || new THREE.Matrix4());
        const x = v.x, side = x < 0 ? 0 : 1, near = Math.max(0, 1 - Math.abs(x) / 1.6);
        cc.copy(cols[side]).lerp(wc, near * 0.8).multiplyScalar(k);
        colA[i * 3] = cc.r; colA[i * 3 + 1] = cc.g; colA[i * 3 + 2] = cc.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
      return geo;
    };
    const rimGeo = sideColors(own(new THREE.CylinderGeometry(STAGE_R + 0.27, STAGE_R + 0.27, 0.12, 128, 1, true)), 1.3);
    const rimMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = -0.08; root.add(rim);
    const r2g = own(new THREE.TorusGeometry(STAGE_R * 0.9, 0.035, 4, 128)); r2g.rotateX(Math.PI / 2); sideColors(r2g, 0.9);
    const rim2 = new THREE.Mesh(r2g, own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false })));
    rim2.position.y = 0.012; root.add(rim2);

    // soft glow textures
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
    { const c = glowCv.getContext('2d'); const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }
    const glow = own(new THREE.CanvasTexture(glowCv));
    const decal = (size, col, op, y = 0.02, blend = THREE.AdditiveBlending) => {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(size, size)), own(new THREE.MeshBasicMaterial({ map: glow, color: col, transparent: true, opacity: op, depthWrite: false, blending: blend, toneMapped: false, fog: false })));
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 1; root.add(m); return m;
    };

    // ---------- the pedestals: one per fighter, hex, with lit edges and a light pool ----------
    const pads = POS.map((p, i) => {
      const g = new THREE.Group(); g.position.copy(p); root.add(g);
      const col = cols[i];
      const body = new THREE.Mesh(own(new THREE.CylinderGeometry(2.45, 2.7, 0.14, 6)), own(new THREE.MeshBasicMaterial({ color: '#0c1215' })));
      body.position.y = 0.07; body.rotation.y = Math.PI / 6; g.add(body);
      const top = new THREE.Mesh(own(new THREE.CylinderGeometry(2.26, 2.26, 0.01, 6)), own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.05).add(new THREE.Color('#0d1316')) })));
      top.position.y = 0.145; top.rotation.y = Math.PI / 6; g.add(top);
      const ringG = own(new THREE.RingGeometry(2.28, 2.42, 6)); ringG.rotateX(-Math.PI / 2);
      const edge = new THREE.Mesh(ringG, own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), toneMapped: false })));
      edge.position.y = 0.152; edge.rotation.y = Math.PI / 6; g.add(edge);
      const inner = own(new THREE.RingGeometry(1.2, 1.26, 6)); inner.rotateX(-Math.PI / 2);
      const in2 = new THREE.Mesh(inner, own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.7), toneMapped: false, transparent: true, opacity: 0.6 })));
      in2.position.y = 0.153; in2.rotation.y = Math.PI / 6; g.add(in2);
      // the lit seam round the pedestal's side
      const seam = new THREE.Mesh(own(new THREE.CylinderGeometry(2.62, 2.62, 0.035, 6, 1, true)), own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.3), toneMapped: false })));
      seam.position.y = 0.04; seam.rotation.y = Math.PI / 6; g.add(seam);
      const pool = decal(9, col, 0.32, 0.015); pool.position.x = p.x; pool.position.z = p.z;
      const hot = decal(4.6, C('#ffffff'), 0.1, 0.158); hot.position.x = p.x; hot.position.z = p.z;
      return { g, edge, seam, pool, hot, col, k: 0 };
    });

    // ---------- lights ----------
    scene.add(own(new THREE.HemisphereLight('#9fb6c4', '#0a0c0e', 0.75)));
    const key = new THREE.DirectionalLight('#f3f6ff', 2.6); key.position.set(2, 10, 16); scene.add(key); keep.push(key);
    // the fighters are the only lit things (everything else is drawn with its light painted in), so
    // the light count stays as low as the old arena's: a fill, a key, and a rim in each side's colour
    const spots = POS.map((p, i) => {
      const rim = new THREE.DirectionalLight(cols[i].clone().lerp(new THREE.Color('#ffffff'), 0.3), 2.0); rim.position.set(p.x * 1.6, 6, -9); scene.add(rim); keep.push(rim);
      return { s: rim, rim, base: rim.intensity };
    });

    // ---------- stands and the crowd ----------
    // tiers on the far half of a circle behind the stage, a crowd of simple figures on them
    const tierMat = own(new THREE.MeshBasicMaterial({ color: '#080d10' }));
    const TIERS = lite ? 4 : 6, A0 = Math.PI * 1.06, A1 = Math.PI * 1.94;
    const tierGeo = own(new THREE.BoxGeometry(1, 1, 1));
    const segs = 28, tierN = TIERS * segs;
    const tiers = new THREE.InstancedMesh(tierGeo, tierMat, tierN);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V(), pos = new V(), up = new V(0, 1, 0);
    let n = 0;
    for (let r = 0; r < TIERS; r++) for (let s = 0; s < segs; s++) {
      const a = A0 + (s + 0.5) / segs * (A1 - A0), rad = 21 + r * 2.2;
      q.setFromAxisAngle(up, -a + Math.PI / 2);
      tiers.setMatrixAt(n++, m4.compose(pos.set(Math.cos(a) * rad, 0.4 + r * 1.1 - 0.5, Math.sin(a) * rad), q, sc.set(rad * (A1 - A0) / segs + 0.05, 1.1 + r * 0 + 0.8, 2.2)));
    }
    root.add(tiers); keep.push(tiers);
    const washes = [];
    // a soft wash of each side's colour behind the top of the stands: the crowd reads as silhouettes against it
    for (const i of [0, 1]) {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(40, 14)), own(new THREE.MeshBasicMaterial({ map: glow, color: cols[i].clone().multiplyScalar(0.15), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
      m.position.set((i ? 1 : -1) * 18, 7.5, -36); m.renderOrder = -1; root.add(m); washes.push(m);
    }
    // a thin strip of light along the front edge of each tier, in the colour of the side it faces
    for (let r = 0; r < TIERS; r++) {
      const rad = 21 + r * 2.2 - 1.12;
      const g = own(new THREE.CylinderGeometry(rad, rad, 0.06, 64, 1, true, Math.PI / 2 - A1 + Math.PI * 0, A1 - A0));
      // three's cylinder angle runs from +z toward +x; turn it so the arc covers the stands behind the stage
      g.rotateY(0); sideColors(g, 0.55 - r * 0.05);
      const m = new THREE.Mesh(g, own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.8, side: THREE.BackSide })));
      m.position.y = 0.4 + r * 1.1 + 0.42; root.add(m);
    }
    // the crowd: a body and a head per person, bobbing in the vertex shader, lit only by a rim
    const PEOPLE = lite ? 220 : 400;
    // one shape per person (a body and a head merged), so the whole crowd is a single draw call
    const personGeo = (() => {
      const a = new THREE.CapsuleGeometry(0.27, 0.55, 2, 5).translate(0, 0.55, 0), b = new THREE.SphereGeometry(0.2, 6, 4).translate(0, 1.22, 0);
      const g = new THREE.BufferGeometry(), n = a.attributes.position.count;
      for (const k of ['position', 'normal']) g.setAttribute(k, new THREE.Float32BufferAttribute([...a.attributes[k].array, ...b.attributes[k].array], 3));
      g.setIndex([...a.index.array, ...Array.from(b.index.array, i => i + n)]);
      a.dispose(); b.dispose(); return own(g);
    })();
    const crowdT = { value: 0 }, crowdHype = { value: new THREE.Vector2(0, 0) };
    const crowdMat = () => {
      const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      m.onBeforeCompile = sh => {
        sh.uniforms.uT = crowdT; sh.uniforms.uHype = crowdHype;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform vec2 uHype;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float id = float(gl_InstanceID);
            float side = instanceMatrix[3].x < 0.0 ? uHype.x : uHype.y;
            float ph = fract(sin(id * 12.9898) * 43758.5453) * 6.283;
            float bob = sin(uT * (2.0 + side * 6.0) + ph) * (0.04 + side * 0.26);
            transformed.y += max(bob, -0.02) + side * 0.12;
            transformed.x += sin(uT * 0.7 + ph) * 0.03;`);
      };
      return own(m);
    };
    const bodies = new THREE.InstancedMesh(personGeo, crowdMat(), PEOPLE);
    const stickPos = new Float32Array(PEOPLE * 3), stickCol = new Float32Array(PEOPLE * 3), stickPh = new Float32Array(PEOPLE);
    const tmpC = new THREE.Color();
    for (let i = 0; i < PEOPLE; i++) {
      const r = Math.floor(rnd(0, TIERS)), a = A0 + rnd(0.01, 0.99) * (A1 - A0), rad = 21 + r * 2.2 + rnd(-0.5, 0.4);
      const y = 0.4 + r * 1.1 + 0.85 - 0.5;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      q.setFromAxisAngle(up, Math.atan2(-x, -z));
      const s = rnd(0.85, 1.12);
      m4.compose(pos.set(x, y, z), q, sc.set(s, s * rnd(0.9, 1.1), s));
      bodies.setMatrixAt(i, m4);
      const side = x < 0 ? 0 : 1;
      tmpC.setHSL(rnd(0.5, 0.65), rnd(0.1, 0.3), rnd(0.01, 0.022)); bodies.setColorAt(i, tmpC);
      // light sticks and phones, in the colour of the side they sit on (some white)
      stickPos[i * 3] = x + rnd(-0.25, 0.25); stickPos[i * 3 + 1] = y + 1.55 + rnd(0, 0.35); stickPos[i * 3 + 2] = z;
      const sc2 = rnd() < 0.22 ? new THREE.Color('#dfe9ff') : cols[side];
      stickCol[i * 3] = sc2.r; stickCol[i * 3 + 1] = sc2.g; stickCol[i * 3 + 2] = sc2.b;
      stickPh[i] = rnd(0, 100);
    }
    bodies.instanceColor.needsUpdate = true;
    bodies.frustumCulled = false;
    root.add(bodies); keep.push(bodies);
    const stickGeo = own(new THREE.BufferGeometry());
    stickGeo.setAttribute('position', new THREE.BufferAttribute(stickPos, 3));
    stickGeo.setAttribute('color', new THREE.BufferAttribute(stickCol, 3));
    stickGeo.setAttribute('ph', new THREE.BufferAttribute(stickPh, 1));
    const stickMat = own(new THREE.ShaderMaterial({
      uniforms: { uT: crowdT, uHype: crowdHype, uPx: { value: 1 } },
      vertexShader: `attribute float ph; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uT; uniform vec2 uHype; uniform float uPx;
        void main(){ float side = position.x < 0.0 ? uHype.x : uHype.y;
          vec3 p = position; p.y += sin(uT * (2.0 + side * 6.0) + ph) * (0.06 + side * 0.3) + side * 0.15; p.x += sin(uT * 1.3 + ph) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.45 + 0.55 * step(0.25, fract(ph * 0.37 + uT * 0.05)) * (0.6 + 0.4 * sin(uT * 3.0 + ph)) + side;
          vC = color; gl_PointSize = min(uPx * (9.0 + side * 6.0) * 10.0 / -mv.z, uPx * 7.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * (1.4 + vA), a * min(1.0, vA)); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const sticks = new THREE.Points(stickGeo, stickMat); sticks.frustumCulled = false; root.add(sticks);

    // ---------- screens: a jumbotron in the middle, a tall banner over each fighter's stand ----------
    const led = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const t = own(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; return { cv, t, c: cv.getContext('2d') }; };
    const grid = (L, cell = 4) => { const c = L.c; c.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = 0; x < L.cv.width; x += cell) c.fillRect(x, 0, 1, L.cv.height); for (let y = 0; y < L.cv.height; y += cell) c.fillRect(0, y, L.cv.width, 1); };
    const frameMat = own(new THREE.MeshBasicMaterial({ color: '#0b1013' }));
    const J = led(1024, 432);
    const jumbo = new THREE.Group(); jumbo.position.set(0, 8.7, -31); root.add(jumbo);
    const jScreen = new THREE.Mesh(own(new THREE.PlaneGeometry(17, 7.2)), own(new THREE.MeshBasicMaterial({ map: J.t, toneMapped: false, color: C('#ffffff', 0.6), fog: false })));
    jumbo.add(jScreen);
    const jFrame = new THREE.Mesh(own(new THREE.BoxGeometry(17.8, 8, 0.6)), frameMat); jFrame.position.z = -0.34; jumbo.add(jFrame);
    for (const sx of [-1, 1]) { const strut = new THREE.Mesh(own(new THREE.BoxGeometry(0.4, 11, 0.4)), frameMat); strut.position.set(sx * 6, -8.5, -0.6); jumbo.add(strut); }
    const banners = [0, 1].map(i => {
      const L = led(256, 640);
      const b = new THREE.Group(); b.position.set((i ? 1 : -1) * 21, 9.5, -19); b.rotation.y = (i ? -1 : 1) * 0.62; root.add(b);
      const scr = new THREE.Mesh(own(new THREE.PlaneGeometry(4.2, 10.5)), own(new THREE.MeshBasicMaterial({ map: L.t, toneMapped: false, color: C('#ffffff', 0.9), fog: false })));
      b.add(scr);
      const fr = new THREE.Mesh(own(new THREE.BoxGeometry(4.6, 10.9, 0.4)), frameMat); fr.position.z = -0.24; b.add(fr);
      return { L, b, scr };
    });
    const names = o.names || ['', ''];
    function drawBanner(i, flash = 0) {
      const L = banners[i].L, c = L.c, W = 256, H = 640, col = cols[i];
      const rgb = `${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0}`;
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(${rgb},${0.35 + flash * 0.5})`); g.addColorStop(0.5, '#05090b'); g.addColorStop(1, `rgba(${rgb},${0.25 + flash * 0.4})`);
      c.fillStyle = '#05090b'; c.fillRect(0, 0, W, H); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); c.rotate(-Math.PI / 2);
      c.fillStyle = `rgb(${rgb})`; c.font = '700 92px "JetBrains Mono", ui-monospace, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const nm = String(names[i] || '').toUpperCase().slice(0, 12);
      c.shadowColor = `rgb(${rgb})`; c.shadowBlur = 18; c.fillText(nm, 0, -6, H - 60); c.shadowBlur = 0;
      c.restore();
      c.fillStyle = `rgba(${rgb},0.9)`; for (let k = 0; k < 6; k++) c.fillRect(W / 2 - 60 + k * 22, 26, 14, 14);
      grid(L); L.t.needsUpdate = true;
    }
    let boardKey = '';
    function board(b = {}) {
      const k = JSON.stringify(b); if (k === boardKey) return; boardKey = k;
      const c = J.c, W = 1024, H = 432;
      const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#06120d'); bg.addColorStop(0.5, '#05080b'); bg.addColorStop(1, '#140c04');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      // the two sides' colour bars
      const rgb = i => `${cols[i].r * 255 | 0},${cols[i].g * 255 | 0},${cols[i].b * 255 | 0}`;
      c.fillStyle = `rgba(${rgb(0)},0.9)`; c.fillRect(0, 0, W * 0.47, 10); c.fillRect(0, H - 10, W * 0.47, 10);
      c.fillStyle = `rgba(${rgb(1)},0.9)`; c.fillRect(W * 0.53, 0, W * 0.47, 10); c.fillRect(W * 0.53, H - 10, W * 0.47, 10);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '600 40px "JetBrains Mono", ui-monospace, monospace';
      c.fillStyle = `rgb(${rgb(0)})`; c.fillText(String(names[0] || '').slice(0, 14), W * 0.25, 62, W * 0.42);
      c.fillStyle = `rgb(${rgb(1)})`; c.fillText(String(names[1] || '').slice(0, 14), W * 0.75, 62, W * 0.42);
      c.fillStyle = 'rgba(230,240,240,0.5)'; c.font = '600 30px "JetBrains Mono", ui-monospace, monospace'; c.fillText('VS', W / 2, 62);
      const hot = b.hot != null ? b.hot : -1;
      c.font = `700 ${b.big || 150}px "JetBrains Mono", ui-monospace, monospace`;
      c.fillStyle = hot >= 0 ? `rgb(${rgb(hot)})` : '#e8f2f0';
      c.shadowColor = c.fillStyle; c.shadowBlur = 30; c.fillText(b.text || '', W / 2, 230, W - 80); c.shadowBlur = 0;
      if (b.sub) { c.font = '600 34px "JetBrains Mono", ui-monospace, monospace'; c.fillStyle = 'rgba(230,240,240,0.75)'; c.fillText(b.sub, W / 2, 352, W - 80); }
      grid(J, 4); J.t.needsUpdate = true;
    }
    drawBanner(0); drawBanner(1);
    board({ text: 'DUEL', sub: 'BEST OF 3' });

    // ---------- the truss, pylons and beams ----------
    const truss = new THREE.Mesh(own(new THREE.TorusGeometry(14, 0.22, 6, 48)), frameMat);
    truss.rotation.x = Math.PI / 2; truss.position.y = 16; root.add(truss);
    const truss2 = truss.clone(); truss2.position.y = 15.2; root.add(truss2);
    const pylonGeo = own(new THREE.BoxGeometry(0.9, 18, 0.9));
    const stripGeo = own(new THREE.PlaneGeometry(0.16, 16));
    const pylons = [];
    for (const f of [0, 0.14, 0.28, 0.72, 0.86, 1]) {
      const a = Math.PI * (1.1 + 0.8 * f), r = 16.5, k = f * 7;
      const p = new THREE.Mesh(pylonGeo, frameMat); p.position.set(Math.cos(a) * r, 8.4, Math.sin(a) * r); root.add(p);
      const side = Math.cos(a) < 0 ? 0 : 1;
      const s = new THREE.Mesh(stripGeo, own(new THREE.MeshBasicMaterial({ color: cols[side].clone().multiplyScalar(1.3), toneMapped: false, transparent: true, opacity: 0.9 })));
      s.position.copy(p.position).add(new V(-Math.cos(a) * 0.46, 0, -Math.sin(a) * 0.46)); s.lookAt(0, s.position.y, 0); root.add(s);
      pylons.push({ s, side, ph: k });
    }
    // light beams: open cones that fade along their length and toward their edges as seen from the
    // camera, so they read as light in haze rather than as solid wedges
    const coneGeo = own(new THREE.CylinderGeometry(0.18, 1.7, 15, 24, 1, true)); coneGeo.translate(0, -7.5, 0);
    const beams = [];
    const BEAMS = lite ? 4 : 6;
    for (let k = 0; k < BEAMS; k++) {
      const side = k % 2, col = k % 4 === 3 ? C('#dfe9ff') : cols[side];
      const mat = own(new THREE.ShaderMaterial({
        uniforms: { uCol: { value: col.clone() }, uOp: { value: 0.12 } },
        vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = -position.y / 15.0; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'uniform vec3 uCol; uniform float uOp; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float a = edge * (1.0 - vH) * (1.0 - vH) * smoothstep(0.0, 0.06, vH) * uOp; gl_FragColor = vec4(uCol * a, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      const m = new THREE.Mesh(coneGeo, mat);
      const a = (k / BEAMS) * Math.PI * 2;
      m.position.set(Math.cos(a) * 13.5, 15.6, Math.sin(a) * 13.5 - 2);
      m.renderOrder = 2; root.add(m);
      beams.push({ m, a, ph: k * 1.7, side, base: 0.12 });
    }

    // dust in the light, and low haze over the floor
    const DN = lite ? 120 : 280;
    const dpos = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) { dpos[i * 3] = rnd(-16, 16); dpos[i * 3 + 1] = rnd(0.3, 14); dpos[i * 3 + 2] = rnd(-12, 8); }
    const dGeo = own(new THREE.BufferGeometry()); dGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    const dust = new THREE.Points(dGeo, own(new THREE.PointsMaterial({ map: glow, color: C('#cfe3e8', 0.9), size: 0.12, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
    dust.frustumCulled = false; root.add(dust);
    const haze = [];
    for (let k = 0; k < (lite ? 2 : 3); k++) {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(18, 6)), own(new THREE.MeshBasicMaterial({ map: glow, color: C('#6f8f99', 0.35), transparent: true, opacity: 0.22, depthWrite: false, fog: false })));
      m.position.set(rnd(-14, 14), 1.4, rnd(-14, -4)); m.renderOrder = 0; root.add(m);
      haze.push({ m, ph: rnd(0, 9), x: m.position.x });
    }

    // ---------- per frame ----------
    let hypeT = [0, 0];
    function hype(side, k = 1) {
      for (const i of side < 0 ? [0, 1] : [side]) { hypeT[i] = Math.min(1.4, hypeT[i] + k); pads[i].k = Math.max(pads[i].k, k); }
      if (side >= 0) drawBanner(side, Math.min(1, k));
    }
    let bannerFade = [0, 0];
    function update(t, dt, cam) {
      crowdT.value = t;
      for (let i = 0; i < 2; i++) {
        hypeT[i] = Math.max(0, hypeT[i] - dt * 0.7);
        const h = Math.min(1, hypeT[i]);
        crowdHype.value.setComponent(i, h * h);
        const P = pads[i]; P.k = Math.max(0, P.k - dt * 2);
        P.pool.material.opacity = 0.3 + P.k * 0.4 + Math.sin(t * 2 + i) * 0.03;
        P.edge.material.color.copy(P.col).multiplyScalar(1.4 + P.k * 2.2);
        spots[i].s.intensity = spots[i].base * (1 + P.k * 0.8);
        if (bannerFade[i] !== (h > 0.05 ? 1 : 0)) { bannerFade[i] = h > 0.05 ? 1 : 0; if (!bannerFade[i]) drawBanner(i, 0); }
      }
      for (const b of beams) {
        const sw = Math.sin(t * 0.33 + b.ph);
        b.m.rotation.set(0.35 + Math.sin(t * 0.21 + b.ph) * 0.18, 0, 0);
        b.m.rotation.order = 'YXZ'; b.m.rotation.y = b.a + Math.PI / 2 + sw * 0.5;
        b.m.material.uniforms.uOp.value = b.base * (0.8 + 0.2 * Math.sin(t * 1.1 + b.ph)) + hypeT[b.side] * 0.14;
      }
      for (const p of pylons) p.s.material.opacity = 0.65 + 0.35 * Math.sin(t * 1.6 + p.ph) * (hypeT[p.side] > 0.1 ? Math.sin(t * 22) : 1);
      const dp = dGeo.attributes.position.array;
      for (let i = 0; i < DN; i++) { dp[i * 3 + 1] += dt * 0.15; if (dp[i * 3 + 1] > 14) dp[i * 3 + 1] = 0.3; dp[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.05; }
      dGeo.attributes.position.needsUpdate = true;
      for (const h of haze) { h.m.position.x = h.x + Math.sin(t * 0.07 + h.ph) * 3; if (cam) h.m.quaternion.copy(cam.quaternion); }
      if (cam) stickMat.uniforms.uPx.value = (o.pixelHeight ? o.pixelHeight() : 600) / 600;
    }
    function pad(i, out) { return out.copy(POS[i]).setY(PAD_TOP); }
    // 2 is everything; 1 drops the beams and the haze; 0 drops the crowd's lights and the dust too
    let level = 2;
    function quality(l) {
      level = Math.max(0, Math.min(2, l));
      beams.forEach(b => { b.m.visible = level >= 2; }); haze.forEach(h => { h.m.visible = level >= 2; });
      sticks.visible = level >= 1; dust.visible = level >= 1;
    }
    function dispose() { scene.remove(root); keep.forEach(x => { try { x.dispose(); } catch (e) {} }); }
    return { update, board, hype, pad, quality, level: () => level, dispose, root, spots, STAGE_R, PAD_TOP, PAD_R, textures: [floorTex, gTex, glow, J.t, ...banners.map(b => b.L.t)] };
  }
  return { build };
})();
