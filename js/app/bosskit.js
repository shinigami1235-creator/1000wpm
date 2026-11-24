// BossKit: the armoured titans (design/bosses/, from Gid's Gemini concepts, 24 Nov 2026).
// One rigged skeleton and one kit of parts (faceted armour, glowing seams, data-block plates,
// the chest core, the red visor, cables), and six bosses built from it:
//   siege   Siege Titan        hunched, huge shoulders and fists, short legs
//   warden  Firewall Warden    a tall knight with a blade and a shield of data blocks
//   colossus Data Colossus     floats, lower body breaking into blocks, a cable tail
//   king    Kernel King        sits on a throne with a cable cape and giant gauntlets
//   half    Half-Compiled      one side armour, the other a bare wireframe body
//   brute   Overclocked Brute  gorilla stance, cracked armour, steam vents
//
//   const b = BossKit.create(THREE, 'siege', { scale })
//   b.group          add to the scene; the feet (or the hover point) sit at y = 0
//   b.bones          { hips, spine, chest, neck, head, shL, armL, foreL, handL, shR, armR, foreR, handR, thighL, shinL, thighR, shinR }
//   b.core           the core's group (world position = the weak point)
//   b.pose(name, k)  blend toward a named pose: 'idle', 'windup', 'slam', 'sweep'; k 0..1
//   b.update(t, dt)  idle motion: breathing, the core's pulse, steam, falling blocks
//   b.blocks         the data-block plates: { mesh, list[{ bone, local, size }] } for knocking off later
//   b.dispose()
window.BossKit = (() => {
  const LIME = Theme.hex('accent');

  function create(THREE, id, opts = {}) {
    const V = THREE.Vector3;
    const keep = [];
    const own = x => (keep.push(x), x);
    let seed = 1;
    for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
    const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
    const S = BOSSES[id] || BOSSES.siege;
    const G = new THREE.Color(LIME), RED = new THREE.Color('#ff3a2e');

    // ---------- materials ----------
    // panel lines: glowing grooves drawn in each piece's own space, broken up so they read
    // as circuit seams rather than a grid (the look of the Gemini concepts)
    function seamed(m, k = 1) {
      m.onBeforeCompile = sh => {
        sh.uniforms.uSeam = { value: G.clone().multiplyScalar((S.seam || 1.0) * k * 0.9) };
        sh.uniforms.uSeed = { value: rnd(0, 50) };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vSN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSP = position; vSN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vSP; varying vec3 vSN; uniform vec3 uSeam; uniform float uSeed;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
          float seamAt(vec2 u){
            vec2 g = u * vec2(0.62, 0.5) + vec2(uSeed * 0.37, uSeed * 0.11); vec2 c = floor(g); vec2 f = fract(g);
            float r = h21(c);
            float lx = (1.0 - smoothstep(0.012, 0.03, abs(f.x - 0.3 - 0.4 * h21(c + 3.1)))) * step(0.62, r);
            float ly = (1.0 - smoothstep(0.012, 0.03, abs(f.y - 0.3 - 0.4 * h21(c + 5.7)))) * step(r, 0.3);
            return max(lx, ly);
          }`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { vec3 n = abs(normalize(vSN)); vec2 u = n.x > n.y && n.x > n.z ? vSP.yz : n.y > n.z ? vSP.xz : vSP.xy;
            totalEmissiveRadiance += uSeam * seamAt(u); }`);
      };
      return m;
    }
    const plate = own(seamed(new THREE.MeshStandardMaterial({ color: S.metal || '#4f5962', metalness: 0.5, roughness: 0.55, flatShading: true })));
    const dark = own(seamed(new THREE.MeshStandardMaterial({ color: '#272e34', metalness: 0.6, roughness: 0.5, flatShading: true }), 0.6));
    const seam = own(new THREE.LineBasicMaterial({ color: G.clone().multiplyScalar(S.seam || 1.6), transparent: true, opacity: 0.9, toneMapped: false }));
    const glow = c => own(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.6), toneMapped: false }));
    const wire = own(new THREE.MeshBasicMaterial({ color: G.clone().multiplyScalar(1.8), wireframe: true, toneMapped: false, transparent: true, opacity: 0.85 }));

    // ---------- geometry ----------
    // a chamfered box, optionally tapered: top/bot scale the top and bottom faces in x and z
    function cbox(w, h, d, c = 0.2, top = 1, bot = 1) {
      const RB = THREE.RoundedBoxGeometry;
      let g = RB ? new RB(w, h, d, 1, Math.min(c * Math.min(w, h, d), Math.min(w, h, d) * 0.45)) : new THREE.BoxGeometry(w, h, d);
      if (top !== 1 || bot !== 1) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i) / h + 0.5, k = bot + (top - bot) * y;
          p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
        }
        g.computeVertexNormals();
      }
      return own(g);
    }
    // glowing seams: some of the piece's hard edges, so the armour reads as panels
    function seams(geo, share = 0.55) {
      const e = new THREE.EdgesGeometry(geo, 30);
      const a = e.attributes.position.array, keepSeg = [];
      for (let i = 0; i < a.length; i += 6) if (rnd() < share) keepSeg.push(...a.slice(i, i + 6));
      const g = own(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(keepSeg, 3));
      own(e);
      return g;
    }

    // ---------- the skeleton ----------
    const group = new THREE.Group();
    const bone = (parent, x, y, z) => { const b = new THREE.Group(); b.position.set(x, y, z); parent.add(b); return b; };
    const L = S.legs;   // null for the floating bosses
    const hipY = L ? L.hip : S.hover;
    const B = {};
    B.hips = bone(group, 0, hipY, 0);
    B.spine = bone(B.hips, 0, 0.6, 0);
    B.chest = bone(B.spine, 0, S.chestY, 0);
    B.neck = bone(B.chest, 0, S.neckY, S.neckZ || 0);
    B.head = bone(B.neck, 0, 0.6, 0.15);
    for (const [k, sx] of [['L', -1], ['R', 1]]) {
      B['sh' + k] = bone(B.chest, sx * S.shoulderX, S.shoulderY, 0);
      B['arm' + k] = bone(B['sh' + k], 0, 0, 0);
      B['fore' + k] = bone(B['arm' + k], 0, -S.upper, 0);
      B['hand' + k] = bone(B['fore' + k], 0, -S.fore, 0);
      if (L) {
        B['thigh' + k] = bone(B.hips, sx * L.hipX, 0, 0);
        B['shin' + k] = bone(B['thigh' + k], 0, -L.thigh, 0);
        B['foot' + k] = bone(B['shin' + k], 0, -L.shin, 0);   // the ankle: keeps the sole flat when the knee bends
      }
    }

    // a piece of armour on a bone: { geo, mat, at:[x,y,z], rot:[x,y,z], seams }
    const meshes = [];
    function piece(b, geo, at = [0, 0, 0], rot = [0, 0, 0], mat = plate, seamShare = 0.55) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...at); m.rotation.set(...rot);
      b.add(m); meshes.push(m);

      return m;
    }
    // data-block plates: instanced cubes with glowing edges, kept so they can be knocked off
    const blockList = [];
    const block = (b, x, y, z, s, r = 0) => blockList.push({ bone: b, local: new V(x, y, z), size: s, rot: r });

    // ---------- shared parts ----------
    function torso() {
      const W = S.chestW, D = S.chestD;
      piece(B.chest, cbox(W, S.chestH, D, 0.18, 1, S.waistTaper), [0, 0, 0]);
      // the abdomen and the pelvis
      piece(B.spine, cbox(W * 0.62, 1.6, D * 0.8, 0.2, 1.1, 0.9), [0, 0.2, 0]);
      piece(B.hips, cbox(W * 0.7, 1.3, D * 0.85, 0.2, 1, 0.8), [0, -0.3, 0]);
      // the core in a hex frame on the chest
      const core = new THREE.Group(); core.position.set(0, S.coreY || 0.3, D / 2 + 0.05); B.chest.add(core);
      piece(core, own(new THREE.CylinderGeometry(1.25, 1.25, 0.5, 6)), [0, 0, -0.1], [Math.PI / 2, 0, 0], dark, 0.9);
      const gem = new THREE.Mesh(own(new THREE.CylinderGeometry(0.95, 0.95, 0.6, 6)), glow(LIME));
      gem.rotation.x = Math.PI / 2; core.add(gem);
      // pectoral plates either side of the core, angled into a V, and a collar ridge
      for (const sx of [-1, 1]) {
        piece(B.chest, cbox(W * 0.4, S.chestH * 0.46, 0.6, 0.3, 0.9, 1), [sx * W * 0.27, S.chestH * 0.18, D / 2 + 0.1], [0.14, sx * 0.3, sx * -0.12]);
        piece(B.chest, cbox(W * 0.3, S.chestH * 0.28, 0.5, 0.3), [sx * W * 0.3, -S.chestH * 0.28, D / 2 + 0.02], [-0.1, sx * 0.25, sx * 0.1], dark);
        piece(B.chest, cbox(W * 0.22, S.chestH * 0.7, D * 0.7, 0.25), [sx * W * 0.47, 0.1, 0], [0, 0, sx * -0.12], dark);   // side plates
      }
      piece(B.chest, cbox(W * 0.55, 0.7, D * 0.9, 0.3, 0.7, 1), [0, S.chestH / 2 + 0.25, -0.1], [0, 0, 0], dark);
      // stacked ab plates and a hip skirt
      for (let i = 0; i < 3; i++) piece(B.spine, cbox(W * (0.5 - i * 0.04), 0.55, 0.5, 0.35), [0, 0.75 - i * 0.6, D * 0.42], [0.08, 0, 0]);
      for (const sx of [-1, 0, 1]) piece(B.hips, cbox(W * 0.26, 1.4, 0.4, 0.3, 1, 0.8), [sx * W * 0.24, -0.9, D * 0.42], [-0.12, sx * 0.25, 0]);
      return core;
    }
    function head() {
      const h = S.head;
      piece(B.neck, cbox(1.0, 0.9, 1.0, 0.3), [0, 0.1, 0], [0, 0, 0], dark, 0);
      piece(B.head, cbox(h * 1.05, h * 1.1, h * 1.15, 0.28, 0.82, 1), [0, h * 0.45, 0]);
      const vis = new THREE.Mesh(own(new THREE.BoxGeometry(h * 0.85, h * 0.16, 0.2)), glow('#ff3a2e'));
      vis.position.set(0, h * 0.52, h * 0.58); B.head.add(vis);
      piece(B.head, cbox(h * 0.9, h * 0.38, h * 0.5, 0.3), [0, h * 0.08, h * 0.42], [0.25, 0, 0]);   // jaw guard
    }
    function arm(k, o = {}) {
      const sx = k === 'L' ? -1 : 1, u = S.upper, f = S.fore, t = S.limb;
      const p = S.pauldron;
      piece(B['sh' + k], cbox(p[0], p[1], p[2], 0.2, 0.8, 1.05), [sx * p[0] * 0.18, p[1] * 0.25, 0], [0, 0, sx * -0.18]);
      piece(B['sh' + k], cbox(p[0] * 0.8, p[1] * 0.28, p[2] * 0.7, 0.3, 0.6, 1), [sx * p[0] * 0.22, p[1] * 0.85, 0], [0, 0, sx * -0.3], dark);   // ridge
      piece(B['sh' + k], cbox(p[0] * 0.7, p[1] * 0.55, 0.4, 0.3), [sx * p[0] * 0.2, p[1] * 0.2, p[2] * 0.52], [0.15, 0, sx * -0.18]);         // front plate
      if (o.wire) {
        piece(B['arm' + k], own(new THREE.CylinderGeometry(t * 0.5, t * 0.42, u, 8, 4)), [0, -u / 2, 0], [0, 0, 0], wire, 0);
        piece(B['fore' + k], own(new THREE.CylinderGeometry(t * 0.48, t * 0.36, f, 8, 4)), [0, -f / 2, 0], [0, 0, 0], wire, 0);
        piece(B['hand' + k], own(new THREE.BoxGeometry(S.fist * 0.8, S.fist * 0.9, S.fist * 0.7, 3, 3, 3)), [0, -S.fist * 0.45, 0], [0, 0, 0], wire, 0);
        return;
      }
      piece(B['arm' + k], cbox(t, u, t, 0.25, 0.9, 1), [0, -u / 2, 0]);
      piece(B['arm' + k], cbox(t * 0.85, t * 0.85, t * 0.85, 0.35), [0, -u, 0], [0, 0, 0], dark, 0);   // elbow
      piece(B['fore' + k], cbox(t * 1.25, f, t * 1.2, 0.2, 1.1, 0.85), [0, -f / 2, 0]);               // gauntlet
      piece(B['fore' + k], cbox(t * 1.45, f * 0.28, t * 1.4, 0.25), [0, -f * 0.82, 0], [0, 0, 0], dark);   // cuff
      piece(B['arm' + k], cbox(t * 1.1, u * 0.35, t * 1.15, 0.3), [0, -u * 0.25, 0], [0, 0, 0], dark);   // bicep band
      const F = S.fist * (o.fist || 1);
      piece(B['hand' + k], cbox(F, F * 0.95, F * 0.9, 0.22), [0, -F * 0.5, 0]);
      for (let i = 0; i < 3; i++) piece(B['hand' + k], cbox(F * 0.28, F * 0.35, F * 0.3, 0.3), [(i - 1) * F * 0.3, -F * 1.05, F * 0.15], [0.3, 0, 0], plate, 0.3);
    }
    function leg(k, o = {}) {
      const sx = k === 'L' ? -1 : 1, t = L.thick;
      if (o.wire) {
        piece(B['thigh' + k], own(new THREE.CylinderGeometry(t * 0.5, t * 0.4, L.thigh, 8, 4)), [0, -L.thigh / 2, 0], [0, 0, 0], wire, 0);
        piece(B['shin' + k], own(new THREE.CylinderGeometry(t * 0.42, t * 0.3, L.shin, 8, 4)), [0, -L.shin / 2, 0], [0, 0, 0], wire, 0);
        piece(B['foot' + k], own(new THREE.BoxGeometry(t * 0.9, 0.5, t * 1.4, 2, 1, 3)), [0, 0, 0.3], [0, 0, 0], wire, 0);
        return;
      }
      piece(B['thigh' + k], cbox(t * 1.15, L.thigh, t * 1.1, 0.22, 1.05, 0.85), [0, -L.thigh / 2, 0]);
      piece(B['thigh' + k], cbox(t * 0.95, t * 0.8, t * 0.95, 0.35), [0, -L.thigh, 0.1], [0, 0, 0], dark, 0);
      piece(B['shin' + k], cbox(t, L.shin, t * 1.05, 0.22, 0.95, 1.15), [0, -L.shin / 2, 0]);
      piece(B['foot' + k], cbox(t * 1.15, 0.6, t * 1.7, 0.25, 0.9, 1), [0, 0.25, 0.35]);   // foot
      piece(B['shin' + k], cbox(t * 0.9, t * 0.7, 0.5, 0.3), [0, -L.thigh * 0.05, t * 0.55], [0.2, 0, 0]);  // knee guard
      piece(B['thigh' + k], cbox(t * 1.0, L.thigh * 0.6, 0.45, 0.3, 0.8, 1), [0, -L.thigh * 0.4, t * 0.58], [-0.05, 0, 0], dark);
      piece(B['shin' + k], cbox(t * 0.85, L.shin * 0.55, 0.4, 0.3, 1, 0.8), [0, -L.shin * 0.45, t * 0.55], [0.05, 0, 0]);
    }

    // ---------- the six bosses ----------
    const core = torso();
    head();
    const extra = { steam: [], fall: [], tail: null };
    if (id === 'half') {
      // the right half is bare wireframe: no right arm armour, a wire overlay on the right of the body
      arm('L'); arm('R', { wire: true });
      leg('L'); leg('R', { wire: true });
      const w = S.chestW;
      piece(B.chest, own(new THREE.BoxGeometry(w * 0.48, S.chestH * 0.95, S.chestD * 1.02, 3, 6, 3)), [w * 0.26, 0, 0], [0, 0, 0], wire, 0);
      for (let i = 0; i < 40; i++) block(B.chest, rnd(-0.2, w * 0.7), rnd(-3, 3), rnd(-1, S.chestD / 2 + 1.2), rnd(0.12, 0.3), rnd(0, 3));
    } else {
      arm('L', { fist: S.fistL }); arm('R', { fist: S.fistR });
      if (L) { leg('L'); leg('R'); }
    }
    if (id === 'warden') {
      // crown of spikes, a long blade in the right hand and a shield of stacked data blocks on the left
      for (let i = 0; i < 7; i++) {
        const sp = piece(B.head, own(new THREE.ConeGeometry(0.16, 1.4 + (3 - Math.abs(i - 3)) * 0.45, 4)), [(i - 3) * 0.28, S.head * 1.15 + 0.5, -0.1], [-(0.15), 0, (i - 3) * -0.12], dark, 0);
        sp.scale.y = 1;
      }
      const blade = new THREE.Group(); blade.position.set(0, -S.fist * 0.6, 0); blade.rotation.x = Math.PI * 0.5; B.handR.add(blade);
      piece(blade, cbox(0.32, 9, 0.9, 0.1, 0.3, 1), [0, 4.6, 0], [0, 0, 0], dark, 0.2);
      const edge = new THREE.Mesh(own(new THREE.BoxGeometry(0.1, 8.4, 0.2)), glow(LIME)); edge.position.set(0, 4.6, 0.48); blade.add(edge);
      piece(blade, cbox(0.5, 0.5, 2.2, 0.2), [0, 0, 0], [0, 0, 0], plate, 0.5);   // guard
      for (let y = 0; y < 9; y++) for (let x = 0; x < 3; x++) if (rnd() < 0.85) block(B.foreL, -1.6 + rnd(-0.15, 0.15), 1.4 - y * 0.95, -0.8 + x * 0.95 + rnd(-0.1, 0.1), 0.9, 0);
    }
    if (id === 'colossus') {
      // the lower body falls apart into data blocks, and a tail of armoured segments curls behind
      for (let i = 0; i < 130; i++) {
        const y = rnd(-hipY + 0.2, -0.6), k = (y + hipY) / hipY, r = S.chestW * 0.32 * (0.25 + k);
        const a = rnd(0, Math.PI * 2);
        const bb = { b: B.hips, x: Math.cos(a) * r * rnd(0.2, 1), y, z: Math.sin(a) * r * 0.7, s: 0.2 + k * 0.5 };
        block(B.hips, bb.x, bb.y, bb.z, bb.s, rnd(0, 3));
        extra.fall.push(blockList.length - 1);
      }
      const tail = new THREE.Group(); B.hips.add(tail); extra.tail = tail;
      let prev = new V(0, -0.5, -1.6);
      for (let i = 0; i < 16; i++) {
        const t = i / 15, p = new V(Math.sin(t * 2.4) * 2.5 * t + t * 3, -0.5 - Math.sin(t * Math.PI) * 3.2 - t * 1.2, -1.6 - t * 7);
        const s = 1.1 - t * 0.6;
        const m = piece(tail, cbox(s, s * 0.8, s * 1.1, 0.25), [p.x, p.y, p.z], [0, 0, 0], plate, 0.4);
        m.lookAt(prev.x + tail.position.x, prev.y, prev.z); prev = p;
      }
    }
    if (id === 'king') {
      // the throne behind and under him, a tall crest and a cape of cables
      const th = new THREE.Group(); group.add(th);
      piece(th, cbox(S.chestW * 1.5, 3.6, 4.2, 0.12), [0, 1.8, -0.8]);                    // seat block
      piece(th, cbox(S.chestW * 1.45, 9, 1.4, 0.12, 0.85, 1), [0, 7.6, -2.8]);           // back
      for (const sx of [-1, 1]) piece(th, cbox(1.6, 2.4, 4.4, 0.15), [sx * S.chestW * 0.72, 4.2, -0.6]);   // arm rests
      for (let i = 0; i < 9; i++) piece(B.head, cbox(0.32, 1.2 + (4 - Math.abs(i - 4)) * 0.55, 0.9, 0.3), [(i - 4) * 0.3, S.head * 1.2 + (4 - Math.abs(i - 4)) * 0.25, -0.2], [-0.25, 0, 0], dark, 0.4);
      const cape = new THREE.Group(); B.chest.add(cape);
      for (let c = 0; c < 9; c++) {
        const x = (c - 4) * 0.75;
        for (let i = 0; i < 12; i++) piece(cape, cbox(0.62, 0.7, 0.62, 0.35), [x * (1 + i * 0.04), S.shoulderY - 0.4 - i * 0.72, -S.chestD / 2 - 0.5 - i * 0.12 - Math.abs(x) * 0.08], [0.1, 0, 0], i % 3 ? dark : plate, i % 4 ? 0 : 0.6);
      }
    }
    if (id === 'brute') {
      // vents on the back pouring green steam, cracks in the armour leaking light
      for (const sx of [-1, 1]) {
        piece(B.chest, own(new THREE.CylinderGeometry(0.6, 0.7, 1.6, 8)), [sx * 1.6, S.chestH / 2 + 0.6, -S.chestD * 0.3], [-0.3, 0, 0], dark, 0.6);
        const ring = new THREE.Mesh(own(new THREE.TorusGeometry(0.62, 0.08, 6, 16)), glow(LIME)); ring.position.set(sx * 1.6, S.chestH / 2 + 1.45, -S.chestD * 0.3 - 0.25); ring.rotation.x = Math.PI / 2 - 0.3; B.chest.add(ring);
        extra.steam.push(new V(sx * 1.6, S.chestH / 2 + 1.6, -S.chestD * 0.3 - 0.3));
      }
    }

    // general plates and peeling blocks for everyone but the Warden's shield
    for (let i = 0; i < S.plates; i++) {
      const sx = rnd() < 0.5 ? -1 : 1, kk = sx < 0 ? 'L' : 'R';
      if (id === 'half' && kk === 'R') continue;
      const p = S.pauldron;
      block(B['sh' + kk], sx * rnd(0, p[0] * 0.45), p[1] * rnd(0.4, 0.75), rnd(-p[2] * 0.4, p[2] * 0.4), rnd(0.35, 0.6), rnd(0, 1));
    }
    for (let i = 0; i < S.floaters; i++) {
      const sx = rnd() < 0.5 ? -1 : 1, kk = sx < 0 ? 'L' : 'R';
      block(B['sh' + kk], sx * rnd(1, 2.6), rnd(2, 3.6), rnd(-1, 1), rnd(0.25, 0.45), rnd(0, 3));
    }

    // ---------- the data blocks as one instanced mesh ----------
    const blockMat = own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: G.clone() }, uFill: { value: new THREE.Color('#0b1410') } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform vec3 uFill; varying vec2 vUv;
        void main(){ vec2 e = min(vUv, 1.0 - vUv); float d = min(e.x, e.y);
          float edge = smoothstep(0.1, 0.03, d); float inner = smoothstep(0.24, 0.2, d) * 0.15;
          gl_FragColor = vec4(uFill + uCol * (edge * 1.8 + inner), 1.0); }`,
    }));
    const blockMesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), blockMat, Math.max(1, blockList.length));
    blockMesh.frustumCulled = false;
    group.add(blockMesh);
    const _o = new THREE.Object3D(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
    function placeBlocks(t) {
      group.updateMatrixWorld(true);
      _inv.copy(group.matrixWorld).invert();
      blockList.forEach((b, i) => {
        _o.position.copy(b.local);
        if (b.fallK != null) { _o.position.y -= ((t * 0.6 + b.fallK) % 1) * 1.2; }
        _o.rotation.set(b.rot * 0.7 + (b.spin ? t * b.spin : 0), b.rot, b.rot * 0.4);
        _o.scale.setScalar(b.size);
        _o.updateMatrix();
        _m.multiplyMatrices(b.bone.matrixWorld, _o.matrix).premultiply(_inv);
        blockMesh.setMatrixAt(i, _m);
      });
      blockMesh.count = blockList.length;
      blockMesh.instanceMatrix.needsUpdate = true;
    }
    for (const i of extra.fall) { blockList[i].fallK = rnd(0, 1); blockList[i].spin = rnd(-1, 1); }

    // the core's glow
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
    { const g = glowCv.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }
    const glowTex = own(new THREE.CanvasTexture(glowCv));
    const coreGlow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: G, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 })));
    coreGlow.scale.setScalar(4.2); coreGlow.position.z = 0.6; core.add(coreGlow);
    const steam = extra.steam.map(at => {
      const ps = Array.from({ length: 8 }, (_, i) => {
        const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: G.clone().multiplyScalar(0.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 })));
        B.chest.add(s); return { s, k: i / 8 };
      });
      return { at, ps };
    });

    // ---------- poses ----------
    // each pose is bone rotations in radians [x, y, z]; the rest stay at 0
    const POSES = posesFor(id, S);
    const cur = {};
    for (const k in B) cur[k] = new THREE.Euler();
    function pose(name, k = 1) {
      const P = POSES[name] || POSES.idle;
      for (const b in B) {
        const r = P[b] || P._zero || [0, 0, 0];
        const want = r === P._zero ? [0, 0, 0] : r;
        B[b].rotation.x += (want[0] - B[b].rotation.x) * k;
        B[b].rotation.y += (want[1] - B[b].rotation.y) * k;
        B[b].rotation.z += (want[2] - B[b].rotation.z) * k;
      }
      if (P._hips) B.hips.position.y = hipY + P._hips;
      plantFeet();
    }

    // keep standing feet on the floor: when a pose lowers the hips, bend hip and knee (two-bone solve in the
    // leg's own plane) so the ankle lands on y = 0 instead of going through the floor
    let restLow = null;
    function plantFeet() {
      if (!L || id === 'king') return;
      const a = L.thigh, c = L.shin, hy = B.hips.position.y;
      const legBox = new THREE.Box3(), tmp = new THREE.Box3(), o = new V(), sc = new V();
      // lowest point of a foot's sole, in the boss's own units above its floor
      const lowest = k => {
        group.updateMatrixWorld(true); legBox.makeEmpty();
        B['foot' + k].traverse(m => { if (m.isMesh && m.geometry) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); legBox.union(tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)); } });
        group.getWorldPosition(o); group.getWorldScale(sc);
        return (legBox.min.y - o.y) / sc.y;
      };
      if (!restLow) restLow = { L: lowest('L'), R: lowest('R') };   // first call happens at rest: the feet's own depth
      for (const k of ['L', 'R']) {
        const th = B['thigh' + k], sh = B['shin' + k], ft = B['foot' + k];
        const level = () => ft.rotation.set(-(th.rotation.x + sh.rotation.x), 0, -(th.rotation.z + sh.rotation.z));
        level();
        let ta = 0;                                             // ankle height to aim for
        for (let it = 0; it < 5; it++) {
          const low = lowest(k);
          if (low >= restLow[k] - 0.03) break;                  // no lower than at rest: leave the pose alone
          if (it > 0) ta += restLow[k] - low;                               // armour still under the floor: raise the ankle
          const ank = new V(0, -c, 0).applyEuler(sh.rotation).add(sh.position).applyEuler(th.rotation);   // hips space
          // the leg swings out by the thigh's z angle, so it bends in a tilted plane: work with its height there
          const cz = Math.cos(th.rotation.z), A = a * cz, C = c * cz;
          const drop = Math.max(0.05, hy - ta), dz = ank.z;
          const r = Math.min(Math.hypot(drop, dz), A + C - 1e-3);
          const phi = Math.atan2(dz, drop);
          const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, (A * A + C * C - r * r) / (2 * A * C))));
          const al = Math.acos(Math.max(-1, Math.min(1, (A * A + r * r - C * C) / (2 * A * r))));
          th.rotation.x = -(phi + al); sh.rotation.x = knee; sh.rotation.z = 0;
          level();
        }
      }
    }
    plantFeet();                                          // measure the feet at rest first
    pose('idle', 1);
    // set the bones from idle blended toward each [name, weight] in turn; bones a pose leaves
    // out keep their idle angle, so a strike pose only moves what it names
    const Z3 = [0, 0, 0];
    function mix(list) {
      const I = POSES.idle;
      let hy = I._hips || 0;
      for (const b in B) { const r = I[b] || Z3; B[b].rotation.set(r[0], r[1], r[2]); }
      for (const [n, w] of list) {
        const P = POSES[n];
        if (!P || !(w > 0)) continue;
        for (const b in B) { const r = P[b] || I[b] || Z3, o = B[b].rotation; o.x += (r[0] - o.x) * w; o.y += (r[1] - o.y) * w; o.z += (r[2] - o.z) * w; }
        hy += ((P._hips || 0) - hy) * w;
      }
      B.hips.position.y = hipY + hy;
      plantFeet();
    }

    let clock = 0;
    function update(t, dt = 0) {
      clock = t;
      // breathing and the core's pulse
      B.chest.position.y = S.chestY + Math.sin(t * 1.6) * 0.06;
      const pulse = 0.85 + 0.15 * Math.sin(t * 3.2);
      coreGlow.scale.setScalar(4.2 * pulse);
      if (L == null) group.position.y = (opts.y || 0) + Math.sin(t * 0.9) * 0.25;
      if (extra.tail) extra.tail.rotation.y = Math.sin(t * 0.8) * 0.18;
      for (const st of steam) for (const p of st.ps) {
        const u = (t * 0.45 + p.k) % 1;
        p.s.position.copy(st.at).add(new V(Math.sin(u * 6 + p.k * 9) * 0.3, u * 4.5, -u * 1.5));
        p.s.scale.setScalar(0.8 + u * 3.2); p.s.material.opacity = 0.55 * (1 - u);
      }
      placeBlocks(t);
    }
    update(0);

    group.scale.setScalar(opts.scale || 1);
    // the armour meshes by body part, for hit points and debris (js/app/boss3d.js)
    const partOf = m => {
      for (let o = m.parent; o; o = o.parent) {
        if (o === B.head || o === B.neck) return 'head';
        if (o === B.shL) return 'armL';
        if (o === B.shR) return 'armR';
        if (o === B.thighL || o === B.thighR) return 'legs';
      }
      return 'torso';
    };
    const parts = { head: [], torso: [], armL: [], armR: [], legs: [] };
    for (const m of meshes) if (m.material !== wire && m.geometry) { m.geometry.computeBoundingBox(); parts[partOf(m)].push(m); }
    blockList.forEach(b => { b.size0 = b.size; });
    return {
      group, bones: B, core, pose, mix, update, POSES, parts, meshes,
      // hide the data-block plates as health drops: f is the share of health left
      plates(f) { blockList.forEach((b, i) => { if (b.fallK == null) b.size = ((i * 0.6180339) % 1) < f + 0.05 ? b.size0 : 0; }); },
      blocks: { mesh: blockMesh, list: blockList },
      height: S.height,
      dispose() { keep.forEach(x => x.dispose && x.dispose()); },
    };
  }

  // ---------- proportions (units: the old boss stood about 16 tall) ----------
  const BOSSES = {
    siege: { height: 15, legs: { hip: 4.2, hipX: 1.9, thigh: 2.2, shin: 2.0, thick: 1.6 }, chestY: 2.6, chestW: 6.2, chestH: 4.6, chestD: 3.6, waistTaper: 0.65,
      neckY: 2.2, neckZ: 0.9, head: 1.9, shoulderX: 3.9, shoulderY: 1.4, pauldron: [3.6, 3.2, 3.6], upper: 3.2, fore: 3.0, limb: 1.6, fist: 2.6, plates: 16, floaters: 6 },
    warden: { height: 18, legs: { hip: 6.6, hipX: 1.3, thigh: 3.3, shin: 3.2, thick: 1.15 }, chestY: 2.4, chestW: 4.6, chestH: 4.2, chestD: 2.6, waistTaper: 0.62,
      neckY: 2.3, head: 1.5, shoulderX: 3.0, shoulderY: 1.4, pauldron: [2.4, 1.9, 2.4], upper: 3.0, fore: 2.8, limb: 1.05, fist: 1.3, plates: 8, floaters: 4 },
    colossus: { height: 16, legs: null, hover: 5.2, chestY: 2.6, chestW: 6.0, chestH: 4.8, chestD: 3.4, waistTaper: 0.6,
      neckY: 2.3, neckZ: 0.6, head: 1.8, shoulderX: 3.8, shoulderY: 1.5, pauldron: [3.4, 3.4, 3.4], upper: 3.4, fore: 3.2, limb: 1.45, fist: 2.3, plates: 12, floaters: 8 },
    king: { height: 15, legs: { hip: 3.8, hipX: 1.5, thigh: 2.4, shin: 2.6, thick: 1.3 }, chestY: 2.5, chestW: 5.4, chestH: 4.4, chestD: 3.0, waistTaper: 0.66,
      neckY: 2.2, head: 1.7, shoulderX: 3.5, shoulderY: 1.4, pauldron: [2.9, 2.5, 2.9], upper: 3.0, fore: 2.8, limb: 1.3, fist: 2.0, fistL: 1.0, fistR: 1.55, plates: 10, floaters: 4, metal: '#4a5258' },
    half: { height: 16, legs: { hip: 5.8, hipX: 1.3, thigh: 2.9, shin: 2.8, thick: 1.25 }, chestY: 2.4, chestW: 4.8, chestH: 4.2, chestD: 2.8, waistTaper: 0.62,
      neckY: 2.2, head: 1.6, shoulderX: 3.1, shoulderY: 1.4, pauldron: [2.5, 2.0, 2.5], upper: 3.0, fore: 2.8, limb: 1.2, fist: 1.5, plates: 8, floaters: 3 },
    brute: { height: 14, legs: { hip: 3.6, hipX: 1.8, thigh: 2.0, shin: 1.8, thick: 1.6 }, chestY: 2.6, chestW: 6.0, chestH: 4.6, chestD: 3.8, waistTaper: 0.6,
      neckY: 1.9, neckZ: 1.2, head: 1.7, shoulderX: 3.8, shoulderY: 1.3, pauldron: [3.2, 2.8, 3.2], upper: 3.8, fore: 3.8, limb: 1.6, fist: 2.4, plates: 14, floaters: 6, seam: 2.2 },
  };

  // ---------- poses per boss ----------
  function posesFor(id, S) {
    const base = {
      idle: { armL: [0, 0, -0.32], armR: [0, 0, 0.32], foreL: [-0.35, 0, 0], foreR: [-0.35, 0, 0], chest: [0.08, 0, 0], thighL: [0, 0, -0.08], thighR: [0, 0, 0.08] },
      windup: { chest: [-0.15, -0.35, 0], armR: [-2.7, 0, 0.5], foreR: [-0.6, 0, 0], armL: [0.6, 0, -0.5], foreL: [-0.7, 0, 0], head: [0.15, 0.2, 0], thighL: [-0.2, 0, -0.12], thighR: [0.25, 0, 0.12], shinL: [0.3, 0, 0] },
      // attack wind-ups and strikes for the World Boss (js/app/boss3d.js blends them on the attack clock)
      raise: { chest: [-0.32, 0, 0], spine: [-0.12, 0, 0], armL: [-2.85, 0, -0.3], armR: [-2.85, 0, 0.3], foreL: [-0.8, 0, 0], foreR: [-0.8, 0, 0], head: [-0.35, 0, 0], thighL: [-0.1, 0, -0.22], thighR: [-0.1, 0, 0.22], shinL: [0.2, 0, 0], shinR: [0.2, 0, 0], _hips: 0.5 },
      pull: { spine: [0, 0.2, 0], chest: [0.05, 0.45, 0], armR: [0, 0.55, 1.4], foreR: [-0.262, 0, 0], armL: [-0.785, 0, -0.262], foreL: [-0.873, 0, 0], head: [0, -0.5, 0], thighL: [-0.25, 0, -0.3], thighR: [0.2, 0, 0.3], shinL: [0.35, 0, 0], _hips: -0.4 },
      coil: { chest: [-0.1, -0.35, 0], armR: [0.95, 0, 0.3], foreR: [-2.3, 0, 0], armL: [-1.0, 0, -0.3], foreL: [-1.2, 0, 0], thighL: [-0.55, 0, -0.15], shinL: [0.7, 0, 0], thighR: [0.45, 0, 0.15], shinR: [0.4, 0, 0], _hips: -0.8 },
      punch: { chest: [0.5, 0.4, 0], spine: [0.15, 0, 0], armR: [-1.6, 0, 0.1], foreR: [-0.05, 0, 0], armL: [1.0, 0, -0.3], foreL: [-2.4, 0, 0], head: [-0.35, -0.2, 0], thighL: [-0.8, 0, -0.12], shinL: [0.55, 0, 0], thighR: [0.55, 0, 0.12], shinR: [0.6, 0, 0], _hips: -0.7 },
      beam: { chest: [-0.5, 0, 0], spine: [-0.18, 0, 0], armL: [0.55, 0, -1.35], armR: [0.55, 0, 1.35], foreL: [-0.35, 0, 0], foreR: [-0.35, 0, 0], head: [-0.05, 0, 0], thighL: [0, 0, -0.3], thighR: [0, 0, 0.3], shinL: [0.1, 0, 0], shinR: [0.1, 0, 0], _hips: -0.4 },
      point: { chest: [0.1, 0.3, 0], armR: [-1.55, 0.2, 0.2], foreR: [-0, 0, 0], armL: [0.2, 0, -0.5], head: [-0.1, 0.25, 0] },
      roar: { chest: [-0.45, 0, 0], spine: [-0.15, 0, 0], head: [-0.65, 0, 0], armL: [-0.3, 0, -1.55], armR: [-0.3, 0, 1.55], foreL: [-1.3, 0, 0], foreR: [-1.3, 0, 0], thighL: [0, 0, -0.3], thighR: [0, 0, 0.3], _hips: 0.1 },
      guard: { chest: [0.3, 0, 0], armL: [-0.95, 0, 0.38], foreL: [-1.7, 0, 0], armR: [-0.95, 0, -0.38], foreR: [-1.7, 0, 0], head: [0.2, 0, 0], thighL: [-0.4, 0, -0.25], thighR: [-0.4, 0, 0.25], shinL: [0.6, 0, 0], shinR: [0.6, 0, 0], _hips: -0.9 },
      reel: { chest: [-0.5, 0.25, 0.12], head: [-0.55, 0.35, 0], armL: [0.35, 0, -0.85], armR: [0.45, 0, 0.95], foreL: [-0.2, 0, 0], foreR: [-0.25, 0, 0], thighL: [0.3, 0, -0.2], thighR: [-0.45, 0, 0.2], shinR: [0.6, 0, 0] },
      fall: { chest: [0.55, 0, 0.12], spine: [0.6, 0, 0], head: [0.5, 0.2, 0], armL: [-0.3, 0, -0.25], foreL: [-0.3, 0, 0], armR: [-0.9, 0, 0.35], foreR: [-0.4, 0, 0], thighL: [-1.55, 0, -0.2], shinL: [1.6, 0, 0], thighR: [0.25, 0, 0.25], shinR: [2.3, 0, 0], _hips: -3.6 },
    };
    Object.assign(base, {
      slam: { chest: [0.62, 0, 0], spine: [0.25, 0, 0], armL: [-1.55, 0, 0.32], armR: [-1.55, 0, -0.32], foreL: [-0.25, 0, 0], foreR: [-0.25, 0, 0], head: [-0.45, 0, 0], thighL: [-0.65, 0, -0.28], thighR: [-0.65, 0, 0.28], shinL: [0.95, 0, 0], shinR: [0.95, 0, 0], _hips: -1.15 },
      sweep: { spine: [0, -0.3, 0], chest: [0.15, -0.35, 0], armR: [0, -1.35, 1.4], foreR: [-0.262, 0, 0], armL: [0.436, 0, -0.785], foreL: [-0.611, 0, 0], head: [0, 0.55, 0], thighL: [-0.2, 0, -0.3], thighR: [0.15, 0, 0.3], _hips: -0.5 },
    });
    if (id === 'siege') base.idle = { ...base.idle, chest: [0.32, 0, 0], head: [-0.25, 0, 0], armL: [0.15, 0, -0.38], armR: [0.15, 0, 0.38], thighL: [0, 0, -0.2], thighR: [0, 0, 0.2], shinL: [0, 0, 0], shinR: [0, 0, 0] };
    if (id === 'warden') base.idle = { ...base.idle, armL: [-0.55, 0.4, -0.25], foreL: [-0.9, 0, 0], armR: [0.1, 0, 0.22], foreR: [-0.6, 0, 0] };
    if (id === 'colossus') base.idle = { ...base.idle, chest: [0.18, 0, 0], armL: [0.2, 0, -0.55], armR: [0.2, 0, 0.55], foreL: [-0.6, 0, 0], foreR: [-0.6, 0, 0] };
    if (id === 'king') base.idle = { ...base.idle, thighL: [-1.5, 0, -0.15], thighR: [-1.5, 0, 0.15], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], armL: [-0.75, 0, -0.35], armR: [-0.75, 0, 0.35], foreL: [-0.6, 0, 0], foreR: [-0.6, 0, 0], chest: [-0.05, 0, 0] };
    if (id === 'brute') base.idle = { ...base.idle, chest: [0.6, 0, 0], spine: [0.25, 0, 0], head: [-0.65, 0, 0], armL: [0.05, 0, -0.32], armR: [0.05, 0, 0.32], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], thighL: [-0.35, 0, -0.25], thighR: [-0.35, 0, 0.25], shinL: [0.45, 0, 0], shinR: [0.45, 0, 0], _hips: -0.3 };
    return base;
  }

  return { create, BOSSES, IDS: Object.keys(BOSSES) };
})();
