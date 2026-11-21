"""Slider table: each slider maps -1 and +1 to MakeHuman targets (CC0).
Deltas are carried onto the low-poly vertices through the barycentric binding."""
import os, sys, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from mhlib import load_obj, load_target

# id, label, group, [(target, gain) at -1], [(target, gain) at +1]
LR = lambda t: [t.replace('X', 'l'), t.replace('X', 'r')]
SLIDERS = [
  ('sex', 'Masculine to feminine', 'Face', 'MACRO_MALE', 'MACRO_FEMALE'),
  ('headW', 'Head width', 'Face', ['head/head-scale-horiz-decr'], ['head/head-scale-horiz-incr']),
  ('jawW', 'Jaw width', 'Face', ['chin/chin-bones-decr'], ['chin/chin-bones-incr']),
  ('jawA', 'Jaw angle', 'Face', ['head/head-round'], ['head/head-square']),
  ('chinL', 'Chin length', 'Face', ['chin/chin-height-decr'], ['chin/chin-height-incr']),
  ('chinW', 'Chin width', 'Face', ['chin/chin-width-decr'], ['chin/chin-width-incr']),
  ('cheekH', 'Cheekbone height', 'Face', LR('cheek/X-cheek-trans-down'), LR('cheek/X-cheek-trans-up')),
  ('cheekW', 'Cheekbone width', 'Face', LR('cheek/X-cheek-bones-decr'), LR('cheek/X-cheek-bones-incr')),
  ('browH', 'Brow height', 'Eyes', ['eyebrows/eyebrows-trans-down'], ['eyebrows/eyebrows-trans-up']),
  ('browD', 'Brow depth', 'Eyes', ['eyebrows/eyebrows-trans-backward'], ['eyebrows/eyebrows-trans-forward']),
  ('eyeS', 'Eye size', 'Eyes', LR('eyes/X-eye-scale-decr'), LR('eyes/X-eye-scale-incr')),
  ('eyeD', 'Eye spacing', 'Eyes', LR('eyes/X-eye-trans-in'), LR('eyes/X-eye-trans-out')),
  ('eyeT', 'Eye tilt', 'Eyes', LR('eyes/X-eye-corner2-down') + LR('eyes/X-eye-corner1-up'), LR('eyes/X-eye-corner2-up') + LR('eyes/X-eye-corner1-down')),
  ('noseL', 'Nose length', 'Nose', ['nose/nose-scale-vert-decr'], ['nose/nose-scale-vert-incr']),
  ('noseW', 'Nose width', 'Nose', ['nose/nose-scale-horiz-decr'], ['nose/nose-scale-horiz-incr']),
  ('noseB', 'Nose bridge', 'Nose', ['nose/nose-hump-decr'], ['nose/nose-hump-incr']),
  ('noseT', 'Nose tip', 'Nose', ['nose/nose-point-down'], ['nose/nose-point-up']),
  ('lips', 'Lip size', 'Mouth', ['mouth/mouth-upperlip-volume-decr', 'mouth/mouth-lowerlip-volume-decr', ('mouth/mouth-scale-vert-decr', 0.5)],
           ['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-lowerlip-volume-incr', ('mouth/mouth-scale-vert-incr', 0.5)]),
  ('mouthW', 'Mouth width', 'Mouth', ['mouth/mouth-scale-horiz-decr'], ['mouth/mouth-scale-horiz-incr']),
  ('ears', 'Ear size', 'Face', LR('ears/X-ear-scale-decr'), LR('ears/X-ear-scale-incr')),
  ('neck', 'Neck thickness', 'Face', ['neck/neck-scale-horiz-decr', 'neck/neck-scale-depth-decr'], ['neck/neck-scale-horiz-incr', 'neck/neck-scale-depth-incr']),
  # lip shape (the creator's lip controls; ids and ranges are listed in AvatarData.LIP_SLIDERS)
  ('lipU', 'Upper lip fullness', 'Mouth', ['mouth/mouth-upperlip-volume-decr', ('mouth/mouth-upperlip-height-decr', 0.5)], ['mouth/mouth-upperlip-volume-incr', ('mouth/mouth-upperlip-height-incr', 0.5)]),
  ('lipL', 'Lower lip fullness', 'Mouth', ['mouth/mouth-lowerlip-volume-decr', ('mouth/mouth-lowerlip-height-decr', 0.5)], ['mouth/mouth-lowerlip-volume-incr', ('mouth/mouth-lowerlip-height-incr', 0.5)]),
  ('lipBow', "Cupid's bow", 'Mouth', ['mouth/mouth-cupidsbow-decr'], ['mouth/mouth-cupidsbow-incr']),
  ('lipCorner', 'Lip corners', 'Mouth', ['mouth/mouth-angles-down'], ['mouth/mouth-angles-up']),
  # eye shape (FACE pass 3). Width and height turn the lids about the eyeball centre (eye_field
  # below), so the lids slide over the eyeball and the eyeball itself keeps its shape
  ('eyeW', 'Eye width', 'Eyes', [('@eyeW', -1)], [('@eyeW', 1)]),
  ('eyeH', 'Eye height', 'Eyes', [('@eyeH', -1)], [('@eyeH', 1)]),
  ('eyeIn', 'Inner corners', 'Eyes', LR('eyes/X-eye-corner1-down'), LR('eyes/X-eye-corner1-up')),
  ('eyeOut', 'Outer corners', 'Eyes', LR('eyes/X-eye-corner2-down'), LR('eyes/X-eye-corner2-up')),
  # V-shape: slimmer cheeks and lower jaw, a narrower, softly pointed chin. 0 to 100 only
  ('vline', 'V-shape', 'Face', [], [('chin/chin-bones-decr', 1.3), ('cheek/l-cheek-volume-decr', 0.8), ('cheek/r-cheek-volume-decr', 0.8),
                                   ('chin/chin-width-decr', 0.6), ('head/head-invertedtriangular', 0.9), ('chin/chin-height-incr', 0.2)]),
  # PROPORTIONS. The thirds: each stretches its own band of the face and the bands below it
  # follow, so the head never stretches as a whole (prop_field below). The eyes are the anchor:
  # the forehead grows upwards into the scalp, the midface and lower face downwards
  ('foreH', 'Forehead height', 'Proportions', [('@foreH', -1)], [('@foreH', 1)]),
  ('midH', 'Midface length', 'Proportions', [('@midH', -1)], [('@midH', 1)]),
  ('lowH', 'Lower face length', 'Proportions', [('@lowH', -1)], [('@lowH', 1)]),
  # the fifths: the outer fifths, from the outer eye corners to the sides of the face
  ('faceW', 'Face width', 'Proportions', [('@faceW', -1)], [('@faceW', 1)]),
  # the rest of a Sims-style face editor
  ('foreS', 'Forehead slope', 'Face', [('@foreS', -1)], [('@foreS', 1)]),
  ('foreP', 'Forehead prominence', 'Face', [('@foreP', -1)], [('@foreP', 1)]),
  ('templeW', 'Temple width', 'Face', ['forehead/forehead-temple-decr'], ['forehead/forehead-temple-incr']),
  ('cheekF', 'Cheek fullness', 'Face', LR('cheek/X-cheek-volume-decr'), LR('cheek/X-cheek-volume-incr')),
  ('cheekHo', 'Cheek hollows', 'Face', [('@cheekHo', -1)], [('@cheekHo', 1)]),
  ('jawH', 'Jaw angle height', 'Face', [('@jawH', -1)], [('@jawH', 1)]),
  ('jawDef', 'Jaw line definition', 'Face', ['neck/neck-double-incr', ('head/head-fat-incr', 0.5)], ['neck/neck-double-decr', ('head/head-fat-decr', 0.5)]),
  ('chinP', 'Chin projection', 'Face', ['chin/chin-prominent-decr'], ['chin/chin-prominent-incr']),
  ('earA', 'Ear angle', 'Face', LR('ears/X-ear-wing-decr'), LR('ears/X-ear-wing-incr')),
  ('eyeDp', 'Eye depth', 'Eyes', [('@eyeDp', -1)], [('@eyeDp', 1)]),
  ('lidF', 'Eyelid fold', 'Eyes', LR('eyes/X-eye-eyefold-up'), LR('eyes/X-eye-eyefold-down')),
  ('nostW', 'Nostril width', 'Nose', ['nose/nose-nostrils-width-decr', ('nose/nose-flaring-decr', 0.5)], ['nose/nose-nostrils-width-incr', ('nose/nose-flaring-incr', 0.5)]),
  ('tipW', 'Nose tip width', 'Nose', ['nose/nose-point-width-decr'], ['nose/nose-point-width-incr']),
  ('bridgeW', 'Bridge width', 'Nose', ['nose/nose-width1-decr', ('nose/nose-width2-decr', 0.6)], ['nose/nose-width1-incr', ('nose/nose-width2-incr', 0.6)]),
  ('noseA', 'Nose angle', 'Nose', ['nose/nose-septumangle-decr', ('nose/nose-nostrils-angle-down', 0.6)], ['nose/nose-septumangle-incr', ('nose/nose-nostrils-angle-up', 0.6)]),
  ('noseP', 'Nose projection', 'Nose', ['nose/nose-scale-depth-decr'], ['nose/nose-scale-depth-incr']),
  ('mouthY', 'Mouth position', 'Mouth', ['mouth/mouth-trans-down'], ['mouth/mouth-trans-up']),
  # lips: the whole mouth's height, then each lip's width and height on its own. MakeHuman's
  # per-lip width targets also pull the other lip at the corners, so they are masked to their
  # own lip (lip_field)
  ('lipH', 'Lip height', 'Mouth', ['mouth/mouth-scale-vert-decr'], ['mouth/mouth-scale-vert-incr']),
  ('lipUW', 'Upper lip width', 'Mouth', [('@up:mouth/mouth-upperlip-width-decr', 1)], [('@up:mouth/mouth-upperlip-width-incr', 1)]),
  ('lipUH', 'Upper lip height', 'Mouth', [('@up:mouth/mouth-upperlip-height-decr', 1)], [('@up:mouth/mouth-upperlip-height-incr', 1)]),
  ('lipLW', 'Lower lip width', 'Mouth', [('@lo:mouth/mouth-lowerlip-width-decr', 1)], [('@lo:mouth/mouth-lowerlip-width-incr', 1)]),
  ('lipLH', 'Lower lip height', 'Mouth', [('@lo:mouth/mouth-lowerlip-height-decr', 1)], [('@lo:mouth/mouth-lowerlip-height-incr', 1)]),
]
# per slider multiplier on the targets ('id' for both ends, 'id-' or 'id+' for one), tuned by
# looking at every slider at both ends, so no end looks alien
GAIN = {'jawW': 1.5, 'jawA': 1.2, 'cheekH': 1.8, 'eyeD': 2.0, 'chinW-': 1.3, 'chinW+': 1.0, 'cheekW-': 1.2, 'cheekW+': 0.9, 'eyeS': 1.5, 'eyeT': 2.4,
        'noseB': 1.8, 'noseT-': 0.8, 'noseT+': 2.0, 'browD-': 1.6, 'browD+': 0.45, 'browH': 1.2,
        'lips-': 1.0, 'lips+': 0.7, 'neck': 2.0, 'noseW': 1.4, 'noseL': 1.3, 'ears': 1.2,
        'lipU': 0.9, 'lipL-': 0.85, 'lipL+': 0.55, 'lipBow': 1.0, 'lipCorner': 0.8, 'eyeIn': 1.3, 'eyeOut': 1.3, 'eyeH-': 0.75, 'eyeH+': 0.6,
        # proportions and the Sims-style shape sliders (pass PROP 1)
        'foreH': 1.3, 'midH-': 1.0, 'midH+': 1.2, 'lowH': 1.2, 'faceW': 1.5, 'foreS': 2.4, 'foreP': 1.6, 'templeW-': 0.7, 'templeW+': 1.5,
        'cheekF-': 1.2, 'cheekF+': 0.9, 'cheekHo': 1.3, 'jawH': 2.5, 'chinP': 0.85, 'eyeDp': 1.3, 'lidF-': 2.0, 'lidF+': 1.0,
        'nostW+': 0.85, 'tipW-': 1.5, 'tipW+': 2.5, 'bridgeW-': 1.3, 'bridgeW+': 2.0, 'noseA+': 0.7,
        'mouthY': 0.8, 'lipH': 0.9, 'lipLW-': 0.6, 'lipLH+': 0.6}
