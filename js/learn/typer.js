// The typing box the academy and free typing share, built on TT.TypeText and TT.captureKeys.
// LearnTyper.mount(stage, text, opts) returns { tt, focus(), set(text), destroy() }.
// opts: label, onChar(ok, tt, want), onDone(tt, ms), onKey(key), onBack(tt)   want is the character the text asked for
// The box shows a fixed number of lines and scrolls so the caret stays on the second one.
window.LearnTyper = (() => {
  function mount(stage, text, o = {}) {
    const win = UI.el(`<div class="lx-box typebox idle" tabindex="-1"><div class="focus-note"><span class="fn-key">Click here or press any key to type</span><span class="fn-tap">Tap here to type</span></div></div>`);
    stage.append(win);
    const tt = new TT.TypeText(win);
    let done = false;
    function scroll() {
      const p = tt.xy(tt.pos);
      const lh = parseFloat(getComputedStyle(tt.el).lineHeight) || 40;
      const row = Math.floor((p.y + p.h / 2) / lh);
      tt.el.style.transform = `translateY(${-Math.max(0, row - 1) * lh}px)`;
    }
    function set(t) {
      done = false;
      tt.set(t);
      tt.el.style.transform = '';
      win.classList.add('idle');
    }
    set(text);
    const keys = TT.captureKeys(win, {
      label: o.label || 'Type here',
      onChar(ch) {
        if (done) return;
        win.classList.remove('idle');
        const want = tt.text[tt.pos];
        const ok = tt.input(ch);
        TT.click(ch === ' ');
        scroll();
        if (o.onChar) o.onChar(ok, tt, want);
        if (tt.done()) { done = true; if (o.onDone) o.onDone(tt, performance.now() - tt.startT); }
      },
      onBack(word) { if (done || !tt.startT) return; word ? tt.backWord() : tt.back(); scroll(); if (o.onBack) o.onBack(tt); },
      onKey(k) { if (o.onKey) o.onKey(k); },
    });
    // typing with nothing focused goes to the box
    const fwd = e => {
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'view') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || !win.isConnected) return;
      e.preventDefault();
      keys.focus();
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    };
    document.addEventListener('keydown', fwd);
    const onResize = () => { tt.place(tt.caret, tt.pos); scroll(); };
    addEventListener('resize', onResize);
    if (matchMedia('(pointer: fine)').matches) keys.focus();
    return {
      tt, win, set, focus: () => keys.focus(),
      destroy() { document.removeEventListener('keydown', fwd); removeEventListener('resize', onResize); win.remove(); },
    };
  }
  return { mount };
})();
