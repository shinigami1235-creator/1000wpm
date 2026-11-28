// Sounds for the duel's choreography (28 Nov 2026): the dash slash, the uppercut, the spin, the slam,
// the dive, the pass, the volley, a shot batted back, a ricochet, two shots meeting, a graze, a
// fizzled spell, the knockbacks and the heavy crit. Made in code with Web Audio like arena-audio.js,
// on the duel's own context (ArenaAudio.ctx), through one compressor so stacked hits never clip.
// It follows the site's sound switch (TT.soundOn and the 'wpm-sound' event).
//
//   const s = DuelSfx.create(arenaAudio, { vol })   arenaAudio: the duel's ArenaAudio (its ctx is shared)
//   s.play(name, k)      k 0..1 scales it (power, or how near); pan -1..1 as the third argument
//   s.loop(name, k, pan) a held sound ('beamCrackle') -> { set(k, x), stop() }; x (0..1) moves its pitch
//   DuelSfx.renderSeq(events, loops, secs)   a whole scene offline, for peak checks
//   DuelSfx.NAMES        every sound
//   DuelSfx.render(name, k, secs)   Float32 samples through the same chain, for peak checks in tests
window.DuelSfx = (() => {
  // levels set from offline renders (DuelSfx.render): hits peak about 0.25 to 0.45, small moves about 0.1 to 0.2
  const LEVEL = { slash: 0.75, uppercut: 0.7, spin: 2.0, slam: 0.95, dive: 1.6, pass: 1.6, volley: 2.6, clang: 1.0, ricochet: 1.8, fizzleShield: 2.4,
    clash: 0.9, graze: 2.4, sputter: 1.6, dodge: 2.4, thump: 0.9, launch: 0.85, counter: 1.4, pull: 0.7, crit: 0.95, rise: 1.2,
    beamCharge: 0.9, beamFire: 0.85, beamRelease: 0.85, heart: 1.3, beamRiser: 0.8, beamCrackle: 0.55 };
  const GAP = { volley: 40, dodge: 60, thump: 50, graze: 60 };

  function kit(c, out) {
    const nb = {};
    function noise(len) {
      const k = Math.ceil(len * 10) / 10;
      if (!nb[k]) { const b = c.createBuffer(1, Math.ceil(c.sampleRate * k), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; nb[k] = b; }
      const s = c.createBufferSource(); s.buffer = nb[k]; return s;
    }
    const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
    function tone(dest, t, type, f0, f1, len, vol, a = 0.004) {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len); o.connect(g).connect(dest); o.start(t); o.stop(t + a + len + 0.05);
    }
    function hiss(dest, t, len, f0, q, vol, type = 'bandpass', a = 0.003, f1) {
      const n = noise(len + a + 0.05), f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len); n.connect(f).connect(g).connect(dest); n.start(t); n.stop(t + a + len + 0.06);
    }
    // a metal ring: a few inharmonic partials that decay at their own rates
    function ring(dest, t, f, len, vol) { for (const [m, k] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) tone(dest, t, 'sine', f * m, f * m * 0.995, len / (0.6 + m * 0.2), vol * k, 0.002); }
    const S = {
      // a blade of air cut fast, then the ring of the edge
      slash(d, t, k) { hiss(d, t, 0.16, 1800, 1.4, 0.5 * k, 'bandpass', 0.02, 6500); hiss(d, t + 0.1, 0.08, 5200, 3, 0.35 * k); ring(d, t + 0.11, 1320, 0.35, 0.12 * k); tone(d, t + 0.1, 'triangle', 220, 90, 0.12, 0.35 * k); },
      // a low rush rising, the hit at the top
      uppercut(d, t, k) { hiss(d, t, 0.22, 400, 1.2, 0.35 * k, 'bandpass', 0.05, 2400); tone(d, t + 0.18, 'sine', 70, 140, 0.1, 0.7 * k); tone(d, t + 0.2, 'triangle', 600, 180, 0.12, 0.25 * k); hiss(d, t + 0.2, 0.1, 2600, 1, 0.3 * k); },
      // a whirr that winds up
      spin(d, t, k) { for (let i = 0; i < 6; i++) hiss(d, t + i * 0.055, 0.05, 900 + i * 260, 4, (0.15 + i * 0.04) * k); tone(d, t, 'sawtooth', 160, 420, 0.32, 0.06 * k, 0.02); },
      // the slam: a heavy body landing, the floor cracking, debris
      slam(d, t, k) { tone(d, t, 'sine', 120, 32, 0.45, 1.0 * k); hiss(d, t, 0.35, 300, 0.7, 0.6 * k, 'lowpass', 0.003, 120); hiss(d, t + 0.02, 0.18, 2400, 0.8, 0.3 * k); for (let i = 0; i < 5; i++) hiss(d, t + 0.08 + i * 0.05 + Math.random() * 0.03, 0.04, 3000 + Math.random() * 2000, 6, 0.12 * k); },
      // a falling whistle that ends in a hit
      dive(d, t, k) { tone(d, t, 'sine', 1400, 380, 0.32, 0.18 * k, 0.03); hiss(d, t, 0.3, 1500, 2, 0.25 * k, 'bandpass', 0.05, 500); },
      // passing close by: a doppler rush
      pass(d, t, k) { hiss(d, t, 0.18, 700, 1.5, 0.4 * k, 'bandpass', 0.08, 2600); hiss(d, t + 0.18, 0.28, 2600, 1.5, 0.3 * k, 'bandpass', 0.005, 600); },
      // one shot of a volley: a short zap
      volley(d, t, k) { tone(d, t, 'square', 1600, 520, 0.06, 0.12 * k, 0.002); hiss(d, t, 0.04, 4200, 2, 0.15 * k); },
      // a shot batted back off a shield: a bright clang and the shield's hum
      clang(d, t, k) { ring(d, t, 880, 0.6, 0.32 * k); hiss(d, t, 0.05, 3800, 1.2, 0.5 * k); tone(d, t, 'sine', 180, 120, 0.25, 0.35 * k); },
      // a shot ringing off something and flying back
      ricochet(d, t, k) { tone(d, t, 'sine', 2600, 900, 0.22, 0.25 * k, 0.002); tone(d, t + 0.01, 'triangle', 3300, 1500, 0.15, 0.1 * k); hiss(d, t, 0.03, 5000, 2, 0.3 * k); },
      // a returned shot dying on the shield: a crackle and a fade
      fizzleShield(d, t, k) { for (let i = 0; i < 7; i++) hiss(d, t + i * 0.03 + Math.random() * 0.02, 0.03, 2000 + Math.random() * 3000, 5, 0.18 * k * (1 - i / 9)); tone(d, t, 'sine', 520, 260, 0.25, 0.15 * k); },
      // two shots meeting in the middle: a hard crack and a boom that rolls
      clash(d, t, k) { hiss(d, t, 0.06, 3000, 0.7, 0.8 * k); tone(d, t, 'sine', 90, 38, 0.6, 0.9 * k); hiss(d, t + 0.01, 0.6, 600, 0.6, 0.4 * k, 'lowpass', 0.01, 150); ring(d, t, 660, 0.5, 0.12 * k); },
      // a shot clipping the edge: a scrape
      graze(d, t, k) { hiss(d, t, 0.14, 2600, 3, 0.4 * k, 'bandpass', 0.003, 1200); tone(d, t, 'sawtooth', 300, 160, 0.08, 0.08 * k); },
      // a spell that broke: a sputter of a failing charge, then a puff
      sputter(d, t, k) { for (let i = 0; i < 6; i++) tone(d, t + i * 0.045, 'square', 420 - i * 40, 260 - i * 25, 0.03, 0.08 * k); hiss(d, t + 0.28, 0.3, 900, 0.8, 0.3 * k, 'lowpass', 0.01, 300); },
      // a quick dodge: a short body whoosh
      dodge(d, t, k) { hiss(d, t, 0.16, 900, 1.6, 0.4 * k, 'bandpass', 0.02, 2200); },
      // a body knocked back
      thump(d, t, k) { tone(d, t, 'sine', 110, 45, 0.2, 0.8 * k); hiss(d, t, 0.08, 900, 0.8, 0.35 * k, 'lowpass'); },
      // knocked up into the air: the hit and a rising rush
      launch(d, t, k) { tone(d, t, 'sine', 95, 40, 0.3, 0.9 * k); hiss(d, t + 0.04, 0.4, 500, 1.2, 0.3 * k, 'bandpass', 0.05, 2200); },
      // the counter's sting: a short rising stab
      counter(d, t, k) { tone(d, t, 'sawtooth', 330, 660, 0.12, 0.12 * k, 0.01); tone(d, t + 0.06, 'sine', 990, 1320, 0.14, 0.12 * k); },
      // pulled in by the black hole: a suction rising
      pull(d, t, k) { hiss(d, t, 0.6, 200, 1.4, 0.35 * k, 'bandpass', 0.3, 1200); tone(d, t, 'sine', 60, 110, 0.6, 0.25 * k, 0.3); },
      // the heavy crit: a deep boom under a bright crack and a long ring
      crit(d, t, k) { tone(d, t, 'sine', 70, 28, 0.8, 1.0 * k); hiss(d, t, 0.05, 4000, 0.6, 0.8 * k); hiss(d, t + 0.02, 0.7, 500, 0.6, 0.35 * k, 'lowpass', 0.01, 120); ring(d, t + 0.01, 520, 0.9, 0.16 * k); },
      // rising to cast
      rise(d, t, k) { tone(d, t, 'sine', 180, 520, 0.5, 0.15 * k, 0.15); hiss(d, t, 0.5, 600, 2, 0.15 * k, 'bandpass', 0.2, 2400); },
      // the beam struggle (28 Nov 2026). Charging: a riser that swells over about 1.3 s, a detuned saw pair
      // climbing under a hiss that opens up, ending in a tight whine
      beamCharge(d, t, k) {
        const L = 1.25 * Math.max(0.4, k);
        for (const det of [1, 1.012]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90 * det, t); o.frequency.exponentialRampToValueAtTime(420 * det, t + L);
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + L); f.Q.value = 4;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + L * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + L + 0.12);
          o.connect(f).connect(g).connect(d); o.start(t); o.stop(t + L + 0.2); }
        hiss(d, t, L, 500, 1.5, 0.18, 'bandpass', L * 0.8, 4000);
        tone(d, t + L * 0.55, 'sine', 900, 2400, L * 0.45, 0.05, L * 0.4);
      },
      // the beams leave: a punch and a tearing hiss
      beamFire(d, t, k) { tone(d, t, 'sine', 140, 48, 0.4, 0.8 * k); hiss(d, t, 0.35, 1800, 0.7, 0.5 * k, 'bandpass', 0.004, 600); hiss(d, t, 0.06, 5000, 1, 0.4 * k); },
      // the break: the biggest sound in the duel, a crack, a deep boom with a long tail and a rush
      beamRelease(d, t, k) { hiss(d, t, 0.07, 3600, 0.5, 0.9 * k); tone(d, t, 'sine', 80, 26, 1.1, 1.0 * k); tone(d, t, 'triangle', 160, 50, 0.5, 0.35 * k);
        hiss(d, t + 0.02, 1.2, 700, 0.6, 0.45 * k, 'lowpass', 0.01, 90); hiss(d, t + 0.05, 0.5, 1200, 1.2, 0.3 * k, 'bandpass', 0.06, 4200); ring(d, t, 330, 1.2, 0.1 * k); },
      // a heartbeat under the struggle: lub-dub
      heart(d, t, k) { tone(d, t, 'sine', 62, 40, 0.16, 0.9 * k, 0.006); tone(d, t + 0.17, 'sine', 55, 36, 0.2, 0.65 * k, 0.006); },
      // a slow sub riser under the whole struggle
      beamRiser(d, t, k) { const L = 2.3 * Math.max(0.3, k); tone(d, t, 'sine', 45, 110, L, 0.4, L * 0.9); tone(d, t, 'triangle', 90, 220, L, 0.08, L * 0.9); },
    };
    // the collision's crackle: a loop whose pitch follows the collision point. set(k, x): k loudness 0..1, x 0..1
    S.loop = {
      beamCrackle(d) {
        const len = 2, b = c.createBuffer(1, c.sampleRate * len, c.sampleRate), D = b.getChannelData(0);
        // sparse pops of different sizes over a bed of fizz
        for (let i = 0; i < D.length; i++) D[i] = (Math.random() * 2 - 1) * 0.12;
        for (let n = 0; n < 420; n++) { const at = Math.floor(Math.random() * (D.length - 600)), L = 20 + Math.floor(Math.random() * 300), a = 0.3 + Math.random() * 0.7; for (let j = 0; j < L; j++) D[at + j] += (Math.random() * 2 - 1) * a * Math.exp(-j / (L / 4)); }
        const src = c.createBufferSource(); src.buffer = b; src.loop = true;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
        const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 110;
        const hl = c.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 700; hl.Q.value = 6;
        const hg = c.createGain(); hg.gain.value = 0.18;
        const g = c.createGain(), t = c.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
        src.connect(bp).connect(g); hum.connect(hl).connect(hg).connect(g); g.connect(d);
        src.start(t); hum.start(t);
        return {
          set(k, x) { const n = c.currentTime, p = 0.75 + x * 0.6; src.playbackRate.setTargetAtTime(p, n, 0.05); bp.frequency.setTargetAtTime(1200 + x * 1600, n, 0.05); hum.frequency.setTargetAtTime(80 + x * 90, n, 0.05); g.gain.setTargetAtTime(0.3 + 0.4 * Math.min(1, k), n, 0.08); },
          stop() { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0.0001, n, 0.04); src.stop(n + 0.3); hum.stop(n + 0.3); },
        };
      },
    };
    return S;
  }

  function chain(c) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    const g = c.createGain(); g.gain.value = 0.9; comp.connect(g);
    return { inp: comp, out: g };
  }

  function create(arena, o = {}) {
    let on = true; try { on = TT.soundOn(); } catch (e) {}
    const onSound = e => { on = !!(e.detail && e.detail.on); };
    addEventListener('wpm-sound', onSound);
    let c = null, S = null, ch = null;
    const last = {};
    function play(name, k = 1, pan = 0) {
      if (!on || (o.on && !o.on())) return;
      const n = performance.now();
      if (GAP[name] && n - (last[name] || 0) < GAP[name]) return;
      last[name] = n;
      try {
        const cx = arena && arena.ctx ? arena.ctx() : null;
        if (!cx) return;
        if (cx !== c) { c = cx; ch = chain(c); ch.out.connect(c.destination); S = kit(c, ch.inp); }
        if (!S[name]) return;
        const g = c.createGain(); g.gain.value = (LEVEL[name] || 0.5) * (o.vol == null ? 1 : o.vol);
        let dest = g;
        if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(ch.inp); } else g.connect(ch.inp);
        S[name](dest, c.currentTime + 0.005, Math.max(0.1, Math.min(1.4, k)));
      } catch (e) {}
    }
    // a held sound (the beam's crackle): returns { set(k, x), stop() }, or a stub when sound is off
    function loop(name, k = 1, pan = 0) {
      const stub = { set() {}, stop() {} };
      if (!on || (o.on && !o.on())) return stub;
      try {
        const cx = arena && arena.ctx ? arena.ctx() : null;
        if (!cx) return stub;
        if (cx !== c) { c = cx; ch = chain(c); ch.out.connect(c.destination); S = kit(c, ch.inp); }
        if (!S.loop[name]) return stub;
        const g = c.createGain(); g.gain.value = (LEVEL[name] || 0.5) * k * (o.vol == null ? 1 : o.vol);
        if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(ch.inp); } else g.connect(ch.inp);
        const h = S.loop[name](g);
        let done = false;
        return { set: (k2, x) => { if (!done) try { h.set(k2, x); } catch (e) {} }, stop: () => { if (!done) { done = true; try { h.stop(); } catch (e) {} } } };
      } catch (e) { return stub; }
    }
    return { play, loop, dispose() { removeEventListener('wpm-sound', onSound); if (ch) { try { ch.out.disconnect(); } catch (e) {} } ch = null; c = null; } };
  }
  async function render(name, k = 1, secs = 1.5) {
    const sr = 44100, c = new OfflineAudioContext(1, sr * secs, sr), ch = chain(c); ch.out.connect(c.destination);
    const S = kit(c, ch.inp), g = c.createGain(); g.gain.value = LEVEL[name] || 0.5; g.connect(ch.inp);
    S[name](g, 0.01, k);
    return (await c.startRendering()).getChannelData(0);
  }
  // a whole scene through the chain, for peak checks: events [[name, at, k, pan]], loops [[name, at, stop, [[t, k, x], ...]]]
  async function renderSeq(events, loops = [], secs = 6) {
    const sr = 44100, c = new OfflineAudioContext(2, sr * secs, sr), ch = chain(c); ch.out.connect(c.destination);
    const S = kit(c, ch.inp);
    for (const [name, at, k = 1, pan = 0] of events) { const g = c.createGain(); g.gain.value = LEVEL[name] || 0.5; const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(ch.inp); S[name](g, at, k); }
    // loops start at 0 in an offline context, so each is rendered from its own suspend point
    for (const [name, at, stop, keys = []] of loops) {
      c.suspend(at).then(() => {
        const g = c.createGain(); g.gain.value = LEVEL[name] || 0.5; g.connect(ch.inp);
        const h = S.loop[name](g);
        for (const [kt, k, x] of keys) c.suspend(kt).then(() => { h.set(k, x); c.resume(); });
        c.suspend(stop).then(() => { h.stop(); c.resume(); });
        c.resume();
      });
    }
    const buf = await c.startRendering();
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }
  return { create, render, renderSeq, LEVEL, NAMES: Object.keys(LEVEL).filter(n => n !== 'beamCrackle') };
})();
