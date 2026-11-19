// Room items: the shop catalog, the 3D model for each item and a thumbnail renderer.
// The shop page and the room both read window.RoomItems.
// size is the footprint in 0.25 m grid cells: [width along x, depth along z].
// Wall items: width along the wall and depth out from it.
(() => {
  const CELL = 0.25;
  const TAU = Math.PI * 2;
  const CATEGORIES = ['Desks', 'Chairs', 'PC & Tech', 'Monitors', 'Keyboards', 'Decor', 'Lighting', 'Plants', 'Wall & Shelf', 'Floor & Rugs'];

  // Sponsor boards, copied from js/keyboards.js so the room works on pages without it.
  // When window.KEYBOARDS is on the page its entry wins.
  const BOARDS = {
    'aula-f99': { layout: '96', knob: true, look: { case: '#cfcfca', alpha: '#ecebe5', mod: '#8f939a', accent: '#d5503f', accentKeys: ['Escape', 'Enter', 'NumpadEnter'], legend: '#2a2b2f', rgb: '#f2c230' } },
    'womier-sk61he': { layout: '60', look: { case: '#a9adb4', metal: true, alpha: '#26272b', mod: '#3a3c42', accent: '#f2c230', accentKeys: ['Escape'], legend: '#e9e8e2', rgb: '#9fb7d9' } },
    'loga-yaksa': { layout: '75', knob: true, screen: true, look: { case: '#b9a6d6', clear: true, alpha: '#1f2023', mod: '#2f3a33', accent: '#c9a24a', accentKeys: ['Escape', 'Enter', 'Space'], legend: '#c9a24a', rgb: '#c9a24a' } },
    'attackshark-x68he': { layout: '65', look: { case: '#25262a', alpha: '#e7e6e1', mod: '#b9bbbf', accent: '#e07a3a', accentKeys: ['Escape', 'Enter'], legend: '#25262a', rgb: '#e07a3a' } },
    'corsair-vanguard96': { layout: '96', look: { case: '#1d1e21', alpha: '#2b2c30', mod: '#232427', accent: '#f2c230', accentKeys: ['Escape'], legend: '#d8d7d1', rgb: '#e7e6e1' } },
    'chilkey-sf60': { layout: '64', look: { case: '#c7c9cd', metal: true, alpha: '#dfe7ee', mod: '#cfd9e2', accent: '#9fd3cf', accentKeys: ['Escape', 'Enter'], legend: '#3a3c42', rgb: '#9fd3cf', crystal: true } },
    basic: { layout: '75', look: { case: '#1e1f22', alpha: '#2b2c2f', mod: '#222326', accent: '#2b2c2f', accentKeys: [], legend: '#cfd8d2', rgb: '#39ff88' } },
  };
  const board = key => {
    const live = (window.KEYBOARDS || []).find(k => k.id === key);
    return { id: key, ...BOARDS[key], ...(live ? { layout: live.layout, knob: live.knob, screen: live.screen, look: live.look } : {}) };
  };

  // ---------------------------------------------------------------- builders
  // Every builder gets the kit K and returns an Object3D facing +z, base at y = 0.

  function deskBasic(K) {
    const top = K.rbox(1.4, 0.028, 0.7, 0.008, K.wood('oak'), 3);
    top.position.y = 0.736;
    const legM = K.std('#222427', 0.45, 0.6);
    const g = K.group(top);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = K.rbox(0.045, 0.722, 0.045, 0.006, legM);
        leg.position.set(sx * 0.63, 0.361, sz * 0.29);
        g.add(leg);
        const foot = K.cyl(0.018, 0.02, 0.01, K.std('#111', 0.8), 16);
        foot.position.set(sx * 0.63, 0.005, sz * 0.29); g.add(foot);
      }
      const side = K.rbox(0.03, 0.05, 0.56, 0.005, legM); side.position.set(sx * 0.63, 0.69, 0); g.add(side);
    }
    const apron = K.rbox(1.22, 0.05, 0.03, 0.005, legM); apron.position.set(0, 0.69, -0.29); g.add(apron);
    const tray = K.rbox(0.8, 0.07, 0.1, 0.004, K.std('#1a1b1d', 0.6, 0.4)); tray.position.set(0, 0.67, -0.24); g.add(tray);
    return g;
  }

  function hairpin(K, h, m) {
    const a = 0.07;
    return K.tube([[-a, h, -a], [-a * 0.55, h * 0.5, -a * 0.55], [-0.006, 0.012, -0.006], [a * 0.55, h * 0.5, a * 0.55], [a, h, a]], 0.006, m, 48, 8);
  }
  function deskWalnut(K) {
    const g = K.group();
    const top = K.rbox(1.5, 0.035, 0.7, 0.01, K.wood('walnut'), 4); top.position.y = 0.722; g.add(top);
    const m = K.std('#151617', 0.35, 0.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = hairpin(K, 0.705, m);
      leg.position.set(sx * 0.64, 0, sz * 0.26);
      leg.rotation.y = sx * sz > 0 ? 0 : Math.PI / 2;
      g.add(leg);
      const plate = K.box(0.11, 0.006, 0.11, m); plate.position.set(sx * 0.64, 0.702, sz * 0.26); g.add(plate);
    }
    return g;
  }

  function deskStanding(K) {
    const g = K.group();
    const top = K.rbox(1.6, 0.026, 0.75, 0.01, K.std('#e8e6e1', 0.5), 4); top.position.y = 0.767; g.add(top);
    const edge = K.rbox(1.598, 0.012, 0.748, 0.005, K.wood('ash')); edge.position.y = 0.752; g.add(edge);
    const fm = K.std('#1b1c1e', 0.4, 0.7);
    for (const sx of [-1, 1]) {
      const foot = K.rbox(0.075, 0.035, 0.66, 0.012, fm); foot.position.set(sx * 0.62, 0.0175, 0); g.add(foot);
      const outer = K.rbox(0.08, 0.38, 0.06, 0.006, fm); outer.position.set(sx * 0.62, 0.035 + 0.19, 0); g.add(outer);
      const inner = K.rbox(0.068, 0.33, 0.05, 0.006, K.std('#2c2e31', 0.35, 0.75)); inner.position.set(sx * 0.62, 0.41 + 0.16, 0); g.add(inner);
      const motor = K.rbox(0.09, 0.05, 0.07, 0.008, fm); motor.position.set(sx * 0.62, 0.725, 0); g.add(motor);
      const rail = K.rbox(0.05, 0.03, 0.62, 0.006, fm); rail.position.set(sx * 0.62, 0.738, 0); g.add(rail);
    }
    const beam = K.rbox(1.2, 0.04, 0.05, 0.006, fm); beam.position.set(0, 0.73, 0); g.add(beam);
    // height controller with a small display
    const ctl = K.rbox(0.13, 0.025, 0.05, 0.006, K.plastic('#151618', 0.4)); ctl.position.set(0.55, 0.742, 0.36); g.add(ctl);
    const disp = K.canvasTex('desk-disp', 96, 40, c => { c.fillStyle = '#040806'; c.fillRect(0, 0, 96, 40); c.fillStyle = '#39ff88'; c.font = `600 26px ${K.MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('76.7', 48, 21); });
    const dm = K.mesh(new K.THREE.PlaneGeometry(0.04, 0.0165), new K.THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: disp, emissiveIntensity: 1.4 }));
    dm.position.set(0.53, 0.742, 0.3855); g.add(dm);
    for (const bx of [0.585, 0.605]) { const b = K.cyl(0.004, 0.004, 0.004, K.std('#3a3c40', 0.4), 12); b.rotation.x = Math.PI / 2; b.position.set(bx, 0.742, 0.386); g.add(b); }
    return g;
  }

  function deskCommand(K) {
    const g = K.group();
    const topM = K.wood('black');
    const top = K.rbox(1.8, 0.04, 0.8, 0.012, topM, 4); top.position.y = 0.74; g.add(top);
    const led = K.box(1.74, 0.006, 0.006, K.glow('#39ff88', 3.2)); led.position.set(0, 0.718, 0.392); g.add(led);
    const body = K.std('#16181a', 0.55, 0.2);
    const handle = K.metal('#7d8288', 0.3);
    for (const sx of [-1, 1]) {
      const ped = K.rbox(0.42, 0.7, 0.74, 0.01, body); ped.position.set(sx * 0.66, 0.36, 0); g.add(ped);
      for (let i = 0; i < 3; i++) {
        const dh = 0.21;
        const front = K.rbox(0.4, dh - 0.012, 0.02, 0.005, K.std('#1e2023', 0.45, 0.25));
        front.position.set(sx * 0.66, 0.04 + dh / 2 + i * (dh + 0.006), 0.375); g.add(front);
        const hb = K.rbox(0.18, 0.012, 0.016, 0.005, handle); hb.position.set(sx * 0.66, 0.04 + dh - 0.03 + i * (dh + 0.006), 0.39); g.add(hb);
      }
      const kick = K.box(0.4, 0.03, 0.02, K.std('#0b0c0d', 0.8)); kick.position.set(sx * 0.66, 0.015, 0.36); g.add(kick);
    }
    const modesty = K.rbox(0.88, 0.45, 0.02, 0.005, body); modesty.position.set(0, 0.48, -0.3); g.add(modesty);
    // desk mat with green stitched edge
    const mat = K.rbox(0.9, 0.003, 0.36, 0.0015, K.fabric('#141615', 0.5)); mat.position.set(0, 0.7615, 0.12); g.add(mat);
    const edge = K.rbox(0.904, 0.0022, 0.364, 0.0015, K.std('#1f9e57', 0.6)); edge.position.set(0, 0.7608, 0.12); g.add(edge);
    return g;
  }

  function coffeeTable(K) {
    const g = K.group();
    const top = K.rbox(1.0, 0.04, 0.55, 0.012, K.wood('walnut'), 4); top.position.y = 0.4; g.add(top);
    const m = K.std('#141517', 0.4, 0.75);
    for (const sx of [-1, 1]) {
      const frame = [[-0.24, 0.38, 0], [-0.24, 0.02, 0], [0.24, 0.02, 0], [0.24, 0.38, 0]];
      for (let i = 0; i < 3; i++) {
        const a = frame[i], b = frame[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const bar = K.rbox(0.022, len + 0.022, 0.022, 0.004, m);
        bar.position.set(sx * 0.44, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
        if (a[1] === b[1]) bar.rotation.x = Math.PI / 2;
        g.add(bar);
      }
    }
    const shelf = K.rbox(0.86, 0.018, 0.46, 0.005, K.wood('walnut')); shelf.position.y = 0.12; g.add(shelf);
    const bookCols = ['#2d4a3a', '#c9c3b5', '#8a3a2e'];
    bookCols.forEach((c, i) => { const b = K.rbox(0.26 - i * 0.02, 0.025, 0.19 - i * 0.01, 0.003, K.std(c, 0.7)); b.position.set(-0.2, 0.142 + i * 0.026, 0.02); b.rotation.y = (i - 1) * 0.12; g.add(b); });
    const tray = K.cyl(0.13, 0.12, 0.02, K.std('#b7b2a6', 0.35, 0.6), 40); tray.position.set(0.24, 0.43, 0); g.add(tray);
    const candle = K.cyl(0.035, 0.035, 0.07, K.std('#e9e2d4', 0.8), 24); candle.position.set(0.24, 0.475, 0); g.add(candle);
    const flame = K.sph(0.008, K.glow('#ffb35c', 4), 12, 8); flame.scale.y = 1.8; flame.position.set(0.24, 0.522, 0); g.add(flame);
    return g;
  }

  // Office chairs face +z: the seat front points at +z and the backrest is at -z.
  function chairFrame(K, o) {
    const g = K.group();
    const baseM = K.plastic(o.baseColor || '#151618', 0.4);
    g.add(K.starBase(o.seatY - 0.04, baseM, o.baseR || 0.31));
    const mech = K.rbox(0.22, 0.05, 0.24, 0.01, K.std('#1b1c1e', 0.5, 0.4)); mech.position.y = o.seatY - 0.045; g.add(mech);
    return g;
  }
  function arms(K, g, o, padM, postM) {
    for (const sx of [-1, 1]) {
      const post = K.rbox(0.04, 0.24, 0.05, 0.01, postM);
      post.position.set(sx * (o.seatW / 2 + 0.02), o.seatY + 0.07, -0.02); g.add(post);
      const pad = K.rbox(0.075, 0.03, 0.25, 0.012, padM);
      pad.position.set(sx * (o.seatW / 2 + 0.03), o.seatY + 0.2, 0.02); g.add(pad);
    }
  }

  function chairBasic(K) {
    const o = { seatY: 0.48, seatW: 0.48 };
    const g = chairFrame(K, o);
    const fab = K.fabric('#4b5157');
    const seat = K.cushion(0.48, 0.46, 0.08, fab, { puff: 0.9 }); seat.rotation.x = -Math.PI / 2; seat.position.set(0, o.seatY + 0.02, 0.02); g.add(seat);
    const shellM = K.plastic('#1a1b1d', 0.5);
    const shell = K.rbox(0.46, 0.02, 0.44, 0.008, shellM); shell.position.set(0, o.seatY - 0.02, 0.02); g.add(shell);
    const bar = K.tube([[0, o.seatY - 0.03, -0.12], [0, o.seatY - 0.02, -0.25], [0, o.seatY + 0.1, -0.28], [0, o.seatY + 0.3, -0.27]], 0.018, K.std('#1b1c1e', 0.4, 0.6), 32, 10);
    g.add(bar);
    const back = K.cushion(0.44, 0.46, 0.07, fab, { bend: 0.04, puff: 0.8 }); back.position.set(0, o.seatY + 0.36, -0.25); back.rotation.x = -0.1; g.add(back);
    const backShell = K.cushion(0.43, 0.45, 0.03, shellM, { bend: 0.04 }); backShell.position.set(0, o.seatY + 0.36, -0.285); backShell.rotation.x = -0.1; g.add(backShell);
    return g;
  }

  function meshTex(K) {
    return K.canvasTex('mesh', 128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(30,32,34,1)'; c.lineWidth = 2.2;
      for (let i = -w; i < w * 2; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke(); }
    }, { repeat: [5, 6] });
  }
  function chairErgo(K) {
    const o = { seatY: 0.49, seatW: 0.5 };
    const g = chairFrame(K, o);
    const fab = K.fabric('#202225');
    const frameM = K.plastic('#111214', 0.4);
    const seat = K.cushion(0.5, 0.48, 0.075, fab, { puff: 0.8, bend: 0.015 }); seat.rotation.x = -Math.PI / 2; seat.position.set(0, o.seatY + 0.02, 0.02); g.add(seat);
    const pan = K.rbox(0.48, 0.02, 0.46, 0.008, frameM); pan.position.set(0, o.seatY - 0.02, 0.02); g.add(pan);
    // back frame loop with stretched mesh
    const bw = 0.46, bh = 0.56, by = o.seatY + 0.42, bz = -0.27;
    const loop = [];
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU;
      const x = Math.cos(a) * bw / 2 * (1 - 0.12 * Math.max(0, -Math.sin(a)));
      const y = Math.sin(a) * bh / 2;
      loop.push([x, by + y, bz + (x * x) * 0.35 - y * 0.12]);
    }
    g.add(K.tube(loop, 0.014, frameM, 96, 10, true));
    const meshGeo = new K.THREE.PlaneGeometry(bw * 0.97, bh * 0.97, 12, 12);
    const mp = meshGeo.attributes.position;
    for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), y = mp.getY(i); mp.setXYZ(i, x * (1 - 0.12 * Math.max(0, -y / (bh / 2))), by + y, bz + x * x * 0.35 - y * 0.12 - 0.01 * (1 - Math.abs(2 * x / bw))); }
    meshGeo.computeVertexNormals();
    const mm = K.memo('meshback', () => new K.THREE.MeshStandardMaterial({ map: meshTex(K), transparent: true, alphaTest: 0.3, side: K.THREE.DoubleSide, roughness: 0.8, color: '#ffffff' }));
    g.add(K.mesh(meshGeo, mm));
    const spine = K.tube([[0, o.seatY - 0.02, -0.15], [0, o.seatY, -0.3], [0, by - 0.1, -0.33], [0, by + bh / 2 - 0.05, -0.31]], 0.02, frameM, 32, 10);
    g.add(spine);
    const lumbar = K.tube([[-0.18, by - 0.12, -0.24], [0, by - 0.14, -0.27], [0.18, by - 0.12, -0.24]], 0.012, K.std('#1f9e57', 0.5), 20, 8);
    g.add(lumbar);
    const head = K.cushion(0.26, 0.1, 0.05, fab, { bend: 0.03 }); head.position.set(0, by + bh / 2 + 0.11, -0.33); head.rotation.x = -0.15; g.add(head);
    const hpost = K.rbox(0.03, 0.12, 0.02, 0.006, frameM); hpost.position.set(0, by + bh / 2 + 0.04, -0.34); g.add(hpost);
    arms(K, g, o, K.plastic('#1b1c1e', 0.6), frameM);
    return g;
  }

  function laurelPlane(K, size, color, i = 2) {
    const tex = K.canvasTex('laurel|' + color, 256, 256, c => K.drawLaurel(c, 128, 128, 230, color, 0));
    const m = K.memo(`laurelmat|${color}|${i}`, () => new K.THREE.MeshStandardMaterial({ color: '#000', map: tex, emissive: '#fff', emissiveMap: tex, emissiveIntensity: i, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    return K.mesh(new K.THREE.PlaneGeometry(size, size), m);
  }

  function chairGaming(K) {
    const o = { seatY: 0.5, seatW: 0.52 };
    const g = chairFrame(K, o);
    const blk = K.leather('#17181a');
    const grn = K.leather('#1d6b43');
    const seat = K.cushion(0.52, 0.5, 0.09, blk, { bend: 0.05, puff: 0.7 }); seat.rotation.x = -Math.PI / 2; seat.position.set(0, o.seatY + 0.025, 0.02); g.add(seat);
    const seatMid = K.cushion(0.26, 0.44, 0.06, grn, { puff: 0.7 }); seatMid.rotation.x = -Math.PI / 2; seatMid.position.set(0, o.seatY + 0.05, 0.03); g.add(seatMid);
    const bz = -0.28, by = o.seatY + 0.45;
    const back = K.cushion(0.54, 0.86, 0.1, blk, { bend: 0.09, puff: 0.6, taper: 0.18 }); back.position.set(0, by, bz); back.rotation.x = -0.12; g.add(back);
    const mid = K.cushion(0.22, 0.7, 0.06, grn, { puff: 0.6 }); mid.position.set(0, by - 0.04, bz + 0.05); mid.rotation.x = -0.12; g.add(mid);
    const head = K.cushion(0.24, 0.12, 0.08, blk, { puff: 1.2 }); head.position.set(0, by + 0.32, bz + 0.07); head.rotation.x = -0.12; g.add(head);
    const lumbar = K.cushion(0.28, 0.13, 0.09, blk, { puff: 1.2 }); lumbar.position.set(0, by - 0.24, bz + 0.1); lumbar.rotation.x = -0.12; g.add(lumbar);
    const logo = laurelPlane(K, 0.09, '#39ff88', 1.6); logo.position.set(0, by + 0.33, bz + 0.112); logo.rotation.x = -0.12; g.add(logo);
    const shell = K.cushion(0.5, 0.82, 0.04, K.plastic('#0f1011', 0.6), { bend: 0.085, taper: 0.18 }); shell.position.set(0, by, bz - 0.06); shell.rotation.x = -0.12; g.add(shell);
    const hinge = K.rbox(0.44, 0.06, 0.06, 0.012, K.std('#1b1c1e', 0.4, 0.6)); hinge.position.set(0, o.seatY - 0.01, -0.24); g.add(hinge);
    arms(K, g, o, K.leather('#1a1b1d'), K.std('#1b1c1e', 0.4, 0.6));
    return g;
  }

  function beanbag(K) {
    const THREE = K.THREE;
    const geo = new THREE.SphereGeometry(0.45, 64, 40);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      y *= 0.62;
      if (y < -0.12) y = -0.12 - (y + 0.12) * 0.25;   // flatten the bottom
      const dSeat = Math.hypot(x, z - 0.06);
      if (y > 0) y -= 0.14 * Math.exp(-dSeat * dSeat / 0.035) * (y / 0.28);   // seat dent
      if (z < -0.1 && y > 0) y += 0.08 * (-z - 0.1) / 0.35 * (y / 0.28);   // backrest
      const wob = 1 + 0.02 * Math.sin(Math.atan2(z, x) * 5 + y * 10);
      p.setXYZ(i, x * wob, y, z * wob);
    }
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.min.y, 0);
    const g = K.group(K.mesh(geo, K.fabric('#454b52', 1.2)));
    const seam = K.torus(0.43, 0.006, K.std('#1d2022', 0.9), TAU, 6, 96); seam.rotation.x = Math.PI / 2; seam.scale.set(1.02, 1.02, 1); seam.position.y = 0.155; g.add(seam);
    return g;
  }

  // ---------- PC & tech ----------
  function pcCase(K, o) {
    const g = K.group();
    const W = 0.23, H = 0.48, D = 0.46;
    const shellM = K.plastic(o.shell, 0.45);
    const inside = K.std(o.inner, 0.6, 0.3);
    const y0 = 0.025;
    // feet
    for (const sz of [-1, 1]) { const f = K.rbox(W - 0.02, 0.025, 0.05, 0.008, K.std('#111', 0.7)); f.position.set(0, 0.0125, sz * 0.17); g.add(f); }
    const panel = (w, h, d, x, y, z, m = shellM) => { const b = K.rbox(w, h, d, 0.006, m); b.position.set(x, y, z); g.add(b); return b; };
    panel(0.012, H, D, -W / 2 + 0.006, y0 + H / 2, 0);              // solid side
    panel(W, 0.014, D, 0, y0 + 0.007, 0);                            // floor
    panel(W, 0.014, D, 0, y0 + H - 0.007, 0);                        // roof
    panel(W, H, 0.012, 0, y0 + H / 2, -D / 2 + 0.006, inside);       // back
    for (const z of [-D / 2 + 0.006, D / 2 - 0.006]) panel(0.012, H, 0.012, W / 2 - 0.006, y0 + H / 2, z);   // glass pillars
    panel(0.012, 0.012, D, W / 2 - 0.006, y0 + H - 0.006, 0);
    // vent strip on the roof
    const vent = K.canvasTex('vent', 128, 64, c => { c.fillStyle = '#0b0b0c'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#2a2b2e'; for (let y = 4; y < 64; y += 8) for (let x = 4; x < 128; x += 8) c.fillRect(x, y, 4, 4); });
    const vm = K.mesh(new K.THREE.PlaneGeometry(W * 0.8, D * 0.7), new K.THREE.MeshStandardMaterial({ map: vent, roughness: 0.7 }));
    vm.rotation.x = -Math.PI / 2; vm.position.set(0, y0 + H + 0.0005, 0); g.add(vm);
    // power button
    const pb = K.cyl(0.007, 0.007, 0.004, K.glow(o.accent, 3), 20); pb.position.set(0.06, y0 + H + 0.002, D / 2 - 0.03); g.add(pb);
    // motherboard and parts
    panel(0.006, H - 0.06, D - 0.06, -W / 2 + 0.016, y0 + H / 2 + 0.01, -0.005, K.std('#16191a', 0.5, 0.3));
    const shroud = K.rbox(W - 0.03, 0.11, D - 0.03, 0.006, shellM); shroud.position.set(0, y0 + 0.07, 0); g.add(shroud);
    const shLed = K.box(0.004, 0.004, D * 0.7, K.glow(o.accent, 2.5)); shLed.position.set(W / 2 - 0.018, y0 + 0.13, 0); g.add(shLed);
    // GPU
    const gpu = K.rbox(0.13, 0.05, 0.3, 0.006, K.std(o.gpu, 0.4, 0.6)); gpu.position.set(-W / 2 + 0.085, y0 + 0.19, 0.03); g.add(gpu);
    const gpuStrip = K.box(0.002, 0.008, 0.24, K.glow(o.accent, 3)); gpuStrip.position.set(-W / 2 + 0.151, y0 + 0.2, 0.03); g.add(gpuStrip);
    for (let i = 0; i < 3; i++) {
      const fan = K.fan(0.085, o.accent, o.gpu, o.blade); fan.scale.set(1, 1, 0.4);
      fan.rotation.x = Math.PI / 2; fan.position.set(-W / 2 + 0.085, y0 + 0.163, -0.07 + i * 0.095); g.add(fan);
      g.userData.fans = (g.userData.fans || []).concat(fan.userData.spin);
    }
    // RAM
    for (let i = 0; i < 4; i++) {
      const stick = K.rbox(0.13, 0.045, 0.008, 0.002, K.std('#1d1f22', 0.5, 0.5)); stick.rotation.y = Math.PI / 2; stick.position.set(-W / 2 + 0.03, y0 + 0.37, 0.07 + i * 0.012); g.add(stick);
      const top = K.box(0.13, 0.006, 0.008, K.glow(i % 2 ? o.accent : o.accent2, 2.6)); top.rotation.y = Math.PI / 2; top.position.set(-W / 2 + 0.03, y0 + 0.395, 0.07 + i * 0.012); g.add(top);
    }
    // CPU block with glowing ring and tubes to the radiator up top
    const pump = K.cyl(0.035, 0.035, 0.02, K.std('#202226', 0.35, 0.7), 40); pump.rotation.z = Math.PI / 2; pump.position.set(-W / 2 + 0.03, y0 + 0.36, -0.06); g.add(pump);
    const pr = K.torus(0.03, 0.004, K.glow(o.accent2, 3.2), TAU, 8, 40); pr.rotation.y = Math.PI / 2; pr.position.set(-W / 2 + 0.041, y0 + 0.36, -0.06); g.add(pr);
    const plogo = laurelPlane(K, 0.04, o.accent, 2); plogo.rotation.y = Math.PI / 2; plogo.position.set(-W / 2 + 0.0415, y0 + 0.36, -0.06); g.add(plogo);
    const tubeM = K.std('#151617', 0.6);
    g.add(K.tube([[-W / 2 + 0.03, y0 + 0.38, -0.08], [-0.02, y0 + 0.42, -0.1], [0, y0 + H - 0.05, -0.1]], 0.006, tubeM, 24, 8));
    g.add(K.tube([[-W / 2 + 0.03, y0 + 0.38, -0.04], [-0.02, y0 + 0.43, -0.03], [0, y0 + H - 0.05, -0.02]], 0.006, tubeM, 24, 8));
    const rad = K.rbox(0.12, 0.03, 0.36, 0.004, K.std('#141517', 0.6, 0.4)); rad.position.set(0, y0 + H - 0.03, -0.01); g.add(rad);
    const fans = g.userData.fans;
    for (let i = 0; i < 3; i++) {
      const f = K.fan(0.12, o.accent, o.fanFrame, o.blade);
      f.position.set(0, y0 + 0.11 + 0.065 + i * 0.125, D / 2 - 0.028); g.add(f); fans.push(f.userData.spin);
    }
    const rear = K.fan(0.12, o.accent, o.fanFrame, o.blade); rear.position.set(-0.01, y0 + H - 0.12, -D / 2 + 0.026); g.add(rear); fans.push(rear.userData.spin);
    // glass: front and side
    const glassM = K.glass('#9fb8ad', 0.14);
    const gs = K.box(0.004, H - 0.02, D - 0.02, glassM); gs.position.set(W / 2 - 0.002, y0 + H / 2, 0); g.add(gs);
    const gf = K.box(W - 0.02, H - 0.02, 0.004, glassM); gf.position.set(0, y0 + H / 2, D / 2 - 0.002); g.add(gf);
    const light = new K.THREE.PointLight(o.accent, 0.35, 1.2, 2); light.position.set(0.25, y0 + 0.3, 0.15); g.add(light);
    g.userData.tick = (t, dt) => { for (const r of fans) r.rotation.z -= dt * 9; };
    return g;
  }

  function laptop(K) {
    const g = K.group();
    const al = K.std('#9ea2a8', 0.32, 0.85);
    const base = K.rbox(0.32, 0.014, 0.22, 0.006, al, 3); base.position.y = 0.007; g.add(base);
    const keys = K.canvasTex('laptopkeys', 256, 128, (c, w, h) => {
      c.fillStyle = '#9ea2a8'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#16171a';
      for (let r = 0; r < 6; r++) for (let k = 0; k < 14; k++) c.fillRect(8 + k * 17.4, 6 + r * 19, 15, 16);
      c.fillRect(60, 6 + 5 * 19, 120, 16);
    });
    const kp = K.mesh(new K.THREE.PlaneGeometry(0.27, 0.1), new K.THREE.MeshStandardMaterial({ map: keys, roughness: 0.6 }));
    kp.rotation.x = -Math.PI / 2; kp.position.set(0, 0.0142, -0.03); g.add(kp);
    const pad = K.rbox(0.11, 0.001, 0.065, 0.004, K.std('#8d9197', 0.25, 0.8)); pad.position.set(0, 0.0142, 0.065); g.add(pad);
    const lid = K.group();
    const shell = K.rbox(0.32, 0.21, 0.008, 0.006, al, 3); shell.position.set(0, 0.105, 0); lid.add(shell);
    const scr = K.mesh(new K.THREE.PlaneGeometry(0.3, 0.185), K.screenMat('code', 1.1)); scr.position.set(0, 0.108, 0.0042); lid.add(scr);
    lid.position.set(0, 0.012, -0.105); lid.rotation.x = -0.32;
    g.add(lid);
    return g;
  }

  function headphones(K, accent = '#39ff88') {
    const g = K.group();
    const band = K.torus(0.085, 0.009, K.std('#1a1b1d', 0.35, 0.6), Math.PI, 12, 40); band.position.y = 0; g.add(band);
    const pad = K.torus(0.078, 0.012, K.leather('#232427'), Math.PI * 0.6, 12, 32); pad.rotation.z = Math.PI * 0.2; g.add(pad);
    for (const sx of [-1, 1]) {
      const slide = K.rbox(0.008, 0.04, 0.014, 0.003, K.metal('#a8acb2', 0.25)); slide.position.set(sx * 0.085, -0.02, 0); g.add(slide);
      const cup = K.cyl(0.045, 0.048, 0.03, K.plastic('#151618', 0.4), 40); cup.rotation.z = Math.PI / 2; cup.scale.set(1, 1, 1.25); cup.position.set(sx * 0.092, -0.07, 0); g.add(cup);
      const ring = K.torus(0.032, 0.003, K.glow(accent, 2.6), TAU, 8, 40); ring.rotation.y = Math.PI / 2; ring.scale.set(1, 1.25, 1); ring.position.set(sx * 0.108, -0.07, 0); g.add(ring);
      const cush = K.torus(0.03, 0.013, K.leather('#1d1e20'), TAU, 12, 32); cush.rotation.y = Math.PI / 2; cush.scale.set(1, 1.3, 1); cush.position.set(sx * 0.072, -0.07, 0); g.add(cush);
    }
    return g;
  }

  function headphoneStand(K) {
    const g = K.group();
    const m = K.std('#1c1d20', 0.35, 0.75);
    g.add(K.lathe([[0, 0], [0.07, 0], [0.075, 0.006], [0.07, 0.014], [0.02, 0.018], [0, 0.018]], m, 48));
    const post = K.cyl(0.011, 0.012, 0.26, m, 24); post.position.y = 0.145; g.add(post);
    const cradle = K.torus(0.05, 0.012, m, Math.PI * 0.9, 12, 32); cradle.rotation.z = Math.PI * 0.05; cradle.position.y = 0.265; g.add(cradle);
    const glow = K.torus(0.072, 0.0025, K.glow('#39ff88', 2.4), TAU, 8, 48); glow.rotation.x = Math.PI / 2; glow.position.y = 0.004; g.add(glow);
    const hp = headphones(K); hp.position.y = 0.318; g.add(hp);
    return g;
  }

  function micArm(K) {
    const g = K.group();
    const m = K.std('#16171a', 0.4, 0.7);
    const clamp = K.rbox(0.05, 0.05, 0.07, 0.006, m); clamp.position.set(0, 0.025, -0.09); g.add(clamp);
    const post = K.cyl(0.012, 0.012, 0.12, m, 20); post.position.set(0, 0.11, -0.09); g.add(post);
    const j1 = [0, 0.17, -0.09], j2 = [0, 0.43, 0.02], j3 = [0, 0.38, 0.2];
    const seg = (a, b) => {
      const v = new K.THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = v.length();
      for (const off of [-0.014, 0.014]) {
        const r = K.cyl(0.0065, 0.0065, len, m, 12);
        r.position.set((a[0] + b[0]) / 2 + off, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        r.quaternion.setFromUnitVectors(new K.THREE.Vector3(0, 1, 0), v.clone().normalize());
        g.add(r);
      }
      // spring beside the arm
      const pts = [];
      for (let i = 0; i <= 120; i++) { const t = i / 120, a2 = t * 30 * TAU; pts.push([a[0] + 0.022 + Math.cos(a2) * 0.005, a[1] + (b[1] - a[1]) * (0.2 + t * 0.5) + Math.sin(a2) * 0.005, a[2] + (b[2] - a[2]) * (0.2 + t * 0.5)]); }
      g.add(K.tube(pts, 0.0012, K.metal('#c8cbd0', 0.3), 600, 4));
    };
    seg(j1, j2); seg(j2, j3);
    for (const j of [j1, j2]) { const k = K.cyl(0.016, 0.016, 0.04, m, 20); k.rotation.z = Math.PI / 2; k.position.set(...j); g.add(k); }
    const mount = K.torus(0.045, 0.004, m, TAU, 8, 32); mount.position.set(0, 0.33, 0.21); g.add(mount);
    const mic = K.cap(0.03, 0.09, K.std('#1d1e21', 0.35, 0.6)); mic.position.set(0, 0.33, 0.21); g.add(mic);
    const grille = K.canvasTex('grille', 64, 64, c => { c.fillStyle = '#2a2b2e'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#0c0c0d'; for (let y = 2; y < 64; y += 4) for (let x = (y / 4 % 2) * 2; x < 64; x += 4) c.fillRect(x, y, 2, 2); });
    const head = K.cyl(0.0305, 0.0305, 0.07, K.memo('grillemat', () => new K.THREE.MeshStandardMaterial({ map: grille, roughness: 0.5, metalness: 0.6 })), 32, true);
    head.position.set(0, 0.36, 0.21); g.add(head);
    const led = K.box(0.004, 0.012, 0.002, K.glow('#39ff88', 3)); led.position.set(0, 0.3, 0.241); g.add(led);
    g.add(K.tube([j3, [0, 0.32, 0.12], [0, 0.25, -0.05], [0, 0.12, -0.11]], 0.003, K.std('#0d0d0e', 0.8), 40, 6));
    return g;
  }

  // ---------- monitors ----------
  function monitorDual(K) {
    const g = K.group();
    const m = K.std('#232528', 0.35, 0.8);
    const base = K.rbox(0.3, 0.014, 0.2, 0.006, m); base.position.set(0, 0.007, -0.04); g.add(base);
    const pole = K.cyl(0.018, 0.018, 0.4, m, 24); pole.position.set(0, 0.2, -0.08); g.add(pole);
    const bar = K.rbox(0.8, 0.03, 0.03, 0.008, m); bar.position.set(0, 0.33, -0.07); g.add(bar);
    for (const sx of [-1, 1]) {
      const mon = K.monitor({ w: 0.54, h: 0.32, bezel: 0.007, screen: sx < 0 ? 'code' : 'stats', stand: 'none', lift: 0.17 });
      mon.position.set(sx * 0.285, 0, 0.02 - 0.04);
      mon.rotation.y = -sx * 0.22;
      g.add(mon);
    }
    return g;
  }

  // ---------- decor ----------
  function cat(K) {
    const THREE = K.THREE;
    const g = K.group();
    const fur = K.canvasTex('tabby', 256, 128, (c, w, h) => {
      c.fillStyle = '#c98546'; c.fillRect(0, 0, w, h);
      const r = K.rng(5);
      for (let i = 0; i < 26; i++) {
        c.strokeStyle = `rgba(110,55,20,${0.35 + r() * 0.4})`; c.lineWidth = 3 + r() * 5;
        const x = i / 26 * w + r() * 4;
        c.beginPath(); c.moveTo(x, 0);
        for (let y = 0; y <= h; y += 8) c.lineTo(x + Math.sin(y * 0.08 + i) * 4, y);
        c.stroke();
      }
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,220,.0)'); gr.addColorStop(0.85, 'rgba(255,240,220,.0)'); gr.addColorStop(1, 'rgba(255,240,220,.7)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    const furM = K.memo('furmat', () => new THREE.MeshPhysicalMaterial({ map: fur, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color('#ffd9b0'), sheenRoughness: 0.4 }));
    const plain = K.memo('furplain', () => new THREE.MeshPhysicalMaterial({ color: '#c98546', roughness: 0.95, sheen: 1, sheenColor: new THREE.Color('#ffd9b0'), sheenRoughness: 0.4 }));
    const body = K.sph(0.1, furM, 40, 28); body.scale.set(1.75, 0.95, 1.35); body.position.set(-0.02, 0.09, 0); g.add(body);
    const haunch = K.sph(0.085, furM, 32, 20); haunch.scale.set(1.1, 1, 1.15); haunch.position.set(-0.1, 0.1, -0.03); g.add(haunch);
    const headG = K.group();
    const head = K.sph(0.06, plain, 32, 24); head.scale.set(1.05, 0.92, 1); headG.add(head);
    const muzzle = K.sph(0.028, K.fabric('#e9d6bd', 0.4), 20, 14); muzzle.scale.set(1.2, 0.8, 1); muzzle.position.set(0, -0.016, 0.046); headG.add(muzzle);
    const nose = K.sph(0.006, K.std('#c46a6f', 0.5), 12, 8); nose.position.set(0, -0.005, 0.068); headG.add(nose);
    for (const sx of [-1, 1]) {
      const ear = K.cyl(0.0, 0.026, 0.04, plain, 4); ear.position.set(sx * 0.034, 0.055, -0.005); ear.rotation.set(-0.15, Math.PI / 4, sx * -0.35); headG.add(ear);
      const lid = K.torus(0.011, 0.0018, K.std('#3a2414', 0.8), Math.PI * 0.8, 6, 12); lid.position.set(sx * 0.024, 0.012, 0.054); lid.rotation.set(0.25, 0, Math.PI + Math.PI * 0.1); headG.add(lid);
    }
    headG.position.set(0.15, 0.075, 0.07); headG.rotation.set(0.15, 0.7, -0.35);
    g.add(headG);
    for (const z of [0.1, 0.075]) { const paw = K.sph(0.022, K.fabric('#e9d6bd', 0.4), 16, 12); paw.scale.set(1.5, 0.8, 1); paw.position.set(0.12, 0.018, z + 0.03); g.add(paw); }
    const tail = []; for (let i = 0; i <= 10; i++) { const a = -0.6 + i / 10 * 2.6; tail.push([-0.05 + Math.cos(a) * 0.19, 0.022 + i * 0.002, Math.sin(a) * 0.15 + 0.01]); }
    g.add(K.tube(tail.reverse(), 0.018, furM, 48, 12));
    g.userData.tick = t => { const s = 1 + Math.sin(t * 1.6) * 0.025; body.scale.y = 0.95 * s; body.scale.x = 1.75 * (1 + (s - 1) * 0.5); };
    return g;
  }

  function astronaut(K) {
    const g = K.group();
    const suit = K.plastic('#eceae4', 0.55);
    const base = K.cyl(0.05, 0.055, 0.015, K.std('#151617', 0.4, 0.5), 32); base.position.y = 0.0075; g.add(base);
    const torso = K.cap(0.032, 0.03, suit); torso.position.y = 0.105; torso.scale.set(1, 1, 0.85); g.add(torso);
    const pack = K.rbox(0.05, 0.06, 0.025, 0.008, suit); pack.position.set(0, 0.11, -0.032); g.add(pack);
    const helmet = K.sph(0.032, suit, 32, 24); helmet.position.y = 0.17; g.add(helmet);
    const visorGeo = new K.THREE.SphereGeometry(0.0325, 32, 16, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.38);
    const visor = K.mesh(visorGeo, K.std('#d6a23a', 0.08, 1)); visor.position.y = 0.17; g.add(visor);
    for (const sx of [-1, 1]) {
      const leg = K.cap(0.014, 0.04, suit); leg.position.set(sx * 0.016, 0.05, 0); g.add(leg);
      const boot = K.rbox(0.03, 0.016, 0.04, 0.006, K.std('#c9c6be', 0.6)); boot.position.set(sx * 0.016, 0.023, 0.005); g.add(boot);
      const arm = K.cap(0.012, 0.045, suit); arm.position.set(sx * 0.045, 0.11, 0.008); arm.rotation.z = sx * 0.35; g.add(arm);
    }
    const badge = K.box(0.012, 0.008, 0.002, K.glow('#39ff88', 2)); badge.position.set(-0.012, 0.125, 0.028); g.add(badge);
    return g;
  }

  function books(K, list, r) {
    const g = K.group();
    let y = 0;
    for (const [w, h, d, col] of list) {
      const b = K.group();
      const cover = K.rbox(w, h, d, 0.002, K.std(col, 0.65));
      b.add(cover);
      const pages = K.box(w - 0.006, h - 0.004, d - 0.002, K.std('#e9e3d3', 0.9)); pages.position.x = 0.003; b.add(pages);
      b.position.y = y + h / 2; b.rotation.y = (r() - 0.5) * 0.35;
      g.add(b); y += h;
    }
    g.userData.height = y;
    return g;
  }
  function bookStack(K) {
    const r = K.rng(3);
    const g = books(K, [[0.24, 0.035, 0.17, '#1e3a2c'], [0.22, 0.028, 0.16, '#c7c1b2'], [0.21, 0.04, 0.15, '#7c2f28'], [0.19, 0.025, 0.14, '#2b2f3a']], r);
    const top = g.userData.height;
    const mug = K.lathe([[0, 0], [0.036, 0], [0.04, 0.005], [0.04, 0.09], [0.036, 0.09], [0.035, 0.012], [0, 0.012]], K.plastic('#1b1d1c', 0.35), 40);
    mug.position.set(0.02, top, 0.01); g.add(mug);
    const coffee = K.cyl(0.035, 0.035, 0.002, K.std('#2a160b', 0.15), 32); coffee.position.set(0.02, top + 0.075, 0.01); g.add(coffee);
    const handle = K.torus(0.022, 0.006, K.plastic('#1b1d1c', 0.35), Math.PI * 1.2, 10, 24); handle.position.set(0.062, top + 0.048, 0.01); handle.rotation.z = -Math.PI * 0.6; g.add(handle);
    const logo = laurelPlane(K, 0.04, '#39ff88', 1.2); logo.position.set(0.02, top + 0.05, 0.0505); g.add(logo);
    return g;
  }

  function keycapJar(K) {
    const g = K.group();
    const prof = [[0, 0.002], [0.05, 0.002], [0.056, 0.012], [0.058, 0.13], [0.05, 0.145], [0.045, 0.15]];
    const glass = K.lathe(prof, K.glass('#dff2ea', 0.22), 48); g.add(glass);
    const lid = K.cyl(0.048, 0.048, 0.025, K.wood('walnut'), 40); lid.position.y = 0.162; g.add(lid);
    const r = K.rng(12);
    const cols = ['#ecebe5', '#d5503f', '#f2c230', '#9fd3cf', '#26272b', '#e07a3a', '#39ff88', '#b9a6d6', '#8f939a'];
    const geo = new K.THREE.BoxGeometry(0.017, 0.01, 0.017);
    for (const col of cols) {
      const n = 9;
      const im = new K.THREE.InstancedMesh(geo, K.plastic(col, 0.5), n);
      const o = new K.THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, rr = Math.sqrt(r()) * 0.038;
        o.position.set(Math.cos(a) * rr, 0.012 + r() * 0.1, Math.sin(a) * rr);
        o.rotation.set(r() * 3, r() * 3, r() * 3);
        o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      }
      im.computeBoundingBox(); im.computeBoundingSphere();
      g.add(im);
    }
    return g;
  }

  // ---------- lighting ----------
  function deskLamp(K) {
    const g = K.group();
    const m = K.std('#151618', 0.35, 0.75);
    g.add(K.lathe([[0, 0], [0.075, 0], [0.078, 0.008], [0.07, 0.02], [0.02, 0.026], [0, 0.026]], m, 48));
    const j0 = [0, 0.03, -0.02], j1 = [0, 0.33, -0.1], j2 = [0, 0.45, 0.17];
    const rod = (a, b) => {
      const v = new K.THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      for (const off of [-0.01, 0.01]) {
        const r = K.cyl(0.004, 0.004, v.length(), m, 12);
        r.position.set((a[0] + b[0]) / 2 + off, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        r.quaternion.setFromUnitVectors(new K.THREE.Vector3(0, 1, 0), v.clone().normalize());
        g.add(r);
      }
      const pts = [];
      for (let i = 0; i <= 80; i++) { const t = i / 80, s = 0.25 + t * 0.45, a2 = t * 22 * TAU; pts.push([0.018 + Math.cos(a2) * 0.004, a[1] + (b[1] - a[1]) * s + Math.sin(a2) * 0.004, a[2] + (b[2] - a[2]) * s]); }
      g.add(K.tube(pts, 0.001, K.metal('#c8cbd0'), 400, 4));
    };
    rod(j0, j1); rod(j1, j2);
    for (const j of [j0, j1, j2]) { const k = K.cyl(0.012, 0.012, 0.032, m, 20); k.rotation.z = Math.PI / 2; k.position.set(...j); g.add(k); }
    const shade = K.group();
    const outer = K.lathe([[0.012, 0.06], [0.02, 0.055], [0.03, 0.03], [0.06, -0.02], [0.065, -0.03]], m, 48);
    outer.material = m; shade.add(outer);
    const innerM = K.memo('lampinner', () => new K.THREE.MeshStandardMaterial({ color: '#f5e7d0', emissive: '#ffcc88', emissiveIntensity: 0.9, side: K.THREE.BackSide, roughness: 0.6 }));
    const inner = K.lathe([[0.011, 0.058], [0.019, 0.053], [0.029, 0.029], [0.059, -0.019], [0.064, -0.029]], innerM, 48); shade.add(inner);
    const bulb = K.sph(0.022, K.glow('#ffd59a', 5), 24, 16); bulb.position.y = 0.0; shade.add(bulb);
    shade.position.set(0, 0.42, 0.2); shade.rotation.x = 0.5;
    g.add(shade);
    const light = new K.THREE.PointLight('#ffb46b', 1.4, 2.2, 2); light.position.set(0, 0.36, 0.25); g.add(light);
    return g;
  }

  function lantern(K) {
    const g = K.group();
    const wood = K.wood('walnut');
    const S = 0.3, H = 0.62;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = K.rbox(0.025, H, 0.025, 0.004, wood); p.position.set(sx * S / 2, H / 2, sz * S / 2); g.add(p); }
    for (const y of [0.04, H - 0.015]) for (const r of [0, 1]) for (const s of [-1, 1]) {
      const bar = K.rbox(S, 0.022, 0.022, 0.004, wood);
      bar.position.set(r ? 0 : s * S / 2, y, r ? s * S / 2 : 0); bar.rotation.y = r ? 0 : Math.PI / 2; g.add(bar);
    }
    const capTop = K.rbox(S + 0.05, 0.025, S + 0.05, 0.006, wood); capTop.position.y = H + 0.012; g.add(capTop);
    const paper = K.canvasTex('shoji', 128, 256, (c, w, h) => {
      c.fillStyle = '#fff1d6'; c.fillRect(0, 0, w, h);
      const r = K.rng(9);
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(200,160,110,${r() * 0.12})`; c.fillRect(r() * w, r() * h, 1 + r() * 6, 1); }
      c.fillStyle = 'rgba(70,40,20,.9)';
      for (let x = 0; x <= w; x += w / 3) c.fillRect(x - 2, 0, 4, h);
      for (let y = 0; y <= h; y += h / 5) c.fillRect(0, y - 2, w, 4);
    });
    const pm = K.memo('paper', () => new K.THREE.MeshStandardMaterial({ color: '#ffffff', map: paper, emissive: '#ffbf73', emissiveMap: paper, emissiveIntensity: 1.25, roughness: 0.9, side: K.THREE.DoubleSide }));
    for (let i = 0; i < 4; i++) {
      const pl = K.mesh(new K.THREE.PlaneGeometry(S - 0.02, H - 0.08), pm);
      const a = i * Math.PI / 2;
      pl.position.set(Math.sin(a) * (S / 2 - 0.004), 0.04 + (H - 0.08) / 2 + 0.01, Math.cos(a) * (S / 2 - 0.004));
      pl.rotation.y = a; g.add(pl);
    }
    const base = K.rbox(S + 0.03, 0.03, S + 0.03, 0.006, wood); base.position.y = 0.015; g.add(base);
    const light = new K.THREE.PointLight('#ffb067', 2.2, 3, 2); light.position.y = 0.36; g.add(light);
    return g;
  }

  function lavaLamp(K) {
    const g = K.group();
    const chrome = K.std('#c9ccd2', 0.18, 1);
    g.add(K.lathe([[0, 0], [0.07, 0], [0.07, 0.01], [0.04, 0.14], [0.036, 0.15], [0, 0.15]], chrome, 48));
    const vessel = [[0.036, 0.15], [0.055, 0.25], [0.058, 0.3], [0.042, 0.4], [0.03, 0.45]];
    const liquid = K.memo('lavaliquid', () => new K.THREE.MeshStandardMaterial({ color: '#2a0b4a', emissive: '#7a2bd9', emissiveIntensity: 0.55, transparent: true, opacity: 0.6, roughness: 0.05, depthWrite: false }));
    g.add(K.lathe(vessel, liquid, 48));
    g.add(K.lathe(vessel.map(([r, y]) => [r + 0.0015, y]), K.glass('#ffffff', 0.12), 48));
    g.add(K.lathe([[0.03, 0.45], [0.03, 0.47], [0.02, 0.5], [0, 0.505]], chrome, 32));
    const blobM = K.glow('#ff6a2a', 2.6);
    const blobs = [];
    for (let i = 0; i < 5; i++) { const b = K.sph(0.016 + i % 3 * 0.005, blobM, 20, 14); g.add(b); blobs.push(b); }
    const pool = K.sph(0.04, blobM, 24, 12); pool.scale.y = 0.35; pool.position.y = 0.16; g.add(pool);
    const light = new K.THREE.PointLight('#ff6a3a', 0.8, 1.6, 2); light.position.y = 0.3; g.add(light);
    g.userData.tick = t => blobs.forEach((b, i) => {
      const ph = (t * 0.05 * (1 + i * 0.13) + i * 0.21) % 1;
      const y = 0.17 + 0.25 * (0.5 - 0.5 * Math.cos(ph * TAU));
      const radAt = y < 0.25 ? 0.036 + (y - 0.15) * 0.19 : 0.058 - (y - 0.3) * 0.16;
      b.position.set(Math.sin(i * 2.1 + t * 0.2) * Math.max(0, radAt - 0.03) * 0.5, y, Math.cos(i * 1.7) * Math.max(0, radAt - 0.03) * 0.5);
      b.scale.set(1, 1.3 + 0.3 * Math.sin(t * 0.7 + i), 1);
    });
    g.userData.tick(0);
    return g;
  }

  function ledStrip(K) {
    const g = K.group();
    const L = 2.9;
    const chan = K.rbox(L, 0.016, 0.018, 0.003, K.std('#aeb2b8', 0.3, 0.9)); chan.position.set(0, 0.008, 0.009); g.add(chan);
    const diff = K.box(L - 0.01, 0.004, 0.012, K.glow('#39ff88', 4)); diff.position.set(0, 0.0, 0.009); g.add(diff);
    for (const x of [-0.95, 0.95]) { const l = new K.THREE.PointLight('#39ff88', 0.45, 2.2, 2); l.position.set(x, -0.2, 0.3); g.add(l); }
    return g;
  }

  function hexPanels(K) {
    const g = K.group();
    const R = 0.12, cells = [[0, 0], [1, 0], [1, -1], [2, -1], [2, 0], [3, -1], [0, 1]];
    const cols = ['#39ff88', '#7dffb5', '#2fd872', '#b8ffd6', '#1f9e57', '#39ff88', '#7dffb5'];
    const glows = [];
    cells.forEach(([q, r], i) => {
      const x = (q + r / 2) * R * Math.sqrt(3) * 1.04, y = r * R * 1.5 * 1.04;
      const body = K.cyl(R, R, 0.02, K.plastic('#e7e9ea', 0.5), 6); body.rotation.set(Math.PI / 2, 0, Math.PI / 6 + Math.PI / 2); body.position.set(x, y, 0.01); g.add(body);
      const m = K.memo('hexglow' + i, () => new K.THREE.MeshStandardMaterial({ color: '#000', emissive: cols[i], emissiveIntensity: 1.6, roughness: 0.6 }));
      const face = K.cyl(R * 0.9, R * 0.9, 0.003, m, 6); face.rotation.set(Math.PI / 2, 0, Math.PI / 6 + Math.PI / 2); face.position.set(x, y, 0.0215); g.add(face);
      glows.push(m);
    });
    const box = new K.THREE.Box3().setFromObject(g);
    g.children.forEach(c => { c.position.x -= (box.min.x + box.max.x) / 2; c.position.y -= box.min.y; });
    const light = new K.THREE.PointLight('#39ff88', 0.6, 2, 2); light.position.set(0, 0.2, 0.4); g.add(light);
    g.userData.tick = t => glows.forEach((m, i) => { m.emissiveIntensity = 1.5 + Math.sin(t * 0.8 + i * 0.9) * 0.5; });
    return g;
  }

  function neonSign(K) {
    const g = K.group();
    const W = 1.2, H = 0.36;
    const acrylic = K.memo('acrylic', () => new K.THREE.MeshStandardMaterial({ color: '#0a120e', roughness: 0.55, transparent: true, opacity: 0.55, depthWrite: false }));
    const board = K.rbox(W, H, 0.01, 0.01, acrylic); board.position.set(0, H / 2, 0.035); board.material.userData.glass = true; g.add(board);
    for (const sx of [-1, 1]) for (const sy of [0, 1]) { const s = K.cyl(0.008, 0.008, 0.03, K.metal('#c9ccd2', 0.2), 16); s.rotation.x = Math.PI / 2; s.position.set(sx * (W / 2 - 0.04), 0.04 + sy * (H - 0.08), 0.015); g.add(s); }
    const tex = K.canvasTex('neon', 1024, 300, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const tubeStroke = (fn, lw) => {
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        c.shadowColor = '#39ff88'; c.shadowBlur = 24; c.strokeStyle = '#39ff88'; c.lineWidth = lw * 1.8; fn(); c.stroke();
        c.shadowBlur = 0; c.strokeStyle = '#d9ffe9'; c.lineWidth = lw * 0.7; fn(); c.stroke();
        c.restore();
      };
      c.font = `700 120px ${K.MONO}`; c.textBaseline = 'middle';
      const text = '10000WPM';
      const tw = c.measureText(text).width;
      const lw = 190, gap = 40;
      const left = (w - (lw + gap + tw)) / 2;
      const lx = left + lw / 2, ly = h / 2;
      const x0 = left + lw + gap;
      c.save(); c.shadowColor = '#39ff88'; c.shadowBlur = 26; c.lineWidth = 8; c.strokeStyle = '#39ff88'; c.strokeText(text, x0, ly + 4);
      c.shadowBlur = 0; c.lineWidth = 3; c.strokeStyle = '#e6fff0'; c.strokeText(text, x0, ly + 4); c.restore();
      tubeStroke(() => { c.beginPath(); c.moveTo(lx - 42, ly + 52); c.lineTo(lx, ly - 58); c.lineTo(lx + 42, ly + 52); c.moveTo(lx - 24, ly + 14); c.lineTo(lx + 24, ly + 14); }, 7);
      tubeStroke(() => {
        c.beginPath();
        c.arc(lx, ly, 88, Math.PI * 0.62, Math.PI * 1.3);
        for (let i = 0; i < 5; i++) { const a = Math.PI * (0.7 + i * 0.13); c.moveTo(lx + Math.cos(a) * 88, ly + Math.sin(a) * 88); c.lineTo(lx + Math.cos(a - 0.12) * 112, ly + Math.sin(a - 0.12) * 112); }
        c.moveTo(lx + Math.cos(Math.PI * 0.38) * 88, ly + Math.sin(Math.PI * 0.38) * 88);
        c.arc(lx, ly, 88, Math.PI * 0.38, -Math.PI * 0.3, true);
        for (let i = 0; i < 5; i++) { const a = Math.PI * (0.3 - i * 0.13); c.moveTo(lx + Math.cos(a) * 88, ly + Math.sin(a) * 88); c.lineTo(lx + Math.cos(a + 0.12) * 112, ly + Math.sin(a + 0.12) * 112); }
      }, 5);
    });
    const m = K.memo('neonmat', () => new K.THREE.MeshStandardMaterial({ color: '#000', map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.7, transparent: true, depthWrite: false }));
    const plane = K.mesh(new K.THREE.PlaneGeometry(W - 0.04, (W - 0.04) * 300 / 1024), m); plane.position.set(0, H / 2, 0.042); g.add(plane);
    const light = new K.THREE.PointLight('#39ff88', 0.7, 2.2, 2); light.position.set(0, H / 2, 0.55); g.add(light);
    g.userData.tick = t => { m.emissiveIntensity = 1.7 + (Math.sin(t * 23) > 0.995 ? -0.8 : 0); };
    return g;
  }

  // ---------- plants ----------
  function leafTex(K, base, rib) {
    return K.canvasTex('leaf|' + base, 128, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, base); gr.addColorStop(0.5, rib); gr.addColorStop(1, base);
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      c.fillStyle = gr; c.globalAlpha = 0.35; c.fillRect(0, 0, w, h); c.globalAlpha = 1;
      c.strokeStyle = rib; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 0); c.stroke();
      c.lineWidth = 1.2; c.globalAlpha = 0.6;
      for (let y = h - 20; y > 10; y -= 22) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w / 2 + s * w * 0.25, y - 10, w / 2 + s * w * 0.48, y - 30); c.stroke(); }
    });
  }
  function monsteraLeafGeo(K, L, W) {
    const THREE = K.THREE;
    return K.memo(`monleaf|${L}|${W}`, () => {
      const hw = t => W / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)), 0.75) * (1 - 0.25 * t);
      const right = [];
      const notches = [0.22, 0.38, 0.53, 0.67, 0.8];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        right.push([hw(t), t * L]);
        for (const n of notches) if (Math.abs(t - n) < 1 / 120) { right.push([hw(t) * 0.38, (t + 0.03) * L], [hw(t + 0.035), (t + 0.035) * L]); }
      }
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.02 * L);
      right.forEach(([x, y]) => shape.lineTo(x, y));
      [...right].reverse().forEach(([x, y]) => shape.lineTo(-x, y));
      shape.lineTo(0, -0.02 * L);
      for (const n of [0.3, 0.46, 0.6]) for (const s of [-1, 1]) {
        const hole = new THREE.Path();
        hole.absellipse(s * hw(n) * 0.22, (n + 0.01) * L, W * 0.025, L * 0.03, 0, TAU, false, 0);
        shape.holes.push(hole);
      }
      const geo = new THREE.ShapeGeometry(shape, 10);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        uv.setXY(i, x / W + 0.5, y / L);
        const t = y / L;
        p.setZ(i, -Math.pow(Math.max(0, t), 2) * L * 0.45 + Math.abs(x) * 0.35);
      }
      geo.computeVertexNormals();
      return geo;
    });
  }
  function pot(K, r, h, col, rough = 0.8) {
    return K.lathe([[0, 0], [r * 0.78, 0], [r * 0.82, 0.01], [r, h * 0.92], [r * 1.04, h], [r * 0.98, h], [r * 0.93, h * 0.94], [0, h * 0.94]], K.std(col, rough), 48);
  }
  function monstera(K) {
    const g = K.group();
    g.add(pot(K, 0.17, 0.32, '#5a5c5e', 0.9));
    const soil = K.cyl(0.16, 0.16, 0.01, K.std('#2a1d14', 1), 32); soil.position.y = 0.3; g.add(soil);
    const leafM = K.memo('monm', () => new K.THREE.MeshStandardMaterial({ map: leafTex(K, '#1f5a2e', '#5fa86a'), roughness: 0.42, side: K.THREE.DoubleSide }));
    const stemM = K.std('#3f6e35', 0.6);
    const r = K.rng(31);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.4;
      const reach = 0.2 + r() * 0.25, up = 0.45 + r() * 0.45;
      const end = [Math.cos(a) * reach, 0.3 + up, Math.sin(a) * reach];
      g.add(K.tube([[0, 0.3, 0], [end[0] * 0.3, 0.3 + up * 0.55, end[2] * 0.3], end], 0.007, stemM, 24, 6));
      const L = 0.3 + r() * 0.12;
      const leaf = K.mesh(monsteraLeafGeo(K, L, L * 0.85), leafM);
      leaf.position.set(...end);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.set(-0.6 - r() * 0.5, -a + Math.PI / 2, (r() - 0.5) * 0.4);
      g.add(leaf);
    }
    return g;
  }

  function snakePlant(K) {
    const g = K.group();
    g.add(K.lathe([[0, 0], [0.11, 0], [0.12, 0.02], [0.12, 0.26], [0.125, 0.27], [0, 0.27]], K.std('#e9e6df', 0.35), 48));
    const band = K.cyl(0.1215, 0.1215, 0.02, K.std('#b8925a', 0.4, 0.8), 48, true); band.position.y = 0.05; g.add(band);
    const tex = K.canvasTex('snake', 64, 256, (c, w, h) => {
      c.fillStyle = '#21452a'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 9) { c.strokeStyle = `rgba(160,200,140,${0.25 + (y % 27) / 80})`; c.lineWidth = 2; c.beginPath(); for (let x = 0; x <= w; x += 6) c.lineTo(x, y + Math.sin(x * 0.3 + y) * 2.5); c.stroke(); }
      c.fillStyle = '#d6c35a'; c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
    });
    const m = K.memo('snakem', () => new K.THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, side: K.THREE.DoubleSide }));
    const r = K.rng(17);
    for (let i = 0; i < 11; i++) {
      const H = 0.45 + r() * 0.4;
      const geo = new K.THREE.PlaneGeometry(0.07, H, 4, 16);
      const p = geo.attributes.position;
      const lean = (r() - 0.5) * 0.25, twist = (r() - 0.5) * 1.2;
      for (let j = 0; j < p.count; j++) {
        let x = p.getX(j); const y = p.getY(j) + H / 2, t = Math.min(1, Math.max(0, y / H));
        x *= Math.pow(1 - t, 0.55) * (1 + 0.3 * Math.sin(t * Math.PI));
        const tw = twist * t;
        p.setXYZ(j, x * Math.cos(tw) + lean * t * t * H, y, x * Math.sin(tw) + x * x * 3);
      }
      geo.computeVertexNormals();
      const leaf = K.mesh(geo, m);
      const a = r() * TAU, rr = r() * 0.06;
      leaf.position.set(Math.cos(a) * rr, 0.25, Math.sin(a) * rr);
      leaf.rotation.y = r() * TAU;
      g.add(leaf);
    }
    const soil = K.cyl(0.115, 0.115, 0.01, K.std('#2a1d14', 1), 32); soil.position.y = 0.255; g.add(soil);
    return g;
  }

  function heartLeafGeo(K) {
    return K.memo('heartleaf', () => {
      const s = new K.THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.03, 0.01, 0.035, 0.045, 0, 0.07);
      s.bezierCurveTo(-0.035, 0.045, -0.03, 0.01, 0, 0);
      const geo = new K.THREE.ShapeGeometry(s, 8);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.5 - p.getY(i) * p.getY(i) * 3);
      geo.computeVertexNormals();
      return geo;
    });
  }
  function hangingPlant(K) {
    const g = K.group();
    const H = 0.95;
    const plank = K.rbox(0.36, 0.05, 0.02, 0.006, K.wood('oak')); plank.position.set(0, H - 0.12, 0.01); g.add(plank);
    const ring = K.torus(0.11, 0.006, K.std('#c9a24a', 0.3, 0.9), TAU, 8, 40); ring.rotation.x = Math.PI / 2; ring.position.set(0, H - 0.06, 0.13); g.add(ring);
    const potG = pot(K, 0.1, 0.13, '#d9d4c9', 0.5); potG.position.set(0, H - 0.17, 0.13); g.add(potG);
    for (const sx of [-1, 1]) { const arm = K.box(0.008, 0.008, 0.12, K.std('#c9a24a', 0.3, 0.9)); arm.position.set(sx * 0.11, H - 0.06, 0.06); g.add(arm); }
    const r = K.rng(44);
    const stemM = K.std('#3d6b30', 0.6);
    const leafPos = [];
    for (let v = 0; v < 9; v++) {
      const a = v / 9 * TAU, len = 0.35 + r() * 0.5;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push([Math.cos(a) * (0.08 + t * 0.12) + Math.sin(t * 5 + v) * 0.02, H - 0.05 - t * len - (t < 0.15 ? -0.03 : 0), 0.13 + Math.max(-0.11, Math.sin(a) * (0.08 + t * 0.08))]);
      }
      g.add(K.tube(pts, 0.0025, stemM, 32, 5));
      const curve = K.curve(pts);
      for (let k = 0; k < 10; k++) leafPos.push({ p: curve.getPoint(0.05 + k / 10 * 0.95), side: k % 2 ? 1 : -1, a });
    }
    const im = new K.THREE.InstancedMesh(heartLeafGeo(K), K.memo('pothos', () => new K.THREE.MeshStandardMaterial({ map: leafTex(K, '#3d7a35', '#b4d36a'), roughness: 0.45, side: K.THREE.DoubleSide })), leafPos.length);
    const o = new K.THREE.Object3D(), col = new K.THREE.Color();
    leafPos.forEach((lp, i) => {
      o.position.copy(lp.p);
      o.rotation.set(Math.PI + 0.4 + r() * 0.6, lp.a + lp.side * 1.1, (r() - 0.5) * 0.6);
      const s = 0.7 + r() * 0.6; o.scale.set(s, s, s);
      o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, col.setHSL(0.27 + r() * 0.06, 0.5, 0.45 + r() * 0.25));
    });
    im.computeBoundingBox(); im.computeBoundingSphere();
    g.add(im);
    return g;
  }

  function cactus(K) {
    const g = K.group();
    g.add(pot(K, 0.05, 0.07, '#b5623a', 0.85));
    const body = (h, rad) => {
      const pts = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([rad * Math.pow(Math.sin(Math.PI * Math.min(1, 0.5 + t * 0.5)), 0.5) * (t < 0.1 ? 0.9 : 1), t * h]); }
      pts.push([0, h]);
      const geo = new K.THREE.LatheGeometry(pts.map(p => new K.THREE.Vector2(p[0], p[1])), 64);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), f = 1 + 0.09 * Math.cos(a * 10); p.setX(i, x * f); p.setZ(i, z * f); }
      geo.computeVertexNormals();
      return K.mesh(geo, K.std('#4c8a48', 0.55));
    };
    const main = body(0.16, 0.035); main.position.y = 0.06; g.add(main);
    const arm = body(0.07, 0.02); arm.position.set(0.035, 0.12, 0); arm.rotation.z = -0.3; g.add(arm);
    for (let i = 0; i < 5; i++) { const pet = K.sph(0.008, K.std('#ff7ab6', 0.5), 10, 8); pet.scale.set(1, 0.5, 1.6); pet.position.set(Math.cos(i * 1.26) * 0.008, 0.222, Math.sin(i * 1.26) * 0.008); pet.rotation.y = i * 1.26; g.add(pet); }
    const soil = K.cyl(0.046, 0.046, 0.006, K.std('#cdb79a', 1), 32); soil.position.y = 0.064; g.add(soil);
    return g;
  }

  // ---------- wall and shelf ----------
  function pegboard(K) {
    const g = K.group();
    const W = 1.2, H = 0.8, y0 = 0;
    const holes = K.canvasTex('peg', 256, 256, (c, w, h) => { c.fillStyle = '#1a1c1d'; c.fillRect(0, 0, w, h); c.fillStyle = '#050606'; for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) { c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); } }, { repeat: [W / 0.25, H / 0.25] });
    const bm = K.memo('pegmat', () => new K.THREE.MeshStandardMaterial({ map: holes, roughness: 0.6, metalness: 0.4 }));
    const panel = K.rbox(W, H, 0.012, 0.004, K.std('#1a1c1d', 0.6, 0.4));
    panel.position.set(0, y0 + H / 2, 0.026); g.add(panel);
    const face = K.mesh(new K.THREE.PlaneGeometry(W - 0.01, H - 0.01), bm); face.position.set(0, y0 + H / 2, 0.0326); g.add(face);
    for (const sx of [-1, 1]) for (const sy of [0, 1]) { const s = K.cyl(0.01, 0.01, 0.02, K.std('#0d0d0e', 0.6), 12); s.rotation.x = Math.PI / 2; s.position.set(sx * (W / 2 - 0.05), 0.05 + sy * (H - 0.1), 0.01); g.add(s); }
    const hook = (x, y, len = 0.07) => g.add(K.tube([[x, y, 0.034], [x, y, 0.034 + len * 0.8], [x, y + 0.02, 0.034 + len]], 0.003, K.metal('#a8acb2', 0.3), 12, 6));
    // two keyboards on brackets
    const kbs = [board('aula-f99'), board('attackshark-x68he')];
    kbs.forEach((b, i) => {
      const kb = K.keyboard(b);
      kb.rotation.x = Math.PI / 2 - 0.12;
      kb.position.set(-0.3, 0.18 + i * 0.3, 0.06);
      g.add(kb);
      for (const sx of [-0.12, 0.12]) hook(-0.3 + sx, 0.08 + i * 0.3, 0.07);
    });
    hook(0.2, 0.62, 0.09);
    const hp = headphones(K); hp.position.set(0.2, 0.62, 0.11); hp.rotation.y = Math.PI / 2 - 0.15; hp.scale.setScalar(0.95); g.add(hp);
    const shelf = K.rbox(0.28, 0.01, 0.1, 0.003, K.std('#1d1f21', 0.5, 0.5)); shelf.position.set(0.4, 0.22, 0.085); g.add(shelf);
    const fig = astronaut(K); fig.position.set(0.44, 0.225, 0.08); fig.scale.setScalar(0.8); g.add(fig);
    const box = K.rbox(0.06, 0.08, 0.06, 0.006, K.std('#2b2f2d', 0.6)); box.position.set(0.32, 0.265, 0.08); g.add(box);
    const logo = laurelPlane(K, 0.22, '#39ff88', 2.4); logo.position.set(0.3, 0.45, 0.035); g.add(logo);
    g.add(K.tube([[0.05, 0.52, 0.04], [0.04, 0.4, 0.07], [0.08, 0.3, 0.06], [0.03, 0.2, 0.05], [0.06, 0.1, 0.04]], 0.003, K.std('#101112', 0.7), 40, 6));
    return g;
  }

  function bookRows(K, g, x0, x1, y, depth, r, z = 0) {
    const cols = ['#1e3a2c', '#c7c1b2', '#7c2f28', '#2b2f3a', '#d6b26a', '#3a5a48', '#151617', '#8a8f86', '#4a2f45', '#e6e2d6'];
    let x = x0;
    const list = [];
    while (x < x1 - 0.03) {
      if (r() < 0.12) { x += 0.04 + r() * 0.08; continue; }
      const w = 0.018 + r() * 0.03, h = 0.16 + r() * 0.1;
      if (x + w > x1) break;
      list.push({ x: x + w / 2, w, h, d: depth * (0.7 + r() * 0.25), col: cols[r() * cols.length | 0], lean: r() < 0.08 ? 0.18 : 0 });
      x += w + 0.002;
    }
    const geo = new K.THREE.BoxGeometry(1, 1, 1);
    const im = new K.THREE.InstancedMesh(geo, K.std('#ffffff', 0.7), list.length);
    const o = new K.THREE.Object3D(), c = new K.THREE.Color();
    list.forEach((b, i) => {
      o.position.set(b.x, y + b.h / 2, z); o.scale.set(b.w, b.h, b.d); o.rotation.set(0, 0, b.lean);
      o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.set(b.col));
    });
    im.computeBoundingBox(); im.computeBoundingSphere();
    g.add(im);
  }

  function bookshelf(K) {
    const g = K.group();
    const W = 0.8, H = 1.8, D = 0.32, t = 0.022;
    const wood = K.wood('walnut');
    const back = K.box(W - 0.01, H - 0.01, 0.008, K.std('#2a1c12', 0.8)); back.position.set(0, H / 2, -D / 2 + 0.006); g.add(back);
    for (const sx of [-1, 1]) { const s = K.rbox(t, H, D, 0.004, wood); s.position.set(sx * (W / 2 - t / 2), H / 2, 0); g.add(s); }
    const r = K.rng(2);
    const levels = [0.04, 0.4, 0.76, 1.12, 1.46, H - t / 2];
    levels.forEach((y, i) => {
      const s = K.rbox(W - 0.01, t, D, 0.004, wood); s.position.set(0, y, 0); g.add(s);
      if (i < levels.length - 1 && i !== 3) bookRows(K, g, -W / 2 + t + 0.01, i === 2 ? 0.05 : W / 2 - t - 0.01, y + t / 2, D * 0.85, r);
    });
    const plant = cactus(K); plant.position.set(0.22, 0.76 + t / 2, 0.02); plant.scale.setScalar(1.2); g.add(plant);
    const fig = astronaut(K); fig.position.set(-0.15, 1.12 + t / 2, 0.02); g.add(fig);
    const box = K.rbox(0.2, 0.12, 0.2, 0.01, K.std('#c7c1b2', 0.8)); box.position.set(0.18, 1.12 + t / 2 + 0.06, 0); g.add(box);
    const plinth = K.box(W - 0.04, 0.04, D - 0.03, K.std('#140e09', 0.8)); plinth.position.set(0, 0.02, 0.01); g.add(plinth);
    return g;
  }

  function shelfIndustrial(K) {
    const g = K.group();
    const W = 1.0, H = 1.7, D = 0.4;
    const m = K.std('#151617', 0.4, 0.75);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = K.rbox(0.03, H, 0.03, 0.004, m); post.position.set(sx * (W / 2 - 0.015), H / 2, sz * (D / 2 - 0.015)); g.add(post);
    }
    const r = K.rng(8);
    const levels = [0.08, 0.5, 0.92, 1.34, H - 0.02];
    const ledM = K.glow('#ffb46b', 3.2);
    levels.forEach((y, i) => {
      const s = K.rbox(W - 0.02, 0.03, D - 0.01, 0.005, K.wood('oak')); s.position.set(0, y, 0); g.add(s);
      for (const sz of [-1, 1]) { const rail = K.box(W, 0.02, 0.02, m); rail.position.set(0, y - 0.02, sz * (D / 2 - 0.015)); g.add(rail); }
      if (i > 0) { const led = K.box(W - 0.08, 0.004, 0.01, ledM); led.position.set(0, y - 0.017, D / 2 - 0.05); g.add(led); }
    });
    // shelf contents
    bookRows(K, g, -W / 2 + 0.04, -0.05, 0.095, D * 0.7, r, -0.03);
    const kb1 = K.keyboard(board('corsair-vanguard96')); kb1.position.set(0, 0.515, 0); kb1.rotation.y = -0.05; g.add(kb1);
    const kb2 = K.keyboard(board('chilkey-sf60')); kb2.position.set(-0.15, 0.935, 0.02); g.add(kb2);
    const plant = cactus(K); plant.position.set(0.3, 0.935, 0); plant.scale.setScalar(1.3); g.add(plant);
    bookRows(K, g, 0.05, W / 2 - 0.04, 1.355, D * 0.7, r, -0.03);
    const jar = keycapJar(K); jar.position.set(-0.3, 1.355, 0); g.add(jar);
    const crate = K.rbox(0.26, 0.2, 0.3, 0.01, K.wood('ash')); crate.position.set(0.28, 0.2, 0); g.add(crate);
    const light = new K.THREE.PointLight('#ffb46b', 1.0, 1.8, 2); light.position.set(0, 0.9, 0.4); g.add(light);
    return g;
  }

  function wallShelf(K) {
    const g = K.group();
    const W = 0.8, D = 0.22;
    const r = K.rng(5);
    for (const [y, i] of [[0.02, 0], [0.4, 1]]) {
      const s = K.rbox(W, 0.035, D, 0.006, K.wood('oak')); s.position.set(0, y + 0.0175, D / 2); g.add(s);
      const led = K.box(W - 0.06, 0.004, 0.008, K.glow('#ffb46b', 3)); led.position.set(0, y - 0.002, D - 0.03); g.add(led);
      if (i === 0) {
        bookRows(K, g, -W / 2 + 0.03, 0.05, y + 0.035, D * 0.8, r, D / 2);
        const plant = cactus(K); plant.position.set(0.22, y + 0.035, D / 2); plant.scale.setScalar(1.2); g.add(plant);
      } else {
        const fig = astronaut(K); fig.position.set(-0.22, y + 0.035, D / 2); g.add(fig);
        const st = bookStack(K); st.position.set(0.12, y + 0.035, D / 2); st.scale.setScalar(0.8); g.add(st);
      }
    }
    const light = new K.THREE.PointLight('#ffb46b', 0.6, 1.4, 2); light.position.set(0, -0.1, 0.3); g.add(light);
    return g;
  }

  function poster(K, kind) {
    const g = K.group();
    const W = 0.6, H = 0.85;
    const frame = K.rbox(W, H, 0.025, 0.004, K.std('#121314', 0.35, 0.7)); frame.position.set(0, H / 2, 0.0125); g.add(frame);
    const tex = K.canvasTex('poster|' + kind, 360, 510, (c, w, h) => {
      if (kind === 'logo') {
        const gr = c.createRadialGradient(w / 2, h * 0.38, 10, w / 2, h * 0.45, h * 0.7);
        gr.addColorStop(0, '#0e2b1c'); gr.addColorStop(1, '#030604');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(57,255,136,.12)';
        for (let y = 0; y < h; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        K.drawLaurel(c, w / 2, h * 0.38, w * 0.7, '#39ff88', 14);
        c.textAlign = 'center'; c.fillStyle = '#d7f5e3'; c.font = `700 46px ${K.MONO}`; c.fillText('10000WPM', w / 2, h * 0.76);
        c.fillStyle = '#1f9e57'; c.font = `18px ${K.MONO}`; c.fillText('// THE TYPING COLLECTIVE', w / 2, h * 0.82);
      } else {
        K.screenTex('mountain');
        const src = K.screenTex('mountain').image;
        c.drawImage(src, 112, 0, 288, 288, 0, 0, w, h * 0.8);
        c.fillStyle = '#0c1422'; c.fillRect(0, h * 0.8, w, h * 0.2);
        c.textAlign = 'center'; c.fillStyle = '#9fb7d9'; c.font = `22px ${K.MONO}`; c.fillText('ALT 4,808 M', w / 2, h * 0.9);
      }
    });
    const mat = K.box(W - 0.04, H - 0.04, 0.002, K.std('#e9e6df', 0.9)); mat.position.set(0, H / 2, 0.025); g.add(mat);
    const pm = K.memo('postermat|' + kind, () => new K.THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: kind === 'logo' ? 0.25 : 0.1 }));
    const art = K.mesh(new K.THREE.PlaneGeometry(W - 0.1, H - 0.1), pm); art.position.set(0, H / 2, 0.0265); g.add(art);
    const glass = K.box(W - 0.03, H - 0.03, 0.002, K.glass('#ffffff', 0.08)); glass.position.set(0, H / 2, 0.028); g.add(glass);
    return g;
  }

  function rugLaurel(K) {
    const tex = K.canvasTex('ruglaurel', 1024, 768, (c, w, h) => {
      c.fillStyle = '#1b1e1d'; c.fillRect(0, 0, w, h);
      const r = K.rng(77);
      for (let i = 0; i < 26000; i++) { const v = 20 + r() * 26 | 0; c.fillStyle = `rgba(${v},${v + 3},${v + 2},.6)`; c.fillRect(r() * w, r() * h, 2, 2); }
      c.strokeStyle = '#8d958f'; c.lineWidth = 6; c.strokeRect(36, 36, w - 72, h - 72);
      c.lineWidth = 2; c.strokeRect(52, 52, w - 104, h - 104);
      K.drawLaurel(c, w / 2, h / 2 + 10, h * 0.62, '#b9c2bb', 0);
    });
    const m = K.memo('rugl', () => new K.THREE.MeshPhysicalMaterial({ map: tex, roughness: 1, sheen: 1, sheenColor: new K.THREE.Color('#6f7a73'), sheenRoughness: 0.6, bumpMap: K.weaveTex(), bumpScale: 1.5 }));
    const rug = K.rbox(2.0, 0.012, 1.5, 0.005, m, 2); rug.position.y = 0.006;
    return K.group(rug);
  }
  function rugRound(K) {
    const tex = K.canvasTex('juteround', 512, 512, (c, w, h) => {
      c.fillStyle = '#6d8a76'; c.fillRect(0, 0, w, h);
      for (let rr = 4; rr < w / 2; rr += 7) { c.strokeStyle = rr % 3 ? 'rgba(30,50,38,.45)' : 'rgba(200,220,205,.25)'; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, h / 2, rr, 0, TAU); c.stroke(); }
      c.strokeStyle = '#1f2d24'; c.lineWidth = 16; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 22, 0, TAU); c.stroke();
    });
    const m = K.memo('rugr', () => new K.THREE.MeshPhysicalMaterial({ map: tex, roughness: 1, sheen: 0.8, sheenColor: new K.THREE.Color('#bcd2c2'), bumpMap: K.weaveTex(), bumpScale: 2 }));
    const rug = K.cyl(0.85, 0.85, 0.012, [K.std('#3c4f42', 1), m, m][0], 96);
    const top = K.mesh(new K.THREE.CircleGeometry(0.85, 96), m); top.rotation.x = -Math.PI / 2; top.position.y = 0.0122;
    rug.position.y = 0.006;
    return K.group(rug, top);
  }
  function rugShag(K) {
    const g = K.group();
    const bump = K.canvasTex('shag', 512, 512, (c, w, h) => {
      c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
      const r = K.rng(4);
      for (let i = 0; i < 9000; i++) { const v = 60 + r() * 140 | 0; c.strokeStyle = `rgb(${v},${v},${v})`; c.lineWidth = 2; const x = r() * w, y = r() * h, a = r() * TAU; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); c.stroke(); }
    }, { srgb: false });
    const m = K.memo('shagm', () => new K.THREE.MeshPhysicalMaterial({ color: '#a89f90', roughness: 1, sheen: 0.6, sheenColor: new K.THREE.Color('#e8e0d0'), sheenRoughness: 0.8, bumpMap: bump, bumpScale: 4 }));
    const rug = K.rbox(1.6, 0.025, 1.1, 0.01, m, 3); rug.position.y = 0.0125; g.add(rug);
    const geo = new K.THREE.CylinderGeometry(0.003, 0.003, 0.07, 5);
    const n = 64;
    const im = new K.THREE.InstancedMesh(geo, K.std('#a89f90', 0.9), n);
    const o = new K.THREE.Object3D(); const r = K.rng(6);
    for (let i = 0; i < n; i++) {
      const side = i < n / 2 ? -1 : 1, k = i % (n / 2);
      o.position.set(side * (0.8 + 0.03), 0.004, -0.53 + k / (n / 2 - 1) * 1.06);
      o.rotation.set(0, 0, Math.PI / 2 + (r() - 0.5) * 0.3); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    }
    im.computeBoundingBox(); im.computeBoundingSphere();
    g.add(im);
    return g;
  }

  // ---------------------------------------------------------------- catalog
  const kbItem = (key, name, price, desc, size) => ({ id: 'kb-' + key, name, category: 'Keyboards', price, desc, size, wall: false, surface: true, build: (THREE, RB) => RoomKit(THREE, RB).keyboard(board(key)) });
  const K_ = fn => (THREE, RB) => fn(RoomKit(THREE, RB));

  const catalog = [
    // Desks
    { id: 'desk-basic', name: 'Oak desk', category: 'Desks', price: 300, size: [5.6, 2.8], top: 0.75, desc: 'A 140 cm oak desk on black steel legs.', build: K_(deskBasic) },
    { id: 'desk-walnut', name: 'Walnut desk', category: 'Desks', price: 1800, size: [6, 2.8], top: 0.74, desc: 'A 150 cm walnut desk on hairpin legs.', build: K_(deskWalnut) },
    { id: 'desk-standing', name: 'Standing desk', category: 'Desks', price: 2600, size: [6.4, 3], top: 0.78, desc: 'A 160 cm motorised desk with a height display.', build: K_(deskStanding) },
    { id: 'desk-command', name: 'Command desk', category: 'Desks', price: 3800, size: [7.2, 3.2], top: 0.76, desc: 'A 180 cm black desk with six drawers, a desk mat and a green LED edge.', build: K_(deskCommand) },
    { id: 'coffee-table', name: 'Coffee table', category: 'Desks', price: 900, size: [4, 2.2], top: 0.42, desc: 'A low walnut table with a shelf for books.', build: K_(coffeeTable) },
    // Chairs
    { id: 'chair-basic', name: 'Office chair', category: 'Chairs', price: 300, size: [2.6, 2.6], desc: 'A grey fabric office chair on five wheels.', build: K_(chairBasic) },
    { id: 'chair-ergo', name: 'Mesh chair', category: 'Chairs', price: 1900, size: [2.6, 2.6], desc: 'An ergonomic mesh chair with a headrest and lumbar support.', build: K_(chairErgo) },
    { id: 'chair-gaming', name: 'Gaming chair', category: 'Chairs', price: 2900, size: [2.8, 2.8], desc: 'A black and green leather gaming chair with neck and lumbar pillows.', build: K_(chairGaming) },
    { id: 'beanbag', name: 'Beanbag', category: 'Chairs', price: 700, size: [3.6, 3.6], desc: 'A large charcoal beanbag.', build: K_(beanbag) },
    // PC & Tech
    { id: 'pc-tower', name: 'Gaming PC', category: 'PC & Tech', price: 4500, size: [1, 1.9], surface: true, desc: 'A black glass tower with green fans, a water-cooled CPU and a three-fan graphics card.', build: K_(K => pcCase(K, { shell: '#141517', inner: '#0e0f10', gpu: '#1b1d20', accent: '#39ff88', accent2: '#3ee6ff', fanFrame: '#141516', blade: '#e8f5ee' })) },
    { id: 'pc-white', name: 'White gaming PC', category: 'PC & Tech', price: 4200, size: [1, 1.9], surface: true, desc: 'A white glass tower with cyan and pink fans.', build: K_(K => pcCase(K, { shell: '#e9eaec', inner: '#dcdee1', gpu: '#d0d3d7', accent: '#3ee6ff', accent2: '#ff7ab6', fanFrame: '#f2f3f4', blade: '#ffffff' })) },
    { id: 'laptop', name: 'Laptop', category: 'PC & Tech', price: 2200, size: [1.4, 1], surface: true, desc: 'An aluminium laptop with code on the screen.', build: K_(laptop) },
    { id: 'headphone-stand', name: 'Headphones on a stand', category: 'PC & Tech', price: 500, size: [0.8, 0.6], surface: true, desc: 'Over-ear headphones with green rings on a weighted stand.', build: K_(headphoneStand) },
    { id: 'mic-arm', name: 'Microphone arm', category: 'PC & Tech', price: 800, size: [0.6, 1.4], surface: true, desc: 'A studio microphone on a spring arm that clamps to the desk.', build: K_(micArm) },
    // Monitors
    { id: 'monitor-basic', name: '24-inch monitor', category: 'Monitors', price: 300, size: [2.2, 0.9], surface: true, desc: 'A 24-inch monitor on a metal stand.', build: K_(K => K.monitor({ w: 0.54, h: 0.32, bezel: 0.012, screen: 'mountain' })) },
    { id: 'monitor-27', name: '27-inch monitor', category: 'Monitors', price: 1500, size: [2.5, 0.9], surface: true, desc: 'A thin-bezel 27-inch monitor with a green light on the back.', build: K_(K => K.monitor({ w: 0.615, h: 0.36, bezel: 0.006, screen: 'type', backGlow: '#39ff88' })) },
    { id: 'monitor-ultra', name: 'Ultrawide monitor', category: 'Monitors', price: 3200, size: [3.4, 1.1], surface: true, desc: 'A curved 34-inch ultrawide monitor.', build: K_(K => K.monitor({ w: 0.81, h: 0.35, bezel: 0.006, screen: 'logo', curve: 1.5 })) },
    { id: 'monitor-dual', name: 'Dual monitors', category: 'Monitors', price: 2800, size: [4.6, 1.1], surface: true, desc: 'Two 24-inch monitors on one arm.', build: K_(monitorDual) },
    // Keyboards
    { id: 'keyboard-basic', name: 'Black keyboard', category: 'Keyboards', price: 300, size: [1.4, 0.65], wall: false, surface: true, desc: 'A black 75% keyboard with a green backlight.', build: (THREE, RB) => RoomKit(THREE, RB).keyboard(board('basic')) },
    kbItem('aula-f99', 'AULA F99 Pro', 1400, 'The 96% gasket-mount board Art types on, in grey and white with red accents.', [1.75, 0.65]),
    kbItem('womier-sk61he', 'Womier SK61 HE', 1500, 'The aluminium 60% Hall-effect board from Art\'s collab.', [1.3, 0.5]),
    kbItem('loga-yaksa', 'LOGA Yaksa Pro 75 Clear', 1800, 'A clear purple 75% board with a knob and a small screen.', [1.4, 0.7]),
    kbItem('attackshark-x68he', 'Attack Shark X68 HE', 1200, 'A black 65% magnetic board with white keys and orange accents.', [1.35, 0.5]),
    kbItem('corsair-vanguard96', 'Corsair Vanguard 96', 2400, 'A black 96% wireless board with MLX switches.', [1.75, 0.65]),
    kbItem('chilkey-sf60', 'Chilkey SF60 Diamond', 2200, 'An aluminium 60% board with clear crystal keycaps.', [1.3, 0.5]),
    // Decor
    { id: 'cat', name: 'Sleeping cat', category: 'Decor', price: 1500, size: [1.8, 1.5], surface: true, desc: 'A ginger tabby curled up asleep.', build: K_(cat) },
    { id: 'astronaut', name: 'Astronaut figure', category: 'Decor', price: 450, size: [0.5, 0.5], surface: true, desc: 'A 20 cm astronaut figure with a gold visor.', build: K_(astronaut) },
    { id: 'book-stack', name: 'Books and mug', category: 'Decor', price: 350, size: [1, 0.8], surface: true, desc: 'Four stacked books with a coffee mug on top.', build: K_(bookStack) },
    { id: 'keycap-jar', name: 'Keycap jar', category: 'Decor', price: 600, size: [0.5, 0.5], surface: true, desc: 'A glass jar full of spare keycaps.', build: K_(keycapJar) },
    // Lighting
    { id: 'desk-lamp', name: 'Desk lamp', category: 'Lighting', price: 500, size: [0.7, 1.1], surface: true, desc: 'A black spring-arm lamp with a warm bulb.', build: K_(deskLamp) },
    { id: 'lantern', name: 'Lantern lamp', category: 'Lighting', price: 900, size: [1.4, 1.4], desc: 'A walnut floor lantern with paper panels.', build: K_(lantern) },
    { id: 'lava-lamp', name: 'Lava lamp', category: 'Lighting', price: 650, size: [0.6, 0.6], surface: true, desc: 'A chrome lava lamp with orange wax in purple liquid.', build: K_(lavaLamp) },
    { id: 'led-strip', name: 'LED strip', category: 'Lighting', price: 700, size: [11.8, 0.2], wall: true, thumb: { box: [-0.75, -0.45, 0, 0.75, 0.05, 0.05], dir: [0.55, -0.35, 1] }, desc: 'A 3 m green LED strip in an aluminium channel.', build: K_(ledStrip) },
    { id: 'hex-panels', name: 'Hex light panels', category: 'Lighting', price: 1200, size: [4.4, 0.2], wall: true, desc: 'Seven hexagon wall lights in shades of green.', build: K_(hexPanels) },
    { id: 'neon-sign', name: '10000WPM neon sign', category: 'Lighting', price: 2000, size: [4.8, 0.25], wall: true, desc: 'A green neon sign with the laurel mark and 10000WPM.', build: K_(neonSign) },
    // Plants
    { id: 'monstera', name: 'Monstera', category: 'Plants', price: 600, size: [3, 3], desc: 'A tall monstera in a grey concrete pot.', build: K_(monstera) },
    { id: 'snake-plant', name: 'Snake plant', category: 'Plants', price: 450, size: [1.2, 1.2], desc: 'A snake plant in a white pot with a brass band.', build: K_(snakePlant) },
    { id: 'pothos', name: 'Hanging pothos', category: 'Plants', price: 550, size: [1.5, 1], wall: true, desc: 'A pothos in a wall planter with vines hanging down.', build: K_(hangingPlant) },
    { id: 'cactus', name: 'Small cactus', category: 'Plants', price: 300, size: [0.5, 0.5], surface: true, desc: 'A small cactus with a pink flower in a clay pot.', build: K_(cactus) },
    // Wall & Shelf
    { id: 'pegboard', name: 'Pegboard with headphones', category: 'Wall & Shelf', price: 1400, size: [4.8, 0.7], wall: true, desc: 'A black pegboard holding two keyboards, headphones and a glowing laurel.', build: K_(pegboard) },
    { id: 'bookshelf', name: 'Bookshelf', category: 'Wall & Shelf', price: 1300, size: [3.2, 1.3], top: 1.8, desc: 'A walnut bookshelf, 180 cm tall, full of books.', build: K_(bookshelf) },
    { id: 'shelf-industrial', name: 'Industrial shelf', category: 'Wall & Shelf', price: 1600, size: [4, 1.6], top: 1.7, desc: 'A steel and oak shelf with warm lights and two keyboards on display.', build: K_(shelfIndustrial) },
    { id: 'wall-shelf', name: 'Floating shelves', category: 'Wall & Shelf', price: 800, size: [3.2, 0.9], wall: true, desc: 'Two oak wall shelves with warm lights underneath.', build: K_(wallShelf) },
    { id: 'poster-logo', name: '10000WPM poster', category: 'Wall & Shelf', price: 400, size: [2.4, 0.15], wall: true, desc: 'A framed poster of the laurel mark.', build: K_(K => poster(K, 'logo')) },
    { id: 'poster-mountain', name: 'Mountain poster', category: 'Wall & Shelf', price: 400, size: [2.4, 0.15], wall: true, desc: 'A framed print of mountains at night.', build: K_(K => poster(K, 'mountain')) },
    // Floor & Rugs
    { id: 'rug-laurel', name: '10000WPM rug', category: 'Floor & Rugs', price: 1100, size: [8, 6], rug: true, desc: 'A 2 by 1.5 m charcoal rug with the laurel mark.', build: K_(rugLaurel) },
    { id: 'rug-round', name: 'Round rug', category: 'Floor & Rugs', price: 700, size: [6.8, 6.8], rug: true, desc: 'A 1.7 m round rug in sage green.', build: K_(rugRound) },
    { id: 'rug-shag', name: 'Shag rug', category: 'Floor & Rugs', price: 600, size: [7, 4.6], rug: true, desc: 'A cream shag rug with tasselled ends.', build: K_(rugShag) },
  ];
  catalog.forEach(it => { it.wall = !!it.wall; });
  const byId = new Map(catalog.map(it => [it.id, it]));

  // ---------------------------------------------------------------- loading
  let libs = null;
  function load() {
    if (!libs) libs = (async () => {
      const THREE = await import('three');
      const { RoundedBoxGeometry: RB } = await import('three/addons/geometries/RoundedBoxGeometry.js');
      LIBS = { THREE, RB, K: RoomKit(THREE, RB) };
      return LIBS;
    })();
    return libs;
  }

  // Build an item. Call after load() has resolved.
  const dims = new Map();
  let LIBS = null;
  function create(id, L = LIBS) {
    const it = byId.get(id);
    if (!it || !L) return null;
    const obj = it.build(L.THREE, L.RB);
    L.K.shade(obj);
    obj.name = id;
    if (!dims.has(id)) {
      const b = new L.THREE.Box3().setFromObject(obj);
      dims.set(id, { h: b.max.y - Math.min(0, b.min.y), box: b });
    }
    return obj;
  }

  // ---------------------------------------------------------------- thumbnails
  const thumbs = new Map();
  let T = null;
  let chain = Promise.resolve();

  async function thumbRig(L) {
    if (T) return T;
    const { THREE } = L;
    const [{ RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    const size = 320;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const bg = document.createElement('canvas'); bg.width = bg.height = 256;
    const c = bg.getContext('2d');
    const gr = c.createRadialGradient(128, 110, 10, 128, 128, 190);
    gr.addColorStop(0, '#13261b'); gr.addColorStop(1, '#040806');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    scene.background = new THREE.CanvasTexture(bg);
    scene.background.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight('#fff1e0', 1.8);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.01;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight('#39ff88', 1.2); scene.add(rim);
    const fill = new THREE.HemisphereLight('#cfe8dc', '#0b120e', 0.5); scene.add(fill);
    const fade = document.createElement('canvas'); fade.width = fade.height = 128;
    const fc = fade.getContext('2d');
    const fg = fc.createRadialGradient(64, 64, 0, 64, 64, 64);
    fg.addColorStop(0, '#fff'); fg.addColorStop(0.45, '#fff'); fg.addColorStop(1, '#000');
    fc.fillStyle = fg; fc.fillRect(0, 0, 128, 128);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#0d1712', roughness: 0.85, alphaMap: new THREE.CanvasTexture(fade), transparent: true, depthWrite: false }));
    ground.receiveShadow = true; scene.add(ground);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(1); composer.setSize(size, size);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size, size), 0.55, 0.35, 1.6));
    composer.addPass(new OutputPass());
    T = { renderer, scene, camera, composer, key, rim, ground, size };
    return T;
  }

  async function renderThumb(id) {
    const L = await load();
    const { THREE } = L;
    const R = await thumbRig(L);
    const it = byId.get(id);
    const obj = create(id, L);
    R.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = it.thumb ? new THREE.Box3(new THREE.Vector3(...it.thumb.box.slice(0, 3)), new THREE.Vector3(...it.thumb.box.slice(3))) : new THREE.Box3().setFromObject(obj);
    const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const dir = it.thumb ? new THREE.Vector3(...it.thumb.dir) : it.wall ? new THREE.Vector3(0.45, 0.2, 1) : it.rug ? new THREE.Vector3(0.5, 1.15, 1) : new THREE.Vector3(0.85, 0.55, 1.15);
    dir.normalize();
    const cam = R.camera;
    let dist = sz.length() / 2 / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    for (let k = 0; k < 3; k++) {
      cam.position.copy(ctr).addScaledVector(dir, dist);
      cam.lookAt(ctr); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let ext = 0;
      for (const p of corners) { const q = p.clone().project(cam); ext = Math.max(ext, Math.abs(q.x), Math.abs(q.y)); }
      dist *= ext / 0.84;
    }
    cam.position.copy(ctr).addScaledVector(dir, dist);
    cam.lookAt(ctr);
    cam.near = dist / 50; cam.far = dist * 10; cam.updateProjectionMatrix();
    const span = Math.max(sz.x, sz.y, sz.z) * 3;
    if (it.wall) { R.ground.rotation.set(0, 0, 0); R.ground.position.set(ctr.x, ctr.y, box.min.z - 0.001); }
    else { R.ground.rotation.set(-Math.PI / 2, 0, 0); R.ground.position.set(ctr.x, box.min.y + 0.0005, ctr.z); }
    R.ground.scale.set(span, span, 1);
    R.key.position.copy(ctr).add(new THREE.Vector3(-0.6, 1.4, 1).multiplyScalar(span));
    R.key.target.position.copy(ctr);
    const sc = R.key.shadow.camera;
    sc.left = sc.bottom = -span / 2; sc.right = sc.top = span / 2; sc.near = 0.01; sc.far = span * 4; sc.updateProjectionMatrix();
    R.rim.position.copy(ctr).add(new THREE.Vector3(1, 0.6, -1).multiplyScalar(span));
    if (obj.userData.tick) obj.userData.tick(2, 0);
    R.composer.render();
    const url = R.renderer.domElement.toDataURL('image/png');
    R.scene.remove(obj);
    return url;
  }

  function thumbnail(id) {
    if (!byId.has(id)) return Promise.reject(new Error('Unknown item ' + id));
    if (thumbs.has(id)) return thumbs.get(id);
    const p = chain.then(() => renderThumb(id));
    chain = p.catch(() => {});
    thumbs.set(id, p);
    p.catch(() => thumbs.delete(id));
    return p;
  }

  window.RoomItems = {
    CELL, categories: CATEGORIES, catalog,
    get: id => byId.get(id) || null,
    load, create, thumbnail,
    dims: id => dims.get(id) || null,
  };
})();
