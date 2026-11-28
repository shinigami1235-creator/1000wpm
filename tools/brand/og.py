"""Save the site's preview picture (assets/brand/og.png) from js/app/share-card.js.

  python3 -m http.server 8809 &   (from the repo root)
  python3 tools/brand/og.py [port]
"""
import sys, base64, pathlib, asyncio
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
PORT = sys.argv[1] if len(sys.argv) > 1 else '8809'
LINE = "Join CTRL as an operator. Race Art's 204 wpm and fight bosses with typists around the world."
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = await b.new_page()
        await pg.add_init_script("localStorage.setItem('wpm-skip-intro','1')")
        await pg.goto(f'http://localhost:{PORT}/#/leaderboard')
        await pg.wait_for_function('window.ShareCard && window.CtrlBrand')
        url = await pg.evaluate(f"ShareCard.canvas({LINE!r}, {{ kicker: '// a global typing operation' }}).then(c => c.toDataURL('image/png'))")
        (ROOT / 'assets/brand/og.png').write_bytes(base64.b64decode(url.split(',')[1]))
        await b.close()
    print('wrote assets/brand/og.png')
asyncio.run(main())
