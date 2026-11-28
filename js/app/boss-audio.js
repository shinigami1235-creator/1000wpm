// World boss sound: one music loop per phase plus an enrage loop and a victory
// sting from audio/wb-*.mp3, and sound effects made with Web Audio.
// The loops are 32 bars at 140 bpm and every file holds the loop plus its
// first second again, so playback loops from 0.5 s to 0.5 s + LOOP and a phase
// change crossfades to the next loop at the same spot in the bar.
//   BossAudio.phase(p)        play the loop for phase p (0 to 4)
//   BossAudio.victory()       fade the music and play the sting
//   BossAudio.play(name, arg) a sound effect
//   BossAudio.setOn(on)       follows the header sound button
//   BossAudio.stop()          stops everything, for unmount
//   BossAudio.renderFx(name)  renders a sound effect offline (for loudness checks)
//   BossAudio.out()           { ac, bus }: the context and effects bus, for the combat sounds
//   BossAudio.cut(in, len)    the music drops out in `in` s for `len` s and slams back, before a hit
//   BossAudio.uncut()         brings it back now (the attack was blocked)
//   BossAudio.threat(on)      the top end of the music goes up 8 dB while an attack word is up
//   BossAudio.silence()       stops the music dead, for the kill
window.BossAudio = (() => {
  const TRACKS = ['wb-p1', 'wb-p2', 'wb-p3', 'wb-p4', 'wb-enrage'];
  const LOOP = 32 * 4 * 60 / 140, LOOP_AT = 0.5;
  const MUSIC_VOL = 0.42, SFX_VOL = 1;
  // per-effect level, set from loudness measurements so hits sit about 6 dB under the music
  // and the big moments (roar, shield break, defeat) reach it
  const LEVEL = {
    hit: 2.2, crit: 1.35, weak: 1.5, raid: 12, shieldHit: 2.4, shieldUp: 0.4, shieldBreak: 0.6, windup: 0.7, warn: 2.3,
    blockOk: 1.6, blockFail: 1.5, impact: 0.5, launch: 2.8, returned: 1.1, projHit: 2.6, addSpawn: 1.9, addKill: 1.1,
    roar: 0.85, stagger: 1.1, weakOpen: 1.1, milestone: 1.6, defeat: 0.5, swipe: 1.3, stomp: 0.9, charge: 0.7,
    // the new attacks and actions (28 Nov 2026), set against the same loudness check
    quakeWind: 0.5, quakeHit: 0.6, scanWind: 0.55, scanHit: 0.75, rainWind: 0.75, rainHit: 0.9, grabWind: 1.0, grabHit: 0.55,
    kneel: 0.6, transform: 0.8, glitchRoar: 1.8, deathBuild: 1.0, implode: 0.9, plates: 1.0,
    // the arm cannon (28 Nov 2026): the charge rises under the music, the shot is a short hard crack
    cannonWind: 0.55, cannonFire: 0.9,
  };
  let ac = null, master = null, musicBus = null, sfxBus = null, shelf = null, cutG = null;
  let on = true, want = -1, cur = null, fallback = null, token = 0;
  const buffers = {}, loading = {};
  const base = () => window.BREACH_BASE || '';
  const url = n => base() + `audio/${n}.mp3`;

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.connect(ac.destination);
      musicBus = ac.createGain(); musicBus.gain.value = MUSIC_VOL;
      shelf = ac.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.gain.value = 0;
      cutG = ac.createGain();
      musicBus.connect(shelf).connect(cutG).connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = SFX_VOL;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      sfxBus.connect(comp).connect(master);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function unlock() { if (!on) return; try { ctx(); if (want >= 0 && !cur && !fallback) start(want); } catch (e) {} }

  // ---------- music ----------
  function load(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    loading[name] ||= fetch(url(name)).then(r => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
      .then(b => ctx().decodeAudioData(b)).then(buf => (buffers[name] = buf))
      .catch(e => { delete loading[name]; throw e; });
    return loading[name];
  }
  function phase(p) {
    want = p;
    if (!on) return;
    start(p);
    // fetch the next phase's loop early so the change is not late
    if (TRACKS[p + 1]) load(TRACKS[p + 1]).catch(() => {});
  }
  async function start(p) {
    const name = TRACKS[p];
    if (cur && cur.name === name) return;
    const my = ++token;
    try {
      ctx();
      const buf = await load(name);
      if (my !== token || !on || want !== p) return;
      const t = ac.currentTime + 0.05;
      // keep the bar position when moving from one phase loop to the next
      const pos = cur ? ((t - cur.t0) % LOOP + LOOP) % LOOP : 0;
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = true; src.loopStart = LOOP_AT; src.loopEnd = Math.min(buf.duration, LOOP_AT + LOOP);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + (cur ? 1.6 : 1.2));
      src.connect(g).connect(musicBus);
      src.start(t, LOOP_AT + pos);
      if (cur) fade(cur, 1.6);
      cur = { src, g, name, t0: t - pos };
    } catch (e) {
      if (my !== token) return;
      // a page opened as a file cannot fetch, so play through an audio element
      if (fallback) fallback.pause();
      fallback = new Audio(url(name));
      fallback.loop = true; fallback.volume = MUSIC_VOL;
      fallback.play().catch(() => {});
    }
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
  function stopMusic(s = 0.5) {
    token++;
    if (cur && ac) fade(cur, s);
    cur = null;
    if (fallback) { fallback.pause(); fallback = null; }
  }
  function duck(level, s) {
    if (!ac || !musicBus) return;
    const t = ac.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(MUSIC_VOL * level, t + 0.08);
    musicBus.gain.linearRampToValueAtTime(MUSIC_VOL, t + s);
  }
  // The Typing of the Dead cuts its music for 0.5 to 1.8 s before a threat and brings it back
  // 16 to 22 dB louder on the hit, and brightens the top end while a word is up
  function cut(inS, lenS) {
    if (!ac || !cutG) return;
    const t = ac.currentTime + Math.max(0, inS), g = cutG.gain;
    g.cancelScheduledValues(ac.currentTime);
    g.setValueAtTime(g.value, ac.currentTime);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.03, t + 0.06);
    g.setValueAtTime(0.03, t + Math.max(0.1, lenS));
    g.linearRampToValueAtTime(1, t + Math.max(0.1, lenS) + 0.03);
  }
  function uncut() {
    if (!ac || !cutG) return;
    const t = ac.currentTime, g = cutG.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1, t + 0.03);
  }
  function threat(v) {
    if (!ac || !shelf) return;
    const t = ac.currentTime, g = shelf.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v ? 8 : 0, t + (v ? 0.15 : 0.6));
  }
  function silence() { uncut(); threat(false); stopMusic(0.06); }
  async function victory() {
    want = -1;
    stopMusic(0.8);
    if (!on) return;
    try {
      const buf = await load('wb-win');
      if (!on) return;
      const src = ac.createBufferSource(); src.buffer = buf;
      const g = ac.createGain(); g.gain.value = 1;
      src.connect(g).connect(musicBus);
      src.start(ac.currentTime + 0.9);
    } catch (e) {}
  }

  // ---------- sound effects ----------
  // Each voice takes a context, an output node and a start time, so the same
  // code plays live and renders offline for the loudness check.
  function kit(c, out) {
    const nbuf = {};
    const to = (node, name) => {
      const g = c.createGain(); g.gain.value = LEVEL[name] || 1; g.connect(node); out = g;
    };
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
    function tone(t, type, f0, f1, len, vol, a = 0.004) {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
      const g = c.createGain(); env(g, t, a, vol, len);
      o.connect(g).connect(out); o.start(t); o.stop(t + a + len + 0.05);
    }
    function hiss(t, len, freq, q, vol, type = 'bandpass', a = 0.003, f1) {
      const n = noise(len + a + 0.05);
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + len);
      const g = c.createGain(); env(g, t, a, vol, len);
      n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + a + len + 0.05);
    }
    const semis = n => Math.pow(2, n / 12);
    return {
      to,
      // your hit: pitch climbs a semitone every 3 combo, up to an octave
      hit(t, combo = 0) {
        const k = semis(Math.min(12, Math.floor(combo / 3)));
        tone(t, 'square', 520 * k, 260 * k, 0.07, 0.16);
        tone(t, 'sine', 150, 60, 0.09, 0.32);
        hiss(t, 0.05, 3200 * k, 1.2, 0.22);
        if (combo >= 10) tone(t + 0.02, 'triangle', 1040 * k, 1040 * k, 0.08, 0.1);
        if (combo >= 25) tone(t + 0.04, 'sine', 2080 * k, 2000 * k, 0.12, 0.07);
      },
      crit(t) {
        tone(t, 'sawtooth', 880, 220, 0.14, 0.18);
        tone(t, 'sine', 120, 45, 0.22, 0.5);
        hiss(t, 0.18, 2400, 0.7, 0.3, 'bandpass', 0.002, 800);
        tone(t + 0.03, 'triangle', 1760, 1700, 0.25, 0.12);
      },
      weak(t) {
        tone(t, 'triangle', 1320, 1320, 0.22, 0.2);
        tone(t, 'triangle', 1980, 1980, 0.3, 0.12, 0.01);
        tone(t, 'sine', 110, 50, 0.2, 0.45);
        hiss(t, 0.08, 5000, 1.5, 0.2);
      },
      raid(t) { hiss(t, 0.03, 2600 + Math.random() * 1600, 2, 0.05); },
      shieldHit(t) {
        tone(t, 'sine', 2400 + Math.random() * 400, 1800, 0.12, 0.08);
        hiss(t, 0.06, 6000, 3, 0.08, 'highpass');
      },
      shieldUp(t) {
        tone(t, 'sine', 180, 720, 1.1, 0.28, 0.2);
        tone(t, 'triangle', 360, 1440, 1.1, 0.12, 0.25);
        hiss(t, 1.0, 900, 0.8, 0.12, 'bandpass', 0.3, 4000);
      },
      shieldBreak(t) {
        hiss(t, 0.6, 5000, 0.6, 0.5, 'highpass', 0.002);
        [2200, 1700, 1300, 900, 600].forEach((f, i) => tone(t + i * 0.04, 'triangle', f, f / 2, 0.16, 0.18));
        tone(t, 'sine', 90, 40, 0.5, 0.5);
      },
      // the arm cannon drawing light in: a low saw climbing an octave and a half, a thin whine riding on
      // top and air rushing in, all swelling to the shot; a fast flutter in the last half second
      cannonWind(t, len = 2) {
        const a = Math.max(0.3, len - 0.08);
        tone(t, 'sawtooth', 55, 150, a, 0.16, a * 0.95);
        tone(t, 'sawtooth', 56.5, 154, a, 0.12, a * 0.95);
        tone(t, 'sine', 420, 2100, a, 0.05, a * 0.97);
        hiss(t, a, 500, 1.4, 0.16, 'bandpass', a * 0.9, 3200);
        for (let k = 0; k < 6; k++) tone(t + a - 0.5 + k * 0.08, 'square', 880 + k * 90, 900 + k * 90, 0.04, 0.035);
      },
      // the shot: a crack, a falling zap and a sub thump; a flank squad's is half as loud
      cannonFire(t, far) {
        const v = far ? 0.5 : 1;
        hiss(t, 0.09, 3500, 0.7, 0.5 * v, 'highpass', 0.001);
        tone(t, 'sawtooth', 1400, 90, 0.42, 0.28 * v, 0.002);
        tone(t, 'square', 700, 60, 0.3, 0.1 * v, 0.002);
        tone(t, 'sine', 95, 28, 0.6, 0.6 * v, 0.003);
        hiss(t + 0.02, 0.7, 900, 0.6, 0.32 * v, 'lowpass', 0.004, 180);
      },
      windup(t, len = 2) {
        tone(t, 'sawtooth', 70, 140, len, 0.12, Math.min(1, len * 0.8));
        tone(t, 'sawtooth', 73, 146, len, 0.1, Math.min(1, len * 0.8));
        hiss(t, len, 300, 0.7, 0.14, 'lowpass', len * 0.8, 1800);
      },
      warn(t) { tone(t, 'sawtooth', 262, 247, 0.12, 0.2); tone(t + 0.16, 'sawtooth', 262, 247, 0.12, 0.2); hiss(t, 0.3, 500, 0.8, 0.12, 'lowpass'); },
      blockOk(t) {
        tone(t, 'triangle', 700, 1400, 0.1, 0.3);
        tone(t + 0.08, 'triangle', 1400, 2100, 0.18, 0.24);
        hiss(t, 0.12, 4500, 1.2, 0.25);
      },
      blockFail(t) {
        tone(t, 'sawtooth', 160, 45, 0.5, 0.4);
        hiss(t, 0.45, 400, 0.6, 0.55, 'lowpass');
        tone(t + 0.05, 'square', 220, 200, 0.25, 0.08);
      },
      impact(t, soft) {
        hiss(t, soft ? 0.4 : 0.8, 260, 0.6, soft ? 0.35 : 0.7, 'lowpass', 0.002);
        tone(t, 'sine', 80, 32, soft ? 0.4 : 0.8, soft ? 0.4 : 0.75);
      },
      launch(t) { hiss(t, 0.3, 900, 1.2, 0.18, 'bandpass', 0.02, 3000); tone(t, 'triangle', 300, 600, 0.2, 0.08); },
      returned(t) {
        tone(t, 'square', 600, 2400, 0.12, 0.14);
        hiss(t, 0.15, 3000, 1, 0.22, 'bandpass', 0.002, 7000);
        tone(t + 0.08, 'sine', 140, 60, 0.2, 0.35);
      },
      projHit(t) { tone(t, 'sawtooth', 220, 70, 0.25, 0.25); hiss(t, 0.2, 800, 0.8, 0.3, 'lowpass'); },
      addSpawn(t) { [880, 660, 990, 740].forEach((f, i) => tone(t + i * 0.07, 'square', f, f * 0.97, 0.06, 0.1)); hiss(t, 0.3, 1500, 2, 0.1); },
      addKill(t) { tone(t, 'square', 400, 1200, 0.08, 0.16); hiss(t, 0.18, 2500, 1, 0.3); tone(t + 0.05, 'sine', 180, 60, 0.2, 0.3); },
      roar(t) {
        hiss(t, 1.5, 180, 0.9, 0.6, 'lowpass', 0.25, 700);
        tone(t, 'sawtooth', 62, 44, 1.5, 0.3, 0.25);
        tone(t, 'sawtooth', 65, 43, 1.5, 0.26, 0.25);
        tone(t, 'square', 124, 88, 1.3, 0.08, 0.3);
      },
      stagger(t) {
        hiss(t, 0.3, 1200, 0.6, 0.45, 'bandpass', 0.002, 300);
        tone(t, 'sine', 100, 40, 0.35, 0.55);
        [0, 0.07, 0.14].forEach(w => tone(t + w, 'square', 1500 - w * 4000, 900, 0.05, 0.08));
      },
      // the boss swinging at the raid between attacks: a whoosh, and a thump for a stomp
      swipe(t) { hiss(t, 0.32, 500, 1.4, 0.4, 'bandpass', 0.06, 2600); hiss(t + 0.16, 0.2, 2200, 1.2, 0.18, 'bandpass', 0.002, 700); },
      // a charged punch: a low hum that climbs and speeds up its pulse for the whole wind-up
      charge(t, d = 6) {
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(48, t); o.frequency.exponentialRampToValueAtTime(260, t + d);
        f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + d);
        lfo.frequency.setValueAtTime(3, t); lfo.frequency.exponentialRampToValueAtTime(22, t + d); lg.gain.value = 0.5;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.6); g.gain.setValueAtTime(0.5, t + d - 0.05); g.gain.linearRampToValueAtTime(0, t + d);
        lfo.connect(lg).connect(g.gain);
        o.connect(f).connect(g).connect(out);
        o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
      },
      stomp(t) { tone(t, 'sine', 70, 30, 0.45, 0.7); hiss(t, 0.35, 220, 0.7, 0.45, 'lowpass', 0.002); },
      // ---- Syntax Error's new attacks: a wind-up sound for the length of the wind-up, and its landing ----
      // segfault: a rumble and a servo whine that climb as it rises, then a floor-shaking pound and debris
      quakeWind(t, d = 3) {
        tone(t, 'sawtooth', 38, 92, d, 0.22, Math.min(1.2, d * 0.7));
        tone(t, 'sawtooth', 40, 95, d, 0.18, Math.min(1.2, d * 0.7));
        tone(t, 'triangle', 260, 880, d, 0.07, d * 0.8);
        hiss(t, d, 160, 0.8, 0.22, 'lowpass', d * 0.75, 900);
      },
      quakeHit(t, blocked) {
        tone(t, 'sine', 64, 24, 1.3, 0.9);
        tone(t, 'sawtooth', 90, 30, 0.6, 0.18);
        hiss(t, 1.1, 320, 0.7, 0.8, 'lowpass', 0.002, 90);
        hiss(t, 0.09, 3500, 0.7, 0.45, 'highpass', 0.001);
        for (let i = 0; i < 9; i++) hiss(t + 0.12 + Math.random() * 0.7, 0.05, 900 + Math.random() * 2500, 3, 0.12, 'bandpass', 0.001);
        if (blocked) { tone(t, 'triangle', 1900, 1250, 0.4, 0.14); tone(t + 0.02, 'triangle', 2850, 1900, 0.3, 0.08); }
      },
      // scan line: a whine that charges, then a sizzling beam that sweeps
      scanWind(t, d = 3) {
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(2600, t + d);
        lfo.frequency.setValueAtTime(6, t); lfo.frequency.exponentialRampToValueAtTime(28, t + d); lg.gain.value = 0.06;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + d * 0.9); g.gain.linearRampToValueAtTime(0, t + d);
        lfo.connect(lg).connect(g.gain); o.connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
        hiss(t, d, 2000, 4, 0.1, 'bandpass', d * 0.9, 7000);
      },
      scanHit(t, blocked) {
        const o = c.createOscillator(), g = c.createGain(), v = c.createOscillator(), vg = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); v.frequency.value = 38; vg.gain.value = 22;
        v.connect(vg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.setValueAtTime(0.3, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        o.connect(g).connect(out); o.start(t); v.start(t); o.stop(t + 0.8); v.stop(t + 0.8);
        hiss(t, 0.7, 5200, 0.8, 0.35, 'highpass', 0.01);
        tone(t, 'square', 1800, 400, 0.12, 0.12);
        if (blocked) tone(t + 0.05, 'triangle', 2200, 1700, 0.5, 0.1);
      },
      // code rain: glitchy blips that thicken as the code gathers, then a quick barrage of zaps
      rainWind(t, d = 3) {
        tone(t, 'sawtooth', 55, 70, d, 0.14, d * 0.6);
        const n = Math.floor(d / 0.07);
        for (let i = 0; i < n; i++) { const u = i / n; if (Math.random() > 0.35 + 0.6 * u) continue; const f = 400 + Math.floor(Math.random() * 8) * 140 * (1 + u); tone(t + i * 0.07, 'square', f, f, 0.035, 0.035 + 0.05 * u); }
      },
      rainHit(t, blocked) {
        for (let i = 0; i < 9; i++) { const w = t + i * 0.05; tone(w, 'square', 1500 - i * 60, 260, 0.06, 0.12); hiss(w, 0.06, blocked ? 5000 : 2200, 1.5, 0.22); }
        tone(t, 'sine', 90, 40, 0.5, 0.45);
      },
      // memory grab: a servo whirr and the talons clicking open, then a metal clamp crunching shut
      grabWind(t, d = 3) {
        hiss(t, d, 700, 3, 0.1, 'bandpass', d * 0.5, 1400);
        tone(t, 'sawtooth', 85, 150, d, 0.08, d * 0.5);
        for (let i = 0; i < 5; i++) { const w = t + 0.15 + i * 0.09; tone(w, 'triangle', 2400 + i * 200, 1800, 0.04, 0.12); hiss(w, 0.03, 6000, 2, 0.12); }
      },
      grabHit(t, blocked) {
        hiss(t, 0.16, 1600, 1.2, 0.6, 'bandpass', 0.001, 500);
        tone(t, 'sine', 95, 38, 0.45, 0.7);
        const o = c.createOscillator(), g = c.createGain(), v = c.createOscillator(), vg = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = 62; v.frequency.value = 17; vg.gain.value = 0.12;
        g.gain.setValueAtTime(0.0001, t + 0.05); g.gain.exponentialRampToValueAtTime(0.16, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
        v.connect(vg).connect(g.gain); o.connect(g).connect(out); o.start(t); v.start(t); o.stop(t + 0.7); v.stop(t + 0.7);
        for (let i = 0; i < 6; i++) hiss(t + 0.1 + Math.random() * 0.45, 0.025, 4000 + Math.random() * 3000, 4, 0.14, 'bandpass', 0.001);
        if (blocked) tone(t, 'triangle', 1700, 1300, 0.35, 0.12);
      },
      // the kneel: a heavy thud as it sinks, and its power whining down
      kneel(t) { tone(t, 'sine', 75, 30, 0.7, 0.75); hiss(t, 0.5, 300, 0.7, 0.5, 'lowpass', 0.003); tone(t + 0.05, 'sine', 900, 110, 1.1, 0.12); hiss(t + 0.1, 0.9, 3000, 1, 0.08, 'bandpass', 0.05, 400); },
      // the change of phase: power surging up, and the plates clanking as they lock in their new places
      transform(t) {
        tone(t, 'sawtooth', 55, 230, 1.1, 0.16, 0.6);
        hiss(t, 1.0, 400, 0.8, 0.22, 'bandpass', 0.7, 3500);
        [0.55, 0.72, 0.86, 0.98].forEach((w, i) => { tone(t + w, 'triangle', 700 + i * 160, 380, 0.1, 0.2); hiss(t + w, 0.06, 2500, 1.5, 0.3, 'bandpass', 0.001); tone(t + w, 'sine', 110, 50, 0.15, 0.3); });
      },
      // a digital screech over the roar
      glitchRoar(t) {
        for (let i = 0; i < 6; i++) { const w = t + 0.1 + i * 0.13 + Math.random() * 0.05, f = 600 + Math.random() * 900; tone(w, 'square', f, f * 0.5, 0.09, 0.08); }
        hiss(t, 1.4, 1800, 0.6, 0.12, 'bandpass', 0.3, 500);
      },
      // a stack of plates hitting the floor as the armour comes off
      plates(t) { for (let i = 0; i < 7; i++) { const w = t + i * 0.07 + Math.random() * 0.05; tone(w, 'triangle', 500 + Math.random() * 700, 260, 0.12, 0.16); hiss(w, 0.05, 1800 + Math.random() * 2000, 2, 0.2, 'bandpass', 0.001); } tone(t, 'sine', 80, 40, 0.4, 0.5); },
      // the death: the core going unstable, then the pull inward just before it blows
      deathBuild(t) {
        const o = c.createOscillator(), g = c.createGain(), v = c.createOscillator(), vg = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1500, t + 1.3);
        v.frequency.setValueAtTime(5, t); v.frequency.exponentialRampToValueAtTime(30, t + 1.3); vg.gain.setValueAtTime(20, t); vg.gain.linearRampToValueAtTime(260, t + 1.3);
        v.connect(vg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 1.1); g.gain.linearRampToValueAtTime(0, t + 1.35);
        o.connect(g).connect(out); o.start(t); v.start(t); o.stop(t + 1.4); v.stop(t + 1.4);
        for (let i = 0; i < 14; i++) hiss(t + Math.random() * 1.3, 0.03, 3000 + Math.random() * 4000, 3, 0.15, 'bandpass', 0.001);
      },
      implode(t) { hiss(t, 0.35, 200, 0.7, 0.4, 'lowpass', 0.3, 2400); tone(t, 'sine', 40, 160, 0.33, 0.4, 0.3); },
      weakOpen(t) { [660, 880, 1320].forEach((f, i) => tone(t + i * 0.08, 'triangle', f, f, 0.2, 0.18)); },
      milestone(t) { [784, 1046].forEach((f, i) => tone(t + i * 0.09, 'triangle', f, f, 0.18, 0.16)); },
      defeat(t) {
        hiss(t, 2.4, 1200, 0.5, 0.75, 'lowpass', 0.01, 80);
        tone(t, 'sine', 70, 24, 2.2, 0.85);
        tone(t, 'sawtooth', 110, 30, 1.6, 0.18);
        hiss(t + 0.05, 0.6, 6000, 0.6, 0.25, 'highpass');
      },
    };
  }
  let live = null;
  const gaps = { raid: 70, shieldHit: 90, hit: 25 };
  const lastAt = {};
  function play(name, arg) {
    if (!on) return;
    const n = performance.now();
    if (gaps[name] && n - (lastAt[name] || 0) < gaps[name]) return;
    lastAt[name] = n;
    try {
      ctx();
      live ||= kit(ac, sfxBus);
      if (!live[name]) return;
      if (name === 'roar' || name === 'defeat') duck(0.45, name === 'defeat' ? 2.6 : 1.6);
      if (window.SfxBank && SfxBank.play(ac, sfxBus, name, ac.currentTime + 0.005, arg)) return;
      live.to(sfxBus, name);
      live[name](ac.currentTime + 0.005, arg);
    } catch (e) {}
  }
  // renders one effect through the same bus settings, for loudness checks in tests
  async function renderFx(name, arg, secs = 3) {
    const sr = 44100, c = new OfflineAudioContext(1, sr * secs, sr);
    const g = c.createGain(); g.gain.value = SFX_VOL;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    g.connect(comp).connect(c.destination);
    const k = kit(c, g);
    k.to(g, name);
    k[name](0.01, arg);
    const buf = await c.startRendering();
    return Array.from(buf.getChannelData(0));
  }

  function setOn(v) {
    on = v;
    if (!v) { stopMusic(0.3); if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
    else { try { ctx(); } catch (e) {} if (want >= 0) start(want); }
  }
  function stop() { want = -1; stopMusic(0.25); }

  try { on = TT.soundOn(); } catch (e) {}
  const state = () => ({ ctx: ac ? ac.state : 'none', track: cur ? cur.name : fallback ? 'element' : '', on, want });
  function out() { ctx(); return { ac, bus: sfxBus }; }
  return { phase, victory, play, setOn, stop, unlock, renderFx, duck, state, out, cut, uncut, threat, silence, TRACKS, LOOP, LOOP_AT, get on() { return on; } };
})();
