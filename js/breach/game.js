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
  const HIT_D = 2.4;
  const PW = 12, AR = 15;   // platform width and arena radius in metres
  function buildLevel(ch) {
    const slabs = [], gates = [], arenas = [], pts = [], ptsR = [], stops = [];
    const bridges = [], elevators = [], branches = [], chases = [], darks = [];
    let x = 0, y = 0, z = 0, dir = 0;
    const f = () => DIRS[dir];
    const at = (d, side = 0, dy = 0) => { const [fx, fz] = f(); return v3(x + fx * d - fz * side, y + dy, z + fz * d + fx * side); };
    const slab = (d0, len, wid, rise = 0, extra = {}) => {
      const c = at(d0 + len / 2);
      const sl = { kind: 'box', x: c.x, y: y + rise / 2, z: c.z, len, wid, dir, rise, ...extra };
      slabs.push(sl); return sl;
    };
    // pt adds a rail point to both rails, ptB adds a different point to each lane
    const pt = p => { pts.push(v3(p.x, p.y + EYE, p.z)); ptsR.push(v3(p.x, p.y + EYE, p.z)); return pts.length - 1; };
    const ptB = (l, r) => { pts.push(v3(l.x, l.y + EYE, l.z)); ptsR.push(v3(r.x, r.y + EYE, r.z)); return pts.length - 1; };
    const go = d => { const p = at(d); x = p.x; z = p.z; };
    slab(-10, 10, PW);
    pt(at(-4));
    pt(at(0));
    const waves = ch.waves.concat([{ path: ch.bossPath }]);
    waves.forEach(w => {
      let stop = 0, extra = {};
      for (const tok of w.path) {
        if (tok === 'F') { slab(0, 12, PW); pt(at(6)); stop = pt(at(12)); go(12); }
        else if (tok === 'L' || tok === 'R') {
          slab(0, 8, PW); const c = at(4); pt(c);
          x = c.x; z = c.z; dir = (dir + (tok === 'R' ? 1 : 3)) % 4; go(4);
          slab(0, 8, PW); pt(at(4)); stop = pt(at(8)); go(8);
        } else if (tok === 'U') {
          slab(0, 10, PW, 3); pt(at(5, 0, 1.5)); y += 3; pt(at(10)); go(10);
          slab(0, 4, PW); stop = pt(at(4)); go(4);
        } else if (tok === 'D') {
          slab(0, 3, PW); go(3);
          pt(at(2.5, 0, 0.7)); y -= 4.5; slab(5, 10, PW); pt(at(6)); stop = pt(at(13)); go(15);
        } else if (tok === 'Z') {
          slab(0, 14, 22); pt(at(3)); stop = pt(at(7)); go(14);
        } else if (tok === 'A') {
          const c = at(AR); slabs.push({ kind: 'disc', x: c.x, y, z: c.z, r: AR });
          pt(at(4)); stop = pt(c); arenas.push({ x: c.x, y, z: c.z, dir, r: AR }); go(AR * 2);
        } else if (tok === 'G') {
          slab(0, 16, PW); stop = pt(at(2));
          const g = at(10); gates.push({ x: g.x, y, z: g.z, dir, open: 0, state: 'shut' }); pt(at(16)); go(16);
        } else if (tok === 'X') {
          // a narrow bridge of tiles that falls away once the camera is across
          const b = { tiles: [], fallen: false };
          for (let k = 0; k < 8; k++) b.tiles.push(slab(k * 2.75, 2.75, 7, 0, { tile: true, bridge: b }));
          slab(22, 6, PW);
          pt(at(7)); pt(at(15)); stop = pt(at(24)); go(28);
          bridges.push(b); extra.bridge = b;
        } else if (tok === 'C') {
          // a long straight track with a train coming up behind
          const L = 64, c = { from: pts.length - 1 };
          slab(0, L, PW, 0, { track: true });
          for (let d = 8; d < L; d += 8) pt(at(d));
          stop = pt(at(L)); go(L);
          c.to = stop; chases.push(c); extra.chase = c;
        } else if (tok === 'E') {
          // an elevator disc: the wave is fought at the top, then it rides down 16 m
          slab(0, 4, PW);
          const c = at(11); slabs.push({ kind: 'disc', x: c.x, y, z: c.z, r: 7, lift: true });
          pt(at(5)); stop = pt(c);
          const e = { x: c.x, z: c.z, top: y, bottom: y - 16, r: 7, dir };
          pt(v3(c.x, y - 5, c.z)); pt(v3(c.x, y - 11, c.z));
          y -= 16; slabs.push({ kind: 'disc', x: c.x, y, z: c.z, r: 7 });
          pt(c.x !== undefined ? v3(c.x, y, c.z) : c);
          x = c.x; z = c.z; go(4);
          slab(0, 8, PW); pt(at(5)); go(8);
          elevators.push(e); extra.elevator = e;
        } else if (tok === 'B') {
          // two lanes split by a wall; the player types a sign's word to pick one
          slab(0, 6, PW);
          const choice = pt(at(3));
          slab(6, 32, 26, 0, { wide: true });
          ptB(at(11, -7), at(11, 7)); ptB(at(17, -7), at(17, 7));
          stop = ptB(at(24, -7), at(24, 7));
          pt(at(36)); go(38);
          const br = { choice, a: at(-38 + 3), dir, wall: { from: at(-38 + 10), to: at(-38 + 33) }, lanes: w.branch ? [w.branch.left, w.branch.right] : [] };
          branches.push(br); extra.branch = br;
        } else if (tok === 'K') {
          slab(0, 16, PW, 0, { dark: true }); pt(at(8)); stop = pt(at(16)); go(16);
          extra.dark = true;
        }
      }
      stops.push({ idx: stop, arena: w.path.endsWith('A') ? arenas[arenas.length - 1] : null, strafe: w.path.endsWith('Z'),
        gate: w.path.endsWith('G') ? gates[gates.length - 1] : null, ...extra });
    });
    pt(at(6)); pt(at(12));
    const rails = [makeRail(pts), makeRail(ptsR)];
    const rail = rails[0];
    stops.forEach(s => {
      s.s = rail.sAt(s.idx);
      if (s.branch) s.branch.choiceS = rail.sAt(s.branch.choice);
      if (s.chase) { s.chase.s0 = rail.sAt(s.chase.from); s.chase.s1 = s.s; }
    });
    return { slabs, gates, arenas, rail, rails, stops, bridges, elevators, branches, chases, theme: ch.theme, color: ch.color, color2: ch.color2, fog: ch.fog, base: ch.base, cell: ch.cell, id: ch.id };
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
      for (const [da, db] of [[0.5, 2.5], [0.5, 8], [6, 8], [12, 14], [20, 20]]) {
        const a = at(s - da), b = at(s + db), l = Math.hypot(b.x - a.x, b.z - a.z);
        if (l > 0.4) return v3((b.x - a.x) / l, 0, (b.z - a.z) / l);
      }
      return v3(0, 0, -1);
    }
    return { pts, dense, total, at, fwd, sAt: i => len[Math.min(len.length - 1, i * N)] };
  }

  // Height of the platform under (x, z), or null over the void. With two
  // platforms stacked, the one nearest refY wins.
  function floorAt(x, z, refY, inset = 0) {
    let best = null;
    for (const s of level.slabs) {
      let y = null;
      if (s.bridge && s.bridge.fallen) continue;
      if (s.kind === 'disc') { if (Math.hypot(x - s.x, z - s.z) <= s.r - 0.6 - inset) y = s.y; }
      else {
        const [fx, fz] = DIRS[s.dir], dx = x - s.x, dz = z - s.z;
        const along = dx * fx + dz * fz, side = dx * -fz + dz * fx;
        if (Math.abs(along) <= s.len / 2 + 0.3 - inset * 1.4 && Math.abs(side) <= s.wid / 2 - 0.6 - inset) y = s.y - s.rise / 2 + s.rise * (along / s.len + 0.5);
      }
      if (y !== null && (best === null || Math.abs(y - refY) < Math.abs(best - refY))) best = y;
    }
    return best;
  }
  // Moves p by delta while staying on a platform. Slides along an edge, or stays put.
  function walk(p, delta, refY) {
    if (floorAt(p.x, p.z, refY) === null) return { x: p.x + delta.x, y: p.y, z: p.z + delta.z, floor: refY };
    for (const [kx, kz] of [[1, 1], [1, 0], [0, 1]]) {
      const x = p.x + delta.x * kx, z = p.z + delta.z * kz;
      const fy = floorAt(x, z, refY);
      if (fy !== null && Math.abs(fy - refY) < 1.2) return { x, y: p.y, z, floor: fy };
    }
    return { ...p, floor: refY };
  }

  // ---------- settings ----------
  const SET_KEY = 'wpm-breach-settings';
  const osCalm = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let settings = { reduceFlash: true, difficulty: 'normal' };
  const loadSettings = () => { settings = { reduceFlash: true, difficulty: 'normal', ...TT.store.get(SET_KEY, {}) }; if (!D.DIFFICULTY[settings.difficulty]) settings.difficulty = 'normal'; };
  // the difficulty of the run in progress, fixed when the run starts
  let runDiff = 'normal';
  const DF = () => D.DIFFICULTY[runDiff];
  const DIFFS = ['easy', 'normal', 'hard'];
  function setDifficulty(k) { if (!D.DIFFICULTY[k]) return; settings.difficulty = k; TT.store.set(SET_KEY, settings); S.play('select'); }
  const bestKey = id => settings.difficulty === 'normal' ? id : id + ':' + settings.difficulty;
  const calm = () => settings.reduceFlash || osCalm();
  function toggleCalm() {
    if (osCalm()) { S.play('miss'); return; }
    settings.reduceFlash = !settings.reduceFlash; TT.store.set(SET_KEY, settings); S.play('select');
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
  let foes = [], projs = [], pickups = [], rush = [], pops = [], queue = [], barriers = [], choices = [], comms = null, darkK = 0, freezeT = 0;
  let spawnT = 0, target = null, hack = null, boss = null, prompt = null;
  let hearts = 3, shield = false, score = 0, combo = 0, maxCombo = 0;
  let slowT = 0, doubleT = 0, flashT = 0, hurtT = 0, shakeT = 0, stopT = 0, glitchT = 0, banner = null;
  let stats = null, result = null, reward = null, keyFlash = 0, missT = 0, edgeFx = null, settingsRect = null;
  // Hit feedback is a short tint at the screen edges, at most about three a second.
  function edge(rgb, a = 0.45, dur = 0.45) {
    if (edgeFx && t - edgeFx.start < 0.34) return;
    edgeFx = { rgb, a: calm() ? a * 0.7 : a, start: t, dur };
  }

  function resetRun() {
    foes = []; projs = []; pickups = []; rush = []; pops = []; queue = []; barriers = []; choices = []; comms = null; darkK = 0; freezeT = 0;
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
    chIndex = i; ch = D.CHAPTERS[i]; E = null; runDiff = settings.difficulty;
    resetRun();
    level = buildLevel(ch);
    menuLevel = level;
    if (use3D) R3.setLevel(level);
    steps = [];
    ch.waves.forEach((w, k) => {
      const stop = level.stops[k];
      if (w.branch) {
        steps.push({ kind: 'branch', branch: w.branch, note: w.branch.note, stop: { s: stop.branch.choiceS, branch: stop.branch } });
        steps.push({ kind: 'wave', foes: null, lanes: w.branch, stop });
      } else if (w.chase) steps.push({ ...w, kind: 'chase', stop });
      else steps.push({ ...w, kind: w.hack ? 'hack' : 'wave', stop });
    });
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
    if (st.kind === 'wave' && !st.foes && st.lanes) {
      const lane = st.lanes[level.lane === 1 ? 'right' : 'left'];
      st.foes = lane.foes; st.pickup = lane.pickup;
    }
    if (st.kind === 'chase') {
      const c = st.stop.chase, n = st.chase.barriers, span = c.s1 - c.s0 - 14;
      barriers = [];
      for (let k = 0; k < n; k++) {
        const bs = c.s0 + 10 + span * (k + 0.5) / n, p = level.rail.at(bs);
        barriers.push({ kind: 'barrier', word: freshWord(4, 6 + Math.floor(d() / 2), 0), typed: 0, s: bs, pos: v3(p.x, p.y - EYE + 2.4, p.z), done: false, born: t });
      }
      if (st.note) { comms = { ...st.note, t: 9 }; st.noteShown = true; }
      banner = { text: 'Train behind', sub: 'Clear each barrier before you reach it.', col: C.red, t: 2 };
      cam.backT = cam.backMax = 2.2;
      S.play('warn');
    }
    if (st.kind === 'wave') {
      queue = [];
      for (const [type, n, where] of st.foes) {
        if (type === 'link') { queue.push({ chain: n, where }); continue; }
        for (let k = 0; k < n; k++) queue.push({ type, where });
      }
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
  const d = () => E ? Math.min(4, Math.floor((E.level - 1) / 3)) : chIndex;
  function usedLetters() { return new Set(liveTargets().map(x => x.word[0])); }
  function freshWord(min, max, longChance = 0.03 + d() * 0.03) {
    const df = DF();
    if (runDiff === 'easy') { max = Math.min(5, max); min = Math.max(2, Math.min(min, max - 1)); longChance = 0; }
    else if (runDiff === 'hard' && min > 1) { min += df.lenAdd; max += df.lenAdd; longChance += 0.06; }
    const used = usedLetters();
    let w;
    for (let i = 0; i < 30; i++) {
      w = E && E.daily ? seededWord(E.rng() < longChance ? 8 : min, E.rng() < longChance ? 9 + d() : max) : Math.random() < longChance ? TT.wordOfLength(8, 9 + d()) : TT.wordOfLength(min, max);
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
    for (const c of choices) out.push({ obj: c, word: c.word });
    for (const b of nextBarriers()) out.push({ obj: b, word: b.word });
    for (const f of foes) if (!f.dying && targetable(f)) out.push({ obj: f, word: f.words[f.wi] });
    for (const r of rush) out.push({ obj: r, word: r.word });
    if (boss && boss.core && !boss.dying) out.push({ obj: boss.core, word: boss.core.word });
    if (boss && boss.speakers) { const nx = boss.speakers.find(x => !x.muted); if (nx) out.push({ obj: nx, word: nx.word }); }
    for (const p of pickups) out.push({ obj: p, word: p.word });
    return out;
  }

  // Only the next two barriers of a chase show and can be typed.
  const nextBarriers = () => barriers.filter(b => !b.done).slice(0, 2);
  // Burrowers under the grid and chain links behind the head can't be targeted yet.
  function targetable(f) {
    if (f.type === 'burrower' && !f.surfaced) return false;
    if (f.chain) return f.chain.links.find(l => !l.dying) === f;
    return true;
  }

  // ---------- camera frame ----------
  const camFwd = () => level.rail.fwd(cam.s);
  const camRight = () => { const f = camFwd(); return v3(-f.z, 0, f.x); };
  const camFloor = () => cam.pos.y - EYE;

  // ---------- spawning ----------
  const BODY_Y = { drone: 1.6, runner: 1.15, glitcher: 1.25, splitter: 1.2, shard: 0.9, shielded: 1.65, shooter: 1.75, flyer: 3.2, bug: 0.55, node: 0,
    mimic: 1.5, burrower: 0.75, carrier: 2.1, reflector: 1.7, link: 1.1, cloaked: 1.5, heavy: 2.0, healer: 1.9 };
  // Is p inside the camera's view, looking along the rail at the stop?
  function inView(p, margin = 0.95) {
    const f = camFwd(), r = camRight(), rel = sub(p, cam.pos);
    const z = rel.x * f.x + rel.z * f.z, x = rel.x * r.x + rel.z * r.z;
    return z > 3 && Math.abs(x) < z * margin && rel.y / z < 0.5 && rel.y / z > -0.75;
  }
  // Spawns happen once the camera stands at the stop, on a platform and in view.
  // Corner foes step out from the far side edges of the view.
  function spawnPos(where, type) {
    const f = camFwd(), r = camRight(), floor0 = camFloor();
    for (let i = 0; i < 16; i++) {
      const k = 1 - i * 0.04, side = Math.random() < 0.5 ? -1 : 1;
      let dd, lat, lift = 0;
      if (where === 'side') { dd = rand(8.5, 11.5); lat = side * rand(3.5, 5.2); }
      else if (where === 'above') { dd = rand(10, 14); lat = rand(-4, 4); lift = 5.5; }
      else if (where === 'corner') { dd = rand(17, 22); lat = side * rand(4, 5.4); }
      else { dd = rand(16, 22); lat = rand(-4.5, 4.5); }
      const p = add(add(cam.pos, f, dd * k), r, lat * k);
      // flyers need no floor under them
      const fy = floorAt(p.x, p.z, floor0, 0.8) ?? (type === 'flyer' ? floor0 : null);
      if (fy === null) continue;
      p.y = fy + (lift || (type === 'flyer' ? 4 : BODY_Y[type]));
      if (inView(p)) return p;
    }
    // nothing fit: take the furthest platform point in view
    for (const dd of [16, 13, 11, 9, 7, 5]) for (const lat of [0, 2, -2, 4, -4]) {
      const p = add(add(cam.pos, f, dd), r, lat), fy = floorAt(p.x, p.z, floor0, 0.8);
      if (fy === null) continue;
      p.y = fy + (type === 'flyer' ? 4 : BODY_Y[type]);
      if (inView(p)) return p;
    }
    const p = add(cam.pos, f, 4); p.y = floor0 + BODY_Y[type];
    return p;
  }
  const camRightAt = s => { const f = level.rail.fwd(s); return v3(-f.z, 0, f.x); };
  function spawnFoe(type, where, pos) {
    const def = D.ENEMIES[type];
    const grow = def.len[0] < 2 ? 0 : Math.floor(d() / (def.fast ? 3 : 2));
    const lo = def.len[0] + grow, hi = def.len[1] + grow;
    const words = [];
    if (type === 'heavy') words.push(phrase(def.phrase + (d() >= 3 ? 1 : 0) - (runDiff === 'easy' ? 1 : 0)));
    else if (type === 'mimic') words.push(pickFrom(D.PICKUP_WORDS));
    else for (let i = 0; i < (def.words || 1); i++) words.push(type === 'bug' ? freeLetter() : freshWord(lo + growX(), hi + growX(), type === 'shard' ? 0 : undefined));
    const f = {
      kind: 'foe', type, def, words, wi: 0, typed: 0, pos: pos || spawnPos(where, type),
      speed: def.speed * (1 + d() * 0.05) * rand(0.9, 1.1) * speedX() * DF().speed, phase: Math.random() * 6, flash: 0, seed: Math.random() * 1000,
      dying: 0, fireT: rand(1.2, 2.2), tpT: def.teleport ? rand(0.8, def.teleport) : 0, born: t, glitch: 0.5,
    };
    f.d0 = Math.max(3, flat(f.pos, cam.pos));
    if (!boss && !inView(f.pos, 1.0)) audit.spawnOut++;
    f.floor = floorAt(f.pos.x, f.pos.z, f.pos.y - (BODY_Y[type] || 1)) ?? camFloor();
    if (wantsGlitch(type)) {
      const k = f.words.length - 1, g = glitchify(f.words[k]);
      if (g !== f.words[k]) { f.words[k] = g; f.glitchWord = true; f.glitchCap = Math.random() < 0.4; }
    }
    if (def.turn) { f.mirror = true; f.turnT = def.turn[0] * rand(0.6, 1); }
    if (def.cloak) f.cloakT = Math.random() * def.cloak;
    if (E && E.mut.cloak && !def.cloak && type !== 'node') { f.cloakT = Math.random() * 2.8; f.cloakAll = true; }
    if (def.healEvery) f.healT = def.healEvery * 0.6;
    foes.push(f);
    return f;
  }
  // A chain of links that follow each other; only the front one can be typed.
  function spawnChain(n, where) {
    const head = spawnFoe('link', where), chain = { links: [head] };
    head.chain = chain; head.order = 1;
    const away = sub(head.pos, cam.pos), al = Math.hypot(away.x, away.z) || 1;
    for (let k = 1; k < n; k++) {
      let p = add(head.pos, v3(away.x / al, 0, away.z / al), k * 1.7);
      if (floorAt(p.x, p.z, head.floor) === null) p = { ...head.pos };
      const l = spawnFoe('link', where, p); l.chain = chain; l.order = k + 1; chain.links.push(l);
    }
  }
  function phrase(n) {
    const used = usedLetters();
    let w;
    for (let i = 0; i < 12; i++) { w = (runDiff === 'easy' ? Array.from({ length: n }, () => TT.wordOfLength(2, 5)) : TT.randomWords(n, 0.1)).join(' '); if (!used.has(w[0])) break; }
    return w;
  }
  // endless mode scales word length and speed with its level
  const growX = () => E ? Math.min(3, Math.floor((E.level - 1) / 3)) : 0;
  const speedX = () => E ? (1 + (E.level - 1) * 0.06) * (E.mut.fast ? 1.3 : 1) : 1;
  // Glitch words swap one or two letters for digits or symbols, never the whole word.
  function glitchify(w) {
    const pos = [...w].map((c, i) => i).filter(i => D.GLITCH[w[i]] && (i > 0 || Math.random() < 0.2));
    if (!pos.length || w.length < 3) return w;
    TT.shuffle(pos);
    const n = w.length >= 5 && Math.random() < 0.5 ? 2 : 1;
    const a = [...w];
    for (const i of pos.slice(0, Math.min(n, w.length - 2))) a[i] = TT.pick(D.GLITCH[w[i]]);
    return a.join('');
  }
  function wantsGlitch(type) {
    if (runDiff === 'easy' || ['bug', 'node', 'heavy', 'mimic', 'shard'].includes(type)) return false;
    if (type === 'glitcher') return true;
    const df = DF(), stage = E ? Math.floor((E.level - 1) / 3) : chIndex;
    return stage >= df.glitchFrom && Math.random() < df.glitch;
  }
  function spawnPickup(kind) {
    const f = camFwd(), r = camRight(), s = Math.random() < 0.5 ? -1 : 1;
    const used = usedLetters();
    const pool = D.PICKUP_WORDS.filter(w => !used.has(w[0]));
    const word = TT.pick(pool.length ? pool : D.PICKUP_WORDS);
    let pos = add(add(cam.pos, f, 8.5), r, s * 3.6);
    if (floorAt(pos.x, pos.z, camFloor()) === null) pos = add(cam.pos, f, 8.5);
    pos.y = camFloor() + 2.1;
    pickups.push({ kind: 'pickup', pick: kind, word, typed: 0, pos, vel: add(v3(), r, -s * 0.3), life: 7.5, seed: Math.random() * 10, born: t });
    S.play('blip');
  }
  function fireAt(from, speedK = 1) {
    const letters = d() >= 3 && Math.random() < 0.35 ? 3 : d() >= 1 && Math.random() < 0.5 ? 2 : 1;
    let w = freeLetter();
    for (let i = 1; i < letters; i++) w += 'abcdefghiklmnoprstuy'[Math.floor(Math.random() * 20)];
    const p = { ...from };
    const time = (2.8 - d() * 0.12) / speedK * DF().timer;
    projs.push({ kind: 'proj', word: w, typed: 0, pos: p, speed: Math.max(4, dist(p, cam.pos) / time), seed: Math.random() * 6, flash: 0, born: t, d0: dist(p, cam.pos) });
  }

  // ---------- boss ----------
  const CORE_Y = { spam: 5.4, sign: 6.2, announcer: 6.6, press: 5.8, correction: 6.1 };
  function startBoss() {
    const def = ch.boss, a = steps[stepI].stop.arena;
    const f = v3(DIRS[a.dir][0], 0, DIRS[a.dir][1]), r = v3(-f.z, 0, f.x);
    const home = add(v3(a.x, a.y, a.z), f, 11.5);
    boss = {
      def, art: def.art, name: def.name, hp: def.hp, maxHp: def.hp, f, r, home,
      pos: add(home, f, 2.5), goal: { ...home }, arena: a, state: 'intro', st: 0, introT: 2.6, loopI: 0,
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
    boss.core = null; prompt = null; boss.spell = null; boss.speakers = null;
    if (target && ['core', 'counter', 'finale', 'fix', 'speaker'].includes(target.kind)) target = null;
    const def = boss.def;
    if (s === 'core') { newCore(); bossMove(); boss.timerMax = boss.timer = Math.max(3.2, 5 - d() * 0.35); }
    if (s === 'windup') {
      const word = pickFrom(def.counters.filter(w => w !== boss.lastCounter));
      boss.lastCounter = word;
      const per = def.fastWindup ? 0.26 : 0.34;
      boss.timerMax = boss.timer = ((def.fastWindup ? 1.3 : 1.9) + word.length * per * (1 - d() * 0.03)) * DF().timer;
      prompt = { kind: 'counter', word, typed: 0 };
      banner = { text: 'Attack', sub: 'Type the word to block it.', col: C.red, t: 1.4 };
      S.play('warn');
    }
    // The Spam's own move: it throws free gifts that are mimics. Breaking all of them stuns it.
    if (s === 'gifts') {
      boss.gifts = [];
      for (let k = 0; k < 3; k++) {
        const p = onArena(add(add(boss.pos, boss.r, (k - 1) * 3.5), boss.f, -3), 2); p.y = boss.home.y + BODY_Y.mimic;
        const g = spawnFoe('mimic', 'ahead', p); g.speed *= 0.9; g.revealAt = 4.5; boss.gifts.push(g);
      }
      boss.giftHit = hurtLog.length;
      banner = { text: 'Free gifts', sub: 'None of them are power-ups.', col: C.red, t: 1.6 };
      S.play('warn');
    }
    // The Signboard's own move: its sign shows a misspelled word to type spelled right.
    if (s === 'fixsign') {
      const [shown, answer] = TT.pick(D.SIGNS);
      prompt = { kind: 'fix', word: answer, shown, typed: 0 };
      boss.signText = shown;
      boss.timerMax = boss.timer = (3 + answer.length * 0.5) * DF().timer;
      banner = { text: 'Fix the sign', sub: 'Type it spelled right.', col: C.gold, t: 1.6 };
      S.play('warn');
    }
    // The Announcer's own move: six speakers to mute in order around its ring.
    if (s === 'speakers') {
      boss.speakers = [];
      for (let k = 0; k < 6; k++) boss.speakers.push({ kind: 'speaker', order: k + 1, idx: k, word: freshWord(2, 3, 0), typed: 0, muted: false, pos: corePos() });
      boss.timerMax = boss.timer = 13 * DF().timer; boss.warned = false;
      banner = { text: 'Mute the speakers', sub: 'In order, one to six.', col: C.cyan, t: 1.6 };
      S.play('warn');
    }
    if (s === 'stun') {
      boss.timerMax = boss.timer = boss.overheat ? 7 : 4.6; rush = []; boss.rushT = 0.15;
      banner = { text: 'Stunned', sub: 'Every word you type now hits.', col: C.green, t: 1.3 };
      S.play('stun');
    }
    if (s === 'barrage') { boss.fired = 0; boss.fireT = 0.7; banner = { text: 'Incoming', sub: 'Shoot the packets down.', col: C.red, t: 1.2 }; }
    if (s === 'summon') {
      bossMove();
      for (const [type, n] of def.summon) for (let k = 0; k < n; k++) {
        const p = onArena(add(add(boss.pos, boss.r, rand(-4, 4)), boss.f, -rand(2, 4)), 2); p.y = boss.home.y + BODY_Y[type] + (type === 'flyer' ? 1 : 0);
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
      boss.timerMax = boss.timer = (10 - d() * 0.4) * DF().timer;
      S.play('warn');
    }
    if (s === 'finale') {
      prompt = { kind: 'finale', word: def.finale.text, typed: 0 };
      boss.timerMax = boss.timer = (4 + def.finale.text.length * 0.3) * DF().timer;
      banner = { text: 'Rollback', sub: 'Type the command.', col: C.green, t: 1.6 };
      S.play('warn');
    }
  }
  function newCore() {
    const lo = 4 + Math.floor(d() / 2);
    boss.core = { kind: 'core', word: freshWord(lo, lo + 3, 0), typed: 0 };
  }
  // Keeps a point on the boss arena, margin metres inside its edge.
  function onArena(p, margin = 1.2) {
    const a = boss.arena, dx = p.x - a.x, dz = p.z - a.z, l = Math.hypot(dx, dz), max = a.r - margin;
    return l <= max ? p : v3(a.x + dx / l * max, p.y, a.z + dz / l * max);
  }
  function bossMove() {
    const b = boss;
    const spots = [[-5.5, 0, 0], [0, 1, -2], [5.5, 0, 0], [-3, 2, 1.5], [3, 0.5, 1], [0, 0, 2.5]];
    if (b.def.teleport) {
      const sp = TT.pick(spots);
      const to = onArena(add(add(b.home, b.r, sp[0]), b.f, sp[2]), 2.5); to.y += sp[1];
      b.pos = { ...to }; b.goal = to; b.glitch = 0.5; glitchT = Math.max(glitchT, 0.25); S.play('glitch');
    } else {
      b.wayI = (b.wayI + 1 + Math.floor(Math.random() * 2)) % spots.length;
      const sp = spots[b.wayI];
      b.goal = onArena(add(add(b.home, b.r, sp[0]), b.f, sp[2]), 2.5); b.goal.y += b.art === 'sign' ? 0 : sp[1];
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
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'boss-down' }));
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
    goal = onArena(goal, 2.5);
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
      if (prompt && !prompt.warn && b.timer <= b.timerMax * 0.4) warnOf(prompt);
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
    } else if (b.state === 'gifts') {
      if (!b.gifts.some(g => !g.dying && foes.includes(g))) {
        if (hurtLog.length === b.giftHit) bossState('stun'); else nextBossAction();
      }
    } else if (b.state === 'fixsign') {
      b.timer -= dt * sp;
      if (prompt && !prompt.warn && b.timer <= b.timerMax * 0.4) warnOf(prompt);
      if (b.timer <= 0) { prompt = null; if (target && target.kind === 'fix') target = null; hurt('sign'); if (mode !== 'play') return; nextBossAction(); }
    } else if (b.state === 'speakers') {
      b.timer -= dt * sp;
      b.speakers.forEach(x => {
        const a = x.idx / 6 * Math.PI * 2 + t * 0.25, rr = 3.6;
        x.pos = add(add(add(corePos(), b.r, Math.cos(a) * rr), v3(0, Math.sin(a) * rr * 0.8, 0)), b.f, -2.5);
      });
      if (!b.warned && b.timer <= b.timerMax * 0.4) { b.warned = true; warnOf(b.speakers.find(x => !x.muted) || b); }
      if (b.timer <= 0) { b.speakers = null; if (target && target.kind === 'speaker') target = null; S.play('roar'); hurt('speakers'); if (mode !== 'play') return; nextBossAction(); }
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
        b.timerMax = b.timer = (4 + prompt.word.length * 0.3) * DF().timer;
      }
    }
  }

  // ---------- scoring and effects ----------
  const mult = () => Math.min(3, 1 + Math.floor(combo / 10) * 0.5) * (doubleT > 0 ? 2 : 1) * (E ? endlessMult() : 1) * DF().mult;
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
    addScore(f.def.score * Math.max(1, f.words.join('').length / 4) * (f.glitchWord ? 1.5 : 1), anchor(f));
    if (E) endlessKill();
    if (f.def.spawns) {
      for (let k = 0; k < f.def.spawns; k++) {
        let p = add(f.pos, camRight(), (k - 1) * 1.4);
        if (floorAt(p.x, p.z, f.floor ?? camFloor()) === null || !inView(p)) p = { ...f.pos };
        p.y = (f.floor ?? camFloor()) + BODY_Y.bug;
        const b = spawnFoe('bug', 'ahead', p); b.glitch = 0.4;
      }
    }
    S.play('kill'); stopT = 0.04; shakeT = Math.max(shakeT, 0.08);
    if (f.def.split) {
      const r = camRight(), away = sub(f.pos, cam.pos), al = Math.hypot(away.x, away.z) || 1;
      for (let k = 0; k < f.def.split; k++) {
        let p = add(add(f.pos, r, k ? 1.6 : -1.6), v3(away.x / al, 0, away.z / al), 2);
        const ok = q => floorAt(q.x, q.z, f.floor ?? camFloor(), 0.5) !== null && inView(q);
        if (!ok(p)) p = add(f.pos, r, k ? 0.6 : -0.6);
        if (!ok(p)) p = add(f.pos, v3(0, 0, 0), 0);
        const s = spawnFoe('shard', 'ahead', p); s.glitch = 0.4;
      }
    }
  }
  // A threat close to hitting: its tag turns red and pulses, and one beep plays.
  let beepT = 0;
  function warnOf(o) {
    o.warn = t;
    if (t - beepT > 0.3) { beepT = t; S.play('danger'); }
  }
  const hurtLog = [];
  const audit = { off: 0, despawned: 0, bossOff: 0, spawnOut: 0, offs: [] };
  function hurt(cause) {
    hurtLog.push({ t: +t.toFixed(2), cause, step: stepI, shield });
    if (shield) { shield = false; S.play('block'); edge('62,230,255', 0.35); glitchT = 0.2; return; }
    if (!hook.invincible) hearts--;
    combo = 0; stats.hits++;
    hurtT = 0.6; shakeT = 0.5; glitchT = 0.5; edge('130,22,34', 0.55, 0.5);
    S.play('hurt');
    if (hearts <= 0) gameOver();
    else if (E) endlessReset();
  }
  function gameOver() {
    if (E) { endlessOver(); return; }
    mode = 'over'; S.music(''); target = null;
    reward = record(false);
  }

  // ---------- endless mode ----------
  // Endless waves of every enemy type with no story. Clean kills raise the level,
  // which makes spawns faster, typos quicker, words longer and the score multiplier
  // higher. A hit clears the screen and drops the level back to 1.
  const END_KEY = 'wpm-breach-endless', DAILY_KEY = 'wpm-breach-daily', MUT_KEY = 'wpm-breach-mutators';
  let E = null, endMenu = { daily: false }, mutOn = {}, titleSel = 0, menuRects = [];
  const todayKey = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
  function hashStr(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let q = Math.imul(a ^ a >>> 15, 1 | a); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; }
  const wordCache = {};
  function seededWord(min, max) {
    const key = min + '-' + max;
    if (!wordCache[key]) {
      const src = window.WORDS ? [...window.WORDS.common, ...window.WORDS.long] : [];
      wordCache[key] = [...new Set(src)].filter(w => /^[a-z]+$/.test(w) && w.length >= min && w.length <= max).sort();
      if (!wordCache[key].length) wordCache[key] = [TT.wordOfLength(min, max)];
    }
    const list = wordCache[key];
    return list[Math.floor(E.rng() * list.length)];
  }
  // Every row carries its difficulty. Asked for a difficulty, these return only that table.
  const endlessAll = () => TT.store.get(END_KEY, []).map(r => ({ difficulty: 'normal', ...r }));
  const endlessScores = diff => { const l = endlessAll(); return diff ? l.filter(r => r.difficulty === diff).slice(0, 10) : l; };
  const dailyAll = () => TT.store.get(DAILY_KEY, {});
  const dailyScores = diff => {
    const all = dailyAll();
    if (!diff) return all;
    const out = {};
    for (const [k, v] of Object.entries(all)) { const [date, df = 'normal'] = k.split(':'); if (df === diff) out[date] = { ...v, date }; }
    return out;
  };
  const bestEndless = () => { const l = endlessScores(settings.difficulty); return l.length ? l[0].score : 0; };
  const mutUnlocked = m => bestEndless() >= m.unlock;
  const endlessMult = () => (1 + (E.level - 1) * 0.25) * E.mult;
  function goEndlessMenu(daily) {
    mode = 'endless-menu'; endMenu = { daily }; E = null;
    mutOn = TT.store.get(MUT_KEY, {});
    menuScene(daily ? hashStr('breach-' + todayKey()) % 5 : 4);
    S.music('menu');
  }
  function toggleMut(i) {
    const m = D.ENDLESS.mutators[i];
    if (!m || endMenu.daily) return;
    if (!mutUnlocked(m)) { S.play('miss'); return; }
    mutOn[m.id] = !mutOn[m.id]; TT.store.set(MUT_KEY, mutOn); S.play('select');
  }
  function startEndless(daily) {
    const seed = hashStr('breach-' + todayKey());
    runDiff = settings.difficulty;
    chIndex = daily ? seed % 5 : Math.floor(Math.random() * 5);
    const base = D.CHAPTERS[chIndex];
    ch = { id: 'endless', title: daily ? 'Daily run' : 'Endless', place: '', theme: base.theme, music: base.music, color: base.color, color2: base.color2, waves: [], bossPath: 'A' };
    resetRun();
    level = buildLevel(ch); menuLevel = level;
    if (use3D) R3.setLevel(level);
    steps = [{ kind: 'endless', stop: level.stops[0] }];
    stepI = 0; stepT = 0;
    cam = { s: 0, v: 0, pos: level.rail.at(0), look: v3(0, EYE, -10), lat: 0, yawBias: 0 };
    const mut = {};
    let m = 1;
    if (!daily) for (const x of D.ENDLESS.mutators) if (mutOn[x.id] && mutUnlocked(x)) { mut[x.id] = true; m *= x.mult; }
    E = { daily, rng: daily ? mulberry(seed) : Math.random, level: 1, maxLevel: 1, streak: 0, longest: 0, kills: 0,
      spawnT: 1.2, pickT: 16, grace: 0, mut, mult: m, milestone: 1000, best: daily ? ((dailyScores(runDiff)[todayKey()] || {}).score || 0) : bestEndless() };
    hearts = mut.onelife ? 1 : 3;
    mode = 'play'; paused = false;
    S.music(ch.music); enterStep();
  }
  function endlessPick() {
    const pool = D.ENDLESS.pool.filter(p => p[1] <= E.level);
    let sum = pool.reduce((a, p) => a + p[2], 0), r = E.rng() * sum;
    for (const p of pool) { r -= p[2]; if (r <= 0) return p[0]; }
    return 'drone';
  }
  function endlessUpdate(dt) {
    if (E.grace > 0) { E.grace -= dt; return; }
    const alive = foes.filter(f => !f.dying).length;
    if (freezeT <= 0) E.spawnT -= dt;
    if (E.spawnT <= 0 && alive < 3 + Math.floor(E.level / 2)) {
      const type = endlessPick(), wr = E.rng();
      const where = type === 'flyer' ? 'above' : wr < 0.45 ? 'ahead' : wr < 0.75 ? 'side' : 'corner';
      if (type === 'link') spawnChain(3 + (E.level >= 12 ? 1 : 0), where);
      else if (type === 'bug') {
        const c = spawnPos(where, 'bug'), n = 3 + Math.floor(E.rng() * 3);
        for (let k = 0; k < n; k++) { let p = add(c, camRight(), (k - n / 2) * 1.1); if (floorAt(p.x, p.z, camFloor()) === null || !inView(p)) p = { ...c }; spawnFoe('bug', where, p); }
      } else spawnFoe(type, where);
      E.spawnT = Math.max(0.45, 1.7 - 0.09 * (E.level - 1)) * (0.75 + E.rng() * 0.5);
    }
    E.pickT -= dt;
    if (E.pickT <= 0 && alive <= 3 && !pickups.length) {
      let list = D.ENDLESS.pickups.filter(k => k !== 'health' || hearts < 3);
      spawnPickup(list[Math.floor(E.rng() * list.length)]);
      E.pickT = 18 + E.rng() * 10;
    }
    while (score >= E.milestone) {
      banner = { text: `${E.milestone.toLocaleString('en-US')} points`, sub: '', col: C.gold, t: 1.6 };
      S.play('phase'); E.milestone += 1000;
    }
  }
  function endlessKill() {
    E.kills++; E.streak++; E.longest = Math.max(E.longest, E.streak);
    if (E.streak % D.ENDLESS.killsPerLevel === 0) {
      E.level++; E.maxLevel = Math.max(E.maxLevel, E.level);
      banner = { text: `Level ${E.level}`, sub: `Score x${endlessMult().toFixed(2)}`, col: C.green, t: 1.4 };
      S.play('phase');
    }
  }
  function endlessReset() {
    foes.forEach(f => { if (!f.dying) kill(f, true); });
    projs = []; target = null;
    E.level = 1; E.streak = 0; E.grace = 1.6;
    banner = { text: 'Level reset', sub: `${hearts} ${hearts === 1 ? 'life' : 'lives'} left`, col: C.red, t: 1.6 };
  }
  function endlessOver() {
    mode = 'endless-over'; S.music(''); target = null;
    const { wpm, acc } = runStats();
    const modeKey = E.daily ? 'breach-daily' : 'breach-endless';
    reward = null;
    if (window.WPM && stats.keys) {
      try {
        reward = WPM.record({ mode: modeKey, difficulty: runDiff, wpm, acc, correct: stats.chars, keys: stats.keys, ms: Math.round(stats.ms), score });
        WPM.track('breach_endless', { score, level: E.maxLevel, daily: !!E.daily, difficulty: runDiff });
        WPM.track('combo', { n: maxCombo, mode: 'breach' });
      } catch (e) { console.error(e); }
    }
    const entry = { date: todayKey(), score, level: E.maxLevel, streak: E.longest, wpm, acc, difficulty: runDiff };
    let newBest = false;
    if (E.daily) {
      const all = dailyAll(), key = runDiff === 'normal' ? entry.date : entry.date + ':' + runDiff, prev = all[key];
      if (!prev || score > prev.score) { all[key] = entry; newBest = true; TT.store.set(DAILY_KEY, all); }
    } else {
      const list = endlessAll(), mine = list.filter(r => r.difficulty === runDiff);
      newBest = !mine.length || score > mine[0].score;
      list.push(entry); list.sort((a, b) => b.score - a.score);
      // keep the top 10 of each difficulty
      const keep = [];
      for (const dk of DIFFS) keep.push(...list.filter(r => r.difficulty === dk).slice(0, 10));
      TT.store.set(END_KEY, keep.sort((a, b) => b.score - a.score));
    }
    result = { ...entry, newBest, daily: E.daily };
  }
  function usePickup(pk) {
    S.play('pickup');
    banner = { text: D.PICKUPS[pk.pick].label, sub: D.PICKUPS[pk.pick].text, col: C.cyan, t: 1.4 };
    if (use3D) R3.ring(pk.pos, C.cyan);
    if (pk.pick === 'health') hearts = Math.min(E ? 3 : 5, hearts + 1);
    if (pk.pick === 'freeze') { freezeT = 4; S.play('power'); }
    if (pk.pick === 'shield') shield = true;
    if (pk.pick === 'debounce') { slowT = 8; S.play('power'); }
    if (pk.pick === 'double') { doubleT = 10; S.play('power'); }
    if (pk.pick === 'macro') {
      S.play('bomb'); edge('62,230,255', 0.4, 0.6); shakeT = 0.5; glitchT = 0.4;
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
    if ((mode === 'title' || (mode === 'play' && paused)) && c.toLowerCase() === 'f') { toggleCalm(); return; }
    if ((mode === 'title' || mode === 'select' || mode === 'endless-menu') && c.toLowerCase() === 'd') { setDifficulty(DIFFS[(DIFFS.indexOf(settings.difficulty) + 1) % 3]); return; }
    if (mode === 'endless-menu' && /[1-3]/.test(c)) { toggleMut(+c - 1); return; }
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
      const order = { counter: 0, finale: 0, fix: 0, speaker: 1, barrier: 1, proj: 1, hack: 2, choice: 2, foe: 3, rush: 4, core: 5, pickup: 6 };
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
    if (o.kind === 'choice') {
      level.lane = o.side; level.rail = level.rails[o.side];
      if (use3D) R3.burst(o.pos, o.word, C.green, 0.6);
      choices = []; S.play('access');
      steps[stepI].picked = true; nextStep();
      return;
    }
    if (o.kind === 'barrier') {
      o.done = true;
      if (use3D) R3.burst(o.pos, o.word, '#ff4d5e', 0.9);
      addScore(40, o.pos); S.play('throwHit');
      return;
    }
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
      // The Press's own move: three repels in a row overheat it for a long stun.
      if (boss.def.heat) {
        boss.heat = (boss.heat || 0) + 1;
        if (boss.heat >= boss.def.heat) { boss.heat = 0; boss.overheat = true; banner = { text: 'Overheated', sub: 'The stun lasts longer.', col: C.gold, t: 1.6 }; }
      }
      bossState('stun');
      boss.overheat = false;
      return;
    }
    if (o.kind === 'fix') {
      prompt = null; S.play('access');
      damageBoss(boss.maxHp * 0.08);
      bossState('stun');
      return;
    }
    if (o.kind === 'speaker') {
      o.muted = true; S.play('throwHit');
      if (use3D) R3.burst(o.pos, o.word, C.cyan, 0.5);
      damageBoss(boss.maxHp * 0.015, o.pos);
      if (boss.speakers.every(x => x.muted)) { boss.overheat = true; bossState('stun'); boss.overheat = false; }
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
  function miss() { combo = 0; S.play('miss'); missT = 0.18; }
  function onBack() {
    if (target) { target.typed = 0; target = null; }
    else if (boss && boss.spell) boss.spell.typed = '';
  }

  // ---------- update ----------
  function update(dt) {
    t += dt;
    keyFlash = Math.max(0, keyFlash - dt); missT = Math.max(0, missT - dt);
    shakeT = Math.max(0, shakeT - dt); hurtT = Math.max(0, hurtT - dt); flashT = Math.max(0, flashT - dt); glitchT = Math.max(0, glitchT - dt);
    for (const p of pops) p.t -= dt;
    pops = pops.filter(p => p.t > 0);
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    if (comms && mode === 'play' && !paused) { comms.t -= dt; if (comms.t <= 0) comms = null; }
    if (story) story.shown += dt * 60;
    if (mode !== 'play' || paused) return;
    if (stopT > 0) { stopT -= dt; return; }
    stats.ms += dt * 1000;
    slowT = Math.max(0, slowT - dt); doubleT = Math.max(0, doubleT - dt);
    freezeT = Math.max(0, freezeT - dt);
    const sp = freezeT > 0 ? 0 : slowT > 0 ? 0.45 : 1;
    const st = steps[stepI];
    stepT += dt;

    // camera on the rail
    if (st) {
      const goal = st.stop.s, left = goal - cam.s;
      const vmax = st.kind === 'chase' ? (3.1 + d() * 0.15) / DF().timer : Math.min(9, Math.sqrt(Math.max(0, left) * 2 * 9) + 0.5);
      cam.v = left > 0.02 ? Math.min(vmax, cam.v + dt * 14) : 0;
      if (freezeT > 0 && st.kind === 'chase') cam.v = 0;
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
    if (cam.v < 1 || flat(ahead, cam.pos) < 3) look = add(add(cam.pos, f, 10), v3(0, flat(ahead, cam.pos) < 3 ? -1.2 : -0.35, 0));
    if (boss) look = lerpV(look, add(corePos(), v3(0, -1, 0)), 0.75);
    else if (target && target.pos) look = lerpV(look, target.pos, 0.12);
    // a short look over the shoulder at a falling bridge or the train
    if (cam.backT > 0) {
      cam.backT -= dt;
      const k = Math.sin(Math.PI * clamp(1 - cam.backT / cam.backMax, 0, 1));
      look = lerpV(look, add(add(cam.pos, f, -12), v3(0, -1.6, 0)), Math.min(1, k * 1.4));
    }
    cam.look = cam.look ? lerpV(cam.look, look, 1 - Math.pow(0.03, dt)) : look;

    if (st && st.kind === 'wave') {
      if (st.arrived) spawnT -= dt;
      if (queue.length && spawnT <= 0 && st.arrived) {
        const q = queue.shift();
        if (q.swarm) {
          const c = spawnPos(q.swarm[0].where, 'bug');
          q.swarm.forEach((b, k) => { let p = add(c, camRight(), (k - q.swarm.length / 2) * 1.1); if (floorAt(p.x, p.z, camFloor()) === null || !inView(p)) p = { ...c }; const f2 = spawnFoe('bug', b.where, p); f2.pos.y += rand(-0.1, 0.4); });
        } else if (q.chain) spawnChain(q.chain, q.where);
        else spawnFoe(q.type, q.where);
        spawnT = Math.max(0.85, 1.6 - d() * 0.13) * rand(0.7, 1.2);
      }
      const alive = foes.filter(x => !x.dying).length;
      if (st.pickupLeft && stepT > 2 && alive <= 2 && !prompt) { spawnPickup(st.pickupLeft); st.pickupLeft = null; }
      // the camera moves on only once every foe of the wave is gone
      const allowed = 0;
      if (!queue.length && st.arrived && alive + projs.length <= allowed && !st.pickupLeft && !pickups.some(p => p.life > 5) && !hook.hold) nextStep();
      else if (!queue.length && st.arrived && alive + projs.length <= allowed && st.pickupLeft && stepT > 4) { spawnPickup(st.pickupLeft); st.pickupLeft = null; }
    }
    if (st && st.kind === 'hack') {
      if (st.arrived && !hack && !foes.some(x => !x.dying) && !projs.length) {
        const word = pickFrom(D.PASSWORDS);
        const tMax = (2.2 + word.length * (0.42 - d() * 0.03)) * DF().timer;
        hack = { kind: 'hack', word, typed: 0, live: true, gate: st.stop.gate, timer: tMax, timerMax: tMax, pos: add(v3(st.stop.gate.x, st.stop.gate.y + 2.2, st.stop.gate.z), v3(), 0) };
        st.stop.gate.state = 'closing';
        banner = { text: 'Door closing', sub: 'Type the password.', col: C.red, t: 1.2 };
        S.play('warn');
        if (d() >= 2) for (let k = 0; k < 1 + Math.floor(d() / 2); k++) spawnFoe('bug', 'side');
      }
      if (hack && hack.live) {
        hack.timer -= dt * sp;
        if (!hack.warn && hack.timer <= hack.timerMax * 0.4) warnOf(hack);
        hack.gate.open = 0.15 + clamp(hack.timer / hack.timerMax, 0, 1) * 0.6;
        if (hack.timer <= 0) {
          hack.live = false; if (target === hack) target = null;
          hack.gate.state = 'forced'; hack.gate.open = 0;
          S.play('door'); hurt('door'); if (mode !== 'play') return;
          banner = { text: 'Locked out', sub: '', col: C.red, t: 1.4 };
          hack.forceT = 1.4;
        }
      }
      const clear = !foes.some(x => !x.dying) && !projs.length;
      if (hack && hack.ok && clear) nextStep();
      else if (hack && !hack.live && !hack.ok) { hack.forceT -= dt; if (hack.forceT <= 0) { hack.gate.state = 'opening'; if (clear) { hack.ok = true; nextStep(); } } }
    }
    if (hack && !hack.live && (!st || st.kind !== 'hack')) {
      hack.gate.open = Math.min(1, hack.gate.open + dt * 2.5);
      if (hack.gate.open >= 1) hack = null;
    }
    // messages and set pieces that start when the camera reaches a stop
    if (st && st.arrived && st.note && !st.noteShown) { st.noteShown = true; comms = { ...st.note, t: 9 }; S.play('blip'); }
    if (st && st.arrived && st.stop.bridge && !st.stop.bridge.fallen) { st.stop.bridge.fallen = true; S.play('shieldBreak'); shakeT = Math.max(shakeT, 0.3); cam.backT = cam.backMax = 2.2; spawnT = Math.max(spawnT, 2.2); }
    darkK = lerp(darkK, st && st.stop.dark && st.kind === 'wave' ? 1 : 0, 1 - Math.pow(0.3, dt));
    if (st && st.stop.dark && st.arrived && !st.darkShown) { st.darkShown = true; banner = { text: 'Lights out', sub: 'Your shots light the floor.', col: C.green, t: 1.8 }; }
    if (st && st.kind === 'branch' && st.arrived && !choices.length && !st.picked) {
      const br = st.stop.branch;
      choices = [st.branch.left, st.branch.right].map((lane, i) => {
        const p = level.rails[i].at(br.choiceS + 10);
        return { kind: 'choice', word: lane.word, label: lane.label, side: i, typed: 0, pos: v3(p.x, p.y + 0.6, p.z) };
      });
      banner = { text: 'Pick a lane', sub: `Type ${st.branch.left.word} or ${st.branch.right.word}.`, col: C.green, t: 2.2 };
    }
    if (st && st.kind === 'chase') {
      for (const b of barriers) {
        if (b.done) continue;
        if (!b.warn && b.s - cam.s < 7) warnOf(b);
        if (cam.s >= b.s - 1.4) {
          b.done = true; if (target === b) target = null;
          if (use3D) R3.burst(b.pos, b.word, '#ff4d5e', 0.9);
          S.play('door'); hurt('barrier'); if (mode !== 'play') return;
        }
      }
      if (st.arrived) { barriers = []; nextStep(); }
    }
    if (st && st.kind === 'boss' && st.arrived && !boss) startBoss();
    if (st && st.kind === 'endless' && st.arrived && E) endlessUpdate(dt);

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
      // anything behind the camera or far outside the view leaves without a hit
      {
        const f = camFwd(), r = camRight(), rel = sub(fo.pos, cam.pos);
        const lz = rel.x * f.x + rel.z * f.z, lx = rel.x * r.x + rel.z * r.z;
        if (fd >= 1.6 && (lz < 0.3 || Math.abs(lx) > lz * 1.3 + 1)) {
          fo.out = (fo.out || 0) + dt;
          if (fo.out > 0.4) { fo.dying = 0.01; fo.silent = true; audit.despawned++; if (target === fo) target = null; continue; }
        } else fo.out = 0;
      }
      if (def.teleport) {
        fo.tpT -= dt * sp;
        if (fo.tpT <= 0 && fd > 4) {
          const side = v3(-dir.z, 0, dir.x), k = (Math.random() < 0.5 ? -1 : 1) * rand(2.5, 4);
          for (const kk of [k, -k]) {
            const to = add(fo.pos, side, kk), fy = floorAt(to.x, to.z, fo.floor ?? camFloor());
            if (fy !== null && inView(to, 0.9)) { fo.pos = to; break; }
          }
          fo.tpT = def.teleport * rand(0.8, 1.2); fo.glitch = 0.3;
          if (Math.random() < 0.5) S.play('glitch');
        }
      }
      let moveK = 1;
      // new behaviours
      if (def.reveal && !fo.revealed && fd <= (fo.revealAt || def.reveal)) {
        fo.revealed = true; fo.glitch = 0.5; fo.speed = def.revealSpeed * speedX(); fo.d0 = fd; fo.warn = 0;
        S.play('glitch');
      }
      if (def.surface && !fo.surfaced && fd <= def.surface) {
        fo.surfaced = true; fo.glitch = 0.5; fo.speed = def.surfaceSpeed * speedX(); fo.d0 = fd;
        if (use3D) R3.burst(fo.pos, 'xx', '#ff4d5e', 0.5); S.play('glitch');
      }
      if (def.turn) { fo.turnT -= dt; if (fo.turnT <= 0) { fo.mirror = !fo.mirror; fo.turnT = def.turn[fo.mirror ? 0 : 1]; } }
      if (fo.cloakT !== undefined) fo.cloakT += dt * (sp || 0.2);
      if (def.healEvery && fd <= def.stopAt + 0.5) {
        fo.healT -= dt * sp;
        if (fo.healT <= 0) {
          fo.healT = def.healEvery;
          const c = foes.find(o => !o.dying && o !== fo && o !== target && !['healer', 'node', 'bug', 'shard', 'link', 'heavy', 'mimic'].includes(o.type)
            && o.words.length - o.wi === 1 && flat(o.pos, fo.pos) < 16 && (o.type !== 'burrower' || o.surfaced));
          if (c) { c.words.splice(c.wi, 0, freshWord(3, 5, 0)); c.typed = 0; fo.beam = { to: c, t: 0.8 }; S.play('power'); }
        }
      }
      if (fo.beam) { fo.beam.t -= dt; if (fo.beam.t <= 0 || fo.beam.to.dying) fo.beam = null; }
      if (def.stopAt && fd <= def.stopAt) {
        moveK = 0;
        if (def.fireEvery) {
          fo.fireT -= dt * sp;
          fo.windup = clamp(1 - fo.fireT / 0.6, 0, 1);
          if (fo.fireT <= 0) { fireAt(add(fo.pos, v3(0, 0.4, 0))); fo.fireT = def.fireEvery - d() * 0.2; fo.windup = 0; }
        }
      }
      let delta = v3(dir.x * Math.min(fd, fo.speed * dt * sp * moveK), 0, dir.z * Math.min(fd, fo.speed * dt * sp * moveK));
      // links behind the head follow the link in front of them
      if (fo.chain && fo.chain.links[0] !== fo) {
        const i = fo.chain.links.indexOf(fo);
        const lead = fo.chain.links.slice(0, i).reverse().find(l => !l.dying);
        if (lead) {
          const want = add(lead.pos, v3(-dir.x, 0, -dir.z), 1.7), to = sub(want, fo.pos), tl = Math.hypot(to.x, to.z);
          const step = Math.min(tl, lead.speed * 1.6 * dt * sp);
          delta = tl > 0.05 ? v3(to.x / tl * step, 0, to.z / tl * step) : v3();
        }
      }
      if (fo.type === 'runner' || fo.type === 'bug') { const w = Math.sin(fo.phase * 0.35 + fo.seed) * dt * 1.2; delta = add(delta, v3(-dir.z, 0, dir.x), w); }
      const ref = fo.floor ?? camFloorY;
      const moved = walk(fo.pos, delta, ref);
      fo.pos.x = moved.x; fo.pos.z = moved.z; fo.floor = moved.floor;
      // height: walkers follow the platform and flyers swoop down as they close in
      let wantY = fo.floor + (fo.type === 'burrower' && !fo.surfaced ? -0.9 : BODY_Y[fo.type]);
      if (fo.type === 'flyer') wantY = fo.floor + 1.4 + clamp((fd - 3) / 8, 0, 1) * 2.6 + Math.sin(fo.phase * 0.5) * 0.3;
      fo.pos.y = lerp(fo.pos.y, wantY, 1 - Math.pow(0.25, dt));
      // close-in warning from the last 40% of the way
      if (!def.stopAt && !fo.warn && targetable(fo) && fd - HIT_D <= 0.4 * (fo.d0 - HIT_D)) warnOf(fo);
      // a typo hits at arm's length, so its body never fills the screen or covers the input line
      if (fd < HIT_D) {
        fo.dying = 0.01; if (target === fo) target = null;
        hurt('foe ' + fo.type); if (mode !== 'play') return;
      }
    }
    // audit counters for test bots
    for (const fo of foes) {
      if (fo.dying || fo.type === 'node') continue;
      if (fo.type !== 'flyer' && floorAt(fo.pos.x, fo.pos.z, fo.floor ?? camFloorY) === null) { audit.off++; if (!fo.logged && audit.offs.length < 12) { fo.logged = 1; audit.offs.push({ type: fo.type, step: stepI, age: +(t - fo.born).toFixed(2), pos: [fo.pos.x, fo.pos.y, fo.pos.z].map(v => +v.toFixed(1)), cam: [cam.pos.x, cam.pos.z].map(v => +v.toFixed(1)), floor: fo.floor }); } }
      if (fo.silent) audit.despawned++;
    }
    if (boss && !boss.dying) { const a = boss.arena; if (Math.hypot(boss.pos.x - a.x, boss.pos.z - a.z) > a.r) audit.bossOff++; }
    foes = foes.filter(x => !x.dying || x.dying > 0);
    if (boss) boss.nodes = boss.nodes.filter(n => foes.includes(n));
    // shots coming in
    for (const p of projs) {
      const to = sub(add(cam.pos, v3(0, -0.3, 0)), p.pos), l = Math.hypot(to.x, to.y, to.z) || 1;
      const step = Math.min(l, p.speed * dt * sp);  // sp is 0 while frozen
      p.pos = add(p.pos, to, step / l);
      p.flash = Math.max(0, p.flash - dt);
      if (!p.warn && l <= 0.4 * p.d0) warnOf(p);
      { const f = camFwd(), rel = sub(p.pos, cam.pos); if (rel.x * f.x + rel.z * f.z < -0.5) { p.dead = true; if (target === p) target = null; continue; } }
      if (l - step < 1.0) { p.dead = true; if (target === p) target = null; hurt('packet'); if (mode !== 'play') return; }
    }
    projs = projs.filter(p => !p.dead);
    // power-ups drift and fade
    for (const p of pickups) {
      p.life -= dt;
      const to = add(p.pos, p.vel, dt), fy = floorAt(to.x, to.z, camFloor());
      if (fy !== null && inView(to)) p.pos = to; else p.vel = v3(-p.vel.x, 0, -p.vel.z);
      if (!inView(p.pos, 1.2)) p.life = Math.min(p.life, 0);
      if (p.life <= 0 && target === p) target = null;
    }
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
      const r = WPM.record({ mode: 'horde-' + (chIndex + 1), difficulty: runDiff, wpm, acc, correct: stats.chars, keys: stats.keys, ms: Math.round(stats.ms), score, cleared });
      if (cleared) WPM.track('breach_stage', { chapter: chIndex + 1, difficulty: runDiff, score, wpm, acc });
      WPM.track('combo', { n: maxCombo, mode: 'breach' });
      return r;
    } catch (e) { console.error(e); return null; }
  }
  function chapterClear() {
    S.play('clear');
    document.dispatchEvent(new CustomEvent('buddy', { detail: 'chapter-clear' }));
    const { wpm, acc } = runStats();
    const rank = rankOf(wpm, acc, stats.hits);
    const bk = runDiff === 'normal' ? ch.id : ch.id + ':' + runDiff, prev = save.best[bk];
    if (!prev || score > prev.score) save.best[bk] = { score, rank };
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
    if (mode === 'title') {
      S.play('select');
      if (titleSel === 0) goSelect(); else goEndlessMenu(titleSel === 2);
    }
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
    else if (mode === 'endless-menu') { S.play('select'); startEndless(endMenu.daily); }
    else if (mode === 'endless-over') goEndlessMenu(result && result.daily);
  }
  function onKey(k) {
    if (k === 'Enter') onEnter();
    if (k === 'Escape') {
      if (mode === 'play') { paused = !paused; S.duck(paused ? 0.3 : 1); }
      else if (mode === 'over' || mode === 'select' || mode === 'endless-menu' || mode === 'endless-over') goTitle();
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
    ctx.fillStyle = doneCol; ctx.fillText(done, x0, y);
    ctx.fillStyle = restCol; ctx.fillText(word.slice(typed), x0 + ctx.measureText(done).width, y);
    return w;
  }
  function timerBar(x, y, w, frac, col) {
    ctx.fillStyle = 'rgba(57,255,136,.12)'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(frac, 0, 1), 4);
  }
  function icon(kind, x, y, s, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.beginPath();
    if (kind === 'plus') { ctx.moveTo(x - s * 0.4, y); ctx.lineTo(x + s * 0.4, y); ctx.moveTo(x, y - s * 0.4); ctx.lineTo(x, y + s * 0.4); ctx.stroke(); }
    else if (kind === 'clock') { ctx.arc(x, y, s * 0.42, 0, 7); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 0.28); ctx.moveTo(x, y); ctx.lineTo(x + s * 0.22, y); ctx.stroke(); }
    else if (kind === 'burst') { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(x + Math.cos(a) * s * 0.15, y + Math.sin(a) * s * 0.15); ctx.lineTo(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45); } ctx.stroke(); }
    else if (kind === 'shield') { ctx.moveTo(x, y - s * 0.45); ctx.lineTo(x + s * 0.38, y - s * 0.28); ctx.lineTo(x + s * 0.32, y + s * 0.15); ctx.lineTo(x, y + s * 0.45); ctx.lineTo(x - s * 0.32, y + s * 0.15); ctx.lineTo(x - s * 0.38, y - s * 0.28); ctx.closePath(); ctx.stroke(); }
    else if (kind === 'pause') { ctx.fillRect(x - s * 0.28, y - s * 0.32, s * 0.18, s * 0.64); ctx.fillRect(x + s * 0.1, y - s * 0.32, s * 0.18, s * 0.64); }
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
  // Screen-space layout: tags are placed nearest first, and each one moves up or down until it is clear
  // of every tag already placed. The box passed in covers the tag's label too, so labels move with it.
  let tagRects = [];
  const tagPrev = new WeakMap();
  const TAG_TOP = 64;
  function placeTag(key, x, y, w, h) {
    const lo = TAG_TOP, hi = Math.max(lo, H - 74 - h);
    const x0 = clamp(x, 8, Math.max(8, W - w - 8)), y0 = clamp(y, lo, hi);
    const over = (xx, yy) => {
      let a = 0;
      for (const r of tagRects) {
        const ox = Math.min(xx + w + 4, r.x + r.w + 4) - Math.max(xx, r.x), oy = Math.min(yy + h + 3, r.y + r.h + 3) - Math.max(yy, r.y);
        if (ox > 0 && oy > 0) a += ox * oy;
      }
      return a;
    };
    const fit = (dx, dy) => ({ x: clamp(x0 + dx, 8, Math.max(8, W - w - 8)), y: clamp(y0 + dy, lo, hi) });
    let at = null;
    if (!over(x0, y0)) at = { x: x0, y: y0 };
    // keep last frame's offset while it is still clear, so tags don't jump about
    const prev = key && tagPrev.get(key);
    if (!at && prev) { const c = fit(prev.dx, prev.dy); if (!over(c.x, c.y)) at = c; }
    if (!at) {
      // the nearest clear spot, searching up and down first and then to the sides
      let best = null, bestA = Infinity;
      for (const dx of [0, -(w / 2 + 8), w / 2 + 8, -(w + 14), w + 14]) {
        for (let i = 1; i < 80; i++) {
          const c = fit(dx, Math.ceil(i / 2) * (i % 2 ? -7 : 7));
          const cost = Math.abs(c.y - y0) + Math.abs(c.x - x0) * 1.3, a = over(c.x, c.y);
          if (a === 0 && (!best || bestA > 0 || cost < best.cost)) { best = { ...c, cost }; bestA = 0; }
          else if (bestA > 0 && a < bestA) { best = { ...c, cost }; bestA = a; }
        }
      }
      at = best ? { x: best.x, y: best.y } : { x: x0, y: y0 };
    }
    if (key) tagPrev.set(key, { dx: at.x - x0, dy: at.y - y0 });
    tagRects.push({ x: at.x, y: at.y, w, h });
    at.moved = Math.hypot(at.x - x0, at.y - y0);
    return at;
  }
  // a thin line from a moved tag back to what it belongs to
  function leader(x, y, w, h, sp, col = 'rgba(215,245,227,.4)') {
    if (sp.behind) return;
    const ex = clamp(sp.x, x, x + w), ey = sp.y > y + h ? y + h : sp.y < y ? y : null;
    if (ey === null) return;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(sp.x, sp.y); ctx.stroke();
  }
  function enemyTag(o, word, typed, sp, kindCol) {
    const closeness = clamp(1 - dist(o.pos || corePos(), cam.pos) / 26, 0, 1);
    const size = Math.round(14 + closeness * 8);
    ctx.font = `600 ${size}px ${F_MONO}`;
    const tw = ctx.measureText(word).width, pad = 7, w = tw + pad * 2, h = size + 10;
    const isT = target === o, warn = !!o.warn, glitchy = /[^a-z ]/.test(word);
    // the box handed to the layout covers the GLITCH label, the dashed outline and the shield or link number
    const top = glitchy ? 16 : 0, left = o.chain || (o.words.length > 1 && o.wi === 0) ? 16 : 4;
    const pl = placeTag(o, sp.x - w / 2 - left, (sp.behind ? H - 120 : sp.y - h - 10) - top - 4, w + left + 4, h + top + 8);
    const x = pl.x + left, y = pl.y + top + 4, moved = pl.moved > 12;
    cut(x, y, w, h, 5);
    ctx.fillStyle = warn ? 'rgba(48,6,10,.94)' : isT ? 'rgba(6,26,14,.94)' : 'rgba(4,10,7,.84)'; ctx.fill();
    ctx.strokeStyle = warn ? C.red : isT ? C.green : (kindCol || 'rgba(215,245,227,.25)');
    ctx.lineWidth = warn ? (calm() ? 2.5 : 2 + (Math.sin((t - o.warn) * 7) + 1) * 1.2) : isT ? 1.5 : 1;
    ctx.stroke();
    if (warn) { ctx.strokeStyle = 'rgba(255,77,94,.45)'; ctx.lineWidth = 1; cut(x - 4, y - 4, w + 8, h + 8, 7); ctx.stroke(); }
    const dim = o.chain && !targetable(o), vis = cloakVis(o);
    if (glitchy) {
      // glitch words get a broken outline and a fixed colour split so the player reads them closely
      ctx.save(); ctx.setLineDash([5, 3]); ctx.lineDashOffset = calm() ? 0 : -t * 6;
      ctx.strokeStyle = '#ff6bd6'; ctx.lineWidth = 1.5; cut(x - 3, y - 3, w + 6, h + 6, 6); ctx.stroke(); ctx.restore();
      text('GLITCH', x + w / 2, y - 6, `10px ${F_LABEL}`, '#ff6bd6', 'center');
    }
    if (dim) ctx.globalAlpha = 0.45;
    let shown = vis < 0.5 ? word.slice(0, typed) + '·'.repeat(word.length - typed) : word;
    if (o.glitchCap && shown === word) shown = word[0].toUpperCase() + word.slice(1);
    if (glitchy && !o.mirror) {
      ctx.font = `600 ${size}px ${F_MONO}`; ctx.textAlign = 'left'; ctx.globalAlpha *= 0.5;
      ctx.fillStyle = '#ff4d5e'; ctx.fillText(shown.slice(typed), x + pad - 1 + ctx.measureText(shown.slice(0, typed)).width, y + h - 7);
      ctx.fillStyle = '#3ee6ff'; ctx.fillText(shown.slice(typed), x + pad + 1 + ctx.measureText(shown.slice(0, typed)).width, y + h - 7);
      ctx.globalAlpha = dim ? 0.45 : 1;
    }
    if (o.mirror) {
      ctx.save(); ctx.translate(x + w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(x + w / 2), 0);
      typedWord(shown, typed, x + pad, y + h - 7, `600 ${size}px ${F_MONO}`, C.green, C.cyan);
      ctx.restore();
    } else typedWord(shown, typed, x + pad, y + h - 7, `600 ${size}px ${F_MONO}`, C.green, isT ? '#ffffff' : C.ink);
    if (o.chain) text(String(o.order), x - 4, y + 9, `600 11px ${F_MONO}`, dim ? C.ink2 : C.green, 'right');
    ctx.globalAlpha = 1;
    // a thin leader line from the tag to the body, brighter when the layout moved the tag
    leader(x, y, w, h, sp, isT ? 'rgba(57,255,136,.6)' : moved ? 'rgba(215,245,227,.42)' : 'rgba(215,245,227,.18)');
    return { x, y, w, h };
  }
  // 0 while a cloaked typo is faded out, 1 while it shows
  function cloakVis(o) {
    if (o.cloakT === undefined) return 1;
    const P = o.def.cloak || 2.8, ph = (o.cloakT % P) / P;
    return clamp(Math.min((ph - 0.05) / 0.1, (0.5 - ph) / 0.1), 0, 1);
  }
  // A mimic looks like a power-up chip until it shows itself.
  function mimicTag(o, sp) {
    pickupTag({ word: o.words[0], typed: o.typed, pick: 'health', life: 9, mimic: true, ref: o }, sp);
  }
  function choiceTag(c, sp) {
    ctx.font = `700 22px ${F_MONO}`;
    const tw = ctx.measureText(c.word).width, w = Math.max(tw, 120) + 28, h = 38;
    const { x, y, moved } = placeTag(c, sp.x - w / 2, sp.y - h, w, h + 20);
    if (moved > 12) leader(x, y, w, h + 18, sp);
    panel(x, y + 18, w, h, { c: 7, fill: target === c ? 'rgba(10,34,20,.95)' : 'rgba(4,10,7,.92)', stroke: C.green });
    text(c.label.toUpperCase(), x + w / 2, y + 12, `13px ${F_LABEL}`, C.green, 'center');
    typedWord(c.word, c.typed, x + w / 2, y + 18 + h - 11, `700 22px ${F_MONO}`, C.green, '#ffffff', 'center');
  }
  function barrierTag(b, sp) {
    const k = b.warn && !calm() ? 1 + Math.sin((t - b.warn) * 7) * 0.06 : 1;
    ctx.font = `700 21px ${F_MONO}`;
    const tw = ctx.measureText(b.word).width, w = Math.max(tw + 22, 84), h = 32;
    const pl = placeTag(b, sp.x - w / 2 - 4, sp.y - h - 4, w + 8, h + 24);
    const x = pl.x + 4, y = pl.y + 2;
    if (pl.moved > 12) leader(x, y, w, h + 16, sp, 'rgba(255,77,94,.5)');
    ctx.save(); ctx.translate(x + w / 2, y + h / 2 + 16); ctx.scale(k, k); ctx.translate(-(x + w / 2), -(y + h / 2 + 16));
    cut(x, y + 16, w, h, 6); ctx.fillStyle = 'rgba(40,6,10,.94)'; ctx.fill();
    ctx.strokeStyle = target === b ? C.green : C.red; ctx.lineWidth = b.warn ? 2.5 : 1.5; ctx.stroke();
    text('FIREWALL', x + w / 2, y + 11, `12px ${F_LABEL}`, C.red, 'center');
    typedWord(b.word, b.typed, x + w / 2 - tw / 2, y + 16 + h - 9, `700 21px ${F_MONO}`, C.green, '#ffd9dc');
    ctx.restore();
  }
  // A red arrow at the screen edge pointing to a threat that is off screen or at the side.
  function edgeArrow(sp, since) {
    const side = sp.behind || sp.x < W * 0.12 || sp.x > W * 0.88 || sp.y < 70 || sp.y > H - 70;
    if (!side) return;
    let dx = sp.x - VX, dy = sp.y - H / 2;
    if (sp.behind) { dx = -dx || 1; dy = Math.abs(dy) + 40; }
    const k = Math.min((W / 2 - 30) / Math.max(1, Math.abs(dx)), (H / 2 - 40) / Math.max(1, Math.abs(dy)));
    const x = VX + dx * k, y = H / 2 + dy * k, a = Math.atan2(dy, dx);
    const s = calm() ? 1 : 1 + Math.sin((t - since) * 7) * 0.12;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath();
    ctx.fillStyle = C.red; ctx.fill(); ctx.strokeStyle = '#2a0408'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  function pickupTag(p, sp) {
    const size = 17;
    ctx.font = `700 ${size}px ${F_MONO}`;
    const tw = ctx.measureText(p.word).width, iw = 22, h = 28, w = tw + iw + 14;
    const label = 'POWER-UP // ' + (p.mimic ? '???' : D.PICKUPS[p.pick].label.toUpperCase());
    ctx.font = `12px ${F_LABEL}`;
    const BW = Math.max(w + 20, ctx.measureText(label).width + 10);
    const pl = placeTag(p.ref || p, sp.x - BW / 2, sp.y - h - 46, BW, h + 22);
    const x = pl.x + BW / 2 - w / 2, y = pl.y + 18;
    if (pl.moved > 12) leader(pl.x, pl.y, BW, h + 22, sp, 'rgba(62,230,255,.45)');
    ctx.globalAlpha = p.life < 2 ? (calm() ? 0.75 : 0.7 + Math.sin(t * 6) * 0.3) : 1;
    hexPath(x, y + h / 2, w, h);
    ctx.fillStyle = C.cyan; ctx.fill();
    if (target === (p.ref || p)) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }
    if (p.mimic) text('?', x + 11, y + h / 2 + 6, `700 18px ${F_MONO}`, '#03181c', 'center'); else icon(D.PICKUPS[p.pick].icon, x + 11, y + h / 2, 18, '#03181c');
    ctx.fillStyle = 'rgba(3,24,28,.35)'; ctx.fillRect(x + iw, y + 5, 1, h - 10);
    typedWord(p.word, p.typed, x + iw + 7, y + h - 8, `700 ${size}px ${F_MONO}`, '#ffffff', '#03181c');
    text(label, x + w / 2, y - 6, `12px ${F_LABEL}`, C.cyan, 'center', 6);
    ctx.globalAlpha = 1;
  }
  function projTag(p, sp) {
    if (p.warn && !calm()) { const k = 1 + Math.sin((t - p.warn) * 7) * 0.08; ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(k, k); ctx.translate(-sp.x, -sp.y); projTagIn(p, sp); ctx.restore(); return; }
    projTagIn(p, sp);
  }
  function projTagIn(p, sp) {
    ctx.font = `700 18px ${F_MONO}`;
    const tw = ctx.measureText(p.word).width, w = tw + 14, h = 26;
    const pl = placeTag(p, sp.x - w / 2 - 3, sp.y - h - 11, w + 6, h + 6), x = pl.x + 3, y = pl.y + 3;
    if (pl.moved > 12) leader(x, y, w, h, sp, 'rgba(255,77,94,.5)');
    cut(x, y, w, h, 5);
    ctx.fillStyle = 'rgba(40,6,10,.9)'; ctx.fill();
    ctx.strokeStyle = target === p ? C.green : C.red; ctx.lineWidth = p.warn ? 2.5 : 1.5; ctx.stroke();
    typedWord(p.word, p.typed, x + 7, y + h - 7, `700 18px ${F_MONO}`, C.green, '#ffd9dc');
  }
  function rushTag(r, sp) {
    ctx.font = `700 20px ${F_MONO}`;
    const tw = ctx.measureText(r.word).width, w = tw + 16, h = 30;
    const { x, y } = placeTag(r, sp.x - w / 2, sp.y - h / 2, w, h);
    const pulse = calm() ? 1 : 0.88 + Math.sin((t - r.born) * 5) * 0.12;
    cut(x, y, w, h, 6);
    ctx.fillStyle = `rgba(57,255,136,${0.9 * pulse})`; ctx.fill();
    typedWord(r.word, r.typed, x + 8, y + h - 9, `700 20px ${F_MONO}`, '#ffffff', '#02140a');
  }
  function coreTag(sp) {
    const o = boss.core;
    ctx.font = `700 20px ${F_MONO}`;
    const tw = ctx.measureText(o.word).width, w = Math.max(tw + 18, 80), h = 30;
    const pl = placeTag(o, sp.x - w / 2, sp.y - h - 48, w, h + 18), x = pl.x, y = pl.y + 18;
    if (pl.moved > 12) leader(x, y, w, h, sp, 'rgba(255,77,94,.5)');
    // reticle on the weak point
    const rr = 16 + Math.sin(t * 6) * 2;
    ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
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
    if (boss && !boss.dying) tagRects.push({ x: VX - 232, y: 48, w: 464, h: boss.def.heat ? 62 : 46 });
    if (comms) tagRects.push({ x: 10, y: 76, w: 330, h: 96 });
    tagRects.push({ x: W - 160, y: 10, w: 150, h: 60 });
    if (banner) { const by = boss && boss.state !== 'intro' ? 146 : 112; tagRects.push({ x: VX - 260, y: by - 30, w: 520, h: banner.sub ? 62 : 42 }); }
    // nearest first so the far ones move out of the way
    const list = [];
    for (const p of projs) list.push(p);
    for (const f of foes) if (!f.dying) list.push(f);
    list.sort((a, b) => dist(a.pos, cam.pos) - dist(b.pos, cam.pos));
    // chain links and healer beams under the tags
    ctx.lineWidth = 2;
    for (const f of foes) {
      if (f.dying) continue;
      if (f.chain) {
        const i = f.chain.links.indexOf(f), nx = f.chain.links.slice(i + 1).find(l => !l.dying);
        if (nx) { const a = screen(anchor(f)), b = screen(anchor(nx)); if (!a.behind && !b.behind) { ctx.strokeStyle = 'rgba(62,230,255,.55)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
      }
      if (f.beam) { const a = screen(anchor(f)), b = screen(anchor(f.beam.to)); ctx.strokeStyle = `rgba(62,230,255,${Math.min(1, f.beam.t * 2)})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    // every tag goes into one list and is laid out nearest first
    const jobs = [], job = (pos, fn) => jobs.push({ d: dist(pos, cam.pos), fn });
    for (const c of choices) job(c.pos, () => { const sp = screen(c.pos); if (!sp.behind) choiceTag(c, sp); });
    for (const b of nextBarriers()) job(b.pos, () => { const sp = screen(b.pos); if (!sp.behind) barrierTag(b, sp); });
    for (const o of list) job(o.pos, () => {
      const sp = screen(anchor(o));
      if (o.kind === 'proj') { if (!sp.behind) projTag(o, sp); return; }
      if (o.type === 'burrower' && !o.surfaced) return;
      if (o.type === 'mimic' && !o.revealed) { if (!sp.behind) mimicTag(o, sp); return; }
      const word = o.words[o.wi];
      const r = enemyTag(o, word, o.typed, sp, o.type === 'node' ? 'rgba(62,230,255,.7)' : o.wi === 0 && o.words.length > 1 ? 'rgba(62,230,255,.6)' : null);
      if (o.words.length > 1 && o.wi === 0) icon('shield', r.x - 8, r.y + r.h / 2, 12, C.cyan);
      if (o === target) {
        ctx.strokeStyle = C.green; ctx.lineWidth = 1.5;
        const rr = 12 + Math.sin(t * 10) * 2;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, rr, 0, 7); ctx.stroke();
      }
    });
    for (const r of rush) job(r.pos, () => rushTag(r, screen(r.pos)));
    if (boss && boss.core && !boss.dying) job(corePos(), () => coreTag(screen(corePos())));
    if (boss && boss.speakers) { const nx = boss.speakers.find(x => !x.muted); for (const o of boss.speakers) job(o.pos, () => { const sp = screen(o.pos); if (!sp.behind) speakerTag(sp, o, o === nx); }); }
    for (const p of pickups) job(anchor(p), () => { const sp = screen(anchor(p)); if (!sp.behind) pickupTag(p, sp); });
    jobs.sort((a, b) => a.d - b.d).forEach(j => j.fn());
    for (const o of list) if (o.warn && !(o.kind === 'foe' && o.dying)) edgeArrow(screen(anchor(o)), o.warn);
    for (const b of barriers) if (b.warn && !b.done) edgeArrow(screen(b.pos), b.warn);
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
    // the title and progress sit on the same dark backing as the combo readout
    hudBack(VX - 160, 8, 320, E ? 56 : 40);
    if (E) {
      // level and a ghost line at your best score
      text(`${ch.title.toUpperCase()} // LEVEL ${E.level}`, VX, 26, `14px ${F_LABEL}`, C.green, 'center', 6);
      const bw = 240, bx = VX - bw / 2, best = E.best;
      ctx.fillStyle = 'rgba(57,255,136,.14)'; ctx.fillRect(bx, 34, bw, 6);
      const k = best ? Math.min(1, score / best) : 0;
      ctx.fillStyle = best && score > best ? C.gold : C.green; ctx.fillRect(bx, 34, bw * (best ? k : 0), 6);
      if (best) { ctx.fillStyle = C.gold; ctx.fillRect(bx + bw - 1, 30, 2, 14); text(score > best ? 'NEW BEST' : `BEST ${best.toLocaleString('en-US')}`, bx + bw, 56, `11px ${F_LABEL}`, C.gold, 'right'); }
      text(`STREAK ${E.streak}`, bx, 56, `11px ${F_LABEL}`, C.ink2, 'left');
    } else {
      text(`${String(chIndex + 1).padStart(2, '0')} // ${ch.title.toUpperCase()}`, VX, 26, `14px ${F_LABEL}`, C.green, 'center', 6);
      const n = steps.length;
      for (let i = 0; i < n; i++) {
        const w = 220 / n - 3, x = VX - 110 + i * (w + 3);
        ctx.fillStyle = i < stepI ? C.green : i === stepI ? C.greenDim : 'rgba(57,255,136,.14)';
        ctx.fillRect(x, 34, w, 5);
      }
    }
    // combo and power-ups, on a dark backing so scenery never hides them
    if (combo >= 5 || E) {
      hudBack(W - 150, 12, 136, 54);
      text(`x${mult().toFixed(1)}`, W - 24, 42, `700 24px ${F_MONO}`, C.green, 'right');
      text(`${combo} IN A ROW`, W - 24, 58, `12px ${F_LABEL}`, C.ink2, 'right');
    }
    if (freezeT > 0) text(`FREEZE ${freezeT.toFixed(1)}`, W - 18, 100, `13px ${F_LABEL}`, C.cyan, 'right');
    if (comms) {
      const a = Math.min(1, comms.t * 2), w = 320;
      ctx.font = `500 14px ${F_HEAD}`;
      const lines = wrap(comms.text, w - 24, `500 14px ${F_HEAD}`);
      const h = 34 + lines.length * 18;
      ctx.globalAlpha = a;
      panel(14, 78, w, h, { c: 7, fill: 'rgba(4,10,7,.9)', title: '> ' + comms.from.toUpperCase(), tcol: C.cyan, stroke: 'rgba(62,230,255,.45)' });
      lines.forEach((l, i) => text(l, 26, 112 + i * 18, `500 14px ${F_HEAD}`, C.ink));
      ctx.globalAlpha = 1;
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
    if (missT > 0) { ctx.strokeStyle = C.red; ctx.lineWidth = 2; cut(VX - iw / 2, H - 46, iw, 32, 6); ctx.stroke(); }
    else if (keyFlash > 0) { ctx.strokeStyle = `rgba(57,255,136,${keyFlash * 5})`; ctx.lineWidth = 1; cut(VX - iw / 2, H - 46, iw, 32, 6); ctx.stroke(); }
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
    const urgent = frac < 0.4;
    panel(VX - w / 2, y, w, h, { c: 10, fill: 'rgba(14,4,6,.92)', stroke: col, glow: 0, title: label, tcol: col });
    if (urgent) { ctx.strokeStyle = col; ctx.lineWidth = calm() ? 2.5 : 2 + (Math.sin(t * 7) + 1) * 1.2; cut(VX - w / 2 - 3, y - 3, w + 6, h + 6, 11); ctx.stroke(); }
    let idx = 0;
    lines.forEach((ln, i) => {
      const done = clamp(typed - idx, 0, ln.length);
      typedWord(ln, done, VX, y + 34 + (i + 1) * lh - 8, font, C.green, isT ? '#ffffff' : C.ink, 'center');
      idx += ln.length + 1;
    });
    timerBar(VX - w / 2 + 12, y + h - 10, w - 24, frac, urgent ? C.red : col);
  }
  // The Signboard's sign: the misspelled word on top and the answer typed below as blanks.
  function drawFix(pr, frac) {
    const w = 520, h = 128, x = VX - w / 2, y = H - 74 - h, urgent = frac < 0.4;
    panel(x, y, w, h, { c: 10, fill: 'rgba(16,10,2,.94)', stroke: C.gold, title: '> FIX THE SIGN', tcol: C.gold });
    if (urgent) { ctx.strokeStyle = C.gold; ctx.lineWidth = calm() ? 2.5 : 2 + (Math.sin(t * 7) + 1) * 1.2; cut(x - 3, y - 3, w + 6, h + 6, 11); ctx.stroke(); }
    text(pr.shown, VX, y + 56, `700 30px ${F_HEAD}`, C.gold, 'center');
    const blanks = pr.word.slice(0, pr.typed) + [...pr.word.slice(pr.typed)].map(c => c === ' ' ? ' ' : '_').join('');
    ctx.font = `600 24px ${F_MONO}`; ctx.textAlign = 'center';
    typedWord(blanks, pr.typed, VX, y + 96, `600 24px ${F_MONO}`, C.green, C.ink2, 'center');
    timerBar(x + 12, y + h - 10, w - 24, frac, urgent ? C.red : C.gold);
  }
  function speakerTag(sp, o, next) {
    ctx.font = `700 18px ${F_MONO}`;
    const tw = ctx.measureText(o.word).width, w = tw + 30, h = 28;
    const { x, y } = placeTag(o, sp.x - w / 2, sp.y - h / 2, w, h);
    ctx.globalAlpha = o.muted ? 0.25 : next ? 1 : 0.55;
    cut(x, y, w, h, 5); ctx.fillStyle = next ? 'rgba(4,20,24,.95)' : 'rgba(4,10,7,.85)'; ctx.fill();
    ctx.strokeStyle = target === o ? C.green : C.cyan; ctx.lineWidth = next ? 2 : 1; ctx.stroke();
    text(String(o.order), x + 9, y + 19, `600 12px ${F_MONO}`, C.cyan);
    if (!o.muted) typedWord(o.word, o.typed, x + 20, y + h - 8, `700 18px ${F_MONO}`, C.green, '#ffffff');
    ctx.globalAlpha = 1;
  }
  function drawBossHud() {
    const b = boss, bw = 440, x = VX - bw / 2, y = 68;
    hudBack(x - 12, y - 18, bw + 24, b.def.heat ? 58 : 44);
    text(b.name.toUpperCase(), x, y, `14px ${F_LABEL}`, C.red, 'left', 8);
    text(`${Math.ceil(b.hp)} / ${b.maxHp}`, x + bw, y, `600 13px ${F_MONO}`, C.ink, 'right');
    ctx.fillStyle = 'rgba(255,77,94,.12)'; ctx.fillRect(x, y + 6, bw, 9);
    const frac = b.hp / b.maxHp;
    b.shownHp = b.shownHp === undefined ? frac : lerp(b.shownHp, frac, 0.06);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x, y + 6, bw * b.shownHp, 9);
    ctx.fillStyle = b.shield ? C.cyan : C.red; ctx.fillRect(x, y + 6, bw * frac, 9);
    for (let i = 1; i < 20; i++) { ctx.fillStyle = 'rgba(4,8,6,.8)'; ctx.fillRect(x + i * bw / 20, y + 6, 1, 9); }
    for (const e of b.events) { ctx.fillStyle = e.done ? 'rgba(215,245,227,.25)' : C.ink; ctx.fillRect(x + bw * e.at - 1, y + 3, 2, 15); }
    if (b.def.finale) { ctx.fillStyle = C.green; ctx.fillRect(x + bw * b.def.finale.at - 1, y + 3, 2, 15); }
    if (b.state === 'intro') {
      ctx.globalAlpha = clamp(b.introT, 0, 1);
      const gx = calm() ? 0 : (Math.random() - 0.5) * 4 * (b.introT > 2 ? 1 : 0);
      text(b.name.toUpperCase(), VX + gx + 3, H - 120, `700 56px ${F_HEAD}`, C.red, 'center');
      text(b.name.toUpperCase(), VX - gx, H - 120, `700 56px ${F_HEAD}`, C.ink, 'center', 20);
      text('// HOSTILE PROGRAM', VX, H - 92, `15px ${F_LABEL}`, C.red, 'center');
      ctx.globalAlpha = 1;
    }
    if (prompt && prompt.kind === 'fix') drawFix(prompt, b.timer / b.timerMax);
    else if (prompt) drawPrompt(prompt.kind === 'finale' ? '> COMMAND' : '!! ATTACK', prompt.word, prompt.typed, b.timer / b.timerMax, prompt.kind === 'finale' ? C.green : C.red, target === prompt);
    if (b.def.heat) {
      text('HEAT', x, y + 32, `11px ${F_LABEL}`, C.ink2);
      for (let i = 0; i < b.def.heat; i++) { ctx.fillStyle = i < (b.heat || 0) ? C.gold : 'rgba(242,194,48,.18)'; ctx.fillRect(x + 40 + i * 26, y + 24, 22, 8); }
    }
    if (b.speakers) timerBar(VX - 150, 182, 300, b.timer / b.timerMax, b.timer / b.timerMax < 0.4 ? C.red : C.cyan);
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

  // menu text on a dark backing, so it never sits straight on the bright floor grid
  function note(str, x, y, font, col, align = 'center', glow = 0) {
    ctx.font = font;
    const w = ctx.measureText(str).width, size = parseInt(font.match(/(\d+)px/)[1], 10);
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    cut(x0 - 10, y - size - 4, w + 20, size + 12, 5); ctx.fillStyle = 'rgba(4,8,6,.84)'; ctx.fill();
    text(str, x, y, font, col, align, glow);
  }
  function hudBack(x, y, w, h) { cut(x, y, w, h, 6); ctx.fillStyle = 'rgba(4,8,6,.84)'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); }
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
    const g = calm() ? 1 : Math.random() < 0.03 ? rand(3, 7) : 1.5;
    ctx.globalCompositeOperation = 'lighter';
    text(s, x - g, y, font, 'rgba(255,77,94,.7)', 'center');
    text(s, x + g, y, font, 'rgba(62,230,255,.6)', 'center');
    ctx.globalCompositeOperation = 'source-over';
    text(s, x, y, font, C.ink, 'center', 24);
    if (!calm() && Math.random() < 0.02) {
      const sy = y - size * rand(0.2, 0.8), sh = rand(4, 12);
      const ky = hud.height / H;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(hud, 0, sy * ky, hud.width, sh * ky, rand(-20, 20) * ky, sy * ky, hud.width, sh * ky);
      ctx.restore();
    }
  }
  function drawDifficulty(y, cx = VX) {
    const bw = 136, gap = 10, x0 = cx - (3 * bw + 2 * gap) / 2;
    DIFFS.forEach((k, i) => {
      const df = D.DIFFICULTY[k], x = x0 + i * (bw + gap), on = settings.difficulty === k;
      panel(x, y, bw, 32, { c: 6, fill: on ? 'rgba(10,34,20,.95)' : 'rgba(4,10,7,.85)', stroke: on ? C.green : C.line });
      text(df.label.toUpperCase(), x + 12, y + 21, `14px ${F_LABEL}`, on ? C.green : C.ink);
      text(`x${df.mult.toFixed(1)}`, x + bw - 12, y + 21, `600 13px ${F_MONO}`, on ? C.green : C.ink2, 'right');
      menuRects.push({ x, y, w: bw, h: 32, go: () => setDifficulty(k) });
    });
  }
  function drawSettings(y) {
    const w = 360, h = 40, x = VX - w / 2;
    settingsRect = { x, y, w, h };
    panel(x, y, w, h, { c: 6, fill: 'rgba(4,10,7,.9)', title: null });
    text('REDUCE FLASHING', x + 14, y + 25, `14px ${F_LABEL}`, C.ink);
    const on = calm();
    text(osCalm() ? 'ON // SYSTEM SETTING' : on ? '[ ON ]' : '[ OFF ]', x + w - 14, y + 25, `600 14px ${F_MONO}`, on ? C.green : C.ink2, 'right');
    if (!osCalm()) note('Press F or click to switch.', VX, y + h + 20, `13px ${F_LABEL}`, C.ink2);
  }
  function drawTitle() {
    overlay(use3D ? 0.35 : 0.85);
    const g = ctx.createLinearGradient(0, 140, 0, 400);
    g.addColorStop(0, 'rgba(2,6,4,0)'); g.addColorStop(0.5, 'rgba(2,6,4,.6)'); g.addColorStop(1, 'rgba(2,6,4,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 140, W, 260);
    note('> lowercase // game_', VX, 160, `15px ${F_LABEL}`, C.green, 'center', 8);
    glitchTitle('BREACH', VX, 262, 118);
    note('A typing game in five chapters', VX, 298, `500 18px ${F_HEAD}`, C.ink2);
    const opts = ['Story', 'Endless', 'Daily run'], ow = 156, gap = 14, ox = VX - (3 * ow + 2 * gap) / 2;
    opts.forEach((o, i) => {
      const x = ox + i * (ow + gap), on = i === titleSel;
      panel(x, 326, ow, 38, { c: 7, fill: on ? 'rgba(10,34,20,.95)' : 'rgba(4,10,7,.88)', stroke: on ? C.green : C.line, glow: on ? 10 : 0 });
      text(o.toUpperCase(), x + ow / 2, 351, `16px ${F_LABEL}`, on ? C.green : C.ink, 'center');
      menuRects.push({ x, y: 326, w: ow, h: 38, go: () => { titleSel = i; onEnter(); } });
    });
    note(focused ? 'Arrow keys pick a mode and Enter starts it. D changes the difficulty.' : 'Click a mode to play.', VX, 384, `13px ${F_LABEL}`, C.ink2);
    drawDifficulty(394);
    drawSettings(440);
    note('Esc pauses the game.', VX, 526, `13px ${F_LABEL}`, C.ink2);
  }
  function drawSelect() {
    overlay(use3D ? 0.45 : 0.85);
    note('> SELECT_CHAPTER', cardX(0) + 10, 92, `14px ${F_LABEL}`, C.green, 'left', 6);
    note('Chapters', cardX(0) + 10, 140, `700 38px ${F_HEAD}`, C.ink, 'left');
    note('Pick a chapter with the arrow keys or 1 to 5 and press Enter.', cardX(4) + CARD_W - 10, 136, `14px ${F_LABEL}`, C.ink2, 'right');
    D.CHAPTERS.forEach((c, i) => {
      const x = cardX(i), locked = i >= save.unlocked, on = i === sel;
      panel(x, CARD_Y, CARD_W, CARD_H, { c: 10, fill: on ? 'rgba(10,34,20,.92)' : 'rgba(5,12,8,.88)', stroke: on ? C.green : C.line, glow: on ? 14 : 0 });
      ctx.globalAlpha = locked ? 0.35 : 1;
      text(String(i + 1).padStart(2, '0'), x + 14, CARD_Y + 50, `600 38px ${F_MONO}`, on ? C.green : C.ink, 'left', on ? 12 : 0);
      ctx.fillStyle = c.color2; ctx.fillRect(x + 14, CARD_Y + 62, 26, 3);
      text(c.title, x + 14, CARD_Y + 92, `700 19px ${F_HEAD}`, C.ink);
      wrap(c.place, CARD_W - 28, `13px ${F_LABEL}`).forEach((l, k) => text(l, x + 14, CARD_Y + 114 + k * 16, `13px ${F_LABEL}`, C.ink2));
      const b = save.best[bestKey(c.id)];
      if (locked) text('LOCKED', x + 14, CARD_Y + CARD_H - 18, `13px ${F_LABEL}`, C.ink2);
      else if (b) {
        const top = b.rank === 'S' || b.rank === 'A';
        text(b.rank, x + CARD_W - 16, CARD_Y + CARD_H - 14, `700 34px ${F_HEAD}`, top ? C.gold : C.green, 'right', 10);
        text(String(b.score), x + 14, CARD_Y + CARD_H - 18, `600 14px ${F_MONO}`, C.ink);
      } else text('NOT PLAYED', x + 14, CARD_Y + CARD_H - 18, `13px ${F_LABEL}`, C.ink2);
      ctx.globalAlpha = 1;
    });
    drawDifficulty(412);
    note('Ranks and scores on the cards are for the difficulty picked here. Press D to change it.', VX, 470, `13px ${F_LABEL}`, C.ink2);
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
    // the story sits on its own dark panel, sized to the pages shown so far
    {
      let hh = 0;
      for (let i = 0; i <= story.page; i++) hh += wrap(story.pages[i], 780, `500 21px ${F_HEAD}`).length * 31 + 12;
      cut(56, 78, 840, Math.min(H - 110, 200 + hh), 10); ctx.fillStyle = 'rgba(4,8,6,.86)'; ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
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
    if (story.shown >= story.pages[story.page].length && Math.floor(t * 2) % 2 === 0) note('[ PRESS ENTER ]', W - 80, 500, `14px ${F_LABEL}`, C.green, 'right', 8);
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
  function drawEndlessMenu() {
    overlay(use3D ? 0.6 : 0.88);
    const daily = endMenu.daily, x0 = 60;
    note(daily ? '> DAILY_RUN' : '> ENDLESS_', x0 + 10, 66, `14px ${F_LABEL}`, C.green, 'left', 6);
    drawDifficulty(84, 680);
    note(daily ? 'Daily run' : 'Endless', x0 + 10, 110, `700 36px ${F_HEAD}`, C.ink, 'left');
    note(daily ? `${todayKey()}. Everyone playing today gets the same spawn order.` : 'You have three lives. A hit clears the screen and sends you back to level 1.', x0 + 10, 140, `500 16px ${F_HEAD}`, C.ink2, 'left');
    // scores on this device
    panel(x0, 160, 420, 300, { title: (daily ? '// DAILY RUNS' : '// TOP 10') + ' // ' + D.DIFFICULTY[settings.difficulty].label.toUpperCase() });
    const rows = daily
      ? Object.values(dailyScores(settings.difficulty)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
      : endlessScores(settings.difficulty);
    if (!rows.length) text('No runs yet.', x0 + 16, 204, `14px ${F_LABEL}`, C.ink2);
    rows.forEach((r, i) => {
      const y = 202 + i * 24, top = !daily && i < 3;
      text(daily ? r.date : `${i + 1}.`, x0 + 16, y, `600 14px ${F_MONO}`, top ? C.gold : C.ink2);
      text(r.score.toLocaleString('en-US'), x0 + 230, y, `600 15px ${F_MONO}`, top ? C.gold : C.ink, 'right');
      text(`LV ${r.level}`, x0 + 300, y, `600 14px ${F_MONO}`, C.green, 'right');
      if (!daily) text(r.date, x0 + 404, y, `13px ${F_MONO}`, C.ink2, 'right');
    });
    // mutators, or today's stage for the daily run
    const x1 = 500;
    panel(x1, 160, 400, 300, { title: daily ? '// TODAY' : '// MUTATORS' });
    if (daily) {
      const c = D.CHAPTERS[hashStr('breach-' + todayKey()) % 5], best = dailyScores(settings.difficulty)[todayKey()];
      text(`Stage: ${c.title}`, x1 + 16, 206, `600 18px ${F_HEAD}`, C.ink);
      text(best ? `Your best today: ${best.score.toLocaleString('en-US')}` : 'No run today yet.', x1 + 16, 236, `14px ${F_LABEL}`, best ? C.gold : C.ink2);
      wrap('Mutators are off for the daily run so every score is on the same rules.', 368, `500 14px ${F_HEAD}`).forEach((l, i) => text(l, x1 + 16, 276 + i * 20, `500 14px ${F_HEAD}`, C.ink2));
    } else {
      D.ENDLESS.mutators.forEach((m, i) => {
        const y = 186 + i * 82, open = mutUnlocked(m), on = open && mutOn[m.id];
        panel(x1 + 14, y, 372, 68, { c: 6, fill: on ? 'rgba(10,34,20,.95)' : 'rgba(4,10,7,.6)', stroke: on ? C.green : C.line });
        text(`${i + 1}  ${m.label.toUpperCase()}`, x1 + 28, y + 26, `15px ${F_LABEL}`, open ? C.ink : C.ink2);
        text(open ? (on ? '[ ON ]' : '[ OFF ]') : `BEST ${m.unlock.toLocaleString('en-US')} TO UNLOCK`, x1 + 374, y + 26, `600 13px ${F_MONO}`, on ? C.green : C.ink2, 'right');
        text(m.text, x1 + 28, y + 50, `500 14px ${F_HEAD}`, C.ink2);
        menuRects.push({ x: x1 + 14, y, w: 372, h: 68, go: () => toggleMut(i) });
      });
    }
    panel(VX + 330, 478, 110, 38, { c: 7, fill: 'rgba(10,34,20,.95)', stroke: C.green });
    text('START', VX + 385, 503, `16px ${F_LABEL}`, C.green, 'center');
    menuRects.push({ x: VX + 330, y: 478, w: 110, h: 38, go: () => onEnter() });
    note(daily ? 'Enter starts and Esc goes back. D changes the difficulty.' : 'Keys 1 to 3 switch a mutator, D the difficulty. Enter starts and Esc goes back.', x0 + 10, 503, `13px ${F_LABEL}`, C.ink2, 'left');
  }
  function drawEndlessOver() {
    overlay(use3D ? 0.72 : 0.9);
    const w = 460, h = 372, x = VX - w / 2, y = 70, r = result;
    panel(x, y, w, h, { c: 12, fill: 'rgba(4,10,7,.94)', title: r.daily ? '> DAILY_RUN_OVER' : '> RUN_OVER' });
    text('Run over', VX, y + 64, `700 32px ${F_HEAD}`, C.ink, 'center');
    text(r.score.toLocaleString('en-US'), VX, y + 130, `700 52px ${F_MONO}`, r.newBest ? C.gold : C.green, 'center');
    text(r.newBest ? 'NEW BEST' : 'SCORE', VX, y + 154, `12px ${F_LABEL}`, r.newBest ? C.gold : C.ink2, 'center');
    const rows = [['Level reached', String(r.level)], ['Longest streak', r.streak + ' kills'], ['Speed', r.wpm + ' wpm'], ['Accuracy', r.acc + '%']].concat(rewardRows());
    rows.forEach(([a, b, col], i) => {
      const ry = y + 196 + i * 24;
      text(a.toUpperCase(), x + 40, ry, `13px ${F_LABEL}`, C.ink2);
      text(b, x + w - 40, ry, `600 15px ${F_MONO}`, col || C.ink, 'right');
    });
    text('[ PRESS ENTER ]', VX, y + h + 34, `15px ${F_LABEL}`, C.green, 'center', 8);
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
    settingsRect = null; menuRects = [];
    const inPlay = mode === 'play' || mode === 'over' || mode === 'endless-over';
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
        t, dt: paused ? 0 : dt, cam: camPose, calm: calm(), shake: shakeT * (calm() ? 0.08 : 0.4), hurt: calm() ? 0 : hurtT * 0.4, glitch: calm() ? 0 : glitchT * 0.45, slow: slowT > 0,
        foes: inPlay ? foes : [], projs: inPlay ? projs : [], pickups: inPlay ? pickups : [], rush: inPlay ? rush : [],
        boss: inPlay ? boss : null, bossCore: boss ? corePos() : null, target, mode,
        barriers: inPlay ? barriers : [], choices: inPlay ? choices : [], dark: darkK, freeze: freezeT > 0,
        train: inPlay && steps[stepI] && steps[stepI].kind === 'chase' ? { pos: level.rail.at(Math.max(0, cam.s - 10)), fwd: camFwd() } : null,
        cloak: o => cloakVis(o),
      });
    } else {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(57,255,136,.12)';
      for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.moveTo(VX + (i - 10) * 30, H / 2); ctx.lineTo(VX + (i - 10) * 160, H); ctx.stroke(); }
    }
    ctx.save();
    if (shakeT > 0) { const a = calm() ? Math.min(3, 6 * shakeT) : 8 * shakeT; ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
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
        drawSettings(330);
      }
    }
    else if (mode === 'result') drawResult();
    else if (mode === 'over') { drawWorldTags(); drawOver(); }
    else if (mode === 'ending') drawEnding();
    else if (mode === 'endless-menu') drawEndlessMenu();
    else if (mode === 'endless-over') { drawWorldTags(); drawEndlessOver(); }
    ctx.restore();
    if (edgeFx) {
      const k = 1 - (t - edgeFx.start) / edgeFx.dur;
      if (k <= 0) edgeFx = null;
      else {
        const g = ctx.createRadialGradient(VX, H / 2, H * 0.42, VX, H / 2, W * 0.62);
        g.addColorStop(0, `rgba(${edgeFx.rgb},0)`); g.addColorStop(1, `rgba(${edgeFx.rgb},${edgeFx.a * k})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    if (!use3D) scan();
  }

  // ---------- mount ----------
  const STYLE = `
.breach-host{position:relative;display:flex;justify-content:center;align-items:flex-start}
.breach-host:fullscreen{display:flex;align-items:center;justify-content:center;background:#000}
.breach-root{position:relative;margin:0 auto;overflow:hidden;background:#020604;outline:none;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.breach-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.breach-root .sr-input{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;resize:none;pointer-events:none}`;
  function injectStyle() {
    if (document.getElementById('breach-style')) return;
    const s = document.createElement('style'); s.id = 'breach-style'; s.textContent = STYLE;
    document.head.appendChild(s);
  }
  // The 16:9 game takes the largest size that fits the host's width and the
  // window height below the site's sticky header. Full screen letterboxes it.
  function headerH() {
    const top = document.querySelector('header.top');
    if (!top) return 0;
    const pos = getComputedStyle(top).position;
    return pos === 'sticky' || pos === 'fixed' ? top.getBoundingClientRect().height : 0;
  }
  function fit() {
    if (!root || !host) return;
    const fs = document.fullscreenElement === host;
    host.style.height = '';
    const pw = host.clientWidth || W;
    let availH;
    if (fs) availH = host.clientHeight || window.innerHeight;
    else {
      const hh = headerH();
      host.style.scrollMarginTop = (hh + 8) + 'px';
      availH = window.innerHeight - hh - 16;
    }
    const rw = Math.max(240, Math.floor(Math.min(pw, availH * 16 / 9)));
    const rh = Math.floor(rw * 9 / 16);
    root.style.width = rw + 'px'; root.style.height = rh + 'px';
    if (!fs) host.style.height = rh + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    hud.width = Math.round(rw * dpr); hud.height = Math.round(rh * dpr);
    if (use3D) R3.resize(rw, rh);
  }
  // Scrolls the page so the whole game shows below the header.
  function reveal() {
    if (!host || document.fullscreenElement) return;
    const r = host.getBoundingClientRect(), hh = headerH();
    if (r.top < hh - 1 || r.bottom > window.innerHeight + 1) host.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  const wantMusic = () => mode === 'play' ? (boss ? 'boss' : ch.music) : mode === 'ending' ? 'ending' : mode === 'over' ? '' : 'menu';
  function mount(el) {
    if (root) unmount();
    if (!el) throw new Error('Breach.mount needs an element');
    injectStyle();
    loadSave(); loadSettings();
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
      if (mode === 'title' && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { titleSel = (titleSel + 1) % 3; S.play('blip'); }
      if (mode === 'title' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { titleSel = (titleSel + 2) % 3; S.play('blip'); }
      if (mode !== 'select') return;
      if (e.key === 'ArrowRight') { sel = Math.min(save.unlocked - 1, sel + 1); menuScene(sel); S.play('blip'); }
      if (e.key === 'ArrowLeft') { sel = Math.max(0, sel - 1); menuScene(sel); S.play('blip'); }
    }, sig);
    root.addEventListener('focusin', () => { focused = true; reveal(); if (paused && mode === 'play') { paused = false; S.duck(1); } if (TT.soundOn() && visible) S.music(wantMusic()); }, sig);
    root.addEventListener('focusout', () => { focused = false; if (mode === 'play') { paused = true; S.duck(0.3); } }, sig);
    root.addEventListener('pointerdown', () => { if (visible && TT.soundOn()) S.music(wantMusic()); }, sig);
    hud.addEventListener('pointerup', e => {
      const r = hud.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
      const sr = settingsRect;
      if (sr && x >= sr.x && x <= sr.x + sr.w && y >= sr.y && y <= sr.y + sr.h) { toggleCalm(); return; }
      const mr = menuRects.find(m => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h);
      if (mr) { mr.go(); return; }
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
      if (ok) { fit(); R3.setLevel(menuLevel); R3.setFloor(p => level ? floorAt(p.x, p.z, p.y - 1.2) : null); }
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
        result, reward, use3D, level, stats, t, E, barriers, choices, comms, titleSel,
      };
    },
    targets: () => liveTargets().map(x => ({ word: x.word, kind: x.obj.kind, typed: x.obj.typed || 0, d: x.obj.pos && cam ? dist(x.obj.pos, cam.pos) : 0 })),
    unlockAll() { save.unlocked = 5; persist(); },
    maxDt: 0.05,
    invincible: false,
    hold: false,
    setHearts(n) { hearts = n; },
    // test helpers: jump the camera to a step, or place one enemy in front of the camera
    jump(i, keepQueue) {
      foes = []; projs = []; pickups = []; queue = []; target = null; stepI = i;
      const from = steps[i].kind === 'chase' ? steps[i - 1].stop.s : steps[i].stop.s - 0.05;
      cam.s = Math.max(0, from); cam.pos = level.rail.at(cam.s); enterStep(); if (!keepQueue) queue = [];
    },
    clear() { foes.forEach(f => { if (!f.dying) kill(f, true); }); projs = []; queue = []; },
    spawn(type, distance, side = 0, frozen = true, glitch = false) {
      const p = add(add(cam.pos, camFwd(), distance), camRight(), side); p.y = camFloor() + BODY_Y[type];
      const f = spawnFoe(type, 'ahead', p); if (frozen) f.speed = 0; f.glitch = 0;
      if (glitch && !f.glitchWord) { const k = f.words.length - 1; f.words[k] = glitchify(f.words[k]); f.glitchWord = true; }
      return f.words.join(' ');
    },
    bossAct(name) { if (boss && !boss.dying) bossState(name); },
    endRun() { if (mode === 'play') gameOver(); },
    title() { goTitle(); },
    start(i) { startChapter(i); },
    skipStory() { while (mode === 'story' && story) { const a = story.after; story = null; a(); } },
    endlessMenu(daily) { goEndlessMenu(!!daily); },
    pickup(kind) { spawnPickup(kind || 'health'); },
    endless(daily) { startEndless(!!daily); },
    endlessLevel(n) { if (E) { E.level = n; E.maxLevel = Math.max(E.maxLevel, n); } },
    chain(n) { spawnChain(n || 4, 'ahead'); },
    hurtLog,
    audit,
  };
  window._horde = hook; window._breach = hook;

  const queued = window.Breach && window.Breach._queue;
  window.Breach = { mount, unmount, fullscreen, endlessScores, dailyScores, get mounted() { return !!root; } };
  if (queued && queued.length) queued.forEach(([fn, arg]) => window.Breach[fn](arg));
  document.dispatchEvent(new CustomEvent('breach:ready'));
})();