# extra targets mixed into the masculine (-) and feminine (+) ends of the sex slider
SEX_EXTRA = {
    # the Sims man (FACE pass 4): a shorter, leaner face. The taper comes from the back of the
    # jaw: the angle under the ears is only a little wider than neutral (chin-bones-incr 0.4,
    # some head-square for the corner) and the chin stays a normal firm chin, not pulled narrow or
    # long. Less fat over the whole head and hollower cheeks under raised cheekbones; a slimmer
    # neck so the jaw line shows; the mouth corners go back to neutral (BASE lifts them for everyone)
    '-': [('eyebrows/eyebrows-trans-forward', 0.35), ('nose/nose-scale-horiz-incr', 0.3),
          ('neck/neck-scale-horiz-incr', 0.25), ('neck/neck-scale-depth-incr', 0.3),
          ('chin/chin-bones-incr', 0.4), ('head/head-square', 0.3), ('chin/chin-width-decr', 0.3), ('chin/chin-prominent-incr', 0.45),
          ('chin/chin-height-decr', 0.1), ('head/head-invertedtriangular', 0.3), ('head/head-fat-decr', 1.0), ('head/head-scale-vert-decr', 0.55),
          ('mouth/mouth-angles-down', 0.8),
          ('cheek/l-cheek-volume-decr', 1.2), ('cheek/r-cheek-volume-decr', 1.2), ('cheek/l-cheek-bones-incr', 0.6), ('cheek/r-cheek-bones-incr', 0.6),
          ('cheek/l-cheek-inner-decr', 0.5), ('cheek/r-cheek-inner-decr', 0.5)],
    '+': [('chin/chin-bones-decr', 0.5), ('eyebrows/eyebrows-trans-backward', 0.5), ('mouth/mouth-upperlip-volume-incr', 0.5), ('mouth/mouth-lowerlip-volume-incr', 0.5),
          ('nose/nose-scale-horiz-decr', 0.4), ('nose/nose-point-up', 0.4), ('neck/neck-scale-horiz-decr', 0.6), ('chin/chin-width-decr', 0.4),
          ('eyes/l-eye-scale-incr', 0.45), ('eyes/r-eye-scale-incr', 0.45), ('cheek/l-cheek-bones-incr', 0.2), ('cheek/r-cheek-bones-incr', 0.2)],
}
# always on (the runtime applies 'base+' at full weight): the face everyone starts from
BASE = [('head/head-scale-depth-incr', 0.25), ('forehead/forehead-scale-vert-incr', 0.3), ('head/head-back-scale-depth-incr', 0.25),
        ('chin/chin-prominent-incr', 0.15),
        # a smaller, softer nose
        ('nose/nose-scale-horiz-decr', 0.3), ('nose/nose-scale-vert-decr', 0.15), ('nose/nose-volume-decr', 0.25),
        # larger eyes, the upper lid over about a fifth of the iris, the lower lid just over its bottom
        ('eyes/l-eye-scale-incr', 0.5), ('eyes/r-eye-scale-incr', 0.5),
        ('eyes/l-eye-height2-decr', 1.8), ('eyes/r-eye-height2-decr', 1.8), ('eyes/l-eye-height1-decr', 0.35), ('eyes/r-eye-height1-decr', 0.35),
        ('eyes/l-eye-height3-decr', 0.45), ('eyes/r-eye-height3-decr', 0.45),
        # relaxed brows (inner ends up, tails a touch lower) and mouth corners lifted: a friendly resting face.
        # These are the FACE pass 2 values Gid approved on the woman; keep them
        ('eyebrows/eyebrows-trans-up', 0.25), ('eyebrows/eyebrows-angle-up', 0.35), ('mouth/mouth-angles-up', 0.6),
        ('cheek/l-cheek-volume-incr', 0.25), ('cheek/r-cheek-volume-incr', 0.25)]


