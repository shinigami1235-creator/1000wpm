// World boss sound: Syntax Error's music (audio/wb-*.mp3, made by tools/boss/music.py) and the
// sound effects, made with Web Audio.
// The music is 150 bpm, so a beat is 0.4 s and a bar 1.6 s, and everything moves on that grid:
//   - one loop per phase (wb-p1..p4, wb-enrage; bars in BARS). Each file holds the loop plus its
//     first second again, so playback loops from 0.5 s to 0.5 s + the loop. A phase change starts
//     the new loop at its first bar on the next beat of the old one.
//   - cut(in, len) drops the music before a hit; it comes back on the hit at the top of the next
//     bar, so the hit lands on a downbeat. uncut() brings it back now the same way.
//   - threat(on) brings in wb-threat (a ticking 4-bar layer, locked to the loop) and lifts the top.
//   - the beam face-off plays wb-fo against the face-off's own clock: the charge builds for 7 s, the
//     clash lands on beat 22 (8.8 s) and the result on beat 29 (11.6 s), where wb-fo-win or
//     wb-fo-lose plays; the phase loop comes back 4 beats later at the next 8-bar section.
//   BossAudio.phase(p)        play the loop for phase p (0 to 4)
//   BossAudio.victory()       fade the music and play the sting
//   BossAudio.play(name, arg) a sound effect
//   BossAudio.setOn(on)       follows the header sound button
//   BossAudio.stop()          stops everything, for unmount
//   BossAudio.renderFx(name)  renders a sound effect offline (for loudness checks)
//   BossAudio.out()           { ac, bus }: the context and effects bus, for the combat sounds
//   BossAudio.cut(in, len)    the music drops out in `in` s for `len` s and slams back, before a hit
//   BossAudio.uncut()         brings it back now (the attack was blocked)
//   BossAudio.threat(on)      the threat layer and a brighter top while an attack word is up
//   BossAudio.silence()       stops the music dead, for the kill
//   BossAudio.faceoff(kind, dur, off)  'start' (dur s long, off s already gone), 'resolve' (win), 'end'
window.BossAudio = (() => {
  const TRACKS = ['wb-p1', 'wb-p2', 'wb-p3', 'wb-p4', 'wb-enrage'];
  const BPM = 150, BEAT = 60 / BPM, BAR = 4 * BEAT, LOOP_AT = 0.5;
  const BARS = { 'wb-p1': 64, 'wb-p2': 64, 'wb-p3': 64, 'wb-p4': 48, 'wb-enrage': 32, 'wb-threat': 4 };
  const lenOf = n => (BARS[n] || 32) * BAR;
  const LOOP = lenOf('wb-p1');
  // the face-off cue, in beats from the face-off's start: the result at 29, the loop back 4 beats on
  const FO_RESULT = 29, FO_BACK = 4;
  // the new tracks are mastered to about -15 LUFS; this keeps the music where the effects were mixed against
  const MUSIC_VOL = 0.34, SFX_VOL = 1, THREAT_DB = 4;
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
    // the beam face-off's one-shots (the drones and the struggle are in faceoff() below)
    foStart: 0.8, foClash: 0.42, foEnd: 0.45, foWord: 0.5,
  };
  let ac = null, master = null, musicBus = null, sfxBus = null, shelf = null, cutG = null;
  let on = true, want = -1, cur = null, prev = null, fallback = null, token = 0;
  // cur: { src, g, name, t0 (when the loop's position 0 plays), len }; prev: the one a scheduled switch replaces
  let thr = null, threatOn = false, cutAt = 0, cutBack = 0, cutTo = 0, fo = null, lastSwitch = null;
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
  function unlock() { if (!on) return; try { ctx(); if (want >= 0 && !cur && !fallback && !fo) start(want); } catch (e) {} }

  // ---------- music ----------
  function load(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    loading[name] ||= fetch(url(name)).then(r => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
      .then(b => ctx().decodeAudioData(b)).then(buf => (buffers[name] = buf))
      .catch(e => { delete loading[name]; throw e; });
    return loading[name];
  }
  const mod = (a, n) => ((a % n) + n) % n;
  const posAt = (x, t) => mod(t - x.t0, x.len);
  // the next beat (or bar) of the playing loop at or after t
  function nextOn(t, unit) { if (!cur) return t; return cur.t0 + Math.ceil((t - cur.t0 - 1e-4) / unit) * unit; }
  // a loop source that plays position `pos` at time `at`
  function source(name, at, pos, fadeIn = 0.012) {
    const buf = buffers[name], len = lenOf(name);
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true; src.loopStart = LOOP_AT; src.loopEnd = Math.min(buf.duration, LOOP_AT + len);
    pos = mod(pos, len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(1, at + fadeIn);
    src.connect(g).connect(musicBus);
    src.start(Math.max(at, ac.currentTime), pos < LOOP_AT ? pos + len : pos);
    return { src, g, name, t0: at - pos, len };
  }
  function stopAt(x, at, s = 0.03) {
    if (!x) return;
    try {
      const t = Math.max(ac.currentTime, at - s);
      x.g.gain.cancelScheduledValues(t);
      x.g.gain.setValueAtTime(Math.max(0.0001, x.g.gain.value), t);
      x.g.gain.exponentialRampToValueAtTime(0.0001, t + s);
      x.src.stop(t + s + 0.02);
    } catch (e) {}
  }
  // play `name` from position `pos` at time `at`, replacing the loop that plays now (and the threat layer)
  function switchTo(name, at, pos, why, fadeOld = 0.03) {
    if (prev) { stopAt(prev, at); prev = null; }
    const old = cur;
    cur = source(name, at, pos, why === 'first' ? 0.05 : 0.012);
    if (old) {
      if (old.src !== cur.src) stopAt(old, at + fadeOld, fadeOld);
      if (at > ac.currentTime + 0.02) prev = old;
    }
    lastSwitch = { name, at, pos, why };
    syncThreat(at);
  }
  // the threat layer runs with the loop, silent until threat(true)
  function syncThreat(at) {
    if (!buffers['wb-threat'] || !cur) return;
    if (thr) stopAt(thr, at);
    thr = source('wb-threat', at, posAt(cur, at));
    thr.g.gain.cancelScheduledValues(at); thr.g.gain.setValueAtTime(threatOn ? 1 : 0.0001, at);
  }
  function phase(p) {
    want = p;
    if (!on) return;
    start(p);
    // fetch the next phase's loop early so the change is not late
    if (TRACKS[p + 1]) load(TRACKS[p + 1]).catch(() => {});
    ['wb-threat', 'wb-fo'].forEach(n => load(n).catch(() => {}));
  }
  async function start(p) {
    const name = TRACKS[p];
    if (cur && cur.name === name) return;
    const my = ++token;
    try {
      ctx();
      const buf = await load(name);
      if (my !== token || !on || want !== p) return;
      if (fo && !fo.back) return;      // the face-off cue is playing; the loop comes back after it
      const now = ac.currentTime;
      if (!cur) { switchTo(name, now + 0.05, 0, 'first'); return; }
      // in a cut the new phase lands with the hit; otherwise on the next beat, from its first bar
      if (cutBack > now) {
        if (cutTimer) cutName = name;
        else { if (prev) { try { cur.src.stop(); } catch (e) {} cur = prev; prev = null; } switchTo(name, cutBack, 0, 'cut'); }
        return;
      }
      switchTo(name, nextOn(now + 0.06, BEAT), 0, 'phase', 0.25);
    } catch (e) {
      if (my !== token) return;
      // a page opened as a file cannot fetch, so play through an audio element
      if (fallback) fallback.pause();
      fallback = new Audio(url(name));
      fallback.loop = true; fallback.volume = MUSIC_VOL;
      fallback.play().catch(() => {});
    }
  }
  function stopMusic(s = 0.5) {
    token++;
    if (ac) { const t = ac.currentTime + s; stopAt(cur, t, s); stopAt(prev, t, s); stopAt(thr, t, s); if (fo) { stopAt(fo, t, s); stopAt(fo.sting, t, s); } }
    cur = prev = thr = fo = null; cutBack = 0; clearTimeout(cutTimer); cutTimer = 0; cutName = '';
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
  // 16 to 22 dB louder on the hit, and brightens the top end while a word is up. Here the music
  // comes back on the hit at the top of the bar after the one it was cut in, so the hit is a downbeat.
  // The switch is scheduled a moment before the hit, so a block that comes first can call it off.
  let cutTimer = 0, cutName = '';
  function cut(inS, lenS) {
    if (!ac || !cutG || fo) return;
    const now = ac.currentTime, t = now + Math.max(0, inS), back = t + Math.max(0.1, lenS), g = cutG.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.03, t + 0.06);
    g.setValueAtTime(0.03, back);
    g.linearRampToValueAtTime(1, back + 0.03);
    cutAt = t; cutBack = back;
    clearTimeout(cutTimer);
    cutTimer = setTimeout(cutSwitch, Math.max(0, (back - now - 0.3) * 1000));
  }
  function cutSwitch() {
    cutTimer = 0;
    if (!cur || !ac || cutBack <= ac.currentTime) return;
    const name = cutName || cur.name, started = lastSwitch ? lastSwitch.at : 0;
    // a new phase starts from its first bar; the same loop from the bar after the cut
    const pos = name !== cur.name || started > cutAt ? 0 : Math.ceil((posAt(cur, cutAt) + 0.05) / BAR) * BAR;
    cutName = ''; cutTo = pos;
    if (buffers[name]) switchTo(name, cutBack, pos, 'cut');
  }
  function uncut() {
    if (!ac || !cutG) return;
    const now = ac.currentTime, g = cutG.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(1, now + 0.03);
    if (cutBack > now) {
      const waiting = !!cutTimer;
      clearTimeout(cutTimer); cutTimer = 0;
      if (cutAt < now && cur) {
        // blocked while the music was out: it comes back now, still from the top of a bar
        const name = cutName || cur.name;
        if (!waiting && prev) { try { cur.src.stop(); } catch (e) {} cur = prev; prev = null; }
        const pos = waiting ? (name !== cur.name ? 0 : Math.ceil((posAt(cur, cutAt) + 0.05) / BAR) * BAR) : cutTo;
        cutName = '';
        if (buffers[name]) switchTo(name, now + 0.03, pos, 'uncut');
      } else if (cutName) { const n = cutName; cutName = ''; if (buffers[n]) switchTo(n, nextOn(now + 0.06, BEAT), 0, 'phase', 0.25); }
    }
    cutBack = 0;
  }
  function threat(v) {
    threatOn = !!v;
    if (!ac || !shelf) return;
    const t = ac.currentTime, g = shelf.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v ? THREAT_DB : 0, t + (v ? 0.15 : 0.6));
    if (!thr && v && cur && buffers['wb-threat']) syncThreat(t + 0.02);
    if (thr) { const tg = thr.g.gain; tg.cancelScheduledValues(t); tg.setValueAtTime(Math.max(0.0001, tg.value), t); tg.exponentialRampToValueAtTime(v ? 1 : 0.0001, t + (v ? 0.2 : 0.8)); }
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

  // ---------- the face-off cue ----------
  function oneShot(name, at, off = 0) {
    const src = ac.createBufferSource(); src.buffer = buffers[name];
    const g = ac.createGain(); g.gain.value = 1;
    src.connect(g).connect(musicBus);
    src.start(Math.max(at, ac.currentTime), off);
    return { src, g, name };
  }
  // the loop comes back at the top of the 8-bar section after where it was left
  function loopBack(at) {
    if (want < 0 || !buffers[TRACKS[want]]) { if (want >= 0) start(want); return; }
    const name = TRACKS[want], len = lenOf(name);
    const pos = fo && fo.left && fo.left.name === name ? Math.ceil((fo.left.pos + 0.05) / (8 * BAR)) * 8 * BAR % len : 0;
    cur = null;
    switchTo(name, at, pos, 'faceoff');
  }
  async function foStartCue(off) {
    const f = fo;
    try {
      ctx();
      await load('wb-fo');
      ['wb-fo-win', 'wb-fo-lose'].forEach(n => load(n).catch(() => {}));
      if (!on || !fo || fo !== f || fo.src) return;
      const now = ac.currentTime, t0 = fo.t0;
      if (now - t0 > FO_RESULT * BEAT) return;
      Object.assign(fo, oneShot('wb-fo', Math.max(now, t0), Math.max(0, now - t0)));
    } catch (e) {}
  }
  async function foResult(win) {
    if (!fo || fo.sting) return;
    const name = win ? 'wb-fo-win' : 'wb-fo-lose';
    fo.sting = { name };
    try {
      await load(name);
      if (!fo || !on) return;
      const now = ac.currentTime;
      // on the result's beat, or the moment it arrives if it is late (the cue holds a chord there, so
      // the hit goes with the picture); the loop's grid starts again from the hit
      const at = Math.max(fo.t0 + FO_RESULT * BEAT, now + 0.02);
      if (fo.src) stopAt(fo, at + 0.06, 0.06);
      fo.sting = oneShot(name, at);
      fo.back = at + FO_BACK * BEAT;
      loopBack(fo.back);
      lastSwitch.why = 'faceoff-' + (win ? 'win' : 'lose');
    } catch (e) { if (fo) { fo.back = ac.currentTime; loopBack(ac.currentTime + 0.05); } }
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
      // the face-off: it breaks off (a deep sweep down and a two-note alarm), the beams meet (a crack and a boom),
      // it resolves (the raid's release climbs bright on a win, falls heavy on a loss), and each resistance word
      // you type ticks a little higher as the raid's power goes up
      foStart(t) {
        hiss(t, 0.9, 1800, 0.7, 0.4, 'bandpass', 0.02, 160);
        tone(t, 'sawtooth', 180, 40, 0.9, 0.22, 0.01);
        tone(t + 0.25, 'square', 392, 380, 0.16, 0.08); tone(t + 0.45, 'square', 311, 300, 0.22, 0.08);
      },
      foClash(t) {
        hiss(t, 0.12, 4000, 0.6, 0.6, 'highpass', 0.001);
        tone(t, 'sawtooth', 900, 120, 0.35, 0.3, 0.002);
        tone(t, 'sine', 70, 30, 1.1, 0.7, 0.004);
        hiss(t + 0.03, 1.0, 700, 0.5, 0.35, 'lowpass', 0.005, 150);
      },
      foEnd(t, win) {
        if (win) { tone(t, 'sawtooth', 160, 1300, 0.5, 0.2, 0.01); tone(t, 'triangle', 320, 2400, 0.45, 0.12, 0.01); }
        else { tone(t, 'sawtooth', 300, 45, 0.9, 0.24, 0.005); tone(t, 'square', 150, 40, 0.7, 0.08, 0.005); }
        tone(t, 'sine', 85, 26, 1.6, 0.75, 0.004);
        hiss(t, 1.4, 1200, 0.5, 0.42, 'lowpass', 0.004, 120);
        hiss(t, 0.1, 5000, 0.8, 0.4, 'highpass', 0.001);
      },
      foWord(t, k = 0) {
        const f = 520 * Math.pow(2, Math.min(1.4, k) * 0.9);
        tone(t, 'triangle', f, f * 1.5, 0.08, 0.16); tone(t + 0.02, 'sine', f * 2, f * 2.2, 0.1, 0.06);
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

  // ---------- the beam face-off's live layers ----------
  // Two charge drones that rise through the charge: the boss's low saws, and the raid's voices that thicken as
  // power goes in (a third voice and a brighter filter as it nears what it needs). Through the struggle a
  // heartbeat speeds up and a crackle loop follows the meeting point, higher the further the raid pushes. The
  // music ducks for the whole of it. Built on any context, so a test can render it offline (renderFaceoff).
  function foLayers(c, out) {
    const g = c.createGain(); g.gain.value = 0.0001; g.connect(out);
    const osc = (type, f, dest, vol) => { const o = c.createOscillator(), v = c.createGain(); o.type = type; o.frequency.value = f; v.gain.value = vol; o.connect(v).connect(dest); o.start(); return { o, v }; };
    const bf = c.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 260; bf.Q.value = 2; bf.connect(g);
    const boss = [osc('sawtooth', 55, bf, 0.0001), osc('sawtooth', 55.8, bf, 0.0001)];
    const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 500; tf.Q.value = 1.5; tf.connect(g);
    const team = [osc('triangle', 110, tf, 0.0001), osc('sawtooth', 110.7, tf, 0.0001), osc('square', 165, tf, 0.0001)];
    // crackle: noise through a band that follows the meeting point, gated by a fast flutter
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.12 ? 1 : 0.25);
    const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const cb = c.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 1200; cb.Q.value = 1.2;
    const cg = c.createGain(); cg.gain.value = 0.0001;
    ns.connect(cb).connect(cg).connect(g); ns.start();
    let beatAt = 0, phase = null;
    const ramp = (p, v, k = 0.08) => p.setTargetAtTime(v, c.currentTime, k);
    function thump(t, k) {
      const o = c.createOscillator(), v = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(68, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.22);
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.42 + 0.2 * k, t + 0.012); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(v).connect(g); o.start(t); o.stop(t + 0.3);
    }
    const L = {
      set(ph, ratio = 0, u = 0) {
        const r = Math.max(0, Math.min(1.5, ratio || 0)), t = c.currentTime;
        if (ph !== phase) { phase = ph; if (ph === 'gather') ramp(g.gain, L.cue ? 0.25 : 0.5, 0.15); if (ph === 'clash') beatAt = t; }
        if (ph === 'gather' || ph === 'charge') {
          const k = ph === 'gather' ? 0.15 * u : 0.15 + 0.85 * u;
          boss.forEach((b, i) => { ramp(b.v.gain, 0.05 + 0.11 * k); ramp(b.o.frequency, (55 + 55 * k) * (i ? 1.014 : 1), 0.2); });
          ramp(bf.frequency, 260 + 1500 * k, 0.2);
          const tk = Math.min(1, r);
          team.forEach((x, i) => { ramp(x.v.gain, ph === 'gather' ? 0.0001 : [0.06 + 0.06 * tk, 0.05 * tk, 0.05 * Math.max(0, tk - 0.45) / 0.55][i]); ramp(x.o.frequency, [110, 110.7, 165][i] * (1 + 0.5 * tk), 0.25); });
          ramp(tf.frequency, 500 + 2600 * tk, 0.2);
          ramp(cg.gain, 0.0001);
        } else if (ph === 'clash') {
          const p = 0.5 + 0.3 * Math.tanh((r - 1) * 2.4);
          ramp(cb.frequency, 500 + 2400 * p, 0.06);
          ramp(cg.gain, (0.16 + 0.16 * u) * (0.8 + 0.2 * Math.random()), 0.02);
          boss.forEach(b => ramp(b.v.gain, 0.12)); team.forEach((x, i) => ramp(x.v.gain, [0.1, 0.07, 0.06][i]));
          // the heartbeat, from about 85 to 150 a minute
          if (t >= beatAt && !L.cue) { thump(t + 0.01, u); thump(t + 0.2, u * 0.7); beatAt = t + 60 / (85 + 65 * u); }
        } else if (ph === 'resolve' || !ph) {
          ramp(g.gain, 0.0001, ph ? 0.12 : 0.05);
        }
      },
      stop() { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.05); [...boss, ...team].forEach(x => x.o.stop(t + 0.4)); ns.stop(t + 0.4); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 600); },
    };
    return L;
  }
  let foL = null;
  // kind 'start': arg is how long the face-off lasts, off how far into it we are (the cue keeps its clock)
  function faceoff(kind, arg, off = 0) {
    if (!on) return;
    try {
      ctx();
      if (kind === 'start') {
        if (foL) foL.stop();
        foL = foLayers(ac, sfxBus); foL.cue = true;
        play('foStart');
        if (!fo) {
          const now = ac.currentTime;
          clearTimeout(cutTimer); cutTimer = 0; cutBack = 0; cutName = ''; uncut(); threat(false);
          fo = { t0: now - Math.max(0, off || 0), left: cur ? { name: cur.name, pos: posAt(cur, now) } : null };
          // the loop falls away under the cue's opening hit
          if (cur) { stopAt(cur, now + 0.35, 0.35); stopAt(prev, now + 0.35, 0.35); stopAt(thr, now + 0.35, 0.35); cur = prev = thr = null; }
          foStartCue(off);
        }
      } else if (kind === 'resolve') { play('foEnd', !!arg); foResult(!!arg); }
      else if (kind === 'end') {
        if (foL) { foL.stop(); foL = null; }
        // no result came (a dropped connection): bring the loop back on the cue's next beat
        if (fo && !fo.back) { const now = ac.currentTime; if (fo.src) stopAt(fo, now + 0.1, 0.1); fo.back = fo.t0 + Math.ceil((now + 0.05 - fo.t0) / BEAT) * BEAT; loopBack(fo.back); }
        if (fo) { const f = fo; setTimeout(() => { if (fo === f) fo = null; }, Math.max(0, (f.back - ac.currentTime) * 1000) + 50); }
      }
    } catch (e) {}
  }
  function faceoffSet(ph, ratio, u) {
    if (!foL || !on) return;
    if (ph === 'clash' && foL.clashed !== true) { foL.clashed = true; play('foClash'); }
    foL.set(ph, ratio, u);
  }
  // the whole face-off rendered offline with the raid's power going in as `ratio` says, for the loudness check
  async function renderFaceoff(ratio = 1.1, win = true) {
    const sr = 44100, F = { gather: 1.8, charge: 7, clash: 2.8, resolve: 2 }, secs = 14;
    const c = new OfflineAudioContext(1, sr * secs, sr);
    const g = c.createGain(); g.gain.value = SFX_VOL;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    g.connect(comp).connect(c.destination);
    const L = foLayers(c, g), k = kit(c, g);
    const shot = (name, at, a) => { const kk = kit(c, g); kk.to(g, name); kk[name](at, a); };
    shot('foStart', 0.05);
    const marks = []; let t0 = 0;
    for (const [ph, len] of Object.entries(F)) { marks.push([ph, t0, len]); t0 += len; }
    shot('foClash', F.gather + F.charge + 0.01);
    shot('foEnd', F.gather + F.charge + F.clash + 0.01, win);
    for (let i = 0; i < 12; i++) shot('foWord', F.gather + 0.4 + i * 0.6, ratio * i / 12);
    for (let x = 0.05; x < secs - 0.1; x += 0.05) {
      c.suspend(x).then(() => {
        const m = marks.find(([, a, l]) => x >= a && x < a + l);
        if (m) L.set(m[0], m[0] === 'charge' ? ratio * (x - m[1]) / m[2] : ratio, (x - m[1]) / m[2]); else L.set(null);
        c.resume();
      });
    }
    const buf = await c.startRendering();
    return Array.from(buf.getChannelData(0));
  }

  function setOn(v) {
    on = v;
    if (!v && foL) { foL.stop(); foL = null; }
    if (!v) { stopMusic(0.3); if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
    else { try { ctx(); } catch (e) {} if (want >= 0) start(want); }
  }
  function stop() { want = -1; stopMusic(0.25); if (foL) { foL.stop(); foL = null; } }

  try { on = TT.soundOn(); } catch (e) {}
  // for tests: what plays, where on the grid, the last switch (its time, position and why) and the face-off cue
  const state = () => ({ ctx: ac ? ac.state : 'none', track: cur ? cur.name : fallback ? 'element' : '', on, want, now: ac ? ac.currentTime : 0,
    t0: cur ? cur.t0 : null, pos: cur && ac ? posAt(cur, ac.currentTime) : null, last: lastSwitch && { ...lastSwitch }, threat: threatOn && !!thr,
    cue: fo ? { t0: fo.t0, playing: !!fo.src, sting: fo.sting ? fo.sting.name : '', back: fo.back || 0 } : null, cutBack, BEAT, BAR });
  function out() { ctx(); return { ac, bus: sfxBus }; }
  return { phase, victory, play, setOn, stop, unlock, renderFx, renderFaceoff, faceoff, faceoffSet, duck, state, out, cut, uncut, threat, silence, TRACKS, LOOP, LOOP_AT, BARS, BPM, get on() { return on; } };
})();
