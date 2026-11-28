"""A small synth, sampler-free drum kit, mixer and mastering chain for the game's music.

Everything is made here from oscillators and noise (no samples, loops or soundfonts), so the
music it renders belongs to the site. numba makes the per-sample parts (band-limited
oscillators, resonant filters, delay, compressor, limiter) fast; without it they still run,
only slowly (pip install numba).

    from engine import *
    S = Song(bpm=150, bars=64)
    S.hit('kick', beat, ...); S.note('lead', supersaw, beat, midi, beats, ...)
    x = S.mixdown(); master_loop(x, path, lufs=-15)

Used by tools/boss/music.py (World Boss), tools/superboss/music.py and tools/rush/music.py.
"""
import os, subprocess, tempfile, wave, math
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt, resample_poly

try:
    from numba import njit
except ImportError:          # slow but works
    def njit(*a, **k):
        if a and callable(a[0]): return a[0]
        return lambda f: f

SR = 44100
rng = np.random.default_rng(11)

def seed(n):
    global rng
    rng = np.random.default_rng(n)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def db(x): return 10 ** (x / 20)
def secs(n): return np.arange(n) / SR

# ---------------------------------------------------------------- oscillators
@njit(cache=True)
def _blep(t, dt):
    if t < dt:
        t = t / dt
        return t + t - t * t - 1.0
    if t > 1.0 - dt:
        t = (t - 1.0) / dt
        return t * t + t + t + 1.0
    return 0.0

@njit(cache=True)
def _saw(freq, ph):
    n = freq.shape[0]; out = np.empty(n); p = ph
    for i in range(n):
        dt = freq[i] / 44100.0
        out[i] = 2.0 * p - 1.0 - _blep(p, dt)
        p += dt
        if p >= 1.0: p -= 1.0
    return out

@njit(cache=True)
def _pulse(freq, ph, pw):
    n = freq.shape[0]; out = np.empty(n); p = ph
    for i in range(n):
        dt = freq[i] / 44100.0
        q = p + pw
        if q >= 1.0: q -= 1.0
        out[i] = (2.0 * p - 1.0 - _blep(p, dt)) - (2.0 * q - 1.0 - _blep(q, dt))
        p += dt
        if p >= 1.0: p -= 1.0
    return out

def farr(f, n):
    return np.full(n, float(f)) if np.isscalar(f) else np.asarray(f, float)[:n]

def saw(f, n, ph=None): return _saw(farr(f, n), rng.random() if ph is None else ph)
def pulse(f, n, pw=0.5, ph=None): return _pulse(farr(f, n), rng.random() if ph is None else ph, pw)
def sine(f, n, ph=0.0):
    f = farr(f, n)
    return np.sin(2 * np.pi * (np.cumsum(f) / SR + ph))
def tri(f, n):
    f = farr(f, n); p = (np.cumsum(f) / SR + rng.random()) % 1.0
    return 4 * np.abs(p - 0.5) - 1
def noise(n): return rng.standard_normal(n)

# ---------------------------------------------------------------- filters
@njit(cache=True)
def _svf(x, fc, res, mode):
    """Zavalishin TPT state-variable filter, cutoff per sample. mode 0 low, 1 band, 2 high"""
    n = x.shape[0]; y = np.empty(n); ic1 = 0.0; ic2 = 0.0
    k = 2.0 - 2.0 * min(res, 0.98)
    one = fc.shape[0] == 1
    for i in range(n):
        f = fc[0] if one else fc[i]
        if f > 19000.0: f = 19000.0
        if f < 10.0: f = 10.0
        g = math.tan(math.pi * f / 44100.0)
        a1 = 1.0 / (1.0 + g * (g + k)); a2 = g * a1; a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1; ic2 = 2.0 * v2 - ic2
        if mode == 0: y[i] = v2
        elif mode == 1: y[i] = v1
        else: y[i] = x[i] - k * v1 - v2
    return y

def svf(x, fc, res=0.0, mode='lp'):
    fc = np.atleast_1d(np.asarray(fc, float))
    if fc.shape[0] > 1 and fc.shape[0] < len(x): fc = np.pad(fc, (0, len(x) - fc.shape[0]), mode='edge')
    return _svf(np.ascontiguousarray(x, float), np.ascontiguousarray(fc), float(res), {'lp': 0, 'bp': 1, 'hp': 2}[mode])

def lp4(x, fc, res=0.0):
    """24 dB low pass: two SVFs, the resonance on the second"""
    return svf(svf(x, fc, 0.0), fc, res)

def _sos(kind, fc, order=2):
    if kind == 'band': return butter(order, [fc[0] / (SR / 2), min(fc[1], SR * 0.45) / (SR / 2)], 'band', output='sos')
    return butter(order, min(fc, SR * 0.45) / (SR / 2), kind, output='sos')
def lp(x, fc, order=2): return sosfilt(_sos('low', fc, order), x, axis=0)
def hp(x, fc, order=2): return sosfilt(_sos('high', fc, order), x, axis=0)
def bp(x, lo, hi, order=2): return sosfilt(_sos('band', (lo, hi), order), x, axis=0)

def _biquad(kind, f0, gain_db=0.0, q=0.707):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; c, s = np.cos(w), np.sin(w); al = s / (2 * q)
    if kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    else:   # highshelf
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    return np.array([b + a]) / a[0]

def eq(x, kind, f0, gain_db, q=0.707):
    return sosfilt(_biquad(kind, f0, gain_db, q), x, axis=0)

