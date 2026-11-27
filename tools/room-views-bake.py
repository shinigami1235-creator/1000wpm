# Bakes the painted window views (js/room/scenes.js) into pictures, so the room loads a picture
# instead of painting a scene for a second or two on the page: assets/room/views/<scene>.webp at
# 1536 x 1152 for the window and <scene>-s.webp at 400 x 300 for the shop cards.
# Run it again after changing a scene in scenes.js.
#   python3 tools/room-views-bake.py [scene,scene,...]
import base64, io, os, sys
from PIL import Image
from playwright.sync_api import sync_playwright

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'assets', 'room', 'views')
os.makedirs(out, exist_ok=True)
names = sys.argv[1].split(',') if len(sys.argv) > 1 else ['snow', 'space', 'sakura', 'sunset', 'forest', 'aurora', 'ocean', 'rain', 'neon']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page()
    pg.on('pageerror', lambda e: print('error', e))
    pg.set_content('<html><body></body></html>')
    pg.add_script_tag(path=os.path.join(here, '..', 'js', 'room', 'scenes.js'))
    for n in names:
        url = pg.evaluate("""n => { const c = document.createElement('canvas'); c.width = 1536; c.height = 1152;
          RoomScenes.SCENES[n].draw(RoomScenes.K, c.getContext('2d', { willReadFrequently: true }), 1536, 1152); return c.toDataURL('image/png'); }""", n)
        im = Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB')
        im.save(os.path.join(out, f'{n}.webp'), quality=84, method=6)
        im.resize((400, 300), Image.LANCZOS).save(os.path.join(out, f'{n}-s.webp'), quality=82, method=6)
        print(n, os.path.getsize(os.path.join(out, f'{n}.webp')) // 1024, 'KB', flush=True)
    b.close()
