"""World Boss music: Syntax Error's theme, in five loops that build with the fight, a beam
face-off cue, two face-off results, a threat layer and the victory sting.

    python3 tools/boss/music.py               everything: audio/wb-*.mp3 and the previews
    python3 tools/boss/music.py p1 fo win     just those

150 bpm in D minor. At 150 a beat is 0.4 s, so the face-off's fixed timings land on beats: the
charge ends 8.8 s in (beat 22, the clash) and resolves at 11.6 s (beat 29). The loops:
    p1 Online          64 bars  half time (the snare on 3): heavy and patient, the theme on low brass
    p2 Corrupted       64 bars  full time, the theme on the lead, the ERR riff on the bass
    p3 Memory leak     64 bars  broken industrial beat, glitch edits, the theme harmonised
    p4 Kernel exposed  48 bars  the hardest groove, the theme in octaves, gated chords
    enrage (panic)     32 bars  up a semitone to Eb minor, a siren, blast drums, the theme doubled
Each loop file holds the loop plus its first second again: players loop from 0.5 s to 0.5 s +
loop length (see BARS in js/app/boss-audio.js). The ERR riff's rhythm is Morse for E-R-R.
Everything is synthesised in tools/music/engine.py, so the files belong to the site.
"""
import os, sys, json, shutil
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'music'))
import engine as E
import score as SC
from score import Theme

BPM = 150
SPB = 60 / BPM
OUT = os.environ.get('WB_OUT') or os.path.join(ROOT, 'audio')
PREV = os.environ.get('WB_PREVIEW') or '/mnt/user-data/outputs/overnight/raid-music'

# ---------------------------------------------------------------- the theme
# semitones from D: D 0, E 2, F 3, G 5, A 7, Bb 8, C 10, C# 11, D' 12
THEME = [
    (0, 12, 1.5), (1.5, 14, 0.5), (2, 15, 2),                  # Dm   D  E  F          the head: "Syn-tax Er-ror"
    (4, 20, 1.5), (5.5, 19, 0.5), (6, 15, 1), (7, 12, 1),      # Bb   Bb A  F  D
    (8, 17, 1.5), (9.5, 15, 0.5), (10, 12, 1), (11, 8, 1),     # Gm   G  F  D  Bb
    (12, 7, 3), (15, 11, 1),                                   # A    A  ...  C#
    (16, 12, 1.5), (17.5, 14, 0.5), (18, 15, 1), (19, 19, 1),  # Dm   D  E  F  A
    (20, 24, 2), (22, 22, 1), (23, 20, 1),                     # Bb   D' C' Bb
    (24, 20, 1.5), (25.5, 19, 0.5), (26, 17, 1), (27, 15, 1),  # Gm   Bb A  G  F
    (28, 14, 2), (30, 11, 1), (31, 7, 1),                      # A    E  C# A
]
HEAD = [n for n in THEME if n[0] < 16]
ANSWER = [(o - 16, s, l) for o, s, l in THEME if o >= 16]
# a counter line for the last phases: long notes a sixth over the theme's bass
COUNTER = [(0, 21, 4), (4, 22, 4), (8, 22, 4), (12, 23, 4), (16, 24, 4), (20, 26, 4), (24, 26, 2), (26, 24, 2), (28, 23, 4)]
# the ERR riff: Morse E (.) R (.-.) R (.-.) in sixteenths: (onset, semitones over the root, length)
RIFF = [(0, 0, 1), (3, 0, 1), (4, 12, 3), (7, 0, 1), (10, 0, 1), (11, 7, 3), (14, 12, 1)]

PA = ['i', 'VI', 'iv', 'V']                               # the theme's chords: Dm Bb Gm A
PB = ['i', 'i', 'bII', 'bII', 'i', 'i', 'VII', 'V']       # menace: Dm Dm Eb Eb Dm Dm C A
PC = ['i', 'i', 'VI', 'VI', 'iv', 'iv', 'V', 'V']        # the breakdown: the theme's chords at half speed, under the theme at half speed
PD = ['i', 'bII', 'i', 'bII', 'i', 'bII', 'VII', 'V']     # the panic: Dm Eb Dm Eb Dm Eb C A
PF = ['VI', 'iv']                                        # under the theme's head at double speed: Bb Gm