# ---------------------------------------------------------------- envelopes and shapers
def adsr(n, a, d, s, r, hold_s):
    t = secs(n); h = max(hold_s, a)
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    lvl = (s + (1 - s) * np.exp(-(h - a) / max(d, 1e-4))) if h > a else 1.0
    rel = t >= h
    e[rel] = lvl * np.exp(-(t[rel] - h) / max(r / 4.6, 1e-4))
    return e

def dec(n, tau): return np.exp(-secs(n) / max(tau, 1e-5))
def fadeout(x, ms=4):
    k = min(len(x), int(SR * ms / 1000))
    if k: x[-k:] *= np.linspace(1, 0, k)[:, None] if x.ndim == 2 else np.linspace(1, 0, k)
    return x
def sat(x, drive=1.0): return np.tanh(x * drive) / np.tanh(drive) if drive > 0 else x
def fold(x, amt):        # soft wavefolder for grit
    return np.sin(x * (1 + amt) * np.pi / 2)

def pan2(x, pan=0.0):
    """mono -> stereo with an equal-power pan; stereo passes through with a balance"""
    if x.ndim == 2:
        if pan == 0: return x
        l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        return x * np.array([l, r])
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l, x * r], axis=1) * 1.414

def widen(x, ms=11.0, amt=0.5):
    """a Haas side signal kept mono-safe: side = delayed minus dry, low end left mono"""
    m = x.mean(axis=1) if x.ndim == 2 else x
    d = int(SR * ms / 1000)
    side = np.concatenate([np.zeros(d), m[:-d]]) - m
    side = hp(side, 300) * amt * 0.5
    return np.stack([m + side, m - side], axis=1)

# ---------------------------------------------------------------- drums
_cache = {}
def _variants(key, fn, k=4):
    if key not in _cache: _cache[key] = [fn() for _ in range(k)]
    return _cache[key][rng.integers(len(_cache[key]))]

def kick(tune=50.0, punch=1.0, length=0.42, click=1.0, drive=2.2, hard=0.0):
    """three layers: a click, a punchy mid body and a tuned sub that drops into the note"""
    def make():
        n = int(SR * length); t = secs(n)
        f = tune + (tune * 2.6 * punch) * np.exp(-t / 0.028) + tune * 0.5 * np.exp(-t / 0.12)
        sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.65 * np.exp(-t / (length * 0.42)) + 0.35 * np.exp(-t / (length * 0.2)))
        body = np.sin(2 * np.pi * np.cumsum(f * 2.0) / SR) * np.exp(-t / 0.035) * 0.45 * (1 + hard)
        cl = hp(noise(n), 3500) * np.exp(-t / 0.0035) * 0.55 * click
        cl += np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.004) * 0.25 * click
        x = sat(sub + body + cl, drive) * 0.95
        return fadeout(x, 8)
    return _variants(('kick', tune, punch, length, click, drive, hard), make, 3)

def snare(tone=190.0, length=0.32, snap=1.0, body=1.0, bright=7000.0, drive=1.6):
    def make():
        n = int(SR * length); t = secs(n)
        f = tone * (1 + 0.35 * np.exp(-t / 0.012))
        b = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.55 * np.sin(2 * np.pi * np.cumsum(f * 1.78) / SR)) * np.exp(-t / 0.07) * 0.6 * body
        nz = noise(n)
        wires = bp(nz, 1800, bright) * (0.75 * np.exp(-t / (length * 0.38)) + 0.25 * np.exp(-t / 0.03)) * 1.1
        crack = hp(nz, 4000) * np.exp(-t / 0.006) * 0.6 * snap
        x = sat(b + wires + crack, drive)
        return fadeout(x, 10)
    return _variants(('snare', tone, length, snap, body, bright, drive), make, 4)

def clap(length=0.35, tone=1400.0):
    def make():
        n = int(SR * length); t = secs(n); e = np.zeros(n)
        for k, o in enumerate((0.0, 0.009, 0.019, 0.027)):
            s = int(o * SR); e[s:] += np.exp(-(t[:n - s]) / (0.006 if k < 3 else length * 0.3))
        x = bp(noise(n), tone * 0.6, tone * 3.2) * e
        return fadeout(sat(x * 1.4, 1.2), 10)
    return _variants(('clap', length, tone), make, 4)

_HAT_F = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.65
def hat(length=0.05, tone=1.0, bright=8000.0):
    """808-style: six square oscillators at metal ratios plus noise, high passed"""
    def make():
        n = int(SR * max(0.06, length * 5)); t = secs(n)
        m = sum(np.sign(np.sin(2 * np.pi * f * tone * t + rng.random() * 6)) for f in _HAT_F) / 6
        x = hp(bp(m, 6000, 14000) * 0.7 + noise(n) * 0.35, bright, 2) * np.exp(-t / length)
        return fadeout(lp(x, 12000) * 0.5, 5)
    return _variants(('hat', length, tone, bright), make, 5)

def ride(length=1.4):
    def make():
        n = int(SR * length); t = secs(n)
        m = sum(np.sign(np.sin(2 * np.pi * f * 1.1 * t + rng.random() * 6)) for f in _HAT_F) / 6
        bell = (np.sin(2 * np.pi * 2350 * t) + 0.6 * np.sin(2 * np.pi * 3310 * t)) * np.exp(-t / 0.3) * 0.15
        x = hp(m * 0.5 + noise(n) * 0.3, 5000) * (0.6 * np.exp(-t / 0.05) + 0.4 * np.exp(-t / (length * 0.35))) + bell
        return fadeout(x, 20)
    return _variants(('ride', length), make, 3)

