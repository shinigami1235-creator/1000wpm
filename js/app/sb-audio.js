// Superboss sound, mixed for a stream. Music beds come from audio/*.mp3 (one per phase for each
// boss, wb-enrage when the timer runs out, wb-win at the end). Every sound effect and stinger is
// made in code with Web Audio, with small pitch variants on the ones that repeat.
//
// Buses:  music bed -> duck -> music (slider) -\
//         sound effects -> sfx (slider) -> comp --> master -> limiter -> out (0.7) -> speakers
//         stingers and alerts -> stinger -----------/
// The duck lowers the music under stingers, alerts and big spells, and under the streamer's
// voice when he turns on "Duck music under my mic" (the mic is measured, never played).
//   SuperAudio.bed(bossId, phase)   SuperAudio.enrage()   SuperAudio.victory()   SuperAudio.defeat()
//   SuperAudio.play(name, arg)      SuperAudio.duck(level, secs)   SuperAudio.mic(stream | null)
//   SuperAudio.setVol({ music, sfx }) and .vol()     SuperAudio.setOn(on)   SuperAudio.stop()
//   SuperAudio.combat()  -> { ac, bus } for Combat.Audio
//   SuperAudio.render(name, arg, secs), SuperAudio.renderMix(track, secs) -> peak checks for tests
window.SuperAudio = (() => {
  const LOOPS = { stage1: [0, 61.935], stage2: [0, 60], stage3: [0, 58.182], stage4: [0, 56.471], stage5: [0, 54.857], boss: [0, 51.892] };
  const WB = [0.5, 32 * 4 * 60 / 140];
  // each boss's own theme, one loop per phase (tools/music/superboss.py), and the World Boss enrage: loop plus its first second again
  [['hydra', 32, 140], ['compiler', 32, 132], ['leviathan', 48, 174]].forEach(([b, bars, bpm]) => [1, 2, 3].forEach(p => { LOOPS[`sb-${b}-${p}`] = [0.5, bars * 240 / bpm]; }));
  LOOPS['wb-enrage'] = [0.5, 32 * 240 / 150];
  const loopOf = n => LOOPS[n] || WB;
  const MUSIC_BASE = 0.34, STING = 0.8, OUT = 0.7;
  const LEVEL = {
    hit: 4, crit: 1.6, sever: 0.8, regrow: 1.2, windup: 0.9, bite: 1.5, mend: 1.4, block: 1.4, hurt: 1.5, shielded: 1.6,
    compile: 1.2, fix: 2.4, order: 6, weakOpen: 2.6, weak: 1.3, decoy: 3.2, packet: 6, packetHit: 4.5, typo: 9, neck: 0.9,
    count: 9, support: 1.8, chaos: 2.2, hype: 0.8, phase: 0.75, enrage: 1.1, finish: 0.7, win: 0.8, lose: 0.75,
    snap: 2.2, roar: 1.0, slam: 1.0, splash: 1.1, boom: 0.9, assemble: 1.6, launch: 1.4, thunder: 0.9, dive: 1.2, plates: 1.6, spit: 1.6, pop: 1.6,
    pickup: 1.4, whoosh: 1.2, powerup: 1.0, ally: 2.2,
    windupSlam: 1.0, windupLaser: 1.2, windupBreach: 1.2, counter: 1.4, key: 8,
    boot: 1.2, stackPush: 3.4, stackThrow: 1.5, stackCrash: 2.8, servo: 2.4, relay: 2.6, zap: 1.3, panic: 1.4, shatter: 1.4, collapse: 1.0,
    levCharge: 0.9, levStrike: 1.2, levCrunch: 1.3, levClang: 1.2, levBurst: 1.0, levSweep: 1.1, levRoar: 0.9, levDie: 0.9, levSurface: 1.0,
  };
  const STINGERS = new Set(['support', 'chaos', 'hype', 'phase', 'enrage', 'finish', 'win', 'lose', 'count']);
  let ac = null, master, limiter, outG, musicBus, duckG, sfxBus, stingBus;
  let on = true, want = null, cur = null, token = 0, live = null;
  let vol = { music: 0.8, sfx: 0.9 };
  try { vol = { ...vol, ...JSON.parse(localStorage.getItem('wpm-sb-mix') || '{}') }; } catch (e) {}
  const buffers = {}, loading = {};
  const url = n => (window.BREACH_BASE || '') + `audio/${n}.mp3`;

  function chain(c, dest) {
    const m = c.createGain(); m.gain.value = 1;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -9; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.15;
    const o = c.createGain(); o.gain.value = OUT;
    m.connect(lim).connect(o).connect(dest);
    const sfx = c.createGain(); sfx.gain.value = vol.sfx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    sfx.connect(comp).connect(m);
    const st = c.createGain(); st.gain.value = vol.sfx * STING; st.connect(m);
    const duck = c.createGain(); duck.gain.value = 1;
    const mus = c.createGain(); mus.gain.value = MUSIC_BASE * vol.music;
    duck.connect(mus).connect(m);
    return { m, lim, o, sfx, st, duck, mus };
  }
  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const g = chain(ac, ac.destination);
      master = g.m; limiter = g.lim; outG = g.o; sfxBus = g.sfx; stingBus = g.st; duckG = g.duck; musicBus = g.mus;
    }
    if (ac.state === 'suspended' && on) ac.resume().catch(() => {});
    return ac;
  }
  function unlock() { if (!on) return; try { ctx(); if (want && !cur) start(want); } catch (e) {} }

  // ---------- music ----------
  function load(name, c = null) {
    if (!c && buffers[name]) return Promise.resolve(buffers[name]);
    const key = c ? name + ':off' : name;
    loading[key] ||= fetch(url(name)).then(r => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
      .then(b => (c || ctx()).decodeAudioData(b)).then(buf => { if (!c) buffers[name] = buf; return buf; })
      .catch(e => { delete loading[key]; throw e; });
    return loading[key];
  }
  function track(name) {
    want = name;
    if (!on) return;
    start(name);
  }
  function bed(bossId, phase) { const b = SuperData.boss(bossId); track(b.music[Math.max(0, Math.min(2, phase - 1))]); }
  async function start(name) {
    if (cur && cur.name === name) return;
    const my = ++token;
    try {
      ctx();
      const buf = await load(name);
      if (my !== token || !on || want !== name) return;
      const [a, len] = loopOf(name);
      const t = ac.currentTime + 0.05;
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = true; src.loopStart = a; src.loopEnd = Math.min(buf.duration, a + len);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 1.2);
      src.connect(g).connect(duckG);
      src.start(t, a);
      if (cur) fade(cur, 1.2);
      cur = { src, g, name };
    } catch (e) {}
  }
  function fade(x, s) {
    try {
      const t = ac.currentTime;
      x.g.gain.cancelScheduledValues(t);
      x.g.gain.setValueAtTime(Math.max(0.0001, x.g.gain.value), t);
      x.g.gain.exponentialRampToValueAtTime(0.0001, t + s);
      x.src.stop(t + s + 0.05);
    } catch (e) {}
  }
  function stopMusic(s = 0.5) { token++; if (cur && ac) fade(cur, s); cur = null; }
  function enrage() { track('wb-enrage'); }
  async function victory() {
    want = null; stopMusic(0.6); play('win');
    if (!on) return;
    try { const buf = await load('wb-win'); if (!on) return; const src = ac.createBufferSource(); src.buffer = buf; const g = ac.createGain(); g.gain.value = 1; src.connect(g).connect(duckG); src.start(ac.currentTime + 0.7); } catch (e) {}
  }
  function defeat() { want = null; stopMusic(1.2); play('lose'); }

  // ---------- ducking ----------
  let evDuck = 1, evUntil = 0, voiceDuck = 1, micTimer = 0, micNode = null;
  function applyDuck() {
    if (!ac) return;
    const k = Math.min(evDuck, voiceDuck);
    const t = ac.currentTime;
    duckG.gain.cancelScheduledValues(t);
    duckG.gain.setValueAtTime(duckG.gain.value, t);
    duckG.gain.linearRampToValueAtTime(k, t + (k < duckG.gain.value ? 0.06 : 0.35));
  }
  function duck(level, secs) {
    if (!ac) return;
    evDuck = Math.min(level, performance.now() < evUntil ? evDuck : 1);
    evUntil = Math.max(evUntil, performance.now() + secs * 1000);
    applyDuck();
    setTimeout(() => { if (performance.now() >= evUntil - 5) { evDuck = 1; applyDuck(); } }, secs * 1000);
  }
  // the streamer's mic: measured to lower the music while he talks; it is never sent to the speakers
  function mic(stream) {
    clearInterval(micTimer); micTimer = 0;
    if (micNode) { try { micNode.disconnect(); } catch (e) {} micNode = null; }
    voiceDuck = 1; applyDuck();
    if (!stream || !stream.getAudioTracks().length) return false;
    ctx();
    micNode = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser(); an.fftSize = 1024;
    micNode.connect(an);
    const buf = new Float32Array(an.fftSize);
    let hold = 0;
    micTimer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const db = 10 * Math.log10(s / buf.length + 1e-12);
      const talking = db > -42;
      if (talking) hold = 6;          // keep the duck for 300 ms after the last loud frame
      const k = talking || hold-- > 0 ? 0.5 : 1;
      if (k !== voiceDuck) { voiceDuck = k; applyDuck(); }
    }, 50);
    return true;
  }

  // ---------- sound effects ----------
  // Each voice takes a context, an output node and a start time, so the same code plays live and
  // renders offline for the peak check.
  function kit(c) {
    let out = null;
    const nbuf = {};
    const vary = () => 1 + (Math.random() - 0.5) * 0.08;
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
    function tone(t, type, f0, f1, len, v, a = 0.004) {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + len);
      const g = c.createGain(); env(g, t, a, v, len);
      o.connect(g).connect(out); o.start(t); o.stop(t + a + len + 0.05);
    }
    function hiss(t, len, f, q, v, type = 'bandpass', a = 0.003, f1) {
      const n = noise(len + a + 0.05);
      const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
      fl.frequency.setValueAtTime(f, t);
      if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + len);
      const g = c.createGain(); env(g, t, a, v, len);
      n.connect(fl).connect(g).connect(out); n.start(t); n.stop(t + a + len + 0.05);
    }
    const chord = (t, notes, type, len, v, gap = 0) => notes.forEach((f, i) => tone(t + i * gap, type, f, f, len, v));
    const S = n => Math.pow(2, n / 12);
    const voices = {
      // a word that hit; pitch climbs with the combo tier
      hit(t, tier = 0) { const k = vary() * S(Math.min(4, tier) * 2); tone(t, 'square', 640 * k, 300 * k, 0.06, 0.12); tone(t, 'sine', 170, 70, 0.09, 0.3); hiss(t, 0.05, 3600 * k, 1.4, 0.18); },
      crit(t) { tone(t, 'sawtooth', 990 * vary(), 240, 0.16, 0.16); tone(t, 'sine', 120, 42, 0.26, 0.5); hiss(t, 0.2, 2600, 0.7, 0.3, 'bandpass', 0.002, 700); tone(t + 0.03, 'triangle', 1980, 1900, 0.3, 0.1); },
      sever(t) { hiss(t, 0.35, 5000, 0.8, 0.5, 'highpass', 0.002, 1200); tone(t, 'sawtooth', 300, 60, 0.4, 0.3); tone(t, 'sine', 90, 30, 0.6, 0.6); [1800, 1300, 900].forEach((f, i) => tone(t + 0.05 + i * 0.05, 'square', f, f * 0.6, 0.08, 0.08)); },
      regrow(t) { tone(t, 'sawtooth', 80, 240, 0.7, 0.18, 0.2); hiss(t, 0.7, 400, 2, 0.2, 'bandpass', 0.25, 2400); [0, 0.12, 0.24].forEach(w => tone(t + 0.3 + w, 'square', 300 + w * 900, 320 + w * 900, 0.05, 0.06)); },
      windup(t, ms = 1500) { const len = Math.min(2.5, ms / 1000); tone(t, 'sawtooth', 90, 220, len, 0.12, len * 0.7); tone(t, 'sawtooth', 93, 226, len, 0.1, len * 0.7); hiss(t, len, 300, 0.7, 0.12, 'lowpass', len * 0.7, 2400); tone(t, 'square', 1100, 1100, 0.06, 0.1); tone(t + 0.12, 'square', 1100, 1100, 0.06, 0.1); },
      bite(t) { hiss(t, 0.12, 1800, 1, 0.45, 'bandpass', 0.001, 500); tone(t, 'square', 420, 90, 0.12, 0.2); tone(t + 0.07, 'square', 380, 80, 0.1, 0.18); },
      mend(t) { chord(t, [523, 659, 784, 1046], 'triangle', 0.35, 0.09, 0.07); hiss(t, 0.6, 3000, 2, 0.08, 'bandpass', 0.2, 6000); },
      block(t) { tone(t, 'triangle', 700 * vary(), 1400, 0.1, 0.3); tone(t + 0.07, 'triangle', 1400, 2100, 0.2, 0.22); hiss(t, 0.14, 5000, 1.2, 0.25); },
      hurt(t) { tone(t, 'sawtooth', 180, 45, 0.45, 0.4); hiss(t, 0.4, 420, 0.6, 0.55, 'lowpass'); tone(t + 0.04, 'square', 240, 200, 0.2, 0.08); },
      shielded(t) { tone(t, 'sine', 1800, 1800, 0.4, 0.2); tone(t, 'triangle', 2700, 2600, 0.3, 0.12); hiss(t, 0.1, 6000, 2, 0.2, 'highpass'); tone(t, 'sine', 110, 70, 0.2, 0.3); },
      compile(t) { [0, 0.09, 0.18].forEach(w => tone(t + w, 'square', 160, 150, 0.07, 0.18)); hiss(t, 0.3, 900, 1, 0.25, 'lowpass'); tone(t, 'sine', 70, 40, 0.4, 0.4); },
      fix(t, order = 1) { const k = vary(); tone(t, 'square', 880 * k, 880 * k, 0.05, 0.12); tone(t + 0.05, 'square', (order ? 1320 : 990) * k, (order ? 1320 : 990) * k, 0.1, 0.12); hiss(t, 0.06, 4000, 1.5, 0.12); },
      order(t) { tone(t, 'square', 466, 440, 0.12, 0.14); tone(t, 'square', 494, 470, 0.12, 0.12); },
      weakOpen(t) { tone(t, 'sine', 2200, 2200, 0.08, 0.14); tone(t + 0.06, 'sine', 2940, 2940, 0.12, 0.1); },
      weak(t) { tone(t, 'triangle', 1320, 1320, 0.3, 0.2); tone(t, 'triangle', 1980, 1980, 0.4, 0.14, 0.01); tone(t, 'sine', 110, 45, 0.3, 0.55); hiss(t, 0.12, 6000, 1.5, 0.25); },
      decoy(t) { tone(t, 'sawtooth', 220, 210, 0.3, 0.2); tone(t, 'sawtooth', 233, 222, 0.3, 0.18); hiss(t, 0.2, 600, 1, 0.2, 'lowpass'); },
      packet(t) { tone(t, 'square', 600 * vary(), 2600, 0.12, 0.13); hiss(t, 0.15, 3000, 1, 0.2, 'bandpass', 0.002, 7000); },
      packetHit(t) { tone(t, 'sawtooth', 260, 80, 0.2, 0.22); hiss(t, 0.15, 900, 0.8, 0.25, 'lowpass'); },
      typo(t) { tone(t, 'square', 150, 140, 0.06, 0.08); },
      neck(t) { tone(t, 'sine', 60, 40, 0.8, 0.6); hiss(t, 0.8, 300, 0.7, 0.3, 'lowpass', 0.01, 120); chord(t + 0.05, [196, 247, 294], 'sawtooth', 0.6, 0.05); },
      // the bosses' own moves (sb-hydra.js, sb-compiler.js, sb-leviathan.js)
      snap(t) { hiss(t, 0.06, 2600, 1.2, 0.5, 'bandpass', 0.001); tone(t, 'sine', 160, 50, 0.18, 0.6); tone(t + 0.01, 'square', 900, 300, 0.04, 0.12); },
      roar(t) { const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 1.6);
        lfo.frequency.value = 23; lg.gain.value = 0.5; lfo.connect(lg).connect(g.gain);
        f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + 1.6);
        env(g, t, 0.15, 0.32, 1.5); o.connect(f).connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + 1.8); lfo.stop(t + 1.8);
        hiss(t, 1.5, 700, 0.8, 0.3, 'bandpass', 0.2, 180); tone(t, 'sine', 55, 35, 1.4, 0.4, 0.1); },
      slam(t) { tone(t, 'sine', 70, 24, 0.9, 0.9); hiss(t, 1.4, 1800, 0.5, 0.6, 'lowpass', 0.005, 200); hiss(t + 0.05, 0.6, 3500, 0.8, 0.25, 'bandpass', 0.01, 900); tone(t, 'square', 110, 40, 0.25, 0.15); },
      splash(t) { hiss(t, 0.7, 2400, 0.7, 0.45, 'bandpass', 0.005, 700); tone(t, 'sine', 120, 45, 0.3, 0.35); for (let i = 0; i < 5; i++) tone(t + 0.1 + i * 0.07 + Math.random() * 0.04, 'sine', 600 + Math.random() * 900, 300, 0.05, 0.05); },
      boom(t) { tone(t, 'sine', 60, 22, 2.0, 1.0); hiss(t, 2.0, 1200, 0.5, 0.7, 'lowpass', 0.004, 60); hiss(t, 0.3, 5000, 0.6, 0.3, 'highpass'); for (let i = 0; i < 8; i++) hiss(t + 0.2 + Math.random() * 1.2, 0.05, 3000 + Math.random() * 3000, 2, 0.12); },
      assemble(t) { for (let i = 0; i < 8; i++) tone(t + i * 0.055, 'square', 300 * Math.pow(1.12, i), 320 * Math.pow(1.12, i), 0.04, 0.06); hiss(t, 0.5, 1500, 2, 0.1, 'bandpass', 0.3, 6000); },
      launch(t) { for (const w of [0, 0.18]) { hiss(t + w, 0.4, 800, 1, 0.3, 'bandpass', 0.05, 5000); tone(t + w, 'sawtooth', 200, 900, 0.3, 0.08, 0.02); } },
      thunder(t) { hiss(t, 0.15, 4000, 0.4, 0.35, 'highpass', 0.002); hiss(t + 0.05, 2.4, 500, 0.4, 0.55, 'lowpass', 0.3, 70); tone(t + 0.1, 'sine', 45, 28, 2, 0.4, 0.3); },
      dive(t) { hiss(t, 0.8, 3000, 0.8, 0.35, 'bandpass', 0.05, 300); for (let i = 0; i < 6; i++) tone(t + 0.3 + i * 0.09, 'sine', 400 + Math.random() * 500, 900, 0.06, 0.05); },
      plates(t) { tone(t, 'square', 220, 200, 0.08, 0.12); tone(t + 0.06, 'square', 180, 160, 0.08, 0.12); tone(t, 'triangle', 2600, 2500, 0.5, 0.06); hiss(t, 0.1, 5000, 2, 0.15, 'bandpass'); },
      spit(t) { tone(t, 'sine', 320, 70, 0.2, 0.4); hiss(t, 0.15, 1500, 1, 0.3, 'bandpass', 0.002, 400); tone(t + 0.02, 'square', 900, 2400, 0.12, 0.06); },
      pop(t) { hiss(t, 0.18, 1600, 0.8, 0.35, 'lowpass'); tone(t, 'sine', 140, 50, 0.22, 0.4); tone(t, 'square', 1200 * vary(), 400, 0.05, 0.08); },
      windupSlam(t, ms = 2500) { const len = Math.min(3, ms / 1000) * 0.5; tone(t, 'sawtooth', 38, 85, len, 0.2, len * 0.9); hiss(t, len, 200, 0.7, 0.3, 'lowpass', len * 0.9, 1200); tone(t, 'square', 880, 880, 0.08, 0.08); tone(t + 0.14, 'square', 880, 880, 0.08, 0.08); },
      windupLaser(t, ms = 2000) { const len = Math.min(2.6, ms / 1000); const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1900, t + len); lfo.frequency.setValueAtTime(6, t); lfo.frequency.linearRampToValueAtTime(30, t + len); lg.gain.value = 0.4; lfo.connect(lg).connect(g.gain); env(g, t, len * 0.8, 0.12, len * 0.25); o.connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + len * 1.1); lfo.stop(t + len * 1.1); tone(t, 'square', 1100, 1100, 0.06, 0.08); },
      windupBreach(t, ms = 2400) { const len = Math.min(3, ms / 1000); hiss(t, len, 300, 0.6, 0.25, 'lowpass', len * 0.8, 900); for (let i = 0; i < 16; i++) { const w = len * 0.3 + Math.random() * len * 0.7; tone(t + w, 'sine', 200 + Math.random() * 400, 600 + Math.random() * 500, 0.05, 0.06); } },
      counter(t) { tone(t, 'triangle', 600, 1800, 0.12, 0.25); tone(t + 0.08, 'sine', 90, 40, 0.4, 0.5); hiss(t, 0.3, 4000, 0.8, 0.25, 'bandpass', 0.002, 1200); },
      // the Compiler's moves (sb-compiler.js): power on, a block pushed onto a column, the throw and its crash,
      // arm servos, the pointer screens locking on, the laser, a kernel panic, shattering parts and the collapse
      boot(t) { tone(t, 'sine', 50, 140, 1.0, 0.35, 0.3); hiss(t, 1.2, 300, 0.6, 0.18, 'bandpass', 0.6, 2400); chord(t + 1.05, [523, 784, 1046], 'triangle', 0.5, 0.07, 0.05); tone(t + 0.35, 'square', 1200, 1200, 0.04, 0.05); },
      stackPush(t, i = 0) { const f = 330 * Math.pow(1.06, i); tone(t, 'square', f, f * 1.02, 0.05, 0.06); tone(t, 'sine', 90, 60, 0.08, 0.18); },
      stackThrow(t) { hiss(t, 0.35, 700, 0.9, 0.35, 'bandpass', 0.02, 3800); tone(t, 'sawtooth', 160, 420, 0.18, 0.1, 0.02); tone(t, 'sine', 80, 40, 0.3, 0.35); },
      stackCrash(t, hit = 1) { hiss(t, 0.25, hit ? 900 : 3200, 0.7, 0.4, hit ? 'lowpass' : 'bandpass'); tone(t, 'square', hit ? 180 : 900, hit ? 70 : 600, 0.08, 0.12); for (let i = 0; i < 3; i++) tone(t + 0.03 + i * 0.04, 'triangle', 1400 + Math.random() * 1600, 900, 0.04, 0.05); },
      servo(t, len = 0.4) { tone(t, 'sawtooth', 140, 260, len, 0.05, len * 0.4); tone(t, 'sawtooth', 143, 265, len, 0.04, len * 0.4); hiss(t, len, 900, 2, 0.05, 'bandpass', len * 0.3); },
      relay(t) { tone(t, 'sine', 1760, 1760, 0.12, 0.12); tone(t + 0.04, 'sine', 2640, 2640, 0.16, 0.08); tone(t, 'square', 3520, 3400, 0.03, 0.04); },
      zap(t) { tone(t, 'sawtooth', 2600, 180, 0.35, 0.2); hiss(t, 0.4, 6000, 0.6, 0.3, 'highpass', 0.002); tone(t, 'sine', 110, 40, 0.35, 0.5); tone(t + 0.02, 'square', 880, 220, 0.2, 0.08); },
      panic(t) { for (let i = 0; i < 9; i++) tone(t + i * 0.07, 'square', 900 - i * 80 + Math.random() * 120, 300, 0.05, 0.07); hiss(t, 0.7, 2000, 3, 0.18, 'bandpass', 0.01, 300); tone(t + 0.6, 'sine', 160, 50, 0.4, 0.3); },
      shatter(t) { hiss(t, 0.3, 7000, 0.5, 0.35, 'highpass', 0.001); for (let i = 0; i < 6; i++) tone(t + Math.random() * 0.15, 'sine', 2500 + Math.random() * 3500, 2000, 0.06, 0.05); tone(t, 'sine', 140, 60, 0.15, 0.25); },
      collapse(t) { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(32, t + 2.2); f.type = 'lowpass'; f.frequency.value = 500; env(g, t, 0.3, 0.22, 2); o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 2.4); hiss(t + 0.2, 2.2, 600, 0.5, 0.4, 'lowpass', 0.3, 80); for (let i = 0; i < 5; i++) tone(t + 0.3 + i * 0.35 + Math.random() * 0.1, 'triangle', 500 + Math.random() * 400, 200, 0.12, 0.1); },
      // the Leviathan (sb-leviathan.js): a throat growl winding up the lunge, the strike, the bite, the
      // barrier ringing, the breach erupting, the tail sweep, its roar, its death and breaking the surface
      levCharge(t, ms = 1800) { const len = Math.min(2.6, ms / 1000); const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = o2.type = 'sawtooth'; o.frequency.setValueAtTime(52, t); o.frequency.exponentialRampToValueAtTime(96, t + len); o2.frequency.setValueAtTime(53.5, t); o2.frequency.exponentialRampToValueAtTime(99, t + len);
        f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(1100, t + len);
        lfo.frequency.setValueAtTime(7, t); lfo.frequency.linearRampToValueAtTime(15, t + len); lg.gain.value = 0.4; lfo.connect(lg).connect(g.gain);
        env(g, t, len * 0.85, 0.22, len * 0.2); o.connect(f); o2.connect(f); f.connect(g).connect(out); [o, o2, lfo].forEach(x => { x.start(t); x.stop(t + len * 1.1); });
        tone(t, 'sine', 220, 520, len, 0.05, len * 0.9); },
      levStrike(t) { hiss(t, 0.2, 500, 0.9, 0.45, 'bandpass', 0.06, 3200); tone(t + 0.12, 'sine', 110, 40, 0.25, 0.5); tone(t + 0.13, 'square', 700, 200, 0.05, 0.1); },
      levCrunch(t) { for (let i = 0; i < 4; i++) hiss(t + i * 0.035, 0.05, 2500 + i * 700, 1.5, 0.35, 'bandpass', 0.001); tone(t, 'square', 210, 55, 0.18, 0.22); tone(t, 'sine', 95, 35, 0.35, 0.6); hiss(t, 0.4, 700, 0.6, 0.3, 'lowpass', 0.002, 200); },
      levClang(t) { const k = vary(); tone(t, 'triangle', 330 * k, 320 * k, 0.55, 0.16); tone(t, 'triangle', 497 * k, 480 * k, 0.45, 0.1); tone(t, 'sine', 1240 * k, 1200 * k, 0.3, 0.06); hiss(t, 0.15, 4200, 0.8, 0.3, 'bandpass', 0.001, 1500); tone(t, 'sine', 85, 38, 0.35, 0.55); },
      levBurst(t) { tone(t, 'sine', 62, 24, 1.2, 0.85); hiss(t, 1.6, 1600, 0.5, 0.6, 'lowpass', 0.01, 150); hiss(t + 0.02, 0.9, 2600, 0.7, 0.35, 'bandpass', 0.02, 700); for (let i = 0; i < 10; i++) tone(t + 0.3 + Math.random() * 1.1, 'sine', 380 + Math.random() * 700, 900 + Math.random() * 400, 0.05, 0.045); },
      levSweep(t) { hiss(t, 0.55, 300, 0.8, 0.45, 'bandpass', 0.18, 2600); hiss(t + 0.25, 0.4, 2600, 0.8, 0.25, 'bandpass', 0.01, 400); tone(t + 0.18, 'sine', 140, 45, 0.35, 0.4); },
      levRoar(t) { const f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(950, t + 0.7); f.frequency.exponentialRampToValueAtTime(300, t + 2.1);
        env(g, t, 0.25, 0.4, 1.9); f.connect(g).connect(out);
        for (const [a2, b2] of [[74, 50], [75.5, 51], [111, 76]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(a2, t); o.frequency.exponentialRampToValueAtTime(b2, t + 2.1); o.connect(f); o.start(t); o.stop(t + 2.3); }
        tone(t, 'sine', 48, 30, 2.0, 0.45, 0.2); hiss(t, 1.8, 900, 0.6, 0.22, 'lowpass', 0.3, 200); },
      levDie(t) { const f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(160, t + 2.6); env(g, t, 0.2, 0.35, 2.6); f.connect(g).connect(out);
        for (const [a2, b2] of [[96, 28], [98, 29]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(a2, t); o.frequency.exponentialRampToValueAtTime(b2, t + 2.8); o.connect(f); o.start(t); o.stop(t + 3); }
        for (let i = 0; i < 14; i++) tone(t + 1.4 + Math.random() * 2, 'sine', 200 + Math.random() * 500, 500 + Math.random() * 500, 0.06, 0.04); },
      levSurface(t) { hiss(t, 0.7, 250, 0.7, 0.3, 'lowpass', 0.25, 1400); tone(t, 'sine', 90, 60, 0.6, 0.15, 0.2); },
      key(t, k = 0) { const f = 520 * Math.pow(2, Math.min(24, k) / 12); tone(t, 'triangle', f, f, 0.05, 0.08); },
      count(t, go) { tone(t, 'square', go ? 1320 : 880, go ? 1320 : 880, go ? 0.35 : 0.12, 0.14); if (go) tone(t, 'sine', 110, 55, 0.4, 0.4); },
      // stingers and alerts, on their own bus so they cut through the music
      support(t) { chord(t, [784, 988, 1175, 1568], 'triangle', 0.3, 0.13, 0.06); hiss(t, 0.4, 7000, 1, 0.08, 'highpass'); },
      // the bots (sb-bots.js): Art's bot grabbing a dropped item, a weave past an attack, a combo power-up, an ally's shot
      pickup(t) { tone(t, 'sine', 660, 1320, 0.12, 0.22); tone(t + 0.07, 'triangle', 990, 1980, 0.18, 0.16); chord(t + 0.1, [1319, 1568, 1976], 'sine', 0.35, 0.05, 0.05); hiss(t, 0.25, 6000, 1, 0.06, 'highpass'); },
      whoosh(t, k = 1) { hiss(t, 0.28, 900, 0.9, 0.22 * k, 'bandpass', 0.02, 2600); tone(t, 'sine', 240, 120, 0.22, 0.05 * k); },
      powerup(t, k = 1) { const f = 220 * Math.pow(2, k / 4); tone(t, 'sawtooth', f, f * 2, 0.5, 0.06); tone(t, 'sine', f * 2, f * 4, 0.55, 0.08); hiss(t + 0.1, 0.5, 3500, 1.4, 0.06, 'bandpass', 0.2, 7000); },
      ally(t) { tone(t, 'square', 1250 * vary(), 620, 0.06, 0.05); hiss(t, 0.05, 4200, 2, 0.05); },
      chaos(t) { [0, 0.08, 0.16].forEach((w, i) => tone(t + w, 'sawtooth', 700 - i * 160, 300 - i * 70, 0.12, 0.12)); hiss(t, 0.35, 1200, 3, 0.15, 'bandpass', 0.01, 300); },
      hype(t) { hiss(t, 1.4, 900, 0.5, 0.25, 'bandpass', 0.6, 3000); chord(t + 0.6, [523, 659, 784, 1046, 1318], 'sawtooth', 0.9, 0.05, 0.05); tone(t + 0.6, 'sine', 130, 65, 0.6, 0.45); },
      phase(t) { tone(t, 'sine', 55, 30, 1.4, 0.8); hiss(t, 1.1, 180, 0.8, 0.5, 'lowpass', 0.01, 60); chord(t + 0.02, [110, 165, 220], 'sawtooth', 1.1, 0.07); hiss(t + 0.02, 0.4, 5000, 0.7, 0.18, 'highpass'); },
      enrage(t) { [0, 0.3, 0.6, 0.9].forEach((w, i) => tone(t + w, 'square', i % 2 ? 622 : 830, i % 2 ? 622 : 830, 0.24, 0.12)); tone(t, 'sawtooth', 70, 35, 1.4, 0.3, 0.1); },
      finish(t) { hiss(t, 1.6, 400, 0.6, 0.3, 'bandpass', 1.4, 6000); tone(t, 'sawtooth', 110, 880, 1.6, 0.12, 1.4); tone(t + 1.6, 'sine', 80, 40, 0.5, 0.5); },
      win(t) { tone(t, 'sine', 70, 28, 1.6, 0.8); hiss(t, 1.2, 1400, 0.5, 0.5, 'lowpass', 0.01, 80); chord(t + 0.15, [392, 494, 587, 784, 988], 'triangle', 1.2, 0.09, 0.07); },
      lose(t) { [523, 466, 392, 311].forEach((f, i) => tone(t + i * 0.22, 'triangle', f, f * 0.97, 0.3, 0.14)); tone(t + 0.88, 'sine', 90, 30, 1, 0.5); },
    };
    return { set: (node, name) => { const g = c.createGain(); g.gain.value = LEVEL[name] || 1; g.connect(node); out = g; }, voices };
  }
  const GAP = { ally: 90, whoosh: 120, hit: 28, typo: 40, packetHit: 60, block: 60, stackPush: 40, stackCrash: 70, shatter: 80 };
  const lastAt = {};
  function play(name, arg) {
    if (!on) return;
    const n = performance.now();
    if (GAP[name] && n - (lastAt[name] || 0) < GAP[name]) return;
    lastAt[name] = n;
    try {
      ctx();
      live ||= kit(ac);
      if (!live.voices[name]) return;
      const st = STINGERS.has(name);
      if (st && name !== 'count') duck(name === 'support' || name === 'chaos' ? 0.6 : 0.4, name === 'hype' || name === 'win' ? 2.4 : 1.4);
      live.set(st ? stingBus : sfxBus, name);
      live.voices[name](ac.currentTime + 0.005, arg);
    } catch (e) {}
  }

  // ---------- levels ----------
  function setVol(v) {
    vol = { ...vol, ...v };
    try { localStorage.setItem('wpm-sb-mix', JSON.stringify(vol)); } catch (e) {}
    if (!ac) return;
    const t = ac.currentTime;
    musicBus.gain.setTargetAtTime(MUSIC_BASE * vol.music, t, 0.05);
    sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.05);
    stingBus.gain.setTargetAtTime(vol.sfx * STING, t, 0.05);
  }
  function setOn(v) {
    on = v;
    if (!v) { stopMusic(0.3); if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
    else { try { ctx(); } catch (e) {} if (want) start(want); }
  }
  function stop() { want = null; stopMusic(0.3); mic(null); }

  // ---------- offline renders, for the peak check ----------
  async function render(name, arg, secs = 3) {
    const sr = 44100, c = new OfflineAudioContext(1, sr * secs, sr);
    const g = chain(c, c.destination);
    const k = kit(c);
    k.set(STINGERS.has(name) ? g.st : g.sfx, name);
    k.voices[name](0.01, arg);
    const buf = await c.startRendering();
    return peakOf(buf.getChannelData(0));
  }
  // a busy moment: the music bed at full slider with a stinger, a crit, hits and a hurt on top
  async function renderMix(trackName, secs = 6) {
    const sr = 44100, c = new OfflineAudioContext(1, sr * secs, sr);
    const save = vol; vol = { music: 1, sfx: 1 };
    const g = chain(c, c.destination);
    vol = save;
    const buf = await load(trackName, c);
    const src = c.createBufferSource(); src.buffer = buf; src.connect(g.duck); src.start(0, loopOf(trackName)[0] + 8);
    const k = kit(c);
    const at = (name, t, arg) => { k.set(STINGERS.has(name) ? g.st : g.sfx, name); k.voices[name](t, arg); };
    at('phase', 0.5); at('roar', 0.8); at('crit', 1.2); at('slam', 2.0); at('boom', 4.5); for (let i = 0; i < 12; i++) at('hit', 1.5 + i * 0.09, 4); at('hurt', 2.4); at('support', 3); at('sever', 3.3); at('win', 4.2);
    // the combat layer's own sounds go through the same effects bus
    if (window.Combat && Combat.Audio) { const cs = Combat.Audio.create({ ctx: () => c, out: () => g.sfx, on: () => true }); ['shot4', 'electro-storm', 'zero-day', 'void-sphere'].forEach(n => cs.play(n)); }
    const out = await c.startRendering();
    return peakOf(out.getChannelData(0));
  }
  function peakOf(d) { let p = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; } return { peak: p, db: +(20 * Math.log10(p + 1e-12)).toFixed(2) }; }

  try { on = TT.soundOn(); } catch (e) {}
  const state = () => ({ ctx: ac ? ac.state : 'none', track: cur ? cur.name : '', want, on, duck: duckG ? +duckG.gain.value.toFixed(2) : 1, voice: voiceDuck });
  return {
    bed, track, enrage, victory, defeat, play, duck, mic, setVol, vol: () => ({ ...vol }), setOn, stop, unlock, state,
    combat: () => { ctx(); return { ac, bus: sfxBus }; },
    render, renderMix, NAMES: Object.keys(LEVEL), get on() { return on; },
  };
})();
