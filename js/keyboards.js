// Boards Art has typed on in his reels (Instagram, Nov 2026).
// Specs come from the maker pages where possible. "src" lists where each value came from.
// Colours are close to the boards in his videos and should be checked against real photos.
window.KEYBOARDS = [
  {
    id: 'aula-f99', name: 'AULA F99 Pro', tag: 'Typed on', layout: '96', knob: true,
    sound: 'creamy',
    look: { case: '#cfcfca', alpha: '#ecebe5', mod: '#8f939a', accent: '#d5503f', accentKeys: ['Escape', 'Enter', 'NumpadEnter'], legend: '#2a2b2f', rgb: '#f2c230' },
    specs: [
      ['Layout', '96%, 100 keys, knob'],
      ['Switches', 'Star Arrow linear, hot-swap'],
      ['Connection', 'USB-C, 2.4 GHz, Bluetooth 5.0'],
      ['Mount', 'Gasket'],
      ['Case', 'ABS, PC plate'],
      ['Keycaps', 'Double-shot PBT, Cherry profile'],
      ['Battery', '8000 mAh'],
    ],
    price: '$85.99',
    standout: 'Full 96% board with a gasket mount and an 8000 mAh battery.',
    video: 'https://www.instagram.com/10000wpm/reel/Dfm2oO9Aemm/',
    src: ['https://aulagear.com/collections/types/products/aula-f99-copy'],
  },
  {
    id: 'womier-sk61he', name: 'Womier SK61 HE', tag: 'Collab', layout: '60', knob: false,
    sound: 'marble',
    look: { case: '#a9adb4', metal: true, alpha: '#26272b', mod: '#3a3c42', accent: '#f2c230', accentKeys: ['Escape'], legend: '#e9e8e2', rgb: '#9fb7d9' },
    specs: [
      ['Layout', '60%, 61 keys'],
      ['Switches', 'Womier linear magnetic (Hall effect)'],
      ['Actuation', '0.005 to 3.3 mm, rapid trigger'],
      ['Polling', '8000 Hz wired, 1000 Hz 2.4 GHz'],
      ['Connection', 'USB-C, 2.4 GHz, Bluetooth 5.3'],
      ['Case', 'CNC aluminum, gasket mount'],
      ['Battery', '6000 mAh'],
      ['Weight', '825 g'],
    ],
    price: '$89.99',
    standout: 'Wireless Hall-effect 60% with 8000 Hz wired polling.',
    video: 'https://www.instagram.com/10000wpm/reel/DfwWq1ERVOS/',
    src: ['https://womierkeyboard.com/products/womier-sk61-he-wireless-magnetic-keyboard'],
  },
  {
    id: 'loga-yaksa', name: 'LOGA Yaksa Pro 75 Clear', sub: 'Maiyarap edition', tag: 'Typed on', layout: '75', knob: true, screen: true,
    sound: 'thock',
    look: { case: '#b9a6d6', clear: true, alpha: '#1f2023', mod: '#2f3a33', accent: '#c9a24a', accentKeys: ['Escape', 'Enter', 'Space'], legend: '#c9a24a', rgb: '#c9a24a' },
    specs: [
      ['Layout', '75% with knob and screen'],
      ['Switches', 'Nom Yen linear or Cha Thai tactile, hot-swap'],
      ['Polling', '1000 Hz'],
      ['Connection', 'USB-C, 2.4 GHz, Bluetooth'],
      ['Case', 'Clear acrylic, gasket mount'],
      ['Keycaps', 'Dye-sub PBT, Cherry profile'],
      ['Battery', '4000 mAh'],
      ['Weight', '1.17 kg'],
    ],
    price: '฿4,290',
    standout: 'Clear acrylic case with a knob and a small screen.',
    video: 'https://www.instagram.com/10000wpm/reel/DfwhXtSxWHB/',
    src: ['https://logaworld.com/products/loga-yaksa-pro-75-clear-maiyarap-edition-tri-mode-wireless-mechanical-keyboard', 'https://shop.line.me/@keypro/product/1005589305'],
  },
  {
    id: 'attackshark-x68he', name: 'Attack Shark X68 HE', tag: 'Typed on', layout: '65', knob: false,
    sound: 'clack',
    look: { case: '#25262a', alpha: '#e7e6e1', mod: '#b9bbbf', accent: '#e07a3a', accentKeys: ['Escape', 'Enter'], legend: '#25262a', rgb: '#e07a3a' },
    specs: [
      ['Layout', '65%, 66 keys'],
      ['Switches', 'Attack Shark magnetic linear, 40 gf'],
      ['Actuation', '0.1 to 3.4 mm, rapid trigger 0.01 mm'],
      ['Polling', '8000 Hz'],
      ['Connection', 'USB-C wired'],
      ['Keycaps', 'PBT, OEM profile'],
      ['Weight', '855 g'],
    ],
    price: '$59.99',
    standout: 'Hall-effect board with 8000 Hz polling under $60.',
    video: 'https://www.instagram.com/10000wpm/',
    src: ['https://attackshark.com/products/attack-shark-x68-he-rapid-trigger-keyboard-magnetic-switch'],
  },
  {
    id: 'corsair-vanguard96', name: 'Corsair Vanguard 96 Wireless', tag: 'Typed on', layout: '96', knob: false,
    sound: 'creamy',
    look: { case: '#1d1e21', alpha: '#2b2c30', mod: '#232427', accent: '#f2c230', accentKeys: ['Escape'], legend: '#d8d7d1', rgb: '#e7e6e1' },
    specs: [
      ['Layout', '96%'],
      ['Switches', 'Corsair MLX Plasma linear, hot-swap'],
      ['Polling', 'Up to 8000 Hz, wired and wireless'],
      ['Connection', 'USB, Slipstream 2.4 GHz, Bluetooth LE'],
      ['Battery', 'Up to 125 h on 2.4 GHz'],
      ['Weight', '1.17 kg'],
    ],
    price: '$199.99',
    standout: '8000 Hz wireless polling with hot-swap MLX switches.',
    video: 'https://www.instagram.com/10000wpm/reel/Dftm1bdAdMg/',
    src: ['https://www.corsair.com/us/en/p/keyboards/ch-91f901e-na/vanguard-96-wireless-mechanical-gaming-keyboard-ch-91f901e-na'],
  },
  {
    id: 'chilkey-sf60', name: 'Chilkey SF60 Diamond', tag: 'Typed on', layout: '64', knob: false,
    sound: 'marble',
    look: { case: '#c7c9cd', metal: true, alpha: '#dfe7ee', mod: '#cfd9e2', accent: '#9fd3cf', accentKeys: ['Escape', 'Enter'], legend: '#3a3c42', rgb: '#9fd3cf', crystal: true },
    specs: [
      ['Layout', '60% with arrows, 64 keys'],
      ['Switches', 'WS Flux Diamond Teal Dream (Hall effect)'],
      ['Actuation', '0.01 to 3.3 mm, rapid trigger'],
      ['Polling', '8000 Hz'],
      ['Connection', 'USB-C wired'],
      ['Case', 'Aluminum, gasket mount'],
      ['Keycaps', 'Clear PC, ASA profile'],
    ],
    price: '$179.99',
    standout: 'Clear crystal keycaps on an aluminum Hall-effect 60%.',
    video: 'https://www.instagram.com/10000wpm/',
    src: ['https://mkbguide.com/blog/chilkey-sf60-diamond-review', 'https://us.maxgaming.com/us/gaming-keyboard/chilkey-sf60-he-gaming-keyboard-ansi-star-diamond-pink-ws-poseidon'],
  },
];

