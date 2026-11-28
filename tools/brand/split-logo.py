"""Split the full CTRL lockup (assets/brand/ctrl.svg) into the wing mark and the wordmark by
where each shape sits: the letters are the shapes below the blades. Writes raw SVGs that
tools/brand/clean-logo.py then straightens.

  python3 tools/brand/split-logo.py SRC.svg MARK_OUT.svg WORD_OUT.svg
"""
import re, sys
src, mark_out, word_out = sys.argv[1:4]
s = open(src).read()
d = re.search(r' d="([^"]+)"', s).group(1)
subs = re.findall(r'M[^M]*', d)
def top(sp):
    n = list(map(float, re.findall(r'-?\d*\.?\d+', sp)))
    return min(n[1::2])
tops = [top(sp) for sp in subs]
cut = max(tops) - 120    # the letters all start on one line; anything above it is the mark
mark = [sp for sp, t in zip(subs, tops) if t < cut]
word = [sp for sp, t in zip(subs, tops) if t >= cut]
vb = re.search(r'viewBox="([^"]+)"', s).group(1)
for path, parts in [(mark_out, mark), (word_out, word)]:
    open(path, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><path fill="currentColor" fill-rule="evenodd" d="{"".join(parts)}"/></svg>\n')
print(len(mark), 'mark shapes,', len(word), 'letter shapes')
