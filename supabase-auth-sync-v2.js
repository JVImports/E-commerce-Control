(function () {
  'use strict';

  var VERSION = '20260710-release-hardening';
  var SYNC_SLUG = 'shopee-sync-v2';
  var state = {
    shops: [],
    lastStatus: null,
    lastError: null,
    busy: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getClient() {
    try { if (supabaseClient) return supabaseClient; } catch (e) {}
    return window.supabaseClient || null;
  }

  function getSupabaseUrl() {
    try { if (supabaseUrl) return String(supabaseUrl); } catch (e) {}
    return String((window.MAVIS_RUNTIME_CONFIG || {}).supabaseUrl || '');
  }

  function getFunctionUrl(slug) {
    var base = getSupabaseUrl().replace(/\/+$/, '');
    return base ? base + '/functions/v1/' + slug : '';
  }

  function getSyncUrl() {
    var preferred = getFunctionUrl(SYNC_SLUG);
    return preferred;
  }

  function setDefaultSyncV2Url() {
    var url = getFunctionUrl(SYNC_SLUG);
    if (!url) return;
    try { edgeFunctionUrl = url; } catch (e) {}
  }

  async function getSessionToken() {
    var client = getClient();
    if (!client || !client.auth) return '';
    var result = await client.auth.getSession();
    return result && result.data && result.data.session ? result.data.session.access_token : '';
  }

  async function getSessionUser() {
    var client = getClient();
    if (!client || !client.auth) return null;
    var result = await client.auth.getSession();
    return result && result.data && result.data.session ? result.data.session.user : null;
  }

  function hasSupabaseCredentials() {
    var config = window.MAVIS_RUNTIME_CONFIG || {};
    return Boolean(config.supabaseUrl && config.publishableKey);
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
    box.className = 'jv-inline-message ' + (type || 'info');
    box.innerText = message;
    form.appendChild(box);
  }

  function showLogin() {
    var app = byId('app-container');
    var login = byId('login-container');
    if (app) app.style.display = 'none';
    if (login) login.style.display = 'flex';
    var subtitle = byId('login-subtitle');
    if (subtitle) subtitle.innerText = 'Entre com o acesso recebido por convite.';
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  function showSetup() {
    var app = byId('app-container');
    var login = byId('login-container');
    var setup = byId('setup-view');
    if (app) app.style.display = 'flex';
    if (login) login.style.display = 'none';
    document.querySelectorAll('.view-section').forEach(function (view) { view.classList.remove('active'); });
    if (setup) setup.classList.add('active');
    if (typeof window.switchView === 'function') window.switchView('setup');
  }

  async function showDashboard(user) {
    var app = byId('app-container');
    var login = byId('login-container');
    if (login) login.style.display = 'none';
    if (app) app.style.display = 'flex';
    if (typeof window.fetchUserShops === 'function') {
      try { await window.fetchUserShops(); } catch (e) {}
    }
    if (typeof window.loadAllData === 'function') {
      try { await window.loadAllData(); } catch (e) { console.warn('loadAllData failed after login', e); }
    }
    var reviewMode = new URLSearchParams(window.location.search).get('review') === 'shopee';
    if (typeof window.switchView === 'function') window.switchView(reviewMode ? 'shopee-sync' : 'dashboard');
    refreshUserChrome(user);
  }

  function clearLegacyDemoSession() {
    ['jv_demo_logged_in', 'jv_demo_user_role', 'jv_demo_user_name'].forEach(function (key) {
      sessionStorage.removeItem(key);
    });
  }

  function refreshUserChrome(user) {
    var profileName = document.querySelector('.profile-name');
    var profileRole = document.querySelector('.profile-role');
    var avatar = document.querySelector('.avatar');
    var metadata = user && user.app_metadata ? user.app_metadata : {};
    var userMetadata = user && user.user_metadata ? user.user_metadata : {};
    var name = userMetadata.full_name || userMetadata.name || (user && user.email) || 'Usuário Mavix Hub';
    var role = String(metadata.role || metadata.account_role || 'autenticado').toUpperCase();
    if (profileName) profileName.innerText = name;
    if (profileRole) profileRole.innerText = role;
    if (avatar) avatar.innerText = name.slice(0, 2).toUpperCase();
    var isReadOnly = role === 'CLIENT';
    document.querySelectorAll('[onclick*="switchView(\'importer\'"]')
      .forEach(function (item) { item.style.display = isReadOnly ? 'none' : ''; });
    var importer = byId('importer-view');
    if (importer) importer.dataset.readOnlyRestricted = isReadOnly ? 'true' : 'false';
    if (user && user.email) sessionStorage.setItem('jv_auth_user_email', user.email);
  }

  async function trySupabasePasswordLogin(email, password) {
    var client = getClient();
    if (!client || !client.auth || !email || !password) return null;
    var result = await client.auth.signInWithPassword({ email: String(email).trim(), password: password });
    if (result.error) throw result.error;
    return result.data && result.data.session ? result.data.session : null;
  }

  window.executeAuth = async function () {
    var emailInput = byId('login-email');
    var passwordInput = byId('login-password');
    var button = byId('btn-login-execute');
    var email = emailInput ? emailInput.value.trim() : '';
    var password = passwordInput ? passwordInput.value : '';
    setLoginMessage('', 'error');
    if (!email || !password) return setLoginMessage('Informe e-mail e senha para continuar.', 'error');
    if (!hasSupabaseCredentials()) return setLoginMessage('Configure a URL e a chave pública do Supabase antes de entrar.', 'error');
    if (button) { button.disabled = true; button.innerText = 'Validando acesso...'; }

    try {
      var session = await trySupabasePasswordLogin(email, password);
      if (!session) throw new Error('O Supabase não retornou uma sessão válida.');
      clearLegacyDemoSession();
      sessionStorage.setItem('jv_real_supabase_auth', 'true');
      setLoginMessage('Sessão validada. Carregando painel...', 'success');
      refreshUserChrome(session.user);
      document.documentElement.dataset.mavisBootState = 'authenticated';
      window.dispatchEvent(new CustomEvent('mavis:auth-changed', { detail: { user: session.user } }));
      setTimeout(function () { showDashboard(session.user); }, 200);
    } catch (error) {
      sessionStorage.removeItem('jv_real_supabase_auth');
      setLoginMessage(error.message || 'Falha ao validar o acesso.', 'error');
    } finally {
      if (button) { button.disabled = false; button.innerText = 'Entrar no Painel'; }
    }
  };

  window.logout = async function () {
    clearLegacyDemoSession();
    sessionStorage.removeItem('jv_real_supabase_auth');
    sessionStorage.removeItem('jv_auth_user_email');
    var client = getClient();
    if (client && client.auth) {
      try { await client.auth.signOut(); } catch (e) { console.warn('SignOut failed:', e); }
    }
    showLogin();
    document.documentElement.dataset.mavisBootState = 'unauthenticated';
    window.dispatchEvent(new CustomEvent('mavis:auth-expired'));
  };

  function ensureSyncPanel() {
    if (window.mavisIntegrations || window.jvShopeeThirdParty) return;
    var view = byId('shopee-sync-view');
    if (!view || byId('jv-sync-v2-panel')) return;
    var health = byId('sync-health-cards');
    var panel = document.createElement('div');
    panel.id = 'jv-sync-v2-panel';
    panel.className = 'jv-shopee-panel jv-sync-v2-panel';
    panel.innerHTML = ''
      + '<div class="jv-shopee-panel-head">'
      + '<div><h4>Sincronização Segura Shopee v2</h4><div class="jv-shopee-muted">Usa a loja selecionada, JWT do Supabase Auth e credenciais Shopee salvas somente no backend.</div></div>'
      + '<span class="jv-shopee-badge neutral" id="jv-sync-v2-auth-badge">Verificando sessão</span>'
      + '</div>'
      + '<div id="jv-sync-v2-status" class="jv-shopee-status"></div>'
      + '<div class="jv-shopee-grid-3 jv-sync-v2-controls">'
      + '<div class="jv-shopee-field"><label for="jv-sync-v2-shop">Loja para sincronizar</label><select id="jv-sync-v2-shop"></select></div>'
      + '<div class="jv-shopee-field"><label for="jv-sync-v2-days">Janela de Ads por produto</label><select id="jv-sync-v2-days"><option value="7">7 dias</option><option value="15">15 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option></select></div>'
      + '<div class="jv-shopee-field"><label for="jv-sync-v2-url">Endpoint usado</label><input id="jv-sync-v2-url" readonly></div>'
      + '</div>'
      + '<div class="jv-shopee-inline-actions jv-sync-v2-actions">'
      + '<button class="btn-primary" data-jv-sync-action="status" style="width:auto;padding:9px 14px;">Testar Conexão</button>'
      + '<button class="btn-primary" data-jv-sync-action="refresh-token" style="width:auto;padding:9px 14px;">Renovar Token</button>'
      + '<button class="btn-primary" data-jv-sync-action="sync-catalog" style="width:auto;padding:9px 14px;">Sincronizar Catálogo</button>'
      + '<button class="btn-primary" data-jv-sync-action="open-ads-import" style="width:auto;padding:9px 14px;">Importar relatório de Ads</button>'
      + '</div>';

    if (health) health.insertAdjacentElement('beforebegin', panel);
    else {
      var panelCard = view.querySelector('.panel-card');
      if (!panelCard) return;
      panelCard.appendChild(panel);
    }

    panel.addEventListener('click', function (event) {
      var button = event.target.closest('[data-jv-sync-action]');
      if (!button) return;
      var action = button.getAttribute('data-jv-sync-action');
      if (action === 'open-ads-import') {
        if (typeof window.switchView === 'function') window.switchView('anuncios');
        window.setTimeout(function () {
          var panel = document.getElementById('jv-ads-import-panel');
          if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
        return;
      }
      window.triggerShopeeSync(action, button);
    });
  }

  function setSyncStatus(message, type) {
    var box = byId('jv-sync-v2-status') || byId('shopee-auth-inline-status');
    if (!box) return;
    if (!message) {
      box.className = 'jv-shopee-status';
      box.textContent = '';
      return;
    }
    box.className = 'jv-shopee-status is-visible ' + (type || 'info');
    box.textContent = message;
  }

  function setAuthBadge(realAuth) {
    var badge = byId('jv-sync-v2-auth-badge');
    if (!badge) return;
    if (realAuth) {
      badge.className = 'jv-shopee-badge ok';
      badge.innerText = 'Sessão Supabase ativa';
    } else {
      badge.className = 'jv-shopee-badge warn';
      badge.innerText = 'Modo visual sem JWT';
    }
  }

  function getKnownShops() {
    var shops = [];
    if (state.shops && state.shops.length) shops = state.shops;
    else if (window.jvShopeeMultiApp && window.jvShopeeMultiApp.state && window.jvShopeeMultiApp.state.shops) shops = window.jvShopeeMultiApp.state.shops;
    else {
      try { shops = userShops || []; } catch (e) { shops = window.userShops || []; }
    }
    return Array.isArray(shops) ? shops : [];
  }

  function renderShopOptions(shops) {
    var select = byId('jv-sync-v2-shop');
    if (!select) return;
    var previous = select.value;
    var currentGlobal = 'all';
    try { currentGlobal = selectedShop || 'all'; } catch (e) {}
    select.innerHTML = '';
    if (!shops.length) {
      select.innerHTML = '<option value="">Nenhuma loja conectada</option>';
      return;
    }
    shops.forEach(function (shop) {
      var opt = document.createElement('option');
      opt.value = shop.shop_id || shop.shopId;
      opt.textContent = (shop.shop_name || shop.shopName || 'Loja Shopee') + ' (' + opt.value + ')';
      select.appendChild(opt);
    });
    if (previous && shops.some(function (shop) { return String(shop.shop_id || shop.shopId) === String(previous); })) select.value = previous;
    else if (currentGlobal !== 'all' && shops.some(function (shop) { return String(shop.shop_id || shop.shopId) === String(currentGlobal); })) select.value = currentGlobal;
    else select.value = String(shops[0].shop_id || shops[0].shopId || '');
  }

  function syncGlobalShops(shops) {
    state.shops = Array.isArray(shops) ? shops.map(function (shop) {
      return {
        shop_id: shop.shop_id || shop.shopId,
        shop_name: shop.shop_name || shop.shopName || 'Loja Shopee',
        connection_status: shop.connection_status || shop.connectionStatus || '',
        token_expire_in: shop.token_expire_in || shop.tokenExpireIn || '',
        auth_expires_at: shop.auth_expires_at || shop.authExpiresAt || '',
        updated_at: shop.updated_at || shop.updatedAt || ''
      };
    }) : [];
    try { userShops = state.shops; } catch (e) {}
    window.userShops = state.shops;
    renderShopOptions(state.shops);
  }

  async function invokeSyncV2(payload) {
    var token = await getSessionToken();
    if (!token) throw new Error('Sessão Supabase Auth ausente. Entre com um usuário real do Supabase para executar sincronização.');
    var url = getSyncUrl();
    if (!url) throw new Error('URL da Edge Function não configurada.');
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload || { action: 'status' })
    });
    var text = await res.text();
    var data = text ? JSON.parse(text) : {};
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || text || ('Erro HTTP ' + res.status));
    return data;
  }

  async function refreshV2Status(options) {
    ensureSyncPanel();
    setDefaultSyncV2Url();
    var urlInput = byId('jv-sync-v2-url');
    if (urlInput) urlInput.value = getSyncUrl();

    var token = await getSessionToken();
    setAuthBadge(Boolean(token));
    if (!token) {
      syncGlobalShops(getKnownShops());
      if (!options || !options.silent) setSyncStatus('Modo visual ativo. Os dados podem ser visualizados, mas sincronização segura exige login Supabase Auth.', 'error');
      return false;
    }

    try {
      var data = await invokeSyncV2({ action: 'status' });
      state.lastStatus = data;
      if (data.shops) syncGlobalShops(data.shops);
      setSyncStatus('Conexão v2 validada. Lojas encontradas: ' + (state.shops.length || 0) + '.', 'ok');
      return true;
    } catch (error) {
      state.lastError = error.message;
      syncGlobalShops(getKnownShops());
      setSyncStatus(error.message, 'error');
      return false;
    }
  }

  function getSelectedSyncShopId() {
    var select = byId('jv-sync-v2-shop');
    if (select && select.value) return select.value;
    try { if (selectedShop && selectedShop !== 'all') return selectedShop; } catch (e) {}
    var shops = getKnownShops();
    return shops.length === 1 ? String(shops[0].shop_id || shops[0].shopId) : '';
  }

  function actionOptions(action) {
    var payload = { action: action };
    if (action !== 'status') {
      var shopId = getSelectedSyncShopId();
      if (!shopId) throw new Error('Selecione uma loja específica para sincronizar.');
      payload.shop_id = Number(shopId);
    } else {
      var selected = getSelectedSyncShopId();
      if (selected) payload.shop_id = Number(selected);
    }
    if (action === 'sync-product-ads') {
      var days = byId('jv-sync-v2-days');
      payload.days = Number(days && days.value ? days.value : 30);
    }
    return payload;
  }

  function renderModulesFromLogs(logs) {
    var tbody = byId('sync-modules-tbody');
    if (!tbody) return;
    var modules = [
      { id: 'status', name: 'Conexão OAuth / Token', action: 'status', supported: true },
      { id: 'products', name: 'Produtos do Catálogo', action: 'sync-products', supported: true },
      { id: 'variations', name: 'Variações do Catálogo', action: 'sync-variations', supported: true },
      { id: 'catalog', name: 'Catálogo Completo', action: 'sync-catalog', supported: true },
      { id: 'ads_product', name: 'Ads por Produto', action: 'open-ads-import', supported: false, reason: 'Importe o relatório manualmente na aba Anúncios.' },
      { id: 'orders', name: 'Pedidos e Financeiro', action: 'sync-financial', supported: false, reason: 'Aguarda migração de chaves por loja' },
      { id: 'ads_daily', name: 'Ads Diário Agregado', action: 'sync-ads-daily-step', supported: false, reason: 'Aguarda chave composta por loja' }
    ];
    tbody.innerHTML = modules.map(function (module) {
      var latest = (logs || []).find(function (log) { return log.module === module.id || log.module === module.action || (module.id === 'catalog' && (log.module === 'products' || log.module === 'variations')); });
      var lastSync = latest && latest.created_at ? new Date(latest.created_at).toLocaleString('pt-BR') : 'Nunca';
      var statusText = latest ? latest.status : (module.supported ? 'Pronto' : 'Bloqueado');
      var statusClass = latest && latest.status === 'SUCCESS' ? 'ok' : latest && latest.status === 'ERROR' ? 'error' : module.supported ? 'neutral' : 'warn';
      var button = module.supported
        ? '<button class="btn-primary" style="padding:6px 12px;font-size:0.8rem;width:auto;" onclick="triggerShopeeSync(\'' + module.action + '\', this)">Executar</button>'
        : '<button class="btn-primary" disabled title="' + escapeHtml(module.reason) + '" style="padding:6px 12px;font-size:0.8rem;width:auto;opacity:.55;cursor:not-allowed;">Pendente</button>';
      return '<tr>'
        + '<td><b>' + escapeHtml(module.name) + '</b><div class="jv-shopee-muted">' + escapeHtml(module.supported ? module.action : module.reason) + '</div></td>'
        + '<td>' + escapeHtml(lastSync) + '</td>'
        + '<td><span class="jv-shopee-badge ' + statusClass + '">' + escapeHtml(statusText) + '</span></td>'
        + '<td>' + button + '</td>'
        + '</tr>';
    }).join('');
  }

  async function fetchLogs() {
    var client = getClient();
    if (!client) return [];
    try {
      var query = client.from('sync_log').select('*').order('created_at', { ascending: false }).limit(50);
      var result = await query;
      if (result.error) throw result.error;
      return result.data || [];
    } catch (error) {
      console.warn('Erro ao buscar logs de sync', error);
      return [];
    }
  }

  async function renderLogsAndModules() {
    var logs = await fetchLogs();
    renderModulesFromLogs(logs);
    var tbody = byId('sync-logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = (logs || []).slice(0, 15).map(function (log) {
      var statusClass = log.status === 'SUCCESS' ? 'ok' : log.status === 'ERROR' ? 'error' : 'warn';
      return '<tr>'
        + '<td>' + escapeHtml(log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : '-') + '</td>'
        + '<td><b>' + escapeHtml(log.module || '-') + '</b></td>'
        + '<td><span class="jv-shopee-badge ' + statusClass + '">' + escapeHtml(log.status || '-') + '</span></td>'
        + '<td style="font-size:.8rem;">' + escapeHtml(log.message || '-') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="4" class="empty-placeholder">Nenhum log encontrado.</td></tr>';
  }

  window.fetchSyncLogsAndModules = renderLogsAndModules;
  window.fetchSyncHealth = refreshV2Status;

  var originalInitShopeeSync = window.initShopeeSync;
  window.initShopeeSync = async function () {
    setDefaultSyncV2Url();
    ensureSyncPanel();
    if (typeof originalInitShopeeSync === 'function') {
      try { await originalInitShopeeSync.apply(this, arguments); } catch (e) { console.warn('initShopeeSync legado falhou', e); }
    }
    await refreshV2Status({ silent: true });
    await renderLogsAndModules();
  };

  window.saveEdgeUrl = function () {
    var input = byId('shopee-edge-url');
    var url = input ? input.value.trim() : '';
    if (!url) url = getFunctionUrl(SYNC_SLUG);
    if (!url) return setSyncStatus('Configure a URL do Supabase antes de salvar o endpoint.', 'error');
    localStorage.setItem('shopee_edge_url', url);
    try { edgeFunctionUrl = url; } catch (e) {}
    var v2Url = byId('jv-sync-v2-url');
    if (v2Url) v2Url.value = url;
    setSyncStatus('Endpoint salvo para sincronização.', 'ok');
  };

  window.triggerShopeeSync = async function (action, button) {
    ensureSyncPanel();
    if (state.busy) return;
    var originalText = button ? button.innerText : '';
    state.busy = true;
    if (button) { button.disabled = true; button.innerText = 'Executando...'; }
    setSyncStatus('Executando ' + action + '...', 'info');

    try {
      var data = await invokeSyncV2(actionOptions(action));
      setSyncStatus('Ação ' + action + ' concluída com sucesso.', 'ok');
      if (data.shops) syncGlobalShops(data.shops);
      await renderLogsAndModules();
      if (typeof window.loadAllData === 'function' && action !== 'status') {
        setTimeout(function () { window.loadAllData(); }, 600);
      }
    } catch (error) {
      setSyncStatus(error.message, 'error');
    } finally {
      state.busy = false;
      if (button) { button.disabled = false; button.innerText = originalText; }
    }
  };

  async function hydrate() {
    clearLegacyDemoSession();
    setDefaultSyncV2Url();
    var user = await getSessionUser();
    if (!user) {
      sessionStorage.removeItem('jv_real_supabase_auth');
      showLogin();
      return;
    }
    sessionStorage.setItem('jv_real_supabase_auth', 'true');
    refreshUserChrome(user);
    var appRole = String((user.app_metadata || {}).role || (user.app_metadata || {}).account_role || '').toUpperCase();
    if (appRole !== 'CLIENT') ensureSyncPanel();
    await refreshV2Status({ silent: true });
    await renderLogsAndModules();
  }

  window.jvAuthSyncV2 = {
    hydrate: hydrate,
    refresh: refreshV2Status,
    renderLogsAndModules: renderLogsAndModules,
    version: VERSION
  };

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(hydrate, 400);
    setTimeout(hydrate, 1600);
  });
})();
