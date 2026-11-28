"""python3 tools/room-front.py (from the repo root): cut the hanging plant in front of tier 3's left poster frame out of the picture, so it can sit over the poster."""
import numpy as np
from PIL import Image, ImageFilter
im = Image.open('assets/room/tiers/t3.webp').convert('RGB')
a = np.asarray(im).astype(np.float32)
x0, y0, x1, y1 = 96, 228, 320, 520          # 2752 px picture: the frame's top left, where the plant hangs
c = a[y0:y1, x0:x1]
# the frame's empty inside, row by row, from a strip right of the plant
bgs = np.median(a[y0:y1, 330:440], axis=1)          # (rows, 3)
bg = np.repeat(bgs[:, None, :], x1 - x0, axis=1)
d = np.sqrt(((c - bg) ** 2).sum(-1))
gr = c[..., 1] - np.maximum(c[..., 0], c[..., 2])
from scipy import ndimage
m = np.clip((d - 5) / 8, 0, 1) * np.clip((gr + 1) / 5, 0, 1)
# keep only what hangs from the plant: the pieces joined to the part touching the top edge
core = m > 0.25; core[:, :16] = False                # the frame's left edge would join the blotches up
lab, n = ndimage.label(ndimage.binary_dilation(core, iterations=2))
top = set(np.unique(lab[:6, 40:150])) - {0}
keep = np.isin(lab, list(top))
m = m * keep
# and only inside the plant's outline, drawn by hand on the picture (crop pixels)
from PIL import ImageDraw
env = Image.new('L', (x1 - x0, y1 - y0), 0)
ImageDraw.Draw(env).polygon([(36, 0), (160, 0), (158, 70), (150, 140), (128, 200), (122, 268), (70, 272), (52, 215), (38, 160), (34, 80)], fill=255)
m = m * (np.asarray(env.filter(ImageFilter.GaussianBlur(3))) / 255)
M = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
mm = np.asarray(M)
out = Image.fromarray(np.dstack([c.astype(np.uint8), mm]), 'RGBA')
out.save('assets/room/tiers/t3-plant.webp', lossless=False, quality=88, alpha_quality=90, method=6)
# where it goes in the room (the 1376 px coordinates of js/room/tier-items.js): front: [x, y, w, h]
print('front', [x0 / 2, y0 / 2, (x1 - x0) / 2, (y1 - y0) / 2])
