(function () {
  'use strict';

  var DEMO_USERS = [
    { role: 'admin', name: 'Administrador JV', email: 'admin@jvimports.com.br', password: 'JVAdm@2026' },
    { role: 'cliente', name: 'Cliente JV', email: 'cliente@jvimports.com.br', password: 'JVCliente@2026' }
  ];

  function patchSupabaseFinancialHistoryLimit() {
    if (!window.supabase || window.supabase.__jvFinancialPatchApplied) return;

    var originalCreateClient = window.supabase.createClient;
    if (typeof originalCreateClient !== 'function') return;

    window.supabase.createClient = function () {
      var client = originalCreateClient.apply(window.supabase, arguments);
      var originalFrom = client.from.bind(client);

      client.from = function (tableName) {
        var query = originalFrom(tableName);

        if (tableName === 'vw_financial_daily' && query && typeof query.limit === 'function') {
          var originalLimit = query.limit.bind(query);
          query.limit = function (count, options) {
            if (Number(count) === 365) {
              console.info('JV hotfix: removendo limite de 365 linhas em vw_financial_daily para carregar todo o histórico financeiro.');
              return query;
            }
            return originalLimit(count, options);
          };
        }

        return query;
      };

      return client;
    };

    window.supabase.__jvFinancialPatchApplied = true;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function hasSupabaseCredentials() {
    return Boolean(localStorage.getItem('supabase_url') && localStorage.getItem('supabase_key'));
  }

  function isDemoLoggedIn() {
    return sessionStorage.getItem('jv_demo_logged_in') === 'true';
  }

  function setLoginMessage(message, type) {
    var form = byId('login-form-fields');
    if (!form) return;

    var existing = byId('login-inline-message');
    if (existing) existing.remove();

    if (!message) return;

    var box = document.createElement('div');
    box.id = 'login-inline-message';
    box.setAttribute('role', 'alert');
    box.style.cssText = [
      'margin-top: 14px',
      'padding: 12px 14px',
      'border-radius: 10px',
      'font-size: 0.84rem',
      'line-height: 1.4',
      'border: 1px solid ' + (type === 'success' ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)'),
      'background: ' + (type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'),
      'color: ' + (type === 'success' ? '#34d399' : '#f87171')
    ].join('; ');
    box.innerText = message;
    form.appendChild(box);
  }

  function showLogin() {
    var app = byId('app-container');
    var login = byId('login-container');
    if (app) app.style.display = 'none';
    if (login) login.style.display = 'flex';

    var title = byId('login-title');
    var subtitle = byId('login-subtitle');
    if (title) title.innerText = 'Acessar Central';
    if (subtitle) subtitle.innerText = 'Entre com um acesso administrador ou cliente.';

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
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

  function showDashboard() {
    var app = byId('app-container');
    var login = byId('login-container');
    if (login) login.style.display = 'none';
    if (app) app.style.display = 'flex';

    if (typeof window.switchView === 'function') {
      window.switchView('dashboard');
    }
  }

  function recoverBlankScreen() {
    if (!isDemoLoggedIn()) {
      showLogin();
      return;
    }

    if (!hasSupabaseCredentials()) {
      showSetup();
      return;
    }

    var app = byId('app-container');
    var login = byId('login-container');
    var appHidden = !app || getComputedStyle(app).display === 'none';
    var loginHidden = !login || getComputedStyle(login).display === 'none';

    if (appHidden && loginHidden) {
      showDashboard();
    }
  }

  function findDemoUser(email, password) {
    var cleanEmail = String(email || '').trim().toLowerCase();
    return DEMO_USERS.find(function (user) {
      return user.email.toLowerCase() === cleanEmail && user.password === password;
    });
  }

  patchSupabaseFinancialHistoryLimit();

  window.executeAuth = async function () {
    var emailInput = byId('login-email');
    var passwordInput = byId('login-password');
    var button = byId('btn-login-execute');
    var email = emailInput ? emailInput.value : '';
    var password = passwordInput ? passwordInput.value : '';

    setLoginMessage('', 'error');

    if (!email || !password) {
      setLoginMessage('Informe e-mail e senha para continuar.', 'error');
      return;
    }

    if (button) {
      button.disabled = true;
      button.innerText = 'Validando acesso...';
    }

    var user = findDemoUser(email, password);

    if (!user) {
      if (button) {
        button.disabled = false;
        button.innerText = 'Entrar no Painel';
      }
      setLoginMessage('Login não encontrado. Verifique o e-mail e a senha informados.', 'error');
      return;
    }

    sessionStorage.setItem('jv_demo_logged_in', 'true');
    sessionStorage.setItem('jv_demo_user_role', user.role);
    sessionStorage.setItem('jv_demo_user_name', user.name);
    setLoginMessage('Acesso liberado. Carregando painel...', 'success');

    setTimeout(function () {
      if (!hasSupabaseCredentials()) {
        showSetup();
      } else {
        showDashboard();
        if (typeof window.loadAllData === 'function') {
          window.loadAllData();
        }
      }

      if (button) {
        button.disabled = false;
        button.innerText = 'Entrar no Painel';
      }
    }, 350);
  };

  window.logout = async function () {
    sessionStorage.removeItem('jv_demo_logged_in');
    sessionStorage.removeItem('jv_demo_user_role');
    sessionStorage.removeItem('jv_demo_user_name');

    if (window.supabaseClient && window.supabaseClient.auth) {
      try {
        await window.supabaseClient.auth.signOut();
      } catch (e) {
        console.warn('SignOut failed:', e);
      }
    }

    showLogin();
  };

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
    showLogin();
    setTimeout(recoverBlankScreen, 800);
    setTimeout(recoverBlankScreen, 2500);
  });
})();
