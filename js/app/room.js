// #/room: My Room (js/room/tier-page.js) mounted full width under the site header.
Router.register('room', (() => {
  let cancel = null, mounted = false;

  function mount(el) {
    document.body.classList.add('no-scan');
    el.innerHTML = '<div data-host></div>';
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
