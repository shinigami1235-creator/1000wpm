"""Record gameplay at a slowed clock (headless WebGL is slow), then speed the video back up.
python3 rec.py <mode> <game_seconds> <out.mp4>    mode: raid | raid-feel | rush | sb-hydra | sb-compiler | sb-leviathan
raid-feel plays the first phase for <game_seconds>, then the half-HP exit, 14 s of phase 3 and the kill."""
import sys, random, time, os, glob, subprocess, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from play import serve, sync_playwright
S = 0.25
mode, secs, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
CLOCK = """(() => { const S = %s, p0 = performance.now(), d0 = Date.now(), pn = performance.now.bind(performance), dn = Date.now;
  performance.now = () => p0 + (pn() - p0) * S; Date.now = () => d0 + (dn() - d0) * S;
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame;
  window.setTimeout = (f, ms, ...a) => st(f, (ms || 0) / S, ...a); window.setInterval = (f, ms, ...a) => si(f, (ms || 0) / S, ...a);
  window.requestAnimationFrame = cb => raf(() => cb(performance.now()));
  try { localStorage.setItem('wpm-skip-intro','1'); localStorage.setItem('wpm-fell-in','1'); localStorage.setItem('buddy-met','1'); } catch (e) {} })();""" % S
vdir = f'/tmp/vid-{mode}'; shutil.rmtree(vdir, ignore_errors=True)
httpd, base = serve(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), random.randint(9000, 9900))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=vdir, record_video_size={'width': 1280, 'height': 720})
    ctx.add_init_script(CLOCK)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    cdp = ctx.new_cdp_session(page); cdp.send('Animation.enable'); cdp.send('Animation.setPlaybackRate', {'playbackRate': S})
    hide = "document.querySelectorAll('.buddy').forEach(b => b.remove())"
    real = lambda gs: gs / S
    def typew(w, wpm=110):   # type at a steady game-time speed
        page.keyboard.type(w + ' ', delay=int(60000 / (wpm * 5) / S))
    marks = {}
    if mode == 'raid':
        page.goto(base + 'index.html#/boss'); time.sleep(real(3)); page.evaluate(hide)
        page.keyboard.press('Enter'); time.sleep(real(5)); page.evaluate(hide)
        t0 = time.time(); blocks = 0
        while time.time() - t0 < real(secs):
            ms = page.evaluate("_wb.mech()")
            blk = [m for m in ms if m['kind'] == 'block' and m['due'] < 2600 and m['due'] > 300]
            if blk:
                blocks += 1
                if blocks == 2: time.sleep(real(3.2)); marks['let one land'] = round((time.time() - t0) * S, 1); continue
                typew(blk[0]['word'], 140); continue
            typew(page.evaluate('_wb.stack()'))
    elif mode == 'raid-feel':
        page.goto(base + 'index.html#/boss'); time.sleep(real(3)); page.evaluate(hide)
        page.keyboard.press('Enter'); time.sleep(real(5)); page.evaluate(hide)
        seen = {'threat in line': 0, 'chip for a block': 0}
        def play(gsecs, let_land=None):
            t0 = time.time(); n = 0
            while time.time() - t0 < real(gsecs):
                if page.evaluate("!!(_wb.state() || {}).defeatedAt"): return
                ms = page.evaluate("_wb.mech()")
                blk = [m for m in ms if m['kind'] in ('block', 'dodge')]
                if blk:
                    seen['threat in line'] += page.evaluate("document.querySelectorAll('.fw.threat').length > 0 ? 1 : 0")
                    seen['chip for a block'] += page.evaluate("document.querySelectorAll('.wb-chip.block, .wb-chip.dodge').length > 0 ? 1 : 0")
                    n += 1
                    if n == let_land:
                        marks['let one land'] = round(page.evaluate('performance.now()') / 1000, 1)
                        time.sleep(real(max(0.3, blk[0]['due'] / 1000 + 0.6))); continue
                    time.sleep(real(0.35)); typew(blk[0]['word'], 120); continue
                typew(page.evaluate('_wb.stack()'))
        play(secs, let_land=2)
        page.evaluate("_wb.jump(1)"); play(6)
        marks['half HP'] = 1; page.evaluate("_wb.jump(2)")
        for _ in range(int(real(6) / 0.4)):
            page.keyboard.type('x'); time.sleep(0.4)
        page.keyboard.press('Backspace')
        play(14)
        page.evaluate("_wb.setFrac(0.00002)"); play(5)
        time.sleep(real(6))
        marks.update(seen); marks['scene'] = page.evaluate("_wb.scene()") and 'ok'
    elif mode == 'rush':
        page.goto(base + 'index.html#/play/rush'); time.sleep(real(2.5)); page.evaluate(hide)
        page.keyboard.press('Enter'); time.sleep(real(4)); page.evaluate(hide)
        page.evaluate("_rush.jump(1)"); time.sleep(real(3))
        t0 = time.time(); n = 0
        while time.time() - t0 < real(secs):
            blk = [c for c in page.evaluate("_rush.chips()") if c['kind'] == 'block']
            if blk:
                n += 1
                if n % 3 == 0: time.sleep(real(2.5)); continue
                typew(blk[0]['word'], 140); continue
            ph = page.evaluate("(_rush.state() || {}).phase")
            st = page.evaluate('_rush.stack()')
            if ph == 'fight' and st: typew(st[0])
            else: page.keyboard.press('Enter'); time.sleep(real(0.6))
    else:
        boss = mode.split('-')[1]
        page.goto(base + f'index.html#/superboss/stream/{boss}/normal'); time.sleep(real(4)); page.evaluate(hide)
        page.evaluate("_sb.start()"); time.sleep(real(4))
        page.evaluate("_sb.bot(165)"); time.sleep(real(secs * 0.6))
        page.evaluate("_sb.bot(45)"); time.sleep(real(secs * 0.4))
    vid = page.video.path(); page.close(); ctx.close(); b.close()
    print(mode, 'errors', errs[:3], 'marks', marks)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', vid, '-filter:v', f'setpts=PTS*{S},fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-an', out], check=True)
print(out, subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip(), 's')