def crash(length=2.6):
    def make():
        n = int(SR * length); t = secs(n)
        x = np.stack([hp(noise(n), 4200) + 0.3 * bp(noise(n), 2500, 6000) for _ in range(2)], axis=1)
        e = (0.5 * np.exp(-t / 0.08) + 0.5 * np.exp(-t / (length * 0.33)))[:, None]
        x = lp(x * e, 13000)
        return fadeout(x, 30)
    return _variants(('crash', length), make, 3)

def tom(f=110.0, length=0.5, drive=1.8):
    def make():
        n = int(SR * length); t = secs(n)
        ff = f * (1 + 0.5 * np.exp(-t / 0.03))
        x = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / (length * 0.35))
        x += bp(noise(n), f * 2, f * 12) * np.exp(-t / 0.04) * 0.4
        return fadeout(sat(x, drive), 10)
    return _variants(('tom', f, length, drive), make, 3)

def metal(f=330.0, length=0.35):
    """an anvil/pipe hit for industrial patterns"""
    def make():
        n = int(SR * length); t = secs(n)
        x = sum(np.sin(2 * np.pi * f * r * t + rng.random() * 6) * a * np.exp(-t / (length * d))
                for r, a, d in ((1, 1, 0.5), (2.32, 0.7, 0.35), (4.25, 0.5, 0.25), (6.63, 0.35, 0.18), (9.1, 0.2, 0.1)))
        x += hp(noise(n), 2500) * np.exp(-t / 0.008) * 0.5
        return fadeout(sat(x * 0.6, 1.5), 10)
    return _variants(('metal', f, length), make, 3)

def impact(length=3.0, tune=36.0):
    """a cinematic hit: a sub that drops, a thump and a burst of air"""
    def make():
        n = int(SR * length); t = secs(n)
        f = tune + 90 * np.exp(-t / 0.06) + 20 * np.exp(-t / 0.5)
        sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (length * 0.3))
        thump = lp(noise(n), 600) * np.exp(-t / 0.09) * 1.2
        air = np.stack([hp(noise(n), 2000) for _ in range(2)], axis=1) * (np.exp(-t / 0.35) * 0.25)[:, None]
        x = pan2(sat(sub * 1.2 + thump, 1.8)) * 0.8 + air
        return fadeout(x, 40)
    return _variants(('impact', length, tune), make, 2)

def reverse_crash(beats_len, spb):
    """a cymbal swelling backwards into a downbeat"""
    n = int(SR * beats_len * spb)
    x = crash(max(2.6, beats_len * spb + 0.4))[:n][::-1].copy()
    return x * np.linspace(0.2, 1, n)[:, None] ** 2

def riser(seconds, f0=200.0, f1=6000.0, tone=True, res=0.55):
    """filtered noise sweeping up with a rising saw under it; ends at full level"""
    n = int(SR * seconds); r = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** (r ** 1.6)
    nz = np.stack([svf(noise(n), fc, res, 'bp') for _ in range(2)], axis=1)
    x = nz * 0.8
    if tone:
        pitch = 55 * 2 ** (r ** 1.3 * 3.5)
        s = (saw(pitch, n) + saw(pitch * 1.01, n)) * 0.5
        x += pan2(lp4(s, 400 + 5000 * r ** 2, 0.3) * 0.35)
    return x * (r ** 2.2)[:, None]

def downer(seconds, f0=5000.0, f1=150.0):
    n = int(SR * seconds); r = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** (r ** 0.6)
    x = np.stack([svf(noise(n), fc, 0.5, 'bp') for _ in range(2)], axis=1)
    pitch = 600 * 2 ** (-r * 4)
    x += pan2(lp(saw(pitch, n), 3000) * 0.25)
    return x * ((1 - r) ** 1.5)[:, None]

