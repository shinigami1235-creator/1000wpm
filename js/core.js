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
    }
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
      this.place(this.caret, 0);
      this.ghost.hidden = true;
    }
    // x,y of the left edge of char i, relative to the text box
    xy(i) {
      const last = this.spans.length - 1;
      const s = this.spans[Math.min(i, last)];
      if (!s) return { x: 0, y: 0, h: 20 };
      const x = i > last ? s.offsetLeft + s.offsetWidth : s.offsetLeft;
      return { x, y: s.offsetTop, h: s.offsetHeight };
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
  };
  let profile = PROFILES.creamy;
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
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const src = ac.createBufferSource(); src.buffer = buf;
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
      }
    } catch (e) { /* no audio */ }
  }
  function setSound(v) {
    on = v;
    try { localStorage.setItem('wpm-sound', v ? 'on' : 'off'); } catch (e) {}
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  return { randomWords, wordOfLength, pick, shuffle, captureKeys, TypeText, paceTimes, click, setProfile, setSound, soundOn: () => on, store, ART_WPM: 204 };
})();
