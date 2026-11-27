// Window views (Gid, 28 Nov 2026): what the window looks out on. Bought like walls and floors
// (finish kind 'view'). Each view is a painted scene plus a moving layer (rain, snow, petals,
// fireflies, fish), drawn on a plane in the window hole with a parallax shader, so the scene
// looks far away and shifts as the room turns.
(() => {
  const TAU = Math.PI * 2;
  const K_ = RoomItems.K_;
  const SW = 1024, SH = 768;   // the painted scene, a little bigger than the window shows
  const OW = 384, OH = 288;    // the moving layer, drawn again each frame

  const SCENES = RoomScenes.SCENES;

  // ---------------------------------------------------------------- the window plane
  // A plane in the window hole. Its shader looks into the scene as if it were depth metres behind
  // the glass: the farther the eye is to one side, the more of the other side shows.
  function viewMesh(K, id, ww, wh, depth = 1.2) {
    const THREE = K.THREE;
    const it = RoomItems.get(id);
    const key = it && it.finish && it.finish.kind === 'view' ? it.finish.scene : 'city';
    const sc = SCENES[key] || SCENES.city;
    const base = K.canvasTex('view|' + key, SW, SH, (c, w, h) => sc.draw(K, c, w, h));
    const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
    const ctx = cv.getContext('2d'), over = new THREE.CanvasTexture(cv); over.colorSpace = THREE.SRGBColorSpace;
    const layer = sc.layer ? sc.layer(K.rng(key.length * 13)) : null;
    const m = new THREE.MeshBasicMaterial({ map: base, color: new THREE.Color(1.15, 1.15, 1.15) });
    m.onBeforeCompile = sh => {
      sh.uniforms.uOver = { value: over }; sh.uniforms.uDepth = { value: depth }; sh.uniforms.uSize = { value: new THREE.Vector2(ww, wh) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLDir;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 vwp = modelMatrix * vec4(transformed, 1.0);\nvLDir = (vec4(vwp.xyz - cameraPosition, 0.0) * modelMatrix).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLDir;\nuniform sampler2D uOver;\nuniform float uDepth;\nuniform vec2 uSize;')
        .replace('#include <map_fragment>', `
          vec3 ld = normalize(vLDir);
          vec2 par = clamp(ld.xy / max(-ld.z, 0.2) * uDepth / uSize, -0.35, 0.35);   // never past the painted margin
          // the scene is drawn 1.35 times the window, so there is room to look round the edges
          vec2 suv = 0.5 + (vMapUv - 0.5) / 1.35 + par / 1.35 * 0.5;
          vec4 sceneC = texture2D(map, suv);
          vec2 ouv = 0.5 + (vMapUv - 0.5) / 1.1 + par / 1.1 * 0.15;
          vec4 ov = texture2D(uOver, ouv);
          diffuseColor.rgb *= mix(sceneC.rgb, ov.rgb, ov.a);`);
    };
    m.customProgramCacheKey = () => 'roomview';
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), m);
    let last = -1;
    const tick = t => {
      if (!layer || t - last < 1 / 30) return;
      last = t;
      ctx.clearRect(0, 0, OW, OH); layer(ctx, OW, OH, t); over.needsUpdate = true;
    };
    tick(0);
    return { mesh, tick, glow: sc.glow, moon: sc.moon };
  }

  // a framed window for the shop picture
  function framed(K, id) {
    const g = K.group(), fm = K.std('#1a1e1c', 0.4, 0.6);
    const v = viewMesh(K, id, 1.6, 1.2, 0.6); v.mesh.position.z = 0.01; g.add(v.mesh);
    for (const [w, h, x, y] of [[1.7, 0.05, 0, 0.62], [1.7, 0.05, 0, -0.62], [0.05, 1.3, -0.82, 0], [0.05, 1.3, 0.82, 0], [0.04, 1.2, 0, 0], [1.6, 0.035, 0, 0.14]]) { const b = K.rbox(w, h, 0.05, 0.006, fm); b.position.set(x, y, 0.03); g.add(b); }
    const sill = K.rbox(1.8, 0.04, 0.16, 0.006, K.std('#3a443e', 0.6)); sill.position.set(0, -0.66, 0.08); g.add(sill);
    g.position.y = 0.7;
    return K.group(g);
  }

  const VIEWS = [
    ['view-city', 'City at night', 0, 'city', true],
    ['view-rain', 'Rainy afternoon', 500, 'rain'],
    ['view-forest', 'Forest with fireflies', 800, 'forest'],
    ['view-snow', 'Snowy mountains', 900, 'snow'],
    ['view-sakura', 'Cherry blossoms', 1000, 'sakura'],
    ['view-sunset', 'Beach sunset', 1200, 'sunset'],
    ['view-neon', 'Neon city in the rain', 1500, 'neon'],
    ['view-ocean', 'Under the sea', 1800, 'ocean'],
    ['view-aurora', 'Northern lights', 2200, 'aurora'],
    ['view-space', 'Earth from orbit', 3000, 'space'],
  ];
  for (const [id, name, price, scene, base] of VIEWS) {
    RoomItems.add({ id, name, category: 'Windows', price, size: [0, 0], gift: !!base, base: !!base, finish: { kind: 'view', scene },
      desc: `${name} outside the window.`, thumb: { dir: [0.25, 0.1, 1] }, build: K_(K => framed(K, id)) });
  }
  RoomItems.viewMesh = viewMesh;
})();
