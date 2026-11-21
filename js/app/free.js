// #/type/free: free typing. No timer, no progress bar and no effects, only text to type.
// The player picks common words, a themed pack, quotes or their own text. Stats stay hidden
// until they press Show stats. Coins come in at LEARN_COINS.free.charsPerCoin correct
// characters each, up to LEARN_COINS.free.dailyCap a day. A position in the text pays once,
// so backspacing and retyping earns nothing. The session goes to WPM.record when the player
// leaves the page or changes the text source.
window.FreePage = (() => {
  const F = () => window.LEARN_COINS.free;
  const SRC = [['common', 'Common words'], ['pack', 'Themed'], ['quotes', 'Quotes'], ['own', 'Your text']];
  let el = null, box = null, opt, sess, paid, offs = [];
  const recent = [];   // passages typed lately, so the next one is new

  const today = () => UI.day();
  function wallet() {
    const f = WPM.learn().free || {};
    return f.day === today() ? { day: f.day, coins: f.coins || 0 } : { day: today(), coins: 0 };
  }

  function newSession() { sess = { correct: 0, keys: 0, good: 0, active: 0, last: 0, bank: 0 }; paid = new Set(); }

  function textFor() {
    if (opt.src === 'pack') return { text: LearnWords.pack(opt.pack, 40).join(' ') };
    if (opt.src === 'quotes') {
      // a passage from js/learn/passages.js in the picked category and length
      let pool = PASSAGES.LIST.filter(p => (opt.cat === 'any' || p.cat === opt.cat) && (opt.len === 'any' || p.len === opt.len));
      if (!pool.length) pool = PASSAGES.LIST.filter(p => opt.cat === 'any' || p.cat === opt.cat);
      const fresh = pool.filter(p => !recent.includes(p));
      if (fresh.length) pool = fresh; else recent.length = 0;
      const p = pool[Math.floor(Math.random() * pool.length)];
      recent.push(p); if (recent.length > 40) recent.shift();
      return { text: p.text, src: p.src };
    }
    if (opt.src === 'own') return { text: TT.store.get('wpm-free-own', '') };
    return { text: LearnWords.common(50, { top: 1000 }).join(' ') };
  }

  function mount(root) {
    el = root;
    opt = { src: 'common', pack: '', stats: false, cat: 'any', len: 'any', ...TT.store.get('wpm-free-opts', {}) };
    const packs = LearnWords.packs();
    if (!packs[opt.pack]) opt.pack = Object.keys(packs)[0] || '';
    newSession();
    el.innerHTML = `
      <div class="lx lx-free">
        <div class="fr-bar">
          <h1>Free typing</h1>
          <div class="lx-seg" role="group" aria-label="Text to type" data-src>${SRC.map(([v, n]) => `<button type="button" data-v="${v}">${n}</button>`).join('')}</div>
          <select class="fr-pack" aria-label="Themed pack" data-pack>${Object.entries(packs).map(([id, p]) => `<option value="${UI.esc(id)}">${UI.esc(p.name)}</option>`).join('')}</select>
          <select class="fr-pack" aria-label="What to type" data-cat><option value="any">Everything</option>${PASSAGES.CATS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
          <select class="fr-pack" aria-label="Length" data-len><option value="any">Any length</option>${PASSAGES.LENGTHS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
          <button class="fr-toggle" type="button" data-stats aria-pressed="false">Show stats</button>
        </div>
        <div class="fr-stage" data-stage></div>
        <p class="fr-src" data-from></p>
        <div class="fr-stats" data-statline hidden></div>
        <p class="lx-hint" data-hint></p>
      </div>`;
    const q = s => el.querySelector(s);
    q('[data-src]').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || b.dataset.v === opt.src) return;
      save(); opt.src = b.dataset.v; store(); load();
    });
    q('[data-pack]').value = opt.pack;
    q('[data-pack]').addEventListener('change', ev => { save(); opt.pack = ev.target.value; store(); load(); });
    q('[data-cat]').value = opt.cat; q('[data-len]').value = opt.len;
    q('[data-cat]').addEventListener('change', ev => { save(); opt.cat = ev.target.value; lengths(); store(); load(); });
    q('[data-len]').addEventListener('change', ev => { save(); opt.len = ev.target.value; store(); load(); });
    lengths();
    q('[data-stats]').addEventListener('click', () => { opt.stats = !opt.stats; store(); paintStats(); if (box) box.focus(); });
    load();
    paintStats();
    addEventListener('pagehide', save);
    offs.push(() => removeEventListener('pagehide', save));
  }

  function store() { TT.store.set('wpm-free-opts', opt); }

  // lengths the picked category has none of can't be picked, e.g. no very long sayings
  function lengths() {
    const sel = el.querySelector('[data-len]');
    for (const o of sel.options) {
      if (o.value === 'any') continue;
      o.disabled = !PASSAGES.LIST.some(p => p.len === o.value && (opt.cat === 'any' || p.cat === opt.cat));
    }
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) { opt.len = 'any'; sel.value = 'any'; }
  }

  function load() {
    if (box) { box.destroy(); box = null; }
    const stage = el.querySelector('[data-stage]');
    stage.innerHTML = '';
    el.querySelectorAll('[data-src] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === opt.src));
    el.querySelector('[data-pack]').hidden = opt.src !== 'pack';
    el.querySelector('[data-cat]').hidden = el.querySelector('[data-len]').hidden = opt.src !== 'quotes';
    const { text, src } = textFor();
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    el.querySelector('[data-from]').textContent = src || '';
    if (opt.src === 'own' && !clean) return ownForm(stage);
    box = LearnTyper.mount(stage, clean, {
      label: 'Free typing',
      onChar: (ok, tt) => count(ok, tt),
      onDone: () => setTimeout(next, 120),
      onKey: k => { if (k === 'Tab' || k === 'Escape') next(); },
    });
    el.querySelector('[data-hint]').innerHTML = 'Press <kbd>Tab</kbd> for new text.' +
      (opt.src === 'own' ? ' <button class="fr-link" type="button" data-edit>Change your text</button>' : '');
    const ed = el.querySelector('[data-edit]');
    if (ed) ed.addEventListener('click', () => { TT.store.set('wpm-free-own', ''); load(); });
  }

  // the next piece of text, keeping the session going
  function next() {
    if (!box || !el) return;
    const { text, src } = textFor();
    box.set((text || '').replace(/\s+/g, ' ').trim());
    paid = new Set();
    el.querySelector('[data-from]').textContent = src || '';
    box.focus();
  }

  function ownForm(stage) {
    const f = UI.el(`<form class="fr-own">
      <label for="fr-own-text">Paste or type the text you want to practise.</label>
      <textarea id="fr-own-text" maxlength="20000" spellcheck="false"></textarea>
      <div><button class="btn" type="submit">Start typing</button></div>
    </form>`);
    stage.append(f);
    el.querySelector('[data-hint]').textContent = 'Line breaks become spaces.';
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const t = f.querySelector('textarea').value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
      if (!t) return;
      TT.store.set('wpm-free-own', t);
      load();
    });
  }

  function count(ok, tt) {
    const now = performance.now();
    if (sess.last) { const dt = now - sess.last; if (dt < 3000) sess.active += dt; }
    sess.last = now;
    sess.keys++;
    if (ok) sess.good++;
    const pos = tt.pos - 1;
    if (ok && !paid.has(pos)) {
      paid.add(pos);
      sess.correct++;
      sess.bank++;
      if (sess.bank >= F().charsPerCoin) { sess.bank -= F().charsPerCoin; pay(); }
    }
    if (opt.stats) paintStats();
  }

  function pay() {
    const w = wallet();
    if (w.coins >= F().dailyCap) return;
    WPM.setLearn({ free: { day: w.day, coins: w.coins + 1 } });
    WPM.addCoins(1, 'free typing');
    if (w.coins + 1 >= F().dailyCap) paintStats();
  }

  function paintStats() {
    if (!el) return;
    const btn = el.querySelector('[data-stats]'), line = el.querySelector('[data-statline]');
    btn.setAttribute('aria-pressed', opt.stats);
    btn.textContent = opt.stats ? 'Hide stats' : 'Show stats';
    const w = wallet(), capped = w.coins >= F().dailyCap;
    line.hidden = !opt.stats && !capped;
    const wpm = sess.active > 2000 ? Math.round((sess.correct / 5) / (sess.active / 60000)) : 0;
    const acc = sess.keys ? Math.round(100 * sess.good / sess.keys) : 100;
    line.innerHTML = opt.stats
      ? `<span><b>${wpm}</b> wpm</span><span><b>${acc}%</b> accuracy</span><span><b>${UI.fmt(sess.correct)}</b> correct characters</span><span><b>${w.coins} of ${F().dailyCap}</b> coins today</span>`
      : `<span>Daily coin limit reached: ${F().dailyCap} of ${F().dailyCap}.</span>`;
  }

  // the session goes into the player's history once it has some typing in it
  function save() {
    if (!sess || sess.correct < 100) { newSession(); return; }
    const ms = Math.round(sess.active);
    const wpm = ms > 2000 ? Math.round((sess.correct / 5) / (ms / 60000)) : 0;
    const acc = sess.keys ? Math.round(100 * sess.good / sess.keys) : 100;
    WPM.record({ mode: 'free', wpm, acc, correct: sess.correct, keys: sess.keys, ms, coins: 0 });
    newSession();
  }

  function unmount() {
    save();
    if (box) box.destroy();
    box = null; el = null;
    offs.forEach(f => f()); offs = [];
  }

  return { title: 'Free typing', mount, unmount };
})();