# ---------------------------------------------------------------- tonal voices
def supersaw(m, dur, voices=7, detune=0.22, cut=4500.0, res=0.15, env=0.5, att=0.006, rel=0.18,
             glide_from=None, vib=0.0, sub=0.35, drive=1.4, width=1.0, dec_s=0.25, sus=0.8):
    """the lead: detuned saws spread across the stereo field, a sub-octave pulse for weight,
    a 24 dB filter that opens on the attack, delayed vibrato and an optional glide"""
    n = int(SR * (dur + rel + 0.05)); t = secs(n); f0 = hz(m)
    f = np.full(n, f0)
    if glide_from is not None: f = f0 * 2 ** ((glide_from - m) / 12 * np.exp(-t / 0.045))
    if vib: f = f * (1 + vib * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.22) * 3, 0, 1))
    L = np.zeros(n); R = np.zeros(n)
    for k in range(voices):
        u = (k - (voices - 1) / 2) / max(1, (voices - 1) / 2)
        d = 2 ** (detune * u * abs(u) ** 0.3 / 12)
        v = saw(f * d, n) * (1.0 if k == (voices - 1) // 2 else 0.8)
        p = u * width
        L += v * np.cos((p + 1) * np.pi / 4); R += v * np.sin((p + 1) * np.pi / 4)
    L /= voices ** 0.55; R /= voices ** 0.55
    fe = cut * (1 + env * 2.5 * np.exp(-t / 0.07)) * (1 + 0.15 * np.clip(t / 0.5, 0, 1))
    L = lp4(L, fe, res); R = lp4(R, fe, res)
    if sub: s = lp(pulse(f / 2, n, 0.5), 900) * sub; L += s; R += s
    a = adsr(n, att, dec_s, sus, rel, dur)
    x = np.stack([L, R], axis=1) * a[:, None]
    return sat(x * 0.6, drive) * 0.55

def brass(ms, dur, cut=1600.0, swell=0.09, bright=1.0, drive=1.8, detune=0.07):
    """a synth brass section: saws per note, a filter that swells open on the attack (the bite)"""
    if np.isscalar(ms): ms = [ms]
    n = int(SR * (dur + 0.35)); t = secs(n)
    L = np.zeros(n); R = np.zeros(n)
    for j, m in enumerate(ms):
        f = hz(m) * (1 + 0.003 * np.sin(2 * np.pi * 4.8 * t + j) * np.clip(t - 0.3, 0, 1))
        for k, d in enumerate((-detune, 0, detune)):
            v = saw(f * 2 ** (d / 12), n)
            if k == 0: L += v
            elif k == 2: R += v
            else: L += v * 0.7; R += v * 0.7
    L /= len(ms) * 1.7; R /= len(ms) * 1.7
    fe = cut * (0.35 + 1.4 * bright * (1 - np.exp(-t / swell)) * np.exp(-t / 0.35) + 0.65 * (1 - np.exp(-t / swell)))
    L = lp4(L, fe, 0.1); R = lp4(R, fe, 0.1)
    x = np.stack([L, R], axis=1) * adsr(n, 0.015, 0.3, 0.75, 0.25, dur)[:, None]
    return sat(x, drive) * 0.5

def pad(ms, dur, cut=1400.0, att=0.6, rel=0.9, voices=4, detune=0.12, lfo=0.25, drive=1.0):
    n = int(SR * (dur + rel + 0.1)); t = secs(n)
    L = np.zeros(n); R = np.zeros(n)
    for m in ms:
        for k in range(voices):
            u = (k - (voices - 1) / 2) / max(1, (voices - 1) / 2)
            v = saw(hz(m) * 2 ** (detune * u / 12), n)
            L += v * (0.5 - 0.4 * u); R += v * (0.5 + 0.4 * u)
    g = 1 / (len(ms) * voices) ** 0.6
    fc = cut * (1 + 0.25 * np.sin(2 * np.pi * lfo * t + rng.random() * 6))
    x = np.stack([lp4(L * g, fc, 0.1), lp4(R * g, fc, 0.1)], axis=1)
    return sat(x * adsr(n, att, 0.5, 0.85, rel, dur)[:, None], drive) * 0.5

def choir(ms, dur, att=0.5, rel=1.0, vowel='ah'):
    """saws and a little noise through vowel formants, slow vibrato: a synth choir"""
    F = {'ah': ((750, 1.0), (1150, 0.6), (2700, 0.25)), 'oh': ((450, 1.0), (850, 0.5), (2600, 0.15))}[vowel]
    n = int(SR * (dur + rel + 0.1)); t = secs(n)
    L = np.zeros(n); R = np.zeros(n)
    for m in ms:
        for k, d in enumerate((-0.1, -0.03, 0.04, 0.11)):
            f = hz(m) * 2 ** (d / 12) * (1 + 0.004 * np.sin(2 * np.pi * (4.5 + k * 0.4) * t + k))
            v = saw(f, n) + 0.05 * noise(n)
            if k % 2: L += v
            else: R += v
    out = []
    for c in (L, R):
        y = sum(bp(c, fo / 1.25, fo * 1.25) * a for fo, a in F)
        out.append(y)
    x = np.stack(out, axis=1) / (len(ms) * 2) ** 0.6
    return x * adsr(n, att, 0.5, 0.9, rel, dur)[:, None] * 0.9

def pluck(m, dur, wave='saw', cut=700.0, env=4000.0, decay=0.12, res=0.25, pw=0.35, length=None, drive=1.2):
    n = int(SR * ((length or dur) + 0.15)); t = secs(n); f = hz(m)
    o = saw(f, n) + 0.5 * saw(f * 1.006, n) if wave == 'saw' else pulse(f, n, pw)
    fe = cut + env * np.exp(-t / decay)
    x = lp4(o, fe, res) * np.exp(-t / max(0.05, (length or dur) * 0.8)) * adsr(n, 0.002, 0.1, 1.0, 0.04, length or dur)
    return sat(x * 0.8, drive) * 0.5

def bell(m, dur, dec_s=0.9):
    n = int(SR * (dur + dec_s * 3)); t = secs(n); f = hz(m)
    x = sine(f, n) + 0.45 * sine(f * 2.0, n) * np.exp(-t / (dec_s * 0.5)) + 0.3 * sine(f * 3.01, n) * np.exp(-t / (dec_s * 0.25)) \
        + 0.15 * sine(f * 4.2, n) * np.exp(-t / 0.1)
    return x * np.exp(-t / dec_s) * 0.35

def bass(m, dur, cut=420.0, env=1800.0, decay=0.09, res=0.3, drive=3.0, detune=0.12, wave='saw', sub=0.0, growl=0.0, length=None):
    """the mid bass: detuned saws (or pulses) through a 24 dB filter with a pluck envelope, driven.
    It carries no sub (that is the sub voice's job), so it stays clean under the kick"""
    L = length or dur
    n = int(SR * (L + 0.06)); t = secs(n); f = hz(m)
    if wave == 'saw': o = saw(f, n) + saw(f * 2 ** (detune / 12), n) + 0.6 * saw(f * 2 ** (-detune / 12), n)
    else: o = pulse(f, n, 0.42) + pulse(f * 2 ** (detune / 12), n, 0.3)
    if growl: o = o + growl * fold(saw(f * 0.5, n) * 0.8, 1.5 + np.sin(2 * np.pi * 7 * t))
    fe = cut + env * np.exp(-t / decay)
    x = lp4(o / 2.6, fe, res)
    x = sat(x * 1.0, drive) * adsr(n, 0.002, 0.08, 0.9, 0.03, L)
    x = hp(x, 70)
    if sub: x += sine(f, n) * sub * adsr(n, 0.004, 0.1, 1, 0.03, L)
    return x * 0.6

def subbass(m, dur, length=None, drive=1.15):
    """a clean sine sub, a touch of second harmonic so it reads on small speakers"""
    L = length or dur
    n = int(SR * (L + 0.05)); f = hz(m)
    while f > 110: f /= 2
    while f < 38: f *= 2
    x = sine(f, n) + 0.12 * sine(2 * f, n, 0.25)
    return sat(x, drive) * adsr(n, 0.005, 0.1, 1, 0.04, L) * 0.55

def reese(m, dur, cut=380.0, drive=2.5, lfo_hz=0.5, length=None, move=0.6):
    """a long moving bass: three saws that beat against each other, a filter that breathes"""
    L = length or dur
    n = int(SR * (L + 0.08)); t = secs(n); f = hz(m)
    o = saw(f, n) + saw(f * 1.011, n) + saw(f * 0.993, n)
    fc = cut * (1 + move * (0.5 - 0.5 * np.cos(2 * np.pi * lfo_hz * t)))
    x = sat(lp4(o / 2.4, fc, 0.35), drive) * adsr(n, 0.01, 0.2, 0.9, 0.06, L)
    return hp(x, 70) * 0.6

def siren(m0, m1, dur, rate=1.25):
    """the alarm: a two-tone square that slides between two notes, band passed"""
    n = int(SR * (dur + 0.1)); t = secs(n)
    k = 0.5 + 0.5 * np.tanh(4 * np.sin(2 * np.pi * rate * t))
    f = hz(m0) * (hz(m1) / hz(m0)) ** k
    x = pulse(f, n, 0.5) + 0.6 * pulse(f * 1.005, n, 0.4)
    x = bp(x, 500, 3500) * adsr(n, 0.05, 0.2, 1, 0.1, dur)
    return sat(x * 0.5, 1.5) * 0.4

def drone(m, dur, cut=300.0):
    n = int(SR * (dur + 0.5)); t = secs(n); f = hz(m)
    o = saw(f, n) + saw(f * 1.004, n) + sine(f / 2, n) * 0.8
    fc = cut * (1 + 3 * (t / max(dur, 0.1)) ** 2)
    return sat(lp4(o / 2, fc, 0.4), 1.6) * adsr(n, 0.4, 0.3, 1, 0.4, dur) * 0.5

# ---------------------------------------------------------------- effects
def make_ir(seconds=2.4, pre=0.02, damp=0.35, early=True, seed_n=3):
    """a synthetic stereo hall: early reflections, then decorrelated noise decaying faster in the highs"""
    r = np.random.default_rng(seed_n)
    n = int(SR * seconds); t = secs(n)
    out = []
    for c in range(2):
        nz = r.standard_normal(n)
        lo = lp(nz, 700) * np.exp(-t / (seconds * 0.2))
        mid = bp(nz, 700, 4000) * np.exp(-t / (seconds * 0.16))
        hi = hp(nz, 4000) * np.exp(-t / (seconds * 0.16 * damp))
        x = lo * 0.9 + mid + hi * 0.6
        x *= np.clip(t / 0.03, 0, 1)
        if early:
            for k in range(14):
                d = int(SR * (0.004 + r.random() * 0.07)); x[d] += (r.random() * 2 - 1) * 1.6 * (1 - d / (SR * 0.08))
        d0 = int(SR * pre)
        x = np.concatenate([np.zeros(d0), x])[:n]
        out.append(x)
    ir = np.stack(out, axis=1)
    return ir / np.sqrt((ir ** 2).sum(axis=0))

def convolve(x, ir):
    return np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], axis=1)

