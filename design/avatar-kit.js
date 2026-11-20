// Procedural player busts for the avatar style test (design/avatar-styles.html).
// One character is a set of shape functions (skin, hair, facial hair, gear, body)
// built from a spec of sliders and parts. Each look meshes those same functions
// its own way: A samples them on a grid and draws the grid as hologram lines,
// B fills them with small cubes, and C samples a coarse grid and shades it flat.
import * as THREE from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

export const GLOW = { green: '#39ff88', gold: '#f2c230', red: '#ff4d5e', cyan: '#3ee6ff' };

export const PARTS = {
  eyes: [['almond', 'Almond'], ['narrow', 'Narrow'], ['round', 'Round'], ['sharp', 'Sharp']],
  hair: [['buzz', 'Buzz'], ['undercut', 'Undercut'], ['long', 'Long, tied back'], ['mohawk', 'Mohawk'], ['hood', 'Hood up'], ['bob', 'Bob']],
  hairTone: [['black', 'Black'], ['ash', 'Ash'], ['white', 'White']],
  gear: [['none', 'None'], ['visor', 'Visor'], ['goggles', 'Goggles'], ['respirator', 'Respirator'], ['headset', 'Headset'], ['implant', 'Eye implant'], ['bandana', 'Bandana']],
  facial: [['none', 'None'], ['stubble', 'Stubble'], ['moustache', 'Moustache'], ['goatee', 'Goatee'], ['beard', 'Beard']],
  outfit: [['collar', 'High collar'], ['crew', 'Crew neck'], ['plates', 'Shoulder plates']],
  glow: [['green', 'Green'], ['gold', 'Gold'], ['red', 'Red'], ['cyan', 'Cyan']],
};
export const SLIDERS = [['headW', 'Head width'], ['jaw', 'Jaw'], ['chin', 'Chin'], ['cheek', 'Cheekbones'], ['brow', 'Brow'], ['nose', 'Nose'], ['lips', 'Lips'], ['browArch', 'Brow arch'], ['neck', 'Neck'], ['shoulders', 'Shoulders'], ['tone', 'Skin tone']];
export const DEFAULT = {
  headW: .5, jaw: .5, chin: .5, cheek: .5, brow: .5, nose: .5, lips: .5, browArch: .4, browThick: .5, neck: .5, shoulders: .5, tone: .5,
  eyes: 'almond', hair: 'buzz', hairTone: 'black', gear: 'none', facial: 'none', outfit: 'collar', glow: 'green',
};

// ---------- small math ----------
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  x -= cx; y -= cy; z -= cz;
  const k0 = Math.hypot(x / rx, y / ry, z / rz), k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
const sph = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;
function cone(x, y, z, ax, ay, az, bx, by, bz, r0, r1) {
  const px = x - ax, py = y - ay, pz = z - az, qx = bx - ax, qy = by - ay, qz = bz - az;
  const h = clamp((px * qx + py * qy + pz * qz) / (qx * qx + qy * qy + qz * qz), 0, 1);
  return Math.hypot(px - qx * h, py - qy * h, pz - qz * h) - lerp(r0, r1, h);
}
const cap = (x, y, z, ax, ay, az, bx, by, bz, r) => cone(x, y, z, ax, ay, az, bx, by, bz, r, r);
function rbox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function table(t, x) { // piecewise linear lookup in [[x, y], ...]
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) { const a = t[i - 1], b = t[i]; return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); }
  return t[t.length - 1][1];
}

// ---------- materials ----------
export const M = { SKIN: 1, HAIR: 2, FACIAL: 3, GEAR: 4, SUIT: 5, EYE: 6, GLOW: 7, MOUTH: 8, HOOD: 9 };

const EYES = {
  almond: { w: .084, hu: .025, hl: .017, tilt: .006, pinch: .85 },
  narrow: { w: .088, hu: .012, hl: .009, tilt: -.003, pinch: .9 },
  round: { w: .072, hu: .031, hl: .027, tilt: 0, pinch: 1 },
  sharp: { w: .092, hu: .019, hl: .012, tilt: .022, pinch: .7 },
};
// hairline height by angle around the head (0 = front, PI = back)
const HAIRLINE = [[0, .31], [.45, .29], [.85, .2], [1.18, .1], [1.32, .0], [1.42, -.07], [1.5, -.07], [1.57, .11], [1.85, .11], [2.0, .02], [2.3, -.09], [2.7, -.2], [PI, -.25]];
const HAIRLINE_LONG = [[0, .3], [.45, .28], [.85, .19], [1.18, .08], [1.4, -.04], [1.6, -.06], [1.9, -.08], [2.3, -.12], [2.7, -.2], [PI, -.25]];

