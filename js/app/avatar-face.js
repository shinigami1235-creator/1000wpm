// Face materials for the 3D avatars: skin, eyes, brows and lashes. Classic script (no
// three.js import): avatar3d.js passes THREE in through AvatarFace.init.
//
// SKIN. Three MakeHuman CC0 skins (light, medium, dark; tex/skin_<id>.webp, 1024 px) in the
// head's UV layout. For skin tone sk the two nearest bases are tinted in linear light so the
// cheeks, forehead and chin average to AvatarData.SKIN[sk], then mixed. Shared maps:
// tex/skin_nrm.webp (pores, tangent space) and tex/skin_orm.webp (R ambient occlusion,
// G roughness). The skin shader adds a wrap-lit, red-shifted terminator so light bleeds the
// way it does through skin, and lets the AO darken the direct light in creases too.
//
// MAKEUP, FOR THE MAKEUP PAINTER. The face texture is a canvas in the head UV layout:
//   AvatarFace.paintSkin(ctx, L, size)  draws the tinted skin into a size x size 2D context;
//                                       paint makeup over it with ordinary canvas drawing.
//   AvatarFace.key(L)                   goes into the face texture's cache key: it changes
//                                       when the skin for L finishes loading.
//   AvatarFace.need(L)                  promise for the skin and eye files L needs (null when
//                                       they are already here); avatar3d's ensure() awaits it.
//   AvatarFace.layout                   where things sit in that UV layout (0-1, v up):
//                                       face island, the separate lips primitive, the bust.
// The lips are part of the skin mesh and material (M.lips is the same object as M.skin), so lip
// colour and gloss come only from the face texture and the gloss roughness map, with a soft
// border; tools/avatar/makeup_masks.py bakes masks into this layout from head.npz (uv, uv_mh).
// Skin roughness comes from skin_orm.webp through a uniform, so M.skin.roughnessMap and
// M.lips.roughnessMap stay free for the makeup's gloss map (it multiplies on top).
// Lip shape sliders (morphs) are AvatarData.LIP_SLIDERS: lips, lipU, lipL, mouthW, lipBow,
// lipCorner, each -100 to 100 in look.f, built in tools/avatar/morphs.py.
//
// EYES. The MakeHuman high-poly eye proxy with one texture for every colour, tex/eye_iris.webp,
// in a polar layout (axis at the centre, iris edge at radius 0.225, drawn at 0.27): a clean sclera outside, grey
// iris fibres inside. The eye shader colours the fibres from AvatarData.EYE_COLORS (in: the colour
// round the pupil, out: the colour at the edge), darkens a crisp limbal ring and draws a round
// black pupil, and lets the iris glow a little so its colour reads at thumbnail size (the cyber
// colours glow clearly). The cornea
// adds reflections and a catchlight from the key light.
//
// BROWS AND LASHES. MakeHuman eyebrow cards packed into tex/brow_atlas.webp; lashes in
// tex/eye_lash.webp. Brow colour follows the hair unless look.bc picks another colour.
window.AvatarFace = (() => {
  const D = window.AvatarData;
  const layout = { face: [0.005, 0.005, 0.605, 0.995], bust: [0.61, 0.62, 0.995, 0.99], neck: [0.61, 0.24, 0.995, 0.6] };
  let THREE = null, ROOT = '', META = null, ENV = null;

  // ---------- colour maths ----------
  const toLin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; toLin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const LUT_N = 4096, toSrgb = new Uint8ClampedArray(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) { const c = i / LUT_N; toSrgb[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
  const hexLin = hex => { const n = parseInt(hex.slice(1), 16); return [toLin[n >> 16], toLin[(n >> 8) & 255], toLin[n & 255]]; };
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // per tone and channel: albedo over swatch, calibrated so the lit cheeks of a front view under
  // the site's lights read as the swatch (tools: test/face4/tools/calib.py)
  const CAL = [[1.27, 1.33, 1.522], [1.122, 1.171, 1.354], [1.057, 1.116, 1.312], [0.937, 0.984, 1.143], [0.981, 1.001, 1.115], [0.952, 0.977, 1.07], [1.061, 1.078, 1.156], [1.063, 1.053, 1.014], [1.285, 1.123, 0.982], [1.349, 1.016, 0.718]];

  // light tones need more albedo than a texture holds without clipping: the part above 0.95
  // goes to the shader as a gain instead, so highlights keep their hue
  const SAT = [1.3, 1.25, 1.18, 1.08, 1, 1, 1, 1, 1, 1];
  const shaderGain = sk => Math.max(1, Math.max(...CAL[sk]) / 0.95);
  // which bases make skin tone sk, with what weight and per-channel gain
  function plan(sk) {
    // the swatch is what the lit cheek should read as; the albedo sits under it, since the key,
    // fill and tone curve brighten a front-lit face
    const s = hexLin(D.SKIN[sk]).map((v, k) => v * CAL[sk][k] / shaderGain(sk)), ls = Math.log(lum(s));
    const bases = META.skins.map(b => ({ ...b, l: Math.log(lum(b.mean)) })).sort((a, b) => b.l - a.l);
    let pick;
    if (ls >= bases[0].l) pick = [[bases[0], 1]];
    else if (ls <= bases[bases.length - 1].l) pick = [[bases[bases.length - 1], 1]];
    else {
      let i = 0; while (!(ls <= bases[i].l && ls >= bases[i + 1].l)) i++;
      const t = (bases[i].l - ls) / (bases[i].l - bases[i + 1].l);
      pick = [[bases[i], 1 - t], [bases[i + 1], t]];
    }
    return pick.filter(p => p[1] > 0.02).map(([b, w]) => ({ id: b.id, w, gain: s.map((v, k) => v / b.mean[k]) }));
  }

  // ---------- loading ----------
  const imgs = new Map();
  function image(file) {
    if (!imgs.has(file)) {
      const p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = ROOT + 'tex/' + file; })
        .then(i => { p.img = i; return i; }).catch(e => { console.warn('avatar face', file, e); imgs.delete(file); });
      imgs.set(file, p);
    }
    return imgs.get(file);
  }
  const ready = file => !!(imgs.get(file) || {}).img;
  const skinFiles = sk => META ? plan(sk).map(p => `skin_${p.id}.webp`) : [];
  const SHARED = ['skin_nrm.webp', 'skin_orm.webp', 'brow_atlas.webp', 'eye_lash.webp', 'eye_iris.webp'];
  function need(L) {
    const files = [...SHARED, ...skinFiles(L.sk), ...(fhOf(L) ? [FH_FILE] : [])].filter(f => !ready(f));
    return files.length ? Promise.all(files.map(image)) : null;
  }

  // ---------- skin ----------
  const pixels = new Map();   // base id + size -> linear Float32 RGB
  function basePixels(id, size) {
    const k = id + size;
    if (pixels.has(k)) return pixels.get(k);
    const im = imgs.get(`skin_${id}.webp`).img;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, size, size);
    const d = x.getImageData(0, 0, size, size).data, out = new Float32Array(size * size * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { out[j] = toLin[d[i]]; out[j + 1] = toLin[d[i + 1]]; out[j + 2] = toLin[d[i + 2]]; }
    pixels.set(k, out);
    return out;
  }
  // ---------- facial hair: painted from tex/fh_masks.webp (R moustache, G goatee, B beard) ----------
  // style -> [moustache, goatee, beard] weights and coverage. Stubble is a soft shadow in the hair
  // colour with a fine grain; the others cover the skin with hair inside a clear edge.
  const FH = {
    stubble: { w: [0.9, 0.9, 1], op: 0.72, stubble: true },
    moustache: { w: [1, 0, 0], op: 1 }, chin: { w: [0, 1, 0], op: 1 }, goatee: { w: [1, 1, 0], op: 1 },
    shortbeard: { w: [1, 1, 0.9], op: 0.9, short: true }, beard: { w: [1, 1, 1], op: 1 },
  };
  const FH_FILE = 'fh_masks.webp';
  // the facial hair a look shows: none while AvatarData.FACIAL_HAIR is off, whatever was saved
  const fhOf = L => D.FACIAL_HAIR && FH[L.fh] ? L.fh : null;
  const fhPx = new Map();
  function maskPixels(size) {
    if (fhPx.has(size)) return fhPx.get(size);
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(imgs.get(FH_FILE).img, 0, 0, size, size);
    const d = x.getImageData(0, 0, size, size).data, out = new Float32Array(size * size * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { out[j] = d[i] / 255; out[j + 1] = d[i + 1] / 255; out[j + 2] = d[i + 2] / 255; }
    fhPx.set(size, out);
    return out;
  }
  // stroke noise: streaks of len texels along u, which is the face's up-down direction in this
  // layout; long ones are beard strands, short ones the grain of stubble
  const strandPx = new Map();
  function strands(size, len, seed0) {
    const k0 = `${size}:${len}`;
    if (strandPx.has(k0)) return strandPx.get(k0);
    let seed = seed0; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cells = Math.ceil(size / len) + 2, out = new Float32Array(size * size), row = new Float32Array(cells);
    for (let y = 0; y < size; y++) {
      // each row starts its strokes at a different place, so the strokes do not line up in columns
      const off = rnd() * len;
      for (let k = 0; k < cells; k++) row[k] = rnd();
      for (let x = 0; x < size; x++) { const f = (x + off) / len, k = f | 0, t = f - k, s = t * t * (3 - 2 * t); out[y * size + x] = row[k] * (1 - s) + row[k + 1] * s; }
    }
    strandPx.set(k0, out);
    return out;
  }
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  const skinCache = new Map();
  function skinCanvas(L, size) {
    const sk = L.sk, fh = fhOf(L) && ready(FH_FILE) ? L.fh : null;
    const k = `${sk}:${size}:${fh}:${fh ? L.hc : ''}`;
    if (skinCache.has(k)) return skinCache.get(k);
    const P = plan(sk);
    if (!P.every(p => ready(`skin_${p.id}.webp`))) return null;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), im = x.createImageData(size, size), o = im.data;
    const src = P.map(p => ({ px: basePixels(p.id, size), g: p.gain.map(v => v * p.w) }));
    const st = fh && FH[fh], mk = st && maskPixels(size);
    const sn = st && strands(size, Math.max(3, Math.round(size / (st.short ? 150 : 95))), 1729);
    const gr = st && st.stubble && strands(size, Math.max(2, Math.round(size / 400)), 4242);
    // the light base is pale at the forehead and nose; light tones get more colour so they read peach, not white
    const sat = SAT[sk];
    const hc = st && hexLin(D.HAIR_COLORS[L.hc].hex).map(v => v / shaderGain(sk));
    // hair about as bright as the skin would vanish into it: a beard in that range goes on darker,
    // as it looks in its own shade. rho is hair over skin brightness; 0.6 and below or 1.7 and
    // above stay as they are
    const lsk = st && lum(hexLin(D.SKIN[sk]).map((v, k) => v * CAL[sk][k] / shaderGain(sk)));
    const rho = st && lum(hc) / lsk;
    const rhoT = !st || rho <= 0.6 || rho >= 1.7 ? rho : rho < 1.1 ? 0.6 : 0.6 + 1.1 * smooth(1.1, 1.7, rho);
    if (st && !st.stubble) for (let k = 0; k < 3; k++) hc[k] *= rhoT / rho;
    // stubble as light as the skin or lighter barely shows, as it does in life
    const hue = st && hc.map(v => 0.4 + 0.6 * v / Math.max(...hc));   // the sheen takes the hair's hue
    const lhc = st && lum(hc), stubOp = st && st.stubble ? st.op * (1 - 0.65 * smooth(0.4, 1, rho)) : 0;
    for (let i = 0, j = 0, q = 0; j < o.length; i += 3, j += 4, q++) {
      let r = 0, g = 0, b = 0;
      for (const s of src) { r += s.px[i] * s.g[0]; g += s.px[i + 1] * s.g[1]; b += s.px[i + 2] * s.g[2]; }
      if (sat !== 1) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
      if (st) {
        const d = Math.max(mk[i] * st.w[0], mk[i + 1] * st.w[1], mk[i + 2] * st.w[2]);
        if (d > 0.004) {
          const n = sn[q];
          let a, v;
          let tr = hc[0], tg = hc[1], tb = hc[2];
          if (st.stubble) {
            // an even shadow over the whole area, a fine short-stroke grain on top. Stubble never
            // lifts the skin: hair lighter than the skin goes on as a tinted shadow
            const k = smooth(0.02, 1, d);
            a = k * stubOp * (0.9 + 0.2 * gr[q]); v = 0.85;
            const cap = 0.8 * (0.2126 * r + 0.7152 * g + 0.0722 * b) / Math.max(1e-4, lhc * v);
            if (cap < 1) { tr *= cap; tg *= cap; tb *= cap; }
            const sh = 1 - 0.18 * k * (0.9 + 0.2 * gr[q]); r *= sh; g *= sh; b *= sh;
          } else {
            // coverage: solid inside, a clear edge that the strands break up a little
            a = (st.short ? smooth(0.38, 0.58, d + (n - 0.5) * 0.2) : smooth(0.3, 0.52, d + (n - 0.5) * 0.22)) * st.op;
            // strands: light hairs with gaps darker than the hair, so the beard has its own texture
            v = 0.42 + 0.9 * n * Math.sqrt(n);
          }
          // a little sheen on each strand, so a black beard still shows its hairs
          const lift = st.stubble ? 0 : 0.016 * n * n * n;
          r += (tr * v + lift * hue[0] - r) * a; g += (tg * v + lift * hue[1] - g) * a; b += (tb * v + lift * hue[2] - b) * a;
        }
      }
      o[j] = toSrgb[Math.min(LUT_N, (r * LUT_N) | 0)]; o[j + 1] = toSrgb[Math.min(LUT_N, (g * LUT_N) | 0)]; o[j + 2] = toSrgb[Math.min(LUT_N, (b * LUT_N) | 0)]; o[j + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    skinCache.set(k, c);
    while (skinCache.size > 12) skinCache.delete(skinCache.keys().next().value);
    return c;
  }
  function paintSkin(ctx, L, size) {
    const c = META && skinCanvas(L, size);
    if (c) ctx.drawImage(c, 0, 0, size, size);
    else { ctx.fillStyle = D.SKIN[L.sk]; ctx.fillRect(0, 0, size, size); }
  }
  const key = L => `${L.sk}${META && skinFiles(L.sk).every(ready) ? '' : '~'}${fhOf(L) ? (ready(FH_FILE) ? L.fh + L.hc : '~') : ''}`;

  // ---------- shaders ----------
  // Uniforms are per rig (materials() runs once per rig), so the creator and the thumbnail
  // renderer never share a look's values. U only keeps the shared ORM texture.
  const U = { uSkinOrm: { value: null } };
  // wrap lighting with more wrap in red than blue: the shadow edge goes soft and warm
  const skinHook = SU => sh => {
    Object.assign(sh.uniforms, SU);
    const pars = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `{ float nl = dot( geometryNormal, directLight.direction );
         vec3 w = saturate( ( vec3( nl ) + uSkinWrap ) / ( 1.0 + uSkinWrap ) );
         vec3 scatter = uSkinScatter * saturate( w - vec3( saturate( nl ) ) ) * 0.6;
         reflectedLight.directDiffuse += ( w + scatter ) * directLight.color * BRDF_Lambert( material.diffuseColor ) * mix( 1.0, avAO, 0.6 ); }`);
    let f = sh.fragmentShader;
    f = f.replace('#include <common>', '#include <common>\nuniform sampler2D uSkinOrm; uniform vec3 uSkinWrap; uniform vec3 uSkinScatter; uniform float uSkinGain; uniform float uLash; float avAO = 1.0;')
      .replace('#include <lights_physical_pars_fragment>', pars)
      // ORM: G roughness, R occlusion (direct light too), B the upper lash line, darker on women
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec4 avOrm = texture2D( uSkinOrm, vNormalMapUv );
        roughnessFactor *= avOrm.g / 0.58; avAO = avOrm.r;
        diffuseColor.rgb *= uSkinGain * ( 1.0 - uLash * avOrm.b );`)
      // tone curve on brightness, mostly keeping the hue: a plain filmic curve bleaches light
      // skin towards white where the key light hits it
      .replace('#include <tonemapping_fragment>', `{
        vec3 c = gl_FragColor.rgb * uExposure; const vec3 LW = vec3( 0.2126, 0.7152, 0.0722 );
        vec3 a = avAces( c ); vec3 h = c * ( dot( a, LW ) / max( dot( c, LW ), 1e-5 ) );
        gl_FragColor.rgb = clamp( mix( a, h, 0.6 ), 0.0, 1.0 ); }`);
    sh.fragmentShader = f;
  };
  // the eyeball. The texture's fibres (G, 0.5 average) take the iris colour, a gradient from
  // uIrisIn at the pupil to uIrisOut at the edge; the limbal ring and the pupil are drawn here
  // with antialiased edges. The lid shadow (vertex colour) falls on the iris twice as hard as on
  // the white, so the upper lid reads as covering its top; the iris glows a little (uIrisLit), the cyber colours
  // much more, so the colour still reads at thumbnail size.
  // the texture's iris edge, and the iris as drawn: a little larger (about 30 degrees off the
  // axis, as on a real eyeball), so the iris fills the opening the way it does in the Sims
  const IRIS_R = 0.225, IRIS_DRAW = 0.27;
  const eyeHook = EU => sh => {
    Object.assign(sh.uniforms, EU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uIrisIn; uniform vec3 uIrisOut; uniform float uIrisLit; uniform float uPupil;
        float avIris = 0.0; vec3 avIrisCol = vec3( 0.0 ); vec3 avVC = vec3( 1.0 );`)
      .replace('#include <map_fragment>', `{
        vec4 tx = texture2D( map, vMapUv );
        float fib = texture2D( map, 0.5 + ( vMapUv - 0.5 ) * ${(IRIS_R / IRIS_DRAW).toFixed(4)} ).g;
        float r = length( vMapUv - 0.5 ), aa = max( fwidth( r ) * 0.75, 2e-4 );
        float t = clamp( ( r - uPupil ) / ( ${IRIS_DRAW.toFixed(3)} - uPupil ), 0.0, 1.0 );
        vec3 base = mix( uIrisIn, uIrisOut, smoothstep( 0.05, 0.8, t ) );
        vec3 iris = base * ( 0.36 + 1.0 * fib );
        iris *= 1.0 - 0.86 * smoothstep( 0.72, 0.97, t );
        // the upper lid's shadow over the top of the iris (v points up on the eyeball), so the lid
        // reads as resting on the iris rather than above it
        iris *= 1.0 - 0.42 * smoothstep( -0.1, 0.62, ( vMapUv.y - 0.5 ) / ${IRIS_DRAW.toFixed(3)} );
        float pm = smoothstep( uPupil + aa, uPupil - aa, r );
        iris = mix( iris, vec3( 0.003 ), pm );
        avIris = smoothstep( ${IRIS_DRAW.toFixed(3)} + aa, ${IRIS_DRAW.toFixed(3)} - aa, r );
        avIrisCol = iris * ( 1.0 - pm ) * avIris;
        diffuseColor.rgb = mix( pow( tx.rgb, vec3( 2.2 ) ), iris, avIris );
      }`)
      .replace('#include <color_fragment>', `
        #if defined( USE_COLOR_ALPHA )
          avVC = vColor.rgb;
        #elif defined( USE_COLOR )
          avVC = vColor;
        #endif
        avVC = mix( avVC, avVC * avVC, avIris );
        diffuseColor.rgb *= avVC;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += avIrisCol * avVC * uIrisLit;`);
  };
  // the cornea: a round catchlight where it mirrors the key light
  const corneaHook = CU => sh => {
    Object.assign(sh.uniforms, CU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCatch;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 rv = reflect( -normalize( vViewPosition ), normal );
          totalEmissiveRadiance += vec3( 1.0, 0.98, 0.95 ) * uCatch * smoothstep( 0.972, 0.988, dot( rv, uKeyDir ) ); }`);
  };

  // ---------- materials ----------
  const texs = new Map();
  // a texture whose image arrives through image(), so need() can wait for it
  function tex(file, srgb = true) {
    if (!texs.has(file)) {
      const t = new THREE.Texture();
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
      const set = i => { if (i) { t.image = i; t.needsUpdate = true; } };
      const p = image(file);
      if (p.img) set(p.img); else p.then(set);
      texs.set(file, t);
    }
    return texs.get(file);
  }
  // prep(material, opts) is avatar3d's shader setup (rim light, tone mapping); opts.hook adds ours
  function materials(prep, env) {
    ENV = env;
    U.uSkinOrm.value = tex('skin_orm.webp', false);
    const SU = { uSkinOrm: U.uSkinOrm, uSkinWrap: { value: new THREE.Vector3(0.42, 0.2, 0.14) }, uSkinScatter: { value: new THREE.Color(0.55, 0.16, 0.08) },
      uSkinGain: { value: 1 }, uLash: { value: 0.4 } };
    const EU = { uIrisIn: { value: new THREE.Color() }, uIrisOut: { value: new THREE.Color() }, uIrisLit: { value: 0.3 }, uPupil: { value: 0.092 } };
    const CU = { uCatch: { value: 1.4 } };
    const nrm = tex('skin_nrm.webp', false), orm = U.uSkinOrm.value;
    const skinOpts = { roughness: 0.58, normalMap: nrm, normalScale: new THREE.Vector2(0.45, 0.45), aoMap: orm, aoMapIntensity: 1, envMap: env, envMapIntensity: 0.15 };
    const M = {
      skin: prep(new THREE.MeshStandardMaterial(skinOpts), { rim: 0.55, hook: skinHook(SU), name: 'skin' }),
      eye: prep(new THREE.MeshStandardMaterial({ map: tex('eye_iris.webp', false), roughness: 0.42, vertexColors: true, envMap: env, envMapIntensity: 0.05 }),
        { rim: 0, hook: eyeHook(EU), name: 'eye' }),
      // the cornea adds only its reflections: a sharp wet highlight and catchlight from the key light, and the room
      cornea: prep(new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.05, metalness: 0, envMap: env, envMapIntensity: 0.12,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), { rim: 0, hook: corneaHook(CU), name: 'cornea' }),
      brow: prep(new THREE.MeshStandardMaterial({ map: tex('brow_atlas.webp'), transparent: true, alphaTest: 0.03, depthWrite: false,
        side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2 }), { rim: 0 }),
      lash: prep(new THREE.MeshStandardMaterial({ map: tex('eye_lash.webp'), transparent: true, alphaTest: 0.05, depthWrite: false,
        side: THREE.DoubleSide, color: '#140d0b', roughness: 0.6, envMapIntensity: 0 }), { rim: 0 }),
    };
    // the lips are part of the skin mesh now; M.lips stays as a name for the same material
    M.lips = M.skin;
    M.skin.userData.faceUniforms = { SU, EU };   // avatar3d spreads M into its own list
    return M;
  }
  // Eye brightness (look.f.eyeB, -40 muted, 0 natural, 100 vivid). EYE_COLORS hold the vivid
  // colours; natural takes some saturation out and darkens the light ones most, so a light blue
  // eye reads as a real light blue rather than a lit one. Works on linear THREE.Colors in place;
  // returns the slider as -1 to 1 for the glow.
  function irisTone(a, b, eyeB) {
    const k = eyeB < 0 ? Math.max(-1, eyeB / 40) : Math.min(1, eyeB / 100);
    const sat = k < 0 ? 0.7 + 0.4 * k : 0.7 + 0.3 * k;
    for (const c of [a, b]) {
      const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      // light colours lose more: up to 42% at natural for the lightest, none at vivid
      const dim = (k < 0 ? 0.94 + 0.14 * k : 0.94 + 0.06 * k) * (1 - (1 - Math.max(0, k)) * 0.42 * Math.min(1, l / 0.4));
      c.setRGB((l + (c.r - l) * sat) * dim, (l + (c.g - l) * sat) * dim, (l + (c.b - l) * sat) * dim);
    }
    return k;
  }
  // per look: iris colour, brow and lash colour
  function apply(M, L) {
    const F = M.skin.userData.faceUniforms;
    const fem = Math.max(0, Math.min(1, (((L.f && L.f.sex) || 0) + 30) / 90));
    if (F) {
      const ec = D.EYE_COLORS.find(c => c.id === L.ec) || D.EYE_COLORS[0];
      F.EU.uIrisIn.value.set(ec.in || ec.hex); F.EU.uIrisOut.value.set(ec.hex);
      if (ec.glow) F.EU.uIrisLit.value = 0.75;
      else {
        const k = irisTone(F.EU.uIrisIn.value, F.EU.uIrisOut.value, ((L.f && L.f.eyeB) || 0));
        F.EU.uIrisLit.value = k < 0 ? 0.06 + 0.04 * (1 + k) : 0.1 + 0.15 * k;
      }
      F.SU.uSkinGain.value = META ? shaderGain(L.sk) : 1;
      F.SU.uLash.value = 0.22 + 0.5 * fem;
    }
    const hair = D.HAIR_COLORS[L.bc < 0 ? L.hc : L.bc].hex;
    // brows sit a little darker than the hair
    M.brow.color.set(hair).multiplyScalar(0.62);
    M.lash.color.set(((L.f && L.f.sex) || 0) > 25 ? '#0d0807' : '#1a120e');
  }

  function init(three, root, meta) {
    THREE = three; ROOT = root; META = meta && meta.skins ? meta : null;
    for (const k of SHARED) image(k);
  }

  return { init, need, paintSkin, key, plan, materials, apply, layout, uniforms: U };
})();
