"""Superboss fight checks in headless Chrome: screenshots through a fight, page errors and a frame-time bench.

python3 tools/superboss/fight_shots.py <boss> <out_dir> [options]
  --size 1920x940        viewport
  --page stream|watch    the streamer view (default) or the viewer view (simulated stream)
  --port 8807            the worktree's server (python3 -m http.server 8807)
  --every 6              seconds between screenshots
  --until kill|<secs>    play to the kill (default) or for so many seconds
  --support 10:shield:mika,14:heal:jo    viewers' items at fight seconds (streamer view only)
  --bench                frame time (ms, draw calls) with 4 supporters on stage, before the fight starts
  --dial typemaster      the difficulty dial
  --wpm 165              the bot's speed
Writes NNN_<t>.png, log.json (status, hp, shot, errors) and prints a summary.
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('boss'); p.add_argument('out')
p.add_argument('--size', default='1920x940'); p.add_argument('--page', default='stream')
p.add_argument('--port', type=int, default=8807); p.add_argument('--every', type=float, default=6)
p.add_argument('--until', default='kill'); p.add_argument('--support', default='')
p.add_argument('--bench', action='store_true'); p.add_argument('--dial', default='typemaster')
p.add_argument('--wpm', type=int, default=165); p.add_argument('--full', action='store_true', help='window.__sbFull: no adaptive quality')
a = p.parse_args()
W, H = map(int, a.size.split('x'))
os.makedirs(a.out, exist_ok=True)
base = f'http://127.0.0.1:{a.port}/index.html'
INIT = "try { localStorage.setItem('wpm-skip-intro','1'); localStorage.setItem('wpm-fell-in','1'); localStorage.setItem('wpm-boss-trained','1'); localStorage.setItem('buddy-met','1'); } catch (e) {}"
if a.full: INIT += ' window.__sbFull = true;'
sup = [(float(x.split(':')[0]), x.split(':')[1], x.split(':')[2] if x.count(':') > 1 else 'viewer') for x in a.support.split(',') if x]

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': W, 'height': H})
    ctx.add_init_script(INIT)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    hook = '_sb' if a.page == 'stream' else '_sbw'
    url = f'{base}#/superboss/stream/{a.boss}/{a.dial}' if a.page == 'stream' else f'{base}#/superboss/watch/{a.boss}/{a.dial}'
    page.goto(url)
    page.wait_for_function(f'window.{hook}', timeout=60000)
    page.evaluate("document.querySelectorAll('.buddy').forEach(b => b.remove())")
    time.sleep(4)
    bench = None
    if a.bench and a.page == 'stream':
        page.evaluate('_sb.pause(true)')
        bench = {'empty': page.evaluate('_sb.bench(12)')}
        page.evaluate("_sb.pause(false)")
    log = []
    t0 = time.time(); n = 0; nxt = 0; done = False; sent = set()
    if a.page == 'stream':
        page.evaluate('_sb.start()'); time.sleep(4.2)
        page.evaluate(f'_sb.bot({a.wpm})')
        if a.bench:
            for i, it in enumerate(['shield', 'heal', 'overclock', 'hype']): page.evaluate(f"_sb.support('{it}', 'bench_{i}')")
            time.sleep(1.5); page.evaluate('_sb.pause(true)')
            bench['allies'] = page.evaluate('_sb.bench(12)'); page.evaluate('_sb.pause(false)')
        t0 = time.time()
    limit = 600 if a.until == 'kill' else float(a.until)
    while time.time() - t0 < limit:
        el = time.time() - t0
        for i, (at, it, who) in enumerate(sup):
            if i not in sent and el >= at and a.page == 'stream':
                sent.add(i); page.evaluate(f"_sb.support('{it}', '{who}')")
        if el >= nxt:
            nxt += a.every
            st = page.evaluate(f"(() => {{ const s = {hook}.state ? {hook}.state() : null; let sc = null; try {{ sc = window.__sbLast && __sbLast.info(); }} catch (e) {{}} return s ? {{ status: s.status, hp: s.hp, max: s.maxHp, phase: s.phase, art: s.art && s.art.hp, shot: sc && sc.shot, allies: sc && sc.allies }} : null; }})()")
            page.screenshot(path=os.path.join(a.out, f'{n:03d}_{int(el):03d}.png')); n += 1
            log.append({'t': round(el, 1), **(st or {})})
            if st and st.get('status') in ('won', 'lost') and a.until == 'kill':
                time.sleep(3); page.screenshot(path=os.path.join(a.out, f'{n:03d}_{int(el) + 3:03d}_end.png')); done = True; break
        time.sleep(0.2)
    json.dump({'log': log, 'errors': errs, 'bench': bench}, open(os.path.join(a.out, 'log.json'), 'w'), indent=1)
    b.close()
print(json.dumps({'boss': a.boss, 'page': a.page, 'size': a.size, 'shots': n, 'end': log[-1] if log else None, 'errors': errs[:5], 'nerr': len(errs), 'bench': bench}))