// Shape functions for one character. Every function returns a signed value that is
// negative inside. Only the sign and the zero crossing are used.
export function makeShape(spec) {
  const s = { ...DEFAULT, ...spec };
  const cw = lerp(.335, .385, s.headW);
  const jawF = lerp(.8, 1.06, s.jaw);
  const ex = .125, ey = .055;
  const mw = .058 + .02 * s.lips, mY = -.232;
  const neckR = lerp(.12, .175, s.neck), shW = lerp(.58, .84, s.shoulders);
  const E = EYES[s.eyes] || EYES.almond;
  const hairStyle = s.hair, gear = s.gear;

  const cranium = (x, y, z) => ell(x, y, z, 0, .1, -.04, cw, .43, .46);

  function skin(x, y, z) {
    const ax = Math.abs(x);
    let d = cranium(x, y, z);
    const wf = lerp(1, jawF, sstep(0, -.36, y));
    d = smin(d, ell(x / wf, y, z, 0, -.11, .03, cw * .88, .33, .35) * Math.min(1, wf), .1);       // lower face
    d = smin(d, sph(ax, y, z, .14 + .09 * s.jaw, -.3, .0, .045 + .035 * s.jaw), .08);              // jaw corners
    d = smin(d, ell(x, y, z, 0, -.375 - .015 * s.chin, .235 + .04 * s.chin, .06 + .05 * s.jaw, .045 + .015 * s.chin, .065), .1); // chin
    const ck = .5 + .9 * s.cheek;
    d = smin(d, ell(ax, y, z, .2, -.01, .265, .07 * ck, .045 * ck, .075), .05);                 // cheekbones
    d = smin(d, cap(x, y, z, -.15, .148, .382, .15, .148, .382, .012 + .028 * s.brow), .05);     // brow ridge
    d = smax(d, -sph(ax, y, z, ex, ey + .006, .43, .068), .035);                                   // eye sockets
    const nl = .43 + .055 * s.nose;
    d = smin(d, cone(x, y, z, 0, .09, .395, 0, -.1, nl, .016, .028 + .014 * s.nose), .03);        // nose
    d = smin(d, sph(ax, y, z, .032 + .01 * s.nose, -.112, .388, .024 + .008 * s.nose), .02);      // nostrils
    d = smin(d, cap(x, y, z, -mw, mY + .017, .378, mw, mY + .017, .378, .01 + .012 * s.lips), .02);           // upper lip
    d = smin(d, cap(x, y, z, -mw * .8, mY - .017, .372, mw * .8, mY - .017, .372, .012 + .015 * s.lips), .02); // lower lip
    d = smax(d, -cap(x, y, z, -mw * 1.05, mY, .42, mw * 1.05, mY, .42, .005), .006);              // mouth line
    d = smin(d, ell(ax, y, z, cw + .004, -.02, -.04, .034, .1, .065), .02);                         // ears
    d = Math.min(d, sph(ax, y, z, ex, ey, .332, .05));                                             // eyeballs
    return d;
  }

  const hl = hairStyle === 'long' ? HAIRLINE_LONG : HAIRLINE;
  // hair thickness at a point, or -1 where there is no hair
  function hairT(x, y, z) {
    const aaz = Math.abs(Math.atan2(x, z + .03));
    if (hairStyle === 'bob') return y > -.32 ? .065 : -1;
    if (hairStyle === 'hood') return -1;
    const hy = y - table(hl, aaz);
    if (hy < 0) return -1;
    const ax = Math.abs(x), soft = sstep(0, .035, hy);
    if (hairStyle === 'buzz') return .012 * soft;
    if (hairStyle === 'undercut') {
      const top = sstep(.14, .25, y) * (1 - sstep(.18, .27, ax));
      return (.008 + .095 * top * (.65 + .35 * sstep(-.35, .35, z))) * soft;
    }
    if (hairStyle === 'mohawk') {
      const crest = (1 - sstep(.03, .07, ax)) * sstep(.0, .22, y);
      const a = Math.atan2(y - .1, z + .04);
      return .006 + crest * .14 * (.72 + .28 * Math.cos(a * 15)) * (1 - .35 * sstep(1.4, 2.6, a));
    }
    if (hairStyle === 'long') return (.024 + .02 * sstep(.1, .45, y)) * soft;
    return .012 * soft;
  }
  function hair(x, y, z, cr) {
    if (hairStyle === 'hood') return 9;
    if (hairStyle === 'bob') {
      let d = smin(cr - .035, ell(x, y, z, 0, -.06, -.06, cw + .085, .3, .52), .14);
      d = Math.max(d, -.3 - .05 * sstep(-.2, .3, z) - y);
      const win = Math.max(Math.abs(x) - .232, y - .165, .03 - z);
      return smax(d, -win, .02);
    }
    const aaz = Math.abs(Math.atan2(x, z + .03));
    const t = hairT(x, y, z);
    let d = Math.max(cr - Math.max(t, .004), table(hl, aaz) - y);
    if (hairStyle === 'long') d = Math.min(d, sph(x, y, z, 0, .13, -.5, .085));
    return d;
  }

  function facial(x, y, z, sk) {
    const f = s.facial;
    if (f === 'none' || z < -.1) return 9;
    const ax = Math.abs(x);
    const lipW = sstep(1, 1.35, Math.hypot(x / (mw + .012), (y - mY) / .027));
    const mous = (1 - sstep(mw + .01, mw + .035, ax)) * sstep(mY + .006, mY + .022, y) * (1 - sstep(mY + .05, mY + .07, y)) * sstep(.27, .32, z);
    let t;
    if (f === 'moustache') t = .022 * mous;
    else if (f === 'goatee') t = .026 * Math.max(mous, 1 - sstep(.75, 1.05, Math.hypot(x / .08, (y + .35) / .12))) * lipW;
    else {
      const reg = sstep(0, .045, lerp(-.16, -.02, sstep(.05, .3, ax)) - y) * sstep(-.6, -.52, y) * sstep(-.1, -.02, z) * lipW;
      t = f === 'stubble' ? .007 * reg : (.016 + .026 * sstep(-.2, -.4, y)) * reg + .02 * mous;
    }
    return t < .0015 ? 9 : sk - t;
  }

  function gearShell(x, y, z, sk) {
    if (gear === 'bandana') {
      const aaz = Math.abs(Math.atan2(x, z + .03));
      const top = .0 + .09 * sstep(.4, 2.6, aaz);
      let base = smin(sk, ell(x, y, z, 0, -.24, .32, .19, .24, .12), .05);
      base = smin(base, ell(x, y, z, 0, -.52, .16, .17, .12, .14), .06);
      let d = Math.max(base - .028, y - top, -.66 - y);
      return Math.min(d, sph(x, y, z, 0, .04, -.5, .045));
    }
    if (gear === 'respirator') {
      let d = ell(x, y, z, 0, -.2, .425, .118, .1, .085);
      d = smin(d, ell(x, y, z, 0, -.12, .415, .07, .07, .05), .03);
      const aaz = Math.abs(Math.atan2(x, z + .03));
      if (aaz > .5) {
        const band = Math.abs(y - (-.18 + .24 * sstep(.6, 2.6, aaz))) - .022;
        const t = Math.max(hairT(x, y, z), 0) + .014;
        d = Math.min(d, Math.max(sk - t, band));
      }
      return d;
    }
    if (gear === 'goggles') {
      const aaz = Math.abs(Math.atan2(x, z + .03));
      if (aaz < .75) return 9;
      const band = Math.abs(y - (.06 + .04 * sstep(1, 2.8, aaz))) - .026;
      const t = Math.max(hairT(x, y, z), 0) + .016;
      return Math.max(sk - t, band);
    }
    return 9;
  }

  function hood(x, y, z) {
    if (hairStyle !== 'hood') return 9;
    let d = smin(ell(x, y, z, 0, .13, -.06, cw + .115, .54, .57), ell(x, y, z, 0, -.56, -.1, .43, .3, .43), .16);
    const tunnel = Math.max((Math.hypot(x / .255, (y + .07) / .43) - 1) * .25, -z - .05);
    d = smax(d, -tunnel, .03);
    return d;
  }

  // Head without the body. Sets lastMat.
  let lastMat = M.SKIN;
  function head(x, y, z) {
    const sk = skin(x, y, z);
    let d = sk, m = M.SKIN;
    const cr = cranium(x, y, z);
    const h = hair(x, y, z, cr); if (h < d) { d = h; m = M.HAIR; }
    const fc = facial(x, y, z, sk); if (fc < d) { d = fc; m = M.FACIAL; }
    const g = gearShell(x, y, z, sk); if (g < d) { d = g; m = M.GEAR; }
    const hd = hood(x, y, z); if (hd < d) { d = hd; m = M.HOOD; }
    lastMat = m;
    return d;
  }

  function body(x, y, z) {
    const ax = Math.abs(x);
    let d = cap(x, y, z, 0, -.25, -.05, 0, -.95, -.07, neckR);
    d = smin(d, ell(x, y, z, 0, -1.19, -.07, shW - .05, .37, .24), .12);                          // chest
    d = smin(d, sph(ax, y, z, shW - .13, -.94, -.08, .13), .1);                                   // shoulder caps
    d = smin(d, cap(ax, y, z, .05, -.7, -.1, shW - .2, -.85, -.09, .08), .12);                    // trapezius
    let m = y < (z < -.05 ? -.74 : -.8) ? M.SUIT : M.SKIN;
    if (s.outfit === 'collar') {
      const c = Math.max(cap(x, y, z, 0, -.5, -.05, 0, -.95, -.06, neckR + .04), y + .58, -.9 - y);
      if (c < d) { d = c; m = M.SUIT; }
      if (y < -.62) m = M.SUIT;
    } else if (s.outfit === 'plates') {
      const p = ell(ax, y, z, shW - .14, -.88, -.07, .17, .085, .19);
      if (p < d) { d = p; m = M.GEAR; }
    }
    d = Math.max(d, -(y + 1.36 - .16 * (x / shW) ** 2));
    lastMat = m;
    return d;
  }

  // ---------- gear built from tubes ----------
  const lofts = [];
  const L = (pts, rs, ru, o = {}) => lofts.push({ pts, rs, ru, mat: o.mat || M.GEAR, sides: o.sides || 8, closed: !!o.closed, up: o.up || [0, 1, 0], caps: o.caps !== false });
  if (hairStyle === 'long') {
    L([[0, .1, -.57], [0, -.04, -.63], [0, -.28, -.63], [0, -.5, -.57], [0, -.62, -.52]], [.055, .052, .046, .034, .012], null, { mat: M.HAIR, sides: 7, up: [0, 0, 1] });
  }
  if (gear === 'visor') {
    const pts = []; for (let i = 0; i <= 10; i++) { const a = lerp(-1.22, 1.22, i / 10); pts.push([Math.sin(a) * .47, ey + .005, -.03 + Math.cos(a) * .47]); }
    L(pts, .009, .052, { mat: M.GLOW, sides: 4 });
    for (const sd of [-1, 1]) L([[sd * .44, ey, .12], [sd * (cw + .02), ey, .02]], .022, .022, { sides: 6 });
  }
  if (gear === 'goggles') {
    for (const sd of [-1, 1]) {
      L([[sd * ex, ey, .35], [sd * ex, ey, .43]], .066, .066, { sides: 10 });
      L([[sd * ex, ey, .43], [sd * ex, ey, .456]], .052, .052, { mat: M.GLOW, sides: 10 });
    }
    L([[-.07, ey + .01, .44], [.07, ey + .01, .44]], .013, .013, { sides: 6 });
  }
  if (gear === 'respirator') {
    for (const sd of [-1, 1]) {
      L([[sd * .1, -.22, .43], [sd * .2, -.26, .47]], .048, .048, { sides: 8 });
      L([[sd * .2, -.26, .47], [sd * .21, -.264, .476]], .036, .036, { mat: M.GLOW, sides: 8 });
    }
  }
  if (gear === 'headset') {
    const hx = cw + .004;
    for (const sd of [-1, 1]) L([[sd * (hx - .01), .0, -.03], [sd * (hx + .065), .0, -.03]], .088, .088, { sides: 10 });
    const top = .53 + Math.max(.012, hairStyle === 'undercut' ? .1 : hairStyle === 'bob' ? .07 : .03) + .02;
    const pts = []; for (let i = 0; i <= 12; i++) { const a = lerp(.08, PI - .08, i / 12); pts.push([Math.cos(a) * (hx + .04), .0 + Math.sin(a) * (top - .0), -.03]); }
    L(pts, .022, .016, { sides: 6, up: [0, 0, 1] });
    L([[-(hx + .06), -.04, .02], [-(hx + .02), -.15, .2], [-.2, -.22, .36], [-.08, -.235, .425]], .011, .011, { sides: 5 });
    L([[-.095, -.234, .42], [-.05, -.236, .438]], .02, .02, { mat: M.GLOW, sides: 6 });
  }
  if (gear === 'implant') {
    const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; pts.push([ex + Math.cos(a) * .074, ey + Math.sin(a) * .068, .4 - .02 * Math.max(0, Math.cos(a))]); }
    L(pts, .014, .014, { sides: 5, closed: true, up: [0, 0, 1] });
    L([[ex, ey, .37], [ex, ey, .405]], .042, .042, { mat: M.GLOW, sides: 10 });
    L([[ex + .07, ey + .02, .37], [.27, .1, .25], [.33, .12, .1]], .012, .012, { sides: 5 });
    L([[ex + .07, ey - .03, .37], [.28, .0, .24], [.35, -.01, .08]], .009, .009, { sides: 5 });
    L([[.31, .07, .14], [.37, .07, .1]], .045, .045, { sides: 6 });
  }
  for (const l of lofts) loftPrep(l);

  // ---------- face features: eyes, brows, mouth as outlines on the face ----------
  const eyeOutline = (sd, n = 18, scale = 1) => {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const t = (k / n) * TAU, c = Math.cos(t), sn = Math.sin(t);
      const lx = Math.sign(c) * Math.pow(Math.abs(c), E.pinch) * E.w / 2 * scale;
      let ly = (sn > 0 ? sn * E.hu : sn * E.hl) * scale + E.tilt * c * scale;
      pts.push([sd * (ex + lx), ey + ly]);
    }
    return pts;
  };
  const browLine = (sd, n = 7) => {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const x = .048 + .14 * t;
      const y = .142 + s.browArch * .022 * Math.sin(PI * Math.min(1, t * 1.15)) + (E.tilt > .01 ? .016 * t : 0) - .006 * s.brow;
      pts.push([sd * x, y, (.007 + .016 * s.browThick) * (1 - .45 * t)]);
    }
    return pts;
  };
  const mouthLine = (n = 7) => {
    const pts = [];
    for (let k = 0; k < n; k++) { const t = k / (n - 1), x = lerp(-mw * 1.04, mw * 1.04, t); pts.push([x, mY - .005 * Math.pow(x / mw, 2)]); }
    return pts;
  };
  const showEyes = gear !== 'goggles';
  const showMouth = gear !== 'bandana' && gear !== 'respirator';

  // inside tests used by the voxel look for the painted features
  const eyeIn = (x, y) => {
    const ax = Math.abs(x), lx = ax - ex, ly = y - ey, hw = E.w / 2 * 1.25;
    if (Math.abs(lx) > hw) return false;
    const c = lx / hw, yy = ly - E.tilt * c * 1.25;
    const h = (yy > 0 ? E.hu : E.hl) * 1.25 + .006;
    return Math.abs(yy) < h * Math.sqrt(Math.max(0, 1 - c * c));
  };
  const browIn = (x, y) => {
    const ax = Math.abs(x); if (ax < .045 || ax > .19) return false;
    const t = (ax - .048) / .14;
    const by = .142 + s.browArch * .022 * Math.sin(PI * Math.min(1, t * 1.15)) + (E.tilt > .01 ? .016 * t : 0) - .006 * s.brow;
    return Math.abs(y - by) < (.007 + .016 * s.browThick) * (1 - .45 * t) + .008;
  };

  // everything at once, for the voxel look
  function all(x, y, z) {
    let d = head(x, y, z), m = lastMat;
    const b = body(x, y, z); if (b < d) { d = b; m = lastMat; }
    for (const l of lofts) if (loftInside(l, x, y, z)) { d = -1; m = l.mat; }
    if (d < 0 && m === M.SKIN && z > .2) {
      if (showEyes && eyeIn(x, y) && z > .32) m = M.EYE;
      else if (browIn(x, y) && z > .3) m = M.HAIR;
      else if (showMouth && Math.abs(x) < mw * 1.05 && Math.abs(y - mY) < .011 && z > .34) m = M.MOUTH;
    }
    lastMat = m;
    return d;
  }

  return {
    spec: s, head, body, all, lofts, eyeOutline, browLine, mouthLine, showEyes, showMouth,
    mat: () => lastMat, center: [0, -.02, -.03],
  };
}

