// BossKit: the armoured titans (design/bosses/, from Gid's Gemini concepts, 24 Nov 2026).
// One rigged skeleton and one kit of parts (faceted armour, glowing seams, data-block plates,
// the chest core, the red visor, cables), and six bosses built from it:
//   siege   Siege Titan        hunched, huge shoulders and fists, short legs
//   warden  Firewall Warden    a tall knight with a blade and a shield of data blocks
//   colossus Data Colossus     floats, lower body breaking into blocks, a cable tail
//   king    Kernel King        sits on a throne with a cable cape and giant gauntlets
//   half    Half-Compiled      one side armour, the other a bare wireframe body
//   brute   Overclocked Brute  gorilla stance, cracked armour, steam vents
//   syntax  Syntax Error       the World Boss (Gemini sheet, 25 Nov 2026): gunmetal armour with red
//                              seams, horns and a V visor, a red triangle core, open claws, and no
//                              legs: it floats on a cluster of shards
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
    const S0 = BOSSES[id] || BOSSES.siege;
    const S = { ...S0, ...(opts.detail && S0.rich ? S0.rich : {}), ...(opts.glow ? { glow: opts.glow } : {}) };
    const G = new THREE.Color(S.glow || LIME), RED = new THREE.Color('#ff3a2e');
    // the rich build (Boss Rush, opts.detail): layered armour with panel lines, bolts, cables, vents and each
    // titan's own parts, materials with real roughness and metal, merged per bone so the detail costs few draw
    // calls. Syntax Error and the World Boss keep the plain build.
    const RICH = !!opts.detail && id !== 'syntax';
    const U = { pulse: { value: 0 }, seam: { value: G.clone() }, heat: { value: 0 } };   // shared by every rich material

    // ---------- materials ----------
    // panel lines: glowing grooves drawn in each piece's own space, broken up so they read
    // as circuit seams rather than a grid (the look of the Gemini concepts)
    function seamed(m, k = 1) {
      if (RICH) return richSeamed(m, k);
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
    // the rich version: dark panel grooves round every plate, a little colour and roughness variation per
    // panel so the light breaks up across the armour, the glowing circuit seams, and cracks for the Brute.
    // uPulse brightens the seams through a wind-up, uHeat makes the cracks glow.
    function richSeamed(m, k = 1) {
      const seed = rnd(0, 50);
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, { uSeam: U.seam, uPulse: U.pulse, uHeat: U.heat, uSeed: { value: seed }, uK: { value: (S.seam || 1.0) * k * 0.55 }, uCrack: { value: S.cracks ? k : 0 } });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vSN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSP = position; vSN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vSP; varying vec3 vSN; uniform vec3 uSeam; uniform float uSeed, uK, uPulse, uHeat, uCrack;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + 1.0), f.x), f.y); }
          vec2 projU(){ vec3 n = abs(normalize(vSN)); return n.x > n.y && n.x > n.z ? vSP.yz : n.y > n.z ? vSP.xz : vSP.xy; }
          // x: the glowing circuit line, y: the dark groove (panel edges and beside the circuit), z: the panel's own random
          vec3 panel(vec2 u){
            vec2 g = u * vec2(0.62, 0.5) + vec2(uSeed * 0.37, uSeed * 0.11); vec2 c = floor(g); vec2 f = fract(g);
            float r = h21(c), ox = abs(f.x - 0.3 - 0.4 * h21(c + 3.1)), oy = abs(f.y - 0.3 - 0.4 * h21(c + 5.7));
            float glow = max((1.0 - smoothstep(0.012, 0.03, ox)) * step(0.62, r), (1.0 - smoothstep(0.012, 0.03, oy)) * step(r, 0.3));
            vec2 e = min(f, 1.0 - f);
            float groove = 1.0 - smoothstep(0.004, 0.03, min(e.x, e.y));
            groove = max(groove, 0.75 * max((1.0 - smoothstep(0.03, 0.065, ox)) * step(0.62, r), (1.0 - smoothstep(0.03, 0.065, oy)) * step(r, 0.3)));
            return vec3(glow, groove, r);
          }
          #ifdef CRACKS
          float crack(vec2 u){
            vec2 p = u * 0.85 + uSeed; vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 q = o + vec2(h21(i + o), h21(i + o + 7.3)) - f; float d = dot(q, q); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
            return (1.0 - smoothstep(0.0, 0.05, sqrt(d2) - sqrt(d1))) * step(0.45, h21(i + 2.2));
          }
          #endif`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 sU = projU(); vec3 pn = panel(sU); float wn = vn(sU * 2.3 + uSeed);
          diffuseColor.rgb *= (0.8 + 0.32 * pn.z) * (1.0 - 0.62 * pn.y) * (0.88 + 0.24 * wn) * (0.72 + 0.28 * (normalize(vSN).y * 0.5 + 0.5));`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor * (0.72 + 0.56 * wn) + pn.y * 0.25, 0.08, 1.0);`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float ck = 0.0;
            #ifdef CRACKS
            ck = crack(sU) * uCrack;
            #endif
            totalEmissiveRadiance += uSeam * uK * (pn.x * (1.0 + uPulse * 2.2) + ck * (0.35 + uHeat * 1.4 + uPulse)); }`);
        if (S.cracks) sh.fragmentShader = '#define CRACKS\n' + sh.fragmentShader;
      };
      m.customProgramCacheKey = () => 'bosskit-rich' + (S.cracks ? '-cracks' : '');
      return m;
    }
    const envOpt = opts.env ? { envMap: opts.env, envMapIntensity: 1 } : {};
    // the environment map lights only the polished trim: on the broad plates its two extra lookups a pixel
    // cost more than they showed on slow machines, and the hemisphere and rim lights give the plates their colour
    const plate = own(seamed(new THREE.MeshStandardMaterial(RICH ? { color: S.metal || '#4f5962', metalness: 0.45, roughness: 0.5, flatShading: true }
      : { color: S.metal || '#4f5962', metalness: 0.5, roughness: 0.55, flatShading: true })));
    const dark = own(seamed(new THREE.MeshStandardMaterial(RICH ? { color: S.dark || '#272e34', metalness: 0.6, roughness: 0.45, flatShading: true }
      : { color: S.dark || '#272e34', metalness: 0.6, roughness: 0.5, flatShading: true }), 0.6));
    // rich only: polished trim in the titan's own metal, and plain parts (rubber cables, bolts) with no seams
    const trim = RICH ? own(new THREE.MeshStandardMaterial({ color: S.trim || '#9aa3ab', metalness: 0.95, roughness: 0.26, flatShading: true, ...envOpt })) : plate;
    const rubber = RICH ? own(new THREE.MeshLambertMaterial({ color: '#15181b' })) : dark;
    const seam = own(new THREE.LineBasicMaterial({ color: G.clone().multiplyScalar(S.seam || 1.6), transparent: true, opacity: 0.9, toneMapped: false }));
    const glowCache = {};
    const glow = c => {
      if (!RICH) return own(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.6), toneMapped: false }));
      const key = new THREE.Color(c).getHexString();   // the rich build shares one material per colour, so its glow parts merge
      return glowCache[key] ||= own(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.6), toneMapped: false }));
    };
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

    let coreMat = null;   // the rich build's core gem, dimmer than the seams so the chest still reads round it
    // ---------- shared parts ----------
    function torso() {
      const W = S.chestW, D = S.chestD;
      piece(B.chest, cbox(W, S.chestH, D, 0.18, 1, S.waistTaper), [0, 0, 0]);
      // the abdomen and the pelvis
      piece(B.spine, cbox(W * 0.62, 1.6, D * 0.8, 0.2, 1.1, 0.9), [0, 0.2, 0]);
      piece(B.hips, cbox(W * 0.7, 1.3, D * 0.85, 0.2, 1, 0.8), [0, -0.3, 0]);
      // the core in a hex frame on the chest
      const core = new THREE.Group(); core.position.set(0, S.coreY || 0.3, D / 2 + 0.05); B.chest.add(core);
      const sides = S.tri ? 3 : 6;   // Syntax Error's core is an inverted triangle
      const fr = piece(core, own(new THREE.CylinderGeometry(S.tri ? 1.55 : 1.25, S.tri ? 1.55 : 1.25, 0.5, sides)), [0, 0, -0.1], [Math.PI / 2, 0, 0], dark, 0.9);
      const gem = new THREE.Mesh(own(new THREE.CylinderGeometry(S.tri ? 1.05 : 0.95, S.tri ? 1.05 : 0.95, 0.6, sides)), RICH ? (coreMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(S.glow || LIME).multiplyScalar(1.5), toneMapped: false }))) : glow(S.glow || LIME));
      gem.rotation.x = Math.PI / 2; core.add(gem);
      // a three-sided cylinder turned to face forward already has a vertex pointing down: the inverted triangle
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
      if (S.horns) {
        // a narrow helmet, two horns swept up and back, a V visor and a brow ridge
        piece(B.neck, cbox(1.1, 0.9, 1.1, 0.3), [0, 0.1, 0], [0, 0, 0], dark, 0);
        piece(B.head, cbox(h * 0.95, h * 1.05, h * 1.1, 0.3, 0.7, 1), [0, h * 0.45, 0]);
        piece(B.head, cbox(h * 1.05, h * 0.3, h * 0.6, 0.3, 0.8, 1), [0, h * 0.78, h * 0.32], [0.2, 0, 0], dark);
        piece(B.head, cbox(h * 0.85, h * 0.42, h * 0.45, 0.3, 1, 0.6), [0, h * 0.1, h * 0.45], [0.15, 0, 0]);
        for (const sx of [-1, 1]) {
          piece(B.head, own(new THREE.ConeGeometry(h * 0.16, h * 0.85, 4)), [sx * h * 0.38, h * 1.12, -h * 0.05], [-0.35, 0, sx * -0.38], dark, 0);
          const v = new THREE.Mesh(own(new THREE.BoxGeometry(h * 0.42, h * 0.1, 0.18)), glow(S.glow || '#ff3a2e'));
          v.position.set(sx * h * 0.2, h * 0.5, h * 0.58); v.rotation.z = sx * 0.32; B.head.add(v);
        }
        return;
      }
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
      if (S.bands) for (const y of [0.25, 0.62]) {   // glowing bands around the gauntlet
        const b = new THREE.Mesh(own(new THREE.BoxGeometry(t * 1.32, 0.14, t * 1.28)), glow(S.glow));
        b.position.set(0, -f * y, 0); B['fore' + k].add(b);
      }
      if (S.claws) {
        // an open claw: a palm, and four two-jointed fingers and a thumb on a claw bone that curls them into a fist
        // The palm faces in toward the body with the arm hanging and the thumb faces forward, the way a
        // person stands, so the fingers close toward the side the elbow bends to (Gid, 27 Nov 2026: the
        // hands faced backward, so a natural-looking hand needed the upper arm twisted 90-100 degrees,
        // which turned the elbow's bend sideways). The claw bone sits in a turned holder so poses that
        // set its rotation keep the turn.
        piece(B['hand' + k], cbox(F * 0.95, F * 0.7, F * 0.75, 0.22), [0, -F * 0.35, 0], [0, sx * Math.PI / 2, 0]);
        const hold = new THREE.Group(); hold.rotation.y = sx * Math.PI / 2; B['hand' + k].add(hold);
        const c = B['claw' + k] = new THREE.Group(); c.position.set(0, -F * 0.68, F * 0.1); hold.add(c);
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * F * 0.23, fg = new THREE.Group(); fg.position.set(x, 0, 0); fg.rotation.z = (i - 1.5) * -0.08; c.add(fg);
          piece(fg, cbox(F * 0.18, F * 0.42, F * 0.2, 0.3), [0, -F * 0.2, 0], [0, 0, 0], dark, 0.3);
          piece(fg, cbox(F * 0.15, F * 0.4, F * 0.17, 0.3, 0.3, 1), [0, -F * 0.56, F * 0.07], [0.35, 0, 0], plate, 0.2);   // tip
        }
        const th = new THREE.Group(); th.position.set(sx * -F * 0.48, F * 0.2, F * 0.12); th.rotation.z = sx * 0.6; c.add(th);
        piece(th, cbox(F * 0.2, F * 0.5, F * 0.22, 0.3, 0.4, 1), [0, -F * 0.25, 0], [0.3, 0, 0], dark, 0.2);
        return;
      }
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
      for (let i = 0; i < (RICH ? 16 : 40); i++) block(B.chest, rnd(-0.2, w * 0.6), rnd(-3, 3), rnd(-1, S.chestD / 2 + (RICH ? 0.1 : 1.2)), rnd(0.12, 0.3), rnd(0, 3));
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
      const edge = new THREE.Mesh(own(new THREE.BoxGeometry(0.1, 8.4, 0.2)), glow(RICH ? S.glow : LIME)); edge.position.set(0, 4.6, 0.48); blade.add(edge);
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
    if (id === 'syntax') {
      // no legs: a cluster of shards tapers from the hips to a point, sways and sheds red glitch bits
      const tail = new THREE.Group(); B.hips.add(tail); extra.tail = tail;
      piece(tail, cbox(2.6, 6.8, 1.8, 0.1, 1, 0.05), [0, -3.9, 0], [0, 0, 0], plate, 0.5);
      const ring = [[-1.6, 5.2, 0.4], [1.6, 5.0, 0.4], [-0.9, 4.2, 1.0], [0.9, 4.4, 1.0], [-1.3, 4.6, -0.8], [1.3, 4.4, -0.8], [0, 5.8, -1.0], [0, 3.6, 1.2]];
      for (const [x, len, z] of ring) {
        const m = piece(tail, cbox(1.0, len, 0.8, 0.12, 1, 0.08), [x, -len / 2 - 0.4, z], [z * -0.12, 0, x * 0.1], rnd() < 0.5 ? dark : plate, 0.4);
        m.userData.shard = true;
      }
      extra.tips = [new V(0, -7.3, 0), new V(-1.9, -5.6, 0.4), new V(1.9, -5.4, 0.4), new V(0, -6.2, -1.0)];
      // red lines down the chest from the shoulders to the core, and vents on the back
      for (const sx of [-1, 1]) {
        const l = new THREE.Mesh(own(new THREE.BoxGeometry(0.14, S.chestH * 0.55, 0.14)), glow(S.glow));
        l.position.set(sx * S.chestW * 0.2, S.chestH * 0.12, S.chestD / 2 + 0.22); l.rotation.z = sx * 0.45; B.chest.add(l);
        for (let i = 0; i < 3; i++) piece(B.chest, cbox(0.9, 0.35, 0.5, 0.3), [sx * 1.3, S.chestH * 0.25 - i * 0.6, -S.chestD / 2 - 0.15], [0, 0, 0], dark, 0);
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
        const ring = new THREE.Mesh(own(new THREE.TorusGeometry(0.62, 0.08, 6, 16)), glow(RICH ? S.glow : LIME)); ring.position.set(sx * 1.6, S.chestH / 2 + 1.45, -S.chestD * 0.3 - 0.25); ring.rotation.x = Math.PI / 2 - 0.3; B.chest.add(ring);
        extra.steam.push(new V(sx * 1.6, S.chestH / 2 + 1.6, -S.chestD * 0.3 - 0.3));
      }
    }

    if (RICH) detail();

    // ---------- the rich build's detail ----------
    // Generic parts on every titan (layered pauldrons, bolts, trim edges, vents, pistons, cables, toe plates,
    // a visor frame), then each titan's own. Everything sits on the bone it moves with, and nothing spans a
    // joint, so a bent elbow or knee never pulls a part off.
    function detail() {
      const W = S.chestW, D = S.chestD, CH = S.chestH, h = S.head, p = S.pauldron, u = S.upper, f = S.fore, t = S.limb;
      const half = id === 'half';
      const boltGeo = own(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 6));
      const bolt = (b, x, y, z, s = 1, rot = [Math.PI / 2, 0, 0], m = trim) => { const o = piece(b, boltGeo, [x, y, z], rot, m); o.scale.setScalar(s); return o; };
      const row = (b, a, c, n, s, rot, m) => { for (let i = 0; i < n; i++) { const k = n > 1 ? i / (n - 1) : 0.5; bolt(b, a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k, s, rot, m); } };
      const G1 = glow(S.glow || LIME);
      const strip = (b, at, size, rot = [0, 0, 0]) => { const o = new THREE.Mesh(own(new THREE.BoxGeometry(...size)), G1); o.position.set(...at); o.rotation.set(...rot); b.add(o); meshes.push(o); return o; };
      const tube = (b, pts, r, m = rubber, seg = 14) => piece(b, own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => new V(...q))), seg, r, 6)), [0, 0, 0], [0, 0, 0], m);
      // ribbed hose: rings stacked along a line
      const hose = (b, a, c, n, r) => { for (let i = 0; i < n; i++) { const k = i / (n - 1); piece(b, own(new THREE.CylinderGeometry(r, r, 0.16, 8)), [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k], [0, 0, 0], i % 2 ? rubber : dark); } };
      const vent = (b, at, rot, w, hh, n = 4) => {
        const g = new THREE.Group(); g.position.set(...at); g.rotation.set(...rot); b.add(g);
        piece(g, cbox(w, hh, 0.3, 0.25), [0, 0, -0.05], [0, 0, 0], dark);
        strip(g, [0, 0, 0.06], [w * 0.8, hh * 0.8, 0.04]);
        for (let i = 0; i < n; i++) piece(g, cbox(w * 0.9, hh / n * 0.45, 0.12, 0.3), [0, -hh / 2 + hh / n * (i + 0.5), 0.14], [-0.5, 0, 0], trim);
        return g;
      };
      const piston = (b, at, len, r, rot = [0, 0, 0]) => {
        const g = new THREE.Group(); g.position.set(...at); g.rotation.set(...rot); b.add(g);
        piece(g, own(new THREE.CylinderGeometry(r, r, len * 0.55, 8)), [0, len * 0.22, 0], [0, 0, 0], dark);
        piece(g, own(new THREE.CylinderGeometry(r * 0.55, r * 0.55, len * 0.6, 8)), [0, -len * 0.2, 0], [0, 0, 0], trim);
        piece(g, own(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.14, 8)), [0, len * 0.5, 0], [0, 0, 0], trim);
        piece(g, own(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.14, 8)), [0, -len * 0.5, 0], [0, 0, 0], dark);
        return g;
      };

      // torso: a back plate and a spine of fins, side vents, trim on the pectorals, bolts on the collar
      piece(B.chest, cbox(W * 0.78, CH * 0.72, 0.55, 0.3), [0, 0.1, -D / 2 - 0.12], [0, 0, 0], dark);
      for (let i = 0; i < 3; i++) piece(B.chest, cbox(0.55, 0.95, 0.8, 0.3, 0.6, 1), [0, CH * 0.28 - i * 1.05, -D / 2 - 0.5], [0.25, 0, 0], plate);
      for (const sx of [-1, 1]) {
        if (half && sx > 0) continue;
        vent(B.chest, [sx * (W * 0.47 + 0.18), -CH * 0.12, D * 0.12], [0, sx * Math.PI / 2, 0], D * 0.42, CH * 0.3, 4);
        piece(B.chest, cbox(W * 0.38, 0.16, 0.22, 0.4), [sx * W * 0.27, CH * 0.4, D / 2 + 0.24], [0.14, sx * 0.3, sx * -0.12], trim);
        row(B.chest, [sx * W * 0.12, -CH * 0.04, D / 2 + 0.3], [sx * W * 0.4, -CH * 0.04, D / 2 + 0.22], 4, 0.9);
        tube(B.chest, [[sx * W * 0.28, CH * 0.42, -D / 2 - 0.2], [sx * W * 0.42, CH * 0.62, -D / 2 - 0.4], [sx * S.shoulderX * 0.9, S.shoulderY + p[1] * 0.25, -p[2] * 0.42]], 0.17);
      }
      row(B.chest, [-W * 0.22, CH / 2 + 0.35, D * 0.3], [W * 0.22, CH / 2 + 0.35, D * 0.3], 5, 0.8);
      // the core: a trim ring, six clamps, and two thin rings that turn
      piece(core, own(new THREE.TorusGeometry(S.tri ? 1.6 : 1.32, 0.13, 6, 24)), [0, 0, 0.1], [0, 0, 0], trim);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; piece(core, cbox(0.32, 0.5, 0.42, 0.3), [Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.05], [0, 0, a + Math.PI / 2], dark); }
      extra.rings = [0, 1].map(i => { const r = new THREE.Mesh(own(new THREE.TorusGeometry(1.08 + i * 0.22, 0.035, 4, 40)), G1); r.position.z = 0.42 + i * 0.05; core.add(r); return r; });
      strip(B.spine, [0, 0.2, D * 0.42 + 0.3], [0.16, 1.4, 0.06]);
      for (const sx of [-1, 1]) if (!(half && sx > 0)) hose(B.spine, [sx * W * 0.3, 0.9, D * 0.18], [sx * W * 0.26, -0.5, D * 0.22], 6, 0.2);
      // belt with a lit buckle
      piece(B.hips, cbox(W * 0.76, 0.34, D * 0.92, 0.3), [0, 0.3, 0], [0, 0, 0], trim);
      piece(B.hips, cbox(0.9, 0.5, 0.25, 0.3), [0, 0.3, D * 0.46 + 0.05], [0, 0, 0], dark);
      strip(B.hips, [0, 0.3, D * 0.46 + 0.19], [0.5, 0.14, 0.04]);

      // head: a frame round the visor, cheek vents, and two small fins
      if (!S.horns) {
        piece(B.head, cbox(h * 0.95, 0.12, 0.2, 0.4), [0, h * 0.64, h * 0.6], [0, 0, 0], trim);
        piece(B.head, cbox(h * 0.95, 0.12, 0.2, 0.4), [0, h * 0.4, h * 0.6], [0, 0, 0], trim);
        for (const sx of [-1, 1]) {
          if (half && sx > 0) continue;
          for (let i = 0; i < 3; i++) piece(B.head, cbox(0.1, h * 0.3, 0.12, 0.4), [sx * h * 0.53, h * 0.2 + i * 0.001, h * 0.22 + i * 0.18], [0, 0, 0], dark);
          piece(B.head, cbox(0.18, h * 0.55, h * 0.45, 0.3, 0.4, 1), [sx * h * 0.6, h * 0.75, -h * 0.1], [-0.35, 0, sx * -0.25], dark);
        }
      }

      // arms: a second plate over each pauldron with a trim rim and bolts, a piston on the upper arm, a ram
      // plate and lit strips on the gauntlet, and a trim knuckle plate
      for (const [k, sx] of [['L', -1], ['R', 1]]) {
        if (half && k === 'R') continue;
        const sh = B['sh' + k];
        piece(sh, cbox(p[0] * 0.82, p[1] * 0.42, p[2] * 0.84, 0.25, 0.75, 1), [sx * p[0] * 0.28, p[1] * 0.68, 0], [0, 0, sx * -0.3], plate);
        piece(sh, cbox(p[0] * 1.02, 0.2, p[2] * 1.05, 0.4), [sx * p[0] * 0.16, -p[1] * 0.2, 0], [0, 0, sx * -0.18], trim);
        row(sh, [sx * p[0] * 0.02, p[1] * 0.02, p[2] * 0.64], [sx * p[0] * 0.42, -p[1] * 0.06, p[2] * 0.64], 4, 1);
        piston(B['arm' + k], [0, -u * 0.52, -t * 0.62], u * 0.6, t * 0.16);
        const fo = B['fore' + k];
        piece(fo, cbox(t * 0.55, f * 0.68, t * 1.15, 0.2, 0.7, 1.05), [sx * t * 0.72, -f * 0.45, 0], [0, 0, sx * 0.06], dark);
        strip(fo, [sx * t * 0.62, -f * 0.45, t * 0.62], [0.08, f * 0.5, 0.05]);
        strip(fo, [0, -f * 0.45, t * 0.62], [t * 0.5, 0.08, 0.05]);
        row(fo, [-t * 0.5, -f * 0.82, t * 0.72], [t * 0.5, -f * 0.82, t * 0.72], 3, 0.9, [Math.PI / 2, 0, 0], dark);
        const F = S.fist * ((k === 'L' ? S.fistL : S.fistR) || 1);
        if (!S.claws) piece(B['hand' + k], cbox(F * 1.06, F * 0.3, F * 0.36, 0.3), [0, -F * 0.82, F * 0.4], [0, 0, 0], trim);
      }
      // legs: a piston up the thigh, a layered knee cop, a lit shin strip, toe plates and ankle bolts
      if (L) for (const [k, sx] of [['L', -1], ['R', 1]]) {
        if (half && k === 'R') continue;
        const lt = L.thick;
        piston(B['thigh' + k], [sx * lt * 0.6, -L.thigh * 0.48, -lt * 0.2], L.thigh * 0.6, lt * 0.14);
        piece(B['shin' + k], cbox(lt * 0.7, lt * 0.42, 0.32, 0.3, 0.7, 1), [0, lt * 0.08, lt * 0.78], [0.35, 0, 0], trim);
        strip(B['shin' + k], [0, -L.shin * 0.45, lt * 0.68], [0.1, L.shin * 0.45, 0.05]);
        piece(B['shin' + k], cbox(lt * 1.1, 0.22, lt * 1.15, 0.4), [0, -L.shin * 0.88, 0], [0, 0, 0], trim);
        for (const tx of [-1, 1]) piece(B['foot' + k], cbox(lt * 0.5, 0.42, lt * 0.5, 0.3, 0.8, 1), [tx * lt * 0.29, 0.15, lt * 1.25], [0.1, 0, 0], plate);
        row(B['foot' + k], [sx * lt * 0.6, 0.3, 0], [sx * lt * 0.6, 0.3, lt * 0.6], 2, 0.8, [0, 0, Math.PI / 2], trim);
      }

      // ---------- each titan's own ----------
      if (id === 'siege') {
        // battering-ram plates on the forearms, spiked knuckles, a heavy brow, and two lamp pylons on the back
        for (const [k, sx] of [['L', -1], ['R', 1]]) {
          piece(B['fore' + k], cbox(t * 0.45, f * 1.0, t * 1.5, 0.15, 0.55, 1.15), [sx * t * 1.0, -f * 0.48, 0], [0, 0, sx * 0.1], plate);
          row(B['fore' + k], [sx * t * 1.25, -f * 0.15, t * 0.55], [sx * t * 1.25, -f * 0.8, t * 0.55], 3, 1.1, [0, 0, Math.PI / 2]);
          for (let i = 0; i < 3; i++) piece(B['hand' + k], own(new THREE.ConeGeometry(0.22, 0.75, 4)), [(i - 1) * S.fist * 0.32, -S.fist * 0.85, S.fist * 0.62], [Math.PI / 2, 0, 0], dark);
          const py = new THREE.Group(); py.position.set(sx * W * 0.3, CH * 0.35, -D / 2 - 0.5); py.rotation.set(-0.35, 0, sx * -0.25); B.chest.add(py);
          piece(py, cbox(0.8, 3.2, 0.8, 0.2, 0.7, 1), [0, 1.4, 0], [0, 0, 0], dark);
          piece(py, cbox(1.05, 0.5, 1.05, 0.3), [0, 3.0, 0], [0, 0, 0], trim);
          const lamp = new THREE.Mesh(own(new THREE.BoxGeometry(0.6, 0.35, 0.6)), G1); lamp.position.set(0, 3.4, 0); py.add(lamp); meshes.push(lamp);
        }
        piece(B.head, cbox(h * 1.25, h * 0.32, h * 0.55, 0.3, 0.9, 1), [0, h * 0.92, h * 0.3], [0.25, 0, 0], plate);
        piece(B.chest, cbox(W * 0.5, 0.7, 0.4, 0.3, 1, 0.7), [0, -CH * 0.42, D / 2 + 0.2], [-0.15, 0, 0], plate);
      }
      if (id === 'warden') {
        // tassets hanging from the belt, a gorget, tall fins on the pauldrons, a framed shield with a lit
        // emblem and a handle to the arm, and a pommel and a wrapped grip on the blade
        for (const sx of [-1, -0.33, 0.33, 1]) for (let r = 0; r < 2; r++)
          piece(B.hips, cbox(W * 0.22, 1.1, 0.24, 0.3, 1, 0.85), [sx * W * 0.3, -0.75 - r * 0.8, D * 0.45 + r * 0.06], [-0.08, 0, sx * 0.08], r ? plate : trim);
        for (const sx of [-1, 1]) piece(B.hips, cbox(0.3, 1.6, D * 0.8, 0.3, 1, 0.8), [sx * W * 0.4, -0.9, 0], [0, 0, sx * 0.12], plate);
        piece(B.chest, own(new THREE.CylinderGeometry(1.0, 1.25, 0.6, 8, 1, true)), [0, CH / 2 + 0.45, 0.1], [0, 0, 0], trim);
        for (const [k, sx] of [['L', -1], ['R', 1]]) piece(B['sh' + k], cbox(0.28, p[1] * 1.2, p[2] * 0.75, 0.3, 0.4, 1), [sx * p[0] * 0.5, p[1] * 1.0, 0], [0, 0, sx * -0.35], trim);
        const fo = B.foreL;
        for (const z of [-1.35, 1.65]) piece(fo, cbox(0.3, 9.2, 0.25, 0.3), [-1.6, -2.4, z], [0, 0, 0], trim);
        for (const y of [2.05, -6.85]) piece(fo, cbox(0.3, 0.25, 3.25, 0.3), [-1.6, y, 0.15], [0, 0, 0], trim);
        piece(fo, cbox(0.9, 0.5, 0.5, 0.3), [-1.05, -1.4, 0.15], [0, 0, 0], dark);
        const em = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.8, 0)), G1); em.position.set(-2.12, -2.4, 0.15); em.scale.set(0.4, 1.3, 1); fo.add(em); meshes.push(em);
        const bl = B.handR.children.find(c => c.isGroup);
        if (bl) {
          piece(bl, cbox(0.42, 1.3, 0.42, 0.3), [0, -0.85, 0], [0, 0, 0], rubber);
          piece(bl, own(new THREE.OctahedronGeometry(0.38, 0)), [0, -1.65, 0], [0, 0, 0], trim);
          piece(bl, cbox(0.7, 0.3, 2.8, 0.3, 1, 0.8), [0, 0.15, 0], [0, 0, 0], trim);
          const fu = new THREE.Mesh(own(new THREE.BoxGeometry(0.36, 7.4, 0.08)), G1); fu.position.set(0, 4.9, 0); bl.add(fu); meshes.push(fu);
        }
      }
      if (id === 'colossus') {
        // data pylons on the shoulders, three eyes, cable bundles running down its back into the tail, and a
        // ring of blocks circling the chest
        for (const [k, sx] of [['L', -1], ['R', 1]]) {
          const py = new THREE.Group(); py.position.set(sx * p[0] * 0.3, p[1] * 0.7, -p[2] * 0.25); py.rotation.set(-0.45, 0, sx * -0.3); B['sh' + k].add(py);
          piece(py, cbox(0.5, 2.6, 0.5, 0.2, 0.5, 1), [0, 1.3, 0], [0, 0, 0], dark);
          for (let i = 0; i < 3; i++) piece(py, cbox(0.8, 0.16, 0.8, 0.3), [0, 0.6 + i * 0.7, 0], [0, 0, 0], trim);
          const tip = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.32, 0)), G1); tip.position.set(0, 2.8, 0); py.add(tip); meshes.push(tip);
        }
        for (const sx of [-1, 0, 1]) { const e = new THREE.Mesh(own(new THREE.BoxGeometry(0.22, 0.14, 0.12)), glow('#ff3a2e')); e.position.set(sx * h * 0.28, h * 0.32, h * 0.6); B.head.add(e); meshes.push(e); }
        for (const sx of [-0.6, 0, 0.6]) tube(B.chest, [[sx * 1.2, CH * 0.2, -D / 2 - 0.3], [sx * 1.5, -CH * 0.4, -D / 2 - 0.9], [sx * 0.9, -CH * 0.9, -D / 2 - 1.1], [sx * 0.6, -CH * 1.35, -D / 2 - 0.9]], 0.22);
      }
      if (id === 'king') {
        // gold trim on the throne with lit runes up its back and two pillars, a crown band with jewels under
        // the crest, gold bands on the gauntlets and lit tips on the cable cape
        const th = group.children.find(c => c.isGroup && c !== B.hips);
        if (th) {
          piece(th, cbox(W * 1.55, 0.3, 4.4, 0.3), [0, 3.65, -0.8], [0, 0, 0], trim);
          piece(th, cbox(W * 1.8, 0.8, 6.0, 0.15), [0, 0.4, -0.6], [0, 0, 0], dark);
          piece(th, cbox(W * 2.0, 0.4, 6.6, 0.2), [0, 0.05, -0.6], [0, 0, 0], trim);
          for (const sx of [-1, 1]) {
            piece(th, cbox(1.75, 0.3, 4.6, 0.3), [sx * W * 0.72, 5.5, -0.6], [0, 0, 0], trim);
            piece(th, cbox(1.1, 11.5, 1.1, 0.2), [sx * W * 0.78, 6.6, -3.0], [0, 0, 0], dark);
            piece(th, own(new THREE.OctahedronGeometry(0.75, 0)), [sx * W * 0.78, 12.8, -3.0], [0, 0, 0], trim);
            strip(th, [sx * W * 0.78, 6.6, -2.42], [0.12, 9.5, 0.05]);
            for (let i = 0; i < 4; i++) strip(th, [sx * W * 0.36, 4.6 + i * 1.8, -2.08], [0.12, 1.1, 0.05]);
          }
          piece(th, cbox(W * 1.5, 0.35, 1.5, 0.3), [0, 12.0, -2.8], [0, 0, 0], trim);
          strip(th, [0, 8.6, -2.08], [0.16, 6.5, 0.05]);
        }
        piece(B.head, own(new THREE.CylinderGeometry(h * 0.6, h * 0.62, h * 0.24, 8)), [0, h * 1.02, -0.05], [0, 0, 0], trim);
        for (let i = 0; i < 5; i++) { const j = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.13, 0)), glow('#ff3a2e')); const a = (i - 2) * 0.45; j.position.set(Math.sin(a) * h * 0.62, h * 1.02, Math.cos(a) * h * 0.62); B.head.add(j); meshes.push(j); }
        for (const k of ['L', 'R']) for (const y of [0.3, 0.6]) piece(B['fore' + k], cbox(t * 1.35, 0.22, t * 1.3, 0.4), [0, -f * y, 0], [0, 0, 0], trim);
        const cape = B.chest.children.find(c => c.isGroup && c.children.length > 50);
        if (cape) for (let c = 0; c < 9; c++) { const x = (c - 4) * 0.75; const q = new THREE.Mesh(own(new THREE.BoxGeometry(0.4, 0.25, 0.4)), G1); q.position.set(x * (1 + 11 * 0.04), S.shoulderY - 0.4 - 11 * 0.72 - 0.42, -S.chestD / 2 - 0.5 - 11 * 0.12 - Math.abs(x) * 0.08); cape.add(q); meshes.push(q); }
      }
      if (half) {
        // the seam where the armour stops: a jagged lit edge down the middle, a wire half-skull, wire ribs
        for (let i = 0; i < 7; i++) strip(B.chest, [0.08 + (i % 2) * 0.22, CH * 0.42 - i * CH * 0.13, D / 2 + 0.28], [0.1, CH * 0.14, 0.06], [0, 0, (i % 2 ? 0.5 : -0.5)]);
        for (let i = 0; i < 3; i++) strip(B.spine, [0.12 + (i % 2) * 0.2, 0.7 - i * 0.55, D * 0.42 + 0.28], [0.1, 0.5, 0.06], [0, 0, (i % 2 ? 0.5 : -0.5)]);
        piece(B.head, own(new THREE.BoxGeometry(h * 0.55, h * 1.12, h * 1.18, 3, 4, 4)), [h * 0.27, h * 0.45, 0], [0, 0, 0], wire);
        for (let i = 0; i < 4; i++) piece(B.chest, own(new THREE.TorusGeometry(W * 0.26, 0.04, 3, 14, Math.PI)), [W * 0.02, CH * 0.3 - i * 0.8, 0], [Math.PI / 2, 0, -Math.PI / 2], wire);
      }
      if (id === 'brute') {
        // cracks glow through the armour (the shader), a lit coil in the gut, pistons to the vents, knuckle dusters
        for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(own(new THREE.TorusGeometry(0.55, 0.12, 6, 18)), G1); c.position.set(0, 0.75 - i * 0.38, D * 0.42 + 0.1); B.spine.add(c); meshes.push(c); }
        for (const sx of [-1, 1]) piston(B.chest, [sx * 1.6, CH * 0.05, -D * 0.3 - 0.75], CH * 0.75, 0.32, [-0.3, 0, 0]);
        for (const k of ['L', 'R']) {
          piece(B['hand' + k], cbox(S.fist * 1.15, S.fist * 0.36, S.fist * 0.42, 0.3), [0, -S.fist * 0.86, S.fist * 0.45], [0, 0, 0], dark);
          for (let i = 0; i < 4; i++) piece(B['hand' + k], own(new THREE.ConeGeometry(0.17, 0.55, 4)), [(i - 1.5) * S.fist * 0.27, -S.fist * 0.86, S.fist * 0.78], [Math.PI / 2, 0, 0], trim);
        }
      }
    }

    // the rich build keeps its outline clean: no cubes stuck to the pauldrons or hanging over the head, only a
    // few pieces on a tilted ring round the whole body, wide of the shoulders at the sides and above the head
    // where the ring passes in front, so they never cross the chest, the arms or a wind-up pose
    if (RICH) {
      const n = { siege: 3, warden: 2, colossus: 4, king: 2, half: 3, brute: 0 }[id] ?? 2;
      const r = (S.shoulderX + S.pauldron[0]) * 1.3 + (id === 'colossus' ? 1.2 : 0), H = S.height;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + 0.4;
        block(group, 0, 0, 0, (id === 'colossus' ? 0.75 : 0.55) + (i % 2) * 0.15, i);
        blockList[blockList.length - 1].orbit = { a, r, rz: r * 0.55, y: H * 0.72, tilt: H * 0.4 };
      }
    }
    // general plates and peeling blocks for everyone but the Warden's shield
    for (let i = 0; i < (RICH ? 0 : S.plates); i++) {
      const sx = rnd() < 0.5 ? -1 : 1, kk = sx < 0 ? 'L' : 'R';
      if (id === 'half' && kk === 'R') continue;
      const p = S.pauldron;
      block(B['sh' + kk], sx * rnd(0, p[0] * 0.45), p[1] * rnd(0.4, 0.75), rnd(-p[2] * 0.4, p[2] * 0.4), rnd(0.35, 0.6), rnd(0, 1));
    }
    for (let i = 0; i < (RICH ? 0 : S.floaters); i++) {
      const sx = rnd() < 0.5 ? -1 : 1, kk = sx < 0 ? 'L' : 'R';
      block(B['sh' + kk], sx * rnd(1, 2.6), rnd(2, 3.6), rnd(-1, 1), rnd(0.25, 0.45), rnd(0, 3));
    }

    // ---------- the rich build: one mesh per bone and material ----------
    // A titan is a few hundred parts; merged, each bone draws once per material, so the detail costs
    // almost no draw calls. Normals stay (the panel shader picks its plane from them).
    if (RICH) {
      const groups = new Map();
      for (const m of meshes) {
        if (!m.parent || m.material === wire) continue;
        const key = m.parent.uuid + ':' + m.material.uuid;
        if (!groups.has(key)) groups.set(key, { parent: m.parent, mat: m.material, list: [] });
        groups.get(key).list.push(m);
      }
      const out = meshes.filter(m => m.material === wire);
      for (const g of groups.values()) {
        if (g.list.length < 2) { out.push(...g.list); continue; }
        const geos = g.list.map(m => { m.updateMatrix(); const x = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); x.applyMatrix4(m.matrix); return x; });
        const n = geos.reduce((a, x) => a + x.attributes.position.count, 0);
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
        let o = 0;
        for (const x of geos) { pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; x.dispose(); }
        const mg = own(new THREE.BufferGeometry());
        mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        const mm = new THREE.Mesh(mg, g.mat);
        g.parent.add(mm); g.list.forEach(m => g.parent.remove(m));
        out.push(mm);
      }
      meshes.length = 0; meshes.push(...out);
      skinMerge();
    }
    // Then every part that only ever moves with its bone goes into one skinned mesh per material (each vertex
    // weighted fully to its bone, its position kept in the bone's own space so the panel shader reads it as
    // before): a titan draws in about 25 calls instead of about 100. The pauldrons and the head stay separate
    // (they fly loose when it dies) and so do the feet (the floor check measures them). Off with
    // window.__titanNoSkin (tests, frame-time comparisons).
    function skinMerge() {
      if (window.__titanNoSkin) return;
      const keepApart = new Set([B.shL, B.shR, B.head, B.footL, B.footR].filter(Boolean));
      const bones = [], boneIx = new Map(), byMat = new Map(), rest = [];
      for (const m of meshes) {
        if (!m.isMesh || m.material === wire || keepApart.has(m.parent) || !m.parent) { rest.push(m); continue; }
        if (!boneIx.has(m.parent)) { boneIx.set(m.parent, bones.length); bones.push(m.parent); }
        if (!byMat.has(m.material)) byMat.set(m.material, []);
        byMat.get(m.material).push(m);
      }
      if (!bones.length) return;
      const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
      const I = new THREE.Matrix4();
      for (const [mat, list] of byMat) {
        const geos = list.map(m => { m.updateMatrix(); const x = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); x.applyMatrix4(m.matrix); return [x, boneIx.get(m.parent)]; });
        const n = geos.reduce((a, [x]) => a + x.attributes.position.count, 0);
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        let o = 0;
        for (const [x, bi] of geos) {
          const c = x.attributes.position.count;
          pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3);
          for (let i = 0; i < c; i++) { si[(o + i) * 4] = bi; sw[(o + i) * 4] = 1; }
          o += c; x.dispose();
        }
        const g = own(new THREE.BufferGeometry());
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        const sm = new THREE.SkinnedMesh(g, mat);
        sm.frustumCulled = false;
        group.add(sm);
        sm.bind(skeleton, I);
        for (const m of list) m.parent.remove(m);
        rest.push(sm);
      }
      own(skeleton);
      meshes.length = 0; meshes.push(...rest);
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
        if (b.orbit) { const a = b.orbit.a + orbitA, o = b.orbit; _o.position.set(Math.cos(a) * o.r, o.y + Math.sin(a) * (o.tilt || 0) + Math.sin(t * 1.3 + o.a * 3) * 0.25, Math.sin(a) * o.rz); }
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
    if (RICH) coreGlow.material.opacity = 0.42;
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
        B['foot' + k].updateWorldMatrix(true, true); legBox.makeEmpty();   // just this leg, not the whole body
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
    // out keep their idle angle, so a strike pose only moves what it names. A pose marked _only
    // moves just the bones it names and leaves the rest where the layers before it put them.
    const Z3 = [0, 0, 0];
    function mix(list) {
      const I = POSES.idle;
      let hy = I._hips || 0;
      for (const b in B) { const r = I[b] || Z3; B[b].rotation.set(r[0], r[1], r[2]); }
      for (const [n, w] of list) {
        const P = POSES[n];
        if (!P || !(w > 0)) continue;
        for (const b in B) {
          if (P._only && !P[b]) continue;
          const r = P[b] || I[b] || Z3, o = B[b].rotation; o.x += (r[0] - o.x) * w; o.y += (r[1] - o.y) * w; o.z += (r[2] - o.z) * w;
        }
        hy += ((P._hips || 0) - hy) * w;
      }
      B.hips.position.y = hipY + hy;
      plantFeet();
    }

    let clock = 0, orbitA = 0, api = null;
    function update(t, dt = 0) {
      clock = t;
      orbitA += dt * 0.35 * ((api && api.orbitK) || 1);
      // breathing and the core's pulse
      B.chest.position.y = S.chestY + Math.sin(t * 1.6) * 0.06;
      const pulse = 0.85 + 0.15 * Math.sin(t * 3.2);
      coreGlow.scale.setScalar(4.2 * pulse);
      if (L == null) group.position.y = (opts.y || 0) + Math.sin(t * 0.9) * 0.25;
      if (extra.tail) {
        extra.tail.rotation.y = Math.sin(t * 0.8) * 0.18;
        if (id === 'syntax') { extra.tail.rotation.x = Math.sin(t * 1.1) * 0.06; extra.tail.rotation.z = Math.sin(t * 0.7 + 1) * 0.05; }
      }
      if (extra.rings) extra.rings.forEach((r, i) => { r.rotation.set(Math.sin(t * 0.7 + i) * 0.5, t * (i ? -1.3 : 0.9), 0); });
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
    return api = {
      group, bones: B, core, pose, mix, update, POSES, parts, meshes, tips: extra.tips || null, tail: extra.tail, glowColor: S.glow || LIME,
      // hide the data-block plates as health drops: f is the share of health left
      plates(f) { blockList.forEach((b, i) => { if (b.fallK == null) b.size = ((i * 0.6180339) % 1) < f + 0.05 ? b.size0 : 0; }); },
      blocks: { mesh: blockMesh, list: blockList },
      // the rich build's telegraph: k 0..1 brightens every seam and lit strip and pulls the seams toward col
      charge(k, col) {
        if (!RICH) return;
        U.pulse.value = k;
        U.seam.value.copy(G).lerp(col || RED, Math.min(1, k) * 0.75);
        for (const m of Object.values(glowCache)) { m.userData.base ||= m.color.clone(); m.color.copy(m.userData.base).multiplyScalar(1 + k * (m === coreMat ? 0.25 : 0.9)); }
      },
      heat(k) { U.heat.value = k; },
      rich: RICH,
      // the materials a reveal or a dissolve clips, and the parts the Boss Rush animates directly
      materials: () => [plate, dark, trim, rubber, wire, ...Object.values(glowCache), coreGlow.material, coreMat, ...steam.flatMap(st => st.ps.map(p => p.s.material))].filter((m, i, a) => m && a.indexOf(m) === i),
      coreGlow, blade: id === 'warden' ? B.handR.children.find(c => c.isGroup) || null : null,
      height: S.height,
      dispose() { keep.forEach(x => x.dispose && x.dispose()); },
    };
  }

  // ---------- proportions (units: the old boss stood about 16 tall) ----------
  const BOSSES = {
    siege: { height: 15, legs: { hip: 4.2, hipX: 1.9, thigh: 2.2, shin: 2.0, thick: 1.6 }, chestY: 2.6, chestW: 6.2, chestH: 4.6, chestD: 3.6, waistTaper: 0.65,
      neckY: 2.2, neckZ: 0.9, head: 1.9, shoulderX: 3.9, shoulderY: 1.4, pauldron: [3.6, 3.2, 3.6], upper: 3.2, fore: 3.0, limb: 1.6, fist: 2.6, plates: 16, floaters: 6 , rich: { metal: '#5d5852', dark: '#2a2622', trim: '#b07a34' } },
    warden: { height: 18, legs: { hip: 6.6, hipX: 1.3, thigh: 3.3, shin: 3.2, thick: 1.15 }, chestY: 2.4, chestW: 4.6, chestH: 4.2, chestD: 2.6, waistTaper: 0.62,
      neckY: 2.3, head: 1.5, shoulderX: 3.0, shoulderY: 1.4, pauldron: [2.4, 1.9, 2.4], upper: 3.0, fore: 2.8, limb: 1.05, fist: 1.3, plates: 8, floaters: 4 , rich: { metal: '#6b7682', dark: '#232a32', trim: '#d6dee6' } },
    colossus: { height: 16, legs: null, hover: 5.2, chestY: 2.6, chestW: 6.0, chestH: 4.8, chestD: 3.4, waistTaper: 0.6,
      neckY: 2.3, neckZ: 0.6, head: 1.8, shoulderX: 3.8, shoulderY: 1.5, pauldron: [3.4, 3.4, 3.4], upper: 3.4, fore: 3.2, limb: 1.45, fist: 2.3, plates: 12, floaters: 8 , rich: { metal: '#4d4a5c', dark: '#211e2b', trim: '#8a78b4' } },
    king: { height: 15, legs: { hip: 3.8, hipX: 1.5, thigh: 2.4, shin: 2.6, thick: 1.3 }, chestY: 2.5, chestW: 5.4, chestH: 4.4, chestD: 3.0, waistTaper: 0.66,
      neckY: 2.2, head: 1.7, shoulderX: 3.5, shoulderY: 1.4, pauldron: [2.9, 2.5, 2.9], upper: 3.0, fore: 2.8, limb: 1.3, fist: 2.0, fistL: 1.0, fistR: 1.55, plates: 10, floaters: 4, metal: '#4a5258' , rich: { metal: '#4a5258', dark: '#25221c', trim: '#d9aa3a' } },
    half: { height: 16, legs: { hip: 5.8, hipX: 1.3, thigh: 2.9, shin: 2.8, thick: 1.25 }, chestY: 2.4, chestW: 4.8, chestH: 4.2, chestD: 2.8, waistTaper: 0.62,
      neckY: 2.2, head: 1.6, shoulderX: 3.1, shoulderY: 1.4, pauldron: [2.5, 2.0, 2.5], upper: 3.0, fore: 2.8, limb: 1.2, fist: 1.5, plates: 8, floaters: 3 , rich: { metal: '#5a6167', dark: '#252a2d', trim: '#8f989e' } },
    syntax: { height: 17, legs: null, hover: 5.9, chestY: 2.6, chestW: 6.6, chestH: 4.8, chestD: 3.6, waistTaper: 0.55,
      neckY: 2.3, neckZ: 0.5, head: 1.75, shoulderX: 4.1, shoulderY: 1.5, pauldron: [3.9, 3.3, 3.9], upper: 3.0, fore: 3.3, limb: 1.6, fist: 2.3,
      plates: 6, floaters: 10, glow: '#ff2a3a', metal: '#3a3f47', dark: '#1d2026', seam: 1.4, tri: true, horns: true, claws: true, bands: true },
    brute: { height: 14, legs: { hip: 3.6, hipX: 1.8, thigh: 2.0, shin: 1.8, thick: 1.6 }, chestY: 2.6, chestW: 6.0, chestH: 4.6, chestD: 3.8, waistTaper: 0.6,
      neckY: 1.9, neckZ: 1.2, head: 1.7, shoulderX: 3.8, shoulderY: 1.3, pauldron: [3.2, 2.8, 3.2], upper: 3.8, fore: 3.8, limb: 1.6, fist: 2.4, plates: 14, floaters: 6, seam: 2.2 , rich: { metal: '#4d4741', dark: '#1f1b18', trim: '#9a6232', cracks: true } },
  };

  // ---------- the titans' attacks (Boss Rush) ----------
  // Each attack is a wind-up pose and a strike pose. The limb angles come from joint-check's bend() in body
  // terms (tools: the joint-check skill; the specs say things like "shoulder flex 160, abduct 20, elbow 55")
  // and every pose and the halfway frame between wind-up and strike pass its range, buried-limb and floor checks.
  // A strike twists the body the opposite way to its wind-up, and a level swing keeps the arm at shoulder height.
  const ATTACKS = {
    siege: { fists: ['fistsUp', 'fistsDown'], hook: ['hookWind', 'hookStrike'], stomp: ['stompWind', 'stompStrike'] },
    warden: { bash: ['bashWind', 'bashStrike'], sweep: ['sweepWind', 'sweepStrike'], cleave: ['cleaveWind', 'cleaveStrike'] },
    colossus: { storm: ['stormWind', 'stormStrike'], lash: ['lashWind', 'lashStrike'], beam: ['beamWind', 'beamStrike'] },
    king: { shock: ['shockWind', 'shockStrike'], decree: ['decreeWind', 'decreeStrike'], crush: ['crushWind', 'crushStrike'] },
    half: { split: ['splitWind', 'splitStrike'], lash: ['lashWind', 'lashStrike'], crash: ['crashWind', 'crashStrike'] },
    brute: { piston: ['pistonWind', 'pistonStrike'], vent: ['ventWind', 'ventStrike'], pound: ['poundWind', 'poundStrike'] },
  };
  // generated: BEGIN titan poses
  const TITAN_POSES = {
      siege: {
        fistsUp: { _hips: 0.3, spine: [-0.1, 0, 0], chest: [-0.2, 0, 0], head: [-0.3, 0, 0], armL: [-2.793, 0, -0.349], armR: [-2.793, 0, 0.349], foreL: [-0.96, 0, 0], foreR: [-0.96, 0, 0], thighL: [0, 0, -0.209], thighR: [0, 0, 0.209] },
        fistsDown: { _hips: -1.1, spine: [0.3, 0, 0], chest: [0.55, 0, 0], head: [-0.5, 0, 0], armL: [-1.309, 0, -0.14], armR: [-1.309, 0, 0.14], foreL: [-0.262, 0, 0], foreR: [-0.262, 0, 0], thighL: [0, 0, -0.279], thighR: [0, 0, 0.279] },
        hookWind: { _hips: -0.3, spine: [0, 0.25, 0], chest: [0.15, 0.4, 0], head: [0, -0.45, 0], armR: [0.436, 0, 1.484], foreR: [-1.658, 0, 0], armL: [-0.785, 0, -0.349], foreL: [-1.396, 0, 0], thighL: [0, 0, -0.262], thighR: [0, 0, 0.262] },
        hookStrike: { _hips: -0.5, spine: [0.05, -0.25, 0], chest: [0.2, -0.45, 0], head: [0, 0.4, 0], armR: [-1.536, 0, -0.489], foreR: [-0.349, 0, 0], armL: [0.349, 0, -0.436], foreL: [-1.571, 0, 0], thighL: [0, 0, -0.262], thighR: [0, 0, 0.262] },
        stompWind: { _hips: 0, chest: [-0.1, 0, 0], spine: [-0.05, 0, 0], head: [0.1, 0, 0], thighR: [-1.309, 0, 0.175], shinR: [1.484, 0, 0], thighL: [0, 0, -0.14], armL: [-0.175, 0, -1.222], armR: [-0.175, 0, 1.222], foreL: [-0.698, 0, 0], foreR: [-0.698, 0, 0] },
        stompStrike: { _hips: -0.9, spine: [0.25, 0, 0], chest: [0.35, 0, 0], head: [-0.3, 0, 0], thighL: [0, 0, -0.314], thighR: [0, 0, 0.314], armL: [-0.524, 0, -0.785], armR: [-0.524, 0, 0.785], foreL: [-1.047, 0, 0], foreR: [-1.047, 0, 0] },
        die: { _hips: -2.2, spine: [0.45, 0, 0.1], chest: [0.6, 0.1, 0.15], head: [0.55, 0.2, 0], armL: [-0.349, 0, -0.262], armR: [-0.349, 0, 0.262], foreL: [-0.436, 0, 0], foreR: [-0.436, 0, 0], thighL: [0, 0, -0.314], thighR: [0, 0, 0.314] },
      },
      warden: {
        bashWind: { _hips: -0.3, chest: [0.05, -0.35, 0], spine: [0, -0.2, 0], head: [0, 0.35, 0], armL: [-0.349, 0, -0.611], foreL: [-1.745, 0, 0], armR: [0.262, 0, 0.349], foreR: [-0.698, 0, 0], thighL: [0, 0, -0.175], thighR: [0, 0, 0.175] },
        bashStrike: { _hips: -0.6, chest: [0.25, 0.35, 0], spine: [0.1, 0.2, 0], head: [-0.1, -0.3, 0], armL: [-1.484, 0, -0.175], foreL: [-0.611, 0, 0], armR: [0.349, 0, 0.436], foreR: [-0.873, 0, 0], thighL: [0, 0, -0.175], thighR: [0, 0, 0.175] },
        sweepWind: { _hips: -0.3, chest: [0.05, 0.45, 0], spine: [0, 0.25, 0], head: [0, -0.4, 0], armR: [0.349, 0, 1.536], foreR: [-0.436, 0, 0], handR: [0.785, 0, 0], armL: [-0.698, 0, -0.262], foreL: [-1.658, 0, 0], thighL: [0, 0, -0.209], thighR: [0, 0, 0.209] },
        sweepStrike: { _hips: -0.55, chest: [0.15, -0.45, 0], spine: [0.05, -0.25, 0], head: [0, 0.4, 0], armR: [-1.536, 0, -0.611], foreR: [-0.262, 0, 0], handR: [1.222, 0, 0], armL: [-0.524, 0, -0.349], foreL: [-1.745, 0, 0], thighL: [0, 0, -0.209], thighR: [0, 0, 0.209] },
        cleaveWind: { _hips: 0.1, chest: [-0.25, 0, 0], spine: [-0.1, 0, 0], head: [-0.25, 0, 0], armR: [-2.88, 0, 0.087], foreR: [-1.222, 0, 0], armL: [-0.873, 0, -0.524], foreL: [-1.571, 0, 0] },
        cleaveStrike: { _hips: -1, chest: [0.5, 0, 0], spine: [0.25, 0, 0], head: [-0.4, 0, 0], armR: [-1.222, 0, 0.087], foreR: [-0.087, 0, 0], armL: [-0.698, 0, -0.524], foreL: [-1.658, 0, 0], thighL: [0, 0, -0.244], thighR: [0, 0, 0.244] },
        die: { _hips: -2.2, spine: [0.4, 0, 0], chest: [0.5, 0, 0], head: [0.5, 0, 0], armR: [-1.047, 0, 0.175], foreR: [-0.524, 0, 0], armL: [-0.349, 0, -0.349], foreL: [-1.047, 0, 0], thighL: [0, 0, -0.279], thighR: [0, 0, 0.279] },
      },
      colossus: {
        stormWind: { chest: [-0.35, 0, 0], spine: [-0.15, 0, 0], head: [-0.4, 0, 0], armL: [-2.443, 0, -0.489], armR: [-2.443, 0, 0.489], foreL: [-0.698, 0, 0], foreR: [-0.698, 0, 0] },
        stormStrike: { chest: [0.35, 0, 0], spine: [0.15, 0, 0], head: [-0.25, 0, 0], armL: [-1.658, 0, -0.262], armR: [-1.658, 0, 0.262], foreL: [-0.175, 0, 0], foreR: [-0.175, 0, 0] },
        lashWind: { chest: [0.1, 0.5, 0], spine: [0, 0.3, 0], head: [0, -0.5, 0], armL: [-0.698, 0, -0.873], foreL: [-1.396, 0, 0], armR: [0.349, 0, 1.047], foreR: [-1.047, 0, 0] },
        lashStrike: { chest: [0.15, -0.55, 0], spine: [0.05, -0.3, 0], head: [0, 0.5, 0], armL: [0.262, 0, -0.96], foreL: [-0.873, 0, 0], armR: [-1.222, 0, -0.349], foreR: [-0.524, 0, 0] },
        beamWind: { chest: [-0.45, 0, 0], spine: [-0.2, 0, 0], head: [-0.3, 0, 0], armL: [0.611, 0, -0.785], armR: [0.611, 0, 0.785], foreL: [-1.571, 0, 0], foreR: [-1.571, 0, 0] },
        beamStrike: { chest: [0.2, 0, 0], spine: [0.1, 0, 0], head: [0.05, 0, 0], armL: [0.524, 0, -1.484], armR: [0.524, 0, 1.484], foreL: [-0.349, 0, 0], foreR: [-0.349, 0, 0] },
        die: { chest: [0.6, 0, 0.15], spine: [0.35, 0, 0.1], head: [0.6, 0.2, 0], armL: [-0.175, 0, -0.175], armR: [-0.175, 0, 0.175], foreL: [-0.262, 0, 0], foreR: [-0.262, 0, 0] },
      },
      king: {
        shockWind: { chest: [-0.2, 0, 0], spine: [-0.1, 0, 0], head: [-0.25, 0, 0], armL: [-2.094, 0, -0.611], armR: [-2.094, 0, 0.611], foreL: [-1.658, 0, 0], foreR: [-1.658, 0, 0] },
        shockStrike: { chest: [0.35, 0, 0], spine: [0.15, 0, 0], head: [-0.3, 0, 0], armL: [-0.611, 0, -0.489], armR: [-0.611, 0, 0.489], foreL: [-0.96, 0, 0], foreR: [-0.96, 0, 0] },
        decreeWind: { chest: [0, 0.35, 0], spine: [0, 0.15, 0], head: [0, -0.25, 0], armR: [-0.873, 0, 0.489], foreR: [-2.007, 0, 0], armL: [-0.785, 0, -0.349], foreL: [-1.047, 0, 0] },
        decreeStrike: { chest: [0.15, -0.35, 0], spine: [0.05, -0.2, 0], head: [-0.1, 0.2, 0], armR: [-1.658, 0, 0.087], foreR: [-0.052, 0, 0], armL: [-0.785, 0, -0.349], foreL: [-1.047, 0, 0] },
        crushWind: { chest: [-0.15, 0.3, 0], spine: [0, 0.15, 0], head: [-0.2, -0.2, 0], armR: [-2.234, 0, 0.733], foreR: [-1.745, 0, 0], armL: [-0.785, 0, -0.349], foreL: [-1.047, 0, 0] },
        crushStrike: { chest: [0.45, -0.2, 0], spine: [0.2, -0.1, 0], head: [-0.35, 0.1, 0], armR: [-1.222, 0, 0.175], foreR: [-0.14, 0, 0], armL: [-0.785, 0, -0.349], foreL: [-1.047, 0, 0] },
        die: { chest: [0.62, 0, 0.2], spine: [0.3, 0, 0.12], head: [0.6, 0.3, 0], armL: [-0.087, 0, -0.209], armR: [-0.087, 0, 0.209], foreL: [-0.175, 0, 0], foreR: [-0.175, 0, 0] },
      },
      half: {
        splitWind: { _hips: -0.6, chest: [0.3, 0, 0], spine: [0.15, 0, 0], head: [0.1, 0, 0], armL: [-1.396, 0, 0.262], armR: [-1.396, 0, -0.262], foreL: [-2.007, 0, 0], foreR: [-2.007, 0, 0], thighL: [0, 0, -0.244], thighR: [0, 0, 0.244] },
        splitStrike: { _hips: -0.2, chest: [-0.2, 0, 0], spine: [-0.1, 0, 0], head: [-0.3, 0, 0], armL: [-0.262, 0, -1.658], armR: [-0.262, 0, 1.658], foreL: [-0.262, 0, 0], foreR: [-0.262, 0, 0], thighL: [0, 0, -0.314], thighR: [0, 0, 0.314] },
        lashWind: { _hips: -0.3, chest: [0.05, 0.45, 0], spine: [0, 0.2, 0], head: [0, -0.3, 0], armR: [0.611, 0, 0.524], foreR: [-1.222, 0, 0], armL: [-0.611, 0, -0.349], foreL: [-1.396, 0, 0], thighL: [0, 0, -0.209], thighR: [0, 0, 0.209] },
        lashStrike: { _hips: -0.5, chest: [0.2, -0.45, 0], spine: [0.05, -0.2, 0], head: [-0.1, 0.3, 0], armR: [-1.745, 0, 0.087], foreR: [0, 0, 0], armL: [0.262, 0, -0.349], foreL: [-1.222, 0, 0], thighL: [0, 0, -0.209], thighR: [0, 0, 0.209] },
        crashWind: { _hips: 0.2, spine: [-0.1, 0, 0], chest: [-0.2, 0, 0], head: [-0.3, 0, 0], armL: [-2.793, 0, -0.262], armR: [-2.793, 0, 0.262], foreL: [-1.047, 0, 0], foreR: [-1.047, 0, 0], thighL: [0, 0, -0.175], thighR: [0, 0, 0.175] },
        crashStrike: { _hips: -1, spine: [0.3, 0, 0], chest: [0.55, 0, 0], head: [-0.45, 0, 0], armL: [-1.257, 0, -0.14], armR: [-1.257, 0, 0.14], foreL: [-0.209, 0, 0], foreR: [-0.209, 0, 0], thighL: [0, 0, -0.262], thighR: [0, 0, 0.262] },
        die: { _hips: -2.2, spine: [0.4, 0, -0.1], chest: [0.55, -0.15, -0.15], head: [0.5, -0.3, 0], armL: [-0.262, 0, -0.262], armR: [-0.262, 0, 0.262], foreL: [-0.524, 0, 0], foreR: [-0.524, 0, 0], thighL: [0, 0, -0.279], thighR: [0, 0, 0.279] },
      },
      brute: {
        pistonWind: { _hips: -0.5, chest: [0.35, 0.45, 0], spine: [0.15, 0.25, 0], head: [-0.45, -0.4, 0], armR: [0.96, 0, 0.349], foreR: [-2.356, 0, 0], armL: [-0.96, 0, -0.262], foreL: [-1.571, 0, 0], thighL: [0, 0, -0.262], thighR: [0, 0, 0.262] },
        pistonStrike: { _hips: -0.7, chest: [0.45, -0.45, 0], spine: [0.2, -0.25, 0], head: [-0.5, 0.35, 0], armR: [-1.606, 0, 0], foreR: [-0.07, 0, 0], armL: [0.524, 0, -0.349], foreL: [-2.094, 0, 0], thighL: [0, 0, -0.262], thighR: [0, 0, 0.262] },
        ventWind: { _hips: -0.6, chest: [0.65, 0, 0], spine: [0.3, 0, 0], head: [-0.2, 0, 0], armL: [-1.047, 0, 0.087], armR: [-1.047, 0, -0.087], foreL: [-2.094, 0, 0], foreR: [-2.094, 0, 0], thighL: [0, 0, -0.262], thighR: [0, 0, 0.262] },
        ventStrike: { _hips: -0.1, chest: [-0.3, 0, 0], spine: [-0.12, 0, 0], head: [-0.55, 0, 0], armL: [0.175, 0, -1.745], armR: [0.175, 0, 1.745], foreL: [-1.396, 0, 0], foreR: [-1.396, 0, 0], thighL: [0, 0, -0.262], thighR: [0, 0, 0.262] },
        poundWind: { _hips: 0, chest: [-0.1, 0, 0], spine: [-0.05, 0, 0], head: [-0.3, 0, 0], armL: [-2.967, 0, 0.087], armR: [-2.967, 0, -0.087], foreL: [-1.134, 0, 0], foreR: [-1.134, 0, 0], thighL: [0, 0, -0.244], thighR: [0, 0, 0.244] },
        poundStrike: { _hips: -1, chest: [0.65, 0, 0], spine: [0.35, 0, 0], head: [-0.6, 0, 0], armL: [-1.134, 0, -0.087], armR: [-1.134, 0, 0.087], foreL: [-0.175, 0, 0], foreR: [-0.175, 0, 0], thighL: [0, 0, -0.279], thighR: [0, 0, 0.279] },
        die: { _hips: -2, spine: [0.45, 0, 0.1], chest: [0.62, 0.1, 0.15], head: [0.5, 0.25, 0], armL: [-0.262, 0, -0.314], armR: [-0.262, 0, 0.314], foreL: [-0.436, 0, 0], foreR: [-0.436, 0, 0], thighL: [0, 0, -0.349], thighR: [0, 0, 0.349] },
      },
  };
  // generated: END titan poses

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
    if (id === 'syntax') {
      // floats leaning over the raid, claws half open; fists close for the slams and the punch,
      // and the punch becomes a reach: the claw thrown open at the raid (Art's Data Erasure)
      base.idle = { chest: [0.16, 0, 0], head: [0.12, 0, 0], armL: [0.18, 0, -0.5], armR: [0.18, 0, 0.5], foreL: [-0.55, 0, 0], foreR: [-0.55, 0, 0], clawL: [0.55, 0, 0], clawR: [0.55, 0, 0], handL: [0, 0.4, 0], handR: [0, -0.4, 0] };
      for (const n of ['raise', 'slam', 'guard', 'coil']) base[n] = { ...base[n], clawL: [1.5, 0, 0], clawR: [1.5, 0, 0] };
      // Attack poses with wide arcs (Gid, 26 Nov 2026: "they clip the arms and shoulders closer to the
      // body. the arms arent really swinging"). Made with joint-check's bend() in body terms and checked:
      //   coil   haymaker cocked: right upper arm out 80° and back 25°, elbow 95°, chest turned away 35°
      //   punch  right arm straight out in front (flex 105°, elbow 5°), chest turned in 40°, left fist pulled back
      //   pull   right arm straight out to the side and a little behind it (flex 90°, out 100°)
      //   sweep  the same arm swung level across the front (flex 90°, 35° across): only z changes, so the
      //          blend stays at shoulder height the whole way
      //   raise  both arms up overhead and wide (flex 150°, out 30°), leaning back
      //   slam   both arms straight down at the raid in front (flex 70°), bent over at the waist
      Object.assign(base, {
        coil: { armR: [0.436, 0, 1.396], foreR: [-1.658, 0, 0], armL: [-0.96, 0, -0.349], foreL: [-1.571, 0, 0], chest: [-0.12, -0.35, 0], spine: [-0.05, -0.2, 0], head: [0.05, 0.3, 0], clawR: [1.5, 0, 0], clawL: [1.5, 0, 0], _hips: -0.3 },
        punch: { armR: [-1.833, 0, 0], foreR: [-0.087, 0, 0], armL: [0.524, 0, -0.524], foreL: [-1.745, 0, 0], chest: [0.25, 0.4, 0], spine: [0.1, 0.2, 0], head: [-0.1, -0.3, 0], clawR: [1.5, 0, 0], clawL: [1.5, 0, 0], _hips: -0.5 },
        pull: { armR: [-1.571, 0, 1.745], foreR: [-0.262, 0, 0], armL: [-0.698, 0, -0.524], foreL: [-1.396, 0, 0], chest: [0, -0.4, 0], spine: [0, -0.25, 0], head: [0, 0.3, 0], _hips: -0.4 },
        sweep: { armR: [-1.571, 0, -0.611], foreR: [-0.262, 0, 0], armL: [0.436, 0, -0.698], foreL: [-1.222, 0, 0], chest: [0.15, 0.45, 0], spine: [0.05, 0.25, 0], head: [0, -0.35, 0], _hips: -0.5 },
        raise: { armR: [-2.618, 0, 0.524], foreR: [-0.436, 0, 0], armL: [-2.618, 0, -0.524], foreL: [-0.436, 0, 0], chest: [-0.3, 0, 0], spine: [-0.12, 0, 0], head: [-0.3, 0, 0], clawR: [1.5, 0, 0], clawL: [1.5, 0, 0], _hips: 0.5 },
        slam: { armR: [-1.222, 0, 0.209], foreR: [-0.175, 0, 0], armL: [-1.222, 0, -0.209], foreL: [-0.175, 0, 0], chest: [0.55, 0, 0], spine: [0.28, 0, 0], head: [-0.45, 0, 0], clawR: [1.5, 0, 0], clawL: [1.5, 0, 0], _hips: -1.1 },
        reach: { armR: [-1.833, 0, 0], foreR: [-0.087, 0, 0], armL: [0.524, 0, -0.524], foreL: [-1.745, 0, 0], chest: [0.25, 0.4, 0], spine: [0.1, 0.2, 0], head: [-0.1, -0.3, 0], clawR: [-0.25, 0, 0], clawL: [1.5, 0, 0], handR: [0.25, -0.5, 0], _hips: -0.5 },
      });
      base.beam = { ...base.beam, clawL: [-0.3, 0, 0], clawR: [-0.3, 0, 0] };
      base.roar = { ...base.roar, clawL: [-0.35, 0, 0], clawR: [-0.35, 0, 0] };
    }
    if (TITAN_POSES[id]) Object.assign(base, TITAN_POSES[id]);
    if (id === 'brute') base.idle = { ...base.idle, chest: [0.6, 0, 0], spine: [0.25, 0, 0], head: [-0.65, 0, 0], armL: [0.05, 0, -0.32], armR: [0.05, 0, 0.32], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], thighL: [-0.35, 0, -0.25], thighR: [-0.35, 0, 0.25], shinL: [0.45, 0, 0], shinR: [0.45, 0, 0], _hips: -0.3 };
    return base;
  }

  return { create, BOSSES, ATTACKS, IDS: Object.keys(BOSSES) };
})();
