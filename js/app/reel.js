// #/type/reel: the reel recorder. Art types a set text in a full-screen view made for
// screen recording, so his reels show this site instead of Monkeytype. The text is his
// random words from the 1,000 most common English words (the default, like Monkeytype's
// English 1k), the old follower-count format (one two three ... up to a number) or pasted text.
// The view has the logo and the site address in a corner, an optional live wpm and timer,
// a 9:16 or 16:9 frame, a 3 2 1 countdown and an end card with the wpm and the address.
// Esc closes the view. Settings are saved as wpm-reel-opts.
// The address comes from window.SITE_URL in index.html since the domain isn't bought yet.
window.ReelPage = (() => {
  const KEY = 'wpm-reel-opts';
  const DEF = { src: 'common', count: 100, upto: 100, custom: '', layout: '9x16', wpm: true, timer: true, full: true };
  const MAX = 100000;
  const site = () => window.SITE_URL || '10000wpm.com';

  // ---------- numbers as words ----------
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function say(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + say(n % 100) : '');
    return say(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + say(n % 1000) : '');
  }
  const clean = t => (t || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

  // words and characters in the chosen text, for the line under the settings
  // the 1,000 most common English words: the word bank's first band, or words.js
  function common1k() {
    try { if (window.WordBank && WordBank.list) { const l = WordBank.list('band1').map(e => typeof e === 'string' ? e : e.text); if (l.length) return l; } } catch (e) { /* fall back */ }
    return ((window.WORDS && WORDS.common) || []).slice(0, 1000);
  }
  function randomWords(n) {
    const pool = common1k(), out = [];
    if (!pool.length) return out;
    while (out.length < n) {
      const w = pool[Math.floor(Math.random() * pool.length)];
      if (w !== out[out.length - 1]) out.push(w);
    }
    return out;
  }
  function size(o) {
    if (o.src === 'common') {
      const pool = common1k(), avg = pool.length ? pool.reduce((a, w) => a + w.length, 0) / pool.length : 5;
      return { words: o.count, chars: Math.round(o.count * (avg + 1)) - 1 };
    }
    if (o.src === 'custom') { const t = clean(o.custom); return { words: t ? t.split(' ').length : 0, chars: t.length }; }
    let words = 0, chars = 0;
    for (let n = 1; n <= o.upto; n++) { const s = say(n); words += s.split(' ').length; chars += s.length + 1; }
    return { words, chars: Math.max(0, chars - 1) };
  }

  // ---------- the text, made a word at a time so counting to 100,000 stays light ----------
  function source(o) {
    if (o.src === 'common') { const w = randomWords(o.count); let i = 0; return () => (i < w.length ? w[i++] : null); }
    if (o.src === 'custom') { const w = clean(o.custom).split(' ').filter(Boolean); let i = 0; return () => (i < w.length ? w[i++] : null); }
    let n = 0, buf = [];
    return () => { if (!buf.length) { if (n >= o.upto) return null; n++; buf = say(n).split(' '); } return buf.shift(); };
  }

  let el = null, opt = null;

  // ---------- settings page ----------
  function mount(root) {
    el = root;
    opt = { ...DEF, ...TT.store.get(KEY, {}) };
    el.innerHTML = `
      <div class="reel-setup">
        <section class="panel hot">
          <div class="ph">&gt; REEL MODE</div>
          <h1>Reel_</h1>
          <p class="rs-lead">Type a set text in a clean full-screen view and record it for Instagram or TikTok.
            Start your screen recorder first, then press Start for a 3, 2, 1 countdown. Esc closes the view.</p>
          <div class="rs-grid">
            <span class="label">Text</span>
            <div class="seg" data-o="src" role="group" aria-label="Text"><button type="button" data-v="common">English 1k</button><button type="button" data-v="count">Count up</button><button type="button" data-v="custom">Your text</button></div>
            <label class="label" for="rs-count" data-row="common">Words</label>
            <div data-row="common"><input class="field rs-num" id="rs-count" type="number" min="1" max="${MAX}" step="1" inputmode="numeric"></div>
            <label class="label" for="rs-upto" data-row="count">Count to</label>
            <div data-row="count"><input class="field rs-num" id="rs-upto" type="number" min="1" max="${MAX}" step="1" inputmode="numeric"></div>
            <label class="label" for="rs-text" data-row="custom">Your text</label>
            <div data-row="custom"><textarea class="field rs-text" id="rs-text" maxlength="20000" spellcheck="false" placeholder="Paste the text you want to type."></textarea></div>
            <span class="label">Frame</span>
            <div class="seg" data-o="layout" role="group" aria-label="Frame"><button type="button" data-v="9x16">9:16 Reels, TikTok</button><button type="button" data-v="16x9">16:9 YouTube</button></div>
            <span class="label">Live wpm</span>
            <div class="seg" data-o="wpm" role="group" aria-label="Live wpm"><button type="button" data-v="1">On</button><button type="button" data-v="0">Off</button></div>
            <span class="label">Timer</span>
            <div class="seg" data-o="timer" role="group" aria-label="Timer"><button type="button" data-v="1">On</button><button type="button" data-v="0">Off</button></div>
            <span class="label">Full screen</span>
            <div class="seg" data-o="full" role="group" aria-label="Full screen"><button type="button" data-v="1">On</button><button type="button" data-v="0">Off</button></div>
          </div>
          <p class="rs-size" data-size></p>
          <div class="rs-go"><button class="btn" type="button" data-start>Start</button></div>
          <p class="rs-note">The site address on the video is ${UI.esc(site())}.</p>
        </section>
      </div>`;
    const q = s => el.querySelector(s);
    q('#rs-upto').value = opt.upto;
    q('#rs-count').value = opt.count;
    q('#rs-count').addEventListener('input', ev => {
      const n = Math.round(+ev.target.value);
      if (n >= 1) { opt.count = Math.min(MAX, n); save(); paintSize(); }
    });
    q('#rs-count').addEventListener('change', ev => { ev.target.value = opt.count; });
    q('#rs-text').value = opt.custom;
    el.querySelectorAll('.seg[data-o]').forEach(g => g.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const k = g.dataset.o;
      opt[k] = k === 'src' || k === 'layout' ? b.dataset.v : b.dataset.v === '1';
      save(); paint();
    }));
    q('#rs-upto').addEventListener('input', ev => {
      const n = Math.round(+ev.target.value);
      if (n >= 1) { opt.upto = Math.min(MAX, n); save(); paintSize(); }
    });
    q('#rs-upto').addEventListener('change', ev => { ev.target.value = opt.upto; });
    q('#rs-text').addEventListener('input', ev => { opt.custom = ev.target.value; save(); paintSize(); });
    q('[data-start]').addEventListener('click', () => open());
    paint();
  }

  function save() { TT.store.set(KEY, opt); }

  function paint() {
    el.querySelectorAll('.seg[data-o]').forEach(g => g.querySelectorAll('button').forEach(b => {
      const v = opt[g.dataset.o];
      b.setAttribute('aria-pressed', String(typeof v === 'boolean' ? (v ? '1' : '0') : v) === b.dataset.v);
    }));
    el.querySelectorAll('[data-row]').forEach(r => { r.hidden = r.dataset.row !== opt.src; });
    paintSize();
  }

  let sizeT = 0;
  function paintSize() {
    clearTimeout(sizeT);
    sizeT = setTimeout(() => {
      if (!el) return;
      const s = size(opt);
      const mins = s.chars / 5 / TT.ART_WPM;
      const t = mins < 1 ? `${Math.max(1, Math.round(mins * 60))} seconds` : mins < 90 ? `${Math.round(mins)} minutes` : `${(mins / 60).toFixed(1)} hours`;
      el.querySelector('[data-size]').textContent = s.words
        ? `${UI.fmt(s.words)} words, about ${t} at ${TT.ART_WPM} wpm.`
        : 'Paste some text to start.';
      el.querySelector('[data-start]').disabled = !s.words;
    }, 120);
  }

  // ---------- recording view ----------
  let ov = null;
  function open() {
    if (ov || !size(opt).words) return;
    if (opt.full && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    ov = new Recorder(opt);
  }

  class Recorder {
    constructor(o) {
      this.o = o;
      const root = this.root = UI.el(`<div class="reel-ov" data-layout="${o.layout}" role="dialog" aria-modal="true" aria-label="Reel recording">
        <div class="reel-frame">
          <div class="reel-brand"><svg aria-hidden="true"><use href="#i-logo"/></svg><span><b>10000WPM</b><small>${UI.esc(site())}</small></span></div>
          <div class="reel-hud">
            <span class="rh-wpm"${o.wpm ? '' : ' hidden'}><b data-wpm>0</b> wpm</span>
            <span class="rh-time"${o.timer ? '' : ' hidden'} data-time>0:00</span>
          </div>
          <div class="reel-text typebox" data-box><div class="reel-lines" data-lines></div><div class="caret" data-caret></div></div>
          <div class="reel-count" data-count aria-live="assertive"></div>
          <div class="reel-end" data-end hidden></div>
        </div>
      </div>`);
      document.body.append(root);
      document.documentElement.classList.add('reel-on');
      this.box = root.querySelector('[data-box]');
      this.lines = root.querySelector('[data-lines]');
      this.caret = root.querySelector('[data-caret]');
      this.keys = TT.captureKeys(this.box, {
        label: 'Reel text',
        onChar: ch => this.input(ch),
        onBack: w => this.back(w),
        onKey: k => this.key(k),
      });
      this.onDoc = e => {
        if (e.key === 'Escape') { e.preventDefault(); this.close(); }
        else if (this.done && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); this.restart(); }
        else if (!this.done && e.target === document.body && e.key.length === 1) { this.keys.focus(); }
      };
      document.addEventListener('keydown', this.onDoc);
      this.onFs = () => { if (!document.fullscreenElement && this.wasFull) this.close(); if (document.fullscreenElement) this.wasFull = true; };
      document.addEventListener('fullscreenchange', this.onFs);
      this.onResize = () => { if (!this.done && this.words) { this.render(); } };
      addEventListener('resize', this.onResize);
      root.addEventListener('pointerdown', () => this.keys.focus());
      this.restart();
    }

    restart() {
      clearInterval(this.iv); clearTimeout(this.cdT);
      this.next = source(this.o);
      this.words = []; this.ended = false; this.st = [];
      this.wi = 0; this.ci = 0; this.base = 0;
      this.correct = 0; this.typed = 0; this.errors = 0; this.t0 = 0; this.done = false; this.ready = false; this.ks = {};
      this.root.querySelector('[data-end]').hidden = true;
      this.box.hidden = true;
      this.paintHud();
      this.root.classList.remove('ended');
      // 3, 2, 1, then the text
      const cd = this.root.querySelector('[data-count]');
      let n = 3;
      const step = () => {
        if (n > 0) { cd.textContent = n; cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); n--; this.cdT = setTimeout(step, 1000); return; }
        cd.textContent = '';
        this.box.hidden = false;
        this.ready = true;
        this.render();
        this.box.classList.add('idle');
        this.keys.focus();
      };
      this.keys.focus();
      step();
    }

    // make sure word i exists; returns false past the end
    has(i) {
      while (this.words.length <= i && !this.ended) {
        const w = this.next();
        if (w == null) this.ended = true; else this.words.push(w);
      }
      return i < this.words.length;
    }
    isLast(i) { return !this.has(i + 1); }
    want() { const w = this.words[this.wi]; return this.ci < w.length ? w[this.ci] : ' '; }

    // draw the words from this.base, about four lines' worth
    render() {
      const frag = document.createDocumentFragment();
      this.spans = new Map();
      for (let i = this.base; i < this.base + 90 && this.has(i); i++) {
        const w = this.words[i], ws = document.createElement('span');
        ws.className = 'w';
        const n = this.isLast(i) ? w.length : w.length + 1;
        const st = this.st[i];
        for (let c = 0; c < n; c++) {
          const s = document.createElement('span');
          s.className = 'c' + (c === w.length ? ' sp' : '') + (st && st[c] === 1 ? ' ok' : st && st[c] === 2 ? ' bad' : '');
          s.textContent = c < w.length ? w[c] : ' ';
          ws.append(s);
          this.spans.set(i + ':' + c, s);
        }
        frag.append(ws);
      }
      this.lines.replaceChildren(frag);
      this.place();
    }

    span(wi, ci) { return this.spans && this.spans.get(wi + ':' + ci); }

    place() {
      let s = this.span(this.wi, this.ci), after = false;
      if (!s) { s = this.span(this.wi, this.ci - 1); after = true; }
      if (!s) return;
      const x = s.offsetLeft + (after ? s.offsetWidth : 0), lh = s.offsetHeight;
      this.caret.style.left = (x - 1) + 'px';
      this.caret.style.top = (s.offsetTop + lh * 0.12) + 'px';
      this.caret.style.height = (lh * 0.76) + 'px';
      // keep the caret on the first or second line: once it reaches the third, drop the first
      const first = this.lines.firstElementChild;
      if (!first) return;
      const line = Math.round((s.offsetTop - first.offsetTop) / lh);
      if (line >= 2) {
        let i = this.base;
        const top1 = first.offsetTop + lh;
        for (const ws of this.lines.children) { if (ws.offsetTop >= top1 - 2) break; i++; }
        this.base = i;
        this.render();
      }
    }

    input(ch) {
      if (!this.ready || this.done) return;
      if (!this.t0) { this.t0 = performance.now(); this.box.classList.remove('idle'); this.iv = setInterval(() => this.paintHud(), 250); }
      const want = this.want(), ok = ch === want;
      const k = want === ' ' ? ' ' : want.toLowerCase();
      (this.ks[k] ||= [0, 0])[ok ? 0 : 1]++;
      (this.st[this.wi] ||= new Uint8Array(this.words[this.wi].length + 1))[this.ci] = ok ? 1 : 2;
      const s = this.span(this.wi, this.ci);
      if (s) s.classList.add(ok ? 'ok' : 'bad');
      this.typed++;
      if (ok) this.correct++; else this.errors++;
      TT.click(ch === ' ');
      const w = this.words[this.wi];
      if (this.ci === w.length - 1 && this.isLast(this.wi)) { this.ci++; this.place(); return this.finish(); }
      if (this.ci < w.length) this.ci++; else { this.wi++; this.ci = 0; }
      this.place();
    }

    back(word) {
      if (!this.ready || this.done || !this.t0) return;
      const one = () => {
        if (this.ci > 0) this.ci--;
        else if (this.wi > this.base) { this.wi--; this.ci = this.words[this.wi].length; }
        else return false;
        const st = this.st[this.wi];
        if (st) { if (st[this.ci] === 1) this.correct--; st[this.ci] = 0; }
        const s = this.span(this.wi, this.ci);
        if (s) s.classList.remove('ok', 'bad');
        return true;
      };
      if (word) { do { if (!one()) break; } while (this.ci > 0); } else one();
      this.place();
    }

    key(k) {
      if (k === 'Escape') this.close();
      else if (k === 'Tab' || (k === 'Enter' && this.done)) this.restart();
    }

    ms() { return this.t0 ? performance.now() - this.t0 : 0; }
    wpm(ms = this.ms()) { return ms > 1000 ? Math.round((this.correct / 5) / (ms / 60000)) : 0; }
    paintHud() {
      const ms = this.ms();
      this.root.querySelector('[data-wpm]').textContent = this.wpm(ms);
      this.root.querySelector('[data-time]').textContent = UI.clock(ms / 1000);
    }

    finish() {
      this.done = true;
      clearInterval(this.iv);
      const ms = this.ms(), wpm = this.wpm(ms);
      const acc = this.typed ? Math.round(100 * (this.typed - this.errors) / this.typed) : 100;
      this.paintHud();
      WPM.record({ mode: 'reel', wpm, acc, correct: this.correct, keys: this.typed, ms: Math.round(ms), keyStats: this.ks });
      const end = this.root.querySelector('[data-end]');
      end.innerHTML = `
        <svg class="re-logo" aria-hidden="true"><use href="#i-logo"/></svg>
        <p class="re-wpm"><b>${wpm}</b><span>wpm</span></p>
        <p class="re-sub">${acc}% accuracy in ${UI.clock(ms / 1000)}</p>
        <p class="re-site">${UI.esc(site())}</p>`;
      // a short beat so the last letter shows before the card
      setTimeout(() => { if (this.done && this.root.isConnected) { end.hidden = false; this.root.classList.add('ended'); } }, 450);
    }

    close() {
      clearInterval(this.iv); clearTimeout(this.cdT);
      document.removeEventListener('keydown', this.onDoc);
      document.removeEventListener('fullscreenchange', this.onFs);
      removeEventListener('resize', this.onResize);
      this.root.remove();
      document.documentElement.classList.remove('reel-on');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      if (ov === this) ov = null;
      const b = el && el.querySelector('[data-start]');
      if (b) b.focus();
    }
  }

  function unmount() { if (ov) ov.close(); el = null; }

  // the run mode's name on the profile and leaderboard
  const baseName = UI.modeName;
  UI.modeName = (m, d) => (m === 'reel' ? 'Reel' : baseName(m, d));

  return { title: 'Reel', mount, unmount, say };
})();
