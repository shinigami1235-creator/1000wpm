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
  ('lips', 'Lip fullness', 'Mouth', ['mouth/mouth-upperlip-volume-decr', 'mouth/mouth-lowerlip-volume-decr'], ['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-lowerlip-volume-incr']),
  ('mouthW', 'Mouth width', 'Mouth', ['mouth/mouth-scale-horiz-decr'], ['mouth/mouth-scale-horiz-incr']),
  ('ears', 'Ear size', 'Face', LR('ears/X-ear-scale-decr'), LR('ears/X-ear-scale-incr')),
  ('neck', 'Neck thickness', 'Face', ['neck/neck-scale-horiz-decr', 'neck/neck-scale-depth-decr'], ['neck/neck-scale-horiz-incr', 'neck/neck-scale-depth-incr']),
]
GAIN = {}   # per slider multiplier on the target, tuned after review

def dense_deltas(spec, V, F, G, neu, male, fem):
    n = len(V)
    if spec == 'MACRO_MALE' or spec == 'MACRO_FEMALE':
        X = male if spec == 'MACRO_MALE' else fem
        d = X - neu
        # keep the base of the neck in place so the bust does not jump
        fs = [f for f, g in zip(F, G) if g == 'joint-neck']; idx = np.unique([i for f in fs for i in f])
        return d - d[idx].mean(0)
    if isinstance(spec[0], tuple): return sum(load_target(t, n) * g for t, g in spec)
    return sum(load_target(t, n) for t in spec)

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