# eye_field: lid region of each eye, in angles about the eyeball centre (degrees): the opening's
# middle (outward, up), its half width and half height, and how far the change reaches
EYE_OPEN = dict(az0=8.0, el0=-2.0, aw=52.0, ah=28.0, reach=2.1)
EYE_K = {'eyeW': 0.45, 'eyeH': 0.2}
_EYE = {}

def eye_field(name, F, G, neu):
    """Delta that widens (eyeW) or opens (eyeH) both eyes: each skin vertex near an eye turns
    about the eyeball centre, its azimuth (eyeW) or elevation (eyeH) from the opening's middle
    scaled by 1 + k * w, w being 1 over the opening and fading to 0 at EYE_OPEN reach. Distance
    from the centre stays the same, so the lids keep sliding on the eyeball."""
    if name in _EYE: return _EYE[name]
    body = np.unique([i for f, g in zip(F, G) if g == 'body' for i in f])
    out = np.zeros_like(neu); o = EYE_OPEN; k = EYE_K[name]
    for side, sx in (('l', 1), ('r', -1)):
        idx = sorted({i for f, g in zip(F, G) if g == f'helper-{side}-eye' for i in f})
        c = neu[idx].mean(0); R = np.linalg.norm(neu[idx] - c, axis=1).mean()
        d = neu[body] - c; rho = np.linalg.norm(d, axis=1)
        az = np.degrees(np.arctan2(d[:, 0] * sx, d[:, 2])); hz = np.hypot(d[:, 0], d[:, 2])
        el = np.degrees(np.arctan2(d[:, 1], hz))
        da, de = az - o['az0'], el - o['el0']
        e = np.hypot(da / o['aw'], de / o['ah'])
        t = np.clip((o['reach'] - e) / (o['reach'] - 1), 0, 1); w = t * t * (3 - 2 * t)
        t = np.clip((2.3 * R - rho) / (0.9 * R), 0, 1); w *= t * t * (3 - 2 * t)
        w *= d[:, 2] > -0.3 * R
        if name == 'eyeW': az = o['az0'] + da * (1 + k * w)
        else: el = o['el0'] + de * (1 + k * w * np.where(de > 0, 1.0, 0.65))
        a, b = np.radians(az), np.radians(el)
        nd = np.stack([np.sin(a) * np.cos(b) * sx, np.sin(b), np.cos(a) * np.cos(b)], 1) * rho[:, None]
        out[body] += np.where((rho > 1e-6)[:, None], nd - d, 0)
    _EYE[name] = out
    return out

