// Arena sounds for the Duel and Party fights, made in code with Web Audio, with the recorded
// impacts from SfxBank (js/app/combat/bank.js) layered in once they've loaded.
// It follows the site's sound switch (TT.soundOn and the 'wpm-sound' event).
//
//   const snd = ArenaAudio.create({ ctx, out, on })   ctx/out/on: functions; leave them out for its own context
//   snd.play(name, arg)     one effect, names below
//   snd.combat(name, arg)   a Combat.Audio sound (shot1 to shot4, tierUp, break, a spell id) on the same bus
//   snd.crowd(on, level)    the crowd bed under a duel; snd.swell(k) lifts it for a moment
//   snd.stop()              silence the bed and let effects ring out
//
// Effects: whoosh (power 0..1), jab, heavy, block, guard, stagger, knock (a body hitting the floor),
// ko, getup, step, charge (seconds), release, bell, tick, go, cheer (0..1), ooh, gasp, fanfare, lose,
// bossCharge (seconds), bossSlam, bossLunge, bossRoar, spit, whip, quake, beam, sever, shatter, teamHit,
// unitCast, heal, shield, revive, reveal
window.ArenaAudio = (() => {
  // level per effect, set by ear against the combat sounds so hits sit under the shots and the big
  // moments (KO, slam, kill) reach the top without clipping the compressor
  const LEVEL = {
    whoosh: 0.55, jab: 0.8, heavy: 0.85, block: 0.7, guard: 0.5, stagger: 0.7, knock: 0.9, ko: 0.8, getup: 0.45, step: 0.5,
    charge: 0.42, release: 0.6, bell: 0.55, tick: 0.35, go: 0.5, cheer: 0.5, ooh: 0.42, gasp: 0.4, fanfare: 0.42, lose: 0.45,
    bossCharge: 0.4, bossSlam: 0.9, bossLunge: 0.5, bossRoar: 0.55, spit: 0.5, whip: 0.55, quake: 0.7, beam: 0.5, sever: 0.75,
    shatter: 0.7, teamHit: 0.6, unitCast: 0.45, heal: 0.45, shield: 0.45, revive: 0.5, reveal: 0.6,
  };
  const GAP = { whoosh: 45, jab: 30, step: 80, tick: 60, ooh: 900, gasp: 900, cheer: 600, teamHit: 60, unitCast: 70 };

  function kit(c, bus) {
    const nb = {};
    function noise(len) {
      const k = Math.ceil(len * 10) / 10;
      if (!nb[k]) {
        const b = c.createBuffer(1, Math.ceil(c.sampleRate * k), c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        nb[k] = b;
      }
      const s = c.createBufferSource(); s.buffer = nb[k]; return s;
    }
    let out = bus;
    const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
    function tone(t, type, f0, f1, len, vol, a = 0.004, dest) {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len);
      o.connect(g).connect(dest || out); o.start(t); o.stop(t + a + len + 0.05);
      return o;
    }
    function hiss(t, len, f0, q, vol, type = 'bandpass', a = 0.003, f1, dest) {
      const n = noise(len + a + 0.05);
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + len);
      const g = c.createGain(); env(g, t, a, vol, len);
      n.connect(f).connect(g).connect(dest || out); n.start(t); n.stop(t + a + len + 0.06);
    }
    // a short room so hits land in a space instead of a void: two damped feedback echoes
    let room = null;
    function verb() {
      if (room) return room;
      const inp = c.createGain(); inp.gain.value = 1;
      const mk = (dt, fb) => { const d = c.createDelay(0.5); d.delayTime.value = dt; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; const g = c.createGain(); g.gain.value = fb; inp.connect(d); d.connect(f).connect(g).connect(d); g.connect(bus); };
      mk(0.071, 0.42); mk(0.113, 0.38); mk(0.167, 0.3);
      room = inp; return room;
    }
    // a crowd voice: detuned saws through two vowel formants
    function voices(t, len, f, vowel, vol, a = 0.08) {
      const F = { oh: [520, 880], ah: [760, 1180], ee: [330, 2300] }[vowel] || [600, 1000];
      const g = c.createGain(); env(g, t, a, vol, len);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = F[0]; f1.Q.value = 5;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = F[1]; f2.Q.value = 6;
      f1.connect(g); f2.connect(g); g.connect(out);
      for (let i = 0; i < 7; i++) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const fr = f * (0.85 + Math.random() * 0.4);
        o.frequency.setValueAtTime(fr, t); o.frequency.linearRampToValueAtTime(fr * (vowel === 'oh' ? 0.82 : 1.06), t + a + len);
        o.detune.value = (Math.random() - 0.5) * 40;
        o.connect(f1); o.connect(f2); o.start(t); o.stop(t + a + len + 0.1);
      }
    }
    const R = (a, b) => a + Math.random() * (b - a);
    const S = {
      whoosh(t, p = 0.5) { const len = 0.16 + p * 0.18; hiss(t, len, 380 + p * 300, 1.1, 0.5 + p * 0.4, 'bandpass', len * 0.45, 2600 + p * 2200); hiss(t + len * 0.3, len * 0.6, 5000, 0.8, 0.12 * p, 'highpass'); },
      jab(t) { hiss(t, 0.05, 2400, 1, 0.5, 'bandpass', 0.001, 900); tone(t, 'sine', 180, 60, 0.12, 0.7, 0.002); tone(t, 'triangle', 620, 220, 0.05, 0.18, 0.001); },
      heavy(t) { tone(t, 'sine', 120, 34, 0.42, 0.95, 0.002); hiss(t, 0.28, 1600, 0.7, 0.6, 'lowpass', 0.002, 180); hiss(t, 0.05, 6000, 1, 0.3, 'highpass', 0.001); tone(t + 0.01, 'square', 90, 45, 0.12, 0.12, 0.001, verb()); },
      block(t) { [1180, 1730, 2410].forEach((f, i) => tone(t, 'triangle', f, f * 0.99, 0.5 - i * 0.1, 0.22 - i * 0.05, 0.001, verb())); hiss(t, 0.06, 4500, 1.5, 0.4, 'bandpass', 0.001); tone(t, 'sine', 160, 90, 0.12, 0.45); },
      guard(t) { hiss(t, 0.12, 900, 1.2, 0.28, 'bandpass', 0.02, 2600); tone(t + 0.02, 'sine', 520, 560, 0.18, 0.12, 0.01); },
      stagger(t) { tone(t, 'sine', 95, 40, 0.3, 0.8, 0.002); hiss(t, 0.2, 700, 0.9, 0.4, 'lowpass', 0.003, 150); S.step(t + 0.16); S.step(t + 0.3); },
      knock(t) { tone(t, 'sine', 80, 28, 0.6, 1, 0.002); hiss(t, 0.45, 900, 0.6, 0.7, 'lowpass', 0.002, 90); hiss(t + 0.02, 0.18, 3000, 0.9, 0.18, 'bandpass', 0.004, 900, verb()); tone(t + 0.22, 'sine', 70, 35, 0.25, 0.4, 0.002); },
      ko(t) { tone(t, 'sine', 70, 22, 1.6, 0.95, 0.003); hiss(t, 1.4, 1800, 0.5, 0.7, 'lowpass', 0.004, 60); tone(t, 'sawtooth', 220, 55, 0.9, 0.12, 0.002, verb()); hiss(t + 0.04, 0.5, 7000, 0.7, 0.2, 'highpass', 0.002); },
      getup(t) { hiss(t, 0.25, 1200, 0.8, 0.22, 'bandpass', 0.06, 2500); S.step(t + 0.32); S.step(t + 0.55); },
      step(t) { tone(t, 'sine', R(90, 120), 45, 0.08, 0.5, 0.002); hiss(t, 0.06, 1400, 1, 0.18, 'bandpass', 0.002, 500); },
      charge(t, secs = 0.8) { const o = tone(t, 'sawtooth', 160, 900, secs, 0.12, secs * 0.85); hiss(t, secs, 600, 3, 0.25, 'bandpass', secs * 0.85, 5200); tone(t, 'sine', 320, 1800, secs, 0.1, secs * 0.85); return o; },
      release(t) { hiss(t, 0.35, 5000, 0.8, 0.5, 'bandpass', 0.002, 400); tone(t, 'sine', 1400, 200, 0.3, 0.25, 0.002); tone(t, 'sine', 110, 40, 0.4, 0.6, 0.002); },
      bell(t) { [[523, 1], [1318, 0.55], [1975, 0.35], [2794, 0.22]].forEach(([f, k]) => tone(t, 'sine', f, f * 0.995, 2.2 * k + 0.4, 0.3 * k, 0.002, verb())); hiss(t, 0.03, 6000, 1, 0.2, 'highpass', 0.001); },
      tick(t) { tone(t, 'square', 880, 880, 0.07, 0.16, 0.002); tone(t, 'sine', 1760, 1760, 0.05, 0.08, 0.002); },
      go(t) { [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.015, 'sawtooth', f, f, 0.5, 0.06, 0.01)); hiss(t, 0.4, 2000, 0.6, 0.2, 'bandpass', 0.01, 6000); S.cheer(t + 0.05, 0.6); },
      cheer(t, k = 0.6) { const len = 1.1 + k * 1.2; hiss(t, len, 1300, 0.7, 0.5 * (0.5 + k), 'bandpass', 0.18, 900); hiss(t, len * 0.9, 2600, 1.2, 0.25 * (0.5 + k), 'bandpass', 0.2, 1800); voices(t, len * 0.8, 210, 'ah', 0.12 * (0.4 + k), 0.12); voices(t + 0.05, len * 0.7, 330, 'ee', 0.07 * (0.4 + k), 0.12); },
      ooh(t) { voices(t, 1.1, 190, 'oh', 0.22, 0.12); hiss(t, 0.9, 900, 0.9, 0.18, 'bandpass', 0.15, 600); },
      gasp(t) { voices(t, 0.55, 260, 'ah', 0.16, 0.04); hiss(t, 0.5, 2200, 0.8, 0.22, 'bandpass', 0.03, 1400); },
      fanfare(t) {
        const n = [523.25, 659.25, 783.99, 1046.5];
        n.forEach((f, i) => { const tt = t + i * 0.12; tone(tt, 'sawtooth', f, f, i === 3 ? 1.4 : 0.3, 0.09, 0.012); tone(tt, 'square', f / 2, f / 2, i === 3 ? 1.4 : 0.3, 0.04, 0.012); });
        [523.25, 659.25, 783.99].forEach(f => tone(t + 0.36, 'triangle', f, f, 1.6, 0.07, 0.03, verb()));
      },
      lose(t) { [392, 349.2, 311.1, 233.1].forEach((f, i) => tone(t + i * 0.22, 'triangle', f, f * 0.98, i === 3 ? 1.4 : 0.32, 0.13, 0.02, verb())); },
      bossCharge(t, secs = 2) { tone(t, 'sawtooth', 55, 110, secs, 0.2, secs * 0.9); hiss(t, secs, 200, 2, 0.35, 'bandpass', secs * 0.9, 1800); tone(t, 'sine', 110, 440, secs, 0.12, secs * 0.95); },
      bossSlam(t) { tone(t, 'sine', 60, 20, 1.2, 1, 0.002); hiss(t, 0.9, 1200, 0.5, 0.8, 'lowpass', 0.002, 60); tone(t, 'square', 140, 40, 0.3, 0.15, 0.001, verb()); hiss(t + 0.05, 0.4, 4000, 0.8, 0.25, 'bandpass', 0.003, 800, verb()); },
      bossLunge(t) { hiss(t, 0.35, 300, 0.9, 0.6, 'bandpass', 0.12, 1800); tone(t, 'sawtooth', 90, 60, 0.3, 0.12, 0.05); },
      bossRoar(t) { const o = tone(t, 'sawtooth', 110, 70, 1.3, 0.3, 0.12); const l = c.createOscillator(); l.frequency.value = 23; const lg = c.createGain(); lg.gain.value = 18; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + 1.5); hiss(t, 1.2, 500, 1.5, 0.4, 'bandpass', 0.1, 260); tone(t, 'sawtooth', 220, 150, 1.0, 0.08, 0.1, verb()); },
      spit(t) { hiss(t, 0.18, 2200, 2, 0.45, 'bandpass', 0.004, 700); tone(t, 'square', 700, 180, 0.12, 0.1, 0.002); },
      whip(t) { hiss(t, 0.12, 1500, 1.2, 0.5, 'bandpass', 0.05, 7000); hiss(t + 0.12, 0.05, 6000, 1, 0.6, 'highpass', 0.001); tone(t + 0.12, 'triangle', 2400, 800, 0.06, 0.15, 0.001); },
      quake(t) { tone(t, 'sine', 48, 26, 1.0, 0.9, 0.01); hiss(t, 1.0, 300, 0.6, 0.6, 'lowpass', 0.02, 60); for (let i = 0; i < 5; i++) hiss(t + 0.1 + i * 0.11, 0.08, R(600, 1600), 2, 0.18, 'bandpass', 0.002); },
      beam(t) { tone(t, 'sawtooth', 300, 600, 0.45, 0.12, 0.05); hiss(t, 0.45, 3000, 4, 0.3, 'bandpass', 0.05, 1500); tone(t, 'sine', 1200, 1250, 0.45, 0.08, 0.05); },
      sever(t) { hiss(t, 0.25, 900, 0.8, 0.6, 'bandpass', 0.01, 9000); tone(t, 'sine', 90, 30, 0.6, 0.9, 0.002); tone(t + 0.01, 'square', 400, 60, 0.25, 0.12, 0.001, verb()); S.shatter(t + 0.04, 0.6); },
      shatter(t, k = 1) { for (let i = 0; i < 10; i++) tone(t + Math.random() * 0.25, 'triangle', R(1800, 5200), R(900, 2000), R(0.05, 0.2), 0.06 * k, 0.001); hiss(t, 0.4, 5000, 0.7, 0.35 * k, 'highpass', 0.002); },
      teamHit(t) { tone(t, 'sine', 150, 55, 0.18, 0.6, 0.002); hiss(t, 0.12, 1800, 0.9, 0.35, 'bandpass', 0.002, 400); },
      unitCast(t) { tone(t, 'sine', 660, 1320, 0.18, 0.1, 0.01); hiss(t, 0.16, 3000, 3, 0.18, 'bandpass', 0.01, 6000); },
      heal(t) { [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.06, 'sine', f, f, 0.4, 0.08, 0.01, verb())); },
      shield(t) { tone(t, 'triangle', 440, 880, 0.25, 0.12, 0.02); [1320, 1760].forEach(f => tone(t + 0.05, 'sine', f, f, 0.5, 0.06, 0.005, verb())); },
      revive(t) { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.5, 0.08, 0.01, verb())); hiss(t, 0.5, 2000, 0.8, 0.15, 'bandpass', 0.2, 7000); },
      reveal(t) { tone(t, 'sawtooth', 55, 55, 1.6, 0.18, 0.3); tone(t, 'sawtooth', 82.4, 82.4, 1.6, 0.1, 0.35); hiss(t, 1.4, 400, 1, 0.3, 'bandpass', 0.6, 2400); tone(t + 1.0, 'sine', 70, 30, 0.8, 0.7, 0.003); },
    };
    return { S, to(name) { const g = c.createGain(); g.gain.value = LEVEL[name] || 0.5; g.connect(bus); out = g; } };
  }

  // the recorded layers under some effects, from SfxBank's own recipes
  const BANK = { jab: ['hit'], heavy: ['crit'], block: ['blockOk'], stagger: ['stagger'], knock: ['stomp'], ko: ['defeat'], bossSlam: ['impact'], sever: ['crit'], teamHit: ['projHit'], shatter: ['shieldBreak'], quake: ['stomp'] };

  function create(o = {}) {
    let own = null, bus = null, k = null, kc = null, cSnd = null, bed = null;
    let on = true;
    try { on = TT.soundOn(); } catch (e) {}
    const onSound = e => { on = !!(e.detail && e.detail.on); if (!on) crowd(false); else if (bed && bed.want) crowd(true, bed.level); };
    addEventListener('wpm-sound', onSound);
    const isOn = () => (o.on ? o.on() : on);
    function ctx() {
      if (o.ctx) { const c = o.ctx(); return c; }
      if (!own) {
        own = new (window.AudioContext || window.webkitAudioContext)();
        const comp = own.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
        const master = own.createGain(); master.gain.value = 0.9;
        comp.connect(master).connect(own.destination);
        bus = own.createGain(); bus.connect(comp);
      }
      if (own.state === 'suspended') own.resume().catch(() => {});
      return own;
    }
    const outOf = c => (o.out ? o.out() : bus);
    const last = {};
    function play(name, arg) {
      if (!isOn()) return;
      const n = performance.now();
      if (GAP[name] && n - (last[name] || 0) < GAP[name]) return;
      last[name] = n;
      try {
        const c = ctx(), out = outOf(c);
        if (!c || !out) return;
        if (!k || kc !== c) { k = kit(c, out); kc = c; }
        if (!k.S[name]) return;
        k.to(name);
        const t = c.currentTime + 0.005;
        k.S[name](t, arg);
        if (window.SfxBank && BANK[name]) for (const b of BANK[name]) SfxBank.play(c, out, b, t, arg);
      } catch (e) {}
    }
    function combat(name, arg) {
      if (!window.Combat || !Combat.Audio) return;
      cSnd ||= Combat.Audio.create({ ctx: () => ctx(), out: () => outOf(), on: isOn });
      cSnd.play(name, arg);
    }
    // the crowd under the arena: filtered noise with a slow swell, and murmur voices
    function crowd(want, level = 1) {
      bed ||= { want: false, level: 1, g: null, src: null };
      bed.want = want; bed.level = level;
      try {
        const c = ctx(); if (!c) return;
        if (want && isOn()) {
          if (!bed.g) {
            const len = 4, b = c.createBuffer(2, c.sampleRate * len, c.sampleRate);
            for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let y = 0; for (let i = 0; i < d.length; i++) { y = y * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = (Math.random() * 2 - 1) * 0.5 + y * 6; } }
            const src = c.createBufferSource(); src.buffer = b; src.loop = true;
            const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
            const g = c.createGain(); g.gain.value = 0.0001;
            const lfo = c.createOscillator(); lfo.frequency.value = 0.13; const lg = c.createGain(); lg.gain.value = 0.012; lfo.connect(lg).connect(g.gain);
            src.connect(f).connect(g).connect(outOf()); src.start(); lfo.start();
            bed.g = g; bed.src = src; bed.lfo = lfo; bed.f = f;
          }
          bed.g.gain.cancelScheduledValues(c.currentTime);
          bed.g.gain.setTargetAtTime(0.035 * level, c.currentTime, 0.6);
        } else if (bed.g) {
          const g = bed.g, src = bed.src, lfo = bed.lfo;
          g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(0.0001, c.currentTime, 0.25);
          setTimeout(() => { try { src.stop(); lfo.stop(); } catch (e) {} }, 1500);
          bed.g = null; bed.src = null;
        }
      } catch (e) {}
    }
    // lift the crowd for a moment (a big hit, a KO)
    function swell(k2 = 0.5) {
      if (!bed || !bed.g || !isOn()) return;
      try { const c = ctx(), g = bed.g.gain, t = c.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(0.035 * bed.level * (1 + k2 * 2.5), t, 0.08); g.setTargetAtTime(0.035 * bed.level, t + 0.5 + k2, 0.8); bed.f.frequency.setTargetAtTime(700 + k2 * 600, t, 0.1); bed.f.frequency.setTargetAtTime(700, t + 0.6, 0.8); } catch (e) {}
    }
    function stop() { crowd(false); }
    function dispose() { stop(); removeEventListener('wpm-sound', onSound); if (own) setTimeout(() => { try { own.close(); } catch (e) {} }, 1800); own = null; }
    return { play, combat, crowd, swell, stop, dispose, ctx };
  }
  return { create, LEVEL };
})();
