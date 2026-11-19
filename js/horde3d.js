// Typo Horde in 3D. horde.js keeps the game rules and the HUD, and this file
// draws the world: lit corridors, creatures, bosses, keycaps and glow.
window.Horde3D = (() => {
  let THREE, RB, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass;
  let renderer, scene, camera, composer, bloom, grainPass;
  let ready = false;
  const W = 960, H = 540;

  async function init(canvas) {
    try {
      THREE = await import('three');
      ({ RoundedBoxGeometry: RB } = await import('three/addons/geometries/RoundedBoxGeometry.js'));
      ({ EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js'));
      ({ RenderPass } = await import('three/addons/postprocessing/RenderPass.js'));
      ({ UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'));
      ({ OutputPass } = await import('three/addons/postprocessing/OutputPass.js'));
      ({ ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js'));
    } catch (e) { return false; }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, W / H, 0.05, 120);
    camera.position.set(0, 1.62, 0);
    camera.lookAt(0, 1.45, -10);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.45, 0.9);
    composer.addPass(bloom);
    grainPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 }, slow: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float hurt; uniform float slow; varying vec2 vUv;
        float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          float ab = 0.0006 + hurt * 0.006;
          vec4 c = vec4(texture2D(tDiffuse, uv + vec2(ab,0.)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ab,0.)).b, 1.0);
          float v = smoothstep(0.95, 0.35, distance(uv, vec2(0.5)));
          c.rgb *= mix(0.62, 1.0, v);
          c.rgb += (rnd(floor(uv * vec2(960.0, 540.0))) - 0.5) * 0.035;
          c.rgb = mix(c.rgb, c.rgb * vec3(0.8, 0.9, 1.15), slow * 0.5);
          gl_FragColor = c;
        }`,
    });
    composer.addPass(new OutputPass());
    composer.addPass(grainPass);
    resize(canvas);
    ready = true;
    return true;
  }
  function resize(canvas) {
    if (!renderer) return;
    const w = canvas.clientWidth || W, h = Math.round(w * 9 / 16);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }

  // ---------- textures drawn in canvas ----------
  function ctex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }
  function noise(g, w, h, a, n = 4000) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a * Math.random()})` : `rgba(255,255,255,${a * Math.random() * 0.6})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  }
  const T = {};   // texture cache
  function textures() {
    if (T.ready) return T;
    T.wood = ctex(512, 512, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = ['#4a372b', '#533e30', '#45332a', '#5a4434'][i % 4]; g.fillRect(0, i * 64, w, 64);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(-2, i * 64, (i % 2 ? 300 : 180), 64); g.strokeRect((i % 2 ? 300 : 180), i * 64, w, 64);
        for (let k = 0; k < 14; k++) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.moveTo(0, i * 64 + Math.random() * 64); g.bezierCurveTo(170, i * 64 + Math.random() * 64, 340, i * 64 + Math.random() * 64, w, i * 64 + Math.random() * 64); g.stroke(); }
      }
      noise(g, w, h, 0.15);
    }, [2, 3]);
    T.plaster = ctex(512, 512, (g, w, h) => { g.fillStyle = '#463d4b'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.12, 9000); }, [3, 2]);
    T.asphalt = ctex(512, 512, (g, w, h) => {
      g.fillStyle = '#1e1f23'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.35, 16000);
      g.fillStyle = 'rgba(10,12,18,.6)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 40 + Math.random() * 60, 20 + Math.random() * 30, 0, 0, 7); g.fill(); }
    }, [3, 3]);
    T.tiles = ctex(512, 512, (g, w, h) => {
      g.fillStyle = '#2e3532'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
        const v = 200 + Math.random() * 25; g.fillStyle = `rgb(${v - 30},${v},${v - 20})`;
        g.fillRect(x * 64 + 2 + (y % 2) * 32, y * 32 + 2, 60, 28);
      }
      noise(g, w, h, 0.2);
    }, [2, 2]);
    T.concrete = ctex(512, 512, (g, w, h) => {
      g.fillStyle = '#5b5852'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.25, 20000);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    }, [2, 3]);
    T.metal = ctex(256, 256, (g, w, h) => {
      g.fillStyle = '#4c4640'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, 0, 6, h); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 8, 0, 4, h); }
      noise(g, w, h, 0.2);
    }, [3, 1]);
    T.serverFloor = ctex(256, 256, (g, w, h) => {
      g.fillStyle = '#1a2230'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2b3850'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
      noise(g, w, h, 0.15);
    }, [4, 6]);
    T.rack = ctex(256, 512, (g, w, h) => {
      g.fillStyle = '#0d1219'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 20; r++) {
        g.fillStyle = '#1b2533'; g.fillRect(10, 10 + r * 25, w - 20, 20);
        for (let c = 0; c < 8; c++) if (Math.random() > 0.4) { g.fillStyle = c % 3 ? '#5fb0ff' : '#5fff9a'; g.fillRect(20 + c * 12, 17 + r * 25, 6, 4); }
        g.fillStyle = '#2b3850'; g.fillRect(w - 70, 14 + r * 25, 50, 12);
      }
    });
    T.window = ctex(256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b1224'); gr.addColorStop(1, '#1d2440'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) { const bw = 14 + Math.random() * 30, bh = 60 + Math.random() * 150, bx = Math.random() * w; g.fillStyle = '#0a0d17'; g.fillRect(bx, h - bh, bw, bh); for (let k = 0; k < 20; k++) if (Math.random() > 0.5) { g.fillStyle = '#ffd36b'; g.fillRect(bx + 3 + (k % 3) * 4, h - bh + 6 + Math.floor(k / 3) * 9, 2, 3); } }
      g.strokeStyle = '#2a2531'; g.lineWidth = 10; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    });
    T.stall = ctex(512, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffcf8a'); gr.addColorStop(1, '#a8582a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(60,25,10,.55)'; g.fillRect(0, 54, w, 6); g.fillRect(0, 108, w, 6);
      for (let i = 0; i < 26; i++) {
        const x = 8 + i * 19.5, row = i % 2;
        g.fillStyle = ['#7a2a1a', '#2f5a3a', '#c48a2a', '#3c3a6a', '#e7e0d0'][i % 5];
        if (i % 3 === 0) { g.beginPath(); g.ellipse(x + 8, 50 + row * 54, 9, 6, 0, 0, 7); g.fill(); }
        else { g.fillRect(x, 24 + row * 54 + (i % 4) * 3, 10, 30 - (i % 4) * 3); }
      }
      noise(g, w, h, 0.15, 2000);
    });
    T.ready = true;
    return T;
  }
  function textTex(text, opts = {}) {
    const { w = 512, h = 128, bg = null, color = '#ffd36b', font = '900 80px Archivo, sans-serif', glow = true } = opts;
    return ctex(w, h, (g) => {
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (glow) { g.shadowColor = color; g.shadowBlur = 18; }
      g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
    });
  }
  function posterTex(i) {
    return ctex(256, 360, (g, w, h) => {
      const cols = [['#f2c230', '#1b1c1e'], ['#9fb7d9', '#13161c'], ['#e5604f', '#1b1416']][i % 3];
      g.fillStyle = cols[0]; g.fillRect(0, 0, w, h);
      g.fillStyle = cols[1]; g.font = '900 64px Archivo, sans-serif'; g.textAlign = 'center';
      g.fillText(['204', 'WPM', 'TYPE'][i % 3], w / 2, 120);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { g.fillStyle = cols[1]; g.fillRect(30 + c * 34, 190 + r * 34, 28, 28); }
      noise(g, w, h, 0.15, 3000);
    });
  }
  function skinTex(word, base) {
    return ctex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.25, 6000);
      for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(30,20,25,${0.15 + Math.random() * 0.2})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 6 + Math.random() * 14, Math.random() * 3, 0, 7); g.fill(); }
      g.font = '800 34px "JetBrains Mono", monospace'; g.textAlign = 'center';
      const letters = (word + word).split('');
      letters.forEach((ch, i) => {
        g.save(); g.translate(20 + (i * 47) % w, 30 + Math.floor(i * 47 / w) * 44 + (i % 2) * 10); g.rotate((Math.random() - 0.5) * 0.6);
        g.fillStyle = 'rgba(230,220,190,.55)'; g.fillText(ch, 0, 0); g.strokeStyle = 'rgba(10,8,8,.6)'; g.lineWidth = 2; g.strokeText(ch, 0, 0); g.restore();
      });
    });
  }
  function keycapTex(label, bg, fg) {
    return ctex(128, 128, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = '800 64px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, w / 2, h / 2 + 4);
    });
  }

  // ---------- materials ----------
  const M = {};
  function std(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts }); }
  function emissive(color, intensity = 2) { return new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: intensity }); }

  // ---------- environments ----------
  const CL = 6, NCH = 9;          // chunk length in metres and number of chunks
  let env = null;                 // { name, group, chunks, update(t, dt) }

  function setScene(name) {
    if (!ready || (env && env.name === name)) return;
    if (env) { scene.remove(env.group); env.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const tx = textures();
    const group = new THREE.Group(); scene.add(group);
    const cfg = SCENES[name];
    scene.background = new THREE.Color(cfg.bg);
    scene.fog = new THREE.FogExp2(cfg.bg, cfg.fog);
    // base light
    const hemi = new THREE.HemisphereLight(cfg.sky, cfg.ground, cfg.ambient); group.add(hemi);
    // the player's own light, so typos in front cast shadows on the floor
    const flash = new THREE.SpotLight(cfg.flash, cfg.flashI * 0.6, 40, 0.6, 0.9, 1.4);
    flash.position.set(0.4, 2.4, 0.6); flash.target.position.set(0, 1.0, -14);
    flash.castShadow = true; flash.shadow.mapSize.set(1024, 1024); flash.shadow.bias = -0.0005; flash.shadow.camera.far = 40;
    group.add(flash, flash.target);
    const muzzle = new THREE.PointLight('#ffd36b', 0, 8, 2); muzzle.position.set(0, 1.0, -0.6); group.add(muzzle);
    const rim = new THREE.DirectionalLight(cfg.rim || '#9fb7d9', 1.6); rim.position.set(0, 4, -30); rim.target.position.set(0, 0, 0); group.add(rim, rim.target);
    const chunks = [];
    for (let i = 0; i < NCH; i++) {
      const c = new THREE.Group();
      cfg.build(c, i, tx);
      group.add(c); chunks.push(c);
    }
    const extras = cfg.extras ? cfg.extras(group, tx) : null;
    env = { name, group, chunks, cfg, muzzle, flash, extras };
  }

  function wallsAndFloor(c, tx, o) {
    const hw = o.hw || 4, hh = o.hh || 3.4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, CL), o.floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -CL / 2); floor.receiveShadow = true; c.add(floor);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(CL, hh), o.wallMat);
      wall.rotation.y = -s * Math.PI / 2; wall.position.set(s * hw, hh / 2, -CL / 2); wall.receiveShadow = true; c.add(wall);
    }
    if (o.ceilMat) {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, CL), o.ceilMat);
      ceil.rotation.x = Math.PI / 2; ceil.position.set(0, hh, -CL / 2); c.add(ceil);
    }
  }
  function box(w, h, d, mat, x, y, z, r = 0) {
    const m = new THREE.Mesh(r ? new RB(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function plane(w, h, mat, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; return m;
  }

  const SIGNS = ['NODLES', 'FRIDE RICE', 'MASAGE', 'PHONE REPIAR', 'COFEE', 'KARAOKEE', 'DUMPLINS', 'OPEN 24 HOURES'];
  const SCREENS = ['NXET TRAIN', 'STAION 4', 'DELAYD', 'MIND TEH GAP'];

  const SCENES = {
    room: {
      bg: '#0d0b10', fog: 0.03, sky: '#8a7a9a', ground: '#3a2a20', ambient: 1.4, flash: '#fff1dc', flashI: 70,
      build(c, i, tx) {
        M.room ||= { floor: std('#ffffff', { map: tx.wood, roughness: 0.62 }), wall: std('#c9bfd0', { map: tx.plaster, roughness: 0.9 }), ceil: std('#17141b'), shelf: std('#3b3036', { roughness: 0.6 }), led: emissive('#f2c230', 3), frame: std('#1d1a22') };
        wallsAndFloor(c, tx, { floorMat: M.room.floor, wallMat: M.room.wall, ceilMat: M.room.ceil, hh: 3 });
        for (const s of [-1, 1]) {
          c.add(box(0.04, 0.03, CL, M.room.led, s * 3.97, 0.06, -CL / 2));
          const kind = (i + (s > 0 ? 1 : 0)) % 3;
          if (kind === 0) {
            const win = plane(1.6, 1.3, new THREE.MeshStandardMaterial({ map: tx.window, emissive: '#ffffff', emissiveMap: tx.window, emissiveIntensity: 0.9 }), s * 3.98, 1.7, -3, -s * Math.PI / 2);
            c.add(win);
          } else if (kind === 1) {
            c.add(plane(0.9, 1.25, new THREE.MeshStandardMaterial({ map: posterTex(i + s), roughness: 0.8 }), s * 3.97, 1.75, -3, -s * Math.PI / 2));
          } else {
            for (const y of [0.9, 1.5]) c.add(box(0.35, 0.05, 2.2, M.room.shelf, s * 3.8, y, -3));
            for (let k = 0; k < 3; k++) {
              const kb = box(0.28, 0.06, 0.6, std(['#d9d6cf', '#2d2e32', '#c9a24a'][k], { roughness: 0.5 }), s * 3.78, 0.96, -2.2 - k * 0.7, 0.02);
              c.add(kb);
            }
          }
        }
        const lamp = box(1.2, 0.05, 0.25, emissive('#ffe2b0', 2.5), 0, 2.97, -3); c.add(lamp);
        if (i % 2 === 0) { const pl = new THREE.PointLight('#ffd9a0', 30, 13, 2); pl.position.set(0, 2.7, -3); c.add(pl); }
      },
      extras(group) {
        // Art's desk and stream monitor at the end of the room
        const g = new THREE.Group(); g.position.set(0, 0, -30);
        g.add(box(2.4, 0.08, 1, std('#2b2530'), 0, 0.95, 0));
        const mon = box(1.6, 0.95, 0.06, std('#0b0b0e'), 0, 1.6, -0.2, 0.02); g.add(mon);
        const scr = plane(1.5, 0.85, new THREE.MeshBasicMaterial({ map: textTex('LIVE', { w: 512, h: 288, bg: '#8fb5ff', color: '#e5604f', font: '900 90px Archivo' }) }), 0, 1.6, -0.16);
        scr.material.toneMapped = false; g.add(scr);
        const glow = new THREE.PointLight('#9fc0ff', 12, 10, 2); glow.position.set(0, 1.6, 0.6); g.add(glow);
        group.add(g);
        return { fixed: g };
      },
    },
    market: {
      bg: '#0a0e1c', fog: 0.026, sky: '#3b4a86', ground: '#2a1a16', ambient: 1.2, flash: '#ffffff', flashI: 55,
      build(c, i, tx) {
        M.market ||= { floor: std('#ffffff', { map: tx.asphalt, roughness: 0.22, metalness: 0.2 }), wall: std('#3a2f36', { roughness: 0.9 }), counter: std('#2a2228'), lit: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tx.stall, emissiveIntensity: 0.75 }), pole: std('#222') };
        wallsAndFloor(c, tx, { floorMat: M.market.floor, wallMat: M.market.wall, hw: 5, hh: 6 });
        for (const s of [-1, 1]) {
          const id = i * 2 + (s > 0 ? 1 : 0);
          c.add(box(1.2, 1.0, 4.4, M.market.counter, s * 4.3, 0.5, -3));
          c.add(plane(4.2, 0.8, M.market.lit, s * 3.69, 0.6, -3, s * -Math.PI / 2 + 0 * s));
          const aw = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.6), std(['#c4473d', '#2f7a6b', '#d49a2a', '#3c5a9a'][id % 4], { side: THREE.DoubleSide, roughness: 0.8 }));
          aw.position.set(s * 4.1, 2.6, -3); aw.rotation.set(0, s * -Math.PI / 2, 0); aw.rotateX(-0.9); c.add(aw);
          // neon sign sticking out from the wall
          const signMat = new THREE.MeshBasicMaterial({ map: textTex(SIGNS[id % SIGNS.length], { color: id % 2 ? '#ff5f6d' : '#ffd36b', bg: '#0b0a0e' }), toneMapped: false });
          const sign = plane(2.2, 0.55, signMat, s * 3.6, 4.3, -1.4, 0); c.add(sign);
          c.add(box(0.05, 0.05, 0.9, M.market.pole, s * 4.4, 4.3, -1.4));
        }
        // lantern string across the street
        for (let k = 0; k < 9; k++) {
          const u = k / 8, x = -4.6 + u * 9.2, y = 4.6 - Math.sin(u * Math.PI) * 0.6;
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), emissive(k % 2 ? '#ff5f6d' : '#ffb36b', 3)); l.position.set(x, y, -0.5); c.add(l);
        }
        if (i % 2 === 0) { const pl = new THREE.PointLight('#ff9a52', 50, 16, 2); pl.position.set(0, 4, -1); c.add(pl); }
      },
    },
    subway: {
      bg: '#090c0b', fog: 0.032, sky: '#b5d0c4', ground: '#2b302d', ambient: 1.1, flash: '#e8fff4', flashI: 65,
      build(c, i, tx) {
        M.sub ||= { floor: std('#3a3f3c', { roughness: 0.6 }), wall: std('#ffffff', { map: tx.tiles, roughness: 0.35 }), ceil: std('#1a1f1d'), rail: std('#8a8f8c', { metalness: 0.9, roughness: 0.35 }), sleeper: std('#2a2420'), tube: emissive('#e8fff4', 3), pillar: std('#4a5651', { roughness: 0.5 }), screen: std('#0b0f0e') };
        wallsAndFloor(c, tx, { floorMat: M.sub.floor, wallMat: M.sub.wall, ceilMat: M.sub.ceil, hh: 3.6 });
        for (const x of [-0.75, 0.75]) c.add(box(0.08, 0.1, CL, M.sub.rail, x, 0.12, -CL / 2));
        for (let k = 0; k < 6; k++) c.add(box(2.2, 0.06, 0.25, M.sub.sleeper, 0, 0.04, -k));
        c.add(box(0.15, 0.06, 3.5, M.sub.tube, -1.2, 3.55, -3)); c.add(box(0.15, 0.06, 3.5, M.sub.tube, 1.2, 3.55, -3));
        for (const s of [-1, 1]) {
          c.add(box(0.5, 3.6, 0.5, M.sub.pillar, s * 3.5, 1.8, -0.4));
          if ((i + s) % 2) {
            c.add(box(0.06, 0.6, 1.5, M.sub.screen, s * 3.95, 2.2, -3.4));
            const sm = new THREE.MeshBasicMaterial({ map: textTex(SCREENS[(i + (s > 0 ? 1 : 0)) % 4], { color: '#ff7a4d', bg: '#060807', font: '700 64px "JetBrains Mono"' }), toneMapped: false });
            c.add(plane(1.4, 0.5, sm, s * 3.91, 2.2, -3.4, -s * Math.PI / 2));
          }
        }
        if (i % 2 === 0) { const pl = new THREE.PointLight('#e8fff4', 35, 14, 2); pl.position.set(0, 3.2, -3); c.add(pl); }
      },
      extras(group) {
        // the stopped train's headlights at the end of the tunnel
        const g = new THREE.Group(); g.position.set(0, 0, -34);
        g.add(box(3.2, 3.2, 0.5, std('#141816', { metalness: 0.6, roughness: 0.4 }), 0, 1.6, 0));
        for (const x of [-0.9, 0.9]) {
          const h = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: '#fffbe0', toneMapped: false }));
          h.position.set(x, 0.9, 0.26); g.add(h);
          const sp = new THREE.SpotLight('#fffbe0', 40, 35, 0.4, 0.5, 1.5); sp.position.set(x, 0.9, 0.3); sp.target.position.set(x * 0.5, 0, 20); g.add(sp, sp.target);
        }
        group.add(g);
        return { fixed: g };
      },
    },
    factory: {
      bg: '#120d09', fog: 0.03, sky: '#c39a75', ground: '#3a3027', ambient: 1.3, flash: '#ffe8cc', flashI: 70,
      build(c, i, tx) {
        M.fac ||= { floor: std('#ffffff', { map: tx.concrete, roughness: 0.7 }), wall: std('#d8cfc4', { map: tx.metal, roughness: 0.55, metalness: 0.2 }), ceil: std('#100c09'), belt: std('#1c1916', { roughness: 0.9 }), frame: std('#5a544a', { metalness: 0.6, roughness: 0.4 }), stripe: std('#d49a2a', { roughness: 0.6 }), lamp: emissive('#ff8a2a', 4) };
        wallsAndFloor(c, tx, { floorMat: M.fac.floor, wallMat: M.fac.wall, ceilMat: M.fac.ceil, hh: 4.5 });
        for (const s of [-1, 1]) {
          c.add(box(1.4, 0.9, CL, M.fac.frame, s * 3.3, 0.45, -CL / 2));
          c.add(box(1.2, 0.06, CL, M.fac.belt, s * 3.3, 0.93, -CL / 2));
          c.add(box(0.12, 0.01, CL, M.fac.stripe, s * 2.5, 0.005, -CL / 2));
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), M.fac.lamp); lamp.position.set(s * 3.9, 2.8, -3); c.add(lamp);
          c.userData.caps ||= [];
          for (let k = 0; k < 4; k++) {
            const col = ['#e7e6e1', '#e07a3a', '#2d2e32', '#f2c230'][(i + k) % 4];
            const cap = box(0.32, 0.22, 0.32, std(col, { roughness: 0.5 }), s * 3.3 + (Math.random() - 0.5) * 0.6, 1.07, -k * 1.5, 0.05);
            c.add(cap); c.userData.caps.push(cap);
          }
        }
        if (i % 2 === 0) { const pl = new THREE.PointLight('#ff8a2a', 45, 15, 2); pl.position.set(0, 3.6, -3); c.add(pl); c.userData.warn = pl; }
      },
    },
    server: {
      bg: '#05080d', fog: 0.032, sky: '#4a6a9a', ground: '#0f1520', ambient: 1.0, flash: '#cfe6ff', flashI: 60,
      build(c, i, tx) {
        M.srv ||= { floor: std('#ffffff', { map: tx.serverFloor, roughness: 0.3, metalness: 0.4 }), wall: std('#0b1018'), ceil: std('#06090e'), rack: new THREE.MeshStandardMaterial({ map: tx.rack, emissive: '#ffffff', emissiveMap: tx.rack, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.5 }), side: std('#121a26', { metalness: 0.6, roughness: 0.4 }), tray: std('#1b2433', { metalness: 0.7 }), blue: emissive('#5fb0ff', 2) };
        wallsAndFloor(c, tx, { floorMat: M.srv.floor, wallMat: M.srv.wall, ceilMat: M.srv.ceil, hh: 3.6 });
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
          const r = box(1.0, 2.6, 1.8, M.srv.side, s * 3.4, 1.3, -1 - k * 2);
          c.add(r);
          c.add(plane(1.7, 2.5, M.srv.rack, s * 2.89, 1.3, -1 - k * 2, s * -Math.PI / 2));
        }
        for (const s of [-1, 1]) c.add(box(0.6, 0.1, CL, M.srv.tray, s * 1.6, 3.2, -CL / 2));
        c.add(box(3.6, 0.03, 0.08, M.srv.blue, 0, 3.55, -3));
        if (i % 2 === 0) { const pl = new THREE.PointLight('#5fb0ff', 30, 14, 2); pl.position.set(0, 3.2, -3); c.add(pl); }
      },
      extras(group) {
        const alarm = new THREE.PointLight('#ff3a3a', 0, 30, 1.5); alarm.position.set(0, 3.2, -8); group.add(alarm);
        return { alarm };
      },
    },
  };

  // ---------- creatures ----------
  const SKIN = { walker: '#4f6352', runner: '#6a6447', crawler: '#455a4c', brute: '#5a4d63', flyer: '#5b6270', thrower: '#6a5040' };
  const actors = new Map();      // game object -> 3D actor

  function limb(len, rad, mat) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 6, 12), mat);
    m.position.y = -len / 2 - rad * 0.5; m.castShadow = true; g.add(m);
    return g;
  }
  function makeTypo(f) {
    const type = f.type;
    const skin = new THREE.MeshPhysicalMaterial({ map: skinTex(f.words.join(''), SKIN[type]), roughness: 0.5, metalness: 0, sheen: 0.25, sheenColor: '#7fae8c', sheenRoughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.7, emissive: '#000' });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.7 });
    const eye = new THREE.MeshBasicMaterial({ color: type === 'brute' ? '#ff5a3a' : '#ffd23a', toneMapped: false });
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const parts = {};
    const k = type === 'brute' ? 1.35 : type === 'runner' ? 0.9 : 1;
    if (type === 'flyer') {
      const torso = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), skin); torso.scale.set(1, 1.3, 0.9); torso.castShadow = true; body.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), skin); head.position.y = 0.42; body.add(head);
      for (const s of [-1, 1]) {
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.quadraticCurveTo(0.6 * s, 0.5, 1.3 * s, 0.25); shape.lineTo(1.0 * s, -0.05); shape.lineTo(0.8 * s, -0.25); shape.lineTo(0.5 * s, -0.1); shape.lineTo(0.3 * s, -0.3); shape.closePath();
        const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map: skin.map, color: '#c9c3b5', side: THREE.DoubleSide, roughness: 0.8 }));
        const piv = new THREE.Group(); piv.position.set(0.12 * s, 0.1, 0); piv.add(wing); body.add(piv);
        parts['wing' + s] = piv;
      }
      parts.head = head;
    } else {
      const crawl = type === 'crawler';
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24 * k, 0.45 * k, 8, 16), skin);
      torso.castShadow = true; torso.scale.set(1.15, 1, 0.8);
      const chest = new THREE.Group(); chest.add(torso); body.add(chest);
      chest.position.y = crawl ? 0.55 : 1.15 * (type === 'brute' ? 1.1 : 1);
      if (crawl) chest.rotation.x = -1.35;
      parts.chest = chest;
      const head = new THREE.Group();
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19 * (type === 'brute' ? 0.9 : 1), 22, 16), skin); skull.scale.set(0.92, 1.05, 1); skull.castShadow = true; head.add(skull);
      const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), skin); jaw.position.set(0, -0.12, 0.05); jaw.scale.set(1, 0.6, 1); head.add(jaw);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eye); e.position.set(s * 0.07, 0.02, 0.165); head.add(e); }
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), dark); mouth.position.set(0, -0.11, 0.16); head.add(mouth);
      head.position.set(0, crawl ? 0.62 : 0.55 * k, crawl ? 0.18 : 0.06);
      chest.add(head); parts.head = head;
      // arms
      for (const s of [-1, 1]) {
        const sh = new THREE.Group(); sh.position.set(s * 0.32 * k, 0.3 * k, 0); chest.add(sh);
        const up = limb(0.32 * k, 0.07 * k, skin); sh.add(up);
        const el = new THREE.Group(); el.position.y = -0.45 * k; up.add(el);
        const lo = limb(0.3 * k, 0.06 * k, skin); el.add(lo);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08 * k, 12, 10), skin); hand.position.y = -0.42 * k; hand.scale.set(1, 1.2, 0.7); lo.add(hand);
        parts['arm' + s] = sh; parts['elbow' + s] = el;
        if (type === 'thrower' && s > 0) {
          const cap = box(0.18, 0.13, 0.18, std('#d9d6cf', { roughness: 0.5 }), 0, -0.52, 0, 0.03); lo.add(cap); parts.cap = cap;
        }
      }
      // legs
      for (const s of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(s * 0.14 * k, crawl ? 0.45 : 0.8 * (type === 'brute' ? 1.1 : 1), crawl ? -0.45 : 0); body.add(hip);
        const th = limb(0.32 * k, 0.085 * k, skin); hip.add(th);
        const kn = new THREE.Group(); kn.position.y = -0.46 * k; th.add(kn);
        const sn = limb(0.3 * k, 0.07 * k, skin); kn.add(sn);
        const foot = box(0.12 * k, 0.07, 0.24 * k, dark, 0, -0.44 * k, 0.06); sn.add(foot);
        parts['hip' + s] = hip; parts['knee' + s] = kn;
      }
      if (type === 'brute') {
        // armour plates made of keycaps, shot off by the first word
        const armour = new THREE.Group();
        const letters = f.words[0].toUpperCase();
        for (let n = 0; n < 6; n++) {
          const cap = box(0.2, 0.2, 0.09, new THREE.MeshStandardMaterial({ map: keycapTex(letters[n % letters.length], '#d9d6cf', '#2d2e32'), roughness: 0.45 }), -0.22 + (n % 3) * 0.22, 0.12 - Math.floor(n / 3) * 0.24, 0.28, 0.025);
          armour.add(cap);
        }
        chest.add(armour); parts.armour = armour;
      }
    }
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(root);
    return { root, body, parts, skin, type, seed: Math.random() * 10 };
  }

  function worldPos(o, out) {
    const z = -(1.3 + Math.max(0, o.z) * 26);
    out.set(o.x * 3.4, 0, z);
    if (o.type === 'flyer') out.y = 1.6 + Math.sin((o.phase || 0) * 0.7) * 0.3;
    return out;
  }

  function animateTypo(a, f, dt) {
    const p = a.parts, ph = f.phase || 0;
    const v = new THREE.Vector3(); worldPos(f, v);
    a.root.position.copy(v);
    a.root.rotation.y = Math.atan2(-v.x, -v.z - 0.5) * -0.6;
    if (a.type === 'flyer') {
      p['wing-1'].rotation.z = Math.sin(ph * 3) * 0.7; p['wing1'].rotation.z = -Math.sin(ph * 3) * 0.7;
      a.body.rotation.x = 0.3;
    } else {
      const sw = Math.sin(ph), run = a.type === 'runner' ? 1.5 : 1;
      p['hip-1'].rotation.x = sw * 0.55 * run; p['hip1'].rotation.x = -sw * 0.55 * run;
      p['knee-1'].rotation.x = Math.max(0, -Math.cos(ph)) * 0.9; p['knee1'].rotation.x = Math.max(0, Math.cos(ph)) * 0.9;
      if (a.type === 'crawler') {
        p['arm-1'].rotation.x = -1.2 - sw * 0.5; p['arm1'].rotation.x = -1.2 + sw * 0.5;
      } else if (a.type === 'thrower' && f.windup !== undefined && f.def && f.z <= (f.def.stopAt || 0) + 0.01) {
        p['arm1'].rotation.x = -2.6 + (1 - (f.windup || 0)) * 0.4; p['arm-1'].rotation.x = 0.2;
        if (p.cap) p.cap.visible = (f.windup || 0) > 0.1;
      } else {
        // zombie reach toward the player
        p['arm-1'].rotation.x = -1.3 + Math.sin(ph * 0.5) * 0.15; p['arm1'].rotation.x = -1.25 - Math.sin(ph * 0.5) * 0.15;
        p['elbow-1'].rotation.x = -0.3; p['elbow1'].rotation.x = -0.25;
      }
      p.chest.rotation.z = Math.sin(ph) * 0.06;
      if (a.type !== 'crawler') p.chest.rotation.x = a.type === 'runner' ? 0.35 : 0.15;
      p.head.rotation.z = Math.sin(ph * 0.7 + a.seed) * 0.2;
      a.body.position.y = Math.abs(Math.cos(ph)) * 0.05;
      if (p.armour) p.armour.visible = f.wi === 0;
    }
    // hit flash and glitch
    const flash = f.flash > 0;
    a.skin.emissive.set(flash ? '#ffffff' : '#000000');
    a.skin.emissiveIntensity = flash ? 0.6 : 0;
    a.root.position.x += Math.random() < 0.02 ? (Math.random() - 0.5) * 0.15 : 0;
    if (f.dying) {
      const k = 1 - Math.max(0, f.dying) / 0.4;
      a.root.rotation.x = -k * 1.2; a.root.scale.setScalar(1 - k * 0.6);
      a.skin.emissive.set('#f2c230'); a.skin.emissiveIntensity = k * 1.5;
    } else a.root.scale.setScalar(1);
  }

  // ---------- keycaps (pickups and thrown caps) ----------
  const PICK_COL = { health: '#5fbf77', debounce: '#9fb7d9', macro: '#f2c230', shield: '#e7e6e1', double: '#e07a3a' };
  const PICK_LBL = { health: '+', debounce: 'SLOW', macro: 'ALL', shield: 'S', double: 'x2' };
  function makeCap(label, col, size, glow) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: keycapTex(label, col, '#1b1c1e'), roughness: 0.4, emissive: glow ? col : '#000', emissiveIntensity: glow ? 0.25 : 0 });
    const side = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 });
    const m = new THREE.Mesh(new RB(size, size * 0.7, size, 3, size * 0.12), [side, side, mat, side, side, side]);
    m.castShadow = true; g.add(m);
    if (glow) { const l = new THREE.PointLight(col, 4, 4, 2); g.add(l); }
    scene.add(g);
    return { root: g, cap: m };
  }

  // ---------- bosses ----------
  let bossActor = null;
  function makeBoss(b) {
    const g = new THREE.Group(); g.position.set(0, 0, -11);
    const parts = {};
    if (b.art === 'spam') {
      parts.segs = [];
      for (let i = 0; i < 11; i++) {
        const tex = ctex(256, 128, (c, w, h) => { c.fillStyle = i % 2 ? '#8a7fd1' : '#6b9fe0'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.8)'; for (let k = 0; k < 3; k++) c.fillRect(24, 24 + k * 30, 80 + Math.random() * 120, 12); });
        const m = new THREE.Mesh(new RB(1.9 - i * 0.07, 0.75, 0.6, 3, 0.25), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.4 }));
        m.castShadow = true; g.add(m); parts.segs.push(m);
      }
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffd23a', toneMapped: false })); g.add(e); parts['eye' + s] = e; }
    } else if (b.art === 'sign') {
      const board = box(5, 2.4, 0.4, std('#1d1a22'), 0, 4.2, 0); g.add(board);
      const face = plane(4.6, 2.0, new THREE.MeshBasicMaterial({ map: textTex('NODLES', { w: 1024, h: 440, color: '#ffd36b', bg: '#120f16', font: '900 230px Archivo' }), toneMapped: false }), 0, 4.2, 0.21); g.add(face);
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.8, 2.2, 0.01)), new THREE.LineBasicMaterial({ color: '#ff5f6d' })); frame.position.set(0, 4.2, 0.23); g.add(frame);
      parts.face = face; parts.legs = [];
      for (const s of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(s * 1.4, 3, 0); const l = limb(2.4, 0.16, std('#3a3439', { metalness: 0.6, roughness: 0.4 })); leg.add(l); g.add(leg); parts.legs.push(leg); }
      const sl = new THREE.PointLight('#ff9a52', 20, 14, 2); sl.position.set(0, 4, 1.5); g.add(sl);
    } else if (b.art === 'announcer') {
      const bodyM = std('#2f3a36', { metalness: 0.5, roughness: 0.45 });
      g.add(box(4, 2.6, 1.2, bodyM, 0, 4, 0, 0.2));
      parts.cones = [];
      for (const s of [-1, 1]) {
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.35, 0.5, 32, 1, true), std('#121615', { side: THREE.DoubleSide }));
        cone.rotation.x = Math.PI / 2; cone.position.set(s * 1, 4.1, 0.75); g.add(cone);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 12), std('#5b6863', { metalness: 0.6, roughness: 0.3 })); dome.position.set(s * 1, 4.1, 0.65); g.add(dome);
        parts.cones.push(cone, dome);
      }
      const strip = plane(3.4, 0.4, new THREE.MeshBasicMaterial({ map: textTex('NXET STOP: NOWERE', { w: 1024, h: 120, color: '#ff5f4d', bg: '#0a0b0b', font: '700 70px "JetBrains Mono"' }), toneMapped: false }), 0, 5, 0.62); g.add(strip);
      for (const x of [-1.6, -0.5, 0.5, 1.6]) g.add(box(0.05, 4, 0.05, std('#111'), x, 7.3, 0));
      g.add(box(1.4, 1.8, 0.9, bodyM, 0, 1.7, 0, 0.1));
      const sl = new THREE.PointLight('#ff5f4d', 14, 12, 2); sl.position.set(0, 5, 2); g.add(sl);
    } else if (b.art === 'press') {
      const steel = std('#5c544a', { metalness: 0.7, roughness: 0.35 });
      for (const s of [-1, 1]) g.add(box(0.6, 7, 0.8, steel, s * 3, 3.5, 0));
      g.add(box(7, 0.8, 1, steel, 0, 7.2, 0));
      const head = new THREE.Group();
      head.add(box(5, 1.4, 1.2, std('#3a3029', { metalness: 0.6, roughness: 0.4 }), 0, 0, 0));
      for (let i = 0; i < 10; i++) head.add(box(0.25, 1.42, 1.22, std('#d49a2a'), -2.3 + i * 0.5, 0, 0));
      for (let i = 0; i < 9; i++) head.add(box(0.42, 0.42, 0.42, new THREE.MeshStandardMaterial({ map: keycapTex('ERRORTYPO'[i], ['#e7e6e1', '#e07a3a', '#2d2e32'][i % 3], i % 3 === 2 ? '#e7e6e1' : '#1b1c1e'), roughness: 0.45 }), -2 + i * 0.5, -0.95, 0.2, 0.05));
      head.position.y = 4.5; g.add(head); parts.head = head;
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), emissive('#ff8a2a', 5)); l.position.set(s * 3, 7.8, 0.5); g.add(l); }
      const sl = new THREE.PointLight('#ff8a2a', 18, 14, 2); sl.position.set(0, 6, 2); g.add(sl);
    } else if (b.art === 'correction') {
      parts.screens = [];
      for (let i = 0; i < 12; i++) {
        const cx = -2.7 + (i % 4) * 1.8, cy = 6.4 - Math.floor(i / 4) * 1.3;
        g.add(box(1.7, 1.2, 0.2, std('#0e141d', { metalness: 0.5 }), cx, cy, 0));
        const tex = ctex(256, 180, (c, w, h) => { c.fillStyle = '#0a1a2e'; c.fillRect(0, 0, w, h); c.font = '600 16px "JetBrains Mono"'; for (let r = 0; r < 9; r++) { c.fillStyle = r % 3 ? '#5fb0ff' : '#5fff9a'; c.fillText(['canal -> coral', 'fix(word)', 'send()', 'autocorrect', 'retype'][(i + r) % 5], 12, 22 + r * 18); } });
        const scr = plane(1.55, 1.05, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), cx, cy, 0.11);
        g.add(scr); parts.screens.push(scr);
      }
      const eye = box(0.18, 0.9, 0.05, new THREE.MeshBasicMaterial({ color: '#ff3a3a', toneMapped: false }), 0, 5.1, 0.25); g.add(eye); parts.eye = eye;
      parts.arms = [];
      for (const s of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 3.4, 5, 0), new THREE.Vector3(s * 4.6, 3.5, 1), new THREE.Vector3(s * 4, 1.5, 2), new THREE.Vector3(s * 3, 0.3, 3)]);
        const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.18, 10), std('#24303f', { metalness: 0.6, roughness: 0.4 }));
        g.add(arm); parts.arms.push(arm);
      }
      const sl = new THREE.PointLight('#5fb0ff', 20, 14, 2); sl.position.set(0, 5, 3); g.add(sl);
      const red = new THREE.PointLight('#ff3a3a', 6, 8, 2); red.position.set(0, 5, 1); g.add(red); parts.red = red;
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(g);
    return { root: g, parts, art: b.art };
  }
  function animateBoss(a, b, t) {
    const g = a.root, P = a.parts;
    const s = (b.scale || 1) * ({ press: 0.52, announcer: 0.62, correction: 0.5, spam: 1, sign: 1.1 }[a.art] || 1);
    g.scale.setScalar(s);
    g.position.x = Math.sin(t * 0.6) * 0.8;
    const shake = b.charge > 0.75 ? (Math.random() - 0.5) * 0.15 : 0;
    g.position.y = shake;
    if (a.art === 'spam') {
      // a worm of chat bubbles coiling along the floor with its head raised
      P.segs.forEach((m, i) => {
        const u = i / 10, ang = t * 2.2 + i * 0.6;
        m.position.set(Math.sin(ang) * 1.1 * (1 - u * 0.6), 0.42 + Math.pow(u, 2.2) * 1.9 + Math.sin(ang * 0.5) * 0.05, -(10 - i) * 0.62);
        m.rotation.set(-u * 0.5, Math.cos(ang) * 0.35, Math.sin(ang) * 0.15);
      });
      const top = P.segs[10].position;
      P['eye-1'].position.set(top.x - 0.32, top.y + 0.12, top.z + 0.32); P['eye1'].position.set(top.x + 0.32, top.y + 0.12, top.z + 0.32);
    } else if (a.art === 'sign') {
      P.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 3 + i * Math.PI) * 0.35; });
      P.face.material.color.setScalar(Math.random() < 0.06 ? 0.4 : 1);
    } else if (a.art === 'announcer') {
      const pulse = 1 + Math.sin(t * 14) * 0.06;
      P.cones.forEach(c => c.scale.setScalar(pulse));
    } else if (a.art === 'press') {
      P.head.position.y = 4.5 - Math.max(0, Math.sin(t * 2.2)) * 1.4 * (0.4 + (b.charge || 0));
    } else if (a.art === 'correction') {
      P.eye.visible = Math.floor(t * 2) % 2 === 0;
      P.red.intensity = 4 + (b.charge || 0) * 20;
      P.arms.forEach((arm, i) => { arm.rotation.z = Math.sin(t * 1.3 + i) * 0.08; });
    }
    const flash = b.flash > 0;
    g.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !o.material.userData.keep) { if (flash) { o.material.userData.e ??= o.material.emissive.getHex(); o.material.emissive.set('#ffffff'); } else if (o.material.userData.e !== undefined) { o.material.emissive.setHex(o.material.userData.e); delete o.material.userData.e; } } });
    if (b.dying) { g.scale.setScalar(s * Math.max(0.01, b.dying / 1.5)); g.rotation.z = (1 - b.dying / 1.5) * 0.5; }
  }

  // ---------- per frame ----------
  let tmp = null;
  function frame(st) {
    if (!ready) return;
    tmp ||= new THREE.Vector3();
    setScene(st.scene);
    const { t, dt } = st;
    // chunks slide toward the camera while the player moves
    const offset = st.travel * 18;
    env.chunks.forEach((c, i) => {
      const z = ((i * CL - offset) % (NCH * CL) + NCH * CL) % (NCH * CL);
      c.position.z = -z + CL;
      if (c.userData.caps) c.userData.caps.forEach((cap, k) => { cap.position.z = -((t * 0.8 + k * 1.5) % CL); });
      if (c.userData.warn) c.userData.warn.intensity = 40 + Math.sin(t * 6 + i) * 22;
    });
    if (env.extras && env.extras.alarm) env.extras.alarm.intensity = st.alarm ? 20 + Math.sin(t * 8) * 18 : 4 + Math.sin(t * 3) * 3;
    // camera: walk bob, shake, look slightly toward the target
    const moving = st.moving ? 1 : 0;
    camera.position.set(Math.sin(t * 3.2) * 0.04 * moving + (Math.random() - 0.5) * st.shake * 0.4, 1.62 + Math.abs(Math.sin(t * 6.4)) * 0.05 * moving + (Math.random() - 0.5) * st.shake * 0.4, 0);
    const look = new THREE.Vector3(0, 1.4, -10);
    if (st.lookAt) { worldPos(st.lookAt, tmp); look.x = tmp.x * 0.15; }
    camera.lookAt(look);
    env.muzzle.intensity = Math.max(0, env.muzzle.intensity - dt * 120);
    env.flash.intensity = env.cfg.flashI * (1 + Math.sin(t * 40) * 0.01);

    // actors
    const live = new Set();
    for (const f of st.foes) {
      live.add(f);
      let a = actors.get(f);
      if (!a) { a = makeTypo(f); actors.set(f, a); }
      animateTypo(a, f, dt);
    }
    for (const p of st.pickups) {
      live.add(p);
      let a = actors.get(p);
      if (!a) { a = makeCap(PICK_LBL[p.kind], PICK_COL[p.kind], 0.55, true); actors.set(p, a); }
      worldPos(p, tmp); a.root.position.set(tmp.x, 1.5 + Math.sin(t * 3 + p.seed) * 0.15, tmp.z);
      a.root.rotation.y = t * 1.5; a.root.rotation.x = Math.sin(t + p.seed) * 0.3;
    }
    for (const p of st.projs) {
      live.add(p);
      let a = actors.get(p);
      if (!a) { a = makeCap(p.word[0].toUpperCase(), '#d9d6cf', 0.34, false); actors.set(p, a); }
      worldPos(p, tmp); a.root.position.set(tmp.x, 1.3 + p.z * 1.5, tmp.z);
      a.root.rotation.set(t * 7 + p.seed, t * 5, 0);
    }
    for (const [obj, a] of actors) {
      if (!live.has(obj)) {
        scene.remove(a.root);
        a.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
        actors.delete(obj);
      }
    }
    // boss
    if (st.boss) {
      if (!bossActor || bossActor.src !== st.boss) {
        if (bossActor) scene.remove(bossActor.root);
        bossActor = makeBoss(st.boss); bossActor.src = st.boss;
      }
      animateBoss(bossActor, st.boss, t);
    } else if (bossActor) { scene.remove(bossActor.root); bossActor = null; }

    grainPass.uniforms.time.value = t;
    grainPass.uniforms.hurt.value = st.hurt;
    grainPass.uniforms.slow.value = st.slow ? 1 : 0;
    composer.render(dt);
  }

  function shot() { if (env) env.muzzle.intensity = 6; }

  // Screen position of a game object on the 960 x 540 HUD canvas.
  // Returns the foot point, the height in pixels and a size factor.
  const top = { x: 0, y: 0 };
  function project(o, kind) {
    tmp ||= new THREE.Vector3();
    worldPos(o, tmp);
    let footY = tmp.y, height = o.def ? 1.9 * (o.def.h || 1) : 0.5;
    if (o.type === 'crawler') height = 0.9;
    if (o.type === 'flyer') { footY = tmp.y - 0.35; height = 0.8; }
    if (kind === 'pickup') { footY = 1.2; height = 0.6; }
    if (kind === 'proj') { footY = 1.3 + o.z * 1.5 - 0.2; height = 0.4; }
    const a = tmp.clone().setY(footY).project(camera);
    const b = tmp.clone().setY(footY + height).project(camera);
    const x = (a.x + 1) / 2 * W, y = (1 - a.y) / 2 * H, yt = (1 - b.y) / 2 * H;
    const h = Math.max(4, y - yt);
    return { x, y, h, p: Math.min(1, h / 360) };
  }
  function bossPoint() {
    if (!bossActor) return { x: W / 2, y: H / 3 };
    tmp ||= new THREE.Vector3();
    tmp.set(bossActor.root.position.x, 3.5, bossActor.root.position.z).project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H };
  }

  return { init, resize, frame, project, bossPoint, shot, get ready() { return ready; } };
})();
