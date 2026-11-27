"""metrics.py log.json [log2.json ...]: what a fight's camera did, from the probe log written by rec_cam.py.

Each log entry: t, fov, cam [x,y,z], q [x,y,z,w], cut (shot name or ''), wind (an attack at you
winding up), pts [[name, ndc x, ndc y, ndc z], ...] for head, core, feet, you, aim, m0, fl1, fl2.
"""
import json, math, sys

def ang(q1, q2):
    d = abs(sum(a * b for a, b in zip(q1, q2)))
    return math.degrees(2 * math.acos(min(1.0, d)))

def inframe(p, m=1.0):
    return abs(p[1]) <= m and abs(p[2]) <= m and p[3] < 1

def report(path):
    L = json.load(open(path))
    L = [e for e in L if e['t'] > 1.0]
    P = lambda e, n: next(p for p in e['pts'] if p[0] == n)
    n = len(L); dur = L[-1]['t'] - L[0]['t']
    shots, cur, start = [], None, L[0]['t']
    jumps = 0
    speeds, turns, jerks = [], [], []
    flips = 0; prev_side = None
    for i, e in enumerate(L):
        name = e.get('shot') or e['cut'] or 'base'
        if i:
            a = L[i - 1]; dt = max(1e-3, e['t'] - a['t'])
            dp = math.dist(e['cam'], a['cam'])
            if dp > 4 or ang(e['q'], a['q']) > 25:      # a hard cut
                jumps += 1
            else:
                speeds.append(dp / dt); turns.append(ang(e['q'], a['q']) / dt)
        if name != cur:
            if cur is not None: shots.append((cur, e['t'] - start))
            cur, start = name, e['t']
        you, core = P(e, 'you'), P(e, 'core')
        if inframe(you) and inframe(core):
            side = 1 if you[1] > core[1] else -1
            if prev_side is not None and side != prev_side and abs(you[1] - core[1]) > 0.25: flips += 1
            prev_side = side
    shots.append((cur, L[-1]['t'] - start))
    pct = lambda f: round(100 * sum(1 for e in L if f(e)) / n, 1)
    bh = sorted((P(e, 'head')[2] - P(e, 'feet')[2]) / 2 for e in L if not e['cut'])
    wind = [e for e in L if e['wind']]
    def q(v, k): return round(sorted(v)[int(k * (len(v) - 1))], 2) if v else None
    out = {
        'log': path, 'seconds': round(dur, 1), 'frames': n,
        'shots': len(shots), 'avg_shot_s': round(dur / len(shots), 2),
        'shot_time': {k: round(sum(d for s, d in shots if s == k), 1) for k in sorted({s for s, _ in shots})},
        'hard_cuts': jumps,
        'boss_core_in_frame_%': pct(lambda e: inframe(P(e, 'core'))),
        'boss_head_in_frame_%': pct(lambda e: inframe(P(e, 'head'), 0.95)),
        'you_in_frame_%': pct(lambda e: inframe(P(e, 'you'))),
        'both_in_frame_%': pct(lambda e: inframe(P(e, 'core')) and inframe(P(e, 'you'))),
        'boss_height_on_screen_median': q(bh, 0.5),
        'boss_core_x_from_centre_median': q([abs(P(e, 'core')[1]) for e in L], 0.5),
        'screen_side_flips': flips,
        'cam_speed_p95': q(speeds, 0.95), 'cam_turn_deg_s_p95': q(turns, 0.95),
        'windup_frames': len(wind),
        'windup_you_and_boss_in_frame_%': round(100 * sum(1 for e in wind if inframe(P(e, 'core')) and inframe(P(e, 'you'))) / max(1, len(wind)), 1),
        'windup_in_a_cutaway_%': round(100 * sum(1 for e in wind if (e.get('shot') or e['cut']) not in ('', 'base', 'master', None)) / max(1, len(wind)), 1),
    }
    return out

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(json.dumps(report(p), indent=1))
