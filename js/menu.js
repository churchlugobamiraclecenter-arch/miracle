/**
 * Mobile menu — open/close + reliable page redirects on all phones.
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
    if (!btn || !nav) {
      console.warn('Menu: button or nav missing');
      return;
    }
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
      document.body.classList.add('menu-open');
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
      document.body.classList.remove('menu-open');
      document.body.style.overflow = '';
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (nav.classList.contains('open')) closeMenu();
      else openMenu();
    });

    function goTo(href) {
      if (!href) return;
      closeMenu();
      // Force navigation (fixes mobile browsers that cancel <a> clicks when menu closes)
      setTimeout(function () {
        window.location.href = href;
      }, 10);
    }

    // Capture phase so we win over other handlers
    nav.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        while (t && t !== nav && t.tagName !== 'A') t = t.parentNode;
        if (!t || t.tagName !== 'A') return;
        var href = t.getAttribute('href');
        if (!href || href === '#') {
          closeMenu();
          return;
        }
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          closeMenu();
          return; // external — default behaviour
        }
        e.preventDefault();
        e.stopPropagation();
        goTo(href);
      },
      true
    );

    if (backdrop) {
      backdrop.addEventListener('click', function (e) {
        e.preventDefault();
        closeMenu();
      });
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) closeMenu();
      else if (nav.classList.contains('open')) positionNav();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  });
})();
