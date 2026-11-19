// Typo Horde plays like Typing of the Dead. Typos walk toward the player and the
// word over each one shoots it. The first letter picks the target and each
// correct letter after it fires a shot. Five chapters, each ending in a boss.
(() => {
  const box = document.getElementById('horde-box');
  const cv = box.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const A = HordeArt, D = HordeData, S = HordeAudio;
  const { W, H, HZ, VX } = A;
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const SANS = '"Archivo", system-ui, sans-serif';
  const C = { ink: '#ecebe6', ink2: '#a3a29c', accent: '#f2c230', bad: '#e5604f', panel: 'rgba(14,15,16,.88)', blue: '#9fb7d9' };

  // ---------- sizing ----------
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || W;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * 9 / 16 * dpr);
  }
  fit();
  addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 50));

  // ---------- saved progress ----------
  const SAVE_KEY = 'wpm-horde-save';
  const save = TT.store.get(SAVE_KEY, { unlocked: 1, best: {} });
  const persist = () => TT.store.set(SAVE_KEY, save);

  // ---------- state ----------
  let mode = 'title';        // title | select | story | play | result | over | ending
  let paused = false, focused = false, visible = false;
  let t = 0, sel = 0;
  let story = null;          // { pages, page, shown, after }
  let ch = null, chIndex = 0, steps = [], stepI = 0, stepT = 0, travel = 0;
  let foes = [], shots = [], parts = [], pops = [], projs = [], pickups = [];
  let queue = [], spawnT = 0, target = null;
  let hearts = 3, shield = false, score = 0, combo = 0, maxCombo = 0;
  let slowT = 0, doubleT = 0, flashT = 0, hurtT = 0, shakeT = 0, stopT = 0, banner = null;
  let stats = null, boss = null, result = null;
  let keyLight = {};

  function resetRun() {
    foes = []; shots = []; parts = []; pops = []; projs = []; pickups = []; queue = [];
    target = null; boss = null; banner = null;
    hearts = 3; shield = false; score = 0; combo = 0; maxCombo = 0;
    slowT = 0; doubleT = 0; flashT = 0; hurtT = 0; shakeT = 0;
    stats = { keys: 0, good: 0, chars: 0, hits: 0, ms: 0 };
  }

  // ---------- flow ----------
  function goTitle() { mode = 'title'; S.music('menu'); }
  function goSelect() { mode = 'select'; sel = Math.min(save.unlocked - 1, sel); S.music('menu'); }
  function showStory(pages, after, letter) {
    mode = 'story';
    story = { pages, page: 0, shown: 0, after, letter };
  }
  function startChapter(i) {
    chIndex = i; ch = D.CHAPTERS[i];
    resetRun();
    steps = [];
    ch.waves.forEach((w, k) => {
      steps.push({ kind: 'move', secs: k === 0 ? 1.6 : 2.4 });
      steps.push({ kind: 'wave', list: w, pickup: ch.pickups[k] });
    });
    steps.push({ kind: 'move', secs: 2.6 });
    steps.push({ kind: 'boss' });
    stepI = 0; stepT = 0; travel = 0;
    showStory(ch.intro, () => { mode = 'play'; S.music(ch.music); enterStep(); });
    S.music('menu');
  }
  function enterStep() {
    const st = steps[stepI];
    stepT = 0;
    if (!st) return;
    if (st.kind === 'wave') {
      queue = [];
      for (let k = 0; k < st.list.length; k += 2) for (let n = 0; n < st.list[k + 1]; n++) queue.push(st.list[k]);
      TT.shuffle(queue);
      spawnT = 0.4;
      st.pickAt = 2 + Math.random() * 4;
    }
    if (st.kind === 'boss') startBoss();
  }
  function nextStep() { stepI++; enterStep(); }

  // ---------- words ----------
  const d = () => chIndex;
  function freshWord(min, max) {
    const used = new Set(liveTargets().map(x => x.word[0]));
    let w;
    for (let i = 0; i < 25; i++) {
      w = Math.random() < 0.05 + d() * 0.07 ? TT.wordOfLength(8, 10 + d()) : TT.wordOfLength(min, max);
      if (!used.has(w[0])) break;
    }
    return w;
  }
  function liveTargets() {
    const out = [];
    for (const p of projs) out.push({ obj: p, word: p.word });
    for (const f of foes) if (!f.dying) out.push({ obj: f, word: f.words[f.wi] });
    for (const p of pickups) out.push({ obj: p, word: p.word });
    if (boss && boss.prompt && !boss.dying) out.push({ obj: boss, word: boss.prompt });
    return out;
  }

  // ---------- spawning ----------
  function spawnFoe(type, near) {
    const def = D.ENEMIES[type];
    const lo = def.len[0] + Math.floor(d() / 2), hi = def.len[1] + Math.floor(d() / 2);
    const words = [];
    for (let i = 0; i < (def.words || 1); i++) words.push(freshWord(lo, hi));
    const secs = def.secs * (1 - d() * 0.05) * (0.9 + Math.random() * 0.2);
    foes.push({
      type, words, wi: 0, typed: 0, x: near ? (Math.random() * 0.8 - 0.4) : Math.random() * 1.4 - 0.7,
      z: near ? 0.75 : 1.05, speed: 1 / secs, phase: Math.random() * 6, flash: 0, seed: Math.random() * 1000,
      dying: 0, throwT: 2 + Math.random() * 2, windup: 0, def,
    });
  }
  function spawnPickup(kind) {
    const side = Math.random() < 0.5 ? -1 : 1;
    pickups.push({ kind, word: TT.wordOfLength(5, 7), typed: 0, x: side * 0.9, vx: -side * 0.12, z: 0.45, life: 8, seed: Math.random() * 10 });
  }
  function throwAt(from, x, z) {
    const letters = 'abcdefghijklmnoprstuwy';
    let w = letters[Math.floor(Math.random() * letters.length)];
    if (d() >= 2 && Math.random() < 0.4) w += letters[Math.floor(Math.random() * letters.length)];
    projs.push({ word: w, typed: 0, x, z, speed: 1 / 2.4, seed: Math.random() * 6, flash: 0, from });
  }

  // ---------- boss ----------
  function startBoss() {
    const b = ch.boss;
    boss = { ...b, phase: -1, hpLeft: b.phases.length, flash: 0, charge: 0, prompt: null, typed: 0, spell: null, thrown: 0, throwT: 0, dying: 0, scale: 1, introT: 2.4 };
    S.music('boss');
    S.play('roar');
    shakeT = 0.6;
  }
  function bossNextPhase() {
    boss.phase++;
    const ph = boss.phases[boss.phase];
    boss.prompt = null; boss.typed = 0; boss.spell = null; boss.charge = 0; boss.thrown = 0; boss.throwT = 0.6;
    if (!ph) return;
    if (ph.kind === 'phrase') newPhrase(ph);
    if (ph.kind === 'spell') {
      const set = ph.set || TT.pick(D.SPELL);
      boss.spell = { options: TT.shuffle([...set]), correct: set[0], typed: '', ask: ph.ask || 'Which one is spelled right?' };
    }
    if (ph.kind === 'summon') for (let i = 0; i < ph.count; i++) spawnFoe(TT.pick(['walker', 'runner', 'flyer', 'crawler']), true);
  }
  function newPhrase(ph) {
    boss.prompt = ph.text || TT.randomWords(ph.words, ph.long || 0.15).join(' ');
    boss.typed = 0; boss.charge = 0;
  }
  function bossHit() {
    boss.flash = 0.2; boss.hpLeft--; shakeT = 0.35; stopT = 0.08;
    S.play('bossHit'); S.play('phase');
    addScore(200 * (boss.phase + 1));
    burstLetters(VX, HZ, boss.prompt || 'ouch', '#f2c230', 1.6);
    if (boss.hpLeft <= 0) {
      boss.dying = 1.5; boss.prompt = null; boss.spell = null;
      foes.forEach(f => kill(f, true)); projs = [];
      S.play('kill'); S.play('bomb');
      return;
    }
    bossNextPhase();
  }

  // ---------- scoring and effects ----------
  const mult = () => Math.min(3, 1 + Math.floor(combo / 10) * 0.5) * (doubleT > 0 ? 2 : 1);
  function addScore(n, x, y) {
    const v = Math.round(n * mult());
    score += v;
    if (x !== undefined) pops.push({ x, y, text: '+' + v, t: 0.9 });
  }
  function burstLetters(x, y, word, col, big = 1) {
    for (const chh of word.replace(/ /g, '')) {
      parts.push({ x, y, vx: (Math.random() - 0.5) * 520 * big, vy: -Math.random() * 420 * big - 80, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, t: 1, ch: chh, size: 16 + Math.random() * 14 * big, col });
    }
    for (let i = 0; i < 12 * big; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 300, t: 0.6, size: 2 + Math.random() * 4, col: '#7d8f80' });
  }
  function screenPos(o) {
    const p = A.proj(o.z);
    const lift = o.type === 'flyer' ? 0.55 + Math.sin(o.phase * 0.7) * 0.1 : 0;
    return { p, x: VX + o.x * W * 0.55 * (0.4 + 0.6 * p), y: A.floorY(p) - lift * 300 * p, h: 360 * p * (o.def ? o.def.h : 1) };
  }
  function kill(f, silent) {
    const s = screenPos(f);
    f.dying = 0.4;
    if (target === f) target = null;
    burstLetters(s.x, s.y - s.h * 0.6, f.words.join(''), '#d8d4c8');
    if (!silent) {
      addScore(f.def.score * Math.max(1, f.words.join('').length / 4), s.x, s.y - s.h);
      S.play('kill'); stopT = 0.05; shakeT = Math.max(shakeT, 0.08);
    }
  }
  function hurt() {
    if (shield) { shield = false; S.play('block'); flashT = 0.2; return; }
    hearts--; combo = 0; stats.hits++;
    hurtT = 0.5; shakeT = 0.45;
    S.play('hurt');
    if (hearts <= 0) gameOver();
  }
  function gameOver() {
    mode = 'over'; S.music(''); target = null;
  }
  function usePickup(pk) {
    S.play('pickup');
    pops.push({ x: VX, y: HZ + 40, text: D.PICKUPS[pk.kind].text, t: 1.6, big: true });
    if (pk.kind === 'health') hearts = Math.min(5, hearts + 1);
    if (pk.kind === 'shield') shield = true;
    if (pk.kind === 'debounce') { slowT = 8; S.play('power'); }
    if (pk.kind === 'double') { doubleT = 10; S.play('power'); }
    if (pk.kind === 'macro') {
      S.play('bomb'); flashT = 0.5; shakeT = 0.5;
      foes.filter(f => !f.dying).forEach(f => kill(f));
      projs = [];
    }
  }

  // ---------- typing ----------
  function shoot(x, y) {
    shots.push({ x, y, t: 0.08 });
    S.play('shot');
  }
  function onChar(chh) {
    S.unlock();
    if (mode === 'select' && /[1-5]/.test(chh)) { const i = +chh - 1; if (i < save.unlocked) { sel = i; S.play('select'); } return; }
    if (mode !== 'play' || paused) return;
    if (boss && boss.introT > 0) return;
    chh = chh.toLowerCase();
    stats.keys++;
    keyLight[chh] = 0.15;
    // spelling question
    if (boss && boss.spell && !target) {
      const sp = boss.spell, next = sp.typed + chh;
      if (sp.options.some(o => o.startsWith(next))) {
        sp.typed = next; stats.good++; stats.chars++; combo++; maxCombo = Math.max(maxCombo, combo);
        shoot(VX, HZ - 40);
        if (sp.options.includes(next)) {
          if (next === sp.correct) bossHit();
          else { S.play('wrongAnswer'); hurt(); sp.typed = ''; }
        }
        return;
      }
    }
    if (!target) {
      const cands = liveTargets().filter(c => c.word && c.word[0] === chh);
      if (!cands.length) { miss(); return; }
      const rank = c => (projs.includes(c.obj) ? 0 : c.obj === boss ? 2 : pickups.includes(c.obj) ? 3 : 1) * 10 + (c.obj.z || 0);
      cands.sort((a, b) => rank(a) - rank(b));
      target = cands[0].obj;
      target.typed = 0;
      S.play('lock');
    }
    const word = target === boss ? boss.prompt : target.words ? target.words[target.wi] : target.word;
    if (word[target.typed] === chh) {
      target.typed++; stats.good++; stats.chars++;
      combo++; maxCombo = Math.max(maxCombo, combo);
      if (target !== boss) target.flash = 0.06;
      const s = target === boss ? { x: VX, y: HZ - 40 } : (() => { const q = screenPos(target); return { x: q.x, y: q.y - q.h * 0.6 }; })();
      shoot(s.x, s.y);
      if (target.words) target.z = Math.min(1.05, target.z + 0.004);
      if (target.typed >= word.length) complete(target);
    } else miss();
  }
  function complete(o) {
    if (o === boss) { target = null; bossHit(); return; }
    if (projs.includes(o)) {
      const s = screenPos(o);
      projs.splice(projs.indexOf(o), 1); target = null;
      burstLetters(s.x, s.y, o.word, '#c9c3b5', 0.5); addScore(15, s.x, s.y); S.play('throwHit');
      return;
    }
    if (pickups.includes(o)) { pickups.splice(pickups.indexOf(o), 1); target = null; usePickup(o); return; }
    // a foe: armour first, then body
    if (o.wi < o.words.length - 1) {
      const s = screenPos(o);
      burstLetters(s.x, s.y - s.h * 0.6, o.words[o.wi], '#d9d6cf', 0.7);
      o.wi++; o.typed = 0; target = null; S.play('block');
      return;
    }
    kill(o);
  }
  function miss() { combo = 0; S.play('miss'); flashT = Math.max(flashT, 0.08); }

  // ---------- update ----------
  function update(dt) {
    t += dt;
    for (const k in keyLight) keyLight[k] -= dt;
    shakeT = Math.max(0, shakeT - dt); hurtT = Math.max(0, hurtT - dt); flashT = Math.max(0, flashT - dt);
    for (const s of shots) s.t -= dt; shots = shots.filter(s => s.t > 0);
    for (const p of parts) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; if (p.vr) p.r += p.vr * dt; }
    parts = parts.filter(p => p.t > 0);
    for (const p of pops) { p.t -= dt; p.y -= 30 * dt; } pops = pops.filter(p => p.t > 0);
    if (story) story.shown += dt * 55;
    if (mode !== 'play' || paused) return;
    if (stopT > 0) { stopT -= dt; return; }
    stats.ms += dt * 1000;
    slowT = Math.max(0, slowT - dt); doubleT = Math.max(0, doubleT - dt);
    const sp = slowT > 0 ? 0.45 : 1;
    const st = steps[stepI];
    stepT += dt;

    if (st && st.kind === 'move') {
      travel += dt * 0.5;
      if (stepT >= st.secs) nextStep();
    }
    if (st && st.kind === 'wave') {
      travel += dt * 0.03;
      spawnT -= dt;
      if (queue.length && spawnT <= 0) {
        spawnFoe(queue.shift());
        spawnT = Math.max(0.6, 2.1 - d() * 0.25) * (0.6 + Math.random() * 0.8);
      }
      if (st.pickup && stepT > st.pickAt) { spawnPickup(st.pickup); st.pickup = null; }
      if (!queue.length && !foes.length && !projs.length) nextStep();
    }

    // foes
    for (const f of foes) {
      f.phase += dt * (f.type === 'runner' ? 10 : 6) * sp;
      f.flash = Math.max(0, f.flash - dt);
      if (f.dying) { f.dying -= dt; continue; }
      const stopAt = f.def.stopAt;
      if (stopAt && f.z <= stopAt) {
        f.throwT -= dt * sp;
        f.windup = Math.max(0, 1 - f.throwT / 0.6);
        if (f.throwT <= 0) { throwAt(f, f.x, f.z); f.throwT = 3.4 - d() * 0.2; f.windup = 0; }
        continue;
      }
      f.z -= f.speed * dt * sp;
      if (f.type === 'runner') f.x += Math.sin(f.phase * 0.3) * dt * 0.15;
      if (f.z <= 0.02) {
        f.dying = 0.01; if (target === f) target = null;
        hurt();
      }
    }
    foes = foes.filter(f => !f.dying || f.dying > 0);
    // thrown keycaps
    for (const p of projs) {
      p.z -= p.speed * dt * sp; p.flash = Math.max(0, p.flash - dt);
      p.x *= 1 - dt * 0.6;
      if (p.z <= 0.02) { p.dead = true; if (target === p) target = null; hurt(); }
    }
    projs = projs.filter(p => !p.dead);
    // pickups drift and fade
    for (const p of pickups) { p.life -= dt; p.x += p.vx * dt; if (p.life <= 0 && target === p) target = null; }
    pickups = pickups.filter(p => p.life > 0);

    // boss
    if (boss) {
      boss.flash = Math.max(0, boss.flash - dt);
      if (boss.introT > 0) {
        boss.introT -= dt; boss.scale = 0.6 + 0.4 * (1 - Math.max(0, boss.introT) / 2.4);
        if (boss.introT <= 0) bossNextPhase();
        return;
      }
      if (boss.dying) {
        boss.dying -= dt;
        if (Math.random() < 0.4) burstLetters(VX + (Math.random() - 0.5) * 300, HZ + Math.random() * 100, 'x', '#f2c230', 0.6);
        if (boss.dying <= 0) chapterClear();
        return;
      }
      const ph = boss.phases[boss.phase];
      if (ph && ph.kind === 'phrase') {
        boss.charge += dt / ph.secs * sp;
        if (boss.charge >= 1) {
          hurt();
          if (mode !== 'play') return;
          if (target === boss) target = null;
          if (ph.text) { boss.typed = 0; boss.charge = 0; } else newPhrase(ph);
        }
      }
      if (ph && ph.kind === 'spell') {
        boss.charge += dt / ph.secs * sp;
        if (boss.charge >= 1) { hurt(); boss.charge = 0; boss.spell.typed = ''; }
      }
      if (ph && ph.kind === 'barrage') {
        boss.throwT -= dt * sp;
        if (boss.thrown < ph.count && boss.throwT <= 0) {
          throwAt(boss, (Math.random() - 0.5) * 1.2, 0.7);
          boss.thrown++; boss.throwT = Math.max(0.35, 0.8 - d() * 0.08);
        }
        if (boss.thrown >= ph.count && !projs.length) bossHit();
      }
      if (ph && ph.kind === 'summon' && !foes.length) bossHit();
    }
  }

  function chapterClear() {
    S.play('clear');
    const min = stats.ms / 60000;
    const wpm = min > 0 ? Math.round((stats.chars / 5) / min) : 0;
    const acc = stats.keys ? Math.round(100 * stats.good / stats.keys) : 100;
    const pts = acc * 0.6 + Math.min(wpm, 100) / 100 * 30 + Math.max(0, 10 - stats.hits * 3);
    const rank = pts >= 88 ? 'S' : pts >= 78 ? 'A' : pts >= 66 ? 'B' : pts >= 54 ? 'C' : 'D';
    const prev = save.best[ch.id];
    if (!prev || score > prev.score) save.best[ch.id] = { score, rank };
    save.unlocked = Math.max(save.unlocked, Math.min(D.CHAPTERS.length, chIndex + 2));
    persist();
    result = { wpm, acc, rank, score, hits: stats.hits, maxCombo };
    mode = 'result';
    boss = null;
  }
  function afterResult() {
    const last = chIndex === D.CHAPTERS.length - 1;
    const then = () => {
      if (last) { mode = 'ending'; S.music('ending'); return; }
      sel = chIndex + 1; goSelect();
    };
    if (ch.letter) showStory(ch.outro, () => showStory(ch.letter, then, true));
    else showStory(ch.outro, then);
    if (last) S.music('ending');
  }

  // ---------- keys ----------
  function onEnter() {
    S.unlock();
    if (mode === 'title') { S.play('select'); goSelect(); }
    else if (mode === 'select') { if (sel < save.unlocked) { S.play('select'); startChapter(sel); } }
    else if (mode === 'story') {
      const page = story.pages[story.page];
      if (!story.letter && story.shown < page.length) { story.shown = page.length; return; }
      story.page++; story.shown = 0;
      if (story.page >= story.pages.length || story.letter) { const a = story.after; story = null; a(); }
    }
    else if (mode === 'result') afterResult();
    else if (mode === 'over') startChapter(chIndex);
    else if (mode === 'ending') goTitle();
  }
  TT.captureKeys(box, {
    label: 'Typo Horde game',
    onChar,
    onBack() { if (target) { target.typed = 0; target = null; } else if (boss && boss.spell) boss.spell.typed = ''; },
    onKey(k) {
      if (k === 'Enter') onEnter();
      if (k === 'Escape') {
        if (mode === 'play') { paused = !paused; S.duck(paused ? 0.3 : 1); }
        else if (mode === 'over' || mode === 'select') goTitle();
      }
    },
  });
  box.addEventListener('keydown', e => {
    if (mode !== 'select') return;
    if (e.key === 'ArrowRight') { sel = Math.min(save.unlocked - 1, sel + 1); S.play('blip'); }
    if (e.key === 'ArrowLeft') { sel = Math.max(0, sel - 1); S.play('blip'); }
  });
  box.addEventListener('focusin', () => { focused = true; if (paused && mode === 'play') { paused = false; S.duck(1); } });
  box.addEventListener('focusout', () => { focused = false; if (mode === 'play') { paused = true; S.duck(0.3); } });
  // taps and clicks work as Enter on menus, and pick a chapter card
  cv.addEventListener('pointerup', e => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (mode === 'select') {
      const i = cardAt(x, y);
      if (i >= 0 && i < save.unlocked) { if (i === sel) onEnter(); else { sel = i; S.play('blip'); } }
      return;
    }
    if (mode === 'play') return;
    onEnter();
  });
  const fsBtn = document.getElementById('horde-full');
  if (fsBtn) fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (box.requestFullscreen) box.requestFullscreen();
    box.querySelector('.sr-input').focus({ preventScroll: true });
  });

  // ---------- drawing helpers ----------
  function panel(x, y, w, h, r = 8) { ctx.fillStyle = C.panel; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  function text(s, x, y, font, col, align = 'left') { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align; ctx.fillText(s, x, y); }
  function wrap(s, maxW, font) {
    ctx.font = font;
    const out = []; let line = '';
    for (const w of s.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
    return out;
  }
  function keycap(x, y, s, col, label) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x, y, s, s, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 3, y + s - 5, s - 6, 3);
    if (label) text(label, x + s / 2, y + s / 2 + 5, `800 ${s * 0.42}px ${SANS}`, '#1b1c1e', 'center');
  }

  // ---------- screens ----------
  let tagRects = [];
  function drawTag(word, typed, x, y, isTarget, size = 18) {
    ctx.font = `600 ${size}px ${MONO}`;
    const tw = ctx.measureText(word).width, pad = 8;
    x = Math.max(6 + pad, Math.min(W - tw - 6 - pad, x - tw / 2));
    y = Math.max(96 + size, y);
    for (let i = 0; i < 8; i++) {
      const hit = tagRects.find(r => x - pad < r.x + r.w && x + tw + pad > r.x && y - size < r.y + r.h && y + size * 0.5 > r.y);
      if (!hit) break;
      y = hit.y - size * 0.6;
    }
    tagRects.push({ x: x - pad, y: y - size, w: tw + pad * 2, h: size * 1.5 });
    ctx.fillStyle = isTarget ? 'rgba(30,26,8,.95)' : C.panel;
    ctx.beginPath(); ctx.roundRect(x - pad, y - size * 0.95, tw + pad * 2, size * 1.45, 5); ctx.fill();
    if (isTarget) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); }
    const done = word.slice(0, typed);
    ctx.fillStyle = C.accent; ctx.textAlign = 'left'; ctx.fillText(done, x, y);
    ctx.fillStyle = isTarget ? C.ink : '#d6d4cd';
    ctx.fillText(word.slice(typed), x + ctx.measureText(done).width, y);
  }

  function drawWorld() {
    A.drawScene(ctx, ch.scene, travel, t, boss && boss.charge > 0.8);
    if (boss) A.drawBoss(ctx, boss, t);
    const order = foes.slice().sort((a, b) => b.z - a.z);
    for (const f of order) {
      const s = screenPos(f);
      A.drawTypo(ctx, { ...f, x: f.x }, s.x, s.y, s.h, Math.min(0.85, f.z * 0.85), t);
      if (f === target && !f.dying) {
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
        const cy = s.y - s.h * 0.6, r = Math.max(14, s.h * 0.2) + Math.sin(t * 10) * 2;
        ctx.beginPath(); ctx.arc(s.x, cy, r, 0, 7); ctx.stroke();
        for (const a of [0, 1.57, 3.14, 4.71]) { ctx.beginPath(); ctx.moveTo(s.x + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6); ctx.lineTo(s.x + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3); ctx.stroke(); }
      }
    }
    for (const p of pickups) {
      const s = screenPos(p);
      A.drawPickup(ctx, p, s.x, s.y - 160 * s.p, 1.1, t);
    }
    for (const p of projs) {
      const s = screenPos(p);
      A.drawProjectile(ctx, p, s.x, s.y - 200 * s.p, 0.6 + s.p * 1.4, t);
    }
    A.drawParticles(ctx, parts);
    for (const s of shots) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.globalAlpha = s.t / 0.08;
      ctx.beginPath(); ctx.moveTo(VX + (Math.random() - 0.5) * 40, H - 40); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // word tags, nearest first so far ones move up out of the way
    tagRects = [];
    for (const f of order.slice().reverse()) {
      if (f.dying) continue;
      const s = screenPos(f);
      const size = Math.round(15 + 9 * s.p);
      drawTag(f.words[f.wi], f.typed, s.x, s.y - s.h - 16, f === target, size);
      if (f.words.length > 1 && f.wi === 0) text('Armoured: 2 words', s.x, s.y - s.h + 4, `600 12px ${SANS}`, C.ink2, 'center');
    }
    for (const p of projs) { const s = screenPos(p); drawTag(p.word, p.typed, s.x, s.y - 200 * s.p - 30 * (0.6 + s.p), p === target, 20); }
    for (const p of pickups) {
      const s = screenPos(p);
      drawTag(p.word, p.typed, s.x, s.y - 160 * s.p - 44, p === target, 18);
      text(D.PICKUPS[p.kind].label, s.x, s.y - 160 * s.p + 44, `700 13px ${SANS}`, D.PICKUPS[p.kind].color, 'center');
    }
    for (const p of pops) {
      ctx.globalAlpha = Math.min(1, p.t * 2);
      text(p.text, p.x, p.y, p.big ? `800 26px ${SANS}` : `800 18px ${MONO}`, p.big ? C.ink : C.accent, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawKeyboard() {
    // Art's keyboard at the bottom of the screen lights up as he types
    const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    const k = 26, gap = 4, y0 = H - 92;
    ctx.fillStyle = 'rgba(20,21,23,.92)'; ctx.beginPath(); ctx.roundRect(VX - 175, y0 - 10, 350, 110, 12); ctx.fill();
    rows.forEach((r, ri) => {
      const x0 = VX - (r.length * (k + gap)) / 2 + ri * 8;
      [...r].forEach((c, i) => {
        const lit = keyLight[c] > 0;
        ctx.fillStyle = lit ? C.accent : '#2d2e32';
        ctx.beginPath(); ctx.roundRect(x0 + i * (k + gap), y0 + ri * (k + gap) + (lit ? 2 : 0), k, k, 4); ctx.fill();
        text(c, x0 + i * (k + gap) + k / 2, y0 + ri * (k + gap) + 18 + (lit ? 2 : 0), `700 12px ${SANS}`, lit ? '#1b1c1e' : C.ink2, 'center');
      });
    });
  }

  function drawHud() {
    // hearts and shield
    for (let i = 0; i < 5; i++) {
      if (i >= Math.max(hearts, 3)) break;
      keycap(18 + i * 34, 16, 28, i < hearts ? C.bad : '#2d2e32');
    }
    if (shield) keycap(18 + Math.max(hearts, 3) * 34, 16, 28, '#e7e6e1', 'S');
    text(String(score).padStart(6, '0'), 18, 72, `600 24px ${MONO}`, C.ink);
    // chapter and progress
    text(`${chIndex + 1}. ${ch.title}`, VX, 30, `800 17px ${SANS}`, C.ink, 'center');
    const prog = Math.min(1, stepI / (steps.length - 1));
    ctx.fillStyle = '#2d2e32'; ctx.fillRect(VX - 120, 40, 240, 5);
    ctx.fillStyle = C.accent; ctx.fillRect(VX - 120, 40, 240 * prog, 5);
    // combo and power-ups
    const m = mult();
    if (combo >= 5) text(`${combo} in a row  x${m}`, W - 18, 34, `800 18px ${SANS}`, C.accent, 'right');
    let py = 58;
    if (slowT > 0) { text(`Debounce ${slowT.toFixed(1)}`, W - 18, py, `700 14px ${MONO}`, C.blue, 'right'); py += 20; }
    if (doubleT > 0) { text(`Double ${doubleT.toFixed(1)}`, W - 18, py, `700 14px ${MONO}`, '#e07a3a', 'right'); }
    // boss bar and prompt
    if (boss && !boss.dying) {
      const bw = 420;
      text(boss.name, VX, 74, `900 18px ${SANS}`, C.bad, 'center');
      ctx.fillStyle = '#2d2e32'; ctx.fillRect(VX - bw / 2, 82, bw, 8);
      ctx.fillStyle = C.bad; ctx.fillRect(VX - bw / 2, 82, bw * (boss.hpLeft / boss.phases.length), 8);
      if (boss.introT > 0) {
        ctx.globalAlpha = Math.min(1, boss.introT);
        text(boss.name, VX, H / 2, `900 64px ${SANS}`, C.ink, 'center');
        ctx.globalAlpha = 1;
      }
      const ph = boss.phases[boss.phase];
      if (ph && boss.prompt) {
        const lines = wrap(boss.prompt, 760, `600 26px ${MONO}`);
        const h = lines.length * 34 + 30;
        panel(VX - 400, H - 120 - h, 800, h);
        let idx = 0;
        lines.forEach((ln, i) => {
          const y = H - 120 - h + 38 + i * 34;
          ctx.font = `600 26px ${MONO}`;
          const lw = ctx.measureText(ln).width; let x = VX - lw / 2;
          const done = Math.max(0, Math.min(ln.length, boss.typed - idx));
          ctx.textAlign = 'left';
          ctx.fillStyle = C.accent; ctx.fillText(ln.slice(0, done), x, y);
          ctx.fillStyle = target === boss ? C.ink : '#d6d4cd'; ctx.fillText(ln.slice(done), x + ctx.measureText(ln.slice(0, done)).width, y);
          idx += ln.length + 1;
        });
        ctx.fillStyle = boss.charge > 0.75 ? C.bad : C.accent;
        ctx.fillRect(VX - 390, H - 128, 780 * (1 - boss.charge), 4);
      }
      if (ph && boss.spell) {
        const sp = boss.spell;
        panel(VX - 330, H - 250, 660, 128);
        text(sp.ask, VX, H - 218, `800 20px ${SANS}`, C.ink, 'center');
        sp.options.forEach((o, i) => {
          const x = VX - 220 + i * 220;
          const match = sp.typed && o.startsWith(sp.typed);
          ctx.fillStyle = match ? 'rgba(242,194,48,.18)' : '#232427'; ctx.beginPath(); ctx.roundRect(x - 100, H - 196, 200, 46, 6); ctx.fill();
          ctx.font = `600 20px ${MONO}`; ctx.textAlign = 'left';
          const tw = ctx.measureText(o).width, done = match ? sp.typed.length : 0;
          ctx.fillStyle = C.accent; ctx.fillText(o.slice(0, done), x - tw / 2, H - 166);
          ctx.fillStyle = C.ink; ctx.fillText(o.slice(done), x - tw / 2 + ctx.measureText(o.slice(0, done)).width, H - 166);
        });
        ctx.fillStyle = boss.charge > 0.75 ? C.bad : C.accent;
        ctx.fillRect(VX - 320, H - 134, 640 * (1 - boss.charge), 4);
      }
      if (ph && ph.kind === 'barrage' && boss.thrown < 2) text('Shoot the keycaps', VX, H - 140, `800 22px ${SANS}`, C.ink, 'center');
      if (ph && ph.kind === 'summon') text('Clear the typos first', VX, 120, `700 16px ${SANS}`, C.ink2, 'center');
    }
  }

  function overlay(a = 0.78) { ctx.fillStyle = `rgba(12,13,14,${a})`; ctx.fillRect(0, 0, W, H); }

  const CARD_W = 168, CARD_H = 210, CARD_Y = 190;
  const cardX = i => VX - (5 * CARD_W + 4 * 14) / 2 + i * (CARD_W + 14);
  function cardAt(x, y) {
    for (let i = 0; i < 5; i++) if (x >= cardX(i) && x <= cardX(i) + CARD_W && y >= CARD_Y && y <= CARD_Y + CARD_H) return i;
    return -1;
  }

  function drawTitle() {
    A.drawScene(ctx, 'room', t * 0.08, t, false);
    overlay(0.55);
    // loose letters drifting up
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + t * 20 * (i % 3 + 1)) % W, y = H - ((i * 53 + t * 30 * (i % 2 + 1)) % (H + 40));
      text('abcdefghijklmnopqrstuvwxyz'[i % 26], x, y, `700 ${14 + (i % 4) * 6}px ${MONO}`, `rgba(242,194,48,${0.08 + (i % 5) * 0.03})`, 'center');
    }
    text('TYPO HORDE', VX, 230, `900 92px ${SANS}`, C.ink, 'center');
    text('A 10000wpm typing game', VX, 272, `600 20px ${SANS}`, C.ink2, 'center');
    if (Math.floor(t * 2) % 2 === 0) text(focused ? 'Press Enter' : 'Click to play', VX, 380, `800 24px ${SANS}`, C.accent, 'center');
    text('Esc pauses the game.', VX, 500, `500 15px ${SANS}`, C.ink2, 'center');
  }

  function drawSelect() {
    A.drawScene(ctx, D.CHAPTERS[sel].scene, t * 0.1, t, false);
    overlay(0.6);
    text('Chapters', VX, 110, `900 44px ${SANS}`, C.ink, 'center');
    text('Pick a chapter with the arrow keys or 1 to 5 and press Enter.', VX, 145, `500 16px ${SANS}`, C.ink2, 'center');
    D.CHAPTERS.forEach((c, i) => {
      const x = cardX(i), locked = i >= save.unlocked, on = i === sel;
      ctx.fillStyle = on ? '#2a2614' : '#1d1e21'; ctx.beginPath(); ctx.roundRect(x, CARD_Y, CARD_W, CARD_H, 8); ctx.fill();
      if (on) { ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.globalAlpha = locked ? 0.35 : 1;
      text(String(i + 1), x + 16, CARD_Y + 54, `900 44px ${SANS}`, on ? C.accent : C.ink);
      text(c.title, x + 16, CARD_Y + 96, `800 19px ${SANS}`, C.ink);
      wrap(c.place, CARD_W - 32, `500 13px ${SANS}`).forEach((l, k) => text(l, x + 16, CARD_Y + 120 + k * 17, `500 13px ${SANS}`, C.ink2));
      const b = save.best[c.id];
      if (locked) text('Locked', x + 16, CARD_Y + CARD_H - 20, `700 14px ${SANS}`, C.ink2);
      else if (b) {
        text(b.rank, x + CARD_W - 18, CARD_Y + CARD_H - 18, `900 34px ${SANS}`, C.accent, 'right');
        text(String(b.score), x + 16, CARD_Y + CARD_H - 20, `600 14px ${MONO}`, C.ink);
      } else text('Not played', x + 16, CARD_Y + CARD_H - 20, `600 14px ${SANS}`, C.ink2);
      ctx.globalAlpha = 1;
    });
  }

  function drawStory() {
    const c = ch || D.CHAPTERS[sel];
    if (story.letter) {
      A.drawStoryArt(ctx, c, t);
      ctx.fillStyle = '#e9e3d3'; ctx.beginPath(); ctx.roundRect(VX - 330, 40, 660, 460, 4); ctx.fill();
      let y = 84;
      story.pages.forEach(p => {
        wrap(p, 590, `500 17px ${SANS}`).forEach(l => { text(l, VX - 295, y, `500 17px ${SANS}`, '#2a2622'); y += 25; });
        y += 12;
      });
      text('Press Enter', VX, 530, `700 15px ${SANS}`, C.accent, 'center');
      return;
    }
    A.drawStoryArt(ctx, c, t);
    text(`Chapter ${chIndex + 1}`, 80, 120, `700 16px ${SANS}`, C.accent);
    text(c.title, 80, 168, `900 46px ${SANS}`, C.ink);
    text(c.place, 80, 198, `500 17px ${SANS}`, C.ink2);
    let y = 270;
    for (let i = 0; i <= story.page; i++) {
      const page = story.pages[i];
      const shown = i < story.page ? page : page.slice(0, Math.floor(story.shown));
      wrap(shown, 760, `500 22px ${SANS}`).forEach(l => { text(l, 80, y, `500 22px ${SANS}`, i < story.page ? C.ink2 : C.ink); y += 32; });
      y += 14;
    }
    if (story.shown >= story.pages[story.page].length && Math.floor(t * 2) % 2 === 0) text('Press Enter', W - 80, 500, `700 16px ${SANS}`, C.accent, 'right');
  }

  function drawResult() {
    A.drawScene(ctx, ch.scene, travel, t, false);
    overlay(0.75);
    text(`${ch.title} cleared`, VX, 110, `900 44px ${SANS}`, C.ink, 'center');
    text(result.rank, VX, 260, `900 130px ${SANS}`, C.accent, 'center');
    const rows = [['Score', result.score], ['Speed', result.wpm + ' wpm'], ['Accuracy', result.acc + '%'], ['Longest run', result.maxCombo + ' letters'], ['Hits taken', result.hits]];
    rows.forEach(([a, b], i) => {
      text(a, VX - 150, 320 + i * 30, `600 18px ${SANS}`, C.ink2);
      text(String(b), VX + 150, 320 + i * 30, `600 18px ${MONO}`, C.ink, 'right');
    });
    text('Press Enter', VX, 500, `800 20px ${SANS}`, C.accent, 'center');
  }

  function drawOver() {
    drawWorld();
    overlay(0.8);
    text('Game over', VX, 220, `900 64px ${SANS}`, C.bad, 'center');
    text(`Score ${score}`, VX, 270, `600 22px ${MONO}`, C.ink, 'center');
    text('Press Enter to try this chapter again or Esc for the title screen.', VX, 340, `700 18px ${SANS}`, C.accent, 'center');
  }

  function drawEnding() {
    A.drawScene(ctx, 'room', t * 0.05, t, false);
    overlay(0.65);
    text('The end', VX, 200, `900 64px ${SANS}`, C.ink, 'center');
    const total = Object.values(save.best).reduce((a, b) => a + b.score, 0);
    text(`Total of your best scores: ${total}`, VX, 260, `600 20px ${MONO}`, C.ink2, 'center');
    text('Thanks for playing. Follow Art on Instagram: @10000wpm', VX, 320, `600 18px ${SANS}`, C.ink, 'center');
    text('Press Enter', VX, 420, `800 20px ${SANS}`, C.accent, 'center');
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    requestAnimationFrame(frame);
    if (!visible) return;
    update(dt);
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 22 * shakeT, (Math.random() - 0.5) * 22 * shakeT);
    if (mode === 'title') drawTitle();
    else if (mode === 'select') drawSelect();
    else if (mode === 'story') drawStory();
    else if (mode === 'play') {
      drawWorld();
      drawKeyboard();
      if (slowT > 0) { ctx.fillStyle = 'rgba(80,140,255,.08)'; ctx.fillRect(0, 0, W, H); }
      if (doubleT > 0) { ctx.strokeStyle = 'rgba(224,122,58,.5)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6); }
      ctx.restore(); ctx.save();
      drawHud();
      if (paused) {
        overlay(0.75);
        text('Paused', VX, 240, `900 56px ${SANS}`, C.ink, 'center');
        text(focused ? 'Press Esc to keep playing' : 'Click to keep playing', VX, 290, `700 20px ${SANS}`, C.accent, 'center');
      }
    }
    else if (mode === 'result') drawResult();
    else if (mode === 'over') drawOver();
    else if (mode === 'ending') drawEnding();
    ctx.restore();
    if (hurtT > 0) {
      const g = ctx.createRadialGradient(VX, H / 2, 150, VX, H / 2, 560);
      g.addColorStop(0, 'rgba(229,96,79,0)'); g.addColorStop(1, `rgba(229,96,79,${hurtT})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT * 0.5})`; ctx.fillRect(0, 0, W, H); }
  }
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
    if (visible) fit();
    else { if (mode === 'play') paused = true; S.stopMusic(); }
  }).observe(box);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (mode === 'play') paused = true; S.stopMusic(); } });
  // the music comes back on the next key or click after it was stopped
  box.addEventListener('pointerdown', () => {
    const want = mode === 'play' ? (boss ? 'boss' : ch.music) : mode === 'ending' ? 'ending' : 'menu';
    if (visible && TT.soundOn()) S.music(want);
  });
  box.addEventListener('focusin', () => {
    const want = mode === 'play' ? (boss ? 'boss' : ch.music) : mode === 'ending' ? 'ending' : 'menu';
    if (TT.soundOn()) S.music(want);
  });
  requestAnimationFrame(frame);
  window._horde = { get state() { return { mode, foes, projs, pickups, boss, target, hearts, stepI, steps }; } };
})();
