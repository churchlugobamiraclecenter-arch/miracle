/* js/menu.js: one menu script for every page.
   Works with <div id="mobileMenu" class="mobile-menu"> (new markup)
   and with <nav class="nav" id="nav"> (old markup). */
(function () {
  if (window.__lmccMenuReady) return;   // never attach twice
  window.__lmccMenuReady = true;

  function init() {
    var btn = document.getElementById('menuToggle');
    var menu = document.getElementById('mobileMenu') ||
               document.getElementById('nav') ||
               document.querySelector('.site-header .nav');
    if (!btn || !menu) return;

    var backdrop = document.querySelector('.nav-backdrop');
    if (menu.id) btn.setAttribute('aria-controls', menu.id);

    function isOpen() { return menu.classList.contains('open'); }

    function setOpen(open) {
      menu.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('menu-open', open);
      if (backdrop) backdrop.classList.toggle('show', open);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    if (backdrop) backdrop.addEventListener('click', function () { setOpen(false); });

    // Tap anywhere outside the menu to close it
    document.addEventListener('click', function (e) {
      if (isOpen() && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); btn.focus(); }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024 && isOpen()) setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
