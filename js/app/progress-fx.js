// The visual bonuses from the sign-in streak. The caret trail and letter sparks hook into
// TT.TypeText so every typing box on the site gets them. The frame, the name colour and
// the boss hit colour are classes and colours on <html>. The room reads its light colour
// from Progress.bonus('roomlight') when it builds. With reduced motion the trail and
// sparks stay off.
(() => {
  if (!window.Progress || !window.TT) return;
  const P = window.Progress;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let trail = false, sparks = false;

  function apply() {
    if (!P.ready()) return;
    const on = id => P.bonus(id);
    trail = !!on('trail'); sparks = !!on('sparks');
    root.classList.toggle('fx-frame', !!on('frame'));
    for (const [id, cls, v] of [['name', 'fx-name', '--fx-name'], ['hit', 'fx-hit', '--fx-hit']]) {
      const b = on(id);
      root.classList.toggle(cls, !!b);
      if (b) root.style.setProperty(v, b.color); else root.style.removeProperty(v);
    }
  }

  const proto = TT.TypeText.prototype;
  const input = proto.input;
  let live = 0;
  proto.input = function (ch, now) {
    const i = this.pos;
    const ok = input.call(this, ch, now);
    if (ok === null || reduce.matches || live > 60) return ok;
    if (trail) dropTrail(this, i);
    if (ok && sparks && ch !== ' ') spark(this, i);
    return ok;
  };
  function add(tt, node, ms) {
    live++;
    tt.el.append(node);
    setTimeout(() => { node.remove(); live--; }, ms);
  }
  // a faded copy of the caret where it just was
  function dropTrail(tt, i) {
    const p = tt.xy(i);
    const n = document.createElement('i');
    n.className = 'fx-trail';
    n.style.cssText = `left:${p.x - 1}px;top:${p.y + p.h * 0.12}px;height:${p.h * 0.76}px`;
    add(tt, n, 420);
  }
  // three specks off the letter just typed
  function spark(tt, i) {
    if (!tt.spans[i]) return;
    const p = tt.xy(i);
    const x = p.x + p.w / 2, y = p.y + p.h * 0.45;
    for (let k = 0; k < 3; k++) {
      const n = document.createElement('i');
      n.className = 'fx-spark';
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const d = 14 + Math.random() * 16;
      n.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
      add(tt, n, 480);
    }
  }

  P.on('fx', apply);
  P.on('ready', apply);
  P.on('bonus', apply);
  P.on('change', apply);
  apply();
})();
