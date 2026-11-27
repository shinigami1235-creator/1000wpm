// Race sounds, made in code with WebAudio like the rest of the site. Everything goes through
// one bus with a compressor, so stacked sounds never clip, and nothing plays with the site's
// sound off (TT.soundOn()).
//   const a = RaceAudio.create()
//   a.engine(speed01, boost01)   every frame: the engine note follows the speed
//   a.word() a.typo() a.boost() a.overtake() a.passed() a.lights(go) a.finish(won) a.stop()
window.RaceAudio = (() => {
  function create() {
    let ac = null, bus = null, eng = null, noiseBuf = null, dead = false;
    const on = () => !dead && (!window.TT || TT.soundOn());

    function ctx() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        bus = ac.createGain(); bus.gain.value = 0.7;
        bus.connect(comp).connect(ac.destination);
        const n = ac.sampleRate, b = ac.createBuffer(1, n, n), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        noiseBuf = b;
      } catch (e) { ac = null; }
      return ac;
    }
    function tone(type, f0, f1, dur, vol, at = 0, q) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let out = o;
      if (q) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = q; o.connect(f); out = f; }
      out.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol, type, f0, f1, at = 0, Q = 1) {
      const a = ctx(); if (!a || !noiseBuf) return;
      const t = a.currentTime + at, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      f.type = type; f.Q.value = Q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    }

    // the engine: a sawtooth and a square an octave down through a lowpass that opens with speed
    function engine(speed, boost) {
      if (!ac && speed <= 0) return;
      const a = ctx(); if (!a) return;
      if (!eng) {
        const o1 = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
        o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.Q.value = 4; g.gain.value = 0;
        const g2 = a.createGain(); g2.gain.value = 0.5;
        o1.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(bus);
        // a hiss of wind that grows with speed and boost
        const w = a.createBufferSource(), wf = a.createBiquadFilter(), wg = a.createGain();
        w.buffer = noiseBuf; w.loop = true; wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 0.7; wg.gain.value = 0;
        w.connect(wf).connect(wg).connect(bus);
        o1.start(); o2.start(); w.start();
        eng = { o1, o2, f, g, w, wf, wg };
      }
      const t = a.currentTime, k = Math.max(0, Math.min(1, speed));
      // three gears: the note climbs inside each gear and drops a little at the shift
      const gear = Math.min(2, Math.floor(k * 3)), inG = k * 3 - gear;
      const hz = 46 + gear * 10 + inG * 42 + boost * 16;
      eng.o1.frequency.setTargetAtTime(hz, t, 0.06); eng.o2.frequency.setTargetAtTime(hz / 2, t, 0.06);
      eng.f.frequency.setTargetAtTime(260 + k * 900 + boost * 700, t, 0.08);
      eng.g.gain.setTargetAtTime(on() ? 0.035 + k * 0.035 : 0, t, 0.08);
      eng.wf.frequency.setTargetAtTime(600 + k * 1400 + boost * 1200, t, 0.1);
      eng.wg.gain.setTargetAtTime(on() ? k * 0.02 + boost * 0.035 : 0, t, 0.1);
    }

    return {
      engine,
      // a finished word: a short shift click with a rising blip
      word() { if (!on()) return; noise(0.05, 0.08, 'highpass', 3000, 5000); tone('triangle', 520, 880, 0.09, 0.05); },
      // a wrong key: tyres screech and the brakes bite
      typo() { if (!on()) return; noise(0.28, 0.07, 'bandpass', 2600, 1700, 0, 9); tone('sawtooth', 140, 70, 0.16, 0.05, 0, 600); },
      // boost on: a rising whoosh and a low punch
      boost() { if (!on()) return; noise(0.6, 0.12, 'bandpass', 400, 3800, 0, 1.4); tone('sine', 90, 45, 0.3, 0.12); tone('square', 330, 660, 0.18, 0.025, 0.05, 2000); },
      // you passed the other car
      overtake() { if (!on()) return; noise(0.45, 0.1, 'bandpass', 2400, 500, 0, 2); [660, 880, 1320].forEach((f, i) => tone('triangle', f, f, 0.14, 0.05, 0.08 + i * 0.07)); },
      // the other car passed you
      passed() { if (!on()) return; noise(0.45, 0.08, 'bandpass', 500, 2400, 0, 2); tone('triangle', 440, 330, 0.22, 0.045, 0.1); },
      // the start lights: a low beep for each red, a high one for green
      lights(go) { if (!on()) return; tone('square', go ? 1046 : 523, go ? 1046 : 523, go ? 0.4 : 0.14, 0.035, 0, 3000); },
      finish(won) {
        if (!on()) return;
        noise(1.2, 0.08, 'highpass', 6000, 1500);
        const notes = won ? [523, 659, 784, 1046, 1318] : [440, 392, 330];
        notes.forEach((f, i) => tone('triangle', f, f, won && i === notes.length - 1 ? 0.7 : 0.18, 0.06, i * 0.09));
        if (won) tone('sine', 65, 65, 0.5, 0.1);
      },
      stop() {
        dead = true;
        if (eng) { try { eng.o1.stop(); eng.o2.stop(); eng.w.stop(); } catch (e) {} eng = null; }
        if (ac) { ac.close().catch(() => {}); ac = null; }
      },
    };
  }
  return { create };
})();
