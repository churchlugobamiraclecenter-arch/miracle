/**
 * Shared mobile navigation — one reliable implementation for every page.
 */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var btn = document.getElementById('menuToggle') || document.querySelector('.menu-toggle');
    var nav = document.getElementById('nav');
    var backdrop = document.getElementById('navBackdrop');
    if (!btn || !nav) return;
    if (btn.getAttribute('data-menu-bound') === '1') return;
    btn.setAttribute('data-menu-bound', '1');

    function headerOffset() {
      var top = 0;
      var topbar = document.querySelector('.topbar');
      var header = document.querySelector('.site-header');
      if (topbar) top += topbar.offsetHeight;
      if (header) top += header.offsetHeight;
      return top || 72;
    }

    function positionNav() {
      var y = headerOffset();
      nav.style.top = y + 'px';
      if (backdrop) backdrop.style.top = y + 'px';
    }

    function openMenu() {
      positionNav();
      nav.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
      if (backdrop) {
        backdrop.hidden = false;
        backdrop.classList.add('show');
      }
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
      if (backdrop) {
        backdrop.classList.remove('show');
        backdrop.hidden = true;
      }
      document.body.style.overflow = '';
    }

    function toggleMenu(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (nav.classList.contains('open')) closeMenu();
      else openMenu();
    }

    btn.addEventListener('click', toggleMenu);

    var links = nav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', closeMenu);
    }
    if (backdrop) backdrop.addEventListener('click', closeMenu);

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) closeMenu();
      else if (nav.classList.contains('open')) positionNav();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  });
})();
