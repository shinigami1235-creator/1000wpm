// The game modes as places on the home map. Each one is a marker with its own icon and
// colour that links to the mode's page. The descriptions come from the Play page.
// js/app/worldmap.js draws them; js/app/activity.js moves the World Boss each day.
window.Missions = (() => {
  // icons on a 24px grid, one stroke width
  const ICON = {
    boss: '<path d="M8 6l-2-3M16 6l2-3"/><rect x="7" y="6" width="10" height="13" rx="5"/><path d="M7 11H3M17 11h4M7 15H4M17 15h3M12 9v9"/>',
    live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
    rush: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
    breach: '<path d="M9 5l-6 7 6 7M15 5l6 7-6 7M13 4l-2 16"/>',
    duel: '<path d="M4 4l10 10M14 14l2 4 2-2-4-2M20 4L10 14M10 14l-2 4-2-2 4-2"/>',
    party: '<circle cx="8" cy="9" r="2.5"/><circle cx="16" cy="9" r="2.5"/><path d="M3.5 19c.6-3 2.4-4.5 4.5-4.5s3.9 1.5 4.5 4.5M11.5 19c.6-3 2.4-4.5 4.5-4.5s3.9 1.5 4.5 4.5"/>',
    race: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
    keys: '<rect x="2.5" y="6.5" width="19" height="11" rx="1.5"/><path d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h.5M7 14h10"/>',
    learn: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c2 1.5 8 1.5 10 0v-5M21 9v5"/>',
    caret: '<path d="M9 4h6M9 20h6M12 4v16"/>',
    chat: '<path d="M4 5h16v10H10l-4 4v-4H4z"/><path d="M8 9h8M8 12h5"/>',
    timer: '<circle cx="12" cy="13" r="7"/><path d="M12 13V9M10 3h4M18 6l1.5-1.5"/>',
  };
  const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

  // lon and lat place the marker; side is where its tag sits (r or l) so tags never meet
  const LIST = [
    { id: 'boss', name: 'World Boss', tag: 'Syntax Error', href: '#/boss', icon: 'boss', color: '#ff4d5e', big: true, side: 'r',
      desc: 'Syntax Error, the leftovers of the update. Everyone online fights it at once.' },
    { id: 'superboss', name: 'Superboss', tag: 'Art\'s stream', href: '#/superboss', icon: 'live', color: '#b48cff', lon: 101, lat: 15, side: 'r',
      desc: 'Art fights these bosses on his stream. Watch, chat and send him support with your coins.' },
    { id: 'rush', name: 'Boss rush', href: '#/play/rush', icon: 'rush', color: '#ff9f43', lon: 16, lat: 50, side: 'r',
      desc: 'Copies of every boss Art has beaten, one after another, each harder than the last.' },
    { id: 'breach', name: 'Breach', href: '#/play/breach', icon: 'breach', color: '#39ff88', lon: 139, lat: 37, side: 'l',
      desc: 'Five chapters with a boss at the end of each, plus endless and a daily run.' },
    { id: 'duel', name: 'Duel', href: '#/duel', icon: 'duel', color: '#3ee6ff', lon: -100, lat: 40, side: 'l',
      desc: 'Type against another player, best of 3 rounds. Challenge Art at 204 wpm.' },
    { id: 'party', name: 'Party', href: '#/party', icon: 'party', color: '#e6f26a', lon: -52, lat: -11, side: 'r',
      desc: 'Up to 4 players pick roles and fight through Keyspace together.' },
    { id: 'race', name: 'Race Art', href: '#/play/race', icon: 'race', color: '#d7f5e3', lon: 134, lat: -25, side: 'l',
      desc: 'Your car\'s speed comes from your typing speed. Race Art, your best run or a friend.' },
    { id: 'commons', name: 'Open Port', tag: 'Chat', href: '#/commons', icon: 'chat', color: '#ff8fc8', lon: -72, lat: 5, side: 'l',
      desc: 'Talk with other players in one shared space.' },
    { id: 'training', name: 'Training', href: '#/type', icon: 'keys', color: '#3cf2b4', lon: 22, lat: 4, side: 'l', cluster: true,
      desc: 'The typing test, the academy and free typing.' },
  ];
  const TRAINING = [
    { id: 'test', name: 'Typing test', href: '#/type', icon: 'timer', color: '#3cf2b4', angle: -50,
      desc: 'Words, time, quote and custom modes with live stats.' },
    { id: 'academy', name: 'Academy', href: '#/type/learn', icon: 'learn', color: '#3cf2b4', angle: 0,
      desc: 'Lessons that take you from the home row to full sentences.' },
    { id: 'free', name: 'Free typing', href: '#/type/free', icon: 'caret', color: '#3cf2b4', angle: 50,
      desc: 'Type any text at your own pace with no timer.' },
  ];

  // the player's own record in a mode, read from this device
  function progress(id) {
    try {
      const best = WPM.best(), runs = WPM.sessions();
      const count = m => runs.filter(s => (typeof m === 'string' ? s.mode === m : m.test(s.mode))).length;
      const top = re => Math.max(0, ...Object.entries(best).filter(([k]) => re.test(k)).map(([, v]) => v));
      if (id === 'boss') return best['world-boss'] ? `Your best: ${best['world-boss']} wpm on Syntax Error` : null;
      if (id === 'superboss') return count('superboss') ? `You supported ${count('superboss')} streams` : null;
      if (id === 'rush') {
        const d = WPM.modeData && WPM.modeData('rush');
        return d && d.best && d.best.bosses ? `Your best: ${d.best.bosses} bosses` : null;
      }
      if (id === 'breach') {
        const ch = [1, 2, 3, 4, 5].filter(n => Object.keys(best).some(k => k === `horde-${n}` || k.startsWith(`horde-${n}:`))).length;
        return ch ? `Chapters played: ${ch} of 5` : null;
      }
      if (id === 'duel') return count(/^duel/) ? `Duels played: ${count(/^duel/)}` : null;
      if (id === 'party') return count('party') ? `Party runs: ${count('party')}` : null;
      if (id === 'race') return best['race-art'] ? `Your best against Art: ${best['race-art']} wpm` : null;
      if (id === 'test' || id === 'training') { const b = top(/^(time|words)-/); return b ? `Your best: ${b} wpm` : null; }
      if (id === 'academy') {
        const l = WPM.learn(), n = Object.values(l.lessons || {}).filter(x => x && x.stars).length;
        const of = window.LEARN && LEARN.LESSONS ? ` of ${LEARN.LESSONS.length}` : '';
        return n ? `Lessons passed: ${n}${of}` : null;
      }
      if (id === 'free') return count('free') ? `Free typing runs: ${count('free')}` : null;
    } catch (e) {}
    return null;
  }

  return { LIST, TRAINING, svg, progress, byId: id => LIST.concat(TRAINING).find(m => m.id === id) };
})();
