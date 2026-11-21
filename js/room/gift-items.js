// Room items that only come as gifts from the daily loop (js/app/progress.js). They never
// show in the shop. Built with the same kit as items.js: metres, facing +z, base at y = 0.
(() => {
  if (!window.RoomItems || !RoomItems.add) return;
  const K_ = RoomItems.K_;

  // a beige-black CRT with green code on the screen
  function crt(K) {
    const g = K.group();
    const shell = K.plastic('#23261f', 0.55);
    const body = K.rbox(0.38, 0.31, 0.3, 0.03, shell, 4); body.position.set(0, 0.215, 0.0); g.add(body);
    const back = K.rbox(0.28, 0.22, 0.14, 0.04, shell, 4); back.position.set(0, 0.21, -0.19); g.add(back);
    const base = K.rbox(0.24, 0.05, 0.22, 0.01, shell); base.position.set(0, 0.025, -0.02); g.add(base);
    const bezel = K.rbox(0.31, 0.24, 0.01, 0.012, K.std('#0b0d0a', 0.7)); bezel.position.set(0, 0.225, 0.151); g.add(bezel);
    const tex = K.canvasTex('gift-crt', 512, 384, (c, w, h) => {
      c.fillStyle = '#020a05'; c.fillRect(0, 0, w, h);
      c.font = `26px ${K.MONO}`; c.fillStyle = '#39ff88'; c.shadowColor = '#39ff88'; c.shadowBlur = 10;
      const lines = ['> login art', '> wpm --best', '  204', '> streak', '  day 7', '> _'];
      lines.forEach((l, i) => c.fillText(l, 30, 52 + i * 52));
      c.shadowBlur = 0; c.fillStyle = 'rgba(0,0,0,.35)';
      for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 2);
    });
    const glass = K.memo('gift-crt-screen', () => new K.THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.3, roughness: 0.2 }));
    const screen = K.box(0.27, 0.2, 0.004, glass); screen.position.set(0, 0.225, 0.157); g.add(screen);
    const led = K.sph(0.006, K.glow('#39ff88', 3), 10, 8); led.position.set(0.15, 0.085, 0.152); g.add(led);
    const light = new K.THREE.PointLight('#39ff88', 0.5, 1.2, 2); light.position.set(0, 0.22, 0.3); g.add(light);
    return g;
  }

  // a gold keycap on a black plinth with a green line on the front
  function trophy(K) {
    const g = K.group();
    const plinth = K.rbox(0.14, 0.07, 0.14, 0.006, K.std('#0d0f0e', 0.35, 0.4)); plinth.position.y = 0.035; g.add(plinth);
    const line = K.box(0.1, 0.006, 0.002, K.glow('#39ff88', 2.2)); line.position.set(0, 0.035, 0.071); g.add(line);
    const gold = K.std('#e7b52a', 0.22, 1);
    const skirt = K.rbox(0.1, 0.04, 0.1, 0.01, gold, 4); skirt.position.y = 0.09; g.add(skirt);
    const top = K.rbox(0.075, 0.03, 0.07, 0.012, gold, 4); top.position.set(0, 0.12, -0.004); top.rotation.x = -0.12; g.add(top);
    const dish = K.cyl(0.026, 0.026, 0.004, K.std('#c99a1c', 0.3, 1), 32); dish.position.set(0, 0.137, -0.006); dish.rotation.x = -0.12; g.add(dish);
    return g;
  }

  // a black rack with blinking drive lights behind a glass door
  function rack(K) {
    const g = K.group();
    const W = 0.56, H = 1.2, Dp = 0.56;
    const m = K.std('#111312', 0.45, 0.6);
    const side = (x) => { const s = K.rbox(0.03, H, Dp, 0.006, m); s.position.set(x, H / 2, 0); g.add(s); };
    side(-W / 2 + 0.015); side(W / 2 - 0.015);
    const top = K.rbox(W, 0.04, Dp, 0.006, m); top.position.y = H - 0.02; g.add(top);
    const bot = K.rbox(W, 0.06, Dp, 0.006, m); bot.position.y = 0.03; g.add(bot);
    const backP = K.box(W - 0.04, H - 0.1, 0.01, m); backP.position.set(0, H / 2, -Dp / 2 + 0.01); g.add(backP);
    const units = [], leds = [];
    const face = K.std('#1b1e1c', 0.5, 0.5);
    const r = K.rng(7);
    for (let i = 0; i < 9; i++) {
      const u = K.rbox(W - 0.08, 0.09, Dp - 0.1, 0.004, face); u.position.set(0, 0.12 + i * 0.115, -0.01); g.add(u); units.push(u);
      for (let j = 0; j < 4; j++) {
        const col = r() < 0.75 ? '#39ff88' : '#3ee6ff';
        const mat = K.memo(`gift-rack-led|${i}|${j}`, () => new K.THREE.MeshStandardMaterial({ color: '#000', emissive: col, emissiveIntensity: 2.4 }));
        const l = K.box(0.012, 0.008, 0.004, mat); l.position.set(0.17 - j * 0.03, 0.12 + i * 0.115, Dp / 2 - 0.05); g.add(l);
        leds.push({ mat, speed: 0.8 + r() * 4, ph: r() * 10 });
      }
    }
    const door = K.box(W - 0.05, H - 0.12, 0.006, K.glass('#cfe8dc', 0.12)); door.position.set(0, H / 2, Dp / 2 - 0.005); g.add(door);
    const handle = K.rbox(0.015, 0.16, 0.02, 0.005, K.metal('#c9ccd2', 0.25)); handle.position.set(W / 2 - 0.06, H / 2, Dp / 2 + 0.008); g.add(handle);
    const light = new K.THREE.PointLight('#39ff88', 0.6, 1.4, 2); light.position.set(0, H * 0.6, Dp / 2 + 0.15); g.add(light);
    g.userData.tick = t => { for (const l of leds) l.mat.emissiveIntensity = Math.sin(t * l.speed + l.ph) > 0.2 ? 2.4 : 0.25; };
    return g;
  }

  // a felt pennant with the flame from the streak button
  function pennant(K) {
    const g = K.group();
    const W = 0.6, H = 0.32;
    const tex = K.canvasTex('gift-pennant', 512, 256, (c, w, h) => {
      c.fillStyle = '#0c2416'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#39ff88'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
      c.save(); c.translate(110, h / 2); c.scale(5, 5); c.translate(-12, -12);
      c.fillStyle = '#39ff88'; c.shadowColor = '#39ff88'; c.shadowBlur = 3;
      c.fill(new Path2D('M13 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z')); c.restore();
      c.fillStyle = '#d7f5e3'; c.font = `700 50px ${K.MONO}`; c.textBaseline = 'middle'; c.fillText('STREAK', 200, h / 2 - 22);
      c.fillStyle = '#7fa892'; c.font = `26px ${K.MONO}`; c.fillText('10000WPM', 202, h / 2 + 30);
    });
    const shape = new K.THREE.Shape();
    shape.moveTo(-W / 2, H); shape.lineTo(W / 2, H); shape.lineTo(W / 2, H * 0.12); shape.lineTo(0, 0); shape.lineTo(-W / 2, H * 0.12); shape.closePath();
    const geo = new K.THREE.ShapeGeometry(shape);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, pos.getY(i) / H);
    const felt = K.memo('gift-pennant-mat', () => new K.THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: K.THREE.DoubleSide }));
    const flag = new K.THREE.Mesh(geo, felt); flag.position.z = 0.012; g.add(flag);
    const rod = K.cyl(0.006, 0.006, W + 0.08, K.wood('walnut'), 12); rod.rotation.z = Math.PI / 2; rod.position.set(0, H + 0.006, 0.014); g.add(rod);
    for (const sx of [-1, 1]) { const knob = K.sph(0.012, K.wood('walnut'), 12, 8); knob.position.set(sx * (W / 2 + 0.04), H + 0.006, 0.014); g.add(knob); }
    return g;
  }

  const GIFTS = [
    { id: 'gift-crt', name: 'Green CRT terminal', category: 'PC & Tech', price: 0, gift: true, size: [1.6, 1.6], surface: true, desc: 'A boxy CRT with green code on the screen.', build: K_(crt) },
    { id: 'gift-trophy', name: 'Gold keycap trophy', category: 'Decor', price: 0, gift: true, size: [0.6, 0.6], surface: true, desc: 'A gold keycap on a black plinth.', build: K_(trophy) },
    { id: 'gift-rack', name: 'Server rack', category: 'PC & Tech', price: 0, gift: true, size: [2.4, 2.4], desc: 'A 120 cm rack with blinking drive lights behind a glass door.', build: K_(rack) },
    { id: 'gift-pennant', name: 'Streak pennant', category: 'Wall & Shelf', price: 0, gift: true, size: [2.6, 0.15], wall: true, desc: 'A green felt pennant with the streak flame.', build: K_(pennant) },
  ];
  GIFTS.forEach(it => RoomItems.add(it));
})();
