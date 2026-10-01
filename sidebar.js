(function () {
  'use strict';
  const root = document.documentElement;
  const mobile = window.matchMedia('(max-width: 768px)');
  const key = 'mavix_sidebar_collapsed';
  let desktopCollapsed = false;
  let mobileCollapsed = true;
  try { desktopCollapsed = localStorage.getItem(key) === 'true'; } catch {}

  function apply() {
    const collapsed = mobile.matches ? mobileCollapsed : desktopCollapsed;
    root.classList.toggle('sidebar-collapsed', collapsed);
    const button = document.getElementById('sidebar-toggle');
    if (!button) return;
    const label = collapsed ? 'Expandir menu' : 'Recolher menu';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  apply();
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    if (mobile.matches) mobileCollapsed = !mobileCollapsed;
    else {
      desktopCollapsed = !desktopCollapsed;
      try { localStorage.setItem(key, String(desktopCollapsed)); } catch {}
    }
    apply();
  });
  mobile.addEventListener('change', () => { mobileCollapsed = true; apply(); });
  document.getElementById('sidebar-navigation')?.addEventListener('click', event => {
    if (mobile.matches && event.target.closest('.nav-item')) { mobileCollapsed = true; apply(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && !mobileCollapsed) {
      mobileCollapsed = true;
      apply();
      document.getElementById('sidebar-toggle')?.focus();
    }
  });
})();
