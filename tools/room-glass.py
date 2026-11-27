# Makes the glass masks for the room tier windows (assets/room/tiers/t<n>-glass.png): white where the
# window view shows, black on the frames, bars, monitors and leaves in front of the glass. Drawn at
# 2x the original picture from the outlines and bars below (picture pixels), with the leaves taken
# from the picture's own colours. Prints each mask's box for js/room/tier-items.js.
#   python3 tools/room-glass.py <folder with t1.jpg..t5.jpg>
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
  3: [{'panes': [[[507, 133], [712, 150], [712, 440], [507, 440]]],
       'bars': [[507, 209, 712, 222, 8], [507, 292, 712, 302, 8], [507, 364, 712, 370, 8]] + V([557, 615, 676], 120, 445, 7),
       'cuts': [[[495, 366], [664, 366], [664, 460], [495, 460]]]}],
  4: [{'panes': [[[172, 0], [340, 0], [340, 258], [172, 244]], [[172, 283], [338, 285], [338, 526], [172, 526]]],
       'bars': [[172, 12, 340, 48, 6], [172, 70, 340, 100, 6], [172, 128, 340, 155, 6], [172, 185, 340, 207, 6], [172, 338, 338, 336, 6]] + V([199, 238, 272, 300], 0, 530, 5),
       'leaf': True},
      {'panes': [[[494, 38], [598, 45], [598, 275], [494, 270]], [[494, 300], [598, 302], [598, 505], [494, 505]]],
       'bars': [[494, 78, 598, 90, 5], [494, 128, 598, 140, 5], [494, 170, 598, 180, 5], [494, 222, 598, 232, 5], [494, 355, 598, 358, 5]] + V([520, 548, 573], 30, 510, 5),
       'leaf': True}],
  5: [{'panes': [[[95, 30], [548, 100], [548, 398], [95, 398]]], 'bars': [[95, 120, 548, 180, 7]] + V([232, 365, 466], 20, 400, 6), 'leaf': True},
      {'panes': [[[624, 118], [826, 140], [826, 398], [624, 398]]], 'bars': [[624, 193, 826, 215, 7]] + V([672, 750], 110, 400, 6), 'leaf': True}],
}
boxes = {}
for t, wins in GLASS.items():
    im = Image.open(os.path.join(src, f't{t}.jpg')).convert('RGB')
    W, H = im.size
    m = Image.new('L', (W * S, H * S), 0)
    d = ImageDraw.Draw(m)
    sc = lambda pts: [(x * S, y * S) for x, y in pts]
    leafy = False
    for w in wins:
        for p in w['panes']: d.polygon(sc(p), fill=255)
        for x0, y0, x1, y1, bw in w.get('bars', []): d.line(sc([(x0, y0), (x1, y1)]), fill=0, width=bw * S)
        for c in w.get('cuts', []): d.polygon(sc(c), fill=0)
        leafy |= bool(w.get('leaf'))
    if leafy:
        a = np.asarray(im.resize((W * S, H * S), Image.LANCZOS)).astype(int)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        leaf = (g > b + 4) & (g > r + 4)
        leaf = nd.binary_dilation(nd.binary_opening(leaf, iterations=1), iterations=3)
        m = Image.fromarray(np.where(leaf, 0, np.asarray(m)).astype(np.uint8))
    m = m.filter(ImageFilter.GaussianBlur(0.8))
    bb = m.getbbox()
    a = m.crop(bb)
    Image.merge('LA', (Image.new('L', a.size, 255), a)).save(os.path.join(out, f't{t}-glass.png'), optimize=True)
    boxes[t] = [bb[0] / S, bb[1] / S, (bb[2] - bb[0]) / S, (bb[3] - bb[1]) / S]
    print(t, boxes[t], os.path.getsize(os.path.join(out, f't{t}-glass.png')) // 1024, 'KB')
print(json.dumps(boxes))
