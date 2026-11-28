# Writes js/room/ctrl-art.js from the official CTRL logo (assets/brand/ctrl.svg, the lockup; ctrl-mark.svg,
# the wing; ctrl-word.svg, the wordmark), so the room's posters, banners, neon signs and screens draw the
# real logo as SVG paths. Each keeps its own viewBox.
#   python3 tools/room-ctrl-art.py   (from the repo root, after the logo files change)
import re
def d(f):
    s = open(f).read()
    return re.search(r'viewBox="([^"]+)"', s).group(1), re.search(r' d="([^"]+)"', s).group(1)
mv, md = d('assets/brand/ctrl-mark.svg')
wv, wd = d('assets/brand/ctrl-word.svg')
lv, ld = d('assets/brand/ctrl.svg')
open('js/room/ctrl-art.js', 'w').write(
  '// The official CTRL wing mark and wordmark as SVG paths, made by tools/room-ctrl-art.py from\n'
  '// assets/brand/ctrl.svg (lockup), ctrl-mark.svg (wing) and ctrl-word.svg (wordmark).\n'
  '//   CtrlArt.MARK / WORD / LOCKUP: { vb: [x, y, w, h], d }\n'
  f'window.CtrlArt = {{\n  MARK: {{ vb: [{mv.replace(" ", ", ")}], d: \'{md}\' }},\n  WORD: {{ vb: [{wv.replace(" ", ", ")}], d: \'{wd}\' }},\n  LOCKUP: {{ vb: [{lv.replace(" ", ", ")}], d: \'{ld}\' }},\n}};\n')
print('ok')
