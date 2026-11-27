// #/room: the room agent's window.Room mounted into the page.
Router.register('room', (() => {
  let cancel = null, mounted = false;

  function mount(el) {
    el.classList.add('page-full');
    document.body.classList.add('no-scan');
    el.innerHTML = `<p class="room-links"><a class="btn out sm" href="#/hangar">Hangar</a><a class="btn out sm" href="#/lab">Operator</a></p><section class="panel room-host" aria-label="My room" data-host></section>`;
    const host = el.querySelector('[data-host]');
    mounted = false;
    cancel = UI.waitFor('Room', host, R => { R.mount(host); mounted = true; });
  }

  function unmount() {
    document.body.classList.remove('no-scan');
    if (cancel) cancel();
    if (mounted && window.Room) { try { window.Room.unmount(); } catch (e) { console.error(e); } }
    mounted = false;
  }

  return { title: 'My Room', mount, unmount };
})());