@njit(cache=True)
def _pingpong(x, d, fb, cut_a, hp_a):
    n = x.shape[0]; y = np.zeros((n, 2))
    bl = np.zeros(d); br = np.zeros(d); i = 0; zl = 0.0; zr = 0.0; hl = 0.0; hr = 0.0
    for k in range(n):
        ol = bl[i]; orr = br[i]
        y[k, 0] = ol; y[k, 1] = orr
        # the feedback crosses sides and loses top and bottom each repeat
        zl += cut_a * (orr - zl); zr += cut_a * (ol - zr)
        hl += hp_a * (zl - hl); hr += hp_a * (zr - hr)
        bl[i] = x[k, 0] + (zl - hl) * fb
        br[i] = (zr - hr) * fb
        i += 1
        if i >= d: i = 0
    return y

def pingpong(x, delay_s, fb=0.35, cut=4500.0, low=250.0):
    d = int(SR * delay_s)
    a = 1 - np.exp(-2 * np.pi * cut / SR); h = 1 - np.exp(-2 * np.pi * low / SR)
    mono = np.ascontiguousarray(np.stack([x.mean(axis=1), np.zeros(len(x))], axis=1))
    return _pingpong(mono, d, fb, a, h)

@njit(cache=True)
def _chorus(x, rate, depth, base):
    n = x.shape[0]; y = np.empty((n, 2)); buf = np.zeros((8192, 2)); w = 0
    for k in range(n):
        buf[w, 0] = x[k, 0]; buf[w, 1] = x[k, 1]
        for c in range(2):
            ph = 6.283185307 * rate * k / 44100.0 + (3.14159 if c else 0.0)
            dl = (base + depth * (0.5 + 0.5 * math.sin(ph))) * 44.1
            p = w - dl
            while p < 0: p += 8192
            i0 = int(p); fr = p - i0; i1 = (i0 + 1) % 8192
            y[k, c] = buf[i0, c] * (1 - fr) + buf[i1, c] * fr
        w = (w + 1) % 8192
    return y

