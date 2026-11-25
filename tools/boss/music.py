"""World Boss music: one loop per phase plus the enrage loop, audio/wb-p1..p4.mp3 and wb-enrage.mp3.

    python3 tools/boss/music.py [p1 p2 p3 p4 enrage]

Heavy and dark: a growling detuned bass, low brass stabs, cinematic booms on the downbeats,
half-time drums that get faster and harder each phase. D phrygian, 140 bpm, 32 bars, so every
loop lines up with the others and js/app/boss-audio.js can crossfade at the same spot in the bar.
Each file holds the loop plus its first second again (playback loops from 0.5 s to 0.5 s + loop).
Built on the synth voices and mixer in tools/rush/music.py, so everything is ours to ship.
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'rush'))
import music as M
from music import SR, hz, saw, sine, lp, hp, bp, env_exp, adsr, kick, snare, clap, Track, master, deg, PHRYG, rng

BPM, BARS, R = 140, 32, 50          # D3
OUT = os.environ.get('WB_OUT') or os.path.join(M.ROOT, 'audio')

# ---------- heavier voices ----------
def reese(m, dur, v=1.0, cut=320, drive=3.0, lfo=0.0, spb=0.43):
    """a growling bass: three detuned saws and a sub, a filter that opens and closes, then driven"""
    n = int(SR * (dur + 0.05)); f = hz(m); t = np.arange(n) / SR
    x = saw(f, n) + saw(f * 1.008, n, 0.33) + saw(f * 0.992, n, 0.66)
    dark, bright = lp(x, cut), lp(x, cut * 4)
    k = 0.5 - 0.5 * np.cos(2 * np.pi * t / (spb * 2)) if lfo else np.zeros(n)
    x = dark + (bright - dark) * k * lfo + 1.2 * sine(f / 2, n)
    x = np.tanh(x * drive) * adsr(n, 0.004, 0.08, 0.9, 0.04, int(dur * SR))
    return lp(x, 2400) * v * 0.42

def stab(ms, dur, v=1.0, cut=700):
    """a low brass hit: a stack of detuned saws with a fast filter snap, driven"""
    n = int(SR * (dur + 0.35)); x = np.zeros(n)
    for m in ms:
        for d in (0.994, 1.0, 1.006): x += saw(hz(m) * d, n, rng.random())
    x /= len(ms) * 2
    e = env_exp(n, 0.1)
    y = lp(x, cut) + (lp(x, cut * 4.5) - lp(x, cut)) * e
    return np.tanh(y * 2.4) * adsr(n, 0.006, 0.2, 0.55, 0.3, int(dur * SR)) * v * 0.42

def growl(m, dur, v=1.0, cut=1800, voices=5):
    """the lead: a low, rough supersaw, no shine on top"""
    n = int(SR * (dur + 0.3)); f = hz(m); x = np.zeros(n)
    for k in range(voices):
        d = 1 + 0.016 * (k - (voices - 1) / 2) / ((voices - 1) / 2)
        x += saw(f * d, n, rng.random())
    x = np.tanh(lp(x / voices ** 0.6, cut) * 2.0)
    return lp(x, cut * 1.3) * adsr(n, 0.02, 0.25, 0.75, 0.25, int(dur * SR)) * v * 0.3

def boom(v=1.0):
    """a cinematic impact: a falling sub, a burst of low noise and a long tail"""
    n = int(SR * 2.6); t = np.arange(n) / SR
    f = 28 + 70 * np.exp(-t * 7)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.8)
    nz = lp(rng.standard_normal(n), 1200) * env_exp(n, 0.3) + hp(rng.standard_normal(n), 3000) * env_exp(n, 0.04) * 0.4
    return np.tanh((sub * 1.3 + nz * 0.6) * 1.6) * v * 0.55

def riser(secs, v=1.0):
    """noise that climbs into the next section"""
    n = int(SR * secs); r = np.linspace(0, 1, n)
    nz = rng.standard_normal(n)
    x = lp(nz, 900) * (1 - r) + bp(nz, 1500, 6000) * r
    tone = saw(1, n) * 0
    f = 60 * 2 ** (r * 3)
    tone = np.tanh(2 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25
    return (lp(x, 4500) * 0.5 + tone) * r ** 2 * v * 0.35

def bigsnare(v=1.0):
    a, c = snare(v * 0.65, tone=160, dec=0.22, bright=4200), clap(v * 0.3)
    a[:len(c)] += c
    return a

def hkick(v=1.0):
    return kick(v, tone=43, punch=1.5, dec=0.26)

M.VOICES.update({'boom': boom, 'bigsnare': bigsnare, 'hkick': hkick})

# ---------- the loops ----------
PROG = [0, 0, 1, 0, 5, 4, 1, 0]          # D D Eb D Bb A Eb D, four bars each

def drums(T, p):
    for b in range(BARS):
        last4, last8 = b % 4 == 3, b % 8 == 7
        if p == 1:          # half time
            T.drum('kick', b * 4, 1.0, tone=43, punch=1.5, dec=0.26); T.drum('kick', b * 4 + 2.5, 0.8, tone=43, punch=1.4)
            T.drum('bigsnare', b * 4 + 2, 1.0)
            for e in range(8): T.drum('hat', b * 4 + e * 0.5, 0.1 + 0.08 * (e % 2), pan=0.25)
        elif p == 2:
            for o, vv in ((0, 1.0), (1.5, 0.6), (2.5, 0.85), (3.25, 0.6)): T.drum('kick', b * 4 + o, vv, tone=43, punch=1.5, dec=0.24)
            T.drum('bigsnare', b * 4 + 2, 1.0)
            for e in range(16): T.drum('hat', b * 4 + e * 0.25, 0.07 + 0.09 * (e % 4 == 2), pan=0.25)
            for q in range(4): T.drum('metal', b * 4 + q + 0.5, 0.3, f=230, pan=-0.3)
        else:               # full time, then harder
            for q in range(4): T.drum('kick', b * 4 + q, 1.0, tone=43, punch=1.5, dec=0.22)
            if p >= 4: T.drum('kick', b * 4 + 3.5, 0.7, tone=43); T.drum('kick', b * 4 + 1.75, 0.5, tone=43)
            T.drum('bigsnare', b * 4 + 1, 0.95); T.drum('bigsnare', b * 4 + 3, 0.95)
            for e in range(16): T.drum('hat', b * 4 + e * 0.25, 0.08 + 0.1 * (e % 4 == 2), pan=0.25 if e % 2 else -0.2)
            for q in range(4): T.drum('metal', b * 4 + q + 0.5, 0.35 if p < 5 else 0.45, f=230 + 30 * (q % 2), pan=-0.3)
            if p == 5:
                for e in range(4): T.drum('snare', b * 4 + 3 + e * 0.25, 0.25 + 0.1 * e, tone=170)
        if last4 and p >= 2 and not last8:
            for k in range(4): T.drum('tom', b * 4 + 3 + k * 0.25, 0.55, f=[130, 110, 90, 75][k])
        if last8 and p >= 3:
            for k in range(8): T.drum('snare', b * 4 + 2 + k * 0.25, 0.3 + 0.08 * k, tone=170, bright=6000)
        if b % 8 == 0 or (p == 5 and b % 4 == 0):
            T.drum('boom', b * 4, 1.0 if p > 1 else 0.85); T.drum('crash', b * 4, 0.3)
        if last8 and p >= 2:
            T.put('fx', b * 4, riser(4 * T.spb, 0.8 + 0.1 * p))

def bassline(T, p):
    for b in range(BARS):
        c = PROG[b // 4]
        r = deg(R - 24, PHRYG, c)
        if p == 1:
            T.note('bass', reese, b * 4, r, 3.8, cut=260, drive=3.2, lfo=0.6, spb=T.spb * 2)
        elif p == 2:
            for e in range(8):
                if e in (3, 7) and b % 2: continue
                T.note('bass', reese, b * 4 + e * 0.5, r + (12 if e in (3, 6) else 0), 0.42, cut=300, drive=3.4, lfo=0.3, spb=T.spb)
        else:
            step = 0.25 if p >= 4 else 0.5
            for e in range(int(4 / step)):
                if p >= 4 and e % 4 == 3: continue
                acc = 1.0 if e % (2 if step == 0.5 else 4) == 0 else 0.7
                m = r + (1 if p == 5 and e % 8 == 6 else 0) + (12 if e % 8 == 5 else 0)
                T.note('bass', reese, b * 4 + e * step, m, step * 0.9, v=acc, cut=340 + 40 * p, drive=3.6 + 0.3 * (p - 3), lfo=0.2, spb=T.spb)

def harmony(T, p):
    for b in range(0, BARS, 4):
        c = PROG[b // 4]
        T.chord(b * 4, [deg(R - 12, PHRYG, c + d) for d in (0, 2, 4)], 16, cut=650 + 100 * p, v=0.55, att=1.4)
    if p >= 2:     # brass stabs: the riff that says "boss"
        for b in range(BARS):
            c = PROG[b // 4]
            ch = [deg(R - 12, PHRYG, c), deg(R - 12, PHRYG, c + 2), deg(R, PHRYG, c)]
            pat = [(0, 0.5), (0.75, 0.5), (1.5, 1.0)] if b % 2 == 0 else [(0, 0.5), (2.5, 0.4), (3, 0.9)]
            for o, ln in pat:
                T.put('music', b * 4 + o, stab(ch, ln * T.spb, v=0.75 if p < 4 else 0.9, cut=600 + 120 * p), 0)
    if p >= 3:     # the lead: slow, low and mean
        mel = [(0, 0, 3), (3, 1, 1), (4, 0, 2), (6, -1, 2), (8, 0, 3), (11, 3, 1), (12, 1, 4)]
        for rep in range(4):
            off = rep * 32 + (16 if p == 3 else 0)
            if p == 3 and rep % 2: continue
            for o, d, ln in mel:
                T.note('music', growl, off + o, deg(R, PHRYG, d), ln * 0.95, v=0.7 + 0.1 * (p - 3), cut=1500 + 300 * (p - 3))
    if p == 5:     # the alarm: a growling half-step siren over everything
        for b in range(0, BARS, 2):
            for k in range(2):
                T.note('music', reese, b * 4 + k * 4, deg(R + 12, PHRYG, k), 3.6, v=0.35, cut=900, drive=2.4, lfo=1.0, spb=T.spb)

PHASES = {'p1': 1, 'p2': 2, 'p3': 3, 'p4': 4, 'enrage': 5}
RENDER = {1: dict(delay_beats=0.75, delay_fb=0.25, verb=0.35, drive=1.5),
          2: dict(delay_beats=0.75, delay_fb=0.25, verb=0.3, drive=1.6),
          3: dict(delay_beats=0.75, delay_fb=0.22, verb=0.28, drive=1.7),
          4: dict(delay_beats=0.5, delay_fb=0.2, verb=0.25, drive=1.85),
          5: dict(delay_beats=0.5, delay_fb=0.2, verb=0.25, drive=2.0)}

if __name__ == '__main__':
    which = sys.argv[1:] or list(PHASES)
    for name in which:
        p = PHASES[name]
        T = Track(BPM, BARS)
        drums(T, p); bassline(T, p); harmony(T, p)
        x = T.render(**RENDER[p])
        x = np.concatenate([x, x[:SR]])          # the loop plus its first second again
        path = os.path.join(OUT, f'wb-{name}.mp3')
        meas = master(x, path)
        print(f'wb-{name}: {T.L / SR:.3f} s loop, {os.path.getsize(path) // 1024} KB, {" ".join(meas)}', flush=True)
