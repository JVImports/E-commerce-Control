(function () {
  'use strict';

  var STORAGE_KEY = 'jv_shopee_oauth_callback';
  var ERROR_KEY = 'jv_shopee_oauth_callback_error';
  var maxAttempts = 16;

  function byId(id) {
    return document.getElementById(id);
  }

  function getClient() {
    try { if (supabaseClient) return supabaseClient; } catch (e) {}
    return window.supabaseClient || null;
  }

  function getSupabaseUrl() {
    try { if (supabaseUrl) return String(supabaseUrl); } catch (e) {}
    return localStorage.getItem('supabase_url') || '';
  }

  function getStoredApps() {
    return window.jvShopeeMultiApp && window.jvShopeeMultiApp.state
      ? (window.jvShopeeMultiApp.state.apps || [])
      : [];
  }

  function currentPageRedirect() {
    return window.location.origin + window.location.pathname;
  }

  function selectedShopeeApp() {
    var apps = getStoredApps();
    var select = byId('jv-shopee-app-select');
    var selectedId = select ? select.value : '';
    return apps.find(function (app) { return String(app.id) === String(selectedId); }) || apps.find(function (app) { return app.status === 'active' && app.redirect_uri; }) || apps[0] || null;
  }

  function syncRedirectField() {
    var input = byId('jv-shopee-redirect-uri');
    if (!input) return;
    var app = selectedShopeeApp();
    var preferred = app && app.redirect_uri ? app.redirect_uri : '';
    if (!preferred) return;
    var current = String(input.value || '').trim();
    if (!current || current === currentPageRedirect()) input.value = preferred;
  }

  function setStatus(message, type) {
    var box = byId('shopee-auth-inline-status');
    if (!box) return;
    box.className = 'jv-shopee-status is-visible ' + (type || 'info');
    box.textContent = message;
  }

  async function getSessionToken() {
    var client = getClient();
    if (!client || !client.auth) return '';
    var result = await client.auth.getSession();
    return result && result.data && result.data.session ? result.data.session.access_token : '';
  }

  function parseStoredCallback() {
    var search = sessionStorage.getItem(STORAGE_KEY) || '';
    if (!search) return null;
    var params = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
    var code = params.get('code');
    if (!code) return null;
    return {
      code: code,
      state: params.get('state') || null,
      shop_id: params.get('shop_id') || null
    };
  }

  async function postCallback(payload, token) {
    var baseUrl = getSupabaseUrl().replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Supabase URL não configurada.');
    var response = await fetch(baseUrl + '/functions/v1/shopee-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(Object.assign({ action: 'auth-shop' }, payload))
    });
    var text = await response.text();
    var data = text ? JSON.parse(text) : {};
    if (!response.ok || data.ok === false) throw new Error(data.error || text || ('Erro HTTP ' + response.status));
    return data;
  }

  async function processCallback(attempt) {
    var payload = parseStoredCallback();
    if (!payload) return;

    var token = await getSessionToken();
    if (!token) {
      if (attempt >= maxAttempts) {
        setStatus('Retorno OAuth da Shopee detectado. Entre com uma sessão real do Supabase Auth para concluir a vinculação.', 'error');
      } else {
        setTimeout(function () { processCallback(attempt + 1); }, 500);
      }
      return;
    }

    try {
      setStatus('Concluindo autorização da Shopee...', 'info');
      await postCallback(payload, token);
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(ERROR_KEY);
      setStatus('Loja Shopee vinculada com sucesso.', 'ok');
      if (window.jvShopeeMultiApp && typeof window.jvShopeeMultiApp.refresh === 'function') {
        await window.jvShopeeMultiApp.refresh({ silent: true });
      }
      if (typeof window.loadAllData === 'function') window.loadAllData();
    } catch (error) {
      sessionStorage.setItem(ERROR_KEY, error.message);
      sessionStorage.removeItem(STORAGE_KEY);
      setStatus('Falha ao concluir OAuth da Shopee: ' + error.message, 'error');
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { processCallback(0); }, 300);
    setTimeout(function () {
      var message = sessionStorage.getItem(ERROR_KEY);
      if (message) setStatus('Falha ao concluir OAuth da Shopee: ' + message, 'error');
    }, 1200);
    setTimeout(syncRedirectField, 800);
    setTimeout(syncRedirectField, 1800);
    document.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'jv-shopee-app-select') syncRedirectField();
    });
  });
})();
