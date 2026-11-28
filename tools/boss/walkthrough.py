"""A listening mix of a World Boss fight, put together the way js/app/boss-audio.js plays the music:
phase 1 with an attack cut, phase 2 with a threat word and a charge, a beam face-off won, phase 3
coming in on an armour break, the enrage, the kill and the victory sting.

    python3 tools/boss/walkthrough.py [out.mp3]
"""
import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'music'))
import engine as E

AUDIO = os.environ.get('WB_OUT') or os.path.join(ROOT, 'audio')
BEAT = 0.4; BAR = 1.6; LOOP_AT = 0.5
BARS = {'wb-p1': 64, 'wb-p2': 64, 'wb-p3': 64, 'wb-p4': 48, 'wb-enrage': 32, 'wb-threat': 4}
SR = E.SR
_buf = {}
def buf(n):
    if n not in _buf: _buf[n] = E.read_audio(os.path.join(AUDIO, n + '.mp3'))
    return _buf[n]

class Mix:
    def __init__(self, secs):
        self.x = np.zeros((int(secs * SR), 2)); self.threat = np.zeros(len(self.x))
        self.cut = np.ones(len(self.x))
    def loop(self, name, at, pos, until, fade_in=0.012, fade_out=0.03):
        b = buf(name); L = BARS[name] * BAR
        s0, s1 = int(at * SR), int(until * SR)
        t = (np.arange(s1 - s0) / SR + pos) % L
        idx = np.where(t < LOOP_AT, t + L, t)
        seg = b[(idx * SR).astype(int)]
        g = np.ones(len(seg)); fi = int(fade_in * SR); fo = int(fade_out * SR)
        g[:fi] = np.linspace(0, 1, fi); g[-fo:] *= np.linspace(1, 0, fo)
        self.x[s0:s1] += seg * g[:, None]
    def shot(self, name, at, cut_at=None, fade=0.06):
        b = buf(name); s0 = int(at * SR)
        n = min(len(b), len(self.x) - s0) if cut_at is None else min(int((cut_at - at) * SR), len(self.x) - s0)
        seg = b[:n].copy()
        if cut_at is not None: k = int(fade * SR); seg[-k:] *= np.linspace(1, 0, k)[:, None]
        self.x[s0:s0 + n] += seg

def main(out):
    M = Mix(172)
    # phase 1 from its first bar
    t0 = 0.0
    # an attack at 21.6 s: the music cuts 0.9 s before the hit and comes back on the next bar
    cut_at, back = 20.7, 21.6
    M.loop('wb-p1', 0, 0, back + 0.03)       # it plays on under the cut, all but silent
    pos = np.ceil((cut_at - t0 + 0.05) / BAR) * BAR
    M.cut[int(cut_at * SR):int(back * SR)] = 0.03
    t1 = back - pos                        # the new grid
    # phase 2 on the next beat after 40 s
    ch = t1 + np.ceil((40 - t1) / BEAT) * BEAT
    M.loop('wb-p1', back, pos, ch + 0.25, fade_out=0.25)
    # a threat word 50-54 s, a charge cut at 62.6-63.5
    c2, b2 = 62.6, 63.5
    pos2 = np.ceil((c2 - ch + 0.05) / BAR) * BAR
    M.loop('wb-p2', ch, 0, b2 + 0.03)
    M.threat[int(50 * SR):int(54 * SR)] = 1
    M.cut[int(c2 * SR):int(b2 * SR)] = 0.03
    # the face-off at 72 s: the loop falls away, the cue, a win on beat 29, the loop back 4 beats later
    fo = 72.0
    M.loop('wb-p2', b2, pos2, fo + 0.35, fade_out=0.35)
    left = (fo - (b2 - pos2)) % (64 * BAR)
    res = fo + 29 * BEAT; back3 = res + 4 * BEAT
    M.shot('wb-fo', fo, cut_at=res + 0.06)
    M.shot('wb-fo-win', res)
    pos3 = np.ceil((left + 0.05) / (8 * BAR)) * 8 * BAR % (64 * BAR)
    # phase 3 on an armour break: cut for 1.2 s, the new phase lands with the slam
    c3 = 100.0; b3 = c3 + 1.2
    M.loop('wb-p2', back3, pos3, b3 + 0.03)
    M.cut[int(c3 * SR):int(b3 * SR)] = 0.03
    # the enrage on a roar, on the next beat after 126 s
    en = b3 + np.ceil((126 - b3) / BEAT) * BEAT
    M.loop('wb-p3', b3, 0, en + 0.25, fade_out=0.25)
    kill = 150.0
    M.loop('wb-enrage', en, 0, kill + 0.06, fade_out=0.06)
    # the kill: silence, the boom 2.7 s later, the sting 0.9 s after the defeat
    M.shot('wb-win', kill + 2.7 + 0.9)
    # the threat layer and the brighter top, where the game turns them on
    thr_start = ch
    ts = int(50 * SR); te = int(54.8 * SR)
    seg = np.arange(te - ts) / SR + (50 - thr_start)
    tb = buf('wb-threat'); L = 4 * BAR
    t = seg % L; idx = np.where(t < LOOP_AT, t + L, t)
    env = np.clip(np.minimum((np.arange(te - ts) / SR) / 0.2, (te - ts) / SR - np.arange(te - ts) / SR), 0, 1)
    M.x[ts:te] += tb[(idx * SR).astype(int)] * env[:, None]
    hi = E.eq(M.x[ts:te], 'highshelf', 3000, 4) - M.x[ts:te]
    M.x[ts:te] += hi * env[:, None]
    y = M.x * M.cut[:, None]
    y = y[:int((kill + 3.6 + 13.2) * SR)]
    y = E.limit(y * E.db(-1.0), -1.0)
    tmp = out + '.wav'; E.write_wav(tmp, y)
    import subprocess
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-b:a', '160k', out], check=True); os.remove(tmp)
    marks = [('0:00', 'phase 1 (Online) from its first bar'), (f'{cut_at:.1f}', 'attack: music cut, back on the hit at the next bar'),
             (f'{ch:.1f}', 'phase 2 (Corrupted) on the beat'), ('50.0', 'attack word up: the threat layer ticks in'),
             (f'{c2:.1f}', 'charge cut, slam back on the downbeat'), (f'{fo:.1f}', 'beam face-off: the charge builds'),
             (f'{fo + 22 * BEAT:.1f}', 'the beams clash'), (f'{res:.1f}', 'raid wins the face-off'), (f'{back3:.1f}', 'phase 2 back, next section'),
             (f'{c3:.1f}', 'armour break: cut 1.2 s'), (f'{b3:.1f}', 'phase 3 (Memory leak) lands with the slam'), (f'{en:.1f}', 'enrage (Kernel panic), up a semitone'),
             (f'{kill:.1f}', 'the kill: music stops dead'), (f'{kill + 3.6:.1f}', 'victory sting')]
    print(E.measure(out))
    return marks

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/outputs/overnight/raid-music/wb-fight-walkthrough.mp3'
    for t, m in main(out): print(t, m)
