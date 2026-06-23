(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function hasSupabaseCredentials() {
    return Boolean(localStorage.getItem('supabase_url') && localStorage.getItem('supabase_key'));
  }

  function showSetup() {
    var app = byId('app-container');
    var login = byId('login-container');
    var setup = byId('setup-view');
    var title = byId('view-title');
    var subtitle = byId('view-subtitle');

    if (app) app.style.display = 'flex';
    if (login) login.style.display = 'none';

    document.querySelectorAll('.view-section').forEach(function (view) {
      view.classList.remove('active');
    });

    if (setup) setup.classList.add('active');
    if (title) title.innerText = 'Configuração de Acesso';
    if (subtitle) subtitle.innerText = 'Conecte o Supabase para iniciar o painel.';

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function recoverBlankScreen() {
    var app = byId('app-container');
    var login = byId('login-container');
    var appHidden = !app || getComputedStyle(app).display === 'none';
    var loginHidden = !login || getComputedStyle(login).display === 'none';

    if (!hasSupabaseCredentials()) {
      showSetup();
      return;
    }

    if (appHidden && loginHidden && login) {
      login.style.display = 'flex';
    }
  }

  if (!window.lucide) {
    window.lucide = { createIcons: function () {} };
  }

  if (typeof window.setupDragAndDrop !== 'function') {
    window.setupDragAndDrop = function () {};
  }

  window.addEventListener('error', function () {
    setTimeout(recoverBlankScreen, 0);
  });

  window.addEventListener('unhandledrejection', function () {
    setTimeout(recoverBlankScreen, 0);
  });

  window.addEventListener('DOMContentLoaded', function () {
    recoverBlankScreen();
    setTimeout(recoverBlankScreen, 800);
    setTimeout(recoverBlankScreen, 2500);
  });
})();
