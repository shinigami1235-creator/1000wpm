# Bakes the room item cut-outs: opens tools/room-bake.html in headless Chrome, renders each job
# to a transparent PNG, trims it to the item and saves assets/room/items/<id>.webp plus
# assets/room/items/sizes.json (width / height of each cut-out).
#   python3 -m http.server 8771 &   then   python3 tools/room-bake.py [port] [only ids...]
import base64, io, json, os, sys
from PIL import Image
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else '8771'
ONLY = set(sys.argv[2:])
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'room', 'items')
# id: options for window.bake (dir: where the camera sits as seen from the item)
JOBS = {
  # old 3D room items
  'lava-lamp': {}, 'cactus': {}, 'snake-plant': {}, 'monstera': {}, 'astronaut': {'dir': [0.15, 0.1, 1]},
  'book-stack': {}, 'keycap-jar': {}, 'desk-lamp': {'dir': [-0.35, 0.12, 1]}, 'lantern': {'key': 1.6},
  'headphone-stand': {}, 'mic-arm': {'dir': [-0.5, 0.15, 1]}, 'laptop': {'dir': [0.3, 0.3, 1]}, 'fishbowl': {}, 'globe': {},
  'cradle': {'dir': [0.4, 0.2, 1]}, 'plasma-ball': {'env': 0.6}, 'desk-fan': {}, 'arcade': {'dir': [0.3, 0.08, 1]}, 'guitar': {},
  'book-tower': {}, 'gift-crt': {}, 'gift-trophy': {}, 'cat': {'dir': [0.1, 0.35, 1]}, 'aquarium': {'dir': [0.15, 0.12, 1]},
  'pc-tower': {'dir': [0.4, 0.1, 1]}, 'pc-white': {'dir': [0.4, 0.1, 1]}, 'kb-aula-f99': {'dir': [0.1, 0.6, 1]}, 'pothos': {},
  'wall-clock': {'dir': [0, 0, 1]}, 'dartboard': {'dir': [0, 0, 1]}, 'mini-fridge': {}, 'neon-sign': {'dir': [0, 0, 1]},
  # built in the bake page
  'cup-gold': {}, 'cup-silver': {}, 'cup-bronze': {}, 'medal-gold': {'env': 1.2, 'dir': [0.3, 0.15, 1]}, 'medal-silver': {'env': 1.2, 'dir': [0.3, 0.15, 1]}, 'medal-bronze': {'env': 1.2, 'dir': [0.3, 0.15, 1]},
  'crystal-violet': {}, 'crystal-red': {}, 'crystal-cyan': {}, 'crystal-gold': {},
  'badge-green': {'dir': [0.12, 0.05, 1]}, 'badge-cyan': {'dir': [0.12, 0.05, 1]}, 'badge-violet': {'dir': [0.12, 0.05, 1]}, 'badge-gold': {'dir': [0.12, 0.05, 1]}, 'badge-red': {'dir': [0.12, 0.05, 1]},
  'key-gold': {}, 'key-silver': {}, 'drone': {'dir': [0.25, 0.3, 1]},
  'fig-siege': {}, 'fig-warden': {}, 'fig-colossus': {}, 'fig-king': {}, 'fig-half': {}, 'fig-brute': {}, 'fig-syntax': {},
  'operator': {'dir': [0, 0.05, 1], 'key': 2.0, 'env': 0.6},
}

os.makedirs(OUT, exist_ok=True)
sp = os.path.join(OUT, 'sizes.json')
sizes = json.load(open(sp)) if os.path.exists(sp) else {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page()
    pg.on('console', lambda m: m.type == 'error' and print('console:', m.text))
    pg.goto(f'http://localhost:{PORT}/tools/room-bake.html')
    pg.wait_for_function('window.bakeReady === true', timeout=60000)
    for id, o in JOBS.items():
        if ONLY and id not in ONLY: continue
        r = pg.evaluate('([id, o]) => bake(id, o)', [id, o])
        im = Image.open(io.BytesIO(base64.b64decode(r['url'].split(',')[1]))).convert('RGBA')
        a = im.getchannel('A').point(lambda v: 255 if v > 8 else 0)
        bb = a.getbbox()
        im = im.crop((max(0, bb[0] - 2), max(0, bb[1] - 2), min(im.width, bb[2] + 2), bb[3]))
        if im.height > 360: im = im.resize((round(im.width * 360 / im.height), 360), Image.LANCZOS)
        im.save(os.path.join(OUT, id + '.webp'), 'WEBP', quality=90, method=6)
        sizes[id] = round(im.width / im.height, 3)
        print(id, im.size, os.path.getsize(os.path.join(OUT, id + '.webp')) // 1024, 'KB')
    b.close()
json.dump(sizes, open(sp, 'w'), indent=0, sort_keys=True)
