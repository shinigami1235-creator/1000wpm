// Combat effects in three.js: the basic attack for each combo tier and one effect
// per spell. A mode with a three.js scene creates one and calls update every frame.
//
//   const fx = Combat.FX.create(THREE, scene, camera, {
//     glowTex,                 optional soft round texture for flares
//     pixelHeight: () => px,   the canvas height in pixels, for particle sizes
//     calm, reduce,            fewer flashes, less movement
//     juice: { shake(k), stop(ms), glitch(k, secs), dim(k, secs), tint(hex, k), wave(worldPos, k), canFlash() },
//   });
//   fx.shot(tier, from, to(out), onLand, { color })        a basic attack; to() is read every frame so it follows a moving target
//   fx.cast(spellId, { caster, target, hits, effect })      hits come from engine.cast() so the effect lands with the damage
//   fx.aura(name, on, { caster, target })                    'ward' | 'hyper' | 'split' | 'root' while a status lasts
//   fx.event('ward' | 'guard', { caster })                   safe mode used up, a quantum split copy lost
//   fx.charge(at, level, tier)                               the charge orb: words feed it, level 0..1; level 0 hides it
//   fx.feed(from, at)                                        a typed word's spark flying into the orb
//   fx.release(tier, power, from, to(out), onLand)           the orb winds up and fires one attack sized by power 0..1
//   fx.update(dt)  fx.clear()  fx.dispose()  fx.info()
//
// caster and target are small adapters, so the same effect can hit a boss or another player:
//   caster: { pos(out) }   where the spell starts
//   target: { pos(out) centre, top(out) highest point, base(out) floor under it, size (about 6 for the world boss, 1 for a player),
//             react(kind, power, extra) }   kinds: flinch, stagger, break, stun, freeze, pull, flash
// Everything is pooled: one instanced mesh of glowing boxes for lines and shapes, one
// point cloud for particles and glyphs, 24 flares and three shells.
window.Combat = window.Combat || {};
Combat.FX = (() => {
  function create(THREE, scene, camera, o = {}) {
    const V = THREE.Vector3;
    const J = o.juice || {};
    const calm = !!o.calm, reduce = !!o.reduce;
    const juice = (k, ...a) => { try { if (J[k]) J[k](...a); } catch (e) {} };
    const canFlash = () => (J.canFlash ? J.canFlash() : true);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    const easeIn = x => Math.pow(clamp(x, 0, 1), 2);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const keep = [];
    const own = x => (keep.push(x), x);
    const root = new THREE.Group();
    scene.add(root);

    const WHITE = C('#ffffff'), GREEN = C(Theme.hex('accent')), CYAN = C('#3ee6ff');

    // ---------- lines and shapes: instanced glowing boxes, rebuilt every frame ----------
    const SEG = 1600;
    const segMat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const segs = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), segMat, SEG);
    segs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    segs.setColorAt(0, new THREE.Color());
    segs.frustumCulled = false; segs.count = 0; segs.renderOrder = 5;
    root.add(segs);
    let nSeg = 0;
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new V(), _s = new V(), _d = new V(), _c = new THREE.Color(), Z = new V(0, 0, 1), UP = new V(0, 1, 0);
    function seg(a, b, w, col, k = 1, h = w) {
      if (nSeg >= SEG || k <= 0.003) return;
      _d.subVectors(b, a);
      const len = _d.length();
      if (len < 1e-4) return;
      _q.setFromUnitVectors(Z, _d.divideScalar(len));
      _p.addVectors(a, b).multiplyScalar(0.5);
      _s.set(w, h, len);
      _m.compose(_p, _q, _s);
      segs.setMatrixAt(nSeg, _m);
      _c.copy(col).multiplyScalar(k);
      segs.setColorAt(nSeg, _c);
      nSeg++;
    }
    // a flat panel facing `facing` (a point it looks at)
    const _o = new THREE.Object3D();
    function panel(at, facing, w, h, col, k = 1) {
      if (nSeg >= SEG || k <= 0.003) return;
      _o.position.copy(at); _o.lookAt(facing); _o.scale.set(w, h, 0.05); _o.updateMatrix();
      segs.setMatrixAt(nSeg, _o.matrix);
      _c.copy(col).multiplyScalar(k);
      segs.setColorAt(nSeg, _c);
      nSeg++;
    }
    function line(pts, w, col, k = 1, taper = 0) {
      for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], w * (1 - taper * i / pts.length), col, k);
    }
    // a ring of n segments around `c` in the plane with normal `nrm`
    const _u = new V(), _v = new V(), _a = new V(), _b = new V();
    function circle(c, nrm, r, w, col, k = 1, n = 28, rot = 0, arc = 1) {
      _u.copy(Math.abs(nrm.y) > 0.9 ? Z : UP).cross(nrm).normalize();
      _v.copy(nrm).cross(_u).normalize();
      const steps = Math.max(3, Math.round(n * arc));
      for (let i = 0; i < steps; i++) {
        const t0 = rot + (i / n) * Math.PI * 2, t1 = rot + ((i + 1) / n) * Math.PI * 2;
        _a.copy(c).addScaledVector(_u, Math.cos(t0) * r).addScaledVector(_v, Math.sin(t0) * r);
        _b.copy(c).addScaledVector(_u, Math.cos(t1) * r).addScaledVector(_v, Math.sin(t1) * r);
        seg(_a, _b, w, col, k);
      }
    }
    // jagged points from a to b, the way lightning bends: big swings in the middle, small at the ends
    function jag(a, b, n, sway, out) {
      _d.subVectors(b, a);
      const len = _d.length();
      _u.copy(Math.abs(_d.y / len) > 0.9 ? Z : UP).cross(_d).normalize();
      _v.copy(_d).cross(_u).normalize();
      for (let i = 0; i <= n; i++) {
        const t = i / n, s = Math.sin(t * Math.PI) * sway * len * (i && i < n ? 1 : 0);
        (out[i] ||= new V()).copy(a).addScaledVector(_d, t).addScaledVector(_u, rnd(-1, 1) * s).addScaledVector(_v, rnd(-1, 1) * s * 0.6);
      }
      out.length = n + 1;
      return out;
    }

    // ---------- particles and glyphs ----------
    const atlas = document.createElement('canvas'); atlas.width = 256; atlas.height = 128;
    {
      const g = atlas.getContext('2d');
      const cell = (i, draw) => { g.save(); g.translate((i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 32); draw(); g.restore(); };
      cell(0, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
      const glyph = ch => () => { g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8; g.font = 'bold 46px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 0, 3); };
      cell(1, glyph('0')); cell(2, glyph('1'));
      cell(3, () => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.shadowColor = '#fff'; g.shadowBlur = 6; g.strokeRect(-17, -17, 34, 34); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-11, -11, 22, 22); });
      cell(4, glyph('#')); cell(5, glyph('{'));
      cell(6, () => { g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 5 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
      cell(7, () => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.shadowColor = '#fff'; g.shadowBlur = 6; g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3; g.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); } g.stroke(); });
    }
    const G = { dot: 0, zero: 1, one: 2, box: 3, hash: 4, brace: 5, star: 6, hex: 7 };
    const atlasTex = own(new THREE.CanvasTexture(atlas));
    const PN = 2600;
    const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pGly = new Float32Array(PN);
    const pVel = new Float32Array(PN * 3), pBase = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
    const pDrag = new Float32Array(PN), pGrav = new Float32Array(PN), pS0 = new Float32Array(PN), pGrow = new Float32Array(PN), pPull = new Int16Array(PN).fill(-1);
    for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -1000;
    const pGeo = own(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aCol', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aGlyph', new THREE.BufferAttribute(pGly, 1).setUsage(THREE.DynamicDrawUsage));
    const pMat = own(new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlasTex }, uScale: { value: 600 } },
      vertexShader: `attribute vec3 aCol; attribute float aSize; attribute float aGlyph; uniform float uScale; varying vec3 vC; varying float vG;
        void main(){ vC = aCol; vG = aGlyph; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uAtlas; varying vec3 vC; varying float vG;
        void main(){ vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y); float cx = mod(vG, 4.0), cy = floor(vG / 4.0);
          vec4 t = texture2D(uAtlas, vec2((uv.x + cx) / 4.0, (uv.y + 1.0 - cy) / 2.0)); if (t.a < 0.02) discard; gl_FragColor = vec4(vC * t.a, t.a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false; points.renderOrder = 6;
    root.add(points);
    let pI = 0, pAlive = 0;
    const pulls = [];             // attractors: { at: V, k, swirl }
    function spawn(at, vel, col, size, life, glyph = 0, o2 = {}) {
      const i = pI = (pI + 1) % PN;
      pPos[i * 3] = at.x; pPos[i * 3 + 1] = at.y; pPos[i * 3 + 2] = at.z;
      pVel[i * 3] = vel.x; pVel[i * 3 + 1] = vel.y; pVel[i * 3 + 2] = vel.z;
      pBase[i * 3] = col.r; pBase[i * 3 + 1] = col.g; pBase[i * 3 + 2] = col.b;
      pS0[i] = size; pSize[i] = size; pGly[i] = glyph; pLife[i] = life; pMax[i] = life;
      pDrag[i] = o2.drag || 0; pGrav[i] = o2.grav || 0; pGrow[i] = o2.grow || 0; pPull[i] = o2.pull === undefined ? -1 : o2.pull;
      return i;
    }
    const _pv = new V();
    function burst(at, n, speed, col, size = 0.35, life = 0.7, glyph = 0, o2 = {}) {
      for (let k = 0; k < n; k++) {
        _pv.set(rnd(-1, 1), rnd(-1, 1) * (o2.flat ? 0.3 : 1) + (o2.up || 0), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.3, 1));
        spawn(at, _pv, col, size * rnd(0.6, 1.3), life * rnd(0.6, 1.2), glyph, o2);
      }
    }

    // ---------- flares ----------
    let glowTex = o.glowTex;
    if (!glowTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      glowTex = own(new THREE.CanvasTexture(cv));
    }
    const flares = Array.from({ length: 24 }, () => {
      const m = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false })));
      m.visible = false; m.renderOrder = 7; root.add(m);
      return { m, t: 0, life: 0.3, size: 1, grow: 0.6 };
    });
    let flI = 0;
    function flare(at, col, size, life = 0.25, k = 1, grow = 0.6) {
      const f = flares[flI = (flI + 1) % flares.length];
      f.m.position.copy(at); f.m.material.color.copy(col).multiplyScalar(k);
      f.size = size; f.life = life; f.t = 0; f.grow = grow; f.m.visible = true;
      return f;
    }
    function bigFlash(at, col, size, k = 1) { if (canFlash()) flare(at, col, size * (calm ? 0.6 : 1), 0.3, calm ? k * 0.6 : k); else flare(at, col, size * 0.5, 0.25, 0.5); }

    // ---------- shells: fresnel spheres for the nova, the safe mode dome and the black hole's rim ----------
    const shells = Array.from({ length: 3 }, () => {
      const mat = own(new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color() }, uAmt: { value: 0 }, uHex: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uAmt; uniform float uHex; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
            float hex = uHex * smoothstep(0.86, 1.0, max(abs(sin(vP.x * 9.0 + vP.y * 5.0)), abs(sin(vP.y * 10.0 - vP.z * 4.0 + uTime))));
            float a = (f * 0.9 + 0.08 + hex * 0.5) * uAmt; gl_FragColor = vec4(uCol * a, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      const m = new THREE.Mesh(own(new THREE.SphereGeometry(1, 36, 22)), mat);
      m.visible = false; m.renderOrder = 4; root.add(m);
      return { m, busy: false };
    });
    function shell() { const s = shells.find(x => !x.busy) || shells[0]; s.busy = true; s.m.visible = true; return s; }
    function freeShell(s) { s.busy = false; s.m.visible = false; s.m.material.uniforms.uAmt.value = 0; }

    // ---------- the black hole: a black core and a spinning disk ----------
    const voidCore = new THREE.Mesh(own(new THREE.SphereGeometry(1, 32, 20)), own(new THREE.MeshBasicMaterial({ color: '#000000', fog: false })));
    voidCore.visible = false; voidCore.renderOrder = 3; root.add(voidCore);
    const diskMat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform float uAmt; varying vec2 vUv;
        void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0; float a = atan(q.y, q.x);
          float band = smoothstep(0.42, 0.55, r) * (1.0 - smoothstep(0.75, 1.0, r));
          float swirl = 0.55 + 0.45 * sin(a * 5.0 - uTime * 7.0 + r * 14.0);
          vec3 col = mix(vec3(1.0, 0.85, 1.0), vec3(0.72, 0.42, 1.0), smoothstep(0.5, 0.9, r));
          float k = band * swirl * uAmt; gl_FragColor = vec4(col * k * 1.6, k); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const disk = new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)), diskMat);
    disk.visible = false; disk.renderOrder = 4; root.add(disk);

    // ---------- running effects ----------
    const live = [];
    const auras = {};
    let clock = 0;
    const tmp = Array.from({ length: 12 }, () => new V());
    const [t0, t1, t2, t3, t4, t5, t6, t7] = tmp;
    const P = (adapter, fn, out) => (adapter && adapter[fn] ? adapter[fn](out) : out.set(0, 0, 0));
    const react = (target, kind, power, extra) => { if (target && target.react) try { target.react(kind, power, extra); } catch (e) {} };
    function add(e) { e.t = 0; e.k = 0; live.push(e); return e; }
    // runs e.strike(i) when each hit's time arrives
    function strikes(e) {
      const hits = e.hits || [];
      while (e.k < hits.length && e.t * 1000 >= hits[e.k].at) { e.strike(e.k, hits[e.k]); e.k++; }
    }
    const sizeOf = tg => (tg && tg.size) || 6;

    // ---------- basic attacks by combo tier ----------
    // ZERO LIMIT (tier 5) lands with a distortion wave across the screen (juice.wave)
    const zeroLand = (tier, onLand, k) => (tier >= 5 ? at => { juice('wave', at, k); if (onLand) onLand(at); } : onLand);
    function shot(tier, from, to, onLand, opt = {}) {
      onLand = zeroLand(tier, onLand, 0.7);
      const col = opt.color ? C(opt.color) : tier >= 1 && TIER_COL[Math.min(tier, TOP)] !== GREEN ? TIER_COL[Math.min(tier, TOP)] : null;
      const e = add({ from: from.clone(), to, onLand, tier: Math.min(tier, 4), landed: false, col, side: Math.random() < 0.5 ? -1 : 1 });
      const dur = tier >= 3 ? 0.05 : tier === 2 ? 0.17 : 0.15;
      const life = tier >= 3 ? 0.3 : dur + 0.14;
      if (tier === 1) flare(from, col || GREEN, 2.2, 0.12, 1.2);
      if (tier === 2) { flare(t0.copy(from).add(t1.set(-1, 0.5, 0)), col || GREEN, 2, 0.12); flare(t0.copy(from).add(t1.set(1, 0.5, 0)), col || CYAN, 2, 0.12); }
      e.update = dt => {
        const u = e.t / dur;
        to(t0);
        if (!e.landed && u >= 1) {
          e.landed = true;
          const c = col || (tier >= 3 ? WHITE : GREEN);
          burst(t0, 10 + tier * 10, 8 + tier * 2, c, 0.3 + tier * 0.06, 0.5, tier >= 3 ? G.star : G.dot, { drag: 2 });
          flare(t0, c, 2.5 + tier * 1.6, 0.2, 1.1);
          if (tier >= 3) { juice('shake', tier >= 4 ? 0.5 : 0.3); juice('stop', tier >= 4 ? 60 : 40); }
          if (tier >= 4) burst(t0, 30, 16, col || GREEN, 0.5, 0.8, G.dot, { drag: 1.5 });
          if (onLand) onLand(t0.clone());
        }
        const ku = clamp(1 - (e.t - dur) / (life - dur), 0, 1);
        if (tier === 1) {
          // one thick bolt on a low arc, so it reads even though it flies away from the camera
          t3.copy(e.from); t5.lerpVectors(t3, t0, 0.5).add(t4.set(e.side * 1.6, 3.2, 0));
          const hd = clamp(ease(u), 0, 1), tl = clamp(ease(u - 0.4), 0, 1);
          if (u < 1) {
            for (let i = 0; i <= 8; i++) {
              const s2 = tl + (hd - tl) * i / 8;
              t7.set(0, 0, 0).addScaledVector(t3, (1 - s2) * (1 - s2)).addScaledVector(t5, 2 * s2 * (1 - s2)).addScaledVector(t0, s2 * s2);
              if (i) { seg(t6, t7, 1.0, col || GREEN, 0.55); seg(t6, t7, 0.32, WHITE, 1.5); }
              t6.copy(t7);
            }
            spawn(t6, _pv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), col || GREEN, 0.5, 0.35, G.dot, { drag: 3 });
          } else circle(t0, t3.subVectors(e.from, t0).normalize(), 1 + (1 - ku) * 2.4, 0.12, col || GREEN, 1.2 * ku, 20);
        } else if (tier === 2) {
          // two beams that curve in from either side and meet on the target
          for (const side of [-1, 1]) {
            t3.copy(e.from).add(t4.set(side * 1.1, 0.5, 0));
            t5.lerpVectors(t3, t0, 0.5).add(t4.set(side * 2.4, 1.6, 0));
            const n = 8, hd = clamp(ease(u), 0, 1), tl = clamp(ease(u - 0.35), 0, 1);
            let has = false;
            for (let i = 0; i <= n; i++) {
              const s = tl + (hd - tl) * i / n;
              t7.set(0, 0, 0).addScaledVector(t3, (1 - s) * (1 - s)).addScaledVector(t5, 2 * s * (1 - s)).addScaledVector(t0, s * s);
              if (has) { seg(t6, t7, 0.8, col || (side < 0 ? GREEN : CYAN), 0.5 * ku); seg(t6, t7, 0.26, WHITE, 1.4 * ku); }
              t6.copy(t7); has = true;
            }
          }
          if (u >= 1) circle(t0, t3.subVectors(e.from, t0).normalize(), 1.2 + (1 - ku) * 3, 0.1, col || CYAN, ku, 24);
        } else {
          // rail shot: a straight beam that is there at once, rings along it, then fades
          const k = clamp(1 - e.t / life, 0, 1);
          const wide = tier >= 4 ? 2.2 : 1.5;
          seg(e.from, t0, wide, col || GREEN, 0.45 * k);
          seg(e.from, t0, wide * 0.28, WHITE, 1.6 * k);
          t3.subVectors(t0, e.from); const len = t3.length(); t3.divideScalar(len);
          const rings = tier >= 4 ? 7 : 5;
          for (let i = 1; i <= rings; i++) circle(t4.copy(e.from).addScaledVector(t3, len * i / (rings + 1)), t3, 0.9 + (1 - k) * (tier >= 4 ? 3 : 2), 0.12, col || GREEN, 1.2 * k, 16, i);
          if (tier >= 4) {
            // a spiral wrapped round the beam
            _u.copy(Math.abs(t3.y) > 0.9 ? Z : UP).cross(t3).normalize(); _v.copy(t3).cross(_u).normalize();
            for (let i = 0; i <= 36; i++) {
              const s = i / 36, a = s * Math.PI * 14 + e.t * 30;
              t7.copy(e.from).addScaledVector(t3, len * s).addScaledVector(_u, Math.cos(a) * 0.9).addScaledVector(_v, Math.sin(a) * 0.9);
              if (i) seg(t6, t7, 0.2, col || CYAN, 1.3 * k);
              t6.copy(t7);
            }
            if (tier >= 5) for (let i = 0; i <= 36; i++) {
              // ZERO LIMIT: a second, wider helix turning the other way
              const s = i / 36, a = -s * Math.PI * 10 - e.t * 36 + Math.PI;
              t7.copy(e.from).addScaledVector(t3, len * s).addScaledVector(_u, Math.cos(a) * 1.6).addScaledVector(_v, Math.sin(a) * 1.6);
              if (i) seg(t6, t7, 0.14, WHITE, 1.1 * k);
              t6.copy(t7);
            }
            if (e.t < 0.02) circle(t0, t3, tier >= 5 ? 6 : 4, 0.2, WHITE, 1, 28);
          }
        }
        return e.t < life;
      };
      return e;
    }

    // ---------- the charge orb and its release (Gid, 24 Nov 2026) ----------
    // Fast typing used to fire one small bolt per word. Words now feed an orb in front of
    // the player, and the orb winds up and fires one attack whose size follows how much
    // went in. The tier (the combo) sets the colours.
    // each combo level shoots in its own colour (Combat.TIERS)
    const TIER_COL = Combat.TIERS.map(x => (x.color ? C(x.color) : GREEN));
    const TOP = TIER_COL.length - 1;
    const coreSpr = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false })));
    coreSpr.visible = false; coreSpr.renderOrder = 8; root.add(coreSpr);
    const chg = { on: false, at: new V(), L: 0, show: 0, tier: 0, sh: null, spin: 0, wind: 0, pull: -1 };
    function charge(at, level, tier = 0) {
      chg.at.copy(at); chg.L = clamp(level, 0, 1); chg.tier = clamp(tier | 0, 0, TOP);
      if (chg.L > 0 && !chg.on) { chg.on = true; chg.show = 0; }
    }
    function feed(from, at) {
      const col = TIER_COL[chg.tier];
      if (chg.pull < 0) { chg.pull = pulls.length; pulls.push({ at: chg.at, k: 0, swirl: 0 }); }
      const a = pulls[chg.pull]; a.k = 60; a.swirl = 6;
      for (let k = 0; k < (reduce ? 4 : 10); k++) {
        _pv.set(rnd(-1, 1), rnd(0.2, 1.2), rnd(-0.6, 0.6)).multiplyScalar(4);
        spawn(t0.copy(from).add(t1.set(rnd(-0.6, 0.6), rnd(-0.2, 0.4), 0)), _pv, k % 3 ? col : WHITE, 0.32, 0.9, k % 2 ? G.one : G.zero, { pull: chg.pull });
      }
    }
    function drawCharge(dt) {
      const want = chg.on ? chg.L : 0;
      chg.show += (want - chg.show) * Math.min(1, dt * 10);
      if (chg.on && want <= 0 && chg.show < 0.02) chg.on = false;
      const L = chg.show;
      if (!chg.on && L < 0.02) {
        coreSpr.visible = false;
        if (chg.sh) { freeShell(chg.sh); chg.sh = null; }
        if (chg.pull >= 0 && pulls[chg.pull]) pulls[chg.pull].k = 0;
        return;
      }
      const col = TIER_COL[chg.tier];
      const w = chg.wind;                       // 0..1 while winding up: tighter and brighter
      chg.spin += dt * (2 + L * 4 + w * 14);
      const r = (0.35 + 1.05 * L) * (1 - 0.35 * w);
      const c = chg.at;
      if (!chg.sh) chg.sh = shell();
      const m = chg.sh.m;
      m.position.copy(c); m.scale.setScalar(r);
      m.material.uniforms.uCol.value.copy(col);
      m.material.uniforms.uAmt.value = 0.35 + 0.5 * L + w * 0.5;
      m.material.uniforms.uHex.value = 0.4 + 0.6 * L;
      coreSpr.visible = true; coreSpr.position.copy(c);
      coreSpr.scale.setScalar(r * (2.2 + w * 0.8) * (1 + 0.06 * Math.sin(clock * 31)));
      coreSpr.material.color.copy(col).lerp(WHITE, 0.2 + 0.35 * w).multiplyScalar(0.5 + 0.4 * L + 0.2 * w);
      coreSpr.material.opacity = 0.35 + 0.45 * L;
      // rings: one at the start, up to four when full, each on its own tilt
      const rings = 1 + Math.floor(L * 3.2);
      for (let i = 0; i < rings; i++) {
        const a = chg.spin * (i % 2 ? -1 : 1) + i * 1.3;
        t1.set(Math.sin(a) * 0.6, 1, Math.cos(a * 0.7) * 0.6).normalize();
        circle(c, t1, r * (1.3 + i * 0.2), 0.04 + 0.03 * L, i % 2 ? WHITE : col, 0.8 + w * 0.6, 26, a);
      }
      // winding up: streaks pulled in from all round the orb
      if (w > 0 && !reduce) {
        for (let i = 0; i < 12; i++) {
          const a = i * 0.5236 + chg.spin * 0.3;
          t2.set(Math.cos(a), Math.sin(a), 0.3 * Math.sin(a * 3)).normalize();
          const far = r * (4.2 - 2.6 * w), near = r * (1.6 - 0.4 * w);
          seg(t3.copy(c).addScaledVector(t2, far), t4.copy(c).addScaledVector(t2, near), 0.05, i % 2 ? WHITE : col, 0.6 + w);
        }
      }
      // crackle once it's half full: short arcs that jump off the surface every frame
      if (L > 0.45 && !reduce) {
        const n = Math.round(2 + (L - 0.45) * 8 + w * 4);
        for (let i = 0; i < n; i++) {
          t2.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
          t3.copy(c).addScaledVector(t2, r * 0.9); t4.copy(c).addScaledVector(t2, r * rnd(1.6, 2.4 + L));
          line(jag(t3, t4, 4, 0.25, tmpPts), 0.05, i % 2 ? WHITE : col, 1.2, 0.5);
        }
      }
      // motes drawn in from around the orb, more as it fills
      if (!reduce && Math.random() < L * 0.9) {
        if (chg.pull < 0) { chg.pull = pulls.length; pulls.push({ at: chg.at, k: 0, swirl: 0 }); }
        const pa = pulls[chg.pull]; pa.k = 40 + 60 * w; pa.swirl = 5;
        t2.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(r * rnd(3, 4.5));
        spawn(t3.copy(c).add(t2), _pv.set(0, 0, 0), col, 0.22, 1.2, G.dot, { pull: chg.pull });
      }
    }
    const tmpPts = [];
    function release(tier, power, from, to, onLand) {
      tier = clamp(tier | 0, 0, TOP); power = clamp(power, 0, 1);
      onLand = zeroLand(tier, onLand, 0.6 + 0.6 * power);
      const col = TIER_COL[tier], WIND = reduce ? 0.08 : 0.22, FLY = 0.12 + 0.06 * (1 - power);
      const e = add({ from: from.clone(), to, onLand, landed: false, fired: false, tier, power });
      e.update = dt => {
        to(t0);
        if (e.t < WIND) { chg.wind = e.t / WIND; return true; }
        if (!e.fired) {
          e.fired = true; chg.wind = 0; chg.L = 0; chg.show = 0; chg.on = false;
          flare(e.from, WHITE, 1.2 + 1.5 * power, 0.12, 1.1);
          if (!reduce) burst(e.from, 12 + Math.round(20 * power), 6, col, 0.3, 0.35, G.dot, { drag: 3 });
        }
        const u = clamp((e.t - WIND) / FLY, 0, 1);
        if (u < 1) {
          // the shot: a bright head with a thick tail, wider with more power
          t1.lerpVectors(e.from, t0, ease(u));
          t2.lerpVectors(e.from, t0, ease(Math.max(0, u - 0.35)));
          const wide = 0.35 + 1.3 * power;
          seg(t2, t1, wide * 2.2, col, 0.45);
          seg(t2, t1, wide * 0.7, WHITE, 1.6);
          if (tier >= 2) for (const sd of [-1, 1]) {
            t3.copy(t2).add(t4.set(sd * wide, 0.3, 0)); seg(t3, t1, wide * 0.3, sd < 0 ? GREEN : CYAN, 1.2);
          }
          if (tier >= 4) {
            t3.subVectors(t1, t2); const len = t3.length() || 1; t3.divideScalar(len);
            _u.copy(Math.abs(t3.y) > 0.9 ? Z : UP).cross(t3).normalize(); _v.copy(t3).cross(_u).normalize();
            for (let i = 0; i <= 18; i++) {
              const sP = i / 18, a = sP * Math.PI * 8 + e.t * 40;
              t7.copy(t2).addScaledVector(t3, len * sP).addScaledVector(_u, Math.cos(a) * wide * 1.4).addScaledVector(_v, Math.sin(a) * wide * 1.4);
              if (i) seg(t6, t7, 0.12, CYAN, 1.4);
              t6.copy(t7);
            }
          }
          flare(t1, col, 1.5 + 3 * power, 0.06, 1.3, 0.2);
          return true;
        }
        if (!e.landed) {
          e.landed = true; e.at = t0.clone(); e.lt = e.t;
          const P2 = power;
          bigFlash(e.at, WHITE, 8 + 14 * P2, 1.4);
          flare(e.at, col, 6 + 12 * P2, 0.45, 1.3);
          burst(e.at, 30 + Math.round(90 * P2), 10 + 10 * P2, col, 0.4 + 0.3 * P2, 0.8, tier >= 3 ? G.star : G.dot, { drag: 1.6 });
          burst(e.at, 10 + Math.round(30 * P2), 7 + 6 * P2, WHITE, 0.5, 0.9, P2 > 0.5 ? G.one : G.zero, { drag: 1.2, up: 0.4 });
          juice('shake', reduce ? 0 : 0.18 + 0.6 * P2);
          juice('stop', reduce ? 0 : Math.round(40 + 90 * P2));
          if (P2 > 0.6 && canFlash()) juice('tint', tier >= 4 ? 0x3ee6ff : Theme.num('accent'), 0.25);
          if (onLand) onLand(e.at.clone());
        }
        // shockwaves and spikes after the hit, facing the camera so they read as rings
        const k = e.t - e.lt, life = 0.45 + 0.25 * power;
        if (k > life) return false;
        const f = 1 - k / life;
        t3.subVectors(camera.position, e.at).normalize();
        for (let i = 0; i < 1 + Math.round(power * 2); i++) circle(e.at, t3, (0.6 + i * 0.5) + ease(k / life) * (2 + 5 * power), 0.12 * f + 0.04, i ? WHITE : col, 1.2 * f, 32, i);
        if (!reduce && k < 0.2) {
          const n = 6 + Math.round(10 * power);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + e.power * 7;
            _u.copy(Math.abs(t3.y) > 0.9 ? Z : UP).cross(t3).normalize(); _v.copy(t3).cross(_u).normalize();
            t4.copy(e.at).addScaledVector(_u, Math.cos(a) * (1.5 + 3.5 * power) * (0.4 + k * 4)).addScaledVector(_v, Math.sin(a) * (1.5 + 3.5 * power) * (0.4 + k * 4));
            seg(e.at, t4, 0.12 + 0.12 * power, i % 2 ? WHITE : col, 1.5 * f);
          }
        }
        return true;
      };
      return e;
    }

    // ---------- spells ----------
    const SP = {};

    SP['data-spike'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C(Theme.hex('accent')), core = C('#d7ffe8');
      P(tg, 'base', e.base = new V()); P(cs, 'pos', e.src = new V()); e.src.y = 0.1;
      e.spikes = [];
      e.strike = (i, h) => {
        const a = (i / 3) * Math.PI * 2 + rnd(-0.4, 0.4), r = i === 1 ? 0 : 2.6 * S;
        e.spikes.push({ at: new V(e.base.x + Math.cos(a) * r, 0, e.base.z + Math.sin(a) * r + 1.5 * S), t: 0, h: rnd(9, 13) * S, lean: new V(rnd(-0.25, 0.25), 1, rnd(-0.1, 0.25)).normalize() });
        react(tg, 'flinch', h.power);
        juice('shake', 0.25);
      };
      e.update = dt => {
        strikes(e);
        // a crack runs along the floor to the target
        const u = clamp(e.t / 0.32, 0, 1);
        if (e.t < 1.4) {
          const k = e.t < 0.32 ? 1 : 1 - (e.t - 0.32) / 1.1;
          t1.lerpVectors(e.src, e.base, ease(u)); t1.y = 0.08;
          jag(e.src, t1, 10, 0.03, e.crack ||= []);
          line(e.crack, 0.22, col, 0.9 * k);
        }
        for (const s of e.spikes) {
          s.t += dt;
          const g = ease(s.t / 0.12), fade = s.t > 0.55 ? 1 - (s.t - 0.55) / 0.3 : 1;
          if (fade <= 0) { if (!s.shattered) { s.shattered = true; t2.copy(s.at).addScaledVector(s.lean, s.h); burst(t2, 26, 9, col, 0.45, 0.8, G.star, { grav: 12 }); burst(s.at.clone().setY(1), 18, 6, core, 0.3, 0.6, G.dot, { grav: 8 }); } continue; }
          // a prism that tapers to a point
          for (let k2 = 0; k2 < 4; k2++) {
            t1.copy(s.at).addScaledVector(s.lean, s.h * g * k2 / 4);
            t2.copy(s.at).addScaledVector(s.lean, s.h * g * (k2 + 1) / 4);
            seg(t1, t2, 1.5 * S * (1 - k2 / 4.4), col, 0.55 * fade);
            seg(t1, t2, 0.45 * S * (1 - k2 / 4.4), core, 1.3 * fade);
          }
          if (s.t < 0.05) { burst(s.at.clone().setY(0.5), 20, 10, col, 0.4, 0.5, G.dot, { up: 1, grav: 14 }); flare(t2.copy(s.at).setY(3 * S), col, 6 * S, 0.25); }
        }
        return e.t < 1.8;
      };
    };

    SP['safe-mode'] = (e, cs) => {
      const col = C('#7dffc4');
      P(cs, 'pos', t1);
      burst(t1, 40, 7, col, 0.35, 0.7, G.hex, { drag: 2 });
      flare(t1, col, 6, 0.3);
      e.update = () => {
        P(cs, 'pos', t1);
        const g = ease(e.t / 0.4);
        circle(t1.clone().setY(0.1), UP, 2.8 * (2 - g), 0.12, col, 1.5 * (1 - e.t / 0.6), 32);
        return e.t < 0.6;
      };
      aura('ward', true, { caster: cs });
    };

    SP['binary-rain'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C('#5dff9e'), hi = C('#d9ffe9');
      e.cols = Array.from({ length: 14 }, () => ({ x: rnd(-7, 7) * S, z: rnd(-3, 3) * S, next: 0 }));
      const end = (e.hits.length ? e.hits[e.hits.length - 1].at / 1000 : 3) + 0.3;
      e.strike = (i, h) => {
        const c = e.cols[Math.floor(Math.random() * e.cols.length)];
        P(tg, 'base', t1); P(tg, 'top', t2);
        t3.set(t1.x + c.x, t2.y + 5 * S, t1.z + c.z); P(tg, 'pos', t4); t4.x += c.x * 0.4; t4.z += 1;
        c.flash = 0.22; c.to = t4.clone(); c.from = t3.clone();
        burst(t4, 12, 7, hi, 1.1 * S, 0.5, Math.random() < 0.5 ? G.zero : G.one, { drag: 2 });
        react(tg, 'flinch', h.power);
      };
      e.update = dt => {
        strikes(e);
        P(tg, 'base', t1); P(tg, 'top', t2);
        const on = e.t > 0.15 && e.t < end;
        for (const c of e.cols) {
          if (on && e.t >= c.next) {
            c.next = e.t + rnd(0.03, 0.09);
            t3.set(t1.x + c.x + rnd(-0.2, 0.2), t2.y + rnd(1, 5) * S, t1.z + c.z);
            spawn(t3, _pv.set(0, -rnd(13, 19) * S, 0), Math.random() < 0.2 ? hi : col, rnd(1.4, 2.1) * S, rnd(0.9, 1.2), Math.random() < 0.5 ? G.zero : G.one);
          }
          if (on) seg(t3.set(t1.x + c.x, t2.y + 5 * S, t1.z + c.z), t4.set(t1.x + c.x, 0.2, t1.z + c.z), 0.12 * S, col, 0.25 + 0.15 * Math.sin(e.t * 13 + c.x));
          if (c.flash > 0) { c.flash -= dt; seg(c.from, c.to, 0.7 * S, col, 4 * c.flash); seg(c.from, c.to, 0.2 * S, WHITE, 7 * c.flash); }
        }
        return e.t < end + 0.9;
      };
    };

    SP['echo-pulse'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C('#9ff3ff');
      P(cs, 'pos', e.src = new V());
      e.rings = [];
      (e.hits || []).forEach(h => e.rings.push({ at: h.at / 1000 - 0.35, hit: h.at / 1000 }));
      e.update = () => {
        strikes(e);
        circle(t1.copy(e.src).setY(0.1), UP, 0.5 + e.t * 9, 0.1, col, Math.max(0, 1 - e.t / 0.6) * 1.5, 30);
        P(tg, 'pos', t2);
        t3.subVectors(t2, e.src).normalize();
        for (const r of e.rings) {
          const u = (e.t - r.at) / (r.hit - r.at);
          if (u < 0) continue;
          if (u <= 1) { t4.lerpVectors(e.src, t2, ease(u)); circle(t4, t3, 0.5 + 2 * u * S, 0.12, col, 1.3, 24, u * 3); }
          else { const v = (e.t - r.hit) / 0.45; if (v < 1) circle(t2, t3, 2 * S + v * 6 * S, 0.14, col, 1.4 * (1 - v), 30); }
        }
        return e.t < (e.rings.length ? e.rings[e.rings.length - 1].hit + 0.5 : 0.7);
      };
      e.strike = (i, h) => { P(tg, 'pos', t5); flare(t5, col, 4 * S, 0.2); react(tg, 'flinch', h.power); };
    };

    SP['glitch-blade'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6;
      const cols = [C('#ff5cf0'), C('#3ee6ff'), WHITE];
      e.arc = [];
      e.strike = (i, h) => { react(tg, 'stagger', h.power); juice('shake', 0.55); juice('stop', 70); juice('glitch', 1, 0.45); P(tg, 'pos', t1); bigFlash(t1, cols[0], 10 * S); };
      e.update = () => {
        strikes(e);
        P(tg, 'pos', t1);
        // the arc lies in the plane facing the camera, from upper left to lower right
        t2.subVectors(camera.position, t1).normalize();
        _u.copy(UP).cross(t2).normalize(); _v.copy(t2).cross(_u).normalize();
        const n = 22, rev = ease(e.t / 0.2), fade = e.t < 0.25 ? 1 : 1 - (e.t - 0.25) / 0.35;
        if (fade <= 0) return e.t < 1;
        for (let c = 0; c < 3; c++) {
          const off = (c - 1) * 0.35 * S * (1 + Math.sin(e.t * 60) * 0.5);
          let pv = null;
          for (let i = 0; i <= n * rev; i++) {
            const a = 2.4 - (i / n) * 2.6;
            const p = (tmp[8 + (i % 2)]).copy(t1).addScaledVector(_u, Math.cos(a) * 9 * S + off - 2 * S).addScaledVector(_v, Math.sin(a) * 9 * S - 3 * S);
            if (Math.random() < 0.08) p.addScaledVector(_u, rnd(-0.8, 0.8) * S);
            if (pv) seg(pv, p, (c === 2 ? 0.3 : 0.8) * S * Math.sin(Math.PI * i / n + 0.15), cols[c], (c === 2 ? 1.6 : 0.7) * fade);
            pv = t6.copy(p);
          }
          if (c === 0 && e.t < 0.25 && Math.random() < 0.9) spawn(t6, _pv.set(rnd(-4, 4), rnd(-2, 4), rnd(-1, 3)), cols[Math.floor(rnd(0, 2))], 0.7 * S, 0.5, G.box, { drag: 2 });
        }
        return true;
      };
    };

    SP['cryo-lock'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C('#bfefff'), deep = C('#5fc8ff');
      const hold = ((e.effect && e.effect.ms) || 5000) / 1000;
      P(tg, 'base', e.base = new V());
      e.shards = Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2, h: rnd(9, 15) * S, d: rnd(0, 0.35) }));
      juice('tint', '#9fdfff', 0.25);
      e.strike = (i, h) => { P(tg, 'pos', t1); bigFlash(t1, col, 12 * S); burst(t1, 60, 9, col, 0.5, 1, G.star, { drag: 1.5 }); react(tg, 'freeze', hold * 1000); juice('shake', 0.35); };
      e.update = dt => {
        strikes(e);
        P(tg, 'base', e.base);
        const end = 0.6 + hold, out = e.t > end ? (e.t - end) / 0.4 : 0;
        if (out >= 1) {
          if (!e.broke) { e.broke = true; for (const s of e.shards) { t1.set(e.base.x + Math.cos(s.a) * 5 * S, s.h * 0.5, e.base.z + Math.sin(s.a) * 3.5 * S); burst(t1, 10, 7, col, 0.45, 0.8, G.star, { grav: 10 }); } }
          return e.t < end + 1.2;
        }
        for (const s of e.shards) {
          const g = ease((e.t - s.d) / 0.4);
          if (g <= 0) continue;
          const r = 5.2 * S;
          t1.set(e.base.x + Math.cos(s.a) * r, 0, e.base.z + Math.sin(s.a) * r * 0.7);
          t2.set(e.base.x + Math.cos(s.a) * r * 0.35, s.h * g, e.base.z + Math.sin(s.a) * r * 0.25);
          const shimmer = 0.8 + 0.2 * Math.sin(e.t * 9 + s.a * 3);
          seg(t1, t2, 1.1 * S * (1 - out), deep, 0.35 * shimmer);
          seg(t1, t2, 0.35 * S * (1 - out), col, 1.2 * shimmer);
        }
        if (Math.random() < 0.6) { t1.set(e.base.x + rnd(-6, 6) * S, rnd(0, 14) * S, e.base.z + rnd(-3, 4) * S); spawn(t1, _pv.set(rnd(-0.5, 0.5), rnd(-0.6, 0.2), rnd(-0.5, 0.5)), col, 0.35 * S, 1.6, G.dot); }
        return true;
      };
    };

    SP['electro-storm'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C('#9fd8ff'), core = C('#f2fbff'), dark = C('#3d5d86');
      const last = e.hits.length ? e.hits[e.hits.length - 1].at / 1000 : 3;
      e.bolts = [];
      e.strike = (i, h) => {
        P(tg, 'top', t1); P(tg, 'pos', t2);
        const from = new V(t1.x + rnd(-5, 5) * S, t1.y + 5 * S, t1.z + rnd(-2, 2) * S);
        const to = new V(t2.x + rnd(-2.5, 2.5) * S, t2.y + rnd(-3, 4) * S, t2.z + 1.5 * S);
        const big = i === e.hits.length - 1;
        e.bolts.push({ from, to, t: 0, life: big ? 0.35 : 0.24, re: 0, pts: [], forks: [[], []], big });
        burst(to, big ? 50 : 24, big ? 14 : 10, core, 0.35, 0.5, G.star, { drag: 2.5 });
        bigFlash(to, col, (big ? 14 : 8) * S);
        react(tg, big ? 'stagger' : 'flinch', h.power);
        juice('shake', big ? 0.6 : 0.3);
        if (big) juice('stop', 80);
      };
      e.update = dt => {
        strikes(e);
        P(tg, 'top', t1);
        // the cloud: dim particles turning in a disk over the target
        const cloudOn = e.t < last + 0.5;
        if (cloudOn) for (let k = 0; k < 6; k++) {
          const a = rnd(0, Math.PI * 2), r = rnd(0, 8) * S * Math.min(1, e.t / 0.6);
          t2.set(t1.x + Math.cos(a) * r, t1.y + 5 * S + rnd(-0.8, 0.8) * S, t1.z + Math.sin(a) * r * 0.5);
          spawn(t2, _pv.set(-Math.sin(a) * 2.5, 0, Math.cos(a) * 1.2), Math.random() < 0.12 ? col : dark, rnd(2.6, 4) * S, rnd(0.7, 1.2), G.dot);
        }
        if (cloudOn && Math.random() < 0.3) { t2.set(t1.x + rnd(-6, 6) * S, t1.y + 5 * S, t1.z); flare(t2, col, 6 * S, 0.12, 0.7); }
        for (let b = e.bolts.length - 1; b >= 0; b--) {
          const B = e.bolts[b];
          B.t += dt; B.re -= dt;
          if (B.t > B.life) { e.bolts.splice(b, 1); continue; }
          if (B.re <= 0) {
            B.re = 0.045;
            jag(B.from, B.to, 12, 0.16, B.pts);
            for (const [fi, f] of B.forks.entries()) {
              const at = B.pts[3 + fi * 4];
              t3.copy(at).add(_pv.set(rnd(-4, 4) * S, rnd(-3, -1) * S, rnd(-1, 1) * S));
              jag(at, t3, 5, 0.2, f);
            }
          }
          const k = 1 - B.t / B.life;
          const w = (B.big ? 1.7 : 1.1) * S;
          line(B.pts, 1.5 * w, col, 0.55 * k);
          line(B.pts, 0.38 * w, core, 2.4 * k);
          for (const f of B.forks) { line(f, 0.7 * w, col, 0.5 * k); line(f, 0.18 * w, core, 1.6 * k); }
        }
        return e.t < last + 1.2;
      };
    };

    SP['hyper-thread'] = (e, cs) => {
      const col = C('#ffb066');
      P(cs, 'pos', t1);
      flare(t1, col, 8, 0.35);
      burst(t1, 40, 9, col, 0.4, 0.7, G.dot, { up: 0.6, drag: 2 });
      e.update = () => {
        P(cs, 'pos', t1);
        const k = 1 - e.t / 0.5;
        seg(t1.clone().setY(0), t2.copy(t1).setY(18), 1.4 * k, col, 0.6 * k);
        seg(t1.clone().setY(0), t2, 0.3 * k, WHITE, 1.4 * k);
        circle(t1.clone().setY(0.1), UP, 0.5 + e.t * 10, 0.14, col, 1.4 * k, 28);
        return e.t < 0.5;
      };
      aura('hyper', true, { caster: cs, ms: (e.effect && e.effect.ms) || 8000 });
    };

    SP['packet-storm'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C('#3ee6ff'), hi = C('#e6fdff');
      P(cs, 'pos', e.src = new V());
      const n = Math.max(1, e.hits.length);
      e.pk = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2, out: i * 0.035, dive: -1, pos: new V(), prev: new V(), done: false, y: rnd(-2, 3) }));
      e.strike = i => {
        const p = e.pk[i]; if (!p) return;
        p.dive = e.t; p.from = p.pos.clone();
      };
      e.update = () => {
        strikes(e);
        P(tg, 'pos', t1);
        let alive = 0;
        for (const p of e.pk) {
          if (p.done) continue;
          alive++;
          p.prev.copy(p.pos);
          const R = 7.5 * S;
          const orbit = t2.set(t1.x + Math.cos(p.a + e.t * 3.2) * R, t1.y + p.y * S + Math.sin(e.t * 4 + p.a) * S, t1.z + Math.sin(p.a + e.t * 3.2) * R * 0.55);
          if (p.dive >= 0) {
            const u = (e.t - p.dive) / 0.09;
            p.pos.lerpVectors(p.from, t1, ease(u));
            if (u >= 1) { p.done = true; burst(t1.clone().add(_pv.set(rnd(-1, 1) * S, rnd(-1, 1) * S, 1)), 8, 7, hi, 0.35, 0.4, G.box, { drag: 3 }); flare(t1, col, 3 * S, 0.12); react(tg, 'flinch', 9); continue; }
          } else {
            const u = clamp((e.t - p.out) / 0.6, 0, 1);
            t3.lerpVectors(e.src, orbit, ease(u));
            t3.y += Math.sin(u * Math.PI) * 4;
            p.pos.copy(t3);
          }
          seg(p.pos, t4.copy(p.pos).add(_pv.set(0.001, 0.001, 0.001)).addScaledVector(_pv.set(1, 1, 1).normalize(), 0.5 * S), 0.55 * S, hi, 1.1, 0.55 * S);
          if (p.prev.lengthSq()) seg(p.prev, p.pos, 0.18 * S, col, 0.9);
        }
        return alive > 0 && e.t < 6;
      };
    };

    SP['neon-nova'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C('#ff4fd8'), hi = C('#ffd6f6');
      e.strike = (i, h) => {
        P(tg, 'pos', t1);
        e.boom = e.t; e.sh = shell();
        e.sh.m.material.uniforms.uCol.value.copy(col); e.sh.m.material.uniforms.uHex.value = 0;
        burst(t1, 120, 22 * S, col, 0.55, 0.9, G.star, { drag: 1.4 });
        burst(t1, 60, 14 * S, hi, 0.4, 0.7, G.dot, { drag: 1.8 });
        bigFlash(t1, col, 20 * S, 1.3);
        react(tg, 'stagger', h.power);
        juice('shake', 0.7); juice('stop', 90);
      };
      e.update = () => {
        strikes(e);
        P(tg, 'pos', t1);
        if (e.boom === undefined) {
          // the charge: sparks pulled into the core
          for (let k = 0; k < 4; k++) {
            t2.copy(t1).add(_pv.set(rnd(-1, 1), rnd(-1, 1), rnd(-0.4, 1)).normalize().multiplyScalar(10 * S));
            spawn(t2, _pv.subVectors(t1, t2).multiplyScalar(2.2), Math.random() < 0.3 ? hi : col, 0.45 * S, 0.45, G.dot);
          }
          flare(t1, col, (2 + e.t * 10) * S, 0.08, 0.6);
          return true;
        }
        const u = (e.t - e.boom) / 0.75;
        if (u >= 1) { if (e.sh) { freeShell(e.sh); e.sh = null; } return false; }
        e.sh.m.position.copy(t1); e.sh.m.scale.setScalar((1 + ease(u) * 13) * S);
        e.sh.m.material.uniforms.uAmt.value = (1 - u) * 1.6;
        circle(t3.copy(t1).setY(0.12), UP, (1 + ease(u) * 20) * S, 0.35 * S, col, 1.6 * (1 - u), 40);
        circle(t1, t4.subVectors(camera.position, t1).normalize(), (1 + ease(u) * 15) * S, 0.25 * S, hi, 1.2 * (1 - u), 40, u);
        return true;
      };
    };

    SP['system-purge'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, col = C('#b6ff5c'), hi = C('#f0ffd9');
      P(tg, 'top', e.top = new V());
      e.strike = (i, h) => { react(tg, 'flash', h.power); P(tg, 'pos', t1); flare(t1, col, 8 * S, 0.25); };
      e.update = () => {
        strikes(e);
        P(tg, 'base', t1); P(cs, 'pos', t2);
        const u = e.t / 1.1, k = u < 0.85 ? 1 : (1 - u) / 0.15;
        if (u >= 1) return false;
        const y = ease(u) * (e.top.y + 4 * S), cz = (t1.z + t2.z) / 2, half = 18 * S;
        // the scan edge and the grid it drags behind it
        seg(t3.set(-half, y, cz - 6 * S), t4.set(half, y, cz - 6 * S), 0.35 * S, hi, 1.8 * k);
        seg(t3.set(-half, y, cz + 6 * S), t4.set(half, y, cz + 6 * S), 0.35 * S, hi, 1.8 * k);
        seg(t3.set(-half, y, cz - 6 * S), t4.set(-half, y, cz + 6 * S), 0.2 * S, col, 1.2 * k);
        seg(t3.set(half, y, cz - 6 * S), t4.set(half, y, cz + 6 * S), 0.2 * S, col, 1.2 * k);
        for (let g = -4; g <= 4; g++) seg(t3.set(g * half / 4, y, cz - 6 * S), t4.set(g * half / 4, y, cz + 6 * S), 0.08 * S, col, 0.7 * k);
        for (let g = 1; g <= 3; g++) seg(t3.set(-half, y - g * 0.9 * S, cz), t4.set(half, y - g * 0.9 * S, cz), 0.07 * S, col, (0.6 - g * 0.15) * k);
        for (let n = 0; n < 5; n++) { t3.set(rnd(-half, half), y, cz + rnd(-6, 6) * S); spawn(t3, _pv.set(0, rnd(1, 3), 0), Math.random() < 0.3 ? hi : col, 0.5 * S, 0.7, Math.random() < 0.5 ? G.hash : G.brace); }
        return true;
      };
    };

    SP['void-sphere'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, vio = C('#b86bff'), pink = C('#ff8ae6'), hi = C('#f6e9ff');
      const hits = e.hits || [];
      const collapse = hits.length ? hits[hits.length - 1].at / 1000 : 2.9;
      P(cs, 'pos', e.src = new V());
      e.at = new V();
      const pull = { at: e.at, k: 0, swirl: 7 };
      e.pullI = pulls.push(pull) - 1;
      voidCore.visible = true; disk.visible = true;
      e.rim = shell(); e.rim.m.material.uniforms.uCol.value.copy(vio); e.rim.m.material.uniforms.uHex.value = 0;
      juice('dim', 0.45, collapse + 0.2);
      e.strike = (i, h) => {
        if (i < hits.length - 1) { react(tg, 'pull', h.power, e.at); juice('shake', 0.15); return; }
        // the collapse goes off
        e.boom = e.t;
        burst(e.at, 220, 26 * S, vio, 0.6, 1.1, G.dot, { drag: 1.2 });
        burst(e.at, 90, 18 * S, hi, 0.45, 0.8, G.star, { drag: 1.5 });
        bigFlash(e.at, hi, 26 * S, 1.4);
        react(tg, 'break', h.power);
        juice('shake', 1.1); juice('stop', 130); juice('glitch', 0.8, 0.4);
      };
      e.update = dt => {
        strikes(e);
        P(tg, 'pos', t1);
        // the orb flies out, stops in front of the target, grows, pulls, collapses and blows
        const stopAt = t2.copy(t1).add(t3.subVectors(e.src, t1).normalize().multiplyScalar(4 * S)).add(_pv.set(0, 1 * S, 0));
        const fly = clamp(e.t / 0.9, 0, 1);
        if (e.boom === undefined) {
          e.at.lerpVectors(e.src, stopAt, ease(fly)); e.at.y += Math.sin(fly * Math.PI) * 3;
          const grow = fly < 1 ? 0.35 + fly * 0.4 : 0.75 + ease((e.t - 0.9) / (collapse - 1.1)) * 2.2;
          const shrink = e.t > collapse - 0.2 ? clamp((collapse - e.t) / 0.2, 0, 1) : 1;
          const r = grow * shrink * S;
          voidCore.position.copy(e.at); voidCore.scale.setScalar(Math.max(0.01, r));
          e.rim.m.position.copy(e.at); e.rim.m.scale.setScalar(Math.max(0.01, r * 1.25));
          e.rim.m.material.uniforms.uAmt.value = 1.3;
          disk.position.copy(e.at); disk.lookAt(camera.position); disk.rotateX(-1.1);
          disk.scale.setScalar(Math.max(0.01, r * 3.4 * (fly < 1 ? 0.4 : 1)));
          diskMat.uniforms.uAmt.value = fly < 1 ? 0.5 : 1.2;
          diskMat.uniforms.uTime.value = e.t;
          circle(e.at, t4.subVectors(camera.position, e.at).normalize(), r * (1.6 + 0.2 * Math.sin(e.t * 20)), 0.05 * S, hi, 0.9 * shrink, 40);
          if (fly >= 1) {
            pull.k = 26 * S * shrink;
            // matter spirals in from a wide ring
            for (let k = 0; k < 6; k++) {
              const a = rnd(0, Math.PI * 2), rr = rnd(9, 14) * S;
              t5.set(e.at.x + Math.cos(a) * rr, e.at.y + rnd(-3, 3) * S, e.at.z + Math.sin(a) * rr * 0.6);
              spawn(t5, _pv.set(-Math.sin(a) * 6 * S, 0, Math.cos(a) * 6 * S), Math.random() < 0.25 ? pink : Math.random() < 0.3 ? hi : vio, rnd(0.3, 0.6) * S, 1.4, G.dot, { pull: e.pullI });
            }
            if (!reduce) juice('shake', 0.08);
          } else if (Math.random() < 0.8) spawn(e.at, _pv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), vio, 0.4 * S, 0.4, G.dot);
          return true;
        }
        pull.k = 0;
        voidCore.visible = false; disk.visible = false;
        const u = (e.t - e.boom) / 0.8;
        if (u >= 1) { freeShell(e.rim); pulls[e.pullI] = { at: new V(), k: 0 }; return false; }
        e.rim.m.scale.setScalar((1 + ease(u) * 16) * S); e.rim.m.material.uniforms.uAmt.value = (1 - u) * 1.5;
        circle(t5.copy(e.at).setY(0.15), UP, (2 + ease(u) * 26) * S, 0.4 * S, vio, 1.8 * (1 - u), 44);
        circle(e.at, t4.subVectors(camera.position, e.at).normalize(), (1 + ease(u) * 18) * S, 0.3 * S, hi, 1.6 * (1 - u), 44);
        circle(e.at, t6.set(1, 0.3, 0).normalize(), (1 + ease(u) * 12) * S, 0.2 * S, pink, 1.2 * (1 - u), 36);
        return true;
      };
      e.cleanup = () => { voidCore.visible = false; disk.visible = false; if (e.rim) freeShell(e.rim); };
    };

    SP['kernel-panic'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, blue = C('#3d7bff'), pale = C('#cfe0ff');
      const hold = ((e.effect && e.effect.ms) || 4000) / 1000;
      e.panels = Array.from({ length: 9 }, (_, i) => ({ a: -1.25 + (i / 8) * 2.5, y: rnd(-3, 7), d: i * 0.03, w: rnd(2.6, 4), h: rnd(1.6, 2.6) }));
      e.strike = (i, h) => { react(tg, 'stun', hold * 1000); juice('glitch', 1, 0.7); juice('tint', '#3d7bff', 0.3); juice('shake', 0.5); juice('stop', 90); P(tg, 'pos', t1); bigFlash(t1, blue, 14 * S); burst(t1, 50, 10, pale, 0.6, 0.9, G.brace, { drag: 2 }); };
      e.update = () => {
        strikes(e);
        P(tg, 'pos', t1);
        const end = 0.4 + hold;
        const out = e.t > end ? (e.t - end) / 0.3 : 0;
        if (out >= 1) {
          if (!e.broke) { e.broke = true; for (const p of e.panels) { t2.set(t1.x + Math.sin(p.a) * 8 * S, t1.y + p.y * S, t1.z + Math.cos(p.a) * 5 * S); burst(t2, 10, 6, blue, 0.6, 0.7, G.box, { grav: 6 }); } }
          return e.t < end + 1;
        }
        for (const p of e.panels) {
          const g = ease((e.t - p.d) / 0.15);
          if (g <= 0) continue;
          t2.set(t1.x + Math.sin(p.a) * 8 * S, t1.y + p.y * S, t1.z + Math.cos(p.a) * 5 * S);
          const flick = Math.random() < 0.06 ? 0.2 : 1;
          panel(t2, t1, p.w * S * g, p.h * S * g, blue, 0.5 * flick * (1 - out));
          // a few lines of "text" on each panel
          for (let l = 0; l < 3; l++) {
            t3.copy(t2).add(_pv.set(0, (0.5 - l * 0.45) * S, 0)).lerp(t1, 0.02);
            t4.copy(t3).add(_pv.set(Math.cos(p.a) * p.w * 0.35 * S * (l === 2 ? 0.5 : 1), 0, -Math.sin(p.a) * p.w * 0.35 * S * (l === 2 ? 0.5 : 1)));
            seg(t3, t4, 0.1 * S, pale, 0.9 * flick * g * (1 - out));
          }
        }
        return true;
      };
    };

    SP['root-access'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, amber = C('#ffc46b'), hi = C('#fff2d6');
      e.strike = (i, h) => { P(tg, 'pos', t1); bigFlash(t1, amber, 12 * S); react(tg, 'flash', h.power); juice('shake', 0.3); e.lit = e.t; };
      e.update = () => {
        strikes(e);
        P(tg, 'pos', t1);
        t2.subVectors(camera.position, t1).normalize();
        const u = ease(e.t / 0.5);
        const r = (6.5 - 4 * u) * S;
        circle(t1, t2, r, 0.2 * S, amber, 1.4, 32, e.t * 4, 0.22);
        circle(t1, t2, r, 0.2 * S, amber, 1.4, 32, e.t * 4 + Math.PI, 0.22);
        circle(t1, t2, r * 1.25, 0.08 * S, hi, 0.9, 32, -e.t * 3, 0.15);
        if (e.lit !== undefined) {
          const k = 1 - (e.t - e.lit) / 0.6;
          if (k > 0) { seg(t3.copy(t1).setY(t1.y + 30), t1, 1.6 * S * k, amber, 0.6 * k); seg(t3, t1, 0.4 * S * k, hi, 1.6 * k); }
        }
        if (Math.random() < 0.5) { const a = e.t * 6; spawn(t4.copy(t1).add(_pv.set(Math.cos(a) * 3 * S, -3 * S, Math.sin(a) * 2 * S)), _pv.set(0, 5 * S, 0), amber, 0.6 * S, 0.8, G.hash); }
        return e.t < 1.2;
      };
      aura('root', true, { target: tg, ms: (e.effect && e.effect.ms) || 6000 });
    };

    SP['quantum-split'] = (e, cs) => {
      const col = C('#d6b8ff');
      P(cs, 'pos', t1);
      flare(t1, col, 7, 0.3);
      burst(t1, 30, 6, col, 0.4, 0.6, G.hex, { drag: 2 });
      e.update = () => e.t < 0.1;
      aura('split', true, { caster: cs });
    };

    SP['zero-day'] = (e, cs, tg) => {
      const S = sizeOf(tg) / 6, red = C('#ff3b4f'), hi = C('#fff0f0'), deep = C('#8a0f1c');
      const hits = e.hits || [];
      const at = hits.length ? hits[hits.length - 1].at / 1000 : 2;
      P(tg, 'top', e.top = new V());
      juice('dim', 0.7, at + 0.4);
      e.strike = (i, h) => {
        e.boom = e.t;
        P(tg, 'base', t1); P(tg, 'pos', t2);
        burst(t2, 260, 30 * S, red, 0.6, 1.2, G.dot, { drag: 1.1 });
        burst(t2, 120, 20 * S, hi, 0.5, 0.9, G.star, { drag: 1.4 });
        burst(t1.clone().setY(0.5), 80, 18 * S, red, 0.5, 1, G.one, { flat: true, drag: 1.2 });
        bigFlash(t2, hi, 34 * S, 1.6);
        react(tg, 'break', h.power);
        juice('shake', 1.5); juice('stop', 170); juice('glitch', 1, 0.9); juice('tint', '#ff3b4f', 0.35);
      };
      e.update = () => {
        strikes(e);
        P(tg, 'base', t1); P(tg, 'pos', t2);
        const sky = t3.set(t2.x, e.top.y + 16 * S, t2.z);
        if (e.boom === undefined) {
          // red code falls in a ring, a thin aim line pulses, then the charge gathers in the sky
          for (let k = 0; k < 5; k++) {
            const a = rnd(0, Math.PI * 2), rr = rnd(8, 15) * S;
            t4.set(t1.x + Math.cos(a) * rr, e.top.y + rnd(4, 12) * S, t1.z + Math.sin(a) * rr * 0.5);
            spawn(t4, _pv.set(0, -rnd(12, 20) * S, 0), Math.random() < 0.2 ? hi : red, rnd(0.6, 0.9) * S, 1.1, [G.zero, G.one, G.hash][Math.floor(rnd(0, 3))]);
          }
          const pulse = 0.5 + 0.5 * Math.sin(e.t * 18);
          seg(sky, t1, 0.12 * S, red, (0.5 + pulse) * Math.min(1, e.t * 2));
          if (e.t > at - 0.7) {
            const g = (e.t - (at - 0.7)) / 0.7;
            for (let k = 0; k < 6; k++) { t4.copy(sky).add(_pv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(8 * S)); spawn(t4, _pv.subVectors(sky, t4).multiplyScalar(3), Math.random() < 0.4 ? hi : red, 0.5 * S, 0.33, G.dot); }
            flare(sky, red, (3 + g * 14) * S, 0.06, 0.8);
            circle(sky, UP, (6 - g * 5) * S, 0.15 * S, red, 1.5, 32, e.t * 5);
          }
          return true;
        }
        const u = (e.t - e.boom) / 0.9;
        if (u >= 1) return false;
        const k = 1 - u;
        seg(sky, t1, 9 * S * k, deep, 0.6 * k);
        seg(sky, t1, 4 * S * k, red, 0.9 * k);
        seg(sky, t1, 1.3 * S * k, hi, 2 * k);
        for (let w = 0; w < 3; w++) { const v = clamp(u * 1.3 - w * 0.15, 0, 1); if (v > 0 && v < 1) circle(t4.copy(t1).setY(0.15), UP, (2 + ease(v) * 34) * S, 0.5 * S, w === 1 ? hi : red, 2 * (1 - v), 48); }
        return true;
      };
    };

    function cast(id, ctx = {}) {
      const fn = SP[id];
      if (!fn) return null;
      const e = add({ id, hits: ctx.hits || [], effect: ctx.effect || {}, strike: () => {} });
      try { fn(e, ctx.caster, ctx.target); } catch (err) { console.error(err); e.update = () => false; }
      return e;
    }

    // ---------- statuses that stay on screen ----------
    function aura(name, on, ctx = {}) {
      const cur = auras[name];
      if (!on) { if (cur) cur.ending = cur.ending || cur.t; return; }
      if (cur && !cur.ending) { cur.ctx = ctx; if (ctx.ms) cur.until = cur.t + ctx.ms / 1000; return; }
      const a = { name, ctx, t: 0, ending: 0, until: ctx.ms ? ctx.ms / 1000 : 0, ghosts: [1, 1] };
      auras[name] = a;
    }
    function drawAura(a, dt) {
      a.t += dt;
      if (a.until && a.t > a.until && !a.ending) a.ending = a.t;
      const k = a.ending ? 1 - (a.t - a.ending) / 0.4 : Math.min(1, a.t / 0.3);
      if (k <= 0) return false;
      const cs = a.ctx.caster, tg = a.ctx.target;
      if (a.name === 'ward') {
        P(cs, 'pos', t1); t1.y = 0.4;
        const col = C('#7dffc4');
        for (let i = 0; i < 3; i++) circle(t2.copy(t1).setY(0.4 + i * 0.9), UP, 2.4 - i * 0.55, 0.07, col, 1.1 * k, 6, a.t * (i % 2 ? -0.8 : 0.8));
        for (let i = 0; i < 6; i++) {
          const ang = a.t * 0.8 + i * Math.PI / 3;
          let pv = null;
          for (let j = 0; j <= 4; j++) {
            const el = (j / 4) * Math.PI / 2;
            const p = t3.set(t1.x + Math.cos(ang) * Math.cos(el) * 2.4, 0.4 + Math.sin(el) * 2.4, t1.z + Math.sin(ang) * Math.cos(el) * 2.4);
            if (pv) seg(pv, p, 0.05, col, 0.8 * k);
            pv = t4.copy(p);
          }
        }
      } else if (a.name === 'hyper') {
        P(cs, 'pos', t1);
        const col = C('#ffb066');
        for (const s of [0, Math.PI]) {
          let pv = null;
          for (let j = 0; j <= 16; j++) {
            const h = j / 16 * 3.6, ang = a.t * 5 + s + j * 0.6;
            const p = t3.set(t1.x + Math.cos(ang) * 1.3, h, t1.z + Math.sin(ang) * 1.3);
            if (pv) seg(pv, p, 0.1, s ? WHITE : col, (s ? 0.8 : 1.4) * k);
            pv = t4.copy(p);
          }
        }
        if (Math.random() < 0.5) spawn(t5.set(t1.x + rnd(-1, 1), 0.3, t1.z + rnd(-1, 1)), _pv.set(0, rnd(2, 4), 0), col, 0.3, 0.8, G.dot);
      } else if (a.name === 'split') {
        P(cs, 'pos', t1);
        const col = C('#d6b8ff');
        a.ghosts.forEach((g, i) => {
          if (!g) return;
          const side = i ? 1 : -1;
          t2.set(t1.x + side * (2.4 + Math.sin(a.t * 3) * 0.2), t1.y + 0.4, t1.z - 0.4);
          const r = 0.6, spin = a.t * 2;
          const pts = (a.pts ||= Array.from({ length: 6 }, () => new V()));
          [[0, r * 1.5, 0], [0, -r * 1.5, 0], [r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r]].forEach(([x, y, z], n) => pts[n].set(t2.x + x * Math.cos(spin) - z * Math.sin(spin), t2.y + y, t2.z + x * Math.sin(spin) + z * Math.cos(spin)));
          for (const [p, q] of [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]]) seg(pts[p], pts[q], 0.06, col, (0.9 + 0.3 * Math.sin(a.t * 11 + i)) * k);
          seg(t1.clone().setY(0.6), t2, 0.03, col, 0.35 * k);
        });
      } else if (a.name === 'root') {
        P(tg, 'pos', t1);
        const col = C('#ffc46b');
        const S = sizeOf(tg) / 6;
        t2.subVectors(camera.position, t1).normalize();
        circle(t1, t2, 2.6 * S, 0.12 * S, col, 0.9 * k, 32, a.t * 2, 0.2);
        circle(t1, t2, 2.6 * S, 0.12 * S, col, 0.9 * k, 32, a.t * 2 + Math.PI, 0.2);
        circle(t1, t2, 2.6 * S, 0.12 * S, col, 0.9 * k, 32, a.t * 2 + Math.PI / 2, 0.08);
        circle(t1, t2, 2.6 * S, 0.12 * S, col, 0.9 * k, 32, a.t * 2 + Math.PI * 1.5, 0.08);
      }
      return true;
    }
    function event(kind, ctx = {}) {
      if (kind === 'ward') {
        const a = auras.ward; const cs = (a && a.ctx.caster) || ctx.caster;
        P(cs, 'pos', t1); t1.y = 1.4;
        burst(t1, 60, 12, C('#7dffc4'), 0.45, 0.7, G.hex, { drag: 2 });
        bigFlash(t1, C('#7dffc4'), 7);
        if (a) a.ending = a.t;
      }
      if (kind === 'guard') {
        const a = auras.split;
        if (!a) return;
        const i = a.ghosts[0] ? 0 : 1;
        a.ghosts[i] = 0;
        P(a.ctx.caster, 'pos', t1);
        t1.x += i ? 2.4 : -2.4; t1.y += 0.4;
        burst(t1, 40, 9, C('#d6b8ff'), 0.4, 0.7, G.star, { drag: 2 });
        flare(t1, C('#d6b8ff'), 4, 0.2);
        if (!a.ghosts[0] && !a.ghosts[1]) a.ending = a.t;
      }
    }

    // ---------- frame ----------
    function update(dt) {
      clock += dt;
      nSeg = 0;
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        e.t += dt;
        let ok = false;
        try { ok = e.update(dt); } catch (err) { console.error(err); }
        if (!ok) { live.splice(i, 1); if (e.cleanup) e.cleanup(); }
      }
      for (const n in auras) if (!drawAura(auras[n], dt)) delete auras[n];
      drawCharge(dt);
      segs.count = nSeg;
      segs.instanceMatrix.needsUpdate = true;
      if (segs.instanceColor) segs.instanceColor.needsUpdate = true;
      // particles
      pAlive = 0;
      for (let i = 0; i < PN; i++) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -1000; pSize[i] = 0; continue; }
        pAlive++;
        const j = i * 3;
        if (pPull[i] >= 0 && pulls[pPull[i]] && pulls[pPull[i]].k) {
          const a = pulls[pPull[i]];
          const dx = a.at.x - pPos[j], dy = a.at.y - pPos[j + 1], dz = a.at.z - pPos[j + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
          if (d < 0.6) { pLife[i] = 0.001; continue; }
          const f = a.k / Math.max(1, d * 0.4) * dt;
          pVel[j] += dx / d * f - dz / d * a.swirl * dt; pVel[j + 1] += dy / d * f; pVel[j + 2] += dz / d * f + dx / d * a.swirl * dt;
          pVel[j] *= 1 - 1.2 * dt; pVel[j + 1] *= 1 - 1.2 * dt; pVel[j + 2] *= 1 - 1.2 * dt;
        }
        if (pDrag[i]) { const d = Math.max(0, 1 - pDrag[i] * dt); pVel[j] *= d; pVel[j + 1] *= d; pVel[j + 2] *= d; }
        pVel[j + 1] -= pGrav[i] * dt;
        pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
        const u = pLife[i] / pMax[i];
        const f = u > 0.8 ? 1 : u / 0.8;
        pCol[j] = pBase[j] * f; pCol[j + 1] = pBase[j + 1] * f; pCol[j + 2] = pBase[j + 2] * f;
        pSize[i] = pS0[i] * (pGrow[i] ? 1 + (1 - u) * pGrow[i] : 0.45 + 0.55 * u);
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.aCol.needsUpdate = true;
      pGeo.attributes.aSize.needsUpdate = true;
      pGeo.attributes.aGlyph.needsUpdate = true;
      const ph = o.pixelHeight ? o.pixelHeight() : 600;
      pMat.uniforms.uScale.value = ph / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      for (const f of flares) {
        if (!f.m.visible) continue;
        f.t += dt;
        const u = f.t / f.life;
        if (u >= 1) { f.m.visible = false; continue; }
        f.m.scale.setScalar(f.size * (1 - f.grow + f.grow * 2 * ease(u)));
        f.m.material.opacity = (1 - u);
      }
      for (const s of shells) if (s.busy) s.m.material.uniforms.uTime.value = clock;
    }

    function clear() {
      for (const e of live) if (e.cleanup) e.cleanup();
      live.length = 0;
      for (const n in auras) delete auras[n];
      pLife.fill(0); pSize.fill(0);
      for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -1000;
      flares.forEach(f => { f.m.visible = false; });
      shells.forEach(freeShell);
      pulls.length = 0;
      chg.on = false; chg.L = 0; chg.show = 0; chg.wind = 0; chg.pull = -1; chg.sh = null; coreSpr.visible = false;
      voidCore.visible = false; disk.visible = false;
      segs.count = 0;
    }
    function dispose() {
      clear();
      scene.remove(root);
      keep.forEach(x => x.dispose && x.dispose());
    }
    function info() { return { live: live.map(e => ({ id: e.id || 'shot' + e.tier, t: +e.t.toFixed(3) })), auras: Object.keys(auras), segs: nSeg, particles: pAlive }; }

    return { shot, charge, feed, release, cast, aura, event, update, clear, dispose, info, has: id => !!SP[id], SPELLS: Object.keys(SP) };
  }
  return { create };
})();
