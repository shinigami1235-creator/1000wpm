// Breach sound: looping music tracks and sound effects made in code.
// Music files sit in audio/ at the site root, found through window.BREACH_BASE.
window.BreachAudio = (() => {
  let ac = null, master = null, musicGain = null, sfxGain = null;
  const LOOPS = { menu: 40, stage1: 61.935, stage2: 60, stage3: 58.182, stage4: 56.471, stage5: 54.857, boss: 51.892, ending: 36.923 };
  const buffers = {};
  let current = null, currentName = '', fallback = null;
  let musicVol = 0.55;

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = musicVol; musicGain.connect(master);
      sfxGain = ac.createGain(); sfxGain.gain.value = 0.8;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      sfxGain.connect(comp).connect(master);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const on = () => TT.soundOn();
  const url = name => (window.BREACH_BASE || '') + `audio/${name}.mp3`;

  // ---------- music ----------
  async function load(name) {
    if (buffers[name]) return buffers[name];
    const res = await fetch(url(name));
    if (!res.ok) throw new Error(name);
    buffers[name] = await ctx().decodeAudioData(await res.arrayBuffer());
    return buffers[name];
  }
  async function music(name) {
    if (name === currentName) return;
    stopMusic(0.6);
    if (!name || !on()) return;
    currentName = name;
    try {
      const buf = await load(name);
      if (currentName !== name) return;
      const src = ctx().createBufferSource();
      src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = Math.min(LOOPS[name], buf.duration);
      const g = ac.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(1, ac.currentTime + 0.8);
      src.connect(g).connect(musicGain); src.start();
      current = { src, g };
    } catch (e) {
      // file:// pages cannot fetch, so play through an audio element
      fallback = new Audio(url(name));
      fallback.loop = true; fallback.volume = musicVol;
      fallback.play().catch(() => {});
    }
  }
  function stopMusic(fade = 0.4) {
    if (current && ac) {
      const { src, g } = current;
      g.gain.setValueAtTime(g.gain.value, ac.currentTime);
      g.gain.linearRampToValueAtTime(0, ac.currentTime + fade);
      src.stop(ac.currentTime + fade + 0.05);
      current = null;
    }
    if (fallback) { fallback.pause(); fallback = null; }
    currentName = '';
  }
  function duck(v) {
    if (musicGain) musicGain.gain.setTargetAtTime(musicVol * v, ac.currentTime, 0.08);
    if (fallback) fallback.volume = musicVol * v;
  }

  // ---------- sound effects ----------
  function noise(len) {
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; return s;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(type, f0, f1, len, vol, when = 0) {
    const t = ac.currentTime + when;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
    const g = ac.createGain(); env(g, t, 0.004, vol, len);
    o.connect(g).connect(sfxGain); o.start(t); o.stop(t + len + 0.05);
  }
  function burst(len, freq, q, vol, type = 'bandpass', when = 0) {
    const t = ac.currentTime + when;
    const n = noise(len + 0.05);
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); env(g, t, 0.003, vol, len);
    n.connect(f).connect(g).connect(sfxGain); n.start(t); n.stop(t + len + 0.05);
  }
  const fx = {
    // each shot climbs a little in pitch with the combo, with a small random spread so a run never sounds like a machine
    shot(combo = 0) {
      const up = Math.pow(2, Math.min(12, combo % 24 / 2) / 12) * (0.96 + Math.random() * 0.08);
      burst(0.05, (2400 + Math.random() * 800) * up, 0.8, 0.42); tone('square', 900 * up, 180 * up, 0.05, 0.1); tone('sine', 220 * up, 90, 0.06, 0.12);
    },
    // a kill: a low thump, the crack and a glassy spray as the hologram breaks apart
    kill() {
      tone('sine', 140, 38, 0.28, 0.5); burst(0.22, 900, 0.6, 0.6, 'lowpass'); tone('sawtooth', 320, 50, 0.25, 0.2);
      burst(0.12, 4000, 1.5, 0.25, 'bandpass', 0.03);
      for (let i = 0; i < 4; i++) tone('triangle', 2400 + Math.random() * 2400, 1200 + Math.random() * 800, 0.06, 0.05, 0.03 + i * 0.03);
    },
    // an enemy shot leaving the muzzle
    enemyFire() { tone('sawtooth', 600, 160, 0.18, 0.18); burst(0.16, 1200, 1.2, 0.3, 'bandpass'); },
    miss() { tone('square', 140, 110, 0.12, 0.18); },
    hurt() { tone('sawtooth', 120, 40, 0.4, 0.5); burst(0.3, 300, 0.7, 0.6, 'lowpass'); },
    pickup() { [660, 880, 1320].forEach((f, i) => tone('triangle', f, f * 1.01, 0.12, 0.25, i * 0.06)); },
    power() { tone('sawtooth', 200, 1600, 0.35, 0.2); burst(0.4, 1200, 0.5, 0.3, 'highpass'); },
    bomb() { burst(0.9, 200, 0.4, 0.9, 'lowpass'); tone('sine', 90, 30, 0.8, 0.8); },
    block() { tone('triangle', 1200, 600, 0.15, 0.3); burst(0.08, 5000, 2, 0.3); },
    lock() { tone('sine', 1400, 1500, 0.04, 0.12); },
    throwHit() { burst(0.08, 3000, 1, 0.4); tone('square', 600, 1200, 0.06, 0.12); },
    roar() { burst(1.2, 220, 0.8, 0.8, 'lowpass'); tone('sawtooth', 70, 45, 1.2, 0.4); tone('sawtooth', 73, 44, 1.2, 0.3); },
    bossHit() { burst(0.3, 600, 0.5, 0.8, 'lowpass'); tone('square', 200, 60, 0.3, 0.3); },
    phase() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.1, 0.18, i * 0.07)); },
    wrongAnswer() { tone('sawtooth', 300, 80, 0.5, 0.35); },
    clear() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.16, 0.3, i * 0.1)); },
    blip() { tone('square', 1800, 1800, 0.015, 0.05); },
    select() { tone('triangle', 700, 1100, 0.08, 0.2); },
    warn() { [0, 0.16].forEach(w => tone('square', 880, 860, 0.1, 0.22, w)); tone('sawtooth', 110, 90, 0.4, 0.2); },
    repel() { tone('triangle', 400, 1800, 0.18, 0.35); burst(0.25, 3000, 0.8, 0.5, 'highpass'); tone('sine', 120, 60, 0.3, 0.5); },
    stun() { [1200, 900, 1200, 900].forEach((f, i) => tone('square', f, f * 0.98, 0.07, 0.14, i * 0.08)); },
    rush() { tone('square', 500 + Math.random() * 300, 1400, 0.07, 0.16); burst(0.08, 2500, 1, 0.35); },
    glitch() { for (let i = 0; i < 4; i++) tone('square', 200 + Math.random() * 2000, 100 + Math.random() * 2000, 0.03, 0.08, i * 0.025); },
    shieldBreak() { burst(0.5, 5000, 0.6, 0.6, 'highpass'); [1600, 1200, 800, 400].forEach((f, i) => tone('triangle', f, f / 2, 0.12, 0.2, i * 0.05)); },
    door() { tone('sawtooth', 90, 60, 0.6, 0.35); burst(0.5, 400, 0.5, 0.5, 'lowpass'); },
    danger() { tone('square', 1320, 1320, 0.06, 0.13); tone('square', 990, 990, 0.08, 0.13, 0.08); },
    access() { [660, 990, 1320].forEach((f, i) => tone('square', f, f, 0.07, 0.16, i * 0.06)); },
  };
  function play(name, arg) {
    if (!on()) return;
    try { ctx(); fx[name] && fx[name](arg); } catch (e) {}
  }

  return { music, stopMusic, duck, play, unlock: () => { try { ctx(); } catch (e) {} } };
})();
