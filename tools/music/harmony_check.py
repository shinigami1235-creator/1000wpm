"""Finds sustained clashes in a Song's notes: two notes a semitone apart (minor second, minor ninth)
from different parts, both held at least a beat and sounding together for half a beat or more.
Passing notes and the siren are left out. An ear for when nobody can listen.

    from harmony_check import clashes; clashes(song) -> [(bar, beat, notes, voices)]
"""
NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

def clashes(S, min_len=1.0, min_overlap=0.5, skip=('fx',), skip_voices=('<lambda>', 'drone')):
    ev = [(b, beat, ln, ms, v) for b, beat, ln, ms, v in S.events if b not in skip and v not in skip_voices and ln >= min_len]
    out = []
    for i in range(len(ev)):
        b1, s1, l1, m1, v1 = ev[i]
        for j in range(i + 1, len(ev)):
            b2, s2, l2, m2, v2 = ev[j]
            ov = min(s1 + l1, s2 + l2) - max(s1, s2)
            if ov < min_overlap: continue
            for a in m1:
                for c in m2:
                    if (max(a, c) - min(a, c)) % 12 == 1:      # a minor second or ninth (a major seventh is allowed)
                        out.append((int(max(s1, s2) // 4), round(max(s1, s2) % 4, 2), (NAMES[a % 12] + str(a // 12 - 1), NAMES[c % 12] + str(c // 12 - 1)), (f'{b1}:{v1}', f'{b2}:{v2}')))
    return out
