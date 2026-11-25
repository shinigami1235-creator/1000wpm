"""Builds audio/sfx/*.mp3, the recorded combat sounds (lasers, explosions, impacts).

    python3 tools/sfx/bank.py <cleaned wav folder>

The input folder holds the takes after the game-sfx skill's clean_sfx.py (lead-in cut, levelled to
-18 dB RMS). Sources:
  laserSmall_*, laserLarge_*, explosionCrunch_*, impactMetal_*, forceField_*, lowFrequency_explosion_*
      Kenney, Sci-Fi Sounds 1.0 (www.kenney.nl), CC0
  blast_1, blast_2       Earshot 0.4.1 bank, impact/blast --dur 1.6, seeds 1 and 2 (rendered by us)
  heavymetal_1           Earshot 0.4.1 bank, impact/metal --dur 1.2, seed 1
  glitch_1               Earshot 0.4.1 bank, pro_glitch/crunchy, seed 1
Each set below becomes <set>-<n>.mp3 (mono, 44.1 kHz, 72 kbps), cut to its longest length with a
fade so the tail dies out instead of stopping. js/app/combat/bank.js plays them.
"""
import os, sys, subprocess
import numpy as np
from scipy.io import wavfile

SETS = {   # set: ([takes], longest seconds, fade seconds)
    'pew': ([f'laserSmall_00{i}' for i in range(5)], 0.45, 0.06),
    'laser': ([f'laserLarge_00{i}' for i in range(5)], 0.75, 0.12),
    'crunch': ([f'explosionCrunch_00{i}' for i in range(4)], 1.0, 0.3),
    'boom': (['lowFrequency_explosion_000', 'lowFrequency_explosion_001'], 1.6, 0.4),
    'blast': (['blast_1', 'blast_2'], 1.3, 0.5),
    'thud': ([f'impactMetal_00{i}' for i in range(5)], 0.6, 0.1),
    'field': ([f'forceField_00{i}' for i in range(3)], 0.75, 0.15),
    'clang': (['heavymetal_1'], 0.9, 0.35),
    'glitch': (['glitch_1'], 0.45, 0.05),
}
SR = 44100

def main(src):
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'audio', 'sfx')
    os.makedirs(out, exist_ok=True)
    for name, (takes, longest, fade) in SETS.items():
        for i, t in enumerate(takes, 1):
            sr, x = wavfile.read(os.path.join(src, t + '.wav'))
            assert sr == SR, (t, sr)
            x = x.astype(np.float64) / 32768
            if x.ndim > 1: x = x.mean(axis=1)
            x = x[:int(longest * SR)].copy()
            n = min(len(x), int(fade * SR))
            x[-n:] *= np.linspace(1, 0, n) ** 2
            tmp = os.path.join(out, '_tmp.wav')
            wavfile.write(tmp, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
            path = os.path.join(out, f'{name}-{i}.mp3')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '72k', path], check=True)
            os.remove(tmp)
            print(f'{name}-{i}.mp3  {t}  {len(x) / SR:.2f} s  {os.path.getsize(path) // 1024} KB')

if __name__ == '__main__':
    main(sys.argv[1])
