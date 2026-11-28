"""Boss Rush music: the gauntlet's own arcade hook, played by each boss in its own key, tempo, groove
and sound, one loop per phase, each phase faster and fuller than the one before.

    python3 tools/music/rush.py                  every loop: audio/rush-<boss>-<phase>.mp3
    python3 tools/music/rush.py press syntax-3   a boss, or one loop

The hook is two bars that every boss shares (so the run sounds like one gauntlet), answered by a
two-bar turn: i v i V. The bosses (the music keys in js/app/rush/data.js):
    press       C# phrygian, 136/146/156 bpm: industrial, anvils on the offbeats, low brass
    correction  C minor,     140/150/160 bpm: dark and dramatic, half time into four on the floor
    syntax      A minor,     164/172/180 bpm: a broken beat with glitches, the hook on a square pluck
    announcer   B minor,     138/148/158 bpm: driving techno, the hook on a supersaw, a PA bell call
Each loop is 16 bars and loops as a whole file (js/app/rush/audio.js plays it with loop on), so the
file is exactly the loop, its tails folded back onto the start. Made with tools/music/engine.py.
"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import engine as E
import score as SC
from score import Theme

OUT = os.environ.get('RUSH_OUT') or os.path.join(ROOT, 'audio')
PREV = os.environ.get('RUSH_PREVIEW') or '/mnt/user-data/outputs/overnight/raid-music/rush'

HOOK = [
    (0, 12, 0.5), (0.5, 12, 0.25), (0.75, 19, 0.75), (1.5, 17, 0.5), (2, 15, 1), (3, 14, 0.5), (3.5, 15, 0.5),     # i
    (4, 12, 1.5), (5.5, 10, 0.5), (6, 7, 2),                                                                         # v
    (8, 12, 0.5), (8.5, 12, 0.25), (8.75, 19, 0.75), (9.5, 22, 0.5), (10, 19, 1), (11, 17, 0.5), (11.5, 15, 0.5),  # i
    (12, 14, 2), (14, 11, 2),                                                                                        # V
]
P_HOOK = ['i', 'v', 'i', 'V']
P_DRIVE = ['i', 'i', 'VI', 'VII', 'i', 'i', 'VI', 'V']
P_MENACE = ['i', 'i', 'bII', 'i', 'i', 'i', 'bII', 'V']

def sec(bars, prog, **kw):
    d = dict(bars=bars, prog=prog); d.update(kw); return d

RIFFS = {
    'press': [(0, 0, 2), (2, 0, 1), (4, 12, 1), (6, 0, 1), (8, 0, 2), (10, 13, 1), (11, 0, 1), (12, 12, 1), (14, 0, 2)],
    'correction': [(0, 0, 3), (3, 0, 1), (6, 7, 2), (8, 0, 3), (11, 0, 1), (12, 12, 2), (14, 7, 2)],
    'syntax': [(0, 0, 1), (2, 12, 1), (3, 0, 1), (6, 7, 1), (7, 0, 1), (10, 12, 1), (11, 0, 1), (13, 7, 1), (14, 7, 1)],
    'announcer': [(0, 0, 1), (2, 0, 1), (4, 12, 1), (6, 0, 1), (8, 0, 1), (10, 7, 1), (12, 12, 1), (14, 0, 1)],
}
BOSSES = {
    #             tonic bpm per phase      kick  hook instrument  drums per phase
    'press':      (61, (136, 146, 156), 48.0, 'brass5', ('break', 'break', 'blast')),
    'correction': (60, (140, 150, 160), 47.0, 'lead', ('half', 'drive', 'blast')),
    'syntax':     (57, (164, 172, 180), 52.0, 'pluck', ('dnb', 'dnb', 'dnb')),
    'announcer':  (59, (138, 148, 158), 50.0, 'lead', ('drive', 'drive', 'blast')),
}

def arrangement(boss, p):
    tonic, bpms, kt, inst, dr = BOSSES[boss]
    d = dr[p - 1]; hot = 0.45 + 0.25 * (p - 1)
    oct_ = -1 if inst == 'brass5' else 0
    th = {'glide': inst == 'lead'}
    if p >= 2: th['harm'] = inst != 'brass5'
    if p == 3: th.update({'oct': -1 if inst != 'brass5' else 1, 'oct_inst': 'brass' if inst != 'brass5' else 'lead', 'oct_gain': 0.5})
    menace = P_MENACE if boss in ('press', 'syntax') else P_DRIVE
    extra = dict(arp='16' if p >= 2 or boss in ('announcer', 'syntax') else '8', stabs=0.6 + 0.2 * p if boss != 'syntax' else 0.4,
                 growl=0.2 * p if boss in ('press', 'syntax') else 0.0)
    s1 = sec(8, menace, drums=d, bass='riff', hot=hot, gate=0.6 if p == 3 else 0, choir=0.5 if p == 3 else 0, fill='toms' if p < 3 else 'kicks', riser=1, **extra)
    s2 = sec(8, P_HOOK, drums=d, bass='roll16' if p == 3 else 'riff' if boss != 'correction' else 'pulse8', hot=hot + 0.1,
             theme=('theme', inst, oct_, th), choir=0.4 + 0.2 * p if p >= 2 else 0, fill='roll' if p < 3 else 'glitch', riser=2,
             glitch=[(7, 12, 4)] if boss == 'syntax' else [], **{k: v for k, v in extra.items() if k != 'stabs'})
    if boss == 'announcer':      # the PA call: a falling three-note bell every four bars
        s1['pa'] = True
    if boss == 'press': s1['metal'] = s2['metal'] = True
    return [s1, s2], tonic, bpms[p - 1], kt

def build(boss, p):
    E.seed({'press': 11, 'correction': 22, 'syntax': 33, 'announcer': 44}[boss] * 10 + p)
    secs, tonic, bpm, kt = arrangement(boss, p)
    T = Theme(tonic, bpm, {'theme': HOOK}, RIFFS[boss], {}, kick_tune=kt, name=boss)
    S = E.Song(bpm, 16)
    SC.arrange(S, T, secs)
    for i, s in enumerate(secs):
        b0 = 8 * i
        if s.get('pa'):
            for b in (b0 + 1, b0 + 5):             # on the bars that sit on the home chord
                for k, d in enumerate((7, 3, 0)):
                    S.note('music', E.bell, b * 4 + 2 + k * 0.5, tonic + 12 + d, 0.5, gain=0.9, hall=0.4, delay=0.35, pan=(-0.4, 0, 0.4)[k])
        if s.get('metal'):
            for b in range(b0, b0 + 8):
                for q in range(4): S.hit('metal', b * 4 + q + 0.5, 0.5 + 0.1 * p, f=300 + 40 * (q % 2), pan=0.35)
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
        name = f'rush-{b}-{p}'
        path = os.path.join(OUT, name + '.mp3')
        res, y = E.master_to(S.mixdown(), path, lufs=-15.8 + 0.3 * (p - 1), head_s=0)
        res.update(kb=os.path.getsize(path) // 1024, secs=round(len(y) / E.SR, 3), bars=S.bars, bpm=S.bpm)
        table[name] = res
        print(name, res, flush=True)
    json.dump(table, open(tp, 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1:] or list(BOSSES))
