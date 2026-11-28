// Orb sounds (28 Nov 2026): each orb style (js/app/bot-fighter.js, bought in the hangar) has its own
// charge, release and typo sound, made in code with Web Audio like the other banks. The charge is
// one quiet sound per key that climbs with the word; it is rate-limited and softens when keys come
// fast, so a 150 wpm typist hears a rising patter instead of a wall of noise.
//   core    a clean tone that climbs the scale; a clean sweep on release
//   pulse   a heartbeat thump per key; lub-dub and a monitor beep on release; a flatline on a typo
//   nebula  a soft shimmer; an airy swell on release
//   ember   a crackle; a fire whoosh on release; a sizzle on a typo
//   frost   a glassy tick; a chime and a shatter on release; a crack on a typo
//   prism   a crystal chime up a major scale; a rising arpeggio on release
//   void    a low suction; a deep pop on release; a warble down on a typo
// It follows the site's sound switch (TT.soundOn). Levels were set from offline renders: a release
// peaks near 0.25, a typo near 0.12 and a key near 0.05 before the voice's volume, through one
// compressor per context.
//
//   const v = OrbAudio.voice({ ctx, vol, pan, on })   ctx(): an AudioContext (else its own), vol 0..1, on(): false to mute
//   v.key(style, frac)        a correct key, frac = share of the word typed
//   v.release(style, power)   the word is done (power 0..1: the combo tier)
//   v.fizzle(style)           a typo
//   OrbAudio.render(style, ev, arg, secs)   Float32 samples through the same chain, for peak checks
window.OrbAudio = (() => {
  const STYLES = ['core', 'pulse', 'nebula', 'ember', 'frost', 'prism', 'void'];
  const KEY_GAP = 0.07, FAST = 0.16;   // seconds: no two keys closer than KEY_GAP; closer than FAST plays softer
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // a major pentatonic, so a climbing word never sounds wrong
  const note = (base, frac) => base * Math.pow(2, SCALE[Math.min(SCALE.length - 1, Math.floor(Math.max(0, Math.min(1, frac)) * 8))] / 12);

  let own = null;
  const buses = new WeakMap(), noiseBuf = new WeakMap();
  function bus(c) {
    let b = buses.get(c);
    if (!b) {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      const g = c.createGain(); g.gain.value = 1.2;
      comp.connect(g).connect(c.destination);
      b = comp; buses.set(c, b);
    }
    return b;
  }
  function noise(c) {
    let b = noiseBuf.get(c);
    if (!b) { b = c.createBuffer(1, Math.ceil(c.sampleRate * 1), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseBuf.set(c, b); }
    return b;
  }
  function kit(c, d) {
    // gains start silent: at the default 1 the first sample of a source that starts on the same frame leaks through as a click
    const env = (g, t, a, peak, dec) => { g.gain.value = 0.0001; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
    const tone = (t, type, f0, f1, len, vol, a = 0.003) => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len); o.connect(g).connect(d); o.start(t); o.stop(t + a + len + 0.05); return o;
    };
    // a held tone with a flat top (the flatline)
    const hold = (t, f, len, vol) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
      o.connect(g).connect(d); o.start(t); o.stop(t + len + 0.12);
    };
    const hiss = (t, len, f0, q, vol, type = 'bandpass', a = 0.002, f1) => {
      const n = c.createBufferSource(); n.buffer = noise(c); const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      // the start value too: a jump from the 350 Hz default just as the noise starts makes a one-sample click
      f.frequency.value = f0; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len); n.connect(f).connect(g).connect(d); n.start(t, Math.random() * 0.8); n.stop(t + a + len + 0.05);
    };
    // a bell: a sine and its inharmonic partial
    const bell = (t, f, len, vol) => { tone(t, 'sine', f, f, len, vol, 0.002); tone(t, 'sine', f * 2.76, f * 2.76, len * 0.4, vol * 0.25, 0.002); };
    return { tone, hold, hiss, bell };
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // each style: key(K, t, frac, k), release(K, t, p), fizzle(K, t); k and p scale the level
  const BANK = {
    core: {
      key(K, t, f, k) { const n = note(660, f); K.tone(t, 'sine', n, n, 0.07, 0.05 * k, 0.003); K.tone(t, 'triangle', n * 2, n * 2, 0.03, 0.008 * k, 0.002); },
      release(K, t, p) { K.tone(t, 'sine', 520, 1560 + 300 * p, 0.16, 0.16, 0.004); K.tone(t, 'triangle', 1040, 2400, 0.1, 0.03, 0.003); K.hiss(t, 0.14, 1600, 0.8, 0.06, 'bandpass', 0.01, 4200); },
      fizzle(K, t) { K.tone(t, 'sine', 700, 330, 0.16, 0.08, 0.003); K.tone(t, 'sine', 742, 350, 0.16, 0.05, 0.003); },
    },
    pulse: {
      // a soft thump that rises a little with the word (the heart speeds up as it fills)
      key(K, t, f, k) { K.tone(t, 'sine', 70 + 40 * f, 44, 0.09, 0.13 * k, 0.004); K.hiss(t, 0.03, 260, 0.9, 0.025 * k, 'lowpass'); },
      release(K, t, p) {
        K.tone(t, 'sine', 95, 45, 0.12, 0.26, 0.003); K.tone(t + 0.13, 'sine', 80, 40, 0.14, 0.2, 0.003);   // lub-dub
        K.tone(t + 0.02, 'sine', 1000, 1000, 0.07, 0.05 + 0.02 * p, 0.002);                              // the monitor's beep
      },
      fizzle(K, t) { K.hold(t, 1000, 0.42, 0.045); K.tone(t, 'sine', 60, 38, 0.1, 0.09, 0.004); },
    },
    nebula: {
      key(K, t, f, k) { const n = note(1320, f) * rnd(0.995, 1.005); K.tone(t, 'sine', n, n * 1.01, 0.22, 0.022 * k, 0.03); K.tone(t, 'sine', n * 1.5, n * 1.5, 0.16, 0.01 * k, 0.04); K.hiss(t, 0.12, 6500, 1.2, 0.012 * k, 'bandpass', 0.03); },
      release(K, t, p) {
        K.hiss(t, 0.35, 900, 1.1, 0.12, 'bandpass', 0.06, 5200);
        [1046.5, 1318.5, 1568, 2093].forEach((n, i) => K.tone(t + 0.03 + i * 0.035, 'sine', n, n * 1.006, 0.4, 0.03 + 0.008 * p, 0.03));
      },
      fizzle(K, t) { K.tone(t, 'sine', 1400, 820, 0.28, 0.035, 0.02); K.tone(t, 'sine', 1470, 780, 0.28, 0.025, 0.02); K.hiss(t, 0.2, 3000, 0.8, 0.03, 'bandpass', 0.02, 900); },
    },
    ember: {
      // two or three tiny pops, like a log settling
      key(K, t, f, k) { const n = 2 + (Math.random() < 0.4 ? 1 : 0); for (let i = 0; i < n; i++) K.hiss(t + i * rnd(0.012, 0.03), 0.008, rnd(1800, 4200), 2.5, rnd(0.05, 0.09) * k, 'bandpass', 0.001); K.hiss(t, 0.05, 500 + 400 * f, 0.7, 0.02 * k, 'lowpass', 0.004); },
      release(K, t, p) {
        K.hiss(t, 0.3, 300, 0.8, 0.22, 'bandpass', 0.04, 2400);   // the whoosh
        K.hiss(t, 0.22, 140, 0.7, 0.12, 'lowpass', 0.02, 90);
        for (let i = 0; i < 5 + 2 * p; i++) K.hiss(t + 0.05 + Math.random() * 0.25, 0.008, rnd(1800, 4500), 2.5, rnd(0.05, 0.1), 'bandpass', 0.001);
      },
      fizzle(K, t) { K.hiss(t, 0.36, 5200, 0.7, 0.08, 'highpass', 0.004, 2600); K.hiss(t, 0.02, 900, 1, 0.06, 'bandpass', 0.001); },
    },
    frost: {
      // a glassy tick, higher as the word fills
      key(K, t, f, k) { const n = 2800 + 1600 * f + rnd(-80, 80); K.tone(t, 'sine', n, n, 0.035, 0.035 * k, 0.001); K.tone(t, 'sine', n * 1.83, n * 1.83, 0.02, 0.012 * k, 0.001); },
      release(K, t, p) {
        K.bell(t, 2093, 0.4, 0.06);
        K.hiss(t + 0.02, 0.18, 5000, 0.9, 0.14, 'highpass', 0.002, 3000);   // the shatter
        for (let i = 0; i < 9 + 3 * p; i++) { const n = rnd(2600, 6800); K.tone(t + 0.02 + Math.random() * 0.2, 'sine', n, n * 0.97, 0.03, rnd(0.02, 0.045), 0.001); }
      },
      fizzle(K, t) { K.hiss(t, 0.05, 2200, 1.5, 0.12, 'bandpass', 0.001, 1200); K.tone(t, 'triangle', 420, 260, 0.06, 0.05, 0.001); },
    },
    prism: {
      key(K, t, f, k) { K.bell(t, note(1046.5, f), 0.24, 0.035 * k); },
      release(K, t, p) {
        [1046.5, 1318.5, 1568, 2093, 2637].forEach((n, i) => K.bell(t + i * 0.03, n, 0.5, 0.045));
        K.hiss(t + 0.08, 0.3, 7000, 0.7, 0.025 + 0.01 * p, 'highpass', 0.05);
      },
      fizzle(K, t) { K.bell(t, 1046.5, 0.18, 0.05); K.bell(t + 0.04, 1480, 0.18, 0.04); K.tone(t + 0.05, 'sine', 1480, 900, 0.14, 0.03, 0.004); },
    },
    void: {
      // air drawn in: a short swell of low noise sliding down, a sub breath under it
      key(K, t, f, k) { K.hiss(t, 0.09, 900 - 300 * f, 1.3, 0.05 * k, 'bandpass', 0.05, 220); K.tone(t, 'sine', 120 - 30 * f, 70, 0.1, 0.06 * k, 0.04); },
      release(K, t, p) {
        K.hiss(t, 0.08, 1400, 1.2, 0.08, 'bandpass', 0.06, 200);   // the last pull in
        K.tone(t + 0.07, 'sine', 110, 32, 0.32, 0.3, 0.003);         // the pop
        K.tone(t + 0.07, 'triangle', 220, 60, 0.08, 0.06, 0.002);
        K.hiss(t + 0.07, 0.06, 400, 0.8, 0.08 + 0.02 * p, 'lowpass', 0.001);
      },
      fizzle(K, t) { const o = K.tone(t, 'sine', 160, 55, 0.3, 0.1, 0.005); o.detune.setValueAtTime(0, t); for (let i = 1; i < 6; i++) o.detune.setValueAtTime(i % 2 ? 60 : -60, t + i * 0.04); K.hiss(t, 0.1, 300, 1, 0.03, 'lowpass', 0.01); },
    },
  };

  // per style and event, set from offline renders so the styles sit level with each other: keys peak near
  // 0.05 (the low thumps 0.07, as they sound quieter), releases near 0.25, typos near 0.12, measured after
  // the compressor settles
  const LEVEL = {
    core: { key: 0.7, release: 1.06, fizzle: 0.73 }, pulse: { key: 0.45, release: 0.88, fizzle: 0.9 }, nebula: { key: 1.2, release: 2.4, fizzle: 1.5 },
    ember: { key: 2.3, release: 3.3, fizzle: 0.86 }, frost: { key: 0.85, release: 0.86, fizzle: 1.36 }, prism: { key: 0.87, release: 1.7, fizzle: 1.54 },
    void: { key: 0.75, release: 0.64, fizzle: 0.91 },
  };
  const lvl = (style, ev) => ((LEVEL[style] || LEVEL.core)[ev] || 1);

  function soundOn() { try { return TT.soundOn ? TT.soundOn() : localStorage.getItem('wpm-sound') !== 'off'; } catch (e) { return true; } }

  // one bot's orb: its own volume, pan and key limiter
  function voice(o = {}) {
    let lastKey = -9, lastRel = -9;
    function go(style, ev, arg) {
      if (!soundOn() || (o.on && !o.on())) return;
      const S = BANK[style] || BANK.core;
      try {
        let c = o.ctx ? o.ctx() : null;
        if (!c) { own ||= new (window.AudioContext || window.webkitAudioContext)(); c = own; }
        if (c.state === 'suspended') c.resume().catch(() => {});
        const now = c.currentTime;
        let k = 1;
        if (ev === 'key') {
          const since = now - lastKey;
          if (since < KEY_GAP || now - lastRel < 0.05) return;
          k = since < FAST ? 0.55 + 0.45 * (since - KEY_GAP) / (FAST - KEY_GAP) : 1;
          lastKey = now;
        } else if (ev === 'release') { if (now - lastRel < 0.06) return; lastRel = now; }
        const vol = c.createGain(); vol.gain.value = Math.max(0, Math.min(1, o.vol == null ? 1 : o.vol)) * lvl(style, ev);
        if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); vol.connect(p).connect(bus(c)); }
        else vol.connect(bus(c));
        const K = kit(c, vol), t = now + 0.005;
        if (ev === 'key') S.key(K, t, arg || 0, k);
        else if (ev === 'release') S.release(K, t, Math.max(0, Math.min(1, arg || 0)));
        else S.fizzle(K, t);
        setTimeout(() => { try { vol.disconnect(); } catch (e) {} }, 1400);
      } catch (e) {}
    }
    return {
      key: (style, frac) => go(style, 'key', frac),
      release: (style, power) => go(style, 'release', power),
      fizzle: style => go(style, 'fizzle'),
      set(v) { Object.assign(o, v); },
    };
  }

  // tests: one event (or a list of [time, ev, arg]) rendered offline through the same bus
  async function render(style, ev, arg, secs = 1.5, vol = 1) {
    const sr = 44100, c = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
    const S = BANK[style] || BANK.core, gs = {};
    // one gain per event kind, at its level, as voice() plays them
    for (const e of ['key', 'release', 'fizzle']) { gs[e] = c.createGain(); gs[e].gain.value = vol * lvl(style, e); gs[e].connect(bus(c)); }
    const Ks = { key: kit(c, gs.key), release: kit(c, gs.release), fizzle: kit(c, gs.fizzle) };
    // a single event starts at 0.5 s: Chrome's compressor holds the first few hundred ms down, which read 3x too quiet
    const list = Array.isArray(ev) ? ev : [[0.5, ev, arg]];
    let lastKey = -9;
    for (const [t, e, a] of list) {
      if (e === 'key') { const since = t - lastKey; if (since < KEY_GAP) continue; S.key(Ks.key, t, a || 0, since < FAST ? 0.55 + 0.45 * (since - KEY_GAP) / (FAST - KEY_GAP) : 1); lastKey = t; }
      else if (e === 'release') S.release(Ks.release, t, a || 0);
      else S.fizzle(Ks.fizzle, t);
    }
    const b = await c.startRendering();
    return [b.getChannelData(0), b.getChannelData(1)];
  }

  return { voice, render, STYLES };
})();
