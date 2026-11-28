"""Patterns for boss music on top of engine.py: chords from a key, drum grooves, bass lines locked to
the kick, arps, gated chords, a theme player, fills and transition effects. A boss's music file
describes its theme and its sections; this file turns them into notes on a Song.

A section is a dict:
    bars      8 (bars in the section)
    prog      list of chord names, one per bar (repeats to fill the section)
    drums     'tick' | 'half' | 'drive' | 'break' | 'blast' | None
    fill      'roll' | 'toms' | 'kicks' | 'glitch' | 'stop' | None   (the last bar)
    bass      'pulse8' | 'offbeat' | 'roll16' | 'riff' | 'sustain' | None
    pad, choir, arp ('16' | '8' | None), gate (trance-gated supersaw chords), stabs (the riff on brass)
    theme     (melody name, instrument, octave shift, options dict) or None
    impact    a hit and a crash on the first downbeat;  riser: bars of riser into the next section
    glitch    [(bar, sixteenth, length in sixteenths)] stutter edits
    hot       0..1 extra brightness and level
"""
import numpy as np
import engine as E

MINOR = [0, 2, 3, 5, 7, 8, 10]

# chord name -> (root semitones from the tonic, intervals). Roman numerals for a minor key.
CHORDS = {
    'i': (0, (0, 3, 7)), 'i5': (0, (0, 7, 12)), 'iv': (5, (0, 3, 7)), 'v': (7, (0, 3, 7)), 'V': (7, (0, 4, 7)),
    'VI': (8, (0, 4, 7)), 'VII': (10, (0, 4, 7)), 'III': (3, (0, 4, 7)), 'bII': (1, (0, 4, 7)), 'IV': (5, (0, 4, 7)),
    'ii0': (2, (0, 3, 6)), 'Vsus': (7, (0, 5, 7)), 'vii0': (11, (0, 3, 6)), 'I': (0, (0, 4, 7)), 'bVII': (10, (0, 4, 7)),
    'bvi': (8, (0, 3, 7)), 'bIII': (3, (0, 4, 7)), 'bviim': (10, (0, 3, 7)), 'IIIm': (3, (0, 3, 7)),
    'bV': (6, (0, 4, 7)), 'i0': (0, (0, 3, 6)), 'bIIm': (1, (0, 3, 7)), 'bv0': (6, (0, 3, 6)), 'iadd2': (0, (0, 1, 7)),
}

class Theme:
    def __init__(self, tonic, bpm, melodies, riff, progs, kick_tune=50.0, name=''):
        self.tonic = tonic           # MIDI of the tonic around octave 4 (D4 = 62)
        self.bpm = bpm
        self.melodies = melodies     # name -> [(beat, semitones from tonic, beats)]
        self.riff = riff             # [(sixteenth, semitones over the chord root, length in sixteenths)]
        self.progs = progs
        self.kick_tune = kick_tune
        self.name = name

    def root(self, ch, lo=33, hi=44):
        """the chord's bass note, kept inside a window so the bass sits in one register"""
        r = self.tonic - 24 + CHORDS[ch][0]
        while r < lo: r += 12
        while r > hi: r -= 12
        return r

    def voicing(self, ch, center=62, n=3, spread=False):
        """chord tones nearest a centre pitch (close position), for smooth voice leading"""
        r, iv = CHORDS[ch]
        pcs = [(self.tonic + r + i) % 12 for i in iv]
        notes = []
        for pc in pcs:
            c = [m for m in range(center - 9, center + 10) if m % 12 == pc]
            notes.append(min(c, key=lambda m: abs(m - center)))
        notes = sorted(set(notes))
        if spread: notes = [notes[0] - 12] + notes
        return notes[:n + (1 if spread else 0)]

def chords_for(sec):
    p = sec['prog']; return [p[b % len(p)] for b in range(sec['bars'])]

# ---------------------------------------------------------------- drums
def hum(v, k=0.08): return v * (1 + k * (E.rng.random() * 2 - 1))

