// Boss Rush sound. Music: each boss's own track at three speeds, one per phase
// (audio/rush-<boss>-<phase>.mp3, made by tools/rush/music.py), crossfaded at a phase
// change. The World Boss victory sting (audio/wb-win.mp3) plays between bosses. Effects come from js/app/boss-audio.js and the combat module's own sounds,
// all on the World Boss's audio context.
//   RushAudio.music(name)   loop a track, crossfading from the one before
//   RushAudio.sting()       the stinger between bosses, with the music ducked under it
//   RushAudio.duck(level, secs)  RushAudio.quiet(on)  RushAudio.stop()  RushAudio.setOn(on)
//   RushAudio.play(name, arg)    a World Boss effect (windup, blockOk, roar...)
//   RushAudio.combat()           Combat.Audio for the tier shots and spells
//   RushAudio.titan(name, arg)   the titans' own sounds (below): a charge that builds over arg seconds through a
//                                wind-up and stops when the blow lands or is blocked, each strike, entrances and deaths
window.RushAudio = (() => {
  const MUSIC_VOL = 0.4;
  let bus = null, cur = null, want = '', token = 0, quietK = 1, cSnd = null;
  const buffers = {}, loading = {};
  const A = () => window.BossAudio;
  const url = n => (window.BREACH_BASE || '') + `audio/${n}.mp3`;
  const ctx = () => (A() ? A().out().ac : null);
  const on = () => (A() ? A().on : false);

  function out() {
    const ac = ctx();
    if (!ac) return null;
    if (!bus || bus.context !== ac) { bus = ac.createGain(); bus.gain.value = MUSIC_VOL; bus.connect(ac.destination); }
    return bus;
  }
  function load(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    loading[name] ||= fetch(url(name)).then(r => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
      .then(b => ctx().decodeAudioData(b)).then(buf => (buffers[name] = buf))
      .catch(e => { delete loading[name]; throw e; });
    return loading[name];
  }
  async function music(name) {
    want = name;
    if (!on() || !name) return;
    if (cur && cur.name === name) return;
    const my = ++token;
    try {
      const buf = await load(name);
      if (my !== token || !on() || want !== name) return;
      const ac = ctx(), o = out();
      const t = ac.currentTime + 0.05;
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 1.2);
      src.connect(g).connect(o);
      src.start(t);
      if (cur) fade(cur, 1.2);
      cur = { src, g, name };
    } catch (e) {}
  }
  function fade(x, s) {
    try {
      const t = ctx().currentTime;
      x.g.gain.cancelScheduledValues(t);
      x.g.gain.setValueAtTime(Math.max(0.0001, x.g.gain.value), t);
      x.g.gain.exponentialRampToValueAtTime(0.0001, t + s);
      x.src.stop(t + s + 0.05);
    } catch (e) {}
  }
  function level() { return MUSIC_VOL * quietK; }
  function duck(k, secs) {
    const o = out(); if (!o) return;
    const t = o.context.currentTime;
    o.gain.cancelScheduledValues(t);
    o.gain.setValueAtTime(o.gain.value, t);
    o.gain.linearRampToValueAtTime(level() * k, t + 0.08);
    o.gain.linearRampToValueAtTime(level(), t + secs);
  }
  // the breather keeps the loop going under the stats at a lower level
  function quiet(q) {
    quietK = q ? 0.45 : 1;
    const o = out(); if (!o) return;
    const t = o.context.currentTime;
    o.gain.cancelScheduledValues(t);
    o.gain.setValueAtTime(o.gain.value, t);
    o.gain.linearRampToValueAtTime(level(), t + 0.6);
  }
  async function sting() {
    if (!on()) return;
    duck(0.25, 3.2);
    try {
      const buf = await load('wb-win');
      const ac = ctx();
      const src = ac.createBufferSource(); src.buffer = buf;
      const g = ac.createGain(); g.gain.value = 0.85;
      src.connect(g).connect(ac.destination);
      src.start(ac.currentTime + 0.25);
      // the sting is 8 s long; fade it out by 3.5 s so it ends before the breather does
      g.gain.setValueAtTime(0.85, ac.currentTime + 2.6);
      g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 3.6);
      src.stop(ac.currentTime + 3.7);
    } catch (e) {}
  }
  function stop() { want = ''; token++; if (cur) { fade(cur, 0.4); cur = null; } }
  function setOn(v) {
    if (A()) A().setOn(v);
    if (!v) { if (cur) { fade(cur, 0.2); cur = null; } }
    else if (want) music(want);
  }
  function play(name, arg) { if (A()) A().play(name, arg); }
  function combat() {
    if (!cSnd && window.Combat && Combat.Audio && A()) cSnd = Combat.Audio.create({ ctx: () => A().out().ac, out: () => A().out().bus, on: () => A().on });
    return cSnd;
  }
  function unlock() { if (A()) A().unlock(); if (want && !cur) music(want); }

  // ---------- the titans' sounds ----------
  // Made in code like js/app/boss-audio.js, on its effects bus (which has the compressor), each voice
  // through its own gain so a charge can be cut off. Levels sit under the music's hits; the big ones
  // (slams, the death blast) reach it.
  let tk = null, charging = null;
  // levels set from offline renders (renderTitan): the loudest peak about -4 dBFS, the charges about 3 dB
  // under the strikes, the quiet magic and wire sounds lifted to sit with the rest
  const TLEVEL = { siegeSlam: 0.9, quake: 0.8, throneShock: 0.6, pound: 0.5, titanBoom: 0.58, crush: 0.7, titanRoar: 0.9, clang: 0.75, cleave: 0.55,
    wireLash: 1.3, decreeCast: 1.3, compile: 1.2, titanFall: 1.2, overload: 1.1, rise: 1.0, bladeSweep: 1.0 };
  const CHARGE_K = 0.72;
  function tkit(c) {
    const nb = {};
    function noise(len) {
      const k = Math.ceil(len * 10) / 10;
      if (!nb[k]) { const b = c.createBuffer(1, Math.ceil(c.sampleRate * k), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; nb[k] = b; }
      const s = c.createBufferSource(); s.buffer = nb[k]; return s;
    }
    function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
    function tone(out, t, type, f0, f1, len, vol, a = 0.004) {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
      const g = c.createGain(); env(g, t, a, vol, len); o.connect(g).connect(out); o.start(t); o.stop(t + a + len + 0.05);
    }
    function hiss(out, t, len, freq, q, vol, type = 'bandpass', a = 0.003, f1) {
      const n = noise(len + a + 0.05), f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + len);
      const g = c.createGain(); env(g, t, a, vol, len); n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + a + len + 0.05);
    }
    // a struck metal plate: a few inharmonic partials ringing down
    function metal(out, t, f, vol, len = 0.9) { [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(out, t, 'sine', f * m, f * m * 0.985, len / (1 + i * 0.6), vol / (1 + i * 0.8), 0.002)); hiss(out, t, 0.06, f * 6, 2, vol * 0.6, 'bandpass'); }
    // a heavy hit: a sub drop, a crunch of low noise and a click on top
    function boom(out, t, vol, len = 0.9) { tone(out, t, 'sine', 95, 28, len, vol); hiss(out, t, len * 0.8, 380, 0.6, vol * 0.9, 'lowpass', 0.002, 60); hiss(out, t, 0.05, 2500, 1, vol * 0.4); tone(out, t, 'triangle', 180, 60, 0.18, vol * 0.4); }
    // a build: a voice that climbs and pulses faster over d seconds, held by a gain the caller can cut
    function build(out, t, d, o) {
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + Math.min(0.6, d * 0.4)); g.gain.setValueAtTime(o.vol, t + d); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.25);
      g.connect(out);
      const nodes = [];
      for (const [type, f0, f1, k] of o.osc) {
        const osc = c.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + d);
        const og = c.createGain(); og.gain.value = k; osc.connect(og).connect(g); osc.start(t); osc.stop(t + d + 0.3); nodes.push(osc);
      }
      if (o.lfo) {
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.setValueAtTime(o.lfo[0], t); lfo.frequency.exponentialRampToValueAtTime(o.lfo[1], t + d); lg.gain.value = o.lfo[2] || 0.5;
        lfo.connect(lg).connect(g.gain); lfo.start(t); lfo.stop(t + d + 0.3); nodes.push(lfo);
      }
      if (o.noise) {
        const n = noise(d + 0.4), f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = o.noise[2] || 0.8; f.frequency.setValueAtTime(o.noise[0], t); f.frequency.exponentialRampToValueAtTime(o.noise[1], t + d);
        const ng = c.createGain(); ng.gain.value = o.noise[3] || 0.5; n.connect(f).connect(ng).connect(g); n.start(t); n.stop(t + d + 0.3); nodes.push(n);
      }
      return { g, nodes };
    }
    const B = (o) => (out, t, d = 2) => build(out, t, Math.max(0.4, d), o);
    return {
      // ---- charges (arg: the wind-up's seconds) ----
      siegeCharge: B({ vol: 0.32, osc: [['sawtooth', 45, 110, 0.6], ['square', 47, 116, 0.25]], lfo: [4, 18, 0.45], noise: [200, 900, 0.7, 0.6] }),
      stompCharge: B({ vol: 0.32, osc: [['sawtooth', 55, 160, 0.5], ['sine', 110, 330, 0.3]], lfo: [2, 9, 0.6], noise: [300, 1400, 1.2, 0.4] }),
      shieldCharge: B({ vol: 0.26, osc: [['sine', 180, 620, 0.6], ['square', 90, 310, 0.18]], lfo: [6, 26, 0.4] }),
      bladeCharge: B({ vol: 0.24, osc: [['sawtooth', 300, 1500, 0.25], ['sine', 600, 2400, 0.3]], lfo: [8, 30, 0.3], noise: [2000, 7000, 3, 0.35] }),
      blockCharge: B({ vol: 0.26, osc: [['square', 220, 880, 0.2]], lfo: [6, 40, 0.8], noise: [1500, 5000, 2, 0.4] }),
      tailCharge: B({ vol: 0.26, osc: [['sawtooth', 70, 140, 0.4]], lfo: [10, 30, 0.7], noise: [600, 2500, 1.5, 0.6] }),
      beamCharge: B({ vol: 0.24, osc: [['sine', 160, 1300, 0.55], ['sine', 163, 1320, 0.45], ['sawtooth', 80, 320, 0.12]], lfo: [5, 45, 0.35] }),
      throneCharge: B({ vol: 0.3, osc: [['sawtooth', 55, 82, 0.35], ['sawtooth', 82.4, 123, 0.25], ['triangle', 110, 165, 0.3]], lfo: [1.5, 7, 0.3], noise: [150, 600, 0.7, 0.3] }),
      decreeCharge: B({ vol: 0.22, osc: [['triangle', 330, 660, 0.4], ['triangle', 415, 830, 0.3], ['triangle', 494, 988, 0.3]], lfo: [5, 14, 0.25] }),
      glitchCharge: B({ vol: 0.24, osc: [['square', 120, 960, 0.3], ['square', 127, 900, 0.2]], lfo: [11, 37, 0.9], noise: [800, 6000, 4, 0.3] }),
      wireCharge: B({ vol: 0.22, osc: [['sawtooth', 120, 480, 0.35]], lfo: [30, 60, 0.6], noise: [3000, 8000, 2, 0.35] }),
      pistonCharge: B({ vol: 0.28, osc: [['sawtooth', 60, 140, 0.4]], lfo: [3, 16, 0.6], noise: [800, 4000, 1, 0.6] }),
      steamBuild: B({ vol: 0.28, osc: [['sine', 900, 2600, 0.25]], lfo: [4, 12, 0.2], noise: [1500, 6000, 0.8, 0.8] }),
      // ---- strikes ----
      siegeSlam(o, t) { boom(o, t, 0.85, 1.1); metal(o, t + 0.01, 90, 0.2, 0.7); hiss(o, t + 0.05, 1.2, 300, 0.5, 0.35, 'lowpass', 0.05, 80); },
      swing(o, t) { hiss(o, t, 0.28, 600, 1.2, 0.45, 'bandpass', 0.05, 2800); tone(o, t + 0.12, 'sine', 120, 45, 0.3, 0.5); },
      quake(o, t) { boom(o, t, 0.8, 1.4); hiss(o, t, 1.6, 120, 0.6, 0.5, 'lowpass', 0.08, 40); for (let i = 0; i < 6; i++) hiss(o, t + 0.05 + i * 0.07, 0.12, 900 + Math.random() * 900, 2, 0.12); },
      shieldBash(o, t) { metal(o, t, 140, 0.5, 1.0); boom(o, t, 0.5, 0.5); },
      bladeSweep(o, t) { hiss(o, t, 0.32, 900, 1.6, 0.5, 'bandpass', 0.04, 5000); tone(o, t + 0.1, 'sine', 1800, 1700, 0.6, 0.12); metal(o, t + 0.12, 620, 0.12, 0.5); },
      cleave(o, t) { hiss(o, t, 0.25, 4000, 1.2, 0.4, 'bandpass', 0.02, 700); boom(o, t + 0.08, 0.7, 0.9); hiss(o, t + 0.1, 0.9, 2500, 0.6, 0.25, 'highpass', 0.02, 600); },
      blockStorm(o, t) { for (let i = 0; i < 9; i++) { const u = t + 0.05 + i * 0.04; tone(o, u, 'sine', 160, 50, 0.2, 0.35); hiss(o, u, 0.08, 1800, 1.2, 0.18); } boom(o, t + 0.38, 0.5, 0.6); },
      tailLash(o, t) { hiss(o, t, 0.2, 700, 1.2, 0.35, 'bandpass', 0.06, 3200); hiss(o, t + 0.15, 0.05, 5000, 0.5, 0.6, 'highpass'); tone(o, t + 0.15, 'square', 1400, 300, 0.06, 0.15); },
      beamFire(o, t) { tone(o, t, 'sawtooth', 900, 160, 0.6, 0.3); tone(o, t, 'sine', 1800, 300, 0.5, 0.2); hiss(o, t, 0.6, 3000, 0.8, 0.35, 'bandpass', 0.005, 800); tone(o, t, 'sine', 70, 35, 0.5, 0.5); },
      throneShock(o, t) { boom(o, t, 0.85, 1.3); metal(o, t + 0.02, 55, 0.45, 2.2); [220, 277, 330].forEach(f => tone(o, t + 0.05, 'triangle', f, f, 1.2, 0.07, 0.05)); },
      decreeCast(o, t) { [880, 1109, 1319, 1760].forEach((f, i) => tone(o, t + i * 0.03, 'triangle', f, f, 0.5, 0.1)); tone(o, t + 0.2, 'sawtooth', 600, 120, 0.25, 0.18); hiss(o, t + 0.25, 0.3, 3000, 1, 0.3); },
      crush(o, t) { boom(o, t, 0.9, 1.2); metal(o, t, 70, 0.3, 0.8); hiss(o, t + 0.08, 0.5, 1200, 0.8, 0.3, 'bandpass', 0.01, 200); },
      glitchSplit(o, t) { for (let i = 0; i < 10; i++) tone(o, t + i * 0.025, 'square', 200 + Math.random() * 2400, 100 + Math.random() * 800, 0.03, 0.14); boom(o, t + 0.05, 0.5, 0.5); },
      wireLash(o, t) { hiss(o, t, 0.15, 6000, 0.7, 0.5, 'highpass'); tone(o, t, 'sawtooth', 2400, 200, 0.12, 0.25); tone(o, t + 0.05, 'square', 60, 50, 0.3, 0.15); },
      pistonPunch(o, t) { boom(o, t, 0.75, 0.7); metal(o, t, 180, 0.25, 0.4); hiss(o, t + 0.04, 0.7, 2500, 0.6, 0.45, 'bandpass', 0.01, 900); },
      steamBlast(o, t) { hiss(o, t, 1.5, 2200, 0.5, 0.75, 'bandpass', 0.02, 900); hiss(o, t, 1.2, 6000, 0.5, 0.3, 'highpass', 0.02); tone(o, t, 'sine', 80, 40, 0.5, 0.35); },
      pound(o, t) { boom(o, t, 0.9, 1.0); boom(o, t + 0.09, 0.6, 1.2); metal(o, t, 60, 0.2, 0.9); },
      clang(o, t) { metal(o, t, 520, 0.4, 0.9); metal(o, t + 0.015, 880, 0.18, 0.6); hiss(o, t, 0.15, 5000, 1, 0.35); },
      // ---- entrances, roars and deaths ----
      titanRoar(o, t) { hiss(o, t, 1.4, 220, 1.2, 0.5, 'bandpass', 0.2, 600); tone(o, t, 'sawtooth', 58, 41, 1.4, 0.3, 0.2); tone(o, t, 'sawtooth', 61, 42, 1.4, 0.25, 0.2); tone(o, t + 0.1, 'square', 116, 82, 1.1, 0.08, 0.3); metal(o, t + 0.05, 75, 0.12, 1.4); },
      materialize(o, t) { tone(o, t, 'sine', 200, 1600, 1.5, 0.18, 0.4); hiss(o, t, 1.6, 800, 2, 0.25, 'bandpass', 0.4, 6000); },
      assemble(o, t) { for (let i = 0; i < 16; i++) tone(o, t + i * 0.09 + Math.random() * 0.03, 'square', 400 + i * 90, 300 + i * 60, 0.04, 0.12); boom(o, t + 1.5, 0.5, 0.6); },
      rise(o, t) { hiss(o, t, 1.6, 140, 0.6, 0.6, 'lowpass', 0.3, 400); tone(o, t, 'sawtooth', 40, 70, 1.6, 0.25, 0.4); },
      compile(o, t) { for (let i = 0; i < 20; i++) tone(o, t + i * 0.08, 'square', 500 + (i % 5) * 220, 500 + (i % 5) * 220, 0.03, 0.1); tone(o, t + 1.6, 'triangle', 660, 660, 0.3, 0.2); tone(o, t + 1.7, 'triangle', 990, 990, 0.4, 0.15); },
      charge(o, t) { for (let i = 0; i < 8; i++) { tone(o, t + i * 0.12, 'sine', 70, 35, 0.2, 0.4); hiss(o, t + i * 0.12, 0.1, 300, 0.7, 0.2, 'lowpass'); } },
      titanFall(o, t) { tone(o, t, 'sawtooth', 300, 40, 1.4, 0.25, 0.01); tone(o, t, 'square', 150, 30, 1.2, 0.1); hiss(o, t, 0.6, 2000, 0.6, 0.3, 'bandpass', 0.005, 300); },
      armourOff(o, t) { [0, 0.07, 0.15, 0.26, 0.4].forEach((w, i) => metal(o, t + w, 220 + i * 70, 0.18, 0.4)); },
      overload(o, t) { tone(o, t, 'sine', 300, 2400, 0.65, 0.2, 0.3); tone(o, t, 'sawtooth', 150, 1200, 0.65, 0.08, 0.3); },
      // a titan's footstep (28 Nov 2026): a soft thud through the floor and the clink of its armour settling
      footstep(o, t, k = 1) { boom(o, t, 0.32 * k, 0.45); metal(o, t + 0.03, 140 + Math.random() * 40, 0.05 * k, 0.35); hiss(o, t, 0.25, 260, 0.8, 0.12 * k, 'lowpass', 0.004, 70); },
      titanBoom(o, t) { boom(o, t, 1, 2.2); hiss(o, t, 2.4, 1600, 0.5, 0.55, 'lowpass', 0.005, 60); metal(o, t + 0.02, 50, 0.25, 2); hiss(o, t + 0.04, 0.5, 6000, 0.6, 0.25, 'highpass'); },
    };
  }
  // renders one titan sound offline through the same compressor settings as the effects bus, for the
  // loudness check in tests: { peak, rms } in dBFS
  async function renderTitan(name, arg, secs = 3) {
    const sr = 44100, c = new OfflineAudioContext(1, sr * secs, sr);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(c.destination);
    const g = c.createGain(); g.gain.value = (TLEVEL[name] || 0.7) * (/Charge$|Build$/.test(name) ? CHARGE_K : 1); g.connect(comp);
    tkit(c)[name](g, 0.01, arg);
    const d = (await c.startRendering()).getChannelData(0);
    let pk = 0, ss = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; ss += v * v; }
    const db = x => +(20 * Math.log10(Math.max(1e-6, x))).toFixed(1);
    return { peak: db(pk), rms: db(Math.sqrt(ss / d.length)) };
  }
  function stopCharge(fast) {
    if (!charging) return;
    try { const t = charging.g.context.currentTime; charging.g.gain.cancelScheduledValues(t); charging.g.gain.setValueAtTime(Math.max(0.0001, charging.g.gain.value), t); charging.g.gain.exponentialRampToValueAtTime(0.0001, t + (fast ? 0.05 : 0.15)); charging.nodes.forEach(n => { try { n.stop(t + 0.2); } catch (e) {} }); } catch (e) {}
    charging = null;
  }
  function titan(name, arg) {
    if (!on() || !A()) return;
    try {
      const { ac, bus } = A().out();
      tk ||= tkit(ac);
      if (!tk[name]) return;
      const g = ac.createGain(); g.gain.value = (TLEVEL[name] || 0.7) * (/Charge$|Build$/.test(name) ? CHARGE_K : 1); g.connect(bus);
      const t = ac.currentTime + 0.005;
      if (/Charge$|Build$/.test(name)) { stopCharge(true); charging = tk[name](g, t, arg); return; }
      if (!/^(titanRoar|materialize|assemble|rise|compile|charge|armourOff|overload|footstep)$/.test(name)) stopCharge();
      tk[name](g, t, arg);
    } catch (e) {}
  }
  const state = () => ({ track: cur ? cur.name : '', want, on: on() });
  return { music, sting, duck, quiet, stop, setOn, play, combat, unlock, state, titan, titanStop: () => stopCharge(), renderTitan, titanSounds: () => Object.keys(tkit(new OfflineAudioContext(1, 4410, 44100))), preload: n => load(n).catch(() => {}) };
})();
