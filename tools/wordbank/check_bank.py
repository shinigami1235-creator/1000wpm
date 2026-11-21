#!/usr/bin/env python3
"""Checks js/wordbank.js and js/wordbank-common.js: counts per theme and no blocked word anywhere.

  python3 tools/wordbank/check_bank.py
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_common as B

ROOT = B.ROOT
# words that are blocked in the common bands for their other sense but fine in a pack
ALLOW = {'beat', 'beats', 'drum', 'shot', 'fighter', 'bass', 'horn', 'shell', 'strip'}
NEED = {'common': 3000, 'quotes': 80}
PACKS = 'cyber keyboards gaming nature food space city music science mythic verbs'.split()

js = r"""
global.window = global;
require(process.argv[1] + '/js/wordbank-common.js');
require(process.argv[1] + '/js/wordbank.js');
const out = {};
for (const t of Object.keys(WordBank.counts())) { try { out[t] = WordBank.list(t); } catch (e) {} }
console.log(JSON.stringify(out));
"""
data = json.loads(subprocess.check_output(['node', '-e', js, ROOT]))
block = B.VIOLENT | B.DRUGS | B.BRANDS | B.HIDDEN
bad = []
for theme, entries in data.items():
    for e in entries:
        for w in re.findall(r"[a-z]+", e.lower()):
            if w in block and w not in ALLOW: bad.append((theme, e, w))
fails = []
for t in PACKS:
    if len(data[t]) < 150: fails.append(f'{t} has {len(data[t])} words, needs 150')
for t, n in NEED.items():
    if len(data[t]) < n: fails.append(f'{t} has {len(data[t])}, needs {n}')
for t in sorted(data):
    print(f'{t:12} {len(data[t])}')
print('blocked:', bad[:40] or 'none')
print('fails:', fails or 'none')
sys.exit(1 if bad or fails else 0)