# ---------- proportion and shape fields ('@name' in the table above) ----------
# All are built on the neutral base mesh in MakeHuman decimetres (y up, z forward), over every
# vertex, helpers included, so the eyeballs (fitted to the eye helpers) move with their lids.
# Landmarks on the midline of the neutral face:
LM = dict(hair=8.0,      # front hairline (hair_build.hairline at 0 degrees)
          brow=7.62,     # top of the brows; the forehead starts stretching above it
          lid=7.22,      # just under the lower lids; the midface stretches below it
          sub=6.89,      # subnasale, the base of the nose
          lipT=6.78, lipB=6.57,   # top of the upper lip and bottom of the lower lip
          ment=6.29)     # menton, the bottom of the chin
SKULL = np.array([0.0, 7.72, 0.28])    # the skull centre the hair uses (geom.C)
_FIELD = {}

def _ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def _az(P):
    """Degrees round the head from the front, 0 on the face's midline, 180 at the back."""
    return np.degrees(np.arctan2(np.abs(P[:, 0]), P[:, 2] - SKULL[2]))

def _normals(F, G, P):
    N = np.zeros_like(P)
    for f, g in zip(F, G):
        if g != 'body': continue
        a, b, c = P[f[0]], P[f[1]], P[f[2]]
        n = np.cross(b - a, c - a)
        for i in f: N[i] += n
    return N / (np.linalg.norm(N, axis=1)[:, None] + 1e-12)

