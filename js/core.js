// Shared pieces: word lists, key capture, the typing text renderer and key sounds.
window.TT = (() => {
  const COMMON = `the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us great hand high keep last long little own point right same seem small tell turn under part place case week group number world school still home every never start city play run while next open fast type word speed tap key board switch press light sound clean plan stop face hold move live real need help line read lead give show both side late body early water light house river music stone power money story young night paper party learn cover heart sleep watch quick drive green field plant world short black white clear later round sound order south north early given least whole space found every along voice stand class focus judge brave chair dream glass happy laugh metal music piece proud quiet rapid shape sharp shift smile solid sweet table thumb touch trick value whale wheel yield`.split(/\s+/);
  const KEYB = `keycap switch gasket linear tactile thock clack spacebar stabilizer lube magnetic actuation trigger polling latency backspace hotswap acrylic aluminum layout knob modifier keystroke typing sprint monkeytype warmup ghost accuracy combo wrist finger rhythm desk mat cable wireless dongle`.split(/\s+/);
  const ALL = [...new Set([...COMMON, ...KEYB])].filter(w => /^[a-z]+$/.test(w));
  const byLen = {};
  for (const w of ALL) (byLen[w.length] ||= []).push(w);

  const pick = a => a[Math.floor(Math.random() * a.length)];

  // Big lists from words.js when loaded. Each list is dealt from a shuffled bag
  // so a word only comes back after the whole list has gone by.
  const BIG = window.WORDS || { common: ALL, long: ALL.filter(w => w.length >= 8) };
  const pool = {};
  for (const w of [...BIG.common, ...BIG.long, ...KEYB]) (pool[w.length] ||= new Set()).add(w);
  const bags = {};
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function deal(key, src) {
    if (!bags[key] || !bags[key].length) bags[key] = shuffle([...src]);
    return bags[key].pop();
  }
  // n words, with roughly longShare of them 8 letters or more
  function randomWords(n, longShare = 0.18) {
    const out = [];
    while (out.length < n) {
      const w = Math.random() < longShare ? deal('long', BIG.long) : deal('common', BIG.common);
      if (w !== out[out.length - 1]) out.push(w);
    }
    return out;
  }
  // The typing test, races and reel mode draw from the player's word set:
  //   'mt'    Monkeytype's default English 200 (js/words-mt.js), the default
  //   'mt1k'  Monkeytype's English 1k
  //   'big'   the site's own expanded list (randomWords above)
  // Monkeytype picks each word at random from its list, never the same word twice in a row.
  const WORDSETS = { mt: 'english', mt1k: 'english_1k' };
  const wordset = () => { const v = store.get('wpm-wordset', 'mt'); return v in WORDSETS || v === 'big' ? v : 'mt'; };
  const setWordset = v => store.set('wpm-wordset', v);
  function testWords(n, set = wordset()) {
    const list = WORDSETS[set] && window.MONKEYTYPE && MONKEYTYPE[WORDSETS[set]];
    if (!list) return randomWords(n);
    const out = [];
    while (out.length < n) {
      const w = list[Math.floor(Math.random() * list.length)];
      if (w !== out[out.length - 1]) out.push(w);
    }
    return out;
  }
  function wordOfLength(min, max) {
    const src = [];
    for (let l = min; l <= max; l++) if (pool[l]) src.push(...pool[l]);
    return deal(`len${min}-${max}`, src);
  }

  // ---- key capture ----
  // A hidden textarea inside a focusable box catches the keys. Desktop keys come
  // through keydown and phone keys through input since Android sends "Unidentified".
  const SENT = '##';
  function captureKeys(box, { onChar, onBack, onKey, label }) {
    const ta = document.createElement('textarea');
    ta.className = 'sr-input';
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('aria-label', label || 'Type here');
    ta.value = SENT;
    box.appendChild(ta);
    box.addEventListener('pointerdown', e => {
      if (e.target.closest('button, a')) return;
      setTimeout(() => ta.focus({ preventScroll: true }), 0);
    });
    ta.addEventListener('focus', () => box.classList.add('focused'));
    ta.addEventListener('blur', () => box.classList.remove('focused'));
    ta.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key === 'Backspace') { e.preventDefault(); onBack && onBack(true); }
        return;
      }
      if (e.key === 'Unidentified' || e.isComposing) return;
      if (e.key.length === 1) { e.preventDefault(); onChar(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); onBack && onBack(false); }
      else if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault(); onKey && onKey(e.key);
      }
    });
    ta.addEventListener('input', () => {
      const v = ta.value;
      if (v.length < SENT.length) onBack && onBack(false);
      else for (const ch of v.slice(SENT.length)) ch === '\n' ? onKey && onKey('Enter') : onChar(ch);
      ta.value = SENT;
    });
    return { focus: () => ta.focus({ preventScroll: true }), el: ta };
  }

  // ---- typing text ----
  // Letter positions are measured once per text and reused: reading a letter's position right
  // after marking it ok or bad made the browser lay the whole passage out again on every key.
  // Marking only changes colour and underline, so the positions hold until the text, the box's
  // size or the font changes.
  const geoRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => { for (const e of es) if (e.target.__tt) e.target.__tt.geo = null; }) : null;
  const live = new Set();
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { for (const t of live) t.geo = null; });
  class TypeText {
    constructor(host) {
      this.host = host;
      this.el = document.createElement('div');
      this.el.className = 'typetext';
      this.caret = document.createElement('div');
      this.caret.className = 'caret';
      this.ghost = document.createElement('div');
      this.ghost.className = 'ghost';
      this.ghost.hidden = true;
      host.appendChild(this.el);
      this.el.append(this.caret, this.ghost);
      this.geo = null;
      this.el.__tt = this;
      if (window.Motion) Motion.attach(this.el);
      if (geoRO) geoRO.observe(this.el);
      live.add(this);
    }
    // every letter's box in one pass, which is one layout
    measure() {
      const n = this.spans.length, g = { x: new Float32Array(n), y: new Float32Array(n), w: new Float32Array(n), h: new Float32Array(n) };
      for (let i = 0; i < n; i++) { const s = this.spans[i]; g.x[i] = s.offsetLeft; g.y[i] = s.offsetTop; g.w[i] = s.offsetWidth; g.h[i] = s.offsetHeight; }
      this.geo = g; this.lh = 0;
      return g;
    }
    invalidate() { this.geo = null; this.lh = 0; }
    // the text's line height, read once per layout
    lineH() { if (!this.lh || !this.geo) this.lh = parseFloat(getComputedStyle(this.el).lineHeight) || 40; return this.lh; }
    set(text) {
      this.text = text;
      this.pos = 0;
      this.correct = 0;
      this.typed = 0;
      this.errors = 0;
      this.startT = 0;
      this.times = [];      // ms after start for each char, the ghost replays these
      this.el.querySelectorAll('.w').forEach(n => n.remove());
      this.spans = [];
      let word = null;
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        if (!word) { word = document.createElement('span'); word.className = 'w'; frag.appendChild(word); }
        const s = document.createElement('span');
        s.className = 'c' + (ch === ' ' ? ' sp' : '');
        s.textContent = ch;
        word.appendChild(s);
        this.spans.push(s);
        if (ch === ' ') word = null;
      }
      this.el.insertBefore(frag, this.caret);
      this.geo = null;
      this.place(this.caret, 0);
      this.ghost.hidden = true;
    }
    // x,y of the left edge of char i, relative to the text box
    xy(i) {
      const last = this.spans.length - 1;
      if (last < 0) return { x: 0, y: 0, h: 20 };
      if (!this.el.isConnected) { live.delete(this); return { x: 0, y: 0, h: 20 }; }
      live.add(this);
      const g = this.geo || this.measure();
      const k = Math.min(i, last);
      const x = i > last ? g.x[k] + g.w[k] : g.x[k];
      return { x, y: g.y[k], h: g.h[k] || 20, w: g.w[k] };
    }
    place(node, i) {
      const p = this.xy(i);
      node.style.left = (p.x - 1) + 'px';
      node.style.top = (p.y + p.h * 0.12) + 'px';
      node.style.height = (p.h * 0.76) + 'px';
    }
    input(ch, now = performance.now()) {
      if (this.pos >= this.spans.length) return null;
      if (!this.startT) this.startT = now;
      const want = this.text[this.pos];
      const ok = ch === want;
      const s = this.spans[this.pos];
      s.classList.remove('demo');
      s.classList.add(ok ? 'ok' : 'bad');
      if (window.Motion) Motion.letter(s, ok);
      this.typed++;
      if (ok) this.correct++; else this.errors++;
      this.times[this.pos] = now - this.startT;
      this.pos++;
      this.place(this.caret, this.pos);
      return ok;
    }
    back() {
      if (this.pos === 0) return;
      this.pos--;
      const s = this.spans[this.pos];
      if (s.classList.contains('ok')) this.correct--;
      s.classList.remove('ok', 'bad');
      this.place(this.caret, this.pos);
    }
    backWord() {
      do { this.back(); } while (this.pos > 0 && this.text[this.pos - 1] !== ' ');
    }
    done() { return this.pos >= this.spans.length; }
    wpm(now = performance.now()) {
      if (!this.startT) return 0;
      const min = (now - this.startT) / 60000;
      return min > 0.01 ? Math.round((this.correct / 5) / min) : 0;
    }
    accuracy() { return this.typed ? Math.round(100 * (this.typed - this.errors) / this.typed) : 100; }
    showGhost(i, name) {
      this.ghost.hidden = false;
      if (name) this.ghost.dataset.name = name;
      this.place(this.ghost, i);
    }
  }

  // Delay for each letter at a given wpm. The delays vary like a real typist's
  // and add up to the exact pace.
  function paceTimes(text, wpm) {
    const per = 60000 / (wpm * 5);
    const raw = [...text].map((ch, i) => {
      let d = per * (0.55 + Math.random() * 0.9);
      if (ch === ' ') d *= 1.25;
      if (i > 0 && text[i - 1] === text[i]) d *= 1.2;
      return d;
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    const k = (per * text.length) / sum;
    let t = 0;
    return raw.map(d => (t += d * k));
  }

  // ---- key sounds ----
  // Each key sound is a short burst of filtered noise with a low knock under it.
  // Each board sets its own profile.
  let ac = null;
  let on = true;
  try { on = localStorage.getItem('wpm-sound') !== 'off'; } catch (e) {}
  const PROFILES = {
    thock:  { lp: 1100, knock: 150, kGain: .55, nGain: .35, len: .05 },
    creamy: { lp: 1600, knock: 210, kGain: .4,  nGain: .35, len: .045 },
    clack:  { lp: 4200, knock: 320, kGain: .25, nGain: .5,  len: .035 },
    marble: { lp: 2600, knock: 520, kGain: .35, nGain: .4,  len: .03 },
    // the operator keyboards (useWeaponSound): a sharp click with a metal ping, and a crackle
    clicky: { lp: 5200, knock: 380, kGain: .22, nGain: .55, len: .03, ping: 3400 },
    spark:  { lp: 3000, knock: 260, kGain: .35, nGain: .4,  len: .035, zap: true },
  };
  let profile = PROFILES.creamy;
  const clickBufs = new Map();
  function setProfile(name) { profile = PROFILES[name] || PROFILES.creamy; }
  function click(big = false, up = false) {
    if (!on) return;
    try {
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      const p = profile;
      const vary = 0.92 + Math.random() * 0.16;
      const len = p.len * (big ? 1.6 : 1) * (up ? 0.6 : 1);
      // four noise bursts per length, made once and reused, so typing makes no garbage
      const bk = Math.round(len * 1e4);
      let set = clickBufs.get(bk);
      if (!set) {
        set = Array.from({ length: 4 }, () => {
          const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate), d = b.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
          return b;
        });
        clickBufs.set(bk, set);
      }
      const src = ac.createBufferSource(); src.buffer = set[Math.floor(Math.random() * set.length)];
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp * vary * (up ? 1.4 : 1);
      const g = ac.createGain(); g.gain.value = p.nGain * (up ? 0.4 : 1) * 0.6;
      src.connect(f).connect(g).connect(ac.destination);
      src.start(t);
      if (!up) {
        const o = ac.createOscillator();
        o.frequency.setValueAtTime(p.knock * vary * (big ? 0.75 : 1), t);
        o.frequency.exponentialRampToValueAtTime(p.knock * 0.6, t + 0.04);
        const og = ac.createGain();
        og.gain.setValueAtTime(p.kGain * 0.5, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(og).connect(ac.destination);
        o.start(t); o.stop(t + 0.07);
        if (p.ping) {
          // the click jacket's ping
          const pg = ac.createOscillator(), pgg = ac.createGain();
          pg.type = 'square'; pg.frequency.value = p.ping * vary;
          pgg.gain.setValueAtTime(0.035, t); pgg.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
          pg.connect(pgg).connect(ac.destination); pg.start(t); pg.stop(t + 0.02);
        }
        if (p.zap && Math.random() < 0.6) {
          // a short electric crackle on most keys
          const z = ac.createOscillator(), zf = ac.createBiquadFilter(), zg = ac.createGain();
          z.type = 'sawtooth'; z.frequency.setValueAtTime(1600 + Math.random() * 900, t); z.frequency.exponentialRampToValueAtTime(420, t + 0.035);
          zf.type = 'bandpass'; zf.frequency.value = 2200; zf.Q.value = 3;
          zg.gain.setValueAtTime(0.05, t); zg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          z.connect(zf).connect(zg).connect(ac.destination); z.start(t); z.stop(t + 0.045);
        }
      }
    } catch (e) { /* no audio */ }
  }
  // In fights the key sound comes from the operator's keyboard, its weapon (Gid, 25 Nov 2026).
  // With no style given it reads the saved operator; a board that isn't owned sounds like the Slab.
  const KB_SOUND = { slab: 'thock', compact: 'clicky', split: 'creamy', arc: 'spark' };
  function useWeaponSound(style) {
    if (!style && window.SfxBank) SfxBank.load();   // fight pages: the recorded lasers and explosions
    if (!style) {
      const p = store.get('wpm-operator', null);
      style = p && p.kb && p.kb.style;
      if (style && style !== 'slab' && window.WPM && !WPM.owns('kb-' + style)) style = 'slab';
    }
    setProfile(KB_SOUND[style] || 'thock');
  }
  function setSound(v) {
    on = v;
    try { localStorage.setItem('wpm-sound', v ? 'on' : 'off'); } catch (e) {}
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  return { randomWords, testWords, wordset, setWordset, wordOfLength, pick, shuffle, captureKeys, TypeText, paceTimes, click, setProfile, useWeaponSound, setSound, soundOn: () => on, store, ART_WPM: 204 };
})();
