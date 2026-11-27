# Makes the glass masks for the room tier windows (assets/room/tiers/t<n>-glass.png): white where the
# window view shows, black on the frames, bars, monitors and leaves in front of the glass. Drawn at
# 2x the original picture from the outlines and bars below (picture pixels), with the leaves taken
# from the picture's own colours. Prints each mask's box for js/room/tier-items.js.
# dark: [x0, y0, x1, y1, lum] boxes where anything darker than lum is in front of the glass
# (monitors, a chair, plant pots), so the view doesn't show through them.
# leaf: True, or a box [x0, y0, x1, y1] the plant stands in, since green city lights read as leaves.
#   python3 tools/room-glass.py <folder with t1.jpg..t5.jpg, or assets/room/tiers for t<n>-m.webp> [tiers, e.g. 3,5]
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd

src = sys.argv[1] if len(sys.argv) > 1 else 'mock/tiers'
out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'room', 'tiers')
S = 2
V = lambda xs, y0, y1, w: [[x, y0, x, y1, w] for x in xs]
GLASS = {
  1: [{'panes': [[[305, 120], [350, 122], [350, 350], [305, 350]], [[372, 228], [498, 228], [498, 352], [372, 352]]]}],
  2: [{'panes': [[[204, 102], [227, 110], [227, 440], [204, 441]], [[237, 112], [309, 135], [309, 225], [237, 217]], [[237, 230], [309, 245], [310, 442], [237, 442]]]}],
  3: [{'panes': [[[507, 133], [712, 150], [712, 396], [727, 396], [727, 440], [507, 440]]],
       'bars': [[507, 209, 712, 222, 8], [507, 292, 712, 302, 8], [507, 364, 712, 370, 8]] + V([557, 615, 676], 120, 445, 7),
       'cuts': [[[495, 366], [664, 366], [664, 460], [495, 460]]]}],
  # the lower sashes have their own bars, found by darkest-line search on the picture
  4: [{'panes': [[[172, 0], [340, 0], [340, 258], [172, 244]], [[172, 283], [338, 285], [338, 526], [172, 526]]],
       'bars': [[172, 14, 340, 50, 6], [172, 72, 340, 102, 6], [172, 130, 340, 155, 6], [172, 188, 340, 208, 6],
                [172, 339, 338, 344.5, 5], [172, 406, 338, 403.5, 4.5], [172, 462.5, 338, 458.5, 4.5]] + V([200.5, 238, 274, 307.5], 0, 530, 5),
       'leaf': [165, 400, 300, 530]},
      {'panes': [[[494, 38], [598, 45], [598, 275], [494, 270]], [[494, 300], [598, 302], [598, 505], [494, 505]]],
       'bars': [[494, 78, 598, 90, 5], [494, 128, 598, 140, 5], [494, 170, 598, 180, 5], [494, 222, 598, 232, 5],
                [494, 348.5, 598, 352.5, 5], [494, 403, 598, 401.5, 4.5], [494, 458.5, 598, 453.5, 4.5]] + V([520, 548, 573], 30, 285, 5) + V([502, 527.5, 552, 575.5], 290, 510, 4.5),
       'leaf': [480, 470, 610, 530]}],
  # the glass runs down behind the bar, the monitors, the chair and the plants to the desk
  5: [{'panes': [[[95, 30], [548, 100], [548, 456], [95, 456]]], 'bars': [[95, 120, 548, 180, 7]] + V([232, 365, 466], 20, 460, 6), 'leaf': True,
       'cuts': [[[84, 426], [204, 426], [204, 470], [84, 470]], [[129, 398], [143, 398], [143, 430], [129, 430]], [[242, 398], [627, 398], [627, 451], [242, 451]]],
       'dark': [[95, 395, 548, 462, 30]]},
      {'panes': [[[624, 118], [826, 140], [826, 500], [624, 500]]], 'bars': [[624, 193, 826, 215, 7]] + V([672, 750], 110, 500, 6), 'leaf': True,
       'cuts': [[[600, 398], [627, 398], [627, 451], [600, 451]], [[600, 452], [722, 452], [722, 500], [600, 500]]],
       'dark': [[624, 395, 826, 500, 30]]}],
}
only = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else list(GLASS)
boxes = {}
for t, wins in GLASS.items():
    if t not in only: continue
    f = os.path.join(src, f't{t}.jpg')
    im = Image.open(f if os.path.exists(f) else os.path.join(src, f't{t}-m.webp')).convert('RGB')
    W, H = im.size
    m = Image.new('L', (W * S, H * S), 0)
    d = ImageDraw.Draw(m)
    sc = lambda pts: [(x * S, y * S) for x, y in pts]
    leafy = False
    leafboxes = []
    for w in wins:
        for p in w['panes']: d.polygon(sc(p), fill=255)
        for x0, y0, x1, y1, bw in w.get('bars', []): d.line(sc([(x0, y0), (x1, y1)]), fill=0, width=round(bw * S))
        for c in w.get('cuts', []): d.polygon(sc(c), fill=0)
        lf = w.get('leaf')
        if lf: leafy = True; leafboxes.append(lf if isinstance(lf, list) else None)
    darks = [b for w in wins for b in w.get('dark', [])]
    if darks:
        a = np.asarray(im.resize((W * S, H * S), Image.LANCZOS)).astype(float)
        lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
        cut = np.zeros(lum.shape, bool)
        for x0, y0, x1, y1, th in darks:
            cut[y0 * S:y1 * S, x0 * S:x1 * S] |= lum[y0 * S:y1 * S, x0 * S:x1 * S] < th
        cut = nd.binary_dilation(nd.binary_opening(cut, iterations=2), iterations=2)
        m = Image.fromarray(np.where(cut, 0, np.asarray(m)).astype(np.uint8))
    if leafy:
        a = np.asarray(im.resize((W * S, H * S), Image.LANCZOS)).astype(int)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        leaf = (g > b + 4) & (g > r + 4)
        if None not in leafboxes:
            keep = np.zeros(leaf.shape, bool)
            for x0, y0, x1, y1 in leafboxes: keep[y0 * S:y1 * S, x0 * S:x1 * S] = True
            leaf &= keep
        leaf = nd.binary_dilation(nd.binary_opening(leaf, iterations=1), iterations=3)
        m = Image.fromarray(np.where(leaf, 0, np.asarray(m)).astype(np.uint8))
    m = m.filter(ImageFilter.GaussianBlur(0.8))
    bb = m.getbbox()
    a = m.crop(bb)
    Image.merge('LA', (Image.new('L', a.size, 255), a)).save(os.path.join(out, f't{t}-glass.png'), optimize=True)
    boxes[t] = [bb[0] / S, bb[1] / S, (bb[2] - bb[0]) / S, (bb[3] - bb[1]) / S]
    print(t, boxes[t], os.path.getsize(os.path.join(out, f't{t}-glass.png')) // 1024, 'KB')
print(json.dumps(boxes))
