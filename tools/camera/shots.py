"""shots.py out_dir [shot ...]: plays the World Boss raid in headless Chrome and screenshots each
director shot about 0.6 s in, so the framing can be judged before a full clip is recorded."""
import sys, os, time, random, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'record'))
from play import serve, sync_playwright
S = 0.25
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
names = sys.argv[2:] or ['game', 'wide', 'strike', 'back', 'block', 'dodge', 'scale', 'over', 'dive', 'kill']
CLOCK = open(os.path.join(HERE, 'rec_cam.py')).read().split('CLOCK = """')[1].split('""" % S')[0] % S
ROOT = os.environ.get('SITE', os.path.join(HERE, '..', '..'))
httpd, base = serve(ROOT, random.randint(9000, 9900))
real = lambda gs: gs / S
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    ctx.add_init_script(CLOCK)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(base + 'index.html#/boss'); time.sleep(real(3))
    page.evaluate("document.querySelectorAll('.buddy').forEach(b => b.remove())")
    page.keyboard.press('Enter'); time.sleep(real(6))
    canvas = page.locator('canvas').first
    def typew(w): page.keyboard.type(w + ' ', delay=int(60000 / (110 * 5) / S))
    for n in names:
        if n == 'kill':
            page.evaluate("_wb.setFrac(0.00002)"); typew(page.evaluate('_wb.stack()')); time.sleep(real(0.6))
            page.screenshot(path=f'{out}/{n}_a.png', clip={'x': 0, 'y': 80, 'width': 1280, 'height': 440}); time.sleep(real(1.0))
        elif n != 'game':
            x = "{}"
            if n == 'over':
                p3 = page.evaluate("_wb.sceneCtl().raidInfo().pos[4]"); x = "{ x: { at: { x: %s, y: 0, z: %s } } }" % (p3[0], p3[2])
            for _ in range(40):
                page.evaluate(f"(() => {{ const d = _wb.sceneCtl().director(); d.want('{n}', Object.assign({{}}, ({x}).x ? {{ x: ({x}).x }} : {{}}, {{ pri: 5, len: 2.5 }})); }})()")
                time.sleep(real(0.45))
                if page.evaluate("_wb.sceneCtl().director().shot()") == n: break
                typew(page.evaluate('_wb.stack()'))
            time.sleep(real(0.15))
            page.screenshot(path=f'{out}/{n}_a.png', clip={'x': 0, 'y': 80, 'width': 1280, 'height': 440})
            time.sleep(real(0.75))
        else:
            time.sleep(real(0.5))
        got = page.evaluate("_wb.sceneCtl().director().shot()")
        page.screenshot(path=f'{out}/{n}.png', clip={'x': 0, 'y': 80, 'width': 1280, 'height': 440})
        print(n, 'shot playing:', got)
        if n != 'kill': time.sleep(real(2.2))
    print('log', json.dumps(page.evaluate("_wb.sceneCtl().director().log()")[-12:]))
    print('errors', errs[:3])
    b.close()
