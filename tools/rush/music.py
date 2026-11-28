"""Boss Rush music: one original loop per boss, rendered at three speeds, one per phase.

    python3 tools/rush/music.py [boss ...]      writes audio/rush-<boss>-<phase>.mp3

Everything is synthesised here with numpy (no samples, no soundfonts), so the tracks are
ours to ship. Each loop is 16 bars. Phase 2 plays faster and adds the lead; phase 3 plays
faster again with busier drums and a brighter, harder mix. Loops are rendered with their
tails folded back to the start, so they repeat without a seam. Loudness is matched to the
site's other music (about -16.5 LUFS, true peak under -3 dBFS).
"""
import os, sys, subprocess, tempfile, json
import numpy as np
from scipy.signal import lfilter, butter, fftconvolve

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'audio')
rng = np.random.default_rng(7)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def env_exp(n, decay_s): return np.exp(-np.arange(n) / SR / max(1e-4, decay_s))
def adsr(n, a, d, s, r, hold):
    """hold = samples before release"""
    e = np.zeros(n)
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    h = max(1, hold)
    t = np.arange(n)
    e = np.where(t < A, t / max(1, A), np.where(t < A + D, 1 - (1 - s) * (t - A) / max(1, D), s))
    rel = t >= h
    lvl = e[min(h, n - 1)] if h < n else s
    e[rel] = lvl * np.maximum(0, 1 - (t[rel] - h) / max(1, R))
    return e
def lp(x, fc, order=2):
    fc = min(fc, SR * 0.45)
    b, a = butter(order, fc / (SR / 2), 'low'); return lfilter(b, a, x)
def hp(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), 'high'); return lfilter(b, a, x)
def bp(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], 'band'); return lfilter(b, a, x)
def saw(f, n, ph=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f + ph) % 1.0) - 1
def sq(f, n, pw=0.5):
    t = np.arange(n) / SR
    return np.where((t * f) % 1.0 < pw, 1.0, -1.0)
def tri(f, n):
    return 2 * np.abs(saw(f, n)) - 1
def sine(f, n, ph=0.0):
    return np.sin(2 * np.pi * (np.arange(n) / SR * f + ph))

# ---------- drums ----------
def kick(v=1.0, tone=48, punch=1.0, dec=0.2):
    n = int(SR * 0.5)
    t = np.arange(n) / SR
    f = tone + (tone * 3.2 * punch) * np.exp(-t * 38)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, dec)
    x += 0.35 * hp(rng.standard_normal(n), 2000) * env_exp(n, 0.004)
    return np.tanh(x * 1.6) * v * 0.7
def snare(v=1.0, tone=190, dec=0.16, bright=3600):
    n = int(SR * 0.35)
    x = 0.5 * sine(tone, n) * env_exp(n, 0.05) + 0.9 * bp(rng.standard_normal(n), 1200, bright) * env_exp(n, dec)
    return np.tanh(x * 1.4) * v * 0.8
def clap(v=1.0):
    n = int(SR * 0.3)
    nz = bp(rng.standard_normal(n), 900, 4200)
    e = np.zeros(n)
    for k, o in enumerate([0, 0.011, 0.022]): s = int(o * SR); e[s:] += env_exp(n - s, 0.008 if k < 2 else 0.12)
    return nz * e * v * 1.2
def hat(v=1.0, dec=0.035):
    n = int(SR * max(0.08, dec * 4))
    x = hp(rng.standard_normal(n), 8500) * env_exp(n, dec)
    return x * v * 0.38
def metal(v=1.0, f=320):
    n = int(SR * 0.4)
    x = sum(sine(f * r, n) * a for r, a in [(1, 1), (2.76, 0.6), (5.4, 0.4), (8.93, 0.25)]) * env_exp(n, 0.09)
    return x * v * 0.35
def tom(v=1.0, f=110):
    n = int(SR * 0.4); t = np.arange(n) / SR
    ff = f * (1 + 0.6 * np.exp(-t * 30))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * env_exp(n, 0.2) * v
def crash(v=1.0):
    n = int(SR * 1.6)
    return hp(rng.standard_normal(n), 6000) * env_exp(n, 0.5) * v * 0.25