def _band_shift(P, g):
    """Shift down by g(y) (0..1) on the front of the face; the neck under the chin and the
    sides towards the ears stay, so only the face's own bands move."""
    w = g * _ss(95, 50, _az(P)) * _ss(5.95, LM['ment'], P[:, 1])
    out = np.zeros_like(P); out[:, 1] = -0.1 * w
    return out

def prop_field(name, F, G, neu):
    """The thirds, the fifths and the face shape fields. Each is 1 decidecimetre-ish at full
    weight (GAIN scales them); positive is taller, longer, wider, more."""
    if name in _FIELD: return _FIELD[name]
    P = neu; x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x); az = _az(P)
    out = np.zeros_like(P)
    if name == 'foreH':
        # the forehead slides up over the skull about the skull centre: no turn at the brows,
        # the most at the hairline, none again by the crown, so the hairline rises and the top
        # of the head keeps its place
        d = P[:, 1:] - SKULL[1:]; e = np.degrees(np.arctan2(d[:, 0], d[:, 1]))
        eh = np.degrees(np.arctan2(LM['hair'] - SKULL[1], 1.30 - SKULL[2])); eb = np.degrees(np.arctan2(LM['brow'] - SKULL[1], 1.44 - SKULL[2]))
        prof = np.where(e < eh, _ss(eb + 2, eh, e), _ss(80, eh, e))
        r = np.linalg.norm(d, axis=1); phi = np.radians(5.5) * prof * _ss(80, 35, az) * (d[:, 1] > -0.2)
        a = np.arctan2(d[:, 0], d[:, 1]) + phi
        out[:, 1] = SKULL[1] + r * np.sin(a) - y; out[:, 2] = SKULL[2] + r * np.cos(a) - z
    elif name == 'midH':
        # under the eyes down to the base of the nose; everything below moves down with it
        out = _band_shift(P, _ss(LM['lid'], LM['sub'] + 0.01, y))
    elif name == 'lowH':
        # the philtrum takes a third and the chin two thirds; the lips move as one piece
        g = np.where(y > LM['lipT'], _ss(LM['sub'], LM['lipT'], y) / 3, 1 / 3 + 2 / 3 * _ss(LM['lipB'], LM['ment'] + 0.02, y))
        out = _band_shift(P, g)
    elif name == 'faceW':
        # the outer fifths: from the outer eye corners out to the sides of the face, at eye level
        # and fading above the temples and down the cheeks; the eyes keep their size and place
        w = _ss(0.43, 0.76, ax) * _ss(6.3, 6.95, y) * _ss(8.45, 7.75, y)
        out[:, 0] = np.sign(x) * 0.1 * w
    elif name == 'foreS':
        # the upper forehead leans back (positive) or stands up; brows and crown stay
        w = _ss(LM['brow'], 8.12, y) * _ss(8.62, 8.15, y) * _ss(80, 30, az) * (z > 0.3)
        out[:, 2] = -0.1 * w
    elif name == 'foreP':
        # a rounder forehead: a broad swell in the middle of it, along the skin's normal
        N = _normals(F, G, P)
        w = np.exp(-((y - 7.86) / 0.2) ** 2 - (x / 0.42) ** 2) * (z > 0.9)
        out = N * (0.1 * w)[:, None]
    elif name == 'cheekHo':
        # the hollow under each cheekbone, between it and the jaw: pressed in along the normal
        N = _normals(F, G, P)
        w = np.exp(-((ax - 0.5) / 0.13) ** 2 - ((y - 6.8) / 0.13) ** 2 - ((z - 1.05) / 0.22) ** 2)
        out = N * (-0.1 * w)[:, None]
    elif name == 'jawH':
        # the corner of the jaw, under each ear, moves up (positive) or down
        w = np.exp(-(((ax - 0.56) / 0.2) ** 2 + ((y - 6.5) / 0.22) ** 2 + ((z - 0.62) / 0.3) ** 2))
        out[:, 1] = 0.1 * w
    elif name == 'eyeDp':
        # the eyeballs, lids and the skin round them move forward (positive) or back as one
        for side, sx in (('l', 1), ('r', -1)):
            idx = sorted({i for f, g in zip(F, G) if g == f'helper-{side}-eye' for i in f})
            c = neu[idx].mean(0); R = np.linalg.norm(neu[idx] - c, axis=1).mean()
            rho = np.linalg.norm((P - c) * [1, 1.15, 1], axis=1)
            out[:, 2] += 0.1 * _ss(2.5 * R, 1.2 * R, rho) * (P[:, 2] > c[2] - 1.5 * R)
    _FIELD[name] = out
    return out

