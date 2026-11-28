"""faceoff_shots.py OUT win|lose|close|none [WxH] [t1,t2,...]: a World Boss beam face-off from start to end,
with a screenshot at each game time after it starts (the clock slows to a crawl for each one) and a bot typing
the resistance words. win/lose/close set how much of the simulated raid types (0.85, 0.12, 0.5).
  python3 tools/boss/faceoff_shots.py /tmp/fo win 1920x940 0.5,2.6,4.6,9.0,10.6,11.8"""
import sys, time, os, json
sys.path.insert(0, os.path.dirname(__file__))
from shotlib import *
out, mode = sys.argv[1], sys.argv[2]
W, H = (int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else '1920x940').split('x'))
SHOTS = [float(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else []
route = os.environ.get('ROUTE', '#/boss')
os.makedirs(out, exist_ok=True)
S = 0.35
with sync_playwright() as p:
    b, page, errs = open_page(p, W, H, S, route)
    time.sleep(real(S, 3)); hide(page)
    page.keyboard.press('Enter'); time.sleep(real(S, 6)); hide(page)
    if mode == 'lose': page.evaluate("_wb.simScale(1)")
    page.evaluate("_wb.faceoff(1200, %s)" % ("0.85" if mode == "win" else "0.12" if mode == "lose" else "0.5" if mode == "close" else "null"))
    while True:
        fo = page.evaluate("_wb.fo()")
        if fo['scene']: t0 = fo['scene']['s'] + (game_now(page) - fo['scene']['now']); break
        time.sleep(0.1)
    log = []; shots = list(SHOTS); typed_at = 0; wpm = 70 if mode == 'win' else 0
    while game_now(page) < t0 + 14.5:
        g = game_now(page) - t0
        if shots and g >= shots[0] - 0.12:
            speed(page, 0.02)
            while game_now(page) - t0 < shots[0]: time.sleep(0.02)
            page.screenshot(path=f"{out}/{len(SHOTS) - len(shots):02d}_{shots[0]:05.2f}.png")
            speed(page, S)
            shots.pop(0); continue
        fo = page.evaluate("_wb.fo()")
        log.append({'g': round(g, 2), 'power': fo['power'], 'mine': fo['mine'], 'swapped': fo['swapped'], 'live': fo['live'] and {k: fo['live'][k] for k in ('power', 'need', 'win', 'over')}, 'scene': fo['scene'] and {k: fo['scene'][k] for k in ('power', 'win', 'point')}})
        if wpm and fo['swapped'] and fo['line']:
            page.keyboard.type(fo['line'][0] + ' ', delay=int(12000 / wpm / S / 1.0))
        else:
            time.sleep(0.15)
    json.dump(log, open(f"{out}/log.json", 'w'))
    print('errors', errs[:6])
    last = log[-1]; print('end', last)
    for e in log[::6]: print(e)
    b.close()
