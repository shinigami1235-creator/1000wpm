"""Browser test for the Superboss music: each boss plays its own loop in each phase (audio/sb-<boss>-<phase>.mp3),
the decoded files are the loop plus 1 s (the loop points in js/app/sb-audio.js depend on it), the enrage
plays wb-enrage, and the page throws no errors.

    python3 tools/music/sb_music_test.py
"""
import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'boss'))
from shotlib import *

LOOPS = {'hydra': (32, 140), 'compiler': (32, 132), 'leviathan': (48, 174)}
ok_n = fail_n = 0
def ok(c, name):
    global ok_n, fail_n
    if c: ok_n += 1
    else: fail_n += 1; print('FAIL', name)

with sync_playwright() as p:
    for boss, (bars, bpm) in LOOPS.items():
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 720}); ctx.add_init_script(clock(1.0))
        page = ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
        page.goto(BASE + f'index.html#/superboss/stream/{boss}/normal'); time.sleep(4); hide(page)
        page.evaluate('_sb.start()'); time.sleep(5); page.evaluate('SuperAudio.unlock()')
        for ph in (1, 2, 3):
            if ph > 1: page.evaluate(f'_sb.phase({ph})'); time.sleep(3)
            t = None
            for k in range(30):
                t = page.evaluate('SuperAudio.state().track')
                if t == f'sb-{boss}-{ph}': break
                time.sleep(0.3)
            ok(t == f'sb-{boss}-{ph}', f'{boss} phase {ph} plays sb-{boss}-{ph} ({t})')
            d = page.evaluate(f"""(async () => {{ const ac = SuperAudio.combat().ac; const r = await fetch('audio/sb-{boss}-{ph}.mp3');
              const buf = await ac.decodeAudioData(await r.arrayBuffer()); return buf.duration; }})()""")
            want = bars * 240 / bpm + 1.0
            ok(abs(d - want) < 0.03, f'sb-{boss}-{ph} decodes to the loop plus 1 s ({d:.3f} vs {want:.3f})')
        # quick phase changes back and forth: the equal-power crossfade must not throw (it is caught, so count the throws)
        page.evaluate("""(() => { window.__xfErr = 0; const P = AudioParam.prototype;
          for (const k of ['setValueCurveAtTime', 'cancelAndHoldAtTime', 'setValueAtTime']) { const f = P[k];
            P[k] = function (...a) { try { return f.apply(this, a); } catch (e) { window.__xfErr++; throw e; } }; } })()""")
        for k in range(6):
            page.evaluate(f"_sb.phase({[1, 2, 1, 3, 2, 3][k]})"); time.sleep([0.3, 0.6, 1.5, 0.2, 2.0, 0.8][k])
        time.sleep(2)
        ok(page.evaluate('window.__xfErr') == 0, f"{boss}: crossfades never throw ({page.evaluate('window.__xfErr')})")
        ok(page.evaluate('SuperAudio.state().track') == f'sb-{boss}-3', f'{boss}: the last phase asked for is the one playing')
        page.evaluate('_sb.enrage()'); time.sleep(3)
        t = page.evaluate('SuperAudio.state().track')
        ok(t == 'wb-enrage', f'{boss} enrage plays wb-enrage ({t})')
        bad = [e for e in errs if 'favicon' not in e]
        ok(not bad, f'{boss}: no page errors {bad[:3]}')
        b.close()
print(f'{ok_n} passed, {fail_n} failed')
sys.exit(1 if fail_n else 0)