# ---------- tonal voices ----------
def bass(m, dur, v=1.0, wave='saw', cut=300, env_amt=1500, dec=0.12, drive=1.5):
    cut = cut * 1.6
    n = int(SR * (dur + 0.05))
    f = hz(m)
    osc = (saw(f, n) + 0.5 * saw(f * 1.004, n)) if wave == 'saw' else sq(f, n, 0.45) if wave == 'sq' else (0.7 * saw(f, n) + sine(f / 2, n))
    osc += 0.6 * sine(f, n)
    dark, bright = lp(osc, cut), lp(osc, cut + env_amt)
    e = env_exp(n, dec)
    x = dark + (bright - dark) * e
    x = np.tanh(x * drive) * adsr(n, 0.003, 0.05, 0.85, 0.03, int(dur * SR))
    return x * v * 0.5
def pluck(m, dur, v=1.0, wave='sq', cut=800, env_amt=5000, dec=0.09, pw=0.3):
    env_amt = env_amt * 0.45
    n = int(SR * (dur + 0.2))
    f = hz(m)
    osc = sq(f, n, pw) if wave == 'sq' else saw(f, n) if wave == 'saw' else tri(f, n)
    dark, bright = lp(osc, cut), lp(osc, cut + env_amt)
    e = env_exp(n, dec)
    return (dark + (bright - dark) * e) * env_exp(n, max(0.08, dur * 0.9)) * v * 0.32
def lead(m, dur, v=1.0, voices=5, detune=0.012, cut=3500, vib=0.0, wave='saw', glide_from=None):
    n = int(SR * (dur + 0.25))
    t = np.arange(n) / SR
    f0 = hz(m)
    f = np.full(n, f0)
    if glide_from is not None: f = f0 + (hz(glide_from) - f0) * np.exp(-t * 40)
    if vib: f = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) * 4, 0, 1))
    x = np.zeros(n)
    for k in range(voices):
        d = 1 + detune * (k - (voices - 1) / 2) / max(1, (voices - 1) / 2)
        ph = np.cumsum(f * d) / SR + rng.random()
        x += (2 * (ph % 1.0) - 1) if wave == 'saw' else np.where(ph % 1.0 < 0.5, 1.0, -1.0)
    x /= voices ** 0.6
    x = lp(x, cut * 0.7) * adsr(n, 0.01, 0.15, 0.7, 0.18, int(dur * SR))
    return x * v * 0.3
def pad(ms, dur, v=1.0, cut=1600, att=0.35):
    n = int(SR * (dur + 0.6))
    x = np.zeros(n)
    for m in ms:
        for d in (0.994, 1.0, 1.006):
            x += saw(hz(m) * d, n, rng.random())
    x = lp(x / (len(ms) * 2.2), cut) * adsr(n, att, 0.3, 0.8, 0.55, int(dur * SR))
    return x * v * 0.3
def bell(m, dur, v=1.0, dec=0.6):
    n = int(SR * (dur + dec * 3))
    f = hz(m)
    x = sine(f, n) + 0.5 * sine(f * 2, n) * env_exp(n, dec * 0.4) + 0.25 * sine(f * 3.01, n) * env_exp(n, dec * 0.25)
    return x * env_exp(n, dec) * v * 0.3
def chirp(m, v=1.0):
    n = int(SR * 0.12); t = np.arange(n) / SR
    f = hz(m) * (1 + 1.5 * t / 0.12)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.05) * v * 0.25

VOICES = {'kick': kick, 'snare': snare, 'clap': clap, 'hat': hat, 'ohat': lambda v=1.0: hat(v, 0.18), 'metal': metal, 'tom': tom, 'crash': crash}

