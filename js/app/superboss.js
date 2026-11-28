// #/superboss: Art's live fights, made to stream. SUPERBOSS.md has the rules and the message format.
//   #/superboss                          pick a boss and a difficulty
//   #/superboss/stream/<boss>/<dial>     the streamer view: what Art plays and captures in OBS (16:9)
//   #/superboss/watch[/<boss>/<dial>]    the viewer view: the fight mirrored from the stream, chat and the support shop
// The fight rules are in js/app/sb-fight.js, the 3D in sb-scene.js, the sound in sb-audio.js
// and the stream messages, simulated chat and simulated viewers in sb-stream.js.
(() => {
  const esc = s => UI.esc(s), fmt = n => UI.fmt(n);
  const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const opts = () => ({ slot: 'frame', reduceShake: false, duck: false, chat: true, ...(store('wpm-sb-opts') || {}) });
  const saveOpts = o => store('wpm-sb-opts', o);
  const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const ITEM_GLYPH = { shield: '[#]', overclock: '>>>', heal: '+5%', slowmo: '|| ', hype: '/!\\', fog: '~~~', shuffle: '<->', speed: '>>|' };

  if (window.WPM && WPM.events) WPM.events.register('superboss_win', 'support_sent');

  // ---------- the arena: 3D, HP, words, labels, ticker, alerts and the results card ----------
  // Both views build one and feed it snapshots and events; it never runs the fight.
  function Arena(host, { mode, boss, onReady }) {
    host.innerHTML = `
      <section class="sb-arena" data-mode="${mode}" aria-label="Superboss fight">
        <div class="sb-loading">Loading</div>
        <div class="sb-top">
          <div class="sb-name"><b data-a="name"></b><span class="sb-pips" data-a="pips"><i></i><i></i><i></i></span></div>
          <div class="sb-hp" role="meter" aria-label="Boss HP" data-a="hpm"><i data-a="hpfill"></i><s style="left:33.3%"></s><s style="left:66.6%"></s></div>
          <div class="sb-hpn"><b data-a="hp">0</b><span data-a="hpp"></span></div>
          <div class="sb-enrage" data-a="enrage"></div>
        </div>
        <div class="sb-code" data-a="code" hidden><div class="sb-code-h"><span>build.js</span><span>Fix it before it compiles</span></div><ol data-a="lines"></ol></div>
        <div class="sb-labels" data-a="labels" aria-hidden="true"></div>
        <div class="sb-pops" data-a="pops" aria-hidden="true"></div>
        <ol class="sb-ticker" data-a="ticker" aria-label="Damage"></ol>
        <div class="sb-dps" data-a="dps"></div>
        <div class="sb-alerts" data-a="alerts" aria-live="polite"></div>
        <div class="sb-banner" data-a="banner" hidden></div>
        <div class="sb-artbox">
          <div class="sb-arthead"><b>Art</b><span data-a="arthp">100</span></div>
          <div class="sb-artbar"><i data-a="artfill"></i></div>
          <div class="sb-combo" data-a="combo"><b data-a="cnum">0</b><span data-a="ctier">Bolt</span><i class="sb-cbar"><i data-a="cbar"></i></i></div>
          <div class="sb-buffs" data-a="buffs"></div>
        </div>
        <div class="sb-type" data-a="type">
          <div class="sb-attacks" data-a="attacks"></div>
          <div class="sb-finish" data-a="finish" hidden></div>
          <div class="sb-line" data-a="line"></div>
          <div class="sb-next" data-a="next"></div>
        </div>
        <div class="sb-count" data-a="count" hidden></div>
        <div class="sb-ready" data-a="ready" hidden></div>
        <div class="sb-result" data-a="result" hidden></div>
      </section>`;
    const root = host.querySelector('.sb-arena');
    const a = k => root.querySelector(`[data-a="${k}"]`);
    let s = null, rx = 0, B = SuperData.boss(boss), lastPhase = 0, enrageShown = false;
    const labels = new Map(), chips = new Map(), lineEls = new Map();
    // the one line (Gid, 27 Nov 2026): Art's words as a block of lines with every special in them
    let flow = null, lineWas = null, missed = false;
    // the Hydra's heads in their colours in the arena (sb-scene.js)
    const OWN = { fork: Theme.hex('accent'), root: '#3ee6ff', patch: '#f2c230' };
    let dpsWin = [];
    const scene = SuperScene.mount(root, { boss, onPop: pop, onFrame: frame, reduceShake: opts().reduceShake });
    scene.ready.then(ok => { const l = root.querySelector('.sb-loading'); if (ok && l) l.remove(); if (onReady) onReady(); })
      .catch(() => { const l = root.querySelector('.sb-loading'); if (l) l.textContent = "The arena can't load without an internet connection."; });
    a('name').textContent = B.name;

    const left = x => (x.left == null ? null : Math.max(0, x.left - (performance.now() - rx)));
    // a word with the letters typed so far marked
    function letters(word, typed, on) {
      if (!on) return esc(word);
      let h = '';
      for (let i = 0; i < word.length; i++) {
        const t = typed[i];
        h += t === undefined ? `<span class="${i === typed.length ? 'at' : ''}">${esc(word[i])}</span>` : `<span class="${t === word[i] ? 'ok' : 'bad'}">${esc(word[i])}</span>`;
      }
      if (typed.length > word.length) h += `<span class="bad">${esc(typed.slice(word.length))}</span>`;
      return h;
    }

    function state(snap) {
      if (!snap) return;
      if (snap.boss !== B.id) { B = SuperData.boss(snap.boss); a('name').textContent = B.name; labels.forEach(x => x.el.remove()); labels.clear(); }
      s = snap; rx = performance.now();
      scene.apply(snap);
      paint();
    }
    // the parts that change with a snapshot
    function paint() {
      const f = s.hp / s.maxHp;
      a('hpfill').style.width = (100 * f).toFixed(2) + '%';
      a('hpm').setAttribute('aria-valuenow', s.hp);
      a('hp').textContent = fmt(s.hp);
      a('hpp').textContent = ` / ${fmt(s.maxHp)}`;
      a('pips').querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < s.phase));
      root.dataset.phase = s.phase;
      root.classList.toggle('enraged', s.enraged);
      root.classList.toggle('fog', s.chaos.fog > 0);
      root.classList.toggle('finishing', s.status === 'finish');
      a('enrage').innerHTML = s.enraged ? '<b>Enraged</b>' : `Enrage in <b>${clock(s.enrageIn)}</b>`;
      // Art
      const ah = s.art.hp / s.art.max;
      a('arthp').textContent = s.art.hp;
      a('artfill').style.width = (100 * ah) + '%';
      root.classList.toggle('low', ah < 0.3);
      a('cnum').textContent = s.art.combo;
      a('ctier').textContent = s.art.tierName;
      a('combo').dataset.t = s.art.tier;
      a('cbar').style.width = (100 * Math.min(1, s.art.progress)) + '%';
      const buffs = [];
      if (s.art.shield) buffs.push(`<span class="sb-buff gold">Shield x${s.art.shield}</span>`);
      if (s.art.over) buffs.push(`<span class="sb-buff gold">Overclock ${Math.ceil(s.art.over / 1000)}s</span>`);
      if (s.art.slow) buffs.push(`<span class="sb-buff gold">Slow mo ${Math.ceil(s.art.slow / 1000)}s</span>`);
      for (const b of s.art.buffs) if (['ward', 'hyper', 'root', 'split', 'crits', 'cshield', 'frenzy'].includes(b.name)) buffs.push(`<span class="sb-buff">${({ ward: 'Safe mode', hyper: 'Hyper thread', root: 'Root access', split: 'Quantum split', crits: 'Crits', cshield: 'Combo shield', frenzy: 'Frenzy x3' })[b.name]}${b.left ? ' ' + Math.ceil(b.left / 1000) + 's' : ''}</span>`);
      if (s.chaos.fog) buffs.push(`<span class="sb-buff chaos">Fog ${Math.ceil(s.chaos.fog / 1000)}s</span>`);
      if (s.chaos.speed) buffs.push(`<span class="sb-buff chaos">Speed up ${Math.ceil(s.chaos.speed / 1000)}s</span>`);
      const bh = buffs.join('');
      if (a('buffs').dataset.h !== bh) { a('buffs').innerHTML = bh; a('buffs').dataset.h = bh; }
      // countdown and the ready screen
      const c = a('count');
      if (s.status === 'countdown') { c.hidden = false; const n = Math.ceil(s.countdown / 1000); if (c.dataset.n !== String(n)) { c.dataset.n = n; c.textContent = n || 'Go'; c.classList.remove('beat'); void c.offsetWidth; c.classList.add('beat'); } }
      else c.hidden = true;
      paintTargets();
      if (B.id === 'compiler' && s.status !== 'won' && s.status !== 'lost') paintCode(); else a('code').hidden = true;
    }
    function paintTargets() {
      const typed = s.typed || '';
      // the finish phrase replaces everything else
      const fin = a('finish');
      if (s.finish) {
        fin.hidden = false;
        const h = `<small>Finish it</small><div class="sb-fw">${letters(s.finish.phrase, typed, true)}</div><i class="sb-tbar"><i data-a="ftbar"></i></i>`;
        if (fin.dataset.h !== typed + s.finish.phrase) { fin.innerHTML = h; fin.dataset.h = typed + s.finish.phrase; }
      } else { fin.hidden = true; fin.dataset.h = ''; }
      // the one line: everything to type is in Art's own words; the corner row stays empty
      a('type').classList.toggle('inline', !!s.line);
      if (s.line) {
        if (!flow) { a('line').innerHTML = ''; flow = WordFlow.create(a('line'), { lines: 3 }); }
        // the front word changed: the old one stays on the line as typed, red if it was missed
        const key = s.line.cur + '|' + s.line.next.slice(0, 3).join(' ');
        if (lineWas && lineWas.key !== key && lineWas.cur) { flow.push(lineWas.cur, lineWas.typed || lineWas.cur, !missed, lineWas.kind || false); missed = false; }
        lineWas = { key, cur: s.line.cur, typed: typed || (lineWas && lineWas.key === key ? lineWas.typed : ''), kind: s.line.head ? s.line.head.kind : null };
        const tags = s.line.tags.map(g => g && (g.kind === 'head' ? { ...g, color: OWN[g.own] } : g));
        flow.render({ cur: s.line.cur, typed, mine: true, next: s.line.next, tags });
        if (a('next').innerHTML) { a('next').innerHTML = ''; a('next').dataset.h = ''; }
      }
      // attack row: blocks, packets, spells and the crowd spell
      const row = s.line ? [] : s.targets.filter(x => ['block', 'spell', 'crowd'].includes(x.kind));
      const live = new Set(row.map(x => x.id));
      for (const [id, e] of chips) if (!live.has(id)) { e.classList.add('gone'); chips.delete(id); setTimeout(() => e.remove(), 250); }
      for (const x of row) {
        let e = chips.get(x.id);
        if (!e) {
          e = document.createElement('div');
          const sp = x.spell && Combat.spell(x.spell);
          e.className = `sb-chip ${x.kind}${sp ? ' r' + sp.rarity : ''}`;
          e.innerHTML = `<small>${x.kind === 'block' ? ({ breath: 'Block the breath', overflow: 'Block the overflow', lunge: 'Block the lunge', sweep: 'Block the tail sweep', slam: 'Block the wave', laser: 'Block the laser', breach: 'Block the breach' })[x.attack] || 'Block' : x.kind === 'crowd' ? 'Crowd spell' : 'Spell'}</small><b></b><i class="sb-tbar"><i></i></i>`;
          if (sp) e.style.setProperty('--sc', sp.color);
          a('attacks').append(e);
          chips.set(x.id, e);
        }
        const on = s.cur === x.id;
        const h = letters(x.word, typed, on);
        const w = e.querySelector('b');
        if (w.dataset.h !== h) { w.innerHTML = h; w.dataset.h = h; }
        e.classList.toggle('on', on);
      }
      // the word line: the stack word, or an echo of what Art is typing at a head or segment
      const line = a('line'), next = a('next');
      let lh = '', nh = '';
      if (s.line) { /* drawn above */ }
      else if (s.status === 'fight' && s.stack.length) {
        const on = s.cur === 'stack' || (!s.cur && typed);
        lh = `<span class="sb-w cur">${letters(s.stack[0], on ? typed : '', true)}</span>`;
        nh = s.stack.slice(1, 6).map((w, i) => `<span style="opacity:${(1 - i * 0.16).toFixed(2)}">${esc(w)}</span>`).join('');
      } else if (s.status === 'fight') {
        const tg = s.cur && s.targets.find(x => x.id === s.cur);
        lh = `<span class="sb-echo${tg ? '' : typed ? ' stray' : ''}">${typed ? esc(typed) : ''}<span class="at"></span></span>`;
        nh = B.id === 'hydra' ? '<span class="sb-hint">Type a head\'s word to hit it</span>' : '';
      }
      if (!s.line && flow) { flow = null; line.dataset.h = ''; }
      if (!s.line && line.dataset.h !== lh) { line.innerHTML = lh; line.dataset.h = lh; }
      if (!s.line && next.dataset.h !== nh) { next.innerHTML = nh; next.dataset.h = nh; }
      // labels pinned to the boss in 3D
      const pinned = s.targets.filter(x => ['head', 'weak', 'decoy', 'packet'].includes(x.kind));
      const keep = new Set(pinned.map(x => x.id));
      for (const [id, l] of labels) if (!keep.has(id)) { l.el.remove(); labels.delete(id); }
      for (const x of pinned) {
        let l = labels.get(x.id);
        if (!l) {
          const el2 = document.createElement('div');
          el2.className = `sb-label ${x.kind}${x.owner ? ' ' + x.owner : ''}`;
          el2.style.opacity = 0;   // shown once the next frame has placed it
          const head = x.kind === 'head' ? (B.heads || []).find(h => h.id === x.owner) : null;
          el2.innerHTML = `${head ? `<small>${esc(head.name)}<em>${esc(head.role)}</em></small>` : x.kind === 'weak' ? '<small>Weak point</small>' : x.kind === 'decoy' ? '<small>Decoy</small>' : ''}<b></b>${x.kind !== 'head' ? '<i class="sb-tbar"><i></i></i>' : '<i class="sb-hbar"><i></i></i>'}`;
          a('labels').append(el2);
          l = { el: el2, key: x.kind === 'head' ? 'head:' + x.owner : x.kind === 'weak' ? 'seg:front' : x.kind === 'decoy' ? 'seg:far' : 'packet:' + x.id, x };
          labels.set(x.id, l);
        }
        l.x = x;
        const on = s.cur === x.id;
        // in the one line a head's label shows its name and HP; its words are in the line
        const h = s.line && x.kind === 'head' ? '' : letters(x.word, typed, on);
        const w = l.el.querySelector('b');
        if (w.dataset.h !== h) { w.innerHTML = h; w.dataset.h = h; }
        l.el.classList.toggle('on', on);
        if (x.kind === 'head' && s.b && s.b.heads) { const hd = s.b.heads.find(h => h.id === x.owner); if (hd) l.el.querySelector('.sb-hbar > i').style.width = (100 * hd.hp / Math.max(1, hd.max)) + '%'; }
      }
    }
    function paintCode() {
      const box = a('code'), list = a('lines');
      box.hidden = false;
      const lines = (s.b && s.b.lines) || [];
      const keepIds = new Set(lines.map(l => l.id));
      for (const [id, e] of lineEls) if (!keepIds.has(id)) { e.remove(); lineEls.delete(id); }
      const typed = s.typed || '';
      for (const l of lines) {
        let e = lineEls.get(l.id);
        if (!e) { e = document.createElement('li'); e.innerHTML = '<code></code><i class="sb-tbar"><i></i></i>'; list.append(e); lineEls.set(l.id, e); }
        e.className = 'sb-cl ' + l.state;
        let k = 0;
        const parts = l.tpl.split(/(\{w2?\})/).map(p => {
          if (p !== '{w}' && p !== '{w2}') return esc(p);
          const f = l.fixes[k], i = k++;
          if (!f) return '';
          if (f.done) return `<span class="fx">${esc(l.state === 'live' || l.state === 'fixed' ? (f.good || f.bad) : f.bad)}</span>`;
          const cur = s.cur && s.cur === l.tid && i === l.k;
          const hint = f.good ? `<small>${esc(f.good)}</small>` : '';
          return `<span class="bug${cur ? ' on' : ''}${l.state === 'compiled' ? ' dead' : ''}">${esc(f.bad)}${cur ? `<em>${letters(typed, typed, false)}</em>` : ''}${hint}</span>`;
        }).join('');
        const code = e.querySelector('code');
        if (code.dataset.h !== parts) { code.innerHTML = parts; code.dataset.h = parts; }
        e.dataset.left = l.left; e.dataset.total = l.total;
      }
      // keep the line elements in the order the fight lists them
      lines.forEach(l => { const e = lineEls.get(l.id); if (e && e !== list.lastElementChild) list.append(e); });
    }
    // every frame: labels follow the boss, timer bars run between snapshots
    const pt = {};
    function frame() {
      if (!s) return;
      for (const [, l] of labels) {
        const p = scene.anchor(l.key, pt);
        if (!p || p.z > 1) { l.el.style.opacity = 0; continue; }
        l.el.style.opacity = '';
        l.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
        const bar = l.el.querySelector('.sb-tbar > i');
        if (bar && l.x.total) bar.style.width = (100 * left(l.x) / l.x.total).toFixed(1) + '%';
      }
      for (const x of s.targets) {
        const e = chips.get(x.id);
        if (e && x.total) e.querySelector('.sb-tbar > i').style.width = (100 * left(x) / x.total).toFixed(1) + '%';
      }
      if (s.finish) { const b = root.querySelector('[data-a="ftbar"]'); if (b) b.style.width = (100 * left(s.finish) / s.finish.total).toFixed(1) + '%'; }
      if (B.id === 'compiler') {
        const r = scene.screenRect(), box = a('code');
        if (r && r.w > 40) { box.style.left = r.x + 'px'; box.style.top = r.y + 'px'; box.style.width = r.w + 'px'; box.style.height = r.h + 'px'; }
        for (const [, e] of lineEls) { const lt = +e.dataset.left - (performance.now() - rx), tt = +e.dataset.total; const b = e.querySelector('.sb-tbar > i'); if (b && tt) b.style.width = (e.classList.contains('live') ? Math.max(0, 100 * lt / tt) : 0).toFixed(1) + '%'; }
      }
    }

    // ---------- events: ticker, popups, alerts, banners ----------
    function event(n, d) {
      scene.event(n, d);
      if (n === 'miss' || n === 'fizzle') missed = true;
      if (n === 'hit') {
        const name = d.src === 'spell' ? (Combat.spell(d.spell) || {}).word : d.src === 'sever' ? 'head cut' : d.src === 'weak' ? 'weak point' : d.src === 'packet' ? 'packet back' : d.src === 'fix' ? 'bug fix' : d.src === 'counter' ? 'counter' : d.word;
        addTick(d.amount, name || '', d.src, d.crit);
      }
      if (n === 'phase') {
        banner(`Phase ${d.n}`, d.line, 'phase', 2600);
        if (d.n > lastPhase) lastPhase = d.n;
      }
      if (n === 'enrage' && !enrageShown) { enrageShown = true; banner('Enraged', 'It attacks faster and hits 50% harder.', 'enrage', 2400); }
      if (n === 'finish') banner('Finish it', 'Type the phrase before the bar runs out.', 'finish', 1400);
      if (n === 'finishFail') banner('Too slow', 'It healed to 12% HP.', 'enrage', 2000);
      if (n === 'neck' && d.on) banner('Neck open', 'Core words deal triple damage for 5 seconds.', 'phase', 1600);
      if (n === 'hype' && d.full) { const sp = Combat.spell(d.spell); banner('Hype train', `The crowd gave Art ${sp ? sp.word : 'a spell'}. Type it to cast it.`, 'hype', 2400); }
      if (n === 'drop' || (n === 'support' && !d.drop)) alert(d);   // a support item alerts as it drops, chaos as it lands
      if (n === 'go') { lastPhase = 1; enrageShown = false; }
      // big callouts on the moments that matter: a block, an interrupt, a hit on Art
      if (n === 'block') call('BLOCKED', 'block', 'art');
      if (n === 'warded' || n === 'shielded') call(n === 'warded' ? 'WARDED' : 'SHIELDED', 'block', 'art');
      if (n === 'cancel') call('INTERRUPTED', 'cut', d.attack === 'breath' ? 'head:root' : d.attack === 'mend' ? 'head:patch' : d.attack === 'lunge' || d.attack === 'sweep' ? 'head' : 'core');
      if (n === 'hurt') { call('-' + fmt(d.amount), d.amount >= 12 ? 'hurt big' : 'hurt', 'art'); jolt(d.amount >= 12); }
    }
    function call(text, kind, key) {
      const layer = a('pops'), p = scene.anchor(key, {}); if (!layer || !p) return;
      const e = document.createElement('span');
      e.className = 'sb-call ' + kind;
      e.textContent = text;
      // Art's callouts sit well above the typing line so they never cover the words
      e.style.left = p.x + 'px'; e.style.top = (key === 'art' ? Math.min(p.y - 60, root.clientHeight * 0.42) : p.y - 30) + 'px';
      layer.append(e);
      setTimeout(() => e.remove(), 1100);
    }
    function jolt(heavy) {
      if (opts().reduceShake) return;
      root.classList.remove('jolt', 'jolt-big'); void root.offsetWidth;
      root.classList.add(heavy ? 'jolt-big' : 'jolt');
      clearTimeout(jolt.t); jolt.t = setTimeout(() => root.classList.remove('jolt', 'jolt-big'), 450);
    }
    function addTick(amount, name, src, crit) {
      const t = performance.now();
      dpsWin.push({ t, amount });
      const list = a('ticker');
      const li = document.createElement('li');
      li.className = `sb-tk ${src}${crit ? ' crit' : ''}`;
      li.innerHTML = `<b>${fmt(amount)}</b><span>${esc(name)}</span>`;
      list.prepend(li);
      while (list.children.length > 7) list.lastElementChild.remove();
    }
    function pop(amount, x, y, o) {
      const layer = a('pops'); if (!layer) return;
      const e = document.createElement('span');
      e.className = 'sb-pop' + (o.crit ? ' crit' : '') + (o.big ? ' big' : '') + (amount >= 300 ? ' huge' : '') + ' ' + (o.src || '');
      e.textContent = fmt(amount);
      e.style.left = (x + (Math.random() - 0.5) * 60) + 'px';
      e.style.top = (y + (Math.random() - 0.5) * 30) + 'px';
      layer.append(e);
      while (layer.children.length > 24) layer.firstElementChild.remove();
      setTimeout(() => e.remove(), 1100);
    }
    let alertQ = [], alertOn = false;
    function alert(d) { alertQ.push(d); if (alertQ.length > 4) alertQ.shift(); if (!alertOn) nextAlert(); }
    function nextAlert() {
      const d = alertQ.shift();
      if (!d) { alertOn = false; return; }
      alertOn = true;
      const it = SuperData.item(d.id) || { name: d.id, text: '' };
      const box = a('alerts');
      const e = document.createElement('div');
      e.className = 'sb-alert ' + d.kind + (d.you ? ' you' : '');
      e.innerHTML = `<span class="sb-ag">${esc(ITEM_GLYPH[d.id] || '')}</span><div><p><b>${esc(d.buyer)}</b> sent <b>${esc(it.name)}</b></p><small>${esc(it.text)}</small></div><span class="sb-ac">${fmt(d.price)}</span>`;
      box.append(e);
      setTimeout(() => { e.classList.add('out'); setTimeout(() => { e.remove(); nextAlert(); }, 260); }, 2000 * (window.__sbHold || 1));
    }
    let bannerT = 0;
    function banner(title, line, kind, ms) {
      const b = a('banner');
      b.className = 'sb-banner ' + kind;
      b.innerHTML = `<b>${esc(title)}</b>${line ? `<span>${esc(line)}</span>` : ''}`;
      b.hidden = false;
      b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
      clearTimeout(bannerT);
      bannerT = setTimeout(() => { b.hidden = true; }, ms * (window.__sbHold || 1));
    }
    const dpsT = setInterval(() => {
      const t = performance.now();
      dpsWin = dpsWin.filter(x => t - x.t < 5000);
      const v = Math.round(dpsWin.reduce((q2, x) => q2 + x.amount, 0) / 5);
      const el2 = a('dps'); if (el2) el2.innerHTML = s && s.status === 'fight' && v ? `<b>${fmt(v)}</b> damage a second` : '';
    }, 500);

    function ready(text) { const r = a('ready'); r.hidden = !text; if (text) r.innerHTML = text; }
    function result(r, buttons) {
      const box = a('result');
      if (!r) { box.hidden = true; return; }
      const top = r.top.length ? r.top.map((x, i) => `<li><span>${i + 1}</span><b>${esc(x.name)}${x.you ? ' <em>you</em>' : ''}</b><span>${fmt(x.coins)} coins</span></li>`).join('') : '<li class="none">No support this fight</li>';
      const spells = r.casts ? `${r.casts}` : '0';
      box.innerHTML = `
        <div class="sb-card ${r.won ? 'won' : 'lost'}">
          <div class="sb-card-h"><span class="label">// ${r.won ? 'BOSS DOWN' : 'FIGHT LOST'}</span><h2>${r.won ? `${esc(r.bossName)} is down` : `Art lost to ${esc(r.bossName)}`}</h2><p>${esc(r.dialName)} difficulty, phase ${r.phase} of 3</p></div>
          <dl class="sb-stats">
            <div><dt>Time</dt><dd>${clock(r.ms)}</dd></div>
            <div><dt>wpm</dt><dd>${r.wpm}</dd></div>
            <div><dt>Accuracy</dt><dd>${r.acc}%</dd></div>
            <div><dt>Best combo</dt><dd>${r.bestCombo}</dd></div>
            <div><dt>Spells cast</dt><dd>${spells}</dd></div>
            <div><dt>Support received</dt><dd>${r.support}<small>${fmt(r.supportCoins)} coins</small></dd></div>
          </dl>
          <div class="sb-top3"><h3>Top supporters</h3><ol>${top}</ol></div>
          <div class="sb-card-f"><span>10000WPM.com</span><span>${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
          ${buttons || ''}
        </div>`;
      box.hidden = false;
    }
    function dispose() { clearInterval(dpsT); clearTimeout(bannerT); scene.dispose(); }
    return { root, state, event, ready, result, dispose, scene, banner, setReduce: on => scene.setReduce(on), get snap() { return s; }, get flow() { return flow; } };
  }

  // ---------- the side column: camera slot, hype train and chat ----------
  function Side(host, { mode, onSay }) {
    host.innerHTML = `
      <div class="sb-cam" data-s="cam"><video muted playsinline autoplay data-s="video" hidden></video><span class="sb-camoff" data-s="camoff">Camera off</span></div>
      <div class="sb-hype"><div class="sb-hype-h"><b>Hype train</b><span data-s="hypen">0 / 300</span></div><i class="sb-hypebar"><i data-s="hypefill"></i></i></div>
      <div class="sb-chat">
        <div class="sb-chat-h"><b>Simulated viewers</b><span data-s="watching"></span></div>
        <ol class="sb-msgs" data-s="msgs" aria-live="off"></ol>
        ${mode === 'watch' ? '<form class="sb-say" data-s="say"><label class="sr-only" for="sb-say-in">Chat message</label><input id="sb-say-in" maxlength="200" autocomplete="off" placeholder="Message"><button class="btn sm" type="submit">Send</button></form>' : ''}
      </div>`;
    const g = k => host.querySelector(`[data-s="${k}"]`);
    if (mode === 'watch') g('say').addEventListener('submit', e => {
      e.preventDefault();
      const i = g('say').querySelector('input'), v = i.value.trim();
      if (!v) return;
      onSay(v); i.value = '';
    });
    function chat(m) {
      const list = g('msgs');
      const li = document.createElement('li');
      if (!m.sim) li.className = 'real';
      li.innerHTML = `<b style="--h:${hue(m.user)}">${esc(m.user)}</b> <span>${esc(m.text)}</span>`;
      list.append(li);
      while (list.children.length > 60) list.firstElementChild.remove();
      list.scrollTop = list.scrollHeight;
    }
    function hype(h) { g('hypen').textContent = `${h.n} / ${h.goal}`; g('hypefill').style.width = (100 * h.n / h.goal) + '%'; }
    function watching(n, sim) { g('watching').textContent = `${fmt(n)} watching${sim ? '' : ''}`; }
    return { chat, hype, watching, cam: g('cam'), video: g('video'), camoff: g('camoff') };
  }

  // ---------- sound for both views ----------
  function Sound() {
    const A = window.SuperAudio;
    const cs = window.Combat && Combat.Audio ? Combat.Audio.create({ ctx: () => A.combat().ac, out: () => A.combat().bus, on: () => A.on }) : null;
    const c = (n, x) => { if (cs) cs.play(n, x); };
    let boss = 'hydra', lastCount = -1, lastS = null;
    function event(n, d, snap) {
      switch (n) {
        case 'hit':
          if (d.src === 'spell') { const sp = Combat.spell(d.spell); if (sp && sp.strike) c(sp.strike, d.amount); }
          else if (d.src === 'sever') A.play('sever');
          else if (d.src === 'weak') A.play('weak');
          else if (d.src === 'packet') A.play('packet');
          else if (d.src === 'counter') A.play('counter');
          else if (d.crit) A.play('crit');
          else { A.play('hit', d.tier || 0); if (d.tier >= 1) c('shot' + Math.min(4, d.tier)); }
          break;
        case 'cast': c(d.spell); if (d.rarity >= 3) A.duck(0.5, d.rarity >= 4 ? 3.2 : 2.4); break;
        case 'fizzle': c('fizzle'); break;
        case 'tier': c('tierUp', d.tier); break;
        case 'comboDrop': if (d.from >= 10) c('break'); break;
        case 'offer': c('offer'); break;
        case 'warded': c('ward'); break;
        case 'hurt': A.play('hurt'); break;
        case 'shielded': A.play('shielded'); break;
        case 'block': A.play('block'); break;
        case 'windup':
          if (d.kind === 'spit' || d.kind === 'bomb') A.play('weakOpen');
          else if (d.kind === 'slam') A.play('windupSlam', d.ms);
          else if (d.kind === 'laser') A.play('windupLaser', d.ms);
          else if (d.kind === 'breach') A.play('windupBreach', d.ms);
          else A.play('windup', d.ms);
          break;
        case 'key': if (d.finish && d.good) A.play('key', lastS && lastS.typed ? lastS.typed.length : 0); break;
        case 'attack': if (d.kind === 'bite') A.play('bite'); if (d.kind === 'mend') A.play('mend'); break;
        case 'regrow': A.play('regrow'); break;
        case 'neck': if (d.on) A.play('neck'); break;
        case 'compile': A.play('compile'); break;
        case 'fix': A.play('fix', d.inOrder ? 1 : 0); break;
        case 'order': A.play('order'); break;
        case 'weakOpen': A.play('weakOpen'); break;
        case 'decoy': A.play('decoy'); break;
        case 'packet': if (!d.returned) A.play('packetHit'); break;
        case 'drop': A.play('support'); break;
        case 'support': if (!d.drop) A.play(d.kind === 'chaos' ? 'chaos' : 'support'); else if (!d.late) A.play('pickup'); break;
        case 'hype': if (d.full) A.play('hype'); break;
        case 'phase': A.play('phase'); A.bed(boss, d.n); break;
        case 'enrage': A.play('enrage'); A.enrage(); break;
        case 'finish': A.play('finish'); break;
        case 'finishFail': A.play('hurt'); A.bed(boss, 3); break;
        case 'win': A.victory(); break;
        case 'lose': A.defeat(); break;
        case 'miss': A.play('typo'); break;
        case 'go': A.play('count', true); A.bed(boss, 1); break;
      }
      void snap;
    }
    function state(s) {
      boss = s.boss; lastS = s;
      if (s.status === 'countdown') { const n = Math.ceil(s.countdown / 1000); if (n !== lastCount && n > 0) { lastCount = n; A.play('count', false); } }
      else lastCount = -1;
    }
    // joining mid-fight starts the bed for the phase in progress
    function sync(s) { boss = s.boss; if (s.status === 'fight' || s.status === 'finish') { if (s.enraged) A.enrage(); else A.bed(s.boss, s.phase); } }
    return { event, state, sync };
  }

  // ---------- the lobby ----------
  function Lobby(el) {
    const o = store('wpm-sb-pick') || { boss: 'hydra', dial: 'typemaster' };
    el.innerHTML = `
      <div class="sb-lobby">
        <div class="play-head"><div class="title-block"><h1>Superboss_</h1><p>// ART'S LIVE FIGHTS</p></div>
          <div class="sb-go">
          <a class="btn" data-k="stream" href="#/superboss/stream/hydra/typemaster">Stream this fight</a>
          <a class="btn out" data-k="watch" href="#/superboss/watch">Watch the stream</a>
          </div>
        </div>
        <p class="sb-lede">Art fights these bosses live on stream. Viewers watch here and spend coins to help him or make the fight harder.</p>
        <div class="sb-pick">
          <ol class="sb-bosses" aria-label="Bosses">
            ${SuperData.BOSSES.map(b => `<li><button type="button" class="sb-bossbtn" data-b="${b.id}"><span class="sb-bn">0${b.n}</span><span class="sb-bt"><b>${esc(b.name)}</b><span>${esc(b.core)}</span><small>3 phases, enrages at ${clock(b.enrageS * 1000)}</small></span></button></li>`).join('')}
          </ol>
          <div class="sb-preview" data-k="preview"><p class="sb-look" data-k="look"></p></div>
        </div>
        <section class="sb-dialbox" aria-labelledby="sb-dial-h">
          <h2 id="sb-dial-h">Difficulty</h2>
          <div class="sb-dials" role="radiogroup" aria-labelledby="sb-dial-h">
            ${SuperData.DIALS.map(d => `<button type="button" role="radio" data-d="${d.id}"><b>${d.name}</b><span>${d.wpm} wpm</span></button>`).join('')}
          </div>
          <p class="sb-dialnote" data-k="dialnote"></p>
        </section>
        <p class="sb-note">Art opens Stream this fight on his streaming PC and captures the window in OBS at 1920x1080. Viewers open Watch the stream.</p>
      </div>`;
    const q = k => el.querySelector(`[data-k="${k}"]`);
    let preview = null;
    function set() {
      store('wpm-sb-pick', o);
      el.querySelectorAll('[data-b]').forEach(b => b.setAttribute('aria-pressed', b.dataset.b === o.boss));
      el.querySelectorAll('[data-d]').forEach(b => b.setAttribute('aria-checked', b.dataset.d === o.dial));
      const d = SuperData.dial(o.dial), B = SuperData.boss(o.boss);
      q('dialnote').textContent = `Timers give a ${d.wpm} wpm typist just enough time. The boss has ${fmt(Math.round(d.wpm * 26 * B.hpK))} HP.`;
      q('look').textContent = B.look;
      q('stream').href = `#/superboss/stream/${o.boss}/${o.dial}`;
      q('watch').href = `#/superboss/watch/${o.boss}/${o.dial}`;
      if (preview) { preview.setBoss(o.boss); preview.apply(idle(o.boss)); }
    }
    el.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => { o.boss = b.dataset.b; set(); }));
    el.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { o.dial = b.dataset.d; set(); }));
    preview = SuperScene.mount(q('preview'), { boss: o.boss });
    preview.ready.then(() => preview.apply(idle(o.boss))).catch(() => {});
    set();
    return () => { if (preview) preview.dispose(); };
  }
  // a still snapshot for the lobby preview
  function idle(boss) {
    return { v: 1, boss, phase: 1, hp: 1, maxHp: 1, status: 'ready', enraged: false, targets: [], stack: [], typed: '', art: { hp: 100, max: 100, shield: 0 }, chaos: {}, b: boss === 'hydra' ? { heads: ['fork', 'root', 'patch'].map(id => ({ id, up: true, hp: 1, max: 1 })), neck: 0 } : boss === 'compiler' ? { lines: [] } : { dive: 0 } };
  }

  // ---------- the streamer view ----------
  function Streamer(el, bossId, dialId) {
    const B = SuperData.boss(bossId), T = SuperData.dial(dialId);
    store('wpm-sb-pick', { boss: B.id, dial: T.id });
    const o = opts();
    el.innerHTML = `
      <div class="sb-wrap">
        <div class="sb-stage" data-k="stage">
          <div class="sb-arenabox" data-k="arena"></div>
          <aside class="sb-side" data-k="side" aria-label="Camera and chat"></aside>
          <button class="sb-exit" type="button" data-k="exit">Exit streamer mode</button>
        </div>
        <section class="sb-controls" aria-label="Stream settings">
          <div class="sb-crow">
            <div class="sb-cgroup"><span class="label">Boss</span>${SuperData.BOSSES.map(b => `<a class="sb-seg" href="#/superboss/stream/${b.id}/${T.id}"${b.id === B.id ? ' aria-current="true"' : ''}>${esc(b.name)}</a>`).join('')}</div>
            <div class="sb-cgroup"><span class="label">Difficulty</span>${SuperData.DIALS.map(d => `<a class="sb-seg" href="#/superboss/stream/${B.id}/${d.id}"${d.id === T.id ? ' aria-current="true"' : ''}>${d.name}</a>`).join('')}</div>
            <button class="btn out sm" type="button" data-k="restart">Restart</button>
          </div>
          <div class="sb-crow">
            <button class="btn sm" type="button" data-k="cam">Camera on</button>
            <label class="sb-field">Camera slot <select data-k="slot"><option value="frame">Webcam frame</option><option value="clear">Transparent for OBS</option><option value="green">Green screen</option></select></label>
            <label class="sb-check"><input type="checkbox" data-k="duck"> Duck music under my mic</label>
            <label class="sb-field">Music <input type="range" min="0" max="1" step="0.05" data-k="music"></label>
            <label class="sb-field">Sound effects <input type="range" min="0" max="1" step="0.05" data-k="sfx"></label>
            <label class="sb-check"><input type="checkbox" data-k="shake"> Reduce shake</label>
            <label class="sb-check"><input type="checkbox" data-k="chatOn"> Show chat</label>
            <button class="btn out sm" type="button" data-k="smode">Streamer mode</button>
          </div>
          <p class="sb-cnote" data-k="cnote">Streamer mode hides the site menu, your coins and your name, and makes the text bigger. F9 turns it on and off. Viewers watch at <a href="#/superboss/watch">#/superboss/watch</a>.</p>
        </section>
      </div>`;
    const q = k => el.querySelector(`[data-k="${k}"]`);
    const stage = q('stage');
    const arena = Arena(q('arena'), { mode: 'stream', boss: B.id });
    const side = Side(q('side'), { mode: 'stream' });
    const sound = Sound();
    let fight, host, bc = SuperStream.broadcast(), raf = 0, last = 0, keys = null, recorded = false, camStream = null, micStream = null, botT = 0;
    // the fight's clock stops while the Esc menu is open (js/app/game-guard.js)
    let holdAt = 0, held = 0;
    const clockNow = () => (holdAt || performance.now()) - held;
    const offs = [];

    function newFight() {
      if (host) host.close();
      offs.forEach(f => f()); offs.length = 0;
      holdAt = 0;
      fight = SuperFight.create({ boss: B.id, dial: T.id, now: clockNow, inline: { flow: () => arena.flow } });
      host = SuperStream.host([bc], { fight, name: 'Art', sim: true, onChat: m => side.chat(m), onViewers: n => side.watching(n) });
      offs.push(fight.on('*', (n, d) => {
        arena.event(n, d);
        sound.event(n, d);
        if (n === 'support') { /* counted in the result */ }
        if (n === 'cast' && window.WPM) WPM.track('spell_cast', { spell: d.spell, mode: 'superboss' });
        if (n === 'win' || n === 'lose') end(d);
      }));
      recorded = false;
      arena.result(null);
      arena.ready('<b>Press Enter to start the fight</b>');
      arena.state(fight.state());
    }
    function begin() {
      if (fight.status !== 'ready') return;
      arena.ready('');
      SuperAudio.unlock();
      fight.start();
    }
    function save(r) {
      if (recorded || !r.keys) return null;
      recorded = true;
      const words = r.correct / 5, accF = Math.max(0, (r.acc - 50) / 50);
      const bonus = r.won ? ((SuperData.R().win || {})[T.id] || 0) : 0;
      const res = WPM.record({ mode: 'superboss', wpm: r.wpm, acc: r.acc, correct: r.correct, keys: r.keys, ms: r.ms, won: r.won, difficulty: T.id, boss: B.id, coins: Math.round(words / 2 * accF) + bonus });
      if (r.won) WPM.track('superboss_win', { boss: B.id, dial: T.id, ms: r.ms, wpm: r.wpm, combo: r.bestCombo });
      if (r.bestCombo) WPM.track('combo', { n: r.bestCombo, mode: 'superboss' });
      return res;
    }
    const shareText = r => r.won ? `I beat ${r.bossName} on ${r.dialName} in ${clock(r.ms)} on Stormtyper: ${r.wpm} wpm, ${r.bestCombo} best combo. Can you beat it?`
      : `I took ${r.bossName} on ${r.dialName} to phase ${r.phase} of 3 on Stormtyper: ${fmt(Math.round(r.dmg))} damage, ${r.wpm} wpm. Can you beat it?`;
    function end(r) {
      setTimeout(() => host && host.end(), 300);
      const res = save(r);
      const gain = res ? `<p class="sb-gain">${UI.coin()}<span><b>+${fmt(res.coins)}</b> coins and <b>+${fmt(res.xp)}</b> XP</span></p>` : '';
      setTimeout(() => {
        arena.result(r, `${gain}<div class="sb-card-b"><button class="btn" type="button" data-r="again">Fight again</button><a class="btn out" href="#/superboss">Pick another boss</a></div><div class="sb-share">${GameGuard.shareHtml(shareText(r))}</div>`);
        GameGuard.wire(q('arena'), shareText(r));
      }, r.won ? 2200 : 1600);
    }
    // leaving mid-fight asks first, Esc pauses, and ending shows the result (Gid, 28 Nov 2026)
    GameGuard.start({
      name: 'fight',
      live: () => !!(fight && ['countdown', 'fight', 'finish'].includes(fight.status) && fight.result().keys > 0),
      pause: on => {
        if (on) { if (!holdAt) holdAt = performance.now(); arena.scene.pause(true); return; }
        if (holdAt) { held += performance.now() - holdAt; holdAt = 0; }
        arena.scene.pause(false);
      },
      end: () => {
        holdAt = 0;
        const r = fight.result(), res = save(r);
        return {
          label: 'FIGHT ENDED', title: `You left ${r.bossName}`, sub: `${r.dialName} difficulty, phase ${r.phase} of 3`,
          stats: [['Time played', clock(r.ms)], ['Damage dealt', Math.round(r.dmg)], ['Words typed right', r.words],
            ['wpm', r.wpm], ['Accuracy', r.acc + '%'], ['Best combo', r.bestCombo], ['Blocks', r.blocks], ['Spells cast', r.casts], ['Support received', r.support]],
          xp: res ? res.xp : 0, coins: res ? res.coins : 0, share: shareText(r),
        };
      },
      after: () => { newFight(); if (keys) keys.focus(); },
    });
    q('arena').addEventListener('click', e => { if (e.target.closest('[data-r="again"]')) { newFight(); if (keys) keys.focus(); } });

    // typing
    keys = TT.captureKeys(q('arena'), {
      label: 'Type the words to fight the boss. Press Enter to start.',
      onChar: ch => { SuperAudio.unlock(); fight.char(ch); },
      onBack: whole => fight.back(whole),
      onKey: k => { if (k === 'Enter') { if (fight.status === 'ready') begin(); else fight.char(' '); } },
    });
    if (matchMedia('(pointer: fine)').matches) keys.focus();
    const forward = e => {
      if (!e.isTrusted) return;
      const a = document.activeElement;
      if (a === keys.el) return;
      if (a && a !== document.body && a.id !== 'view' && (!a.closest('.sb-stage') || /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1 && e.key !== 'Enter') return;
      e.preventDefault(); keys.focus();
      keys.el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
    };
    document.addEventListener('keydown', forward);
    const exitKey = e => { if (e.key === 'F9' || (e.key === 'Escape' && document.documentElement.classList.contains('sb-streamer') && fight.status !== 'fight' && fight.status !== 'finish')) { streamerMode(!document.documentElement.classList.contains('sb-streamer')); } };
    document.addEventListener('keydown', exitKey);

    // the loop
    function loop(t) {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.25, (t - last) / 1000) : 0; last = t;
      fight.tick();
      host.update(dt);
      const s = fight.state();
      arena.state(s); sound.state(s); side.hype(s.hype);
    }
    // a hidden tab still runs the fight so a stream capture never stalls
    const bg = setInterval(() => { if (document.hidden && fight) { fight.tick(); host.update(0.1); } }, 100);

    // ---------- settings ----------
    const html = document.documentElement;
    function streamerMode(on) {
      html.classList.toggle('sb-streamer', on);
      q('smode').textContent = on ? 'Exit streamer mode' : 'Streamer mode';
      o.streamer = on; saveOpts(o);
      if (keys) keys.focus();
    }
    function slot(v) {
      o.slot = v; saveOpts(o);
      side.cam.dataset.slot = v;
      html.classList.toggle('sb-clear', v === 'clear');
      side.camoff.hidden = v !== 'frame' || !!camStream;
    }
    async function camera(on) {
      if (!on) {
        if (camStream) camStream.getTracks().forEach(t => t.stop());
        camStream = null; side.video.hidden = true; side.video.srcObject = null;
        q('cam').textContent = 'Camera on'; slot(o.slot);
        return;
      }
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        side.video.srcObject = camStream; side.video.hidden = false; side.video.play().catch(() => {});
        q('cam').textContent = 'Camera off';
        if (o.slot !== 'frame') { q('slot').value = 'frame'; }
        slot('frame');
      } catch (e) {
        camStream = null;
        q('cnote').textContent = 'The browser did not allow the camera. Allow it in the address bar and press Camera on again.';
      }
    }
    async function duckMic(on) {
      o.duck = on; saveOpts(o);
      if (!on) { if (micStream) micStream.getTracks().forEach(t => t.stop()); micStream = null; SuperAudio.mic(null); return; }
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); SuperAudio.mic(micStream); }
      catch (e) { q('duck').checked = false; o.duck = false; saveOpts(o); q('cnote').textContent = 'The browser did not allow the microphone. Allow it in the address bar to duck the music.'; }
    }
    q('cam').addEventListener('click', () => camera(!camStream));
    q('slot').value = o.slot; slot(o.slot);
    q('slot').addEventListener('change', e => slot(e.target.value));
    q('duck').checked = false; q('duck').addEventListener('change', e => duckMic(e.target.checked));
    const vol = SuperAudio.vol();
    q('music').value = vol.music; q('sfx').value = vol.sfx;
    q('music').addEventListener('input', e => SuperAudio.setVol({ music: +e.target.value }));
    q('sfx').addEventListener('input', e => SuperAudio.setVol({ sfx: +e.target.value }));
    q('shake').checked = !!o.reduceShake;
    q('shake').addEventListener('change', e => { o.reduceShake = e.target.checked; saveOpts(o); arena.setReduce(o.reduceShake); });
    q('chatOn').checked = o.chat !== false;
    const chatShow = on => { stage.classList.toggle('nochat', !on); o.chat = on; saveOpts(o); };
    chatShow(o.chat !== false);
    q('chatOn').addEventListener('change', e => chatShow(e.target.checked));
    q('smode').addEventListener('click', () => streamerMode(!html.classList.contains('sb-streamer')));
    q('exit').addEventListener('click', () => streamerMode(false));
    q('restart').addEventListener('click', () => { newFight(); keys.focus(); });
    let moveT = 0;
    const moved = () => { stage.classList.add('moved'); clearTimeout(moveT); moveT = setTimeout(() => stage.classList.remove('moved'), 1800); };
    stage.addEventListener('pointermove', moved);
    if (o.streamer) streamerMode(true);
    const snd = e => SuperAudio.setOn(!!(e.detail && e.detail.on));
    addEventListener('wpm-sound', snd);
    SuperAudio.setOn(TT.soundOn());

    newFight();
    raf = requestAnimationFrame(loop);

    // test hooks
    window._sb = {
      fight: () => fight, state: () => fight.state(), start: () => begin(), arena: () => arena, scene: () => arena.scene.info(), bench: n => arena.scene.bench(n), cam: (p, l, f) => arena.scene.cam(p, l, f), model: () => arena.scene.model(),
      phase: n => fight.debug.phase(n), hp: f => fight.debug.hp(f), finish: ms => fight.debug.finish(ms), enrage: () => fight.debug.enrage(),
      support: (id, buyer) => fight.support(id, buyer || 'nova_k'), combo: n => fight.debug.combo(n), offer: ids => fight.debug.offer(ids), crowd: () => fight.debug.crowd(),
      artHp: n => fight.debug.artHp(n), type: s => { for (const ch of s) fight.char(ch); },
      pause: on => arena.scene.pause(on), slow: k => arena.scene.slow(k), audio: () => SuperAudio.state(), render: (n, a2, s) => SuperAudio.render(n, a2, s), mix: t => SuperAudio.renderMix(t),
      camera: on => camera(on), streamer: on => streamerMode(on), slot: v => { q('slot').value = v; slot(v); },
      // a simulated typist for tests and screenshots
      bot: (wpm = 165) => {
        clearInterval(botT);
        if (!wpm) return;
        const b = SuperBot.create({ state: () => fight.state(), char: c => fight.char(c), back: w => fight.back(w), now: () => performance.now() }, { wpm, acc: 0.985, react: 240 });
        botT = setInterval(() => b.step(), 6);
      },
    };
    return () => {
      GameGuard.stop();
      cancelAnimationFrame(raf); clearInterval(bg); clearInterval(botT);
      document.removeEventListener('keydown', forward);
      document.removeEventListener('keydown', exitKey);
      removeEventListener('wpm-sound', snd);
      offs.forEach(f => f());
      if (host) host.close();
      if (bc.close) bc.close();
      camera(false);
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      SuperAudio.stop();
      arena.dispose();
      html.classList.remove('sb-streamer', 'sb-clear');
      delete window._sb;
    };
  }

  // ---------- the viewer view ----------
  function Viewer(el, bossId, dialId) {
    let B = SuperData.boss(bossId || 'hydra'), T = SuperData.dial(dialId || 'typemaster');
    el.innerHTML = `
      <div class="sb-watch">
        <div class="sb-wbar">
          <span class="sb-simtag" data-k="tag">Connecting</span>
          <h1 data-k="title">Art vs ${esc(B.name)}</h1>
          <span class="sb-party"><b data-k="party">0</b> in the watch party</span>
        </div>
        <p class="sb-simnote" data-k="simnote" hidden>Art isn't live yet. A bot types for him and the chat and other buyers are bots too.</p>
        <div class="sb-wgrid">
          <div class="sb-warena" data-k="arena"></div>
          <aside class="sb-wside">
            <section class="sb-shop" aria-labelledby="sb-shop-h">
              <div class="sb-shop-h"><h2 id="sb-shop-h">Support Art</h2><span class="coins-inline">${UI.coin()}<b data-k="coins">0</b></span></div>
              <p class="sb-shopnote" data-k="shopnote">Items land in the fight with your name on them.</p>
              <h3>Help</h3>
              <div class="sb-items" data-k="help"></div>
              <h3>Chaos <small data-k="chaosnote"></small></h3>
              <div class="sb-items" data-k="chaos"></div>
            </section>
            <div class="sb-side wside" data-k="side"></div>
          </aside>
        </div>
      </div>`;
    const q = k => el.querySelector(`[data-k="${k}"]`);
    const arena = Arena(q('arena'), { mode: 'watch', boss: B.id });
    const side = Side(q('side'), { mode: 'watch', onSay: v => watch.say(WPM.profile().name, v) });
    const sound = Sound();
    let snap = null, mode = 'wait', synced = false, nextT = 0, busy = false;
    const items = SuperData.ITEMS;
    function itemBtn(it) { return `<button type="button" class="sb-item ${it.kind}" data-i="${it.id}" title="${esc(it.text)}"><span class="sb-ig">${esc(ITEM_GLYPH[it.id])}</span><span class="sb-it"><b>${esc(it.name)}</b><small>${esc(it.text)}</small></span><span class="sb-ip">${UI.coin()}${SuperData.price(it.id)}</span></button>`; }
    q('help').innerHTML = items.filter(i => i.kind === 'support').map(itemBtn).join('');
    q('chaos').innerHTML = items.filter(i => i.kind === 'chaos').map(itemBtn).join('');
    const coins = () => { q('coins').textContent = fmt(WPM.coins()); paintShop(); };
    const offCoins = WPM.on('coins', coins);
    function paintShop() {
      const c = WPM.coins(), live = snap && (snap.status === 'fight' || snap.status === 'finish' || snap.status === 'countdown');
      el.querySelectorAll('[data-i]').forEach(b => {
        const it = SuperData.item(b.dataset.i), p = SuperData.price(it.id);
        b.disabled = busy || !live || c < p || (it.kind === 'chaos' && !!(snap && snap.chaos.block));
      });
      q('chaosnote').textContent = snap && snap.chaos.block && live ? snap.chaos.block : 'One chaos item at a time and 2 a phase.';
    }
    async function buy(id) {
      const it = SuperData.item(id), p = SuperData.price(id);
      if (busy || !WPM.spend(p)) { q('shopnote').textContent = `${it.name} costs ${p} coins.`; return { ok: false, reason: 'coins' }; }
      busy = true; paintShop();
      const r = await watch.buy(id, WPM.profile().name);
      busy = false;
      if (r.ok) { q('shopnote').textContent = `You sent ${it.name}.`; WPM.track('support_sent', { item: id, kind: it.kind, price: p, boss: snap ? snap.boss : B.id }); }
      else { WPM.addCoins(p, 'refund'); q('shopnote').textContent = r.reason || `${it.name} did not land.`; }
      paintShop();
      return r;
    }
    el.querySelectorAll('[data-i]').forEach(b => {
      b.addEventListener('click', () => buy(b.dataset.i));
      const show = () => { if (!busy) q('shopnote').textContent = SuperData.item(b.dataset.i).text; };
      b.addEventListener('pointerenter', show); b.addEventListener('focus', show);
    });
    coins();
    // Art's camera: the real stream carries it; until then his avatar sits in the corner of the arena
    const pip = UI.el(`<div class="sb-pip" aria-hidden="true"><img alt="" width="96" height="96" src="${UI.avatar(0, 160)}"><span>Art's camera shows here when he is live</span></div>`);
    arena.root.append(pip);

    const watch = SuperStream.watch({
      boss: B.id, dial: T.id, name: () => WPM.profile().name,
      state: s => {
        snap = s;
        if (!synced && (s.status === 'fight' || s.status === 'finish')) { synced = true; sound.sync(s); }
        if (s.boss !== B.id || s.dial !== T.id) { B = SuperData.boss(s.boss); T = SuperData.dial(s.dial); q('title').textContent = `Art vs ${B.name}, ${T.name}`; }
        arena.state(s); sound.state(s); side.hype(s.hype);
        paintShop();
      },
      event: (n, d) => { arena.event(n, d); sound.event(n, d); if (n === 'go') { synced = true; arena.result(null); } },
      chat: m => side.chat(m),
      hello: (d, m) => { q('party').textContent = fmt(d.viewers + 1); },
      mode: m => {
        mode = m;
        q('tag').textContent = m === 'sim' ? 'Simulated stream' : 'Live';
        q('tag').classList.toggle('live', m === 'live');
        q('simnote').hidden = m !== 'sim';
        q('title').textContent = `Art vs ${B.name}, ${T.name}`;
      },
      // the simulated stream starts the next fight 12 seconds after one ends
      end: r => {
        arena.result(r, mode === 'sim' ? '<p class="sb-next">Next fight in 12 seconds</p>' : '');
        if (mode === 'sim') {
          clearTimeout(nextT);
          nextT = setTimeout(() => {
            const i = SuperData.BOSSES.findIndex(b => b.id === B.id);
            B = SuperData.BOSSES[(i + 1) % SuperData.BOSSES.length];
            synced = false;
            arena.result(null);
            watch.restart(B.id, T.id);
          }, 12000);
        }
      },
    });
    const snd = e => SuperAudio.setOn(!!(e.detail && e.detail.on));
    addEventListener('wpm-sound', snd);
    SuperAudio.setOn(TT.soundOn());
    const unlock = () => SuperAudio.unlock();
    el.addEventListener('pointerdown', unlock);
    window._sbw = {
      state: () => snap, mode: () => mode, sim: () => watch.sim(), bot: () => watch.bot(), arena: () => arena, scene: () => arena.scene.info(), buy, pause: on => arena.scene.pause(on),
      phase: n => watch.sim() && watch.sim().debug.phase(n), finish: () => watch.sim() && watch.sim().debug.finish(), support: (id, who) => watch.sim() && watch.sim().support(id, who || 'nova_k'),
    };
    return () => {
      clearTimeout(nextT);
      offCoins();
      removeEventListener('wpm-sound', snd);
      watch.close();
      SuperAudio.stop();
      arena.dispose();
      delete window._sbw;
    };
  }

  // ---------- the route ----------
  Router.register('superboss', (() => {
    let el = null, key = null, stop = null;
    function mount(root, params) { el = root; update(params); }
    function update(params) {
      const k = (params || []).join('/');
      if (k === key) return;
      if (stop) { try { stop(); } catch (e) { console.error(e); } }
      stop = null; key = k;
      el.innerHTML = '';
      const [m, b, d] = params || [];
      el.dataset.view = m === 'stream' ? 'stream' : m === 'watch' ? 'watch' : 'lobby';
      if (m === 'stream') stop = Streamer(el, b, d);
      else if (m === 'watch') stop = Viewer(el, b, d);
      else stop = Lobby(el);
      scrollTo(0, 0);
    }
    function unmount() { if (stop) { try { stop(); } catch (e) { console.error(e); } } stop = null; key = null; el = null; }
    return { title: 'Superboss', mount, update, unmount };
  })());
})();
