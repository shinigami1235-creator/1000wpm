// Combat sounds, made in code with Web Audio: one per combo tier shot, the tier-up
// chime, the offer chime, combo break and fizzle, and a cast sound for every spell
// plus the sound each of its hits makes.
//   const sfx = Combat.Audio.create({ ctx: () => audioContext, out: () => gainNode, on: () => true });
//   sfx.play('shot3')  sfx.play('tierUp', 2)  sfx.play('electro-storm')  sfx.play('zap', power)
//   sfx.render(name, arg, secs) -> Float32 samples, for loudness checks
// The world boss passes BossAudio's context and effects bus, so these sit under the
// boss music through the same compressor.
window.Combat = window.Combat || {};
Combat.Audio = (() => {
  // level per sound, set from loudness renders so they sit with the boss's own hits
  const LEVEL = {
    shot1: 1.5, shot2: 1.4, shot3: 1.0, shot4: 0.7, tierUp: 1.3, offer: 1.4, break: 2.6, fizzle: 2.0, ward: 1.2, guard: 1.6,
    crack: 1.3, tick: 4, pulse: 1.8, slice: 1.0, ice: 1.4, zap: 1.4, blip: 3.6, boom: 0.5, sweep: 1.3, thrum: 0.32, crash: 1.0, lock: 1.6, ultimate: 0.34,
    'data-spike': 3, 'safe-mode': 0.9, 'binary-rain': 4, 'echo-pulse': 1.5, 'glitch-blade': 2.6, 'cryo-lock': 1.8, 'electro-storm': 1.9,
    'hyper-thread': 1.5, 'packet-storm': 4.4, 'neon-nova': 1.9, 'system-purge': 2.2, 'void-sphere': 0.3, 'kernel-panic': 3, 'root-access': 2.8,
    'quantum-split': 1.1, 'zero-day': 1.1,
  };
  const GAP = { tick: 40, blip: 35, pulse: 60, shot1: 25, shot2: 25 };

  function kit(c) {
    let out = null;
    const nbuf = {};
    function noise(len) {
      const k = Math.ceil(len * 20) / 20;
      if (!nbuf[k]) {
        const b = c.createBuffer(1, Math.ceil(c.sampleRate * k), c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        nbuf[k] = b;
      }
      const s = c.createBufferSource(); s.buffer = nbuf[k]; return s;
    }
    function env(g, t, a, peak, dec) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    }
    function tone(t, type, f0, f1, len, vol, a = 0.004, dest) {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len);
      o.connect(g).connect(dest || out); o.start(t); o.stop(t + a + len + 0.05);
      return o;
    }
    function hiss(t, len, freq, q, vol, type = 'bandpass', a = 0.003, f1, dest) {
      const n = noise(len + a + 0.05);
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len);
      n.connect(f).connect(g).connect(dest || out); n.start(t); n.stop(t + a + len + 0.05);
    }
    // a feedback echo that the sound's tail rings into
    function echo(delay, fb, len) {
      const d = c.createDelay(1); d.delayTime.value = delay;
      const g = c.createGain(); g.gain.value = fb;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
      d.connect(f).connect(g).connect(d);
      const wet = c.createGain(); wet.gain.value = 0.6;
      f.connect(wet).connect(out);
      const inp = c.createGain(); inp.connect(d); inp.connect(out);
      return inp;
    }
    const semis = n => Math.pow(2, n / 12);
    const R = (a, b) => a + Math.random() * (b - a);

    const S = {
      // ---- basic attack per tier ----
      shot1(t) { tone(t, 'square', 380, 1300, 0.06, 0.13); tone(t + 0.02, 'sine', 160, 70, 0.1, 0.32); hiss(t, 0.06, 4200, 1.4, 0.18); },
      shot2(t) {
        tone(t, 'sawtooth', 620, 1650, 0.08, 0.09); tone(t, 'sawtooth', 640, 1700, 0.08, 0.09);
        tone(t + 0.03, 'triangle', 1980, 1900, 0.1, 0.08); tone(t + 0.02, 'sine', 150, 60, 0.12, 0.34); hiss(t, 0.09, 5200, 1, 0.18);
      },
      shot3(t) {
        hiss(t, 0.05, 7000, 0.7, 0.4, 'highpass', 0.001);
        tone(t, 'sawtooth', 2600, 260, 0.16, 0.14, 0.001);
        tone(t, 'sine', 120, 38, 0.24, 0.55, 0.002);
        hiss(t + 0.01, 0.22, 1600, 0.8, 0.2, 'bandpass', 0.002, 300);
      },
      shot4(t) {
        const e = echo(0.11, 0.35);
        hiss(t, 0.06, 7500, 0.7, 0.45, 'highpass', 0.001, undefined, e);
        tone(t, 'sawtooth', 3000, 200, 0.2, 0.16, 0.001, e);
        tone(t, 'square', 1500, 120, 0.18, 0.06, 0.001, e);
        tone(t, 'sine', 95, 30, 0.42, 0.7, 0.002);
        hiss(t + 0.01, 0.4, 900, 0.6, 0.28, 'lowpass', 0.003, 120);
      },
      // ---- combo events ----
      tierUp(t, tier = 1) {
        const base = [0, 523, 587, 659, 784][Math.min(4, tier)] || 523;
        [0, 4, 7, 12, 16].slice(0, Math.min(5, tier + 2)).forEach((n, i) => tone(t + i * 0.06, 'triangle', base * semis(n), base * semis(n), 0.22, 0.16, 0.005));
        hiss(t, 0.35, 5000, 0.8, 0.08, 'bandpass', 0.05, 9000);
        if (tier >= 3) tone(t, 'sine', 110, 55, 0.4, 0.4);
      },
      offer(t) {
        tone(t, 'sine', 1046, 1046, 0.5, 0.16, 0.01); tone(t + 0.09, 'sine', 1568, 1568, 0.55, 0.12, 0.01);
        tone(t + 0.18, 'triangle', 2093, 2093, 0.5, 0.06, 0.02); hiss(t, 0.5, 8000, 2, 0.05, 'bandpass', 0.1);
      },
      break(t) { tone(t, 'sawtooth', 700, 110, 0.35, 0.16); hiss(t, 0.3, 900, 0.7, 0.2, 'lowpass', 0.004, 200); tone(t, 'square', 220, 140, 0.18, 0.05); },
      fizzle(t) { tone(t, 'square', 180, 120, 0.16, 0.1); hiss(t, 0.2, 3000, 2, 0.14, 'bandpass', 0.002, 600); tone(t + 0.1, 'sine', 330, 160, 0.12, 0.12); },
      ward(t) {
        [1180, 1730, 2650, 3420].forEach((f, i) => tone(t, 'triangle', f, f * 0.995, 0.5 - i * 0.08, 0.13 - i * 0.02, 0.001));
        tone(t, 'sine', 140, 70, 0.3, 0.4); hiss(t, 0.18, 6000, 1, 0.22, 'highpass');
      },
      guard(t) { [1760, 1780].forEach(f => tone(t, 'sine', f, f, 0.6, 0.12, 0.002)); tone(t + 0.07, 'triangle', 2637, 2600, 0.4, 0.07); hiss(t, 0.12, 9000, 2, 0.08); },

      // ---- spell casts ----
      'data-spike'(t) { hiss(t, 0.35, 400, 0.8, 0.3, 'bandpass', 0.15, 3000); tone(t + 0.25, 'triangle', 1400, 1400, 0.3, 0.1); tone(t + 0.3, 'triangle', 2100, 2100, 0.3, 0.07); },
      'safe-mode'(t) {
        tone(t, 'sine', 220, 880, 0.6, 0.2, 0.15); tone(t, 'triangle', 330, 1320, 0.6, 0.08, 0.2);
        [1320, 1760, 2217].forEach((f, i) => tone(t + 0.35 + i * 0.05, 'sine', f, f, 0.5, 0.06, 0.01)); hiss(t, 0.6, 2000, 0.6, 0.1, 'bandpass', 0.2, 7000);
      },
      'binary-rain'(t) { for (let i = 0; i < 10; i++) tone(t + i * 0.035, 'square', R(600, 1800), R(600, 1800), 0.03, 0.06); hiss(t, 0.5, 3000, 0.6, 0.08, 'bandpass', 0.1, 6000); },
      'echo-pulse'(t) { const e = echo(0.16, 0.5); tone(t, 'sine', 990, 980, 0.25, 0.25, 0.002, e); tone(t, 'sine', 495, 490, 0.3, 0.12, 0.002, e); },
      'glitch-blade'(t) { for (let i = 0; i < 6; i++) tone(t + i * 0.025, 'square', R(200, 2400), R(200, 2400), 0.025, 0.08); hiss(t + 0.12, 0.2, 1200, 0.6, 0.3, 'bandpass', 0.05, 9000); },
      'cryo-lock'(t) {
        [2093, 2637, 3136, 3951].forEach((f, i) => tone(t + i * 0.04, 'sine', f, f * 0.99, 0.7, 0.06, 0.01));
        hiss(t, 0.7, 6000, 3, 0.1, 'bandpass', 0.2, 2500); tone(t, 'triangle', 400, 200, 0.5, 0.06, 0.1);
      },
      'electro-storm'(t) { hiss(t, 1.2, 140, 0.8, 0.5, 'lowpass', 0.4, 90); tone(t, 'sawtooth', 55, 48, 1.1, 0.12, 0.4); hiss(t + 0.3, 0.4, 4000, 2, 0.08, 'bandpass', 0.2, 7000); },
      'hyper-thread'(t) {
        tone(t, 'sawtooth', 200, 1600, 0.55, 0.1, 0.4); tone(t, 'sawtooth', 203, 1620, 0.55, 0.1, 0.4);
        hiss(t, 0.6, 600, 0.8, 0.14, 'bandpass', 0.45, 6000); tone(t + 0.55, 'square', 1600, 1600, 0.06, 0.08);
      },
      'packet-storm'(t) { for (let i = 0; i < 14; i++) tone(t + i * 0.045, 'square', R(900, 2400), R(900, 2400), 0.025, 0.05); hiss(t, 0.7, 2200, 1, 0.08, 'bandpass', 0.2, 5000); },
      'neon-nova'(t) { tone(t, 'sawtooth', 120, 960, 0.45, 0.12, 0.35); hiss(t, 0.45, 300, 0.7, 0.2, 'bandpass', 0.35, 5000); },
      'system-purge'(t) { hiss(t, 0.9, 200, 1.6, 0.25, 'bandpass', 0.3, 8000); tone(t, 'triangle', 300, 1200, 0.9, 0.07, 0.3); },
      'void-sphere'(t) { tone(t, 'sine', 45, 90, 2.6, 0.55, 1.2); tone(t, 'sawtooth', 90, 60, 2.4, 0.07, 1.4); hiss(t, 2.6, 300, 0.7, 0.2, 'lowpass', 1.6, 60); },
      'kernel-panic'(t) {
        [880, 660, 440, 330].forEach((f, i) => tone(t + i * 0.1, 'square', f, f, 0.08, 0.1));
        for (let i = 0; i < 5; i++) hiss(t + 0.4 + i * 0.03, 0.03, R(1000, 7000), 4, 0.15);
      },
      'root-access'(t) { tone(t, 'square', 660, 660, 0.08, 0.1); tone(t + 0.11, 'square', 990, 990, 0.14, 0.1); tone(t + 0.3, 'triangle', 1980, 1980, 0.3, 0.06); hiss(t + 0.28, 0.04, 6000, 2, 0.2); },
      'quantum-split'(t) { [880, 887, 1318, 1328].forEach((f, i) => tone(t + i * 0.03, 'sine', f, f * (i % 2 ? 0.97 : 1.03), 0.8, 0.07, 0.05)); hiss(t, 0.8, 5000, 2, 0.06, 'bandpass', 0.3, 1500); },
      'zero-day'(t) {
        tone(t, 'sawtooth', 41, 41, 1.9, 0.18, 0.6); tone(t, 'sawtooth', 41.6, 41.6, 1.9, 0.16, 0.6);
        [0, 0.4, 0.8, 1.2, 1.5, 1.7].forEach(w => tone(t + w, 'square', 1200 + w * 400, 1100 + w * 400, 0.09, 0.07));
        hiss(t + 0.8, 1.1, 300, 0.7, 0.3, 'bandpass', 0.9, 6000);
      },

      // ---- the sound each spell hit makes ----
      crack(t) { hiss(t, 0.08, 5000, 1, 0.35, 'highpass', 0.001); tone(t, 'triangle', 2600, 1300, 0.1, 0.1, 0.001); tone(t, 'sine', 140, 50, 0.2, 0.4); },
      tick(t) { tone(t, 'square', R(1200, 2600), 900, 0.025, 0.07, 0.001); },
      pulse(t) { tone(t, 'sine', 880, 860, 0.16, 0.18, 0.002); tone(t, 'sine', 140, 80, 0.12, 0.2); },
      slice(t) { hiss(t, 0.28, 900, 0.8, 0.5, 'bandpass', 0.01, 10000); tone(t + 0.02, 'triangle', 3300, 3100, 0.45, 0.07); tone(t, 'sine', 100, 40, 0.3, 0.5); },
      ice(t) { for (let i = 0; i < 6; i++) hiss(t + i * 0.025, 0.04, R(4000, 9000), 3, 0.18, 'bandpass', 0.001); tone(t, 'sine', 120, 60, 0.25, 0.35); },
      zap(t) {
        hiss(t, 0.09, 6000, 0.6, 0.6, 'highpass', 0.001);
        for (let i = 0; i < 4; i++) tone(t + i * 0.018, 'sawtooth', R(1500, 4000), R(200, 900), 0.04, 0.08, 0.001);
        hiss(t + 0.05, 1.1, 180, 0.7, 0.42, 'lowpass', 0.05, 60);
      },
      blip(t) { tone(t, 'square', R(1400, 2200), R(500, 900), 0.04, 0.07, 0.001); tone(t, 'sine', 160, 90, 0.05, 0.12); },
      boom(t) { tone(t, 'sine', 90, 28, 0.9, 0.85, 0.003); hiss(t, 0.8, 1400, 0.6, 0.5, 'lowpass', 0.003, 100); hiss(t, 0.2, 8000, 0.8, 0.25, 'highpass'); },
      sweep(t) { hiss(t, 0.5, 400, 0.9, 0.35, 'bandpass', 0.05, 7000); tone(t, 'sine', 120, 60, 0.3, 0.3); },
      thrum(t, power = 0) {
        if (power > 100) {
          // the collapse: a suck in, then the blast
          hiss(t, 0.25, 6000, 0.7, 0.3, 'bandpass', 0.2, 300);
          tone(t + 0.25, 'sine', 70, 22, 1.3, 1, 0.003); hiss(t + 0.25, 1.2, 2000, 0.5, 0.6, 'lowpass', 0.003, 70); hiss(t + 0.25, 0.25, 9000, 1, 0.25, 'highpass');
        } else { tone(t, 'sine', 70, 50, 0.22, 0.45, 0.01); hiss(t, 0.2, 260, 1, 0.12, 'lowpass'); }
      },
      crash(t) { for (let i = 0; i < 3; i++) tone(t + i * 0.03, 'square', 140 - i * 20, 70, 0.2, 0.12, 0.001); hiss(t, 0.35, 2500, 0.5, 0.45, 'bandpass', 0.001, 400); tone(t, 'sine', 100, 40, 0.35, 0.5); },
      lock(t) { hiss(t, 0.03, 4000, 3, 0.4, 'bandpass', 0.001); tone(t + 0.02, 'triangle', 2640, 2640, 0.3, 0.12); tone(t, 'sine', 160, 80, 0.15, 0.3); },
      ultimate(t) {
        hiss(t, 0.1, 9000, 0.6, 0.6, 'highpass', 0.001);
        tone(t, 'sine', 70, 20, 2.2, 1, 0.003); tone(t, 'sawtooth', 160, 30, 1.2, 0.2, 0.003);
        hiss(t, 2.4, 2400, 0.5, 0.7, 'lowpass', 0.003, 50); hiss(t + 0.05, 0.5, 5000, 0.6, 0.3, 'bandpass', 0.01, 600);
      },
    };
    return { S, setOut: (node, name) => { const g = c.createGain(); g.gain.value = LEVEL[name] || 1; g.connect(node); out = g; } };
  }

  function create(o = {}) {
    let k = null, kc = null;
    const last = {};
    function play(name, arg) {
      if (o.on && !o.on()) return;
      const t0 = performance.now();
      if (GAP[name] && t0 - (last[name] || 0) < GAP[name]) return;
      last[name] = t0;
      try {
        const c = o.ctx(), out = o.out();
        if (!c || !out) return;
        if (window.SfxBank && SfxBank.play(c, out, name, c.currentTime + 0.005, arg)) return;
        if (!k || kc !== c) { k = kit(c); kc = c; }
        if (!k.S[name]) return;
        k.setOut(out, name);
        k.S[name](c.currentTime + 0.005, arg);
      } catch (e) {}
    }
    return { play };
  }

  // renders one sound through a compressor like the boss's effects bus, for tests
  async function render(name, arg, secs = 3) {
    const sr = 44100, c = new OfflineAudioContext(1, sr * secs, sr);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(c.destination);
    const kk = kit(c);
    kk.setOut(comp, name);
    kk.S[name](0.01, arg);
    const buf = await c.startRendering();
    return buf.getChannelData(0);
  }
  return { create, render, LEVEL, NAMES: () => Object.keys(kit(new OfflineAudioContext(1, 1, 44100)).S) };
})();
