/* Gambit shared site chrome behavior: megamenu + mobile menu.
   Self-guards on missing elements. Pair with /lib/site-chrome.css.
   The header stays solid here (no transparent-over-hero state); pages with a
   dark hero handle that themselves. */
(function () {
  var header = document.getElementById('siteHeader');
  if (!header) return;

  /* ----- desktop megamenu ----- */
  var triggers = [].slice.call(header.querySelectorAll('[data-menu]'));
  var panels = [].slice.call(header.querySelectorAll('[data-panel]'));
  var current = null, timer = null;
  var clearT = function () { clearTimeout(timer); };
  var startT = function () { clearTimeout(timer); timer = setTimeout(closeAll, 170); };
  function openMenu(k) {
    triggers.forEach(function (t) { t.classList.toggle('active', t.dataset.menu === k); });
    panels.forEach(function (p) { p.classList.toggle('open', p.dataset.panel === k); });
    current = k;
  }
  function closeAll() {
    triggers.forEach(function (t) { t.classList.remove('active'); });
    panels.forEach(function (p) { p.classList.remove('open'); });
    current = null;
  }
  triggers.forEach(function (t) {
    t.addEventListener('mouseenter', function () { clearT(); openMenu(t.dataset.menu); });
    t.addEventListener('mouseleave', startT);
    t.addEventListener('click', function (e) {
      if (e.target.closest('[data-panel]')) return;
      e.preventDefault(); clearT();
      current === t.dataset.menu ? closeAll() : openMenu(t.dataset.menu);
    });
  });
  panels.forEach(function (p) {
    p.addEventListener('mouseenter', clearT);
    p.addEventListener('mouseleave', startT);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-menu]') && !e.target.closest('[data-panel]')) closeAll();
  });

  /* ----- mobile menu ----- */
  var burger = document.getElementById('burger'), mob = document.getElementById('mobileMenu');
  if (burger && mob) {
    burger.addEventListener('click', function () {
      mob.classList.toggle('open');
      document.body.style.overflow = mob.classList.contains('open') ? 'hidden' : '';
    });
    mob.querySelectorAll('.msec-h').forEach(function (h) {
      h.addEventListener('click', function () { h.parentElement.classList.toggle('open'); });
    });
    mob.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { mob.classList.remove('open'); document.body.style.overflow = ''; });
    });
  }
})();
