// #/home: the race against Art, his facts, links to the other pages, the 3D
// keyboards, his videos and the section for brands.
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
      <section class="hero">
        <div class="panel hot hero-race">
          <div class="ph">&gt; RACE ART_<span class="meta">${TT.ART_WPM} WPM PACE</span></div>
          <div class="typebox idle" data-race tabindex="-1"></div>
          <div class="hero-bar">
            <div class="score you"><b data-you>0</b><span class="label">Your wpm</span></div>
            <div class="score art"><b data-art>${TT.ART_WPM}</b><span class="label">Art's wpm</span></div>
            <p class="hint" data-hint>Start typing to race Art. Press <kbd>Tab</kbd> to start over.</p>
          </div>
        </div>
        <aside class="panel facts">
          <div class="ph">// ART</div>
          <div class="fact"><b>${TT.ART_WPM}</b><p>Best wpm in his reels</p></div>
          <div class="fact"><b>25.5K</b><p>Followers on <a href="https://www.instagram.com/10000wpm/" target="_blank" rel="noopener">Instagram</a></p></div>
          <div class="fact"><b>983</b><p>Posts</p></div>
          <div class="fact"><p>Art types his follower count on Monkeytype with one word for each follower and runs sound tests on the keyboards brands send him.</p></div>
        </aside>
      </section>

      <nav class="go" aria-label="Pages">
        <a class="panel" href="#/type"><h3>Type</h3><p>Typing test in words, time, quote and custom modes.</p><span class="arrow">&gt; OPEN TYPE TEST</span></a>
        <a class="panel" href="#/play"><h3>Play</h3><p>Breach and the race. Every run pays coins and XP.</p><span class="arrow">&gt; OPEN GAMES</span></a>
        <a class="panel" href="#/room"><h3>My Room</h3><p>Decorate your room with items from the shop.</p><span class="arrow">&gt; OPEN MY ROOM</span></a>
      </nav>

      <section class="sec" id="keyboards">
        <div class="sec-head">
          <h2>Keyboards Art types on</h2>
          <p>Press or tap a key to type on the board and hear how it sounds.</p>
        </div>
        <div class="kb-layout">
          <div class="panel kb-stage" data-stage>
            <div class="kb-loading">Loading</div>
            <div class="kb-typed" aria-live="off"></div>
            <div class="kb-picker" role="tablist" aria-label="Keyboards"></div>
          </div>
          <aside class="panel spec" data-spec aria-live="polite"></aside>
        </div>
      </section>

      <section class="sec" id="videos">
        <div class="sec-head"><h2>Videos</h2><p>Reels from his Instagram.</p></div>
        <div class="vids">
          ${VIDEOS.map(([u, k, t, p]) => `<a class="panel vid" href="${e(u)}" target="_blank" rel="noopener">
            <span class="kind">${e(k)}</span><h3>${e(t)}</h3><p>${e(p)}</p><span class="open">&gt; WATCH ON INSTAGRAM</span></a>`).join('')}
        </div>
      </section>

      <section class="sec" id="brands">
        <div class="sec-head"><h2>Send Art a keyboard</h2></div>
        <div class="brands">
          <div class="panel">
            <div class="ph">// FOR BRANDS</div>
            <p>Art types on new keyboards on camera for his 25.5K followers on Instagram. Each board gets its own reel of him typing on Monkeytype with the sound up.</p>
            <ol>
              <li>Message Art on Instagram with the board and your launch date.</li>
              <li>Art types on it and posts the reel.</li>
              <li>Your board is added to the 3D keyboards on this site with its specs and a link to your store.</li>
            </ol>
            <a class="btn" href="https://ig.me/m/10000wpm" target="_blank" rel="noopener">Message Art on Instagram</a>
          </div>
          <div class="panel">
            <div class="ph">// BOARDS ART HAS TYPED ON</div>
            <div class="board-list">${BOARDS.map(b => `<span>${e(b)}</span>`).join('')}</div>
          </div>
        </div>
      </section>

      <p class="since">Art could have typed <b data-since>0</b> words since you opened this page.</p>`;

    stops.push(HeroRace.mount(el.querySelector('.hero-race')));
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