def lip_field(which, target, n, neu):
    """A MakeHuman mouth target kept to one lip: 'up' or 'lo', split at the line where the lips meet."""
    y = neu[:, 1]
    w = _ss(6.655, 6.695, y) if which == 'up' else _ss(6.695, 6.655, y)
    return load_target(target, n) * w[:, None]

def landmarks(P, eyes):
    """Skin vertex indices the creator measures the face's proportions on (Balance thirds and
    the guides): the hairline, brow line, subnasale and menton on the midline, and per eye
    ('l', 'r') the inner and outer corners and the side of the face at eye level.
    P: rest skin positions; eyes: [{'c': centre, 'R': radius}] left then right."""
    mid = np.where((np.abs(P[:, 0]) < 0.01) & (P[:, 2] > 1.0))[0]
    at = lambda y: int(mid[np.argmin(np.abs(P[mid, 1] - y))])
    out = {'hair': at(LM['hair']), 'brow': at(7.52), 'sub': at(6.885), 'ment': at(6.27)}
    for e, side in zip(eyes, ('l', 'r')):
        c, R, sx = np.asarray(e['c']), e['R'], 1 if side == 'l' else -1
        d = np.linalg.norm(P - c, axis=1)
        lid = np.where((d > 0.95 * R) & (d < 1.1 * R) & (P[:, 2] > c[2]))[0]
        band = np.where((np.abs(P[:, 1] - c[1]) < 0.04) & (P[:, 0] * sx > 0) & (P[:, 2] > 0.75))[0]
        out[side] = [int(lid[np.argmin(P[lid, 0] * sx)]), int(lid[np.argmax(P[lid, 0] * sx)]), int(band[np.argmax(P[band, 0] * sx)])]
    return out

