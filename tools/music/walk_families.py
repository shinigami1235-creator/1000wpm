"""Listening mixes for the Superboss and Boss Rush music, crossfaded the way their pages do it.

    python3 tools/music/walk_families.py superboss|rush out.mp3

Superboss (js/app/sb-audio.js): each phase change fades the new loop in over 1.2 s from 0.5 s into its file
while the old one fades out; each boss runs phase 1, 2 and 3, and the last ends on the victory sting.
Boss Rush (js/app/rush/audio.js): the whole-file loops crossfade over 1.2 s; between bosses the sting plays
(its first 3.6 s) with the music ducked.
"""
import os, sys, subprocess
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import engine as E
SR = E.SR
AU = os.path.join(ROOT, 'audio')

def loop_seg(name, secs, start=0.0, loop=None):
    x = E.read_audio(os.path.join(AU, name + '.mp3'))
    a, L = loop if loop else (0.0, len(x) / SR)
    t = start + np.arange(int(secs * SR)) / SR
    t = np.where(t < a + L, t, a + (t - a) % L)
    return x[np.minimum((t * SR).astype(int), len(x) - 1)]

def xfade(parts, fade=1.2, power=False):
    out = parts[0]
    n = int(fade * SR)
    for p in parts[1:]:
        if power:     # sb-audio.js since 29 Nov 2026: quarter-sine in, quarter-cosine out
            u = np.linspace(0, 1, n)[:, None]; mid = out[-n:] * np.cos(u * np.pi / 2) + p[:n] * np.sin(u * np.pi / 2)
        else:
            k = np.exp(np.linspace(np.log(1e-4), 0, n))[:, None]
            mid = out[-n:] * k[::-1] + p[:n] * k
        out = np.concatenate([out[:-n], mid, p[n:]])
    return out

def superboss():
    loops = {'hydra': (32, 140), 'compiler': (32, 132), 'leviathan': (48, 174)}
    parts = []
    for b, (bars, bpm) in loops.items():
        for ph in (1, 2, 3):
            parts.append(loop_seg(f'sb-{b}-{ph}', 24.0, 0.5, (0.5, bars * 240 / bpm)))
    y = xfade(parts, power=True)
    win = E.read_audio(os.path.join(AU, 'wb-win.mp3'))
    y[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))[:, None]
    y = np.concatenate([y, np.zeros((int(0.7 * SR), 2)), win])
    return y, [f'{k * 3 * 22.8:.0f} s {b} phases 1-3' for k, b in enumerate(loops)]

def rush():
    from rush import BOSSES
    out = []
    win = E.read_audio(os.path.join(AU, 'wb-win.mp3'))[:int(3.6 * SR)]
    win[-int(1.0 * SR):] *= np.linspace(1, 0, int(1.0 * SR))[:, None]
    for b in BOSSES:
        parts = [loop_seg(f'rush-{b}-{ph}', 13.0) for ph in (1, 2, 3)]
        y = xfade(parts)
        y[-int(0.4 * SR):] *= np.linspace(1, 0.25, int(0.4 * SR))[:, None]
        out += [y, win * 0.85]
    return np.concatenate(out), list(BOSSES)

if __name__ == '__main__':
    kind, path = sys.argv[1], sys.argv[2]
    y, marks = superboss() if kind == 'superboss' else rush()
    y = E.limit(y, -1.0)
    tmp = path + '.wav'; E.write_wav(tmp, y)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-b:a', '160k', path], check=True); os.remove(tmp)
    print(path, round(len(y) / SR, 1), 's', E.measure(path), marks)
