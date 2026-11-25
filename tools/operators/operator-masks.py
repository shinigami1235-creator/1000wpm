# Paint the editor masks for the male operator's texture: R skin, G eyes, B outfit.
# Paths point at the 25 Nov working folder (male_rigged.blend, tex0.jpg pulled from male.glb); change them for a new body.
# Faces are picked in 3D (head, hands, the eye box) and their UV triangles drawn into a
# 1024 mask, then each pixel is kept or dropped by its colour in the real texture.
import bpy, sys, colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='/home/claude/opmodel/work/male_rigged.blend')
ob = next(o for o in bpy.data.objects if o.type == 'MESH')
me = ob.data; uv = me.uv_layers.active.data
tex = np.asarray(Image.open('tex0.jpg').convert('RGB')).astype(np.float32) / 255
H, W = tex.shape[:2]
M = ob.matrix_world
head = Vector((0, -0.01, 1.59)); hands = [Vector((-0.295, 0.04, 0.88)), Vector((0.26, -0.12, 0.88))]
regions = {'head': Image.new('L', (W, H), 0), 'hand': Image.new('L', (W, H), 0), 'eye': Image.new('L', (W, H), 0)}
draw = {k: ImageDraw.Draw(v) for k, v in regions.items()}
front = min((M @ v.co).y for v in me.vertices if (M @ v.co).z > 1.6)
n = {'head': 0, 'hand': 0, 'eye': 0}
for p in me.polygons:
    c = M @ p.center
    pts = [(uv[li].uv.x * W, (1 - uv[li].uv.y) * H) for li in p.loop_indices]
    if c.z > 1.52 and (c - head).length < 0.2:
        draw['head'].polygon(pts, fill=255); n['head'] += 1
        if 1.64 < c.z < 1.72 and 0.012 < abs(c.x) < 0.065 and c.y < front + 0.035:
            draw['eye'].polygon(pts, fill=255); n['eye'] += 1
    elif any((c - h).length < 0.12 for h in hands):
        draw['hand'].polygon(pts, fill=255); n['hand'] += 1
print('faces', n, 'front', round(front, 3))
r, g, b = tex[..., 0], tex[..., 1], tex[..., 2]
mx, mn = tex.max(-1), tex.min(-1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
hue = np.zeros_like(mx)
d = np.maximum(mx - mn, 1e-6)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
skinish = (hue < 45) & (sat > 0.12) & (sat < 0.75) & (mx > 0.22) & (r > b + 0.04)
cyan = (hue > 150) & (hue < 200) & (sat > 0.35) & (mx > 0.35)      # the glowing bits on the outfit stay as they are
A = {k: np.asarray(v) > 0 for k, v in regions.items()}
skin = (A['head'] | A['hand']) & skinish & ~A['eye']
eye = A['eye'] & ~skinish & ~cyan                 # iris, pupil and the white of the eye, not the lids
cloth = ~(A['head'] | A['hand']) & ~cyan
def soft(m, r=1.2): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)))
out = np.stack([soft(skin), soft(eye, 0.6), soft(cloth, 0.8)], -1)
Image.fromarray(out).save('/home/claude/1000wpm/assets/operators/male-mask.png', optimize=True)
print('skin px', int(skin.sum()), 'eye px', int(eye.sum()), 'cloth px', int(cloth.sum()))
Image.fromarray(out).save('mask-check.png')