# ---------- a track ----------
class Track:
    def __init__(self, bpm, bars=16):
        self.bpm, self.bars = bpm, bars
        self.spb = 60.0 / bpm
        self.L = int(round(bars * 4 * self.spb * SR))
        self.tail = int(SR * 3.5)
        self.bus = {k: np.zeros((self.L + self.tail, 2)) for k in ('drums', 'bass', 'music', 'pad', 'fx')}
        self.kicks = []
    def put(self, bus, beat, x, pan=0.0, gain=1.0):
        s = int(round(beat * self.spb * SR))
        if s >= self.L: s -= self.L
        n = min(len(x), self.L + self.tail - s)
        if n <= 0: return
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.bus[bus][s:s + n, 0] += x[:n] * l * gain * 1.414
        self.bus[bus][s:s + n, 1] += x[:n] * r * gain * 1.414
    def drum(self, name, beat, v=1.0, pan=0.0, **kw):
        if name == 'kick': self.kicks.append(beat)
        self.put('drums', beat, VOICES[name](v, **kw) if kw else VOICES[name](v), pan)
    def note(self, bus, fn, beat, m, dur_beats, pan=0.0, **kw):
        self.put(bus, beat, fn(m, dur_beats * self.spb, **kw), pan)
    def chord(self, beat, ms, dur_beats, **kw):
        self.put('pad', beat, pad(ms, dur_beats * self.spb, **kw), 0)
    def render(self, delay_beats=0.75, delay_fb=0.35, verb=0.25, duck=0.6, drive=1.0):
        B = self.bus
        # ping-pong delay on the music bus
        d = int(delay_beats * self.spb * SR)
        m = B['music']
        out = m.copy()
        tap = m.copy()
        for k in range(1, 5):
            tap = np.roll(tap, d, axis=0) * delay_fb
            tap[:d] = 0
            out[:, (k % 2)] += tap[:, k % 2] * 0.9
        B['music'] = out
        # a plain reverb: a decaying noise impulse on pad and music
        ir_n = int(SR * 1.8)
        ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / SR / 0.45)[:, None]
        ir /= np.sqrt((ir ** 2).sum(axis=0))
        wet_in = lp(B['pad'] + B['music'] * 0.6, 6000)
        wet = np.stack([fftconvolve(wet_in[:, c], ir[:, c])[:len(wet_in)] for c in range(2)], axis=1)
        # sidechain: pad and bass dip under each kick
        sc = np.ones(self.L + self.tail)
        for b in self.kicks:
            s = int(round(b * self.spb * SR)) % self.L
            n = int(0.22 * SR)
            curve = 1 - duck * np.exp(-np.arange(n) / SR / 0.07)
            e = min(n, len(sc) - s); sc[s:s + e] = np.minimum(sc[s:s + e], curve[:e])
            if s + n > self.L:   # wraps into the loop start
                w = s + n - self.L; sc[:w] = np.minimum(sc[:w], curve[n - w:])
        bassb = hp(B['bass'].T, 38).T
        mix = (B['drums'] * 0.9 + bassb * sc[:, None] * 0.62 + B['music'] * 1.45 + B['pad'] * sc[:, None] * 1.15
               + B['fx'] * 1.0 + wet * verb * sc[:, None])
        # fold the tail back onto the start, so the loop has no seam
        full = mix[:self.L].copy()
        full[:self.tail] += mix[self.L:self.L + self.tail]
        full = hp(full.T, 30).T
        # tame the lows and lift the presence a little, so it reads on laptop speakers
        full = full - 0.5 * lp(full.T, 110).T + 0.2 * bp(full.T, 500, 1800).T
        full = lp(full.T, 9000, 1).T * 0.6 + lp(full.T, 5200, 1).T * 0.4
        full = np.tanh(full * drive) / np.tanh(drive)
        return full

def master(x, path):
    """normalise to about -16.5 LUFS with the true peak under -3 dBFS, then write an mp3"""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        import wave
        def write(y):
            y = np.clip(y, -1, 1)
            with wave.open(wav, 'wb') as w:
                w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
                w.writeframes((y * 32767).astype('<i2').tobytes())
        peak = np.abs(x).max()
        write(x / peak * 0.5)
        r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
        lufs = float([l for l in r.splitlines() if l.strip().startswith('I:')][-1].split()[1])
        gain = 10 ** ((-16.5 - lufs) / 20) * 0.5 / peak
        y = x * gain
        # a soft limiter for whatever pokes over -3.5 dBFS
        ceil = 10 ** (-3.5 / 20)
        y = np.where(np.abs(y) > ceil * 0.8, np.sign(y) * (ceil * 0.8 + (ceil * 0.2) * np.tanh((np.abs(y) - ceil * 0.8) / (ceil * 0.2))), y)
        write(y)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '112k', path], check=True)
        r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
        lines = [l.strip() for l in r.splitlines() if l.strip().startswith(('I:', 'Peak:'))]
        return lines[-2:]

