// The flat keyboard the academy draws: three layouts, the finger for every key and the
// hands under it. FingerKeys.mount(host, { layout }) returns
// { light(char), focus(chars), setLayout(id), destroy() }.
// Keys are placed by their physical spot, so the finger zones are the same on every layout.
window.FingerKeys = (() => {
  // Each key is "base shifted". A single letter shifts to its capital.
  const LAYOUTS = {
    qwerty: {
      name: 'QWERTY', iso: false,
      rows: [
        ['`~', '1!', '2@', '3#', '4$', '5%', '6^', '7&', '8*', '9(', '0)', '-_', '=+'],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[{', ']}', '\\|'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';:', '\'"'],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',<', '.>', '/?'],
      ],
    },
    qwertz: {
      name: 'QWERTZ', iso: true,
      rows: [
        ['^°', '1!', '2"', '3§', '4$', '5%', '6&', '7/', '8(', '9)', '0=', 'ß?', '´`'],
        ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü', '+*'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä', '#\''],
        ['<>', 'y', 'x', 'c', 'v', 'b', 'n', 'm', ',;', '.:', '-_'],
      ],
    },
    azerty: {
      name: 'AZERTY', iso: true,
      rows: [
        ['²', '&1', 'é2', '"3', '\'4', '(5', '-6', 'è7', '_8', 'ç9', 'à0', ')°', '=+'],
        ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '^¨', '$£'],
        ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'ù%', '*µ'],
        ['<>', 'w', 'x', 'c', 'v', 'b', 'n', ',?', ';.', ':/', '!§'],
      ],
    },
  };

  // finger for each column, left pinky to right pinky. On ISO boards the extra key left of
  // the bottom row goes to the left pinky and the rest of the row shifts one along.
  const COLS = [
    ['lp', 'lp', 'lr', 'lm', 'li', 'li', 'ri', 'ri', 'rm', 'rr', 'rp', 'rp', 'rp'],
    ['lp', 'lr', 'lm', 'li', 'li', 'ri', 'ri', 'rm', 'rr', 'rp', 'rp', 'rp', 'rp'],
    ['lp', 'lr', 'lm', 'li', 'li', 'ri', 'ri', 'rm', 'rr', 'rp', 'rp', 'rp'],
    ['lp', 'lr', 'lm', 'li', 'li', 'ri', 'ri', 'rm', 'rr', 'rp'],
  ];
  const FINGER = {
    lp: 'left little finger', lr: 'left ring finger', lm: 'left middle finger', li: 'left index finger',
    ri: 'right index finger', rm: 'right middle finger', rr: 'right ring finger', rp: 'right little finger', th: 'thumb',
  };

  function parse(k) {
    const ch = [...k];
    if (ch.length === 1) return /\p{L}/u.test(ch[0]) ? { base: ch[0], shift: ch[0].toUpperCase() } : { base: ch[0], shift: '' };
    return { base: ch[0], shift: ch[1] };
  }

  // keys of a layout with their finger and width, row by row, plus the side keys
  function build(id) {
    const L = LAYOUTS[id] || LAYOUTS.qwerty;
    const rows = L.rows.map((r, ri) => r.map((k, ci) => {
      const col = ri === 3 && L.iso ? ci - 1 : ci;
      return { ...parse(k), finger: col < 0 ? 'lp' : COLS[ri][col], row: ri, col, w: 1 };
    }));
    const side = (label, w, finger = '') => ({ side: label, w, finger });
    if (L.iso) {
      rows[0].push(side('Backspace', 2, 'rp'));
      rows[1].unshift(side('Tab', 1.5, 'lp')); rows[1].push(side('Enter', 1.5, 'rp'));
      rows[2].unshift(side('Caps', 1.75, 'lp')); rows[2].push(side('', 1.25, 'rp'));
      rows[3].unshift(side('Shift', 1.25, 'lp')); rows[3].push(side('Shift', 2.75, 'rp'));
    } else {
      rows[0].push(side('Backspace', 2, 'rp'));
      rows[1].unshift(side('Tab', 1.5, 'lp'));
      rows[2].unshift(side('Caps', 1.75, 'lp')); rows[2].push(side('Enter', 2.25, 'rp'));
      rows[3].unshift(side('Shift', 2.25, 'lp')); rows[3].push(side('Shift', 2.75, 'rp'));
    }
    rows[3][0].shiftKey = 'l'; rows[3][rows[3].length - 1].shiftKey = 'r';
    rows.push([side('Ctrl', 1.25), side('', 1.25), side('Alt', 1.25), { side: 'Space', w: 6.25, finger: 'th', space: true },
      side('Alt', 1.25), side('', 1.25), side('', 1.25), side('Ctrl', 1.25)]);
    // char -> key, and whether it needs Shift
    const map = new Map();
    rows.forEach(r => r.forEach(k => {
      if (k.space) map.set(' ', { key: k, shift: false });
      if (k.base && !map.has(k.base)) map.set(k.base, { key: k, shift: false });
      if (k.shift && !map.has(k.shift)) map.set(k.shift, { key: k, shift: true });
    }));
    return { id, name: L.name, rows, map };
  }

  // useful sets for the lessons: the home row, top row, bottom row letters and the resting keys
  function info(id) {
    const B = build(id);
    const r = n => B.rows[n].filter(k => k.side === undefined);
    // the first ten keys of a row, which is where the letters taught in the lessons sit
    const letters = n => r(n).slice(0, 10).map(k => k.base).filter(c => /\p{L}/u.test(c));
    const home = r(2);
    return {
      ...B,
      homeRow: letters(2), topRow: letters(1), bottomRow: letters(3),
      restL: home.slice(0, 4).map(k => k.base), restR: home.slice(6, 10).map(k => k.base),
      finger: ch => { const m = B.map.get(ch); return m ? FINGER[m.key.finger] : ''; },
      needsShift: ch => !!(B.map.get(ch) || {}).shift,
      has: ch => B.map.has(ch),
    };
  }

  // two hands as rounded bars, little finger to thumb, so the lit finger is easy to see
  function handSVG(side) {
    const ids = side === 'l' ? ['lp', 'lr', 'lm', 'li'] : ['ri', 'rm', 'rr', 'rp'];
    const tall = side === 'l' ? [30, 40, 44, 40] : [40, 44, 40, 30];
    const bars = ids.map((f, i) => `<rect data-f="${f}" class="fk-finger f-${f}" x="${6 + i * 17}" y="${56 - tall[i]}" width="13" height="${tall[i] + 10}" rx="6.5"/>`).join('');
    const thumb = side === 'l'
      ? `<rect data-f="th" class="fk-finger f-th" x="62" y="52" width="13" height="30" rx="6.5" transform="rotate(-38 68 66)"/>`
      : `<rect data-f="th" class="fk-finger f-th" x="-2" y="52" width="13" height="30" rx="6.5" transform="rotate(38 5 66)"/>`;
    return `<svg class="fk-hand" viewBox="-6 6 88 84" aria-hidden="true">${bars}${thumb}<rect class="fk-palm" x="4" y="58" width="70" height="30" rx="10"/></svg>`;
  }

  const LEGEND = [['p', 'Little'], ['r', 'Ring'], ['m', 'Middle'], ['i', 'Index'], ['th', 'Thumbs']];

  function mount(host, { layout = 'qwerty', hands = true } = {}) {
    let K = info(layout), lit = [], focusSet = null;
    const root = document.createElement('div');
    root.className = 'fk';
    host.append(root);

    function paint() {
      root.innerHTML = `<div class="fk-board" role="img" aria-label="${K.name} keyboard coloured by finger">${K.rows.map(r => `<div class="fk-row">${r.map(k => {
        const label = k.side != null ? k.side : (k.shift && !/\p{L}/u.test(k.base) ? `<small>${UI.esc(k.shift)}</small>${UI.esc(k.base)}` : UI.esc(k.base.toUpperCase()));
        const home = k.row === 2 && (k.col === 3 || k.col === 6) ? ' bump' : '';
        return `<span class="fk-k${k.side != null ? ' side' : ''}${k.finger ? ' f-' + k.finger : ''}${home}" style="--w:${k.w}">${label}</span>`;
      }).join('')}</div>`).join('')}</div>
      ${hands ? `<div class="fk-hands">${handSVG('l')}<p class="fk-next" aria-live="polite"></p>${handSVG('r')}</div>` : ''}
      <ul class="fk-legend">${LEGEND.map(([f, n]) => `<li><i class="f-${f === 'th' ? 'th' : 'l' + f}"></i>${n}</li>`).join('')}</ul>`;
      const spans = root.querySelectorAll('.fk-k');
      let i = 0;
      K.rows.forEach(r => r.forEach(k => { k.el = spans[i++]; }));
      if (focusSet) focus(focusSet);
    }

    function clear() { lit.forEach(e => e.classList.remove('next')); lit = []; }
    // light the key for ch, the Shift on the other hand when it needs one, and the finger
    function light(ch) {
      clear();
      const next = root.querySelector('.fk-next');
      if (ch == null) { if (next) next.textContent = ''; return; }
      const m = K.map.get(ch);
      if (!m) { if (next) next.textContent = ''; return; }
      const els = [m.key.el];
      let shiftSide = '';
      if (m.shift) {
        shiftSide = m.key.finger[0] === 'l' ? 'r' : 'l';
        const sk = K.rows[3].find(k => k.shiftKey === shiftSide);
        if (sk) els.push(sk.el);
      }
      els.forEach(e => e && e.classList.add('next'));
      lit = els.filter(Boolean);
      root.querySelectorAll('.fk-finger').forEach(f => f.classList.toggle('on', f.dataset.f === m.key.finger || (shiftSide && f.dataset.f === shiftSide + 'p')));
      if (next) {
        const name = ch === ' ' ? 'Space' : /\p{L}/u.test(ch) ? ch.toUpperCase() : ch;
        next.innerHTML = `<b>${UI.esc(name)}</b><span>${FINGER[m.key.finger]}${shiftSide ? `, ${shiftSide === 'l' ? 'left' : 'right'} Shift` : ''}</span>`;
      }
    }
    // dim every key outside the lesson's set
    function focus(chars) {
      focusSet = chars;
      const want = chars ? new Set([...chars].map(c => (K.map.get(c) || {}).key).filter(Boolean)) : null;
      const shifts = chars && [...chars].some(c => (K.map.get(c) || {}).shift);
      K.rows.forEach(r => r.forEach(k => {
        if (k.el) k.el.classList.toggle('off', !!want && !want.has(k) && !(shifts && k.shiftKey));
      }));
    }

    paint();
    return {
      light, focus,
      setLayout(id) { K = info(id); paint(); },
      destroy() { root.remove(); },
      info: () => K,
    };
  }

  return { LAYOUTS, info, mount, FINGER };
})();
