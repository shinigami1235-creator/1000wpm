"""Shared setup for tools/boss captures: headless Chrome on a clock that can run slow (window.__S game seconds
per real second, CSS animations included), so a moment of a fight can be caught exactly. Serves the repo itself
unless BASE is set."""
import time, json, os, sys
from playwright.sync_api import sync_playwright
import random, sys as _sys
_sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'record'))
BASE = os.environ.get('BASE')
if not BASE:
    from play import serve
    _httpd, BASE = serve(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'), random.randint(9000, 9900))
def clock(S):
    # a slowed clock whose speed can change mid-run: window.__S (game seconds per real second)
    return """(() => { window.__S = %s; const pn = performance.now.bind(performance), dn = Date.now;
  let lr = pn(), vp = lr, vd = dn();
  const step = () => { const r = pn(), d = (r - lr) * window.__S; lr = r; vp += d; vd += d; };
  performance.now = () => { step(); return vp; }; Date.now = () => { step(); return Math.floor(vd); };
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame;
  window.setTimeout = (f, ms, ...a) => st(f, (ms || 0) / window.__S, ...a); window.setInterval = (f, ms, ...a) => si(f, (ms || 0) / window.__S, ...a);
  window.requestAnimationFrame = cb => raf(() => cb(performance.now()));
  try { for (const k of ['wpm-skip-intro','wpm-fell-in','wpm-boss-trained','buddy-met']) localStorage.setItem(k,'1'); } catch (e) {} })();""" % S
def game_wait(page, gsec, S=None):
    """wait gsec of game time by polling the page clock"""
    t0 = page.evaluate('performance.now()')
    while True:
        t = page.evaluate('performance.now()')
        if (t - t0) / 1000 >= gsec: return
        left = gsec - (t - t0) / 1000
        sp = page.evaluate('window.__S')
        time.sleep(min(2.0, max(0.02, left / sp * 0.8)))
def game_now(page): return page.evaluate('performance.now()') / 1000
def open_page(p, w=1366, h=660, S=0.25, route='#/boss'):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': w, 'height': h})
    ctx.add_init_script(clock(S))
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    page.goto(BASE + 'index.html' + route)
    # CSS animations follow the same clock: every change of window.__S goes through speed()
    cdp = ctx.new_cdp_session(page); cdp.send('Animation.enable'); cdp.send('Animation.setPlaybackRate', {'playbackRate': S})
    page._cdp = cdp
    return b, page, errs
def real(S, gs): return gs / S
def hide(page): page.evaluate("document.querySelectorAll('.buddy, .modal-drop, .ach-pop').forEach(b => b.remove())")

def speed(page, S):
    page.evaluate(f'window.__S = {S}')
    try: page._cdp.send('Animation.setPlaybackRate', {'playbackRate': S})
    except Exception: pass
