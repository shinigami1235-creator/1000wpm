"""Superboss music: a theme of its own for each of the three bosses, one loop per phase, built
like a streamed main event (each loop: the groove, the theme, a breakdown that builds, the drop).

    python3 tools/music/superboss.py                    every loop: audio/sb-<boss>-<phase>.mp3
    python3 tools/music/superboss.py hydra-3 compiler    one loop, or all of a boss

    Kernel Hydra      140 bpm, E Phrygian dominant (E F G# A B C D): a snake of a theme, three heads
                      biting in the riff (E E F E). Half time with rolling hats, then four on the floor,
                      then everything.
    The Compiler      132 bpm, F# minor: a sequencer theme in 3+3+2 over a constant 16th arp, like
                      code scrolling. Four on the floor, then a broken beat, then blast.
    Packet Leviathan  174 bpm drum and bass, C minor: a long, slow theme that circles over a rolling
                      two-step and a reese bass.

Each file holds the loop plus its first second again; js/app/sb-audio.js loops from 0.5 s to 0.5 s +
the loop (LOOPS there). Made with tools/music/engine.py, so the files belong to the site.
"""
import os, sys, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import engine as E
import score as SC
from score import Theme

OUT = os.environ.get('SB_OUT') or os.path.join(ROOT, 'audio')
PREV = os.environ.get('SB_PREVIEW') or '/mnt/user-data/outputs/overnight/raid-music/superboss'
LUFS = -15.5

def sec(bars, prog, **kw):
    d = dict(bars=bars, prog=prog); d.update(kw); return d

# ---------------------------------------------------------------- Kernel Hydra
# semitones from E: F 1, G# 4, A 5, B 7, C 8, D 10, E' 12
HY_THEME = [
    (0, 12, 0.75), (0.75, 13, 0.75), (1.5, 16, 1), (2.5, 13, 0.5), (3, 12, 1),        # I    E F G# F E
    (4, 17, 1.5), (5.5, 16, 0.5), (6, 13, 1), (7, 12, 1),                              # iv   A G# F E
    (8, 12, 0.75), (8.75, 13, 0.75), (9.5, 16, 1), (10.5, 19, 1.5),                    # I    E F G# B
    (12, 20, 1.5), (13.5, 19, 0.5), (14, 17, 1), (15, 16, 1),                          # iv   C B A G#
    (16, 12, 1.5), (17.5, 13, 0.5), (18, 12, 1), (19, 8, 1),                           # VI   E F E C
    (20, 10, 2), (22, 8, 1), (23, 7, 1),                                               # dm   D C B
    (24, 8, 1.5), (25.5, 7, 0.5), (26, 5, 1), (27, 4, 1),                              # iv   C B A G#
    (28, 1, 2), (30, 0, 2),                                                            # bII  F E
]
HY = dict(
    theme=Theme(64, 140, {'theme': HY_THEME, 'head': [n for n in HY_THEME if n[0] < 16]},
                [(0, 0, 2), (2, 0, 1), (3, 13, 2), (6, 0, 1), (8, 0, 2), (10, 12, 1), (11, 13, 2), (14, 0, 1)],
                {}, kick_tune=49.0, name='Kernel Hydra'),
    A=['I', 'iv', 'I', 'iv', 'VI', 'bviim', 'iv', 'bII'],
    B=['I', 'I', 'bII', 'bII', 'I', 'I', 'bII', 'I'],
    C=['I', 'I', 'iv', 'iv', 'I', 'I', 'iv', 'iv'],
)

