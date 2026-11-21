// #/home: the world map of where players are (js/app/worldmap.js), the race against Art,
// his numbers, a line pointing to the rest of the site, the 3D keyboards, his videos and
// the section for brands.
// The layout follows the calm rules in css/site.css under .page-home.
Router.register('home', (() => {
  const VIDEOS = [
    ['https://www.instagram.com/10000wpm/reel/DQOgF1njxv7/', 'Follower count', '1 follower = 1 word', 'Art types one word for each follower he has.'],
    ['https://www.instagram.com/10000wpm/reel/DfML79wAKiM/', 'Tip', 'Easiest way to type faster', 'His tip for getting past 150 wpm.'],
    ['https://www.instagram.com/10000wpm/reel/DfwWq1ERVOS/', 'Collab', 'Womier SK61 HE', 'His first collab with Womier.'],
    ['https://www.instagram.com/10000wpm/reel/Dfm2oO9Aemm/', 'Sound test', 'AULA F99 Pro', 'Speed typing sound test on the F99 Pro.'],
    ['https://www.instagram.com/10000wpm/reel/DfwhXtSxWHB/', 'Sound test', 'LOGA Yaksa 75 Clear', 'Typing on the Maiyarap edition.'],
    ['https://www.instagram.com/10000wpm/reel/Dftm1bdAdMg/', 'Sound test', 'Corsair Vanguard 96', 'Typing on the wireless version.'],
  ];
  const BOARDS = ['AULA F99 Pro', 'Womier SK61 HE', 'LOGA Yaksa Pro 75', 'Attack Shark X68 HE', 'Corsair Vanguard 96', 'Chilkey SF60', 'Neolution Singular Core', 'Solakaka A99 Pro', 'Kemove K98SE'];

  let stops = [];

  function mount(el) {
    const e = UI.esc;
    el.innerHTML = `
      <div class="home">
        <section class="hero-map" aria-labelledby="map-h">
          <div class="hm-frame">
            <div class="hm-hud">
              <p class="hm-brand">Keyspace // ops map</p>
              <div class="hm-live">
                <p class="hm-stat"><small><span class="l">Online now</span><span class="s">Online</span></small><b data-k="online">-</b></p>
                <p class="hm-stat hm-bossbar"><small><span class="l">Fighting Syntax Error</span><span class="s">Syntax Error</span></small><b data-k="inBoss">-</b><span class="bar" aria-hidden="true"><i data-hud-bar></i></span><b class="pct" data-k="hp">-</b></p>
                <p class="hm-stat"><small><span class="l">Duels running</span><span class="s">Duels</span></small><b data-k="duels">-</b></p>
                <p class="hm-stat"><small><span class="l">Words typed today</span><span class="s">Words today</span></small><b data-k="words">-</b></p>
                <p class="hm-stat hm-chat"><small>In the Commons</small><b data-k="chat">-</b></p>
              </div>
              <div class="hm-live hm-day" hidden>
                <p class="hm-stat"><small data-k="d-date"></small><b data-k="d-day"></b></p>
                <p class="hm-stat"><small>Players</small><b data-k="d-players"></b></p>
                <p class="hm-stat"><small>Countries</small><b data-k="d-countries"></b></p>
                <p class="hm-stat"><small>Peak online</small><b data-k="d-peak"></b></p>
                <p class="hm-stat"><small>Words typed</small><b data-k="d-words"></b></p>
                <p class="hm-stat"><small>Bosses beaten</small><b data-k="d-defeats"></b></p>
              </div>
              <span class="hm-demo" hidden>Demo data</span>
            </div>
            <div class="hm-mapwrap">
              <div class="hm-intro">
                <h1 id="map-h">A typing site by Art (@10000wpm) for anyone who wants to type faster.</h1>
                <div class="hm-go"><a class="btn" href="#/type">Start typing</a><button class="hm-race" type="button" data-to-race>Race Art</button></div>
              </div>
              <div class="hm-stage" data-map-stage>
                <div class="hm-map" data-map>
                  <canvas aria-hidden="true"></canvas>
                  <div class="hm-calls" aria-hidden="true"></div>
                  <nav class="hm-missions" aria-label="Game modes on the map"></nav>
                  <div class="hm-dots" role="group" aria-label="Countries with players"></div>
                </div>
              </div>
              <p class="hm-drag" hidden>Drag to see more</p>
              <p class="hm-banner" role="status" hidden></p>
              <div class="hm-card" hidden></div>
            </div>
            <div class="hm-strip">
              <div class="hm-filter" role="group" aria-label="Map layers">
                <button type="button" data-view="missions" aria-pressed="true">Missions</button><button type="button" data-view="players" aria-pressed="false">Players</button><button type="button" data-view="both" aria-pressed="false">Both</button>
              </div>
              <p class="hm-count" data-map-count></p>
              <div class="hm-time">
                <button type="button" data-play aria-pressed="false">Play</button>
                <input type="range" min="1" max="1" value="1" step="1" data-day aria-label="Day since launch">
                <output data-day-out>Today</output>
                <button type="button" data-now>Now</button>
                <button type="button" data-compare aria-pressed="false">Compare</button>
              </div>
            </div>
            <div class="hm-compare" hidden></div>
            <div class="hm-feedbox"><span class="hm-demo" hidden>Demo data</span><ol class="hm-feed" aria-label="What players are doing"></ol></div>
            <p class="sr-only" aria-live="polite" data-feed-live></p>
            <ul class="hm-modes" aria-label="Game modes"></ul>
          </div>
        </section>

        <section class="hero-race" id="race" aria-labelledby="race-h">
          <h2 id="race-h">Race Art</h2>
          <div class="typebox idle" data-race tabindex="-1"></div>
          <div class="hr-bar">
            <div class="hr-pace">
              <div class="score you"><b data-you>0</b><span>Your wpm</span></div>
              <div class="score art"><b data-art>${TT.ART_WPM}</b><span>Art's wpm</span></div>
            </div>
            <p class="hint" data-hint>Start typing to race. Press <kbd>Tab</kbd> to start over.</p>
          </div>
        </section>

        <section class="home-art" aria-label="Art">
          <p class="ha-stats">
            <span><b>${TT.ART_WPM}</b> best wpm in his reels</span>
            <span><b>25.5K</b> followers on <a href="https://www.instagram.com/10000wpm/" target="_blank" rel="noopener">Instagram</a></span>
            <span><b>983</b> posts</span>
          </p>
          <p class="ha-bio">Art types his follower count on Monkeytype with one word for each follower and runs sound tests on the keyboards brands send him.</p>
          <p class="ha-more">Every run in the <a href="#/type">typing test</a>, <a href="#/play/breach">Breach</a> or the <a href="#/play/race">race</a> pays coins and XP. Spend the coins in the <a href="#/shop">shop</a> on <a href="#/room">your room</a>.</p>
        </section>

        <section class="sec" id="keyboards">
          <div class="sec-head">
            <h2>Keyboards Art types on</h2>
            <p>Press or tap a key to type on the board and hear how it sounds.</p>
          </div>
          <div class="kb-layout">
            <div class="kb-stage" data-stage>
              <div class="kb-loading">Loading</div>
              <div class="kb-typed" aria-live="off"></div>
              <div class="kb-picker" role="tablist" aria-label="Keyboards"></div>
            </div>
            <aside class="spec" data-spec aria-live="polite"></aside>
          </div>
        </section>

        <section class="sec" id="videos">
          <div class="sec-head"><h2>Videos</h2><p>Reels from his Instagram.</p></div>
          <ul class="vids">
            ${VIDEOS.map(([u, k, t, p]) => `<li><a class="vid" href="${e(u)}" target="_blank" rel="noopener">
              <span class="kind">${e(k)}</span><b>${e(t)}</b><span class="what">${e(p)}</span></a></li>`).join('')}
          </ul>
        </section>

        <section class="sec" id="brands">
          <div class="sec-head"><h2>Send Art a keyboard</h2></div>
          <div class="brands">
            <div class="br-how">
              <p>Art types on new keyboards on camera for his 25.5K followers on Instagram. Each board gets its own reel of him typing on Monkeytype with the sound up.</p>
              <ol>
                <li>Message Art on Instagram with the board and your launch date.</li>
                <li>Art types on it and posts the reel.</li>
                <li>Your board is added to the 3D keyboards on this site with its specs and a link to your store.</li>
              </ol>
              <a class="btn" href="https://ig.me/m/10000wpm" target="_blank" rel="noopener">Message Art on Instagram</a>
            </div>
            <div class="br-list">
              <h3>Boards Art has typed on</h3>
              <ul class="board-list">${BOARDS.map(b => `<li>${e(b)}</li>`).join('')}</ul>
            </div>
          </div>
        </section>

        <p class="since">Art could have typed <b data-since>0</b> words since you opened this page.</p>
      </div>`;

    stops.push(WorldMap.mount(el.querySelector('.hero-map')));
    stops.push(HeroRace.mount(el.querySelector('.hero-race')));
    el.querySelector('[data-to-race]').addEventListener('click', () => {
      const r = el.querySelector('.hero-race');
      r.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      document.activeElement.blur();   // with nothing focused, the next key starts the race
    });
    stops.push(KB3D.mount(el.querySelector('[data-stage]'), el.querySelector('[data-spec]')));

    const since = el.querySelector('[data-since]');
    const opened = performance.now();
    const iv = setInterval(() => {
      since.textContent = UI.fmt(((performance.now() - opened) / 60000) * TT.ART_WPM);
    }, 250);
    stops.push(() => clearInterval(iv));
  }

  function unmount() {
    stops.forEach(f => { try { f(); } catch (err) { console.error(err); } });
    stops = [];
  }

  return { title: 'Home', mount, unmount };
})());
