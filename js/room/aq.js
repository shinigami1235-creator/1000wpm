// AdaptiveQuality: keeps a three.js (or any canvas) game smooth on whatever device opens it.
// Pattern taken from Noniv/abyssal-garden (MIT), rebuilt and tested for Gid's games, 27 Nov 2026.
//
//   - a first visit starts on a level guessed from the device: phones and small-memory machines lower
//   - a load that crashes the tab or loses the GPU starts one level lower on the next visit
//   - while playing, it lowers the resolution first and then the detail (draw distance, instance
//     counts) in small steps until frames fit the budget, and raises them again only after frames
//     have been fast for a while, so it doesn't flip back and forth
//   - it can tune behind the start menu (warm()), so the game is already smooth when play starts
//   - level, resolution and detail are remembered for the next visit, and a device still far too
//     slow at the lowest resolution and detail starts the next visit one level lower
//
//   const aq = AdaptiveQuality.create({
//     key: 'stormtyper',                  // localStorage key prefix, one per game
//     levels: ['high', 'medium', 'low'],  // best first
//     fps: 60,                            // the budget is 1000 / fps ms a frame
//     minScale: 0.5, minDetail: 0.5,      // the floors for resolution scale and detail
//     onScale: s => renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * s),
//     onDetail: d => { camera.far = 400 * d; camera.updateProjectionMatrix(); mesh.count = Math.round(N * d); },
//   });
//   aq.level            // the level name to build with ('high', 'medium', 'low')
//   aq.loading()        // call before the heavy build; aq.loaded() after the first frame renders
//   aq.frame(nowMs)     // every frame, with the requestAnimationFrame time
//   aq.warm(true/false) // faster tuning while a menu covers the scene
//   aq.watch(canvas)    // a lost WebGL context counts as a crash: next visit one level lower
//   aq.state()          // { level, next, scale, detail, ms, budget } for a debug HUD
(function (root) {
  function create(o = {}) {
    const key = o.key || 'game', levels = o.levels || ['high', 'medium', 'low'];
    const budget = 1000 / (o.fps || 60), minScale = o.minScale ?? 0.5, minDetail = o.minDetail ?? 0.5;
    const nav = o.navigator || root.navigator || {}, store = o.storage || safeStore(root);
    const mm = o.matchMedia || (root.matchMedia ? q => root.matchMedia(q) : () => ({ matches: false }));
    const get = k => { try { return store.getItem(key + k); } catch { return null; } };
    const set = (k, v) => { try { v === null ? store.removeItem(key + k) : store.setItem(key + k, v); } catch {} };

    // ---- the starting level ----
    const saved = (get('.q') || '').split(',');
    let li = saved[0] !== '' && levels[+saved[0]] !== undefined ? +saved[0] : guess();
    let scale = clamp(+saved[1] || 1, minScale, 1), detail = clamp(+saved[2] || 1, minDetail, 1);
    if (get('.loading')) {                     // the last load never finished: crashed tab or lost GPU
      li = Math.min(levels.length - 1, li + 1); scale = 1; detail = 1; set('.loading', null);
    }
    let stuck = 0;
    function guess() {
      const phone = mm('(pointer: coarse)').matches, mem = nav.deviceMemory, cores = nav.hardwareConcurrency || 4;
      // deviceMemory is missing in Safari and Firefox, and Chrome caps it at 8
      const small = mem !== undefined ? mem <= 4 : cores <= 4;
      if (phone) return Math.min(levels.length - 1, mem !== undefined && mem >= 8 ? 1 : 2);
      return small ? Math.min(levels.length - 1, 2) : 0;
    }
    let next = li;   // the level the next visit starts on
    const save = () => set('.q', `${next},${scale.toFixed(2)},${detail.toFixed(2)}`);
    save();

    // ---- the governor ----
    let last = 0, win = [], slow = 0, fast = 0, settleUntil = 0, warmOn = false, ms = 0, longRun = 0;
    const doc = o.document || root.document;
    // a hidden tab stops frames; the first frame back is not a slow frame
    // dispose() removes it: left on the document it keeps the whole scene alive after the page closes (28 Nov 2026 lag check)
    const onVis = () => { last = 0; win = []; };
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
    function frame(now) {
      let dt = last ? now - last : 0; last = now;
      if (!dt || now < settleUntil) return;                  // first frame, or just changed
      if (dt > 250) {
        // one long frame is a hitch (a tab switch, a GC pause) and is skipped; a run of them is a device
        // that really is that slow, and those count, capped at 1 s each
        if (++longRun < 2) return;
        dt = Math.min(dt, 1000);
      } else longRun = 0;
      win.push(dt);
      const span = warmOn ? 500 : 1000;
      if (win.reduce((a, b) => a + b, 0) < span) return;
      // the 75th percentile of the window: steadier than the mean, and it still sees regular hitches
      const s = win.slice().sort((a, b) => a - b); ms = s[Math.floor(s.length * 0.75)]; win = [];
      if (ms > budget * 1.15) { slow++; fast = 0; } else if (ms < budget * 0.7) { fast++; slow = 0; } else { slow = 0; fast = 0; }
      if (slow >= (warmOn ? 1 : 2)) { slow = 0; if (!down(now) && ms > budget * 1.5 && ++stuck >= 10 && next === li && li < levels.length - 1) {
        // at both floors and still far too slow: the next visit builds the lighter level
        next = li + 1; scale = 1; detail = 1; save(); scale = minScale; detail = minDetail;
      } }
      else if (fast >= 5) { fast = 0; up(now); }
    }
    function down(now) {
      if (scale > minScale + 1e-3) { scale = Math.max(minScale, +(scale * 0.85).toFixed(3)); o.onScale && o.onScale(scale); }
      else if (detail > minDetail + 1e-3) { detail = Math.max(minDetail, +(detail - 0.15).toFixed(3)); o.onDetail && o.onDetail(detail); }
      else return false;
      settleUntil = now + 600; save(); return true;
    }
    function up(now) {
      // detail comes back before resolution, the reverse of the way down
      if (detail < 1 - 1e-3) { detail = Math.min(1, +(detail + 0.15).toFixed(3)); o.onDetail && o.onDetail(detail); }
      else if (scale < 1 - 1e-3) { scale = Math.min(1, +(scale / 0.85).toFixed(3)); o.onScale && o.onScale(scale); }
      else return;
      settleUntil = now + 600; save();
    }

    const aq = {
      get level() { return levels[li]; }, get index() { return li; },
      get scale() { return scale; }, get detail() { return detail; },
      loading() { set('.loading', '1'); },
      loaded() { set('.loading', null); },
      frame,
      warm(on) { warmOn = !!on; win = []; slow = fast = 0; },
      watch(canvas) {
        canvas.addEventListener('webglcontextlost', () => { next = Math.min(levels.length - 1, li + 1); scale = 1; detail = 1; save(); });
      },
      // a level picked in a settings menu: rebuild or reload after this
      setLevel(i) { li = next = clamp(i, 0, levels.length - 1); scale = 1; detail = 1; save(); },
      state: () => ({ level: levels[li], next: levels[next], scale, detail, ms: +ms.toFixed(1), budget: +budget.toFixed(1) }),
      apply() { o.onScale && o.onScale(scale); o.onDetail && o.onDetail(detail); },
      dispose() { if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis); },
    };
    return aq;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function safeStore(r) { try { return r.localStorage; } catch { return null; } }
  root.AdaptiveQuality = { create };
  if (typeof module !== 'undefined') module.exports = root.AdaptiveQuality;
})(typeof window !== 'undefined' ? window : globalThis);