def chorus(x, rate=0.35, depth_ms=3.0, base_ms=9.0, mix=0.45):
    return x * (1 - mix) + _chorus(np.ascontiguousarray(x), rate, depth_ms, base_ms) * mix

@njit(cache=True)
def _env_follow(x, att, rel):
    n = x.shape[0]; e = np.empty(n); z = 0.0
    for i in range(n):
        v = x[i]
        z = z + (att if v > z else rel) * (v - z)
        e[i] = z
    return e

def compress(x, thresh_db=-18, ratio=3.0, attack_ms=10, release_ms=120, knee_db=6, key=None, makeup_db=0.0):
    """feed-forward compressor, stereo linked, soft knee; key is an optional sidechain signal"""
    src = key if key is not None else x
    k = np.abs(src).max(axis=1) if src.ndim == 2 else np.abs(src)
    a = 1 - np.exp(-1 / (SR * attack_ms / 1000)); r = 1 - np.exp(-1 / (SR * release_ms / 1000))
    env = _env_follow(np.ascontiguousarray(k), a, r)
    lev = 20 * np.log10(np.maximum(env, 1e-7))
    over = lev - thresh_db
    gr = np.where(over <= -knee_db / 2, 0.0,
         np.where(over >= knee_db / 2, over * (1 - 1 / ratio), (1 - 1 / ratio) * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    g = db(-gr + makeup_db)
    return x * (g[:, None] if x.ndim == 2 else g)

@njit(cache=True)
def _slidemin(g, w):
    n = g.shape[0]; out = np.empty(n)
    # monotonic deque minimum over the trailing window of w samples
    q = np.empty(n, np.int64); h = 0; tl = 0
    for i in range(n):
        while tl > h and g[q[tl - 1]] >= g[i]: tl -= 1
        q[tl] = i; tl += 1
        if q[h] <= i - w: h += 1
        out[i] = g[q[h]]
    return out

@njit(cache=True)
def _release(g, rel):
    n = g.shape[0]; out = np.empty(n); z = 1.0
    for i in range(n):
        z = z + rel * (1.0 - z)
        if g[i] < z: z = g[i]
        out[i] = z
    return out

def limit(x, ceiling_db=-1.2, look_ms=2.5, release_ms=60):
    """a look-ahead brickwall that watches the 4x oversampled (true) peak; returns x aligned"""
    ceil = db(ceiling_db)
    up = resample_poly(x, 4, 1, axis=0)
    pk = np.abs(up).max(axis=1).reshape(-1, 4).max(axis=1)[:len(x)]
    if len(pk) < len(x): pk = np.pad(pk, (0, len(x) - len(pk)), mode='edge')
    req = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    w = max(2, int(SR * look_ms / 1000))
    m = _slidemin(np.ascontiguousarray(req), w)
    m = _release(m, 1 - np.exp(-1 / (SR * release_ms / 1000)))
    g = np.convolve(m, np.ones(w) / w)[:len(m)]
    d = w - 1
    y = np.concatenate([np.zeros((d, 2)), x])[:len(x)] * g[:, None]
    return np.concatenate([y[d:], np.zeros((d, 2))])     # undo the look-ahead delay

def soft_clip(x, thresh=0.8):
    a = np.abs(x); over = a > thresh
    y = x.copy()
    y[over] = np.sign(x[over]) * (thresh + (1 - thresh) * np.tanh((a[over] - thresh) / (1 - thresh)))
    return y

def stutter(x, s, length, slice_len, fade=64, pitch_up=False):
    """a glitch edit: the slice at s repeated through the region (in samples), optionally rising"""
    seg = x[s:s + slice_len].copy()
    w = np.ones(slice_len); w[:fade] = np.linspace(0, 1, fade); w[-fade:] = np.linspace(1, 0, fade)
    seg = seg * w[:, None]
    k = 0; p = s
    while p < s + length:
        piece = seg
        if pitch_up and k:
            step = 2 ** (k / 12 * 1.5)
            idx = (np.arange(int(slice_len / step)) * step).astype(int)
            piece = seg[idx]
        e = min(len(piece), s + length - p, len(x) - p)
        x[p:p + e] = piece[:e]
        p += len(piece); k += 1
    return x

def crush(x, bits=6, down=6):
    y = x[::down].repeat(down, axis=0)[:len(x)]
    q = 2 ** bits
    return np.round(y * q) / q

# ---------------------------------------------------------------- the song
class Song:
    """A loop on a beat grid. Instruments go to named buses with sends to a hall, a room and a
    ping-pong delay; kicks drive the sidechain pump. Tails past the end fold back onto the
    start and every nonlinear stage runs on the wrapped signal, so the loop has no seam."""
    BUSES = ('kick', 'drums', 'perc', 'bass', 'sub', 'lead', 'music', 'pad', 'fx')

    def __init__(self, bpm, bars, tail=5.0, loop=True):
        self.bpm, self.bars, self.loop = bpm, bars, loop
        self.spb = 60.0 / bpm
        self.L = int(round(bars * 4 * self.spb * SR))
        self.T = int(SR * tail)
        self.N = self.L + self.T
        self.bus = {k: np.zeros((self.N, 2)) for k in self.BUSES}
        self.send = {k: np.zeros((self.N, 2)) for k in ('hall', 'room', 'delay')}
        self.kicks = []
        self.pump_extra = []
        self.edits = []
        self.events = []      # (bus, beat, beats, [midi], voice) for the harmony check
        self.mutes = []       # (beat, beats): silence before a hit, reverb tails and all
        self.gain = {'kick': 0.75, 'drums': 0.75, 'perc': 0.6, 'bass': 0.8, 'sub': 0.7, 'lead': 1.5, 'music': 1.2, 'pad': 0.9, 'fx': 0.55}
        self.pump = {'bass': 0.9, 'sub': 1.0, 'pad': 0.6, 'music': 0.35, 'lead': 0.2, 'fx': 0.15, 'perc': 0.25, 'hall': 0.6, 'delay': 0.4}
        self.hall_ir = make_ir(2.6, 0.025, 0.35)
        self.room_ir = make_ir(0.7, 0.008, 0.5, seed_n=5)
        self.delay_beats = 0.75
        self.verb = {'hall': 0.8, 'room': 0.35, 'delay': 0.6}

    def s(self, beat): return int(round(beat * self.spb * SR))

    def put(self, bus, beat, x, pan=0.0, gain=1.0, hall=0.0, room=0.0, delay=0.0):
        st = self.s(beat)
        if self.loop: st %= self.L
        if st < 0: x = x[-st:]; st = 0
        x = pan2(x, pan) * gain
        n = min(len(x), self.N - st)
        if n <= 0: return
        self.bus[bus][st:st + n] += x[:n]
        for k, v in (('hall', hall), ('room', room), ('delay', delay)):
            if v: self.send[k][st:st + n] += x[:n] * v

    def hit(self, name, beat, v=1.0, pan=0.0, bus=None, hall=0.0, room=0.12, **kw):
        fn = DRUMS[name]
        x = fn(**kw)
        if name == 'kick':
            self.kicks.append((beat, v)); bus = bus or 'kick'; room = 0.0
        self.put(bus or ('perc' if name in ('metal', 'ride', 'tick') else 'drums'), beat, x, pan, v, hall=hall, room=room)

    def note(self, bus, fn, beat, m, beats, pan=0.0, gain=1.0, hall=0.0, room=0.0, delay=0.0, **kw):
        self.events.append((bus, beat, beats, [m], getattr(fn, '__name__', '?')))
        self.put(bus, beat, fn(m, beats * self.spb, **kw), pan, gain, hall=hall, room=room, delay=delay)

    def chord(self, bus, fn, beat, ms, beats, pan=0.0, gain=1.0, hall=0.0, room=0.0, delay=0.0, **kw):
        self.events.append((bus, beat, beats, list(ms), getattr(fn, '__name__', '?')))
        self.put(bus, beat, fn(ms, beats * self.spb, **kw), pan, gain, hall=hall, room=room, delay=delay)

    def duck_at(self, beat, depth=1.0):
        """an extra pump with no kick (for a hit carried by another drum)"""
        self.pump_extra.append((beat, depth))

    def mute(self, beat, beats):
        self.mutes.append((beat, beats))

    def glitch(self, beat, beats, slice_beats=0.125, pitch_up=False):
        self.edits.append((beat, beats, slice_beats, pitch_up))

    def _pump_curve(self, depth, rel_beats=0.62):
        g = np.ones(self.N)
        rel = int(rel_beats * self.spb * SR); a = int(0.004 * SR)
        shape = np.concatenate([np.linspace(0, 1, a), 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, rel))])
        for b, v in self.kicks + self.pump_extra:
            s0 = self.s(b) - a
            if self.loop: s0 %= self.L
            elif s0 < 0: continue
            c = 1 - depth * min(1.0, v) * shape
            e = min(len(c), self.N - s0)
            if e > 0: g[s0:s0 + e] = np.minimum(g[s0:s0 + e], c[:e])
        return g

    def _wrap(self, x):
        if not self.loop: return x
        y = x[:self.L].copy()
        for k in range(self.L, self.N, self.L):
            seg = x[k:k + self.L]; y[:len(seg)] += seg
        return y

    def mixdown(self, drum_glue=True, out_gain=1.0, stems=False):
        B = {k: v.copy() for k, v in self.bus.items()}
        S = self.send
        # effects returns
        hall = convolve(lp(hp(S['hall'], 220), 8000), self.hall_ir) * self.verb['hall']
        room = convolve(hp(S['room'], 300), self.room_ir) * self.verb['room']
        dly = pingpong(S['delay'], self.delay_beats * self.spb, 0.38) * self.verb['delay']
        dly = convolve(dly, self.hall_ir) * 0.25 + dly
        # the pump, per bus
        cache = {}
        def pump(name, x):
            d = self.pump.get(name, 0)
            if not d: return x
            if d not in cache: cache[d] = self._pump_curve(d)
            return x * cache[d][:, None]
        # drums: a bus compressor and a parallel crushed copy for weight
        drums = B['drums'] + room * 0.8
        if drum_glue:
            drums = compress(drums, -16, 3, 4, 90, makeup_db=2)
            par = sat(compress(drums, -30, 8, 1, 60) * 2.0, 2.0) * 0.25
            drums = drums + par
        kick = B['kick']
        bassmix = pump('bass', B['bass']) * self.gain['bass']
        submix = pump('sub', B['sub']) * self.gain['sub']
        # the sub and the bass's lows sit in the middle
        sub_m = submix.mean(axis=1, keepdims=True).repeat(2, axis=1)
        parts = {
            'kick': kick * self.gain['kick'],
            'drums': drums * self.gain['drums'],
            'perc': pump('perc', B['perc']) * self.gain['perc'],
            'bass': bassmix, 'sub': sub_m,
            'lead': pump('lead', B['lead']) * self.gain['lead'],
            'music': pump('music', B['music']) * self.gain['music'],
            'pad': pump('pad', B['pad']) * self.gain['pad'],
            'fx': pump('fx', B['fx']) * self.gain['fx'],
            'returns': pump('hall', hall) + room * 0.2 + pump('delay', dly),
        }
        mix = sum(parts.values()) * out_gain
        mix = self._wrap(mix)
        if self.mutes:
            g = np.ones(len(mix)); r = int(0.006 * SR)
            for b, bl in self.mutes:
                s0 = self.s(b) % self.L if self.loop else self.s(b); s1 = s0 + self.s(bl) - 30
                for a, z in ((s0, min(s1, len(g))),) if s1 <= len(g) else ((s0, len(g)), (0, s1 - len(g))):
                    g[a:z] = np.minimum(g[a:z], 0.02)
                    if a >= r: g[a - r:a] = np.minimum(g[a - r:a], np.linspace(1, 0.02, r))
            mix = mix * g[:, None]
        for b, bl, sl, up in self.edits:
            s0 = self.s(b) % self.L if self.loop else self.s(b)
            mix = stutter(mix, s0, self.s(bl), max(64, self.s(sl)), pitch_up=up)
        if stems:
            return mix, {k: self._wrap(v) for k, v in parts.items()}
        return mix