def drums(S, T, b0, sec):
    st = sec.get('drums'); bars = sec['bars']; hot = sec.get('hot', 0.5)
    kt = T.kick_tune
    K = dict(tune=kt, punch=1.0 + 0.3 * hot, drive=2.2 + hot)
    SN = dict(tone=185, bright=5500 + 1500 * hot)
    sw = 0.022     # the 16ths that fall between 8ths lean late a little: groove
    def h16(b, p, v, **kw):
        S.hit('hat', b * 4 + p / 4 + (sw if p % 2 else 0), hum(v), pan=0.25 if p % 4 in (1, 2) else -0.2, **kw)
    for i in range(bars):
        b = b0 + i; last = i == bars - 1 and sec.get('fill'); four = i % 4 == 3
        if st is None:
            if sec.get('tick'): st_tick(S, b, sec['tick'])
            continue
        if st == 'tick':
            if i % 2 == 0: S.hit('kick', b * 4, 0.85, **K)
            for p in range(16): h16(b, p, 0.12 + 0.18 * (p % 4 == 0) + 0.08 * (p % 2 == 0))
            S.hit('clap', b * 4 + 3, 0.35, hall=0.3)
        elif st == 'half':
            kp = [0, 10] + ([7] if i % 2 else []) + ([14] if four else [])
            for p in kp: S.hit('kick', b * 4 + p / 4, 1.0 if p == 0 else 0.85, **K)
            S.hit('snare', b * 4 + 2, 1.0, hall=0.12, **SN); S.hit('clap', b * 4 + 2, 0.55, hall=0.15)
            for p in range(16): h16(b, p, 0.16 + 0.22 * (p % 4 == 2) + 0.1 * (p % 2 == 0))
            if i % 2 == 1: S.hit('ohat', b * 4 + 3.5, 0.3, pan=0.3)
            if four and not last: S.hit('snare', b * 4 + 3.75, 0.35, **SN)
        elif st == 'drive':
            for q in range(4): S.hit('kick', b * 4 + q, 1.0, **K)
            for q in (1, 3): S.hit('snare', b * 4 + q, 0.95, hall=0.1, **SN); S.hit('clap', b * 4 + q, 0.5, hall=0.12)
            for p in range(16):
                if p % 4 == 2: S.hit('ohat', b * 4 + p / 4, hum(0.34 + 0.1 * hot), pan=0.15)
                else: h16(b, p, 0.13 + 0.12 * (p % 2 == 0))
            if hot > 0.6: S.hit('ride', b * 4, 0.3); S.hit('ride', b * 4 + 2, 0.22)
            if four and not last: S.hit('kick', b * 4 + 3.5, 0.7, **K); S.hit('snare', b * 4 + 3.75, 0.4, **SN)
        elif st == 'break':
            kp = [0, 3, 10] + ([11] if i % 2 else [6])
            for p in kp: S.hit('kick', b * 4 + p / 4, 1.0 if p in (0, 10) else 0.8, **K)
            for q in (1, 3): S.hit('snare', b * 4 + q, 1.0, hall=0.1, **SN); S.hit('clap', b * 4 + q, 0.45)
            for p in (7, 9, 15): S.hit('snare', b * 4 + p / 4, 0.18, **SN)
            for p in range(16): h16(b, p, 0.14 + 0.16 * (p % 2 == 0))
            for p in (2, 14) if i % 2 == 0 else (6, 14): S.hit('metal', b * 4 + p / 4, 0.45, f=300 + 40 * (p % 3), pan=-0.35)
        elif st == 'blast':
            kp = [0, 2, 4, 8, 10, 12] + ([6, 7, 14, 15] if i % 2 else [14])
            for p in kp: S.hit('kick', b * 4 + p / 4, 1.0 if p % 4 == 0 else 0.75, **K)
            for q in (1, 3): S.hit('snare', b * 4 + q, 1.0, hall=0.1, **SN); S.hit('clap', b * 4 + q, 0.5)
            if four:
                for p in range(8, 16, 2): S.hit('snare', b * 4 + p / 4, 0.55 + 0.05 * p / 2, **SN)
            for p in range(16): h16(b, p, 0.2 + 0.12 * (p % 2 == 0))
            for q in range(4): S.hit('ride', b * 4 + q, 0.32)
            for p in (2, 10): S.hit('metal', b * 4 + p / 4, 0.4, f=420, pan=0.4)
        elif st == 'heart':         # a heartbeat under the drone: lub-dub, faster each phase
            rate = sec.get('heart_rate', 1)
            for k in range(rate):
                at = b * 4 + k * 4 / rate
                S.hit('kick', at, 0.9, **{**K, 'length': 0.5, 'click': 0.3}); S.hit('kick', at + 0.3, 0.6, **{**K, 'length': 0.4, 'click': 0.2})
        elif st == 'dnb':           # two-step: kick 1 and the and of 3, snare 2 and 4, a ghost and a shuffle
            kp = [0, 10] + ([7] if i % 2 else [3]) + ([14] if four else [])
            for p in kp: S.hit('kick', b * 4 + p / 4, 1.0 if p in (0, 10) else 0.7, **K)
            for q in (1, 3): S.hit('snare', b * 4 + q, 1.0, hall=0.12, **SN); S.hit('clap', b * 4 + q, 0.4)
            for p in (6, 15) if i % 2 else (9, 15): S.hit('snare', b * 4 + p / 4, 0.2, **SN)
            for p in range(16): h16(b, p, 0.1 + 0.2 * (p % 4 == 2) + 0.08 * (p % 2 == 0))
            if hot > 0.5:
                for q in range(4): S.hit('ride', b * 4 + q + 0.5, 0.22)
        elif st == 'trap':          # half time with rolling hats: the snare on 3, hats that stutter into the bar
            kp = [0, 7, 10] + ([13] if i % 2 else [])
            for p in kp: S.hit('kick', b * 4 + p / 4, 1.0 if p == 0 else 0.8, **K)
            S.hit('snare', b * 4 + 2, 1.0, hall=0.15, **SN); S.hit('clap', b * 4 + 2, 0.7, hall=0.2)
            for p in range(12): h16(b, p, 0.16 + 0.18 * (p % 4 == 0))
            if i % 2:
                for k in range(8): S.hit('hat', b * 4 + 3 + k / 8, 0.12 + 0.04 * k, pan=0.5 - k / 8)
            else:
                for p in range(12, 16): h16(b, p, 0.2)
            S.hit('ohat', b * 4 + 3.5, 0.28, pan=-0.3)
        if sec.get('tick'):        # the clock: quarter notes, then eighths, then sixteenths as the fight goes on
            rate = sec['tick']
            for k in range(4 * rate):
                S.hit('tick', b * 4 + k / rate, 0.55 if k % rate == 0 else 0.3, tone=2700 if (k // rate) % 2 == 0 else 2000, pan=0.3 if k % 2 else -0.3, hall=0.1)
        if i == 0 and sec.get('impact', True) and st not in ('tick', 'heart'):
            S.hit('crash', b * 4, 0.55 + 0.2 * hot, hall=0.2)
        if i % 8 == 4 and st in ('drive', 'blast', 'dnb'): S.hit('crash', b * 4, 0.3)
        if last: fill(S, T, b, sec['fill'], K, SN, hot)

def st_tick(S, b, rate):
    for k in range(4 * rate):
        S.hit('tick', b * 4 + k / rate, 0.55 if k % rate == 0 else 0.3, tone=2700 if (k // rate) % 2 == 0 else 2000, pan=0.3 if k % 2 else -0.3, hall=0.1)

def fill(S, T, b, kind, K, SN, hot):
    if kind == 'roll':
        for k in range(8): S.hit('snare', b * 4 + 2 + k * 0.25, 0.3 + 0.09 * k, **SN)
        for k in range(8): S.hit('snare', b * 4 + 3 + k * 0.125, 0.55 + 0.05 * k, **SN)
    elif kind == 'toms':
        fs = [196, 165, 147, 123, 110, 98, 82, 73]
        for k in range(8): S.hit('tom', b * 4 + 2 + k * 0.25, 0.75 + 0.03 * k, f=fs[k], pan=0.5 - k / 7)
        S.hit('kick', b * 4 + 3.75, 0.9, **K)
    elif kind == 'kicks':
        for k in range(8): S.hit('kick', b * 4 + 2 + k * 0.25, 0.6 + 0.05 * k, **K)
        for k in range(4): S.hit('snare', b * 4 + 3 + k * 0.25, 0.5 + 0.12 * k, **SN)
    elif kind == 'glitch':
        S.glitch(b * 4 + 3, 1.0, 0.125, pitch_up=True)
    elif kind == 'stop':
        S.hit('snare', b * 4 + 3.5, 0.9, hall=0.4, **SN); S.hit('kick', b * 4 + 3.5, 1.0, **K)

# ---------------------------------------------------------------- bass
def bassline(S, T, b0, sec):
    st = sec.get('bass'); hot = sec.get('hot', 0.5)
    if not st: return
    ch = chords_for(sec)
    cut = 380 + 420 * hot; drv = 2.6 + 1.5 * hot
    BK = dict(cut=cut, env=1500 + 1500 * hot, drive=drv, growl=sec.get('growl', 0.0))
    for i, c in enumerate(ch):
        b = b0 + i; r = T.root('i' if sec.get('pedal') else c)
        # the sub holds the root under everything; the pump gives it its rhythm
        S.note('sub', E.subbass, b * 4, r, 4)
        if st == 'sub': continue
        if st == 'pulse8':
            for e in range(8):
                m = r + (12 if e in (3, 7) and i % 2 else 0)
                S.note('bass', E.bass, b * 4 + e / 2, m, 0.42, **BK)
        elif st == 'offbeat':
            for e in range(4):
                S.note('bass', E.bass, b * 4 + e + 0.5, r + (12 if e == 3 and i % 2 else 0), 0.42, **BK)
        elif st == 'roll16':
            for p in range(16):
                if p % 4 == 0: continue
                m = r + (12 if p in (6, 14) else 0) + (7 if p == 11 and i % 2 else 0)
                S.note('bass', E.bass, b * 4 + p / 4, m, 0.22, **{**BK, 'decay': 0.06})
        elif st == 'riff':
            for p, iv, ln in T.riff:
                S.note('bass', E.bass, b * 4 + p / 4, r + iv, ln / 4 * 0.92, **{**BK, 'decay': 0.08 + 0.02 * ln})
        elif st == 'sustain':
            S.note('bass', E.reese, b * 4, r, 3.9, cut=260 + 250 * hot, drive=2.2 + hot)

# ---------------------------------------------------------------- harmony
def harmony(S, T, b0, sec):
    ch = chords_for(sec); hot = sec.get('hot', 0.5)
    # pads: one chord per run of equal chords
    i = 0
    while i < len(ch):
        j = i
        while j + 1 < len(ch) and ch[j + 1] == ch[i] and (j + 1 - i) < 4: j += 1
        n = j - i + 1
        if sec.get('pad', True):
            S.chord('pad', E.pad, (b0 + i) * 4, T.voicing(ch[i], 57, 3, spread=True), n * 4 - 0.1,
                    cut=900 + 1200 * hot, hall=0.35, gain=0.9)
        if sec.get('choir'):
            S.chord('pad', E.choir, (b0 + i) * 4, T.voicing(ch[i], 69, 3), n * 4 - 0.2, hall=0.5, gain=0.8 * sec['choir'])
        i = j + 1
    arp = sec.get('arp')
    if arp:
        step = 0.25 if arp == '16' else 0.5
        for i, c in enumerate(ch):
            v = T.voicing(c, 69, 3)
            pat = [v[0], v[1], v[2], v[1] + 12, v[2], v[1], v[0] + 12, v[2]]
            for k in range(int(4 / step)):
                b = (b0 + i) * 4 + k * step
                S.note('music', E.pluck, b, pat[k % 8], step, wave='saw', cut=500 + 900 * hot + 300 * (k % 4 == 0),
                       env=2500 + 2000 * hot, decay=0.08, pan=0.45 if k % 2 else -0.45, gain=hum(0.55, 0.12) * sec.get('arpgain', 1.0),
                       delay=0.25, hall=0.12)
    if sec.get('gate'):
        gp = [0, 2, 3, 6, 8, 10, 11, 14]
        for i, c in enumerate(ch):
            v = T.voicing(c, 66, 3) + [T.voicing(c, 66, 1)[0] + 12]
            for p in gp:
                for m in v:
                    S.note('music', E.supersaw, (b0 + i) * 4 + p / 4, m, 0.2, gain=0.35 * sec['gate'], voices=5, cut=1800 + 2500 * hot,
                           env=0.8, rel=0.05, sub=0, hall=0.1, delay=0.05)
    if sec.get('stabs'):
        for i, c in enumerate(ch):
            r = T.root(c, 45, 56)
            v = [r, r + 7, r + 12]
            for p, iv, ln in T.riff:
                if iv: continue
                S.chord('music', E.brass, (b0 + i) * 4 + p / 4, v, max(0.2, ln / 4 * 0.8), cut=900 + 900 * hot, gain=0.6 * sec['stabs'],
                        hall=0.15, swell=0.02)
    ost = sec.get('ost')
    if ost:
        # the suspense ostinato: a low figure around the tonic with a semitone and a tritone in it,
        # tightening from its first rate to its second halfway through, its filter opening as it goes
        rates, pat = ost[0], ost[1]
        r0, r1 = (rates, rates) if not isinstance(rates, tuple) else rates
        n_b = len(ch); k = 0
        for i in range(n_b):
            rate = r0 if i < n_b // 2 else r1
            for j in range(4 * rate):
                b = (b0 + i) * 4 + j / rate
                u = (i * 4 + j / rate) / (n_b * 4)
                m = T.tonic - 12 + pat[k % len(pat)]; k += 1
                S.note('music', E.pluck, b, m, 1 / rate, wave='sq', pw=0.3, cut=350 + 900 * u + 500 * hot, env=1200 + 1800 * u, decay=0.06,
                       gain=(0.5 + 0.35 * u) * (1.0 if j % rate == 0 else 0.7) * ost[2] if len(ost) > 2 else (0.5 + 0.35 * u), pan=0.2 if k % 2 else -0.2, delay=0.12, hall=0.1)
    hits = sec.get('hits')
    if hits:
        for i, c in enumerate(ch):
            if i % hits: continue
            v = T.voicing(c, 52, 3, spread=True)
            S.chord('music', E.brass, (b0 + i) * 4, v, 1.4, cut=900 + 900 * hot, gain=1.1, hall=0.45, swell=0.015)
            S.chord('pad', E.choir, (b0 + i) * 4, T.voicing(c, 66, 3), 1.8, hall=0.6, gain=0.8, att=0.03, rel=0.8)
            S.duck_at((b0 + i) * 4, 0.5)
    if sec.get('siren'):
        for i in range(0, len(ch), 2):
            S.note('fx', lambda m, d: E.siren(m, m + 1, d), (b0 + i) * 4, T.tonic + 12, 7.8, gain=0.5 * sec['siren'], hall=0.3, delay=0.15)
    if sec.get('drone'):
        S.note('pad', E.drone, b0 * 4, T.tonic - 24, len(ch) * 4 - 0.5, gain=0.7 * sec['drone'], hall=0.3)

# ---------------------------------------------------------------- theme
def diatonic(semi, steps, sharp7=False):
    """move a pitch (semitones from the tonic) by scale steps in the minor key"""
    sc = MINOR if not sharp7 else [0, 2, 3, 5, 7, 8, 11]
    o, pc = divmod(semi, 12)
    i = min(range(7), key=lambda k: abs(sc[k] - pc))
    k = i + steps
    return sc[k % 7] + 12 * (o + k // 7)

def theme(S, T, b0, sec):
    th = sec.get('theme')
    if not th: return
    name, inst, octv, opt = (list(th) + [{}])[:4]
    mel = T.melodies[name]
    speed = opt.get('speed', 1.0)
    span = max(o + l for o, _, l in mel) * speed
    reps = max(1, int(round(sec['bars'] * 4 / span))) if opt.get('repeat', True) else 1
    hot = sec.get('hot', 0.5)
    ch = chords_for(sec)
    for rep in range(reps):
        start = b0 * 4 + rep * span + opt.get('at', 0)
        if start >= (b0 + sec['bars']) * 4: break
        last = None
        for o, s, l in mel:
            m = T.tonic + s + 12 * octv
            beat = start + o * speed; ln = l * speed * 0.96
            if beat >= (b0 + sec['bars']) * 4: break
            c = ch[min(len(ch) - 1, int((beat - b0 * 4) // 4))]
            play_note(S, inst, beat, m, ln, hot, {**opt, 'under': below(T, c, m - 2)}, last)
            if opt.get('harm'):
                play_note(S, inst, beat, below(T, c, m), ln, hot, {**opt, 'gain': opt.get('gain', 1.0) * 0.5}, None, pan=-0.25)
            if opt.get('oct') and l * speed >= 1:      # the doubling keeps to the long notes
                play_note(S, opt.get('oct_inst', inst), beat, m + 12 * opt['oct'], ln, hot, {**opt, 'gain': opt.get('gain', 1.0) * opt.get('oct_gain', 0.6)}, None)
            last = m

def below(T, ch, m):
    """the nearest chord tone at least a minor third under m: a harmony line that never rubs"""
    r, iv = CHORDS[ch]
    pcs = {(T.tonic + r + i) % 12 for i in iv}
    for k in range(3, 12):
        if (m - k) % 12 in pcs: return m - k
    return m - 12

def play_note(S, inst, beat, m, ln, hot, opt, last, pan=0.0):
    g = opt.get('gain', 1.0)
    if inst == 'lead':
        glide = last if (last is not None and opt.get('glide') and abs(m - last) <= 5) else None
        S.note('lead', E.supersaw, beat, m, ln, pan=pan, gain=g, cut=3800 + 4500 * hot, vib=0.006 if ln >= 1 else 0.0,
               glide_from=glide, delay=0.18, hall=0.22, sub=0.3)
    elif inst == 'brass':
        S.chord('music', E.brass, beat, [m], ln, pan=pan, gain=1.1 * g, cut=800 + 1100 * hot, hall=0.3, delay=0.05)
    elif inst == 'brass5':     # a low brass section, the theme over a chord tone under it: the theme as a threat
        S.chord('music', E.brass, beat, [opt.get('under', m - 5), m], ln, pan=pan, gain=1.0 * g, cut=700 + 1000 * hot, hall=0.3)
    elif inst == 'bell':
        S.note('music', E.bell, beat, m, ln, pan=pan, gain=0.9 * g, hall=0.45, delay=0.3)
    elif inst == 'pluck':
        S.note('music', E.pluck, beat, m, ln, pan=pan, gain=0.9 * g, cut=900, env=4000, decay=0.15, delay=0.3, hall=0.2, length=min(ln, 1.0) * S.spb)

# ---------------------------------------------------------------- effects
def fx(S, T, b0, sec, nxt=None):
    hot = sec.get('hot', 0.5); bars = sec['bars']
    if sec.get('impact', True) and sec.get('drums') not in (None, 'tick'):
        S.put('fx', b0 * 4, E.impact(2.6, tune=E.hz(T.tonic - 36) if T.tonic - 36 > 20 else 36), gain=0.7 + 0.3 * hot, hall=0.25)
        S.duck_at(b0 * 4, 1.0)
    r = sec.get('riser')
    drop = (nxt or {}).get('drop', 0)
    end = (b0 + bars) * 4 - drop
    if r:
        x = E.riser(r * 4 * S.spb - drop * S.spb)
        S.put('fx', end - len(x) / E.SR / S.spb, x, gain=0.55 + 0.25 * hot, hall=0.2)
        S.put('fx', end - 2, E.reverse_crash(2, S.spb), gain=0.6)
    if drop: S.mute(end, drop)
    for bar, p, ln in sec.get('glitch', []):
        S.glitch((b0 + bar) * 4 + p / 4, ln / 4, 0.125 if ln < 8 else 0.25, pitch_up=ln >= 4)

def section(S, T, b0, sec, nxt=None):
    drums(S, T, b0, sec); bassline(S, T, b0, sec); harmony(S, T, b0, sec); theme(S, T, b0, sec); fx(S, T, b0, sec, nxt)

def arrange(S, T, secs):
    b = 0
    for i, sec in enumerate(secs):
        section(S, T, b, sec, secs[(i + 1) % len(secs)])
        b += sec['bars']
    return b
