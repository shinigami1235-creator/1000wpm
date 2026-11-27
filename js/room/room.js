// My Room: a cut-away 3D room the player decorates with items from the shop.
// window.Room.mount(el) builds the page inside el and Room.unmount() tears it down.
// Room.mount(el, { visit: { name, layout, owned, size, preset } }) shows someone else's room read-only:
// their saved layout, or one of the presets laid out with the items they own when there is none.
// Layouts are saved with WPM.setRoom({ v: 1, items: [{ id, x, y, z, rot, wall }] }).
window.Room = (() => {
  const T = 0.14;                                    // wall thickness in metres
  // Room size and the window in the left wall. They change when the player picks another room size.
  let W, D, H, WIN;
  const SMALL = { id: 'room-s', w: 4.2, d: 3.8, h: 2.6 };
  function setDims(z) {
    W = z.w; D = z.d; H = z.h;
    const c = D * (1.8 / 3.8);
    WIN = { z0: c - 0.8, z1: c + 0.8, y0: 0.95, y1: Math.min(H - 0.3, 2.15 + (H - 2.6) / 2) };
  }
  setDims(SMALL);
  const sizes = () => RoomItems.sizes;
  const sizeOwned = z => z.price === 0 || WPM.owns(z.id);
  const STARTERS = ['desk-basic', 'chair-basic', 'monitor-basic', 'keyboard-basic'];
  const GREEN = '#39ff88';
  let S = null;

  // ---------------------------------------------------------------- icons
  const ICON = {
    home: 'M3 11l9-7 9 7v9h-6v-6H9v6H3z',
    move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
    box: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
    save: 'M5 3h11l3 3v15H5zM8 3v5h8V3M8 21v-7h8v7',
    layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
    rotate: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    check: 'M5 12.5l4.5 4.5L19 7',
    x: 'M6 6l12 12M18 6L6 18',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    cart: 'M3 4h2.5l2.2 11h10.6l2-8H6.4M9 20h.01M17 20h.01',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    size: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9h6v6H9z',
  };
  const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- geometry of a placement
  // room sizes, wallpapers and floors change the room instead of being placed
  const special = d => !!(d && (d.roomSize || d.finish));
  const finishOwned = (d, vOwned) => !!(d && d.finish && (d.base || (vOwned ? vOwned.has(d.id) : WPM.owns(d.id))));

  // A placement is { id, x, y, z, rot, wall } where wall is null, 'back' or 'left'.
  // Floor items: (x, z) is the footprint centre and rot turns it in 90 degree steps.
  // Wall items: x (back wall) or z (left wall) is the centre along the wall and y the bottom edge.
  const def = id => RoomItems.get(id);
  // Item name inside a sentence: "the office chair", but brand names keep their case
  const noun = id => {
    const d = def(id), n = d.name;
    return d.category === 'Keyboards' && id !== 'keyboard-basic' ? n : /^[A-Z][a-z]/.test(n) ? n[0].toLowerCase() + n.slice(1) : n;
  };
  const CELL = () => RoomItems.CELL;
  function height(id) {
    const d = def(id);
    if (d.top) return d.top;
    const m = RoomItems.dims(id);
    return m ? m.h : 0.5;
  }
  function foot(p) {
    const d = def(p.id);
    const w = d.size[0] * CELL(), dd = d.size[1] * CELL();
    if (p.wall) return [w, dd];
    return p.rot % 2 ? [dd, w] : [w, dd];
  }
  function box(p) {
    const d = def(p.id), [w, dd] = foot(p), h = height(p.id);
    if (p.wall === 'back') return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y, y1: p.y + h, z0: 0, z1: dd };
    if (p.wall === 'left') return { x0: 0, x1: dd, y0: p.y, y1: p.y + h, z0: p.z - w / 2, z1: p.z + w / 2 };
    return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y, y1: p.y + (d.rug ? 0.02 : h), z0: p.z - dd / 2, z1: p.z + dd / 2 };
  }
  const E = 0.004;
  const hit = (a, b) => a.x0 < b.x1 - E && b.x0 < a.x1 - E && a.y0 < b.y1 - E && b.y0 < a.y1 - E && a.z0 < b.z1 - E && b.z0 < a.z1 - E;

  // The support under a placement resting above the floor
  function supportOf(p, items) {
    if (p.wall || p.y < 0.001) return null;
    const b = box(p);
    for (const s of items) {
      if (s === p || !def(s.id).top) continue;
      if (Math.abs(s.y + def(s.id).top - p.y) > 0.003) continue;
      const sb = box(s);
      if (b.x0 >= sb.x0 - E && b.x1 <= sb.x1 + E && b.z0 >= sb.z0 - E && b.z1 <= sb.z1 + E) return s;
    }
    return null;
  }
  function childrenOf(s, items) {
    if (!def(s.id).top) return [];
    return items.filter(p => p !== s && supportOf(p, items) === s);
  }
  // Can p sit here? skip lists placements that move with p.
  function fits(p, items, skip = []) {
    const b = box(p);
    if (b.x0 < -E || b.z0 < -E || b.x1 > W + E || b.z1 > D + E || b.y0 < -E || b.y1 > H + E) return false;
    if (p.wall === 'left' && b.z0 < WIN.z1 + 0.04 && b.z1 > WIN.z0 - 0.04 && b.y0 < WIN.y1 + 0.04 && b.y1 > WIN.y0 - 0.04) return false;
    if (!p.wall && p.y > 0.001 && !supportOf(p, items)) return false;
    const rug = !!def(p.id).rug;
    for (const o of items) {
      if (o === p || skip.includes(o)) continue;
      if (!!def(o.id).rug !== rug) continue;
      if (hit(b, box(o))) return false;
    }
    return true;
  }

  // Snap a candidate to the grid and keep it inside the room or its support.
  const snapEdge = (c, half, step) => Math.round((c - half) / step) * step + half;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function snap(p, items) {
    const [w, dd] = foot(p), h = height(p.id);
    if (p.wall === 'back') { p.x = clamp(snapEdge(p.x, w / 2, CELL() / 2), w / 2, W - w / 2); p.y = clamp(Math.round(p.y / 0.05) * 0.05, 0, H - h); p.z = 0; return p; }
    if (p.wall === 'left') { p.z = clamp(snapEdge(p.z, w / 2, CELL() / 2), w / 2, D - w / 2); p.y = clamp(Math.round(p.y / 0.05) * 0.05, 0, H - h); p.x = 0; return p; }
    if (p.on) {
      const sb = box(p.on);
      p.x = clamp(snapEdge(p.x, w / 2, 0.05), sb.x0 + w / 2, sb.x1 - w / 2);
      p.z = clamp(snapEdge(p.z, dd / 2, 0.05), sb.z0 + dd / 2, sb.z1 - dd / 2);
      p.y = p.on.y + def(p.on.id).top;
      if (sb.x1 - sb.x0 < w || sb.z1 - sb.z0 < dd) p.on = null;
    }
    if (!p.on) {
      p.y = 0;
      p.x = clamp(snapEdge(p.x, w / 2, CELL()), w / 2, W - w / 2);
      p.z = clamp(snapEdge(p.z, dd / 2, CELL()), dd / 2, D - dd / 2);
    }
    return p;
  }

  // ---------------------------------------------------------------- presets
  const PICK = {
    desk: ['desk-command', 'desk-standing', 'desk-walnut', 'desk-basic'],
    chair: ['chair-gaming', 'chair-ergo', 'chair-basic'],
    monitor: ['monitor-dual', 'monitor-ultra', 'monitor-27', 'monitor-basic'],
    keyboard: ['kb-aula-f99', 'kb-corsair-vanguard96', 'kb-loga-yaksa', 'kb-womier-sk61he', 'kb-chilkey-sf60', 'kb-attackshark-x68he', 'keyboard-basic'],
    pc: ['pc-tower', 'pc-white'],
    rug: ['rug-laurel', 'rug-round', 'rug-shag'],
  };
  function layoutBuilder(owned, start = []) {
    const items = [...start];
    const used = new Set(start.map(p => p.id));
    const pick = list => [].concat(list).find(id => owned.has(id) && !used.has(id) && def(id));
    const add = (id, p) => {
      if (!id) return null;
      const q = { id, x: 0, y: 0, z: 0, rot: 0, wall: null, ...p };
      if (!fits(q, items)) return null;
      items.push(q); used.add(id);
      return q;
    };
    const sz = (id, rot) => { const d = def(id), w = d.size[0] * CELL(), dd = d.size[1] * CELL(); return rot % 2 ? [dd, w] : [w, dd]; };
    const B = {
      items,
      pick,
      has: id => owned.has(id) && !used.has(id),
      // against the back wall, centred at x
      back: (id, x, rot = 0) => id && add(id, { x, z: sz(id, rot)[1] / 2, rot }),
      // against the left wall, centred at z, facing into the room
      left: (id, z) => id && add(id, { x: sz(id, 1)[0] / 2, z, rot: 1 }),
      floor: (id, x, z, rot = 0) => id && add(id, { x, z, rot }),
      wall: (id, wall, along, y) => id && add(id, wall === 'back' ? { wall, x: along, y } : { wall, z: along, y }),
      // on top of a support; fx and fz run from -1 to 1 across its top in its own frame
      on: (s, id, fx, fz, turn = 0) => {
        if (!s || !id) return null;
        const rot = (s.rot + turn) % 4;
        const [sw, sd] = sz(s.id, 0), [iw, idd] = sz(id, turn);
        let dx = fx * (sw - iw) / 2, dz = fz * (sd - idd) / 2;
        for (let i = 0; i < s.rot; i++) [dx, dz] = [dz, -dx];
        return add(id, { x: s.x + dx, z: s.z + dz, y: s.y + def(s.id).top, rot });
      },
      size: sz,
    };
    return B;
  }
  const PRESETS = [
    {
      id: 'back', name: 'Back wall desk', text: 'Desk against the back wall with shelves to the right and a lounge corner in front.',
      build(B) {
        const desk = B.back(B.pick(PICK.desk), 1.75);
        if (desk) {
          B.on(desk, B.pick(PICK.monitor), 0, -1);
          B.on(desk, B.pick(PICK.keyboard), 0, 0.5);
          B.on(desk, B.pick('desk-lamp'), -1, -1);
          B.on(desk, B.pick('lava-lamp'), 1, -1);
          B.on(desk, B.pick(['headphone-stand', 'cactus']), 1, 0.4);
          B.on(desk, B.pick('mic-arm'), -0.85, 0.6);
          const [dw, dd] = B.size(desk.id, 0);
          const chair = B.pick(PICK.chair);
          if (chair) B.floor(chair, desk.x, dd + B.size(chair, 2)[1] / 2 + 0.1, 2);
          const pc = B.pick(PICK.pc);
          if (pc) B.floor(pc, desk.x + dw / 2 + 0.22, 0.3) || B.on(desk, pc, 1, -1);
        }
        B.wall(B.pick('neon-sign'), 'back', 1.75, 1.62);
        B.wall(B.pick('led-strip'), 'back', W / 2, H - 0.12);
        B.back(B.pick('bookshelf'), W - 0.42);
        B.wall(B.pick('wall-shelf'), 'back', 2.95, 1.4);
        B.wall(B.pick('pothos'), 'back', 0.4, 1.45);
        B.wall(B.pick('poster-logo'), 'left', 0.5, 1.35);
        B.left(B.pick('shelf-industrial'), 3.2);
        B.wall(B.pick('hex-panels'), 'left', 3.2, 1.3) || B.wall(B.pick('hex-panels'), 'back', 3.0, 1.85);
        B.wall(B.pick('pegboard'), 'left', 3.15, 1.15);
        B.wall(B.pick('poster-mountain'), 'left', 3.2, 0.85);
        B.floor(B.pick(PICK.rug), 1.75, 2.1);
        B.floor(B.pick('monstera'), 0.4, 0.4);
        B.floor(B.pick('snake-plant'), 0.2, 0.95) || B.floor(B.pick('snake-plant'), 3.95, 3.55);
        const table = B.floor(B.pick('coffee-table'), 2.05, 3.4);
        if (table) { B.on(table, B.pick('book-stack'), -0.75, 0); B.on(table, B.pick('keycap-jar'), 0.85, 0); B.on(table, B.pick('laptop'), 0.15, 0); }
        const bag = B.floor(B.pick('beanbag'), 3.45, 3.25);
        B.floor(B.pick('lantern'), 3.95, 2.2);
        B.floor(B.pick('cat'), bag ? 2.85 : 3.3, bag ? 2.45 : 3.0, 3);
        B.on(B.items.find(p => p.id === 'bookshelf'), B.pick('astronaut'), 0.6, 0);
      },
    },
    {
      id: 'window', name: 'Window desk', text: 'Desk under the window with shelves along the back wall.',
      build(B) {
        const desk = B.left(B.pick(PICK.desk), (WIN.z0 + WIN.z1) / 2);
        if (desk) {
          B.on(desk, B.pick(PICK.monitor), 0, -1);
          B.on(desk, B.pick(PICK.keyboard), 0, 0.5);
          B.on(desk, B.pick('desk-lamp'), 1, -1);
          B.on(desk, B.pick(['cactus', 'lava-lamp']), -1, -1);
          const [dw, dd] = B.size(desk.id, 0);
          const chair = B.pick(PICK.chair);
          if (chair) B.floor(chair, dd + B.size(chair, 3)[0] / 2 + 0.1, desk.z, 3);
          const pc = B.pick(PICK.pc);
          if (pc) B.floor(pc, 0.25, desk.z + dw / 2 + 0.2, 1) || B.on(desk, pc, 1, -1);
        }
        B.back(B.pick('bookshelf'), 0.45);
        B.back(B.pick('shelf-industrial'), 1.4);
        B.wall(B.pick('neon-sign'), 'back', 2.85, 1.75);
        B.wall(B.pick('hex-panels'), 'back', 2.85, 0.95);
        B.wall(B.pick('led-strip'), 'back', W / 2, H - 0.12);
        B.wall(B.pick('wall-shelf'), 'back', 3.7, 1.3);
        B.wall(B.pick('pothos'), 'back', 3.95, 0.55) ;
        B.wall(B.pick('poster-logo'), 'left', 3.25, 1.1);
        B.wall(B.pick('poster-mountain'), 'left', 0.5, 1.1);
        B.floor(B.pick(PICK.rug), 2.6, 2.4);
        const bag = B.floor(B.pick('beanbag'), 3.35, 1.25);
        const table = B.floor(B.pick('coffee-table'), 3.2, 2.6, 1);
        if (table) { B.on(table, B.pick('book-stack'), 0, -0.7); B.on(table, B.pick('keycap-jar'), 0, 0.8); B.on(table, B.pick('laptop'), 0, 0); }
        B.floor(B.pick('lantern'), 3.95, 0.25) || B.floor(B.pick('lantern'), 3.95, 3.55);
        B.floor(B.pick('monstera'), 3.85, 3.45);
        B.floor(B.pick('snake-plant'), 0.2, 3.6);
        B.floor(B.pick('cat'), bag ? 2.4 : 3.0, bag ? 1.3 : 1.8, 1);
        B.on(B.items.find(p => p.id === 'bookshelf'), B.pick('astronaut'), 0.6, 0);
      },
    },
    {
      id: 'corner', name: 'Corner desk', text: 'Desk in the back left corner with the middle of the floor kept open.',
      build(B) {
        const id = B.pick(PICK.desk);
        const desk = id && B.back(id, B.size(id, 0)[0] / 2 + 0.05);
        if (desk) {
          B.on(desk, B.pick(PICK.monitor), 0, -1);
          B.on(desk, B.pick(PICK.keyboard), 0.05, 0.5);
          B.on(desk, B.pick('lava-lamp'), -1, -1);
          B.on(desk, B.pick('desk-lamp'), 1, -1);
          B.on(desk, B.pick('cactus'), -1, 1);
          const [dw, dd] = B.size(desk.id, 0);
          const chair = B.pick(PICK.chair);
          if (chair) B.floor(chair, desk.x, dd + B.size(chair, 2)[1] / 2 + 0.1, 2);
          const pc = B.pick(PICK.pc);
          if (pc) B.floor(pc, dw + 0.25, 0.3) || B.on(desk, pc, 1, -1);
        }
        const dx = desk ? desk.x : 0.9;
        B.wall(B.pick('pegboard'), 'back', dx, 1.3) || B.wall(B.pick('neon-sign'), 'back', dx, 1.6);
        B.wall(B.pick('neon-sign'), 'back', 2.9, 1.85);
        B.wall(B.pick('led-strip'), 'back', W / 2, H - 0.12);
        B.back(B.pick('shelf-industrial'), W - 0.55);
        B.wall(B.pick('hex-panels'), 'back', 2.75, 1.0);
        B.left(B.pick('bookshelf'), 3.25);
        B.wall(B.pick('poster-logo'), 'left', 0.5, 1.15);
        B.wall(B.pick('pothos'), 'back', 2.0, 1.55);
        B.wall(B.pick('wall-shelf'), 'left', 3.25, 1.4);
        B.wall(B.pick('poster-mountain'), 'left', 3.25, 1.1);
        B.floor(B.pick(PICK.rug), 2.3, 2.5);
        const table = B.floor(B.pick('coffee-table'), 2.3, 2.95);
        if (table) { B.on(table, B.pick('book-stack'), -0.75, 0); B.on(table, B.pick('laptop'), 0.5, 0); }
        B.floor(B.pick('beanbag'), 3.65, 3.1);
        B.floor(B.pick('lantern'), 3.95, 2.0);
        B.floor(B.pick('monstera'), 0.45, 2.35) || B.floor(B.pick('monstera'), 1.2, 3.4);
        B.floor(B.pick('snake-plant'), 1.6, 3.6);
        B.floor(B.pick('cat'), 2.35, 2.05, 1);
        B.on(B.items.find(p => p.id === 'shelf-industrial'), B.pick('astronaut'), 0.6, 0);
      },
    },
  ];
  // Move a layout from room size a to room size b (the current size). Items against a wall stay
  // against it, chairs and PCs follow their desk, items on a desk move with it and the rest spread
  // out or close in. Items that no longer fit are left out.
  function mapLayout(items, a, b) {
    const out = [], delta = new Map();
    const axis = (c, half, L0, L1) => c - half < 0.06 ? c : c + half > L0 - 0.06 ? c + (L1 - L0) : c * L1 / L0;
    const gap = (p, q) => { const x = box(p), y = box(q); return Math.max(x.x0 - y.x1, y.x0 - x.x1, x.z0 - y.z1, y.z0 - x.z1); };
    for (const p of [...items].sort((x, y) => (x.wall ? 1 : 0) - (y.wall ? 1 : 0) || x.y - y.y)) {
      const d = def(p.id), q = { id: p.id, x: p.x, y: p.y, z: p.z, rot: p.rot || 0, wall: p.wall || null };
      const sup = supportOf(p, items);
      const desk = !sup && !p.wall && /^(Chairs|PC & Tech)$/.test(d.category) && items.find(o => o !== p && delta.has(o) && def(o.id).category === 'Desks' && gap(p, o) < 0.6);
      if (sup || desk) {
        const m = delta.get(sup || desk);
        if (!m) continue;
        q.x += m.x; q.y += m.y; q.z += m.z;
      } else if (p.wall) {
        const h = height(p.id), w = d.size[0] * CELL() / 2;
        if (p.wall === 'back') q.x = axis(p.x, w, a.w, b.w); else q.z = axis(p.z, w, a.d, b.d);
        if (p.y + h > a.h - 0.3) q.y = p.y + (b.h - a.h);
        snap(q);
      } else {
        const [sw, sd] = foot(p);
        q.x = axis(p.x, sw / 2, a.w, b.w); q.z = axis(p.z, sd / 2, a.d, b.d);
        snap(q);
      }
      if (!fits(q, out)) continue;
      out.push(q);
      delta.set(p, { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z });
    }
    return out;
  }

  // Presets are written for the free room and stretched to bigger ones. Bigger rooms then get a
  // second desk and the spare rugs, plants and lights in the free space.
  function presetLayout(preset, owned) {
    const real = { w: W, d: D, h: H };
    setDims(SMALL);
    const B = layoutBuilder(owned);
    preset.build(B);
    setDims(real);
    if (real.w === SMALL.w && real.d === SMALL.d) return B.items;
    const F = layoutBuilder(owned, mapLayout(B.items, SMALL, real));
    const scan = (id, spots) => { if (!id) return null; for (const [x, z, rot] of spots) { const p = F.floor(id, x, z, rot); if (p) return p; } return null; };
    const steps = (from, to, step = CELL()) => { const r = []; for (let v = from; step > 0 ? v <= to : v >= to; v += step) r.push(v); return r; };
    // second desk along the back wall, from the right
    const did = F.pick(PICK.desk);
    if (did) {
      const [dw, dd] = F.size(did, 0);
      const desk = scan(did, steps(W - dw / 2 - 0.05, dw / 2, -CELL()).map(x => [x, dd / 2, 0]));
      if (desk) {
        F.on(desk, F.pick(PICK.monitor), 0, -1);
        F.on(desk, F.pick(PICK.keyboard), 0, 0.5);
        F.on(desk, F.pick(['laptop', 'cactus', 'keycap-jar']), 1, -1);
        const ch = F.pick(PICK.chair);
        if (ch) F.floor(ch, desk.x, dd + F.size(ch, 2)[1] / 2 + 0.1, 2);
        const pc = F.pick(PICK.pc);
        if (pc) F.floor(pc, desk.x - dw / 2 - 0.2, 0.3) || F.floor(pc, desk.x + dw / 2 + 0.2, 0.3);
      }
    }
    // spare rugs and plants in the open floor and the front corners
    for (const id of PICK.rug) if (F.has(id)) scan(id, [[W * 0.72, D * 0.72], [W * 0.3, D * 0.75], [W * 0.75, D * 0.4]]);
    for (const id of ['monstera', 'snake-plant', 'lantern', 'beanbag', 'chair-ergo', 'chair-basic']) if (F.has(id)) scan(id, [[W - 0.45, D - 0.45], [0.45, D - 0.45], [W - 0.45, D * 0.5], [W * 0.5, D - 0.45]]);
    for (const id of ['hex-panels', 'pegboard', 'poster-mountain', 'poster-logo', 'wall-shelf', 'pothos']) if (F.has(id)) {
      for (const x of steps(W - 0.8, 0.8, -0.5)) if (F.wall(id, 'back', x, 1.35)) break;
    }
    return F.items;
  }

  // ---------------------------------------------------------------- mount
  async function mount(el, opts = {}) {
    if (S) unmount();
    const visit = opts.visit || null;
    const s = S = { el, items: [], uid: 0, mode: 'view', sel: null, placing: null, dirty: false, cat: 'All', off: [], alive: true, visit };
    el.innerHTML = `
      <div class="rm" data-mode="view"${visit ? ' data-visit' : ''}>
        <div class="rm-stage" role="img" aria-label="${visit ? esc(visit.name) + "'s room in 3D" : 'Your room in 3D'}"></div>
        <p class="rm-load">Loading room</p>
        <nav class="rm-menu rm-panel" aria-label="Room">
          <h2 class="rm-ttl">${svg('home')}<span>${visit ? esc(String(visit.name).toUpperCase()) + "'S ROOM" : 'MY ROOM'}</span></h2>
          <button type="button" data-act="edit" aria-pressed="false">${svg('move')}<span>Edit room</span></button>
          <button type="button" data-act="inventory" aria-expanded="false">${svg('box')}<span>Inventory</span></button>
          <button type="button" data-act="save">${svg('save')}<span>Save room</span><i class="rm-dot" hidden></i></button>
          <button type="button" data-act="presets" aria-expanded="false">${svg('layers')}<span>Room presets</span></button>
        </nav>
        <p class="rm-status" role="status" aria-live="polite"></p>
        <section class="rm-dock" aria-label="Edit room" hidden>
          <div class="rm-row">
            <div class="rm-tools rm-panel">
              <button type="button" data-tool="move">${svg('move')}<span>Move</span></button>
              <button type="button" data-tool="rotate">${svg('rotate')}<span>Rotate</span></button>
              <button type="button" data-tool="delete">${svg('trash')}<span>Delete</span></button>
              <button type="button" data-tool="size" aria-expanded="false">${svg('size')}<span>Room</span></button>
              <button type="button" data-tool="place" hidden>${svg('check')}<span>Place</span></button>
              <button type="button" data-tool="cancel" hidden>${svg('x')}<span>Cancel</span></button>
            </div>
            <div class="rm-tabs rm-panel" role="tablist" aria-label="Category"></div>
          </div>
          <div class="rm-bar rm-panel">
            <button type="button" class="rm-arrow" data-scroll="-1" aria-label="Scroll left">${svg('left')}</button>
            <div class="rm-strip"></div>
            <button type="button" class="rm-arrow" data-scroll="1" aria-label="Scroll right">${svg('right')}</button>
          </div>
        </section>
        <section class="rm-pop rm-panel" hidden></section>
      </div>`;
    const root = s.root = el.querySelector('.rm');
    const $ = q => root.querySelector(q);
    s.ui = { stage: $('.rm-stage'), load: $('.rm-load'), menu: $('.rm-menu'), status: $('.rm-status'), dock: $('.rm-dock'), tabs: $('.rm-tabs'), strip: $('.rm-strip'), pop: $('.rm-pop'), dot: $('.rm-dot') };

    let L, addons;
    try {
      L = await RoomItems.load();
      addons = await Promise.all([
        import('three/addons/controls/OrbitControls.js'),
        import('three/addons/environments/RoomEnvironment.js'),
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
        import('three/addons/postprocessing/SMAAPass.js'),
      ]);
    } catch (e) {
      if (S === s) s.ui.load.textContent = 'The 3D room needs an internet connection.';
      return;
    }
    if (S !== s) return;
    s.L = L;
    const [{ OrbitControls }, { RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { SMAAPass }] = addons;
    const THREE = s.THREE = L.THREE;
    const K = s.K = L.K;
    const phone = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
    s.phone = phone;

    // ---------- quality ----------
    // high and medium: N8AO at half resolution with SMAA, 2048 shadows. low (phones, weak machines): 4x MSAA,
    // 1024 shadows, no AO. AdaptiveQuality lowers the resolution, then the AO, if frames run slow.
    const aq = s.aq = window.AdaptiveQuality ? AdaptiveQuality.create({
      key: 'wpm-room', fps: 60, minScale: 0.6, minDetail: 0.55,
      onScale: v => { s.res = v; resize(s); },
      onDetail: d => setDetail(s, d),
    }) : null;
    const lvl = s.lvl = aq ? aq.level : phone ? 'low' : 'high';
    // the screen's own pixels at most (1.5x cap): supersampling a 1x screen cost too much once AO and SMAA were in
    s.baseRatio = Math.min(devicePixelRatio, lvl === 'high' ? 1.5 : 1.25);
    s.res = aq ? aq.scale : 1;
    if (aq) aq.loading();

    // ---------- renderer ----------
    const renderer = s.renderer = new THREE.WebGLRenderer({ antialias: lvl === 'low', powerPreference: 'high-performance' });
    renderer.setPixelRatio(s.baseRatio * s.res);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    s.ui.stage.appendChild(renderer.domElement);
    s.ui.load.remove();

    const scene = s.scene = new THREE.Scene();
    scene.background = K.canvasTex('room-bg', 512, 512, (c, w, h) => {
      const g = c.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.5, w * 0.75);
      g.addColorStop(0, '#11231a'); g.addColorStop(0.6, '#07100b'); g.addColorStop(1, '#030504');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    const pmrem = s.pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = s.roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.16;

    const camera = s.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 90);
    const controls = s.controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(W / 2, 0.85, D / 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    // drag turns the room all the way round; the wall in the way hides (cutaway)
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = 1.35;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 0.8;
    renderer.domElement.style.touchAction = 'none';

    // high and medium: N8AO ambient occlusion renders the scene (it replaces the render pass) and SMAA
    // smooths the edges, since hardware antialiasing doesn't reach through the occlusion. low: 4x MSAA.
    s.hd = !phone && lvl !== 'low';
    s.hdTex = lvl !== 'low';   // the texture sets in assets/room/tex, about 2 MB, fetched only here
    let N8AOPass = null;
    if (s.hd) try { ({ N8AOPass } = await import('three/addons/postprocessing/N8AOPass.js')); } catch (e) { s.hd = false; }
    if (S !== s) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: s.hd || lvl === 'low' ? 0 : 4 });
    const composer = s.composer = new EffectComposer(renderer, rt);
    if (N8AOPass) {
      const ao = s.ao = new N8AOPass(scene, camera, 1, 1);
      // half resolution and Medium quality: High (64 samples at full size) made a gaming laptop lag.
      // transparencyAware off: glass and water would otherwise be drawn twice every frame
      Object.assign(ao.configuration, { aoRadius: 0.55, distanceFalloff: 0.6, intensity: 2.6, gammaCorrection: false, halfRes: true, screenSpaceRadius: false, transparencyAware: false });
      ao.setQualityMode(lvl === 'high' ? 'Medium' : 'Low');
      composer.addPass(ao);
      // a plain render pass waits beside it, for when AdaptiveQuality turns the AO off
      s.plain = new RenderPass(scene, camera); s.plain.enabled = false; composer.insertPass(s.plain, 0);
    } else composer.addPass(new RenderPass(scene, camera));
    s.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 1.35);
    composer.addPass(s.bloom);
    composer.addPass(new OutputPass());
    if (s.ao) composer.addPass(s.smaa = new SMAAPass(1, 1));
    if (aq && s.ao) setDetail(s, aq.detail);
    // the room page's own detail: woven fabric normals, then the room lights itself (captureEnv)
    if (s.hdTex) K.hdSet('weave').then(t => K.useWeave(t.normal)).catch(() => {});

    // ---------- load the saved room or lay out the starter items ----------
    const saved = visit ? visit.layout || null : WPM.getRoom();
    const vOwned = visit ? new Set(visit.owned || []) : null;
    const z = visit && !saved && visit.size ? sizes().find(x => x.id === visit.size) || sizes()[0] : RoomItems.sizeOf(saved);
    s.size = visit ? (z.price === 0 || vOwned.has(z.id) ? z : sizes()[0]) : sizeOwned(z) ? z : sizes()[0];
    setDims(s.size);
    const fin = (key, kind) => { const d = saved && saved[key] ? def(saved[key]) : null; return d && d.finish && d.finish.kind === kind && finishOwned(d, vOwned) ? d.id : null; };
    s.paper = fin('paper', 'wall'); s.floorF = fin('floor', 'floor'); s.viewF = fin('view', 'view');
    buildShell(s, phone);
    s.itemsRoot = new THREE.Group();
    scene.add(s.itemsRoot);
    buildHelpers(s);
    buildGrids(s);
    controls.target.set(W / 2, 0.85, D / 2);

    const owned = new Set((visit ? [...vOwned] : WPM.owned()).filter(id => def(id) && !special(def(id))));
    for (const id of owned) RoomItems.create(id);   // fills in heights
    let list;
    if (saved && Array.isArray(saved.items)) {
      list = [];
      const seen = new Set();
      [...saved.items].sort((a, b) => (a.y || 0) - (b.y || 0)).forEach(p => {
        if (!def(p.id) || !owned.has(p.id) || seen.has(p.id)) return;
        const q = { id: p.id, x: +p.x || 0, y: +p.y || 0, z: +p.z || 0, rot: (p.rot | 0) % 4, wall: p.wall === 'back' || p.wall === 'left' ? p.wall : null };
        if (fits(q, list)) { list.push(q); seen.add(p.id); }
      });
    } else {
      list = presetLayout(PRESETS[visit ? Math.abs(visit.preset | 0) % PRESETS.length : 0], owned);
    }
    setLayout(s, list);
    if (visit) {
      // read only: no edit dock, no inventory, nothing saved
      s.ro = new ResizeObserver(() => resize(s));
      s.ro.observe(root);
      resize(s, true);
      const clock = new THREE.Clock();
      s.t = 0;
      renderer.setAnimationLoop(now => {
        if (document.hidden || skipFrame(s, now)) return;
        const dt = Math.min(0.05, clock.getDelta());
        s.t += dt;
        controls.update();
        for (const p of s.items) if (p.model.userData.tick) p.model.userData.tick(s.t, dt);
        cutaway(s);
        composer.render();
        frameDone(s);
      });
      return;
    }

    // ---------- UI ----------
    buildTabs(s);
    renderStrip(s);
    wireUI(s);
    wirePointer(s);
    s.off.push(WPM.on('inventory', () => { renderStrip(s); if (s.popKind === 'inventory') openPop(s, 'inventory'); }));

    s.ro = new ResizeObserver(() => resize(s));
    s.ro.observe(root);
    resize(s, true);

    const clock = new THREE.Clock();
    s.t = 0;
    renderer.setAnimationLoop(now => {
      if (document.hidden || skipFrame(s, now)) return;
      const dt = Math.min(0.05, clock.getDelta());
      s.t += dt;
      controls.update();
      for (const p of s.items) if (p.model.userData.tick) p.model.userData.tick(s.t, dt);
      if (s.marker.visible) s.marker.material.opacity = 0.55 + Math.sin(s.t * 5) * 0.15;
      cutaway(s);
      composer.render();
      frameDone(s);
    });
  }

  // 60 frames a second at most: a 144 or 165 Hz laptop screen would otherwise draw the room two or
  // three times as often for nothing. The shadow map is redrawn every third frame (the furniture only
  // moves when you move it), and right away after a change.
  function skipFrame(s, now) {
    if (s.lastF && now - s.lastF < 15.5) return true;
    s.lastF = now;
    const sm = s.renderer.shadowMap;
    sm.autoUpdate = false;
    s.fno = (s.fno || 0) + 1;
    if (s.fno % 3 === 0 || s.shadowNow > 0 || s.placing) { sm.needsUpdate = true; if (s.shadowNow > 0) s.shadowNow--; }
    return false;
  }
  // AdaptiveQuality's detail step: lower AO quality, then no AO
  function setDetail(s, d) {
    if (!s.ao) return;
    const off = d < 0.7;
    s.ao.enabled = !off; if (s.plain) s.plain.enabled = off;
    if (!off) s.ao.setQualityMode(d < 0.9 ? 'Performance' : s.lvl === 'high' ? 'Medium' : 'Low');
  }

  // the first frame clears the crash flag; every frame feeds the quality governor
  function frameDone(s) {
    if (!s.envDone) { s.envDone = true; captureEnv(s); }
    if (!s.aq) return;
    if (!s.drawn) { s.drawn = true; s.aq.loaded(); s.aq.watch(s.renderer.domElement); }
    s.aq.frame(performance.now());
  }

  function unmount() {
    const s = S;
    if (!s) return;
    // leaving the page keeps the changes, the same as pressing Save room
    if (s.dirty && !s.visit) { try { if (s.placing) cancelPlacing(s, true); WPM.setRoom(serialize(s)); } catch (e) {} }
    S = null;
    s.alive = false;
    clearTimeout(s.envT);
    if (s.cubeRT) s.cubeRT.dispose();
    if (s.envMap) s.envMap.dispose();
    s.off.forEach(f => { try { f(); } catch (e) {} });
    if (s.ro) s.ro.disconnect();
    if (s.renderer) {
      s.renderer.setAnimationLoop(null);
      s.controls.dispose();
      s.composer.dispose();
      s.scene.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
      s.renderer.dispose();
      s.renderer.forceContextLoss();
    }
    s.el.innerHTML = '';
  }

  // ---------------------------------------------------------------- the room shell
  function buildShell(s, phone) {
    const { THREE, K, scene } = s;
    const shell = s.shell = new THREE.Group();
    scene.add(shell);

    // floor
    // the floor and walls carry the bought finish (home-items.js); the uv of each surface is in metres
    const wood = RoomItems.finishMat(K, s.floorF, 'floor', W, D, s.hdTex);
    const slabM = K.std('#0b100d', 0.85);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.012, D), [slabM, slabM, wood, slabM, slabM, slabM]);
    floor.position.set(W / 2, -0.006, D / 2); floor.receiveShadow = true;
    shell.add(floor);
    s.floor = floor;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + T, 0.24, D + T), slabM);
    slab.position.set((W - T) / 2, -0.12 - 0.012, (D - T) / 2); slab.receiveShadow = true;
    shell.add(slab);
    const edgeM = K.glow(GREEN, 1.6);
    const e1 = K.box(W + T, 0.006, 0.006, edgeM); e1.position.set((W - T) / 2, -0.004, D + 0.003); shell.add(e1);
    const e2 = K.box(0.006, 0.006, D + T, edgeM); e2.position.set(W + 0.003, -0.004, (D - T) / 2); shell.add(e2);
    const e3 = K.box(W + T, 0.004, 0.004, K.glow(GREEN, 0.8)); e3.position.set((W - T) / 2, -0.248, D + 0.002); shell.add(e3);
    const e4 = K.box(0.004, 0.004, D + T, K.glow(GREEN, 0.8)); e4.position.set(W + 0.002, -0.248, (D - T) / 2); shell.add(e4);

    // walls
    const wallM = RoomItems.finishMat(K, s.paper, 'wall', 1, 1, s.hdTex);
    s.shellMats = [wood, wallM];
    const bgeo = new THREE.BoxGeometry(W + T, H, T), bp = bgeo.attributes.position, buv = bgeo.attributes.uv;
    for (let i = 0; i < buv.count; i++) buv.setXY(i, bp.getX(i) + (W + T) / 2 - T, bp.getY(i) + H / 2);
    const back = new THREE.Mesh(bgeo, wallM);
    back.position.set((W - T) / 2, H / 2, -T / 2); back.receiveShadow = true; back.castShadow = true;
    shell.add(back);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(D, 0); sh.lineTo(D, H); sh.lineTo(0, H); sh.lineTo(0, 0);
    const hole = new THREE.Path();
    hole.moveTo(WIN.z0, WIN.y0); hole.lineTo(WIN.z0, WIN.y1); hole.lineTo(WIN.z1, WIN.y1); hole.lineTo(WIN.z1, WIN.y0); hole.lineTo(WIN.z0, WIN.y0);
    sh.holes.push(hole);
    const lgeo = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false });
    
    const left = new THREE.Mesh(lgeo, wallM);
    left.rotation.y = -Math.PI / 2; left.position.set(0, 0, 0);
    left.receiveShadow = true; left.castShadow = true;
    shell.add(left);
    // light caps on the cut edges
    const capM = K.std('#56625b', 0.7);
    const c1 = K.box(W + T, 0.014, T + 0.004, capM); c1.position.set((W - T) / 2, H + 0.007, -T / 2); shell.add(c1);
    const c2 = K.box(T + 0.004, 0.014, D, capM); c2.position.set(-T / 2, H + 0.007, D / 2); shell.add(c2);
    const c3 = K.box(0.008, H, T + 0.004, capM); c3.position.set(W + 0.004, H / 2, -T / 2); shell.add(c3);
    const c4 = K.box(T + 0.004, H, 0.008, capM); c4.position.set(-T / 2, H / 2, D + 0.004); shell.add(c4);
    // skirting
    const skM = K.std('#141916', 0.6);
    const s1 = K.box(W, 0.08, 0.016, skM); s1.position.set(W / 2, 0.04, 0.008); shell.add(s1);
    const s2 = K.box(0.016, 0.08, D, skM); s2.position.set(0.008, 0.04, D / 2); shell.add(s2);
    // socket and switch
    const plate = K.plastic('#3a423d', 0.5);
    const sock = K.rbox(0.08, 0.08, 0.008, 0.006, plate); sock.position.set(W - 0.9, 0.3, 0.004); shell.add(sock);
    for (const dx of [-0.012, 0.012]) { const pin = K.cyl(0.003, 0.003, 0.004, K.std('#222', 0.6), 8); pin.rotation.x = Math.PI / 2; pin.position.set(W - 0.9 + dx, 0.3, 0.009); shell.add(pin); }
    const sw = K.rbox(0.008, 0.11, 0.075, 0.006, plate); sw.position.set(0.004, 1.15, D - 0.25); shell.add(sw);
    const rocker = K.rbox(0.006, 0.04, 0.03, 0.004, K.plastic('#4c5650', 0.4)); rocker.position.set(0.009, 1.15, D - 0.25); shell.add(rocker);

    // window: frame, glass, city and blinds
    const fm = K.std('#1a1e1c', 0.4, 0.6);
    const wz = (WIN.z0 + WIN.z1) / 2, wy = (WIN.y0 + WIN.y1) / 2, ww = WIN.z1 - WIN.z0, wh = WIN.y1 - WIN.y0;
    // the view outside (views.js): a painted scene with a moving layer, seen with parallax
    const view = s.view = RoomItems.viewMesh(K, s.viewF, ww, wh);
    const city = view.mesh;
    city.rotation.y = Math.PI / 2; city.position.set(-T + 0.004, wy, wz); shell.add(city);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), K.glass('#9fc0d9', 0.12));
    glass.rotation.y = Math.PI / 2; glass.position.set(-T / 2, wy, wz); shell.add(glass);
    const fr = (w, h, d, x, y, z) => { const b = K.rbox(w, h, d, 0.006, fm); b.position.set(x, y, z); b.castShadow = true; shell.add(b); };
    fr(T, 0.04, ww + 0.08, -T / 2, WIN.y1, wz);
    fr(T, 0.04, ww + 0.08, -T / 2, WIN.y0, wz);
    fr(T, wh, 0.04, -T / 2, wy, WIN.z0);
    fr(T, wh, 0.04, -T / 2, wy, WIN.z1);
    fr(0.05, wh, 0.03, -T / 2, wy, wz);
    fr(0.05, 0.03, ww, -T / 2, WIN.y0 + wh * 0.62, wz);
    const sill = K.rbox(0.16, 0.03, ww + 0.16, 0.006, K.std('#3a443e', 0.6)); sill.position.set(0.03, WIN.y0 - 0.01, wz); sill.castShadow = true; shell.add(sill);
    const slatM = K.std('#2d3430', 0.55, 0.3);
    const slats = 12;
    for (let i = 0; i < slats; i++) {
      const sl = K.box(0.04, 0.003, ww - 0.04, slatM);
      sl.position.set(0.035, WIN.y1 - 0.06 - i * 0.042, wz); sl.rotation.z = 0.5; sl.castShadow = true;
      shell.add(sl);
    }
    const rail = K.rbox(0.05, 0.045, ww, 0.006, slatM); rail.position.set(0.035, WIN.y1 - 0.02, wz); shell.add(rail);
    const bottom = K.rbox(0.05, 0.012, ww - 0.04, 0.004, slatM); bottom.position.set(0.035, WIN.y1 - 0.06 - slats * 0.042, wz); shell.add(bottom);
    for (const dz of [-ww * 0.3, ww * 0.3]) { const cord = K.box(0.002, slats * 0.042 + 0.04, 0.002, K.std('#d9d4c9', 0.8)); cord.position.set(0.04, WIN.y1 - 0.04 - slats * 0.021, wz + dz); shell.add(cord); }

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight('#bfe8d0', '#24180f', 0.32); shell.add(hemi);
    const key = new THREE.DirectionalLight('#ffd7a8', 0.95);
    const k = Math.sqrt(W * D / (4.2 * 3.8)), span = Math.max(4.2, Math.max(W, D));
    key.position.set(W / 2 + 1.9 * k, 6.5 * k, D / 2 + 3.6 * k); key.target.position.set(W / 2, 0, D / 2);
    key.castShadow = true;
    const sm = s.lvl === 'low' ? 1024 : 2048; key.shadow.mapSize.set(sm, sm);
    Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 14 * k + 6 });
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03 * k;
    shell.add(key, key.target);
    const moon = new THREE.DirectionalLight(s.view ? s.view.moon : '#7f9cff', 0.45);
    moon.position.set(-5, 3, wz); moon.target.position.set(W / 2, 0.5, wz); shell.add(moon, moon.target);
    const lightBonus = window.Progress && Progress.ready() && Progress.bonus('roomlight');   // a streak bonus colour
    const green = new THREE.PointLight(lightBonus ? lightBonus.color : GREEN, 5 * Math.min(k, 1.6), 5.5 * k, 1.6); green.position.set(0.3, H - 0.15, 0.3); shell.add(green);
    // one warm ceiling light per 4 by 4 m or so
    const nx = Math.max(1, Math.round(W / 4.5)), nz = Math.max(1, Math.round(D / 4.5));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const warm = new THREE.PointLight('#ffbf86', 7, 8, 1.6);
      warm.position.set(nx === 1 ? W * 0.62 : W * (i + 0.5) / nx, H - 0.2, nz === 1 ? D * 0.62 : D * (j + 0.5) / nz);
      shell.add(warm);
    }
    const cityGlow = new THREE.PointLight(s.view ? s.view.glow : '#8a6bff', 1.6, 3, 2); cityGlow.position.set(0.35, wy, wz); shell.add(cityGlow);

    // the pieces of each wall, hidden when the camera swings round behind that wall
    s.wallB = []; s.wallL = []; s.hidB = s.hidL = false;
    shell.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    for (const o of shell.children) {
      if (!o.isMesh) continue;
      bb.setFromObject(o);
      if (bb.max.z <= 0.12 && bb.max.x > 0.3) s.wallB.push(o);
      else if (bb.max.x <= 0.2 && bb.max.z > 0.3) s.wallL.push(o);
    }
    // soft shade where the walls meet the floor and each other, since there is no ambient occlusion
    const aoT = K.canvasTex('ao-ramp', 16, 128, (c, w, h) => { const gr = c.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.35, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    const aoM = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: aoT, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const strip = (w, h, list, place) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), aoM); place(m); m.raycast = () => {}; shell.add(m); list.push(m); };
    strip(W, 0.45, s.wallB, m => m.position.set(W / 2, 0.225, 0.003));
    strip(D, 0.45, s.wallL, m => { m.rotation.y = Math.PI / 2; m.position.set(0.003, 0.225, D / 2); });
    strip(W, 0.4, s.wallB, m => { m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI; m.position.set(W / 2, 0.002, 0.2); });
    strip(D, 0.4, s.wallL, m => { m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); m.position.set(0.2, 0.002, D / 2); });
    strip(H, 0.35, s.wallB, m => { m.rotation.z = -Math.PI / 2; m.position.set(0.175, H / 2, 0.003); });
    strip(H, 0.35, s.wallL, m => { m.rotation.set(0, Math.PI / 2, Math.PI / 2); m.position.set(0.003, H / 2, 0.175); });
  }

  // Walls between the camera and the room fade out of the way, so the room turns all the way round
  function cutaway(s) {
    const c = s.camera.position, hb = c.z < -0.2, hl = c.x < -0.2;
    if (hb !== s.hidB) { s.hidB = hb; s.wallB.forEach(o => { o.visible = !hb; }); }
    if (hl !== s.hidL) { s.hidL = hl; s.wallL.forEach(o => { o.visible = !hl; }); }
    for (const p of s.items) if (p.wall && p.obj) p.obj.visible = !(p.wall === 'back' ? hb : hl);
    if (s.shellMats) for (const m of s.shellMats) if (m.userData.tick) m.userData.tick(m, s.t);
    if (s.view) s.view.tick(s.t);
  }

  // Grid, footprint marker and selection brackets
  // Floor and wall grids for the current room size
  function buildGrids(s) {
    const { THREE, scene } = s;
    const vis = s.grid ? [s.grid.visible, s.wallGrid.visible] : [false, false];
    for (const o of [s.grid, s.wallGrid]) if (o) { scene.remove(o); o.geometry.dispose(); }
    const lm = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.09, depthWrite: false, toneMapped: false });
    const pts = [];
    for (let x = 0; x <= W + 1e-6; x += CELL()) pts.push(x, 0.003, 0, x, 0.003, D);
    for (let z = 0; z <= D + 1e-6; z += CELL()) pts.push(0, 0.003, z, W, 0.003, z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    s.grid = new THREE.LineSegments(g, lm); scene.add(s.grid);
    const wp = [];
    for (let x = 0; x <= W + 1e-6; x += CELL()) wp.push(x, 0, 0.003, x, H, 0.003);
    for (let y = 0; y <= H + 1e-6; y += CELL()) wp.push(0, y, 0.003, W, y, 0.003, 0.003, y, 0, 0.003, y, D);
    for (let z = 0; z <= D + 1e-6; z += CELL()) wp.push(0.003, 0, z, 0.003, H, z);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    s.wallGrid = new THREE.LineSegments(wg, lm.clone()); s.wallGrid.material.opacity = 0.1; s.wallGrid.visible = false; scene.add(s.wallGrid);
    [s.grid.visible, s.wallGrid.visible] = vis;
  }

  function buildHelpers(s) {
    const { THREE, K, scene } = s;

    const ftex = K.canvasTex('footprint', 128, 128, (c, w, h) => {
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#fff'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    });
    s.marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ftex, color: GREEN, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
    s.marker.visible = false; s.marker.renderOrder = 5; scene.add(s.marker);

    s.brackets = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: GREEN, depthTest: false, transparent: true, toneMapped: false }));
    s.brackets.renderOrder = 10; s.brackets.visible = false; scene.add(s.brackets);

    s.ghostOk = new THREE.MeshStandardMaterial({ color: GREEN, emissive: GREEN, emissiveIntensity: 0.35, transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.5 });
    s.ghostBad = new THREE.MeshStandardMaterial({ color: '#ff4d5e', emissive: '#ff4d5e', emissiveIntensity: 0.35, transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.5 });
  }

  function showMarker(s, p, ok) {
    const b = box(p), m = s.marker;
    m.visible = true;
    m.material.color.set(ok ? GREEN : '#ff4d5e');
    if (p.wall === 'back') { m.rotation.set(0, 0, 0); m.scale.set(b.x1 - b.x0, b.y1 - b.y0, 1); m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0.004); }
    else if (p.wall === 'left') { m.rotation.set(0, Math.PI / 2, 0); m.scale.set(b.z1 - b.z0, b.y1 - b.y0, 1); m.position.set(0.004, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); }
    else { m.rotation.set(-Math.PI / 2, 0, 0); m.scale.set(b.x1 - b.x0, b.z1 - b.z0, 1); m.position.set((b.x0 + b.x1) / 2, b.y0 + 0.004, (b.z0 + b.z1) / 2); }
  }
  function showBrackets(s, p, ok = true) {
    if (!p) { s.brackets.visible = false; return; }
    const b = box(p), pad = 0.02;
    const x = [b.x0 - pad, b.x1 + pad], y = [b.y0, b.y1 + pad], z = [b.z0 - pad, b.z1 + pad];
    const L = [(x[1] - x[0]) * 0.22, (y[1] - y[0]) * 0.22, (z[1] - z[0]) * 0.22];
    const v = [];
    for (let i = 0; i < 8; i++) {
      const cx = x[i & 1], cy = y[(i >> 1) & 1], cz = z[(i >> 2) & 1];
      const sx = i & 1 ? -1 : 1, sy = (i >> 1) & 1 ? -1 : 1, sz = (i >> 2) & 1 ? -1 : 1;
      v.push(cx, cy, cz, cx + sx * L[0], cy, cz, cx, cy, cz, cx, cy + sy * L[1], cz, cx, cy, cz, cx, cy, cz + sz * L[2]);
    }
    s.brackets.geometry.dispose();
    s.brackets.geometry = new s.THREE.BufferGeometry();
    s.brackets.geometry.setAttribute('position', new s.THREE.Float32BufferAttribute(v, 3));
    s.brackets.material.color.set(ok ? GREEN : '#ff4d5e');
    s.brackets.visible = true;
  }

  // ---------------------------------------------------------------- items in the scene
  // A soft dark patch under each item (or behind a wall item), since the renderer has no ambient
  // occlusion: it sits things on the floor instead of floating over it
  function contactTex(s) {
    return s.K.canvasTex('contact', 128, 128, (c, w, h) => {
      c.filter = 'blur(12px)'; c.fillStyle = 'rgba(0,0,0,1)';
      c.beginPath(); c.roundRect(28, 28, w - 56, h - 56, 18); c.fill();
    });
  }
  function contact(s, p, model) {
    const d = def(p.id), dm = RoomItems.dims(p.id);
    if (!dm || d.rug) return null;
    const THREE = s.THREE, b = dm.box;
    const m = s.contactMat || (s.contactMat = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: contactTex(s), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const k = 128 / 72;   // the canvas is 128 px, the dark core about 72 px
    const sh = new THREE.Mesh(s.contactGeo || (s.contactGeo = new THREE.PlaneGeometry(1, 1)), m);
    if (p.wall) { sh.scale.set((b.max.x - b.min.x) * k, (b.max.y - b.min.y) * k * 0.9, 1); sh.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2 - 0.02, 0.002); sh.material = s.contactWall || (s.contactWall = Object.assign(m.clone(), { opacity: 0.32 })); }
    else { sh.rotation.x = -Math.PI / 2; sh.scale.set((b.max.x - b.min.x) * k * 0.95, (b.max.z - b.min.z) * k * 0.95, 1); sh.position.set((b.min.x + b.max.x) / 2, 0.003, (b.min.z + b.max.z) / 2); }
    sh.userData.contact = true; sh.raycast = () => {};
    return sh;
  }
  function place(s, p) {
    const wrap = new s.THREE.Group();
    const model = RoomItems.create(p.id);
    wrap.add(model);
    const sh = contact(s, p, model); if (sh) wrap.add(sh);
    wrap.userData.place = p;
    p.obj = wrap; p.model = model;
    s.itemsRoot.add(wrap);
    pose(p);
    s.items.push(p);
    return p;
  }
  function pose(p, obj = p.obj) {
    if (p.wall === 'back') { obj.position.set(p.x, p.y, 0); obj.rotation.set(0, 0, 0); }
    else if (p.wall === 'left') { obj.position.set(0, p.y, p.z); obj.rotation.set(0, Math.PI / 2, 0); }
    else { obj.position.set(p.x, p.y, p.z); obj.rotation.set(0, p.rot * Math.PI / 2, 0); }
  }
  function remove(s, p) {
    s.itemsRoot.remove(p.obj);
    s.items = s.items.filter(q => q !== p);
  }
  function setLayout(s, list) {
    for (const p of [...s.items]) remove(s, p);
    for (const q of list) place(s, { id: q.id, x: q.x, y: q.y, z: q.z, rot: q.rot || 0, wall: q.wall || null });
    limitLights(s);
  }
  // Keep the number of item lights low so phones keep up
  function limitLights(s) {
    const lights = [];
    for (const p of s.items) p.obj.traverse(o => { if (o.isPointLight) lights.push(o); });
    lights.sort((a, b) => b.intensity - a.intensity);
    lights.forEach((l, i) => { l.visible = i < (s.phone ? 2 : 4); });   // every light costs every pixel
  }
  const serialize = s => ({ v: 1, size: s.size.id, paper: s.paper || undefined, floor: s.floorF || undefined, view: s.viewF || undefined, items: s.items.map(p => ({ id: p.id, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), rot: p.rot, wall: p.wall })) });

  // Light bouncing off the room's own walls, floor and furniture: a cube picture of the room taken from
  // its middle becomes the environment, so a red brick room glows warm and the mirror shows the room.
  // Taken again a moment after anything changes.
  function captureEnv(s, now) {
    clearTimeout(s.envT);
    if (!now) { s.envT = setTimeout(() => captureEnv(s, true), 700); return; }
    if (!s.alive || !s.renderer || !s.hd) return;
    const THREE = s.THREE;
    if (!s.cubeRT) { s.cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }); s.cubeCam = new THREE.CubeCamera(0.05, 40, s.cubeRT); }
    s.cubeCam.position.set(W / 2, 1.2, D / 2);
    const hid = [s.marker, s.brackets, s.grid, s.wallGrid].filter(o => o && o.visible); hid.forEach(o => { o.visible = false; });
    const walls = [...(s.wallB || []), ...(s.wallL || [])]; walls.forEach(o => { o.userData.v = o.visible; o.visible = true; });
    s.scene.environment = s.roomEnv; s.scene.environmentIntensity = 0.16;
    s.cubeCam.update(s.renderer, s.scene);
    hid.forEach(o => { o.visible = true; }); walls.forEach(o => { o.visible = o.userData.v; });
    if (s.envMap) s.envMap.dispose();
    s.envMap = s.pmrem.fromCubemap(s.cubeRT.texture).texture;
    s.scene.environment = s.envMap; s.scene.environmentIntensity = 0.55;
  }
  function markDirty(s) {
    captureEnv(s);
    s.shadowNow = 2;
    s.dirty = true;
    s.ui.dot.hidden = false;
    renderStrip(s);
  }
  // Status line. Messages fade after 5 s unless keep is set.
  function say(s, text, keep = false) {
    s.ui.status.textContent = text;
    s.ui.status.classList.toggle('on', !!text);
    clearTimeout(s.sayT);
    if (text && !keep) s.sayT = setTimeout(() => { if (s.ui.status.textContent === text) { s.ui.status.textContent = ''; s.ui.status.classList.remove('on'); } }, 5000);
  }

  // ---------------------------------------------------------------- pointer
  function rayFrom(s, e) {
    const r = s.renderer.domElement.getBoundingClientRect();
    s.ndc = s.ndc || new s.THREE.Vector2();
    s.ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    s.ray = s.ray || new s.THREE.Raycaster();
    s.ray.setFromCamera(s.ndc, s.camera);
    return s.ray;
  }
  function pickItem(s, e) {
    const ray = rayFrom(s, e);
    const hits = ray.intersectObjects(s.items.map(p => p.obj), true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.place) o = o.parent;
      if (o && s.items.includes(o.userData.place)) return o.userData.place;
    }
    return null;
  }
  // Where would item `id` go under the pointer?
  function candidate(s, e, id, rot, moving = []) {
    const ray = rayFrom(s, e).ray;
    const d = def(id), h = height(id);
    if (d.wall) {
      let best = null;
      if (ray.direction.z < -1e-4) {
        const t = -ray.origin.z / ray.direction.z, p = ray.at(t, new s.THREE.Vector3());
        if (p.x >= -0.2 && p.x <= W + 0.2 && p.y >= -0.2 && p.y <= H + 0.2) best = { t, p: { id, wall: 'back', x: p.x, y: p.y - h / 2, z: 0, rot: 0 } };
      }
      if (ray.direction.x < -1e-4) {
        const t = -ray.origin.x / ray.direction.x, p = ray.at(t, new s.THREE.Vector3());
        if (p.z >= -0.2 && p.z <= D + 0.2 && p.y >= -0.2 && p.y <= H + 0.2 && (!best || t < best.t)) best = { t, p: { id, wall: 'left', x: 0, y: p.y - h / 2, z: p.z, rot: 0 } };
      }
      return best ? snap(best.p) : null;
    }
    let best = null;
    if (d.surface) {
      for (const sp of s.items) {
        if (!def(sp.id).top || moving.includes(sp)) continue;
        const top = sp.y + def(sp.id).top;
        if (Math.abs(ray.direction.y) < 1e-4) continue;
        const t = (top - ray.origin.y) / ray.direction.y;
        if (t <= 0 || (best && t > best.t)) continue;
        const p = ray.at(t, new s.THREE.Vector3()), b = box(sp);
        if (p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1) best = { t, p: { id, x: p.x, z: p.z, y: top, rot, wall: null, on: sp } };
      }
    }
    if (!best) {
      if (ray.direction.y >= -1e-4) return null;
      const t = -ray.origin.y / ray.direction.y, p = ray.at(t, new s.THREE.Vector3());
      best = { p: { id, x: p.x, z: p.z, y: 0, rot, wall: null } };
    }
    const q = snap(best.p);
    delete q.on;
    return q;
  }

  function wirePointer(s) {
    const cv = s.renderer.domElement;
    let down = null;
    const onDown = e => {
      if (!e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY, type: e.pointerType, drag: false };
      if (s.mode !== 'edit' || s.placing) return;
      const p = pickItem(s, e);
      if (p && p === s.sel) {
        // drag the selected item
        s.controls.enabled = false;
        down.drag = true;
        startMove(s, p, true);
      }
    };
    const onMove = e => {
      if (!e.isPrimary) return;
      s.lastPointer = e;
      if (s.placing && (e.pointerType === 'mouse' || (down && down.drag))) aim(s, e);
      else if (s.mode === 'edit' && e.pointerType === 'mouse' && !down) cv.style.cursor = pickItem(s, e) ? 'pointer' : '';
    };
    const onUp = e => {
      if (!e.isPrimary || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const wasDrag = down.drag;
      down = null;
      s.controls.enabled = true;
      if (wasDrag) {
        if (moved < 6) { cancelPlacing(s, true); return; }
        commit(s, true);
        return;
      }
      if (moved > 6) return;
      tap(s, e);
    };
    cv.addEventListener('pointerdown', onDown, true);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    s.off.push(() => window.removeEventListener('pointerup', onUp), () => window.removeEventListener('pointercancel', onUp));

    const onKey = e => {
      if (!S || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === 'r' || e.key === 'R') { if (s.placing || s.sel) { e.preventDefault(); rotate(s); } }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (s.sel && !s.placing) { e.preventDefault(); del(s); } }
      else if (e.key === 'Escape') {
        if (s.placing) cancelPlacing(s);
        else if (s.popKind) closePop(s);
        else if (s.sel) select(s, null);
        else if (s.mode === 'edit') setMode(s, 'view');
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    s.off.push(() => window.removeEventListener('keydown', onKey));
  }

  function tap(s, e) {
    if (s.placing) {
      aim(s, e);
      if (e.pointerType === 'mouse') commit(s);
      return;
    }
    const p = pickItem(s, e);
    if (s.mode !== 'edit') {
      say(s, p ? def(p.id).name : '');
      return;
    }
    select(s, p);
  }

  function select(s, p) {
    s.sel = p;
    showBrackets(s, p);
    syncTools(s);
    if (p) say(s, `${def(p.id).name} selected. Drag it or use Move, Rotate and Delete.`);
    else say(s, '');
    renderStrip(s);
  }

  // ---------------------------------------------------------------- placing and moving
  // s.placing = { id, rot, p (existing placement or null), ghost, cand, ok, group, orig }
  function startPlace(s, id) {
    if (special(def(id))) return;
    if (s.placing) cancelPlacing(s);
    if (s.mode !== 'edit') setMode(s, 'edit');
    select(s, null);
    const ghost = RoomItems.create(id);
    ghost.traverse(o => {
      if (o.isLight) o.visible = false;
      if (o.isMesh) { o.material = s.ghostOk; o.castShadow = false; }
    });
    ghost.visible = false;
    s.scene.add(ghost);
    s.placing = { id, rot: 0, p: null, ghost, cand: null, ok: false };
    if (def(id).wall) s.wallGrid.visible = true;
    syncTools(s);
    const name = noun(id);
    const where = def(id).wall ? 'a wall' : def(id).surface ? 'a desk, a shelf or the floor' : 'the floor';
    say(s, s.phone ? `Tap ${where} to put the ${name} there, then press Place.` : `Click ${where} to place the ${name}. R turns it and Esc cancels.`, true);
    // start somewhere sensible so touch players see the ghost at once
    const spot = firstSpot(s, id);
    if (spot) setCand(s, spot);
    else if (s.lastPointer && s.lastPointer.pointerType === 'mouse') aim(s, s.lastPointer);
  }
  function startMove(s, p, dragging = false) {
    if (s.placing) cancelPlacing(s);
    const group = [p, ...childrenOf(p, s.items)];
    s.placing = { id: p.id, rot: p.rot, p, group, orig: group.map(q => ({ q, x: q.x, y: q.y, z: q.z, rot: q.rot, wall: q.wall })), cand: { ...p }, ok: true };
    if (def(p.id).wall) s.wallGrid.visible = true;
    syncTools(s);
    if (!dragging) say(s, s.phone ? `Tap where the ${noun(p.id)} goes, then press Place.` : `Click where the ${noun(p.id)} goes. R turns it and Esc cancels.`, true);
    showMarker(s, p, true);
  }
  function aim(s, e) {
    const P = s.placing;
    const c = candidate(s, e, P.id, P.rot, P.group || []);
    if (c) setCand(s, c);
  }
  function setCand(s, c) {
    const P = s.placing;
    c.rot = def(c.id).wall ? 0 : P.rot;
    P.cand = c;
    if (P.p) {
      // move the real item and whatever sits on it
      const base = P.orig[0];
      const k = ((c.rot - base.rot) % 4 + 4) % 4;
      for (const o of P.orig) {
        if (o.q === P.p) Object.assign(o.q, { x: c.x, y: c.y, z: c.z, rot: c.rot, wall: c.wall });
        else {
          let dx = o.x - base.x, dz = o.z - base.z;
          for (let i = 0; i < k; i++) [dx, dz] = [dz, -dx];
          Object.assign(o.q, { x: c.x + dx, y: o.y - base.y + c.y, z: c.z + dz, rot: (o.rot + k) % 4 });
        }
        pose(o.q);
      }
      // the item clears everything outside its group, and each child still sits on it
      P.ok = fits(P.p, s.items, P.group.slice(1)) && P.group.slice(1).every(q => fits(q, s.items, P.group.filter(g => g !== q && g !== P.p)));
      showBrackets(s, P.p, P.ok);
    } else {
      P.ghost.visible = true;
      pose(c, P.ghost);
      P.ok = fits(c, s.items);
      const m = P.ok ? s.ghostOk : s.ghostBad;
      P.ghost.traverse(o => { if (o.isMesh) o.material = m; });
    }
    showMarker(s, c, P.ok);
  }
  function commit(s, fromDrag = false) {
    const P = s.placing;
    if (!P || !P.cand) return;
    if (!P.ok) {
      say(s, `The ${noun(P.id)} doesn't fit there.`);
      if (P.p && fromDrag) cancelPlacing(s, true);
      return;
    }
    if (P.p) {
      endPlacing(s);
      select(s, P.p);
      say(s, `${def(P.p.id).name} moved.`);
    } else {
      endPlacing(s);
      const p = place(s, { id: P.id, x: P.cand.x, y: P.cand.y, z: P.cand.z, rot: P.cand.rot, wall: P.cand.wall });
      limitLights(s);
      select(s, p);
      say(s, `${def(p.id).name} placed. Press Save room to keep it.`);
    }
    markDirty(s);
  }
  function cancelPlacing(s, quiet) {
    const P = s.placing;
    if (!P) return;
    if (P.p) { for (const o of P.orig) { Object.assign(o.q, { x: o.x, y: o.y, z: o.z, rot: o.rot, wall: o.wall }); pose(o.q); } showBrackets(s, P.p); }
    endPlacing(s);
    if (!quiet) say(s, '');
  }
  function endPlacing(s) {
    const P = s.placing;
    if (P && P.ghost) s.scene.remove(P.ghost);
    s.placing = null;
    s.marker.visible = false;
    s.wallGrid.visible = false;
    syncTools(s);
  }
  // First free spot for an item: desks and shelves first for small items, then the floor or a wall
  function firstSpot(s, id) {
    const d = def(id);
    const tryP = p => { snap(p); delete p.on; return fits(p, s.items) ? p : null; };
    if (d.wall) {
      for (const [wall, len] of [['back', W], ['left', D]]) for (const y of [1.5, 1.1, 1.9, 0.7, 2.3]) for (let a = len / 2, i = 0; i < 40; i++, a = len / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * CELL()) {
        if (a < 0 || a > len) continue;
        const r = tryP(wall === 'back' ? { id, wall, x: a, y, z: 0, rot: 0 } : { id, wall, x: 0, y, z: a, rot: 0 });
        if (r) return r;
      }
      return null;
    }
    if (d.surface) {
      for (const sp of s.items) {
        if (!def(sp.id).top) continue;
        const b = box(sp);
        for (let fz = 0; fz <= 4; fz++) for (let fx = 0; fx <= 8; fx++) {
          const r = tryP({ id, x: b.x0 + (b.x1 - b.x0) * (0.5 + (fx % 2 ? 1 : -1) * Math.ceil(fx / 2) / 9), z: b.z0 + (b.z1 - b.z0) * (0.5 + (fz % 2 ? 1 : -1) * Math.ceil(fz / 2) / 5), y: sp.y + def(sp.id).top, rot: sp.rot, wall: null, on: sp });
          if (r) return r;
        }
      }
    }
    for (let r = 0; r < 12; r++) for (let a = 0; a < 16; a++) {
      const p = tryP({ id, x: W * 0.55 + Math.cos(a / 16 * Math.PI * 2) * r * CELL(), z: D * 0.6 + Math.sin(a / 16 * Math.PI * 2) * r * CELL(), y: 0, rot: 0, wall: null });
      if (p) return p;
    }
    return null;
  }

  function rotate(s) {
    const P = s.placing;
    if (P) {
      if (def(P.id).wall) return;
      P.rot = (P.rot + 1) % 4;
      const c = { ...P.cand, rot: P.rot };
      if (!P.p && c.y > 0) c.on = s.items.find(sp => def(sp.id).top && Math.abs(sp.y + def(sp.id).top - c.y) < 0.003 && (() => { const b = box(sp); return c.x >= b.x0 && c.x <= b.x1 && c.z >= b.z0 && c.z <= b.z1; })());
      if (P.p && c.y > 0) c.on = supportOf(P.p, s.items.filter(q => !P.group.includes(q)).concat([P.p])) || null;
      snap(c); delete c.on;
      setCand(s, c);
      return;
    }
    const p = s.sel;
    if (!p) return;
    if (def(p.id).wall) { say(s, 'Wall items can\'t be turned.'); return; }
    startMove(s, p, true);
    s.placing.rot = (p.rot + 1) % 4;
    const c = { ...p, rot: s.placing.rot };
    if (p.y > 0) c.on = supportOf(p, s.items);
    snap(c); delete c.on;
    setCand(s, c);
    if (s.placing.ok) { commit(s); say(s, `${def(p.id).name} turned.`); }
    else { cancelPlacing(s, true); say(s, `There is no room to turn the ${noun(p.id)} here.`); }
  }
  function del(s) {
    const p = s.sel;
    if (!p) return;
    const kids = childrenOf(p, s.items);
    [p, ...kids].forEach(q => remove(s, q));
    select(s, null);
    limitLights(s);
    markDirty(s);
    say(s, kids.length ? `The ${noun(p.id)} and the ${kids.length} item${kids.length > 1 ? 's' : ''} on it are back in your inventory.` : `${def(p.id).name} is back in your inventory.`);
  }

  // ---------------------------------------------------------------- UI
  function setMode(s, mode) {
    if (mode === s.mode) return;
    if (s.placing) cancelPlacing(s, true);
    s.mode = mode;
    s.root.dataset.mode = mode;
    s.ui.dock.hidden = mode !== 'edit';
    s.grid.visible = mode === 'edit';
    const b = s.root.querySelector('[data-act="edit"]');
    b.setAttribute('aria-pressed', mode === 'edit');
    b.querySelector('span').textContent = mode === 'edit' ? 'Done editing' : 'Edit room';
    if (mode !== 'edit') select(s, null);
    else say(s, s.phone ? 'Tap an item to select it or pick one from the bar to add it.' : 'Click an item to select it or pick one from the bar to add it.');
    resize(s);
  }
  function syncTools(s) {
    const t = n => s.root.querySelector(`[data-tool="${n}"]`);
    const P = s.placing;
    t('move').hidden = t('delete').hidden = !!P;
    t('place').hidden = t('cancel').hidden = !P;
    t('move').disabled = t('delete').disabled = !s.sel;
    t('rotate').disabled = !(P ? !def(P.id).wall : s.sel && !def(s.sel.id).wall);
    t('move').classList.toggle('on', !!(P && P.p));
  }
  function buildTabs(s) {
    const cats = ['All', ...RoomItems.categories.filter(c => !['Room size', 'Walls', 'Floors', 'Windows'].includes(c))];
    s.ui.tabs.innerHTML = cats.map(c => `<button type="button" role="tab" data-cat="${esc(c)}" aria-selected="${c === s.cat}">${c === 'All' ? svg('grid') : ''}<span>${esc(c)}</span></button>`).join('');
  }
  function renderStrip(s) {
    if (!s.ui) return;
    const owned = WPM.owned().map(def).filter(d => d && !special(d));
    const inRoom = new Set(s.items.map(p => p.id));
    const list = owned.filter(d => s.cat === 'All' || d.category === s.cat);
    const more = RoomItems.catalog.filter(d => !special(d) && !d.gift && !WPM.owns(d.id) && (s.cat === 'All' || d.category === s.cat)).length;
    s.ui.strip.innerHTML = list.map(d => `
      <button type="button" class="rm-card${s.sel && s.sel.id === d.id ? ' on' : ''}" data-id="${d.id}" aria-label="${esc(d.name)}${inRoom.has(d.id) ? ', in room' : ''}">
        <span class="rm-thumb"><img alt="" data-thumb="${d.id}"></span>
        <span class="rm-name">${esc(d.name)}</span>
        ${inRoom.has(d.id) ? '<em>In room</em>' : ''}
      </button>`).join('') + `
      <a class="rm-card rm-shop" href="#/shop">
        <span class="rm-thumb">${svg('cart')}</span>
        <span class="rm-name">Shop</span>
        <em>${more ? `${more} more item${more > 1 ? 's' : ''}` : 'All owned'}</em>
      </a>`;
    fillThumbs(s, s.ui.strip);
  }
  function fillThumbs(s, scope) {
    scope.querySelectorAll('img[data-thumb]').forEach(img => {
      RoomItems.thumbnail(img.dataset.thumb).then(url => { if (img.isConnected) img.src = url; }, () => {});
    });
  }
  function openPop(s, kind) {
    s.popKind = kind;
    const pop = s.ui.pop;
    pop.hidden = false;
    s.root.querySelectorAll('[data-act="inventory"],[data-act="presets"],[data-tool="size"]').forEach(b => b.setAttribute('aria-expanded', (b.dataset.act || b.dataset.tool) === kind));
    const owned = WPM.owned().map(def).filter(d => d && !special(d));
    const inRoom = new Set(s.items.map(p => p.id));
    if (kind === 'size') {
      const big = sizes()[sizes().length - 1];
      pop.innerHTML = `
        <header><h3>// ROOM</h3><button type="button" class="rm-close" data-act="close" aria-label="Close">${svg('x')}</button></header>
        <p class="rm-hint">Items that don't fit a smaller size go back to your inventory.</p>
        <ul class="rm-sizes">${sizes().map(z => {
          const own = sizeOwned(z), cur = z.id === s.size.id;
          const btn = cur ? '<span class="rm-sm rm-cur">In use</span>'
            : own ? `<button type="button" class="rm-sm rm-go" data-size="${z.id}">Use</button>`
            : `<a class="rm-sm rm-buy" href="#/shop">${z.price.toLocaleString('en-US')} coins</a>`;
          return `<li class="${cur ? 'on' : ''}${own ? '' : ' locked'}">
            <span class="rm-plan" aria-hidden="true"><i style="width:${Math.round(z.w / big.w * 100)}%;height:${Math.round(z.d / big.d * 100)}%"></i></span>
            <span class="rm-inv-txt"><b>${esc(z.name)}</b><small>${z.w} × ${z.d} m, ${z.area} m²</small></span>${btn}</li>`;
        }).join('')}</ul>
        ${['view', 'wall', 'floor'].map(k => `<h4 class="rm-sub">${{ view: 'Window', wall: 'Walls', floor: 'Floor' }[k]}</h4>
        <ul class="rm-fin">${RoomItems.finishes(k).map(d => {
          const own = finishOwned(d), cur = d.id === ((k === 'wall' ? s.paper : k === 'floor' ? s.floorF : s.viewF) || { wall: 'wall-plaster', floor: 'floor-oak', view: 'view-city' }[k]);
          return `<li class="${cur ? 'on' : ''}${own ? '' : ' locked'}"><button type="button" ${own ? `data-finish="${d.id}"` : 'data-shopfin="1"'} aria-pressed="${cur}" title="${esc(d.name)}">
            <span class="rm-thumb"><img alt="" data-thumb="${d.id}"></span><b>${esc(d.name)}</b><small>${cur ? 'In use' : own ? 'Use' : `${d.price.toLocaleString('en-US')} coins`}</small></button></li>`;
        }).join('')}</ul>`).join('')}`;
      fillThumbs(s, pop);
      return;
    }
    if (kind === 'inventory') {
      const more = RoomItems.catalog.filter(d => !special(d) && !d.gift && !WPM.owns(d.id)).length;
      pop.innerHTML = `
        <header><h3>// INVENTORY</h3><button type="button" class="rm-close" data-act="close" aria-label="Close">${svg('x')}</button></header>
        <p class="rm-hint">You own ${owned.length} item${owned.length > 1 ? 's' : ''} and ${owned.filter(d => inRoom.has(d.id)).length} are in the room.</p>
        <ul class="rm-inv">${owned.map(d => `
          <li><span class="rm-thumb"><img alt="" data-thumb="${d.id}"></span>
            <span class="rm-inv-txt"><b>${esc(d.name)}</b><small>${esc(d.category)}</small></span>
            ${inRoom.has(d.id) ? `<button type="button" class="rm-sm" data-find="${d.id}">In room</button>` : `<button type="button" class="rm-sm rm-go" data-place="${d.id}">Place</button>`}
          </li>`).join('')}</ul>
        <a class="rm-shoplink" href="#/shop">${svg('cart')}<span>${more ? `The shop has ${more} more item${more > 1 ? 's' : ''}` : 'Shop'}</span></a>`;
      fillThumbs(s, pop);
    } else {
      pop.innerHTML = `
        <header><h3>// ROOM PRESETS</h3><button type="button" class="rm-close" data-act="close" aria-label="Close">${svg('x')}</button></header>
        <p class="rm-hint">A preset clears the room and lays out the items you own.</p>
        <ul class="rm-presets">${PRESETS.map(p => {
          const n = presetLayout(p, new Set(owned.map(d => d.id))).length;
          return `<li><b>${esc(p.name)}</b><p>${esc(p.text)}</p><div><small>Uses ${n} of your ${owned.length} items</small><button type="button" class="rm-sm rm-go" data-preset="${p.id}">Apply</button></div></li>`;
        }).join('')}</ul>`;
    }
  }
  function closePop(s) {
    s.popKind = null;
    s.ui.pop.hidden = true;
    s.root.querySelectorAll('[aria-expanded]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  function wireUI(s) {
    const root = s.root;
    root.addEventListener('click', e => {
      const b = e.target.closest('button, a');
      if (!b || !root.contains(b)) return;
      const act = b.dataset.act, tool = b.dataset.tool;
      if (act === 'edit') { closePop(s); setMode(s, s.mode === 'edit' ? 'view' : 'edit'); }
      else if (act === 'inventory' || act === 'presets') { if (s.popKind === act) closePop(s); else openPop(s, act); }
      else if (act === 'close') closePop(s);
      else if (act === 'save') {
        if (s.placing) cancelPlacing(s, true);
        WPM.setRoom(serialize(s));
        s.dirty = false; s.ui.dot.hidden = true;
        say(s, 'Room saved.');
      }
      else if (tool === 'move') { if (s.sel) startMove(s, s.sel); }
      else if (tool === 'rotate') rotate(s);
      else if (tool === 'delete') del(s);
      else if (tool === 'size') { if (s.placing) cancelPlacing(s, true); if (s.popKind === 'size') closePop(s); else openPop(s, 'size'); }
      else if (b.dataset.size) { setRoomSize(s, b.dataset.size); openPop(s, 'size'); }
      else if (b.dataset.finish) { setFinish(s, b.dataset.finish); openPop(s, 'size'); }
      else if (b.dataset.shopfin) location.hash = '#/shop';
      else if (tool === 'place') commit(s);
      else if (tool === 'cancel') { cancelPlacing(s); }
      else if (b.dataset.cat) {
        s.cat = b.dataset.cat;
        s.ui.tabs.querySelectorAll('[data-cat]').forEach(t => t.setAttribute('aria-selected', t === b));
        renderStrip(s);
      }
      else if (b.dataset.scroll) s.ui.strip.scrollBy({ left: +b.dataset.scroll * s.ui.strip.clientWidth * 0.8, behavior: 'smooth' });
      else if (b.dataset.id || b.dataset.place || b.dataset.find) {
        const id = b.dataset.id || b.dataset.place || b.dataset.find;
        const p = s.items.find(q => q.id === id);
        if (b.dataset.place || b.dataset.find) closePop(s);
        if (p) { if (s.mode !== 'edit') setMode(s, 'edit'); if (s.placing) cancelPlacing(s, true); select(s, p); }
        else startPlace(s, id);
      }
      else if (b.dataset.preset) {
        const pr = PRESETS.find(p => p.id === b.dataset.preset);
        if (s.placing) cancelPlacing(s, true);
        select(s, null);
        setLayout(s, presetLayout(pr, new Set(WPM.owned())));
        closePop(s);
        markDirty(s);
        say(s, `${pr.name} applied. Press Save room to keep it.`);
      }
    });
  }

  // ---------------------------------------------------------------- walls and floor
  function setFinish(s, id) {
    const d = def(id);
    if (!d || !d.finish || !finishOwned(d)) return;
    const key = { wall: 'paper', floor: 'floorF', view: 'viewF' }[d.finish.kind];
    if ((s[key] || null) === (d.base ? null : d.id)) return;
    s[key] = d.base ? null : d.id;
    s.scene.remove(s.shell);
    s.shell.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    buildShell(s, s.phone);
    markDirty(s);
    say(s, `${d.name}. Press Save room to keep it.`);
  }

  // ---------------------------------------------------------------- room size
  function setRoomSize(s, id) {
    const z = sizes().find(q => q.id === id);
    if (!z || z.id === s.size.id || !sizeOwned(z)) return;
    if (s.placing) cancelPlacing(s, true);
    select(s, null);
    const before = s.items.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, rot: p.rot, wall: p.wall }));
    const old = { w: W, d: D, h: H };
    s.size = z;
    setDims(z);
    s.scene.remove(s.shell);
    s.shell.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    buildShell(s, s.phone);
    buildGrids(s);
    s.controls.target.set(W / 2, 0.85, D / 2);
    const keep = mapLayout(before, old, z);
    setLayout(s, keep);
    resize(s, true);
    markDirty(s);
    const lost = before.length - keep.length;
    say(s, lost ? `${z.name}. ${lost} item${lost > 1 ? 's' : ''} didn't fit and went back to your inventory.` : `${z.name}. Press Save room to keep it.`);
  }

  // ---------------------------------------------------------------- sizing
  function resize(s, first) {
    if (!s.renderer || !s.alive) return;
    const r = s.root.getBoundingClientRect();
    const w = Math.max(1, r.width | 0), h = Math.max(1, r.height | 0);
    const pr = s.baseRatio * (s.res || 1);
    if (s.renderer.getPixelRatio() !== pr) { s.renderer.setPixelRatio(pr); s.composer.setPixelRatio(pr); }
    s.renderer.setSize(w, h, false);
    s.composer.setSize(w, h);
    s.bloom.resolution.set(w / 2, h / 2);
    const cam = s.camera;
    cam.aspect = w / h;
    // keep the room centred in the space the panels leave free
    const narrow = w < 720;
    const menu = s.ui.menu.getBoundingClientRect(), dock = s.ui.dock.hidden ? null : s.ui.dock.getBoundingClientRect();
    const left = narrow ? 0 : Math.max(0, menu.right - r.left);
    const top = narrow ? Math.max(0, menu.bottom - r.top) : 0;
    const bottom = dock ? Math.max(0, r.bottom - dock.top) : 0;
    const fw = Math.max(80, w - left), fh = Math.max(80, h - top - bottom);
    cam.setViewOffset(w, h, -left / 2, (bottom - top) / 2, w, h);
    cam.updateProjectionMatrix();
    const pad = narrow ? 8 : 24;
    const free = { x0: left + pad, x1: w - pad, y0: top + pad, y1: h - bottom - pad };
    const dir = first ? new s.THREE.Vector3(Math.sin(0.98) * Math.sin(Math.PI / 4 + 0.05), Math.cos(0.98), Math.sin(0.98) * Math.cos(Math.PI / 4 + 0.05))
      : cam.position.clone().sub(s.controls.target).normalize();
    const dist = fitDistance(s, dir, free, w, h);
    s.controls.minDistance = dist * 0.45;
    s.controls.maxDistance = dist * 1.5;
    s.fit = dist;
    cam.near = Math.max(0.3, dist * 0.03); cam.far = dist * 3; cam.updateProjectionMatrix();
    if (first) {
      cam.position.copy(s.controls.target).addScaledVector(dir, dist);
    } else {
      const off = cam.position.clone().sub(s.controls.target);
      off.setLength(Math.min(s.controls.maxDistance, Math.max(s.controls.minDistance, off.length())));
      if (Math.abs(off.length() - dist) / dist < 0.4) off.setLength(dist);
      cam.position.copy(s.controls.target).add(off);
    }
    s.controls.update();
  }

  // Smallest camera distance that keeps every corner of the room inside the free area
  function fitDistance(s, dir, free, w, h) {
    const cam = s.camera, tgt = s.controls.target, v = new s.THREE.Vector3();
    const xs = [-T, W], ys = [-0.252, H], zs = [-T, D];
    const inside = d => {
      cam.position.copy(tgt).addScaledVector(dir, d);
      cam.lookAt(tgt); cam.updateMatrixWorld();
      for (const x of xs) for (const y of ys) for (const z of zs) {
        v.set(x, y, z).project(cam);
        const px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h;
        if (px < free.x0 || px > free.x1 || py < free.y0 || py > free.y1) return false;
      }
      return true;
    };
    let lo = 2, hi = 160;
    for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (inside(m)) hi = m; else lo = m; }
    return hi;
  }

  // For the leaderboard: the size a saved layout uses and what its placed items cost
  const sizeOf = layout => RoomItems.sizeOf(layout);
  function summary(layout = WPM.getRoom()) {
    const z = RoomItems.sizeOf(layout);
    return { size: z.id, label: z.label, w: z.w, d: z.d, area: z.area, value: RoomItems.roomValue(layout), items: layout && Array.isArray(layout.items) ? layout.items.length : 0 };
  }

  return { mount, unmount, sizeOf, summary };
})();