# ---------------------------------------------------------------- mastering
def master_chain(x, drive_db=0.0, glue=True, tilt=True, wrap_s=3.0, loop=True, ceiling=-1.3):
    """EQ, glue compression, soft clip and a true-peak limiter, run on the wrapped loop so the
    detectors carry over the seam"""
    pre = int(SR * wrap_s) if loop else 0
    y = np.concatenate([x[-pre:], x]) if pre else x.copy()
    y = hp(y, 30, 4)
    if tilt:
        y = eq(y, 'lowshelf', 90, -0.5)
        y = eq(y, 'peak', 320, -1.5, 0.8)       # take mud out
        y = eq(y, 'highshelf', 9000, 1.0)
    if glue: y = compress(y, -14, 2.0, 25, 180, knee_db=8)
    y = y * db(drive_db)
    y = soft_clip(y, 0.85)
    y = limit(y, ceiling, 2.5, 80)
    return y[pre:]

def write_wav(path, x):
    y = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype('<i2').tobytes())

def read_audio(path):
    """decode any file with ffmpeg to float stereo at SR"""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, '<f4').reshape(-1, 2).astype(float)

def measure(path):
    """integrated LUFS, true peak dBTP and LRA, as ffmpeg's EBU R128 meter reads them"""
    r = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    out = {}
    for l in r.splitlines()[::-1]:
        s = l.strip()
        if s.startswith('I:') and 'I' not in out: out['I'] = float(s.split()[1])
        elif s.startswith('Peak:') and 'TP' not in out: out['TP'] = float(s.split()[1])
        elif s.startswith('LRA:') and 'LRA' not in out: out['LRA'] = float(s.split()[1])
    return out