def field(name, F, G, neu):
    if name in ('eyeW', 'eyeH'): return eye_field(name, F, G, neu)
    if ':' in name:
        which, t = name.split(':'); return lip_field(which, t, len(neu), neu)
    return prop_field(name, F, G, neu)

def dense_deltas(spec, V, F, G, neu, male, fem):
    n = len(V)
    if not spec: return np.zeros((n, 3))
    if spec == 'MACRO_MALE' or spec == 'MACRO_FEMALE':
        X = male if spec == 'MACRO_MALE' else fem
        d = X - neu
        # keep the base of the neck in place so the bust does not jump
        fs = [f for f, g in zip(F, G) if g == 'joint-neck']; idx = np.unique([i for f in fs for i in f])
        return d - d[idx].mean(0)
    one = lambda t: field(t[0][1:], F, G, neu) * t[1] if t[0].startswith('@') else load_target(t[0], n) * t[1]
    return sum(one(t if isinstance(t, tuple) else (t, 1.0)) for t in spec)

def build(head_npz, out_npz):
    V, F, G = load_obj(); A = HERE + '/'
    neu, male, fem = np.load(A + 'neu.npy'), np.load(A + 'male.npy'), np.load(A + 'fem.npy')
    h = np.load(head_npz)
    bidx, bw = h['bidx'], h['bw']
    out = {}
    for sid, label, grp, neg, pos in SLIDERS:
        for sign, spec in (('-', neg), ('+', pos)):
            D = dense_deltas(spec, V, F, G, neu, male, fem) * GAIN.get(sid, 1.0)
            out[sid + sign] = (D[bidx] * bw[:, :, None]).sum(1)
    np.savez(out_npz, **out)
    return out

if __name__ == '__main__':
    o = build(sys.argv[1], sys.argv[2])
    for k, v in o.items(): print(k, round(float(np.abs(v).max()), 4), int((np.abs(v).max(1) > 0.002).sum()))
