(function () {
  'use strict';

  var state = {
    apps: [],
    shops: [],
    lastError: null,
    authReady: false,
    installed: false
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
    return localStorage.getItem('supabase_url') || '';
  }

  function functionUrl(slug) {
    var url = getSupabaseUrl().replace(/\/+$/, '');
    return url ? url + '/functions/v1/' + slug : '';
  }

  function defaultRedirectUri() {
    return window.location.origin + window.location.pathname;
  }

  function setGlobalShops(shops) {
    state.shops = Array.isArray(shops) ? shops : [];
    try { userShops = state.shops; } catch (e) {}
    window.userShops = state.shops;
  }

  function setDefaultSyncUrl() {
    var syncUrl = functionUrl('shopee-sync');
    var input = byId('shopee-edge-url');
    if (!syncUrl) return;
    if (input && !input.value) input.value = syncUrl;
    try {
      if (!edgeFunctionUrl) edgeFunctionUrl = syncUrl;
      if (!localStorage.getItem('shopee_edge_url')) localStorage.setItem('shopee_edge_url', syncUrl);
    } catch (e) {}
  }

  function setStatus(message, type) {
    var box = byId('shopee-auth-inline-status');
    if (!box) return;
    if (!message) {
      box.className = 'jv-shopee-status';
      box.textContent = '';
      return;
    }
    box.className = 'jv-shopee-status is-visible ' + (type || 'info');
    box.textContent = message;
  }

  function buttonBusy(button, busyText) {
    if (!button) return function () {};
    var original = button.innerText;
    button.disabled = true;
    button.innerText = busyText;
    return function () {
      button.disabled = false;
      button.innerText = original;
    };
  }

  async function getSessionToken() {
    var client = getClient();
    if (!client || !client.auth) return '';
    var result = await client.auth.getSession();
    return result && result.data && result.data.session ? result.data.session.access_token : '';
  }

  async function authRequest(body, options) {
    var token = await getSessionToken();
    if (!token) {
      throw new Error('Para gerenciar apps e tokens Shopee, entre com uma sessão real do Supabase Auth. O login visual/demo não libera operações seguras.');
    }

    var url = functionUrl('shopee-auth');
    if (!url) throw new Error('Supabase URL não configurada.');

    var res = await fetch(url, {
      method: options && options.method ? options.method : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: body ? JSON.stringify(body) : undefined
    });
    var text = await res.text();
    var data = text ? JSON.parse(text) : {};
    if (!res.ok || data.ok === false) throw new Error(data.error || text || ('Erro HTTP ' + res.status));
    return data;
  }

  async function directFallbackShops() {
    var client = getClient();
    if (!client) return [];
    try {
      var result = await client
        .from('shopee_shops')
        .select('id,account_id,app_id,shop_id,shop_name,connection_status,region,token_expire_in,auth_expires_at,updated_at')
        .order('shop_name', { ascending: true });
      if (!result.error && result.data) return result.data;
    } catch (error) {}
    return [];
  }

  function appOptionsHtml(selectedId) {
    if (!state.apps.length) return '<option value="">Cadastre um app Shopee primeiro</option>';
    return state.apps.map(function (app) {
      var selected = String(app.id) === String(selectedId || '') ? ' selected' : '';
      return '<option value="' + escapeHtml(app.id) + '"' + selected + '>' + escapeHtml(app.app_name) + ' · Partner ' + escapeHtml(app.partner_id) + '</option>';
    }).join('');
  }

  function renderApps() {
    var list = byId('jv-shopee-apps-list');
    if (!list) return;
    if (!state.apps.length) {
      list.innerHTML = '<div class="jv-shopee-empty">Nenhum app Shopee cadastrado ainda. Cadastre o app da Open Platform aqui; o Partner Key fica salvo somente no Supabase privado.</div>';
    } else {
      list.innerHTML = state.apps.map(function (app) {
        return '<div class="jv-shopee-app-card">'
          + '<div class="jv-shopee-card-main">'
          + '<span class="jv-shopee-icon"><i data-lucide="key-round"></i></span>'
          + '<div><div class="jv-shopee-card-title">' + escapeHtml(app.app_name) + '</div>'
          + '<div class="jv-shopee-card-sub">Partner ID: ' + escapeHtml(app.partner_id) + ' · ' + escapeHtml(app.environment || 'live') + ' · ' + escapeHtml(app.app_type || 'seller_in_house') + '</div></div>'
          + '</div>'
          + '<span class="jv-shopee-badge ok">Ativo</span>'
          + '</div>';
      }).join('');
    }

    var selects = [byId('jv-shopee-app-select'), byId('jv-shopee-oauth-app-select')];
    selects.forEach(function (select) {
      if (!select) return;
      var current = select.value;
      select.innerHTML = appOptionsHtml(current);
      if (current && state.apps.some(function (app) { return String(app.id) === String(current); })) select.value = current;
    });

    var redirect = byId('jv-shopee-redirect-uri');
    if (redirect && !redirect.value) redirect.value = defaultRedirectUri();

    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  function statusBadge(shop) {
    if (shop.sync_ready && !shop.token_expired) return '<span class="jv-shopee-badge ok">Token ativo</span>';
    if (shop.sync_ready) return '<span class="jv-shopee-badge warn">Token a renovar</span>';
    return '<span class="jv-shopee-badge neutral">Sem token</span>';
  }

  function renderShopSelector() {
    var select = byId('select-shop');
    if (!select) return;
    var current = 'all';
    try { current = selectedShop || 'all'; } catch (e) { current = select.value || 'all'; }
    select.innerHTML = '<option value="all">Todas as Lojas (Consolidado)</option>';
    state.shops.forEach(function (shop) {
      var opt = document.createElement('option');
      opt.value = shop.shop_id;
      opt.innerText = (shop.shop_name || 'Loja Shopee') + ' (' + shop.shop_id + ')';
      if (String(current) === String(shop.shop_id)) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function renderShopsListSafe() {
    var container = byId('shopee-shops-list');
    if (!container) return;
    var shops = state.shops.length ? state.shops : (function () { try { return userShops || []; } catch (e) { return []; } })();

    if (!shops.length) {
      var message = state.lastError
        ? 'Existem dados da Shopee no Supabase, mas a gestão de conexão precisa de sessão Supabase Auth para ler apps/tokens com segurança.'
        : 'Nenhuma loja Shopee vinculada a um app ainda. Cadastre o app da Open Platform e gere a autorização da loja.';
      container.innerHTML = '<div class="jv-shopee-empty">' + escapeHtml(message) + '</div>';
      return;
    }

    container.innerHTML = '<div class="jv-shopee-shop-list">' + shops.map(function (shop) {
      var app = state.apps.find(function (item) { return String(item.id) === String(shop.app_id || ''); });
      var active = false;
      try { active = String(selectedShop) === String(shop.shop_id); } catch (e) {}
      return '<div class="jv-shopee-shop-card" style="' + (active ? 'border-color:hsl(var(--color-primary));' : '') + '">'
        + '<div class="jv-shopee-card-main">'
        + '<span class="jv-shopee-icon"><i data-lucide="store"></i></span>'
        + '<div><div class="jv-shopee-card-title">' + escapeHtml(shop.shop_name || 'Loja Shopee') + '</div>'
        + '<div class="jv-shopee-card-sub">Shop ID: ' + escapeHtml(shop.shop_id) + ' · App: ' + escapeHtml(app ? app.app_name : (shop.app_id ? 'App não carregado' : 'legado/manual')) + (shop.updated_at ? ' · Atualizado: ' + new Date(shop.updated_at).toLocaleDateString('pt-BR') : '') + '</div></div>'
        + '</div>'
        + '<div class="jv-shopee-row-actions">' + statusBadge(shop)
        + (active ? '<span class="jv-shopee-badge ok">Ativa</span>' : '<button class="btn-primary" style="width:auto;padding:7px 12px;background:rgba(255,255,255,0.05);border:1px solid hsl(var(--border-color));" onclick="filterDataByShop(\'' + escapeHtml(shop.shop_id) + '\')">Ativar</button>')
        + '<button class="btn-primary" style="width:auto;padding:7px 12px;background:linear-gradient(135deg,hsl(var(--color-danger)),#ff4f4f);" onclick="deleteShop(\'' + escapeHtml(shop.shop_id) + '\')">Desvincular</button>'
        + '</div></div>';
    }).join('') + '</div>';

    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  async function refreshResources(options) {
    setDefaultSyncUrl();
    try {
      var data = await authRequest(null, { method: 'GET' });
      state.apps = data.apps || [];
      state.lastError = null;
      state.authReady = true;
      setGlobalShops(data.shops || []);
      renderApps();
      renderShopSelector();
      renderShopsListSafe();
      if (!options || !options.silent) setStatus('Integração Shopee atualizada pelo Supabase.', 'ok');
      return true;
    } catch (error) {
      state.lastError = error.message;
      state.authReady = false;
      var fallback = await directFallbackShops();
      if (fallback.length) setGlobalShops(fallback);
      renderApps();
      renderShopSelector();
      renderShopsListSafe();
      if (!options || !options.silent) setStatus(error.message, 'error');
      return false;
    }
  }

  async function saveShopeeApp(event) {
    if (event) event.preventDefault();
    var button = byId('jv-save-shopee-app');
    var done = buttonBusy(button, 'Salvando...');
    try {
      var payload = {
        action: 'register-app',
        app_name: byId('jv-shopee-app-name').value.trim() || 'Shopee App',
        partner_id: byId('jv-shopee-partner-id').value.trim(),
        partner_key: byId('jv-shopee-partner-key').value.trim(),
        redirect_uri: byId('jv-shopee-redirect-uri').value.trim() || defaultRedirectUri(),
        environment: byId('jv-shopee-environment').value,
        base_url: byId('jv-shopee-base-url').value.trim() || 'https://partner.shopeemobile.com',
        ads_base_url: byId('jv-shopee-ads-base-url').value.trim() || 'https://openplatform.shopee.com.br',
        auth_base_url: byId('jv-shopee-auth-base-url').value.trim() || 'https://partner.shopeemobile.com'
      };
      if (!payload.partner_id || !payload.partner_key) throw new Error('Informe Partner ID e Partner Key.');
      var data = await authRequest(payload);
      byId('jv-shopee-partner-key').value = '';
      setStatus(data.message || 'App Shopee salvo.', 'ok');
      await refreshResources({ silent: true });
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      done();
    }
  }

  function parseAuthInput(value) {
    var result = { code: String(value || '').trim(), shop_id: '', state: '' };
    if (!result.code) return result;
    if (result.code.indexOf('?') >= 0 || result.code.indexOf('code=') >= 0) {
      try {
        var urlString = result.code.indexOf('http') === 0 ? result.code : 'https://callback.local/?' + result.code;
        var url = new URL(urlString);
        result.code = url.searchParams.get('code') || result.code;
        result.shop_id = url.searchParams.get('shop_id') || url.searchParams.get('shopid') || '';
        result.state = url.searchParams.get('state') || '';
      } catch (error) {}
    }
    return result;
  }

  async function openShopeeOAuthPatched(event) {
    if (event) event.preventDefault();
    var button = byId('btn-generate-oauth');
    var done = buttonBusy(button, 'Gerando...');
    try {
      var appId = byId('jv-shopee-app-select') ? byId('jv-shopee-app-select').value : '';
      if (!appId) throw new Error('Cadastre e selecione um app Shopee antes de gerar o link.');
      var shopName = byId('new-shop-name') ? byId('new-shop-name').value.trim() : '';
      var redirectInput = byId('jv-shopee-redirect-uri');
      var data = await authRequest({
        action: 'generate-oauth-url',
        app_id: appId,
        shop_name: shopName,
        redirect_uri: redirectInput && redirectInput.value ? redirectInput.value.trim() : defaultRedirectUri()
      });
      window.shopeeOauthUrl = data.oauthUrl;
      setStatus('Link de autorização gerado. A Shopee abrirá em uma nova aba.', 'ok');
      window.open(data.oauthUrl, '_blank');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      done();
    }
  }

  async function executeConnectShopPatched() {
    var button = byId('btn-connect-shop-execute');
    var done = buttonBusy(button, 'Vinculando...');
    try {
      var appId = byId('jv-shopee-app-select') ? byId('jv-shopee-app-select').value : '';
      var shopName = byId('new-shop-name') ? byId('new-shop-name').value.trim() : '';
      var shopId = byId('new-shop-id') ? byId('new-shop-id').value.trim() : '';
      var manualSection = byId('manual-tokens-section');
      var isManual = manualSection && manualSection.style.display === 'block';

      if (!shopName) throw new Error('Informe um nome/apelido para a loja.');

      if (isManual) {
        await authRequest({
          action: 'link-manual-shop',
          app_id: appId || null,
          shop_name: shopName,
          shop_id: shopId,
          access_token: byId('new-shop-access').value.trim(),
          refresh_token: byId('new-shop-refresh').value.trim()
        });
      } else {
        var parsed = parseAuthInput(byId('new-shop-code') ? byId('new-shop-code').value : '');
        if (!parsed.code) throw new Error('Insira o código de autorização ou cole a URL de retorno completa.');
        await authRequest({
          action: 'auth-shop',
          app_id: appId || null,
          shop_name: shopName,
          shop_id: parsed.shop_id || shopId || null,
          state: parsed.state || null,
          code: parsed.code
        });
      }

      ['new-shop-name', 'new-shop-id', 'new-shop-code', 'new-shop-access', 'new-shop-refresh'].forEach(function (id) {
        var el = byId(id);
        if (el) el.value = '';
      });
      setStatus('Loja Shopee vinculada com sucesso.', 'ok');
      await refreshResources({ silent: true });
      if (typeof window.loadAllData === 'function') window.loadAllData();
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      done();
    }
  }

  async function deleteShopPatched(shopId) {
    try {
      await authRequest({ action: 'unlink-shop', shop_id: shopId });
      if (String((function () { try { return selectedShop; } catch (e) { return ''; } })()) === String(shopId)) {
        try { selectedShop = 'all'; } catch (e) {}
      }
      setStatus('Loja Shopee desvinculada.', 'ok');
      await refreshResources({ silent: true });
      if (typeof window.loadAllData === 'function') window.loadAllData();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function handleOAuthCallbackIfPresent() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    if (!code || window.__jvShopeeOAuthHandled) return;
    window.__jvShopeeOAuthHandled = true;
    try {
      await authRequest({
        action: 'auth-shop',
        code: code,
        state: params.get('state') || null,
        shop_id: params.get('shop_id') || null
      });
      setStatus('Retorno OAuth processado e loja vinculada.', 'ok');
      window.history.replaceState({}, document.title, window.location.pathname);
      await refreshResources({ silent: true });
    } catch (error) {
      setStatus('Retorno OAuth detectado, mas não foi possível concluir: ' + error.message, 'error');
    }
  }

  function installPanel() {
    if (state.installed) return;
    var view = byId('shopee-sync-view');
    if (!view) return;
    var mainPanel = view.querySelector('.panel-card');
    if (!mainPanel || byId('shopee-multi-app-panel')) return;

    setDefaultSyncUrl();

    var panel = document.createElement('div');
    panel.id = 'shopee-multi-app-panel';
    panel.className = 'jv-shopee-panel';
    panel.innerHTML = '<div class="jv-shopee-panel-head">'
      + '<div><h4>Apps Shopee Open Platform</h4><div class="jv-shopee-muted">Cadastre um app por conta Shopee. O Partner Key não fica no GitHub nem no navegador; ele é enviado direto para uma Edge Function e salvo no schema privado do Supabase.</div></div>'
      + '<button class="btn-primary" id="jv-refresh-shopee-auth" style="width:auto;padding:9px 14px;">Atualizar</button>'
      + '</div>'
      + '<div id="shopee-auth-inline-status" class="jv-shopee-status"></div>'
      + '<div id="jv-shopee-apps-list" class="jv-shopee-app-list"></div>'
      + '<div class="jv-shopee-grid">'
      + '<div class="jv-shopee-field"><label for="jv-shopee-app-name">Nome do app</label><input id="jv-shopee-app-name" placeholder="Ex: JV Imports Shopee Principal"></div>'
      + '<div class="jv-shopee-field"><label for="jv-shopee-partner-id">Partner ID</label><input id="jv-shopee-partner-id" inputmode="numeric" placeholder="Informe o Partner ID"></div>'
      + '<div class="jv-shopee-field"><label for="jv-shopee-partner-key">Partner Key</label><input id="jv-shopee-partner-key" type="password" autocomplete="off" placeholder="Colar apenas aqui, nunca no GitHub"></div>'
      + '<div class="jv-shopee-field"><label for="jv-shopee-redirect-uri">Redirect URL</label><input id="jv-shopee-redirect-uri" placeholder="URL cadastrada no app da Shopee"></div>'
      + '</div>'
      + '<details class="jv-shopee-advanced"><summary>Opções avançadas de endpoint</summary>'
      + '<div class="jv-shopee-grid-3">'
      + '<div class="jv-shopee-field"><label for="jv-shopee-environment">Ambiente</label><select id="jv-shopee-environment"><option value="live">Live</option><option value="sandbox">Sandbox</option></select></div>'
      + '<div class="jv-shopee-field"><label for="jv-shopee-base-url">Base API</label><input id="jv-shopee-base-url" value="https://partner.shopeemobile.com"></div>'
      + '<div class="jv-shopee-field"><label for="jv-shopee-auth-base-url">Base OAuth</label><input id="jv-shopee-auth-base-url" value="https://partner.shopeemobile.com"></div>'
      + '<div class="jv-shopee-field"><label for="jv-shopee-ads-base-url">Base Ads API</label><input id="jv-shopee-ads-base-url" value="https://openplatform.shopee.com.br"></div>'
      + '</div></details>'
      + '<div class="jv-shopee-inline-actions" style="margin-top:16px;"><button class="btn-primary" id="jv-save-shopee-app" style="width:auto;padding:10px 18px;">Salvar app Shopee</button></div>';

    var edgeGroup = byId('shopee-edge-url');
    if (edgeGroup && edgeGroup.closest('.form-group')) {
      edgeGroup.closest('.form-group').insertAdjacentElement('afterend', panel);
    } else {
      mainPanel.insertBefore(panel, mainPanel.firstChild);
    }

    var addContainer = byId('add-shop-container');
    if (addContainer && !byId('jv-shopee-app-select')) {
      var selectorWrap = document.createElement('div');
      selectorWrap.className = 'jv-shopee-field';
      selectorWrap.style.marginBottom = '14px';
      selectorWrap.innerHTML = '<label for="jv-shopee-app-select">App Shopee usado na autorização</label><select id="jv-shopee-app-select"></select><div class="jv-shopee-muted">Para contas separadas, selecione o app criado para aquela conta antes de gerar o link OAuth.</div>';
      var firstGrid = addContainer.querySelector('div[style*="grid-template-columns"]');
      addContainer.insertBefore(selectorWrap, firstGrid || addContainer.firstChild.nextSibling);
    }

    byId('jv-save-shopee-app').addEventListener('click', saveShopeeApp);
    byId('jv-refresh-shopee-auth').addEventListener('click', function () { refreshResources(); });

    state.installed = true;
    patchGlobals();
    renderApps();
    refreshResources({ silent: true });
    handleOAuthCallbackIfPresent();
  }

  function patchGlobals() {
    if (window.__jvShopeeMultiAppPatched) return;
    window.__jvShopeeMultiAppPatched = true;

    var originalFetchUserShops = window.fetchUserShops;
    window.fetchUserShops = async function () {
      var ok = await refreshResources({ silent: true });
      if (!ok && typeof originalFetchUserShops === 'function') return originalFetchUserShops.apply(this, arguments);
    };

    window.renderShopsList = renderShopsListSafe;
    window.openShopeeOAuth = openShopeeOAuthPatched;
    window.executeConnectShop = executeConnectShopPatched;
    window.deleteShop = deleteShopPatched;
  }

  window.jvShopeeMultiApp = {
    refresh: refreshResources,
    install: installPanel,
    state: state
  };

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(installPanel, 0);
    setTimeout(installPanel, 700);
    setTimeout(function () { refreshResources({ silent: true }); }, 1600);
  });
})();
