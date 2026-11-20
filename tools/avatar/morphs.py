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
]
# per slider multiplier on the targets ('id' for both ends, 'id-' or 'id+' for one), tuned by
# looking at every slider at both ends, so no end looks alien
GAIN = {'jawW': 1.5, 'jawA': 1.2, 'cheekH': 1.8, 'eyeD': 2.0, 'chinW-': 1.3, 'chinW+': 1.0, 'cheekW-': 1.2, 'cheekW+': 0.9, 'eyeS': 1.5, 'eyeT': 2.4,
        'noseB': 1.8, 'noseT-': 0.8, 'noseT+': 2.0, 'browD-': 1.6, 'browD+': 0.45, 'browH': 1.2,
        'lips-': 1.0, 'lips+': 0.7, 'neck': 2.0, 'noseW': 1.4, 'noseL': 1.3, 'ears': 1.2,
        'lipU': 0.9, 'lipL-': 0.85, 'lipL+': 0.55, 'lipBow': 1.0, 'lipCorner': 0.8, 'eyeIn': 1.3, 'eyeOut': 1.3, 'eyeH-': 0.75, 'eyeH+': 0.6}
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

def dense_deltas(spec, V, F, G, neu, male, fem):
    n = len(V)
    if not spec: return np.zeros((n, 3))
    if spec == 'MACRO_MALE' or spec == 'MACRO_FEMALE':
        X = male if spec == 'MACRO_MALE' else fem
        d = X - neu
        # keep the base of the neck in place so the bust does not jump
        fs = [f for f, g in zip(F, G) if g == 'joint-neck']; idx = np.unique([i for f in fs for i in f])
        return d - d[idx].mean(0)
    one = lambda t: eye_field(t[0][1:], F, G, neu) * t[1] if t[0].startswith('@') else load_target(t[0], n) * t[1]
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
