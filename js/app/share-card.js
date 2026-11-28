// The share image (28 Nov 2026): a 1200 x 630 card in CTRL's look with the logo, the game's title
// and the player's result line, for the Image button under every result (js/app/game-guard.js)
// and for the site's own preview picture (assets/brand/og.png, saved by tools/brand/og.py).
//   ShareCard.canvas(text, { kicker }) -> Promise<canvas>
//   ShareCard.blob(text)               -> Promise<Blob> (PNG)
//   ShareCard.save(text)               shares the PNG where the browser can, otherwise downloads it
window.ShareCard = (() => {
  const W = 1200, H = 630, BLACK = '#0a0b0d', CYAN = '#3ee6ff';
  const site = () => window.SITE_URL || '10000wpm.com';
  async function fonts() {
    if (!document.fonts) return;
    try { await Promise.all(['600 44px "Chakra Petch"', '700 30px "Chakra Petch"', '400 20px "Share Tech Mono"'].map(f => document.fonts.load(f))); } catch (e) {}
  }
  function wrap(c, text, maxW) {
    const words = text.split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  async function canvas(text, o = {}) {
    await fonts();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = BLACK; c.fillRect(0, 0, W, H);
    // a faint grain so the black reads as matte, not flat
    const R = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${0.012 + R(i, 1) * 0.02})`; c.fillRect(R(i, 2) * W, R(i, 3) * H, 1, 1); }
    // the logo panel on the left: the lockup in a bracket frame
    const px = 64, py = 64, pw = 360, ph = H - 128;
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2;
    const br = (x, y, dx, dy) => { c.beginPath(); c.moveTo(x + dx * 26, y); c.lineTo(x, y); c.lineTo(x, y + dy * 26); c.stroke(); };
    br(px, py, 1, 1); br(px + pw, py, -1, 1); br(px, py + ph, 1, -1); br(px + pw, py + ph, -1, -1);
    if (window.CtrlBrand) { const lh = 330, s = CtrlBrand.size('lockup', lh); CtrlBrand.draw(c, 'lockup', px + (pw - s.w) / 2, py + (ph - lh) / 2, lh, '#ffffff'); }
    // a circuit trace from the frame into the text side, ending in a node
    c.strokeStyle = 'rgba(62,230,255,.55)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px + pw, py + ph - 70); c.lineTo(px + pw + 40, py + ph - 70); c.lineTo(px + pw + 70, py + ph - 40); c.lineTo(W - 64, py + ph - 40); c.stroke();
    c.fillStyle = CYAN; c.beginPath(); c.arc(W - 64, py + ph - 40, 4, 0, Math.PI * 2); c.fill();
    // three cyan slashes, as on the hoodie's shoulder
    for (let i = 0; i < 3; i++) { const x = W - 150 + i * 22; c.beginPath(); c.moveTo(x, 104); c.lineTo(x + 10, 104); c.lineTo(x + 24, 76); c.lineTo(x + 14, 76); c.closePath(); c.fill(); }
    // the text side
    const tx = px + pw + 64, tw = W - tx - 64;
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#8d969d'; c.font = '400 20px "Share Tech Mono", monospace';
    if ('letterSpacing' in c) c.letterSpacing = '4px';
    c.fillText((o.kicker || '// CTRL network').toUpperCase(), tx, 100);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    c.fillStyle = '#ffffff'; c.font = '700 30px "Chakra Petch", sans-serif';
    c.fillText('10000wpm - Stormtyper', tx, 146);
    let size = 44, lines;
    for (; size >= 30; size -= 2) { c.font = `600 ${size}px "Chakra Petch", sans-serif`; lines = wrap(c, text, tw); if (lines.length <= 5) break; }
    lines = lines.slice(0, 5);
    const lh2 = size * 1.22, y0 = 214 + Math.max(0, (5 - lines.length) * lh2 * 0.35);
    c.fillStyle = '#e9edf0';
    lines.forEach((l, i) => c.fillText(l, tx, y0 + i * lh2));
    // glitch bars at the right edge
    c.fillStyle = 'rgba(62,230,255,.6)'; c.fillRect(W - 120, 556, 80, 2); c.fillRect(W - 90, 562, 40, 1);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(W - 160, 470, 110, 2);
    // the address
    c.fillStyle = '#8d969d'; c.font = '400 20px "Share Tech Mono", monospace';
    c.fillText(site(), tx, H - 64 - 52);
    return cv;
  }
  const blob = async (text, o) => { const cv = await canvas(text, o); return new Promise(ok => cv.toBlob(ok, 'image/png')); };
  async function save(text) {
    const b = await blob(text);
    const file = new File([b], 'stormtyper-result.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { return 'cancelled'; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'saved';
  }
  return { canvas, blob, save, W, H };
})();
