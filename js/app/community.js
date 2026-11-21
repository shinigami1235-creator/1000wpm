// Who plays where. The map on the home page reads it through window.Community.
//
// MODE below is the one switch:
//   'demo'  seeded made-up countries and players, run in this browser. Every view that
//           shows them carries the label "Demo data".
//   'live'  reads the server described here. The server does not exist yet.
//
// Live server
//   GET  {ENDPOINT}/snapshot             -> Snapshot
//   GET  {ENDPOINT}/events?since=<ISO>   -> { now: ISO, events: [Event] }   polled every 20 s
//   POST {ENDPOINT}/visit                   body { country: 'PH', source: 'timezone' | 'locale' }
//                                           once per device, answered with 204
//
//   Snapshot { updatedAt: ISO,
//              countries: [{ code: 'BR', players: 412, top: { name: 'kbd_mira', wpm: 187 } }] }
//              code is ISO 3166-1 alpha-2. top is null until someone there finishes a run.
//   Event    { id: string, type: 'join' | 'boss' | 'best' | 'breach', country: 'BR', at: ISO,
//              wpm?: number, mode?: 'time-60', name?: 'kbd_mira', chapter?: 1..5 }
//              join    a new player signed up from country
//              boss    a player there landed the last hit on Syntax Error
//              best    a player there set a new best of wpm on mode; name is theirs
//              breach  a player there cleared Breach chapter
//
// Community.load()        -> Promise<{ snap, me }>   me = { code, source } or null
// Community.stream(fn)    -> { pause(), resume(), stop() }   fn(event, snap) for each new event
// Community.history(snap) -> [Event] newest first, what happened before the page opened
// Community.name(code)    -> 'Brazil'
// Community.inName(code)  -> 'the Philippines' for "Someone in the Philippines"
window.Community = (() => {
  const MODE = 'demo';
  const ENDPOINT = '/api/community';
  // The hub the arcs run to when the player's own country is unknown: Art's country.
  // Thailand is a guess from the site's baht pricing. Confirm it with Art.
  const ART_COUNTRY = 'TH';
  const SEED = 10000;
  const WORLD_SRC = 'js/app/world-110m.js';

  // ---------- the world file (map shapes and time zones), loaded once on first use ----------
  let worldP = null;
  function world() {
    if (window.WORLD_110M) return Promise.resolve(window.WORLD_110M);
    return worldP ||= new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = WORLD_SRC; s.async = true;
      s.onload = () => window.WORLD_110M ? ok(window.WORLD_110M) : fail(new Error('world-110m.js loaded empty'));
      s.onerror = () => { worldP = null; fail(new Error('world-110m.js could not be loaded')); };
      document.head.append(s);
    });
  }

  // ---------- the player's own country, from the browser with no network call ----------
  let tzIndex = null;
  function myCountry(w) {
    if (!tzIndex) {
      tzIndex = {};
      for (const [cc, zones] of Object.entries(w.tz)) for (const z of zones.split(' ')) tzIndex[z] = cc;
    }
    const known = cc => w.c.some(c => c[0] === cc);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tzIndex[tz] && known(tzIndex[tz])) return { code: tzIndex[tz], source: 'timezone' };
    } catch (e) {}
    for (const lang of navigator.languages || [navigator.language]) {
      const m = /[-_]([A-Z]{2})\b/i.exec(lang || '');
      if (m && known(m[1].toUpperCase())) return { code: m[1].toUpperCase(), source: 'locale' };
    }
    return null;
  }

  // ---------- names ----------
  const FIX = { CD: 'DR Congo', CG: 'Republic of the Congo', MM: 'Myanmar', CI: "Cote d'Ivoire", KP: 'North Korea', KR: 'South Korea', HK: 'Hong Kong', MO: 'Macao', PS: 'Palestine', CZ: 'Czechia' };
  const THE = new Set(['US', 'GB', 'PH', 'NL', 'AE', 'DO', 'BS', 'GM', 'MV', 'SC', 'CF', 'KM', 'MH', 'SB', 'VA', 'CD', 'CG']);
  let dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
  const neName = code => { const c = window.WORLD_110M && WORLD_110M.c.find(x => x[0] === code); return c ? c[1] : code; };
  function name(code) {
    if (FIX[code]) return FIX[code];
    try { const n = dn && dn.of(code); if (n && n !== code) return n; } catch (e) {}
    return neName(code);
  }
  const inName = code => (THE.has(code) ? 'the ' : '') + name(code);

  // ---------- seeded demo ----------
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // relative weight of each demo country, loosely where Art's followers would be
  const DEMO = { TH: 30, PH: 16, US: 18, ID: 12, VN: 9, MY: 9, IN: 10, BR: 8, JP: 6, KR: 5, GB: 6, DE: 5, FR: 4, MX: 5, CA: 5, AU: 5,
    SG: 4, TW: 3, ES: 3, IT: 3, PL: 3, NL: 2, TR: 3, EG: 2, NG: 2, ZA: 2, AR: 2, CL: 2, CO: 2, SE: 2, PK: 2, KE: 1, UA: 1, NZ: 1, SA: 1 };
  // countries that can light up later in the demo when someone there joins
  const LATER = ['PE', 'MA', 'PT', 'RO', 'GR', 'NO', 'FI', 'IE', 'BD', 'LK', 'KZ', 'GH', 'ET', 'VE', 'EC', 'MN', 'NP', 'KH', 'LA', 'MM'];
  const MODES = [['time-15', 0.9], ['time-30', 1], ['time-60', 1], ['words-25', 0.6], ['words-50', 0.5], ['quote', 0.4]];
  const handle = r => 'typist_' + String(Math.floor(r() * 9000) + 100);

  let demo = null;   // { snap, r, sim, hist }
  function demoSnap() {
    if (demo) return demo;
    const r = rng(SEED);
    const countries = Object.entries(DEMO).map(([code, w]) => {
      const players = Math.max(3, Math.round(w * (9 + r() * 9)));
      // more players, faster top typist; capped under Art's 204
      const wpm = Math.min(198, Math.round(92 + Math.log(players) * 13 + r() * 24));
      return { code, players, top: { name: handle(r), wpm } };
    });
    const snap = { demo: true, updatedAt: new Date().toISOString(), countries };
    const hist = [];
    const t = Date.now();
    for (let i = 0; i < 6; i++) hist.push(demoEvent(snap, r, t - (i + 1) * (40000 + r() * 90000), true));
    demo = { snap, r, hist, n: 0 };
    return demo;
  }
  function pickCountry(snap, r) {
    const total = snap.countries.reduce((s, c) => s + c.players, 0);
    let x = r() * total;
    for (const c of snap.countries) { x -= c.players; if (x <= 0) return c; }
    return snap.countries[0];
  }
  function demoEvent(snap, r, at, past) {
    const id = 'd' + Math.floor(r() * 1e9).toString(36);
    const roll = r();
    let c = pickCountry(snap, r);
    if (roll < 0.45) {
      // a join; now and then from a country with nobody yet
      if (!past && r() < 0.18) {
        const fresh = LATER.filter(code => !snap.countries.some(x => x.code === code));
        if (fresh.length) { c = { code: fresh[Math.floor(r() * fresh.length)], players: 0, top: null }; snap.countries.push(c); }
      }
      if (!past) c.players++;
      return { id, type: 'join', country: c.code, at: new Date(at).toISOString() };
    }
    if (roll < 0.75) {
      let x = r() * MODES.reduce((s, m) => s + m[1], 0), mode = MODES[0][0];
      for (const [m, w] of MODES) { x -= w; if (x <= 0) { mode = m; break; } }
      const wpm = Math.round(60 + r() * r() * 120);
      if (!past && (!c.top || wpm > c.top.wpm)) c.top = { name: handle(r), wpm };
      return { id, type: 'best', country: c.code, at: new Date(at).toISOString(), wpm, mode };
    }
    if (roll < 0.87) return { id, type: 'boss', country: c.code, at: new Date(at).toISOString() };
    return { id, type: 'breach', country: c.code, at: new Date(at).toISOString(), chapter: 1 + Math.floor(r() * 5) };
  }

  // ---------- live ----------
  let liveSnap = null;
  async function liveLoad(me) {
    const res = await fetch(ENDPOINT + '/snapshot', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('snapshot ' + res.status);
    liveSnap = { ...(await res.json()), demo: false };
    if (me) {
      try {
        if (localStorage.getItem('wpm-visit-sent') !== me.code) {
          const v = await fetch(ENDPOINT + '/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ country: me.code, source: me.source }) });
          if (v.ok) localStorage.setItem('wpm-visit-sent', me.code);
        }
      } catch (e) {}
    }
    return liveSnap;
  }

  // a live event changes the snapshot the same way the demo does
  function apply(snap, ev) {
    if (!snap) return;
    let c = snap.countries.find(x => x.code === ev.country);
    if (!c && ev.type === 'join') { c = { code: ev.country, players: 0, top: null }; snap.countries.push(c); }
    if (!c) return;
    if (ev.type === 'join') c.players++;
    if (ev.type === 'best' && ev.name && (!c.top || ev.wpm > c.top.wpm)) c.top = { name: ev.name, wpm: ev.wpm };
  }

  // ---------- public ----------
  async function load() {
    const w = await world();
    const me = myCountry(w);
    let snap;
    if (MODE === 'live') {
      try { snap = await liveLoad(me); }
      catch (e) { snap = { demo: false, failed: true, updatedAt: null, countries: [] }; }
    } else snap = demoSnap().snap;
    // the player counts as one player in their own country
    if (me && !snap.countries.some(c => c.code === me.code && c.you)) {
      let c = snap.countries.find(x => x.code === me.code);
      if (!c) { c = { code: me.code, players: 0, top: null }; snap.countries.push(c); }
      if (MODE === 'demo') c.players++;
      c.you = true;
    }
    return { snap, me, hub: me ? me.code : ART_COUNTRY };
  }

  function history() { return MODE === 'demo' ? demoSnap().hist.slice() : []; }

  function stream(fn) {
    let timer = 0, paused = false, stopped = false, since = new Date().toISOString();
    const schedule = () => {
      clearTimeout(timer);
      if (paused || stopped) return;
      if (MODE === 'demo') {
        const d = demoSnap();
        timer = setTimeout(() => {
          const ev = demoEvent(d.snap, d.r, Date.now(), false);
          d.hist.unshift(ev); d.hist.length = Math.min(d.hist.length, 12);
          fn(ev, d.snap); schedule();
        }, 4500 + d.r() * 6000);
      } else {
        timer = setTimeout(async () => {
          try {
            const res = await fetch(`${ENDPOINT}/events?since=${encodeURIComponent(since)}`);
            if (res.ok) {
              const j = await res.json();
              since = j.now || since;
              for (const ev of j.events || []) if (!paused && !stopped) { apply(liveSnap, ev); fn(ev, liveSnap); }
            }
          } catch (e) {}
          schedule();
        }, 20000);
      }
    };
    schedule();
    return {
      pause() { paused = true; clearTimeout(timer); },
      resume() { if (paused && !stopped) { paused = false; schedule(); } },
      stop() { stopped = true; clearTimeout(timer); },
    };
  }

  return { MODE, ENDPOINT, ART_COUNTRY, isDemo: () => MODE === 'demo', load, stream, history, name, inName, world };
})();