def master_to(x, path, lufs=-15.0, ceiling=-1.6, bitrate='112k', loop=True, head_s=1.0, drive_db=0.0, glue=True):
    """master x to a target loudness and write an mp3. A loop is written as the loop plus its
    first head_s again (players loop from 0.5 s to 0.5 s + loop length, clear of the encoder's
    padding). Returns the measurements of the mp3 as written."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        g = 0.0; off = 0.0
        # the encoder's low pass takes some loudness off (more on tracks with a lot of top): aim the master
        # off by what the mp3 lost, and pull it down if the mp3's true peak comes over -1.05 dBTP
        for rnd in range(4):
            for it in range(6):
                y = master_chain(x * db(g), drive_db=drive_db, glue=glue, loop=loop, ceiling=ceiling)
                write_wav(wav, y)
                m = measure(wav)
                err = lufs + off - m['I']
                if abs(err) < 0.15: break
                g += err * (1.0 if it == 0 else 0.9)
            if not loop:     # drop the silence after the last tail
                e = np.abs(y).max(axis=1); live = np.nonzero(e > db(-66))[0]
                if len(live): y = fadeout(y[:min(len(y), live[-1] + SR // 10)].copy(), 60)
            out = np.concatenate([y, y[:int(SR * head_s)]]) if loop and head_s else y
            write_wav(wav, out)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', bitrate, path], check=True)
            res = measure(path)
            err = lufs - res['I']
            if abs(err) < 0.2 and res['TP'] <= -1.05: break
            if res['TP'] > -1.05:
                y = y * db(-1.15 - res['TP']); write_wav(wav, np.concatenate([y, y[:int(SR * head_s)]]) if loop and head_s else y)
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', bitrate, path], check=True)
                res = measure(path)
                if res['TP'] <= -1.05 and (abs(lufs - res['I']) < 0.3 or rnd == 3): break
            off += lufs - res['I']
        res['gain_db'] = round(g, 2); res['wav_I'] = m['I']; res['wav_TP'] = m['TP']
        return res, y

def tick(tone=2400.0, length=0.012):
    """a clock tick: a short pitched click with a breath of noise"""
    def make():
        n = int(SR * 0.08); t = secs(n)
        x = np.sin(2 * np.pi * tone * t) * np.exp(-t / length) + bp(noise(n), tone * 0.8, min(tone * 3, 16000)) * np.exp(-t / (length * 0.4)) * 0.7
        return fadeout(x * 0.6, 5)
    return _variants(('tick', tone, length), make, 3)

DRUMS = {'tick': tick, 'kick': kick, 'snare': snare, 'clap': clap, 'hat': hat, 'ohat': lambda **k: hat(**{'length': 0.22, **k}),
         'ride': ride, 'crash': crash, 'tom': tom, 'metal': metal, 'impact': impact}
