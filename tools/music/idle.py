"""Idle music for the quiet pages: a light cyber loop for the hangar and another for the operator page.

    python3 tools/music/idle.py [hangar|operator ...]     writes audio/hangar.mp3 and audio/operator.mp3

Everything is synthesised with the same voices as the Boss Rush music (tools/rush/music.py), so the
tracks are ours to ship. Each loop is 32 bars with its tail folded back to the start, so it repeats
without a seam. The pages play them quieter than the fight music (js/app/idle-audio.js).

  hangar    96 bpm, C major. A bright, bouncy workshop loop: soft kick, rim clicks, a plucky arp and
            little bot-like blips, so it suits the bots being built and fussed over.
  operator  84 bpm, D minor. A cooler ops-room loop: half-time drums, a sub bass, glassy bells and a
            soft lead in the second half, for the page where you dress your operator.
"""
import os, sys, importlib.util
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('rushmusic', os.path.join(HERE, '..', 'rush', 'music.py'))
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
Track, pad, pluck, bass, bell, lead, chirp, sine, env_exp, SR, OUT = M.Track, M.pad, M.pluck, M.bass, M.bell, M.lead, M.chirp, M.sine, M.env_exp, M.SR, M.OUT
rng = np.random.default_rng(11)

def soft_bass(m, dur, v=1.0):
    """a round sine bass with a little click, for the idle loops"""
    n = int(dur * SR)
    f = M.hz(m)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t)
    e = np.minimum(1, t / 0.008) * np.exp(-t / max(0.12, dur * 0.7))
    return x * e * v * 0.55

def blip(m, v=1.0, up=True):
    """a short bot-like blip: a square that slides up (or down) a fifth"""
    n = int(SR * 0.09); t = np.arange(n) / SR
    f = M.hz(m) * (1 + (0.5 if up else -0.33) * t / 0.09)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 + np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5
    return M.lp(x, 3200) * env_exp(n, 0.03) * v * 0.18

