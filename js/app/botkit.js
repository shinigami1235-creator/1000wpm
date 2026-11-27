// BotKit: the operators' bots (27 Nov 2026), from Art's sheet of six. Each operator runs one bot in a
// fight. White hard-shell bodies, a pixel screen for a face, and seams that glow in the operator's own
// colour (red stays for corruption and the bosses).
//   orbit  Orbit  Sentinel: a sphere with a halo and side fins; carries the shield
//   pixel  Pixel  Precision: a boxy monitor with a second screen on its side and two antennas
//   nova   Nova   Striker: a sphere with four big blades and a side ring
//   kite   Kite   Ghost: a round head under a wide brimmed hat, with a scarf and a ribbon
//   beep   Beep   Architect: a round body with long ears and a medic pod
//   raze   Raze   Hunter: a dome with a ring eye hanging over six bladed legs
//
//   const b = BotKit.create(THREE, 'orbit', { color: '#8cff58', scale: 1, ...look })
//   look (all optional, see BotKit.OPTIONS):
//     shell   'white' | 'gunmetal' | 'black' | 'chrome' | 'twotone'
//     eyes    the resting face: 'own' (the bot's own) | 'round' | 'square' | 'slit' | 'visor'
//     screen  the face colour, '#rrggbb' (default: the glow colour, lightened)
//     sig     0 or 1, the style of the bot's signature part (halo, antennas, blades, hat, ears, legs)
//     back    'none' | 'wings' | 'pack'
//     marks   { stickers: [ids from BotKit.STICKERS], wear: 0..1 } battle marks, earned in fights
//   scene.add(b.group)          b.group sits at the bot's centre; move it to fly the bot
//   b.update(t, dt, { vel })    idle motion; vel (THREE.Vector3, units/s) leans the body into a dash
//   b.face('happy')             happy, calm, focus, angry, hurt, heart, blink, x
//   b.hit(dir, t)               knocked back along dir at time t: spins, flashes, face goes hurt
//   b.dispose()
// THREE.RoundedBoxGeometry is used when the caller passes it in (as BossKit's callers do).
window.BotKit = (() => {
  const BOTS = {
    orbit: { name: 'Orbit', role: 'Shield', division: 'Sentinel', face: 'happy' },
    pixel: { name: 'Pixel', role: 'Hack', division: 'Precision', face: 'calm' },
    nova: { name: 'Nova', role: 'Attack', division: 'Striker', face: 'angry' },
    kite: { name: 'Kite', role: 'Control', division: 'Ghost', face: 'focus' },
    beep: { name: 'Beep', role: 'Heal', division: 'Architect', face: 'heart' },
    raze: { name: 'Raze', role: 'Finisher', division: 'Hunter', face: 'focus' },
  };

  // what the hangar offers; the first of each is the default
  const OPTIONS = {
    shell: [['white', 'White'], ['gunmetal', 'Gunmetal'], ['black', 'Matte black'], ['chrome', 'Chrome'], ['twotone', 'Two-tone']],
    eyes: [['own', 'Its own'], ['round', 'Round'], ['square', 'Square'], ['slit', 'Slit'], ['visor', 'Visor']],
    back: [['none', 'None'], ['wings', 'Wings'], ['pack', 'Thruster pack']],
    sig: {
      orbit: ['Halo', 'Single ring', 'Double ring'], pixel: ['Antennas', 'Twin spikes', 'Dish'], nova: ['Blades', 'Long', 'Swept back'],
      kite: ['Hat', 'Straw hat', 'Hood'], beep: ['Ears', 'Long', 'Floppy'], raze: ['Legs', 'Blades', 'Pistons'],
    },
  };
  const SHELLS = {
    white: [['#d8dce2', 0.38, 0.25], ['#aeb4bd', 0.45, 0.3]],
    gunmetal: [['#4d535c', 0.32, 0.75], ['#30353c', 0.4, 0.7]],
    black: [['#1f2226', 0.75, 0.15], ['#2b2f35', 0.7, 0.2]],
    chrome: [['#b8bec7', 0.14, 1.0], ['#8d949e', 0.2, 1.0]],
    twotone: [['#d8dce2', 0.38, 0.25], ['#2a3039', 0.5, 0.4]],
  };
  // battle marks: one sticker per kind of boss repaired, drawn as a small badge
  const STICKERS = { syntax: 'Syntax Error', titan: 'Siege Titan', warden: 'Firewall Warden', king: 'Kernel King', streak: '10-win streak', founder: 'Season 1' };

  // ---------- pixel faces: two eyes on a 32 x 20 grid ----------
  const W = 32, H = 20;
  function eyeCells(kind, side) {   // side -1 left eye, 1 right eye; cells in an 8 x 8 box
    const c = [];
    const add = (x, y) => c.push([x, y]);
    if (kind === 'happy') for (let x = 0; x < 8; x++) { const y = Math.round(2 + Math.abs(x - 3.5) * 0.75); add(x, 6 - y + 2); add(x, 7 - y + 2); }
    else if (kind === 'calm') { for (let x = 1; x < 7; x++) for (let y = 1; y < 7; y++) if (!((x === 1 || x === 6) && (y === 1 || y === 6))) add(x, y); }
    else if (kind === 'focus') { for (let x = 0; x < 8; x++) for (let y = 3; y < 6; y++) add(x, y); }
    else if (kind === 'square') { for (let x = 1; x < 7; x++) for (let y = 1; y < 7; y++) add(x, y); }
    else if (kind === 'slit') { for (let x = 0; x < 8; x++) { add(x, 4); if (x > 0 && x < 7) add(x, 3); } }
    else if (kind === 'angry') { for (let x = 0; x < 8; x++) { const top = side < 0 ? Math.round(1 + x * 0.45) : Math.round(1 + (7 - x) * 0.45); for (let y = top; y < 7; y++) add(x, y); } }
    else if (kind === 'blink') { for (let x = 0; x < 8; x++) add(x, 5); }
    else if (kind === 'heart') { const m = ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...']; m.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') add(x, y); })); }
    else if (kind === 'hurt') { for (let i = 0; i < 7; i++) { const y = i < 4 ? i : 6 - i; add(side < 0 ? i : 7 - i, y + 2); add(side < 0 ? i : 7 - i, y + 1); } }
    else if (kind === 'x') { for (let i = 0; i < 8; i++) { add(i, i); add(7 - i, i); } }
    return c;
  }
  function drawFace(ctx, kind, col) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = col;
    if (kind === 'visor') { ctx.fillRect(5, 8, 22, 3); ctx.globalAlpha = 0.45; ctx.fillRect(5, 11, 22, 1); ctx.globalAlpha = 1; return; }
    for (const [side, x0] of [[-1, 6], [1, 18]]) for (const [x, y] of eyeCells(kind, side)) ctx.fillRect(x0 + x, 6 + y - 1, 1, 1);
  }

  function stickerTex(THREE, kind, glowCol) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const col = '#' + glowCol.getHexString();
    g.fillStyle = '#f2f4f6'; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); } g.closePath(); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#111'; g.stroke();
    g.fillStyle = kind === 'syntax' ? '#ff3a46' : '#15181c'; g.strokeStyle = g.fillStyle; g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath();
    if (kind === 'syntax') { g.moveTo(32, 14); g.lineTo(50, 46); g.lineTo(14, 46); g.closePath(); g.fill(); }
    else if (kind === 'titan') { g.fillRect(17, 20, 30, 24); g.clearRect(25, 28, 14, 6); }
    else if (kind === 'warden') { g.moveTo(32, 13); g.lineTo(48, 20); g.lineTo(45, 38); g.lineTo(32, 50); g.lineTo(19, 38); g.lineTo(16, 20); g.closePath(); g.fill(); }
    else if (kind === 'king') { g.moveTo(14, 44); g.lineTo(16, 20); g.lineTo(25, 32); g.lineTo(32, 16); g.lineTo(39, 32); g.lineTo(48, 20); g.lineTo(50, 44); g.closePath(); g.fill(); }
    else if (kind === 'streak') { g.fillStyle = col; g.moveTo(36, 10); g.lineTo(18, 36); g.lineTo(30, 36); g.lineTo(26, 54); g.lineTo(46, 26); g.lineTo(34, 26); g.closePath(); g.fill(); }
    else { g.fillStyle = col; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S1', 32, 34); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function scratchTex(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(20,22,26,0.75)'; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.lineWidth = 2.2 - i * 0.6; g.beginPath(); g.moveTo(10 + i * 4, 18 + i * 12); g.quadraticCurveTo(32, 26 + i * 10, 54 - i * 3, 22 + i * 13); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function create(THREE, id, opts = {}) {
    const def = BOTS[id] || BOTS.orbit, sc = opts.scale || 1;
    const V = THREE.Vector3, keep = [], own = x => (keep.push(x), x);
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const GLOW = new THREE.Color(opts.color || '#8cff58');
    const hdr = k => GLOW.clone().multiplyScalar(k);
    const group = new THREE.Group(); group.name = 'bot-' + id;
    const body = new THREE.Group(); group.add(body);   // tilts and spins inside the group
    body.scale.setScalar(sc);

    // materials: white shell, dark joints, glow
    const SH = SHELLS[opts.shell] || SHELLS.white, sig = opts.sig ? 1 : 0;
    const shell = own(new THREE.MeshStandardMaterial({ color: SH[0][0], roughness: SH[0][1], metalness: SH[0][2] }));
    const shell2 = own(new THREE.MeshStandardMaterial({ color: SH[1][0], roughness: SH[1][1], metalness: SH[1][2] }));
    const dark = own(new THREE.MeshStandardMaterial({ color: '#16191e', roughness: 0.5, metalness: 0.5 }));
    const glow = own(new THREE.MeshBasicMaterial({ color: hdr(1.6), toneMapped: false }));
    const glowSoft = own(new THREE.MeshBasicMaterial({ color: hdr(1.0), toneMapped: false, transparent: true, opacity: 0.6 }));
    const mesh = (geo, mat, parent = body) => { const m = new THREE.Mesh(own(geo), mat); parent.add(m); return m; };
    const rbox = (w, h, d, r) => THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);

    // the face screen
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), tex = own(new THREE.CanvasTexture(cv));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const faceCol = opts.screen || '#' + GLOW.clone().lerp(new THREE.Color('#ffffff'), 0.55).getHexString();
    const EYES = { round: 'calm', square: 'square', slit: 'slit', visor: 'visor' };
    const rest = EYES[opts.eyes] || def.face;   // the resting face
    const screenMat = own(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false }));
    let faceNow = '';
    function face(kind) { if (kind === faceNow) return; faceNow = kind; drawFace(ctx, kind, faceCol); tex.needsUpdate = true; }
    // a curved screen on the front of a sphere of radius r
    const sphereScreen = (r, wide, tall, parent = body) => {
      const g = new THREE.SphereGeometry(r, 24, 16, Math.PI / 2 - wide / 2, wide, Math.PI / 2 - tall / 2, tall);
      const visor = mesh(new THREE.SphereGeometry(r * 0.995, 24, 16, Math.PI / 2 - wide / 2 - 0.12, wide + 0.24, Math.PI / 2 - tall / 2 - 0.1, tall + 0.2), dark, parent);
      visor.scale.setScalar(1.0);
      return mesh(g, screenMat, parent);
    };
    const ring = (r, tube, mat, parent = body) => mesh(new THREE.TorusGeometry(r, tube, 8, 48), mat, parent);
    const cone = (r, h, mat, seg = 4, parent = body) => mesh(new THREE.ConeGeometry(r, h, seg), mat, parent);
    const thruster = (y, r = 0.32) => { const t = ring(r, 0.05, glow); t.rotation.x = Math.PI / 2; t.position.y = y; const c = mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.95, 0.18, 16), dark); c.position.y = y + 0.08; return t; };
    const parts = {};   // pieces the idle motion moves

    if (id === 'orbit') {
      mesh(new THREE.SphereGeometry(1, 32, 24), shell);
      sphereScreen(1.012, 1.9, 1.25);
      const band = ring(1.005, 0.035, glow); band.rotation.x = Math.PI / 2; band.position.y = -0.55; band.scale.setScalar(0.835);
      parts.halo = new THREE.Group(); body.add(parts.halo); parts.halo.position.y = 1.45;
      const h1 = ring(0.62, 0.045, glow, parts.halo); h1.rotation.x = Math.PI / 2;
      if (sig) { h1.scale.setScalar(0.8); const h2 = ring(0.72, 0.03, glow, parts.halo); h2.rotation.x = Math.PI / 2 + 0.35; h1.rotation.y = -0.2; }
      for (const s of [-1, 1]) {   // side fins and ear pods
        const pod = mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.3, 16), dark); pod.rotation.z = Math.PI / 2; pod.position.x = s * 1.0;
        const fin = cone(0.22, 1.1, shell2); fin.rotation.z = -s * Math.PI / 2; fin.position.x = s * 1.6; fin.scale.z = 0.35;
        const edge = cone(0.05, 0.9, glow, 4); edge.rotation.z = -s * Math.PI / 2; edge.position.set(s * 1.62, -0.07, 0);
        const top = cone(0.16, 0.6, shell2); top.position.set(s * 0.55, 0.95, -0.1); top.rotation.z = s * 0.5; top.scale.z = 0.5;
      }
      thruster(-1.0);
    } else if (id === 'pixel') {
      mesh(rbox(1.9, 1.35, 1.35, 0.18), shell);
      const bezel = mesh(rbox(1.5, 1.0, 0.1, 0.05), dark); bezel.position.z = 0.66;
      const scr = mesh(new THREE.PlaneGeometry(1.36, 0.86), screenMat); scr.position.z = 0.72;
      const side = mesh(rbox(0.12, 0.8, 0.95, 0.04), dark); side.position.x = 0.97;
      const cvs = document.createElement('canvas'); cvs.width = 32; cvs.height = 24; const c2 = cvs.getContext('2d');
      c2.fillStyle = '#000'; c2.fillRect(0, 0, 32, 24); c2.fillStyle = faceCol; c2.font = 'bold 15px monospace'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(sig ? '>_' : '</>', 16, 13);
      const t2 = own(new THREE.CanvasTexture(cvs)); t2.colorSpace = THREE.SRGBColorSpace;
      const sideScr = mesh(new THREE.PlaneGeometry(0.85, 0.66), own(new THREE.MeshBasicMaterial({ map: t2, color: new THREE.Color(2, 2, 2), toneMapped: false }))); sideScr.position.x = 1.035; sideScr.rotation.y = Math.PI / 2;
      if (!sig) for (const [x, z, h, rz] of [[-0.55, -0.2, 1.1, 0.35], [0.6, -0.3, 0.8, -0.3]]) { const a = cone(0.09, h, dark, 6); a.position.set(x, 0.68 + h / 2, z); a.rotation.z = rz; }
      else {
        const mast = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), dark); mast.position.set(0.35, 0.9, -0.2);
        const dish = mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, 1.0), shell2); dish.material.side = THREE.DoubleSide; dish.position.set(0.35, 1.05, -0.2); dish.rotation.set(-0.6, 0, 0.5);
        const tip = mesh(new THREE.SphereGeometry(0.06, 10, 8), glow); tip.position.set(0.42, 1.2, -0.05);
      }
      const ear = mesh(rbox(0.16, 0.6, 0.6, 0.05), shell2); ear.position.set(-0.99, 0, -0.05);
      const strip = mesh(new THREE.BoxGeometry(1.4, 0.04, 0.04), glow); strip.position.set(0, -0.69, 0.55);
      thruster(-0.82, 0.38);
    } else if (id === 'nova') {
      mesh(new THREE.SphereGeometry(0.95, 32, 24), shell);
      sphereScreen(0.962, 1.7, 0.9);
      const brow = mesh(new THREE.SphereGeometry(0.99, 24, 12, Math.PI / 2 - 1.0, 2.0, 0.35, 0.55), shell2);   // armour cap over the eyes
      for (const [x, y, rz, s] of [[1, 1, -0.75, 1.2], [-1, 1, 0.75, 1.0], [1, -1, -2.4, 1.0], [-1, -1, 2.4, 1.2]]) {
        const L = sig ? 1.05 : 1.6, back = sig ? -0.45 : -0.15, pull = sig ? 0.92 : 1;
        const blade = cone(0.32, L * s, shell2, 4); blade.scale.z = 0.25; blade.position.set(x * 1.15 * pull, y * 0.95 * pull, back); blade.rotation.z = rz; if (sig) blade.rotation.x = -0.7;
        const e = cone(0.035, L * 0.75 * s, glow, 4); e.position.set(x * 1.18 * pull, y * 0.98 * pull, back + 0.1); e.rotation.z = rz; if (sig) e.rotation.x = -0.7;
      }
      const gun = ring(0.36, 0.09, dark); gun.rotation.y = Math.PI / 2; gun.position.x = 1.0;
      const gunGlow = ring(0.25, 0.05, glow); gunGlow.rotation.y = Math.PI / 2; gunGlow.position.x = 1.08;
      thruster(-0.95, 0.28);
    } else if (id === 'kite') {
      mesh(new THREE.SphereGeometry(0.95, 32, 24), dark);
      sphereScreen(0.962, 1.6, 0.75).position.y = -0.08;
      parts.hat = new THREE.Group(); body.add(parts.hat); parts.hat.position.set(0, 0.72, -0.15); parts.hat.rotation.x = -0.38;
      if (!sig) {
        mesh(new THREE.ConeGeometry(1.45, 0.8, 40, 1), shell, parts.hat).position.y = 0.15;
        const under = mesh(new THREE.CircleGeometry(1.42, 40), dark, parts.hat); under.rotation.x = Math.PI / 2; under.position.y = -0.24;   // the hat's underside
        const brim = ring(1.45, 0.035, glow, parts.hat); brim.rotation.x = Math.PI / 2; brim.position.y = -0.25;
        const crown = cone(0.1, 0.3, glow, 4, parts.hat); crown.position.y = 0.62;
      } else {   // a hood over the head with a peak at the front
        parts.hat.position.set(0, 0.05, 0); parts.hat.rotation.x = 0;
        const hood = mesh(new THREE.SphereGeometry(1.08, 32, 16, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.62), shell, parts.hat); hood.material = shell; hood.rotation.y = 0;
        const lip = mesh(new THREE.TorusGeometry(1.0, 0.035, 6, 48, Math.PI * 1.25), glow, parts.hat); lip.rotation.set(-0.9, 0, Math.PI * 0.12 + Math.PI); lip.position.set(0, 0.32, 0.22);
        const peak = cone(0.16, 0.5, shell2, 4, parts.hat); peak.position.set(0, 1.12, -0.25); peak.rotation.x = -0.5;
      }
      const scarf = mesh(new THREE.CylinderGeometry(0.95, 0.6, 0.55, 24, 1, true), own(new THREE.MeshStandardMaterial({ color: '#aeb4bd', roughness: 0.6, side: THREE.DoubleSide }))); scarf.position.y = -0.7;
      const sEdge = ring(0.61, 0.03, glow); sEdge.rotation.x = Math.PI / 2; sEdge.position.y = -0.97;
      parts.ribbon = new THREE.Group(); body.add(parts.ribbon); parts.ribbon.position.set(-0.6, -0.85, 0.4);
      const rib = mesh(new THREE.BoxGeometry(0.28, 0.9, 0.04), shell2, parts.ribbon); rib.position.y = -0.45;
      const ribG = mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), glow, parts.ribbon); ribG.position.set(0, -0.45, 0.01);
    } else if (id === 'beep') {
      const b0 = mesh(new THREE.SphereGeometry(1, 32, 24), shell); b0.scale.set(1.08, 0.95, 1);
      sphereScreen(1.012, 1.75, 1.1).scale.set(1.08, 0.95, 1);
      parts.ears = [];
      for (const s of [-1, 1]) {
        const ear = new THREE.Group(); body.add(ear); ear.position.set(s * 0.42, 0.75, -0.1); parts.ears.push(ear);
        const e = mesh(new THREE.CapsuleGeometry(0.17, sig ? 0.55 : 1.2, 4, 12), shell, ear); e.position.y = sig ? 0.4 : 0.75; e.scale.z = 0.45;
        const ei = mesh(new THREE.CapsuleGeometry(0.04, sig ? 0.4 : 0.9, 4, 8), glowSoft, ear); ei.position.set(0, sig ? 0.4 : 0.75, 0.07); ei.scale.z = 0.4;
        if (sig) {   // the top half folds over and hangs down the side
          const fold = new THREE.Group(); ear.add(fold); fold.position.y = 0.72; fold.rotation.z = -s * 2.3;
          const e2 = mesh(new THREE.CapsuleGeometry(0.17, 0.55, 4, 12), shell, fold); e2.position.y = 0.38; e2.scale.z = 0.45;
          const e2i = mesh(new THREE.CapsuleGeometry(0.04, 0.4, 4, 8), glowSoft, fold); e2i.position.set(0, 0.38, 0.07); e2i.scale.z = 0.4;
        }
        ear.rotation.z = -s * 0.22;
      }
      const pod = mesh(rbox(0.55, 0.75, 0.75, 0.12), shell2); pod.position.x = 1.15;
      const cr1 = mesh(new THREE.BoxGeometry(0.06, 0.42, 0.13), glow); cr1.position.set(1.44, 0, 0);
      const cr2 = mesh(new THREE.BoxGeometry(0.06, 0.13, 0.42), glow); cr2.position.set(1.44, 0, 0);
      const band = ring(0.62, 0.04, glow); band.rotation.x = Math.PI / 2; band.position.y = -0.92;
    } else if (id === 'raze') {
      const dome = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell); dome.scale.set(1.15, 0.8, 1.15);
      const under = mesh(new THREE.CylinderGeometry(1.0, 0.7, 0.45, 24), dark); under.position.y = -0.2;
      const eyeRing = ring(0.32, 0.07, glow); eyeRing.position.set(0, -0.1, 0.92);
      const eye = mesh(new THREE.CircleGeometry(0.2, 24), screenMat); eye.position.set(0, -0.1, 0.93);
      const rim = ring(1.14, 0.03, glow); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02;
      const tri = mesh(new THREE.RingGeometry(0.16, 0.22, 3), glow); tri.position.set(0, 0.72, 0.2); tri.rotation.x = -1.2;
      parts.legs = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6, hip = new THREE.Group(); body.add(hip);
        hip.position.set(Math.sin(a) * 0.95, -0.25, Math.cos(a) * 0.95); hip.rotation.y = a;
        const upper = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), shell2, hip); upper.position.z = 0.4;
        const knee = new THREE.Group(); hip.add(knee); knee.position.z = 0.85;
        if (!sig) {
          const blade = cone(0.2, 1.1, shell, 4, knee); blade.rotation.x = Math.PI; blade.position.y = -0.5; blade.scale.z = 0.3;
          const tip = cone(0.04, 0.9, glow, 4, knee); tip.rotation.x = Math.PI; tip.position.set(0, -0.45, 0.07);
        } else {   // a piston: a thick sleeve, a glowing joint, a rod and a foot pad
          const joint = mesh(new THREE.SphereGeometry(0.12, 12, 8), glow, knee);
          const sleeve = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 10), shell, knee); sleeve.position.y = -0.32;
          const rod = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), dark, knee); rod.position.y = -0.8;
          const pad = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 12), shell2, knee); pad.position.y = -1.06;
        }
        hip.rotation.x = -0.25; knee.rotation.x = 0.35;
        parts.legs.push({ hip, knee, ph: i * 1.7 });
      }
    }
    // ---------- the back slot: the same part on every bot, at that bot's back ----------
    const BACK = { orbit: [0, 0.1, -0.98], pixel: [0, 0.05, -0.68], nova: [0, 0.1, -0.93], kite: [0, -0.15, -0.93], beep: [0, 0, -0.98], raze: [0, 0.15, -1.05] };
    if (opts.back === 'wings' || opts.back === 'pack') {
      const anchor = new THREE.Group(); body.add(anchor); anchor.position.set(...(BACK[id] || [0, 0, -1])); parts.back = anchor;
      if (opts.back === 'wings') for (const s of [-1, 1]) {
        const w = new THREE.Group(); anchor.add(w); w.rotation.set(0.15, -s * 0.5, s * 0.25);
        const plate = mesh(new THREE.BoxGeometry(1.5, 0.06, 0.5), shell2, w); plate.position.x = s * 0.8; plate.rotation.y = s * 0.15;
        const tipW = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.3), shell, w); tipW.position.set(s * 1.5, 0.12, -0.12); tipW.rotation.z = s * 0.3;
        const edge = mesh(new THREE.BoxGeometry(1.4, 0.03, 0.04), glow, w); edge.position.set(s * 0.85, 0.04, 0.26);
      } else {
        const pack = mesh(rbox(0.9, 0.7, 0.4, 0.08), shell2, anchor); pack.position.z = -0.15;
        for (const s of [-1, 1]) {
          const n = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.45, 12), dark, anchor); n.position.set(s * 0.28, -0.3, -0.25);
          const f = ring(0.15, 0.035, glow, anchor); f.rotation.x = Math.PI / 2; f.position.set(s * 0.28, -0.53, -0.25);
        }
      }
    }

    // ---------- battle marks: stickers and wear, put on the shell by aiming at it from outside ----------
    const marks = opts.marks || {};
    if ((marks.stickers && marks.stickers.length) || marks.wear > 0) {
      group.updateMatrixWorld(true);
      const solids = []; body.traverse(o => { if (o.isMesh && (o.material === shell || o.material === shell2)) solids.push(o); });
      const ray = new THREE.Raycaster(), inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
      const place = (dir, size, mat, spin = 0) => {
        const d = new V(...dir).normalize(), from = d.clone().multiplyScalar(6).applyMatrix4(body.matrixWorld);
        ray.set(from, d.clone().negate().transformDirection(body.matrixWorld));
        const h = ray.intersectObjects(solids, false)[0]; if (!h) return;
        const p = h.point.applyMatrix4(inv), n = h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv).normalize();
        const m = mesh(new THREE.PlaneGeometry(size, size), mat); m.position.copy(p).addScaledVector(n, 0.012);
        m.lookAt(p.clone().add(n)); m.rotateZ(spin);
      };
      const SPOTS = [[0.75, 0.35, 0.55], [-0.75, 0.3, 0.6], [0.8, -0.35, 0.45], [-0.7, -0.4, 0.55], [0.3, 0.75, 0.6], [-0.35, 0.7, 0.6]];
      (marks.stickers || []).slice(0, SPOTS.length).forEach((k, i) => place(SPOTS[i], 0.3, own(new THREE.MeshStandardMaterial({ map: own(stickerTex(THREE, k, GLOW)), color: '#9aa0a8', transparent: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -2 })), (i % 2 ? 0.25 : -0.2)));
      const scratch = own(new THREE.MeshBasicMaterial({ map: own(scratchTex(THREE)), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      const n = Math.round(clamp(marks.wear || 0, 0, 1) * 10);
      for (let i = 0; i < n; i++) { const a = i * 2.39996, z = 0.15 + ((i * 0.37) % 0.85); place([Math.cos(a) * 0.9, Math.sin(a * 1.7) * 0.6, z], 0.45 + (i % 3) * 0.12, scratch, a); }
    }
    face(rest);

    // ---------- motion ----------
    const seed = (id.charCodeAt(0) * 13 + id.length * 7 + (opts.seed || 0)) % 100 / 100 * 6.28;
    let hitAt = -1e9; const hitDir = new V(1, 0, 0), lean = new V();
    function hit(dir, t) { hitAt = t; hitDir.copy(dir).setY(0).normalize(); }
    function update(t, dt = 0.016, o = {}) {
      const since = t - hitAt, hurt = since >= 0 && since < 1.1;
      body.position.y = Math.sin(t * 2.1 + seed) * 0.12 * sc;
      // lean into the direction of travel
      const v = o.vel || new V();
      lean.lerp(new V(clamp(v.z * 0.06, -0.5, 0.5), 0, clamp(-v.x * 0.06, -0.5, 0.5)), Math.min(1, dt * 10));
      body.rotation.set(lean.x + Math.sin(t * 1.3 + seed) * 0.05, Math.sin(t * 0.7 + seed) * 0.18, lean.z + Math.sin(t * 1.7 + seed) * 0.04);
      if (hurt) {   // knocked spinning, then it rights itself
        const k = 1 - since / 1.1;
        body.rotation.z += -hitDir.x * k * k * 6.5; body.rotation.x += hitDir.z * k * k * 4;
        body.position.y += Math.sin(since * 14) * 0.08 * k;
        face(since < 0.9 ? 'hurt' : rest);
        glow.color.copy(since < 0.12 ? new THREE.Color(4, 4, 4) : hdr(1.6));
      } else {
        glow.color.copy(hdr(1.6));
        face(o.face || ((t + seed) % 4.2 < 0.12 ? 'blink' : rest));
      }
      if (parts.halo) { parts.halo.rotation.y = t * 1.2; parts.halo.position.y = 1.45 + Math.sin(t * 2.4 + seed) * 0.06; }
      if (parts.hat) parts.hat.rotation.y = Math.sin(t * 0.9 + seed) * 0.1;
      if (parts.ribbon) parts.ribbon.rotation.set(Math.sin(t * 3 + seed) * 0.25 - lean.x * 2, 0, Math.sin(t * 2.3) * 0.2 - lean.z * 2);
      if (parts.ears) parts.ears.forEach((e, i) => { e.rotation.x = -lean.x * 1.5 + Math.sin(t * 2.6 + i) * 0.08; e.rotation.z = (i ? 0.22 : -0.22) + Math.sin(t * 2 + i * 2) * 0.06; });
      if (parts.back) parts.back.rotation.x = Math.sin(t * 2.1 + seed) * 0.05 + lean.x * 0.6;
      if (parts.legs) parts.legs.forEach(L => { L.hip.rotation.x = -0.25 + Math.sin(t * 3 + L.ph) * 0.12 - lean.x * 0.6; L.knee.rotation.x = 0.35 + Math.sin(t * 3 + L.ph + 1) * 0.15; });
    }
    function dispose() { group.parent && group.parent.remove(group); keep.forEach(x => x.dispose && x.dispose()); }
    return { id, ...def, group, body, face, hit, update, dispose };
  }
  return { create, BOTS, OPTIONS, STICKERS };
})();
