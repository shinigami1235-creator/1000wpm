// SyntaxDress: the detail pass on Syntax Error, the World Boss (Gid, 28 Nov 2026: "bosses need revamped
// effects, design, more details and look better"). BossKit builds the body; this dresses it:
//   - the armour gets real metal: reflections from a small studio of red and cold lights, panel grooves,
//     brushed streaks, a red rim at grazing angles, and damage that builds through the five phases
//     (cracks that leak red light, charring, then white-hot cracks in the last phase)
//   - more parts, merged into one mesh per bone and material so the draw calls stay low: layered
//     pauldron lames and spikes, hydraulic pistons, forearm fins, elbow spikes, glowing talons, a
//     recessed visor with a frame, swept-back secondary horns and a crest, a gorget, chest vents,
//     dorsal heat-sink fins, exhausts, side pistons at the waist, a glowing line down the tail
//   - a broken halo of plates behind its shoulders that turns slowly and breaks apart at 25%
//   - the core: a bezel, a ring of code that turns, and a red light that lights the armour and the floor
//   - error codes floating round it, smoke and embers from the damage, a red pool of light under it
// SyntaxDress.dress(THREE, kit, { scene, renderer, glowTex, RoundedBoxGeometry, burst, reduce, calm })
//   returns { arms, body, update(t, dt, st), flash(k), dispose() }
//   arms / body: the new meshes that come off with the armour at 50% and 25% (boss3d.js shedSets)
//   st: { phase, stage, charge, roar, dead, deadT, weak, mouth }
window.SyntaxDress = (() => {
  function dress(THREE, kit, o = {}) {
    const V = THREE.Vector3, B = kit.bones, S = BossKit.BOSSES.syntax;
    const keep = [], own = x => (keep.push(x), x);
    const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    let seed = 7; const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };

    // ---------- the studio its metal reflects: dark, a cold softbox up left, red from below, teal right ----------
    let env = null;
    if (o.renderer) {
      const es = new THREE.Scene();
      const bm = c => own(new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      const box = own(new THREE.BoxGeometry(1, 1, 1));
      const room = new THREE.Mesh(box, own(new THREE.MeshBasicMaterial({ color: C('#07080b'), side: THREE.BackSide }))); room.scale.set(40, 24, 40); es.add(room);
      const panel = (c, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(box, bm(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); es.add(m); };
      panel(C('#dfe8ff', 1.25), -9, 9, 8, 9, 0.2, 7);      // the key softbox, above and to the left
      panel(C('#dfe8ff', 0.7), 10, 6, 10, 0.2, 3, 7);     // a thin strip right
      panel(C('#ff2a3a', 0.45), 0, -11, 0, 26, 0.2, 26);   // the floor glows red under it
      panel(C('#ff3a2e', 1.1), 0, 2, -19, 18, 1.2, 0.2);  // a red bar behind, for the rim
      panel(C('#3ee6ff', 0.3), 18, 2, -4, 0.2, 6, 10);    // a little teal from the arena
      const pm = new THREE.PMREMGenerator(o.renderer);
      env = pm.fromScene(es, 0.03).texture; keep.push(env);
      pm.dispose();
    }

    // ---------- materials ----------
    const U = { dmg: { value: 0 }, hot: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, rim: { value: C('#ff2a3a', 0.32) }, crack: { value: C('#ff3322', 2.2) } };
    const GL = `
      float sdH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float sdN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(sdH(i), sdH(i + vec2(1, 0)), f.x), mix(sdH(i + vec2(0, 1)), sdH(i + vec2(1, 1)), f.x), f.y); }
      // distance to the nearest cell edge of a jittered grid: thin lines that read as cracks
      float sdCrack(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); vec2 c = g + vec2(sdH(i + g), sdH(i + g + 17.0)) * 0.85 - f; float d = dot(c, c);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return sqrt(d2) - sqrt(d1); }
      uniform float uDmg; uniform float uHot; uniform float uFlash; uniform vec3 uRim; uniform vec3 uCrack;`;
    function upgrade(m, k) {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.uniforms.uDmg = U.dmg; sh.uniforms.uHot = U.hot; sh.uniforms.uFlash = U.flash; sh.uniforms.uRim = U.rim; sh.uniforms.uCrack = U.crack;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\n' + GL)
          .replace('#include <color_fragment>', `#include <color_fragment>
            vec3 dn = abs(normalize(vSN)); vec2 du = dn.x > dn.y && dn.x > dn.z ? vSP.yz : dn.y > dn.z ? vSP.xz : vSP.xy;
            // panel grooves on an uneven grid, and a rivet in the corner of some panels
            vec2 pg = du * vec2(1.15, 0.9) + 3.7; vec2 pf = fract(pg), pc = floor(pg);
            float gx = step(0.45, sdH(pc + 1.3)), gy = step(0.35, sdH(pc + 7.1));
            float groove = max((1.0 - smoothstep(0.0, 0.03, min(pf.x, 1.0 - pf.x))) * gx, (1.0 - smoothstep(0.0, 0.03, min(pf.y, 1.0 - pf.y))) * gy);
            float rivet = (1.0 - smoothstep(0.035, 0.06, length(pf - vec2(0.12, 0.88)))) * step(0.6, sdH(pc + 2.9));
            // damage: cracks open across more of the armour each phase, with scorch round them
            float cm = smoothstep(1.0 - uDmg * 0.72, 1.06 - uDmg * 0.72, sdN(du * 0.42 + 11.0));
            float ce = sdCrack(du * 0.9 + 5.0);
            float crack = (1.0 - smoothstep(0.0, 0.035 + 0.025 * uDmg, ce)) * cm * step(0.01, uDmg);
            float scorch = (1.0 - smoothstep(0.0, 0.35, ce)) * cm * uDmg;
            diffuseColor.rgb *= (1.0 - 0.55 * groove) * (1.0 - 0.6 * scorch) * (1.0 + 0.6 * rivet);
            diffuseColor.rgb *= 0.85 + 0.3 * sdN(du * 0.8 + 3.0);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = clamp(roughnessFactor * (0.72 + 0.55 * sdN(vec2(du.x * 0.6, du.y * 9.0))) + groove * 0.3 + scorch * 0.35 - rivet * 0.2, 0.08, 1.0);`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            { float fr = pow(clamp(1.0 - abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 5.0);
              totalEmissiveRadiance += uRim * fr * ${k.toFixed(2)};
              float fl = 0.75 + 0.25 * sin(vSP.y * 3.0 + uHot * 40.0);
              totalEmissiveRadiance += mix(uCrack, vec3(1.6, 1.3, 1.0), uHot * 0.6) * crack * fl * (0.6 + 0.8 * uDmg);
              totalEmissiveRadiance += vec3(1.0, 0.35, 0.3) * uFlash * (0.12 + fr * 1.3); }`);
      };
      m.customProgramCacheKey = () => 'syntax-dress-' + k;
      m.needsUpdate = true;
    }
    const kitMats = [...new Set(kit.meshes.map(x => x.material))].filter(x => x.isMeshStandardMaterial && !x.wireframe);
    const lum = x => x.color.r + x.color.g + x.color.b;
    kitMats.sort((a, b) => lum(b) - lum(a));
    const plate = kitMats[0], dark = kitMats[kitMats.length - 1];
    for (const [m, met, rough, k] of [[plate, 0.84, 0.4, 1], [dark, 0.72, 0.46, 0.7]]) {
      if (!m) continue;
      m.metalness = met; m.roughness = rough;
      if (env) { m.envMap = env; m.envMapIntensity = 1.15; }
      upgrade(m, k);
    }
    if (plate) plate.color.set('#4a515b');
    if (dark) dark.color.set('#1a1d23');
    const glow = own(new THREE.MeshBasicMaterial({ color: C('#ff2a3a', 2.6), toneMapped: false }));
    const glowHot = own(new THREE.MeshBasicMaterial({ color: C('#ff6a4a', 3.2), toneMapped: false }));
    const mouthMat = own(new THREE.MeshBasicMaterial({ color: C('#ff2a3a', 0.6), toneMapped: false }));
    const chrome = own(new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 1.4 }));
    const rubber = own(new THREE.MeshStandardMaterial({ color: '#121418', metalness: 0.2, roughness: 0.7, envMap: env, envMapIntensity: 0.6 }));

    // ---------- geometry, merged per bone and material ----------
    const RB = o.RoundedBoxGeometry;
    function cbox(w, h, d, c = 0.2, top = 1, bot = 1) {
      let g = RB ? new RB(w, h, d, 1, Math.min(c * Math.min(w, h, d), Math.min(w, h, d) * 0.45)) : new THREE.BoxGeometry(w, h, d);
      if (top !== 1 || bot !== 1) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h + 0.5, kk = bot + (top - bot) * y; p.setX(i, p.getX(i) * kk); p.setZ(i, p.getZ(i) * kk); }
      }
      return g;
    }
    const groups = new Map();
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V();
    // a part on a bone: geometry, place, turn, material, scale, and which shed set it leaves with
    function put(bone, geo, at = [0, 0, 0], rot = [0, 0, 0], mat = plate, scl = [1, 1, 1], pre = null) {
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      geo.dispose();
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      _m.compose(_s.set(...at), _q.setFromEuler(_e.set(...rot)), new V(...scl));
      if (pre) _m.premultiply(pre);
      g.applyMatrix4(_m);
      const key = bone.uuid + '|' + mat.uuid;
      if (!groups.has(key)) groups.set(key, { bone, mat, geos: [] });
      groups.get(key).geos.push(g);
    }
    function merge(geos) {
      let n = 0; for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let i = 0;
      for (const g of geos) { pos.set(g.attributes.position.array, i * 3); nor.set(g.attributes.normal.array, i * 3); i += g.attributes.position.count; g.dispose(); }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.computeBoundingBox(); out.computeBoundingSphere();
      return own(out);
    }
    const cyl = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n);
    const cone = (r, h, n = 4) => new THREE.ConeGeometry(r, h, n);
    const bar = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const W = S.chestW, H = S.chestH, D = S.chestD, F = S.fist, hd = S.head, P = S.pauldron, T = S.limb;

    // chest: a gorget round the neck, vents under the pectorals, ribs down the sides, heat-sink fins
    // and two exhausts on the back
    for (const sx of [-1, 1]) {
      put(B.chest, cbox(1.5, 0.62, 0.7, 0.3, 0.8, 1), [sx * 1.0, H / 2 + 0.05, 1.05], [-0.35, sx * 0.45, sx * 0.12], dark);
      // vents: a red glow behind dark louvres
      put(B.chest, bar(1.25, 0.62, 0.05), [sx * 1.25, -1.15, 1.3], [-0.12, sx * 0.18, 0], glow);
      put(B.chest, cbox(1.5, 0.86, 0.3, 0.3), [sx * 1.25, -1.15, 1.18], [-0.12, sx * 0.18, 0], dark);
      for (let i = 0; i < 4; i++) put(B.chest, bar(1.32, 0.07, 0.2), [sx * 1.25, -0.9 - i * 0.17, 1.36 - i * 0.02], [-0.12 + 0.5, sx * 0.18, 0], dark);
      // ribs along the flank
      for (let i = 0; i < 3; i++) put(B.chest, cbox(0.32, 0.36, 2.3, 0.3), [sx * (W * 0.5 + 0.05 - i * 0.18), 0.2 - i * 0.62, 0.1], [0, 0, sx * (0.25 + i * 0.08)], i % 2 ? plate : dark);
      // exhausts on the upper back, with a hot ring at the mouth
      put(B.chest, cyl(0.42, 0.52, 1.3, 10), [sx * 1.85, H / 2 - 0.05, -1.55], [-0.55, 0, sx * -0.15], dark);
      put(B.chest, new THREE.TorusGeometry(0.4, 0.07, 6, 14), [sx * 1.85 + sx * -0.1, H / 2 + 0.52, -1.92], [Math.PI / 2 - 0.55, 0, sx * -0.15], glow);
      put(B.chest, cyl(0.34, 0.34, 0.1, 10), [sx * 1.85 + sx * -0.1, H / 2 + 0.45, -1.86], [-0.55, 0, sx * -0.15], dark);
    }
    put(B.chest, cbox(1.3, 0.7, 0.75, 0.3, 0.75, 1), [0, H / 2 + 0.12, 1.2], [-0.45, 0, 0], plate);
    // heat-sink fins down the spine, swept back, each with a glowing back edge
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.55, h = 2.6 - Math.abs(i - 2) * 0.5;
      put(B.chest, cbox(0.16, h, 1.25, 0.25, 0.6, 1), [x, 0.3, -D / 2 - 0.35], [0.2, 0, x * -0.12], dark);
      put(B.chest, bar(0.07, h * 0.82, 0.07), [x, 0.35, -D / 2 - 0.98], [0.2, 0, x * -0.12], glow);
    }
    // the core's bezel: three bars round the triangle with a glowing inner edge, and fangs at the corners
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 3 + Math.PI / 3;   // edge midpoints of the inverted triangle
      const r = 1.05, ex = Math.cos(a) * r, ey = Math.sin(a) * r;
      put(kit.core, cbox(2.75, 0.34, 0.5, 0.3), [ex * 1.02, ey * 1.02, 0.06], [0, 0, a + Math.PI / 2], dark);
      put(kit.core, bar(2.3, 0.06, 0.06), [ex * 0.86, ey * 0.86, 0.33], [0, 0, a + Math.PI / 2], glowHot);
      const c = a + Math.PI / 3, cx = Math.cos(c) * 2.15, cy = Math.sin(c) * 2.15;
      put(kit.core, cone(0.26, 0.9, 4), [cx, cy, 0.1], [0, 0, c + Math.PI / 2], plate);
    }
    // abdomen: pistons either side from the hips up to the chest, chrome rods in dark sleeves
    for (const sx of [-1, 1]) {
      put(B.spine, cyl(0.24, 0.24, 1.3, 8), [sx * 1.75, 1.05, -0.35], [0, 0, sx * 0.12], dark);
      put(B.spine, cyl(0.13, 0.13, 1.8, 8), [sx * 1.68, 0.35, -0.35], [0, 0, sx * 0.12], chrome);
      put(B.spine, new THREE.TorusGeometry(0.25, 0.05, 5, 12), [sx * 1.72, 0.45, -0.35], [Math.PI / 2, 0, sx * 0.12], glow);
      put(B.hips, cbox(1.1, 1.0, 2.2, 0.3, 1, 0.7), [sx * 2.1, -0.35, -0.1], [0, 0, sx * 0.3], plate);
      put(B.hips, bar(0.06, 0.8, 1.9), [sx * 2.55, -0.45, -0.1], [0, 0, sx * 0.3], glow);
    }

    // head: a frame round the V visor so it sits recessed, cheek plates, a crest, swept-back horns
    // with glowing tips, and a mouth grille that lights when it roars
    for (const sx of [-1, 1]) {
      put(B.head, bar(hd * 0.5, 0.11, 0.26), [sx * hd * 0.21, hd * 0.59, hd * 0.56], [0, 0, sx * 0.32], dark);
      put(B.head, bar(hd * 0.5, 0.11, 0.26), [sx * hd * 0.21, hd * 0.41, hd * 0.55], [0, 0, sx * 0.32], dark);
      put(B.head, cbox(0.26, hd * 0.42, hd * 0.55, 0.3, 0.7, 1), [sx * hd * 0.5, hd * 0.38, hd * 0.2], [0, sx * 0.3, sx * 0.1], plate);
      put(B.head, cone(hd * 0.1, hd * 0.6, 4), [sx * hd * 0.48, hd * 0.95, -hd * 0.25], [-1.05, 0, sx * -0.95], dark);
      // the main horns' tips: same place and turn as BossKit's horns, out at the point
      const hp = new V(sx * hd * 0.38, hd * 1.12, -hd * 0.05), he = new THREE.Euler(-0.35, 0, sx * -0.38);
      const tip = new V(0, hd * 0.3, 0).applyEuler(he).add(hp);
      put(B.head, cone(hd * 0.065, hd * 0.26, 4), tip.toArray(), [-0.35, 0, sx * -0.38], glowHot);
    }
    put(B.head, cbox(0.14, hd * 0.55, hd * 0.85, 0.3, 0.5, 1), [0, hd * 1.08, -hd * 0.2], [-0.35, 0, 0], dark);
    put(B.head, bar(0.05, hd * 0.45, 0.05), [0, hd * 1.12, -hd * 0.62], [-0.35, 0, 0], glow);
    for (let i = 0; i < 4; i++) put(B.head, bar(hd * 0.05, hd * 0.2, 0.06), [(i - 1.5) * hd * 0.11, hd * 0.12, hd * 0.68], [0.15, 0, 0], mouthMat);
    put(B.neck, cyl(0.55, 0.6, 0.6, 10), [0, -0.25, 0], [0, 0, 0], rubber);
    for (let i = 0; i < 2; i++) put(B.neck, new THREE.TorusGeometry(0.6, 0.06, 5, 14), [0, -0.4 + i * 0.3, 0], [Math.PI / 2, 0, 0], i ? dark : glow);

    // arms: lames under the pauldron, spikes on it and a glowing trim; a piston on the upper arm; fins
    // and a spike on the forearm; glowing talons on the claws
    const armMeshes = new Set([B.shL, B.shR, B.armL, B.armR, B.foreL, B.foreR]);
    for (const [k, sx] of [['L', -1], ['R', 1]]) {
      const sh = B['sh' + k], ar = B['arm' + k], fo = B['fore' + k];
      put(sh, cbox(P[0] * 0.62, 0.46, P[2] * 0.78, 0.3, 0.9, 1), [sx * 1.15, -0.85, 0], [0, 0, sx * -0.42], dark);
      put(sh, cbox(P[0] * 0.5, 0.42, P[2] * 0.66, 0.3, 0.9, 1), [sx * 1.35, -1.28, 0], [0, 0, sx * -0.52], plate);
      put(sh, cone(0.42, 2.6, 4), [sx * 1.0, 3.0, -0.6], [-0.5, 0, sx * -0.45], dark);
      put(sh, cone(0.32, 1.9, 4), [sx * 1.85, 2.45, 0.2], [-0.25, 0, sx * -0.8], dark);
      put(sh, cone(0.2, 0.9, 4), [sx * 0.4, 2.85, 0.6], [0.1, 0, sx * -0.25], plate);
      put(sh, bar(0.1, 0.1, P[2] * 0.95), [sx * 2.38, -0.62, 0], [0, 0, sx * -0.18], glow);
      put(sh, bar(0.08, 1.5, 0.08), [sx * 2.5, 0.35, P[2] * 0.42], [0, 0, sx * -0.18], glow);
      // the upper arm: a piston up the back, chrome rod in a dark sleeve
      put(ar, cyl(0.22, 0.22, 1.3, 8), [0, -0.9, -T * 0.62], [0, 0, 0], dark);
      put(ar, cyl(0.11, 0.11, 2.2, 8), [0, -1.9, -T * 0.62], [0, 0, 0], chrome);
      put(ar, new THREE.TorusGeometry(0.23, 0.05, 5, 12), [0, -1.55, -T * 0.62], [Math.PI / 2, 0, 0], glow);
      // the forearm: three fins swept back along the outside, a spike off the elbow, a vent on top
      for (let i = 0; i < 3; i++) put(fo, cbox(0.14, 0.95 - i * 0.12, 1.3, 0.3, 0.4, 1), [sx * (T * 0.68), -0.55 - i * 0.78, -0.15], [0, 0, sx * 0.55], dark);
      put(fo, cone(0.32, 1.5, 4), [0, 0.0, -T * 0.72], [-2.15, 0, 0], dark);
      put(fo, bar(0.75, 0.9, 0.05), [0, -1.45, T * 0.62], [0, 0, 0], glow);
      for (let i = 0; i < 4; i++) put(fo, bar(0.95, 0.07, 0.16), [0, -1.1 - i * 0.24, T * 0.66], [0.5, 0, 0], dark);
      // talons: one glowing point on each finger and the thumb, on the claw bone so they curl with it
      const claw = B['claw' + k];
      if (claw) {
        claw.updateMatrixWorld(true);
        for (const fg of claw.children) {
          fg.updateMatrix();
          const isThumb = fg.children.length === 1;
          put(claw, cone(F * 0.05, F * 0.26, 4), isThumb ? [0, -F * 0.61, -F * 0.11] : [0, -F * 0.86, -F * 0.04], [Math.PI + (isThumb ? 0.3 : 0.35), 0, 0], glowHot, [1, 1, 1], fg.matrix);
        }
      }
    }
    // the tail: a glowing seam down the main shard and a hot point at its tip
    if (kit.tail) {
      put(kit.tail, bar(0.09, 5.6, 0.09), [0, -3.4, 0.86], [0.02, 0, 0], glow);
      put(kit.tail, bar(0.07, 3.4, 0.07), [-0.85, -2.6, 0.6], [0, 0, 0.12], glow);
      put(kit.tail, bar(0.07, 3.4, 0.07), [0.85, -2.6, 0.6], [0, 0, -0.12], glow);
    }

    // build the merged meshes
    const arms = [], body = [], dressed = [];
    for (const g of groups.values()) {
      const m = new THREE.Mesh(merge(g.geos), g.mat);
      m.userData.detail = true;
      g.bone.add(m); dressed.push(m);
      if (g.bone === kit.core) continue;                        // the core's bezel stays to the end
      (armMeshes.has(g.bone) ? arms : body).push(m);
    }

    // ---------- the halo: a broken ring of plates behind its shoulders that turns slowly ----------
    const halo = new THREE.Group(); halo.position.set(0, H / 2 + 0.6, -D / 2 - 0.95); B.chest.add(halo);
    const HS = 11, haloSeg = [];
    const hPlate = own(cbox(1.35, 0.55, 0.34, 0.3, 0.8, 1)), hGlow = own(bar(1.0, 0.06, 0.08)), hTooth = own(cone(0.16, 0.6, 4));
    const hMesh = new THREE.InstancedMesh(hPlate, dark, HS), hGlowM = new THREE.InstancedMesh(hGlow, glow, HS), hTeeth = new THREE.InstancedMesh(hTooth, dark, HS);
    for (const m of [hMesh, hGlowM, hTeeth]) { m.frustumCulled = false; halo.add(m); }
    for (let i = 0; i < HS; i++) {
      if (i === 3 || i === 8) { haloSeg.push(null); continue; }       // the breaks in the ring
      haloSeg.push({ a: i / HS * Math.PI * 2, off: new V(), vel: new V(), spin: new V(), rot: new V(), gone: 0, fall: false });
    }
    const R0 = 3.55;
    function haloTick(dt, broken, spin) {
      halo.rotation.z += dt * spin;
      const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), p = new V(), s1 = new V(1, 1, 1);
      haloSeg.forEach((h, i) => {
        if (!h) { mm.makeScale(0, 0, 0); hMesh.setMatrixAt(i, mm); hGlowM.setMatrixAt(i, mm); hTeeth.setMatrixAt(i, mm); return; }
        if (broken && !h.fall && i % 3 !== 1) { h.fall = true; h.vel.set(rnd(-2, 2), rnd(1, 3), rnd(-3, -1)); h.spin.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)); }
        if (!broken && h.fall) { h.fall = false; h.off.set(0, 0, 0); h.rot.set(0, 0, 0); h.gone = 0; }
        if (h.fall && h.gone < 1) { h.vel.y -= 9 * dt; h.off.addScaledVector(h.vel, dt); h.rot.addScaledVector(h.spin, dt); h.gone = Math.min(1, h.gone + dt / 2.4); }
        const sc = h.fall ? Math.max(0, 1 - h.gone) : 1;
        p.set(Math.cos(h.a) * R0, Math.sin(h.a) * R0, 0).add(h.off);
        ee.set(h.rot.x, h.rot.y, h.a + Math.PI / 2 + h.rot.z); qq.setFromEuler(ee);
        mm.compose(p, qq, s1.setScalar(sc)); hMesh.setMatrixAt(i, mm);
        p.set(Math.cos(h.a) * (R0 - 0.3), Math.sin(h.a) * (R0 - 0.3), 0.12).add(h.off); mm.compose(p, qq, s1.setScalar(sc)); hGlowM.setMatrixAt(i, mm);
        ee.set(h.rot.x, h.rot.y, h.a - Math.PI / 2 + h.rot.z); qq.setFromEuler(ee);
        p.set(Math.cos(h.a) * (R0 + 0.5), Math.sin(h.a) * (R0 + 0.5), 0).add(h.off); mm.compose(p, qq, s1.setScalar(sc * (i % 2 ? 1 : 0.6))); hTeeth.setMatrixAt(i, mm);
      });
      hMesh.instanceMatrix.needsUpdate = hGlowM.instanceMatrix.needsUpdate = hTeeth.instanceMatrix.needsUpdate = true;
    }
    const haloRing = new THREE.Mesh(own(new THREE.TorusGeometry(R0 - 0.55, 0.035, 4, 90, Math.PI * 1.6)), glow);
    halo.add(haloRing);

    // ---------- the core: a ring of code that turns round it, and a light that pulses ----------
    const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = own(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; return t; };
    // symbols and hex only, nothing that reads as a word to type (red words are the block words)
    const CODE = ['0xDEAD', '0xFF', 'NULL', '404', '0x0F', '{ }', '</>', 'NaN', '!=', '0x00', '&&', '>>', '#!', '::', '0b101', 'EOF'];
    const ringTex = tex(1024, 64, (g, w, h) => {
      g.fillStyle = '#fff'; g.font = 'bold 40px monospace'; g.textBaseline = 'middle';
      let x = 6; for (let i = 0; x < w - 40; i++) { const s = CODE[i % CODE.length] + ' '; g.fillText(s, x, h / 2 + 2); x += g.measureText(s).width; }
    });
    ringTex.wrapS = THREE.RepeatWrapping;
    const ringMat = own(new THREE.MeshBasicMaterial({ map: ringTex, color: C('#ff3a3a', 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const codeRing = new THREE.Mesh(own(new THREE.CylinderGeometry(2.35, 2.35, 0.36, 64, 1, true)), ringMat);
    codeRing.rotation.x = Math.PI / 2; codeRing.position.z = 0.75; kit.core.add(codeRing);
    const coreLight = new THREE.PointLight('#ff2a3a', 12, 11, 1.8);
    coreLight.position.set(0, 0, 1.6); kit.core.add(coreLight);
    const visorGlow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: o.glowTex, color: C('#ff2a3a', 1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false })));
    visorGlow.position.set(0, hd * 0.5, hd * 0.75); visorGlow.scale.set(2.6, 1.0, 1); B.head.add(visorGlow);
    const tipGlow = kit.tail ? new THREE.Sprite(own(new THREE.SpriteMaterial({ map: o.glowTex, color: C('#ff2a3a', 1.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false }))) : null;
    if (tipGlow) { tipGlow.position.set(0, -7.4, 0); tipGlow.scale.setScalar(2.4); kit.tail.add(tipGlow); }

    // ---------- in the arena: error codes floating round it, smoke and embers, a pool of red light ----------
    const scene = o.scene;
    const glyphTex = tex(512, 512, (g, w, h) => {
      g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center';
      CODE.forEach((s, i) => { const cx = (i % 2) * 256 + 128, cy = Math.floor(i / 2) * 64 + 32; g.font = `bold ${s.length > 7 ? 30 : 38}px monospace`; g.fillText(s, cx, cy); });
    });
    const GN = 22;
    const glyphMat = own(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glyphTex }, uCol: { value: C('#ff3a3a', 1.6) } },
      vertexShader: `attribute float aCell; attribute float aA; varying vec2 vUv; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0); float s = length(instanceMatrix[0].xyz);
          mv.xy += position.xy * vec2(4.0, 1.0) * s; vA = aA;
          vUv = vec2((uv.x + mod(aCell, 2.0)) / 2.0, 1.0 - (floor(aCell / 2.0) + 1.0 - uv.y) / 8.0);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; varying vec2 vUv; varying float vA;
        void main(){ float a = texture2D(uMap, vUv).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const glyphGeo = own(new THREE.PlaneGeometry(1, 1));
    glyphGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(GN).map(() => Math.floor(rnd(0, 16))), 1));
    const glyphA = new THREE.InstancedBufferAttribute(new Float32Array(GN), 1); glyphA.setUsage(THREE.DynamicDrawUsage);
    glyphGeo.setAttribute('aA', glyphA);
    const glyphs = new THREE.InstancedMesh(glyphGeo, glyphMat, GN); glyphs.frustumCulled = false;
    const gData = Array.from({ length: GN }, (_, i) => ({ r: rnd(10, 14), a: rnd(0, 6.3), y: rnd(8, 19), w: rnd(0.08, 0.22) * (i % 2 ? 1 : -1), ph: rnd(0, 6), s: rnd(0.35, 0.6), life: rnd(4, 9) }));
    if (scene) scene.add(glyphs);

    // smoke (dark, soft) and embers (hot, small) as two point clouds, pooled
    const softTex = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    function cloud(n, mat) {
      const geo = own(new THREE.BufferGeometry());
      const pos = new Float32Array(n * 3).fill(-999), dat = new Float32Array(n * 2);   // dat: age 0..1, size
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aD', new THREE.BufferAttribute(dat, 2).setUsage(THREE.DynamicDrawUsage));
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
      if (scene) scene.add(pts);
      return { n, pos, dat, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), i: 0, geo, pts };
    }
    const pv = `attribute vec2 aD; varying float vAge; uniform float uScale;
      void main(){ vAge = aD.x; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aD.y * uScale / -mv.z * (0.4 + aD.x * 1.2); }`;
    const smokeMat = own(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softTex }, uScale: { value: 300 }, uCol: { value: C('#120d0e') } },
      vertexShader: pv,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; varying float vAge;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a * smoothstep(0.0, 0.12, vAge) * (1.0 - vAge) * 0.55; if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vec3(0.5, 0.08, 0.05), uCol, smoothstep(0.0, 0.3, vAge)), a); }`,
      transparent: true, depthWrite: false,
    }));
    const emberMat = own(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softTex }, uScale: { value: 300 } },
      vertexShader: pv.replace('(0.4 + aD.x * 1.2)', '(1.0 - aD.x * 0.7)'),
      fragmentShader: `uniform sampler2D uMap; varying float vAge;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a * (1.0 - vAge); if (a < 0.02) discard;
          gl_FragColor = vec4(mix(vec3(2.4, 1.6, 0.9), vec3(1.6, 0.2, 0.1), vAge) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const smoke = cloud(150, smokeMat), embers = cloud(140, emberMat);
    function emit(c, at, vel, life, size) {
      const i = c.i = (c.i + 1) % c.n;
      c.pos[i * 3] = at.x; c.pos[i * 3 + 1] = at.y; c.pos[i * 3 + 2] = at.z;
      c.vel[i * 3] = vel.x; c.vel[i * 3 + 1] = vel.y; c.vel[i * 3 + 2] = vel.z;
      c.life[i] = c.max[i] = life; c.dat[i * 2] = 0; c.dat[i * 2 + 1] = size;
    }
    function cloudTick(c, dt, drag, lift) {
      for (let i = 0; i < c.n; i++) {
        if (c.life[i] <= 0) continue;
        c.life[i] -= dt;
        if (c.life[i] <= 0) { c.pos[i * 3 + 1] = -999; continue; }
        c.vel[i * 3 + 1] += lift * dt;
        const k = Math.exp(-drag * dt);
        c.vel[i * 3] *= k; c.vel[i * 3 + 1] *= k; c.vel[i * 3 + 2] *= k;
        c.pos[i * 3] += c.vel[i * 3] * dt; c.pos[i * 3 + 1] += c.vel[i * 3 + 1] * dt; c.pos[i * 3 + 2] += c.vel[i * 3 + 2] * dt;
        c.dat[i * 2] = 1 - c.life[i] / c.max[i];
      }
      c.geo.attributes.position.needsUpdate = true; c.geo.attributes.aD.needsUpdate = true;
    }
    // where the damage smokes from, by phase: a shoulder, the chest, the exhausts, the other shoulder, the head
    const vents = [[B.shR, new V(1.4, 1.6, 0.6), 1], [B.chest, new V(-1.4, 0.4, 1.4), 1], [B.chest, new V(1.85, H / 2 + 0.6, -1.95), 0],
      [B.chest, new V(-1.85, H / 2 + 0.6, -1.95), 0], [B.shL, new V(-1.6, 1.4, -0.5), 2], [B.chest, new V(0.9, -1.4, 1.2), 2], [B.head, new V(0.5, hd * 1.1, 0), 3], [B.spine, new V(-1.4, 0.6, 0.6), 3]];

    // a pool of red light on the floor under it, and a darker contact shadow
    const poolTex = tex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    const poolMat = own(new THREE.MeshBasicMaterial({ map: poolTex, color: C('#ff2a3a', 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const shadowMat = own(new THREE.MeshBasicMaterial({ map: poolTex, color: '#000000', transparent: true, opacity: 0.6, depthWrite: false }));
    const pool = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), poolMat); pool.rotation.x = -Math.PI / 2; pool.renderOrder = -1;
    const shadow = new THREE.Mesh(pool.geometry, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = -2;
    if (scene) { scene.add(shadow); scene.add(pool); }

    // ---------- each frame ----------
    const wp = new V(), vv = new V(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new V();
    let dmg = 0, flashK = 0, smokeAcc = 0, emberAcc = 0, visorK = 1, flick = 0, deadHide = false;
    const DMG = [0, 0.42, 0.7, 0.85, 1];
    function update(t, dt, st = {}) {
      const ph = st.phase || 0, dead = !!st.dead;
      dmg += ((dead ? 1 : DMG[ph] || 0) - dmg) * Math.min(1, dt * 1.5);
      U.dmg.value = dmg;
      U.hot.value = ph >= 4 || dead ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
      flashK = Math.max(0, flashK - dt * 6);
      U.flash.value = flashK;
      U.rim.value.setRGB(1, 0.16, 0.22).multiplyScalar(0.07 + 0.3 * (st.charge || 0) + 0.12 * (st.roar || 0) + (st.weak ? 0.12 : 0));
      // the visor flickers more as it breaks down, and flares on a roar
      if (dmg > 0.45 && !o.reduce && Math.random() < dt * (1 + dmg * 5)) flick = 0.06 + Math.random() * 0.1;
      flick = Math.max(0, flick - dt);
      visorK = dead ? Math.max(0, 1 - (st.deadT || 0) / 2.2) * (Math.random() < 0.3 ? 0.2 : 1) : (flick > 0 ? 0.25 : 1);
      visorGlow.material.opacity = (0.28 + 0.6 * (st.roar || 0) + 0.3 * (st.charge || 0)) * visorK;
      visorGlow.scale.set(2.6 + 2.4 * (st.roar || 0), 1.0 + 0.6 * (st.roar || 0), 1);
      mouthMat.color.setRGB(1, 0.16, 0.22).multiplyScalar((0.5 + 2.6 * Math.max(st.roar || 0, st.mouth || 0)) * visorK);
      glow.color.setRGB(1, 0.16, 0.22).multiplyScalar(2.6 * (dead ? Math.max(0.2, visorK) : 1) * (1 + 0.25 * U.hot.value));
      // the core light pulses, swells with a charge and runs white-hot at the end
      const beat = 0.8 + 0.2 * Math.sin(t * (3 + ph)) ;
      // dying, the core overloads: its light climbs, flickers and runs white until it blows
      const dT = st.deadT || 0, over = dead ? Math.min(1, dT / 2.2) : 0;
      coreLight.intensity = dead ? (dT < 2.25 ? (12 + 140 * over * over) * (0.7 + 0.3 * Math.random()) : 0) : (10 + 30 * (st.charge || 0) + 8 * (st.weak ? 1 : 0)) * beat;
      coreLight.color.setRGB(1, 0.17 + 0.25 * U.hot.value + 0.7 * over, 0.2 + 0.15 * U.hot.value + 0.6 * over);
      codeRing.rotation.y += dt * (0.35 + ph * 0.18 + (st.charge || 0) * 2.5);
      ringMat.opacity = dead ? Math.max(0, 1 - (st.deadT || 0)) : 0.85;
      ringTex.offset.x = (ringTex.offset.x + dt * 0.02) % 1;
      haloTick(dt, (st.stage || 0) >= 3 || dead, (0.12 + ph * 0.05) * (o.reduce ? 0.3 : 1));
      haloRing.visible = (st.stage || 0) < 3 && !dead;
      if (tipGlow) tipGlow.material.opacity = (0.45 + 0.2 * Math.sin(t * 5)) * (dead ? 0 : 1);

      // the pool of light and the shadow under it
      kit.group.getWorldPosition(wp);
      const sc = kit.group.getWorldScale(vv).x;
      pool.position.set(wp.x, 0.07, wp.z); pool.scale.setScalar(11 * sc + 4 * (st.charge || 0));
      poolMat.opacity = dead ? 0 : 0.22 + 0.1 * beat + 0.3 * (st.charge || 0);
      shadow.position.set(wp.x, 0.06, wp.z); shadow.scale.setScalar(9 * sc);

      // error codes drifting round it, fading in and out, jittering more as it breaks
      for (let i = 0; i < GN; i++) {
        const g = gData[i];
        g.a += g.w * dt * (o.reduce ? 0.3 : 1); g.ph += dt;
        const u = (g.ph % g.life) / g.life;
        const jit = ph >= 3 && !o.reduce && Math.random() < 0.08 ? (Math.random() - 0.5) * 0.8 : 0;
        s4.set(wp.x + Math.cos(g.a) * g.r + jit, g.y + Math.sin(t * 0.4 + i) * 0.5, wp.z + Math.sin(g.a) * g.r * 0.7);
        m4.compose(s4, q4, vv.setScalar(g.s * (dead ? 0 : 1)));
        glyphs.setMatrixAt(i, m4);
        glyphA.array[i] = Math.sin(u * Math.PI) * (0.14 + 0.16 * Math.min(1, ph / 3)) * (ph >= 4 && Math.random() < 0.15 ? 0.2 : 1);
      }
      glyphs.instanceMatrix.needsUpdate = true; glyphA.needsUpdate = true;

      // smoke and embers from the damage: more vents open each phase
      if (!o.reduce) {
        smokeAcc += dt * (dead ? 30 : ph * 7 + (st.charge || 0) * 6);
        emberAcc += dt * (dead ? 40 : ph * 6);
        kit.group.updateMatrixWorld(true);
        while (smokeAcc > 1) {
          smokeAcc -= 1;
          const live = vents.filter(v => v[2] <= Math.max(0, ph - 1) || dead);
          if (!live.length) break;
          const v = live[Math.floor(Math.random() * live.length)];
          v[0].localToWorld(wp.copy(v[1]));
          emit(smoke, wp, vv.set(rnd(-0.6, 0.6), rnd(1.2, 2.6), rnd(-0.8, 0.2)), rnd(2.2, 3.6), rnd(5, 9));
        }
        while (emberAcc > 1) {
          emberAcc -= 1;
          const live = vents.filter(v => v[2] <= ph || dead);
          const v = live[Math.floor(Math.random() * live.length)];
          v[0].localToWorld(wp.copy(v[1]));
          emit(embers, wp, vv.set(rnd(-2, 2), rnd(1, 4), rnd(-1.5, 1.5)), rnd(0.6, 1.4), rnd(0.8, 1.6));
        }
      }
      cloudTick(smoke, dt, 0.6, 0.6);
      cloudTick(embers, dt, 0.4, -3);
      const px = (o.renderer ? o.renderer.domElement.height : 600) / 2;
      smokeMat.uniforms.uScale.value = px; emberMat.uniforms.uScale.value = px;
    }
    // a hit on the armour: it flashes hot at the edges for a moment
    function flash(k = 1) { flashK = Math.max(flashK, Math.min(1.2, k)); }
    // a burst of smoke and embers at a point, for the death and big hits
    function puff(at, n = 12, power = 1) {
      for (let i = 0; i < n; i++) {
        emit(smoke, at, vv.set(rnd(-3, 3) * power, rnd(0.5, 3.5) * power, rnd(-3, 3) * power), rnd(1.6, 3.2), rnd(6, 12) * Math.sqrt(power));
        emit(embers, at, vv.set(rnd(-6, 6) * power, rnd(2, 8) * power, rnd(-6, 6) * power), rnd(0.6, 1.6), rnd(0.8, 1.8));
      }
    }
    function dispose() {
      for (const x of [glyphs, smoke.pts, embers.pts, pool, shadow]) if (x.parent) x.parent.remove(x);
      keep.forEach(x => x.dispose && x.dispose());
    }
    return { arms, body, dressed, update, flash, puff, dispose, U, coreLight, halo, visorGlow, smoke, embers, env };
  }
  return { dress };
})();
