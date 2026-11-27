// WordFlow: the words to type as a block of lines, the way Monkeytype shows them. Typed words stay
// on their line (correct ones bright, mistakes in red), the current word is marked, the next words
// wait dimmed after it, and once the current word reaches the third line the top line scrolls away.
//
//   const flow = WordFlow.create(box, { lines: 3 })
//   flow.render({ cur, typed, mine, next, pens })   cur: the word to type, typed: what's typed into it,
//                                             mine: false while typing an attack word or a spell,
//                                             pens: { index: fakeWord } for Boss Rush's red pen (0 = cur)
//                                             fog: how many words from the current one are blurred (a duel debuff)
//                                             threat: { i, ms, el } an attack's counter phrase at index i (0 = cur),
//                                             red with red slashes and a timer that runs ms (el already gone)
//                                             tags: [tag|null, ...] by index (0 = cur), for the World Boss's
//                                             special words: { kind, ms, el, color } styles the word by kind
//                                             (block, assist, dodge, return, add, heal, revive, cover, spell)
//                                             and runs a timer under it when ms is set
//   flow.push(word, typed, ok, threat)        after a word is submitted (threat: true or the tag's kind)
//   flow.clear()
//   flow.ahead()                              how many of the next words are already planned: the rest of
//                                             the line you're on and all of the middle line. Special words
//                                             only ever take over words after these (Gid, 27 Nov 2026), so
//                                             nothing you're about to type changes under you
//
// WordFlow.far(flow, min)  the first index (0 = the current word) a special word may take: past
// flow.ahead(), and never closer than min words
window.WordFlow = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function letters(word, typed, caret) {
    let s = '';
    for (let i = 0; i < Math.max(word.length, typed.length); i++) {
      const a = typed[i], c = word[i];
      if (a === undefined) s += `<i class="${caret && i === typed.length ? 'at' : ''}">${esc(c)}</i>`;
      else if (c === undefined) s += `<i class="bad extra">${esc(a)}</i>`;
      else s += `<i class="${a === c ? 'ok' : 'bad'}">${esc(c)}</i>`;
    }
    if (caret && typed.length >= word.length) s += '<i class="at end"></i>';
    return s;
  }

  function create(box, { lines = 3 } = {}) {
    let done = [];
    let last = null, ahead = 6;
    function paint(st) {
      const { cur, typed = '', mine = true, next = [], pens = null, fog = 0, threat = null, tags = null } = st;
      const fg = i => (i < fog ? ' fog' : '');
      // the timer and the slashes run as CSS animations started in the past (a negative delay),
      // so a repaint on every key carries on from where they were
      const tg = i => tags && tags[i];
      const th = i => (threat && threat.i === i ? ' threat' : '') + (tg(i) ? ` tag t-${tg(i).kind}${tg(i).first ? ' first' : ''}${tg(i).last ? ' last' : ''}${tg(i).soon ? ' soon' : ''}` : '');
      const thAttr = i => {
        if (threat && threat.i === i) return ` style="--tw:${Math.round(threat.ms)}ms;--te:-${Math.round(threat.el)}ms"`;
        const g = tg(i); if (!g) return '';
        const v = [g.ms ? `--tw:${Math.round(g.ms)}ms;--te:-${Math.round(g.el)}ms` : '', g.color ? `--sc:${g.color}` : ''].filter(Boolean).join(';');
        return v ? ` style="${v}"` : '';
      };
      const thFx = i => (threat && threat.i === i ? '<b class="fw-slash" aria-hidden="true"></b><b class="fw-tbar" aria-hidden="true"></b>'
        : tg(i) && tg(i).ms ? '<b class="fw-tbar" aria-hidden="true"></b>' : '');
      const pen = i => (pens && pens[i] ? `<em class="fw-pen">${esc(pens[i])}</em>` : '');
      box.innerHTML = `<div class="fw-lines" style="--fw-lines:${lines}">` +
        done.map(d => `<span class="fw done${d.ok ? '' : ' miss'}${d.threat ? ' was-threat' : ''}${typeof d.threat === 'string' ? ' was-' + d.threat : ''}">${letters(d.word, d.typed, false)}</span>`).join('') +
        `<span class="fw cur${mine ? '' : ' wait'}${pen(0) ? ' pen' : ''}${fg(0)}${th(0)}" aria-current="${mine}"${thAttr(0)}>${pen(0)}${thFx(0)}${letters(cur, mine ? typed : '', mine)}</span>` +
        next.map((w, i) => pen(i + 1) ? `<span class="fw pen">${pen(i + 1)}<s>${esc(w)}</s></span>` : `<span class="fw${fg(i + 1)}${th(i + 1)}"${thAttr(i + 1)}>${thFx(i + 1)}${esc(w)}</span>`).join('') + '</div>';
    }
    function render(st) {
      last = st;
      paint(st);
      // keep the current word on the first two lines: drop the top line once it reaches the third
      for (let guard = 0; guard < 4; guard++) {
        const words = [...box.querySelectorAll('.fw')], cur = box.querySelector('.fw.cur');
        if (!cur || !words.length) return;
        const tops = [...new Set(words.map(w => w.offsetTop))].sort((a, b) => a - b);
        if (tops.indexOf(cur.offsetTop) < 2) { count(words, cur, tops); return; }
        const top = words.filter(w => w.offsetTop === tops[0]).length;
        if (!top || top > done.length) { count(words, cur, tops); return; }
        done = done.slice(top);
        paint(st);
      }
    }
    // the words after the current one that sit on its line or on the middle line
    function count(words, cur, tops) {
      if (!cur.offsetParent) { ahead = Math.max(ahead, 20); return; }   // hidden: assume two full lines
      const lock = tops[Math.max(1, tops.indexOf(cur.offsetTop))];
      const after = words.slice(words.indexOf(cur) + 1);
      let n = 0;
      for (const w of after) { if (w.offsetTop <= lock) n++; else break; }
      ahead = n;
    }
    return {
      render,
      ahead: () => ahead,
      push(word, typed, ok, threat) { done.push({ word, typed, ok, threat: typeof threat === 'string' ? threat : !!threat }); if (done.length > 120) done = done.slice(-120); },
      clear() { done = []; ahead = 20; if (last) render(last); },
    };
  }
  const far = (flow, min = 3) => Math.max(min, (flow && flow.ahead ? flow.ahead() : 6) + 1);
  return { create, far };
})();
