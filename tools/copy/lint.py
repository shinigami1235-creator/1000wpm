import re, sys, subprocess
RULES = [
 ('dash', r'[—–]| -- '),
 ('gloss', r'(^|[.!?] )(That|This|These) (is|are|was) '),
 ('notX', r"\b(not just|not only|not merely)\b|, not [a-z]+[^.]*\.|\bit's not\b|\bisn't [a-z]+, (it's|but)"),
 ('comma-conj', r'\w, (and|or|but|so) '),
 ('so-clause', r', so (it|you|the|nothing|your)\b'),
 ('nothing', r'\bnothing (is|gets) (cut|lost)|\bloses nothing\b'),
 ('vocab', r'\b(crucial|vital|pivotal|robust|seamless(ly)?|leverage|delve|underscore|tapestry|testament|showcase|holistic|nuanced|myriad|realm|elevate|vibrant|boasts|nestled|stands as|serves as|unleash|epic journey|journey)\b'),
 ('adverb', r'\b(simply|merely|truly|actually|essentially|fundamentally|arguably|honestly|frankly|deliberate(ly)?|every single)\b'),
 ('tic', r'\b(think of it as|in other words|the whole point|the real question|at its core|here\'s the thing|whether you\'re)\b'),
 ('colon-mid', r'[a-z]: [a-z][^.]{0,40}\.$'),
 ('semicolon', r';'),
]
def check(text):
    hits = []
    for name, rx in RULES:
        if name == 'semicolon' and ('{' in text or '=' in text): continue
        if re.search(rx, text, re.I if name not in ('gloss',) else 0): hits.append(name)
    return hits
for line in sys.stdin:
    m = re.match(r'([^:]+:\d+): (.*)', line.rstrip('\n'))
    if not m: continue
    h = check(m.group(2))
    if h: print(f"{','.join(h):18} {m.group(1)}: {m.group(2)[:200]}")