// Layouts in key units. Each key: [legend, width, code(s), height]
(() => {
  const k = (l, w = 1, code = null, h = 1) => [l, w, code, h];
  const nums = '1234567890'.split('').map(d => k(d, 1, 'Digit' + d));
  const row = s => s.split('').map(c => k(c.toUpperCase(), 1, 'Key' + c.toUpperCase()));
  const sym = {
    '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
    ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', '`': 'Backquote',
  };
  const s = c => k(c, 1, sym[c]);
  const fn = Array.from({ length: 12 }, (_, i) => k('F' + (i + 1), 1, 'F' + (i + 1)));

  const alphaRows = (bksp = 2) => [
    [...nums, s('-'), s('='), k('Bksp', bksp, 'Backspace')],
    [k('Tab', 1.5, 'Tab'), ...row('qwertyuiop'), s('['), s(']'), k('\\', 1.5, 'Backslash')],
    [k('Caps', 1.75, 'CapsLock'), ...row('asdfghjkl'), s(';'), s("'"), k('Enter', 2.25, 'Enter')],
  ];
  const zrow = [...row('zxcvbnm'), s(','), s('.'), s('/')];
  const mods = [k('Ctrl', 1.25, 'ControlLeft'), k('Win', 1.25, 'MetaLeft'), k('Alt', 1.25, 'AltLeft'), k('', 6.25, 'Space')];

  const L = {};
  {
    const [r1, r2, r3] = alphaRows();
    L['60'] = { rows: [
      [k('Esc', 1, ['Escape', 'Backquote']), ...r1],
      r2, r3,
      [k('Shift', 2.25, 'ShiftLeft'), ...zrow, k('Shift', 2.75, 'ShiftRight')],
      [...mods, k('Alt', 1.25, 'AltRight'), k('Fn', 1.25, null), k('Menu', 1.25, 'ContextMenu'), k('Ctrl', 1.25, 'ControlRight')],
    ] };
  }
  {
    const [r1, r2, r3] = alphaRows();
    L['64'] = { rows: [
      [k('Esc', 1, ['Escape', 'Backquote']), ...r1],
      r2, r3,
      [k('Shift', 2.25, 'ShiftLeft'), ...zrow, k('Shift', 1.75, 'ShiftRight'), k('↑', 1, 'ArrowUp')],
      [...mods, k('Alt', 1, 'AltRight'), k('Fn', 1, null), k('←', 1, 'ArrowLeft'), k('↓', 1, 'ArrowDown'), k('→', 1, 'ArrowRight')],
    ] };
  }
  {
    const [r1, r2, r3] = alphaRows();
    L['65'] = { rows: [
      [k('Esc', 1, ['Escape', 'Backquote']), ...r1, k('Del', 1, 'Delete')],
      [...r2, k('PgUp', 1, 'PageUp')],
      [...r3, k('PgDn', 1, 'PageDown')],
      [k('Shift', 2.25, 'ShiftLeft'), ...zrow, k('Shift', 1.75, 'ShiftRight'), k('↑', 1, 'ArrowUp'), k('End', 1, 'End')],
      [...mods, k('Alt', 1, 'AltRight'), k('Fn', 1, null), k('Ctrl', 1, 'ControlRight'), k('←', 1, 'ArrowLeft'), k('↓', 1, 'ArrowDown'), k('→', 1, 'ArrowRight')],
    ] };
  }
  {
    const [r1, r2, r3] = alphaRows();
    L['75'] = { fGap: 0.25, rows: [
      [k('Esc', 1, 'Escape'), ...fn, k('Prt', 1, 'PrintScreen'), k('Del', 1, 'Delete'), { gap: 1, knob: true }],
      [s('`'), ...r1, k('Home', 1, 'Home')],
      [...r2, k('PgUp', 1, 'PageUp')],
      [...r3, k('PgDn', 1, 'PageDown')],
      [k('Shift', 2.25, 'ShiftLeft'), ...zrow, k('Shift', 1.75, 'ShiftRight'), k('↑', 1, 'ArrowUp'), k('End', 1, 'End')],
      [...mods, k('Alt', 1, 'AltRight'), k('Fn', 1, null), k('Ctrl', 1, 'ControlRight'), k('←', 1, 'ArrowLeft'), k('↓', 1, 'ArrowDown'), k('→', 1, 'ArrowRight')],
    ] };
  }
  {
    const [r1, r2, r3] = alphaRows();
    const n = (l, c, h = 1) => k(l, 1, c, h);
    L['96'] = { fGap: 0.25, rows: [
      [k('Esc', 1, 'Escape'), ...fn, k('Prt', 1, 'PrintScreen'), k('Del', 1, 'Delete'), k('Home', 1, 'Home'), k('End', 1, 'End'), k('PgUp', 1, 'PageUp'), k('PgDn', 1, 'PageDown')],
      [s('`'), ...r1, n('Num', 'NumLock'), n('/', 'NumpadDivide'), n('*', 'NumpadMultiply'), n('-', 'NumpadSubtract')],
      [...r2, n('7', 'Numpad7'), n('8', 'Numpad8'), n('9', 'Numpad9'), n('+', 'NumpadAdd', 2)],
      [...r3, n('4', 'Numpad4'), n('5', 'Numpad5'), n('6', 'Numpad6'), { gap: 1 }],
      [k('Shift', 2.25, 'ShiftLeft'), ...zrow, k('Shift', 1.75, 'ShiftRight'), k('↑', 1, 'ArrowUp'), n('1', 'Numpad1'), n('2', 'Numpad2'), n('3', 'Numpad3'), n('Ent', 'NumpadEnter', 2)],
      [...mods, k('Alt', 1, 'AltRight'), k('Fn', 1, null), k('Ctrl', 1, 'ControlRight'), k('←', 1, 'ArrowLeft'), k('↓', 1, 'ArrowDown'), k('→', 1, 'ArrowRight'), n('0', 'Numpad0'), n('.', 'NumpadDecimal'), { gap: 1 }],
    ] };
  }
  window.KB_LAYOUTS = L;
})();
