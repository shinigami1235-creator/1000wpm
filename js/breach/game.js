// Breach plays like Typing of the Dead inside cyberspace. Typos come at the
// player and the word over each one shoots it. The first letter picks the target
// and each correct letter after it fires a shot. The camera rides a rail through
// each chapter's network and every chapter ends in a boss fight.
// js/breach/render.js draws the 3D world and this file runs the rules, the HUD and the menus.
(() => {
  const D = window.BreachData, S = window.BreachAudio;
  const W = 960, H = 540, VX = W / 2;
  const EYE = 1.7;
  const F_HEAD = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
  const F_LABEL = '"Share Tech Mono", ui-monospace, Consolas, monospace';
  const F_MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';
  const C = {
    bg: '#040806', bg2: 'rgba(7,16,11,.9)', bg3: '#0c1a12', line: 'rgba(57,255,136,.28)', line2: 'rgba(57,255,136,.12)',
    green: '#39ff88', greenDim: '#1f9e57', ink: '#d7f5e3', ink2: '#7fa892', ink3: '#4c6e5b',
    gold: '#f2c230', red: '#ff4d5e', cyan: '#3ee6ff',
  };

  // ---------- small vector helpers ----------
  const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const add = (a, b, k = 1) => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
  const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpV = (a, b, k) => v3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- level and rail ----------
  // Directions on the grid: forward is -z and each right turn goes clockwise.
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function buildLevel(ch) {
    const slabs = [], gates = [], arenas = [], pts = [], stops = [];
    let x = 0, y = 0, z = 0, dir = 0;
    const f = () => DIRS[dir];
    const at = (d, side = 0, dy = 0) => { const [fx, fz] = f(); return v3(x + fx * d - fz * side, y + dy, z + fz * d + fx * side); };
    const slab = (d0, len, wid, rise = 0) => {
      const c = at(d0 + len / 2);
      slabs.push({ kind: 'box', x: c.x, y: y + rise / 2, z: c.z, len, wid, dir, rise });
    };
    const pt = p => { pts.push(v3(p.x, p.y + EYE, p.z)); return pts.length - 1; };
    const go = d => { const p = at(d); x = p.x; z = p.z; };
    slab(-10, 10, 8);
    pt(at(-4));
    pt(at(0));
    const paths = ch.waves.map(w => w.path).concat([ch.bossPath]);
    paths.forEach(path => {
      let stop = 0;
      for (const tok of path) {
        if (tok === 'F') { slab(0, 12, 8); pt(at(6)); stop = pt(at(12)); go(12); }
        else if (tok === 'L' || tok === 'R') {
          slab(0, 8, 8); const c = at(4); pt(c);
          x = c.x; z = c.z; dir = (dir + (tok === 'R' ? 1 : 3)) % 4; go(4);
          slab(0, 8, 8); pt(at(4)); stop = pt(at(8)); go(8);
        } else if (tok === 'U') {
          slab(0, 10, 8, 3); pt(at(5, 0, 1.5)); y += 3; pt(at(10)); go(10);
          slab(0, 4, 8); stop = pt(at(4)); go(4);
        } else if (tok === 'D') {
          slab(0, 3, 8); go(3);
          pt(at(2.5, 0, 0.7)); y -= 4.5; slab(5, 10, 8); pt(at(6)); stop = pt(at(13)); go(15);
        } else if (tok === 'Z') {
          slab(0, 14, 22); pt(at(3)); stop = pt(at(7)); go(14);
        } else if (tok === 'A') {
          const c = at(13); slabs.push({ kind: 'disc', x: c.x, y, z: c.z, r: 13 });
          pt(at(4)); stop = pt(c); arenas.push({ x: c.x, y, z: c.z, dir }); go(26);
        } else if (tok === 'G') {
          slab(0, 16, 8); stop = pt(at(2));
          const g = at(10); gates.push({ x: g.x, y, z: g.z, dir, open: 0, state: 'shut' }); pt(at(16)); go(16);
        }
      }
      stops.push({ idx: stop, arena: path.endsWith('A') ? arenas[arenas.length - 1] : null, strafe: path.endsWith('Z'), gate: path.endsWith('G') ? gates[gates.length - 1] : null });
    });
    pt(at(6)); pt(at(12));
    const rail = makeRail(pts);
    stops.forEach(s => { s.s = rail.sAt(s.idx); });
    return { slabs, gates, arenas, rail, stops, theme: ch.theme, color: ch.color, color2: ch.color2, id: ch.id };
  }

  // centripetal Catmull-Rom, so tight corners never loop over themselves
  function crc(p0, p1, p2, p3, t) {
    const d = (p, q) => Math.pow(Math.max(1e-4, dist(p, q)), 0.5);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const tt = t1 + (t2 - t1) * t;
    const L = (p, q, ta, tb) => lerpV(p, q, (tt - ta) / (tb - ta || 1));
    const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
    const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
    return L(B1, B2, t1, t2);
  }
  function makeRail(pts) {
    const N = 10, dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < N; k++) dense.push(crc(i === 0 ? add(p1, sub(p1, p2), 1) : p0, p1, p2, i + 2 >= pts.length ? add(p2, sub(p2, p1), 1) : p3, k / N));
    }
    dense.push({ ...pts[pts.length - 1] });
    const len = [0];
    for (let i = 1; i < dense.length; i++) len.push(len[i - 1] + dist(dense[i - 1], dense[i]));
    const total = len[len.length - 1];
    function at(s) {
      s = clamp(s, 0, total);
      let lo = 0, hi = len.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] <= s) lo = m; else hi = m; }
      const k = (s - len[lo]) / (len[hi] - len[lo] || 1);
      return lerpV(dense[lo], dense[hi], k);
    }
    function fwd(s) {
      const a = at(s - 0.5), b = at(s + 2.5);
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return v3((b.x - a.x) / l, 0, (b.z - a.z) / l);
    }
    return { pts, dense, total, at, fwd, sAt: i => len[Math.min(len.length - 1, i * N)] };
  }

  // ---------- saved progress ----------
  const SAVE_KEY = 'wpm-horde-save';
  let save = { unlocked: 1, best: {} };
  const loadSave = () => { save = TT.store.get(SAVE_KEY, { unlocked: 1, best: {} }); };
  const persist = () => TT.store.set(SAVE_KEY, save);

  // ---------- state ----------
  let host = null, root = null, hud = null, ctx = null, glCanvas = null, input = null;
  let raf = 0, abort = null, ro = null, io = null, use3D = false, R3 = null, last = 0;
  let mode = 'title', paused = false, focused = false, visible = true;
  let t = 0, sel = 0, story = null, menuLevel = null;
  let ch = null, chIndex = 0, level = null, steps = [], stepI = 0, stepT = 0;
  let cam = null;
  let foes = [], projs = [], pickups = [], rush = [], pops = [], queue = [];
  let spawnT = 0, target = null, hack = null, boss = null, prompt = null;
  let hearts = 3, shield = false, score = 0, combo = 0, maxCombo = 0;
  let slowT = 0, doubleT = 0, flashT = 0, hurtT = 0, shakeT = 0, stopT = 0, glitchT = 0, banner = null;
  let stats = null, result = null, reward = null, keyFlash = 0;

  function resetRun() {
    foes = []; projs = []; pickups = []; rush = []; pops = []; queue = [];
    target = null; boss = null; hack = null; prompt = null; banner = null;
    hearts = 3; shield = false; score = 0; combo = 0; maxCombo = 0;
    slowT = 0; doubleT = 0; flashT = 0; hurtT = 0; shakeT = 0; glitchT = 0;
    stats = { keys: 0, good: 0, chars: 0, hits: 0, ms: 0 };
    reward = null;
    hurtLog.length = 0;
  }

  // ---------- flow ----------
  function menuScene(i) {
    const c = D.CHAPTERS[i];
    if (!menuLevel || menuLevel.id !== c.id) {
      menuLevel = buildLevel(c);
      if (use3D) R3.setLevel(menuLevel);
    }
  }
  function goTitle() { mode = 'title'; menuScene(0); S.music('menu'); }
  function goSelect() { mode = 'select'; sel = Math.min(save.unlocked - 1, sel); menuScene(sel); S.music('menu'); }
  function showStory(pages, after, letter) { mode = 'story'; story = { pages, page: 0, shown: 0, after, letter }; }
  function startChapter(i) {
    chIndex = i; ch = D.CHAPTERS[i];
    resetRun();
    level = buildLevel(ch);
    menuLevel = level;
    if (use3D) R3.setLevel(level);
    steps = ch.waves.map((w, k) => ({ ...w, kind: w.hack ? 'hack' : 'wave', stop: level.stops[k] }));
    steps.push({ kind: 'boss', stop: level.stops[level.stops.length - 1] });
    stepI = 0; stepT = 0;
    cam = { s: 0, v: 0, pos: level.rail.at(0), look: v3(0, EYE, -10), lat: 0, yawBias: 0 };
    showStory(ch.intro, () => { mode = 'play'; S.music(ch.music); enterStep(); });
    S.music('menu');
  }
  function enterStep() {
    const st = steps[stepI];
    stepT = 0;
    if (!st) return;
    st.arrived = false;
    if (st.kind === 'wave') {
      queue = [];
      for (const [type, n, where] of st.foes) for (let k = 0; k < n; k++) queue.push({ type, where });
      // keep swarms together and shuffle the rest
      const bugs = queue.filter(q => q.type === 'bug'), rest = TT.shuffle(queue.filter(q => q.type !== 'bug'));
      if (bugs.length) rest.splice(Math.floor(rest.length / 2), 0, { swarm: bugs });
      queue = rest;
      spawnT = 0.5;
      st.pickupLeft = st.pickup || null;
    }
  }
  function nextStep() { stepI++; enterStep(); }

  // ---------- words ----------
  const d = () => chIndex;
  function usedLetters() { return new Set(liveTargets().map(x => x.word[0])); }
  function freshWord(min, max, longChance = 0.03 + d() * 0.03) {
    const used = usedLetters();
    let w;
    for (let i = 0; i < 30; i++) {
      w = Math.random() < longChance ? TT.wordOfLength(8, 9 + d()) : TT.wordOfLength(min, max);
      if (!used.has(w[0])) break;
    }
    return w;
  }
  function freeLetter() {
    const used = usedLetters();
    const pool = 'abcdefghijklmnoprstuwy'.split('').filter(c => !used.has(c));
    return pool.length ? TT.pick(pool) : TT.pick('abcdefghijklmnoprstuwy'.split(''));
  }
  function pickFrom(list) {
    const used = usedLetters();
    const ok = list.filter(w => !used.has(w[0]));
    return TT.pick(ok.length ? ok : list);
  }
  // Every live thing that can be typed at, with its word.
  function liveTargets() {
    const out = [];
    if (prompt) out.push({ obj: prompt, word: prompt.word });
    for (const p of projs) out.push({ obj: p, word: p.word });
    if (hack && hack.live) out.push({ obj: hack, word: hack.word });
    for (const f of foes) if (!f.dying) out.push({ obj: f, word: f.words[f.wi] });
    for (const r of rush) out.push({ obj: r, word: r.word });
    if (boss && boss.core && !boss.dying) out.push({ obj: boss.core, word: boss.core.word });
    for (const p of pickups) out.push({ obj: p, word: p.word });
    return out;
  }

  // ---------- camera frame ----------
  const camFwd = () => level.rail.fwd(cam.s);
  const camRight = () => { const f = camFwd(); return v3(-f.z, 0, f.x); };
  const camFloor = () => cam.pos.y - EYE;

  // ---------- spawning ----------
  const BODY_Y = { drone: 1.6, runner: 1.15, glitcher: 1.25, splitter: 1.2, shard: 0.9, shielded: 1.65, shooter: 1.75, flyer: 3.2, bug: 0.55, node: 0 };
  // Spawns are placed around the stop the camera is heading for, so a wave that
  // starts while the camera moves meets the player when it arrives.
  function spawnPos(where, type) {
    const st = steps[stepI];
    const sb = st && st.kind === 'wave' ? clamp(st.stop.s - 3, cam.s, cam.s + 22) : cam.s;
    const base = level.rail.at(sb), f = level.rail.fwd(sb), r = camRightAt(sb);
    const floor = base.y - EYE;
    let p;
    if (where === 'corner' && sb + 20 < level.rail.total) {
      p = level.rail.at(sb + rand(13, 19)); p.y -= EYE;
      p = add(p, camRightAt(sb + 16), rand(-2.5, 2.5));
    } else if (where === 'side') {
      const k = Math.random() < 0.5 ? -1 : 1;
      p = add(add(base, f, rand(8, 11)), r, k * rand(5.5, 7)); p.y = floor;
    } else if (where === 'above') {
      p = add(add(base, f, rand(9, 14)), r, rand(-5, 5)); p.y = floor + 7;
    } else {
      p = add(add(base, f, rand(14, 19)), r, rand(-4.5, 4.5)); p.y = floor;
    }
    if (type === 'flyer' && where !== 'above') p.y = floor + 4;
    else if (where !== 'above') p.y += BODY_Y[type];
    return p;
  }
  const camRightAt = s => { const f = level.rail.fwd(s); return v3(-f.z, 0, f.x); };
  function spawnFoe(type, where, pos) {
    const def = D.ENEMIES[type];
    const grow = def.len[0] < 2 ? 0 : Math.floor(d() / (def.fast ? 3 : 2));
    const lo = def.len[0] + grow, hi = def.len[1] + grow;
    const words = [];
    for (let i = 0; i < (def.words || 1); i++) words.push(type === 'bug' ? freeLetter() : freshWord(lo, hi, type === 'shard' ? 0 : undefined));
    const f = {
      kind: 'foe', type, def, words, wi: 0, typed: 0, pos: pos || spawnPos(where, type),
      speed: def.speed * (1 + d() * 0.05) * rand(0.9, 1.1), phase: Math.random() * 6, flash: 0, seed: Math.random() * 1000,
      dying: 0, fireT: rand(1.2, 2.2), tpT: def.teleport ? rand(0.8, def.teleport) : 0, born: t, glitch: 0.5,
    };
    foes.push(f);
    return f;
  }
  function spawnPickup(kind) {
    const f = camFwd(), r = camRight(), s = Math.random() < 0.5 ? -1 : 1;
    const used = usedLetters();
    const pool = D.PICKUP_WORDS.filter(w => !used.has(w[0]));
    const word = TT.pick(pool.length ? pool : D.PICKUP_WORDS);
    const pos = add(add(cam.pos, f, 8.5), r, s * 4.2); pos.y = camFloor() + 2.1;
    pickups.push({ kind: 'pickup', pick: kind, word, typed: 0, pos, vel: add(v3(), r, -s * 0.35), life: 7.5, seed: Math.random() * 10, born: t });
    S.play('blip');
  }
  function fireAt(from, speedK = 1) {
    const letters = d() >= 3 && Math.random() < 0.35 ? 3 : d() >= 1 && Math.random() < 0.5 ? 2 : 1;
    let w = freeLetter();
    for (let i = 1; i < letters; i++) w += 'abcdefghiklmnoprstuy'[Math.floor(Math.random() * 20)];
    const p = { ...from };
    const time = (2.8 - d() * 0.12) / speedK;
    projs.push({ kind: 'proj', word: w, typed: 0, pos: p, speed: Math.max(4, dist(p, cam.pos) / time), seed: Math.random() * 6, flash: 0, born: t });
  }

  // ---------- boss ----------
  const CORE_Y = { spam: 5.4, sign: 6.2, announcer: 6.6, press: 5.8, correction: 6.1 };
  function startBoss() {
    const def = ch.boss, a = steps[stepI].stop.arena;
    const f = v3(DIRS[a.dir][0], 0, DIRS[a.dir][1]), r = v3(-f.z, 0, f.x);
    const home = add(v3(a.x, a.y, a.z), f, 12.5);
    boss = {
      def, art: def.art, name: def.name, hp: def.hp, maxHp: def.hp, f, r, home,
      pos: add(home, f, 8), goal: { ...home }, state: 'intro', st: 0, introT: 2.6, loopI: 0,
      core: null, flash: 0, shield: false, nodes: [], timer: 0, timerMax: 1, fired: 0, fireT: 0,
      events: def.events.map(e => ({ ...e, done: false })), finaleDone: false, dying: 0, hitAnim: 0, attackAnim: 0,
      wayI: 0, spell: null,
    };
    S.music('boss'); S.play('roar');
    shakeT = 0.6; glitchT = 0.6;
  }
  function bossState(s) {
    if (boss.dying) return;
    boss.state = s; boss.st = 0;
    boss.core = null; prompt = null; boss.spell = null;
    if (target && (target.kind === 'core' || target.kind === 'counter' || target.kind === 'finale')) target = null;
    const def = boss.def;
    if (s === 'core') { newCore(); bossMove(); boss.timerMax = boss.timer = Math.max(3.2, 5 - d() * 0.35); }
    if (s === 'windup') {
      const word = pickFrom(def.counters.filter(w => w !== boss.lastCounter));
      boss.lastCounter = word;
      const per = def.fastWindup ? 0.26 : 0.34;
      boss.timerMax = boss.timer = (def.fastWindup ? 1.3 : 1.9) + word.length * per * (1 - d() * 0.03);
      prompt = { kind: 'counter', word, typed: 0 };
      banner = { text: 'Attack', sub: 'Type the word to block it.', col: C.red, t: 1.4 };
      S.play('warn');
    }
    if (s === 'stun') {
      boss.timerMax = boss.timer = 4.6; rush = []; boss.rushT = 0.15;
      banner = { text: 'Stunned', sub: 'Every word you type now hits.', col: C.green, t: 1.3 };
      S.play('stun');
    }
    if (s === 'barrage') { boss.fired = 0; boss.fireT = 0.7; banner = { text: 'Incoming', sub: 'Shoot the packets down.', col: C.red, t: 1.2 }; }
    if (s === 'summon') {
      bossMove();
      for (const [type, n] of def.summon) for (let k = 0; k < n; k++) {
        const p = add(add(boss.pos, boss.r, rand(-4, 4)), boss.f, -rand(1, 3)); p.y = boss.home.y + BODY_Y[type] + (type === 'flyer' ? 1 : 0);
        const f = spawnFoe(type, 'ahead', p); f.glitch = 0.8;
      }
      boss.timerMax = boss.timer = 10;
      newCore();
      S.play('glitch');
    }
    if (s === 'shield') {
      boss.shield = true; boss.nodes = [];
      const n = def.nodes || 3;
      for (let k = 0; k < n; k++) {
        const f = spawnFoe('node', 'ahead', { ...boss.pos });
        f.words = [freshWord(4 + Math.floor(d() / 2), 6 + Math.floor(d() / 2), 0)];
        f.orbit = k / n * Math.PI * 2; boss.nodes.push(f);
      }
      boss.fireT = 2.4;
      banner = { text: 'Shield up', sub: 'Break the nodes around it.', col: C.cyan, t: 1.4 };
      S.play('power');
    }
    if (s === 'spell') {
      const ev = boss.curEvent || {};
      const set = ev.set || TT.pick(D.SPELL);
      boss.spell = { options: TT.shuffle([...set]), correct: set[0], typed: '', ask: ev.ask || 'Which one is spelled right?' };
      boss.timerMax = boss.timer = 10 - d() * 0.4;
      S.play('warn');
    }
    if (s === 'finale') {
      prompt = { kind: 'finale', word: def.finale.text, typed: 0 };
      boss.timerMax = boss.timer = 4 + def.finale.text.length * 0.3;
      banner = { text: 'Rollback', sub: 'Type the command.', col: C.green, t: 1.6 };
      S.play('warn');
    }
  }
  function newCore() {
    const lo = 4 + Math.floor(d() / 2);
    boss.core = { kind: 'core', word: freshWord(lo, lo + 3, 0), typed: 0 };
  }
  function bossMove() {
    const b = boss;
    const spots = [[-6, 0, 0], [0, 1, -2], [6, 0, 0], [-3, 2, 2], [3, 0.5, 1], [0, 0, 3]];
    if (b.def.teleport) {
      const sp = TT.pick(spots);
      const to = add(add(b.home, b.r, sp[0]), b.f, sp[2]); to.y += sp[1];
      b.pos = { ...to }; b.goal = to; b.glitch = 0.5; glitchT = Math.max(glitchT, 0.25); S.play('glitch');
    } else {
      b.wayI = (b.wayI + 1 + Math.floor(Math.random() * 2)) % spots.length;
      const sp = spots[b.wayI];
      b.goal = add(add(b.home, b.r, sp[0]), b.f, sp[2]); b.goal.y += b.art === 'sign' ? 0 : sp[1];
    }
  }
  function nextBossAction() {
    const b = boss;
    if (b.dying) return;
    if (b.def.finale && !b.finaleDone && b.hp <= b.maxHp * b.def.finale.at) { bossState('finale'); return; }
    const ev = b.events.find(e => !e.done && b.hp <= b.maxHp * e.at);
    if (ev) { ev.done = true; b.curEvent = ev; bossState(ev.act); return; }
    const act = b.def.loop[b.loopI % b.def.loop.length];
    b.loopI++;
    bossState(act);
  }
  function damageBoss(n, at) {
    const b = boss;
    if (!b || b.dying || b.state === 'intro') return;
    if (b.shield) { pops.push({ pos: at || corePos(), text: 'Blocked', t: 0.8, col: C.cyan }); S.play('block'); return; }
    const floor = b.def.finale && !b.finaleDone ? b.maxHp * (b.def.finale.at - 0.01) : 0;
    const before = b.hp;
    b.hp = Math.max(floor, b.hp - n);
    const dealt = Math.round(before - b.hp);
    b.flash = 0.15; b.hitAnim = 0.25;
    addScore(dealt);
    pops.push({ pos: at || corePos(), text: '-' + dealt, t: 0.9, col: C.ink, big: true, jitter: rand(-30, 30) });
    S.play('bossHit');
    if (b.hp <= 0) killBoss();
  }
  function killBoss() {
    const b = boss;
    b.dying = 2.2; b.state = 'dying'; b.core = null; prompt = null; b.spell = null;
    foes.forEach(f => { if (!f.dying) kill(f, true); });
    projs = []; rush = [];
    target = null;
    S.play('kill'); S.play('bomb');
    shakeT = 1; glitchT = 1;
    if (use3D) R3.burst(corePos(), b.name.replace(/ /g, '').toLowerCase() + 'xxxxxxxx', '#ffffff', 3);
  }
  const corePos = () => boss ? add(boss.pos, v3(0, CORE_Y[boss.art], 0)) : cam.pos;
  function updateBoss(dt, sp) {
    const b = boss;
    b.flash = Math.max(0, b.flash - dt); b.hitAnim = Math.max(0, b.hitAnim - dt); b.attackAnim = Math.max(0, b.attackAnim - dt);
    b.glitch = Math.max(0, (b.glitch || 0) - dt);
    b.st += dt;
    // movement: spam slithers, sign stomps, announcer and correction teleport, press slides on rails
    const k = 1 - Math.pow(0.04, dt);
    let goal = b.goal;
    if (b.art === 'spam') { goal = add(add(b.home, b.r, Math.sin(t * 0.55) * 7), b.f, Math.cos(t * 0.8) * 1.5); goal.y = b.home.y; }
    if (b.art === 'press') goal = add(add(b.home, b.r, Math.sin(t * 0.4) * 5), v3(), 0);
    if (b.state === 'windup') goal = add(goal, b.f, -1.8 * Math.min(1, b.st));
    if (b.state === 'stun') goal = add(goal, b.f, 2);
    b.pos = lerpV(b.pos, goal, b.def.teleport ? k * 0.4 : k * 0.6);
    if (b.state === 'intro') { b.introT -= dt; if (b.introT <= 0) nextBossAction(); return; }
    if (b.state === 'dying') {
      b.dying -= dt;
      if (Math.random() < dt * 14 && use3D) R3.burst(add(corePos(), v3(rand(-3, 3), rand(-2, 2), rand(-1, 1))), 'xx', Math.random() < 0.5 ? ch.color2 : '#ffffff', 1);
      if (b.dying <= 0) chapterClear();
      return;
    }
    if (b.state === 'core') {
      b.timer -= dt * sp;
      if (b.timer <= 0 && target !== b.core) nextBossAction();
    } else if (b.state === 'windup') {
      b.timer -= dt * sp;
      if (b.timer <= 0) {
        b.attackAnim = 0.6; prompt = null; if (target && target.kind === 'counter') target = null;
        hurt('attack'); if (mode !== 'play') return;
        bossState('recover');
        b.timerMax = b.timer = 0.9;
      }
    } else if (b.state === 'recover') {
      b.timer -= dt; if (b.timer <= 0) nextBossAction();
    } else if (b.state === 'stun') {
      b.timer -= dt;
      b.rushT -= dt;
      if (b.rushT <= 0 && rush.length < 4 && b.timer > 0.6) {
        const ang = Math.random() * Math.PI * 2, rr = rand(3, 5.5);
        const p = add(add(add(corePos(), b.r, Math.cos(ang) * rr * 1.2), v3(0, Math.sin(ang) * rr * 0.55 - 0.8, 0)), b.f, -2);
        rush.push({ kind: 'rush', word: freshWord(2, 4, 0), typed: 0, pos: p, born: t });
        b.rushT = 0.3;
      }
      if (b.timer <= 0) { rush = []; if (target && target.kind === 'rush') target = null; nextBossAction(); }
    } else if (b.state === 'barrage') {
      b.fireT -= dt * sp;
      if (b.fired < b.def.barrage && b.fireT <= 0) {
        fireAt(add(corePos(), b.r, rand(-2.5, 2.5)));
        b.fired++; b.fireT = Math.max(0.42, 0.9 - d() * 0.09);
        b.attackAnim = 0.2;
      }
      if (b.fired >= b.def.barrage && !projs.length) nextBossAction();
    } else if (b.state === 'summon') {
      b.timer -= dt * sp;
      if ((b.timer <= 0 || !foes.some(f => !f.dying && f.type !== 'node')) && target !== b.core) nextBossAction();
    } else if (b.state === 'shield') {
      b.fireT -= dt * sp;
      if (b.fireT <= 0) { fireAt(add(corePos(), b.r, rand(-2, 2)), 0.9); b.fireT = 3 - d() * 0.2; }
      b.nodes.forEach((n, i) => {
        if (n.dying) return;
        n.orbit += dt * 0.9 * sp;
        n.pos = add(add(corePos(), b.r, Math.cos(n.orbit) * 4.2), v3(0, Math.sin(n.orbit) * 2.1 - 0.6, 0));
        n.pos = add(n.pos, b.f, -6);
      });
      if (!b.nodes.some(n => !n.dying)) {
        b.shield = false; S.play('shieldBreak'); glitchT = 0.4;
        if (use3D) R3.ring(corePos(), C.cyan);
        bossState('stun');
      }
    } else if (b.state === 'spell') {
      b.timer -= dt * sp;
      if (b.timer <= 0) { S.play('wrongAnswer'); hurt('spell time'); if (mode !== 'play') return; nextBossAction(); }
    } else if (b.state === 'finale') {
      b.timer -= dt * sp;
      if (b.timer <= 0) {
        hurt('finale'); if (mode !== 'play') return;
        prompt.typed = 0; if (target === prompt) target = null;
        b.timerMax = b.timer = 4 + prompt.word.length * 0.3;
      }
    }
  }

  // ---------- scoring and effects ----------
  const mult = () => Math.min(3, 1 + Math.floor(combo / 10) * 0.5) * (doubleT > 0 ? 2 : 1);
  function addScore(n, pos) {
    const v = Math.round(n * mult());
    score += v;
    if (pos) pops.push({ pos, text: '+' + v, t: 0.8, col: C.green });
  }
  function anchor(o) {
    if (o.kind === 'foe') return add(o.pos, v3(0, o.type === 'bug' ? 0.35 : o.type === 'node' ? 0.7 : o.type === 'runner' ? 0.6 : 1.3, 0));
    if (o.kind === 'core') return corePos();
    return o.pos || corePos();
  }
  function kill(f, silent) {
    f.dying = 0.35;
    if (target === f) target = null;
    if (use3D) R3.burst(f.pos, f.words.join(''), f.type === 'node' ? C.cyan : '#ff4d5e', f.type === 'bug' ? 0.5 : 1);
    if (silent) return;
    addScore(f.def.score * Math.max(1, f.words.join('').length / 4), anchor(f));
    S.play('kill'); stopT = 0.04; shakeT = Math.max(shakeT, 0.08);
    if (f.def.split) {
      const r = camRight(), away = sub(f.pos, cam.pos), al = Math.hypot(away.x, away.z) || 1;
      for (let k = 0; k < f.def.split; k++) {
        const p = add(add(f.pos, r, k ? 1.6 : -1.6), v3(away.x / al, 0, away.z / al), 2);
        const s = spawnFoe('shard', 'ahead', p); s.glitch = 0.4;
      }
    }
  }
  const hurtLog = [];
  function hurt(cause) {
    hurtLog.push({ t: +t.toFixed(2), cause, step: stepI, shield });
    if (shield) { shield = false; S.play('block'); flashT = 0.2; glitchT = 0.2; return; }
    if (!hook.invincible) hearts--;
    combo = 0; stats.hits++;
    hurtT = 0.6; shakeT = 0.5; glitchT = 0.5;
    S.play('hurt');
    if (hearts <= 0) gameOver();
  }
  function gameOver() {
    mode = 'over'; S.music(''); target = null;
    reward = record(false);
  }
  function usePickup(pk) {
    S.play('pickup');
    banner = { text: D.PICKUPS[pk.pick].label, sub: D.PICKUPS[pk.pick].text, col: C.cyan, t: 1.4 };
    if (use3D) R3.ring(pk.pos, C.cyan);
    if (pk.pick === 'health') hearts = Math.min(5, hearts + 1);
    if (pk.pick === 'shield') shield = true;
    if (pk.pick === 'debounce') { slowT = 8; S.play('power'); }
    if (pk.pick === 'double') { doubleT = 10; S.play('power'); }
    if (pk.pick === 'macro') {
      S.play('bomb'); flashT = 0.4; shakeT = 0.5; glitchT = 0.4;
      foes.filter(f => !f.dying && f.type !== 'node').forEach(f => kill(f));
      projs.forEach(p => use3D && R3.burst(p.pos, p.word, '#ff4d5e', 0.4)); projs = [];
    }
  }

  // ---------- typing ----------
  function shoot(o) {
    if (use3D) R3.beam(anchor(o), o.kind === 'pickup' ? C.cyan : null);
    S.play('shot');
  }
  function onChar(c) {
    S.unlock();
    if (mode === 'select' && /[1-5]/.test(c)) { const i = +c - 1; if (i < save.unlocked) { sel = i; menuScene(sel); S.play('select'); } return; }
    if (mode !== 'play' || paused) return;
    if (boss && boss.state === 'intro') return;
    c = c.toLowerCase();
    stats.keys++; keyFlash = 0.12;
    // spelling question
    if (boss && boss.spell && !target) {
      const sp = boss.spell, next = sp.typed + c;
      if (sp.options.some(o => o.startsWith(next))) {
        sp.typed = next; stats.good++; stats.chars++; combo++; maxCombo = Math.max(maxCombo, combo);
        if (use3D) R3.beam(corePos());
        S.play('shot');
        if (sp.options.includes(next)) {
          if (next === sp.correct) { damageBoss(boss.maxHp * 0.12); S.play('phase'); bossState('stun'); }
          else { S.play('wrongAnswer'); hurt('spell wrong'); if (mode === 'play') nextBossAction(); }
        }
        return;
      }
    }
    if (!target) {
      const cands = liveTargets().filter(x => x.word && x.word[0] === c);
      if (!cands.length) { miss(); return; }
      const order = { counter: 0, finale: 0, proj: 1, hack: 2, foe: 3, rush: 4, core: 5, pickup: 6 };
      const rank = x => order[x.obj.kind] * 1000 + (x.obj.pos ? dist(x.obj.pos, cam.pos) : 0);
      cands.sort((a, b) => rank(a) - rank(b));
      target = cands[0].obj;
      target.typed = 0;
      S.play('lock');
    }
    const word = target.kind === 'foe' ? target.words[target.wi] : target.word;
    if (word[target.typed] === c) {
      target.typed++; stats.good++; stats.chars++;
      combo++; maxCombo = Math.max(maxCombo, combo);
      target.flash = 0.06;
      if (target.kind !== 'counter' && target.kind !== 'finale' && target.kind !== 'hack') shoot(target);
      else S.play('blip');
      // the space between words in a phrase needs no shot
      if (target.kind === 'foe') target.pos = add(target.pos, sub(target.pos, cam.pos), 0.012);
      if (target.typed >= word.length) complete(target);
    } else miss();
  }
  function complete(o) {
    target = null;
    if (o.kind === 'proj') {
      projs.splice(projs.indexOf(o), 1);
      if (use3D) R3.burst(o.pos, o.word, '#ff4d5e', 0.5);
      addScore(15, o.pos); S.play('throwHit');
      return;
    }
    if (o.kind === 'pickup') { pickups.splice(pickups.indexOf(o), 1); usePickup(o); return; }
    if (o.kind === 'rush') {
      rush.splice(rush.indexOf(o), 1);
      if (use3D) R3.burst(o.pos, o.word, C.green, 0.6);
      damageBoss(boss.maxHp * 0.035 + o.word.length * 4, o.pos); S.play('rush');
      return;
    }
    if (o.kind === 'core') { damageBoss(boss.maxHp * 0.06); if (use3D) R3.burst(corePos(), o.word, '#ff4d5e', 0.7); newCore(); return; }
    if (o.kind === 'counter') {
      prompt = null; S.play('repel'); shakeT = 0.3; glitchT = 0.2;
      if (use3D) R3.ring(corePos(), C.green);
      damageBoss(boss.maxHp * 0.04);
      bossState('stun');
      return;
    }
    if (o.kind === 'finale') {
      prompt = null; boss.finaleDone = true;
      damageBoss(boss.hp + 1);
      return;
    }
    if (o.kind === 'hack') {
      hack.live = false; hack.ok = true; hack.gate.state = 'opening';
      addScore(250, anchor(hack)); S.play('access'); S.play('door');
      banner = { text: 'Access granted', sub: '', col: C.green, t: 1.1 };
      nextStep();
      return;
    }
    // a foe: the shield goes first, then the body
    if (o.wi < o.words.length - 1) {
      if (use3D) { R3.burst(o.pos, o.words[o.wi], C.cyan, 0.7); R3.ring(anchor(o), C.cyan, 0.5); }
      o.wi++; o.typed = 0; S.play('shieldBreak');
      return;
    }
    kill(o);
  }
  function miss() { combo = 0; S.play('miss'); flashT = Math.max(flashT, 0.06); }
  function onBack() {
    if (target) { target.typed = 0; target = null; }
    else if (boss && boss.spell) boss.spell.typed = '';
  }

  // ---------- update ----------
  function update(dt) {
    t += dt;
    keyFlash = Math.max(0, keyFlash - dt);
    shakeT = Math.max(0, shakeT - dt); hurtT = Math.max(0, hurtT - dt); flashT = Math.max(0, flashT - dt); glitchT = Math.max(0, glitchT - dt);
    for (const p of pops) p.t -= dt;
    pops = pops.filter(p => p.t > 0);
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    if (story) story.shown += dt * 60;
    if (mode !== 'play' || paused) return;
    if (stopT > 0) { stopT -= dt; return; }
    stats.ms += dt * 1000;
    slowT = Math.max(0, slowT - dt); doubleT = Math.max(0, doubleT - dt);
    const sp = slowT > 0 ? 0.45 : 1;
    const st = steps[stepI];
    stepT += dt;

    // camera on the rail
    if (st) {
      const goal = st.stop.s, left = goal - cam.s;
      const vmax = Math.min(9, Math.sqrt(Math.max(0, left) * 2 * 9) + 0.5);
      cam.v = left > 0.02 ? Math.min(vmax, cam.v + dt * 14) : 0;
      cam.s = Math.min(goal, cam.s + cam.v * dt);
      if (!st.arrived && left <= 0.05) { st.arrived = true; st.arriveT = t; }
    }
    const base = level.rail.at(cam.s), f = camFwd(), r = camRight();
    const strafe = st && st.stop.strafe && st.arrived ? Math.sin((t - st.arriveT) * 0.7) * 5.5 : 0;
    cam.lat = lerp(cam.lat, strafe, 1 - Math.pow(0.2, dt));
    cam.pos = add(base, r, cam.lat);
    // look ahead along the rail, a little toward the boss or the target
    const ahead = level.rail.at(cam.s + 6);
    let look = v3(ahead.x, ahead.y - 0.25, ahead.z);
    if (cam.v < 1) look = add(add(cam.pos, f, 10), v3(0, -0.35, 0));
    if (boss) look = lerpV(look, add(corePos(), v3(0, -1, 0)), 0.75);
    else if (target && target.pos) look = lerpV(look, target.pos, 0.12);
    cam.look = cam.look ? lerpV(cam.look, look, 1 - Math.pow(0.03, dt)) : look;

    if (st && st.kind === 'wave') {
      spawnT -= dt;
      if (queue.length && spawnT <= 0) {
        const q = queue.shift();
        if (q.swarm) {
          const c = spawnPos(q.swarm[0].where, 'bug');
          q.swarm.forEach((b, k) => { const f2 = spawnFoe('bug', b.where, add(c, camRight(), (k - q.swarm.length / 2) * 1.1)); f2.pos.y += rand(-0.3, 0.6); });
        } else spawnFoe(q.type, q.where);
        spawnT = Math.max(0.9, 1.8 - d() * 0.15) * rand(0.7, 1.25);
      }
      const alive = foes.filter(x => !x.dying).length;
      if (st.pickupLeft && stepT > 2 && alive <= 2 && !prompt) { spawnPickup(st.pickupLeft); st.pickupLeft = null; }
      const nextKind = steps[stepI + 1] && steps[stepI + 1].kind;
      const allowed = nextKind === 'wave' ? 1 : 0;
      if (!queue.length && st.arrived && alive + projs.length <= allowed && !st.pickupLeft && !hook.hold) nextStep();
      else if (!queue.length && st.arrived && alive + projs.length <= allowed && st.pickupLeft && stepT > 4) { spawnPickup(st.pickupLeft); st.pickupLeft = null; }
    }
    if (st && st.kind === 'hack') {
      if (st.arrived && !hack && !foes.some(x => !x.dying) && !projs.length) {
        const word = pickFrom(D.PASSWORDS);
        const tMax = 2.2 + word.length * (0.42 - d() * 0.03);
        hack = { kind: 'hack', word, typed: 0, live: true, gate: st.stop.gate, timer: tMax, timerMax: tMax, pos: add(v3(st.stop.gate.x, st.stop.gate.y + 2.2, st.stop.gate.z), v3(), 0) };
        st.stop.gate.state = 'closing';
        banner = { text: 'Door closing', sub: 'Type the password.', col: C.red, t: 1.2 };
        S.play('warn');
        if (d() >= 2) for (let k = 0; k < 1 + Math.floor(d() / 2); k++) { const f = camFwd(), side = k % 2 ? 1 : -1; const p = add(add(cam.pos, f, rand(9, 12)), camRight(), side * rand(7, 9)); p.y = camFloor() + BODY_Y.bug; spawnFoe('bug', 'side', p); }
      }
      if (hack && hack.live) {
        hack.timer -= dt * sp;
        hack.gate.open = 0.15 + clamp(hack.timer / hack.timerMax, 0, 1) * 0.6;
        if (hack.timer <= 0) {
          hack.live = false; if (target === hack) target = null;
          hack.gate.state = 'forced'; hack.gate.open = 0;
          S.play('door'); hurt('door'); if (mode !== 'play') return;
          banner = { text: 'Locked out', sub: '', col: C.red, t: 1.4 };
          hack.forceT = 1.4;
        }
      }
      if (hack && !hack.live && !hack.ok) { hack.forceT -= dt; if (hack.forceT <= 0) { hack.gate.state = 'opening'; nextStep(); } }
    }
    if (hack && !hack.live && (!st || st.kind !== 'hack')) {
      hack.gate.open = Math.min(1, hack.gate.open + dt * 2.5);
      if (hack.gate.open >= 1) hack = null;
    }
    if (st && st.kind === 'boss' && st.arrived && !boss) startBoss();

    // foes
    const camFloorY = camFloor();
    for (const fo of foes) {
      fo.phase += dt * (fo.type === 'runner' ? 10 : 6) * sp;
      fo.flash = Math.max(0, fo.flash - dt); fo.glitch = Math.max(0, fo.glitch - dt);
      if (fo.dying) { fo.dying -= dt; continue; }
      if (fo.type === 'node') continue;
      const toCam = sub(cam.pos, fo.pos), fd = Math.hypot(toCam.x, toCam.z) || 1;
      const dir = v3(toCam.x / fd, 0, toCam.z / fd);
      const def = fo.def;
      if (def.teleport) {
        fo.tpT -= dt * sp;
        if (fo.tpT <= 0 && fd > 4) {
          const side = v3(-dir.z, 0, dir.x);
          fo.pos = add(fo.pos, side, (Math.random() < 0.5 ? -1 : 1) * rand(2.5, 4));
          fo.tpT = def.teleport * rand(0.8, 1.2); fo.glitch = 0.3;
          if (Math.random() < 0.5) S.play('glitch');
        }
      }
      // typos hang back while the camera is still on its way
      let moveK = cam.v > 1.5 ? 0.35 : 1;
      if (def.stopAt && fd <= def.stopAt) {
        moveK = 0;
        fo.fireT -= dt * sp;
        fo.windup = clamp(1 - fo.fireT / 0.6, 0, 1);
        if (fo.fireT <= 0) { fireAt(add(fo.pos, v3(0, 0.4, 0))); fo.fireT = def.fireEvery - d() * 0.2; fo.windup = 0; }
      }
      fo.pos = add(fo.pos, dir, Math.min(fd, fo.speed * dt * sp * moveK));
      if (fo.type === 'runner' || fo.type === 'bug') fo.pos = add(fo.pos, v3(-dir.z, 0, dir.x), Math.sin(fo.phase * 0.35 + fo.seed) * dt * 1.2);
      // height: walkers follow the floor and flyers swoop down as they close in
      let wantY = camFloorY + BODY_Y[fo.type];
      if (fo.type === 'flyer') wantY = camFloorY + 1.4 + clamp((fd - 3) / 8, 0, 1) * 2.6 + Math.sin(fo.phase * 0.5) * 0.3;
      fo.pos.y = lerp(fo.pos.y, wantY, 1 - Math.pow(0.25, dt));
      if (fd < 1.6) {
        fo.dying = 0.01; if (target === fo) target = null;
        hurt('foe ' + fo.type); if (mode !== 'play') return;
      }
    }
    foes = foes.filter(x => !x.dying || x.dying > 0);
    if (boss) boss.nodes = boss.nodes.filter(n => foes.includes(n));
    // shots coming in
    for (const p of projs) {
      const to = sub(add(cam.pos, v3(0, -0.3, 0)), p.pos), l = Math.hypot(to.x, to.y, to.z) || 1;
      const step = Math.min(l, p.speed * dt * sp);
      p.pos = add(p.pos, to, step / l);
      p.flash = Math.max(0, p.flash - dt);
      if (l - step < 1.0) { p.dead = true; if (target === p) target = null; hurt('packet'); if (mode !== 'play') return; }
    }
    projs = projs.filter(p => !p.dead);
    // power-ups drift and fade
    for (const p of pickups) { p.life -= dt; p.pos = add(p.pos, p.vel, dt); if (p.life <= 0 && target === p) target = null; }
    pickups = pickups.filter(p => p.life > 0);
    if (boss) updateBoss(dt, sp);
  }

  function rankOf(wpm, acc, hits) {
    const pts = acc * 0.6 + Math.min(wpm, 100) / 100 * 30 + Math.max(0, 10 - hits * 3);
    return pts >= 88 ? 'S' : pts >= 78 ? 'A' : pts >= 66 ? 'B' : pts >= 54 ? 'C' : 'D';
  }
  function runStats() {
    const min = stats.ms / 60000;
    const wpm = min > 0 ? Math.round((stats.chars / 5) / min) : 0;
    const acc = stats.keys ? Math.round(100 * stats.good / stats.keys) : 100;
    return { wpm, acc };
  }
  function record(cleared) {
    const { wpm, acc } = runStats();
    if (!window.WPM || !stats.keys) return null;
    try {
      return WPM.record({ mode: 'horde-' + (chIndex + 1), wpm, acc, correct: stats.chars, keys: stats.keys, ms: Math.round(stats.ms), score, cleared });
    } catch (e) { console.error(e); return null; }
  }
  function chapterClear() {
    S.play('clear');
    const { wpm, acc } = runStats();
    const rank = rankOf(wpm, acc, stats.hits);
    const prev = save.best[ch.id];
    if (!prev || score > prev.score) save.best[ch.id] = { score, rank };
    save.unlocked = Math.max(save.unlocked, Math.min(D.CHAPTERS.length, chIndex + 2));
    persist();
    reward = record(true);
    result = { wpm, acc, rank, score, hits: stats.hits, maxCombo };
    mode = 'result';
    boss = null; prompt = null;
  }
  function afterResult() {
    const lastCh = chIndex === D.CHAPTERS.length - 1;
    const then = () => {
      if (lastCh) { mode = 'ending'; menuScene(0); S.music('ending'); return; }
      sel = chIndex + 1; goSelect();
    };
    if (ch.letter) showStory(ch.outro, () => showStory(ch.letter, then, true));
    else showStory(ch.outro, then);
    if (lastCh) S.music('ending');
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
  function onKey(k) {
    if (k === 'Enter') onEnter();
    if (k === 'Escape') {
      if (mode === 'play') { paused = !paused; S.duck(paused ? 0.3 : 1); }
      else if (mode === 'over' || mode === 'select') goTitle();
    }
  }

  // ---------- drawing helpers ----------
  function cut(x, y, w, h, c = 8) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); ctx.closePath();
  }
  function panel(x, y, w, h, opts = {}) {
    const { c = 8, fill = C.bg2, stroke = C.line, glow = 0, title = null, tcol = C.green } = opts;
    cut(x, y, w, h, c);
    ctx.fillStyle = fill; ctx.fill();
    if (glow) { ctx.shadowColor = stroke; ctx.shadowBlur = glow; }
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    ctx.shadowBlur = 0;
    // corner brackets
    ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w - 10, y - 0); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h - 10); ctx.lineTo(x, y + h); ctx.lineTo(x + 10, y + h); ctx.stroke();
    if (title) text(title, x + 12, y + 17, `13px ${F_LABEL}`, tcol);
  }
  function text(s, x, y, font, col, align = 'left', glow = 0) {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align;
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
    ctx.fillText(s, x, y);
    ctx.shadowBlur = 0;
  }
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
  function typedWord(word, typed, x, y, font, doneCol, restCol, align = 'left') {
    ctx.font = font;
    const w = ctx.measureText(word).width;
    let x0 = align === 'center' ? x - w / 2 : x;
    const done = word.slice(0, typed);
    ctx.textAlign = 'left';
    ctx.fillStyle = doneCol; ctx.shadowColor = doneCol; ctx.shadowBlur = 8; ctx.fillText(done, x0, y); ctx.shadowBlur = 0;
    ctx.fillStyle = restCol; ctx.fillText(word.slice(typed), x0 + ctx.measureText(done).width, y);
    return w;
  }
  function timerBar(x, y, w, frac, col) {
    ctx.fillStyle = 'rgba(57,255,136,.12)'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.fillRect(x, y, w * clamp(frac, 0, 1), 4); ctx.shadowBlur = 0;
  }
  function icon(kind, x, y, s, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.beginPath();
    if (kind === 'plus') { ctx.moveTo(x - s * 0.4, y); ctx.lineTo(x + s * 0.4, y); ctx.moveTo(x, y - s * 0.4); ctx.lineTo(x, y + s * 0.4); ctx.stroke(); }
    else if (kind === 'clock') { ctx.arc(x, y, s * 0.42, 0, 7); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 0.28); ctx.moveTo(x, y); ctx.lineTo(x + s * 0.22, y); ctx.stroke(); }
    else if (kind === 'burst') { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(x + Math.cos(a) * s * 0.15, y + Math.sin(a) * s * 0.15); ctx.lineTo(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45); } ctx.stroke(); }
    else if (kind === 'shield') { ctx.moveTo(x, y - s * 0.45); ctx.lineTo(x + s * 0.38, y - s * 0.28); ctx.lineTo(x + s * 0.32, y + s * 0.15); ctx.lineTo(x, y + s * 0.45); ctx.lineTo(x - s * 0.32, y + s * 0.15); ctx.lineTo(x - s * 0.38, y - s * 0.28); ctx.closePath(); ctx.stroke(); }
    else if (kind === 'x2') { ctx.font = `700 ${Math.round(s * 0.7)}px ${F_MONO}`; ctx.textAlign = 'center'; ctx.fillText('x2', x, y + s * 0.25); }
  }
  function hexPath(x, y, w, h) {
    const k = h / 2;
    ctx.beginPath();
    ctx.moveTo(x - k * 0.6, y); ctx.lineTo(x, y - k); ctx.lineTo(x + w, y - k); ctx.lineTo(x + w + k * 0.6, y);
    ctx.lineTo(x + w, y + k); ctx.lineTo(x, y + k); ctx.closePath();
  }

  // ---------- projection ----------
  function screen(p) {
    if (use3D) return R3.project(p);
    // flat fallback before WebGL is ready
    const rel = sub(p, cam.pos), f = camFwd(), r = camRight();
    const z = rel.x * f.x + rel.z * f.z, x = rel.x * r.x + rel.z * r.z;
    const k = 520 / Math.max(0.5, z);
    return { x: VX + x * k, y: H * 0.5 - (rel.y) * k, behind: z < 0.5 };
  }

  // ---------- tags over targets ----------
  let tagRects = [];
  function placeTag(x, y, w, h) {
    x = clamp(x, 8, W - w - 8); y = clamp(y, 64, H - 70 - h);
    for (let i = 0; i < 10; i++) {
      const hit = tagRects.find(r => x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y);
      if (!hit) break;
      y = hit.y - h - 4;
      if (y < 64) { y = hit.y + hit.h + 4; x += 6; }
    }
    tagRects.push({ x, y, w, h });
    return { x, y };
  }
  function enemyTag(o, word, typed, sp, kindCol) {
    const closeness = clamp(1 - dist(o.pos || corePos(), cam.pos) / 26, 0, 1);
    const size = Math.round(14 + closeness * 8);
    ctx.font = `600 ${size}px ${F_MONO}`;
    const tw = ctx.measureText(word).width, pad = 7, w = tw + pad * 2, h = size + 10;
    const isT = target === o;
    let { x, y } = placeTag(sp.x - w / 2, sp.y - h - 10, w, h);
    if (sp.behind) { y = H - 120; }
    cut(x, y, w, h, 5);
    ctx.fillStyle = isT ? 'rgba(6,26,14,.94)' : 'rgba(4,10,7,.84)'; ctx.fill();
    ctx.strokeStyle = isT ? C.green : (kindCol || 'rgba(215,245,227,.25)'); ctx.lineWidth = isT ? 1.5 : 1;
    if (isT) { ctx.shadowColor = C.green; ctx.shadowBlur = 10; }
    ctx.stroke(); ctx.shadowBlur = 0;
    typedWord(word, typed, x + pad, y + h - 7, `600 ${size}px ${F_MONO}`, C.green, isT ? '#ffffff' : C.ink);
    // a thin leader line from the tag to the body
    ctx.strokeStyle = isT ? 'rgba(57,255,136,.6)' : 'rgba(215,245,227,.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(clamp(sp.x, x, x + w), y + h); ctx.lineTo(sp.x, sp.y); ctx.stroke();
    return { x, y, w, h };
  }
  function pickupTag(p, sp) {
    const size = 17;
    ctx.font = `700 ${size}px ${F_MONO}`;
    const tw = ctx.measureText(p.word).width, iw = 22, h = 28, w = tw + iw + 14;
    let { x, y } = placeTag(sp.x - w / 2 - 9, sp.y - h - 46, w + 18, h + 18);
    x += 9; y += 16;
    const blink = p.life < 2 && Math.floor(t * 8) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;
    hexPath(x, y + h / 2, w, h);
    ctx.fillStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = target === p ? 22 : 12; ctx.fill(); ctx.shadowBlur = 0;
    icon(D.PICKUPS[p.pick].icon, x + 11, y + h / 2, 18, '#03181c');
    ctx.fillStyle = 'rgba(3,24,28,.35)'; ctx.fillRect(x + iw, y + 5, 1, h - 10);
    typedWord(p.word, p.typed, x + iw + 7, y + h - 8, `700 ${size}px ${F_MONO}`, '#ffffff', '#03181c');
    text('POWER-UP // ' + D.PICKUPS[p.pick].label.toUpperCase(), x + w / 2, y - 6, `12px ${F_LABEL}`, C.cyan, 'center', 6);
    ctx.globalAlpha = 1;
  }
  function projTag(p, sp) {
    ctx.font = `700 18px ${F_MONO}`;
    const tw = ctx.measureText(p.word).width, w = tw + 14, h = 26;
    const { x, y } = placeTag(sp.x - w / 2, sp.y - h - 8, w, h);
    cut(x, y, w, h, 5);
    ctx.fillStyle = 'rgba(40,6,10,.9)'; ctx.fill();
    ctx.strokeStyle = target === p ? C.green : C.red; ctx.lineWidth = 1.5; ctx.shadowColor = C.red; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
    typedWord(p.word, p.typed, x + 7, y + h - 7, `700 18px ${F_MONO}`, C.green, '#ffd9dc');
  }
  function rushTag(r, sp) {
    ctx.font = `700 20px ${F_MONO}`;
    const tw = ctx.measureText(r.word).width, w = tw + 16, h = 30;
    const { x, y } = placeTag(sp.x - w / 2, sp.y - h / 2, w, h);
    const pulse = 0.75 + Math.sin((t - r.born) * 14) * 0.25;
    cut(x, y, w, h, 6);
    ctx.fillStyle = `rgba(57,255,136,${0.85 * pulse})`; ctx.shadowColor = C.green; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
    typedWord(r.word, r.typed, x + 8, y + h - 9, `700 20px ${F_MONO}`, '#ffffff', '#02140a');
  }
  function coreTag(sp) {
    const o = boss.core;
    ctx.font = `700 20px ${F_MONO}`;
    const tw = ctx.measureText(o.word).width, w = tw + 18, h = 30;
    const { x, y } = placeTag(sp.x - w / 2, sp.y - h - 30, w, h);
    // reticle on the weak point
    const rr = 16 + Math.sin(t * 6) * 2;
    ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.shadowColor = C.red; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, rr, 0, 7); ctx.stroke();
    for (const a of [0, 1.57, 3.14, 4.71]) { ctx.beginPath(); ctx.moveTo(sp.x + Math.cos(a) * rr * 0.5, sp.y + Math.sin(a) * rr * 0.5); ctx.lineTo(sp.x + Math.cos(a) * rr * 1.4, sp.y + Math.sin(a) * rr * 1.4); ctx.stroke(); }
    ctx.shadowBlur = 0;
    cut(x, y, w, h, 6);
    ctx.fillStyle = 'rgba(30,4,8,.9)'; ctx.fill();
    ctx.strokeStyle = target === o ? C.green : C.red; ctx.lineWidth = 1.5; ctx.stroke();
    typedWord(o.word, o.typed, x + 9, y + h - 9, `700 20px ${F_MONO}`, C.green, '#ffffff');
    ctx.fillStyle = 'rgba(4,8,6,.8)'; ctx.fillRect(x + w / 2 - 38, y - 17, 76, 15);
    text('WEAK POINT', x + w / 2, y - 5, `11px ${F_LABEL}`, C.red, 'center');
  }

  function drawWorldTags() {
    tagRects = [];
    // keep tags clear of the boss bar and the banner
    if (boss && !boss.dying) tagRects.push({ x: VX - 232, y: 48, w: 464, h: 46 });
    if (banner) { const by = boss && boss.state !== 'intro' ? 146 : 112; tagRects.push({ x: VX - 260, y: by - 30, w: 520, h: banner.sub ? 62 : 42 }); }
    // nearest first so the far ones move out of the way
    const list = [];
    for (const p of projs) list.push(p);
    for (const f of foes) if (!f.dying) list.push(f);
    list.sort((a, b) => dist(a.pos, cam.pos) - dist(b.pos, cam.pos));
    for (const o of list) {
      const sp = screen(anchor(o));
      if (o.kind === 'proj') { if (!sp.behind) projTag(o, sp); continue; }
      const word = o.words[o.wi];
      const r = enemyTag(o, word, o.typed, sp, o.type === 'node' ? 'rgba(62,230,255,.7)' : o.wi === 0 && o.words.length > 1 ? 'rgba(62,230,255,.6)' : null);
      if (o.words.length > 1 && o.wi === 0) icon('shield', r.x - 8, r.y + r.h / 2, 12, C.cyan);
      if (o === target) {
        ctx.strokeStyle = C.green; ctx.lineWidth = 1.5;
        const rr = 12 + Math.sin(t * 10) * 2;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, rr, 0, 7); ctx.stroke();
      }
    }
    for (const r of rush) rushTag(r, screen(r.pos));
    if (boss && boss.core && !boss.dying) coreTag(screen(corePos()));
    for (const p of pickups) { const sp = screen(anchor(p)); if (!sp.behind) pickupTag(p, sp); }
    for (const p of pops) {
      const sp = screen(p.pos);
      if (sp.behind) continue;
      const k = 1 - p.t / (p.big ? 0.9 : 0.8);
      ctx.globalAlpha = Math.min(1, p.t * 3);
      text(p.text, sp.x + (p.jitter || 0), sp.y - 20 - k * 40, p.big ? `700 ${26 + (1 - k) * 8}px ${F_MONO}` : `600 15px ${F_MONO}`, p.col, 'center', p.big ? 12 : 6);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- HUD ----------
  function drawHud() {
    // lives and score
    panel(14, 12, 196, 58, { title: '// LIVES' });
    for (let i = 0; i < Math.max(hearts, 3); i++) {
      const x = 30 + i * 26, y = 46, on = i < hearts;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); }
      ctx.closePath();
      ctx.fillStyle = on ? C.green : 'rgba(57,255,136,.1)';
      if (on) { ctx.shadowColor = C.green; ctx.shadowBlur = 10; }
      ctx.fill(); ctx.shadowBlur = 0;
    }
    if (shield) icon('shield', 30 + Math.max(hearts, 3) * 26, 46, 22, C.cyan);
    text(String(score).padStart(6, '0'), 200, 52, `600 20px ${F_MONO}`, C.ink, 'right', 6);
    // chapter and progress
    text(`${String(chIndex + 1).padStart(2, '0')} // ${ch.title.toUpperCase()}`, VX, 26, `14px ${F_LABEL}`, C.green, 'center', 6);
    const n = steps.length;
    for (let i = 0; i < n; i++) {
      const w = 220 / n - 3, x = VX - 110 + i * (w + 3);
      ctx.fillStyle = i < stepI ? C.green : i === stepI ? (Math.floor(t * 3) % 2 ? C.green : C.greenDim) : 'rgba(57,255,136,.14)';
      ctx.fillRect(x, 34, w, 5);
    }
    // combo and power-ups
    if (combo >= 5) {
      text(`x${mult().toFixed(1)}`, W - 18, 40, `700 26px ${F_MONO}`, C.green, 'right', 10);
      text(`${combo} IN A ROW`, W - 18, 58, `12px ${F_LABEL}`, C.ink2, 'right');
    }
    let py = 82;
    if (slowT > 0) { text(`DEBOUNCE ${slowT.toFixed(1)}`, W - 18, py, `13px ${F_LABEL}`, C.cyan, 'right', 6); py += 18; }
    if (doubleT > 0) { text(`DOUBLE ${doubleT.toFixed(1)}`, W - 18, py, `13px ${F_LABEL}`, C.cyan, 'right', 6); }
    // input line: the word being typed
    const iw = 360;
    panel(VX - iw / 2, H - 46, iw, 32, { c: 6, fill: 'rgba(4,8,6,.82)' });
    const word = target ? (target.kind === 'foe' ? target.words[target.wi] : target.word) : null;
    text('>', VX - iw / 2 + 12, H - 24, `600 16px ${F_MONO}`, C.green);
    if (word) typedWord(word, target.typed, VX - iw / 2 + 30, H - 24, `600 16px ${F_MONO}`, C.green, C.ink3);
    else if (Math.floor(t * 2.5) % 2) ctx.fillStyle = C.green, ctx.fillRect(VX - iw / 2 + 30, H - 37, 9, 16);
    if (keyFlash > 0) { ctx.strokeStyle = `rgba(57,255,136,${keyFlash * 5})`; ctx.lineWidth = 1; cut(VX - iw / 2, H - 46, iw, 32, 6); ctx.stroke(); }
    // boss
    if (boss && !boss.dying) drawBossHud();
    // hack door
    if (hack && hack.live) drawPrompt('> PASSWORD', hack.word, hack.typed, hack.timer / hack.timerMax, C.red, target === hack);
    if (banner) {
      const a = Math.min(1, banner.t * 3);
      ctx.globalAlpha = a;
      const y = boss && boss.state !== 'intro' ? 146 : 112;
      const gb = ctx.createLinearGradient(VX - 300, 0, VX + 300, 0);
      gb.addColorStop(0, 'rgba(2,6,4,0)'); gb.addColorStop(0.5, 'rgba(2,6,4,.72)'); gb.addColorStop(1, 'rgba(2,6,4,0)');
      ctx.fillStyle = gb; ctx.fillRect(VX - 300, y - 30, 600, banner.sub ? 62 : 42);
      text(banner.text.toUpperCase(), VX, y, `700 30px ${F_HEAD}`, banner.col, 'center', 16);
      if (banner.sub) text(banner.sub, VX, y + 22, `14px ${F_LABEL}`, C.ink, 'center');
      ctx.globalAlpha = 1;
    }
  }
  function drawPrompt(label, word, typed, frac, col, isT) {
    const font = `600 ${word.length > 24 ? 22 : 28}px ${F_MONO}`;
    const lines = wrap(word, 700, font);
    const lh = word.length > 24 ? 30 : 36, h = lines.length * lh + 44, w = Math.min(760, Math.max(300, ...lines.map(l => (ctx.font = font, ctx.measureText(l).width))) + 60);
    const y = H - 74 - h;
    const flashCol = frac < 0.3 && Math.floor(t * 8) % 2 ? '#ffffff' : col;
    panel(VX - w / 2, y, w, h, { c: 10, fill: 'rgba(14,4,6,.9)', stroke: flashCol, glow: 14, title: label, tcol: col });
    let idx = 0;
    lines.forEach((ln, i) => {
      const done = clamp(typed - idx, 0, ln.length);
      typedWord(ln, done, VX, y + 34 + (i + 1) * lh - 8, font, C.green, isT ? '#ffffff' : C.ink, 'center');
      idx += ln.length + 1;
    });
    timerBar(VX - w / 2 + 12, y + h - 10, w - 24, frac, frac < 0.3 ? C.red : col);
  }
  function drawBossHud() {
    const b = boss, bw = 440, x = VX - bw / 2, y = 68;
    cut(x - 12, y - 18, bw + 24, 44, 6); ctx.fillStyle = 'rgba(4,8,6,.72)'; ctx.fill();
    text(b.name.toUpperCase(), x, y, `14px ${F_LABEL}`, C.red, 'left', 8);
    text(`${Math.ceil(b.hp)} / ${b.maxHp}`, x + bw, y, `600 13px ${F_MONO}`, C.ink, 'right');
    ctx.fillStyle = 'rgba(255,77,94,.12)'; ctx.fillRect(x, y + 6, bw, 9);
    const frac = b.hp / b.maxHp;
    b.shownHp = b.shownHp === undefined ? frac : lerp(b.shownHp, frac, 0.06);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x, y + 6, bw * b.shownHp, 9);
    ctx.fillStyle = b.shield ? C.cyan : C.red; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.fillRect(x, y + 6, bw * frac, 9); ctx.shadowBlur = 0;
    for (let i = 1; i < 20; i++) { ctx.fillStyle = 'rgba(4,8,6,.8)'; ctx.fillRect(x + i * bw / 20, y + 6, 1, 9); }
    for (const e of b.events) { ctx.fillStyle = e.done ? 'rgba(215,245,227,.25)' : C.ink; ctx.fillRect(x + bw * e.at - 1, y + 3, 2, 15); }
    if (b.def.finale) { ctx.fillStyle = C.green; ctx.fillRect(x + bw * b.def.finale.at - 1, y + 3, 2, 15); }
    if (b.state === 'intro') {
      ctx.globalAlpha = clamp(b.introT, 0, 1);
      const gx = (Math.random() - 0.5) * 6 * (b.introT > 2 ? 1 : 0);
      text(b.name.toUpperCase(), VX + gx + 3, H - 120, `700 56px ${F_HEAD}`, C.red, 'center');
      text(b.name.toUpperCase(), VX - gx, H - 120, `700 56px ${F_HEAD}`, C.ink, 'center', 20);
      text('// HOSTILE PROGRAM', VX, H - 92, `15px ${F_LABEL}`, C.red, 'center');
      ctx.globalAlpha = 1;
    }
    if (prompt) drawPrompt(prompt.kind === 'finale' ? '> COMMAND' : '!! ATTACK', prompt.word, prompt.typed, b.timer / b.timerMax, prompt.kind === 'finale' ? C.green : C.red, target === prompt);
    if (b.state === 'stun') timerBar(VX - 150, 182, 300, b.timer / b.timerMax, C.green);
    if (b.spell) {
      const sp = b.spell, w = 680, h = 120, py = H - 74 - h;
      panel(VX - w / 2, py, w, h, { c: 10, fill: 'rgba(4,10,7,.92)', stroke: C.green, glow: 10, title: '> QUESTION' });
      text(sp.ask, VX, py + 44, `600 20px ${F_HEAD}`, C.ink, 'center');
      sp.options.forEach((o, i) => {
        const cx = VX - 220 + i * 220;
        const match = sp.typed && o.startsWith(sp.typed);
        cut(cx - 100, py + 58, 200, 40, 6);
        ctx.fillStyle = match ? 'rgba(57,255,136,.16)' : 'rgba(57,255,136,.05)'; ctx.fill();
        ctx.strokeStyle = match ? C.green : C.line; ctx.lineWidth = 1; ctx.stroke();
        typedWord(o, match ? sp.typed.length : 0, cx, py + 84, `600 19px ${F_MONO}`, C.green, C.ink, 'center');
      });
      timerBar(VX - w / 2 + 12, py + h - 10, w - 24, b.timer / b.timerMax, b.timer / b.timerMax < 0.3 ? C.red : C.green);
    }
  }

  function overlay(a = 0.78) { ctx.fillStyle = `rgba(2,6,4,${a})`; ctx.fillRect(0, 0, W, H); }
  function scan() {
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }

  // ---------- screens ----------
  const CARD_W = 166, CARD_H = 214, CARD_Y = 176;
  const cardX = i => VX - (5 * CARD_W + 4 * 12) / 2 + i * (CARD_W + 12);
  function cardAt(x, y) {
    for (let i = 0; i < 5; i++) if (x >= cardX(i) && x <= cardX(i) + CARD_W && y >= CARD_Y && y <= CARD_Y + CARD_H) return i;
    return -1;
  }
  function glitchTitle(s, x, y, size) {
    const font = `700 ${size}px ${F_HEAD}`;
    const g = Math.random() < 0.08 ? rand(4, 12) : 1.5;
    ctx.globalCompositeOperation = 'lighter';
    text(s, x - g, y, font, 'rgba(255,77,94,.7)', 'center');
    text(s, x + g, y, font, 'rgba(62,230,255,.6)', 'center');
    ctx.globalCompositeOperation = 'source-over';
    text(s, x, y, font, C.ink, 'center', 24);
    if (Math.random() < 0.06) {
      const sy = y - size * rand(0.2, 0.8), sh = rand(4, 12);
      const ky = hud.height / H;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(hud, 0, sy * ky, hud.width, sh * ky, rand(-20, 20) * ky, sy * ky, hud.width, sh * ky);
      ctx.restore();
    }
  }
  function drawTitle() {
    overlay(use3D ? 0.35 : 0.85);
    const g = ctx.createLinearGradient(0, 140, 0, 400);
    g.addColorStop(0, 'rgba(2,6,4,0)'); g.addColorStop(0.5, 'rgba(2,6,4,.6)'); g.addColorStop(1, 'rgba(2,6,4,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 140, W, 260);
    text('> 10000WPM // GAME_', VX, 160, `15px ${F_LABEL}`, C.green, 'center', 8);
    glitchTitle('BREACH', VX, 262, 118);
    text('A typing game in five chapters', VX, 298, `500 18px ${F_HEAD}`, C.ink2, 'center');
    if (Math.floor(t * 2) % 2 === 0) text(focused ? '[ PRESS ENTER ]' : '[ CLICK TO PLAY ]', VX, 380, `20px ${F_LABEL}`, C.green, 'center', 12);
    text('Esc pauses the game.', VX, 500, `14px ${F_LABEL}`, C.ink2, 'center');
  }
  function drawSelect() {
    overlay(use3D ? 0.45 : 0.85);
    text('> SELECT_CHAPTER', cardX(0), 96, `14px ${F_LABEL}`, C.green, 'left', 6);
    text('Chapters', cardX(0), 136, `700 38px ${F_HEAD}`, C.ink, 'left');
    text('Pick a chapter with the arrow keys or 1 to 5 and press Enter.', cardX(4) + CARD_W, 136, `14px ${F_LABEL}`, C.ink2, 'right');
    D.CHAPTERS.forEach((c, i) => {
      const x = cardX(i), locked = i >= save.unlocked, on = i === sel;
      panel(x, CARD_Y, CARD_W, CARD_H, { c: 10, fill: on ? 'rgba(10,34,20,.92)' : 'rgba(5,12,8,.88)', stroke: on ? C.green : C.line, glow: on ? 14 : 0 });
      ctx.globalAlpha = locked ? 0.35 : 1;
      text(String(i + 1).padStart(2, '0'), x + 14, CARD_Y + 50, `600 38px ${F_MONO}`, on ? C.green : C.ink, 'left', on ? 12 : 0);
      ctx.fillStyle = c.color2; ctx.fillRect(x + 14, CARD_Y + 62, 26, 3);
      text(c.title, x + 14, CARD_Y + 92, `700 19px ${F_HEAD}`, C.ink);
      wrap(c.place, CARD_W - 28, `13px ${F_LABEL}`).forEach((l, k) => text(l, x + 14, CARD_Y + 114 + k * 16, `13px ${F_LABEL}`, C.ink2));
      const b = save.best[c.id];
      if (locked) text('LOCKED', x + 14, CARD_Y + CARD_H - 18, `13px ${F_LABEL}`, C.ink2);
      else if (b) {
        const top = b.rank === 'S' || b.rank === 'A';
        text(b.rank, x + CARD_W - 16, CARD_Y + CARD_H - 14, `700 34px ${F_HEAD}`, top ? C.gold : C.green, 'right', 10);
        text(String(b.score), x + 14, CARD_Y + CARD_H - 18, `600 14px ${F_MONO}`, C.ink);
      } else text('NOT PLAYED', x + 14, CARD_Y + CARD_H - 18, `13px ${F_LABEL}`, C.ink2);
      ctx.globalAlpha = 1;
    });
  }
  function drawStory() {
    const c = ch || D.CHAPTERS[sel];
    overlay(use3D ? 0.62 : 0.9);
    if (story.letter) {
      const w = 640, h = 440, x = VX - w / 2, y = 40;
      panel(x, y, w, h, { c: 12, fill: 'rgba(4,10,7,.95)', title: '> LETTER.TXT' });
      let yy = y + 50;
      story.pages.forEach(p => {
        wrap(p, w - 60, `16px ${F_MONO}`).forEach(l => { text(l, x + 30, yy, `16px ${F_MONO}`, C.ink); yy += 23; });
        yy += 10;
      });
      text('[ PRESS ENTER ]', VX, 515, `14px ${F_LABEL}`, C.green, 'center', 8);
      return;
    }
    text(`> CHAPTER ${String(chIndex + 1).padStart(2, '0')}`, 80, 110, `15px ${F_LABEL}`, C.green, 'left', 8);
    text(c.title, 80, 160, `700 46px ${F_HEAD}`, C.ink, 'left', 10);
    text(c.place.toUpperCase(), 80, 190, `14px ${F_LABEL}`, C.ink2);
    ctx.fillStyle = c.color2; ctx.fillRect(80, 204, 40, 3);
    let y = 260;
    for (let i = 0; i <= story.page; i++) {
      const page = story.pages[i];
      const shown = i < story.page ? page : page.slice(0, Math.floor(story.shown));
      const lines = wrap(shown, 780, `500 21px ${F_HEAD}`);
      lines.forEach((l, k) => {
        text(l, 80, y, `500 21px ${F_HEAD}`, i < story.page ? C.ink2 : C.ink);
        if (i === story.page && k === lines.length - 1 && Math.floor(t * 3) % 2) { ctx.font = `500 21px ${F_HEAD}`; ctx.fillStyle = C.green; ctx.fillRect(80 + ctx.measureText(l).width + 4, y - 17, 10, 20); }
        y += 31;
      });
      y += 12;
    }
    if (story.shown >= story.pages[story.page].length && Math.floor(t * 2) % 2 === 0) text('[ PRESS ENTER ]', W - 80, 500, `14px ${F_LABEL}`, C.green, 'right', 8);
  }
  function rewardRows() {
    if (!reward) return [];
    return [['Coins', '+' + reward.coins, C.gold], ['XP', '+' + reward.xp, C.green]];
  }
  function drawResult() {
    overlay(use3D ? 0.7 : 0.9);
    const w = 460, h = 372, x = VX - w / 2, y = 70;
    panel(x, y, w, h, { c: 12, fill: 'rgba(4,10,7,.94)', title: '> CHAPTER_CLEARED' });
    text(`${ch.title} cleared`, VX, y + 64, `700 32px ${F_HEAD}`, C.ink, 'center');
    const top = result.rank === 'S' || result.rank === 'A';
    text(result.rank, VX, y + 160, `700 104px ${F_HEAD}`, top ? C.gold : C.green, 'center', 24);
    text('RANK', VX, y + 182, `12px ${F_LABEL}`, C.ink2, 'center');
    const rows = [['Score', String(result.score)], ['Speed', result.wpm + ' wpm'], ['Accuracy', result.acc + '%'], ['Longest run', result.maxCombo + ' letters'], ['Hits taken', String(result.hits)]];
    rows.concat(rewardRows()).forEach(([a, b, col], i) => {
      const ry = y + 212 + i * 23;
      text(a.toUpperCase(), x + 40, ry, `13px ${F_LABEL}`, C.ink2);
      text(b, x + w - 40, ry, `600 15px ${F_MONO}`, col || C.ink, 'right');
    });
    text('[ PRESS ENTER ]', VX, y + h + 34, `15px ${F_LABEL}`, C.green, 'center', 8);
  }
  function drawOver() {
    overlay(0.8);
    glitchTitle('GAME OVER', VX, 210, 64);
    text(`SCORE ${score}`, VX, 256, `600 18px ${F_MONO}`, C.ink, 'center');
    const rr = rewardRows();
    if (rr.length) text(`COINS ${rr[0][1]}   XP ${rr[1][1]}`, VX, 284, `600 15px ${F_MONO}`, C.ink2, 'center');
    text('Press Enter to try this chapter again or Esc for the title screen.', VX, 350, `15px ${F_LABEL}`, C.green, 'center', 6);
  }
  function drawEnding() {
    overlay(use3D ? 0.55 : 0.88);
    glitchTitle('THE END', VX, 200, 64);
    const total = Object.values(save.best).reduce((a, b) => a + b.score, 0);
    text(`Total of your best scores: ${total}`, VX, 260, `600 18px ${F_MONO}`, C.ink2, 'center');
    text('Thanks for playing. Follow Art on Instagram: @10000wpm', VX, 316, `500 18px ${F_HEAD}`, C.ink, 'center');
    text('[ PRESS ENTER ]', VX, 420, `15px ${F_LABEL}`, C.green, 'center', 8);
  }

  // ---------- loop ----------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(hook.maxDt, (now - last) / 1000); last = now;
    if (!visible) return;
    update(dt);
    ctx.setTransform(hud.width / W, 0, 0, hud.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const inPlay = mode === 'play' || mode === 'over';
    if (use3D) {
      let camPose;
      if (inPlay || mode === 'result' || (mode === 'story' && ch && level === menuLevel && cam && stepI > 0)) camPose = { pos: cam.pos, look: cam.look };
      else {
        // menus fly slowly along the chapter rail
        const L = menuLevel, s = (t * 3.2) % Math.max(1, L.rail.total - 20);
        const p = L.rail.at(s), a = L.rail.at(s + 8);
        camPose = { pos: add(p, v3(0, 1.2, 0)), look: a };
      }
      R3.frame({
        t, dt: paused ? 0 : dt, cam: camPose, shake: shakeT, hurt: hurtT, glitch: glitchT, slow: slowT > 0,
        foes: inPlay ? foes : [], projs: inPlay ? projs : [], pickups: inPlay ? pickups : [], rush: inPlay ? rush : [],
        boss: inPlay ? boss : null, bossCore: boss ? corePos() : null, target, mode,
      });
    } else {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(57,255,136,.12)';
      for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.moveTo(VX + (i - 10) * 30, H / 2); ctx.lineTo(VX + (i - 10) * 160, H); ctx.stroke(); }
    }
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 14 * shakeT, (Math.random() - 0.5) * 14 * shakeT);
    if (mode === 'title') drawTitle();
    else if (mode === 'select') drawSelect();
    else if (mode === 'story') drawStory();
    else if (mode === 'play') {
      drawWorldTags();
      ctx.restore(); ctx.save();
      drawHud();
      if (paused) {
        overlay(0.75);
        text('PAUSED', VX, 240, `700 52px ${F_HEAD}`, C.ink, 'center', 16);
        text(focused ? 'Press Esc to keep playing.' : 'Click to keep playing.', VX, 284, `16px ${F_LABEL}`, C.green, 'center');
      }
    }
    else if (mode === 'result') drawResult();
    else if (mode === 'over') { drawWorldTags(); drawOver(); }
    else if (mode === 'ending') drawEnding();
    ctx.restore();
    if (flashT > 0) { ctx.fillStyle = `rgba(215,245,227,${flashT * 0.35})`; ctx.fillRect(0, 0, W, H); }
    if (!use3D) scan();
  }

  // ---------- mount ----------
  const STYLE = `
.breach-host{position:relative}
.breach-host:fullscreen{display:flex;align-items:center;justify-content:center;background:#000}
.breach-root{position:relative;margin:0 auto;overflow:hidden;background:#020604;outline:none;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.breach-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.breach-root .sr-input{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;resize:none;pointer-events:none}`;
  function injectStyle() {
    if (document.getElementById('breach-style')) return;
    const s = document.createElement('style'); s.id = 'breach-style'; s.textContent = STYLE;
    document.head.appendChild(s);
  }
  function fit() {
    if (!root || !host) return;
    const w = host.clientWidth || W, h = document.fullscreenElement === host ? host.clientHeight : 0;
    let rw = w, rh = w * 9 / 16;
    if (h > 40 && rh > h) { rh = h; rw = h * 16 / 9; }
    rw = Math.floor(rw); rh = Math.floor(rh);
    root.style.width = rw + 'px'; root.style.height = rh + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    hud.width = Math.round(rw * dpr); hud.height = Math.round(rh * dpr);
    if (use3D) R3.resize(rw, rh);
  }
  const wantMusic = () => mode === 'play' ? (boss ? 'boss' : ch.music) : mode === 'ending' ? 'ending' : mode === 'over' ? '' : 'menu';
  function mount(el) {
    if (root) unmount();
    if (!el) throw new Error('Breach.mount needs an element');
    injectStyle();
    loadSave();
    host = el; host.classList.add('breach-host');
    root = document.createElement('div'); root.className = 'breach-root'; root.tabIndex = -1;
    glCanvas = document.createElement('canvas'); glCanvas.className = 'breach-gl';
    hud = document.createElement('canvas'); hud.className = 'breach-hud';
    root.append(glCanvas, hud); host.appendChild(root);
    ctx = hud.getContext('2d');
    abort = new AbortController();
    const sig = { signal: abort.signal };
    input = TT.captureKeys(root, { label: 'Breach game', onChar, onBack, onKey });
    root.addEventListener('keydown', e => {
      if (mode !== 'select') return;
      if (e.key === 'ArrowRight') { sel = Math.min(save.unlocked - 1, sel + 1); menuScene(sel); S.play('blip'); }
      if (e.key === 'ArrowLeft') { sel = Math.max(0, sel - 1); menuScene(sel); S.play('blip'); }
    }, sig);
    root.addEventListener('focusin', () => { focused = true; if (paused && mode === 'play') { paused = false; S.duck(1); } if (TT.soundOn() && visible) S.music(wantMusic()); }, sig);
    root.addEventListener('focusout', () => { focused = false; if (mode === 'play') { paused = true; S.duck(0.3); } }, sig);
    root.addEventListener('pointerdown', () => { if (visible && TT.soundOn()) S.music(wantMusic()); }, sig);
    hud.addEventListener('pointerup', e => {
      const r = hud.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
      if (mode === 'select') {
        const i = cardAt(x, y);
        if (i >= 0 && i < save.unlocked) { if (i === sel) onEnter(); else { sel = i; menuScene(sel); S.play('blip'); } }
        return;
      }
      if (mode === 'play') return;
      onEnter();
    }, sig);
    window.addEventListener('resize', fit, sig);
    document.addEventListener('fullscreenchange', () => setTimeout(fit, 50), sig);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (mode === 'play') paused = true; S.stopMusic(); } }, sig);
    ro = new ResizeObserver(() => fit()); ro.observe(host);
    io = new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (!visible) { if (mode === 'play') paused = true; S.stopMusic(); }
    });
    io.observe(root);
    mode = 'title'; t = 0; paused = false; menuLevel = null; ch = null;
    use3D = false; R3 = window.Breach3D || null;
    goTitle();
    fit();
    const mine = root;
    if (R3) R3.init(glCanvas).then(ok => {
      if (root !== mine) return;
      use3D = ok;
      if (ok) { fit(); R3.setLevel(menuLevel); }
    });
    last = performance.now();
    raf = requestAnimationFrame(frame);
    setTimeout(() => input && input.focus(), 0);
  }
  function unmount() {
    cancelAnimationFrame(raf); raf = 0;
    S.stopMusic(0.2);
    if (abort) abort.abort();
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    if (R3) R3.dispose();
    if (document.fullscreenElement === host) document.exitFullscreen().catch(() => {});
    if (root) root.remove();
    if (host) host.classList.remove('breach-host');
    root = host = hud = ctx = glCanvas = input = null; use3D = false;
    mode = 'title'; boss = null; foes = []; projs = []; pickups = []; rush = [];
  }
  function fullscreen() {
    if (!host) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (host.requestFullscreen) host.requestFullscreen();
    if (input) input.focus();
  }

  // ---------- debug hook for test bots ----------
  const hook = {
    get state() {
      return {
        mode, paused, hearts, score, stepI, steps, foes, projs, pickups, rush, boss, prompt, hack, target, combo, cam,
        story: story && { page: story.page, pages: story.pages.length, letter: !!story.letter },
        result, reward, use3D, level, stats, t,
      };
    },
    targets: () => liveTargets().map(x => ({ word: x.word, kind: x.obj.kind, typed: x.obj.typed || 0, d: x.obj.pos && cam ? dist(x.obj.pos, cam.pos) : 0 })),
    unlockAll() { save.unlocked = 5; persist(); },
    maxDt: 0.05,
    invincible: false,
    hold: false,
    setHearts(n) { hearts = n; },
    // test helpers: jump the camera to a step, or place one enemy in front of the camera
    jump(i) { foes = []; projs = []; pickups = []; queue = []; target = null; stepI = i; cam.s = Math.max(0, steps[i].stop.s - 0.05); cam.pos = level.rail.at(cam.s); enterStep(); queue = []; },
    spawn(type, distance, side = 0, frozen = true) {
      const p = add(add(cam.pos, camFwd(), distance), camRight(), side); p.y = camFloor() + BODY_Y[type];
      const f = spawnFoe(type, 'ahead', p); if (frozen) f.speed = 0; f.glitch = 0; return f.words.join(' ');
    },
    pickup(kind) { spawnPickup(kind || 'health'); },
    hurtLog,
  };
  window._horde = hook; window._breach = hook;

  const queued = window.Breach && window.Breach._queue;
  window.Breach = { mount, unmount, fullscreen, get mounted() { return !!root; } };
  if (queued && queued.length) queued.forEach(([fn, arg]) => window.Breach[fn](arg));
  document.dispatchEvent(new CustomEvent('breach:ready'));
})();
