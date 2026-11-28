"""Browser test for the World Boss music (js/app/boss-audio.js) in a training raid, on a real-time clock:
the first loop starts on its first bar, a phase change lands on a beat of the old loop from the new
loop's first bar, a cut comes back on the top of a bar, a block before the cut changes nothing, a
block during it brings the music back on a bar, the threat layer comes in, a beam face-off plays the
cue and the result on its beats and brings the loop back 4 beats later, the enrage and the kill play.
Also checks Chrome decodes the mp3s with no offset (the loop points depend on it).

    python3 tools/boss/music_test.py
"""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shotlib import *

ok_n = fail_n = 0
def ok(c, name):
    global ok_n, fail_n
    if c: ok_n += 1
    else: fail_n += 1; print('FAIL', name)
def st(page): return page.evaluate('BossAudio.state()')
def wait_for(page, js, secs=10):
    t = time.time()
    while time.time() - t < secs:
        v = page.evaluate(js)
        if v: return v
        time.sleep(0.1)
    return None
def on_grid(x, unit, tol=0.002):
    r = x % unit
    return min(r, unit - r) < tol

with sync_playwright() as p:
    b, page, errs = open_page(p, 1280, 720, 1.0, '#/boss')
    time.sleep(3); hide(page)
    page.keyboard.press('Enter'); time.sleep(2); hide(page)
    page.evaluate("document.dispatchEvent(new Event('pointerdown')); BossAudio.unlock()")
    s = wait_for(page, "BossAudio.state().track === 'wb-p1' && BossAudio.state()", 15)
    ok(s, 'phase 1 plays wb-p1'); print('start', s and {k: s[k] for k in ('track', 'ctx', 'last')})
    if s:
        ok(s['last']['pos'] == 0, 'the first loop starts on its first bar')
        BEAT, BAR = s['BEAT'], s['BAR']
        # Chrome's decode: duration and offset of wb-p1 against the file's own length (loop + 1 s)
        d = page.evaluate("""(async () => { const ac = BossAudio.out().ac; const b = await (await fetch('audio/wb-p1.mp3')).arrayBuffer();
          const buf = await ac.decodeAudioData(b); return { dur: buf.duration, sr: buf.sampleRate, head: Array.from(buf.getChannelData(0).slice(0, 4096)) }; })()""")
        ok(abs(d['dur'] - (64 * BAR + 1.0)) < 0.03, f"decoded wb-p1 is the loop plus 1 s ({d['dur']:.3f} s)")
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'music'))
        import engine as E, numpy as np
        ref = E.read_audio(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'audio', 'wb-p1.mp3'))[:4096, 0]
        h = np.array(d['head'])
        if d['sr'] == E.SR:
            lag = max(range(-1200, 1201), key=lambda k: float(np.dot(h[max(0, k):4096 + min(0, k)], ref[max(0, -k):4096 - max(0, k)])))
            ok(abs(lag) <= 2, f'Chrome decodes with no offset (lag {lag} samples)')
        # a cut: out in 0.3 s for 0.6 s, back on the top of a bar
        page.evaluate('BossAudio.cut(0.3, 0.6)'); time.sleep(1.3)
        s = st(page); l = s['last']
        ok(l['why'] == 'cut' and on_grid(l['pos'], BAR), f"a cut comes back on the top of a bar ({l})")
        # a block before the music drops: nothing changes
        before = st(page)['last']
        page.evaluate('BossAudio.cut(1.0, 0.8)'); time.sleep(0.3); page.evaluate('BossAudio.uncut()'); time.sleep(1.8)
        ok(st(page)['last'] == before, 'a block before the cut leaves the loop alone')
        # a block during the cut: back now, on a bar
        page.evaluate('BossAudio.cut(0.1, 1.5)'); time.sleep(0.6); page.evaluate('BossAudio.uncut()'); time.sleep(0.3)
        l = st(page)['last']
        ok(l['why'] == 'uncut' and on_grid(l['pos'], BAR), f'a block during the cut brings it back on a bar ({l})')
        # phase 2: on a beat of the old loop, from the new loop's first bar
        old = st(page)
        page.evaluate('_wb.jump(1)')
        s = wait_for(page, "BossAudio.state().track === 'wb-p2' && BossAudio.state()", 6)
        ok(s, 'phase 2 plays wb-p2')
        if s:
            l = s['last']
            ok(l['pos'] == 0, 'the new phase starts from its first bar')
            ok(on_grid(l['at'] - old['t0'], BEAT, 0.003) or l['why'] == 'cut', f"the change lands on a beat of the old loop ({l['why']}, {(l['at'] - old['t0']) % BEAT:.4f})")
        time.sleep(1.5)
        page.evaluate('BossAudio.threat(true)'); time.sleep(0.4)
        ok(st(page)['threat'], 'the threat layer comes in')
        page.evaluate('BossAudio.threat(false)')
        # a beam face-off the simulated raid wins
        page.evaluate('_wb.faceoff(400, 0.9)')
        c = wait_for(page, 'BossAudio.state().cue && BossAudio.state().cue.playing && BossAudio.state().cue', 20)
        ok(c, 'the face-off cue plays')
        r = wait_for(page, "BossAudio.state().cue && BossAudio.state().cue.back && BossAudio.state()", 16)
        ok(r, 'the face-off resolves with a result sting')
        if r:
            cue = r['cue']
            beats = (cue['back'] - cue['t0']) / BEAT
            ok(32.99 <= beats < 36, f"the loop comes back 4 beats after the result: {beats:.2f} beats into the face-off (33 when the result is on time)")
            ok(cue['sting'] in ('wb-fo-win', 'wb-fo-lose'), f"result sting {cue['sting']}")
            time.sleep(max(0, cue['back'] - r['now']) + 0.5)
            s = st(page)
            ok(s['track'] == 'wb-p2' and s['last']['why'].startswith('faceoff') and on_grid(s['last']['pos'], 8 * BAR), f"phase 2 comes back at a section start ({s['last']})")
        print('face-off', c, r and r['cue'])
        # the enrage, then the kill
        page.evaluate('_wb.jump(4)')
        s = wait_for(page, "['wb-enrage','wb-p4','wb-p3'].includes(BossAudio.state().track) && BossAudio.state()", 8)
        time.sleep(3)
        s = st(page)
        ok(s['track'] == 'wb-enrage', f"the enrage plays ({s['track']})")
        page.evaluate('_wb.setFrac(0)'); time.sleep(5)
        s = st(page)
        ok(not s['track'], f"the kill stops the loop ({s['track']})")
    bad = [e for e in errs if 'favicon' not in e]
    ok(not bad, f'no page errors {bad[:4]}')
    print(f'{ok_n} passed, {fail_n} failed')
    b.close()
    sys.exit(1 if fail_n else 0)
