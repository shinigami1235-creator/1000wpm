// Recorded combat sounds: lasers, explosions and impacts from audio/sfx/*.mp3 (built by
// tools/sfx/bank.py from Kenney's CC0 Sci-Fi Sounds and Earshot renders). Once they've loaded,
// the combat sounds (js/app/combat/sfx.js) and the boss sounds (js/app/boss-audio.js) play these
// recipes in place of their synthesised versions; until then the synth plays.
//   SfxBank.load()                        fetch and decode every file once (no audio context needed)
//   SfxBank.play(ac, out, name, t, arg)   true when it played, false when the synth should
//   SfxBank.has(name)  SfxBank.ready()  SfxBank.render(name, arg, secs) -> samples, for loudness checks
window.SfxBank = (() => {
  const SETS = { pew: 5, laser: 5, crunch: 4, boom: 2, blast: 2, thud: 5, field: 3, clang: 1, glitch: 1 };
  // name: layers of [set, gain, [lowest rate, highest rate], delay in seconds]. A rate under 1 plays
  // the take lower and longer. Gains were set from loudness renders against the synth versions.
  const R = {
    // your shots, one per combo tier: a small pew, then a heavier laser, then laser plus explosion
    shot1: [['pew', 0.82, [1.0, 1.15]]],
    shot2: [['pew', 0.71, [0.82, 0.92]], ['laser', 0.34, [1.25, 1.4]]],
    shot3: [['laser', 0.57, [0.95, 1.08]], ['thud', 0.62, [0.9, 1.1], 0.02]],
    shot4: [['laser', 0.47, [0.78, 0.88]], ['crunch', 0.34, [0.9, 1.05], 0.04], ['boom', 0.47, [1.0, 1.1], 0.03]],
    // spell hits
    crack: [['thud', 1.01, [1.0, 1.2]], ['pew', 0.37, [0.7, 0.8]]],
    zap: [['laser', 0.41, [1.4, 1.6]], ['crunch', 0.28, [1.2, 1.4]]],
    boom: [['blast', 0.66, [0.95, 1.05]], ['boom', 0.76, [1, 1]]],
    crash: [['crunch', 0.67, [0.9, 1.0]], ['thud', 0.73, [0.8, 0.9]]],
    tick: [['pew', 0.38, [1.5, 1.9]]],
    blip: [['pew', 0.7, [1.3, 1.6]]],
    ultimate: [['blast', 0.59, [0.8, 0.85]], ['boom', 0.66, [0.9, 0.9]], ['laser', 0.3, [0.6, 0.65]]],
    break: [['glitch', 0.61, [0.8, 0.9]], ['thud', 0.55, [0.7, 0.8]]],
    // the boss and the raid
    hit: [['thud', 1.34, [0.95, 1.2]]],
    crit: [['crunch', 0.72, [1.0, 1.1]], ['thud', 0.8, [0.8, 0.9]]],
    weak: [['clang', 0.62, [1.1, 1.2]], ['thud', 0.55, [0.9, 1.0]]],
    raid: [['pew', 0.22, [1.3, 1.9]]],
    shieldHit: [['field', 0.24, [1.4, 1.7]]],
    shieldBreak: [['glitch', 0.47, [0.8, 0.8]], ['crunch', 0.47, [0.8, 0.9]], ['clang', 0.39, [0.7, 0.7]]],
    blockOk: [['field', 0.53, [1.1, 1.2]], ['clang', 0.37, [1.3, 1.4]]],
    blockFail: [['crunch', 0.54, [0.75, 0.85]], ['boom', 0.63, [1.1, 1.2]]],
    impact: [['blast', 0.45, [0.85, 0.95]], ['boom', 0.51, [0.9, 1.0]]],
    launch: [['laser', 0.3, [0.6, 0.7]]],
    returned: [['laser', 0.83, [1.15, 1.25]], ['pew', 0.55, [0.9, 1.0]]],
    projHit: [['crunch', 0.47, [1.0, 1.1]], ['thud', 0.37, [1.0, 1.1]]],
    addSpawn: [['glitch', 0.55, [0.7, 0.8]], ['laser', 0.39, [0.5, 0.55]]],
    addKill: [['pew', 0.58, [0.9, 1.0]], ['crunch', 0.42, [1.3, 1.5], 0.03]],
    stagger: [['clang', 0.58, [0.8, 0.85]], ['boom', 0.63, [1.2, 1.3]], ['thud', 0.52, [0.7, 0.75]]],
    weakOpen: [['clang', 0.3, [1.4, 1.5]], ['field', 0.19, [1.5, 1.6]]],
    defeat: [['blast', 0.78, [0.75, 0.75]], ['boom', 0.78, [0.85, 0.85]], ['crunch', 0.43, [0.7, 0.7], 0.15], ['blast', 0.54, [0.65, 0.65], 0.4]],
  };
  const buf = {}, last = {};
  let loading = null, done = false;
  const base = () => window.BREACH_BASE || '';

  function load() {
    if (loading) return loading;
    let dc;
    try { dc = new OfflineAudioContext(1, 1, 44100); } catch (e) { return (loading = Promise.resolve(false)); }
    const jobs = [];
    for (const [set, n] of Object.entries(SETS)) {
      buf[set] = [];
      for (let i = 1; i <= n; i++) {
        jobs.push(fetch(`${base()}audio/sfx/${set}-${i}.mp3`).then(r => { if (!r.ok) throw new Error(set); return r.arrayBuffer(); })
          .then(b => dc.decodeAudioData(b)).then(a => { buf[set].push(a); }).catch(() => {}));
      }
    }
    loading = Promise.all(jobs).then(() => (done = Object.values(buf).every(l => l.length > 0)));
    return loading;
  }

  function play(ac, out, name, t, arg) {
    const r = R[name];
    if (!r) return false;
    if (!done) { load(); return false; }
    const soft = name === 'impact' && arg;
    const up = name === 'hit' && arg ? 1 + Math.min(0.25, arg * 0.008) : 1;
    for (const [set, g, [lo, hi], d = 0] of r) {
      const list = buf[set];
      let i = Math.floor(Math.random() * list.length);
      if (list.length > 1 && i === last[set]) i = (i + 1) % list.length;
      last[set] = i;
      const s = ac.createBufferSource();
      s.buffer = list[i];
      s.playbackRate.value = (lo + Math.random() * (hi - lo)) * up;
      const gn = ac.createGain();
      gn.gain.value = g * (soft ? 0.5 : 1);
      s.connect(gn).connect(out);
      s.start(t + d);
    }
    return true;
  }

  // renders one recipe through a compressor like the boss's effects bus, for tests
  async function render(name, arg, secs = 3) {
    await load();
    const sr = 44100, c = new OfflineAudioContext(1, sr * secs, sr);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(c.destination);
    play(c, comp, name, 0.01, arg);
    return Array.from((await c.startRendering()).getChannelData(0));
  }
  return { load, play, render, has: n => !!R[n], ready: () => done, NAMES: Object.keys(R) };
})();