def hangar():
    T = Track(96, bars=32)
    # Cmaj7 - Am9 - Fmaj7 - G6, two bars each
    prog = [(48, [60, 64, 67, 71]), (45, [57, 60, 64, 67, 71]), (41, [57, 60, 64, 65]), (43, [55, 59, 62, 64])]
    for bar in range(32):
        root, ch = prog[(bar // 2) % 4]
        b0 = bar * 4
        sec = bar // 8   # 0 intro-ish, 1 bells, 2 full, 3 bells and fills
        if bar % 2 == 0: T.chord(b0, ch, 8, v=0.5, cut=1300, att=0.6)
        # bass: root on 1, a bounce on the and of 2, the fifth on 4
        if sec > 0 or bar >= 4:
            T.put('bass', b0, soft_bass(root, T.spb * 1.2, 0.9))
            T.put('bass', b0 + 1.5, soft_bass(root + 12, T.spb * 0.45, 0.45))
            T.put('bass', b0 + 3, soft_bass(root + 7, T.spb * 0.8, 0.6))
        # the arp: chord tones up then down in eighths, quiet, swinging a little
        tones = ch + [ch[1] + 12]
        order = [0, 1, 2, 3, 4, 3, 2, 1]
        for i, k in enumerate(order):
            sw = 0.06 if i % 2 else 0
            T.note('music', pluck, b0 + i * 0.5 + sw, tones[k % len(tones)] + 12, 0.4, pan=-0.35 if i % 2 else 0.35, v=0.32, cut=1400, env_amt=3000, dec=0.07, pw=0.35)
        # drums
        if sec >= 1 or bar >= 4:
            T.drum('kick', b0, 0.55); T.drum('kick', b0 + 2.5 if bar % 4 == 3 else b0 + 2, 0.45)
        if sec >= 1:
            for b in (1, 3): T.drum('snare', b0 + b, 0.22, tone=320, dec=0.06, bright=5200)
        for i in range(8):
            T.drum('hat', b0 + i * 0.5 + (0.05 if i % 2 else 0), 0.16 if i % 2 else 0.22, pan=0.3)
        if sec == 2 and bar % 2 == 1: T.drum('ohat', b0 + 3.5, 0.12, pan=-0.3)
        # bells: a little pentatonic tune in sections 1 and 3
        if sec in (1, 3):
            pent = [72, 74, 76, 79, 81, 84]
            for j, (b, d) in enumerate([(0, 1), (1.5, 0.5), (2, 1.5)] if bar % 2 == 0 else [(0.5, 0.5), (1, 1), (3, 1)]):
                m = pent[(bar * 3 + j * 2) % len(pent)]
                T.note('music', bell, b0 + b, m, d * 2, pan=0.15, v=0.55, dec=0.5)
        # bot blips now and then
        if bar % 4 == 1:
            for k in range(rng.integers(2, 4)):
                T.put('fx', b0 + 2.25 + k * 0.25, blip(84 + int(rng.integers(0, 5)) * 2, 0.9, up=bool(k % 2 == 0)), pan=float(rng.uniform(-0.6, 0.6)))
    return T.render(delay_beats=0.75, delay_fb=0.3, verb=0.3, duck=0.35, drive=1.0)

def operator():
    T = Track(84, bars=32)
    # Dm9 - Bbmaj7 - Gm9 - A7sus4, two bars each
    prog = [(38, [62, 65, 69, 72, 76]), (34, [58, 62, 65, 69]), (31, [55, 58, 62, 65, 69]), (33, [57, 62, 64, 67])]
    for bar in range(32):
        root, ch = prog[(bar // 2) % 4]
        b0 = bar * 4
        sec = bar // 8
        if bar % 2 == 0: T.chord(b0, ch, 8, v=0.55, cut=900 + 300 * (sec % 2), att=0.9)
        # sub bass, long notes with a pickup
        if bar % 2 == 0: T.put('bass', b0, soft_bass(root, T.spb * 5.5, 1.0))
        else: T.put('bass', b0 + 3.5, soft_bass(root + (2 if bar % 4 == 1 else -2), T.spb * 0.5, 0.5))
        # glassy bells: a slow arpeggio, every other note an octave up
        for i in range(6):
            m = ch[(i * 2 + bar) % len(ch)] + (12 if i % 2 else 0)
            T.note('music', bell, b0 + i * (4 / 6), m, 1.2, pan=-0.4 + 0.16 * i, v=0.38, dec=0.8)
        # half-time drums from the second section
        if sec >= 1:
            T.drum('kick', b0, 0.6)
            if bar % 2 == 1: T.drum('kick', b0 + 2.75, 0.4)
            T.drum('clap', b0 + 2, 0.22)
        for i in range(16):
            if sec == 0 and i % 2: continue
            T.drum('hat', b0 + i * 0.25, [0.14, 0.05, 0.09, 0.05][i % 4], pan=-0.25)
        # a soft lead in the third section
        if sec == 2:
            line = [(0, 69, 1.5), (1.5, 72, 0.5), (2, 74, 2)] if bar % 2 == 0 else [(0, 72, 1), (1, 69, 1), (2, 67, 2)]
            for b, m, d in line:
                T.note('music', lead, b0 + b, m - 12 + (2 if (bar // 2) % 4 == 3 else 0), d, pan=0.1, v=0.22, voices=3, detune=0.008, cut=1700, vib=0.004, wave='tri')
        # a radio blip at the end of every eighth bar
        if bar % 8 == 7: T.put('fx', b0 + 3.5, chirp(93, 0.5), pan=0.5)
    return T.render(delay_beats=1.5, delay_fb=0.38, verb=0.42, duck=0.25, drive=1.0)

if __name__ == '__main__':
    want = sys.argv[1:] or ['hangar', 'operator']
    for name in want:
        x = {'hangar': hangar, 'operator': operator}[name]()
        path = os.path.join(OUT, name + '.mp3')
        print(name, M.master(x, path), f'{len(x) / SR:.1f}s', os.path.getsize(path) // 1024, 'KB')
