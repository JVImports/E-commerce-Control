(function () {
  'use strict';

  var DEMO_USERS = [
    { role: 'admin', name: 'Administrador JV', email: 'admin@jvimports.com.br', password: 'JVAdm@2026' },
    { role: 'cliente', name: 'Cliente JV', email: 'cliente@jvimports.com.br', password: 'JVCliente@2026' }
  ];

  var commerceSalesDaily = [];
  var commerceAdsDaily = [];
  var commercePatchInstalled = false;

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

  function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }

  function getClient() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    return window.supabaseClient || null;
  }

  function getSelectedPeriodValue() {
    var select = byId('select-period');
    if (select && select.value) return select.value;
    try {
      if (typeof selectedPeriod !== 'undefined') return selectedPeriod;
    } catch (e) {}
    return '30';
  }

  function getSelectedShopValue() {
    var select = byId('select-shop');
    if (select && select.value) return select.value;
    try {
      if (typeof selectedShop !== 'undefined') return selectedShop;
    } catch (e) {}
    return 'all';
  }

  function normalizeDate(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function isDateInSelectedPeriod(dateValue) {
    var dateStr = normalizeDate(dateValue);
    if (!dateStr) return false;

    var period = getSelectedPeriodValue();
    if (period === 'all') return true;

    var refDate = new Date(dateStr + 'T00:00:00');
    var now = new Date();
    now.setHours(0, 0, 0, 0);

    var days = parseInt(period, 10);
    if (isNaN(days)) return true;

    var cutoff = new Date(now);
    cutoff.setDate(now.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    return refDate >= cutoff && refDate <= now;
  }

  function matchesSelectedShop(row) {
    var selected = getSelectedShopValue();
    if (!selected || selected === 'all') return true;
    return String(row.shop_id || '') === String(selected);
  }

  async function fetchCommerceDashboardSources() {
    var client = getClient();
    if (!client) return;

    try {
      var salesResult = await client
        .from('vw_sales_daily')
        .select('sales_date,gross_revenue,shop_id')
        .order('sales_date', { ascending: true })
        .limit(5000);

      if (!salesResult.error) {
        commerceSalesDaily = salesResult.data || [];
      } else {
        console.warn('JV hotfix: falha ao buscar vw_sales_daily', salesResult.error);
      }
    } catch (error) {
      console.warn('JV hotfix: erro ao buscar vw_sales_daily', error);
    }

    try {
      var adsResult = await client
        .from('shopee_ads_daily_performance')
        .select('performance_date,expense,direct_gmv,shop_id')
        .order('performance_date', { ascending: true })
        .limit(5000);

      if (!adsResult.error) {
        commerceAdsDaily = adsResult.data || [];
      } else {
        console.warn('JV hotfix: falha ao buscar shopee_ads_daily_performance', adsResult.error);
      }
    } catch (error) {
      console.warn('JV hotfix: erro ao buscar shopee_ads_daily_performance', error);
    }
  }

  function getCommerceMetrics() {
    var salesRows = commerceSalesDaily.filter(function (row) {
      return matchesSelectedShop(row) && isDateInSelectedPeriod(row.sales_date);
    });

    var adsRows = commerceAdsDaily.filter(function (row) {
      return matchesSelectedShop(row) && isDateInSelectedPeriod(row.performance_date);
    });

    var revenue = salesRows.reduce(function (sum, row) {
      return sum + Number(row.gross_revenue || 0);
    }, 0);

    var adsExpense = adsRows.reduce(function (sum, row) {
      return sum + Number(row.expense || 0);
    }, 0);

    var adsGmv = adsRows.reduce(function (sum, row) {
      return sum + Number(row.direct_gmv || 0);
    }, 0);

    return {
      revenue: revenue,
      adsExpense: adsExpense,
      adsGmv: adsGmv,
      roas: adsExpense > 0 ? (adsGmv / adsExpense).toFixed(2) : '0.00'
    };
  }

  function applyCommerceDashboardMetrics() {
    if (!commerceSalesDaily.length && !commerceAdsDaily.length) return;

    var metrics = getCommerceMetrics();
    var revenueCard = byId('card-faturamento');
    var adsCard = byId('card-ads');
    var roasSub = byId('sub-roas');

    if (revenueCard) revenueCard.innerText = formatBRL(metrics.revenue);
    if (adsCard) adsCard.innerText = formatBRL(metrics.adsExpense);
    if (roasSub) roasSub.innerHTML = '<span class="trend-up"><i data-lucide="percent"></i> ROAS: ' + metrics.roas + '</span> no período';

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function installCommerceDashboardPatch() {
    if (commercePatchInstalled) return;

    if (typeof window.loadAllData === 'function') {
      var originalLoadAllData = window.loadAllData;
      window.loadAllData = async function () {
        var result = await originalLoadAllData.apply(this, arguments);
        await fetchCommerceDashboardSources();
        applyCommerceDashboardMetrics();
        return result;
      };
    }

    if (typeof window.filterDataByPeriod === 'function') {
      var originalFilterDataByPeriod = window.filterDataByPeriod;
      window.filterDataByPeriod = function () {
        var result = originalFilterDataByPeriod.apply(this, arguments);
        setTimeout(applyCommerceDashboardMetrics, 0);
        return result;
      };
    }

    if (typeof window.filterDataByShop === 'function') {
      var originalFilterDataByShop = window.filterDataByShop;
      window.filterDataByShop = function () {
        var result = originalFilterDataByShop.apply(this, arguments);
        setTimeout(applyCommerceDashboardMetrics, 0);
        return result;
      };
    }

    commercePatchInstalled = true;
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
  installCommerceDashboardPatch();

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
    installCommerceDashboardPatch();
    showLogin();
    setTimeout(recoverBlankScreen, 800);
    setTimeout(recoverBlankScreen, 2500);
  });
})();