def make_theme(tonic=62):
    return Theme(tonic, BPM, {'theme': THEME, 'head': HEAD, 'answer': ANSWER, 'counter': COUNTER}, RIFF,
                 {'A': PA, 'B': PB, 'C': PC, 'D': PD}, kick_tune=52.0, name='Syntax Error')

def sec(bars, prog, **kw):
    d = dict(bars=bars, prog=prog); d.update(kw); return d

# ---------------------------------------------------------------- the loops
ARR = {
    # Online: half time. Patient and heavy, a heartbeat of 8th bass under it, the theme on low brass.
    'p1': [
        sec(8, PB, drums='half', bass='pulse8', arp='16', arpgain=0.6, hot=0.25),
        sec(8, PB, drums='half', bass='pulse8', arp='16', stabs=0.8, hot=0.35, fill='toms', riser=2),
        sec(8, PA, drums='half', bass='pulse8', arp='8', theme=('head', 'brass5', -1, {}), hot=0.35),
        sec(8, PA, drums='half', bass='pulse8', arp='16', theme=('theme', 'brass5', -1, {}), hot=0.45, fill='roll', riser=2),
        sec(8, PC, drums='tick', bass='sustain', choir=0.8, theme=('head', 'bell', 0, {'gain': 0.8, 'speed': 2.0}), hot=0.2, fill='roll', riser=2, impact=False),
        sec(8, PB, drums='half', bass='riff', arp='16', stabs=1.0, hot=0.5),
        sec(8, PA, drums='half', bass='pulse8', arp='16', theme=('theme', 'brass5', -1, {}), choir=0.5, hot=0.55, fill='toms', riser=1),
        sec(8, PB, drums='half', bass='riff', arp='16', stabs=0.9, hot=0.5, fill='kicks', riser=2),
    ],
    # Corrupted: four on the floor, the lead takes the theme.
    'p2': [
        sec(8, PB, drums='drive', bass='roll16', arp='16', stabs=0.9, hot=0.5),
        sec(8, PA, drums='drive', bass='offbeat', arp='16', theme=('theme', 'lead', 0, {'glide': True}), hot=0.55, fill='roll', riser=1),
        sec(8, PA, drums='drive', bass='roll16', arp='16', theme=('theme', 'lead', 0, {'glide': True, 'oct': -1, 'oct_inst': 'brass'}), choir=0.5, hot=0.6, fill='toms', riser=2),
        sec(8, PC, drums='half', bass='sustain', choir=0.9, arp='8', theme=('answer', 'lead', 0, {'gain': 0.7, 'speed': 2.0}), hot=0.35, fill='roll', riser=2, impact=False),
        sec(8, PB, drums='drive', bass='riff', stabs=1.0, arp='16', hot=0.6, glitch=[(7, 12, 4)]),
        sec(8, PA, drums='drive', bass='offbeat', arp='16', theme=('theme', 'lead', 0, {'glide': True}), gate=0.6, hot=0.65, fill='roll', riser=1),
        sec(8, PD, drums='drive', bass='roll16', gate=0.9, stabs=0.7, hot=0.7, fill='kicks', riser=1),
        sec(8, PA, drums='drive', bass='riff', arp='16', theme=('head', 'lead', 0, {'glide': True, 'oct': -1, 'oct_inst': 'brass'}), hot=0.65, fill='toms', riser=2),
    ],
    # Memory leak: a broken beat locked to the riff, glitch edits, the theme in harmony.
    'p3': [
        sec(8, PB, drums='break', bass='riff', stabs=1.0, arp='16', hot=0.6, growl=0.4, glitch=[(3, 12, 4), (7, 8, 8)]),
        sec(8, PA, drums='break', bass='riff', theme=('theme', 'lead', 0, {'harm': True, 'glide': True}), choir=0.6, hot=0.65, fill='glitch', growl=0.3),
        sec(8, PB, drums='drive', bass='roll16', stabs=1.0, gate=0.7, hot=0.7, glitch=[(1, 14, 2), (5, 14, 2)], fill='toms', riser=1),
        sec(8, PA, drums='break', bass='offbeat', arp='16', theme=('theme', 'lead', 0, {'harm': True, 'oct': -1, 'oct_inst': 'brass'}), hot=0.7, glitch=[(3, 12, 4), (7, 12, 4)], fill='roll', riser=2),
        sec(8, PC, drums='tick', bass='sustain', choir=1.0, theme=('head', 'bell', 1, {'gain': 0.7, 'speed': 2.0}), drone=0.6, hot=0.3, fill='roll', riser=2, impact=False),
        sec(8, PA, drums='drive', bass='roll16', gate=0.8, theme=('theme', 'lead', 0, {'harm': True, 'glide': True}), choir=0.7, hot=0.75, fill='kicks', riser=1),
        sec(8, PD, drums='break', bass='riff', stabs=1.0, arp='16', hot=0.75, growl=0.5, glitch=[(1, 8, 8), (5, 12, 4)], fill='glitch'),
        sec(8, PA, drums='drive', bass='riff', theme=('head', 'lead', 0, {'harm': True, 'oct': -1, 'oct_inst': 'brass'}), stabs=0.6, hot=0.75, fill='toms', riser=2),
    ],
    # Kernel exposed: everything on, the theme in octaves with a counter line over it.
    'p4': [
        sec(8, PA, drums='drive', bass='roll16', arp='16', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass', 'glide': True}), choir=0.6, hot=0.8),
        sec(8, PB, drums='break', bass='riff', stabs=1.0, gate=0.8, hot=0.85, growl=0.5, glitch=[(3, 12, 4)], fill='toms', riser=1),
        sec(8, PA, drums='blast', bass='roll16', theme=('theme', 'lead', 0, {'harm': True, 'oct': -1, 'oct_inst': 'brass'}), choir=0.8, hot=0.85, fill='roll', riser=2),
        sec(8, PC, drums='half', bass='sustain', choir=1.0, gate=0.5, theme=('answer', 'lead', 0, {'gain': 0.75, 'speed': 2.0}), hot=0.55, fill='roll', riser=4, impact=False),
        sec(8, PA, drums='blast', bass='riff', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass'}), gate=0.7, choir=0.9, hot=0.9, fill='kicks', riser=1),
        sec(8, PD, drums='drive', bass='roll16', stabs=1.0, arp='16', hot=0.9, glitch=[(7, 8, 8)], fill='toms', riser=2),
    ],
    # Kernel panic: up a semitone, a siren, the theme at double speed then in octaves.
    'enrage': [
        sec(8, PF, drums='blast', bass='roll16', siren=0.8, theme=('head', 'lead', 0, {'speed': 0.5}), stabs=0.8, hot=0.95, growl=0.6, glitch=[(7, 12, 4)]),
        sec(8, PA, drums='drive', bass='riff', siren=0.6, theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass'}), gate=0.8, choir=0.8, hot=1.0, fill='roll', riser=1),
        sec(8, PB, drums='break', bass='riff', stabs=1.0, siren=0.8, arp='16', hot=1.0, growl=0.7, glitch=[(3, 8, 8), (7, 12, 4)], fill='toms', riser=1),
        sec(8, PA, drums='blast', bass='roll16', theme=('theme', 'lead', 0, {'harm': True, 'oct': -1, 'oct_inst': 'brass'}), choir=1.0, gate=0.6, hot=1.0, fill='kicks', riser=2),
    ],
}
TONIC = {'p1': 62, 'p2': 62, 'p3': 62, 'p4': 62, 'enrage': 63}
LUFS = {'p1': -15.5, 'p2': -15.0, 'p3': -15.0, 'p4': -14.6, 'enrage': -14.4}
MIX = {   # per-loop bus balance on top of the Song defaults: phase 1 leans on its brass
    'p1': dict(music=1.35, sub=0.6), 'p2': {}, 'p3': {}, 'p4': {}, 'enrage': {},
}

def build_loop(name, seed=1):
    E.seed(seed)
    secs = ARR[name]
    bars = sum(s['bars'] for s in secs)
    S = E.Song(BPM, bars)
    S.gain.update(MIX.get(name, {}))
    T = make_theme(TONIC[name])
    SC.arrange(S, T, secs)
    return S

# ---------------------------------------------------------------- the face-off cue
# beats from the face-off's start: the boss breaks off (0-4.5), the charge (4.5-22), the clash
# (22-29), the result (29). The bars are laid so the clash is a downbeat: bar lines at 2, 6, 10...
FO_CLASH, FO_RESOLVE, FO_HOLD = 22, 29, 8

def build_faceoff():
    E.seed(5)
    T = make_theme(62)
    S = E.Song(BPM, 11, tail=3, loop=False)
    tn = T.tonic
    K = dict(tune=T.kick_tune, punch=1.2, drive=2.6)
    SN = dict(tone=185, bright=9000)
    # the break-off: a hit and a fall, then a low drone that rises with the charge
    S.put('fx', 0, E.impact(3.0), gain=0.9, hall=0.3)
    S.put('fx', 0.1, E.downer(1.6), gain=0.5)
    S.note('pad', E.drone, 1.0, tn - 24, FO_CLASH - 1.5, gain=0.9, hall=0.3)
    # the charge: chords a bar each, the head of the theme at half speed on low brass and choir
    prog = [(2, 'i', 38), (6, 'i', 38), (10, 'III', 41), (14, 'iv', 43), (18, 'VI', 46)]     # the bass climbs D F G Bb into the clash
    for at, c, _ in prog:
        S.chord('pad', E.pad, at, T.voicing(c, 57, 3, spread=True), 4, cut=700 + 120 * at, hall=0.4, gain=0.8)
        if at >= 10: S.chord('pad', E.choir, at, T.voicing(c, 69, 3), 4, hall=0.5, gain=0.5 + 0.03 * at)
    for o, s, l in HEAD[:7]:
        b = 6 + o * 2
        if b >= FO_CLASH - 0.5: break
        S.chord('music', E.brass, b, [tn + s - 12, tn + s - 5], min(l * 2, FO_CLASH - 0.5 - b) * 0.97, cut=700 + 60 * b, gain=1.0, hall=0.35)
    # the bass comes in at bar 3 and pushes harder each bar
    for at, c, r in prog[2:]:
        S.note('sub', E.subbass, at, r, 4)
        for e in range(8 if at < 18 else 14):
            b = at + e * (0.5 if at < 18 else 0.25)
            if b >= FO_CLASH - 0.5: break
            S.note('bass', E.bass, b, r + (12 if e % 4 == 3 else 0), 0.4 if at < 18 else 0.22, cut=300 + 25 * at, env=1800 + 60 * at, drive=3)
    # percussion: toms like a war drum, then a kick, a snare that speeds up, and the clock
    for b in (2, 3.5, 4):
        S.hit('tom', b, 0.8, f=82, pan=0.0)
    for k in range(int((FO_CLASH - 0.5 - 6) * 1)):
        b = 6 + k
        S.hit('kick', b, 0.75 + 0.015 * k, **K)
        if b >= 10: S.hit('tom', b + 0.5, 0.5, f=110 + 4 * k, pan=0.3 if k % 2 else -0.3)
    step = {10: 1.0, 14: 0.5, 18: 0.25}
    b = 10.0
    while b < FO_CLASH - 0.5:
        st = 0.125 if b >= 20 else step[max(k for k in step if k <= b)]
        S.hit('snare', b, 0.25 + 0.7 * ((b - 10) / 12) ** 1.4, hall=0.15, **SN)
        b += st
    for p in range(int((FO_CLASH - 0.5 - 2) * 4)):
        S.hit('hat', 2 + p / 4, 0.1 + 0.25 * (p / 80) + 0.12 * (p % 4 == 0), pan=0.2 if p % 2 else -0.2)
    S.put('fx', 4.5, E.riser((FO_CLASH - 0.5 - 4.5) * SPB, 150, 7000), gain=0.85)
    # the clash: everything on a downbeat
    S.put('fx', FO_CLASH, E.impact(3.2), gain=1.0, hall=0.3); S.duck_at(FO_CLASH, 1.0)
    S.hit('crash', FO_CLASH, 0.9, hall=0.3); S.hit('crash', FO_CLASH + 0.02, 0.5, pan=0.5)
    S.chord('music', E.brass, FO_CLASH, [tn - 12, tn - 5, tn, tn + 3], 4, cut=2400, gain=1.2, hall=0.4)
    S.chord('pad', E.choir, FO_CLASH, [tn + 3, tn + 7, tn + 12], 7, hall=0.5, gain=1.0)
    for b in range(7):
        S.hit('kick', FO_CLASH + b, 1.0, **K)
        if b % 2 == 1: S.hit('snare', FO_CLASH + b, 1.0, **SN); S.hit('clap', FO_CLASH + b, 0.5)
        for p in range(4): S.hit('hat', FO_CLASH + b + p / 4, 0.25 + 0.1 * (p == 2))
        S.hit('ride', FO_CLASH + b, 0.3)
    # the struggle: the head motif climbing a step each beat in sixteenths, the bass rolling
    climb = [[0, 2, 3, 7], [2, 3, 5, 8], [3, 5, 7, 10], [5, 7, 8, 12], [7, 8, 11, 14], [8, 11, 12, 15], [11, 12, 14, 17]]
    chords = ['i', 'i', 'i', 'i', 'V', 'V', 'V']
    for b, notes in enumerate(climb):
        for p, s in enumerate(notes):
            S.note('lead', E.supersaw, FO_CLASH + b + p / 4, tn + 12 + s, 0.24, cut=3500 + 400 * b, env=0.6, gain=0.85, delay=0.08, hall=0.15, sub=0.2)
        r = T.root(chords[b])
        S.note('sub', E.subbass, FO_CLASH + b, r, 1)
        for p in (1, 2, 3): S.note('bass', E.bass, FO_CLASH + b + p / 4, r + (12 if p == 2 else 0), 0.22, cut=600, env=3000, drive=3.5, decay=0.05)
    for k in range(4): S.hit('tom', FO_CLASH + 6 + k * 0.25, 0.8, f=[147, 123, 98, 82][k])
    # the hold after the clash: the dominant held, a soft roll that grows, in case the result is late
    H = FO_RESOLVE
    S.chord('pad', E.pad, H, T.voicing('V', 57, 3, spread=True), FO_HOLD, cut=1400, hall=0.4, gain=0.9)
    S.chord('pad', E.choir, H, T.voicing('V', 69, 3), FO_HOLD, hall=0.5, gain=0.7)
    S.note('pad', E.drone, H, tn - 17, FO_HOLD, gain=0.7)
    for k in range(FO_HOLD * 8): S.hit('snare', H + k / 8, 0.08 + 0.3 * k / (FO_HOLD * 8), **SN)
    S.put('fx', H, E.riser(FO_HOLD * SPB, 300, 5000, tone=False), gain=0.5)
    x = S.mixdown()
    # the charge is a crescendo: it starts well under the clash and grows into it
    g = np.ones(len(x))
    s1, s2, s3 = S.s(1), S.s(2.5), S.s(FO_CLASH - 0.5)
    g[s1:s2] = np.linspace(1, 0.5, s2 - s1)
    g[s2:s3] = 0.5 + 0.5 * np.linspace(0, 1, s3 - s2) ** 1.6
    # the breath before the clash: everything stops for half a beat
    a, b = S.s(FO_CLASH - 0.5), S.s(FO_CLASH) - 40
    g[a:b] = 0.04; g[a - 300:a] = np.linspace(g[a - 300], 0.04, 300)
    x *= g[:, None]
    return x

def build_fo_result(win):
    E.seed(9 if win else 10)
    T = make_theme(62); tn = T.tonic
    S = E.Song(BPM, 4, tail=4, loop=False)
    K = dict(tune=T.kick_tune, punch=1.2, drive=2.6)
    S.put('fx', 0, E.impact(3.2), gain=1.0, hall=0.3); S.duck_at(0, 1.0)
    S.hit('kick', 0, 1.0, **K); S.hit('crash', 0, 0.9, hall=0.35)
    if win:
        maj = [tn - 12, tn - 5, tn - 12 + 4, tn]
        S.chord('music', E.brass, 0, maj, 3.5, cut=2600, gain=1.1, hall=0.45)
        S.chord('pad', E.choir, 0, [tn + 4, tn + 7, tn + 12], 4, hall=0.6, gain=1.0)
        for o, s, l in [(0, 12, 1.5), (1.5, 14, 0.5), (2, 16, 2)]:      # the head in D major
            S.note('lead', E.supersaw, o, tn + s, l * 0.95, cut=5500, gain=1.0, delay=0.25, hall=0.3, vib=0.006)
        S.note('sub', E.subbass, 0, 38, 4)
        for k, f in enumerate([98, 110, 123, 147]): S.hit('tom', 2 + k * 0.5, 0.7, f=f)
        S.hit('snare', 3.5, 0.8, hall=0.3)
    else:
        S.chord('music', E.brass, 0, [tn - 23, tn - 16, tn - 11], 1.5, cut=1200, gain=1.2, hall=0.4)   # Eb, a half step over home
        S.chord('music', E.brass, 1.5, [tn - 24, tn - 17, tn - 12, tn - 9], 2.5, cut=900, gain=1.2, hall=0.45)
        S.chord('pad', E.choir, 0, [tn - 2, tn + 1, tn + 3], 4, hall=0.6, gain=0.8, vowel='oh')
        n = int(E.SR * 2.2); t = E.secs(n)
        dive = E.sat(E.lp4(E.saw(E.hz(38) * 2 ** (-t * 0.9), n) + E.saw(E.hz(38) * 1.01 * 2 ** (-t * 0.9), n), 900 * np.exp(-t * 1.2) + 120, 0.4), 3) * np.exp(-t / 0.9) * 0.5
        S.put('bass', 0, dive); S.note('sub', E.subbass, 0, 38, 2.5)
        S.hit('tom', 1.5, 0.9, f=73); S.hit('tom', 2, 0.8, f=65)
    return S.mixdown()

def build_victory():
    E.seed(21)
    T = make_theme(62); tn = T.tonic
    S = E.Song(BPM, 6, tail=4, loop=False)
    K = dict(tune=T.kick_tune, punch=1.1, drive=2.4)
    SN = dict(tone=185, bright=8000)
    # D major's head, then bVI - bVII - I: the triumphant turn of the theme
    prog = [(0, [tn, tn + 4, tn + 7], 38), (4, [tn - 1, tn + 2, tn + 7], 43), (8, [tn - 4, tn + 2, tn + 5], 34), (12, [tn - 2, tn + 4, tn + 7], 36), (16, [tn, tn + 4, tn + 7], 38)]
    mel = [(0, 12, 1.5), (1.5, 14, 0.5), (2, 16, 2), (4, 23, 1.5), (5.5, 21, 0.5), (6, 18, 1), (7, 14, 1),
           (8, 17, 2), (10, 14, 1), (11, 17, 1), (12, 19, 2), (14, 16, 1), (15, 19, 1), (16, 21, 6)]
    for at, ch, r in prog:
        ln = 4 if at < 16 else 7
        S.chord('music', E.brass, at, [m - 12 for m in ch], ln * 0.97, cut=1800, gain=0.9, hall=0.45)
        S.chord('pad', E.choir, at, [m + 12 for m in ch], ln, hall=0.6, gain=0.75)
        S.chord('pad', E.pad, at, [ch[0] - 12] + ch, ln, cut=2200, hall=0.4, gain=0.7)
        S.note('sub', E.subbass, at, r, ln)
        S.note('bass', E.reese, at, r, ln * 0.95, cut=500, drive=2)
    for o, s, l in mel:
        S.note('lead', E.supersaw, o, tn + s, l * 0.95, cut=5200, gain=0.95, delay=0.22, hall=0.35, vib=0.006, sub=0.25)
    for at in (0, 4, 8, 12):
        S.hit('kick', at, 1.0, **K); S.hit('crash', at, 0.6 if at else 0.9, hall=0.3)
        S.hit('snare', at + 2, 0.9, hall=0.25, **SN); S.hit('kick', at + 2.5, 0.7, **K)
        for p in range(8): S.hit('hat', at + p / 2, 0.2)
    for k in range(8): S.hit('tom', 14 + k * 0.25, 0.7 + 0.03 * k, f=[196, 165, 147, 123, 110, 98, 82, 73][k])
    S.put('fx', 16, E.impact(3.5), gain=1.0, hall=0.4); S.hit('kick', 16, 1.0, **K); S.hit('crash', 16, 1.0, hall=0.4); S.duck_at(16, 1.0)
    S.put('fx', 12, E.riser(4 * SPB), gain=0.6)
    return S.mixdown()

def build_threat():
    """the layer that rises while an attack word is up: a ticking clock and a high D pip, no bass"""
    E.seed(31)
    S = E.Song(BPM, 4)
    for b in range(4):
        for p in range(16):
            S.hit('hat', b * 4 + p / 4 + (0.02 if p % 2 else 0), 0.35 + 0.35 * (p % 4 == 0) + 0.15 * (p % 2 == 0), pan=0.35 if p % 2 else -0.35, length=0.03)
        for q in range(4):
            S.hit('metal', b * 4 + q + 0.5, 0.35, f=880, pan=0.5 if q % 2 else -0.5)
            S.note('music', E.pluck, b * 4 + q, 86, 0.2, wave='sq', cut=3000, env=3000, decay=0.05, gain=0.35, delay=0.3)
        S.put('fx', b * 4, E.riser(4 * SPB, 1500, 9000, tone=False), gain=0.25)
    S.pump = {k: 0 for k in S.pump}
    return S.mixdown(drum_glue=False)

# ---------------------------------------------------------------- output
def mp3(name, x, lufs, loop, bitrate='112k'):
    path = os.path.join(OUT, f'{name}.mp3')
    res, y = E.master_to(x, path, lufs=lufs, loop=loop, bitrate=bitrate)
    res['kb'] = os.path.getsize(path) // 1024
    res['secs'] = round(len(y) / E.SR, 3)
    print(f'{name}: {res}', flush=True)
    return res, y

JOBS = ['p1', 'p2', 'p3', 'p4', 'enrage', 'fo', 'fo-win', 'fo-lose', 'win', 'threat']

def main(which):
    os.makedirs(PREV, exist_ok=True)
    table_path = os.path.join(PREV, 'loudness.json')
    table = json.load(open(table_path)) if os.path.exists(table_path) else {}
    for j in which:
        if j in ARR:
            S = build_loop(j)
            res, y = mp3(f'wb-{j}', S.mixdown(), LUFS[j], True)
            res['bars'] = S.bars
        elif j == 'fo': res, y = mp3('wb-fo', build_faceoff(), -15.5, False)
        elif j == 'fo-win': res, y = mp3('wb-fo-win', build_fo_result(True), -15.0, False)
        elif j == 'fo-lose': res, y = mp3('wb-fo-lose', build_fo_result(False), -15.0, False)
        elif j == 'win': res, y = mp3('wb-win', build_victory(), -14.5, False, '128k')
        elif j == 'threat': res, y = mp3('wb-threat', build_threat(), -22.0, True)
        table[j] = res
        np.save(os.path.join('/tmp', f'wb-{j}.npy'), y.astype(np.float32))
    json.dump(table, open(table_path, 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1:] or JOBS)