# ---------------------------------------------------------------- The Compiler
# semitones from F#: G# 2, A 3, B 5, C# 7, D 8, E 10, E# 11, F#' 12
CO_THEME = [
    (0, 12, 0.75), (0.75, 15, 0.75), (1.5, 19, 0.5), (2, 17, 1), (3, 15, 1),          # i    F# A C# B A
    (4, 20, 1.5), (5.5, 19, 0.5), (6, 17, 1), (7, 12, 1),                              # VI   D C# B F#
    (8, 15, 0.75), (8.75, 19, 0.75), (9.5, 22, 0.5), (10, 20, 1), (11, 19, 1),         # III  A C# E D C#
    (12, 17, 3), (15, 14, 1),                                                          # VII  B  G#
    (16, 12, 0.75), (16.75, 15, 0.75), (17.5, 19, 0.5), (18, 17, 1), (19, 15, 1),      # i
    (20, 20, 1.5), (21.5, 19, 0.5), (22, 17, 1), (23, 12, 1),                          # VI
    (24, 15, 1.5), (25.5, 17, 0.5), (26, 19, 2),                                       # VI   A B C#
    (28, 19, 2), (30, 14, 2),                                                          # V    C# G#
]
CO = dict(
    theme=Theme(66, 132, {'theme': CO_THEME, 'head': [n for n in CO_THEME if n[0] < 16]},
                [(0, 0, 1), (2, 0, 1), (3, 12, 1), (5, 0, 1), (6, 7, 1), (8, 0, 1), (10, 12, 1), (11, 0, 1), (13, 7, 1), (14, 7, 2)],
                {}, kick_tune=51.0, name='The Compiler'),
    A=['i', 'VI', 'III', 'VII', 'i', 'VI', 'VI', 'V'],
    B=['i', 'i', 'VI', 'VII'],
    C=['i', 'i', 'VI', 'VI', 'III', 'III', 'VII', 'VII'],
)

# ---------------------------------------------------------------- Packet Leviathan
# semitones from C: D 2, Eb 3, F 5, G 7, Ab 8, Bb 10, C' 12
LV_THEME = [
    (0, 12, 2), (2, 15, 1), (3, 14, 1),            # i    C Eb D
    (4, 10, 3), (7, 7, 1),                         # v    Bb G
    (8, 8, 2), (10, 12, 1), (11, 15, 1),           # VI   Ab C Eb
    (12, 14, 4),                                   # V    D
    (16, 12, 2), (18, 15, 1), (19, 19, 1),         # i    C Eb G
    (20, 20, 3), (23, 19, 1),                      # VI   Ab G
    (24, 17, 2), (26, 15, 1), (27, 14, 1),         # iv   F Eb D
    (28, 12, 4),                                   # i    C
]
LV = dict(
    theme=Theme(60, 174, {'theme': LV_THEME, 'head': [n for n in LV_THEME if n[0] < 16]},
                [(0, 0, 3), (3, 0, 1), (6, 12, 2), (10, 0, 3), (13, 12, 1), (14, 7, 2)],
                {}, kick_tune=50.0, name='Packet Leviathan'),
    A=['i', 'v', 'VI', 'V', 'i', 'VI', 'iv', 'i'],
    B=['i', 'i', 'VI', 'VII'],
    C=['i', 'i', 'v', 'v', 'VI', 'VI', 'V', 'V'],
)