# ---------- the six bosses ----------
# Each writer gets the Track and the phase (1, 2, 3) and lays down 16 bars.
# Scales are given as semitones from the root.
MINOR = [0, 2, 3, 5, 7, 8, 10]
PHRYG = [0, 1, 3, 5, 7, 8, 10]
DORIAN = [0, 2, 3, 5, 7, 9, 10]
def deg(root, scale, d, octv=0):
    return root + scale[d % len(scale)] + 12 * (d // len(scale) + octv)

def four_floor(T, p, bars, hats=True, clap_on=(1, 3), open_hat=True, k_tone=48):
    for b in range(bars):
        for q in range(4):
            T.drum('kick', b * 4 + q, 1.0, tone=k_tone)
            if q in clap_on: T.drum('clap' if p < 3 else 'snare', b * 4 + q, 0.8)
            if hats:
                T.drum('hat', b * 4 + q + 0.5, 0.55 if open_hat else 0.45, pan=0.2)
                if p >= 2: T.drum('hat', b * 4 + q + 0.25, 0.25, pan=-0.2); T.drum('hat', b * 4 + q + 0.75, 0.25, pan=-0.2)
        if p == 3 and b % 4 == 3:
            for k in range(4): T.drum('snare', b * 4 + 3 + k * 0.25, 0.35 + k * 0.12)
        if b % 8 == 0: T.drum('crash', b * 4, 0.6 if p > 1 else 0.35)

def spam(T, p):
    # dark electro: a driven octave bass, low saw arps and a mean square hook. F# minor
    R = 54; S = MINOR
    prog = [0, 5, 2, 6]   # i VI III VII
    four_floor(T, p, 16)
    for b in range(16):
        c = prog[(b // 2) % 4]
        root = deg(R - 12, S, c)
        for e in range(8):
            if e in (3, 6) and b % 2: continue
            T.note('bass', bass, b * 4 + e * 0.5, root + (12 if e % 2 else 0), 0.42, wave='sq', cut=260, env_amt=1800)
        chord = [deg(R, S, c), deg(R, S, c + 2), deg(R, S, c + 4)]
        if b % 2 == 0: T.chord(b * 4, chord, 8, cut=1300, v=0.7)
        arp = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[1], chord[0] + 12, chord[2]]
        for k in range(8): T.note('music', pluck, b * 4 + k * 0.5, arp[k], 0.45, pan=0.3 if k % 2 else -0.3, v=0.5, wave='saw', cut=600, env_amt=3000)
    if p >= 2:
        hook = [(0, 7, 1), (1, 5, 0.5), (1.5, 4, 0.5), (2, 2, 1.5), (4, 0, 0.5), (4.5, 2, 0.5), (5, 4, 1), (6, 5, 2)]
        for rep in range(2):
            for o, d, ln in hook:
                T.note('music', lead, rep * 32 + 16 + o * 2, deg(R, S, d), ln * 2, v=0.8 if p == 3 else 0.65, wave='saw', voices=5, cut=2600 if p == 3 else 2000)

def sign(T, p):
    # neon city-pop / synthwave: gated chords, a funky bass and a bright lead. E minor, 7ths
    R = 52; S = DORIAN
    prog = [[0, 2, 4, 6], [5, 7, 9, 11], [3, 5, 7, 9], [4, 6, 8, 10]]
    for b in range(16):
        T.drum('kick', b * 4, 1.0, tone=52); T.drum('kick', b * 4 + 2.5, 0.8, tone=52)
        if p >= 2: T.drum('kick', b * 4 + 1.75, 0.5, tone=52)
        T.drum('snare', b * 4 + 1, 0.85, tone=210); T.drum('snare', b * 4 + 3, 0.85, tone=210)
        for e in range(8 if p < 3 else 16):
            step = 0.5 if p < 3 else 0.25
            T.drum('hat', b * 4 + e * step, 0.35 + 0.2 * (e % 2 == 0), pan=0.25)
        if b % 8 == 0: T.drum('crash', b * 4, 0.5)
        ch = prog[(b // 2) % 4]
        notes = [deg(R, S, d) for d in ch]
        for s in (0, 0.75, 1.5, 2.5, 3.25):   # gated stabs
            T.note('music', pluck, b * 4 + s, notes[0], 0.3, v=0.35, wave='saw', cut=1500, env_amt=3000, dec=0.12)
            for nn in notes[1:]: T.note('music', pluck, b * 4 + s, nn, 0.3, v=0.25, wave='saw', cut=1500, env_amt=3000, dec=0.12, pan=0.2)
        r = deg(R - 24, S, ch[0])
        for o, m, ln in [(0, 0, 0.4), (0.75, 12, 0.2), (1, 0, 0.4), (1.75, 7, 0.2), (2, 10, 0.4), (2.75, 12, 0.2), (3, 7, 0.4), (3.5, 5, 0.4)]:
            T.note('bass', bass, b * 4 + o, r + m, ln, wave='saw', cut=380, env_amt=2400, dec=0.08)
        if b % 2 == 0: T.chord(b * 4, [n + 12 for n in notes], 8, cut=2200, v=0.4, att=0.6)
    if p >= 2:
        mel = [(0, 4, 1), (1, 6, 0.5), (1.5, 7, 1.5), (3, 6, 0.5), (3.5, 4, 0.5), (4, 9, 2), (6, 8, 1), (7, 7, 1),
               (8, 4, 1), (9, 6, 0.5), (9.5, 7, 1.5), (11, 9, 1), (12, 11, 1.5), (13.5, 9, 0.5), (14, 7, 2)]
        for rep in range(2):
            for o, d, ln in mel:
                T.note('music', lead, rep * 32 + o * 2, deg(R + 12, S, d), ln * 2 * 0.9, v=0.7, voices=5, detune=0.01, vib=0.006, cut=5000 if p == 3 else 3800)

def announcer(T, p):
    # driving techno with a station chime: a rolling 16th bass and a three-note PA call. B minor
    R = 47; S = MINOR
    four_floor(T, p, 16, clap_on=(1, 3), k_tone=46)
    for b in range(16):
        r = deg(R - 12, S, [0, 0, 5, 3][(b // 4) % 4])
        for e in range(16):
            if e % 4 == 0: continue
            T.note('bass', bass, b * 4 + e * 0.25, r + (12 if e % 8 == 6 else 0), 0.22, v=0.8, wave='saw', cut=220, env_amt=1200 + 300 * p, dec=0.05)
        if b % 4 == 0: T.chord(b * 4, [deg(R, S, d) for d in (0, 2, 4, 6)], 16, cut=900 + 300 * p, v=0.55, att=1.2)
        # the PA call: a falling three-note saw call every four bars, echoed by the delay
        if b % 4 == 3:
            for k, d in enumerate((4, 2, 0)): T.note('music', pluck, b * 4 + 2 + k * 0.5, deg(R + 12, S, d), 0.5, v=0.6, wave='saw', cut=900, env_amt=3000, dec=0.15, pan=[-0.4, 0, 0.4][k])
        for e in range(4):   # an off-beat stab
            T.note('music', pluck, b * 4 + e + 0.5, deg(R + 12, S, [0, 4, 2, 4][e]), 0.2, v=0.3 if p == 1 else 0.45, wave='saw', cut=900, env_amt=4000, dec=0.06)
    if p >= 2:
        mel = [0, 4, 3, 2, 0, -1, 0, 2]
        for b in range(8, 16):
            T.note('music', lead, b * 4, deg(R + 12, S, mel[b - 8]), 3.5, v=0.6, voices=5, detune=0.014, vib=0.004, cut=2600 + 1000 * (p - 2))
    if p == 3:
        for b in range(16):
            for e in range(4): T.drum('tom', b * 4 + 3 + e * 0.25, 0.3, f=90 + e * 20) if b % 4 == 3 else None

def press(T, p):
    # industrial: clanking metal, a distorted bass on every eighth and mechanical 16ths. D phrygian
    R = 50; S = PHRYG
    for b in range(16):
        for q in range(4):
            T.drum('kick', b * 4 + q, 1.0, tone=44, punch=1.3)
            T.drum('metal', b * 4 + q + 0.5, 0.6, pan=0.3, f=300 + 40 * (q % 2))
        T.drum('snare', b * 4 + 1, 0.9, tone=170, bright=7000); T.drum('snare', b * 4 + 3, 0.9, tone=170, bright=7000)
        for e in range(16): T.drum('hat', b * 4 + e * 0.25, 0.22 + 0.25 * (e % 4 == 2), pan=-0.3)
        if p >= 2:
            for e in (3.25, 3.5, 3.75): T.drum('metal', b * 4 + e, 0.4, f=520, pan=-0.4)
        if b % 8 == 0: T.drum('crash', b * 4, 0.5)
        r = deg(R - 24, S, [0, 0, 1, 0, 5, 4, 1, 0][b % 8])
        for e in range(8):
            T.note('bass', bass, b * 4 + e * 0.5, r + (12 if e in (3, 7) else 0), 0.4, wave='saw', cut=180, env_amt=900, dec=0.06, drive=3.5)
        for e in range(16):   # the machine's 16ths
            T.note('music', pluck, b * 4 + e * 0.25, deg(R + 12, S, [0, 0, 3, 0, 1, 0, 4, 2][e % 8]), 0.2, v=0.22 + 0.1 * (p - 1), wave='sq', cut=500, env_amt=2500, dec=0.04, pan=0.15)
        if b % 4 == 0: T.chord(b * 4, [deg(R, S, d) for d in (0, 2, 4)], 16, cut=700, v=0.5, att=0.8)
    if p >= 2:
        for rep in range(4):
            for o, d, ln in [(0, 4, 1.5), (1.5, 5, 0.5), (2, 4, 1), (3, 1, 1)]:
                T.note('music', lead, rep * 16 + 8 + o * 2, deg(R + 12, S, d), ln * 2, v=0.6, wave='sq', voices=3, cut=2200 + 1200 * (p - 2))

def correction(T, p):
    # dark and dramatic: a staccato ostinato, half-time drums, a choir-like pad. C minor
    R = 48; S = MINOR
    prog = [0, 5, 3, 4]
    for b in range(16):
        T.drum('kick', b * 4, 1.0, tone=42); T.drum('kick', b * 4 + 1.5, 0.7, tone=42)
        if p >= 2: T.drum('kick', b * 4 + 2.5, 0.8, tone=42)
        T.drum('snare', b * 4 + 2, 1.0, tone=180, dec=0.22)
        if p == 3: T.drum('snare', b * 4 + 3.75, 0.4)
        for e in range(8 if p == 1 else 16):
            st = 0.5 if p == 1 else 0.25
            T.drum('hat', b * 4 + e * st, 0.3 + 0.15 * (e % 2 == 0), pan=0.2)
        if b % 4 == 0: T.drum('crash', b * 4, 0.55)
        if b % 4 == 3: [T.drum('tom', b * 4 + 2 + k * 0.5, 0.5, f=[150, 120, 100, 80][k]) for k in range(4)]
        c = prog[(b // 4) % 4]
        r = deg(R - 24, S, c)
        T.note('bass', bass, b * 4, r, 1.4, wave='sub', cut=200, env_amt=600, dec=0.2)
        T.note('bass', bass, b * 4 + 2, r, 1.4, wave='sub', cut=200, env_amt=600, dec=0.2)
        ost = [0, 2, 4, 2, 7, 4, 2, 4]
        for e in range(8 if p == 1 else 16):
            st = 0.5 if p == 1 else 0.25
            T.note('music', pluck, b * 4 + e * st, deg(R, S, c + ost[e % 8]), 0.2, v=0.4, wave='saw', cut=700, env_amt=3500, dec=0.05, pan=-0.25 if e % 2 else 0.25)
        if b % 4 == 0: T.chord(b * 4, [deg(R, S, c + d) for d in (0, 2, 4, 7)], 16, cut=1100 + 400 * p, v=0.65, att=0.9)
    if p >= 2:
        mel = [(0, 7, 3), (3, 6, 1), (4, 4, 4), (8, 5, 3), (11, 4, 1), (12, 2, 4)]
        for rep in range(2):
            for o, d, ln in mel:
                T.note('music', lead, rep * 32 + 16 + o, deg(R + 12, S, d), ln, v=0.65, voices=7, detune=0.016, vib=0.007, cut=3000 + 1500 * (p - 2))

def syntax(T, p):
    # the final boss: a fast broken beat, a growling reese bass and a glitchy arp. A minor
    R = 45; S = MINOR
    for b in range(16):
        pat = [(0, 'kick'), (1, 'snare'), (1.75, 'kick'), (2.5, 'kick'), (3, 'snare')]
        if b % 2: pat = [(0, 'kick'), (1, 'snare'), (2.25, 'kick'), (3, 'snare'), (3.75, 'snare')]
        for o, d in pat: T.drum(d, b * 4 + o, 1.0 if d == 'kick' else 0.85)
        for e in range(16 if p > 1 else 8):
            st = 0.25 if p > 1 else 0.5
            T.drum('hat', b * 4 + e * st, 0.25 + 0.2 * (e % 2 == 0), pan=0.3 if e % 4 < 2 else -0.3)
        if b % 8 == 0: T.drum('crash', b * 4, 0.6)
        c = [0, 0, 5, 6][(b // 4) % 4]
        r = deg(R - 24, S, c)
        for o, ln in [(0, 1.4), (1.5, 0.4), (2, 1.8)]:
            T.note('bass', bass, b * 4 + o, r, ln, wave='saw', cut=160, env_amt=500 + 250 * p, dec=0.3, drive=2.5)
        # glitch arp: a random-looking but fixed pattern over the chord
        steps = [0, 7, 3, 12, 10, 3, 7, 15, 0, 12, 7, 3, 19, 15, 10, 7]
        for e in range(16):
            if (e * 5 + b) % 7 == 0 and p < 3: continue
            T.note('music', pluck, b * 4 + e * 0.25, deg(R + 12, S, c) + steps[e], 0.2, v=0.3, wave='sq', cut=1200, env_amt=5000, dec=0.04, pw=0.15, pan=0.5 if e % 2 else -0.5)
        if b % 4 == 0: T.chord(b * 4, [deg(R, S, c + d) for d in (0, 2, 4)], 16, cut=900 + 300 * p, v=0.45, att=1.0)
    if p >= 2:
        mel = [(0, 0, 1), (1, 2, 1), (2, 4, 2), (4, 3, 1), (5, 2, 1), (6, 4, 1.5), (7.5, 6, 0.5), (8, 7, 4), (12, 6, 2), (14, 4, 2)]
        for rep in range(2):
            for o, d, ln in mel:
                T.note('music', lead, rep * 32 + 16 + o, deg(R + 12, S, d), ln, v=0.6, voices=7, detune=0.018, cut=2800 + 1500 * (p - 2))

BOSSES = {
    # boss: (writer, bpm per phase, render settings)
    'spam': (spam, (124, 136, 150), dict(delay_beats=0.75, delay_fb=0.3, verb=0.2, drive=1.2)),
    'sign': (sign, (110, 120, 132), dict(delay_beats=0.75, delay_fb=0.35, verb=0.3, drive=1.1)),
    'announcer': (announcer, (126, 138, 152), dict(delay_beats=0.75, delay_fb=0.45, verb=0.3, drive=1.2)),
    'press': (press, (118, 130, 144), dict(delay_beats=0.5, delay_fb=0.25, verb=0.15, drive=1.6)),
    'correction': (correction, (132, 144, 158), dict(delay_beats=0.75, delay_fb=0.3, verb=0.35, drive=1.3)),
    'syntax': (syntax, (150, 162, 176), dict(delay_beats=0.375, delay_fb=0.3, verb=0.25, drive=1.4)),
}

if __name__ == '__main__':
    # press, correction, syntax and announcer are made by tools/music/rush.py now (Boss Rush's own hook)
    NEW = ('press', 'correction', 'syntax', 'announcer')
    which = [n for n in (sys.argv[1:] or list(BOSSES)) if n not in NEW or print(f'{n}: made by tools/music/rush.py')]
    for name in which:
        fn, bpms, rs = BOSSES[name]
        for p in (1, 2, 3):
            T = Track(bpms[p - 1])
            fn(T, p)
            x = T.render(**{**rs, 'drive': rs['drive'] * (1 + 0.15 * (p - 1))})
            path = os.path.join(OUT, f'rush-{name}-{p}.mp3')
            meas = master(x, path)
            print(f'{name} phase {p}: {bpms[p - 1]} bpm, {T.L / SR:.1f} s, {os.path.getsize(path) // 1024} KB, {" ".join(meas)}', flush=True)
