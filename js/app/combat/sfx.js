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
    crack: 1.3, tick: 4, pulse: 3.28, slice: 1.5, ice: 2.0, zap: 1.4, blip: 3.6, boom: 0.5, sweep: 1.44, thrum: 0.32, crash: 1.0, lock: 2.18, ultimate: 0.34,
    'data-spike': 0.6, 'safe-mode': 0.64, 'binary-rain': 2.05, 'echo-pulse': 0.73, 'glitch-blade': 0.95, 'cryo-lock': 0.89, 'electro-storm': 2.06,
    'hyper-thread': 0.77, 'packet-storm': 4.4, 'neon-nova': 1.79, 'system-purge': 2.01, 'void-sphere': 0.24, 'kernel-panic': 3.52, 'root-access': 1.02,
    'quantum-split': 1.4, 'zero-day': 1.09, 'combo-shield': 0.9, frenzy: 0.45,
    'op-attack': 1.6, 'op-cover': 1.0, 'op-heal': 2.2, 'op-revive': 1.8, 'op-dodge': 4.0, 'op-hit': 1.0, 'op-down': 0.7, 'op-victory': 2.0,
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
    // a room for the spells to ring into: one impulse per context, a convolver per sound
    let ir = null;
    function wet(mix = 0.45, len = 1.6) {
      if (!ir) {
        const sr = c.sampleRate, n = Math.ceil(sr * len); ir = c.createBuffer(2, n, sr);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.8) * (i < sr * 0.01 ? i / (sr * 0.01) : 1); }
      }
      const cv = c.createConvolver(); cv.buffer = ir;
      const wg = c.createGain(); wg.gain.value = mix;
      const inp = c.createGain(); inp.connect(out); inp.connect(cv); cv.connect(wg).connect(out);
      return inp;
    }
    // a soft clip for the harsh ones
    function drive(k = 3) {
      const sh = c.createWaveShaper(), n = 512, cur = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cur[i] = Math.tanh(x * k) / Math.tanh(k); }
      sh.curve = cur; sh.connect(out); return sh;
    }
    // a chord of bells: each note rings with a faint detuned twin
    function chime(t, notes, len, vol, gap = 0.04, dest, type = 'triangle') {
      notes.forEach((f, i) => { tone(t + i * gap, type, f, f * 0.998, len, vol, 0.004, dest); tone(t + i * gap, 'sine', f * 2.003, f * 2, len * 0.6, vol * 0.3, 0.004, dest); });
    }
    // noise swept from f0 to f1 that swells into its end: the "something is coming" sound
    function riser(t, len, f0, f1, vol, dest) {
      const n = noise(len + 0.1), f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06);
      n.connect(f).connect(g).connect(dest || out); n.start(t); n.stop(t + len + 0.1);
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

      // ---- spell casts (28 Nov 2026): each one has a wind-up, a body and a tail that rings into a room ----
      'data-spike'(t) {
        const v = wet(0.5);
        riser(t, 0.3, 300, 3200, 0.32);
        hiss(t + 0.05, 0.25, 180, 0.8, 0.18, 'lowpass', 0.15, 90);
        tone(t + 0.3, 'sine', 95, 38, 0.32, 0.5, 0.003);
        chime(t + 0.3, [1397, 2093, 2794], 0.45, 0.08, 0.03, v);
        hiss(t + 0.3, 0.06, 6000, 1, 0.25, 'highpass', 0.001);
      },
      'safe-mode'(t) {
        const v = wet(0.55);
        tone(t, 'sine', 220, 880, 0.3, 0.16, 0.12, v); tone(t, 'triangle', 330, 1320, 0.3, 0.06, 0.15, v);
        riser(t, 0.28, 800, 7000, 0.12);
        tone(t + 0.3, 'sine', 180, 80, 0.2, 0.42, 0.002); hiss(t + 0.3, 0.05, 5000, 1, 0.22, 'highpass', 0.001);
        chime(t + 0.32, [1319, 1760, 2217, 2637], 0.7, 0.055, 0.035, v, 'sine');
      },
      'binary-rain'(t) {
        const v = wet(0.5);
        for (let i = 0; i < 14; i++) tone(t + i * 0.04, 'square', R(700, 1900), R(700, 1900), 0.025, 0.045, 0.002, v);
        [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.08 + i * 0.02, 'sine', f, f, 0.9, 0.07, 0.25, v));
        hiss(t, 0.7, 4000, 0.6, 0.06, 'bandpass', 0.2, 9000);
        chime(t + 0.55, [1568, 2093, 2637], 0.6, 0.05, 0.05, v, 'sine');
      },
      'echo-pulse'(t) {
        const e = echo(0.16, 0.5), v = wet(0.4);
        riser(t, 0.18, 1500, 5000, 0.12);
        tone(t + 0.12, 'sine', 990, 980, 0.25, 0.22, 0.002, e); tone(t + 0.12, 'sine', 495, 490, 0.3, 0.12, 0.002, e);
        tone(t + 0.12, 'sine', 150, 60, 0.2, 0.35, 0.002, v);
      },
      'glitch-blade'(t) {
        const v = wet(0.4);
        for (let i = 0; i < 7; i++) tone(t + i * 0.022, 'square', R(200, 2400), R(200, 2400), 0.02, 0.07);
        hiss(t + 0.1, 0.18, 900, 0.7, 0.32, 'bandpass', 0.08, 10000);
        tone(t + 0.2, 'triangle', 3300, 3150, 0.5, 0.06, 0.002, v); tone(t + 0.2, 'triangle', 4950, 4800, 0.35, 0.03, 0.002, v);
        tone(t + 0.2, 'sine', 110, 45, 0.25, 0.4, 0.002);
      },
      'cryo-lock'(t) {
        const v = wet(0.6);
        chime(t, [2093, 2637, 3136, 3951, 4699], 0.6, 0.05, 0.035, v, 'sine');
        hiss(t, 0.55, 7000, 3, 0.1, 'bandpass', 0.2, 2500);
        riser(t + 0.1, 0.45, 2000, 9000, 0.1);
        tone(t + 0.58, 'sine', 140, 50, 0.3, 0.45, 0.002);
        for (let i = 0; i < 5; i++) hiss(t + 0.58 + i * 0.02, 0.04, R(4000, 9000), 3, 0.16, 'bandpass', 0.001);
      },
      'electro-storm'(t) {
        const v = wet(0.5, 2);
        hiss(t, 1.3, 140, 0.8, 0.5, 'lowpass', 0.5, 80);
        tone(t, 'sawtooth', 55, 47, 1.2, 0.1, 0.45); tone(t, 'sawtooth', 55.6, 47.4, 1.2, 0.08, 0.45);
        for (let i = 0; i < 6; i++) hiss(t + 0.15 + i * 0.1 + R(0, 0.05), 0.03, R(3000, 8000), 2, 0.1 + i * 0.02, 'bandpass', 0.001, undefined, v);
        riser(t + 0.3, 0.45, 600, 6000, 0.14);
      },
      'hyper-thread'(t) {
        const v = wet(0.4);
        tone(t, 'sawtooth', 200, 1600, 0.5, 0.08, 0.4); tone(t, 'sawtooth', 203, 1620, 0.5, 0.08, 0.4);
        riser(t, 0.5, 500, 7000, 0.18);
        tone(t + 0.52, 'sine', 120, 45, 0.25, 0.5, 0.002);
        chime(t + 0.52, [1568, 2349, 3136], 0.4, 0.07, 0.015, v, 'square');
      },
      'packet-storm'(t) {
        const v = wet(0.4);
        for (let i = 0; i < 16; i++) tone(t + i * 0.04, 'square', R(900, 2400), R(900, 2400), 0.022, 0.045, 0.002, i % 3 ? out : v);
        riser(t, 0.6, 400, 4000, 0.12);
        hiss(t + 0.2, 0.6, 1800, 4, 0.08, 'bandpass', 0.2, 600);
      },
      'neon-nova'(t) {
        const v = wet(0.5);
        tone(t, 'sawtooth', 120, 960, 0.42, 0.1, 0.38); tone(t, 'sawtooth', 121, 972, 0.42, 0.08, 0.38);
        riser(t, 0.44, 250, 6000, 0.26);
        chime(t + 0.46, [988, 1319, 1976], 0.7, 0.05, 0.01, v, 'sine');
      },
      'system-purge'(t) {
        const v = wet(0.45);
        hiss(t, 0.9, 200, 1.6, 0.22, 'bandpass', 0.3, 8000);
        tone(t, 'triangle', 300, 1200, 0.9, 0.06, 0.3);
        for (let i = 0; i < 8; i++) tone(t + 0.1 + i * 0.075, 'square', 1760, 1760, 0.02, 0.04, 0.001, v);
        chime(t + 0.7, [880, 1319], 0.5, 0.07, 0.04, v, 'sine');
      },
      'void-sphere'(t) {
        tone(t, 'sine', 45, 90, 2.6, 0.5, 1.2); tone(t, 'sine', 46.5, 92, 2.6, 0.35, 1.2);
        tone(t, 'sawtooth', 90, 60, 2.4, 0.06, 1.4);
        hiss(t, 2.6, 300, 0.7, 0.2, 'lowpass', 1.6, 60);
        riser(t + 1.6, 1.2, 4000, 200, 0.12);
      },
      'kernel-panic'(t) {
        const v = wet(0.35);
        [880, 660, 440, 330].forEach((f, i) => tone(t + i * 0.08, 'square', f, f, 0.06, 0.09, 0.002, v));
        for (let i = 0; i < 6; i++) hiss(t + 0.3 + i * 0.025, 0.025, R(1000, 7000), 4, 0.14);
        tone(t + 0.3, 'sawtooth', 420, 55, 0.5, 0.1, 0.002);
      },
      'root-access'(t) {
        const v = wet(0.5);
        hiss(t, 0.02, 4500, 3, 0.3, 'bandpass', 0.001); hiss(t + 0.07, 0.02, 3800, 3, 0.3, 'bandpass', 0.001);
        tone(t + 0.1, 'square', 660, 660, 0.07, 0.08); tone(t + 0.2, 'square', 990, 990, 0.12, 0.08);
        riser(t + 0.1, 0.35, 1000, 6000, 0.1);
        tone(t + 0.45, 'sine', 160, 70, 0.2, 0.4, 0.002);
        chime(t + 0.45, [1976, 2637], 0.5, 0.06, 0.02, v);
      },
      'quantum-split'(t) {
        const v = wet(0.55);
        [880, 887, 1318, 1328].forEach((f, i) => tone(t + i * 0.03, 'sine', f, f * (i % 2 ? 0.97 : 1.03), 0.8, 0.065, 0.05, v));
        hiss(t, 0.8, 5000, 2, 0.06, 'bandpass', 0.3, 1500);
        tone(t + 0.05, 'triangle', 1760, 880, 0.35, 0.05, 0.002, v); tone(t + 0.05, 'triangle', 1760, 3520, 0.35, 0.04, 0.002, v);
      },
      'zero-day'(t) {
        tone(t, 'sawtooth', 41, 41, 1.9, 0.16, 0.6); tone(t, 'sawtooth', 41.6, 41.6, 1.9, 0.14, 0.6);
        [0, 0.4, 0.8, 1.2, 1.5, 1.7, 1.82, 1.9].forEach(w => tone(t + w, 'square', 1200 + w * 400, 1100 + w * 400, 0.07, 0.06));
        riser(t + 0.6, 1.35, 200, 7000, 0.28);
        hiss(t + 0.8, 1.1, 300, 0.7, 0.24, 'bandpass', 0.9, 6000);
      },
      // Gid's power-ups get their own: hex plates clicking into place, and a roar of heat
      'combo-shield'(t) {
        const v = wet(0.5);
        for (let i = 0; i < 6; i++) { tone(t + 0.1 + i * 0.045, 'triangle', 2600 + i * 120, 2400, 0.06, 0.06, 0.001, v); hiss(t + 0.1 + i * 0.045, 0.02, 6000, 2, 0.12, 'bandpass', 0.001); }
        riser(t, 0.12, 1200, 5000, 0.1);
        tone(t + 0.4, 'sine', 160, 90, 0.3, 0.38, 0.003);
        chime(t + 0.4, [1175, 1568, 2349], 0.7, 0.05, 0.02, v, 'sine');
      },
      frenzy(t) {
        const d = drive(4), v = wet(0.3);
        tone(t, 'sawtooth', 110, 440, 0.3, 0.12, 0.2, d); tone(t, 'sawtooth', 112, 448, 0.3, 0.1, 0.2, d);
        riser(t, 0.25, 300, 2500, 0.3);
        tone(t + 0.25, 'sine', 110, 38, 0.4, 0.6, 0.002);
        hiss(t + 0.25, 0.6, 500, 0.6, 0.3, 'lowpass', 0.01, 2400, v);
        tone(t + 0.25, 'sawtooth', 220, 180, 0.35, 0.08, 0.005, d);
      },

      // ---- operator actions (28 Nov 2026), played with Operator's onAct ----
      'op-attack'(t) { hiss(t, 0.04, 5000, 1, 0.3, 'highpass', 0.001); for (let i = 0; i < 4; i++) tone(t + i * 0.012, 'square', R(1800, 3200), 900, 0.02, 0.06, 0.001); tone(t, 'sine', 140, 60, 0.12, 0.35, 0.002); },
      'op-cover'(t) { const v = wet(0.35); tone(t, 'sine', 300, 600, 0.08, 0.12, 0.002, v); hiss(t + 0.06, 0.05, 3000, 2, 0.28, 'bandpass', 0.001); tone(t + 0.06, 'triangle', 1180, 1170, 0.4, 0.07, 0.002, v); tone(t + 0.06, 'sine', 160, 80, 0.15, 0.3, 0.002); },
      'op-heal'(t) { const v = wet(0.55); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.06, 'sine', f, f, 0.6, 0.06, 0.01, v)); hiss(t, 0.8, 5000, 0.8, 0.05, 'bandpass', 0.3, 9000); },
      'op-revive'(t) { const v = wet(0.6); riser(t, 0.6, 300, 4000, 0.14); tone(t + 0.3, 'sine', 196, 392, 0.8, 0.12, 0.3, v); chime(t + 0.6, [784, 988, 1175, 1568], 0.9, 0.05, 0.06, v, 'sine'); },
      'op-dodge'(t) { hiss(t, 0.2, 600, 0.8, 0.3, 'bandpass', 0.02, 4000); tone(t + 0.02, 'sine', 400, 220, 0.12, 0.08, 0.002); },
      'op-hit'(t) { tone(t, 'sine', 120, 45, 0.25, 0.5, 0.002); hiss(t, 0.12, 1800, 0.7, 0.32, 'lowpass', 0.001, 300); tone(t, 'square', 220, 110, 0.1, 0.05, 0.001); },
      'op-down'(t) { tone(t, 'sawtooth', 330, 70, 0.7, 0.07, 0.01); tone(t + 0.1, 'sine', 90, 40, 0.5, 0.35, 0.01); hiss(t + 0.35, 0.2, 800, 0.7, 0.18, 'lowpass', 0.01, 200); },
      'op-victory'(t) { const v = wet(0.5); [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, 'triangle', f, f, 0.35, 0.09, 0.005, v)); chime(t + 0.36, [1047, 1319, 1568], 0.8, 0.07, 0.01, v); },

      // ---- the sound each spell hit makes ----
      crack(t) { hiss(t, 0.08, 5000, 1, 0.35, 'highpass', 0.001); tone(t, 'triangle', 2600, 1300, 0.1, 0.1, 0.001); tone(t, 'sine', 140, 50, 0.2, 0.4); },
      tick(t) { tone(t, 'square', R(1200, 2600), 900, 0.025, 0.07, 0.001); },
      pulse(t) { const v = wet(0.35); tone(t, 'sine', 880, 860, 0.16, 0.18, 0.002, v); tone(t, 'sine', 1320, 1300, 0.1, 0.05, 0.002, v); tone(t, 'sine', 140, 80, 0.12, 0.2); },
      slice(t) { const v = wet(0.4); hiss(t, 0.28, 900, 0.8, 0.5, 'bandpass', 0.01, 10000); tone(t + 0.02, 'triangle', 3300, 3100, 0.45, 0.07, 0.004, v); tone(t, 'sine', 100, 40, 0.3, 0.5); hiss(t, 0.05, 7000, 1, 0.3, 'highpass', 0.001); },
      ice(t) { const v = wet(0.5); for (let i = 0; i < 8; i++) hiss(t + i * 0.022, 0.04, R(4000, 9000), 3, 0.18, 'bandpass', 0.001, undefined, v); tone(t, 'sine', 120, 50, 0.3, 0.4); chime(t + 0.02, [3136, 3951], 0.4, 0.04, 0.02, v, 'sine'); },
      zap(t) {
        hiss(t, 0.09, 6000, 0.6, 0.6, 'highpass', 0.001);
        for (let i = 0; i < 4; i++) tone(t + i * 0.018, 'sawtooth', R(1500, 4000), R(200, 900), 0.04, 0.08, 0.001);
        hiss(t + 0.05, 1.1, 180, 0.7, 0.42, 'lowpass', 0.05, 60);
      },
      blip(t) { tone(t, 'square', R(1400, 2200), R(500, 900), 0.04, 0.07, 0.001); tone(t, 'sine', 160, 90, 0.05, 0.12); },
      boom(t) { tone(t, 'sine', 90, 28, 0.9, 0.85, 0.003); hiss(t, 0.8, 1400, 0.6, 0.5, 'lowpass', 0.003, 100); hiss(t, 0.2, 8000, 0.8, 0.25, 'highpass'); },
      sweep(t) { const v = wet(0.4); hiss(t, 0.5, 400, 0.9, 0.35, 'bandpass', 0.05, 7000, v); tone(t, 'sine', 120, 50, 0.3, 0.35); chime(t + 0.05, [1760, 2637], 0.3, 0.05, 0.03, v, 'sine'); },
      thrum(t, power = 0) {
        if (power > 100) {
          // the collapse: a suck in, then the blast
          hiss(t, 0.25, 6000, 0.7, 0.3, 'bandpass', 0.2, 300);
          tone(t + 0.25, 'sine', 70, 22, 1.3, 1, 0.003); hiss(t + 0.25, 1.2, 2000, 0.5, 0.6, 'lowpass', 0.003, 70); hiss(t + 0.25, 0.25, 9000, 1, 0.25, 'highpass');
        } else { tone(t, 'sine', 70, 50, 0.22, 0.45, 0.01); hiss(t, 0.2, 260, 1, 0.12, 'lowpass'); }
      },
      crash(t) { for (let i = 0; i < 3; i++) tone(t + i * 0.03, 'square', 140 - i * 20, 70, 0.2, 0.12, 0.001); hiss(t, 0.35, 2500, 0.5, 0.45, 'bandpass', 0.001, 400); tone(t, 'sine', 100, 40, 0.35, 0.5); },
      lock(t) { const v = wet(0.45); hiss(t, 0.03, 4000, 3, 0.4, 'bandpass', 0.001); tone(t + 0.02, 'triangle', 2640, 2640, 0.3, 0.12, 0.004, v); tone(t + 0.06, 'triangle', 3960, 3960, 0.2, 0.05, 0.004, v); tone(t, 'sine', 160, 70, 0.2, 0.35); },
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