def hydra(p):
    A, B, C = HY['A'], HY['B'], HY['C']
    if p == 1: return [
        sec(8, B, drums='trap', bass='riff', stabs=0.8, arp='8', hot=0.4),
        sec(8, A, drums='trap', bass='pulse8', theme=('theme', 'brass5', -1, {}), choir=0.4, hot=0.45, fill='toms', riser=2),
        sec(8, C, drums='tick', bass='sustain', choir=0.9, theme=('head', 'bell', 0, {'speed': 2.0, 'gain': 0.8}), hot=0.25, fill='roll', riser=2, impact=False),
        sec(8, A, drums='trap', bass='riff', theme=('theme', 'lead', 0, {'glide': True}), stabs=0.6, hot=0.55, fill='kicks', riser=1),
    ]
    if p == 2: return [
        sec(8, B, drums='drive', bass='riff', stabs=1.0, arp='16', hot=0.6, growl=0.3),
        sec(8, A, drums='drive', bass='roll16', theme=('theme', 'lead', 0, {'glide': True, 'oct': -1, 'oct_inst': 'brass'}), hot=0.65, fill='roll', riser=1),
        sec(8, C, drums='trap', bass='sustain', choir=0.9, gate=0.5, theme=('head', 'lead', 0, {'speed': 2.0, 'gain': 0.75}), hot=0.45, fill='roll', riser=2, impact=False),
        sec(8, A, drums='drive', bass='riff', theme=('theme', 'lead', 0, {'harm': True, 'glide': True}), gate=0.7, choir=0.6, hot=0.75, fill='toms', riser=2),
    ]
    return [
        sec(8, B, drums='blast', bass='riff', stabs=1.0, arp='16', hot=0.85, growl=0.6, glitch=[(7, 12, 4)]),
        sec(8, A, drums='blast', bass='roll16', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass', 'harm': True}), choir=0.9, hot=0.9, fill='kicks', riser=1),
        sec(8, C, drums='trap', bass='sustain', choir=1.0, gate=0.7, theme=('head', 'lead', 0, {'speed': 2.0}), drone=0.5, hot=0.6, fill='roll', riser=4, impact=False),
        sec(8, A, drums='blast', bass='riff', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass'}), gate=0.8, choir=1.0, stabs=0.6, hot=1.0, fill='toms', riser=2),
    ]

def compiler(p):
    A, B, C = CO['A'], CO['B'], CO['C']
    if p == 1: return [
        sec(8, B, drums='drive', bass='offbeat', arp='16', arpgain=1.2, hot=0.4),
        sec(8, A, drums='drive', bass='offbeat', arp='16', theme=('theme', 'pluck', 0, {}), hot=0.45, fill='glitch', riser=1),
        sec(8, C, drums='tick', bass='sustain', arp='16', arpgain=0.8, choir=0.6, theme=('head', 'bell', 0, {'speed': 2.0}), hot=0.3, fill='roll', riser=2, impact=False),
        sec(8, A, drums='drive', bass='riff', arp='16', theme=('theme', 'lead', 0, {}), hot=0.55, fill='toms', riser=1, glitch=[(3, 14, 2)]),
    ]
    if p == 2: return [
        sec(8, B, drums='break', bass='riff', arp='16', stabs=0.9, hot=0.6, glitch=[(3, 12, 4)]),
        sec(8, A, drums='break', bass='roll16', arp='16', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'pluck'}), hot=0.65, fill='glitch', riser=1),
        sec(8, C, drums='half', bass='sustain', arp='16', choir=0.8, theme=('head', 'lead', 0, {'speed': 2.0, 'gain': 0.75}), hot=0.45, fill='roll', riser=2, impact=False),
        sec(8, A, drums='drive', bass='riff', arp='16', gate=0.6, theme=('theme', 'lead', 0, {'harm': True}), hot=0.75, fill='kicks', riser=2, glitch=[(7, 12, 4)]),
    ]
    return [
        sec(8, B, drums='blast', bass='roll16', arp='16', stabs=1.0, hot=0.85, growl=0.4, glitch=[(1, 12, 4), (5, 12, 4)]),
        sec(8, A, drums='blast', bass='riff', arp='16', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass', 'harm': True}), choir=0.7, hot=0.9, fill='glitch', riser=1),
        sec(8, C, drums='half', bass='sustain', arp='16', gate=0.7, choir=1.0, theme=('head', 'lead', 0, {'speed': 2.0}), hot=0.6, fill='roll', riser=4, impact=False),
        sec(8, A, drums='blast', bass='roll16', arp='16', gate=0.8, theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass'}), choir=0.9, hot=1.0, fill='toms', riser=2, glitch=[(7, 8, 8)]),
    ]

def leviathan(p):
    A, B, C = LV['A'], LV['B'], LV['C']
    if p == 1: return [
        sec(8, B, drums='dnb', bass='sustain', pad=True, arp='8', hot=0.35),
        sec(8, A, drums='dnb', bass='sustain', theme=('theme', 'brass', -1, {}), choir=0.5, hot=0.4, fill='roll', riser=1),
        sec(8, B, drums='dnb', bass='riff', stabs=0.7, arp='16', hot=0.45, growl=0.3),
        sec(8, A, drums='dnb', bass='riff', theme=('theme', 'lead', 0, {'glide': True}), hot=0.5, fill='toms', riser=1),
        sec(8, C, drums='tick', bass='sustain', choir=0.9, theme=('head', 'bell', 0, {'speed': 2.0}), hot=0.25, fill='roll', riser=2, impact=False),
        sec(8, A, drums='dnb', bass='riff', theme=('theme', 'lead', 0, {'glide': True}), choir=0.5, stabs=0.5, hot=0.55, fill='kicks', riser=2),
    ]
    if p == 2: return [
        sec(8, B, drums='dnb', bass='riff', stabs=1.0, arp='16', hot=0.6, growl=0.5),
        sec(8, A, drums='dnb', bass='riff', theme=('theme', 'lead', 0, {'glide': True, 'oct': -1, 'oct_inst': 'brass'}), hot=0.65, fill='roll', riser=1, growl=0.4),
        sec(8, B, drums='dnb', bass='roll16', gate=0.6, stabs=0.8, hot=0.65, glitch=[(7, 12, 4)]),
        sec(8, A, drums='dnb', bass='riff', theme=('theme', 'lead', 0, {'harm': True, 'glide': True}), choir=0.6, hot=0.7, fill='toms', riser=1),
        sec(8, C, drums='half', bass='sustain', choir=1.0, theme=('head', 'lead', 0, {'speed': 2.0, 'gain': 0.8}), hot=0.4, fill='roll', riser=2, impact=False),
        sec(8, A, drums='dnb', bass='roll16', gate=0.7, theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass'}), hot=0.75, fill='kicks', riser=2),
    ]
    return [
        sec(8, B, drums='dnb', bass='riff', stabs=1.0, arp='16', hot=0.85, growl=0.7, glitch=[(3, 12, 4)]),
        sec(8, A, drums='dnb', bass='roll16', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass', 'harm': True}), choir=0.8, gate=0.6, hot=0.9, fill='roll', riser=1),
        sec(8, B, drums='blast', bass='riff', stabs=1.0, gate=0.8, hot=0.9, growl=0.7, glitch=[(7, 8, 8)]),
        sec(8, A, drums='dnb', bass='riff', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass'}), choir=1.0, hot=0.95, fill='toms', riser=1),
        sec(8, C, drums='half', bass='sustain', choir=1.0, gate=0.6, theme=('head', 'lead', 0, {'speed': 2.0}), drone=0.5, hot=0.6, fill='roll', riser=4, impact=False),
        sec(8, A, drums='blast', bass='roll16', theme=('theme', 'lead', 0, {'oct': -1, 'oct_inst': 'brass', 'harm': True}), gate=0.8, choir=1.0, hot=1.0, fill='kicks', riser=2),
    ]

BOSSES = {'hydra': (HY, hydra), 'compiler': (CO, compiler), 'leviathan': (LV, leviathan)}

def build(boss, p, seed=None):
    D, fn = BOSSES[boss]
    E.seed(seed or ({'hydra': 100, 'compiler': 200, 'leviathan': 300}[boss] + p))
    secs = fn(p); bars = sum(s['bars'] for s in secs)
    T = D['theme']
    S = E.Song(T.bpm, bars)
    if boss == 'leviathan': S.gain.update(bass=0.9)     # the reese carries the track
    SC.arrange(S, T, secs)
    return S

def main(which):
    os.makedirs(PREV, exist_ok=True)
    tp = os.path.join(PREV, 'loudness.json')
    table = json.load(open(tp)) if os.path.exists(tp) else {}
    jobs = []
    for w in which:
        if w in BOSSES: jobs += [(w, p) for p in (1, 2, 3)]
        else: b, p = w.split('-'); jobs.append((b, int(p)))
    for b, p in jobs:
        S = build(b, p)
        name = f'sb-{b}-{p}'
        path = os.path.join(OUT, name + '.mp3')
        res, y = E.master_to(S.mixdown(), path, lufs=LUFS + 0.4 * (p - 2))
        res.update(kb=os.path.getsize(path) // 1024, secs=round(len(y) / E.SR, 3), bars=S.bars, bpm=S.bpm)
        table[name] = res
        print(name, res, flush=True)
    json.dump(table, open(tp, 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1:] or list(BOSSES))
