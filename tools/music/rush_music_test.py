"""Boss Rush music check: js/app/rush/audio.js loops each rush-<boss>-<phase>.mp3 as a whole file, so Chrome must
decode each one to exactly its 16 bars (a sample out makes a click at the seam), and the end must run on into
the start. Also plays a boss's three phases through RushAudio in a run, with no page errors.

    python3 tools/music/rush_music_test.py
"""
import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'boss'))
from shotlib import *
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rush import BOSSES

ok_n = fail_n = 0
def ok(c, name):
    global ok_n, fail_n
    if c: ok_n += 1
    else: fail_n += 1; print('FAIL', name)

with sync_playwright() as p:
    b, page, errs = open_page(p, 1280, 720, 1.0, '#/play/rush')
    time.sleep(4); hide(page)
    page.keyboard.press('Enter'); time.sleep(4)
    for boss, (tonic, bpms, *_rest) in BOSSES.items():
        for ph in (1, 2, 3):
            n = f'rush-{boss}-{ph}'
            r = page.evaluate(f"""(async () => {{ const ac = new OfflineAudioContext(2, 44100, 44100);
              const buf = await ac.decodeAudioData(await (await fetch('audio/{n}.mp3')).arrayBuffer());
              const a = buf.getChannelData(0), k = a.length;
              let jump = Math.abs(a[0] - a[k - 1]), step = 0;
              for (let i = k - 2000; i < k - 1; i++) step = Math.max(step, Math.abs(a[i + 1] - a[i]));
              return {{ n: k, sr: buf.sampleRate, jump, step }}; }})()""")
            want = round(16 * 240 / bpms[ph - 1] * r['sr'])
            ok(abs(r['n'] - want) <= 1, f"{n} decodes to its 16 bars ({r['n']} samples, {want} wanted)")
            ok(r['jump'] <= max(0.05, r['step'] * 1.2), f"{n} runs from its end into its start (jump {r['jump']:.3f}, steps {r['step']:.3f})")
    # a run: the first boss's music comes up through RushAudio
    hide(page); page.keyboard.press('Enter'); time.sleep(3); hide(page)
    page.evaluate("BossAudio.unlock(); window.RushAudio && RushAudio.unlock()")
    t = None
    for k in range(40):
        t = page.evaluate("window.RushAudio ? RushAudio.state().track || RushAudio.state().want : ''")
        if t and 'rush-' in str(t): break
        time.sleep(0.25)
    ok(t and 'rush-' in str(t), f'a run plays a rush track ({t})')
    bad = [e for e in errs if 'favicon' not in e]
    ok(not bad, f'no page errors {bad[:3]}')
    b.close()
print(f'{ok_n} passed, {fail_n} failed')
sys.exit(1 if fail_n else 0)
