# Makes the room tier pictures for #/room from the 1376 px originals (mock/tiers/t1.jpg to t5.jpg):
# a 2752 px version for big screens (Lanczos, light unsharp mask), the original size for laptops and
# phones, and a 640 px one for thumbnails. Slot coordinates stay in the original picture's pixels.
#   python3 tools/room-tiers.py <folder with t1.jpg..t5.jpg>
import os, sys
from PIL import Image, ImageFilter
src = sys.argv[1] if len(sys.argv) > 1 else 'mock/tiers'
out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'room', 'tiers')
os.makedirs(out, exist_ok=True)
for i in range(1, 6):
    im = Image.open(os.path.join(src, f't{i}.jpg')).convert('RGB')
    w, h = im.size
    big = im.resize((2752, round(h * 2752 / w)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))
    big.save(os.path.join(out, f't{i}.webp'), 'WEBP', quality=88, method=6)
    im.save(os.path.join(out, f't{i}-m.webp'), 'WEBP', quality=86, method=6)
    im.resize((640, round(h * 640 / w)), Image.LANCZOS).save(os.path.join(out, f't{i}-s.webp'), 'WEBP', quality=78, method=6)
    print(i, w, h, *[os.path.getsize(os.path.join(out, f)) // 1024 for f in (f't{i}.webp', f't{i}-m.webp', f't{i}-s.webp')])
