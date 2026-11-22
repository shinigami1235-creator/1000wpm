// Boss Rush sound. Music: each boss's own track at three speeds, one per phase
// (audio/rush-<boss>-<phase>.mp3, made by tools/rush/music.py), crossfaded at a phase
// change. The World Boss victory sting (audio/wb-win.mp3) plays between bosses. Effects come from js/app/boss-audio.js and the combat module's own sounds,
// all on the World Boss's audio context.
//   RushAudio.music(name)   loop a track, crossfading from the one before
//   RushAudio.sting()       the stinger between bosses, with the music ducked under it
//   RushAudio.duck(level, secs)  RushAudio.quiet(on)  RushAudio.stop()  RushAudio.setOn(on)
//   RushAudio.play(name, arg)    a World Boss effect (windup, blockOk, roar...)
//   RushAudio.combat()           Combat.Audio for the tier shots and spells
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
  const state = () => ({ track: cur ? cur.name : '', want, on: on() });
  return { music, sting, duck, quiet, stop, setOn, play, combat, unlock, state, preload: n => load(n).catch(() => {}) };
})();
