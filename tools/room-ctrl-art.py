# Writes js/room/ctrl-art.js from the official CTRL logo (assets/brand/ctrl-mark.svg and ctrl-word.svg),
# so the room's posters, banners, neon signs and screens draw the real wing mark and wordmark as SVG
# paths. Both files share one coordinate space (the full lockup, assets/brand/ctrl.svg, is 2540 x 3532).
#   python3 tools/room-ctrl-art.py   (from the repo root, after the logo files change)
import re
def d(f):
    s = open(f).read()
    return re.search(r'viewBox="([^"]+)"', s).group(1), re.search(r' d="([^"]+)"', s).group(1)
mv, md = d('assets/brand/ctrl-mark.svg')
wv, wd = d('assets/brand/ctrl-word.svg')
open('js/room/ctrl-art.js', 'w').write(
  '// The official CTRL wing mark and wordmark as SVG paths, made by tools/room-ctrl-art.py from\n'
  '// assets/brand/ctrl-mark.svg and ctrl-word.svg. One coordinate space: the lockup is 0 0 2540 3532.\n'
  '//   CtrlArt.MARK / CtrlArt.WORD: { vb: [x, y, w, h], d }\n'
  f'window.CtrlArt = {{\n  MARK: {{ vb: [{mv.replace(" ", ", ")}], d: \'{md}\' }},\n  WORD: {{ vb: [{wv.replace(" ", ", ")}], d: \'{wd}\' }},\n}};\n')
print('ok')
