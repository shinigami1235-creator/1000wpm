# Screenshots of My Room (#/room) for review: each tier with a given set of items, at given sizes.
#   python3 -m http.server 8810 &   then   python3 tools/room-shots.py <port> <out dir> [setup.json]
# setup.json: { "sizes": [[1920, 940]], "shots": [{ "name": "t1", "tier": 1, "eq": { "pet": "cat" },
#   "clean": true, "bar": "pet", "visit": false }] }. Without it, each tier as it comes.
# Writes <name>_<w>x<h>.png and errors.txt (console and page errors), and prints frame times.
import json, os, sys
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else '8810'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/room-shots'
SET = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {'sizes': [[1920, 940]], 'shots': [{'name': f't{t}', 'tier': t, 'eq': {}} for t in range(1, 6)]}
os.makedirs(OUT, exist_ok=True)
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    for w, h in SET['sizes']:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, bypass_csp=True)
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(f'{w}x{h} console: {m.text}'))
        pg.on('pageerror', lambda e: errors.append(f'{w}x{h} pageerror: {e}'))
        pg.add_init_script("localStorage.setItem('wpm-skip-intro','1');localStorage.setItem('wpm-fell-in','1');localStorage.setItem('wpm-boss-trained','1');")
        pg.goto(f'http://localhost:{PORT}/#/room')
        pg.wait_for_function('window.Room && window.WPM && document.querySelector(".rv-bg")', timeout=60000)
        for s in SET['shots']:
            pg.evaluate("""s => { const r = WPM.getRoom(); const R = r && r.v === 2 ? r : { v: 2, tier: null, eq: {} };
              R.tier = s.tier; R.eq[s.tier] = s.eq || {}; if (s.theme !== undefined) { R.theme ||= {}; R.theme[s.tier] = s.theme; } WPM.setRoom(R);
              if (s.test !== undefined && window.RoomTest) RoomTest.set(s.test); }""", s)
            route = f"#/u/{s['visit']}/room" if s.get('visit') else '#/room'
            pg.evaluate(f"location.hash = '#/'")
            pg.wait_for_timeout(200)
            pg.evaluate(f"location.hash = '{route}'")
            pg.wait_for_function('document.querySelector(".rv-bg") && document.querySelector(".rv-bg").complete', timeout=60000)
            pg.wait_for_timeout(s.get('wait', 2500))
            for sel in ['.drop-modal .x', '.ach-pop .x', '[data-close-modal]']:
                for el in pg.query_selector_all(sel):
                    try: el.click()
                    except Exception: pass
            if s.get('bar'):
                pg.evaluate("k => { const t = document.querySelector('.rm-tab'); if (t) t.click(); }", s['bar'])
                pg.wait_for_timeout(300)
                pg.evaluate("k => { const g = RoomTiers.KINDS.find(x => x.id === k).group; const gb = document.querySelector(`.rm-bar [data-g='${g}']`); if (gb) gb.click(); const b = document.querySelector(`.rm-bar [data-k='${k}']`); if (b) b.click(); }", s['bar'])
                pg.wait_for_timeout(800)
            if s.get('menu'):
                pg.evaluate("() => document.querySelector('.rm-menu [data-open]').click()")
                pg.wait_for_timeout(200)
                pg.evaluate("m => { const b = document.querySelector(`.rm-menu [data-m='${m}']`); if (b) b.click(); }", s['menu'])
                pg.wait_for_timeout(1500)
            if s.get('clean'): pg.keyboard.press('h'); pg.wait_for_timeout(300)
            if s.get('frames'):
                ft = pg.evaluate("""() => new Promise(ok => { const t = []; let l = performance.now(); let n = 0;
                  const f = now => { t.push(now - l); l = now; if (++n < 90) requestAnimationFrame(f); else ok(t.slice(10).sort((a, b) => a - b)); }; requestAnimationFrame(f); })""")
                print(s['name'], w, 'median frame', round(ft[len(ft) // 2], 1), 'ms  p90', round(ft[int(len(ft) * 0.9)], 1))
            scroll = pg.evaluate('document.scrollingElement.scrollHeight > innerHeight + 2')
            if scroll and not s.get('visit'): errors.append(f"{w}x{h} {s['name']}: page scrolls")
            path = os.path.join(OUT, f"{s['name']}_{w}x{h}.png")
            pg.screenshot(path=path)
            if s.get('clean'): pg.keyboard.press('h')
            print('saved', path)
        ctx.close()
    b.close()
open(os.path.join(OUT, 'errors.txt'), 'w').write('\n'.join(dict.fromkeys(errors)) or 'none')
print('errors:', len(set(errors)))
for e in dict.fromkeys(errors): print(' ', e)