// ---------- tubes ----------
function loftPrep(l) {
  const n = l.pts.length;
  l.rs = Array.isArray(l.rs) ? l.rs : l.pts.map(() => l.rs);
  l.ru = l.ru == null ? l.rs : Array.isArray(l.ru) ? l.ru : l.pts.map(() => l.ru);
  l.frames = l.pts.map((p, i) => {
    const a = l.closed ? l.pts[(i - 1 + n) % n] : l.pts[Math.max(0, i - 1)];
    const b = l.closed ? l.pts[(i + 1) % n] : l.pts[Math.min(n - 1, i + 1)];
    const T = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    let up = new THREE.Vector3(...l.up);
    if (Math.abs(T.dot(up)) > .95) up = new THREE.Vector3(0, 0, 1);
    const S = new THREE.Vector3().crossVectors(T, up).normalize();
    const U = new THREE.Vector3().crossVectors(S, T).normalize();
    return { T, S, U };
  });
  const r = Math.max(...l.rs, ...l.ru);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of l.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k] - r); hi[k] = Math.max(hi[k], p[k] + r); }
  l.lo = lo; l.hi = hi;
}
function loftInside(l, x, y, z) {
  if (x < l.lo[0] || y < l.lo[1] || z < l.lo[2] || x > l.hi[0] || y > l.hi[1] || z > l.hi[2]) return false;
  const n = l.pts.length, segs = l.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = l.pts[i], j = (i + 1) % n, b = l.pts[j];
    const qx = b[0] - a[0], qy = b[1] - a[1], qz = b[2] - a[2], len2 = qx * qx + qy * qy + qz * qz;
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const hr = (px * qx + py * qy + pz * qz) / len2;
    if (!l.closed && ((i === 0 && hr < -.02) || (i === segs - 1 && hr > 1.02))) continue;
    const h = clamp(hr, 0, 1);
    const vx = px - qx * h, vy = py - qy * h, vz = pz - qz * h;
    const f = h < .5 ? l.frames[i] : l.frames[j];
    const ds = vx * f.S.x + vy * f.S.y + vz * f.S.z, du = vx * f.U.x + vy * f.U.y + vz * f.U.z;
    const rs = lerp(l.rs[i], l.rs[j], h), ru = lerp(l.ru[i], l.ru[j], h);
    if ((ds / rs) ** 2 + (du / ru) ** 2 <= 1) return true;
  }
  return false;
}
// tube mesh: sides plus flat end caps
function loftGeometry(l) {
  const pos = [], n = l.pts.length, k = l.sides, rings = [];
  for (let i = 0; i < n; i++) {
    const p = l.pts[i], f = l.frames[i], ring = [];
    for (let j = 0; j < k; j++) {
      const a = (j / k) * TAU + PI / k;
      const c = Math.cos(a) * l.rs[i], sn = Math.sin(a) * l.ru[i];
      ring.push([p[0] + f.S.x * c + f.U.x * sn, p[1] + f.S.y * c + f.U.y * sn, p[2] + f.S.z * c + f.U.z * sn]);
    }
    rings.push(ring);
  }
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const segs = l.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = rings[i], B = rings[(i + 1) % n];
    for (let j = 0; j < k; j++) { const j2 = (j + 1) % k; tri(A[j], B[j], B[j2]); tri(A[j], B[j2], A[j2]); }
  }
  if (!l.closed && l.caps) {
    for (const [ri, flip] of [[0, true], [n - 1, false]]) {
      const R = rings[ri], c = l.pts[ri];
      for (let j = 0; j < k; j++) { const j2 = (j + 1) % k; flip ? tri(c, R[j2], R[j]) : tri(c, R[j], R[j2]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- sampling the surface ----------
// Walk in from outside along a ray and return the distance to the outermost surface.
function hitInward(F, ox, oy, oz, dx, dy, dz, rMax) {
  let r = rMax, rOut = rMax;
  for (let i = 0; i < 400; i++) {
    const v = F(ox + dx * r, oy + dy * r, oz + dz * r);
    if (v < 0) break;
    rOut = r;
    r -= Math.max(v * .55, .002);
    if (r <= 0) return 0;
  }
  let rIn = Math.max(r, 0);
  for (let i = 0; i < 12; i++) { const m = (rIn + rOut) / 2; if (F(ox + dx * m, oy + dy * m, oz + dz * m) < 0) rIn = m; else rOut = m; }
  return (rIn + rOut) / 2;
}
const mirrorCols = half => [...half.slice(0, -1), ...half.slice(1).reverse().map(a => TAU - a)];
const densify = a => { const o = []; for (let i = 0; i < a.length - 1; i++) o.push(a[i], (a[i] + a[i + 1]) / 2); o.push(a[a.length - 1]); return o; };

// head grid: columns go around the head, rows go from under the chin to the crown
const HEAD_COLS = [0, .09, .19, .3, .42, .56, .72, .9, 1.1, 1.33, 1.57, 1.85, 2.15, 2.5, 2.85, PI];
const HEAD_ROWS = [-1.5, -1.3, -1.12, -.98, -.84, -.72, -.62, -.52, -.4, -.28, -.18, -.06, .06, .15, .25, .36, .5, .68, .88, 1.1, 1.33, 1.5];
const BODY_COLS = [0, .2, .42, .66, .92, 1.2, 1.45, 1.7, 1.98, 2.3, 2.7, PI];
const BODY_ROWS = [-1.355, -1.24, -1.12, -1.02, -.94, -.88, -.83, -.79, -.75, -.7, -.62, -.5, -.3];

function sampleHead(sh, rows, cols) {
  const [cx, cy, cz] = sh.center;
  const P = [], Mt = [];
  for (const el of rows) {
    const pr = [], mr = [];
    for (const az of cols) {
      const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
      const r = hitInward(sh.head, cx, cy, cz, dx, dy, dz, 1.15);
      pr.push([cx + dx * r, cy + dy * r, cz + dz * r]);
      sh.head(cx + dx * (r - .004), cy + dy * (r - .004), cz + dz * (r - .004)); mr.push(sh.mat());
    }
    P.push(pr); Mt.push(mr);
  }
  return { P, Mt };
}
function sampleBody(sh, rows, cols) {
  const P = [], Mt = [];
  for (const y of rows) {
    const pr = [], mr = [];
    for (const a of cols) {
      const dx = Math.sin(a), dz = Math.cos(a);
      const r = hitInward(sh.body, 0, y, -.06, dx, 0, dz, 1.2);
      pr.push([dx * r, y, -.06 + dz * r]);
      sh.body(dx * (r - .004), y, -.06 + dz * (r - .004)); mr.push(sh.mat());
    }
    P.push(pr); Mt.push(mr);
  }
  return { P, Mt };
}
// material in the middle of each grid cell, sampled with its own ray
function cellMats(sh, rows, cols, isBody) {
  const out = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const r = [];
    for (let j = 0; j < cols.length; j++) {
      const a0 = cols[j], a1 = j + 1 < cols.length ? cols[j + 1] : cols[0] + TAU;
      const a = (a0 + a1) / 2, e = (rows[i] + rows[i + 1]) / 2;
      if (isBody) {
        const dx = Math.sin(a), dz = Math.cos(a);
        const rr = hitInward(sh.body, 0, e, -.06, dx, 0, dz, 1.2);
        sh.body(dx * (rr - .004), e, -.06 + dz * (rr - .004));
      } else {
        const [cx, cy, cz] = sh.center;
        const dx = Math.sin(a) * Math.cos(e), dy = Math.sin(e), dz = Math.cos(a) * Math.cos(e);
        const rr = hitInward(sh.head, cx, cy, cz, dx, dy, dz, 1.15);
        sh.head(cx + dx * (rr - .004), cy + dy * (rr - .004), cz + dz * (rr - .004));
      }
      r.push(sh.mat());
    }
    out.push(r);
  }
  return out;
}

// grid to triangles. Diagonals mirror across the face so the left and right sides match.
function gridTris(P, cols, cb) {
  for (let i = 0; i < P.length - 1; i++) {
    for (let j = 0; j < cols.length; j++) {
      const j2 = (j + 1) % cols.length;
      const a = P[i][j], b = P[i][j2], c = P[i + 1][j2], d = P[i + 1][j];
      if (cols[j] < PI - 1e-6) { cb(a, b, c, i, j); cb(a, c, d, i, j); }
      else { cb(a, b, d, i, j); cb(b, c, d, i, j); }
    }
  }
}

// ---------- colours ----------
const SKIN_TONES = [new THREE.Color('#e3c4a8'), new THREE.Color('#a87a5a'), new THREE.Color('#5a3d2c')];
const HAIR_TONES = { black: new THREE.Color('#16181a'), ash: new THREE.Color('#6d685f'), white: new THREE.Color('#d9d6cc') };
function skinColor(t) {
  return t < .5 ? SKIN_TONES[0].clone().lerp(SKIN_TONES[1], t * 2) : SKIN_TONES[1].clone().lerp(SKIN_TONES[2], (t - .5) * 2);
}
export function palette(spec) {
  const g = new THREE.Color(GLOW[spec.glow] || GLOW.green);
  return {
    glow: g,
    bright: g.clone().lerp(new THREE.Color('#ffffff'), .45),
    skin: skinColor(spec.tone),
    hair: HAIR_TONES[spec.hairTone] || HAIR_TONES.black,
    gear: new THREE.Color('#20262a'),
    suit: new THREE.Color('#141b18'),
    hood: new THREE.Color('#1b211e'),
    mouth: new THREE.Color('#2a1714'),
  };
}
function matColor(pal, m, glowGear) {
  switch (m) {
    case M.HAIR: return pal.hair;
    case M.FACIAL: return pal.hair.clone().lerp(pal.skin, .25);
    case M.GEAR: return pal.gear;
    case M.SUIT: return pal.suit;
    case M.HOOD: return pal.hood;
    case M.GLOW: case M.EYE: return glowGear;
    case M.MOUTH: return pal.mouth;
    default: return pal.skin;
  }
}

// project 2D face points onto a mesh from the front
const _ray = new THREE.Raycaster();
function projectFront(mesh, pts2, lift = .004) {
  const out = [];
  for (const p of pts2) {
    _ray.set(new THREE.Vector3(p[0], p[1], 2), new THREE.Vector3(0, 0, -1));
    const h = _ray.intersectObject(mesh, false)[0];
    if (!h) { out.push(null); continue; }
    const n = h.face.normal;
    out.push([h.point.x + n.x * lift, h.point.y + n.y * lift, h.point.z + n.z * lift]);
  }
  return out;
}
function stripGeometry(center, halfW) { // a flat ribbon along a 3D polyline, widened in y
  const pos = [];
  for (let i = 0; i < center.length - 1; i++) {
    const a = center[i], b = center[i + 1];
    if (!a || !b) continue;
    const ha = halfW[i], hb = halfW[i + 1];
    const a0 = [a[0], a[1] - ha, a[2]], a1 = [a[0], a[1] + ha, a[2]], b0 = [b[0], b[1] - hb, b[2]], b1 = [b[0], b[1] + hb, b[2]];
    pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function fanGeometry(ring) {
  const pts = ring.filter(Boolean); if (pts.length < 3) return null;
  const c = [0, 0, 0]; for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
  c[2] += .002;
  const pos = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; pos.push(...c, ...a, ...b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
// face features: front points mirrored for the side of the face that turns away
function featureSets(sh) {
  const sets = { eyes: [], brows: [], mouth: null };
  for (const sd of [-1, 1]) {
    if (sh.showEyes) sets.eyes.push(sh.eyeOutline(sd));
    sets.brows.push(sh.browLine(sd));
  }
  if (sh.showMouth) sets.mouth = sh.mouthLine();
  return sets;
}
const triCount = obj => { let t = 0; obj.traverse(o => { if (o.isMesh && o.visible) { const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } }); return Math.round(t); };

// ============================================================
// A. Wireframe hologram
// ============================================================
export const holoTime = { value: 0 };
const HOLO_V = `attribute float aK; varying vec3 vN; varying vec3 vV; varying float vY; varying float vK;
  void main(){ vK = aK; vec4 w = modelMatrix * vec4(position,1.0); vY = w.y; vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w; vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * mv; }`;
const HOLO_F = `uniform vec3 uCol; uniform float uTime; uniform float uScan; uniform float uBase; uniform float uRim; uniform float uKs;
  varying vec3 vN; varying vec3 vV; varying float vY; varying float vK;
  void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 2.2);
    float scan = mix(1.0, 0.45 + 0.55 * step(0.5, fract(vY * 62.0 - uTime * 0.12)), uScan);
    gl_FragColor = vec4(uCol * (uBase + vK * uKs + f * uRim) * scan, 1.0); }`;

function buildHolo(sh, pal) {
  const group = new THREE.Group();
  const rows = densify(HEAD_ROWS), half = densify(HEAD_COLS), cols = mirrorCols(half);
  const H = sampleHead(sh, rows, cols);
  const brows = densify(BODY_ROWS), bcols = mirrorCols(densify(BODY_COLS));
  const B = sampleBody(sh, brows, bcols);

  const fillU = { uCol: { value: pal.glow.clone() }, uTime: holoTime, uScan: { value: 1 }, uBase: { value: .02 }, uRim: { value: .45 }, uKs: { value: 1 } };
  const fillMat = new THREE.ShaderMaterial({ uniforms: fillU, vertexShader: HOLO_V, fragmentShader: HOLO_F, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });

  const fillK = m => (m === M.HAIR ? (sh.spec.hairTone === 'white' ? .2 : .13) : m === M.FACIAL ? .09 : m === M.GEAR || m === M.HOOD ? .1 : 0);
  const solid = (G, cols) => {
    const P = G.P, pos = [], idx = [], kk = [], nc = cols.length;
    P.forEach((r, i) => r.forEach((p, j) => { pos.push(...p); kk.push(fillK(G.Mt[i][j])); }));
    for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < nc; j++) {
      const j2 = (j + 1) % nc, a = i * nc + j, b = i * nc + j2, c = (i + 1) * nc + j2, d = (i + 1) * nc + j;
      idx.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(kk, 1)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const headGeo = solid(H, cols), bodyGeo = solid(B, bcols);
  for (const g of [headGeo, bodyGeo]) {
    const dm = new THREE.Mesh(g, depthMat); dm.renderOrder = 0; group.add(dm);
    const fm = new THREE.Mesh(g, fillMat); fm.renderOrder = 1; group.add(fm);
  }
  const headMesh = new THREE.Mesh(headGeo); headMesh.updateMatrixWorld();

  // grid lines: every second row and column of the dense grid
  const lp = [], lc = [];
  const intensity = m => (m === M.HAIR ? (sh.spec.hairTone === 'white' ? .55 : .3) : m === M.FACIAL ? .38 : m === M.GEAR || m === M.HOOD ? .5 : m === M.SUIT ? .22 : .5);
  const seg = (a, b, ma, mb) => {
    const k = Math.min(intensity(ma), intensity(mb));
    lp.push(...a, ...b);
    const c = pal.glow;
    lc.push(c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k);
  };
  const gridLines = (G, cols, step) => {
    const nc = cols.length;
    for (let i = 0; i < G.P.length; i += step) for (let j = 0; j < nc; j++) seg(G.P[i][j], G.P[i][(j + 1) % nc], G.Mt[i][j], G.Mt[i][(j + 1) % nc]);
    for (let j = 0; j < nc; j += step) for (let i = 0; i < G.P.length - 1; i++) seg(G.P[i][j], G.P[i + 1][j], G.Mt[i][j], G.Mt[i + 1][j]);
  };
  gridLines(H, cols, 2);
  gridLines(B, bcols, 4);
  // facial hair and hair get extra short strokes so they read as texture
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(lineGeo, lineMat); lines.renderOrder = 2; group.add(lines);

  // vertex points on the grid crossings of the head
  const pp = [];
  for (let i = 0; i < H.P.length; i += 2) for (let j = 0; j < cols.length; j += 2) pp.push(...H.P[i][j]);
  const ptsGeo = new THREE.BufferGeometry(); ptsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  const ptsMat = new THREE.PointsMaterial({ color: pal.glow.clone().multiplyScalar(.9), size: 2.2, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const points = new THREE.Points(ptsGeo, ptsMat); points.renderOrder = 3; group.add(points);

  // features
  const F = featureSets(sh);
  const featLines = [], featCol = [];
  const addPoly = (pts, k, closed) => {
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n]; if (!a || !b) continue;
      featLines.push(...a, ...b);
      const c = pal.bright; featCol.push(c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k);
    }
  };
  const eyeFillMat = new THREE.MeshBasicMaterial({ color: pal.bright.clone().multiplyScalar(.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const e of F.eyes) {
    const ring = projectFront(headMesh, e, .006);
    addPoly(ring, 1.2, true);
    const fg = fanGeometry(ring); if (fg) { const m = new THREE.Mesh(fg, eyeFillMat); m.renderOrder = 4; group.add(m); }
  }
  for (const b of F.brows) {
    const pts = projectFront(headMesh, b.map(p => [p[0], p[1]]), .006);
    const hi = projectFront(headMesh, b.map(p => [p[0], p[1] + p[2]]), .006);
    const lo = projectFront(headMesh, b.map(p => [p[0], p[1] - p[2]]), .006);
    const k = sh.spec.hairTone === 'white' ? 1 : .75;
    addPoly(pts, k); addPoly(hi, k * .7); addPoly(lo, k * .7);
  }
  if (F.mouth) addPoly(projectFront(headMesh, F.mouth, .006), .9);
  // nose ridge and nostril base, so the profile reads when the head turns
  addPoly(projectFront(headMesh, [[0, .06], [0, -.02], [0, -.09], [0, -.12]], .006), .6);
  addPoly(projectFront(headMesh, [[-.045, -.13], [-.02, -.135], [0, -.13], [.02, -.135], [.045, -.13]], .006), .6);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.Float32BufferAttribute(featLines, 3));
  fGeo.setAttribute('color', new THREE.Float32BufferAttribute(featCol, 3));
  const feat = new THREE.LineSegments(fGeo, lineMat); feat.renderOrder = 4; group.add(feat);

  // gear tubes as lines and a faint fill
  const gearLineMat = new THREE.LineBasicMaterial({ color: pal.glow.clone().multiplyScalar(.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowLineMat = new THREE.LineBasicMaterial({ color: pal.bright, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const gearFillU = { ...fillU, uBase: { value: .1 }, uRim: { value: .7 }, uKs: { value: 1 } };
  const gearFill = new THREE.ShaderMaterial({ uniforms: gearFillU, vertexShader: HOLO_V, fragmentShader: HOLO_F, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowFill = new THREE.MeshBasicMaterial({ color: pal.glow.clone().multiplyScalar(.45), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const l of sh.lofts) {
    const g = loftGeometry(l);
    const isGlow = l.mat === M.GLOW, isHair = l.mat === M.HAIR;
    g.setAttribute('aK', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(isHair ? fillK(M.HAIR) : .04), 1));
    const fm = new THREE.Mesh(g, isGlow ? glowFill : gearFill); fm.renderOrder = 1; group.add(fm);
    if (!isGlow) { const dm = new THREE.Mesh(g, depthMat); dm.renderOrder = 0; group.add(dm); }
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 12), isGlow ? glowLineMat : isHair ? lineMat : gearLineMat);
    if (isHair) { const c = []; const n = e.geometry.attributes.position.count; const k = sh.spec.hairTone === 'white' ? .55 : .3; for (let i = 0; i < n; i++) c.push(pal.glow.r * k, pal.glow.g * k, pal.glow.b * k); e.geometry.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
    e.renderOrder = 2; group.add(e);
  }

  // base ring it floats over
  const ring = new THREE.Group(); ring.position.y = -1.46;
  const circle = (r, n, k) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; p.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: pal.glow.clone().multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); };
  ring.add(circle(.82, 96, .9), circle(.92, 96, .35), circle(.6, 64, .25));
  const tp = []; for (let i = 0; i < 48; i++) { const a = i / 48 * TAU, r0 = .84, r1 = i % 4 ? .88 : .91; tp.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  ring.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: pal.glow.clone().multiplyScalar(.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.82, 64).rotateX(-PI / 2), new THREE.ShaderMaterial({
    uniforms: { uCol: { value: pal.glow.clone() } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uCol; varying vec2 vP; void main(){ float r = length(vP) / 0.82; gl_FragColor = vec4(uCol * 0.16 * (1.0 - r) * (1.0 - r), 1.0); }',
  }));
  ring.add(disc);
  group.add(ring);

  return {
    group,
    small(on) { ring.visible = !on; points.visible = !on; fillU.uScan.value = on ? 0 : 1; fillU.uBase.value = on ? .05 : .02; fillU.uRim.value = on ? .75 : .45; fillU.uKs.value = on ? 2.6 : 1; lineMat.opacity = on ? .5 : 1; },
  };
}

// ============================================================
// B. Voxel grid
// ============================================================
const VOX_V = `attribute vec3 aCol; attribute vec4 aEdge; attribute float aAO; attribute float aGlow; uniform float uV;
  varying vec3 vCol; varying vec4 vEdge; varying float vAO; varying float vGlow; varying vec3 vN; varying vec2 vUv;
  void main(){ vCol = aCol; vEdge = aEdge; vAO = aAO; vGlow = aGlow; vN = normalize(mat3(modelMatrix) * normal);
    vec3 an = abs(normal); vUv = (an.x > 0.5 ? position.zy : an.y > 0.5 ? position.xz : position.xy) / uV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const VOX_F = `uniform vec3 uGlow; uniform float uEdge; uniform float uGrid; uniform float uSmall;
  varying vec3 vCol; varying vec4 vEdge; varying float vAO; varying float vGlow; varying vec3 vN; varying vec2 vUv;
  void main(){
    vec3 L = normalize(vec3(-0.45, 0.7, 0.65));
    float lit = 0.3 + 0.7 * max(dot(normalize(vN), L), 0.0);
    vec3 c = vCol * lit * vAO;
    vec2 f = vUv - floor(vUv - 0.0001 * sign(vUv)); f = fract(vUv);
    vec2 w = fwidth(vUv) * mix(1.0, 0.6, uSmall);
    vec4 d = vec4(f.x, 1.0 - f.x, f.y, 1.0 - f.y) / vec4(w.x, w.x, w.y, w.y);
    vec4 ln = 1.0 - smoothstep(0.5, 1.5, d);
    float outline = max(max(ln.x * vEdge.x, ln.y * vEdge.y), max(ln.z * vEdge.z, ln.w * vEdge.w)) * mix(1.0, 0.7, uSmall);
    float grid = max(max(ln.x, ln.y), max(ln.z, ln.w));
    c += uGlow * grid * uGrid * (1.0 - uSmall);
    c = mix(c, uGlow * uEdge, outline * (1.0 - vGlow));
    c = mix(c, uGlow * 1.3, vGlow);
    gl_FragColor = vec4(c, 1.0);
  }`;

function buildVoxel(sh, pal, opts = {}) {
  const V = opts.voxel || .0265;
  const out = buildVoxelAt(sh, pal, V);
  // a big hood with plates and a beard can pass the budget, so step the cube size up until it fits
  return out.tris > 30000 ? buildVoxelAt(sh, pal, V * Math.sqrt(out.tris / 29000)) : out;
}
function buildVoxelAt(sh, pal, V) {
  const group = new THREE.Group();
  const snap = v => Math.floor(v / V) * V;
  const lo = [snap(-.98), snap(-1.3), snap(-.8)], hi = [.98, .78, .72];
  const nx = Math.ceil((hi[0] - lo[0]) / V), ny = Math.ceil((hi[1] - lo[1]) / V), nz = Math.ceil((hi[2] - lo[2]) / V);
  const grid = new Uint8Array(nx * ny * nz);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) {
    const z = lo[2] + (k + .5) * V;
    for (let j = 0; j < ny; j++) {
      const y = lo[1] + (j + .5) * V;
      for (let i = 0; i < nx; i++) {
        const x = lo[0] + (i + .5) * V;
        if (y > -.62 && (Math.abs(x) > .72 || z < -.72)) continue;
        if (sh.all(x, y, z) < 0) grid[id(i, j, k)] = sh.mat();
      }
    }
  }
  const at = (i, j, k) => (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz ? grid[id(i, j, k)] : 0);
  const pos = [], nor = [], col = [], edg = [], aos = [], glw = [];
  // per face: normal axis, then the axes that the shader maps to u and v
  const FACES = [[0, 1, 2, 1], [0, -1, 2, 1], [1, 1, 0, 2], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 0, 1]];
  const glowC = pal.bright;
  const c = new THREE.Color();
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const m = grid[id(i, j, k)]; if (!m) continue;
    const isGlow = m === M.EYE || m === M.GLOW;
    c.copy(matColor(pal, m, glowC));
    if (!isGlow) c.multiplyScalar(m === M.SKIN ? .7 : m === M.HAIR && sh.spec.hairTone === 'white' ? .7 : 1);
    if (m === M.HAIR || m === M.FACIAL) {
      c.multiplyScalar(.82 + .36 * ((((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) >>> 0) % 8) / 7);
      c.lerp(pal.glow, m === M.HAIR ? .28 : .3);
    }
    const cell = [i, j, k];
    for (const [ax, sg, ua, va] of FACES) {
      const n = [0, 0, 0]; n[ax] = sg;
      if (at(i + n[0], j + n[1], k + n[2])) continue;
      // occlusion from the 8 cells around the empty cell in front of this face
      let occ = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const q = [i + n[0], j + n[1], k + n[2]]; q[ua] += a; q[va] += b;
        if (at(q[0], q[1], q[2])) occ++;
      }
      const ao = Math.max(.35, 1 - occ * .085);
      // bright edge on sides where the surface steps or the material changes
      const flag = (axis, dir) => {
        const q = cell.slice(); q[axis] += dir;
        const nm = at(q[0], q[1], q[2]);
        if (nm && nm !== m) return 1;
        if (!nm || at(q[0] + n[0], q[1] + n[1], q[2] + n[2])) return .32;
        return 0;
      };
      const e = [flag(ua, -1), flag(ua, 1), flag(va, -1), flag(va, 1)];
      const base = [i * V + lo[0], j * V + lo[1], k * V + lo[2]];
      if (sg > 0) base[ax] += V;
      const corner = (a, b) => { const p = base.slice(); p[ua] += a * V; p[va] += b * V; return p; };
      let q4 = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
      // keep the winding facing out
      const cr = (ua === 0 && va === 1) || (ua === 1 && va === 2) || (ua === 2 && va === 0) ? 1 : -1;
      if (cr * sg < 0) q4 = [q4[0], q4[3], q4[2], q4[1]];
      for (const t of [0, 1, 2, 0, 2, 3]) { pos.push(...q4[t]); nor.push(...n); col.push(c.r, c.g, c.b); edg.push(...e); aos.push(ao); glw.push(isGlow ? 1 : 0); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edg, 4));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(aos, 1));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glw, 1));
  const U = { uGlow: { value: pal.glow.clone() }, uEdge: { value: .85 }, uGrid: { value: .05 }, uSmall: { value: 0 }, uV: { value: V } };
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VOX_V, fragmentShader: VOX_F }));
  group.add(mesh);
  return { group, tris: pos.length / 9, small(on) { U.uSmall.value = on ? 1 : 0; U.uEdge.value = on ? .55 : .85; } };
}

// ============================================================
// C. Faceted low-poly
// ============================================================
function buildLowPoly(sh, pal) {
  const group = new THREE.Group();
  const indexed = (G, cols) => {
    const pos = [], idx = [], nc = cols.length;
    for (const r of G.P) for (const p of r) pos.push(...p);
    for (let i = 0; i < G.P.length - 1; i++) for (let j = 0; j < nc; j++) { const j2 = (j + 1) % nc, a = i * nc + j, b = i * nc + j2, c = (i + 1) * nc + j2, d = (i + 1) * nc + j; idx.push(a, b, c, a, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
  };
  // sample finely, then let the simplifier keep triangles where the surface bends
  const hRows = densify(HEAD_ROWS), hCols = mirrorCols(densify(HEAD_COLS));
  const bRows = densify(BODY_ROWS), bCols = mirrorCols(BODY_COLS);
  const simplify = (g, keep) => {
    const n = g.attributes.position.count;
    return new SimplifyModifier().modify(g, Math.max(0, n - keep));
  };
  const headS = simplify(indexed(sampleHead(sh, hRows, hCols), hCols), 620);
  const bodyS = simplify(indexed(sampleBody(sh, bRows, bCols), bCols), 200);
  // flat colour per triangle from the material just under its centre
  const paint = (g, F) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position.array, col = new Float32Array(p.length);
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
    for (let t = 0; t < p.length; t += 9) {
      A.fromArray(p, t); B.fromArray(p, t + 3); C.fromArray(p, t + 6);
      N.subVectors(C, B).cross(new THREE.Vector3().subVectors(A, B)).normalize();
      const cx = (A.x + B.x + C.x) / 3 - N.x * .006, cy = (A.y + B.y + C.y) / 3 - N.y * .006, cz = (A.z + B.z + C.z) / 3 - N.z * .006;
      F(cx, cy, cz);
      const c = matColor(pal, sh.mat(), pal.glow);
      for (let k = 0; k < 3; k++) { col[t + k * 3] = c.r; col[t + k * 3 + 1] = c.g; col[t + k * 3 + 2] = c.b; }
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ng.deleteAttribute('normal');
    ng.computeVertexNormals();
    return ng;
  };
  const headGeo = paint(headS, sh.head), bodyGeo = paint(bodyS, sh.body);
  const surf = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .42, metalness: .3 });
  const edgeMat = new THREE.LineBasicMaterial({ color: pal.glow, transparent: true, opacity: .85 });
  const headMesh = new THREE.Mesh(headGeo, surf); group.add(headMesh);
  group.add(new THREE.Mesh(bodyGeo, surf));
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(headGeo, 34), edgeMat));
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo, 42), edgeMat));
  headMesh.updateMatrixWorld();

  const gearMat = new THREE.MeshStandardMaterial({ color: pal.gear, flatShading: true, roughness: .45, metalness: .5 });
  const hairMat = new THREE.MeshStandardMaterial({ color: pal.hair, flatShading: true, roughness: .7, metalness: .1 });
  const glowMat = new THREE.MeshBasicMaterial({ color: pal.bright, transparent: true, opacity: .9 });
  for (const l of sh.lofts) {
    const g = loftGeometry(l);
    const isGlow = l.mat === M.GLOW;
    if (isGlow && sh.spec.gear === 'visor') { const vm = glowMat.clone(); vm.opacity = .55; vm.color = pal.glow.clone(); group.add(new THREE.Mesh(g, vm)); }
    else group.add(new THREE.Mesh(g, isGlow ? glowMat : l.mat === M.HAIR ? hairMat : gearMat));
    if (!isGlow) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 34), edgeMat));
  }

  // eyes, brows and mouth on the faceted face
  const F = featureSets(sh);
  const eyeMat = new THREE.MeshBasicMaterial({ color: pal.bright, side: THREE.DoubleSide });
  for (const e of F.eyes) { const fg = fanGeometry(projectFront(headMesh, e, .007)); if (fg) group.add(new THREE.Mesh(fg, eyeMat)); }
  const browMat = new THREE.MeshStandardMaterial({ color: pal.hair, roughness: .8, side: THREE.DoubleSide });
  for (const b of F.brows) {
    const c = projectFront(headMesh, b.map(p => [p[0], p[1]]), .008);
    group.add(new THREE.Mesh(stripGeometry(c, b.map(p => p[2])), browMat));
  }
  if (F.mouth) {
    const c = projectFront(headMesh, F.mouth, .006);
    group.add(new THREE.Mesh(stripGeometry(c, F.mouth.map((p, i) => .0045 * Math.sin(PI * (i + .5) / F.mouth.length) + .002)), new THREE.MeshBasicMaterial({ color: pal.mouth, side: THREE.DoubleSide })));
  }
  return { group, small(on) { edgeMat.opacity = on ? .45 : .85; } };
}

// smooth shaded version used only to check the sculpt
function buildSmooth(sh, pal) {
  const group = new THREE.Group();
  const rows = densify(densify(HEAD_ROWS)), cols = mirrorCols(densify(densify(HEAD_COLS)));
  const brows = densify(BODY_ROWS), bcols = mirrorCols(densify(BODY_COLS));
  const H = sampleHead(sh, rows, cols), B = sampleBody(sh, brows, bcols);
  const solid = (G, cols) => {
    const pos = [], idx = [], col = [], nc = cols.length;
    G.P.forEach((r, i) => r.forEach((p, j) => { pos.push(...p); const c = matColor(pal, G.Mt[i][j], pal.glow); col.push(c.r, c.g, c.b); }));
    for (let i = 0; i < G.P.length - 1; i++) for (let j = 0; j < nc; j++) { const j2 = (j + 1) % nc, a = i * nc + j, b = i * nc + j2, c = (i + 1) * nc + j2, d = (i + 1) * nc + j; idx.push(a, b, c, a, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7 });
  const hm = new THREE.Mesh(solid(H, cols), mat); group.add(hm); group.add(new THREE.Mesh(solid(B, bcols), mat));
  for (const l of sh.lofts) group.add(new THREE.Mesh(loftGeometry(l), new THREE.MeshStandardMaterial({ color: l.mat === M.GLOW ? pal.glow : l.mat === M.HAIR ? pal.hair : '#556', roughness: .5 })));
  hm.updateMatrixWorld();
  const F = featureSets(sh);
  for (const e of F.eyes) { const fg = fanGeometry(projectFront(hm, e, .004)); if (fg) group.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: '#fff', side: THREE.DoubleSide }))); }
  for (const b of F.brows) group.add(new THREE.Mesh(stripGeometry(projectFront(hm, b.map(p => [p[0], p[1]]), .005), b.map(p => p[2])), new THREE.MeshBasicMaterial({ color: '#000', side: THREE.DoubleSide })));
  if (F.mouth) group.add(new THREE.Mesh(stripGeometry(projectFront(hm, F.mouth, .004), F.mouth.map(() => .003)), new THREE.MeshBasicMaterial({ color: '#600', side: THREE.DoubleSide })));
  return { group, small() {} };
}

// ============================================================
export const STYLES = {
  D: { name: 'Debug', build: buildSmooth, bloom: [0, 0, 1], bg: '#333' },
  A: { name: 'Wireframe hologram', build: buildHolo, bloom: [.5, .22, .16], bg: '#030705' },
  B: { name: 'Voxel grid', build: buildVoxel, bloom: [.5, .3, .5], bg: '#040806' },
  C: { name: 'Faceted low-poly', build: buildLowPoly, bloom: [.5, .35, .6], bg: '#040806' },
};

export function buildAvatar(spec, style) {
  const s = { ...DEFAULT, ...spec };
  const sh = makeShape(s);
  const pal = palette(s);
  const t0 = performance.now();
  const out = STYLES[style].build(sh, pal);
  out.ms = Math.round(performance.now() - t0);
  out.spec = s; out.style = style; out.pal = pal;
  out.tris = triCount(out.group);
  return out;
}

// Scene and lights per look. The rim light takes the avatar's glow colour.
export function makeStage(style) {
  const scene = new THREE.Scene();
  const lights = {};
  if (style === 'C') {
    scene.add(new THREE.HemisphereLight('#c8d8d0', '#0a120e', .4));
    lights.key = new THREE.DirectionalLight('#fff4e8', 3); lights.key.position.set(-2.2, 1.3, 1.5); scene.add(lights.key);
    lights.rim = new THREE.DirectionalLight('#39ff88', 3.2); lights.rim.position.set(1.8, 1.0, -1.6); scene.add(lights.rim);
    lights.rim2 = new THREE.DirectionalLight('#39ff88', 1.4); lights.rim2.position.set(-1.8, .2, -1.2); scene.add(lights.rim2);
    lights.fill = new THREE.DirectionalLight('#39ff88', .5); lights.fill.position.set(1.5, -.6, 1.5); scene.add(lights.fill);
  }
  return {
    scene, style,
    set(avatar) {
      for (const k of ['rim', 'rim2', 'fill']) if (lights[k]) lights[k].color.copy(avatar.pal.glow);
    },
  };
}
