// FaceoffHud: the World Boss beam face-off's overlay on the arena (boss-rules.js FACEOFF, boss.js).
// A title card as the boss breaks off, then a tug-of-war meter across the top of the arena: the raid's power
// in cyan from the left, the boss's in red from the right, the meeting point between them where the beams
// will meet, the numbers, and one line saying what to type. The resistance words themselves are in your
// word line, in cyan and labelled RESIST, so they're typed with the same keys and the same line as the raid.
// The meter stays at the top of the arena and the card clears before the typing starts, so neither covers
// the word line, the HP bar or the prompt.
//   const hud = FaceoffHud.create(stageEl)
//   hud.show()                          the title card
//   hud.update({ phase, u, power, need, you, raiders })   each frame; power and need in resistance words
//   hud.result(win, { dmg, margin })    the result line
//   hud.hide() / hud.dispose()
window.FaceoffHud = (() => {
  const CSS = `
  .wb-fo { position: absolute; inset: 0; pointer-events: none; z-index: 6; font-family: var(--f-head); }
  .wb-fo[hidden] { display: none; }
  .wb-fo-card { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); text-align: center; opacity: 0; }
  .wb-fo-card b { display: block; font: 800 clamp(30px, 5.2vw, 64px)/1 var(--f-label, var(--f-head)); letter-spacing: .14em; color: #e9fcff;
    text-shadow: 0 0 18px rgba(62,230,255,.85), 0 0 2px #fff, 0 2px 0 #000; }
  .wb-fo-card small { display: block; margin-top: 10px; font: 600 clamp(12px, 1.2vw, 15px)/1.2 var(--f-mono); letter-spacing: .08em; color: #ff8a95; text-shadow: 0 1px 2px #000; }
  .wb-fo-card.in { animation: wbfoIn 1.5s cubic-bezier(.2,.9,.2,1) forwards; }
  @keyframes wbfoIn { 0% { opacity: 0; transform: translate(-50%, -50%) scale(1.35); filter: blur(6px); } 14% { opacity: 1; transform: translate(-50%, -50%) scale(1); filter: none; }
    78% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -78%) scale(.92); } }
  .wb-fo-bar { position: absolute; left: 50%; top: 10px; width: min(560px, 56%); transform: translateX(-50%); opacity: 0; transition: opacity .25s; }
  .wb-fo-bar.on { opacity: 1; }
  .wb-fo-head { display: flex; justify-content: space-between; align-items: baseline; font: 700 12px/1 var(--f-mono); letter-spacing: .08em; margin-bottom: 5px; text-shadow: 0 1px 2px #000; }
  .wb-fo-head .t { color: #7cf0ff; } .wb-fo-head .b { color: #ff7a85; } .wb-fo-head .m { color: #e9fcff; font-weight: 800; letter-spacing: .16em; }
  .wb-fo-track { position: relative; height: 14px; background: rgba(6,10,14,.82); box-shadow: 0 0 0 1px rgba(255,255,255,.14), 0 4px 14px rgba(0,0,0,.6); overflow: hidden; }
  .wb-fo-track i { position: absolute; top: 0; bottom: 0; }
  .wb-fo-track .tf { left: 0; background: linear-gradient(90deg, #0f6f86, #3ee6ff); box-shadow: 0 0 12px #3ee6ff; }
  .wb-fo-track .bf { right: 0; background: linear-gradient(270deg, #7e1622, #ff4d5e); box-shadow: 0 0 12px #ff4d5e; }
  .wb-fo-track .pt { width: 4px; margin-left: -2px; background: #fff; box-shadow: 0 0 10px #fff, 0 0 22px #bff6ff; }
  .wb-fo-track .need { width: 2px; margin-left: -1px; background: rgba(255,255,255,.55); }
  .wb-fo-sub { margin-top: 5px; text-align: center; font: 500 12px/1.2 var(--f-mono); color: #cfeff4; text-shadow: 0 1px 2px #000; }
  .wb-fo-sub em { font-style: normal; color: #7cf0ff; font-weight: 700; }
  .wb-fo-res { position: absolute; left: 50%; top: 64%; transform: translate(-50%, -50%); font: 800 clamp(22px, 3.4vw, 42px)/1 var(--f-label, var(--f-head)); letter-spacing: .12em;
    opacity: 0; text-align: center; white-space: nowrap; }
  .wb-fo-res small { display: block; margin-top: 8px; font: 600 clamp(12px, 1.2vw, 15px)/1.2 var(--f-mono); letter-spacing: .04em; }
  .wb-fo-res.win { color: #dffbff; text-shadow: 0 0 16px #3ee6ff, 0 2px 0 #000; } .wb-fo-res.win small { color: #7cf0ff; }
  .wb-fo-res.lose { color: #ffe2e5; text-shadow: 0 0 16px #ff4d5e, 0 2px 0 #000; } .wb-fo-res.lose small { color: #ff9aa3; }
  .wb-fo-res.in { animation: wbfoRes 2s ease-out forwards; }
  @keyframes wbfoRes { 0% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
  .t-resist.fw, .fw.t-resist { --kc: #5ce8ff; text-shadow: 0 0 10px rgba(62,230,255,.55); }
  @media (prefers-reduced-motion: reduce) { .wb-fo-card.in, .wb-fo-res.in { animation-duration: .01s; opacity: 1; } }
  `;
  let styled = false;
  function create(stage) {
    if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
    const el = document.createElement('div'); el.className = 'wb-fo'; el.hidden = true; el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<div class="wb-fo-card"><b>BEAM CLASH</b><small>Syntax Error is charging its cannon</small></div>
      <div class="wb-fo-bar"><div class="wb-fo-head"><span class="t">RAID <span data-v="tp">0</span></span><span class="m" data-v="mid">CHARGE</span><span class="b">SYNTAX ERROR <span data-v="bp">0</span></span></div>
        <div class="wb-fo-track"><i class="tf"></i><i class="bf"></i><i class="need" style="left:50%"></i><i class="pt"></i></div>
        <div class="wb-fo-sub" data-v="sub"></div></div>
      <div class="wb-fo-res"></div>`;
    stage.appendChild(el);
    const $ = s => el.querySelector(s), card = $('.wb-fo-card'), bar = $('.wb-fo-bar'), tf = $('.tf'), bf = $('.bf'), pt = $('.pt'), res = $('.wb-fo-res');
    const tp = $('[data-v=tp]'), bp = $('[data-v=bp]'), mid = $('[data-v=mid]'), sub = $('[data-v=sub]');
    let shown = 0, last = '';
    function show() { el.hidden = false; card.classList.remove('in'); void card.offsetWidth; card.classList.add('in'); res.classList.remove('in'); res.className = 'wb-fo-res'; bar.classList.remove('on'); }
    // the meeting point: half way at an even fight, toward the boss as the raid gets ahead
    function update(o) {
      if (el.hidden) return;
      const on = o.phase === 'charge' || o.phase === 'clash';
      bar.classList.toggle('on', on || (o.phase === 'resolve' && o.u < 0.6));
      if (!on && o.phase !== 'resolve') return;
      const r = o.need > 0 ? o.power / o.need : 0, p = Math.max(0.04, Math.min(0.96, 0.5 + 0.42 * Math.tanh((r - 1) * 2.4)));
      const show = o.phase === 'charge' ? Math.min(1, 0.25 + o.u * 0.75) : 1;   // the boss's side fills as it charges
      const tw = (o.phase === 'charge' ? Math.min(0.5, r * 0.5) : p) * 100, bw = (o.phase === 'charge' ? 0.5 * show : 1 - p) * 100;
      tf.style.width = tw.toFixed(1) + '%'; bf.style.width = bw.toFixed(1) + '%';
      pt.style.left = (o.phase === 'charge' ? 50 : p * 100).toFixed(1) + '%'; pt.style.opacity = o.phase === 'charge' ? 0 : 1;
      tp.textContent = Math.round(o.power); bp.textContent = Math.round(o.need * (o.phase === 'charge' ? show : 1));
      mid.textContent = o.phase === 'charge' ? `CHARGE ${Math.max(0, Math.ceil(o.left || 0))}s` : o.phase === 'clash' ? 'HOLD IT' : '';
      const s = o.phase === 'charge' ? `Type the <em>cyan</em> words. Each one powers the raid's beam. ${o.you ? `You: ${o.you}` : ''}`
        : o.phase === 'clash' ? `Keep typing. ${o.raiders ? o.raiders + ' raiders on it' : ''}` : '';
      if (s !== last) { sub.innerHTML = s; last = s; }
    }
    function result(win, x = {}) {
      res.className = 'wb-fo-res ' + (win ? 'win' : 'lose');
      res.innerHTML = win ? `BEAM BROKEN<small>Its own shot thrown back: ${(x.dmg || 0).toLocaleString()} damage, kernel open</small>`
        : `OVERPOWERED<small>The raid's beam gave way: everyone takes a hit</small>`;
      void res.offsetWidth; res.classList.add('in');
    }
    function hide() { el.hidden = true; }
    function dispose() { el.remove(); }
    return { show, update, result, hide, dispose, el };
  }
  return { create };
})();
