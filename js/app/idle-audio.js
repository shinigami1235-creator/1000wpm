// IdleAudio: music for the quiet pages and the bots' voices in the hangar (Gid, 27 Nov 2026).
//   IdleAudio.music('hangar' | 'operator')   loops audio/<name>.mp3 quietly, fading in; follows the
//                                            sound switch (TT.soundOn, the 'wpm-sound' event) and
//                                            starts on the first key or click if the browser held it
//   IdleAudio.stop()                         fades the music out (call it when the page closes)
//   IdleAudio.bot(id, mood)                  a bot's little voice, made here with Web Audio: each of the
//                                            six bots has its own pitch and timbre, and the mood picks
//                                            the shape: hello, happy, pick, boop, ooh, giggle, sad,
//                                            angry, hurt, heart, sleep, whirr
// The music files are made by tools/music/idle.py.
window.IdleAudio = (() => {
  const VOL = 0.34, FADE = 1.2;
  let ac = null, out = null, el = null, src = null, gain = null, want = '', fadeT = 0;
  const on = () => (window.TT && TT.soundOn ? TT.soundOn() : true);

  function ctx() {
    if (ac) return ac;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    out = ac.createGain(); out.gain.value = 1; out.connect(ac.destination);
    return ac;
  }
  // the browser may hold audio until the page gets a key or a click
  function unlock() { const c = ctx(); if (c && c.state === 'suspended') c.resume(); if (el && want && on() && el.paused) el.play().catch(() => {}); }
  addEventListener('pointerdown', unlock, { passive: true });
  addEventListener('keydown', unlock, { passive: true });
  addEventListener('wpm-sound', e => { const v = !!(e.detail && e.detail.on); if (!el) return; if (v && want) { el.play().catch(() => {}); ramp(VOL); } else ramp(0); });

  function ramp(to, s = FADE) {
    if (!gain || !ac) { if (el) el.volume = Math.max(0, Math.min(1, to)); return; }
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(to, t + s);
  }
  function music(name) {
    if (want === name && el) { if (on()) { el.play().catch(() => {}); ramp(VOL); } return; }
    clearTimeout(fadeT);
    if (el) { el.pause(); el = null; }
    want = name;
    el = new Audio(`audio/${name}.mp3`);
    el.loop = true; el.preload = 'auto';
    const c = ctx();
    if (c) {
      try { src = c.createMediaElementSource(el); gain = c.createGain(); gain.gain.value = 0; src.connect(gain).connect(out); el.volume = 1; }
      catch (e) { src = gain = null; el.volume = 0; }
    }
    if (on()) { el.play().catch(() => {}); ramp(VOL); }
  }
  function stop() {
    want = '';
    const e = el; if (!e) return;
    ramp(0, 0.6);
    fadeT = setTimeout(() => { e.pause(); if (el === e) el = null; }, 650);
  }

  // ---------- the bots' voices ----------
  // base: a MIDI note, wave: the oscillator, wob: how much the pitch wobbles, fm: a little buzz
  const VOICE = {
    orbit: { base: 79, wave: 'sine', wob: 0.4, fm: 0 },        // round and calm
    pixel: { base: 84, wave: 'square', wob: 0.15, fm: 0 },     // 8-bit beeps
    nova: { base: 74, wave: 'sawtooth', wob: 0.25, fm: 30 },   // a bit rough
    kite: { base: 86, wave: 'triangle', wob: 0.55, fm: 0 },    // airy and wavy
    beep: { base: 88, wave: 'sine', wob: 0.3, fm: 0 },         // high and sweet
    raze: { base: 67, wave: 'square', wob: 0.2, fm: 60 },      // low and buzzy
  };
  // each mood: notes as [semitones from the bot's base, start s, length s, slide semitones]
  const MOOD = {
    hello: [[0, 0, 0.09, 5], [7, 0.11, 0.08, 0], [12, 0.21, 0.14, 2]],
    happy: [[0, 0, 0.07, 0], [4, 0.08, 0.07, 0], [7, 0.16, 0.07, 0], [12, 0.24, 0.16, 3]],
    pick: [[0, 0, 0.06, 7]],
    boop: [[5, 0, 0.1, -9]],
    ooh: [[0, 0, 0.32, 9]],
    giggle: [[9, 0, 0.05, 0], [7, 0.07, 0.05, 0], [9, 0.14, 0.05, 0], [7, 0.21, 0.05, 0], [12, 0.28, 0.1, 0]],
    sad: [[7, 0, 0.18, -2], [3, 0.2, 0.32, -5]],
    angry: [[-5, 0, 0.08, 0], [-7, 0.1, 0.18, -3]],
    hurt: [[10, 0, 0.12, -14]],
    heart: [[4, 0, 0.12, 0], [9, 0.14, 0.12, 0], [16, 0.28, 0.24, -1]],
    sleep: [[0, 0, 0.3, -12], [-5, 0.38, 0.5, -7]],
    whirr: [[-12, 0, 0.35, 12]],
  };
  let lastBot = 0;
  function bot(id, mood = 'boop') {
    if (!on()) return;
    const c = ctx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    const now = performance.now();
    if (now - lastBot < 70) return;   // a burst of clicks stays one sound
    lastBot = now;
    const V = VOICE[id] || VOICE.orbit, notes = MOOD[mood] || MOOD.boop;
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const t0 = c.currentTime + 0.01;
    const bus = c.createGain(); bus.gain.value = 0.13;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = V.wave === 'sine' ? 6000 : 3600;
    bus.connect(lp).connect(out);
    for (const [st, at, len, slide] of notes) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = V.wave;
      const f0 = hz(V.base + st), f1 = hz(V.base + st + slide);
      o.frequency.setValueAtTime(f0, t0 + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + at + len);
      // the wobble that makes it sound alive
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 14 + Math.random() * 6; lg.gain.value = f0 * 0.03 * V.wob;
      lfo.connect(lg).connect(o.frequency);
      if (V.fm) { const m = c.createOscillator(), mg = c.createGain(); m.frequency.value = V.fm; mg.gain.value = f0 * 0.08; m.connect(mg).connect(o.frequency); m.start(t0 + at); m.stop(t0 + at + len + 0.05); }
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(1, t0 + at + 0.012);
      g.gain.setValueAtTime(1, t0 + at + len * 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + at + len + 0.04);
      o.connect(g).connect(bus);
      o.start(t0 + at); o.stop(t0 + at + len + 0.06);
      lfo.start(t0 + at); lfo.stop(t0 + at + len + 0.06);
    }
  }
  return { music, stop, bot, unlock, state: () => ({ want, playing: !!(el && !el.paused), ctx: ac && ac.state }) };
})();
